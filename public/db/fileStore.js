/**
 * The host's durable store: a snapshot plus an append-only journal.
 *
 * Why not SQLite - which the plan called for: the host process is the only
 * writer in this architecture, so the cross-process transactions SQLite would
 * provide are not needed. What IS needed is a write that does not rewrite the
 * whole dataset per keystroke, and crash safety. A journal gives both, in a
 * hundred lines, with no native module - and this project has already been bitten
 * once by native modules in the packaged app (see ADMIN-LICENSING.md §7a).
 *
 * On disk:
 *
 *   snapshot.json     the state as of the last compaction
 *   journal.jsonl     one delta per line, appended since then
 *   snapshot.bak      the previous snapshot, kept until the next compaction
 *   backups/          a dated copy per day, newest 14 kept
 *
 * Loading replays the journal onto the snapshot. Compaction writes a fresh
 * snapshot and truncates. Both the snapshot and each backup are written to a
 * temporary file and renamed, because rename is atomic on NTFS and a half-written
 * snapshot is the one failure that could lose everything.
 */

const fs = require("fs");
const path = require("path");
const { applyDelta, computeDelta } = require("../shared/delta");

const SCHEMA_VERSION = 3;
const COMPACT_AFTER = 250;
const BACKUPS_KEPT = 14;

const emptyState = () => ({
  schema: SCHEMA_VERSION,
  kapans: {},
  lots: {},
  packets: {},
});

const readJsonFile = (file) => {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw.trim() ? JSON.parse(raw) : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

/** Write to a temp file then rename, so a reader never sees a partial file. */
const writeAtomic = (file, text) => {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, text, "utf8");
  fs.renameSync(temporary, file);
};

const createFileStore = ({ dir }) => {
  if (!dir) throw new Error("createFileStore needs a directory.");

  const snapshotFile = path.join(dir, "snapshot.json");
  const backupOfSnapshot = path.join(dir, "snapshot.bak");
  const journalFile = path.join(dir, "journal.jsonl");
  const backupDir = path.join(dir, "backups");

  fs.mkdirSync(dir, { recursive: true });

  let state = emptyState();
  let journalLines = 0;
  // The last state written, so a save only has to record what changed.
  let persisted = state;
  let version = 0;

  /* -------------------------------------------------------------- loading */

  const load = () => {
    let base = readJsonFile(snapshotFile);

    if (!base) {
      // A crash between truncating the journal and renaming the new snapshot is
      // the only way to get here with data still on disk, and .bak is exactly
      // that data.
      base = readJsonFile(backupOfSnapshot);
      if (base) {
        // eslint-disable-next-line no-console
        console.warn("[store] snapshot.json missing; recovered from snapshot.bak");
      }
    }

    if (base && base.schema !== SCHEMA_VERSION) {
      throw new Error(
        `Data on disk is schema ${base.schema}; this version reads schema ${SCHEMA_VERSION}.`
      );
    }

    state = base
      ? {
          schema: SCHEMA_VERSION,
          kapans: base.kapans || {},
          lots: base.lots || {},
          packets: base.packets || {},
        }
      : emptyState();

    journalLines = 0;

    let journal = "";
    try {
      journal = fs.readFileSync(journalFile, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    journal
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        try {
          state = applyDelta(state, JSON.parse(line));
          journalLines += 1;
        } catch (error) {
          // A torn final line is expected after a hard power loss: the write was
          // in flight. Everything before it is intact, so the right thing is to
          // drop that one record and carry on rather than refuse to open.
          // eslint-disable-next-line no-console
          console.warn(`[store] ignoring unreadable journal line ${index + 1}`);
        }
      });

    persisted = state;
    version += 1;
    return state;
  };

  /* --------------------------------------------------------------- saving */

  const compact = () => {
    // The current snapshot becomes the .bak before it is replaced, so there is
    // always one complete file on disk at every instant.
    if (fs.existsSync(snapshotFile)) {
      fs.copyFileSync(snapshotFile, backupOfSnapshot);
    }
    writeAtomic(snapshotFile, JSON.stringify(state));
    fs.writeFileSync(journalFile, "", "utf8");
    journalLines = 0;
  };

  const save = (next) => {
    const delta = computeDelta(persisted, next);
    state = next;

    if (!delta) {
      persisted = next;
      return { version };
    }

    fs.appendFileSync(journalFile, `${JSON.stringify(delta)}\n`, "utf8");
    journalLines += 1;
    persisted = next;
    version += 1;

    if (journalLines >= COMPACT_AFTER) compact();

    return { version };
  };

  /**
   * Applies a delta that came from a client. Returns the new state so the caller
   * can broadcast it - clients poll the version and refetch when it moves.
   */
  const applyRemote = (delta) => {
    const next = applyDelta(state, delta);
    save(next);
    return next;
  };

  /* -------------------------------------------------------------- backups */

  /**
   * One dated copy per day. A day's granularity is the right trade: it survives
   * the realistic disaster (a disk dying, or someone deleting a Kapan and not
   * noticing for a week) without filling the disk with near-identical files.
   */
  const backup = () => {
    fs.mkdirSync(backupDir, { recursive: true });

    const today = new Date();
    const stamp = [
      today.getFullYear(),
      `${today.getMonth() + 1}`.padStart(2, "0"),
      `${today.getDate()}`.padStart(2, "0"),
    ].join("-");

    const file = path.join(backupDir, `diamond-qr-${stamp}.json`);
    writeAtomic(file, JSON.stringify({ savedAt: today.toISOString(), data: state }));

    const kept = fs
      .readdirSync(backupDir)
      .filter((name) => name.startsWith("diamond-qr-") && name.endsWith(".json"))
      .sort();

    kept.slice(0, Math.max(0, kept.length - BACKUPS_KEPT)).forEach((name) => {
      try {
        fs.unlinkSync(path.join(backupDir, name));
      } catch (error) {
        // A backup we cannot delete is not worth failing a launch over.
      }
    });

    return file;
  };

  return {
    load,
    save,
    applyRemote,
    backup,
    compact,
    getState: () => state,
    getVersion: () => version,
    stats: () => ({ journalLines, dir }),
  };
};

module.exports = { createFileStore, emptyState, SCHEMA_VERSION, COMPACT_AFTER };
