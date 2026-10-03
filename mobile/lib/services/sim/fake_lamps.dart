import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import '../../core/rdm/rdm_params.dart';
import '../../core/rdmnet/acn.dart';
import '../../core/rdmnet/llrp.dart';
import '../../core/uid.dart';
import '../../net/memory_udp.dart';
import '../../net/udp.dart';
import 'sim_fixture.dart';

/// A simulated RDMnet lamp: one fixture with its own network address.
class DemoLamp {
  DemoLamp({required this.fixture, required this.ip, Cid? cid}) : cid = cid ?? Cid.random(Random(fixture.uid.deviceId));

  final SimFixture fixture;
  final String ip;
  final Cid cid;

  List<int> get mac => [0x02, 0x00, 0x7F, 0xF1, (fixture.uid.deviceId >> 8) & 0xFF, fixture.uid.deviceId & 0xFF];
}

/// A row of simulated RDMnet lamps on a [MemoryUdpHub], answering LLRP probes and
/// LLRP RDM commands the way real lamps do: random reply delay, replies by
/// multicast, known UIDs stay quiet.
class FakeRdmnetLamps {
  FakeRdmnetLamps(this.hub, this.lamps, {this.maxReplyDelay = const Duration(milliseconds: 350), this.dropRate = 0, Random? random})
      : _random = random ?? Random(7);

  final MemoryUdpHub hub;
  final List<DemoLamp> lamps;
  final Duration maxReplyDelay;

  /// Fraction of RDM commands that get no answer.
  double dropRate;
  final Random _random;
  final List<String> log = <String>[];
  final List<UdpSocket> _sockets = <UdpSocket>[];
  final List<StreamSubscription<Datagram>> _subs = <StreamSubscription<Datagram>>[];

  void start() {
    for (final lamp in lamps) {
      final s = hub.open(ip: lamp.ip, port: Llrp.port)..joinMulticast(Llrp.requestAddress);
      _sockets.add(s);
      _subs.add(s.datagrams.listen((d) => _onDatagram(lamp, s, d)));
    }
  }

  void stop() {
    for (final sub in _subs) {
      unawaited(sub.cancel());
    }
    for (final s in _sockets) {
      s.close();
    }
    _subs.clear();
    _sockets.clear();
  }

  void _send(UdpSocket s, Uint8List data) => s.send(data, InternetAddress(Llrp.responseAddress), Llrp.port);

  void _onDatagram(DemoLamp lamp, UdpSocket s, Datagram d) {
    LlrpMessage? m;
    try {
      m = Llrp.decode(d.data);
    } on FormatException {
      return;
    }
    if (m is LlrpProbeRequest) {
      final uid = lamp.fixture.uid;
      if (m.knownUids.contains(uid) || uid.value < m.lower.value || uid.value > m.upper.value) return;
      log.add('probe → ${lamp.fixture.model} ${lamp.ip}');
      final delay = Duration(milliseconds: _random.nextInt(maxReplyDelay.inMilliseconds + 1));
      Timer(delay, () => _send(
            s,
            Llrp.probeReply(
              senderCid: lamp.cid,
              destCid: m!.senderCid,
              transaction: m.transaction,
              uid: uid,
              hardwareAddress: lamp.mac,
              componentType: Llrp.componentRptDevice,
            ),
          ));
    } else if (m is LlrpRdmCommand && m.destCid == lamp.cid) {
      if (_random.nextDouble() < dropRate) {
        log.add('dropped command for ${lamp.ip}');
        return;
      }
      final resp = simRespond(lamp.fixture, m.packet, log);
      if (resp == null) return;
      _send(s, Llrp.rdmCommand(senderCid: lamp.cid, destCid: m.senderCid, transaction: m.transaction, packet: resp));
    }
  }
}

/// The demo row: eight lamps of three types, all on address 1 as they come from the factory,
/// one of which does not answer its first address change so the retry button can be tried.
List<DemoLamp> buildDemoLamps() {
  PersonalityDescription pd(int n, int fp, String name) => PersonalityDescription(personality: n, footprint: fp, description: name);
  final proWash = [pd(1, 8, 'Standard'), pd(2, 14, 'Extended'), pd(3, 20, 'Full')];
  final miniSpot = [pd(1, 10, 'Basic'), pd(2, 16, 'Extended')];
  final strip = [pd(1, 3, 'RGB'), pd(2, 18, '6 pixel'), pd(3, 36, '12 pixel')];
  var n = 0;
  DemoLamp lamp(String model, int modelId, List<PersonalityDescription> p, {int personality = 1, int address = 1, int drop = 0}) {
    final i = n++;
    return DemoLamp(
      ip: '169.254.10.${20 + i}',
      fixture: SimFixture(
        uid: Uid(0x7FF1, 0x2000 + i),
        manufacturer: 'DemoLux',
        model: model,
        modelId: modelId,
        personalities: p,
        personality: personality,
        address: address,
        dropSetAddress: drop,
      ),
    );
  }

  return [
    lamp('ProWash 300', 0x0300, proWash),
    lamp('MiniSpot 60', 0x0060, miniSpot, personality: 2),
    lamp('ProWash 300', 0x0300, proWash),
    lamp('ProWash 300', 0x0300, proWash),
    lamp('MiniSpot 60', 0x0060, miniSpot, personality: 2),
    lamp('PixelStrip 1m', 0x0101, strip, personality: 2, drop: 3),
    lamp('ProWash 300', 0x0300, proWash),
    lamp('MiniSpot 60', 0x0060, miniSpot, personality: 2),
  ];
}
