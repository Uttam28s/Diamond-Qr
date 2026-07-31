import React, { useMemo } from "react";
import Cols from "./Cols";
import { IconDiamond, IconDownload, IconDroplet, IconKapans, IconPercent, IconReports } from "../Icons";
import {
  calculateTotals,
  downloadCsv,
  formatDateTimeShort,
  formatDisplayDate,
  formatDisplayTime,
  formatNumber,
  getDateKey,
} from "../utils";

const SummaryTile = ({ tone, icon, label, value, unit }) => (
  <div className={`stat-card tone-${tone}`}>
    <span className="stat-icon">{icon}</span>
    <span className="stat-body">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit ? <em>{unit}</em> : null}
      </span>
    </span>
  </div>
);

const ReportsScreen = ({ kapanRows }) => {
  const allRecords = useMemo(
    () => kapanRows.flatMap((kapan) => kapan.records || []),
    [kapanRows]
  );
  const overall = useMemo(() => calculateTotals(allRecords), [allRecords]);

  const dailyRows = useMemo(() => {
    const byDate = new Map();

    allRecords.forEach((record) => {
      const key = record.scanDate || getDateKey(new Date(record.scannedAt));
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(record);
    });

    return [...byDate.entries()]
      .map(([dateKey, records]) => ({
        dateKey,
        records,
        totals: calculateTotals(records),
      }))
      .sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey));
  }, [allRecords]);

  const exportKapans = () => {
    const rows = [
      ["Kapan Number", "Total Rough (ct)", "Total Polished (ct)", "Yield %", "Records", "Last Scan"],
      ...kapanRows.map((kapan) => [
        kapan.kapanNumber,
        formatNumber(kapan.totals.kWeight),
        formatNumber(kapan.totals.pWeight),
        kapan.totals.percentage,
        kapan.recordCount,
        formatDateTimeShort(kapan.lastScanAt),
      ]),
      [],
      [
        "Total",
        formatNumber(overall.kWeight),
        formatNumber(overall.pWeight),
        overall.percentage,
        allRecords.length,
        "",
      ],
    ];
    downloadCsv(`kapan-summary-${getDateKey()}.csv`, rows);
  };

  const exportPackets = () => {
    const rows = [
      ["Kapan Number", "Scan Date", "Scan Time", "Scanned Code", "Kachu Weight (ct)", "Polished Weight (ct)", "Yield %"],
      ...kapanRows.flatMap((kapan) =>
        (kapan.records || []).map((record) => [
          kapan.kapanNumber,
          formatDisplayDate(record.scannedAt),
          formatDisplayTime(record.scannedAt),
          record.rawCode,
          formatNumber(record.kWeight),
          formatNumber(record.pWeight),
          record.percentage,
        ])
      ),
    ];
    downloadCsv(`packet-records-${getDateKey()}.csv`, rows);
  };

  return (
    <div className="screen-stack">
      <div className="stat-grid stat-grid-wide">
        <SummaryTile
          tone="slate"
          icon={<IconKapans size={19} />}
          label="Total Kapans"
          value={kapanRows.length}
        />
        <SummaryTile
          tone="slate"
          icon={<IconReports size={19} />}
          label="Total Packets"
          value={allRecords.length}
        />
        <SummaryTile
          tone="blue"
          icon={<IconDroplet size={19} />}
          label="Total Rough"
          value={formatNumber(overall.kWeight)}
          unit="ct"
        />
        <SummaryTile
          tone="teal"
          icon={<IconDiamond size={19} />}
          label="Total Polished"
          value={formatNumber(overall.pWeight)}
          unit="ct"
        />
        <SummaryTile
          tone="green"
          icon={<IconPercent size={18} />}
          label="Average Yield"
          value={overall.percentage}
          unit="%"
        />
      </div>

      <div className="report-grid">
        <section className="panel" aria-label="Kapan summary">
          <header className="panel-head">
            <h3>Kapan Summary</h3>
            <div className="panel-tools">
              <button
                type="button"
                className="button ghost small"
                onClick={exportKapans}
                disabled={!kapanRows.length}
              >
                <IconDownload size={16} />
                Export CSV
              </button>
            </div>
          </header>

          <div className="table-scroll">
            <table className="data-table">
              <Cols widths={[26, 19, 19, 16, 20]} />
              <thead>
                <tr>
                  <th>Kapan Number</th>
                  <th className="num">Rough (ct)</th>
                  <th className="num">Polished (ct)</th>
                  <th className="num">Yield %</th>
                  <th className="num">Records</th>
                </tr>
              </thead>
              <tbody>
                {kapanRows.map((kapan) => (
                  <tr key={kapan.kapanNumber}>
                    <td className="kapan-cell">{kapan.kapanNumber}</td>
                    <td className="num">{formatNumber(kapan.totals.kWeight)}</td>
                    <td className="num">{formatNumber(kapan.totals.pWeight)}</td>
                    <td className="num">{kapan.totals.percentage}</td>
                    <td className="num">{kapan.recordCount}</td>
                  </tr>
                ))}
                {!kapanRows.length && (
                  <tr className="empty-row">
                    <td colSpan={5}>
                      <div className="empty-state">
                        <IconReports size={26} />
                        <strong>Nothing to report yet</strong>
                        <span>Save a Kapan to build your first report.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {!!kapanRows.length && (
                <tfoot>
                  <tr>
                    <th>Total</th>
                    <th className="num">{formatNumber(overall.kWeight)}</th>
                    <th className="num">{formatNumber(overall.pWeight)}</th>
                    <th className="num">{overall.percentage}</th>
                    <th className="num">{allRecords.length}</th>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <section className="panel" aria-label="Daily production">
          <header className="panel-head">
            <h3>Daily Production</h3>
            <div className="panel-tools">
              <button
                type="button"
                className="button ghost small"
                onClick={exportPackets}
                disabled={!allRecords.length}
              >
                <IconDownload size={16} />
                Export Packets
              </button>
            </div>
          </header>

          <div className="table-scroll">
            <table className="data-table">
              <Cols widths={[26, 16, 20, 20, 18]} />
              <thead>
                <tr>
                  <th>Scan Date</th>
                  <th className="num">Packets</th>
                  <th className="num">Rough (ct)</th>
                  <th className="num">Polished (ct)</th>
                  <th className="num">Yield %</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((day) => (
                  <tr key={day.dateKey}>
                    <td>{formatDisplayDate(day.dateKey)}</td>
                    <td className="num">{day.records.length}</td>
                    <td className="num">{formatNumber(day.totals.kWeight)}</td>
                    <td className="num">{formatNumber(day.totals.pWeight)}</td>
                    <td className="num">{day.totals.percentage}</td>
                  </tr>
                ))}
                {!dailyRows.length && (
                  <tr className="empty-row">
                    <td colSpan={5}>
                      <div className="empty-state">
                        <IconReports size={26} />
                        <strong>No production recorded</strong>
                        <span>Daily totals appear here once packets are saved.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ReportsScreen;
