import 'dart:convert';
import 'dart:typed_data';

import 'bytes.dart';

/// DNS messages as used by multicast DNS (RFC 6762) and DNS-SD (RFC 6763), just enough to answer
/// questions about one service: names, PTR / SRV / TXT / A records, with name compression on reading.
class Dns {
  Dns._();

  static const typeA = 1;
  static const typePtr = 12;
  static const typeTxt = 16;
  static const typeAaaa = 28;
  static const typeSrv = 33;
  static const typeAny = 255;
  static const classIn = 1;
  static const cacheFlush = 0x8000;
  static const unicastResponse = 0x8000;

  static const flagResponse = 0x8000;
  static const flagAuthoritative = 0x0400;

  static const mdnsAddress = '224.0.0.251';
  static const mdnsPort = 5353;

  /// Case-insensitive name comparison without a trailing dot.
  static bool sameName(String a, String b) => _norm(a) == _norm(b);

  static String _norm(String n) => (n.endsWith('.') ? n.substring(0, n.length - 1) : n).toLowerCase();

  static void writeName(ByteWriter w, String name) {
    final n = name.endsWith('.') ? name.substring(0, name.length - 1) : name;
    if (n.isNotEmpty) {
      for (final label in n.split('.')) {
        final b = utf8.encode(label);
        if (b.isEmpty || b.length > 63) throw ArgumentError('bad DNS label "$label"');
        w.u8(b.length);
        w.bytes(b);
      }
    }
    w.u8(0);
  }

  /// Reads a name at the reader's position, following compression pointers.
  static String readName(Uint8List msg, ByteReader r) {
    final labels = <String>[];
    var pos = r.offset;
    var jumped = false;
    var guard = 0;
    while (true) {
      if (pos >= msg.length || guard++ > 128) throw const FormatException('bad DNS name');
      final len = msg[pos];
      if (len == 0) {
        pos++;
        break;
      }
      if (len & 0xC0 == 0xC0) {
        if (pos + 1 >= msg.length) throw const FormatException('bad DNS pointer');
        final target = ((len & 0x3F) << 8) | msg[pos + 1];
        if (!jumped) r.offset = pos + 2;
        jumped = true;
        pos = target;
        continue;
      }
      if (len & 0xC0 != 0 || pos + 1 + len > msg.length) throw const FormatException('bad DNS label');
      labels.add(utf8.decode(msg.sublist(pos + 1, pos + 1 + len), allowMalformed: true));
      pos += 1 + len;
    }
    if (!jumped) r.offset = pos;
    return labels.join('.');
  }
}

class DnsQuestion {
  DnsQuestion(this.name, this.type, {this.unicastResponse = false, this.cls = Dns.classIn});
  final String name;
  final int type;
  final int cls;

  /// The QU bit: the asker would like a unicast answer.
  final bool unicastResponse;

  @override
  String toString() => 'Q($name type=$type${unicastResponse ? ' QU' : ''})';
}

class DnsRecord {
  DnsRecord(this.name, this.type, this.ttl, this.data, {this.cacheFlush = false});

  final String name;
  final int type;
  final int ttl;

  /// The record data as it goes on the wire (names inside are written uncompressed).
  final Uint8List data;
  final bool cacheFlush;

  factory DnsRecord.ptr(String name, String target, {int ttl = 120}) {
    final w = ByteWriter();
    Dns.writeName(w, target);
    return DnsRecord(name, Dns.typePtr, ttl, w.toBytes());
  }

  factory DnsRecord.srv(String name, String target, int port, {int ttl = 120}) {
    final w = ByteWriter();
    w.u16(0); // priority
    w.u16(0); // weight
    w.u16(port);
    Dns.writeName(w, target);
    return DnsRecord(name, Dns.typeSrv, ttl, w.toBytes(), cacheFlush: true);
  }

  /// A TXT record from "key=value" strings (each at most 255 bytes).
  factory DnsRecord.txt(String name, List<String> strings, {int ttl = 4500}) {
    final w = ByteWriter();
    if (strings.isEmpty) w.u8(0);
    for (final s in strings) {
      final b = utf8.encode(s);
      if (b.length > 255) throw ArgumentError('TXT string too long');
      w.u8(b.length);
      w.bytes(b);
    }
    return DnsRecord(name, Dns.typeTxt, ttl, w.toBytes(), cacheFlush: true);
  }

  factory DnsRecord.a(String name, String ip, {int ttl = 120}) {
    final parts = ip.split('.').map(int.parse).toList();
    if (parts.length != 4) throw ArgumentError('bad IPv4 address $ip');
    return DnsRecord(name, Dns.typeA, ttl, Uint8List.fromList(parts), cacheFlush: true);
  }

  /// A copy with TTL 0: "goodbye", the record is no longer valid.
  DnsRecord goodbye() => DnsRecord(name, type, 0, data, cacheFlush: cacheFlush);

  // Parsed views, used by the tests and by whoever reads responses.
  String? get ptrTarget => type == Dns.typePtr ? _nameAt(0) : null;
  String? get srvTarget => type == Dns.typeSrv ? _nameAt(6) : null;
  int? get srvPort => type == Dns.typeSrv ? (data[4] << 8) | data[5] : null;
  String? get aAddress => type == Dns.typeA && data.length == 4 ? data.join('.') : null;
  List<String>? get txtStrings {
    if (type != Dns.typeTxt) return null;
    final out = <String>[];
    var i = 0;
    while (i < data.length) {
      final len = data[i++];
      if (len == 0 && data.length == 1) break;
      if (i + len > data.length) break;
      out.add(utf8.decode(data.sublist(i, i + len), allowMalformed: true));
      i += len;
    }
    return out;
  }

  String _nameAt(int offset) => Dns.readName(data, ByteReader(data, offset));

  @override
  String toString() => 'RR($name type=$type ttl=$ttl)';
}

class DnsMessage {
  DnsMessage({
    this.id = 0,
    this.flags = 0,
    this.questions = const [],
    this.answers = const [],
    this.authority = const [],
    this.additional = const [],
  });

  final int id;
  final int flags;
  final List<DnsQuestion> questions;
  final List<DnsRecord> answers;
  final List<DnsRecord> authority;
  final List<DnsRecord> additional;

  bool get isResponse => flags & Dns.flagResponse != 0;

  Uint8List encode() {
    final w = ByteWriter();
    w.u16(id);
    w.u16(flags);
    w.u16(questions.length);
    w.u16(answers.length);
    w.u16(authority.length);
    w.u16(additional.length);
    for (final q in questions) {
      Dns.writeName(w, q.name);
      w.u16(q.type);
      w.u16(q.cls | (q.unicastResponse ? Dns.unicastResponse : 0));
    }
    for (final r in [...answers, ...authority, ...additional]) {
      Dns.writeName(w, r.name);
      w.u16(r.type);
      w.u16(Dns.classIn | (r.cacheFlush ? Dns.cacheFlush : 0));
      w.u32(r.ttl);
      w.u16(r.data.length);
      w.bytes(r.data);
    }
    return w.toBytes();
  }

  /// Parses a message; throws [FormatException] on garbage. Names inside record data of the known
  /// types are decompressed so [DnsRecord.data] is self-contained.
  static DnsMessage decode(Uint8List msg) {
    if (msg.length < 12) throw const FormatException('DNS message too short');
    final r = ByteReader(msg);
    final id = r.u16();
    final flags = r.u16();
    final qd = r.u16();
    final an = r.u16();
    final ns = r.u16();
    final ar = r.u16();
    final questions = <DnsQuestion>[];
    for (var i = 0; i < qd; i++) {
      final name = Dns.readName(msg, r);
      final type = r.u16();
      final cls = r.u16();
      questions.add(DnsQuestion(name, type, unicastResponse: cls & Dns.unicastResponse != 0, cls: cls & 0x7FFF));
    }
    List<DnsRecord> records(int n) {
      final out = <DnsRecord>[];
      for (var i = 0; i < n; i++) {
        final name = Dns.readName(msg, r);
        final type = r.u16();
        final cls = r.u16();
        final ttl = r.u32();
        final len = r.u16();
        final start = r.offset;
        var data = r.bytes(len);
        if (type == Dns.typePtr) {
          final w = ByteWriter();
          Dns.writeName(w, Dns.readName(msg, ByteReader(msg, start)));
          data = w.toBytes();
        } else if (type == Dns.typeSrv && len >= 7) {
          final w = ByteWriter();
          w.bytes(data.sublist(0, 6));
          Dns.writeName(w, Dns.readName(msg, ByteReader(msg, start + 6)));
          data = w.toBytes();
        }
        out.add(DnsRecord(name, type, ttl, data, cacheFlush: cls & Dns.cacheFlush != 0));
      }
      return out;
    }

    return DnsMessage(
      id: id,
      flags: flags,
      questions: questions,
      answers: records(an),
      authority: records(ns),
      additional: records(ar),
    );
  }
}
