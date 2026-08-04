import {
  addPacket,
  createKapan,
  createLot,
  deleteKapan,
  deleteLot,
  deletePackets,
  emptyState,
  kapanByNumber,
  lotsOfKapan,
  movePackets,
  packetsOfLot,
  renumberKapanLots,
  updateKapan,
  updateLot,
} from "./operations";

/** Builds a Kapan with `count` lots, each holding one packet. */
const seed = (count = 3) => {
  let state = createKapan(emptyState(), { number: "41", season: "25-26" }).state;
  const kapanId = kapanByNumber(state, "41").id;

  for (let index = 0; index < count; index += 1) {
    state = createLot(state, kapanId, { pcs: 100 + index, charmi: -2 }).state;
  }

  lotsOfKapan(state, kapanId).forEach((lot, index) => {
    state = addPacket(state, {
      kapanId,
      lotId: lot.id,
      rawCode: `code-${index}`,
      kachuWeight: 10,
      polishedWeight: 2,
    }).state;
  });

  return { state, kapanId };
};

describe("kapans", () => {
  it("creates one and finds it by number", () => {
    const { state } = createKapan(emptyState(), { number: " kpn-41 " });
    expect(kapanByNumber(state, "KPN-41")).toBeTruthy();
    // Normalised, so "kpn-41" and "KPN  41" cannot become two Kapans.
    expect(kapanByNumber(state, "kpn-41").number).toBe("KPN-41");
  });

  it("refuses a duplicate number", () => {
    const first = createKapan(emptyState(), { number: "41" });
    const second = createKapan(first.state, { number: "41" });
    expect(second.undo).toBeNull();
    expect(second.error).toMatch(/already exists/);
    expect(Object.keys(second.state.kapans)).toHaveLength(1);
  });

  it("refuses an empty number", () => {
    expect(createKapan(emptyState(), { number: "   " }).error).toMatch(/Enter a Kapan/);
  });

  it("keeps free-text numbers like EX-3", () => {
    const { state } = createKapan(emptyState(), { number: "ex-3" });
    expect(kapanByNumber(state, "EX-3").number).toBe("EX-3");
  });

  it("will not rename onto another Kapan's number", () => {
    let state = createKapan(emptyState(), { number: "41" }).state;
    state = createKapan(state, { number: "42" }).state;
    const target = kapanByNumber(state, "42");
    const attempt = updateKapan(state, target.id, { number: "41" });
    expect(attempt.error).toMatch(/already exists/);
  });
});

describe("deleting a Kapan", () => {
  it("removes its lots and packets too", () => {
    const { state, kapanId } = seed(3);
    const after = deleteKapan(state, kapanId).state;

    expect(Object.keys(after.kapans)).toHaveLength(0);
    expect(Object.keys(after.lots)).toHaveLength(0);
    expect(Object.keys(after.packets)).toHaveLength(0);
  });

  it("undo restores everything with the original ids", () => {
    const { state, kapanId } = seed(3);
    const before = state;
    const { state: after, undo } = deleteKapan(state, kapanId);
    const restored = undo.apply(after);

    expect(restored.kapans).toEqual(before.kapans);
    expect(restored.lots).toEqual(before.lots);
    // Ids matter: a restored packet with a new id would read as a fresh scan.
    expect(Object.keys(restored.packets).sort()).toEqual(
      Object.keys(before.packets).sort()
    );
    expect(restored.packets).toEqual(before.packets);
  });
});

describe("lots", () => {
  it("numbers them from 1 upwards", () => {
    const { state, kapanId } = seed(3);
    expect(lotsOfKapan(state, kapanId).map((lot) => lot.lotNo)).toEqual([1, 2, 3]);
  });

  it("leaves a gap after a delete and never reuses the number", () => {
    const { state, kapanId } = seed(3);
    const lots = lotsOfKapan(state, kapanId);

    const afterDelete = deleteLot(state, lots[1].id).state;
    expect(lotsOfKapan(afterDelete, kapanId).map((lot) => lot.lotNo)).toEqual([1, 3]);

    const afterAdd = createLot(afterDelete, kapanId, { pcs: 50 }).state;
    expect(lotsOfKapan(afterAdd, kapanId).map((lot) => lot.lotNo)).toEqual([1, 3, 4]);
  });

  it("renumbers to 1..N only when asked", () => {
    const { state, kapanId } = seed(3);
    const lots = lotsOfKapan(state, kapanId);
    const gapped = deleteLot(state, lots[1].id).state;

    const { state: tidy, undo } = renumberKapanLots(gapped, kapanId);
    expect(lotsOfKapan(tidy, kapanId).map((lot) => lot.lotNo)).toEqual([1, 2]);

    expect(lotsOfKapan(undo.apply(tidy), kapanId).map((lot) => lot.lotNo)).toEqual([
      1, 3,
    ]);
  });

  it("says so rather than pretending, when numbering is already tidy", () => {
    const { state, kapanId } = seed(3);
    const attempt = renumberKapanLots(state, kapanId);
    expect(attempt.undo).toBeNull();
    expect(attempt.error).toMatch(/already/);
  });
});

describe("deleting a lot", () => {
  it("moves its packets to Unassigned by default", () => {
    const { state, kapanId } = seed(2);
    const lot = lotsOfKapan(state, kapanId)[0];

    const { state: after, undo } = deleteLot(state, lot.id);

    expect(after.lots[lot.id]).toBeUndefined();
    expect(Object.keys(after.packets)).toHaveLength(2); // nothing lost
    const orphans = Object.values(after.packets).filter((p) => p.lotId === null);
    expect(orphans).toHaveLength(1);
    expect(undo.label).toMatch(/moved to Unassigned/);
  });

  it("can delete the packets too, when asked explicitly", () => {
    const { state, kapanId } = seed(2);
    const lot = lotsOfKapan(state, kapanId)[0];

    const { state: after, undo } = deleteLot(state, lot.id, { withPackets: true });
    expect(Object.keys(after.packets)).toHaveLength(1);
    expect(undo.label).toMatch(/packet\(s\) deleted/);
  });

  it("undo puts the packets back in the lot either way", () => {
    const { state, kapanId } = seed(2);
    const lot = lotsOfKapan(state, kapanId)[0];

    [false, true].forEach((withPackets) => {
      const { state: after, undo } = deleteLot(state, lot.id, { withPackets });
      const restored = undo.apply(after);
      expect(restored.lots[lot.id]).toEqual(lot);
      expect(packetsOfLot(restored, lot.id)).toHaveLength(1);
      expect(restored.packets).toEqual(state.packets);
    });
  });
});

describe("editing a lot", () => {
  it("fills in today's return date when returns are first entered", () => {
    const { state, kapanId } = seed(1);
    const lot = lotsOfKapan(state, kapanId)[0];

    const after = updateLot(state, lot.id, { returnPcs: 98 }).state;
    expect(after.lots[lot.id].returnDate).toBe(
      new Date().toISOString().slice(0, 10)
    );
  });

  it("does not overwrite a return date the owner already set", () => {
    const { state, kapanId } = seed(1);
    const lot = lotsOfKapan(state, kapanId)[0];

    const dated = updateLot(state, lot.id, {
      returnPcs: 98,
      returnDate: "2026-01-20",
    }).state;
    const later = updateLot(dated, lot.id, { returnWeight: 1.9 }).state;

    expect(later.lots[lot.id].returnDate).toBe("2026-01-20");
  });

  it("undo restores the previous cell value exactly", () => {
    const { state, kapanId } = seed(1);
    const lot = lotsOfKapan(state, kapanId)[0];

    const { state: after, undo } = updateLot(state, lot.id, { pcs: 999 });
    expect(after.lots[lot.id].pcs).toBe(999);
    expect(undo.apply(after).lots[lot.id]).toEqual(lot);
  });
});

describe("moving packets between lots", () => {
  it("moves a wrong-lot scan without re-scanning it", () => {
    const { state, kapanId } = seed(2);
    const [lotA, lotB] = lotsOfKapan(state, kapanId);
    const packet = packetsOfLot(state, lotA.id)[0];

    const { state: after } = movePackets(state, [packet.id], lotB.id);

    expect(packetsOfLot(after, lotA.id)).toHaveLength(0);
    expect(packetsOfLot(after, lotB.id)).toHaveLength(2);
  });

  it("moves to Unassigned with a null target", () => {
    const { state, kapanId } = seed(1);
    const lot = lotsOfKapan(state, kapanId)[0];
    const packet = packetsOfLot(state, lot.id)[0];

    const after = movePackets(state, [packet.id], null).state;
    expect(after.packets[packet.id].lotId).toBeNull();
  });

  it("refuses to move packets into another Kapan's lot", () => {
    let { state, kapanId } = seed(1);
    state = createKapan(state, { number: "42" }).state;
    const otherKapan = kapanByNumber(state, "42");
    state = createLot(state, otherKapan.id, { pcs: 10 }).state;
    const foreignLot = lotsOfKapan(state, otherKapan.id)[0];
    const packet = packetsOfLot(state, lotsOfKapan(state, kapanId)[0].id)[0];

    const attempt = movePackets(state, [packet.id], foreignLot.id);
    expect(attempt.undo).toBeNull();
    expect(attempt.error).toMatch(/same Kapan/);
    expect(attempt.state).toBe(state);
  });

  it("undo returns every packet to the lot it came from", () => {
    const { state, kapanId } = seed(3);
    const lots = lotsOfKapan(state, kapanId);
    const ids = lots.flatMap((lot) => packetsOfLot(state, lot.id).map((p) => p.id));

    const { state: after, undo } = movePackets(state, ids, lots[0].id);
    expect(packetsOfLot(after, lots[0].id)).toHaveLength(3);
    expect(undo.apply(after).packets).toEqual(state.packets);
  });
});

describe("packets", () => {
  it("a scan with no lot lands in the tray rather than being refused", () => {
    const { state, kapanId } = seed(0);
    const { state: after, undo } = addPacket(state, {
      kapanId,
      lotId: null,
      kachuWeight: 0.024,
      polishedWeight: 0.022,
    });

    const added = Object.values(after.packets)[0];
    expect(added.lotId).toBeNull();
    expect(undo.apply(after).packets).toEqual({});
  });

  it("records which PC took the scan", () => {
    const { state, kapanId } = seed(0);
    const after = addPacket(state, {
      kapanId,
      kachuWeight: 1,
      polishedWeight: 0.2,
      scannedOn: "SCAN-STATION-2",
    }).state;
    expect(Object.values(after.packets)[0].scannedOn).toBe("SCAN-STATION-2");
  });

  it("deleting scans is undoable", () => {
    const { state, kapanId } = seed(2);
    const ids = Object.keys(state.packets);

    const { state: after, undo } = deletePackets(state, ids);
    expect(Object.keys(after.packets)).toHaveLength(0);
    expect(undo.apply(after).packets).toEqual(state.packets);
    expect(kapanId).toBeTruthy();
  });
});

describe("operations never mutate the state handed to them", () => {
  it("leaves the original object untouched", () => {
    const { state, kapanId } = seed(2);
    const snapshot = JSON.stringify(state);
    const lot = lotsOfKapan(state, kapanId)[0];

    createLot(state, kapanId, { pcs: 1 });
    updateLot(state, lot.id, { pcs: 2 });
    deleteLot(state, lot.id);
    deleteKapan(state, kapanId);
    movePackets(state, Object.keys(state.packets), null);
    deletePackets(state, Object.keys(state.packets));

    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("a refused operation returns the same state object, not a copy", () => {
    const { state } = seed(1);
    const refused = createKapan(state, { number: "41" });
    expect(refused.state).toBe(state);
  });
});
