import 'package:flutter/material.dart';

import '../app/backend.dart';
import '../app/port_session.dart';
import '../l10n/strings.dart';
import '../model/node.dart';
import 'fixture_list.dart';
import 'widgets.dart';

/// RDM discovery on one DMX port of a node and the fixtures found there.
class PortScreen extends StatefulWidget {
  const PortScreen({super.key, required this.backend, required this.node, required this.port});
  final AppBackend backend;
  final Node node;
  final NodePort port;

  @override
  State<PortScreen> createState() => _PortScreenState();
}

class _PortScreenState extends State<PortScreen> {
  late final PortSession session = PortSession.forPort(widget.backend, widget.node, widget.port);

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

  @override
  Widget build(BuildContext context) {
    final p = widget.port;
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: Text(t('disc.title', {'n': p.number, 'u': p.displayUniverse})),
          actions: [
            if (session.routeName.isNotEmpty) Padding(padding: const EdgeInsets.only(right: 14), child: Badge2(t('disc.route', {'route': session.routeName}))),
          ],
        ),
        body: FixtureListPane(
          session: session,
          searchingTitle: t('disc.running', {'n': p.number}),
          emptyState: (context) => Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Text(t('disc.none'), style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(t('disc.none.hint'), textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
