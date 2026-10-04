import 'dart:typed_data';

import '../bytes.dart';
import '../uid.dart';

/// Art-Net 4 (Artistic Licence) packets used for node discovery, port
/// configuration and RDM transport. Layouts follow the Art-Net 4 specification;
/// the RDM packets (ArtTodRequest, ArtTodData, ArtTodControl, ArtRdm) carry
/// E1.20 messages without the DMX start code.
class ArtNet {
  ArtNet._();

  static const port = 6454; // 0x1936
  static const protocolVersion = 14;
  static const id = <int>[0x41, 0x72, 0x74, 0x2D, 0x4E, 0x65, 0x74, 0x00]; // "Art-Net\0"

  static const opPoll = 0x2000;
  static const opPollReply = 0x2100;
  static const opAddress = 0x6000;
  static const opTodRequest = 0x8000;
  static const opTodData = 0x8100;
  static const opTodControl = 0x8200;
  static const opRdm = 0x8300;
  static const opIpProg = 0xF800;
  static const opIpProgReply = 0xF900;

  /// Returns the OpCode of an Art-Net packet, or null when it is not one.
  static int? opcodeOf(Uint8List b) {
    if (b.length < 12) return null;
    for (var i = 0; i < 8; i++) {
      if (b[i] != id[i]) return null;
    }
    return b[8] | (b[9] << 8);
  }

  static void _header(ByteWriter w, int opcode, {bool withVersion = true}) {
    w.bytes(id);
    w.u16le(opcode);
    if (withVersion) {
      w.u8(0);
      w.u8(protocolVersion);
    }
  }
}

/// 15-bit Port-Address: Net (7 bit) . Sub-Net (4 bit) . Universe (4 bit).
class PortAddress implements Comparable<PortAddress> {
  const PortAddress(this.net, this.subnet, this.universe);

  factory PortAddress.fromValue(int v) =>
      PortAddress((v >> 8) & 0x7F, (v >> 4) & 0x0F, v & 0x0F);

  final int net;
  final int subnet;
  final int universe;

  int get value => (net << 8) | (subnet << 4) | universe;

  /// The low byte used in ArtTodRequest / ArtTodData / ArtRdm "Address" fields.
  int get subUni => (subnet << 4) | universe;

  /// sACN universe an Art-Net 4 node uses when its port is switched to sACN.
  /// Assumption (documented in docs/PROTOCOLS.md): Port-Address + 1, because
  /// sACN universes start at 1. Verify on a real node and change here if needed.
  int get sacnUniverse => value + 1;

  factory PortAddress.fromSacnUniverse(int universe) => PortAddress.fromValue(universe - 1);

  @override
  int compareTo(PortAddress other) => value.compareTo(other.value);

  @override
  bool operator ==(Object other) => other is PortAddress && other.value == value;

  @override
  int get hashCode => value;

  @override
  String toString() => '$net.$subnet.$universe';
}

/// ArtPoll: ask every node on the network to reply with ArtPollReply.
class ArtPoll {
  ArtPoll._();

  /// Flags: bit 1 = send ArtPollReply whenever node conditions change,
  /// bit 2 = send diagnostics, bit 5 = targeted mode (not used).
  static Uint8List encode({int flags = 0x02, int diagPriority = 0x10}) {
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opPoll);
    w.u8(flags);
    w.u8(diagPriority);
    return w.toBytes();
  }
}

/// Per-port view on an ArtPollReply (up to 4 ports per reply / bind index).
class ArtNetPort {
  ArtNetPort({
    required this.index,
    required this.portType,
    required this.goodInput,
    required this.goodOutput,
    required this.goodOutputB,
    required this.swIn,
    required this.swOut,
    required this.net,
    required this.subnet,
  });

  /// 0..3 within this ArtPollReply.
  final int index;
  final int portType;
  final int goodInput;
  final int goodOutput;
  final int goodOutputB;
  final int swIn;
  final int swOut;
  final int net;
  final int subnet;

  /// PortTypes bit 7: can output data from the network to DMX.
  bool get isOutput => portType & 0x80 != 0;

  /// PortTypes bit 6: can input DMX to the network.
  bool get isInput => portType & 0x40 != 0;

  /// PortTypes bits 0-5: 0 = DMX512.
  bool get isDmx => (portType & 0x3F) == 0;

  PortAddress get outputAddress => PortAddress(net, subnet, swOut & 0x0F);
  PortAddress get inputAddress => PortAddress(net, subnet, swIn & 0x0F);

  /// GoodOutput bit 0 (Art-Net 4): set = port outputs sACN, clear = Art-Net.
  bool get outputsSacn => goodOutput & 0x01 != 0;

  /// GoodOutput bit 7: data is being transmitted on this port.
  bool get dataTransmitted => goodOutput & 0x80 != 0;

  /// GoodOutput bit 3: output is merging.
  bool get merging => goodOutput & 0x08 != 0;

  /// GoodOutput bit 1: merge mode is LTP.
  bool get mergeLtp => goodOutput & 0x02 != 0;

  /// GoodOutputB bit 7 (Art-Net 4): set = RDM is disabled on this port.
  bool get rdmDisabled => goodOutputB & 0x80 != 0;

  /// GoodOutputB bit 5: discovery is running.
  bool get discoveryRunning => goodOutputB & 0x20 != 0;
}

/// ArtPollReply as sent by a node (one per bind index / page of 4 ports).
class ArtPollReply {
  ArtPollReply({
    required this.ip,
    required this.udpPort,
    required this.firmware,
    required this.netSwitch,
    required this.subSwitch,
    required this.oem,
    required this.status1,
    required this.estaManufacturer,
    required this.shortName,
    required this.longName,
    required this.nodeReport,
    required this.numPorts,
    required this.portTypes,
    required this.goodInput,
    required this.goodOutput,
    required this.swIn,
    required this.swOut,
    required this.acnPriority,
    required this.style,
    required this.mac,
    required this.bindIp,
    required this.bindIndex,
    required this.status2,
    required this.goodOutputB,
    required this.status3,
    required this.defaultResponderUid,
    required this.raw,
  });

  final String ip;
  final int udpPort;
  final int firmware;
  final int netSwitch;
  final int subSwitch;
  final int oem;
  final int status1;
  final int estaManufacturer;
  final String shortName;
  final String longName;
  final String nodeReport;
  final int numPorts;
  final List<int> portTypes;
  final List<int> goodInput;
  final List<int> goodOutput;
  final List<int> swIn;
  final List<int> swOut;
  final int acnPriority;
  final int style;
  final String mac;
  final String bindIp;

  /// 0 or 1 = first page of ports, 2 = ports 5-8, …
  final int bindIndex;
  final int status2;
  final List<int> goodOutputB;
  final int status3;
  final Uid defaultResponderUid;
  final Uint8List raw;

  static const length3 = 207; // Art-Net 3 minimum
  static const length4 = 239; // Art-Net 4

  /// Status1 bit 1: node supports RDM.
  bool get rdmCapable => status1 & 0x02 != 0;

  /// Status2 bit 3: node supports 15-bit Port-Addresses (Art-Net 3 or 4).
  bool get supports15BitPortAddress => status2 & 0x08 != 0;

  /// Status2 bit 4: node is able to switch between Art-Net and sACN.
  bool get canSwitchProtocol => status2 & 0x10 != 0;

  /// Status2 bit 7: node supports RDM control using ArtCommand.
  bool get rdmViaArtCommand => status2 & 0x80 != 0;

  /// Status2 bit 1: node is DHCP configured.
  bool get dhcp => status2 & 0x02 != 0;

  /// Page number (1-based) this reply describes.
  int get page => bindIndex == 0 ? 1 : bindIndex;

  /// Physical (1-based) number of the first port of this page.
  int get firstPhysicalPort => (page - 1) * 4 + 1;

  List<ArtNetPort> get ports => List.generate(
        numPorts.clamp(0, 4),
        (i) => ArtNetPort(
          index: i,
          portType: portTypes[i],
          goodInput: goodInput[i],
          goodOutput: goodOutput[i],
          goodOutputB: goodOutputB[i],
          swIn: swIn[i],
          swOut: swOut[i],
          net: netSwitch,
          subnet: subSwitch,
        ),
      );

  static ArtPollReply? decode(Uint8List b) {
    if (ArtNet.opcodeOf(b) != ArtNet.opPollReply) return null;
    if (b.length < length3) {
      // Some very old nodes send shorter replies; pad so every field reads 0.
      b = Uint8List.fromList([...b, ...List.filled(length4 - b.length, 0)]);
    } else if (b.length < length4) {
      b = Uint8List.fromList([...b, ...List.filled(length4 - b.length, 0)]);
    }
    final r = ByteReader(b, 10);
    final ip = r.bytes(4).join('.');
    final udpPort = r.u16le();
    final firmware = r.u16();
    final netSwitch = r.u8() & 0x7F;
    final subSwitch = r.u8() & 0x0F;
    final oem = r.u16();
    r.u8(); // UBEA version
    final status1 = r.u8();
    final estaLo = r.u8();
    final estaHi = r.u8();
    final shortName = r.fixedString(18);
    final longName = r.fixedString(64);
    final nodeReport = r.fixedString(64);
    final numPorts = r.u16();
    final portTypes = r.bytes(4).toList();
    final goodInput = r.bytes(4).toList();
    final goodOutput = r.bytes(4).toList();
    final swIn = r.bytes(4).toList();
    final swOut = r.bytes(4).toList();
    final acnPriority = r.u8();
    r.skip(2); // SwMacro, SwRemote
    r.skip(3); // Spare
    final style = r.u8();
    final mac = hex(r.bytes(6), separator: ':').toUpperCase();
    final bindIp = r.bytes(4).join('.');
    final bindIndex = r.u8();
    final status2 = r.u8();
    final goodOutputB = r.bytes(4).toList();
    final status3 = r.u8();
    final defaultResp = Uid.fromBytes(r.bytes(6));
    return ArtPollReply(
      ip: ip,
      udpPort: udpPort,
      firmware: firmware,
      netSwitch: netSwitch,
      subSwitch: subSwitch,
      oem: oem,
      status1: status1,
      estaManufacturer: (estaHi << 8) | estaLo,
      shortName: shortName,
      longName: longName,
      nodeReport: nodeReport,
      numPorts: numPorts,
      portTypes: portTypes,
      goodInput: goodInput,
      goodOutput: goodOutput,
      swIn: swIn,
      swOut: swOut,
      acnPriority: acnPriority,
      style: style,
      mac: mac,
      bindIp: bindIp,
      bindIndex: bindIndex,
      status2: status2,
      goodOutputB: goodOutputB,
      status3: status3,
      defaultResponderUid: defaultResp,
      raw: b,
    );
  }

  /// Builds a reply (used by the demo node and the tests).
  static Uint8List encode({
    required List<int> ip,
    required String shortName,
    required String longName,
    required int netSwitch,
    required int subSwitch,
    required List<int> swOut,
    required List<int> portTypes,
    List<int>? goodOutput,
    List<int>? goodOutputB,
    int bindIndex = 1,
    List<int>? bindIp,
    List<int>? mac,
    int status1 = 0x02 | 0xC0,
    int status2 = 0x08 | 0x10,
    int numPorts = 4,
    List<int>? defaultResponderUid,
    int oem = 0x00FF,
    int estaManufacturer = 0x7FF0,
    String nodeReport = '#0001 [0001] OK',
  }) {
    final w = ByteWriter();
    w.bytes(ArtNet.id);
    w.u16le(ArtNet.opPollReply);
    w.bytes(ip);
    w.u16le(ArtNet.port);
    w.u16(0x0100);
    w.u8(netSwitch);
    w.u8(subSwitch);
    w.u16(oem);
    w.u8(0);
    w.u8(status1);
    w.u8(estaManufacturer & 0xFF);
    w.u8(estaManufacturer >> 8);
    w.fixedString(shortName, 18);
    w.fixedString(longName, 64);
    w.fixedString(nodeReport, 64);
    w.u16(numPorts);
    w.bytes(_pad4(portTypes));
    w.bytes(_pad4(const []));
    w.bytes(_pad4(goodOutput ?? const []));
    w.bytes(_pad4(const []));
    w.bytes(_pad4(swOut));
    w.u8(100); // AcnPriority
    w.u8(0);
    w.u8(0);
    w.zeros(3);
    w.u8(0); // Style: StNode
    w.bytes(_padN(mac ?? const [], 6));
    w.bytes(_padN(bindIp ?? ip, 4));
    w.u8(bindIndex);
    w.u8(status2);
    w.bytes(_pad4(goodOutputB ?? const []));
    w.u8(0); // Status3
    w.bytes(_padN(defaultResponderUid ?? const [], 6)); // DefaultRespUID: a lamp that is its own responder
    w.zeros(4); // UserHi/Lo, RefreshRateHi/Lo
    w.u8(0); // BackgroundQueuePolicy
    w.zeros(10);
    return w.toBytes();
  }

  static List<int> _pad4(List<int> l) => _padN(l, 4);
  static List<int> _padN(List<int> l, int n) =>
      List.generate(n, (i) => i < l.length ? l[i] & 0xFF : 0);
}

/// ArtAddress commands (Art-Net 4, "Command" field). Add the port index
/// (0-3) to the base value for the port-specific commands.
class ArtAddressCommand {
  ArtAddressCommand._();

  static const none = 0x00;
  static const cancelMerge = 0x01;
  static const ledNormal = 0x02;
  static const ledMute = 0x03;
  static const ledLocate = 0x04;
  static const resetRxFlags = 0x05;
  static const mergeLtp0 = 0x10;
  static const directionTx0 = 0x20;
  static const directionRx0 = 0x30;
  static const mergeHtp0 = 0x50;

  /// Set port to output DMX512 and RDM from Art-Net.
  static const artNetSel0 = 0x60;

  /// Set port to output DMX512 from sACN and RDM from Art-Net.
  static const acnSel0 = 0x70;
  static const clearOp0 = 0x90;
  static const rdmEnable0 = 0xC0;
  static const rdmDisable0 = 0xD0;
}

/// ArtAddress: program a node's names, Net / Sub-Net / Universe per port and
/// one command. Programming values: 0x00 = no change, 0x7F = reset to the
/// physical switch / default, 0x80 | value = program value.
class ArtAddress {
  ArtAddress._();

  static const noChange = 0x00;
  static const resetToDefault = 0x7F;

  static int program(int value) => 0x80 | (value & 0x7F);

  static Uint8List encode({
    int bindIndex = 0,
    int? net,
    int? subnet,
    List<int?> swIn = const [null, null, null, null],
    List<int?> swOut = const [null, null, null, null],
    String? shortName,
    String? longName,
    int command = ArtAddressCommand.none,
    int acnPriority = 0,
  }) {
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opAddress);
    w.u8(net == null ? noChange : program(net));
    w.u8(bindIndex);
    if (shortName == null) {
      w.zeros(18);
    } else {
      w.fixedString(shortName, 18);
    }
    if (longName == null) {
      w.zeros(64);
    } else {
      w.fixedString(longName, 64);
    }
    for (var i = 0; i < 4; i++) {
      final v = i < swIn.length ? swIn[i] : null;
      w.u8(v == null ? noChange : program(v & 0x0F));
    }
    for (var i = 0; i < 4; i++) {
      final v = i < swOut.length ? swOut[i] : null;
      w.u8(v == null ? noChange : program(v & 0x0F));
    }
    w.u8(subnet == null ? noChange : program(subnet & 0x0F));
    w.u8(acnPriority);
    w.u8(command);
    return w.toBytes();
  }
}

/// ArtTodRequest: ask the node for its Table of Devices (RDM UIDs) per port address.
class ArtTodRequest {
  ArtTodRequest._();

  static const todFull = 0x00;

  static Uint8List encode(int net, List<int> subUniAddresses) {
    if (subUniAddresses.isEmpty || subUniAddresses.length > 32) {
      throw ArgumentError('1..32 addresses per ArtTodRequest');
    }
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opTodRequest);
    w.zeros(2); // Filler
    w.zeros(7); // Spare
    w.u8(net & 0x7F);
    w.u8(todFull);
    w.u8(subUniAddresses.length);
    for (final a in subUniAddresses) {
      w.u8(a);
    }
    w.zeros(32 - subUniAddresses.length);
    return w.toBytes();
  }

  static ArtTodRequestData? decode(Uint8List b) {
    if (ArtNet.opcodeOf(b) != ArtNet.opTodRequest || b.length < 24) return null;
    final net = b[21] & 0x7F;
    final count = b[23];
    final addresses = <int>[];
    for (var i = 0; i < count && 24 + i < b.length; i++) {
      addresses.add(b[24 + i]);
    }
    return ArtTodRequestData(net, addresses);
  }
}

class ArtTodRequestData {
  ArtTodRequestData(this.net, this.subUniAddresses);
  final int net;
  final List<int> subUniAddresses;
}

/// ArtTodControl: AtcFlush makes the node run a fresh RDM discovery.
class ArtTodControl {
  ArtTodControl._();

  static const none = 0x00;
  static const flush = 0x01;

  static Uint8List encode(int net, int subUni, {int command = flush}) {
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opTodControl);
    w.zeros(2);
    w.zeros(7);
    w.u8(net & 0x7F);
    w.u8(command);
    w.u8(subUni);
    return w.toBytes();
  }
}

/// ArtTodData: a (block of the) Table of Devices for one port address.
class ArtTodData {
  ArtTodData({
    required this.rdmVersion,
    required this.port,
    required this.bindIndex,
    required this.net,
    required this.commandResponse,
    required this.subUni,
    required this.uidTotal,
    required this.blockCount,
    required this.uids,
  });

  static const todFull = 0x00;
  static const todNak = 0xFF;

  final int rdmVersion;

  /// Physical port 1-4 within the bind index.
  final int port;
  final int bindIndex;
  final int net;
  final int commandResponse;
  final int subUni;
  final int uidTotal;
  final int blockCount;
  final List<Uid> uids;

  bool get isNak => commandResponse == todNak;
  PortAddress get portAddress => PortAddress(net, subUni >> 4, subUni & 0x0F);

  static ArtTodData? decode(Uint8List b) {
    if (ArtNet.opcodeOf(b) != ArtNet.opTodData || b.length < 28) return null;
    final r = ByteReader(b, 12);
    final rdmVer = r.u8();
    final port = r.u8();
    r.skip(6);
    final bindIndex = r.u8();
    final net = r.u8() & 0x7F;
    final cmd = r.u8();
    final subUni = r.u8();
    final uidTotal = r.u16();
    final blockCount = r.u8();
    final uidCount = r.u8();
    final uids = <Uid>[];
    for (var i = 0; i < uidCount && r.remaining >= 6; i++) {
      uids.add(Uid.fromBytes(r.bytes(6)));
    }
    return ArtTodData(
      rdmVersion: rdmVer,
      port: port,
      bindIndex: bindIndex,
      net: net,
      commandResponse: cmd,
      subUni: subUni,
      uidTotal: uidTotal,
      blockCount: blockCount,
      uids: uids,
    );
  }

  static Uint8List encode({
    required int net,
    required int subUni,
    required List<Uid> uids,
    int port = 1,
    int bindIndex = 1,
    int uidTotal = -1,
    int blockCount = 0,
    int commandResponse = todFull,
  }) {
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opTodData);
    w.u8(1); // RdmVer
    w.u8(port);
    w.zeros(6);
    w.u8(bindIndex);
    w.u8(net & 0x7F);
    w.u8(commandResponse);
    w.u8(subUni);
    w.u16(uidTotal < 0 ? uids.length : uidTotal);
    w.u8(blockCount);
    w.u8(uids.length);
    for (final u in uids) {
      u.writeTo(w);
    }
    return w.toBytes();
  }
}

/// ArtRdm: one RDM message (without the 0xCC start code) to or from a port.
class ArtRdm {
  ArtRdm({required this.net, required this.subUni, required this.rdmBytes});

  static const process = 0x00;

  final int net;
  final int subUni;

  /// RDM message starting at the sub-start code, including checksum.
  final Uint8List rdmBytes;

  PortAddress get portAddress => PortAddress(net, subUni >> 4, subUni & 0x0F);

  Uint8List encode() {
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opRdm);
    w.u8(1); // RdmVer
    w.u8(0); // Filler2
    w.zeros(7); // Spare1-5, FifoAvail, FifoMax
    w.u8(net & 0x7F);
    w.u8(process);
    w.u8(subUni);
    w.bytes(rdmBytes);
    return w.toBytes();
  }

  static ArtRdm? decode(Uint8List b) {
    if (ArtNet.opcodeOf(b) != ArtNet.opRdm || b.length < 24) return null;
    return ArtRdm(
      net: b[21] & 0x7F,
      subUni: b[23],
      rdmBytes: Uint8List.fromList(b.sublist(24)),
    );
  }
}

/// ArtIpProg: reprogram the IP address and subnet mask of a node (Art-Net, section ArtIpProg). It goes to the node's own
/// address, never as a broadcast (it would reprogram every node), and only nodes that support remote programming of the
/// IP address answer it with an [ArtIpProgReply]; the others stay silent.
class ArtIpProg {
  ArtIpProg._();

  static const enableProgramming = 0x80;
  static const enableDhcp = 0x40;
  static const returnToDefault = 0x08;
  static const programIp = 0x04;
  static const programMask = 0x02;

  /// Without [ip], [mask], [dhcp] or [defaults] this is an enquiry: the node only reports its settings.
  static Uint8List encode({List<int>? ip, List<int>? mask, bool dhcp = false, bool defaults = false}) {
    var command = 0;
    if (dhcp) {
      command = enableProgramming | enableDhcp;
    } else if (defaults) {
      command = enableProgramming | returnToDefault;
    } else {
      if (ip != null) command |= enableProgramming | programIp;
      if (mask != null) command |= enableProgramming | programMask;
    }
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opIpProg);
    w.u8(0); // Filler1
    w.u8(0); // Filler2
    w.u8(command);
    w.u8(0); // Filler4
    w.bytes(ArtPollReply._padN(ip ?? const [], 4));
    w.bytes(ArtPollReply._padN(mask ?? const [], 4));
    w.zeros(2); // ProgPort (deprecated)
    w.zeros(8); // Spare
    return w.toBytes();
  }
}

/// ArtIpProgReply: the IP address, subnet mask and DHCP state a node reports after an [ArtIpProg].
class ArtIpProgReply {
  ArtIpProgReply({required this.ip, required this.mask, required this.dhcp});

  final String ip;
  final String mask;
  final bool dhcp;

  static ArtIpProgReply? decode(Uint8List b) {
    if (ArtNet.opcodeOf(b) != ArtNet.opIpProgReply || b.length < 27) return null;
    return ArtIpProgReply(ip: b.sublist(16, 20).join('.'), mask: b.sublist(20, 24).join('.'), dhcp: b[26] & 0x40 != 0);
  }

  static Uint8List encode({required List<int> ip, required List<int> mask, bool dhcp = false}) {
    final w = ByteWriter();
    ArtNet._header(w, ArtNet.opIpProgReply);
    w.zeros(4); // Filler1-4
    w.bytes(ArtPollReply._padN(ip, 4));
    w.bytes(ArtPollReply._padN(mask, 4));
    w.zeros(2); // Port
    w.u8(dhcp ? 0x40 : 0);
    w.zeros(7);
    return w.toBytes();
  }
}
