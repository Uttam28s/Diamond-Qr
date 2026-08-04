import React, { useEffect, useMemo, useState } from "react";
import {
  IconAlert,
  IconChevronDown,
  IconClose,
  IconDiamond,
  IconDroplet,
  IconFile,
  IconPercent,
} from "../Icons";
import { formatPercent, formatWeight } from "../../domain/format";
import { normalizeKapanNumber } from "../../domain/model";

const SummaryRow = ({ icon, label, value, accent }) => (
  <div className="summary-row">
    <span className="summary-icon">{icon}</span>
    <span className="summary-label">{label}</span>
    <span className={`summary-value ${accent ? "accent" : ""}`}>{value}</span>
  </div>
);

/**
 * Saves a scanning session into a Kapan, and into one of its lots if one is
 * picked. Leaving the lot blank is allowed on purpose - the packets go to the
 * Kapan's unassigned tray and can be filed later, because a scan must never wait
 * on someone deciding which lot it belongs to.
 */
const SaveModal = ({ kapanRows, recordCount, totals, onCancel, onSave }) => {
  const [kapanNumber, setKapanNumber] = useState("");
  const [lotId, setLotId] = useState("");

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const normalized = normalizeKapanNumber(kapanNumber);
  const match = useMemo(
    () => kapanRows.find((row) => row.kapan.number === normalized) || null,
    [kapanRows, normalized]
  );

  // Lots belong to the chosen Kapan, so changing the Kapan clears the lot.
  useEffect(() => {
    setLotId("");
  }, [normalized]);

  const lots = match ? match.lots || [] : [];

  const submit = () => {
    if (!normalized) return;
    onSave({ kapanNumber: normalized, lotId: lotId || null });
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="save-modal-title">
        <header className="modal-head">
          <h3 id="save-modal-title">Save {recordCount} packet(s)</h3>
          <button type="button" className="icon-button ghost" onClick={onCancel} title="Close">
            <IconClose size={17} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field-label" htmlFor="kapan-number">
            Kapan number <span className="guj-hint">કટ નંબર</span>
          </label>
          <input
            id="kapan-number"
            className="text-input"
            autoFocus
            autoComplete="off"
            list="existing-kapans"
            value={kapanNumber}
            placeholder="41"
            onChange={(event) => setKapanNumber(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <datalist id="existing-kapans">
            {kapanRows.map((row) => (
              <option value={row.kapan.number} key={row.kapan.id} />
            ))}
          </datalist>

          <label className="field-label" htmlFor="target-lot">
            Lot <span className="muted">(optional)</span>
          </label>
          <label className="select-wrap block">
            <select
              id="target-lot"
              value={lotId}
              disabled={!lots.length}
              onChange={(event) => setLotId(event.target.value)}
            >
              <option value="">
                {lots.length
                  ? "Not yet — hold in Unassigned"
                  : match
                  ? "This Kapan has no lots yet"
                  : "Pick a Kapan first"}
              </option>
              {lots.map((lot) => (
                <option value={lot.id} key={lot.id}>
                  Lot {lot.lotNo}
                  {lot.pcs !== null ? ` · ${lot.pcs} pcs` : ""}
                </option>
              ))}
            </select>
            <IconChevronDown size={15} />
          </label>
          <p className="field-hint">
            Without a lot these packets wait in the Kapan's Unassigned tray, out of
            its totals, until you file them.
          </p>

          <div className="modal-summary">
            <SummaryRow icon={<IconFile size={16} />} label="Packets" value={recordCount} />
            <SummaryRow
              icon={<IconDroplet size={16} />}
              label="Total Kachu Weight"
              value={`${formatWeight(totals.kWeight)} ct`}
              accent
            />
            <SummaryRow
              icon={<IconDiamond size={16} />}
              label="Total Polished Weight"
              value={`${formatWeight(totals.pWeight)} ct`}
              accent
            />
            <SummaryRow
              icon={<IconPercent size={15} />}
              label="Yield"
              value={`${formatPercent(
                totals.kWeight > 0 ? (totals.pWeight / totals.kWeight) * 100 : 0
              )} %`}
              accent
            />
          </div>

          {!!normalized && !match && (
            <p className="modal-note">
              <IconAlert size={15} />
              {normalized} does not exist yet — it will be created.
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
            onClick={submit}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SaveModal;
