import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/rdmnet/rpt.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';
import 'package:patchlab_rdm/services/rdmnet_service.dart';

/// Our RDMnet controller against ETC's reference *broker* with ETC's reference *device* behind it. Off by default:
///   rdmnet_broker_example --port=8888 --ifaces=`<adapter>`
///   rdmnet_device_example --broker=`<ip>`:8888
///   ETC_BROKER=`<ip>`:8888 flutter test test/interop/etc_broker_interop_test.dart
void main() {
  final broker = Platform.environment['ETC_BROKER'];

  test('our controller connects to ETC\'s broker, lists the device and sends it RDM through RPT', () async {
    final parts = broker!.split(':');
    final conn = await BrokerConnection.connect(
      host: parts[0],
      port: int.parse(parts[1]),
      cid: Cid.random(),
      uid: const Uid(0x7FF0, 0x00ABCDEF),
    );
    addTearDown(conn.close);
    // ignore: avoid_print
    print('connected: broker UID ${conn.brokerUid}, our UID ${conn.assignedUid}, clients: ${conn.clients}');
    expect(conn.connected, isTrue);
    expect(conn.brokerUid, isNotNull);
    final devices = conn.devices;
    expect(devices, isNotEmpty, reason: 'the broker lists no RPT device');
    final dev = devices.first;
    expect(dev.uid.isDynamic, isTrue, reason: 'ETC\'s device asked the broker for a dynamic UID');

    final client = RdmClient(RdmnetTransport(conn, dev.uid, Rpt.nullEndpoint), timeout: const Duration(seconds: 3));
    final info = await client.deviceInfo(dev.uid);
    // ignore: avoid_print
    print('DEVICE_INFO via RPT: model 0x${info.deviceModelId.toRadixString(16)} footprint ${info.dmxFootprint}');
    expect(await client.deviceModelDescription(dev.uid), 'Prototype RDMnet Device');
    await client.setDeviceLabel(dev.uid, 'Via broker');
    expect(await client.deviceLabel(dev.uid), 'Via broker');
    await client.identify(dev.uid, true);
    expect(await client.identifyState(dev.uid), isTrue);
    await client.identify(dev.uid, false);
  }, skip: broker == null, timeout: const Timeout(Duration(seconds: 60)));
}
