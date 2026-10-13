// rdmnet.js — RDMnet (ANSI E1.33) as a controller: find the broker (mDNS), connect over TCP,
// fetch the list of RDMnet devices and send RDM to them (RPT Request / Notification).
// RDMnet devices answer on endpoint 0 themselves; gateways have endpoints with RDM fixtures behind them.
import net from 'node:net';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { uidToString, uidFromString, parseRdm } from './rdm.js';

export const BROKER_PORT = 5569;   // default; the real port comes from mDNS
const ACN_ID = Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00]);
const ROOT = { RPT: 5, BROKER: 9 };
const BROKER = { CONNECT: 1, CONNECT_REPLY: 2, CLIENT_ENTRY_UPDATE: 3, REDIRECT_V4: 4, FETCH_CLIENT_LIST: 6,
  CONNECTED_CLIENT_LIST: 7, CLIENT_ADD: 8, CLIENT_REMOVE: 9, CLIENT_ENTRY_CHANGE: 10, DISCONNECT: 14, NULL: 15 };
const RPT = { REQUEST: 1, STATUS: 2, NOTIFICATION: 3 };
const CONNECT_CODES = { 0: 'ok', 1: 'scope klopt niet', 2: 'broker zit vol', 3: 'UID dubbel', 4: 'ongeldig client-type', 5: 'ongeldige UID' };
const STATUS_CODES = { 1: 'onbekende RDMnet-UID', 2: 'RDM time-out', 3: 'ongeldig RDM-antwoord', 4: 'onbekende RDM-UID', 5: 'onbekend endpoint', 6: 'broadcast klaar', 7: 'onbekende vector', 8: 'ongeldig bericht', 9: 'ongeldige command class' };

// A PDU with all flags set and a 20-bit length (E1.33 always uses the long form).
function pdu(vector, vectorSize, rest){
  const len = 3 + vectorSize + rest.length;
  const b = Buffer.alloc(3 + vectorSize);
  b[0] = 0xF0 | ((len >> 16) & 0x0F); b.writeUInt16BE(len & 0xFFFF, 1);
  b.writeUIntBE(vector, 3, vectorSize);
  return Buffer.concat([b, rest]);
}
const pduLen = (b, o) => ((b[o] & 0x0F) << 16) | b.readUInt16BE(o + 1);
function* pdus(b, vectorSize){
  let o = 0;
  while(o + 3 + vectorSize <= b.length){
    const len = pduLen(b, o);
    if(len < 3 + vectorSize || o + len > b.length) return;
    yield { vector: b.readUIntBE(o + 3, vectorSize), body: b.subarray(o + 3 + vectorSize, o + len) };
    o += len;
  }
}
const fixed = (s, n) => { const b = Buffer.alloc(n); b.write(s, 'utf8'); return b; };

export class RdmNet extends EventEmitter {
  constructor(controllerUid){
    super();
    this.uid = controllerUid; this.cid = crypto.randomBytes(16);
    this.sock = null; this.rx = Buffer.alloc(0); this.seq = 1; this.pending = new Map();
    this.clients = new Map(); this.connected = false; this.scope = 'default';
  }

  frame(rootVector, data){
    const root = pdu(rootVector, 4, Buffer.concat([this.cid, data]));
    const pre = Buffer.alloc(4); pre.writeUInt32BE(root.length);
    return Buffer.concat([ACN_ID, pre, root]);
  }
  sendBroker(vector, data = Buffer.alloc(0)){ this.sock?.write(this.frame(ROOT.BROKER, pdu(vector, 2, data))); }

  connect(host, port = BROKER_PORT, scope = 'default'){
    this.close(); this.scope = scope;
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port });
      this.sock = sock; this.rx = Buffer.alloc(0);
      const fail = e => { this.connected = false; reject(e); };
      const timer = setTimeout(() => { fail(new Error('Broker antwoordt niet')); sock.destroy(); }, 5000);
      sock.on('error', e => { clearTimeout(timer); fail(e); this.emit('closed', e.message); });
      sock.on('close', () => { this.connected = false; clearInterval(this.heartbeat); this.emit('closed'); });
      sock.on('data', d => this.onData(d));
      sock.on('connect', () => {
        // Broker Connect: scope, E1.33 version, search domain, flags (incremental updates), client entry
        const entry = pdu(5, 4, Buffer.concat([this.cid, uidFromString(this.uid), Buffer.from([0x01]), Buffer.alloc(16)]));
        const ver = Buffer.alloc(2); ver.writeUInt16BE(1);
        this.sendBroker(BROKER.CONNECT, Buffer.concat([fixed(scope, 63), ver, fixed('local.', 231), Buffer.from([0x01]), entry]));
      });
      this.once('connectReply', code => {
        clearTimeout(timer);
        if(code !== 0) { sock.destroy(); return reject(new Error('Broker weigert: ' + (CONNECT_CODES[code] || code))); }
        this.connected = true;
        this.heartbeat = setInterval(() => this.sendBroker(BROKER.NULL), 15000);
        this.sendBroker(BROKER.FETCH_CLIENT_LIST);
        resolve();
      });
    });
  }
  close(){ clearInterval(this.heartbeat); if(this.sock){ try { this.sendBroker(BROKER.DISCONNECT, Buffer.from([0, 0])); } catch {} this.sock.destroy(); } this.sock = null; this.connected = false; this.clients.clear(); }

  onData(d){
    this.rx = Buffer.concat([this.rx, d]);
    while(this.rx.length >= 16){
      if(!this.rx.subarray(0, 12).equals(ACN_ID)){ this.sock.destroy(); return; }
      const size = this.rx.readUInt32BE(12);
      if(this.rx.length < 16 + size) return;
      const block = this.rx.subarray(16, 16 + size);
      this.rx = this.rx.subarray(16 + size);
      for(const root of pdus(block, 4)){
        const data = root.body.subarray(16);                 // after the sender CID
        if(root.vector === ROOT.BROKER) for(const p of pdus(data, 2)) this.onBroker(p.vector, p.body);
        if(root.vector === ROOT.RPT) for(const p of pdus(data, 4)) this.onRpt(p.vector, p.body);
      }
    }
  }

  onBroker(vector, body){
    if(vector === BROKER.CONNECT_REPLY) this.emit('connectReply', body.readUInt16BE(0));
    else if(vector === BROKER.CONNECTED_CLIENT_LIST || vector === BROKER.CLIENT_ADD || vector === BROKER.CLIENT_ENTRY_CHANGE){
      if(vector === BROKER.CONNECTED_CLIENT_LIST) this.clients.clear();
      for(const e of pdus(body, 4)){
        if(e.vector !== 5 || e.body.length < 39) continue;   // only RPT clients
        const uid = uidToString(e.body, 16), type = e.body[22];
        if(type === 0x00) this.clients.set(uid, { uid });     // 0 = device, 1 = controller
      }
      this.emit('clients', [...this.clients.values()]);
    } else if(vector === BROKER.CLIENT_REMOVE){
      for(const e of pdus(body, 4)) if(e.body.length >= 22) this.clients.delete(uidToString(e.body, 16));
      this.emit('clients', [...this.clients.values()]);
    } else if(vector === BROKER.DISCONNECT) this.close();
  }

  onRpt(vector, body){
    if(body.length < 21) return;
    const seq = body.readUInt32BE(14), data = body.subarray(21);
    const wait = this.pending.get(seq);
    if(!wait) return;
    if(vector === RPT.STATUS){
      for(const s of pdus(data, 2)) wait.done({ error: 'RDMnet: ' + (STATUS_CODES[s.vector] || 'status ' + s.vector) });
    } else if(vector === RPT.NOTIFICATION){
      for(const n of pdus(data, 4)){
        let answer = null;
        for(const c of pdus(n.body, 1)){                     // first may be the original command, last is the answer
          const r = parseRdm(c.body);
          if(r && (r.cc & 1)) answer = r;
        }
        if(answer) wait.done(answer);
      }
    }
  }

  // Sends one RDM message (with 0xCC start code) to an RDMnet device or to a fixture behind one of its endpoints.
  rdm(rptUid, endpoint, rdmBuf, ms = 3000){
    if(!this.connected) return Promise.resolve({ error: 'Niet verbonden met een RDMnet-broker' });
    const seq = this.seq++ >>> 0;
    const head = Buffer.alloc(21);
    uidFromString(this.uid).copy(head, 0); head.writeUInt16BE(0, 6);
    uidFromString(rptUid).copy(head, 8); head.writeUInt16BE(endpoint, 14); head.writeUInt32BE(seq, 16);
    const cmd = pdu(0xCC, 1, rdmBuf.subarray(1));
    const msg = this.frame(ROOT.RPT, pdu(RPT.REQUEST, 4, Buffer.concat([head.subarray(0, 21), pdu(1, 4, cmd)])));
    return new Promise(resolve => {
      const t = setTimeout(() => { this.pending.delete(seq); resolve(null); }, ms);
      this.pending.set(seq, { done: v => { clearTimeout(t); this.pending.delete(seq); resolve(v); } });
      this.sock.write(msg);
    });
  }
}

// ---- mDNS: find brokers that announce _rdmnet._tcp for a scope ----
function dnsName(name){
  return Buffer.concat([...name.split('.').filter(Boolean).map(l => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])), Buffer.from([0])]);
}
function readName(b, o){
  const labels = []; let jumped = false, end = o, guard = 0;
  while(o < b.length && guard++ < 64){
    const len = b[o];
    if(len === 0){ o++; break; }
    if((len & 0xC0) === 0xC0){ if(!jumped) end = o + 2; jumped = true; o = ((len & 0x3F) << 8) | b[o + 1]; continue; }
    labels.push(b.subarray(o + 1, o + 1 + len).toString()); o += 1 + len;
  }
  return { name: labels.join('.'), end: jumped ? end : o };
}

export function findBrokers(scope = 'default', ms = 2000, bindIp){
  return new Promise(resolve => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const service = `_${scope}._sub._rdmnet._tcp.local`;
    const srv = new Map(), addr = new Map(), ptr = new Set();
    sock.on('message', b => {
      try {
        const qd = b.readUInt16BE(4), records = b.readUInt16BE(6) + b.readUInt16BE(8) + b.readUInt16BE(10);
        let o = 12;
        for(let i = 0; i < qd; i++) o = readName(b, o).end + 4;
        for(let i = 0; i < records; i++){
          const n = readName(b, o); o = n.end;
          const type = b.readUInt16BE(o), rdlen = b.readUInt16BE(o + 8), rd = o + 10;
          if(type === 12) ptr.add(readName(b, rd).name);
          if(type === 33) srv.set(n.name, { port: b.readUInt16BE(rd + 4), target: readName(b, rd + 6).name });
          if(type === 1) addr.set(n.name, `${b[rd]}.${b[rd + 1]}.${b[rd + 2]}.${b[rd + 3]}`);
          o = rd + rdlen;
        }
      } catch {}
    });
    sock.on('error', () => {});
    sock.bind(0, () => {
      try { if(bindIp) sock.setMulticastInterface(bindIp); } catch {}
      const q = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), dnsName(service), Buffer.from([0, 12, 0x80, 1])]);  // PTR, unicast reply wanted
      sock.send(q, 5353, '224.0.0.251');
      setTimeout(() => sock.send(q, 5353, '224.0.0.251'), 500);
    });
    setTimeout(() => {
      try { sock.close(); } catch {}
      const out = [];
      for(const [name, s] of srv) if(!ptr.size || ptr.has(name)) out.push({ name: name.split('.')[0], host: addr.get(s.target), port: s.port });
      resolve(out.filter(x => x.host));
    }, ms);
  });
}
