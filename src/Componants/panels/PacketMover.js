import React, { useState } from "react";
import PacketTable from "./PacketTable";
import { IconChevronDown, IconTrash } from "../Icons";
import { deletePackets, movePackets } from "../../domain/operations";
import { formatWeight } from "../../domain/format";
import { packetTotals } from "../../domain/totals";

/**
 * Packets plus the two things anyone ever wants to do with a mis-scanned one:
 * move it to the right lot, or delete it. Both undoable.
 *
 * The same component serves a lot's own packets and the Kapan's unassigned tray,
 * because filing a stray scan and correcting a wrong-lot scan are one operation
 * with a different starting point.
 */
const PacketMover = ({
  packets,
  lots,
  currentLotId = null,
  run,
  onConfirm,
  readOnly = false,
  emptyMessage,
  showLot = false,
  lotsById = {},
}) => {
  const [selected, setSelected] = useState(() => new Set());
  const [target, setTarget] = useState("");

  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (select) =>
    setSelected(select ? new Set(packets.map((packet) => packet.id)) : new Set());

  const ids = [...selected].filter((id) => packets.some((packet) => packet.id === id));
  const chosen = packets.filter((packet) => selected.has(packet.id));
  const totals = packetTotals(chosen);

  const move = async () => {
    if (!ids.length) return;
    // An empty target means the unassigned tray, which is a real destination -
    // it is how a packet gets pulled back out of the wrong lot.
    const outcome = await run((state) => movePackets(state, ids, target || null));
    if (outcome.ok) {
      setSelected(new Set());
      setTarget("");
    }
  };

  const remove = () => {
    if (!ids.length) return;

    onConfirm({
      title: `Delete ${ids.length} packet(s)`,
      message: `This removes ${ids.length} scanned packet(s) worth ${formatWeight(
        totals.kachuWeight
      )} ct rough. The lot's weights and percentages will change. You can undo it straight afterwards.`,
      confirmLabel: "Delete packets",
      onConfirm: async () => {
        const outcome = await run((state) => deletePackets(state, ids));
        if (outcome.ok) setSelected(new Set());
      },
    });
  };

  const targetLots = lots.filter((lot) => lot.id !== currentLotId);

  return (
    <div className="packet-mover">
      <PacketTable
        packets={packets}
        selectedIds={readOnly ? null : selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        emptyMessage={emptyMessage}
        showLot={showLot}
        lotsById={lotsById}
      />

      {!readOnly && !!packets.length && (
        <div className={`mover-bar ${ids.length ? "is-armed" : ""}`}>
          <span className="mover-count">
            {ids.length
              ? `${ids.length} selected · ${formatWeight(totals.kachuWeight)} ct rough`
              : "Tick packets to move or delete them"}
          </span>

          <label className="select-wrap">
            <select
              value={target}
              disabled={!ids.length}
              onChange={(event) => setTarget(event.target.value)}
              aria-label="Move selected packets to"
            >
              <option value="">Unassigned</option>
              {targetLots.map((lot) => (
                <option value={lot.id} key={lot.id}>
                  Lot {lot.lotNo}
                  {lot.pcs === null ? "" : ` · ${lot.pcs} pcs`}
                </option>
              ))}
            </select>
            <IconChevronDown size={14} />
          </label>

          <button
            type="button"
            className="button primary small"
            disabled={!ids.length}
            onClick={move}
          >
            Move
          </button>

          <button
            type="button"
            className="button ghost small danger-text"
            disabled={!ids.length}
            onClick={remove}
            title="Delete the selected packets"
          >
            <IconTrash size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default PacketMover;
