# Platform notes: native app, UDP, multicast

The app is a Flutter app: one Dart code base compiled to a native iOS and
Android app. Reasons for this choice over Swift + Kotlin or React Native:

* `dart:io` has first-class UDP (`RawDatagramSocket`: bind with port reuse,
  broadcast, `joinMulticast`) and TCP sockets, so Art-Net, LLRP, mDNS and the
  RDMnet broker connection need no third-party native module.
* The protocol layer is plain Dart: it runs in unit tests on a laptop or in
  CI without a device, against a simulated node over loopback UDP
  (`lib/services/sim/fake_artnet_node.dart`). The same simulation is the
  app's demo mode.
* One UI for both platforms, native compiled, with the two platform-specific
  bits (Android multicast lock, iOS entitlement) kept tiny.

## iOS

* **Multicast entitlement** `com.apple.developer.networking.multicast` is in
  `ios/Runner/Runner.entitlements`. Since iOS 14 an app needs it to send or
  receive **broadcast** (ArtPoll / ArtPollReply) and **multicast** (LLRP, mDNS)
  packets. It has to be requested from Apple:
  <https://developer.apple.com/contact/request/networking-multicast>; after
  approval enable "Multicast Networking" on the App ID in the developer
  portal and let Xcode regenerate the provisioning profile. Without it the
  app only reaches a node by unicast (e.g. after the node was seen once).
* **Local network privacy**: `NSLocalNetworkUsageDescription` and
  `NSBonjourServices` (`_rdmnet._tcp`) are in `ios/Runner/Info.plist`; iOS
  shows the permission prompt on the first socket use.
* Bundle id `nl.dimcity.patchlab.rdm`, deployment target iOS 15.

## Android

* Permissions in `AndroidManifest.xml`: `INTERNET`, `ACCESS_NETWORK_STATE`,
  `ACCESS_WIFI_STATE` (own IP / subnet mask) and
  `CHANGE_WIFI_MULTICAST_STATE`.
* `MainActivity.kt` holds a `WifiManager.MulticastLock` while the app runs
  (method channel `nl.dimcity.patchlab_rdm/multicast`, called from
  `lib/net/multicast_lock.dart`). Without the lock many phones drop
  multicast / broadcast packets to save power.
* Application id `nl.dimcity.patchlab.rdm`.

## Windows

* Flutter desktop, 64-bit Windows 10/11. The code base is the same; the differences are small:
  * `SO_REUSEPORT` does not exist on Windows, so the UDP socket only sets `SO_REUSEADDR` there
    (`lib/net/udp.dart`). Another Art-Net program on the same laptop can still hold port 6454 if it also
    allows sharing; otherwise the app reports that the socket could not be opened.
  * Windows reports an ICMP "port unreachable" from an earlier UDP send as a socket error; the socket ignores it
    and keeps listening.
  * A laptop has several adapters. `LocalNetwork` lists every IPv4 address, ranks Art-Net ranges (2.x / 10.x)
    first and virtual adapters last, accepts a node that is in any of the subnets, and sends ArtPoll to the
    directed broadcast of each subnet. Dart cannot read the real subnet mask on desktop, so it is guessed from
    the address class and /8, /16 and /24 broadcasts are all tried (marked `~` in the UI).
  * Windows sends `255.255.255.255` out of one adapter only, which is why per-subnet broadcasts matter.
* Firewall: the installer adds an inbound UDP rule for the program on all profiles. A network without internet
  is often classified *Public*, so a private-only rule would not help. Uninstalling removes the rule.
* The installer (Inno Setup, `windows/installer/patchlab_rdm.iss`) ships the three Visual C++ runtime DLLs
  next to the exe, so a clean machine needs no separate download. It is **not code-signed**; for a
  signed build add a code-signing certificate to the workflow.
* Lamps on the cable (LLRP): the multicast group is joined on every adapter, link-local addresses included, and
  probes leave through every adapter. The installer's firewall rule (inbound UDP, all profiles) covers the multicast
  replies; a cable without internet is classified *Public* by Windows.
* Layout: on a wide window the phone layout stays in a centred 820 px column.

## macOS

* Flutter desktop, universal binary (arm64 + x86_64), macOS 12 or newer, bundle id `nl.dimcity.patchlab.rdm`.
* **Not sandboxed** (`macos/Runner/Release.entitlements`): the app binds fixed UDP ports, joins multicast groups per adapter
  and runs a TCP broker, and it is handed out as a DMG, not through the App Store. The network client / server entitlements are
  kept for a sandboxed build. macOS has no multicast entitlement (that one is iOS only).
* **Local Network privacy** (macOS 15 and later): `NSLocalNetworkUsageDescription` and `NSBonjourServices` are in `Info.plist`.
  Until the user allows it, every send to the local network fails with *No route to host*; the lamp search counts those per adapter
  ("sends FAILED" in the diagnostics) and the empty state tells the user where the switch is.
* Signing: ad hoc (`codesign --sign -`), no notarization. Gatekeeper blocks the first start: *Open Anyway* in Privacy & Security, or
  `xattr -dr com.apple.quarantine`. The macOS application firewall may ask once about incoming connections (broker).
* Sockets as elsewhere; `IP_MULTICAST_IF` is option 9 (as on Windows), mDNS port 5353 is shared with `mDNSResponder` through `SO_REUSEPORT`.
  Adapter names are BSD names (`en0`, `en7`); `awdl`, `llw`, `utun`, `bridge`, `anpi`, `gif`, `stf` are marked virtual.
* Not verified on real hardware: built and signed in CI only.

## Network

* Art-Net: UDP 6454 (bound with `SO_REUSEADDR` / `SO_REUSEPORT`).
* LLRP: UDP 5569, groups 239.255.250.133 / .134.
* mDNS: UDP 5353, 224.0.0.251 (package `multicast_dns` to look for brokers; `MdnsResponder` to advertise our own, one socket
  per adapter, address records per adapter).
* RDMnet broker: TCP, port from DNS-SD or the settings. The app's own broker (for the lamps on the cable) listens on a port
  the system picks; the installer adds an inbound TCP rule for the program next to the UDP rule.
* The phone must have an IP in the node's subnet. Nodes default to
  2.x.x.x/8 or 10.x.x.x/8; most phones default to 192.168.x.x/24 from DHCP,
  so the technician sets a static Wi-Fi IP. The nodes screen shows the
  phone's IP / mask and warns per node when the ranges differ.

## Building

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter run                 # on a connected phone
flutter build apk --release
flutter build ipa --release # needs an Apple team + the multicast entitlement
```
