import 'package:flutter/material.dart';

import '../app/backend.dart';
import '../app/port_session.dart';
import '../app/settings.dart';
import '../l10n/strings.dart';
import 'fixture_list.dart';
import 'settings_screen.dart';
import 'theme.dart';
import 'widgets.dart';

/// The home screen: plug the lamps' network cable into the laptop and they show up.
/// The search starts by itself; nothing has to be configured.
class LampsScreen extends StatefulWidget {
  const LampsScreen({super.key, required this.backend, required this.settings});
  final AppBackend backend;
  final Settings settings;

  @override
  State<LampsScreen> createState() => _LampsScreenState();
}

class _LampsScreenState extends State<LampsScreen> {
  late final PortSession session = PortSession.lamps(widget.backend);
  bool? _demoSeen;
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    widget.backend.addListener(_onBackend);
    WidgetsBinding.instance.addPostFrameCallback((_) => _search());
  }

  @override
  void dispose() {
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

  Future<void> _search() async {
    if (_starting) return;
    _starting = true;
    _demoSeen = widget.settings.demoMode;
    try {
      await widget.backend.start();
      await session.discover();
    } finally {
      _starting = false;
    }
  }

  Future<void> _demo(bool on) async {
    await widget.backend.setDemo(on);
    if (mounted) await _search();
  }

  Widget _empty(BuildContext context) {
    final llrp = widget.backend.llrp;
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
                Text(t('lamps.diag.adapters', {'list': llrp.adapters.isEmpty ? t('lamps.diag.none') : llrp.adapters.join(', ')}), style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                const SizedBox(height: 4),
                Text(t('lamps.diag.sent', {'n': llrp.probesSent}), style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                Text(t('lamps.diag.replies', {'n': llrp.repliesSeen}), style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
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
              if (widget.settings.demoMode)
                NoticeCard(t('lamps.demo.on'), icon: Icons.science_outlined, iconColor: Pal.amber, action: TextButton(onPressed: () => _demo(false), child: Text(t('lamps.demo.off')))),
            ],
          ),
        ),
      );
}
