#!/usr/bin/env electron
/**
 * Does a save through the REAL bridge write one row or the whole dataset?
 *
 *   npm run test:journal
 *
 * Jest cannot answer this. The bug it guards against - a customer's journal
 * reaching 546 MB after 199 scans, at which point the app could not open its own
 * data - existed precisely because the thing that destroys the information the
 * store depends on is Electron's structured clone, and a jest bridge that passes
 * objects by reference does not destroy it. src/domain/ipcAdapter.test.js stands
 * in for the clone with JSON; this runs the real one, through the real preload,
 * against the real IPC handlers and a real file store.
 *
 * The assertion is a ratio, not a byte count: after N commits the journal must
 * still be small next to the snapshot. Whole-state writes fail it by orders of
 * magnitude, so it does not need to be a tight bound to be a useful alarm.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createFileStore } = require("../public/db/fileStore");
const { registerDataIpc } = require("../public/main/dataIpc");

const root = path.join(__dirname, "..");
const COMMITS = 40;

const problems = [];

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dq-journal-"));
const storeDir = path.join(dataDir, "data");
const store = createFileStore({ dir: storeDir });
store.load();

/* A dataset big enough that a whole-state write is unmistakable. */
const seeded = { schema: 3, kapans: {}, lots: {}, packets: {} };
seeded.kapans.k1 = { id: "k1", number: "41", season: "25-26", createdAt: "2026-01-17" };
seeded.lots.l1 = { id: "l1", kapanId: "k1", lotNo: 1, pcs: 0, charmi: -2 };
for (let index = 0; index < 4000; index += 1) {
  seeded.packets[`p${index}`] = {
    id: `p${index}`,
    kapanId: "k1",
    lotId: "l1",
    rawCode: `DQR-41-${String(index).padStart(6, "0")}`,
    kachuWeight: 1.02,
    polishedWeight: 0.41,
    scannedAt: "2026-07-17T09:15:32.000Z",
  };
}
store.save(seeded);
store.compact();

registerDataIpc({
  ipcMain,
  dataDir: () => dataDir,
  getStore: () => store,
  getServer: () => null,
  getError: () => "",
  getSeats: () => 0,
  appInfo: () => ({ version: "journal-test", support: { name: "-", email: "-" } }),
  relaunch: () => {},
});

const sizeOf = (file) => {
  try {
    return fs.statSync(file).size;
  } catch (error) {
    return 0;
  }
};

const finish = (code) => {
  console.log("");
  if (problems.length) {
    console.error("JOURNAL GROWTH TEST FAILED:\n");
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

  // A blank page: this is about the bridge, not about the UI. The smoke test
  // covers the UI.
  await win.loadURL("data:text/html,<title>journal</title>");

  const snapshotBefore = sizeOf(path.join(storeDir, "snapshot.json"));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.diamondQR;
      if (!api || !api.data) return { error: "no bridge" };
      if (typeof api.data.commit !== "function") return { error: "no data.commit channel" };

      const loaded = await api.data.load();
      if (!loaded.ok) return { error: loaded.error };

      // One scan, ${COMMITS} times: a new packet and one more piece on the lot.
      for (let index = 0; index < ${COMMITS}; index += 1) {
        const id = "scan" + index;
        const outcome = await api.data.commit({
          upserts: {
            kapans: {},
            lots: {},
            packets: {
              [id]: {
                id,
                kapanId: "k1",
                lotId: "l1",
                rawCode: "DQR-41-SCAN" + index,
                kachuWeight: 1.11,
                polishedWeight: 0.5,
                scannedAt: "2026-08-12T13:04:00.000Z",
              },
            },
          },
          deletes: { kapans: [], lots: [], packets: [] },
          counters: { lots: { l1: 1 } },
        });
        if (!outcome.ok) return { error: outcome.error, at: index };
      }

      return { ok: true, packetsSeen: Object.keys(loaded.state.packets).length };
    })()
  `);

  if (result.error) {
    problems.push(`the bridge could not commit: ${result.error}`);
    finish(1);
    return;
  }

  if (result.packetsSeen !== 4000) {
    problems.push(`load() returned ${result.packetsSeen} packets, expected 4000`);
  }

  const journal = sizeOf(path.join(storeDir, "journal.jsonl"));

  console.log("");
  console.log(`  snapshot            ${(snapshotBefore / 1024).toFixed(0)} KB`);
  console.log(`  journal after ${COMMITS}   ${(journal / 1024).toFixed(0)} KB`);
  console.log(`  per commit          ${(journal / COMMITS / 1024).toFixed(1)} KB`);

  // Whole-state writes would put this at ${COMMITS} x the snapshot.
  if (journal > snapshotBefore / 4) {
    problems.push(
      `the journal grew to ${(journal / 1024).toFixed(0)} KB against a ` +
        `${(snapshotBefore / 1024).toFixed(0)} KB snapshot - saves are writing far more ` +
        `than the rows they changed`
    );
  }

  // And the data has to be right, not merely small.
  const reopened = createFileStore({ dir: storeDir }).load();
  const packets = Object.keys(reopened.packets).length;
  if (packets !== 4000 + COMMITS) {
    problems.push(`reopened with ${packets} packets, expected ${4000 + COMMITS}`);
  }
  if (reopened.lots.l1.pcs !== COMMITS) {
    problems.push(`lot l1 counted ${reopened.lots.l1.pcs} pieces, expected ${COMMITS}`);
  }

  if (!problems.length) {
    console.log("");
    console.log(`  OK - ${packets} packets on disk, lot l1 on ${reopened.lots.l1.pcs} pieces.`);
  }

  finish(problems.length ? 1 : 0);
});

app.on("window-all-closed", () => {});
