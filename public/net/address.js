/**
 * The addresses the other PCs should be pointed at.
 *
 * There is no broadcast discovery here, and that is a choice rather than an
 * omission. Discovery needs an inbound UDP port that Windows Firewall blocks by
 * default on exactly the networks it would be used on, and when it fails it fails
 * silently. Showing the host's own address so it can be typed into the other PCs
 * once is a few seconds of setup that always works and can be read out over the
 * phone.
 */

const os = require("os");

/**
 * Non-internal IPv4 addresses, most-likely-useful first.
 *
 * A factory PC often has several: a real LAN card, a disconnected Wi-Fi adapter,
 * and virtual ones from VPN or Docker software. Private ranges are listed before
 * anything else because the office LAN is always one of them.
 */
const localAddresses = () => {
  const found = [];

  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach((name) => {
    (interfaces[name] || []).forEach((entry) => {
      if (entry.family !== "IPv4" && entry.family !== 4) return;
      if (entry.internal) return;
      found.push({ name, address: entry.address });
    });
  });

  const rank = (address) => {
    if (/^192\.168\./.test(address)) return 0;
    if (/^10\./.test(address)) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
    // 169.254.x.x means the PC never got an address from the router, so it is
    // the least useful thing to show someone.
    if (/^169\.254\./.test(address)) return 9;
    return 5;
  };

  return found.sort((a, b) => rank(a.address) - rank(b.address));
};

/** What to read out to whoever is setting up the other computers. */
const connectUrls = (port) =>
  localAddresses().map((entry) => ({
    ...entry,
    url: `http://${entry.address}:${port}`,
  }));

module.exports = { localAddresses, connectUrls };
