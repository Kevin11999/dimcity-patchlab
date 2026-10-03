import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Android drops multicast / broadcast packets when the Wi-Fi radio is in
/// power save unless an app holds a WifiManager.MulticastLock. iOS needs the
/// com.apple.developer.networking.multicast entitlement instead (no runtime call).
class MulticastLock {
  MulticastLock._();

  static const _channel = MethodChannel('nl.dimcity.patchlab_rdm/multicast');

  static bool _held = false;
  static bool get held => _held;

  static Future<void> acquire() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _channel.invokeMethod<void>('acquire');
      _held = true;
    } catch (_) {
      // No Android host (tests, other platforms) or the lock was refused: the
      // sockets still work, only power-save multicast filtering may apply.
      _held = false;
    }
  }

  static Future<void> release() async {
    if (!_held) return;
    try {
      await _channel.invokeMethod<void>('release');
    } catch (_) {
      // ignore
    }
    _held = false;
  }
}
