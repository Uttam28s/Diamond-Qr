/**
 * The host's LAN server.
 *
 * Deliberately plain Node with no Electron imports, so the whole thing can be
 * started in a test and driven over a real socket. Electron's main process only
 * has to hand it a store and a port.
 *
 * Concurrency model: this process is the only writer, and Node runs the handlers
 * one at a time, so a commit is atomic without any locking. What clients need
 * protecting from is each other's staleness, and that is what `baseVersion` does:
 *
 *   - An edit to a Kapan or a lot must be based on the version the client last
 *     saw. If the host has moved on, the commit is rejected with 409 and the
 *     client refetches. Last-writer-wins on a figure nobody had seen is exactly
 *     the bug this prevents.
 *
 *   - Packet inserts skip that check. They only ever add rows, so there is
 *     nothing to conflict with - which is what lets a scan station work through
 *     a network outage and upload afterwards.
 */

const http = require("http");
const { applyDelta, countRows, isAdditiveOnly } = require("../shared/delta");

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_DELTA_ROWS = 20000;
const PROTOCOL = 1;

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

const createServer = ({ store, token = "", seats = 0, onLog }) => {
  if (!store) throw new Error("createServer needs a store.");

  const log = (...args) => {
    if (onLog) onLog(...args);
  };

  // Which clients have been seen, so Settings can show the seats in use and the
  // host can refuse the seat past the licensed count.
  const clients = new Map();

  const seatFor = (deviceId, name) => {
    if (!deviceId) return { ok: true, seat: null };

    const existing = clients.get(deviceId);
    if (existing) {
      existing.lastSeen = Date.now();
      if (name) existing.name = name;
      return { ok: true, seat: existing };
    }

    if (seats > 0 && clients.size >= seats) {
      return {
        ok: false,
        error: `This licence covers ${seats} computer(s) and they are all in use. Contact your administrator to add a seat.`,
      };
    }

    const seat = { deviceId, name: name || deviceId, lastSeen: Date.now() };
    clients.set(deviceId, seat);
    log(`[net] seat taken by ${seat.name} (${clients.size}/${seats || "∞"})`);
    return { ok: true, seat };
  };

  const send = (response, status, payload) => {
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      // The clients are Electron renderers on the LAN, not browsers on the open
      // internet, but the header costs nothing and makes local debugging in a
      // browser possible.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, x-device-id, x-device-name, x-token",
    });
    response.end(body);
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const deviceId = request.headers["x-device-id"] || "";
    const deviceName = request.headers["x-device-name"] || "";

    if (request.method === "OPTIONS") {
      send(response, 204, {});
      return;
    }

    // A shared token, not a password: it stops another app on the same network
    // from writing to the database by accident. It is not protection against
    // someone on the LAN who wants in, and is not presented as such.
    if (token && request.headers["x-token"] !== token) {
      send(response, 401, { error: "Wrong or missing host token." });
      return;
    }

    try {
      /* ---------------------------------------------------------- health */
      if (url.pathname === "/ping") {
        send(response, 200, {
          protocol: PROTOCOL,
          version: store.getVersion(),
          seats,
          seatsUsed: clients.size,
        });
        return;
      }

      /* ------------------------------------------------------- full state */
      if (url.pathname === "/state" && request.method === "GET") {
        const seat = seatFor(deviceId, deviceName);
        if (!seat.ok) {
          send(response, 403, { error: seat.error });
          return;
        }
        send(response, 200, { version: store.getVersion(), state: store.getState() });
        return;
      }

      /* ----------------------------------------------------------- commit */
      if (url.pathname === "/commit" && request.method === "POST") {
        const seat = seatFor(deviceId, deviceName);
        if (!seat.ok) {
          send(response, 403, { error: seat.error });
          return;
        }

        const body = JSON.parse((await readBody(request)) || "{}");
        const { delta, baseVersion } = body;

        if (countRows(delta) > MAX_DELTA_ROWS) {
          send(response, 413, { error: "That change is too large to send at once." });
          return;
        }

        const additive = isAdditiveOnly(delta);
        const current = store.getVersion();

        if (!additive && baseVersion !== current) {
          // Not an error the user caused, and not one they can fix by retrying
          // blindly - the client refetches and reapplies.
          send(response, 409, {
            error: "Another computer changed this first.",
            version: current,
          });
          return;
        }

        const next = applyDelta(store.getState(), delta);
        const saved = store.save(next);

        log(
          `[net] commit from ${deviceName || "unknown"}: ${countRows(delta)} row(s), v${saved.version}`
        );
        send(response, 200, { version: saved.version });
        return;
      }

      /* ------------------------------------------------------------ seats */
      if (url.pathname === "/clients" && request.method === "GET") {
        send(response, 200, {
          seats,
          clients: [...clients.values()].map((client) => ({
            name: client.name,
            lastSeen: new Date(client.lastSeen).toISOString(),
          })),
        });
        return;
      }

      send(response, 404, { error: "No such endpoint." });
    } catch (error) {
      log(`[net] request failed: ${error.message}`);
      send(response, 400, { error: error.message });
    }
  });

  return {
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host || "0.0.0.0", () => resolve(server.address()));
      }),
    close: () =>
      new Promise((resolve) => {
        clients.clear();
        server.close(() => resolve());
      }),
    address: () => server.address(),
    clientList: () => [...clients.values()],
  };
};

module.exports = { createServer, PROTOCOL };
