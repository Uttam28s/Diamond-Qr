/**
 * The client side of the host connection: a persistence adapter that talks to
 * another PC instead of to this one's disk.
 *
 * It plugs into `createStore` exactly where the local adapter does, which is what
 * keeps the whole UI unaware that the data lives on another machine.
 *
 * Two rules make the offline behaviour safe rather than hopeful:
 *
 *   1. A change that only adds packets is queued when the host is unreachable and
 *      the save reports success, so scanning never stops. Packets only ever get
 *      added, so a queued burst cannot conflict with anything.
 *
 *   2. Any other change - a lot edited, a Kapan deleted - fails loudly when the
 *      host is unreachable. The store then rolls the screen back, so nobody edits
 *      a figure believing it was saved.
 */

import { computeDelta, isAdditiveOnly, mergeDeltas } from "./delta";
import { SCHEMA_VERSION } from "./model";

export const CONNECTION = {
  CONNECTING: "connecting",
  ONLINE: "online",
  OFFLINE: "offline",
  REFUSED: "refused",
};

const QUEUE_KEY = "diamondQrOutbox";

/** Reads and writes the outbox. Survives a restart, which is the point of it. */
const createOutbox = (storage, key = QUEUE_KEY) => ({
  read() {
    try {
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  },
  write(deltas) {
    try {
      storage.setItem(key, JSON.stringify(deltas));
      return true;
    } catch (error) {
      // If the outbox itself cannot be written there is nowhere left to put the
      // scan, and saying so is the only honest option.
      throw new Error(
        "This device is out of storage space, so the scan could not be queued."
      );
    }
  },
  clear() {
    try {
      storage.removeItem(key);
    } catch (error) {
      /* nothing useful to do */
    }
  },
});

export const createRemoteAdapter = ({
  baseUrl,
  deviceId,
  deviceName = "",
  token = "",
  storage,
  fetchImpl,
  onStatus,
  onRemoteChange,
  timeoutMs = 6000,
}) => {
  if (!baseUrl) throw new Error("createRemoteAdapter needs the host address.");

  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) throw new Error("No fetch available for the host connection.");

  const outbox = createOutbox(
    storage || (typeof window !== "undefined" ? window.localStorage : null)
  );

  let hostVersion = 0;
  let lastSent = null;
  let status = CONNECTION.CONNECTING;

  const setStatus = (next, detail) => {
    if (status === next) return;
    status = next;
    if (onStatus) onStatus(next, detail);
  };

  const call = async (path, options = {}) => {
    // AbortController rather than relying on the OS timeout: a host that is
    // powered off looks like a socket that never answers, and a scan station
    // must not hang for thirty seconds on it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
          "x-device-name": deviceName,
          ...(token ? { "x-token": token } : {}),
          ...(options.headers || {}),
        },
      });

      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      return { status: response.status, ok: response.ok, body };
    } finally {
      clearTimeout(timer);
    }
  };

  /* ------------------------------------------------------------------ load */

  const load = async () => {
    let result;
    try {
      result = await call("/state");
    } catch (error) {
      setStatus(CONNECTION.OFFLINE, error.message);
      throw new Error(
        `Cannot reach the host at ${baseUrl}. Check that the office PC is switched on and the app is open on it.`
      );
    }

    if (result.status === 403 || result.status === 401) {
      setStatus(CONNECTION.REFUSED, result.body && result.body.error);
      throw new Error((result.body && result.body.error) || "The host refused this device.");
    }

    if (!result.ok) {
      setStatus(CONNECTION.OFFLINE);
      throw new Error((result.body && result.body.error) || "The host returned an error.");
    }

    const { state, version } = result.body;

    if (state.schema !== SCHEMA_VERSION) {
      throw new Error(
        `The host is running a different version (schema ${state.schema}, this PC reads ${SCHEMA_VERSION}). Update both to the same version.`
      );
    }

    hostVersion = version;
    lastSent = state;
    setStatus(CONNECTION.ONLINE);

    // Anything scanned while offline goes up before the first render, so the
    // screen never shows a state that is missing this device's own work.
    await flush();

    return lastSent;
  };

  /* ------------------------------------------------------------------ save */

  const push = async (delta, baseVersion) => {
    const result = await call("/commit", {
      method: "POST",
      body: JSON.stringify({ delta, baseVersion }),
    });

    if (result.status === 409) {
      hostVersion = (result.body && result.body.version) || hostVersion;
      if (onRemoteChange) onRemoteChange();
      throw new Error(
        "Another computer changed this first, so your edit was not saved. The screen has been refreshed — please make the change again."
      );
    }

    if (result.status === 403 || result.status === 401) {
      setStatus(CONNECTION.REFUSED, result.body && result.body.error);
      throw new Error((result.body && result.body.error) || "The host refused this device.");
    }

    if (!result.ok) {
      throw new Error((result.body && result.body.error) || "The host rejected the change.");
    }

    hostVersion = result.body.version;
    setStatus(CONNECTION.ONLINE);
  };

  const save = async (next) => {
    const delta = computeDelta(lastSent, next);

    if (!delta) {
      lastSent = next;
      return;
    }

    try {
      await push(delta, hostVersion);
      lastSent = next;
      return;
    } catch (error) {
      // A refusal or a conflict is an answer from the host, not a connection
      // problem: queueing it would send it again forever.
      if (status === CONNECTION.REFUSED || /changed this first/.test(error.message)) {
        throw error;
      }

      if (!isAdditiveOnly(delta)) {
        setStatus(CONNECTION.OFFLINE, error.message);
        throw new Error(
          `The host could not be reached, so this change was not saved. Scanning still works and will sync later, but edits need the office PC. (${error.message})`
        );
      }

      // Scans queue and the save reports success, because on the factory floor
      // the alternative is telling someone to stop working.
      outbox.write([...outbox.read(), delta]);
      lastSent = next;
      setStatus(CONNECTION.OFFLINE, error.message);
    }
  };

  /* ----------------------------------------------------------------- flush */

  const flush = async () => {
    const queued = outbox.read();
    if (!queued.length) return { sent: 0 };

    // One request for the whole backlog: fifty queued scans should not be fifty
    // round trips when the host comes back.
    const merged = mergeDeltas(queued);

    try {
      await push(merged, hostVersion);
      outbox.clear();
      return { sent: queued.length };
    } catch (error) {
      setStatus(CONNECTION.OFFLINE, error.message);
      return { sent: 0, error: error.message };
    }
  };

  /* ------------------------------------------------------------ heartbeat */

  /**
   * Polls the host's version rather than streaming changes. At three to five
   * computers making a handful of edits a minute, a small request every couple of
   * seconds is far simpler than a socket to keep alive, and the client refetches
   * the whole state only when the version actually moves.
   */
  const startPolling = (intervalMs = 2500) => {
    let stopped = false;

    const tick = async () => {
      if (stopped) return;

      try {
        const result = await call("/ping");
        if (result.ok) {
          setStatus(CONNECTION.ONLINE);
          if (outbox.read().length) await flush();
          if (result.body.version !== hostVersion && onRemoteChange) {
            onRemoteChange();
          }
        }
      } catch (error) {
        setStatus(CONNECTION.OFFLINE, error.message);
      }
    };

    const timer = setInterval(tick, intervalMs);
    tick();

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  };

  return {
    name: "remote",
    load,
    save,
    flush,
    startPolling,
    getStatus: () => status,
    getHostVersion: () => hostVersion,
    queuedCount: () => outbox.read().length,
  };
};
