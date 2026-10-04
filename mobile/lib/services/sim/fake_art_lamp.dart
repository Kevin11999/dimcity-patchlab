import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../../core/artnet/artnet.dart';
import '../../core/rdm/rdm_packet.dart';
import '../../net/memory_udp.dart';
import '../../net/udp.dart';
import 'sim_fixture.dart';

/// A simulated lamp that speaks Art-Net itself (a Pixel Line IP, an ACME Strobe 3 IP): it answers ArtPoll with an
/// ArtPollReply that carries its own UID, its Table of Devices with that one UID, and RDM in ArtRdm. Like the real
/// ones it answers by broadcast (it has no route to a laptop in another subnet).
class FakeArtLamp {
  FakeArtLamp(this.hub, this.fixture, {required this.ip, this.segment, this.net = 0, this.subnet = 0, this.universe = 0, this.leaveStartCode = false});

  final MemoryUdpHub hub;
  final SimFixture fixture;
  final String ip;
  final String? segment;
  final int net;
  final int subnet;
  final int universe;

  /// Leave the 0xCC start code in the ArtRdm payload of the answers (some devices do).
  final bool leaveStartCode;

  final List<String> log = <String>[];
  UdpSocket? _socket;
  StreamSubscription<Datagram>? _sub;

  List<int> get _ipBytes => ip.split('.').map(int.parse).toList();

  void start() {
    final s = hub.open(ip: ip, port: ArtNet.port, segment: segment);
    _socket = s;
    _sub = s.datagrams.listen(_onDatagram);
  }

  void stop() {
    unawaited(_sub?.cancel());
    _socket?.close();
  }

  void _broadcast(Uint8List data) => _socket?.send(data, InternetAddress('255.255.255.255'), ArtNet.port);

  void _onDatagram(Datagram d) {
    final op = ArtNet.opcodeOf(d.data);
    if (op == null) return;
    switch (op) {
      case ArtNet.opPoll:
        log.add('poll from ${d.address.address}');
        final u = fixture.uid;
        _broadcast(ArtPollReply.encode(
          ip: _ipBytes,
          shortName: fixture.model,
          longName: '${fixture.manufacturer} ${fixture.model}',
          netSwitch: net,
          subSwitch: subnet,
          swOut: [universe],
          portTypes: const [0x80],
          goodOutput: const [0x80],
          numPorts: 1,
          mac: [0x02, 0x00, 0x00, (u.deviceId >> 16) & 0xFF, (u.deviceId >> 8) & 0xFF, u.deviceId & 0xFF],
          defaultResponderUid: [u.manufacturerId >> 8, u.manufacturerId & 0xFF, (u.deviceId >> 24) & 0xFF, (u.deviceId >> 16) & 0xFF, (u.deviceId >> 8) & 0xFF, u.deviceId & 0xFF],
        ));
      case ArtNet.opTodRequest:
        final req = ArtTodRequest.decode(d.data);
        if (req == null || req.net != net || !req.subUniAddresses.contains((subnet << 4) | universe)) return;
        log.add('tod request');
        _broadcast(ArtTodData.encode(net: net, subUni: (subnet << 4) | universe, uids: [fixture.uid]));
      case ArtNet.opRdm:
        final art = ArtRdm.decode(d.data);
        final req = art == null ? null : RdmPacket.tryDecodeArtNet(art.rdmBytes);
        if (art == null || req == null || req.destination != fixture.uid) return;
        final resp = simRespond(fixture, req, log);
        if (resp == null) return;
        _broadcast(ArtRdm(net: art.net, subUni: art.subUni, rdmBytes: resp.encode(withStartCode: leaveStartCode)).encode());
      default:
        break;
    }
  }
}
