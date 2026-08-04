import React from "react";
import { IconAlert, IconClose, IconLayers } from "../Icons";
import { formatWeight } from "../../domain/format";

/**
 * Where the next scan will land, shown above the scan box.
 *
 * Always visible, including when no lot is chosen - "held in Unassigned" is a
 * real answer and saying it plainly is better than an empty space that leaves
 * someone wondering where their scans went.
 */
const ActiveLotBar = ({ target, onChange, onClear, queuedCount = 0 }) => {
  const hasLot = !!(target && target.lot);

  return (
    <div className={`active-bar ${hasLot ? "is-set" : ""}`}>
      <span className="active-label">Scanning into</span>

      {hasLot ? (
        <span className="lot-chip">
          <IconLayers size={14} />
          Kapan {target.kapan.number} · Lot {target.lot.lotNo}
          <button
            type="button"
            className="lot-chip-x"
            onClick={onClear}
            title="Scan without a lot instead"
            aria-label="Clear the active lot"
          >
            <IconClose size={12} />
          </button>
        </span>
      ) : (
        <span className="active-none">
          <IconAlert size={14} />
          No lot — packets will wait in Unassigned
        </span>
      )}

      <button type="button" className="button ghost small" onClick={onChange}>
        {hasLot ? "Change" : "Pick a lot"}
        <kbd>Ctrl+L</kbd>
      </button>

      <span className="active-spacer" />

      {hasLot && (
        <span className="muted small">
          Lot {target.lot.lotNo} holds {target.derived ? target.derived.packetCount : 0}{" "}
          packet(s) · {formatWeight(target.derived ? target.derived.kachuWeight : 0)} ct
          rough
        </span>
      )}

      {queuedCount > 0 && (
        <span className="badge badge-warn">{queuedCount} waiting to sync</span>
      )}
    </div>
  );
};

export default ActiveLotBar;
