import React, { useState } from "react";
import KapanHeaderStats from "./KapanHeaderStats";
import JamaProgress from "./JamaProgress";
import LotSheet from "./LotSheet";
import UnassignedTray from "./UnassignedTray";
import { IconArrowLeft, IconEdit, IconLayers, IconScan, IconTrash } from "../Icons";
import { STATUS_LABELS, formatDay } from "../../domain/format";
import { renumberKapanLots } from "../../domain/operations";

/**
 * One Kapan, full width: its header figures, then the sheet.
 *
 * The Kapan list lives on its own screen rather than in a rail beside this one -
 * thirteen columns need every pixel, and switching Kapans is a dropdown here
 * instead of a permanent 240px of chrome.
 */
const KapanWorkbench = ({
  view,
  allKapans,
  run,
  onNotify,
  onConfirm,
  onBack,
  onSwitch,
  onEdit,
  onDelete,
  onScanInto,
  onScanLot,
  activeLotId,
  onUndo,
  readOnly,
}) => {
  const [expandedLotId, setExpandedLotId] = useState(null);
  const { kapan, totals, rows, lots, unassigned } = view;

  const toggleLot = (lotId) =>
    setExpandedLotId((current) => (current === lotId ? null : lotId));

  return (
    <section className="panel workbench" aria-label={`Kapan ${kapan.number}`}>
      <header className="workbench-head">
        <button type="button" className="button ghost small" onClick={onBack}>
          <IconArrowLeft size={15} />
          All Kapans
        </button>

        <label className="select-wrap workbench-switch">
          <select
            value={kapan.id}
            onChange={(event) => onSwitch(event.target.value)}
            aria-label="Switch Kapan"
          >
            {allKapans.map((row) => (
              <option key={row.kapan.id} value={row.kapan.id}>
                Kapan {row.kapan.number}
                {row.kapan.season ? ` · ${row.kapan.season}` : ""}
              </option>
            ))}
          </select>
        </label>

        <span className="workbench-meta">
          {kapan.season && <span className="badge">{kapan.season}</span>}
          <span className={`st st-${totals.status}`}>
            {totals.status === "returns-due"
              ? `${totals.lotsAwaitingReturns} returns due`
              : STATUS_LABELS[totals.status]}
          </span>
          <span className="muted">created {formatDay(kapan.createdAt)}</span>
          {kapan.targetAt && (
            <span className="muted">· target {formatDay(kapan.targetAt)}</span>
          )}
        </span>

        <span className="workbench-spacer" />

        {!readOnly && (
          <>
            <button
              type="button"
              className="button ghost small"
              onClick={() => onEdit(kapan)}
            >
              <IconEdit size={15} />
              Edit
            </button>
            <button
              type="button"
              className="button ghost small"
              title="Close the gaps in the lot numbering"
              onClick={() => run((state) => renumberKapanLots(state, kapan.id))}
            >
              <IconLayers size={15} />
              Renumber
            </button>
            <button
              type="button"
              className="button ghost small danger-text"
              onClick={() => onDelete(kapan)}
            >
              <IconTrash size={15} />
              Delete
            </button>
            <button
              type="button"
              className="button primary small"
              onClick={() => onScanInto(kapan)}
            >
              <IconScan size={15} />
              Scan into lot
            </button>
          </>
        )}
      </header>

      <KapanHeaderStats totals={totals} />

      <JamaProgress totals={totals} />

      <UnassignedTray
        packets={unassigned}
        lots={lots}
        totals={totals}
        run={run}
        onConfirm={onConfirm}
        readOnly={readOnly}
      />

      <LotSheet
        kapan={kapan}
        rows={rows}
        totals={totals}
        run={run}
        onNotify={onNotify}
        onConfirm={onConfirm}
        expandedLotId={expandedLotId}
        onToggleLot={toggleLot}
        onScanLot={onScanLot}
        activeLotId={activeLotId}
        onUndo={onUndo}
        readOnly={readOnly}
      />
    </section>
  );
};

export default KapanWorkbench;
