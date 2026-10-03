import 'dart:typed_data';

import '../bytes.dart';
import '../uid.dart';
import 'acn.dart';

/// ANSI E1.33 Broker Protocol (section 6): connection, client lists, heartbeat.
class Broker {
  Broker._();

  static const vectorConnect = 0x0001;
  static const vectorConnectReply = 0x0002;
  static const vectorClientEntryUpdate = 0x0003;
  static const vectorRedirectV4 = 0x0004;
  static const vectorRedirectV6 = 0x0005;
  static const vectorFetchClientList = 0x0006;
  static const vectorConnectedClientList = 0x0007;
  static const vectorClientAdd = 0x0008;
  static const vectorClientRemove = 0x0009;
  static const vectorClientEntryChange = 0x000A;
  static const vectorRequestDynamicUids = 0x000B;
  static const vectorAssignedDynamicUids = 0x000C;
  static const vectorFetchDynamicUidList = 0x000D;
  static const vectorDisconnect = 0x000E;
  static const vectorNull = 0x000F;

  static const e133Version = 1;
  static const defaultScope = 'default';
  static const defaultSearchDomain = 'local.';
  static const scopeLength = 63;
  static const searchDomainLength = 231;

  static const clientProtocolRpt = 0x00000005;
  static const clientProtocolEpt = 0x0000000B;
  static const rptClientTypeDevice = 0x00;
  static const rptClientTypeController = 0x01;

  static const connectOk = 0x0000;
  static const connectScopeMismatch = 0x0001;
  static const connectCapacityExceeded = 0x0002;
  static const connectDuplicateUid = 0x0003;
  static const connectInvalidClientEntry = 0x0004;
  static const connectInvalidUid = 0x0005;

  static const heartbeatInterval = Duration(seconds: 15);
  static const heartbeatTimeout = Duration(seconds: 45);

  static String connectStatusText(int code) =>
      const {
        connectOk: 'OK',
        connectScopeMismatch: 'Scope mismatch',
        connectCapacityExceeded: 'Broker capacity exceeded',
        connectDuplicateUid: 'Duplicate UID',
        connectInvalidClientEntry: 'Invalid client entry',
        connectInvalidUid: 'Invalid UID',
      }[code] ??
      'Connect status $code';

  /// Broker PDU: vector (2) + data, wrapped in the root layer for TCP.
  static Uint8List _message(Cid senderCid, int vector, List<int> data) {
    final w = ByteWriter();
    w.u16(vector);
    w.bytes(data);
    return Acn.tcpBlock(Acn.vectorRootBroker, senderCid, Acn.pdu(w.toBytes()));
  }

  static Uint8List clientConnect({
    required Cid cid,
    required Uid uid,
    String scope = defaultScope,
    String searchDomain = defaultSearchDomain,
    bool incrementalUpdates = true,
    int clientType = rptClientTypeController,
  }) {
    final w = ByteWriter();
    w.fixedString(scope, scopeLength);
    w.u16(e133Version);
    w.fixedString(searchDomain, searchDomainLength);
    w.u8(incrementalUpdates ? 0x01 : 0x00);
    w.bytes(ClientEntry(cid: cid, protocol: clientProtocolRpt, uid: uid, clientType: clientType).encode());
    return _message(cid, vectorConnect, w.toBytes());
  }

  static Uint8List fetchClientList(Cid cid) => _message(cid, vectorFetchClientList, const []);

  static Uint8List nullMessage(Cid cid) => _message(cid, vectorNull, const []);

  static Uint8List disconnect(Cid cid, {int reason = 0x0000}) =>
      _message(cid, vectorDisconnect, [reason >> 8, reason & 0xFF]);

  /// Parses the broker PDU inside a root layer PDU with vector [Acn.vectorRootBroker].
  static BrokerMessage decode(RootLayerPdu root) {
    final r = ByteReader(root.data);
    final start = r.offset;
    final len = Acn.readPduLength(r);
    final vector = r.u16();
    final end = start + len;
    final data = r.bytes(end - r.offset);
    switch (vector) {
      case vectorConnectReply:
        final d = ByteReader(data);
        return ConnectReply(d.u16(), d.u16(), Uid.fromBytes(d.bytes(6)), Uid.fromBytes(d.bytes(6)));
      case vectorConnectedClientList:
      case vectorClientAdd:
      case vectorClientRemove:
      case vectorClientEntryChange:
        return ClientListMessage(vector, ClientEntry.decodeList(data));
      case vectorDisconnect:
        return DisconnectMessage(data.length >= 2 ? (data[0] << 8) | data[1] : 0);
      case vectorRedirectV4:
        final d = ByteReader(data);
        return RedirectMessage(d.bytes(4).join('.'), d.u16());
      case vectorNull:
        return NullMessage();
      default:
        return UnknownBrokerMessage(vector, data);
    }
  }
}

/// Client Entry PDU (6.3.2): vector = client protocol, header = CID, data per protocol.
class ClientEntry {
  ClientEntry({required this.cid, required this.protocol, required this.uid, required this.clientType, Cid? bindingCid})
      : bindingCid = bindingCid ?? Cid(List.filled(16, 0));

  final Cid cid;
  final int protocol;
  final Uid uid;
  final int clientType;
  final Cid bindingCid;

  bool get isRptDevice => protocol == Broker.clientProtocolRpt && clientType == Broker.rptClientTypeDevice;
  bool get isRptController => protocol == Broker.clientProtocolRpt && clientType == Broker.rptClientTypeController;

  Uint8List encode() {
    final w = ByteWriter();
    w.u32(protocol);
    w.bytes(cid.bytes);
    if (protocol == Broker.clientProtocolRpt) {
      uid.writeTo(w);
      w.u8(clientType);
      w.bytes(bindingCid.bytes);
    }
    return Acn.pdu(w.toBytes());
  }

  static List<ClientEntry> decodeList(Uint8List data) {
    final out = <ClientEntry>[];
    final r = ByteReader(data);
    while (r.remaining >= 23) {
      final start = r.offset;
      final len = Acn.readPduLength(r);
      final protocol = r.u32();
      final cid = Cid.fromBytes(r.bytes(16));
      final end = start + len;
      if (protocol == Broker.clientProtocolRpt && end - r.offset >= 23) {
        final uid = Uid.fromBytes(r.bytes(6));
        final type = r.u8();
        final binding = Cid.fromBytes(r.bytes(16));
        out.add(ClientEntry(cid: cid, protocol: protocol, uid: uid, clientType: type, bindingCid: binding));
      } else {
        out.add(ClientEntry(cid: cid, protocol: protocol, uid: const Uid(0, 0), clientType: 0xFF));
      }
      r.offset = end;
    }
    return out;
  }

  @override
  String toString() => 'ClientEntry($uid type=$clientType cid=$cid)';
}

sealed class BrokerMessage {}

class ConnectReply extends BrokerMessage {
  ConnectReply(this.status, this.e133Version, this.brokerUid, this.clientUid);
  final int status;
  final int e133Version;
  final Uid brokerUid;
  final Uid clientUid;
  bool get ok => status == Broker.connectOk;
}

class ClientListMessage extends BrokerMessage {
  ClientListMessage(this.vector, this.entries);
  final int vector;
  final List<ClientEntry> entries;
  bool get isFullList => vector == Broker.vectorConnectedClientList;
  bool get isAdd => vector == Broker.vectorClientAdd;
  bool get isRemove => vector == Broker.vectorClientRemove;
}

class DisconnectMessage extends BrokerMessage {
  DisconnectMessage(this.reason);
  final int reason;
}

class RedirectMessage extends BrokerMessage {
  RedirectMessage(this.ip, this.port);
  final String ip;
  final int port;
}

class NullMessage extends BrokerMessage {}

class UnknownBrokerMessage extends BrokerMessage {
  UnknownBrokerMessage(this.vector, this.data);
  final int vector;
  final Uint8List data;
}
