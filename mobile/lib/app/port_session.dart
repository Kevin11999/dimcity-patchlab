import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/addressing/address_plan.dart';
import '../core/rdm/rdm_params.dart';
import '../core/uid.dart';
import '../model/fixture.dart';
import '../model/node.dart';
import '../services/rdm_client.dart';
import 'backend.dart';

enum SessionPhase { idle, discovering, loadingDetails, ready, aligning, modes, addressing, overview, sending, done }

enum SendStatus { pending, sending, verified, failed }

class SendState {
  SendState(this.status, [this.message]);
  final SendStatus status;
  final String? message;
}

/// Everything that happens on one port: discovery, align, modes, addressing,
/// sending and verifying. One instance per opened port.
class PortSession extends ChangeNotifier {
  PortSession(this.backend, this.node, this.port);

  final AppBackend backend;
  final Node node;
  final NodePort port;

  SessionPhase phase = SessionPhase.idle;
  String? error;
  String? routeNote;
  RdmClient? client;
  String routeName = '';

  final List<Fixture> fixtures = <Fixture>[];
  final Map<String, FixtureType> types = <String, FixtureType>{};
  int detailIndex = 0;

  // Align
  final List<Fixture> placed = <Fixture>[];
  final List<Fixture> queue = <Fixture>[];
  Fixture? current;
  bool alignDone = false;

  // Modes and addressing
  final Map<String, int> modeByType = <String, int>{};
  int startAddress = 1;
  late int startUniverse = port.displayUniverse;
  final Set<String> wrapBefore = <String>{};

  // Sending
  final Map<Uid, SendState> sendState = <Uid, SendState>{};
  bool _disposed = false;

  bool get busy => phase == SessionPhase.discovering || phase == SessionPhase.loadingDetails || phase == SessionPhase.sending;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  Future<void> discover() async {
    final route = backend.routeFor(node, port);
    if (route == null) {
      error = 'No RDM route for this port';
      phase = SessionPhase.idle;
      _notify();
      return;
    }
    phase = SessionPhase.discovering;
    error = null;
    routeNote = null;
    fixtures.clear();
    placed.clear();
    queue.clear();
    current = null;
    alignDone = false;
    sendState.clear();
    _notify();

    List<Uid>? uids;
    RdmTransport transport = route.primary;
    try {
      uids = await transport.discover();
    } on RdmException catch (e) {
      final fb = route.fallback;
      if (fb != null) {
        try {
          uids = await fb.discover();
          transport = fb;
          routeNote = 'fallback';
        } on RdmException catch (e2) {
          error = '${e.message} / ${e2.message}';
        }
      } else {
        error = e.message;
      }
    }
    if (uids == null) {
      phase = SessionPhase.idle;
      _notify();
      return;
    }
    routeName = transport.routeName;
    final c = RdmClient(transport);
    client = c;
    phase = SessionPhase.loadingDetails;
    detailIndex = 0;
    _notify();
    for (final uid in uids) {
      detailIndex++;
      _notify();
      try {
        fixtures.add(await _loadFixture(c, uid));
      } on RdmException catch (e) {
        // A fixture that stops answering is listed without details.
        fixtures.add(Fixture(
          uid: uid,
          type: _typeFor(uid.manufacturerId, 0, '', ''),
          info: DeviceInfo(protocolVersion: 0, deviceModelId: 0, productCategory: 0, softwareVersionId: 0, dmxFootprint: 0, currentPersonality: 0, personalityCount: 0, dmxStartAddress: 0, subDeviceCount: 0, sensorCount: 0),
          label: '',
        ));
        error = e.message;
      }
    }
    phase = SessionPhase.ready;
    _notify();
  }

  FixtureType _typeFor(int manufacturerId, int modelId, String manufacturer, String model) {
    final key = FixtureType.keyFor(manufacturerId, modelId);
    return types.putIfAbsent(
      key,
      () => FixtureType(key: key, manufacturerId: manufacturerId, modelId: modelId, manufacturer: manufacturer, model: model, personalities: []),
    );
  }

  Future<Fixture> _loadFixture(RdmClient c, Uid uid) async {
    final info = await c.deviceInfo(uid);
    final key = FixtureType.keyFor(uid.manufacturerId, info.deviceModelId);
    var type = types[key];
    if (type == null) {
      final model = await c.deviceModelDescription(uid);
      final manufacturer = await c.manufacturerLabel(uid);
      type = _typeFor(uid.manufacturerId, info.deviceModelId, manufacturer, model);
    }
    if (type.personalities.isEmpty && info.personalityCount > 0) {
      type.personalities = await c.personalities(uid, info.personalityCount);
    }
    final label = await c.deviceLabel(uid);
    return Fixture(uid: uid, type: type, info: info, label: label);
  }

  /// Re-reads address, mode and label of one fixture.
  Future<void> refresh(Fixture f) async {
    final c = client;
    if (c == null) return;
    final info = await c.deviceInfo(f.uid);
    f.info = info;
    f.address = info.dmxStartAddress;
    f.personality = info.currentPersonality;
    f.footprint = info.dmxFootprint;
    f.label = await c.deviceLabel(f.uid);
    _notify();
  }

  // ---------------------------------------------------------------------------
  // Identify / rename / reset / info
  // ---------------------------------------------------------------------------

  Future<void> identify(Fixture f, bool on) async {
    final c = client;
    if (c == null) return;
    await c.identify(f.uid, on);
    f.identifying = on;
    _notify();
  }

  Future<void> rename(Fixture f, String label) async {
    final c = client;
    if (c == null) return;
    await c.setDeviceLabel(f.uid, label);
    f.label = await c.deviceLabel(f.uid);
    _notify();
  }

  Future<void> reset(Fixture f, {bool cold = false}) async {
    final c = client;
    if (c == null) return;
    await c.reset(f.uid, cold: cold);
    f.identifying = false;
    _notify();
  }

  Future<void> setAddress(Fixture f, int address) async {
    final c = client;
    if (c == null) return;
    await c.setStartAddress(f.uid, address);
    await refresh(f);
  }

  Future<void> setMode(Fixture f, int personality) async {
    final c = client;
    if (c == null) return;
    await c.setPersonality(f.uid, personality);
    await refresh(f);
  }

  // ---------------------------------------------------------------------------
  // Align
  // ---------------------------------------------------------------------------

  Future<void> startAlign() async {
    placed.clear();
    queue
      ..clear()
      ..addAll(fixtures);
    alignDone = false;
    phase = SessionPhase.aligning;
    await _blink(queue.firstOrNull);
    _notify();
  }

  Future<void> _blink(Fixture? next) async {
    final prev = current;
    current = next;
    if (prev != null && prev != next) {
      try {
        await identify(prev, false);
      } on RdmException {
        prev.identifying = false;
      }
    }
    if (next != null) {
      try {
        await identify(next, true);
      } on RdmException catch (e) {
        error = e.message;
      }
    }
    _notify();
  }

  /// "Align": the blinking fixture is the next one in the row.
  Future<void> alignCurrent() async {
    final f = current;
    if (f == null) return;
    queue.remove(f);
    placed.add(f);
    if (queue.isEmpty) {
      alignDone = true;
      await _blink(null);
    } else {
      await _blink(queue.first);
    }
    _notify();
  }

  /// "Skip": try another fixture; this one comes back later.
  Future<void> skipCurrent() async {
    final f = current;
    if (f == null || queue.length < 2) return;
    queue.remove(f);
    queue.add(f);
    await _blink(queue.first);
  }

  /// "Step back": undo the last placement; that fixture blinks again.
  Future<void> stepBack() async {
    if (placed.isEmpty) return;
    final last = placed.removeLast();
    queue.insert(0, last);
    alignDone = false;
    await _blink(last);
  }

  /// [newIndex] is the position after removal (ReorderableListView.onReorderItem).
  void reorderPlaced(int oldIndex, int newIndex) {
    final f = placed.removeAt(oldIndex);
    placed.insert(newIndex, f);
    _notify();
  }

  /// Leaves the align step (stops the blinking).
  Future<void> stopAlign() async {
    await _blink(null);
    phase = SessionPhase.ready;
    _notify();
  }

  /// Address without align: take the fixtures in their discovery order.
  void useDiscoveryOrder() {
    placed
      ..clear()
      ..addAll(fixtures);
    queue.clear();
    alignDone = true;
  }

  // ---------------------------------------------------------------------------
  // Modes and addresses
  // ---------------------------------------------------------------------------

  /// The fixtures to address, in the aligned order.
  List<Fixture> get ordered => placed.isEmpty ? fixtures : placed;

  /// Types in use, with their fixture counts, in order of first appearance.
  List<(FixtureType, int)> get typesInUse {
    final counts = <String, int>{};
    final order = <String>[];
    for (final f in ordered) {
      if (!counts.containsKey(f.type.key)) order.add(f.type.key);
      counts[f.type.key] = (counts[f.type.key] ?? 0) + 1;
    }
    return [for (final k in order) (types[k]!, counts[k]!)];
  }

  Future<void> goToModes() async {
    await _blink(null);
    for (final f in ordered) {
      modeByType.putIfAbsent(f.type.key, () => f.personality);
    }
    phase = SessionPhase.modes;
    _notify();
  }

  void chooseMode(FixtureType type, int personality) {
    modeByType[type.key] = personality;
    _notify();
  }

  int footprintFor(FixtureType type) {
    final p = modeByType[type.key];
    final fp = p == null ? null : type.footprintOf(p);
    if (fp != null) return fp;
    // No personality list: use what the first fixture of the type reports.
    return ordered.firstWhere((f) => f.type.key == type.key).footprint;
  }

  PlanInput get planInput => PlanInput(
        order: [for (final f in ordered) PlanFixture(id: f.uid.toString(), typeKey: f.type.key, name: f.displayName)],
        footprintByType: {for (final t in typesInUse) t.$1.key: footprintFor(t.$1)},
        startAddress: startAddress,
        startUniverse: startUniverse,
        wrapBefore: wrapBefore,
      );

  /// The "next universe" choices that are still needed. A wrap the technician
  /// chose for a fixture that fits again (after changing the start address or
  /// the order) is dropped automatically.
  Set<String> get effectiveWraps {
    final out = <String>{};
    var input = planInput.copyWith(wrapBefore: const {});
    while (true) {
      final o = computePlan(input).overflow;
      if (o == null || !wrapBefore.contains(o.fixture.id)) break;
      out.add(o.fixture.id);
      input = input.copyWith(wrapBefore: {...input.wrapBefore, o.fixture.id});
    }
    return out;
  }

  PlanResult get plan => computePlan(planInput.copyWith(wrapBefore: effectiveWraps));

  void goToAddressing() {
    phase = SessionPhase.addressing;
    _notify();
  }

  void setStart({int? address, int? universe}) {
    if (address != null) startAddress = address;
    if (universe != null) startUniverse = universe;
    _notify();
  }

  void wrapAt(String fixtureId) {
    wrapBefore.add(fixtureId);
    _notify();
  }

  void unwrap(String fixtureId) {
    wrapBefore.remove(fixtureId);
    _notify();
  }

  void goToOverview() {
    phase = SessionPhase.overview;
    _notify();
  }

  Fixture? fixtureById(String id) => ordered.where((f) => f.uid.toString() == id).firstOrNull;

  // ---------------------------------------------------------------------------
  // Send and verify
  // ---------------------------------------------------------------------------

  /// Sends mode + address of every planned fixture (or [only] those) and
  /// reads them back. Failures stay marked for a per-fixture retry.
  Future<void> send({Set<Uid>? only}) async {
    final c = client;
    final p = plan;
    if (c == null || !p.complete) return;
    phase = SessionPhase.sending;
    for (final e in p.entries) {
      final f = fixtureById(e.fixture.id)!;
      if (only != null && !only.contains(f.uid)) continue;
      sendState[f.uid] = SendState(SendStatus.pending);
    }
    _notify();
    for (final e in p.entries) {
      final f = fixtureById(e.fixture.id)!;
      if (only != null && !only.contains(f.uid)) continue;
      sendState[f.uid] = SendState(SendStatus.sending);
      _notify();
      final wanted = modeByType[f.type.key] ?? f.personality;
      try {
        if (wanted != f.personality && f.type.personality(wanted) != null) {
          await c.setPersonality(f.uid, wanted);
        }
        await c.setStartAddress(f.uid, e.address);
        // Verify: ask the fixture what it has now.
        final info = await c.deviceInfo(f.uid);
        f.info = info;
        f.address = info.dmxStartAddress;
        f.personality = info.currentPersonality;
        f.footprint = info.dmxFootprint;
        final modeOk = f.type.personality(wanted) == null || info.currentPersonality == wanted;
        if (info.dmxStartAddress == e.address && modeOk) {
          sendState[f.uid] = SendState(SendStatus.verified);
        } else {
          sendState[f.uid] = SendState(SendStatus.failed, 'address ${info.dmxStartAddress} / mode ${info.currentPersonality}');
        }
      } on RdmException catch (err) {
        sendState[f.uid] = SendState(SendStatus.failed, err.message);
      }
      _notify();
    }
    phase = allVerified ? SessionPhase.done : SessionPhase.overview;
    _notify();
  }

  Future<void> retry(Fixture f) => send(only: {f.uid});

  bool get allVerified => plan.entries.isNotEmpty && plan.entries.every((e) => sendState[fixtureById(e.fixture.id)!.uid]?.status == SendStatus.verified);

  int get failedCount => sendState.values.where((s) => s.status == SendStatus.failed).length;

  @override
  void dispose() {
    _disposed = true;
    final f = current;
    if (f != null && f.identifying) {
      unawaited(client?.identify(f.uid, false).catchError((_) {}));
    }
    super.dispose();
  }
}
