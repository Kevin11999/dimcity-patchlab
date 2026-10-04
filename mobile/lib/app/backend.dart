import 'dart:async';
import 'package:flutter/foundation.dart';

import '../core/artnet/artnet.dart';
import '../model/node.dart';
import '../net/adapters.dart';
import '../net/memory_udp.dart';
import '../net/multicast_lock.dart';
import '../net/network_info.dart';
import '../net/udp.dart';
import '../services/artnet_service.dart';
import '../services/lamp_broker.dart';
import '../services/lamp_network.dart';
import '../services/llrp_service.dart';
import '../services/rdm_client.dart';
import '../services/rdmnet_service.dart';
import '../services/sim/fake_artnet_node.dart';
import '../services/sim/fake_lamps.dart';
import 'settings.dart';

/// One RDM route to the fixtures on a port, with the alternative route
/// (when there is one) to fall back to.
class PortRoute {
  PortRoute({required this.primary, this.fallback});
  final RdmTransport primary;
  final RdmTransport? fallback;
}

/// Result of pressing "Program" on a node.
class ProgramResult {
  ProgramResult({required this.ok, required this.replied, this.details = const []});
  final bool ok;
  final bool replied;
  final List<String> details;
}

/// A port edit as prepared on the node screen.
class PortEdit {
  PortEdit({required this.port, required this.universe, required this.protocol, required this.rdmEnabled});

  final NodePort port;

  /// Art-Net Port-Address value (0..32767) or sACN universe (1..63999) depending on [protocol].
  final int universe;
  final PortProtocol protocol;
  final bool rdmEnabled;

  PortAddress get address => protocol == PortProtocol.sacn ? PortAddress.fromSacnUniverse(universe) : PortAddress.fromValue(universe);

  bool get changed => address != port.address || protocol != port.protocol || rdmEnabled != port.rdmEnabled;
}

/// Owns the network services, the node list and the lamps on the cable.
///
/// Two ways to reach fixtures:
///  * **Lamps**: RDMnet lamps directly on the cable. Found with LLRP (multicast, no broker,
///    no IP setup), see [lampsRoute].
///  * **Nodes**: Art-Net / RDMnet nodes with DMX ports. Found with ArtPoll and a broker; the same
///    physical node is merged on IP or MAC address.
///
/// In demo mode all of it runs on an in-memory network ([MemoryUdpHub]): no operating system
/// sockets, adapters or firewall are involved.
class AppBackend extends ChangeNotifier {
  AppBackend(this.settings, {this.adapterLister, this.llrpSocketFactory});

  final Settings settings;

  /// For tests: replaces the operating system's adapter list.
  final Future<List<AdapterInfo>> Function()? adapterLister;

  /// For tests: replaces the real UDP sockets of the lamp search.
  final UdpSocketFactory? llrpSocketFactory;

  ArtNetService? artnet;
  RdmnetService? rdmnet;
  LlrpService? llrp;

  /// RDMnet broker for the lamps on the cable: the app's own, or one that is on the network.
  LampBroker? lampBroker;

  /// Why the Art-Net socket (UDP 6454) could not be opened, if it could not.
  String? artnetError;
  LampsTransport? _lampsTransport;
  BrokerConnection? broker;
  LocalNetwork network = const LocalNetwork();

  // Demo.
  MemoryUdpHub? hub;
  FakeArtNetNode? demoNode;
  FakeRdmnetLamps? demoLamps;

  final List<Node> nodes = <Node>[];
  final List<RdmnetBrokerInfo> brokers = <RdmnetBrokerInfo>[];
  List<LlrpDevice> llrpDevices = <LlrpDevice>[];
  List<RdmnetGateway> gateways = <RdmnetGateway>[];

  bool started = false;
  bool scanning = false;
  String? error;
  String? rdmnetStatus;
  Timer? _rebuildTimer;
  StreamSubscription<void>? _nodesSub;

  bool get isDemo => hub != null;

  /// Opens the sockets. Safe to call again; does nothing when already started.
  Future<void> start() async {
    if (started) return;
    error = null;
    await MulticastLock.acquire();
    if (settings.demoMode) {
      await _openDemo();
    } else {
      await _openReal();
    }
    _nodesSub = artnet?.nodesChanged.listen((_) => _scheduleRebuild());
    started = true;
    notifyListeners();
  }

  Future<void> _openReal() async {
    network = await LocalNetwork.detect();
    try {
      artnet = await ArtNetService.open(controllerUid: settings.controllerUid, interfaces: _artNetInterfaces);
      artnet!.broadcastTargets.addAll(network.broadcastTargets);
      if (settings.extraBroadcast.isNotEmpty) artnet!.broadcastTargets.add(settings.extraBroadcast);
    } catch (e) {
      error = 'Art-Net socket: $e';
      artnetError = e.toString();
    }
    rdmnet = RdmnetService(cid: settings.cid, controllerUid: settings.controllerUid);
    llrp = LlrpService(
      socketFactory: llrpSocketFactory ?? RawUdpSocket.open,
      cid: settings.cid,
      controllerUid: settings.controllerUid,
      adapters: _lampAdapters,
    );
    lampBroker = LampBroker(
      cid: settings.cid,
      controllerUid: settings.controllerUid,
      adapters: _lampAdapters,
      socketFactory: llrpSocketFactory ?? RawUdpSocket.open,
      discovery: rdmnet,
      scope: settings.rdmnetScope,
    );
  }

  /// The adapters the lamp search uses: all of them, or the one picked in the settings (by name, because
  /// an address changes when a cable is moved).
  Future<List<AdapterInfo>> _lampAdapters() async {
    final all = await (adapterLister ?? listAdapters)();
    final picked = settings.lampsAdapter;
    if (picked.isEmpty) return all;
    final only = all.where((a) => a.name == picked).toList();
    return only.isEmpty ? all : only;
  }

  /// The adapter addresses Art-Net is sent from: every address of the adapters in use, link-local ones too (lamps on a
  /// bare cable). The mask is a guess from the address class; it only decides unicast or broadcast.
  Future<List<LocalAddress>> _artNetInterfaces() async => [
        for (final a in await _lampAdapters()) LocalAddress(a.ip, LocalNetwork.classfulMask(a.ip), interfaceName: a.name, maskGuessed: true),
      ];

  /// Adapters shown in the picker, whatever is selected.
  Future<List<AdapterInfo>> allAdapters() async => isDemo ? const [AdapterInfo('Demo (Ethernet)', _demoLampsIp)] : (adapterLister ?? listAdapters)();

  static const _demoArtNetIp = '2.0.0.200';
  static const _demoLampsIp = '169.254.10.1';

  Future<void> _openDemo() async {
    final h = MemoryUdpHub();
    hub = h;
    network = const LocalNetwork(addresses: [LocalAddress(_demoArtNetIp, '255.0.0.0', interfaceName: 'demo')], source: 'demo');
    artnet = ArtNetService(h.open(ip: _demoArtNetIp, port: ArtNet.port), controllerUid: settings.controllerUid);
    final node = buildDemoNode();
    await node.start(socket: h.open(ip: '2.0.0.1', port: ArtNet.port));
    demoNode = node;
    demoLamps = FakeRdmnetLamps(h, buildDemoLamps())..start();
    llrp = LlrpService(
      socketFactory: h.factoryFor(_demoLampsIp),
      cid: settings.cid,
      controllerUid: settings.controllerUid,
      adapters: () async => const [AdapterInfo('Demo (Ethernet)', _demoLampsIp)],
    );
  }

  /// Closes everything. [start] opens it again (after the demo mode was switched).
  Future<void> stop() async {
    _rebuildTimer?.cancel();
    await _nodesSub?.cancel();
    _nodesSub = null;
    broker?.close();
    broker = null;
    artnet?.dispose();
    artnet = null;
    llrp?.close();
    llrp = null;
    await lampBroker?.stop();
    lampBroker = null;
    _lampsTransport = null;
    rdmnet = null;
    await demoNode?.stop();
    demoNode = null;
    demoLamps?.stop();
    demoLamps = null;
    hub = null;
    nodes.clear();
    brokers.clear();
    llrpDevices = <LlrpDevice>[];
    gateways = <RdmnetGateway>[];
    rdmnetStatus = null;
    artnetError = null;
    started = false;
  }

  /// Switches demo mode on or off and restarts the network services.
  Future<void> setDemo(bool on) async {
    settings.demoMode = on;
    await stop();
    await start();
  }

  void _scheduleRebuild() {
    _rebuildTimer?.cancel();
    _rebuildTimer = Timer(const Duration(milliseconds: 150), _rebuildNodes);
  }

  /// Universe and IP settings of lamps that speak Art-Net themselves.
  LampNetwork? get lampNetwork => artnet == null ? null : LampNetwork(artnet!);

  /// The lamp route, once the lamp search has used it.
  LampsTransport? get lampsTransport => _lampsTransport;

  /// The lamps on the cable: RDMnet devices found with LLRP, addressed without a node or a broker.
  PortRoute? lampsRoute() {
    final l = llrp;
    if (l == null) return null;
    // In demo mode the Art-Net side is the demo node (the Nodes tab), not lamps on the cable.
    return PortRoute(primary: _lampsTransport ??= LampsTransport(l, broker: lampBroker, artnet: isDemo ? null : artnet));
  }

  /// Polls the network and refreshes the node list (Art-Net nodes and RDMnet gateways).
  Future<void> scan({Duration wait = const Duration(milliseconds: 2500)}) async {
    if (!started) await start();
    final a = artnet;
    if (a == null) return;
    scanning = true;
    error = null;
    notifyListeners();
    await a.syncInterfaces();
    a.poll();
    final rdmnetDone = _scanRdmnet();
    await Future<void>.delayed(const Duration(milliseconds: 600));
    a.poll();
    await Future<void>.delayed(wait - const Duration(milliseconds: 600));
    await rdmnetDone.timeout(const Duration(seconds: 8), onTimeout: () {});
    _rebuildNodes();
    scanning = false;
    notifyListeners();
  }

  Future<void> _scanRdmnet() async {
    final r = rdmnet;
    final l = llrp;
    if (r == null || l == null) return;
    try {
      brokers.clear();
      final manual = settings.manualBrokerAddress;
      if (manual != null) {
        brokers.add(RdmnetBrokerInfo(host: manual.$1, port: manual.$2, scope: settings.rdmnetScope, name: 'manual', manual: true));
      }
      final found = await r.discoverBrokers(timeout: const Duration(seconds: 2));
      final own = lampBroker?.server;
      // Our own broker (for the lamps on the cable) advertises itself too: it has no gateways.
      brokers.addAll(found.where((b) => b.scope == settings.rdmnetScope && !(own != null && (b.port == own.port || b.cid == own.cid.toString()))));
      llrpDevices = await l.probe(maxRounds: 2, roundTimeout: const Duration(milliseconds: 1500));
      // A component that knows its broker (static configuration) names it in COMPONENT_SCOPE.
      for (final c in llrpDevices.where((c) => c.isBroker || (brokers.isEmpty && c.isDevice)).take(5)) {
        c.scope = await l.readScope(c);
        final s = c.scope;
        if (s != null && s.staticIpv4 != null && s.staticPort > 0 && s.scope == settings.rdmnetScope) {
          if (!brokers.any((b) => b.host == s.staticIpv4 && b.port == s.staticPort)) {
            brokers.add(RdmnetBrokerInfo(host: s.staticIpv4!, port: s.staticPort, scope: s.scope, name: 'static'));
          }
        }
      }
      for (final c in llrpDevices.where((c) => c.isBroker)) {
        if (!brokers.any((b) => b.host == c.ip)) {
          // A broker found by LLRP without DNS-SD: its port is unknown, mDNS or manual entry is needed.
          rdmnetStatus = 'LLRP: broker at ${c.ip}, port unknown (use mDNS or enter it by hand)';
        }
      }
      if (brokers.isEmpty) {
        rdmnetStatus = null;
        gateways = const [];
        return;
      }
      if (broker == null || !broker!.connected) {
        broker?.close();
        broker = null;
        for (final b in brokers) {
          try {
            // The lamp search may already be connected to this very broker: one connection per CID.
            final shared = lampBroker?.connection;
            broker = shared != null && shared.connected && shared.host == b.host && shared.port == b.port ? shared : await r.connect(b);
            rdmnetStatus = 'RDMnet broker ${b.host}:${b.port} (${b.scope})';
            break;
          } on Exception catch (e) {
            rdmnetStatus = 'RDMnet: $e';
          }
        }
      }
      final conn = broker;
      if (conn != null && conn.connected) {
        gateways = (await conn.loadGateways(llrp: llrpDevices)).where((g) => g.endpoints.isNotEmpty).toList();
      }
    } catch (e) {
      rdmnetStatus = 'RDMnet: $e';
    }
  }

  void _rebuildNodes() {
    final a = artnet;
    final byId = <String, Node>{};
    final old = {for (final n in nodes) n.id: n};
    if (a != null) {
      for (final info in a.nodes.values) {
        final existing = old[info.ip];
        if (existing != null && existing.artnet == info) {
          // Keep the object (and any unsent edits in the UI) but refresh the ports.
          _refreshPorts(existing, info);
          byId[existing.id] = existing;
        } else {
          byId[info.ip] = Node.fromArtNet(info);
        }
      }
    }
    for (final g in gateways) {
      Node? match;
      for (final n in byId.values) {
        if ((g.ip != null && n.ip == g.ip) || (g.hardwareAddress != null && n.mac != null && n.mac!.toUpperCase() == g.hardwareAddress!.toUpperCase())) {
          match = n;
          break;
        }
      }
      if (match != null) {
        match.mergeGateway(g);
      } else {
        final n = Node.fromGateway(g);
        byId[n.id] = n;
      }
    }
    for (final n in byId.values) {
      n.inSubnet = n.ip == null || n.ip == '127.0.0.1' || network.contains(n.ip!);
    }
    nodes
      ..clear()
      ..addAll(byId.values.toList()..sort((x, y) => (x.ip ?? '').compareTo(y.ip ?? '')));
    notifyListeners();
  }

  void _refreshPorts(Node node, ArtNetNodeInfo info) {
    final fresh = Node.portsFromArtNet(info);
    node.name = info.shortName.isEmpty ? info.ip : info.shortName;
    node.longName = info.longName;
    node.report = info.nodeReport;
    for (final f in fresh) {
      final i = node.ports.indexWhere((p) => p.number == f.number);
      if (i < 0) {
        node.ports.add(f);
      } else {
        final p = node.ports[i];
        p.address = f.address;
        p.protocol = f.protocol;
        p.rdmEnabled = f.rdmEnabled;
      }
    }
    node.ports.removeWhere((p) => !fresh.any((f) => f.number == p.number));
    node.ports.sort((x, y) => x.number.compareTo(y.number));
  }

  /// Validates edits of one node: ports on one Art-Net page share Net and Sub-Net.
  String? validateEdits(Node node, List<PortEdit> edits) {
    final byPage = <int, PortAddress>{};
    for (final e in edits) {
      if (e.protocol == PortProtocol.sacn && (e.universe < 1 || e.universe > 32768)) {
        return 'Port ${e.port.number}: sACN universe 1..32768';
      }
      if (e.protocol == PortProtocol.artnet && (e.universe < 0 || e.universe > 32767)) {
        return 'Port ${e.port.number}: Art-Net universe 0..32767';
      }
      final a = e.address;
      final other = byPage[e.port.page];
      if (other != null && (other.net != a.net || other.subnet != a.subnet)) {
        return 'Ports ${(e.port.page - 1) * 4 + 1}-${e.port.page * 4} share Net/Sub-Net in Art-Net: ${other.net}.${other.subnet}.x and ${a.net}.${a.subnet}.x cannot be combined';
      }
      byPage[e.port.page] = a;
    }
    return null;
  }

  /// Sends the edits to the node with ArtAddress and verifies them with the
  /// ArtPollReply that comes back.
  Future<ProgramResult> program(Node node, List<PortEdit> edits) async {
    final a = artnet;
    final info = node.artnet;
    if (a == null || info == null) {
      return ProgramResult(ok: false, replied: false, details: ['no Art-Net']);
    }
    final changed = edits.where((e) => e.changed).toList();
    if (changed.isEmpty) return ProgramResult(ok: true, replied: true);
    final pages = changed.map((e) => e.port.page).toSet();
    var replied = false;
    for (final page in pages) {
      final onPage = changed.where((e) => e.port.page == page).toList();
      // 1. Addresses: one ArtAddress with Net, Sub-Net and the universes of the edited ports.
      final addressEdits = onPage.where((e) => e.address != e.port.address).toList();
      if (addressEdits.isNotEmpty) {
        final swOut = List<int?>.filled(4, null);
        for (final e in addressEdits) {
          swOut[e.port.index] = e.address.universe;
        }
        final r = await a.sendAddress(
          info,
          ArtAddress.encode(bindIndex: page, net: addressEdits.first.address.net, subnet: addressEdits.first.address.subnet, swOut: swOut),
          page: page,
        );
        replied = replied || r != null;
      }
      // 2. Protocol and RDM: one command per ArtAddress packet.
      for (final e in onPage) {
        if (e.protocol != e.port.protocol) {
          final cmd = (e.protocol == PortProtocol.sacn ? ArtAddressCommand.acnSel0 : ArtAddressCommand.artNetSel0) + e.port.index;
          final r = await a.sendAddress(info, ArtAddress.encode(bindIndex: page, command: cmd), page: page);
          replied = replied || r != null;
        }
        if (e.rdmEnabled != e.port.rdmEnabled) {
          final cmd = (e.rdmEnabled ? ArtAddressCommand.rdmEnable0 : ArtAddressCommand.rdmDisable0) + e.port.index;
          final r = await a.sendAddress(info, ArtAddress.encode(bindIndex: page, command: cmd), page: page);
          replied = replied || r != null;
        }
      }
    }
    // 3. Verify against the node's current state.
    final details = <String>[];
    for (final page in pages) {
      final reply = await a.pollNode(info, page: page) ?? info.pages[page];
      if (reply == null) continue;
      replied = true;
      for (final e in changed.where((e) => e.port.page == page)) {
        final p = reply.ports.where((p) => p.index == e.port.index).firstOrNull;
        if (p == null) continue;
        final gotAddress = p.outputAddress;
        final gotProtocol = p.outputsSacn ? PortProtocol.sacn : PortProtocol.artnet;
        final gotRdm = !p.rdmDisabled;
        if (gotAddress != e.address) details.add('Port ${e.port.number}: universe ${gotProtocol == PortProtocol.sacn ? gotAddress.sacnUniverse : gotAddress.value}');
        if (gotProtocol != e.protocol) details.add('Port ${e.port.number}: ${gotProtocol == PortProtocol.sacn ? 'sACN' : 'Art-Net'}');
        if (gotRdm != e.rdmEnabled) details.add('Port ${e.port.number}: RDM ${gotRdm ? 'on' : 'off'}');
      }
    }
    _rebuildNodes();
    return ProgramResult(ok: replied && details.isEmpty, replied: replied, details: details);
  }

  /// The RDM route(s) for a port: Art-Net first (LumiNode and dmXLAN answer
  /// ArtRdm even when the port runs sACN), RDMnet as the second route.
  PortRoute? routeFor(Node node, NodePort port) {
    RdmTransport? art;
    RdmTransport? net;
    final a = artnet;
    final info = node.artnet;
    if (a != null && info != null) art = ArtNetRdmTransport(a, info, port.address);
    final g = node.gateway;
    final ep = port.rdmnetEndpoint;
    if (g != null && ep != null && g.connection.connected) net = RdmnetTransport(g.connection, g.uid, ep);
    if (art != null && port.rdmEnabled) return PortRoute(primary: art, fallback: net);
    if (net != null) return PortRoute(primary: net, fallback: art);
    if (art != null) return PortRoute(primary: art);
    return null;
  }

  @override
  void dispose() {
    unawaited(stop());
    unawaited(MulticastLock.release());
    super.dispose();
  }
}
