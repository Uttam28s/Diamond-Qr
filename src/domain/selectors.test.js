import {
  ALL_SEASONS,
  selectDefaultSeason,
  selectKapanRows,
  selectKapanView,
  selectSeasons,
} from "./selectors";
import {
  addPacket,
  createKapan,
  createLot,
  emptyState,
  kapanByNumber,
  lotsOfKapan,
} from "./operations";
import { parseDateEntry } from "./entry";
import { round } from "./totals";

const build = () => {
  let state = createKapan(emptyState(), {
    number: "41",
    season: "25-26",
    createdAt: "2026-01-17",
  }).state;
  state = createKapan(state, {
    number: "40",
    season: "25-26",
    createdAt: "2025-11-03",
  }).state;
  state = createKapan(state, {
    number: "12",
    season: "24-25",
    createdAt: "2025-02-01",
  }).state;

  const k41 = kapanByNumber(state, "41").id;

  state = createLot(state, k41, { pcs: 142, charmi: -2 }).state;
  state = createLot(state, k41, { pcs: 140, charmi: -2 }).state;

  const [lotA, lotB] = lotsOfKapan(state, k41);

  state = addPacket(state, {
    kapanId: k41,
    lotId: lotA.id,
    kachuWeight: 7.348,
    polishedWeight: 0.928,
  }).state;
  state = addPacket(state, {
    kapanId: k41,
    lotId: lotB.id,
    kachuWeight: 8.698,
    polishedWeight: 0.882,
  }).state;
  // One scan nobody has filed into a lot yet.
  state = addPacket(state, {
    kapanId: k41,
    lotId: null,
    kachuWeight: 1.5,
    polishedWeight: 0.3,
  }).state;

  return { state, k41 };
};

describe("selectKapanView", () => {
  const { state, k41 } = build();
  const view = selectKapanView(state, k41);

  it("returns lot rows in sheet order with their derived figures", () => {
    expect(view.rows.map((row) => row.lot.lotNo)).toEqual([1, 2]);
    expect(round(view.rows[0].derived.polishedPct, 2)).toBe(12.63);
    expect(round(view.rows[1].derived.polishedPct, 2)).toBe(10.14);
  });

  it("keeps unassigned packets out of the header totals", () => {
    expect(round(view.totals.roughWeight, 3)).toBe(round(7.348 + 8.698, 3));
    expect(view.totals.unassignedCount).toBe(1);
  });

  it("gives a new lot today's date rather than leaving a hole", () => {
    expect(view.rows[0].lot.lotDate).toBe(new Date().toISOString().slice(0, 10));
    expect(view.rows[0].warnings).toEqual([]);
  });

  it("flags a lot whose date was cleared, or that has no pcs", () => {
    const cleared = {
      ...state,
      lots: {
        ...state.lots,
        [view.rows[0].lot.id]: {
          ...view.rows[0].lot,
          lotDate: null,
          pcs: null,
        },
      },
    };
    const warnings = selectKapanView(cleared, k41).rows[0].warnings;
    expect(warnings).toContain("No lot date");
    expect(warnings).toContain("No pcs entered");
  });

  it("flags returns that cannot be right", () => {
    const impossible = {
      ...state,
      lots: {
        ...state.lots,
        [view.rows[0].lot.id]: {
          ...view.rows[0].lot,
          pcs: 142,
          returnPcs: 150, // more came back than went out
        },
      },
    };
    const warnings = selectKapanView(impossible, k41).rows[0].warnings;
    expect(warnings.join(" ")).toMatch(/More pcs returned/);
  });

  it("does NOT flag a return heavier than the polished weight", () => {
    // It looks wrong but happens routinely in the factory's own sheet - it is
    // what the negative ઘટ values there are. Flagging it would stripe a fifth of
    // a normal Kapan and teach everyone to ignore the warnings that matter.
    const heavier = {
      ...state,
      lots: {
        ...state.lots,
        [view.rows[0].lot.id]: {
          ...view.rows[0].lot,
          pcs: 142,
          returnPcs: 139,
          returnWeight: 9, // against 0.928 ct polished
        },
      },
    };
    expect(selectKapanView(heavier, k41).rows[0].warnings).toEqual([]);
  });

  it("is null for a Kapan that no longer exists", () => {
    expect(selectKapanView(state, "nope")).toBeNull();
  });
});

describe("selectKapanRows", () => {
  const { state } = build();

  it("filters by season", () => {
    const current = selectKapanRows(state, { season: "25-26" });
    expect(current.rows.map((row) => row.kapan.number)).toEqual(["41", "40"]);
    expect(current.unfilteredCount).toBe(3);
  });

  it("totals only the filtered rows", () => {
    const all = selectKapanRows(state, { season: ALL_SEASONS });
    const one = selectKapanRows(state, { season: "24-25" });
    expect(all.totals.kapanCount).toBe(3);
    expect(one.totals.kapanCount).toBe(1);
    expect(one.totals.roughWeight).toBe(0);
  });

  it("searches by number and by season", () => {
    expect(
      selectKapanRows(state, { search: "41" }).rows.map((r) => r.kapan.number)
    ).toEqual(["41"]);
    expect(selectKapanRows(state, { search: "24-25" }).rows).toHaveLength(1);
  });

  it("sorts numbers naturally, so 12 does not come after 40", () => {
    const byNumber = selectKapanRows(state, { sort: "number" });
    expect(byNumber.rows.map((row) => row.kapan.number)).toEqual(["12", "40", "41"]);
  });

  it("sorts newest first by the recorded date, not by id", () => {
    const recent = selectKapanRows(state, { sort: "recent" });
    expect(recent.rows.map((row) => row.kapan.number)).toEqual(["41", "40", "12"]);
  });

  it("sorts by returns due", () => {
    const pending = selectKapanRows(state, { sort: "pending" });
    expect(pending.rows[0].kapan.number).toBe("41");
  });
});

describe("seasons", () => {
  const { state } = build();

  it("lists the seasons in the data, newest first", () => {
    expect(selectSeasons(state)).toEqual(["25-26", "24-25"]);
  });

  it("defaults a new Kapan to the season most recently worked", () => {
    expect(selectDefaultSeason(state)).toBe("25-26");
  });

  it("has no default on an empty device", () => {
    expect(selectDefaultSeason(emptyState())).toBe("");
  });
});

describe("typed dates", () => {
  const today = new Date(2026, 7, 3); // 3 Aug 2026

  it("reads the shorthand the sheet itself uses", () => {
    expect(parseDateEntry("17.7", today).value).toBe("2026-07-17");
    expect(parseDateEntry("17-07", today).value).toBe("2026-07-17");
  });

  it("reads full dates in any common separator", () => {
    expect(parseDateEntry("17-07-2026", today).value).toBe("2026-07-17");
    expect(parseDateEntry("17/07/2026", today).value).toBe("2026-07-17");
    expect(parseDateEntry("17.07.2026", today).value).toBe("2026-07-17");
  });

  it("reads a two-digit year as this century", () => {
    expect(parseDateEntry("17-7-26", today).value).toBe("2026-07-17");
  });

  it("reads a bare day as this month", () => {
    expect(parseDateEntry("9", today).value).toBe("2026-08-09");
  });

  it("takes t or today", () => {
    expect(parseDateEntry("t", today).value).toBe("2026-08-03");
    expect(parseDateEntry("today", today).value).toBe("2026-08-03");
  });

  it("accepts a pasted ISO date", () => {
    expect(parseDateEntry("2026-07-17", today).value).toBe("2026-07-17");
  });

  it("clears to null", () => {
    expect(parseDateEntry("", today)).toEqual({ ok: true, value: null });
  });

  it("refuses a day that does not exist rather than rolling into next month", () => {
    // Date would happily turn 31 February into 3 March and record a day nobody
    // typed.
    expect(parseDateEntry("31-02-2026", today).ok).toBe(false);
    expect(parseDateEntry("32-01-2026", today).ok).toBe(false);
    expect(parseDateEntry("17-13-2026", today).ok).toBe(false);
  });

  it("accepts 29 February in a leap year and refuses it otherwise", () => {
    expect(parseDateEntry("29-02-2028", today).value).toBe("2028-02-29");
    expect(parseDateEntry("29-02-2026", today).ok).toBe(false);
  });

  it("refuses nonsense with a usable message", () => {
    const outcome = parseDateEntry("next tuesday", today);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/17-07-2026/);
  });
});
