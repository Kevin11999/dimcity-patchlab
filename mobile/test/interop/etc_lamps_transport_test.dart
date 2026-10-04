import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/udp.dart';
import 'package:patchlab_rdm/services/lamp_broker.dart';
import 'package:patchlab_rdm/services/llrp_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';

/// The whole lamp route of the app against ETC's reference RDMnet device, nothing configured: LLRP finds it,
/// it finds our broker with DNS-SD, and the app addresses it through the broker. Off by default:
///   ETC_DEVICE_BIN=`/path/to/rdmnet_device_example` ETC_INTEROP_IP=`local adapter ip` flutter test test/interop/etc_lamps_transport_test.dart
void main() {
  final bin = Platform.environment['ETC_DEVICE_BIN'];
  final ip = Platform.environment['ETC_INTEROP_IP'];

  test('LampsTransport: one lamp, found by LLRP and by the broker, addressed through the broker', () async {
    Future<List<AdapterInfo>> adapters() async => [AdapterInfo('test', ip!)];
    final llrp = LlrpService(socketFactory: RawUdpSocket.open, cid: Cid.random(), controllerUid: const Uid(0x7FF0, 0x0000CCCC), adapters: adapters);
    addTearDown(llrp.close);
    final lb = LampBroker(cid: llrp.cid, controllerUid: llrp.controllerUid, adapters: adapters, socketFactory: RawUdpSocket.open, discovery: null);
    addTearDown(lb.stop);
    final transport = LampsTransport(llrp, broker: lb);
    await lb.ensure();

    final device = await Process.start(bin!, const []);
    addTearDown(device.kill);
    // ignore: unawaited_futures
    device.stdout.drain<void>();
    // ignore: unawaited_futures
    device.stderr.drain<void>();

    // The search the app repeats every few seconds while no lamp is there.
    var uids = <Uid>[];
    for (var i = 0; i < 12 && !(uids.length == 1 && transport.lamps.single.onBroker && transport.lamps.single.llrp != null); i++) {
      uids = await transport.discover();
    }
    // ignore: avoid_print
    print('${lb.report()}\nlamps: ${[for (final l in transport.lamps) '${l.uid} broker=${l.onBroker} llrp=${l.llrp?.uid}']}');
    expect(uids.length, 1);
    final lamp = transport.lamps.single;
    expect(lamp.onBroker, isTrue);
    expect(lamp.llrp, isNotNull, reason: 'the LLRP view of the same lamp (matched by CID)');
    final client = RdmClient(transport, timeout: const Duration(seconds: 3));
    expect(await client.deviceModelDescription(uids.single), 'Prototype RDMnet Device');
    await client.setDeviceLabel(uids.single, 'Through the app');
    expect(await client.deviceLabel(uids.single), 'Through the app');
    // The LLRP UID of the same lamp reaches it, too.
    expect(await client.deviceLabel(lamp.llrp!.uid), 'Through the app');
  }, skip: bin == null || ip == null, timeout: const Timeout(Duration(seconds: 180)));
}
