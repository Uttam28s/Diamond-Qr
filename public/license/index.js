/**
 * License gate. MAIN PROCESS ONLY -- never import this from renderer code.
 *
 * The renderer is only ever told a status string. It is never trusted to decide
 * whether the app may run, and the app UI is not even loaded until the main process
 * has verified a license.
 */
const fs = require("fs");
const path = require("path");

const codec = require("./codec");
const fingerprint = require("./fingerprint");
const PUBLIC_KEY = require("./public-key");

const LICENSE_FILE = "license.dat";

function licensePath(dataDir) {
  return path.join(dataDir, LICENSE_FILE);
}

function readStoredKey(dataDir) {
  try {
    const raw = fs.readFileSync(licensePath(dataDir), "utf8").trim();
    return raw || null;
  } catch (err) {
    return null; // missing or unreadable == not activated
  }
}

function writeStoredKey(dataDir, licenseKey) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(licensePath(dataDir), licenseKey, { encoding: "utf8", mode: 0o600 });
}

function clearStoredKey(dataDir) {
  try {
    fs.unlinkSync(licensePath(dataDir));
  } catch (err) {
    /* already gone */
  }
}

/**
 * Check a license key against this machine, right now.
 * Returns { ok, reason, detail, payload }.
 */
function inspect(licenseKey, current) {
  let payload;
  try {
    payload = codec.decodeLicense(licenseKey, PUBLIC_KEY);
  } catch (err) {
    // Either hand-edited, truncated, or minted with the wrong key.
    return { ok: false, reason: "invalid_signature", detail: err.message, payload: null };
  }

  if (payload.exp && Date.now() > Number(payload.exp)) {
    return {
      ok: false,
      reason: "expired",
      detail: `expired ${new Date(Number(payload.exp)).toISOString().slice(0, 10)}`,
      payload,
    };
  }

  const match = fingerprint.matches(payload.c, current);
  if (!match.ok) {
    return { ok: false, reason: match.reason, detail: match.detail, payload };
  }

  return { ok: true, reason: match.reason, detail: match.detail, payload };
}

/**
 * Seat count from an already-verified payload: how many computers may connect
 * when this PC is the host.
 *
 * 0 means unlimited, and so does a missing or unreadable value. Failing open is
 * deliberate -- every key issued before seats existed has no such field, and the
 * alternative is that installing an update stops the app working for every
 * customer already using it. The protection that actually matters, the key being
 * bound to one machine, is untouched by this.
 *
 * Only ever read from a payload that decodeLicense has verified, so the number
 * cannot be raised by editing anything on the customer's disk.
 */
function seatsFrom(payload) {
  const seats = Number(payload && payload.seats);
  if (!Number.isFinite(seats) || seats <= 0) return 0;
  return Math.floor(seats);
}

/**
 * Full startup evaluation. `state` drives which window the app opens:
 *   "licensed"    -> load the real app
 *   "unactivated" -> activation screen (fresh install; admin sets it up)
 *   "blocked"     -> "contact admin" screen (moved machine / tampered / expired)
 */
async function evaluate(dataDir) {
  const current = await fingerprint.collect();
  const storedKey = readStoredKey(dataDir);

  if (!storedKey) {
    return {
      state: "unactivated",
      reason: "no_license",
      requestCode: codec.encodeRequest(current),
      strength: fingerprint.strength(current),
    };
  }

  const result = inspect(storedKey, current);
  if (result.ok) {
    return {
      state: "licensed",
      reason: result.reason,
      detail: result.detail,
      licensedTo: result.payload.to || null,
      licenseId: result.payload.lic || null,
      expiresAt: result.payload.exp || null,
      seats: seatsFrom(result.payload),
    };
  }

  return {
    state: "blocked",
    reason: result.reason,
    detail: result.detail,
    requestCode: codec.encodeRequest(current),
    strength: fingerprint.strength(current),
  };
}

/**
 * Attempt activation with a pasted key. Only persists it if it verifies against
 * THIS machine -- so a key issued for another computer can never be stored.
 */
async function activate(dataDir, licenseKey) {
  const current = await fingerprint.collect();
  const result = inspect(String(licenseKey || "").trim(), current);

  if (!result.ok) {
    return { ok: false, reason: result.reason, message: activationMessage(result) };
  }

  try {
    writeStoredKey(dataDir, codec.normalize(licenseKey));
  } catch (err) {
    return {
      ok: false,
      reason: "write_failed",
      message: `License is valid but could not be saved: ${err.message}`,
    };
  }

  return {
    ok: true,
    reason: result.reason,
    licensedTo: result.payload.to || null,
    seats: seatsFrom(result.payload),
    message: "Activated. Starting the application...",
  };
}

function activationMessage(result) {
  switch (result.reason) {
    case "invalid_signature":
      return "This license key is not genuine. Check for a copy/paste error, or ask the administrator for a new key.";
    case "expired":
      return "This license has expired. Contact the administrator to renew it.";
    case "different_machine":
      return "This license key belongs to a different computer. Each installation needs its own key from the administrator.";
    case "unverifiable":
      return "This computer's hardware could not be identified, so the license cannot be checked. Contact the administrator.";
    default:
      return "This license key could not be validated. Contact the administrator.";
  }
}

module.exports = {
  evaluate,
  activate,
  inspect,
  clearStoredKey,
  licensePath,
  activationMessage,
  // Exported for its own tests. Failing open for keys that predate seats is the
  // kind of decision that deserves a test naming it, not a comment hoping so.
  seatsFrom,
};
