import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../core/rdm/rdm_params.dart';
import '../l10n/strings.dart';
import '../model/fixture.dart';
import 'theme.dart';
import 'widgets.dart';

/// One fixture: identify, rename, set address and mode, info (hours, temperature, software), reset.
class FixtureScreen extends StatefulWidget {
  const FixtureScreen({super.key, required this.session, required this.fixture});
  final PortSession session;
  final Fixture fixture;

  @override
  State<FixtureScreen> createState() => _FixtureScreenState();
}

class _FixtureScreenState extends State<FixtureScreen> {
  String? _software;
  int? _deviceHours;
  int? _lampHours;
  final List<(SensorDefinition, SensorValue?)> _sensors = <(SensorDefinition, SensorValue?)>[];
  bool _loading = true;
  bool _busy = false;
  String? _error;

  Fixture get f => widget.fixture;

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    final c = widget.session.client;
    if (c == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refresh(f);
      _software = await c.softwareVersionLabel(f.uid);
      _deviceHours = await c.deviceHours(f.uid);
      _lampHours = await c.lampHours(f.uid);
      _sensors.clear();
      for (var i = 0; i < f.info.sensorCount && i < 16; i++) {
        final def = await c.sensorDefinition(f.uid, i);
        if (def == null) continue;
        _sensors.add((def, await c.sensorValue(f.uid, i)));
      }
    } catch (e) {
      _error = describeError(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _run(Future<void> Function() action, {String? done}) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted && done != null) showMessage(context, done);
    } catch (e) {
      if (mounted) showMessage(context, describeError(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _rename() async {
    final v = await promptText(context, title: t('fx.rename'), hint: t('fx.rename.hint'), initial: f.label, maxLength: 32);
    if (v == null) return;
    await _run(() => widget.session.rename(f, v), done: t('fx.saved'));
  }

  Future<void> _setAddress() async {
    final v = await promptText(context, title: t('fx.set.address'), initial: f.hasAddress ? '${f.address}' : '', keyboard: TextInputType.number);
    final a = int.tryParse(v ?? '');
    if (a == null) return;
    if (a < 1 || a > 512) {
      if (mounted) showMessage(context, t('addr.invalid'));
      return;
    }
    await _run(() => widget.session.setAddress(f, a), done: t('fx.saved'));
  }

  Future<void> _setMode() async {
    final chosen = await showDialog<int>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text(t('fx.set.mode')),
        children: [
          for (final p in f.type.personalities)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx, p.personality),
              child: Row(
                children: [
                  Icon(p.personality == f.personality ? Icons.radio_button_checked : Icons.radio_button_off, size: 20, color: p.personality == f.personality ? Pal.amber : Pal.muted),
                  const SizedBox(width: 12),
                  Expanded(child: Text(p.label)),
                  Text(t('mode.channels', {'n': p.footprint}), style: const TextStyle(color: Pal.muted)),
                ],
              ),
            ),
        ],
      ),
    );
    if (chosen == null) return;
    await _run(() => widget.session.setMode(f, chosen), done: t('fx.saved'));
  }

  Future<void> _reset() async {
    final cold = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.restart_alt, color: Pal.red, size: 32),
        title: Text(t('fx.reset')),
        content: Text(t('fx.reset.confirm', {'name': f.displayName})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(t('common.cancel'))),
          OutlinedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(t('fx.reset.cold'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, false), child: Text(t('fx.reset.warm'))),
        ],
      ),
    );
    if (cold == null) return;
    await _run(() => widget.session.reset(f, cold: cold), done: t('fx.reset.done'));
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: widget.session,
        builder: (context, _) {
          final color = Pal.typeColor(widget.session.typeIndex(f.type));
          final temp = _sensors.where((s) => s.$1.isTemperature && s.$2 != null).toList();
          return Scaffold(
            appBar: AppBar(
              title: Text(f.displayName),
              actions: [IconButton(icon: const Icon(Icons.refresh), tooltip: t('fx.refresh'), onPressed: _loading ? null : _loadInfo), const SizedBox(width: 4)],
            ),
            body: ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 24),
              children: [
                Card(
                  color: Color.alphaBlend(color.withValues(alpha: 0.08), Pal.card),
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Row(
                      children: [
                        LampAvatar(color: color, identifying: f.identifying, size: 64),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(f.displayName, style: Theme.of(context).textTheme.titleLarge),
                              Text(f.type.label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Pal.muted)),
                              const SizedBox(height: 4),
                              Text(f.modeLabel, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: color, fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                        AddressBadge(f.hasAddress ? f.address : null, color: color, big: true),
                      ],
                    ),
                  ),
                ),
                Card(
                  child: Column(
                    children: [
                      SwitchListTile(
                        secondary: const Icon(Icons.flashlight_on_outlined),
                        title: Text(t('fx.identify')),
                        value: f.identifying,
                        onChanged: _busy ? null : (v) => _run(() => widget.session.identify(f, v)),
                      ),
                      const Divider(),
                      ListTile(leading: const Icon(Icons.edit_outlined), title: Text(t('fx.rename')), subtitle: Text(f.label.isEmpty ? '-' : f.label), trailing: const Icon(Icons.chevron_right), onTap: _busy ? null : _rename),
                      const Divider(),
                      ListTile(leading: const Icon(Icons.pin_outlined), title: Text(t('fx.set.address')), subtitle: Text(f.hasAddress ? '${f.address}' : t('disc.noaddress')), trailing: const Icon(Icons.chevron_right), onTap: _busy ? null : _setAddress),
                      if (f.type.personalities.isNotEmpty) ...[
                        const Divider(),
                        ListTile(leading: const Icon(Icons.tune), title: Text(t('fx.set.mode')), subtitle: Text(f.modeLabel), trailing: const Icon(Icons.chevron_right), onTap: _busy ? null : _setMode),
                      ],
                    ],
                  ),
                ),
                SectionTitle(t('fx.info')),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        InfoRow(t('fx.uid'), f.uid.toString(), mono: true),
                        InfoRow(t('fx.manufacturer'), f.type.manufacturer.isEmpty ? '-' : f.type.manufacturer),
                        InfoRow(t('fx.model'), f.type.model.isEmpty ? '-' : f.type.model),
                        InfoRow(t('fx.mode'), f.modeLabel),
                        InfoRow(t('fx.address'), f.hasAddress ? '${f.address}' : t('disc.noaddress')),
                        if (_loading) const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: LinearProgressIndicator()),
                        if (!_loading) ...[
                          InfoRow(t('fx.software'), _software ?? t('fx.no.info')),
                          InfoRow(t('fx.hours'), _deviceHours == null ? t('fx.no.info') : t('fx.hours.value', {'h': _deviceHours})),
                          InfoRow(t('fx.lamphours'), _lampHours == null ? t('fx.no.info') : t('fx.hours.value', {'h': _lampHours})),
                          for (final s in temp) InfoRow('${t('fx.temperature')}${s.$1.description.isEmpty ? '' : ' (${s.$1.description})'}', s.$1.format(s.$2!.present)),
                          for (final s in _sensors.where((s) => !s.$1.isTemperature && s.$2 != null))
                            InfoRow(s.$1.description.isEmpty ? '${t('fx.sensors')} ${s.$1.sensor}' : s.$1.description, s.$1.format(s.$2!.present)),
                          if (_sensors.isEmpty && f.info.sensorCount == 0) InfoRow(t('fx.temperature'), t('fx.no.info')),
                        ],
                        if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Pal.red))),
                      ],
                    ),
                  ),
                ),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.restart_alt, color: Pal.red),
                    title: Text(t('fx.reset'), style: const TextStyle(color: Pal.red, fontWeight: FontWeight.w600)),
                    onTap: _busy ? null : _reset,
                  ),
                ),
              ],
            ),
          );
        },
      );
}
