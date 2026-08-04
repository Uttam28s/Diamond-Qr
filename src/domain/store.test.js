import {
  createLocalAdapter,
  createStore,
  LEGACY_BACKUP_KEY,
  STORAGE_KEY,
} from "./store";
import {
  createKapan,
  createLot,
  deleteKapan,
  emptyState,
  kapanByNumber,
  lotsOfKapan,
  updateLot,
} from "./operations";
import { SCHEMA_VERSION } from "./model";

/** Minimal localStorage stand-in, with a switch to make writes fail. */
const fakeStorage = () => {
  const map = new Map();
  return {
    failNextWrite: null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem(key, value) {
      if (this.failNextWrite) {
        const error = new Error("full");
        error.name = this.failNextWrite;
        this.failNextWrite = null;
        throw error;
      }
      map.set(key, value);
    },
    removeItem: (key) => map.delete(key),
    _map: map,
  };
};

const newStore = (storage = fakeStorage()) => ({
  storage,
  store: createStore({ adapter: createLocalAdapter(storage), deviceName: "TEST-PC" }),
});

describe("loading", () => {
  it("starts empty on a fresh device", async () => {
    const { store } = newStore();
    const state = await store.load();
    expect(state).toEqual(emptyState());
    expect(store.isLoaded()).toBe(true);
  });

  it("round-trips what it saved", async () => {
    const storage = fakeStorage();
    const first = newStore(storage);
    await first.store.load();
    await first.store.run((s) => createKapan(s, { number: "41", season: "25-26" }));

    const second = newStore(storage);
    const reloaded = await second.store.load();
    expect(kapanByNumber(reloaded, "41")).toBeTruthy();
  });

  it("refuses to start on unreadable data rather than starting empty", async () => {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const { store } = newStore(storage);

    // Starting empty here would invite a day of scanning into a store that is
    // about to overwrite the real one.
    await expect(store.load()).rejects.toThrow(/could not be read/);
  });

  it("refuses data from a different schema version", async () => {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ schema: 99, kapans: {} }));
    const { store } = newStore(storage);
    await expect(store.load()).rejects.toThrow(/schema 99/);
  });

  it("parks pre-lots data aside instead of overwriting it", async () => {
    const storage = fakeStorage();
    storage.setItem("diamondQrKapans", JSON.stringify({ "41": { records: [] } }));
    const { store } = newStore(storage);

    await store.load();

    const archived = JSON.parse(storage.getItem(LEGACY_BACKUP_KEY));
    expect(archived.kapans).toContain("41");
    expect(archived.archivedAt).toBeTruthy();
  });

  it("archives only once, so a later run cannot clobber the archive", async () => {
    const storage = fakeStorage();
    storage.setItem("diamondQrKapans", JSON.stringify({ "41": {} }));

    await newStore(storage).store.load();
    const firstArchive = storage.getItem(LEGACY_BACKUP_KEY);

    storage.setItem("diamondQrKapans", JSON.stringify({ "99": {} }));
    await newStore(storage).store.load();

    expect(storage.getItem(LEGACY_BACKUP_KEY)).toBe(firstArchive);
  });
});

describe("a failed save is never silent", () => {
  it("reports the failure and rolls the screen back to what is on disk", async () => {
    const { store, storage } = newStore();
    await store.load();
    await store.run((s) => createKapan(s, { number: "41" }));
    const onDisk = store.getState();

    storage.failNextWrite = "QuotaExceededError";
    const outcome = await store.run((s) => createKapan(s, { number: "42" }));

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/out of storage space/);
    // The bug this replaces: the UI kept showing Kapan 42 that was never saved.
    expect(kapanByNumber(store.getState(), "42")).toBeNull();
    expect(store.getState()).toEqual(onDisk);
  });

  it("does not add a failed change to the undo stack", async () => {
    const { store, storage } = newStore();
    await store.load();

    storage.failNextWrite = "QuotaExceededError";
    await store.run((s) => createKapan(s, { number: "41" }));

    expect(store.canUndo()).toBe(false);
  });

  it("tells subscribers about the rollback, not just the optimistic change", async () => {
    const { store, storage } = newStore();
    await store.load();
    const seen = [];
    store.subscribe((s) => seen.push(Object.keys(s.kapans).length));

    storage.failNextWrite = "QuotaExceededError";
    await store.run((s) => createKapan(s, { number: "41" }));

    // Shown optimistically, then taken back once the write failed.
    expect(seen).toEqual([1, 0]);
  });

  it("keeps a plain save error readable", async () => {
    const { store, storage } = newStore();
    await store.load();
    storage.failNextWrite = "TypeError";
    const outcome = await store.run((s) => createKapan(s, { number: "41" }));
    expect(outcome.error).toMatch(/Saving failed/);
  });
});

describe("running operations", () => {
  it("passes a refusal straight through without saving", async () => {
    const { store } = newStore();
    await store.load();
    await store.run((s) => createKapan(s, { number: "41" }));

    const outcome = await store.run((s) => createKapan(s, { number: "41" }));
    expect(outcome).toEqual({ ok: false, error: "Kapan 41 already exists." });
    expect(store.canUndo()).toBe(true); // only the first create is undoable
  });

  it("notifies subscribers on success", async () => {
    const { store } = newStore();
    await store.load();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    await store.run((s) => createKapan(s, { number: "41" }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await store.run((s) => createKapan(s, { number: "42" }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("undo", () => {
  const seeded = async () => {
    const { store, storage } = newStore();
    await store.load();
    await store.run((s) => createKapan(s, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;
    await store.run((s) => createLot(s, kapanId, { pcs: 142, charmi: -2 }));
    return { store, storage, kapanId };
  };

  it("reverses the last change and persists the reversal", async () => {
    const { store, storage, kapanId } = await seeded();
    expect(store.nextUndoLabel()).toMatch(/Lot 1 added/);

    const outcome = await store.undo();
    expect(outcome.ok).toBe(true);
    expect(lotsOfKapan(store.getState(), kapanId)).toHaveLength(0);

    // Persisted, not just reverted in memory.
    const onDisk = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(Object.keys(onDisk.lots)).toHaveLength(0);
  });

  it("walks back through several changes in order", async () => {
    const { store, kapanId } = await seeded();
    const lot = lotsOfKapan(store.getState(), kapanId)[0];

    await store.run((s) => updateLot(s, lot.id, { pcs: 200 }));
    await store.run((s) => updateLot(s, lot.id, { pcs: 300 }));

    expect(store.getState().lots[lot.id].pcs).toBe(300);
    await store.undo();
    expect(store.getState().lots[lot.id].pcs).toBe(200);
    await store.undo();
    expect(store.getState().lots[lot.id].pcs).toBe(142);
  });

  it("restores a deleted Kapan whole", async () => {
    const { store, kapanId } = await seeded();
    const before = store.getState();

    await store.run((s) => deleteKapan(s, kapanId));
    expect(Object.keys(store.getState().kapans)).toHaveLength(0);

    await store.undo();
    expect(store.getState()).toEqual(before);
  });

  it("says so when there is nothing to undo", async () => {
    const { store } = newStore();
    await store.load();
    expect(await store.undo()).toEqual({ ok: false, error: "Nothing to undo." });
  });

  it("keeps the entry on the stack if undoing fails to save", async () => {
    const { store, storage } = await seeded();

    storage.failNextWrite = "QuotaExceededError";
    const failed = await store.undo();

    expect(failed.ok).toBe(false);
    // Losing the ability to reverse a change because the disk was briefly full
    // would be its own bug.
    expect(store.canUndo()).toBe(true);
    expect(await store.undo()).toMatchObject({ ok: true });
  });

  it("clears the stack on load, since it is in-memory only", async () => {
    const { store, storage } = await seeded();
    expect(store.canUndo()).toBe(true);

    const reopened = newStore(storage).store;
    await reopened.load();
    expect(reopened.canUndo()).toBe(false);
  });
});

describe("runAll - several changes as one undoable step", () => {
  it("commits them together", async () => {
    const { store } = newStore();
    await store.load();
    await store.run((s) => createKapan(s, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;

    await store.runAll([
      (s) => createLot(s, kapanId, { pcs: 100 }),
      (s) => createLot(s, kapanId, { pcs: 200 }),
      (s) => createLot(s, kapanId, { pcs: 300 }),
    ]);

    expect(lotsOfKapan(store.getState(), kapanId)).toHaveLength(3);
    expect(store.nextUndoLabel()).toBe("3 changes");
  });

  it("one undo reverses all of them", async () => {
    const { store } = newStore();
    await store.load();
    await store.run((s) => createKapan(s, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;
    const before = store.getState();

    await store.runAll([
      (s) => createLot(s, kapanId, { pcs: 100 }),
      (s) => createLot(s, kapanId, { pcs: 200 }),
    ]);
    await store.undo();

    expect(store.getState()).toEqual(before);
  });

  it("aborts the whole batch if any step is refused", async () => {
    const { store } = newStore();
    await store.load();
    const before = store.getState();

    const outcome = await store.runAll([
      (s) => createKapan(s, { number: "41" }),
      (s) => createKapan(s, { number: "41" }), // duplicate
      (s) => createKapan(s, { number: "42" }),
    ]);

    expect(outcome.ok).toBe(false);
    // Nothing at all was written - a half-applied batch is worse than none.
    expect(store.getState()).toEqual(before);
  });
});

describe("backup and restore", () => {
  it("exports data that imports back into a clean device", async () => {
    const source = newStore();
    await source.store.load();
    await source.store.run((s) => createKapan(s, { number: "41", season: "25-26" }));
    const kapanId = kapanByNumber(source.store.getState(), "41").id;
    await source.store.run((s) => createLot(s, kapanId, { pcs: 142, charmi: -2 }));

    const backup = source.store.exportBackup();

    const target = newStore();
    await target.store.load();
    const outcome = await target.store.importBackup(backup);

    expect(outcome.ok).toBe(true);
    expect(target.store.getState()).toEqual(source.store.getState());
  });

  it("undoes a restore back to the data it replaced", async () => {
    const target = newStore();
    await target.store.load();
    await target.store.run((s) => createKapan(s, { number: "99" }));
    const original = target.store.getState();

    const source = newStore();
    await source.store.load();
    await source.store.run((s) => createKapan(s, { number: "41" }));

    await target.store.importBackup(source.store.exportBackup());
    expect(kapanByNumber(target.store.getState(), "41")).toBeTruthy();

    await target.store.undo();
    expect(target.store.getState()).toEqual(original);
  });

  it("rejects a file that is not a backup", async () => {
    const { store } = newStore();
    await store.load();

    expect(await store.importBackup("nonsense")).toMatchObject({ ok: false });
    expect(await store.importBackup('{"hello":1}')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/does not contain/),
    });
  });

  it("rejects a backup from another schema version", async () => {
    const { store } = newStore();
    await store.load();
    const outcome = await store.importBackup(
      JSON.stringify({ data: { schema: 2, kapans: {} } })
    );
    expect(outcome.error).toMatch(/schema 2/);
  });

  it("records the device and the current schema in the file", async () => {
    const { store } = newStore();
    await store.load();
    const backup = JSON.parse(store.exportBackup());
    expect(backup.device).toBe("TEST-PC");
    expect(backup.data.schema).toBe(SCHEMA_VERSION);
  });
});
