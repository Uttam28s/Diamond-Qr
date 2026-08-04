#!/usr/bin/env node
/**
 * Draws the app icon, at every size Windows asks for.
 *
 * A generator rather than a folder of PNGs somebody exported once from a tool
 * nobody still has. Change a number here and every size stays in step, which is
 * the whole problem with hand-exported icon sets.
 *
 * No image library: PNG is a handful of CRC'd chunks around a zlib stream, and
 * ICO is a directory of those PNGs. Everything is drawn from the app's own
 * palette in src/Scss/index.scss, so the icon cannot drift from the UI.
 *
 *   node tools/make-icon.js
 *
 * Writes assets/icon.png (1024, used by electron-builder to build the installer
 * icon) and public/favicon.ico (multi-size).
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* --------------------------------------------------------------- the palette */

// Straight out of src/Scss/index.scss.
const BG = [0x0c, 0x27, 0x31]; // $sidebar-bg
const STONE = [0xf4, 0xf6, 0xf7]; // $page-bg
const FACET = [0xdf, 0xee, 0xf0]; // $sidebar-text - the lit facets
const TEAL = [0x1c, 0x7f, 0x83]; // between $teal and $sidebar-bg-active

/* -------------------------------------------------------------- the geometry */

// A brilliant cut seen from the front: table across the top, girdle, apex below.
const DIAMOND = [
  [0.30, 0.285],
  [0.70, 0.285],
  [0.845, 0.455],
  [0.50, 0.80],
  [0.155, 0.455],
];

// The pavilion facet that carries the colour, so the icon is not flat white.
const TEAL_FACET = [
  [0.155, 0.455],
  [0.385, 0.455],
  [0.50, 0.80],
];

// Cut lines, drawn in the background colour so the stone reads as faceted.
const CUTS = [
  [[0.155, 0.455], [0.845, 0.455]], // girdle
  [[0.30, 0.285], [0.385, 0.455]], // table left
  [[0.70, 0.285], [0.615, 0.455]], // table right
  [[0.385, 0.455], [0.50, 0.80]], // pavilion left
  [[0.615, 0.455], [0.50, 0.80]], // pavilion right
];

// Three of them, where a real QR code puts its finder patterns: the two top
// corners and the bottom left. The empty bottom-right corner is what makes it
// read as a QR code rather than as decoration.
const FINDERS = [
  [0.155, 0.155],
  [0.845, 0.155],
  [0.155, 0.845],
];
const FINDER_SIZE = 0.16;

const CORNER = 0.2; // rounded-tile radius

/* --------------------------------------------------------------- hit testing */

const inPolygon = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/** Distance from a point to a line segment. */
const distToSegment = (x, y, [x1, y1], [x2, y2]) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared ? ((x - x1) * dx + (y - y1) * dy) / lengthSquared : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx - x;
  const py = y1 + t * dy - y;
  return Math.sqrt(px * px + py * py);
};

const inRoundedTile = (x, y) => {
  const r = CORNER;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

/**
 * A 7x7 QR finder pattern: one module of border, one of background, a 3x3 core.
 * Returns the colour at this point, or null if the point is outside it.
 */
const finderColorAt = (x, y, [cx, cy], size) => {
  const half = size / 2;
  const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
  if (d > half) return null;

  const module = size / 7;
  if (d >= half - module) return FACET; // border ring
  if (d >= half - 2 * module) return BG; // quiet ring
  return FACET; // 3x3 core
};

/**
 * The colour of one sample point, or null for transparent.
 * `detail` is off at small sizes, where facet lines and finder patterns collapse
 * into mud and a clean silhouette reads far better.
 */
const colorAt = (x, y, detail) => {
  if (!inRoundedTile(x, y)) return null;

  if (detail) {
    for (const finder of FINDERS) {
      const hit = finderColorAt(x, y, finder, FINDER_SIZE);
      if (hit) return hit;
    }
  }

  if (!inPolygon(x, y, DIAMOND)) return BG;

  if (detail) {
    // Cut lines sit on top of the stone, in the background colour.
    for (const cut of CUTS) {
      if (distToSegment(x, y, cut[0], cut[1]) < 0.011) return BG;
    }
    if (inPolygon(x, y, TEAL_FACET)) return TEAL;
    // The crown catches the light; the pavilion is a shade deeper.
    return y < 0.455 ? STONE : FACET;
  }

  return STONE;
};

/* ------------------------------------------------------------------ PNG bits */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
};

/** Renders one size and encodes it as a PNG buffer. */
const renderPng = (size) => {
  // 4x4 samples per pixel. Everything here is a hard edge, and a 16px icon with
  // aliased edges looks broken rather than crisp.
  const samples = size >= 512 ? 2 : 4;
  const detail = size >= 48;
  const raw = Buffer.alloc(size * (size * 4 + 1));

  for (let py = 0; py < size; py += 1) {
    const rowStart = py * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none

    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          const color = colorAt(x, y, detail);
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }

      const total = samples * samples;
      const offset = rowStart + 1 + px * 4;
      // Averaged over covered samples only, so edge pixels blend the shape's own
      // colour with transparency instead of fading towards black.
      const covered = a / 255;
      raw[offset] = covered ? Math.round(r / covered) : 0;
      raw[offset + 1] = covered ? Math.round(g / covered) : 0;
      raw[offset + 2] = covered ? Math.round(b / covered) : 0;
      raw[offset + 3] = Math.round(a / total);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // truecolour with alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

/* ------------------------------------------------------------------ ICO bits */

/**
 * An ICO is a small directory followed by the images themselves. The entries are
 * PNGs rather than BMPs, which Windows has understood since Vista and which keeps
 * the alpha channel intact.
 */
const buildIco = (pngs) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  const directory = Buffer.alloc(16 * pngs.length);
  let offset = header.length + directory.length;

  pngs.forEach(({ size, data }, index) => {
    const at = index * 16;
    directory[at] = size >= 256 ? 0 : size; // 0 means 256
    directory[at + 1] = size >= 256 ? 0 : size;
    directory[at + 2] = 0; // palette
    directory[at + 3] = 0;
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...pngs.map((entry) => entry.data)]);
};

/* --------------------------------------------------------------------- write */

const root = path.join(__dirname, "..");
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const write = (relative, buffer) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  console.log(`  ${relative}  ${(buffer.length / 1024).toFixed(1)} kB`);
};

if (require.main === module) {
  console.log("Drawing the icon:");

  // electron-builder derives every installer and window icon from this one.
  write("assets/icon.png", renderPng(1024));
  write(
    "public/favicon.ico",
    buildIco(ICO_SIZES.map((size) => ({ size, data: renderPng(size) })))
  );

  console.log("Done.");
}

// Exported so the sizes can be eyeballed individually - a 16px icon is where a
// design falls apart, and that is not visible in the 1024 one.
module.exports = { renderPng, buildIco, ICO_SIZES };
