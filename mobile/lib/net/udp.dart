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

  /// Joins a multicast group on the adapters that own [localIps] (all adapters
  /// the OS picks by default when empty).
  void joinMulticast(String group, {Iterable<String> localIps = const []});

  void close();
}

/// Opens a UDP socket on [port] (0 = any free port).
typedef UdpSocketFactory = Future<UdpSocket> Function(int port, {bool reusePort, bool broadcast});

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
    s.multicastLoopback = false;
    final r = RawUdpSocket._(s);
    for (final g in multicastGroups) {
      r.joinMulticast(g);
    }
    return r;
  }

  /// Factory for the services.
  static Future<UdpSocket> open(int port, {bool reusePort = true, bool broadcast = true}) =>
      bind(port, reusePort: reusePort, broadcast: broadcast);

  final RawDatagramSocket _socket;
  final StreamController<Datagram> _controller = StreamController<Datagram>.broadcast();
  Future<List<NetworkInterface>>? _interfaces;

  @override
  Stream<Datagram> get datagrams => _controller.stream;

  @override
  int get port => _socket.port;

  @override
  int send(List<int> data, InternetAddress address, int port) {
    try {
      return _socket.send(data, address, port);
    } on SocketException {
      return 0;
    } on OSError {
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

  @override
  void joinMulticast(String group, {Iterable<String> localIps = const []}) {
    final g = InternetAddress(group);
    if (localIps.isEmpty) {
      try {
        _socket.joinMulticast(g);
      } on SocketException {
        // no multicast on the default adapter
      } on OSError {
        // same
      }
      return;
    }
    _interfaces ??= NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false, includeLinkLocal: true);
    unawaited(_interfaces!.then((list) {
      for (final ip in localIps) {
        for (final i in list) {
          if (i.addresses.any((a) => a.address == ip)) {
            try {
              _socket.joinMulticast(g, i);
            } on SocketException {
              // adapter without multicast
            } on OSError {
              // same
            }
          }
        }
      }
    }).catchError((Object _) {}));
  }

  @override
  void close() {
    _socket.close();
    unawaited(_controller.close());
  }
}
