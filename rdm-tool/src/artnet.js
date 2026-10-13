// artnet.js — Art-Net 4 for RDM: find nodes (ArtPoll), get the list of fixtures behind a port
// (ArtTodRequest/ArtTodData), force a new discovery (ArtTodControl) and send RDM (ArtRdm).
// IP fixtures such as the Pixeline IP answer ArtPoll themselves and appear as a node with one port.
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { uidToString, parseRdm } from './rdm.js';

export const ARTNET_PORT = 6454;
const OP = { POLL: 0x2000, POLL_REPLY: 0x2100, TOD_REQUEST: 0x8000, TOD_DATA: 0x8100, TOD_CONTROL: 0x8200, RDM: 0x8300 };
const ID = Buffer.from('Art-Net\0', 'latin1');

function header(op, size){
  const b = Buffer.alloc(size);
  ID.copy(b, 0); b.writeUInt16LE(op, 8); b[10] = 0; b[11] = 14;     // protocol version 14
  return b;
}
const cstr = (b, off, len) => b.subarray(off, off + len).toString('latin1').replace(/\0.*$/s, '').trim();

export class ArtNet extends EventEmitter {
  constructor(){ super(); this.sock = null; this.broadcast = '255.255.255.255'; this.localIps = new Set(); this.waiters = new Set(); }

  async start({ broadcast, localIps = [] }){
    this.broadcast = broadcast; this.localIps = new Set(localIps);
    if(this.sock) return;
    this.sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.sock.on('message', (msg, rinfo) => this.onMessage(msg, rinfo));
    this.sock.on('error', e => this.emit('error', e));
    await new Promise((res, rej) => { this.sock.once('error', rej); this.sock.bind(ARTNET_PORT, () => { this.sock.off('error', rej); res(); }); });
    this.sock.setBroadcast(true);
  }
  stop(){ try { this.sock?.close(); } catch {} this.sock = null; }

  send(buf, ip){ return new Promise((res, rej) => this.sock.send(buf, ARTNET_PORT, ip, e => e ? rej(e) : res())); }

  // Waits for packets that `match` accepts; resolves with what `done` returns, or with `onTimeout()`.
  wait(match, ms, onTimeout){
    return new Promise(resolve => {
      const w = { match, resolve: v => { clearTimeout(w.t); this.waiters.delete(w); resolve(v); } };
      w.t = setTimeout(() => { this.waiters.delete(w); resolve(onTimeout ? onTimeout() : null); }, ms);
      this.waiters.add(w);
    });
  }

  onMessage(msg, rinfo){
    if(msg.length < 12 || !msg.subarray(0, 8).equals(ID)) return;
    if(this.localIps.has(rinfo.address)) return;            // our own broadcast
    const op = msg.readUInt16LE(8);
    let pkt = null;
    if(op === OP.POLL_REPLY) pkt = parsePollReply(msg, rinfo.address);
    else if(op === OP.TOD_DATA) pkt = parseTodData(msg);
    else if(op === OP.RDM && msg.length > 24) pkt = { net: msg[21], address: msg[23], rdm: parseRdm(msg.subarray(24)) };
    if(!pkt) return;
    pkt.op = op; pkt.from = rinfo.address;
    for(const w of [...this.waiters]) w.match(pkt, w.resolve);
    this.emit('packet', pkt);
  }

  // Broadcasts ArtPoll and collects the replies for `ms` milliseconds. One reply per node per bind index.
  async poll(ms = 2500){
    const b = header(OP.POLL, 14);
    b[12] = 0x00; b[13] = 0x00;                              // flags: just reply, diagnostics off
    const found = new Map();
    const p = this.wait((pkt) => { if(pkt.op === OP.POLL_REPLY) found.set(pkt.ip + '/' + pkt.bindIndex, pkt); }, ms);
    await this.send(b, this.broadcast);
    setTimeout(() => this.send(b, this.broadcast).catch(() => {}), 600);   // a second time: UDP can get lost
    await p;
    return [...found.values()];
  }

  // Asks a node for its Table of Devices on one port (port-address = net<<8 | address).
  async tod(ip, portAddress, ms = 3000){
    const net = (portAddress >> 8) & 0x7F, address = portAddress & 0xFF;
    const b = header(OP.TOD_REQUEST, 56);           // address list is always 32 bytes
    b[21] = net; b[22] = 0x00; b[23] = 1; b[24] = address;   // command TodFull, one address
    const uids = new Set(); let total = -1;
    const p = this.wait((pkt, done) => {
      if(pkt.op !== OP.TOD_DATA || pkt.from !== ip || pkt.net !== net || pkt.address !== address) return;
      if(pkt.nak) return done(null);
      total = pkt.uidTotal; pkt.uids.forEach(u => uids.add(u));
      if(uids.size >= total) done(true);
    }, ms);
    await this.send(b, ip);
    await p;
    return [...uids];
  }

  // Makes the node do a complete new RDM discovery on that port (ArtTodControl AtcFlush).
  async flush(ip, portAddress){
    const b = header(OP.TOD_CONTROL, 24);
    b[21] = (portAddress >> 8) & 0x7F; b[22] = 0x01; b[23] = portAddress & 0xFF;
    await this.send(b, ip);
  }

  // Sends one RDM message (with 0xCC start code) and waits for the matching answer.
  async rdm(ip, portAddress, rdmBuf, ms = 1200){
    const net = (portAddress >> 8) & 0x7F, address = portAddress & 0xFF;
    const b = header(OP.RDM, 24 + rdmBuf.length - 1);
    b[12] = 0x01; b[21] = net; b[22] = 0x00; b[23] = address;   // RDM version 1.0, ArProcess
    rdmBuf.copy(b, 24, 1);                                      // without the start code
    const dest = uidToString(rdmBuf, 3), tn = rdmBuf[15];
    const p = this.wait((pkt, done) => {
      const r = pkt.rdm;
      if(pkt.op === OP.RDM && pkt.from === ip && r && r.src === dest && r.tn === tn && (r.cc & 1)) done(r);
    }, ms);
    await this.send(b, ip);
    return p;
  }
}

function parsePollReply(b, from){
  if(b.length < 207) return null;
  const ip = `${b[10]}.${b[11]}.${b[12]}.${b[13]}`;
  const numPorts = Math.min(4, b.readUInt16BE(172));
  const net = b[18] & 0x7F, sub = b[19] & 0x0F;
  const hasB = b.length >= 217;
  const ports = [];
  for(let i = 0; i < numPorts; i++){
    const type = b[174 + i];
    if(!(type & 0x80)) continue;                             // only ports that output DMX can carry RDM
    ports.push({
      index: i, portAddress: (net << 8) | (sub << 4) | (b[190 + i] & 0x0F),
      rdmDisabled: hasB ? !!(b[213 + i] & 0x80) : false,
      outputting: !!(b[182 + i] & 0x80)
    });
  }
  const mac = [...b.subarray(201, 207)].map(x => x.toString(16).padStart(2, '0')).join(':');
  const defaultUid = b.length >= 224 ? uidToString(b, 218) : null;
  return {
    ip: ip === '0.0.0.0' ? from : ip, shortName: cstr(b, 26, 18), longName: cstr(b, 44, 64), report: cstr(b, 108, 64),
    esta: b.readUInt16LE(24), oem: b.readUInt16BE(20), mac, bindIndex: b.length > 211 ? b[211] : 0,
    style: b[200], ports, defaultUid: defaultUid && !/^0000:00000000$|^FFFF:FFFFFFFF$/.test(defaultUid) ? defaultUid : null,
    rdmCapable: !!(b[23] & 0x02)                              // Status1 bit 1: node can do RDM
  };
}

function parseTodData(b){
  if(b.length < 28) return null;
  const count = b[27], uids = [];
  for(let i = 0; i < count && 28 + i * 6 + 6 <= b.length; i++) uids.push(uidToString(b, 28 + i * 6));
  return { net: b[21], nak: b[22] === 0xFF, address: b[23], uidTotal: b.readUInt16BE(24), block: b[26], uids };
}
