// pids.js — the RDM parameters this tool knows: E1.20, E1.37-1, E1.37-2 and the Pixeline IP table.
// Each entry says how to read a GET answer (decode), how to write a SET (encode), what editor the
// screen shows, and whether "copy settings" in the Align tool may copy it to the other fixtures.
import { ascii, asciiBuf, ipToString, ipToBuf, readAuto, writeSized } from './rdm.js';

export const PID = {
  DISC_UNIQUE_BRANCH: 0x0001, DISC_MUTE: 0x0002, DISC_UN_MUTE: 0x0003,
  QUEUED_MESSAGE: 0x0020, STATUS_MESSAGES: 0x0030,
  SUPPORTED_PARAMETERS: 0x0050, PARAMETER_DESCRIPTION: 0x0051, DEVICE_INFO: 0x0060,
  DEVICE_MODEL_DESCRIPTION: 0x0080, MANUFACTURER_LABEL: 0x0081, DEVICE_LABEL: 0x0082,
  FACTORY_DEFAULTS: 0x0090, SOFTWARE_VERSION_LABEL: 0x00C0,
  DMX_PERSONALITY: 0x00E0, DMX_PERSONALITY_DESCRIPTION: 0x00E1, DMX_START_ADDRESS: 0x00F0,
  SENSOR_DEFINITION: 0x0200, SENSOR_VALUE: 0x0201,
  LIST_INTERFACES: 0x0700, IPV4_DHCP_MODE: 0x0703, IPV4_CURRENT_ADDRESS: 0x0705, IPV4_STATIC_ADDRESS: 0x0706,
  INTERFACE_APPLY_CONFIGURATION: 0x0709,
  ENDPOINT_LIST: 0x0900, ENDPOINT_RESPONDERS: 0x090B,
  IDENTIFY_DEVICE: 0x1000, RESET_DEVICE: 0x1001,
  // Pixeline IP (manufacturer specific; only used when the model is a Pixeline IP)
  PX_DEVICE_ID: 0xA033, PX_ARTNET_UNIVERSE: 0xA034, PX_SACN_UNIVERSE: 0xA035, PX_SACN_PRIORITY: 0xA036
};

const num = (size, extra = {}) => ({
  decode: d => readAuto(d.subarray(0, size)),
  encode: v => writeSized(v, size),
  editor: { type: extra.options ? 'select' : 'number', min: extra.min ?? 0, max: extra.max ?? 2 ** (8 * size) - 1, options: extra.options },
  copy: true, ...extra
});
const onOff = (extra = {}) => num(1, { options: { 0: 'Uit', 1: 'Aan' }, ...extra });
const readOnly = (decode, extra = {}) => ({ decode, readOnly: true, ...extra });
const u32 = d => d.length >= 4 ? d.readUInt32BE(0) : readAuto(d);

// "current / count" parameters (CURVE, OUTPUT_RESPONSE_TIME, MODULATION_FREQUENCY): GET answers
// current + count, SET sends only the new number. The labels come from the matching description PID.
const choice = descPid => ({
  decode: d => d[0], encode: v => Buffer.from([Number(v)]), editor: { type: 'select' },
  countFrom: d => d[1], descPid, copy: true, copyData: d => d.subarray(0, 1)
});

export const STANDARD = {
  0x0060: readOnly(null, { name: 'Device info', hidden: true }),
  0x0080: readOnly(ascii, { name: 'Model' }),
  0x0081: readOnly(ascii, { name: 'Fabrikant' }),
  0x0082: { name: 'Label', decode: ascii, encode: v => asciiBuf(v), editor: { type: 'text', maxLength: 32 } },
  0x00C0: readOnly(ascii, { name: 'Software' }),
  0x00E0: { name: 'Mode', hidden: true },
  0x00F0: { name: 'DMX-startadres', hidden: true },
  0x0400: readOnly(u32, { name: 'Apparaaturen' }),
  0x0401: readOnly(u32, { name: 'Lampuren' }),
  0x0402: readOnly(u32, { name: 'Lampstarts' }),
  0x0403: num(1, { name: 'Lampstatus', options: { 0: 'Uit', 1: 'Aan', 2: 'Starten', 3: 'Standby', 4: 'Niet aanwezig', 0x7F: 'Fout' }, copy: false }),
  0x0404: num(1, { name: 'Lamp bij opstarten', options: { 0: 'Uit', 1: 'Via DMX', 2: 'Aan', 3: 'Na kalibratie' } }),
  0x0405: readOnly(u32, { name: 'Aantal keer aangezet' }),
  0x0500: num(1, { name: 'Display omdraaien', options: { 0: 'Uit', 1: 'Aan', 2: 'Automatisch' } }),
  0x0501: num(1, { name: 'Display-helderheid', max: 255 }),
  0x0600: onOff({ name: 'Pan omkeren' }),
  0x0601: onOff({ name: 'Tilt omkeren' }),
  0x0602: onOff({ name: 'Pan/tilt wisselen' }),
  0x1000: { name: 'Identify', hidden: true },
  0x1010: num(1, { name: 'Power-status', options: { 0: 'Volledig uit', 1: 'Shutdown', 2: 'Standby', 0xFF: 'Normaal' }, copy: false }),
  // E1.37-1
  0x0141: { name: 'DMX-uitval gedrag', decode: d => `scène ${d.readUInt16BE(0)}, vertraging ${d.readUInt16BE(2)}, houden ${d.readUInt16BE(4)}, niveau ${d[6]}`, copy: true, readOnlyEdit: true },
  0x0142: { name: 'Opstart gedrag', decode: d => `scène ${d.readUInt16BE(0)}, vertraging ${d.readUInt16BE(2)}, houden ${d.readUInt16BE(4)}, niveau ${d[6]}`, copy: true, readOnlyEdit: true },
  0x0341: { name: 'Minimum niveau', decode: d => `op ${d.readUInt16BE(0)}, af ${d.readUInt16BE(2)}, aan onder min ${d[4] ? 'ja' : 'nee'}`, copy: true, readOnlyEdit: true },
  0x0342: num(2, { name: 'Maximum niveau' }),
  0x0343: { name: 'Dimcurve', ...choice(0x0344) },
  0x0345: { name: 'Reactietijd', ...choice(0x0346) },
  0x0347: { name: 'PWM-frequentie', ...choice(0x0348) },
  0x1040: num(1, { name: 'Identify-modus', options: { 0: 'Stil', 0xFF: 'Opvallend' } }),
  0x1043: num(1, { name: 'Preset samenvoegen', options: { 0: 'Standaard', 1: 'HTP', 2: 'LTP', 3: 'Alleen DMX', 0xFF: 'Anders' } }),
  0x1044: onOff({ name: 'Zelftest bij opstarten' })
};

// ---- Pixeline IP 100 / IP 50 (firmware not public; table from Kevin). ----
// Sizes are a guess from the range; for GET the size the fixture answers with is used, and a SET
// is sent with that same size. Rows without a tick are only shown if the fixture reports them.
const px = (name, extra = {}) => ({ name, decode: readAuto, encode: v => writeSized(v, 1), editor: { type: 'number', min: 0 }, copy: true, autoSize: true, ...extra });
const pxSel = (name, options, extra) => px(name, { editor: { type: 'select', options }, ...extra });
const NOYES = { 0: 'Nee', 1: 'Ja' }, OFFON = { 0: 'Uit', 1: 'Aan' };

export const PIXELINE = {
  0xA002: pxSel('Show-modus', { 0: 'Show 1', 1: 'Show 2', 2: 'Show 3', 3: 'Show 4' }),
  0xA003: pxSel('Primair / secundair', { 0: 'Primair', 1: 'Secundair 1', 2: 'Secundair 2' }),
  0xA004: pxSel('DMX-status', { 0: 'Blackout', 1: 'Hold', 2: 'Manual' }, { ticked: true }),
  0xA005: px('Fade-tijd'),
  0xA006: px('Wachttijd'),
  0xA007: pxSel('Pixelvolgorde omdraaien', NOYES, { ticked: true }),
  0xA008: pxSel('Dimmersnelheid', { 0: 'Snel', 1: 'Vloeiend' }, { ticked: true }),
  0xA009: pxSel('Geluidsmodus', OFFON),
  0xA00A: px('Geluidsgevoeligheid'),
  0xA00F: px('White balance', { ticked: true }),
  0xA010: pxSel('Ventilator', { 0: 'Standaard', 1: 'Stil', 2: 'Theater' }),
  0xA018: { name: 'Foutlog', readOnly: true, ticked: true, decode: d => /^[\x20-\x7e\r\n\t\0]*$/.test(d.toString('latin1')) ? ascii(d) : d.toString('hex').match(/../g)?.join(' ') ?? '' },
  0xA020: px('Offset'),
  0xA021: pxSel('Pan/tilt feedback', NOYES),
  0xA022: pxSel('Blackout bij pan/tilt', NOYES),
  0xA023: pxSel('Kalibratie', OFFON),
  0xA024: px('Kalibratiemodus'),
  0xA025: pxSel('Dimcurve', { 1: 'Lineair', 2: 'Kwadratisch', 3: 'Invers kwadratisch', 4: 'S-curve' }, { ticked: true }),
  0xA026: px('Dimmerfrequentie', { note: 'Frequentie 1–15 (4 = 1200 Hz)' }),
  0xA027: pxSel('Kop omkeren', NOYES),
  0xA028: pxSel('CCT-kalibratie', OFFON),
  0xA029: pxSel('Zonbescherming', OFFON),
  0xA033: px('Device ID', { encode: v => writeSized(v, 4), editor: { type: 'number', min: 1, max: 99999 }, copy: false, ticked: true }),
  0xA034: px('Art-Net universe', { encode: v => writeSized(v, 2), editor: { type: 'number', min: 0, max: 32767 }, copy: false, ticked: true, network: true }),
  0xA035: px('sACN universe', { encode: v => writeSized(v, 2), editor: { type: 'number', min: 1, max: 32000 }, copy: false, ticked: true, network: true }),
  0xA036: px('sACN prioriteit', { editor: { type: 'number', min: 0, max: 200 }, ticked: true })
};
export const PIXELINE_IP_PIDS = [0x0705, 0x0706];
export const isPixeline = model => /pixeline/i.test(model || '') && /ip/i.test(model || '');

// E1.37-2 interface addresses: the GET request carries the interface id (4 bytes).
export function decodeIpv4Current(d){
  return { iface: d.readUInt32BE(0), ip: ipToString(d, 4), mask: d[8], dhcp: d[9] };
}
export function decodeIpv4Static(d){
  return { iface: d.readUInt32BE(0), ip: ipToString(d, 4), mask: d[8] };
}
export function encodeIpv4Static(iface, ip, mask){
  const b = Buffer.alloc(9); b.writeUInt32BE(iface, 0); ipToBuf(ip).copy(b, 4); b[8] = Number(mask);
  return b;
}

// PARAMETER_DESCRIPTION answer (manufacturer PIDs the fixture describes itself).
const DATA_TYPES = { 3: [1, false], 4: [1, true], 5: [2, false], 6: [2, true], 7: [4, false], 8: [4, true] };
export function decodeParameterDescription(d){
  const desc = {
    pid: d.readUInt16BE(0), pdl: d[2], dataType: d[3], cc: d[4], unit: d[6], prefix: d[7],
    min: d.readInt32BE(8), max: d.readInt32BE(12), def: d.readInt32BE(16), name: ascii(d.subarray(20))
  };
  desc.canGet = !!(desc.cc & 1); desc.canSet = !!(desc.cc & 2);
  return desc;
}
// Turns a self-description into a parameter entry like the ones above.
export function paramFromDescription(desc){
  const t = DATA_TYPES[desc.dataType];
  if(desc.dataType === 2) return { name: desc.name, decode: ascii, encode: v => asciiBuf(v, desc.pdl || 32), editor: { type: 'text', maxLength: desc.pdl || 32 }, readOnly: !desc.canSet, copy: desc.canSet, described: true };
  if(t){
    const [size, signed] = t;
    const decode = d => d.length < size ? readAuto(d) : (signed ? d.readIntBE(0, size) : d.readUIntBE(0, size));
    const encode = v => { const b = Buffer.alloc(size); signed ? b.writeIntBE(Number(v), 0, size) : b.writeUIntBE(Number(v), 0, size); return b; };
    return { name: desc.name, decode, encode, editor: { type: 'number', min: desc.min, max: desc.max }, readOnly: !desc.canSet, copy: desc.canSet, described: true };
  }
  return { name: desc.name, decode: d => d.toString('hex').match(/../g)?.join(' ') ?? '', readOnly: true, copy: desc.canSet && desc.canGet, described: true };
}

export function decodeDeviceInfo(d){
  return {
    rdmVersion: d.readUInt16BE(0), modelId: d.readUInt16BE(2), category: d.readUInt16BE(4), softwareId: d.readUInt32BE(6),
    footprint: d.readUInt16BE(10), personality: d[12], personalityCount: d[13], address: d.readUInt16BE(14),
    subDevices: d.readUInt16BE(16), sensors: d[18]
  };
}

export const SENSOR_UNITS = { 0: '', 1: '°C', 2: 'V', 3: 'V', 4: 'A', 5: 'A', 6: 'Hz', 7: 'Ω', 8: 'W', 9: 'kg', 10: 'm', 11: 'm²', 12: 'm³', 13: 'kg/m³', 14: 'm/s', 15: 'm/s²', 16: 'N', 17: 'J', 18: 'Pa', 19: 's', 20: '°', 21: 'sr', 22: 'cd', 23: 'lm', 24: 'lx', 25: 'IRE', 26: 'B' };
export const SENSOR_PREFIX = { 0: 1, 1: 1e-1, 2: 1e-2, 3: 1e-3, 4: 1e-6, 5: 1e-9, 6: 1e-12, 7: 1e-15, 8: 1e-18, 9: 1e-21, 10: 1e-24, 0x11: 10, 0x12: 100, 0x13: 1000, 0x14: 1e6, 0x15: 1e9, 0x16: 1e12, 0x17: 1e15, 0x18: 1e18, 0x19: 1e21, 0x1A: 1e24 };

// Never copied to other fixtures, whatever the fixture says about them.
export const NEVER_COPY = new Set([0x0082, 0x00E0, 0x00F0, 0x1000, 0x1001, 0x0090, 0x0400, 0x0401, 0x0402, 0x0405,
  0x0603, 0x1030, 0x1031, 0x1020, 0x0202, 0x0705, 0x0706, 0x0703, 0x0709, 0xA033, 0xA034, 0xA035]);
