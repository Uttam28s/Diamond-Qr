import React, { useRef } from "react";
import Cols from "./Cols";
import DeviceSettings from "./DeviceSettings";
import { IconAlert, IconDownload, IconSettings, IconTrash } from "../Icons";
import { useStore } from "../../store/StoreContext";
import { formatDay, formatInt, formatWeight } from "../../domain/format";
import { getDateKey } from "../utils";

/**
 * Preferences and data management.
 *
 * Backup and Restore are here rather than waiting for the storage phase: one
 * device holding the only copy of a season's work needs a way out, and the
 * export is a plain JSON file the owner can keep anywhere.
 */
const SettingsScreen = ({
  settings,
  onSettingsChange,
  rows,
  sessionCount,
  onClearSession,
  onDeleteKapan,
  appVersion,
  role,
  connection,
  queuedCount,
  readOnly,
  notify,
}) => {
  const { exportBackup, importBackup, deviceName, config } = useStore();
  const fileRef = useRef(null);

  const packetCount = rows.reduce((sum, row) => sum + row.totals.packetCount, 0);
  const lotCount = rows.reduce((sum, row) => sum + row.totals.lotCount, 0);

  const downloadBackup = () => {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `diamond-qr-backup-${getDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const restoreBackup = (event) => {
    const file = event.target.files && event.target.files[0];
    // Clearing the input lets the same file be chosen twice in a row, which
    // otherwise silently does nothing the second time.
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => importBackup(`${reader.result}`);
    reader.readAsText(file);
  };

  return (
    <div className="settings-grid">
      <DeviceSettings
        role={role}
        config={config}
        connection={connection}
        queuedCount={queuedCount}
        notify={notify}
      />

      <section className="panel" aria-label="Preferences">
        <header className="panel-head">
          <h3>Preferences</h3>
        </header>

        <div className="settings-body">
          <label className="field-label" htmlFor="office-name">
            Office / Location Name
          </label>
          <input
            id="office-name"
            className="text-input"
            value={settings.officeName}
            placeholder="Factory Office"
            onChange={(event) =>
              onSettingsChange({ ...settings, officeName: event.target.value })
            }
          />
          <p className="field-hint">Shown in the header of every screen.</p>

          <div className="settings-about">
            <IconSettings size={18} />
            <div>
              <strong>Diamond QR v{appVersion}</strong>
              <p>
                Fully offline. Kapans, lots, packets and preferences are stored on
                this device only — nothing is sent over the network.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="panel" aria-label="Data management">
        <header className="panel-head">
          <h3>Data Management</h3>
          <div className="panel-tools">
            <span className="badge">{rows.length} Kapans</span>
            <span className="badge">{lotCount} lots</span>
          </div>
        </header>

        <div className="settings-body">
          <div className="settings-row">
            <div>
              <strong>Backup</strong>
              <p>
                Saves every Kapan, lot and packet to a JSON file
                {deviceName ? ` from ${deviceName}` : ""}. Keep one off this PC.
              </p>
            </div>
            <button type="button" className="button ghost small" onClick={downloadBackup}>
              <IconDownload size={15} />
              Export backup
            </button>
          </div>

          <div className="settings-row">
            <div>
              <strong>Restore</strong>
              <p>
                Replaces everything on this device with the contents of a backup
                file. Undo works straight afterwards if it was the wrong file.
              </p>
            </div>
            <button
              type="button"
              className="button ghost small"
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              Choose file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={restoreBackup}
              hidden
            />
          </div>

          <div className="settings-row">
            <div>
              <strong>Current scan session</strong>
              <p>{sessionCount} unsaved scan(s) in the session table.</p>
            </div>
            <button
              type="button"
              className="button ghost small"
              disabled={!sessionCount}
              onClick={onClearSession}
            >
              <IconTrash size={15} />
              Clear session
            </button>
          </div>

          <div className="table-scroll settings-table">
            <table className="data-table">
              <Cols widths={[24, 12, 14, 20, 20, 10]} />
              <thead>
                <tr>
                  <th>Kapan</th>
                  <th className="num">Lots</th>
                  <th className="num">Packets</th>
                  <th className="num">Rough (ct)</th>
                  <th>Created</th>
                  <th aria-label="Delete" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ kapan, totals }) => (
                  <tr key={kapan.id}>
                    <td className="kapan-cell">{kapan.number}</td>
                    <td className="num">{totals.lotCount}</td>
                    <td className="num">{formatInt(totals.packetCount)}</td>
                    <td className="num">{formatWeight(totals.roughWeight)}</td>
                    <td>{formatDay(kapan.createdAt)}</td>
                    <td className="action-cell">
                      <button
                        type="button"
                        disabled={readOnly}
                        className="row-remove always"
                        title={`Delete Kapan ${kapan.number}`}
                        onClick={() => onDeleteKapan(kapan.id)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr className="empty-row">
                    <td colSpan={6}>
                      <div className="empty-state">
                        <strong>No stored Kapans</strong>
                        <span>Kapans can be deleted from here or from the workbench.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="danger-zone">
            <div>
              <strong>
                <IconAlert size={15} />
                This device holds {formatInt(packetCount)} packet(s)
              </strong>
              <p>
                Deleting a Kapan asks for its number first and can be undone
                straight afterwards. Export a backup before any large clear-out.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SettingsScreen;
