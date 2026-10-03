import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/backend.dart';
import '../l10n/strings.dart';
import '../model/node.dart';
import 'port_screen.dart';
import 'widgets.dart';

/// Step 2: the ports of a node. Universe, protocol and RDM can be changed;
/// nothing goes to the node until "Program".
class NodeScreen extends StatefulWidget {
  const NodeScreen({super.key, required this.backend, required this.node});
  final AppBackend backend;
  final Node node;

  @override
  State<NodeScreen> createState() => _NodeScreenState();
}

class _PortDraft {
  _PortDraft(NodePort p)
      : universe = TextEditingController(text: '${p.displayUniverse}'),
        protocol = p.protocol,
        rdm = p.rdmEnabled;
  final TextEditingController universe;
  PortProtocol protocol;
  bool rdm;
}

class _NodeScreenState extends State<NodeScreen> {
  final Map<int, _PortDraft> _drafts = <int, _PortDraft>{};
  bool _programming = false;

  _PortDraft _draft(NodePort p) => _drafts.putIfAbsent(p.number, () => _PortDraft(p));

  PortEdit? _editOf(NodePort p) {
    final d = _drafts[p.number];
    if (d == null) return null;
    final u = int.tryParse(d.universe.text.trim());
    if (u == null) return null;
    return PortEdit(port: p, universe: u, protocol: d.protocol, rdmEnabled: d.rdm);
  }

  List<PortEdit> get _edits => [for (final p in widget.node.ports) if (_editOf(p) != null) _editOf(p)!];

  int get _changedCount => _edits.where((e) => e.changed).length;

  void _discard() {
    setState(() {
      for (final d in _drafts.values) {
        d.universe.dispose();
      }
      _drafts.clear();
    });
  }

  Future<void> _program() async {
    final edits = _edits;
    final problem = widget.backend.validateEdits(widget.node, edits);
    if (problem != null) {
      showMessage(context, problem);
      return;
    }
    if (!edits.any((e) => e.changed)) {
      showMessage(context, t('node.program.unchanged'));
      return;
    }
    setState(() => _programming = true);
    final r = await widget.backend.program(widget.node, edits);
    if (!mounted) return;
    setState(() => _programming = false);
    final text = r.ok
        ? t('node.program.ok')
        : r.replied
            ? t('node.program.partial', {'details': r.details.join('\n')})
            : t('node.program.noreply');
    _discard();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(r.ok ? Icons.check_circle_outline : Icons.error_outline, color: r.ok ? Colors.green : Theme.of(ctx).colorScheme.error),
        title: Text(t('node.program')),
        content: Text(text),
        actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(t('common.ok')))],
      ),
    );
  }

  void _openPort(NodePort p) {
    final d = _drafts[p.number];
    if (d != null && (_editOf(p)?.changed ?? false)) {
      showMessage(context, t('node.pending.changes', {'n': _changedCount}));
    }
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => PortScreen(backend: widget.backend, node: widget.node, port: p)));
  }

  @override
  void dispose() {
    for (final d in _drafts.values) {
      d.universe.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final node = widget.node;
    return ListenableBuilder(
      listenable: widget.backend,
      builder: (context, _) {
        final editable = node.viaArtNet;
        return Scaffold(
          appBar: AppBar(title: Text(node.name)),
          bottomNavigationBar: editable
              ? SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                    child: Row(
                      children: [
                        if (_changedCount > 0)
                          TextButton(onPressed: _programming ? null : _discard, child: Text(t('node.discard'))),
                        const Spacer(),
                        FilledButton.icon(
                          onPressed: _programming || _changedCount == 0 ? null : _program,
                          icon: _programming
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.upload),
                          label: Text(_programming ? t('node.programming') : t('node.program')),
                        ),
                      ],
                    ),
                  ),
                )
              : null,
          body: ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              if (!node.inSubnet) WarningCard(t('nodes.subnet.warning', {'name': node.name, 'ip': node.ip ?? '?', 'own': widget.backend.network.describe})),
              if (!editable) NoticeCard(t('node.program.rdmnetOnly')),
              NoticeCard(t('node.tap.port'), icon: Icons.touch_app_outlined),
              for (final p in node.ports) _portCard(p, editable),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      InfoRow(t('node.info.ip'), node.ip ?? '-', mono: true),
                      InfoRow(t('node.info.mac'), node.mac ?? '-', mono: true),
                      if (node.longName.isNotEmpty) InfoRow(t('node.info.long'), node.longName),
                      if (node.report.isNotEmpty) InfoRow(t('node.info.report'), node.report),
                      if (node.viaRdmnet) InfoRow(t('nodes.via.rdmnet'), node.gateway!.uid.toString(), mono: true),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _portCard(NodePort p, bool editable) {
    final d = _draft(p);
    final edit = _editOf(p);
    final changed = edit?.changed ?? false;
    final scheme = Theme.of(context).colorScheme;
    final isSacn = d.protocol == PortProtocol.sacn;
    final u = int.tryParse(d.universe.text.trim());
    String? hint;
    if (u != null) {
      if (isSacn) {
        hint = p.sacnUniverse != null && p.sacnUniverse == u ? null : t('node.universe.sacn.derived', {'pa': PortEditHelper.portAddressText(u, true)});
      } else {
        hint = t('node.universe.artnet.hint', {'pa': PortEditHelper.portAddressText(u, false)});
      }
    }
    return Card(
      shape: changed ? RoundedRectangleBorder(side: BorderSide(color: scheme.primary), borderRadius: BorderRadius.circular(12)) : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InkWell(
              onTap: () => _openPort(p),
              child: Row(
                children: [
                  Icon(Icons.settings_input_svideo, color: p.rdmEnabled ? scheme.primary : scheme.outline),
                  const SizedBox(width: 8),
                  Text(t('node.port', {'n': p.number}), style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(width: 8),
                  if (p.isInput) Badge2(t('node.port.input')),
                  if (p.dataTransmitted) Badge2(t('node.data'), icon: Icons.bolt),
                  if (p.rdmnetEndpoint != null) Badge2(t('node.info.endpoint', {'n': p.rdmnetEndpoint})),
                  if (changed) Badge2(t('node.changed'), color: scheme.primaryContainer),
                  const Spacer(),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                SizedBox(
                  width: 110,
                  child: TextField(
                    controller: d.universe,
                    enabled: editable,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(labelText: t('node.universe')),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SegmentedButton<PortProtocol>(
                    segments: [
                      ButtonSegment(value: PortProtocol.artnet, label: Text(t('nodes.via.artnet'))),
                      const ButtonSegment(value: PortProtocol.sacn, label: Text('sACN')),
                    ],
                    selected: {d.protocol},
                    showSelectedIcon: false,
                    onSelectionChanged: editable
                        ? (s) => setState(() {
                              final old = d.protocol;
                              d.protocol = s.first;
                              // Keep the same Port-Address when switching: sACN universe = Port-Address + 1.
                              final v = int.tryParse(d.universe.text.trim());
                              if (v != null && old != d.protocol) {
                                d.universe.text = d.protocol == PortProtocol.sacn ? '${v + 1}' : '${(v - 1).clamp(0, 32767)}';
                              }
                            })
                        : null,
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Switch(value: d.rdm, onChanged: editable ? (v) => setState(() => d.rdm = v) : null),
                Text(d.rdm ? t('node.rdm.on') : t('node.rdm.off')),
              ],
            ),
            if (hint != null) Text(hint, style: Theme.of(context).textTheme.bodySmall),
            if (!p.rdmEnabled && !d.rdm) Text(t('node.port.rdmoff.hint'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.error)),
          ],
        ),
      ),
    );
  }
}

class PortEditHelper {
  PortEditHelper._();

  static String portAddressText(int universe, bool sacn) {
    final v = sacn ? universe - 1 : universe;
    if (v < 0 || v > 32767) return '?';
    return '${(v >> 8) & 0x7F}.${(v >> 4) & 0x0F}.${v & 0x0F}';
  }
}
