import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/rdm/rdm_params.dart';
import '../core/rdmnet/acn.dart';
import '../core/rdmnet/broker.dart';
import '../core/rdmnet/llrp.dart';
import '../core/rdmnet/rpt.dart';
import '../core/uid.dart';
import '../net/adapters.dart';
import '../net/udp.dart';
import 'lamp_broker.dart';
import 'rdm_client.dart';
import 'rdmnet_service.dart';

/// An RDMnet component found with LLRP: a lamp (RPT device), a broker or a controller.
class LlrpDevice {
  LlrpDevice({
    required this.cid,
    required this.uid,
    required this.hardwareAddress,
    required this.componentType,
    required this.ip,
    Iterable<String> localIps = const [],
  }) : localIps = {...localIps};

  final Cid cid;
  final Uid uid;
  final String hardwareAddress;
  final int componentType;

  /// Address the reply came from.
  final String ip;

  /// Our adapters it answered on. Commands go out of exactly these.
  final Set<String> localIps;

  ComponentScope? scope;

  bool get isDevice => componentType == Llrp.componentRptDevice;
  bool get isBroker => componentType == Llrp.componentBroker;
}

/// What happened on one network adapter, for the diagnostics screen.
class AdapterStats {
  AdapterStats(this.info);
  final AdapterInfo info;
  int probes = 0;
  int replies = 0;

  /// Sends the operating system refused (no route, permission denied: on a Mac the Local Network permission).
  int sendFailures = 0;

  /// Multicast join of the LLRP group worked on this adapter.
  bool joined = false;

  /// A problem on this adapter (socket could not be opened, join failed), if any.
  String? error;

  @override
  String toString() =>
      '${info.name} ${info.ip}: sent $probes, received $replies${sendFailures == 0 ? '' : ', $sendFailures sends FAILED'}, ${joined ? 'joined' : 'NOT joined'}${error == null ? '' : ', $error'}';
}

class _Rx {
  _Rx(this.message, this.datagram, this.adapterIp);
  final LlrpMessage message;
  final Datagram datagram;
  final String adapterIp;
}

class _Port {
  _Port(this.stats, this.socket);
  final AdapterStats stats;
  final UdpSocket socket;
  StreamSubscription<Datagram>? sub;
}

/// LLRP (ANSI E1.33 Low Level Recovery Protocol): finds RDMnet components on the local network with
/// a multicast probe and talks RDM to them, with no broker, no DHCP server and no IP configuration.
/// Two devices on one cable are enough: both fall back to link-local addresses (169.254.x.x).
///
/// Like ETC's reference implementation there is **one socket per network adapter**, each joined to
/// the LLRP multicast group on its own adapter and sending out of its own adapter. A laptop with
/// Wi-Fi, a cable and virtual adapters therefore never depends on which adapter the operating
/// system happens to prefer, and the diagnostics can say what each adapter saw.
class LlrpService {
  LlrpService({
    required this.socketFactory,
    required this.cid,
    required this.controllerUid,
    required this.adapters,
  });

  final UdpSocketFactory socketFactory;
  final Cid cid;
  final Uid controllerUid;

  /// The adapters to use (all of them, or the one the technician picked).
  final Future<List<AdapterInfo>> Function() adapters;

  final Map<String, _Port> _ports = <String, _Port>{};
  final StreamController<_Rx> _rx = StreamController<_Rx>.broadcast();
  int _transaction = 0;
  bool _closed = false;

  /// Components found by the last probes, by UID.
  final Map<Uid, LlrpDevice> devices = <Uid, LlrpDevice>{};

  List<AdapterStats> get stats => [for (final p in _ports.values) p.stats];
  List<String> get adapterIps => _ports.keys.toList();
  int get probesSent => _ports.values.fold(0, (n, p) => n + p.stats.probes);
  int get repliesSeen => _ports.values.fold(0, (n, p) => n + p.stats.replies);

  /// Adapters that were asked for but could not be used.
  final Map<String, String> unusable = <String, String>{};

  /// Makes the open sockets match the adapters: a cable plugged in after the app started gets a
  /// socket here, an unplugged one loses it. Returns true when the set of adapters changed.
  Future<bool> sync() async {
    if (_closed) return false;
    final wanted = await adapters();
    final wantedIps = {for (final a in wanted) a.ip};
    var changed = false;
    for (final ip in _ports.keys.toList()) {
      if (!wantedIps.contains(ip)) {
        final p = _ports.remove(ip)!;
        unawaited(p.sub?.cancel());
        p.socket.close();
        changed = true;
      }
    }
    for (final a in wanted) {
      if (_ports.containsKey(a.ip)) continue;
      final stats = AdapterStats(a);
      try {
        final socket = await socketFactory(Llrp.port, reusePort: true, broadcast: false, localIp: a.ip);
        final port = _Port(stats, socket);
        stats.joined = await socket.joinMulticast(Llrp.responseAddress, localIps: [a.ip]);
        if (!stats.joined) stats.error = 'multicast join failed';
        port.sub = socket.datagrams.listen((d) => _onDatagram(port, d));
        _ports[a.ip] = port;
        unusable.remove(a.ip);
        changed = true;
      } catch (e) {
        unusable[a.ip] = e.toString();
      }
    }
    return changed;
  }

  void _onDatagram(_Port port, Datagram d) {
    final m = _tryDecode(d.data);
    if (m != null && !_rx.isClosed) _rx.add(_Rx(m, d, port.stats.info.ip));
  }

  static LlrpMessage? _tryDecode(Uint8List data) {
    try {
      return Llrp.decode(data);
    } on FormatException {
      return null;
    } on RangeError {
      return null;
    }
  }

  void _send(Uint8List data, Iterable<String> via) {
    final to = InternetAddress(Llrp.requestAddress);
    var sent = false;
    for (final ip in via) {
      final p = _ports[ip];
      if (p == null) continue;
      _count(p, p.socket.sendVia(data, to, Llrp.port, ip));
      sent = true;
    }
    if (!sent) {
      // The adapter it was seen on is gone: try all of them.
      for (final p in _ports.values) {
        _count(p, p.socket.sendVia(data, to, Llrp.port, p.stats.info.ip));
      }
    }
  }

  void _count(_Port p, int written) {
    p.stats.probes++;
    if (written > 0) return;
    p.stats.sendFailures++;
    p.stats.error = 'send failed: ${p.socket.lastSendError ?? 'nothing written'}';
  }

  Future<T?> _waitFor<T>(T? Function(_Rx rx) pick, Duration timeout) {
    final c = Completer<T?>();
    late StreamSubscription<_Rx> sub;
    final timer = Timer(timeout, () {
      if (!c.isCompleted) c.complete(null);
    });
    sub = _rx.stream.listen((rx) {
      final v = pick(rx);
      if (v != null && !c.isCompleted) c.complete(v);
    });
    return c.future.whenComplete(() {
      timer.cancel();
      unawaited(sub.cancel());
    });
  }

  /// Probes until a round finds nothing new. LLRP devices answer after a random delay of up to
  /// 1.5 s, so a round lasts [roundTimeout]. Known UIDs go into the next probe so devices that
  /// already answered stay quiet.
  Future<List<LlrpDevice>> probe({
    int maxRounds = 5,
    Duration roundTimeout = const Duration(milliseconds: 2000),
    void Function(List<LlrpDevice> found)? onUpdate,
  }) async {
    await sync();
    final found = <Uid, LlrpDevice>{};
    for (var round = 0; round < maxRounds; round++) {
      final tn = ++_transaction;
      final before = found.length;
      final sub = _rx.stream.listen((rx) {
        final m = rx.message;
        if (m is! LlrpProbeReply || m.destCid != cid || m.transaction != tn) return;
        _ports[rx.adapterIp]?.stats.replies++;
        final existing = found[m.uid];
        if (existing != null) {
          existing.localIps.add(rx.adapterIp);
          return;
        }
        found[m.uid] = LlrpDevice(
          cid: m.senderCid,
          uid: m.uid,
          hardwareAddress: m.hardwareAddress,
          componentType: m.componentType,
          ip: rx.datagram.address.address,
          localIps: [rx.adapterIp],
        );
        onUpdate?.call(found.values.toList());
      });
      _send(Llrp.probeRequest(senderCid: cid, transaction: tn, knownUids: found.keys.toList()), _ports.keys.toList());
      await Future<void>.delayed(roundTimeout);
      await sub.cancel();
      if (found.length == before) {
        // Nothing new this round. With nothing at all, give late starters one more chance.
        if (found.isNotEmpty || round >= 1) break;
      }
      if (found.length >= Llrp.maxKnownUids) break;
    }
    devices
      ..clear()
      ..addAll(found);
    return found.values.toList();
  }

  /// One RDM request to a component and its response. Throws [RdmTimeoutException] when nothing comes back.
  Future<RdmPacket> rdm(LlrpDevice device, RdmPacket request, {Duration timeout = const Duration(milliseconds: 1500)}) async {
    if (_ports.isEmpty) await sync();
    final tn = ++_transaction;
    final wait = _waitFor<RdmPacket>((rx) {
      final m = rx.message;
      return m is LlrpRdmCommand && m.destCid == cid && m.transaction == tn && m.packet.isResponse ? m.packet : null;
    }, timeout);
    _send(Llrp.rdmCommand(senderCid: cid, destCid: device.cid, transaction: tn, packet: request), device.localIps);
    final r = await wait;
    if (r == null) throw RdmTimeoutException('No LLRP answer from ${device.uid} (${device.ip})');
    return r;
  }

  /// COMPONENT_SCOPE of a device: names the broker it is configured for.
  Future<ComponentScope?> readScope(LlrpDevice device) async {
    final req = RdmPacket(
      destination: device.uid,
      source: controllerUid,
      transactionNumber: (++_transaction) & 0xFF,
      commandClass: Rdm.getCommand,
      pid: Pid.componentScope,
      data: ComponentScope.request(1),
    );
    try {
      final r = await rdm(device, req);
      if (!r.isAck) return null;
      return ComponentScope.decode(r.data);
    } on RdmException {
      return null;
    } on FormatException {
      return null;
    }
  }

  /// A plain-text report of what this service saw, to paste into a bug report.
  String report() {
    final b = StringBuffer('LLRP, ${DateTime.now().toIso8601String()}\n');
    b.writeln('controller CID $cid UID $controllerUid');
    if (_ports.isEmpty) b.writeln('no usable network adapter');
    for (final s in stats) {
      b.writeln('  $s');
    }
    for (final e in unusable.entries) {
      b.writeln('  unusable ${e.key}: ${e.value}');
    }
    b.writeln('components found: ${devices.length}');
    for (final d in devices.values) {
      b.writeln('  ${d.uid} ${d.isDevice ? 'device' : (d.isBroker ? 'broker' : 'type ${d.componentType}')} ${d.ip} via ${d.localIps.join(',')} cid ${d.cid} hw ${d.hardwareAddress}');
    }
    return b.toString();
  }

  void close() {
    _closed = true;
    for (final p in _ports.values) {
      unawaited(p.sub?.cancel());
      p.socket.close();
    }
    _ports.clear();
    unawaited(_rx.close());
  }
}

/// One lamp as the app sees it: found by LLRP, connected to the broker, or both. The two views of
/// one lamp are matched on its CID (the UIDs can differ, a lamp that asked the broker for a dynamic
/// UID has another one there than in LLRP).
class Lamp {
  Lamp({required this.uid, this.llrp, this.entry});

  /// The UID the rest of the app knows the lamp by.
  final Uid uid;
  LlrpDevice? llrp;
  ClientEntry? entry;

  /// A broker timed out on this lamp while LLRP worked: ask LLRP first from now on.
  bool llrpFirst = false;

  Cid get cid => entry?.cid ?? llrp!.cid;
  bool get onBroker => entry != null;
}

/// RDM to the lamps on the cable, the RDMnet way:
///
///  * RPT through a broker (the app's own, or the one on the network) when the lamp is connected to it;
///  * LLRP straight to the lamp otherwise (no broker, no DHCP, no IP configuration needed).
///
/// A lamp that is on both is addressed through the broker and falls back to LLRP when the broker route
/// times out. The caller only sees one list of UIDs.
class LampsTransport implements RdmTransport {
  LampsTransport(this.llrp, {this.broker});

  final LlrpService llrp;
  final LampBroker? broker;

  /// Every UID a lamp is known by (LLRP and broker) points at the same [Lamp].
  final Map<Uid, Lamp> _byUid = <Uid, Lamp>{};

  /// The lamps of the last discovery.
  List<Lamp> lamps = <Lamp>[];

  @override
  String get routeName => 'RDMnet';

  @override
  Uid get controllerUid => llrp.controllerUid;

  /// How long to wait for lamps that LLRP saw to show up on our own broker (they find it with DNS-SD).
  static const _joinGrace = Duration(seconds: 4);

  @override
  Future<List<Uid>> discover({bool flush = true, Duration timeout = const Duration(seconds: 12)}) async {
    final b = broker;
    final brokerReady = b == null ? Future<void>.value() : b.ensure().timeout(const Duration(seconds: 8), onTimeout: () {});
    final found = (await Future.wait([llrp.probe(), brokerReady]))[0] as List<LlrpDevice>;
    final devices = found.where((d) => d.isDevice).toList();
    if (b != null && b.connected && devices.any((d) => !b.lamps.any((e) => e.cid == d.cid))) {
      await _waitForBroker(b, devices);
    }
    return _merge(devices);
  }

  /// Gives lamps a moment to connect to the broker (never longer than [_joinGrace]).
  Future<void> _waitForBroker(LampBroker b, List<LlrpDevice> devices) async {
    final conn = b.connection;
    if (conn == null) return;
    bool allThere() => devices.every((d) => b.lamps.any((e) => e.cid == d.cid));
    if (allThere()) return;
    final done = Completer<void>();
    final sub = conn.clientsChanged.listen((_) {
      if (allThere() && !done.isCompleted) done.complete();
    });
    try {
      await done.future.timeout(_joinGrace, onTimeout: () {});
    } finally {
      await sub.cancel();
    }
  }

  List<Uid> _merge(List<LlrpDevice> devices) {
    final entries = broker?.connected == true ? broker!.lamps : const <ClientEntry>[];
    final out = <Lamp>[];
    final used = <Cid>{};
    for (final e in entries) {
      final l = devices.where((d) => d.cid == e.cid).firstOrNull;
      out.add(_lampFor(Lamp(uid: e.uid, llrp: l, entry: e)));
      used.add(e.cid);
    }
    for (final d in devices.where((d) => !used.contains(d.cid))) {
      out.add(_lampFor(Lamp(uid: d.uid, llrp: d)));
    }
    lamps = out;
    return [for (final l in out) l.uid]..sort();
  }

  /// Keeps one [Lamp] per physical lamp over repeated searches (and its "LLRP first" memory).
  Lamp _lampFor(Lamp fresh) {
    final known = _byUid.values.where((l) => l.cid == fresh.cid).firstOrNull;
    if (known == null) {
      _byUid[fresh.uid] = fresh;
      if (fresh.llrp != null) _byUid[fresh.llrp!.uid] = fresh;
      return fresh;
    }
    known.llrp = fresh.llrp ?? known.llrp;
    known.entry = fresh.entry;
    for (final u in [fresh.uid, fresh.llrp?.uid, fresh.entry?.uid]) {
      if (u != null) _byUid[u] = known;
    }
    return known;
  }

  @override
  Future<RdmPacket> exchange(RdmPacket request, {Duration timeout = const Duration(milliseconds: 1500)}) async {
    var l = _byUid[request.destination];
    if (l == null) {
      // Found by a probe outside discover(): LLRP only.
      final d = llrp.devices[request.destination];
      if (d != null) l = _byUid[d.uid] = Lamp(uid: d.uid, llrp: d);
    }
    if (l == null) throw RdmException('${request.destination} is not on the cable (any more)');
    final conn = broker?.connection;
    final viaBroker = l.entry != null && conn != null && conn.connected;
    final viaLlrp = l.llrp != null;
    if (viaBroker && !(l.llrpFirst && viaLlrp)) {
      try {
        return await RdmnetTransport(conn, l.entry!.uid, Rpt.nullEndpoint)
            .exchange(request.copyWith(destination: l.entry!.uid), timeout: timeout + const Duration(milliseconds: 1500));
      } on RdmTimeoutException {
        if (!viaLlrp) rethrow;
        final r = await llrp.rdm(l.llrp!, request.copyWith(destination: l.llrp!.uid), timeout: timeout);
        l.llrpFirst = true;
        return r;
      }
    }
    if (l.llrp == null) throw RdmException('${request.destination} is not reachable: no broker connection and no LLRP');
    return llrp.rdm(l.llrp!, request.copyWith(destination: l.llrp!.uid), timeout: timeout);
  }
}
