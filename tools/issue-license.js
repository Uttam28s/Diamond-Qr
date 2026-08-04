#!/usr/bin/env node
/**
 * ADMIN TOOL -- run on your machine only. Never ship tools/ to a customer.
 *
 * Mint a license key for one specific computer, from the request code that the
 * app's activation screen displays.
 *
 *   node tools/issue-license.js --request "DQR-R1.eyJ2..." --to "Raj Diamond"
 *   node tools/issue-license.js --request-file code.txt --to "Raj" --expires 2027-03-31
 *   node tools/issue-license.js --verify "DQR-L1.eyJ2..."
 *
 * Options
 *   --request <code>       request code from the activation screen
 *   --request-file <path>  read the request code from a file instead
 *   --to <name>            who this license is for (shown in the app's About/footer)
 *   --id <id>              your own reference id (default: auto AUTO-<n>)
 *   --expires <YYYY-MM-DD> optional expiry. Omit for a perpetual license.
 *   --seats <n>            how many computers may use the data when this PC is the
 *                          host, counting the host itself. Omit for unlimited.
 *   --verify <key>         check a license key's signature and print its contents
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const codec = require("../public/license/codec");

const ROOT = path.join(__dirname, "..");
const PRIVATE_PATH = path.join(__dirname, "keys", "license-private.pem");
const ISSUED_DIR = path.join(__dirname, "issued");
const ISSUED_LOG = path.join(ISSUED_DIR, "licenses.json");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function die(message) {
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
}

function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_PATH)) {
    die(
      `No signing key found at ${path.relative(ROOT, PRIVATE_PATH)}\n` +
        `  Run: node tools/generate-keypair.js`
    );
  }
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_PATH, "utf8"));
}

function readIssuedLog() {
  try {
    return JSON.parse(fs.readFileSync(ISSUED_LOG, "utf8"));
  } catch (err) {
    return [];
  }
}

function appendIssuedLog(record) {
  const log = readIssuedLog();
  log.push(record);
  fs.mkdirSync(ISSUED_DIR, { recursive: true });
  fs.writeFileSync(ISSUED_LOG, JSON.stringify(log, null, 2));
}

function verifyMode(key) {
  const PUBLIC_KEY = require("../public/license/public-key");
  let payload;
  try {
    payload = codec.decodeLicense(key, PUBLIC_KEY);
  } catch (err) {
    die(`Signature check FAILED: ${err.message}`);
  }
  console.log("\n  Signature: VALID (minted with your private key)\n");
  console.log(`  License id : ${payload.lic}`);
  console.log(`  Issued to  : ${payload.to || "(unnamed)"}`);
  console.log(`  Issued at  : ${new Date(payload.iat).toISOString()}`);
  console.log(`  Expires    : ${payload.exp ? new Date(payload.exp).toISOString() : "never (perpetual)"}`);
  console.log(`  Seats      : ${payload.seats ? `${payload.seats} computer(s)` : "unlimited"}`);
  console.log(`  Bound to   : ${Object.keys(payload.c).join(", ")}`);
  console.log("");
}

function main() {
  const args = parseArgs(process.argv);

  if (args.verify) {
    verifyMode(args.verify);
    return;
  }

  let requestCode = args.request;
  if (args["request-file"]) {
    requestCode = fs.readFileSync(args["request-file"], "utf8");
  }
  if (!requestCode || requestCode === true) {
    die("Provide --request \"<code>\" or --request-file <path>. Use --help style docs at top of this file.");
  }

  let request;
  try {
    request = codec.decodeRequest(requestCode);
  } catch (err) {
    die(err.message);
  }

  const components = request.c;
  const hardwareKeys = Object.keys(components).filter((k) => k !== "cpuModel" && k !== "mid");
  if (!components.mid && hardwareKeys.length === 0) {
    die(
      "This request code carries no usable hardware identifiers. The license would\n" +
        "  not be meaningfully locked to that machine. Investigate before issuing."
    );
  }
  if (hardwareKeys.length === 0) {
    console.warn(
      "\n  WARNING: only a Windows MachineGuid was readable on that machine (no SMBIOS\n" +
        "  UUID / board serial / CPU id). The license will still be locked, but a full\n" +
        "  disk clone to another PC would not be detected. Proceeding.\n"
    );
  }

  let exp = null;
  if (args.expires && args.expires !== true) {
    const parsed = new Date(`${args.expires}T23:59:59Z`);
    if (Number.isNaN(parsed.getTime())) die(`Could not read --expires "${args.expires}". Use YYYY-MM-DD.`);
    exp = parsed.getTime();
  }

  let seats = 0;
  if (args.seats && args.seats !== true) {
    seats = Number(args.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 99) {
      die(`Could not read --seats "${args.seats}". Use a whole number from 1 to 99.`);
    }
  }

  const issued = readIssuedLog();
  const licenseId = args.id && args.id !== true ? args.id : `AUTO-${String(issued.length + 1).padStart(4, "0")}`;

  const payload = {
    v: 1,
    app: codec.APP_ID,
    lic: licenseId,
    to: args.to && args.to !== true ? args.to : null,
    iat: Date.now(),
    exp,
    // Left out of the payload entirely when unlimited, so a single-PC key is
    // byte-identical to what this tool produced before seats existed.
    ...(seats ? { seats } : {}),
    c: components,
  };

  const licenseKey = codec.encodeLicense(payload, loadPrivateKey());

  appendIssuedLog({
    lic: licenseId,
    to: payload.to,
    issuedAt: new Date(payload.iat).toISOString(),
    expires: exp ? new Date(exp).toISOString() : null,
    seats: seats || "unlimited",
    boundTo: components,
    licenseKey,
  });

  console.log("\n==================== LICENSE KEY ====================\n");
  console.log(licenseKey);
  console.log("\n=====================================================\n");
  console.log(`  License id : ${licenseId}`);
  console.log(`  Issued to  : ${payload.to || "(unnamed)"}`);
  console.log(`  Expires    : ${exp ? new Date(exp).toISOString().slice(0, 10) : "never (perpetual)"}`);
  console.log(`  Seats      : ${seats ? `${seats} computer(s)` : "unlimited"}`);
  console.log(`  Locked to  : ${Object.keys(components).join(", ")}`);
  console.log(`\n  Logged in ${path.relative(ROOT, ISSUED_LOG)}`);
  console.log("  Paste the key above into the app's activation screen on that computer.\n");
}

main();
