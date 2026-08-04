/**
 * Read models for the screens.
 *
 * Components get rows that are already shaped, sorted and totalled, so no screen
 * does arithmetic of its own and none of them can disagree about a figure. Every
 * number here comes from `totals.js`.
 */

import {
  groupPacketsByLot,
  kapanTotals,
  lotTotals,
  packetTotals,
  rollupKapanTotals,
} from "./totals";
import { lotWarnings } from "./model";

export const KAPAN_SORTS = [
  { key: "recent", label: "Newest first" },
  { key: "number", label: "Kapan number (A → Z)" },
  { key: "yield", label: "Highest yield %" },
  { key: "rough", label: "Highest rough weight" },
  { key: "pending", label: "Most returns due" },
];

export const ALL_SEASONS = "__all__";

/**
 * A lot as the pickers and the move dropdown want it: the stored row, plus the one
 * figure on those lists that a stored row does not carry.
 *
 * They label a lot with its pcs and its rough weight. Pcs is on the row; વજન is the
 * sum of the lot's packets and has to be worked out, so a picker handed bare lots
 * printed 0.000 ct against every one of them.
 */
const asTarget = (lot, packets = []) => ({
  ...lot,
  roughWeight: packetTotals(packets).kachuWeight,
});

/** The same, from rows that have already been through `lotTotals`. */
export const lotTargets = (rows = []) =>
  rows.map((row) => ({ ...row.lot, roughWeight: row.derived.kachuWeight }));

/* -------------------------------------------------------------- one Kapan */

/**
 * Everything one Kapan's workbench needs: its header figures, its lot rows in
 * sheet order, and the packets nobody has filed into a lot yet.
 */
export const selectKapanView = (state, kapanId) => {
  const kapan = state.kapans[kapanId];
  if (!kapan) return null;

  const lots = Object.values(state.lots)
    .filter((lot) => lot.kapanId === kapanId)
    .sort((a, b) => a.lotNo - b.lotNo);

  const packets = Object.values(state.packets).filter(
    (packet) => packet.kapanId === kapanId
  );
  const { byLot, unassigned } = groupPacketsByLot(packets);

  const rows = lots.map((lot) => {
    const derived = lotTotals(lot, byLot[lot.id] || []);
    return {
      lot,
      derived,
      packets: byLot[lot.id] || [],
      warnings: lotWarnings(lot, derived),
    };
  });

  return {
    kapan,
    totals: kapanTotals(lots, byLot, unassigned),
    rows,
    // The same lots again, shaped for the move dropdown in the unassigned tray.
    lots: lotTargets(rows),
    unassigned: unassigned.sort(
      (a, b) => new Date(a.scannedAt) - new Date(b.scannedAt)
    ),
  };
};

/* ------------------------------------------------------------- Kapan list */

/**
 * One row of the Kapans screen. `lots` comes along in sheet order because the
 * save dialog offers them as scan targets - it needs the list, not just a count.
 */
const buildKapanRow = (state, kapan) => {
  const lots = Object.values(state.lots)
    .filter((lot) => lot.kapanId === kapan.id)
    .sort((a, b) => a.lotNo - b.lotNo);
  const packets = Object.values(state.packets).filter(
    (packet) => packet.kapanId === kapan.id
  );
  const { byLot, unassigned } = groupPacketsByLot(packets);

  return {
    kapan,
    lots: lots.map((lot) => asTarget(lot, byLot[lot.id] || [])),
    totals: kapanTotals(lots, byLot, unassigned),
  };
};

const sortKapanRows = (rows, sort) => {
  const sorted = [...rows];

  switch (sort) {
    case "number":
      return sorted.sort((a, b) =>
        a.kapan.number.localeCompare(b.kapan.number, undefined, { numeric: true })
      );
    case "yield":
      return sorted.sort((a, b) => b.totals.polishedPct - a.totals.polishedPct);
    case "rough":
      return sorted.sort((a, b) => b.totals.roughWeight - a.totals.roughWeight);
    case "pending":
      return sorted.sort(
        (a, b) => b.totals.lotsAwaitingReturns - a.totals.lotsAwaitingReturns
      );
    default:
      // Newest first, by the date the owner recorded rather than by id, so
      // back-dating a Kapan puts it where they expect.
      return sorted.sort((a, b) => {
        const byDate = `${b.kapan.createdAt}`.localeCompare(`${a.kapan.createdAt}`);
        return byDate !== 0
          ? byDate
          : `${b.kapan.updatedAt}`.localeCompare(`${a.kapan.updatedAt}`);
      });
  }
};

export const selectKapanRows = (
  state,
  { season = ALL_SEASONS, search = "", sort = "recent" } = {}
) => {
  const term = search.trim().toLowerCase();

  const rows = Object.values(state.kapans)
    .filter((kapan) => season === ALL_SEASONS || kapan.season === season)
    .filter(
      (kapan) =>
        !term ||
        kapan.number.toLowerCase().includes(term) ||
        kapan.season.toLowerCase().includes(term)
    )
    .map((kapan) => buildKapanRow(state, kapan));

  return {
    rows: sortKapanRows(rows, sort),
    totals: rollupKapanTotals(rows.map((row) => row.totals)),
    unfilteredCount: Object.keys(state.kapans).length,
  };
};

/** Season labels present in the data, newest-looking first. */
export const selectSeasons = (state) => {
  const seasons = new Set();
  Object.values(state.kapans).forEach((kapan) => {
    if (kapan.season) seasons.add(kapan.season);
  });
  return [...seasons].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
};

/**
 * The season a new Kapan should default to: whatever the most recent Kapan
 * used, since a factory works one season for months at a time.
 */
export const selectDefaultSeason = (state) => {
  const rows = selectKapanRows(state, { sort: "recent" }).rows;
  return rows.length ? rows[0].kapan.season : "";
};

/* ------------------------------------------------------- active scan target */

/**
 * Resolves the stored "scan into this lot" pointer against current data.
 *
 * Returns null when the lot or Kapan has since been deleted, which is the whole
 * reason this is resolved rather than trusted: a stale pointer would otherwise
 * send a day of scans into a lot that no longer exists.
 */
export const selectScanTarget = (state, lotId) => {
  if (!lotId) return null;

  const lot = state.lots[lotId];
  if (!lot) return null;

  const kapan = state.kapans[lot.kapanId];
  if (!kapan) return null;

  const packets = Object.values(state.packets).filter(
    (packet) => packet.lotId === lot.id
  );

  return { kapan, lot, derived: lotTotals(lot, packets) };
};
