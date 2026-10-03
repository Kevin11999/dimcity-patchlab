import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/port_session.dart';
import '../core/addressing/address_plan.dart';
import '../l10n/strings.dart';
import 'overview_screen.dart';
import 'theme.dart';
import 'widgets.dart';

/// Step 3: start address; the app calculates every next address and stops at the
/// fixture that no longer fits in the universe.
class AddressScreen extends StatefulWidget {
  const AddressScreen({super.key, required this.session});
  final PortSession session;

  @override
  State<AddressScreen> createState() => _AddressScreenState();
}

class _AddressScreenState extends State<AddressScreen> {
  late final TextEditingController _start = TextEditingController(text: '${widget.session.startAddress}');
  late final TextEditingController _universe = TextEditingController(text: '${widget.session.startUniverse}');
  String? _askedFor;

  @override
  void dispose() {
    _start.dispose();
    _universe.dispose();
    super.dispose();
  }

  void _apply() {
    final a = int.tryParse(_start.text.trim());
    final u = int.tryParse(_universe.text.trim());
    widget.session.setStart(address: a ?? 0, universe: u ?? widget.session.startUniverse);
  }

  Future<void> _askOverflow(PlanOverflow o) async {
    if (_askedFor == o.fixture.id) return;
    _askedFor = o.fixture.id;
    final wrap = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: Pal.amber, size: 32),
        title: Text(t('addr.overflow.title', {'name': o.fixture.name})),
        content: Text(t('addr.overflow.body', {'name': o.fixture.name, 'fp': o.footprint, 'start': o.wouldStart, 'end': o.wouldEnd, 'u': o.universe})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(t('addr.overflow.adjust'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(t('addr.overflow.wrap'))),
        ],
      ),
    );
    if (wrap == true) widget.session.wrapAt(o.fixture.id);
    _askedFor = null;
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: widget.session,
        builder: (context, _) {
          final s = widget.session;
          final plan = s.plan;
          final overflow = plan.overflow;
          if (overflow != null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted && s.plan.overflow?.fixture.id == overflow.fixture.id) _askOverflow(overflow);
            });
          }
          final byUniverse = <int, List<PlanEntry>>{};
          for (final e in plan.entries) {
            byUniverse.putIfAbsent(e.universe, () => []).add(e);
          }
          return Scaffold(
            appBar: AppBar(title: Text(t('addr.title')), bottom: const StepHeader(2)),
            bottomNavigationBar: Container(
              decoration: const BoxDecoration(color: Pal.surface, border: Border(top: BorderSide(color: Pal.line))),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: SafeArea(
                top: false,
                child: FilledButton.icon(
                  onPressed: plan.complete
                      ? () {
                          s.goToOverview();
                          Navigator.push(context, MaterialPageRoute<void>(builder: (_) => OverviewScreen(session: s)));
                        }
                      : null,
                  icon: const Icon(Icons.arrow_forward),
                  label: Text(t('addr.overview')),
                ),
              ),
            ),
            body: ListView(
              padding: const EdgeInsets.only(top: 6, bottom: 20),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _start,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                          decoration: InputDecoration(labelText: t('addr.start'), errorText: plan.error != null && plan.error!.contains('start') ? t('addr.invalid') : null),
                          onChanged: (_) => _apply(),
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 130,
                        child: TextField(
                          controller: _universe,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                          decoration: InputDecoration(labelText: t('addr.universe')),
                          onChanged: (_) => _apply(),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(padding: const EdgeInsets.fromLTRB(20, 10, 20, 0), child: Text(t('addr.rule'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted))),
                if (plan.error != null && !plan.error!.contains('start')) WarningCard(t('addr.error.mode')),
                for (final entry in byUniverse.entries) _universeCard(context, s, entry.key, entry.value),
                if (overflow != null)
                  Card(
                    color: Theme.of(context).colorScheme.errorContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [const Icon(Icons.warning_amber_rounded, color: Pal.amber), const SizedBox(width: 10), Expanded(child: Text(t('addr.overflow.pending', {'name': overflow.fixture.name, 'u': overflow.universe, 'start': overflow.wouldStart, 'end': overflow.wouldEnd})))]),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              FilledButton(onPressed: () => s.wrapAt(overflow.fixture.id), child: Text(t('addr.overflow.wrap'))),
                              OutlinedButton(onPressed: () => FocusScope.of(context).requestFocus(FocusNode()), child: Text(t('addr.overflow.adjust'))),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                for (final id in s.effectiveWraps)
                  if (s.fixtureById(id) != null)
                    NoticeCard(
                      t('addr.overflow.hint', {'name': s.fixtureById(id)!.displayName, 'u': plan.entries.where((e) => e.fixture.id == id).firstOrNull?.universe ?? '?'}),
                      icon: Icons.call_split,
                      iconColor: Pal.amber,
                      action: TextButton(onPressed: () => s.unwrap(id), child: Text(t('addr.unwrap'))),
                    ),
              ],
            ),
          );
        },
      );

  Widget _universeCard(BuildContext context, PortSession s, int universe, List<PlanEntry> entries) {
    final used = entries.fold<int>(0, (n, e) => n + e.footprint);
    final segments = [
      for (final e in entries)
        UniverseSegment(start: e.address, end: e.lastChannel, color: Pal.typeColor(s.typeIndex(s.fixtureById(e.fixture.id)!.type))),
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(t('addr.universe.title', {'u': universe}), style: Theme.of(context).textTheme.titleMedium)),
                Text(t('addr.channels.used', {'used': used}), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted)),
              ],
            ),
            const SizedBox(height: 12),
            UniverseBar(segments: segments),
            const SizedBox(height: 6),
            for (var i = 0; i < entries.length; i++) _entry(context, s, i, entries[i]),
          ],
        ),
      ),
    );
  }

  Widget _entry(BuildContext context, PortSession s, int i, PlanEntry e) {
    final f = s.fixtureById(e.fixture.id);
    final color = f == null ? Pal.muted : Pal.typeColor(s.typeIndex(f.type));
    final wrapped = s.effectiveWraps.contains(e.fixture.id);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(width: 6, height: 38, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.fixture.name, style: Theme.of(context).textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text('${f?.type.label ?? ''}  ·  ${e.footprint} ch${wrapped ? '  ·  ${t('addr.wrapped')}' : ''}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              AddressBadge(e.address, color: color),
              const SizedBox(height: 2),
              Text('${e.address}–${e.lastChannel}', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Pal.muted)),
            ],
          ),
        ],
      ),
    );
  }
}
