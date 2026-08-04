import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cursor and keyboard model for an editable sheet.
 *
 * The grid runs in **always-editing** mode: the focused cell is an input, and
 * moving the cursor moves focus into the next input. Excel makes you press Enter
 * or F2 to start typing, which is right for a spreadsheet you mostly read - this
 * grid exists to be typed into, and a mode switch on every cell would cost a
 * keystroke per value.
 *
 * The consequence is that ArrowLeft and ArrowRight belong to the caret inside
 * the input, so column movement is Tab and Shift+Tab. ArrowUp and ArrowDown
 * move rows, since a single-line input has nothing to do with them.
 *
 * Row index `rowCount` is the ghost row at the bottom of the sheet. The cursor
 * deliberately stays there after a row is created, so a run of lots is one
 * number and one Enter each.
 */
export const useSheetCursor = ({ rowCount, columnCount, onCommitGhost }) => {
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const cellRefs = useRef(new Map());
  // Set when a move is requested, so focus lands after React has rendered the
  // input that is being moved to.
  const pendingFocus = useRef(null);

  const ghostRow = rowCount;

  const cellKey = (row, col) => `${row}:${col}`;

  const registerCell = useCallback((row, col, element) => {
    const key = cellKey(row, col);
    if (element) cellRefs.current.set(key, element);
    else cellRefs.current.delete(key);
  }, []);

  const focusCell = useCallback((row, col) => {
    const element = cellRefs.current.get(cellKey(row, col));
    if (element) {
      element.focus();
      if (element.select) element.select();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const { row, col } = pendingFocus.current;
    pendingFocus.current = null;
    focusCell(row, col);
  });

  /**
   * When a row is added, the ghost row moves down by one - so a cursor sitting
   * on it has to follow, or the next Enter would be read as "commit row N" and
   * a run of lots would stop dead after the first one.
   */
  const lastRowCount = useRef(rowCount);
  useEffect(() => {
    const previousGhost = lastRowCount.current;
    lastRowCount.current = rowCount;

    if (rowCount > previousGhost) {
      setCursor((current) =>
        current.row === previousGhost ? { ...current, row: rowCount } : current
      );
    }
  }, [rowCount]);

  /**
   * Moves the cursor AND pulls focus there. For keyboard movement, where the
   * cell being left still has focus.
   */
  const moveTo = useCallback(
    (row, col) => {
      const clampedRow = Math.max(0, Math.min(row, ghostRow));
      const clampedCol = Math.max(0, Math.min(col, columnCount - 1));
      setCursor({ row: clampedRow, col: clampedCol });
      pendingFocus.current = { row: clampedRow, col: clampedCol };
    },
    [columnCount, ghostRow]
  );

  /**
   * Records where the cursor is without touching focus. This is what an onFocus
   * handler wants: the cell already has focus, and asking for it again would
   * queue a focus-and-select that lands *after* the first character has been
   * typed - selecting it, so the second character overwrites it and the value
   * silently loses its first digit.
   */
  const setCursorAt = useCallback((row, col) => {
    setCursor((current) =>
      current.row === row && current.col === col ? current : { row, col }
    );
  }, []);

  /** Next editable cell in reading order, wrapping onto the following row. */
  const moveNext = useCallback(
    (row, col) => {
      if (col < columnCount - 1) return moveTo(row, col + 1);
      // Tab off the end of the last row stops rather than creating a lot -
      // creating one is Enter's job, and it should never be a side effect of
      // moving around.
      if (row < ghostRow) return moveTo(row + 1, 0);
      return undefined;
    },
    [columnCount, ghostRow, moveTo]
  );

  const movePrevious = useCallback(
    (row, col) => {
      if (col > 0) return moveTo(row, col - 1);
      if (row > 0) return moveTo(row - 1, columnCount - 1);
      return undefined;
    },
    [columnCount, moveTo]
  );

  /**
   * @param event    the keyboard event from the focused input
   * @param handlers commit / revert / fillDown / isGhost, supplied by the sheet
   *
   * `isGhost` is passed explicitly by the ghost row rather than inferred by
   * comparing the cursor to the row count. Inferring it means a slow save - a
   * database write, or the network once the host arrives - can leave the cursor
   * a row behind, and Enter then reads as "commit row N" instead of "add a lot".
   * The row that knows it is the ghost row says so.
   */
  const handleKeyDown = useCallback(
    (event, handlers = {}) => {
      const { commit, revert, fillDown, isGhost } = handlers;
      const row = isGhost ? ghostRow : cursor.row;
      const col = cursor.col;

      if (event.key === "Escape") {
        event.preventDefault();
        if (revert) revert();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (isGhost) {
          // Creating a lot leaves the cursor exactly where it is, so the next
          // pcs value can be typed straight away.
          if (onCommitGhost) onCommitGhost();
          return;
        }
        if (commit) commit();
        moveTo(row + 1, col);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        if (commit) commit();
        if (event.shiftKey) movePrevious(row, col);
        else moveNext(row, col);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (commit) commit();
        moveTo(row - 1, col);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (commit) commit();
        moveTo(row + 1, col);
        return;
      }

      // Ctrl+D copies the cell above. Charmi and dates repeat down runs of lots,
      // and retyping them is the sort of thing this grid exists to avoid.
      if ((event.ctrlKey || event.metaKey) && (event.key === "d" || event.key === "D")) {
        event.preventDefault();
        if (fillDown) fillDown();
        return;
      }

      /**
       * Ctrl+Z. The sheet runs in always-editing mode, so focus is permanently
       * inside an input - which means the global binding would never fire here,
       * exactly where undo is wanted most. So the cell handles it:
       *
       *   half-typed cell -> revert the typing, same as Escape
       *   settled cell    -> undo the last change to the data
       *
       * Excel behaves this way and it is what anyone reaches for after deleting the
       * wrong row. `stopPropagation` keeps the window-level handler from firing too
       * and undoing twice.
       */
      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        event.stopPropagation();
        if (handlers.hasDraft && revert) revert();
        else if (handlers.undo) handlers.undo();
      }
    },
    [cursor, ghostRow, moveNext, movePrevious, moveTo, onCommitGhost]
  );

  return {
    cursor,
    ghostRow,
    isAt: (row, col) => cursor.row === row && cursor.col === col,
    moveTo,
    setCursorAt,
    registerCell,
    focusCell,
    handleKeyDown,
  };
};
