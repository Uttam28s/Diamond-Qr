import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Index from "./Index";
import { emptyState } from "../domain/operations";

/**
 * The Office / Scan station split, driven through a stand-in for the Electron
 * bridge so the real adapter-selection path is exercised rather than bypassed.
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

/** A fake main process holding state in memory. */
const installBridge = (config, seed = emptyState()) => {
  let stored = seed;

  window.diamondQR = {
    getConfig: async () => ({
      role: "standalone",
      mode: "office",
      deviceName: "TEST-PC",
      deviceId: "device-1",
      hostAddress: "",
      hostToken: "",
      serverPort: 7311,
      serverToken: "",
      ...config,
    }),
    setConfig: async () => ({ ok: true, config, restartRequired: false }),
    appInfo: async () => ({ version: "2.1.0", userData: "C:/tmp" }),
    relaunch: () => {},
    data: {
      load: async () => ({ ok: true, state: stored, version: 1 }),
      save: async (state) => {
        stored = state;
        return { ok: true, version: 2 };
      },
      backup: async () => ({ ok: true, path: "backup.json" }),
      stats: async () => ({ ok: true, journalLines: 0 }),
    },
    host: {
      status: async () => ({
        role: config.role || "standalone",
        running: config.role === "host",
        port: 7311,
        error: "",
        urls: [{ name: "Ethernet", address: "192.168.1.42", url: "http://192.168.1.42:7311" }],
        seats: 3,
        clients: [{ name: "SCAN-1", lastSeen: new Date().toISOString() }],
      }),
    },
  };
};

afterEach(() => {
  delete window.diamondQR;
  window.localStorage.clear();
});

const seeded = () => {
  const state = emptyState();
  state.kapans.k1 = {
    id: "k1",
    number: "41",
    season: "25-26",
    createdAt: "2026-01-17",
    targetAt: null,
    updatedAt: "2026-01-17T00:00:00.000Z",
  };
  state.lots.l1 = {
    id: "l1",
    kapanId: "k1",
    lotNo: 1,
    lotDate: "2026-07-17",
    pcs: 142,
    charmi: -2,
    returnPcs: null,
    returnWeight: null,
    returnDate: null,
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
  return state;
};

const openKapans = () => userEvent.click(screen.getByRole("button", { name: /Kapans/i }));

describe("an office PC", () => {
  it("reads its data through the bridge, not browser storage", async () => {
    installBridge({ role: "standalone", mode: "office" }, seeded());
    render(<Index />);
    await openKapans();

    expect(await screen.findByText("41")).toBeInTheDocument();
    // Nothing was written to localStorage - the data came from the main process.
    expect(window.localStorage.getItem("diamondQrData")).toBeNull();
  });

  it("can create, edit and delete", async () => {
    installBridge({ role: "standalone", mode: "office" }, seeded());
    render(<Index />);
    await openKapans();

    expect(await screen.findByRole("button", { name: /New Kapan/i })).toBeInTheDocument();
    await userEvent.click(await screen.findByText("41"));
    expect(await screen.findByRole("button", { name: /^Delete$/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Add lot 2")).toBeInTheDocument();
  });
});

describe("a scan station", () => {
  const asStation = () =>
    installBridge({ role: "client", mode: "station" }, seeded());

  it("says what it is, in the sidebar", async () => {
    installBridge({ role: "standalone", mode: "station" }, seeded());
    render(<Index />);

    expect(
      await screen.findByText(/Scan station — lots and Kapans are read-only here/i)
    ).toBeInTheDocument();
  });

  it("cannot create a Kapan", async () => {
    installBridge({ role: "standalone", mode: "station" }, seeded());
    render(<Index />);
    await openKapans();

    await screen.findByText("41");
    expect(screen.queryByRole("button", { name: /New Kapan/i })).not.toBeInTheDocument();
  });

  it("can read the sheet but not edit or delete it", async () => {
    installBridge({ role: "standalone", mode: "station" }, seeded());
    render(<Index />);
    await openKapans();

    await userEvent.click(await screen.findByText("41"));

    // The figures are all there to read.
    expect(await screen.findByText("કા. નંગ")).toBeInTheDocument();
    const row = screen.getByTitle(/in lot 1$/).closest("tr");
    expect(within(row).getByLabelText("Lot 1 pcs")).toBeDisabled();
    expect(within(row).getByLabelText("Lot 1 charmi")).toBeDisabled();

    // But none of the ways to change things.
    expect(screen.queryByRole("button", { name: /^Delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Renumber/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Add lot \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New lot charmi")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Delete lot 1/i)).not.toBeInTheDocument();
  });

  it("can still scan, which is the whole point of it", async () => {
    asStation();
    render(<Index />);

    // Client mode with an unreachable host still opens the scan screen; the load
    // failure is about the network, tested separately in remoteAdapter.test.js.
    await waitFor(() => expect(screen.getByText(/Diamond QR/i)).toBeInTheDocument());
  });
});

describe("a host PC", () => {
  it("shows the address to type into the other computers", async () => {
    installBridge({ role: "host", mode: "office" }, seeded());
    render(<Index />);

    // The sidebar card reports the role rather than claiming to be offline.
    expect(await screen.findByText(/^HOST$/)).toBeInTheDocument();
    expect(
      await screen.findByText(/This PC holds the data/i)
    ).toBeInTheDocument();

    // Scoped to the nav: the topbar also has a Settings button with the same
    // accessible name.
    await userEvent.click(
      within(screen.getByRole("navigation")).getByRole("button", { name: /Settings/i })
    );
    expect(await screen.findByText("http://192.168.1.42:7311")).toBeInTheDocument();
    expect(screen.getByText(/SCAN-1/)).toBeInTheDocument();
  });
});

describe("a broken installation", () => {
  const realAgent = navigator.userAgent;

  const pretendElectron = (on) =>
    Object.defineProperty(navigator, "userAgent", {
      value: on
        ? "Mozilla/5.0 Chrome/100.0.0.0 Electron/18.3.15 Safari/537.36"
        : realAgent,
      configurable: true,
    });

  afterEach(() => pretendElectron(false));

  it("refuses to open rather than silently using browser storage", async () => {
    // Electron with no bridge means the preload did not load, which is what a
    // packaging mistake looks like from in here. Falling back to browser storage
    // would quietly put a factory's Kapans somewhere nobody would think to look.
    pretendElectron(true);
    delete window.diamondQR;

    render(<Index />);

    expect(
      await screen.findByText(/The saved data could not be opened/i)
    ).toBeInTheDocument();
    expect(await screen.findByText(/installation is incomplete/i)).toBeInTheDocument();
    expect(window.localStorage.getItem("diamondQrData")).toBeNull();
  });

  it("still falls back to browser storage in a real browser", async () => {
    // npm start and the test suite both rely on this path.
    pretendElectron(false);
    delete window.diamondQR;

    render(<Index />);
    await userEvent.click(screen.getByRole("button", { name: /Kapans/i }));

    expect(await screen.findByRole("button", { name: /New Kapan/i })).toBeInTheDocument();
  });
});
