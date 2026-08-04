/**
 * The change format shared by the journal on disk and the wire to the host.
 *
 * Plain CommonJS with no dependencies, because this file is required by the
 * Electron main process (which is not bundled) and by the tests. Nothing here
 * may import from src/.
 *
 * A delta is the set of rows a single commit touched:
 *
 *   { upserts: { kapans: {...}, lots: {...}, packets: {...} },
 *     deletes: { kapans: [...], lots: [...], packets: [...] } }
 *
 * Deltas rather than whole-state writes because a keystroke in the sheet changes
 * one lot, and rewriting thirty megabytes of packets to record it would make the
 * grid unusable long before the data got large.
 */

const TABLES = ["kapans", "lots", "packets"];

const emptyDelta = () => ({
  upserts: { kapans: {}, lots: {}, packets: {} },
  deletes: { kapans: [], lots: [], packets: [] },
});

/**
 * What changed between two states.
 *
 * Compares by reference, which is exact here: the operations in operations.js
 * only ever build a new object for a row they actually changed, so an unchanged
 * row is the identical object in both states.
 */
const computeDelta = (previous, next) => {
  const delta = emptyDelta();
  let changed = false;

  TABLES.forEach((table) => {
    const before = (previous && previous[table]) || {};
    const after = (next && next[table]) || {};

    Object.keys(after).forEach((id) => {
      if (before[id] !== after[id]) {
        delta.upserts[table][id] = after[id];
        changed = true;
      }
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

  return next;
};

/**
 * A delta that only adds packets, which is the one kind of change a client can
 * safely send after working offline: nothing else in the data depends on it, so
 * there is nothing for two PCs to disagree about. Any other delta needs the
 * client to be up to date first.
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
  return TABLES.reduce(
    (sum, table) =>
      sum +
      Object.keys((delta.upserts && delta.upserts[table]) || {}).length +
      ((delta.deletes && delta.deletes[table]) || []).length,
    0
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
