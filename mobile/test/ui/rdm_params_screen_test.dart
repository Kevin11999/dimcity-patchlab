import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/backend.dart';
import 'package:patchlab_rdm/app/port_session.dart';
import 'package:patchlab_rdm/app/settings.dart';
import 'package:patchlab_rdm/ui/fixture_screen.dart';
import 'package:patchlab_rdm/ui/rdm_params_screen.dart';
import 'package:patchlab_rdm/services/sim/sim_fixture.dart';

/// The screens a lamp has for its own RDM settings, against a simulated lamp that has some.
void main() {
  Future<void> wait(WidgetTester tester, Duration real) async {
    for (var i = 0; i < (real.inMilliseconds / 100).ceil(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 300));
    }
  }

  testWidgets('own RDM settings: described by the lamp, shown with their value, writable ones can be set', (tester) async {
    tester.view.devicePixelRatio = 2.0;
    tester.view.physicalSize = const Size(800, 2400);
    addTearDown(tester.view.reset);

    await tester.runAsync(() async {
      final backend = AppBackend(Settings.memory(demoMode: true));
      await backend.start();
      final lamp = backend.demoLamps!.lamps.first.fixture;
      lamp.params[0x8001] = SimParam(description: 'Pixel mode', dataType: 0x03, value: 2, min: 1, max: 4);
      lamp.params[0x8002] = SimParam(description: 'Fan state', dataType: 0x03, commandClass: 1, value: 1);
      final session = PortSession.lamps(backend);
      await session.discover();
      final fixture = session.fixtures.firstWhere((f) => f.uid == lamp.uid);

      // The lamp screen has the way in, and no network card (a lamp found with LLRP is not an Art-Net node).
      await tester.pumpWidget(MaterialApp(home: FixtureScreen(session: session, fixture: fixture)));
      await wait(tester, const Duration(seconds: 2));
      expect(find.text('Eigen RDM-instellingen'), findsOneWidget);
      expect(find.text('Netwerk (Art-Net)'), findsNothing);

      await tester.pumpWidget(MaterialApp(home: RdmParamsScreen(session: session, fixture: fixture)));
      await wait(tester, const Duration(seconds: 2));
      expect(find.text('Pixel mode'), findsOneWidget);
      expect(find.text('Fan state'), findsOneWidget);
      expect(find.textContaining('0x8001'), findsOneWidget);
      expect(find.textContaining('lezen en schrijven'), findsOneWidget);
      expect(find.textContaining('alleen lezen'), findsOneWidget);
      expect(find.text('2'), findsOneWidget, reason: 'the current value of Pixel mode');

      // Set it: a dialog, a value inside the range, read back from the lamp.
      await tester.tap(find.text('Pixel mode'));
      await wait(tester, const Duration(milliseconds: 500));
      await tester.enterText(find.byType(TextField), '3');
      await tester.tap(find.text('OK'));
      await wait(tester, const Duration(seconds: 1));
      expect(lamp.params[0x8001]!.value, 3);
      expect(find.text('3'), findsOneWidget);

      // A value outside the lamp's own range is refused by the lamp and the value stays.
      await tester.tap(find.text('Pixel mode'));
      await wait(tester, const Duration(milliseconds: 500));
      await tester.enterText(find.byType(TextField), '9');
      await tester.tap(find.text('OK'));
      await wait(tester, const Duration(seconds: 1));
      expect(lamp.params[0x8001]!.value, 3);

      // A read-only setting has no dialog.
      await tester.tap(find.text('Fan state'));
      await wait(tester, const Duration(milliseconds: 500));
      expect(find.byType(TextField), findsNothing);

      session.dispose();
      await backend.stop();
    });
  });

  testWidgets('a lamp without settings of its own says so', (tester) async {
    tester.view.devicePixelRatio = 2.0;
    tester.view.physicalSize = const Size(800, 2400);
    addTearDown(tester.view.reset);
    await tester.runAsync(() async {
      final backend = AppBackend(Settings.memory(demoMode: true));
      await backend.start();
      final session = PortSession.lamps(backend);
      await session.discover();
      await tester.pumpWidget(MaterialApp(home: RdmParamsScreen(session: session, fixture: session.fixtures.first)));
      await wait(tester, const Duration(seconds: 2));
      expect(find.textContaining('meldt geen eigen instellingen'), findsOneWidget);
      expect(find.text('DEVICE_HOURS'), findsOneWidget, reason: 'the standard parameters it does support');
      session.dispose();
      await backend.stop();
    });
  });
}
