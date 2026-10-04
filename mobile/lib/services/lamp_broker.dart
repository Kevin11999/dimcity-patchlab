import 'dart:async';
import 'dart:math';

import '../core/rdmnet/acn.dart';
import '../core/rdmnet/broker.dart';
import '../core/uid.dart';
import '../net/adapters.dart';
import '../net/udp.dart';
import 'broker_server.dart';
import 'mdns_responder.dart';
import 'rdmnet_service.dart';

/// The RDMnet side for lamps on a cable, the way RDMnet is meant to work:
///
///  1. Look for a broker that is already there (a console, another laptop). If there is one, connect to it.
///  2. If not, be the broker: run one on this laptop and advertise it with DNS-SD, so the lamps find it
///     by themselves (they all look for a broker on scope "default" and wait for one to show up).
///
/// Either way the app ends up as a controller on a broker, with the lamps in its client list.
class LampBroker {
  LampBroker({
    required this.cid,
    required this.controllerUid,
    required this.adapters,
    required this.socketFactory,
    required this.discovery,
    this.scope = Broker.defaultScope,
    this.advertise = true,
    Random? random,
  }) : _random = random ?? Random.secure();

  final Cid cid;
  final Uid controllerUid;
  final Future<List<AdapterInfo>> Function() adapters;
  final UdpSocketFactory socketFactory;

  /// Finds brokers that are already on the network (mDNS browse). Null: do not look, always run our own.
  final RdmnetService? discovery;
  final String scope;

  /// Advertise our own broker with mDNS (false in tests that connect by hand).
  final bool advertise;
  final Random _random;

  BrokerServer? server;
  MdnsResponder? responder;
  BrokerConnection? connection;

  /// 'none', 'own' (this app is the broker) or 'external'.
  String mode = 'none';
  String status = '';
  Future<void>? _ensuring;

  bool get connected => connection?.connected ?? false;

  /// RDMnet lamps (RPT devices) on the broker.
  List<ClientEntry> get lamps => connection?.devices ?? const [];

  /// The service record that makes our broker findable: type `_rdmnet._tcp`, subtype `_<scope>._sub`,
  /// TXT keys as E1.33 section 9.1 lists them (TxtVers first).
  static DnsSdService service({
    required Cid cid,
    required Uid uid,
    required int port,
    String scope = Broker.defaultScope,
    String instance = 'PatchLab RDM Broker',
    String host = 'patchlab-rdm',
  }) =>
      DnsSdService(
        instance: instance,
        type: '_rdmnet._tcp',
        port: port,
        host: host,
        subtypes: ['_$scope'],
        txt: [
          'TxtVers=1',
          'E133Scope=$scope',
          'E133Vers=${Broker.e133Version}',
          'CID=$cid',
          'UID=$uid',
          'Model=PatchLab RDM',
          'Manuf=DimCity',
        ],
      );

  /// Makes sure the app is a controller on a broker. Safe to call often; returns when it has settled.
  Future<void> ensure() => _ensuring ??= _ensure().whenComplete(() => _ensuring = null);

  Future<void> _ensure() async {
    if (connected) return;
    connection?.close();
    connection = null;
    // 1. A broker that is already there.
    final d = discovery;
    if (d != null) {
      try {
        final found = (await d.discoverBrokers(timeout: const Duration(seconds: 2))).where((b) => b.scope == scope).toList();
        for (final b in found) {
          // Our own broker advertises itself too; do not treat it as someone else's.
          if (server != null && b.port == server!.port) continue;
          try {
            connection = await d.connect(b);
            mode = 'external';
            status = 'broker ${b.host}:${b.port}';
            return;
          } on Exception catch (e) {
            status = 'broker ${b.host}:${b.port}: $e';
          }
        }
      } catch (e) {
        status = 'mDNS: $e';
      }
    }
    // 2. Be the broker.
    try {
      await _startOwn();
      final s = server!;
      connection = await BrokerConnection.connect(host: '127.0.0.1', port: s.port, cid: cid, uid: controllerUid, scope: scope);
      mode = 'own';
      status = 'own broker on port ${s.port}';
    } catch (e) {
      mode = 'none';
      status = 'broker: $e';
    }
  }

  Future<void> _startOwn() async {
    if (server != null) return;
    final s = BrokerServer(cid: Cid.random(_random), scope: scope);
    final port = await s.start();
    server = s;
    if (!advertise) return;
    final r = MdnsResponder(
      socketFactory: socketFactory,
      adapters: adapters,
      service: service(cid: s.cid, uid: s.uid, port: port, scope: scope, instance: 'PatchLab RDM Broker ${_random.nextInt(0x10000).toRadixString(16).padLeft(4, '0')}'),
    );
    responder = r;
    try {
      await r.start();
    } catch (e) {
      status = 'mDNS responder: $e';
    }
  }

  String report() {
    final b = StringBuffer('RDMnet broker: $mode, $status\n');
    final s = server;
    if (s != null) {
      b.writeln('  own broker $uid on port ${s.port}: ${s.clients.length} clients (${s.devices.length} devices)');
      for (final l in s.log.reversed.take(12).toList().reversed) {
        b.writeln('    $l');
      }
    }
    final r = responder;
    if (r != null) b.write(r.report().split('\n').map((l) => l.isEmpty ? l : '  $l').join('\n'));
    return b.toString();
  }

  Uid get uid => server?.uid ?? controllerUid;

  Future<void> stop() async {
    connection?.close();
    connection = null;
    await responder?.stop();
    responder = null;
    await server?.stop();
    server = null;
    mode = 'none';
  }
}
