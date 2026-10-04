import 'dart:io';

/// One IPv4 address on one network adapter of this device.
class AdapterInfo {
  const AdapterInfo(this.name, this.ip);

  /// The adapter's name as the operating system shows it, e.g. "Ethernet" or "Wi-Fi".
  final String name;
  final String ip;

  /// 169.254.x.x: what two devices on a bare cable give themselves.
  bool get isLinkLocal => ip.startsWith('169.254.');

  bool get isVirtual => looksVirtual(name);

  String get label => '$name  ·  $ip';

  @override
  bool operator ==(Object other) => other is AdapterInfo && other.name == name && other.ip == ip;

  @override
  int get hashCode => Object.hash(name, ip);

  @override
  String toString() => '$name $ip';
}

/// Adapters that are software, not a cable or a radio.
bool looksVirtual(String name) {
  final n = name.toLowerCase();
  return n.contains('vethernet') ||
      n.contains('virtualbox') ||
      n.contains('vmware') ||
      n.contains('vmnet') ||
      n.contains('hyper-v') ||
      n.contains('docker') ||
      n.contains('wsl') ||
      n.contains('loopback') ||
      n.contains('bluetooth') ||
      n.startsWith('veth') ||
      n.startsWith('br-') ||
      // macOS: AirDrop / low-latency Wi-Fi, VPN tunnels, bridges (Internet sharing, VMs), tunnels
      n.startsWith('awdl') ||
      n.startsWith('llw') ||
      n.startsWith('utun') ||
      n.startsWith('bridge') ||
      n.startsWith('anpi') ||
      n.startsWith('gif') ||
      n.startsWith('stf');
}

/// Every IPv4 address of this device, link-local (169.254.x.x) included, loopback not.
Future<List<AdapterInfo>> listAdapters() async {
  try {
    final ifs = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false, includeLinkLocal: true);
    return [
      for (final i in ifs)
        for (final a in i.addresses)
          if (!a.isLoopback) AdapterInfo(i.name, a.address),
    ];
  } catch (_) {
    return const [];
  }
}
