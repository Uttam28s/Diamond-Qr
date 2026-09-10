import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DiamondLogo,
  IconAlert,
  IconCheck,
  IconClose,
  IconHome,
  IconKapans,
  IconLayers,
  IconReports,
  IconScan,
  IconSettings,
  IconUndo,
} from "./Icons";
import ScanForm from "./panels/ScanForm";
import SessionTable from "./panels/SessionTable";
import SaveModal from "./panels/SaveModal";
import ReportsScreen from "./panels/ReportsScreen";
import SettingsScreen from "./panels/SettingsScreen";
import KapanList from "./panels/KapanList";
import KapanWorkbench from "./panels/KapanWorkbench";
import KapanFormModal from "./panels/KapanFormModal";
import DeleteKapanModal from "./panels/DeleteKapanModal";
import LotPicker from "./panels/LotPicker";
import ActiveLotBar from "./panels/ActiveLotBar";
import ConnectionCard from "./panels/ConnectionCard";
import ReturnsQueue from "./panels/ReturnsQueue";
import { StoreProvider, useStore } from "../store/StoreContext";
import {
  ALL_SEASONS,
  selectDefaultSeason,
  selectKapanRows,
  selectKapanView,
  selectScanTarget,
  selectSeasons,
} from "../domain/selectors";
import {
  addPacket,
  createKapan,
  deleteKapan,
  kapanByNumber,
  updateKapan,
} from "../domain/operations";
import {
  ACTIVE_LOT_KEY,
  calculateTotals,
  DEFAULT_SETTINGS,
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

/**
 * What the topbar says about where the data is. "Offline Mode" was true of every
 * build until now and is still true of most of them - but on a client PC the data
 * is on another computer, and the header should not say otherwise.
 */
const TOPBAR_LABEL = {
  browser: "Offline Mode",
  standalone: "Offline Mode",
  host: "Host — serving this office",
  client: "Connected to office PC",
};

const NAV_ITEMS = [
  { key: "scan", label: "Scan", title: "Scan Packet", Icon: IconScan },
  { key: "kapans", label: "Kapans", title: "Kapans", Icon: IconKapans },
  // Returns get their own screen because they arrive weeks after the lot goes out,
  // and finding those rows inside the thirteen-column sheet is the slow part.
  { key: "returns", label: "Returns", title: "Returns", Icon: IconLayers },
  { key: "reports", label: "Reports", title: "Reports", Icon: IconReports },
  { key: "settings", label: "Settings", title: "Settings", Icon: IconSettings },
];

/** Whether a keystroke is landing in something the user is typing into. */
const isEditable = (target) => {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable
  );
};

/* ------------------------------------------------------------------ dialogs */

/**
 * Confirm with an optional second action. Deleting a lot that holds packets asks
 * a question with two useful answers rather than OK/Cancel, and the safe one is
 * the primary button so Enter never destroys scan data.
 */
const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  altLabel,
  onCancel,
  onConfirm,
  onAlt,
}) => {
  const confirmRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (confirmRef.current) confirmRef.current.focus();
  }, []);

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
          {altLabel && (
            <button type="button" className="button danger" onClick={onAlt}>
              {altLabel}
            </button>
          )}
          <button type="button" className="button primary" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------- the shell */

const Index = () => {
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const undoRef = useRef(null);

  const notify = useCallback((text, tone = "success", options = {}) => {
    setToast({ text, tone, undoable: !!options.undoable, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    // Undoable messages linger, because the Undo button is the point of them.
    const timer = setTimeout(() => setToast(null), toast.undoable ? 6500 : 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const requestConfirm = useCallback((request) => setConfirm(request), []);

  return (
    <StoreProvider notify={notify} deviceName="">
      <Workspace
        toast={toast}
        onDismissToast={() => setToast(null)}
        notify={notify}
        confirm={confirm}
        onConfirmRequest={requestConfirm}
        onConfirmClose={() => setConfirm(null)}
        undoRef={undoRef}
      />
    </StoreProvider>
  );
};

/* ----------------------------------------------------------------- workspace */

const Workspace = ({
  toast,
  onDismissToast,
  notify,
  confirm,
  onConfirmRequest,
  onConfirmClose,
}) => {
  const {
    state,
    status,
    loadError,
    run,
    undo,
    canUndo,
    role,
    readOnly,
    connection,
    queuedCount,
  } = useStore();
  const scanInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("scan");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  /* scanning session — transient and per-device, so it stays in local storage */
  const [currentCode, setCurrentCode] = useState("");
  const [previousCode, setPreviousCode] = useState("");
  const [scanSession, setScanSession] = useState([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  // Which lot the next scan goes into. Persisted per device, because a scan
  // station works one lot for a whole burst and restarting the app should not
  // silently start filing scans somewhere else.
  const [activeLotId, setActiveLotId] = useState(null);
  // "scan" (Ctrl+L) or "jump" (Ctrl+K); null when closed.
  const [pickerMode, setPickerMode] = useState(null);

  /* Kapan browsing */
  const [season, setSeason] = useState(ALL_SEASONS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [openKapanId, setOpenKapanId] = useState(null);
  const [kapanForm, setKapanForm] = useState(null); // {kapan} | {}
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    setScanSession(normalizeRecords(readJson(SESSION_STORAGE_KEY, [])));
    setSettings({ ...DEFAULT_SETTINGS, ...readJson(SETTINGS_STORAGE_KEY, {}) });
    setActiveLotId(readJson(ACTIVE_LOT_KEY, null));
  }, []);

  const persistActiveLot = useCallback((lotId) => {
    setActiveLotId(lotId);
    writeJson(ACTIVE_LOT_KEY, lotId);
  }, []);

  /**
   * Aim the scanner at one lot straight from its row in the sheet.
   *
   * The picker still exists for finding a lot from anywhere, but when the row is
   * already on screen and under the cursor, going through a dialog to re-type the
   * number it is showing is the slow way round.
   */
  const scanIntoLot = useCallback(
    (lotId) => {
      persistActiveLot(lotId);
      setActiveTab("scan");
    },
    [persistActiveLot]
  );

  /**
   * The unsaved scan session.
   *
   * `writeJson` returns false rather than throwing, and until now nothing looked.
   * That is the same silent-failure the Kapan data used to have: a full disk meant
   * the table showed scans that were not written anywhere, and closing the app lost
   * them without a word. The scans are still in memory and still saveable to a
   * Kapan, so this warns rather than blocks - but it does say so.
   */
  const persistSession = useCallback(
    (records) => {
      setScanSession(records);
      if (!writeJson(SESSION_STORAGE_KEY, records) && records.length) {
        notify(
          "This device is out of storage space, so the scan list could not be saved. Save these scans to a lot now — closing the app would lose them.",
          "error"
        );
      }
    },
    [notify]
  );

  // Only the host has anything to report here, and only for display.
  const [hostStatus, setHostStatus] = useState(null);
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.diamondQR : null;
    if (!bridge || role !== "host") return undefined;

    let stopped = false;
    const tick = async () => {
      const next = await bridge.host.status();
      if (!stopped) setHostStatus(next);
    };
    tick();
    const timer = setInterval(tick, 5000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [role]);

  const persistSettings = useCallback((next) => {
    setSettings(next);
    writeJson(SETTINGS_STORAGE_KEY, next);
  }, []);

  /* --------------------------------------------------------- derived data */

  const listing = useMemo(
    () => selectKapanRows(state, { season, search, sort }),
    [state, season, search, sort]
  );
  const allRows = useMemo(() => selectKapanRows(state, { sort: "recent" }).rows, [state]);
  const seasons = useMemo(() => selectSeasons(state), [state]);
  const openView = useMemo(
    () => (openKapanId ? selectKapanView(state, openKapanId) : null),
    [state, openKapanId]
  );
  const sessionTotals = useMemo(() => calculateTotals(scanSession), [scanSession]);
  // Resolved against live data, so a lot deleted while it was the scan target
  // simply falls back to Unassigned instead of swallowing the next burst.
  const scanTarget = useMemo(
    () => selectScanTarget(state, activeLotId),
    [state, activeLotId]
  );

  // A Kapan deleted while open should not leave the workbench showing a ghost.
  useEffect(() => {
    if (openKapanId && !state.kapans[openKapanId]) setOpenKapanId(null);
  }, [openKapanId, state.kapans]);

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
  // a burst is never lost. The sheet's cells are inputs, so they are excluded by
  // the same check and a scanner burst can never overwrite a cell being typed.
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

  /**
   * The window-level shortcuts.
   *
   *   Ctrl+L  pick the lot to scan into - used mid-burst with a scanner in the
   *           other hand, on whichever screen happens to be up
   *   Ctrl+K  go to a Kapan or lot
   *   Ctrl+Z  undo. The sheet handles its own Ctrl+Z, because focus there is always
   *           inside a cell input, and stops the event - so this covers the rest
   *   /       jump to the search box, when the screen has one
   */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) {
        const key = `${event.key}`.toLowerCase();

        if (key === "l") {
          event.preventDefault();
          setPickerMode("scan");
          return;
        }
        if (key === "k") {
          event.preventDefault();
          setPickerMode("jump");
          return;
        }
        if (key === "z") {
          event.preventDefault();
          undo();
        }
        return;
      }

      // Slash is an ordinary character, so it only means "search" when it is not
      // being typed into something.
      if (event.key === "/" && !isEditable(event.target)) {
        const box = document.querySelector('input[type="search"]');
        if (box) {
          event.preventDefault();
          box.focus();
          box.select();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  const handleScan = () => {
    const parsed = parseScanCode(currentCode);

    if (!parsed) {
      setCurrentCode("");
      notify(
        "Invalid scan. The code must end with the kachu and polished weight — e.g. 0.011,0.024,0.034,0.12,0.024,0.022",
        "error"
      );
      return;
    }

    persistSession([...scanSession, parsed]);
    setPreviousCode(parsed.rawCode);
    setCurrentCode("");
  };

  const handleClearSession = () => {
    onConfirmRequest({
      title: "Clear current session",
      message: `This removes all ${scanSession.length} unsaved scan(s) from the session table. Saved Kapans are not affected.`,
      confirmLabel: "Clear session",
      onConfirm: () => {
        persistSession([]);
        setCurrentCode("");
        setPreviousCode("");
        onConfirmClose();
        notify("Session cleared.");
      },
    });
  };

  /**
   * Saves the scanned session into a Kapan, and into one of its lots if the
   * owner picked one. With no lot picked the packets land in the Kapan's
   * unassigned tray rather than being refused - a scan must never wait on
   * paperwork.
   */
  /**
   * Commits the session into the active lot with no dialog at all. This is the
   * common path on a scan station: pick the lot once, then scan and save, scan
   * and save.
   */
  const handleSaveToActiveLot = async () => {
    if (!scanTarget) {
      setSaveModalOpen(true);
      return;
    }
    await commitSession({
      kapanId: scanTarget.kapan.id,
      lotId: scanTarget.lot.id,
      label: `Kapan ${scanTarget.kapan.number} lot ${scanTarget.lot.lotNo}`,
    });
  };

  /** Adds every session packet in one undoable step. */
  const commitSession = async ({ kapanId, lotId, label }) => {
    const records = scanSession;

    const outcome = await run((current) => {
      if (!current.kapans[kapanId]) {
        return { state: current, undo: null, error: "That Kapan no longer exists." };
      }

      let working = current;
      for (const record of records) {
        const step = addPacket(working, {
          kapanId,
          lotId: lotId || null,
          rawCode: record.rawCode,
          kachuWeight: record.kWeight,
          polishedWeight: record.pWeight,
          scannedAt: record.scannedAt,
          scannedOn: settings.deviceName || "",
        });
        if (step.error) return step;
        working = step.state;
      }

      return {
        state: working,
        undo: {
          label: `${records.length} packet(s) saved to ${label}`,
          // One inverse for the whole burst: undoing half a save would leave the
          // lot's weights wrong in a way nobody could see.
          apply: () => current,
        },
      };
    });

    if (!outcome.ok) return;

    persistSession([]);
    setPreviousCode("");
    setSaveModalOpen(false);
  };

  const handleSaveSession = async ({ kapanNumber, lotId }) => {
    if (!scanSession.length) {
      notify("Scan at least one packet before saving.", "error");
      return;
    }

    let kapan = kapanByNumber(state, kapanNumber);

    if (!kapan) {
      const created = await run((current) =>
        createKapan(current, {
          number: kapanNumber,
          season: selectDefaultSeason(state),
        })
      );
      if (!created.ok) return;
      // Read from the returned state, not the closure: React has not re-rendered
      // with the new Kapan yet.
      kapan = kapanByNumber(created.state, kapanNumber);
      if (!kapan) return;
    }

    await commitSession({
      kapanId: kapan.id,
      lotId: lotId || null,
      label: lotId
        ? `Kapan ${kapan.number} lot ${(state.lots[lotId] || {}).lotNo}`
        : `Kapan ${kapan.number} (Unassigned)`,
    });
  };

  /* --------------------------------------------------------------- Kapans */

  const submitKapanForm = async (fields) => {
    if (readOnly) return;
    const editing = kapanForm && kapanForm.kapan;
    const outcome = editing
      ? await run((current) => updateKapan(current, editing.id, fields))
      : await run((current) => createKapan(current, fields));

    if (!outcome.ok) return;
    setKapanForm(null);

    if (!editing) {
      const created = kapanByNumber(outcome.state || state, fields.number);
      if (created) {
        // Straight into the sheet, because the next thing anyone does after
        // creating a Kapan is add its lots.
        setOpenKapanId(created.id);
        setActiveTab("kapans");
      }
    }
  };

  const confirmDeleteKapan = async () => {
    if (readOnly) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    const outcome = await run((current) => deleteKapan(current, target.kapan.id));
    if (outcome.ok && openKapanId === target.kapan.id) setOpenKapanId(null);
  };

  const activeNav = NAV_ITEMS.find((item) => item.key === activeTab) || NAV_ITEMS[0];

  /* --------------------------------------------------------------- render */

  if (status === "error") {
    return (
      <div className="app-shell">
        <main className="workspace">
          <div className="fatal-screen">
            <h2>The saved data could not be opened</h2>
            <p>{loadError}</p>
            <p className="muted">
              Nothing has been changed or deleted. Restore a backup, or contact
              support before scanning anything else — starting fresh now would
              overwrite whatever is still on this device.
            </p>
          </div>
        </main>
      </div>
    );
  }

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

        <ConnectionCard
          role={role}
          connection={connection}
          queuedCount={queuedCount}
          hostStatus={hostStatus}
          readOnly={readOnly}
        />

        <p className="app-version">v{APP_VERSION}</p>
      </aside>

      <main className="workspace">
        <div className="topbar">
          <span className="topbar-item">
            <i
              className={`status-dot ${
                connection.status === "offline" || connection.status === "refused"
                  ? "is-warn"
                  : ""
              }`}
              aria-hidden="true"
            />
            {role === "client" && connection.status !== "online"
              ? "Office PC unreachable"
              : TOPBAR_LABEL[role] || "Offline Mode"}
            {queuedCount > 0 ? ` · ${queuedCount} to sync` : ""}
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
            title={canUndo ? "Undo the last change" : "Nothing to undo"}
            disabled={!canUndo}
            onClick={undo}
          >
            <IconUndo size={18} />
          </button>
          <button
            type="button"
            className="icon-button ghost"
            title="Settings"
            onClick={() => setActiveTab("settings")}
          >
            <IconSettings size={18} />
          </button>
        </div>

        <h2 className="page-title">
          {activeTab === "kapans" && openView
            ? `Kapan ${openView.kapan.number}`
            : activeNav.title}
        </h2>

        {activeTab === "scan" && (
          <div className="screen-scan">
            <ActiveLotBar
              target={scanTarget}
              onChange={() => setPickerMode("scan")}
              onClear={() => persistActiveLot(null)}
            />

            <div className="scan-grid">
              <ScanForm
                scanInputRef={scanInputRef}
                currentCode={currentCode}
                onCurrentCodeChange={setCurrentCode}
                onScanKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleScan();
                  }
                }}
                previousCode={previousCode}
                totals={sessionTotals}
                recordCount={scanSession.length}
                onSaveClick={handleSaveToActiveLot}
                saveLabel={
                  scanTarget
                    ? `Save to lot ${scanTarget.lot.lotNo}`
                    : "Save Records"
                }
              />
              <SessionTable
                records={scanSession}
                totals={sessionTotals}
                onClearSession={handleClearSession}
                onRemoveRecord={(id) => {
                  persistSession(scanSession.filter((record) => record.id !== id));
                  notify("Scan removed from the session.");
                }}
              />
            </div>
          </div>
        )}

        {activeTab === "kapans" &&
          (openView ? (
            <KapanWorkbench
              view={openView}
              allKapans={allRows}
              run={run}
              onNotify={notify}
              onConfirm={(request) =>
                onConfirmRequest({
                  ...request,
                  onConfirm: () => {
                    request.onConfirm();
                    onConfirmClose();
                  },
                  onAlt: request.onAlt
                    ? () => {
                        request.onAlt();
                        onConfirmClose();
                      }
                    : undefined,
                })
              }
              onBack={() => setOpenKapanId(null)}
              onSwitch={setOpenKapanId}
              onEdit={(kapan) => setKapanForm({ kapan })}
              onDelete={(kapan) => setDeleteTarget({ kapan, totals: openView.totals })}
              onScanInto={() => setPickerMode("scan")}
              onScanLot={scanIntoLot}
              activeLotId={activeLotId}
              onUndo={undo}
              readOnly={readOnly}
            />
          ) : (
            <KapanList
              rows={listing.rows}
              totals={listing.totals}
              unfilteredCount={listing.unfilteredCount}
              seasons={seasons}
              season={season}
              onSeasonChange={setSeason}
              search={search}
              onSearchChange={setSearch}
              sort={sort}
              onSortChange={setSort}
              onOpen={setOpenKapanId}
              onNew={() => setKapanForm({})}
              readOnly={readOnly}
            />
          ))}

        {activeTab === "returns" && (
          <ReturnsQueue
            state={state}
            run={run}
            onNotify={notify}
            onUndo={undo}
            readOnly={readOnly}
          />
        )}

        {activeTab === "reports" && <ReportsScreen state={state} />}

        {activeTab === "settings" && (
          <SettingsScreen
            settings={settings}
            onSettingsChange={persistSettings}
            rows={allRows}
            sessionCount={scanSession.length}
            onClearSession={handleClearSession}
            onDeleteKapan={(kapanId) => {
              const row = allRows.find((item) => item.kapan.id === kapanId);
              if (row) setDeleteTarget({ kapan: row.kapan, totals: row.totals });
            }}
            appVersion={APP_VERSION}
            role={role}
            connection={connection}
            queuedCount={queuedCount}
            readOnly={readOnly}
            notify={notify}
          />
        )}
      </main>

      {saveModalOpen && (
        <SaveModal
          kapanRows={allRows}
          recordCount={scanSession.length}
          totals={sessionTotals}
          onCancel={() => setSaveModalOpen(false)}
          onSave={handleSaveSession}
        />
      )}

      {pickerMode && (
        <LotPicker
          kapanRows={allRows}
          activeLotId={activeLotId}
          mode={pickerMode}
          onCancel={() => setPickerMode(null)}
          onPick={({ kapanId, lotId }) => {
            if (pickerMode === "jump") {
              setOpenKapanId(kapanId);
              setActiveTab("kapans");
            } else {
              persistActiveLot(lotId);
              setActiveTab("scan");
            }
            setPickerMode(null);
          }}
        />
      )}

      {kapanForm && (
        <KapanFormModal
          kapan={kapanForm.kapan}
          seasons={seasons}
          defaultSeason={selectDefaultSeason(state)}
          onCancel={() => setKapanForm(null)}
          onSubmit={submitKapanForm}
        />
      )}

      {deleteTarget && (
        <DeleteKapanModal
          kapan={deleteTarget.kapan}
          totals={deleteTarget.totals}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteKapan}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          altLabel={confirm.altLabel}
          onCancel={onConfirmClose}
          onConfirm={confirm.onConfirm}
          onAlt={confirm.onAlt}
        />
      )}

      {toast && (
        <div className={`toast tone-${toast.tone}`} role="status">
          {toast.tone === "error" ? <IconAlert size={17} /> : <IconCheck size={17} />}
          <span>{toast.text}</span>
          {toast.undoable && canUndo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                undo();
                onDismissToast();
              }}
            >
              <IconUndo size={13} />
              Undo
            </button>
          )}
          <button type="button" onClick={onDismissToast} title="Dismiss">
            <IconClose size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Index;
