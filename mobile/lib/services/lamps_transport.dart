import 'dart:async';

import '../core/artnet/artnet.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/rdmnet/acn.dart';
import '../core/rdmnet/broker.dart';
import '../core/rdmnet/rpt.dart';
import '../core/uid.dart';
import 'artnet_service.dart';
import 'lamp_broker.dart';
import 'llrp_service.dart';
import 'rdm_client.dart';
import 'rdmnet_service.dart';

/// How to reach a lamp over Art-Net: the node (a lamp that speaks Art-Net itself, or a node with the lamp behind
/// one of its ports), the port address the RDM goes to and the UID the lamp has there.
class ArtRoute {
  ArtRoute(this.node, this.address, this.uid);
  final ArtNetNodeInfo node;
  final PortAddress address;
  final Uid uid;
}

/// One lamp as the app sees it, found by one or more of three ways: LLRP, the RDMnet broker and Art-Net. The
/// views of one lamp are matched on its UID, and for RDMnet on its CID (the UID LLRP reports can differ from the
/// one the broker gave it).
class Lamp {
  Lamp({required this.uid, this.llrp, this.entry, this.art});

  /// The UID the rest of the app knows the lamp by.
  final Uid uid;
  LlrpDevice? llrp;
  ClientEntry? entry;
  ArtRoute? art;

  /// The route that worked last: 'broker', 'llrp' or 'artnet'. Asked first the next time.
  String? lastGood;

  Cid? get cid => entry?.cid ?? llrp?.cid;
  bool get onBroker => entry != null;
  bool get onArtNet => art != null;

  /// Every UID the lamp is known by.
  Set<Uid> get uids => {uid, ?llrp?.uid, ?entry?.uid, ?art?.uid};

  String get routes => [if (entry != null) 'broker', if (llrp != null) 'llrp', if (art != null) 'artnet'].join('+');
}

/// RDM to the lamps on the cable, over whatever the lamps speak:
///
///  * RDMnet: RPT through a broker (the app's own, or the one on the network) when the lamp is connected to it,
///    LLRP straight to the lamp otherwise (no broker, no DHCP, no IP configuration needed);
///  * Art-Net: lamps that answer ArtPoll themselves (they sit on 2.x.x.x or 10.x.x.x), and lamps behind a node.
///
/// A lamp that can be reached more than one way is asked the way that worked last and falls back to the others
/// when that times out. The caller only sees one list of UIDs.
class LampsTransport implements RdmTransport {
  LampsTransport(this.llrp, {this.broker, this.artnet});

  final LlrpService llrp;
  final LampBroker? broker;
  final ArtNetService? artnet;

  /// Every UID a lamp is known by points at the same [Lamp].
  final Map<Uid, Lamp> _byUid = <Uid, Lamp>{};

  /// The lamps of the last discovery.
  List<Lamp> lamps = <Lamp>[];

  /// Art-Net lamps whose address is in none of our subnets (their IPs): the laptop needs an address in their range.
  List<String> outOfSubnet = <String>[];

  @override
  String get routeName {
    final art = lamps.any((l) => l.onArtNet);
    final net = lamps.any((l) => l.llrp != null || l.onBroker);
    if (art && net) return 'Art-Net + RDMnet';
    return art ? 'Art-Net' : 'RDMnet';
  }

  @override
  Uid get controllerUid => llrp.controllerUid;

  /// How long to wait for lamps that LLRP saw to show up on our own broker (they find it with DNS-SD).
  static const _joinGrace = Duration(seconds: 4);

  @override
  Future<List<Uid>> discover({bool flush = true, Duration timeout = const Duration(seconds: 12)}) async {
    final b = broker;
    final brokerReady = b == null ? Future<void>.value() : b.ensure().timeout(const Duration(seconds: 8), onTimeout: () {});
    final results = await Future.wait<Object?>([llrp.probe(), brokerReady, _discoverArtNet()]);
    final devices = (results[0]! as List<LlrpDevice>).where((d) => d.isDevice).toList();
    final art = results[2]! as Map<Uid, ArtRoute>;
    if (b != null && b.connected && devices.any((d) => !b.lamps.any((e) => e.cid == d.cid))) {
      await _waitForBroker(b, devices);
    }
    return _merge(devices, art);
  }

  /// ArtPoll out of every adapter, then the Table of Devices of every node that answered, plus the UID a node
  /// announces in its ArtPollReply (a lamp that is its own responder). Times follow what works in the field:
  /// 1.2 s for the poll replies, a short wait for the TOD.
  Future<Map<Uid, ArtRoute>> _discoverArtNet() async {
    final a = artnet;
    final found = <Uid, ArtRoute>{};
    outOfSubnet = <String>[];
    if (a == null) return found;
    try {
      await a.syncInterfaces();
      final started = DateTime.now();
      a.poll();
      await Future<void>.delayed(const Duration(milliseconds: 600));
      a.poll();
      await Future<void>.delayed(const Duration(milliseconds: 700));
      final nodes = a.nodes.values.where((n) => n.lastSeen.isAfter(started)).toList();
      final jobs = <Future<void>>[];
      for (final n in nodes) {
        final addresses = n.rdmAddresses;
        if (addresses.isEmpty) continue;
        if (!a.isLocal(n.ip)) outOfSubnet.add(n.ip);
        final own = n.ownUid;
        if (own != null) found[own] = ArtRoute(n, addresses.first, own);
        for (final address in addresses) {
          jobs.add(() async {
            try {
              final r = await a.requestTod(n, address, flush: false, timeout: const Duration(milliseconds: 1800));
              for (final u in r.uids) {
                found.putIfAbsent(u, () => ArtRoute(n, address, u));
              }
            } on RdmException {
              // a node that does not answer the TOD request: its own UID (above) may still be there
            }
          }());
        }
      }
      await Future.wait(jobs);
    } catch (_) {
      // Art-Net sockets that could not be opened show up in the diagnostics; the RDMnet lamps still work.
    }
    return found;
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

  List<Uid> _merge(List<LlrpDevice> devices, Map<Uid, ArtRoute> art) {
    final entries = broker?.connected == true ? broker!.lamps : const <ClientEntry>[];
    final out = <Lamp>[];
    final usedCids = <Cid>{};
    for (final e in entries) {
      final l = devices.where((d) => d.cid == e.cid).firstOrNull;
      out.add(Lamp(uid: e.uid, llrp: l, entry: e));
      usedCids.add(e.cid);
    }
    for (final d in devices.where((d) => !usedCids.contains(d.cid))) {
      out.add(Lamp(uid: d.uid, llrp: d));
    }
    for (final r in art.entries) {
      final same = out.where((l) => l.uids.contains(r.key)).firstOrNull;
      if (same != null) {
        same.art = r.value;
      } else {
        out.add(Lamp(uid: r.key, art: r.value));
      }
    }
    lamps = [for (final l in out) _remember(l)];
    return [for (final l in lamps) l.uid]..sort();
  }

  /// Keeps one [Lamp] per physical lamp over repeated searches (and its "this route worked" memory).
  Lamp _remember(Lamp fresh) {
    final known = _byUid.values.where((l) => (fresh.cid != null && l.cid == fresh.cid) || l.uids.any(fresh.uids.contains)).firstOrNull;
    final lamp = known ?? fresh;
    if (known != null) {
      known.llrp = fresh.llrp ?? known.llrp;
      known.entry = fresh.entry;
      known.art = fresh.art ?? known.art;
    }
    for (final u in lamp.uids) {
      _byUid[u] = lamp;
    }
    return lamp;
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
    final lamp = l;
    final conn = broker?.connection;
    final attempts = <String, Future<RdmPacket> Function()>{
      if (lamp.entry != null && conn != null && conn.connected)
        'broker': () => RdmnetTransport(conn, lamp.entry!.uid, Rpt.nullEndpoint)
            .exchange(request.copyWith(destination: lamp.entry!.uid), timeout: timeout + const Duration(milliseconds: 1500)),
      if (lamp.llrp != null) 'llrp': () => llrp.rdm(lamp.llrp!, request.copyWith(destination: lamp.llrp!.uid), timeout: timeout),
      if (lamp.art != null && artnet != null)
        'artnet': () => artnet!.sendRdm(lamp.art!.node, lamp.art!.address, request.copyWith(destination: lamp.art!.uid), timeout: timeout),
    };
    if (attempts.isEmpty) throw RdmException('${request.destination} is not reachable: no broker connection, no LLRP, no Art-Net');
    final order = [if (attempts.containsKey(lamp.lastGood)) lamp.lastGood!, ...attempts.keys.where((k) => k != lamp.lastGood)];
    RdmException? last;
    for (final name in order) {
      try {
        final r = await attempts[name]!();
        lamp.lastGood = name;
        return r;
      } on RdmException catch (e) {
        last = e;
      }
    }
    throw last!;
  }

  /// What the lamps were found by, for the diagnostics.
  String report() {
    final b = StringBuffer('Lamps: ${lamps.length}\n');
    for (final l in lamps) {
      b.writeln('  ${l.uid} via ${l.routes}${l.art == null ? '' : ' (Art-Net ${l.art!.node.ip}, port address ${l.art!.address.net}.${l.art!.address.subnet}.${l.art!.address.universe})'}');
    }
    if (outOfSubnet.isNotEmpty) b.writeln('  Art-Net lamps outside our subnets: ${outOfSubnet.join(', ')}');
    return b.toString();
  }
}
