import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DiamondLogo,
  IconAlert,
  IconCheck,
  IconClose,
  IconHome,
  IconKapans,
  IconReports,
  IconScan,
  IconSettings,
  IconWifi,
} from "./Icons";
import ScanForm from "./panels/ScanForm";
import SessionTable from "./panels/SessionTable";
import KapanHistory, { SORT_OPTIONS } from "./panels/KapanHistory";
import KapanDetail from "./panels/KapanDetail";
import SaveModal from "./panels/SaveModal";
import ReportsScreen from "./panels/ReportsScreen";
import SettingsScreen from "./panels/SettingsScreen";
import {
  buildKapanRows,
  calculateTotals,
  DEFAULT_SETTINGS,
  KAPAN_STORAGE_KEY,
  normalizeKapanNumber,
  normalizeKapans,
  normalizeRecords,
  parseScanCode,
  readJson,
  SESSION_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  writeJson,
} from "./utils";

// Injected from package.json "version" by the build/start scripts, so the version
// shown in Settings can never drift from the installer version.
const APP_VERSION = process.env.REACT_APP_VERSION || "2.1.0";

const NAV_ITEMS = [
  { key: "scan", label: "Scan", title: "Scan Packet", Icon: IconScan },
  { key: "kapans", label: "Kapans", title: "Kapan History", Icon: IconKapans },
  { key: "reports", label: "Reports", title: "Reports", Icon: IconReports },
  { key: "settings", label: "Settings", title: "Settings", Icon: IconSettings },
];

const sortRows = (rows, sort) => {
  const sorted = [...rows];

  switch (sort) {
    case "number":
      return sorted.sort((a, b) => a.kapanNumber.localeCompare(b.kapanNumber));
    case "yield":
      return sorted.sort(
        (a, b) => Number(b.totals.percentage) - Number(a.totals.percentage)
      );
    case "rough":
      return sorted.sort((a, b) => b.totals.kWeight - a.totals.kWeight);
    default:
      return sorted;
  }
};

const ConfirmDialog = ({ title, message, confirmLabel, onCancel, onConfirm }) => {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal modal-sm" role="dialog" aria-modal="true">
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-button ghost" onClick={onCancel} title="Close">
            <IconClose size={17} />
          </button>
        </header>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="button ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button danger" autoFocus onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};

const Index = () => {
  const scanInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("scan");
  const [currentCode, setCurrentCode] = useState("");
  const [previousCode, setPreviousCode] = useState("");
  const [scanSession, setScanSession] = useState([]);
  const [kapans, setKapans] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [kapanNumber, setKapanNumber] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(SORT_OPTIONS[0].key);
  const [page, setPage] = useState(1);
  const [selectedKapan, setSelectedKapan] = useState("");
  const [groupMode, setGroupMode] = useState("date");

  /* ------------------------------------------------------------ bootstrap */

  useEffect(() => {
    setScanSession(normalizeRecords(readJson(SESSION_STORAGE_KEY, [])));
    setKapans(normalizeKapans(readJson(KAPAN_STORAGE_KEY, {})));
    setSettings({ ...DEFAULT_SETTINGS, ...readJson(SETTINGS_STORAGE_KEY, {}) });
  }, []);

  const showToast = useCallback((text, tone = "success") => {
    setToast({ text, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  /* -------------------------------------------------------------- persist */

  const persistSession = useCallback((records) => {
    setScanSession(records);
    writeJson(SESSION_STORAGE_KEY, records);
  }, []);

  const persistKapans = useCallback((nextKapans) => {
    setKapans(nextKapans);
    writeJson(KAPAN_STORAGE_KEY, nextKapans);
  }, []);

  const persistSettings = useCallback((nextSettings) => {
    setSettings(nextSettings);
    writeJson(SETTINGS_STORAGE_KEY, nextSettings);
  }, []);

  /* --------------------------------------------------------- derived data */

  const sessionTotals = useMemo(() => calculateTotals(scanSession), [scanSession]);
  const allKapanRows = useMemo(() => buildKapanRows(kapans), [kapans]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = term
      ? allKapanRows.filter((kapan) =>
          kapan.kapanNumber.toLowerCase().includes(term)
        )
      : allKapanRows;
    return sortRows(matched, sort);
  }, [allKapanRows, search, sort]);

  const rowsPerPage = settings.rowsPerPage || DEFAULT_SETTINGS.rowsPerPage;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const safePage = Math.min(page, pageCount);
  const pagedRows = filteredRows.slice(
    (safePage - 1) * rowsPerPage,
    safePage * rowsPerPage
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, rowsPerPage]);

  const activeKapan = useMemo(() => {
    const found = allKapanRows.find((kapan) => kapan.kapanNumber === selectedKapan);
    return found || pagedRows[0] || allKapanRows[0] || null;
  }, [allKapanRows, pagedRows, selectedKapan]);

  useEffect(() => {
    if (!selectedKapan && allKapanRows.length) {
      setSelectedKapan(allKapanRows[0].kapanNumber);
    }
  }, [allKapanRows, selectedKapan]);

  const existingKapanNumbers = useMemo(
    () => allKapanRows.map((kapan) => kapan.kapanNumber),
    [allKapanRows]
  );

  /* ------------------------------------------------------------- scanning */

  const focusScanner = useCallback(() => {
    if (activeTab === "scan" && !saveModalOpen && !confirm && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [activeTab, saveModalOpen, confirm]);

  useEffect(() => {
    focusScanner();
  }, [focusScanner, scanSession.length]);

  // A hardware scanner types into whatever has focus. If nothing interactive is
  // focused, redirect the keystroke into the scan box so the first character of
  // a burst is never lost.
  useEffect(() => {
    if (activeTab !== "scan" || saveModalOpen || confirm) return undefined;

    const onKeyDown = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key.length !== 1) return;

      const active = document.activeElement;
      if (active && active.closest("input, textarea, select, button, a, [tabindex]")) {
        return;
      }

      event.preventDefault();
      focusScanner();
      setCurrentCode((previous) => previous + event.key);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeTab, saveModalOpen, confirm, focusScanner]);

  const handleScan = () => {
    const parsed = parseScanCode(currentCode);

    if (!parsed) {
      // Clear the box as well: leaving a bad read in place would let the next
      // scanner burst append to it and silently record a corrupted code.
      setCurrentCode("");
      showToast(
        "Invalid scan. The code must end with the kachu and polished weight — e.g. 0.011,0.024,0.034,0.12,0.024,0.022",
        "error"
      );
      return;
    }

    // Every scan is its own packet — the same code may legitimately be read
    // again, so repeats are appended rather than rejected.
    persistSession([...scanSession, parsed]);
    setPreviousCode(parsed.rawCode);
    setCurrentCode("");
  };

  const handleScanKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleScan();
    }
  };

  const handleRemoveRecord = (id) => {
    persistSession(scanSession.filter((record) => record.id !== id));
    showToast("Scan removed from the session.");
  };

  const handleClearSession = () => {
    setConfirm({
      title: "Clear current session",
      message: `This removes all ${scanSession.length} unsaved scan(s) from the session table. Saved Kapans are not affected.`,
      confirmLabel: "Clear session",
      onConfirm: () => {
        persistSession([]);
        setCurrentCode("");
        setPreviousCode("");
        setConfirm(null);
        showToast("Session cleared.");
      },
    });
  };

  /* ---------------------------------------------------------------- saving */

  const handleSaveRecords = () => {
    const normalized = normalizeKapanNumber(kapanNumber);

    if (!normalized) {
      showToast("Enter a Kapan number before saving.", "error");
      return;
    }

    if (!scanSession.length) {
      showToast("Scan at least one packet before saving.", "error");
      return;
    }

    const now = new Date().toISOString();
    const existing = kapans[normalized];
    const savedCount = scanSession.length;

    persistKapans({
      ...kapans,
      [normalized]: {
        kapanNumber: normalized,
        createdAt: (existing && existing.createdAt) || now,
        updatedAt: now,
        records: [...((existing && existing.records) || []), ...scanSession],
      },
    });

    persistSession([]);
    setSelectedKapan(normalized);
    setKapanNumber("");
    setSaveModalOpen(false);
    setPreviousCode("");
    setSearch("");
    setPage(1);
    showToast(
      `${savedCount} record(s) ${existing ? "added to" : "saved as"} ${normalized}.`
    );
  };

  const handleDeleteKapan = (number) => {
    setConfirm({
      title: `Delete ${number}`,
      message: `All packet records stored under ${number} will be permanently removed.`,
      confirmLabel: "Delete Kapan",
      onConfirm: () => {
        const next = { ...kapans };
        delete next[number];
        persistKapans(next);
        if (selectedKapan === number) setSelectedKapan("");
        setConfirm(null);
        showToast(`${number} deleted.`);
      },
    });
  };

  const handleDeleteAll = () => {
    setConfirm({
      title: "Delete all data",
      message:
        "Every Kapan, packet record and the current scan session will be permanently removed from this device.",
      confirmLabel: "Delete everything",
      onConfirm: () => {
        persistKapans({});
        persistSession([]);
        setSelectedKapan("");
        setPreviousCode("");
        setCurrentCode("");
        setConfirm(null);
        showToast("All data deleted.");
      },
    });
  };

  const activeNav = NAV_ITEMS.find((item) => item.key === activeTab) || NAV_ITEMS[0];

  const kapanPanels = (
    <div className="kapan-grid">
      <KapanHistory
        rows={pagedRows}
        totalCount={allKapanRows.length}
        selectedKapan={activeKapan ? activeKapan.kapanNumber : ""}
        onSelect={setSelectedKapan}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
      />
      <KapanDetail
        kapan={activeKapan}
        groupMode={groupMode}
        onGroupModeChange={setGroupMode}
      />
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <DiamondLogo size={54} />
          <h1>Diamond QR</h1>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`nav-item ${activeTab === item.key ? "is-active" : ""}`}
              aria-current={activeTab === item.key ? "page" : undefined}
              onClick={() => setActiveTab(item.key)}
            >
              <item.Icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="offline-card">
          <p className="offline-title">
            <IconWifi size={17} />
            OFFLINE
          </p>
          <p className="offline-text">All data is stored locally on this device.</p>
        </div>

        <p className="app-version">v{APP_VERSION}</p>
      </aside>

      <main className="workspace">
        <div className="topbar">
          <span className="topbar-item">
            <i className="status-dot" aria-hidden="true" />
            Offline Mode
          </span>
          <span className="topbar-divider" aria-hidden="true" />
          <span className="topbar-item">
            <IconHome size={17} />
            {settings.officeName || DEFAULT_SETTINGS.officeName}
          </span>
          <span className="topbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="icon-button ghost"
            title="Settings"
            onClick={() => setActiveTab("settings")}
          >
            <IconSettings size={18} />
          </button>
        </div>

        <h2 className="page-title">{activeNav.title}</h2>

        {activeTab === "scan" && (
          <div className="screen-scan">
            <div className="scan-grid">
              <ScanForm
                scanInputRef={scanInputRef}
                currentCode={currentCode}
                onCurrentCodeChange={setCurrentCode}
                onScanKeyDown={handleScanKeyDown}
                previousCode={previousCode}
                totals={sessionTotals}
                recordCount={scanSession.length}
                onSaveClick={() => setSaveModalOpen(true)}
              />
              <SessionTable
                records={scanSession}
                totals={sessionTotals}
                onClearSession={handleClearSession}
                onRemoveRecord={handleRemoveRecord}
              />
            </div>

            {kapanPanels}
          </div>
        )}

        {activeTab === "kapans" && <div className="screen-kapans">{kapanPanels}</div>}

        {activeTab === "reports" && <ReportsScreen kapanRows={allKapanRows} />}

        {activeTab === "settings" && (
          <SettingsScreen
            settings={settings}
            onSettingsChange={persistSettings}
            kapanRows={allKapanRows}
            sessionCount={scanSession.length}
            onClearSession={handleClearSession}
            onDeleteKapan={handleDeleteKapan}
            onDeleteAll={handleDeleteAll}
            appVersion={APP_VERSION}
          />
        )}
      </main>

      {saveModalOpen && (
        <SaveModal
          kapanNumber={kapanNumber}
          onKapanNumberChange={setKapanNumber}
          recordCount={scanSession.length}
          totals={sessionTotals}
          existingKapans={existingKapanNumbers}
          onCancel={() => {
            setSaveModalOpen(false);
            setKapanNumber("");
          }}
          onSave={handleSaveRecords}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}

      {toast && (
        <div className={`toast tone-${toast.tone}`} role="status">
          {toast.tone === "error" ? <IconAlert size={17} /> : <IconCheck size={17} />}
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} title="Dismiss">
            <IconClose size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Index;
