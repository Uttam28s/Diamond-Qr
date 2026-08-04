/**
 * Carries an existing installation across a rename.
 *
 * Electron derives the userData folder from the app's product name, so renaming
 * the product silently points the app at a brand new empty folder. That loses
 * three things at once, in descending order of how loudly the customer complains:
 *
 *   license.dat   the activation. The app would ask them to activate again, and
 *                 the seat count is tied to the device id below, so they cannot.
 *   data/         every Kapan, lot and packet ever entered.
 *   device.json   the device id and the host/client settings. A new id burns a
 *                 seat and a host forgets it was a host.
 *
 * So on first launch under the new name, look for the old folder and copy it
 * across. Copy, not move: if anything here is wrong, the original is still sitting
 * there untouched and a support call is a five-minute fix rather than a disaster.
 *
 * Only the app's own files are copied. Chromium's caches are large, worthless and
 * occasionally version-specific.
 */

const fs = require("fs");
const path = require("path");

/** Written once the copy succeeds, so this never runs twice. */
const MARKER = "migrated-from.txt";

/**
 * Every folder name this app has used, likeliest first. Electron takes the folder
 * name from `productName` if package.json has one and from `name` otherwise - and
 * electron-builder strips its own `build.productName` out of the packaged
 * package.json, so up to version 2.1.0 the name that won was plain `name`.
 *
 * Confirmed on a real 2.1.0 install: %APPDATA%\qr-code-raj. The others are here
 * because the installer's product name was `Raj-QR-CODE-SCANNER` and a future
 * Electron could reasonably prefer it. Checking a folder that does not exist costs
 * nothing; missing one costs the customer their licence.
 *
 * Add to this list, never edit it.
 */
const LEGACY_FOLDER_NAMES = ["qr-code-raj", "Raj-QR-CODE-SCANNER", "Raj QR CODE SCANNER"];

/** Only these. Everything else in there belongs to Chromium. */
const OWNED = ["license.dat", "device.json", "data"];

/** Does this folder hold an actual installation, rather than just existing? */
const looksInhabited = (dir) => {
  try {
    return (
      fs.existsSync(path.join(dir, "license.dat")) ||
      fs.existsSync(path.join(dir, "device.json")) ||
      fs.existsSync(path.join(dir, "data", "snapshot.json"))
    );
  } catch (error) {
    return false;
  }
};

/** Recursive copy. Written out rather than using fs.cpSync, which is still
 *  flagged experimental on the Node version Electron 18 carries. */
const copyInto = (from, to) => {
  const stat = fs.statSync(from);

  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyInto(path.join(from, entry), path.join(to, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

/**
 * @param userData  app.getPath("userData") - where the app looks now
 * @param appData   app.getPath("appData")  - the folder both names live under
 * @returns {{migrated: boolean, from?: string, copied?: string[], reason?: string, error?: string}}
 */
const migrateUserData = ({ userData, appData }) => {
  if (!userData || !appData) return { migrated: false, reason: "no paths" };

  if (fs.existsSync(path.join(userData, MARKER))) {
    return { migrated: false, reason: "already migrated" };
  }

  // Never overwrite a live installation. If this folder already has data, this is
  // not a fresh install under a new name - it is just a normal launch.
  if (looksInhabited(userData)) return { migrated: false, reason: "already in use" };

  for (const name of LEGACY_FOLDER_NAMES) {
    const legacy = path.join(appData, name);

    if (path.resolve(legacy) === path.resolve(userData)) continue;
    if (!looksInhabited(legacy)) continue;

    const copied = [];
    try {
      for (const entry of OWNED) {
        const from = path.join(legacy, entry);
        if (!fs.existsSync(from)) continue;
        copyInto(from, path.join(userData, entry));
        copied.push(entry);
      }

      fs.writeFileSync(
        path.join(userData, MARKER),
        `Copied from ${legacy}\r\n` +
          `Entries: ${copied.join(", ")}\r\n` +
          "The original folder was left in place and can be deleted once this " +
          "installation has been checked.\r\n",
        "utf8"
      );

      return { migrated: true, from: legacy, copied };
    } catch (error) {
      // Do not write the marker: a half-finished copy must be retried, not
      // remembered as done. Reporting beats throwing - the app should still open.
      return { migrated: false, from: legacy, error: error.message };
    }
  }

  return { migrated: false, reason: "nothing to migrate" };
};

module.exports = { migrateUserData, LEGACY_FOLDER_NAMES, MARKER, OWNED };
