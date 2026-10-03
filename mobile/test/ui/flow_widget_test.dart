import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/backend.dart';
import 'package:patchlab_rdm/app/settings.dart';
import 'package:patchlab_rdm/main.dart';

/// Drives the real screens against the simulated node (real loopback UDP,
/// real time inside runAsync): nodes → ports → discovery → direct order →
/// modes → addresses 1 / 9 / 25 → overview → send → verified.
void main() {
  testWidgets('the whole flow through the UI with the demo node', (tester) async {
    await tester.runAsync(() async {
      final settings = Settings.memory(demoMode: true);
      final backend = AppBackend(settings, artnetPort: 0, enableRdmnet: false, useBroadcast: false);
      await tester.pumpWidget(PatchLabApp(settings: settings, backend: backend));
      await tester.pump();

      // The app's timers run in the test's fake clock; real UDP needs real time.
      // Interleave both: 100 ms real, 300 ms fake per step.
      Future<void> wait(Duration real) async {
        final steps = (real.inMilliseconds / 100).ceil();
        for (var i = 0; i < steps; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
          await tester.pump(const Duration(milliseconds: 300));
        }
      }

      // Nodes screen: the scan (2.5 s) finds the demo node.
      await wait(const Duration(seconds: 4));
      expect(find.text('LumiNode 8 demo'), findsOneWidget);
      expect(find.textContaining('Dit apparaat'), findsOneWidget);

      await tester.tap(find.text('LumiNode 8 demo'));
      await wait(const Duration(milliseconds: 400));
      expect(find.text('Poort 1'), findsOneWidget);
      expect(find.text('Program'), findsOneWidget);

      // Port 1 → discovery.
      await tester.tap(find.text('Poort 1'));
      await wait(const Duration(seconds: 5));
      expect(find.text('3 fixtures gevonden'), findsOneWidget);
      expect(find.text('Wash 1'), findsOneWidget);
      expect(find.text('Spot 1'), findsOneWidget);
      expect(find.text('Wash 2'), findsOneWidget);
      expect(find.text('via Art-Net'), findsOneWidget);

      // Address in discovery order → modes.
      await tester.tap(find.text('Adresseren in deze volgorde'));
      await wait(const Duration(milliseconds: 600));
      expect(find.text('Mode per type'), findsOneWidget);
      expect(find.text('DemoLux ProWash 300'), findsOneWidget);
      expect(find.text('DemoLux MiniSpot 60'), findsOneWidget);

      await tester.tap(find.text('Startadres'));
      await wait(const Duration(milliseconds: 600));
      expect(find.text('Adressen'), findsOneWidget);
      expect(find.text('1–8'), findsOneWidget);
      expect(find.text('9–24'), findsOneWidget);
      expect(find.text('25–32'), findsOneWidget);

      // Start at 497: Spot 1 (16 ch) no longer fits → the app stops and asks.
      await tester.enterText(find.widgetWithText(TextField, 'Startadres'), '497');
      await wait(const Duration(milliseconds: 600));
      expect(find.text('Spot 1 past niet meer'), findsOneWidget);
      await tester.tap(find.text('Volgend universe, adres 1').last); // the dialog's button (the card below has one too)
      await wait(const Duration(milliseconds: 600));
      expect(find.text('497–504'), findsOneWidget);
      expect(find.text('1–16'), findsOneWidget);
      expect(find.text('17–24'), findsOneWidget);

      // Back to 1 and on to the overview.
      await tester.enterText(find.widgetWithText(TextField, 'Startadres'), '1');
      await wait(const Duration(milliseconds: 400));
      await tester.tap(find.text('Naar overzicht'));
      await wait(const Duration(milliseconds: 600));
      expect(find.text('Overzicht'), findsOneWidget);
      await tester.tap(find.text('Versturen'));
      await wait(const Duration(seconds: 4));
      expect(find.text('Gecontroleerd'), findsNWidgets(3));
      expect(find.text('Alle fixtures zijn geadresseerd en gecontroleerd.'), findsOneWidget);
      final sim = backend.demoNode!.ports[0].fixtures;
      expect(sim.map((f) => f.address).toList()..sort(), [1, 9, 25]);
      // The app widget disposes the backend when the tree is torn down.
    });
  }, timeout: const Timeout(Duration(minutes: 3)));
}
