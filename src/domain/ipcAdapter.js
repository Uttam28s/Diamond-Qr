/**
 * Persistence adapter for a PC that holds its own data: talks to the file store
 * in Electron's main process over the narrow bridge in data-preload.js.
 *
 * Same shape as the local and remote adapters, so the store and every screen above
 * it are unaware of which one is in use.
 *
 * What it sends is a **delta**, not the state. That is not an optimisation, it is
 * a correctness requirement: Electron structured-clones anything crossing the
 * bridge, so a state handed to the main process shares no row objects with the
 * one the file store holds, and the file store decides what changed by row
 * identity. Sending whole states therefore recorded the entire dataset in the
 * journal on every keystroke - which grew one customer's journal past the ~512 MB
 * a JavaScript string can hold, at which point the app could no longer read its
 * own data. The renderer is the only place with reference-stable rows, so the
 * renderer is where the delta has to be computed.
 */

import { SCHEMA_VERSION } from "./model";
import { computeDelta } from "./delta";

export const createIpcAdapter = (bridge) => {
  if (!bridge || !bridge.data) {
    throw new Error("createIpcAdapter needs the Electron data bridge.");
  }

  // What the main process is known to hold. Advanced only after a write it
  // confirmed, so a failed save leaves the next delta measured from the last
  // state that actually reached the disk rather than from one that did not.
  let persisted = null;

  return {
    name: "local-file",

    async load() {
      const result = await bridge.data.load();

      if (!result.ok) {
        // Thrown, not swallowed: the shell shows the reason and refuses to open
        // rather than starting empty next to data it could not read.
        throw new Error(result.error);
      }

      const state = result.state;
      if (state.schema !== SCHEMA_VERSION) {
        throw new Error(
          `The data on this PC is schema ${state.schema}; this version reads schema ${SCHEMA_VERSION}.`
        );
      }

      persisted = state;
      return state;
    },

    async save(state) {
      // Before a load, or against a bridge too old to have the channel, there is
      // nothing to measure a delta from - so send the state and let the main
      // process work it out. Correct either way, just larger.
      if (!persisted || typeof bridge.data.commit !== "function") {
        const result = await bridge.data.save(state);
        // The store rolls the screen back on a throw, which is the entire reason
        // this reports failure instead of returning false like the old helper did.
        if (!result.ok) throw new Error(result.error);
        persisted = state;
        return;
      }

      const delta = computeDelta(persisted, state);
      // Nothing changed. The store filters most of these out before calling, but
      // an operation that rebuilds an equal state should not cost a journal line.
      if (!delta) {
        persisted = state;
        return;
      }

      const result = await bridge.data.commit(delta);
      if (!result.ok) throw new Error(result.error);
      persisted = state;
    },

    async backup() {
      return bridge.data.backup();
    },
  };
};
