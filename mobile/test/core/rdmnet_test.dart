import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/bytes.dart';
import 'package:patchlab_rdm/core/rdm/rdm_constants.dart';
import 'package:patchlab_rdm/core/rdm/rdm_packet.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/rdmnet/broker.dart';
import 'package:patchlab_rdm/core/rdmnet/llrp.dart';
import 'package:patchlab_rdm/core/rdmnet/rpt.dart';
import 'package:patchlab_rdm/core/uid.dart';

void main() {
  final cid = Cid.parse('12345678-1234-4234-8234-123456789abc');
  final otherCid = Cid.parse('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  const controller = Uid(0x7FF0, 0x00000001);
  const gateway = Uid(0x4C55, 0x00000100);
  const fixture = Uid(0x4C55, 0x00AABBCC);

  test('CID formatting and random v4', () {
    expect(cid.toString(), '12345678-1234-4234-8234-123456789abc');
    expect(cid.bytes.length, 16);
    final r = Cid.random();
    expect(r.bytes[6] >> 4, 4);
    expect(r.bytes[8] & 0xC0, 0x80);
    expect(Cid.broadcastLlrp.toString(), 'fbad822c-bd0c-4d4c-bdc8-7eabebc85aff');
  });

  test('PDU flags/length and root layer UDP round trip', () {
    expect(Acn.flagsLength(0x1234), [0xF0, 0x12, 0x34]);
    expect(Acn.flagsLength(0x12345), [0xF1, 0x23, 0x45]);
    final packet = Acn.udpPacket(Acn.vectorRootLlrp, cid, [1, 2, 3]);
    expect(packet.sublist(0, 4), [0x00, 0x10, 0x00, 0x00]);
    expect(String.fromCharCodes(packet.sublist(4, 13)), 'ASC-E1.17');
    final root = Acn.decodeUdp(packet)!;
    expect(root.vector, Acn.vectorRootLlrp);
    expect(root.senderCid, cid);
    expect(root.data, [1, 2, 3]);
    expect(Acn.decodeUdp(Uint8List(10)), isNull);
  });

  test('TCP framer splits blocks and keeps partial data', () {
    final a = Broker.nullMessage(cid);
    final b = Broker.fetchClientList(cid);
    final stream = Uint8List.fromList([...a, ...b]);
    final framer = AcnTcpFramer();
    final first = framer.feed(stream.sublist(0, 20));
    expect(first, isEmpty);
    final rest = framer.feed(stream.sublist(20));
    expect(rest.length, 2);
    expect(rest[0].vector, Acn.vectorRootBroker);
    expect(Broker.decode(rest[0]), isA<NullMessage>());
    expect(Broker.decode(rest[1]), isA<FetchClientListMessage>());
  });

  test('Client Connect layout', () {
    final msg = Broker.clientConnect(cid: cid, uid: controller, scope: 'default');
    // 16 TCP preamble + 3 + 4 + 16 root header + 3 + 2 broker header + 63 + 2 + 231 + 1 + client entry (3 + 4 + 16 + 6 + 1 + 16)
    expect(msg.length, 16 + 23 + 5 + 297 + 46);
    final root = AcnTcpFramer().feed(msg).single;
    final r = ByteReader(root.data);
    Acn.readPduLength(r);
    expect(r.u16(), Broker.vectorConnect);
    expect(r.fixedString(63), 'default');
    expect(r.u16(), 1);
    expect(r.fixedString(231), 'local.');
    expect(r.u8(), 1);
    final entries = ClientEntry.decodeList(r.rest());
    expect(entries.single.uid, controller);
    expect(entries.single.isRptController, isTrue);
    expect(entries.single.cid, cid);
  });

  test('Connect Reply and client list decode', () {
    Uint8List brokerMsg(int vector, List<int> data) {
      final w = ByteWriter();
      w.u16(vector);
      w.bytes(data);
      return Acn.tcpBlock(Acn.vectorRootBroker, otherCid, Acn.pdu(w.toBytes()));
    }

    final replyData = ByteWriter()
      ..u16(Broker.connectOk)
      ..u16(1)
      ..bytes(const Uid(0x4C55, 0xFF).toBytes())
      ..bytes(controller.toBytes());
    final reply = Broker.decode(AcnTcpFramer().feed(brokerMsg(Broker.vectorConnectReply, replyData.toBytes())).single) as ConnectReply;
    expect(reply.ok, isTrue);
    expect(reply.clientUid, controller);

    final entry = ClientEntry(cid: otherCid, protocol: Broker.clientProtocolRpt, uid: gateway, clientType: Broker.rptClientTypeDevice);
    final list = Broker.decode(AcnTcpFramer().feed(brokerMsg(Broker.vectorConnectedClientList, entry.encode())).single) as ClientListMessage;
    expect(list.isFullList, isTrue);
    expect(list.entries.single.uid, gateway);
    expect(list.entries.single.isRptDevice, isTrue);

    final disc = Broker.decode(AcnTcpFramer().feed(brokerMsg(Broker.vectorDisconnect, [0, 5])).single) as DisconnectMessage;
    expect(disc.reason, 5);
  });

  test('RPT request and notification round trip', () {
    final rdm = RdmPacket(
      destination: fixture,
      source: controller,
      transactionNumber: 9,
      commandClass: Rdm.getCommand,
      pid: Pid.deviceInfo,
    );
    final header = RptHeader(sourceUid: controller, sourceEndpoint: Rpt.nullEndpoint, destUid: fixture, destEndpoint: 2, sequence: 42);
    final block = Rpt.request(cid, header, rdm);
    final root = AcnTcpFramer().feed(block).single;
    expect(root.vector, Acn.vectorRootRpt);
    final msg = Rpt.decode(root) as RptRequest;
    expect(msg.header.destUid, fixture);
    expect(msg.header.destEndpoint, 2);
    expect(msg.header.sequence, 42);
    expect(msg.packets.single.pid, Pid.deviceInfo);

    // A notification from the gateway: original command + response.
    final response = RdmPacket(
      destination: controller,
      source: fixture,
      transactionNumber: 9,
      portIdOrResponseType: Rdm.responseAck,
      commandClass: Rdm.getCommandResponse,
      pid: Pid.deviceInfo,
      data: Uint8List(19),
    );
    final w = ByteWriter();
    w.u32(Rpt.vectorNotification);
    w.bytes(fixture.toBytes());
    w.u16(2);
    w.bytes(controller.toBytes());
    w.u16(0);
    w.u32(42);
    w.u8(0);
    final body = ByteWriter()
      ..u32(Rpt.vectorNotificationRdmCmd)
      ..bytes(Rpt.rdmCommandPdu(rdm))
      ..bytes(Rpt.rdmCommandPdu(response));
    w.bytes(Acn.pdu(body.toBytes()));
    final notifBlock = Acn.tcpBlock(Acn.vectorRootRpt, otherCid, Acn.pdu(w.toBytes()));
    final notif = Rpt.decode(AcnTcpFramer().feed(notifBlock).single) as RptNotification;
    expect(notif.packets.length, 2);
    expect(notif.responses.single.isAck, isTrue);
    expect(notif.header.sequence, 42);

    final s = ByteWriter();
    s.u32(Rpt.vectorStatus);
    s.bytes(gateway.toBytes());
    s.u16(0);
    s.bytes(controller.toBytes());
    s.u16(0);
    s.u32(43);
    s.u8(0);
    final statusBody = ByteWriter()
      ..u16(Rpt.statusRdmTimeout)
      ..string('no answer');
    s.bytes(Acn.pdu(statusBody.toBytes()));
    final status = Rpt.decode(AcnTcpFramer().feed(Acn.tcpBlock(Acn.vectorRootRpt, otherCid, Acn.pdu(s.toBytes()))).single) as RptStatus;
    expect(status.code, Rpt.statusRdmTimeout);
    expect(status.text, 'no answer');
    expect(Rpt.statusText(status.code), 'RDM timeout');
  });

  test('LLRP probe request / reply / rdm command', () {
    final req = Llrp.probeRequest(senderCid: cid, transaction: 1, knownUids: [gateway]);
    final parsed = Llrp.decode(req) as LlrpProbeRequest;
    expect(parsed.destCid, Cid.broadcastLlrp);
    expect(parsed.senderCid, cid);
    expect(parsed.transaction, 1);
    expect(parsed.lower, const Uid(0, 0));
    expect(parsed.upper, Uid.broadcast);
    expect(parsed.knownUids, [gateway]);

    final reply = Llrp.probeReply(
      senderCid: otherCid,
      destCid: cid,
      transaction: 1,
      uid: gateway,
      hardwareAddress: [0, 0x50, 0xC2, 1, 2, 3],
      componentType: Llrp.componentRptDevice,
    );
    final pr = Llrp.decode(reply) as LlrpProbeReply;
    expect(pr.uid, gateway);
    expect(pr.hardwareAddress, '00:50:C2:01:02:03');
    expect(pr.componentType, Llrp.componentRptDevice);
    expect(pr.senderCid, otherCid);

    final rdm = RdmPacket(destination: gateway, source: controller, transactionNumber: 2, commandClass: Rdm.getCommand, pid: Pid.componentScope, data: Uint8List.fromList([0, 1]));
    final cmd = Llrp.decode(Llrp.rdmCommand(senderCid: cid, destCid: otherCid, transaction: 2, packet: rdm)) as LlrpRdmCommand;
    expect(cmd.packet.pid, Pid.componentScope);
    expect(cmd.destCid, otherCid);
    expect(Llrp.decode(Uint8List(30)), isNull);
  });
}
