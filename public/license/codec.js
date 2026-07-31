/**
 * Encoding for request codes and license keys. Shared by the app (verify side) and
 * tools/issue-license.js (sign side) so the two can never disagree on the format.
 *
 *   request code : DQR-R1.<base64url payload>.<checksum>
 *   license key  : DQR-L1.<base64url payload>.<base64url ed25519 signature>
 *
 * The signature covers the base64url payload STRING, not a re-serialized object.
 * Signing bytes we can reproduce exactly removes any chance of a JSON key-order or
 * whitespace difference making a valid license fail to verify.
 */
const crypto = require("crypto");

const APP_ID = "diamond-qr";
const REQUEST_PREFIX = "DQR-R1";
const LICENSE_PREFIX = "DQR-L1";

function b64u(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function unb64u(text) {
  return Buffer.from(String(text).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Paste-tolerant: strip whitespace plus the zero-width characters and BOM that
 * chat apps and email clients silently inject into copied codes.
 */
function normalize(text) {
  return String(text || "").replace(/[\s\u200b-\u200d\ufeff]+/g, "");
}

function checksum(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 6);
}

function encodeRequest(components) {
  const payload = b64u(JSON.stringify({ v: 1, app: APP_ID, c: components }));
  return `${REQUEST_PREFIX}.${payload}.${checksum(payload)}`;
}

function decodeRequest(text) {
  const parts = normalize(text).split(".");
  if (parts.length !== 3 || parts[0] !== REQUEST_PREFIX) {
    throw new Error("Not a valid request code.");
  }
  const [, payload, sum] = parts;
  if (checksum(payload) !== sum) {
    throw new Error("Request code is incomplete or corrupted (checksum failed).");
  }
  let decoded;
  try {
    decoded = JSON.parse(unb64u(payload).toString("utf8"));
  } catch (err) {
    throw new Error("Request code payload is not readable.");
  }
  if (decoded.app !== APP_ID) throw new Error(`Request code is for a different app (${decoded.app}).`);
  if (!decoded.c || typeof decoded.c !== "object") throw new Error("Request code has no fingerprint.");
  return decoded;
}

/** payload: { v, app, lic, to, iat, exp, c }  -- signed with the admin private key. */
function encodeLicense(payload, privateKey) {
  const encoded = b64u(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(encoded, "utf8"), privateKey);
  return `${LICENSE_PREFIX}.${encoded}.${b64u(signature)}`;
}

/**
 * Verify signature first, parse second. Never trust payload contents from an
 * unverified key -- that ordering is the whole point of signing it.
 */
function decodeLicense(text, publicKey) {
  const parts = normalize(text).split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    throw new Error("Not a valid license key.");
  }
  const [, encoded, signature] = parts;

  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(encoded, "utf8"), publicKey, unb64u(signature));
  } catch (err) {
    valid = false;
  }
  if (!valid) throw new Error("License signature is invalid.");

  let payload;
  try {
    payload = JSON.parse(unb64u(encoded).toString("utf8"));
  } catch (err) {
    throw new Error("License payload is not readable.");
  }
  if (payload.app !== APP_ID) throw new Error("License is for a different app.");
  return payload;
}

/** Break a long code into readable groups for on-screen display. */
function formatForDisplay(code, groupsPerLine = 4, groupSize = 12) {
  const groups = String(code).match(new RegExp(`.{1,${groupSize}}`, "g")) || [];
  const lines = [];
  for (let i = 0; i < groups.length; i += groupsPerLine) {
    lines.push(groups.slice(i, i + groupsPerLine).join(" "));
  }
  return lines.join("\n");
}

module.exports = {
  APP_ID,
  encodeRequest,
  decodeRequest,
  encodeLicense,
  decodeLicense,
  formatForDisplay,
  normalize,
};
