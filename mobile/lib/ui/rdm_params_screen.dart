import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app/port_session.dart';
import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_params.dart';
import '../l10n/strings.dart';
import '../model/fixture.dart';
import '../services/rdm_client.dart';
import 'theme.dart';
import 'widgets.dart';

class _Param {
  _Param(this.pid, this.description, this.value);
  final int pid;
  final ParameterDescription? description;
  Uint8List? value;
}

/// What the lamp says about itself over RDM: the parameters it supports, and its own (manufacturer) settings with their
/// current values. Settings of the manufacturer (PID 0x8000-0xFFDF) are described by the lamp, so they show up by name and
/// can be set when the lamp says they are writable.
class RdmParamsScreen extends StatefulWidget {
  const RdmParamsScreen({super.key, required this.session, required this.fixture});
  final PortSession session;
  final Fixture fixture;

  @override
  State<RdmParamsScreen> createState() => _RdmParamsScreenState();
}

class _RdmParamsScreenState extends State<RdmParamsScreen> {
  bool _loading = true;
  String? _error;
  List<int> _standard = const [];
  final List<_Param> _own = <_Param>[];

  static bool _isManufacturer(int pid) => pid >= 0x8000 && pid <= 0xFFDF;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final c = widget.session.client;
    if (c == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final uid = widget.fixture.uid;
      final supported = await c.supportedParameters(uid);
      _standard = supported.where((p) => !_isManufacturer(p)).toList()..sort();
      _own.clear();
      for (final pid in supported.where(_isManufacturer)) {
        final desc = await c.parameterDescription(uid, pid);
        Uint8List? value;
        if (desc == null || desc.canGet) {
          try {
            value = await c.tryGet(uid, pid);
          } on RdmException {
            value = null;
          }
        }
        _own.add(_Param(pid, desc, value));
      }
    } catch (e) {
      _error = describeError(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  String _pid(int pid) => '0x${pid.toRadixString(16).padLeft(4, '0').toUpperCase()}';

  String _access(ParameterDescription? d) {
    if (d == null) return '';
    if (d.canGet && d.canSet) return t('params.writable');
    return d.canSet ? t('params.writeonly') : t('params.readonly');
  }

  Future<void> _edit(_Param p) async {
    final d = p.description;
    final c = widget.session.client;
    if (d == null || c == null || !d.canSet || !(d.isNumber || d.isText)) return;
    final current = p.value == null ? '' : d.format(p.value!);
    final v = await promptText(
      context,
      title: d.description.isEmpty ? t('params.nodescription', {'pid': _pid(p.pid)}) : d.description,
      hint: d.hasRange ? t('params.range', {'min': d.min, 'max': d.max}) : d.typeName,
      initial: current,
      keyboard: d.isNumber ? const TextInputType.numberWithOptions(signed: true) : TextInputType.text,
      maxLength: d.isText ? (d.pdlSize > 0 ? d.pdlSize : 32) : null,
    );
    if (v == null) return;
    Uint8List? data;
    if (d.isText) {
      data = Uint8List.fromList(v.codeUnits.where((u) => u >= 0x20 && u <= 0x7E).toList());
    } else {
      final n = int.tryParse(v.trim());
      data = n == null ? null : d.encode(n);
    }
    if (data == null) {
      if (mounted) showMessage(context, t('params.invalid', {'type': d.typeName}));
      return;
    }
    try {
      await c.set(widget.fixture.uid, p.pid, data);
      p.value = await c.tryGet(widget.fixture.uid, p.pid);
      if (mounted) {
        setState(() {});
        showMessage(context, t('params.saved', {'v': p.value == null ? '-' : d.format(p.value!)}));
      }
    } catch (e) {
      if (mounted) showMessage(context, describeError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final network = _standard.where((p) => p >= Pid.listInterfaces && p <= Pid.dnsDomainName).toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(t('params.title')),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _load), const SizedBox(width: 4)],
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 4, bottom: 24),
        children: [
          if (_loading) const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
          if (_error != null) NoticeCard(_error!, icon: Icons.error_outline, iconColor: Pal.red),
          if (!_loading && _error == null) ...[
            SectionTitle(t('params.manufacturer')),
            if (_own.isEmpty) NoticeCard(t('params.none')),
            for (final p in _own)
              Card(
                child: ListTile(
                  title: Text(p.description == null || p.description!.description.isEmpty ? t('params.nodescription', {'pid': _pid(p.pid)}) : p.description!.description),
                  subtitle: Text([_pid(p.pid), if (p.description != null) p.description!.typeName, _access(p.description)].where((e) => e.isNotEmpty).join(' · ')),
                  trailing: Text(
                    p.value == null ? '-' : (p.description?.format(p.value!) ?? p.value!.map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ').toUpperCase()),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  onTap: p.description?.canSet == true ? () => _edit(p) : null,
                ),
              ),
            if (network.isNotEmpty) NoticeCard(t('params.network', {'names': network.map(Pid.name).join(', ')}), icon: Icons.lan_outlined, iconColor: Pal.amber),
            SectionTitle(t('params.supported')),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [for (final p in _standard) Chip(label: Text(Pid.name(p), style: const TextStyle(fontSize: 12)), visualDensity: VisualDensity.compact)],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
