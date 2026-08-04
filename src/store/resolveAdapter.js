/**
 * Decides where this PC's data comes from, once, at startup.
 *
 * Three answers:
 *
 *   standalone / host  -> this PC's own file, through Electron's main process
 *   client             -> the host PC, over the office LAN
 *   no Electron        -> browser storage
 *
 * The last one is not a fallback for production; it is what `npm start` and the
 * test suite run in. Keeping it means the whole UI is developable and testable in a
 * browser with no Electron and no host.
 */

import { createLocalAdapter } from "../domain/store";
import { createIpcAdapter } from "../domain/ipcAdapter";
import { createRemoteAdapter, CONNECTION } from "../domain/remoteAdapter";

export const ROLE = {
  STANDALONE: "standalone",
  HOST: "host",
  CLIENT: "client",
  BROWSER: "browser",
};

export const MODE = {
  OFFICE: "office",
  STATION: "station",
};

const bridge = () => (typeof window !== "undefined" ? window.diamondQR : null);

/**
 * True when this is the packaged desktop app rather than a browser.
 *
 * Read from the user agent because it is the one signal available *without* the
 * preload bridge - which is exactly the case this exists to catch.
 */
const insideElectron = () =>
  typeof navigator !== "undefined" && / Electron\//i.test(navigator.userAgent || "");

/**
 * @param onStatus       connection status changes, client only
 * @param onRemoteChange another PC changed the data, client only
 */
export const resolveAdapter = async ({ onStatus, onRemoteChange } = {}) => {
  const api = bridge();

  if (!api) {
    // Inside Electron with no bridge means the preload failed to load - almost
    // always because it was left out of the packaged build. Falling back to browser
    // storage here would be the worst possible outcome: the app would look fine and
    // quietly write a factory's Kapans into browser storage instead of the database,
    // hitting the old 5 MB ceiling with nobody any the wiser. So it fails loudly.
    if (insideElectron()) {
      throw new Error(
        "This installation is incomplete — the app cannot reach its own database " +
          "(data-preload.js did not load). Reinstall the app. Nothing has been " +
          "changed or deleted."
      );
    }

    return {
      adapter: createLocalAdapter(),
      role: ROLE.BROWSER,
      mode: MODE.OFFICE,
      deviceName: "",
      config: null,
    };
  }

  const config = await api.getConfig();

  if (config.role === ROLE.CLIENT) {
    const adapter = createRemoteAdapter({
      baseUrl: config.hostAddress,
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      token: config.hostToken,
      onStatus,
      onRemoteChange,
    });

    return {
      adapter,
      role: ROLE.CLIENT,
      mode: config.mode,
      deviceName: config.deviceName,
      config,
      // Started by the provider after a successful load, so a failed connection
      // does not leave a timer running against a host that is not there.
      startPolling: adapter.startPolling,
    };
  }

  return {
    adapter: createIpcAdapter(api),
    role: config.role === ROLE.HOST ? ROLE.HOST : ROLE.STANDALONE,
    mode: config.mode,
    deviceName: config.deviceName,
    config,
  };
};

export { CONNECTION };
