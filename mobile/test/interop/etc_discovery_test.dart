import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/rdmnet/rpt.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/udp.dart';
import 'package:patchlab_rdm/services/lamp_broker.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/rdmnet_service.dart';

/// ETC's reference RDMnet device given NO broker address: it has to find our broker through DNS-SD by itself.
/// Off by default:
///   ETC_DEVICE_BIN=`/path/to/rdmnet_device_example` ETC_INTEROP_IP=`local adapter ip` flutter test test/interop/etc_discovery_test.dart
void main() {
  final bin = Platform.environment['ETC_DEVICE_BIN'];
  final ip = Platform.environment['ETC_INTEROP_IP'];

  test('the device finds our broker with mDNS and the app controls it, with nothing configured', () async {
    final lb = LampBroker(
      cid: Cid.random(),
      controllerUid: const Uid(0x7FF0, 0x0000BBBB),
      adapters: () async => [AdapterInfo('test', ip!)],
      socketFactory: RawUdpSocket.open,
      discovery: null, // nobody else's broker to look for: be the broker
    );
    addTearDown(lb.stop);
    await lb.ensure();
    // ignore: avoid_print
    print('broker: ${lb.mode} ${lb.status}');
    expect(lb.mode, 'own');
    expect(lb.connected, isTrue);

    final appeared = Completer<void>();
    final sub = lb.connection!.clientsChanged.listen((_) {
      if (lb.lamps.isNotEmpty && !appeared.isCompleted) appeared.complete();
    });
    addTearDown(sub.cancel);

    // No --broker argument: the device must discover the broker itself.
    final device = await Process.start(bin!, const []);
    addTearDown(device.kill);
    // ignore: unawaited_futures
    device.stdout.drain<void>();
    // ignore: unawaited_futures
    device.stderr.drain<void>();
    await appeared.future.timeout(const Duration(seconds: 40), onTimeout: () => fail('the device did not find our broker.\n${lb.report()}'));
    // ignore: avoid_print
    print(lb.report());
    final dev = lb.lamps.single;
    final client = RdmClient(RdmnetTransport(lb.connection!, dev.uid, Rpt.nullEndpoint), timeout: const Duration(seconds: 3));
    expect(await client.deviceModelDescription(dev.uid), 'Prototype RDMnet Device');
    await client.setDeviceLabel(dev.uid, 'Found by mDNS');
    expect(await client.deviceLabel(dev.uid), 'Found by mDNS');
  }, skip: bin == null || ip == null, timeout: const Timeout(Duration(seconds: 120)));
}
