import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/artnet/artnet.dart';
import '../model/node.dart';
import '../net/multicast_lock.dart';
import '../net/network_info.dart';
import '../services/artnet_service.dart';
import '../services/rdm_client.dart';
import '../services/rdmnet_service.dart';
import '../services/sim/fake_artnet_node.dart';
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

/// Owns the network services and the node list. Nodes come from Art-Net
/// (ArtPollReply) and from RDMnet (LLRP + broker); the same physical node is
/// merged on IP or MAC address.
class AppBackend extends ChangeNotifier {
  AppBackend(this.settings, {this.artnetPort = ArtNet.port, this.enableRdmnet = true, this.useBroadcast = true});

  final Settings settings;

  /// UDP port of the Art-Net socket (tests use an ephemeral port).
  final int artnetPort;

  /// RDMnet discovery (mDNS / LLRP / broker) on or off.
  final bool enableRdmnet;

  /// Broadcast ArtPoll on or off (tests only poll the simulated node).
  final bool useBroadcast;

  ArtNetService? artnet;
  RdmnetService? rdmnet;
  BrokerConnection? broker;
  FakeArtNetNode? demoNode;
  LocalNetwork network = const LocalNetwork();

  final List<Node> nodes = <Node>[];
  final List<RdmnetBrokerInfo> brokers = <RdmnetBrokerInfo>[];
  List<LlrpComponent> llrpComponents = <LlrpComponent>[];
  List<RdmnetGateway> gateways = <RdmnetGateway>[];

  bool started = false;
  bool scanning = false;
  String? error;
  String? rdmnetStatus;
  Timer? _rebuildTimer;
  StreamSubscription<void>? _nodesSub;

  Future<void> start() async {
    if (started) return;
    await MulticastLock.acquire();
    network = await LocalNetwork.detect();
    try {
      artnet = await ArtNetService.open(controllerUid: settings.controllerUid, port: artnetPort);
    } catch (e) {
      error = 'Art-Net socket: $e';
      notifyListeners();
      return;
    }
    if (!useBroadcast) artnet!.broadcastTargets.clear();
    if (useBroadcast) artnet!.broadcastTargets.addAll(network.broadcastTargets);
    if (settings.extraBroadcast.isNotEmpty && useBroadcast) artnet!.broadcastTargets.add(settings.extraBroadcast);
    _nodesSub = artnet!.nodesChanged.listen((_) => _scheduleRebuild());
    if (enableRdmnet) rdmnet = RdmnetService(cid: settings.cid, controllerUid: settings.controllerUid);
    started = true;
    if (settings.demoMode) await startDemo();
    notifyListeners();
  }

  Future<void> startDemo() async {
    if (demoNode != null || artnet == null) return;
    final node = buildDemoNode();
    await node.start(port: 0);
    demoNode = node;
    artnet!.unicastTargets['127.0.0.1'] = node.port;
    notifyListeners();
  }

  Future<void> stopDemo() async {
    final node = demoNode;
    if (node == null) return;
    demoNode = null;
    artnet?.unicastTargets.remove('127.0.0.1');
    artnet?.nodes.remove('127.0.0.1');
    await node.stop();
    _rebuildNodes();
  }

  void _scheduleRebuild() {
    _rebuildTimer?.cancel();
    _rebuildTimer = Timer(const Duration(milliseconds: 150), _rebuildNodes);
  }

  /// Polls the network and refreshes the node list.
  Future<void> scan({Duration wait = const Duration(milliseconds: 2500)}) async {
    if (!started) await start();
    final a = artnet;
    if (a == null) return;
    scanning = true;
    error = null;
    notifyListeners();
    if (settings.demoMode && demoNode == null) await startDemo();
    if (!settings.demoMode && demoNode != null) await stopDemo();
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
    if (r == null) return;
    try {
      brokers.clear();
      final manual = settings.manualBrokerAddress;
      if (manual != null) {
        brokers.add(RdmnetBrokerInfo(host: manual.$1, port: manual.$2, scope: settings.rdmnetScope, name: 'manual', manual: true));
      }
      final found = await r.discoverBrokers(timeout: const Duration(seconds: 2));
      brokers.addAll(found.where((b) => b.scope == settings.rdmnetScope));
      llrpComponents = await r.llrpProbe(timeout: const Duration(milliseconds: 1500), rounds: 1);
      // A node that knows its broker (static config) is a broker candidate too.
      for (final c in llrpComponents) {
        final s = c.scope;
        if (s != null && s.staticIpv4 != null && s.staticPort > 0 && s.scope == settings.rdmnetScope) {
          if (!brokers.any((b) => b.host == s.staticIpv4 && b.port == s.staticPort)) {
            brokers.add(RdmnetBrokerInfo(host: s.staticIpv4!, port: s.staticPort, scope: s.scope, name: 'static'));
          }
        }
        if (c.isBroker && !brokers.any((b) => b.host == c.ip)) {
          // Broker found by LLRP without DNS-SD: its port is unknown, mDNS or manual entry is needed.
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
            broker = await r.connect(b);
            rdmnetStatus = 'RDMnet broker ${b.host}:${b.port} (${b.scope})';
            break;
          } on Exception catch (e) {
            rdmnetStatus = 'RDMnet: $e';
          }
        }
      }
      final conn = broker;
      if (conn != null && conn.connected) {
        gateways = await conn.loadGateways(llrp: llrpComponents);
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
    _rebuildTimer?.cancel();
    unawaited(_nodesSub?.cancel());
    broker?.close();
    artnet?.dispose();
    unawaited(demoNode?.stop());
    unawaited(MulticastLock.release());
    super.dispose();
  }
}
