import 'package:flutter/material.dart';

import '../app/backend.dart';
import '../app/settings.dart';
import '../app/version.dart';
import '../l10n/strings.dart';
import 'widgets.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.settings, required this.backend});
  final Settings settings;
  final AppBackend backend;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _scope = TextEditingController(text: widget.settings.rdmnetScope);
  late final TextEditingController _broker = TextEditingController(text: widget.settings.manualBroker);
  late final TextEditingController _broadcast = TextEditingController(text: widget.settings.extraBroadcast);

  @override
  void dispose() {
    _scope.dispose();
    _broker.dispose();
    _broadcast.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.settings;
    return ListenableBuilder(
      listenable: s,
      builder: (context, _) => Scaffold(
        appBar: AppBar(title: Text(t('set.title'))),
        body: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Text(t('set.language'), style: Theme.of(context).textTheme.titleSmall),
            RadioGroup<String>(
              groupValue: s.language,
              onChanged: (v) => s.language = v ?? 'nl',
              child: Column(
                children: [
                  RadioListTile<String>(value: 'nl', title: Text(t('set.language.nl'))),
                  RadioListTile<String>(value: 'en', title: Text(t('set.language.en'))),
                ],
              ),
            ),
            const Divider(),
            SwitchListTile(
              value: s.demoMode,
              title: Text(t('set.demo')),
              subtitle: Text(t('set.demo.hint')),
              onChanged: (v) async {
                s.demoMode = v;
                if (v) {
                  await widget.backend.startDemo();
                } else {
                  await widget.backend.stopDemo();
                }
              },
            ),
            const Divider(),
            Text(t('set.rdmnet'), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            TextField(
              controller: _scope,
              decoration: InputDecoration(labelText: t('set.scope')),
              onChanged: (v) => s.rdmnetScope = v,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _broker,
              decoration: InputDecoration(labelText: t('set.broker'), helperText: t('set.broker.hint')),
              keyboardType: TextInputType.url,
              onChanged: (v) => s.manualBroker = v,
            ),
            const Divider(),
            Text(t('set.network'), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            TextField(
              controller: _broadcast,
              decoration: InputDecoration(labelText: t('set.broadcast'), hintText: '2.255.255.255'),
              keyboardType: TextInputType.number,
              onChanged: (v) => s.extraBroadcast = v,
            ),
            const SizedBox(height: 12),
            InfoRow(t('set.uid'), s.controllerUid.toString(), mono: true),
            InfoRow(t('set.cid'), s.cid.toString(), mono: true),
            const Divider(),
            Text(t('set.about'), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Text(t('set.about.text', {'version': appVersion})),
          ],
        ),
      ),
    );
  }
}
