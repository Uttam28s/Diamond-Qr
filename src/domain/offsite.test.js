/**
 * The off-site copy, against real folders on disk.
 *
 * The rules being enforced are mostly about restraint: the folder belongs to the
 * user, and the only thing worse than not having a backup is a backup feature
 * that deletes something of theirs.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const { createFileStore } = require("../../public/db/fileStore");
const { mirrorBackup, mirrorStatus, folderForDevice, FOLDER_NAME } = require("../../public/db/offsite");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "diamond-qr-offsite-"));

const storeWithData = (dir) => {
  const store = createFileStore({ dir: path.join(dir, "data") });
  store.load();
  store.save({
    schema: 3,
    kapans: { k1: { id: "k1", number: "41", season: "25-26" } },
    lots: { l1: { id: "l1", kapanId: "k1", lotNo: 1, pcs: 7 } },
    packets: { p1: { id: "p1", kapanId: "k1", lotId: "l1", rawCode: "DQR-1" } },
  });
  return store;
};

describe("the off-site copy", () => {
  let home;
  let drive;

  beforeEach(() => {
    home = tempDir();
    drive = tempDir();
  });

  it("copies the backup into its own per-device subfolder", () => {
    const store = storeWithData(home);
    const file = store.backup();

    const result = mirrorBackup({ file, folder: drive, deviceName: "ST-1" });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.path).toContain(path.join(FOLDER_NAME, "ST-1"));

    // And it is the real thing, not an empty file.
    const copied = JSON.parse(fs.readFileSync(result.path, "utf8"));
    expect(copied.data.kapans.k1.number).toBe("41");
    expect(copied.data.lots.l1.pcs).toBe(7);
  });

  /**
   * Two PCs backing up into the same Drive account must not overwrite each other.
   * The file names are dates, so without this a host and a standalone would take
   * turns clobbering a day's backup with entirely different data.
   */
  it("keeps two computers' copies apart", () => {
    const first = storeWithData(home);
    const office = mirrorBackup({ file: first.backup(), folder: drive, deviceName: "Office PC" });
    const station = mirrorBackup({ file: first.backup(), folder: drive, deviceName: "ST-1" });

    expect(path.dirname(office.path)).not.toBe(path.dirname(station.path));
    expect(fs.existsSync(office.path)).toBe(true);
    expect(fs.existsSync(station.path)).toBe(true);
  });

  /**
   * The device name is typed by whoever sets the PC up, and it decides a folder
   * name in a directory where prune() deletes files. A name carrying a separator
   * or a relative step must not be able to point that anywhere else.
   */
  it("cannot be steered out of its own folder by the device name", () => {
    const store = storeWithData(home);
    const backups = path.join(drive, FOLDER_NAME);

    [
      "ST\\..\\evil",
      "../../etc",
      "..",
      ".",
      "C:\\Windows",
      "a/b",
      "",
    ].forEach((deviceName) => {
      const where = folderForDevice(drive, deviceName);
      expect(path.resolve(where).startsWith(path.resolve(backups) + path.sep)).toBe(true);
    });

    // And the copy itself really lands inside, not merely the computed path.
    const result = mirrorBackup({ file: store.backup(), folder: drive, deviceName: "..\\..\\out" });
    expect(result.ok).toBe(true);
    expect(path.resolve(result.path).startsWith(path.resolve(backups) + path.sep)).toBe(true);
  });

  it("leaves the user's own files in that folder completely alone", () => {
    const store = storeWithData(home);

    // What is actually in somebody's Drive folder.
    fs.writeFileSync(path.join(drive, "invoice.pdf"), "not ours", "utf8");
    fs.writeFileSync(path.join(drive, "diamond-qr-notes.json"), "not ours either", "utf8");
    fs.mkdirSync(path.join(drive, "Photos"));

    mirrorBackup({ file: store.backup(), folder: drive, deviceName: "ST-1", keep: 1 });

    expect(fs.readFileSync(path.join(drive, "invoice.pdf"), "utf8")).toBe("not ours");
    expect(fs.readFileSync(path.join(drive, "diamond-qr-notes.json"), "utf8")).toBe(
      "not ours either"
    );
    expect(fs.existsSync(path.join(drive, "Photos"))).toBe(true);
  });

  it("keeps the newest copies and prunes only its own", () => {
    const store = storeWithData(home);
    const mine = folderForDevice(drive, "ST-1");
    fs.mkdirSync(mine, { recursive: true });

    // A month of history already there, plus something of theirs.
    for (let day = 1; day <= 8; day += 1) {
      fs.writeFileSync(
        path.join(mine, `diamond-qr-2026-07-${String(day).padStart(2, "0")}.json`),
        "{}",
        "utf8"
      );
    }
    fs.writeFileSync(path.join(mine, "read-me.txt"), "keep me", "utf8");

    mirrorBackup({ file: store.backup(), folder: drive, deviceName: "ST-1", keep: 3 });

    const left = fs.readdirSync(mine).sort();
    // Three kept, and the one just written is always among them.
    expect(left.filter((name) => name.startsWith("diamond-qr-"))).toHaveLength(3);
    expect(left).toContain("read-me.txt");
    // The oldest went, the newest stayed.
    expect(left).not.toContain("diamond-qr-2026-07-01.json");
    expect(left).toContain("diamond-qr-2026-07-08.json");
  });

  /**
   * This runs on the launch path. A USB stick that is not plugged in has to be a
   * message, never an exception - the app opening matters more than the copy.
   */
  it("reports an unreachable folder instead of throwing", () => {
    const store = storeWithData(home);
    const result = mirrorBackup({
      file: store.backup(),
      folder: path.join(drive, "no-such-drive"),
      deviceName: "ST-1",
    });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.error).toMatch(/not available|not be connected/i);
  });

  it("says nothing is configured when no folder is set", () => {
    const store = storeWithData(home);
    const result = mirrorBackup({ file: store.backup(), folder: "", deviceName: "ST-1" });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
  });

  it("leaves no half-copied file behind for a sync client to upload", () => {
    const store = storeWithData(home);
    const result = mirrorBackup({ file: store.backup(), folder: drive, deviceName: "ST-1" });

    const left = fs.readdirSync(path.dirname(result.path));
    expect(left.some((name) => name.endsWith(".part"))).toBe(false);
  });

  describe("what it reports", () => {
    it("reads the folder rather than remembering what it did", () => {
      const store = storeWithData(home);
      const written = mirrorBackup({ file: store.backup(), folder: drive, deviceName: "ST-1" });

      expect(mirrorStatus({ folder: drive, deviceName: "ST-1" })).toMatchObject({
        configured: true,
        available: true,
        count: 1,
      });

      // Someone empties the Drive folder from the web. The app must not keep
      // claiming there is a backup there.
      fs.unlinkSync(written.path);

      expect(mirrorStatus({ folder: drive, deviceName: "ST-1" }).count).toBe(0);
    });

    /**
     * The state immediately after choosing a folder. "Nothing copied yet" and
     * "that drive is not there" need different words on the Settings screen, or
     * the first thing a new user sees is a false alarm.
     */
    it("knows nothing-copied-yet from cannot-be-reached", () => {
      const fresh = mirrorStatus({ folder: drive, deviceName: "ST-1" });
      expect(fresh).toMatchObject({ configured: true, available: true, count: 0 });
    });

    it("knows the difference between off and unreachable", () => {
      expect(mirrorStatus({ folder: "", deviceName: "ST-1" }).configured).toBe(false);

      const gone = mirrorStatus({ folder: path.join(drive, "unplugged"), deviceName: "ST-1" });
      expect(gone.configured).toBe(true);
      expect(gone.available).toBe(false);
    });
  });
});
