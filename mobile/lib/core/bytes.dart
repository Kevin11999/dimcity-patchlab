import 'dart:convert';
import 'dart:typed_data';

/// Byte writer used by every packet encoder (big-endian unless noted).
class ByteWriter {
  final List<int> _bytes = <int>[];

  int get length => _bytes.length;

  void u8(int v) => _bytes.add(v & 0xFF);

  void u16(int v) {
    _bytes
      ..add((v >> 8) & 0xFF)
      ..add(v & 0xFF);
  }

  void u16le(int v) {
    _bytes
      ..add(v & 0xFF)
      ..add((v >> 8) & 0xFF);
  }

  void u32(int v) {
    _bytes
      ..add((v >> 24) & 0xFF)
      ..add((v >> 16) & 0xFF)
      ..add((v >> 8) & 0xFF)
      ..add(v & 0xFF);
  }

  void bytes(List<int> b) => _bytes.addAll(b);

  void zeros(int n) {
    for (var i = 0; i < n; i++) {
      _bytes.add(0);
    }
  }

  /// Writes [s] as Latin-1 in a field of exactly [len] bytes, zero padded.
  /// With [nullTerminated] the last byte of the field is always 0.
  void fixedString(String s, int len, {bool nullTerminated = true}) {
    final max = nullTerminated ? len - 1 : len;
    final enc = latin1.encode(s.replaceAll(RegExp(r'[^\x00-\xFF]'), '?'));
    final n = enc.length > max ? max : enc.length;
    _bytes.addAll(enc.sublist(0, n));
    zeros(len - n);
  }

  /// Writes [s] as Latin-1 without padding, truncated to [max] bytes.
  void string(String s, {int? max}) {
    var enc = latin1.encode(s.replaceAll(RegExp(r'[^\x00-\xFF]'), '?'));
    if (max != null && enc.length > max) enc = enc.sublist(0, max);
    _bytes.addAll(enc);
  }

  void set(int index, int v) => _bytes[index] = v & 0xFF;

  Uint8List toBytes() => Uint8List.fromList(_bytes);
}

/// Byte reader with bounds checking (big-endian unless noted).
class ByteReader {
  ByteReader(this.data, [this.offset = 0]);

  final Uint8List data;
  int offset;

  int get remaining => data.length - offset;
  bool get hasMore => offset < data.length;

  void _need(int n) {
    if (offset + n > data.length) {
      throw FormatException(
          'Unexpected end of data at $offset (need $n, have ${data.length - offset})');
    }
  }

  int u8() {
    _need(1);
    return data[offset++];
  }

  int u16() {
    _need(2);
    final v = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    return v;
  }

  int u16le() {
    _need(2);
    final v = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    return v;
  }

  int s16() {
    final v = u16();
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  int u32() {
    _need(4);
    final v = (data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3];
    offset += 4;
    return v;
  }

  Uint8List bytes(int n) {
    _need(n);
    final b = Uint8List.fromList(data.sublist(offset, offset + n));
    offset += n;
    return b;
  }

  /// Reads a zero-padded Latin-1 field of [n] bytes.
  String fixedString(int n) => latin1Trim(bytes(n));

  Uint8List rest() => bytes(remaining);

  String restString() => latin1Trim(rest());

  void skip(int n) {
    _need(n);
    offset += n;
  }
}

/// Decodes Latin-1 up to the first NUL and trims whitespace.
String latin1Trim(List<int> b) {
  var end = b.indexOf(0);
  if (end < 0) end = b.length;
  return latin1.decode(b.sublist(0, end)).trim();
}

String hex(List<int> b, {String separator = ''}) =>
    b.map((e) => e.toRadixString(16).padLeft(2, '0')).join(separator);

Uint8List fromHex(String s) {
  final clean = s.replaceAll(RegExp(r'[^0-9a-fA-F]'), '');
  final out = Uint8List(clean.length ~/ 2);
  for (var i = 0; i < out.length; i++) {
    out[i] = int.parse(clean.substring(i * 2, i * 2 + 2), radix: 16);
  }
  return out;
}
