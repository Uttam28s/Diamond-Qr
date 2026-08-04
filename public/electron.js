const electron = require("electron");
const { app, BrowserWindow, ipcMain, clipboard, dialog, Menu, shell } = electron;

const path = require("path");
const fs = require("fs");
const isDev = require("electron-is-dev");

const license = require("./license");
const codec = require("./license/codec");

const deviceConfig = require("./db/config");
const { createFileStore } = require("./db/fileStore");
const { createServer } = require("./net/server");
const { registerDataIpc } = require("./main/dataIpc");
const { migrateUserData } = require("./main/migrateUserData");
const { installDevToolsUnlock } = require("./main/devtools");

/** Shown to the user on the activation / "contact administrator" screen. */
const SUPPORT = {
  name: "Zeonlabs",
  email: "zeonlabs@outlook.com",
};

let mainWindow = null;
let activationWindow = null;
let licenseStatus = null;
/** Set while we swap activation -> main window, so window-all-closed does not quit. */
let switchingWindows = false;

/** This PC's own database. Absent on a client, which reads the host's instead. */
let dataStore = null;
/** The LAN server, only in host mode. */
let hostServer = null;
let hostError = "";

const dataDir = () => app.getPath("userData");

const appUrl = () =>
  isDev ? "http://localhost:3001" : `file://${path.join(__dirname, "../build/index.html")}`;

/**
 * Hardening applied to every window. The renderer has no Node access and no way to
 * reach the license IPC channels -- only the activation window gets a preload.
 */
function baseWebPreferences(extra = {}) {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: true,
    // Available, but not reachable: every inspector accelerator is swallowed, and
    // the only way in is the chord plus the word in main/devtools.js.
    devTools: true,
    ...extra,
  };
}

/** Refuse in-app navigation to anywhere but our own page, and block popups. */
function lockDownNavigation(win, allowedUrl) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Send genuine external links to the real browser instead of a new app window.
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== allowedUrl) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 300,
    height: 130,
    frame: false,
    resizable: false,
    movable: false,
    show: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#ffffff",
    webPreferences: baseWebPreferences(),
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  return splash;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1536,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    title: "Diamond QR",
    backgroundColor: "#f4f6f7",
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false,
    webPreferences: baseWebPreferences({
      // The one bridge the app window gets: a fixed list of data and config
      // calls, defined in data-preload.js. No generic IPC, no Node.
      preload: path.join(__dirname, "data-preload.js"),
    }),
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);
  // In dev the default menu is present and its accelerators are wanted. In a
  // shipped build they are all dead and only the chord opens anything.
  if (!isDev) installDevToolsUnlock(mainWindow);
  // The renderer sets <title>, which would otherwise override the window title.
  mainWindow.on("page-title-updated", (event) => event.preventDefault());
  mainWindow.maximize();

  const url = appUrl();
  lockDownNavigation(mainWindow, url);
  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));
  return mainWindow;
}

function createActivationWindow() {
  activationWindow = new BrowserWindow({
    width: 640,
    height: 720,
    minWidth: 560,
    minHeight: 520,
    // Resizable because the blocked state adds a banner, and shop PCs are often
    // 1366x768 where a taller fixed window would not fit.
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: "Diamond QR - Activation",
    backgroundColor: "#f4f6f7",
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false,
    webPreferences: baseWebPreferences({
      preload: path.join(__dirname, "license-preload.js"),
    }),
  });

  activationWindow.setMenuBarVisibility(false);
  // The licence screen is the last place an inspector should be a keystroke away.
  if (!isDev) installDevToolsUnlock(activationWindow);
  activationWindow.on("page-title-updated", (event) => event.preventDefault());
  activationWindow.loadFile(path.join(__dirname, "activation.html"));
  activationWindow.once("ready-to-show", () => activationWindow.show());
  activationWindow.on("closed", () => (activationWindow = null));
  return activationWindow;
}

/** Verify, then open either the app or the activation screen. */
async function boot() {
  const splash = createSplashWindow();

  // Before anything reads the licence or the database: if this is the first launch
  // after the app was renamed, its folder moved, and everything is in the old one.
  try {
    const moved = migrateUserData({
      userData: dataDir(),
      appData: app.getPath("appData"),
    });
    if (moved.migrated) {
      console.log(`[data] carried ${moved.copied.join(", ")} over from ${moved.from}`);
    } else if (moved.error) {
      console.warn(`[data] could not migrate from ${moved.from}: ${moved.error}`);
    }
  } catch (err) {
    // Never block startup on this. A failed migration looks like a fresh install,
    // which is recoverable; a crash on launch is not.
    console.warn("[data] migration skipped:", err.message);
  }

  try {
    licenseStatus = await license.evaluate(dataDir());
  } catch (err) {
    // Never fail open. An unexpected error is treated as "not licensed".
    licenseStatus = {
      state: "blocked",
      reason: "unverifiable",
      detail: err && err.message ? err.message : String(err),
      requestCode: null,
      strength: "unknown",
    };
  }

  switchingWindows = true;
  if (licenseStatus.state === "licensed") {
    await openData();
    createMainWindow();
  } else {
    createActivationWindow();
  }
  if (!splash.isDestroyed()) splash.destroy();
  switchingWindows = false;
}

// ---------------------------------------------------------------------------
// This PC's data, and the LAN server when it is the host
// ---------------------------------------------------------------------------

/**
 * Opens the local database unless this PC is a client, and starts the server if it
 * is the host.
 *
 * Failures are recorded rather than thrown. A host whose port is already taken
 * should still open as a working single-PC app and say what went wrong, not refuse
 * to start on a factory floor at seven in the morning.
 */
async function openData() {
  // Idempotent. Activation calls this after boot() has already decided not to, and
  // a second server on the same port would fail with EADDRINUSE.
  if (dataStore || hostServer) return;

  const config = deviceConfig.load(dataDir());

  if (config.role === deviceConfig.ROLES.CLIENT) {
    // A client keeps no database of its own. Its unsent scans live in the
    // renderer's own storage, which is where the outbox already is.
    return;
  }

  dataStore = createFileStore({ dir: path.join(dataDir(), "data") });

  try {
    dataStore.load();
  } catch (err) {
    // Refusing to open beats opening empty beside data we could not read: the
    // renderer shows the reason and nothing is overwritten.
    hostError = err.message;
    dataStore = null;
    return;
  }

  // One dated copy per launch, before anything can be changed today.
  try {
    dataStore.backup();
  } catch (err) {
    console.warn("[data] backup failed:", err.message);
  }

  if (config.role !== deviceConfig.ROLES.HOST) return;

  try {
    hostServer = createServer({
      store: dataStore,
      token: config.serverToken || "",
      seats: Number(licenseStatus && licenseStatus.seats) || 0,
      onLog: (message) => console.log(message),
    });
    await hostServer.listen(config.serverPort, "0.0.0.0");
    console.log("[net] host listening on " + config.serverPort);
  } catch (err) {
    hostServer = null;
    hostError =
      err && err.code === "EADDRINUSE"
        ? "Port " + config.serverPort + " is already in use, so other PCs cannot connect. Another copy of the app may already be running, or pick a different port in Settings."
        : "The host could not start: " + err.message;
    console.warn("[net]", hostError);
  }
}

function closeData() {
  if (hostServer) {
    hostServer.close();
    hostServer = null;
  }
  dataStore = null;
}

// ---------------------------------------------------------------------------
// IPC -- data and config, through the app window's narrow bridge
// ---------------------------------------------------------------------------

// Registered from a module so the end-to-end harness wires up the same handlers
// this does, instead of a copy that can drift out of step with it.
registerDataIpc({
  ipcMain,
  dataDir,
  getStore: () => dataStore,
  getServer: () => hostServer,
  getError: () => hostError,
  getSeats: () => Number(licenseStatus && licenseStatus.seats) || 0,
  appInfo: () => ({ version: app.getVersion(), support: SUPPORT }),
  relaunch: () => {
    app.relaunch();
    app.exit(0);
  },
});

// ---------------------------------------------------------------------------
// IPC -- licence, reachable only from the activation window
// ---------------------------------------------------------------------------

ipcMain.handle("license:status", () => ({
  state: licenseStatus ? licenseStatus.state : "unactivated",
  reason: licenseStatus ? licenseStatus.reason : null,
  detail: licenseStatus ? licenseStatus.detail : null,
  requestCode: licenseStatus ? licenseStatus.requestCode : null,
  requestCodeDisplay: licenseStatus && licenseStatus.requestCode
    ? codec.formatForDisplay(licenseStatus.requestCode)
    : null,
  strength: licenseStatus ? licenseStatus.strength : null,
  appVersion: app.getVersion(),
  support: SUPPORT,
}));

/**
 * Swap the activation screen for the app window. Creates the new window BEFORE
 * closing the old one, otherwise the open-window count hits zero and
 * window-all-closed quits the app mid-activation.
 *
 * The `openData()` here is not optional and its absence was a first-run blocker:
 * boot() opens the database only on the already-licensed path, so a PC that has
 * just been activated reached this point with no store at all and the app opened
 * straight onto "This PC has no local database". Restarting it cleared the fault,
 * which is exactly why it survived - the second launch takes the boot() path.
 */
async function promoteToAppWindow() {
  switchingWindows = true;

  try {
    await openData();
  } catch (err) {
    // Open the window anyway. The renderer has a screen for "the data could not be
    // opened" that tells the user not to scan and to call support; leaving them
    // stranded on the activation screen after a successful activation is worse.
    hostError = hostError || `The database could not be opened: ${err.message}`;
  }

  createMainWindow();
  if (activationWindow && !activationWindow.isDestroyed()) activationWindow.destroy();
  switchingWindows = false;
}

ipcMain.handle("license:activate", async (event, licenseKey) => {
  const result = await license.activate(dataDir(), licenseKey);
  if (!result.ok) return result;

  licenseStatus = await license.evaluate(dataDir());

  // Hand the result back to the renderer first. Destroying the activation window
  // while its reply is still in flight leaves the caller's promise unresolved, so
  // the "Activated..." confirmation would never appear. The short delay also lets
  // the user actually read it.
  setTimeout(() => {
    promoteToAppWindow().catch((err) => {
      console.error("[boot] could not open the app window after activation:", err);
    });
  }, 900);

  return result;
});

ipcMain.handle("license:copy", (event, text) => {
  clipboard.writeText(String(text || ""));
  return { ok: true };
});

ipcMain.handle("license:save-request", async (event, text) => {
  const { canceled, filePath } = await dialog.showSaveDialog(activationWindow, {
    title: "Save installation code",
    defaultPath: path.join(app.getPath("desktop"), "diamond-qr-installation-code.txt"),
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  if (canceled || !filePath) return { ok: false };

  try {
    fs.writeFileSync(filePath, String(text || ""), "utf8");
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: `Could not save: ${err.message}` };
  }
});

ipcMain.handle("app:quit", () => app.quit());

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

app.allowRendererProcessReuse = true;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWindow || activationWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("ready", () => {
    // Kills the default menu, and with it the DevTools accelerators.
    if (!isDev) Menu.setApplicationMenu(null);
    boot();
  });
}

app.on("window-all-closed", () => {
  if (switchingWindows) return;
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // Otherwise a lingering process keeps the port and the next launch reports it
  // as already in use.
  closeData();
});

app.on("activate", () => {
  if (mainWindow === null && activationWindow === null) boot();
});

// A renderer must never be able to spawn a window with Node integration re-enabled.
app.on("web-contents-created", (event, contents) => {
  contents.on("will-attach-webview", (e, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });
});
