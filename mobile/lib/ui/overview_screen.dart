import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../l10n/strings.dart';
import 'theme.dart';
import 'widgets.dart';

/// Step 4: confirm, send, verify; retry per fixture.
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
          final universes = plan.universes;
          return Scaffold(
            appBar: AppBar(title: Text(t('ov.title')), bottom: const StepHeader(3)),
            bottomNavigationBar: Container(
              decoration: const BoxDecoration(color: Pal.surface, border: Border(top: BorderSide(color: Pal.line))),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: SafeArea(
                top: false,
                child: s.allVerified
                    ? FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: Pal.green, foregroundColor: const Color(0xFF03210F)),
                        onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                        icon: const Icon(Icons.check),
                        label: Text(t('ov.finish')),
                      )
                    : FilledButton.icon(
                        onPressed: sending || !plan.complete ? null : (s.failedCount > 0 ? () => s.retryFailed() : () => s.send()),
                        icon: sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send),
                        label: Text(sending ? t('ov.verifying') : (s.failedCount > 0 ? t('ov.retry.failed') : t('ov.send'))),
                      ),
              ),
            ),
            body: ListView(
              padding: const EdgeInsets.only(top: 6, bottom: 20),
              children: [
                if (!sent) NoticeCard(t('ov.hint'), icon: Icons.fact_check_outlined),
                if (universes.length > 1) NoticeCard(t('ov.universe.note', {'u': universes.last}), icon: Icons.call_split, iconColor: Pal.amber),
                if (s.allVerified) SuccessCard(t('ov.all.ok')),
                if (!sending && s.failedCount > 0) WarningCard(t('ov.some.failed', {'n': s.failedCount})),
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
    final color = Pal.typeColor(s.typeIndex(f.type));
    final mode = f.type.personality(s.modeByType[f.type.key] ?? f.personality)?.label ?? '$footprint ch';
    Widget status = const SizedBox.shrink();
    switch (state?.status) {
      case null:
        break;
      case SendStatus.pending:
        status = Text(t('ov.pending'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted));
      case SendStatus.sending:
        status = const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2));
      case SendStatus.verified:
        status = Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.check_circle, color: Pal.green, size: 18), const SizedBox(width: 5), Text(t('ov.verified'), style: const TextStyle(color: Pal.green, fontWeight: FontWeight.w700))]);
      case SendStatus.failed:
        status = Row(
          children: [
            const Icon(Icons.error, color: Pal.red, size: 18),
            const SizedBox(width: 5),
            Expanded(child: Text('${t('ov.failed')}${state?.message != null ? ' · ${state!.message}' : ''}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.red))),
            FilledButton.tonal(
              style: FilledButton.styleFrom(minimumSize: const Size(0, 38)),
              onPressed: s.phase == SessionPhase.sending ? null : () => s.retry(f),
              child: Text(t('ov.retry')),
            ),
          ],
        );
    }
    final failed = state?.status == SendStatus.failed;
    return Card(
      shape: failed ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Pal.red)) : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                LampAvatar(color: color, size: 38),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f.displayName, style: Theme.of(context).textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text(f.label.isEmpty ? '$mode  ·  $footprint ch' : '${f.type.model}  ·  $mode  ·  $footprint ch', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    AddressBadge(address, color: color),
                    const SizedBox(height: 2),
                    Text('U$universe  ·  $address–$last', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Pal.muted)),
                  ],
                ),
              ],
            ),
            if (state != null) Padding(padding: const EdgeInsets.only(top: 10), child: status),
          ],
        ),
      ),
    );
  }
}
