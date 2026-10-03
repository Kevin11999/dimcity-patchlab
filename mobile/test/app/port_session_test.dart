import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/backend.dart';
import 'package:patchlab_rdm/app/port_session.dart';
import 'package:patchlab_rdm/app/settings.dart';
import 'package:patchlab_rdm/model/node.dart';

/// The Nodes route (Art-Net node with DMX ports) against the simulated node on the in-memory
/// network: scan → ports → Program → discovery → align → modes → addresses (1, 9, 25) → overflow →
/// send → verify → retry.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppBackend backend;

  setUp(() async {
    backend = AppBackend(Settings.memory(demoMode: true));
    await backend.start();
    await backend.scan(wait: const Duration(milliseconds: 800));
  });

  tearDown(() async {
    await backend.stop();
  });

  Node demo() => backend.nodes.singleWhere((n) => n.ip == '2.0.0.1');

  test('scan lists the demo node with its ports and protocols', () {
    final n = demo();
    expect(backend.isDemo, isTrue);
    expect(n.viaArtNet, isTrue);
    expect(n.inSubnet, isTrue);
    expect(n.ports.length, 8);
    expect(n.ports[0].protocol, PortProtocol.artnet);
    expect(n.ports[1].protocol, PortProtocol.sacn);
    expect(n.ports[1].displayUniverse, 2); // Port-Address 0.0.1 → sACN universe 2 (assumption documented)
    expect(n.ports[3].rdmEnabled, isFalse);
  });

  test('Program sends ArtAddress and the node confirms universe, protocol and RDM', () async {
    final n = demo();
    final edits = [
      PortEdit(port: n.ports[0], universe: 7, protocol: PortProtocol.sacn, rdmEnabled: true),
      PortEdit(port: n.ports[3], universe: 3, protocol: PortProtocol.artnet, rdmEnabled: true),
    ];
    expect(backend.validateEdits(n, edits), isNull);
    final r = await backend.program(n, edits);
    expect(r.replied, isTrue);
    expect(r.details, isEmpty);
    expect(r.ok, isTrue);
    final again = demo();
    expect(again.ports[0].protocol, PortProtocol.sacn);
    expect(again.ports[0].displayUniverse, 7);
    expect(again.ports[3].rdmEnabled, isTrue);
    // Ports of one page share Net / Sub-Net.
    final bad = [
      PortEdit(port: n.ports[0], universe: 1, protocol: PortProtocol.artnet, rdmEnabled: true),
      PortEdit(port: n.ports[1], universe: 17, protocol: PortProtocol.artnet, rdmEnabled: true),
    ];
    expect(backend.validateEdits(n, bad), isNotNull);
  });

  test('discovery, align, modes, the 1 / 9 / 25 example, send and verify', () async {
    final n = demo();
    final session = PortSession.forPort(backend, n, n.ports[0]);
    await session.discover();
    expect(session.error, isNull);
    expect(session.phase, SessionPhase.ready);
    expect(session.routeName, 'Art-Net');
    expect(session.fixtures.length, 3);
    expect(session.types.length, 2);
    final byName = {for (final f in session.fixtures) f.label: f};
    expect(byName.keys, containsAll(['Wash 1', 'Spot 1', 'Wash 2']));
    expect(byName['Spot 1']!.modeLabel, 'Extended (16 ch)');

    // Align. The queue starts in order of type, then UID; "place" skips until the wanted lamp blinks.
    await session.startAlign();
    expect(session.current!.identifying, isTrue);
    Future<void> place(String label) async {
      var guard = 0;
      while (session.current!.label != label && guard++ < 5) {
        await session.skipCurrent();
      }
      expect(session.current!.label, label);
      await session.alignCurrent();
    }

    await place('Wash 1');
    expect(session.placed.map((f) => f.label), ['Wash 1']);
    await place('Wash 2');
    await session.stepBack(); // undo Wash 2
    expect(session.placed.map((f) => f.label), ['Wash 1']);
    expect(session.current!.label, 'Wash 2');
    await session.alignCurrent(); // Wash 2 again
    await place('Spot 1');
    expect(session.alignDone, isTrue);
    expect(session.current, isNull);
    expect(session.fixtures.every((f) => !f.identifying), isTrue);
    // Manual reorder afterwards: Wash 1, Spot 1, Wash 2.
    expect(session.placed.map((f) => f.label), ['Wash 1', 'Wash 2', 'Spot 1']);
    session.reorderPlaced(2, 1);
    expect(session.placed.map((f) => f.label), ['Wash 1', 'Spot 1', 'Wash 2']);

    // Modes per type: ProWash 300 → Standard (8), MiniSpot 60 → Extended (16).
    await session.goToModes();
    expect(session.typesInUse.length, 2);
    final proWash = session.typesInUse.firstWhere((t) => t.$1.model == 'ProWash 300');
    final miniSpot = session.typesInUse.firstWhere((t) => t.$1.model == 'MiniSpot 60');
    expect(proWash.$2, 2);
    expect(miniSpot.$2, 1);
    session.chooseMode(proWash.$1, 1);
    session.chooseMode(miniSpot.$1, 2);
    expect(session.footprintFor(proWash.$1), 8);
    expect(session.footprintFor(miniSpot.$1), 16);

    // Start address 1: 1, 9, 25.
    session.goToAddressing();
    session.setStart(address: 1, universe: 1);
    var plan = session.plan;
    expect(plan.complete, isTrue);
    expect(plan.entries.map((e) => e.address), [1, 9, 25]);

    // Start address 497: Spot 1 would be 505-520 → the plan stops and asks.
    session.setStart(address: 497);
    plan = session.plan;
    expect(plan.complete, isFalse);
    expect(plan.overflow!.fixture.name, 'Spot 1');
    expect(plan.overflow!.wouldStart, 505);
    expect(plan.overflow!.wouldEnd, 520);
    session.wrapAt(plan.overflow!.fixture.id);
    plan = session.plan;
    expect(plan.complete, isTrue);
    expect(plan.entries.map((e) => '${e.universe}:${e.address}'), ['1:497', '2:1', '2:17']);
    // Back to start address 1: the wrap is no longer needed and drops out by itself.
    session.setStart(address: 1);
    expect(session.effectiveWraps, isEmpty);
    expect(session.plan.entries.map((e) => e.address), [1, 9, 25]);
    session.unwrap(plan.entries[1].fixture.id);

    // Send and verify.
    session.goToOverview();
    await session.send();
    expect(session.phase, SessionPhase.done);
    expect(session.allVerified, isTrue);
    expect(session.failedCount, 0);
    final sim = backend.demoNode!.ports[0].fixtures;
    expect(sim.map((f) => f.address).toList()..sort(), [1, 9, 25]);
    expect(sim.firstWhere((f) => f.label == 'Spot 1').personality, 2);
    session.dispose();
  });

  test('a fixture that does not answer shows as failed and can be retried alone', () async {
    final n = demo();
    final session = PortSession.forPort(backend, n, n.ports[1]);
    await session.discover();
    expect(session.fixtures.length, 5);
    session.useDiscoveryOrder();
    await session.goToModes();
    session.goToAddressing();
    session.setStart(address: 1, universe: 2);
    expect(session.plan.complete, isTrue);
    session.goToOverview();
    await session.send();
    expect(session.allVerified, isTrue, reason: 'first run: the dropped SET is retried by the client');
    // Now force a failure: drop all traffic and retry only the victim.
    final victim = session.ordered[2];
    backend.demoNode!.dropRate = 1.0;
    await session.retry(victim);
    expect(session.sendState[victim.uid]!.status, SendStatus.failed);
    expect(session.failedCount, 1);
    expect(session.phase, SessionPhase.overview);
    backend.demoNode!.dropRate = 0.0;
    await session.retry(victim);
    expect(session.sendState[victim.uid]!.status, SendStatus.verified);
    expect(session.allVerified, isTrue);
    session.dispose();
  }, timeout: const Timeout(Duration(minutes: 2)));
}
