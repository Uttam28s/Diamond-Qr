import React from "react";
import Cols from "./Cols";
import { IconClose, IconRefresh, IconScanTarget } from "../Icons";
import { formatDateTime, formatNumber } from "../utils";

const MIN_ROWS = 9;
const COLS = [8, 26, 21, 23, 18, 4];

const SessionTable = ({ records, totals, onClearSession, onRemoveRecord }) => {
  const fillerCount = records.length
    ? Math.max(0, MIN_ROWS - records.length)
    : 0;

  return (
    <section className="panel session-panel" aria-label="Scanned packets">
      <header className="panel-head">
        <h3>Scanned Packets (Current Session)</h3>
        <div className="panel-tools">
          <span className="badge">{records.length} Records</span>
          <button
            type="button"
            className="icon-button"
            title="Clear the current session"
            disabled={!records.length}
            onClick={onClearSession}
          >
            <IconRefresh size={17} />
          </button>
        </div>
      </header>

      <div className="table-scroll session-table">
        <table className="data-table">
          <Cols widths={COLS} />
          <thead>
            <tr>
              <th>No.</th>
              <th>Scan Date</th>
              <th className="num">Kachu Weight</th>
              <th className="num">Polished Weight</th>
              <th className="num">Yield %</th>
              <th aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={record.id}>
                <td>{index + 1}</td>
                <td>{formatDateTime(record.scannedAt)}</td>
                <td className="num">{formatNumber(record.kWeight)}</td>
                <td className="num">{formatNumber(record.pWeight)}</td>
                <td className="num">{record.percentage}</td>
                <td className="action-cell">
                  <button
                    type="button"
                    className="row-remove"
                    title="Remove this scan"
                    onClick={() => onRemoveRecord(record.id)}
                  >
                    <IconClose size={13} />
                  </button>
                </td>
              </tr>
            ))}

            {!records.length && (
              <tr className="empty-row">
                <td colSpan={6}>
                  <div className="empty-state">
                    <IconScanTarget size={26} />
                    <strong>No packets scanned yet</strong>
                    <span>
                      Scan a barcode, or type a code ending in the kachu and
                      polished weight — <code>0.011,0.024,0.034,0.12,0.024,0.022</code>{" "}
                      — and press Enter.
                    </span>
                  </div>
                </td>
              </tr>
            )}

            {Array.from({ length: fillerCount }).map((unused, index) => (
              <tr className="filler-row" key={`filler-${index}`}>
                <td colSpan={6}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
          {!!records.length && (
            <tfoot>
              <tr>
                <th colSpan={2}>Total</th>
                <th className="num">{formatNumber(totals.kWeight)}</th>
                <th className="num">{formatNumber(totals.pWeight)}</th>
                <th className="num">{totals.percentage}</th>
                <th />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};

export default SessionTable;
