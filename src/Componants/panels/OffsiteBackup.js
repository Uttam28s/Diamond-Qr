import React, { useCallback, useEffect, useState } from "react";
import { IconAlert, IconCheck, IconDownload } from "../Icons";
import { formatDateTime } from "../../domain/format";
import { ROLE } from "../../store/StoreContext";

/**
 * A copy of the daily backup somewhere that is not this computer.
 *
 * Everything else in the app protects the data from software. This is the only
 * thing that protects it from the hardware, and until now every copy of a
 * factory's production record lived on one disk in one room.
 *
 * Deliberately a folder and not an account. The owner points it at whatever
 * Windows is already syncing - OneDrive, Google Drive - or a network drive or a
 * USB stick, and it costs nothing and needs no password anybody has to remember.
 * The alternative on the table was moving the database to a free cloud tier,
 * which would have added an account, a dependency, a way to be offline on a
 * factory floor, and an eventual bill, to solve a problem this solves for free.
 *
 * What it reports is read from the folder, never from what it last tried to do.
 * A backup screen that says "backed up" because it once intended to is worse
 * than no backup screen at all.
 */
const OffsiteBackup = ({ role, notify }) => {
  const bridge = typeof window !== "undefined" ? window.diamondQR : null;

  const [folder, setFolder] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // A bridge without these channels is an app window running against an older
  // preload - which happens for real mid-upgrade. Better to show nothing here
  // than to throw and take the whole Settings screen down with it.
  const wired =
    !!bridge &&
    !!bridge.data &&
    typeof bridge.data.offsite === "function" &&
    typeof bridge.data.chooseBackupFolder === "function";

  const refresh = useCallback(async () => {
    if (!wired) return;
    const config = await bridge.getConfig();
    setFolder(config.backupFolder || "");
    setStatus(await bridge.data.offsite());
  }, [bridge, wired]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!wired) return null;

  // A client keeps no database of its own, so there is nothing here to copy. The
  // host is the machine that needs this.
  if (role === ROLE.CLIENT) {
    return (
      <div className="settings-row">
        <div>
          <strong>Off-site copy</strong>
          <p>
            Set this up on the host PC instead — that is the computer holding the
            data. Backing up a client copies nothing.
          </p>
        </div>
      </div>
    );
  }

  const copyNow = async (announce = true) => {
    setBusy(true);
    const result = await bridge.data.backup();
    setBusy(false);
    await refresh();

    if (!result.ok) {
      notify(result.error, "error");
      return;
    }
    if (result.offsite && result.offsite.configured && !result.offsite.ok) {
      notify(result.offsite.error, "error");
      return;
    }
    if (announce) notify("Backup copied off this PC.");
  };

  const choose = async () => {
    const picked = await bridge.data.chooseBackupFolder();
    if (!picked.folder) return;

    const saved = await bridge.setConfig({ backupFolder: picked.folder });
    if (!saved.ok) {
      notify(saved.error, "error");
      return;
    }

    setFolder(picked.folder);
    // Copied straight away rather than at the next launch, so the owner sees it
    // work now instead of trusting that it will.
    await copyNow(false);
    notify("Off-site backup is on. A copy goes there every time the app opens.");
  };

  const turnOff = async () => {
    const saved = await bridge.setConfig({ backupFolder: "" });
    if (!saved.ok) {
      notify(saved.error, "error");
      return;
    }
    await refresh();
    notify("Off-site copies turned off. Nothing already copied was deleted.");
  };

  /* ------------------------------------------------------------------ view */

  const describe = () => {
    if (!status || !status.configured) {
      return (
        <p>
          Every backup also goes to a folder of your choosing — a OneDrive or
          Google Drive folder, a network drive, or a USB stick. Free, and the only
          thing that survives this PC being lost or stolen.
        </p>
      );
    }

    if (!status.available) {
      return (
        <p className="field-hint warn">
          <IconAlert size={14} /> {folder} cannot be reached right now. If it is a
          USB stick or a network drive, it may not be connected. Nothing has been
          lost — the copy is retried every time the app opens.
        </p>
      );
    }

    if (!status.count) {
      return (
        <p className="field-hint">
          {status.folder} — set up, but nothing copied there yet. Use “Copy now”.
        </p>
      );
    }

    return (
      <p className="field-hint">
        <IconCheck size={14} /> {status.folder} — {status.count} cop
        {status.count === 1 ? "y" : "ies"}, newest {formatDateTime(status.newestAt)} (
        {(status.bytes / 1048576).toFixed(1)} MB).
      </p>
    );
  };

  return (
    <div className="settings-row">
      <div>
        <strong>Off-site copy</strong>
        {describe()}
      </div>

      {status && status.configured ? (
        <>
          <button
            type="button"
            className="button ghost small"
            disabled={busy}
            onClick={() => copyNow()}
          >
            <IconDownload size={15} />
            Copy now
          </button>
          <button type="button" className="button ghost small" disabled={busy} onClick={choose}>
            Change folder…
          </button>
          <button type="button" className="button ghost small" disabled={busy} onClick={turnOff}>
            Turn off
          </button>
        </>
      ) : (
        <button type="button" className="button ghost small" disabled={busy} onClick={choose}>
          Choose folder…
        </button>
      )}
    </div>
  );
};

export default OffsiteBackup;
