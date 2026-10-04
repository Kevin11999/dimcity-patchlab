import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/artnet/artnet.dart';
import 'package:patchlab_rdm/core/rdm/rdm_constants.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
import 'package:patchlab_rdm/net/network_info.dart';
import 'package:patchlab_rdm/services/artnet_service.dart';
import 'package:patchlab_rdm/services/lamp_network.dart';
import 'package:patchlab_rdm/services/llrp_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/sim/fake_art_lamp.dart';
import 'package:patchlab_rdm/services/sim/fake_lamps.dart';
import 'package:patchlab_rdm/services/sim/sim_fixture.dart';

/// Setting the universe and the IP address of a lamp over the network, and the lamp's own RDM settings. The simulated lamp
/// either does what ArtAddress / ArtIpProg ask or stays silent, like a lamp whose manual only has these in a menu.
void main() {
  late MemoryUdpHub hub;
  late ArtNetService art;
  late LlrpService llrp;
  late LampsTransport transport;
  late FakeArtLamp lamp;
  late LampNetwork net;
  late ArtRoute route;
  var built = false;

  Future<void> build({bool answersArtAddress = true, bool answersIpProg = true, List<LocalAddress>? adapters, String lampIp = '2.187.156.10'}) async {
    hub = MemoryUdpHub();
    built = true;
    final sim = buildDemoLamps().first.fixture;
    sim.params[0x8001] = SimParam(description: 'Pixel mode', dataType: 0x03, value: 2, min: 1, max: 4);
    sim.params[0x8002] = SimParam(description: 'Fan state', dataType: 0x03, commandClass: 1, value: 1);
    sim.params[0x8003] = SimParam(description: 'Name', dataType: 0x02, text: 'strip');
    lamp = FakeArtLamp(hub, sim, ip: lampIp, segment: 'cable', answersArtAddress: answersArtAddress, answersIpProg: answersIpProg)..start();
    art = ArtNetService(
      hub.open(ip: '2.0.0.100', port: ArtNet.port, segment: 'cable'),
      controllerUid: const Uid(0x7FF0, 1),
      interfaces: adapters == null ? null : () async => adapters,
      bindFactory: adapters == null ? null : (ip, port) async => hub.open(ip: ip, port: port, segment: 'cable'),
    );
    llrp = LlrpService(socketFactory: hub.factoryFor('2.0.0.100'), cid: Cid.random(), controllerUid: const Uid(0x7FF0, 1), adapters: () async => const [AdapterInfo('Ethernet', '2.0.0.100')]);
    transport = LampsTransport(llrp, artnet: art);
    await transport.discover();
    route = transport.lampFor(sim.uid)!.art!;
    net = LampNetwork(art);
  }

  tearDown(() {
    if (!built) return;
    lamp.stop();
    art.dispose();
    llrp.close();
    built = false;
  });

  test('the codecs: ArtIpProg enquiry and programming, ArtIpProgReply', () {
    final enquiry = ArtIpProg.encode();
    expect(enquiry.length, 34);
    expect(ArtNet.opcodeOf(enquiry), ArtNet.opIpProg);
    expect(enquiry[14], 0, reason: 'no bits set: an enquiry only');
    final set = ArtIpProg.encode(ip: [10, 0, 0, 7], mask: [255, 0, 0, 0]);
    expect(set[14], 0x86, reason: 'enable + program IP + program mask');
    expect(set.sublist(16, 24), [10, 0, 0, 7, 255, 0, 0, 0]);
    expect(ArtIpProg.encode(ip: [1, 2, 3, 4])[14], 0x84);
    expect(ArtIpProg.encode(dhcp: true)[14], 0xC0);
    expect(ArtIpProg.encode(defaults: true)[14], 0x88);
    final reply = ArtIpProgReply.decode(ArtIpProgReply.encode(ip: [10, 0, 0, 7], mask: [255, 0, 0, 0], dhcp: true))!;
    expect((reply.ip, reply.mask, reply.dhcp), ('10.0.0.7', '255.0.0.0', true));
    expect(ArtIpProgReply.decode(enquiry), isNull);
  });

  test('parsing and checks of what the user types', () {
    expect(LampNetwork.parsePortAddress('0.0.5'), const PortAddress(0, 0, 5));
    expect(LampNetwork.parsePortAddress('5'), const PortAddress(0, 0, 5));
    expect(LampNetwork.parsePortAddress('18'), const PortAddress(0, 1, 2));
    expect(LampNetwork.parsePortAddress('1.2.3'), const PortAddress(1, 2, 3));
    expect(LampNetwork.parsePortAddress('0.16.0'), isNull);
    expect(LampNetwork.parsePortAddress('128.0.0'), isNull);
    expect(LampNetwork.parsePortAddress('40000'), isNull);
    expect(LampNetwork.parsePortAddress('x'), isNull);
    expect(LampNetwork.parseIp('2.0.0.7'), [2, 0, 0, 7]);
    expect(LampNetwork.parseIp('2.0.0'), isNull);
    expect(LampNetwork.parseIp('2.0.0.256'), isNull);
    expect(LampNetwork.validMask([255, 0, 0, 0]), isTrue);
    expect(LampNetwork.validMask([255, 255, 254, 0]), isTrue);
    expect(LampNetwork.validMask([255, 0, 255, 0]), isFalse);
    expect(LampNetwork.validMask([0, 0, 0, 0]), isFalse);
    expect(LampNetwork.validHost([2, 0, 0, 7]), isTrue);
    expect(LampNetwork.validHost([0, 1, 2, 3]), isFalse);
    expect(LampNetwork.validHost([127, 0, 0, 1]), isFalse);
    expect(LampNetwork.validHost([239, 1, 1, 1]), isFalse);
  });

  test('read: universe from the poll reply, IP settings from ArtIpProg', () async {
    await build();
    lamp.mask = '255.255.0.0';
    final info = await net.read(route);
    expect(info.ip, '2.187.156.10');
    expect(info.universe, const PortAddress(0, 0, 0));
    expect(info.mask, '255.255.0.0');
    expect(info.answersIpProg, isTrue);
  });

  test('setting the universe is taken over and read back', () async {
    await build();
    final r = await net.setUniverse(route, const PortAddress(0, 1, 5));
    expect(r.outcome, NetOutcome.ok);
    expect((lamp.net, lamp.subnet, lamp.universe), (0, 1, 5));
    final info = await net.read(route);
    expect(info.universe, const PortAddress(0, 1, 5));
  });

  test('a lamp that ignores ArtAddress is reported as such, not as success', () async {
    await build(answersArtAddress: false);
    final r = await net.setUniverse(route, const PortAddress(0, 0, 7));
    expect(r.outcome, NetOutcome.ignored);
    expect(r.detail, '0.0.0');
    expect(lamp.universe, 0);
  });

  test('setting IP and mask: the lamp reports the new values, the old node entry is dropped', () async {
    await build();
    final r = await net.setIp(route, '2.0.0.55', '255.0.0.0');
    expect(r.outcome, NetOutcome.ok);
    expect((lamp.reportedIp, lamp.mask), ('2.0.0.55', '255.0.0.0'));
    expect(art.nodes.containsKey('2.187.156.10'), isFalse, reason: 'it will be found again at its new address');
  });

  test('a lamp without remote IP programming stays silent: said plainly, nothing changes', () async {
    await build(answersIpProg: false);
    final info = await net.read(route);
    expect(info.answersIpProg, isFalse);
    expect(info.mask, isNull);
    final r = await net.setIp(route, '2.0.0.55', '255.0.0.0');
    expect(r.outcome, NetOutcome.noAnswer);
    expect(lamp.reportedIp, '2.187.156.10');
  });

  test('ArtIpProg is never broadcast: a lamp outside our subnets is "not reachable"', () async {
    await build(adapters: const [LocalAddress('192.168.100.43', '255.255.0.0', interfaceName: 'en12')]);
    await art.syncInterfaces();
    final r = await net.setIp(route, '2.0.0.55', '255.0.0.0');
    expect(r.outcome, NetOutcome.notReachable);
    expect(lamp.reportedIp, '2.187.156.10');
  });

  test('the lamp\'s own RDM settings: described, read, written inside the limits', () async {
    await build();
    final c = RdmClient(transport);
    final uid = route.uid;
    final supported = await c.supportedParameters(uid);
    expect(supported, containsAll([0x8001, 0x8002, 0x8003]));
    final mode = (await c.parameterDescription(uid, 0x8001))!;
    expect((mode.description, mode.typeName, mode.canGet, mode.canSet, mode.min, mode.max), ('Pixel mode', 'uint8', true, true, 1, 4));
    expect(mode.format((await c.get(uid, 0x8001))), '2');
    await c.set(uid, 0x8001, mode.encode(3)!);
    expect(mode.format(await c.get(uid, 0x8001)), '3');
    expect(mode.encode(300), isNull, reason: 'does not fit a uint8');
    await expectLater(c.set(uid, 0x8001, mode.encode(9)!), throwsA(isA<RdmNackException>()), reason: 'outside the lamp\'s own range');
    final fan = (await c.parameterDescription(uid, 0x8002))!;
    expect(fan.canSet, isFalse);
    await expectLater(c.set(uid, 0x8002, fan.encode(0)!), throwsA(isA<RdmNackException>()));
    final name = (await c.parameterDescription(uid, 0x8003))!;
    expect(name.isText, isTrue);
    expect(name.format(await c.get(uid, 0x8003)), 'strip');
    await c.set(uid, 0x8003, Uint8List.fromList('abc'.codeUnits));
    expect(name.format(await c.get(uid, 0x8003)), 'abc');
    expect(await c.parameterDescription(uid, 0x8FFF), isNull);
    expect(Pid.name(Pid.ipv4StaticAddress), 'IPV4_STATIC_ADDRESS');
  });
}
