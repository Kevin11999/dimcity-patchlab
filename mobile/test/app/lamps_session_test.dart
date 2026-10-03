import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/backend.dart';
import 'package:patchlab_rdm/app/port_session.dart';
import 'package:patchlab_rdm/app/settings.dart';

/// The easy way: a row of RDMnet lamps on the cable. Discovery through LLRP, then the whole
/// wizard (align, modes, addresses, send, verify, retry), all against the simulated lamp row.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppBackend backend;

  setUp(() async {
    backend = AppBackend(Settings.memory(demoMode: true));
    await backend.start();
  });

  tearDown(() async {
    await backend.stop();
  });

  test('the lamps are found without a node, a broker or an IP setting', () async {
    final session = PortSession.lamps(backend);
    await session.discover();
    expect(session.error, isNull);
    expect(session.phase, SessionPhase.ready);
    expect(session.routeName, 'RDMnet');
    expect(session.fixtures.length, 8);
    expect(session.fixtures.every((f) => f.hasDmx), isTrue);
    expect(session.types.length, 3);
    expect(session.types.values.map((t) => t.model).toSet(), {'ProWash 300', 'MiniSpot 60', 'PixelStrip 1m'});
    // Sorted by type then UID, every lamp on the factory address 1 apart from the spots / strip addresses of the demo.
    expect(session.fixtures.first.type.model, 'MiniSpot 60');
    expect(session.fixtures.where((f) => f.type.model == 'ProWash 300').every((f) => f.address == 1), isTrue);
    expect(session.expectedCount, 8);
    session.dispose();
  });

  test('no lamps on the cable: ready with an empty list, not an error', () async {
    backend.demoLamps!.stop();
    final session = PortSession.lamps(backend);
    await session.discover();
    expect(session.phase, SessionPhase.ready);
    expect(session.fixtures, isEmpty);
    expect(session.error, isNull);
    expect(backend.llrp!.probesSent, greaterThanOrEqualTo(1));
    session.dispose();
  });

  test('align, modes per type, addresses, send, verify and a per-lamp retry', () async {
    final session = PortSession.lamps(backend);
    await session.discover();
    await session.startAlign();
    expect(session.queue.length, 8);
    final blinking = <String>[];
    while (!session.alignDone) {
      expect(session.current!.identifying, isTrue);
      blinking.add(session.current!.uid.toString());
      await session.alignCurrent();
    }
    expect(blinking.length, 8);
    expect(session.placed.length, 8);
    expect(session.fixtures.every((f) => !f.identifying), isTrue);
    expect(backend.demoLamps!.lamps.every((l) => !l.fixture.identify), isTrue, reason: 'every lamp stopped blinking');

    await session.goToModes();
    expect(session.typesInUse.map((t) => t.$2).fold<int>(0, (a, b) => a + b), 8);
    // Standard 8 ch for the washes, Basic 10 ch for the spots, RGB 3 ch for the strip.
    for (final (type, _) in session.typesInUse) {
      session.chooseMode(type, 1);
    }
    session.goToAddressing();
    session.setStart(address: 1, universe: 1);
    final plan = session.plan;
    expect(plan.complete, isTrue);
    // 4 washes × 8 + 3 spots × 10 + 1 strip × 3 = 65 channels.
    expect(plan.entries.last.lastChannel, 65);
    expect(plan.entries.map((e) => e.address).toSet().length, 8, reason: 'every lamp gets its own address');

    session.goToOverview();
    await session.send();
    // The PixelStrip drops its first three address changes: the client gives up, the lamp shows as failed.
    expect(session.failedCount, 1);
    expect(session.allVerified, isFalse);
    expect(session.phase, SessionPhase.overview);
    final victim = session.ordered.firstWhere((f) => session.sendState[f.uid]!.status == SendStatus.failed);
    expect(victim.type.model, 'PixelStrip 1m');
    expect(session.sendState[victim.uid]!.message, 'Lamp antwoordt niet', reason: 'a short message, not protocol detail');
    // The retry button of that lamp alone: the rest of the list is not touched.
    final addressesBefore = {for (final l in backend.demoLamps!.lamps) l.fixture.uid: l.fixture.address};
    await session.retryFailed();
    expect(session.sendState[victim.uid]!.status, SendStatus.verified);
    expect(session.allVerified, isTrue);
    for (final l in backend.demoLamps!.lamps.where((l) => l.fixture.uid != victim.uid)) {
      expect(l.fixture.address, addressesBefore[l.fixture.uid]);
    }
    // And the lamps really have the planned addresses now.
    for (final e in plan.entries) {
      final lamp = backend.demoLamps!.lamps.firstWhere((l) => l.fixture.uid.toString() == e.fixture.id);
      expect(lamp.fixture.address, e.address);
      expect(lamp.fixture.personality, 1);
    }
    session.dispose();
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('switching demo mode off and on again restarts the services', () async {
    expect(backend.isDemo, isTrue);
    await backend.setDemo(false);
    expect(backend.isDemo, isFalse);
    expect(backend.demoLamps, isNull);
    await backend.setDemo(true);
    expect(backend.isDemo, isTrue);
    expect(backend.demoLamps, isNotNull);
    final session = PortSession.lamps(backend);
    await session.discover();
    expect(session.fixtures.length, 8);
    session.dispose();
  });
}
