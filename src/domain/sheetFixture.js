/**
 * Kapan 41, transcribed from the factory's own workbook.
 *
 * These are the 28 rows visible in the screenshot of "25-26 CUT". The sheet
 * continues below them - its header reports 7758 pcs and 528.058 ct against the
 * 4066 pcs and 265.561 ct these rows hold - so this is a genuine subset, not the
 * whole Kapan. That is fine and deliberate: every per-row formula can be checked
 * exactly, and the return totals can be checked too, because all eleven rows
 * carrying return data are inside this range (they sum to exactly the 1739 pcs
 * and 13.590 ct the header prints for તૈ. નંગ and તૈ.વજન).
 *
 * Each row records what the SHEET PRINTS in its calculated columns. The tests
 * assert our engine reproduces those printed values, so this fixture is
 * evidence, not a snapshot of our own output.
 *
 * Column order matches the workbook:
 *   ક્રમ  નંગ  વજન  સારણી  તૈયાર વ.  ટકાવારી  જ.નંગ  જ.વજન  જ.ટકાવારી  ઘટ  બા.નંગ
 */

/* eslint-disable no-multi-spaces */
export const SHEET_ROWS = [
  // no  pcs  rough    charmi  polished  pol%    retPcs  retWt  ret%    ghat%   remain
  { no: 1,  pcs: 142, rough: 7.348,  charmi: -2, polished: 0.928, pol: 12.63, retPcs: 142,  retWt: 0.89, ret: 12.11, ghat: 0.52,  remain: 0 },
  { no: 2,  pcs: 140, rough: 8.698,  charmi: -2, polished: 0.882, pol: 10.14, retPcs: 139,  retWt: 0.93, ret: 10.69, ghat: -0.55, remain: 1 },
  { no: 3,  pcs: 161, rough: 12.461, charmi: -2, polished: 2.216, pol: 17.78, retPcs: 159,  retWt: 2.08, ret: 16.69, ghat: 1.09,  remain: 2 },
  { no: 4,  pcs: 161, rough: 12.019, charmi: -2, polished: 1.099, pol: 9.14,  retPcs: 160,  retWt: 1.15, ret: 9.57,  ghat: -0.42, remain: 1 },
  { no: 5,  pcs: 93,  rough: 7.576,  charmi: 2,  polished: 1.317, pol: 17.38, retPcs: 89,   retWt: 1.16, ret: 15.31, ghat: 2.07,  remain: 4 },
  { no: 6,  pcs: 175, rough: 11.266, charmi: -2, polished: 1.078, pol: 9.57,  retPcs: 174,  retWt: 0.96, ret: 8.52,  ghat: 1.05,  remain: 1 },
  { no: 7,  pcs: 145, rough: 8.362,  charmi: -2, polished: 0.955, pol: 11.42, retPcs: 142,  retWt: 0.88, ret: 10.52, ghat: 0.90,  remain: 3 },
  { no: 8,  pcs: 176, rough: 13.455, charmi: 2,  polished: 2.480, pol: 18.43, retPcs: null, retWt: null, ret: 0.00,  ghat: 18.43, remain: 176 },
  { no: 9,  pcs: 78,  rough: 7.989,  charmi: 7,  polished: 2.572, pol: 32.19, retPcs: null, retWt: null, ret: 0.00,  ghat: 32.19, remain: 78 },
  { no: 10, pcs: 145, rough: 9.263,  charmi: -2, polished: 0.967, pol: 10.44, retPcs: 137,  retWt: 0.90, ret: 9.72,  ghat: 0.72,  remain: 8 },
  { no: 11, pcs: 118, rough: 5.212,  charmi: 2,  polished: 0.768, pol: 14.74, retPcs: null, retWt: null, ret: 0.00,  ghat: 14.74, remain: 118 },
  { no: 12, pcs: 151, rough: 10.879, charmi: 2,  polished: 2.123, pol: 19.51, retPcs: 150,  retWt: 1.90, ret: 17.46, ghat: 2.05,  remain: 1 },
  { no: 13, pcs: 239, rough: 10.819, charmi: -2, polished: 1.553, pol: 14.35, retPcs: 239,  retWt: 1.49, ret: 13.77, ghat: 0.58,  remain: 0 },
  { no: 14, pcs: 208, rough: 8.345,  charmi: -2, polished: 1.369, pol: 16.41, retPcs: 208,  retWt: 1.25, ret: 14.98, ghat: 1.43,  remain: 0 },
  { no: 15, pcs: 114, rough: 6.861,  charmi: 2,  polished: 1.584, pol: 23.09, retPcs: null, retWt: null, ret: 0.00,  ghat: 23.09, remain: 114 },
  { no: 16, pcs: 133, rough: 7.847,  charmi: 2,  polished: 1.953, pol: 24.89, retPcs: null, retWt: null, ret: 0.00,  ghat: 24.89, remain: 133 },
  { no: 17, pcs: 180, rough: 10.589, charmi: -2, polished: 1.185, pol: 11.19, retPcs: null, retWt: null, ret: 0.00,  ghat: 11.19, remain: 180 },
  { no: 18, pcs: 237, rough: 13.340, charmi: -2, polished: 1.553, pol: 11.64, retPcs: null, retWt: null, ret: 0.00,  ghat: 11.64, remain: 237 },
  { no: 19, pcs: 111, rough: 7.813,  charmi: 2,  polished: 1.564, pol: 20.02, retPcs: null, retWt: null, ret: 0.00,  ghat: 20.02, remain: 111 },
  { no: 20, pcs: 119, rough: 7.717,  charmi: 2,  polished: 1.666, pol: 21.59, retPcs: null, retWt: null, ret: 0.00,  ghat: 21.59, remain: 119 },
  { no: 21, pcs: 197, rough: 9.080,  charmi: -2, polished: 1.398, pol: 15.40, retPcs: null, retWt: null, ret: 0.00,  ghat: 15.40, remain: 197 },
  { no: 22, pcs: 227, rough: 16.317, charmi: 2,  polished: 3.306, pol: 20.26, retPcs: null, retWt: null, ret: 0.00,  ghat: 20.26, remain: 227 },
  { no: 23, pcs: 144, rough: 16.341, charmi: 7,  polished: 5.281, pol: 32.32, retPcs: null, retWt: null, ret: 0.00,  ghat: 32.32, remain: 144 },
  { no: 24, pcs: 7,   rough: 1.878,  charmi: 11, polished: 0.724, pol: 38.55, retPcs: null, retWt: null, ret: 0.00,  ghat: 38.55, remain: 7 },
  { no: 25, pcs: 118, rough: 7.515,  charmi: -2, polished: 0.790, pol: 10.51, retPcs: null, retWt: null, ret: 0.00,  ghat: 10.51, remain: 118 },
  { no: 26, pcs: 115, rough: 6.614,  charmi: -2, polished: 0.778, pol: 11.76, retPcs: null, retWt: null, ret: 0.00,  ghat: 11.76, remain: 115 },
  { no: 27, pcs: 132, rough: 11.258, charmi: 2,  polished: 1.921, pol: 17.06, retPcs: null, retWt: null, ret: 0.00,  ghat: 17.06, remain: 132 },
  { no: 28, pcs: 100, rough: 8.699,  charmi: 2,  polished: 1.527, pol: 17.55, retPcs: null, retWt: null, ret: 0.00,  ghat: 17.55, remain: 100 },
];
/* eslint-enable no-multi-spaces */

/**
 * The header figures the workbook prints for the whole Kapan. Only the return
 * ones are reachable from the 28 rows above; the rough and polished figures
 * cover lots below the visible area and are recorded here for reference.
 */
export const SHEET_HEADER = {
  roughPcs: 7758, // કા. નંગ    - whole sheet, not reachable from the fixture
  roughWeight: 528.058, // કા.વજન
  polishedWeight: 103.916, // તૈયાર વજન
  polishedPct: 19.68, // ટકાવારી
  returnPcs: 1739, // તૈ. નંગ   - fully inside the fixture
  returnWeight: 13.59, // તૈ.વજન    - fully inside the fixture
  returnPct: 2.57, // ટકાવારી
  ghatWeight: 90.326, // તૈયાર ઘટ વજન
  ghatPct: 17.11, // તૈયાર ઘટ ટકાવારી
  outstandingPcs: 6019, // ઘટ નંગ
  roughSize: 14.69, // કા. સાઈઝ
  returnSize: 127.96, // તૈ. સાઈઝ
};

/**
 * Turns a fixture row into the shape the app stores. A lot's rough and polished
 * weight come from its packets, so each row becomes one lot plus one packet
 * carrying that row's two weights - the arithmetic under test is the same
 * whether those carats arrived as one packet or twenty.
 *
 * The lot carries the row's printed નંગ. In the app that figure counts itself up
 * as packets are scanned in, but it is a stored column either way, and what these
 * tests check is that the eight formulas built on it reproduce the workbook - so
 * the fixture states it outright rather than minting 142 packets to imply it.
 * That the counting itself works is `operations.test.js`'s job.
 */
export const buildFixture = (rows = SHEET_ROWS) => {
  const lots = rows.map((row) => ({
    id: `lot_${row.no}`,
    kapanId: "kpn_41",
    lotNo: row.no,
    lotDate: "2026-07-17",
    pcs: row.pcs,
    charmi: row.charmi,
    returnPcs: row.retPcs,
    returnWeight: row.retWt,
    returnDate: row.retPcs === null ? null : "2026-01-20",
  }));

  const packetsByLot = {};
  rows.forEach((row) => {
    packetsByLot[`lot_${row.no}`] = [
      {
        id: `pkt_${row.no}`,
        kapanId: "kpn_41",
        lotId: `lot_${row.no}`,
        rawCode: `fixture-${row.no}`,
        kachuWeight: row.rough,
        polishedWeight: row.polished,
        scannedAt: "2026-07-17T09:15:32.000Z",
        scanDate: "2026-07-17",
        scannedOn: "fixture",
      },
    ];
  });

  return { lots, packetsByLot };
};
