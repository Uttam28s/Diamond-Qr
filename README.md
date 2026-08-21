# Diamond QR

Offline packet tracking for a diamond factory. Scans barcodes, keeps the
production sheet, and prints the reports — on the factory's own PCs, with no
internet connection and no cloud account.

The app reproduces the workbook the factory already keeps, column for column.
That is deliberate: the sheet is the thing everyone in the office already knows
how to read, so it stays the source of truth and the app is how it gets filled
in without retyping.

---

## 1. The shape of the business

```
Season  ────  a year's buying, e.g. "2024-25"
  └─ Kapan  ────  one purchase of rough (કટ નંબર)
       └─ Lot  ────  a parcel sent out to be cut and polished
            └─ Packet  ────  one barcode scan
```

A **Kapan** is a purchase of rough diamond. It is broken into **lots**, each of
which goes out to be worked on and comes back weeks later. A **packet** is a
single scan: one physical packet of polished stones, weighed and recorded
against the lot it belongs to.

Everything the app shows is derived from packets and the figures typed against
a lot. Nothing is stored twice, so no two screens can disagree.

### The thirteen columns

The lot sheet is the factory's own sheet. Left to right:

| # | Gujarati | Meaning | Where it comes from |
|---|----------|---------|---------------------|
| 1 | ક્રમ | Lot number | assigned, never reused |
| 2 | તારીખ | Date sent out | typed |
| 3 | નંગ | Pieces out | typed — **each scan adds one** |
| 4 | વજન | Rough weight | **sum of scanned packets** |
| 5 | સારણી | Sieve / charmi | typed — **may be negative** |
| 6 | તૈયાર વ. | Polished weight | **sum of scanned packets** |
| 7 | ટકાવારી | Yield % | polished ÷ rough |
| 8 | જ. નંગ | Pieces returned | typed |
| 9 | જ.વજન | Weight returned | typed |
| 10 | જ.ટકાવારી | Return % | returned ÷ polished |
| 11 | ઘટ | Loss | polished − returned |
| 12 | બા. નંગ | Missing pieces | pieces out − pieces returned |
| 13 | જ.તારીખ | Date returned | typed |

Columns 4 and 6 come from scanning. Everything else is either typed or computed,
and every computed figure lives in one file —
[src/domain/totals.js](src/domain/totals.js).

Column 3 is both: **one packet holds one diamond**, so filing a scan into a lot
adds one to its નંગ, and taking one back out subtracts one. The cell stays
editable, because a lot written up from a paper slip has a count before anything
has been scanned and a miscount has to be correctable. The two compose — type
140, scan two packets, and the cell reads 142.

**Two rules that look like bugs and are not:**

- A **negative સારણી is normal.** The factory's own sheet is full of `-2`. So
  in a cell, `+` is the only arithmetic operator — typing `-2` means the value
  minus two, not "subtract two".
- **Returned weight above polished weight is allowed.** That is exactly what a
  negative ઘટ is, and the real sheet has such rows.

Missing pieces are also *not* the same as outstanding pieces. A lot that simply
has not come back yet is outstanding, not lost, and the app never reports it as
loss.

---

## 2. The screens

| Screen | What it is for |
|--------|----------------|
| **Scan** | Point the scanner at packets. They land in the active lot. |
| **Kapans** | The list of every Kapan by season, and the sheet for whichever one is open. |
| **Returns** | Entering returns across every Kapan at once — three columns, tab straight down. |
| **Reports** | All ten reports, one filter. |
| **Settings** | This PC's role and name, the licence, backups. |

Returns get their own screen because they arrive weeks after a lot goes out, and
in the real sheet only about a third of rows have them filled. Hunting those
rows inside a thirteen-column grid was the slow part of the day.

### Keyboard

The sheet is always in edit mode — there is no "click to edit" step. Every
figure can be reached and typed without touching the mouse.

| Key | Does |
|-----|------|
| `Ctrl`+`L` | Choose the lot to scan into — works from any screen |
| `Ctrl`+`K` | Go to a Kapan or lot |
| `Ctrl`+`D` | Copy the cell above |
| `Ctrl`+`Z` | Undo |
| `/` | Jump to the search box |
| `Enter` | Save and move down |
| `Tab` | Next field |
| arrows | Move around the sheet |
| `Esc` | Throw away what you were typing |

`Ctrl`+`Z` in a half-typed cell throws away the typing; in a settled cell it
undoes the last change to the data. Excel behaves the same way.

Two typing shortcuts inside cells:

- `+12` adds twelve to what is already there — for packets arriving in batches.
- Dates take `5`, `5-8`, or `5-8-24`; the rest is filled in.

---

## 3. Reports

Ten, sharing one filter (season, date range, Kapan):

**By Kapan** — season summary, Kapan comparison
**By lot** — all lots (the thirteen columns, any filter), yield by sieve, best & worst lots
**Returns & loss** — returns pending, loss / missing pieces
**Production** — daily production, packet log
**Export** — the Excel sheet, in the workbook's own shape

Yield by sieve exists because the numbers say it matters: across the factory's
own data, yield climbs with the sieve size every single step of the way
(−2 → 12.31%, 2 → 19.50%, 7 → 32.26%, 11 → 38.55%).

Every report reads from `totals.js` and returns raw numbers — the screens do the
rounding. That is what keeps a column total equal to the sum of the figures
printed above it.

---

## 4. Several PCs

One PC holds the data; the others read and write it over the office network.

| Role | Meaning |
|------|---------|
| **Standalone** | One PC, its own data, no network. What a fresh install is. |
| **Host** | Holds the data and serves the other PCs. |
| **Client** | Works against the host's data over the LAN. |

Set this in **Settings → This PC**. The app restarts when the role changes.

**To set it up:** make the office PC the host. It shows its own address
(`http://192.168.1.42:7311`) and a token. On each other PC, choose *Client* and
type that address and token. The port defaults to **7311** and can be changed.

The first time a host starts, Windows asks whether to allow the app on private
networks — say yes, or the other PCs cannot reach it.

A PC can also be set to **station** mode: it can scan, but not edit or delete.
That is for the scanner by the window, where a stray keystroke should not be
able to change a figure.

**Clients keep working when the network drops.** Scans go into an outbox and are
sent when the host comes back, so a switch being unplugged costs nobody their
work.

---

## 5. Where the data lives

In the Windows user-data folder, not in Program Files, so an app update never
touches it:

```
%APPDATA%\Diamond QR\
  license.dat       the activation for this PC
  device.json       what this PC is (role, name, token, device id)
  data\
    snapshot.json   the state as of the last compaction
    journal.jsonl   one change per line since then
    snapshot.bak    the previous snapshot
    backups\        a dated copy per day, newest 14 kept
```

The folder was `%APPDATA%\Raj-QR-CODE-SCANNER\` before version 2.2.0. Windows
derives it from the product name, so renaming the app moved it — and the licence
with it. On its first launch under the new name the app copies the old folder
across and leaves the original in place; see
[public/main/migrateUserData.js](public/main/migrateUserData.js) and its tests.

Every write is a line appended to the journal — small and instant. The snapshot
is rewritten every 250 changes **or every 8 MB of journal, whichever comes
first**. Both the snapshot and each backup are written to a temporary file and
renamed, because a half-written snapshot is the one failure that could lose
everything. If a crash lands between truncating the journal and renaming the
snapshot, the `.bak` is used and the app says so.

### "The saved data could not be opened"

Reported once, from a factory PC, as `Cannot create a string longer than
0x1fffffe8 characters`. That number is V8's ceiling on a single string, about
512 MB, and it means the journal had grown past what could be read in one piece.
Two faults, both fixed in 2.2.2:

- The renderer sent its **whole state** across IPC on every save. Electron clones
  everything crossing that boundary, so the host shared no row objects with what
  it was sent — and the host decides what changed by row identity. Every scan
  therefore recorded the entire dataset. On the reported install, **199 scans made
  546 MB of journal.** The renderer now sends only what it changed
  ([src/domain/ipcAdapter.js](src/domain/ipcAdapter.js)), which is ~0.3 KB per
  scan against ~600 KB before.
- Compaction was triggered by line count alone, which is no ceiling on file size,
  and the journal was read with one `readFileSync`. It is now read in 4 MB chunks
  and compacted on bytes too.

**Nothing was lost in that failure and nothing needs deleting.** 2.2.2 folds an
oversized journal into the snapshot on first launch. To do it by hand instead —
to see the numbers before touching anything, or to work on a copy:

```sh
npm run recover:journal                       # inspect; changes nothing
npm run recover:journal -- --dir "D:\copy\data" --out rebuilt.json
npm run recover:journal -- --write            # repair in place, app closed
```

`--write` keeps the originals in a dated `recovered-<stamp>` folder beside the
data and writes an extra copy into `backups\`. It never deletes anything.

`device.json` is deliberately outside the shared data. "I am the scan station by
the window" is a fact about one computer, not about the factory's Kapans.

**To back up:** copy the whole folder. Settings shows its exact path and can
restore from a backup file. Only the host holds data — backing up a client
achieves nothing.

---

## 6. Licensing

Covered in full in [ADMIN-LICENSING.md](ADMIN-LICENSING.md) — key generation,
issuing, seats, and what the customer sees. In short: an Ed25519-signed payload,
verified offline, with an optional seat count. A key without a seat count is
unlimited, so keys issued before seats existed keep working.

The signing keys live in `tools/keys/` and **never ship** — §7a of the admin
guide is the check that proves it.

---

## 7. Installing it on a factory PC

Step by step, including the host/client setup and what to do when the network or
the firewall gets in the way: **[INSTALL.md](INSTALL.md)**.

---

## 8. Working on it

```bash
npm install
npm run electron-dev     # the UI on :3001 plus the desktop shell
npm test                 # 469 tests
npm run build            # production build, then hardened (see below)
npm run smoke            # loads the built bundle in a real window and checks it
npm run test:activation  # boots the real main process and activates a fresh PC
npm run test:journal     # saves through the real bridge and weighs the journal
npm run dist             # Windows installer
npm run verify:package   # inspects the installed package for leaks
npm run recover:journal  # rebuilds a snapshot from an oversized journal
npm run icon             # redraws the app icon at every size
```

### The build is scrubbed before it ships

`npm run build` ends by running [tools/harden-build.js](tools/harden-build.js),
which removes what should never leave the building and strips the toolchain's
fingerprints:

- **Source maps.** The default build emits one containing the entire original
  source, comments and file names included — 1.3 MB of it, inside the installer.
- **The bundled libraries' licence headers**, which name every dependency.
- **The framework's own identifiers.** Done as one uniform case-preserving
  rename over the whole bundle, so every reference stays consistent with its
  definition. Renaming them one at a time is how you get a subtly broken bundle.
- **`static/js/main.<hash>.js`** becomes `app/ui.<hash>.js`, because the path
  itself is a signature.

The script fails the build rather than passing quietly, and
`npm run verify:package` re-checks the same things inside the packaged `app.asar`
— which is what actually ships, and where the two worst leaks this project has
had were only ever visible.

**`npm run smoke` is not optional after touching that script.** A bundle broken
by a bad rename builds perfectly and fails at runtime with an empty window.

### The first launch after activation

`npm run test:activation` exists because that path runs exactly once per PC, on the
customer's machine, and it shipped broken: `boot()` opens the database only when the
app is *already* licensed, so a PC that had just been activated opened straight onto
"The saved data could not be opened — this PC has no local database". Restarting the
app cleared it, which is why it survived everything else: the second launch takes the
other path.

The test boots the real [public/electron.js](public/electron.js) against a throwaway
userData with no licence, types a real key into the real activation screen, and checks
what the app window shows. Nothing cheaper catches it — jest cannot see the main
process, and the smoke test builds its own window instead of going through activation.

Anything that changes how windows are created should be checked with it, because there
are two ways into the app window and only one of them is exercised day to day.

### Opening DevTools in a shipped build

Deliberately hard. `Ctrl+Alt+Shift+D`, then type the maintenance word and press
Enter — no prompt appears and a wrong word looks exactly like nothing happening.
`F12`, `Ctrl+Shift+I`, `Ctrl+Shift+J` and `Ctrl+Shift+C` are all dead.

Only the word's SHA-256 is in the source. To change it:

```bash
npm run devtools:secret -- "a new word"
# paste the hash over SECRET_SHA256 in public/main/devtools.js, then rebuild
```

See [public/main/devtools.js](public/main/devtools.js) for why this is not
configurable through an environment variable.

### How the code is arranged

Business rules are plain JavaScript with no UI framework in them, so they can be
tested directly and read without tracing a component tree.

```
src/domain/
  model.js        shapes, factories, lot numbering, warnings
  totals.js       every formula — the specification, in code
  entry.js        parsing what someone types (+N, dates, negatives)
  operations.js   eleven pure mutations, each returning its own undo
  store.js        snapshot + journal, optimistic concurrency
  selectors.js    reading the state
  reports.js      the ten reports
  format.js       numbers and dates to text
  delta.js        reference-comparison diffs
  sheetFixture.js 28 real rows of Kapan 41, used by the tests
  ipcAdapter.js / remoteAdapter.js   local vs over-the-network

src/hooks/useSheetCursor.js    grid movement, fill-down, undo
src/store/                      adapter choice and React context

public/db/       the host's durable store, and per-device config
public/net/      the LAN server and address discovery
public/main/     IPC registration, shared by the app and the test harness
public/shared/   the delta format, used by both sides
public/data-preload.js          the renderer's only bridge to its data
```

Two things worth knowing before changing any of it:

- **Operations return their own inverse.** That is where undo comes from; it is
  not a separate history mechanism. A new operation that does not return an
  undo silently breaks `Ctrl`+`Z`.
- **`totals.js` is the only place a formula may live.** A figure computed in a
  component is a figure that will eventually disagree with the sheet.

The renderer gets a fixed set of named channels and nothing else — no generic
IPC, no Node. The licence channels are reachable only from the activation
window.
