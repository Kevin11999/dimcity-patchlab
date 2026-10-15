// core/netwatch.js — automatic discovery: LumiNodes and GigaCores show up by themselves, whatever their IP address (plain Node, no Electron imports).
// Several ways of seeing a device run side by side. Each one reports a sighting; every sighting is checked against the device's own web API.
//   · sweep   the networks of the ticked adapters: the own /24 again and again, the rest of a /16 slowly in the background
//   · mdns    the devices that announce themselves on the network with their name (multicast DNS)
//   · artnet  nodes answer an Art-Net poll with their name and address, to the broadcast address: also from another IP range
//   · lldp    the neighbour table of every switch / node that was found (GET /api/lldp/neighbor) lists the devices next to it with their
//             management address: a device on another IP range still shows up, with the port it hangs on
// A device this computer cannot ask (another IP range) is reported with reach:false, so the window can offer to add an address to this computer.
// A device that stops answering is reported as gone, and as seen again when it comes back.
import dgram from 'node:dgram';
import os from 'node:os';
import net from 'node:net';
import { luminexHttp, luminexIdentify, expandRanges, V6_LINK_LOCAL } from './luminex-http.js';
import { rangesOf } from './netadapters.js';
import { ARTNET_PORT, buildPoll, parsePollReply, opOf, OP } from './artnet.js';

const ip2n = s => s.split('.').reduce((n, o) => n * 256 + Number(o), 0) >>> 0;
const n2ip = n => [24, 16, 8, 0].map(b => (n >>> b) & 255).join('.');
const base24 = ip => ip.slice(0, ip.lastIndexOf('.'));
const LUMI = /luminex|gigacore|lumi\s?node|lumi\s?core/i;       // Araneo itself is not a device to configure
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

async function pool(list, n, fn){ let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while(i < list.length){ const x = list[i++]; try { await fn(x); } catch {} } })); }
function probePort(ip, port, ms){
  return new Promise(res => {
    const sock = net.connect({ host: ip, port }); let done = false;
    const end = ok => { if(done) return; done = true; sock.destroy(); res(ok); };
    sock.setTimeout(ms); sock.on('connect', () => end(true)); sock.on('timeout', () => end(false)); sock.on('error', () => end(false));
  });
}

// ---- multicast DNS: a question, and the answers read back ----
export function dnsQuery(name, type = 12){
  const out = [Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])];
  for(const p of String(name).split('.').filter(Boolean)){ const b = Buffer.from(p, 'utf8'); out.push(Buffer.from([b.length]), b); }
  out.push(Buffer.from([0, 0, type, 0, 1]));
  return Buffer.concat(out);
}
// the records of an answer: { name, type, data } (A = address, PTR = name, SRV = { port, target }, TXT = [strings]); null when it is not an answer
export function dnsParse(buf){
  if(!buf || buf.length < 12 || !(buf[2] & 0x80)) return null;
  const qd = buf.readUInt16BE(4), total = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  const name = at => {
    const labels = []; let p = at, next = -1, hops = 0;
    for(;;){
      if(p >= buf.length || hops > 20) throw new Error('bad name');
      const l = buf[p];
      if(l === 0){ p++; break; }
      if((l & 0xc0) === 0xc0){ if(next < 0) next = p + 2; p = ((l & 0x3f) << 8) | buf[p + 1]; hops++; continue; }
      labels.push(buf.toString('utf8', p + 1, p + 1 + l)); p += 1 + l;
    }
    return [labels.join('.'), next < 0 ? p : next];
  };
  try {
    let o = 12;
    for(let i = 0; i < qd; i++) o = name(o)[1] + 4;
    const rr = [];
    for(let i = 0; i < total; i++){
      const [nm, n] = name(o); o = n;
      const type = buf.readUInt16BE(o), len = buf.readUInt16BE(o + 8), d = o + 10; o = d + len;
      let data = null;
      if(type === 1 && len === 4) data = `${buf[d]}.${buf[d + 1]}.${buf[d + 2]}.${buf[d + 3]}`;
      else if(type === 28 && len === 16) data = Array.from({ length:8 }, (_, i) => buf.readUInt16BE(d + i * 2).toString(16)).join(':');
      else if(type === 12) data = name(d)[0];
      else if(type === 33) data = { port: buf.readUInt16BE(d + 4), target: name(d + 6)[0] };
      else if(type === 16){ data = []; for(let q = d; q < d + len; q += 1 + buf[q]) data.push(buf.toString('utf8', q + 1, q + 1 + buf[q])); }
      rr.push({ name: nm, type, data });
    }
    return rr;
  } catch { return null; }
}

// What a Luminex device says about itself when it is asked for _luminex._tcp.local (mDNS: PTR + SRV + TXT + A + AAAA in one answer), or null when the answer is not from one.
//   { name, product, serial, mac, firmware, ipv4, v6 }  v6 = its IPv6 link-local address (fe80::…), without a zone
export function luminexAnswer(rr){
  if(!Array.isArray(rr) || !rr.some(r => (r.type === 12 && /_luminex\._tcp\.local$/i.test(String(r.data || ''))) || /_luminex\._tcp\.local$/i.test(String(r.name || '')))) return null;
  const t = {}; for(const r of rr) if(r.type === 16) for(const kv of r.data || []){ const i = String(kv).indexOf('='); if(i > 0) t[String(kv).slice(0, i).toLowerCase()] = String(kv).slice(i + 1); }
  const a = rr.find(r => r.type === 1)?.data, g = rr.find(r => r.type === 28 && /^fe80:/i.test(String(r.data || '')))?.data;
  const ipv4 = String(t.ip_address || '').split('/')[0].trim() || a || '';
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4)) return null;
  return { name: t.device_name || '', product: t.product_type || '', serial: t.serial || '', mac: t.mac || '', firmware: t.firmware_version || '', ipv4, v6: g || '' };
}
// the link-local zones of the ticked adapters: the number on Windows, the name elsewhere (a fe80:: address only means something together with the adapter it is reached on)
export function linkLocalZones(adapterNames, ifaces = os.networkInterfaces(), platform = process.platform){
  const out = [];
  for(const [name, list] of Object.entries(ifaces || {})){
    if(adapterNames && !adapterNames.includes(name)) continue;
    const l = (list || []).find(x => (x.family === 'IPv6' || x.family === 6) && /^fe80:/i.test(x.address || '') && !x.internal);
    if(l) out.push(platform === 'win32' ? String(l.scopeid) : name);
  }
  return [...new Set(out)].filter(z => V6_LINK_LOCAL.test(`fe80::1%${z}`));
}

// ---- LLDP: what GET /api/lldp/neighbor says (GigaCore: per port the system name, description, management address, MAC; the LumiNode answers the same path) ----
const txt = v => (v == null ? '' : String(Array.isArray(v) ? v.join(',') : v));
export function parseNeighbors(data){
  const list = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data) : [], out = [];
  for(const n of list){
    if(!n || typeof n !== 'object') continue;
    const get = (...keys) => { for(const k of keys) if(n[k] != null && n[k] !== '') return txt(n[k]); return ''; };
    const ips = (get('mgmt_address', 'management_address', 'mgmt_ip', 'mgmt', 'address').match(IPV4) || []).filter(ip => ip.split('.').every(o => Number(o) <= 255) && !ip.startsWith('0.') && ip !== '255.255.255.255');
    out.push({ port: n.port_number ?? n.local_port ?? n.port ?? null, name: get('sys_name', 'system_name', 'name'), desc: get('sys_description', 'system_description', 'description'), ips, mac: get('source_address', 'chassis_id', 'mac_address', 'mac'), remote: get('remote_port', 'port_id') });
  }
  return out;
}

// ---- the watcher ----
//   getAdapters()   → the ticked adapters (asked again every few seconds: a dongle that is plugged in later is picked up)
//   onSeen(dev)     a device was found, found again after it was gone, or learned something new:
//                   { ip, kind: lumi | gigacore | unknown, name, longName, model, version, auth, via: [sweep|mdns|lldp], reach, gone, from?, port? }
//   onGone(ip)      a device stopped answering
//   onState(state)  { running, adapters, mdns, sweep: { round, done, total }, found, errors }
export function createWatcher({ getAdapters = async () => [], range = '', user, pass, https: useTls = false, seed = [], identify = luminexIdentify, zonesOf = linkLocalZones, onSeen = () => {}, onGone = () => {}, onState = () => {} } = {}){
  const port = useTls ? 443 : 80, creds = { user, pass, https: useTls };
  let nets = [], stopped = true, mdnsSock = null, artSock = null, mdnsListen = false, lldpTimer = null;
  const known = new Map(), ignored = new Map(), busy = new Set(), timers = new Set(), joined = new Set();
  const st = { running: false, adapters: [], mdns: 'off', sweep: { round: 0, done: 0, total: 0 }, found: 0, errors: [] };

  let lastEmit = 0, emitTimer = null;
  const send = () => { try { onState({ ...st, sweep: { ...st.sweep }, adapters: st.adapters.slice(), errors: st.errors.slice() }); } catch {} };
  const emitState = () => { const now = Date.now(); if(now - lastEmit >= 500){ lastEmit = now; send(); } else if(!emitTimer){ emitTimer = setTimeout(() => { timers.delete(emitTimer); emitTimer = null; lastEmit = Date.now(); send(); }, 500); timers.add(emitTimer); } };
  const err = (src, e) => { const m = `${src}: ${e?.message || e}`; if(!st.errors.includes(m)){ st.errors.push(m); if(st.errors.length > 6) st.errors.shift(); emitState(); } };
  const rest = ms => new Promise(r => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.add(t); });
  const local = ip => nets.some(n => ((ip2n(ip) & ip2n(n.netmask)) >>> 0) === ((ip2n(n.address) & ip2n(n.netmask)) >>> 0));
  const out = rec => ({ ...rec.dev, via: [...rec.vias], reach: rec.reach !== false, gone: !!rec.gone, from: rec.from, port: rec.port });

  // a device that was identified (or, with reach:false, only heard of): remember it and tell the window about what is new
  function remember(dev, via, { reach = true, from, port: fromPort } = {}){
    if(stopped) return;
    const old = known.get(dev.ip), rec = old || { dev: {}, vias: new Set(), misses: 0, reach };
    const wasGone = !!rec.gone, hadVia = rec.vias.has(via), hadFrom = rec.from;
    for(const [key, v] of Object.entries(dev)) if((v !== '' && v != null) || !(key in rec.dev)) rec.dev[key] = v;      // a later sighting without a name does not wipe the name
    rec.last = Date.now(); rec.misses = 0; rec.gone = false; rec.reach = reach; rec.vias.add(via);
    if(from){ rec.from = from; rec.port = fromPort; }
    known.set(dev.ip, rec); st.found = known.size;
    if(!old || wasGone || !hadVia || (from && from !== hadFrom)) onSeen(out(rec));
    if(reach && (rec.dev.kind === 'gigacore' || rec.dev.kind === 'lumi') && (!old || wasGone)) kickLldp();
    emitState();
  }

  // what the mDNS answer added: serial number, MAC, firmware and the product name
  const withInfo = (dev, info) => (info ? { ...dev, ...(info.serial ? { serial: info.serial } : {}), ...(info.mac ? { mac: dev.mac || info.mac } : {}), ...(info.firmware ? { firmware: info.firmware } : {}), ...(info.product && !dev.model ? { product: info.product } : {}) } : dev);

  // something was seen at this address (by a sweep, by mdns, in an LLDP table): is it one of ours?
  //   opts.portOpen: the caller already knows that the web port answers (the sweep)
  async function check(ip, via, hint = {}, { portOpen = false } = {}){
    if(stopped || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || busy.has(ip)) return;
    const k = known.get(ip), seenBy = hint.observer === 'gigacore' ? { from: hint.from, port: hint.port } : {};
    if(k && k.reach !== false && !k.gone){ k.last = Date.now(); k.misses = 0; if(!k.vias.has(via) || (seenBy.from && seenBy.from !== k.from)) remember(k.dev, via, seenBy); return; }
    if(!k && (ignored.get(ip) || 0) > Date.now()) return;
    busy.add(ip);
    try {
      if(local(ip)){
        if(!portOpen && !(await probePort(ip, port, 700))){ if(!k) ignored.set(ip, Date.now() + 15000); return; }
        const dev = await luminexIdentify({ ip, ...creds, timeoutMs: 1500 }).catch(() => null);
        if(dev) remember(withInfo(dev, hint.info), via, seenBy);
        else if(!k) ignored.set(ip, Date.now() + 180000);                  // something else with a web page: not asked again for a while
      } else {
        // another IP range: first through its IPv6 link-local address (it works on the same cable whatever the IPv4 range is), else only what the sighting says
        if(hint.info?.v6){
          for(const zone of zonesOf([...new Set(nets.map(n => n.adapter))])){
            const v6 = `${hint.info.v6}%${zone}`;
            const dev = await identify({ ip, v6, ...creds, timeoutMs: 1500 }).catch(() => null);
            if(dev){ remember(withInfo(dev, hint.info), via, seenBy); return; }
          }
        }
        const said = `${hint.name || ''} ${hint.desc || ''}`;
        if(LUMI.test(said)) remember(withInfo({ ip, kind: /gigacore/i.test(said) ? 'gigacore' : /lumi/i.test(said) ? 'lumi' : 'unknown', name: hint.name || '', longName: hint.info ? '' : hint.desc || '', model: hint.info && /gigacore/i.test(hint.info.product) ? hint.info.product : '', version: '', auth: false }, hint.info), via, { reach: false, ...seenBy });
        else if(!k) ignored.set(ip, Date.now() + 180000);
      }
    } finally { busy.delete(ip); }
  }

  // ---- the devices that were found keep being asked: gone when they stop answering ----
  async function heartbeat(){
    await pool([...known.entries()], 8, async ([ip, rec]) => {
      if(stopped) return;
      if(rec.reach === false){ if(!rec.gone && Date.now() - rec.last > 90000){ rec.gone = true; onGone(ip); } return; }
      if(await probePort(rec.dev.v6 || ip, port, 800)){ rec.last = Date.now(); rec.misses = 0; if(rec.gone){ rec.gone = false; onSeen(out(rec)); kickLldp(); } }
      else if(++rec.misses >= 2 && !rec.gone){ rec.gone = true; onGone(ip); }
    });
  }

  // ---- LLDP: who hangs next to the devices that were found ----
  function kickLldp(){ if(lldpTimer || stopped) return; lldpTimer = setTimeout(() => { timers.delete(lldpTimer); lldpTimer = null; lldpWalk().catch(e => err('LLDP', e)); }, 1500); timers.add(lldpTimer); }
  async function lldpWalk(){
    const list = [...known.entries()].filter(([, r]) => !r.gone && r.reach !== false && !r.noLldp && (r.dev.kind === 'gigacore' || r.dev.kind === 'lumi'));
    await pool(list, 4, async ([ip, rec]) => {
      if(stopped) return;
      let data;
      try { data = await luminexHttp({ ip, ...(rec.dev.v6 ? { v6: rec.dev.v6 } : {}), path: '/api/lldp/neighbor', ...creds, timeoutMs: 2500 }); }
      catch(e){ if(e.status === 404 || e.status === 405) rec.noLldp = true; return; }
      for(const n of parseNeighbors(data)) for(const nip of n.ips.slice(0, 1)) if(nip !== ip) await check(nip, 'lldp', { name: n.name, desc: n.desc, from: rec.dev.name || ip, port: n.port, observer: rec.dev.kind });
    });
  }

  // ---- multicast DNS ----
  function onMdns(msg, rinfo){
    const rr = dnsParse(msg); if(!rr) return;
    const host = new Map(); for(const r of rr) if(r.type === 1) host.set(r.data, r.name.replace(/\.local$/i, ''));
    const about = rr.filter(r => r.type === 12 || r.type === 33).map(r => `${r.name} ${typeof r.data === 'string' ? r.data : r.data?.target || ''}`).concat(rr.filter(r => r.type === 16).flatMap(r => r.data)).join(' ');
    const la = luminexAnswer(rr);
    if(la){ check(la.ipv4, 'mdns', { name: la.name || la.product, desc: `${la.product} ${about}`, info: la }).catch(() => {}); return; }
    for(const ip of new Set([rinfo.address, ...host.keys()])) check(ip, 'mdns', { name: host.get(ip) || '', desc: about }).catch(() => {});
  }
  async function startMdns(){
    const open = p => new Promise(res => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.once('error', e => { try { s.close(); } catch {} res({ error: e }); });
      s.bind(p, () => { s.removeAllListeners('error'); res({ sock: s }); });
    });
    let r = await open(5353); mdnsListen = !r.error;
    if(r.error) r = await open(0);                 // the port is taken: ask from another port, the answers then come straight back
    if(r.error){ err('mDNS', r.error); return; }
    if(stopped){ try { r.sock.close(); } catch {} return; }
    mdnsSock = r.sock; mdnsSock.on('error', e => err('mDNS', e)); mdnsSock.on('message', onMdns);
    try { mdnsSock.setMulticastTTL(255); mdnsSock.setMulticastLoopback(false); } catch {}
    st.mdns = mdnsListen ? 'listening' : 'asking'; emitState();
    const ask = () => {
      if(mdnsListen) for(const n of nets) if(!joined.has(n.address)){ joined.add(n.address); try { mdnsSock.addMembership('224.0.0.251', n.address); } catch {} }
      for(const n of nets){ try { mdnsSock.setMulticastInterface(n.address); for(const q of ['_luminex._tcp.local', '_services._dns-sd._udp.local', '_workstation._tcp.local', '_http._tcp.local']) mdnsSock.send(dnsQuery(q), 5353, '224.0.0.251'); } catch(e){ err('mDNS', e); } }
    };
    ask(); timers.add(setInterval(ask, 20000));
  }

  // ---- Art-Net ----
  async function startArtnet(){
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('message', msg => { if(opOf(msg) !== OP.PollReply) return; const p = parsePollReply(msg); if(p?.ip) check(p.ip, 'artnet', { name: p.shortName, desc: p.longName }).catch(() => {}); });
    try { await new Promise((res, rej) => { sock.once('error', rej); sock.bind(ARTNET_PORT, () => { sock.removeListener('error', rej); res(); }); }); }
    catch(e){ try { sock.close(); } catch {} err('Art-Net', e); return; }
    if(stopped){ try { sock.close(); } catch {} return; }
    sock.on('error', e => err('Art-Net', e)); artSock = sock;
    try { sock.setBroadcast(true); } catch {}
    const poll = () => {
      const to = new Set(['255.255.255.255', ...nets.map(n => n2ip((ip2n(n.address) | (~ip2n(n.netmask) >>> 0)) >>> 0))]), pkt = buildPoll();
      for(const t of to) try { sock.send(pkt, ARTNET_PORT, t); } catch(e){ err('Art-Net', e); }
    };
    poll(); timers.add(setInterval(poll, 8000));
  }

  // ---- the sweep: the own /24 networks again and again, the rest of the range slowly ----
  function blocks(){
    const ips = expandRanges(String(range || '').trim() || rangesOf([{ addresses: nets }]).join(' '), 262144), by = new Map();
    for(const ip of ips){ const k = base24(ip); if(!by.has(k)) by.set(k, []); by.get(k).push(ip); }
    const own = new Set(nets.map(n => base24(n.address))), near = new Set([...known.keys()].map(base24));
    return [...by.entries()].map(([key, list]) => ({ key, ips: list, own: own.has(key), near: near.has(key) }))
      .sort((a, b) => (b.own - a.own) || (b.near - a.near) || ip2n(a.key + '.0') - ip2n(b.key + '.0'));
  }
  const sweepIps = (ips, conc, tcpMs, tick) => pool(ips, conc, async ip => { if(stopped) return; if(await probePort(ip, port, tcpMs)) await check(ip, 'sweep', {}, { portOpen: true }); if(tick) tick(); });
  async function refreshNets(){
    let list = []; try { list = await getAdapters(); } catch(e){ err('adapters', e); }
    nets = list.flatMap(a => a.addresses.map(x => ({ adapter: a.name, address: x.address, netmask: x.netmask, prefix: x.prefix })));
    st.adapters = list.map(a => ({ name: a.name, label: a.label, kind: a.kind, addresses: a.addresses.map(x => x.address) }));
    emitState();
  }
  async function fastLoop(ready){
    await ready;
    while(!stopped){
      for(const b of blocks().filter(x => x.own)) if(!stopped) await sweepIps(b.ips, 200, 500);
      await rest(6000); if(!stopped) await refreshNets();
    }
  }
  async function slowLoop(ready){
    await ready; await rest(2500);                   // the own networks go first
    for(let round = 1; !stopped; round++){
      const all = blocks().filter(b => !b.own).flatMap(b => b.ips);
      st.sweep = { round, done: 0, total: all.length }; emitState();
      await sweepIps(all, round === 1 ? 300 : 120, 600, () => { st.sweep.done++; emitState(); });
      if(stopped) return;
      st.sweep.done = st.sweep.total; emitState();
      await rest(90000);
    }
  }

  function start(){
    if(!stopped) return;
    stopped = false; st.running = true;
    for(const d of seed || []) if(d?.ip && !known.has(d.ip)) known.set(d.ip, { dev: { ...d }, vias: new Set(d.via || []), misses: 0, last: Date.now(), reach: d.reach !== false });
    st.found = known.size;
    const ready = refreshNets();
    ready.then(() => { if(stopped) return; startMdns().catch(e => err('mDNS', e)); startArtnet().catch(e => err('Art-Net', e)); });
    timers.add(setInterval(() => heartbeat().catch(e => err('heartbeat', e)), 5000));
    timers.add(setInterval(() => lldpWalk().catch(e => err('LLDP', e)), 20000));
    fastLoop(ready).catch(e => err('scan', e)); slowLoop(ready).catch(e => err('scan', e));
    emitState();
  }
  function stop(){
    stopped = true; st.running = false;
    for(const t of timers){ clearTimeout(t); clearInterval(t); } timers.clear();
    try { mdnsSock?.close(); } catch {} mdnsSock = null; st.mdns = 'off';
    try { artSock?.close(); } catch {} artSock = null;
    send();
  }
  return { start, stop, state: () => st };
}
