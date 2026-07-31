import React from "react";
import {
  IconBarcode,
  IconDiamond,
  IconDroplet,
  IconPercent,
  IconSave,
  IconScanTarget,
} from "../Icons";
import { formatNumber } from "../utils";

const StatCard = ({ tone, icon, label, value, unit }) => (
  <div className={`stat-card tone-${tone}`}>
    <span className="stat-icon">{icon}</span>
    <span className="stat-body">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        <em>{unit}</em>
      </span>
    </span>
  </div>
);

const ScanForm = ({
  scanInputRef,
  currentCode,
  onCurrentCodeChange,
  onScanKeyDown,
  previousCode,
  totals,
  recordCount,
  onSaveClick,
}) => (
  <section className="scan-form" aria-label="Scan packet">
    <label className="field-label" htmlFor="scan-code">
      Scan Barcode / QR Code
    </label>

    <div className="scan-input">
      <span className="scan-input-glyph">
        <IconScanTarget size={30} />
      </span>
      <input
        id="scan-code"
        ref={scanInputRef}
        type="text"
        autoComplete="off"
        spellCheck="false"
        placeholder="Focus scanner or enter code"
        value={currentCode}
        onChange={(event) => onCurrentCodeChange(event.target.value)}
        onKeyDown={onScanKeyDown}
      />
      <button
        type="button"
        className="icon-button scan-input-action"
        title="Type a code manually"
        onClick={() => scanInputRef.current && scanInputRef.current.focus()}
      >
        <IconBarcode size={18} />
      </button>
    </div>

    <label className="field-label" htmlFor="previous-code">
      Previous Scan
    </label>
    <input
      id="previous-code"
      className="text-input readonly-input"
      type="text"
      value={previousCode}
      readOnly
      tabIndex={-1}
      placeholder="No packet scanned yet"
    />

    <div className="stat-grid">
      <StatCard
        tone="blue"
        icon={<IconDroplet size={19} />}
        label="Kachu Weight"
        value={formatNumber(totals.kWeight)}
        unit="ct"
      />
      <StatCard
        tone="teal"
        icon={<IconDiamond size={19} />}
        label="Polished Weight"
        value={formatNumber(totals.pWeight)}
        unit="ct"
      />
      <StatCard
        tone="green"
        icon={<IconPercent size={18} />}
        label="Yield %"
        value={totals.percentage}
        unit="%"
      />
    </div>

    <p className="field-hint">Weights are in Carat (ct)</p>

    <button
      type="button"
      className="button primary wide"
      disabled={!recordCount}
      onClick={onSaveClick}
      title={recordCount ? "Save this session to a Kapan" : "Scan a packet first"}
    >
      <IconSave size={18} />
      Save Records
    </button>
  </section>
);

export default ScanForm;
