import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../l10n/strings.dart';
import '../model/fixture.dart';
import 'align_screen.dart';
import 'fixture_screen.dart';
import 'mode_screen.dart';
import 'theme.dart';
import 'widgets.dart';

/// The list of fixtures found on a line, with the big "start addressing" buttons at the bottom.
/// Used for the lamps on the cable and for the fixtures behind a DMX port of a node.
class FixtureListPane extends StatelessWidget {
  const FixtureListPane({
    super.key,
    required this.session,
    required this.searchingTitle,
    this.searchingHint,
    required this.emptyState,
    this.headers = const [],
  });

  final PortSession session;
  final String searchingTitle;
  final String? searchingHint;
  final WidgetBuilder emptyState;

  /// Cards shown above everything else (demo banner, route notes).
  final List<Widget> headers;

  Future<void> _startAlign(BuildContext context) async {
    await session.startAlign();
    if (!context.mounted) return;
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => AlignScreen(session: session)));
  }

  Future<void> _skipAlign(BuildContext context) async {
    session.useDiscoveryOrder();
    await session.goToModes();
    if (!context.mounted) return;
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => ModeScreen(session: session)));
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          final s = session;
          final discovering = s.phase == SessionPhase.discovering;
          final loading = s.phase == SessionPhase.loadingDetails;
          final idle = s.phase == SessionPhase.idle && s.fixtures.isEmpty && s.error == null;
          final dmxCount = s.fixtures.where((f) => f.hasDmx).length;
          final showActions = !s.busy && dmxCount > 0;
          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: s.discover,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(top: 4, bottom: 16),
                    children: [
                      ...headers,
                      if (discovering || idle) StateHero(icon: Icons.radar, title: searchingTitle, body: searchingHint, pulse: true),
                      if (loading) _loading(context, s),
                      if (s.routeNote == 'fallback') NoticeCard(t('disc.route.fallback')),
                      if (s.error != null && !s.busy)
                        WarningCard(
                          s.fixtures.isEmpty ? t('disc.error', {'e': s.error}) : s.error!,
                          action: TextButton(onPressed: s.discover, child: Text(t('common.retry'))),
                        ),
                      if (!s.busy && s.phase != SessionPhase.idle && s.fixtures.isEmpty && s.error == null) emptyState(context),
                      if (s.fixtures.isNotEmpty) ...[
                        _summary(context, s),
                        for (final f in s.fixtures) _LampTile(session: s, fixture: f),
                      ],
                    ],
                  ),
                ),
              ),
              if (showActions)
                Container(
                  decoration: const BoxDecoration(color: Pal.surface, border: Border(top: BorderSide(color: Pal.line))),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: SafeArea(
                    top: false,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(onPressed: () => _startAlign(context), icon: const Icon(Icons.flashlight_on), label: Text(t('lamps.start'))),
                        ),
                        const SizedBox(height: 4),
                        TextButton(onPressed: () => _skipAlign(context), child: Text(t('lamps.skipalign'))),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      );

  Widget _loading(BuildContext context, PortSession s) {
    final total = s.expectedCount;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t('lamps.loading', {'i': s.detailIndex, 'n': total}), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 10),
            ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: total == 0 ? null : s.detailIndex / total, minHeight: 8, backgroundColor: Pal.surface)),
          ],
        ),
      ),
    );
  }

  Widget _summary(BuildContext context, PortSession s) {
    final dmx = s.fixtures.where((f) => f.hasDmx).toList();
    final counts = <String, int>{};
    final order = <String>[];
    for (final f in dmx) {
      if (!counts.containsKey(f.type.key)) order.add(f.type.key);
      counts[f.type.key] = (counts[f.type.key] ?? 0) + 1;
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(dmx.length == 1 ? t('lamps.found.one') : t('lamps.found', {'n': dmx.length}), style: Theme.of(context).textTheme.titleLarge),
              ),
              if (!s.busy) IconButton(onPressed: s.discover, icon: const Icon(Icons.refresh), tooltip: t('lamps.rescan')),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              for (final k in order)
                Badge2('${s.types[k]!.label}  ×${counts[k]}', color: Pal.typeColor(s.typeIndex(s.types[k]!)).withValues(alpha: 0.18), foreground: Pal.typeColor(s.typeIndex(s.types[k]!))),
            ],
          ),
        ],
      ),
    );
  }
}

class _LampTile extends StatelessWidget {
  const _LampTile({required this.session, required this.fixture});
  final PortSession session;
  final Fixture fixture;

  @override
  Widget build(BuildContext context) {
    final f = fixture;
    final color = Pal.typeColor(session.typeIndex(f.type));
    final dim = !f.hasDmx;
    final sub = f.hasDmx ? f.detailLine : t('lamps.nodmx');
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => FixtureScreen(session: session, fixture: f))),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
          child: Row(
            children: [
              LampAvatar(color: color, identifying: f.identifying, dim: dim),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(f.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: dim ? Pal.muted : null)),
                    const SizedBox(height: 2),
                    Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted)),
                    Text('UID ${f.uid}', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Pal.muted.withValues(alpha: 0.7), fontFamily: 'monospace')),
                  ],
                ),
              ),
              if (f.hasDmx) AddressBadge(f.hasAddress ? f.address : null, color: color),
              IconButton(
                icon: Icon(f.identifying ? Icons.flashlight_on : Icons.flashlight_off_outlined, color: f.identifying ? Pal.amber : Pal.muted),
                tooltip: t('disc.identify'),
                onPressed: session.busy
                    ? null
                    : () async {
                        try {
                          await session.identify(f, !f.identifying);
                        } catch (e) {
                          if (context.mounted) showMessage(context, t('align.identify.error', {'e': describeError(e)}));
                        }
                      },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
