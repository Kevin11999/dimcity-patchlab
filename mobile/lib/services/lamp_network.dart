import 'dart:typed_data';

import '../core/artnet/artnet.dart';
import 'artnet_service.dart';
import 'lamps_transport.dart';
import 'rdm_client.dart';

/// What a lamp says about its network settings.
class LampNetInfo {
  LampNetInfo({required this.ip, required this.universe, this.mask, this.dhcp, required this.answersIpProg});

  /// Where the lamp answers from now.
  final String ip;

  /// Art-Net Net.Sub-Net.Universe of its (first) output port.
  final PortAddress universe;

  /// Subnet mask and DHCP state, only known when the lamp answers ArtIpProg.
  final String? mask;
  final bool? dhcp;
  final bool answersIpProg;
}

enum NetOutcome {
  /// The lamp reports the new value back.
  ok,

  /// The lamp did not answer: it does not support the command, or the packet did not reach it.
  noAnswer,

  /// The lamp answered, with another value than asked for (it ignores the command).
  ignored,

  /// The computer has no route to the lamp (it is outside the subnets of every adapter).
  notReachable,
}

class NetResult {
  NetResult(this.outcome, {this.detail = ''});
  final NetOutcome outcome;

  /// What the lamp reports instead, for [NetOutcome.ignored].
  final String detail;
  bool get ok => outcome == NetOutcome.ok;
}

/// Network settings of a lamp that speaks Art-Net itself: the universe (ArtAddress, checked in the lamp's next ArtPollReply)
/// and the IP address and subnet mask (ArtIpProg, checked in its ArtIpProgReply). Neither is part of RDM; ACME's manual for the
/// Pixel Line IP only has them in the menu, so whether a lamp answers is found out by asking.
class LampNetwork {
  LampNetwork(this.artnet);
  final ArtNetService artnet;

  static List<int>? parseIp(String text) {
    final p = text.trim().split('.');
    if (p.length != 4) return null;
    final out = <int>[];
    for (final s in p) {
      final n = int.tryParse(s);
      if (n == null || n < 0 || n > 255) return null;
      out.add(n);
    }
    return out;
  }

  /// A subnet mask is ones followed by zeros.
  static bool validMask(List<int> m) {
    final v = (m[0] << 24) | (m[1] << 16) | (m[2] << 8) | m[3];
    if (v == 0) return false;
    final inv = ~v & 0xFFFFFFFF;
    return (inv & (inv + 1)) == 0;
  }

  /// A host address: not 0.x, not 127.x, not multicast / reserved, not a broadcast ending of the all-ones kind.
  static bool validHost(List<int> ip) => ip[0] != 0 && ip[0] != 127 && ip[0] < 224 && !(ip[1] == 255 && ip[2] == 255 && ip[3] == 255);

  /// Parses "0.0.5" (Net.Sub-Net.Universe) or a single number 0-32767 (the 15-bit Port-Address).
  static PortAddress? parsePortAddress(String text) {
    final t = text.trim();
    if (t.contains('.')) {
      final p = t.split('.').map(int.tryParse).toList();
      if (p.length != 3 || p.any((e) => e == null)) return null;
      final (n, s, u) = (p[0]!, p[1]!, p[2]!);
      if (n < 0 || n > 127 || s < 0 || s > 15 || u < 0 || u > 15) return null;
      return PortAddress(n, s, u);
    }
    final v = int.tryParse(t);
    if (v == null || v < 0 || v > 32767) return null;
    return PortAddress.fromValue(v);
  }

  PortAddress _addressOf(ArtPollReply r, int index) =>
      PortAddress(r.netSwitch & 0x7F, r.subSwitch & 0x0F, (index < r.swOut.length ? r.swOut[index] : 0) & 0x0F);

  int _portIndex(ArtRoute route) => route.node.outputPorts.firstOrNull?.index ?? 0;

  Future<LampNetInfo> read(ArtRoute route) async {
    final node = route.node;
    final poll = await artnet.pollNode(node, timeout: const Duration(milliseconds: 1500)) ?? node.first;
    ArtIpProgReply? ip;
    try {
      ip = await artnet.ipProg(node, ArtIpProg.encode(), timeout: const Duration(milliseconds: 1500));
    } on RdmException {
      ip = null;
    }
    return LampNetInfo(
      ip: node.ip,
      universe: _addressOf(poll, _portIndex(route)),
      mask: ip?.mask,
      dhcp: ip?.dhcp,
      answersIpProg: ip != null,
    );
  }

  /// Net, Sub-Net and Universe of the lamp's output port.
  Future<NetResult> setUniverse(ArtRoute route, PortAddress target) async {
    final node = route.node;
    final page = node.first.page;
    final index = _portIndex(route);
    final swOut = List<int?>.filled(4, null);
    swOut[index] = target.universe;
    Uint8List packet = ArtAddress.encode(bindIndex: page, net: target.net, subnet: target.subnet, swOut: swOut);
    final reply = await artnet.sendAddress(node, packet, page: page);
    if (reply == null) return NetResult(NetOutcome.noAnswer);
    final got = _addressOf(reply, index);
    return got == target ? NetResult(NetOutcome.ok) : NetResult(NetOutcome.ignored, detail: '${got.net}.${got.subnet}.${got.universe}');
  }

  /// IP address and subnet mask. After a change the lamp is at its new address: search again.
  Future<NetResult> setIp(ArtRoute route, String ip, String mask) async {
    final ipBytes = parseIp(ip), maskBytes = parseIp(mask);
    if (ipBytes == null || maskBytes == null) return NetResult(NetOutcome.ignored, detail: 'invalid address');
    try {
      final reply = await artnet.ipProg(route.node, ArtIpProg.encode(ip: ipBytes, mask: maskBytes), newIp: ip);
      if (reply == null) return NetResult(NetOutcome.noAnswer);
      if (reply.ip == ip && reply.mask == mask) {
        artnet.nodes.remove(route.node.ip);
        return NetResult(NetOutcome.ok);
      }
      return NetResult(NetOutcome.ignored, detail: '${reply.ip} / ${reply.mask}');
    } on RdmException {
      return NetResult(NetOutcome.notReachable);
    }
  }
}
