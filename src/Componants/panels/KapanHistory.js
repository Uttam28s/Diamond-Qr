import React, { useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconFilter,
  IconKapans,
  IconSearch,
} from "../Icons";
import Cols from "./Cols";
import { formatDateTimeShort, formatNumber } from "../utils";

const COLS = [19, 17.5, 19.3, 9.2, 19.5, 11, 4.5];

export const SORT_OPTIONS = [
  { key: "recent", label: "Last scan (newest first)" },
  { key: "number", label: "Kapan number (A → Z)" },
  { key: "yield", label: "Highest yield %" },
  { key: "rough", label: "Highest rough weight" },
];

const SortMenu = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDocumentClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className="sort-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`icon-button ${open ? "is-open" : ""}`}
        title="Sort Kapans"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <IconFilter size={17} />
      </button>

      {open && (
        <div className="sort-menu" role="menu">
          <p className="sort-menu-title">Sort by</p>
          {SORT_OPTIONS.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === option.key}
              key={option.key}
              className={value === option.key ? "is-active" : ""}
              onClick={() => {
                onChange(option.key);
                setOpen(false);
              }}
            >
              <span className="sort-menu-check">
                {value === option.key && <IconCheck size={14} />}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Pagination = ({ page, pageCount, onChange }) => {
  if (pageCount <= 1) return null;

  const windowSize = 3;
  let start = Math.max(1, Math.min(page - 1, pageCount - windowSize + 1));
  if (start < 1) start = 1;
  const pages = [];
  for (let index = start; index < start + windowSize && index <= pageCount; index += 1) {
    pages.push(index);
  }

  return (
    <div className="pagination">
      {page > 1 && (
        <>
          <button
            type="button"
            className="page-button"
            title="First page"
            onClick={() => onChange(1)}
          >
            <IconChevronsLeft size={14} />
          </button>
          <button
            type="button"
            className="page-button"
            title="Previous page"
            onClick={() => onChange(page - 1)}
          >
            <IconChevronLeft size={14} />
          </button>
        </>
      )}

      {pages.map((pageNumber) => (
        <button
          type="button"
          key={pageNumber}
          className={`page-button ${pageNumber === page ? "is-active" : ""}`}
          onClick={() => onChange(pageNumber)}
        >
          {pageNumber}
        </button>
      ))}

      {page < pageCount && (
        <>
          <button
            type="button"
            className="page-button"
            title="Next page"
            onClick={() => onChange(page + 1)}
          >
            <IconChevronRight size={14} />
          </button>
          <button
            type="button"
            className="page-button"
            title="Last page"
            onClick={() => onChange(pageCount)}
          >
            <IconChevronsRight size={14} />
          </button>
        </>
      )}
    </div>
  );
};

const KapanHistory = ({
  rows,
  totalCount,
  selectedKapan,
  onSelect,
  search,
  onSearchChange,
  sort,
  onSortChange,
  page,
  pageCount,
  onPageChange,
  className = "",
}) => (
  <section className={`panel kapan-history ${className}`} aria-label="Kapan history">
    <header className="panel-head">
      <h3>Kapan History</h3>
      <div className="panel-tools">
        <div className="search-input">
          <IconSearch size={15} />
          <input
            type="search"
            value={search}
            placeholder="Search Kapan Number..."
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <SortMenu value={sort} onChange={onSortChange} />
      </div>
    </header>

    <div className="table-scroll">
      <table className="data-table selectable">
        <Cols widths={COLS} />
        <thead>
          <tr>
            <th>Kapan Number</th>
            <th className="num">Total Rough (ct)</th>
            <th className="num">Total Polished (ct)</th>
            <th className="num">Yield %</th>
            <th>Last Scan Date</th>
            <th className="num">Records</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {rows.map((kapan) => (
            <tr
              key={kapan.kapanNumber}
              className={selectedKapan === kapan.kapanNumber ? "is-selected" : ""}
              onClick={() => onSelect(kapan.kapanNumber)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(kapan.kapanNumber);
                }
              }}
            >
              <td className="kapan-cell">{kapan.kapanNumber}</td>
              <td className="num">{formatNumber(kapan.totals.kWeight)}</td>
              <td className="num">{formatNumber(kapan.totals.pWeight)}</td>
              <td className="num">{kapan.totals.percentage}</td>
              <td>{formatDateTimeShort(kapan.lastScanAt)}</td>
              <td className="num">{kapan.recordCount}</td>
              <td className="action-cell">
                <IconChevronRight size={15} />
              </td>
            </tr>
          ))}

          {!rows.length && (
            <tr className="empty-row">
              <td colSpan={7}>
                <div className="empty-state">
                  <IconKapans size={26} />
                  <strong>
                    {totalCount ? "No Kapan matches your search" : "No Kapans saved yet"}
                  </strong>
                  <span>
                    {totalCount
                      ? "Clear the search to see every Kapan."
                      : "Scan packets and use Save Records to create your first Kapan."}
                  </span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    <footer className="panel-foot">
      <span className="muted">Total Kapans: {totalCount}</span>
      <Pagination page={page} pageCount={pageCount} onChange={onPageChange} />
    </footer>
  </section>
);

export default KapanHistory;
