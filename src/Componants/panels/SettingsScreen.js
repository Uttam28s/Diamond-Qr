import React from "react";
import Cols from "./Cols";
import { IconAlert, IconSettings, IconTrash } from "../Icons";
import { formatDateTimeShort, formatNumber } from "../utils";

const SettingsScreen = ({
  settings,
  onSettingsChange,
  kapanRows,
  sessionCount,
  onClearSession,
  onDeleteKapan,
  onDeleteAll,
  appVersion,
}) => (
  <div className="settings-grid">
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

        <label className="field-label" htmlFor="rows-per-page">
          Kapans per page
        </label>
        <label className="select-wrap block">
          <select
            id="rows-per-page"
            value={settings.rowsPerPage}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                rowsPerPage: Number(event.target.value),
              })
            }
          >
            {[5, 8, 10, 15, 25].map((size) => (
              <option value={size} key={size}>
                {size} rows
              </option>
            ))}
          </select>
        </label>

        <div className="settings-about">
          <IconSettings size={18} />
          <div>
            <strong>Diamond QR v{appVersion}</strong>
            <p>
              Fully offline. Scans, Kapans and preferences are stored on this
              device only — nothing is sent over the network.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section className="panel" aria-label="Data management">
      <header className="panel-head">
        <h3>Data Management</h3>
        <div className="panel-tools">
          <span className="badge">{kapanRows.length} Kapans</span>
        </div>
      </header>

      <div className="settings-body">
        <div className="settings-row">
          <div>
            <strong>Current scan session</strong>
            <p>{sessionCount} unsaved record(s) in the session table.</p>
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
            <Cols widths={[38, 16, 36, 10]} />
            <thead>
              <tr>
                <th>Kapan Number</th>
                <th className="num">Records</th>
                <th>Last Scan</th>
                <th aria-label="Delete" />
              </tr>
            </thead>
            <tbody>
              {kapanRows.map((kapan) => (
                <tr key={kapan.kapanNumber}>
                  <td className="kapan-cell">{kapan.kapanNumber}</td>
                  <td className="num">{kapan.recordCount}</td>
                  <td>{formatDateTimeShort(kapan.lastScanAt)}</td>
                  <td className="action-cell">
                    <button
                      type="button"
                      className="row-remove always"
                      title={`Delete ${kapan.kapanNumber}`}
                      onClick={() => onDeleteKapan(kapan.kapanNumber)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!kapanRows.length && (
                <tr className="empty-row">
                  <td colSpan={4}>
                    <div className="empty-state">
                      <strong>No stored Kapans</strong>
                      <span>Saved Kapans can be deleted from here.</span>
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
              Delete everything
            </strong>
            <p>
              Removes all {kapanRows.length} Kapan(s),{" "}
              {formatNumber(
                kapanRows.reduce((sum, kapan) => sum + kapan.recordCount, 0),
                0
              )}{" "}
              packet records and the current session. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            className="button danger small"
            disabled={!kapanRows.length && !sessionCount}
            onClick={onDeleteAll}
          >
            <IconTrash size={15} />
            Delete all data
          </button>
        </div>
      </div>
    </section>
  </div>
);

export default SettingsScreen;
