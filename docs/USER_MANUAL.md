<!-- Generated from core/manual.js by scripts/build-manual.mjs — do not edit by hand, run `npm run manual`. -->

# DimCity PatchLab — User Manual / Handleiding

The same manual is built into the app: press **?** or **F1**, or click **Help** in the toolbar, and it opens on the chapter for the page you are on.

Dezelfde handleiding zit in de app: druk op **?** of **F1**, of klik op **Help** in de werkbalk, en hij opent op het hoofdstuk van de pagina waar je bent.

- [English](#user-manual-english)
- [Nederlands](#handleiding-nederlands)

---

# User manual (English)

- [Getting started](#getting-started)
- [Videos](#videos)
- [Importing a CSV](#import)
- [Project overview](#overview)
- [DimCity page](#dimcity)
- [LK block](#lk)
- [Veam](#veam)
- [Editing patch rows](#rows)
- [Validation](#validation)
- [Patch list](#patchlist)
- [Device Builder](#devices)
- [Rack Builder](#rack-builder)
- [Racks per DimCity](#racks)
- [Nodes, splitters & network](#network)
- [Network page](#network-page)
- [Setup wizard](#setup)
- [Tasks](#tasks)
- [QR codes](#qr)
- [Exchange with Lightwright and Vectorworks](#exchange)
- [Devices on the network](#netdev)
- [Fibres](#fibres)
- [Node names from the CSV](#node-names)
- [20t, panels and half-width devices](#devices-ports)
- [Signal flow](#flow)
- [Report Builder (PDF)](#report)
- [Stickers (Herma sheets)](#stickers)
- [Personal library](#library)
- [Search (Cmd/Ctrl+K)](#search)
- [Undo and history](#history)
- [Settings](#settings)
- [Updates](#updates)
- [Sending a request or bug report](#request)
- [Keyboard shortcuts](#shortcuts)
- [What's new](#whats-new)

<a id="getting-started"></a>
## Getting started

PatchLab prepares, validates and documents the LK, Veam and DMX patching of a show, grouped per DimCity. The usual flow:

1. **New Project** on the welcome screen. Give it a name, area, location and date — these appear on the cover of your PDF.
2. **Import CSV** with your patch list (see [Importing a CSV](#import)), or add LKs and Veams by hand.
3. Check the **Validation** page and fix what is red.
4. Link Veams to LK slots, plan **racks** and **nodes** per DimCity.
5. Build the PDF in the **Report Builder** and export it.

### Saving
A project is one **.lkproj** file with everything inside: the imported CSVs, your edits, Veam links, device types, racks, network plans and report layouts. Save with **Cmd/Ctrl+S**. Recent projects are listed on the welcome screen.

Autosave, backups and crash recovery are set in [Settings](#settings).

### Demo show and tours
**Open Demo Show** on the welcome screen (or Help → Open Demo Show) loads a complete festival show: three DimCities, LKs with Veam links, racks and loose devices from the standard library, a network plan and a finished PDF layout. Nothing is saved until you choose Save, so change whatever you like. **Take the Tour** lets you choose the full tour or one about LK blocks, nodes, racks or the PDF layout.

### Progress bar
Bottom-left, a small bar shows how complete the show is: project info, patch imported, no errors, rows complete, Veams linked, racks patched, network plan, PDF layout, saved. Click it for the checklist; every open item jumps to the place where you fix it.

### Where things are
- **Sidebar**: project overview, validation, patch list, network planner, and every DimCity with its LKs and Veams.
- **Toolbar**: Import CSV, Edit Rows, Recalculate, Save, Export PDF, Help and Request.
- The arrow at the top of the sidebar collapses it to icons only (and back); PatchLab remembers that.
- **Cmd/Ctrl+K** searches everything: LKs, Veams, universes, locations, devices and commands.
- **?** or the Help button opens this manual on the chapter that matches the page you are on.

<a id="videos"></a>
## Videos

Screen recordings of the whole app window, in full HD, with a spoken explanation in English. There is no text in the picture; switch the **subtitles** on with the CC button in the player.

There are two series:
- **Build a show, step by step** — one project from an empty window to the finished report: import the patch, racks and the advice, couple LKs and Veams, nodes, network, fibres, signal flow, check and PDF, stickers. The parts play one after the other.
- **Tool guides** — one short video per tool: Device Builder, Rack Builder and custom racks, the advice, coupling and stacking, cable types and fibre stock, the fibre overview, VLANs, the Signal Flow, the PDF builder, stickers, QR codes, exchange with Lightwright and Vectorworks, devices on the network, Tasks and Setup, search and undo.

Everything you see you can do yourself in **Open Demo Show** on the welcome screen. The **Tasks** page and the **Setup** button walk you through the same steps for your own project.

<a id="import"></a>
## Importing a CSV

**Import CSV** (toolbar or Cmd/Ctrl+I) reads a comma-separated file with one patch point per row.

### Columns
Four columns are needed, in any order — you map them in the import window:
- **LK / Veam ID** — LK101, VEAM12101 (same as LK101) or V105
- **Port** — 1–12 on an LK, 1–4 on a Veam
- **Universe** — a number, or empty when not patched yet
- **Position / location** — free text, e.g. "Truss 2 SL"

A row **without an ID** is a loose DMX line; it needs a DimCity in the sixth column (DB01).

### DimCity from the ID
The DimCity follows from the number: **LK101 and V105 belong to DB01, LK215 to DB02** (hundreds = DimCity).

### Header and footer rows
PatchLab detects which rows are real patch rows and skips the rest. Adjust with the **Skip first / last** counters; the preview shows what is included.

### After the import
- Imported files are listed under **File → Imported Files**. There you can **Replace** a file with a newer export or **Remove** it. Manual rows, Veam links and block types are kept.
- Rows that are not valid (for example a Veam on port 6, or the same port patched twice with different universes) are not thrown away: they appear on the [Validation](#validation) page with a Fix button and in **Edit Rows**.

### Network cables (C)
A row whose ID starts with **C** is a **network cable** (Cat loom): `C101` is a cable of 4 lines for DimCity 01 (the number works like Veam V101). Give the line in the port column (1-4) or write it as `C101.1`. The third column holds the **VLAN**: a Luminex group number (2 = VLAN 200, 3 = VLAN 300 …, 1 = Management) or the VLAN ID itself. The fourth column is the location. A network cable can only be plugged into a network switch: see the Network page.

<a id="overview"></a>
## Project overview

The overview is the home page of a project.

- The **key figures** count DimCities, LK blocks, Veams, universes and patch points of the whole show.
- The **DimCity table** shows per DimCity how many LKs and Veams it has, how many Veams are linked, and the number of errors and warnings. Click a row to open the DimCity.
- **Project info** (name, area, location, date, prepared by) is edited with the pencil button; it is printed on the PDF cover.

Add LKs or Veams by hand with the **+** next to "DimCities" in the sidebar. A DimCity that does not exist yet is created automatically.

<a id="dimcity"></a>
## DimCity page

Everything of one DimCity on one page. Cards can be collapsed with the chevron; PatchLab remembers that per card.

- **At a glance** — the whole DB in one view: LK blocks and Veams with their socket and node, racks with their devices (by short name), nodes and splitters, and the network switches with their addresses and fibres. The **QR** button makes QR codes of it (see [QR codes](#qr)).
- **Universes** — one tile per universe with its patch points. Click a tile to see exactly which LK and Veam ports carry it.
- **LK blocks** — the port layout of every LK. Click a block to change its block type and Veam links inline; see [LK block](#lk).
- **Veams** — the four ports of every Veam and whether it is linked to an LK; click to open it.
- **Loose DMX** — DMX lines without an LK or Veam.
- **Racks** — place racks and loose devices and let PatchLab patch everything onto sockets and node ports; see [Racks per DimCity](#racks).
- **Network nodes / Splitters** — the network plan of this DimCity; see [Nodes, splitters & network](#network).
- **Patch rows** — every row of this DimCity as a table.

**Color** changes the DimCity colour used in the sidebar and on the PDF. **Export** opens the Report Builder with only this DimCity selected.

<a id="lk"></a>
## LK block

An LK block has 12 ports in three groups of four. Each group can be fed by a Veam (slots A, B and C) or be used as XLR outputs.

### Block type
- **4× XLR + 3× Veam** (default): ports 1–4 are XLR, the three slots can take a Veam.
- **3× Veam**: all three groups are Veams; the LK's own ports should be empty.
- **12× XLR**: no Veams; all 12 ports are XLR. Veam links are ignored in this mode.

**Auto-detect** picks 12× XLR when more than 4 LK ports are patched; otherwise 4× XLR + 3× Veam. Choose a type yourself to override it.

### Veam slots
Pick a Veam from the same DimCity in slot A, B or C. A slot is greyed out when all four LK ports of that range are already patched on the LK itself. A Veam can be linked to one slot only; a second link is reported as an error.

### Ports table
The table merges the LK's own rows with the linked Veam's rows: universe, location, source (LK, Veam or both) and the Veam port. A **conflict** means the LK port and the Veam port carry different universes.

### Delete
**Delete LK** removes the block together with its patch rows, also when they came from a CSV. Links to Veams are removed; the Veams themselves stay. Undo brings everything back.

<a id="veam"></a>
## Veam

A Veam has four ports. It is fed by an LK: open the LK and choose the Veam in slot A, B or C. The Veam page shows which LK and slot it is linked to and its four ports with universe, location and status.

- **Not linked** (orange) — the Veam is in the show but no LK feeds it yet. In the rack patch it then gets its own Veam4 socket.
- **Linked** (green) — fed through the LK; it needs no socket of its own.
- **Linked twice** (red) — remove one of the links.

**Delete Veam** removes the Veam and its rows (also from a CSV) and clears the link in the LK. Undo brings it back.

<a id="rows"></a>
## Editing patch rows

**Edit Rows** (toolbar or Cmd/Ctrl+E) opens every row of the project in a table: imported rows, your edits and manual rows.

- Change ID, port, universe or location directly in the cell. The DimCity follows from the ID.
- **LK row / Veam row / Loose DMX Line** add a new row at the top. A loose DMX line needs a DimCity.
- Invalid rows are marked red with the reason; fix them here.
- **Reset to imported** throws away your edits to imported rows; manual rows stay.
- Nothing changes until you click **Apply Changes**.

The original CSV file is never modified. Your edits live in the project file.

<a id="validation"></a>
## Validation

PatchLab checks the patch continuously. The badge in the sidebar counts open errors (red) and warnings (yellow). Click an issue to jump to it; many have a **Fix…** button.

### Errors
- **Unknown ID** — not LK###, VEAM12### or V###.
- **Port does not exist** — an LK has ports 1–12, a Veam 1–4.
- **Patched twice with different universes** — the same port appears twice; choose which row is right.
- **Loose DMX line has no DimCity** — fill in the DimCity column.
- **Veam linked more than once** — a Veam can feed only one LK slot.
- **Too few fields** — the CSV row is incomplete.

### Warnings
- **Linked to a Veam that no longer exists** — the Veam was removed; unlink or re-add it.
- **12× XLR block with Veam links** — the links are ignored; change the block type or remove them.
- **3× Veam block but LK ports contain data** — the LK's own ports should be empty in this mode.
- **Incomplete** rows — universe or location is missing.

**Recalculate** (Cmd/Ctrl+R) runs every check again.

<a id="patchlist"></a>
## Patch list

The patch list shows every row of the project — LK, Veam and loose DMX — with type, ID, port, universe, location and status. Filter by DimCity or type a search term (ID, location, universe). Use **Edit Rows** to change rows.

<a id="devices"></a>
## Device Builder

**Network → Device Builder** (Cmd/Ctrl+Shift+D) is where you define the device types you work with. Types are saved in the show and in your personal [library](#library), so they are available in every project.

### Short names
Every node, splitter, switch and panel has a **Short name**. Racks, the Signal Flow, the PDF and the DimCity overview show it, so a long name is never cut off. Leave it empty and PatchLab makes one (brand left out, spaces tightened); the button **Fill short names** at the bottom writes one into all your existing devices so you can adjust them.

### Node
A DMX node: brand, type, number of **DMX ports**, **Ethernet ports** (1× or 2× RJ45 for link + redundant / daisy chain), default IP and subnet, height in U and a colour.

### Splitter
Single or **A/B input**, number of outputs, and whether outputs switch **independently or in pairs**.

### Switch
RJ45 and SFP port counts.

### Panel
A patch panel with **LK7-1**, **Veam4**, **XLR** and **etherCON** sockets. In a rack, every LK7-1 socket shares its lines with up to three Veam4 sockets next to it; the remaining Veam4 sockets are separate.

### Type key
Every type has a fixed key (NODE:01, PANEL:02…). Shows refer to it, so it cannot change after saving. Use **Duplicate** to make a variant.

The preview at the top shows the front face of the device with its ports as it will appear in a rack.

### Cables
The tab **Cables** holds cable types: fibre (singlemode or multimode), SFP patch cables / DAC and copper Cat. Fill in the brand, the type (for example *opticalCON QUAD 4-core*), the number of cores, the connectors on both ends (opticalCON DUO / QUAD / ADVANCED, FiberFox, LC, SC, SFP …, or type your own), the length in metres, an article key and a colour. Cable types are saved in your library like the devices. They are used for the fibre links on the Network page.

<a id="rack-builder"></a>
## Rack Builder

The **Racks** tab of the Device Builder builds 19" racks from your device types.

- **New rack**, give it a name, an **article key** (your inventory number) and a height — from **1U** up to 48U.
- Drag devices from the palette on the right into the rack, or click **+** to add one at the first free position. Green rows mean it fits, red means it does not.
- Move devices with the arrows or by dragging; remove them with the ×.
- The summary below counts DMX ports, splitter outputs, RJ45 and the LK7-1 / Veam4 / XLR sockets of the rack.

A rack is a template: you place it in a DimCity on the [Racks card](#racks), as often as you need. The article key is printed in the Racks card and on the PDF.

<a id="racks"></a>
## Racks per DimCity

The **Racks** card on a DimCity page patches the LKs and Veams of that DimCity automatically onto the racks and loose devices you place there. The result is recalculated from the current show every time, so it never goes stale.

### Placing
- **Place rack** adds a rack from the Rack Builder; give it a name for this DimCity (e.g. "Rack SL"). Remove it with the bin.
- **Loose devices**: a **loose node** without a rack, a **loose LK spider** (one LK7-1 socket on a breakout) or a **loose Veam4 spider** (one Veam4 socket). A spider can be pinned to a loose node with **On node**; its lines are then patched on that node first.

### How the patch is made
1. Every LK with data gets an **LK7-1 socket**: first a loose LK spider that is pinned to a node, then the rack panels, then other loose spiders.
2. Veams that are not fed by an LK get a **Veam4 socket**: first a Veam4 spider pinned to a node, then a free Veam4 next to an LK that does not use those lines, then separate Veam4s, then other spiders.
3. Every used line gets a **node port**. Lines of one LK or Veam stay on one node where possible — the legend shows the node per LK / Veam, and every node has its own colour.
4. When node ports run short, universes that are used more than once go through a **splitter** in the rack.

### Racks are zones
LK and Veam cables are short, so an LK or Veam on a rack socket only feeds nodes **in the same rack**. Only network cables (Cat, fibre) run from rack to rack. When two racks stand directly on top of each other, tick **stacked on the rack above** on the upper one, and they count as one. If a rack has lines but no free node port of its own, PatchLab says so and offers a **Fix** button that stacks the racks.

### Loose nodes, spiders and custom racks
- A node without a rack has no panel to be fed from, so it is added **with an LK spider**. A warning appears when a loose node has no LK or Veam spider.
- **Custom rack…** builds a rack of your own right here: choose how many panels, nodes, splitters and switches, and PatchLab places them. No article key is needed.

### Reading the result
- The counters show used / available LK7-1 sockets, Veam4 sockets, node ports and lines.
- **Recommendations** tell you what is missing: loose spiders to add, extra nodes, unused splitters.
- The rack drawing shows the universe on every node port and the LK / Veam number on every socket; hover for details.
- **Node ports** lists per node which LK or Veam port (and location) sits on which node port.
- The **patch table** at the bottom has every line: node port, universe, via splitter, socket, LK / Veam port, location.

### Using it
- **Use as network plan** copies the nodes and splitters, with their universes, into the network plan of this DimCity (IP addresses are generated).
- **Print racks** opens the Report Builder with the "Racks only" preset.

<a id="network"></a>
## Nodes, splitters & network

The network plan lists the DMX nodes and splitters of every DimCity with their IP addresses and universes. You find it on the **Nodes & Splitters** page (all DimCities) and in the **Network nodes** and **Splitters** cards of a DimCity. Switches, ports, VLANs and fibres live on the separate **Network** page; the **Setup** wizard (toolbar) walks through everything in order.

### Nodes
- Choose a node type and click **Auto-assign nodes**: PatchLab fills the universes of the DimCity low to high over as many nodes as needed, keeping the **spare ports** from Settings free.
- Drag a universe from the **universe pool** onto a port, or click a port to pick one. Ports can be emptied.
- ID, name, IP and subnet are editable per node. IDs and IPs follow the DimCity: node 1 of DB02 becomes ID:21 with last IP octet 21.
- Both RJ45 ports are shown on nodes that have two.

### Splitters
- **Auto-calculate splitters** gives every patch point of a universe a splitter output; A/B splitters carry two universes. **Add one splitter** adds an empty one.
- The output map shows universe, LK / Veam port and location per output.

The quickest way to a complete plan is to build it from the rack patch: **Use as network plan** on the [Racks card](#racks).

### Several addresses per device and the FENT scheme
- A node can have **more than one address**: use **Add address** on the node. This is for a device that is managed on one VLAN and sends or scans on another: a management address (VLAN 1090) and a lighting address (VLAN 1040), optionally a scan address (VLAN 1041). For a node with two RJ45 ports you choose which port (ETH1 or ETH2) carries which address; on a node with one port both addresses share it and the switch port becomes a trunk.
- **FENT** (Framework Entertainment Netwerk Technologie v1.1) is the standard numbering for entertainment networks. Switch it on in the **FENT** card on the Network page (tab VLAN & addresses). All addresses are 10.x.x.x with mask 255.255.0.0; the second byte is the discipline (management 10.90, lighting 10.40); the third byte splits location (1-99) from production (101-199), here taken from the DimCity number (DB02 becomes 102 in production); the fourth byte is the device, from 11 (1-10 and 251-254 are for switches and routers).
- **Apply to all DimCities** gives every node a management and a lighting address in one go and replaces its current addresses. **Check** warns about duplicates, an address that belongs to another VLAN, DHCP ranges, reserved addresses and a mask other than 255.255.0.0.
- The **Switch ports** list shows, per DimCity, which switch port each RJ45 of each device gets, access or trunk, and the VLAN colour from FENT. Export PDF prints it in the Network section, and Stickers can print a label per port. Set the VLAN IDs of your Luminex GigaCore groups to the FENT numbers; Luminex uses group × 100 by default.

### Switches, network cables and fibres
- **Network switches**: in the card *Network switches* of a DimCity choose a switch type (made in the Device Builder) and click **Add switch**. Switches that stand in a rack of the DimCity are used as well. A switch has its own addresses like a node.
- **Ports are handed out automatically**: first the RJ45 of the nodes, in node number order, then the lines of the network cables (C) that come into the DB. Per switch you see the ports; the colour is the VLAN of the port. If there are more ports needed than the switches have, the list shows it.
- **VLAN numbering** works like the Luminex GigaCore groups: Management is VLAN 1, group 2 is VLAN 200, group 3 is VLAN 300 and so on (the colours are the ones of the GigaCore). In the FENT card you can switch to the FENT numbers (1090, 1040 …) instead.
- **Fibre links**: make cable types in the Device Builder (tab *Cables*: opticalCON, FiberFox, 4-core, singlemode, SFP patch …), then connect the SFP ports of switches in the card *Fibre links*. This also connects DBs to each other. The switch shows which SFP carries which fibre, the PDF lists the fibres of each DimCity, and Stickers prints a label on both ends.

<a id="network-page"></a>
## Network page

The **Network** page holds everything about the network, per DimCity. Pick the DimCity with the chips at the top, then one of four tabs:

### Switches & ports
- Add network switches to the DimCity (or place them in a rack). Every switch shows how many ports are used.
- Ports are handed out in order: first the nodes in node-number order, then the network cables (C rows). A port carrying two VLANs becomes a trunk.
- Print the port plan or switch-port stickers from here.

### VLAN & addresses
- Choose **Luminex** numbering (Management 1, group N = N × 100) or **FENT** (1090, 1040 …) and switch the FENT address scheme on or off. You can rename every VLAN in the VLAN table.
- One click addresses all nodes. Every device can have several addresses (management, lighting, scan), each on its own VLAN.

### Fibres
- Choose a cable type (opticalCON, FiberFox, 4-core, single-mode, SFP patch) and the two switch ports to couple. **Fibres are coupled here only**; the Signal Flow only shows them.
- The matrix shows which SFP ports are used. Fibre labels can be printed as stickers.

### Overview
Per DimCity: nodes, switches, ports used, Cat lines, fibres and a status.

<a id="setup"></a>
## Setup wizard

The **Setup** button in the toolbar (also offered after an import, and under the File menu) walks through a new project in the right order. Nothing is locked: take the steps in order or jump to any step.

1. **Import the patch** — LK, Veam and C rows.
2. **Racks and devices** — read the **advice** (best setup for the LKs, Veams and universes) and apply it, or place racks and loose devices yourself.
3. **Couple LKs and Veams** — every LK and Veam gets a socket; automatic, or choose a socket / loose spider / do not patch yourself.
4. **Nodes** — the rack patch becomes the nodes of the network plan; DMX lines named like "Node 401.1" are put on that node port (see [Node names](#node-names)).
5. **Network per DB** — VLAN numbering, FENT on or off, and a network switch for every DB (the nodes take its ports).
6. **Couple the fibres** between the DBs: auto-assign from your stock, or draw them (see [Fibres](#fibres)).
7. **Check and output** — open the issues, the Signal Flow, the PDF or the stickers.

Need more locations? Use **+ DB** or **+ FOH** (front of house, where the lighting desk stands) next to the DimCity chips in the Network and Racks steps. If you open the Rack Builder or the Device Builder from the wizard, Setup comes back on the same step when you close it.

Each step shows a green check when it is done. **Skip** marks a step as skipped; **Start over** clears the skipped marks; **Stop** closes the wizard whenever you like. See [the videos](#videos) for a walk-through.

<a id="tasks"></a>
## Tasks

The **Tasks** page shows what is done and what is next, worked out from your show, so it is always true.

- **Next up** — the one thing to do now, with a button that opens [Setup](#setup) on the right step for the right DB.
- **The workflow** — the seven steps as one line: done in green, the current step ringed, skipped steps dashed.
- **Per DB** — a square for every DB and every step. Orange is still to do, yellow needs attention, green is done, grey is not needed. Click a square to go there.
- **Show checks** — project info, errors, complete rows, linked Veams, racks, network plan, PDF layout and saving.

On the Overview page a short bar shows the same next step.

<a id="qr"></a>
## QR codes

A QR code can hold the whole picture of a DB or of the system, as plain text any phone camera can read: every LK and Veam with its socket and node, the racks and their devices, the nodes with their IP address and universes, the network switches and the fibres.

- On a DimCity page, the card **At a glance** has a **QR** button that shows the codes large, with the text, **Copy text** and **Save as SVG**. The Overview has one for the whole system.
- A long DB is cut into numbered parts ([DB01 1/3]); scan them in order.
- **Stickers**: switch on **DB info QR** and **System QR** to print them on Herma sheets.
- **PDF report**: the section **QR codes** puts them on the page of each DB; the system code is on the first DB.

<a id="exchange"></a>
## Exchange with Lightwright and Vectorworks

The patch can go to Lightwright or Vectorworks (Spotlight) and come back, through files. Open it from the **Tasks** page (**Open exchange**) or the command "Exchange".

- **Export** writes a tab-delimited (Lightwright) or comma-separated (Vectorworks) file with one row per LK or Veam port: **Circuit Name** (the key, e.g. LK101.4), **Position** (the location) and **Universe**, plus DB, socket and node for information. Import it there and match on the circuit name.
- **Import** reads such a file after you changed things there, matches every row on its circuit name and shows exactly what differs. You tick the changes and press **Apply**; the universe and position are written into the patch rows and validation runs again. Rows that exist only in the file can be added as new lines; rows only in PatchLab are counted but never removed.

This is a file exchange on the standard field names, not a live connection; map the columns when you import in the other program.

<a id="netdev"></a>
## Devices on the network

PatchLab can find Art-Net nodes (Luminex LumiNode, ELC and others) on the network and send them the configuration from your plan. Open it from the **Tasks** page (**Devices on the network**).

1. **Scan the network.** Every node that answers is listed with its IP address, MAC, names and ports.
2. PatchLab **matches** each one with a node of your plan by IP address, by name or by MAC. You can change the match.
3. The status shows what differs: the name, the universe of a port, or the address.
4. Tick the nodes and press **Send**. You see exactly what will change; nothing is sent until you confirm. Changing the IP address is a separate tick, because the node moves.
5. PatchLab scans again and checks that the node now has the new settings.

Universe numbering: Luminex shows universe 1 where Art-Net says 0, so the default is one less; choose "same number" if your nodes count differently.

### Luminex GigaCore switches and LumiNode over their web API
The tabs **LumiNode (HTTP)** and **Switches** talk to the devices through the HTTP APIs that Luminex documents (GigaCore generation 2 WebApi 1.5, LumiNode/LumiCore WebApi 2.8). Fill in the user name and password of the device, then for each switch or node:

1. **Read.** The address now is the one in your plan; if the device still has another address (factory setting), type that one. PatchLab reads the device.
2. PatchLab shows what differs from the plan, one line per change.
3. **Send…** shows every call it will make (method and path). After you confirm, the calls are made one by one; it stops at the first error. Then the device is read again and checked against the plan.

**Switches (GigaCore gen 2):** a group per VLAN of the plan (name and colour), every port in the group of its device, the ports named after the device (16 characters at most), the device name, and the fibre ports in a trunk "Fibre" that carries these VLANs with the management VLAN untagged, so the switch stays reachable over the fibre. Built-in groups keep their name. The IP address is only changed if you tick it, and is done last. The change is made on the running configuration; fill in a profile slot to save it there too. Nothing else on the switch is touched. Generation 1 switches are not covered.

**LumiNode (HTTP):** the short and long name, the IP address (only if ticked) and the universe of every DMX output, in port order. PatchLab follows each output through its process block to the input that feeds it. An output whose input is shared with another block, or whose set-up is not recognised, is left alone and explained. Universe numbering follows the setting on the Nodes tab; new inputs are Art-Net or sACN as you choose.

The group "Check which switches answer / configuration sheet" keeps the simple reachability check and the sheet with port, device and VLAN per switch.

Outside the desktop app a simulated network is used so you can try it out.

<a id="fibres"></a>
## Fibres

Fibres connect the fibre ports of the switches, inside a location and between locations (DBs, FOH).

### Cable types and stock
- Make the cable types in the Device Builder (tab Cables): opticalCON, FiberFox, 4-core, singlemode, SFP patch. The length may have half metres, for example **7,5**.
- On the Network page, tab **Fibres**, fill in how many of each cable you own (6× OC7,5, 6× OC250, 2× FF250 …). The table shows how many are used and how many are left. The short code on drawings and labels is the connector plus the length: OC250, FF250, OC7,5.

### Auto-assign
**Auto-assign fibres** chains the switches of one location with the short cable and links the locations with the long cable, as a ring or a chain. Free ports with the right connector go first (opticalCON cable on an opticalCON port). It stops when the stock is empty and tells you what is missing.

### Fibre overview
In the **Signal Flow**, choose **Fibres** under Show. Every location is a card on a circle with its switches and fibre ports (17, 18 … with their connector). Drag a switch (by its name) to another place in the card, for example next to another switch, or drag the card itself. Pick a cable at the bottom, click a free port and then the port at the other end to draw a fibre. Cables run in straight lines and hop over each other with a bridge. A cable only fits ports with its own connector (opticalCON, FiberFox or SFP); other ports are dimmed. Click a cable to select or delete it.

### Switch ports with fibre connectors
A switch type can name the connector of each fibre port. The Luminex GigaCore 20t has 4 etherCON ports on the front, ports 5–16 on a panel, ports 17–18 opticalCON DUO and ports 19–20 FiberFox DUO. The fibre ports are then called by those numbers on drawings, in the lists and on the stickers.

<a id="node-names"></a>
## Node names from the CSV

A DMX line (a row without ID, with universe, destination and DimCity) can name the node and port it goes to: **Node 401.1**. The number works like V401: 401 is DB04, node 01; .1 is port 1.

- In **Setup → Link nodes to the CSV** every name found is listed with the node of the plan it belongs to. **Link automatically** picks node 01 of DB04 for 401.
- You can also choose the name on the node itself (Nodes & Splitters page, field *Name from the CSV*).
- The universes of the lines are then put on the right ports of that node, and they stay there when you use the rack as network plan again.

<a id="devices-ports"></a>
## 20t, panels and half-width devices

- **Switch types** can say how many ports sit on the front (*Ports on the front*), whether the copper ports are RJ45 or etherCON and which connector each fibre port has (*Fibre connector per port*). Ports on a panel are drawn on the panel of the rack. The standard library has the GigaCore 20t and the **GigaCore 20t (3U set)**: a built-in special device drawn like the real set (1U with etherCON 1–4, black panel with etherCON 5–16, opticalCON DUO 17–18 and FiberFox DUO 19–20). It is not editable.
- **Panel types** can have etherCON, opticalCON DUO and FiberFox DUO sockets with their first port number.
- **Half-width devices**: set *Width in the rack* of a node to Half (the LumiNode 4 is). In the Rack Builder two half-width devices share one U, left and right (drag to the left or right half, or use the ⇄ button). *Blind plate ½* and *Fill gaps next to half-width devices* fill the rest with black plates. Racks in the Signal Flow, on the DimCity page and in the PDF show them the same way.

<a id="flow"></a>
## Signal flow

The **Signal Flow** page (sidebar, or Cmd/Ctrl+4) draws the cabling of a DimCity the way it is on the floor: the rack with its nodes, splitters and LK panel → one thick LK multicore per LK block → a Veam cable per linked Veam → thin DMX lines to the **objects** (the locations from your patch list, with the universe that arrives there). XLR lines on the LK itself get a small block each, exactly in line with their port; the four ports of a Veam share one objects block.

### Reading it
- **Racks** are drawn like in the Rack Builder: rails with U numbers, the faces of nodes, splitters, switches and panels, and their sockets. A node port shows the universe on it in the node's colour; an LK7-1 or Veam4 socket shows the number of the LK or Veam that comes out of it, in the colour of the node that feeds it. A rack whose nodes only feed the panel of another rack stands to the left of it. Loose devices (a node with the spiders on it) are drawn as a stack without a frame.
- **Cables** are told apart by thickness: the thick **LK multicore** from the socket to the LK block, a thinner **Veam cable** from the slot it is plugged into, and thin **DMX lines** in the colour of their universe from every XLR or Veam port to the object. Every line leaves a block straight out of its side, at the row or socket it belongs to, and never runs through a block.
- The **patch inside a rack** (node port → splitter → socket) is not drawn until you hover it: then it lights up as a thin line along the side of the rack.
- An LK block shows only its own XLR ports; the universes that go on through a Veam are shown in that Veam's block.
- **Hover a universe** in the left bar and every line that carries it lights up, ports included. **Hover a block, a unit in a rack, a port or a line** and that flow lights up and moves: upstream to the node port and downstream to every object. Nothing else is greyed out.
- **Click** a universe, line, port or block to pin it: the path stays alive while you move the mouse, until you click something else, click the background or press Esc.

### The toolbar
- **Arrow** (V): select and move. Drag a block to move it; drag over the background to select several blocks with a rubber band and move them together; Shift+click adds to the selection; Ctrl/Cmd+A selects everything. A rack always moves as one. Blocks never overlap: a block dropped on another one is put in the nearest free spot.
- **Hand** (H, or hold Space): grab the drawing and move it. The mouse wheel zooms around the pointer.
- **Zoom bar** with − and +; **Fit** (0) brings the whole drawing into view.
- **Auto layout** puts every block of the DimCities in view back in its automatic place: columns from the rack to the objects, each block level with the port that feeds it, as few crossings as possible. **Spacing** in the left bar sets how far apart that puts them.
- **Save image** writes the drawing as an SVG file you can open or print anywhere.
- **Click the name of an LK block** to give it your own name (for example "Front truss"). This changes only the drawing; the LK number, its ports and the CSV stay as they are.

The arrangement, the zoom and the LK names are saved with the project, per DimCity, and **Export PDF** prints the drawing of every DimCity exactly as arranged here (section "Signal flow drawing"). The drawing is built from the rack patch, so place a rack or a loose node first (see [Racks per DimCity](#racks)).

### Network layer
The **Show** switch in the left bar chooses *All*, *DMX* or *Network*. The network layer shows the **switches** (with the VLAN of every used port and the fibre on every SFP), the **network cables (C)** that come into the DB and the **nodes** linked to the switch ports, in the order of the node numbers. Network cables are drawn in the colour of their VLAN; fibres are thick lines in the colour of their cable type and also connect the DBs to each other. With *Network* you see only this layer. The PDF prints the full drawing and, as an option, a second drawing of only the network.

<a id="report"></a>
## Report Builder (PDF)

**Export PDF** (Cmd/Ctrl+P) opens the Report Builder: a live preview on the right, settings on the left. Click a part of the preview to jump to its settings. The layout is saved in the project.

### Content
- **DimCities**: all, or a selection. **Output**: one PDF, or one PDF per DimCity (each with its own cover).
- **Sections per DimCity**: switch them on or off, drag to reorder, open the chevron for options. Sections: header & key figures, network nodes, splitters, racks, LK / Veam patch, universe overview, patch list, warnings, notes.
- **Position on the sheet**: every section is **Auto** (flows top to bottom) or **Fixed** at an X / Y position with a width in mm. Drag the orange handle of a section in the preview to place it; it snaps to a 5 mm grid. Fixed sections can overlap others — that is up to you.

### Style
Paper size and orientation, margins, accent colour, font, text size, density, **line weight** (light / normal / bold — bold for sheets that are read on the floor), colour-coded universes, DimCity colour in headers, grayscale. Header and footer texts take placeholders: {project} {area} {location} {date} {prepared} {dimcity}.

### Cover and Brand
Cover title, subtitle, fields, note and a draggable project logo. Under **Brand**: a company logo on every page and a text or logo watermark.

### Racks on the PDF
The Racks section draws every rack as in the app, lists the node ports with the LK / Veam port on each, the loose devices and the patch table. The preset **Racks only** prints just that.

### Templates and presets
**Save as template** stores the whole layout in the project and your library; pick it from the Template menu in any show. Presets: DB detailed paperwork, Network crew, Patch crew, Compact patch sheets, Racks only.

<a id="stickers"></a>
## Stickers (Herma sheets)

Stickers (menu File > Print Stickers, the **Stickers** button in the toolbar, or the Stickers button on a DimCity page) prints labels on **Herma A4 label sheets**. The sheet layouts come straight from the HERMA label templates, so every label lands where the template puts it.

### Sheets
- **HERMA 4680 / 4690 / 4102 / 4112**: 48,26 × 25,4 mm, 44 labels (4 × 11), 8,48 mm from the left, 8,8 mm from the top, no gaps.
- **HERMA 4097 / 4232 / 4221**: 45,72 × 21,167 mm, 48 labels (4 × 12), 9,75 mm from the left, 21,5 mm from the top, 2,54 mm between the columns.
- **Custom sheet**: enter the numbers of another sheet yourself (they are on the HERMA template of that article).
- The templates do not say which printers a sheet suits. For a laser printer use a sheet marked for laser on its pack.

### What you can print
- **Cable labels** for LK multicores and Veam cables, two per cable (both ends), with a colour band in the colour of the node that feeds it.
- **Panel connection labels**, one per LK7-1 / Veam4 socket, to stick above the socket.
- **Node port labels**: universe and where each port goes.
- **Racks, nodes, switches and splitters**.
- **Switch port labels**: switch, port, device and VLAN (in the VLAN colour) for the switch.
- **Network cable labels** (C): one per line, both ends, in the VLAN colour.
- **Fibre labels**: both ends of every fibre, with where the other end goes.
- **QR stickers** with the patch as plain text (one per LK, Veam and rack); scanning shows the text on any phone, no server needed.
- A **company image** and a **show image** on the labels (defaults: the company logo of the report brand and the logo of the project, or choose your own).

### Printing
- Choose the DimCities. With *Start a new sheet for each DimCity* every DB gets its own sheet. The button on a DimCity page opens the dialog for just that DimCity.
- **Start at label** skips the labels you already used on a part-used sheet.
- **Black and white** turns the colour bands black, for a mono laser printer.
- Print the PDF at 100% (Actual size), never fit-to-page. The **Calibration sheet** is outlines only: print it on plain paper and hold it against a real sheet in front of a light.
- The settings are saved with the project.

<a id="library"></a>
## Personal library

Device types, racks and report templates live in two places: in the show, and in your personal library on this computer (**Network → Show Library File**).

- Saving in the Device Builder or Report Builder writes to both.
- Opening a show adds the library items it lacks, and asks what to do with items the show has but the library does not, or that differ: **Replace my version**, **Add as copy** or **Keep both** (the show's item gets a new key).
- **Export Library…** writes an .lklib file you can send to a colleague; **Import Library…** reads one (or the devices from another .lkproj).

### Standard library (Luminex, ELC)
PatchLab ships with a standard library: Luminex LumiNode nodes, GigaCore switches and LumiSplit splitters, ELC dmXLAN nodes, switchGBx switches and DT splitters, plus standard LK / Veam4 / XLR panels and three ready-made racks. They are added to your library on first start.

**Settings → Device library → Check now** fetches the newest standard library from GitHub, separately from app updates: new types are added and unchanged standard types are corrected. A type you edited in the Device Builder is yours and is never overwritten. Port counts come from the manufacturers' product pages — check them against the unit in your rack.

<a id="search"></a>
## Search (Cmd/Ctrl+K)

Press **Cmd/Ctrl+K** anywhere. Type part of an LK or Veam number, a universe (u12), a location, a node name or IP, a device type or a command. Use the arrow keys and Enter; Esc closes. Locations open the LK or Veam and highlight the port.

<a id="history"></a>
## Undo and history

Every change to the project can be undone with **Cmd/Ctrl+Z** and redone with **Shift+Cmd+Z / Ctrl+Y**. In a text field these keys edit the text instead. **Edit → History…** (Cmd/Ctrl+Shift+H) shows the list of changes with a readable description; click one to go back to that point.

<a id="settings"></a>
## Settings

**Settings** (Cmd/Ctrl+,) apply to the app on this computer, not to one show.

- **Appearance**: dark, light, or match the system.
- **Language**: English or Dutch, for the app and its menus. PDF reports stay in English.
- **Autosave**: off, after every N changes, or every N minutes. Optionally keep **backup copies** in a folder of your choice, with a maximum per project.
- **Recovery**: keep a recovery file so an unsaved show can be restored after a crash.
- **Updates**: the GitHub repository that releases are read from, an optional token for a private repository, and whether to check at startup. See [Updates](#updates).
- **Device library**: check GitHub for a newer standard library (Luminex / ELC types), now or at startup. See [Personal library](#library).

<a id="updates"></a>
## Updates

PatchLab checks GitHub Releases for a newer version at startup (and via **Help → Check for Updates…**). When there is one, you see the release notes and can **Download & install**: the installer is saved in Downloads and opened; quit PatchLab and follow it. **Skip this version** hides that version until the next one.

What changed in each version is listed under [What's new](#whats-new).

<a id="request"></a>
## Sending a request or bug report

The **Request** button in the toolbar (or **Help → Send a Request…**) opens a short form: what kind of request it is (feature, bug or question), a title and a description. PatchLab adds the app version, your platform and the page you were on.

**Open on GitHub** opens a pre-filled issue in your browser; click **Submit new issue** there to send it. You need a GitHub account with access to the PatchLab repository. If you do not have that, use **Copy** and send the text to the maintainer.

Every request becomes a GitHub issue, so you can follow what happens with it.

<a id="shortcuts"></a>
## Keyboard shortcuts

- **Cmd/Ctrl+N** new project · **Cmd/Ctrl+O** open · **Cmd/Ctrl+S** save · **Cmd/Ctrl+Shift+S** save as
- **Cmd/Ctrl+I** import CSV · **Cmd/Ctrl+E** edit rows · **Cmd/Ctrl+P** report builder
- **Cmd/Ctrl+1 / 2 / 3** overview / validation / patch list · **Cmd/Ctrl+R** recalculate
- **Cmd/Ctrl+K** search · **Cmd/Ctrl+Z** undo · **Cmd/Ctrl+Shift+H** history
- **Cmd/Ctrl+Shift+D** device builder · **Cmd/Ctrl+,** settings
- **?** or **F1** this manual · **Esc** closes dialogs

<a id="whats-new"></a>
## What's new

### Version 0.6.1 — 2026-10-04
- Luminex GigaCore (generation 2) switches over their web API: read the switch, compare it with the plan and send it — a group per VLAN with name and colour, every port in the group of its device and named after it, the fibre ports in a "Fibre" trunk with the management VLAN untagged, the device name and (if ticked) the IP address. You see every call before it is made, and the switch is read again afterwards to check.
- LumiNode / LumiCore over their web API: name, IP address and the universe of every DMX output (followed through its process block), also for nodes that do not answer Art-Net polls. Outputs with a shared or unknown set-up are left alone and explained.
- The network dialog gets the tabs LumiNode (HTTP) and Switches with user name, password and https, an address field for devices that still have another address, and an optional profile slot to save a switch configuration.

### Version 0.6.0 — 2026-10-04
- New Tasks page: the next thing to do with a button that takes you there, the whole workflow as one line, a square for every DB and every step (click to go there), and the show checks. A short next-step bar sits on the Overview too.
- New card At a glance on every DimCity page: LK blocks and Veams with their socket and node, racks with their devices, nodes and splitters, and the network switches with addresses and fibres. Switches you add on the Network page show up there at once.
- QR codes with everything: a QR per DB and for the whole system holds sockets, nodes with IP, racks, switches and fibres as plain text, in numbered parts. Large view with copy / save as SVG, new sticker kinds (DB info QR, System QR) and a QR codes section in the PDF.
- Exchange with Lightwright and Vectorworks, both ways: export the patch (Circuit Name, Position, Universe) as a tab / CSV file, and import the file back — PatchLab matches on the circuit name, shows what differs and applies only what you tick.
- Devices on the network: scan for Art-Net nodes, match each with a node of the plan (IP, name, MAC), see what differs and send names and port universes (and, if you tick it, the IP address) after a preview; PatchLab scans again to check the result. Switches: reachability check and a configuration sheet. A simulated network is used outside the desktop app.
- Short names: every device type has a short name (automatic when empty, Fill short names for the existing ones) used in racks, the Signal Flow, the PDF and overviews, so long names are no longer cut off.
- Racks are zones: LK and Veam cables are short, so an LK or Veam only feeds nodes in the same rack; racks that stand on each other can be marked stacked. PatchLab warns when a rack has no node port of its own and offers a Fix button. A loose node now comes with an LK spider. Custom rack builds a rack of your own from the DimCity card or Setup.
- Signal Flow: the fibre overview moves a dragged switch live with its cables, and the Show switch no longer cuts off Fibres. Fixed the window overflowing sideways between 1380 and 1500 px. DBs without a number (FOH) get their own address number instead of sharing DB01's.
- New video library in full HD without text in the picture (subtitles via the CC button): the series Build a show, step by step (9 parts, starting from an empty project and the real CSV import) and 15 Tool guides.

### Version 0.5.2 — 2026-10-08
- Fibre overview: a switch you drag now moves live and its cables follow while you drag, not only after you let go.
- Racks are zones: LK and Veam cables are short, so an LK or Veam on a rack socket only feeds nodes in the same rack. Racks that stand directly on top of each other can be marked "stacked on the rack above" (DimCity card and Setup) and then count as one. Between racks only network cables run. The patch warns when a rack has no free node port of its own.
- A node without a rack now comes with an LK spider automatically, and the check warns when a loose node has no LK or Veam spider.
- Custom rack: build a rack of your own straight from the DimCity card or from Setup — pick how many panels, nodes, splitters and switches, PatchLab places them. No article key needed (you can still add one in the Rack Builder).
- Short names: every device type in the Device Builder has a Short name (made automatically when empty; the button Fill short names writes them into all your current devices so you can adjust them). Racks, the Signal Flow, the PDF and the new overview use the short name, so long names are no longer cut off.
- New "At a glance" card at the top of every DimCity: the LK blocks and Veams with their socket and node, the racks with their devices, the nodes and splitters, and the network switches with their fibres — in one view. Switches you add on the Network page show up here.
- Signal Flow: the Show switch no longer cuts off "Fibres".

### Version 0.5.1 — 2026-10-07
- New video tutorials with a spoken explanation (female English voice) and subtitles, in 720p: the whole workflow from the imported patch to the printed show in nine parts — Start, Racks and the advice, Couple LKs and Veams, Nodes, Network, Fibres, Signal Flow, the PDF and Stickers. Help > Video Tutorials plays them one after the other or one by one.
- The advice (best setup) now also shows on a DimCity that has no rack yet; before, it was hidden exactly then.

### Version 0.5.0 — 2026-10-06
- VLANs: the VLAN list is now its own card on the Network page (tab VLAN & addresses) and is always there, also when the FENT scheme is off. Rename any VLAN, change its colour, reset it to the standard, or add your own VLAN (ID + name). Names and colours show in the port plan, on stickers and in the PDF.
- Background picture: much bigger sizes (up to 2000% on the slider, or type any percentage), a larger move range and a Fit to drawing button; large pictures are kept sharper.
- Advice: best setup per DimCity (Racks card and Setup). From the LKs, Veams, lines and universes it works out the block mode per LK, the LK / Veam4 panels (or loose spiders when a few Veams do not justify a panel), the nodes, whether a splitter saves space, and the rack size — using only the types in your Device Builder, with the reason for each choice. One button applies it as a rack made for the DimCity.
- Couple LKs and Veams: a table per DimCity shows where every LK and Veam sits and lets you choose a socket yourself, a loose spider, or Do not patch; the rest stays automatic. Everything automatic again with one button. Also in Setup.
- Setup follows the work now: Import → Racks and devices (with the advice) → Couple LKs and Veams → Nodes (nodes from the racks + CSV names) → Network → Fibres → Check.
- A Veam that sits on a Veam4 socket of a rack (or a loose Veam4 spider) is no longer shown as "Not linked": the Veam page, the sidebar, the overview counts and the DimCity page now count it as patched and say on which socket it sits.

### Version 0.4.3 — 2026-10-05
- Background picture in the Signal Flow (floor plan, stage plot …): choose a picture, set opacity, size and position. It can be one picture for every view or its own picture for Everything, DMX, Network and Fibres (switch: Same picture on every view). It zooms and pans with the drawing, is saved with the project and is also in the saved image and the PDF.
- VLAN names can be changed: on the Network page, tab VLAN & addresses, type a new name in the VLAN table (empty = standard name). The new name is used everywhere (port plan, stickers, PDF).

### Version 0.4.2 — 2026-10-05
- Add a location anywhere: the + next to DimCities in the sidebar now has Add DB (next number), Add FOH (front of house) and Add location with a name; the Network page has + DB and + FOH next to the DimCity chips (as Setup already had).
- A switch that sits in a rack can now be removed on the Network page (button Remove from rack); before, only switches added to the DimCity itself had a Remove button.
- Nodes and splitters whose type no longer exists (old files) now show as a red card with a Remove button instead of staying invisible.

### Version 0.4.1 — 2026-10-05
- Luminex GigaCore 20t as a built-in 3U set, drawn like the real device (1U with display, knob and rear-port LEDs, etherCON 1-4, and the black panel with etherCON 5-16, opticalCON DUO 17-18 and FiberFox DUO 19-20). It can be placed in racks and chosen as a network switch in Setup; it cannot be changed in the Device Builder.
- Setup > Network per DB: besides a switch you can place a rack that has a switch in it.
- Fibres only fit ports with the same connector: opticalCON on opticalCON, FiberFox on FiberFox, SFP patch on SFP. Drawing, the form and Auto-assign all check it, and ports that do not fit are dimmed.
- Fibre overview: the switches of a location can be dragged to another place (for example side by side), and so can the location cards; the arrangement is saved with the project.
- Fibre overview: cables run in straight lines with right angles, end exactly on their port, and hop over each other with a small bridge where they cross.

### Version 0.4.0 — 2026-10-04
- Fibre overview in the Signal Flow (Show > Fibres): every location on a circle with its switches and fibre ports; draw fibres from port to port with a cable picked from your stock.
- Fibre stock (how many of each cable you own) and **Auto-assign**: switches in one location are chained with the short cable, the locations are linked with the long one (ring or chain), using free ports with the right connector. Cable codes like OC250, FF250 and OC7,5 are used on drawings and labels.
- Luminex GigaCore 20t: 4 etherCON on the front, ports 5-16 on a panel, 17-18 opticalCON DUO and 19-20 FiberFox DUO; switch types now describe their front ports and the connector of every fibre port, and panel types can have etherCON / opticalCON / FiberFox sockets. Standard library: GigaCore 20t panel and a 3U set.
- Half-width devices (LumiNode 4) side by side in one U, with blind plates to fill the rest, in the Rack Builder, the Signal Flow, the DimCity page and the PDF.
- FOH (front of house) and extra DBs can be added in Setup.
- Setup returns to the same step after you close the Rack Builder or Device Builder, and the dropdowns keep your choice.
- DMX lines with a destination like "Node 401.1" are linked to the ports of the node (new Setup step and a dropdown on the node).
- Cable lengths may have half metres (7,5 m).
- The demo show has a FOH, three switches with fibre ports in DB01, a ring of fibres and node names from the CSV.

### Version 0.3.3 — 2026-10-04
- New **Network** page (own item in the sidebar): switches and ports, VLAN and addresses, fibres and an overview, per DimCity. The DimCity page only keeps a short summary with a link.
- New **Setup** wizard (toolbar button, also offered after an import): six steps in order — import, network per DB, racks, couple the LKs, fibres, check and output. Each step shows whether it is done, can be skipped, and the whole wizard can be stopped or started over at any time.
- Fibres are coupled on the Network page only; the Signal Flow displays them.
- The demo show now has a network switch per DB with the nodes coupled in order, followed by the Cat cables (C rows) and two fibre links between the DBs.
- Applying a rack as network plan keeps the IP addresses and VLANs you already filled in.
- Video tutorials with subtitles (no sound) in Help: a complete tour and one short video each for Import, Network, Racks, Couple the LKs, Fibres, PDF and Stickers, in Dutch and English (Help > Video Tutorials).
- Compact toolbar on narrower windows (icons only).

### Version 0.3.2 — 2026-10-03
- Stickers on Herma A4 label sheets (laser printer): 4680 / 4690 / 4102 / 4112 and 4097 / 4232 / 4221, taken from the HERMA templates, plus custom sheets. Cable labels (both ends), panel connection labels, node ports, racks / nodes / switches / splitters and QR stickers, with company and show images, per DimCity, with a start position for part-used sheets and a calibration sheet.
- Network cables: CSV rows C101 / C101.1 (a Cat loom of 4 lines, VLAN in the third column) for each DB, shown on the DimCity page, in the patch list, the PDF and as stickers.
- Network switches per DimCity (and from the racks): nodes get switch ports in node number order, then the network cables. VLAN numbering like the Luminex GigaCore groups (Management 1, group N = N × 100, with their colours), switchable to the FENT numbers.
- Cables in the Device Builder (opticalCON, FiberFox, 4-core, singlemode, SFP patch) and fibre links between switch SFP ports, also between DBs, with a label on both ends.
- Signal Flow: network layer (switches, Cat cables, fibres) and a Show switch: All / DMX / Network. The PDF can print a network-only drawing too.
- Network: several addresses per device (management, lighting, scan) and the FENT scheme (v1.1) with one-click addressing of all nodes, checks, a VLAN table and a switch port plan with access/trunk and VLAN colours, also in the PDF and as switch port stickers.
- Confetti and "Patch perfect!" when a show goes from having issues to none (Settings > General > Fun switches it off).
- Festival wrapped (Help menu): a shareable card with the numbers of your show; save or copy it as an image.
- Signal Flow: "Share image" copies the drawing as a picture for a chat or e-mail.

### Version 0.3.1 — 2026-10-02
- Signal Flow page (sidebar, Cmd/Ctrl+4): a drawing of how the data runs from the rack to every object. Hover a universe, a port, a line or a block to follow it with the data moving along; click to pin; give LK blocks your own name (issue #3).
- Racks in the Signal Flow are drawn like in the Rack Builder (rails, U numbers, the faces of nodes, splitters and panels with their sockets); the patch inside a rack lights up when you hover it. LK, Veam and DMX cables differ in thickness, DMX lines have the colour of their universe and every line leaves a block straight from its side.
- Signal Flow toolbar: arrow (select, move, rubber-band selection), hand (pan), zoom bar, Fit and Auto layout. Blocks never overlap and a rack moves as one. The arrangement and zoom are saved per DimCity with the project.
- Export PDF: new section "Signal flow drawing" that prints the drawing of every DimCity as arranged on the page.
- The app sidebar collapses to icons with the arrow at its top.

### Version 0.3.0 — 2026-10-02
- Demo show on the welcome screen: a complete festival show with racks, loose devices, network plan and PDF layout to explore.
- Tours to choose from: the full tour, or one about LK blocks, nodes & network, racks, or the PDF layout.
- Progress bar bottom-left with a checklist of what is still missing in the show; every item jumps to the right place.
- Standard device library with Luminex (LumiNode, GigaCore, LumiSplit) and ELC (dmXLAN nodes, switchGBx, DT splitters) types, standard panels and ready-made racks; Settings → Device library checks GitHub for a newer library, separately from app updates.
- Help: a manual inside the app (Help button, ? or F1) that opens on the chapter of the page you are on; also on GitHub as docs/USER_MANUAL.md.
- Request button: send a feature request, bug or question as a GitHub issue, with app version and page added automatically.
- Longer tour that also covers the DimCity page, racks, search, help and requests — in English and Dutch.
- Loose devices per DimCity: nodes and LK / Veam4 spiders without a rack; a spider can be pinned to a loose node.
- Every node shows which LK / Veam port (and location) is on each node port, in the app and on the PDF.
- PDF: racks are drawn as in the app (rails, U numbers, device faces, patched ports) with print-safe lines; node port list and loose devices; preset "Racks only" and a Print racks button.
- Report Builder: sections can be placed at a fixed X / Y position and width, or dragged in the preview on a 5 mm grid; line weight setting (light / normal / bold), default darker than before.
- Delete LK and Delete Veam, also for rows that came from a CSV; undo brings them back.
- Racks can be 1U; racks have an article key; node types have 1 or 2 Ethernet ports.

### Version 0.2.0 — 2026-10-02
- Update check via GitHub Releases, with download and install from the app.
- Light theme and a Dutch interface (Settings → Language).
- Racks per DimCity with automatic LK7-1 / Veam4 patching, node colours, recommendations and "Use as network plan".
- Search everything with Cmd/Ctrl+K.
- Undo / redo with a readable history, fixable validation issues, autosave, backups and crash recovery.
- Report Builder: company brand tab with logo and watermark, movable cover image.
- Device Builder with nodes, splitters, switches, panels and racks; personal device library shared between shows.

### Version 0.1.0 — 2026-10-01
- First release: CSV import, LK / Veam / DMX validation per DimCity, Veam links, block types, network planner, PDF report builder with templates.

---

# Handleiding (Nederlands)

- [Aan de slag](#getting-started-nl)
- [Video’s](#videos-nl)
- [CSV importeren](#import-nl)
- [Projectoverzicht](#overview-nl)
- [DimCity-pagina](#dimcity-nl)
- [LK-blok](#lk-nl)
- [Veam](#veam-nl)
- [Patchregels bewerken](#rows-nl)
- [Validatie](#validation-nl)
- [Patchlijst](#patchlist-nl)
- [Device Builder](#devices-nl)
- [Rack Builder](#rack-builder-nl)
- [Racks per DimCity](#racks-nl)
- [Nodes, splitters & netwerk](#network-nl)
- [Pagina Netwerk](#network-page-nl)
- [Setup-wizard](#setup-nl)
- [Taken](#tasks-nl)
- [QR-codes](#qr-nl)
- [Uitwisselen met Lightwright en Vectorworks](#exchange-nl)
- [Apparaten op het netwerk](#netdev-nl)
- [Fibers](#fibres-nl)
- [Nodenamen uit de CSV](#node-names-nl)
- [20t, panelen en halve devices](#devices-ports-nl)
- [Signaalstroom](#flow-nl)
- [Rapportbouwer (PDF)](#report-nl)
- [Stickers (Herma-vellen)](#stickers-nl)
- [Persoonlijke bibliotheek](#library-nl)
- [Zoeken (Cmd/Ctrl+K)](#search-nl)
- [Ongedaan maken en geschiedenis](#history-nl)
- [Instellingen](#settings-nl)
- [Updates](#updates-nl)
- [Een wens of fout melden](#request-nl)
- [Sneltoetsen](#shortcuts-nl)
- [Wat is er nieuw](#whats-new-nl)

<a id="getting-started-nl"></a>
## Aan de slag

PatchLab bereidt de LK-, Veam- en DMX-patch van een show voor, controleert hem en documenteert hem, gegroepeerd per DimCity. De gebruikelijke volgorde:

1. **Nieuw project** op het welkomstscherm. Geef het een naam, gebied, locatie en datum — die komen op het voorblad van je PDF.
2. **CSV importeren** met je patchlijst (zie [CSV importeren](#import-nl)), of voeg LK's en Veams met de hand toe.
3. Kijk op de pagina **Validatie** en los op wat rood is.
4. Koppel Veams aan LK-slots, plan **racks** en **nodes** per DimCity.
5. Bouw de PDF in de **Rapportbouwer** en exporteer hem.

### Opslaan
Een project is één **.lkproj**-bestand met alles erin: de geïmporteerde CSV's, je bewerkingen, Veam-koppelingen, devicetypes, racks, netwerkplannen en rapportindelingen. Opslaan doe je met **Cmd/Ctrl+S**. Recente projecten staan op het welkomstscherm.

Automatisch opslaan, back-ups en crashherstel stel je in bij [Instellingen](#settings-nl).

### Demo-show en rondleidingen
**Demo-show openen** op het welkomstscherm (of Help → Demo-show openen) laadt een complete festivalshow: drie DimCities, LK's met Veam-koppelingen, racks en losse apparaten uit de standaardbibliotheek, een netwerkplan en een afgemaakte PDF-indeling. Er wordt niets opgeslagen tot je op Opslaan klikt, dus verander wat je wilt. **Rondleiding** laat je kiezen tussen de volledige rondleiding of één over LK-blokken, nodes, racks of de PDF-opmaak.

### Voortgangsbalk
Linksonder toont een kleine balk hoe compleet de show is: projectinfo, patch geïmporteerd, geen fouten, regels compleet, Veams gekoppeld, racks gepatcht, netwerkplan, PDF-indeling, opgeslagen. Klik erop voor de checklist; elk open punt springt naar de plek waar je het oplost.

### Waar vind je wat
- **Zijbalk**: projectoverzicht, validatie, patchlijst, nodes & splitters, netwerk, signaalstroom en elke DimCity met zijn LK's en Veams.
- **Werkbalk**: CSV importeren, Rijen bewerken, Herberekenen, Opslaan, PDF exporteren, Help en Request.
- Het pijltje bovenaan de zijbalk klapt hem in tot alleen iconen (en weer uit); PatchLab onthoudt dat.
- **Cmd/Ctrl+K** zoekt in alles: LK's, Veams, universes, locaties, devices en opdrachten.
- **?** of de Help-knop opent deze handleiding op het hoofdstuk dat bij je huidige pagina hoort.

<a id="videos-nl"></a>
## Video’s

Schermopnames van het hele appvenster, in full HD, met gesproken uitleg in het Engels. Er staat geen tekst in beeld; zet de **ondertiteling** aan met de CC-knop in de speler.

Er zijn twee reeksen:
- **Bouw een show, stap voor stap** — één project van een leeg venster tot het eindrapport: patch importeren, racks en het advies, LK’s en Veams koppelen, nodes, netwerk, fibers, signaalstroom, controle en PDF, stickers. De delen spelen na elkaar af.
- **Tool-uitleg** — één korte video per tool: Device Builder, Rack Builder en eigen rekken, het advies, koppelen en stapelen, kabeltypen en fibervoorraad, het fiberoverzicht, VLAN’s, de Signaalstroom, de PDF-bouwer, stickers, QR-codes, uitwisselen met Lightwright en Vectorworks, apparaten op het netwerk, Taken en Setup, zoeken en ongedaan maken.

Alles wat je ziet kun je zelf doen in **Demo-show openen** op het welkomstscherm. De pagina **Taken** en de knop **Setup** lopen dezelfde stappen met je door voor je eigen project.

<a id="import-nl"></a>
## CSV importeren

**CSV importeren** (werkbalk of Cmd/Ctrl+I) leest een kommagescheiden bestand met één patchpunt per regel.

### Kolommen
Je hebt vier kolommen nodig, in willekeurige volgorde — je koppelt ze in het importvenster:
- **LK- / Veam-ID** — LK101, VEAM12101 (hetzelfde als LK101) of V105
- **Poort** — 1–12 op een LK, 1–4 op een Veam
- **Universe** — een getal, of leeg als er nog niets gepatcht is
- **Positie / locatie** — vrije tekst, bijv. "Truss 2 SL"

Een regel **zonder ID** is een losse DMX-lijn; die heeft een DimCity nodig in de zesde kolom (DB01).

### DimCity uit het ID
De DimCity volgt uit het nummer: **LK101 en V105 horen bij DB01, LK215 bij DB02** (honderdtallen = DimCity).

### Kop- en voetregels
PatchLab herkent welke regels echte patchregels zijn en slaat de rest over. Pas het aan met de tellers **Eerste / laatste overslaan**; het voorbeeld laat zien wat meegaat.

### Na de import
- Geïmporteerde bestanden staan onder **Bestand → Geïmporteerde bestanden**. Daar kun je een bestand **vervangen** door een nieuwere export of het **verwijderen**. Handmatige regels, Veam-koppelingen en bloktypes blijven staan.
- Regels die niet kloppen (bijvoorbeeld een Veam op poort 6, of dezelfde poort twee keer met een andere universe) worden niet weggegooid: ze staan op de pagina [Validatie](#validation-nl) met een knop Oplossen en in **Rijen bewerken**.

### Netwerkkabels (C)
Een regel waarvan het ID met **C** begint is een **netwerkkabel** (Cat-loom): `C101` is een kabel van 4 lijnen voor DimCity 01 (het nummer werkt als bij een Veam V101). Zet de lijn in de poortkolom (1-4) of schrijf `C101.1`. De derde kolom bevat het **VLAN**: een Luminex-groepnummer (2 = VLAN 200, 3 = VLAN 300 …, 1 = Management) of het VLAN-ID zelf. De vierde kolom is de locatie. Een netwerkkabel kan alleen in een netwerkswitch: zie de pagina Netwerk.

<a id="overview-nl"></a>
## Projectoverzicht

Het overzicht is de startpagina van een project.

- De **kerncijfers** tellen DimCities, LK-blokken, Veams, universes en patchpunten van de hele show.
- De **DimCity-tabel** laat per DimCity zien hoeveel LK's en Veams er zijn, hoeveel Veams gekoppeld zijn en het aantal fouten en waarschuwingen. Klik op een regel om de DimCity te openen.
- **Projectinfo** (naam, gebied, locatie, datum, opgesteld door) bewerk je met het potloodknopje; het staat op het voorblad van de PDF.

Voeg LK's of Veams met de hand toe met de **+** naast "DimCities" in de zijbalk. Een DimCity die nog niet bestaat wordt automatisch aangemaakt.

<a id="dimcity-nl"></a>
## DimCity-pagina

Alles van één DimCity op één pagina. Kaarten klap je in met het pijltje; PatchLab onthoudt dat per kaart.

- **In één oogopslag** — de hele DB in één beeld: LK-blokken en Veams met aansluiting en node, racks met hun apparaten (op korte naam), nodes en splitters, en de netwerkswitches met adressen en fibers. De knop **QR** maakt er QR-codes van (zie [QR-codes](#qr-nl)).
- **Universes** — één tegel per universe met zijn patchpunten. Klik op een tegel om precies te zien welke LK- en Veam-poorten hem dragen.
- **LK-blokken** — de poortindeling van elke LK. Klik op een blok om het bloktype en de Veam-koppelingen ter plekke te wijzigen; zie [LK-blok](#lk-nl).
- **Veams** — de vier poorten van elke Veam en of hij aan een LK gekoppeld is; klik om hem te openen.
- **Losse DMX** — DMX-lijnen zonder LK of Veam.
- **Racks** — plaats racks en losse apparaten en laat PatchLab alles op aansluitingen en nodepoorten patchen; zie [Racks per DimCity](#racks-nl).
- **Netwerknodes / Splitters** — het netwerkplan van deze DimCity; zie [Nodes, splitters & netwerk](#network-nl).
- **Patchregels** — elke regel van deze DimCity als tabel.

**Kleur** wijzigt de DimCity-kleur in de zijbalk en op de PDF. **Exporteren** opent de Rapportbouwer met alleen deze DimCity geselecteerd.

<a id="lk-nl"></a>
## LK-blok

Een LK-blok heeft 12 poorten in drie groepen van vier. Elke groep kan door een Veam gevoed worden (slots A, B en C) of als XLR-uitgangen gebruikt worden.

### Bloktype
- **4× XLR + 3× Veam** (standaard): poorten 1–4 zijn XLR, de drie slots kunnen een Veam krijgen.
- **3× Veam**: alle drie de groepen zijn Veams; de eigen poorten van de LK horen leeg te zijn.
- **12× XLR**: geen Veams; alle 12 poorten zijn XLR. Veam-koppelingen worden in deze stand genegeerd.

**Automatisch** kiest 12× XLR als meer dan 4 LK-poorten gepatcht zijn; anders 4× XLR + 3× Veam. Kies zelf een type om dat te overrulen.

### Veam-slots
Kies in slot A, B of C een Veam uit dezelfde DimCity. Een slot is grijs als alle vier de LK-poorten van dat bereik al op de LK zelf gepatcht zijn. Een Veam kan maar aan één slot gekoppeld zijn; een tweede koppeling wordt als fout gemeld.

### Poortentabel
De tabel voegt de eigen regels van de LK samen met die van de gekoppelde Veam: universe, locatie, bron (LK, Veam of beide) en de Veam-poort. Een **conflict** betekent dat de LK-poort en de Veam-poort een andere universe hebben.

### Verwijderen
**LK verwijderen** haalt het blok weg samen met zijn patchregels, ook als die uit een CSV komen. Koppelingen naar Veams verdwijnen; de Veams zelf blijven. Ongedaan maken zet alles terug.

<a id="veam-nl"></a>
## Veam

Een Veam heeft vier poorten. Hij wordt gevoed door een LK: open de LK en kies de Veam in slot A, B of C. De Veam-pagina laat zien aan welke LK en welk slot hij gekoppeld is, en zijn vier poorten met universe, locatie en status.

- **Niet gekoppeld** (oranje) — de Veam zit in de show, maar nog geen LK voedt hem. In de rack-patch krijgt hij dan een eigen Veam4-aansluiting.
- **Gekoppeld** (groen) — gevoed via de LK; hij heeft geen eigen aansluiting nodig.
- **Twee keer gekoppeld** (rood) — haal één van de koppelingen weg.

**Veam verwijderen** haalt de Veam en zijn regels weg (ook uit een CSV) en wist de koppeling in de LK. Ongedaan maken zet hem terug.

<a id="rows-nl"></a>
## Patchregels bewerken

**Rijen bewerken** (werkbalk of Cmd/Ctrl+E) opent elke regel van het project in een tabel: geïmporteerde regels, je bewerkingen en handmatige regels.

- Wijzig ID, poort, universe of locatie direct in de cel. De DimCity volgt uit het ID.
- **LK-regel / Veam-regel / Losse DMX-lijn** zetten een nieuwe regel bovenaan. Een losse DMX-lijn heeft een DimCity nodig.
- Ongeldige regels zijn rood gemarkeerd met de reden; los ze hier op.
- **Terug naar geïmporteerd** gooit je bewerkingen van geïmporteerde regels weg; handmatige regels blijven.
- Er verandert niets tot je op **Wijzigingen toepassen** klikt.

Het originele CSV-bestand wordt nooit aangepast. Je bewerkingen zitten in het projectbestand.

<a id="validation-nl"></a>
## Validatie

PatchLab controleert de patch voortdurend. Het badge in de zijbalk telt open fouten (rood) en waarschuwingen (geel). Klik op een melding om ernaartoe te springen; veel meldingen hebben een knop **Oplossen…**.

### Fouten
- **Onbekend ID** — geen LK###, VEAM12### of V###.
- **Poort bestaat niet** — een LK heeft poorten 1–12, een Veam 1–4.
- **Twee keer gepatcht met verschillende universes** — dezelfde poort komt twee keer voor; kies welke regel klopt.
- **Losse DMX-lijn heeft geen DimCity** — vul de DimCity-kolom in.
- **Veam meer dan één keer gekoppeld** — een Veam kan maar één LK-slot voeden.
- **Te weinig velden** — de CSV-regel is onvolledig.

### Waarschuwingen
- **Gekoppeld aan een Veam die niet meer bestaat** — de Veam is verwijderd; ontkoppel hem of voeg hem opnieuw toe.
- **12× XLR-blok met Veam-koppelingen** — de koppelingen worden genegeerd; wijzig het bloktype of haal ze weg.
- **3× Veam-blok maar LK-poorten bevatten gegevens** — de eigen poorten van de LK horen in deze stand leeg te zijn.
- **Onvolledige** regels — universe of locatie ontbreekt.

**Herberekenen** (Cmd/Ctrl+R) voert alle controles opnieuw uit.

<a id="patchlist-nl"></a>
## Patchlijst

De patchlijst toont elke regel van het project — LK, Veam en losse DMX — met type, ID, poort, universe, locatie en status. Filter op DimCity of typ een zoekterm (ID, locatie, universe). Gebruik **Rijen bewerken** om regels te wijzigen.

<a id="devices-nl"></a>
## Device Builder

**Netwerk → Device Builder** (Cmd/Ctrl+Shift+D) is de plek waar je de devicetypes definieert waarmee je werkt. Types worden in de show en in je persoonlijke [bibliotheek](#library-nl) opgeslagen, dus ze zijn in elk project beschikbaar.

### Korte namen
Elke node, splitter, switch en paneel heeft een **Korte naam**. Racks, de Signaalstroom, de PDF en het DimCity-overzicht tonen die, zodat een lange naam nooit wordt afgekapt. Laat je hem leeg, dan maakt PatchLab er een (zonder merk, spaties aangepast); de knop **Korte namen invullen** onderaan zet er een in al je bestaande apparaten zodat je ze kunt aanpassen.

### Node
Een DMX-node: merk, type, aantal **DMX-poorten**, **Ethernet-poorten** (1× of 2× RJ45 voor link + redundant / daisy chain), standaard-IP en subnet, hoogte in U en een kleur.

### Splitter
Enkele of **A/B-ingang**, aantal uitgangen, en of uitgangen **los of per twee** schakelen.

### Switch
Aantal RJ45- en SFP-poorten.

### Paneel
Een patchpaneel met **LK7-1**-, **Veam4**-, **XLR**- en **etherCON**-aansluitingen. In een rek deelt elke LK7-1-aansluiting zijn lijnen met maximaal drie Veam4-aansluitingen ernaast; de overige Veam4's staan los.

### Typesleutel
Elk type heeft een vaste sleutel (NODE:01, PANEL:02…). Shows verwijzen ernaar, dus hij kan na opslaan niet meer veranderen. Gebruik **Dupliceren** voor een variant.

Het voorbeeld bovenin toont de voorkant van het device met zijn poorten, zoals het in een rek verschijnt.

### Kabels
Het tabblad **Kabels** bevat kabeltypes: fiber (singlemode of multimode), SFP-patchkabels / DAC en koper Cat. Vul het merk, het type (bijvoorbeeld *opticalCON QUAD 4-core*), het aantal cores, de connectors aan beide kanten (opticalCON DUO / QUAD / ADVANCED, FiberFox, LC, SC, SFP …, of typ je eigen), de lengte in meters, een artikelcode en een kleur in. Kabeltypes worden net als de apparaten in je bibliotheek bewaard. Ze worden gebruikt voor de fiberverbindingen op de pagina Netwerk.

<a id="rack-builder-nl"></a>
## Rack Builder

Het tabblad **Racks** van de Device Builder bouwt 19"-racks uit je devicetypes.

- **Nieuw rek**, geef het een naam, een **artikelsleutel** (je voorraadnummer) en een hoogte — van **1U** tot 48U.
- Sleep devices uit het palet rechts in het rek, of klik op **+** om er een op de eerste vrije plek te zetten. Groene rijen betekenen dat het past, rood dat het niet past.
- Verplaats devices met de pijltjes of door te slepen; haal ze weg met het ×.
- De samenvatting eronder telt DMX-poorten, splitteruitgangen, RJ45 en de LK7-1- / Veam4- / XLR-aansluitingen van het rek.

Een rek is een sjabloon: je plaatst het in een DimCity op de [Racks-kaart](#racks-nl), zo vaak als je wilt. De artikelsleutel staat in de Racks-kaart en op de PDF.

<a id="racks-nl"></a>
## Racks per DimCity

De kaart **Racks** op een DimCity-pagina patcht de LK's en Veams van die DimCity automatisch op de racks en losse apparaten die je daar plaatst. Het resultaat wordt elke keer opnieuw uit de huidige show berekend, dus het loopt nooit achter.

### Plaatsen
- **Rek plaatsen** voegt een rek uit de Rack Builder toe; geef het een naam voor deze DimCity (bijv. "Rack SL"). Verwijderen doe je met het prullenbakje.
- **Losse apparaten**: een **losse node** zonder rek, een **losse LK-spin** (één LK7-1-aansluiting op een breakout) of een **losse Veam4-spin** (één Veam4-aansluiting). Een spin kun je met **Op node** aan een losse node hangen; zijn lijnen worden dan eerst op die node gepatcht.

### Hoe de patch tot stand komt
1. Elke LK met gegevens krijgt een **LK7-1-aansluiting**: eerst een losse LK-spin die aan een node hangt, dan de rekpanelen, dan andere losse spinnen.
2. Veams die niet door een LK gevoed worden krijgen een **Veam4-aansluiting**: eerst een Veam4-spin die aan een node hangt, dan een vrije Veam4 naast een LK die die lijnen niet gebruikt, dan losse Veam4's, dan andere spinnen.
3. Elke gebruikte lijn krijgt een **nodepoort**. Lijnen van één LK of Veam blijven waar mogelijk op één node — de legenda toont de node per LK / Veam, en elke node heeft een eigen kleur.
4. Als er nodepoorten tekortkomen, gaan universes die vaker gebruikt worden via een **splitter** in het rek.

### Rekken zijn zones
LK- en Veam-kabels zijn kort, dus een LK of Veam op een rekaansluiting voedt alleen nodes **in hetzelfde rek**. Alleen netwerkkabels (Cat, fiber) lopen van rek naar rek. Staan twee rekken direct op elkaar, vink dan bij het bovenste **gestapeld op het rek erboven** aan; ze tellen dan als één. Heeft een rek lijnen maar geen eigen vrije nodepoort, dan meldt PatchLab dat en biedt een **Oplossen**-knop die de rekken stapelt.

### Losse nodes, spinnen en eigen rekken
- Een node zonder rek heeft geen paneel waar hij van gevoed wordt, daarom komt er **een LK-spin** bij. Er verschijnt een waarschuwing als een losse node geen LK- of Veam-spin heeft.
- **Eigen rek…** bouwt hier ter plekke een eigen rek: kies hoeveel panelen, nodes, splitters en switches, en PatchLab plaatst ze. Een artikelsleutel is niet nodig.

### Het resultaat lezen
- De tellers tonen gebruikt / beschikbaar voor LK7-1-aansluitingen, Veam4-aansluitingen, nodepoorten en lijnen.
- **Adviezen** vertellen wat er ontbreekt: losse spinnen om toe te voegen, extra nodes, overbodige splitters.
- De rektekening toont de universe op elke nodepoort en het LK- / Veam-nummer op elke aansluiting; beweeg eroverheen voor details.
- **Nodepoorten** laat per node zien welke LK- of Veam-poort (en locatie) op welke nodepoort zit.
- De **patchtabel** onderaan heeft elke lijn: nodepoort, universe, via splitter, aansluiting, LK- / Veam-poort, locatie.

### Gebruiken
- **Gebruik als netwerkplan** kopieert de nodes en splitters, met hun universes, naar het netwerkplan van deze DimCity (IP-adressen worden gegenereerd).
- **Racks printen** opent de Rapportbouwer met de voorinstelling "Alleen racks".

<a id="network-nl"></a>
## Nodes, splitters & netwerk

Het netwerkplan somt de DMX-nodes en splitters van elke DimCity op met hun IP-adressen en universes. Je vindt het op de pagina **Nodes & splitters** (alle DimCities) en in de kaarten **Netwerknodes** en **Splitters** van een DimCity. Switches, poorten, VLAN’s en fibers staan op de aparte pagina **Netwerk**; de **Setup**-wizard (werkbalk) loopt alles op volgorde met je door.

### Nodes
- Kies een nodetype en klik op **Nodes automatisch toewijzen**: PatchLab vult de universes van de DimCity van laag naar hoog over zoveel nodes als nodig, en houdt de **reservepoorten** uit Instellingen vrij.
- Sleep een universe uit de **universe-pool** naar een poort, of klik op een poort om er een te kiezen. Poorten kun je leegmaken.
- ID, naam, IP en subnet zijn per node te bewerken. ID's en IP's volgen de DimCity: node 1 van DB02 wordt ID:21 met laatste IP-octet 21.
- Op nodes met twee RJ45-poorten worden beide getoond.

### Splitters
- **Splitters automatisch berekenen** geeft elk patchpunt van een universe een splitteruitgang; A/B-splitters dragen twee universes. **Eén splitter toevoegen** voegt een lege toe.
- De uitgangenkaart toont per uitgang universe, LK- / Veam-poort en locatie.

De snelste weg naar een compleet plan is het uit de rack-patch opbouwen: **Gebruik als netwerkplan** op de [Racks-kaart](#racks-nl).

### Meerdere adressen per apparaat en het FENT-schema
- Een node kan **meer dan één adres** hebben: gebruik **Adres toevoegen** bij de node. Dat is voor een apparaat dat op het ene VLAN wordt beheerd en op een ander VLAN data stuurt of scant: een beheeradres (VLAN 1090) en een lichtadres (VLAN 1040), eventueel een scanadres (VLAN 1041). Bij een node met twee RJ45-poorten kies je welke poort (ETH1 of ETH2) welk adres draagt; bij een node met één poort delen beide adressen die poort en wordt de switchpoort een trunk.
- **FENT** (Framework Entertainment Netwerk Technologie v1.1) is de standaardnummering voor entertainmentnetwerken. Zet het aan in de kaart **FENT** op de pagina Netwerk (tabblad VLAN & adressen). Alle adressen zijn 10.x.x.x met masker 255.255.0.0; de tweede byte is de discipline (beheer 10.90, licht 10.40); de derde byte scheidt locatie (1-99) van productie (101-199), hier afgeleid van het DimCity-nummer (DB02 wordt 102 bij productie); de vierde byte is het apparaat, vanaf 11 (1-10 en 251-254 zijn voor switches en routers).
- **Toepassen op alle DimCities** geeft elke node in één keer een beheer- en een lichtadres en vervangt zijn huidige adressen. **Controle** waarschuwt voor dubbele adressen, een adres dat bij een ander VLAN hoort, DHCP-reeksen, gereserveerde adressen en een ander masker dan 255.255.0.0.
- De lijst **Switchpoorten** toont per DimCity welke switchpoort elke RJ45 van elk apparaat krijgt, access of trunk, en de VLAN-kleur uit FENT. Export PDF print hem in de sectie Netwerk, en Stickers kan per poort een label printen. Zet de VLAN-ID's van je Luminex GigaCore-groepen op de FENT-nummers; Luminex gebruikt standaard groep × 100.

### Switches, netwerkkabels en fibers
- **Netwerkswitches**: kies in de kaart *Netwerkswitches* van een DimCity een switchtype (gemaakt in de Device Builder) en klik op **Switch toevoegen**. Switches die in een rek van de DimCity staan worden ook gebruikt. Een switch heeft eigen adressen, net als een node.
- **Poorten worden automatisch uitgedeeld**: eerst de RJ45 van de nodes, op volgorde van nodenummer, daarna de lijnen van de netwerkkabels (C) die de DB binnenkomen. Per switch zie je de poorten; de kleur is het VLAN van de poort. Als er meer poorten nodig zijn dan de switches hebben, toont de lijst dat.
- **VLAN-nummering** werkt zoals de Luminex GigaCore-groepen: Management is VLAN 1, groep 2 is VLAN 200, groep 3 is VLAN 300 enzovoort (de kleuren zijn die van de GigaCore). In de kaart FENT kun je overschakelen naar de FENT-nummers (1090, 1040 …).
- **Fiberverbindingen**: maak kabeltypes in de Device Builder (tab *Kabels*: opticalCON, FiberFox, 4-core, singlemode, SFP-patch …) en verbind daarna de SFP-poorten van switches in de kaart *Fiberverbindingen*. Zo koppel je ook DB's aan elkaar. De switch toont welke SFP welke fiber draagt, de PDF toont de fibers van elke DimCity en Stickers print een label op beide uiteinden.

<a id="network-page-nl"></a>
## Pagina Netwerk

De pagina **Netwerk** bevat alles over het netwerk, per DimCity. Kies de DimCity met de chips bovenaan, daarna een van de vier tabbladen:

### Switches & poorten
- Voeg netwerkswitches toe aan de DimCity (of plaats ze in een rack). Elke switch toont hoeveel poorten in gebruik zijn.
- Poorten worden op volgorde uitgedeeld: eerst de nodes op nodenummer, daarna de netwerkkabels (C-regels). Een poort met twee VLAN’s wordt een trunk.
- Print vanaf hier het poortplan of switchpoort-stickers.

### VLAN & adressen
- Kies **Luminex**-nummering (Management 1, groep N = N × 100) of **FENT** (1090, 1040 …) en zet het FENT-adresschema aan of uit. Elk VLAN kun je in de VLAN-tabel hernoemen.
- Eén klik adresseert alle nodes. Elk apparaat kan meerdere adressen hebben (management, licht, scan), elk op een eigen VLAN.

### Fibers
- Kies een kabeltype (opticalCON, FiberFox, 4-core, single-mode, SFP-patch) en de twee switchpoorten die je koppelt. **Fibers koppel je alleen hier**; de Signaalstroom toont ze alleen.
- De matrix toont welke SFP-poorten bezet zijn. Fiberlabels print je als stickers.

### Overzicht
Per DimCity: nodes, switches, gebruikte poorten, Cat-lijnen, fibers en een status.

<a id="setup-nl"></a>
## Setup-wizard

De knop **Setup** in de werkbalk (ook aangeboden na een import, en in het menu Bestand) loopt een nieuw project in de juiste volgorde door. Niets zit vast: neem de stappen op volgorde of spring naar elke stap.

1. **Patch importeren** — LK-, Veam- en C-regels.
2. **Netwerk per DB** — VLAN-nummering, FENT aan of uit, en een netwerkswitch voor elke DB.
3. **Racks** — plaats racks of losse apparaten en pas het rack toe als netwerkplan.
4. **LK’s koppelen** aan de racks.
5. **Nodes aan de CSV koppelen** — DMX-regels met een naam als "Node 401.1" (zie [Nodenamen](#node-names-nl)).
6. **Fibers koppelen** tussen de DB’s: automatisch uit je voorraad, of tekenen (zie [Fibers](#fibres-nl)).
7. **Controle en uitvoer** — open de problemen, de Signaalstroom, de PDF of de stickers.

Meer locaties nodig? Gebruik **+ DB** of **+ FOH** (front of house, waar de lichttafel staat) naast de DimCity-chips in de stappen Netwerk en Racks. Open je de Rack Builder of Device Builder vanuit de wizard, dan komt Setup bij sluiten terug op dezelfde stap.

Elke stap krijgt een groen vinkje als hij klaar is. **Overslaan** markeert een stap als overgeslagen; **Opnieuw beginnen** wist de overgeslagen-markeringen; **Stop** sluit de wizard wanneer je wilt. Zie [de video’s](#videos-nl) voor een rondleiding.

<a id="tasks-nl"></a>
## Taken

De pagina **Taken** laat zien wat klaar is en wat de volgende stap is, berekend uit je show, dus altijd waar.

- **Hierna** — het ene dat je nu moet doen, met een knop die [Setup](#setup-nl) opent op de juiste stap voor de juiste DB.
- **De werkwijze** — de zeven stappen als één lijn: klaar in groen, de huidige stap omcirkeld, overgeslagen stappen gestippeld.
- **Per DB** — een vakje voor elke DB en elke stap. Oranje moet nog, geel heeft aandacht nodig, groen is klaar, grijs is niet nodig. Klik op een vakje om ernaartoe te gaan.
- **Controles van de show** — projectinfo, fouten, complete regels, gekoppelde Veams, racks, netwerkplan, PDF-indeling en opslaan.

Op de Overzichtspagina staat een korte balk met dezelfde volgende stap.

<a id="qr-nl"></a>
## QR-codes

Een QR-code kan het hele beeld van een DB of van het systeem bevatten, als platte tekst die elke telefooncamera leest: elke LK en Veam met aansluiting en node, de racks en hun apparaten, de nodes met IP-adres en universes, de netwerkswitches en de fibers.

- Op een DimCity-pagina heeft de kaart **In één oogopslag** een knop **QR** die de codes groot toont, met de tekst, **Tekst kopiëren** en **Opslaan als SVG**. Het Overzicht heeft er een voor het hele systeem.
- Een lange DB wordt in genummerde delen geknipt ([DB01 1/3]); scan ze op volgorde.
- **Stickers**: zet **DB-info QR** en **Systeem-QR** aan om ze op Herma-vellen te printen.
- **PDF-rapport**: de sectie **QR-codes** zet ze op de pagina van elke DB; de systeemcode staat bij de eerste DB.

<a id="exchange-nl"></a>
## Uitwisselen met Lightwright en Vectorworks

De patch kan naar Lightwright of Vectorworks (Spotlight) en terugkomen, via bestanden. Open hem vanaf de pagina **Taken** (**Uitwisseling openen**) of het commando "Uitwisselen".

- **Export** schrijft een tab-gescheiden (Lightwright) of kommagescheiden (Vectorworks) bestand met één regel per LK- of Veam-poort: **Circuit Name** (de sleutel, bijv. LK101.4), **Position** (de locatie) en **Universe**, plus DB, aansluiting en node ter informatie. Importeer het daar en match op de circuit name.
- **Import** leest zo'n bestand nadat je daar iets hebt veranderd, matcht elke regel op de circuit name en laat precies zien wat verschilt. Je vinkt de wijzigingen aan en drukt op **Toepassen**; universe en positie worden in de patchregels geschreven en de controle draait opnieuw. Regels die alleen in het bestand staan kun je als nieuwe regels toevoegen; regels die alleen in PatchLab staan worden geteld maar nooit verwijderd.

Dit is een bestandsuitwisseling op de standaard veldnamen, geen live koppeling; wijs de kolommen toe als je in het andere programma importeert.

<a id="netdev-nl"></a>
## Apparaten op het netwerk

PatchLab kan Art-Net-nodes (Luminex LumiNode, ELC en andere) op het netwerk vinden en ze de configuratie uit je plan sturen. Open het vanaf de pagina **Taken** (**Apparaten op het netwerk**).

1. **Scan het netwerk.** Elke node die antwoordt staat in de lijst met IP-adres, MAC, namen en poorten.
2. PatchLab **koppelt** elke node aan een node uit je plan op IP-adres, naam of MAC. Je kunt de koppeling aanpassen.
3. De status laat zien wat verschilt: de naam, het universe van een poort of het adres.
4. Vink de nodes aan en druk op **Sturen**. Je ziet precies wat er verandert; er wordt niets gestuurd zonder jouw bevestiging. Het IP-adres veranderen is een apart vinkje, want de node verhuist.
5. PatchLab scant opnieuw en controleert of de node nu de nieuwe instellingen heeft.

Universe-nummering: Luminex toont universe 1 waar Art-Net 0 zegt, dus de standaard is één lager; kies "zelfde nummer" als je nodes anders tellen.

### Luminex GigaCore-switches en LumiNode via hun web-API
De tabbladen **LumiNode (HTTP)** en **Switches** praten met de apparaten via de HTTP-API's die Luminex documenteert (GigaCore generatie 2 WebApi 1.5, LumiNode/LumiCore WebApi 2.8). Vul de gebruikersnaam en het wachtwoord van het apparaat in en doe dan per switch of node:

1. **Uitlezen.** Het adres nu is dat uit je plan; heeft het apparaat nog een ander adres (fabrieksinstelling), typ dan dat adres. PatchLab leest het apparaat uit.
2. PatchLab toont wat verschilt van het plan, één regel per wijziging.
3. **Sturen…** toont elke aanroep die gedaan wordt (methode en pad). Na je bevestiging gebeuren de aanroepen een voor een; bij de eerste fout stopt het. Daarna wordt het apparaat opnieuw uitgelezen en met het plan vergeleken.

**Switches (GigaCore gen 2):** een groep per VLAN van het plan (naam en kleur), elke poort in de groep van zijn apparaat, de poorten genoemd naar het apparaat (maximaal 16 tekens), de apparaatnaam, en de fibre-poorten in een trunk "Fibre" met deze VLAN's en het beheer-VLAN untagged, zodat de switch via de fibre bereikbaar blijft. Ingebouwde groepen houden hun naam. Het IP-adres wordt alleen veranderd als je het aanvinkt en gebeurt als laatste. De wijziging gaat in de actieve configuratie; vul een profielslot in om hem daar ook te bewaren. Verder wordt niets op de switch aangeraakt. Generatie 1-switches vallen erbuiten.

**LumiNode (HTTP):** de korte en lange naam, het IP-adres (alleen als aangevinkt) en het universe van elke DMX-uitgang, in poortvolgorde. PatchLab volgt elke uitgang via zijn process block naar de ingang die hem voedt. Een uitgang waarvan de ingang gedeeld wordt met een ander blok, of waarvan de opzet niet herkend wordt, blijft ongemoeid en wordt uitgelegd. De universe-nummering volgt de instelling op het tabblad Nodes; nieuwe ingangen zijn Art-Net of sACN naar keuze.

Het uitklapblok "Controleer welke switches antwoorden / configuratieblad" houdt de eenvoudige bereikbaarheidscontrole en het blad met poort, apparaat en VLAN per switch.

Buiten de desktop-app wordt een gesimuleerd netwerk gebruikt zodat je het kunt uitproberen.

<a id="fibres-nl"></a>
## Fibers

Fibers verbinden de fiberpoorten van de switches, binnen een locatie en tussen locaties (DB’s, FOH).

### Kabeltypes en voorraad
- Maak de kabeltypes in de Device Builder (tab Kabels): opticalCON, FiberFox, 4-core, singlemode, SFP-patch. De lengte mag halve meters hebben, bijvoorbeeld **7,5**.
- Vul op de pagina Netwerk, tab **Fibers**, in hoeveel je van elke kabel hebt (6× OC7,5, 6× OC250, 2× FF250 …). De tabel toont hoeveel er gebruikt en over zijn. De korte code op tekeningen en labels is de connector plus de lengte: OC250, FF250, OC7,5.

### Automatisch koppelen
**Fibers automatisch koppelen** zet de switches van één locatie achter elkaar met de korte kabel en verbindt de locaties met de lange kabel, als ring of ketting. Vrije poorten met de juiste connector gaan eerst (opticalCON-kabel op een opticalCON-poort). Het stopt als de voorraad op is en meldt wat er ontbreekt.

### Fiber-overzicht
Kies in de **Signaalstroom** onder Tonen voor **Fibers**. Elke locatie is een kaart op een cirkel met zijn switches en fiberpoorten (17, 18 … met hun connector). Sleep een switch (aan zijn naam) naar een andere plek in de kaart, bijvoorbeeld naast een andere switch, of sleep de kaart zelf. Kies onderaan een kabel, klik op een vrije poort en daarna op de poort aan de andere kant om een fiber te tekenen. Kabels lopen in rechte lijnen en springen met een bruggetje over elkaar. Een kabel past alleen op poorten met zijn eigen connector (opticalCON, FiberFox of SFP); andere poorten worden gedimd. Klik op een kabel om hem te selecteren of te verwijderen.

### Switchpoorten met fiberconnectors
Een switchtype kan de connector van elke fiberpoort benoemen. De Luminex GigaCore 20t heeft 4 etherCON-poorten op de voorkant, poort 5–16 op een paneel, poort 17–18 opticalCON DUO en poort 19–20 FiberFox DUO. De fiberpoorten heten dan zo op tekeningen, in lijsten en op de stickers.

<a id="node-names-nl"></a>
## Nodenamen uit de CSV

Een DMX-regel (een regel zonder ID, met universe, bestemming en DimCity) kan de node en poort noemen waar hij heen gaat: **Node 401.1**. Het nummer werkt als V401: 401 is DB04, node 01; .1 is poort 1.

- In **Setup → Nodes aan de CSV koppelen** staat elke gevonden naam met de node van het plan waar hij bij hoort. **Automatisch koppelen** kiest voor 401 node 01 van DB04.
- Je kunt de naam ook op de node zelf kiezen (pagina Nodes & splitters, veld *Naam uit de CSV*).
- De universes van de regels komen dan op de juiste poorten van die node, en blijven daar staan als je het rek opnieuw als netwerkplan gebruikt.

<a id="devices-ports-nl"></a>
## 20t, panelen en halve devices

- **Switchtypes** kunnen aangeven hoeveel poorten op de voorkant zitten (*Ports on the front*), of de koperpoorten RJ45 of etherCON zijn en welke connector elke fiberpoort heeft (*Fibre connector per port*). Poorten op een paneel worden getekend op het paneel van het rek. De standaardbibliotheek heeft de GigaCore 20t en de **GigaCore 20t (3U set)**: een ingebouwd speciaal device getekend zoals de echte set (1U met etherCON 1–4, zwart paneel met etherCON 5–16, opticalCON DUO 17–18 en FiberFox DUO 19–20). Hij is niet te bewerken.
- **Paneeltypes** kunnen etherCON-, opticalCON DUO- en FiberFox DUO-aansluitingen hebben met hun eerste poortnummer.
- **Halve devices**: zet *Width in the rack* van een node op Half (de LumiNode 4 is dat). In de Rack Builder delen twee halve devices één U, links en rechts (sleep naar de linker- of rechterhelft, of gebruik de knop ⇄). *Blind plate ½* en *Fill gaps next to half-width devices* vullen de rest met zwarte blindplaten. Racks in de Signaalstroom, op de DimCity-pagina en in de PDF tonen ze hetzelfde.

<a id="flow-nl"></a>
## Signaalstroom

De pagina **Signaalstroom** (zijbalk, of Cmd/Ctrl+4) tekent de bekabeling van een DimCity zoals die op de vloer ligt: het rek met zijn nodes, splitters en LK-paneel → één dikke LK-multicore per LK-blok → een Veam-kabel per gekoppelde Veam → dunne DMX-lijnen naar de **objecten** (de locaties uit je patchlijst, met de universe die daar aankomt). XLR-lijnen op de LK zelf krijgen elk een klein blokje, precies in lijn met hun poort; de vier poorten van een Veam delen één objectenblok.

### Lezen
- **Rekken** zijn getekend zoals in de Rack Builder: rails met U-nummers, de fronten van nodes, splitters, switches en panelen, en hun aansluitingen. Een nodepoort toont de universe die erop staat in de kleur van de node; een LK7-1- of Veam4-aansluiting toont het nummer van de LK of Veam die eruit komt, in de kleur van de node die hem voedt. Een rek waarvan de nodes alleen het paneel van een ander rek voeden staat links daarvan. Losse apparaten (een node met de spinnen eraan) staan als een stapel zonder kader.
- **Kabels** herken je aan de dikte: de dikke **LK-multicore** van de aansluiting naar het LK-blok, een dunnere **Veam-kabel** vanuit het slot waar hij op zit, en dunne **DMX-lijnen** in de kleur van hun universe van elke XLR- of Veam-poort naar het object. Elke lijn vertrekt recht uit de zijkant van een blok, bij de regel of aansluiting waar hij bij hoort, en loopt nooit door een blok heen.
- De **patch in het rek** (nodepoort → splitter → aansluiting) wordt pas getekend als je eroverheen beweegt: dan licht hij op als een dunne lijn langs de zijkant van het rek.
- Een LK-blok toont alleen zijn eigen XLR-poorten; de universes die via een Veam doorgaan staan in het blok van die Veam.
- **Beweeg over een universe** in de linkerbalk en elke lijn die hem draagt licht op, inclusief de poorten. **Beweeg over een blok, een unit in een rek, een poort of een lijn** en die flow licht op en beweegt: stroomopwaarts naar de nodepoort en stroomafwaarts naar elk object. Al het andere houdt zijn kleur.
- **Klik** op een universe, lijn, poort of blok om het vast te zetten: het pad blijft leven terwijl je de muis beweegt, tot je ergens anders op klikt, op de achtergrond klikt of Esc drukt.

### De werkbalk
- **Pijl** (V): selecteren en verplaatsen. Sleep een blok om het te verplaatsen; sleep over de achtergrond om meerdere blokken met een kader te kiezen en samen te verplaatsen; Shift+klik voegt toe aan de selectie; Ctrl/Cmd+A kiest alles. Een rek verplaatst altijd als geheel. Blokken komen nooit op elkaar: een blok dat je op een ander blok neerzet gaat naar de dichtstbijzijnde vrije plek.
- **Handje** (H, of houd Spatie ingedrukt): pak de tekening en verschuif hem. Het muiswiel zoomt rond de muisaanwijzer.
- **Zoombalk** met − en +; **Passend** (0) brengt de hele tekening in beeld.
- **Auto-indeling** zet elk blok van de DimCities in beeld terug op zijn automatische plek: kolommen van het rek naar de objecten, elk blok op de hoogte van de poort die het voedt, zo min mogelijk kruisingen. **Afstand** in de linkerbalk bepaalt hoe ver dat uit elkaar staat.
- **Afbeelding opslaan** schrijft de tekening als SVG-bestand dat je overal kunt openen of printen.
- **Klik op de naam van een LK-blok** om het een eigen naam te geven (bijvoorbeeld "Front truss"). Dit verandert alleen de tekening; het LK-nummer, de poorten en de CSV blijven zoals ze zijn.

De indeling, de zoom en de LK-namen worden per DimCity met het project opgeslagen, en **Export PDF** print de tekening van elke DimCity precies zoals je hem hier hebt neergezet (sectie "Signaalstroom-tekening"). De tekening wordt uit de rekpatch opgebouwd, dus plaats eerst een rek of een losse node (zie [Rekken per DimCity](#racks-nl)).

### Netwerklaag
De schakelaar **Tonen** in de linkerbalk kiest *Alles*, *DMX* of *Netwerk*. De netwerklaag toont de **switches** (met het VLAN van elke gebruikte poort en de fiber op elke SFP), de **netwerkkabels (C)** die de DB binnenkomen en de **nodes** die aan de switchpoorten hangen, op volgorde van de nodenummers. Netwerkkabels staan in de kleur van hun VLAN; fibers zijn dikke lijnen in de kleur van hun kabeltype en verbinden ook de DB's met elkaar. Met *Netwerk* zie je alleen deze laag. De PDF print de volledige tekening en, als optie, een tweede tekening met alleen het netwerk.

<a id="report-nl"></a>
## Rapportbouwer (PDF)

**PDF exporteren** (Cmd/Ctrl+P) opent de Rapportbouwer: rechts een live voorbeeld, links de instellingen. Klik op een deel van het voorbeeld om naar de bijbehorende instellingen te springen. De indeling wordt in het project opgeslagen.

### Inhoud
- **DimCities**: alle, of een selectie. **Uitvoer**: één PDF, of één PDF per DimCity (elk met een eigen voorblad).
- **Secties per DimCity**: zet ze aan of uit, sleep om te ordenen, open het pijltje voor opties. Secties: kop & kerncijfers, netwerknodes, splitters, racks, LK- / Veam-patch, universe-overzicht, patchlijst, waarschuwingen, notities.
- **Positie op het blad**: elke sectie is **Automatisch** (van boven naar beneden) of **Vast** op een X- / Y-positie met een breedte in mm. Sleep de oranje greep van een sectie in het voorbeeld om hem te plaatsen; hij springt naar een raster van 5 mm. Vaste secties kunnen over andere heen vallen — dat is aan jou.

### Stijl
Papierformaat en richting, marges, accentkleur, lettertype, tekstgrootte, dichtheid, **lijndikte** (licht / normaal / dik — dik voor bladen die op de vloer gelezen worden), universes in kleur, DimCity-kleur in koppen, grijstinten. Kop- en voetteksten kennen plaatshouders: {project} {area} {location} {date} {prepared} {dimcity}.

### Voorblad en huisstijl
Titel, ondertitel, velden, notitie en een versleepbaar projectlogo. Onder **Huisstijl**: een bedrijfslogo op elke pagina en een tekst- of logowatermerk.

### Racks op de PDF
De sectie Racks tekent elk rek zoals in de app, somt de nodepoorten op met de LK- / Veam-poort die erop zit, de losse apparaten en de patchtabel. De voorinstelling **Alleen racks** print alleen dat.

### Templates en voorinstellingen
**Opslaan als template** bewaart de hele indeling in het project en je bibliotheek; kies hem in elke show uit het menu Template. Voorinstellingen: DB detailed paperwork, Network crew, Patch crew, Compact patch sheets, Racks only.

<a id="stickers-nl"></a>
## Stickers (Herma-vellen)

Stickers (menu Bestand > Stickers printen, de knop **Stickers** in de werkbalk, of de knop Stickers op een DimCity-pagina) print labels op **Herma A4-etikettenvellen**. De vel-indelingen komen rechtstreeks uit de HERMA-sjablonen, dus elk label komt waar het sjabloon het neerzet.

### Vellen
- **HERMA 4680 / 4690 / 4102 / 4112**: 48,26 × 25,4 mm, 44 labels (4 × 11), 8,48 mm vanaf links, 8,8 mm vanaf boven, geen tussenruimte.
- **HERMA 4097 / 4232 / 4221**: 45,72 × 21,167 mm, 48 labels (4 × 12), 9,75 mm vanaf links, 21,5 mm vanaf boven, 2,54 mm tussen de kolommen.
- **Eigen vel**: voer zelf de maten van een ander vel in (die staan op het HERMA-sjabloon van dat artikel).
- De sjablonen vermelden niet voor welke printers een vel geschikt is. Gebruik voor een laserprinter een vel dat op de verpakking voor laser is aangegeven.

### Wat je kunt printen
- **Kabellabels** voor LK-multicores en Veam-kabels, twee per kabel (beide uiteinden), met een kleurband in de kleur van de node die hem voedt.
- **Aansluitlabels paneel**, één per LK7-1- / Veam4-aansluiting, om boven de aansluiting te plakken.
- **Nodepoort-labels**: universe en waar elke poort heen gaat.
- **Racks, nodes, switches en splitters**.
- **Switchpoort-labels**: switch, poort, apparaat en VLAN (in de VLAN-kleur) voor de switch.
- **Netwerkkabel-labels** (C): één per lijn, beide uiteinden, in de VLAN-kleur.
- **Fiberlabels**: beide uiteinden van elke fiber, met waar het andere uiteinde heen gaat.
- **QR-stickers** met de patch als platte tekst (één per LK, Veam en rack); scannen toont de tekst op elke telefoon, zonder server.
- Een **bedrijfsafbeelding** en een **showafbeelding** op de labels (standaard: het bedrijfslogo uit de huisstijl van het rapport en het logo van het project, of kies zelf een afbeelding).

### Printen
- Kies de DimCities. Met *Begin een nieuw vel voor elke DimCity* krijgt elke DB zijn eigen vel. De knop op een DimCity-pagina opent het venster voor alleen die DimCity.
- **Begin bij label** slaat de labels over die je al op een deels gebruikt vel hebt gebruikt.
- **Zwart-wit** maakt de kleurbanden zwart, voor een zwart-wit laserprinter.
- Print de PDF op 100% (Werkelijke grootte), nooit passend maken. Het **Kalibratieblad** bevat alleen kaders: print het op gewoon papier en houd het tegen een echt vel voor een lamp.
- De instellingen worden met het project opgeslagen.

<a id="library-nl"></a>
## Persoonlijke bibliotheek

Devicetypes, racks en rapporttemplates staan op twee plekken: in de show, en in je persoonlijke bibliotheek op deze computer (**Netwerk → Bibliotheekbestand tonen**).

- Opslaan in de Device Builder of Rapportbouwer schrijft naar allebei.
- Bij het openen van een show worden ontbrekende bibliotheekitems toegevoegd, en wordt gevraagd wat er moet gebeuren met items die de show wél heeft maar de bibliotheek niet, of die afwijken: **Mijn versie vervangen**, **Als kopie toevoegen** of **Allebei houden** (het item van de show krijgt een nieuwe sleutel).
- **Bibliotheek exporteren…** schrijft een .lklib-bestand dat je naar een collega kunt sturen; **Bibliotheek importeren…** leest er een (of de devices uit een andere .lkproj).

### Standaardbibliotheek (Luminex, ELC)
PatchLab komt met een standaardbibliotheek: Luminex LumiNode-nodes, GigaCore-switches en LumiSplit-splitters, ELC dmXLAN-nodes, switchGBx-switches en DT-splitters, plus standaard LK- / Veam4- / XLR-panelen en drie kant-en-klare racks. Ze worden bij de eerste start aan je bibliotheek toegevoegd.

**Instellingen → Devicebibliotheek → Nu controleren** haalt de nieuwste standaardbibliotheek van GitHub, los van app-updates: nieuwe types worden toegevoegd en ongewijzigde standaardtypes gecorrigeerd. Een type dat je in de Device Builder hebt bewerkt is van jou en wordt nooit overschreven. Poortaantallen komen van de productpagina's van de fabrikanten — controleer ze tegen het apparaat in je rek.

<a id="search-nl"></a>
## Zoeken (Cmd/Ctrl+K)

Druk overal op **Cmd/Ctrl+K**. Typ een deel van een LK- of Veam-nummer, een universe (u12), een locatie, een nodenaam of IP, een devicetype of een opdracht. Gebruik de pijltjestoetsen en Enter; Esc sluit. Locaties openen de LK of Veam en lichten de poort op.

<a id="history-nl"></a>
## Ongedaan maken en geschiedenis

Elke wijziging in het project kun je ongedaan maken met **Cmd/Ctrl+Z** en opnieuw doen met **Shift+Cmd+Z / Ctrl+Y**. In een tekstveld bewerken deze toetsen de tekst. **Bewerken → Geschiedenis…** (Cmd/Ctrl+Shift+H) toont de lijst met wijzigingen met een leesbare omschrijving; klik op een regel om naar dat punt terug te gaan.

<a id="settings-nl"></a>
## Instellingen

**Instellingen** (Cmd/Ctrl+,) gelden voor de app op deze computer, niet voor één show.

- **Weergave**: donker, licht, of het systeem volgen.
- **Taal**: Engels of Nederlands, voor de app en de menu's. PDF-rapporten blijven Engels.
- **Automatisch opslaan**: uit, na elke N wijzigingen, of elke N minuten. Optioneel **back-upkopieën** bewaren in een map naar keuze, met een maximum per project.
- **Herstel**: een herstelbestand bijhouden zodat een niet-opgeslagen show na een crash teruggehaald kan worden.
- **Updates**: de GitHub-repository waaruit releases gelezen worden, een optioneel token voor een privérepository, en of er bij het opstarten gecontroleerd wordt. Zie [Updates](#updates-nl).
- **Devicebibliotheek**: GitHub controleren op een nieuwere standaardbibliotheek (Luminex- / ELC-types), nu of bij het opstarten. Zie [Persoonlijke bibliotheek](#library-nl).

<a id="updates-nl"></a>
## Updates

PatchLab controleert bij het opstarten (en via **Help → Controleren op updates…**) GitHub Releases op een nieuwere versie. Is die er, dan zie je de release-opmerkingen en kun je **Downloaden & installeren**: de installer wordt in Downloads opgeslagen en geopend; sluit PatchLab af en volg de installer. **Deze versie overslaan** verbergt die versie tot de volgende.

Wat er per versie veranderd is, staat onder [Wat is er nieuw](#whats-new-nl).

<a id="request-nl"></a>
## Een wens of fout melden

De knop **Request** in de werkbalk (of **Help → Een verzoek sturen…**) opent een kort formulier: wat voor verzoek het is (wens, fout of vraag), een titel en een beschrijving. PatchLab voegt de app-versie, je platform en de pagina waar je was toe.

**Openen op GitHub** opent een vooringevuld issue in je browser; klik daar op **Submit new issue** om het te versturen. Je hebt een GitHub-account met toegang tot de PatchLab-repository nodig. Heb je dat niet, gebruik dan **Kopiëren** en stuur de tekst naar de beheerder.

Elk verzoek wordt een GitHub-issue, zodat je kunt volgen wat ermee gebeurt.

<a id="shortcuts-nl"></a>
## Sneltoetsen

- **Cmd/Ctrl+N** nieuw project · **Cmd/Ctrl+O** openen · **Cmd/Ctrl+S** opslaan · **Cmd/Ctrl+Shift+S** opslaan als
- **Cmd/Ctrl+I** CSV importeren · **Cmd/Ctrl+E** rijen bewerken · **Cmd/Ctrl+P** rapportbouwer
- **Cmd/Ctrl+1 / 2 / 3** overzicht / validatie / patchlijst · **Cmd/Ctrl+R** herberekenen
- **Cmd/Ctrl+K** zoeken · **Cmd/Ctrl+Z** ongedaan maken · **Cmd/Ctrl+Shift+H** geschiedenis
- **Cmd/Ctrl+Shift+D** device builder · **Cmd/Ctrl+,** instellingen
- **?** of **F1** deze handleiding · **Esc** sluit vensters

<a id="whats-new-nl"></a>
## Wat is er nieuw

### Versie 0.6.1 — 2026-10-04
- Luminex GigaCore-switches (generatie 2) via hun web-API: lees de switch uit, vergelijk met het plan en stuur — een groep per VLAN met naam en kleur, elke poort in de groep van zijn apparaat en ernaar genoemd, de fibre-poorten in een trunk "Fibre" met het beheer-VLAN untagged, de apparaatnaam en (als aangevinkt) het IP-adres. Je ziet elke aanroep voordat hij gedaan wordt en de switch wordt daarna opnieuw uitgelezen ter controle.
- LumiNode / LumiCore via hun web-API: naam, IP-adres en het universe van elke DMX-uitgang (gevolgd via zijn process block), ook voor nodes die niet op Art-Net-polls antwoorden. Uitgangen met een gedeelde of onbekende opzet blijven ongemoeid en worden uitgelegd.
- Het netwerkvenster krijgt de tabbladen LumiNode (HTTP) en Switches met gebruikersnaam, wachtwoord en https, een adresveld voor apparaten die nog een ander adres hebben en een optioneel profielslot om een switchconfiguratie te bewaren.

### Versie 0.6.0 — 2026-10-04
- Nieuwe pagina Taken: het volgende dat je moet doen met een knop die je erheen brengt, de hele werkwijze als één lijn, een vakje voor elke DB en elke stap (klik om erheen te gaan) en de controles van de show. Op het Overzicht staat ook een korte balk met de volgende stap.
- Nieuwe kaart In één oogopslag op elke DimCity-pagina: LK-blokken en Veams met aansluiting en node, racks met hun apparaten, nodes en splitters, en de netwerkswitches met adressen en fibers. Switches die je op de Netwerk-pagina toevoegt staan er meteen.
- QR-codes met alles: een QR per DB en voor het hele systeem bevat aansluitingen, nodes met IP, racks, switches en fibers als platte tekst, in genummerde delen. Groot beeld met kopiëren / opslaan als SVG, nieuwe stickersoorten (DB-info QR, Systeem-QR) en een sectie QR-codes in de PDF.
- Uitwisselen met Lightwright en Vectorworks, beide kanten op: exporteer de patch (Circuit Name, Position, Universe) als tab- / CSV-bestand en importeer het bestand terug — PatchLab matcht op de circuit name, toont wat verschilt en past alleen toe wat je aanvinkt.
- Apparaten op het netwerk: scan op Art-Net-nodes, koppel elke aan een node uit het plan (IP, naam, MAC), zie wat verschilt en stuur namen en poortuniverses (en, als je het aanvinkt, het IP-adres) na een voorbeeld; PatchLab scant opnieuw om het resultaat te controleren. Switches: bereikbaarheidscontrole en een configuratieblad. Buiten de desktop-app wordt een gesimuleerd netwerk gebruikt.
- Korte namen: elk devicetype heeft een korte naam (automatisch als hij leeg is, Korte namen invullen voor de bestaande) die in racks, de Signaalstroom, de PDF en overzichten wordt gebruikt, zodat lange namen niet meer worden afgekapt.
- Rekken zijn zones: LK- en Veam-kabels zijn kort, dus een LK of Veam voedt alleen nodes in hetzelfde rek; rekken die op elkaar staan kun je als gestapeld markeren. PatchLab waarschuwt als een rek geen eigen nodepoort heeft en biedt een Oplossen-knop. Een losse node krijgt nu een LK-spin erbij. Eigen rek bouwt een eigen rek vanuit de DimCity-kaart of Setup.
- Signaalstroom: het fiberoverzicht verplaatst een gesleepte switch live met zijn kabels, en de Tonen-schakelaar kapt Fibers niet meer af. Het venster liep tussen 1380 en 1500 px opzij over de rand; dat is opgelost. DB's zonder nummer (FOH) krijgen een eigen adresnummer in plaats van dat van DB01 te delen.
- Nieuwe videobibliotheek in full HD zonder tekst in beeld (ondertitels via de CC-knop): de reeks Bouw een show, stap voor stap (9 delen, vanaf een leeg project en de echte CSV-import) en 15 Tool-uitleggen.

### Versie 0.5.2 — 2026-10-08
- Fiberoverzicht: een switch die je sleept beweegt nu live mee en de kabels volgen tijdens het slepen, niet pas na loslaten.
- Rekken zijn zones: LK- en Veam-kabels zijn kort, dus een LK of Veam op een rekaansluiting voedt alleen nodes in hetzelfde rek. Rekken die direct op elkaar staan kun je aanvinken als "gestapeld op het rek erboven" (DimCity-kaart en Setup); ze tellen dan als één. Tussen rekken lopen alleen netwerkkabels. De patch waarschuwt als een rek geen eigen vrije nodepoort heeft.
- Een node zonder rek krijgt nu automatisch een LK-spin erbij, en de controle waarschuwt als een losse node geen LK- of Veam-spin heeft.
- Eigen rek: bouw een eigen rek direct vanuit de DimCity-kaart of Setup — kies hoeveel panelen, nodes, splitters en switches, PatchLab plaatst ze. Geen artikelkey nodig (in de Rack Builder kun je die nog wel invullen).
- Korte namen: elk devicetype in de Device Builder heeft een Korte naam (automatisch gemaakt als hij leeg is; de knop Korte namen invullen zet ze in al je huidige devices zodat je ze kunt aanpassen). Racks, de Signaalstroom, de PDF en het nieuwe overzicht gebruiken de korte naam, dus lange namen worden niet meer afgekapt.
- Nieuwe kaart "In één oogopslag" bovenaan elke DimCity: de LK-blokken en Veams met hun aansluiting en node, de racks met hun devices, de nodes en splitters, en de netwerkswitches met hun fibers — in één overzicht. Switches die je op de Netwerk-pagina toevoegt staan er direct in.
- Signaalstroom: de Tonen-schakelaar kapt "Fibers" niet meer af.

### Versie 0.5.1 — 2026-10-07
- Nieuwe video-uitleg met gesproken uitleg (Engelse vrouwenstem) en ondertiteling, in 720p: de hele workflow van de geïmporteerde patch tot de geprinte show in negen delen — Start, Racks en het advies, LK's en Veams koppelen, Nodes, Netwerk, Fibers, Signaalstroom, de PDF en Stickers. Help > Video-uitleg speelt ze achter elkaar of een voor een af.
- Het advies (beste setup) staat nu ook op een DimCity zonder rek; eerder was het juist dan verborgen.

### Versie 0.5.0 — 2026-10-06
- VLAN's: de VLAN-lijst is nu een eigen kaart op de pagina Netwerk (tab VLAN & adressen) en is er altijd, ook als het FENT-schema uit staat. Hernoem elk VLAN, wijzig de kleur, zet terug naar de standaard, of voeg je eigen VLAN toe (ID + naam). Namen en kleuren staan in het poortplan, op stickers en in de PDF.
- Achtergrondafbeelding: veel grotere formaten (tot 2000% op de schuif, of typ elk percentage), een groter verschuifbereik en een knop Aan tekening aanpassen; grote afbeeldingen blijven scherper.
- Advies: beste setup per DimCity (kaart Racks en Setup). Uit de LK's, Veams, lijnen en universes rekent het uit: de blokmodus per LK, de LK-/Veam4-panelen (of losse spinnen als een paar Veams geen paneel rechtvaardigen), de nodes, of een splitter ruimte bespaart, en de rekgrootte — met alleen de types uit je Device Builder en de reden bij elke keuze. Eén knop past het toe als een rek dat voor de DimCity is gemaakt.
- LK's en Veams koppelen: een tabel per DimCity laat zien waar elke LK en Veam zit en laat je zelf een aansluiting kiezen, een losse spin, of Niet patchen; de rest blijft automatisch. Met één knop weer alles automatisch. Ook in Setup.
- Setup volgt nu het werk: Importeren → Racks en apparaten (met het advies) → LK's en Veams koppelen → Nodes (nodes uit de racks + CSV-namen) → Netwerk → Fibers → Controle.
- Een Veam die op een Veam4-aansluiting van een rek (of een losse Veam4-spin) zit wordt niet meer als "Niet gekoppeld" getoond: de Veam-pagina, de zijbalk, de tellingen in het overzicht en de DimCity-pagina tellen hem nu als gepatcht mee en zeggen op welke aansluiting hij zit.

### Versie 0.4.3 — 2026-10-05
- Achtergrondafbeelding in de Signaalstroom (plattegrond, stageplot …): kies een afbeelding en stel doorzichtigheid, grootte en positie in. Het kan één afbeelding voor elke weergave zijn of een eigen afbeelding voor Alles, DMX, Netwerk en Fibers (schakelaar: Zelfde afbeelding op elke weergave). Hij zoomt en schuift mee met de tekening, wordt met het project opgeslagen en staat ook in de opgeslagen afbeelding en de PDF.
- VLAN-namen kun je aanpassen: op de pagina Netwerk, tab VLAN & adressen, typ een nieuwe naam in de VLAN-tabel (leeg = standaardnaam). De nieuwe naam wordt overal gebruikt (poortplan, stickers, PDF).

### Versie 0.4.2 — 2026-10-05
- Een locatie toevoegen kan overal: de + naast DimCities in de zijbalk heeft nu DB toevoegen (volgend nummer), FOH toevoegen (front of house) en Locatie met een naam toevoegen; de pagina Netwerk heeft + DB en + FOH naast de DimCity-chips (zoals Setup al had).
- Een switch die in een rek zit kan nu op de pagina Netwerk worden verwijderd (knop Uit rek halen); eerder hadden alleen switches die aan de DimCity zelf waren toegevoegd een knop Verwijderen.
- Nodes en splitters waarvan het type niet meer bestaat (oude bestanden) verschijnen nu als rode kaart met een knop Verwijderen, in plaats van onzichtbaar te blijven.

### Versie 0.4.1 — 2026-10-05
- Luminex GigaCore 20t als ingebouwde 3U-set, getekend zoals het echte apparaat (1U met display, knop en rear-port-LED's, etherCON 1-4, en het zwarte paneel met etherCON 5-16, opticalCON DUO 17-18 en FiberFox DUO 19-20). Hij kan in racks worden geplaatst en in Setup als netwerkswitch worden gekozen; in de Device Builder is hij niet te wijzigen.
- Setup > Netwerk per DB: naast een switch kun je een rek plaatsen waar een switch in zit.
- Fibers passen alleen op poorten met dezelfde connector: opticalCON op opticalCON, FiberFox op FiberFox, SFP-patch op SFP. Tekenen, het formulier en Automatisch koppelen controleren dit, en poorten die niet passen worden gedimd.
- Fiber-overzicht: de switches van een locatie zijn te verslepen naar een andere plek (bijvoorbeeld naast elkaar), en de locatiekaarten ook; de indeling wordt met het project opgeslagen.
- Fiber-overzicht: kabels lopen in rechte lijnen met haakse hoeken, eindigen precies op hun poort en springen met een bruggetje over elkaar waar ze kruisen.

### Versie 0.4.0 — 2026-10-04
- Fiber-overzicht in de Signaalstroom (Tonen > Fibers): elke locatie op een cirkel met zijn switches en fiberpoorten; teken fibers van poort naar poort met een kabel uit je voorraad.
- Fibervoorraad (hoeveel je van elke kabel hebt) en **Automatisch koppelen**: switches in één locatie worden achter elkaar gezet met de korte kabel, de locaties worden verbonden met de lange (ring of ketting), met vrije poorten met de juiste connector. Kabelcodes als OC250, FF250 en OC7,5 staan op tekeningen en labels.
- Luminex GigaCore 20t: 4 etherCON op de voorkant, poort 5-16 op een paneel, 17-18 opticalCON DUO en 19-20 FiberFox DUO; switchtypes beschrijven nu hun voorpoorten en de connector van elke fiberpoort, en paneeltypes kunnen etherCON / opticalCON / FiberFox-aansluitingen hebben. Standaardbibliotheek: GigaCore 20t-paneel en een 3U-set.
- Halve devices (LumiNode 4) naast elkaar in één U, met blindplaten voor de rest, in de Rack Builder, de Signaalstroom, de DimCity-pagina en de PDF.
- FOH (front of house) en extra DB's toevoegen kan in Setup.
- Setup komt terug op dezelfde stap als je de Rack Builder of Device Builder sluit, en de keuzelijsten houden je keuze.
- DMX-regels met een bestemming als "Node 401.1" worden gekoppeld aan de poorten van de node (nieuwe Setup-stap en een keuzelijst op de node).
- Kabellengtes mogen halve meters hebben (7,5 m).
- De demo-show heeft een FOH, drie switches met fiberpoorten in DB01, een ring van fibers en nodenamen uit de CSV.

### Versie 0.3.3 — 2026-10-04
- Nieuwe pagina **Netwerk** (eigen item in de zijbalk): switches en poorten, VLAN en adressen, fibers en een overzicht, per DimCity. De DimCity-pagina houdt alleen een korte samenvatting met een link.
- Nieuwe **Setup**-wizard (knop in de werkbalk, ook aangeboden na een import): zes stappen op volgorde — importeren, netwerk per DB, racks, LK's koppelen, fibers, controle en uitvoer. Elke stap laat zien of hij klaar is, kan worden overgeslagen, en de hele wizard kun je op elk moment stoppen of opnieuw starten.
- Fibers koppel je alleen op de Netwerk-pagina; de Signaalstroom toont ze.
- De demo-show heeft nu per DB een netwerkswitch met de nodes op volgorde gekoppeld, daarna de Cat-kabels (C-regels) en twee fiberverbindingen tussen de DB's.
- Een rack toepassen als netwerkplan behoudt de IP-adressen en VLAN's die je al had ingevuld.
- Video-uitleg met ondertiteling (zonder geluid) in Help: een complete rondleiding en per onderdeel een korte video — Importeren, Netwerk, Racks, LK's koppelen, Fibers, PDF en Stickers — in het Nederlands en Engels (Help > Video-uitleg).
- Compacte werkbalk op smallere vensters (alleen pictogrammen).

### Versie 0.3.2 — 2026-10-03
- Stickers op Herma A4-etikettenvellen (laserprinter): 4680 / 4690 / 4102 / 4112 en 4097 / 4232 / 4221, overgenomen uit de HERMA-sjablonen, plus eigen vellen. Kabellabels (beide uiteinden), aansluitlabels paneel, nodepoorten, racks / nodes / switches / splitters en QR-stickers, met bedrijfs- en showafbeelding, per DimCity, met een startpositie voor deels gebruikte vellen en een kalibratieblad.
- Netwerkkabels: CSV-regels C101 / C101.1 (een Cat-loom van 4 lijnen, VLAN in de derde kolom) per DB, te zien op de DimCity-pagina, in de patchlijst, de PDF en als stickers.
- Netwerkswitches per DimCity (en uit de racks): nodes krijgen switchpoorten op volgorde van nodenummer, daarna de netwerkkabels. VLAN-nummering zoals de Luminex GigaCore-groepen (Management 1, groep N = N × 100, met hun kleuren), omschakelbaar naar de FENT-nummers.
- Kabels in de Device Builder (opticalCON, FiberFox, 4-core, singlemode, SFP-patch) en fiberverbindingen tussen SFP-poorten van switches, ook tussen DB's, met een label op beide uiteinden.
- Signaalstroom: netwerklaag (switches, Cat-kabels, fibers) en een schakelaar Tonen: Alles / DMX / Netwerk. De PDF kan ook een tekening met alleen het netwerk printen.
- Netwerk: meerdere adressen per apparaat (beheer, licht, scan) en het FENT-schema (v1.1) met één-klik adressering van alle nodes, controles, een VLAN-tabel en een switchpoortplan met access/trunk en VLAN-kleuren, ook in de PDF en als switchpoort-stickers.
- Confetti en "Patch perfect!" zodra een show van problemen naar geen problemen gaat (Instellingen > Algemeen > Plezier zet het uit).
- Festival wrapped (Help-menu): een deelbare kaart met de cijfers van je show; opslaan of kopiëren als afbeelding.
- Signaalstroom: "Afbeelding delen" kopieert de tekening als plaatje voor een chat of e-mail.

### Versie 0.3.1 — 2026-10-02
- Pagina Signaalstroom (zijbalk, Cmd/Ctrl+4): een tekening van hoe de data van het rek naar elk object loopt. Beweeg over een universe, een poort, een lijn of een blok om hem te volgen met bewegende data; klik om vast te zetten; geef LK-blokken een eigen naam (issue #3).
- Rekken in de Signaalstroom zijn getekend zoals in de Rack Builder (rails, U-nummers, de fronten van nodes, splitters en panelen met hun aansluitingen); de patch in het rek licht op als je eroverheen beweegt. LK-, Veam- en DMX-kabels verschillen in dikte, DMX-lijnen hebben de kleur van hun universe en elke lijn vertrekt recht uit de zijkant van een blok.
- Werkbalk Signaalstroom: pijl (selecteren, verplaatsen, selectie met kader), handje (verschuiven), zoombalk, Passend en Auto-indeling. Blokken komen nooit op elkaar en een rek verplaatst als geheel. De indeling en zoom worden per DimCity met het project opgeslagen.
- Export PDF: nieuwe sectie "Signaalstroom-tekening" die de tekening van elke DimCity print zoals hij op de pagina staat.
- De zijbalk van de app klapt in tot iconen met het pijltje bovenaan.

### Versie 0.3.0 — 2026-10-02
- Demo-show op het welkomstscherm: een complete festivalshow met racks, losse apparaten, netwerkplan en PDF-indeling om te verkennen.
- Rondleidingen om uit te kiezen: de volledige, of één over LK-blokken, nodes & netwerk, racks, of de PDF-opmaak.
- Voortgangsbalk linksonder met een checklist van wat er nog ontbreekt in de show; elk punt springt naar de juiste plek.
- Standaard devicebibliotheek met Luminex- (LumiNode, GigaCore, LumiSplit) en ELC-types (dmXLAN-nodes, switchGBx, DT-splitters), standaardpanelen en kant-en-klare racks; Instellingen → Devicebibliotheek controleert GitHub op een nieuwere bibliotheek, los van app-updates.
- Help: een handleiding in de app (Help-knop, ? of F1) die opent op het hoofdstuk van de pagina waar je bent; ook op GitHub als docs/USER_MANUAL.md.
- Request-knop: stuur een wens, fout of vraag als GitHub-issue, met app-versie en pagina automatisch erbij.
- Langere rondleiding die ook de DimCity-pagina, racks, zoeken, help en requests behandelt — in het Engels en Nederlands.
- Losse apparaten per DimCity: nodes en LK- / Veam4-spinnen zonder rek; een spin kan aan een losse node gehangen worden.
- Elke node toont welke LK- / Veam-poort (en locatie) op welke nodepoort zit, in de app en op de PDF.
- PDF: racks worden getekend zoals in de app (rails, U-nummers, device-faces, gepatchte poorten) met printvaste lijnen; nodepoortenlijst en losse apparaten; voorinstelling "Alleen racks" en een knop Racks printen.
- Rapportbouwer: secties kunnen op een vaste X- / Y-positie en breedte gezet worden, of in het voorbeeld gesleept op een raster van 5 mm; instelling lijndikte (licht / normaal / dik), standaard donkerder dan voorheen.
- LK verwijderen en Veam verwijderen, ook voor regels uit een CSV; ongedaan maken zet ze terug.
- Racks kunnen 1U zijn; racks hebben een artikelsleutel; nodetypes hebben 1 of 2 Ethernet-poorten.

### Versie 0.2.0 — 2026-10-02
- Updatecontrole via GitHub Releases, met downloaden en installeren vanuit de app.
- Licht thema en een Nederlandse interface (Instellingen → Taal).
- Racks per DimCity met automatische LK7-1- / Veam4-patching, nodekleuren, adviezen en "Gebruik als netwerkplan".
- Overal zoeken met Cmd/Ctrl+K.
- Ongedaan maken / opnieuw met leesbare geschiedenis, oplosbare validatiemeldingen, automatisch opslaan, back-ups en crashherstel.
- Rapportbouwer: tabblad huisstijl met logo en watermerk, verplaatsbare voorbladafbeelding.
- Device Builder met nodes, splitters, switches, panelen en racks; persoonlijke devicebibliotheek gedeeld tussen shows.

### Versie 0.1.0 — 2026-10-01
- Eerste release: CSV-import, LK- / Veam- / DMX-validatie per DimCity, Veam-koppelingen, bloktypes, netwerkplanner, PDF-rapportbouwer met templates.
