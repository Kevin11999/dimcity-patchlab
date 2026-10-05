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
  FakeArtLamp(
    this.hub,
    this.fixture, {
    required this.ip,
    this.segment,
    this.net = 0,
    this.subnet = 0,
    this.universe = 0,
    this.leaveStartCode = false,
    this.answersArtAddress = true,
    this.answersIpProg = true,
    this.answersPoll = true,
    this.strictAddress = false,
  }) : reportedIp = ip;

  final MemoryUdpHub hub;
  final SimFixture fixture;
  final String ip;
  final String? segment;
  int net;
  int subnet;
  int universe;

  /// The address the lamp reports (changes when it is reprogrammed; the in-memory socket keeps its own).
  String reportedIp;
  String mask = '255.0.0.0';
  bool dhcp = false;

  /// Does it act on ArtAddress / answer ArtIpProg? The ACME manual only has these in the menu.
  final bool answersArtAddress;
  final bool answersIpProg;

  /// Does it answer ArtPoll? (A lamp can be reachable and still stay quiet to polls.)
  final bool answersPoll;

  /// Answer ArtRdm only on its own port address, like a node that routes RDM by port.
  final bool strictAddress;

  /// Leave the 0xCC start code in the ArtRdm payload of the answers (some devices do).
  final bool leaveStartCode;

  final List<String> log = <String>[];
  UdpSocket? _socket;
  StreamSubscription<Datagram>? _sub;

  List<int> get _ipBytes => reportedIp.split('.').map(int.parse).toList();

  Uint8List _pollReply() {
    final u = fixture.uid;
    return ArtPollReply.encode(
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
    );
  }

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
        if (!answersPoll) return;
        log.add('poll from ${d.address.address}');
        _broadcast(_pollReply());
      case ArtNet.opTodRequest:
        final req = ArtTodRequest.decode(d.data);
        if (req == null || req.net != net || !req.subUniAddresses.contains((subnet << 4) | universe)) return;
        log.add('tod request');
        _broadcast(ArtTodData.encode(net: net, subUni: (subnet << 4) | universe, uids: [fixture.uid]));
      case ArtNet.opRdm:
        final art = ArtRdm.decode(d.data);
        final req = art == null ? null : RdmPacket.tryDecodeArtNet(art.rdmBytes);
        if (art == null || req == null || req.destination != fixture.uid) return;
        if (strictAddress && (art.net != net || art.subUni != ((subnet << 4) | universe))) return;
        final resp = simRespond(fixture, req, log);
        if (resp == null) return;
        _broadcast(ArtRdm(net: art.net, subUni: art.subUni, rdmBytes: resp.encode(withStartCode: leaveStartCode)).encode());
      case ArtNet.opAddress:
        if (!answersArtAddress || d.data.length < 107) return;
        int? prog(int v) => v & 0x80 != 0 ? v & 0x7F : null;
        net = prog(d.data[12]) ?? net;
        universe = prog(d.data[100]) ?? universe; // SwOut[0]
        subnet = prog(d.data[104]) ?? subnet;
        log.add('ArtAddress $net.$subnet.$universe');
        _broadcast(_pollReply());
      case ArtNet.opIpProg:
        if (!answersIpProg || d.data.length < 24) return;
        final cmd = d.data[14];
        if (cmd & 0x80 != 0) {
          if (cmd & 0x04 != 0) reportedIp = d.data.sublist(16, 20).join('.');
          if (cmd & 0x02 != 0) mask = d.data.sublist(20, 24).join('.');
          log.add('ArtIpProg $reportedIp / $mask');
        }
        _socket?.send(
          ArtIpProgReply.encode(ip: _ipBytes, mask: mask.split('.').map(int.parse).toList(), dhcp: dhcp),
          d.address,
          d.port,
        );
      default:
        break;
    }
  }
}
