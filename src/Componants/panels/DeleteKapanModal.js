import React, { useEffect, useRef, useState } from "react";
import { IconAlert, IconClose } from "../Icons";
import { formatInt, formatWeight } from "../../domain/format";

/**
 * Deleting a Kapan is the only action in the app that can lose a season's work,
 * so it gets both guards the owner asked for: a list of exactly what disappears,
 * and the Kapan number typed out before Delete will enable.
 *
 * Cancel holds focus, so Enter is always the safe key. An Undo toast still
 * follows the delete - three chances to catch a mistake.
 */
const DeleteKapanModal = ({ kapan, totals, onCancel, onConfirm }) => {
  const [typed, setTyped] = useState("");
  const cancelRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (cancelRef.current) cancelRef.current.focus();
  }, []);

  const matches = typed.trim().toUpperCase() === kapan.number.toUpperCase();

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-kapan-title">
        <header className="modal-head">
          <h3 id="delete-kapan-title">Delete Kapan {kapan.number}</h3>
          <button type="button" className="icon-button ghost" onClick={onCancel} title="Close">
            <IconClose size={17} />
          </button>
        </header>

        <div className="modal-body">
          <p className="confirm-message">This permanently removes:</p>

          <ul className="delete-list">
            <li>
              <strong>{totals.lotCount}</strong> lot{totals.lotCount === 1 ? "" : "s"}
            </li>
            <li>
              <strong>{formatInt(totals.packetCount)}</strong> scanned packet
              {totals.packetCount === 1 ? "" : "s"}
              {totals.unassignedCount > 0 && (
                <span className="muted"> ({totals.unassignedCount} unfiled)</span>
              )}
            </li>
            <li>
              <strong>{formatWeight(totals.roughWeight)} ct</strong> rough ·{" "}
              <strong>{formatWeight(totals.polishedWeight)} ct</strong> polished
            </li>
            <li>
              Return data on <strong>{totals.lotsWithReturns}</strong> lot
              {totals.lotsWithReturns === 1 ? "" : "s"}
            </li>
          </ul>

          <label className="field-label" htmlFor="delete-confirm">
            Type <code>{kapan.number}</code> to confirm
          </label>
          <input
            id="delete-confirm"
            className="text-input"
            autoComplete="off"
            value={typed}
            placeholder={kapan.number}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches) onConfirm();
            }}
          />

          <p className="modal-note">
            <IconAlert size={15} />
            You can still undo this straight afterwards.
          </p>
        </div>

        <footer className="modal-foot">
          <button type="button" className="button ghost" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button danger"
            disabled={!matches}
            onClick={onConfirm}
          >
            Delete Kapan
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DeleteKapanModal;
