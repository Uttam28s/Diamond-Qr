/**
 * The only bridge the app window gets.
 *
 * The main process deliberately gives its windows no preload (see electron.js) so
 * that a renderer cannot reach Node or arbitrary IPC. The store needs a way to
 * the disk, so this adds exactly the calls it needs and nothing else: a fixed list
 * of channel names, no `invoke(channel, ...)` escape hatch, and no `require`.
 *
 * Notably absent: anything from the licence channels. Those stay reachable only
 * from the activation window, as before.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("diamondQR", {
  /* -------------------------------------------------------------- identity */
  getConfig: () => ipcRenderer.invoke("device:config"),
  setConfig: (patch) => ipcRenderer.invoke("device:update", patch),
  appInfo: () => ipcRenderer.invoke("app:info"),
  relaunch: () => ipcRenderer.invoke("app:relaunch"),

  /* ------------------------------------------------ this PC's own database */
  data: {
    load: () => ipcRenderer.invoke("data:load"),
    save: (state) => ipcRenderer.invoke("data:save", state),
    backup: () => ipcRenderer.invoke("data:backup"),
    stats: () => ipcRenderer.invoke("data:stats"),
  },

  /* ------------------------------------------------------ host mode status */
  host: {
    status: () => ipcRenderer.invoke("host:status"),
  },
});
