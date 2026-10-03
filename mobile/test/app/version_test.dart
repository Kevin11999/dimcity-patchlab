import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/app/version.dart';

void main() {
  test('appVersion equals the version in pubspec.yaml', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final m = RegExp(r'^version:\s*([0-9]+\.[0-9]+\.[0-9]+)', multiLine: true).firstMatch(pubspec);
    expect(m, isNotNull);
    expect(appVersion, m!.group(1));
  });
}
