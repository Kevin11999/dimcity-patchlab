import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:patchlab_rdm/core/rdm/rdm_constants.dart';
import 'package:patchlab_rdm/core/rdmnet/acn.dart';
import 'package:patchlab_rdm/core/uid.dart';
import 'package:patchlab_rdm/net/adapters.dart';
import 'package:patchlab_rdm/net/udp.dart';
import 'package:patchlab_rdm/services/llrp_service.dart';
import 'package:patchlab_rdm/services/rdm_client.dart';

/// Interop with ETC's reference implementation (github.com/ETCLabs/RDMnet), on real UDP sockets.
/// Off by default. To run it, build ETC's `rdmnet_device_example`, start it, then:
///   ETC_INTEROP_IP=`<address of a local multicast-capable adapter>` flutter test test/interop
void main() {
  final ip = Platform.environment['ETC_INTEROP_IP'];

  test('our LLRP manager finds ETC\'s RDMnet device and talks RDM to it', () async {
    final llrp = LlrpService(
      socketFactory: RawUdpSocket.open,
      cid: Cid.random(),
      controllerUid: const Uid(0x7FF0, 0x00C0FFEE),
      adapters: () async => [AdapterInfo('test', ip!)],
    );
    addTearDown(llrp.close);
    final found = await llrp.probe();
    // ignore: avoid_print
    print('found: ${found.map((d) => '${d.uid} ${d.cid} type=${d.componentType} ip=${d.ip} mac=${d.hardwareAddress}').toList()}  probes=${llrp.probesSent} replies=${llrp.repliesSeen}');
    expect(found, isNotEmpty, reason: 'no LLRP reply from the reference device');
    final dev = found.firstWhere((d) => d.isDevice);
    final client = RdmClient(LampsTransport(llrp), timeout: const Duration(seconds: 2));
    final info = await client.deviceInfo(dev.uid);
    // ignore: avoid_print
    print('DEVICE_INFO: model=0x${info.deviceModelId.toRadixString(16)} footprint=${info.dmxFootprint} personalities=${info.personalityCount} address=${info.dmxStartAddress} sensors=${info.sensorCount}');
    // ignore: avoid_print
    print('model="${await client.deviceModelDescription(dev.uid)}" manufacturer="${await client.manufacturerLabel(dev.uid)}" label="${await client.deviceLabel(dev.uid)}"');
    await client.setDeviceLabel(dev.uid, 'Interop test');
    expect(await client.deviceLabel(dev.uid), 'Interop test');
    await client.identify(dev.uid, true);
    expect(await client.identifyState(dev.uid), isTrue);
    await client.identify(dev.uid, false);
    expect(Pid.name(Pid.identifyDevice), 'IDENTIFY_DEVICE');
    // E1.33: the device names its scope.
    final scope = await client.componentScope(dev.uid);
    // ignore: avoid_print
    print('scope: ${scope?.scope} static=${scope?.staticIpv4}');
    expect(scope, isNotNull);
    expect(scope!.scope, 'default');
    // DMX parameters over LLRP: does the reference device answer them?
    final addr = await client.tryGet(dev.uid, Pid.dmxStartAddress);
    // ignore: avoid_print
    print('DMX_START_ADDRESS over LLRP: ${addr ?? 'NACK'}');
  }, skip: ip == null, timeout: const Timeout(Duration(seconds: 90)));
}
