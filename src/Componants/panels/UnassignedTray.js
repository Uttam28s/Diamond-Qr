import React, { useState } from "react";
import PacketMover from "./PacketMover";
import { IconChevronDown, IconChevronRight } from "../Icons";
import { formatWeight } from "../../domain/format";

/**
 * Packets scanned before anyone picked a lot.
 *
 * This tray is what lets the scan box never refuse a scan. Its contents are held
 * out of the Kapan's totals until they are filed, so nothing is silently counted
 * against a lot it does not belong to.
 */
const UnassignedTray = ({ packets, lots, totals, run, onConfirm, readOnly }) => {
  const [open, setOpen] = useState(false);

  if (!packets.length) return null;

  return (
    <div className={`tray ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="tray-head"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="tray-chevron">
          {open ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
        </span>
        <strong>
          {packets.length} packet{packets.length === 1 ? "" : "s"} not in a lot
        </strong>
        <span className="muted">
          {formatWeight(totals.unassignedKachuWeight)} ct rough ·{" "}
          {formatWeight(totals.unassignedPolishedWeight)} ct polished — held out of the
          totals above until filed
        </span>
      </button>

      {open && (
        <div className="tray-body">
          <PacketMover
            packets={packets}
            lots={lots}
            currentLotId={null}
            run={run}
            onConfirm={onConfirm}
            readOnly={readOnly}
            emptyMessage="Nothing unfiled."
          />
          {!lots.length && (
            <p className="field-hint">
              This Kapan has no lots yet, so there is nowhere to file these. Add a lot in
              the sheet below first.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default UnassignedTray;
