import {
  allLots,
  bestWorstLots,
  dailyProduction,
  emptyFilter,
  kapanComparison,
  lossReport,
  packetLog,
  returnsPending,
  seasonSummary,
  sheetRows,
  yieldBySieve,
} from "./reports";
import { round } from "./totals";
import { buildFixture, SHEET_ROWS } from "./sheetFixture";
import { ALL_SEASONS } from "./selectors";
import {
  addPacket,
  createKapan,
  createLot,
  emptyState,
  kapanByNumber,
  lotsOfKapan,
  updateLot,
} from "./operations";
import { formatDay, formatInt, formatPercent, formatSize, formatWeight } from "./format";

/**
 * Reports are checked against the factory's own Kapan 41 wherever possible, so the
 * figures in them are verifiable against the workbook rather than against my own
 * arithmetic.
 */

/**
 * Kapan 41's 28 readable rows, loaded through the real operations.
 *
 * The scan bumps each lot's pcs by one as it lands, so the workbook's own નંગ is
 * set afterwards - these tests are about the reports, and the fixture rows are the
 * figures they have to reproduce.
 */
const buildKapan41 = () => {
  const { lots, packetsByLot } = buildFixture();

  let state = createKapan(emptyState(), {
    number: "41",
    season: "25-26",
    createdAt: "2026-01-17",
  }).state;
  const kapanId = kapanByNumber(state, "41").id;

  lots.forEach((fixtureLot) => {
    state = createLot(state, kapanId, {
      charmi: fixtureLot.charmi,
      lotDate: fixtureLot.lotDate,
    }).state;
  });

  const created = lotsOfKapan(state, kapanId);

  created.forEach((lot, index) => {
    const fixtureLot = lots[index];
    const packet = packetsByLot[fixtureLot.id][0];

    state = addPacket(state, {
      kapanId,
      lotId: lot.id,
      rawCode: packet.rawCode,
      kachuWeight: packet.kachuWeight,
      polishedWeight: packet.polishedWeight,
      scannedAt: packet.scannedAt,
      scannedOn: "OFFICE-PC",
    }).state;

    state = updateLot(state, lot.id, {
      pcs: fixtureLot.pcs,
      ...(fixtureLot.returnPcs === null
        ? {}
        : {
            returnPcs: fixtureLot.returnPcs,
            returnWeight: fixtureLot.returnWeight,
            returnDate: "2026-01-20",
          }),
    }).state;
  });

  return { state, kapanId };
};

const FORMAT = {
  weight: formatWeight,
  percent: formatPercent,
  size: formatSize,
  day: formatDay,
  int: formatInt,
};

const filter = (overrides = {}) => ({ ...emptyFilter(), ...overrides });

/* ========================================================================
   By Kapan
   ======================================================================== */

describe("season summary", () => {
  it("lists the Kapans in the season with a combined total", () => {
    const { state } = buildKapan41();
    const report = seasonSummary(state, filter({ season: "25-26" }));

    expect(report.rows.map((row) => row.kapan.number)).toEqual(["41"]);
    expect(report.totals.kapanCount).toBe(1);
    expect(report.totals.lotCount).toBe(SHEET_ROWS.length);
    // The same figures the workbook's own header prints for these rows.
    expect(report.totals.returnPcs).toBe(1739);
    expect(round(report.totals.returnWeight, 3)).toBe(13.59);
    expect(round(report.totals.roughWeight, 3)).toBe(265.561);
  });

  it("excludes a Kapan created outside the date range", () => {
    const { state } = buildKapan41();
    expect(seasonSummary(state, filter({ from: "2026-06-01" })).rows).toHaveLength(0);
    expect(seasonSummary(state, filter({ to: "2026-06-01" })).rows).toHaveLength(1);
  });

  it("filters by season", () => {
    const { state } = buildKapan41();
    expect(seasonSummary(state, filter({ season: "24-25" })).rows).toHaveLength(0);
    expect(seasonSummary(state, filter({ season: ALL_SEASONS })).rows).toHaveLength(1);
  });
});

describe("kapan comparison", () => {
  it("orders oldest first, so a drift in yield reads left to right", () => {
    let { state } = buildKapan41();
    state = createKapan(state, {
      number: "40",
      season: "25-26",
      createdAt: "2025-11-03",
    }).state;

    const report = kapanComparison(state, filter());
    expect(report.rows.map((row) => row.kapan.number)).toEqual(["40", "41"]);
  });
});

/* ========================================================================
   By lot
   ======================================================================== */

describe("all lots", () => {
  it("returns every lot with its thirteen columns", () => {
    const { state } = buildKapan41();
    const report = allLots(state, filter());

    expect(report.rows).toHaveLength(SHEET_ROWS.length);

    // Row 1 of the workbook, reproduced.
    const first = report.rows[0];
    expect(first.lot.lotNo).toBe(1);
    expect(round(first.derived.polishedPct, 2)).toBe(12.63);
    expect(round(first.derived.returnPct, 2)).toBe(12.11);
    expect(round(first.derived.ghatPct, 2)).toBe(0.52);
    expect(first.derived.remainingPcs).toBe(0);
    expect(first.kapan.number).toBe("41");
  });

  it("totals the rows it returned, not the whole Kapan", () => {
    const { state } = buildKapan41();
    const all = allLots(state, filter());
    const narrowed = allLots(state, filter({ from: "2026-07-17", to: "2026-07-17" }));

    expect(round(all.totals.roughWeight, 3)).toBe(265.561);
    expect(narrowed.totals.lotCount).toBe(SHEET_ROWS.length);
    expect(round(narrowed.totals.roughWeight, 3)).toBe(265.561);
  });
});

describe("yield by sieve", () => {
  const { state } = buildKapan41();
  const report = yieldBySieve(state, filter());

  it("groups all 28 rows by charmi", () => {
    expect(report.rows.map((row) => row.charmi)).toEqual([-2, 2, 7, 11]);
    expect(report.rows.map((row) => row.lotCount)).toEqual([14, 11, 2, 1]);
  });

  it("finds the pattern in the factory's own data: yield rises with sieve size", () => {
    const percentages = report.rows.map((row) => row.polishedPct);
    expect(percentages).toEqual([...percentages].sort((a, b) => a - b));
    expect(report.best.charmi).toBe(11);
  });

  it("weights by carat rather than averaging the rows", () => {
    const smallest = report.rows[0];
    // Fourteen lots of very different sizes, so the two measures differ - and the
    // weighted one is the honest answer.
    expect(round(smallest.polishedPct, 2)).not.toBe(round(smallest.meanLotPct, 2));
  });

  it("ignores lots with no charmi entered", () => {
    let { state: local, kapanId } = buildKapan41();
    local = createLot(local, kapanId, { pcs: 50 }).state; // no charmi
    expect(
      yieldBySieve(local, filter()).rows.reduce((sum, row) => sum + row.lotCount, 0)
    ).toBe(SHEET_ROWS.length);
  });
});

describe("best and worst lots", () => {
  const { state } = buildKapan41();

  it("ranks by yield, best first", () => {
    const report = bestWorstLots(state, filter(), 3);
    expect(report.best.map((row) => row.lot.lotNo)).toEqual([24, 23, 9]);
    expect(round(report.best[0].derived.polishedPct, 2)).toBe(38.55);
  });

  it("worst first in the worst list", () => {
    const report = bestWorstLots(state, filter(), 3);
    expect(round(report.worst[0].derived.polishedPct, 2)).toBe(9.14);
  });

  it("leaves out lots with nothing scanned, which have no yield to rank", () => {
    let { state: local, kapanId } = buildKapan41();
    local = createLot(local, kapanId, { pcs: 99, charmi: 2 }).state;

    const report = bestWorstLots(local, filter(), 50);
    expect(report.ranked).toHaveLength(SHEET_ROWS.length);
    expect(report.ranked.some((row) => row.derived.pcs === 99)).toBe(false);
  });
});

/* ========================================================================
   Returns and loss
   ======================================================================== */

describe("returns pending", () => {
  const { state } = buildKapan41();

  it("lists only the lots still out", () => {
    const report = returnsPending(state, filter(), new Date("2026-08-03T00:00:00Z"));
    // 28 rows, 11 of which have returns entered.
    expect(report.rows).toHaveLength(17);
    expect(report.rows.every((row) => !row.derived.hasReturns)).toBe(true);
  });

  it("counts how long each has been out, oldest first", () => {
    const report = returnsPending(state, filter(), new Date("2026-08-03T00:00:00Z"));
    // Every fixture lot is dated 17-07-2026.
    expect(report.rows[0].daysOut).toBe(17);
    const days = report.rows.map((row) => row.daysOut);
    expect(days).toEqual([...days].sort((a, b) => b - a));
  });

  it("totals what is outstanding", () => {
    const report = returnsPending(state, filter(), new Date("2026-08-03T00:00:00Z"));
    expect(report.totals.lotsAwaitingReturns).toBe(17);
    expect(report.totals.returnPcs).toBe(0);
  });
});

describe("loss report", () => {
  const { state } = buildKapan41();
  const report = lossReport(state, filter());

  it("only counts lots whose returns are actually in", () => {
    expect(report.rows).toHaveLength(11);
  });

  it("reproduces the workbook's own totals", () => {
    // 1760 pcs went out across those 11 lots and 1739 came back - and 1739 is
    // exactly the તૈ. નંગ the sheet prints, which is the cross-check that matters.
    expect(report.totals.missingPcsBase).toBe(1760);
    expect(report.totals.returnPcs).toBe(1739);
    expect(report.totals.missingPcs).toBe(21);
    expect(round(report.totals.missingPct, 2)).toBe(1.19);
  });

  it("puts the worst lot first", () => {
    // Lot 10: 8 of 145 missing, 5.52%.
    expect(report.rows[0].lot.lotNo).toBe(10);
    expect(report.rows[0].derived.missingPcs).toBe(8);
    expect(round(report.rows[0].derived.missingPct, 2)).toBe(5.52);
    expect(report.rows[1].lot.lotNo).toBe(5);
  });

  it("never reports a lot that has not come back as lost", () => {
    expect(report.rows.some((row) => row.lot.lotNo === 8)).toBe(false);
  });
});

/* ========================================================================
   Production
   ======================================================================== */

describe("daily production", () => {
  const { state } = buildKapan41();

  it("groups scans by the day they were taken", () => {
    const report = dailyProduction(state, filter());
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].dateKey).toBe("2026-07-17");
    expect(report.rows[0].count).toBe(SHEET_ROWS.length);
    expect(round(report.rows[0].kachuWeight, 3)).toBe(265.561);
  });

  it("filters on the scan date, not the lot date", () => {
    expect(dailyProduction(state, filter({ from: "2026-08-01" })).rows).toHaveLength(0);
  });
});

describe("packet log", () => {
  const { state } = buildKapan41();

  it("shows every scan with its lot and the PC that took it", () => {
    const report = packetLog(state, filter());
    expect(report.rows).toHaveLength(SHEET_ROWS.length);
    expect(report.rows[0].packet.scannedOn).toBe("OFFICE-PC");
    expect(report.rows[0].lot).toBeTruthy();
    expect(report.rows[0].kapan.number).toBe("41");
  });

  it("shows an unfiled scan with no lot rather than hiding it", () => {
    let { state: local, kapanId } = buildKapan41();
    local = addPacket(local, {
      kapanId,
      lotId: null,
      kachuWeight: 1,
      polishedWeight: 0.2,
    }).state;

    const report = packetLog(local, filter());
    expect(report.rows).toHaveLength(SHEET_ROWS.length + 1);
    expect(report.rows.some((row) => row.lot === null)).toBe(true);
  });
});

/* ========================================================================
   The Excel-shaped export
   ======================================================================== */

describe("sheet export", () => {
  const { state, kapanId } = buildKapan41();
  const rows = sheetRows(state, kapanId, FORMAT);

  it("opens with the header block, in the workbook's own labels", () => {
    expect(rows[0][0]).toContain("કટ નંબર");
    expect(rows[0][1]).toBe("41");
    expect(rows.some((row) => `${row[0]}`.includes("કા. નંગ"))).toBe(true);
    expect(rows.some((row) => `${row[3]}`.includes("તૈયાર ઘટ વજન"))).toBe(true);
  });

  it("then the thirteen columns, in the sheet's order", () => {
    const header = rows.find((row) => row[0] === "ક્રમ");
    expect(header).toEqual([
      "ક્રમ",
      "તારીખ",
      "નંગ",
      "વજન",
      "સારણી",
      "તૈયાર વ.",
      "ટકાવારી",
      "જ. નંગ",
      "જ.વજન",
      "જ.ટકાવારી",
      "ઘટ",
      "બા. નંગ",
      "જ.તારીખ",
    ]);
  });

  it("prints row 1 exactly as the workbook does", () => {
    const headerIndex = rows.findIndex((row) => row[0] === "ક્રમ");
    const first = rows[headerIndex + 1];

    expect(first[0]).toBe(1);
    expect(first[1]).toBe("17-07-2026");
    expect(first[2]).toBe(142);
    expect(first[3]).toBe("7.348");
    expect(first[4]).toBe(-2);
    expect(first[5]).toBe("0.928");
    expect(first[6]).toBe("12.63");
    expect(first[7]).toBe(142);
    expect(first[8]).toBe("0.890");
    expect(first[9]).toBe("12.11");
    expect(first[10]).toBe("0.52");
    expect(first[11]).toBe(0);
    expect(first[12]).toBe("20-01-2026");
  });

  it("leaves a cell blank rather than printing a zero nobody entered", () => {
    const headerIndex = rows.findIndex((row) => row[0] === "ક્રમ");
    // Lot 8 has no returns.
    const lot8 = rows[headerIndex + 8];
    expect(lot8[0]).toBe(8);
    expect(lot8[7]).toBe("");
    expect(lot8[8]).toBe("");
    expect(lot8[12]).toBe("—");
  });

  it("ends with a total row that matches the header block", () => {
    const total = rows[rows.length - 1];
    expect(total[0]).toBe("Σ");
    expect(total[7]).toBe("1,739");
    expect(total[8]).toBe("13.590");
  });

  it("is empty for a Kapan that no longer exists", () => {
    expect(sheetRows(state, "gone", FORMAT)).toEqual([]);
  });
});
