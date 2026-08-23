/**
 * Registers the data and config channels the app window's bridge calls.
 *
 * Extracted from electron.js so the end-to-end harness registers the *same*
 * handlers the shipped app does, rather than a copy of them that can drift. A
 * test that exercises a re-implementation of the thing under test proves very
 * little, and this is the seam where that was about to happen.
 *
 * Everything is passed in - no module-level state - so the caller keeps ownership
 * of the store's lifecycle.
 */

const deviceConfig = require("../db/config");
const { mirrorBackup, mirrorStatus } = require("../db/offsite");
const { connectUrls } = require("../net/address");

/**
 * @param ipcMain    Electron's ipcMain
 * @param dataDir    () => userData path
 * @param getStore   () => the file store, or null on a client / after a failure
 * @param getServer  () => the LAN server, or null
 * @param getError   () => a string explaining why there is no store
 * @param getSeats   () => how many computers the licence allows
 * @param appInfo    () => ({ version, support })
 * @param relaunch   () => restart the app
 * @param chooseFolder () => Promise<string> folder picker, "" if cancelled
 */
const registerDataIpc = ({
  ipcMain,
  dataDir,
  getStore,
  getServer,
  getError = () => "",
  getSeats = () => 0,
  appInfo = () => ({}),
  relaunch = () => {},
  chooseFolder = async () => "",
}) => {
  const noStore = () => ({
    ok: false,
    error: getError() || "This PC has no local database.",
  });

  ipcMain.handle("device:config", () => {
    const config = deviceConfig.load(dataDir());
    return { ...config, roles: deviceConfig.ROLES, modes: deviceConfig.MODES };
  });

  ipcMain.handle("device:update", (event, patch) =>
    deviceConfig.update(dataDir(), patch || {})
  );

  ipcMain.handle("app:info", () => ({ ...appInfo(), userData: dataDir() }));

  ipcMain.handle("app:relaunch", () => relaunch());

  ipcMain.handle("data:load", () => {
    if (getError()) return { ok: false, error: getError() };
    const store = getStore();
    if (!store) return noStore();
    return { ok: true, state: store.getState(), version: store.getVersion() };
  });

  /**
   * The renderer's own change, already reduced to a delta on its side.
   *
   * It has to be reduced there. Electron structured-clones everything crossing
   * this boundary, so a whole state arriving here shares not one row object with
   * the state the store holds - and the store's delta is computed by row
   * identity. `data:save` below therefore wrote the entire dataset per keystroke,
   * which grew one customer's journal past the half-gigabyte a JS string can
   * hold and left the app unable to open its own data.
   */
  ipcMain.handle("data:commit", (event, delta) => {
    const store = getStore();
    if (!store) return noStore();
    try {
      const saved = store.commit(delta);
      return { ok: true, version: saved.version };
    } catch (err) {
      return { ok: false, error: `Saving to disk failed: ${err.message}` };
    }
  });

  /**
   * Whole-state save. Still here because a renderer that predates `data:commit`
   * is a possibility during an upgrade, and because failing a save is worse than
   * writing too much. Nothing in the current app reaches it.
   */
  ipcMain.handle("data:save", (event, state) => {
    const store = getStore();
    if (!store) return noStore();
    try {
      const saved = store.save(state);
      return { ok: true, version: saved.version };
    } catch (err) {
      // Disk full, permissions, a dying drive - all of which used to pass
      // unnoticed in the localStorage build. The renderer surfaces this and rolls
      // the screen back to what is really saved.
      return { ok: false, error: `Saving to disk failed: ${err.message}` };
    }
  });

  /**
   * A dated backup on this PC, and a copy of it in the owner's off-site folder if
   * one is set. Both together, because "back up" meaning "write another copy to
   * the disk that is about to die" is not what anybody asking for a backup wants.
   */
  ipcMain.handle("data:backup", () => {
    const store = getStore();
    if (!store) return noStore();
    try {
      const file = store.backup();
      const config = deviceConfig.load(dataDir());
      const offsite = mirrorBackup({
        file,
        folder: config.backupFolder,
        deviceName: config.deviceName,
      });
      return { ok: true, path: file, offsite };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * What is really in the off-site folder, read from the folder rather than
   * remembered. A backup screen that reports its own last intention instead of
   * what is on disk is how people find out too late.
   */
  ipcMain.handle("data:offsite", () => {
    const config = deviceConfig.load(dataDir());
    return mirrorStatus({ folder: config.backupFolder, deviceName: config.deviceName });
  });

  /** Opens the folder picker and returns what was chosen, or "" if cancelled. */
  ipcMain.handle("data:choose-backup-folder", async () => {
    const folder = await chooseFolder();
    return { ok: true, folder };
  });

  ipcMain.handle("data:stats", () => {
    const store = getStore();
    if (!store) return noStore();
    return { ok: true, ...store.stats() };
  });

  ipcMain.handle("host:status", () => {
    const config = deviceConfig.load(dataDir());
    const server = getServer();
    const running = !!server;

    return {
      role: config.role,
      running,
      port: config.serverPort,
      error: getError(),
      // What to read out to whoever is setting up the other computers.
      urls: running ? connectUrls(config.serverPort) : [],
      seats: getSeats(),
      clients: running
        ? server.clientList().map((client) => ({
            name: client.name,
            lastSeen: new Date(client.lastSeen).toISOString(),
          }))
        : [],
    };
  });
};

module.exports = { registerDataIpc };
