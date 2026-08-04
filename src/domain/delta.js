/**
 * Computing what a commit changed, for sending to the host.
 *
 * This duplicates two functions from `public/shared/delta.js`, and that is
 * deliberate rather than lazy. The host's copy is required unbundled by Electron's
 * main process, so it has to be CommonJS outside src/ - and Create React App's
 * webpack config refuses relative imports from outside src/. Sharing one file
 * would mean ejecting the build config or adding a wrapper dependency, both of
 * which cost more than eighty lines of pure arithmetic-free logic.
 *
 * The risk of the two drifting apart is handled by `delta.test.js`, which loads
 * both and asserts they agree on the same inputs. Only these two functions are
 * duplicated: the client never applies a remote delta - when another computer
 * changes something it refetches the whole state - so `applyDelta` lives only on
 * the host side.
 */

export const TABLES = ["kapans", "lots", "packets"];

const emptyDelta = () => ({
  upserts: { kapans: {}, lots: {}, packets: {} },
  deletes: { kapans: [], lots: [], packets: [] },
  // Per-lot નંગ shifts, sent as "add this much" rather than as a row. See below.
  counters: { lots: {} },
});

const toCount = (value) =>
  value === null || value === undefined || value === "" ? 0 : Number(value) || 0;

/**
 * True when two versions of a lot row differ in nothing but their નંગ, and the
 * new one is a number.
 *
 * That is exactly what a scan does to a lot: `shiftPcs` moves its pcs and touches
 * nothing else. Clearing the cell is not this - it goes back to "nobody has said",
 * which is a statement about the lot rather than a count of pieces, so it travels
 * as an ordinary row and is version-checked like any other edit.
 *
 * Nor is a figure typed in by hand: `updateLot` stamps `updatedAt` too, so two
 * fields differ and the row travels whole. That split is the point - a scan is one
 * more piece and merges with anyone else's, while "the count is 200" is a claim
 * about the lot that two PCs can genuinely disagree about.
 */
const onlyPcsMoved = (before, after) => {
  if (!before || !after) return false;
  if (after.pcs === null || after.pcs === undefined) return false;
  if (before.pcs === after.pcs) return false;

  return [...new Set([...Object.keys(before), ...Object.keys(after)])].every(
    (key) => key === "pcs" || before[key] === after[key]
  );
};

/**
 * What changed between two states, or null if nothing did.
 *
 * Compares by reference, which is exact here: the operations in operations.js
 * only build a new object for a row they actually changed, so an untouched row is
 * the identical object in both states.
 *
 * A lot whose only change is its નંગ is recorded as a **shift** instead of a row.
 * That is what keeps scanning into a lot safe on a client: a packet arriving adds
 * one to the count, and an increment lands correctly on whatever the host holds -
 * so a burst queued through an outage still merges with counts other PCs made
 * meanwhile, instead of overwriting them or being refused outright.
 */
export const computeDelta = (previous, next) => {
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

/**
 * True when a delta only adds packets and shifts નંગ counts. Those are the changes
 * a client may send after working offline - a packet insert and an increment both
 * commute, so two computers cannot disagree about the result. Anything else has to
 * be based on the host's current version.
 *
 * Counters need no mention here: a shift is not an upsert, so a scan into a lot
 * passes this test by not appearing in it.
 */
export const isAdditiveOnly = (delta) => {
  if (!delta) return true;

  const noKapanOrLotChange =
    !Object.keys(delta.upserts.kapans || {}).length &&
    !Object.keys(delta.upserts.lots || {}).length;

  const noDeletes = TABLES.every(
    (table) => !((delta.deletes && delta.deletes[table]) || []).length
  );

  return noKapanOrLotChange && noDeletes;
};

/** Merges queued deltas into one, so a reconnect is a single request. */
export const mergeDeltas = (deltas = []) => {
  const merged = emptyDelta();
  let any = false;

  deltas.filter(Boolean).forEach((delta) => {
    any = true;

    TABLES.forEach((table) => {
      const upserts = (delta.upserts && delta.upserts[table]) || {};
      Object.keys(upserts).forEach((id) => {
        merged.upserts[table][id] = upserts[id];
        // A whole row supersedes every shift banked for it: that row already
        // carries the count they produced, so replaying them would double it.
        if (table === "lots") delete merged.counters.lots[id];
      });

      ((delta.deletes && delta.deletes[table]) || []).forEach((id) => {
        // A row deleted after being upserted should not also be sent as an
        // upsert, or the host would resurrect it.
        delete merged.upserts[table][id];
        // Nor shifted: a lot that is gone has no count left to move.
        if (table === "lots") delete merged.counters.lots[id];
        if (!merged.deletes[table].includes(id)) merged.deletes[table].push(id);
      });
    });

    // Shifts add up, which is the whole point of sending them as shifts: twenty
    // scans queued into one lot during an outage become a single "+20".
    const shifts = (delta.counters && delta.counters.lots) || {};
    Object.keys(shifts).forEach((id) => {
      merged.counters.lots[id] = (merged.counters.lots[id] || 0) + shifts[id];
    });
  });

  return any ? merged : null;
};
