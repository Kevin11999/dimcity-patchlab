import 'dart:io';

/// Gives a network adapter an extra IPv4 address, for lamps on 2.x.x.x / 10.x.x.x: without an address in their range the
/// laptop does not hear their broadcast answers. The operating system asks the user for permission (Windows: the UAC
/// prompt, macOS: the administrator password); nothing happens without it.
class AddAddress {
  AddAddress._();

  /// The command a person would type (as administrator), for the "copy command" button.
  static String command(String adapter, String ip, {String mask = '255.0.0.0', String? os}) {
    os ??= Platform.operatingSystem;
    if (os == 'windows') return 'netsh interface ipv4 add address name="$adapter" address=$ip mask=$mask';
    if (os == 'macos') return 'sudo ifconfig $adapter alias $ip $mask';
    return 'sudo ip addr add $ip/${_prefix(mask)} dev $adapter';
  }

  static int _prefix(String mask) => mask.split('.').fold<int>(0, (n, p) => n + (int.tryParse(p) ?? 0).toRadixString(2).replaceAll('0', '').length);

  /// PowerShell command line that runs netsh elevated (shows the UAC prompt) and waits for it.
  static List<String> windowsArguments(String adapter, String ip, String mask) => [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Start-Process -FilePath netsh -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList 'interface ipv4 add address name=\"$adapter\" address=$ip mask=$mask'",
      ];

  /// AppleScript that runs ifconfig with administrator privileges (shows the password prompt).
  static List<String> macArguments(String adapter, String ip, String mask) => [
        '-e',
        'do shell script "/sbin/ifconfig $adapter alias $ip $mask" with administrator privileges',
      ];

  /// Adapter names come from the operating system but end up in a command: allow only what a name can contain.
  static bool safeName(String name) => RegExp(r'^[\w .\-()#]+$').hasMatch(name);

  /// Adds the address. Returns null when it worked, otherwise a short reason. [run] is for tests.
  static Future<String?> add(String adapter, String ip,
      {String mask = '255.0.0.0', String? os, Future<ProcessResult> Function(String, List<String>)? run}) async {
    os ??= Platform.operatingSystem;
    if (!safeName(adapter)) return 'unsupported adapter name "$adapter"';
    final runner = run ?? (exe, args) => Process.run(exe, args);
    try {
      final ProcessResult r;
      if (os == 'windows') {
        r = await runner('powershell.exe', windowsArguments(adapter, ip, mask));
      } else if (os == 'macos') {
        r = await runner('/usr/bin/osascript', macArguments(adapter, ip, mask));
      } else {
        return 'not supported on this system, run: ${command(adapter, ip, mask: mask, os: os)}';
      }
      if (r.exitCode != 0) return '${r.stderr}'.trim().isEmpty ? 'exit code ${r.exitCode}' : '${r.stderr}'.trim();
      return null;
    } on ProcessException catch (e) {
      return e.message;
    }
  }
}
