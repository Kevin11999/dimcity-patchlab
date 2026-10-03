import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../l10n/strings.dart';
import 'address_screen.dart';
import 'theme.dart';
import 'widgets.dart';

/// Step 2: one mode (channel count) per fixture type; it applies to every fixture of that type.
class ModeScreen extends StatelessWidget {
  const ModeScreen({super.key, required this.session});
  final PortSession session;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          final s = session;
          return Scaffold(
            appBar: AppBar(title: Text(t('mode.title')), bottom: const StepHeader(1)),
            bottomNavigationBar: Container(
              decoration: const BoxDecoration(color: Pal.surface, border: Border(top: BorderSide(color: Pal.line))),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: SafeArea(
                top: false,
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
              padding: const EdgeInsets.only(top: 6, bottom: 20),
              children: [
                Padding(padding: const EdgeInsets.fromLTRB(20, 6, 20, 8), child: Text(t('mode.hint'), style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Pal.muted, height: 1.4))),
                for (final (type, count) in s.typesInUse)
                  Builder(builder: (context) {
                    final color = Pal.typeColor(s.typeIndex(type));
                    return Card(
                      clipBehavior: Clip.antiAlias,
                      child: IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Container(width: 6, color: color),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        LampAvatar(color: color, size: 38),
                                        const SizedBox(width: 12),
                                        Expanded(child: Text(type.label, style: Theme.of(context).textTheme.titleMedium)),
                                        Badge2(count == 1 ? t('mode.count.one') : t('mode.count', {'n': count}), color: color.withValues(alpha: 0.18), foreground: color),
                                      ],
                                    ),
                                    const SizedBox(height: 14),
                                    if (type.personalities.isEmpty)
                                      Text(t('mode.unknown', {'fp': s.footprintFor(type)}), style: const TextStyle(color: Pal.muted))
                                    else
                                      Wrap(
                                        spacing: 8,
                                        runSpacing: 8,
                                        children: [
                                          for (final p in type.personalities)
                                            ChoiceChip(
                                              selected: s.modeByType[type.key] == p.personality,
                                              onSelected: (_) => s.chooseMode(type, p.personality),
                                              showCheckmark: false,
                                              selectedColor: color.withValues(alpha: 0.22),
                                              side: BorderSide(color: s.modeByType[type.key] == p.personality ? color : Pal.line),
                                              labelPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                                              label: Text.rich(TextSpan(children: [
                                                TextSpan(text: p.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                                                TextSpan(text: '   ${t('mode.channels', {'n': p.footprint})}', style: const TextStyle(color: Pal.muted)),
                                              ])),
                                            ),
                                        ],
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
              ],
            ),
          );
        },
      );
}
