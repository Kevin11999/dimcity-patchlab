import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/artnet/artnet.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
import 'package:patchlab_rdm/net/network_info.dart';
import 'package:patchlab_rdm/services/artnet_service.dart';
import 'package:patchlab_rdm/services/direct_lamp.dart';
import 'package:patchlab_rdm/services/llrp_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/sim/fake_art_lamp.dart';
import 'package:patchlab_rdm/services/sim/fake_lamps.dart';
import 'package:patchlab_rdm/services/sim/sim_fixture.dart';

/// A lamp looked up by its IP address and UID alone, without any search.
void main() {
  late MemoryUdpHub hub;
  late ArtNetService art;
  late LlrpService llrp;
  late LampsTransport transport;
  late FakeArtLamp lamp;
  late SimFixture sim;
  var built = false;

  void build({bool answersPoll = true, int universe = 5, List<LocalAddress>? adapters}) {
    built = true;
    hub = MemoryUdpHub();
    sim = buildDemoLamps().first.fixture;
    sim.params[0x8001] = SimParam(description: 'Pixel mode', value: 2, min: 1, max: 4);
    lamp = FakeArtLamp(hub, sim, ip: '2.187.156.10', segment: 'cable', universe: universe, answersPoll: answersPoll, strictAddress: true)..start();
    art = ArtNetService(
      hub.open(ip: '2.0.0.100', port: ArtNet.port, segment: 'cable'),
      controllerUid: const Uid(0x7FF0, 1),
      interfaces: adapters == null ? null : () async => adapters,
      bindFactory: adapters == null ? null : (ip, port) async => hub.open(ip: ip, port: port, segment: 'cable'),
    );
    llrp = LlrpService(socketFactory: hub.factoryFor('2.0.0.100'), cid: Cid.random(), controllerUid: const Uid(0x7FF0, 1), adapters: () async => const [AdapterInfo('Ethernet', '2.0.0.100')]);
    transport = LampsTransport(llrp, artnet: art);
  }

  tearDown(() {
    if (!built) return;
    lamp.stop();
    art.dispose();
    llrp.close();
    built = false;
  });

  test('a lamp that answers the poll: its port address comes from the reply, DEVICE_INFO answers, RDM works through the transport', () async {
    build();
    final probe = await probeDirectLamp(art, '2.187.156.10', sim.uid);
    expect(probe.pollReplied, isTrue);
    expect(probe.found, isTrue);
    expect(probe.address, const PortAddress(0, 0, 5));
    expect(probe.tried, 1, reason: 'the first address it reports is the right one');
    expect(probe.info?.dmxStartAddress, sim.address);
    transport.addManual(probe.route!);
    final client = RdmClient(transport);
    expect(await client.deviceModelDescription(sim.uid), 'ProWash 300');
    expect((await client.supportedParameters(sim.uid)), contains(0x8001));
    final desc = (await client.parameterDescription(sim.uid, 0x8001))!;
    expect(desc.description, 'Pixel mode');
  });

  test('a lamp that stays quiet to polls: the port addresses 0.0.0 to 0.0.15 are tried until one answers', () async {
    build(answersPoll: false, universe: 5);
    final probe = await probeDirectLamp(art, '2.187.156.10', sim.uid, pollWait: const Duration(milliseconds: 200), perAddress: const Duration(milliseconds: 150));
    expect(probe.pollReplied, isFalse);
    expect(probe.address, const PortAddress(0, 0, 5));
    expect(probe.tried, 6);
  });

  test('a wrong UID is not found, and it says how much was tried', () async {
    build();
    final probe = await probeDirectLamp(art, '2.187.156.10', const Uid(0x1234, 0x42), pollWait: const Duration(milliseconds: 300), perAddress: const Duration(milliseconds: 100));
    expect(probe.found, isFalse);
    expect(probe.pollReplied, isTrue);
    expect(probe.tried, 16, reason: 'the 16 universes of Net 0 / Sub-Net 0');
    expect(probe.route, isNull);
  });

  test('an IP outside every subnet of this computer is reached by broadcast out of all adapters', () async {
    build(adapters: const [LocalAddress('192.168.100.43', '255.255.0.0', interfaceName: 'en12')]);
    final probe = await probeDirectLamp(art, '2.187.156.10', sim.uid);
    expect(probe.broadcast, isTrue);
    expect(probe.found, isTrue);
    expect(probe.address, const PortAddress(0, 0, 5));
  });

  test('a lamp added by hand stays in the list after a search that does not find it', () async {
    build(answersPoll: false);
    final probe = await probeDirectLamp(art, '2.187.156.10', sim.uid, pollWait: const Duration(milliseconds: 200), perAddress: const Duration(milliseconds: 150));
    transport.addManual(probe.route!);
    expect(transport.lamps.map((l) => l.uid), [sim.uid]);
    final uids = await transport.discover();
    expect(uids, [sim.uid], reason: 'the search does not hear it (quiet to polls) but the lamp added by hand stays');
    expect(transport.lampFor(sim.uid)!.onArtNet, isTrue);
    expect(await RdmClient(transport).startAddress(sim.uid), sim.address);
  });
}
