# Architecture

```text
UI (lib/ui)            NodesScreen → NodeScreen → PortScreen → AlignScreen → ModeScreen
                       → AddressScreen → OverviewScreen; FixtureScreen; SettingsScreen
      │ ListenableBuilder
App (lib/app)          Settings (prefs)   AppBackend (nodes, Program, routeFor)   PortSession (flow per port)
      │
Services (lib/services) ArtNetService ── ArtNetRdmTransport ─┐
                        RdmnetService / BrokerConnection ── RdmnetTransport ─┤→ RdmClient (GET/SET, retries)
                        sim/FakeArtNetNode (tests + demo)                    ┘
      │
Core (lib/core)        artnet/ rdm/ rdmnet/ addressing/ – pure codecs and calculations
      │
Net (lib/net)          RawUdpSocket, LocalNetwork, MulticastLock
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
* **Demo mode** starts `FakeArtNetNode` on the loopback interface; the app
  talks to it over the very same UDP path as to a real node.
