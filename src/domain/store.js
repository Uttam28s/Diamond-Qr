/**
 * The single door between the UI and the data.
 *
 * Nothing in `src/Componants` touches persistence directly. That matters more
 * than usual here: in phase 4 one PC becomes the host and the others talk to it
 * over the network, and if screens reached into storage themselves that change
 * would touch every screen instead of one file.
 *
 * A persistence adapter is anything with `load()` and `save(state)` returning
 * promises. Two exist by design - the local one below, and later a SQLite one
 * over IPC. A client PC keeps the local adapter regardless, because scanning has
 * to keep working while the host is unreachable.
 *
 * The rule this file exists to enforce: **a failed write is never silent.**
 * The previous storage helper caught its quota error, returned false, and every
 * caller ignored it - so a full disk meant the screen showed a saved record that
 * was not on disk. Here a failed save rolls the in-memory state back to what was
 * actually persisted and reports the failure, so the UI can never disagree with
 * the disk.
 */

import { emptyState } from "./operations";
import { SCHEMA_VERSION } from "./model";

export const STORAGE_KEY = "diamondQrData";
/** Where the pre-lots data is parked on first run, rather than overwritten. */
export const LEGACY_BACKUP_KEY = "diamondQrLegacyBackup";

const UNDO_LIMIT = 25;

/* ------------------------------------------------------------ local adapter */

/**
 * Browser-storage adapter. Also used on a client PC as the offline scan queue's
 * backing store, so this is not throwaway code.
 */
export const createLocalAdapter = (storage) => {
  const store = storage || (typeof window !== "undefined" ? window.localStorage : null);

  if (!store) {
    throw new Error("No storage available for the local adapter.");
  }

  return {
    name: "local",

    async load() {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) {
        archiveLegacyData(store);
        return emptyState();
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        // Refusing to start beats silently starting empty and letting the owner
        // scan a day's work into a store that is about to overwrite the real one.
        throw new Error(
          "The saved data could not be read. Restore a backup from Settings before continuing."
        );
      }

      if (!parsed || typeof parsed !== "object") return emptyState();

      if (parsed.schema !== SCHEMA_VERSION) {
        throw new Error(
          `This data was written by a different version (schema ${parsed.schema}, expected ${SCHEMA_VERSION}).`
        );
      }

      return {
        schema: SCHEMA_VERSION,
        kapans: parsed.kapans || {},
        lots: parsed.lots || {},
        packets: parsed.packets || {},
      };
    },

    async save(state) {
      try {
        store.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        // QuotaExceededError is the one that actually happens, and it is exactly
        // the case that used to pass unnoticed.
        const isQuota =
          error &&
          (error.name === "QuotaExceededError" ||
            error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
            error.code === 22);

        throw new Error(
          isQuota
            ? "This device is out of storage space, so nothing was saved. Export a backup and delete old Kapans, or move to the host PC."
            : `Saving failed: ${(error && error.message) || "unknown error"}`
        );
      }
    },
  };
};

/**
 * The pre-lots build stored Kapans under its own keys. Nothing is migrated - the
 * owner confirmed the old data is test data only - but it is copied aside once
 * rather than left to be overwritten, because "test data" is a judgement made
 * from memory and this costs one line.
 */
const archiveLegacyData = (store) => {
  try {
    if (store.getItem(LEGACY_BACKUP_KEY)) return;

    const legacy = {
      kapans: store.getItem("diamondQrKapans"),
      session: store.getItem("diamondQrScanSession"),
    };
    if (!legacy.kapans && !legacy.session) return;

    store.setItem(
      LEGACY_BACKUP_KEY,
      JSON.stringify({ archivedAt: new Date().toISOString(), ...legacy })
    );
  } catch (error) {
    // Losing the archive is not worth blocking startup over.
  }
};

/* ------------------------------------------------------------------- store */

export const createStore = ({ adapter, deviceName = "" } = {}) => {
  if (!adapter) throw new Error("createStore needs a persistence adapter.");

  let state = emptyState();
  let persisted = state;
  let loaded = false;
  let undoStack = [];
  const listeners = new Set();

  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  /**
   * Applies an operation, persists, notifies. On a save failure the in-memory
   * state goes back to what is actually on disk before anyone is told, so the
   * screen and the disk cannot drift apart.
   */
  const commit = async (next, undo) => {
    // Roll back to what is on disk, not to the last in-memory value: those are
    // the same thing unless an earlier save already failed, and in that case the
    // disk is the only version anyone can trust.
    const lastGood = persisted;

    state = next;
    notify();

    try {
      await adapter.save(next);
      persisted = next;
      if (undo) {
        undoStack = [...undoStack, undo].slice(-UNDO_LIMIT);
      }
      // The new state is returned as well as pushed to subscribers, because a
      // caller that has just created something needs to find it before React has
      // re-rendered with the update.
      return { ok: true, label: undo ? undo.label : "", state: next };
    } catch (error) {
      state = lastGood;
      persisted = lastGood;
      notify();
      return { ok: false, error: error.message };
    }
  };

  return {
    get deviceName() {
      return deviceName;
    },

    getState: () => state,
    isLoaded: () => loaded,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async load() {
      const next = await adapter.load();
      state = next;
      persisted = next;
      loaded = true;
      undoStack = [];
      notify();
      return next;
    },

    /**
     * Runs an operation from `operations.js`.
     *
     * @param operation state => {state, undo, error}
     * @returns {ok, error?, label?}
     */
    async run(operation) {
      const outcome = operation(state);

      if (outcome.error) return { ok: false, error: outcome.error };
      if (outcome.state === state) return { ok: true, label: "", state };

      return commit(outcome.state, outcome.undo);
    },

    /** Runs several operations as one undoable step - used by bulk actions. */
    async runAll(operations = []) {
      let working = state;
      const undos = [];

      for (const operation of operations) {
        const outcome = operation(working);
        if (outcome.error) return { ok: false, error: outcome.error };
        if (outcome.undo) undos.push(outcome.undo);
        working = outcome.state;
      }

      if (working === state) return { ok: true, label: "", state };

      return commit(working, {
        label: undos.length === 1 ? undos[0].label : `${undos.length} changes`,
        // Undone newest first, or an earlier inverse would be applied to a state
        // that a later one has not been peeled off yet.
        apply: (current) => undos.reduceRight((acc, undo) => undo.apply(acc), current),
      });
    },

    canUndo: () => undoStack.length > 0,
    nextUndoLabel: () => (undoStack.length ? undoStack[undoStack.length - 1].label : ""),

    async undo() {
      if (!undoStack.length) return { ok: false, error: "Nothing to undo." };

      const entry = undoStack[undoStack.length - 1];
      const reverted = entry.apply(state);
      undoStack = undoStack.slice(0, -1);

      const outcome = await commit(reverted, null);
      if (!outcome.ok) {
        // The save failed, so the undo did not happen - put it back on the stack
        // rather than quietly losing the ability to reverse it.
        undoStack = [...undoStack, entry];
        return outcome;
      }

      return { ok: true, label: `Undone: ${entry.label}` };
    },

    /* ------------------------------------------------------ backup / restore */

    exportBackup() {
      return JSON.stringify(
        { exportedAt: new Date().toISOString(), device: deviceName, data: state },
        null,
        2
      );
    },

    async importBackup(json) {
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch (error) {
        return { ok: false, error: "That file is not valid backup JSON." };
      }

      const data = parsed && parsed.data ? parsed.data : parsed;

      if (!data || typeof data !== "object" || !data.kapans) {
        return { ok: false, error: "That file does not contain Diamond QR data." };
      }

      if (data.schema !== SCHEMA_VERSION) {
        return {
          ok: false,
          error: `That backup is schema ${data.schema}; this version reads schema ${SCHEMA_VERSION}.`,
        };
      }

      const next = {
        schema: SCHEMA_VERSION,
        kapans: data.kapans || {},
        lots: data.lots || {},
        packets: data.packets || {},
      };

      // Captured before the commit: `persisted` is about to become the restored
      // data, so reading it inside apply() would "undo" to the backup itself.
      const replaced = persisted;

      // Earlier undo entries close over lots and packets that the restored data
      // may not contain, so they are dropped. This has to happen BEFORE the
      // commit, or it would also drop the restore's own undo entry and make
      // replacing all the data the one change that cannot be reversed.
      undoStack = [];

      return commit(next, { label: "Backup restored", apply: () => replaced });
    },
  };
};
