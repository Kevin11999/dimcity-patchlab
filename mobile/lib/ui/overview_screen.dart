import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../l10n/strings.dart';
import 'widgets.dart';

/// Step 5c: confirm, send, verify; retry per fixture.
class OverviewScreen extends StatelessWidget {
  const OverviewScreen({super.key, required this.session});
  final PortSession session;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          final s = session;
          final plan = s.plan;
          final sending = s.phase == SessionPhase.sending;
          final sent = s.sendState.isNotEmpty;
          final scheme = Theme.of(context).colorScheme;
          final universes = plan.universes;
          return Scaffold(
            appBar: AppBar(title: Text(t('ov.title'))),
            bottomNavigationBar: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: s.allVerified
                    ? FilledButton.icon(
                        onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst || r.settings.name == 'node'),
                        icon: const Icon(Icons.check),
                        label: Text(t('ov.finish')),
                      )
                    : FilledButton.icon(
                        onPressed: sending || !plan.complete ? null : () => s.send(),
                        icon: sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send),
                        label: Text(sending ? t('ov.verifying') : (sent ? t('ov.retry') : t('ov.send'))),
                      ),
              ),
            ),
            body: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                if (!sent) NoticeCard(t('ov.hint')),
                if (universes.length > 1) NoticeCard(t('ov.universe.note', {'u': universes.last}), icon: Icons.call_split),
                if (s.allVerified) NoticeCard(t('ov.all.ok'), icon: Icons.check_circle, color: scheme.primaryContainer),
                if (!sending && s.failedCount > 0) WarningCard(t('ov.some.failed', {'n': s.failedCount})),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      Expanded(flex: 3, child: Text(t('ov.col.fixture'), style: Theme.of(context).textTheme.labelMedium)),
                      Expanded(flex: 2, child: Text(t('ov.col.mode'), style: Theme.of(context).textTheme.labelMedium)),
                      SizedBox(width: 48, child: Text(t('ov.col.universe'), style: Theme.of(context).textTheme.labelMedium)),
                      SizedBox(width: 72, child: Text(t('ov.col.range'), style: Theme.of(context).textTheme.labelMedium, textAlign: TextAlign.right)),
                    ],
                  ),
                ),
                for (final e in plan.entries) _row(context, e.fixture.id, e.universe, e.address, e.lastChannel, e.footprint),
              ],
            ),
          );
        },
      );

  Widget _row(BuildContext context, String id, int universe, int address, int last, int footprint) {
    final s = session;
    final f = s.fixtureById(id)!;
    final state = s.sendState[f.uid];
    final mode = f.type.personality(s.modeByType[f.type.key] ?? f.personality)?.label ?? '$footprint ch';
    final scheme = Theme.of(context).colorScheme;
    Widget status;
    switch (state?.status) {
      case null:
        status = const SizedBox.shrink();
      case SendStatus.pending:
        status = Text(t('ov.pending'), style: Theme.of(context).textTheme.bodySmall);
      case SendStatus.sending:
        status = const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2));
      case SendStatus.verified:
        status = Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.check_circle, color: Colors.green, size: 18), const SizedBox(width: 4), Text(t('ov.verified'))]);
      case SendStatus.failed:
        status = Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error, color: scheme.error, size: 18),
            const SizedBox(width: 4),
            Flexible(child: Text('${t('ov.failed')}${state?.message != null ? ' · ${state!.message}' : ''}', style: TextStyle(color: scheme.error))),
            TextButton(onPressed: s.phase == SessionPhase.sending ? null : () => s.retry(f), child: Text(t('ov.retry'))),
          ],
        );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(flex: 3, child: Text(f.displayName, style: Theme.of(context).textTheme.titleSmall)),
                Expanded(flex: 2, child: Text('$mode ($footprint ch)')),
                SizedBox(width: 48, child: Text('$universe')),
                SizedBox(width: 72, child: Text('$address–$last', textAlign: TextAlign.right, style: Theme.of(context).textTheme.titleSmall)),
              ],
            ),
            Text(f.type.label, style: Theme.of(context).textTheme.bodySmall),
            if (state != null) Padding(padding: const EdgeInsets.only(top: 4), child: status),
          ],
        ),
      ),
    );
  }
}
