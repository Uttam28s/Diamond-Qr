/**
 * Hardware fingerprinting for machine-locked licensing. Main process only.
 *
 * A fingerprint is a set of independently hashed components rather than one hash,
 * so verification can tolerate a hardware upgrade without letting a copy of the
 * app run on a different computer.
 *
 *   anchor  "mid"  - Windows MachineGuid (registry). Unique per Windows install.
 *   soft    "uuid" - SMBIOS system UUID   (per motherboard)
 *           "board"- baseboard serial     (per motherboard)
 *           "cpu"  - CPU ProcessorId      (per CPU)
 *           "cpuModel" - CPU model+core count (weak, but free and always available)
 *
 * Why both kinds: cloning the system disk onto another PC carries MachineGuid over,
 * so the anchor alone would not catch it. The soft components are read from the
 * hardware itself, so a clone lands on a machine where all of them differ.
 */
const crypto = require("crypto");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { machineIdSync } = require("node-machine-id");

const execFileAsync = promisify(execFile);

const SALT = "diamond-qr/fingerprint/v1";

/**
 * BIOS vendors ship placeholder serials on a huge number of consumer boards. If we
 * hashed these we would mint the SAME fingerprint for thousands of machines, and a
 * license issued to one would activate on all of them. Treat them as "unreadable".
 */
const PLACEHOLDERS = new Set([
  "",
  "0",
  "none",
  "null",
  "n/a",
  "na",
  "nil",
  "invalid",
  "default string",
  "not applicable",
  "not available",
  "not specified",
  "to be filled by o.e.m.",
  "to be filled by o.e.m",
  "filled by oem",
  "system serial number",
  "base board serial number",
  "chassis serial number",
  "unknown",
  "oem",
  "00000000",
  "0123456789",
  "123456789",
  "ffffffff-ffff-ffff-ffff-ffffffff",
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
]);

function hashComponent(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  if (PLACEHOLDERS.has(normalized)) return null;
  // A serial made only of repeated zeros/Fs is another placeholder shape.
  if (/^[0f\-]+$/.test(normalized)) return null;
  if (normalized.length < 4) return null;
  return crypto
    .createHash("sha256")
    .update(`${SALT}|${normalized}`)
    .digest("hex")
    .slice(0, 16);
}

const EMPTY_HARDWARE = { uuid: null, board: null, cpu: null };

let hardwarePromise = null;

/**
 * One PowerShell round-trip for all three CIM values. Costs ~1-2.5s (mostly
 * PowerShell startup), so it runs off the startup path and the promise is cached
 * for the life of the process.
 */
function readWindowsHardware() {
  if (hardwarePromise) return hardwarePromise;

  if (process.platform !== "win32") {
    hardwarePromise = Promise.resolve(EMPTY_HARDWARE);
    return hardwarePromise;
  }

  const script = [
    "$ErrorActionPreference='SilentlyContinue';",
    "$p=Get-CimInstance -ClassName Win32_ComputerSystemProduct;",
    "$b=Get-CimInstance -ClassName Win32_BaseBoard;",
    "$c=Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1;",
    "Write-Output ('{0}~~{1}~~{2}' -f $p.UUID,$b.SerialNumber,$c.ProcessorId)",
  ].join(" ");

  hardwarePromise = execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: 10000, windowsHide: true, encoding: "utf8" }
  )
    .then(({ stdout }) => {
      const [uuid, board, cpu] = String(stdout).trim().split("~~");
      return { uuid: uuid || null, board: board || null, cpu: cpu || null };
    })
    .catch(() => EMPTY_HARDWARE); // WMI disabled, PowerShell locked down, or timeout

  return hardwarePromise;
}

function readMachineGuid() {
  try {
    return machineIdSync({ original: true });
  } catch (err) {
    return null;
  }
}

/** Collect the current machine's fingerprint. Null components are omitted. */
async function collect() {
  const hw = await readWindowsHardware();
  const cpus = os.cpus() || [];
  const cpuModel = cpus.length ? `${cpus[0].model}x${cpus.length}` : null;

  const raw = {
    mid: readMachineGuid(),
    uuid: hw.uuid,
    board: hw.board,
    cpu: hw.cpu,
    cpuModel,
  };

  const components = {};
  for (const [key, value] of Object.entries(raw)) {
    const hashed = hashComponent(value);
    if (hashed) components[key] = hashed;
  }
  return components;
}

const ANCHOR = "mid";
const SOFT_KEYS = ["uuid", "board", "cpu", "cpuModel"];

/**
 * Decide whether a licensed fingerprint still describes this machine.
 * Returns { ok, reason, detail } -- reason is machine-readable, detail is for logs.
 */
function matches(licensed, current) {
  if (!licensed || typeof licensed !== "object") {
    return { ok: false, reason: "no_fingerprint", detail: "license carries no fingerprint" };
  }

  const anchorLicensed = licensed[ANCHOR];
  const anchorCurrent = current[ANCHOR];
  const anchorComparable = Boolean(anchorLicensed && anchorCurrent);

  // A different Windows install is a different machine, full stop.
  if (anchorComparable && anchorLicensed !== anchorCurrent) {
    return { ok: false, reason: "different_machine", detail: "MachineGuid mismatch" };
  }

  let comparable = 0;
  let mismatches = 0;
  const changed = [];
  for (const key of SOFT_KEYS) {
    if (!licensed[key] || !current[key]) continue;
    comparable += 1;
    if (licensed[key] !== current[key]) {
      mismatches += 1;
      changed.push(key);
    }
  }

  if (comparable === 0) {
    // No hardware signal available now. Accept only on a solid anchor match.
    return anchorComparable
      ? { ok: true, reason: "anchor_only", detail: "hardware unreadable; anchor matched" }
      : {
          ok: false,
          reason: "unverifiable",
          detail: "no comparable components (WMI + registry both unreadable)",
        };
  }

  // Tolerate a single component change (CPU/board swap) only when we have enough
  // other signal to be confident it is still the same computer.
  const allowedMismatches = comparable >= 3 ? 1 : 0;
  if (mismatches > allowedMismatches) {
    return {
      ok: false,
      reason: "different_machine",
      detail: `${mismatches}/${comparable} components changed (${changed.join(", ")})`,
    };
  }

  return {
    ok: true,
    reason: mismatches ? "hardware_changed" : "match",
    detail: mismatches ? `tolerated change in ${changed.join(", ")}` : "all components matched",
  };
}

/** How much signal we actually have -- surfaced to the admin during activation. */
function strength(components) {
  const soft = SOFT_KEYS.filter((k) => components[k] && k !== "cpuModel").length;
  if (components[ANCHOR] && soft >= 2) return "strong";
  if (components[ANCHOR] && soft >= 1) return "good";
  if (components[ANCHOR]) return "weak";
  return "very weak";
}

module.exports = { collect, matches, strength, ANCHOR, SOFT_KEYS };
