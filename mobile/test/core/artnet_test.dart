import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/artnet/artnet.dart';
import 'package:patchlab_rdm/core/bytes.dart';
import 'package:patchlab_rdm/core/rdm/rdm_constants.dart';
import 'package:patchlab_rdm/core/rdm/rdm_packet.dart';
import 'package:patchlab_rdm/core/uid.dart';

void main() {
  test('ArtPoll bytes', () {
    final b = ArtPoll.encode();
    expect(b.length, 14);
    expect(String.fromCharCodes(b.sublist(0, 7)), 'Art-Net');
    expect(b[7], 0);
    expect(ArtNet.opcodeOf(b), ArtNet.opPoll);
    expect(b[10], 0);
    expect(b[11], 14);
    expect(b[12], 0x02);
  });

  test('PortAddress packing', () {
    const a = PortAddress(1, 2, 3);
    expect(a.value, 0x123);
    expect(a.subUni, 0x23);
    expect(PortAddress.fromValue(0x123), a);
    expect(a.sacnUniverse, 0x124);
    expect(PortAddress.fromSacnUniverse(1), const PortAddress(0, 0, 0));
    expect(a.toString(), '1.2.3');
  });

  test('ArtPollReply encode / decode', () {
    final b = ArtPollReply.encode(
      ip: [2, 0, 0, 10],
      shortName: 'LumiNode 4',
      longName: 'Luminex LumiNode 4 #1',
      netSwitch: 1,
      subSwitch: 2,
      swOut: [0, 1, 2, 3],
      portTypes: [0x80, 0x80, 0x80, 0xC0],
      goodOutput: [0x80, 0x81, 0x00, 0x00],
      goodOutputB: [0x00, 0x00, 0x80, 0x00],
      bindIndex: 1,
      mac: [0x00, 0x50, 0xC2, 0x12, 0x34, 0x56],
    );
    expect(b.length, ArtPollReply.length4);
    final r = ArtPollReply.decode(b)!;
    expect(r.ip, '2.0.0.10');
    expect(r.udpPort, 6454);
    expect(r.shortName, 'LumiNode 4');
    expect(r.longName, 'Luminex LumiNode 4 #1');
    expect(r.netSwitch, 1);
    expect(r.subSwitch, 2);
    expect(r.numPorts, 4);
    expect(r.mac, '00:50:C2:12:34:56');
    expect(r.bindIndex, 1);
    expect(r.rdmCapable, isTrue);
    expect(r.canSwitchProtocol, isTrue);
    final ports = r.ports;
    expect(ports.length, 4);
    expect(ports[0].outputAddress, const PortAddress(1, 2, 0));
    expect(ports[3].outputAddress, const PortAddress(1, 2, 3));
    expect(ports[0].outputsSacn, isFalse);
    expect(ports[1].outputsSacn, isTrue);
    expect(ports[0].dataTransmitted, isTrue);
    expect(ports[2].rdmDisabled, isTrue);
    expect(ports[3].isInput, isTrue);
    expect(ports[3].isOutput, isTrue);
    expect(r.firstPhysicalPort, 1);
  });

  test('ArtPollReply decode tolerates Art-Net 3 length and rejects other opcodes', () {
    final b = ArtPollReply.encode(ip: [10, 0, 0, 1], shortName: 'n', longName: 'n', netSwitch: 0, subSwitch: 0, swOut: [0], portTypes: [0x80], numPorts: 1, bindIndex: 2);
    final r = ArtPollReply.decode(b.sublist(0, ArtPollReply.length3))!;
    expect(r.numPorts, 1);
    expect(r.bindIndex, 0); // cut off: reads as 0 (= page 1)
    expect(r.page, 1);
    expect(ArtPollReply.decode(b)!.page, 2);
    expect(ArtPollReply.decode(b)!.firstPhysicalPort, 5);
    expect(ArtPollReply.decode(ArtPoll.encode()), isNull);
  });

  test('ArtAddress programming bytes', () {
    final b = ArtAddress.encode(
      bindIndex: 2,
      net: 1,
      subnet: 3,
      swOut: [5, null, 0, null],
      command: ArtAddressCommand.acnSel0 + 1,
    );
    expect(b.length, 107);
    expect(ArtNet.opcodeOf(b), ArtNet.opAddress);
    expect(b[12], 0x81); // NetSwitch programmed to 1
    expect(b[13], 2); // BindIndex
    expect(b.sublist(14, 32).every((x) => x == 0), isTrue); // short name unchanged
    expect(b.sublist(96, 100), [0, 0, 0, 0]); // SwIn no change
    expect(b.sublist(100, 104), [0x85, 0x00, 0x80, 0x00]);
    expect(b[104], 0x83); // SubSwitch
    expect(b[106], 0x71); // AcAcnSel1
    final names = ArtAddress.encode(shortName: 'Short', longName: 'Long name');
    expect(latin1Trim(names.sublist(14, 32)), 'Short');
    expect(latin1Trim(names.sublist(32, 96)), 'Long name');
    expect(names[12], ArtAddress.noChange);
  });

  test('ArtTodRequest / ArtTodControl / ArtTodData', () {
    final req = ArtTodRequest.encode(1, [0x23, 0x24]);
    expect(req.length, 56);
    expect(req[21], 1);
    expect(req[22], 0);
    expect(req[23], 2);
    expect(req[24], 0x23);
    expect(req[25], 0x24);
    final parsed = ArtTodRequest.decode(req)!;
    expect(parsed.net, 1);
    expect(parsed.subUniAddresses, [0x23, 0x24]);
    expect(() => ArtTodRequest.encode(0, []), throwsArgumentError);

    final ctl = ArtTodControl.encode(1, 0x23);
    expect(ctl.length, 24);
    expect(ctl[22], ArtTodControl.flush);
    expect(ctl[23], 0x23);

    final uids = [const Uid(0x4C55, 1), const Uid(0x4C55, 2), const Uid(0x1234, 0xFFFFFFFE)];
    final tod = ArtTodData.encode(net: 1, subUni: 0x23, uids: uids, port: 3, bindIndex: 1);
    final d = ArtTodData.decode(tod)!;
    expect(d.net, 1);
    expect(d.subUni, 0x23);
    expect(d.portAddress, const PortAddress(1, 2, 3));
    expect(d.port, 3);
    expect(d.uidTotal, 3);
    expect(d.uids, uids);
    expect(d.isNak, isFalse);
    final nak = ArtTodData.decode(ArtTodData.encode(net: 0, subUni: 0, uids: const [], commandResponse: ArtTodData.todNak))!;
    expect(nak.isNak, isTrue);
  });

  test('ArtRdm carries the RDM message without the start code', () {
    final rdm = RdmPacket(
      destination: const Uid(0x4C55, 1),
      source: const Uid(0x7FF0, 1),
      transactionNumber: 3,
      commandClass: Rdm.getCommand,
      pid: Pid.dmxStartAddress,
    );
    final art = ArtRdm(net: 1, subUni: 0x23, rdmBytes: rdm.encode(withStartCode: false)).encode();
    expect(ArtNet.opcodeOf(art), ArtNet.opRdm);
    expect(art[12], 1); // RdmVer
    expect(art[21], 1);
    expect(art[22], 0);
    expect(art[23], 0x23);
    expect(art[24], 0x01); // sub-start code
    final back = ArtRdm.decode(art)!;
    expect(back.portAddress, const PortAddress(1, 2, 3));
    final decoded = RdmPacket.decode(back.rdmBytes, withStartCode: false);
    expect(decoded.pid, Pid.dmxStartAddress);
    expect(decoded.transactionNumber, 3);
  });
}
