/**
 * The ten reports.
 *
 * Every figure comes from `totals.js`, so a report can never disagree with the
 * sheet it was built from. Nothing here formats anything - these return numbers
 * and the screens round them, which is what keeps a column total equal to the sum
 * of what is printed above it.
 *
 * One shared filter runs through all of them. Which date it applies to differs by
 * report, because the honest answer differs: a Kapan is dated when it was created,
 * a lot when it was made up, and a packet when it was scanned. Silently picking one
 * for all three would quietly exclude rows the owner expected to see.
 */

import { groupPacketsByLot, lotTotals, percentOf, rollupKapanTotals } from "./totals";
import { selectKapanRows, ALL_SEASONS } from "./selectors";

export const REPORTS = [
  { key: "season", group: "By Kapan", label: "Season summary", hint: "Kapan-wise totals" },
  { key: "comparison", group: "By Kapan", label: "Kapan comparison", hint: "yield across Kapans" },
  { key: "lots", group: "By lot", label: "All lots", hint: "13 columns, any filter" },
  { key: "sieve", group: "By lot", label: "Yield by sieve", hint: "grouped by સારણી" },
  { key: "extremes", group: "By lot", label: "Best & worst lots", hint: "top and bottom yields" },
  { key: "pending", group: "Returns & loss", label: "Returns pending", hint: "lots still out" },
  { key: "loss", group: "Returns & loss", label: "Loss / missing pcs", hint: "worst first" },
  { key: "daily", group: "Production", label: "Daily production", hint: "by scan date" },
  { key: "packets", group: "Production", label: "Packet log", hint: "every scan" },
  { key: "sheet", group: "Export", label: "Excel sheet", hint: "your workbook shape" },
];

export const emptyFilter = () => ({
  season: ALL_SEASONS,
  from: "",
  to: "",
  kapanId: "",
});

/** yyyy-mm-dd strings compare correctly as strings, so no Date is constructed. */
const inRange = (day, from, to) => {
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

/**
 * The Kapans a filter selects, with their lots, packets and totals already built.
 * Every report starts here.
 */
export const scope = (state, filter = emptyFilter()) => {
  const rows = selectKapanRows(state, { season: filter.season }).rows.filter(
    (row) => !filter.kapanId || row.kapan.id === filter.kapanId
  );

  return rows.map((row) => {
    const packets = Object.values(state.packets).filter(
      (packet) => packet.kapanId === row.kapan.id
    );
    const { byLot, unassigned } = groupPacketsByLot(packets);

    return {
      kapan: row.kapan,
      totals: row.totals,
      lots: row.lots,
      byLot,
      unassigned,
      packets,
    };
  });
};

/* ------------------------------------------------------- 1 & 2. by Kapan */

/** Your "25-26" tab: every Kapan in the season, with a combined total row. */
export const seasonSummary = (state, filter) => {
  const rows = scope(state, filter).filter((entry) =>
    inRange(entry.kapan.createdAt, filter.from, filter.to)
  );

  return {
    rows: rows.map((entry) => ({ kapan: entry.kapan, totals: entry.totals })),
    totals: rollupKapanTotals(rows.map((entry) => entry.totals)),
  };
};

/** The same figures ordered by date, to show whether yield is drifting. */
export const kapanComparison = (state, filter) => {
  const summary = seasonSummary(state, filter);
  return {
    ...summary,
    rows: [...summary.rows].sort((a, b) =>
      `${a.kapan.createdAt}`.localeCompare(`${b.kapan.createdAt}`)
    ),
  };
};

/* ------------------------------------------------------------ 3. all lots */

/** Every lot across the filtered Kapans, all thirteen columns. */
export const allLots = (state, filter) => {
  const rows = [];

  scope(state, filter).forEach((entry) => {
    entry.lots.forEach((lot) => {
      if (!inRange(lot.lotDate, filter.from, filter.to)) return;
      rows.push({
        kapan: entry.kapan,
        lot,
        derived: lotTotals(lot, entry.byLot[lot.id] || []),
      });
    });
  });

  return { rows, totals: aggregate(rows) };
};

/** Sums a set of lot rows into the same shape a Kapan rollup has. */
const aggregate = (rows) => {
  const acc = {
    lotCount: rows.length,
    packetCount: 0,
    roughPcs: 0,
    roughWeight: 0,
    polishedWeight: 0,
    returnPcs: 0,
    returnWeight: 0,
    lotsWithReturns: 0,
    lotsAwaitingReturns: 0,
    missingPcs: 0,
    missingPcsBase: 0,
  };

  rows.forEach(({ derived }) => {
    acc.packetCount += derived.packetCount;
    acc.roughPcs += derived.pcs || 0;
    acc.roughWeight += derived.kachuWeight;
    acc.polishedWeight += derived.polishedWeight;
    acc.returnPcs += derived.returnPcs || 0;
    acc.returnWeight += derived.returnWeight || 0;
    if (derived.hasReturns) {
      acc.lotsWithReturns += 1;
      if (derived.missingPcs !== null) {
        acc.missingPcs += derived.missingPcs;
        acc.missingPcsBase += derived.pcs || 0;
      }
    } else {
      acc.lotsAwaitingReturns += 1;
    }
  });

  const ghatWeight = acc.polishedWeight - acc.returnWeight;

  return {
    ...acc,
    polishedPct: percentOf(acc.polishedWeight, acc.roughWeight),
    returnPct: percentOf(acc.returnWeight, acc.roughWeight),
    ghatWeight,
    ghatPct: percentOf(ghatWeight, acc.roughWeight),
    outstandingPcs: acc.roughPcs - acc.returnPcs,
    roughSize: acc.roughWeight > 0 ? acc.roughPcs / acc.roughWeight : 0,
    returnSize: acc.returnWeight > 0 ? acc.returnPcs / acc.returnWeight : 0,
    missingPct: percentOf(acc.missingPcs, acc.missingPcsBase),
  };
};

export const lotAggregate = aggregate;

/* ------------------------------------------------------- 4. yield by sieve */

/**
 * Lots grouped by સારણી, weighted by carat.
 *
 * Weighted rather than averaged because the groups are wildly different sizes: in
 * Kapan 41 one sieve holds fourteen lots and another holds one, and a plain mean
 * would let that single lot count for as much as the fourteen.
 */
export const yieldBySieve = (state, filter) => {
  const groups = new Map();

  allLots(state, filter).rows.forEach(({ derived }) => {
    if (derived.charmi === null) return;

    if (!groups.has(derived.charmi)) {
      groups.set(derived.charmi, {
        charmi: derived.charmi,
        lotCount: 0,
        kachuWeight: 0,
        polishedWeight: 0,
        pctSum: 0,
      });
    }

    const group = groups.get(derived.charmi);
    group.lotCount += 1;
    group.kachuWeight += derived.kachuWeight;
    group.polishedWeight += derived.polishedWeight;
    group.pctSum += derived.polishedPct;
  });

  const rows = [...groups.values()]
    .map((group) => ({
      charmi: group.charmi,
      lotCount: group.lotCount,
      kachuWeight: group.kachuWeight,
      polishedWeight: group.polishedWeight,
      polishedPct: percentOf(group.polishedWeight, group.kachuWeight),
      // Kept alongside because it is what you get by eyeballing the sheet's
      // ટકાવારી column, and the two differing is worth seeing rather than hiding.
      meanLotPct: group.lotCount ? group.pctSum / group.lotCount : 0,
    }))
    .sort((a, b) => a.charmi - b.charmi);

  const best = rows.reduce(
    (top, row) => (!top || row.polishedPct > top.polishedPct ? row : top),
    null
  );

  return { rows, best, maxPct: best ? best.polishedPct : 0 };
};

/* --------------------------------------------------- 5. best & worst lots */

/** Top and bottom by yield, so an unusual lot gets noticed rather than averaged. */
export const bestWorstLots = (state, filter, count = 10) => {
  // A lot with nothing scanned has no yield to rank - including it would fill the
  // "worst" list with lots nobody has started.
  const ranked = allLots(state, filter)
    .rows.filter((row) => row.derived.kachuWeight > 0)
    .sort((a, b) => b.derived.polishedPct - a.derived.polishedPct);

  return {
    best: ranked.slice(0, count),
    worst: ranked.slice(-count).reverse(),
    ranked,
  };
};

/* ------------------------------------------------------ 6. returns pending */

/**
 * Lots still out, oldest first, with how long they have been gone.
 *
 * `today` is a parameter so this is testable without freezing the clock.
 */
export const returnsPending = (state, filter, today = new Date()) => {
  const todayKey = today.toISOString().slice(0, 10);

  const rows = allLots(state, filter)
    .rows.filter((row) => !row.derived.hasReturns)
    .map((row) => ({
      ...row,
      daysOut: row.lot.lotDate ? daysBetween(row.lot.lotDate, todayKey) : null,
    }))
    .sort((a, b) => (b.daysOut || 0) - (a.daysOut || 0));

  return { rows, totals: aggregate(rows) };
};

const daysBetween = (fromKey, toKey) => {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  // UTC on both sides so a daylight-saving change cannot shift the count.
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
};

/* ----------------------------------------------------------- 7. loss report */

/**
 * Where pieces are going missing, worst first.
 *
 * Only lots whose returns have actually been entered can be missing anything - a
 * lot still out with the workers is outstanding, not lost, and counting it here
 * would make every fresh Kapan look like a disaster.
 */
export const lossReport = (state, filter) => {
  const rows = allLots(state, filter)
    .rows.filter((row) => row.derived.missingPcs !== null)
    .sort((a, b) => {
      const byPct = (b.derived.missingPct || 0) - (a.derived.missingPct || 0);
      return byPct !== 0 ? byPct : (b.derived.missingPcs || 0) - (a.derived.missingPcs || 0);
    });

  return { rows, totals: aggregate(rows) };
};

/* ------------------------------------------------------ 8 & 9. production */

/** Packets scanned per day, newest first. */
export const dailyProduction = (state, filter) => {
  const byDate = new Map();

  scope(state, filter).forEach((entry) => {
    entry.packets.forEach((packet) => {
      if (!inRange(packet.scanDate, filter.from, filter.to)) return;
      if (!byDate.has(packet.scanDate)) byDate.set(packet.scanDate, []);
      byDate.get(packet.scanDate).push(packet);
    });
  });

  const rows = [...byDate.entries()]
    .map(([dateKey, packets]) => {
      const kachuWeight = packets.reduce((sum, p) => sum + (p.kachuWeight || 0), 0);
      const polishedWeight = packets.reduce((sum, p) => sum + (p.polishedWeight || 0), 0);
      return {
        dateKey,
        count: packets.length,
        kachuWeight,
        polishedWeight,
        polishedPct: percentOf(polishedWeight, kachuWeight),
      };
    })
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));

  const kachuWeight = rows.reduce((sum, r) => sum + r.kachuWeight, 0);
  const polishedWeight = rows.reduce((sum, r) => sum + r.polishedWeight, 0);

  return {
    rows,
    totals: {
      count: rows.reduce((sum, r) => sum + r.count, 0),
      kachuWeight,
      polishedWeight,
      polishedPct: percentOf(polishedWeight, kachuWeight),
    },
  };
};

/** Every scan, with which lot and which PC. The audit trail. */
export const packetLog = (state, filter) => {
  const rows = [];

  scope(state, filter).forEach((entry) => {
    entry.packets.forEach((packet) => {
      if (!inRange(packet.scanDate, filter.from, filter.to)) return;
      rows.push({
        kapan: entry.kapan,
        lot: packet.lotId ? state.lots[packet.lotId] : null,
        packet,
        polishedPct: percentOf(packet.polishedWeight, packet.kachuWeight),
      });
    });
  });

  rows.sort((a, b) => `${b.packet.scannedAt}`.localeCompare(`${a.packet.scannedAt}`));
  return { rows };
};

/* ------------------------------------------------------ 10. sheet export */

/**
 * One Kapan in the workbook's own shape: the header block, then the thirteen
 * columns, then a total row. Opens in Excel looking like the file it replaces.
 *
 * Formatting is passed in so this module stays free of display concerns and the
 * exported numbers match what is on screen exactly.
 */
export const sheetRows = (state, kapanId, format) => {
  const entry = scope(state, { ...emptyFilter(), kapanId }).find(
    (candidate) => candidate.kapan.id === kapanId
  );
  if (!entry) return [];

  const { kapan, totals, lots, byLot } = entry;
  const { weight, percent, size, day, int } = format;

  const rows = [
    ["કટ નંબર / Kapan", kapan.number, "", "તારીખ / Date", day(kapan.createdAt)],
    ["સીઝન / Season", kapan.season, "", "", ""],
    [],
    ["કા. નંગ / Rough pcs", int(totals.roughPcs), "", "તૈ. નંગ / Return pcs", int(totals.returnPcs)],
    ["કા.વજન / Rough wt", weight(totals.roughWeight), "", "તૈ.વજન / Return wt", weight(totals.returnWeight)],
    ["તૈયાર વજન / Polished wt", weight(totals.polishedWeight), "", "ટકાવારી / Return %", percent(totals.returnPct)],
    ["ટકાવારી / Polished %", percent(totals.polishedPct), "", "તૈયાર ઘટ વજન / Ghat wt", weight(totals.ghatWeight)],
    ["ઘટ નંગ / Outstanding pcs", int(totals.outstandingPcs), "", "તૈયાર ઘટ ટકાવારી / Ghat %", percent(totals.ghatPct)],
    ["કા. સાઈઝ / Rough size", size(totals.roughSize), "", "તૈ. સાઈઝ / Return size", size(totals.returnSize)],
    [],
    [
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
    ],
  ];

  lots.forEach((lot) => {
    const derived = lotTotals(lot, byLot[lot.id] || []);
    rows.push([
      lot.lotNo,
      day(lot.lotDate),
      derived.pcs === null ? "" : derived.pcs,
      weight(derived.kachuWeight),
      derived.charmi === null ? "" : derived.charmi,
      weight(derived.polishedWeight),
      percent(derived.polishedPct),
      derived.returnPcs === null ? "" : derived.returnPcs,
      derived.returnWeight === null ? "" : weight(derived.returnWeight),
      percent(derived.returnPct),
      percent(derived.ghatPct),
      derived.remainingPcs === null ? "" : derived.remainingPcs,
      day(lot.returnDate),
    ]);
  });

  rows.push([
    "Σ",
    `${lots.length} lots`,
    int(totals.roughPcs),
    weight(totals.roughWeight),
    "",
    weight(totals.polishedWeight),
    percent(totals.polishedPct),
    int(totals.returnPcs),
    weight(totals.returnWeight),
    percent(totals.returnPct),
    percent(totals.ghatPct),
    int(totals.outstandingPcs),
    "",
  ]);

  return rows;
};

/** Every Kapan in scope, one sheet block after another, blank line between. */
export const seasonSheetRows = (state, filter, format) => {
  const rows = [];
  scope(state, filter).forEach((entry, index) => {
    if (index) rows.push([], []);
    sheetRows(state, entry.kapan.id, format).forEach((row) => rows.push(row));
  });
  return rows;
};
