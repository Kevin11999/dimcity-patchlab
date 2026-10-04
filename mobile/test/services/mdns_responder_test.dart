import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/dns.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/memory_udp.dart';
import 'package:patchlab_rdm/net/udp.dart';
import 'package:patchlab_rdm/services/mdns_responder.dart';

void main() {
  late MemoryUdpHub hub;
  late MdnsResponder responder;
  late DnsSdService service;

  setUp(() async {
    hub = MemoryUdpHub();
    service = DnsSdService(
      instance: 'PatchLab RDM Broker 1a2b',
      type: '_rdmnet._tcp',
      port: 8888,
      host: 'patchlab-1a2b',
      subtypes: const ['_default'],
      txt: const ['TxtVers=1', 'E133Scope=default', 'E133Vers=1'],
    );
    responder = MdnsResponder(
      socketFactory: hub.factoryFor('169.254.10.1'),
      adapters: () async => const [AdapterInfo('Ethernet', '169.254.10.1'), AdapterInfo('Wi-Fi', '192.168.1.20')],
      service: service,
    );
  });

  tearDown(() => responder.stop());

  /// A lamp on the cable: listens for multicast DNS and asks questions.
  Future<(UdpSocket, List<DnsMessage>)> lamp([String ip = '169.254.10.50']) async {
    final s = hub.open(ip: ip, port: Dns.mdnsPort);
    await s.joinMulticast(Dns.mdnsAddress);
    final got = <DnsMessage>[];
    s.datagrams.listen((d) => got.add(DnsMessage.decode(Uint8List.fromList(d.data))));
    return (s, got);
  }

  void ask(UdpSocket s, String name, int type, {bool qu = false}) =>
      s.send(DnsMessage(questions: [DnsQuestion(name, type, unicastResponse: qu)]).encode(), InternetAddress(Dns.mdnsAddress), Dns.mdnsPort);

  test('announces itself when it starts (only our cable address for a lamp on the cable)', () async {
    final (_, got) = await lamp();
    await responder.start();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(got, isNotEmpty);
    final first = got.first;
    expect(first.isResponse, isTrue);
    expect(first.answers.any((r) => r.ptrTarget == 'PatchLab RDM Broker 1a2b._rdmnet._tcp.local'), isTrue);
    final all = [...first.answers, ...first.additional];
    expect(all.where((r) => r.aAddress != null).map((r) => r.aAddress), ['169.254.10.1'], reason: 'the Wi-Fi address is on another network');
    expect(all.firstWhere((r) => r.srvPort != null).srvPort, 8888);
    expect(all.firstWhere((r) => r.txtStrings != null).txtStrings, ['TxtVers=1', 'E133Scope=default', 'E133Vers=1']);
  });

  test('answers a PTR question for the RDMnet scope subtype with the service records alongside', () async {
    final (s, got) = await lamp();
    await responder.start();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    got.clear();
    ask(s, '_default._sub._rdmnet._tcp.local', Dns.typePtr);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(got, hasLength(1));
    final m = got.single;
    expect(m.answers.single.name, '_default._sub._rdmnet._tcp.local');
    expect(m.answers.single.ptrTarget, 'PatchLab RDM Broker 1a2b._rdmnet._tcp.local');
    expect([...m.additional].any((r) => r.srvPort == 8888), isTrue, reason: 'SRV, TXT and A come along in the additional section');
    expect(m.additional.any((r) => r.txtStrings != null), isTrue);
    expect(m.additional.any((r) => r.aAddress == '169.254.10.1'), isTrue);
    expect(responder.queriesAnswered, 1);
  });

  test('answers ANY about the instance and A about the host, ignores questions about other services', () async {
    final (s, got) = await lamp();
    await responder.start();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    got.clear();
    ask(s, 'PatchLab RDM Broker 1a2b._rdmnet._tcp.local', Dns.typeAny);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(got.single.answers.map((r) => r.type).toSet(), {Dns.typeSrv, Dns.typeTxt});
    got.clear();
    ask(s, 'patchlab-1a2b.local', Dns.typeA);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(got.single.answers.single.aAddress, '169.254.10.1');
    got.clear();
    ask(s, '_http._tcp.local', Dns.typePtr);
    ask(s, 'someone-else.local', Dns.typeA);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(got, isEmpty);
  });

  test('a unicast-response question (QU) is answered to the asker only', () async {
    final (s, got) = await lamp();
    final (_, bystander) = await lamp('169.254.10.51');
    await responder.start();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    got.clear();
    bystander.clear();
    ask(s, '_rdmnet._tcp.local', Dns.typePtr, qu: true);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(got, hasLength(1));
    expect(bystander.where((m) => m.isResponse), isEmpty, reason: 'it heard the question (multicast) but not the unicast answer');
  });

  test('says goodbye (TTL 0) when it stops', () async {
    final (_, got) = await lamp();
    await responder.start();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    got.clear();
    await responder.stop();
    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(got, isNotEmpty);
    expect(got.last.answers.every((r) => r.ttl == 0), isTrue);
  });

  test('an adapter whose port is taken is reported and the others still answer', () async {
    final r = MdnsResponder(
      socketFactory: (port, {bool reusePort = true, bool broadcast = true, String? localIp}) async {
        if (localIp == '192.168.1.20') throw const SocketException('Address already in use');
        return hub.open(ip: localIp!, port: port);
      },
      adapters: () async => const [AdapterInfo('Wi-Fi', '192.168.1.20'), AdapterInfo('Ethernet', '169.254.10.1')],
      service: service,
    );
    final (s, got) = await lamp();
    await r.start();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    got.clear();
    ask(s, '_rdmnet._tcp.local', Dns.typePtr);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(got, isNotEmpty);
    expect(r.unusable.keys, ['192.168.1.20']);
    expect(r.report(), contains('unusable 192.168.1.20'));
    await r.stop();
  });
}
