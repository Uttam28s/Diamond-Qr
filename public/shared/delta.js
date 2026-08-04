/**
 * The change format shared by the journal on disk and the wire to the host.
 *
 * Plain CommonJS with no dependencies, because this file is required by the
 * Electron main process (which is not bundled) and by the tests. Nothing here
 * may import from src/.
 *
 * A delta is the set of rows a single commit touched, plus the નંગ counts it moved:
 *
 *   { upserts: { kapans: {...}, lots: {...}, packets: {...} },
 *     deletes: { kapans: [...], lots: [...], packets: [...] },
 *     counters: { lots: { lotId: +1 } } }
 *
 * Deltas rather than whole-state writes because a keystroke in the sheet changes
 * one lot, and rewriting thirty megabytes of packets to record it would make the
 * grid unusable long before the data got large.
 */

const TABLES = ["kapans", "lots", "packets"];

const emptyDelta = () => ({
  upserts: { kapans: {}, lots: {}, packets: {} },
  deletes: { kapans: [], lots: [], packets: [] },
  // Per-lot નંગ shifts, applied by adding rather than by overwriting. See below.
  counters: { lots: {} },
});

const toCount = (value) =>
  value === null || value === undefined || value === "" ? 0 : Number(value) || 0;

/**
 * True when two versions of a lot row differ in nothing but their નંગ, and the
 * new one is a number.
 *
 * That is exactly what a scan does to a lot: one packet holds one diamond, so
 * filing it adds one to the count and touches nothing else. Clearing the cell is
 * not this - it goes back to "nobody has said", which is a statement about the lot
 * rather than a count of pieces, so it travels as an ordinary row.
 *
 * Nor is a figure typed in by hand: editing a lot stamps `updatedAt` too, so two
 * fields differ and the row travels whole. That split is the point - a scan is one
 * more piece and merges with anyone else's, while "the count is 200" is a claim
 * about the lot that two PCs can genuinely disagree about.
 */
const onlyPcsMoved = (before, after) => {
  if (!before || !after) return false;
  if (after.pcs === null || after.pcs === undefined) return false;
  if (before.pcs === after.pcs) return false;

  const keys = Object.keys(before).concat(Object.keys(after));
  return keys.every((key) => key === "pcs" || before[key] === after[key]);
};

/**
 * What changed between two states.
 *
 * Compares by reference, which is exact here: the operations in operations.js
 * only ever build a new object for a row they actually changed, so an unchanged
 * row is the identical object in both states.
 *
 * A lot whose only change is its નંગ is recorded as a **shift** rather than a row,
 * so it lands correctly on whatever count the host already holds instead of
 * replacing it. That is what lets a client keep scanning into a lot through an
 * outage: increments commute, so a queued burst merges with anything another PC
 * counted in the meantime.
 */
const computeDelta = (previous, next) => {
  const delta = emptyDelta();
  let changed = false;

  TABLES.forEach((table) => {
    const before = (previous && previous[table]) || {};
    const after = (next && next[table]) || {};

    Object.keys(after).forEach((id) => {
      if (before[id] === after[id]) return;
      changed = true;

      if (table === "lots" && onlyPcsMoved(before[id], after[id])) {
        delta.counters.lots[id] = toCount(after[id].pcs) - toCount(before[id].pcs);
        return;
      }

      delta.upserts[table][id] = after[id];
    });

    Object.keys(before).forEach((id) => {
      if (!(id in after)) {
        delta.deletes[table].push(id);
        changed = true;
      }
    });
  });

  return changed ? delta : null;
};

/** Applies a delta, returning a new state. Never mutates the input. */
const applyDelta = (state, delta) => {
  if (!delta) return state;

  const next = {
    schema: state.schema,
    kapans: { ...state.kapans },
    lots: { ...state.lots },
    packets: { ...state.packets },
  };

  TABLES.forEach((table) => {
    const upserts = (delta.upserts && delta.upserts[table]) || {};
    Object.keys(upserts).forEach((id) => {
      next[table][id] = upserts[id];
    });

    const deletes = (delta.deletes && delta.deletes[table]) || [];
    deletes.forEach((id) => {
      delete next[table][id];
    });
  });

  // Shifts last, and by adding: whatever else this delta said about the lot, the
  // pieces it counted have to land on top of the count that is there now. A delta
  // written before counters existed simply has none.
  const shifts = (delta.counters && delta.counters.lots) || {};
  Object.keys(shifts).forEach((id) => {
    const lot = next.lots[id];
    // A shift against a lot that has since gone is nothing to apply.
    if (!lot) return;
    const shifted = toCount(lot.pcs) + toCount(shifts[id]);
    next.lots[id] = { ...lot, pcs: shifted < 0 ? 0 : shifted };
  });

  return next;
};

/**
 * A delta that only adds packets and shifts નંગ counts - the changes a client can
 * safely send after working offline, because an insert and an increment both
 * commute and so there is nothing for two PCs to disagree about. Any other delta
 * needs the client to be up to date first.
 *
 * Counters need no mention here: a shift is not an upsert, so a scan filed into a
 * lot passes this test by not appearing in it.
 */
const isAdditiveOnly = (delta) => {
  if (!delta) return true;

  const noKapanOrLotChange =
    !Object.keys(delta.upserts.kapans || {}).length &&
    !Object.keys(delta.upserts.lots || {}).length;

  const noDeletes = TABLES.every(
    (table) => !((delta.deletes && delta.deletes[table]) || []).length
  );

  return noKapanOrLotChange && noDeletes;
};

/** Rough size guard, so one bad request cannot exhaust the host's memory. */
const countRows = (delta) => {
  if (!delta) return 0;
  return (
    TABLES.reduce(
      (sum, table) =>
        sum +
        Object.keys((delta.upserts && delta.upserts[table]) || {}).length +
        ((delta.deletes && delta.deletes[table]) || []).length,
      0
    ) + Object.keys((delta.counters && delta.counters.lots) || {}).length
  );
};

module.exports = {
  TABLES,
  emptyDelta,
  computeDelta,
  applyDelta,
  isAdditiveOnly,
  countRows,
};
