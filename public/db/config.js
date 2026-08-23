/**
 * Per-device configuration: what this PC is, and where its data lives.
 *
 * Kept out of the shared database on purpose. "I am the scan station by the
 * window" is a fact about this computer, not about the factory's Kapans, and
 * syncing it would mean every PC fighting over one field.
 *
 * Stored in userData, which survives an app update and is not inside Program
 * Files (see ADMIN-LICENSING.md §6).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const FILE = "device.json";

const ROLES = {
  /** One PC, its own data, no network. What a new install is. */
  STANDALONE: "standalone",
  /** Holds the data and serves the other PCs. */
  HOST: "host",
  /** Reads and writes the host's data over the LAN. */
  CLIENT: "client",
};

/** Office does everything; a scan station cannot edit or delete. */
const MODES = {
  OFFICE: "office",
  STATION: "station",
};

const DEFAULT_PORT = 7311;

const defaults = () => ({
  role: ROLES.STANDALONE,
  mode: MODES.OFFICE,
  // Shown on packets as "which PC scanned this", so the machine name is a much
  // better starting point than a blank box nobody fills in.
  deviceName: os.hostname() || "PC",
  deviceId: crypto.randomUUID(),
  hostAddress: "",
  hostToken: "",
  serverPort: DEFAULT_PORT,
  serverToken: "",
  // Where a copy of each daily backup goes, so the records are not all on one
  // desk in one room. A folder Windows already syncs (OneDrive, Google Drive) or
  // a network drive or USB stick. Empty means off.
  backupFolder: "",
});

const load = (dir) => {
  const file = path.join(dir, FILE);

  let stored = null;
  try {
    stored = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    stored = null;
  }

  const config = { ...defaults(), ...(stored || {}) };

  // The id is generated once and then never changes: the host counts seats by it,
  // so a new id on every launch would burn through the licence.
  if (!stored || !stored.deviceId) {
    save(dir, config);
  }

  return config;
};

const save = (dir, config) => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2), "utf8");
  fs.renameSync(temporary, file);
  return config;
};

/**
 * Applies a patch, rejecting anything that would leave the PC unable to reach its
 * own data. Returns the new config plus whether the app has to restart: the role
 * decides which adapter the renderer builds, and that happens once at startup.
 */
const update = (dir, patch = {}) => {
  const before = load(dir);
  const allowed = [
    "role",
    "mode",
    "deviceName",
    "hostAddress",
    "hostToken",
    "serverPort",
    "serverToken",
    "backupFolder",
  ];

  const after = { ...before };
  allowed.forEach((key) => {
    if (patch[key] !== undefined) after[key] = patch[key];
  });

  if (!Object.values(ROLES).includes(after.role)) {
    return { ok: false, error: `Unknown role "${after.role}".` };
  }
  if (!Object.values(MODES).includes(after.mode)) {
    return { ok: false, error: `Unknown mode "${after.mode}".` };
  }

  after.deviceName = `${after.deviceName || ""}`.trim().slice(0, 40) || before.deviceName;
  // Not checked for existence: a USB stick that is out today is still the right
  // answer for tomorrow, and refusing to remember it would be unhelpful.
  after.backupFolder = `${after.backupFolder || ""}`.trim();

  if (after.role === ROLES.CLIENT) {
    const address = normalizeAddress(after.hostAddress);
    if (!address) {
      return {
        ok: false,
        error:
          "A client needs the host PC's address, like http://192.168.1.42:7311. The host shows its own address in its Settings.",
      };
    }
    after.hostAddress = address;
  }

  const port = Number(after.serverPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { ok: false, error: "The port must be a whole number between 1024 and 65535." };
  }
  after.serverPort = port;

  save(dir, after);

  const restartRequired =
    after.role !== before.role ||
    after.hostAddress !== before.hostAddress ||
    after.serverPort !== before.serverPort ||
    after.hostToken !== before.hostToken;

  return { ok: true, config: after, restartRequired };
};

/**
 * Accepts what someone will actually type - "192.168.1.42", with or without a
 * scheme or port - and returns a usable base URL, or null.
 */
const normalizeAddress = (value) => {
  let text = `${value || ""}`.trim();
  if (!text) return null;

  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch (error) {
    return null;
  }

  if (!url.hostname) return null;
  if (!url.port) url.port = String(DEFAULT_PORT);

  return `${url.protocol}//${url.hostname}:${url.port}`;
};

module.exports = { ROLES, MODES, DEFAULT_PORT, load, save, update, normalizeAddress };
