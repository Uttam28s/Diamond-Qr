#!/usr/bin/env node
/**
 * Checks the thing that actually gets installed.
 *
 *   npm run verify:package
 *
 * `harden-build.js` checks build/, but build/ is not what ships - app.asar is, and
 * it also contains the main process, the licence code and the app's package.json.
 * Two of the worst leaks this project has had were only ever visible here: the
 * signing key, and a preload that was missing from the package entirely.
 *
 * Exits non-zero on any finding, so it can gate a release.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const asar = path.join(root, "dist", "win-unpacked", "resources", "app.asar");

if (!fs.existsSync(asar)) {
  console.error(`No package found at ${path.relative(root, asar)}`);
  console.error("Run `npm run dist` first.");
  process.exit(1);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), "dq-verify-"));

try {
  execFileSync("npx", ["asar", "extract", asar, out], { shell: true, stdio: "pipe" });
} catch (error) {
  console.error("Could not extract the package:", error.message);
  process.exit(1);
}

const walk = (dir, found = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
};

const files = walk(out);
const relative = (file) => path.relative(out, file).replace(/\\/g, "/");
const failures = [];
const note = (message) => failures.push(message);

/* -------------------------------------------------- must not be in there */

const TEXT = new Set([".js", ".json", ".html", ".css", ".txt", ".map", ".dat"]);

const FINGERPRINTS = [
  [/react/i, "names the UI framework"],
  [/create\s+react\s+app/i, "names the build tool"],
  [/webpack/i, "names the bundler"],
  [/sourceMappingURL/i, "points at a source map"],
];

const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/PRIVATE KEY/, "something calling itself a private key"],
];

for (const file of files) {
  const name = path.basename(file);

  if (name.endsWith(".map")) note(`${relative(file)}: a source map is packaged`);
  if (name.endsWith(".pem")) note(`${relative(file)}: a .pem is packaged`);
  if (name.endsWith(".LICENSE.txt")) note(`${relative(file)}: a licence header file is packaged`);

  if (!TEXT.has(path.extname(file).toLowerCase())) continue;

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    continue;
  }

  for (const [pattern, why] of SECRETS) {
    if (pattern.test(text)) note(`${relative(file)}: ${why}`);
  }

  // node_modules ships two third-party packages whose own files legitimately
  // mention their tooling. Only our code is held to the fingerprint rule.
  if (relative(file).startsWith("node_modules/")) continue;

  for (const [pattern, why] of FINGERPRINTS) {
    const hit = text.match(pattern);
    if (hit) {
      const at = text.indexOf(hit[0]);
      note(
        `${relative(file)}: ${why} - ${JSON.stringify(
          text.slice(Math.max(0, at - 30), at + 30)
        )}`
      );
    }
  }
}

/* ------------------------------------------------------- must be in there */

const REQUIRED = [
  "package.json",
  "build/index.html",
  "public/electron.js",
  "public/data-preload.js",
  "public/license-preload.js",
  "public/main/dataIpc.js",
  "public/main/devtools.js",
  "public/main/migrateUserData.js",
  "public/db/fileStore.js",
  "public/net/server.js",
  "public/license/index.js",
];

const present = new Set(files.map(relative));
for (const required of REQUIRED) {
  if (!present.has(required)) note(`missing from the package: ${required}`);
}

// The renderer has to be there under its new name, and its old one gone.
const bundles = [...present].filter((file) => /^build\/app\/ui\.[0-9a-f]+\.js$/.test(file));
if (!bundles.length) note("no build/app/ui.<hash>.js in the package");
if ([...present].some((file) => file.startsWith("build/static/"))) {
  note("build/static/ is still in the package - harden-build.js did not run");
}

/* ------------------------------------------------------------- the report */

const shipped = JSON.parse(fs.readFileSync(path.join(out, "package.json"), "utf8"));
const dependencies = Object.keys(shipped.dependencies || {});

console.log("\nPackage:");
console.log(`  name          ${shipped.name}`);
console.log(`  version       ${shipped.version}`);
console.log(`  files         ${files.length}`);
console.log(`  dependencies  ${dependencies.join(", ") || "(none)"}`);
console.log(`  renderer      ${bundles.join(", ") || "(none)"}`);

const installers = fs.existsSync(path.join(root, "dist"))
  ? fs
      .readdirSync(path.join(root, "dist"))
      .filter((name) => /\.(exe|msi)$/i.test(name))
  : [];
console.log(`  installers    ${installers.join(", ") || "(none built)"}`);

fs.rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\nFAILED - ${failures.length} finding(s):\n`);
  failures.slice(0, 30).forEach((line) => console.error(`  ${line}`));
  console.error("");
  process.exit(1);
}

console.log("\n  clean: no fingerprints, no secrets, nothing missing.\n");
