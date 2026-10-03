import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../l10n/strings.dart';
import 'mode_screen.dart';
import 'widgets.dart';

/// Step 4: one fixture blinks at a time; Align puts it on the next position.
class AlignScreen extends StatelessWidget {
  const AlignScreen({super.key, required this.session});
  final PortSession session;

  Future<void> _next(BuildContext context) async {
    await session.goToModes();
    if (!context.mounted) return;
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => ModeScreen(session: session)));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) session.stopAlign();
      },
      child: ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          final s = session;
          final current = s.current;
          final scheme = Theme.of(context).colorScheme;
          return Scaffold(
            appBar: AppBar(title: Text(t('align.title'))),
            bottomNavigationBar: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: s.alignDone
                    ? FilledButton.icon(onPressed: () => _next(context), icon: const Icon(Icons.arrow_forward), label: Text(t('align.next')))
                    : Row(
                        children: [
                          OutlinedButton(onPressed: s.placed.isEmpty ? null : () => s.stepBack(), child: Text(t('align.back'))),
                          const SizedBox(width: 8),
                          Expanded(child: OutlinedButton(onPressed: s.queue.length < 2 ? null : () => s.skipCurrent(), child: Text(t('align.skip')))),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 2,
                            child: FilledButton.icon(
                              onPressed: current == null ? null : () => s.alignCurrent(),
                              icon: const Icon(Icons.check),
                              label: Text(t('align.align')),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
            body: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                if (s.error != null) WarningCard(t('align.identify.error', {'e': s.error})),
                if (current != null)
                  Card(
                    color: scheme.primaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          Text(t('align.blinking'), style: Theme.of(context).textTheme.labelLarge),
                          const SizedBox(height: 8),
                          const BlinkIcon(size: 64),
                          const SizedBox(height: 8),
                          Text(current.displayName, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                          Text('${current.type.label} · ${current.modeLabel} · ${t('disc.col.address')} ${current.hasAddress ? current.address : '-'}', textAlign: TextAlign.center),
                          const SizedBox(height: 8),
                          Text(t('align.position', {'n': s.placed.length + 1}), style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          Text(t('align.hint'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  )
                else
                  NoticeCard(t('align.done'), icon: Icons.check_circle_outline),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Row(
                    children: [
                      Text(t('align.placed', {'n': s.placed.length}), style: Theme.of(context).textTheme.titleSmall),
                      const Spacer(),
                      Text(t('align.remaining', {'n': s.queue.length}), style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                if (s.placed.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(t('align.reorder.hint'), style: Theme.of(context).textTheme.bodySmall)),
                ReorderableListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  buildDefaultDragHandles: false,
                  itemCount: s.placed.length,
                  onReorderItem: s.reorderPlaced,
                  itemBuilder: (context, i) {
                    final f = s.placed[i];
                    return ListTile(
                      key: ValueKey(f.uid.toString()),
                      leading: CircleAvatar(radius: 14, child: Text('${i + 1}')),
                      title: Text(f.displayName),
                      subtitle: Text('${f.type.label} · ${f.modeLabel}'),
                      trailing: ReorderableDragStartListener(index: i, child: const Icon(Icons.drag_handle)),
                    );
                  },
                ),
                if (s.queue.length > 1 && current != null)
                  Padding(padding: const EdgeInsets.all(16), child: Text(t('align.skipped.hint'), style: Theme.of(context).textTheme.bodySmall)),
              ],
            ),
          );
        },
      ),
    );
  }
}
