import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/rdmnet/rpt.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/services/broker_server.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/rdmnet_service.dart';

/// ETC's reference RDMnet *device* connecting to OUR broker, with OUR controller talking to it through that broker.
/// Off by default:
///   ETC_DEVICE_BIN=`/path/to/rdmnet_device_example` ETC_INTEROP_IP=`<local adapter ip>` flutter test test/interop/etc_device_on_our_broker_test.dart
void main() {
  final bin = Platform.environment['ETC_DEVICE_BIN'];
  final ip = Platform.environment['ETC_INTEROP_IP'];

  test('ETC\'s device joins our broker, our controller controls it, add and remove are announced', () async {
    final broker = BrokerServer(cid: Cid.random());
    final port = await broker.start();
    addTearDown(broker.stop);

    final conn = await BrokerConnection.connect(host: '127.0.0.1', port: port, cid: Cid.random(), uid: const Uid(0x7FF0, 0x0000AAAA));
    addTearDown(conn.close);
    expect(conn.assignedUid, const Uid(0x7FF0, 0x0000AAAA));
    expect(conn.brokerUid, broker.uid);
    expect(conn.devices, isEmpty);

    final appeared = Completer<void>();
    final sub = conn.clientsChanged.listen((_) {
      if (conn.devices.isNotEmpty && !appeared.isCompleted) appeared.complete();
    });
    addTearDown(sub.cancel);

    final device = await Process.start(bin!, ['--broker=$ip:$port']);
    addTearDown(device.kill);
    // ignore: unawaited_futures
    device.stdout.drain<void>();
    // ignore: unawaited_futures
    device.stderr.drain<void>();
    await appeared.future.timeout(const Duration(seconds: 20), onTimeout: () => fail('the device never showed up in the client list: ${broker.log}'));
    final dev = conn.devices.single;
    // ignore: avoid_print
    print('device joined: ${dev.uid} (dynamic: ${dev.uid.isDynamic}); broker log: ${broker.log}');
    expect(dev.uid.isDynamic, isTrue);
    expect(dev.uid.manufacturerId, broker.uid.manufacturerId, reason: 'dynamic UIDs come from the broker\'s own range');

    final client = RdmClient(RdmnetTransport(conn, dev.uid, Rpt.nullEndpoint), timeout: const Duration(seconds: 3));
    expect(await client.deviceModelDescription(dev.uid), 'Prototype RDMnet Device');
    await client.setDeviceLabel(dev.uid, 'Via our broker');
    expect(await client.deviceLabel(dev.uid), 'Via our broker');
    await client.identify(dev.uid, true);
    expect(await client.identifyState(dev.uid), isTrue);
    await client.identify(dev.uid, false);

    // A request to a UID nobody has: the broker answers with an RPT Status.
    final nobody = RdmClient(RdmnetTransport(conn, const Uid(0x7FF0, 0x0000FFF1), Rpt.nullEndpoint), timeout: const Duration(seconds: 3), retries: 0);
    await expectLater(nobody.deviceInfo(const Uid(0x7FF0, 0x0000FFF1)), throwsA(isA<RdmException>().having((e) => e.message, 'message', contains('Unknown RPT UID'))));

    // The device leaves: the broker tells the controller.
    final gone = Completer<void>();
    final sub2 = conn.clientsChanged.listen((_) {
      if (conn.devices.isEmpty && !gone.isCompleted) gone.complete();
    });
    addTearDown(sub2.cancel);
    device.kill();
    await gone.future.timeout(const Duration(seconds: 20), onTimeout: () => fail('the broker never reported the device as gone'));
    expect(broker.devices, isEmpty);
  }, skip: bin == null || ip == null, timeout: const Timeout(Duration(seconds: 120)));
}
