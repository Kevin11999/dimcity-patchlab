import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../core/dns.dart';
import '../net/adapters.dart';
import '../net/udp.dart';

/// One DNS-SD service to advertise: a service instance of [type] (e.g. `_rdmnet._tcp`) on [port], with
/// optional subtypes (`_default._sub._rdmnet._tcp.local`, how RDMnet scopes are found).
class DnsSdService {
  DnsSdService({
    required this.instance,
    required this.type,
    required this.port,
    required this.host,
    this.subtypes = const [],
    this.txt = const [],
  });

  /// "PatchLab RDM Broker abcd": a single DNS label.
  final String instance;

  /// "_rdmnet._tcp"
  final String type;
  final int port;

  /// Host name without ".local".
  final String host;

  /// e.g. "_default" (scope default).
  final List<String> subtypes;
  final List<String> txt;

  String get serviceName => '$type.local';
  String get instanceName => '$instance.$type.local';
  String get hostName => '$host.local';
  List<String> get subtypeNames => [for (final s in subtypes) '$s._sub.$type.local'];
}

/// A multicast DNS responder (RFC 6762) for one service: announces it, answers questions about it,
/// says goodbye when it stops. This is what lets RDMnet lamps on a bare cable find the broker of the
/// app without any configuration.
class MdnsResponder {
  MdnsResponder({required this.socketFactory, required this.adapters, required this.service});

  final UdpSocketFactory socketFactory;
  final Future<List<AdapterInfo>> Function() adapters;
  final DnsSdService service;

  final Map<String, _Port> _ports = <String, _Port>{};
  bool _running = false;
  Timer? _resync;
  final List<String> log = <String>[];
  int queriesAnswered = 0;

  /// Adapters that could not be used (port 5353 taken without sharing, no multicast, …).
  final Map<String, String> unusable = <String, String>{};

  List<String> get adapterIps => _ports.keys.toList();

  Future<void> start() async {
    _running = true;
    await _sync();
    _announce();
    // The first announcements may be lost; repeat them (RFC 6762 section 8.3), then watch the adapters.
    Timer(const Duration(seconds: 1), _announce);
    Timer(const Duration(seconds: 3), _announce);
    _resync = Timer.periodic(const Duration(seconds: 5), (_) async {
      final changed = await _sync();
      if (changed) _announce();
    });
  }

  Future<void> stop() async {
    _running = false;
    _resync?.cancel();
    _send(_records(forAdapter: null, goodbye: true), unicastTo: null);
    for (final p in _ports.values) {
      unawaited(p.sub?.cancel());
      p.socket.close();
    }
    _ports.clear();
  }

  Future<bool> _sync() async {
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
      try {
        final socket = await socketFactory(Dns.mdnsPort, reusePort: true, broadcast: false, localIp: a.ip);
        final joined = await socket.joinMulticast(Dns.mdnsAddress, localIps: [a.ip]);
        final p = _Port(a, socket);
        p.sub = socket.datagrams.listen((d) => _onDatagram(p, d));
        _ports[a.ip] = p;
        unusable.remove(a.ip);
        if (!joined) log.add('join of ${Dns.mdnsAddress} failed on ${a.ip}');
        changed = true;
      } catch (e) {
        unusable[a.ip] = e.toString();
      }
    }
    return changed;
  }

  /// All records of the service. A records only list our addresses on the network of [forAdapter]
  /// (a lamp on a 169.254 cable cannot reach our Wi-Fi address).
  List<DnsRecord> _records({required String? forAdapter, bool goodbye = false}) {
    final s = service;
    final ips = forAdapter != null ? [forAdapter] : adapterIps;
    final recs = <DnsRecord>[
      DnsRecord.ptr(s.serviceName, s.instanceName),
      for (final sub in s.subtypeNames) DnsRecord.ptr(sub, s.instanceName),
      DnsRecord.srv(s.instanceName, s.hostName, s.port),
      DnsRecord.txt(s.instanceName, s.txt),
      for (final ip in ips) DnsRecord.a(s.hostName, ip),
    ];
    return goodbye ? [for (final r in recs) r.goodbye()] : recs;
  }

  void _announce() {
    if (!_running) return;
    for (final p in _ports.values) {
      final recs = _records(forAdapter: p.info.ip);
      final msg = DnsMessage(flags: Dns.flagResponse | Dns.flagAuthoritative, answers: recs);
      p.socket.sendVia(msg.encode(), InternetAddress(Dns.mdnsAddress), Dns.mdnsPort, p.info.ip);
    }
  }

  void _send(List<DnsRecord> recs, {InternetAddress? unicastTo, int unicastPort = Dns.mdnsPort, int id = 0, _Port? via}) {
    for (final p in via != null ? [via] : _ports.values) {
      final own = recs.where((r) => r.type != Dns.typeA || r.aAddress == p.info.ip || via == null).toList();
      final msg = DnsMessage(id: id, flags: Dns.flagResponse | Dns.flagAuthoritative, answers: own);
      final bytes = msg.encode();
      if (unicastTo != null) {
        p.socket.send(bytes, unicastTo, unicastPort);
      } else {
        p.socket.sendVia(bytes, InternetAddress(Dns.mdnsAddress), Dns.mdnsPort, p.info.ip);
      }
    }
  }

  void _onDatagram(_Port port, Datagram d) {
    if (!_running) return;
    DnsMessage m;
    try {
      m = DnsMessage.decode(Uint8List.fromList(d.data));
    } on FormatException {
      return;
    } on RangeError {
      return;
    }
    if (m.isResponse || m.questions.isEmpty) return;
    final s = service;
    final answers = <DnsRecord>[];
    final extra = <DnsRecord>[];
    var wantsUnicast = false;
    final recs = _records(forAdapter: port.info.ip);
    for (final q in m.questions) {
      final isService = Dns.sameName(q.name, s.serviceName) || s.subtypeNames.any((n) => Dns.sameName(q.name, n));
      final isInstance = Dns.sameName(q.name, s.instanceName);
      final isHost = Dns.sameName(q.name, s.hostName);
      final wantsPtr = q.type == Dns.typePtr || q.type == Dns.typeAny;
      if (isService && wantsPtr) {
        answers.addAll(recs.where((r) => r.type == Dns.typePtr && Dns.sameName(r.name, q.name)));
        extra.addAll(recs.where((r) => r.type == Dns.typeSrv || r.type == Dns.typeTxt || r.type == Dns.typeA));
      } else if (isInstance && (q.type == Dns.typeSrv || q.type == Dns.typeTxt || q.type == Dns.typeAny)) {
        answers.addAll(recs.where((r) => Dns.sameName(r.name, s.instanceName) && (q.type == Dns.typeAny || r.type == q.type)));
        extra.addAll(recs.where((r) => r.type == Dns.typeA));
      } else if (isHost && (q.type == Dns.typeA || q.type == Dns.typeAny)) {
        answers.addAll(recs.where((r) => r.type == Dns.typeA));
      } else {
        continue;
      }
      if (q.unicastResponse) wantsUnicast = true;
    }
    if (answers.isEmpty) return;
    queriesAnswered++;
    final seen = <String>{};
    bool fresh(DnsRecord r) => seen.add('${r.name}/${r.type}/${r.data.join(',')}');
    final unique = answers.where(fresh).toList();
    final additional = extra.where(fresh).toList(); // the records the asker will want next (RFC 6763 section 12)
    // A query from a port other than 5353 is a plain DNS lookup (RFC 6762 section 6.7): answer it directly.
    final legacy = d.port != Dns.mdnsPort;
    final msg = DnsMessage(id: legacy ? m.id : 0, flags: Dns.flagResponse | Dns.flagAuthoritative, answers: unique, additional: additional);
    final bytes = msg.encode();
    if (legacy || wantsUnicast) {
      port.socket.send(bytes, d.address, d.port);
    } else {
      port.socket.sendVia(bytes, InternetAddress(Dns.mdnsAddress), Dns.mdnsPort, port.info.ip);
    }
  }

  String report() {
    final b = StringBuffer('mDNS ${service.instanceName} port ${service.port}\n');
    for (final p in _ports.values) {
      b.writeln('  ${p.info.name} ${p.info.ip}');
    }
    for (final e in unusable.entries) {
      b.writeln('  unusable ${e.key}: ${e.value}');
    }
    b.writeln('  queries answered: $queriesAnswered');
    return b.toString();
  }
}

class _Port {
  _Port(this.info, this.socket);
  final AdapterInfo info;
  final UdpSocket socket;
  StreamSubscription<Datagram>? sub;
}
