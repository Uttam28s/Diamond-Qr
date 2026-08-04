import React, { useCallback, useEffect, useMemo, useState } from "react";
import { IconChevronDown, IconCheck } from "../Icons";
import { useSheetCursor } from "../../hooks/useSheetCursor";
import { parseDateEntry, parseLotField } from "../../domain/entry";
import { updateLot } from "../../domain/operations";
import { allLots, emptyFilter, lotAggregate, returnsPending } from "../../domain/reports";
import { ALL_SEASONS, selectSeasons } from "../../domain/selectors";
import {
  BLANK,
  dayForEditing,
  formatDay,
  formatInt,
  formatPercent,
  formatWeight,
  numberForEditing,
} from "../../domain/format";

/**
 * Entering returns, across every Kapan at once.
 *
 * Returns arrive weeks after a lot goes out, and in the factory's own sheet only a
 * third of the rows have them filled. Hunting those rows inside a thirteen-column
 * grid is the slow part of the day, so they get their own screen: three fields
 * wide, tab straight down it.
 *
 * A row does not vanish the moment its returns are entered - it stays and goes
 * grey. Rows disappearing under the cursor mid-typing is how you lose your place
 * and enter the next figure against the wrong lot.
 */

const COLUMNS = [
  { key: "returnPcs", guj: "જ. નંગ", en: "Ret pcs", aria: "return pcs" },
  { key: "returnWeight", guj: "જ.વજન", en: "Ret wt", aria: "return weight" },
  { key: "returnDate", guj: "જ.તારીખ", en: "Ret date", aria: "return date" },
];

const storedValue = (lot, key) =>
  key === "returnDate" ? dayForEditing(lot[key]) : numberForEditing(lot[key]);

const restingValue = (lot, key) => {
  const stored = storedValue(lot, key);
  if (!stored) return "";
  if (key === "returnDate") return formatDay(stored);
  if (key === "returnWeight") return formatWeight(lot[key]);
  return stored;
};

const ReturnsQueue = ({ state, run, onNotify, onUndo, readOnly }) => {
  const [season, setSeason] = useState(ALL_SEASONS);
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState(null); // {row, key, text}

  // Which lots the screen is showing. Captured so a lot stays put once its
  // returns are entered instead of dropping out from under the cursor.
  const [pinned, setPinned] = useState(() => new Set());
  const seasons = useMemo(() => selectSeasons(state), [state]);
  const filter = useMemo(() => ({ ...emptyFilter(), season }), [season]);

  const pending = useMemo(() => returnsPending(state, filter), [state, filter]);
  const everything = useMemo(() => allLots(state, filter), [state, filter]);

  // Reset the pinned set when the filter changes: those ids belong to the old view.
  useEffect(() => {
    setPinned(new Set());
  }, [season]);

  const rows = useMemo(() => {
    if (showDone) return everything.rows;

    const pendingIds = new Set(pending.rows.map((row) => row.lot.id));
    return everything.rows.filter(
      (row) => pendingIds.has(row.lot.id) || pinned.has(row.lot.id)
    );
  }, [everything.rows, pending.rows, pinned, showDone]);

  // Totalled over the rows actually on screen. Showing the whole season's weights
  // under a filtered list would read as if they belonged to it.
  const totals = useMemo(() => lotAggregate(rows), [rows]);

  const cursor = useSheetCursor({
    rowCount: rows.length,
    columnCount: COLUMNS.length,
    // No ghost row here - lots are created in the sheet, never from this screen.
    onCommitGhost: () => {},
  });

  const commitDraft = useCallback(async () => {
    if (!draft) return;

    const row = rows[draft.row];
    const current = draft;
    setDraft(null);
    if (!row) return;

    const stored = storedValue(row.lot, current.key);
    if (`${current.text}`.trim() === `${stored}`.trim()) return;

    if (current.key === "returnDate") {
      const parsed = parseDateEntry(current.text);
      if (!parsed.ok) {
        onNotify(parsed.error, "error");
        return;
      }
      await run((s) => updateLot(s, row.lot.id, { returnDate: parsed.value }));
      return;
    }

    const parsed = parseLotField(current.key, current.text, row.lot[current.key]);
    if (!parsed.ok) {
      onNotify(parsed.error, "error");
      return;
    }

    // Pin before the write, so the row is still on screen when the list recomputes
    // and finds it no longer pending.
    setPinned((set) => new Set(set).add(row.lot.id));
    await run((s) => updateLot(s, row.lot.id, { [current.key]: parsed.value }));
  }, [draft, onNotify, rows, run]);

  const fillDown = useCallback(() => {
    const { row, col } = cursor.cursor;
    if (row === 0 || row >= rows.length) return;
    const above = rows[row - 1];
    if (!above) return;
    setDraft({ row, key: COLUMNS[col].key, text: storedValue(above.lot, COLUMNS[col].key) });
  }, [cursor.cursor, rows]);

  const cellText = (rowIndex, row, column, colIndex) => {
    if (draft && draft.row === rowIndex && draft.key === column.key) return draft.text;
    return cursor.isAt(rowIndex, colIndex)
      ? storedValue(row.lot, column.key)
      : restingValue(row.lot, column.key);
  };

  const doneCount = everything.rows.length - pending.rows.length;

  return (
    <section className="panel returns-panel" aria-label="Returns">
      <header className="panel-head">
        <h3>Returns</h3>
        <div className="panel-tools">
          <span className="badge badge-warn">{pending.rows.length} awaiting</span>
          <span className="badge">{doneCount} done</span>

          <label className="select-wrap">
            <select
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              aria-label="Season"
            >
              <option value={ALL_SEASONS}>All seasons</option>
              {seasons.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
            <IconChevronDown size={15} />
          </label>

          <button
            type="button"
            className={`button ghost small ${showDone ? "is-on" : ""}`}
            onClick={() => setShowDone((current) => !current)}
          >
            <IconCheck size={14} />
            {showDone ? "Hide completed" : "Show completed"}
          </button>
        </div>
      </header>

      <div className="sheet-scroll">
        <table className="sheet-table returns-table">
          <thead>
            <tr>
              <th className="stick-1" style={{ width: 78 }}>
                <span className="th-guj">કટ નંબર</span>
                <small>Kapan</small>
              </th>
              <th className="num" style={{ width: 58 }}>
                <span className="th-guj">લોટ</span>
                <small>Lot</small>
              </th>
              <th style={{ width: 100 }}>
                <span className="th-guj">તારીખ</span>
                <small>Sent out</small>
              </th>
              <th className="num" style={{ width: 70 }}>
                <span className="th-guj">નંગ</span>
                <small>Pcs out</small>
              </th>
              <th className="num" style={{ width: 88 }}>
                <span className="th-guj">વજન</span>
                <small>Rough</small>
              </th>
              <th className="num" style={{ width: 88 }}>
                <span className="th-guj">તૈયાર વ.</span>
                <small>Polished</small>
              </th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="num is-entry-head" style={{ width: 104 }}>
                  <span className="th-guj">{column.guj}</span>
                  <small>{column.en}</small>
                </th>
              ))}
              <th className="num" style={{ width: 86 }}>
                <span className="th-guj">જ.ટકાવારી</span>
                <small>Ret %</small>
              </th>
              <th className="num" style={{ width: 86 }}>
                <span className="th-guj">બા. નંગ</span>
                <small>Missing</small>
              </th>
              <th className="num" style={{ width: 74 }}>
                <small>Days out</small>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              const daysOut = (
                pending.rows.find((entry) => entry.lot.id === row.lot.id) || {}
              ).daysOut;

              return (
                <tr
                  key={row.lot.id}
                  className={row.derived.hasReturns ? "is-done" : ""}
                >
                  <td className="stick-1 kapan-cell">{row.kapan.number}</td>
                  <td className="derived num">{row.lot.lotNo}</td>
                  <td className="derived">{formatDay(row.lot.lotDate)}</td>
                  <td className="derived num">
                    {row.derived.pcs === null ? BLANK : row.derived.pcs}
                  </td>
                  <td className="derived num">{formatWeight(row.derived.kachuWeight)}</td>
                  <td className="derived num">
                    {formatWeight(row.derived.polishedWeight)}
                  </td>

                  {COLUMNS.map((column, colIndex) => (
                    <td
                      key={column.key}
                      className={`entry num ${
                        cursor.isAt(rowIndex, colIndex) ? "is-focused" : ""
                      }`}
                    >
                      <input
                        ref={(element) => cursor.registerCell(rowIndex, colIndex, element)}
                        className="sheet-input"
                        type="text"
                        inputMode={column.key === "returnDate" ? "text" : "decimal"}
                        autoComplete="off"
                        disabled={readOnly}
                        value={cellText(rowIndex, row, column, colIndex)}
                        placeholder={column.key === "returnDate" ? "dd-mm-yyyy" : ""}
                        onChange={(event) =>
                          setDraft({
                            row: rowIndex,
                            key: column.key,
                            text: event.target.value,
                          })
                        }
                        onFocus={() => cursor.setCursorAt(rowIndex, colIndex)}
                        onBlur={commitDraft}
                        onKeyDown={(event) =>
                          cursor.handleKeyDown(event, {
                            commit: commitDraft,
                            revert: () => setDraft(null),
                            fillDown,
                            hasDraft: !!draft,
                            undo: onUndo,
                          })
                        }
                        aria-label={`Kapan ${row.kapan.number} lot ${row.lot.lotNo} ${column.aria}`}
                      />
                    </td>
                  ))}

                  <td className="derived num">{formatPercent(row.derived.returnPct)}</td>
                  <td
                    className={`derived num ${
                      row.derived.missingPct > 3 ? "is-negative" : ""
                    }`}
                  >
                    {row.derived.missingPcs === null ? BLANK : row.derived.missingPcs}
                  </td>
                  <td className={`derived num ${daysOut > 30 ? "is-negative" : ""}`}>
                    {daysOut === undefined || daysOut === null ? BLANK : daysOut}
                  </td>
                </tr>
              );
            })}

            {!rows.length && (
              <tr className="empty-row">
                <td colSpan={12}>
                  <div className="empty-state">
                    <IconCheck size={26} />
                    <strong>
                      {everything.rows.length
                        ? "Every lot has its returns entered"
                        : "No lots yet"}
                    </strong>
                    <span>
                      {everything.rows.length
                        ? "Nothing is outstanding in this season."
                        : "Add lots to a Kapan in the Kapans screen first."}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          {!!rows.length && (
            <tfoot>
              <tr>
                <th className="stick-1">Σ</th>
                <th className="num">{rows.length}</th>
                <th />
                <th className="num">{formatInt(totals.roughPcs)}</th>
                <th className="num">{formatWeight(totals.roughWeight)}</th>
                <th className="num">{formatWeight(totals.polishedWeight)}</th>
                <th className="num">{formatInt(totals.returnPcs)}</th>
                <th className="num">{formatWeight(totals.returnWeight)}</th>
                <th />
                <th className="num">{formatPercent(totals.returnPct)}</th>
                <th className="num">{formatInt(totals.missingPcs)}</th>
                <th />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!readOnly && (
        <p className="sheet-hint">
          <span>
            <kbd>Tab</kbd> next field
          </span>
          <span>
            <kbd>Enter</kbd> save and down
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>D</kbd> copy from above
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
          </span>
          <span className="muted">
            Type <code>+12</code> to add to what has already come back. Entering pcs
            fills in today's date.
          </span>
        </p>
      )}
    </section>
  );
};

export default ReturnsQueue;
