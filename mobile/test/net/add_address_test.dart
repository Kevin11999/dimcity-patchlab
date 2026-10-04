import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/net/add_address.dart';

void main() {
  test('the commands for Windows, macOS and Linux', () {
    expect(AddAddress.command('Ethernet', '2.0.0.100', os: 'windows'), 'netsh interface ipv4 add address name="Ethernet" address=2.0.0.100 mask=255.0.0.0');
    expect(AddAddress.command('en7', '2.0.0.100', os: 'macos'), 'sudo ifconfig en7 alias 2.0.0.100 255.0.0.0');
    expect(AddAddress.command('eth0', '2.0.0.100', os: 'linux'), 'sudo ip addr add 2.0.0.100/8 dev eth0');
    expect(AddAddress.command('eth0', '10.1.1.9', mask: '255.255.0.0', os: 'linux'), 'sudo ip addr add 10.1.1.9/16 dev eth0');
  });

  test('Windows runs netsh elevated through PowerShell, the name with a space stays in one piece', () async {
    String? exe;
    List<String>? args;
    final r = await AddAddress.add('Ethernet 2', '2.0.0.100', os: 'windows', run: (e, a) async {
      exe = e;
      args = a;
      return ProcessResult(1, 0, '', '');
    });
    expect(r, isNull);
    expect(exe, 'powershell.exe');
    expect(args!.last, contains('-Verb RunAs'));
    expect(args!.last, contains('name="Ethernet 2" address=2.0.0.100 mask=255.0.0.0'));
  });

  test('macOS asks for the administrator password with AppleScript', () async {
    List<String>? args;
    final r = await AddAddress.add('en7', '2.0.0.100', os: 'macos', run: (e, a) async {
      args = a;
      return ProcessResult(1, 0, '', '');
    });
    expect(r, isNull);
    expect(args, ['-e', 'do shell script "/sbin/ifconfig en7 alias 2.0.0.100 255.0.0.0" with administrator privileges']);
  });

  test('a refused or failing command gives a reason; odd adapter names never reach a command', () async {
    final denied = await AddAddress.add('Ethernet', '2.0.0.100', os: 'windows', run: (e, a) async => ProcessResult(1, 1, '', 'The operation was canceled by the user.'));
    expect(denied, contains('canceled'));
    final silent = await AddAddress.add('en7', '2.0.0.100', os: 'macos', run: (e, a) async => ProcessResult(1, 5, '', ''));
    expect(silent, 'exit code 5');
    var ran = false;
    final bad = await AddAddress.add('x"; rm -rf /', '2.0.0.100', os: 'windows', run: (e, a) async {
      ran = true;
      return ProcessResult(1, 0, '', '');
    });
    expect(bad, contains('unsupported'));
    expect(ran, isFalse);
    expect(await AddAddress.add('eth0', '2.0.0.100', os: 'linux'), contains('sudo ip addr add'));
    expect(AddAddress.safeName('Ethernet 2'), isTrue);
    expect(AddAddress.safeName('Wi-Fi'), isTrue);
    expect(AddAddress.safeName('Ethernet (USB) #3'), isTrue);
  });
}
