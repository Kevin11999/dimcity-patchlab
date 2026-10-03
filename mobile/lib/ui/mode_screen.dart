import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../l10n/strings.dart';
import 'address_screen.dart';
import 'widgets.dart';

/// Step 5a: one mode per fixture type.
class ModeScreen extends StatelessWidget {
  const ModeScreen({super.key, required this.session});
  final PortSession session;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          final s = session;
          return Scaffold(
            appBar: AppBar(title: Text(t('mode.title'))),
            bottomNavigationBar: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: FilledButton.icon(
                  onPressed: () {
                    s.goToAddressing();
                    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => AddressScreen(session: s)));
                  },
                  icon: const Icon(Icons.arrow_forward),
                  label: Text(t('mode.next')),
                ),
              ),
            ),
            body: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                NoticeCard(t('mode.hint')),
                for (final (type, count) in s.typesInUse)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text(type.label, style: Theme.of(context).textTheme.titleMedium)),
                              Badge2(t('mode.count', {'n': count})),
                            ],
                          ),
                          const SizedBox(height: 8),
                          if (type.personalities.isEmpty)
                            Text(t('mode.unknown', {'fp': s.footprintFor(type)}))
                          else
                            DropdownButtonFormField<int>(
                              initialValue: s.modeByType[type.key],
                              items: [
                                for (final p in type.personalities)
                                  DropdownMenuItem(value: p.personality, child: Text('${p.label} · ${t('mode.channels', {'n': p.footprint})}')),
                              ],
                              onChanged: (v) {
                                if (v != null) s.chooseMode(type, v);
                              },
                            ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      );
}
