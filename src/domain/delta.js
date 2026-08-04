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
});

/**
 * What changed between two states, or null if nothing did.
 *
 * Compares by reference, which is exact here: the operations in operations.js
 * only build a new object for a row they actually changed, so an untouched row is
 * the identical object in both states.
 */
export const computeDelta = (previous, next) => {
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

/**
 * True when a delta only adds packets. Those are the changes a client may send
 * after working offline - nothing else depends on them, so two computers cannot
 * disagree. Anything else has to be based on the host's current version.
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
      Object.assign(merged.upserts[table], (delta.upserts && delta.upserts[table]) || {});
      ((delta.deletes && delta.deletes[table]) || []).forEach((id) => {
        // A row deleted after being upserted should not also be sent as an
        // upsert, or the host would resurrect it.
        delete merged.upserts[table][id];
        if (!merged.deletes[table].includes(id)) merged.deletes[table].push(id);
      });
    });
  });

  return any ? merged : null;
};
