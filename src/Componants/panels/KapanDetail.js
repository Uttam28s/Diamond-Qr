import React, { useEffect, useState } from "react";
import Cols from "./Cols";
import { IconChevronDown, IconChevronRight, IconFile } from "../Icons";
import {
  calculateTotals,
  formatDateTime,
  formatDisplayDate,
  formatDisplayTime,
  formatNumber,
  groupRecordsByDate,
} from "../utils";

const PREVIEW_HEAD = 3;
const PREVIEW_MIN = 5;

const COLS_TIME = [9, 22, 24, 26, 19];
const COLS_DATE = [8, 28, 21, 24, 19];

const RecordRow = ({ record, index, showDate }) => (
  <tr>
    <td>{index + 1}</td>
    <td>{showDate ? formatDateTime(record.scannedAt) : formatDisplayTime(record.scannedAt)}</td>
    <td className="num">{formatNumber(record.kWeight)}</td>
    <td className="num">{formatNumber(record.pWeight)}</td>
    <td className="num">{record.percentage}</td>
  </tr>
);

const RecordTable = ({ records, showDate = false, expanded, onExpand }) => {
  const collapsible = !expanded && records.length > PREVIEW_MIN;
  const visible = collapsible
    ? [
        ...records.slice(0, PREVIEW_HEAD).map((record, index) => ({ record, index })),
        { ellipsis: true },
        { record: records[records.length - 1], index: records.length - 1 },
      ]
    : records.map((record, index) => ({ record, index }));

  return (
    <table className="data-table detail-table">
      <Cols widths={showDate ? COLS_DATE : COLS_TIME} />
      <thead>
        <tr>
          <th>No.</th>
          <th>{showDate ? "Scan Date" : "Scan Time"}</th>
          <th className="num">Kachu Weight (ct)</th>
          <th className="num">Polished Weight (ct)</th>
          <th className="num">Yield %</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((entry) =>
          entry.ellipsis ? (
            <tr className="ellipsis-row" key="ellipsis">
              <td colSpan={5}>
                <button
                  type="button"
                  onClick={onExpand}
                  title={`Show all ${records.length} records`}
                >
                  ...
                </button>
              </td>
            </tr>
          ) : (
            <RecordRow
              key={entry.record.id || `${entry.record.rawCode}-${entry.index}`}
              record={entry.record}
              index={entry.index}
              showDate={showDate}
            />
          )
        )}
      </tbody>
    </table>
  );
};

const GroupTotals = ({ totals }) => (
  <div className="group-totals">
    <span>{formatNumber(totals.kWeight)} ct</span>
    <span>{formatNumber(totals.pWeight)} ct</span>
    <span>{totals.percentage} %</span>
  </div>
);

const KapanDetail = ({ kapan, groupMode, onGroupModeChange, className = "" }) => {
  const kapanNumber = kapan ? kapan.kapanNumber : "";
  const records = (kapan && kapan.records) || [];
  const groups = groupRecordsByDate(records);

  const [openGroups, setOpenGroups] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    setOpenGroups({});
    setExpandedGroups({});
  }, [kapanNumber]);

  const isOpen = (dateKey, index) =>
    dateKey in openGroups ? openGroups[dateKey] : index === 0;

  const toggleGroup = (dateKey, index) =>
    setOpenGroups((previous) => ({
      ...previous,
      [dateKey]: !isOpen(dateKey, index),
    }));

  return (
    <section className={`panel kapan-detail ${className}`} aria-label="Kapan detail">
      <header className="panel-head">
        <h3>{kapanNumber ? `Kapan Detail: ${kapanNumber}` : "Kapan Detail"}</h3>
        <div className="panel-tools">
          <label className="select-wrap">
            <select
              value={groupMode}
              onChange={(event) => onGroupModeChange(event.target.value)}
              aria-label="Group records by"
            >
              <option value="date">Grouped by Scan Date</option>
              <option value="none">All Records</option>
            </select>
            <IconChevronDown size={15} />
          </label>
        </div>
      </header>

      <div className="detail-body">
        {!records.length && (
          <div className="empty-state">
            <IconFile size={26} />
            <strong>{kapanNumber ? "This Kapan has no records" : "No Kapan selected"}</strong>
            <span>Select a Kapan from the history to review its packets.</span>
          </div>
        )}

        {!!records.length && groupMode === "none" && (
          <div className="date-group is-open">
            <div className="date-group-head static">
              <div className="date-group-title">
                <strong>{records.length} records</strong>
              </div>
              <GroupTotals totals={calculateTotals(records)} />
            </div>
            <div className="date-group-body">
              <RecordTable records={records} showDate expanded onExpand={() => {}} />
            </div>
          </div>
        )}

        {!!records.length &&
          groupMode === "date" &&
          groups.map((group, index) => {
            const open = isOpen(group.dateKey, index);

            return (
              <div className={`date-group ${open ? "is-open" : ""}`} key={group.dateKey}>
                <button
                  type="button"
                  className="date-group-head"
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.dateKey, index)}
                >
                  <div className="date-group-title">
                    <span className="group-chevron">
                      {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                    </span>
                    <strong>{formatDisplayDate(group.dateKey)}</strong>
                    <span className="group-count">({group.records.length})</span>
                  </div>
                  <GroupTotals totals={group.totals} />
                </button>

                {open && (
                  <div className="date-group-body">
                    <RecordTable
                      records={group.records}
                      expanded={!!expandedGroups[group.dateKey]}
                      onExpand={() =>
                        setExpandedGroups((previous) => ({
                          ...previous,
                          [group.dateKey]: true,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
};

export default KapanDetail;
