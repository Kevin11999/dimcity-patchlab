# DimCity PatchLab RDM (mobile)

Native app (Flutter) for Windows, macOS, Android and iPhone for the lighting technician on site: plug in a row of
RDMnet lamps and address them, or go through an Art-Net / sACN node (Luminex, ELC). The app finds the lamps, makes
them blink one by one so you set the order, lets you choose a mode per lamp type, calculates every address, sends and
verifies it, and offers a retry per lamp. It also renames, inspects (hours, temperature, software) and resets a lamp.

The lamps on a cable are reached with **LLRP** (RDMnet, no configuration). Behind a node RDM runs over **Art-Net**
(ArtRdm, also for ports that output sACN, which is what LumiNode and dmXLAN do) or over **RDMnet** through a broker. The
technician does not see the difference. Details and assumptions: [docs/PROTOCOLS.md](docs/PROTOCOLS.md).
Platform notes (Windows, iOS multicast entitlement, Android multicast lock): [docs/PLATFORM.md](docs/PLATFORM.md).

## Install on Windows (test build)

1. Download `PatchLab-RDM-Setup-<version>-b<n>.exe` from the **Releases** page (pre-release `mobile-v…`),
   or from GitHub → Actions → *Mobile* → latest run → **Artifacts** → `PatchLab-RDM-windows` (a zip with the installer
   and a portable zip).
2. Run it. The installer is not code-signed, so SmartScreen shows *Windows protected your PC*:
   click **More info**, then **Run anyway**.
3. The installer adds a Start menu shortcut (and optionally a desktop icon) and a Windows Firewall rule that lets
   the app receive Art-Net replies (UDP, all network profiles). Without it the node list stays empty.
4. **Lamps (RDMnet)**: plug the lamps' network cable into the laptop and open the app. Nothing to set. Wait for
   Windows to recognise the network (up to a minute); if the cable has no DHCP server both sides use 169.254.x.x.
   **Nodes (Art-Net)**: connect the laptop to the node's network, by cable or Wi-Fi, **in the node's IP range**
   (Luminex / ELC default to 2.x.x.x or 10.x.x.x with mask 255.0.0.0): give that adapter a fixed IP such as
   2.0.0.200. The app looks on every adapter. The *This device* line shows them, with `~` before the prefix when
   Windows did not tell the real mask and the app guessed it from the address.
5. No node at hand? Settings → **Demo mode**.

Needs Windows 10 or 11, 64-bit. The Visual C++ runtime is included in the installer. Uninstall through
Windows Settings → Apps; that also removes the firewall rule. To build it yourself you need Windows with
Visual Studio 2022 (Desktop development with C++): `flutter build windows --release`, then compile
`windows/installer/patchlab_rdm.iss` with Inno Setup 6.

## Install on macOS (test build)

1. Download `PatchLab-RDM-<version>-macos.dmg` from the latest pre-release (*mobile-v...*) and drag **PatchLab RDM** to Applications.
2. The app is not notarized (no Apple developer certificate), so macOS blocks the first start. Open
   *System Settings, Privacy & Security*, scroll down and press **Open Anyway**; or run once in Terminal:
   `xattr -dr com.apple.quarantine "/Applications/PatchLab RDM.app"`.
3. macOS asks for **Local Network** access: choose *Allow*. Without it macOS silently refuses every packet to the network
   (*Privacy & Security, Local Network* to switch it on later). If the macOS firewall asks about incoming connections
   (the app is the RDMnet broker for the lamps), choose *Allow*.
4. Plug the lamps' cable in and open the **Lamps** tab; pick the adapter (`en...`, USB-Ethernet or Thunderbolt) if
   there are several. A cable without DHCP gives both sides 169.254.x.x within about half a minute.

Needs macOS 12 or newer, Apple Silicon or Intel (universal build). Built in CI on a Mac runner; not tested on a real Mac yet.

## Install on iPhone / iPad (test build, not signed)

Apple only runs signed apps and there is no Apple developer account behind this project, so the iOS build is an **unsigned
`.ipa`** (`PatchLab-RDM-<version>-ios-unsigned.ipa` in the pre-release):

1. Install it with **Sideloadly** or **AltStore** and your own Apple ID (free: the app runs for 7 days, then install again).
   With a paid developer account you can also open `mobile/ios` in Xcode and run it on the phone with your team.
2. On first start iOS asks for **Local Network** access: choose *Allow*.
3. iOS only lets an app send and receive broadcast and multicast with Apple's **Multicast Networking** entitlement
   (`com.apple.developer.networking.multicast`, in `ios/Runner/Runner.entitlements`). Apple grants it on request to paid accounts
   (https://developer.apple.com/contact/request/networking-multicast). The unsigned build carries no entitlement, and a free
   Apple ID cannot get one: expect that finding lamps by broadcast or multicast does **not** work on an iPhone then. Windows and
   macOS do not have this limit.

## Install on Android (test build)

1. Get the APK: GitHub → Actions → *Mobile* → latest run → **Artifacts** → `PatchLab-RDM-apk`
   (a zip with the `.apk`), or, for builds from `main` and manual runs, the **Releases**
   page (pre-release `mobile-v…`). Open the link in the phone's browser while logged in to GitHub.
2. Open the `.apk`. Android asks to allow *install unknown apps* for the browser: allow it for this once.
3. Put the phone on the same Wi-Fi as the node **and in the node's IP range** (Luminex / ELC
   default to 2.x.x.x or 10.x.x.x with mask 255.0.0.0): set a static Wi-Fi IP such as 2.0.0.200.
4. No node at hand? Settings → **Demo mode** starts a simulated node in the app.

Needs Android 7 (API 24) or newer and a 64-bit (arm64) phone, which is every phone of the last years. Builds are signed with a fixed *test* key kept in the
repository (`android/app/test-release.keystore`), so each new build installs as an update over the
previous one. Anyone with the repository can sign with it: replace it with a private key before
any store release.

Build it yourself: `flutter build apk --release --target-platform android-arm64 --split-per-abi` (needs the Android SDK and JDK 17+).

## The easy way: lamps on the cable

1. Plug the network cable of the lamp row into the laptop. No node, no router, no IP setting.
2. Open the app. The **Lamps** tab searches by itself and lists every lamp with its name, mode and address.
3. **Start addressing**: the lamps blink one at a time, you press **Align** when it is the next one in the row
   (**Skip** tries another one, the arrow steps back, drag to change the order afterwards).
4. One **mode** per lamp type, a **start address**, and the app calculates every next address
   (previous address + channels of the previous lamp). A lamp that no longer fits in the 512 channels stops the plan
   and asks: next universe on 1, or adjust. A bar shows how the 512 channels are filled.
5. **Send**: every lamp is read back and marked verified; a lamp that does not take it gets its own retry.
6. Tap a lamp for the rest: rename, identify, set address or mode, info (hours, temperature, software), reset.

Lamps that speak **Art-Net** themselves (they answer ArtPoll, sit on 2.x.x.x or 10.x.x.x, set to *Art-Net* or *Auto*) are found
in the same list: ArtPoll goes out of every network adapter, the lamp's UID comes from its poll reply or Table of Devices, and RDM
goes unicast inside your subnet and by broadcast outside it. Give your laptop an extra address in the lamps' range (for example
2.0.0.100 / 255.0.0.0); the Lamps tab tells you when it is needed and has an **Add address** button (Windows: UAC prompt, macOS: administrator password) or copies the command.
When nothing is found, the tab lists what the app saw in plain words (adapters, port 6454, polls sent, packets received) and **Copy diagnostics** copies all of it. See [docs/PROTOCOLS.md](docs/PROTOCOLS.md) section 0a.

For RDMnet lamps it works because they answer **LLRP** (ANSI E1.33): a multicast search that needs nothing configured. Two
devices on one cable both fall back to link-local addresses (169.254.x.x) and find each other.
On top of that the app is the **RDMnet broker** for the lamps when no other broker is on the network (DNS-SD
advertisement, TCP broker), so lamps that look for a broker connect by themselves; LLRP remains as the fallback.
The Lamps tab shows which network adapter is used (default: all) and whether the app is the broker, and has a
"Copy diagnostics" button for when nothing is found. See [docs/PROTOCOLS.md](docs/PROTOCOLS.md).

**Demo mode** (Settings, or the button when no lamps are found) simulates a row of eight lamps and a node, all inside
the app on an in-memory network, so the flow can be tried without hardware and without any network.

## The other way: nodes

The **Nodes** tab is for Art-Net / sACN nodes (Luminex, ELC) with DMX ports and RDM behind them:

1. **Nodes**: ArtPoll broadcast; name, IP, ports. Own IP / subnet on top; a node in another IP range is marked.
2. **Ports**: universe, Art-Net / sACN, RDM on / off per port. Nothing is sent until **Program**; the node's
   ArtPollReply confirms, or the app says exactly which field it did not take over.
3. Tap a port: RDM discovery (ArtTodControl / ArtTodRequest), then the same list and the same addressing steps as above.

## Layout

```text
lib/core/        pure Dart protocol layer, no Flutter
  bytes.dart, uid.dart
  rdm/           E1.20 message codec, PIDs, parameter codecs (E1.37-7, E1.33 too)
  artnet/        ArtPoll, ArtPollReply, ArtAddress, ArtTodRequest/Data/Control, ArtRdm
  rdmnet/        ACN root layer, Broker protocol, RPT, LLRP codecs
  addressing/    the address calculation (start, footprints, 512 limit, wrap)
lib/net/         UDP sockets (real and in-memory), own IP / subnet, Android multicast lock
lib/services/    LlrpService + LampsTransport (the lamps on the cable), LampBroker (BrokerServer + MdnsResponder),
                 ArtNetService, RdmClient
                 (ACK_TIMER / ACK_OVERFLOW / NACK / retries), RdmnetService + BrokerConnection,
                 simulated node and lamps (sim/)
lib/model/       Node / NodePort, Fixture / FixtureType
lib/app/         Settings, AppBackend (merges Art-Net + RDMnet nodes, Program), PortSession (the flow)
lib/ui/          theme, shared widgets, one screen per step (Lamps tab, wizard, fixture, Nodes tab)
lib/l10n/        Dutch (default) and English texts
test/            codec tests, tests against the simulated node and lamps, the full flow through the UI;
                 `SCREENSHOTS=dir flutter test test/screenshots` renders every screen to PNG
```

## Developing

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter run
```

Flutter 3.47 / Dart 3.13. Dependencies: `multicast_dns`, `network_info_plus`,
`shared_preferences`.
