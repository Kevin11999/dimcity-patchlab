import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/rdm/rdm_constants.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
import 'package:patchlab_rdm/services/llrp_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/sim/fake_lamps.dart';

/// The real LLRP code against a simulated row of RDMnet lamps on an in-memory network:
/// no node, no broker, no IP configuration, just lamps answering multicast.
void main() {
  late MemoryUdpHub hub;
  late List<DemoLamp> lamps;
  late FakeRdmnetLamps fake;
  late LlrpService llrp;

  setUp(() {
    hub = MemoryUdpHub();
    lamps = buildDemoLamps();
    fake = FakeRdmnetLamps(hub, lamps, maxReplyDelay: const Duration(milliseconds: 250))..start();
    llrp = LlrpService(
      socketFactory: hub.factoryFor('169.254.10.1'),
      cid: Cid.random(),
      controllerUid: const Uid(0x7FF0, 1),
      localIps: () async => ['169.254.10.1'],
    );
  });

  tearDown(() {
    llrp.close();
    fake.stop();
  });

  test('a probe finds every lamp on the cable, with its address', () async {
    final found = await llrp.probe(roundTimeout: const Duration(milliseconds: 500));
    expect(found.length, 8);
    expect(found.every((d) => d.isDevice), isTrue);
    expect(found.map((d) => d.uid).toSet(), lamps.map((l) => l.fixture.uid).toSet());
    final first = found.firstWhere((d) => d.uid == lamps.first.fixture.uid);
    expect(first.ip, lamps.first.ip);
    expect(first.localIp, '169.254.10.1');
    expect(first.hardwareAddress, '02:00:7F:F1:20:00');
    expect(llrp.devices.length, 8);
    expect(llrp.repliesSeen, 8, reason: 'known UIDs stay quiet in the next round, so nobody answers twice');
  });

  test('nothing on the cable: the probe ends after two quiet rounds and reports no lamps', () async {
    fake.stop();
    final found = await llrp.probe(roundTimeout: const Duration(milliseconds: 150));
    expect(found, isEmpty);
    expect(llrp.probesSent, 2);
    expect(llrp.adapters, ['169.254.10.1']);
  });

  test('RDM through LLRP: info, modes, address, label, identify, NACK', () async {
    await llrp.probe(roundTimeout: const Duration(milliseconds: 500));
    final transport = LampsTransport(llrp);
    final client = RdmClient(transport, timeout: const Duration(milliseconds: 400), retries: 1);
    final wash = lamps.first.fixture;
    final info = await client.deviceInfo(wash.uid);
    expect(info.dmxFootprint, 8);
    expect(info.personalityCount, 3);
    expect(info.dmxStartAddress, 1);
    expect(await client.deviceModelDescription(wash.uid), 'ProWash 300');
    expect((await client.personalities(wash.uid, 3)).map((p) => p.footprint), [8, 14, 20]);
    await client.setStartAddress(wash.uid, 41);
    expect(wash.address, 41);
    await client.setPersonality(wash.uid, 3);
    expect((await client.deviceInfo(wash.uid)).dmxFootprint, 20);
    await client.identify(wash.uid, true);
    expect(wash.identify, isTrue);
    await client.setDeviceLabel(wash.uid, 'Front 1');
    expect(await client.deviceLabel(wash.uid), 'Front 1');
    await expectLater(client.setStartAddress(wash.uid, 510), throwsA(isA<RdmNackException>()));
    await expectLater(client.startAddress(const Uid(0x1234, 5)), throwsA(isA<RdmException>()), reason: 'a UID that is not on the cable');
  });

  test('lost packets are repeated; a lamp that never answers times out', () async {
    await llrp.probe(roundTimeout: const Duration(milliseconds: 500));
    final client = RdmClient(LampsTransport(llrp), timeout: const Duration(milliseconds: 200), retries: 3);
    fake.dropRate = 0.5;
    var ok = 0;
    for (final l in lamps) {
      try {
        await client.startAddress(l.fixture.uid);
        ok++;
      } on RdmTimeoutException {
        // possible with bad luck, four tries each at 50 %
      }
    }
    expect(ok, greaterThanOrEqualTo(6));
    fake.dropRate = 1.0;
    await expectLater(client.startAddress(lamps.first.fixture.uid), throwsA(isA<RdmTimeoutException>()));
  });

  test('discover through the transport returns sorted lamp UIDs', () async {
    final uids = await LampsTransport(llrp).discover();
    expect(uids.length, 8);
    expect([...uids]..sort(), uids);
    expect(RdmClient(LampsTransport(llrp)).transport.routeName, 'RDMnet');
  });

  test('localIpFor picks the adapter on the same network', () async {
    final s = LlrpService(
      socketFactory: hub.factoryFor('10.0.0.5'),
      cid: Cid.random(),
      controllerUid: const Uid(0x7FF0, 2),
      localIps: () async => ['192.168.1.20', '169.254.7.7', '2.0.0.9'],
    );
    await s.open();
    expect(s.localIpFor('169.254.10.22'), '169.254.7.7');
    expect(s.localIpFor('2.4.4.4'), isNull, reason: 'only one byte in common is not the same network');
    expect(s.localIpFor('192.168.1.99'), '192.168.1.20');
    expect(s.localIpFor('8.8.8.8'), isNull);
    s.close();
  });

  test('the dropped-address demo lamp fails three times, then works', () async {
    await llrp.probe(roundTimeout: const Duration(milliseconds: 500));
    final client = RdmClient(LampsTransport(llrp), timeout: const Duration(milliseconds: 200), retries: 2);
    final flaky = lamps.firstWhere((l) => l.fixture.dropSetAddress > 0).fixture;
    await expectLater(client.setStartAddress(flaky.uid, 77), throwsA(isA<RdmTimeoutException>()));
    await client.setStartAddress(flaky.uid, 77);
    expect(flaky.address, 77);
    expect(Pid.name(Pid.dmxStartAddress), 'DMX_START_ADDRESS');
  });
}
