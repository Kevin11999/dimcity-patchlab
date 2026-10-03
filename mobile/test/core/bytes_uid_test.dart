import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/bytes.dart';
import 'package:patchlab_rdm/core/uid.dart';

void main() {
  test('ByteWriter / ByteReader round trip', () {
    final w = ByteWriter();
    w.u8(0xAB);
    w.u16(0x1234);
    w.u16le(0x1234);
    w.u32(0xDEADBEEF);
    w.fixedString('Node', 6);
    w.string('xyz', max: 2);
    final b = w.toBytes();
    expect(hex(b), 'ab1234341 2deadbeef4e6f6465000078 79'.replaceAll(' ', ''));
    final r = ByteReader(b);
    expect(r.u8(), 0xAB);
    expect(r.u16(), 0x1234);
    expect(r.u16le(), 0x1234);
    expect(r.u32(), 0xDEADBEEF);
    expect(r.fixedString(6), 'Node');
    expect(r.restString(), 'xy');
    expect(r.hasMore, isFalse);
  });

  test('ByteReader throws at end of data', () {
    final r = ByteReader(fromHex('01'));
    expect(() => r.u16(), throwsFormatException);
  });

  test('s16 is signed', () {
    expect(ByteReader(fromHex('fff6')).s16(), -10);
    expect(ByteReader(fromHex('0023')).s16(), 35);
  });

  test('fixedString is NUL terminated and truncates', () {
    final w = ByteWriter();
    w.fixedString('abcdefghijklmnopqrstuvwxyz', 4);
    expect(w.toBytes(), [0x61, 0x62, 0x63, 0x00]);
  });

  test('Uid bytes, string and parse', () {
    const u = Uid(0x4C55, 0x00012345);
    expect(hex(u.toBytes()), '4c5500012345');
    expect(u.toString(), '4C55:00012345');
    expect(Uid.tryParse('4c55:00012345'), u);
    expect(Uid.tryParse('4C5500012345'), u);
    expect(Uid.tryParse('nope'), isNull);
    expect(Uid.fromBytes(fromHex('aa4c5500012345bb'), 1), u);
    expect(Uid.fromInt(u.value), u);
    expect(Uid.broadcast.isBroadcast, isTrue);
    expect(u.isBroadcast, isFalse);
    expect(const Uid(0x8001, 1).isDynamic, isTrue);
  });

  test('random prototype UID is in the ESTA prototyping range', () {
    final u = Uid.randomPrototype();
    expect(u.manufacturerId, 0x7FF0);
    expect(u.deviceId, isNot(0));
  });
}
