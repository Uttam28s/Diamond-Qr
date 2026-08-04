# Diamond QR - licensing and activation (admin guide)

This app is locked to one computer per licence. There is no login screen and no
server: activation happens once per machine, offline, and the app opens straight
away every time after that.

---

## 1. How it works

Two keys exist. You keep the **private** one; the app ships only the **public** one.

```
tools/keys/license-private.pem    <- SECRET, yours, gitignored, never shipped
public/license/public-key.js      <- shipped inside the app, safe to publish
```

A licence key is a small signed message that says *"this app may run on the machine
with this hardware fingerprint"*. The app verifies the signature with the public key
and then checks the fingerprint against the machine it is running on. Both must pass.

The important consequence: **anyone can read the whole app, and still cannot make a
licence key.** Producing one requires the private key, which never leaves your
machine. This is why a hardcoded password would not work here - whatever ships with
the app can be extracted from it.

### Activation flow

```
Customer PC                        You (admin)
-----------                        -----------
app opens -> activation screen
"installation code"  ---------->   node tools/issue-license.js --request "<code>"
                                            |
paste licence key    <----------   licence key
app verifies + saves
app opens. Never asks again on this PC.
```

The licence is stored at:

```
%APPDATA%\Diamond QR\license.dat
```

Note this is **outside** the program folder. Copying `C:\Program Files\...` to a USB
stick does not carry the licence with it.

**Before version 2.2.0 this folder was `%APPDATA%\qr-code-raj`.** Renaming the app
moved it, because Windows names it after the product. On its first launch under the
new name the app copies the licence, the device id and the whole database across and
leaves the originals in place - so an upgrade does not deactivate anybody. If a
customer on 2.2.0 is unexpectedly asked to activate, look for the old folder before
issuing a new key: the migration is in `public/main/migrateUserData.js`, and the app
writes a `migrated-from.txt` into the new folder recording what it did.

---

## 2. One-time setup (already done)

```bash
npm run license:keygen
```

Creates the keypair. **Back up `tools/keys/license-private.pem` now**, somewhere
offline. If you lose it:

- already-activated machines keep working (they only need the public key), but
- you can never issue another licence for this build, and you would have to ship an
  update carrying a new public key and re-activate every customer.

Never commit it. `.gitignore` covers `tools/keys` and `*.pem`, and the
electron-builder `files` allowlist excludes `tools/` so it cannot end up in an
installer.

---

## 3. Activating a customer machine

**On the customer PC**, open the app. It shows the activation screen with an
installation code. They press *Copy code* (or *Save to file*) and send it to you.

**On your machine:**

```bash
npm run license:issue -- --request "DQR-R1.eyJ2...." --to "Raj Diamond" --id RAJ-001
```

Send the printed `DQR-L1....` key back. They paste it into step 2 and press
**Activate**. The app opens and will not ask again on that computer.

Options:

| Option | Meaning |
| --- | --- |
| `--request "<code>"` | the installation code from the activation screen |
| `--request-file code.txt` | read the code from a file instead |
| `--to "<name>"` | who it is for; recorded in the licence |
| `--id "<id>"` | your reference id (default `AUTO-0001`) |
| `--expires 2027-03-31` | optional expiry. **Omit for a perpetual licence.** |
| `--seats 4` | how many PCs may share this customer's data. **Omit for unlimited.** |

Every key you issue is logged to `tools/issued/licenses.json` (gitignored) with the
customer name and the machine it is bound to. Keep this - it is your record of who
has what.

To check a key later:

```bash
npm run license:verify -- "DQR-L1...."
```

---

## 3a. Delivery day checklist

You cannot pre-activate an installer. The licence is bound to the customer's
hardware, and you only learn their fingerprint once the app runs on their PC. So
activation always happens *after* installation, with you in the loop.

That does **not** mean you must be on site. The remote flow works fine:

1. Customer runs `Diamond QR Setup <version>.exe` and opens the app. The
   step-by-step version of this, written for the customer, is [INSTALL.md](INSTALL.md).
2. Activation screen appears. They press **Copy code** (or **Save to file**) and
   send you the installation code over WhatsApp/email.
3. You run, on your machine:
   ```bash
   npm run license:issue -- --request "<their code>" --to "Customer name" --id CUST-001
   ```
4. You send back the `DQR-L1....` key. They paste it and press **Activate**.
5. Done. That PC never asks again.

Things worth having ready before you hand it over:

- Your laptop with `tools/keys/license-private.pem` present, or wherever you keep it.
  **Without the private key you cannot activate anybody.**
- The installer is **unsigned**, so Windows SmartScreen will show
  "Windows protected your PC". The customer must click *More info* -> *Run anyway*.
  Warn them in advance, or it looks like a virus warning. See section 7 for signing.
- If the customer has more than one PC, each needs its own code and its own key.

---

## 3b. Customers with several PCs (seats)

Each PC still gets its own code and its own key - that has not changed, and it is
still what binds a licence to one machine.

What `--seats` adds is a cap on how many PCs may **share one database**. One PC is
set up as the host in its Settings; the others connect to it over the office LAN.
The host counts the computers that connect and refuses the one past the cap.

```bash
# A four-PC office: the office PC plus three scan stations.
npm run license:issue -- --request "<host PC's code>" --to "Raj Diamond" --seats 4
```

Points worth knowing:

- **The count includes the host itself.** `--seats 4` means four computers in total.
- **Only the host's key matters** for the cap. It is the machine doing the counting.
  The clients' own keys license those installs; they do not carry a seat count.
- **Omitting `--seats` means unlimited**, and so does every key you issued before
  this option existed. An update must never stop a current customer working, so a
  key with no seat count is read as "no limit" rather than "no seats".
- The number is inside the signature. Editing anything on the customer's disk cannot
  raise it - the key stops verifying.
- The host shows seats in use in **Settings -> This computer**, along with the
  address to type into the other PCs and a list of what is connected.
- To sell a customer more seats, issue a fresh key for the **host** with a higher
  `--seats` and have them paste it. Nothing else changes.

`npm run license:verify -- "<key>"` prints the seat count, so you can check what a
customer already has before quoting them more.

## 4. What the customer sees when a copy is stolen

| Situation | Result |
| --- | --- |
| Fresh install, no licence | Activation screen, asks for a key |
| Program folder copied to another PC | "This software is not licensed for this computer. Contact administrator" |
| `license.dat` also copied across | Same - the fingerprint inside it does not match the new PC |
| System disk cloned to another PC | Blocked - MachineGuid survives a clone, but the board/CPU ids do not |
| `license.dat` edited by hand | Blocked, signature fails |
| Licence expired (if you set one) | Blocked, asks to renew |
| One part upgraded (e.g. new CPU) | Still runs - one changed component is tolerated |
| Windows reinstalled | Blocked. Issue a new key; this is indistinguishable from a new PC |

---

## 5. Hardware changes and re-issuing

The fingerprint is deliberately not all-or-nothing:

- **Anchor:** Windows MachineGuid. Must match. A different Windows install is a
  different machine.
- **Soft:** SMBIOS UUID, motherboard serial, CPU id, CPU model. **One** of these may
  change without breaking activation.

So a RAM or disk upgrade is fine; a motherboard swap or a new PC needs a new key.
The customer just sends you the new installation code and you issue another licence -
there is no limit and no deactivation step.

The activation screen shows a **lock strength** badge. On machines where the BIOS
reports placeholder serials (`To Be Filled By O.E.M.`, all zeros, etc.) those values
are discarded rather than trusted - otherwise thousands of machines would share one
fingerprint and a single licence would unlock them all. If you see `weak` there, the
lock rests mostly on MachineGuid alone; the CLI warns you about this when it happens.

---

## 6. Uninstall behaviour

`assets/installer.nsh` deletes **only** `license.dat` on a genuine uninstall, so a
reinstall needs you to activate the machine again.

It deliberately does **not** delete the rest of `%APPDATA%\Diamond QR` - scan
history and settings live there, and wiping a jeweller's records on uninstall would
be far worse than a re-activation.

The hook deletes `license.dat` from all three folder names electron-builder exposes
(`APP_PACKAGE_NAME`, `APP_FILENAME`, `APP_PRODUCT_FILENAME`) rather than a hardcoded
one, which is why the 2.2.0 rename did not quietly break it.

The `${isUpdated}` guard matters: electron-builder runs the uninstaller as part of
installing a new version. Without it, **every app update would deactivate every
customer**. Only NSIS honours this - the `msi` target in `package.json` does not run
custom NSIS scripts, so MSI uninstalls will leave the licence in place.

---

## 7. What this does and does not protect against

Being straight about the limits, because "unbreakable" is not on the menu for any
desktop app.

**Stops (the realistic piracy cases):**

- Copying the installed folder, or the whole installer, to other PCs.
- Sharing one licence key with friends - it only works on the machine it was issued for.
- Cloning the system disk onto different hardware.
- Editing the licence file to change its expiry or target machine.
- Someone building their own key generator - impossible without your private key.

**Does not stop:** an attacker who unpacks `app.asar`, deletes the verification call,
and repacks it. Electron apps are JavaScript; the code is on their disk and can be
edited. No client-side scheme fixes this - the check has to run somewhere the
attacker controls.

That matters less than it sounds: it takes real skill and effort, and it produces one
patched build rather than a key generator that unlocks every copy. Casual copying -
which is what actually happens in practice - is fully blocked.

If you want to raise that bar further, in rough order of value for effort:

1. **Authenticode code signing** of the installer and exe (~$100-300/yr for an OV
   certificate). Tampering then breaks the signature, and Windows SmartScreen stops
   warning your customers - worth it for the install experience alone.
2. **`bytenode`** to compile `public/license/*.js` to V8 bytecode, so the check is not
   readable JavaScript sitting in the asar.
3. **Online activation** - a small server that records which fingerprints have been
   activated, letting you cap installs per customer and revoke a licence. This is the
   only way to detect a key being reused after the fact, but it means the app needs
   internet access at activation time.

Current setup is entirely offline, which suits shop-floor PCs with unreliable
internet.

---

## 7a. Building the installer

```bash
npm run dist              # builds, hardens, then packages
npm run verify:package    # then check what you are about to ship
```

Output lands in `dist/` as `Diamond QR Setup <version>.exe` and
`Diamond QR <version>.msi`.

`npm run build` runs `tools/harden-build.js` at the end. That is not cosmetic: the
default build emits a source map containing the **entire original source**, comments
and file names included, and it ships inside the installer unless something removes
it. The script also strips the toolchain's identifiers from the bundle. If you ever
run `npx react-scripts build` directly, you have skipped all of it.

After changing anything about the bundle, run `npm run smoke`. It loads the packaged
bundle in a real window and checks the app draws - a bundle broken by the identifier
rename builds cleanly and fails at runtime with a blank window.

Three things in `build.files` are load-bearing, and all three cost real time to
rediscover:

- **`!node_modules/**/*` plus explicit re-includes.** electron-builder copies every
  production dependency. The app needs almost none of them: the renderer is bundled
  into `build/app/`, so only what the **main process** `require()`s at runtime has to
  be there, which is exactly two modules:

  ```
  electron-is-dev      node-machine-id
  ```

  If you ever `require()` another module from `public/electron.js`, `public/main/*` or
  `public/license/*`, add it to that list or the packaged app dies with
  `MODULE_NOT_FOUND` on launch. Anything the *renderer* imports is fine - that is all
  bundled.

  As of 2.2.0 the build toolchain sits in `devDependencies`, where it belongs for a
  bundled renderer. That matters for more than tidiness: electron-builder ships the
  `dependencies` list **verbatim** inside `app.asar/package.json`, so anything left in
  there is on the customer's disk, naming every library the app is built from.

- **`public/main/**/*` and `public/data-preload.js` must be listed.** A preload that
  is missing from the package does not fail the build - the app opens and silently
  falls back, which is how one shipped release ended up unable to reach its own
  database. `npm run verify:package` now asserts every one of these is present.

- **`tools/` is excluded**, which is what keeps `tools/keys/license-private.pem` out
  of the installer.

`npm run verify:package` extracts the packaged `app.asar` and fails on any private
key, any source map, any toolchain fingerprint, and any missing required file. Run it
before every delivery; it is the only check that looks at what actually ships.

## 8. Files

| Path | Purpose |
| --- | --- |
| `public/license/index.js` | verify, store, evaluate at startup (main process) |
| `public/license/fingerprint.js` | hardware fingerprint + match policy |
| `public/license/codec.js` | request/licence encoding, Ed25519 sign + verify |
| `public/license/public-key.js` | generated; shipped public key |
| `public/activation.html` | activation / contact-admin screen |
| `public/license-preload.js` | contextBridge for that screen only |
| `public/splash.html` | shown during the ~1.5s hardware check |
| `assets/installer.nsh` | uninstall hook |
| `tools/generate-keypair.js` | one-time key generation |
| `tools/issue-license.js` | issue and verify licences |
| `tools/keys/` | **secret**, gitignored |
| `tools/issued/licenses.json` | your record of issued licences, gitignored |
| `public/main/migrateUserData.js` | carries licence + data across the 2.2.0 rename |
| `public/main/devtools.js` | the chord-and-word DevTools unlock |
| `tools/harden-build.js` | scrubs `build/`; runs as part of `npm run build` |
| `tools/verify-package.js` | inspects the packaged asar before delivery |
| `tools/smoke-test.js` | runs the packaged bundle in a real window |
| `tools/make-icon.js` | draws the app icon at every size |
| `tools/devtools-secret.js` | hashes a new maintenance word |

Verification runs **only** in the main process. The activation window reaches it
through a narrow `contextBridge` API and is never trusted to decide whether the app
may run - the app UI is not even loaded until the main process has verified a licence.
Renderers run with `nodeIntegration: false` and `contextIsolation: true`.

**DevTools in a shipped build.** As of 2.2.0 DevTools is enabled but unreachable: every
inspector accelerator is swallowed, and it opens only after `Ctrl+Alt+Shift+D` followed
by the maintenance word. Only the word's SHA-256 is in the source, so unpacking the app
reveals the chord but not the word. Change it with
`npm run devtools:secret -- "new word"` and rebuild. The activation window is guarded
the same way - it is the last place an inspector should be one keystroke away.
