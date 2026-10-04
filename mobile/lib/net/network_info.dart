import 'dart:io';

import 'package:network_info_plus/network_info_plus.dart';

import 'adapters.dart';

/// One IPv4 address of this device with its subnet mask.
class LocalAddress {
  const LocalAddress(this.ip, this.mask, {this.interfaceName = '', this.maskGuessed = false});

  final String ip;
  final String mask;
  final String interfaceName;

  /// True when the OS did not tell the mask and it was guessed from the address class.
  final bool maskGuessed;

  int? get ipValue => LocalNetwork.toInt(ip);
  int? get maskValue => LocalNetwork.toInt(mask);

  int? get prefixLength {
    final v = maskValue;
    if (v == null) return null;
    var n = 0;
    for (var i = 31; i >= 0; i--) {
      if ((v >> i) & 1 == 1) {
        n++;
      } else {
        break;
      }
    }
    return n;
  }

  bool contains(String other) {
    final a = ipValue, m = maskValue, b = LocalNetwork.toInt(other);
    if (a == null || m == null || b == null) return false;
    return (a & m) == (b & m);
  }

  /// Directed broadcast of this subnet (e.g. 192.168.1.255).
  String? get directedBroadcast {
    final a = ipValue, m = maskValue;
    if (a == null || m == null) return null;
    return LocalNetwork.fromInt((a | (~m & 0xFFFFFFFF)) & 0xFFFFFFFF);
  }

  /// Art-Net nodes use 2.x.x.x or 10.x.x.x by default.
  bool get isArtNetRange {
    final first = int.tryParse(ip.split('.').first) ?? 0;
    return first == 2 || first == 10;
  }

  bool get isVirtual => looksVirtual(interfaceName);

  String get describe => '$ip ${maskGuessed ? '~' : ''}/${prefixLength ?? '?'}';

  @override
  String toString() => describe;
}

/// The device's own IPv4 addresses, used for the "same IP range as the node?"
/// check and for the broadcast addresses ArtPoll goes to. A phone has one
/// Wi-Fi address; a laptop often has several (Wi-Fi, Ethernet to a node,
/// virtual adapters), so every address counts.
class LocalNetwork {
  const LocalNetwork({this.addresses = const [], this.source = 'none'});

  final List<LocalAddress> addresses;

  /// Where the data came from: 'wifi' (network_info_plus), 'interfaces' or 'none'.
  final String source;

  /// The address shown first: Art-Net range (2.x / 10.x) before other ranges,
  /// real adapters before virtual ones.
  LocalAddress? get primary {
    if (addresses.isEmpty) return null;
    final sorted = [...addresses]..sort((a, b) => _rank(a).compareTo(_rank(b)));
    return sorted.first;
  }

  static int _rank(LocalAddress a) => (a.isVirtual ? 10 : 0) + (a.isArtNetRange ? 0 : 1);

  bool get known => addresses.isNotEmpty;

  String? get ip => primary?.ip;
  String? get mask => primary?.mask;

  /// Is [other] inside any subnet of this device? Unknown network: do not warn.
  bool contains(String other) {
    if (addresses.isEmpty) return true;
    return addresses.any((a) => a.contains(other));
  }

  /// Directed broadcast of every subnet, plus candidates for the common
  /// masks (/8, /16, /24) because desktop platforms do not tell the real mask.
  List<String> get broadcastTargets {
    final out = <String>{};
    for (final a in addresses) {
      final b = a.directedBroadcast;
      if (b != null) out.add(b);
      if (a.maskGuessed) out.addAll(broadcastCandidates(a.ip));
    }
    return out.toList()..sort();
  }

  /// First directed broadcast, kept for callers that want one address.
  String? get directedBroadcast => broadcastTargets.firstOrNull;

  String get describe {
    if (addresses.isEmpty) return '-';
    final shown = [...addresses]..sort((a, b) => _rank(a).compareTo(_rank(b)));
    return shown.take(3).map((a) => a.describe).join(', ') + (shown.length > 3 ? ' …' : '');
  }

  /// /8, /16 and /24 directed broadcasts of [ip] (e.g. 192.168.1.20 → 192.255.255.255, 192.168.255.255, 192.168.1.255).
  static List<String> broadcastCandidates(String ip) {
    final p = ip.split('.');
    if (p.length != 4) return const [];
    return ['${p[0]}.255.255.255', '${p[0]}.${p[1]}.255.255', '${p[0]}.${p[1]}.${p[2]}.255'];
  }

  static int? toInt(String ip) {
    final p = ip.split('.');
    if (p.length != 4) return null;
    var v = 0;
    for (final s in p) {
      final n = int.tryParse(s);
      if (n == null || n < 0 || n > 255) return null;
      v = (v << 8) | n;
    }
    return v;
  }

  static String fromInt(int v) => '${(v >> 24) & 255}.${(v >> 16) & 255}.${(v >> 8) & 255}.${v & 255}';

  /// Mask guessed from the address class when the OS does not tell us.
  static String classfulMask(String ip) {
    final first = int.tryParse(ip.split('.').first) ?? 0;
    if (first < 128) return '255.0.0.0';
    if (first < 192) return '255.255.0.0';
    return '255.255.255.0';
  }

  static bool get _isDesktop => Platform.isWindows || Platform.isLinux || Platform.isMacOS;

  /// Reads the addresses from the platform. Phones: the Wi-Fi details
  /// (with mask) first. Laptops: every IPv4 interface.
  static Future<LocalNetwork> detect({NetworkInfo? info}) async {
    if (!_isDesktop) {
      try {
        final ni = info ?? NetworkInfo();
        final ip = await ni.getWifiIP();
        if (ip != null && ip.isNotEmpty && ip != '0.0.0.0') {
          var mask = await ni.getWifiSubmask();
          final guessed = mask == null || mask.isEmpty || mask == '0.0.0.0';
          if (guessed) mask = classfulMask(ip);
          return LocalNetwork(addresses: [LocalAddress(ip, mask, interfaceName: 'wifi', maskGuessed: guessed)], source: 'wifi');
        }
      } catch (_) {
        // Plugin not available (tests, unsupported platform): use the interfaces.
      }
    }
    return fromInterfaces();
  }

  /// Every non-loopback, non-link-local IPv4 address of the device.
  static Future<LocalNetwork> fromInterfaces() async {
    final out = <LocalAddress>[];
    try {
      final ifs = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false);
      for (final i in ifs) {
        for (final a in i.addresses) {
          if (a.isLoopback || a.isLinkLocal) continue;
          out.add(LocalAddress(a.address, classfulMask(a.address), interfaceName: i.name, maskGuessed: true));
        }
      }
    } catch (_) {
      // No interfaces readable.
    }
    return LocalNetwork(addresses: out, source: out.isEmpty ? 'none' : 'interfaces');
  }
}
