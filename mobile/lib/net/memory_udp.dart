import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'udp.dart';

/// An in-memory network for the demo and for tests: sockets "bound" to a
/// virtual IP address and port, with unicast, broadcast and multicast
/// delivery. No operating system socket, firewall or adapter is involved, so
/// it behaves the same on every machine.
class MemoryUdpHub {
  final List<_MemorySocket> _sockets = <_MemorySocket>[];
  int _nextEphemeral = 40000;

  /// Opens a socket on [ip]:[port] (port 0 = a free port).
  UdpSocket open({required String ip, int port = 0}) {
    final s = _MemorySocket(this, ip, port == 0 ? _nextEphemeral++ : port);
    _sockets.add(s);
    return s;
  }

  /// A factory for services that should live on this hub with address [ip].
  UdpSocketFactory factoryFor(String ip) => (int port, {bool reusePort = true, bool broadcast = true}) async => open(ip: ip, port: port);

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
        if (s.groups.contains(target)) recipients.add(s);
      } else if (_isBroadcast(target)) {
        recipients.add(s);
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
  _MemorySocket(this._hub, this.ip, this.port);

  final MemoryUdpHub _hub;
  final String ip;
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
  int sendVia(List<int> data, InternetAddress address, int port, String localIp) => send(data, address, port);

  @override
  void joinMulticast(String group, {Iterable<String> localIps = const []}) {
    groups.add(group);
  }

  @override
  void close() {
    closed = true;
    unawaited(_controller.close());
  }
}
