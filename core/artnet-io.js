// core/artnet-io.js — UDP side of the Art-Net discovery and configuration (plain Node, no Electron imports, so it can be tested).
import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';
import { ARTNET_PORT, buildPoll, buildAddress, buildIpProg, parsePollReply, opOf, OP } from './artnet.js';

export function broadcastTargets(){
  const out = new Set(['255.255.255.255']);
  for(const list of Object.values(os.networkInterfaces())) for(const i of list || []){
    if(i.family !== 'IPv4' || i.internal) continue;
    const ip = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number);
    out.add(ip.map((x, k) => (x & m[k]) | (~m[k] & 255)).join('.'));
  }
  return [...out];
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ask the network who is there; returns the unique replies (one per IP + bind index)
export async function poll({ timeoutMs = 2000, targets = null, port = ARTNET_PORT, listenPort = ARTNET_PORT } = {}){
  const sock = dgram.createSocket({ type:'udp4', reuseAddr:true });
  const found = new Map();
  sock.on('message', (msg, r) => { if(opOf(msg) === OP.PollReply){ const p = parsePollReply(msg); if(p){ p.from = r.address; found.set(`${p.ip}#${p.bindIndex}`, p); } } });
  await new Promise((res, rej) => { sock.once('error', rej); sock.bind(listenPort, () => { try { sock.setBroadcast(true); } catch {} res(); }); });
  const pkt = buildPoll();
  for(const t of (targets && targets.length ? targets : broadcastTargets())) sock.send(pkt, port, t);
  await sleep(timeoutMs);
  sock.close();
  return [...found.values()];
}
// group replies of one device (bind index 1, 2, 3 …) into one device
export function groupDevices(replies){
  const by = new Map();
  for(const r of replies){
    const k = r.mac && r.mac !== '00:00:00:00:00:00' ? r.mac : r.ip;
    if(!by.has(k)) by.set(k, { ip:r.ip, mac:r.mac, shortName:r.shortName, longName:r.longName, oem:r.oem, net:r.net, sub:r.sub, groups:[] });
    by.get(k).groups.push(r);
  }
  return [...by.values()].map(d => { d.groups.sort((a, b) => a.bindIndex - b.bindIndex); d.ports = d.groups.flatMap(g => g.ports.map((p, i) => ({ ...p, bindIndex:g.bindIndex, slot:i }))); return d; });
}
export async function sendAddress(ip, params, { port = ARTNET_PORT } = {}){
  const sock = dgram.createSocket('udp4'), pkt = buildAddress(params);
  await new Promise((res, rej) => sock.send(pkt, port, ip, e => (e ? rej(e) : res())));
  sock.close();
}
export async function sendIpProg(ip, params, { port = ARTNET_PORT, timeoutMs = 1500 } = {}){
  const sock = dgram.createSocket('udp4'); let reply = null;
  sock.on('message', msg => { if(opOf(msg) === OP.IpProgReply) reply = { ip:[...msg.subarray(16, 20)].join('.'), mask:[...msg.subarray(20, 24)].join('.') }; });
  await new Promise((res, rej) => sock.bind(0, e => (e ? rej(e) : res())));
  await new Promise((res, rej) => sock.send(buildIpProg(params), port, ip, e => (e ? rej(e) : res())));
  await sleep(timeoutMs); sock.close();
  return reply;
}
// is something listening at this address? (switches: web interface)
export function probe(ip, ports = [80, 443], timeoutMs = 900){
  return Promise.all(ports.map(p => new Promise(res => {
    const s = net.connect({ host:ip, port:p, timeout:timeoutMs }); const done = ok => { s.destroy(); res(ok ? p : 0); };
    s.once('connect', () => done(true)); s.once('timeout', () => done(false)); s.once('error', () => done(false));
  }))).then(r => r.filter(Boolean));
}
