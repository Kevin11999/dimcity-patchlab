import 'dart:typed_data';

import '../bytes.dart';
import '../uid.dart';
import 'rdm_constants.dart';

/// DEVICE_INFO response (E1.20 10.5.1).
class DeviceInfo {
  DeviceInfo({
    required this.protocolVersion,
    required this.deviceModelId,
    required this.productCategory,
    required this.softwareVersionId,
    required this.dmxFootprint,
    required this.currentPersonality,
    required this.personalityCount,
    required this.dmxStartAddress,
    required this.subDeviceCount,
    required this.sensorCount,
  });

  factory DeviceInfo.decode(Uint8List data) {
    final r = ByteReader(data);
    return DeviceInfo(
      protocolVersion: r.u16(),
      deviceModelId: r.u16(),
      productCategory: r.u16(),
      softwareVersionId: r.u32(),
      dmxFootprint: r.u16(),
      currentPersonality: r.u8(),
      personalityCount: r.u8(),
      dmxStartAddress: r.u16(),
      subDeviceCount: r.u16(),
      sensorCount: r.u8(),
    );
  }

  final int protocolVersion;
  final int deviceModelId;
  final int productCategory;
  final int softwareVersionId;
  final int dmxFootprint;
  final int currentPersonality;
  final int personalityCount;
  final int dmxStartAddress;
  final int subDeviceCount;
  final int sensorCount;

  Uint8List encode() {
    final w = ByteWriter();
    w.u16(protocolVersion);
    w.u16(deviceModelId);
    w.u16(productCategory);
    w.u32(softwareVersionId);
    w.u16(dmxFootprint);
    w.u8(currentPersonality);
    w.u8(personalityCount);
    w.u16(dmxStartAddress);
    w.u16(subDeviceCount);
    w.u8(sensorCount);
    return w.toBytes();
  }

  /// 0xFFFF means "no DMX address" (e.g. a device without a footprint).
  bool get hasDmxAddress => dmxStartAddress >= 1 && dmxStartAddress <= 512;
}

/// DMX_PERSONALITY_DESCRIPTION response.
class PersonalityDescription {
  PersonalityDescription({required this.personality, required this.footprint, required this.description});

  factory PersonalityDescription.decode(Uint8List data) {
    final r = ByteReader(data);
    return PersonalityDescription(
      personality: r.u8(),
      footprint: r.u16(),
      description: r.restString(),
    );
  }

  final int personality;
  final int footprint;
  final String description;

  Uint8List encode() {
    final w = ByteWriter();
    w.u8(personality);
    w.u16(footprint);
    w.string(description, max: 32);
    return w.toBytes();
  }

  String get label => description.isEmpty ? 'Mode $personality' : description;

  @override
  String toString() => '$label ($footprint ch)';
}

/// DMX_PERSONALITY GET response: current personality and count.
class PersonalityState {
  PersonalityState(this.current, this.count);
  factory PersonalityState.decode(Uint8List data) => PersonalityState(data[0], data[1]);
  final int current;
  final int count;
}

/// SENSOR_DEFINITION response.
class SensorDefinition {
  SensorDefinition({
    required this.sensor,
    required this.type,
    required this.unit,
    required this.prefix,
    required this.rangeMin,
    required this.rangeMax,
    required this.normalMin,
    required this.normalMax,
    required this.recordedValueSupport,
    required this.description,
  });

  factory SensorDefinition.decode(Uint8List data) {
    final r = ByteReader(data);
    return SensorDefinition(
      sensor: r.u8(),
      type: r.u8(),
      unit: r.u8(),
      prefix: r.u8(),
      rangeMin: r.s16(),
      rangeMax: r.s16(),
      normalMin: r.s16(),
      normalMax: r.s16(),
      recordedValueSupport: r.u8(),
      description: r.restString(),
    );
  }

  final int sensor;
  final int type;
  final int unit;
  final int prefix;
  final int rangeMin;
  final int rangeMax;
  final int normalMin;
  final int normalMax;
  final int recordedValueSupport;
  final String description;

  bool get isTemperature => type == SensorType.temperature;

  String format(int raw) {
    final v = raw * SensorUnit.prefixFactor(prefix);
    final text = v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);
    final sym = SensorUnit.symbol(unit);
    return sym.isEmpty ? text : '$text $sym';
  }
}

/// SENSOR_VALUE response.
class SensorValue {
  SensorValue({required this.sensor, required this.present, required this.lowest, required this.highest, required this.recorded});

  factory SensorValue.decode(Uint8List data) {
    final r = ByteReader(data);
    return SensorValue(
      sensor: r.u8(),
      present: r.s16(),
      lowest: r.s16(),
      highest: r.s16(),
      recorded: r.s16(),
    );
  }

  final int sensor;
  final int present;
  final int lowest;
  final int highest;
  final int recorded;
}

/// Encoders for parameter data of the requests this app sends.
class RdmData {
  RdmData._();

  static Uint8List u8(int v) => Uint8List.fromList([v & 0xFF]);
  static Uint8List u16(int v) => Uint8List.fromList([(v >> 8) & 0xFF, v & 0xFF]);
  static Uint8List u32(int v) => Uint8List.fromList([(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]);

  static Uint8List startAddress(int address) {
    if (address < 1 || address > 512) throw ArgumentError.value(address, 'address', 'must be 1..512');
    return u16(address);
  }

  static Uint8List personality(int personality) {
    if (personality < 1 || personality > 255) throw ArgumentError.value(personality, 'personality');
    return u8(personality);
  }

  static Uint8List identify(bool on) => u8(on ? 1 : 0);
  static Uint8List reset({bool cold = false}) => u8(cold ? Rdm.resetCold : Rdm.resetWarm);
  static Uint8List queuedMessage(int statusType) => u8(statusType);

  static Uint8List label(String text) {
    final w = ByteWriter();
    w.string(text, max: 32);
    return w.toBytes();
  }

  static String decodeString(Uint8List data) => latin1Trim(data);
  static int decodeU16(Uint8List data) => (data[0] << 8) | data[1];
  static int decodeU32(Uint8List data) =>
      ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) & 0xFFFFFFFF;
  static bool decodeBool(Uint8List data) => data.isNotEmpty && data[0] != 0;

  static List<int> decodeU16List(Uint8List data) {
    final out = <int>[];
    for (var i = 0; i + 1 < data.length; i += 2) {
      out.add((data[i] << 8) | data[i + 1]);
    }
    return out;
  }

  static List<Uid> decodeUidList(Uint8List data) {
    final out = <Uid>[];
    for (var i = 0; i + 5 < data.length; i += 6) {
      out.add(Uid.fromBytes(data, i));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// ANSI E1.37-7: gateway endpoints (used over RDMnet).
// ---------------------------------------------------------------------------

/// One entry of an ENDPOINT_LIST response.
class EndpointEntry {
  EndpointEntry(this.id, this.type);
  final int id;

  /// 0x00 = virtual, 0x01 = physical.
  final int type;
}

class EndpointList {
  EndpointList(this.listChangeNumber, this.endpoints);

  factory EndpointList.decode(Uint8List data) {
    final r = ByteReader(data);
    final change = r.u32();
    final list = <EndpointEntry>[];
    while (r.remaining >= 3) {
      list.add(EndpointEntry(r.u16(), r.u8()));
    }
    return EndpointList(change, list);
  }

  final int listChangeNumber;
  final List<EndpointEntry> endpoints;
}

/// ENDPOINT_RESPONDERS response: the responders (TOD) behind one endpoint.
class EndpointResponders {
  EndpointResponders(this.endpoint, this.listChangeNumber, this.responders);

  factory EndpointResponders.decode(Uint8List data) {
    final r = ByteReader(data);
    final endpoint = r.u16();
    final change = r.u32();
    final uids = <Uid>[];
    while (r.remaining >= 6) {
      uids.add(Uid.fromBytes(r.bytes(6)));
    }
    return EndpointResponders(endpoint, change, uids);
  }

  final int endpoint;
  final int listChangeNumber;
  final List<Uid> responders;
}

/// ENDPOINT_TO_UNIVERSE response.
class EndpointUniverse {
  EndpointUniverse(this.endpoint, this.universe);
  factory EndpointUniverse.decode(Uint8List data) => EndpointUniverse(RdmData.decodeU16(data), (data[2] << 8) | data[3]);
  final int endpoint;

  /// sACN universe 1..63999; 0 = not patched.
  final int universe;
}

// ---------------------------------------------------------------------------
// ANSI E1.33: COMPONENT_SCOPE (read over LLRP to find a component's broker).
// ---------------------------------------------------------------------------

class ComponentScope {
  ComponentScope({
    required this.slot,
    required this.scope,
    required this.staticConfigType,
    required this.staticIpv4,
    required this.staticPort,
  });

  factory ComponentScope.decode(Uint8List data) {
    final r = ByteReader(data);
    final slot = r.u16();
    final scope = r.fixedString(63);
    final type = r.u8();
    final v4 = r.bytes(4);
    r.skip(16); // IPv6
    final port = r.u16();
    return ComponentScope(
      slot: slot,
      scope: scope,
      staticConfigType: type,
      staticIpv4: type == 1 ? v4.join('.') : null,
      staticPort: port,
    );
  }

  final int slot;
  final String scope;
  final int staticConfigType;
  final String? staticIpv4;
  final int staticPort;

  static Uint8List request(int slot) => RdmData.u16(slot);
}
