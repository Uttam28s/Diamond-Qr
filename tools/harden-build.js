#!/usr/bin/env node
/**
 * Scrubs the build output before it is packaged.
 *
 * Two separate jobs, both run automatically by `npm run build`:
 *
 *  1. Remove what should never ship. The source map alone is the entire original
 *     source - every file name, every comment - sitting in the installer as a
 *     1.3 MB text file.
 *
 *  2. Remove the toolchain's fingerprints, so the app does not advertise how it
 *     was built.
 *
 * On (2): the giveaways are not decorative. They are internal identifiers
 * (`_reactRootContainer`), cross-package protocol keys (`Symbol.for("react.element")`)
 * and the devtools handshake (`__REACT_DEVTOOLS_GLOBAL_HOOK__`). Deleting them
 * breaks the app; renaming them one at a time invites a mismatch that breaks it
 * more subtly.
 *
 * So the rename is a single case-preserving substring replacement applied to the
 * whole bundle at once. Because every occurrence maps the same way, every
 * reference stays consistent with its definition - a definition and its use
 * cannot drift, because neither is treated specially. The renderer is one
 * self-contained bundle, so there is nothing outside it expecting the old names.
 *
 * A side effect worth having: the devtools handshake global no longer has the
 * name any inspector extension looks for, so none can attach.
 *
 * The script fails loudly rather than quietly leaving something behind - a
 * silent pass here would be worse than no script at all.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(root, "build");

if (!fs.existsSync(build)) {
  console.error("No build/ directory - run the React build first.");
  process.exit(1);
}

/* ------------------------------------------------------------------- helpers */

const walk = (dir, found = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
};

const relative = (file) => path.relative(build, file).replace(/\\/g, "/");

const TEXT = new Set([".js", ".css", ".html", ".json", ".txt", ".map"]);
const isText = (file) => TEXT.has(path.extname(file).toLowerCase());

let removed = 0;
let rewritten = 0;

const remove = (file) => {
  if (!fs.existsSync(file)) return;
  const size = fs.statSync(file).size;
  fs.unlinkSync(file);
  console.log(`  removed  ${relative(file)}  (${(size / 1024).toFixed(1)} kB)`);
  removed += 1;
};

/* ----------------------------------------------------- 1. what must not ship */

console.log("Hardening build/:");

for (const file of walk(build)) {
  const name = path.basename(file);
  if (
    // The original source, in full.
    name.endsWith(".map") ||
    // Names the bundled libraries, one licence header each.
    name.endsWith(".LICENSE.txt") ||
    // A build-tool manifest, of no use to a packaged desktop app.
    name === "asset-manifest.json" ||
    // Web-app leftovers. There is no crawler and no install prompt here.
    name === "robots.txt" ||
    name === "manifest.json" ||
    name === "logo192.png" ||
    name === "logo512.png"
  ) {
    remove(file);
  }
}

/* ------------------------------------------- 2. the toolchain's fingerprints */

/**
 * Ordered. The specific entries run before the blanket rename so they are not
 * turned into nonsense by it - a URL is better replaced wholesale than renamed
 * into a domain that does not exist.
 */
const REPLACEMENTS = [
  // Only ever concatenated with an error code and shown on a crash.
  [/https:\/\/reactjs\.org\/docs\/error-decoder\.html\?invariant=/g, "https://diamond-qr.invalid/e/?c="],
  [/https:\/\/react\.dev\/errors\//g, "https://diamond-qr.invalid/e/"],
  [/rendererPackageName:"react-dom"/g, 'rendererPackageName:"ui"'],
  [/" react-mount-point-unstable "/g, '" mount-point-unstable "'],

  // The blanket rename. Case-preserving so identifiers keep their shape.
  [/REACT/g, "RNDR"],
  [/React/g, "Rndr"],
  [/react/g, "rndr"],
];

// Left behind pointing at a file that has just been deleted.
const BANNERS = [
  /\/\*!\s*For license information please see [^*]*\*\//g,
  /\/\/# sourceMappingURL=\S*\s*/g,
  /\/\*# sourceMappingURL=\S*\s*\*\//g,
];

for (const file of walk(build)) {
  if (!isText(file)) continue;

  const before = fs.readFileSync(file, "utf8");
  let after = before;

  for (const pattern of BANNERS) after = after.replace(pattern, "");
  for (const [pattern, value] of REPLACEMENTS) after = after.replace(pattern, value);

  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    console.log(`  rewrote  ${relative(file)}`);
    rewritten += 1;
  }
}

/* ------------------------------------------------- 3. rename the asset paths */

/**
 * `static/js/main.<hash>.js` is itself a recognisable signature, so the bundle
 * moves to `app/ui.<hash>.js`. The hash is kept: it is what stops a stale file
 * being served after an update.
 */
const moves = [];
const staticDir = path.join(build, "static");

if (fs.existsSync(staticDir)) {
  const appDir = path.join(build, "app");
  fs.mkdirSync(appDir, { recursive: true });

  for (const file of walk(staticDir)) {
    const extension = path.extname(file);
    const match = path.basename(file).match(/^main\.([0-9a-f]+)\./);
    const target = path.join(
      appDir,
      match ? `ui.${match[1]}${extension}` : path.basename(file)
    );

    fs.renameSync(file, target);
    moves.push([
      `static/${path.basename(path.dirname(file))}/${path.basename(file)}`,
      `app/${path.basename(target)}`,
    ]);
    console.log(`  moved    ${relative(target)}`);
  }

  // Depth-first, so js/ and css/ are gone before static/ itself.
  for (const dir of ["js", "css", "media", ""]) {
    const full = path.join(staticDir, dir);
    if (fs.existsSync(full) && !fs.readdirSync(full).length) fs.rmdirSync(full);
  }
}

if (moves.length) {
  for (const file of walk(build)) {
    if (!isText(file)) continue;
    const before = fs.readFileSync(file, "utf8");
    let after = before;
    for (const [from, to] of moves) after = after.split(from).join(to);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      console.log(`  relinked ${relative(file)}`);
    }
  }
}

/* -------------------------------------------------------------- 4. prove it */

const FORBIDDEN = [/react/i, /create\s+react\s+app/i, /webpack/i, /babel/i];
const failures = [];

for (const file of walk(build)) {
  if (!isText(file)) continue;
  const text = fs.readFileSync(file, "utf8");

  for (const pattern of FORBIDDEN) {
    const hit = text.match(pattern);
    if (hit) {
      const at = text.indexOf(hit[0]);
      failures.push(
        `${relative(file)}: ${JSON.stringify(text.slice(Math.max(0, at - 40), at + 40))}`
      );
    }
  }
}

// Every referenced asset must actually be there. Deleting manifest.json while
// index.html still links it would 404 on every launch.
const html = path.join(build, "index.html");
if (fs.existsSync(html)) {
  const text = fs.readFileSync(html, "utf8");
  for (const match of text.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
    if (!fs.existsSync(path.join(build, match[1]))) {
      failures.push(`index.html references ./${match[1]}, which does not exist`);
    }
  }
}

console.log(`\n  ${removed} removed, ${rewritten} rewritten, ${moves.length} moved`);

if (failures.length) {
  console.error("\nFAILED - the build still gives itself away:\n");
  failures.slice(0, 20).forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}

console.log("  clean: no toolchain references remain.\n");
