import React from "react";
import { IconCheck, IconLayers } from "../Icons";
import { formatInt, formatPercent, formatWeight } from "../../domain/format";

/**
 * જમા — the returns that are actually in, and the ghat of those lots alone.
 *
 * The twelve figures above this are the workbook's own header, reproduced exactly,
 * and તૈયાર ઘટ ટકાવારી among them divides by every lot's rough weight. That is the
 * right figure for a finished Kapan and a misleading one for a Kapan in progress:
 * with 30 of 150 lots back, the other 120 put their full polished weight into the
 * numerator and have no return weight to subtract yet, so the loss reads several
 * times worse than it is.
 *
 * જમા ઘટ ટકાવારી answers the question being asked while the work is out: of what
 * has come back, how much is short. Both weights it divides are printed beside it,
 * so the percentage can be checked rather than trusted.
 */

const Figure = ({ guj, en, value, unit, tone = "" }) => (
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

const JamaProgress = ({ totals }) => {
  const { lotCount, lotsWithReturns, lotsAwaitingReturns } = totals;

  // No lots at all is the empty Kapan the sheet below already explains.
  if (!lotCount) return null;

  const donePct = lotCount ? (lotsWithReturns / lotCount) * 100 : 0;
  const allIn = lotsAwaitingReturns === 0;

  return (
    <section className="jama" aria-label="Returns received so far">
      <header className="jama-head">
        <span className="jama-title">
          <span className="jama-guj">જમા</span>
          <span className="jama-en">Returns received</span>
        </span>

        <span className={`jama-count ${allIn ? "is-done" : ""}`}>
          {allIn ? <IconCheck size={14} /> : <IconLayers size={14} />}
          <strong>
            {formatInt(lotsWithReturns)} of {formatInt(lotCount)}
          </strong>
          lots back
        </span>

        {/*
          A bar as well as the count, because "30 of 150" and "130 of 150" take
          the same time to read as text and no time at all to tell apart here.
        */}
        <span
          className="jama-bar"
          role="img"
          aria-label={`${lotsWithReturns} of ${lotCount} lots returned`}
        >
          <span className="jama-bar-fill" style={{ width: `${donePct}%` }} />
        </span>

        <span className="jama-remaining">
          {allIn
            ? "every lot is back — તૈયાર ઘટ ટકાવારી above is now the whole Kapan's"
            : `${formatInt(lotsAwaitingReturns)} lot${
                lotsAwaitingReturns === 1 ? "" : "s"
              } still out`}
        </span>
      </header>

      {lotsWithReturns ? (
        <div className="jama-strip">
          <Figure
            guj="જમા કા.વજન"
            en="Rough of those lots"
            value={formatWeight(totals.jamaRoughWeight)}
            unit="ct"
          />
          <Figure
            guj="જમા તૈયાર વજન"
            en="Polished of those lots"
            value={formatWeight(totals.jamaPolishedWeight)}
            unit="ct"
          />
          <Figure
            guj="તૈ.વજન"
            en="Return weight"
            value={formatWeight(totals.returnWeight)}
            unit="ct"
          />
          <Figure
            guj="જમા ઘટ વજન"
            en="Jama ghat weight"
            value={formatWeight(totals.jamaGhatWeight)}
            unit="ct"
            tone={totals.jamaGhatWeight < 0 ? "warn" : ""}
          />
          <Figure
            guj="જમા ઘટ ટકાવારી"
            en="Jama ghat %"
            value={formatPercent(totals.jamaGhatPct)}
            unit="%"
            tone="accent"
          />
        </div>
      ) : (
        <p className="jama-empty">
          No returns entered yet, so there is no જમા ઘટ to work out. It appears here
          as soon as the first lot's જ. નંગ and જ.વજન go in.
        </p>
      )}
    </section>
  );
};

export default JamaProgress;
