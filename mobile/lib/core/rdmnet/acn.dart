import 'dart:math';
import 'dart:typed_data';

import '../bytes.dart';

/// ACN (ANSI E1.17) root layer framing as used by ANSI E1.33 (RDMnet).
/// Every RDMnet PDU uses the extended 20-bit length form: flags 0xF0 | len.
class Acn {
  Acn._();

  static const packetIdentifier = <int>[
    0x41, 0x53, 0x43, 0x2D, 0x45, 0x31, 0x2E, 0x31, 0x37, 0x00, 0x00, 0x00, // "ASC-E1.17\0\0\0"
  ];

  static const vectorRootRpt = 0x00000005;
  static const vectorRootBroker = 0x00000009;
  static const vectorRootLlrp = 0x0000000A;
  static const vectorRootEpt = 0x0000000B;

  static const udpPreambleLength = 16;
  static const tcpPreambleLength = 16;

  /// Flags/length header (3 bytes) for a PDU of [totalLength] bytes including the header.
  static List<int> flagsLength(int totalLength) {
    if (totalLength > 0xFFFFF) throw ArgumentError('PDU too long');
    return [0xF0 | ((totalLength >> 16) & 0x0F), (totalLength >> 8) & 0xFF, totalLength & 0xFF];
  }

  /// Wraps [body] in a PDU header.
  static Uint8List pdu(List<int> body) =>
      Uint8List.fromList([...flagsLength(body.length + 3), ...body]);

  /// Reads a PDU header; returns the PDU length (including the header).
  static int readPduLength(ByteReader r) {
    final flags = r.u8();
    if (flags & 0x70 != 0x70) {
      throw FormatException('PDU without V/H/D flags (0x${flags.toRadixString(16)})');
    }
    if (flags & 0x80 != 0) {
      return ((flags & 0x0F) << 16) | (r.u8() << 8) | r.u8();
    }
    return ((flags & 0x0F) << 8) | r.u8();
  }

  /// Root layer PDU: vector (4) + sender CID (16) + data.
  static Uint8List rootLayer(int vector, Cid senderCid, List<int> data) {
    final w = ByteWriter();
    w.u32(vector);
    w.bytes(senderCid.bytes);
    w.bytes(data);
    return pdu(w.toBytes());
  }

  /// A complete UDP datagram: preamble + root layer PDU.
  static Uint8List udpPacket(int vector, Cid senderCid, List<int> data) {
    final w = ByteWriter();
    w.u16(0x0010); // preamble size
    w.u16(0x0000); // postamble size
    w.bytes(packetIdentifier);
    w.bytes(rootLayer(vector, senderCid, data));
    return w.toBytes();
  }

  /// A complete TCP block: 12-byte identifier + 32-bit length + root layer PDU.
  static Uint8List tcpBlock(int vector, Cid senderCid, List<int> data) {
    final rlp = rootLayer(vector, senderCid, data);
    final w = ByteWriter();
    w.bytes(packetIdentifier);
    w.u32(rlp.length);
    w.bytes(rlp);
    return w.toBytes();
  }

  /// Parses a UDP datagram into its root layer PDU.
  static RootLayerPdu? decodeUdp(Uint8List b) {
    if (b.length < udpPreambleLength + 23) return null;
    final r = ByteReader(b);
    if (r.u16() != 0x0010 || r.u16() != 0x0000) return null;
    for (final x in packetIdentifier) {
      if (r.u8() != x) return null;
    }
    return decodeRootLayer(r);
  }

  /// Parses a root layer PDU at the reader position.
  static RootLayerPdu? decodeRootLayer(ByteReader r) {
    final start = r.offset;
    final len = readPduLength(r);
    final vector = r.u32();
    final cid = Cid.fromBytes(r.bytes(16));
    final end = start + len;
    if (end > r.data.length) throw const FormatException('Root layer PDU truncated');
    final data = r.bytes(end - r.offset);
    return RootLayerPdu(vector, cid, data);
  }
}

class RootLayerPdu {
  RootLayerPdu(this.vector, this.senderCid, this.data, [this.block]);
  final int vector;
  final Cid senderCid;
  final Uint8List data;

  /// The complete TCP block (preamble and PDU) this came in, when read from a stream. A broker
  /// forwards RPT messages by sending this block on unchanged.
  final Uint8List? block;
}

/// Splits a TCP byte stream into root layer PDU blocks.
class AcnTcpFramer {
  final List<int> _buffer = <int>[];

  /// Feeds bytes; returns every complete root layer PDU that became available.
  List<RootLayerPdu> feed(List<int> chunk) {
    _buffer.addAll(chunk);
    final out = <RootLayerPdu>[];
    while (true) {
      if (_buffer.length < Acn.tcpPreambleLength) break;
      for (var i = 0; i < 12; i++) {
        if (_buffer[i] != Acn.packetIdentifier[i]) {
          throw const FormatException('TCP stream out of sync (bad ACN identifier)');
        }
      }
      final len = (_buffer[12] << 24) | (_buffer[13] << 16) | (_buffer[14] << 8) | _buffer[15];
      if (_buffer.length < Acn.tcpPreambleLength + len) break;
      final block = Uint8List.fromList(
          _buffer.sublist(Acn.tcpPreambleLength, Acn.tcpPreambleLength + len));
      _buffer.removeRange(0, Acn.tcpPreambleLength + len);
      final pdu = Acn.decodeRootLayer(ByteReader(block));
      if (pdu != null) {
        out.add(RootLayerPdu(pdu.vector, pdu.senderCid, pdu.data, Uint8List.fromList([...Acn.packetIdentifier, len >> 24 & 0xFF, len >> 16 & 0xFF, len >> 8 & 0xFF, len & 0xFF, ...block])));
      }
    }
    return out;
  }
}

/// Component ID: a UUID (RFC 4122), 16 bytes.
class Cid {
  Cid(List<int> bytes) : bytes = Uint8List.fromList(bytes) {
    if (bytes.length != 16) throw ArgumentError('CID must be 16 bytes');
  }

  factory Cid.fromBytes(List<int> b) => Cid(b);

  factory Cid.random([Random? random]) {
    final r = random ?? Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0F) | 0x40; // version 4
    b[8] = (b[8] & 0x3F) | 0x80; // variant
    return Cid(b);
  }

  factory Cid.parse(String s) {
    final clean = s.replaceAll('-', '');
    if (clean.length != 32) throw FormatException('Bad UUID $s');
    return Cid(fromHex(clean));
  }

  /// The LLRP broadcast CID (E1.33 Table A-2).
  static final broadcastLlrp = Cid.parse('fbad822c-bd0c-4d4c-bdc8-7eabebc85aff');

  final Uint8List bytes;

  @override
  String toString() {
    final h = hex(bytes);
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  @override
  bool operator ==(Object other) => other is Cid && other.toString() == toString();

  @override
  int get hashCode => toString().hashCode;
}
