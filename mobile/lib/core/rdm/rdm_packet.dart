import 'dart:typed_data';

import '../bytes.dart';
import '../uid.dart';
import 'rdm_constants.dart';

class RdmFormatException implements Exception {
  RdmFormatException(this.message);
  final String message;
  @override
  String toString() => 'RdmFormatException: $message';
}

/// One RDM message (E1.20 section 6). Requests and responses share the layout;
/// for a response [portIdOrResponseType] holds the response type.
class RdmPacket {
  RdmPacket({
    required this.destination,
    required this.source,
    required this.transactionNumber,
    this.portIdOrResponseType = 1,
    this.messageCount = 0,
    this.subDevice = Rdm.rootDevice,
    required this.commandClass,
    required this.pid,
    Uint8List? data,
  }) : data = data ?? Uint8List(0) {
    if (this.data.length > Rdm.maxDataLength) {
      throw RdmFormatException('Parameter data too long (${this.data.length})');
    }
  }

  final Uid destination;
  final Uid source;
  final int transactionNumber;
  final int portIdOrResponseType;
  final int messageCount;
  final int subDevice;
  final int commandClass;
  final int pid;
  final Uint8List data;

  bool get isResponse =>
      commandClass == Rdm.getCommandResponse ||
      commandClass == Rdm.setCommandResponse ||
      commandClass == Rdm.discoveryCommandResponse;

  int get responseType => portIdOrResponseType;
  bool get isAck => isResponse && responseType == Rdm.responseAck;
  bool get isAckTimer => isResponse && responseType == Rdm.responseAckTimer;
  bool get isNack => isResponse && responseType == Rdm.responseNackReason;
  bool get isAckOverflow => isResponse && responseType == Rdm.responseAckOverflow;

  int? get nackReason =>
      isNack && data.length >= 2 ? (data[0] << 8) | data[1] : null;

  /// ACK_TIMER: estimated time in 100 ms units until the response is ready.
  Duration? get ackTimer => isAckTimer && data.length >= 2
      ? Duration(milliseconds: ((data[0] << 8) | data[1]) * 100)
      : null;

  /// Encodes the message with checksum. Art-Net (ArtRdm) and RDMnet carry the
  /// message without the DMX start code: use [withStartCode] = false.
  Uint8List encode({bool withStartCode = true}) {
    final w = ByteWriter();
    w.u8(Rdm.startCode);
    w.u8(Rdm.subStartCode);
    w.u8(Rdm.headerLength + data.length);
    destination.writeTo(w);
    source.writeTo(w);
    w.u8(transactionNumber);
    w.u8(portIdOrResponseType);
    w.u8(messageCount);
    w.u16(subDevice);
    w.u8(commandClass);
    w.u16(pid);
    w.u8(data.length);
    w.bytes(data);
    var sum = 0;
    for (final b in w.toBytes()) {
      sum += b;
    }
    w.u16(sum & 0xFFFF);
    final all = w.toBytes();
    return withStartCode ? all : all.sublist(1);
  }

  /// Decodes and verifies a message. Throws [RdmFormatException] when it is not
  /// a valid RDM message.
  static RdmPacket decode(List<int> bytes, {bool withStartCode = true}) {
    final b = Uint8List.fromList(
        withStartCode ? bytes : <int>[Rdm.startCode, ...bytes]);
    if (b.length < Rdm.headerLength + 2) {
      throw RdmFormatException('Message too short (${b.length})');
    }
    if (b[0] != Rdm.startCode) throw RdmFormatException('Bad start code');
    if (b[1] != Rdm.subStartCode) throw RdmFormatException('Bad sub-start code');
    final msgLen = b[2];
    if (msgLen < Rdm.headerLength || msgLen + 2 > b.length) {
      throw RdmFormatException('Bad message length $msgLen for ${b.length} bytes');
    }
    var sum = 0;
    for (var i = 0; i < msgLen; i++) {
      sum += b[i];
    }
    final checksum = (b[msgLen] << 8) | b[msgLen + 1];
    if (checksum != (sum & 0xFFFF)) {
      throw RdmFormatException('Checksum mismatch');
    }
    final r = ByteReader(b, 3);
    final dest = Uid.fromBytes(r.bytes(6));
    final src = Uid.fromBytes(r.bytes(6));
    final tn = r.u8();
    final portId = r.u8();
    final mc = r.u8();
    final sub = r.u16();
    final cc = r.u8();
    final pid = r.u16();
    final pdl = r.u8();
    if (Rdm.headerLength + pdl != msgLen) {
      throw RdmFormatException('PDL $pdl does not match message length $msgLen');
    }
    return RdmPacket(
      destination: dest,
      source: src,
      transactionNumber: tn,
      portIdOrResponseType: portId,
      messageCount: mc,
      subDevice: sub,
      commandClass: cc,
      pid: pid,
      data: r.bytes(pdl),
    );
  }

  /// Tries to decode; returns null for anything that is not a valid message.
  static RdmPacket? tryDecode(List<int> bytes, {bool withStartCode = true}) {
    try {
      return decode(bytes, withStartCode: withStartCode);
    } on RdmFormatException {
      return null;
    } on FormatException {
      return null;
    } on RangeError {
      return null;
    }
  }

  RdmPacket copyWith({Uid? destination, Uid? source, int? transactionNumber, int? portIdOrResponseType}) =>
      RdmPacket(
        destination: destination ?? this.destination,
        source: source ?? this.source,
        transactionNumber: transactionNumber ?? this.transactionNumber,
        portIdOrResponseType: portIdOrResponseType ?? this.portIdOrResponseType,
        messageCount: messageCount,
        subDevice: subDevice,
        commandClass: commandClass,
        pid: pid,
        data: data,
      );

  @override
  String toString() =>
      'RDM(${commandClass.toRadixString(16)} ${Pid.name(pid)} $source→$destination tn=$transactionNumber rt=$portIdOrResponseType pdl=${data.length})';
}
