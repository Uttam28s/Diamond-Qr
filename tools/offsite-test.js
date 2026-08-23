#!/usr/bin/env electron
/**
 * The off-site copy, driven through the real bridge.
 *
 *   npm run test:offsite
 *
 * jest covers the copying itself against real folders. What it cannot see is the
 * path the owner actually takes: Settings calls across the preload, the main
 * process reads device.json, and a file appears in a folder. Every one of those
 * seams has been wrong at least once in this project.
 *
 * Uses a throwaway userData and a throwaway "Drive" folder; touches neither the
 * real data nor any real cloud folder.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createFileStore } = require("../public/db/fileStore");
const { registerDataIpc } = require("../public/main/dataIpc");
const deviceConfig = require("../public/db/config");

const root = path.join(__dirname, "..");
const problems = [];

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dq-offsite-"));
const drive = fs.mkdtempSync(path.join(os.tmpdir(), "dq-drive-"));

const store = createFileStore({ dir: path.join(dataDir, "data") });
store.load();
store.save({
  schema: 3,
  kapans: { k1: { id: "k1", number: "41", season: "25-26" } },
  lots: { l1: { id: "l1", kapanId: "k1", lotNo: 1, pcs: 142 } },
  packets: { p1: { id: "p1", kapanId: "k1", lotId: "l1", rawCode: "DQR-1" } },
});

// Name this PC, the way Settings would.
deviceConfig.update(dataDir, { deviceName: "ST-1" });

registerDataIpc({
  ipcMain,
  dataDir: () => dataDir,
  getStore: () => store,
  getServer: () => null,
  getError: () => "",
  getSeats: () => 0,
  appInfo: () => ({ version: "offsite-test", support: { name: "-", email: "-" } }),
  relaunch: () => {},
  // Stands in for the folder dialog, which cannot be clicked from a script.
  chooseFolder: async () => drive,
});

const finish = (code) => {
  console.log("");
  if (problems.length) {
    console.error("OFF-SITE TEST FAILED:\n");
    problems.forEach((line) => console.error(`  ${line}`));
    console.error("");
  }
  app.exit(code);
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(root, "public", "data-preload.js"),
    },
  });

  await win.loadURL("data:text/html,<title>offsite</title>");

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.diamondQR;
      if (!api || !api.data) return { error: "no bridge" };
      if (typeof api.data.offsite !== "function") return { error: "no data.offsite channel" };
      if (typeof api.data.chooseBackupFolder !== "function") {
        return { error: "no data.chooseBackupFolder channel" };
      }

      const before = await api.data.offsite();

      // What the "Choose folder..." button does.
      const picked = await api.data.chooseBackupFolder();
      const saved = await api.setConfig({ backupFolder: picked.folder });
      if (!saved.ok) return { error: saved.error };

      const backup = await api.data.backup();
      const after = await api.data.offsite();

      return { ok: true, before, picked, backup, after };
    })()
  `);

  if (result.error) {
    problems.push(`the bridge could not set it up: ${result.error}`);
    finish(1);
    return;
  }

  console.log("");
  console.log(`  before          configured=${result.before.configured}`);
  console.log(`  chose           ${result.picked.folder}`);
  console.log(`  local backup    ${path.basename(result.backup.path)}`);
  console.log(`  off-site copy   ${result.backup.offsite && result.backup.offsite.path}`);
  console.log(`  status          ${result.after.count} cop(y/ies) in ${result.after.folder}`);

  if (result.before.configured) problems.push("it claimed to be configured before anything was set");
  if (!result.backup.ok) problems.push(`the backup failed: ${result.backup.error}`);
  if (!result.backup.offsite || !result.backup.offsite.ok) {
    problems.push(
      `the off-site copy failed: ${result.backup.offsite && result.backup.offsite.error}`
    );
  }
  if (!result.after.configured || !result.after.available || result.after.count !== 1) {
    problems.push("the status does not report exactly one copy in the folder");
  }

  // The setting has to survive a restart, or it is not a setting.
  const reread = deviceConfig.load(dataDir);
  if (reread.backupFolder !== drive) {
    problems.push(`device.json kept "${reread.backupFolder}" instead of the chosen folder`);
  }

  // And the copy has to be the real data, in our own per-device subfolder.
  const copied = result.backup.offsite && result.backup.offsite.path;
  if (copied) {
    if (!copied.includes(path.join("Diamond QR Backups", "ST-1"))) {
      problems.push(`the copy went to ${copied}, not the per-device subfolder`);
    }
    const parsed = JSON.parse(fs.readFileSync(copied, "utf8"));
    if (!parsed.data || parsed.data.lots.l1.pcs !== 142) {
      problems.push("the copied file does not contain the data");
    }
  }

  if (!problems.length) {
    console.log("");
    console.log("  OK - a copy of the data is sitting outside the app's own folder.");
  }

  finish(problems.length ? 1 : 0);
});

app.on("window-all-closed", () => {});
