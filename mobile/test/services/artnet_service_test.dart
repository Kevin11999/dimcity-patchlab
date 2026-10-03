import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/artnet/artnet.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/services/artnet_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/sim/fake_artnet_node.dart';

/// These tests talk real UDP on the loopback interface to the simulated node.
void main() {
  late FakeArtNetNode node;
  late ArtNetService service;

  setUp(() async {
    node = buildDemoNode();
    await node.start(port: 0);
    service = await ArtNetService.open(controllerUid: const Uid(0x7FF0, 1), port: 0);
    service.broadcastTargets.clear();
    service.unicastTargets['127.0.0.1'] = node.port;
  });

  tearDown(() async {
    service.dispose();
    await node.stop();
  });

  Future<ArtNetNodeInfo> findNode() async {
    service.poll();
    await Future<void>.delayed(const Duration(milliseconds: 300));
    final info = service.nodes['127.0.0.1'];
    expect(info, isNotNull, reason: 'the fake node did not answer the poll');
    return info!;
  }

  test('ArtPoll finds the node with two pages and eight output ports', () async {
    final info = await findNode();
    expect(info.pages.length, 2);
    expect(info.shortName, 'LumiNode 8 demo');
    expect(info.udpPort, node.port);
    final ports = info.outputPorts;
    expect(ports.length, 8);
    expect(ports.map((p) => p.physical), [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ports[1].port.outputsSacn, isTrue);
    expect(ports[0].port.outputsSacn, isFalse);
    expect(ports[3].port.rdmDisabled, isTrue);
    expect(ports[4].address, const PortAddress(0, 0, 4));
    expect(ports[4].page, 2);
  });

  test('ArtAddress changes universe and protocol and the node confirms it', () async {
    final info = await findNode();
    final reply = await service.sendAddress(
      info,
      ArtAddress.encode(bindIndex: 1, subnet: 3, swOut: [5, null, null, null], command: ArtAddressCommand.acnSel0),
      page: 1,
    );
    expect(reply, isNotNull);
    expect(reply!.subSwitch, 3);
    expect(reply.ports[0].outputAddress, const PortAddress(0, 3, 5));
    expect(reply.ports[0].outputsSacn, isTrue);
    expect(reply.ports[1].outputAddress, const PortAddress(0, 3, 1)); // sub-net applies to the page
    final rdmOn = await service.sendAddress(info, ArtAddress.encode(bindIndex: 1, command: ArtAddressCommand.rdmEnable0 + 3), page: 1);
    expect(rdmOn!.ports[3].rdmDisabled, isFalse);
    expect(info.pages[1]!.ports[0].outputsSacn, isTrue, reason: 'node registry updated');
  });

  test('TOD discovery lists the fixtures of port 1 and NAKs a port without RDM', () async {
    final info = await findNode();
    final tod = await service.requestTod(info, const PortAddress(0, 0, 0), settle: const Duration(milliseconds: 900));
    expect(tod.complete, isTrue);
    expect(tod.uids.length, 3);
    final off = await service.requestTod(info, const PortAddress(0, 0, 3), flush: false, timeout: const Duration(seconds: 2));
    expect(off.answered, isTrue);
    expect(off.nak, isTrue);
    expect(off.complete, isFalse);
    final empty = await service.requestTod(info, const PortAddress(0, 0, 2), flush: false, timeout: const Duration(seconds: 3));
    expect(empty.complete, isTrue);
    expect(empty.uids, isEmpty);
  });

  test('RdmClient over Art-Net: device info, modes, set address, NACK and retries', () async {
    final info = await findNode();
    final transport = ArtNetRdmTransport(service, info, const PortAddress(0, 0, 0));
    final client = RdmClient(transport, timeout: const Duration(milliseconds: 400), retries: 2);
    final uids = await transport.discover(flush: false);
    expect(uids.length, 3);
    final wash = uids.first;
    final di = await client.deviceInfo(wash);
    expect(di.dmxFootprint, 8);
    expect(di.personalityCount, 3);
    expect(await client.deviceLabel(wash), 'Wash 1');
    expect(await client.deviceModelDescription(wash), 'ProWash 300');
    expect(await client.manufacturerLabel(wash), 'DemoLux');
    final modes = await client.personalities(wash, di.personalityCount);
    expect(modes.map((m) => m.footprint), [8, 14, 20]);
    await client.setStartAddress(wash, 25);
    expect(await client.startAddress(wash), 25);
    await client.setPersonality(wash, 2);
    expect((await client.personality(wash)).current, 2);
    expect((await client.deviceInfo(wash)).dmxFootprint, 14);
    await expectLater(client.setStartAddress(wash, 510), throwsA(isA<RdmNackException>()));
    expect(await client.tryGet(wash, 0x0ABC), isNull); // unknown PID → NACK → null
    await client.identify(wash, true);
    expect(node.ports[0].fixtures.first.identify, isTrue);
    await client.setDeviceLabel(wash, 'Front wash');
    expect(await client.deviceLabel(wash), 'Front wash');
    expect(await client.deviceHours(wash), 1234);
    final sensor = await client.sensorDefinition(wash, 0);
    expect(sensor!.isTemperature, isTrue);
    expect((await client.sensorValue(wash, 0))!.present, 38);
    expect(await client.softwareVersionLabel(wash), '1.2.0');
    expect(await client.supportedParameters(wash), isNotEmpty);

    // Every request is dropped: the client gives up after its retries.
    node.dropRate = 1.0;
    await expectLater(client.startAddress(wash), throwsA(isA<RdmTimeoutException>()));
    node.dropRate = 0.0;
  });

  test('a dropped SET is repeated by the client (the demo "retry" fixture)', () async {
    final info = await findNode();
    final transport = ArtNetRdmTransport(service, info, const PortAddress(0, 0, 1));
    final client = RdmClient(transport, timeout: const Duration(milliseconds: 300), retries: 1);
    final flaky = node.ports[1].fixtures[2];
    expect(flaky.dropSetAddress, 1);
    await client.setStartAddress(flaky.uid, 100);
    expect(flaky.address, 100);
    expect(node.log.any((l) => l.startsWith('dropped SET address')), isTrue);
  });
}
