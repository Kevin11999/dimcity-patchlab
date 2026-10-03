import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../core/artnet/artnet.dart';
import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/uid.dart';
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
class ArtNetService {
  ArtNetService(this._socket, {required this.controllerUid}) {
    _sub = _socket.datagrams.listen(_onDatagram);
  }

  static Future<ArtNetService> open({required Uid controllerUid, int port = ArtNet.port}) async =>
      ArtNetService(await RawUdpSocket.bind(port), controllerUid: controllerUid);

  final UdpSocket _socket;
  final Uid controllerUid;
  late final StreamSubscription<Datagram> _sub;

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

  void _onDatagram(Datagram d) {
    final op = ArtNet.opcodeOf(d.data);
    if (op == null) return;
    switch (op) {
      case ArtNet.opPollReply:
        final r = ArtPollReply.decode(d.data);
        if (r == null) return;
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
          packet: RdmPacket.tryDecode(r.rdmBytes, withStartCode: false),
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

  /// Broadcasts ArtPoll (plus unicast to the extra targets).
  void poll() {
    final p = ArtPoll.encode();
    for (final t in broadcastTargets) {
      _send(p, t, ArtNet.port);
    }
    unicastTargets.forEach((ip, port) => _send(p, ip, port));
    for (final n in nodes.values) {
      _send(p, n.ip, n.udpPort);
    }
  }

  /// Polls one node and waits for its reply (page [page] when given).
  Future<ArtPollReply?> pollNode(ArtNetNodeInfo node, {int? page, Duration timeout = const Duration(seconds: 2)}) {
    final f = firstMatching<ArtPollReply>(
      pollReplies,
      (r) => r.ip == node.ip && (page == null || r.page == page),
      timeout,
    );
    _send(ArtPoll.encode(), node.ip, node.udpPort);
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
      _send(ArtTodControl.encode(address.net, address.subUni), node.ip, node.udpPort);
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
    _send(ArtTodRequest.encode(address.net, [address.subUni]), node.ip, node.udpPort);
    return f;
  }

  /// Sends one RDM request through the node and waits for the matching response.
  Future<RdmPacket> sendRdm(ArtNetNodeInfo node, PortAddress address, RdmPacket request, {Duration timeout = const Duration(milliseconds: 1500)}) async {
    final f = firstMatching<ArtNetRdmReceived>(
      rdmReceived,
      (m) {
        final p = m.packet;
        if (p == null || m.ip != node.ip) return false;
        if (!p.isResponse || p.transactionNumber != request.transactionNumber) return false;
        if (!(p.destination == controllerUid || p.destination.isBroadcast)) return false;
        if (!request.destination.isBroadcast && p.source != request.destination) return false;
        return p.pid == request.pid || request.pid == Pid.queuedMessage;
      },
      timeout,
    );
    _send(ArtRdm(net: address.net, subUni: address.subUni, rdmBytes: request.encode(withStartCode: false)).encode(), node.ip, node.udpPort);
    final r = await f;
    if (r == null) throw RdmTimeoutException('No RDM response from ${request.destination} via ${node.ip}');
    return r.packet!;
  }

  void dispose() {
    unawaited(_sub.cancel());
    _socket.close();
    unawaited(_replies.close());
    unawaited(_tod.close());
    unawaited(_rdm.close());
    unawaited(_nodesChanged.close());
  }
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
