import 'dart:typed_data';

import '../core/artnet/artnet.dart';
import '../core/rdm/rdm_constants.dart';
import '../core/rdm/rdm_packet.dart';
import '../core/rdm/rdm_params.dart';
import '../core/uid.dart';
import 'artnet_service.dart';
import 'lamps_transport.dart';
import 'rdm_client.dart';

/// What happened when a lamp was looked up by its IP address and UID.
class DirectProbe {
  DirectProbe(this.ip, this.uid);
  final String ip;
  final Uid uid;

  /// The lamp answered the ArtPoll sent to its address (it is an Art-Net node and the answer arrived).
  bool pollReplied = false;

  /// The IP is in no subnet of this computer: everything went out by broadcast on every adapter.
  bool broadcast = false;

  /// The port address it answers RDM on, once it did.
  PortAddress? address;
  DeviceInfo? info;

  /// How many port addresses were tried.
  int tried = 0;
  ArtNetNodeInfo? node;

  bool get found => address != null;
  ArtRoute? get route => found && node != null ? ArtRoute(node!, address!, uid) : null;
}

/// Looks up one lamp by its IP address and UID, without any search: an ArtPoll to its address (to learn its universe, when it
/// answers), then DEVICE_INFO to its UID in ArtRdm on the port addresses it reports, then on Net 0 / Sub-Net 0 / Universe
/// 0 to 15 (many lamps only answer RDM on their own port address). The first answer wins.
Future<DirectProbe> probeDirectLamp(
  ArtNetService art,
  String ip,
  Uid uid, {
  Duration pollWait = const Duration(milliseconds: 1500),
  Duration perAddress = const Duration(milliseconds: 600),
}) async {
  final probe = DirectProbe(ip, uid);
  await art.syncInterfaces();
  final node = art.attachNode(ip);
  probe.node = node;
  probe.broadcast = !art.isLocal(ip);
  probe.pollReplied = await art.pollNode(node, timeout: pollWait) != null;
  final candidates = <PortAddress>[
    if (probe.pollReplied) ...node.rdmAddresses,
    for (var u = 0; u < 16; u++) PortAddress(0, 0, u),
  ];
  final seen = <PortAddress>{};
  var tn = 0;
  for (final address in candidates) {
    if (!seen.add(address)) continue;
    probe.tried++;
    tn = (tn % 255) + 1;
    final request = RdmPacket(
      destination: uid,
      source: art.controllerUid,
      transactionNumber: tn,
      commandClass: Rdm.getCommand,
      pid: Pid.deviceInfo,
      data: Uint8List(0),
    );
    try {
      final response = await art.sendRdm(node, address, request, timeout: perAddress);
      probe.address = address;
      if (response.isAck) {
        try {
          probe.info = DeviceInfo.decode(response.data);
        } on FormatException {
          probe.info = null;
        }
      }
      return probe;
    } on RdmTimeoutException {
      continue;
    }
  }
  return probe;
}
