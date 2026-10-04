import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/backend.dart';
import '../app/port_session.dart';
import '../app/settings.dart';
import '../app/version.dart';
import '../l10n/strings.dart';
import 'fixture_list.dart';
import 'settings_screen.dart';
import 'theme.dart';
import 'widgets.dart';

/// The home screen: plug the lamps' network cable into the laptop and they show up.
/// The search starts by itself and keeps going until lamps appear; nothing has to be configured,
/// but the network adapter can be picked when the laptop has several.
class LampsScreen extends StatefulWidget {
  const LampsScreen({super.key, required this.backend, required this.settings, this.autoSearchEvery = const Duration(seconds: 6)});
  final AppBackend backend;
  final Settings settings;

  /// How often the search is repeated while no lamp has been found.
  final Duration autoSearchEvery;

  @override
  State<LampsScreen> createState() => _LampsScreenState();
}

class _LampsScreenState extends State<LampsScreen> {
  late final PortSession session = PortSession.lamps(widget.backend);
  bool? _demoSeen;
  bool _starting = false;
  Timer? _auto;

  @override
  void initState() {
    super.initState();
    widget.backend.addListener(_onBackend);
    WidgetsBinding.instance.addPostFrameCallback((_) => _search());
    // While no lamp is connected: look again every few seconds, so a cable that is plugged in later
    // (or an adapter that only gets its address after a minute) is picked up without a tap.
    _auto = Timer.periodic(widget.autoSearchEvery, (_) {
      if (mounted && !_starting && !session.busy && session.fixtures.isEmpty) _search(quiet: true);
    });
  }

  @override
  void dispose() {
    _auto?.cancel();
    widget.backend.removeListener(_onBackend);
    session.dispose();
    super.dispose();
  }

  /// Demo mode switched in the settings: search again on the other network.
  void _onBackend() {
    if (_demoSeen != null && _demoSeen != widget.settings.demoMode && !_starting) {
      _search();
    }
  }

  Future<void> _search({bool quiet = false}) async {
    if (_starting) return;
    _starting = true;
    _demoSeen = widget.settings.demoMode;
    try {
      await widget.backend.start();
      await session.discover(quiet: quiet);
    } finally {
      _starting = false;
      if (mounted) setState(() {});
    }
  }

  Future<void> _demo(bool on) async {
    await widget.backend.setDemo(on);
    if (mounted) await _search();
  }

  Future<void> _pickAdapter() async {
    final all = await widget.backend.allAdapters();
    if (!mounted) return;
    final stats = {for (final s in widget.backend.llrp?.stats ?? const []) s.info.ip: s};
    final names = <String>[];
    for (final a in all) {
      if (!names.contains(a.name)) names.add(a.name);
    }
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: Pal.surface,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.8),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                child: Text(t('adapter.title'), style: Theme.of(ctx).textTheme.titleLarge),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: Text(t('adapter.hint'), style: Theme.of(ctx).textTheme.bodySmall?.copyWith(color: Pal.muted)),
              ),
              RadioGroup<String>(
                groupValue: widget.settings.lampsAdapter,
                onChanged: (v) => Navigator.pop(ctx, v ?? ''),
                child: Column(
                  children: [
                    RadioListTile<String>(value: '', title: Text(t('adapter.auto'))),
                    for (final name in names)
                      RadioListTile<String>(
                        value: name,
                        title: Row(
                          children: [
                            Flexible(child: Text(name)),
                            const SizedBox(width: 8),
                            if (all.firstWhere((a) => a.name == name).isVirtual) Badge2(t('adapter.virtual')),
                            if (all.where((a) => a.name == name).any((a) => a.isLinkLocal)) ...[const SizedBox(width: 6), Badge2(t('adapter.cable'), color: Pal.teal.withValues(alpha: 0.18), foreground: Pal.teal)],
                          ],
                        ),
                        subtitle: Text([
                          for (final a in all.where((a) => a.name == name))
                            '${a.ip}${stats[a.ip] == null ? '' : '   ${t('adapter.stats', {'sent': stats[a.ip]!.probes, 'recv': stats[a.ip]!.replies})}'}',
                        ].join('\n')),
                      ),
                  ],
                ),
              ),
              if (names.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(t('adapter.none'))),
            ],
          ),
        ),
      ),
    );
    if (picked == null || !mounted) return;
    widget.settings.lampsAdapter = picked;
    await _search();
  }

  Widget _adapterBar() {
    final picked = widget.settings.lampsAdapter;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 0),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            ActionChip(
              avatar: const Icon(Icons.settings_ethernet, size: 18),
              label: Text(t('adapter.chip', {'name': picked.isEmpty ? t('adapter.auto.short') : picked})),
              onPressed: _pickAdapter,
            ),
            if (_brokerLabel() case final label?)
              Tooltip(
                message: t('broker.hint'),
                triggerMode: TooltipTriggerMode.tap,
                child: Chip(
                  avatar: Icon(Icons.hub_outlined, size: 18, color: widget.backend.lampBroker?.mode == 'none' ? Pal.muted : Pal.teal),
                  label: Text(label),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// One line on the broker state, null in demo mode (there is no broker).
  String? _brokerLabel() {
    final b = widget.backend.lampBroker;
    if (b == null) return null;
    return switch (b.mode) {
      'own' => t('broker.own', {'n': b.lamps.length}),
      'external' => t('broker.external', {'n': b.lamps.length}),
      _ => t('broker.none'),
    };
  }

  Future<void> _copyReport() async {
    final llrp = widget.backend.llrp;
    final text = StringBuffer('PatchLab RDM $appVersion\n')
      ..writeln('adapter setting: ${widget.settings.lampsAdapter.isEmpty ? 'automatic' : widget.settings.lampsAdapter}')
      ..writeln('all adapters: ${(await widget.backend.allAdapters()).join(' | ')}')
      ..write(llrp?.report() ?? 'LLRP not started\n')
      ..write(widget.backend.lampBroker?.report() ?? 'no RDMnet broker (demo)\n');
    await Clipboard.setData(ClipboardData(text: text.toString()));
    if (mounted) showMessage(context, t('lamps.diag.copied'));
  }

  Widget _empty(BuildContext context) {
    final llrp = widget.backend.llrp;
    final mono = Theme.of(context).textTheme.bodySmall?.copyWith(fontFamily: 'monospace');
    return Column(
      children: [
        StateHero(icon: Icons.cable, title: t('lamps.none'), body: t('lamps.none.hint'), color: Pal.muted),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Column(
            children: [
              SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: _search, icon: const Icon(Icons.refresh), label: Text(t('lamps.rescan')))),
              if (!widget.settings.demoMode) ...[
                const SizedBox(height: 8),
                SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: () => _demo(true), icon: const Icon(Icons.science_outlined), label: Text(t('lamps.demo')))),
              ],
              const SizedBox(height: 6),
              Text(t('lamps.autosearch'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Pal.muted)),
            ],
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              children: [
                for (final k in ['lamps.check.cable', 'lamps.check.power', 'lamps.check.wait', 'lamps.check.firewall', 'lamps.check.rdmnet'])
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [const Icon(Icons.check_circle_outline, size: 18, color: Pal.teal), const SizedBox(width: 10), Expanded(child: Text(t(k)))],
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (llrp != null)
          Card(
            child: ExpansionTile(
              shape: const Border(),
              collapsedShape: const Border(),
              title: Text(t('lamps.diag'), style: Theme.of(context).textTheme.titleSmall),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (llrp.stats.isEmpty) Text(t('adapter.none'), style: mono),
                for (final s in llrp.stats)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${s.info.name}  ${s.info.ip}', style: mono?.copyWith(fontWeight: FontWeight.w700)),
                        Text(t('adapter.stats', {'sent': s.probes, 'recv': s.replies}), style: mono),
                        if (s.error != null) Text(t('adapter.problem', {'e': s.error}), style: mono?.copyWith(color: Pal.red)),
                      ],
                    ),
                  ),
                for (final e in llrp.unusable.entries) Text('${e.key}: ${e.value}', style: mono?.copyWith(color: Pal.red)),
                if (widget.backend.lampBroker case final b?) Text('RDMnet: ${b.mode}${b.status.isEmpty ? '' : ' · ${b.status}'}', style: mono),
                const SizedBox(height: 4),
                OutlinedButton.icon(onPressed: _copyReport, icon: const Icon(Icons.copy, size: 18), label: Text(t('lamps.diag.copy'))),
              ],
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: widget.settings,
        builder: (context, _) => Scaffold(
          appBar: AppBar(
            title: Text(t('lamps.title')),
            actions: [
              if (widget.settings.demoMode) Padding(padding: const EdgeInsets.only(right: 4), child: Badge2('DEMO', color: Pal.amber.withValues(alpha: 0.2), foreground: Pal.amber)),
              IconButton(
                icon: const Icon(Icons.settings_outlined),
                tooltip: t('nodes.settings'),
                onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => SettingsScreen(settings: widget.settings, backend: widget.backend))),
              ),
              const SizedBox(width: 4),
            ],
          ),
          body: FixtureListPane(
            session: session,
            searchingTitle: t('lamps.searching'),
            searchingHint: t('lamps.searching.hint'),
            emptyState: _empty,
            headers: [
              _adapterBar(),
              if (widget.settings.demoMode)
                NoticeCard(t('lamps.demo.on'), icon: Icons.science_outlined, iconColor: Pal.amber, action: TextButton(onPressed: () => _demo(false), child: Text(t('lamps.demo.off')))),
            ],
          ),
        ),
      );
}
