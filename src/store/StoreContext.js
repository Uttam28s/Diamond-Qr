import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createStore } from "../domain/store";
import { emptyState } from "../domain/operations";
import { CONNECTION, MODE, resolveAdapter, ROLE } from "./resolveAdapter";

/**
 * Binds the data store to React.
 *
 * A context rather than props, because the lot sheet edits cells six levels below
 * the screen that owns the data and threading a callback down there would mean
 * every intermediate component knowing about persistence.
 *
 * Where the data actually lives - this PC's disk, another PC over the LAN, or
 * browser storage in development - is decided once here and nowhere else. No
 * screen above this file knows the difference.
 *
 * `notify` is supplied by the shell so the toast UI stays in one place: this
 * provider decides *that* something needs saying, not how it looks.
 */

const StoreContext = createContext(null);

export const StoreProvider = ({ adapter: fixedAdapter, deviceName = "", notify, children }) => {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const [state, setState] = useState(emptyState);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [undoTick, setUndoTick] = useState(0);

  // How this PC is set up, and how the connection is doing. Both are display-only
  // as far as the data is concerned.
  const [device, setDevice] = useState({
    role: ROLE.BROWSER,
    mode: MODE.OFFICE,
    deviceName,
    config: null,
  });
  const [connection, setConnection] = useState({ status: CONNECTION.ONLINE, detail: "" });
  const [queued, setQueued] = useState(0);

  // The store is created once resolution finishes, so it cannot be built in a
  // useMemo off props like it used to be.
  const [store, setStore] = useState(null);
  const storeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    let stopPolling = () => {};

    const start = async () => {
      let resolved;

      try {
        resolved = fixedAdapter
          ? { adapter: fixedAdapter, role: ROLE.BROWSER, mode: MODE.OFFICE, deviceName }
          : await resolveAdapter({
              onStatus: (next, detail) => {
                if (!cancelled) setConnection({ status: next, detail: detail || "" });
              },
              // Another PC changed something. Reloading the whole state is the
              // simple correct move: at office scale the data is small and the
              // alternative is a merge nobody can verify.
              onRemoteChange: () => {
                if (!cancelled && storeRef.current) storeRef.current.load().catch(() => {});
              },
            });
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message);
          setStatus("error");
        }
        return;
      }

      if (cancelled) return;

      const created = createStore({
        adapter: resolved.adapter,
        deviceName: resolved.deviceName || deviceName,
      });
      storeRef.current = created;

      setDevice({
        role: resolved.role,
        mode: resolved.mode || MODE.OFFICE,
        deviceName: resolved.deviceName || deviceName,
        config: resolved.config || null,
      });

      unsubscribe = created.subscribe((next) => {
        if (cancelled) return;
        setState(next);
        if (resolved.adapter.queuedCount) setQueued(resolved.adapter.queuedCount());
      });

      try {
        await created.load();
        if (cancelled) return;
        setStore(created);
        setStatus("ready");
        if (resolved.adapter.queuedCount) setQueued(resolved.adapter.queuedCount());
        if (resolved.startPolling) stopPolling = resolved.startPolling();
      } catch (error) {
        if (cancelled) return;
        setLoadError(error.message);
        setStatus("error");
      }
    };

    start();

    return () => {
      cancelled = true;
      unsubscribe();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedAdapter, deviceName]);

  /** Reports the outcome of a change and keeps the undo label current. */
  const report = useCallback((outcome) => {
    setUndoTick((tick) => tick + 1);
    if (storeRef.current && storeRef.current.queuedCount) {
      setQueued(storeRef.current.queuedCount());
    }

    if (!outcome.ok) {
      if (notifyRef.current) notifyRef.current(outcome.error, "error");
      return outcome;
    }

    if (outcome.label && notifyRef.current) {
      notifyRef.current(outcome.label, "success", { undoable: true });
    }
    return outcome;
  }, []);

  const run = useCallback(
    async (operation) => {
      if (!storeRef.current) return { ok: false, error: "Still opening the data." };
      return report(await storeRef.current.run(operation));
    },
    [report]
  );

  const runAll = useCallback(
    async (operations) => {
      if (!storeRef.current) return { ok: false, error: "Still opening the data." };
      return report(await storeRef.current.runAll(operations));
    },
    [report]
  );

  const undo = useCallback(async () => {
    if (!storeRef.current) return { ok: false, error: "Nothing to undo." };
    const outcome = await storeRef.current.undo();
    setUndoTick((tick) => tick + 1);
    if (notifyRef.current) {
      notifyRef.current(
        outcome.ok ? outcome.label : outcome.error,
        outcome.ok ? "success" : "error"
      );
    }
    return outcome;
  }, []);

  const value = useMemo(
    () => ({
      state,
      status,
      loadError,
      run,
      runAll,
      undo,
      canUndo: store ? store.canUndo() : false,
      nextUndoLabel: store ? store.nextUndoLabel() : "",
      exportBackup: () => (store ? store.exportBackup() : "{}"),
      importBackup: async (json) =>
        store ? report(await store.importBackup(json)) : { ok: false, error: "Not ready." },
      deviceName: device.deviceName,
      role: device.role,
      // A scan station can scan and read, but not edit or delete. Set once per PC
      // in Settings; no login screen, which is what the admin guide is proud of.
      readOnly: device.mode === MODE.STATION,
      config: device.config,
      connection,
      queuedCount: queued,
    }),
    // undoTick is a dependency on purpose: canUndo and nextUndoLabel are read
    // imperatively, so without it the Undo button would keep a stale label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, status, loadError, run, runAll, undo, store, report, undoTick, device, connection, queued]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used inside a StoreProvider.");
  }
  return context;
};

export { CONNECTION, MODE, ROLE };
