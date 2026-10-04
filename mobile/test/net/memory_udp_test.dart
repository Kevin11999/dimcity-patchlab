import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';

void main() {
  Future<List<Datagram>> collect(Stream<Datagram> s, Duration d) async {
    final out = <Datagram>[];
    final sub = s.listen(out.add);
    await Future<void>.delayed(d);
    await sub.cancel();
    return out;
  }

  test('unicast reaches only the addressed socket, with the sender address', () async {
    final hub = MemoryUdpHub();
    final a = hub.open(ip: '2.0.0.1', port: 6454);
    final b = hub.open(ip: '2.0.0.2', port: 6454);
    final c = hub.open(ip: '2.0.0.3', port: 6454);
    final gb = collect(b.datagrams, const Duration(milliseconds: 50));
    final gc = collect(c.datagrams, const Duration(milliseconds: 50));
    a.send([1, 2, 3], InternetAddress('2.0.0.2'), 6454);
    final rb = await gb;
    expect(rb.length, 1);
    expect(rb.single.data, [1, 2, 3]);
    expect(rb.single.address.address, '2.0.0.1');
    expect(rb.single.port, 6454);
    expect(await gc, isEmpty);
  });

  test('broadcast reaches every other socket on that port, not the sender and not other ports', () async {
    final hub = MemoryUdpHub();
    final a = hub.open(ip: '2.0.0.1', port: 6454);
    final b = hub.open(ip: '2.0.0.2', port: 6454);
    final other = hub.open(ip: '2.0.0.4', port: 5569);
    final ga = collect(a.datagrams, const Duration(milliseconds: 50));
    final gb = collect(b.datagrams, const Duration(milliseconds: 50));
    final go = collect(other.datagrams, const Duration(milliseconds: 50));
    a.send([9], InternetAddress('255.255.255.255'), 6454);
    a.send([8], InternetAddress('2.255.255.255'), 6454);
    expect((await gb).map((d) => d.data.first), [9, 8]);
    expect(await ga, isEmpty);
    expect(await go, isEmpty);
  });

  test('multicast reaches only sockets that joined the group', () async {
    final hub = MemoryUdpHub();
    final a = hub.open(ip: '169.254.1.1', port: 5569);
    final b = hub.open(ip: '169.254.1.2', port: 5569);
    await b.joinMulticast('239.255.250.133');
    final c = hub.open(ip: '169.254.1.3', port: 5569);
    final gb = collect(b.datagrams, const Duration(milliseconds: 50));
    final gc = collect(c.datagrams, const Duration(milliseconds: 50));
    a.sendVia([7], InternetAddress('239.255.250.133'), 5569, '169.254.1.1');
    expect((await gb).single.data, [7]);
    expect(await gc, isEmpty);
  });

  test('broadcast and multicast stay inside one network segment, unicast is routed', () async {
    final hub = MemoryUdpHub();
    final cable = hub.open(ip: '169.254.1.1', port: 5569);
    final other = hub.open(ip: '10.0.0.5', port: 5569);
    await cable.joinMulticast('239.255.250.134');
    await other.joinMulticast('239.255.250.134');
    final sender = hub.open(ip: '169.254.1.9', port: 5569);
    final gc = collect(cable.datagrams, const Duration(milliseconds: 50));
    final go = collect(other.datagrams, const Duration(milliseconds: 50));
    sender.send([1], InternetAddress('239.255.250.134'), 5569);
    sender.send([2], InternetAddress('255.255.255.255'), 5569);
    sender.send([3], InternetAddress('10.0.0.5'), 5569);
    expect((await gc).map((d) => d.data.first), [1, 2]);
    expect((await go).map((d) => d.data.first), [3]);
  });

  test('a closed socket receives and sends nothing', () async {
    final hub = MemoryUdpHub();
    final a = hub.open(ip: '2.0.0.1', port: 1);
    final b = hub.open(ip: '2.0.0.2', port: 1);
    b.close();
    expect(a.send([1], InternetAddress('2.0.0.2'), 1), 3 - 2);
    expect(b.send([1], InternetAddress('2.0.0.1'), 1), 0);
  });
}
