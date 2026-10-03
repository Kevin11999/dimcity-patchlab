import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../l10n/strings.dart';
import 'mode_screen.dart';
import 'theme.dart';
import 'widgets.dart';

/// Step 1: one lamp blinks at a time; walk to it and press Align when it is the next one in the row.
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
          final total = s.placed.length + s.queue.length;
          final color = current == null ? Pal.teal : Pal.typeColor(s.typeIndex(current.type));
          return Scaffold(
            appBar: AppBar(title: Text(t('align.title')), bottom: const StepHeader(0)),
            bottomNavigationBar: Container(
              decoration: const BoxDecoration(color: Pal.surface, border: Border(top: BorderSide(color: Pal.line))),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: SafeArea(
                top: false,
                child: s.alignDone
                    ? FilledButton.icon(onPressed: () => _next(context), icon: const Icon(Icons.arrow_forward), label: Text(t('align.next')))
                    : Row(
                        children: [
                          Tooltip(
                            message: t('align.back'),
                            child: OutlinedButton(onPressed: s.placed.isEmpty ? null : () => s.stepBack(), style: OutlinedButton.styleFrom(minimumSize: const Size(56, 56)), child: const Icon(Icons.undo)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            flex: 3,
                            child: OutlinedButton(
                              onPressed: s.queue.length < 2 ? null : () => s.skipCurrent(),
                              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                              child: Text(t('align.skip'), maxLines: 1, softWrap: false),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            flex: 4,
                            child: FilledButton.icon(onPressed: current == null ? null : () => s.alignCurrent(), icon: const Icon(Icons.check), label: Text(t('align.align'))),
                          ),
                        ],
                      ),
              ),
            ),
            body: ListView(
              padding: const EdgeInsets.only(top: 6, bottom: 20),
              children: [
                if (s.error != null) WarningCard(t('align.identify.error', {'e': s.error})),
                if (current != null)
                  Card(
                    color: Color.alphaBlend(color.withValues(alpha: 0.10), Pal.card),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: BorderSide(color: color.withValues(alpha: 0.55), width: 1.5)),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
                      child: Column(
                        children: [
                          Text(t('align.blinking').toUpperCase(), style: Theme.of(context).textTheme.labelMedium?.copyWith(color: color, letterSpacing: 1.6, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 14),
                          PulseRings(color: color, size: 150, child: LampAvatar(color: color, identifying: true, size: 76)),
                          const SizedBox(height: 14),
                          Text(current.displayName, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                          const SizedBox(height: 4),
                          Text('${current.type.label}  ·  ${current.modeLabel}', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Pal.muted), textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          Badge2(t('align.progress', {'n': s.placed.length + 1, 'total': total}), color: color.withValues(alpha: 0.2), foreground: color),
                          const SizedBox(height: 14),
                          Text(t('align.hint'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted, height: 1.4)),
                        ],
                      ),
                    ),
                  )
                else
                  SuccessCard(t('align.done')),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(value: total == 0 ? 0 : s.placed.length / total, minHeight: 8, backgroundColor: Pal.surface, color: Pal.teal),
                  ),
                ),
                SectionTitle(t('align.placed', {'n': s.placed.length}), trailing: Text(t('align.remaining', {'n': s.queue.length}), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted))),
                if (s.placed.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 6), child: Text(t('align.reorder.hint'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted))),
                ReorderableListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  buildDefaultDragHandles: false,
                  itemCount: s.placed.length,
                  onReorderItem: s.reorderPlaced,
                  proxyDecorator: (child, i, a) => Material(color: Colors.transparent, elevation: 6, borderRadius: BorderRadius.circular(18), child: child),
                  itemBuilder: (context, i) {
                    final f = s.placed[i];
                    final c = Pal.typeColor(s.typeIndex(f.type));
                    return Card(
                      key: ValueKey(f.uid.toString()),
                      child: ListTile(
                        leading: CircleAvatar(radius: 16, backgroundColor: c.withValues(alpha: 0.2), child: Text('${i + 1}', style: TextStyle(color: c, fontWeight: FontWeight.w800))),
                        title: Text(f.displayName),
                        subtitle: Text(f.detailLine, maxLines: 1, overflow: TextOverflow.ellipsis),
                        trailing: ReorderableDragStartListener(index: i, child: const Icon(Icons.drag_handle)),
                      ),
                    );
                  },
                ),
                if (s.queue.length > 1 && current != null)
                  Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 0), child: Text(t('align.skipped.hint'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted))),
              ],
            ),
          );
        },
      ),
    );
  }
}
