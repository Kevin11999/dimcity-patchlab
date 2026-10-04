import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/addressing/address_plan.dart';
import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_params.dart';
import '../l10n/strings.dart';
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

/// Everything that happens on one line of fixtures: discovery, align, modes,
/// addressing, sending and verifying. One instance per opened DMX port of a node,
/// or one for the lamps on the cable ([PortSession.lamps]).
class PortSession extends ChangeNotifier {
  PortSession(this.backend, {required this.routeBuilder, this.initialUniverse = 1});

  /// The fixtures behind one DMX port of a node.
  factory PortSession.forPort(AppBackend backend, Node node, NodePort port) =>
      PortSession(backend, routeBuilder: () => backend.routeFor(node, port), initialUniverse: port.displayUniverse);

  /// The RDMnet lamps directly on the cable (LLRP): no node, no broker, no IP setup.
  factory PortSession.lamps(AppBackend backend) => PortSession(backend, routeBuilder: backend.lampsRoute);

  final AppBackend backend;
  final PortRoute? Function() routeBuilder;
  final int initialUniverse;

  SessionPhase phase = SessionPhase.idle;
  String? error;
  String? routeNote;
  RdmClient? client;
  String routeName = '';

  final List<Fixture> fixtures = <Fixture>[];
  final Map<String, FixtureType> types = <String, FixtureType>{};
  int detailIndex = 0;

  /// How many fixtures discovery found in total (for the progress bar while details are read).
  int expectedCount = 0;

  // Align
  final List<Fixture> placed = <Fixture>[];
  final List<Fixture> queue = <Fixture>[];
  Fixture? current;
  bool alignDone = false;

  // Modes and addressing
  final Map<String, int> modeByType = <String, int>{};
  int startAddress = 1;
  late int startUniverse = initialUniverse;
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

  void _resetForSearch() {
    fixtures.clear();
    placed.clear();
    queue.clear();
    current = null;
    alignDone = false;
    sendState.clear();
  }

  /// Looks for the fixtures. With [quiet] a search that finds nothing leaves the screen as it was (used
  /// for the automatic searching while no lamps are connected yet); as soon as it finds something it
  /// carries on like a normal search.
  Future<void> discover({bool quiet = false}) async {
    final route = routeBuilder();
    if (route == null) {
      if (quiet) return;
      error = 'No network connection to the lamps';
      phase = SessionPhase.idle;
      _notify();
      return;
    }
    if (!quiet) {
      phase = SessionPhase.discovering;
      error = null;
      routeNote = null;
      _resetForSearch();
      _notify();
    }

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
      if (!quiet) phase = SessionPhase.idle;
      _notify();
      return;
    }
    if (quiet) {
      if (uids.isEmpty) return;
      // Found something: from here on it is a normal search.
      phase = SessionPhase.discovering;
      error = null;
      routeNote = null;
      _resetForSearch();
      _notify();
    }
    routeName = transport.routeName;
    expectedCount = uids.length;
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
        // A UID that answers neither DEVICE_INFO nor DMX_START_ADDRESS is not listed: no empty fixture is made up.
        error = e.message;
      }
    }
    fixtures.sort((a, b) {
      final t = a.type.label.compareTo(b.type.label);
      return t != 0 ? t : a.uid.compareTo(b.uid);
    });
    phase = SessionPhase.ready;
    _notify();
  }

  /// Position of a type in the order of discovery: the UI gives every type its own colour.
  int typeIndex(FixtureType type) {
    final i = types.keys.toList().indexOf(type.key);
    return i < 0 ? 0 : i;
  }

  FixtureType _typeFor(int manufacturerId, int modelId, String manufacturer, String model) {
    final key = FixtureType.keyFor(manufacturerId, modelId);
    return types.putIfAbsent(
      key,
      () => FixtureType(key: key, manufacturerId: manufacturerId, modelId: modelId, manufacturer: manufacturer, model: model, personalities: []),
    );
  }

  Future<Fixture> _loadFixture(RdmClient c, Uid uid) async {
    final DeviceInfo info;
    try {
      info = await c.deviceInfo(uid);
    } on RdmException {
      return _fixtureFromAddress(c, uid);
    } on FormatException {
      return _fixtureFromAddress(c, uid);
    }
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

  /// A lamp whose DEVICE_INFO is refused or too short: the start address alone is enough to list it (footprint
  /// unknown counts as 1 channel). Throws when even that is not answered.
  Future<Fixture> _fixtureFromAddress(RdmClient c, Uid uid) async {
    final address = await c.startAddress(uid);
    final info = DeviceInfo(
      protocolVersion: 0,
      deviceModelId: 0,
      productCategory: 0,
      softwareVersionId: 0,
      dmxFootprint: 1,
      currentPersonality: 0,
      personalityCount: 0,
      dmxStartAddress: address,
      subDeviceCount: 0,
      sensorCount: 0,
    );
    final type = _typeFor(uid.manufacturerId, 0, await c.manufacturerLabel(uid), await c.deviceModelDescription(uid));
    return Fixture(uid: uid, type: type, info: info, label: await c.deviceLabel(uid));
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
      ..addAll(fixtures.where((f) => f.hasDmx));
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
      ..addAll(fixtures.where((f) => f.hasDmx));
    queue.clear();
    alignDone = true;
  }

  // ---------------------------------------------------------------------------
  // Modes and addresses
  // ---------------------------------------------------------------------------

  /// The fixtures to address, in the aligned order.
  List<Fixture> get ordered => placed.isEmpty ? fixtures.where((f) => f.hasDmx).toList() : placed;

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
        sendState[f.uid] = SendState(SendStatus.failed, _friendly(err));
      }
      _notify();
    }
    phase = allVerified ? SessionPhase.done : SessionPhase.overview;
    _notify();
  }

  Future<void> retry(Fixture f) => send(only: {f.uid});

  /// The retry for every lamp that failed, the others stay as they are.
  Future<void> retryFailed() => send(only: {for (final e in sendState.entries) if (e.value.status == SendStatus.failed) e.key});

  /// A short message for the person at the lamps instead of the protocol detail.
  static String _friendly(RdmException e) {
    if (e is RdmTimeoutException) return t('err.timeout');
    if (e is RdmNackException) return t('err.nack', {'reason': NackReason.describe(e.reason)});
    return e.message;
  }

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
