import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/net/network_info.dart';

void main() {
  const wifi = LocalAddress('192.168.1.20', '255.255.255.0', interfaceName: 'Wi-Fi');
  const art = LocalAddress('2.0.0.200', '255.0.0.0', interfaceName: 'Ethernet', maskGuessed: true);
  const virtual = LocalAddress('172.20.0.1', '255.255.0.0', interfaceName: 'vEthernet (WSL)', maskGuessed: true);

  test('address maths: prefix, contains, directed broadcast', () {
    expect(wifi.prefixLength, 24);
    expect(art.prefixLength, 8);
    expect(wifi.contains('192.168.1.99'), isTrue);
    expect(wifi.contains('192.168.2.99'), isFalse);
    expect(art.contains('2.77.1.1'), isTrue);
    expect(art.contains('10.0.0.1'), isFalse);
    expect(wifi.directedBroadcast, '192.168.1.255');
    expect(art.directedBroadcast, '2.255.255.255');
    expect(art.isArtNetRange, isTrue);
    expect(wifi.isArtNetRange, isFalse);
    expect(virtual.isVirtual, isTrue);
    expect(wifi.isVirtual, isFalse);
    expect(art.describe, '2.0.0.200 ~/8');
    expect(wifi.describe, '192.168.1.20 /24');
  });

  test('a laptop with several adapters: primary, contains and broadcast targets', () {
    const net = LocalNetwork(addresses: [virtual, wifi, art], source: 'interfaces');
    expect(net.known, isTrue);
    expect(net.primary, art, reason: 'Art-Net range wins, virtual adapters last');
    expect(net.contains('2.5.5.5'), isTrue);
    expect(net.contains('192.168.1.7'), isTrue);
    expect(net.contains('10.1.1.1'), isFalse);
    final targets = net.broadcastTargets;
    expect(targets, containsAll(['2.255.255.255', '192.168.1.255']));
    // Guessed masks also get the other common masks as candidates.
    expect(targets, containsAll(['2.0.255.255', '2.0.0.255']));
    expect(targets, isNot(contains('192.168.255.255')), reason: 'the Wi-Fi mask is real, no guessing');
    expect(net.describe, startsWith('2.0.0.200'));
  });

  test('unknown network never warns and has no targets', () {
    const net = LocalNetwork();
    expect(net.known, isFalse);
    expect(net.contains('1.2.3.4'), isTrue);
    expect(net.broadcastTargets, isEmpty);
    expect(net.describe, '-');
  });

  test('classful guess and candidates', () {
    expect(LocalNetwork.classfulMask('2.0.0.1'), '255.0.0.0');
    expect(LocalNetwork.classfulMask('172.16.0.1'), '255.255.0.0');
    expect(LocalNetwork.classfulMask('192.168.0.1'), '255.255.255.0');
    expect(LocalNetwork.broadcastCandidates('192.168.1.20'), ['192.255.255.255', '192.168.255.255', '192.168.1.255']);
    expect(LocalNetwork.broadcastCandidates('nope'), isEmpty);
  });
}
