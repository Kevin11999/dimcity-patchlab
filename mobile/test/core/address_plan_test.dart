import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/addressing/address_plan.dart';

void main() {
  const wash1 = PlanFixture(id: 'w1', typeKey: 'prowash', name: 'Wash 1');
  const spot1 = PlanFixture(id: 's1', typeKey: 'minispot', name: 'Spot 1');
  const wash2 = PlanFixture(id: 'w2', typeKey: 'prowash', name: 'Wash 2');

  test('the example from the specification: 1, 9, 25', () {
    final r = computePlan(const PlanInput(
      order: [wash1, spot1, wash2],
      footprintByType: {'prowash': 8, 'minispot': 16},
      startAddress: 1,
    ));
    expect(r.complete, isTrue);
    expect(r.entries.map((e) => e.address), [1, 9, 25]);
    expect(r.entries.map((e) => e.lastChannel), [8, 24, 32]);
    expect(r.entries.every((e) => e.universe == 1), isTrue);
  });

  test('a fixture that does not fit stops the plan at that fixture', () {
    final r = computePlan(const PlanInput(
      order: [wash1, spot1, wash2],
      footprintByType: {'prowash': 8, 'minispot': 16},
      startAddress: 497,
    ));
    // Wash 1: 497-504. Spot 1 would be 505-520: does not fit, the plan stops there.
    expect(r.complete, isFalse);
    expect(r.entries.length, 1);
    expect(r.entries[0].lastChannel, 504);
    final o = r.overflow!;
    expect(o.fixture.id, 's1');
    expect(o.index, 1);
    expect(o.wouldStart, 505);
    expect(o.wouldEnd, 520);
  });

  test('505 + 16 channels does not fit; wrapping continues on 1 in the next universe', () {
    const input = PlanInput(
      order: [wash1, spot1, wash2],
      footprintByType: {'prowash': 8, 'minispot': 16},
      startAddress: 489,
      startUniverse: 3,
    );
    // Wash 1: 489-496, Spot 1: 497-512, Wash 2 would start at 513 -> overflow.
    final first = computePlan(input);
    expect(first.overflow!.fixture.id, 'w2');
    expect(first.overflow!.universe, 3);
    final wrapped = computePlan(input.copyWith(wrapBefore: {'w2'}));
    expect(wrapped.complete, isTrue);
    expect(wrapped.entries[2].universe, 4);
    expect(wrapped.entries[2].address, 1);
    expect(wrapped.universes, [3, 4]);
  });

  test('a 16 channel fixture at 505 overflows (505 + 16 - 1 = 520)', () {
    final r = computePlan(const PlanInput(
      order: [spot1],
      footprintByType: {'minispot': 16},
      startAddress: 505,
    ));
    expect(r.overflow!.wouldEnd, 520);
    expect(r.entries, isEmpty);
  });

  test('exactly filling the universe is fine', () {
    final r = computePlan(const PlanInput(
      order: [spot1],
      footprintByType: {'minispot': 16},
      startAddress: 497,
    ));
    expect(r.complete, isTrue);
    expect(r.entries.single.lastChannel, 512);
  });

  test('missing mode and bad start address are reported', () {
    expect(computePlan(const PlanInput(order: [wash1], footprintByType: {}, startAddress: 1)).error, isNotNull);
    expect(computePlan(const PlanInput(order: [wash1], footprintByType: {'prowash': 8}, startAddress: 0)).error, isNotNull);
    expect(computePlan(const PlanInput(order: [wash1], footprintByType: {'prowash': 8}, startAddress: 513)).error, isNotNull);
  });

  test('wrapBefore on the first fixture is ignored', () {
    final r = computePlan(const PlanInput(order: [wash1], footprintByType: {'prowash': 8}, startAddress: 10, wrapBefore: {'w1'}));
    expect(r.entries.single.universe, 1);
    expect(r.entries.single.address, 10);
  });
}
