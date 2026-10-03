import 'dart:typed_data';

import '../../core/rdm/rdm_constants.dart';
import '../../core/rdm/rdm_packet.dart';
import '../../core/rdm/rdm_params.dart';
import '../../core/uid.dart';

/// A simulated RDM fixture behind a port of the fake node.
class SimFixture {
  SimFixture({
    required this.uid,
    required this.manufacturer,
    required this.model,
    required this.modelId,
    required this.personalities,
    this.label = '',
    this.personality = 1,
    this.address = 1,
    this.software = '1.2.0',
    this.deviceHours = 1234,
    this.lampHours = 567,
    this.temperature = 38,
    bool failSetAddressOnce = false,
    int dropSetAddress = 0,
  }) : dropSetAddress = dropSetAddress > 0 ? dropSetAddress : (failSetAddressOnce ? 1 : 0);

  final Uid uid;
  final String manufacturer;
  final String model;
  final int modelId;
  final List<PersonalityDescription> personalities;
  String label;
  int personality;
  int address;
  String software;
  int deviceHours;
  int lampHours;
  int temperature;
  bool identify = false;
  int resets = 0;

  /// Number of upcoming SET DMX_START_ADDRESS requests that get no answer (demo of the "retry" button).
  int dropSetAddress;

  int get footprint => personalities.firstWhere((p) => p.personality == personality, orElse: () => personalities.first).footprint;
}

/// How a simulated fixture answers one RDM request (null = no answer, as when a packet is lost).
RdmPacket? simRespond(SimFixture f, RdmPacket req, [List<String>? log]) {
  RdmPacket ack(List<int> data, {int cc = Rdm.getCommandResponse}) => RdmPacket(
        destination: req.source,
        source: f.uid,
        transactionNumber: req.transactionNumber,
        portIdOrResponseType: Rdm.responseAck,
        commandClass: cc,
        pid: req.pid,
        data: Uint8List.fromList(data),
      );
  RdmPacket nack(int reason, {int cc = Rdm.getCommandResponse}) => RdmPacket(
        destination: req.source,
        source: f.uid,
        transactionNumber: req.transactionNumber,
        portIdOrResponseType: Rdm.responseNackReason,
        commandClass: cc,
        pid: req.pid,
        data: Uint8List.fromList([reason >> 8, reason & 0xFF]),
      );
  final d = req.data;
  if (req.commandClass == Rdm.getCommand) {
    switch (req.pid) {
      case Pid.deviceInfo:
        return ack(DeviceInfo(
          protocolVersion: 0x0100,
          deviceModelId: f.modelId,
          productCategory: 0x0501,
          softwareVersionId: 0x00010200,
          dmxFootprint: f.footprint,
          currentPersonality: f.personality,
          personalityCount: f.personalities.length,
          dmxStartAddress: f.address,
          subDeviceCount: 0,
          sensorCount: 1,
        ).encode());
      case Pid.deviceModelDescription:
        return ack(f.model.codeUnits);
      case Pid.manufacturerLabel:
        return ack(f.manufacturer.codeUnits);
      case Pid.deviceLabel:
        return ack(f.label.codeUnits);
      case Pid.softwareVersionLabel:
        return ack(f.software.codeUnits);
      case Pid.dmxPersonality:
        return ack([f.personality, f.personalities.length]);
      case Pid.dmxPersonalityDescription:
        final n = d.isEmpty ? 0 : d[0];
        final p = f.personalities.where((p) => p.personality == n).toList();
        return p.isEmpty ? nack(NackReason.dataOutOfRange) : ack(p.first.encode());
      case Pid.dmxStartAddress:
        return ack(RdmData.u16(f.address));
      case Pid.identifyDevice:
        return ack([f.identify ? 1 : 0]);
      case Pid.deviceHours:
        return ack(RdmData.u32(f.deviceHours));
      case Pid.lampHours:
        return ack(RdmData.u32(f.lampHours));
      case Pid.sensorDefinition:
        if (d.isEmpty || d[0] != 0) return nack(NackReason.dataOutOfRange);
        final w = <int>[0, SensorType.temperature, SensorUnit.centigrade, 0, 0xFF, 0xCE, 0, 150, 0, 0, 0, 80, 0, ...'Base'.codeUnits];
        return ack(w);
      case Pid.sensorValue:
        if (d.isEmpty || d[0] != 0) return nack(NackReason.dataOutOfRange);
        return ack([0, ...RdmData.u16(f.temperature), ...RdmData.u16(f.temperature - 10), ...RdmData.u16(f.temperature + 5), 0, 0]);
      case Pid.supportedParameters:
        final pids = [Pid.deviceModelDescription, Pid.manufacturerLabel, Pid.deviceLabel, Pid.softwareVersionLabel, Pid.dmxPersonality, Pid.dmxPersonalityDescription, Pid.deviceHours, Pid.lampHours, Pid.sensorDefinition, Pid.sensorValue, Pid.resetDevice];
        return ack([for (final p in pids) ...RdmData.u16(p)]);
      case Pid.queuedMessage:
        return RdmPacket(destination: req.source, source: f.uid, transactionNumber: req.transactionNumber, portIdOrResponseType: Rdm.responseAck, commandClass: Rdm.getCommandResponse, pid: Pid.statusMessages);
      default:
        return nack(NackReason.unknownPid);
    }
  }
  if (req.commandClass == Rdm.setCommand) {
    switch (req.pid) {
      case Pid.dmxStartAddress:
        if (f.dropSetAddress > 0) {
          f.dropSetAddress--;
          log?.add('dropped SET address for ${f.uid}');
          return null;
        }
        final a = d.length >= 2 ? RdmData.decodeU16(d) : 0;
        if (a < 1 || a + f.footprint - 1 > 512) return nack(NackReason.dataOutOfRange, cc: Rdm.setCommandResponse);
        f.address = a;
        return ack(const [], cc: Rdm.setCommandResponse);
      case Pid.dmxPersonality:
        final n = d.isEmpty ? 0 : d[0];
        if (!f.personalities.any((p) => p.personality == n)) return nack(NackReason.dataOutOfRange, cc: Rdm.setCommandResponse);
        f.personality = n;
        if (f.address + f.footprint - 1 > 512) f.address = 512 - f.footprint + 1;
        return ack(const [], cc: Rdm.setCommandResponse);
      case Pid.deviceLabel:
        f.label = String.fromCharCodes(d).trim();
        return ack(const [], cc: Rdm.setCommandResponse);
      case Pid.identifyDevice:
        f.identify = d.isNotEmpty && d[0] != 0;
        return ack(const [], cc: Rdm.setCommandResponse);
      case Pid.resetDevice:
        f.resets++;
        f.identify = false;
        return ack(const [], cc: Rdm.setCommandResponse);
      default:
        return nack(NackReason.unknownPid, cc: Rdm.setCommandResponse);
    }
  }
  return null;
}
