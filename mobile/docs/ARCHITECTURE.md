# Architecture

```text
UI (lib/ui)            HomeShell: LampsScreen | NodesScreen → NodeScreen → PortScreen
                       FixtureListPane → AlignScreen → ModeScreen → AddressScreen → OverviewScreen;
                       FixtureScreen; SettingsScreen
      │ ListenableBuilder
App (lib/app)          Settings (prefs)   AppBackend (nodes, Program, routeFor)   PortSession (flow per port)
      │
Services (lib/services) LlrpService ── LampsTransport ───────────┐
                        ArtNetService ── ArtNetRdmTransport ─┤
                        RdmnetService / BrokerConnection ── RdmnetTransport ─┤→ RdmClient (GET/SET, retries)
                        sim/FakeArtNetNode (tests + demo)                    ┘
      │
Core (lib/core)        artnet/ rdm/ rdmnet/ addressing/ – pure codecs and calculations
      │
Net (lib/net)          RawUdpSocket, MemoryUdpHub (demo, tests), LocalNetwork, MulticastLock
```

* **Core** has no Flutter or socket code; everything is unit-tested with
  byte layouts from the standards.
* **Services** own sockets and timing. `RdmTransport` is the one interface
  the flow talks to: `discover()` and `exchange(request)`; Art-Net and
  RDMnet implement it, and `RdmClient` adds the E1.20 response handling.
* **AppBackend** builds the node list from ArtPollReply pages and RDMnet
  gateways (merged on IP / MAC), runs *Program* (ArtAddress + verification)
  and decides the route per port.
* **PortSession** is one state machine per opened port: discovery →
  details → align (identify one at a time) → modes per type → plan
  (`computePlan`) → send + verify + retry.
* **Demo mode** puts the app's sockets on a `MemoryUdpHub` (an in-memory network with unicast, broadcast
  and multicast) with a simulated node (`FakeArtNetNode`) and a simulated lamp row (`FakeRdmnetLamps`). The
  services run unchanged; no operating system socket, adapter or firewall is involved.
