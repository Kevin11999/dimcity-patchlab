import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:multicast_dns/multicast_dns.dart';

import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/rdmnet/acn.dart';
import '../core/rdmnet/broker.dart';
import '../core/rdmnet/rpt.dart';
import '../core/uid.dart';
import 'rdm_client.dart';
import 'llrp_service.dart';
import 'stream_utils.dart';

/// A broker found with DNS-SD (_rdmnet._tcp) or entered by hand.
class RdmnetBrokerInfo {
  RdmnetBrokerInfo({required this.host, required this.port, this.scope = Broker.defaultScope, this.name = '', this.manual = false, this.cid, this.uid, this.model, this.manufacturer});

  final String host;
  final int port;
  final String scope;
  final String name;
  final bool manual;
  final String? cid;
  final String? uid;
  final String? model;
  final String? manufacturer;

  @override
  String toString() => '$host:$port ($scope)';
}

class GatewayEndpoint {
  GatewayEndpoint({required this.id, required this.type, this.universe, List<Uid>? responders}) : responders = responders ?? <Uid>[];
  final int id;
  final int type;
  int? universe;
  List<Uid> responders;
}

/// An RPT device (gateway node) on the broker with its endpoints (DMX ports).
class RdmnetGateway {
  RdmnetGateway({required this.entry, required this.connection, this.ip, this.hardwareAddress, this.label});

  final ClientEntry entry;
  final BrokerConnection connection;
  String? ip;
  String? hardwareAddress;
  String? label;
  final List<GatewayEndpoint> endpoints = <GatewayEndpoint>[];

  Uid get uid => entry.uid;
  Cid get cid => entry.cid;
}

/// RDMnet (ANSI E1.33) side of the app: the second route to the fixtures when
/// a node runs sACN and talks RDMnet instead of Art-Net RDM.
class RdmnetService {
  RdmnetService({required this.cid, required this.controllerUid});

  final Cid cid;
  final Uid controllerUid;

  /// Browses DNS-SD for brokers. [timeout] bounds the whole browse.
  Future<List<RdmnetBrokerInfo>> discoverBrokers({Duration timeout = const Duration(seconds: 3)}) async {
    final found = <String, RdmnetBrokerInfo>{};
    final client = MDnsClient();
    try {
      await client.start();
      final deadline = DateTime.now().add(timeout);
      const query = '_rdmnet._tcp.local';
      await for (final ptr in client.lookup<PtrResourceRecord>(ResourceRecordQuery.serverPointer(query)).timeout(timeout, onTimeout: (sink) => sink.close())) {
        final remaining = deadline.difference(DateTime.now());
        if (remaining.isNegative) break;
        await for (final srv in client.lookup<SrvResourceRecord>(ResourceRecordQuery.service(ptr.domainName)).timeout(remaining, onTimeout: (sink) => sink.close())) {
          final txt = <String, String>{};
          await for (final t in client.lookup<TxtResourceRecord>(ResourceRecordQuery.text(ptr.domainName)).timeout(const Duration(seconds: 1), onTimeout: (sink) => sink.close())) {
            for (final line in t.text.split(RegExp(r'[\n\r]+'))) {
              final i = line.indexOf('=');
              if (i > 0) txt[line.substring(0, i).trim()] = line.substring(i + 1).trim();
            }
          }
          String host = srv.target;
          await for (final a in client.lookup<IPAddressResourceRecord>(ResourceRecordQuery.addressIPv4(srv.target)).timeout(const Duration(seconds: 1), onTimeout: (sink) => sink.close())) {
            host = a.address.address;
            break;
          }
          final key = '$host:${srv.port}';
          found[key] = RdmnetBrokerInfo(
            host: host,
            port: srv.port,
            scope: txt['E133Scope'] ?? txt['ConfScope'] ?? Broker.defaultScope,
            name: ptr.domainName.split('._rdmnet').first,
            cid: txt['CID'],
            uid: txt['UID'],
            model: txt['Model'],
            manufacturer: txt['Manuf'],
          );
        }
      }
    } catch (_) {
      // mDNS not available (no multicast permission, no Wi-Fi): return what we have.
    } finally {
      client.stop();
    }
    return found.values.toList();
  }

  /// Opens a broker connection (handshake included).
  Future<BrokerConnection> connect(RdmnetBrokerInfo broker, {Duration timeout = const Duration(seconds: 5)}) =>
      BrokerConnection.connect(host: broker.host, port: broker.port, cid: cid, uid: controllerUid, scope: broker.scope, timeout: timeout);
}

/// A TCP connection to one broker: handshake, client list, heartbeat and RPT requests.
class BrokerConnection {
  BrokerConnection._(this._socket, this.cid, this.uid, this.scope, this.host, this.port);

  static Future<BrokerConnection> connect({
    required String host,
    required int port,
    required Cid cid,
    required Uid uid,
    String scope = Broker.defaultScope,
    Duration timeout = const Duration(seconds: 5),
  }) async {
    final socket = await Socket.connect(host, port, timeout: timeout);
    socket.setOption(SocketOption.tcpNoDelay, true);
    final c = BrokerConnection._(socket, cid, uid, scope, host, port);
    c._listen();
    try {
      await c._handshake(timeout);
    } catch (e) {
      c.close();
      rethrow;
    }
    return c;
  }

  final Socket _socket;
  final Cid cid;
  final Uid uid;
  final String scope;
  final String host;
  final int port;

  final AcnTcpFramer _framer = AcnTcpFramer();
  final Map<int, Completer<RptMessage>> _pending = <int, Completer<RptMessage>>{};
  final _brokerMessages = StreamController<BrokerMessage>.broadcast();
  final _clientsChanged = StreamController<void>.broadcast();
  final List<ClientEntry> clients = <ClientEntry>[];

  Timer? _heartbeat;
  DateTime _lastReceived = DateTime.now();
  int _sequence = 0;
  bool _closed = false;
  Uid? brokerUid;
  Uid? assignedUid;
  String? closeReason;

  bool get connected => !_closed;
  Stream<void> get clientsChanged => _clientsChanged.stream;
  List<ClientEntry> get devices => clients.where((c) => c.isRptDevice).toList();

  void _listen() {
    _socket.listen(
      (chunk) {
        if (_closed) return; // data that was already on its way when we closed
        _lastReceived = DateTime.now();
        List<RootLayerPdu> pdus;
        try {
          pdus = _framer.feed(chunk);
        } on FormatException catch (e) {
          closeReason = e.message;
          close();
          return;
        }
        for (final p in pdus) {
          _dispatch(p);
        }
      },
      onDone: () => close(),
      onError: (Object e) {
        closeReason = e.toString();
        close();
      },
    );
  }

  void _dispatch(RootLayerPdu p) {
    try {
      if (p.vector == Acn.vectorRootBroker) {
        final m = Broker.decode(p);
        if (m is ClientListMessage) {
          if (m.isFullList) {
            clients
              ..clear()
              ..addAll(m.entries);
          } else if (m.isAdd) {
            for (final e in m.entries) {
              clients.removeWhere((c) => c.cid == e.cid);
              clients.add(e);
            }
          } else if (m.isRemove) {
            for (final e in m.entries) {
              clients.removeWhere((c) => c.cid == e.cid);
            }
          } else {
            for (final e in m.entries) {
              final i = clients.indexWhere((c) => c.cid == e.cid);
              if (i >= 0) clients[i] = e;
            }
          }
          if (!_clientsChanged.isClosed) _clientsChanged.add(null);
        } else if (m is DisconnectMessage) {
          closeReason = 'Broker disconnect (${m.reason})';
          close();
        }
        if (!_brokerMessages.isClosed) _brokerMessages.add(m);
      } else if (p.vector == Acn.vectorRootRpt) {
        final m = Rpt.decode(p);
        final c = _pending.remove(m.header.sequence);
        if (c != null && !c.isCompleted) c.complete(m);
      }
    } on FormatException {
      // ignore a malformed PDU, keep the connection
    } on RangeError {
      // same
    }
  }

  Future<void> _handshake(Duration timeout) async {
    final reply = firstMatching<BrokerMessage>(_brokerMessages.stream, (m) => m is ConnectReply || m is RedirectMessage, timeout);
    _socket.add(Broker.clientConnect(cid: cid, uid: uid, scope: scope));
    final m = await reply;
    if (m == null) throw RdmException('Broker $host:$port did not answer the connect');
    if (m is RedirectMessage) throw RdmException('Broker redirects to ${m.ip}:${m.port}');
    final r = m as ConnectReply;
    if (!r.ok) throw RdmException('Broker refused: ${Broker.connectStatusText(r.status)}');
    brokerUid = r.brokerUid;
    assignedUid = r.clientUid;
    final list = firstMatching<BrokerMessage>(_brokerMessages.stream, (m) => m is ClientListMessage && m.isFullList, timeout);
    _socket.add(Broker.fetchClientList(cid));
    await list;
    _heartbeat = Timer.periodic(Broker.heartbeatInterval, (_) {
      if (DateTime.now().difference(_lastReceived) > Broker.heartbeatTimeout) {
        closeReason = 'Broker heartbeat timeout';
        close();
        return;
      }
      _socket.add(Broker.nullMessage(cid));
    });
  }

  /// Sends an RDM command to [destUid] on [destEndpoint] and returns the notification.
  Future<RptNotification> rptRequest(Uid destUid, int destEndpoint, RdmPacket packet, {Duration timeout = const Duration(seconds: 3)}) async {
    if (_closed) throw RdmException('Broker connection closed');
    final seq = ++_sequence;
    final header = RptHeader(sourceUid: assignedUid ?? uid, sourceEndpoint: Rpt.nullEndpoint, destUid: destUid, destEndpoint: destEndpoint, sequence: seq);
    final completer = Completer<RptMessage>();
    _pending[seq] = completer;
    _socket.add(Rpt.request(cid, header, packet));
    final m = await completer.future.timeout(timeout, onTimeout: () {
      _pending.remove(seq);
      throw RdmTimeoutException('No RPT answer for ${Pid.name(packet.pid)} from $destUid');
    });
    if (m is RptNotification) return m;
    if (m is RptStatus) {
      if (m.code == Rpt.statusRdmTimeout) throw RdmTimeoutException('RDM timeout via gateway');
      throw RdmException('RPT status: ${Rpt.statusText(m.code)} ${m.text}'.trim());
    }
    throw RdmException('Unexpected RPT message');
  }

  /// Reads every RPT device's endpoints, universes and responders.
  Future<List<RdmnetGateway>> loadGateways({List<LlrpDevice> llrp = const []}) async {
    final out = <RdmnetGateway>[];
    for (final entry in devices) {
      final g = RdmnetGateway(entry: entry, connection: this);
      final match = llrp.where((c) => c.cid == entry.cid || c.uid == entry.uid).firstOrNull;
      if (match != null) {
        g.ip = match.ip;
        g.hardwareAddress = match.hardwareAddress;
      }
      final client = RdmClient(RdmnetTransport(this, entry.uid, Rpt.nullEndpoint));
      try {
        final label = await client.deviceLabel(entry.uid);
        final model = await client.deviceModelDescription(entry.uid);
        g.label = label.isNotEmpty ? label : (model.isNotEmpty ? model : null);
      } on RdmException {
        // optional
      }
      try {
        final list = await client.endpointList(entry.uid);
        for (final e in list.endpoints) {
          final ep = GatewayEndpoint(id: e.id, type: e.type);
          try {
            ep.universe = (await client.endpointToUniverse(entry.uid, e.id))?.universe;
          } on RdmException {
            // optional
          }
          try {
            ep.responders = (await client.endpointResponders(entry.uid, e.id)).responders;
          } on RdmException {
            // read later during discovery
          }
          g.endpoints.add(ep);
        }
      } on RdmException {
        // a device without E1.37-7 endpoints: nothing to address behind it
      }
      out.add(g);
    }
    return out;
  }

  void close() {
    if (_closed) return;
    _closed = true;
    _heartbeat?.cancel();
    try {
      _socket.add(Broker.disconnect(cid));
    } catch (_) {
      // socket already gone
    }
    unawaited(_socket.close().catchError((_) {}));
    for (final c in _pending.values) {
      if (!c.isCompleted) c.completeError(RdmException('Broker connection closed'));
    }
    _pending.clear();
    unawaited(_brokerMessages.close());
    unawaited(_clientsChanged.close());
  }
}

/// RDM through a broker to the responders on one endpoint of a gateway.
class RdmnetTransport implements RdmTransport {
  RdmnetTransport(this.connection, this.gatewayUid, this.endpoint);

  final BrokerConnection connection;
  final Uid gatewayUid;
  final int endpoint;

  @override
  String get routeName => 'RDMnet';

  @override
  Uid get controllerUid => connection.assignedUid ?? connection.uid;

  @override
  Future<RdmPacket> exchange(RdmPacket request, {Duration timeout = const Duration(seconds: 3)}) async {
    final notification = await connection.rptRequest(request.destination, endpoint, request, timeout: timeout);
    final responses = notification.responses.where((p) => p.transactionNumber == request.transactionNumber || p.pid == request.pid).toList();
    if (responses.isEmpty) throw RdmTimeoutException('Notification without a response');
    if (responses.length == 1) return responses.first;
    // The gateway reassembles ACK_OVERFLOW into several response PDUs: glue them.
    final data = <int>[];
    for (final r in responses) {
      if (r.isNack) return r;
      data.addAll(r.data);
    }
    return RdmPacket(
      destination: responses.last.destination,
      source: responses.last.source,
      transactionNumber: responses.last.transactionNumber,
      portIdOrResponseType: Rdm.responseAck,
      commandClass: responses.last.commandClass,
      pid: responses.last.pid,
      data: Uint8List.fromList(data),
    );
  }

  /// The gateway runs discovery itself; ENDPOINT_RESPONDERS is its table of devices.
  @override
  Future<List<Uid>> discover({bool flush = true, Duration timeout = const Duration(seconds: 12)}) async {
    final client = RdmClient(RdmnetTransport(connection, gatewayUid, Rpt.nullEndpoint));
    final r = await client.endpointResponders(gatewayUid, endpoint);
    return r.responders..sort();
  }
}
