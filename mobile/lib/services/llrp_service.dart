import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/rdm/rdm_params.dart';
import '../core/rdmnet/acn.dart';
import '../core/rdmnet/llrp.dart';
import '../core/uid.dart';
import '../net/udp.dart';
import 'rdm_client.dart';
import 'stream_utils.dart';

/// An RDMnet component found with LLRP: a lamp (RPT device), a broker or a controller.
class LlrpDevice {
  LlrpDevice({
    required this.cid,
    required this.uid,
    required this.hardwareAddress,
    required this.componentType,
    required this.ip,
    this.localIp,
  });

  final Cid cid;
  final Uid uid;
  final String hardwareAddress;
  final int componentType;

  /// Address the reply came from.
  final String ip;

  /// Our own adapter address on the same network, to send through the right adapter.
  final String? localIp;

  ComponentScope? scope;

  bool get isDevice => componentType == Llrp.componentRptDevice;
  bool get isBroker => componentType == Llrp.componentBroker;
}

/// LLRP (ANSI E1.33 Low Level Recovery Protocol): finds RDMnet components on the
/// local network with a multicast probe and talks RDM to them, with no broker,
/// no DHCP server and no IP configuration. Two devices on one cable are enough:
/// both fall back to link-local addresses (169.254.x.x) and LLRP works there.
class LlrpService {
  LlrpService({
    required this.socketFactory,
    required this.cid,
    required this.controllerUid,
    required this.localIps,
  });

  final UdpSocketFactory socketFactory;
  final Cid cid;
  final Uid controllerUid;

  /// IPv4 addresses of this device's adapters (link-local included, loopback not).
  final Future<List<String>> Function() localIps;

  UdpSocket? _socket;
  List<String> _ips = const [];
  int _transaction = 0;

  /// Components found by the last probes, by UID.
  final Map<Uid, LlrpDevice> devices = <Uid, LlrpDevice>{};

  // Diagnostics, shown on the "nothing found" screen.
  int probesSent = 0;
  int repliesSeen = 0;
  List<String> get adapters => List.unmodifiable(_ips);

  Future<void> open() async {
    if (_socket != null) return;
    _ips = await localIps();
    _socket = await socketFactory(Llrp.port, reusePort: true, broadcast: false);
    _socket!.joinMulticast(Llrp.responseAddress, localIps: _ips);
  }

  /// Re-reads the adapters: a cable plugged in after the app started shows up here.
  Future<void> _refresh() async {
    final ips = await localIps();
    if (ips.join(',') != _ips.join(',')) {
      _ips = ips;
      _socket?.joinMulticast(Llrp.responseAddress, localIps: _ips);
    }
  }

  void _sendRequest(Uint8List data, String? localIp) {
    final s = _socket;
    if (s == null) return;
    final to = InternetAddress(Llrp.requestAddress);
    if (localIp != null) {
      s.sendVia(data, to, Llrp.port, localIp);
    } else if (_ips.isEmpty) {
      s.send(data, to, Llrp.port);
    } else {
      for (final ip in _ips) {
        s.sendVia(data, to, Llrp.port, ip);
      }
    }
  }

  /// The adapter address that shares the most address bytes with [deviceIp].
  String? localIpFor(String deviceIp) {
    final d = deviceIp.split('.');
    String? best;
    var bestScore = 0;
    for (final ip in _ips) {
      final p = ip.split('.');
      var score = 0;
      for (var i = 0; i < 4 && i < p.length && i < d.length; i++) {
        if (p[i] != d[i]) break;
        score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = ip;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  static LlrpMessage? _tryDecode(Uint8List data) {
    try {
      return Llrp.decode(data);
    } on FormatException {
      return null;
    } on RangeError {
      return null;
    }
  }

  /// Probes until a round finds nothing new. LLRP devices answer after a random
  /// delay of up to 1.5 s, so a round lasts [roundTimeout]. Known UIDs go into the
  /// next probe so devices that already answered stay quiet.
  Future<List<LlrpDevice>> probe({
    int maxRounds = 5,
    Duration roundTimeout = const Duration(milliseconds: 2000),
    void Function(List<LlrpDevice> found)? onUpdate,
  }) async {
    await open();
    await _refresh();
    final found = <Uid, LlrpDevice>{};
    for (var round = 0; round < maxRounds; round++) {
      final tn = ++_transaction;
      final before = found.length;
      final sub = _socket!.datagrams.listen((d) {
        final m = _tryDecode(d.data);
        if (m is! LlrpProbeReply || m.destCid != cid || m.transaction != tn) return;
        repliesSeen++;
        found.putIfAbsent(
          m.uid,
          () => LlrpDevice(
            cid: m.senderCid,
            uid: m.uid,
            hardwareAddress: m.hardwareAddress,
            componentType: m.componentType,
            ip: d.address.address,
            localIp: localIpFor(d.address.address),
          ),
        );
        onUpdate?.call(found.values.toList());
      });
      _sendRequest(Llrp.probeRequest(senderCid: cid, transaction: tn, knownUids: found.keys.toList()), null);
      probesSent++;
      await Future<void>.delayed(roundTimeout);
      await sub.cancel();
      if (found.length == before) {
        // Nothing new this round. With nothing at all, give late starters one more chance.
        if (found.isNotEmpty || round >= 1) break;
      }
      if (found.length >= Llrp.maxKnownUids) break;
    }
    devices
      ..clear()
      ..addAll(found);
    return found.values.toList();
  }

  /// One RDM request to a component and its response. Throws [RdmTimeoutException] when nothing comes back.
  Future<RdmPacket> rdm(LlrpDevice device, RdmPacket request, {Duration timeout = const Duration(milliseconds: 1500)}) async {
    await open();
    final tn = ++_transaction;
    final f = firstMatching<Datagram>(_socket!.datagrams, (d) {
      final m = _tryDecode(d.data);
      return m is LlrpRdmCommand && m.destCid == cid && m.transaction == tn && m.packet.isResponse;
    }, timeout);
    _sendRequest(Llrp.rdmCommand(senderCid: cid, destCid: device.cid, transaction: tn, packet: request), device.localIp);
    final d = await f;
    if (d == null) throw RdmTimeoutException('No LLRP answer from ${device.uid} (${device.ip})');
    return (_tryDecode(d.data) as LlrpRdmCommand).packet;
  }

  /// COMPONENT_SCOPE of a device: names the broker it is configured for.
  Future<ComponentScope?> readScope(LlrpDevice device) async {
    final req = RdmPacket(
      destination: device.uid,
      source: controllerUid,
      transactionNumber: (++_transaction) & 0xFF,
      commandClass: Rdm.getCommand,
      pid: Pid.componentScope,
      data: ComponentScope.request(1),
    );
    try {
      final r = await rdm(device, req);
      if (!r.isAck) return null;
      return ComponentScope.decode(r.data);
    } on RdmException {
      return null;
    } on FormatException {
      return null;
    }
  }

  void close() {
    _socket?.close();
    _socket = null;
  }
}

/// RDM to the lamps found with LLRP: no node, no broker, no IP configuration.
class LampsTransport implements RdmTransport {
  LampsTransport(this.llrp);

  final LlrpService llrp;

  @override
  String get routeName => 'RDMnet';

  @override
  Uid get controllerUid => llrp.controllerUid;

  @override
  Future<List<Uid>> discover({bool flush = true, Duration timeout = const Duration(seconds: 12)}) async {
    final found = await llrp.probe();
    return found.where((d) => d.isDevice).map((d) => d.uid).toList()..sort();
  }

  @override
  Future<RdmPacket> exchange(RdmPacket request, {Duration timeout = const Duration(milliseconds: 1500)}) {
    final d = llrp.devices[request.destination];
    if (d == null) throw RdmException('${request.destination} is not on the cable (any more)');
    return llrp.rdm(d, request, timeout: timeout);
  }
}
