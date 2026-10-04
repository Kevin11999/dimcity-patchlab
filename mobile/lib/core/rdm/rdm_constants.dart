/// ANSI E1.20 (RDM) constants, plus the E1.33 / E1.37-7 parameters this app uses.
class Rdm {
  Rdm._();

  static const startCode = 0xCC;
  static const subStartCode = 0x01;

  /// Message length field = bytes from START code through the last data byte.
  static const headerLength = 24;
  static const maxDataLength = 231;

  // Command classes (Table A-2).
  static const discoveryCommand = 0x10;
  static const discoveryCommandResponse = 0x11;
  static const getCommand = 0x20;
  static const getCommandResponse = 0x21;
  static const setCommand = 0x30;
  static const setCommandResponse = 0x31;

  // Response types (Table A-3).
  static const responseAck = 0x00;
  static const responseAckTimer = 0x01;
  static const responseNackReason = 0x02;
  static const responseAckOverflow = 0x03;

  static const rootDevice = 0x0000;
  static const allSubDevices = 0xFFFF;

  // Status types for QUEUED_MESSAGE (Table A-4).
  static const statusNone = 0x00;
  static const statusGetLastMessage = 0x01;
  static const statusAdvisory = 0x02;
  static const statusWarning = 0x03;
  static const statusError = 0x04;

  // RESET_DEVICE values.
  static const resetWarm = 0x01;
  static const resetCold = 0xFF;

  // ESTA prototyping manufacturer range.
  static const prototypeManufacturerMin = 0x7FF0;
  static const prototypeManufacturerMax = 0x7FFF;
}

/// Parameter IDs (Table A-3 of E1.20, E1.33 Table A-15, E1.37-7).
class Pid {
  Pid._();

  static const discUniqueBranch = 0x0001;
  static const discMute = 0x0002;
  static const discUnMute = 0x0003;
  static const queuedMessage = 0x0020;
  static const statusMessages = 0x0030;
  static const supportedParameters = 0x0050;
  static const parameterDescription = 0x0051;
  static const deviceInfo = 0x0060;
  static const productDetailIdList = 0x0070;
  static const deviceModelDescription = 0x0080;
  static const manufacturerLabel = 0x0081;
  static const deviceLabel = 0x0082;
  static const factoryDefaults = 0x0090;
  static const softwareVersionLabel = 0x00C0;
  static const bootSoftwareVersionId = 0x00C1;
  static const bootSoftwareVersionLabel = 0x00C2;
  static const dmxPersonality = 0x00E0;
  static const dmxPersonalityDescription = 0x00E1;
  static const dmxStartAddress = 0x00F0;
  static const slotInfo = 0x0120;
  static const sensorDefinition = 0x0200;
  static const sensorValue = 0x0201;
  static const deviceHours = 0x0400;
  static const lampHours = 0x0401;
  static const lampStrikes = 0x0402;
  static const lampState = 0x0403;
  static const devicePowerCycles = 0x0405;
  static const identifyDevice = 0x1000;
  static const resetDevice = 0x1001;
  static const powerState = 0x1010;

  // ANSI E1.37-2 (IPv4 and DNS configuration over RDM), listed by name only.
  static const listInterfaces = 0x0700;
  static const interfaceLabel = 0x0701;
  static const interfaceHardwareAddressType1 = 0x0702;
  static const ipv4DhcpMode = 0x0703;
  static const ipv4ZeroconfMode = 0x0704;
  static const ipv4CurrentAddress = 0x0705;
  static const ipv4StaticAddress = 0x0706;
  static const interfaceRenewDhcp = 0x0707;
  static const interfaceReleaseDhcp = 0x0708;
  static const interfaceApplyConfiguration = 0x0709;
  static const ipv4DefaultRoute = 0x070A;
  static const dnsIpv4NameServer = 0x070B;
  static const dnsHostname = 0x070C;
  static const dnsDomainName = 0x070D;

  // ANSI E1.33 (RDMnet) management.
  static const componentScope = 0x0800;
  static const searchDomain = 0x0801;
  static const tcpCommsStatus = 0x0802;
  static const brokerStatus = 0x0803;

  // ANSI E1.37-7 (gateway endpoints).
  static const endpointList = 0x0900;
  static const endpointListChange = 0x0901;
  static const identifyEndpoint = 0x0902;
  static const endpointToUniverse = 0x0903;
  static const endpointMode = 0x0904;
  static const endpointLabel = 0x0905;
  static const rdmTrafficEnable = 0x0906;
  static const discoveryState = 0x0907;
  static const backgroundDiscovery = 0x0908;
  static const endpointResponders = 0x090B;
  static const endpointResponderListChange = 0x090C;

  static String name(int pid) => _names[pid] ?? '0x${pid.toRadixString(16).padLeft(4, '0').toUpperCase()}';

  static const _names = <int, String>{
    discUniqueBranch: 'DISC_UNIQUE_BRANCH',
    discMute: 'DISC_MUTE',
    discUnMute: 'DISC_UN_MUTE',
    queuedMessage: 'QUEUED_MESSAGE',
    statusMessages: 'STATUS_MESSAGES',
    supportedParameters: 'SUPPORTED_PARAMETERS',
    parameterDescription: 'PARAMETER_DESCRIPTION',
    deviceInfo: 'DEVICE_INFO',
    productDetailIdList: 'PRODUCT_DETAIL_ID_LIST',
    deviceModelDescription: 'DEVICE_MODEL_DESCRIPTION',
    manufacturerLabel: 'MANUFACTURER_LABEL',
    deviceLabel: 'DEVICE_LABEL',
    factoryDefaults: 'FACTORY_DEFAULTS',
    softwareVersionLabel: 'SOFTWARE_VERSION_LABEL',
    bootSoftwareVersionId: 'BOOT_SOFTWARE_VERSION_ID',
    bootSoftwareVersionLabel: 'BOOT_SOFTWARE_VERSION_LABEL',
    dmxPersonality: 'DMX_PERSONALITY',
    dmxPersonalityDescription: 'DMX_PERSONALITY_DESCRIPTION',
    dmxStartAddress: 'DMX_START_ADDRESS',
    slotInfo: 'SLOT_INFO',
    sensorDefinition: 'SENSOR_DEFINITION',
    sensorValue: 'SENSOR_VALUE',
    deviceHours: 'DEVICE_HOURS',
    lampHours: 'LAMP_HOURS',
    lampStrikes: 'LAMP_STRIKES',
    lampState: 'LAMP_STATE',
    devicePowerCycles: 'DEVICE_POWER_CYCLES',
    identifyDevice: 'IDENTIFY_DEVICE',
    resetDevice: 'RESET_DEVICE',
    powerState: 'POWER_STATE',
    listInterfaces: 'LIST_INTERFACES',
    interfaceLabel: 'INTERFACE_LABEL',
    interfaceHardwareAddressType1: 'INTERFACE_HARDWARE_ADDRESS_TYPE1',
    ipv4DhcpMode: 'IPV4_DHCP_MODE',
    ipv4ZeroconfMode: 'IPV4_ZEROCONF_MODE',
    ipv4CurrentAddress: 'IPV4_CURRENT_ADDRESS',
    ipv4StaticAddress: 'IPV4_STATIC_ADDRESS',
    interfaceRenewDhcp: 'INTERFACE_RENEW_DHCP',
    interfaceReleaseDhcp: 'INTERFACE_RELEASE_DHCP',
    interfaceApplyConfiguration: 'INTERFACE_APPLY_CONFIGURATION',
    ipv4DefaultRoute: 'IPV4_DEFAULT_ROUTE',
    dnsIpv4NameServer: 'DNS_IPV4_NAME_SERVER',
    dnsHostname: 'DNS_HOSTNAME',
    dnsDomainName: 'DNS_DOMAIN_NAME',
    componentScope: 'COMPONENT_SCOPE',
    searchDomain: 'SEARCH_DOMAIN',
    tcpCommsStatus: 'TCP_COMMS_STATUS',
    brokerStatus: 'BROKER_STATUS',
    endpointList: 'ENDPOINT_LIST',
    endpointListChange: 'ENDPOINT_LIST_CHANGE',
    identifyEndpoint: 'IDENTIFY_ENDPOINT',
    endpointToUniverse: 'ENDPOINT_TO_UNIVERSE',
    endpointMode: 'ENDPOINT_MODE',
    endpointLabel: 'ENDPOINT_LABEL',
    rdmTrafficEnable: 'RDM_TRAFFIC_ENABLE',
    discoveryState: 'DISCOVERY_STATE',
    backgroundDiscovery: 'BACKGROUND_DISCOVERY',
    endpointResponders: 'ENDPOINT_RESPONDERS',
    endpointResponderListChange: 'ENDPOINT_RESPONDER_LIST_CHANGE',
  };
}

/// NACK reason codes (Table A-17).
class NackReason {
  NackReason._();

  static const unknownPid = 0x0000;
  static const formatError = 0x0001;
  static const hardwareFault = 0x0002;
  static const proxyReject = 0x0003;
  static const writeProtect = 0x0004;
  static const unsupportedCommandClass = 0x0005;
  static const dataOutOfRange = 0x0006;
  static const bufferFull = 0x0007;
  static const packetSizeUnsupported = 0x0008;
  static const subDeviceOutOfRange = 0x0009;
  static const proxyBufferFull = 0x000A;

  static String describe(int reason) =>
      _text[reason] ?? 'NACK 0x${reason.toRadixString(16).padLeft(4, '0')}';

  static const _text = <int, String>{
    unknownPid: 'Unknown PID',
    formatError: 'Format error',
    hardwareFault: 'Hardware fault',
    proxyReject: 'Proxy reject',
    writeProtect: 'Write protect',
    unsupportedCommandClass: 'Unsupported command class',
    dataOutOfRange: 'Data out of range',
    bufferFull: 'Buffer full',
    packetSizeUnsupported: 'Packet size unsupported',
    subDeviceOutOfRange: 'Sub-device out of range',
    proxyBufferFull: 'Proxy buffer full',
  };
}

/// Sensor types (Table A-12), only the ones shown with a name in the app.
class SensorType {
  SensorType._();

  static const temperature = 0x00;
  static const voltage = 0x01;
  static const current = 0x02;
  static const frequency = 0x03;
  static const power = 0x05;
  static const humidity = 0x19;

  static String name(int type) =>
      const {
        temperature: 'Temperature',
        voltage: 'Voltage',
        current: 'Current',
        frequency: 'Frequency',
        power: 'Power',
        humidity: 'Humidity',
      }[type] ??
      'Sensor $type';
}

/// Sensor units (Table A-13) and prefixes (Table A-14), used to format values.
class SensorUnit {
  SensorUnit._();

  static const none = 0x00;
  static const centigrade = 0x01;
  static const voltsDc = 0x02;
  static const voltsAcPeak = 0x03;
  static const voltsAcRms = 0x04;
  static const ampereDc = 0x05;
  static const ampereAcPeak = 0x06;
  static const ampereAcRms = 0x07;
  static const hertz = 0x08;
  static const ohm = 0x09;
  static const watt = 0x0A;
  static const kilogram = 0x0B;
  static const meters = 0x0C;
  static const second = 0x15;
  static const degree = 0x16;
  static const lumen = 0x19;
  static const lux = 0x1A;
  static const byte = 0x1C;

  static String symbol(int unit) =>
      const {
        none: '',
        centigrade: '°C',
        voltsDc: 'V',
        voltsAcPeak: 'V',
        voltsAcRms: 'V',
        ampereDc: 'A',
        ampereAcPeak: 'A',
        ampereAcRms: 'A',
        hertz: 'Hz',
        ohm: 'Ω',
        watt: 'W',
        kilogram: 'kg',
        meters: 'm',
        second: 's',
        degree: '°',
        lumen: 'lm',
        lux: 'lx',
        byte: 'B',
      }[unit] ??
      '';

  /// Multiplier for a prefix code (Table A-14): deci 0x01 … nano 0x05, kilo 0x11 … giga 0x13.
  static double prefixFactor(int prefix) =>
      const {
        0x00: 1.0,
        0x01: 0.1,
        0x02: 0.01,
        0x03: 0.001,
        0x04: 0.000001,
        0x05: 0.000000001,
        0x06: 0.000000000001,
        0x11: 1000.0,
        0x12: 1000000.0,
        0x13: 1000000000.0,
        0x14: 1000000000000.0,
      }[prefix] ??
      1.0;
}
