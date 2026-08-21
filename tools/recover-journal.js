#!/usr/bin/env node
/**
 * Rebuilds snapshot.json from an oversized journal, without destroying anything.
 *
 * Why this exists: builds before 2.2.2 recorded the whole dataset in the journal
 * on every save (see the note in public/db/fileStore.js). On a busy install the
 * journal passed the ~512 MB ceiling on a JavaScript string, and the app stopped
 * opening with "Cannot create a string longer than 0x1fffffe8 characters". The
 * data is all still there; it is the reading of it in one piece that fails.
 *
 * 2.2.2 folds such a journal away by itself on first launch. This tool is for the
 * case where that is not an option - support wants to see the numbers first, the
 * customer is not upgrading today, or the journal turns out to be damaged as well
 * as large.
 *
 * Usage:
 *
 *   node tools/recover-journal.js                     inspect the default folder
 *   node tools/recover-journal.js --dir "D:\\copy\\data"
 *   node tools/recover-journal.js --out rebuilt.json  also write the state out
 *   node tools/recover-journal.js --write             repair the folder in place
 *
 * Nothing is deleted, overwritten or truncated unless --write is given, and even
 * then the originals are moved into a dated recovered-<stamp> folder beside them
 * rather than removed. Close the app before using --write.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const { applyDelta } = require("../public/shared/delta");
const { forEachLine, SCHEMA_VERSION } = require("../public/db/fileStore");

/* ----------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const at = argv.indexOf(name);
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
};

/** Where Electron puts it on Windows, which is where every install of this is. */
const defaultDir = () =>
  path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Diamond QR",
    "data"
  );

const dir = path.resolve(value("--dir") || defaultDir());
const outFile = value("--out");
const write = flag("--write");

const snapshotFile = path.join(dir, "snapshot.json");
const backupOfSnapshot = path.join(dir, "snapshot.bak");
const journalFile = path.join(dir, "journal.jsonl");
const backupDir = path.join(dir, "backups");

/* ------------------------------------------------------------------ helpers */

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

const sizeOf = (file) => {
  try {
    return fs.statSync(file).size;
  } catch (error) {
    return -1;
  }
};

const describe = (file) => {
  const size = sizeOf(file);
  return size < 0 ? "missing" : mb(size);
};

const rowCounts = (state) =>
  `${Object.keys(state.kapans || {}).length} kapans, ` +
  `${Object.keys(state.lots || {}).length} lots, ` +
  `${Object.keys(state.packets || {}).length} packets`;

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const say = (line = "") => process.stdout.write(`${line}\n`);

const die = (message) => {
  process.stderr.write(`\n  ${message}\n\n`);
  process.exit(1);
};

/**
 * Reads a snapshot that may itself be too large for one string. A snapshot that
 * big cannot be parsed by any means we have here, so it is reported rather than
 * guessed at - the .bak or a dated backup is the way out.
 */
const readSnapshot = (file) => {
  const size = sizeOf(file);
  if (size < 0) return null;
  if (size > 400 * 1024 * 1024) {
    die(
      `${path.basename(file)} is ${mb(size)}, which is past what can be parsed.\n` +
        `  Try --dir on a copy and recover from snapshot.bak or backups/ instead.\n` +
        `  Nothing has been changed.`
    );
  }

  const raw = fs.readFileSync(file, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
};

/* --------------------------------------------------------------- inspection */

say();
say(`  Data folder: ${dir}`);

if (!fs.existsSync(dir)) {
  die(`That folder does not exist. Pass the right one with --dir.`);
}

say();
say(`    snapshot.json   ${describe(snapshotFile)}`);
say(`    snapshot.bak    ${describe(backupOfSnapshot)}`);
say(`    journal.jsonl   ${describe(journalFile)}`);
say(
  `    backups/        ${
    fs.existsSync(backupDir) ? `${fs.readdirSync(backupDir).length} file(s)` : "missing"
  }`
);
say();

let base = readSnapshot(snapshotFile);
let baseName = "snapshot.json";

if (!base) {
  base = readSnapshot(backupOfSnapshot);
  baseName = "snapshot.bak";
}

if (base && base.schema !== SCHEMA_VERSION) {
  die(
    `${baseName} is schema ${base.schema}; this tool understands ${SCHEMA_VERSION}.\n` +
      `  Nothing has been changed. Use the matching version of the app.`
  );
}

if (!base) {
  say(`  No readable snapshot - starting from empty and replaying the journal alone.`);
  baseName = "nothing";
  base = { schema: SCHEMA_VERSION, kapans: {}, lots: {}, packets: {} };
}

let state = {
  schema: SCHEMA_VERSION,
  kapans: base.kapans || {},
  lots: base.lots || {},
  packets: base.packets || {},
};

say(`  Base (${baseName}): ${rowCounts(state)}`);

/* ------------------------------------------------------------------- replay */

let applied = 0;
let skipped = 0;
let lastSkipped = 0;

const seen = forEachLine(journalFile, (line, index) => {
  try {
    state = applyDelta(state, JSON.parse(line));
    applied += 1;
  } catch (error) {
    skipped += 1;
    lastSkipped = index;
    say(`    ! line ${index} is unreadable and was skipped (${error.message})`);
  }
});

say(`  Journal: ${seen.lines} line(s), ${applied} applied, ${skipped} skipped`);
say(`  Rebuilt: ${rowCounts(state)}`);
say();

if (skipped && !(skipped === 1 && lastSkipped === seen.lines)) {
  say(`  NOTE: a skipped line in the middle of the journal means one commit could`);
  say(`        not be replayed. A torn LAST line is normal after a power cut; this`);
  say(`        is not. Keep the folder and check with support before --write.`);
  say();
}

/* -------------------------------------------------------------------- write */

const serialised = JSON.stringify(state);

if (outFile) {
  const target = path.resolve(outFile);
  fs.writeFileSync(target, serialised, "utf8");
  say(`  Wrote the rebuilt state to ${target}`);
  say();
}

if (!write) {
  say(`  Dry run - nothing on disk was changed.`);
  say(`  Re-run with --write to fold the journal into snapshot.json.`);
  say();
  process.exit(0);
}

const recoveredDir = path.join(dir, `recovered-${stamp()}`);
fs.mkdirSync(recoveredDir, { recursive: true });

// The order below is what keeps this safe at every instant. The originals are
// copied aside first; the journal only stops being replayable once the rebuilt
// snapshot is fully written to its temp file; and the live snapshot is replaced
// last, by a rename, which is atomic. A crash anywhere leaves either the old
// pair intact or the recovered-<stamp> folder holding both originals.
if (fs.existsSync(snapshotFile)) {
  fs.copyFileSync(snapshotFile, path.join(recoveredDir, "snapshot.json"));
}
if (fs.existsSync(backupOfSnapshot)) {
  fs.copyFileSync(backupOfSnapshot, path.join(recoveredDir, "snapshot.bak"));
}

const temporary = `${snapshotFile}.tmp`;
fs.writeFileSync(temporary, serialised, "utf8");

if (fs.existsSync(journalFile)) {
  // Moved, not copied: a half-gigabyte copy needs a half-gigabyte free, and a
  // rename on the same volume needs none. The file is preserved either way.
  fs.renameSync(journalFile, path.join(recoveredDir, "journal.jsonl"));
}
fs.writeFileSync(journalFile, "", "utf8");

fs.renameSync(temporary, snapshotFile);

// A dated copy too, so the rebuilt state is in two places before anyone reopens
// the app and starts writing to it again.
fs.mkdirSync(backupDir, { recursive: true });
const dated = path.join(backupDir, `diamond-qr-recovered-${stamp()}.json`);
fs.writeFileSync(
  dated,
  JSON.stringify({ savedAt: new Date().toISOString(), data: state }),
  "utf8"
);

say(`  Rebuilt snapshot.json  (${mb(Buffer.byteLength(serialised, "utf8"))})`);
say(`  Originals kept in      ${recoveredDir}`);
say(`  Extra copy written to  ${dated}`);
say();
say(`  Nothing was deleted. Once the app opens and the data looks right, the`);
say(`  recovered-<stamp> folder can be archived off the machine.`);
say();
