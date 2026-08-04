import React, { useCallback, useRef, useState } from "react";
import { IconChevronDown, IconChevronRight, IconClose, IconPlus } from "../Icons";
import PacketMover from "./PacketMover";
import { useSheetCursor } from "../../hooks/useSheetCursor";
import { parseDateEntry, parseLotField } from "../../domain/entry";
import { createLot, deleteLot, updateLot } from "../../domain/operations";
import { lotTargets } from "../../domain/selectors";
import {
  BLANK,
  dayForEditing,
  formatCount,
  formatDay,
  formatInt,
  formatPercent,
  formatWeight,
  numberForEditing,
} from "../../domain/format";

/**
 * The sheet, reproducing the factory's thirteen columns in their own order.
 *
 * Typed columns are inputs; calculated ones are tinted and cannot be focused, so
 * the difference between "I own this number" and "the app works this out" is
 * visible without reading a legend.
 */

/**
 * `edit` marks a column the owner types into; the rest are derived.
 *
 * `en` is the short header label; `aria` is the unabbreviated one used for the
 * accessible name, so "Ret pcs" is announced as "return pcs" and cannot be
 * confused with "pcs".
 */
const COLUMNS = [
  { key: "lotNo", guj: "ક્રમ", en: "No.", align: "num", width: 52 },
  { key: "lotDate", guj: "તારીખ", en: "Date", aria: "date", edit: "date", width: 104 },
  {
    key: "pcs",
    guj: "નંગ",
    en: "Pcs",
    aria: "pcs",
    edit: "number",
    align: "num",
    width: 72,
    note: "Counts itself up as packets are scanned into the lot — still editable by hand",
  },
  { key: "kachuWeight", guj: "વજન", en: "Rough", align: "num", width: 86 },
  { key: "charmi", guj: "સારણી", en: "Charmi", aria: "charmi", edit: "number", align: "num", width: 76 },
  { key: "polishedWeight", guj: "તૈયાર વ.", en: "Polished", align: "num", width: 86 },
  { key: "polishedPct", guj: "ટકાવારી", en: "Pol %", align: "num", width: 76 },
  { key: "returnPcs", guj: "જ. નંગ", en: "Ret pcs", aria: "return pcs", edit: "number", align: "num", width: 82 },
  { key: "returnWeight", guj: "જ.વજન", en: "Ret wt", aria: "return weight", edit: "number", align: "num", width: 82 },
  { key: "returnPct", guj: "જ.ટકાવારી", en: "Ret %", align: "num", width: 82 },
  { key: "ghatPct", guj: "ઘટ", en: "Ghat %", align: "num", width: 76 },
  { key: "remainingPcs", guj: "બા. નંગ", en: "Remain", align: "num", width: 80 },
  { key: "returnDate", guj: "જ.તારીખ", en: "Ret date", aria: "return date", edit: "date", width: 104 },
];

const EDITABLE = COLUMNS.filter((column) => column.edit);
const editableIndex = (key) => EDITABLE.findIndex((column) => column.key === key);

/** What a derived cell shows. */
const derivedValue = (column, derived) => {
  switch (column.key) {
    case "kachuWeight":
      return formatWeight(derived.kachuWeight);
    case "polishedWeight":
      return formatWeight(derived.polishedWeight);
    case "polishedPct":
      return formatPercent(derived.polishedPct);
    case "returnPct":
      return formatPercent(derived.returnPct);
    case "ghatPct":
      return formatPercent(derived.ghatPct);
    case "remainingPcs":
      return formatCount(derived.remainingPcs);
    default:
      return BLANK;
  }
};

/**
 * Which derived cells are printed as a problem rather than a number.
 *
 * ઘટ goes negative routinely - it is what a return heavier than the polished
 * weight looks like, and the real sheet is full of them. બા. નંગ going negative is
 * different: more pieces came back than went out, which the row's warning also
 * names.
 */
const isNegative = (column, derived) =>
  (column.key === "ghatPct" && derived.ghatPct < 0) ||
  (column.key === "remainingPcs" && derived.remainingPcs < 0);

const storedValue = (lot, key) =>
  key === "lotDate" || key === "returnDate"
    ? dayForEditing(lot[key])
    : numberForEditing(lot[key]);

/**
 * What a typed cell shows when the cursor is elsewhere.
 *
 * Dates read as dd-mm-yyyy and weights carry their three decimals, matching the
 * workbook and the calculated columns beside them. The raw stored form only
 * appears in the cell being edited, where trailing zeros would fight the typing.
 */
const restingValue = (lot, column) => {
  const stored = storedValue(lot, column.key);
  if (!stored) return "";
  if (column.edit === "date") return formatDay(stored);
  if (column.key === "returnWeight") return formatWeight(lot[column.key]);
  return stored;
};

const LotSheet = ({
  kapan,
  rows,
  totals,
  run,
  onNotify,
  onConfirm,
  expandedLotId,
  onToggleLot,
  onUndo,
  readOnly = false,
}) => {
  const [draft, setDraft] = useState(null); // {row, key, text}
  const [ghost, setGhost] = useState({ charmi: "", lotDate: "" });
  const addRef = useRef(null);

  /**
   * Adds the lot the ghost row describes.
   *
   * A lot needs nothing typed at all now that its pcs are counted from its scans,
   * so this is a deliberate act rather than a side effect of finishing a number:
   * the + on the ghost row, or Enter from one of its two cells. Charmi and the
   * date stay put afterwards, because runs of lots share them.
   */
  const commitGhost = useCallback(async () => {
    const charmi = parseLotField("charmi", ghost.charmi, null);
    if (!charmi.ok) {
      onNotify(charmi.error, "error");
      return;
    }

    const date = parseDateEntry(ghost.lotDate);
    if (!date.ok) {
      onNotify(date.error, "error");
      return;
    }

    const outcome = await run((state) =>
      createLot(state, kapan.id, {
        charmi: charmi.value,
        // Blank means today, so the common case needs no typing at all.
        ...(date.value ? { lotDate: date.value } : {}),
      })
    );

    // Focus goes back to the + so a run of lots is a run of Enters, exactly as it
    // was when the pcs box lived here.
    if (outcome.ok && addRef.current) addRef.current.focus();
  }, [ghost, kapan.id, onNotify, run]);

  const cursor = useSheetCursor({
    rowCount: rows.length,
    columnCount: EDITABLE.length,
    onCommitGhost: commitGhost,
  });

  // Lot numbers are never reused, so the next one is one past the highest - the
  // same rule `nextLotNo` in the model applies, named here for the + button.
  const nextLotNo = rows.length ? rows[rows.length - 1].lot.lotNo + 1 : 1;

  /* ------------------------------------------------------------- editing */

  const commitDraft = useCallback(async () => {
    if (!draft) return;

    const row = rows[draft.row];
    const current = draft;
    setDraft(null);

    if (!row) return;

    const stored = storedValue(row.lot, current.key);
    // Nothing typed, nothing to save - avoids writing an identical row and
    // filling the undo stack with changes that changed nothing.
    if (`${current.text}`.trim() === `${stored}`.trim()) return;

    if (current.key === "lotDate" || current.key === "returnDate") {
      const parsed = parseDateEntry(current.text);
      if (!parsed.ok) {
        onNotify(parsed.error, "error");
        return;
      }
      await run((state) => updateLot(state, row.lot.id, { [current.key]: parsed.value }));
      return;
    }

    const parsed = parseLotField(current.key, current.text, row.lot[current.key]);
    if (!parsed.ok) {
      onNotify(parsed.error, "error");
      return;
    }

    await run((state) => updateLot(state, row.lot.id, { [current.key]: parsed.value }));
  }, [draft, onNotify, rows, run]);

  const revertDraft = useCallback(() => setDraft(null), []);

  const fillDown = useCallback(() => {
    const { row, col } = cursor.cursor;
    if (row === 0 || row > rows.length) return;

    const column = EDITABLE[col];
    const above = rows[row - 1];
    if (!above) return;

    const value = storedValue(above.lot, column.key);
    if (row === rows.length) {
      setGhost((previous) => ({ ...previous, [column.key]: value }));
      return;
    }
    setDraft({ row, key: column.key, text: value });
  }, [cursor.cursor, rows]);

  const cellText = (rowIndex, row, column) => {
    if (draft && draft.row === rowIndex && draft.key === column.key) return draft.text;
    return cursor.isAt(rowIndex, editableIndex(column.key))
      ? storedValue(row.lot, column.key)
      : restingValue(row.lot, column);
  };

  const handleDelete = (row) => {
    const packetCount = row.packets.length;

    if (!packetCount) {
      // No scans to lose, so no dialog - one click and an Undo toast.
      run((state) => deleteLot(state, row.lot.id));
      return;
    }

    onConfirm({
      title: `Delete lot ${row.lot.lotNo}`,
      message: `Lot ${row.lot.lotNo} holds ${packetCount} scanned packet(s), worth ${formatWeight(
        row.derived.kachuWeight
      )} ct rough. What should happen to them?`,
      // The safe choice is the primary one, so Enter never destroys scan data.
      confirmLabel: "Move packets to Unassigned",
      onConfirm: () => run((state) => deleteLot(state, row.lot.id)),
      altLabel: "Delete lot and packets",
      onAlt: () =>
        run((state) => deleteLot(state, row.lot.id, { withPackets: true })),
    });
  };

  /* -------------------------------------------------------------- render */

  const renderEditableCell = (rowIndex, row, column, extraClass = "") => {
    const colIndex = editableIndex(column.key);
    const focused = cursor.isAt(rowIndex, colIndex);

    return (
      <td
        key={column.key}
        className={`entry ${column.align === "num" ? "num" : ""} ${
          focused ? "is-focused" : ""
        } ${extraClass}`}
      >
        <input
          ref={(element) => cursor.registerCell(rowIndex, colIndex, element)}
          className="sheet-input"
          type="text"
          inputMode={column.edit === "number" ? "decimal" : "text"}
          autoComplete="off"
          spellCheck="false"
          disabled={readOnly}
          value={cellText(rowIndex, row, column)}
          placeholder={column.edit === "date" ? "dd-mm-yyyy" : ""}
          onChange={(event) =>
            setDraft({ row: rowIndex, key: column.key, text: event.target.value })
          }
          onFocus={() => cursor.setCursorAt(rowIndex, colIndex)}
          onBlur={commitDraft}
          onKeyDown={(event) =>
            cursor.handleKeyDown(event, {
              commit: commitDraft,
              revert: revertDraft,
              fillDown,
              hasDraft: !!draft,
              undo: onUndo,
            })
          }
          aria-label={`Lot ${row.lot.lotNo} ${column.aria}`}
        />
      </td>
    );
  };

  return (
    <div className="lot-sheet">
      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  style={{ width: column.width }}
                  title={column.note}
                  className={`${column.align === "num" ? "num" : ""} ${
                    column.key === "lotNo" ? "stick-1" : ""
                  } ${column.key === "lotDate" ? "stick-2" : ""}`}
                >
                  <span className="th-guj">{column.guj}</span>
                  <small>{column.en}</small>
                </th>
              ))}
              <th className="stick-end" aria-label="Row actions" />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              const expanded = expandedLotId === row.lot.id;

              return (
                <React.Fragment key={row.lot.id}>
                  <tr
                    className={`${row.warnings.length ? "has-warning" : ""} ${
                      expanded ? "is-expanded" : ""
                    }`}
                  >
                    {COLUMNS.map((column) => {
                      if (column.key === "lotNo") {
                        return (
                          <td key={column.key} className="num stick-1 lot-no">
                            <button
                              type="button"
                              className="lot-expand"
                              onClick={() => onToggleLot(row.lot.id)}
                              title={`${row.packets.length} packet(s) in lot ${row.lot.lotNo}`}
                              aria-expanded={expanded}
                            >
                              {expanded ? (
                                <IconChevronDown size={12} />
                              ) : (
                                <IconChevronRight size={12} />
                              )}
                              {row.lot.lotNo}
                            </button>
                          </td>
                        );
                      }

                      if (column.edit) {
                        return renderEditableCell(
                          rowIndex,
                          row,
                          column,
                          column.key === "lotDate" ? "stick-2" : ""
                        );
                      }

                      return (
                        <td
                          key={column.key}
                          className={`derived ${column.align === "num" ? "num" : ""} ${
                            isNegative(column, row.derived) ? "is-negative" : ""
                          }`}
                        >
                          {derivedValue(column, row.derived)}
                        </td>
                      );
                    })}

                    <td className="stick-end action-cell">
                      {!readOnly && (
                        <button
                          type="button"
                          className="row-remove"
                          title={`Delete lot ${row.lot.lotNo}`}
                          onClick={() => handleDelete(row)}
                        >
                          <IconClose size={13} />
                        </button>
                      )}
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="packet-row">
                      <td colSpan={COLUMNS.length + 1}>
                        <PacketMover
                          packets={row.packets}
                          lots={lotTargets(rows)}
                          currentLotId={row.lot.id}
                          run={run}
                          onConfirm={onConfirm}
                          readOnly={readOnly}
                          emptyMessage={`No packets scanned into lot ${row.lot.lotNo} yet — its rough and polished weight stay at zero until one is.`}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/*
              The ghost row. Always present, and the + on it is the button that
              adds the lot - its two cells only carry values the new lot starts
              with, both of which are optional.
            */}
            {!readOnly && (
              <tr className="ghost-row">
                <td className="num stick-1 lot-no">
                  <button
                    type="button"
                    ref={addRef}
                    className="ghost-add"
                    onClick={commitGhost}
                    title={`Add lot ${nextLotNo}`}
                    aria-label={`Add lot ${nextLotNo}`}
                  >
                    <IconPlus size={13} />
                  </button>
                </td>
                <td className="stick-2">
                  <input
                    className="sheet-input"
                    type="text"
                    value={ghost.lotDate}
                    placeholder="today"
                    autoComplete="off"
                    onChange={(event) =>
                      setGhost((previous) => ({ ...previous, lotDate: event.target.value }))
                    }
                    onFocus={() => cursor.setCursorAt(rows.length, editableIndex("lotDate"))}
                    onKeyDown={(event) => cursor.handleKeyDown(event, { fillDown, isGhost: true, undo: onUndo })}
                    aria-label="New lot date"
                  />
                </td>
                <td className="derived num">{BLANK}</td>
                <td className="derived num">{BLANK}</td>
                <td className="num">
                  {/* Not the primary field any more - the + is. Charmi is optional. */}
                  <input
                    className="sheet-input"
                    type="text"
                    inputMode="numeric"
                    value={ghost.charmi}
                    placeholder="charmi"
                    autoComplete="off"
                    onChange={(event) =>
                      setGhost((previous) => ({ ...previous, charmi: event.target.value }))
                    }
                    onFocus={() => cursor.setCursorAt(rows.length, editableIndex("charmi"))}
                    onKeyDown={(event) => cursor.handleKeyDown(event, { fillDown, isGhost: true, undo: onUndo })}
                    aria-label="New lot charmi"
                  />
                </td>
                <td className="ghost-hint" colSpan={COLUMNS.length - 5 + 1}>
                  Add lot {nextLotNo} with the + — its નંગ fills in as packets are
                  scanned into it
                </td>
              </tr>
            )}

            {!rows.length && (
              <tr className="empty-row">
                <td colSpan={COLUMNS.length + 1}>
                  <div className="empty-state">
                    <strong>No lots in this Kapan yet</strong>
                    <span>
                      Press the + in the row above to add one. Charmi and the date
                      carry down to the next lot, and each lot's નંગ counts itself up
                      as packets are scanned into it.
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
                <th className="stick-2">{rows.length} lots</th>
                <th className="num">{formatInt(totals.roughPcs)}</th>
                <th className="num">{formatWeight(totals.roughWeight)}</th>
                <th />
                <th className="num">{formatWeight(totals.polishedWeight)}</th>
                <th className="num">{formatPercent(totals.polishedPct)}</th>
                <th className="num">{formatInt(totals.returnPcs)}</th>
                <th className="num">{formatWeight(totals.returnWeight)}</th>
                <th className="num">{formatPercent(totals.returnPct)}</th>
                <th className="num">{formatPercent(totals.ghatPct)}</th>
                <th className="num">{formatInt(totals.outstandingPcs)}</th>
                <th />
                <th className="stick-end" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="sheet-hint">
        <span>
          <kbd>Tab</kbd> next cell
        </span>
        <span>
          <kbd>Enter</kbd> save and down
        </span>
        <span>
          <kbd>Ctrl</kbd>+<kbd>D</kbd> copy from above
        </span>
        <span>
          <kbd>Esc</kbd> undo this cell
        </span>
        <span>
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo the last change
        </span>
        <span className="muted">
          Type <code>+12</code> in a return cell to add to what is already there
        </span>
        <span className="muted">
          Each scan adds one to its lot's નંગ — correct it here if it drifts
        </span>
      </p>
    </div>
  );
};

export default LotSheet;
