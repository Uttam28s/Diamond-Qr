import React, { useEffect, useState } from "react";
import { IconAlert, IconChevronDown, IconCheck, IconLayers } from "../Icons";
import { formatDateTime } from "../../domain/format";
import { ROLE } from "../../store/StoreContext";

/**
 * How this computer is set up: its name, what it does, and how it reaches the data.
 *
 * Deliberately one screen with all of it visible rather than a wizard. This gets
 * filled in once per PC, usually by whoever is installing, and a wizard would hide
 * the one field they need to check when it does not work.
 */
const DeviceSettings = ({ role, config, connection, queuedCount, notify }) => {
  const bridge = typeof window !== "undefined" ? window.diamondQR : null;

  const [draft, setDraft] = useState(null);
  const [hostStatus, setHostStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restartNeeded, setRestartNeeded] = useState(false);

  useEffect(() => {
    if (config) setDraft({ ...config });
  }, [config]);

  // Polled rather than pushed: the only thing that changes is which PCs are
  // connected, and a few seconds of staleness on a settings screen costs nothing.
  useEffect(() => {
    if (!bridge || role !== ROLE.HOST) return undefined;

    let stopped = false;
    const tick = async () => {
      const status = await bridge.host.status();
      if (!stopped) setHostStatus(status);
    };
    tick();
    const timer = setInterval(tick, 4000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [bridge, role]);

  if (!bridge || !draft) {
    return (
      <section className="panel" aria-label="This computer">
        <header className="panel-head">
          <h3>This computer</h3>
        </header>
        <div className="settings-body">
          <p className="field-hint">
            Running in a browser, so there is nothing to configure — data is kept in
            browser storage. These settings appear in the installed app.
          </p>
        </div>
      </section>
    );
  }

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const apply = async () => {
    setBusy(true);
    const result = await bridge.setConfig({
      role: draft.role,
      mode: draft.mode,
      deviceName: draft.deviceName,
      hostAddress: draft.hostAddress,
      hostToken: draft.hostToken,
      serverPort: Number(draft.serverPort),
      serverToken: draft.serverToken,
    });
    setBusy(false);

    if (!result.ok) {
      notify(result.error, "error");
      return;
    }

    setDraft({ ...draft, ...result.config });
    if (result.restartRequired) {
      setRestartNeeded(true);
      notify("Saved. Restart the app to apply it.", "success");
    } else {
      notify("Saved.");
    }
  };

  const testHost = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${draft.hostAddress || ""}/ping`, {
        headers: draft.hostToken ? { "x-token": draft.hostToken } : {},
      });
      const body = await response.json();
      if (response.ok) {
        notify(
          `Reached the host. ${body.seatsUsed} of ${body.seats || "unlimited"} computer(s) in use.`
        );
      } else {
        notify(body.error || "The host refused the connection.", "error");
      }
    } catch (error) {
      notify(
        "Could not reach that address. Check the office PC is on, the app is open on it, and the address is right.",
        "error"
      );
    }
    setBusy(false);
  };

  return (
    <section className="panel" aria-label="This computer">
      <header className="panel-head">
        <h3>This computer</h3>
        <div className="panel-tools">
          <span className="badge">{draft.deviceName}</span>
        </div>
      </header>

      <div className="settings-body">
        {restartNeeded && (
          <div className="restart-banner">
            <IconAlert size={15} />
            <span>These changes need a restart before they take effect.</span>
            <button type="button" className="button primary small" onClick={bridge.relaunch}>
              Restart now
            </button>
          </div>
        )}

        <label className="field-label" htmlFor="device-name">
          Computer name
        </label>
        <input
          id="device-name"
          className="text-input"
          value={draft.deviceName}
          onChange={(event) => set({ deviceName: event.target.value })}
        />
        <p className="field-hint">
          Recorded against every packet this PC scans, so a wrong number can be traced
          back to where it came from.
        </p>

        <label className="field-label" htmlFor="device-mode">
          What this computer is for
        </label>
        <label className="select-wrap block">
          <select
            id="device-mode"
            value={draft.mode}
            onChange={(event) => set({ mode: event.target.value })}
          >
            <option value="office">Office — can do everything</option>
            <option value="station">Scan station — scan and view only</option>
          </select>
          <IconChevronDown size={15} />
        </label>
        <p className="field-hint">
          A scan station can scan, pick lots and read the sheet, but cannot edit or
          delete lots and Kapans. No password — it prevents accidents on the floor,
          not deliberate misuse.
        </p>

        <label className="field-label" htmlFor="device-role">
          Where the data lives
        </label>
        <label className="select-wrap block">
          <select
            id="device-role"
            value={draft.role}
            onChange={(event) => set({ role: event.target.value })}
          >
            <option value="standalone">On this PC only — no other computers</option>
            <option value="host">On this PC, and serve the other computers</option>
            <option value="client">On another PC — connect to it</option>
          </select>
          <IconChevronDown size={15} />
        </label>

        {draft.role === "client" && (
          <div className="settings-sub">
            <label className="field-label" htmlFor="host-address">
              Office PC address
            </label>
            <input
              id="host-address"
              className="text-input"
              value={draft.hostAddress}
              placeholder="192.168.1.42:7311"
              onChange={(event) => set({ hostAddress: event.target.value })}
            />
            <p className="field-hint">
              The office PC shows this in its own Settings. A bare IP is fine — the
              port is added for you.
            </p>

            <label className="field-label" htmlFor="host-token">
              Host password <span className="muted">(only if the host set one)</span>
            </label>
            <input
              id="host-token"
              className="text-input"
              value={draft.hostToken}
              onChange={(event) => set({ hostToken: event.target.value })}
            />

            <button
              type="button"
              className="button ghost small"
              disabled={busy || !draft.hostAddress}
              onClick={testHost}
            >
              <IconCheck size={15} />
              Test connection
            </button>

            {role === ROLE.CLIENT && (
              <p className="field-hint">
                Currently <strong>{connection.status}</strong>
                {queuedCount ? ` · ${queuedCount} change(s) waiting to upload` : ""}
                {connection.detail ? ` — ${connection.detail}` : ""}
              </p>
            )}
          </div>
        )}

        {draft.role === "host" && (
          <div className="settings-sub">
            <label className="field-label" htmlFor="server-port">
              Port
            </label>
            <input
              id="server-port"
              className="text-input short"
              value={draft.serverPort}
              onChange={(event) => set({ serverPort: event.target.value })}
            />

            <label className="field-label" htmlFor="server-token">
              Host password <span className="muted">(optional)</span>
            </label>
            <input
              id="server-token"
              className="text-input"
              value={draft.serverToken}
              placeholder="leave blank for none"
              onChange={(event) => set({ serverToken: event.target.value })}
            />
            <p className="field-hint">
              Stops another program on the network writing to the database by
              accident. It is not protection against someone on your network who
              wants in.
            </p>

            {hostStatus && hostStatus.running && (
              <div className="host-panel">
                <p className="field-label">Type this into the other computers</p>
                {hostStatus.urls.length ? (
                  hostStatus.urls.map((entry) => (
                    <p className="host-url" key={entry.url}>
                      <code>{entry.url}</code>
                      <span className="muted small">{entry.name}</span>
                    </p>
                  ))
                ) : (
                  <p className="field-hint">
                    This PC has no network address yet — check the network cable or
                    Wi-Fi.
                  </p>
                )}

                <p className="field-label">
                  Connected computers ({hostStatus.clients.length}
                  {hostStatus.seats ? ` of ${hostStatus.seats}` : ""})
                </p>
                {hostStatus.clients.length ? (
                  <ul className="client-list">
                    {hostStatus.clients.map((client) => (
                      <li key={client.name}>
                        <IconLayers size={13} />
                        <strong>{client.name}</strong>
                        <span className="muted small">
                          last seen {formatDateTime(client.lastSeen)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="field-hint">
                    None yet. Set the other PCs to “On another PC” and give them the
                    address above.
                  </p>
                )}
              </div>
            )}

            {hostStatus && !hostStatus.running && (
              <p className="modal-error">
                {hostStatus.error || "The server is not running. Restart the app."}
              </p>
            )}
          </div>
        )}

        <div className="settings-row">
          <div>
            <strong>Windows Firewall</strong>
            <p>
              The first time this PC hosts, Windows asks whether to allow the app on
              the network. Say yes for private networks, or no other computer can
              connect.
            </p>
          </div>
          <button type="button" className="button primary small" disabled={busy} onClick={apply}>
            Save settings
          </button>
        </div>
      </div>
    </section>
  );
};

export default DeviceSettings;
