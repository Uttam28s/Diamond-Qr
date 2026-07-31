/**
 * Preload for the activation window ONLY. The main app window gets no preload and
 * no Node access at all.
 *
 * Everything here is a thin message pass to the main process. No verification logic
 * lives on this side of the bridge -- a renderer can be inspected and driven from
 * DevTools, so it is never allowed to decide whether the app is licensed.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("licenseAPI", {
  getStatus: () => ipcRenderer.invoke("license:status"),
  activate: (licenseKey) => ipcRenderer.invoke("license:activate", licenseKey),
  copyToClipboard: (text) => ipcRenderer.invoke("license:copy", text),
  saveRequestCode: (text) => ipcRenderer.invoke("license:save-request", text),
  quit: () => ipcRenderer.invoke("app:quit"),
});
