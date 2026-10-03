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

## Network

* Art-Net: UDP 6454 (bound with `SO_REUSEADDR` / `SO_REUSEPORT`).
* LLRP: UDP 5569, groups 239.255.250.133 / .134.
* mDNS: UDP 5353, 224.0.0.251 (package `multicast_dns`).
* RDMnet broker: TCP, port from DNS-SD or the settings.
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
