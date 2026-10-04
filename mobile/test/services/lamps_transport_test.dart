import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
import 'package:patchlab_rdm/services/broker_server.dart';
import 'package:patchlab_rdm/services/lamp_broker.dart';
import 'package:patchlab_rdm/services/llrp_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/sim/fake_broker_lamp.dart';
import 'package:patchlab_rdm/services/sim/fake_lamps.dart';

/// The two RDMnet routes to a lamp on the cable together: RPT through the app's own broker (real TCP on the
/// loopback) and LLRP (simulated multicast network). One lamp is one lamp, whichever way it was found.
void main() {
  late MemoryUdpHub hub;
  late List<DemoLamp> lamps;
  late FakeRdmnetLamps fakeLlrp;
  late LlrpService llrp;
  late LampBroker lampBroker;
  late LampsTransport transport;
  final fakes = <FakeBrokerLamp>[];

  const adapter = AdapterInfo('Ethernet', '169.254.10.1');
  const controllerUid = Uid(0x7FF0, 1);

  setUp(() async {
    hub = MemoryUdpHub();
    lamps = buildDemoLamps().take(3).toList();
    fakeLlrp = FakeRdmnetLamps(hub, lamps, maxReplyDelay: const Duration(milliseconds: 150))..start();
    llrp = LlrpService(socketFactory: hub.factoryFor(adapter.ip), cid: Cid.random(), controllerUid: controllerUid, adapters: () async => const [adapter]);
    lampBroker = LampBroker(
      cid: Cid.random(),
      controllerUid: controllerUid,
      adapters: () async => const [adapter],
      socketFactory: hub.factoryFor(adapter.ip),
      discovery: null,
      advertise: false,
    );
    transport = LampsTransport(llrp, broker: lampBroker);
  });

  tearDown(() async {
    for (final f in fakes) {
      f.disconnect();
    }
    fakes.clear();
    llrp.close();
    fakeLlrp.stop();
    await lampBroker.stop();
  });

  Future<FakeBrokerLamp> joinBroker(DemoLamp lamp, {bool dynamic = false}) async {
    await lampBroker.ensure();
    final f = FakeBrokerLamp(lamp, requestDynamicUid: dynamic);
    await f.connect('127.0.0.1', lampBroker.server!.port);
    fakes.add(f);
    return f;
  }

  Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 150));

  test('the app becomes its own broker when none is on the network', () async {
    await lampBroker.ensure();
    expect(lampBroker.mode, 'own');
    expect(lampBroker.connected, isTrue);
    expect(lampBroker.server!.controllers.length, 1);
    expect(lampBroker.report(), contains('own'));
  });

  test('lamps that only answer LLRP are still found and addressed (broker without lamps)', () async {
    final uids = await transport.discover();
    expect(uids.toSet(), lamps.map((l) => l.fixture.uid).toSet());
    expect(lampBroker.mode, 'own');
    final client = RdmClient(transport);
    expect(await client.deviceModelDescription(uids.first), isNotEmpty);
  });

  test('a lamp that is on the broker with its own UID is one lamp, addressed through the broker', () async {
    final f = await joinBroker(lamps.first);
    await settle();
    final uids = await transport.discover();
    expect(uids.length, 3, reason: 'LLRP and broker views of one lamp are merged');
    expect(transport.lamps.where((l) => l.onBroker).length, 1);
    final client = RdmClient(transport);
    final before = f.answered;
    await client.setDeviceLabel(lamps.first.fixture.uid, 'Via broker');
    expect(await client.deviceLabel(lamps.first.fixture.uid), 'Via broker');
    expect(f.answered, greaterThan(before), reason: 'the broker route was used');
    // The others are not on the broker: LLRP.
    expect(await client.deviceModelDescription(lamps[1].fixture.uid), isNotEmpty);
  });

  test('a lamp with a dynamic broker UID is matched with its LLRP entry by CID, both UIDs work', () async {
    final f = await joinBroker(lamps.first, dynamic: true);
    await settle();
    expect(f.assignedUid, isNot(lamps.first.fixture.uid));
    expect(f.assignedUid!.isDynamic, isTrue);
    final uids = await transport.discover();
    expect(uids.length, 3);
    expect(uids, contains(f.assignedUid), reason: 'the broker UID is the lamp\'s UID in RDMnet');
    expect(uids, isNot(contains(lamps.first.fixture.uid)));
    final client = RdmClient(transport);
    expect(await client.deviceModelDescription(f.assignedUid!), 'ProWash 300');
    // The UID that LLRP reported keeps working for this lamp, too.
    expect(await client.deviceModelDescription(lamps.first.fixture.uid), 'ProWash 300');
    expect(f.answered, greaterThanOrEqualTo(2));
  });

  test('a lamp that only the broker knows (other subnet) is reachable through the broker', () async {
    fakeLlrp.stop();
    final f = await joinBroker(lamps[2]);
    await settle();
    final uids = await transport.discover();
    expect(uids, [lamps[2].fixture.uid]);
    final client = RdmClient(transport);
    await client.setStartAddress(uids.single, 77);
    expect(await client.startAddress(uids.single), 77);
    expect(f.answered, greaterThanOrEqualTo(2));
  });

  test('the broker stops answering: LLRP takes over and stays first for that lamp', () async {
    final f = await joinBroker(lamps.first);
    await settle();
    await transport.discover();
    final client = RdmClient(transport, retries: 0, timeout: const Duration(milliseconds: 400));
    expect(await client.deviceModelDescription(lamps.first.fixture.uid), isNotEmpty);
    final answered = f.answered;
    f.mute = true;
    expect(await client.deviceModelDescription(lamps.first.fixture.uid), isNotEmpty, reason: 'answered through LLRP');
    expect(transport.lamps.firstWhere((l) => l.onBroker).lastGood, 'llrp');
    final again = Stopwatch()..start();
    await client.deviceModelDescription(lamps.first.fixture.uid);
    expect(again.elapsedMilliseconds, lessThan(1000), reason: 'no new broker timeout');
    expect(f.answered, answered);
  });

  test('a lamp that is nowhere (any more) is reported, not hung on', () async {
    await transport.discover();
    final client = RdmClient(transport, retries: 0);
    await expectLater(client.deviceModelDescription(const Uid(0x1234, 5)), throwsA(isA<RdmException>()));
  });

  test('BrokerServer: duplicate UID, wrong scope and the maximum number of clients are refused', () async {
    final server = BrokerServer(cid: Cid.random(), scope: 'default', maxClients: 2);
    final port = await server.start();
    addTearDown(server.stop);
    final a = FakeBrokerLamp(lamps[0]);
    await a.connect('127.0.0.1', port);
    addTearDown(a.disconnect);
    await expectLater(FakeBrokerLamp(lamps[1], scope: 'other').connect('127.0.0.1', port), throwsA(isA<StateError>()));
    await expectLater(FakeBrokerLamp(lamps[0]).connect('127.0.0.1', port), throwsA(isA<StateError>()), reason: 'same UID twice');
    final b = FakeBrokerLamp(lamps[1]);
    await b.connect('127.0.0.1', port);
    addTearDown(b.disconnect);
    await expectLater(FakeBrokerLamp(lamps[2]).connect('127.0.0.1', port), throwsA(isA<StateError>()), reason: 'capacity');
    expect(server.devices.length, 2);
  });
}
