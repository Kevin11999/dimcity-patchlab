# Protocols: how the app reaches the fixtures

Three routes, from easiest to most involved: **LLRP** straight to RDMnet lamps (section 0), **RDM over Art-Net**
behind a node (sections 1 and 2) and **RDMnet through a broker** (section 3).

This document records what was researched for the RDM part and which
assumptions are built into the code. Read it before testing on real nodes.

## 0. Lamps straight on the cable: LLRP (the Lamps tab)

RDMnet lamps need no node. The app uses **LLRP**, the *Low Level Recovery Protocol* of ANSI E1.33, which every
RDMnet component must answer and which needs no configuration at all (`lib/core/rdmnet/llrp.dart`,
`lib/services/llrp_service.dart`):

* **Probe**: a Probe Request to the multicast group 239.255.250.133 on UDP 5569, UID range 0 to FFFF:FFFFFFFF.
  Every component answers with a Probe Reply (UID, MAC, component type) to 239.255.250.134 after a random delay of
  up to 1.5 s. The next probe lists the UIDs already known (up to 200) so those stay quiet; probing stops when a
  round finds nothing new. Only RPT *devices* are listed as lamps; brokers and controllers are ignored.
* **RDM**: an LLRP RDM Command PDU (vector 0xCC, the RDM message from the sub-start code) to the lamp's CID, answered the
  same way. All RDM the app needs (DEVICE_INFO, personalities, DMX_START_ADDRESS, IDENTIFY_DEVICE, DEVICE_LABEL,
  sensors, RESET_DEVICE) goes this way, through the same `RdmClient` as the other routes.
* **No IP setup**: with no DHCP server both the laptop and the lamps fall back to link-local addresses (169.254.x.x),
  and multicast works there. The app joins the LLRP group on **every** adapter and sends each probe out of every
  adapter (IP_MULTICAST_IF), because a laptop has several and the operating system would pick one.
  Windows needs up to a minute after plugging in before the adapter has its address.
* Components that answer but have no DMX channels (a node, a console) are listed dimmed and never addressed.

**Assumption to verify on real lamps.** The standard requires LLRP targets to answer a minimal set of RDM parameters
(SUPPORTED_PARAMETERS, DEVICE_INFO, labels, IDENTIFY_DEVICE and the E1.33 network parameters). Whether a lamp also
answers DMX_START_ADDRESS and DMX_PERSONALITY over LLRP depends on its firmware; libraries such as ETC's RDMnet route
LLRP commands to the same handler as normal ones, so most lamps do. If a lamp is found but does not answer, the fix is
a broker, see below.

## 1. Node discovery and port configuration: Art-Net 4

* **ArtPoll / ArtPollReply** (`lib/core/artnet/artnet.dart`). The app broadcasts
  ArtPoll to `255.255.255.255`, `2.255.255.255`, `10.255.255.255` and the
  directed broadcast of the phone's own subnet, and listens on UDP 6454 for
  ArtPollReply. Every reply describes up to 4 ports; a node with more ports
  sends one reply per *bind index* (page). Physical port number =
  `(page - 1) * 4 + index + 1`.
* Per port the reply tells: Port-Address (Net.Sub-Net.Universe, 15 bit),
  **GoodOutput bit 0** (set = port outputs sACN, clear = Art-Net),
  **GoodOutputB bit 7** (set = RDM disabled), data flowing, merge state.
* **ArtAddress** programs a node: Net / Sub-Net / Universe per page, names and
  one *command* per packet. Protocol and RDM per port are switched with
  the Art-Net 4 commands `AcArtNetSel0-3` (0x60–0x63), `AcAcnSel0-3`
  (0x70–0x73, "DMX from sACN, RDM from Art-Net"), `AcRdmEnable0-3` (0xC0–0xC3)
  and `AcRdmDisable0-3` (0xD0–0xD3). The node answers with ArtPollReply; the
  app compares that reply with what it asked for and reports "taken over" or
  exactly which field differs (`AppBackend.program`).
* Limits that follow from Art-Net: all 4 ports of one page share Net and
  Sub-Net; only the low 4 bits (Universe) differ per port. The app validates
  edits against this (`AppBackend.validateEdits`).

### Assumption: sACN universe number of a port in sACN mode

Art-Net has no field for "the sACN universe of this port". When a port is
switched to sACN with `AcAcnSel`, the app assumes the node uses
`sACN universe = Port-Address + 1` (sACN universes start at 1, Port-Addresses
at 0). This is implemented in one place (`PortAddress.sacnUniverse`) and shown
in the UI as *derived*. When the node is also reachable over RDMnet, the
universe from `ENDPOINT_TO_UNIVERSE` wins. **Verify on a LumiNode and a dmXLAN
node and adjust the single constant if they map differently.**

### Assumption: where ArtPollReply goes

Nodes either broadcast ArtPollReply or unicast it to the poller. The app
accepts both (it listens on 0.0.0.0:6454). If the phone is in a different IP
range than the node, the node's reply never reaches the phone (its unicast
has no route, its directed broadcast is another subnet). That is why the
app shows the phone's own IP / mask prominently and warns when a node that
*is* seen lies outside the phone's subnet.

## 2. RDM over Art-Net (route 1)

* **ArtTodControl (AtcFlush)** → the node runs a fresh RDM discovery on that
  port. **ArtTodRequest** → the node answers **ArtTodData** (the Table of
  Devices: the UIDs on that DMX line, possibly in several blocks), or
  *TodNak* while discovery runs or RDM is off.
* **ArtRdm** carries one E1.20 message (without the 0xCC start code) to the
  node, which puts it on the DMX line; the fixture's answer comes back as
  ArtRdm. Matching is on transaction number, PID and UIDs
  (`ArtNetService.sendRdm`).
* The RDM client (`lib/services/rdm_client.dart`) handles ACK, NACK (with the
  reason), ACK_TIMER (waits, then polls QUEUED_MESSAGE) and ACK_OVERFLOW
  (repeats the GET and glues the data), with retries on silence.

### Luminex and ELC with sACN

Both brands keep RDM on Art-Net even when the port's DMX comes from sACN:

* Luminex (LumiNode): "Luminodes are currently not able to do RDM-Net. What
  they do, is send RDM via ArtNet (ArtRDM), on Request, even if they
  configured as sACN." (Q-Light, Obsidian forum, 24 Nov 2023,
  <https://forum.obsidiancontrol.com/t/control-rdm-using-external-app-with-rdm-net-while-using-sacn/7632>).
  The LumiNode manual (rev 2.4.1, DMX/RDM page) has per port **Enable RDM**,
  **Adaptive discovery** and an **ArtRDM universe**: "the universe which is
  used for ArtTOD and ArtRDM packets. By default, this will be matched to the
  Art-Net universe of the first Art-Net input of your process engine". It also
  has **RDM Controller IP**: when not 0.0.0.0, only that IP may change things
  through RDM. The phone must then be that IP, or the field must be 0.0.0.0.
* ELC dmXLAN nodes (node3, node8, nodeGBx 8, Buddy) are documented as
  Art-Net + sACN + ShowNet with RDM; no RDMnet support is documented.
  RDM goes over Art-Net (ArtRdm) here as well.
* This is exactly what Art-Net 4 describes: sACN for the live data, Art-Net
  for discovery, configuration and RDM (`AcAcnSel`: "DMX from sACN, RDM from
  Art-Net").

So on today's Luminex and ELC nodes the Art-Net route also serves sACN
ports. The app therefore always tries **Art-Net RDM first**, on the port's
Art-Net Port-Address, whatever protocol the port outputs.

## 3. RDMnet through a broker, ANSI E1.33 (route 2 for nodes)

Implemented as the second route for nodes that do not answer ArtRdm and do
speak RDMnet (future firmware, other brands). Code: `lib/core/rdmnet/`,
`lib/services/rdmnet_service.dart`.

* **Broker discovery**: DNS-SD browse for `_rdmnet._tcp` (TXT `ConfScope`,
  `E133Vers`, `CID`, `UID`, `Model`, `Manuf`), the scope from the settings
  (default `default`), or a broker entered by hand (ip:port).
* **LLRP** (UDP multicast 239.255.250.133 → 239.255.250.134, port 5569):
  Probe Request / Probe Reply finds RDMnet components (the node itself, a
  broker, controllers) with their CID, UID and MAC address. The app then reads
  `COMPONENT_SCOPE` over LLRP, which names the component's broker when it is
  statically configured. The MAC / IP from LLRP is used to merge the RDMnet
  view of a node with its Art-Net view.
* **Broker protocol over TCP**: Client Connect (scope, E1.33 version 1,
  search domain, RPT controller client entry) → Connect Reply → Fetch Client
  List → Connected Client List, NULL heartbeats every 15 s (timeout 45 s),
  incremental client add / remove / change.
* **RPT**: an RDM command is wrapped in RDM Command PDU → Request PDU → RPT
  PDU (source UID / endpoint, destination UID / endpoint, sequence number) →
  root layer. The gateway answers with a Notification PDU holding the
  original command and the response(s); ACK_OVERFLOW fragments arrive in one
  Notification and are glued. RPT Status codes (unknown UID, RDM timeout …)
  become exceptions.
* **Gateway endpoints (ANSI E1.37-7)**: `ENDPOINT_LIST` on the gateway's
  default responder (endpoint 0), `ENDPOINT_TO_UNIVERSE` (sACN universe of a
  port) and `ENDPOINT_RESPONDERS` (the UIDs on that port; the gateway runs the
  discovery itself). Fixtures are addressed with destination endpoint = that
  endpoint and the fixture's UID.
* The controller uses a static UID in the ESTA prototyping range
  (0x7FF0:xxxxxxxx, generated once) and a random CID. Replace the
  manufacturer ID with a registered ESTA ID for a public release.

RDMnet could not be tested against hardware in this environment: the codecs
are unit-tested against the standard's byte layouts (see `test/core/rdmnet_test.dart`),
the broker / RPT flow has not run against a real broker yet. ETC's open
RDMnet broker (<https://github.com/ETCLabs/RDMnet>) is the obvious test target.

## 4. Choosing the route

The **Lamps** tab always uses LLRP (section 0). For a DMX port on the **Nodes** tab:

`AppBackend.routeFor`:

1. Node seen through Art-Net and RDM enabled on the port → Art-Net RDM,
   with RDMnet as fallback when the node does not answer ArtTodRequest.
2. Otherwise, node has an RDMnet endpoint for that port → RDMnet, with
   Art-Net as fallback.
3. Otherwise Art-Net anyway (so the error message comes from the node).

The route is shown as a small badge ("via Art-Net" / "via RDMnet"); the
screens are the same.

## 5. Sources

* Art-Net 4 specification, Artistic Licence (ArtAddress command table:
  `AcArtNetSel`, `AcAcnSel`, `AcRdmEnable`, `AcRdmDisable`; ArtPollReply
  GoodOutput / GoodOutputB; ArtTod*, ArtRdm). Command values were cross-checked
  with the Go implementation `github.com/jwetzell/artnet-go`.
* ANSI E1.20-2010 (RDM), ANSI E1.33-2019 (RDMnet), ANSI E1.37-7 (gateway
  endpoints). Constants cross-checked with ETC's `RDMnet/include/rdmnet/defs.h`
  and OLA's `ACNVectors.h`, `E133Enums.h`, `RDMEnums.h`.
* Luminex LumiNode user manual rev 2.4.1 (DMX/RDM page).
* Obsidian Control forum thread on RDM with sACN (Luminex and NETRON answers).
