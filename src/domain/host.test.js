/**
 * The host store and its LAN server, exercised for real: a temp directory on
 * disk, an actual HTTP server on a real port, actual requests.
 *
 * Both modules live under public/ because Electron's main process requires them
 * unbundled, and both are deliberately free of Electron imports so this test can
 * drive them directly.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const {
  createFileStore,
  COMPACT_AFTER,
  COMPACT_BYTES,
} = require("../../public/db/fileStore");
const { createServer } = require("../../public/net/server");
const {
  applyDelta,
  applyDeltaInPlace,
  computeDelta,
  isAdditiveOnly,
} = require("../../public/shared/delta");

const tempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "diamond-qr-test-"));

const stateWith = (overrides = {}) => ({
  schema: 3,
  kapans: {},
  lots: {},
  packets: {},
  ...overrides,
});

const kapan = (id, number) => ({ id, number, season: "25-26", createdAt: "2026-01-17" });
const lot = (id, kapanId, lotNo, pcs) => ({ id, kapanId, lotNo, pcs, charmi: -2 });
const packet = (id, kapanId, lotId, k, p) => ({
  id,
  kapanId,
  lotId,
  kachuWeight: k,
  polishedWeight: p,
  rawCode: `code-${id}`,
  scannedAt: "2026-07-17T09:15:32.000Z",
});

/* ========================================================================
   Deltas
   ======================================================================== */

describe("deltas", () => {
  it("records only the rows that changed", () => {
    const before = stateWith({
      kapans: { k1: kapan("k1", "41") },
      lots: { l1: lot("l1", "k1", 1, 142), l2: lot("l2", "k1", 2, 140) },
    });
    const editedLot = { ...before.lots.l1, charmi: 7 };
    const after = { ...before, lots: { ...before.lots, l1: editedLot } };

    const delta = computeDelta(before, after);

    expect(Object.keys(delta.upserts.lots)).toEqual(["l1"]);
    // l2 is untouched, so it is the same object and must not be in the delta.
    expect(delta.upserts.lots.l2).toBeUndefined();
    expect(Object.keys(delta.upserts.kapans)).toEqual([]);
  });

  /* ----------------------------------------------------------------------
     નંગ travels as a shift, not as a row. This is what keeps a scan station
     working through an outage: one packet is one diamond, so filing it adds one
     to the lot's count, and an increment lands correctly on whatever the host
     holds instead of overwriting a count another PC made meanwhile.
     ---------------------------------------------------------------------- */

  describe("pcs shifts", () => {
    // One base, shared: computeDelta compares by reference, so rebuilding the
    // untouched rows per case would report them as changed.
    const base = stateWith({
      kapans: { k1: kapan("k1", "41") },
      lots: { l1: lot("l1", "k1", 1, 142) },
    });

    const withPcs = (state, pcs) => ({
      ...state,
      lots: { ...state.lots, l1: { ...state.lots.l1, pcs } },
    });

    it("records a pcs-only change as a shift rather than a row", () => {
      const delta = computeDelta(base, withPcs(base, 143));

      expect(delta.counters.lots).toEqual({ l1: 1 });
      expect(delta.upserts.lots.l1).toBeUndefined();
      // Which is what lets a scan into a lot be queued through an outage.
      expect(isAdditiveOnly(delta)).toBe(true);
    });

    it("starts a count that nobody had given yet", () => {
      const empty = withPcs(base, null);
      expect(computeDelta(empty, withPcs(empty, 3)).counters.lots).toEqual({ l1: 3 });
    });

    it("sends a cleared cell as a row, because it is not a count of pieces", () => {
      const delta = computeDelta(base, withPcs(base, null));

      expect(delta.counters.lots).toEqual({});
      expect(delta.upserts.lots.l1.pcs).toBeNull();
      // So it is version-checked like any other edit rather than merged blindly.
      expect(isAdditiveOnly(delta)).toBe(false);
    });

    it("sends a row when anything else on the lot changed too", () => {
      const both = {
        ...base,
        lots: { ...base.lots, l1: { ...base.lots.l1, pcs: 143, charmi: 7 } },
      };
      const delta = computeDelta(base, both);

      expect(delta.counters.lots).toEqual({});
      expect(delta.upserts.lots.l1.pcs).toBe(143);
      expect(isAdditiveOnly(delta)).toBe(false);
    });

    it("adds to the count the host already has, rather than replacing it", () => {
      // The station scanned one in believing the lot held 142. The office counted
      // three in meanwhile, so the host is on 145.
      const delta = computeDelta(base, withPcs(base, 143));

      expect(applyDelta(withPcs(base, 145), delta).lots.l1.pcs).toBe(146);
    });

    it("applies nothing for a lot that has since been deleted", () => {
      const delta = computeDelta(base, withPcs(base, 143));
      const host = stateWith({ kapans: { k1: kapan("k1", "41") } });

      expect(applyDelta(host, delta).lots.l1).toBeUndefined();
    });

    it("never lands on a negative count", () => {
      const delta = computeDelta(withPcs(base, 5), withPcs(base, 1)); // -4
      expect(applyDelta(withPcs(base, 2), delta).lots.l1.pcs).toBe(0);
    });
  });

  it("records deletions", () => {
    const before = stateWith({ lots: { l1: lot("l1", "k1", 1, 1) } });
    const delta = computeDelta(before, stateWith({ lots: {} }));
    expect(delta.deletes.lots).toEqual(["l1"]);
  });

  it("is null when nothing changed", () => {
    const state = stateWith({ kapans: { k1: kapan("k1", "41") } });
    expect(computeDelta(state, state)).toBeNull();
    expect(computeDelta(state, { ...state })).toBeNull();
  });

  it("round-trips through apply", () => {
    const before = stateWith({ kapans: { k1: kapan("k1", "41") } });
    const after = stateWith({
      kapans: { k1: kapan("k1", "41"), k2: kapan("k2", "42") },
      lots: { l1: lot("l1", "k1", 1, 142) },
    });

    expect(applyDelta(before, computeDelta(before, after))).toEqual(after);
  });

  /**
   * The journal is replayed with the in-place variant, because copying the whole
   * state per line turns a long journal into a load that takes minutes. It has to
   * mean exactly what the copying one means, or a reopen would disagree with the
   * app that wrote the file.
   */
  it("means the same thing applied in place as applied to a copy", () => {
    const before = () =>
      stateWith({
        kapans: { k1: kapan("k1", "41"), k2: kapan("k2", "42") },
        lots: { l1: lot("l1", "k1", 1, 142), l2: lot("l2", "k1", 2, 140) },
        packets: { p1: packet("p1", "k1", "l1", 1, 0.2) },
      });

    const delta = {
      upserts: {
        kapans: {},
        lots: { l2: { ...lot("l2", "k1", 2, 140), charmi: 9 } },
        packets: { p2: packet("p2", "k1", "l1", 1.1, 0.3) },
      },
      deletes: { kapans: ["k2"], lots: [], packets: ["p1"] },
      counters: { lots: { l1: 4 } },
    };

    expect(applyDeltaInPlace(before(), delta)).toEqual(applyDelta(before(), delta));
  });

  it("does not mutate the state it is applied to", () => {
    const before = stateWith({ kapans: { k1: kapan("k1", "41") } });
    const snapshot = JSON.stringify(before);
    applyDelta(before, { upserts: { lots: { l1: lot("l1", "k1", 1, 5) } }, deletes: {} });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("knows a packets-only change from one that needs the client up to date", () => {
    const base = stateWith({ kapans: { k1: kapan("k1", "41") } });

    const scanned = computeDelta(base, {
      ...base,
      packets: { p1: packet("p1", "k1", null, 1, 0.2) },
    });
    expect(isAdditiveOnly(scanned)).toBe(true);

    const edited = computeDelta(base, {
      ...base,
      kapans: { k1: { ...base.kapans.k1, season: "26-27" } },
    });
    expect(isAdditiveOnly(edited)).toBe(false);

    const deleted = computeDelta(base, stateWith({}));
    expect(isAdditiveOnly(deleted)).toBe(false);
  });
});

/* ========================================================================
   The file store
   ======================================================================== */

describe("the host store on disk", () => {
  let dir;
  beforeEach(() => {
    dir = tempDir();
  });

  it("starts empty and round-trips through a reopen", () => {
    const store = createFileStore({ dir });
    expect(store.load()).toEqual(stateWith());

    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));

    const reopened = createFileStore({ dir });
    expect(reopened.load().kapans.k1.number).toBe("41");
  });

  it("appends a journal line per change instead of rewriting everything", () => {
    const store = createFileStore({ dir });
    store.load();

    let state = stateWith({ kapans: { k1: kapan("k1", "41") } });
    store.save(state);
    for (let index = 1; index <= 5; index += 1) {
      state = {
        ...state,
        lots: { ...state.lots, [`l${index}`]: lot(`l${index}`, "k1", index, 100 + index) },
      };
      store.save(state);
    }

    const journal = fs
      .readFileSync(path.join(dir, "journal.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(journal).toHaveLength(6);
    // Each line carries one lot, not the whole dataset.
    expect(Object.keys(JSON.parse(journal[3]).upserts.lots)).toHaveLength(1);
  });

  it("replays the journal on load", () => {
    const first = createFileStore({ dir });
    first.load();
    let state = stateWith({ kapans: { k1: kapan("k1", "41") } });
    first.save(state);
    state = { ...state, lots: { l1: lot("l1", "k1", 1, 142) } };
    first.save(state);
    state = { ...state, lots: { l1: { ...state.lots.l1, returnPcs: 139 } } };
    first.save(state);

    const reopened = createFileStore({ dir }).load();
    expect(reopened.lots.l1.pcs).toBe(142);
    expect(reopened.lots.l1.returnPcs).toBe(139);
  });

  it("compacts once the journal gets long, and the data survives it", () => {
    const store = createFileStore({ dir });
    store.load();

    let state = stateWith({ kapans: { k1: kapan("k1", "41") } });
    store.save(state);

    for (let index = 0; index < COMPACT_AFTER + 5; index += 1) {
      state = {
        ...state,
        packets: {
          ...state.packets,
          [`p${index}`]: packet(`p${index}`, "k1", null, 1, 0.2),
        },
      };
      store.save(state);
    }

    // The journal was truncated at the threshold rather than growing forever.
    const journalLines = fs
      .readFileSync(path.join(dir, "journal.jsonl"), "utf8")
      .trim();
    expect(journalLines ? journalLines.split("\n").length : 0).toBeLessThan(COMPACT_AFTER);

    const reopened = createFileStore({ dir }).load();
    expect(Object.keys(reopened.packets)).toHaveLength(COMPACT_AFTER + 5);
  });

  it("survives a torn last journal line, keeping everything before it", () => {
    const store = createFileStore({ dir });
    store.load();
    let state = stateWith({ kapans: { k1: kapan("k1", "41") } });
    store.save(state);
    state = { ...state, lots: { l1: lot("l1", "k1", 1, 142) } };
    store.save(state);

    // What a power cut mid-write leaves behind.
    fs.appendFileSync(path.join(dir, "journal.jsonl"), '{"upserts":{"lots":{"l2":{"id":"l2"');

    const reopened = createFileStore({ dir }).load();
    expect(reopened.lots.l1.pcs).toBe(142);
    expect(reopened.lots.l2).toBeUndefined();
  });

  it("recovers from the .bak when a snapshot is lost mid-compaction", () => {
    const store = createFileStore({ dir });
    store.load();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));
    store.compact();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") }, lots: { l1: lot("l1", "k1", 1, 7) } }));
    store.compact();

    // Simulate the crash window: snapshot gone, .bak and journal present.
    fs.unlinkSync(path.join(dir, "snapshot.json"));

    const reopened = createFileStore({ dir }).load();
    // The .bak is one compaction behind, so the Kapan is there.
    expect(reopened.kapans.k1).toBeTruthy();
  });

  it("refuses data written by a different schema", () => {
    fs.writeFileSync(
      path.join(dir, "snapshot.json"),
      JSON.stringify({ schema: 99, kapans: {} })
    );
    expect(() => createFileStore({ dir }).load()).toThrow(/schema 99/);
  });

  it("writes a dated backup and keeps a bounded number of them", () => {
    const store = createFileStore({ dir });
    store.load();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));

    const file = store.backup();
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).data.kapans.k1.number).toBe("41");

    // Two backups on the same day are one file, not two.
    store.backup();
    expect(fs.readdirSync(path.join(dir, "backups"))).toHaveLength(1);
  });

  it("bumps its version only when something actually changed", () => {
    const store = createFileStore({ dir });
    store.load();
    const afterLoad = store.getVersion();

    const state = stateWith({ kapans: { k1: kapan("k1", "41") } });
    store.save(state);
    const afterChange = store.getVersion();
    expect(afterChange).toBeGreaterThan(afterLoad);

    store.save(state);
    expect(store.getVersion()).toBe(afterChange);
  });
});

/* ========================================================================
   A journal that got big

   The customer-facing failure these cover: builds before 2.2.2 wrote the whole
   dataset per save, the journal passed the ~512 MB ceiling on a JavaScript
   string, and the app stopped opening with "Cannot create a string longer than
   0x1fffffe8 characters".
   ======================================================================== */

describe("a journal larger than one read", () => {
  let dir;
  beforeEach(() => {
    dir = tempDir();
  });

  /** Enough padding that a handful of lines cross the 4 MB read chunk. */
  const bulky = (id) => ({
    ...packet(id, "k1", null, 1, 0.2),
    notes: "x".repeat(300 * 1024),
  });

  it("reads a multi-megabyte journal a chunk at a time rather than as one string", () => {
    const store = createFileStore({ dir });
    store.load();

    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));
    // Folded into the snapshot first: the journal is about to be replaced by
    // hand, and the Kapan has to survive that to prove the replay kept it.
    store.compact();

    // Written by hand so the store's own compaction does not tidy it away before
    // the read under test happens.
    const lines = [];
    for (let index = 0; index < 24; index += 1) {
      lines.push(
        JSON.stringify({
          upserts: { kapans: {}, lots: {}, packets: { [`p${index}`]: bulky(`p${index}`) } },
          deletes: { kapans: [], lots: [], packets: [] },
          counters: { lots: {} },
        })
      );
    }
    fs.writeFileSync(path.join(dir, "journal.jsonl"), `${lines.join("\n")}\n`, "utf8");
    expect(fs.statSync(path.join(dir, "journal.jsonl")).size).toBeGreaterThan(4 * 1024 * 1024);

    const reopened = createFileStore({ dir }).load();
    expect(Object.keys(reopened.packets)).toHaveLength(24);
    expect(reopened.kapans.k1.number).toBe("41");
  });

  it("keeps characters intact across a read boundary", () => {
    const store = createFileStore({ dir });
    store.load();

    // Three bytes each, so any of them can straddle a chunk edge.
    const label = "નંગ કાપણ";
    const lines = [];
    for (let index = 0; index < 24; index += 1) {
      lines.push(
        JSON.stringify({
          upserts: {
            kapans: {},
            lots: {},
            packets: { [`p${index}`]: { ...bulky(`p${index}`), label } },
          },
          deletes: { kapans: [], lots: [], packets: [] },
          counters: { lots: {} },
        })
      );
    }
    fs.writeFileSync(path.join(dir, "journal.jsonl"), `${lines.join("\n")}\n`, "utf8");

    const reopened = createFileStore({ dir }).load();
    expect(Object.keys(reopened.packets)).toHaveLength(24);
    Object.values(reopened.packets).forEach((row) => expect(row.label).toBe(label));
  });

  it("folds an oversized journal into the snapshot on load, losing nothing", () => {
    const store = createFileStore({ dir });
    store.load();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));
    store.compact();

    const lines = [];
    for (let index = 0; index < 40; index += 1) {
      lines.push(
        JSON.stringify({
          upserts: { kapans: {}, lots: {}, packets: { [`p${index}`]: bulky(`p${index}`) } },
          deletes: { kapans: [], lots: [], packets: [] },
          counters: { lots: {} },
        })
      );
    }
    fs.writeFileSync(path.join(dir, "journal.jsonl"), `${lines.join("\n")}\n`, "utf8");

    const reopened = createFileStore({ dir });
    const loaded = reopened.load();

    expect(Object.keys(loaded.packets)).toHaveLength(40);
    expect(loaded.kapans.k1.number).toBe("41");
    // The journal has been folded away, so the next launch is cheap.
    expect(fs.statSync(path.join(dir, "journal.jsonl")).size).toBe(0);
    // And the state that was folded is really in the snapshot now.
    expect(
      Object.keys(JSON.parse(fs.readFileSync(path.join(dir, "snapshot.json"), "utf8")).packets)
    ).toHaveLength(40);
    // Nothing was thrown away doing it.
    expect(Object.keys(createFileStore({ dir }).load().packets)).toHaveLength(40);
  });

  it("still opens when the fold itself cannot be written", () => {
    const store = createFileStore({ dir });
    store.load();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));
    store.compact();

    const lines = [];
    for (let index = 0; index < 40; index += 1) {
      lines.push(
        JSON.stringify({
          upserts: { kapans: {}, lots: {}, packets: { [`p${index}`]: bulky(`p${index}`) } },
          deletes: { kapans: [], lots: [], packets: [] },
          counters: { lots: {} },
        })
      );
    }
    fs.writeFileSync(path.join(dir, "journal.jsonl"), `${lines.join("\n")}\n`, "utf8");

    // A disk with nothing left on it. The data replayed fine; the tidy-up cannot
    // be what stops the factory working.
    const full = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw new Error("no space left on device");
    });

    const loaded = createFileStore({ dir }).load();
    full.mockRestore();

    expect(Object.keys(loaded.packets)).toHaveLength(40);
    expect(loaded.kapans.k1.number).toBe("41");
    // Nothing was truncated, so the journal is still there to fold next time.
    expect(fs.statSync(path.join(dir, "journal.jsonl")).size).toBeGreaterThan(0);
  });

  it("leaves a journal with a hole in the middle alone for support to look at", () => {
    const store = createFileStore({ dir });
    store.load();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));

    const good = (index) =>
      JSON.stringify({
        upserts: { kapans: {}, lots: {}, packets: { [`p${index}`]: bulky(`p${index}`) } },
        deletes: { kapans: [], lots: [], packets: [] },
        counters: { lots: {} },
      });

    const lines = [];
    for (let index = 0; index < 40; index += 1) {
      lines.push(index === 12 ? '{"upserts":{"packets":{"pX"' : good(index));
    }
    fs.writeFileSync(path.join(dir, "journal.jsonl"), `${lines.join("\n")}\n`, "utf8");

    const loaded = createFileStore({ dir }).load();
    expect(Object.keys(loaded.packets)).toHaveLength(39);
    // Not folded away: the evidence stays on disk.
    expect(fs.statSync(path.join(dir, "journal.jsonl")).size).toBeGreaterThan(0);
  });

  it("compacts on size, not just on line count", () => {
    const store = createFileStore({ dir });
    store.load();

    let state = stateWith({ kapans: { k1: kapan("k1", "41") } });
    store.save(state);

    // Far fewer commits than COMPACT_AFTER, but well past the byte ceiling.
    for (let index = 0; index < 40; index += 1) {
      state = {
        ...state,
        packets: { ...state.packets, [`p${index}`]: bulky(`p${index}`) },
      };
      store.save(state);
    }

    expect(store.stats().journalLines).toBeLessThan(COMPACT_AFTER);
    expect(fs.statSync(path.join(dir, "journal.jsonl")).size).toBeLessThan(COMPACT_BYTES);
    expect(Object.keys(createFileStore({ dir }).load().packets)).toHaveLength(40);
  });
});

describe("committing a delta the caller already has", () => {
  let dir;
  beforeEach(() => {
    dir = tempDir();
  });

  it("records exactly that delta and applies it", () => {
    const store = createFileStore({ dir });
    store.load();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") }, lots: { l1: lot("l1", "k1", 1, 5) } }));

    const result = store.commit({
      upserts: { kapans: {}, lots: {}, packets: { p1: packet("p1", "k1", "l1", 1, 0.2) } },
      deletes: { kapans: [], lots: [], packets: [] },
      counters: { lots: { l1: 1 } },
    });

    expect(result.state.packets.p1).toBeTruthy();
    expect(result.state.lots.l1.pcs).toBe(6);

    const journal = fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").trim().split("\n");
    // One line for the save above, one for the commit - and the commit's line
    // carries one packet, not the whole dataset.
    expect(journal).toHaveLength(2);
    expect(Object.keys(JSON.parse(journal[1]).upserts.packets)).toEqual(["p1"]);

    const reopened = createFileStore({ dir }).load();
    expect(reopened.lots.l1.pcs).toBe(6);
    expect(reopened.packets.p1).toBeTruthy();
  });

  /**
   * The rule the whole store exists to keep: a write that did not happen is
   * never treated as one that did. If a full disk left the store believing it
   * had recorded a commit, the NEXT commit would be measured from a state that
   * is not on disk, and the rows in between would be gone with nobody told.
   */
  it("treats a failed write as a write that did not happen", () => {
    const store = createFileStore({ dir });
    store.load();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") }, lots: { l1: lot("l1", "k1", 1, 5) } }));

    const before = store.getVersion();
    const full = jest.spyOn(fs, "appendFileSync").mockImplementation(() => {
      const error = new Error("no space left on device");
      error.code = "ENOSPC";
      throw error;
    });

    const lost = {
      upserts: { kapans: {}, lots: {}, packets: { p1: packet("p1", "k1", "l1", 1, 0.2) } },
      deletes: { kapans: [], lots: [], packets: [] },
      counters: { lots: { l1: 1 } },
    };

    expect(() => store.commit(lost)).toThrow(/no space/);
    // Nothing moved: not the version, not the count, not the rows.
    expect(store.getVersion()).toBe(before);
    expect(store.getState().packets.p1).toBeUndefined();
    expect(store.getState().lots.l1.pcs).toBe(5);

    full.mockRestore();

    // And when the disk comes back, the same commit still lands.
    store.commit(lost);
    const reopened = createFileStore({ dir }).load();
    expect(reopened.packets.p1).toBeTruthy();
    expect(reopened.lots.l1.pcs).toBe(6);
  });

  it("is a no-op for an empty delta", () => {
    const store = createFileStore({ dir });
    store.load();
    const before = store.getVersion();
    expect(store.commit(null).version).toBe(before);
    expect(fs.existsSync(path.join(dir, "journal.jsonl"))).toBe(false);
  });
});

/* ========================================================================
   The server, over a real socket
   ======================================================================== */

/** Minimal HTTP client so the test exercises the wire, not a mock. */
const request = (port, method, pathname, body, headers = {}) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: pathname,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null })
        );
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });

describe("the host server", () => {
  let dir;
  let store;
  let host;
  let port;

  const start = async (options = {}) => {
    dir = tempDir();
    store = createFileStore({ dir });
    store.load();
    host = createServer({ store, ...options });
    const address = await host.listen(0, "127.0.0.1");
    port = address.port;
  };

  afterEach(async () => {
    if (host) await host.close();
    host = null;
  });

  const asOffice = { "x-device-id": "office", "x-device-name": "OFFICE-PC" };
  const asStation = { "x-device-id": "station-1", "x-device-name": "SCAN-1" };

  it("answers a ping with its protocol and version", async () => {
    await start();
    const { status, body } = await request(port, "GET", "/ping");
    expect(status).toBe(200);
    expect(body.protocol).toBe(1);
    expect(typeof body.version).toBe("number");
  });

  it("serves the full state", async () => {
    await start();
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));

    const { status, body } = await request(port, "GET", "/state", undefined, asOffice);
    expect(status).toBe(200);
    expect(body.state.kapans.k1.number).toBe("41");
    expect(body.version).toBe(store.getVersion());
  });

  it("accepts a commit and persists it to disk", async () => {
    await start();

    const delta = computeDelta(
      store.getState(),
      stateWith({ kapans: { k1: kapan("k1", "41") } })
    );
    const { status, body } = await request(
      port,
      "POST",
      "/commit",
      { delta, baseVersion: store.getVersion() },
      asOffice
    );

    expect(status).toBe(200);
    expect(body.version).toBeGreaterThan(0);
    // Really on disk, not just in memory.
    expect(createFileStore({ dir }).load().kapans.k1.number).toBe("41");
  });

  it("rejects an edit based on a version the host has moved past", async () => {
    await start();
    const stale = store.getVersion();

    // Another PC gets there first.
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));

    const delta = computeDelta(
      stateWith(),
      stateWith({ kapans: { k9: kapan("k9", "99") } })
    );
    const { status, body } = await request(
      port,
      "POST",
      "/commit",
      { delta, baseVersion: stale },
      asOffice
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/Another computer changed this first/);
    expect(body.version).toBe(store.getVersion());
  });

  it("accepts scanned packets even from a stale client", async () => {
    await start();
    // A scan station that was offline while the office added a Kapan.
    store.save(stateWith({ kapans: { k1: kapan("k1", "41") } }));
    const staleVersion = 0;

    const delta = {
      upserts: {
        kapans: {},
        lots: {},
        packets: { p1: packet("p1", "k1", null, 7.348, 0.928) },
      },
      deletes: { kapans: [], lots: [], packets: [] },
    };

    const { status } = await request(
      port,
      "POST",
      "/commit",
      { delta, baseVersion: staleVersion },
      asStation
    );

    // This is the whole point of the queue: a burst scanned during an outage
    // uploads without the station having to catch up first.
    expect(status).toBe(200);
    const onDisk = createFileStore({ dir }).load();
    expect(onDisk.packets.p1.kachuWeight).toBe(7.348);
    expect(onDisk.kapans.k1).toBeTruthy();
  });

  it("counts seats and refuses one past the licence", async () => {
    await start({ seats: 2 });

    expect((await request(port, "GET", "/state", undefined, asOffice)).status).toBe(200);
    expect((await request(port, "GET", "/state", undefined, asStation)).status).toBe(200);

    const third = await request(port, "GET", "/state", undefined, {
      "x-device-id": "station-2",
      "x-device-name": "SCAN-2",
    });
    expect(third.status).toBe(403);
    expect(third.body.error).toMatch(/2 computer\(s\)/);

    // A device already holding a seat is never locked out by the cap.
    expect((await request(port, "GET", "/state", undefined, asOffice)).status).toBe(200);
  });

  it("lists the connected computers for Settings", async () => {
    await start({ seats: 4 });
    await request(port, "GET", "/state", undefined, asOffice);
    await request(port, "GET", "/state", undefined, asStation);

    const { body } = await request(port, "GET", "/clients", undefined, asOffice);
    expect(body.seats).toBe(4);
    expect(body.clients.map((client) => client.name).sort()).toEqual([
      "OFFICE-PC",
      "SCAN-1",
    ]);
  });

  it("turns away requests without the host token", async () => {
    await start({ token: "secret" });

    expect((await request(port, "GET", "/ping")).status).toBe(401);
    expect(
      (await request(port, "GET", "/ping", undefined, { "x-token": "secret" })).status
    ).toBe(200);
  });

  it("refuses an oversized change rather than trying to hold it", async () => {
    await start();
    const packets = {};
    for (let index = 0; index < 20001; index += 1) {
      packets[`p${index}`] = packet(`p${index}`, "k1", null, 1, 0.2);
    }

    const { status, body } = await request(
      port,
      "POST",
      "/commit",
      {
        delta: { upserts: { kapans: {}, lots: {}, packets }, deletes: {} },
        baseVersion: store.getVersion(),
      },
      asOffice
    );

    expect(status).toBe(413);
    expect(body.error).toMatch(/too large/);
  });

  it("404s an unknown path instead of failing oddly", async () => {
    await start();
    expect((await request(port, "GET", "/nope")).status).toBe(404);
  });
});
