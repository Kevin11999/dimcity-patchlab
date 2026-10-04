import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/net/udp.dart';

void main() {
  test('a socket on all addresses and one bound to a single adapter address can share the Art-Net port', () async {
    final any = await RawUdpSocket.bind(0, reusePort: false);
    final port = any.port;
    // Same port, specific address: what ArtNetService does per adapter next to its 0.0.0.0 socket.
    final bound = await RawUdpSocket.bindTo('127.0.0.1', port, reusePort: false);
    addTearDown(() {
      any.close();
      bound.close();
    });
    expect(bound.port, port);
    final got = <String>[];
    any.datagrams.listen((d) => got.add('any'));
    bound.datagrams.listen((d) => got.add('bound'));
    final sender = await RawUdpSocket.bind(0, reusePort: false);
    addTearDown(sender.close);
    sender.send([1, 2, 3], InternetAddress('127.0.0.1'), port);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(got, isNotEmpty, reason: 'a unicast datagram reaches one of the two sockets');
  });
}
