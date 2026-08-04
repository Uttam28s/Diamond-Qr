/**
 * The private way into DevTools.
 *
 * A shipped build must not let whoever is sitting at the PC open an inspector -
 * it is the easiest route to the app's internals. But the person maintaining it
 * needs a way in on a machine that is three hours away by train.
 *
 * So: a chord that appears to do nothing, then a word.
 *
 *   Ctrl+Alt+Shift+D          nothing visible happens
 *   type the word, press Enter    DevTools opens, in its own window
 *
 * Only the word's SHA-256 is in the source. Unpacking the installer reveals the
 * chord but not the word, which is the point: the chord alone is discoverable by
 * anyone who reads the code, so it cannot be the only thing in the way.
 *
 * There is no feedback for a wrong word, and none for a right one until DevTools
 * actually opens. Anything else - a beep, a prompt, a flicker - tells someone
 * who hit the chord by accident that there is something here to find.
 *
 * Deliberately NOT configurable through an environment variable. Reading the
 * expected hash from the environment at runtime would let anyone who can set an
 * environment variable supply the hash of a word they choose, which is not a lock
 * at all. Change it with `npm run devtools:secret` and rebuild.
 */

const crypto = require("crypto");

/** SHA-256 of the maintenance word. See tools/devtools-secret.js. */
const SECRET_SHA256 = "2d271ab8d5d7568de7317be944cc8a1755c10f27048b99d5ae2199895cea5dd3";

/** How long the capture stays armed. Long enough to type, short enough to forget. */
const WINDOW_MS = 15000;

const MAX_LENGTH = 64;

const sha256 = (text) =>
  crypto.createHash("sha256").update(String(text), "utf8").digest("hex");

/** Constant-time compare, so the failure is not timeable. */
const matches = (a, b) => {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

/** The accelerators an inspector is normally reached by. All dead. */
const isInspectorShortcut = (input) => {
  const key = `${input.key}`.toLowerCase();
  if (key === "f12") return true;
  if ((input.control || input.meta) && input.shift) {
    return key === "i" || key === "j" || key === "c";
  }
  return false;
};

const isArmingChord = (input) =>
  input.control && input.alt && input.shift && `${input.key}`.toLowerCase() === "d";

/**
 * @param window   the BrowserWindow to guard
 * @param onOpen   optional, called when the word was right (for logging in dev)
 */
const installDevToolsUnlock = (window, onOpen) => {
  let armed = false;
  let typed = "";
  let timer = null;

  const disarm = () => {
    armed = false;
    typed = "";
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = () => {
    armed = true;
    typed = "";
    if (timer) clearTimeout(timer);
    timer = setTimeout(disarm, WINDOW_MS);
    // Node keeps the process alive for a pending timer; this one must never be
    // the reason the app will not quit.
    if (timer.unref) timer.unref();
  };

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    if (isInspectorShortcut(input)) {
      event.preventDefault();
      return;
    }

    if (isArmingChord(input)) {
      event.preventDefault();
      arm();
      return;
    }

    if (!armed) return;

    // Armed: every keystroke belongs to the word, not to the app. Without this
    // the word would be typed into whatever cell happens to have focus.
    const key = `${input.key}`;

    if (key === "Escape") {
      event.preventDefault();
      disarm();
      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      const correct = matches(sha256(typed), SECRET_SHA256);
      disarm();
      if (correct) {
        window.webContents.openDevTools({ mode: "detach" });
        if (onOpen) onOpen();
      }
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      typed = typed.slice(0, -1);
      return;
    }

    // Single printable characters only. Modifiers and arrows are ignored rather
    // than treated as part of the word.
    if (key.length === 1) {
      event.preventDefault();
      if (typed.length < MAX_LENGTH) typed += key;
      return;
    }

    // Anything else (Tab, F-keys, arrows) means this was not someone typing the
    // word, so stop listening rather than sit armed while they work.
    disarm();
  });

  // A window that reloads keeps its listener, but not the half-typed state.
  window.webContents.on("did-start-navigation", disarm);
};

module.exports = { installDevToolsUnlock, SECRET_SHA256 };
