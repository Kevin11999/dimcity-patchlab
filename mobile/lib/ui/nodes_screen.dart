import 'package:flutter/material.dart';

import '../app/backend.dart';
import '../app/settings.dart';
import '../l10n/strings.dart';
import '../model/node.dart';
import 'node_screen.dart';
import 'settings_screen.dart';
import 'theme.dart';
import 'widgets.dart';

/// Step 1: the nodes on the network, with the IP-range check.
class NodesScreen extends StatefulWidget {
  const NodesScreen({super.key, required this.backend, required this.settings});
  final AppBackend backend;
  final Settings settings;

  @override
  State<NodesScreen> createState() => _NodesScreenState();
}

class _NodesScreenState extends State<NodesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.backend.scan());
  }

  Future<void> _startDemo() async {
    await widget.backend.setDemo(true);
    await widget.backend.scan();
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.backend;
    return ListenableBuilder(
      listenable: b,
      builder: (context, _) {
        final net = b.network;
        final outside = b.nodes.where((n) => !n.inSubnet).toList();
        return Scaffold(
          appBar: AppBar(
            title: Text(t('nodes.title')),
            actions: [
              IconButton(
                icon: const Icon(Icons.settings_outlined),
                tooltip: t('nodes.settings'),
                onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => SettingsScreen(settings: widget.settings, backend: b))),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: b.scanning ? null : () => b.scan(),
            icon: b.scanning ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.radar),
            label: Text(b.scanning ? t('nodes.scanning') : t('nodes.scan')),
          ),
          body: RefreshIndicator(
            onRefresh: () => b.scan(),
            child: ListView(
              padding: const EdgeInsets.only(bottom: 96, top: 8),
              children: [
                NoticeCard(
                  net.known ? t('nodes.myip', {'ip': net.describe}) : t('nodes.myip.unknown'),
                  icon: Icons.lan_outlined,
                ),
                if (b.error != null) WarningCard(b.error!),
                if (widget.settings.demoMode) NoticeCard(t('lamps.demo.on'), icon: Icons.science_outlined, iconColor: Pal.amber),
                if (b.rdmnetStatus != null) NoticeCard(b.rdmnetStatus!, icon: Icons.hub_outlined),
                for (final n in outside)
                  WarningCard(t('nodes.subnet.warning', {'name': n.name, 'ip': n.ip ?? '?', 'own': net.describe})),
                if (b.nodes.isEmpty && !b.scanning)
                  StateHero(
                    icon: Icons.router_outlined,
                    title: t('nodes.none'),
                    body: t('nodes.none.hint'),
                    color: Pal.muted,
                    children: [
                      if (!widget.settings.demoMode) ...[
                        const SizedBox(height: 18),
                        OutlinedButton.icon(onPressed: _startDemo, icon: const Icon(Icons.science_outlined), label: Text(t('nodes.demo'))),
                      ],
                    ],
                  ),
                for (final n in b.nodes) _NodeTile(node: n, onTap: () => _open(n)),
                if (b.nodes.isNotEmpty)
                  Padding(padding: const EdgeInsets.all(16), child: Text(t('nodes.help'), style: Theme.of(context).textTheme.bodySmall)),
              ],
            ),
          ),
        );
      },
    );
  }

  void _open(Node n) {
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => NodeScreen(backend: widget.backend, node: n)));
  }
}

class _NodeTile extends StatelessWidget {
  const _NodeTile({required this.node, required this.onTap});
  final Node node;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDemo = node.ip == '127.0.0.1';
    return Card(
      child: ListTile(
        leading: Icon(isDemo ? Icons.science_outlined : Icons.router, color: node.inSubnet ? scheme.primary : scheme.error),
        title: Text(node.name),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${node.ip ?? '-'} · ${t('nodes.ports', {'n': node.ports.length})}'),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              children: [
                if (node.viaArtNet) Badge2(t('nodes.via.artnet')),
                if (node.viaRdmnet) Badge2(t('nodes.via.rdmnet')),
                if (!node.inSubnet) Badge2(t('nodes.subnet.short'), color: scheme.errorContainer, icon: Icons.warning_amber_rounded),
                if (isDemo) Badge2('demo'),
              ],
            ),
          ],
        ),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
