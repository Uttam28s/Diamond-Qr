import React from "react";
import { formatInt, formatPercent, formatSize, formatWeight } from "../../domain/format";

/**
 * The Kapan header block, in the same twelve figures and the same order as the
 * workbook's own header, so someone who knows the sheet can read this without
 * being taught it.
 *
 * Both labels are shown. Two of the sheet's own labels look almost identical -
 * તૈ.વજન is total *return* weight while તૈયાર વજન is total *polished* weight -
 * and the English line is what stops those being confused.
 */

const Stat = ({ guj, en, value, unit, tone = "" }) => (
  <div className={`kstat ${tone ? `tone-${tone}` : ""}`}>
    <span className="kstat-key">
      <span className="kstat-guj">{guj}</span>
      <span className="kstat-en">{en}</span>
    </span>
    <span className="kstat-value">
      {value}
      {unit ? <em>{unit}</em> : null}
    </span>
  </div>
);

const KapanHeaderStats = ({ totals }) => (
  <div className="kstat-strip">
    <Stat guj="કા. નંગ" en="Rough pcs" value={formatInt(totals.roughPcs)} />
    <Stat
      guj="કા.વજન"
      en="Rough weight"
      value={formatWeight(totals.roughWeight)}
      unit="ct"
    />
    <Stat
      guj="તૈયાર વજન"
      en="Polished weight"
      value={formatWeight(totals.polishedWeight)}
      unit="ct"
      tone="accent"
    />
    <Stat
      guj="ટકાવારી"
      en="Polished %"
      value={formatPercent(totals.polishedPct)}
      unit="%"
      tone="accent"
    />
    <Stat guj="તૈ. નંગ" en="Return pcs" value={formatInt(totals.returnPcs)} />
    <Stat
      guj="તૈ.વજન"
      en="Return weight"
      value={formatWeight(totals.returnWeight)}
      unit="ct"
    />
    <Stat
      guj="ટકાવારી"
      en="Return %"
      value={formatPercent(totals.returnPct)}
      unit="%"
    />
    <Stat
      guj="તૈયાર ઘટ વજન"
      en="Ghat weight"
      value={formatWeight(totals.ghatWeight)}
      unit="ct"
    />
    <Stat
      guj="તૈયાર ઘટ ટકાવારી"
      en="Ghat %"
      value={formatPercent(totals.ghatPct)}
      unit="%"
    />
    {/*
      The sheet calls this ઘટ નંગ. It is pcs not yet returned, which for a Kapan
      still being worked is mostly still with the workers - so it is labelled
      "outstanding" rather than "missing", and the loss report carries the
      narrower figure that only counts lots whose returns are actually in.
    */}
    <Stat
      guj="ઘટ નંગ"
      en="Outstanding pcs"
      value={formatInt(totals.outstandingPcs)}
      tone={totals.outstandingPcs > 0 ? "warn" : ""}
    />
    <Stat guj="કા. સાઈઝ" en="Rough size" value={formatSize(totals.roughSize)} />
    <Stat guj="તૈ. સાઈઝ" en="Return size" value={formatSize(totals.returnSize)} />
  </div>
);

export default KapanHeaderStats;
