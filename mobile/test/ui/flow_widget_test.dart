import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/backend.dart';
import 'package:patchlab_rdm/app/settings.dart';
import 'package:patchlab_rdm/main.dart';

/// Drives the real screens on a phone-sized window against the simulated lamp row: the lamps appear
/// by themselves, then align → modes → addresses → send → verify → retry, ending with every lamp addressed.
/// The app's timers run in the test's fake clock, real UDP-free memory network needs real time, so
/// each step interleaves 100 ms real with 300 ms fake.
void main() {
  Future<void> wait(WidgetTester tester, Duration real) async {
    final steps = (real.inMilliseconds / 100).ceil();
    for (var i = 0; i < steps; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 300));
    }
  }

  testWidgets('the whole flow through the UI with the demo lamps', (tester) async {
    tester.view.devicePixelRatio = 2.0;
    // A tall phone window so that all eight rows of the lists are built at once (lists build lazily).
    tester.view.physicalSize = const Size(800, 3600);
    addTearDown(tester.view.reset);

    await tester.runAsync(() async {
      final settings = Settings.memory(demoMode: true);
      final backend = AppBackend(settings);
      await tester.pumpWidget(PatchLabApp(settings: settings, backend: backend));
      await tester.pump();

      // The lamps show up without touching anything.
      await wait(tester, const Duration(seconds: 9));
      expect(find.text('8 lampen gevonden'), findsOneWidget);
      expect(find.textContaining('ProWash 300'), findsWidgets);
      expect(find.text('DEMO'), findsOneWidget);
      expect(find.text('Adresseren starten'), findsOneWidget);

      // Align all eight.
      await tester.tap(find.text('Adresseren starten'));
      await wait(tester, const Duration(milliseconds: 800));
      expect(find.text('KNIPPERT NU'), findsOneWidget);
      expect(find.text('Lamp 1 van 8'), findsOneWidget);
      for (var i = 0; i < 8; i++) {
        await tester.tap(find.text('Align').last);
        await wait(tester, const Duration(milliseconds: 500));
      }
      expect(find.text('Naar modes'), findsOneWidget);
      await tester.tap(find.text('Naar modes'));
      await wait(tester, const Duration(milliseconds: 800));

      // One mode per type.
      expect(find.text('Mode per type'), findsOneWidget);
      expect(find.text('3 fixtures'), findsOneWidget);
      expect(find.text('4 fixtures'), findsOneWidget);
      await tester.tap(find.textContaining('Basic').first); // MiniSpot: Basic (10 ch)
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text('Startadres'));
      await wait(tester, const Duration(milliseconds: 800));

      // Addresses: 4 washes × 8, 3 spots × 10, 1 strip × 18 = 80 channels, in the order they were aligned.
      expect(find.text('Adressen'), findsWidgets);
      expect(find.text('Universe 1'), findsOneWidget);
      expect(find.text('80 van 512 kanalen gebruikt'), findsOneWidget);
      await tester.tap(find.text('Naar overzicht'));
      await wait(tester, const Duration(milliseconds: 800));

      // Send. The strip drops its address changes: it fails, the other seven are verified.
      expect(find.text('Overzicht'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Versturen')); // the step bar has a 'Versturen' label too
      await wait(tester, const Duration(seconds: 10));
      expect(find.text('Gecontroleerd'), findsNWidgets(7));
      expect(find.text('Niet overgenomen'), findsNothing, reason: 'the failure text carries the reason after a dot');
      expect(find.textContaining('Niet overgenomen'), findsOneWidget);
      expect(find.textContaining('1 fixture(s) niet gelukt'), findsOneWidget);

      // Retry the failed lamp only: the button at the bottom retries every failed one.
      expect(find.widgetWithText(FilledButton, 'Opnieuw proberen'), findsOneWidget, reason: 'the retry button of that lamp');
      await tester.tap(find.widgetWithText(FilledButton, 'Mislukte opnieuw proberen'));
      await wait(tester, const Duration(seconds: 3));
      expect(find.text('Gecontroleerd'), findsNWidgets(8));
      expect(find.text('Alle fixtures zijn geadresseerd en gecontroleerd.'), findsOneWidget);
      expect(backend.demoLamps!.lamps.map((l) => l.fixture.address).toSet().length, 8);

      // Done: back at the list, with the new addresses.
      await tester.tap(find.text('Klaar'));
      await wait(tester, const Duration(seconds: 1));
      expect(find.text('8 lampen gevonden'), findsOneWidget);
    });
  }, timeout: const Timeout(Duration(minutes: 3)));

  testWidgets('no lamps: the checklist and the demo button, and the demo then fills the list', (tester) async {
    tester.view.devicePixelRatio = 2.0;
    tester.view.physicalSize = const Size(800, 1800);
    addTearDown(tester.view.reset);

    await tester.runAsync(() async {
      // Real mode on a machine without lamps: nothing answers the probe.
      final settings = Settings.memory();
      final backend = AppBackend(settings);
      await tester.pumpWidget(PatchLabApp(settings: settings, backend: backend));
      await tester.pump();
      await wait(tester, const Duration(seconds: 9));
      expect(find.text('Geen lampen gevonden'), findsOneWidget);
      expect(find.textContaining('netwerkkabel van de lampen'), findsOneWidget);
      expect(find.text('Opnieuw zoeken'), findsOneWidget);
      expect(find.text('Demo met 8 lampen proberen'), findsOneWidget);
      expect(tester.getRect(find.text('Demo met 8 lampen proberen')).bottom, lessThan(832), reason: 'the buttons are above the navigation bar, no scrolling needed');

      await tester.tap(find.text('Demo met 8 lampen proberen'));
      await wait(tester, const Duration(seconds: 9));
      expect(find.text('8 lampen gevonden'), findsOneWidget);
      expect(find.text('DEMO'), findsOneWidget);
    });
  }, timeout: const Timeout(Duration(minutes: 3)));
}
