# DimCity PatchLab RDM (mobile)

Native iPhone / Android app (Flutter) for the lighting technician on site:
find Luminex / ELC nodes on the Wi-Fi, see and program their ports, run RDM
discovery per port, align the fixtures by making them blink one by one,
choose a mode per fixture type, let the app calculate every address, send
and verify, retry per fixture. Rename, inspect (hours, temperature, software)
and reset a fixture.

RDM runs over **Art-Net** (ArtRdm; also for ports that output sACN, which is
what LumiNode and dmXLAN do) and over **RDMnet** (E1.33: LLRP, broker, RPT,
E1.37-7 endpoints) as the second route. The technician does not see the
difference. Details and assumptions: [docs/PROTOCOLS.md](docs/PROTOCOLS.md).
Platform notes (iOS multicast entitlement, Android multicast lock):
[docs/PLATFORM.md](docs/PLATFORM.md).

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

## Flow

1. **Nodes** – ArtPoll broadcast; list with name, IP, ports and the
   Art-Net / RDMnet badges. Own IP / subnet on top; a node in another IP
   range is marked and explained.
2. **Ports** – universe, Art-Net / sACN, RDM on / off per port. Nothing is
   sent until **Program**; the node's ArtPollReply confirms or the app says
   exactly which field it did not take over.
3. **Discovery** – tap a port: ArtTodControl flush, ArtTodRequest, then
   DEVICE_INFO, model, manufacturer, label and personalities per fixture.
4. **Align** – one unplaced fixture blinks (IDENTIFY_DEVICE); **Align**
   puts it on the next position, **Skip** tries another one, **Step back**
   undoes; the order can be dragged afterwards.
5. **Modes and addresses** – one mode per fixture *type*; start address;
   every next address = previous + footprint. A fixture that no longer fits
   in the universe stops the plan and asks: next universe on 1, or adjust.
   Overview, **Send**, then every fixture is read back; a failed one gets its
   own **Retry**.
6. **Fixture** – rename (DEVICE_LABEL), info (DEVICE_HOURS, LAMP_HOURS,
   SENSOR_VALUE temperature, SOFTWARE_VERSION_LABEL), reset with confirmation.

**Demo mode** (Settings, or the button on an empty node list) starts a
simulated 8-port node inside the app with the fixtures from the example
(2× ProWash 300, 1× MiniSpot 60 on port 1), so the whole flow can be tried
without hardware.

## Layout

```text
lib/core/        pure Dart protocol layer, no Flutter
  bytes.dart, uid.dart
  rdm/           E1.20 message codec, PIDs, parameter codecs (E1.37-7, E1.33 too)
  artnet/        ArtPoll, ArtPollReply, ArtAddress, ArtTodRequest/Data/Control, ArtRdm
  rdmnet/        ACN root layer, Broker protocol, RPT, LLRP
  addressing/    the address calculation (start, footprints, 512 limit, wrap)
lib/net/         UDP socket wrapper, own IP / subnet, Android multicast lock
lib/services/    ArtNetService, RdmClient (ACK_TIMER / ACK_OVERFLOW / NACK / retries),
                 RdmnetService + BrokerConnection, simulated node (sim/)
lib/model/       Node / NodePort, Fixture / FixtureType
lib/app/         Settings, AppBackend (merges Art-Net + RDMnet nodes, Program), PortSession (the flow)
lib/ui/          one screen per step
lib/l10n/        Dutch (default) and English texts
test/            codec tests, loopback tests against the simulated node, the full flow
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
