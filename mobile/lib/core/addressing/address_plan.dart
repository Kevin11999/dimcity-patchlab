/// The addressing calculation: fixtures in the aligned order, one mode
/// (footprint) per fixture type, a start address, and the 512-channel limit.
///
/// Rule: every next address = previous address + footprint of the previous
/// fixture. When a fixture does not fit in the universe any more the plan
/// stops at that fixture ([PlanResult.overflow]) and the technician decides:
/// continue on address 1 of the next universe ([PlanInput.wrapBefore]) or
/// change the order / start address.
class PlanFixture {
  const PlanFixture({required this.id, required this.typeKey, required this.name});

  final String id;

  /// Groups fixtures of the same type (manufacturer + model); the mode is chosen per type.
  final String typeKey;
  final String name;
}

class PlanInput {
  const PlanInput({
    required this.order,
    required this.footprintByType,
    required this.startAddress,
    this.startUniverse = 1,
    this.wrapBefore = const {},
  });

  final List<PlanFixture> order;

  /// Channels per fixture type, from the chosen mode.
  final Map<String, int> footprintByType;

  /// 1..512.
  final int startAddress;
  final int startUniverse;

  /// Fixture ids for which the technician chose "start on 1 in the next universe".
  final Set<String> wrapBefore;

  PlanInput copyWith({int? startAddress, int? startUniverse, Set<String>? wrapBefore, List<PlanFixture>? order, Map<String, int>? footprintByType}) =>
      PlanInput(
        order: order ?? this.order,
        footprintByType: footprintByType ?? this.footprintByType,
        startAddress: startAddress ?? this.startAddress,
        startUniverse: startUniverse ?? this.startUniverse,
        wrapBefore: wrapBefore ?? this.wrapBefore,
      );
}

class PlanEntry {
  const PlanEntry({required this.fixture, required this.universe, required this.address, required this.footprint});

  final PlanFixture fixture;
  final int universe;
  final int address;
  final int footprint;

  int get lastChannel => address + footprint - 1;

  @override
  String toString() => '${fixture.name}: U$universe $address-$lastChannel';
}

/// The fixture that does not fit, and where it would have started.
class PlanOverflow {
  const PlanOverflow({required this.fixture, required this.index, required this.universe, required this.wouldStart, required this.footprint});

  final PlanFixture fixture;
  final int index;
  final int universe;
  final int wouldStart;
  final int footprint;

  int get wouldEnd => wouldStart + footprint - 1;
}

class PlanResult {
  const PlanResult({required this.entries, this.overflow, this.error});

  final List<PlanEntry> entries;
  final PlanOverflow? overflow;
  final String? error;

  bool get complete => overflow == null && error == null;

  /// Universes used by the plan, in order.
  List<int> get universes => entries.map((e) => e.universe).toSet().toList()..sort();
}

const dmxUniverseSize = 512;

PlanResult computePlan(PlanInput input) {
  if (input.startAddress < 1 || input.startAddress > dmxUniverseSize) {
    return PlanResult(entries: const [], error: 'start address must be 1..$dmxUniverseSize');
  }
  if (input.startUniverse < 0) {
    return const PlanResult(entries: [], error: 'universe must be 0 or higher');
  }
  var universe = input.startUniverse;
  var address = input.startAddress;
  final entries = <PlanEntry>[];
  for (var i = 0; i < input.order.length; i++) {
    final f = input.order[i];
    final footprint = input.footprintByType[f.typeKey];
    if (footprint == null || footprint < 1) {
      return PlanResult(entries: entries, error: 'no mode chosen for ${f.typeKey}');
    }
    if (input.wrapBefore.contains(f.id) && i > 0) {
      universe += 1;
      address = 1;
    }
    if (address + footprint - 1 > dmxUniverseSize) {
      return PlanResult(
        entries: entries,
        overflow: PlanOverflow(fixture: f, index: i, universe: universe, wouldStart: address, footprint: footprint),
      );
    }
    entries.add(PlanEntry(fixture: f, universe: universe, address: address, footprint: footprint));
    address += footprint;
  }
  return PlanResult(entries: entries);
}
