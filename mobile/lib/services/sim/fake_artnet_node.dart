import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import '../../core/artnet/artnet.dart';
import '../../core/rdm/rdm_constants.dart';
import '../../core/rdm/rdm_packet.dart';
import '../../core/rdm/rdm_params.dart';
import '../../core/uid.dart';
import '../../net/udp.dart';

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
    this.failSetAddressOnce = false,
  });

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

  /// Demo of the "retry" button: the first SET DMX_START_ADDRESS is dropped.
  bool failSetAddressOnce;

  int get footprint => personalities.firstWhere((p) => p.personality == personality, orElse: () => personalities.first).footprint;
}

class SimPort {
  SimPort({required this.number, required this.address, this.sacn = false, this.rdmEnabled = true, List<SimFixture>? fixtures})
      : fixtures = fixtures ?? <SimFixture>[];

  final int number;
  PortAddress address;
  bool sacn;
  bool rdmEnabled;
  final List<SimFixture> fixtures;
}

/// A fake Art-Net 4 node with RDM, talking real UDP on the loopback interface.
/// Used by the service tests and by the app's demo mode.
class FakeArtNetNode {
  FakeArtNetNode({
    required this.shortName,
    required this.longName,
    required this.ports,
    this.ip = const [127, 0, 0, 1],
    this.mac = const [0x02, 0x00, 0x00, 0xDE, 0x4D, 0x01],
    this.discoveryDelay = const Duration(milliseconds: 800),
    this.dropRate = 0.0,
    Random? random,
  }) : _random = random ?? Random(1);

  String shortName;
  String longName;
  final List<SimPort> ports;
  final List<int> ip;
  final List<int> mac;
  final Duration discoveryDelay;

  /// Fraction of RDM requests that get no answer (tests the retries).
  double dropRate;
  final Random _random;

  UdpSocket? _socket;
  StreamSubscription<Datagram>? _sub;
  DateTime? _discoveringUntil;
  final List<String> log = <String>[];

  int get port => _socket?.port ?? 0;

  Future<void> start({int port = 6455}) async {
    final s = await RawUdpSocket.bind(port, reusePort: false, broadcast: false);
    _socket = s;
    _sub = s.datagrams.listen(_onDatagram);
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _socket?.close();
    _socket = null;
  }

  void _reply(Datagram from, Uint8List data) => _socket?.send(data, from.address, from.port);

  void _onDatagram(Datagram d) {
    final op = ArtNet.opcodeOf(d.data);
    if (op == null) return;
    switch (op) {
      case ArtNet.opPoll:
        log.add('poll');
        for (final page in _pollReplies()) {
          _reply(d, page);
        }
      case ArtNet.opAddress:
        _applyAddress(d.data);
        final page = d.data[13] == 0 ? 1 : d.data[13];
        final replies = _pollReplies();
        if (page - 1 < replies.length) _reply(d, replies[page - 1]);
      case ArtNet.opTodControl:
        if (d.data[22] == ArtTodControl.flush) {
          log.add('flush ${d.data[21]}.${d.data[23]}');
          _discoveringUntil = DateTime.now().add(discoveryDelay);
        }
      case ArtNet.opTodRequest:
        final req = ArtTodRequest.decode(d.data);
        if (req == null) return;
        for (final a in req.subUniAddresses) {
          final p = _portFor(req.net, a);
          if (p == null) continue;
          final discovering = _discoveringUntil != null && DateTime.now().isBefore(_discoveringUntil!);
          if (!p.rdmEnabled || discovering) {
            _reply(d, ArtTodData.encode(net: req.net, subUni: a, uids: const [], port: p.number, bindIndex: _pageOf(p), commandResponse: ArtTodData.todNak));
          } else {
            final uids = p.fixtures.map((f) => f.uid).toList();
            _reply(d, ArtTodData.encode(net: req.net, subUni: a, uids: uids, port: p.number, bindIndex: _pageOf(p)));
          }
        }
      case ArtNet.opRdm:
        final art = ArtRdm.decode(d.data);
        if (art == null) return;
        final p = _portFor(art.net, art.subUni);
        if (p == null || !p.rdmEnabled) return;
        final req = RdmPacket.tryDecode(art.rdmBytes, withStartCode: false);
        if (req == null) return;
        if (_random.nextDouble() < dropRate) {
          log.add('drop ${Pid.name(req.pid)}');
          return;
        }
        for (final f in p.fixtures) {
          if (req.destination == f.uid || (req.destination.isBroadcast && (req.destination.manufacturerId == 0xFFFF || req.destination.manufacturerId == f.uid.manufacturerId))) {
            final resp = _respond(f, req);
            if (resp != null && !req.destination.isBroadcast) {
              _reply(d, ArtRdm(net: art.net, subUni: art.subUni, rdmBytes: resp.encode(withStartCode: false)).encode());
            }
          }
        }
      default:
        break;
    }
  }

  int _pageOf(SimPort p) => ((ports.indexOf(p)) ~/ 4) + 1;

  SimPort? _portFor(int net, int subUni) {
    for (final p in ports) {
      if (p.address.net == net && p.address.subUni == subUni) return p;
    }
    return null;
  }

  List<Uint8List> _pollReplies() {
    final out = <Uint8List>[];
    for (var page = 0; page * 4 < ports.length; page++) {
      final slice = ports.skip(page * 4).take(4).toList();
      out.add(ArtPollReply.encode(
        ip: ip,
        shortName: shortName,
        longName: longName,
        netSwitch: slice.first.address.net,
        subSwitch: slice.first.address.subnet,
        swOut: slice.map((p) => p.address.universe).toList(),
        portTypes: slice.map((_) => 0x80).toList(),
        goodOutput: slice.map((p) => 0x80 | (p.sacn ? 0x01 : 0x00)).toList(),
        goodOutputB: slice.map((p) => p.rdmEnabled ? 0x00 : 0x80).toList(),
        bindIndex: page + 1,
        mac: mac,
        numPorts: slice.length,
        status2: 0x08 | 0x10 | 0x80,
      ));
    }
    // Advertise our real UDP port so the service sends unicast to it (real nodes: 6454).
    final port = this.port;
    for (final r in out) {
      r[14] = port & 0xFF;
      r[15] = (port >> 8) & 0xFF;
    }
    return out;
  }

  void _applyAddress(Uint8List b) {
    if (b.length < 107) return;
    final page = b[13] == 0 ? 1 : b[13];
    final slice = ports.skip((page - 1) * 4).take(4).toList();
    if (slice.isEmpty) return;
    int? prog(int v) => v & 0x80 != 0 ? v & 0x7F : null;
    final net = prog(b[12]);
    final subnet = prog(b[104]);
    for (var i = 0; i < slice.length; i++) {
      final uni = prog(b[100 + i]);
      final p = slice[i];
      p.address = PortAddress(net ?? p.address.net, subnet ?? p.address.subnet, uni ?? p.address.universe);
    }
    if (b[14] != 0) shortName = String.fromCharCodes(b.sublist(14, 32)).split('\x00').first;
    if (b[32] != 0) longName = String.fromCharCodes(b.sublist(32, 96)).split('\x00').first;
    final cmd = b[106];
    final idx = cmd & 0x0F;
    final base = cmd & 0xF0;
    if (idx < slice.length) {
      if (base == ArtAddressCommand.artNetSel0) slice[idx].sacn = false;
      if (base == ArtAddressCommand.acnSel0) slice[idx].sacn = true;
      if (base == ArtAddressCommand.rdmEnable0) slice[idx].rdmEnabled = true;
      if (base == ArtAddressCommand.rdmDisable0) slice[idx].rdmEnabled = false;
    }
    log.add('address page $page cmd 0x${cmd.toRadixString(16)}');
  }

  RdmPacket? _respond(SimFixture f, RdmPacket req) {
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
          if (f.failSetAddressOnce) {
            f.failSetAddressOnce = false;
            log.add('dropped SET address for ${f.uid}');
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
}

/// The demo rig: one node with 8 ports, the fixtures from the specification
/// example on port 1, a bigger sACN line on port 2, an empty port and a port
/// with RDM switched off.
FakeArtNetNode buildDemoNode() {
  PersonalityDescription pd(int n, int fp, String name) => PersonalityDescription(personality: n, footprint: fp, description: name);
  final proWash = [pd(1, 8, 'Standard'), pd(2, 14, 'Extended'), pd(3, 20, 'Full')];
  final miniSpot = [pd(1, 10, 'Basic'), pd(2, 16, 'Extended')];
  final strip = [pd(1, 3, 'RGB'), pd(2, 18, '6 pixel'), pd(3, 36, '12 pixel')];
  var n = 0;
  SimFixture fx(String manu, String model, int modelId, List<PersonalityDescription> p, {int personality = 1, int address = 1, String label = '', bool fail = false}) =>
      SimFixture(uid: Uid(0x7FF1, 0x1000 + (n++)), manufacturer: manu, model: model, modelId: modelId, personalities: p, personality: personality, address: address, label: label, failSetAddressOnce: fail);
  return FakeArtNetNode(
    shortName: 'LumiNode 8 demo',
    longName: 'Demo node (simulated, in the app)',
    ports: [
      SimPort(number: 1, address: const PortAddress(0, 0, 0), fixtures: [
        fx('DemoLux', 'ProWash 300', 0x0300, proWash, address: 1, label: 'Wash 1'),
        fx('DemoLux', 'MiniSpot 60', 0x0060, miniSpot, personality: 2, address: 101, label: 'Spot 1'),
        fx('DemoLux', 'ProWash 300', 0x0300, proWash, address: 1, label: 'Wash 2'),
      ]),
      SimPort(number: 2, address: const PortAddress(0, 0, 1), sacn: true, fixtures: [
        fx('DemoLux', 'PixelStrip 1m', 0x0101, strip, personality: 2, address: 1),
        fx('DemoLux', 'PixelStrip 1m', 0x0101, strip, personality: 2, address: 19),
        fx('DemoLux', 'PixelStrip 1m', 0x0101, strip, personality: 2, address: 37, fail: true),
        fx('DemoLux', 'ProWash 300', 0x0300, proWash, address: 200),
        fx('DemoLux', 'MiniSpot 60', 0x0060, miniSpot, address: 300, label: 'Spot links'),
      ]),
      SimPort(number: 3, address: const PortAddress(0, 0, 2)),
      SimPort(number: 4, address: const PortAddress(0, 0, 3), rdmEnabled: false, fixtures: [
        fx('DemoLux', 'ProWash 300', 0x0300, proWash),
      ]),
      SimPort(number: 5, address: const PortAddress(0, 0, 4), sacn: true, fixtures: [
        fx('DemoLux', 'MiniSpot 60', 0x0060, miniSpot, address: 1),
        fx('DemoLux', 'MiniSpot 60', 0x0060, miniSpot, address: 11),
      ]),
      SimPort(number: 6, address: const PortAddress(0, 0, 5)),
      SimPort(number: 7, address: const PortAddress(0, 0, 6)),
      SimPort(number: 8, address: const PortAddress(0, 0, 7)),
    ],
  );
}
