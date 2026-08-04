import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconSearch } from "../Icons";
import { formatWeight } from "../../domain/format";

/**
 * Type-to-filter picker over every Kapan and lot, in two modes:
 *
 *   scan (Ctrl+L)  pick the lot the next scan goes into
 *   jump (Ctrl+K)  open a Kapan's workbench
 *
 * One component because it is one interaction - typing "41 8" to land on Kapan 41
 * lot 8 - and two nearly-identical dialogs would drift apart. Arrow keys and Enter
 * throughout: this gets opened mid-scan with a scanner in the other hand.
 */
const LotPicker = ({ kapanRows, activeLotId, mode = "scan", onCancel, onPick }) => {
  const jumping = mode === "jump";
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  /**
   * One flat list of every lot in every Kapan. Flat rather than nested because a
   * two-level tree needs two decisions from the user and this needs one.
   */
  const options = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    const all = kapanRows.flatMap((row) => {
      const lots = row.lots.map((lot) => ({
        kapan: row.kapan,
        lot,
        // Matched against as one string so "41 8" and "418" both find it.
        haystack: `${row.kapan.number} ${lot.lotNo} ${row.kapan.season}`.toLowerCase(),
      }));

      // Jumping needs the Kapan itself as a target - including one with no lots
      // yet, which is exactly when you want to get to it and add some.
      return jumping
        ? [
            {
              kapan: row.kapan,
              lot: null,
              haystack: `${row.kapan.number} ${row.kapan.season}`.toLowerCase(),
            },
            ...lots,
          ]
        : lots;
    });

    if (!terms.length) return all;
    return all.filter((option) => terms.every((term) => option.haystack.includes(term)));
  }, [kapanRows, query, jumping]);

  // Reset the highlight whenever the list changes under it, or Enter would pick
  // whatever happens to be at a stale index.
  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector(".is-active");
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [index]);

  const commit = (option) => {
    if (!option) return;
    onPick({ kapanId: option.kapan.id, lotId: option.lot ? option.lot.id : null });
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => Math.min(current + 1, options.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit(options[index]);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal modal-picker" role="dialog" aria-modal="true" aria-labelledby="lot-picker-title">
        <header className="modal-head">
          <h3 id="lot-picker-title">{jumping ? "Go to a Kapan or lot" : "Scan into which lot?"}</h3>
          <button type="button" className="icon-button ghost" onClick={onCancel} title="Close">
            <IconClose size={17} />
          </button>
        </header>

        <div className="picker-search">
          <IconSearch size={15} />
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            value={query}
            placeholder={jumping ? "Kapan or lot — try 41" : "Kapan and lot — try 41 8"}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search Kapans and lots"
          />
        </div>

        <div className="picker-list" ref={listRef} role="listbox" aria-label="Lots">
          {options.map((option, optionIndex) => (
            <button
              type="button"
              role="option"
              aria-selected={optionIndex === index}
              key={option.lot ? option.lot.id : `kapan-${option.kapan.id}`}
              className={`picker-row ${optionIndex === index ? "is-active" : ""} ${
                option.lot && option.lot.id === activeLotId ? "is-current" : ""
              }`}
              onMouseEnter={() => setIndex(optionIndex)}
              onClick={() => commit(option)}
            >
              <span className="picker-kapan">{option.kapan.number}</span>
              <span className="picker-lot">
                {option.lot ? `Lot ${option.lot.lotNo}` : "whole Kapan"}
              </span>
              <span className="picker-meta">
                {option.lot
                  ? option.lot.pcs === null
                    ? "no pcs yet"
                    : `${option.lot.pcs} pcs`
                  : option.kapan.season}
              </span>
              <span className="picker-meta num">
                {option.lot ? `${formatWeight(option.lot.roughWeight || 0)} ct` : ""}
              </span>
              {option.lot && option.lot.id === activeLotId && (
                <span className="picker-flag">current</span>
              )}
            </button>
          ))}

          {!options.length && (
            <p className="picker-empty">
              {kapanRows.some((row) => row.lots.length)
                ? "Nothing matches that."
                : jumping
                ? "No Kapans yet."
                : "No lots exist yet. Add lots to a Kapan first, or scan without one and file the packets later."}
            </p>
          )}
        </div>

        <footer className="modal-foot picker-foot">
          <span className="muted small">
            <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> choose · <kbd>Esc</kbd> cancel
          </span>
          {!jumping && (
            <button
              type="button"
              className="button ghost"
              onClick={() => onPick({ kapanId: null, lotId: null })}
            >
              Scan without a lot
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default LotPicker;
