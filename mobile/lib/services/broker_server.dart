import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import '../core/rdmnet/acn.dart';
import '../core/rdmnet/broker.dart';
import '../core/rdmnet/rpt.dart';
import '../core/uid.dart';

class _Peer {
  _Peer(this.handle, this.socket) : address = socket.remoteAddress.address;

  final int handle;
  final Socket socket;
  final String address;
  final AcnTcpFramer framer = AcnTcpFramer();
  ClientEntry? entry;
  DateTime lastRx = DateTime.now();
  DateTime lastTx = DateTime.now();
  bool closing = false;

  bool get connected => entry != null;
  bool get isController => entry?.isRptController ?? false;
  bool get isDevice => entry?.isRptDevice ?? false;

  void send(Uint8List data) {
    if (closing) return;
    try {
      socket.add(data);
      lastTx = DateTime.now();
    } catch (_) {
      // The socket is gone; the done handler cleans up.
    }
  }
}

/// A small RDMnet broker (ANSI E1.33 section 6 and 7): accepts RPT controllers and devices over TCP,
/// hands out dynamic UIDs, keeps the client list, and routes RPT requests, notifications and
/// statuses between them. Written after the behaviour of ETC's open-source broker, and tested against
/// ETC's reference device and controller code.
///
/// What it deliberately leaves out: EPT clients, virtual responders behind gateways (dynamic UID
/// requests for responders), and limits per client type.
class BrokerServer {
  BrokerServer({required this.cid, this.scope = Broker.defaultScope, this.maxClients = 400, Random? random}) : _random = random ?? Random.secure() {
    // A dynamic-style UID of its own: top bit of the manufacturer ID set, away from the broadcast values.
    uid = Uid(0x8000 | _random.nextInt(0x7FE0), 1);
    _nextDynamicId = 2;
  }

  final Cid cid;
  final String scope;
  final int maxClients;
  final Random _random;
  late final Uid uid;
  late int _nextDynamicId;

  ServerSocket? _server;
  Timer? _timer;
  int _nextHandle = 0;
  final Map<int, _Peer> _peers = <int, _Peer>{};

  /// CID → the dynamic UID that component got, so it gets the same one when it reconnects.
  final Map<String, Uid> _reservations = <String, Uid>{};

  final StreamController<void> _changed = StreamController<void>.broadcast();
  final List<String> log = <String>[];

  int get port => _server?.port ?? 0;
  bool get running => _server != null;

  /// Fires when a client connects or leaves.
  Stream<void> get clientsChanged => _changed.stream;

  List<ClientEntry> get clients => [for (final p in _peers.values) if (p.entry != null) p.entry!];
  List<ClientEntry> get devices => clients.where((c) => c.isRptDevice).toList();
  List<ClientEntry> get controllers => clients.where((c) => c.isRptController).toList();

  void _log(String s) {
    log.add('${DateTime.now().toIso8601String().substring(11, 19)} $s');
    if (log.length > 200) log.removeAt(0);
  }

  /// Starts listening on all IPv4 addresses. [port] 0 picks a free one.
  Future<int> start({int port = 0}) async {
    final server = await ServerSocket.bind(InternetAddress.anyIPv4, port);
    _server = server;
    server.listen(_onConnection, onError: (Object e) => _log('listen error: $e'));
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _housekeeping());
    _log('broker $uid listening on port ${server.port}, scope "$scope"');
    return server.port;
  }

  Future<void> stop() async {
    _timer?.cancel();
    _timer = null;
    final server = _server;
    _server = null;
    for (final p in _peers.values.toList()) {
      p.send(Broker.disconnect(cid, reason: 0x0000));
      _destroy(p, notify: false);
    }
    _peers.clear();
    await server?.close();
  }

  void _onConnection(Socket socket) {
    socket.setOption(SocketOption.tcpNoDelay, true);
    final peer = _Peer(_nextHandle++, socket);
    _peers[peer.handle] = peer;
    socket.listen(
      (chunk) => _onData(peer, chunk),
      onDone: () => _drop(peer),
      onError: (Object _) => _drop(peer),
      cancelOnError: true,
    );
  }

  void _onData(_Peer peer, List<int> chunk) {
    peer.lastRx = DateTime.now();
    List<RootLayerPdu> pdus;
    try {
      pdus = peer.framer.feed(chunk);
    } on FormatException {
      _log('client ${peer.handle}: stream out of sync, dropping');
      _drop(peer);
      return;
    }
    for (final pdu in pdus) {
      try {
        _dispatch(peer, pdu);
      } on FormatException {
        // A malformed PDU is skipped, the connection stays.
      } on RangeError {
        // same
      }
    }
  }

  void _dispatch(_Peer peer, RootLayerPdu pdu) {
    if (pdu.vector == Acn.vectorRootBroker) {
      final m = Broker.decode(pdu);
      switch (m) {
        case ClientConnectMessage():
          _connect(peer, m);
        case FetchClientListMessage():
          if (peer.connected) peer.send(Broker.clientList(cid, Broker.vectorConnectedClientList, clients));
        case DisconnectMessage():
          _drop(peer);
        case ClientEntryUpdateMessage():
          _entryUpdate(peer, m);
        default:
          break; // Null heartbeat and anything unknown: lastRx was already updated.
      }
    } else if (pdu.vector == Acn.vectorRootRpt) {
      _rpt(peer, pdu);
    }
  }

  // --------------------------------------------------------------------------------------------
  // Connecting
  // ---------------------------------------------------------------------------------------------

  void _connect(_Peer peer, ClientConnectMessage m) {
    if (peer.connected) return;
    final e = m.entry;
    int? refuse;
    if (m.e133Version > Broker.e133Version || m.scope != scope) {
      refuse = Broker.connectScopeMismatch;
    } else if (e == null || e.protocol != Broker.clientProtocolRpt) {
      refuse = Broker.connectInvalidClientEntry;
    } else if (clients.length >= maxClients) {
      refuse = Broker.connectCapacityExceeded;
    }
    Uid? assigned;
    if (refuse == null) {
      final r = _resolveUid(e!);
      assigned = r.$1;
      refuse = r.$2;
    }
    if (refuse != null) {
      _log('client ${peer.handle} (${peer.address}) refused: ${Broker.connectStatusText(refuse)}');
      peer.send(Broker.connectReply(cid, status: refuse, brokerUid: uid, clientUid: e?.uid ?? const Uid(0, 0)));
      unawaited(peer.socket.flush().whenComplete(() => _destroy(peer)).catchError((Object _) {}));
      return;
    }
    final entry = ClientEntry(cid: e!.cid, protocol: Broker.clientProtocolRpt, uid: assigned!, clientType: e.clientType, bindingCid: e.bindingCid);
    peer.entry = entry;
    peer.send(Broker.connectReply(cid, status: Broker.connectOk, brokerUid: uid, clientUid: assigned));
    _log('${entry.isRptController ? 'controller' : 'device'} ${entry.uid} connected from ${peer.address}');
    _toControllers(Broker.clientList(cid, Broker.vectorClientAdd, [entry]), except: peer);
    _changed.add(null);
  }

  /// A dynamic UID request is a manufacturer ID with the top bit set and device ID 0; a static UID
  /// has the top bit clear. Anything else (broadcast values, a bad request) is refused.
  (Uid?, int?) _resolveUid(ClientEntry e) {
    final u = e.uid;
    final taken = {for (final p in _peers.values) if (p.entry != null) p.entry!.uid};
    if ((u.manufacturerId & 0x8000) != 0 && u.deviceId == 0) {
      final reserved = _reservations[e.cid.toString()];
      if (reserved != null) {
        if (taken.contains(reserved)) return (null, Broker.connectDuplicateUid);
        return (reserved, null);
      }
      var id = _nextDynamicId;
      var candidate = Uid(uid.manufacturerId, id);
      while (taken.contains(candidate) || _reservations.containsValue(candidate)) {
        id++;
        candidate = Uid(uid.manufacturerId, id);
      }
      _nextDynamicId = id + 1;
      _reservations[e.cid.toString()] = candidate;
      return (candidate, null);
    }
    if ((u.manufacturerId & 0x8000) == 0 && u.manufacturerId != 0 && !u.isBroadcast) {
      if (taken.contains(u)) return (null, Broker.connectDuplicateUid);
      return (u, null);
    }
    return (null, Broker.connectInvalidUid);
  }

  void _entryUpdate(_Peer peer, ClientEntryUpdateMessage m) {
    final old = peer.entry;
    final e = m.entry;
    if (old == null || e == null || e.protocol != Broker.clientProtocolRpt) return;
    final updated = ClientEntry(cid: old.cid, protocol: old.protocol, uid: old.uid, clientType: e.clientType, bindingCid: e.bindingCid);
    peer.entry = updated;
    _toControllers(Broker.clientList(cid, Broker.vectorClientEntryChange, [updated]), except: peer);
    _changed.add(null);
  }

  // --------------------------------------------------------------------------------------------
  // RPT routing
  // ---------------------------------------------------------------------------------------------

  void _rpt(_Peer peer, RootLayerPdu pdu) {
    final from = peer.entry;
    if (from == null) return;
    final msg = Rpt.decode(pdu);
    final h = msg.header;
    final block = pdu.block;
    if (block == null) return;
    switch (msg) {
      case RptRequest():
        if (!peer.isController) return;
        if (!_validControllerDestination(h.destUid)) {
          peer.send(_status(h, Rpt.statusUnknownRptUid));
          return;
        }
        if (msg.packets.length > 1) {
          peer.send(_status(h, Rpt.statusInvalidMessage));
          return;
        }
        _route(peer, h, block, isRequest: true);
      case RptStatus():
        if (!peer.isDevice) return;
        if (msg.code == Rpt.statusBroadcastComplete) return;
        if (_validDeviceDestination(h.destUid)) _route(peer, h, block, isRequest: false);
      case RptNotification():
        if (_validDeviceDestination(h.destUid)) _route(peer, h, block, isRequest: false);
      default:
        break;
    }
  }

  static bool _isDeviceBroadcast(Uid u) => u.manufacturerId == 0xFFFD && u.deviceId == 0xFFFFFFFF;
  static bool _isControllerBroadcast(Uid u) => u.manufacturerId == 0xFFFC && u.deviceId == 0xFFFFFFFF;
  static bool _isManufacturerBroadcast(Uid u) => u.manufacturerId == 0xFFFD && (u.deviceId & 0xFFFF) == 0xFFFF && u.deviceId != 0xFFFFFFFF;

  bool _knownUid(Uid u) => _peers.values.any((p) => p.entry?.uid == u);

  bool _validControllerDestination(Uid u) => _isDeviceBroadcast(u) || _isManufacturerBroadcast(u) || u == uid || _knownUid(u);
  bool _validDeviceDestination(Uid u) => _isControllerBroadcast(u) || _knownUid(u);

  void _route(_Peer from, RptHeader h, Uint8List block, {required bool isRequest}) {
    final d = h.destUid;
    if (_isControllerBroadcast(d)) {
      for (final p in _peers.values.where((p) => p.isController && p != from)) {
        p.send(block);
      }
    } else if (_isDeviceBroadcast(d)) {
      for (final p in _peers.values.where((p) => p.isDevice && p != from)) {
        p.send(block);
      }
    } else if (_isManufacturerBroadcast(d)) {
      final manu = d.deviceId >> 16;
      for (final p in _peers.values.where((p) => p.isDevice && p != from && p.entry!.uid.manufacturerId == manu)) {
        p.send(block);
      }
    } else {
      final target = _peers.values.where((p) => p.entry?.uid == d).firstOrNull;
      if (target != null) {
        target.send(block);
      } else if (isRequest) {
        from.send(_status(h, Rpt.statusUnknownRptUid));
      }
    }
  }

  /// A status back to the sender of [h], as if from the destination it addressed.
  Uint8List _status(RptHeader h, int code) => Rpt.status(
        cid,
        RptHeader(sourceUid: h.destUid, sourceEndpoint: h.destEndpoint, destUid: h.sourceUid, destEndpoint: h.sourceEndpoint, sequence: h.sequence),
        code,
      );

  void _toControllers(Uint8List data, {_Peer? except}) {
    for (final p in _peers.values.where((p) => p.isController && p != except)) {
      p.send(data);
    }
  }

  // --------------------------------------------------------------------------------------------
  // Heartbeat and clean-up
  // ---------------------------------------------------------------------------------------------

  void _housekeeping() {
    final now = DateTime.now();
    for (final p in _peers.values.toList()) {
      if (now.difference(p.lastRx) > Broker.heartbeatTimeout) {
        _log('client ${p.handle} timed out');
        p.send(Broker.disconnect(cid, reason: 0x0000));
        _drop(p);
      } else if (p.connected && now.difference(p.lastTx) >= Broker.heartbeatInterval) {
        p.send(Broker.nullMessage(cid));
      }
    }
  }

  void _drop(_Peer peer) {
    if (!_peers.containsKey(peer.handle)) return;
    _destroy(peer, notify: true);
  }

  void _destroy(_Peer peer, {bool notify = true}) {
    final entry = peer.entry;
    peer.closing = true;
    _peers.remove(peer.handle);
    try {
      peer.socket.destroy();
    } catch (_) {
      // already closed
    }
    if (entry != null && notify) {
      _log('${entry.uid} left');
      _toControllers(Broker.clientList(cid, Broker.vectorClientRemove, [entry]));
      _changed.add(null);
    }
  }
}
