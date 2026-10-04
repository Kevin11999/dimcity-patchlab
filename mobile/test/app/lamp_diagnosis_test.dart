import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/lamp_diagnosis.dart';
import 'package:patchlab_rdm/core/artnet/artnet.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
import 'package:patchlab_rdm/net/network_info.dart';
import 'package:patchlab_rdm/net/udp.dart';
import 'package:patchlab_rdm/services/artnet_service.dart';

void main() {
  const lan = AdapterInfo('Ethernet', '192.168.100.43');
  const lampRange = AdapterInfo('Ethernet', '2.0.0.100');

  List<String> keys(List<DiagCheck> c) => [for (final x in c) x.key];

  List<DiagCheck> run({List<AdapterInfo> adapters = const [lan], ArtNetService? artnet, String? error, int found = 0}) =>
      diagnoseLamps(adapters: adapters, artnet: artnet, artnetError: error, llrp: null, lampsFound: found, demo: false);

  test('demo mode says nothing', () {
    expect(diagnoseLamps(adapters: const [], artnet: null, artnetError: null, llrp: null, lampsFound: 0, demo: true), isEmpty);
  });

  test('no adapter with an address', () {
    expect(keys(run(adapters: const [])), contains('diag.noadapter'));
  });

  test('port 6454 taken by another program is named as such', () {
    final c = run(error: 'SocketException: Failed to create datagram socket (OS Error: Only one usage of each socket address, errno = 10048)');
    expect(keys(c), contains('diag.artnet.inuse'));
    expect(keys(run(error: 'Address already in use')), contains('diag.artnet.inuse'));
    expect(keys(run(error: 'something else')), contains('diag.artnet.socket'));
  });

  test('no adapter in 2.x / 10.x is flagged, one in the lamps\' range is not', () {
    expect(keys(run()), contains('diag.range'));
    expect(keys(run(adapters: const [lan, lampRange])), isNot(contains('diag.range')));
    expect(keys(run(adapters: const [AdapterInfo('Ethernet', '10.1.2.3')])), isNot(contains('diag.range')));
  });

  test('polls went out and nothing came back: silent; something came but no reply: no reply', () async {
    final hub = MemoryUdpHub();
    final svc = ArtNetService(hub.open(ip: '2.0.0.100', port: ArtNet.port), controllerUid: const Uid(0x7FF0, 1));
    addTearDown(svc.dispose);
    svc.poll();
    expect(keys(run(adapters: const [lampRange], artnet: svc)), contains('diag.silent'));

    hub.open(ip: '2.0.0.77', port: 7000).send([1, 2, 3], InternetAddress('255.255.255.255'), ArtNet.port);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    final c = run(adapters: const [lampRange], artnet: svc);
    expect(keys(c), contains('diag.noreply'));
    expect(keys(c), isNot(contains('diag.silent')));
    expect(c.firstWhere((x) => x.key == 'diag.noreply').args['kinds'], 'not Art-Net');
    expect(svc.report(), contains('not Art-Net'));
    expect(svc.report(), contains('2.0.0.77'));
  });

  test('lamps found: a green line, no complaints about silence', () {
    final c = run(adapters: const [lampRange], found: 3);
    expect(keys(c), ['diag.found']);
  });

  test('adapters that Windows lists but will not let us bind (10049) are not an error; none usable says so', () async {
    final hub = MemoryUdpHub();
    Future<UdpSocket> notReadyFactory(String ip, int port) async =>
        throw SocketException('Failed to create datagram socket (OS Error: The requested address is not valid in its context, errno = 10049), address = $ip, port = $port');
    final svc = ArtNetService(
      hub.open(ip: '169.254.1.1', port: ArtNet.port),
      controllerUid: const Uid(0x7FF0, 1),
      interfaces: () async => [for (final ip in ['169.254.254.107', '169.254.193.2']) LocalAddress(ip, '255.255.0.0', interfaceName: 'Ethernet')],
      bindFactory: notReadyFactory,
    );
    addTearDown(svc.dispose);
    await svc.syncInterfaces();
    expect(svc.interfaceErrors, isEmpty, reason: 'not an error of ours');
    expect(svc.notReady.keys, ['169.254.254.107', '169.254.193.2']);
    final c = run(adapters: const [AdapterInfo('Ethernet', '169.254.254.107'), AdapterInfo('Ethernet', '169.254.193.2')], artnet: svc);
    expect(keys(c), contains('diag.noready'));
    expect(keys(c), isNot(contains('diag.artnet.iface')));
    expect(svc.report(), contains('cannot be used'));

    // The address becomes usable (cable plugged in, the system finished): picked up at the next search.
    final svc2 = ArtNetService(
      hub.open(ip: '169.254.9.9', port: ArtNet.port),
      controllerUid: const Uid(0x7FF0, 1),
      interfaces: () async => const [LocalAddress('169.254.254.107', '255.255.0.0', interfaceName: 'Ethernet'), LocalAddress('169.254.193.2', '255.255.0.0', interfaceName: 'Bluetooth')],
      bindFactory: (ip, port) async {
        if (ip == '169.254.193.2') throw const SocketException('x', osError: OSError('The requested address is not valid in its context', 10049));
        return hub.open(ip: ip, port: port);
      },
    );
    addTearDown(svc2.dispose);
    await svc2.syncInterfaces();
    expect(svc2.localAddresses.map((a) => a.ip), ['169.254.254.107']);
    expect(svc2.notReady.keys, ['169.254.193.2']);
    final ok = run(adapters: const [AdapterInfo('Ethernet', '169.254.254.107')], artnet: svc2);
    expect(keys(ok), contains('diag.ready'));
    expect(keys(ok), isNot(contains('diag.noready')), reason: 'one usable adapter is enough, the others are noise');
  });
}
