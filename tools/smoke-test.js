#!/usr/bin/env electron
/**
 * Does the packaged renderer actually run?
 *
 *   npm run smoke
 *
 * `harden-build.js` renames every occurrence of the UI framework's name inside the
 * built bundle. That rename is safe only because it is applied uniformly - but
 * "should be safe" is not the same as "boots and draws the sheet", and a bundle
 * broken this way fails at runtime with a blank window, not at build time.
 *
 * So this loads the real built bundle in a real Electron window, with the real
 * preload and the real IPC handlers against a throwaway database, and then checks
 * that the UI is actually there: the navigation, the screens, no console errors.
 *
 * It writes a screenshot too, because "no errors and 5 nav items" is still not the
 * same as "looks right".
 *
 * Not a substitute for the jest suite - it is the one thing jest cannot see, which
 * is the production bundle after the build tools have finished with it.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createFileStore } = require("../public/db/fileStore");
const { registerDataIpc } = require("../public/main/dataIpc");

const root = path.join(__dirname, "..");
const indexHtml = path.join(root, "build", "index.html");
const shot = path.join(root, "dist", "smoke-test.png");

const problems = [];
const consoleErrors = [];

const finish = (code) => {
  console.log("");
  if (problems.length) {
    console.error("SMOKE TEST FAILED:\n");
    problems.forEach((line) => console.error(`  ${line}`));
    console.error("");
  }
  app.exit(code);
};

if (!fs.existsSync(indexHtml)) {
  console.error("No build/index.html - run `npm run build` first.");
  process.exit(1);
}

// A throwaway database, so this never touches the real one.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dq-smoke-"));
const store = createFileStore({ dir: path.join(dataDir, "data") });
store.load();

registerDataIpc({
  ipcMain,
  dataDir: () => dataDir,
  getStore: () => store,
  getServer: () => null,
  getError: () => "",
  getSeats: () => 0,
  appInfo: () => ({ version: "smoke", support: { name: "-", email: "-" } }),
  relaunch: () => {},
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1536,
    height: 1000,
    show: true, // capturePage returns an empty image on a hidden window
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(root, "public", "data-preload.js"),
    },
  });

  win.webContents.on("console-message", (event, level, message) => {
    // 3 is error. React's own warnings would come through as 2 (warning).
    if (level >= 3) consoleErrors.push(message);
  });

  win.webContents.on("render-process-gone", (event, details) =>
    problems.push(`the renderer died: ${details.reason}`)
  );

  await win.loadFile(indexHtml);

  // Let the app mount, load its state over IPC and settle.
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const found = await win.webContents.executeJavaScript(`
    (() => {
      const text = (selector) =>
        Array.from(document.querySelectorAll(selector)).map((el) => el.textContent.trim());
      return {
        rootChildren: document.getElementById("root").children.length,
        navItems: text(".nav-item"),
        title: (document.querySelector(".page-title") || {}).textContent || "",
        bridge: typeof window.diamondQR,
        // The renderer shows this if it cannot reach its own database.
        fatal: document.body.innerText.includes("installation is incomplete"),
        bodyLength: document.body.innerText.length,
      };
    })()
  `);

  /* ------------------------------------------------------------- the checks */

  if (found.bridge !== "object") problems.push("the preload bridge is not there");
  if (found.fatal) problems.push('the app reported "installation is incomplete"');
  if (!found.rootChildren) problems.push("#root is empty - the UI never mounted");
  if (found.bodyLength < 200) {
    problems.push(`the page is nearly blank (${found.bodyLength} chars of text)`);
  }

  const EXPECTED = ["Scan", "Kapans", "Returns", "Reports", "Settings"];
  for (const label of EXPECTED) {
    if (!found.navItems.some((item) => item.includes(label))) {
      problems.push(`the ${label} screen is missing from the navigation`);
    }
  }

  if (consoleErrors.length) {
    problems.push(`${consoleErrors.length} console error(s):`);
    consoleErrors.slice(0, 5).forEach((line) => problems.push(`  ${line.slice(0, 200)}`));
  }

  /* --------------------------------------------- the DevTools unlock itself */

  // Invisible by design, which makes it exactly the sort of thing that quietly
  // stops working. Driven here with real key events against the real listener.
  const { installDevToolsUnlock } = require("../public/main/devtools");
  installDevToolsUnlock(win);

  const press = (key, modifiers = []) => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: key, modifiers });
    win.webContents.sendInputEvent({ type: "char", keyCode: key, modifiers });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: key, modifiers });
  };
  const type = (text) => text.split("").forEach((character) => press(character));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * DevTools opens in a window of its own, which takes a moment. Poll for it
   * rather than guessing a delay - and give the same generous budget to the cases
   * that are supposed to stay shut, otherwise they pass just by being slow.
   */
  const devToolsOpened = async (budget = 4000) => {
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) {
      if (win.webContents.isDevToolsOpened()) return true;
      await wait(100);
    }
    return false;
  };
  const settle = () => wait(300);

  press("F12");
  if (await devToolsOpened()) {
    problems.push("F12 opened DevTools - the accelerator is not dead");
    win.webContents.closeDevTools();
    await settle();
  }

  press("i", ["control", "shift"]);
  if (await devToolsOpened()) {
    problems.push("Ctrl+Shift+I opened DevTools - the accelerator is not dead");
    win.webContents.closeDevTools();
    await settle();
  }

  // The word alone, with no chord first, must do nothing at all.
  type("zeonlabs-maintenance-2026");
  press("Enter");
  const wordAloneOpened = await devToolsOpened();
  if (wordAloneOpened) {
    problems.push("the word opened DevTools without the chord");
    win.webContents.closeDevTools();
    await settle();
  }

  // The chord, then the wrong word.
  press("d", ["control", "alt", "shift"]);
  type("not-the-word");
  press("Enter");
  const wrongWordOpened = await devToolsOpened();
  if (wrongWordOpened) {
    problems.push("the wrong word opened DevTools");
    win.webContents.closeDevTools();
    await settle();
  }

  // The chord, then the right one.
  press("d", ["control", "alt", "shift"]);
  type(process.env.DQ_SMOKE_SECRET || "zeonlabs-maintenance-2026");
  press("Enter");
  const rightWordOpened = await devToolsOpened();
  if (!rightWordOpened) problems.push("the correct word did not open DevTools");
  if (rightWordOpened) win.webContents.closeDevTools();

  /* ------------------------------------------------------------- the report */

  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  fs.writeFileSync(shot, image.toPNG());

  console.log("Smoke test:");
  console.log(`  bridge        ${found.bridge}`);
  console.log(`  mounted       ${found.rootChildren} element(s) under #root`);
  console.log(`  navigation    ${found.navItems.join(", ")}`);
  console.log(`  page title    ${found.title}`);
  console.log(`  text on page  ${found.bodyLength} chars`);
  console.log(`  console       ${consoleErrors.length} error(s)`);
  console.log(`  devtools      accelerators dead, word-without-chord refused: ${!wordAloneOpened}`);
  console.log(`  devtools      wrong word refused: ${!wrongWordOpened}`);
  console.log(`  devtools      chord + correct word opens it: ${rightWordOpened}`);
  console.log(`  screenshot    ${path.relative(root, shot)}`);

  fs.rmSync(dataDir, { recursive: true, force: true });

  if (!problems.length) console.log("\n  the hardened bundle runs.");
  finish(problems.length ? 1 : 0);
});

app.on("window-all-closed", () => finish(problems.length ? 1 : 0));
