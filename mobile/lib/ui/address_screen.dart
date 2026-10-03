import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/port_session.dart';
import '../core/addressing/address_plan.dart';
import '../l10n/strings.dart';
import 'overview_screen.dart';
import 'widgets.dart';

/// Step 5b: start address; the app calculates every next address and stops
/// at the fixture that no longer fits in the universe.
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
        icon: const Icon(Icons.warning_amber_rounded),
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
          final scheme = Theme.of(context).colorScheme;
          return Scaffold(
            appBar: AppBar(title: Text(t('addr.title'))),
            bottomNavigationBar: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
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
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _start,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: InputDecoration(labelText: t('addr.start'), errorText: plan.error != null && plan.error!.contains('start') ? t('addr.invalid') : null),
                          onChanged: (_) => _apply(),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _universe,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: InputDecoration(labelText: t('addr.universe')),
                          onChanged: (_) => _apply(),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: Text(t('addr.rule'), style: Theme.of(context).textTheme.bodySmall)),
                if (plan.error != null && !plan.error!.contains('start')) WarningCard(t('addr.error.mode')),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Text(t('addr.plan'), style: Theme.of(context).textTheme.titleSmall),
                ),
                for (var i = 0; i < plan.entries.length; i++) _entry(i, plan.entries[i], scheme),
                if (overflow != null)
                  Card(
                    color: scheme.errorContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t('addr.overflow.pending', {'name': overflow.fixture.name, 'u': overflow.universe, 'start': overflow.wouldStart, 'end': overflow.wouldEnd})),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
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
                      action: TextButton(onPressed: () => s.unwrap(id), child: Text(t('addr.unwrap'))),
                    ),
              ],
            ),
          );
        },
      );

  Widget _entry(int i, PlanEntry e, ColorScheme scheme) {
    final s = widget.session;
    final f = s.fixtureById(e.fixture.id);
    final wrapped = s.effectiveWraps.contains(e.fixture.id);
    return ListTile(
      leading: CircleAvatar(radius: 14, child: Text('${i + 1}')),
      title: Text(e.fixture.name),
      subtitle: Text(f == null ? '' : '${f.type.label} · ${e.footprint} ch'),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text('${e.address}–${e.lastChannel}', style: Theme.of(context).textTheme.titleMedium),
          Text('U${e.universe}${wrapped ? ' · ${t('addr.wrapped')}' : ''}', style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
