import '../net/adapters.dart';
import '../services/artnet_service.dart';
import '../services/llrp_service.dart';

enum CheckLevel { ok, warn, bad }

/// One line of the "what does the app see" list on the Lamps tab: a level, a text key and its arguments.
class DiagCheck {
  const DiagCheck(this.level, this.key, [this.args = const {}]);
  final CheckLevel level;
  final String key;
  final Map<String, Object> args;
}

bool _inLampRange(String ip) {
  final first = int.tryParse(ip.split('.').first) ?? 0;
  return first == 2 || first == 10;
}

/// Looks at what the lamp search did and says, in order of importance, what is wrong. Pure: everything it needs is passed in.
List<DiagCheck> diagnoseLamps({
  required List<AdapterInfo> adapters,
  required ArtNetService? artnet,
  required String? artnetError,
  required LlrpService? llrp,
  required int lampsFound,
  required bool demo,
}) {
  if (demo) return const [];
  final out = <DiagCheck>[];
  if (adapters.isEmpty) {
    out.add(const DiagCheck(CheckLevel.bad, 'diag.noadapter'));
  }
  if (artnetError != null) {
    final inUse = RegExp(r'in use|10048|EADDRINUSE|Address already', caseSensitive: false).hasMatch(artnetError);
    out.add(DiagCheck(CheckLevel.bad, inUse ? 'diag.artnet.inuse' : 'diag.artnet.socket', {'e': artnetError}));
  }
  if (artnet != null && artnet.interfaceErrors.isNotEmpty) {
    out.add(DiagCheck(CheckLevel.warn, 'diag.artnet.iface', {'list': artnet.interfaceErrors.entries.map((e) => '${e.key}: ${e.value}').join('; ')}));
  }
  if (artnet != null && artnetError == null && artnet.interfaces != null) {
    final ready = artnet.localAddresses;
    if (ready.isEmpty && artnet.notReady.isNotEmpty) {
      // Adapters are listed but none can be used: usually no cable, no link.
      out.add(DiagCheck(CheckLevel.bad, 'diag.noready', {'list': artnet.notReady.entries.map((e) => '${e.value} ${e.key}').join(', ')}));
    } else if (ready.isNotEmpty) {
      out.add(DiagCheck(CheckLevel.ok, 'diag.ready', {'list': ready.map((a) => '${a.interfaceName.isEmpty ? '' : '${a.interfaceName} '}${a.ip}').join(', ')}));
    }
  }
  for (final s in llrp?.stats ?? const <AdapterStats>[]) {
    if (s.sendFailures > 0) {
      out.add(DiagCheck(CheckLevel.bad, 'diag.send', {'adapter': '${s.info.name} ${s.info.ip}', 'e': s.error ?? ''}));
    }
  }
  if (adapters.isNotEmpty && !adapters.any((a) => _inLampRange(a.ip))) {
    out.add(DiagCheck(CheckLevel.warn, 'diag.range', {'list': adapters.map((a) => a.ip).join(', ')}));
  }
  if (artnet != null && artnetError == null && artnet.pollsSent > 0 && lampsFound == 0) {
    if (artnet.datagramsSeen == 0) {
      out.add(DiagCheck(CheckLevel.bad, 'diag.silent', {'polls': artnet.pollsSent}));
    } else if (artnet.repliesSeen == 0) {
      final kinds = {for (final r in artnet.received) r.what}.join(', ');
      out.add(DiagCheck(CheckLevel.warn, 'diag.noreply', {'n': artnet.datagramsSeen, 'kinds': kinds}));
    }
  }
  if (lampsFound > 0) out.add(DiagCheck(CheckLevel.ok, 'diag.found', {'n': lampsFound}));
  return out;
}
