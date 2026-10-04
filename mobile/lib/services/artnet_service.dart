import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../core/artnet/artnet.dart';
import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/uid.dart';
import '../net/network_info.dart';
import '../net/udp.dart';
import 'rdm_client.dart';
import 'stream_utils.dart';

/// A node as seen through Art-Net: one entry per IP, with one ArtPollReply
/// per page (bind index) of up to 4 ports.
class ArtNetNodeInfo {
  ArtNetNodeInfo(ArtPollReply first)
      : ip = first.ip,
        udpPort = first.udpPort == 0 ? ArtNet.port : first.udpPort,
        lastSeen = DateTime.now() {
    update(first);
  }

  final String ip;
  int udpPort;
  final Map<int, ArtPollReply> pages = <int, ArtPollReply>{};
  DateTime lastSeen;

  /// Unicast to this node did not get through (it is not in a subnet of ours, or the route is wrong):
  /// send to it by broadcast out of every adapter from now on.
  bool viaBroadcast = false;

  /// The responder UID the node announces in its ArtPollReply: a lamp that speaks Art-Net itself.
  Uid? get ownUid {
    for (final r in pages.values) {
      final u = r.defaultResponderUid;
      if (u.manufacturerId != 0 || u.deviceId != 0) return u;
    }
    return null;
  }

  /// Port addresses the node answers RDM on: its output ports, or the address of its Net / Sub-Net when it
  /// announces none (a lamp).
  List<PortAddress> get rdmAddresses {
    final out = <PortAddress>{for (final p in outputPorts) if (!p.port.rdmDisabled) p.address};
    if (out.isEmpty) {
      for (final r in pages.values) {
        out.add(PortAddress(r.netSwitch & 0x7F, r.subSwitch & 0x0F, r.swOut.isNotEmpty ? r.swOut.first & 0x0F : (r.swIn.isNotEmpty ? r.swIn.first & 0x0F : 0)));
      }
    }
    return out.toList()..sort();
  }

  ArtPollReply get first => pages[pages.keys.reduce((a, b) => a < b ? a : b)]!;
  String get shortName => first.shortName;
  String get longName => first.longName;
  String get mac => first.mac;
  int get oem => first.oem;
  int get estaManufacturer => first.estaManufacturer;
  String get nodeReport => first.nodeReport;
  bool get rdmCapable => pages.values.any((p) => p.rdmCapable);

  void update(ArtPollReply r) {
    pages[r.page] = r;
    if (r.udpPort != 0) udpPort = r.udpPort;
    lastSeen = DateTime.now();
  }

  /// Every output port, physical numbering across the pages.
  List<ArtNetPortView> get outputPorts {
    final out = <ArtNetPortView>[];
    final keys = pages.keys.toList()..sort();
    for (final page in keys) {
      final r = pages[page]!;
      for (final p in r.ports) {
        if (p.isOutput || !p.isInput) {
          out.add(ArtNetPortView(page: page, index: p.index, physical: r.firstPhysicalPort + p.index, port: p, reply: r));
        }
      }
    }
    return out;
  }
}

class ArtNetPortView {
  ArtNetPortView({required this.page, required this.index, required this.physical, required this.port, required this.reply});
  final int page;
  final int index;
  final int physical;
  final ArtNetPort port;
  final ArtPollReply reply;
  PortAddress get address => port.outputAddress;
}

/// One datagram that arrived on the Art-Net port, for the diagnostics ("what does the cable say?").
class RxRecord {
  RxRecord(this.time, this.from, this.port, this.what, this.length);
  final DateTime time;
  final String from;
  final int port;
  final String what;
  final int length;

  @override
  String toString() => '${time.toIso8601String().substring(11, 19)} $from:$port $what ($length bytes)';
}

class ArtNetRdmReceived {
  ArtNetRdmReceived({required this.ip, required this.port, required this.rdm, required this.packet});
  final String ip;
  final int port;
  final ArtRdm rdm;
  final RdmPacket? packet;
}

class TodResult {
  TodResult({required this.uids, required this.nak, required this.complete, required this.answered});
  final List<Uid> uids;

  /// The node answered TodNak (discovery still running or RDM off on that port).
  final bool nak;

  /// All blocks received and the count matches UidTotal.
  final bool complete;

  /// The node sent any ArtTodData at all.
  final bool answered;
}

/// Art-Net 4 side of the app: node discovery (ArtPoll), port programming
/// (ArtAddress) and RDM over Art-Net (ArtTod*, ArtRdm).
///
/// **Several adapters.** A laptop has Wi-Fi, a cable to the lamps and sometimes more; the lamps sit on 2.x.x.x or
/// 10.x.x.x while the cable adapter may have a 192.168 or 169.254 address. A socket on 0.0.0.0 sends from the primary
/// adapter only, so with [interfaces] the service also keeps one socket per adapter address: ArtPoll goes out of
/// each of them (directed broadcast + 255.255.255.255), and RDM to a node that is not in any subnet of ours is
/// broadcast out of all of them instead of sent unicast into a route that does not exist.
class ArtNetService {
  ArtNetService(this._socket, {required this.controllerUid, this.interfaces, this.bindFactory}) {
    _sub = _socket.datagrams.listen(_onDatagram);
  }

  static Future<ArtNetService> open({
    required Uid controllerUid,
    int port = ArtNet.port,
    Future<List<LocalAddress>> Function()? interfaces,
  }) async =>
      ArtNetService(
        await RawUdpSocket.bind(port),
        controllerUid: controllerUid,
        interfaces: interfaces,
        bindFactory: (ip, port) => RawUdpSocket.bindTo(ip, port),
      );

  final UdpSocket _socket;
  final Uid controllerUid;
  late final StreamSubscription<Datagram> _sub;

  /// The adapter addresses to send from (null: only the one socket, as in the demo).
  final Future<List<LocalAddress>> Function()? interfaces;

  /// Opens a socket bound to one adapter address and the Art-Net port.
  final Future<UdpSocket> Function(String ip, int port)? bindFactory;

  final Map<String, _Iface> _ifaces = <String, _Iface>{};

  /// Adapter addresses that could not be used, with the reason.
  final Map<String, String> interfaceErrors = <String, String>{};
  final Map<int, DateTime> _recent = <int, DateTime>{};
  int pollsSent = 0;
  int repliesSeen = 0;

  /// Datagrams that came in on the Art-Net port from somebody else (not our own broadcasts), newest last.
  final List<RxRecord> received = <RxRecord>[];
  int datagramsSeen = 0;

  static const _opNames = <int, String>{
    ArtNet.opPoll: 'ArtPoll',
    ArtNet.opPollReply: 'ArtPollReply',
    ArtNet.opTodRequest: 'ArtTodRequest',
    ArtNet.opTodData: 'ArtTodData',
    ArtNet.opRdm: 'ArtRdm',
    ArtNet.opAddress: 'ArtAddress',
  };

  void _log(Datagram d) {
    final from = d.address.address;
    if (_ifaces.values.any((i) => i.address.ip == from)) return; // our own broadcast coming back
    datagramsSeen++;
    final op = ArtNet.opcodeOf(d.data);
    final what = op == null ? 'not Art-Net' : (_opNames[op] ?? 'Art-Net opcode 0x${op.toRadixString(16)}');
    received.add(RxRecord(DateTime.now(), from, d.port, what, d.data.length));
    if (received.length > 40) received.removeAt(0);
  }

  List<LocalAddress> get localAddresses => [for (final i in _ifaces.values) i.address];

  final Map<String, ArtNetNodeInfo> nodes = <String, ArtNetNodeInfo>{};

  final _replies = StreamController<ArtPollReply>.broadcast();
  final _tod = StreamController<ArtTodData>.broadcast();
  final _rdm = StreamController<ArtNetRdmReceived>.broadcast();
  final _nodesChanged = StreamController<void>.broadcast();

  Stream<ArtPollReply> get pollReplies => _replies.stream;
  Stream<ArtTodData> get todData => _tod.stream;
  Stream<ArtNetRdmReceived> get rdmReceived => _rdm.stream;
  Stream<void> get nodesChanged => _nodesChanged.stream;

  /// Broadcast addresses polled; the directed broadcast of the phone's subnet
  /// is added by the app when known. 2.x and 10.x are the Art-Net defaults.
  final Set<String> broadcastTargets = {'255.255.255.255', '2.255.255.255', '10.255.255.255'};

  /// Extra unicast targets (ip → port), e.g. the simulated node in demo mode.
  final Map<String, int> unicastTargets = <String, int>{};

  int get localPort => _socket.port;

  /// The same broadcast reaches the 0.0.0.0 socket and the adapter sockets: handle it once.
  bool _duplicate(Datagram d) {
    final now = DateTime.now();
    _recent.removeWhere((_, t) => now.difference(t) > const Duration(milliseconds: 80));
    final key = Object.hash(d.address.address, d.port, Object.hashAll(d.data));
    if (_recent.containsKey(key)) return true;
    _recent[key] = now;
    return false;
  }

  void _onDatagram(Datagram d) {
    if (_ifaces.isNotEmpty && _duplicate(d)) return;
    _log(d);
    final op = ArtNet.opcodeOf(d.data);
    if (op == null) return;
    switch (op) {
      case ArtNet.opPollReply:
        final r = ArtPollReply.decode(d.data);
        if (r == null) return;
        repliesSeen++;
        // Trust the sender address over the IP field when they differ (NAT, demo node).
        final reply = d.address.address == r.ip ? r : _withIp(r, d.address.address, d.port);
        final existing = nodes[reply.ip];
        if (existing == null) {
          nodes[reply.ip] = ArtNetNodeInfo(reply);
        } else {
          existing.update(reply);
        }
        _replies.add(reply);
        _nodesChanged.add(null);
      case ArtNet.opTodData:
        final t = ArtTodData.decode(d.data);
        if (t != null) _tod.add(t);
      case ArtNet.opRdm:
        final r = ArtRdm.decode(d.data);
        if (r == null) return;
        _rdm.add(ArtNetRdmReceived(
          ip: d.address.address,
          port: d.port,
          rdm: r,
          packet: RdmPacket.tryDecodeArtNet(r.rdmBytes),
        ));
      default:
        break;
    }
  }

  ArtPollReply _withIp(ArtPollReply r, String ip, int port) {
    final b = Uint8List.fromList(r.raw);
    final parts = ip.split('.').map(int.parse).toList();
    for (var i = 0; i < 4; i++) {
      b[10 + i] = parts[i];
    }
    return ArtPollReply.decode(b)!;
  }

  void _send(Uint8List data, String ip, int port) {
    try {
      _socket.send(data, InternetAddress(ip), port);
    } on ArgumentError {
      // bad address literal
    }
  }

  /// Makes the adapter sockets match the adapters: a cable plugged in later gets one, an unplugged one loses it.
  /// Call it before [poll]. Without [interfaces] there is nothing to do.
  Future<void> syncInterfaces() async {
    final lister = interfaces, factory = bindFactory;
    if (lister == null || factory == null) return;
    final List<LocalAddress> wanted;
    try {
      wanted = await lister();
    } catch (_) {
      return;
    }
    final wantedIps = {for (final a in wanted) a.ip};
    for (final ip in _ifaces.keys.toList()) {
      if (!wantedIps.contains(ip)) {
        final i = _ifaces.remove(ip)!;
        unawaited(i.sub.cancel());
        i.socket.close();
      }
    }
    for (final a in wanted) {
      if (_ifaces.containsKey(a.ip)) continue;
      try {
        final socket = await factory(a.ip, ArtNet.port);
        _ifaces[a.ip] = _Iface(a, socket, socket.datagrams.listen(_onDatagram));
        interfaceErrors.remove(a.ip);
      } catch (e) {
        interfaceErrors[a.ip] = e.toString();
      }
    }
  }

  /// This address is in a subnet of one of our adapters (or the service has no adapter list: everything is local).
  bool isLocal(String ip) => _ifaces.isEmpty || _ifaces.values.any((i) => i.address.contains(ip));

  /// Broadcasts out of every adapter: its directed broadcast and the limited broadcast, from its own address.
  void _broadcastEverywhere(Uint8List data, int port) {
    for (final i in _ifaces.values) {
      for (final target in {i.address.directedBroadcast, '255.255.255.255'}) {
        if (target == null) continue;
        try {
          i.socket.send(data, InternetAddress(target), port);
        } on ArgumentError {
          // bad address literal
        }
      }
    }
  }

  /// To one node: unicast when it is in a subnet of ours, otherwise (or when unicast did not get through before)
  /// broadcast out of every adapter. Returns true when it went out as a broadcast.
  bool _toNode(Uint8List data, ArtNetNodeInfo node) {
    final broadcast = _ifaces.isNotEmpty && (node.viaBroadcast || !isLocal(node.ip));
    if (broadcast) {
      _broadcastEverywhere(data, node.udpPort);
    } else {
      _send(data, node.ip, node.udpPort);
    }
    return broadcast;
  }

  /// Broadcasts ArtPoll out of every adapter (plus unicast to the extra targets and the known nodes).
  void poll() {
    final p = ArtPoll.encode();
    pollsSent++;
    for (final t in broadcastTargets) {
      _send(p, t, ArtNet.port);
    }
    for (final i in _ifaces.values) {
      for (final target in {i.address.directedBroadcast, '255.255.255.255'}) {
        if (target == null) continue;
        try {
          i.socket.send(p, InternetAddress(target), ArtNet.port);
        } on ArgumentError {
          // bad address literal
        }
      }
    }
    unicastTargets.forEach((ip, port) => _send(p, ip, port));
    for (final n in nodes.values) {
      if (isLocal(n.ip)) _send(p, n.ip, n.udpPort);
    }
  }

  /// Polls one node and waits for its reply (page [page] when given).
  Future<ArtPollReply?> pollNode(ArtNetNodeInfo node, {int? page, Duration timeout = const Duration(seconds: 2)}) {
    final f = firstMatching<ArtPollReply>(
      pollReplies,
      (r) => r.ip == node.ip && (page == null || r.page == page),
      timeout,
    );
    _toNode(ArtPoll.encode(), node);
    return f;
  }

  /// Sends an ArtAddress packet to a node and returns the ArtPollReply for
  /// that page afterwards (the node replies on its own; otherwise it is polled).
  Future<ArtPollReply?> sendAddress(ArtNetNodeInfo node, Uint8List packet, {required int page, Duration timeout = const Duration(seconds: 3)}) async {
    final f = firstMatching<ArtPollReply>(pollReplies, (r) => r.ip == node.ip && r.page == page, timeout);
    _send(packet, node.ip, node.udpPort);
    final r = await f;
    if (r != null) return r;
    return pollNode(node, page: page);
  }

  /// Runs discovery on one port (ArtTodControl flush) and collects the Table of Devices.
  Future<TodResult> requestTod(
    ArtNetNodeInfo node,
    PortAddress address, {
    bool flush = true,
    Duration timeout = const Duration(seconds: 12),
    Duration settle = const Duration(milliseconds: 1500),
  }) async {
    final deadline = DateTime.now().add(timeout);
    if (flush) {
      _toNode(ArtTodControl.encode(address.net, address.subUni), node);
      await Future<void>.delayed(settle);
    }
    final uids = <Uid>{};
    var nak = false;
    var answered = false;
    var total = -1;
    var stableRounds = 0;
    while (DateTime.now().isBefore(deadline)) {
      final before = uids.length;
      final blocks = await _todRound(node, address);
      if (blocks.isNotEmpty) answered = true;
      nak = blocks.isNotEmpty && blocks.every((b) => b.isNak);
      for (final b in blocks) {
        if (b.isNak) continue;
        uids.addAll(b.uids);
        total = b.uidTotal;
      }
      final complete = !nak && total >= 0 && uids.length >= total;
      if (complete && uids.length == before) stableRounds++;
      if (complete && (total > 0 || stableRounds >= 1 || !flush)) {
        return TodResult(uids: uids.toList()..sort(), nak: false, complete: true, answered: answered);
      }
      await Future<void>.delayed(const Duration(milliseconds: 400));
    }
    return TodResult(uids: uids.toList()..sort(), nak: nak, complete: false, answered: answered);
  }

  Future<List<ArtTodData>> _todRound(ArtNetNodeInfo node, PortAddress address) {
    final f = collectDuring<ArtTodData>(
      todData,
      (t) => t.net == address.net && t.subUni == address.subUni,
      const Duration(milliseconds: 1200),
      stopWhen: (list) {
        final full = list.where((b) => !b.isNak).toList();
        if (full.isEmpty) return list.any((b) => b.isNak);
        final total = full.last.uidTotal;
        final have = full.fold<int>(0, (n, b) => n + b.uids.length);
        return have >= total;
      },
    );
    _toNode(ArtTodRequest.encode(address.net, [address.subUni]), node);
    return f;
  }

  /// Sends one RDM request through the node and waits for the matching response.
  Future<RdmPacket> sendRdm(ArtNetNodeInfo node, PortAddress address, RdmPacket request, {Duration timeout = const Duration(milliseconds: 1500)}) async {
    // A broadcast request is answered by whichever lamp owns the UID, so its IP is not checked then.
    var broadcast = _ifaces.isNotEmpty && (node.viaBroadcast || !isLocal(node.ip));
    final f = firstMatching<ArtNetRdmReceived>(
      rdmReceived,
      (m) {
        final p = m.packet;
        if (p == null || (!broadcast && m.ip != node.ip)) return false;
        if (!p.isResponse || p.transactionNumber != request.transactionNumber) return false;
        if (!(p.destination == controllerUid || p.destination.isBroadcast)) return false;
        if (!request.destination.isBroadcast && p.source != request.destination) return false;
        return p.pid == request.pid || request.pid == Pid.queuedMessage;
      },
      timeout,
    );
    broadcast = _toNode(ArtRdm(net: address.net, subUni: address.subUni, rdmBytes: request.encode(withStartCode: false)).encode(), node);
    final r = await f;
    if (r == null) {
      // Unicast into a route that leads nowhere looks exactly like a lamp that does not answer: try the
      // broadcast the next time (the client retries).
      if (!broadcast && _ifaces.isNotEmpty) node.viaBroadcast = true;
      throw RdmTimeoutException('No RDM response from ${request.destination} via ${node.ip}${broadcast ? ' (broadcast)' : ''}');
    }
    return r.packet!;
  }

  /// What this service saw, for the diagnostics.
  String report() {
    final b = StringBuffer('Art-Net: polls sent $pollsSent, poll replies $repliesSeen, nodes ${nodes.length}\n');
    if (interfaces != null && _ifaces.isEmpty) b.writeln('  no adapter socket open');
    for (final i in _ifaces.values) {
      b.writeln('  adapter ${i.address.interfaceName.isEmpty ? '' : '${i.address.interfaceName} '}${i.address.ip} broadcast ${i.address.directedBroadcast}');
    }
    for (final e in interfaceErrors.entries) {
      b.writeln('  adapter ${e.key} unusable: ${e.value}');
    }
    b.writeln('  datagrams from others on port 6454: $datagramsSeen${received.isEmpty ? '' : ', the last ones:'}');
    for (final r in received.reversed.take(15).toList().reversed) {
      b.writeln('    $r');
    }
    for (final n in nodes.values) {
      final own = n.ownUid;
      b.writeln('  ${n.ip} "${n.shortName}" ${isLocal(n.ip) ? 'in our subnet' : 'NOT in a subnet of ours'}${n.viaBroadcast ? ', via broadcast' : ''}${own == null ? '' : ', lamp UID $own'}');
    }
    return b.toString();
  }

  void dispose() {
    for (final i in _ifaces.values) {
      unawaited(i.sub.cancel());
      i.socket.close();
    }
    _ifaces.clear();
    unawaited(_sub.cancel());
    _socket.close();
    unawaited(_replies.close());
    unawaited(_tod.close());
    unawaited(_rdm.close());
    unawaited(_nodesChanged.close());
  }
}

class _Iface {
  _Iface(this.address, this.socket, this.sub);
  final LocalAddress address;
  final UdpSocket socket;
  final StreamSubscription<Datagram> sub;
}

/// RDM over Art-Net for one port of one node.
class ArtNetRdmTransport implements RdmTransport {
  ArtNetRdmTransport(this.service, this.node, this.address);

  final ArtNetService service;
  final ArtNetNodeInfo node;
  final PortAddress address;

  @override
  String get routeName => 'Art-Net';

  @override
  Uid get controllerUid => service.controllerUid;

  @override
  Future<RdmPacket> exchange(RdmPacket request, {Duration timeout = const Duration(milliseconds: 1500)}) =>
      service.sendRdm(node, address, request, timeout: timeout);

  @override
  Future<List<Uid>> discover({bool flush = true, Duration timeout = const Duration(seconds: 12)}) async {
    final r = await service.requestTod(node, address, flush: flush, timeout: timeout);
    if (!r.answered) throw RdmTimeoutException('Node did not answer the ArtTodRequest');
    if (r.nak) throw RdmException('Node answered TodNak (RDM off on this port, or discovery still running)');
    return r.uids;
  }
}
