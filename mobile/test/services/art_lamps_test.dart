import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/artnet/artnet.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
import 'package:patchlab_rdm/net/network_info.dart';
import 'package:patchlab_rdm/services/artnet_service.dart';
import 'package:patchlab_rdm/services/llrp_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/sim/fake_art_lamp.dart';
import 'package:patchlab_rdm/services/sim/fake_artnet_node.dart';
import 'package:patchlab_rdm/services/sim/fake_lamps.dart';

/// Lamps that speak Art-Net themselves (they answer ArtPoll, sit on 2.x.x.x and have their own UID), found and
/// addressed the way that works in the field: ArtPoll out of every adapter, TOD per port address, UID from the
/// ArtPollReply, RDM unicast inside our subnet and by broadcast outside it.
void main() {
  late MemoryUdpHub hub;
  late ArtNetService art;
  late LlrpService llrp;
  late LampsTransport transport;
  late SimFixture sim;
  late FakeArtLamp lamp;

  // One cable: the laptop's Ethernet at 192.168.100.43/16 and a lamp at its factory address 2.187.156.10 are on the same
  // wire, but the laptop has no route to 2.x: unicast across does not get through.
  void build({required List<LocalAddress> adapters, bool leaveStartCode = false}) {
    hub = MemoryUdpHub()..unicastRoute = (from, to) => from.split('.').first == to.split('.').first;
    final fixtures = buildDemoLamps();
    sim = fixtures.first.fixture;
    lamp = FakeArtLamp(hub, sim, ip: '2.187.156.10', segment: 'cable', leaveStartCode: leaveStartCode)..start();
    art = ArtNetService(
      hub.open(ip: adapters.first.ip, port: ArtNet.port, segment: 'cable'),
      controllerUid: const Uid(0x7FF0, 1),
      interfaces: () async => adapters,
      bindFactory: (ip, port) async => hub.open(ip: ip, port: port, segment: 'cable'),
    );
    llrp = LlrpService(
      socketFactory: hub.factoryFor('169.254.10.1'),
      cid: Cid.random(),
      controllerUid: const Uid(0x7FF0, 1),
      adapters: () async => const [AdapterInfo('Ethernet', '169.254.10.1')],
    );
    transport = LampsTransport(llrp, artnet: art);
  }

  tearDown(() {
    lamp.stop();
    art.dispose();
    llrp.close();
  });

  const lan = LocalAddress('192.168.100.43', '255.255.0.0', interfaceName: 'en12');
  const alias = LocalAddress('2.0.0.100', '255.0.0.0', interfaceName: 'en12');

  test('a lamp on 2.x that the laptop has no route to is found and addressed by broadcast', () async {
    build(adapters: [lan]);
    final uids = await transport.discover();
    expect(uids, [sim.uid], reason: 'the UID comes from the ArtPollReply and the TOD, once');
    expect(transport.outOfSubnet, ['2.187.156.10'], reason: 'the app can tell the laptop needs an address in the lamp\'s range');
    expect(transport.routeName, 'Art-Net');
    final client = RdmClient(transport);
    expect(await client.deviceModelDescription(sim.uid), 'ProWash 300');
    await client.setStartAddress(sim.uid, 77);
    expect(await client.startAddress(sim.uid), 77);
    expect(sim.address, 77);
    expect(art.nodes['2.187.156.10']!.viaBroadcast, isFalse, reason: 'broadcast was the first choice, not a fallback');
  });

  test('a laptop with an address in the lamp\'s range (alias) talks to it unicast', () async {
    build(adapters: [lan, alias]);
    final uids = await transport.discover();
    expect(uids, [sim.uid]);
    expect(transport.outOfSubnet, isEmpty);
    final client = RdmClient(transport);
    expect(await client.deviceModelDescription(sim.uid), 'ProWash 300');
    expect(art.localAddresses.map((a) => a.ip), containsAll(['192.168.100.43', '2.0.0.100']));
  });

  test('unicast that does not get through is retried by broadcast', () async {
    build(adapters: [lan, alias]);
    hub.unicastRoute = (from, to) => false; // the route is broken although the subnet matches
    await transport.discover();
    final client = RdmClient(transport, timeout: const Duration(milliseconds: 400));
    expect(await client.deviceModelDescription(sim.uid), 'ProWash 300');
    expect(art.nodes['2.187.156.10']!.viaBroadcast, isTrue);
  });

  test('a lamp that leaves the 0xCC start code in its ArtRdm answers is understood', () async {
    build(adapters: [lan], leaveStartCode: true);
    await transport.discover();
    expect(await RdmClient(transport).deviceModelDescription(sim.uid), 'ProWash 300');
  });

  test('nothing on the cable: no lamps, no error', () async {
    build(adapters: [lan]);
    lamp.stop();
    expect(await transport.discover(), isEmpty);
    expect(art.report(), contains('polls sent'));
  });

  test('lamps behind a node are found with the Table of Devices, ports with RDM off are left alone', () async {
    hub = MemoryUdpHub();
    final node = buildDemoNode();
    await node.start(socket: hub.open(ip: '2.0.0.1', port: ArtNet.port));
    art = ArtNetService(hub.open(ip: '2.0.0.200', port: ArtNet.port), controllerUid: const Uid(0x7FF0, 1));
    llrp = LlrpService(socketFactory: hub.factoryFor('2.0.0.200'), cid: Cid.random(), controllerUid: const Uid(0x7FF0, 1), adapters: () async => const []);
    lamp = FakeArtLamp(hub, buildDemoLamps().first.fixture, ip: '2.0.0.77')..start();
    lamp.stop();
    transport = LampsTransport(llrp, artnet: art);
    addTearDown(node.stop);
    final uids = await transport.discover();
    final expected = [for (final p in node.ports.where((p) => p.rdmEnabled)) for (final f in p.fixtures) f.uid]..sort();
    expect(uids, expected);
    expect(expected.length, 10);
    final first = node.ports.first.fixtures.first;
    expect(await RdmClient(transport).deviceModelDescription(first.uid), first.model);
  });
}
