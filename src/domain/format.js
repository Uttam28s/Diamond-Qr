/**
 * Display formatting. Values arrive at full precision and get rounded here and
 * only here, so a column total always equals the sum of the figures printed
 * above it.
 */

import { PERCENT_DP, round, SIZE_DP, WEIGHT_DP } from "./totals";

/** What an empty cell shows. Not "0" - a blank and a zero mean different things. */
export const BLANK = "—";

export const formatWeight = (value) =>
  value === null || value === undefined ? BLANK : round(value, WEIGHT_DP).toFixed(WEIGHT_DP);

export const formatPercent = (value) =>
  value === null || value === undefined
    ? BLANK
    : round(value, PERCENT_DP).toFixed(PERCENT_DP);

export const formatSize = (value) =>
  value === null || value === undefined ? BLANK : round(value, SIZE_DP).toFixed(SIZE_DP);

export const formatInt = (value) =>
  value === null || value === undefined ? BLANK : Math.round(value).toLocaleString("en-IN");

/** Plain integer with no grouping - for a lot number or a small count. */
export const formatCount = (value) =>
  value === null || value === undefined ? BLANK : `${Math.round(value)}`;

const pad2 = (value) => `${value}`.padStart(2, "0");

/**
 * dd-mm-yyyy from a yyyy-mm-dd string, by splitting the string rather than
 * constructing a Date. `new Date("2026-07-17")` is parsed as UTC midnight, so
 * reading it back with getDate() shows the 16th anywhere west of Greenwich -
 * a stored date must never shift depending on where the PC is.
 */
export const formatDay = (value) => {
  if (!value) return BLANK;
  const match = `${value}`.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return BLANK;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

/** What goes into a cell being edited: the stored form, not the display form. */
export const dayForEditing = (value) => (value ? `${value}`.slice(0, 10) : "");

export const numberForEditing = (value) =>
  value === null || value === undefined ? "" : `${value}`;

/** Timestamps are real instants, so local time is the right reading. */
export const formatTime = (value) => {
  if (!value) return BLANK;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return BLANK;
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const formatDateTime = (value) => {
  if (!value) return BLANK;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return BLANK;
  const day = `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
  return `${day} ${formatTime(value)}`;
};

export const STATUS_LABELS = {
  empty: "No lots yet",
  unassigned: "Unfiled scans",
  running: "Running",
  "returns-due": "Returns due",
  complete: "Complete",
};
