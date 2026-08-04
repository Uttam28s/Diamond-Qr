/**
 * Every change to the data happens through one of these functions.
 *
 * They are pure: each takes the current state and returns a new state plus the
 * inverse operation needed to undo it. That shape is deliberate - the UI
 * promises one-click delete with an Undo toast rather than a confirm dialog on
 * every row, and an undo that is derived from the operation itself cannot drift
 * out of step with what the operation actually did.
 *
 * State is normalised into flat maps rather than nested objects. Editing one
 * cell of one lot then touches one entry instead of rebuilding a Kapan and its
 * whole lot array, and it maps straight onto the three SQLite tables.
 */

import {
  createKapan as makeKapan,
  createLot as makeLot,
  createPacket as makePacket,
  nextLotNo,
  normalizeKapanNumber,
  renumberLots as renumber,
  SCHEMA_VERSION,
} from "./model";

export const emptyState = () => ({
  schema: SCHEMA_VERSION,
  kapans: {},
  lots: {},
  packets: {},
});

const stamp = () => new Date().toISOString();

/** Result shape every operation returns. */
const result = (state, undo) => ({ state, undo });

/** An operation that changed nothing, so there is nothing to undo. */
const noChange = (state, reason) => ({ state, undo: null, error: reason });

const omit = (map, id) => {
  const next = { ...map };
  delete next[id];
  return next;
};

/* ------------------------------------------------------------------ lookups */

export const kapanByNumber = (state, number) => {
  const wanted = normalizeKapanNumber(number);
  return Object.values(state.kapans).find((kapan) => kapan.number === wanted) || null;
};

export const lotsOfKapan = (state, kapanId) =>
  Object.values(state.lots)
    .filter((lot) => lot.kapanId === kapanId)
    .sort((a, b) => a.lotNo - b.lotNo);

export const packetsOfKapan = (state, kapanId) =>
  Object.values(state.packets).filter((packet) => packet.kapanId === kapanId);

export const packetsOfLot = (state, lotId) =>
  Object.values(state.packets).filter((packet) => packet.lotId === lotId);

/* ------------------------------------------------------------------- kapans */

export const createKapan = (state, fields = {}) => {
  const number = normalizeKapanNumber(fields.number);

  if (!number) return noChange(state, "Enter a Kapan number.");
  if (kapanByNumber(state, number)) {
    return noChange(state, `Kapan ${number} already exists.`);
  }

  const kapan = makeKapan(fields);

  return result(
    { ...state, kapans: { ...state.kapans, [kapan.id]: kapan } },
    { label: `Kapan ${number} created`, apply: (s) => deleteKapan(s, kapan.id).state }
  );
};

export const updateKapan = (state, kapanId, patch = {}) => {
  const existing = state.kapans[kapanId];
  if (!existing) return noChange(state, "That Kapan no longer exists.");

  if (patch.number !== undefined) {
    const number = normalizeKapanNumber(patch.number);
    if (!number) return noChange(state, "A Kapan needs a number.");
    const clash = kapanByNumber(state, number);
    if (clash && clash.id !== kapanId) {
      return noChange(state, `Kapan ${number} already exists.`);
    }
  }

  const updated = {
    ...existing,
    ...patch,
    ...(patch.number !== undefined
      ? { number: normalizeKapanNumber(patch.number) }
      : {}),
    updatedAt: stamp(),
  };

  return result(
    { ...state, kapans: { ...state.kapans, [kapanId]: updated } },
    {
      label: `Kapan ${existing.number} edited`,
      apply: (s) => ({ ...s, kapans: { ...s.kapans, [kapanId]: existing } }),
    }
  );
};

/**
 * Deletes a Kapan and everything under it. The undo carries the full set of
 * removed rows rather than re-creating them, so restoring keeps the original
 * ids - any packet whose id changed would look like a fresh scan in the log.
 */
export const deleteKapan = (state, kapanId) => {
  const kapan = state.kapans[kapanId];
  if (!kapan) return noChange(state, "That Kapan no longer exists.");

  const lots = lotsOfKapan(state, kapanId);
  const packets = packetsOfKapan(state, kapanId);

  const nextLots = { ...state.lots };
  lots.forEach((lot) => delete nextLots[lot.id]);
  const nextPackets = { ...state.packets };
  packets.forEach((packet) => delete nextPackets[packet.id]);

  return result(
    { ...state, kapans: omit(state.kapans, kapanId), lots: nextLots, packets: nextPackets },
    {
      label: `Kapan ${kapan.number} deleted`,
      apply: (s) => {
        const restoredLots = { ...s.lots };
        lots.forEach((lot) => {
          restoredLots[lot.id] = lot;
        });
        const restoredPackets = { ...s.packets };
        packets.forEach((packet) => {
          restoredPackets[packet.id] = packet;
        });
        return {
          ...s,
          kapans: { ...s.kapans, [kapanId]: kapan },
          lots: restoredLots,
          packets: restoredPackets,
        };
      },
    }
  );
};

/* --------------------------------------------------------------------- lots */

export const createLot = (state, kapanId, fields = {}) => {
  if (!state.kapans[kapanId]) return noChange(state, "That Kapan no longer exists.");

  const lot = makeLot({
    ...fields,
    kapanId,
    lotNo: nextLotNo(lotsOfKapan(state, kapanId)),
  });

  return result(
    { ...state, lots: { ...state.lots, [lot.id]: lot } },
    {
      label: `Lot ${lot.lotNo} added`,
      apply: (s) => ({ ...s, lots: omit(s.lots, lot.id) }),
    }
  );
};

export const updateLot = (state, lotId, patch = {}) => {
  const existing = state.lots[lotId];
  if (!existing) return noChange(state, "That lot no longer exists.");

  const updated = { ...existing, ...patch, updatedAt: stamp() };

  // Entering a return without a date is the common case - the owner knows what
  // came back, not which day the paperwork says. Filling today in silently beats
  // leaving a hole in the sheet, and it stays editable.
  const gainedReturns =
    (patch.returnPcs !== undefined || patch.returnWeight !== undefined) &&
    (updated.returnPcs !== null || updated.returnWeight !== null) &&
    !updated.returnDate;

  if (gainedReturns) {
    updated.returnDate = new Date().toISOString().slice(0, 10);
  }

  return result(
    { ...state, lots: { ...state.lots, [lotId]: updated } },
    {
      label: `Lot ${existing.lotNo} edited`,
      apply: (s) => ({ ...s, lots: { ...s.lots, [lotId]: existing } }),
    }
  );
};

/**
 * Deletes one lot. `withPackets` decides what happens to the scans it holds:
 * false moves them to the Kapan's unassigned tray (the safe default the confirm
 * dialog focuses), true removes them as well.
 */
export const deleteLot = (state, lotId, { withPackets = false } = {}) => {
  const lot = state.lots[lotId];
  if (!lot) return noChange(state, "That lot no longer exists.");

  const packets = packetsOfLot(state, lotId);
  const nextPackets = { ...state.packets };

  packets.forEach((packet) => {
    if (withPackets) {
      delete nextPackets[packet.id];
    } else {
      nextPackets[packet.id] = { ...packet, lotId: null };
    }
  });

  const label = packets.length
    ? `Lot ${lot.lotNo} deleted, ${packets.length} packet(s) ${
        withPackets ? "deleted" : "moved to Unassigned"
      }`
    : `Lot ${lot.lotNo} deleted`;

  return result(
    { ...state, lots: omit(state.lots, lotId), packets: nextPackets },
    {
      label,
      apply: (s) => {
        const restored = { ...s.packets };
        packets.forEach((packet) => {
          // Restore the original row wholesale, which puts lotId back whether it
          // was cleared or the whole packet was removed.
          restored[packet.id] = packet;
        });
        return { ...s, lots: { ...s.lots, [lotId]: lot }, packets: restored };
      },
    }
  );
};

export const renumberKapanLots = (state, kapanId) => {
  const lots = lotsOfKapan(state, kapanId);
  if (!lots.length) return noChange(state, "This Kapan has no lots to renumber.");

  const renumbered = renumber(lots);
  const unchanged = renumbered.every((lot, index) => lot.lotNo === lots[index].lotNo);
  if (unchanged) return noChange(state, "Lot numbers are already 1 to N.");

  const nextLots = { ...state.lots };
  renumbered.forEach((lot) => {
    nextLots[lot.id] = { ...lot, updatedAt: stamp() };
  });

  return result(
    { ...state, lots: nextLots },
    {
      label: `${lots.length} lots renumbered`,
      apply: (s) => {
        const restored = { ...s.lots };
        lots.forEach((lot) => {
          restored[lot.id] = lot;
        });
        return { ...s, lots: restored };
      },
    }
  );
};

/* ------------------------------------------------------------------ packets */

export const addPacket = (state, fields = {}) => {
  const { kapanId, lotId } = fields;

  if (!state.kapans[kapanId]) return noChange(state, "Pick a Kapan first.");
  if (lotId && !state.lots[lotId]) return noChange(state, "That lot no longer exists.");

  const packet = makePacket(fields);

  return result(
    { ...state, packets: { ...state.packets, [packet.id]: packet } },
    {
      label: "Scan removed",
      apply: (s) => ({ ...s, packets: omit(s.packets, packet.id) }),
    }
  );
};

/**
 * Moves packets between lots, or to the unassigned tray with a null target.
 * This is how a wrong-lot scan gets fixed and how the tray gets emptied - one
 * operation rather than two, because they are the same edit.
 */
export const movePackets = (state, packetIds = [], targetLotId = null) => {
  if (!packetIds.length) return noChange(state, "Select at least one packet.");

  const target = targetLotId ? state.lots[targetLotId] : null;
  if (targetLotId && !target) return noChange(state, "That lot no longer exists.");

  const moving = packetIds.map((id) => state.packets[id]).filter(Boolean);
  if (!moving.length) return noChange(state, "Those packets no longer exist.");

  // Moving into a lot of a different Kapan would silently reassign carats
  // between Kapans, which no correction should ever do by accident.
  if (target && moving.some((packet) => packet.kapanId !== target.kapanId)) {
    return noChange(state, "Packets can only move between lots of the same Kapan.");
  }

  const nextPackets = { ...state.packets };
  moving.forEach((packet) => {
    nextPackets[packet.id] = { ...packet, lotId: targetLotId };
  });

  return result(
    { ...state, packets: nextPackets },
    {
      label: `${moving.length} packet(s) moved ${
        target ? `to lot ${target.lotNo}` : "to Unassigned"
      }`,
      apply: (s) => {
        const restored = { ...s.packets };
        moving.forEach((packet) => {
          restored[packet.id] = packet;
        });
        return { ...s, packets: restored };
      },
    }
  );
};

export const deletePackets = (state, packetIds = []) => {
  const removing = packetIds.map((id) => state.packets[id]).filter(Boolean);
  if (!removing.length) return noChange(state, "Those packets no longer exist.");

  const nextPackets = { ...state.packets };
  removing.forEach((packet) => delete nextPackets[packet.id]);

  return result(
    { ...state, packets: nextPackets },
    {
      label: `${removing.length} packet(s) deleted`,
      apply: (s) => {
        const restored = { ...s.packets };
        removing.forEach((packet) => {
          restored[packet.id] = packet;
        });
        return { ...s, packets: restored };
      },
    }
  );
};
