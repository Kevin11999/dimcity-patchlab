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
- [Network config](#netdev)
- [Racks & DBs](#racks)
- [Power (PDs and Socapex)](#power)
- [Align tool](#align)
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

### Other prefixes, network cables and nodes
- **Settings → This show** says, per show, what the first column is called: the prefix of an LK (default LK), of a Veam (V), of the network cables (C, with its number of lines) and of nodes (Node). A show that calls its LKs “K101” is read as LK101 and written back as K101 in the CSV export. You can add more cable types, each with its own prefix and number of lines.
- **C101** (and C101.1 …) is a network cable; its third column is the VLAN group.
- **Node601,1** (or Node 601.1) puts a universe on a node: 6 = DB06, 01 = node 01 of that DB, 1 = port 1. The DimCity follows from the number; the position text is kept as the location of that port.

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

**Color** changes the DimCity colour used in the sidebar and on the PDF. **Export** opens the Report Builder with only this DimCity selected. **Delete** (bin, top right) removes the whole DB: its LKs, Veams, rows in the CSV, racks, network plan and fibres. It asks first, and it stays gone when the CSV is read again.

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
A patch panel with **LK37**, **Veam4**, **XLR** and **etherCON** sockets. Under **Veam4 sockets that belong to each LK37 socket** you say how the Veam4 sockets are divided: 3 (the default) gives every LK37 socket three Veam4 sockets of its own — with 2× LK37 and 6× Veam4 that is Veam1–3 on LK1 and Veam4–6 on LK2 — and 0 makes all Veam4 sockets separate. The drawing of the panel shows the groups. In a rack, a Veam4 socket that belongs to an LK37 socket shows next to it, with the Veam that is linked to that LK; a separate Veam is not patched on it unless you allow that in Settings → This show. The **etherCON** sockets are the network ports of the panel: a node in the rack is plugged into one of them.

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
- The summary below counts DMX ports, splitter outputs, RJ45 and the LK37 / Veam4 / XLR sockets of the rack.

A rack is a template: you place it in a DimCity on the [Racks card](#racks), as often as you need. The article key is printed in the Racks card and on the PDF.

<a id="racks"></a>
## Racks per DimCity

The **Racks** card on a DimCity page patches the LKs and Veams of that DimCity automatically onto the racks and loose devices you place there. The result is recalculated from the current show every time, so it never goes stale.

### Placing
- **Place rack** adds a rack from the Rack Builder; give it a name for this DimCity (e.g. "Rack SL"). Remove it with the bin.
- **Loose devices**: a **loose node** without a rack, a **loose LK spider** (one LK37 socket on a breakout) or a **loose Veam4 spider** (one Veam4 socket). A spider can be pinned to a loose node with **On node**; its lines are then patched on that node first.

### How the patch is made
1. Every LK with data gets an **LK37 socket**: first a loose LK spider that is pinned to a node, then the rack panels, then other loose spiders.
2. Veams that are not fed by an LK get a **Veam4 socket**: first a Veam4 spider pinned to a node, then separate Veam4s, then other spiders. The Veam4 sockets that belong to an LK37 socket are for that LK: another Veam only goes on them when you switch on *A separate Veam may go on a free Veam4 socket of an LK panel* in Settings → This show (default off).
3. Every used line gets a **node port**. Lines of one LK or Veam stay on one node where possible. **Every LK and every Veam has a colour of its own in the whole show** — never two the same, on the rack, in the Signal Flow, in the PDF and on the labels — and a node port has the colour of the LK or Veam that sits on it. A node is told apart by its label (N1, N2 …), not by a colour.
4. When node ports run short, universes that are used more than once go through a **splitter** in the rack.

### Racks are zones
LK and Veam cables are short, so an LK or Veam on a rack socket only feeds nodes **in the same rack**. Only network cables (Cat, fibre) run from rack to rack. When two racks stand directly on top of each other, tick **stacked on the rack above** on the upper one, and they count as one. If a rack has lines but no free node port of its own, PatchLab says so and offers a **Fix** button that stacks the racks.

### Loose nodes, spiders and custom racks
- A node without a rack has no panel to be fed from, so it is added **with an LK spider**. A warning appears when a loose node has no LK or Veam spider.
- **Custom rack…** builds a rack of your own right here: choose how many panels, nodes, splitters and switches, and PatchLab places them. No article key is needed.

### Network ports on a panel
A rack with a panel that has etherCON ports (say 3) and three nodes behind it: every node is plugged into one of the ports, and the cable to the switch goes into that port on the front. The nodes of a rack take the ports in order by default; the table **Network ports on the panels** lets you choose a node per port. The rack drawing shows the node on the port (N1, N2 …) and the port on the node (P1.2); the Network page shows the panel port next to the switch port, and the PDF plug list too.

### Reading the result
- The counters show used / available LK37 sockets, Veam4 sockets, node ports and lines.
- **Recommendations** tell you what is missing: loose spiders to add, extra nodes, unused splitters.
- The rack drawing shows the universe on every node port and the LK / Veam number on every socket; hover for details.
- **Node ports** lists per node which LK or Veam port (and location) sits on which node port.
- The **patch table** at the bottom has every line: node port, universe, via splitter, socket, LK / Veam port, location.

### Using it
- **Use as network plan** copies the nodes and splitters, with their universes, into the network plan of this DimCity (IP addresses are generated).
- **Print racks** opens the Report Builder with the "Racks only" preset.

<a id="network"></a>
## Nodes, splitters & network

The network plan lists the DMX nodes and splitters of every DimCity with their IP addresses and universes. You find it on the **Nodes** tab of the **Network** page (all DimCities) and in the **Network nodes** and **Splitters** cards of a DimCity. The old page “Nodes & Splitters” is that tab now. Switches, ports, VLANs and fibres are on the other tabs of the **Network** page; the **Setup** wizard (toolbar) walks through everything in order.

### Nodes
- The quickest way to a plan: **Nodes from the racks** (or **Use as network plan** on the [Racks card](#racks)) takes the nodes and splitters from the racks of the DimCity, with the universes of the rack patch. Or choose **Plan by hand…**, pick a node type and click **Auto-assign nodes**: PatchLab fills the universes of the DimCity low to high over as many nodes as needed, keeping the **spare ports** from Settings free.
- Every DMX port of a node shows its universe, the **LK or Veam that is patched on it** (in its own colour, with its ports) and the location.
- Drag a universe from the **universe pool** onto a port, or click a port to pick one. Ports can be emptied.
- ID, name, IP and subnet are editable per node. IDs and IPs follow the DimCity: node 1 of DB02 becomes ID:21 with last IP octet 21.
- Both RJ45 ports are shown on nodes that have two.

### Splitters
- **Auto-calculate splitters** (under **Plan by hand…**) gives every patch point of a universe a splitter output; A/B splitters carry two universes. **Add one splitter** adds an empty one.
- The output map shows universe, LK / Veam port and location per output.

The quickest way to a complete plan is to build it from the rack patch: **Use as network plan** on the [Racks card](#racks).

### Several addresses per device and the FENT scheme
- A node can have **more than one address**: use **Add address** on the node. This is for a device that is managed on one VLAN and sends or scans on another: a management address (VLAN 1090) and a lighting address (VLAN 1040), optionally a scan address (VLAN 1041). For a node with two RJ45 ports you choose which port (ETH1 or ETH2) carries which address; on a node with one port both addresses share it and the switch port becomes a trunk.
- **FENT** (Framework Entertainment Netwerk Technologie v1.1) is the standard numbering for entertainment networks. Press **Create the IP plan…** in the **IP plan** card on the Addresses tab of the Network page (it switches the scheme on). All addresses are 10.x.x.x with mask 255.255.0.0; the second byte is the discipline (management 10.90, lighting 10.40); the third byte splits location (1-99) from production (101-199), here taken from the DimCity number (DB02 becomes 102 in production); the fourth byte is the device, from 11 (1-10 and 251-254 are for switches and routers).
- **Create the IP plan…** first shows what changes (old → new address per device), then gives every node a management and a lighting address and every switch .1, .2, .3 … — switch 1 of DB01 is 10.90.101.1, switch 1 of DB02 is 10.90.102.1; nodes and splitters count on from .11. Switches in a rack count too. The **Checks** on the Addresses tab warn about duplicate addresses (also between DimCities and between the extra addresses of one device), an address that belongs to another VLAN, devices of one VLAN in different networks, DHCP ranges, reserved addresses, a mask other than 255.255.0.0, and a port that is not a trunk although the device on it carries two VLANs.
- The **Patch board** shows, per DimCity, which switch port each RJ45 of each device is on, access or trunk, and the VLAN colour. Export PDF prints it in the Network section and as a plug list, and Stickers can print a label per port. Set the VLAN IDs of your Luminex GigaCore groups to the FENT numbers; Luminex uses group × 100 by default.

### Switches, network cables and fibres
- **Network switches**: in the card *Network switches* of a DimCity choose a switch type (made in the Device Builder) and click **Add switch**. Switches that stand in a rack of the DimCity are used as well. A switch has its own addresses like a node; a switch in a rack has them too.
- **You put the devices on the ports yourself** (Patch board) — nothing is placed by itself; **Auto-fill ports…** fills the free ports once, if you want that. Per switch you see the ports; the colour is the VLAN of the port. If more ports are needed than the switches have, the board says so.
- **VLAN numbering** works like the Luminex GigaCore groups: Management is VLAN 1, group 2 is VLAN 200, group 3 is VLAN 300 and so on (the colours are the ones of the GigaCore). In the FENT card you can switch to the FENT numbers (1090, 1040 …) instead.
- **Fibre links**: make cable types in the Device Builder (tab *Cables*: opticalCON, FiberFox, 4-core, singlemode, SFP patch …), then connect the SFP ports of switches in the card *Fibre links*. This also connects DBs to each other. The switch shows which SFP carries which fibre, the PDF lists the fibres of each DimCity, and Stickers prints a label on both ends.

<a id="network-page"></a>
## Network page

The **Network** page holds everything about the network. Pick a DimCity with the chips at the top (or **All** to see every DimCity under each other), then one of six tabs. It opens on the patch board: the first thing to do is to put every node and cable on a switch port.

### Patch board
- Every switch of the DimCity is drawn like its front: the RJ45 ports in a row, the SFP ports behind a gap. A port shows its VLAN number and colour at the bottom; a device on it shows its icon, its id (like ID:21 or C101.1) and **what it is** (LumiNode 12, Cat loom …). A small orange tag (P1.2) says the node stands behind network port 2 of a rack panel.
- **Drag a device onto a port** — or click the device and then the port. Under the switches is the tray **Without a port**: every node RJ45 and every network cable line that has no port yet waits there. Drop a device in the tray to take it off its port. The tray stays at the bottom of the window while you scroll along the switches, so you can always drag from it.
- A device dropped on a **used** port takes its place; the one that was there goes back to the tray, and the port the moved device came from stays empty. **Nothing is placed by itself**: a new device waits in the tray until you place it.
- **Auto-fill ports…** fills the free ports once, in the order you choose (nodes then cables or the other way round, by id or as planned); keep what you placed or start over; this DimCity or all of them. Afterwards nothing moves by itself. **Take all off** puts everything back in the tray. A show made with an older version keeps its ports exactly as they were.
- **Link to switch…** connects two switches through RJ45 ports, as a **trunk** that carries every VLAN — the usual way with more than one switch in a DB. **Link automatically** chains the switches with their last free ports. Linked ports cannot take a device. (Fibres between switches are on the Fibres tab.)
- **Connections as a list** below the board shows the same as a table, with a switch and a port per device. It is the secondary way: the board is the first.

### Nodes
- Per node: the type, its name in the CSV (Node 601), and **where it has to be plugged in** — a list of every switch port; choosing a used port takes it over. A node in a rack also says which network port of the rack panel it stands behind.
- Every DMX port shows its universe, the **LK or Veam patched on it** (own colour, ports) and the location. **Node ports: universes and names** (below) paints universes, protocol and direction onto the ports.
- **Advanced network** (a LumiNode): tick it and every VLAN of the node becomes a group on the node itself, with its own address and a lighting setting; a port that carries two VLANs becomes a trunk. Network config sends it through the node's network API (validate, send, commit); PatchLab warns when the switch port is not a trunk although the node needs one.
- **Nodes from the racks** and **Plan by hand…** (node type, auto-assign nodes, auto-calculate splitters) are at the top of every DimCity.

### Switches
- Every switch of the show, also the ones in a rack: name, IP address and subnet, extra addresses.
- Per port: VLAN, trunk, name, PoE and speed — pick a VLAN in the bar, then click or drag over the ports. **Copy to other switches…** copies a switch (with or without the names you typed). Ports that carry a fibre or a switch link are a trunk by themselves.
- The network cables (C): VLAN, location and the universes a line carries; add and remove cables and lines. Kept apart from the CSV, so a new import does not lose it.

### Addresses
- **IP plan**: *Create the IP plan…* shows what changes and then addresses everything: switch 1 of every DB is .1, switch 2 is .2 …; nodes and splitters count on from .11 (FENT). Choose the VLAN numbering (Luminex or FENT), production or location, and an optional scan address.
- **All addresses**: every node, splitter and switch with its addresses and where it is plugged in. Type a new address in the table; it is checked at once.
- **Checks**: duplicate addresses (also between DimCities), addresses outside the scheme, devices of one VLAN in different networks, a missing trunk. The VLAN list (names and colours) is at the bottom.

### Fibres
- Choose a cable type (opticalCON, FiberFox, 4-core, single-mode, SFP patch) and the two switch ports to couple. **Fibres are coupled here only**; the Signal Flow only shows them.
- The matrix shows which SFP ports are used. Fibre labels can be printed as stickers.

### Overview
Per DimCity: nodes, switches, devices on a port, Cat lines, fibres and a status.

**PDF**: Export PDF's section “Switches: ports and VLAN” has an overview, a **plug list** (device, type, switch, port, panel port, VLAN, address) and per switch a drawing of the ports with a table.

<a id="setup"></a>
## Setup wizard

The **Setup** button in the toolbar (also offered after an import, and under the File menu) walks through a new project in the right order. Nothing is locked: take the steps in order or jump to any step.

**First the plan on paper (steps 1–7), then the real devices (steps 8–9), then the printouts (step 10).**

1. **Import the patch** — LK, Veam and C rows.
2. **Racks and devices** — read the **advice** (best setup for the LKs, Veams and universes) and apply it, or place racks and loose devices yourself.
3. **Couple LKs and Veams** — every LK and Veam gets a socket; automatic, or choose a socket / loose spider / do not patch yourself.
4. **Nodes** — the rack patch becomes the nodes of the network plan; DMX lines named like "Node 401.1" are put on that node port (see [Node names](#node-names)).
5. **Network per DB** — VLAN numbering, FENT on or off, and a network switch for every DB (the nodes take its ports).
6. **Couple the fibres** between the DBs: auto-assign from your stock, or draw them (see [Fibres](#fibres)).
7. **Check the plan** — the Signal Flow and the open issues. The plan on paper is now complete.
8. **Find and align the devices** — the [Align tool](#align) finds every switch and node, makes them blink one by one and you say which is which.
9. **Send the configuration** — names, IP addresses, VLANs and universes go to the devices, after you have seen every change.
10. **Print and share** — the PDF report, stickers, QR codes and the exchange with Lightwright / Vectorworks.

Every step explains itself in three lines: what it is, what you do, what comes next.

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
## Network config

The page **Network Config** (left menu, or the Tasks page) holds all your LumiNodes and GigaCore switches on one page. You discover them, set the VLANs of the switch ports and the universes of the DMX ports by clicking, and send it.

### Discover
Press **Discover devices**. PatchLab looks at the whole network of this computer (up to a /16, about 15 seconds), or at the range you type in **Connection** (for example "192.168.40.0/24" or "10.90.101.20-60"). It recognises a LumiNode / LumiCore by its web API (the software version) and a GigaCore (generation 2) by its device information, and leaves everything else alone. Fill in the user name and password under **Connection** if web authentication is on; a device that asks for a login is listed as "login needed". All devices are found at once, linked to a switch or node of the plan (automatically on IP address, then on name; change it with the list on the card) and read.

### A switch
Click a switch to open it. You see its ports as tiles, as on the front panel, each with its number, name and VLAN, in the colour of the VLAN.
- **Paint:** pick a VLAN in the row above the ports (the brush), then click ports or drag over them. They get that VLAN. The chip **Trunk (fibre)** makes a port part of the trunk "Fibre", which carries the VLANs of the plan with the management VLAN untagged.
- **One port:** click a port without a brush to change its name (16 characters), VLAN, PoE (only ports with PoE) and speed (Auto, 1 Gbps, 100 / 10 Mbps).
- A VLAN of the plan that the switch does not have yet is marked with a plus; its group is made when you apply.
- **Fill from the plan** puts the names (from the port plan) and VLANs of the plan on the ports, the fibre ports in the trunk and the device name. The IP address is only changed if you set that in Connection or type it yourself.
Painted ports have an orange border; nothing is sent yet.
- **Trunk:** the brush **Trunk** puts a port in the trunk of the switch. A GigaCore has one built-in trunk (called ISL on a real switch). It lists the built-in VLAN groups only, so PatchLab makes the VLAN groups of the plan that are still missing and adds them to that trunk; the untagged VLAN of the trunk is left as it is, so the switch stays reachable. If the switch will not let its built-in trunk take the new VLANs, PatchLab checks that after applying and puts the ports in a trunk of its own ("Fibre") that does carry them. The ports are assigned with the switch's own "assign ports to a trunk" call. Under the ports you see the trunk in words — its ports, the VLANs it carries and the **untagged VLAN**, which you can change there (Fill from the plan sets the management VLAN). After applying, the switch is read back and checked: if it said "ok" but a port is not in the trunk, PatchLab tries the other documented way (port by port) and tells you what the switch reports. A port that still did not end up in the trunk shows up as a change again, and under **Last calls to this device** you can see (and copy) every call and the answer of the switch. In the panel of a port you also see what the switch itself says about it.
- **Advanced mode:** a switch in "advanced" configuration mode is also set with its command line, and groups and trunks made through the API may not show correctly. PatchLab warns about that and has a button to switch to Luminex mode (the switch reboots).

### Lights (GigaCore)
The port lights of a GigaCore show the colour of the group the port is in, and the front panel can show one colour on all ports. **Rainbow show** runs the front-panel colours red → magenta a few times and then goes back to what it showed. The port lights only show group colours when the front panel is in the "groups" state; the rainbow flow and the colours switch it to that and put it back (or use **Ports show group colours** / **Lights off**). **Rainbow flow** gives every group in use its place in the rainbow and lets the whole rainbow turn for a few seconds, so the colours run along the ports like a wave; then the old colours come back. **Rainbow colours on the groups** gives every group in use its own colour of the rainbow, from left to right along the ports, so the lights show a rainbow over the VLANs; **Colours back** restores them. A group colour has no effect on traffic. A single port cannot get a colour of its own: its light follows its group.

### The e-ink display (GigaCore 20t)
A switch with an e-ink display shows a section **E-ink display** under its ports. Choose **Text** (type the lines; the size is automatic or fixed) or **Picture** (choose a JPG, PNG or other picture file): PatchLab scales it to the size of the display (read from the display itself), makes it black and white (dithered if you like) and sends it as a PNG. **Send as preview** puts it on the device without touching the display and shows what the device made of it; **Show on the display** applies it; **Standard layout** brings the Luminex layout back; **Remove my picture** clears it. You can also hide the IP address or show the quick-start QR code. If the preview looks wrong, adjust the fit, size or dither and send it again.

### A LumiNode
Click a node to open it. You see its DMX ports as tiles: number, name, direction, protocol and universe. Per port you can set everything: the **name**, the **direction** (output: network → DMX, input: DMX → network, or off), the **protocol** (sACN or Art-Net) and the **universe**. The universe is the number the node itself shows; Art-Net is not shifted by one unless you choose that under Connection.
- **Brush:** set direction, protocol and universe in the brush bar (leave a field on "keep" to leave it alone) and click ports. With "next port gets the next universe" the next click gives the next number.
- **One port:** click a port without a brush and use the panel below the tiles.
- The node keeps its own rules: the name and direction are written on the DMX port, the universe and protocol on the network input (or, for a DMX input, output) that is connected to it through its process block. Changing the direction or the protocol makes a new input / output, connects it and removes the old one; the preview shows every step. A port whose set-up is not recognised, or whose input is shared with another port, is left alone and explained.

### Advanced network of a LumiNode
A LumiNode normally has one address (basic configuration). In the **advanced network** it has **groups**: every VLAN is a group with its own address(es) and a lighting setting (does lighting come in and go out on this group), and every network port sits in one group or in a **trunk** of several. You plan it on the Network page: tick **Advanced network** on the node (Nodes tab); every VLAN of the node's addresses becomes a group, the lighting addresses listen for lighting, and a port that carries two VLANs becomes a trunk.
- On the card of the node, **Network of this node** shows the groups and ports the node has now and, below it, what the plan wants. **Fill from the plan** puts it in the pending changes: *check the new network configuration*, *send it* and *activate it* — three calls, shown in the list before you apply. The node can stop answering on its old address afterwards: look for it on its new one.
- PatchLab warns (Nodes tab, Addresses tab and here) when the switch port the node is plugged into is not a trunk although the node carries two VLANs on that cable, or when the VLAN of the port is another one than the node's. It checks the plan; a node that is linked is checked against the port it sits on.
- Older firmware without the advanced network is recognised: only the basic address is set then.

### All settings and sending to other devices
Every card has a section **All settings**. It lists everything the Luminex API lets you change, in sections (pick one, or search for a word like "jumbo" or "IGMP"). Ports, VLAN groups, outputs and so on are a table with one row each; the **all** button under a column title puts that value on every row. Changed values are marked and stay pending until you press Apply (they are in the list of calls too). Settings that can lock you out (IP, security, switching ports off) carry a warning sign.

**Send to other devices…** copies your pending changes, or whole sections of this device, to as many devices of the same kind as you tick. Only the differences are prepared; names, descriptions and addresses go along only if you tick that, risky settings too. Check the result per device or under **Apply all**.

### Apply
**Apply…** on a card, or **Apply all** at the top, sends at once, with no extra question. The calls are made one by one per device; it stops at the first error. Then the device is read again and checked against what you asked, and a window lists every change that was made (what was sent, per device). Undo your pending changes first if you do not want them sent. Changing the IP address always comes last. Optionally a switch configuration is saved in a profile slot (Connection). It works on GigaCore generation 2 and LumiNode / LumiCore; generation 1 switches are not covered.

Outside the desktop app simulated devices answer so you can try it out.

<a id="racks"></a>
## Racks & DBs

The page **Racks & DBs** (left menu, under Patch List) is the place where the DBs of the show and their racks are made.

- **New DB** (and **FOH**) add a DB, also called a DimCity. A DB also appears by itself when you import a patch: it follows from the LK and Veam numbers.
- **Rack Builder** opens the builder where you make **rack types**: choose the devices (dimmer rack, node rack, splitters …) and their height. A rack type is made once and placed in as many DBs as you like.
- Pick a DB with its chip. For that DB you see **Place rack** (choose a type), **Custom rack…** (a rack of your own, without an article key), the advice for the best setup, **Loose devices** (a loose node, LK spider or Veam4 spider) and **Use as network plan**, which turns the racks into the nodes and splitters of the network plan.
- PatchLab then patches every LK and Veam onto a socket of the racks and a port of a node. The same card is on the page of a DimCity; this page is only the front door.

<a id="power"></a>
## Power (PDs and Socapex)

The page **Power** is a part of its own: it keeps its data in the project (model.power) and is linked to the rest only by DimCity name. You can try it and check it without touching the patch, the racks or the network plan.

### What it does
- The **fixture sheet** (CSV from Vectorworks / Lightwright) is the source. Its **Circuit Name** is a Socapex cable (M101 …), **Circuit Number** the circuit 1–6, **Wattage** gives the current (watt ÷ 230 V). The first digit of M101 names the DB (M1xx = DB1). Circuits 1…6 sit on L1 L2 L3 L1 L2 L3.
- **PD builder** (tab “PD builder”, also the button **PD builder** on the Racks & DBs page): this is where you build your own PDs, like node types. Choose the input (Powerlock / CEE, amps), add the outputs in the order they sit on the PD (Socapex with 6 circuits, Han 16 or Harting with 8, CEE 16–125 A single or three phase, Schuko), choose the number of circuits and the phase it starts on for a multi outlet, an amp limit per phase for the whole outlet, choose the phase of each single-phase outlet, and make **groups** (breakers): outlets with the same group share its limit. A drawing of the front shows what you built. Two examples can be added with one click.
- **PDs & feeds** per DimCity: add a feed (a Powerlock / CEE run with its maximum current; one feed can loop on from another, then it counts in that one too), add PDs, choose their type and feed. **Fill cables automatically** gives each PD a block of 12 cable numbers (M101–M112, M113–M124 …), packed in order as Soca A, B, C …, or choose a cable per Socapex yourself.
- **Overview**: per DimCity the PDs and feeds with L1 / L2 / L3 in amps, and warnings: a circuit above 16 A, a feed too heavy or uneven, a cable not on a PD, a PD without a feed, fixtures straight on a DB, fixtures without wattage.
- **A PD** opens like a page of the booklet: per Socapex the six circuits with the DMX universe, cable-circuit (M101-1), fixture numbers (401 - 406), what hangs there ("6* CLF Lighting Aorun"), the location and the amps on the phase, with totals. The other outlets (CEE, Schuko) get their load typed in by you.
- **Booklet (PDF)**: a cover, per DB the overview, a page per PD (with the header repeated on every sheet) and the power summary, in portrait. Make it for one DB or for all. It works on its own: the fixture sheet alone is enough, the DBs are taken from the cable names (M4xx → DB4) when the project has no DimCities yet.

### Good to know
- The DMX column reads “10-Var” for one universe with several addresses, “Var” for several universes, and “1-501” for a single fixture.
- Fixtures that hang straight on a DB (Circuit Name “DB2”) are listed in the warnings and not counted on a PD.
- Nothing here is sent to any device; it is paperwork and checks.

<a id="align"></a>
## Align tool

The **Align tool** is for setting up many devices quickly. Open it from the Tasks page, from Network Config (**Align tool**) or from Setup step 8. Network Config stays as it is, for working on one device or port.

1. **Find** — searches the network (or the range you type) for every LumiNode and GigaCore, and shows each one the moment it is found. The part around this computer is searched first, for every address this computer has (so two addresses in two ranges work), then the wider network.
2. **Align** — switches and nodes work the same way. The first device **blinks**: a GigaCore blinks its screen and port lights (the identify call of the switch), a LumiNode its LEDs. You stand at the device, see which one it is and press its place in the plan, for example **DB3-SW1**. The link is made and the next device blinks. The suggestion in orange is the first free place, or the one with the same IP address. **Skip** leaves a device alone, **Undo** takes the last link back.
3. **Send** — **Fill in from the plan** puts names, VLANs, port names and universes on the devices (optionally also the IP address of the plan; the device then moves to its new address, so do that on a new network). **Send config** sends at once, with no extra question: first everything except the IP addresses, to all devices; then the addresses, to all devices at the same moment, each checked at its new address. Afterwards a window shows every change that was made. If a device moves to a range this computer has no address in, PatchLab warns before sending (button **Add addresses to this computer**, the system asks permission) and, if it happens anyway, marks the device as moved instead of failed, with the same button.

Not done yet: finding devices by IPv6 / MAC address when a new device is on another IP range than your computer. That needs a test on real devices first.

<a id="fibres"></a>
## Fibres

Fibres connect the fibre ports of the switches, inside a location and between locations (DBs, FOH).

### Cable types and stock
- Make the cable types in the Device Builder (tab Cables): opticalCON, FiberFox, 4-core, singlemode, SFP patch. The length may have half metres, for example **7,5**.
- On the Network page, tab **Fibres**, fill in how many of each cable you own (6× OC7,5, 6× OC250, 2× FF250 …). The table shows how many are used and how many are left. The short code on drawings and labels is the connector plus the length: OC250, FF250, OC7,5.

### Auto-assign
**Auto-assign fibres** chains the switches of one location with the short cable and links the locations with the long cable, as a ring or a chain. Free ports with the right connector go first (opticalCON cable on an opticalCON port). It stops when the stock is empty and tells you what is missing.

### Fibre overview
In the **Signal Flow**, choose **Fibres** under Show. Every location is a card on a circle with its switches and fibre ports (17, 18 … with their connector). Drag a switch (by its name) to another place in the card, for example next to another switch, or drag the card itself. Pick a cable at the bottom, click a free port and then the port at the other end to draw a fibre. Cables run in straight lines around the switches and the names of the cards — never through them — and hop over each other with a bridge. A cable only fits ports with its own connector (opticalCON, FiberFox or SFP); other ports are dimmed. Click a cable to select or delete it.

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
- **Half-width devices**: set *Width in the rack* of a node to Half (the LumiNode 4 is). In the Rack Builder two half-width devices share one U, left and right (drag to the left or right half, or use the ⇄ button). *Blind plate ½* and *Fill gaps next to half-width devices* fill the rest with black plates. Racks in the Signal Flow, on the DimCity page and in the PDF show them the same way, and so does the preview in the Device Builder — for every kind of device (nodes, splitters, switches and panels).

<a id="flow"></a>
## Signal flow

The **Signal Flow** page (sidebar, or Cmd/Ctrl+4) draws the cabling of a DimCity the way it is on the floor: the rack with its nodes, splitters and LK panel → one thick LK multicore per LK block → a Veam cable per linked Veam → thin DMX lines to the **objects** (the locations from your patch list, with the universe that arrives there). XLR lines on the LK itself get a small block each, exactly in line with their port; the four ports of a Veam share one objects block.

### Reading it
- **Racks** are drawn like in the Rack Builder: rails with U numbers, the faces of nodes, splitters, switches and panels, and their sockets. A node port shows the universe on it in the colour of the LK or Veam that is patched on it; an LK37 or Veam4 socket shows the number of the LK or Veam that comes out of it, in its own colour — every LK and every Veam has a colour of its own, never two the same. A rack whose nodes only feed the panel of another rack stands to the left of it. Loose devices (a node with the spiders on it) are drawn as a stack without a frame.
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
- **Grid** shows a grid behind the drawing and **Snap** makes the blocks you move snap to it (the size of the grid is in the left bar: 10, 20 or 40; hold **Alt** while moving to ignore the snap once). Both can be switched off. The grid is never printed.
- **Holding a block**: when you press a block it lifts at once (shadow and outline) and goes on top; while you move it the others dim and the cables follow. If the place under it is taken, a dashed outline shows where it will land when you let go — the block turns red meanwhile.
- **Save image** writes the drawing as an SVG file you can open or print anywhere.
- **Click the name of an LK block** to give it your own name (for example "Front truss"). This changes only the drawing; the LK number, its ports and the CSV stay as they are.

The arrangement, the zoom and the LK names are saved with the project, per DimCity, and **Export PDF** prints the drawing of every DimCity exactly as arranged here (section "Signal flow drawing"). The drawing is built from the rack patch, so place a rack or a loose node first (see [Racks per DimCity](#racks)).

### Network layer
The **Show** switch in the left bar chooses *All*, *DMX* or *Network*. The network layer shows the **switches** (with the VLAN of every used port and the fibre on every SFP), the **network cables (C)** that come into the DB and the **nodes** linked to the switch ports, in the order of the node numbers. Network cables are drawn in the colour of their VLAN; fibres are thick lines in the colour of their cable type and also connect the DBs to each other; they run with right angles **around** the blocks and the DimCity titles, never through them (while you move a block they are simple curves, and they find their way around again when you let go). With *Network* you see only this layer. The PDF prints the full drawing and, as an option, a second drawing of only the network.

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
- **Panel connection labels**, one per LK37 / Veam4 socket, to stick above the socket.
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

**Settings** (Cmd/Ctrl+,) has two kinds of settings. **This show** is saved in the show file; everything else applies to the app on this computer.

- **This show**: how the first column of the CSV is read. The **prefix** of an LK (default LK), of a Veam (V), of the network cables (C, with its number of lines) and of nodes (Node); a show that calls its LKs “K101” is read as LK101 and exported as K101 again. **Network cable types** can be added, each with a prefix and a number of lines (a Cat loom has 4). **A Veam may go on a free Veam4 socket of an LK panel** (off by default): off means the Veam4 sockets of an LK panel belong to that LK. *Apply* reads the CSV again with the new rules.
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

### Version 0.13.0 — 2026-10-10
- Network page, rebuilt: the first tab is a **patch board**. Every switch is drawn like its front; drag a node or a cable onto a port (or click the device, then the port). Every device shows what it is (icon, id and type: LumiNode 12, Cat loom …). A device dropped on a used port takes its place, the other one goes back to the tray and the port it came from stays empty. Nothing is placed by itself any more: **Auto-fill ports…** fills the free ports once. A show from an older version keeps its ports as they were. The list of connections with the drop-downs stays below the board.
- Two switches in one DB can be **linked through RJ45 ports as a trunk** (Link to switch…, or Link automatically); linked ports carry every VLAN and take no device.
- New tabs: **Nodes** (per node the universes with the name of the LK or Veam on them, the location, and a list to choose the switch port it is plugged into; the old page “Nodes & Splitters” is part of it now), **Switches** (every switch, also those in racks: address, VLAN / trunk / name / PoE / speed per port, copy to other switches, network cables) and **Addresses**.
- Addresses: every address of every node, splitter and switch in one table, editable, with the **IP plan**: switch 1 of every DB is .1, switch 2 is .2 … and nodes and splitters count on from .11. You see old → new before anything changes. Checks for **duplicate addresses** (also between DimCities and between the extra addresses of one device), addresses outside the scheme, devices of one VLAN in different networks, and a port that is not a trunk although the device on it carries two VLANs.
- LumiNode **advanced network**: tick it on a node and every VLAN becomes a group on the node with its own address and a lighting setting, ports go to a group or a trunk. Network config reads the node’s network configuration, shows what the plan wants and sends it (check, send, activate). The simulator answers the new calls.
- Racks: the Veam4 sockets of an LK37 socket belong to that LK (2× LK37 + 6× Veam4: Veam 1–3 on LK1, 4–6 on LK2; set in the Panel Builder). A separate Veam is no longer patched on them, unless you switch on *A Veam may go on a free Veam4 socket of an LK panel* in Settings → This show (off by default). The network (etherCON) ports of a rack panel now connect to the nodes in the rack.
- **Every LK and every Veam has a colour of its own** — never two the same, also not an LK and a Veam — on the rack, in the Signal Flow, in the PDF and on the labels. Nodes are told apart by their label.
- Settings → **This show**: the prefixes of LK, Veam, network cables and nodes, extra network cable types (own prefix and number of lines), and the rule above. CSV rows like **Node601,1** (node 01 of DB06, port 1) are read and put on that node. LK7-1 is called **LK37** everywhere. A DB can be **deleted**.
- Signal Flow: a block you press lifts at once (shadow, outline) and the cables follow while you move it; a dashed outline shows where it will land. A **grid** with **Snap**, both switchable (size 10 / 20 / 40, hold Alt to move freely). **Fibres run around** the blocks and the texts with right angles, in the Signal Flow and in the fibre overview.
- Device Builder: the preview shows half-width devices as half width (all kinds of devices). The dialogs to copy a switch or a node to others have their left column neatly aligned. The PDF section Switches has a plug list.

### Version 0.12.0 — 2026-10-07
- One port plan: the ports you set on the Network page (VLAN, trunk, name, PoE, speed) now show everywhere, in the strips under “Network switches”, the connections table, the labels, the PDF and Network config. Before, the strips and the table only showed the automatic plan.
- Patching: choose what goes on the switch ports first (all nodes then the cables, or the other way round) and the order (by id or as planned). Drag a device from one port to another (they swap), drop it in the tray to take it off its port, or use the switch and port in the new table “Connections”. “Unlink all ports” takes everything off so you place it yourself, “Auto-assign again” fills the ports in order. What you place by hand stays.
- Network cables (C): VLAN, location and the universes a line carries (like “1-4, 7”) can be changed per line, and cables and lines can be added or removed. This is kept apart from the CSV, so a new import does not lose it; the CSV export has the VLAN and location you chose.
- New PDF section “Switches: ports and VLAN”: an overview of all switches and fibres, and per switch a drawing of the ports in the VLAN colours with a table of port, device or cable, name, VLAN, mode, PoE, speed, universes and address. Hand-typed port names can be left out.

### Version 0.11.3 — 2026-10-07
- Network page, port planning: the SFP / fibre ports are tiles too, with their real numbers. A port with a fibre cable is a trunk by itself; pick another VLAN, Trunk or Automatic to change it.
- Per switch port you can now also set PoE (on / off) and speed, in the bar above the ports (then drag over ports) or in the detail of a port.
- Copy the port settings of one switch to other switches (VLAN / trunk, PoE and speed, SFP ports, only the ports changed by hand). Port names are only copied when you choose so, because they differ with network cables and nodes. Nodes can be copied too: protocol and direction, names and universes on request. Nothing is sent; it fills the plan.
- Node ports: direction now has the same choices as on Network config (Output, Input, Off).
- Network config and the Align tool: “Fill in from the plan” also sets PoE, speed and the SFP ports, and a new tick “also set the port names” (on by default) lets you keep the names that are on the devices.

### Version 0.11.2 — 2026-10-07
- The films "Network" (part 5 of the build series) and "Power" are recorded again: they now show planning switch ports in advance with the VLAN bar, naming a port by hand, and the Han 16 outputs of the PD builder.

### Version 0.11.1 — 2026-10-07
- Network page: plan the ports before any device is on the network. Pick a VLAN in the bar at the top (numbers and names), click or drag over the ports of a switch, and they get that VLAN; Trunk and Automatic are in the bar too. Click a port to give it a name by hand; without a name the automatic one (node or cable name) is used, and “Automatic names” brings those back. Nodes get the same: universe (next port can get the next universe), name, sACN / Art-Net and direction per DMX port.
- What you plan there is what “Fill in from the plan” puts on the real switches and nodes on the Network config page and in the Align tool, including hand-made VLANs, trunks, names and protocols. The plan is saved with the project.
- PD builder: Han 16 and Harting outputs (8 circuits, or any number), the phase an output starts on (so a PD with several Han outputs stays balanced), and an amp limit per phase for a whole output. The circuit limit follows the amps of the output. A Han 16 example can be added with one click. The PD pages and the booklet show as many rows as the output has circuits.
- PD builder, from earlier work now released: a phase per outlet, breaker groups that share a limit, the order of the outlets, a drawing of the front, group totals in the booklet, and the button on the Racks & DBs page.

### Version 0.11.0 — 2026-10-06
- New page Racks & DBs in the menu: the place where DBs are made and where the racks go in them. Add a DB or FOH, open the Rack Builder to make rack types, pick a DB and place racks, a custom rack or loose devices; the same planning as on a DimCity page, but always one click away.
- New film "DimCity PatchLab — a first look": two minutes, no step by step, a quick tour of the whole app (patch, racks, network, signal flow, power, going live with the Align tool, paperwork) in 2560x1440 with a soft music bed. Find it in Help, under Videos.
- Sending to the devices: first everything except the IP addresses goes to all devices, then the addresses go to all devices at the same moment, and each device is checked at its new address. A device this computer can no longer reach is marked as moved instead of failed; the button "Add address to this computer" gives the computer an address in that range (the system asks permission). The Align tool warns about it before sending.
- Finding devices: the part of the network around this computer is searched first, for every address the computer has, so a computer with two addresses in two ranges finds the devices in both. The search list was cut off after 65,536 addresses; that limit is gone.
- The Align tool puts devices that the plan has no place for at the end of the queue, and the video shows a node being aligned too.

### Version 0.10.0 — 2026-10-05
- New section Power (PDs and Socapex), a part of its own that you can try and check without touching the patch. Load a fixture sheet (CSV with Circuit Name = Socapex cable, Circuit Number = circuit, Wattage) on its own, build PD types like node types (Powerlock / CEE input; Socapex, CEE and Schuko outputs), add feeds (Powerlock runs that can loop on from each other) and PDs per DB, and let PatchLab put the cables on the PDs (blocks of 12 numbers).
- It works out the amps on L1 / L2 / L3 per circuit, Socapex, PD and feed (circuits 1-6 on L1 L2 L3 L1 L2 L3, watt / 230 V), and warns about a circuit above 16 A, a feed that is too heavy or uneven, cables not on a PD, PDs without a feed and fixtures without wattage. A PD opens like a page of the booklet.
- Booklet (PDF) for one DB or all DBs, portrait, with a cover, an overview per DB, a page per PD and a power summary.
- PDF export is now portrait by default (new projects; a project that already chose landscape keeps it).
- New video "Power: PDs and Socapex"; the PDF and sticker video was made again.

### Version 0.9.2 — 2026-10-05
- Devices appear one by one while PatchLab searches the network, instead of all at once at the end; each one is read as soon as it is found. The part of the network around this computer is searched first, so the devices in front of you show up within a second. The Align tool shows them one by one too.
- Apply, Apply all and Send config no longer ask for a confirmation. They send at once, read every device back and then show a window with every change that was made, per device (and the error, if one failed).
- Videos: "Align the devices and send the configuration" and "Network config" show the new way of sending.

### Version 0.9.1 — 2026-10-04
- Videos brought up to date with the new workflow: the series Build a show now has ten parts (new: "9 · Align the devices and send the configuration" and "10 · The PDF and the stickers"), the Network config video shows the current page (V L A N brush, All settings, send to other devices), and the Tasks and Setup video talks about the ten steps.

### Version 0.9.0 — 2026-10-04
- New: the Align tool. It finds every GigaCore and LumiNode, makes them blink one by one (the identify call of the devices), you press which place in the plan it is ("DB3-SW1") and the next one blinks. Then "Fill in from the plan" and "Send config" put names, IP addresses, VLANs and universes on all devices at once, with every change listed first. Network Config stays as it is.
- The Setup steps are clearer and in a better order: first the plan on paper (import, racks, sockets, nodes, switches, fibres, check), then the real devices (find and align, send the configuration), then print and share. Every step now says in three lines what it is, what you do and what comes next.
- Sending the configuration to the devices is one of the last steps, as it should be; the PDF, stickers and exchange moved to their own last step.

### Version 0.8.0 — 2026-10-04
- New: "All settings" on every GigaCore and LumiNode card in Network Config. It lists every setting the newest Luminex API files (GigaCore WebApi 1.5, LumiNode WebApi 2.9) allow to change, grouped in sections (Ports, PoE, VLAN groups, IGMP, SNMP, PTP, DHCP server, display, DMX, protocols, LEDs …) with a search box, the right control per setting (switch, list, number with limits) and a table per port / group / output.
- Per column an "all" button sets the same value on every row. Changes stay pending (marked) until you press Apply; risky or device-specific settings are marked.
- Send to other devices: copy your pending changes, or whole sections of one device, to any number of devices of the same kind at once (only where they differ; names, addresses and risky settings only when you tick them). It prepares the changes; Apply all sends them and every device is read back.
- Not in this editor: LumiNode network address, process-block wiring beyond the existing port editor, software upload, profiles and reboot / reset actions. Tested against simulated devices; check on a real device first.

### Version 0.7.4 — 2026-10-04
- Trunk fixed after looking at a real GigaCore 20t: its built-in trunk (ISL) only carries the built-in VLAN groups, so a VLAN group made from the plan (like 1090) was missing on the fibre. PatchLab now adds the groups of the plan to that trunk, leaves its untagged VLAN alone, checks afterwards that the trunk really carries every VLAN, and otherwise uses a trunk of its own.
- The lights: the port lights follow the group colours only in the "groups" front-panel state, so the rainbow switches to it and back, and there are buttons Ports show group colours and Lights off.
- The link of a port is shown green unless it is down.

### Version 0.7.3 — 2026-10-04
- Trunk checked after every change: when the switch answers ok to "assign ports to a trunk" but a port is not in the trunk, PatchLab tries the other documented way (port by port), logs what the switch reports for each port and tells you if it still did not work.
- Rainbow flow for the switch lights: the rainbow runs along the groups like a wave for a few seconds (stop any time), then the old colours come back. Ports follow the colour of their group, so a single port cannot get its own colour without moving to another group.

### Version 0.7.2 — 2026-10-04
- Trunk reworked: fibre ports now go into the switch's own built-in trunk (which carries every VLAN) instead of a trunk of ours, so it behaves like a trunk made on the switch itself. The trunk is shown in words under the ports (ports, VLANs, untagged VLAN, changeable), the page recognises whether a switch lists group numbers or VLAN ids, warns about advanced mode (with a button to go to Luminex mode), and shows what the switch itself says per port.
- Every call to a switch is logged: under Last calls to this device you see (and can copy) each call and the answer, so a refusal by the switch can be seen at once.
- Rainbow for the switch lights: a Rainbow show runs the front-panel colours red → magenta and goes back, and Rainbow colours on the groups gives every group in use its own colour from left to right (with Colours back). The port lights follow the colour of their group; a single port cannot get a colour of its own.

### Version 0.7.1 — 2026-10-04
- Trunk fixed: fibre ports are now put in the trunk with the switch's own "assign ports to a trunk" call (instead of a plain group membership), the trunk carries all VLANs of the plan with the management VLAN untagged, and the switch is read back to check.
- Nothing is cut off any more: port tiles are bigger, names wrap over two lines, and show direction, protocol and VLAN / universe clearly.
- LumiNode, everything per port: name, direction (output / input / off), protocol (sACN or Art-Net) and universe, by brush or per port. Art-Net universe 10 is now sent as 10 and the node shows 10 (the shift by one is only used if you choose it). Changing the direction or protocol builds the new input / output and connects it through the process block, with every step in the preview.
- E-ink display of the GigaCore 20t: show your own text or a picture (JPG, PNG …, scaled to the display, black and white, dithered), send it first as a preview, then show it; back to the standard layout, hide the IP address, show the QR code.

### Version 0.7.0 — 2026-10-04
- New page Network Config: all your LumiNodes and GigaCore switches on one page. Discover finds them at once over the web API (the whole network of this computer, or a range you type), links each to a switch or node of the plan and reads it.
- Switches fold open into their ports. Pick a VLAN and click or drag over ports to give them that VLAN, like in Araneo; click a port for its name, PoE and speed; fibre ports go into the Fibre trunk. A VLAN of the plan the switch does not have yet is made for you.
- LumiNodes fold open into their DMX ports: pick a universe and click ports (the next click can give the next universe), and name the ports. New inputs are sACN. Everything is sent after a preview of every call, per device or all at once, and read back to check.
- The devices are called LumiNode and GigaCore, no longer Art-Net node; recognition and writing follow how the nodes really answer (software version call, IO 100000 = port 1, the whole IO sent back with rdm_universe, the output connected to its process block). The old dialog Devices on the network is replaced by this page.

### Version 0.6.2 — 2026-10-04
- Discover: one overview of all Luminex switches and nodes on the network (scan of the networks of this computer or a range you type, plus Art-Net nodes), each linked to a switch or node of the plan automatically on IP address and then on name, with a button to open it.
- GigaCore switches, port by port: the button Ports… on a switch opens a table where you set for every port its name, its VLAN / group (a VLAN of the plan the switch does not have yet is made for you), PoE on or off and the speed. Changed rows are shaded, only the changed ports are sent, and the switch is read back to check.

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
- Racks per DimCity with automatic LK37 / Veam4 patching, node colours, recommendations and "Use as network plan".
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
- [Netwerkconfig](#netdev-nl)
- [Racks & DB’s](#racks-nl)
- [Stroom (PD’s en Socapex)](#power-nl)
- [Uitlijntool](#align-nl)
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

### Andere prefixen, netwerkkabels en nodes
- **Instellingen → Deze show** bepaalt per show hoe de eerste kolom heet: het prefix van een LK (standaard LK), van een Veam (V), van de netwerkkabels (C, met zijn aantal lijnen) en van nodes (Node). Een show die zijn LK’s “K101” noemt wordt als LK101 gelezen en bij de CSV-export weer als K101 geschreven. Je kunt meer kabeltypes toevoegen, elk met een eigen prefix en aantal lijnen.
- **C101** (en C101.1 …) is een netwerkkabel; de derde kolom is de VLAN-groep.
- **Node601,1** (of Node 601.1) zet een universe op een node: 6 = DB06, 01 = node 01 van die DB, 1 = poort 1. De DimCity volgt uit het nummer; de positietekst blijft als locatie van die poort bewaard.

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

**Kleur** wijzigt de DimCity-kleur in de zijbalk en op de PDF. **Exporteren** opent de Rapportbouwer met alleen deze DimCity geselecteerd. **Verwijderen** (prullenbak, rechtsboven) haalt de hele DB weg: zijn LK’s, Veams, regels in de CSV, racks, netwerkplan en fibers. Hij vraagt eerst om bevestiging en blijft weg als de CSV opnieuw gelezen wordt.

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
Een patchpaneel met **LK37**-, **Veam4**-, **XLR**- en **etherCON**-aansluitingen. Onder **Veam4-aansluitingen die bij elke LK37-aansluiting horen** zeg je hoe de Veam4-aansluitingen verdeeld zijn: 3 (standaard) geeft elke LK37-aansluiting drie eigen Veam4-aansluitingen — met 2× LK37 en 6× Veam4 is dat Veam1–3 op LK1 en Veam4–6 op LK2 — en 0 maakt alle Veam4-aansluitingen los. De tekening van het paneel toont de groepen. In een rek staat een Veam4-aansluiting die bij een LK37-aansluiting hoort ernaast, met de Veam die aan die LK gekoppeld is; een losse Veam wordt er niet op gepatcht, tenzij je dat toestaat in Instellingen → Deze show. De **etherCON**-aansluitingen zijn de netwerkpoorten van het paneel: een node in het rek zit in een daarvan.

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
- De samenvatting eronder telt DMX-poorten, splitteruitgangen, RJ45 en de LK37- / Veam4- / XLR-aansluitingen van het rek.

Een rek is een sjabloon: je plaatst het in een DimCity op de [Racks-kaart](#racks-nl), zo vaak als je wilt. De artikelsleutel staat in de Racks-kaart en op de PDF.

<a id="racks-nl"></a>
## Racks per DimCity

De kaart **Racks** op een DimCity-pagina patcht de LK's en Veams van die DimCity automatisch op de racks en losse apparaten die je daar plaatst. Het resultaat wordt elke keer opnieuw uit de huidige show berekend, dus het loopt nooit achter.

### Plaatsen
- **Rek plaatsen** voegt een rek uit de Rack Builder toe; geef het een naam voor deze DimCity (bijv. "Rack SL"). Verwijderen doe je met het prullenbakje.
- **Losse apparaten**: een **losse node** zonder rek, een **losse LK-spin** (één LK37-aansluiting op een breakout) of een **losse Veam4-spin** (één Veam4-aansluiting). Een spin kun je met **Op node** aan een losse node hangen; zijn lijnen worden dan eerst op die node gepatcht.

### Hoe de patch tot stand komt
1. Elke LK met gegevens krijgt een **LK37-aansluiting**: eerst een losse LK-spin die aan een node hangt, dan de rekpanelen, dan andere losse spinnen.
2. Veams die niet door een LK gevoed worden krijgen een **Veam4-aansluiting**: eerst een Veam4-spin die aan een node hangt, dan losse Veam4’s, dan andere spinnen. De Veam4-aansluitingen die bij een LK37-aansluiting horen zijn voor die LK: een andere Veam komt er alleen op als je *Een losse Veam mag op een vrije Veam4-aansluiting van een LK-paneel* aanzet in Instellingen → Deze show (standaard uit).
3. Elke gebruikte lijn krijgt een **nodepoort**. Lijnen van één LK of Veam blijven waar mogelijk op één node. **Elke LK en elke Veam heeft in de hele show een eigen kleur** — nooit twee dezelfde, op het rek, in de Signaalstroom, in de PDF en op de labels — en een nodepoort heeft de kleur van de LK of Veam die erop zit. Een node herken je aan zijn label (N1, N2 …), niet aan een kleur.
4. Als er nodepoorten tekortkomen, gaan universes die vaker gebruikt worden via een **splitter** in het rek.

### Rekken zijn zones
LK- en Veam-kabels zijn kort, dus een LK of Veam op een rekaansluiting voedt alleen nodes **in hetzelfde rek**. Alleen netwerkkabels (Cat, fiber) lopen van rek naar rek. Staan twee rekken direct op elkaar, vink dan bij het bovenste **gestapeld op het rek erboven** aan; ze tellen dan als één. Heeft een rek lijnen maar geen eigen vrije nodepoort, dan meldt PatchLab dat en biedt een **Oplossen**-knop die de rekken stapelt.

### Losse nodes, spinnen en eigen rekken
- Een node zonder rek heeft geen paneel waar hij van gevoed wordt, daarom komt er **een LK-spin** bij. Er verschijnt een waarschuwing als een losse node geen LK- of Veam-spin heeft.
- **Eigen rek…** bouwt hier ter plekke een eigen rek: kies hoeveel panelen, nodes, splitters en switches, en PatchLab plaatst ze. Een artikelsleutel is niet nodig.

### Netwerkpoorten op een paneel
Een rek met een paneel met etherCON-poorten (zeg 3) en drie nodes erachter: elke node zit in een van de poorten en de kabel naar de switch gaat in die poort aan de voorkant. Standaard nemen de nodes van een rek de poorten op volgorde; met de tabel **Netwerkpoorten op de panelen** kies je per poort een node. De rektekening toont de node op de poort (N1, N2 …) en de poort op de node (P1.2); de pagina Netwerk toont de paneelpoort naast de switchpoort, en de PDF-aansluitlijst ook.

### Het resultaat lezen
- De tellers tonen gebruikt / beschikbaar voor LK37-aansluitingen, Veam4-aansluitingen, nodepoorten en lijnen.
- **Adviezen** vertellen wat er ontbreekt: losse spinnen om toe te voegen, extra nodes, overbodige splitters.
- De rektekening toont de universe op elke nodepoort en het LK- / Veam-nummer op elke aansluiting; beweeg eroverheen voor details.
- **Nodepoorten** laat per node zien welke LK- of Veam-poort (en locatie) op welke nodepoort zit.
- De **patchtabel** onderaan heeft elke lijn: nodepoort, universe, via splitter, aansluiting, LK- / Veam-poort, locatie.

### Gebruiken
- **Gebruik als netwerkplan** kopieert de nodes en splitters, met hun universes, naar het netwerkplan van deze DimCity (IP-adressen worden gegenereerd).
- **Racks printen** opent de Rapportbouwer met de voorinstelling "Alleen racks".

<a id="network-nl"></a>
## Nodes, splitters & netwerk

Het netwerkplan somt de DMX-nodes en splitters van elke DimCity op met hun IP-adressen en universes. Je vindt het op het tabblad **Nodes** van de pagina **Netwerk** (alle DimCities) en in de kaarten **Netwerknodes** en **Splitters** van een DimCity. De oude pagina “Nodes & splitters” is dat tabblad nu. Switches, poorten, VLAN’s en fibers staan op de andere tabbladen van de pagina **Netwerk**; de **Setup**-wizard (werkbalk) loopt alles op volgorde met je door.

### Nodes
- De snelste weg naar een plan: **Nodes uit de racks** (of **Gebruik als netwerkplan** op de [Racks-kaart](#racks-nl)) neemt de nodes en splitters uit de racks van de DimCity, met de universes van de rackpatch. Of kies **Zelf plannen…**, kies een nodetype en klik op **Nodes automatisch toewijzen**: PatchLab vult de universes van de DimCity van laag naar hoog over zoveel nodes als nodig, en houdt de **reservepoorten** uit Instellingen vrij.
- Elke DMX-poort van een node toont zijn universe, de **LK of Veam die erop gepatcht is** (in zijn eigen kleur, met zijn poorten) en de locatie.
- Sleep een universe uit de **universe-pool** naar een poort, of klik op een poort om er een te kiezen. Poorten kun je leegmaken.
- ID, naam, IP en subnet zijn per node te bewerken. ID's en IP's volgen de DimCity: node 1 van DB02 wordt ID:21 met laatste IP-octet 21.
- Op nodes met twee RJ45-poorten worden beide getoond.

### Splitters
- **Splitters automatisch berekenen** (onder **Zelf plannen…**) geeft elk patchpunt van een universe een splitteruitgang; A/B-splitters dragen twee universes. **Eén splitter toevoegen** voegt een lege toe.
- De uitgangenkaart toont per uitgang universe, LK- / Veam-poort en locatie.

De snelste weg naar een compleet plan is het uit de rack-patch opbouwen: **Gebruik als netwerkplan** op de [Racks-kaart](#racks-nl).

### Meerdere adressen per apparaat en het FENT-schema
- Een node kan **meer dan één adres** hebben: gebruik **Adres toevoegen** bij de node. Dat is voor een apparaat dat op het ene VLAN wordt beheerd en op een ander VLAN data stuurt of scant: een beheeradres (VLAN 1090) en een lichtadres (VLAN 1040), eventueel een scanadres (VLAN 1041). Bij een node met twee RJ45-poorten kies je welke poort (ETH1 of ETH2) welk adres draagt; bij een node met één poort delen beide adressen die poort en wordt de switchpoort een trunk.
- **FENT** (Framework Entertainment Netwerk Technologie v1.1) is de standaardnummering voor entertainmentnetwerken. Druk op **Maak het IP-plan…** in de kaart **IP-plan** op het tabblad Adressen van de pagina Netwerk (dat zet het schema aan). Alle adressen zijn 10.x.x.x met masker 255.255.0.0; de tweede byte is de discipline (beheer 10.90, licht 10.40); de derde byte scheidt locatie (1-99) van productie (101-199), hier afgeleid van het DimCity-nummer (DB02 wordt 102 bij productie); de vierde byte is het apparaat, vanaf 11 (1-10 en 251-254 zijn voor switches en routers).
- **Maak het IP-plan…** toont eerst wat er verandert (oud → nieuw adres per apparaat), en geeft dan elke node een beheer- en een lichtadres en elke switch .1, .2, .3 … — switch 1 van DB01 is 10.90.101.1, switch 1 van DB02 is 10.90.102.1; nodes en splitters tellen door vanaf .11. Switches in een rek tellen mee. De **Controles** op het tabblad Adressen waarschuwen voor dubbele adressen (ook tussen DimCities en tussen de extra adressen van één apparaat), een adres dat bij een ander VLAN hoort, apparaten van één VLAN in verschillende netwerken, DHCP-reeksen, gereserveerde adressen, een ander masker dan 255.255.0.0, en een poort die geen trunk is terwijl het apparaat erop twee VLAN’s draagt.
- Het **Patchbord** toont per DimCity op welke switchpoort elke RJ45 van elk apparaat zit, access of trunk, en de VLAN-kleur. Export PDF print het in de sectie Netwerk en als aansluitlijst, en Stickers kan per poort een label printen. Zet de VLAN-ID's van je Luminex GigaCore-groepen op de FENT-nummers; Luminex gebruikt standaard groep × 100.

### Switches, netwerkkabels en fibers
- **Netwerkswitches**: kies in de kaart *Netwerkswitches* van een DimCity een switchtype (gemaakt in de Device Builder) en klik op **Switch toevoegen**. Switches die in een rek van de DimCity staan worden ook gebruikt. Een switch heeft eigen adressen, net als een node; een switch in een rek ook.
- **Je zet de apparaten zelf op de poorten** (Patchbord) — er wordt niets vanzelf geplaatst; **Poorten automatisch vullen…** vult de vrije poorten één keer, als je dat wilt. Per switch zie je de poorten; de kleur is het VLAN van de poort. Als er meer poorten nodig zijn dan de switches hebben, meldt het bord dat.
- **VLAN-nummering** werkt zoals de Luminex GigaCore-groepen: Management is VLAN 1, groep 2 is VLAN 200, groep 3 is VLAN 300 enzovoort (de kleuren zijn die van de GigaCore). In de kaart FENT kun je overschakelen naar de FENT-nummers (1090, 1040 …).
- **Fiberverbindingen**: maak kabeltypes in de Device Builder (tab *Kabels*: opticalCON, FiberFox, 4-core, singlemode, SFP-patch …) en verbind daarna de SFP-poorten van switches in de kaart *Fiberverbindingen*. Zo koppel je ook DB's aan elkaar. De switch toont welke SFP welke fiber draagt, de PDF toont de fibers van elke DimCity en Stickers print een label op beide uiteinden.

<a id="network-page-nl"></a>
## Pagina Netwerk

De pagina **Netwerk** bevat alles over het netwerk. Kies een DimCity met de chips bovenaan (of **Alle** om elke DimCity onder elkaar te zien), daarna een van de zes tabbladen. Hij opent op het patchbord: het eerste wat je doet is elke node en kabel op een switchpoort zetten.

### Patchbord
- Elke switch van de DimCity is getekend zoals zijn voorkant: de RJ45-poorten op een rij, de SFP-poorten erachter. Een poort toont onderaan zijn VLAN-nummer en kleur; een apparaat erop toont zijn icoon, zijn id (zoals ID:21 of C101.1) en **wat het is** (LumiNode 12, Cat loom …). Een klein oranje labeltje (P1.2) zegt dat de node achter netwerkpoort 2 van een rekpaneel zit.
- **Sleep een apparaat op een poort** — of klik het apparaat en dan de poort. Onder de switches staat de bak **Zonder poort**: elke node-RJ45 en elke netwerkkabellijn die nog geen poort heeft wacht daar. Laat een apparaat in de bak los om het van zijn poort te halen. De bak blijft onderaan het venster staan terwijl je langs de switches scrolt, zodat je er altijd uit kunt slepen.
- Een apparaat dat je op een **bezette** poort loslaat neemt zijn plek in; het apparaat dat er zat gaat terug in de bak, en de poort waar het verplaatste apparaat vandaan kwam blijft leeg. **Er wordt niets vanzelf geplaatst**: een nieuw apparaat wacht in de bak tot jij het plaatst.
- **Poorten automatisch vullen…** vult de vrije poorten één keer, in de volgorde die je kiest (nodes en dan kabels of andersom, op id of zoals gepland); houd wat je geplaatst hebt of begin opnieuw; deze DimCity of alle. Daarna verschuift er niets vanzelf. **Alles eraf halen** zet alles terug in de bak. Een show uit een oudere versie houdt zijn poorten precies zoals ze waren.
- **Koppel aan switch…** verbindt twee switches via RJ45-poorten, als **trunk** die elk VLAN draagt — de gebruikelijke manier met meer dan één switch in een DB. **Automatisch koppelen** ketent de switches met hun laatste vrije poorten. Gekoppelde poorten nemen geen apparaat. (Fibers tussen switches staan op het tabblad Fibers.)
- **Aansluitingen als lijst** onder het bord toont hetzelfde als tabel, met een switch en een poort per apparaat. Het is de tweede weg: het bord is de eerste.

### Nodes
- Per node: het type, zijn naam in de CSV (Node 601) en **waar hij aangesloten moet worden** — een lijst met elke switchpoort; kies je een bezette poort, dan neem je die over. Een node in een rek zegt ook achter welke netwerkpoort van het rekpaneel hij zit.
- Elke DMX-poort toont zijn universe, de **LK of Veam die erop gepatcht is** (eigen kleur, poorten) en de locatie. **Nodepoorten: universes en namen** (eronder) schildert universes, protocol en richting op de poorten.
- **Advanced netwerk** (een LumiNode): vink het aan en elk VLAN van de node wordt een groep op de node zelf, met een eigen adres en een lichtinstelling; een poort die twee VLAN’s draagt wordt een trunk. Netwerkconfig stuurt het via de netwerk-API van de node (valideren, sturen, bevestigen); PatchLab waarschuwt als de switchpoort geen trunk is terwijl de node dat nodig heeft.
- **Nodes uit de racks** en **Zelf plannen…** (nodetype, nodes automatisch indelen, splitters automatisch berekenen) staan bovenaan elke DimCity.

### Switches
- Elke switch van de show, ook die in een rek: naam, IP-adres en subnet, extra adressen.
- Per poort: VLAN, trunk, naam, PoE en snelheid — kies in de balk een VLAN en klik of sleep dan over de poorten. **Naar andere switches kopiëren…** kopieert een switch (met of zonder de namen die je typte). Poorten met een fiber of een switchkoppeling zijn vanzelf een trunk.
- De netwerkkabels (C): VLAN, locatie en de universes die een lijn draagt; kabels en lijnen toevoegen en verwijderen. Los van de CSV bewaard, dus een nieuwe import verliest het niet.

### Adressen
- **IP-plan**: *Maak het IP-plan…* toont wat er verandert en adresseert dan alles: switch 1 van elke DB is .1, switch 2 is .2 …; nodes en splitters tellen door vanaf .11 (FENT). Kies de VLAN-nummering (Luminex of FENT), productie of locatie, en eventueel een scanadres.
- **Alle adressen**: elke node, splitter en switch met zijn adressen en waar hij aangesloten is. Typ een nieuw adres in de tabel; het wordt meteen gecontroleerd.
- **Controles**: dubbele adressen (ook tussen DimCities), adressen buiten het schema, apparaten van één VLAN in verschillende netwerken, een ontbrekende trunk. De VLAN-lijst (namen en kleuren) staat onderaan.

### Fibers
- Kies een kabeltype (opticalCON, FiberFox, 4-core, single-mode, SFP-patch) en de twee switchpoorten die je koppelt. **Fibers koppel je alleen hier**; de Signaalstroom toont ze alleen.
- De matrix toont welke SFP-poorten bezet zijn. Fiberlabels print je als stickers.

### Overzicht
Per DimCity: nodes, switches, apparaten op een poort, Cat-lijnen, fibers en een status.

**PDF**: het onderdeel “Switches: poorten en VLAN” van Export PDF heeft een overzicht, een **aansluitlijst** (apparaat, type, switch, poort, paneelpoort, VLAN, adres) en per switch een tekening van de poorten met een tabel.

<a id="setup-nl"></a>
## Setup-wizard

De knop **Setup** in de werkbalk (ook aangeboden na een import, en in het menu Bestand) loopt een nieuw project in de juiste volgorde door. Niets zit vast: neem de stappen op volgorde of spring naar elke stap.

**Eerst het plan op papier (stap 1–7), dan de echte apparaten (stap 8–9), dan het printwerk (stap 10).**

1. **Patch importeren** — LK-, Veam- en C-regels.
2. **Racks en apparaten** — lees het **advies** (beste setup voor de LK’s, Veams en universes) en pas het toe, of plaats zelf racks en losse apparaten.
3. **LK’s en Veams koppelen** — elke LK en Veam krijgt een aansluiting; automatisch, of kies zelf een aansluiting / losse spin / niet patchen.
4. **Nodes** — de rekpatch wordt de nodes van het netwerkplan; DMX-regels met een naam als "Node 401.1" komen op die nodepoort (zie [Nodenamen](#node-names-nl)).
5. **Netwerk per DB** — VLAN-nummering, FENT aan of uit, en een netwerkswitch voor elke DB (de nodes pakken zijn poorten).
6. **Fibers koppelen** tussen de DB’s: automatisch uit je voorraad, of tekenen (zie [Fibers](#fibres-nl)).
7. **Het plan controleren** — de Signaalstroom en de open meldingen. Het plan op papier is nu compleet.
8. **Apparaten zoeken en uitlijnen** — de [Uitlijntool](#align-nl) vindt elke switch en node, laat ze één voor één knipperen en jij zegt welke wat is.
9. **De configuratie sturen** — namen, IP-adressen, VLAN’s en universes gaan naar de apparaten, nadat je elke wijziging hebt gezien.
10. **Printen en delen** — het PDF-rapport, stickers, QR-codes en de uitwisseling met Lightwright / Vectorworks.

Elke stap legt zichzelf uit in drie regels: wat het is, wat je doet, wat daarna komt.

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
## Netwerkconfig

De pagina **Netwerkconfig** (linkermenu, of de pagina Taken) bevat al je LumiNodes en GigaCore-switches op één pagina. Je ontdekt ze, stelt door te klikken de VLAN's van de switchpoorten en de universes van de DMX-poorten in en stuurt het.

### Ontdekken
Druk op **Apparaten ontdekken**. PatchLab kijkt in het hele netwerk van deze computer (tot een /16, ongeveer 15 seconden), of in het bereik dat je bij **Verbinding** invult (bijvoorbeeld "192.168.40.0/24" of "10.90.101.20-60"). Een LumiNode / LumiCore wordt herkend aan zijn web-API (de softwareversie) en een GigaCore (generatie 2) aan zijn apparaatinformatie; al het andere blijft ongemoeid. Vul onder **Verbinding** de gebruikersnaam en het wachtwoord in als webauthenticatie aanstaat; een apparaat dat om een login vraagt staat er als "login nodig". Alle apparaten worden in één keer gevonden, gekoppeld aan een switch of node uit het plan (automatisch op IP-adres, daarna op naam; pas het aan met de lijst op de kaart) en uitgelezen.

### Een switch
Klik op een switch om hem open te klappen. Je ziet de poorten als tegels, zoals op het voorpaneel, elk met nummer, naam en VLAN, in de kleur van het VLAN.
- **Schilderen:** kies een VLAN in de rij boven de poorten (de kwast) en klik op poorten of sleep eroverheen. Ze krijgen dat VLAN. Het chip **Trunk (fibre)** maakt een poort deel van de trunk "Fibre", die de VLAN's van het plan voert met het beheer-VLAN untagged.
- **Eén poort:** klik zonder kwast op een poort om naam (16 tekens), VLAN, PoE (alleen poorten met PoE) en snelheid (Auto, 1 Gbps, 100 / 10 Mbps) te veranderen.
- Een VLAN uit het plan dat de switch nog niet heeft staat met een plusje; de groep wordt aangemaakt bij het toepassen.
- **Invullen uit het plan** zet de namen (uit het poortplan) en VLAN's van het plan op de poorten, de fibre-poorten in de trunk en de apparaatnaam. Het IP-adres verandert alleen als je dat bij Verbinding aanzet of zelf intypt.
Geschilderde poorten hebben een oranje rand; er is nog niets gestuurd.
- **Trunk:** de kwast **Trunk** zet een poort in de trunk van de switch. Een GigaCore heeft één ingebouwde trunk (op een echte switch heet die ISL). Die bevat alleen de ingebouwde VLAN-groepen, dus PatchLab maakt de VLAN-groepen uit het plan aan die nog ontbreken en voegt ze aan die trunk toe; de untagged VLAN van de trunk blijft zoals hij is, zodat de switch bereikbaar blijft. Wil de switch zijn ingebouwde trunk de nieuwe VLAN's niet laten dragen, dan controleert PatchLab dat na het toepassen en zet het de poorten in een eigen trunk ("Fibre") die ze wel draagt. De poorten worden toegewezen met de eigen aanroep van de switch voor "poorten aan een trunk toewijzen". Onder de poorten zie je de trunk in woorden — zijn poorten, de VLAN's die hij voert en de **untagged VLAN**, die je daar kunt veranderen (Invullen uit het plan zet het beheer-VLAN). Na het toepassen wordt de switch teruggelezen en gecontroleerd: zei hij "ok" maar zit een poort niet in de trunk, dan probeert PatchLab de andere gedocumenteerde manier (poort voor poort) en vertelt wat de switch meldt. Een poort die dan nog steeds niet in de trunk zit verschijnt opnieuw als wijziging, en onder **Laatste aanroepen naar dit apparaat** zie je (en kopieer je) elke aanroep en het antwoord van de switch. In het paneel van een poort zie je ook wat de switch zelf erover zegt.
- **Advanced-modus:** een switch in "advanced" configuratiemodus wordt ook met zijn commandoregel ingesteld, en groepen en trunks die via de API gemaakt worden kunnen verkeerd getoond worden. PatchLab waarschuwt daarvoor en heeft een knop om naar Luminex-modus om te zetten (de switch herstart).

### Lampjes (GigaCore)
De poortlampjes van een GigaCore tonen de kleur van de groep waar de poort in zit, en het voorpaneel kan één kleur op alle poorten tonen. De **Regenboogshow** laat de kleuren van het voorpaneel een paar keer van rood → magenta lopen en gaat dan terug naar wat het toonde. De poortlampjes tonen alleen groepskleuren als het voorpaneel in de stand "groups" staat; de regenboogstroom en de kleuren zetten het daarop en zetten het terug (of gebruik **Poorten tonen groepskleuren** / **Lampjes uit**). De **Regenboogstroom** geeft elke gebruikte groep zijn plek in de regenboog en laat de hele regenboog een paar seconden ronddraaien, zodat de kleuren als een golf langs de poorten lopen; daarna komen de oude kleuren terug. **Regenboogkleuren op de groepen** geeft elke gebruikte groep een eigen kleur van de regenboog, van links naar rechts langs de poorten, zodat de lampjes een regenboog over de VLAN's tonen; **Kleuren terug** zet ze terug. Een groepskleur heeft geen invloed op het verkeer. Een losse poort kan geen eigen kleur krijgen: zijn lampje volgt zijn groep.

### Het e-ink-display (GigaCore 20t)
Een switch met een e-ink-display toont onder zijn poorten een onderdeel **E-ink display**. Kies **Tekst** (typ de regels; de grootte is automatisch of vast) of **Afbeelding** (kies een JPG-, PNG- of ander afbeeldingsbestand): PatchLab schaalt het naar het formaat van de display (uitgelezen van de display zelf), maakt het zwart-wit (desgewenst gedithered) en stuurt het als PNG. **Als voorbeeld sturen** zet het op het apparaat zonder de display aan te raken en toont wat het apparaat ervan maakte; **Op de display tonen** past het toe; **Standaardweergave** brengt de Luminex-weergave terug; **Mijn afbeelding wissen** wist het. Je kunt ook het IP-adres verbergen of de quick-start-QR-code tonen. Ziet het voorbeeld er verkeerd uit, pas dan passen, grootte of dither aan en stuur opnieuw.

### Een LumiNode
Klik op een node om hem open te klappen. Je ziet de DMX-poorten als tegels: nummer, naam, richting, protocol en universe. Per poort kun je alles instellen: de **naam**, de **richting** (uitgang: netwerk → DMX, ingang: DMX → netwerk, of uit), het **protocol** (sACN of Art-Net) en het **universe**. Het universe is het nummer dat de node zelf toont; Art-Net wordt niet één verschoven, tenzij je dat onder Verbinding kiest.
- **Kwast:** stel richting, protocol en universe in de kwastbalk in (laat een veld op "houden" om het met rust te laten) en klik op poorten. Met "volgende poort krijgt het volgende universe" geeft de volgende klik het volgende nummer.
- **Eén poort:** klik zonder kwast op een poort en gebruik het paneel onder de tegels.
- De node houdt zijn eigen regels aan: naam en richting staan op de DMX-poort, universe en protocol op de netwerkingang (of, bij een DMX-ingang, netwerkuitgang) die er via zijn process block aan hangt. Een richting of protocol veranderen maakt een nieuwe ingang / uitgang, koppelt die en verwijdert de oude; het voorbeeld toont elke stap. Een poort waarvan de opzet niet herkend wordt, of waarvan de ingang gedeeld is met een andere poort, blijft ongemoeid en wordt uitgelegd.

### Advanced netwerk van een LumiNode
Een LumiNode heeft normaal één adres (basisconfiguratie). In het **advanced netwerk** heeft hij **groepen**: elk VLAN is een groep met eigen adres(sen) en een lichtinstelling (komt licht op deze groep binnen en gaat het eruit), en elke netwerkpoort zit in één groep of in een **trunk** van meer groepen. Je plant het op de pagina Netwerk: vink **Advanced netwerk** aan bij de node (tabblad Nodes); elk VLAN van de adressen van de node wordt een groep, de lichtadressen luisteren naar licht, en een poort die twee VLAN’s draagt wordt een trunk.
- Op de kaart van de node toont **Netwerk van deze node** de groepen en poorten die de node nu heeft en daaronder wat het plan wil. **Invullen uit het plan** zet het in de wachtende wijzigingen: *de nieuwe netwerkconfiguratie controleren*, *sturen* en *activeren* — drie aanroepen, die je in de lijst ziet voor je toepast. De node kan daarna op zijn oude adres niet meer antwoorden: zoek hem op zijn nieuwe.
- PatchLab waarschuwt (tabblad Nodes, tabblad Adressen en hier) als de switchpoort waar de node aan zit geen trunk is terwijl de node twee VLAN’s over die kabel draagt, of als het VLAN van de poort een ander is dan dat van de node. Het controleert het plan; een gekoppelde node wordt gecontroleerd tegen de poort waar hij op zit.
- Oudere firmware zonder het advanced netwerk wordt herkend: dan wordt alleen het basisadres ingesteld.

### Alle instellingen en naar andere apparaten sturen
Elke kaart heeft een onderdeel **Alle instellingen**. Daar staat alles wat de Luminex API laat veranderen, in onderdelen (kies er een, of zoek op een woord als "jumbo" of "IGMP"). Poorten, VLAN-groepen, uitgangen enzovoort staan in een tabel met één rij per stuk; de knop **alle** onder een kolomtitel zet die waarde op elke rij. Gewijzigde waarden zijn gemarkeerd en blijven klaar staan tot je op Toepassen drukt (ze staan ook in de lijst met aanroepen). Instellingen waarmee je jezelf kunt buitensluiten (IP, beveiliging, poorten uitzetten) hebben een waarschuwingsteken.

**Naar andere apparaten sturen…** kopieert je klaargezette wijzigingen, of hele onderdelen van dit apparaat, naar zoveel apparaten van hetzelfde soort als je aanvinkt. Alleen de verschillen worden klaargezet; namen, beschrijvingen en adressen gaan alleen mee als je dat aanvinkt, risicovolle instellingen ook. Controleer het resultaat per apparaat of onder **Alles toepassen**.

### Toepassen
**Toepassen…** op een kaart, of **Alles toepassen** bovenaan, stuurt meteen, zonder extra vraag. De aanroepen gebeuren een voor een per apparaat; bij de eerste fout stopt het. Daarna wordt het apparaat opnieuw uitgelezen en vergeleken met wat je vroeg, en een venster toont elke wijziging die is gedaan (wat er per apparaat is gestuurd). Maak eerst je klaargezette wijzigingen ongedaan als je ze niet wilt sturen. Het IP-adres veranderen gebeurt altijd als laatste. Optioneel wordt een switchconfiguratie in een profielslot bewaard (Verbinding). Het werkt op GigaCore generatie 2 en LumiNode / LumiCore; generatie 1-switches vallen erbuiten.

Buiten de desktop-app antwoorden gesimuleerde apparaten zodat je het kunt uitproberen.

<a id="racks-nl"></a>
## Racks & DB’s

De pagina **Racks & DB’s** (linkermenu, onder Patchlijst) is de plek waar de DB’s van de show en hun racks worden gemaakt.

- **Nieuwe DB** (en **FOH**) voegen een DB toe, ook wel DimCity. Een DB verschijnt ook vanzelf als je een patch importeert: hij volgt uit de LK- en Veam-nummers.
- **Rack Builder** opent de bouwer waar je **racktypen** maakt: kies de apparaten (dimmerrack, noderack, splitters …) en de hoogte. Een racktype maak je één keer en plaats je in zoveel DB’s als je wilt.
- Kies een DB met zijn chip. Voor die DB zie je **Rack plaatsen** (kies een type), **Eigen rack…** (een rack van jezelf, zonder artikelsleutel), het advies voor de beste setup, **Losse apparaten** (een losse node, LK-spin of Veam4-spin) en **Gebruik als netwerkplan**, dat van de racks de nodes en splitters van het netwerkplan maakt.
- PatchLab patcht daarna elke LK en Veam op een aansluiting van de racks en een poort van een node. Dezelfde kaart staat op de pagina van een DimCity; deze pagina is alleen de voordeur.

<a id="power-nl"></a>
## Stroom (PD’s en Socapex)

De pagina **Stroom** is een onderdeel op zich: de gegevens staan in het project (model.power) en zijn alleen via de DimCity-naam gekoppeld aan de rest. Je kunt het uitproberen en controleren zonder de patch, de racks of het netwerkplan aan te raken.

### Wat het doet
- Het **armaturenblad** (CSV uit Vectorworks / Lightwright) is de bron. De **Circuit Name** is een Socapex-kabel (M101 …), **Circuit Number** het circuit 1–6, **Wattage** geeft de stroom (watt ÷ 230 V). Het eerste cijfer van M101 is de DB (M1xx = DB1). Circuit 1…6 zitten op L1 L2 L3 L1 L2 L3.
- **PD-bouwer** (tab “PD-bouwer”, ook de knop **PD-bouwer** op de pagina Racks & DB’s): hier bouw je zelf je PD’s, zoals node-typen. Kies de ingang (Powerlock / CEE, ampère), voeg de uitgangen toe in de volgorde waarin ze op de PD zitten (Socapex met 6 circuits, Han 16 of Harting met 8, CEE 16–125 A één- of driefase, Schuko), kies bij een multi-uitgang het aantal circuits en de fase waarop hij begint, een ampèrelimiet per fase voor de hele uitgang, kies de fase van elke eenfase-uitgang en maak **groepen** (automaten): uitgangen met dezelfde groep delen zijn limiet. Een tekening van de voorkant toont wat je gebouwd hebt. Twee voorbeelden voeg je met één klik toe.
- **PD’s & voedingen** per DimCity: voeg een voeding toe (een Powerlock- of CEE-run met zijn maximale stroom; een voeding kan doorlopen vanaf een andere, dan telt hij daar ook in mee), voeg PD’s toe en kies hun type en voeding. **Kabels automatisch vullen** geeft elke PD een blok van 12 kabelnummers (M101–M112, M113–M124 …), op volgorde als Soca A, B, C …, of kies zelf een kabel per Socapex.
- **Overzicht**: per DimCity de PD’s en voedingen met L1 / L2 / L3 in ampère, en waarschuwingen: een circuit boven 16 A, een voeding te zwaar of te scheef, een kabel niet op een PD, een PD zonder voeding, armaturen direct op een DB, armaturen zonder wattage.
- **Een PD** opent als een pagina uit het boekje: per Socapex de zes circuits met DMX-universe, kabel-circuit (M101-1), armatuurnummers (401 - 406), wat er hangt ("6* CLF Lighting Aorun"), de locatie en de ampère op de fase, met totalen. De overige uitgangen (CEE, Schuko) vul je zelf in.
- **Boekje (PDF)**: een voorblad, per DB het overzicht, een pagina per PD (met de kop op elk vel herhaald) en de powersamenvatting, staand. Maak het voor één DB of voor alle. Het werkt op zichzelf: het armaturenblad alleen is genoeg, de DB’s komen uit de kabelnamen (M4xx → DB4) als het project nog geen DimCities heeft.

### Goed om te weten
- De DMX-kolom leest “10-Var” voor één universe met meer adressen, “Var” voor meer universes en “1-501” voor één armatuur.
- Armaturen die direct aan een DB hangen (Circuit Name “DB2”) staan in de waarschuwingen en tellen niet mee op een PD.
- Hier wordt niets naar apparaten gestuurd; het is papierwerk en controle.

<a id="align-nl"></a>
## Uitlijntool

De **Uitlijntool** is om snel veel apparaten in te stellen. Open hem via de pagina Taken, via Netwerkconfig (**Uitlijntool**) of via Setup stap 8. Netwerkconfig blijft zoals het was, voor het werken aan één apparaat of poort.

1. **Zoeken** — zoekt in het netwerk (of het bereik dat je typt) naar elke LumiNode en GigaCore en toont elk apparaat zodra het gevonden is. Het deel rond deze computer wordt eerst doorzocht, voor elk adres dat deze computer heeft (dus twee adressen in twee bereiken werken), daarna het bredere netwerk.
2. **Uitlijnen** — switches en nodes werken hetzelfde. Het eerste apparaat **knippert**: een GigaCore laat scherm en poortlampjes knipperen (de identify-aanroep van de switch), een LumiNode zijn LED’s. Jij staat bij het apparaat, ziet welke het is en drukt op zijn plek in het plan, bijvoorbeeld **DB3-SW1**. De koppeling is gemaakt en het volgende apparaat knippert. Het voorstel in oranje is de eerste vrije plek, of die met hetzelfde IP-adres. **Overslaan** laat een apparaat met rust, **Ongedaan** neemt de laatste koppeling terug.
3. **Sturen** — **Invullen uit het plan** zet namen, VLAN’s, poortnamen en universes op de apparaten (eventueel ook het IP-adres uit het plan; het apparaat verhuist dan naar zijn nieuwe adres, doe dat dus op een nieuw netwerk). **Config sturen** stuurt meteen, zonder extra vraag: eerst alles behalve de IP-adressen naar alle apparaten; daarna de adressen, op hetzelfde moment naar alle apparaten, elk gecontroleerd op zijn nieuwe adres. Daarna toont een venster elke wijziging die is gedaan. Verhuist een apparaat naar een bereik waar deze computer geen adres in heeft, dan waarschuwt PatchLab vóór het sturen (knop **Adressen toevoegen aan deze computer**, het systeem vraagt toestemming) en markeert het apparaat, als het toch gebeurt, als verhuisd in plaats van mislukt, met dezelfde knop.

Nog niet gedaan: apparaten vinden via IPv6 / MAC-adres als een nieuw apparaat op een ander IP-bereik zit dan je computer. Dat moet eerst op echte apparaten getest worden.

<a id="fibres-nl"></a>
## Fibers

Fibers verbinden de fiberpoorten van de switches, binnen een locatie en tussen locaties (DB’s, FOH).

### Kabeltypes en voorraad
- Maak de kabeltypes in de Device Builder (tab Kabels): opticalCON, FiberFox, 4-core, singlemode, SFP-patch. De lengte mag halve meters hebben, bijvoorbeeld **7,5**.
- Vul op de pagina Netwerk, tab **Fibers**, in hoeveel je van elke kabel hebt (6× OC7,5, 6× OC250, 2× FF250 …). De tabel toont hoeveel er gebruikt en over zijn. De korte code op tekeningen en labels is de connector plus de lengte: OC250, FF250, OC7,5.

### Automatisch koppelen
**Fibers automatisch koppelen** zet de switches van één locatie achter elkaar met de korte kabel en verbindt de locaties met de lange kabel, als ring of ketting. Vrije poorten met de juiste connector gaan eerst (opticalCON-kabel op een opticalCON-poort). Het stopt als de voorraad op is en meldt wat er ontbreekt.

### Fiber-overzicht
Kies in de **Signaalstroom** onder Tonen voor **Fibers**. Elke locatie is een kaart op een cirkel met zijn switches en fiberpoorten (17, 18 … met hun connector). Sleep een switch (aan zijn naam) naar een andere plek in de kaart, bijvoorbeeld naast een andere switch, of sleep de kaart zelf. Kies onderaan een kabel, klik op een vrije poort en daarna op de poort aan de andere kant om een fiber te tekenen. Kabels lopen in rechte lijnen om de switches en de namen van de kaarten heen — nooit erdoorheen — en springen met een bruggetje over elkaar. Een kabel past alleen op poorten met zijn eigen connector (opticalCON, FiberFox of SFP); andere poorten worden gedimd. Klik op een kabel om hem te selecteren of te verwijderen.

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
- **Halve devices**: zet *Width in the rack* van een node op Half (de LumiNode 4 is dat). In de Rack Builder delen twee halve devices één U, links en rechts (sleep naar de linker- of rechterhelft, of gebruik de knop ⇄). *Blind plate ½* en *Fill gaps next to half-width devices* vullen de rest met zwarte blindplaten. Racks in de Signaalstroom, op de DimCity-pagina en in de PDF tonen ze hetzelfde, en de voorvertoning in de Device Builder ook — voor elk soort device (nodes, splitters, switches en panelen).

<a id="flow-nl"></a>
## Signaalstroom

De pagina **Signaalstroom** (zijbalk, of Cmd/Ctrl+4) tekent de bekabeling van een DimCity zoals die op de vloer ligt: het rek met zijn nodes, splitters en LK-paneel → één dikke LK-multicore per LK-blok → een Veam-kabel per gekoppelde Veam → dunne DMX-lijnen naar de **objecten** (de locaties uit je patchlijst, met de universe die daar aankomt). XLR-lijnen op de LK zelf krijgen elk een klein blokje, precies in lijn met hun poort; de vier poorten van een Veam delen één objectenblok.

### Lezen
- **Rekken** zijn getekend zoals in de Rack Builder: rails met U-nummers, de fronten van nodes, splitters, switches en panelen, en hun aansluitingen. Een nodepoort toont de universe die erop staat in de kleur van de LK of Veam die erop gepatcht is; een LK37- of Veam4-aansluiting toont het nummer van de LK of Veam die eruit komt, in zijn eigen kleur — elke LK en elke Veam heeft een eigen kleur, nooit twee dezelfde. Een rek waarvan de nodes alleen het paneel van een ander rek voeden staat links daarvan. Losse apparaten (een node met de spinnen eraan) staan als een stapel zonder kader.
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
- **Raster** toont een raster achter de tekening en **Snap** laat de blokken die je verplaatst eraan vastklikken (de rastergrootte staat in de linkerbalk: 10, 20 of 40; houd **Alt** ingedrukt tijdens het verplaatsen om de snap één keer te negeren). Beide kun je uitzetten. Het raster wordt nooit geprint.
- **Een blok vasthouden**: als je een blok indrukt komt het meteen omhoog (schaduw en rand) en gaat het bovenop; terwijl je het verplaatst worden de andere gedimd en volgen de kabels. Is de plek eronder bezet, dan toont een gestippelde rand waar het terechtkomt als je loslaat — het blok kleurt intussen rood.
- **Afbeelding opslaan** schrijft de tekening als SVG-bestand dat je overal kunt openen of printen.
- **Klik op de naam van een LK-blok** om het een eigen naam te geven (bijvoorbeeld "Front truss"). Dit verandert alleen de tekening; het LK-nummer, de poorten en de CSV blijven zoals ze zijn.

De indeling, de zoom en de LK-namen worden per DimCity met het project opgeslagen, en **Export PDF** print de tekening van elke DimCity precies zoals je hem hier hebt neergezet (sectie "Signaalstroom-tekening"). De tekening wordt uit de rekpatch opgebouwd, dus plaats eerst een rek of een losse node (zie [Rekken per DimCity](#racks-nl)).

### Netwerklaag
De schakelaar **Tonen** in de linkerbalk kiest *Alles*, *DMX* of *Netwerk*. De netwerklaag toont de **switches** (met het VLAN van elke gebruikte poort en de fiber op elke SFP), de **netwerkkabels (C)** die de DB binnenkomen en de **nodes** die aan de switchpoorten hangen, op volgorde van de nodenummers. Netwerkkabels staan in de kleur van hun VLAN; fibers zijn dikke lijnen in de kleur van hun kabeltype en verbinden ook de DB's met elkaar; ze lopen met rechte hoeken **om** de blokken en de DimCity-titels heen, nooit erdoorheen (terwijl je een blok verplaatst zijn het eenvoudige bogen, en ze zoeken hun weg opnieuw als je loslaat). Met *Netwerk* zie je alleen deze laag. De PDF print de volledige tekening en, als optie, een tweede tekening met alleen het netwerk.

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
- **Aansluitlabels paneel**, één per LK37- / Veam4-aansluiting, om boven de aansluiting te plakken.
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

**Instellingen** (Cmd/Ctrl+,) heeft twee soorten instellingen. **Deze show** wordt in het showbestand bewaard; al het andere geldt voor de app op deze computer.

- **Deze show**: hoe de eerste kolom van de CSV gelezen wordt. Het **prefix** van een LK (standaard LK), van een Veam (V), van de netwerkkabels (C, met zijn aantal lijnen) en van nodes (Node); een show die zijn LK’s “K101” noemt wordt als LK101 gelezen en weer als K101 geëxporteerd. **Netwerkkabeltypes** kun je toevoegen, elk met een prefix en een aantal lijnen (een Cat-loom heeft er 4). **Een Veam mag op een vrije Veam4-aansluiting van een LK-paneel** (standaard uit): uit betekent dat de Veam4-aansluitingen van een LK-paneel bij die LK horen. *Toepassen* leest de CSV opnieuw met de nieuwe regels.
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

### Versie 0.13.0 — 2026-10-10
- Pagina Netwerk, opnieuw opgebouwd: het eerste tabblad is een **patchbord**. Elke switch is getekend zoals zijn voorkant; sleep een node of kabel op een poort (of klik het apparaat en dan de poort). Elk apparaat toont wat het is (icoon, id en type: LumiNode 12, Cat loom …). Een apparaat op een bezette poort neemt zijn plek in, het andere gaat terug in de bak en de poort waar het vandaan kwam blijft leeg. Er wordt niets meer vanzelf geplaatst: **Poorten automatisch vullen…** vult de vrije poorten één keer. Een show uit een oudere versie houdt zijn poorten zoals ze waren. De lijst met aansluitingen met de uitklappers blijft onder het bord.
- Twee switches in één DB kun je **via RJ45-poorten als trunk koppelen** (Koppel aan switch…, of Automatisch koppelen); gekoppelde poorten dragen elk VLAN en nemen geen apparaat.
- Nieuwe tabbladen: **Nodes** (per node de universes met de naam van de LK of Veam erop, de locatie, en een lijst om de switchpoort te kiezen waar hij aan zit; de oude pagina “Nodes & splitters” is er onderdeel van), **Switches** (elke switch, ook die in racks: adres, VLAN / trunk / naam / PoE / snelheid per poort, kopiëren naar andere switches, netwerkkabels) en **Adressen**.
- Adressen: elk adres van elke node, splitter en switch in één tabel, te bewerken, met het **IP-plan**: switch 1 van elke DB is .1, switch 2 is .2 … en nodes en splitters tellen door vanaf .11. Je ziet oud → nieuw voor er iets verandert. Controles op **dubbele adressen** (ook tussen DimCities en tussen de extra adressen van één apparaat), adressen buiten het schema, apparaten van één VLAN in verschillende netwerken, en een poort die geen trunk is terwijl het apparaat erop twee VLAN’s draagt.
- LumiNode **advanced netwerk**: vink het aan bij een node en elk VLAN wordt een groep op de node met een eigen adres en een lichtinstelling, poorten gaan naar een groep of een trunk. Netwerkconfig leest de netwerkconfiguratie van de node, toont wat het plan wil en stuurt het (controleren, sturen, activeren). De simulator beantwoordt de nieuwe aanroepen.
- Racks: de Veam4-aansluitingen van een LK37-aansluiting horen bij die LK (2× LK37 + 6× Veam4: Veam 1–3 op LK1, 4–6 op LK2; in te stellen in de Paneelbouwer). Een losse Veam wordt er niet meer op gepatcht, tenzij je *Een Veam mag op een vrije Veam4-aansluiting van een LK-paneel* aanzet in Instellingen → Deze show (standaard uit). De netwerkpoorten (etherCON) van een rekpaneel sluiten nu aan op de nodes in het rek.
- **Elke LK en elke Veam heeft een eigen kleur** — nooit twee dezelfde, ook niet een LK en een Veam — op het rek, in de Signaalstroom, in de PDF en op de labels. Nodes herken je aan hun label.
- Instellingen → **Deze show**: de prefixen van LK, Veam, netwerkkabels en nodes, extra netwerkkabeltypes (eigen prefix en aantal lijnen), en de regel hierboven. CSV-regels als **Node601,1** (node 01 van DB06, poort 1) worden gelezen en op die node gezet. LK7-1 heet overal **LK37**. Een DB kun je **verwijderen**.
- Signaalstroom: een blok dat je indrukt komt meteen omhoog (schaduw, rand) en de kabels volgen terwijl je hem verplaatst; een gestippelde rand toont waar hij terechtkomt. Een **raster** met **Snap**, allebei uit te zetten (grootte 10 / 20 / 40, houd Alt ingedrukt om vrij te verplaatsen). **Fibers lopen om** de blokken en de teksten heen met rechte hoeken, in de Signaalstroom en in het fiberoverzicht.
- Device Builder: de voorvertoning toont halve devices als halve breedte (alle soorten devices). De dialogen om een switch of node naar andere te kopiëren hebben hun linkerkolom netjes uitgelijnd. Het PDF-onderdeel Switches heeft een aansluitlijst.

### Versie 0.12.0 — 2026-10-07
- Eén poortplan: de poorten die je op de pagina Netwerk instelt (VLAN, trunk, naam, PoE, snelheid) zie je nu overal, in de poortstroken onder “Netwerkswitches”, de tabel met aansluitingen, de labels, de PDF en Netwerkconfig. Voorheen toonden de stroken en de tabel alleen het automatische plan.
- Aansluiten: kies wat het eerst op de switchpoorten komt (alle nodes en dan de kabels, of andersom) en de volgorde (op id of zoals gepland). Sleep een apparaat van de ene poort naar de andere (ze wisselen), laat het los in de bak om het van zijn poort te halen, of kies de switch en poort in de nieuwe tabel “Aansluitingen”. “Ontkoppel alle poorten” haalt alles eraf zodat je het zelf plaatst, “Opnieuw automatisch indelen” vult de poorten op volgorde. Wat je met de hand plaatst blijft staan.
- Netwerkkabels (C): VLAN, locatie en de universes die een lijn draagt (zoals “1-4, 7”) zijn per lijn te wijzigen en je kunt kabels en lijnen toevoegen of verwijderen. Dit wordt los van de CSV bewaard, dus een nieuwe import verliest het niet; de CSV-export bevat het VLAN en de locatie die je koos.
- Nieuw PDF-onderdeel “Switches: poorten en VLAN”: een overzicht van alle switches en fibers, en per switch een tekening van de poorten in de VLAN-kleuren met een tabel van poort, apparaat of kabel, naam, VLAN, modus, PoE, snelheid, universes en adres. Poortnamen die je zelf typte kun je weglaten.

### Versie 0.11.3 — 2026-10-07
- Pagina Netwerk, poorten plannen: de SFP- / fiberpoorten zijn ook tegels, met hun echte nummers. Een poort met een fiberkabel is vanzelf een trunk; kies een ander VLAN, Trunk of Automatisch om dat te wijzigen.
- Per switchpoort kun je nu ook PoE (aan / uit) en snelheid instellen, in de balk boven de poorten (en dan over poorten slepen) of in het detail van een poort.
- Kopieer de poortinstellingen van één switch naar andere switches (VLAN / trunk, PoE en snelheid, SFP-poorten, alleen de poorten die je met de hand veranderde). Poortnamen worden alleen meegekopieerd als je dat kiest, want die verschillen door netwerkkabels en nodes. Nodes kun je ook kopiëren: protocol en richting, op verzoek namen en universes. Er wordt niets gestuurd; het vult het plan.
- Nodepoorten: de richting heeft nu dezelfde keuzes als op Netwerkconfig (Uitgang, Ingang, Uit).
- Netwerkconfig en de Uitlijntool: “Invullen vanuit plan” zet ook PoE, snelheid en de SFP-poorten, en met het nieuwe vinkje “zet ook de poortnamen” (standaard aan) kun je de namen laten staan die op de apparaten staan.

### Versie 0.11.2 — 2026-10-07
- De films "Network" (deel 5 van de bouwserie) en "Power" zijn opnieuw opgenomen: ze tonen nu het vooraf plannen van switchpoorten met de VLAN-balk, een poort met de hand een naam geven en de Han 16-uitgangen van de PD-bouwer.

### Versie 0.11.1 — 2026-10-07
- Pagina Netwerk: plan de poorten voordat er een apparaat op het netwerk hangt. Kies bovenaan in de balk een VLAN (nummers en namen), klik of sleep over de poorten van een switch en ze krijgen dat VLAN; Trunk en Automatisch staan ook in de balk. Klik een poort aan om hem met de hand een naam te geven; zonder naam geldt de automatische (node- of kabelnaam) en “Automatische namen” brengt die terug. Nodes krijgen hetzelfde: universe (de volgende poort kan het volgende universe krijgen), naam, sACN / Art-Net en richting per DMX-poort.
- Wat je daar plant is wat “Invullen vanuit plan” op de pagina Netwerkconfig en in de Uitlijntool op de echte switches en nodes zet, inclusief met de hand gemaakte VLAN’s, trunks, namen en protocollen. Het plan wordt met het project opgeslagen.
- PD-bouwer: Han 16- en Harting-uitgangen (8 circuits, of een ander aantal), de fase waarop een uitgang begint (zodat een PD met meerdere Han-uitgangen in balans blijft) en een ampèrelimiet per fase voor een hele uitgang. De circuitlimiet volgt de ampère van de uitgang. Een Han 16-voorbeeld voeg je met één klik toe. De PD-pagina’s en het boekje tonen zoveel rijen als de uitgang circuits heeft.
- PD-bouwer, eerder gemaakt en nu uitgebracht: een fase per uitgang, automaatgroepen die een limiet delen, de volgorde van de uitgangen, een tekening van de voorkant, groepstotalen in het boekje en de knop op de pagina Racks & DB’s.

### Versie 0.11.0 — 2026-10-06
- Nieuwe pagina Racks & DB’s in het menu: de plek waar DB’s worden gemaakt en waar de racks erin komen. Voeg een DB of FOH toe, open de Rack Builder om racktypen te maken, kies een DB en plaats racks, een eigen rack of losse apparaten; dezelfde planning als op de pagina van een DimCity, maar altijd één klik weg.
- Nieuwe film "DimCity PatchLab — een eerste blik": twee minuten, niet stap voor stap, een snelle rondgang door de hele app (patch, racks, netwerk, signaalstroom, stroom, live gaan met de Uitlijntool, papierwerk) in 2560x1440 met een zachte muziekbed. Te vinden in Help, onder Video’s.
- Sturen naar de apparaten: eerst gaat alles behalve de IP-adressen naar alle apparaten, daarna gaan de adressen op hetzelfde moment naar alle apparaten en wordt elk apparaat op zijn nieuwe adres gecontroleerd. Een apparaat dat deze computer niet meer bereikt, staat als verhuisd in plaats van mislukt; de knop "Adres toevoegen aan deze computer" geeft de computer een adres in dat bereik (het systeem vraagt toestemming). De Uitlijntool waarschuwt daarvoor vóór het sturen.
- Apparaten vinden: het deel van het netwerk rond deze computer wordt eerst doorzocht, voor elk adres dat de computer heeft, zodat een computer met twee adressen in twee bereiken de apparaten in beide vindt. De zoeklijst werd afgekapt na 65.536 adressen; die grens is weg.
- De Uitlijntool zet apparaten waar het plan geen plek voor heeft achteraan de rij, en de video laat ook een node uitlijnen zien.

### Versie 0.10.0 — 2026-10-05
- Nieuwe sectie Stroom (PD’s en Socapex), een onderdeel op zich dat je kunt uitproberen en controleren zonder de patch aan te raken. Laad los een armaturenblad (CSV met Circuit Name = Socapex-kabel, Circuit Number = circuit, Wattage), bouw PD-typen zoals node-typen (Powerlock- of CEE-ingang; Socapex-, CEE- en Schuko-uitgangen), voeg voedingen (Powerlock-runs die door kunnen lopen) en PD’s per DB toe en laat PatchLab de kabels op de PD’s zetten (blokken van 12 nummers).
- Het rekent de ampère uit op L1 / L2 / L3 per circuit, Socapex, PD en voeding (circuit 1-6 op L1 L2 L3 L1 L2 L3, watt / 230 V) en waarschuwt bij een circuit boven 16 A, een te zware of scheve voeding, kabels niet op een PD, PD’s zonder voeding en armaturen zonder wattage. Een PD opent als een pagina uit het boekje.
- Boekje (PDF) voor één DB of alle DB’s, staand, met voorblad, een overzicht per DB, een pagina per PD en een powersamenvatting.
- PDF-export staat nu standaard staand (nieuwe projecten; een project dat al liggend koos houdt dat).
- Nieuwe video "Stroom: PD’s en Socapex"; de video over de PDF en de stickers is opnieuw gemaakt.

### Versie 0.9.2 — 2026-10-05
- Apparaten verschijnen één voor één terwijl PatchLab het netwerk doorzoekt, in plaats van allemaal tegelijk aan het eind; elk apparaat wordt uitgelezen zodra het is gevonden. Het deel van het netwerk rond deze computer wordt eerst doorzocht, dus de apparaten voor je neus staan binnen een seconde in beeld. De Uitlijntool toont ze ook één voor één.
- Toepassen, Alles toepassen en Config sturen vragen niet meer om bevestiging. Ze sturen meteen, lezen elk apparaat terug en tonen daarna een venster met elke wijziging die is gedaan, per apparaat (en de fout, als er een mislukte).
- Video’s: "De apparaten uitlijnen en de configuratie sturen" en "Netwerkconfig" laten de nieuwe manier van sturen zien.

### Versie 0.9.1 — 2026-10-04
- Video’s bijgewerkt voor de nieuwe werkwijze: de serie Een show bouwen heeft nu tien delen (nieuw: "9 · De apparaten uitlijnen en de configuratie sturen" en "10 · De PDF en de stickers"), de video Netwerkconfig toont de huidige pagina (VLAN-kwast, Alle instellingen, naar andere apparaten sturen) en de video Taken en Setup gaat over de tien stappen.

### Versie 0.9.0 — 2026-10-04
- Nieuw: de Uitlijntool. Hij vindt elke GigaCore en LumiNode, laat ze één voor één knipperen (de identify-aanroep van de apparaten), jij drukt welke plek in het plan het is ("DB3-SW1") en de volgende knippert. Daarna zetten "Invullen uit het plan" en "Config sturen" namen, IP-adressen, VLAN’s en universes in één keer op alle apparaten, met eerst een lijst van elke wijziging. Netwerkconfig blijft zoals het was.
- De Setup-stappen zijn duidelijker en in een betere volgorde: eerst het plan op papier (import, racks, aansluitingen, nodes, switches, fibers, controle), dan de echte apparaten (zoeken en uitlijnen, configuratie sturen), dan printen en delen. Elke stap zegt nu in drie regels wat het is, wat je doet en wat daarna komt.
- De configuratie naar de apparaten sturen is een van de laatste stappen, zoals het hoort; de PDF, stickers en uitwisseling staan in hun eigen laatste stap.

### Versie 0.8.0 — 2026-10-04
- Nieuw: "Alle instellingen" op elke GigaCore- en LumiNode-kaart in Netwerkconfig. Het toont elke instelling die de nieuwste Luminex API-bestanden (GigaCore WebApi 1.5, LumiNode WebApi 2.9) laten veranderen, in onderdelen (Poorten, PoE, VLAN-groepen, IGMP, SNMP, PTP, DHCP-server, display, DMX, protocollen, LED's …) met zoekbalk, de juiste bediening per instelling (schakelaar, lijst, getal met grenzen) en een tabel per poort / groep / uitgang.
- Per kolom zet een "alle"-knop dezelfde waarde op elke rij. Wijzigingen blijven klaar staan (gemarkeerd) tot je op Toepassen drukt; risicovolle of apparaatspecifieke instellingen zijn gemarkeerd.
- Naar andere apparaten sturen: kopieer je klaargezette wijzigingen, of hele onderdelen van één apparaat, in één keer naar zoveel apparaten van hetzelfde soort als je wilt (alleen waar ze verschillen; namen, adressen en risicovolle instellingen alleen als je die aanvinkt). Dit zet de wijzigingen klaar; Alles toepassen stuurt ze en elk apparaat wordt teruggelezen.
- Niet in deze editor: netwerkadres van de LumiNode, process-block-koppelingen buiten de bestaande poort-editor, software-upload, profielen en herstart-/reset-acties. Getest met gesimuleerde apparaten; controleer eerst op een echt apparaat.

### Versie 0.7.4 — 2026-10-04
- Trunk gerepareerd na het bekijken van een echte GigaCore 20t: zijn ingebouwde trunk (ISL) bevat alleen de ingebouwde VLAN-groepen, dus een VLAN-groep uit het plan (zoals 1090) ontbrak op de fibre. PatchLab voegt de groepen uit het plan nu aan die trunk toe, laat de untagged VLAN ervan met rust, controleert achteraf dat de trunk echt elke VLAN draagt en gebruikt anders een eigen trunk.
- De lampjes: de poortlampjes volgen de groepskleuren alleen in de voorpaneelstand "groups", dus de regenboog zet het daarop en weer terug, en er zijn knoppen Poorten tonen groepskleuren en Lampjes uit.
- De link van een poort is groen tenzij hij down is.

### Versie 0.7.3 — 2026-10-04
- Trunk na elke wijziging gecontroleerd: zegt de switch ok op "poorten aan een trunk toewijzen" maar zit een poort niet in de trunk, dan probeert PatchLab de andere gedocumenteerde manier (poort voor poort), logt wat de switch per poort meldt en zegt het als het nog steeds niet lukte.
- Regenboogstroom voor de lampjes van de switch: de regenboog loopt een paar seconden als een golf langs de groepen (stoppen kan altijd) en daarna komen de oude kleuren terug. Poorten volgen de kleur van hun groep, dus een losse poort kan geen eigen kleur krijgen zonder naar een andere groep te verhuizen.

### Versie 0.7.2 — 2026-10-04
- Trunk herzien: fibre-poorten gaan nu in de ingebouwde trunk van de switch zelf (die elke VLAN voert) in plaats van een trunk van ons, zodat het zich gedraagt als een trunk die op de switch zelf is gemaakt. De trunk wordt onder de poorten in woorden getoond (poorten, VLAN's, untagged VLAN, aanpasbaar), de pagina herkent of een switch groepsnummers of VLAN-id's opsomt, waarschuwt voor advanced-modus (met een knop naar Luminex-modus) en toont per poort wat de switch zelf zegt.
- Elke aanroep naar een switch wordt bijgehouden: onder Laatste aanroepen naar dit apparaat zie je (en kopieer je) elke aanroep en het antwoord, zodat een weigering door de switch meteen zichtbaar is.
- Regenboog voor de lampjes van de switch: een Regenboogshow laat de kleuren van het voorpaneel van rood → magenta lopen en gaat terug, en Regenboogkleuren op de groepen geeft elke gebruikte groep een eigen kleur van links naar rechts (met Kleuren terug). De poortlampjes volgen de kleur van hun groep; een losse poort kan geen eigen kleur krijgen.

### Versie 0.7.1 — 2026-10-04
- Trunk gerepareerd: fibre-poorten gaan nu in de trunk met de eigen aanroep van de switch "poorten aan een trunk toewijzen" (in plaats van een gewoon groepslidmaatschap), de trunk voert alle VLAN's van het plan met het beheer-VLAN untagged, en de switch wordt teruggelezen ter controle.
- Niets wordt meer afgekapt: poorttegels zijn groter, namen lopen over twee regels en tonen richting, protocol en VLAN / universe duidelijk.
- LumiNode, alles per poort: naam, richting (uitgang / ingang / uit), protocol (sACN of Art-Net) en universe, met de kwast of per poort. Art-Net-universe 10 wordt nu als 10 gestuurd en de node toont 10 (de verschuiving met één wordt alleen gebruikt als je die kiest). Een richting of protocol veranderen bouwt de nieuwe ingang / uitgang en koppelt die via het process block, met elke stap in het voorbeeld.
- E-ink-display van de GigaCore 20t: toon je eigen tekst of een afbeelding (JPG, PNG …, geschaald naar de display, zwart-wit, gedithered), stuur het eerst als voorbeeld en toon het dan; terug naar de standaardweergave, IP-adres verbergen, QR-code tonen.

### Versie 0.7.0 — 2026-10-04
- Nieuwe pagina Netwerkconfig: al je LumiNodes en GigaCore-switches op één pagina. Ontdekken vindt ze in één keer via de web-API (het hele netwerk van deze computer, of een bereik dat je typt), koppelt elk aan een switch of node uit het plan en leest hem uit.
- Switches klappen open tot hun poorten. Kies een VLAN en klik of sleep over poorten om ze dat VLAN te geven, zoals in Araneo; klik op een poort voor naam, PoE en snelheid; fibre-poorten gaan in de trunk Fibre. Een VLAN uit het plan dat de switch nog niet heeft wordt voor je aangemaakt.
- LumiNodes klappen open tot hun DMX-poorten: kies een universe en klik op poorten (de volgende klik kan het volgende universe geven) en geef de poorten een naam. Nieuwe ingangen zijn sACN. Alles wordt gestuurd na een voorbeeld van elke aanroep, per apparaat of allemaal tegelijk, en teruggelezen ter controle.
- De apparaten heten LumiNode en GigaCore, niet meer Art-Net-node; herkennen en schrijven volgen hoe de nodes echt antwoorden (aanroep van de softwareversie, IO 100000 = poort 1, de hele IO teruggestuurd met rdm_universe, de uitgang aan zijn process block gekoppeld). Het oude venster Apparaten op het netwerk is vervangen door deze pagina.

### Versie 0.6.2 — 2026-10-04
- Ontdekken: één overzicht van alle Luminex-switches en -nodes op het netwerk (scan van de netwerken van deze computer of een bereik dat je typt, plus Art-Net-nodes), elk automatisch gekoppeld aan een switch of node uit het plan op IP-adres en daarna op naam, met een knop om hem te openen.
- GigaCore-switches, poort voor poort: de knop Poorten… bij een switch opent een tabel waarin je per poort de naam, het VLAN / de groep (een VLAN uit het plan dat de switch nog niet heeft wordt voor je aangemaakt), PoE aan of uit en de snelheid instelt. Gewijzigde rijen zijn gearceerd, alleen de gewijzigde poorten worden gestuurd en de switch wordt teruggelezen ter controle.

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
- Racks per DimCity met automatische LK37- / Veam4-patching, nodekleuren, adviezen en "Gebruik als netwerkplan".
- Overal zoeken met Cmd/Ctrl+K.
- Ongedaan maken / opnieuw met leesbare geschiedenis, oplosbare validatiemeldingen, automatisch opslaan, back-ups en crashherstel.
- Rapportbouwer: tabblad huisstijl met logo en watermerk, verplaatsbare voorbladafbeelding.
- Device Builder met nodes, splitters, switches, panelen en racks; persoonlijke devicebibliotheek gedeeld tussen shows.

### Versie 0.1.0 — 2026-10-01
- Eerste release: CSV-import, LK- / Veam- / DMX-validatie per DimCity, Veam-koppelingen, bloktypes, netwerkplanner, PDF-rapportbouwer met templates.
