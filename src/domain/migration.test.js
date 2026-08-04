/**
 * The rename migration.
 *
 * Worth testing properly rather than trying once by hand: it runs exactly once
 * per machine, on the customer's PC, at the moment of an upgrade, and if it is
 * wrong the symptom is "the app has forgotten everything and wants a new licence".
 * There is no second chance to observe it.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  migrateUserData,
  MARKER,
  LEGACY_FOLDER_NAMES,
} = require("../../public/main/migrateUserData");

let appData;

const folder = (name) => path.join(appData, name);

const makeInstall = (name, { license = "KEY-1", device = { deviceId: "abc" }, snapshot = { kapans: [] } } = {}) => {
  const dir = folder(name);
  fs.mkdirSync(path.join(dir, "data", "backups"), { recursive: true });
  if (license !== null) fs.writeFileSync(path.join(dir, "license.dat"), license, "utf8");
  if (device !== null) {
    fs.writeFileSync(path.join(dir, "device.json"), JSON.stringify(device), "utf8");
  }
  if (snapshot !== null) {
    fs.writeFileSync(
      path.join(dir, "data", "snapshot.json"),
      JSON.stringify(snapshot),
      "utf8"
    );
  }
  fs.writeFileSync(path.join(dir, "data", "journal.jsonl"), '{"op":"x"}\n', "utf8");
  fs.writeFileSync(
    path.join(dir, "data", "backups", "2026-08-01.json"),
    JSON.stringify(snapshot),
    "utf8"
  );
  return dir;
};

const fresh = (name) => {
  const dir = folder(name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

beforeEach(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), "dq-migrate-"));
});

afterEach(() => {
  fs.rmSync(appData, { recursive: true, force: true });
});

describe("carrying an installation across the rename", () => {
  it("copies the licence, the device id and the whole database", () => {
    const legacy = makeInstall("Raj-QR-CODE-SCANNER");
    const userData = fresh("Diamond QR");

    const result = migrateUserData({ userData, appData });

    expect(result.migrated).toBe(true);
    expect(result.from).toBe(legacy);
    expect(result.copied.sort()).toEqual(["data", "device.json", "license.dat"]);

    // The licence is the one that would generate a support call.
    expect(fs.readFileSync(path.join(userData, "license.dat"), "utf8")).toBe("KEY-1");

    // A new device id would burn a seat, so it has to come across unchanged.
    expect(
      JSON.parse(fs.readFileSync(path.join(userData, "device.json"), "utf8")).deviceId
    ).toBe("abc");

    expect(fs.existsSync(path.join(userData, "data", "snapshot.json"))).toBe(true);
    expect(fs.existsSync(path.join(userData, "data", "journal.jsonl"))).toBe(true);
  });

  it("copies nested folders, so the dated backups survive too", () => {
    makeInstall("Raj-QR-CODE-SCANNER");
    const userData = fresh("Diamond QR");

    migrateUserData({ userData, appData });

    expect(
      fs.existsSync(path.join(userData, "data", "backups", "2026-08-01.json"))
    ).toBe(true);
  });

  it("leaves the old folder alone, so a bad migration is recoverable", () => {
    const legacy = makeInstall("Raj-QR-CODE-SCANNER");
    const userData = fresh("Diamond QR");

    migrateUserData({ userData, appData });

    expect(fs.readFileSync(path.join(legacy, "license.dat"), "utf8")).toBe("KEY-1");
    expect(fs.existsSync(path.join(legacy, "data", "snapshot.json"))).toBe(true);
  });

  it("writes a marker saying where the data came from", () => {
    const legacy = makeInstall("Raj-QR-CODE-SCANNER");
    const userData = fresh("Diamond QR");

    migrateUserData({ userData, appData });

    const marker = fs.readFileSync(path.join(userData, MARKER), "utf8");
    expect(marker).toContain(legacy);
  });

  it("never runs twice - a second launch is a no-op", () => {
    makeInstall("Raj-QR-CODE-SCANNER");
    const userData = fresh("Diamond QR");

    expect(migrateUserData({ userData, appData }).migrated).toBe(true);

    // Someone deletes a Kapan, then relaunches. The migration must not put the
    // old snapshot back over the top of their work.
    fs.writeFileSync(
      path.join(userData, "data", "snapshot.json"),
      JSON.stringify({ kapans: ["edited"] }),
      "utf8"
    );

    const second = migrateUserData({ userData, appData });
    expect(second.migrated).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(userData, "data", "snapshot.json"), "utf8")).kapans
    ).toEqual(["edited"]);
  });

  it("refuses to touch a folder that already holds data, marker or not", () => {
    makeInstall("Raj-QR-CODE-SCANNER");
    const userData = makeInstall("Diamond QR", { license: "KEY-2" });

    const result = migrateUserData({ userData, appData });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe("already in use");
    expect(fs.readFileSync(path.join(userData, "license.dat"), "utf8")).toBe("KEY-2");
  });

  it("does nothing on a genuinely fresh machine", () => {
    const userData = fresh("Diamond QR");

    const result = migrateUserData({ userData, appData });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe("nothing to migrate");
    expect(fs.existsSync(path.join(userData, "license.dat"))).toBe(false);
  });

  it("ignores an old folder that exists but was never used", () => {
    fresh("Raj-QR-CODE-SCANNER"); // empty: installed, never activated
    const userData = fresh("Diamond QR");

    expect(migrateUserData({ userData, appData }).migrated).toBe(false);
  });

  it("migrates a licence-only install, where the app was activated but unused", () => {
    makeInstall("Raj-QR-CODE-SCANNER", { device: null, snapshot: null });
    const userData = fresh("Diamond QR");

    const result = migrateUserData({ userData, appData });

    expect(result.migrated).toBe(true);
    expect(fs.readFileSync(path.join(userData, "license.dat"), "utf8")).toBe("KEY-1");
  });

  it("does not copy Chromium's caches", () => {
    const legacy = makeInstall("Raj-QR-CODE-SCANNER");
    fs.mkdirSync(path.join(legacy, "Cache"), { recursive: true });
    fs.writeFileSync(path.join(legacy, "Cache", "data_0"), "junk", "utf8");
    fs.writeFileSync(path.join(legacy, "Cookies"), "junk", "utf8");

    const userData = fresh("Diamond QR");
    migrateUserData({ userData, appData });

    expect(fs.existsSync(path.join(userData, "Cache"))).toBe(false);
    expect(fs.existsSync(path.join(userData, "Cookies"))).toBe(false);
  });

  it("checks every name the app has shipped under", () => {
    // The second name in the list, not the first.
    makeInstall(LEGACY_FOLDER_NAMES[1], { license: "OLDER" });
    const userData = fresh("Diamond QR");

    const result = migrateUserData({ userData, appData });

    expect(result.migrated).toBe(true);
    expect(fs.readFileSync(path.join(userData, "license.dat"), "utf8")).toBe("OLDER");
  });

  it("prefers the newest name when two old folders exist", () => {
    makeInstall(LEGACY_FOLDER_NAMES[0], { license: "NEWER" });
    makeInstall(LEGACY_FOLDER_NAMES[1], { license: "OLDER" });
    const userData = fresh("Diamond QR");

    migrateUserData({ userData, appData });

    expect(fs.readFileSync(path.join(userData, "license.dat"), "utf8")).toBe("NEWER");
  });

  it("does not write the marker when the copy fails, so it will be retried", () => {
    const legacy = makeInstall("Raj-QR-CODE-SCANNER");
    const userData = fresh("Diamond QR");

    // A file where the app expects the data folder. The licence and device id copy
    // fine and then this throws, which is the partial-copy case that matters:
    // remembering it as done would leave the database behind for good.
    fs.writeFileSync(path.join(userData, "data"), "not a folder", "utf8");

    const result = migrateUserData({ userData, appData });

    expect(result.migrated).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.from).toBe(legacy);
    expect(fs.existsSync(path.join(userData, MARKER))).toBe(false);
  });

  it("survives being handed nothing", () => {
    expect(migrateUserData({}).migrated).toBe(false);
    expect(migrateUserData({ userData: folder("x"), appData: null }).migrated).toBe(false);
  });
});
