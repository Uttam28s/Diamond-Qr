/**
 * The shape of the data, and the only place that creates it.
 *
 * Four levels: a Season is just a label on a Kapan, a Kapan holds Lots, a Lot
 * holds Packets. Nothing derived is ever stored - rough weight, polished
 * weight, every percentage, ghat and remaining pcs are all computed on read by
 * `totals.js`. A stored total is a total that can go stale.
 */

/** Bumped whenever the stored shape changes in a way that needs migrating. */
export const SCHEMA_VERSION = 3;

/* ---------------------------------------------------------------------- ids */

let idCounter = 0;

/**
 * Ids must be unique across machines, because a client PC scanning offline
 * mints packet ids that later land in the host's database alongside ids minted
 * elsewhere. Time plus a counter plus randomness is enough: the counter covers
 * the same-millisecond burst a barcode scanner produces, the random tail covers
 * two PCs scanning in the same millisecond.
 */
export const newId = (prefix) => {
  idCounter = (idCounter + 1) % 4096;
  const time = Date.now().toString(36);
  const seq = idCounter.toString(36).padStart(3, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${time}${seq}${rand}`;
};

/* ------------------------------------------------------------------ helpers */

/** A finite number, or `fallback` for anything else (null, "", "abc", NaN). */
export const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

/**
 * A user-entered number that is allowed to be absent. Return pcs and return
 * weight use this: 0 means "none came back", `null` means "nobody has told us
 * yet", and the loss report has to tell those two apart.
 */
export const toOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Local date key, e.g. 2026-08-03. Never shifts timezone like toISOString. */
const pad = (value) => `${value}`.padStart(2, "0");

export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Canonical Kapan number, so "kpn-1024", "KPN-1024 " and "KPN  1024" all mean
 * the same Kapan instead of creating three. Kept free text on purpose - the
 * factory's own numbering includes "41" and "EX-3" side by side.
 */
export const normalizeKapanNumber = (value) =>
  `${value === null || value === undefined ? "" : value}`
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

/** Season label, e.g. "25-26". Same normalising rules as a Kapan number. */
export const normalizeSeason = (value) => normalizeKapanNumber(value);

/* ---------------------------------------------------------------- factories */

export const createKapan = ({
  number,
  season = "",
  createdAt = dateKey(),
  targetAt = null,
} = {}) => ({
  id: newId("kpn"),
  number: normalizeKapanNumber(number),
  season: normalizeSeason(season),
  createdAt,
  targetAt: targetAt || null,
  updatedAt: new Date().toISOString(),
});

export const createLot = ({
  kapanId,
  lotNo,
  lotDate = dateKey(),
  pcs = null,
  charmi = null,
} = {}) => ({
  id: newId("lot"),
  kapanId,
  lotNo,
  lotDate: lotDate || null,
  pcs: toOptionalNumber(pcs),
  charmi: toOptionalNumber(charmi),
  returnPcs: null,
  returnWeight: null,
  returnDate: null,
  updatedAt: new Date().toISOString(),
});

export const createPacket = ({
  kapanId,
  lotId = null,
  rawCode = "",
  kachuWeight,
  polishedWeight,
  scannedAt = new Date().toISOString(),
  scannedOn = "",
} = {}) => ({
  id: newId("pkt"),
  kapanId,
  // null is a real state, not a missing value: a packet scanned before anyone
  // picked a lot sits in the Kapan's unassigned tray until it is moved.
  lotId: lotId || null,
  rawCode: `${rawCode || ""}`.trim(),
  kachuWeight: toNumber(kachuWeight),
  polishedWeight: toNumber(polishedWeight),
  scannedAt,
  scanDate: dateKey(new Date(scannedAt)),
  scannedOn,
});

/* --------------------------------------------------------------- validation */

/**
 * Lot numbers are handed out from a counter that never reuses a value, so
 * deleting lot 6 leaves a gap rather than renaming lots 7 and up. A number
 * written on a paper slip has to keep meaning the same lot next week.
 */
export const nextLotNo = (lots = []) =>
  lots.reduce((highest, lot) => Math.max(highest, toNumber(lot.lotNo)), 0) + 1;

/** Renumbers 1..N in current order. Only ever run when the owner asks. */
export const renumberLots = (lots = []) =>
  lots.map((lot, index) => ({ ...lot, lotNo: index + 1 }));

/**
 * Problems worth showing the owner, as a list rather than a throw - a lot with
 * a missing date is still a lot, and blocking the save would lose the pcs they
 * just typed. The sheet's own rows have gaps in them.
 */
export const lotWarnings = (lot, derived) => {
  const warnings = [];

  if (!lot.lotDate) warnings.push("No lot date");
  if (lot.pcs === null) warnings.push("No pcs entered");

  if (derived && derived.returnPcs !== null && lot.pcs !== null) {
    if (derived.returnPcs > lot.pcs) {
      warnings.push(
        `More pcs returned (${derived.returnPcs}) than went out (${lot.pcs})`
      );
    }
  }

  // Deliberately NOT flagged: a return weight above the lot's polished weight.
  // It looks wrong, but it happens as a matter of course in the factory's own
  // sheet - it is exactly what the negative ઘટ values there are - so treating it
  // as an error would put an amber stripe on a fifth of a normal Kapan and teach
  // everyone to ignore the warnings that do matter.

  return warnings;
};
