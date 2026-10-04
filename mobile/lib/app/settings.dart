import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/rdmnet/acn.dart';
import '../core/uid.dart';
import '../l10n/strings.dart';

/// Persistent app settings. The controller UID and CID are generated once and
/// kept, so nodes and brokers see the same controller every time.
class Settings extends ChangeNotifier {
  Settings._(this._prefs);

  static Future<Settings> load() async {
    final prefs = await SharedPreferences.getInstance();
    final s = Settings._(prefs);
    s._language = prefs.getString('language') ?? 'nl';
    s._demoMode = prefs.getBool('demoMode') ?? false;
    s._rdmnetScope = prefs.getString('rdmnetScope') ?? 'default';
    s._manualBroker = prefs.getString('manualBroker') ?? '';
    s._extraBroadcast = prefs.getString('extraBroadcast') ?? '';
    s._lampsAdapter = prefs.getString('lampsAdapter') ?? '';
    final uid = Uid.tryParse(prefs.getString('controllerUid') ?? '');
    if (uid == null) {
      s._uid = Uid.randomPrototype();
      await prefs.setString('controllerUid', s._uid.toString());
    } else {
      s._uid = uid;
    }
    final cidText = prefs.getString('controllerCid');
    try {
      s._cid = cidText == null ? Cid.random() : Cid.parse(cidText);
    } on FormatException {
      s._cid = Cid.random();
    }
    if (cidText == null) await prefs.setString('controllerCid', s._cid.toString());
    L10n.language.value = s._language;
    return s;
  }

  /// In-memory settings for tests.
  static Settings memory({bool demoMode = false}) {
    final s = Settings._(null);
    s._demoMode = demoMode;
    s._uid = Uid.randomPrototype();
    s._cid = Cid.random();
    return s;
  }

  final SharedPreferences? _prefs;

  String _language = 'nl';
  bool _demoMode = false;
  String _rdmnetScope = 'default';
  String _manualBroker = '';
  String _extraBroadcast = '';
  String _lampsAdapter = '';
  late Uid _uid;
  late Cid _cid;

  String get language => _language;
  bool get demoMode => _demoMode;
  String get rdmnetScope => _rdmnetScope;
  String get manualBroker => _manualBroker;
  String get extraBroadcast => _extraBroadcast;

  /// Name of the network adapter the lamp search is limited to; empty = all adapters.
  String get lampsAdapter => _lampsAdapter;
  Uid get controllerUid => _uid;
  Cid get cid => _cid;

  set language(String v) {
    _language = v;
    L10n.language.value = v;
    _prefs?.setString('language', v);
    notifyListeners();
  }

  set demoMode(bool v) {
    _demoMode = v;
    _prefs?.setBool('demoMode', v);
    notifyListeners();
  }

  set rdmnetScope(String v) {
    _rdmnetScope = v.trim().isEmpty ? 'default' : v.trim();
    _prefs?.setString('rdmnetScope', _rdmnetScope);
    notifyListeners();
  }

  set manualBroker(String v) {
    _manualBroker = v.trim();
    _prefs?.setString('manualBroker', _manualBroker);
    notifyListeners();
  }

  set lampsAdapter(String v) {
    _lampsAdapter = v;
    _prefs?.setString('lampsAdapter', v);
    notifyListeners();
  }

  set extraBroadcast(String v) {
    _extraBroadcast = v.trim();
    _prefs?.setString('extraBroadcast', _extraBroadcast);
    notifyListeners();
  }

  /// "ip:port" of the manual broker, when valid.
  (String, int)? get manualBrokerAddress {
    final m = RegExp(r'^\s*([0-9.]+|[A-Za-z0-9.-]+)\s*:\s*(\d{1,5})\s*$').firstMatch(_manualBroker);
    if (m == null) return null;
    return (m.group(1)!, int.parse(m.group(2)!));
  }
}
