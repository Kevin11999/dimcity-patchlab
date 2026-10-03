import 'dart:async';
import 'dart:typed_data';

import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/rdm/rdm_params.dart';
import '../core/uid.dart';

/// One way to reach the fixtures on a DMX line: RDM over Art-Net (ArtRdm),
/// RDMnet (RPT through a broker) or the simulation. The client above it does
/// not know the difference.
abstract class RdmTransport {
  /// 'Art-Net', 'RDMnet' or 'Demo' – shown in the UI as a small badge only.
  String get routeName;

  Uid get controllerUid;

  /// Sends one request and returns the first matching response.
  /// Throws [RdmTimeoutException] when nothing comes back.
  Future<RdmPacket> exchange(RdmPacket request, {Duration timeout});

  /// Runs / collects RDM discovery for this line and returns the UIDs found.
  Future<List<Uid>> discover({bool flush = true, Duration timeout});
}

class RdmException implements Exception {
  RdmException(this.message);
  final String message;
  @override
  String toString() => message;
}

class RdmTimeoutException extends RdmException {
  RdmTimeoutException([super.message = 'No RDM response']);
}

class RdmNackException extends RdmException {
  RdmNackException(this.pid, this.reason) : super('${Pid.name(pid)}: ${NackReason.describe(reason)}');
  final int pid;
  final int reason;
}

/// Typed RDM GET / SET on top of a transport, with retries and the E1.20
/// response flow: ACK_TIMER (poll QUEUED_MESSAGE later), ACK_OVERFLOW
/// (repeat the GET and glue the data) and NACK (exception).
class RdmClient {
  RdmClient(this.transport, {this.retries = 2, this.timeout = const Duration(milliseconds: 1500)});

  final RdmTransport transport;
  final int retries;
  final Duration timeout;

  int _transaction = 0;

  int nextTransaction() => _transaction = (_transaction + 1) & 0xFF;

  Uid get controllerUid => transport.controllerUid;

  RdmPacket _packet(Uid dest, int cc, int pid, Uint8List data) => RdmPacket(
        destination: dest,
        source: controllerUid,
        transactionNumber: nextTransaction(),
        portIdOrResponseType: 1,
        commandClass: cc,
        pid: pid,
        data: data,
      );

  Future<RdmPacket> _exchangeWithRetry(RdmPacket p) async {
    RdmTimeoutException? last;
    for (var attempt = 0; attempt <= retries; attempt++) {
      try {
        return await transport.exchange(
          attempt == 0 ? p : p.copyWith(transactionNumber: nextTransaction()),
          timeout: timeout,
        );
      } on RdmTimeoutException catch (e) {
        last = e;
      }
    }
    throw last ?? RdmTimeoutException();
  }

  /// Handles ACK_TIMER by polling QUEUED_MESSAGE until the real answer arrives.
  Future<RdmPacket> _resolveTimer(Uid dest, int pid, RdmPacket response) async {
    var r = response;
    for (var i = 0; i < 6 && r.isAckTimer; i++) {
      var wait = r.ackTimer ?? const Duration(milliseconds: 200);
      if (wait < const Duration(milliseconds: 100)) wait = const Duration(milliseconds: 100);
      if (wait > const Duration(seconds: 10)) wait = const Duration(seconds: 10);
      await Future<void>.delayed(wait);
      r = await _exchangeWithRetry(_packet(dest, Rdm.getCommand, Pid.queuedMessage, RdmData.queuedMessage(Rdm.statusAdvisory)));
      // A STATUS_MESSAGES answer means "nothing queued yet": ask again.
      if (r.pid == Pid.statusMessages && !r.isAckTimer) {
        r = RdmPacket(
          destination: r.destination,
          source: r.source,
          transactionNumber: r.transactionNumber,
          portIdOrResponseType: Rdm.responseAckTimer,
          commandClass: r.commandClass,
          pid: pid,
          data: Uint8List.fromList([0, 2]),
        );
      }
    }
    return r;
  }

  /// GET [pid]; returns the (reassembled) parameter data.
  Future<Uint8List> get(Uid dest, int pid, {Uint8List? data}) async {
    final out = <int>[];
    for (var part = 0; part < 64; part++) {
      var r = await _exchangeWithRetry(_packet(dest, Rdm.getCommand, pid, data ?? Uint8List(0)));
      r = await _resolveTimer(dest, pid, r);
      if (r.isNack) throw RdmNackException(pid, r.nackReason ?? 0);
      if (r.isAckOverflow) {
        out.addAll(r.data);
        continue;
      }
      if (r.isAck) {
        out.addAll(r.data);
        return Uint8List.fromList(out);
      }
      throw RdmException('Unexpected response type ${r.responseType} for ${Pid.name(pid)}');
    }
    throw RdmException('ACK_OVERFLOW never ended for ${Pid.name(pid)}');
  }

  /// GET that returns null when the device NACKs (unsupported / optional PID).
  Future<Uint8List?> tryGet(Uid dest, int pid, {Uint8List? data}) async {
    try {
      return await get(dest, pid, data: data);
    } on RdmNackException {
      return null;
    }
  }

  /// SET [pid]; returns normally on ACK.
  Future<void> set(Uid dest, int pid, Uint8List data) async {
    var r = await _exchangeWithRetry(_packet(dest, Rdm.setCommand, pid, data));
    r = await _resolveTimer(dest, pid, r);
    if (r.isNack) throw RdmNackException(pid, r.nackReason ?? 0);
    if (!r.isAck) throw RdmException('Unexpected response type ${r.responseType} for SET ${Pid.name(pid)}');
  }

  // --- typed helpers -------------------------------------------------------

  Future<DeviceInfo> deviceInfo(Uid uid) async => DeviceInfo.decode(await get(uid, Pid.deviceInfo));

  Future<String> deviceModelDescription(Uid uid) async =>
      RdmData.decodeString((await tryGet(uid, Pid.deviceModelDescription)) ?? Uint8List(0));

  Future<String> manufacturerLabel(Uid uid) async =>
      RdmData.decodeString((await tryGet(uid, Pid.manufacturerLabel)) ?? Uint8List(0));

  Future<String> deviceLabel(Uid uid) async =>
      RdmData.decodeString((await tryGet(uid, Pid.deviceLabel)) ?? Uint8List(0));

  Future<void> setDeviceLabel(Uid uid, String label) => set(uid, Pid.deviceLabel, RdmData.label(label));

  Future<String?> softwareVersionLabel(Uid uid) async {
    final d = await tryGet(uid, Pid.softwareVersionLabel);
    return d == null ? null : RdmData.decodeString(d);
  }

  Future<PersonalityDescription> personalityDescription(Uid uid, int personality) async =>
      PersonalityDescription.decode(await get(uid, Pid.dmxPersonalityDescription, data: RdmData.u8(personality)));

  /// All personalities 1..[count]; a personality that fails to read is skipped.
  Future<List<PersonalityDescription>> personalities(Uid uid, int count) async {
    final out = <PersonalityDescription>[];
    for (var i = 1; i <= count && i <= 255; i++) {
      try {
        out.add(await personalityDescription(uid, i));
      } on RdmNackException {
        // skip
      }
    }
    return out;
  }

  Future<PersonalityState> personality(Uid uid) async => PersonalityState.decode(await get(uid, Pid.dmxPersonality));

  Future<void> setPersonality(Uid uid, int personality) => set(uid, Pid.dmxPersonality, RdmData.personality(personality));

  Future<int> startAddress(Uid uid) async => RdmData.decodeU16(await get(uid, Pid.dmxStartAddress));

  Future<void> setStartAddress(Uid uid, int address) => set(uid, Pid.dmxStartAddress, RdmData.startAddress(address));

  Future<void> identify(Uid uid, bool on) => set(uid, Pid.identifyDevice, RdmData.identify(on));

  Future<bool> identifyState(Uid uid) async => RdmData.decodeBool(await get(uid, Pid.identifyDevice));

  Future<void> reset(Uid uid, {bool cold = false}) => set(uid, Pid.resetDevice, RdmData.reset(cold: cold));

  Future<int?> deviceHours(Uid uid) async {
    final d = await tryGet(uid, Pid.deviceHours);
    return d == null || d.length < 4 ? null : RdmData.decodeU32(d);
  }

  Future<int?> lampHours(Uid uid) async {
    final d = await tryGet(uid, Pid.lampHours);
    return d == null || d.length < 4 ? null : RdmData.decodeU32(d);
  }

  Future<SensorDefinition?> sensorDefinition(Uid uid, int sensor) async {
    final d = await tryGet(uid, Pid.sensorDefinition, data: RdmData.u8(sensor));
    return d == null ? null : SensorDefinition.decode(d);
  }

  Future<SensorValue?> sensorValue(Uid uid, int sensor) async {
    final d = await tryGet(uid, Pid.sensorValue, data: RdmData.u8(sensor));
    return d == null ? null : SensorValue.decode(d);
  }

  Future<List<int>> supportedParameters(Uid uid) async =>
      RdmData.decodeU16List((await tryGet(uid, Pid.supportedParameters)) ?? Uint8List(0));

  // --- E1.37-7 / E1.33 (gateway endpoints, over RDMnet) --------------------

  Future<EndpointList> endpointList(Uid gateway) async => EndpointList.decode(await get(gateway, Pid.endpointList));

  Future<EndpointResponders> endpointResponders(Uid gateway, int endpoint) async =>
      EndpointResponders.decode(await get(gateway, Pid.endpointResponders, data: RdmData.u16(endpoint)));

  Future<EndpointUniverse?> endpointToUniverse(Uid gateway, int endpoint) async {
    final d = await tryGet(gateway, Pid.endpointToUniverse, data: RdmData.u16(endpoint));
    return d == null || d.length < 4 ? null : EndpointUniverse.decode(d);
  }

  Future<ComponentScope?> componentScope(Uid component, {int slot = 1}) async {
    final d = await tryGet(component, Pid.componentScope, data: ComponentScope.request(slot));
    return d == null ? null : ComponentScope.decode(d);
  }
}
