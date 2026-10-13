// engine.js — finds fixtures (Art-Net and RDMnet), reads and writes their RDM settings and carries
// out the Align tool. The screen talks to this through main.js (IPC).
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { CC, RESP, RdmError, buildRdm, nackText, makeControllerUid, ascii, uidToString, writeSized } from './rdm.js';
import { ArtNet } from './artnet.js';
import { RdmNet, findBrokers, BROKER_PORT } from './rdmnet.js';
import {
  PID, STANDARD, PIXELINE, NEVER_COPY, isPixeline, decodeDeviceInfo, decodeParameterDescription, paramFromDescription,
  decodeIpv4Current, decodeIpv4Static, encodeIpv4Static, SENSOR_UNITS, SENSOR_PREFIX
} from './pids.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function listInterfaces(){
  const out = [];
  for(const [name, list] of Object.entries(os.networkInterfaces())){
    for(const a of list || []){
      if(a.family !== 'IPv4' && a.family !== 4 || a.internal) continue;
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
      out.push({ name, ip: a.address, netmask: a.netmask, broadcast: ip.map((x, i) => (x | (~mask[i] & 0xFF))).join('.') });
    }
  }
  return out;
}

export class Engine extends EventEmitter {
  constructor(){
    super();
    this.uid = makeControllerUid();
    this.artnet = new ArtNet();
    this.rdmnet = new RdmNet(this.uid);
    this.devices = new Map();
    this.nodes = [];
    this.tn = 0; this.queues = new Map();
    this.iface = null;
    this.rdmnet.on('closed', () => this.emit('rdmnet', { connected: false }));
  }

  async setInterface(ip){
    const iface = listInterfaces().find(i => i.ip === ip);
    if(!iface) throw new Error('Netwerkkaart niet gevonden');
    this.iface = iface;
    await this.artnet.start({ broadcast: iface.broadcast, localIps: listInterfaces().map(i => i.ip) });
    return iface;
  }

  // ---------- RDM request with retries, ACK_TIMER and ACK_OVERFLOW ----------
  routeKey(dev){ return dev.route.kind === 'artnet' ? 'a:' + dev.route.ip : 'r:' + dev.route.rptUid; }

  // One request at a time per node / RDMnet device, so slow nodes are not flooded.
  queue(key, fn){
    const prev = this.queues.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.queues.set(key, next);
    return next;
  }

  request(dev, cc, pid, data = Buffer.alloc(0)){
    return this.queue(this.routeKey(dev), async () => {
      let collected = Buffer.alloc(0), noAnswer = 0, timers = 0;
      for(;;){
        const tn = this.tn = (this.tn + 1) & 0xFF;
        const buf = buildRdm({ dest: dev.uid, src: this.uid, tn, cc, pid, data });
        const r = dev.route.kind === 'artnet'
          ? await this.artnet.rdm(dev.route.ip, dev.route.portAddress, buf)
          : await this.rdmnet.rdm(dev.route.rptUid, dev.route.endpoint, buf);
        if(!r){ if(++noAnswer >= 3) throw new RdmError('geen antwoord', 'timeout'); continue; }
        if(r.error) throw new RdmError(r.error, 'transport');
        if(r.pid !== pid){ if(++noAnswer >= 3) throw new RdmError('verkeerd antwoord', 'timeout'); continue; }
        if(r.responseType === RESP.NACK) throw new RdmError(nackText(r.data), r.data.length >= 2 ? r.data.readUInt16BE(0) : -1);
        if(r.responseType === RESP.ACK_TIMER){
          const wait = Math.max(100, (r.data.length >= 2 ? r.data.readUInt16BE(0) : 1) * 100);
          await sleep(Math.min(wait, 5000));
          if(cc === CC.SET) return Buffer.alloc(0);          // accepted, the device finishes it on its own
          if(++timers > 5) throw new RdmError('apparaat blijft bezig', 'timer');
          continue;
        }
        collected = Buffer.concat([collected, r.data]);
        if(r.responseType === RESP.ACK_OVERFLOW) continue;    // ask again for the next part
        return collected;
      }
    });
  }
  get(dev, pid, data){ return this.request(dev, CC.GET, pid, data); }
  set(dev, pid, data){ return this.request(dev, CC.SET, pid, data); }
  async tryGet(dev, pid, data){ try { return await this.get(dev, pid, data); } catch { return null; } }

  // ---------- Discovery ----------
  async discoverArtnet({ full = false } = {}){
    if(!this.iface) throw new Error('Kies eerst een netwerkkaart');
    for(const [id, d] of this.devices) if(d.route.kind === 'artnet') this.devices.delete(id);
    this.emit('status', 'Art-Net nodes zoeken…');
    const replies = await this.artnet.poll();
    this.nodes = replies;
    const jobs = [];
    for(const node of replies){
      const ports = node.ports.length ? node.ports : (node.defaultUid ? [{ index: 0, portAddress: 0, rdmDisabled: false }] : []);
      for(const port of ports){
        if(port.rdmDisabled) continue;
        jobs.push((async () => {
          if(full){ await this.artnet.flush(node.ip, port.portAddress); await sleep(4000); }
          let uids = await this.artnet.tod(node.ip, port.portAddress);
          if(!uids.length && node.defaultUid) uids = [node.defaultUid];   // IP fixture that is its own node
          for(const uid of uids){
            const dev = this.addDevice(uid, { kind: 'artnet', ip: node.ip, portAddress: port.portAddress },
              `${node.shortName || node.ip} · poort ${port.index + 1} · universe ${port.portAddress}`);
            dev.nodeName = node.shortName || node.longName;
          }
        })());
      }
    }
    await Promise.all(jobs);
    this.emit('nodes', this.nodeList());
    await this.readAllBasics();
  }

  async discoverRdmnet({ host, port, scope = 'default' } = {}){
    if(!host){
      this.emit('status', 'RDMnet-broker zoeken (mDNS)…');
      const found = await findBrokers(scope, 2000, this.iface?.ip);
      if(!found.length) throw new Error('Geen RDMnet-broker gevonden. Vul het IP-adres van de broker in.');
      ({ host, port } = found[0]);
    }
    this.emit('status', `Verbinden met broker ${host}…`);
    await this.rdmnet.connect(host, port || BROKER_PORT, scope);
    this.emit('rdmnet', { connected: true, host });
    await sleep(800);                                          // the client list comes right after connecting
    for(const [id, d] of this.devices) if(d.route.kind === 'rdmnet') this.devices.delete(id);
    for(const c of this.rdmnet.clients.values()){
      const dev = this.addDevice(c.uid, { kind: 'rdmnet', rptUid: c.uid, endpoint: 0 }, `RDMnet · ${host}`);
      // A gateway: list its endpoints and the fixtures behind each one (E1.37-7)
      const list = await this.tryGet(dev, PID.ENDPOINT_LIST);
      if(!list || list.length < 4) continue;
      for(let o = 4; o + 3 <= list.length; o += 3){
        const ep = list.readUInt16BE(o);
        if(!ep) continue;
        const pd = Buffer.alloc(2); pd.writeUInt16BE(ep);
        const r = await this.tryGet(dev, PID.ENDPOINT_RESPONDERS, pd);
        if(!r) continue;
        for(let u = 6; u + 6 <= r.length; u += 6)
          this.addDevice(uidToString(r, u), { kind: 'rdmnet', rptUid: c.uid, endpoint: ep }, `RDMnet · ${c.uid} · endpoint ${ep}`);
      }
    }
    await this.readAllBasics();
  }

  addDevice(uid, route, group){
    const id = route.kind === 'artnet' ? `a/${route.ip}/${route.portAddress}/${uid}` : `r/${route.rptUid}/${route.endpoint}/${uid}`;
    const dev = { id, uid, route, group, info: null, model: '', manufacturer: '', label: '', personalities: [], supported: null, sizes: {}, descs: {}, error: null };
    this.devices.set(id, dev);
    return dev;
  }

  async readAllBasics(){
    const list = [...this.devices.values()].filter(d => !d.info);
    let n = 0;
    await Promise.all(list.map(async d => {
      try { await this.readBasics(d); } catch(e){ d.error = e.message; }
      this.emit('status', `Lampen uitlezen… ${++n}/${list.length}`);
      this.emit('device', this.summary(d));
    }));
    this.emit('status', `${this.devices.size} lamp(en) gevonden`);
    this.emit('devices', this.deviceList());
  }

  async readBasics(d){
    d.info = decodeDeviceInfo(await this.get(d, PID.DEVICE_INFO));
    d.model = ascii(await this.tryGet(d, PID.DEVICE_MODEL_DESCRIPTION) || Buffer.alloc(0)) || `Model 0x${d.info.modelId.toString(16)}`;
    d.manufacturer = ascii(await this.tryGet(d, PID.MANUFACTURER_LABEL) || Buffer.alloc(0));
    d.label = ascii(await this.tryGet(d, PID.DEVICE_LABEL) || Buffer.alloc(0));
    d.pixeline = isPixeline(d.model);
    const sp = await this.tryGet(d, PID.SUPPORTED_PARAMETERS);
    d.supported = sp ? new Set(Array.from({ length: sp.length >> 1 }, (_, i) => sp.readUInt16BE(i * 2))) : null;
    d.personalities = [];
    for(let p = 1; p <= d.info.personalityCount; p++){
      const r = await this.tryGet(d, PID.DMX_PERSONALITY_DESCRIPTION, Buffer.from([p]));
      d.personalities.push(r && r.length >= 3 ? { n: p, footprint: r.readUInt16BE(1), name: ascii(r.subarray(3)) || `Mode ${p}` } : { n: p, footprint: p === d.info.personality ? d.info.footprint : null, name: `Mode ${p}` });
    }
    if(d.pixeline) await this.readPixelineNetwork(d);
  }

  // Art-Net / sACN universe of a Pixeline (shown in the list and used by the Align tool).
  async readPixelineNetwork(d){
    for(const pid of [PID.PX_ARTNET_UNIVERSE, PID.PX_SACN_UNIVERSE, PID.PX_SACN_PRIORITY]){
      const r = await this.tryGet(d, pid);
      if(r && r.length){ d.sizes[pid] = r.length; d[{ [PID.PX_ARTNET_UNIVERSE]: 'artnetUniverse', [PID.PX_SACN_UNIVERSE]: 'sacnUniverse', [PID.PX_SACN_PRIORITY]: 'sacnPriority' }[pid]] = PIXELINE[pid].decode(r); }
    }
  }

  typeKey(d){ return d.uid.slice(0, 4) + ':' + (d.info?.modelId ?? '?'); }

  summary(d){
    const pers = d.personalities.find(p => p.n === d.info?.personality);
    return {
      id: d.id, uid: d.uid, group: d.group, model: d.model, manufacturer: d.manufacturer, label: d.label, error: d.error,
      address: d.info?.address, footprint: d.info?.footprint, personality: d.info?.personality, personalityName: pers?.name,
      personalities: d.personalities, typeKey: d.info ? this.typeKey(d) : null, pixeline: !!d.pixeline,
      artnetUniverse: d.artnetUniverse, sacnUniverse: d.sacnUniverse, sacnPriority: d.sacnPriority, route: d.route
    };
  }
  deviceList(){ return [...this.devices.values()].map(d => this.summary(d)); }
  nodeList(){ return this.nodes.map(n => ({ ip: n.ip, name: n.shortName, longName: n.longName, report: n.report, mac: n.mac, rdmCapable: n.rdmCapable, ports: n.ports })); }
  dev(id){ const d = this.devices.get(id); if(!d) throw new Error('Lamp niet meer in de lijst'); return d; }

  // ---------- Parameters ----------
  supports(d, pid){ return !d.supported || d.supported.has(pid); }

  // Which parameter entry describes `pid` on this fixture (standard, Pixeline table or self-described).
  async entryFor(d, pid){
    if(STANDARD[pid]) return STANDARD[pid];
    if(pid >= 0x8000 && d.pixeline && PIXELINE[pid]) return PIXELINE[pid];
    if(pid < 0x8000) return null;
    if(!d.descs[pid]){
      const pd = Buffer.alloc(2); pd.writeUInt16BE(pid);
      const r = d.supported?.has(PID.PARAMETER_DESCRIPTION) !== false ? await this.tryGet(d, PID.PARAMETER_DESCRIPTION, pd) : null;
      d.descs[pid] = r && r.length >= 20 ? paramFromDescription(decodeParameterDescription(r)) : { name: `Parameter 0x${pid.toString(16).toUpperCase()}`, decode: b => b.toString('hex').match(/../g)?.join(' ') ?? '', readOnly: true, copy: false };
    }
    return d.descs[pid];
  }

  // The list of parameters to show for a fixture.
  pidList(d){
    let pids;
    if(d.supported) pids = [...d.supported];
    else pids = [...Object.keys(STANDARD).map(Number), ...(d.pixeline ? Object.entries(PIXELINE).filter(([, e]) => e.ticked).map(([p]) => +p) : [])];
    return pids.filter(p => !(STANDARD[p]?.hidden) && (STANDARD[p] || p >= 0x8000)).sort((a, b) => a - b);
  }

  async readDetails(id){
    const d = this.dev(id);
    await this.readBasics(d);
    const params = [];
    for(const pid of this.pidList(d)){
      const e = await this.entryFor(d, pid);
      if(!e) continue;
      const row = { pid, name: e.name, readOnly: !!(e.readOnly || e.readOnlyEdit || !e.encode), editor: e.editor ? { ...e.editor } : null, note: e.note };
      try {
        const r = await this.get(d, pid);
        if(e.autoSize && r.length) d.sizes[pid] = r.length;
        row.value = e.decode ? e.decode(r) : r.toString('hex');
        if(e.descPid && row.editor){                         // labels for curve / response time / frequency
          const opts = {};
          for(let i = 1; i <= (e.countFrom(r) || 0); i++){
            const dr = await this.tryGet(d, e.descPid, Buffer.from([i]));
            opts[i] = dr ? (ascii(dr.subarray(e.descPid === 0x0348 ? 5 : 1)) || `${i}`) : `${i}`;
          }
          row.editor.options = opts;
        }
      } catch(err){
        if(!d.supported && err.code === 0) continue;         // guessed list: skip what the fixture does not know
        row.error = err.message;
      }
      params.push(row);
    }
    const sensors = [];
    for(let s = 0; s < (d.info.sensors || 0); s++){
      const def = await this.tryGet(d, PID.SENSOR_DEFINITION, Buffer.from([s]));
      const val = await this.tryGet(d, PID.SENSOR_VALUE, Buffer.from([s]));
      if(!val || val.length < 3) continue;
      const unit = def ? (SENSOR_UNITS[def[2]] ?? '') : '', factor = def ? (SENSOR_PREFIX[def[3]] ?? 1) : 1;
      sensors.push({ name: def ? ascii(def.subarray(13)) || `Sensor ${s + 1}` : `Sensor ${s + 1}`, value: +(val.readInt16BE(1) * factor).toPrecision(6), unit });
    }
    let network = null;
    if(d.pixeline){
      await this.readPixelineNetwork(d);
      network = await this.readIp(d);
    }
    return { device: this.summary(d), params, sensors, network };
  }

  async readIp(d){
    const lst = await this.tryGet(d, PID.LIST_INTERFACES);
    d.ifaceId = lst && lst.length >= 4 ? lst.readUInt32BE(0) : 1;
    const q = Buffer.alloc(4); q.writeUInt32BE(d.ifaceId);
    const cur = await this.tryGet(d, PID.IPV4_CURRENT_ADDRESS, q);
    const st = await this.tryGet(d, PID.IPV4_STATIC_ADDRESS, q);
    return {
      current: cur && cur.length >= 10 ? decodeIpv4Current(cur) : null,
      static: st && st.length >= 9 ? decodeIpv4Static(st) : null,
      canApply: !d.supported || d.supported.has(PID.INTERFACE_APPLY_CONFIGURATION)
    };
  }

  async setParam(id, pid, value){
    const d = this.dev(id);
    if(pid === PID.DMX_START_ADDRESS){
      const a = Number(value);
      if(!(a >= 1 && a <= 512)) throw new Error('Adres moet tussen 1 en 512 liggen');
      await this.set(d, pid, writeSized(a, 2));
    } else if(pid === PID.DMX_PERSONALITY) await this.set(d, pid, Buffer.from([Number(value)]));
    else if(pid === PID.IPV4_STATIC_ADDRESS){
      await this.set(d, pid, encodeIpv4Static(d.ifaceId ?? 1, value.ip, value.mask));
      if(!d.supported || d.supported.has(PID.INTERFACE_APPLY_CONFIGURATION)){
        const q = Buffer.alloc(4); q.writeUInt32BE(d.ifaceId ?? 1);
        try { await this.set(d, PID.INTERFACE_APPLY_CONFIGURATION, q); } catch {}
      }
      return { reconnect: true };
    } else {
      const e = await this.entryFor(d, pid);
      if(!e?.encode) throw new Error('Deze instelling kan niet gewijzigd worden');
      const data = e.autoSize && d.sizes[pid] ? writeSized(value, d.sizes[pid]) : e.encode(value);
      await this.set(d, pid, data);
      if(pid === PID.PX_ARTNET_UNIVERSE) this.followUniverse(d, Number(value));
    }
    try { d.info = decodeDeviceInfo(await this.get(d, PID.DEVICE_INFO)); } catch {}
    if(pid === PID.DEVICE_LABEL) d.label = String(value);
    if(d.pixeline) await this.readPixelineNetwork(d);
    this.emit('device', this.summary(d));
    return { ok: true };
  }

  // A Pixeline that is its own Art-Net node only listens to ArtRdm on its own universe.
  followUniverse(d, universe){
    if(d.route.kind !== 'artnet') return;
    const node = this.nodes.find(n => n.ip === d.route.ip);
    if(node && node.defaultUid === d.uid || node?.ports.length <= 1) d.route.portAddress = universe;
  }

  async identify(id, on){
    const d = this.dev(id);
    await this.set(d, PID.IDENTIFY_DEVICE, Buffer.from([on ? 1 : 0]));
  }
  async reset(id){ await this.set(this.dev(id), PID.RESET_DEVICE, Buffer.from([0x01])); }

  // ---------- Align: plan and carry out ----------
  // order: device ids in rig order; start: { address, artnet, sacn }; modes: { typeKey: personality }
  planAlign({ order, start, modes }){
    let addr = Number(start.address), k = 0;
    if(!(addr >= 1 && addr <= 512)) throw new Error('Beginadres moet tussen 1 en 512 liggen');
    const plan = [], warnings = [];
    for(const id of order){
      const d = this.dev(id), tk = this.typeKey(d);
      const personality = Number(modes[tk] ?? d.info.personality);
      const fp = d.personalities.find(p => p.n === personality)?.footprint ?? (personality === d.info.personality ? d.info.footprint : null);
      if(fp == null){ warnings.push(`${d.model} (${d.uid}): aantal kanalen van mode ${personality} onbekend`); break; }
      if(addr + Math.max(fp, 1) - 1 > 512){
        if(!d.pixeline){ warnings.push(`${d.model} (${d.uid}) past niet meer in deze universe (adres ${addr} + ${fp} kanalen > 512). Gestopt: de universe van deze lamp kan via RDM niet veranderd worden.`); break; }
        k++; addr = 1;
      }
      if(k > 0 && !d.pixeline){ warnings.push(`${d.model} (${d.uid}) komt na een universe-wissel, maar kan zelf geen universe instellen. Gestopt.`); break; }
      plan.push({ id, personality, address: addr, footprint: fp, universeStep: k, pixeline: !!d.pixeline });
      addr += Math.max(fp, 1);
    }
    return { plan, warnings, complete: plan.length === order.length };
  }

  async runAlign({ order, start, modes }){
    const { plan, warnings, complete } = this.planAlign({ order, start, modes });
    if(!complete) return { done: 0, warnings, errors: [] };
    const errors = [];
    // Settings of the first fixture of each type, to copy to the others of that type.
    const templates = new Map();
    for(const step of plan){
      const d = this.dev(step.id), tk = this.typeKey(d);
      if(!templates.has(tk)){ templates.set(tk, d.id); this.emit('align', { text: `Instellingen van ${d.model} lezen…` }); templates.set(tk + '#data', await this.readCopyable(d)); }
    }
    let n = 0;
    for(const step of plan){
      const d = this.dev(step.id), tk = this.typeKey(d), fail = (what, e) => errors.push(`${d.model} ${d.uid}: ${what} — ${e.message}`);
      this.emit('align', { text: `Lamp ${++n}/${plan.length}: mode ${step.personality}, adres ${step.address}`, id: d.id });
      try { if(d.info.personality !== step.personality) await this.set(d, PID.DMX_PERSONALITY, Buffer.from([step.personality])); } catch(e){ fail('mode', e); }
      try { await this.set(d, PID.DMX_START_ADDRESS, writeSized(step.address, 2)); } catch(e){ fail('adres', e); }
      if(templates.get(tk) !== d.id){
        for(const [pid, data] of templates.get(tk + '#data')){
          try { await this.set(d, pid, data); } catch(e){ fail(`instelling 0x${pid.toString(16)}`, e); }
        }
      }
      if(d.pixeline && start.artnet !== '' && start.artnet != null){
        try { await this.set(d, PID.PX_SACN_UNIVERSE, writeSized(Number(start.sacn) + step.universeStep, d.sizes[PID.PX_SACN_UNIVERSE] || 2)); } catch(e){ fail('sACN universe', e); }
        try {
          const u = Number(start.artnet) + step.universeStep;
          await this.set(d, PID.PX_ARTNET_UNIVERSE, writeSized(u, d.sizes[PID.PX_ARTNET_UNIVERSE] || 2));
          this.followUniverse(d, u);
        } catch(e){ fail('Art-Net universe', e); }
      }
      try { await this.set(d, PID.IDENTIFY_DEVICE, Buffer.from([0])); } catch {}
      try { d.info = decodeDeviceInfo(await this.get(d, PID.DEVICE_INFO)); } catch {}
      if(d.pixeline) await this.readPixelineNetwork(d);
      this.emit('device', this.summary(d));
    }
    return { done: plan.length, warnings, errors };
  }

  // GET every setting that may be copied, as the raw bytes to SET on the other fixtures.
  async readCopyable(d){
    const out = [];
    for(const pid of this.pidList(d)){
      if(NEVER_COPY.has(pid)) continue;
      const e = await this.entryFor(d, pid);
      if(!e?.copy) continue;
      const r = await this.tryGet(d, pid);
      if(r && r.length) out.push([pid, e.copyData ? Buffer.from(e.copyData(r)) : r]);
    }
    return out;
  }

  close(){ this.artnet.stop(); this.rdmnet.close(); }
}
