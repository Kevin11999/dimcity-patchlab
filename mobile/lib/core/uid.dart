import 'dart:math';
import 'dart:typed_data';

import 'bytes.dart';

/// RDM Unique ID (ANSI E1.20): 16-bit ESTA manufacturer ID + 32-bit device ID.
class Uid implements Comparable<Uid> {
  const Uid(this.manufacturerId, this.deviceId);

  factory Uid.fromBytes(List<int> b, [int offset = 0]) => Uid(
        (b[offset] << 8) | b[offset + 1],
        ((b[offset + 2] << 24) |
                (b[offset + 3] << 16) |
                (b[offset + 4] << 8) |
                b[offset + 5]) &
            0xFFFFFFFF,
      );

  factory Uid.fromInt(int v) => Uid((v >> 32) & 0xFFFF, v & 0xFFFFFFFF);

  /// A random UID in the ESTA prototyping range (0x7FF0–0x7FFF).
  /// Replace the manufacturer ID with a registered ESTA ID for a release build.
  factory Uid.randomPrototype([Random? random]) {
    final r = random ?? Random.secure();
    return Uid(0x7FF0, r.nextInt(0x7FFFFFFF) | 1);
  }

  final int manufacturerId;
  final int deviceId;

  /// All devices, all manufacturers.
  static const broadcast = Uid(0xFFFF, 0xFFFFFFFF);

  /// E1.33 RPT: all devices / all controllers.
  static const rptAllDevices = Uid(0xFFFD, 0xFFFFFFFF);
  static const rptAllControllers = Uid(0xFFFC, 0xFFFFFFFF);

  static Uid? tryParse(String s) {
    final m = RegExp(r'^([0-9a-fA-F]{4}):?([0-9a-fA-F]{8})$').firstMatch(s.trim());
    if (m == null) return null;
    return Uid(int.parse(m.group(1)!, radix: 16), int.parse(m.group(2)!, radix: 16));
  }

  int get value => (manufacturerId << 32) | deviceId;

  bool get isBroadcast => deviceId == 0xFFFFFFFF;

  /// E1.33 dynamic UIDs have the top bit of the manufacturer ID set.
  bool get isDynamic => manufacturerId & 0x8000 != 0;

  /// Broadcast to every device of this manufacturer.
  Uid get manufacturerBroadcast => Uid(manufacturerId, 0xFFFFFFFF);

  Uint8List toBytes() {
    final w = ByteWriter();
    writeTo(w);
    return w.toBytes();
  }

  void writeTo(ByteWriter w) {
    w.u16(manufacturerId);
    w.u32(deviceId);
  }

  @override
  String toString() =>
      '${manufacturerId.toRadixString(16).padLeft(4, '0').toUpperCase()}:'
      '${deviceId.toRadixString(16).padLeft(8, '0').toUpperCase()}';

  @override
  bool operator ==(Object other) =>
      other is Uid &&
      other.manufacturerId == manufacturerId &&
      other.deviceId == deviceId;

  @override
  int get hashCode => Object.hash(manufacturerId, deviceId);

  @override
  int compareTo(Uid other) => value.compareTo(other.value);
}
