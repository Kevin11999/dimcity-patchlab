import 'package:flutter/material.dart';

import '../app/backend.dart';
import '../app/port_session.dart';
import '../l10n/strings.dart';
import '../model/fixture.dart';
import '../model/node.dart';
import 'align_screen.dart';
import 'fixture_screen.dart';
import 'mode_screen.dart';
import 'widgets.dart';

/// Step 3: RDM discovery on one port and the list of fixtures found.
class PortScreen extends StatefulWidget {
  const PortScreen({super.key, required this.backend, required this.node, required this.port});
  final AppBackend backend;
  final Node node;
  final NodePort port;

  @override
  State<PortScreen> createState() => _PortScreenState();
}

class _PortScreenState extends State<PortScreen> {
  late final PortSession session = PortSession(widget.backend, widget.node, widget.port);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => session.discover());
  }

  @override
  void dispose() {
    session.dispose();
    super.dispose();
  }

  Future<void> _toggleIdentify(Fixture f) async {
    try {
      await session.identify(f, !f.identifying);
    } catch (e) {
      if (mounted) showMessage(context, t('align.identify.error', {'e': describeError(e)}));
    }
  }

  Future<void> _startAlign() async {
    await session.startAlign();
    if (!mounted) return;
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => AlignScreen(session: session)));
  }

  Future<void> _addressDirect() async {
    session.useDiscoveryOrder();
    await session.goToModes();
    if (!mounted) return;
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => ModeScreen(session: session)));
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.port;
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final s = session;
        final ready = s.phase == SessionPhase.ready || s.phase == SessionPhase.done || s.phase == SessionPhase.overview || s.phase == SessionPhase.modes || s.phase == SessionPhase.addressing || s.phase == SessionPhase.aligning;
        return Scaffold(
          appBar: AppBar(
            title: Text(t('disc.title', {'n': p.number, 'u': p.displayUniverse})),
            actions: [
              if (s.routeName.isNotEmpty) Center(child: Padding(padding: const EdgeInsets.only(right: 12), child: Badge2(t('disc.route', {'route': s.routeName})))),
            ],
          ),
          bottomNavigationBar: ready && s.fixtures.isNotEmpty
              ? SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                    child: Row(
                      children: [
                        Expanded(child: OutlinedButton(onPressed: _addressDirect, child: Text(t('disc.address.direct')))),
                        const SizedBox(width: 12),
                        Expanded(child: FilledButton.icon(onPressed: _startAlign, icon: const Icon(Icons.flashlight_on), label: Text(t('disc.align')))),
                      ],
                    ),
                  ),
                )
              : null,
          body: ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              if (s.phase == SessionPhase.discovering) _progress(t('disc.running', {'n': p.number})),
              if (s.phase == SessionPhase.loadingDetails) _progress(t('disc.details', {'i': s.detailIndex, 'n': s.detailIndex > s.fixtures.length ? s.detailIndex : s.fixtures.length})),
              if (s.routeNote == 'fallback') NoticeCard(t('disc.route.fallback')),
              if (s.error != null && !s.busy)
                WarningCard(
                  t('disc.error', {'e': s.error}),
                  action: TextButton(onPressed: () => s.discover(), child: Text(t('common.retry'))),
                ),
              if (ready && s.fixtures.isEmpty && s.error == null)
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Text(t('disc.none'), style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(t('disc.none.hint'), textAlign: TextAlign.center),
                    ],
                  ),
                ),
              if (s.fixtures.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  child: Row(
                    children: [
                      Text(t('disc.found', {'n': s.fixtures.length}), style: Theme.of(context).textTheme.titleSmall),
                      const Spacer(),
                      if (!s.busy) TextButton.icon(onPressed: () => s.discover(), icon: const Icon(Icons.refresh), label: Text(t('disc.again'))),
                    ],
                  ),
                ),
              for (final f in s.fixtures) _fixtureTile(f),
            ],
          ),
        );
      },
    );
  }

  Widget _progress(String text) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [const CircularProgressIndicator(), const SizedBox(height: 12), Text(text)]),
      );

  Widget _fixtureTile(Fixture f) => Card(
        child: ListTile(
          leading: f.identifying ? const BlinkIcon(size: 28) : const Icon(Icons.lightbulb_outline),
          title: Text(f.displayName),
          subtitle: Text('${f.type.label}\n${f.modeLabel} · ${t('disc.col.address')} ${f.hasAddress ? f.address : t('disc.noaddress')}'),
          isThreeLine: true,
          trailing: IconButton(
            icon: Icon(f.identifying ? Icons.flashlight_on : Icons.flashlight_off_outlined),
            tooltip: t('disc.identify'),
            onPressed: session.busy ? null : () => _toggleIdentify(f),
          ),
          onTap: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => FixtureScreen(session: session, fixture: f))),
        ),
      );
}
