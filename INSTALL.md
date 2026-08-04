# Installing Diamond QR

Everything needed to put the app on a factory PC. Written to be followed at the
PC, in order, without reading anything else first.

There are two kinds of PC:

- **The office PC (the host).** Holds all the data. Set this one up first.
- **Every other PC (a client).** Reads and writes the office PC's data over the
  network. Useless until the host is running, so it cannot be done first.

If there is only ever going to be **one** PC, do §1 and §2, then stop. It works
on its own with no network at all.

---

## What you need before you start

| | |
|---|---|
| The installer | `Diamond QR Setup 2.2.0.exe` — copy it to the PC on a pen drive |
| A licence key | One per PC. Issued after installing — see §3 |
| Windows | Windows 10 or 11, 64-bit |
| The network | Only for several PCs: all on the same office network |
| Rights | An account that can install software (Administrator) |

You do **not** need the internet. Not to install, not to activate, not to run.

---

## 1. Install the app

1. Copy `Diamond QR Setup 2.2.0.exe` onto the PC — Desktop is fine.
2. Double-click it.
3. **Windows will show a blue "Windows protected your PC" box.** This is
   expected: the installer is not signed with a paid certificate. Click
   **More info**, then **Run anyway**.
4. Accept the folder it offers and let it finish.
5. It creates a Desktop shortcut and a Start Menu entry, both called
   **Diamond QR**.

The app starts by itself when the installer finishes.

---

## 2. Activate it

The first screen is the activation screen. It shows an **Installation Code** —
a long code specific to this PC.

1. Click **Copy**, or **Save to file** to drop a `.txt` on the Desktop.
2. Get that code to whoever issues the licences (§3).
3. They send back a **licence key**.
4. Paste the key into the box and press **Activate**.

The app restarts into the main window. This is a one-time step per PC — it
never asks again.

**If the code will not copy:** it can be read out over the phone. It is designed
to be, and the app is not fussy about spaces or capitals.

---

## 3. Issuing the licence key *(the administrator, on their own PC)*

Not on the factory PC — on the machine that holds the signing key.

```bash
npm run license:issue -- --code <the installation code> --seats 5
```

`--seats` is the number of PCs allowed to connect to one host at the same time.
Leave it off for unlimited. Full detail, including how the seat count is
enforced, is in [ADMIN-LICENSING.md](ADMIN-LICENSING.md).

Send back the key it prints.

---

## 4. Make the office PC the host

Do this on the PC that will keep the data — the one that is switched on
whenever anyone is working, and the one that gets backed up.

1. Open **Settings** (bottom of the left-hand menu).
2. Under **This PC**, set **Role** to **Host**.
3. Give it a name people will recognise: `Office`.
4. Leave **Mode** as **Office** — it needs to be able to edit and delete.
5. Press **Save**. The app restarts.

After the restart, Settings shows two things the other PCs need. Write them
down:

```
Address:  http://192.168.1.42:7311      <-- yours will differ
Token:    a long string of characters
```

### Windows will ask about the firewall

The first time the host starts, Windows shows **"Windows Firewall has blocked
some features of this app"**.

- Tick **Private networks**.
- Leave **Public networks** unticked.
- Click **Allow access**.

**This matters.** Click *Cancel* and no other PC will be able to connect, and
the error on the client will say only that it cannot reach the host. If it was
dismissed by accident, see §7.

---

## 5. Point each other PC at the host

On each remaining PC, after §1 and §2:

1. Open **Settings** → **This PC**.
2. Set **Role** to **Client**.
3. Type the **Address** from §4 — `http://192.168.1.42:7311`. Just
   `192.168.1.42` works too; the app fills in the rest.
4. Paste the **Token** from §4.
5. Name it after where it is: `Scan station 1`.
6. **Mode**:
   - **Station** for a PC that only scans. It cannot edit or delete anything —
     the right choice for a machine next to the scanner, where a stray keystroke
     should not be able to change a figure.
   - **Office** for a PC where someone enters lots and returns.
7. Press **Save**. The app restarts and connects.

The top right of the window shows the connection. Green means it is talking to
the host.

### If the network drops

Scanning keeps working. Packets go into a queue on that PC and are sent up as
soon as the host is back — nobody loses their work because a switch was
unplugged. The top bar shows how many are waiting.

---

## 6. Check it worked

At the host:

1. **Kapans** → add a Kapan, add one lot to it.

At a client:

2. Open **Kapans**. The same Kapan is there.
3. Scan one packet into that lot.

Back at the host:

4. The packet is there, and the lot's **તૈયાર વ.** has gone up by its weight.

If all four are true, the setup is finished.

---

## 7. When something is wrong

**"The saved data could not be opened — this PC has no local database", right after activating**
**Close the app and open it again.** It will work. This was a bug in the first
2.2.0 build, on the one path that only runs once per PC: the app opened the
window before opening its database. Fixed in the current installer — but the
restart is the fix on any PC that already has the older one, and nothing is lost
either way.

**"The app cannot reach its own database"**
A different fault: the installation is incomplete, a file is missing. Uninstall
and reinstall from the full installer. Do not copy the app folder from another PC.

**A client says it cannot reach the host**
Work through these in order, at the host:

1. Is the host PC on, and the app open? A client cannot work while the host is
   closed.
2. In the host's Settings, does the address still match what the client has? It
   changes if the office router hands out a new address. Ask for a fixed address
   for that PC if it keeps moving.
3. The firewall. Windows Firewall → *Allow an app through firewall* → find
   **Diamond QR** → tick **Private**. If it is not in the list at all, the
   prompt in §4 was cancelled: reinstall, or add it manually.
4. Can the client reach the host at all? At the client, open a browser and go to
   the host address. Anything other than a connection error means the network is
   fine and the problem is the token.

**"Port 7311 is already in use"**
Another copy of the app is already running on that PC, or something else has the
port. Close it and reopen, or change the port in Settings on the host *and* on
every client.

**A PC says the seat limit is reached**
More PCs are connected than the licence allows. Close the app on one that is not
in use, or ask for a licence with more seats.

**The app has forgotten everything after an update**
It should not — the update carries the data across automatically. Before doing
anything else, check `%APPDATA%` for a folder called `Raj-QR-CODE-SCANNER`. If
it is there and holds a `data` folder, nothing is lost; send it to the
administrator.

---

## 8. Backups

**Only the host holds data.** Backing up the clients achieves nothing.

The host keeps a dated copy every day it is opened, keeping the newest 14, in:

```
%APPDATA%\Diamond QR\data\backups\
```

That protects against a mistake in the app. It does not protect against the PC
dying, so **once a week, copy `%APPDATA%\Diamond QR\` onto a pen drive.**
Settings shows a **Reveal** button that opens that folder directly.

To restore, use **Settings → Restore from backup** rather than copying files
back by hand.

---

## 9. Updating to a newer version

1. Close the app on every PC.
2. Run the new installer on the host first, then on the clients.
3. No need to activate again — the licence stays.
4. No need to set the role again — Host and Client settings stay.

Data and licence are kept outside the program folder specifically so an update
cannot touch them.
