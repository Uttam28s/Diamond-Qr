/**
 * Seat licensing.
 *
 * The signing side is exercised with a throwaway keypair rather than the real
 * private key (which is not in the repo, and should not be): what matters is that
 * a signed `seats` field survives the round trip and that the app reads it the way
 * it is meant to.
 */

const crypto = require("crypto");

const codec = require("../../public/license/codec");
const license = require("../../public/license/index");
const { createFileStore } = require("../../public/db/fileStore");
const { createServer } = require("../../public/net/server");

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const keypair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
};

const fingerprintish = { machineGuid: "abc-123" };

const sign = (privateKey, extra = {}) =>
  codec.encodeLicense(
    {
      v: 1,
      app: codec.APP_ID,
      lic: "TEST-0001",
      to: "Raj Diamond",
      iat: Date.now(),
      exp: null,
      ...extra,
      c: fingerprintish,
    },
    privateKey
  );

/* ========================================================================
   The seat count travels inside the signature
   ======================================================================== */

describe("a signed seat count", () => {
  it("survives the round trip", () => {
    const { publicKey, privateKey } = keypair();
    const key = sign(privateKey, { seats: 4 });

    const payload = codec.decodeLicense(key, publicKey);
    expect(payload.seats).toBe(4);
    expect(license.seatsFrom(payload)).toBe(4);
  });

  it("cannot be raised without the private key", () => {
    const { publicKey, privateKey } = keypair();
    const key = sign(privateKey, { seats: 2 });

    // Forge a key with more seats, re-using the original signature.
    const [prefix, encoded, signature] = key.split(".");
    const tampered = JSON.parse(
      Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    tampered.seats = 99;
    const reEncoded = Buffer.from(JSON.stringify(tampered))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(() =>
      codec.decodeLicense(`${prefix}.${reEncoded}.${signature}`, publicKey)
    ).toThrow(/signature is invalid/i);
  });

  it("is left out of the payload when unlimited", () => {
    const { publicKey, privateKey } = keypair();
    const payload = codec.decodeLicense(sign(privateKey), publicKey);

    // An unlimited key is byte-identical to one minted before seats existed.
    expect("seats" in payload).toBe(false);
  });
});

describe("reading the seat count", () => {
  it("treats a key that predates seats as unlimited", () => {
    // The decision that matters: an update must not stop the app working for a
    // customer whose key was issued before this feature.
    expect(license.seatsFrom({ v: 1, app: codec.APP_ID })).toBe(0);
    expect(license.seatsFrom({ seats: undefined })).toBe(0);
    expect(license.seatsFrom(null)).toBe(0);
  });

  it("treats nonsense as unlimited rather than as zero seats", () => {
    // Zero seats would lock everyone out, which is the worst possible reading of
    // a field somebody fat-fingered.
    expect(license.seatsFrom({ seats: "four" })).toBe(0);
    expect(license.seatsFrom({ seats: -3 })).toBe(0);
    expect(license.seatsFrom({ seats: 0 })).toBe(0);
    expect(license.seatsFrom({ seats: Infinity })).toBe(0);
  });

  it("floors a fractional count", () => {
    expect(license.seatsFrom({ seats: 3.9 })).toBe(3);
  });

  it("reads a normal count", () => {
    expect(license.seatsFrom({ seats: 1 })).toBe(1);
    expect(license.seatsFrom({ seats: 12 })).toBe(12);
  });
});

/* ========================================================================
   What the host does with it
   ======================================================================== */

const request = (port, pathname, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method: "GET", path: pathname, headers },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });

describe("the host enforces the licensed seat count", () => {
  let host;

  afterEach(async () => {
    if (host) await host.close();
    host = null;
  });

  const start = async (seats) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dqr-seats-"));
    const store = createFileStore({ dir });
    store.load();
    host = createServer({ store, seats });
    const address = await host.listen(0, "127.0.0.1");
    return address.port;
  };

  const connect = async (port, id) =>
    request(port, "/state", { "x-device-id": id, "x-device-name": id.toUpperCase() });

  it("lets exactly as many computers in as the key allows", async () => {
    const port = await start(license.seatsFrom({ seats: 3 }));

    expect((await connect(port, "office")).status).toBe(200);
    expect((await connect(port, "station-1")).status).toBe(200);
    expect((await connect(port, "station-2")).status).toBe(200);

    const fourth = await connect(port, "station-3");
    expect(fourth.status).toBe(403);
    expect(fourth.body.error).toMatch(/3 computer\(s\)/);
  });

  it("lets any number in on a key with no seat count", async () => {
    const port = await start(license.seatsFrom({ v: 1 }));

    for (let index = 0; index < 6; index += 1) {
      // Every existing customer's key looks like this.
      expect((await connect(port, `pc-${index}`)).status).toBe(200);
    }
  });

  it("counts the host's own seat", async () => {
    const port = await start(1);
    expect((await connect(port, "office")).status).toBe(200);
    expect((await connect(port, "station-1")).status).toBe(403);
  });

  it("reports seats in use on the ping, so Settings can show it", async () => {
    const port = await start(3);
    await connect(port, "office");
    await connect(port, "station-1");

    const { body } = await request(port, "/ping");
    expect(body.seats).toBe(3);
    expect(body.seatsUsed).toBe(2);
  });
});
