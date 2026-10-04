import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/bytes.dart';
import 'package:patchlab_rdm/core/dns.dart';

void main() {
  test('names are written as labels and read back, case-insensitively comparable', () {
    final w = ByteWriter();
    Dns.writeName(w, 'PatchLab RDM Broker._rdmnet._tcp.local');
    final b = w.toBytes();
    expect(b[0], 'PatchLab RDM Broker'.length);
    expect(b.last, 0);
    expect(Dns.readName(b, ByteReader(b)), 'PatchLab RDM Broker._rdmnet._tcp.local');
    expect(Dns.sameName('_RDMNET._tcp.local.', '_rdmnet._TCP.local'), isTrue);
    expect(() => Dns.writeName(ByteWriter(), 'a..b'), throwsArgumentError);
  });

  test('name compression pointers are followed, loops are refused', () {
    // header-less test buffer: "local" at offset 0, "x" + pointer to 0 at offset 7.
    final msg = Uint8List.fromList([5, 108, 111, 99, 97, 108, 0, 1, 120, 0xC0, 0x00]);
    expect(Dns.readName(msg, ByteReader(msg, 7)), 'x.local');
    final loop = Uint8List.fromList([0xC0, 0x00]);
    expect(() => Dns.readName(loop, ByteReader(loop)), throwsFormatException);
  });

  test('a response with PTR, SRV, TXT and A records survives encode and decode', () {
    final msg = DnsMessage(
      flags: Dns.flagResponse | Dns.flagAuthoritative,
      answers: [
        DnsRecord.ptr('_default._sub._rdmnet._tcp.local', 'PatchLab._rdmnet._tcp.local'),
        DnsRecord.srv('PatchLab._rdmnet._tcp.local', 'host.local', 8888),
        DnsRecord.txt('PatchLab._rdmnet._tcp.local', ['TxtVers=1', 'E133Scope=default']),
      ],
      additional: [DnsRecord.a('host.local', '169.254.10.1')],
    );
    final d = DnsMessage.decode(msg.encode());
    expect(d.isResponse, isTrue);
    expect(d.answers.length, 3);
    expect(d.answers[0].ptrTarget, 'PatchLab._rdmnet._tcp.local');
    expect(d.answers[1].srvTarget, 'host.local');
    expect(d.answers[1].srvPort, 8888);
    expect(d.answers[1].cacheFlush, isTrue);
    expect(d.answers[2].txtStrings, ['TxtVers=1', 'E133Scope=default']);
    expect(d.additional.single.aAddress, '169.254.10.1');
    expect(d.answers[0].goodbye().ttl, 0);
  });

  test('questions with the unicast bit', () {
    final q = DnsMessage(questions: [DnsQuestion('_rdmnet._tcp.local', Dns.typePtr, unicastResponse: true)]);
    final d = DnsMessage.decode(q.encode());
    expect(d.isResponse, isFalse);
    expect(d.questions.single.type, Dns.typePtr);
    expect(d.questions.single.unicastResponse, isTrue);
    expect(d.questions.single.cls, Dns.classIn);
  });

  test('garbage is a FormatException, not a crash', () {
    expect(() => DnsMessage.decode(Uint8List(5)), throwsFormatException);
    final bad = Uint8List(12)..[5] = 3; // claims 3 questions, has none
    expect(() => DnsMessage.decode(bad), throwsA(anyOf(isA<FormatException>(), isA<RangeError>())));
  });
}
