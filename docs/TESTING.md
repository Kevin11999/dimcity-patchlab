# Testing PatchLab (simulator tests)

Everything here runs the app **in a browser against simulated devices**. Nothing proves how a real LumiNode, GigaCore, Mac or Windows behaves.
The tests live in the repository, so a new session (or a new cloud container) can run them straight away.

```bash
node tests/run.mjs                # all tests (about 4 minutes)
node tests/run.mjs --only 08      # tests whose file name contains "08"
node tests/run.mjs --list         # what exists
node tests/run.mjs --verbose      # also print every passed check
```

- The runner starts its own web server on a free port (no server to restart), opens one fresh browser page per test, prints a short summary and exits 1 when something fails.
- It needs Playwright with Chromium. In the cloud image it is at `/opt/node-tools/node_modules/playwright`; elsewhere set `PLAYWRIGHT_PATH`.
- `node_modules` of the app (papaparse for CSV import, qrcode-generator) is **not** installed in the cloud image, so CSV import and QR codes cannot be tried there (`npm ci` first). The demo project needs neither.
- `tests/` is not packaged in the installers (electron-builder only takes the folders in `package.json` → `build.files`), and a push to `main` only starts a release when `package.json` or the workflow file changes.

## How the app fits together (what a test needs to know)

**Model.** One object, `MODEL` (renderer.js; `window.LKApp.getMODEL()`). The network part is `MODEL.networkDevices`:
`nodeTypes`, `switchTypes`, … (device types), `dimCityPlans[dc]` (`nodes`, `switches`, `splitters`, `consoles`, `rackDev` for switches placed in racks),
`portPlans` (what was set by hand per switch / node port: `'sw:DB01|DB01-SW1' → { ports:{ 3:{ vid, trunk, name, poe, speed } } }`, `'nd:DB01|ID:01' → { ports:{ 1:{ name, klass, dir } } }`),
`portPatch` (which device sits on which switch port), `swLinks` (switch to switch over RJ45), `fiberLinks`, `prefs` (FENT address scheme, Advanced network).
A node in the advanced network keeps its choice per network port in `inst.advPorts = { 1:[VLAN ids], 2:[…] }` and `inst.advIsl = { 1:true|false, 2:… }` (painted "Trunk ISL").

**Plan → screens.** The plan is read through a few functions; every screen and the PDF use the same ones:
- `FentUI.portPlan(dc).rows`: which device (node ETH, cable, console) sits on which switch port and with which VLANs (trunk when a cable carries 2+ VLANs).
- `PortPlan.swPorts(dc, switch)`: the effective settings of every switch port (plan + what was set by hand). Used by the Switches tab, the Patch board, the PDF and the stickers.
- `PortPlan.ndPorts(dc, node, index)`: the same for the DMX ports of a node (universe, name, protocol, direction).
- `Fent.ifaces / Fent.portsOf`: the addresses of a device and what every RJ45 carries.
- `NetSwitches.list(dc)`: all switches of a DimCity: `source:'plan'` (added in Network > Switches or in Setup, label `DB01-SW1`) and `source:'rack'` (placed in a rack, label `R-SW1`).

**Plan → devices (ui/netconfig.js, core/luminex-api.js).**
1. `NetConfig.wantSwitch(item)` / `wantNode(item)`: what the plan wants on a device (the same data as the screens, in the shape the API planners need).
2. `fillFromPlan(device)`: puts that in the pending changes (`device.E` port edits, `device.NE` ETH edits, `device.dev` device edits). Nothing is sent yet.
3. `opsOf(device)`: the API calls for the difference between the device (`device.cur`, read from it) and the pending changes. `opsOf(device, true)` = "send again": every call of the plan, also what the device already has.
   Switch: `gigacorePortPlan`, `gigacoreDevicePlan`, `gigacoreNamesPlan`, `gigacoreTrunkPlan`, put in order by `orderGigacoreOps`. Node: `lumiPlan` (DMX ports, engines, name) and `lumiNetPlan` (network config: groups, ISL, ports).
4. `applyDevs(devices, { noIp, resend })`: **1** the calls without addresses, device by device · **1b** every device is read back BEFORE its address changes: what is missing is sent once more, the trunk is checked (a device that moves cannot be read afterwards) · **2** the address calls to ALL devices at the same moment · **3** read back and check.
   Order of the calls to a switch: new groups → VLAN / PoE / speed per port → names (port names, switch name, group names) → trunk (its groups, `assign_ports`, the ports one by one) → IP. Node: DMX ports and engines → name → network config (ISL, groups) → IP.
5. The call goes through `transport(ip)`: in the desktop app `window.app.luminexHttp` (main.js, core/luminex-http.js); in a browser (tests) to the simulator.

**Simulated devices.** `core/luminex-sim.js` (`gigacoreSim`, `lumiNodeSim`; options such as `ignoreAssign`: a switch that says ok to `assign_ports` and does nothing, `isl`: a node that reports its own trunk). `NetConfig.simNet()` makes one simulated device per plan switch **that has an IP** and per node that has an IP, plus a GigaCore 12t (10.90.250.5) and a LumiNode 12 (10.90.250.9). They are in `NetConfig.state.simDevs`; `device.sim` in the tests is the simulator behind a found device (its `dev.state` is the device's own state).
Discovery in the browser: `#ncDisc` → `NetConfig.discover()`. In the desktop app `core/netwatch.js` finds devices (IP scan, mDNS `_luminex._tcp.local`, Art-Net, LLDP; IPv6 link-local for another IP range).

**PDF / stickers.** `PdfExport.renderDocument({ kind:'book'|'nodes'|'ip'|'a3'|'lk', dcs:[dc], layout, preview:false, isStale:false, title })` → `{ html, pages, … }` (async). Stickers: `Labels.docHtml({ dc, variant:'nodes'|'switches'|'cables', ports })`.

**Things a test must do.** `NetConfig.wantNode` / `opsOf` need the API module, which loads on the first discover (`discover(t)` first). After `applyDevs` a result window opens (`.modal-backdrop [data-a=ok]`) and, when addresses change, a question first ("Send including IP addresses"): `finishSend(t)` answers both.

## The tests (tests/cases)

| file | what it checks |
|---|---|
| 00-code-check | the syntax check of the repository |
| 01 switch-screen-vs-send | every switch port: screen = what Network config sends (VLAN, trunk, name, PoE, speed), also after hand-made settings |
| 02 node-screen-vs-send | every DMX port of every node: universe, name, protocol, direction |
| 03 pdf-switch-vs-screen | the PDF switch pages show what the Switches tab shows |
| 04 paint-port-all-views | paint a VLAN / trunk: Switches tab, Patch board, PDF and Network config agree; the "not a trunk" warning |
| 05 add-switch-everywhere | a switch added in Network > Switches: lists, Addresses, Patch board, Fibres, PDF, stickers, Network config |
| 06 rack-switch-visible | a switch placed in a rack is found in the same places |
| 07 setup-steps | the 11 Setup steps open without errors in the demo and an empty project |
| 08 send-all-matches-plan | send to ALL devices (also with hand-made settings, ISL, new IP): every device ends as the plan says, nothing left to send |
| 09 trunk-assign-ignored | trunk ports arrive when `assign_ports` does nothing, also when the switch moves out of reach |
| 10 node-isl-and-resend | ISL: only the node's own groups, ETH on the trunk; Apply without changes sends again |
| 11 send-order | the order of the calls (see above); fails on the old order |
| 12 pdf-node-card-and-eth-labels | PDF node card: port modes, names, ETH; address labels follow the planner |
| 13 align-fill-clears-eth-brush | the Align tool's Fill step clears ETH brush choices |
| 14 discovery-unit | `_luminex` answer, IPv6 zones, watcher, text of a failed call (no browser) |
| 15 device-list-remove-merge | remove offline devices; the same device at a new IP is one entry |
| 16 netconfig-eth-tiles | ETH tiles on the node card: ISL / VLAN brush, basic vs advanced |
| 17 planner-eth-tiles | the same brush in the planner; Fill from the plan; the tile shows what waits to be sent |
| 18 gigacore-resend | Apply without changes sends again to a switch and a node |

## Writing a test

A file in `tests/cases/` exports `{ name, kind?, timeout?, run(t) }` (`kind:'node'` for a test without a browser). `t.page` is a fresh Playwright page, `t.ok(condition, message)` records a check,
`t.url` is the app. A page error counts as a failed check. Helpers in `tests/lib.mjs`: `openDemo`, `openEmpty`, `discover`, `finishSend`, `netTab`.
To prove a test can fail, run it against the old code: `git worktree add /tmp/old <commit>`, copy `tests/` into it and run there.

## Known weak spots (found by these tests, not fixed)

- A switch placed in a rack is called `R-SW1` (no DimCity in the name, so DB01 and DB02 both have one), comes without name and IP, and Network config sends that name to the device.
- The DimCity page has no "Add switch" (only Network > Switches and Setup add plan switches; in a DimCity a switch is placed in a rack).
- The Signal Flow only draws a switch once something sits on one of its ports.
- A switch IP appears on a PDF in several sections (overview, card, IP scheme, address list): each is its own list, but it can look doubled.
- Group names are sent together with the ISL in one network-config call on a node, and a DMX port's name together with its direction (one IO call); they cannot be ordered separately.
