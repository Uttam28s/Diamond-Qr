import React, { useEffect } from "react";
import {
  IconAlert,
  IconCalendar,
  IconClose,
  IconDiamond,
  IconDroplet,
  IconFile,
  IconPercent,
} from "../Icons";
import { formatDisplayDate, formatNumber, normalizeKapanNumber } from "../utils";

const SummaryRow = ({ icon, label, value, accent }) => (
  <div className="summary-row">
    <span className="summary-icon">{icon}</span>
    <span className="summary-label">{label}</span>
    <span className={`summary-value ${accent ? "accent" : ""}`}>{value}</span>
  </div>
);

const SaveModal = ({
  kapanNumber,
  onKapanNumberChange,
  recordCount,
  totals,
  existingKapans,
  onCancel,
  onSave,
}) => {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const normalized = normalizeKapanNumber(kapanNumber);
  const isExisting = !!normalized && existingKapans.includes(normalized);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="save-modal-title">
        <header className="modal-head">
          <h3 id="save-modal-title">Save Records to Kapan</h3>
          <button type="button" className="icon-button ghost" onClick={onCancel} title="Close">
            <IconClose size={17} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field-label" htmlFor="kapan-number">
            Kapan Number
          </label>
          <input
            id="kapan-number"
            className="text-input"
            autoFocus
            autoComplete="off"
            list="existing-kapans"
            value={kapanNumber}
            placeholder="KPN-1024"
            onChange={(event) => onKapanNumberChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSave();
            }}
          />
          <datalist id="existing-kapans">
            {existingKapans.map((number) => (
              <option value={number} key={number} />
            ))}
          </datalist>

          <div className="modal-summary">
            <SummaryRow
              icon={<IconCalendar size={16} />}
              label="Date"
              value={formatDisplayDate(new Date())}
            />
            <SummaryRow
              icon={<IconFile size={16} />}
              label="Record Count"
              value={recordCount}
            />
            <SummaryRow
              icon={<IconDroplet size={16} />}
              label="Total Kachu Weight"
              value={`${formatNumber(totals.kWeight)} ct`}
              accent
            />
            <SummaryRow
              icon={<IconDiamond size={16} />}
              label="Total Polished Weight"
              value={`${formatNumber(totals.pWeight)} ct`}
              accent
            />
            <SummaryRow
              icon={<IconPercent size={15} />}
              label="Average Yield"
              value={`${totals.percentage} %`}
              accent
            />
          </div>

          {isExisting && (
            <p className="modal-note">
              <IconAlert size={15} />
              {normalized} already exists — these records will be added to it.
            </p>
          )}
        </div>

        <footer className="modal-foot">
          <button type="button" className="button ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!normalized || !recordCount}
            onClick={onSave}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SaveModal;
