import React from "react";
import { BLANK, formatDateTime, formatPercent, formatWeight } from "../../domain/format";

/**
 * A list of scanned packets, with optional selection.
 *
 * Used both for the packets inside a lot and for the Kapan's unassigned tray -
 * they are the same rows doing the same job, and filing a stray scan is the same
 * action as correcting a wrong-lot one.
 */
const PacketTable = ({
  packets,
  selectedIds = null,
  onToggle,
  onToggleAll,
  emptyMessage = "No packets here yet.",
  showLot = false,
  lotsById = {},
}) => {
  const selectable = !!selectedIds && !!onToggle;

  if (!packets.length) {
    return <p className="packet-empty">{emptyMessage}</p>;
  }

  const allSelected = selectable && packets.every((packet) => selectedIds.has(packet.id));

  return (
    <table className="packet-table">
      <thead>
        <tr>
          {selectable && (
            <th className="select-cell">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(!allSelected)}
                aria-label={allSelected ? "Clear selection" : "Select all packets"}
              />
            </th>
          )}
          <th>No.</th>
          <th>Scanned</th>
          {showLot && <th>Lot</th>}
          <th>Code</th>
          <th className="num">Kachu (ct)</th>
          <th className="num">Polished (ct)</th>
          <th className="num">Yield %</th>
          <th>PC</th>
        </tr>
      </thead>
      <tbody>
        {packets.map((packet, index) => {
          const checked = selectable && selectedIds.has(packet.id);
          const lot = packet.lotId ? lotsById[packet.lotId] : null;

          return (
            <tr key={packet.id} className={checked ? "is-selected" : ""}>
              {selectable && (
                <td className="select-cell">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(packet.id)}
                    aria-label={`Select packet ${index + 1}`}
                  />
                </td>
              )}
              <td>{index + 1}</td>
              <td>{formatDateTime(packet.scannedAt)}</td>
              {showLot && <td>{lot ? `Lot ${lot.lotNo}` : "—"}</td>}
              <td className="code-cell" title={packet.rawCode}>
                {packet.rawCode || BLANK}
              </td>
              <td className="num">{formatWeight(packet.kachuWeight)}</td>
              <td className="num">{formatWeight(packet.polishedWeight)}</td>
              <td className="num">
                {formatPercent(
                  packet.kachuWeight > 0
                    ? (packet.polishedWeight / packet.kachuWeight) * 100
                    : 0
                )}
              </td>
              <td className="muted">{packet.scannedOn || BLANK}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default PacketTable;
