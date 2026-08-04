/**
 * Persistence adapter for a PC that holds its own data: talks to the file store
 * in Electron's main process over the narrow bridge in data-preload.js.
 *
 * Same shape as the local and remote adapters, so the store and every screen above
 * it are unaware of which one is in use.
 */

import { SCHEMA_VERSION } from "./model";

export const createIpcAdapter = (bridge) => {
  if (!bridge || !bridge.data) {
    throw new Error("createIpcAdapter needs the Electron data bridge.");
  }

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

      return state;
    },

    async save(state) {
      const result = await bridge.data.save(state);
      // The store rolls the screen back on a throw, which is the entire reason
      // this reports failure instead of returning false like the old helper did.
      if (!result.ok) throw new Error(result.error);
    },

    async backup() {
      return bridge.data.backup();
    },
  };
};
