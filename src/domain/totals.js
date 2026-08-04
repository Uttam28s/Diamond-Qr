/**
 * Every figure in the app is computed here and nowhere else.
 *
 * The lot sheet, the Kapan header, the Kapan list, all ten reports and the CSV
 * export call these functions, so two screens cannot show different numbers for
 * the same thing.
 *
 * Reverse-engineered from the factory's own workbook and verified row by row
 * against it - see totals.test.js, which asserts the printed values from the
 * sheet rather than values this file produced.
 *
 * Two rules hold throughout:
 *
 *   1. Full precision in, rounding only at display. A column total is the sum
 *      of the raw values, so it always agrees with the rounded figures printed
 *      above it.
 *   2. A percentage is never the average of other percentages. Every one is
 *      recomputed from summed weights, which is what the sheet does: its 19.68
 *      is 103.916 / 528.058, not the mean of the lot percentages.
 */

import { toNumber, toOptionalNumber } from "./model";

export const WEIGHT_DP = 3;
export const PERCENT_DP = 2;
export const SIZE_DP = 2;

/* ------------------------------------------------------------------ scalars */

/**
 * Rounds half away from zero at `digits`. Deliberately not `toFixed`, which
 * returns a string, and not bare `Math.round(v * 100) / 100`, which drifts on
 * values like 1.005 that land just under the boundary in binary floating point.
 */
export const round = (value, digits = WEIGHT_DP) => {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  const scaled = number * factor;
  // Nudge by one part in 1e9 of the scaled value so 1.005 * 100 = 100.49999...
  // rounds to 101 rather than 100. Far below any real weight's precision.
  const corrected = scaled + Math.sign(scaled) * 1e-9 * Math.abs(scaled);
  return Math.round(corrected) / factor;
};

/**
 * `part` as a percentage of `whole`. A zero or missing `whole` gives 0 rather
 * than Infinity or NaN: a lot with no packets scanned yet has no yield, and
 * showing it as a blank zero is what the sheet does.
 */
export const percentOf = (part, whole) => {
  const divisor = toNumber(whole);
  if (divisor <= 0) return 0;
  return (toNumber(part) / divisor) * 100;
};

/** pcs per carat - the sheet's કા. સાઈઝ and તૈ. સાઈઝ. */
export const sizeOf = (pcs, weight) => {
  const divisor = toNumber(weight);
  if (divisor <= 0) return 0;
  return toNumber(pcs) / divisor;
};

/* ------------------------------------------------------------------ packets */

/**
 * The only place packet weights are summed. A lot's વજન and તૈયાર વ. are these
 * two figures - neither is ever typed by anyone.
 */
export const packetTotals = (packets = []) => {
  let kachuWeight = 0;
  let polishedWeight = 0;

  packets.forEach((packet) => {
    kachuWeight += toNumber(packet.kachuWeight);
    polishedWeight += toNumber(packet.polishedWeight);
  });

  return { count: packets.length, kachuWeight, polishedWeight };
};

/* --------------------------------------------------------------------- lots */

/**
 * One row of the sheet. Column names from the workbook are on each line so this
 * can be read against it.
 *
 * `packets` is the lot's own packets; the caller groups them, because callers
 * that render a whole Kapan group once rather than filtering per lot.
 */
export const lotTotals = (lot = {}, packets = []) => {
  const { count, kachuWeight, polishedWeight } = packetTotals(packets);

  // નંગ. Typed, and still correctable by hand - but one packet holds one diamond,
  // so every scan filed into a lot counts itself into this figure as it arrives
  // (see `addPacket` in operations.js). `null` still means nobody has said yet,
  // which the loss report needs to tell apart from a lot that went out empty.
  const pcs = toOptionalNumber(lot.pcs);
  const returnPcs = toOptionalNumber(lot.returnPcs); // જ. નંગ
  const returnWeight = toOptionalNumber(lot.returnWeight); // જ.વજન

  const polishedPct = percentOf(polishedWeight, kachuWeight); // ટકાવારી
  const returnPct = percentOf(returnWeight || 0, kachuWeight); // જ.ટકાવારી

  // ઘટ. The note called this "polished weight - return weight" and the sheet
  // prints a percentage; both are the same number seen two ways, because
  // ghatWeight / rough * 100 === polishedPct - returnPct. Stored as the weight
  // so the lot row and the Kapan header can never disagree.
  const ghatWeight = polishedWeight - (returnWeight || 0);
  const ghatPct = percentOf(ghatWeight, kachuWeight);

  // બા. નંગ, exactly as the sheet computes it: pcs minus whatever has come
  // back, whether or not any returns have been entered yet.
  const remainingPcs = pcs === null ? null : pcs - (returnPcs || 0);

  const hasReturns = returnPcs !== null || returnWeight !== null;

  return {
    packetCount: count,
    pcs,
    charmi: toOptionalNumber(lot.charmi), // સારણી
    kachuWeight, // વજન
    polishedWeight, // તૈયાર વ.
    polishedPct,
    returnPcs,
    returnWeight,
    returnPct,
    ghatWeight,
    ghatPct,
    remainingPcs,
    hasReturns,

    // Missing pcs is deliberately NOT remainingPcs. A lot that simply has not
    // come back yet is outstanding, not lost, and counting its full pcs as
    // "missing" would make every fresh Kapan look catastrophic. Only lots with
    // returns actually entered can have anything missing.
    missingPcs: hasReturns && pcs !== null ? pcs - (returnPcs || 0) : null,
    missingPct:
      hasReturns && pcs !== null && pcs > 0
        ? percentOf(pcs - (returnPcs || 0), pcs)
        : null,
  };
};

/* ------------------------------------------------------------------- kapans */

const emptyRollup = () => ({
  lotCount: 0,
  packetCount: 0,
  roughPcs: 0,
  roughWeight: 0,
  polishedWeight: 0,
  returnPcs: 0,
  returnWeight: 0,
  lotsWithReturns: 0,
  lotsAwaitingReturns: 0,
  missingPcsBase: 0,
  missingPcs: 0,
});

/** Adds one lot's derived figures into a running rollup. */
const addLot = (acc, derived) => {
  acc.lotCount += 1;
  acc.packetCount += derived.packetCount;
  acc.roughPcs += derived.pcs || 0;
  acc.roughWeight += derived.kachuWeight;
  acc.polishedWeight += derived.polishedWeight;
  acc.returnPcs += derived.returnPcs || 0;
  acc.returnWeight += derived.returnWeight || 0;

  if (derived.hasReturns) {
    acc.lotsWithReturns += 1;
    if (derived.missingPcs !== null) {
      acc.missingPcsBase += derived.pcs || 0;
      acc.missingPcs += derived.missingPcs;
    }
  } else {
    acc.lotsAwaitingReturns += 1;
  }

  return acc;
};

/** Turns a rollup into the twelve figures of the sheet's header block. */
const finishRollup = (acc) => {
  const {
    roughPcs,
    roughWeight,
    polishedWeight,
    returnPcs,
    returnWeight,
  } = acc;

  // તૈયાર ઘટ વજન
  const ghatWeight = polishedWeight - returnWeight;

  return {
    lotCount: acc.lotCount,
    packetCount: acc.packetCount,

    roughPcs, // કા. નંગ
    roughWeight, // કા.વજન
    polishedWeight, // તૈયાર વજન
    polishedPct: percentOf(polishedWeight, roughWeight), // ટકાવારી

    returnPcs, // તૈ. નંગ
    returnWeight, // તૈ.વજન
    returnPct: percentOf(returnWeight, roughWeight), // ટકાવારી

    ghatWeight,
    ghatPct: percentOf(ghatWeight, roughWeight), // તૈયાર ઘટ ટકાવારી

    // ઘટ નંગ. Note this is pcs not yet returned, which for a Kapan still being
    // worked is mostly "still with the workers" rather than "lost" - see
    // missingPcs below for the figure the loss report needs.
    outstandingPcs: roughPcs - returnPcs,

    roughSize: sizeOf(roughPcs, roughWeight), // કા. સાઈઝ
    returnSize: sizeOf(returnPcs, returnWeight), // તૈ. સાઈઝ

    lotsWithReturns: acc.lotsWithReturns,
    lotsAwaitingReturns: acc.lotsAwaitingReturns,
    missingPcs: acc.missingPcs,
    // Carried through so a season rollup can add bases rather than trying to
    // reconstruct one from a percentage.
    missingPcsBase: acc.missingPcsBase,
    missingPct: percentOf(acc.missingPcs, acc.missingPcsBase),
  };
};

/**
 * A Kapan's header block, built from its lots so that it can never drift from
 * the rows printed underneath it.
 *
 * `packetsByLot` maps lotId -> packets. Packets with a null lotId are the
 * Kapan's unassigned tray and are counted separately: including their weight in
 * કા.વજન would inflate a total whose pcs nobody has entered yet.
 */
export const kapanTotals = (lots = [], packetsByLot = {}, unassigned = []) => {
  const acc = lots.reduce(
    (running, lot) => addLot(running, lotTotals(lot, packetsByLot[lot.id] || [])),
    emptyRollup()
  );

  const totals = finishRollup(acc);
  const tray = packetTotals(unassigned);

  return {
    ...totals,
    unassignedCount: tray.count,
    unassignedKachuWeight: tray.kachuWeight,
    unassignedPolishedWeight: tray.polishedWeight,
    status: kapanStatus(totals, tray.count),
  };
};

/**
 * Derived, never typed - the owner already has enough to fill in. "Complete"
 * means every lot has had its returns entered, which is the only definition
 * that needs no extra bookkeeping.
 */
export const kapanStatus = (totals, unassignedCount = 0) => {
  if (!totals.lotCount) return unassignedCount ? "unassigned" : "empty";
  if (totals.lotsAwaitingReturns === 0) return "complete";
  if (totals.lotsWithReturns > 0) return "returns-due";
  return "running";
};

/* ------------------------------------------------------------------ seasons */

/**
 * Season and all-time rollups. Takes the per-Kapan totals rather than raw lots,
 * so a season total is provably the sum of the rows shown in the report.
 */
export const rollupKapanTotals = (kapanTotalsList = []) => {
  const acc = kapanTotalsList.reduce((running, totals) => {
    running.lotCount += totals.lotCount;
    running.packetCount += totals.packetCount;
    running.roughPcs += totals.roughPcs;
    running.roughWeight += totals.roughWeight;
    running.polishedWeight += totals.polishedWeight;
    running.returnPcs += totals.returnPcs;
    running.returnWeight += totals.returnWeight;
    running.lotsWithReturns += totals.lotsWithReturns;
    running.lotsAwaitingReturns += totals.lotsAwaitingReturns;
    running.missingPcs += totals.missingPcs;
    running.missingPcsBase += totals.missingPcsBase;
    return running;
  }, emptyRollup());

  return {
    ...finishRollup(acc),
    kapanCount: kapanTotalsList.length,
  };
};

/* -------------------------------------------------------- yield by sieve */

/**
 * Lots grouped by સારણી, with each group's yield weighted by carat rather than
 * averaged across rows. With 14 lots at one sieve and a single lot at another,
 * a plain average of the percentages would let that one lot count as much as
 * fourteen.
 */
export const yieldBySieve = (lots = [], packetsByLot = {}) => {
  const groups = new Map();

  lots.forEach((lot) => {
    const derived = lotTotals(lot, packetsByLot[lot.id] || []);
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

  return [...groups.values()]
    .map((group) => ({
      charmi: group.charmi,
      lotCount: group.lotCount,
      kachuWeight: group.kachuWeight,
      polishedWeight: group.polishedWeight,
      polishedPct: percentOf(group.polishedWeight, group.kachuWeight),
      // Kept alongside the weighted figure because it is what you get by
      // eyeballing the sheet's ટકાવારી column, and the two differing is worth
      // seeing rather than hiding.
      meanLotPct: group.lotCount ? group.pctSum / group.lotCount : 0,
    }))
    .sort((a, b) => a.charmi - b.charmi);
};

/* ---------------------------------------------------------------- grouping */

/** Packets keyed by lotId. Packets with no lot are returned separately. */
export const groupPacketsByLot = (packets = []) => {
  const byLot = {};
  const unassigned = [];

  packets.forEach((packet) => {
    if (!packet.lotId) {
      unassigned.push(packet);
      return;
    }
    if (!byLot[packet.lotId]) byLot[packet.lotId] = [];
    byLot[packet.lotId].push(packet);
  });

  return { byLot, unassigned };
};

/** Packets grouped by the day they were scanned, newest day first. */
export const groupPacketsByDate = (packets = []) => {
  const byDate = new Map();

  packets.forEach((packet) => {
    const key = packet.scanDate;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(packet);
  });

  return [...byDate.entries()]
    .map(([key, group]) => {
      const totals = packetTotals(group);
      return {
        dateKey: key,
        packets: group,
        ...totals,
        polishedPct: percentOf(totals.polishedWeight, totals.kachuWeight),
      };
    })
    // Date keys are yyyy-mm-dd, so a plain string compare sorts them correctly
    // and avoids constructing a Date per row.
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
};
