import 'dart:typed_data';

import '../bytes.dart';
import '../rdm/rdm_packet.dart';
import '../uid.dart';
import 'acn.dart';

/// ANSI E1.33 RPT (RDM Packet Transport, section 7): RDM commands through a
/// broker to a device's endpoints (gateway ports) and the responders on them.
class Rpt {
  Rpt._();

  static const vectorRequest = 0x00000001;
  static const vectorStatus = 0x00000002;
  static const vectorNotification = 0x00000003;

  static const vectorRequestRdmCmd = 0x01;
  static const vectorNotificationRdmCmd = 0x01;
  static const vectorRdmCmdRdmData = 0xCC;

  static const nullEndpoint = 0x0000;
  static const broadcastEndpoint = 0xFFFF;

  static const statusUnknownRptUid = 0x0001;
  static const statusRdmTimeout = 0x0002;
  static const statusRdmInvalidResponse = 0x0003;
  static const statusUnknownRdmUid = 0x0004;
  static const statusUnknownEndpoint = 0x0005;
  static const statusBroadcastComplete = 0x0006;
  static const statusUnknownVector = 0x0007;
  static const statusInvalidMessage = 0x0008;
  static const statusInvalidCommandClass = 0x0009;

  static String statusText(int code) =>
      const {
        statusUnknownRptUid: 'Unknown RPT UID',
        statusRdmTimeout: 'RDM timeout',
        statusRdmInvalidResponse: 'RDM invalid response',
        statusUnknownRdmUid: 'Unknown RDM UID',
        statusUnknownEndpoint: 'Unknown endpoint',
        statusBroadcastComplete: 'Broadcast complete',
        statusUnknownVector: 'Unknown vector',
        statusInvalidMessage: 'Invalid message',
        statusInvalidCommandClass: 'Invalid command class',
      }[code] ??
      'RPT status $code';

  /// RDM Command PDU: vector 0xCC + RDM message from the sub-start code.
  static Uint8List rdmCommandPdu(RdmPacket packet) =>
      Acn.pdu([vectorRdmCmdRdmData, ...packet.encode(withStartCode: false)]);

  static Uint8List _rptPdu(RptHeader h, int vector, List<int> data) {
    final w = ByteWriter();
    w.u32(vector);
    h.sourceUid.writeTo(w);
    w.u16(h.sourceEndpoint);
    h.destUid.writeTo(w);
    w.u16(h.destEndpoint);
    w.u32(h.sequence);
    w.u8(0); // reserved
    w.bytes(data);
    return Acn.pdu(w.toBytes());
  }

  /// A complete TCP block carrying one RDM request to [header.destUid] / endpoint.
  static Uint8List request(Cid senderCid, RptHeader header, RdmPacket packet) {
    final requestPdu = Acn.pdu([vectorRequestRdmCmd, ...rdmCommandPdu(packet)]);
    return Acn.tcpBlock(Acn.vectorRootRpt, senderCid, _rptPdu(header, vectorRequest, requestPdu));
  }

  /// Parses the RPT PDU inside a root layer PDU with vector [Acn.vectorRootRpt].
  static RptMessage decode(RootLayerPdu root) {
    final r = ByteReader(root.data);
    final start = r.offset;
    final len = Acn.readPduLength(r);
    final vector = r.u32();
    final header = RptHeader(
      sourceUid: Uid.fromBytes(r.bytes(6)),
      sourceEndpoint: r.u16(),
      destUid: Uid.fromBytes(r.bytes(6)),
      destEndpoint: r.u16(),
      sequence: r.u32(),
    );
    r.skip(1);
    final end = start + len;
    final data = r.bytes(end - r.offset);
    switch (vector) {
      case vectorNotification:
      case vectorRequest:
        final inner = ByteReader(data);
        final innerStart = inner.offset;
        final innerLen = Acn.readPduLength(inner);
        inner.u8(); // vector 0x01
        final innerEnd = innerStart + innerLen;
        final packets = <RdmPacket>[];
        while (inner.offset < innerEnd && inner.remaining >= 4) {
          final cStart = inner.offset;
          final cLen = Acn.readPduLength(inner);
          final cVector = inner.u8();
          final cEnd = cStart + cLen;
          final body = inner.bytes(cEnd - inner.offset);
          if (cVector == vectorRdmCmdRdmData) {
            final p = RdmPacket.tryDecode(body, withStartCode: false);
            if (p != null) packets.add(p);
          }
        }
        return vector == vectorNotification
            ? RptNotification(header, packets)
            : RptRequest(header, packets);
      case vectorStatus:
        final s = ByteReader(data);
        final sStart = s.offset;
        final sLen = Acn.readPduLength(s);
        final code = s.u16();
        final text = s.fixedString((sStart + sLen) - s.offset);
        return RptStatus(header, code, text);
      default:
        return RptUnknown(header, vector, data);
    }
  }
}

class RptHeader {
  RptHeader({
    required this.sourceUid,
    required this.sourceEndpoint,
    required this.destUid,
    required this.destEndpoint,
    required this.sequence,
  });

  final Uid sourceUid;
  final int sourceEndpoint;
  final Uid destUid;
  final int destEndpoint;
  final int sequence;

  @override
  String toString() => 'RPT($sourceUid:$sourceEndpoint → $destUid:$destEndpoint seq=$sequence)';
}

sealed class RptMessage {
  RptMessage(this.header);
  final RptHeader header;
}

class RptRequest extends RptMessage {
  RptRequest(super.header, this.packets);
  final List<RdmPacket> packets;
}

/// A Notification carries the original command (optional) and the responses.
class RptNotification extends RptMessage {
  RptNotification(super.header, this.packets);
  final List<RdmPacket> packets;
  List<RdmPacket> get responses => packets.where((p) => p.isResponse).toList();
}

class RptStatus extends RptMessage {
  RptStatus(super.header, this.code, this.text);
  final int code;
  final String text;
}

class RptUnknown extends RptMessage {
  RptUnknown(super.header, this.vector, this.data);
  final int vector;
  final Uint8List data;
}
