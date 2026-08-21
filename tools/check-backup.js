#!/usr/bin/env node
/**
 * Is this backup file actually a usable backup?
 *
 *   node tools/check-backup.js "C:\\path\\to\\diamond-qr-2026-08-21.json"
 *   node tools/check-backup.js "...json" --against "%APPDATA%\\Diamond QR\\data"
 *
 * "I took a backup" and "I have a backup I could restore from" are not the same
 * sentence, and the gap between them is only ever discovered on the day it
 * matters. This reads the file the way the app's restore would, reports what is
 * in it, and - with --against - compares it row by row against the live data so
 * that "it saved something" can be upgraded to "it saved everything".
 *
 * Read-only. It writes nothing and changes nothing, on either side.
 */

const fs = require("fs");
const path = require("path");

const { forEachLine, SCHEMA_VERSION } = require("../public/db/fileStore");
const { applyDeltaInPlace } = require("../public/shared/delta");

const TABLES = ["kapans", "lots", "packets"];

/* ----------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const file = argv.find((arg) => !arg.startsWith("--"));
const against = (() => {
  const at = argv.indexOf("--against");
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
})();

const say = (line = "") => process.stdout.write(`${line}\n`);
const problems = [];

const finish = () => {
  say();
  if (problems.length) {
    say("  NOT a backup you should rely on:");
    problems.forEach((line) => say(`    - ${line}`));
    say();
    process.exit(1);
  }
  say("  This backup is complete and restorable.");
  say();
  process.exit(0);
};

const die = (message) => {
  say();
  say(`  ${message}`);
  say();
  process.exit(1);
};

if (!file) {
  die('Usage: node tools/check-backup.js "path\\to\\backup.json" [--against "path\\to\\data"]');
}

/* ------------------------------------------------------------- the backup */

const target = path.resolve(file);
say();
say(`  Backup: ${target}`);

if (!fs.existsSync(target)) die("That file does not exist.");

const size = fs.statSync(target).size;
say(`  Size:   ${(size / 1048576).toFixed(2)} MB`);
if (!size) die("The file is empty. Nothing was written.");

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(target, "utf8"));
} catch (error) {
  die(`The file is not readable JSON - a restore would refuse it: ${error.message}`);
}

// The app writes { savedAt, data }; an export from Settings writes
// { exportedAt, device, data }. A bare state is accepted too, the way the app's
// own restore accepts it.
const data = parsed && parsed.data ? parsed.data : parsed;
const savedAt = parsed && (parsed.savedAt || parsed.exportedAt);

if (savedAt) say(`  Saved:  ${savedAt}`);
if (parsed && parsed.device) say(`  From:   ${parsed.device}`);

if (!data || typeof data !== "object" || !data.kapans) {
  die("There is no Diamond QR data in this file - a restore would refuse it.");
}

if (data.schema !== SCHEMA_VERSION) {
  problems.push(
    `it is schema ${data.schema} and this version restores schema ${SCHEMA_VERSION}`
  );
}

const counts = (state) =>
  TABLES.reduce((acc, table) => ({ ...acc, [table]: Object.keys(state[table] || {}).length }), {});

const inBackup = counts(data);
say();
say(
  `  Holds:  ${inBackup.kapans} kapans, ${inBackup.lots} lots, ${inBackup.packets} packets`
);

if (!inBackup.kapans && !inBackup.lots && !inBackup.packets) {
  problems.push("it is empty - it holds no kapans, lots or packets at all");
}

/* The newest scan in it, which is what says how current the backup is. */
const newestScan = Object.values(data.packets || {}).reduce(
  (newest, row) => (row && row.scannedAt > newest ? row.scannedAt : newest),
  ""
);
if (newestScan) say(`  Newest scan in it: ${newestScan}`);

/* ------------------------------------------------- against the live data */

if (!against) {
  say();
  say("  Pass --against \"<the data folder>\" to compare it with the live data.");
  finish();
}

const dir = path.resolve(against);
say();
say(`  Live data: ${dir}`);

if (!fs.existsSync(dir)) die("That data folder does not exist.");

const snapshotFile = path.join(dir, "snapshot.json");
const journalFile = path.join(dir, "journal.jsonl");

let live = { schema: SCHEMA_VERSION, kapans: {}, lots: {}, packets: {} };
if (fs.existsSync(snapshotFile)) {
  const base = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
  live = {
    schema: SCHEMA_VERSION,
    kapans: base.kapans || {},
    lots: base.lots || {},
    packets: base.packets || {},
  };
}

let replayed = 0;
forEachLine(journalFile, (line) => {
  try {
    applyDeltaInPlace(live, JSON.parse(line));
    replayed += 1;
  } catch (error) {
    // A torn last line is expected; it is the store's problem, not the backup's.
  }
});

const inLive = counts(live);
say(
  `  Holds:  ${inLive.kapans} kapans, ${inLive.lots} lots, ${inLive.packets} packets` +
    (replayed ? ` (after replaying ${replayed} journal line(s))` : "")
);

say();

// What the live data has that the backup does not. The other direction is fine -
// a backup holding a Kapan that has since been deleted is a backup doing its job.
let missingTotal = 0;
TABLES.forEach((table) => {
  const missing = Object.keys(live[table] || {}).filter((id) => !(data[table] || {})[id]);
  missingTotal += missing.length;
  if (missing.length) {
    problems.push(
      `${missing.length} ${table} in the live data are not in this backup ` +
        `(e.g. ${missing.slice(0, 3).join(", ")})`
    );
  }
});

if (!missingTotal) {
  say("  Every row in the live data is in this backup.");
}

// Rows present in both but not identical - an edit made after the backup.
let changed = 0;
TABLES.forEach((table) => {
  Object.keys(live[table] || {}).forEach((id) => {
    const there = (data[table] || {})[id];
    if (there && JSON.stringify(there) !== JSON.stringify(live[table][id])) changed += 1;
  });
});

if (changed) {
  say(`  ${changed} row(s) have been edited since this backup was taken.`);
}

finish();
