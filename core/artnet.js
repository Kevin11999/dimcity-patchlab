// core/artnet.js — the Art-Net packets PatchLab needs to find nodes and to send them their configuration.
// Pure functions on Buffers (no network here), so they work in the app and in tests.
//   ArtPoll        0x2000  ask every node to introduce itself
//   ArtPollReply   0x2100  a node introducing itself (IP, MAC, names, ports, universes)
//   ArtAddress     0x6000  set names and port universes on a node (per bind index = per group of 4 ports)
//   ArtIpProg      0xF800  set IP address / subnet (reply 0xF900)
// Layout follows the Art-Net 4 specification.
export const ARTNET_PORT = 6454;
export const OP = { Poll:0x2000, PollReply:0x2100, Address:0x6000, IpProg:0xf800, IpProgReply:0xf900 };
const ID = Buffer.from('Art-Net\0', 'ascii');
const PROTVER = 14;

const head = (op, len) => { const b = Buffer.alloc(len); ID.copy(b, 0); b.writeUInt16LE(op, 8); return b; };
const cstr = (buf, off, len) => { let e = off; while(e < off + len && buf[e] !== 0) e++; return buf.toString('latin1', off, e); };
const putStr = (buf, off, len, s) => { buf.fill(0, off, off + len); Buffer.from(String(s ?? ''), 'latin1').copy(buf, off, 0, len - 1); };

export function buildPoll(){
  const b = head(OP.Poll, 14);
  b.writeUInt8(0, 10); b.writeUInt8(PROTVER, 11);
  b.writeUInt8(0x06, 12);     // TalkToMe: send a reply on every change, and diagnostics off
  b.writeUInt8(0x10, 13);     // priority
  return b;
}
export function opOf(buf){
  if(!Buffer.isBuffer(buf) || buf.length < 10 || !buf.subarray(0, 8).equals(ID)) return null;
  return buf.readUInt16LE(8);
}
export function parsePollReply(buf){
  if(opOf(buf) !== OP.PollReply || buf.length < 207) return null;
  const ip = [...buf.subarray(10, 14)].join('.');
  const mac = [...buf.subarray(201, 207)].map(x => x.toString(16).padStart(2, '0')).join(':');
  const net = buf[18], sub = buf[19];
  const nports = (buf[172] << 8) | buf[173];
  const ports = [];
  for(let i = 0; i < Math.min(4, nports); i++){
    const type = buf[174 + i];
    ports.push({ index:i, output:!!(type & 0x80), input:!!(type & 0x40), swIn:buf[186 + i] & 0x0f, swOut:buf[190 + i] & 0x0f,
      outUniverse:(net << 8) | (sub << 4) | (buf[190 + i] & 0x0f), inUniverse:(net << 8) | (sub << 4) | (buf[186 + i] & 0x0f) });
  }
  return {
    ip, mac, port:buf.readUInt16LE(14), oem:(buf[20] << 8) | buf[21], esta:(buf[25] << 8) | buf[24],
    shortName:cstr(buf, 26, 18), longName:cstr(buf, 44, 64), report:cstr(buf, 108, 64),
    net, sub, numPorts:nports, ports, style:buf[200], bindIp:buf.length >= 211 ? [...buf.subarray(207, 211)].join('.') : ip,
    bindIndex:buf.length >= 212 ? buf[211] : 1, dhcp:buf.length >= 213 ? !!(buf[212] & 0x04) : null
  };
}
// Build an ArtPollReply (used by the simulated node in tests and in the demo)
export function buildPollReply(n){
  const b = head(OP.PollReply, 239);
  String(n.ip).split('.').forEach((x, i) => b.writeUInt8(Number(x), 10 + i));
  b.writeUInt16LE(ARTNET_PORT, 14);
  b.writeUInt8(n.net || 0, 18); b.writeUInt8(n.sub || 0, 19);
  b.writeUInt8(0x01, 24);
  putStr(b, 26, 18, n.shortName); putStr(b, 44, 64, n.longName); putStr(b, 108, 64, n.report || '#0001 [0000] OK');
  const ports = n.ports || []; b.writeUInt16BE(Math.min(4, ports.length), 172);
  ports.slice(0, 4).forEach((p, i) => { b[174 + i] = p.output ? 0x80 : 0x40; b[190 + i] = p.swOut & 0x0f; b[186 + i] = (p.swIn ?? 0) & 0x0f; });
  b[200] = 0x00;
  String(n.mac).split(':').forEach((x, i) => b.writeUInt8(parseInt(x, 16), 201 + i));
  String(n.bindIp || n.ip).split('.').forEach((x, i) => b.writeUInt8(Number(x), 207 + i));
  b[211] = n.bindIndex || 1;
  return b;
}
// ArtAddress: null = leave unchanged. swOut = array of up to 4 universe low nibbles (0-15) or null per slot.
export function buildAddress({ net = null, sub = null, bindIndex = 1, shortName = null, longName = null, swOut = [], swIn = [] }){
  const b = head(OP.Address, 107);
  b.writeUInt8(0, 10); b.writeUInt8(PROTVER, 11);
  b[12] = net == null ? 0x7f : (0x80 | (net & 0x7f));
  b[13] = bindIndex;
  if(shortName != null) putStr(b, 14, 18, shortName);
  if(longName != null) putStr(b, 32, 64, longName);
  for(let i = 0; i < 4; i++){
    b[96 + i] = swIn[i] == null ? 0x7f : (0x80 | (swIn[i] & 0x0f));
    b[100 + i] = swOut[i] == null ? 0x7f : (0x80 | (swOut[i] & 0x0f));
  }
  b[104] = sub == null ? 0x7f : (0x80 | (sub & 0x0f));
  b[105] = 0xff;     // AcnPriority: no change
  b[106] = 0x00;     // Command: none
  return b;
}
export function parseAddress(buf){
  if(opOf(buf) !== OP.Address || buf.length < 107) return null;
  const d = v => (v === 0x7f ? null : v & 0x0f);
  return { net:buf[12] === 0x7f ? null : buf[12] & 0x7f, bindIndex:buf[13], shortName:cstr(buf, 14, 18) || null, longName:cstr(buf, 32, 64) || null,
    swOut:[0, 1, 2, 3].map(i => d(buf[100 + i])), swIn:[0, 1, 2, 3].map(i => d(buf[96 + i])), sub:buf[104] === 0x7f ? null : buf[104] & 0x0f };
}
// ArtIpProg: set the IP address and/or the subnet mask
export function buildIpProg({ ip = null, mask = null }){
  const b = head(OP.IpProg, 34);
  b.writeUInt8(0, 10); b.writeUInt8(PROTVER, 11);
  let cmd = 0x80;                         // enable programming
  if(ip){ cmd |= 0x04; String(ip).split('.').forEach((x, i) => b.writeUInt8(Number(x), 16 + i)); }
  if(mask){ cmd |= 0x02; String(mask).split('.').forEach((x, i) => b.writeUInt8(Number(x), 20 + i)); }
  b[14] = cmd;
  return b;
}
export function parseIpProg(buf){
  if(opOf(buf) !== OP.IpProg || buf.length < 34) return null;
  const c = buf[14];
  return { enable:!!(c & 0x80), dhcp:!!(c & 0x40), setIp:!!(c & 0x04), setMask:!!(c & 0x02), ip:[...buf.subarray(16, 20)].join('.'), mask:[...buf.subarray(20, 24)].join('.') };
}
export function buildIpProgReply(ip, mask, dhcp = false){
  const b = head(OP.IpProgReply, 34);
  b[11] = PROTVER;
  String(ip).split('.').forEach((x, i) => b.writeUInt8(Number(x), 16 + i));
  String(mask).split('.').forEach((x, i) => b.writeUInt8(Number(x), 20 + i));
  b[26] = dhcp ? 0x40 : 0;
  return b;
}
// universe number as shown in PatchLab (1-based) ↔ Art-Net port-address (0-based) with an offset
export const toArtnet = (uni, offset = -1) => Math.max(0, Number(uni) + offset);
export const fromArtnet = (addr, offset = -1) => Number(addr) - offset;
