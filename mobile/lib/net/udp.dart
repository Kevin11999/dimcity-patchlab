import 'dart:async';
import 'dart:io';

/// A UDP socket as the services see it, so a test can swap in a fake.
abstract class UdpSocket {
  Stream<Datagram> get datagrams;
  int get port;
  int send(List<int> data, InternetAddress address, int port);
  void close();
}

/// [RawDatagramSocket] wrapper. Binds on all IPv4 interfaces with address and
/// port reuse so the app can share Art-Net port 6454 with other software on
/// the phone, with broadcast enabled and optional multicast groups joined.
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
    for (final g in multicastGroups) {
      try {
        s.joinMulticast(InternetAddress(g));
      } on SocketException {
        // Joining can fail on an interface without multicast; the socket still works for unicast.
      } on OSError {
        // Same: keep the socket.
      }
    }
    return RawUdpSocket._(s);
  }

  final RawDatagramSocket _socket;
  final StreamController<Datagram> _controller = StreamController<Datagram>.broadcast();

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

  @override
  void close() {
    _socket.close();
    unawaited(_controller.close());
  }
}
