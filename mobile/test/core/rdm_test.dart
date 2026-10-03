import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/bytes.dart';
import 'package:patchlab_rdm/core/rdm/rdm_constants.dart';
import 'package:patchlab_rdm/core/rdm/rdm_packet.dart';
import 'package:patchlab_rdm/core/rdm/rdm_params.dart';
import 'package:patchlab_rdm/core/uid.dart';

void main() {
  const controller = Uid(0x7FF0, 0x00000001);
  const fixture = Uid(0x4C55, 0x00AABBCC);

  test('GET DEVICE_INFO request encodes with the right length and checksum', () {
    final p = RdmPacket(
      destination: fixture,
      source: controller,
      transactionNumber: 7,
      commandClass: Rdm.getCommand,
      pid: Pid.deviceInfo,
    );
    final b = p.encode();
    expect(b.length, 26);
    expect(b[0], 0xCC);
    expect(b[1], 0x01);
    expect(b[2], 24);
    var sum = 0;
    for (var i = 0; i < 24; i++) {
      sum += b[i];
    }
    expect((b[24] << 8) | b[25], sum & 0xFFFF);
    expect(hex(b.sublist(3, 9)), '4c5500aabbcc');
    expect(hex(b.sublist(9, 15)), '7ff000000001');
    expect(b[15], 7); // transaction number
    expect(b[16], 1); // port id
    expect(b[20], 0x20);
    expect((b[21] << 8) | b[22], 0x0060);
    expect(b[23], 0); // PDL
    // Without the start code (Art-Net / RDMnet form).
    expect(p.encode(withStartCode: false), b.sublist(1));
  });

  test('decode round trip with data', () {
    final p = RdmPacket(
      destination: fixture,
      source: controller,
      transactionNumber: 200,
      commandClass: Rdm.setCommand,
      pid: Pid.dmxStartAddress,
      data: RdmData.startAddress(25),
    );
    final d = RdmPacket.decode(p.encode());
    expect(d.destination, fixture);
    expect(d.source, controller);
    expect(d.transactionNumber, 200);
    expect(d.commandClass, Rdm.setCommand);
    expect(d.pid, Pid.dmxStartAddress);
    expect(d.data, [0, 25]);
    final d2 = RdmPacket.decode(p.encode(withStartCode: false), withStartCode: false);
    expect(d2.pid, Pid.dmxStartAddress);
  });

  test('decode rejects a bad checksum and garbage', () {
    final b = RdmPacket(
      destination: fixture,
      source: controller,
      transactionNumber: 1,
      commandClass: Rdm.getCommand,
      pid: Pid.deviceInfo,
    ).encode();
    b[25] ^= 0x01;
    expect(() => RdmPacket.decode(b), throwsA(isA<RdmFormatException>()));
    expect(RdmPacket.tryDecode(b), isNull);
    expect(RdmPacket.tryDecode(Uint8List(5)), isNull);
    expect(RdmPacket.tryDecode(Uint8List(40)), isNull);
  });

  test('response helpers: ACK, NACK, ACK_TIMER', () {
    RdmPacket resp(int type, List<int> data) => RdmPacket(
          destination: controller,
          source: fixture,
          transactionNumber: 1,
          portIdOrResponseType: type,
          commandClass: Rdm.getCommandResponse,
          pid: Pid.deviceInfo,
          data: Uint8List.fromList(data),
        );
    expect(resp(Rdm.responseAck, []).isAck, isTrue);
    final nack = resp(Rdm.responseNackReason, [0x00, 0x06]);
    expect(nack.isNack, isTrue);
    expect(nack.nackReason, NackReason.dataOutOfRange);
    expect(NackReason.describe(NackReason.dataOutOfRange), 'Data out of range');
    final timer = resp(Rdm.responseAckTimer, [0x00, 0x05]);
    expect(timer.ackTimer, const Duration(milliseconds: 500));
  });

  test('DEVICE_INFO decode / encode', () {
    final info = DeviceInfo(
      protocolVersion: 0x0100,
      deviceModelId: 0x0123,
      productCategory: 0x0501,
      softwareVersionId: 0x01020304,
      dmxFootprint: 16,
      currentPersonality: 2,
      personalityCount: 3,
      dmxStartAddress: 9,
      subDeviceCount: 0,
      sensorCount: 1,
    );
    final d = DeviceInfo.decode(info.encode());
    expect(info.encode().length, 19);
    expect(d.deviceModelId, 0x0123);
    expect(d.dmxFootprint, 16);
    expect(d.currentPersonality, 2);
    expect(d.personalityCount, 3);
    expect(d.dmxStartAddress, 9);
    expect(d.sensorCount, 1);
    expect(d.hasDmxAddress, isTrue);
  });

  test('personality description and sensor parsing', () {
    final pd = PersonalityDescription.decode(
        PersonalityDescription(personality: 2, footprint: 16, description: 'Extended').encode());
    expect(pd.personality, 2);
    expect(pd.footprint, 16);
    expect(pd.description, 'Extended');
    expect(pd.toString(), 'Extended (16 ch)');

    final w = ByteWriter();
    w.u8(0); // sensor
    w.u8(SensorType.temperature);
    w.u8(SensorUnit.centigrade);
    w.u8(0); // prefix none
    w.u16(0xFFCE); // -50
    w.u16(150);
    w.u16(0);
    w.u16(80);
    w.u8(0);
    w.string('Base temp');
    final def = SensorDefinition.decode(w.toBytes());
    expect(def.isTemperature, isTrue);
    expect(def.rangeMin, -50);
    expect(def.description, 'Base temp');
    expect(def.format(42), '42 °C');

    final v = SensorValue.decode(fromHex('00002a0014003c0000'));
    expect(v.present, 42);
    expect(v.lowest, 20);
    expect(v.highest, 60);
  });

  test('E1.37-7 endpoint responses', () {
    final list = EndpointList.decode(fromHex('00000005 0001 01 0002 01 0003 00'));
    expect(list.listChangeNumber, 5);
    expect(list.endpoints.length, 3);
    expect(list.endpoints[1].id, 2);
    expect(list.endpoints[2].type, 0);

    final resp = EndpointResponders.decode(fromHex('0002 00000001 4c5500aabbcc 4c5500aabbcd'));
    expect(resp.endpoint, 2);
    expect(resp.responders, [const Uid(0x4C55, 0x00AABBCC), const Uid(0x4C55, 0x00AABBCD)]);

    final u = EndpointUniverse.decode(fromHex('0002 0007'));
    expect(u.endpoint, 2);
    expect(u.universe, 7);
  });

  test('COMPONENT_SCOPE decode', () {
    final w = ByteWriter();
    w.u16(1);
    w.fixedString('default', 63);
    w.u8(1);
    w.bytes([10, 0, 0, 5]);
    w.zeros(16);
    w.u16(8888);
    final s = ComponentScope.decode(w.toBytes());
    expect(s.scope, 'default');
    expect(s.staticIpv4, '10.0.0.5');
    expect(s.staticPort, 8888);
  });

  test('RdmData encoders validate ranges', () {
    expect(RdmData.startAddress(512), [2, 0]);
    expect(() => RdmData.startAddress(513), throwsArgumentError);
    expect(() => RdmData.startAddress(0), throwsArgumentError);
    expect(RdmData.identify(true), [1]);
    expect(RdmData.reset(cold: true), [0xFF]);
    expect(RdmData.label('Wash 1'), 'Wash 1'.codeUnits);
    expect(RdmData.label('x' * 40).length, 32);
  });
}
