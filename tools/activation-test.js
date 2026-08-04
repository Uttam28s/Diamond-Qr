#!/usr/bin/env electron
/**
 * The first-launch-after-activation path, end to end.
 *
 *   npm run test:activation
 *
 * This is the one path that only ever runs once per PC, on the customer's machine,
 * and it shipped broken: `boot()` opens the database only when the app is already
 * licensed, so a PC that had *just* been activated opened straight onto "This PC has
 * no local database". Restarting cleared it, which is precisely why it survived every
 * check - the second launch takes the other path.
 *
 * Nothing short of this catches it. The jest suite cannot see the main process, and
 * the smoke test builds its own window rather than going through activation.
 *
 * So: boot the REAL public/electron.js against a throwaway userData with no licence
 * in it, type a real key into the real activation screen, and then look at what the
 * app window actually shows.
 *
 * The licence key comes from this machine's own activated install, because a licence
 * is bound to hardware and this is the same hardware. Nothing here touches the real
 * data folder.
 */

// Before anything requires electron-is-dev: force the production code path, so the
// window loads build/index.html instead of a dev server that is not running.
process.env.ELECTRON_IS_DEV = "0";

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const problems = [];

/* ------------------------------------------------------- a key to activate with */

const candidates = [
  path.join(app.getPath("appData"), "Diamond QR", "license.dat"),
  path.join(app.getPath("appData"), "qr-code-raj", "license.dat"),
];

const keyFile = candidates.find((file) => fs.existsSync(file));

if (!keyFile) {
  console.error("No activated installation on this machine to borrow a licence from.");
  console.error("Looked in:\n  " + candidates.join("\n  "));
  process.exit(1);
}

const licenseKey = fs.readFileSync(keyFile, "utf8").trim();

/* ------------------------------------- a throwaway userData with no licence in it */

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "dq-activation-"));
app.setPath("userData", sandbox);

// Otherwise the rename migration helpfully finds this machine's real installation
// and copies the licence in, the app boots already-licensed, and the activation
// screen - the thing under test - never appears. Its own marker is the documented
// way to say "this folder has been dealt with".
const { MARKER } = require("../public/main/migrateUserData");
fs.writeFileSync(
  path.join(sandbox, MARKER),
  "Written by tools/activation-test.js to keep the migration out of the way.\r\n",
  "utf8"
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const windowMatching = (fragment) =>
  BrowserWindow.getAllWindows().find((win) => {
    if (win.isDestroyed()) return null;
    return `${win.webContents.getURL()}`.includes(fragment);
  });

const waitForWindow = async (fragment, budget = 20000) => {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    const win = windowMatching(fragment);
    if (win) return win;
    await wait(250);
  }
  return null;
};

// Boots the real app: registers its IPC, verifies the (absent) licence, and opens
// the activation window.
require("../public/electron.js");

app.whenReady().then(async () => {
  console.log(`Activation test\n  sandbox   ${sandbox}`);

  /* ------------------------------------------------- 1. the activation screen */

  const activation = await waitForWindow("activation.html");
  if (!activation) {
    problems.push("the activation window never appeared");
    return report();
  }
  console.log("  step 1    activation screen opened");

  // It shows a spinner while it fingerprints the machine.
  await wait(3000);

  /* ------------------------------------------------------ 2. activate for real */

  await activation.webContents.executeJavaScript(`
    (() => {
      const input = document.getElementById("keyInput");
      const button = document.getElementById("activateBtn");
      if (!input || !button) return "missing";
      input.value = ${JSON.stringify(licenseKey)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      button.click();
      return "clicked";
    })()
  `);
  console.log("  step 2    key pasted, Activate pressed");

  /* ------------------------------------------- 3. what does the app window show? */

  const main = await waitForWindow("index.html");
  if (!main) {
    problems.push("the app window never opened after a successful activation");
    return report();
  }
  console.log("  step 3    app window opened");

  // Let the renderer mount and load its state over IPC.
  await wait(3500);

  const found = await main.webContents.executeJavaScript(`
    (() => {
      const text = document.body.innerText;
      return {
        fatal: text.includes("The saved data could not be opened"),
        noDatabase: text.includes("no local database"),
        navItems: Array.from(document.querySelectorAll(".nav-item")).map(
          (el) => el.textContent.trim()
        ),
        bodyLength: text.length,
      };
    })()
  `);

  /* ---------------------------------------------------------------- the checks */

  if (found.fatal) {
    problems.push('the app opened onto "The saved data could not be opened"');
  }
  if (found.noDatabase) {
    problems.push('the app reported "no local database" - openData() did not run');
  }
  if (!found.navItems.length) problems.push("the app window has no navigation");

  /**
   * The store has to have been *opened*, which is the thing that was missing.
   * `createFileStore` makes its directory as it is constructed, so the folder
   * existing is the proof that it ran - deliberately not asserting on snapshot.json,
   * because a PC activated a minute ago has nothing to snapshot yet and demanding
   * one would make this fail for the wrong reason.
   */
  const dataDir = path.join(sandbox, "data");
  if (!fs.existsSync(dataDir)) {
    problems.push(`the database was never opened - no ${dataDir}`);
  }

  if (!fs.existsSync(path.join(sandbox, "license.dat"))) {
    problems.push("the licence was not saved");
  }

  const contents = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];

  console.log(`  step 4    navigation: ${found.navItems.join(", ") || "(none)"}`);
  console.log(`  step 4    fatal screen: ${found.fatal}`);
  console.log(`  step 4    store opened: ${fs.existsSync(dataDir)}  (${contents.join(", ") || "empty, as expected on a new PC"})`);
  console.log(`  step 4    licence saved: ${fs.existsSync(path.join(sandbox, "license.dat"))}`);

  report();
});

function report() {
  fs.rmSync(sandbox, { recursive: true, force: true });

  if (problems.length) {
    console.error("\nACTIVATION TEST FAILED:\n");
    problems.forEach((line) => console.error(`  ${line}`));
    console.error("");
    app.exit(1);
    return;
  }

  console.log("\n  a freshly activated PC opens a working app.\n");
  app.exit(0);
}
