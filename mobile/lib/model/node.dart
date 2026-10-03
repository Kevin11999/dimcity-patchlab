import '../core/artnet/artnet.dart';
import '../services/artnet_service.dart';
import '../services/rdmnet_service.dart';

enum PortProtocol { artnet, sacn }

/// One DMX output of a node, as shown and edited in the app.
class NodePort {
  NodePort({
    required this.number,
    required this.page,
    required this.index,
    required this.address,
    required this.protocol,
    required this.rdmEnabled,
    this.isInput = false,
    this.dataTransmitted = false,
    this.sacnUniverse,
    this.rdmnetEndpoint,
  });

  /// Physical port number, 1-based.
  final int number;

  /// Art-Net page (bind index) and index 0..3 within it.
  final int page;
  final int index;

  PortAddress address;
  PortProtocol protocol;
  bool rdmEnabled;
  final bool isInput;
  final bool dataTransmitted;

  /// sACN universe from RDMnet (ENDPOINT_TO_UNIVERSE) when known.
  int? sacnUniverse;

  /// E1.37-7 endpoint id on the RDMnet gateway, when known.
  int? rdmnetEndpoint;

  /// The universe number as the technician reads it: Art-Net Port-Address or sACN universe.
  int get displayUniverse => protocol == PortProtocol.sacn ? (sacnUniverse ?? address.sacnUniverse) : address.value;

  NodePort copy() => NodePort(
        number: number,
        page: page,
        index: index,
        address: address,
        protocol: protocol,
        rdmEnabled: rdmEnabled,
        isInput: isInput,
        dataTransmitted: dataTransmitted,
        sacnUniverse: sacnUniverse,
        rdmnetEndpoint: rdmnetEndpoint,
      );

  bool sameConfigAs(NodePort o) => address == o.address && protocol == o.protocol && rdmEnabled == o.rdmEnabled;
}

/// A node on the network, merged from Art-Net (ArtPollReply) and RDMnet (LLRP / broker).
class Node {
  Node({
    required this.id,
    required this.name,
    this.longName = '',
    this.ip,
    this.mac,
    this.artnet,
    this.gateway,
    List<NodePort>? ports,
    this.report = '',
    this.inSubnet = true,
  }) : ports = ports ?? <NodePort>[];

  final String id;
  String name;
  String longName;
  String? ip;
  String? mac;
  ArtNetNodeInfo? artnet;
  RdmnetGateway? gateway;
  final List<NodePort> ports;
  String report;

  /// False when the phone cannot reach this node (different IP range).
  bool inSubnet;

  bool get viaArtNet => artnet != null;
  bool get viaRdmnet => gateway != null;

  /// Builds the port list of an Art-Net node.
  static List<NodePort> portsFromArtNet(ArtNetNodeInfo info) => [
        for (final v in info.outputPorts)
          NodePort(
            number: v.physical,
            page: v.page,
            index: v.index,
            address: v.address,
            protocol: v.port.outputsSacn ? PortProtocol.sacn : PortProtocol.artnet,
            rdmEnabled: !v.port.rdmDisabled,
            isInput: v.port.isInput && !v.port.isOutput,
            dataTransmitted: v.port.dataTransmitted,
          ),
      ];

  static Node fromArtNet(ArtNetNodeInfo info) => Node(
        id: info.ip,
        name: info.shortName.isEmpty ? info.ip : info.shortName,
        longName: info.longName,
        ip: info.ip,
        mac: info.mac,
        artnet: info,
        ports: portsFromArtNet(info),
        report: info.nodeReport,
      );

  static Node fromGateway(RdmnetGateway g) => Node(
        id: 'rdmnet:${g.uid}',
        name: g.label ?? g.uid.toString(),
        ip: g.ip,
        mac: g.hardwareAddress,
        gateway: g,
        ports: [
          for (var i = 0; i < g.endpoints.length; i++)
            NodePort(
              number: i + 1,
              page: 0,
              index: i,
              address: g.endpoints[i].universe != null && g.endpoints[i].universe! > 0
                  ? PortAddress.fromSacnUniverse(g.endpoints[i].universe!)
                  : const PortAddress(0, 0, 0),
              protocol: PortProtocol.sacn,
              rdmEnabled: true,
              sacnUniverse: g.endpoints[i].universe,
              rdmnetEndpoint: g.endpoints[i].id,
            ),
        ],
      );

  /// Adds RDMnet endpoint information to the Art-Net ports of the same node.
  void mergeGateway(RdmnetGateway g) {
    gateway = g;
    for (final e in g.endpoints) {
      final u = e.universe;
      NodePort? match;
      // Prefer the port whose sACN universe (derived from the Port-Address) matches.
      if (u != null && u > 0) {
        for (final p in ports) {
          if (p.protocol == PortProtocol.sacn && p.address.sacnUniverse == u) {
            match = p;
            break;
          }
        }
      }
      // Otherwise map endpoint n to physical port n.
      match ??= ports.where((p) => p.number == e.id).firstOrNull;
      if (match != null) {
        match.rdmnetEndpoint = e.id;
        if (u != null && u > 0) match.sacnUniverse = u;
      }
    }
  }
}
