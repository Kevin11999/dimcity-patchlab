import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/backend.dart';
import 'package:patchlab_rdm/app/settings.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/main.dart';
import 'package:patchlab_rdm/services/sim/fake_art_lamp.dart';
import 'package:patchlab_rdm/services/sim/fake_lamps.dart';
import 'package:patchlab_rdm/services/sim/sim_fixture.dart';

/// The "lamp by IP + UID" dialog on the Lamps tab, against the simulated network.
void main() {
  Future<void> wait(WidgetTester tester, Duration real) async {
    for (var i = 0; i < (real.inMilliseconds / 100).ceil(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 300));
    }
  }

  Future<void> enter(WidgetTester tester, String ip, String uid) async {
    await tester.tap(find.text('Lamp op IP + UID'));
    await wait(tester, const Duration(milliseconds: 500));
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), ip);
    await tester.enterText(fields.at(1), uid);
    await tester.tap(find.text('Zoeken').last);
  }

  testWidgets('a lamp added with its IP and UID shows up in the list; a wrong UID says it was not found', (tester) async {
    tester.view.devicePixelRatio = 2.0;
    tester.view.physicalSize = const Size(800, 3600);
    addTearDown(tester.view.reset);

    await tester.runAsync(() async {
      final settings = Settings.memory(demoMode: true);
      final backend = AppBackend(settings);
      await tester.pumpWidget(PatchLabApp(settings: settings, backend: backend));
      await tester.pump();
      await wait(tester, const Duration(seconds: 9));
      expect(find.text('8 lampen gevonden'), findsOneWidget);

      // A lamp on the demo network that speaks Art-Net, not found by the search (demo), but there by IP + UID.
      final base = buildDemoLamps().first.fixture;
      final sim = SimFixture(uid: const Uid(0x7FF1, 0x9999), manufacturer: base.manufacturer, model: 'PixelBar', modelId: 0x0777, personalities: base.personalities);
      final lamp = FakeArtLamp(backend.hub!, sim, ip: '2.0.0.77', universe: 3)..start();
      addTearDown(lamp.stop);

      // Invalid input is refused before anything is sent.
      await enter(tester, '2.0.0', 'nope');
      await wait(tester, const Duration(milliseconds: 500));
      expect(find.textContaining('geldig IP-adres'), findsOneWidget);

      // Wrong UID: not found, with what was tried.
      await enter(tester, '2.0.0.77', '7FF1:0000DEAD');
      await wait(tester, const Duration(seconds: 16));
      expect(find.text('Lamp niet gevonden'), findsOneWidget);
      expect(find.textContaining('geprobeerd op'), findsOneWidget);
      await tester.tap(find.text('OK'));
      await wait(tester, const Duration(milliseconds: 500));

      // Right UID: found, and in the list after the search that follows.
      await enter(tester, '2.0.0.77', sim.uid.toString());
      await wait(tester, const Duration(seconds: 14));
      expect(find.text('9 lampen gevonden'), findsOneWidget);
      expect(settings.directIp, '2.0.0.77');
      expect(backend.lampsTransport!.lampFor(sim.uid)!.onArtNet, isTrue);

      await backend.stop();
    });
  });
}
