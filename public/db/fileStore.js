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
 *
 * Two rules here were learned from a customer whose app stopped opening with
 * "Cannot create a string longer than 0x1fffffe8 characters":
 *
 *   1. The journal is read a chunk at a time, never as one string. V8 caps a
 *      string at ~512 MB, so readFileSync(journal, "utf8") turns a large but
 *      perfectly intact journal into a file the app cannot open at all.
 *   2. Compaction is triggered by BYTES as well as by line count. A line count is
 *      no ceiling on file size: one line can be megabytes, and 250 of those is
 *      half a gigabyte.
 */

const fs = require("fs");
const path = require("path");
const { StringDecoder } = require("string_decoder");
const { applyDelta, applyDeltaInPlace, computeDelta } = require("../shared/delta");

const SCHEMA_VERSION = 3;
const COMPACT_AFTER = 250;
/** The other compaction trigger. See rule 2 above. */
const COMPACT_BYTES = 8 * 1024 * 1024;
const BACKUPS_KEPT = 14;

/** Read the journal in 4 MB bites rather than as one string. */
const READ_CHUNK = 4 * 1024 * 1024;
/**
 * A single journal line this long is not a commit, it is a fault. Kept well under
 * V8's string cap so that such a line can be reported rather than crashing the
 * read that discovers it.
 */
const MAX_LINE_BYTES = 96 * 1024 * 1024;

const emptyState = () => ({
  schema: SCHEMA_VERSION,
  kapans: {},
  lots: {},
  packets: {},
});

const fileSize = (file) => {
  try {
    return fs.statSync(file).size;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
};

const tooLargeToRead = (file, size) =>
  new Error(
    `${path.basename(file)} is ${(size / 1048576).toFixed(0)} MB, which is too large to read. ` +
      "Nothing has been changed or deleted. Contact support with a copy of the data folder."
  );

const readJsonFile = (file) => {
  // Checked before reading, so a snapshot too big for a JS string says what is
  // wrong instead of V8's "Cannot create a string longer than".
  const size = fileSize(file);
  if (size > MAX_LINE_BYTES) throw tooLargeToRead(file, size);

  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw.trim() ? JSON.parse(raw) : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

/**
 * Hands each non-empty line of a file to `onLine`, holding one line in memory at
 * a time. Returns what it saw, so the caller does not have to stat the file.
 *
 * Synchronous because `load()` is: the main process opens the store before it
 * opens a window, and an async load there would mean a window with no data.
 */
const forEachLine = (file, onLine) => {
  let handle;
  try {
    handle = fs.openSync(file, "r");
  } catch (error) {
    if (error.code === "ENOENT") return { bytes: 0, lines: 0 };
    throw error;
  }

  const buffer = Buffer.allocUnsafe(READ_CHUNK);
  // A 4 MB boundary can land in the middle of a multi-byte character, and the
  // Gujarati field names in this data are three bytes each. The decoder holds
  // the partial bytes back until the rest of the character arrives.
  const decoder = new StringDecoder("utf8");

  let pending = "";
  let bytes = 0;
  let lines = 0;

  const flushLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    lines += 1;
    onLine(trimmed, lines);
  };

  try {
    for (;;) {
      const read = fs.readSync(handle, buffer, 0, READ_CHUNK, null);
      if (!read) break;
      bytes += read;

      pending += decoder.write(buffer.slice(0, read));

      // Scanned by index and trimmed once at the end. Re-slicing the buffer per
      // line would be quadratic, and a healthy journal has tens of thousands of
      // small lines in every chunk - the case this whole function is for.
      let start = 0;
      let cut = pending.indexOf("\n", start);
      while (cut !== -1) {
        flushLine(pending.slice(start, cut));
        start = cut + 1;
        cut = pending.indexOf("\n", start);
      }
      if (start) pending = pending.slice(start);

      if (pending.length > MAX_LINE_BYTES) throw tooLargeToRead(file, pending.length);
    }

    pending += decoder.end();
    flushLine(pending);
  } finally {
    fs.closeSync(handle);
  }

  return { bytes, lines };
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
  let journalBytes = 0;
  // The last state written, so a save only has to record what changed.
  let persisted = state;
  let version = 0;

  /* -------------------------------------------------------------- compaction */

  const compact = () => {
    // The current snapshot becomes the .bak before it is replaced, so there is
    // always one complete file on disk at every instant.
    if (fs.existsSync(snapshotFile)) {
      fs.copyFileSync(snapshotFile, backupOfSnapshot);
    }
    writeAtomic(snapshotFile, JSON.stringify(state));
    fs.writeFileSync(journalFile, "", "utf8");
    journalLines = 0;
    journalBytes = 0;
  };

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

    let applied = 0;
    let badLines = 0;
    // Where the last unreadable line was, so a torn final line - which is
    // expected after a power cut - can be told from a hole in the middle, which
    // is not.
    let lastBadLine = 0;

    const seen = forEachLine(journalFile, (line, index) => {
      try {
        // Parsed first, so a torn line is rejected before it can half-apply -
        // and applied in place, because nobody else is holding this state yet
        // and copying it per line is what makes a long journal take minutes.
        const delta = JSON.parse(line);
        applyDeltaInPlace(state, delta);
        applied += 1;
      } catch (error) {
        // Everything before a torn line is intact, so the right thing is to drop
        // that one record and carry on rather than refuse to open.
        badLines += 1;
        lastBadLine = index;
        // eslint-disable-next-line no-console
        console.warn(`[store] ignoring unreadable journal line ${index}`);
      }
    });

    journalLines = applied;
    journalBytes = seen.bytes;

    persisted = state;
    version += 1;

    // An install that has been running the pre-2.2.2 save path arrives here with
    // a journal of whole-dataset lines - the customer who could not open the app
    // had half a gigabyte of them. Folding it into the snapshot now is what makes
    // that install openable and fast again, and it is the same write compaction
    // performs anyway.
    //
    // Only when every line was readable, though: a journal with a hole in it is
    // evidence, and support should see it before it is folded away.
    const cleanReplay = badLines === 0 || (badLines === 1 && lastBadLine === seen.lines);
    if (cleanReplay && (journalBytes >= COMPACT_BYTES || journalLines >= COMPACT_AFTER)) {
      try {
        // eslint-disable-next-line no-console
        console.warn(
          `[store] folding a ${(journalBytes / 1048576).toFixed(1)} MB journal into the snapshot`
        );
        compact();
      } catch (error) {
        // A read-only or full disk must not turn data that replayed perfectly
        // into an app that will not open. The fold is a tidy-up; the state above
        // is already correct without it, and the next save will try again.
        // eslint-disable-next-line no-console
        console.warn(`[store] could not fold the journal away: ${error.message}`);
      }
    }

    return state;
  };

  /* --------------------------------------------------------------- saving */

  /**
   * Appends one delta. Throws before anything in memory has moved if the write
   * fails - a full disk must not leave this process believing it saved.
   */
  const append = (delta) => {
    const line = `${JSON.stringify(delta)}\n`;
    fs.appendFileSync(journalFile, line, "utf8");
    journalLines += 1;
    journalBytes += Buffer.byteLength(line, "utf8");
    version += 1;
  };

  /**
   * Called only once `state` holds the change just appended: compaction writes
   * `state` to the snapshot and then truncates the journal, so running it against
   * a stale state would write the old data and drop the new.
   */
  const maybeCompact = () => {
    if (journalLines >= COMPACT_AFTER || journalBytes >= COMPACT_BYTES) compact();
  };

  /**
   * Records a delta the caller has already worked out, and returns the state it
   * produced.
   *
   * This is the path every writer should use. `save(wholeState)` below can only
   * work out what changed by comparing row identities, and a state that has
   * crossed a process boundary shares none with the one held here - so it wrote
   * the entire dataset per commit. That is what filled a customer's journal to
   * half a gigabyte and left the app unable to open its own data.
   */
  const commit = (delta) => {
    if (!delta) return { version, state };

    const next = applyDelta(state, delta);
    // Worked out first, written second, believed third. If the append throws,
    // nothing here has moved and the caller's rollback is against the truth.
    append(delta);
    state = next;
    persisted = next;
    maybeCompact();

    return { version, state };
  };

  /**
   * Records the difference between what was last persisted and `next`.
   *
   * Correct only when `next` shares row objects with the state already held -
   * true for the tests and the in-process callers, NOT true across IPC. Kept for
   * those callers; anything crossing a process boundary wants `commit(delta)`.
   */
  const save = (next) => {
    const delta = computeDelta(persisted, next);

    if (!delta) {
      state = next;
      persisted = next;
      return { version };
    }

    append(delta);
    state = next;
    persisted = next;
    maybeCompact();

    return { version };
  };

  /**
   * Applies a delta that came from a client. Returns the new state so the caller
   * can broadcast it - clients poll the version and refetch when it moves.
   */
  const applyRemote = (delta) => commit(delta).state;

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
    commit,
    applyRemote,
    backup,
    compact,
    getState: () => state,
    getVersion: () => version,
    stats: () => ({ journalLines, journalBytes, dir }),
  };
};

module.exports = {
  createFileStore,
  emptyState,
  forEachLine,
  SCHEMA_VERSION,
  COMPACT_AFTER,
  COMPACT_BYTES,
};
