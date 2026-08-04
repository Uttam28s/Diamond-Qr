/**
 * Parsing what someone types into a sheet cell.
 *
 * The one non-obvious rule: **only `+` is an operator.** Returns arrive in
 * batches, so typing `+12` into જ. નંગ adds twelve to what is already there -
 * but સારણી legitimately holds negative values (the factory's own sheet is full
 * of -2), so a leading minus has to mean "the value minus two" and never
 * "subtract two". Making `-` an operator would silently corrupt every charmi
 * cell the moment someone tried to correct one.
 */

import { toNumber } from "./model";

export const ENTRY_INTEGER = "integer";
export const ENTRY_WEIGHT = "weight";

/**
 * @param raw      what the user typed
 * @param current  the cell's existing value, used by `+N`; null when empty
 * @param options  kind: ENTRY_INTEGER | ENTRY_WEIGHT
 *                 allowNegative: charmi only
 *                 label: how the field is named in an error message
 * @returns {{ok: true, value: number|null} | {ok: false, error: string}}
 */
export const parseEntry = (raw, current = null, options = {}) => {
  const {
    kind = ENTRY_WEIGHT,
    allowNegative = false,
    label = "Value",
  } = options;

  const text = `${raw === null || raw === undefined ? "" : raw}`.trim();

  // Clearing a cell is a real edit: it puts the field back to "nobody has told
  // us yet", which the loss report treats differently from a returned zero.
  if (text === "") return { ok: true, value: null };

  const isAddition = text.startsWith("+");
  // Thousands separators are natural to type in a pcs field (7,758) and cannot
  // mean anything else here, so they are dropped rather than rejected.
  const body = (isAddition ? text.slice(1) : text).replace(/,/g, "").trim();

  if (body === "") {
    return { ok: false, error: `Enter a number after the +` };
  }

  if (!/^-?\d*\.?\d+$/.test(body)) {
    return { ok: false, error: `${label} must be a number` };
  }

  const typed = Number(body);
  if (!Number.isFinite(typed)) {
    return { ok: false, error: `${label} must be a number` };
  }

  if (isAddition && typed < 0) {
    // "+-3" is almost certainly a typo, and guessing which half was meant would
    // be worse than asking.
    return { ok: false, error: `Use +3 to add, or -3 to set a negative value` };
  }

  const value = isAddition ? toNumber(current) + typed : typed;

  if (kind === ENTRY_INTEGER && !Number.isInteger(value)) {
    return { ok: false, error: `${label} must be a whole number` };
  }

  if (!allowNegative && value < 0) {
    return { ok: false, error: `${label} cannot be negative` };
  }

  // Weights are carats to three places, which is what the scanner reports and
  // what the sheet prints. Anything finer is noise from a mistyped digit.
  if (kind === ENTRY_WEIGHT) {
    return { ok: true, value: Math.round(value * 1000) / 1000 };
  }

  return { ok: true, value };
};

/* --------------------------------------------------------------------- dates */

const pad2 = (value) => `${value}`.padStart(2, "0");

/**
 * Dates are typed, not picked. A date picker costs a mouse trip per lot, and
 * lots are entered in runs of twenty - so this accepts every shorthand someone
 * filling in a sheet would reach for and normalises to yyyy-mm-dd.
 *
 *   17-07-2026  17/07/2026  17.07.2026  17-7-26   full dates
 *   17-07       17.7                              this year, as the sheet writes it
 *   17                                            this month
 *   t  today                                      today
 *   2026-07-17                                    ISO, pasted
 *
 * Day comes first throughout, matching the workbook and local convention. There
 * is no month-first reading of these, so nothing is ambiguous.
 */
export const parseDateEntry = (raw, today = new Date()) => {
  const text = `${raw === null || raw === undefined ? "" : raw}`.trim().toLowerCase();

  if (text === "") return { ok: true, value: null };

  if (text === "t" || text === "today") {
    return {
      ok: true,
      value: `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(
        today.getDate()
      )}`,
    };
  }

  // ISO first: it is the only form that leads with a four-digit year, so it
  // cannot collide with the day-first shorthands below.
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return buildDate(Number(iso[3]), Number(iso[2]), Number(iso[1]));
  }

  const parts = text.split(/[-/.\s]+/).filter(Boolean);

  if (parts.some((part) => !/^\d+$/.test(part)) || parts.length > 3) {
    return { ok: false, error: "Use a date like 17-07-2026, 17.7, or t for today" };
  }

  const day = Number(parts[0]);
  const month = parts.length > 1 ? Number(parts[1]) : today.getMonth() + 1;
  let year = parts.length > 2 ? Number(parts[2]) : today.getFullYear();

  // A two-digit year means this century. The factory's seasons are named 25-26,
  // so "26" has to mean 2026 rather than 1926.
  if (parts.length > 2 && parts[2].length <= 2) year += 2000;

  return buildDate(day, month, year);
};

const buildDate = (day, month, year) => {
  if (!(month >= 1 && month <= 12)) {
    return { ok: false, error: `There is no month ${month}` };
  }
  // Rejecting 31 February rather than letting Date roll it into March, which
  // would silently record a day nobody typed.
  const daysInMonth = new Date(year, month, 0).getDate();
  if (!(day >= 1 && day <= daysInMonth)) {
    return { ok: false, error: `There is no day ${day} in that month` };
  }
  if (!(year >= 2000 && year <= 2099)) {
    return { ok: false, error: `${year} does not look like a year` };
  }

  return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
};

/** The four editable numeric columns, so callers do not restate the rules. */
export const FIELD_RULES = {
  pcs: { kind: ENTRY_INTEGER, allowNegative: false, label: "Pcs" },
  charmi: { kind: ENTRY_INTEGER, allowNegative: true, label: "Charmi" },
  returnPcs: { kind: ENTRY_INTEGER, allowNegative: false, label: "Return pcs" },
  returnWeight: {
    kind: ENTRY_WEIGHT,
    allowNegative: false,
    label: "Return weight",
  },
};

/** parseEntry with the rules for a named lot field already applied. */
export const parseLotField = (field, raw, current) =>
  parseEntry(raw, current, FIELD_RULES[field] || {});
