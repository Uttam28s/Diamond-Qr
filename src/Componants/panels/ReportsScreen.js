import React, { useMemo, useState } from "react";
import { IconChevronDown, IconDownload, IconReports } from "../Icons";
import { downloadCsv, getDateKey } from "../utils";
import { ALL_SEASONS, selectSeasons } from "../../domain/selectors";
import {
  allLots,
  bestWorstLots,
  dailyProduction,
  emptyFilter,
  kapanComparison,
  lossReport,
  packetLog,
  REPORTS,
  returnsPending,
  seasonSheetRows,
  seasonSummary,
  sheetRows,
  yieldBySieve,
} from "../../domain/reports";
import {
  BLANK,
  formatDateTime,
  formatDay,
  formatInt,
  formatPercent,
  formatSize,
  formatWeight,
} from "../../domain/format";
import { parseDateEntry } from "../../domain/entry";

/**
 * One screen, every report.
 *
 * The filter bar sits above the rail and stays put when the report changes, so
 * comparing two views of the same period does not mean setting the dates twice.
 * Every report exports from the same button.
 */

const FORMAT = {
  weight: formatWeight,
  percent: formatPercent,
  size: formatSize,
  day: formatDay,
  int: formatInt,
};

/** Groups the rail entries in declaration order without hard-coding the groups. */
const railGroups = () => {
  const groups = [];
  REPORTS.forEach((report) => {
    const last = groups[groups.length - 1];
    if (last && last.name === report.group) last.items.push(report);
    else groups.push({ name: report.group, items: [report] });
  });
  return groups;
};

const Tile = ({ label, value, unit, tone }) => (
  <div className={`kstat ${tone ? `tone-${tone}` : ""}`}>
    <span className="kstat-key">
      <span className="kstat-guj">{label}</span>
    </span>
    <span className="kstat-value">
      {value}
      {unit ? <em>{unit}</em> : null}
    </span>
  </div>
);

const Empty = ({ children }) => (
  <div className="empty-state">
    <IconReports size={26} />
    <strong>Nothing to show</strong>
    <span>{children}</span>
  </div>
);

/** A bar whose width is a percentage of the largest value in the report. */
const Bar = ({ value, max }) => (
  <div className="bar-track">
    <div
      className="bar-fill"
      style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }}
    />
  </div>
);

const ReportsScreen = ({ state }) => {
  const [active, setActive] = useState("season");
  const [filter, setFilter] = useState(emptyFilter);
  const [dateDraft, setDateDraft] = useState({ from: "", to: "" });
  const [sheetKapanId, setSheetKapanId] = useState("");

  const seasons = useMemo(() => selectSeasons(state), [state]);
  const kapanOptions = useMemo(
    () =>
      seasonSummary(state, { ...filter, from: "", to: "" }).rows.map((row) => row.kapan),
    [state, filter]
  );

  const set = (patch) => setFilter((current) => ({ ...current, ...patch }));

  /** Dates are typed here too, same shorthand as the sheet. */
  const commitDate = (which, text) => {
    setDateDraft((current) => ({ ...current, [which]: text }));
    const parsed = parseDateEntry(text);
    if (parsed.ok) set({ [which]: parsed.value || "" });
  };

  const report = useMemo(() => {
    switch (active) {
      case "comparison":
        return kapanComparison(state, filter);
      case "lots":
        return allLots(state, filter);
      case "sieve":
        return yieldBySieve(state, filter);
      case "extremes":
        return bestWorstLots(state, filter);
      case "pending":
        return returnsPending(state, filter);
      case "loss":
        return lossReport(state, filter);
      case "daily":
        return dailyProduction(state, filter);
      case "packets":
        return packetLog(state, filter);
      default:
        return seasonSummary(state, filter);
    }
  }, [active, state, filter]);

  /* ------------------------------------------------------------- exports */

  const exportCsv = () => {
    const stamp = getDateKey();

    if (active === "sheet") {
      const rows = sheetKapanId
        ? sheetRows(state, sheetKapanId, FORMAT)
        : seasonSheetRows(state, filter, FORMAT);
      const name = sheetKapanId
        ? `kapan-${(state.kapans[sheetKapanId] || {}).number || "sheet"}-${stamp}.csv`
        : `season-sheet-${stamp}.csv`;
      downloadCsv(name, rows);
      return;
    }

    downloadCsv(`${active}-${stamp}.csv`, csvFor(active, report, state));
  };

  const groups = railGroups();
  const chosen = REPORTS.find((entry) => entry.key === active) || REPORTS[0];

  return (
    <div className="screen-stack">
      <div className="report-filter">
        <label className="select-wrap">
          <select
            value={filter.season}
            onChange={(event) => set({ season: event.target.value })}
            aria-label="Season"
          >
            <option value={ALL_SEASONS}>All seasons</option>
            {seasons.map((season) => (
              <option value={season} key={season}>
                {season}
              </option>
            ))}
          </select>
          <IconChevronDown size={14} />
        </label>

        <label className="select-wrap">
          <select
            value={filter.kapanId}
            onChange={(event) => set({ kapanId: event.target.value })}
            aria-label="Kapan"
          >
            <option value="">All Kapans</option>
            {kapanOptions.map((kapan) => (
              <option value={kapan.id} key={kapan.id}>
                Kapan {kapan.number}
              </option>
            ))}
          </select>
          <IconChevronDown size={14} />
        </label>

        <span className="filter-dates">
          <label htmlFor="report-from">From</label>
          <input
            id="report-from"
            className="text-input tiny"
            value={dateDraft.from}
            placeholder="any"
            onChange={(event) => commitDate("from", event.target.value)}
          />
          <label htmlFor="report-to">to</label>
          <input
            id="report-to"
            className="text-input tiny"
            value={dateDraft.to}
            placeholder="any"
            onChange={(event) => commitDate("to", event.target.value)}
          />
          {(filter.from || filter.to) && (
            <button
              type="button"
              className="button ghost small"
              onClick={() => {
                setDateDraft({ from: "", to: "" });
                set({ from: "", to: "" });
              }}
            >
              Clear
            </button>
          )}
        </span>

        <span className="filter-spacer" />

        <button type="button" className="button primary small" onClick={exportCsv}>
          <IconDownload size={15} />
          Export CSV
        </button>
      </div>

      <div className="report-layout">
        <nav className="report-rail" aria-label="Reports">
          {groups.map((group) => (
            <React.Fragment key={group.name}>
              <p className="rail-group">{group.name}</p>
              {group.items.map((entry) => (
                <button
                  type="button"
                  key={entry.key}
                  className={`rail-item ${active === entry.key ? "is-active" : ""}`}
                  aria-current={active === entry.key ? "true" : undefined}
                  onClick={() => setActive(entry.key)}
                >
                  <b>{entry.label}</b>
                  <small>{entry.hint}</small>
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <section className="panel report-main" aria-label={chosen.label}>
          <header className="panel-head">
            <h3>{chosen.label}</h3>
            <div className="panel-tools">
              <span className="muted small">
                {filter.season === ALL_SEASONS ? "All seasons" : filter.season}
                {filter.from || filter.to
                  ? ` · ${filter.from ? formatDay(filter.from) : "start"} to ${
                      filter.to ? formatDay(filter.to) : "today"
                    }`
                  : ""}
              </span>
            </div>
          </header>

          <div className="report-body">
            <ReportView
              active={active}
              report={report}
              state={state}
              filter={filter}
              sheetKapanId={sheetKapanId}
              onSheetKapanChange={setSheetKapanId}
              kapanOptions={kapanOptions}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

/* ==================================================================== views */

const ReportView = ({
  active,
  report,
  state,
  filter,
  sheetKapanId,
  onSheetKapanChange,
  kapanOptions,
}) => {
  switch (active) {
    case "season":
    case "comparison":
      return <KapanTable report={report} />;
    case "lots":
      return <LotTable rows={report.rows} totals={report.totals} />;
    case "sieve":
      return <SieveTable report={report} />;
    case "extremes":
      return <ExtremesTable report={report} />;
    case "pending":
      return <PendingTable report={report} />;
    case "loss":
      return <LossTable report={report} />;
    case "daily":
      return <DailyTable report={report} />;
    case "packets":
      return <PacketLogTable report={report} />;
    default:
      return (
        <SheetPreview
          state={state}
          filter={filter}
          sheetKapanId={sheetKapanId}
          onSheetKapanChange={onSheetKapanChange}
          kapanOptions={kapanOptions}
        />
      );
  }
};

const KapanTable = ({ report }) => {
  if (!report.rows.length) return <Empty>No Kapan falls inside this filter.</Empty>;

  const max = report.rows.reduce(
    (top, row) => Math.max(top, row.totals.polishedPct),
    0
  );

  return (
    <>
      <div className="kstat-strip report-tiles">
        <Tile label="Kapans" value={report.totals.kapanCount} />
        <Tile label="Lots" value={report.totals.lotCount} />
        <Tile label="Rough" value={formatWeight(report.totals.roughWeight)} unit="ct" />
        <Tile
          label="Polished"
          value={formatWeight(report.totals.polishedWeight)}
          unit="ct"
          tone="accent"
        />
        <Tile
          label="Yield"
          value={formatPercent(report.totals.polishedPct)}
          unit="%"
          tone="accent"
        />
        <Tile
          label="Missing pcs"
          value={formatInt(report.totals.missingPcs)}
          tone="warn"
        />
      </div>

      <div className="sheet-scroll">
        <table className="sheet-table report-table">
          <thead>
            <tr>
              <th className="stick-1">Kapan</th>
              <th>Created</th>
              <th className="num">Lots</th>
              <th className="num">Rough ct</th>
              <th className="num">Polished ct</th>
              <th className="num">Yield %</th>
              <th style={{ minWidth: 120 }} aria-label="Yield bar" />
              <th className="num">Ret %</th>
              <th className="num">Ghat ct</th>
              <th className="num">Missing</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map(({ kapan, totals }) => (
              <tr key={kapan.id}>
                <td className="stick-1 kapan-cell">{kapan.number}</td>
                <td>{formatDay(kapan.createdAt)}</td>
                <td className="num">{totals.lotCount}</td>
                <td className="num">{formatWeight(totals.roughWeight)}</td>
                <td className="num">{formatWeight(totals.polishedWeight)}</td>
                <td className="num">{formatPercent(totals.polishedPct)}</td>
                <td>
                  <Bar value={totals.polishedPct} max={max} />
                </td>
                <td className="num">{formatPercent(totals.returnPct)}</td>
                <td className="num">{formatWeight(totals.ghatWeight)}</td>
                <td className="num">{formatInt(totals.missingPcs)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="stick-1">Σ</th>
              <th>{report.totals.kapanCount} Kapans</th>
              <th className="num">{report.totals.lotCount}</th>
              <th className="num">{formatWeight(report.totals.roughWeight)}</th>
              <th className="num">{formatWeight(report.totals.polishedWeight)}</th>
              <th className="num">{formatPercent(report.totals.polishedPct)}</th>
              <th />
              <th className="num">{formatPercent(report.totals.returnPct)}</th>
              <th className="num">{formatWeight(report.totals.ghatWeight)}</th>
              <th className="num">{formatInt(report.totals.missingPcs)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
};

/** The full thirteen columns, read-only, across whatever the filter selected. */
const LotTable = ({ rows, totals, extraHead, extraCell }) => {
  if (!rows.length) return <Empty>No lot falls inside this filter.</Empty>;

  return (
    <div className="sheet-scroll">
      <table className="sheet-table report-table">
        <thead>
          <tr>
            <th className="stick-1">Kapan</th>
            <th className="num">લોટ</th>
            <th>તારીખ</th>
            <th className="num">નંગ</th>
            <th className="num">વજન</th>
            <th className="num">સારણી</th>
            <th className="num">તૈયાર વ.</th>
            <th className="num">ટકાવારી</th>
            <th className="num">જ. નંગ</th>
            <th className="num">જ.વજન</th>
            <th className="num">જ.ટકાવારી</th>
            <th className="num">ઘટ</th>
            <th className="num">બા. નંગ</th>
            {extraHead}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ kapan, lot, derived, daysOut }) => (
            <tr key={lot.id}>
              <td className="stick-1 kapan-cell">{kapan.number}</td>
              <td className="num">{lot.lotNo}</td>
              <td>{formatDay(lot.lotDate)}</td>
              <td className="num">{derived.pcs === null ? BLANK : derived.pcs}</td>
              <td className="num">{formatWeight(derived.kachuWeight)}</td>
              <td className="num">{derived.charmi === null ? BLANK : derived.charmi}</td>
              <td className="num">{formatWeight(derived.polishedWeight)}</td>
              <td className="num">{formatPercent(derived.polishedPct)}</td>
              <td className="num">
                {derived.returnPcs === null ? BLANK : derived.returnPcs}
              </td>
              <td className="num">
                {derived.returnWeight === null ? BLANK : formatWeight(derived.returnWeight)}
              </td>
              <td className="num">{formatPercent(derived.returnPct)}</td>
              <td className={`num ${derived.ghatPct < 0 ? "is-negative" : ""}`}>
                {formatPercent(derived.ghatPct)}
              </td>
              <td className="num">
                {derived.remainingPcs === null ? BLANK : derived.remainingPcs}
              </td>
              {extraCell ? extraCell({ lot, derived, daysOut }) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="stick-1">Σ</th>
            <th className="num">{totals.lotCount}</th>
            <th />
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
            {extraHead ? <th /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const SieveTable = ({ report }) => {
  if (!report.rows.length) {
    return <Empty>No lot in this filter has a charmi recorded.</Empty>;
  }

  return (
    <>
      <p className="report-note">
        Weighted by carat, not averaged across rows — with groups this different in
        size, a plain mean would let one lot count for as much as fourteen.
      </p>

      <div className="sheet-scroll">
        <table className="sheet-table report-table">
          <thead>
            <tr>
              <th className="stick-1 num">સારણી</th>
              <th className="num">Lots</th>
              <th className="num">Rough ct</th>
              <th className="num">Polished ct</th>
              <th className="num">Yield %</th>
              <th style={{ minWidth: 180 }} aria-label="Yield bar" />
              <th className="num">Row average %</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.charmi}>
                <td className="stick-1 num kapan-cell">{row.charmi}</td>
                <td className="num">{row.lotCount}</td>
                <td className="num">{formatWeight(row.kachuWeight)}</td>
                <td className="num">{formatWeight(row.polishedWeight)}</td>
                <td className="num">{formatPercent(row.polishedPct)}</td>
                <td>
                  <Bar value={row.polishedPct} max={report.maxPct} />
                </td>
                <td className="num muted">{formatPercent(row.meanLotPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const ExtremesTable = ({ report }) => {
  if (!report.ranked.length) {
    return <Empty>No lot in this filter has anything scanned into it yet.</Empty>;
  }

  const rows = (list) =>
    list.map(({ kapan, lot, derived }) => (
      <tr key={lot.id}>
        <td className="kapan-cell">{kapan.number}</td>
        <td className="num">{lot.lotNo}</td>
        <td className="num">{derived.charmi === null ? BLANK : derived.charmi}</td>
        <td className="num">{formatWeight(derived.kachuWeight)}</td>
        <td className="num">{formatWeight(derived.polishedWeight)}</td>
        <td className="num">{formatPercent(derived.polishedPct)}</td>
      </tr>
    ));

  const head = (
    <tr>
      <th>Kapan</th>
      <th className="num">Lot</th>
      <th className="num">સારણી</th>
      <th className="num">Rough</th>
      <th className="num">Polished</th>
      <th className="num">Yield %</th>
    </tr>
  );

  return (
    <div className="two-report-grid">
      <div>
        <h4 className="report-sub">Best {report.best.length}</h4>
        <table className="sheet-table report-table">
          <thead>{head}</thead>
          <tbody>{rows(report.best)}</tbody>
        </table>
      </div>
      <div>
        <h4 className="report-sub">Worst {report.worst.length}</h4>
        <table className="sheet-table report-table">
          <thead>{head}</thead>
          <tbody>{rows(report.worst)}</tbody>
        </table>
      </div>
    </div>
  );
};

const PendingTable = ({ report }) => {
  if (!report.rows.length) {
    return <Empty>Every lot in this filter has its returns entered.</Empty>;
  }

  return (
    <>
      <p className="report-note">
        {report.rows.length} lot(s) still out, longest first. Enter the returns on
        the Returns screen.
      </p>
      <LotTable
        rows={report.rows}
        totals={report.totals}
        extraHead={<th className="num">Days out</th>}
        extraCell={({ daysOut }) => (
          <td className={`num ${daysOut > 30 ? "is-negative" : ""}`}>
            {daysOut === null ? BLANK : daysOut}
          </td>
        )}
      />
    </>
  );
};

const LossTable = ({ report }) => {
  if (!report.rows.length) {
    return <Empty>No lot in this filter has its returns entered yet.</Empty>;
  }

  return (
    <>
      <div className="kstat-strip report-tiles">
        <Tile label="Lots with returns in" value={report.totals.lotsWithReturns} />
        <Tile label="Pcs sent out" value={formatInt(report.totals.missingPcsBase)} />
        <Tile label="Pcs returned" value={formatInt(report.totals.returnPcs)} />
        <Tile label="Missing" value={formatInt(report.totals.missingPcs)} tone="warn" />
        <Tile
          label="Missing %"
          value={formatPercent(report.totals.missingPct)}
          unit="%"
          tone="warn"
        />
      </div>

      <p className="report-note">
        Only lots whose returns have been entered can be missing anything — a lot
        still out with the workers is outstanding, not lost.
      </p>

      <div className="sheet-scroll">
        <table className="sheet-table report-table">
          <thead>
            <tr>
              <th className="stick-1">Kapan</th>
              <th className="num">Lot</th>
              <th>Date</th>
              <th className="num">Out</th>
              <th className="num">Back</th>
              <th className="num">Missing</th>
              <th className="num">Missing %</th>
              <th>Returned</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map(({ kapan, lot, derived }) => (
              <tr key={lot.id}>
                <td className="stick-1 kapan-cell">{kapan.number}</td>
                <td className="num">{lot.lotNo}</td>
                <td>{formatDay(lot.lotDate)}</td>
                <td className="num">{derived.pcs === null ? BLANK : derived.pcs}</td>
                <td className="num">{derived.returnPcs || 0}</td>
                <td className="num">{derived.missingPcs}</td>
                <td className={`num ${derived.missingPct > 3 ? "is-negative" : ""}`}>
                  {formatPercent(derived.missingPct)}
                </td>
                <td>{formatDay(lot.returnDate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="stick-1">Σ</th>
              <th className="num">{report.totals.lotsWithReturns}</th>
              <th />
              <th className="num">{formatInt(report.totals.missingPcsBase)}</th>
              <th className="num">{formatInt(report.totals.returnPcs)}</th>
              <th className="num">{formatInt(report.totals.missingPcs)}</th>
              <th className="num">{formatPercent(report.totals.missingPct)}</th>
              <th />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
};

const DailyTable = ({ report }) => {
  if (!report.rows.length) return <Empty>No packets scanned inside this filter.</Empty>;

  const max = report.rows.reduce((top, row) => Math.max(top, row.kachuWeight), 0);

  return (
    <div className="sheet-scroll">
      <table className="sheet-table report-table">
        <thead>
          <tr>
            <th className="stick-1">Scan date</th>
            <th className="num">Packets</th>
            <th className="num">Rough ct</th>
            <th style={{ minWidth: 160 }} aria-label="Rough bar" />
            <th className="num">Polished ct</th>
            <th className="num">Yield %</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.dateKey}>
              <td className="stick-1">{formatDay(row.dateKey)}</td>
              <td className="num">{formatInt(row.count)}</td>
              <td className="num">{formatWeight(row.kachuWeight)}</td>
              <td>
                <Bar value={row.kachuWeight} max={max} />
              </td>
              <td className="num">{formatWeight(row.polishedWeight)}</td>
              <td className="num">{formatPercent(row.polishedPct)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="stick-1">Σ</th>
            <th className="num">{formatInt(report.totals.count)}</th>
            <th className="num">{formatWeight(report.totals.kachuWeight)}</th>
            <th />
            <th className="num">{formatWeight(report.totals.polishedWeight)}</th>
            <th className="num">{formatPercent(report.totals.polishedPct)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const PacketLogTable = ({ report }) => {
  if (!report.rows.length) return <Empty>No packets scanned inside this filter.</Empty>;

  return (
    <>
      <p className="report-note">
        Every scan, newest first — the audit trail for when a figure looks wrong.
      </p>
      <div className="sheet-scroll">
        <table className="sheet-table report-table">
          <thead>
            <tr>
              <th className="stick-1">Kapan</th>
              <th className="num">Lot</th>
              <th>Scanned</th>
              <th>Code</th>
              <th className="num">Kachu ct</th>
              <th className="num">Polished ct</th>
              <th className="num">Yield %</th>
              <th>PC</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map(({ kapan, lot, packet, polishedPct }) => (
              <tr key={packet.id}>
                <td className="stick-1 kapan-cell">{kapan.number}</td>
                <td className="num">{lot ? lot.lotNo : <span className="muted">—</span>}</td>
                <td>{formatDateTime(packet.scannedAt)}</td>
                <td className="code-cell" title={packet.rawCode}>
                  {packet.rawCode || BLANK}
                </td>
                <td className="num">{formatWeight(packet.kachuWeight)}</td>
                <td className="num">{formatWeight(packet.polishedWeight)}</td>
                <td className="num">{formatPercent(polishedPct)}</td>
                <td className="muted">{packet.scannedOn || BLANK}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const SheetPreview = ({ state, filter, sheetKapanId, onSheetKapanChange, kapanOptions }) => {
  const rows = useMemo(
    () =>
      sheetKapanId
        ? sheetRows(state, sheetKapanId, FORMAT)
        : seasonSheetRows(state, filter, FORMAT),
    [state, filter, sheetKapanId]
  );

  return (
    <>
      <div className="mover-bar">
        <span className="mover-count">
          Exports in your workbook's own shape — the header block, then the thirteen
          columns. Opens in Excel looking like the file it replaces.
        </span>
        <label className="select-wrap">
          <select
            value={sheetKapanId}
            onChange={(event) => onSheetKapanChange(event.target.value)}
            aria-label="Which Kapan to export"
          >
            <option value="">Whole season, one block each</option>
            {kapanOptions.map((kapan) => (
              <option value={kapan.id} key={kapan.id}>
                Kapan {kapan.number} only
              </option>
            ))}
          </select>
          <IconChevronDown size={14} />
        </label>
      </div>

      {!rows.length ? (
        <Empty>No Kapan falls inside this filter.</Empty>
      ) : (
        <div className="sheet-scroll">
          <table className="sheet-table sheet-preview">
            <tbody>
              {rows.slice(0, 60).map((row, index) => (
                // Row position is the only identity a spreadsheet row has.
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index} className={row.length ? "" : "spacer-row"}>
                  {row.length ? (
                    row.map((cell, cellIndex) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <td key={cellIndex} className={typeof cell === "number" ? "num" : ""}>
                        {cell}
                      </td>
                    ))
                  ) : (
                    <td>&nbsp;</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 60 && (
            <p className="report-note">
              Showing the first 60 rows of {rows.length}. The export contains all of
              them.
            </p>
          )}
        </div>
      )}
    </>
  );
};

/* ==================================================================== csv */

/** CSV rows for whichever report is on screen, matching what it displays. */
const csvFor = (active, report, state) => {
  const lotHead = [
    "Kapan",
    "Lot",
    "Date",
    "Pcs",
    "Rough ct",
    "Charmi",
    "Polished ct",
    "Polished %",
    "Return pcs",
    "Return ct",
    "Return %",
    "Ghat %",
    "Remaining",
  ];

  const lotRow = ({ kapan, lot, derived }) => [
    kapan.number,
    lot.lotNo,
    formatDay(lot.lotDate),
    derived.pcs === null ? "" : derived.pcs,
    formatWeight(derived.kachuWeight),
    derived.charmi === null ? "" : derived.charmi,
    formatWeight(derived.polishedWeight),
    formatPercent(derived.polishedPct),
    derived.returnPcs === null ? "" : derived.returnPcs,
    derived.returnWeight === null ? "" : formatWeight(derived.returnWeight),
    formatPercent(derived.returnPct),
    formatPercent(derived.ghatPct),
    derived.remainingPcs === null ? "" : derived.remainingPcs,
  ];

  switch (active) {
    case "season":
    case "comparison":
      return [
        [
          "Kapan",
          "Season",
          "Created",
          "Lots",
          "Rough pcs",
          "Rough ct",
          "Polished ct",
          "Polished %",
          "Return pcs",
          "Return ct",
          "Return %",
          "Ghat ct",
          "Ghat %",
          "Outstanding pcs",
          "Missing pcs",
        ],
        ...report.rows.map(({ kapan, totals }) => [
          kapan.number,
          kapan.season,
          formatDay(kapan.createdAt),
          totals.lotCount,
          totals.roughPcs,
          formatWeight(totals.roughWeight),
          formatWeight(totals.polishedWeight),
          formatPercent(totals.polishedPct),
          totals.returnPcs,
          formatWeight(totals.returnWeight),
          formatPercent(totals.returnPct),
          formatWeight(totals.ghatWeight),
          formatPercent(totals.ghatPct),
          totals.outstandingPcs,
          totals.missingPcs,
        ]),
      ];

    case "lots":
      return [lotHead, ...report.rows.map(lotRow)];

    case "pending":
      return [
        [...lotHead, "Days out"],
        ...report.rows.map((row) => [...lotRow(row), row.daysOut === null ? "" : row.daysOut]),
      ];

    case "sieve":
      return [
        ["Charmi", "Lots", "Rough ct", "Polished ct", "Yield % (weighted)", "Row average %"],
        ...report.rows.map((row) => [
          row.charmi,
          row.lotCount,
          formatWeight(row.kachuWeight),
          formatWeight(row.polishedWeight),
          formatPercent(row.polishedPct),
          formatPercent(row.meanLotPct),
        ]),
      ];

    case "extremes":
      return [
        ["Rank", "Kapan", "Lot", "Charmi", "Rough ct", "Polished ct", "Yield %"],
        ...report.ranked.map((row, index) => [
          index + 1,
          row.kapan.number,
          row.lot.lotNo,
          row.derived.charmi === null ? "" : row.derived.charmi,
          formatWeight(row.derived.kachuWeight),
          formatWeight(row.derived.polishedWeight),
          formatPercent(row.derived.polishedPct),
        ]),
      ];

    case "loss":
      return [
        ["Kapan", "Lot", "Date", "Pcs out", "Pcs back", "Missing", "Missing %", "Returned"],
        ...report.rows.map(({ kapan, lot, derived }) => [
          kapan.number,
          lot.lotNo,
          formatDay(lot.lotDate),
          derived.pcs === null ? "" : derived.pcs,
          derived.returnPcs || 0,
          derived.missingPcs,
          formatPercent(derived.missingPct),
          formatDay(lot.returnDate),
        ]),
        [],
        [
          "Total",
          report.totals.lotsWithReturns,
          "",
          report.totals.missingPcsBase,
          report.totals.returnPcs,
          report.totals.missingPcs,
          formatPercent(report.totals.missingPct),
          "",
        ],
      ];

    case "daily":
      return [
        ["Scan date", "Packets", "Rough ct", "Polished ct", "Yield %"],
        ...report.rows.map((row) => [
          formatDay(row.dateKey),
          row.count,
          formatWeight(row.kachuWeight),
          formatWeight(row.polishedWeight),
          formatPercent(row.polishedPct),
        ]),
      ];

    case "packets":
      return [
        ["Kapan", "Lot", "Scanned", "Code", "Kachu ct", "Polished ct", "Yield %", "PC"],
        ...report.rows.map(({ kapan, lot, packet, polishedPct }) => [
          kapan.number,
          lot ? lot.lotNo : "unassigned",
          formatDateTime(packet.scannedAt),
          packet.rawCode,
          formatWeight(packet.kachuWeight),
          formatWeight(packet.polishedWeight),
          formatPercent(polishedPct),
          packet.scannedOn,
        ]),
      ];

    default:
      return [["Nothing to export"]];
  }
};

export default ReportsScreen;
export { csvFor };
