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
    // width: 1280,
    // height: 720,
    webPreferences: { nodeIntegration: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.maximize();
  mainWindow.loadURL(
    isDev
      ? "http://localhost:3010"
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
