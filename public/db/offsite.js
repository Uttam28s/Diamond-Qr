/**
 * Copies the daily backup somewhere that is not this computer.
 *
 * The failure this exists for is not a bug: it is the PC dying, being stolen, or
 * the building flooding. Everything else in this app protects the data from
 * software; nothing protected it from the hardware, and a factory's entire
 * production record living on one desk in one room is the largest risk left.
 *
 * The mechanism is deliberately dull. No account, no API, no cost: the owner
 * points this at a folder Windows is already syncing - OneDrive, Google Drive, a
 * mapped network drive, a USB stick - and the app drops a copy in after every
 * backup. Whatever that folder does next is somebody else's already-working
 * problem, which is the entire appeal. A cloud database would have been a new
 * dependency, a new account, a new bill and a new way to be offline.
 *
 * Two rules about the chosen folder, because it belongs to the user and not to
 * us:
 *
 *   1. Everything goes in our own subfolder, per device. We never write beside
 *      whatever else they keep in there.
 *   2. Pruning only ever deletes files inside that subfolder whose names match
 *      the ones we write. A folder the user picked is not ours to tidy.
 */

const fs = require("fs");
const path = require("path");

const FOLDER_NAME = "Diamond QR Backups";
/** One a day, so a month of history for about 150 MB of a free 5 GB. */
const KEEP = 30;
/** Exactly what `fileStore.backup()` names its files. */
const BACKUP_PATTERN = /^diamond-qr-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * A device name that is safe as a folder name. Two PCs backing up into the same
 * Drive account must not overwrite each other - a host and a standalone hold
 * genuinely different data under the same file name.
 */
const folderForDevice = (folder, deviceName) => {
  const safe = `${deviceName || ""}`
    // What Windows forbids in a folder name. A hyphen and an inner space are
    // both fine, and "Office PC" is a better folder to find than "OfficePC".
    //
    // The separators are not cosmetic: the device name is typed by the user in
    // Settings, and a name like `ST\..\somewhere` would otherwise resolve clean
    // out of our subfolder - into a directory where prune() deletes files.
    .replace(/[<>:"/\\|?*]/g, "")
    // Nor may it be a relative step in its own right.
    .replace(/^\.+$/, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, "")
    // Windows silently drops a trailing dot or space, so a name ending in one
    // would be written to a folder we could not find again by that name.
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 40);

  return path.join(folder, FOLDER_NAME, safe || "This PC");
};

/**
 * Deletes all but the newest `keep` backups. Scoped to our own subfolder and to
 * our own file names; anything else in there is left alone.
 */
const prune = (dir, keep) => {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (error) {
    return 0;
  }

  // The names are ISO dates, so sorting them as text sorts them by date.
  const ours = names.filter((name) => BACKUP_PATTERN.test(name)).sort();
  const doomed = ours.slice(0, Math.max(0, ours.length - keep));

  let removed = 0;
  doomed.forEach((name) => {
    try {
      fs.unlinkSync(path.join(dir, name));
      removed += 1;
    } catch (error) {
      // A copy we cannot delete is not worth failing a backup over.
    }
  });

  return removed;
};

/**
 * Copies one backup file into the off-site folder.
 *
 * Never throws: this runs on the launch path, and a USB stick that is not
 * plugged in must not be able to stop the factory opening the app.
 *
 * @param file        the backup fileStore.backup() just wrote
 * @param folder      what the owner chose in Settings
 * @param deviceName  which PC this is, for the per-device subfolder
 */
const mirrorBackup = ({ file, folder, deviceName = "", keep = KEEP }) => {
  if (!folder) return { ok: false, configured: false, error: "No off-site folder is set." };

  try {
    if (!fs.existsSync(folder)) {
      // The realistic cases: the USB stick is out, or OneDrive has not mounted
      // yet. Both are worth saying plainly rather than as an error code.
      return {
        ok: false,
        configured: true,
        error: `${folder} is not available right now. If it is a USB stick or a network drive, it may not be connected.`,
      };
    }

    const target = folderForDevice(folder, deviceName);
    fs.mkdirSync(target, { recursive: true });

    const destination = path.join(target, path.basename(file));
    // Written aside and renamed, because a sync client watching the folder will
    // happily start uploading a half-copied file.
    const temporary = `${destination}.part`;
    fs.copyFileSync(file, temporary);
    fs.renameSync(temporary, destination);

    const removed = prune(target, keep);

    return { ok: true, configured: true, path: destination, removed };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
};

/**
 * What is actually in the off-site folder, read from the folder itself rather
 * than remembered from the last attempt. "It says it backed up" and "there is a
 * backup there" have to be the same sentence, or this is worse than nothing.
 */
const mirrorStatus = ({ folder, deviceName = "" }) => {
  if (!folder) return { configured: false, folder: "", available: false, count: 0 };

  const target = folderForDevice(folder, deviceName);

  try {
    if (!fs.existsSync(folder)) {
      return { configured: true, folder: target, available: false, count: 0 };
    }

    // The folder is reachable but nothing has been copied there yet - which is
    // the state right after choosing one, and must not be reported as a drive
    // that cannot be reached.
    if (!fs.existsSync(target)) {
      return { configured: true, folder: target, available: true, count: 0 };
    }

    const names = fs
      .readdirSync(target)
      .filter((name) => BACKUP_PATTERN.test(name))
      .sort();

    const newest = names.length ? names[names.length - 1] : "";
    const bytes = newest ? fs.statSync(path.join(target, newest)).size : 0;

    return {
      configured: true,
      folder: target,
      available: true,
      count: names.length,
      newest,
      newestAt: newest ? fs.statSync(path.join(target, newest)).mtime.toISOString() : "",
      bytes,
    };
  } catch (error) {
    // The folder is there but unreadable - a disconnected network share behaves
    // exactly like this.
    return { configured: true, folder: target, available: false, count: 0, error: error.message };
  }
};

module.exports = { mirrorBackup, mirrorStatus, folderForDevice, FOLDER_NAME, KEEP };
