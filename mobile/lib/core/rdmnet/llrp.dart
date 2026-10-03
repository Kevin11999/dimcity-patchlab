import 'dart:typed_data';

import '../bytes.dart';
import '../rdm/rdm_packet.dart';
import '../uid.dart';
import 'acn.dart';

/// ANSI E1.33 LLRP (Low Level Recovery Protocol, section 5): UDP multicast
/// discovery of RDMnet components and a small set of RDM commands to them
/// (COMPONENT_SCOPE, DEVICE_INFO, IDENTIFY_DEVICE …). LLRP reaches the node
/// itself, not the fixtures behind it.
class Llrp {
  Llrp._();

  static const requestAddress = '239.255.250.133';
  static const responseAddress = '239.255.250.134';
  static const port = 5569;
  static const timeout = Duration(milliseconds: 2000);
  static const maxKnownUids = 200;

  static const vectorProbeRequest = 0x00000001;
  static const vectorProbeReply = 0x00000002;
  static const vectorRdmCmd = 0x00000003;
  static const vectorProbeRequestData = 0x01;
  static const vectorProbeReplyData = 0x01;
  static const vectorRdmCmdData = 0xCC;

  static const filterClientConnInactive = 0x0001;
  static const filterBrokersOnly = 0x0002;

  static const componentRptDevice = 0x00;
  static const componentRptController = 0x01;
  static const componentBroker = 0x02;
  static const componentNonRdmnet = 0xFF;

  static Uint8List _llrpPdu(int vector, Cid destCid, int transaction, List<int> data) {
    final w = ByteWriter();
    w.u32(vector);
    w.bytes(destCid.bytes);
    w.u32(transaction);
    w.bytes(data);
    return Acn.pdu(w.toBytes());
  }

  /// Probe Request to the LLRP broadcast CID; [knownUids] are suppressed in replies.
  static Uint8List probeRequest({
    required Cid senderCid,
    required int transaction,
    Uid lower = const Uid(0, 0),
    Uid upper = const Uid(0xFFFF, 0xFFFFFFFF),
    int filter = 0,
    List<Uid> knownUids = const [],
  }) {
    final w = ByteWriter();
    w.u8(vectorProbeRequestData);
    lower.writeTo(w);
    upper.writeTo(w);
    w.u16(filter);
    for (final u in knownUids.take(maxKnownUids)) {
      u.writeTo(w);
    }
    final pdu = _llrpPdu(vectorProbeRequest, Cid.broadcastLlrp, transaction, Acn.pdu(w.toBytes()));
    return Acn.udpPacket(Acn.vectorRootLlrp, senderCid, pdu);
  }

  /// Probe Reply (used by the demo target and the tests).
  static Uint8List probeReply({
    required Cid senderCid,
    required Cid destCid,
    required int transaction,
    required Uid uid,
    required List<int> hardwareAddress,
    required int componentType,
  }) {
    final w = ByteWriter();
    w.u8(vectorProbeReplyData);
    uid.writeTo(w);
    w.bytes(List.generate(6, (i) => i < hardwareAddress.length ? hardwareAddress[i] : 0));
    w.u8(componentType);
    final pdu = _llrpPdu(vectorProbeReply, destCid, transaction, Acn.pdu(w.toBytes()));
    return Acn.udpPacket(Acn.vectorRootLlrp, senderCid, pdu);
  }

  /// An RDM command to one component (its CID), as a UDP datagram.
  static Uint8List rdmCommand({
    required Cid senderCid,
    required Cid destCid,
    required int transaction,
    required RdmPacket packet,
  }) {
    final cmd = Acn.pdu([vectorRdmCmdData, ...packet.encode(withStartCode: false)]);
    final pdu = _llrpPdu(vectorRdmCmd, destCid, transaction, cmd);
    return Acn.udpPacket(Acn.vectorRootLlrp, senderCid, pdu);
  }

  /// Parses a datagram; returns null when it is not an LLRP message.
  static LlrpMessage? decode(Uint8List datagram) {
    final root = Acn.decodeUdp(datagram);
    if (root == null || root.vector != Acn.vectorRootLlrp) return null;
    final r = ByteReader(root.data);
    final start = r.offset;
    final len = Acn.readPduLength(r);
    final vector = r.u32();
    final destCid = Cid.fromBytes(r.bytes(16));
    final transaction = r.u32();
    final end = start + len;
    final inner = ByteReader(r.bytes(end - r.offset));
    final iStart = inner.offset;
    final iLen = Acn.readPduLength(inner);
    final iVector = inner.u8();
    final body = inner.bytes((iStart + iLen) - inner.offset);
    switch (vector) {
      case vectorProbeReply:
        final b = ByteReader(body);
        return LlrpProbeReply(
          senderCid: root.senderCid,
          destCid: destCid,
          transaction: transaction,
          uid: Uid.fromBytes(b.bytes(6)),
          hardwareAddress: hex(b.bytes(6), separator: ':').toUpperCase(),
          componentType: b.u8(),
        );
      case vectorProbeRequest:
        final b = ByteReader(body);
        final lower = Uid.fromBytes(b.bytes(6));
        final upper = Uid.fromBytes(b.bytes(6));
        final filter = b.u16();
        final known = <Uid>[];
        while (b.remaining >= 6) {
          known.add(Uid.fromBytes(b.bytes(6)));
        }
        return LlrpProbeRequest(
          senderCid: root.senderCid,
          destCid: destCid,
          transaction: transaction,
          lower: lower,
          upper: upper,
          filter: filter,
          knownUids: known,
        );
      case vectorRdmCmd:
        if (iVector != vectorRdmCmdData) return null;
        final p = RdmPacket.tryDecode(body, withStartCode: false);
        if (p == null) return null;
        return LlrpRdmCommand(senderCid: root.senderCid, destCid: destCid, transaction: transaction, packet: p);
      default:
        return null;
    }
  }
}

sealed class LlrpMessage {
  LlrpMessage({required this.senderCid, required this.destCid, required this.transaction});
  final Cid senderCid;
  final Cid destCid;
  final int transaction;
}

class LlrpProbeRequest extends LlrpMessage {
  LlrpProbeRequest({
    required super.senderCid,
    required super.destCid,
    required super.transaction,
    required this.lower,
    required this.upper,
    required this.filter,
    required this.knownUids,
  });
  final Uid lower;
  final Uid upper;
  final int filter;
  final List<Uid> knownUids;
}

class LlrpProbeReply extends LlrpMessage {
  LlrpProbeReply({
    required super.senderCid,
    required super.destCid,
    required super.transaction,
    required this.uid,
    required this.hardwareAddress,
    required this.componentType,
  });
  final Uid uid;
  final String hardwareAddress;
  final int componentType;
}

class LlrpRdmCommand extends LlrpMessage {
  LlrpRdmCommand({required super.senderCid, required super.destCid, required super.transaction, required this.packet});
  final RdmPacket packet;
}
