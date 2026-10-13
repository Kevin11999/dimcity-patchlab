// rdm.js — RDM (ANSI E1.20) messages: building, parsing, UIDs and response codes.
// The transport (Art-Net or RDMnet) carries these bytes; this file knows nothing about the network.

export const CC = { DISC: 0x10, DISC_RESP: 0x11, GET: 0x20, GET_RESP: 0x21, SET: 0x30, SET_RESP: 0x31 };
export const RESP = { ACK: 0x00, ACK_TIMER: 0x01, NACK: 0x02, ACK_OVERFLOW: 0x03 };

export const NACK_REASONS = {
  0x0000: 'onbekende parameter', 0x0001: 'verkeerd formaat', 0x0002: 'hardwarefout', 0x0003: 'proxy weigert',
  0x0004: 'schrijfbeveiligd', 0x0005: 'commando niet ondersteund', 0x0006: 'waarde buiten bereik',
  0x0007: 'buffer vol', 0x0008: 'pakket te groot', 0x0009: 'sub-device bestaat niet', 0x000A: 'proxy-buffer vol',
  0x000B: 'actie niet ondersteund', 0x000C: 'endpoint-nummer ongeldig', 0x000D: 'endpoint-modus ongeldig', 0x000E: 'onbekende UID'
};

// ---- UIDs: 2 bytes manufacturer + 4 bytes device, written as "XXXX:XXXXXXXX" ----
export function uidToString(buf, off = 0){
  const h = n => buf[off + n].toString(16).padStart(2, '0');
  return (h(0) + h(1) + ':' + h(2) + h(3) + h(4) + h(5)).toUpperCase();
}
export function uidFromString(s){
  const hex = s.replace(/[^0-9a-f]/gi, '');
  if(hex.length !== 12) throw new Error('Ongeldige UID: ' + s);
  return Buffer.from(hex, 'hex');
}
export const BROADCAST_UID = 'FFFF:FFFFFFFF';

// The UID of this program. 0x7FF0–0x7FFF is the manufacturer range E1.20 reserves for prototypes.
export function makeControllerUid(){
  const b = Buffer.alloc(6); b.writeUInt16BE(0x7FF0, 0);
  for(let i = 2; i < 6; i++) b[i] = Math.floor(Math.random() * 256);
  return uidToString(b);
}

// Builds a full RDM message, start code 0xCC up to and including the checksum.
export function buildRdm({ dest, src, tn, portId = 1, subDevice = 0, cc, pid, data = Buffer.alloc(0) }){
  if(data.length > 231) throw new Error('Parameterdata te lang');
  const len = 24 + data.length;                      // message length: start code up to the last data byte
  const b = Buffer.alloc(len + 2);
  b[0] = 0xCC; b[1] = 0x01; b[2] = len;
  uidFromString(dest).copy(b, 3); uidFromString(src).copy(b, 9);
  b[15] = tn & 0xFF; b[16] = portId; b[17] = 0;
  b.writeUInt16BE(subDevice, 18); b[20] = cc; b.writeUInt16BE(pid, 21); b[23] = data.length;
  data.copy(b, 24);
  let sum = 0; for(let i = 0; i < len; i++) sum += b[i];
  b.writeUInt16BE(sum & 0xFFFF, len);
  return b;
}

// Parses an RDM message. `buf` may start with 0xCC or (Art-Net, RDMnet) with the sub-start code 0x01.
export function parseRdm(buf){
  if(buf[0] !== 0xCC) buf = Buffer.concat([Buffer.from([0xCC]), buf]);
  if(buf.length < 26 || buf[1] !== 0x01) return null;
  const len = buf[2];
  if(len < 24 || buf.length < len + 2) return null;
  let sum = 0; for(let i = 0; i < len; i++) sum += buf[i];
  const checksumOk = (sum & 0xFFFF) === buf.readUInt16BE(len);
  const pdl = buf[23];
  return {
    dest: uidToString(buf, 3), src: uidToString(buf, 9), tn: buf[15], responseType: buf[16],
    messageCount: buf[17], subDevice: buf.readUInt16BE(18), cc: buf[20], pid: buf.readUInt16BE(21),
    data: Buffer.from(buf.subarray(24, 24 + pdl)), checksumOk
  };
}

export class RdmError extends Error {
  constructor(message, code){ super(message); this.code = code; }
}
export function nackText(data){
  const r = data.length >= 2 ? data.readUInt16BE(0) : -1;
  return NACK_REASONS[r] || ('NACK 0x' + r.toString(16));
}

// ---- Value helpers ----
export const ascii = b => b.toString('latin1').replace(/\0.*$/s, '').trim();
export const asciiBuf = (s, max = 32) => Buffer.from(String(s).slice(0, max), 'latin1');
export const ipToString = (b, o = 0) => `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`;
export function ipToBuf(s){
  const p = String(s).trim().split('.').map(Number);
  if(p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('Ongeldig IP-adres: ' + s);
  return Buffer.from(p);
}

// Reads an unsigned number of whatever length the device sent (1, 2, 3 or 4 bytes).
export function readAuto(b){
  if(!b.length) return null;
  let v = 0; for(const x of b.subarray(0, 4)) v = v * 256 + x;
  return v;
}
export function writeSized(v, size){
  const b = Buffer.alloc(size); let n = Math.round(Number(v));
  for(let i = size - 1; i >= 0; i--){ b[i] = n & 0xFF; n = Math.floor(n / 256); }
  return b;
}
