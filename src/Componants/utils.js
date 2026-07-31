export const SESSION_STORAGE_KEY = "diamondQrScanSession";
export const KAPAN_STORAGE_KEY = "diamondQrKapans";
export const SETTINGS_STORAGE_KEY = "diamondQrSettings";

export const DEFAULT_SETTINGS = {
  officeName: "Factory Office",
  rowsPerPage: 5,
};

/* ------------------------------------------------------------- formatting */

export const formatNumber = (value, digits = 3) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : (0).toFixed(digits);
};

export const formatPercent = (pWeight, kWeight) => {
  const rough = Number(kWeight);
  const polished = Number(pWeight);
  const percentage = rough > 0 ? (polished / rough) * 100 : 0;
  return Number.isFinite(percentage) ? percentage.toFixed(2) : "0.00";
};

const pad = (value) => `${value}`.padStart(2, "0");

/** Local date key, e.g. 2024-05-17 (never shifts timezone like toISOString). */
export const getDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** 17-05-2024 */
export const formatDisplayDate = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

/** 09:15:32 */
export const formatDisplayTime = (value, withSeconds = true) => {
  const date = toDate(value);
  if (!date) return "-";
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${time}:${pad(date.getSeconds())}` : time;
};

/** 17-05-2024 09:15:32 */
export const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return `${formatDisplayDate(date)} ${formatDisplayTime(date)}`;
};

/** 17-05-2024 09:44 — used in the compact "Last Scan Date" column. */
export const formatDateTimeShort = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return `${formatDisplayDate(date)} ${formatDisplayTime(date, false)}`;
};

/* ---------------------------------------------------------------- storage */

export const readJson = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
};

export const writeJson = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Canonical form of a Kapan number, so "kpn-1024", "KPN-1024 " and
 * "KPN  1024" all resolve to the same Kapan instead of creating new ones.
 */
export const normalizeKapanNumber = (value) =>
  `${value || ""}`.trim().replace(/\s+/g, " ").toUpperCase();

/* ------------------------------------------------------------------- scan */

/**
 * A scan is a comma separated list of numbers, e.g.
 *   0.011,0.024,0.034,0.12,0.024,0.022
 * Only the last two matter: kachu weight then polished weight. Whatever comes
 * before is kept verbatim in `rawCode` but is not interpreted.
 */
export const readScanWeights = (code) => {
  const parts = `${code || ""}`.trim().split(",");
  if (parts.length < 2) return null;

  const rawK = parts[parts.length - 2].trim();
  const rawP = parts[parts.length - 1].trim();
  if (!rawK || !rawP) return null;

  const kWeight = Number(rawK);
  const pWeight = Number(rawP);

  if (
    !Number.isFinite(kWeight) ||
    !Number.isFinite(pWeight) ||
    kWeight <= 0 ||
    pWeight < 0
  ) {
    return null;
  }

  return { kWeight, pWeight };
};

export const parseScanCode = (code) => {
  const rawCode = `${code || ""}`.trim();
  const weights = readScanWeights(rawCode);
  if (!weights) return null;

  const scannedAt = new Date();

  return {
    id: `${scannedAt.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    rawCode,
    kWeight: Number(weights.kWeight.toFixed(3)),
    pWeight: Number(weights.pWeight.toFixed(3)),
    percentage: formatPercent(weights.pWeight, weights.kWeight),
    scannedAt: scannedAt.toISOString(),
    scanDate: getDateKey(scannedAt),
  };
};

/**
 * Brings records written by older builds up to the current shape: they carried
 * a `packetCode` field, which is now just part of `rawCode`.
 */
export const normalizeRecord = (record, index = 0) => {
  if (!record || typeof record !== "object") return null;

  const { packetCode, ...rest } = record;
  const kWeight = Number(record.kWeight) || 0;
  const pWeight = Number(record.pWeight) || 0;
  const scannedAt = record.scannedAt || new Date().toISOString();

  return {
    ...rest,
    id: record.id || `${new Date(scannedAt).getTime()}-${index}`,
    rawCode: `${record.rawCode || packetCode || ""}`.trim(),
    kWeight,
    pWeight,
    percentage: record.percentage || formatPercent(pWeight, kWeight),
    scannedAt,
    scanDate: record.scanDate || getDateKey(new Date(scannedAt)),
  };
};

export const normalizeRecords = (records) =>
  (Array.isArray(records) ? records : []).map(normalizeRecord).filter(Boolean);

export const normalizeKapans = (kapans) => {
  if (!kapans || typeof kapans !== "object") return {};

  return Object.entries(kapans).reduce((acc, [key, kapan]) => {
    if (!kapan || typeof kapan !== "object") return acc;
    acc[key] = {
      ...kapan,
      kapanNumber: kapan.kapanNumber || key,
      records: normalizeRecords(kapan.records),
    };
    return acc;
  }, {});
};

/* ------------------------------------------------------------------ totals */

export const calculateTotals = (records = []) => {
  const totals = records.reduce(
    (acc, record) => ({
      kWeight: acc.kWeight + (Number(record.kWeight) || 0),
      pWeight: acc.pWeight + (Number(record.pWeight) || 0),
    }),
    { kWeight: 0, pWeight: 0 }
  );

  return {
    kWeight: Number(totals.kWeight.toFixed(3)),
    pWeight: Number(totals.pWeight.toFixed(3)),
    percentage: formatPercent(totals.pWeight, totals.kWeight),
  };
};

export const groupRecordsByDate = (records = []) => {
  const groups = new Map();

  records.forEach((record) => {
    const key = record.scanDate || getDateKey(new Date(record.scannedAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return [...groups.entries()]
    .map(([dateKey, groupRecords]) => ({
      dateKey,
      records: [...groupRecords].sort(
        (a, b) => new Date(a.scannedAt) - new Date(b.scannedAt)
      ),
      totals: calculateTotals(groupRecords),
    }))
    .sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey));
};

/** Kapan map -> sorted rows with derived totals, record count and last scan. */
export const buildKapanRows = (kapans = {}) =>
  Object.values(kapans)
    .map((kapan) => {
      const records = kapan.records || [];
      const lastScanAt = records.reduce((latest, record) => {
        const at = new Date(record.scannedAt).getTime();
        return Number.isFinite(at) && at > latest ? at : latest;
      }, 0);

      return {
        ...kapan,
        records,
        totals: calculateTotals(records),
        recordCount: records.length,
        lastScanAt: lastScanAt ? new Date(lastScanAt).toISOString() : kapan.updatedAt,
      };
    })
    .sort((a, b) => new Date(b.lastScanAt || 0) - new Date(a.lastScanAt || 0));

/* ------------------------------------------------------------------ export */

export const toCsv = (rows = []) =>
  rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : `${cell}`;
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\r\n");

export const downloadCsv = (fileName, rows) => {
  // Leading BOM so Excel opens the file as UTF-8.
  const blob = new Blob(["﻿", toCsv(rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
