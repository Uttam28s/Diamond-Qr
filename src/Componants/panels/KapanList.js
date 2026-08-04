import React from "react";
import { IconChevronDown, IconKapans, IconPlus, IconSearch } from "../Icons";
import { ALL_SEASONS, KAPAN_SORTS } from "../../domain/selectors";
import { STATUS_LABELS, formatDay, formatInt, formatPercent, formatWeight } from "../../domain/format";

/**
 * Every Kapan, full width, with the figures that make it a season report rather
 * than a navigation list. Clicking a row opens its workbench.
 *
 * Fourteen columns do not fit a laptop, so the Kapan number stays pinned while
 * the rest scrolls - the same behaviour as the lot sheet, so the two screens
 * feel like one thing.
 */

const KapanList = ({
  rows,
  totals,
  unfilteredCount,
  seasons,
  season,
  onSeasonChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  onOpen,
  onNew,
  readOnly,
}) => (
  <section className="panel kapan-list-panel" aria-label="Kapans">
    <header className="panel-head">
      <h3>Kapans</h3>
      <div className="panel-tools">
        {!readOnly && (
          <button type="button" className="button primary small" onClick={onNew}>
            <IconPlus size={15} />
            New Kapan
          </button>
        )}

        <label className="select-wrap">
          <select
            value={season}
            onChange={(event) => onSeasonChange(event.target.value)}
            aria-label="Filter by season"
          >
            <option value={ALL_SEASONS}>All seasons</option>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <IconChevronDown size={15} />
        </label>

        <label className="select-wrap">
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
            aria-label="Sort Kapans"
          >
            {KAPAN_SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <IconChevronDown size={15} />
        </label>

        <div className="search-input">
          <IconSearch size={15} />
          <input
            type="search"
            value={search}
            placeholder="Kapan or season…"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
    </header>

    <div className="sheet-scroll">
      <table className="sheet-table kapan-table">
        <thead>
          <tr>
            <th className="stick-1" style={{ width: 92 }}>
              <span className="th-guj">કટ નંબર</span>
              <small>Kapan</small>
            </th>
            {/*
              Only the Kapan number is pinned here. Pinning Date as well needs
              its `left` offset to match the first column's rendered width
              exactly, and when the browser gives that column any slack the
              pinned cell overlaps and clips the column after it.
            */}
            <th style={{ width: 104 }}>
              <span className="th-guj">તારીખ</span>
              <small>Created</small>
            </th>
            <th style={{ width: 84 }}>
              <span className="th-guj">સીઝન</span>
              <small>Season</small>
            </th>
            <th className="num" style={{ width: 62 }}>
              <span className="th-guj">લોટ</span>
              <small>Lots</small>
            </th>
            <th className="num" style={{ width: 92 }}>
              <span className="th-guj">કા. નંગ</span>
              <small>Rough pcs</small>
            </th>
            <th className="num" style={{ width: 96 }}>
              <span className="th-guj">કા.વજન</span>
              <small>Rough ct</small>
            </th>
            <th className="num" style={{ width: 100 }}>
              <span className="th-guj">તૈયાર વજન</span>
              <small>Polished ct</small>
            </th>
            <th className="num" style={{ width: 78 }}>
              <span className="th-guj">ટકાવારી</span>
              <small>Pol %</small>
            </th>
            <th className="num" style={{ width: 88 }}>
              <span className="th-guj">તૈ. નંગ</span>
              <small>Ret pcs</small>
            </th>
            <th className="num" style={{ width: 92 }}>
              <span className="th-guj">તૈ.વજન</span>
              <small>Ret ct</small>
            </th>
            <th className="num" style={{ width: 78 }}>
              <span className="th-guj">ટકાવારી</span>
              <small>Ret %</small>
            </th>
            <th className="num" style={{ width: 94 }}>
              <span className="th-guj">ઘટ વજન</span>
              <small>Ghat ct</small>
            </th>
            <th className="num" style={{ width: 104 }}>
              <span className="th-guj">ઘટ નંગ</span>
              <small>Outstanding</small>
            </th>
            <th style={{ width: 116 }}>Status</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(({ kapan, totals: row }) => (
            <tr
              key={kapan.id}
              className="is-clickable"
              tabIndex={0}
              onClick={() => onOpen(kapan.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(kapan.id);
                }
              }}
            >
              <td className="stick-1 kapan-cell">{kapan.number}</td>
              <td>{formatDay(kapan.createdAt)}</td>
              <td>{kapan.season || "—"}</td>
              <td className="num">{row.lotCount}</td>
              <td className="num">{formatInt(row.roughPcs)}</td>
              <td className="num">{formatWeight(row.roughWeight)}</td>
              <td className="num">{formatWeight(row.polishedWeight)}</td>
              <td className="num">{formatPercent(row.polishedPct)}</td>
              <td className="num">{formatInt(row.returnPcs)}</td>
              <td className="num">{formatWeight(row.returnWeight)}</td>
              <td className="num">{formatPercent(row.returnPct)}</td>
              <td className="num">{formatWeight(row.ghatWeight)}</td>
              <td className="num">{formatInt(row.outstandingPcs)}</td>
              <td>
                <span className={`st st-${row.status}`}>
                  {row.status === "returns-due"
                    ? `${row.lotsAwaitingReturns} returns due`
                    : STATUS_LABELS[row.status]}
                </span>
              </td>
            </tr>
          ))}

          {!rows.length && (
            <tr className="empty-row">
              <td colSpan={14}>
                <div className="empty-state">
                  <IconKapans size={26} />
                  <strong>
                    {unfilteredCount
                      ? "No Kapan matches this filter"
                      : "No Kapans yet"}
                  </strong>
                  <span>
                    {unfilteredCount
                      ? "Clear the search or pick another season."
                      : "Create a Kapan, then add its lots in the sheet."}
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
              <th>{totals.kapanCount} Kapans</th>
              <th>{season === ALL_SEASONS ? "all" : season}</th>
              <th className="num">{totals.lotCount}</th>
              <th className="num">{formatInt(totals.roughPcs)}</th>
              <th className="num">{formatWeight(totals.roughWeight)}</th>
              <th className="num">{formatWeight(totals.polishedWeight)}</th>
              <th className="num">{formatPercent(totals.polishedPct)}</th>
              <th className="num">{formatInt(totals.returnPcs)}</th>
              <th className="num">{formatWeight(totals.returnWeight)}</th>
              <th className="num">{formatPercent(totals.returnPct)}</th>
              <th className="num">{formatWeight(totals.ghatWeight)}</th>
              <th className="num">{formatInt(totals.outstandingPcs)}</th>
              <th />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  </section>
);

export default KapanList;
