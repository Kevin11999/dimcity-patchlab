import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

/// A UDP socket as the services see it. The real one wraps [RawDatagramSocket];
/// the demo and the tests use an in-memory one ([MemoryUdpHub]) that needs no
/// operating system networking at all.
abstract class UdpSocket {
  Stream<Datagram> get datagrams;
  int get port;
  int send(List<int> data, InternetAddress address, int port);

  /// Sends through the network adapter that owns [localIp]. Matters for
  /// multicast: without it the OS picks one adapter, often the wrong one.
  int sendVia(List<int> data, InternetAddress address, int port, String localIp);

  /// Joins a multicast group on the adapters that own [localIps] (the adapter the OS
  /// picks by default when empty). Completes with false when a join failed.
  Future<bool> joinMulticast(String group, {Iterable<String> localIps = const []});

  /// Why the last send failed (no route, permission denied, ...), null when sends worked.
  String? get lastSendError;

  void close();
}

/// Opens a UDP socket on [port] (0 = any free port).
///
/// [localIp] names the adapter the socket is meant for. A real socket listens on all addresses and
/// ignores it (multicast is tied to an adapter by [UdpSocket.joinMulticast]); the in-memory network
/// uses it as the socket's own address.
typedef UdpSocketFactory = Future<UdpSocket> Function(int port, {bool reusePort, bool broadcast, String? localIp});

/// [RawDatagramSocket] wrapper. Binds on all IPv4 addresses with address reuse so
/// the app can share a port (Art-Net 6454, LLRP 5569) with other software.
class RawUdpSocket implements UdpSocket {
  RawUdpSocket._(this._socket) {
    _socket.listen((event) {
      if (event == RawSocketEvent.read) {
        Datagram? d;
        while ((d = _socket.receive()) != null) {
          if (!_controller.isClosed) _controller.add(d!);
        }
      }
    }, onError: (Object _) {
      // Windows reports ICMP "port unreachable" for an earlier send as a socket error
      // (connection reset). That is not fatal for UDP: keep listening.
    }, onDone: () {
      if (!_controller.isClosed) unawaited(_controller.close());
    });
  }

  static Future<RawUdpSocket> bind(
    int port, {
    bool reusePort = true,
    bool broadcast = true,
    List<String> multicastGroups = const [],
  }) async {
    final s = await RawDatagramSocket.bind(
      InternetAddress.anyIPv4,
      port,
      reuseAddress: true,
      // SO_REUSEPORT does not exist on Windows; SO_REUSEADDR (above) already lets sockets share the port there.
      reusePort: reusePort && !Platform.isWindows,
    );
    s.broadcastEnabled = broadcast;
    s.multicastLoopback = true;
    final r = RawUdpSocket._(s);
    r._limitMulticastToJoinedInterfaces();
    for (final g in multicastGroups) {
      await r.joinMulticast(g);
    }
    return r;
  }

  /// A socket bound to the address of one network adapter: what it sends leaves through that adapter with that
  /// source address (the system would otherwise pick the primary adapter), and it receives what is sent to that
  /// address. Needed for Art-Net broadcasts on a laptop with several adapters or an alias address.
  static Future<RawUdpSocket> bindTo(String ip, int port, {bool reusePort = true, bool broadcast = true}) async {
    final s = await RawDatagramSocket.bind(
      InternetAddress(ip),
      port,
      reuseAddress: true,
      reusePort: reusePort && !Platform.isWindows,
    );
    s.broadcastEnabled = broadcast;
    return RawUdpSocket._(s);
  }

  /// Factory for the services.
  static Future<UdpSocket> open(int port, {bool reusePort = true, bool broadcast = true, String? localIp}) =>
      bind(port, reusePort: reusePort, broadcast: broadcast);

  final RawDatagramSocket _socket;
  final StreamController<Datagram> _controller = StreamController<Datagram>.broadcast();

  @override
  Stream<Datagram> get datagrams => _controller.stream;

  @override
  int get port => _socket.port;

  @override
  String? lastSendError;

  @override
  int send(List<int> data, InternetAddress address, int port) {
    try {
      return _socket.send(data, address, port);
    } on SocketException catch (e) {
      lastSendError = e.osError?.message ?? e.message;
      return 0;
    } on OSError catch (e) {
      lastSendError = e.message;
      return 0;
    }
  }

  /// IP_MULTICAST_IF: option 9 on Windows and Apple platforms, 32 on Linux and Android.
  int get _multicastIfOption => (Platform.isLinux || Platform.isAndroid) ? 32 : 9;

  @override
  int sendVia(List<int> data, InternetAddress address, int port, String localIp) {
    try {
      final parts = localIp.split('.').map(int.parse).toList();
      if (parts.length == 4) {
        _socket.setRawOption(RawSocketOption(RawSocketOption.levelIPv4, _multicastIfOption, Uint8List.fromList(parts)));
      }
    } catch (_) {
      // Option not available: the OS default adapter is used.
    }
    return send(data, address, port);
  }

  /// Linux and Android hand a socket the multicast packets of groups joined by ANY socket on ANY
  /// adapter unless IP_MULTICAST_ALL is switched off. With one socket per adapter that would
  /// make every socket see every reply.
  void _limitMulticastToJoinedInterfaces() {
    if (!(Platform.isLinux || Platform.isAndroid)) return;
    try {
      _socket.setRawOption(RawSocketOption.fromInt(RawSocketOption.levelIPv4, 49, 0)); // IP_MULTICAST_ALL = 0
    } catch (_) {
      // Not supported: duplicates are harmless, the services de-duplicate.
    }
  }

  @override
  Future<bool> joinMulticast(String group, {Iterable<String> localIps = const []}) async {
    final g = InternetAddress(group);
    var ok = true;
    if (localIps.isEmpty) {
      try {
        _socket.joinMulticast(g);
      } on SocketException {
        ok = false;
      } on OSError {
        ok = false;
      }
      return ok;
    }
    List<NetworkInterface> list;
    try {
      list = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false, includeLinkLocal: true);
    } catch (_) {
      return false;
    }
    for (final ip in localIps) {
      final iface = list.where((i) => i.addresses.any((a) => a.address == ip)).firstOrNull;
      if (iface == null) {
        ok = false;
        continue;
      }
      try {
        _socket.joinMulticast(g, iface);
      } on SocketException {
        ok = false;
      } on OSError {
        ok = false;
      }
    }
    return ok;
  }

  @override
  void close() {
    _socket.close();
    unawaited(_controller.close());
  }
}
