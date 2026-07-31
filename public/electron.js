const electron = require("electron");
const { app, BrowserWindow, ipcMain, clipboard, dialog, Menu, shell } = electron;

const path = require("path");
const fs = require("fs");
const isDev = require("electron-is-dev");

const license = require("./license");
const codec = require("./license/codec");

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
    // No DevTools in a shipped build: it is the easiest way to poke at app internals.
    devTools: isDev,
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
    webPreferences: baseWebPreferences(),
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);
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
  activationWindow.on("page-title-updated", (event) => event.preventDefault());
  activationWindow.loadFile(path.join(__dirname, "activation.html"));
  activationWindow.once("ready-to-show", () => activationWindow.show());
  activationWindow.on("closed", () => (activationWindow = null));
  return activationWindow;
}

/** Verify, then open either the app or the activation screen. */
async function boot() {
  const splash = createSplashWindow();

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
    createMainWindow();
  } else {
    createActivationWindow();
  }
  if (!splash.isDestroyed()) splash.destroy();
  switchingWindows = false;
}

// ---------------------------------------------------------------------------
// IPC -- only reachable from the activation window (the only one with a preload)
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
 */
function promoteToAppWindow() {
  switchingWindows = true;
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
  setTimeout(promoteToAppWindow, 900);

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
