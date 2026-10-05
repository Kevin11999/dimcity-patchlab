# Protocols: how the app reaches the fixtures

Four routes, from easiest to most involved: lamps that speak **Art-Net** themselves (section 0a), **LLRP** and a broker for RDMnet lamps (section 0),
**RDM over Art-Net** behind a node (sections 1 and 2) and **RDMnet through a broker** (section 3).

This document records what was researched for the RDM part and which
assumptions are built into the code. Read it before testing on real nodes.

## 0a. Lamps that speak Art-Net themselves (the Lamps tab)

Many lamps with a network port (Pixel Line IP, ACME Strobe 3 IP, ...) are Art-Net nodes with RDM of their own: they answer ArtPoll,
sit on **2.x.x.x or 10.x.x.x** (a factory address derived from the MAC) and must be set to *Art-Net* or *Auto*. This is the route
that was written down for an app that works on a real rig, and the lamp search follows it (`LampsTransport`,
`ArtNetService`; test: `test/services/art_lamps_test.dart`):

1. **ArtPoll out of every adapter.** A socket on 0.0.0.0 sends from the primary adapter only, and a lamp on 2.x never hears a poll
   that leaves from 192.168.x. So the service keeps one socket per adapter address (bound to that address and port 6454) and sends the
   poll out of each: to the directed broadcast of that adapter **and** to 255.255.255.255. The listening socket stays on
   `0.0.0.0:6454`, otherwise broadcast answers do not come in; the same packet reaching two sockets is handled once.
   Wait 1.2 s for the ArtPollReply (two polls, 0.6 s apart).
2. **Table of Devices**: ArtTodRequest per port address from the replies (no flush), for ports with RDM on; a node without ports (a lamp)
   is asked on its Net / Sub-Net address. UIDs come from the ArtTodData **and** from the *DefaultResponderUid* in the ArtPollReply
   (offset 218): when it is not zero the node is the lamp itself.
3. **RDM in ArtRdm without the 0xCC start code**: the payload begins with 0x01; length and checksum still count the start code. Some
   lamps only answer that form; when decoding both forms are accepted.
4. **Unicast only inside our subnet.** ArtRdm and TOD go unicast to a node in a subnet of one of our adapters (the mask is guessed
   from the address class, desktops do not tell it). For a node outside every subnet, or after a unicast timeout, they are broadcast out of every
   adapter; the answer is matched on UID, not on the sender's IP. ArtAddress (programming a node) is never broadcast.
5. The controller UID is a prototype UID (`7FF0:xxxxxxxx`, never a product UID); reads: DEVICE_INFO, labels, DMX_PERSONALITY,
   DMX_START_ADDRESS. DEVICE_INFO refused or shorter than 19 bytes: DMX_START_ADDRESS alone is enough to list the lamp (footprint
   unknown = 1 channel); both refused: the UID is skipped, no empty fixture is made up. Writes are SET followed by a GET.

**The laptop needs an address in the lamps' range** (an alias next to its own address works): without one the lamps' broadcast answers
may never reach the app. The Lamps tab says so ("outside our subnets") and copies the command that adds the address, e.g.
`netsh interface ip add address "Ethernet" 2.0.0.100 255.0.0.0` (Windows, as administrator) or `sudo ifconfig en7 alias 2.0.0.100 255.0.0.0` (macOS).
The Add address button runs `netsh interface ipv4 add address` through an elevated PowerShell (Windows) or `ifconfig ... alias` through AppleScript
with administrator privileges (macOS); the adapter name is checked before it goes into a command (`lib/net/add_address.dart`; the Windows and macOS
paths are covered by tests of the command lines only, not run on those systems). On the Lamps tab `lib/app/lamp_diagnosis.dart` turns the
adapter list, the Art-Net socket state, the polls sent and the datagrams received (`ArtNetService.received`) into plain-language findings.
**A lamp by IP and UID** (`lib/services/direct_lamp.dart`): `probeDirectLamp` makes a node entry for the IP (`ArtNetService.attachNode`),
polls it (unicast, or broadcast out of every adapter when the IP is in no subnet of ours), takes the port addresses from its reply
(`rdmAddresses`) and then Net 0 / Sub-Net 0 / Universe 0 to 15, and sends DEVICE_INFO to the UID in ArtRdm on each until one answers
(600 ms each). The address that answered goes into the route; `LampsTransport.addManual` keeps the lamp in every later search.

**Universe and IP over the network** (`lib/services/lamp_network.dart`). Neither is an RDM parameter of the lamp (E1.20 has only
DMX_START_ADDRESS; E1.37-7 ENDPOINT_TO_UNIVERSE is for the DMX ports of a node; E1.37-2 has IPV4_STATIC_ADDRESS 0x0706 and friends,
which a lamp only has if it lists them in SUPPORTED_PARAMETERS). For a lamp that is an Art-Net node: the universe is **ArtAddress**
(Net, Sub-Net, SwOut of the port) and is verified in the ArtPollReply that follows; the IP address and subnet mask are **ArtIpProg**
(OpIpProg 0xF800; command 0x80 | 0x04 IP, | 0x02 mask, 0x00 = enquiry) verified in the ArtIpProgReply (0xF900). ArtIpProg goes unicast
only (a broadcast would reprogram every node), so it needs an address of the laptop in the lamp's range. A node that does not
support remote IP programming does not answer; ACME's Pixel Line IP manual (version I) lists IP address, subnet mask, Art-Net
Net / Sub-Net / Universe and sACN universe only as menu items on the lamp and no network PID in its RDM table, so whether such a lamp
answers is found out on site: the app reports "no answer" or "not taken over" and changes nothing. "Own RDM settings" shows
SUPPORTED_PARAMETERS and, for PIDs 0x8000-0xFFDF, PARAMETER_DESCRIPTION (name, data type, GET / SET, range) and the current value.
Lamps found both ways (RDMnet and Art-Net) are one lamp; the route that worked last is asked first, the others are the fallback.

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

### The broker: lamps connect by themselves (`lib/services/lamp_broker.dart`)

RDMnet is meant to run with a **broker**. Lamps do not wait for a user: they look for a broker of scope `default`
with DNS-SD and connect to it over TCP. The app therefore does what a console does:

1. Look for a broker that is already on the network (mDNS browse `_rdmnet._tcp`, scope `default`). If there is one,
   connect to it as a controller (`RdmnetService`, `BrokerConnection`).
2. Otherwise **be the broker**: `BrokerServer` (`lib/services/broker_server.dart`, ANSI E1.33 Broker protocol on a TCP
   port the system picks) plus `MdnsResponder` (`lib/services/mdns_responder.dart`, `lib/core/dns.dart`) that
   advertises `PatchLab RDM Broker xxxx._rdmnet._tcp.local` with subtype `_default._sub._rdmnet._tcp` and the TXT keys
   `TxtVers=1`, `E133Scope`, `E133Vers`, `CID`, `UID`, `Model`, `Manuf`. The app connects to its own broker over
   127.0.0.1 as a controller. Lamps that connect get a UID (their own static one, or a dynamic one from the broker's
   range when they ask for one) and show up in the client list.
3. **LLRP stays on**, as the fallback and as the way to see lamps before they have joined the broker. A lamp that is on the
   broker and answers LLRP is **one lamp**: both views are matched on the lamp's **CID**, because the UID LLRP reports
   can differ from the broker-assigned one (seen with ETC's reference device: dynamic UID requested from the broker
   versus the LLRP UID). RDM goes through the broker (RPT Request / Notification) and falls back to LLRP when the
   broker route times out; the UID of either view addresses the lamp (`LampsTransport`).

Wire details verified against ETC's RDMnet reference implementation (built and run in the test environment, see
`test/interop/`): the RPT Request and Notification PDUs carry a **4-byte** vector, the RPT header is 28 bytes with a
reserved byte, all flags are 0xF0. Interop that was run: LLRP discovery and RDM, our controller with ETC's broker and
device, ETC's device on our broker, ETC's device finding our broker with mDNS with nothing configured, and the whole
`LampsTransport` against that device. What is **not** verified: real fixtures, a real Windows machine (port 5353 is
shared with the Windows DNS client), and DMX address / personality over RPT on a real fixture (the ETC example device has
no DMX footprint). If the broker route does not work on site, LLRP still addresses the lamps.

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
