const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
const isDev = require("electron-is-dev");

//start server
// require("./server/dist/server.js");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1536,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    title: "Diamond QR",
    backgroundColor: "#f4f6f7",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: { nodeIntegration: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);
  // The renderer sets <title>, which would otherwise override the window title.
  mainWindow.on("page-title-updated", (event) => event.preventDefault());
  mainWindow.maximize();
  mainWindow.loadURL(
    isDev
      ? "http://localhost:3001"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );
  mainWindow.on("closed", () => (mainWindow = null));
}

app.allowRendererProcessReuse = true;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) app.quit();
else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Create myWindow, load the rest of the app, etc...
  app.on("ready", createWindow);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
