import React, { useEffect, useRef, useState } from "react";
import { IconClose } from "../Icons";
import { parseDateEntry } from "../../domain/entry";
import { dayForEditing, formatDay } from "../../domain/format";

/**
 * Create or edit a Kapan. Four fields, three of them optional, because the sheet
 * only ever needed a number and a date.
 *
 * Dates are typed rather than picked - "t" for today, "17.7" for a day this
 * year. A picker would cost a mouse trip per Kapan.
 */
const KapanFormModal = ({ kapan, seasons, defaultSeason, onCancel, onSubmit }) => {
  const editing = !!kapan;

  const [number, setNumber] = useState(kapan ? kapan.number : "");
  const [season, setSeason] = useState(kapan ? kapan.season : defaultSeason || "");
  const [createdAt, setCreatedAt] = useState(
    kapan ? dayForEditing(kapan.createdAt) : "t"
  );
  const [targetAt, setTargetAt] = useState(kapan ? dayForEditing(kapan.targetAt) : "");
  const [error, setError] = useState("");
  const numberRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (numberRef.current) numberRef.current.focus();
  }, []);

  const submit = () => {
    if (!number.trim()) {
      setError("A Kapan needs a number.");
      return;
    }

    const created = parseDateEntry(createdAt);
    if (!created.ok) {
      setError(created.error);
      return;
    }
    if (!created.value) {
      setError("A Kapan needs a created date. Type t for today.");
      return;
    }

    const target = parseDateEntry(targetAt);
    if (!target.ok) {
      setError(target.error);
      return;
    }

    onSubmit({
      number,
      season,
      createdAt: created.value,
      targetAt: target.value,
    });
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="kapan-form-title">
        <header className="modal-head">
          <h3 id="kapan-form-title">{editing ? `Edit Kapan ${kapan.number}` : "New Kapan"}</h3>
          <button type="button" className="icon-button ghost" onClick={onCancel} title="Close">
            <IconClose size={17} />
          </button>
        </header>

        <div className="modal-body">
          <div className="field-grid">
            <div>
              <label className="field-label" htmlFor="kapan-number">
                Kapan number <span className="guj-hint">કટ નંબર</span>
              </label>
              <input
                id="kapan-number"
                ref={numberRef}
                className="text-input"
                autoComplete="off"
                value={number}
                placeholder="41"
                onChange={(event) => setNumber(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
              <p className="field-hint">Any text — 41, EX-3, whatever the sheet uses.</p>
            </div>

            <div>
              <label className="field-label" htmlFor="kapan-season">
                Season
              </label>
              <input
                id="kapan-season"
                className="text-input"
                autoComplete="off"
                list="known-seasons"
                value={season}
                placeholder="25-26"
                onChange={(event) => setSeason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
              <datalist id="known-seasons">
                {seasons.map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <p className="field-hint">Groups the Kapan list and the season report.</p>
            </div>

            <div>
              <label className="field-label" htmlFor="kapan-created">
                Created date <span className="guj-hint">તારીખ</span>
              </label>
              <input
                id="kapan-created"
                className="text-input"
                autoComplete="off"
                value={createdAt}
                placeholder="t"
                onChange={(event) => setCreatedAt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
              <p className="field-hint">
                <code>t</code> = today, <code>17.7</code> = 17 July this year.
              </p>
            </div>

            <div>
              <label className="field-label" htmlFor="kapan-target">
                Target completion <span className="muted">(optional)</span>
              </label>
              <input
                id="kapan-target"
                className="text-input"
                autoComplete="off"
                value={targetAt}
                placeholder="leave blank"
                onChange={(event) => setTargetAt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
              <p className="field-hint">
                {targetAt.trim()
                  ? `Reads as ${
                      parseDateEntry(targetAt).ok
                        ? formatDay(parseDateEntry(targetAt).value)
                        : "…"
                    }`
                  : "An estimate, never enforced."}
              </p>
            </div>
          </div>

          {!!error && <p className="modal-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="button ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={submit}>
            {editing ? "Save changes" : "Create Kapan"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default KapanFormModal;
