import 'dart:io';

import 'package:network_info_plus/network_info_plus.dart';

/// The phone's own Wi-Fi IPv4 address and subnet, used for the "same IP
/// range as the node?" check and for the directed broadcast address.
class LocalNetwork {
  const LocalNetwork({this.ip, this.mask, this.broadcast, this.source = 'none'});

  final String? ip;
  final String? mask;
  final String? broadcast;

  /// Where the data came from: 'wifi' (network_info_plus), 'interface' (fallback) or 'none'.
  final String source;

  bool get known => ip != null && mask != null;

  int? get prefixLength {
    final m = mask;
    if (m == null) return null;
    final v = _toInt(m);
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

  /// Is [other] inside this subnet?
  bool contains(String other) {
    final a = _toInt(ip ?? '');
    final m = _toInt(mask ?? '');
    final b = _toInt(other);
    if (a == null || m == null || b == null) return true; // unknown: do not warn
    return (a & m) == (b & m);
  }

  /// Directed broadcast of this subnet (e.g. 192.168.1.255), when known.
  String? get directedBroadcast {
    if (broadcast != null && broadcast != '0.0.0.0') return broadcast;
    final a = _toInt(ip ?? '');
    final m = _toInt(mask ?? '');
    if (a == null || m == null) return null;
    return _toIp((a | (~m & 0xFFFFFFFF)) & 0xFFFFFFFF);
  }

  String get describe => known ? '$ip /$prefixLength' : (ip ?? '-');

  static int? _toInt(String ip) {
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

  static String _toIp(int v) => '${(v >> 24) & 255}.${(v >> 16) & 255}.${(v >> 8) & 255}.${v & 255}';

  /// Guess the mask for a classful address when the OS does not tell us.
  static String classfulMask(String ip) {
    final first = int.tryParse(ip.split('.').first) ?? 0;
    if (first < 128) return '255.0.0.0';
    if (first < 192) return '255.255.0.0';
    return '255.255.255.0';
  }

  /// Reads the Wi-Fi details from the platform, falling back to the first
  /// non-loopback IPv4 interface.
  static Future<LocalNetwork> detect({NetworkInfo? info}) async {
    try {
      final ni = info ?? NetworkInfo();
      final ip = await ni.getWifiIP();
      if (ip != null && ip.isNotEmpty && ip != '0.0.0.0') {
        var mask = await ni.getWifiSubmask();
        if (mask == null || mask.isEmpty || mask == '0.0.0.0') mask = classfulMask(ip);
        final bc = await ni.getWifiBroadcast();
        return LocalNetwork(ip: ip, mask: mask, broadcast: bc, source: 'wifi');
      }
    } catch (_) {
      // Plugin not available (tests, unsupported platform): use the interfaces.
    }
    try {
      final ifs = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false);
      for (final i in ifs) {
        for (final a in i.addresses) {
          if (!a.isLoopback && !a.isLinkLocal) {
            return LocalNetwork(ip: a.address, mask: classfulMask(a.address), source: 'interface');
          }
        }
      }
    } catch (_) {
      // No interfaces readable.
    }
    return const LocalNetwork();
  }
}
