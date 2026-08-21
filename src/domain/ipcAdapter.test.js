/**
 * The renderer's adapter driven against the real file store, through a bridge
 * that clones like Electron's does.
 *
 * That clone is the whole point. A customer's app stopped opening with "Cannot
 * create a string longer than 0x1fffffe8 characters" because the renderer sent
 * whole states over IPC, the clone gave the main process fresh objects for every
 * row, and the store - which decides what changed by row identity - therefore
 * recorded the entire dataset in the journal on every keystroke. A test with a
 * bridge that passes objects through by reference would have passed happily
 * while the shipped app filled a disk, so this one clones.
 */

import { createIpcAdapter } from "./ipcAdapter";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { createFileStore } = require("../../public/db/fileStore");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "diamond-qr-ipc-"));

/** What crossing an Electron IPC boundary does to an object graph. */
const clone = (value) => JSON.parse(JSON.stringify(value));

const bridgeFor = (store, { omitCommit = false } = {}) => {
  const data = {
    load: async () => ({
      ok: true,
      state: clone(store.getState()),
      version: store.getVersion(),
    }),
    save: async (state) => ({ ok: true, version: store.save(clone(state)).version }),
    backup: async () => ({ ok: true, path: store.backup() }),
  };

  if (!omitCommit) {
    data.commit = async (delta) => ({ ok: true, version: store.commit(clone(delta)).version });
  }

  return { data };
};

const packet = (id) => ({
  id,
  kapanId: "k1",
  lotId: "l1",
  rawCode: `code-${id}`,
  kachuWeight: 1.02,
  polishedWeight: 0.41,
  scannedAt: "2026-07-17T09:15:32.000Z",
});

/** A dataset big enough that whole-state writes are obvious in the file sizes. */
const seed = (store) => {
  const state = {
    schema: 3,
    kapans: { k1: { id: "k1", number: "41", season: "25-26" } },
    lots: { l1: { id: "l1", kapanId: "k1", lotNo: 1, pcs: 0, charmi: -2 } },
    packets: {},
  };
  for (let index = 0; index < 2000; index += 1) {
    state.packets[`p${index}`] = packet(`p${index}`);
  }
  store.save(state);
  store.compact();
  return state;
};

describe("the IPC adapter", () => {
  let dir;
  let store;

  beforeEach(() => {
    dir = tempDir();
    store = createFileStore({ dir });
    store.load();
  });

  const journalSize = () => {
    try {
      return fs.statSync(path.join(dir, "journal.jsonl")).size;
    } catch (error) {
      return 0;
    }
  };

  it("writes one row per scan instead of the whole dataset", async () => {
    seed(store);

    const adapter = createIpcAdapter(bridgeFor(store));
    let state = await adapter.load();
    const snapshotSize = fs.statSync(path.join(dir, "snapshot.json")).size;

    // Twenty scans, each building a new object only for the rows it touches -
    // exactly what operations.js does.
    for (let index = 0; index < 20; index += 1) {
      const id = `new${index}`;
      state = {
        ...state,
        packets: { ...state.packets, [id]: packet(id) },
        lots: { ...state.lots, l1: { ...state.lots.l1, pcs: index + 1 } },
      };
      // eslint-disable-next-line no-await-in-loop
      await adapter.save(state);
    }

    // The regression: twenty whole-dataset lines would be twenty times the
    // snapshot. A tenth of one snapshot leaves that impossible to reach by
    // accident again.
    expect(journalSize()).toBeLessThan(snapshotSize / 10);

    const lines = fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(20);
    lines.forEach((line) => {
      const delta = JSON.parse(line);
      expect(Object.keys(delta.upserts.packets)).toHaveLength(1);
      // The lot's count moved by one and travels as a shift, not as a row.
      expect(Object.keys(delta.upserts.lots)).toHaveLength(0);
      expect(delta.counters.lots.l1).toBe(1);
    });
  });

  it("keeps the disk and the screen in agreement", async () => {
    seed(store);

    const adapter = createIpcAdapter(bridgeFor(store));
    let state = await adapter.load();

    state = {
      ...state,
      packets: { ...state.packets, fresh: packet("fresh") },
      lots: { ...state.lots, l1: { ...state.lots.l1, pcs: 7 } },
    };
    await adapter.save(state);

    state = { ...state, kapans: { ...state.kapans, k1: { ...state.kapans.k1, number: "42" } } };
    await adapter.save(state);

    const onDisk = createFileStore({ dir }).load();
    expect(Object.keys(onDisk.packets)).toHaveLength(2001);
    expect(onDisk.packets.fresh).toBeTruthy();
    expect(onDisk.lots.l1.pcs).toBe(7);
    expect(onDisk.kapans.k1.number).toBe("42");
  });

  it("measures the next change from the last write that actually landed", async () => {
    seed(store);

    const bridge = bridgeFor(store);
    const adapter = createIpcAdapter(bridge);
    const loaded = await adapter.load();

    // A save that fails - a full disk, in practice.
    bridge.data.commit = async () => ({ ok: false, error: "Saving to disk failed: no space" });
    const failed = {
      ...loaded,
      packets: { ...loaded.packets, lost: packet("lost") },
    };
    await expect(adapter.save(failed)).rejects.toThrow(/no space/);

    // The store above rolls back to what was persisted, and the next save is
    // measured from there - so the row that never landed is not silently skipped
    // when the disk comes back.
    bridge.data.commit = async (delta) => ({
      ok: true,
      version: store.commit(clone(delta)).version,
    });
    const retried = {
      ...loaded,
      packets: { ...loaded.packets, lost: packet("lost"), later: packet("later") },
    };
    await adapter.save(retried);

    const onDisk = createFileStore({ dir }).load();
    expect(onDisk.packets.lost).toBeTruthy();
    expect(onDisk.packets.later).toBeTruthy();
  });

  it("falls back to a whole-state save when the bridge has no commit channel", async () => {
    seed(store);

    const adapter = createIpcAdapter(bridgeFor(store, { omitCommit: true }));
    const loaded = await adapter.load();

    await adapter.save({
      ...loaded,
      packets: { ...loaded.packets, fresh: packet("fresh") },
    });

    // Larger on disk, but the data is right - which is the point of keeping it.
    expect(createFileStore({ dir }).load().packets.fresh).toBeTruthy();
  });

  it("refuses to be built without the bridge", () => {
    expect(() => createIpcAdapter(null)).toThrow(/needs the Electron data bridge/);
  });
});
