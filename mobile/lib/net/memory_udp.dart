import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'udp.dart';

/// An in-memory network for the demo and for tests: sockets "bound" to a
/// virtual IP address and port, with unicast, broadcast and multicast
/// delivery. Broadcast and multicast stay inside one network segment (the first two bytes of the
/// address, so 169.254.x.x and 2.0.x.x are different cables), like on real adapters. No operating system socket, firewall or adapter is involved, so
/// it behaves the same on every machine.
class MemoryUdpHub {
  final List<_MemorySocket> _sockets = <_MemorySocket>[];
  int _nextEphemeral = 40000;

  /// Opens a socket on [ip]:[port] (port 0 = a free port).
  UdpSocket open({required String ip, int port = 0, String? segment}) {
    final s = _MemorySocket(this, ip, port == 0 ? _nextEphemeral++ : port, segment ?? ip.split('.').take(2).join('.'));
    _sockets.add(s);
    return s;
  }

  /// A factory for services that should live on this hub. Sockets get the address the service asks
  /// for (one per adapter), or [defaultIp].
  UdpSocketFactory factoryFor(String defaultIp) =>
      (int port, {bool reusePort = true, bool broadcast = true, String? localIp}) async => open(ip: localIp ?? defaultIp, port: port);

  static bool _isMulticast(String ip) {
    final first = int.tryParse(ip.split('.').first) ?? 0;
    return first >= 224 && first <= 239;
  }

  static bool _isBroadcast(String ip) => ip == '255.255.255.255' || ip.endsWith('.255');

  void _deliver(_MemorySocket from, List<int> data, InternetAddress to, int port) {
    final bytes = Uint8List.fromList(data);
    final target = to.address;
    final recipients = <_MemorySocket>[];
    for (final s in _sockets) {
      if (s.closed || s == from || s.port != port) continue;
      if (_isMulticast(target)) {
        if (s.segment == from.segment && s.groups.contains(target)) recipients.add(s);
      } else if (_isBroadcast(target)) {
        if (s.segment == from.segment) recipients.add(s);
      } else if (s.ip == target) {
        recipients.add(s);
      }
    }
    for (final s in recipients) {
      // Deliver asynchronously, like a real network.
      Timer.run(() {
        if (!s.closed) s._controller.add(Datagram(bytes, InternetAddress(from.ip), from.port));
      });
    }
  }
}

class _MemorySocket implements UdpSocket {
  _MemorySocket(this._hub, this.ip, this.port, this.segment);

  final MemoryUdpHub _hub;
  final String ip;
  final String segment;
  @override
  final int port;
  final Set<String> groups = <String>{};
  final StreamController<Datagram> _controller = StreamController<Datagram>.broadcast();
  bool closed = false;

  @override
  Stream<Datagram> get datagrams => _controller.stream;

  @override
  int send(List<int> data, InternetAddress address, int port) {
    if (closed) return 0;
    _hub._deliver(this, data, address, port);
    return data.length;
  }

  @override
  String? get lastSendError => null;

  @override
  int sendVia(List<int> data, InternetAddress address, int port, String localIp) => send(data, address, port);

  @override
  Future<bool> joinMulticast(String group, {Iterable<String> localIps = const []}) async {
    groups.add(group);
    return true;
  }

  @override
  void close() {
    closed = true;
    unawaited(_controller.close());
  }
}
