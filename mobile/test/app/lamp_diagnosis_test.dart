import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/lamp_diagnosis.dart';
import 'package:patchlab_rdm/core/artnet/artnet.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
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
}
