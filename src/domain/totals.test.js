import {
  groupPacketsByLot,
  kapanTotals,
  lotTotals,
  percentOf,
  rollupKapanTotals,
  round,
  sizeOf,
  yieldBySieve,
} from "./totals";
import { buildFixture, SHEET_HEADER, SHEET_ROWS } from "./sheetFixture";
import { parseLotField } from "./entry";
import { nextLotNo, renumberLots, toOptionalNumber } from "./model";

const { lots, packetsByLot } = buildFixture();

/* ========================================================================
   The sheet is the specification. These tests assert that our engine
   reproduces the values the factory's workbook prints, to the decimal places
   it prints them at.
   ======================================================================== */

describe("lot row - every calculated column, against the sheet", () => {
  SHEET_ROWS.forEach((row, index) => {
    describe(`lot ${row.no}`, () => {
      const derived = lotTotals(lots[index], packetsByLot[`lot_${row.no}`]);

      it("વજન - rough weight is the sum of its packets", () => {
        expect(round(derived.kachuWeight, 3)).toBe(row.rough);
      });

      it("તૈયાર વ. - polished weight is the sum of its packets", () => {
        expect(round(derived.polishedWeight, 3)).toBe(row.polished);
      });

      it("ટકાવારી - polished %", () => {
        expect(round(derived.polishedPct, 2)).toBe(row.pol);
      });

      it("જ.ટકાવારી - return %", () => {
        expect(round(derived.returnPct, 2)).toBe(row.ret);
      });

      it("ઘટ - ghat %", () => {
        expect(round(derived.ghatPct, 2)).toBe(row.ghat);
      });

      it("બા. નંગ - remaining pcs", () => {
        expect(derived.remainingPcs).toBe(row.remain);
      });
    });
  });
});

describe("ghat is one number seen two ways", () => {
  it("ghatWeight / rough equals polishedPct - returnPct for every row", () => {
    lots.forEach((lot) => {
      const derived = lotTotals(lot, packetsByLot[lot.id]);
      const viaWeight = derived.ghatPct;
      const viaPercentages = derived.polishedPct - derived.returnPct;
      expect(round(viaWeight, 6)).toBe(round(viaPercentages, 6));
    });
  });

  it("stores ghat as a weight, so the header can print carats", () => {
    const first = lotTotals(lots[0], packetsByLot.lot_1);
    // 0.928 polished - 0.890 returned
    expect(round(first.ghatWeight, 3)).toBe(0.038);
  });
});

describe("Kapan header - the figures reachable from these 28 rows", () => {
  const totals = kapanTotals(lots, packetsByLot, []);

  it("તૈ. નંગ - return pcs matches the sheet header exactly", () => {
    // Every row in the sheet carrying return data is inside the fixture, which
    // is why a 28-row subset can still hit the whole-Kapan figure.
    expect(totals.returnPcs).toBe(SHEET_HEADER.returnPcs);
  });

  it("તૈ.વજન - return weight matches the sheet header exactly", () => {
    expect(round(totals.returnWeight, 3)).toBe(SHEET_HEADER.returnWeight);
  });

  it("sums rough pcs and weight over the fixture rows", () => {
    expect(totals.roughPcs).toBe(4066);
    expect(round(totals.roughWeight, 3)).toBe(265.561);
  });

  it("recomputes percentages from summed weights, never by averaging", () => {
    const meanOfLotPercentages =
      lots.reduce(
        (sum, lot) => sum + lotTotals(lot, packetsByLot[lot.id]).polishedPct,
        0
      ) / lots.length;

    expect(round(totals.polishedPct, 2)).toBe(
      round(percentOf(totals.polishedWeight, totals.roughWeight), 2)
    );
    // The two differ by more than a rounding wobble, which is exactly why the
    // distinction matters.
    expect(round(totals.polishedPct, 2)).not.toBe(round(meanOfLotPercentages, 2));
  });

  it("ઘટ નંગ - outstanding pcs is rough pcs minus returned pcs", () => {
    expect(totals.outstandingPcs).toBe(4066 - 1739);
  });

  it("counts lots awaiting returns", () => {
    expect(totals.lotsWithReturns).toBe(11);
    expect(totals.lotsAwaitingReturns).toBe(17);
    expect(totals.status).toBe("returns-due");
  });
});

describe("Kapan header - the whole-sheet formulas, on the header's own numbers", () => {
  // The rough and polished totals live in rows below the visible area, so these
  // check the formulas themselves using the figures the header prints.
  const {
    roughPcs,
    roughWeight,
    polishedWeight,
    returnPcs,
    returnWeight,
  } = SHEET_HEADER;

  it("ટકાવારી - polished %", () => {
    expect(round(percentOf(polishedWeight, roughWeight), 2)).toBe(
      SHEET_HEADER.polishedPct
    );
  });

  it("ટકાવારી - return %", () => {
    expect(round(percentOf(returnWeight, roughWeight), 2)).toBe(
      SHEET_HEADER.returnPct
    );
  });

  it("તૈયાર ઘટ વજન - ghat weight", () => {
    expect(round(polishedWeight - returnWeight, 3)).toBe(
      SHEET_HEADER.ghatWeight
    );
  });

  it("તૈયાર ઘટ ટકાવારી - ghat %", () => {
    expect(
      round(percentOf(polishedWeight - returnWeight, roughWeight), 2)
    ).toBe(SHEET_HEADER.ghatPct);
  });

  it("ઘટ નંગ - outstanding pcs", () => {
    expect(roughPcs - returnPcs).toBe(SHEET_HEADER.outstandingPcs);
  });

  it("કા. સાઈઝ - rough size", () => {
    expect(round(sizeOf(roughPcs, roughWeight), 2)).toBe(SHEET_HEADER.roughSize);
  });

  it("તૈ. સાઈઝ - return size", () => {
    expect(round(sizeOf(returnPcs, returnWeight), 2)).toBe(
      SHEET_HEADER.returnSize
    );
  });
});

/* ========================================================================
   Missing pcs is not the same as outstanding pcs. This distinction is the
   whole reason the loss report can be trusted.
   ======================================================================== */

describe("missing pcs vs outstanding pcs", () => {
  const totals = kapanTotals(lots, packetsByLot, []);

  it("only counts lots whose returns have actually been entered", () => {
    // 1760 pcs went out across the 11 returned lots, 1739 came back.
    expect(totals.missingPcs).toBe(21);
    expect(totals.missingPcsBase).toBe(1760);
    expect(round(totals.missingPct, 2)).toBe(1.19);
  });

  it("does not treat a lot that has not come back yet as lost", () => {
    const awaiting = lotTotals(lots[7], packetsByLot.lot_8); // lot 8, no returns
    expect(awaiting.remainingPcs).toBe(176); // the sheet's બા. નંગ
    expect(awaiting.missingPcs).toBeNull(); // but nothing is missing
    expect(awaiting.missingPct).toBeNull();
  });

  it("a fresh Kapan reports no loss at all, not total loss", () => {
    const fresh = kapanTotals(
      [{ id: "l1", lotNo: 1, pcs: 500, returnPcs: null, returnWeight: null }],
      { l1: [{ kachuWeight: 30, polishedWeight: 5 }] },
      []
    );
    expect(fresh.outstandingPcs).toBe(500);
    expect(fresh.missingPcs).toBe(0);
    expect(fresh.missingPct).toBe(0);
    expect(fresh.status).toBe("running");
  });
});

/* ========================================================================
   Yield by sieve - the pattern in the factory's own data.
   ======================================================================== */

describe("yield by sieve (સારણી)", () => {
  const groups = yieldBySieve(lots, packetsByLot);

  it("groups all 28 rows by charmi", () => {
    expect(groups.map((group) => group.charmi)).toEqual([-2, 2, 7, 11]);
    expect(groups.map((group) => group.lotCount)).toEqual([14, 11, 2, 1]);
    expect(
      groups.reduce((sum, group) => sum + group.lotCount, 0)
    ).toBe(SHEET_ROWS.length);
  });

  it("yield rises with sieve size across every group", () => {
    const percentages = groups.map((group) => group.polishedPct);
    const ascending = [...percentages].sort((a, b) => a - b);
    expect(percentages).toEqual(ascending);
  });

  it("weights by carat rather than averaging the rows", () => {
    const smallest = groups[0];
    // With 14 lots of very different sizes the two measures disagree, and the
    // weighted one is the honest answer.
    expect(round(smallest.polishedPct, 2)).not.toBe(
      round(smallest.meanLotPct, 2)
    );
    expect(round(smallest.polishedPct, 2)).toBe(
      round(percentOf(smallest.polishedWeight, smallest.kachuWeight), 2)
    );
  });
});

/* ========================================================================
   Grouping, seasons, and the plumbing around the formulas.
   ======================================================================== */

describe("season rollup", () => {
  it("is the sum of its Kapans, with percentages recomputed", () => {
    const kapanA = kapanTotals(lots, packetsByLot, []);
    const kapanB = kapanTotals(lots, packetsByLot, []);
    const season = rollupKapanTotals([kapanA, kapanB]);

    expect(season.kapanCount).toBe(2);
    expect(season.roughPcs).toBe(kapanA.roughPcs * 2);
    expect(round(season.roughWeight, 3)).toBe(round(kapanA.roughWeight * 2, 3));
    // Doubling everything cannot change a ratio.
    expect(round(season.polishedPct, 4)).toBe(round(kapanA.polishedPct, 4));
    expect(season.missingPcs).toBe(kapanA.missingPcs * 2);
    expect(round(season.missingPct, 4)).toBe(round(kapanA.missingPct, 4));
  });
});

describe("unassigned packets", () => {
  it("are counted separately and never inflate કા.વજન", () => {
    const tray = [
      { kachuWeight: 5, polishedWeight: 1, lotId: null },
      { kachuWeight: 3, polishedWeight: 0.5, lotId: null },
    ];
    const withTray = kapanTotals(lots, packetsByLot, tray);
    const withoutTray = kapanTotals(lots, packetsByLot, []);

    expect(round(withTray.roughWeight, 3)).toBe(round(withoutTray.roughWeight, 3));
    expect(withTray.unassignedCount).toBe(2);
    expect(withTray.unassignedKachuWeight).toBe(8);
  });

  it("groupPacketsByLot separates them out", () => {
    const { byLot, unassigned } = groupPacketsByLot([
      { id: "a", lotId: "lot_1" },
      { id: "b", lotId: null },
      { id: "c", lotId: "lot_1" },
    ]);
    expect(byLot.lot_1).toHaveLength(2);
    expect(unassigned).toHaveLength(1);
  });
});

describe("kapan status", () => {
  const packets = { l1: [{ kachuWeight: 10, polishedWeight: 2 }] };

  it("is complete once every lot has returns entered", () => {
    const totals = kapanTotals(
      [{ id: "l1", lotNo: 1, pcs: 100, returnPcs: 98, returnWeight: 1.9 }],
      packets,
      []
    );
    expect(totals.status).toBe("complete");
  });

  it("treats a returned zero as an answer, not as missing data", () => {
    const totals = kapanTotals(
      [{ id: "l1", lotNo: 1, pcs: 100, returnPcs: 0, returnWeight: 0 }],
      packets,
      []
    );
    expect(totals.status).toBe("complete");
    expect(totals.missingPcs).toBe(100);
  });

  it("is empty with no lots and no packets", () => {
    expect(kapanTotals([], {}, []).status).toBe("empty");
  });
});

describe("division guards", () => {
  it("a lot with no packets has no yield rather than Infinity", () => {
    const derived = lotTotals({ pcs: 100, returnWeight: 5 }, []);
    expect(derived.polishedPct).toBe(0);
    expect(derived.returnPct).toBe(0);
    expect(Number.isFinite(derived.ghatPct)).toBe(true);
  });

  it("sizeOf and percentOf never return NaN or Infinity", () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(sizeOf(5, 0)).toBe(0);
    expect(percentOf(null, undefined)).toBe(0);
  });
});

describe("rounding", () => {
  it("rounds half away from zero even where binary floats fall short", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(-1.005, 2)).toBe(-1.01);
  });

  it("leaves already-short values alone", () => {
    expect(round(7.348, 3)).toBe(7.348);
    expect(round(0, 2)).toBe(0);
  });
});

/* ========================================================================
   Lot numbering and cell entry.
   ======================================================================== */

describe("lot numbering", () => {
  it("never reuses a number, so deleting lot 6 leaves a gap", () => {
    const existing = [{ lotNo: 1 }, { lotNo: 2 }, { lotNo: 7 }, { lotNo: 28 }];
    expect(nextLotNo(existing)).toBe(29);
  });

  it("starts at 1 for a new Kapan", () => {
    expect(nextLotNo([])).toBe(1);
  });

  it("renumbers 1..N only when asked", () => {
    const renumbered = renumberLots([{ lotNo: 1 }, { lotNo: 7 }, { lotNo: 28 }]);
    expect(renumbered.map((lot) => lot.lotNo)).toEqual([1, 2, 3]);
  });
});

describe("cell entry", () => {
  it("a plain number replaces the value", () => {
    expect(parseLotField("returnPcs", "101", 89)).toEqual({ ok: true, value: 101 });
  });

  it("+N adds to what is already there", () => {
    expect(parseLotField("returnPcs", "+12", 89)).toEqual({ ok: true, value: 101 });
    expect(parseLotField("returnWeight", "+0.25", 1.16)).toEqual({
      ok: true,
      value: 1.41,
    });
  });

  it("+N on an empty cell starts from zero", () => {
    expect(parseLotField("returnPcs", "+12", null)).toEqual({ ok: true, value: 12 });
  });

  it("a leading minus SETS a negative charmi, it does not subtract", () => {
    // The trap: charmi is full of -2 in the real sheet. If minus were an
    // operator, correcting a charmi cell would silently compute 2 - 2 = 0.
    expect(parseLotField("charmi", "-2", 2)).toEqual({ ok: true, value: -2 });
  });

  it("refuses a negative where one makes no sense", () => {
    expect(parseLotField("pcs", "-5", null).ok).toBe(false);
    expect(parseLotField("returnWeight", "-1.5", null).ok).toBe(false);
  });

  it("clearing a cell gives null, not zero", () => {
    // Distinguishing "none came back" from "nobody has told us yet" is what
    // keeps the loss report honest.
    expect(parseLotField("returnPcs", "", 140)).toEqual({ ok: true, value: null });
    expect(toOptionalNumber("")).toBeNull();
    expect(toOptionalNumber(0)).toBe(0);
  });

  it("requires whole numbers for pcs", () => {
    expect(parseLotField("pcs", "142.5", null).ok).toBe(false);
    expect(parseLotField("pcs", "142", null)).toEqual({ ok: true, value: 142 });
  });

  it("accepts a thousands separator", () => {
    expect(parseLotField("pcs", "7,758", null)).toEqual({ ok: true, value: 7758 });
  });

  it("rejects nonsense with a message rather than storing NaN", () => {
    expect(parseLotField("pcs", "abc", null).ok).toBe(false);
    expect(parseLotField("returnPcs", "+", 10).ok).toBe(false);
    expect(parseLotField("returnPcs", "+-3", 10).ok).toBe(false);
  });

  it("holds weights to three decimals", () => {
    expect(parseLotField("returnWeight", "0.8901", null)).toEqual({
      ok: true,
      value: 0.89,
    });
  });
});
