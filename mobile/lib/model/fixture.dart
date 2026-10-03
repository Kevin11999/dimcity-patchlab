import '../core/rdm/rdm_params.dart';
import '../core/uid.dart';

/// A fixture type: the same manufacturer + model id share the mode list and
/// get one mode choice in the addressing step.
class FixtureType {
  FixtureType({
    required this.key,
    required this.manufacturerId,
    required this.modelId,
    required this.manufacturer,
    required this.model,
    required this.personalities,
  });

  static String keyFor(int manufacturerId, int modelId) =>
      '${manufacturerId.toRadixString(16).padLeft(4, '0')}:${modelId.toRadixString(16).padLeft(4, '0')}';

  final String key;
  final int manufacturerId;
  final int modelId;
  final String manufacturer;
  final String model;
  List<PersonalityDescription> personalities;

  String get label {
    if (model.isNotEmpty && manufacturer.isNotEmpty) return '$manufacturer $model';
    if (model.isNotEmpty) return model;
    return 'Type $key';
  }

  PersonalityDescription? personality(int n) => personalities.where((p) => p.personality == n).firstOrNull;

  int? footprintOf(int personality) => this.personality(personality)?.footprint;
}

/// One discovered fixture with the details the app shows and changes.
class Fixture {
  Fixture({
    required this.uid,
    required this.type,
    required this.info,
    required this.label,
    this.softwareVersion,
  })  : address = info.dmxStartAddress,
        personality = info.currentPersonality,
        footprint = info.dmxFootprint;

  final Uid uid;
  final FixtureType type;
  DeviceInfo info;
  String label;
  String? softwareVersion;
  int address;
  int personality;
  int footprint;

  /// Transient, set by the UI when the fixture is blinking.
  bool identifying = false;

  String get displayName => label.isNotEmpty ? label : type.model.isNotEmpty ? type.model : uid.toString();

  String get modeLabel {
    final p = type.personality(personality);
    if (p == null) return '$footprint ch';
    return '${p.label} ($footprint ch)';
  }

  bool get hasAddress => address >= 1 && address <= 512;

  void applyMode(int newPersonality) {
    personality = newPersonality;
    footprint = type.footprintOf(newPersonality) ?? footprint;
  }
}
