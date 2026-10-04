import 'dart:async';
import 'dart:io';

import '../../core/rdmnet/acn.dart';
import '../../core/rdmnet/broker.dart';
import '../../core/rdmnet/rpt.dart';
import '../../core/uid.dart';
import 'fake_lamps.dart';
import 'sim_fixture.dart';

/// A simulated lamp that connects to a broker over TCP as an RPT device, the way a real RDMnet fixture
/// does once it has found a broker. It answers RPT requests with the same fixture model the LLRP side uses.
class FakeBrokerLamp {
  FakeBrokerLamp(this.lamp, {this.scope = Broker.defaultScope, this.requestDynamicUid = false});

  final DemoLamp lamp;
  final String scope;

  /// Ask the broker for a dynamic UID (manufacturer id with the top bit set, device id 0) instead of using the lamp's own.
  final bool requestDynamicUid;

  Socket? _socket;
  final AcnTcpFramer _framer = AcnTcpFramer();
  Timer? _heartbeat;

  /// Number of RDM requests answered through the broker.
  int answered = 0;

  /// Drop every request instead of answering (the broker route is dead, LLRP must take over).
  bool mute = false;

  Uid? assignedUid;

  Future<void> connect(String host, int port) async {
    final s = await Socket.connect(host, port);
    _socket = s;
    s.setOption(SocketOption.tcpNoDelay, true);
    final uid = requestDynamicUid ? Uid(lamp.fixture.uid.manufacturerId | 0x8000, 0) : lamp.fixture.uid;
    final reply = Completer<ConnectReply>();
    s.listen((chunk) {
      for (final p in _framer.feed(chunk)) {
        if (p.vector == Acn.vectorRootBroker) {
          final m = Broker.decode(p);
          if (m is ConnectReply && !reply.isCompleted) reply.complete(m);
        } else if (p.vector == Acn.vectorRootRpt) {
          _onRpt(p);
        }
      }
    }, onError: (Object _) {}, onDone: () {});
    s.add(Broker.clientConnect(cid: lamp.cid, uid: uid, scope: scope, clientType: Broker.rptClientTypeDevice));
    final r = await reply.future.timeout(const Duration(seconds: 3));
    if (!r.ok) throw StateError('broker refused: ${r.status}');
    assignedUid = r.clientUid;
    _heartbeat = Timer.periodic(Broker.heartbeatInterval, (_) => _socket?.add(Broker.nullMessage(lamp.cid)));
  }

  void _onRpt(RootLayerPdu p) {
    final m = Rpt.decode(p);
    if (m is! RptRequest || mute) return;
    for (final request in m.packets) {
      final response = simRespond(lamp.fixture, request.copyWith(destination: lamp.fixture.uid));
      if (response == null) continue;
      answered++;
      final h = m.header;
      _socket?.add(Rpt.notification(
        lamp.cid,
        RptHeader(sourceUid: assignedUid ?? lamp.fixture.uid, sourceEndpoint: h.destEndpoint, destUid: h.sourceUid, destEndpoint: h.sourceEndpoint, sequence: h.sequence),
        response.copyWith(source: assignedUid ?? lamp.fixture.uid),
      ));
    }
  }

  void disconnect() {
    _heartbeat?.cancel();
    _socket?.destroy();
    _socket = null;
  }
}
