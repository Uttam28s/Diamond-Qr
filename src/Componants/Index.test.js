import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Index from "./Index";

/**
 * Drives the real screens the way the owner does, because the value of this
 * feature is in the keyboard flow and nothing below the UI can prove that works.
 */

/**
 * user-event 13 does not wrap its interactions in act() the way React 18 wants,
 * so every keystroke logs a warning. It is noise from that version pairing
 * rather than anything about the app, and it buries real assertion output -
 * everything else still goes to the console.
 */
const realConsoleError = console.error;

beforeAll(() => {
  console.error = (...args) => {
    if (/not wrapped in act|ReactDOMTestUtils\.act/.test(`${args[0]}`)) return;
    realConsoleError(...args);
  };
});

afterAll(() => {
  console.error = realConsoleError;
});

beforeEach(() => {
  window.localStorage.clear();
});

const openKapansTab = () => userEvent.click(screen.getByRole("button", { name: /Kapans/i }));

/** Creates a Kapan through the dialog and lands in its workbench. */
const createKapan = async (number = "41", season = "25-26") => {
  render(<Index />);
  await openKapansTab();

  await userEvent.click(await screen.findByRole("button", { name: /New Kapan/i }));

  await userEvent.type(screen.getByLabelText(/Kapan number/i), number);
  const seasonField = screen.getByLabelText(/^Season$/i);
  await userEvent.clear(seasonField);
  await userEvent.type(seasonField, season);
  await userEvent.click(screen.getByRole("button", { name: /Create Kapan/i }));

  // Creating a Kapan drops straight into its sheet, since adding lots is always
  // the next thing that happens.
  await screen.findByRole("button", { name: /All Kapans/i });
};

/** The + on the ghost row, whatever number it is offering to add. */
const addButton = () => screen.getByLabelText(/^Add lot \d+$/);

/**
 * Adds a lot by pressing the + on the ghost row, optionally setting the charmi the
 * new lot starts with.
 *
 * Nothing else has to be typed: the lot's નંગ counts itself up as its packets are
 * scanned in, so the + is the whole interaction.
 */
const addLot = async (charmi) => {
  if (charmi !== undefined) {
    const charmiField = screen.getByLabelText("New lot charmi");
    await userEvent.clear(charmiField);
    await userEvent.type(charmiField, `${charmi}`);
  }
  await userEvent.click(addButton());
};

/**
 * Found by title rather than accessible name: the expand button's name is its
 * visible text (the lot number), so the title is the unambiguous handle.
 */
const lotRow = (lotNo) =>
  screen.getByTitle(new RegExp(`in lot ${lotNo}$`)).closest("tr");

describe("creating a Kapan", () => {
  it("opens its sheet, ready for lots", async () => {
    await createKapan("41");

    expect(screen.getByRole("heading", { name: /Kapan 41/i })).toBeInTheDocument();
    expect(screen.getByText(/No lots in this Kapan yet/i)).toBeInTheDocument();
    // The header block is there from the start, all twelve figures at zero.
    expect(screen.getByText("કા. નંગ")).toBeInTheDocument();
    expect(screen.getByText("તૈ. સાઈઝ")).toBeInTheDocument();
  });

  it("refuses a duplicate number without losing what was typed", async () => {
    await createKapan("41");
    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));
    await userEvent.click(screen.getByRole("button", { name: /New Kapan/i }));

    await userEvent.type(screen.getByLabelText(/Kapan number/i), "41");
    await userEvent.click(screen.getByRole("button", { name: /Create Kapan/i }));

    expect(await screen.findByText(/Kapan 41 already exists/i)).toBeInTheDocument();
  });
});

describe("the ghost row", () => {
  it("adds a lot on one press of the +", async () => {
    await createKapan("41");

    await addLot(-2);

    const row = await waitFor(() => lotRow(1));
    expect(within(row).getByLabelText("Lot 1 charmi")).toHaveValue("-2");
    // Nothing had to be typed to get here - and no pcs was asked for, because a
    // lot's નંગ counts itself up as its packets are scanned in.
    expect(within(row).getByLabelText("Lot 1 pcs")).toHaveValue("");
    expect(screen.queryByLabelText("New lot pcs")).not.toBeInTheDocument();
  });

  it("keeps focus on the + so a run of lots is a run of presses", async () => {
    await createKapan("41");

    await addLot(-2);
    await waitFor(() => lotRow(1));
    await addLot();
    await waitFor(() => lotRow(2));
    await addLot();
    await waitFor(() => lotRow(3));

    expect(screen.getByText("3 lots")).toBeInTheDocument();
    // Charmi carried down to every row without being retyped.
    expect(within(lotRow(2)).getByLabelText("Lot 2 charmi")).toHaveValue("-2");
    expect(within(lotRow(3)).getByLabelText("Lot 3 charmi")).toHaveValue("-2");
    // And the + is still under the finger, now offering lot 4.
    expect(screen.getByLabelText("Add lot 4")).toHaveFocus();
  });

  it("adds a lot on Enter from a ghost cell too, for the keyboard", async () => {
    await createKapan("41");

    await userEvent.type(screen.getByLabelText("New lot charmi"), "-2{enter}");

    const row = await waitFor(() => lotRow(1));
    expect(within(row).getByLabelText("Lot 1 charmi")).toHaveValue("-2");
  });

  it("gives each new lot today's date", async () => {
    await createKapan("41");
    await addLot();

    await waitFor(() => lotRow(1));
    // Shown as dd-mm-yyyy while resting, the way the workbook writes it.
    const now = new Date();
    const dmy = [
      `${now.getDate()}`.padStart(2, "0"),
      `${now.getMonth() + 1}`.padStart(2, "0"),
      now.getFullYear(),
    ].join("-");
    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 date")).toHaveValue(dmy)
    );
  });

  it("refuses a fractional charmi with a message, and adds nothing", async () => {
    await createKapan("41");
    await addLot("2.5");

    expect(await screen.findByText(/whole number/i)).toBeInTheDocument();
    expect(screen.getByText(/No lots in this Kapan yet/i)).toBeInTheDocument();
  });
});

describe("editing cells", () => {
  it("does not divide by a lot with nothing scanned into it", async () => {
    await createKapan("41");
    await addLot(-2);
    const row = await waitFor(() => lotRow(1));

    await userEvent.type(within(row).getByLabelText("Lot 1 return pcs"), "142");
    await userEvent.tab();

    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 return pcs")).toHaveValue("142")
    );
    // No pcs and no packets, so there is nothing to be a percentage of - the
    // percentages stay at zero instead of dividing by a zero rough weight, and the
    // row says plainly that returns arrived against a lot with no pcs.
    expect(within(lotRow(1)).getAllByText("0.00").length).toBeGreaterThan(0);
    expect(lotRow(1).className).toMatch(/has-warning/);
  });

  it("adds with +N instead of replacing", async () => {
    await createKapan("41");
    await addLot(-2);
    const row = await waitFor(() => lotRow(1));

    const returnPcs = within(row).getByLabelText("Lot 1 return pcs");
    await userEvent.type(returnPcs, "89");
    await userEvent.tab();
    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 return pcs")).toHaveValue("89")
    );

    const again = within(lotRow(1)).getByLabelText("Lot 1 return pcs");
    await userEvent.clear(again);
    await userEvent.type(again, "+12");
    await userEvent.tab();

    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 return pcs")).toHaveValue("101")
    );
  });

  it("sets a negative charmi rather than subtracting", async () => {
    await createKapan("41");
    await addLot(2);
    const row = await waitFor(() => lotRow(1));

    const charmi = within(row).getByLabelText("Lot 1 charmi");
    await userEvent.clear(charmi);
    await userEvent.type(charmi, "-2");
    await userEvent.tab();

    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 charmi")).toHaveValue("-2")
    );
  });

  it("takes a typed date shorthand", async () => {
    await createKapan("41");
    await addLot();
    const row = await waitFor(() => lotRow(1));

    const date = within(row).getByLabelText("Lot 1 date");
    await userEvent.clear(date);
    await userEvent.type(date, "17.7");
    await userEvent.tab();

    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 date")).toHaveValue(
        `17-07-${new Date().getFullYear()}`
      )
    );
  });

  it("takes a pcs count typed by hand", async () => {
    await createKapan("41");
    await addLot(-2);
    const row = await waitFor(() => lotRow(1));

    // Nothing scanned yet, so the cell is empty until either a scan lands or the
    // paper slip's figure is typed in.
    const pcs = within(row).getByLabelText("Lot 1 pcs");
    expect(pcs).toHaveValue("");
    await userEvent.type(pcs, "142");
    await userEvent.tab();

    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 pcs")).toHaveValue("142")
    );
  });

  it("reverts a cell on Escape", async () => {
    await createKapan("41");
    await addLot(-2);
    const row = await waitFor(() => lotRow(1));

    const charmi = within(row).getByLabelText("Lot 1 charmi");
    await userEvent.clear(charmi);
    await userEvent.type(charmi, "999{escape}");

    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 charmi")).toHaveValue("-2")
    );
  });
});

describe("deleting a lot", () => {
  it("goes in one click and comes back with Undo", async () => {
    await createKapan("41");
    await addLot();
    await waitFor(() => lotRow(1));

    await userEvent.click(screen.getByTitle(/Delete lot 1/i));

    await waitFor(() =>
      expect(screen.getByText(/No lots in this Kapan yet/i)).toBeInTheDocument()
    );

    // No confirm dialog for a lot with no packets - just an Undo on the toast.
    await userEvent.click(await screen.findByRole("button", { name: /^Undo$/i }));

    await waitFor(() => expect(lotRow(1)).toBeTruthy());
  });

  it("leaves a gap in the numbering, and Renumber closes it", async () => {
    await createKapan("41");
    await addLot(-2);
    await waitFor(() => lotRow(1));
    await addLot(2);
    await waitFor(() => lotRow(2));
    await addLot(7);
    await waitFor(() => lotRow(3));

    await userEvent.click(screen.getByTitle(/Delete lot 2/i));
    await waitFor(() => expect(screen.getByText("2 lots")).toBeInTheDocument());

    // Lot 3 keeps its number: a number written on a paper slip has to keep
    // meaning the same lot.
    expect(lotRow(3)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Renumber/i }));
    await waitFor(() => expect(lotRow(2)).toBeTruthy());
    expect(within(lotRow(2)).getByLabelText("Lot 2 charmi")).toHaveValue("7");
  });
});

describe("the Kapan list", () => {
  it("shows each Kapan with its figures and a season total", async () => {
    await createKapan("41", "25-26");
    await addLot();
    await waitFor(() => lotRow(1));

    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));

    const table = await screen.findByRole("table");
    expect(within(table).getByText("41")).toBeInTheDocument();
    expect(within(table).getByText("1 Kapans")).toBeInTheDocument();
    expect(within(table).getByText(/Running/i)).toBeInTheDocument();
  });

  it("opens the workbench when a row is clicked", async () => {
    await createKapan("41");
    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));

    await userEvent.click(await screen.findByText("41"));
    expect(await screen.findByRole("button", { name: /Renumber/i })).toBeInTheDocument();
  });
});

describe("deleting a Kapan", () => {
  it("requires the number typed out, then undoes", async () => {
    await createKapan("41");
    await addLot();
    await waitFor(() => lotRow(1));

    await userEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    const dialog = await screen.findByRole("dialog");
    const deleteButton = within(dialog).getByRole("button", { name: /Delete Kapan/i });
    expect(deleteButton).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/Type .* to confirm/i), "41");
    expect(deleteButton).toBeEnabled();

    await userEvent.click(deleteButton);

    await waitFor(() =>
      expect(screen.getByText(/No Kapans yet/i)).toBeInTheDocument()
    );

    await userEvent.click(await screen.findByRole("button", { name: /^Undo$/i }));
    await waitFor(() => expect(screen.getByText("41")).toBeInTheDocument());
  });
});

/* ========================================================================
   Phase 3 - binding scans to a lot.
   ======================================================================== */

const goToScan = () => userEvent.click(screen.getByRole("button", { name: /^Scan$/i }));

/** Scans one packet into the session. Only the last two numbers are read. */
const scan = async (kachu, polished) => {
  const box = screen.getByLabelText(/Scan Barcode/i);
  await userEvent.type(box, `0.011,0.024,${kachu},${polished}{enter}`);
};

describe("choosing the lot to scan into", () => {
  it("says plainly that scans go to Unassigned when no lot is picked", async () => {
    await createKapan("41");
    await goToScan();

    expect(screen.getByText(/packets will wait in Unassigned/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Records/i })).toBeInTheDocument();
  });

  it("opens the picker on Ctrl+L from any screen", async () => {
    await createKapan("41");
    await addLot();
    await waitFor(() => lotRow(1));

    // Still on the Kapans screen - the shortcut is global on purpose.
    await userEvent.keyboard("{ctrl}l{/ctrl}");

    expect(await screen.findByRole("dialog", { name: /Scan into which lot/i })).toBeInTheDocument();
  });

  it("picks a lot with the keyboard and shows it on the scan screen", async () => {
    await createKapan("41");
    await addLot();
    await waitFor(() => lotRow(1));

    await userEvent.keyboard("{ctrl}l{/ctrl}");
    const dialog = await screen.findByRole("dialog", { name: /Scan into which lot/i });
    await userEvent.type(within(dialog).getByLabelText(/Search Kapans and lots/i), "41 1{enter}");

    // Picking a lot lands on the scan screen, ready to scan.
    expect(await screen.findByText(/Kapan 41 · Lot 1/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save to lot 1/i })).toBeInTheDocument();
  });

  it("filters to nothing rather than guessing", async () => {
    await createKapan("41");
    await addLot();
    await waitFor(() => lotRow(1));

    await userEvent.keyboard("{ctrl}l{/ctrl}");
    const dialog = await screen.findByRole("dialog", { name: /Scan into which lot/i });
    await userEvent.type(within(dialog).getByLabelText(/Search Kapans and lots/i), "99");

    expect(within(dialog).getByText(/Nothing matches that/i)).toBeInTheDocument();
  });

  it("aims the scanner from the lot's own row, with no picker in the way", async () => {
    await createKapan("41");
    await addLot();
    await addLot();
    await waitFor(() => lotRow(2));

    await userEvent.click(screen.getByLabelText("Scan into lot 2"));

    // Straight onto the scan screen, pointed at that lot.
    expect(await screen.findByText(/Kapan 41 · Lot 2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save to lot 2/i })).toBeInTheDocument();
  });

  it("marks the row the scanner is pointed at, and leaves the others alone", async () => {
    await createKapan("41");
    await addLot();
    await addLot();
    await waitFor(() => lotRow(2));

    await userEvent.click(screen.getByLabelText("Scan into lot 2"));
    await screen.findByText(/Kapan 41 · Lot 2/i);
    await openKapansTab();

    expect(await screen.findByLabelText("Scan into lot 2")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("Scan into lot 1")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});

describe("the session count card", () => {
  /** The Packets Scanned card, read as the owner reads it. */
  const scannedCard = () =>
    screen.getByText("Packets Scanned").closest(".stat-card");

  it("counts up with the scans and back down when one is removed", async () => {
    render(<Index />);
    await goToScan();

    expect(within(scannedCard()).getByText("0")).toBeInTheDocument();

    await scan(2.0, 0.4);
    await scan(3.0, 0.6);
    await waitFor(() =>
      expect(within(scannedCard()).getByText("2")).toBeInTheDocument()
    );

    // The same figure the session table has always carried in its header.
    expect(screen.getByText("2 Records")).toBeInTheDocument();

    await userEvent.click(screen.getAllByTitle("Remove this scan")[0]);
    await waitFor(() =>
      expect(within(scannedCard()).getByText("1")).toBeInTheDocument()
    );
  });
});

describe("saving a session into a lot", () => {
  const pickLotOne = async () => {
    await userEvent.keyboard("{ctrl}l{/ctrl}");
    const dialog = await screen.findByRole("dialog", { name: /Scan into which lot/i });
    await userEvent.type(within(dialog).getByLabelText(/Search Kapans and lots/i), "41 1{enter}");
    await screen.findByText(/Kapan 41 · Lot 1/i);
  };

  it("goes straight in with no dialog, and the sheet picks up the weights", async () => {
    await createKapan("41");
    await addLot(-2);
    await waitFor(() => lotRow(1));
    await pickLotOne();

    await scan(7.348, 0.928);
    await userEvent.click(screen.getByRole("button", { name: /Save to lot 1/i }));

    await openKapansTab();
    const row = await waitFor(() => lotRow(1));

    // The two derived columns now carry the scanned weights, and the yield is
    // the sheet's own 12.63.
    expect(within(row).getByText("7.348")).toBeInTheDocument();
    expect(within(row).getByText("0.928")).toBeInTheDocument();
    // 12.63 twice: Pol % and Ghat %. With no returns in, ghat IS the polished
    // percentage, which is exactly what row 8 of the real sheet shows.
    expect(within(row).getAllByText("12.63")).toHaveLength(2);
  });

  it("counts each scanned packet into the lot's pcs", async () => {
    await createKapan("41");
    await addLot(-2);
    await waitFor(() => lotRow(1));
    await pickLotOne();

    // Three packets, so three diamonds - one each.
    await scan(2.0, 0.4);
    await scan(3.0, 0.6);
    await scan(1.0, 0.2);
    await userEvent.click(screen.getByRole("button", { name: /Save to lot 1/i }));

    await openKapansTab();
    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 pcs")).toHaveValue("3")
    );
    // બા. નંગ agrees, because it is computed from that same figure.
    expect(within(lotRow(1)).getByText("3")).toBeInTheDocument();

    // Enter those three back and nothing is outstanding or amiss.
    await userEvent.type(within(lotRow(1)).getByLabelText("Lot 1 return pcs"), "3");
    await userEvent.tab();

    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 return pcs")).toHaveValue("3")
    );
    expect(lotRow(1).className).not.toMatch(/has-warning/);
  });

  it("adds a scan on top of a pcs figure already typed in", async () => {
    await createKapan("41");
    await addLot(-2);
    const row = await waitFor(() => lotRow(1));

    // The paper slip said 140 before anything was scanned.
    await userEvent.type(within(row).getByLabelText("Lot 1 pcs"), "140");
    await userEvent.tab();
    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 pcs")).toHaveValue("140")
    );

    await pickLotOne();
    await scan(2.0, 0.4);
    await scan(3.0, 0.6);
    await userEvent.click(screen.getByRole("button", { name: /Save to lot 1/i }));

    await openKapansTab();
    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 pcs")).toHaveValue("142")
    );
  });

  it("keeps scanning possible with no lot, holding packets out of the totals", async () => {
    await createKapan("41");
    await addLot(-2);
    await waitFor(() => lotRow(1));

    await goToScan();
    await scan(5.0, 1.0);
    await userEvent.click(screen.getByRole("button", { name: /Save Records/i }));

    // The save dialog appears because no lot is active.
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Kapan number/i), "41");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Save$/i }));

    await openKapansTab();
    expect(await screen.findByText(/1 packet not in a lot/i)).toBeInTheDocument();
    // Lot 1 is untouched: rough and polished are both still zero.
    expect(within(lotRow(1)).getAllByText("0.000")).toHaveLength(2);
  });

  it("files a tray packet into a lot, and the totals move with it", async () => {
    await createKapan("41");
    await addLot(-2);
    await waitFor(() => lotRow(1));

    await goToScan();
    await scan(7.348, 0.928);
    await userEvent.click(screen.getByRole("button", { name: /Save Records/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Kapan number/i), "41");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Save$/i }));

    await openKapansTab();
    // Open the tray, select the packet, move it into lot 1.
    await userEvent.click(await screen.findByText(/1 packet not in a lot/i));
    await userEvent.click(await screen.findByLabelText(/Select packet 1/i));
    const moveTo = screen.getByLabelText(/Move selected packets to/i);
    await userEvent.selectOptions(
      moveTo,
      within(moveTo).getByRole("option", { name: /Lot 1/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /^Move$/i }));

    await waitFor(() =>
      expect(within(lotRow(1)).getByText("7.348")).toBeInTheDocument()
    );
    // Pol % and Ghat % both, as above - the packet's carats are now the lot's.
    expect(within(lotRow(1)).getAllByText("12.63")).toHaveLength(2);
    // And the tray is empty, so the banner is gone entirely.
    expect(screen.queryByText(/not in a lot/i)).not.toBeInTheDocument();
  });
});

/* ========================================================================
   The shortcuts the plan promises. These were documented before they were
   built, which is exactly why they need naming in a test.
   ======================================================================== */

describe("keyboard shortcuts", () => {
  it("Ctrl+Z undoes the last change from inside the sheet", async () => {
    await createKapan("41");
    await addLot();
    await waitFor(() => lotRow(1));

    // Focus is always inside a cell input in this grid, so the window-level
    // binding would never see this - the cell handles it.
    await userEvent.click(within(lotRow(1)).getByLabelText("Lot 1 charmi"));
    await userEvent.keyboard("{ctrl}z{/ctrl}");

    await waitFor(() =>
      expect(screen.getByText(/No lots in this Kapan yet/i)).toBeInTheDocument()
    );
  });

  it("Ctrl+Z in a half-typed cell reverts the typing instead", async () => {
    await createKapan("41");
    await addLot(-2);
    await waitFor(() => lotRow(1));

    const charmi = within(lotRow(1)).getByLabelText("Lot 1 charmi");
    await userEvent.clear(charmi);
    await userEvent.type(charmi, "999");
    await userEvent.keyboard("{ctrl}z{/ctrl}");

    // The cell goes back to -2 and the lot is still there - the change was
    // never committed, so there was nothing at the data level to undo.
    await waitFor(() =>
      expect(within(lotRow(1)).getByLabelText("Lot 1 charmi")).toHaveValue("-2")
    );
  });

  it("Ctrl+Z works from a screen with no sheet on it", async () => {
    await createKapan("41");
    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));
    await screen.findByText("41");

    await userEvent.keyboard("{ctrl}z{/ctrl}");

    // Undoing the Kapan's creation empties the list.
    await waitFor(() => expect(screen.getByText(/No Kapans yet/i)).toBeInTheDocument());
  });

  it("Ctrl+K opens the jump palette, including Kapans with no lots", async () => {
    await createKapan("41");
    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));

    await userEvent.keyboard("{ctrl}k{/ctrl}");

    const dialog = await screen.findByRole("dialog", { name: /Go to a Kapan or lot/i });
    // Kapan 41 has no lots yet, and that is exactly when you want to jump to it.
    expect(within(dialog).getByText(/whole Kapan/i)).toBeInTheDocument();
    // No "scan without a lot" escape hatch here - it would mean nothing.
    expect(
      within(dialog).queryByRole("button", { name: /Scan without a lot/i })
    ).not.toBeInTheDocument();
  });

  it("Ctrl+K jumps into the workbench", async () => {
    await createKapan("41");
    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));
    await screen.findByText("41");

    await userEvent.keyboard("{ctrl}k{/ctrl}");
    const dialog = await screen.findByRole("dialog", { name: /Go to a Kapan or lot/i });
    await userEvent.type(
      within(dialog).getByLabelText(/Search Kapans and lots/i),
      "41{enter}"
    );

    expect(await screen.findByRole("button", { name: /Renumber/i })).toBeInTheDocument();
  });

  it("slash focuses the search box", async () => {
    await createKapan("41");
    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));
    const box = await screen.findByPlaceholderText(/Kapan or season/i);

    await userEvent.click(document.body);
    await userEvent.keyboard("/");

    expect(box).toHaveFocus();
  });

  it("a typed slash still reaches the box it was typed into", async () => {
    await createKapan("41");
    await userEvent.click(screen.getByRole("button", { name: /All Kapans/i }));
    const box = await screen.findByPlaceholderText(/Kapan or season/i);

    // Otherwise nobody could ever search for "EX/3".
    await userEvent.type(box, "a/b");
    expect(box).toHaveValue("a/b");
  });
});
