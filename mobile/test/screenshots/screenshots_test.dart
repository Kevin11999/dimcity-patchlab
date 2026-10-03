import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/backend.dart';
import 'package:patchlab_rdm/app/settings.dart';
import 'package:patchlab_rdm/main.dart';

/// Renders the screens to PNG files for a visual check. Off by default:
///   SCREENSHOTS=/some/dir flutter test test/screenshots
void main() {
  final outDir = Platform.environment['SCREENSHOTS'];

  Future<void> loadFonts() async {
    final dir = '${Platform.environment['FLUTTER_ROOT'] ?? '/opt/flutter'}/bin/cache/artifacts/material_fonts';
    Future<void> load(String family, List<String> files) async {
      final loader = FontLoader(family);
      for (final f in files) {
        final bytes = File('$dir/$f').readAsBytesSync();
        loader.addFont(Future.value(ByteData.view(bytes.buffer)));
      }
      await loader.load();
    }

    await load('Roboto', ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf']);
    await load('MaterialIcons', ['MaterialIcons-Regular.otf']);
  }

  testWidgets('screenshots of every step', (tester) async {
    await loadFonts();
    tester.view.devicePixelRatio = 2.0;
    tester.view.physicalSize = const Size(800, 1700);
    addTearDown(tester.view.reset);
    final key = GlobalKey();

    Future<void> shot(String name) async {
      await tester.runAsync(() async {
        final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        final image = await boundary.toImage(pixelRatio: 1.5);
        final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!;
        File('$outDir/$name.png').writeAsBytesSync(bytes.buffer.asUint8List());
      });
    }

    Future<void> wait(Duration real) async {
      await tester.runAsync(() async {
        final steps = (real.inMilliseconds / 100).ceil();
        for (var i = 0; i < steps; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
          await tester.pump(const Duration(milliseconds: 300));
        }
      });
    }

    final settings = Settings.memory();
    final backend = AppBackend(settings);
    await tester.pumpWidget(RepaintBoundary(key: key, child: PatchLabApp(settings: settings, backend: backend)));
    await tester.pump();

    await wait(const Duration(milliseconds: 1200));
    await shot('01_searching');
    await wait(const Duration(seconds: 8));
    await shot('02_none');

    await tester.tap(find.text('Demo met 8 lampen proberen'));
    await wait(const Duration(milliseconds: 1500));
    await shot('03_searching_demo');
    await wait(const Duration(seconds: 8));
    await shot('04_lamps');

    await tester.tap(find.text('Adresseren starten'));
    await wait(const Duration(seconds: 1));
    await shot('05_align');
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.text('Align').last);
      await wait(const Duration(milliseconds: 500));
    }
    await shot('06_align_3');
    for (var i = 0; i < 5; i++) {
      await tester.tap(find.text('Align').last);
      await wait(const Duration(milliseconds: 500));
    }
    await shot('07_align_done');
    await tester.tap(find.text('Naar modes'));
    await wait(const Duration(seconds: 1));
    await shot('08_modes');
    await tester.tap(find.text('Startadres'));
    await wait(const Duration(seconds: 1));
    await shot('09_addresses');
    await tester.tap(find.text('Naar overzicht'));
    await wait(const Duration(seconds: 1));
    await shot('10_overview');
    await tester.tap(find.widgetWithText(FilledButton, 'Versturen'));
    await wait(const Duration(seconds: 10));
    await shot('11_sent_one_failed');

    await tester.tap(find.widgetWithText(FilledButton, 'Mislukte opnieuw proberen'));
    await wait(const Duration(seconds: 3));
    await shot('12_all_verified');
    await tester.tap(find.text('Klaar'));
    await wait(const Duration(seconds: 1));
    await shot('13_lamps_after');
    await tester.tap(find.text('PixelStrip 1m').first);
    await wait(const Duration(seconds: 2));
    await shot('14_fixture');
    await tester.tap(find.byType(BackButton));
    await wait(const Duration(milliseconds: 500));
    await tester.tap(find.text('Nodes').last);
    await wait(const Duration(seconds: 5));
    await shot('15_nodes');
  }, skip: outDir == null, timeout: const Timeout(Duration(minutes: 4)));
}
