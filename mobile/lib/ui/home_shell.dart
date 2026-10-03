import 'package:flutter/material.dart';

import '../app/backend.dart';
import '../app/settings.dart';
import '../l10n/strings.dart';
import 'lamps_screen.dart';
import 'nodes_screen.dart';

/// Two ways in: **Lamps** (RDMnet lamps straight on the cable, the easy way) and
/// **Nodes** (Art-Net / sACN nodes with DMX ports).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.backend, required this.settings});
  final AppBackend backend;
  final Settings settings;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  bool _nodesOpened = false;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(
          index: _index,
          children: [
            LampsScreen(backend: widget.backend, settings: widget.settings),
            // The node scan (Art-Net broadcast, mDNS) only starts when the tab is opened.
            if (_nodesOpened) NodesScreen(backend: widget.backend, settings: widget.settings) else const SizedBox.shrink(),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() {
            _index = i;
            if (i == 1) _nodesOpened = true;
          }),
          destinations: [
            NavigationDestination(icon: const Icon(Icons.lightbulb_outline), selectedIcon: const Icon(Icons.lightbulb), label: t('tab.lamps')),
            NavigationDestination(icon: const Icon(Icons.router_outlined), selectedIcon: const Icon(Icons.router), label: t('tab.nodes')),
          ],
        ),
      );
}
