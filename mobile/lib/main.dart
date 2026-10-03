import 'package:flutter/material.dart';

import 'app/backend.dart';
import 'app/settings.dart';
import 'l10n/strings.dart';
import 'ui/nodes_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = await Settings.load();
  runApp(PatchLabApp(settings: settings, backend: AppBackend(settings)));
}

class PatchLabApp extends StatefulWidget {
  const PatchLabApp({super.key, required this.settings, required this.backend});
  final Settings settings;
  final AppBackend backend;

  @override
  State<PatchLabApp> createState() => _PatchLabAppState();
}

class _PatchLabAppState extends State<PatchLabApp> {
  @override
  void dispose() {
    widget.backend.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<String>(
        valueListenable: L10n.language,
        builder: (context, lang, _) => MaterialApp(
          title: t('app.title'),
          theme: buildTheme(Brightness.light),
          darkTheme: buildTheme(Brightness.dark),
          themeMode: ThemeMode.dark,
          debugShowCheckedModeBanner: false,
          home: NodesScreen(backend: widget.backend, settings: widget.settings),
        ),
      );
}
