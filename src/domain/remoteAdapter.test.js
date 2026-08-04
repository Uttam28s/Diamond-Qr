/**
 * The client adapter against the real host server, over a real socket.
 *
 * Both halves of the protocol are exercised together here - a mocked server
 * would only prove the client agrees with my idea of the server, which is the
 * assumption most worth testing.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const { createFileStore } = require("../../public/db/fileStore");
const { createServer } = require("../../public/net/server");
const shared = require("../../public/shared/delta");

const { computeDelta, isAdditiveOnly, mergeDeltas } = require("./delta");
const { CONNECTION, createRemoteAdapter } = require("./remoteAdapter");
const { createStore } = require("./store");
const {
  addPacket,
  createKapan,
  createLot,
  emptyState,
  kapanByNumber,
  lotsOfKapan,
  updateLot,
} = require("./operations");

/* --------------------------------------------------------------- test rig */

/** Node's fetch is available on Node 18+; this test needs a real one. */
const nodeFetch = (url, options) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: options.method || "GET",
        path: target.pathname + target.search,
        headers: options.headers,
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: () => Promise.resolve(text),
          })
        );
      }
    );

    req.on("error", reject);
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        req.destroy(new Error("aborted"));
      });
    }
    if (options.body) req.write(options.body);
    req.end();
  });

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
};

let host;
let hostStore;
let baseUrl;
let dir;

const startHost = async (options = {}) => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dqr-remote-"));
  hostStore = createFileStore({ dir });
  hostStore.load();
  host = createServer({ store: hostStore, ...options });
  const address = await host.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${address.port}`;
};

const stopHost = async () => {
  if (host) await host.close();
  host = null;
};

const newAdapter = (overrides = {}) =>
  createRemoteAdapter({
    baseUrl,
    deviceId: "station-1",
    deviceName: "SCAN-1",
    storage: memoryStorage(),
    fetchImpl: nodeFetch,
    timeoutMs: 2000,
    ...overrides,
  });

afterEach(async () => {
  await stopHost();
});

/* ========================================================================
   The duplicated delta logic must not drift from the host's copy.
   ======================================================================== */

describe("the client and host delta implementations agree", () => {
  const kapan = { id: "k1" };
  const scanned = { id: "l1", lotNo: 1, pcs: 142, charmi: -2 };

  const cases = [
    [{ schema: 3, kapans: {}, lots: {}, packets: {} }, { schema: 3, kapans: {}, lots: {}, packets: {} }],
    [
      { schema: 3, kapans: {}, lots: {}, packets: {} },
      { schema: 3, kapans: { k1: { id: "k1" } }, lots: {}, packets: {} },
    ],
    [
      { schema: 3, kapans: { k1: { id: "k1" } }, lots: { l1: { id: "l1" } }, packets: {} },
      { schema: 3, kapans: { k1: { id: "k1" } }, lots: {}, packets: { p1: { id: "p1" } } },
    ],
    // A scan into a lot: one more packet, and the lot's નંગ one higher. Both
    // copies have to agree that this is a shift, or a client and its host would
    // disagree about whether the change may be queued.
    [
      { schema: 3, kapans: { k1: kapan }, lots: { l1: scanned }, packets: {} },
      {
        schema: 3,
        kapans: { k1: kapan },
        lots: { l1: { ...scanned, pcs: 143 } },
        packets: { p1: { id: "p1", lotId: "l1" } },
      },
    ],
    // Clearing the pcs cell is not a shift, and both have to agree on that too.
    [
      { schema: 3, kapans: { k1: kapan }, lots: { l1: scanned }, packets: {} },
      { schema: 3, kapans: { k1: kapan }, lots: { l1: { ...scanned, pcs: null } }, packets: {} },
    ],
  ];

  it("computeDelta produces identical output", () => {
    cases.forEach(([before, after]) => {
      expect(computeDelta(before, after)).toEqual(shared.computeDelta(before, after));
    });
  });

  it("isAdditiveOnly agrees", () => {
    cases.forEach(([before, after]) => {
      const delta = computeDelta(before, after);
      expect(isAdditiveOnly(delta)).toBe(shared.isAdditiveOnly(delta));
    });
  });
});

describe("merging queued deltas", () => {
  it("collapses a backlog into one request", () => {
    const merged = mergeDeltas([
      { upserts: { kapans: {}, lots: {}, packets: { p1: { id: "p1" } } }, deletes: {} },
      { upserts: { kapans: {}, lots: {}, packets: { p2: { id: "p2" } } }, deletes: {} },
    ]);
    expect(Object.keys(merged.upserts.packets).sort()).toEqual(["p1", "p2"]);
  });

  it("does not resurrect a row that was later deleted", () => {
    const merged = mergeDeltas([
      { upserts: { kapans: {}, lots: {}, packets: { p1: { id: "p1" } } }, deletes: {} },
      {
        upserts: { kapans: {}, lots: {}, packets: {} },
        deletes: { kapans: [], lots: [], packets: ["p1"] },
      },
    ]);
    expect(merged.upserts.packets.p1).toBeUndefined();
    expect(merged.deletes.packets).toEqual(["p1"]);
  });

  it("adds up the pcs shifts, so twenty queued scans become one +20", () => {
    const merged = mergeDeltas([
      { upserts: { kapans: {}, lots: {}, packets: {} }, deletes: {}, counters: { lots: { l1: 1 } } },
      { upserts: { kapans: {}, lots: {}, packets: {} }, deletes: {}, counters: { lots: { l1: 1, l2: 3 } } },
    ]);
    expect(merged.counters.lots).toEqual({ l1: 2, l2: 3 });
  });

  it("drops a shift for a lot that was later deleted or rewritten", () => {
    const deleted = mergeDeltas([
      { upserts: { kapans: {}, lots: {}, packets: {} }, deletes: {}, counters: { lots: { l1: 4 } } },
      {
        upserts: { kapans: {}, lots: {}, packets: {} },
        deletes: { kapans: [], lots: ["l1"], packets: [] },
      },
    ]);
    expect(deleted.counters.lots.l1).toBeUndefined();

    // A whole row carries the count those shifts produced, so replaying them on
    // top of it would count the same pieces twice.
    const rewritten = mergeDeltas([
      { upserts: { kapans: {}, lots: {}, packets: {} }, deletes: {}, counters: { lots: { l1: 4 } } },
      { upserts: { kapans: {}, lots: { l1: { id: "l1", pcs: 146 } }, packets: {} }, deletes: {} },
    ]);
    expect(rewritten.counters.lots.l1).toBeUndefined();
    expect(rewritten.upserts.lots.l1.pcs).toBe(146);
  });

  it("is null for an empty backlog", () => {
    expect(mergeDeltas([])).toBeNull();
  });
});

/* ========================================================================
   A client driving the real host
   ======================================================================== */

describe("a client against a live host", () => {
  it("loads the host's data and reports itself online", async () => {
    await startHost();
    hostStore.save({
      schema: 3,
      kapans: { k1: { id: "k1", number: "41", season: "25-26" } },
      lots: {},
      packets: {},
    });

    const adapter = newAdapter();
    const loaded = await adapter.load();

    expect(loaded.kapans.k1.number).toBe("41");
    expect(adapter.getStatus()).toBe(CONNECTION.ONLINE);
  });

  it("sends a change through to the host's disk", async () => {
    await startHost();
    const store = createStore({ adapter: newAdapter(), deviceName: "SCAN-1" });
    await store.load();

    const outcome = await store.run((state) => createKapan(state, { number: "41" }));
    expect(outcome.ok).toBe(true);

    // Reopened from disk on the host side, so this is really persisted.
    expect(createFileStore({ dir }).load().kapans).toEqual(
      expect.objectContaining({
        [Object.keys(hostStore.getState().kapans)[0]]: expect.objectContaining({
          number: "41",
        }),
      })
    );
  });

  it("two clients working through one host see each other's data", async () => {
    await startHost();

    const office = createStore({
      adapter: newAdapter({ deviceId: "office", deviceName: "OFFICE-PC" }),
    });
    await office.load();
    await office.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(office.getState(), "41").id;
    await office.run((state) => createLot(state, kapanId, { pcs: 142, charmi: -2 }));

    // A second PC starting up gets everything the first one did.
    const station = createStore({ adapter: newAdapter() });
    const seen = await station.load();

    expect(kapanByNumber(seen, "41")).toBeTruthy();
    expect(lotsOfKapan(seen, kapanId)).toHaveLength(1);
  });

  it("refuses an edit built on a version another PC has moved past", async () => {
    await startHost();

    const office = createStore({
      adapter: newAdapter({ deviceId: "office", deviceName: "OFFICE-PC" }),
    });
    await office.load();
    await office.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(office.getState(), "41").id;
    await office.run((state) => createLot(state, kapanId, { pcs: 142, charmi: -2 }));
    const lotId = lotsOfKapan(office.getState(), kapanId)[0].id;

    // The station loads, then the office edits the same lot underneath it.
    const stationAdapter = newAdapter();
    const station = createStore({ adapter: stationAdapter });
    await station.load();
    await office.run((state) => updateLot(state, lotId, { pcs: 200 }));

    const outcome = await station.run((state) => updateLot(state, lotId, { pcs: 999 }));

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/Another computer changed this first/);
    // The station's screen rolled back rather than showing an unsaved 999.
    expect(station.getState().lots[lotId].pcs).not.toBe(999);
    // And the host kept the office's value.
    expect(hostStore.getState().lots[lotId].pcs).toBe(200);
  });
});

/* ========================================================================
   Working through an outage - the reason the queue exists
   ======================================================================== */

describe("when the host goes away", () => {
  it("keeps accepting scans INTO A LOT and reports the save as successful", async () => {
    await startHost();

    const adapter = newAdapter();
    const store = createStore({ adapter });
    await store.load();
    await store.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;
    await store.run((state) => createLot(state, kapanId, { charmi: -2 }));
    const lotId = lotsOfKapan(store.getState(), kapanId)[0].id;

    await stopHost();

    const intoLot = await store.run((state) =>
      addPacket(state, { kapanId, lotId, kachuWeight: 7.348, polishedWeight: 0.928 })
    );
    expect(intoLot.ok).toBe(true);
    expect(store.getState().lots[lotId].pcs).toBe(1);
  });

  it("keeps accepting scans and reports the save as successful", async () => {
    await startHost();

    const adapter = newAdapter();
    const store = createStore({ adapter });
    await store.load();
    await store.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;

    await stopHost();

    const outcome = await store.run((state) =>
      addPacket(state, { kapanId, kachuWeight: 7.348, polishedWeight: 0.928 })
    );

    // The floor keeps working. This is the whole design decision.
    expect(outcome.ok).toBe(true);
    expect(adapter.getStatus()).toBe(CONNECTION.OFFLINE);
    expect(adapter.queuedCount()).toBe(1);
    expect(Object.keys(store.getState().packets)).toHaveLength(1);
  });

  it("refuses a lot edit loudly, and rolls the screen back", async () => {
    await startHost();

    const store = createStore({ adapter: newAdapter() });
    await store.load();
    await store.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;
    await store.run((state) => createLot(state, kapanId, { pcs: 142, charmi: -2 }));
    const lotId = lotsOfKapan(store.getState(), kapanId)[0].id;

    await stopHost();

    const outcome = await store.run((state) => updateLot(state, lotId, { pcs: 999 }));

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/could not be reached/);
    // Nobody is left believing 999 was saved.
    expect(store.getState().lots[lotId].pcs).toBe(142);
  });

  it("uploads the backlog when the host comes back", async () => {
    await startHost();
    const port = new URL(baseUrl).port;

    const storage = memoryStorage();
    const adapter = newAdapter({ storage });
    const store = createStore({ adapter });
    await store.load();
    await store.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;

    await stopHost();

    // Three bursts scanned during the outage.
    for (let index = 0; index < 3; index += 1) {
      await store.run((state) =>
        addPacket(state, { kapanId, kachuWeight: 1 + index, polishedWeight: 0.2 })
      );
    }
    expect(adapter.queuedCount()).toBe(3);

    // The office PC comes back on, same address, same data.
    host = createServer({ store: hostStore });
    await host.listen(Number(port), "127.0.0.1");

    const flushed = await adapter.flush();

    expect(flushed.sent).toBe(3);
    expect(adapter.queuedCount()).toBe(0);
    // All three landed on the host, in one request.
    expect(Object.keys(hostStore.getState().packets)).toHaveLength(3);
  });

  it("carries the pcs it counted while offline up to the host, without clobbering it", async () => {
    await startHost();
    const port = new URL(baseUrl).port;

    const storage = memoryStorage();
    const adapter = newAdapter({ storage });
    const store = createStore({ adapter });
    await store.load();
    await store.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(store.getState(), "41").id;
    await store.run((state) => createLot(state, kapanId, { charmi: -2 }));
    const lotId = lotsOfKapan(store.getState(), kapanId)[0].id;

    await stopHost();

    // Two scanned into the lot during the outage.
    for (let index = 0; index < 2; index += 1) {
      await store.run((state) =>
        addPacket(state, { kapanId, lotId, kachuWeight: 1 + index, polishedWeight: 0.2 })
      );
    }
    expect(store.getState().lots[lotId].pcs).toBe(2);

    // Meanwhile the office counted three of its own into the same lot.
    const onHost = hostStore.getState();
    hostStore.save({
      ...onHost,
      lots: { ...onHost.lots, [lotId]: { ...onHost.lots[lotId], pcs: 3 } },
    });

    host = createServer({ store: hostStore });
    await host.listen(Number(port), "127.0.0.1");
    await adapter.flush();

    // Five, not two: the station sent "+2", so neither PC's work was thrown away.
    expect(hostStore.getState().lots[lotId].pcs).toBe(5);
    expect(Object.keys(hostStore.getState().packets)).toHaveLength(2);
  });

  it("keeps the backlog across an app restart", async () => {
    await startHost();

    const storage = memoryStorage();
    const first = createStore({ adapter: newAdapter({ storage }) });
    await first.load();
    await first.run((state) => createKapan(state, { number: "41" }));
    const kapanId = kapanByNumber(first.getState(), "41").id;

    await stopHost();
    await first.run((state) =>
      addPacket(state, { kapanId, kachuWeight: 7.348, polishedWeight: 0.928 })
    );

    // A new adapter on the same device - the app was closed and reopened.
    const reopened = newAdapter({ storage });
    expect(reopened.queuedCount()).toBe(1);
  });

  it("will not start at all if the host was never reachable", async () => {
    await startHost();
    const dead = `http://127.0.0.1:${new URL(baseUrl).port}`;
    await stopHost();

    const adapter = newAdapter({ baseUrl: dead });
    await expect(adapter.load()).rejects.toThrow(/Cannot reach the host/);
    expect(adapter.getStatus()).toBe(CONNECTION.OFFLINE);
  });
});

describe("seat refusal", () => {
  it("is reported as a refusal, not as an outage", async () => {
    await startHost({ seats: 1 });

    const first = newAdapter({ deviceId: "office", deviceName: "OFFICE-PC" });
    await first.load();

    const second = newAdapter({ deviceId: "station-9", deviceName: "SCAN-9" });
    await expect(second.load()).rejects.toThrow(/all in use/);
    // Not OFFLINE: retrying forever would not help, and the message says why.
    expect(second.getStatus()).toBe(CONNECTION.REFUSED);
  });

  it("never queues a change the host refused", async () => {
    await startHost({ seats: 1 });

    const office = createStore({
      adapter: newAdapter({ deviceId: "office", deviceName: "OFFICE-PC" }),
    });
    await office.load();

    const refused = newAdapter({ deviceId: "station-9", deviceName: "SCAN-9" });
    // Loading fails, so nothing was ever sent; the outbox must stay empty rather
    // than accumulating changes that will be refused forever.
    await expect(refused.load()).rejects.toThrow();
    expect(refused.queuedCount()).toBe(0);
  });
});

describe("the local adapter is unaffected", () => {
  it("still works with no host at all", async () => {
    const { createLocalAdapter } = require("./store");
    const store = createStore({ adapter: createLocalAdapter(memoryStorage()) });
    await store.load();
    const outcome = await store.run((state) => createKapan(state, { number: "41" }));
    expect(outcome.ok).toBe(true);
    expect(kapanByNumber(store.getState(), "41")).toBeTruthy();
    expect(emptyState().schema).toBe(3);
  });
});
