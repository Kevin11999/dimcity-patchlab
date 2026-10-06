// ui/netconfig.js — the Network config page: every LumiNode and GigaCore switch on one page.
//   · Discover finds them all at once (HTTP: LumiNode / LumiCore and GigaCore generation 2) and links each to a switch or node of the plan.
//   · A switch folds open into its ports: pick a VLAN (the brush), click or drag over ports and they get that VLAN. Name, PoE and speed per port.
//   · A LumiNode folds open into its DMX ports: pick a universe, click a port. Name per port.
//   · Nothing is sent while you paint. "Apply" sends at once, reads the device back and then lists what was changed.
// The logic that compares and builds the calls is core/luminex-api.js; outside the desktop app simulated devices answer (core/luminex-sim.js).
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const ipNum = ip => String(ip).split('.').reduce((n, o) => n * 256 + (+o || 0), 0);
  const ipOk = ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip || '').trim());
  const C = { user:'admin', pass:'', https:false, ranges:'', withIp:false, slot:'', offset:0, einkOpen:new Set(), eink:new Map(), found:null, busy:false, err:'', info:'', dev:new Map(), open:new Set(), simDevs:null, drag:null };
  let api = null, simm = null, root = null, SET = null;
  const load = async () => { if(!api){ const b = document.baseURI; api = await import(new URL('./core/luminex-api.js', b).href); simm = await import(new URL('./core/luminex-sim.js', b).href); SET = await import(new URL('./core/luminex-settings.js', b).href); } };
  const real = () => !!window.app?.luminexHttp;
  const FENT = () => window.Fent;
  const clone = x => JSON.parse(JSON.stringify(x));

  // ---------- transport: the real network (main process) or simulated devices ----------
  function simNet(){
    if(C.simDevs) return C.simDevs;
    const L = []; let k = 0;
    for(const dc of App.sortedDims()){
      for(const s of (window.NetSwitches?.list(dc) || [])) if(s.dev?.ip) L.push({ kind:'gigacore', dev:simm.gigacoreSim({ name:`GigaCore ${++k}`, ip:s.dev.ip, ports:Math.max(4, s.rj + s.sfp), eink:/20/.test(s.type?.name || '') || k === 1 }) });
      for(const n of (App.net.getDimPlan(dc).nodes || [])) if(n.ip){ const u = Array.isArray(n.universes) ? n.universes : []; L.push({ kind:'lumi', dev:simm.lumiNodeSim({ short:'LumiNode', long:'factory default', ip:n.ip, outputs:Math.max(4, Math.ceil((u.length || 4) / 4) * 4), universes:Array.from({ length:16 }, (_, j) => j), klass:'sacn' }) }); }
    }
    L.push({ kind:'gigacore', dev:simm.gigacoreSim({ name:'GigaCore 12t', ip:'10.90.250.5', ports:12 }) }, { kind:'lumi', dev:simm.lumiNodeSim({ short:'LumiNode 12', long:'factory default', ip:'10.90.250.9', outputs:4, klass:'sacn' }) });
    return (C.simDevs = L);
  }
  const simIp = d => (d.kind === 'gigacore' ? d.dev.state.ip.ip_address : d.dev.state.ip.ipaddress);
  // ---------- this computer's own addresses: can it still talk to a device after the device moves? ----------
  const ipn = x => String(x).split('.').reduce((n, o) => n * 256 + Number(o), 0) >>> 0;
  const sameNet = (a, b, mask) => ((ipn(a) & ipn(mask)) >>> 0) === ((ipn(b) & ipn(mask)) >>> 0);
  const reaches = (ip, nets) => !nets || nets.some(n => sameNet(ip, n.address, n.netmask || '255.255.255.0'));
  async function localNets(){ if(real()) return window.app.luminexLocalNets ? await window.app.luminexLocalNets() : null; return C.simNets || null; }
  const hostIn = ip => { const p = ip.split('.'); p[3] = p[3] === '250' ? '251' : '250'; return p.join('.'); };
  // the devices of this list whose pending IP change puts them where this computer has no address
  async function moveWarnings(devs){
    const nets = await localNets(), out = [];
    for(const d of devs){ const to = d.dev?.ip; if(!to || to === d.ip) continue; out.push({ d, from:d.ip, to, mask:d.dev.mask || '255.255.255.0', reachable:reaches(to, nets) }); }
    return out;
  }
  // give this computer an address in the range of the devices that are about to move (or just moved); the OS asks permission
  async function addAddresses(list){
    const adds = [], seen = new Set();
    for(const x of list){ const k = x.to.split('.').slice(0, 3).join('.') + '/' + x.mask; if(seen.has(k)) continue; seen.add(k); adds.push({ ip:hostIn(x.to), mask:x.mask }); }
    if(!adds.length) return { ok:true, adds };
    if(real()){ if(!window.app.luminexAddAddress) return { ok:false, adds, error:t('This version of the app cannot do that.', 'Deze versie van de app kan dat niet.') }; try { await window.app.luminexAddAddress({ adds }); return { ok:true, adds }; } catch(x) { return { ok:false, adds, error:String(x.message || x) }; } }
    C.simNets = [...(C.simNets || []), ...adds.map(a => ({ address:a.ip, netmask:a.mask }))]; return { ok:true, adds };
  }
  function transport(ip){
    if(real()) return (method, path, body, opts = {}) => window.app.luminexHttp({ ip, method, path, body, user:C.user, pass:C.pass, https:C.https, ...opts });
    return async (method, path, body, opts = {}) => { const d = simNet().find(x => simIp(x) === ip); await new Promise(r => setTimeout(r, 20)); if(!d || !reaches(ip, C.simNets)) throw new Error('Timeout — no answer from ' + ip); return d.dev.h(method, path, body, opts); };
  }

  // ---------- the plan ----------
  const swList = () => App.sortedDims().flatMap(dc => (window.NetSwitches?.list(dc) || []).map(s => ({ id:`sw:${dc}|${s.label}`, kind:'sw', dc, s, label:s.label, ip:s.dev?.ip })));
  const ndList = () => App.sortedDims().flatMap(dc => (App.net.getDimPlan(dc).nodes || []).map((inst, i) => ({ id:`nd:${dc}#${i}`, kind:'nd', dc, inst, label:inst.id || `Node ${i + 1}`, ip:inst.ip })));
  const planItems = () => [...swList(), ...ndList()];
  const planOf = d => planItems().find(x => x.id === d.link) || null;
  const mgmtVid = s => { try { return s?.dev?.ip ? (FENT().classify(s.dev.ip)?.vlan?.id ?? null) : null; } catch { return null; } };
  const vlansOf = (dc, label) => { const set = new Set(); for(const r of (window.FentUI?.portPlan(dc).rows || [])) if(r.sw === label) (r.vlans || []).forEach(v => set.add(Number(v))); const m = mgmtVid(swList().find(x => x.dc === dc && x.label === label)?.s); if(m != null) set.add(m); return set; };
  function wantSwitch(it){
    const dc = it.dc, s = it.s, rows = (window.FentUI?.portPlan(dc).rows || []).filter(r => r.sw === s.label && r.swPort), vset = vlansOf(dc, s.label), ports = [], fibre = [];
    for(const r of rows){ const v = (r.vlans || []).map(Number)[0]; ports.push({ port:r.swPort, vid:Number.isFinite(v) ? v : null, legend:String(r.device ?? '') }); }
    for(const l of (window.Fibers?.links(dc) || [])) for(const [me, other] of [[l.a, l.b], [l.b, l.a]]){
      if(!me || me.free || me.dc !== dc || me.sw !== s.label) continue;
      fibre.push(window.SwPorts?.no(s.type, Number(me.sfp)) ?? (s.rj + Number(me.sfp)));
      if(other && !other.free && other.sw) vlansOf(other.dc, other.sw).forEach(v => vset.add(v));
    }
    const groups = [...vset].sort((a, b) => a - b).map(id => FENT().vlanById(id)).filter(Boolean).map(v => ({ vid:v.id, name:v.name, color:v.color }));
    return { name:s.dev?.id || s.label, ip:s.dev?.ip ? { address:s.dev.ip, mask:s.dev.subnet || '255.255.255.0', gateway:s.dev.gateway || '' } : null, ports, fibre, groups, mgmt:mgmtVid(s) };
  }
  function wantNode(it){
    const inst = it.inst, u = Array.isArray(inst.universes) ? inst.universes : [];
    return { shortName:inst.id, longName:inst.name, ip:inst.ip ? { address:inst.ip, mask:inst.subnet || '255.255.255.0', gateway:inst.gateway || '' } : null,
      ports:u.map((x, j) => (x == null || x === '' ? null : { universe:Number(x), name:`${inst.id || 'N'}.${j + 1}` })) };
  }
  const projectVlans = () => { const set = new Set(); for(const it of swList()) vlansOf(it.dc, it.s.label).forEach(v => set.add(v)); return [...set].sort((a, b) => a - b).map(id => FENT().vlanById(id)).filter(Boolean); };

  // ---------- one device ----------
  const D = ip => C.dev.get(ip);
  function mk(f){ return { ip:f.ip, kind:f.kind, name:f.name || '', longName:f.longName || '', model:f.model || '', version:f.version || '', auth:!!f.auth, link:null, cur:null, E:new Map(), dev:{}, brush:null, sel:null, tree:null, treeBusy:false, S:new Map(), setOpen:false, setSec:null, setQ:'', busy:false, err:'', note:'', verified:false, step:1 }; }
  const isSw = d => d.kind === 'gigacore';
  const ports = d => (isSw(d) ? api.portRows(d.cur) : d.cur.ports);
  // what the ports look like with the pending changes on top
  function swTile(d, r){
    const e = d.E.get(r.port) || {}, cur = d.cur;
    let vid = r.vid, trunk = r.member?.type === 'trunk', color = null, label = r.groupName;
    const m = e.member;
    if(m){ if(m.type === 'vid'){ vid = m.vid; trunk = false; } else if(m.type === 'fibre' || m.type === 'trunk'){ trunk = true; vid = null; } else if(m.type === 'group'){ const g = cur.groups.find(x => x.group_id === m.id); vid = g?.vid ?? null; trunk = false; } }
    if(!trunk){ const g = cur.groups.find(x => x.vid === vid); const pv = FENT()?.vlanById?.(vid); color = g?.color || pv?.color || '#64748b'; label = g?.name || pv?.name || (vid != null ? `VLAN ${vid}` : ''); }
    else { color = '#38bdf8'; label = t('Trunk', 'Trunk'); }
    return { vid, trunk, color, label, legend:e.legend ?? r.legend, poe:e.poe ?? r.poe, speed:e.speed ?? r.speed, changed:d.E.has(r.port) && Object.keys(e).length > 0 };
  }
  const swBrushes = d => {
    const have = new Map(d.cur.groups.filter(g => g.vid != null).map(g => [g.vid, { vid:g.vid, name:g.name, color:g.color }]));
    for(const v of projectVlans()) if(!have.has(v.id)) have.set(v.id, { vid:v.id, name:v.name, color:v.color, isNew:true });
    return [...have.values()].sort((a, b) => a.vid - b.vid);
  };
  const fibreMember = d => {
    const it = planOf(d), w = it?.kind === 'sw' ? wantSwitch(it) : null;
    const vids = w ? w.groups.map(g => g.vid) : d.cur.groups.map(g => g.vid).filter(v => v != null);
    return { type:'fibre', vids, mgmtVid:w?.mgmt ?? null, groups:w ? w.groups : swBrushes(d) };
  };
  function applyBrush(d, port){
    const b = d.brush; if(!b) return false;
    const e = d.E.get(port) || {};
    if(isSw(d)){ e.member = b.type === 'fibre' ? fibreMember(d) : { type:'vid', vid:b.vid, name:b.name, color:b.color }; }
    else {
      if(b.universe == null && !b.klass && !b.dir) return false;
      if(b.universe != null){ e.universe = b.universe; if(b.auto) b.universe = Math.min(63999, b.universe + 1); }
      if(b.klass) e.klass = b.klass;
      if(b.dir) e.dir = b.dir;
    }
    d.E.set(port, e); return true;
  }
  // ---------- calls ----------
  function opsOf(d){
    if(!d.cur) return { ops:[], notes:[] };
    const ops = [], notes = [];
    if(isSw(d)){
      const edits = [...d.E.entries()].map(([port, v]) => ({ port, ...clone(v) }));
      const p = api.gigacorePortPlan(d.cur, edits); ops.push(...p.ops); notes.push(...p.notes);
      const dp = api.gigacoreDevicePlan(d.cur, { name:d.dev.name ?? d.cur.device?.name, ip:d.dev.ip ? { address:d.dev.ip, mask:d.dev.mask || '255.255.255.0', gateway:d.dev.gateway || '' } : null }, { withIp:!!d.dev.ip });
      ops.push(...dp.ops); notes.push(...dp.notes);
      if(d.trunkEdit){ const tp = api.gigacoreTrunkPlan(d.cur, d.trunkEdit.tid, d.trunkEdit.vid); ops.push(...tp.ops); notes.push(...tp.notes); }
    } else {
      const n = d.cur.ports.length, per = Array(n).fill(null);
      for(const [i, e] of d.E) if(i < n) per[i] = clone(e);
      const p = api.lumiPlan(d.cur, { shortName:d.dev.shortName ?? d.cur.info?.short_name, longName:d.dev.longName ?? d.cur.info?.long_name, ip:d.dev.ip ? { address:d.dev.ip, mask:d.dev.mask || '255.255.255.0', gateway:d.dev.gateway || '' } : null, ports:per }, { withIp:!!d.dev.ip, artnetOffset:C.offset });
      ops.push(...p.ops); notes.push(...p.notes);
    }
    if(d.S.size && d.tree){ const so = SET.settingsOps(isSw(d) ? 'gigacore' : 'lumi', d.tree, [...d.S.values()]); ops.push(...so.ops); notes.push(...so.notes); }
    return { ops, notes };
  }
  const changeCount = d => opsOf(d).ops.length;
  // fill what the plan wants into the pending changes (nothing is sent)
  function fillFromPlan(d){
    const it = planOf(d); if(!it || !d.cur) return false;
    if(isSw(d) && it.kind === 'sw'){
      const w = wantSwitch(it);
      for(const p of w.ports){ if(!d.cur.ports.some(x => x.port_number === p.port)) continue; const e = d.E.get(p.port) || {}; e.legend = String(p.legend).slice(0, 16); const g = w.groups.find(x => x.vid === p.vid); if(g) e.member = { type:'vid', vid:g.vid, name:g.name, color:g.color }; d.E.set(p.port, e); }
      if(w.fibre.length){ const fm = { type:'fibre', vids:w.groups.map(g => g.vid), mgmtVid:w.mgmt, groups:w.groups }; for(const no of w.fibre) if(d.cur.ports.some(x => x.port_number === no)){ const e = d.E.get(no) || {}; e.member = clone(fm); d.E.set(no, e); } }
      const pre = d.cur.trunks.find(x => x.predefined), want = w.mgmt != null ? d.cur.groups.find(g => g.vid === w.mgmt) : null;
      if(w.name && w.name !== d.cur.device?.name) d.dev.name = w.name;
      if(C.withIp && w.ip?.address && w.ip.address !== d.cur.ip?.ip_address) Object.assign(d.dev, { ip:w.ip.address, mask:w.ip.mask, gateway:w.ip.gateway });
      return true;
    }
    if(!isSw(d) && it.kind === 'nd'){
      const w = wantNode(it);
      w.ports.forEach((q, j) => { if(!q || j >= d.cur.ports.length) return; const e = d.E.get(j) || {}; e.universe = q.universe; e.name = q.name; d.E.set(j, e); });
      if(w.shortName && w.shortName !== d.cur.info?.short_name) d.dev.shortName = String(w.shortName).slice(0, 17);
      if(w.longName && w.longName !== d.cur.info?.long_name) d.dev.longName = String(w.longName).slice(0, 63);
      if(C.withIp && w.ip?.address && w.ip.address !== d.cur.ip?.ipaddress) Object.assign(d.dev, { ip:w.ip.address, mask:w.ip.mask, gateway:w.ip.gateway });
      return true;
    }
    return false;
  }

  // ---------- actions ----------
  async function readDev(d, keepEdits){
    d.busy = true; d.err = ''; d.verified = false;
    try { await load(); const h = transport(d.ip); d.cur = isSw(d) ? await api.gigacoreRead(h) : await api.lumiRead(h);
      if(!keepEdits){ d.E = new Map(); d.dev = {}; d.S = new Map(); d.tree = null; }
      if(isSw(d)){ d.name = d.cur.device?.name || d.name; d.model = d.cur.device?.model || d.model; } else { d.name = d.cur.info?.short_name || d.name; d.longName = d.cur.info?.long_name || ''; d.version = d.cur.version || d.version; }
    } catch(x) { d.cur = null; d.err = String(x.message || x); if(/401/.test(d.err)) d.auth = true; }
    d.busy = false;
  }
  async function pool(list, n, fn){ let i = 0; await Promise.all(Array.from({ length:Math.min(n, list.length) }, async () => { while(i < list.length){ const x = list[i++]; try { await fn(x); } catch {} } })); }
  function autoLink(){
    const items = planItems(), taken = new Set([...C.dev.values()].map(d => d.link).filter(Boolean));
    for(const d of C.dev.values()){
      if(d.link || d.kind === 'unknown') continue;
      const want = isSw(d) ? 'sw' : 'nd', nm = `${d.name} ${d.longName}`.toLowerCase();
      const it = items.find(x => x.kind === want && !taken.has(x.id) && x.ip === d.ip) || items.find(x => x.kind === want && !taken.has(x.id) && nm.trim() && String(x.label).length > 1 && nm.includes(String(x.label).toLowerCase()));
      if(it){ d.link = it.id; taken.add(it.id); }
    }
  }
  // Devices appear one by one, the moment they are found; each is read straight away (4 at a time).
  let readRun = 0; const readQ = [];
  function queueRead(d){
    readQ.push(d);
    const next = async () => { if(readRun >= 4 || !readQ.length) return; readRun++; const x = readQ.shift(); try { if(x.kind !== 'unknown' && !x.cur) await readDev(x); } catch {} readRun--; paint(); next(); };
    next();
  }
  function addFound(f, old){
    const prev = old?.get(f.ip) || C.dev.get(f.ip);
    const d = prev && prev.kind === f.kind ? Object.assign(prev, { name:prev.name || f.name, auth:!!f.auth }) : mk(f);
    const isNew = !C.dev.has(f.ip); C.dev.set(f.ip, d); C.found = [...C.dev.keys()];
    autoLink(); paint(); if(isNew || !d.cur) queueRead(d);
  }
  async function discover(){
    C.busy = true; C.err = ''; C.info = ''; const old = C.dev; C.dev = new Map(); C.found = []; paint();
    let off = null;
    try {
      if(real()){
        if(!window.app.luminexScan) throw new Error(t('This version of the app cannot scan.', 'Deze versie van de app kan niet scannen.'));
        off = window.app.onLuminexDevice?.(f => addFound(f, old));
        const r = await window.app.luminexScan({ ranges:C.ranges, user:C.user, pass:C.pass, https:C.https });
        for(const f of (r.devices || [])) if(!C.dev.has(f.ip)) addFound(f, old);
        C.info = `${r.count} ${t('addresses checked', 'adressen gecontroleerd')} · ${r.ranges}`;
      } else {
        await load();
        for(const x of simNet().filter(x => reaches(simIp(x), C.simNets))){ await new Promise(r => setTimeout(r, 180)); const info = x.kind === 'gigacore' ? x.dev.state.device : x.dev.state.info; addFound(x.kind === 'gigacore' ? { ip:simIp(x), kind:'gigacore', name:info.name, model:info.model } : { ip:simIp(x), kind:'lumi', name:info.short_name, longName:info.long_name, version:'v2.9.1' }, old); }
        C.info = t('Simulated network', 'Gesimuleerd netwerk');
      }
    } catch(x) { C.err = String(x.message || x); }
    try { off?.(); } catch {}
    C.busy = false; paint();
    while(readRun > 0 || readQ.length) await new Promise(r => setTimeout(r, 100));
  }
  // The order matters when addresses change: first everything that is not an address, to every device (they are all still where
  // they were); then the addresses to all devices at the same moment, each one checked at its new address. A device this computer can no
  // longer reach is not a failure: it has its new address, and the result says what to do (add an address to this computer).
  async function applyDevs(devs){
    const todo = devs.map(d => ({ d, ...opsOf(d) })).filter(x => x.ops.length);
    if(!todo.length) return;
    let failed = 0; await load();
    for(const x of todo){ x.cfg = x.ops.filter(o => o.kind !== 'ip'); x.ipOps = x.ops.filter(o => o.kind === 'ip'); x.newIp = x.d.dev?.ip || null; x.mask = x.d.dev?.mask || '255.255.255.0'; x.d.err = ''; x.d.moved = null; }
    // 1 · everything but the address, to every device
    for(const x of todo){
      const { d } = x; d.busy = true; paint();
      try { const h = logged(d); if(x.cfg.length) await api.runOps(h, x.cfg); if(isSw(d) && Number(C.slot) >= 1 && Number(C.slot) <= 20 && x.cfg.length) await h('PUT', `/api/config/profiles/${Number(C.slot)}/save`); }
      catch(e) { failed++; x.dead = true; d.err = t(`Stopped after an error: ${e.message || e}. Read the device again to see what was applied.`, `Gestopt door een fout: ${e.message || e}. Lees het apparaat opnieuw uit om te zien wat is toegepast.`); }
      d.busy = false; paint();
    }
    // 2 · the addresses: to ALL devices at the same moment (so the network never ends up half moved)
    const movers = todo.filter(y => y.ipOps.length && !y.dead);
    movers.forEach(x => { x.d.busy = true; }); paint();
    await Promise.all(movers.map(async x => {
      const { d } = x, old = d.ip;
      try {
        try { await api.runOps(logged(d), x.ipOps); } catch(e) { if(!/timeout|ECONN|reset|socket|EHOST|closed/i.test(String(e.message || e))) throw e; }   // the device may drop the line while it moves
        if(x.newIp){ d.ip = x.newIp; if(C.dev.get(old) === d){ C.dev.delete(old); C.dev.set(x.newIp, d); } }
        x.sent = old;
      } catch(e) { failed++; x.dead = true; d.err = t(`Stopped after an error: ${e.message || e}. Read the device again to see what was applied.`, `Gestopt door een fout: ${e.message || e}. Lees het apparaat opnieuw uit om te zien wat is toegepast.`); d.busy = false; }
    }));
    C.found = [...C.dev.keys()];
    if(movers.some(x => x.sent) && real()) await sleep(3000);                                  // all of them are moving: give them time
    await pool(movers.filter(x => x.sent), 8, async x => {
      const { d } = x;
      try { d.E = new Map(); d.dev = {}; d.S = new Map(); d.tree = null; d.trunkEdit = null; await readDev(d); if(!d.cur){ d.err = ''; d.moved = { from:x.sent, to:d.ip, mask:x.mask }; } x.after = true; }
      catch(e) { failed++; x.dead = true; d.err = String(e.message || e); }
      d.busy = false; paint();
    });
    // 3 · read every device back and check it (the ones that moved out of reach are skipped)
    for(const x of todo.filter(y => !y.dead && !y.d.moved)){
      const { d } = x; d.busy = true; paint();
      try { if(!x.after){ d.E = new Map(); d.dev = {}; d.trunkEdit = null; d.S = new Map(); d.tree = null; await readDev(d); } await verifyTrunk(d, x.ops, logged(d)); d.verified = !d.err && changeCount(d) === 0; }
      catch(e) { failed++; d.err = String(e.message || e); }
      d.busy = false; paint();
    }
    window.PatchHistory?.label?.(t('Configuration sent to Luminex devices', 'Configuratie naar Luminex-apparaten gestuurd'));
    resultDialog(todo, failed);
  }
  async function fixMoved(d){
    if(!d.moved) return;
    const r = await addAddresses([{ to:d.moved.to, mask:d.moved.mask }]);
    if(!r.ok){ App.ui.toast(`${t('Could not add the address', 'Kon het adres niet toevoegen')}: ${r.error}`, 'err', { ms:8000 }); return; }
    if(real()) await sleep(1500);
    for(const x of [...C.dev.values()].filter(y => y.moved)){ if(x !== d && !reaches(x.moved.to, await localNets())) continue; await readDev(x); if(x.cur){ x.moved = null; x.verified = changeCount(x) === 0; } }
    if(!d.moved) App.ui.toast(t('Reached again.', 'Weer bereikbaar.'), 'ok'); paint();
  }
  // what was changed, shown after sending (nothing to confirm beforehand; the list is the record)
  function resultDialog(todo, failed){
    const n = todo.reduce((k, x) => k + x.ops.length, 0);
    const body = `<div style="max-height:420px;overflow:auto">${todo.map(({ d, ops }) => `<h4 style="margin:12px 0 4px">${d.err ? I('alert', 14) : I('check', 14)} ${esc(d.name || d.model)} <span class="subtle">${esc(d.ip)}</span> <span class="subtle">${d.err ? t('failed', 'mislukt') : d.moved ? t('sent · moved, out of reach', 'gestuurd · verhuisd, buiten bereik') : d.verified ? t('sent and checked', 'gestuurd en gecontroleerd') : t('sent', 'gestuurd')}</span></h4>
        ${d.err ? `<p class="su-warn">${esc(d.err)}</p>` : ''}${d.moved ? `<p class="su-warn">${I('alert', 13)} ${t(`Now at ${d.moved.to} (was ${d.moved.from}). This computer has no address in that range, so it cannot read the device back. Add an address to this computer (the system asks permission), or give your network adapter an address in that range yourself.`, `Nu op ${d.moved.to} (was ${d.moved.from}). Deze computer heeft geen adres in dat bereik en kan het apparaat dus niet terugcontroleren. Voeg een adres toe aan deze computer (het systeem vraagt toestemming), of geef je netwerkadapter zelf een adres in dat bereik.`)} <button class="sm" data-fix="${esc(d.ip)}">${t('Add address to this computer', 'Adres toevoegen aan deze computer')}</button></p>` : ''}<ol>${ops.map(o => `<li>${esc(o.text)}</li>`).join('')}</ol>${ops.some(o => o.kind === 'ip') ? `<p class="subtle">${t('The IP address changed; the device now answers on the new address.', 'Het IP-adres is veranderd; het apparaat antwoordt nu op het nieuwe adres.')}</p>` : ''}`).join('')}</div>`;
    const dlg = App.ui.openDialog({ title:failed ? `${failed} ${t('of', 'van')} ${todo.length} ${t('devices failed', 'apparaten mislukt')}` : `${n} ${t('changes sent to', 'wijzigingen gestuurd naar')} ${todo.length} ${t('devices', 'apparaten')}`, subtitle:real() ? '' : t('Simulated devices — nothing real was changed.', 'Gesimuleerde apparaten — er is niets echts veranderd.'), width:'620px', body, footer:`<button class="primary" data-a="ok">OK</button>` });
    dlg.footer.querySelector('[data-a=ok]').onclick = () => dlg.close();
    dlg.body.querySelectorAll('[data-fix]').forEach(b => b.onclick = async () => { const d = C.dev.get(b.dataset.fix); if(d){ b.disabled = true; await fixMoved(d); if(!d.moved) b.closest('p').innerHTML = I('check', 13) + ' ' + t('Reached again.', 'Weer bereikbaar.'); else b.disabled = false; } });
  }



  // ---------- calls that are logged (so a failing switch can be diagnosed) ----------
  const logged = d => { const h = transport(d.ip); d.log ||= []; return async (m, p, b, o) => { const line = `${m} ${p}${b !== undefined && !o?.bodyBase64 ? ' ' + JSON.stringify(b).slice(0, 160) : ''}`; try { const r = await h(m, p, b, o); d.log.push({ ok:true, line, res:r == null ? '' : String(JSON.stringify(r)).slice(0, 100) }); if(d.log.length > 80) d.log.shift(); return r; } catch(x) { d.log.push({ ok:false, line, err:String(x.message || x) }); throw x; } }; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // ---------- the lights ----------
  async function rainbowShow(d){
    if(C.show && C.show.ip === d.ip){ C.show.stop = true; return; }
    const h = logged(d), run = C.show = { ip:d.ip, stop:false }; paint();
    let before = 'groups'; try { before = (await h('GET', '/api/interface/info/current_state')) || 'groups'; } catch {}
    try { await load(); for(let round = 0; round < 4 && !run.stop; round++) for(const st of api.RAINBOW_STATES){ if(run.stop) break; await h('PUT', '/api/interface/set_state', { state:st }); await sleep(520); } }
    catch(x) { d.err = String(x.message || x); }
    try { await h('PUT', '/api/interface/set_state', { state:typeof before === 'string' && before ? before : 'groups' }); } catch { try { await h('PUT', '/api/interface/set_state', { state:'groups' }); } catch {} }
    C.show = null; paint();
  }

  // The switch answered "ok" to the trunk call; did the ports really end up in the trunk? If not, try the other documented way (port by port) and say what the switch reports.
  async function verifyTrunk(d, ops, h){
    if(!d.cur) return;
    const tops = ops.filter(o => o.path === '/api/trunks/assign_ports' || o.trunkGroups); if(!tops.length) return;
    const asg = ops.filter(o => o.path === '/api/trunks/assign_ports');
    for(const o of asg){
      let miss = api.trunkMissing(d.cur, o.body.id, o.body.ports);
      if(!miss.length){ d.log.push({ ok:true, line:`verify: ports ${o.body.ports.join(', ')} are in trunk ${o.body.id}`, res:'' }); continue; }
      d.log.push({ ok:false, line:`verify: trunk ${o.body.id}`, err:`the switch says ${miss.map(m => `port ${m.port} member_of ${m.says}`).join('; ')}` });
      try { await api.runOps(h, api.trunkFallbackOps(o.body.id, miss.map(m => m.port).filter(Boolean))); await readDev(d); miss = api.trunkMissing(d.cur, o.body.id, o.body.ports); } catch(x) { d.log.push({ ok:false, line:'port by port', err:String(x.message || x) }); }
      if(miss.length) d.err = t(`The switch accepted the trunk call but reports ports ${miss.map(m => m.port).join(', ')} are not in trunk ${o.body.id} (it says: ${miss[0].says}). Open “Last calls” and send it to me.`, `De switch accepteerde de trunkaanroep maar meldt dat poorten ${miss.map(m => m.port).join(', ')} niet in trunk ${o.body.id} zitten (hij zegt: ${miss[0].says}). Open “Laatste aanroepen” en stuur het naar mij.`);
      else d.log.push({ ok:true, line:`verify: port by port worked, ports ${o.body.ports.join(', ')} are in trunk ${o.body.id}`, res:'' });
    }
    // does the trunk really carry every VLAN of the plan? If the switch's own trunk refused to take the new groups, use a trunk of our own for these ports
    const need = [...new Set(tops.flatMap(o => o.needVids || []))];
    const tids = [...new Set(asg.map(o => o.body.id))].concat(asg.length ? [] : [d.cur.trunks.find(x => x.predefined)?.trunk_id].filter(x => x != null));
    for(const tid of tids){
      const lack = api.trunkMissingVlans(d.cur, tid, need);
      if(!lack.length){ d.log.push({ ok:true, line:`verify: trunk ${tid} carries VLAN ${need.join(', ')}`, res:'' }); continue; }
      d.log.push({ ok:false, line:`verify: trunk ${tid}`, err:`does not carry VLAN ${lack.join(', ')} — using a trunk of our own for these ports` });
      const ports = asg.filter(o => o.body.id === tid).flatMap(o => o.body.ports).filter(p => api.trunkInfo(d.cur, tid)?.ports.includes(p));          // the ports that were just put in it
      const own = ports.length ? ports : (api.trunkInfo(d.cur, tid)?.ports || []);
      const plan = api.gigacorePortPlan(d.cur, own.map(p => ({ port:p, member:{ type:'fibre', own:true, vids:need, mgmtVid:null, groups:[] } })));
      try { await api.runOps(h, plan.ops); await readDev(d); const nt = d.cur.trunks.find(x => x.name === 'Fibre'); const still = nt ? api.trunkMissingVlans(d.cur, nt.trunk_id, need) : need; if(still.length) d.err = t(`The switch will not carry VLAN ${still.join(', ')} on the fibre trunk. Open “Last calls” and send it to me.`, `De switch laat VLAN ${still.join(', ')} niet over de fibre-trunk lopen. Open “Laatste aanroepen” en stuur het naar mij.`); }
      catch(x) { d.err = String(x.message || x); d.log.push({ ok:false, line:'own trunk', err:String(x.message || x) }); }
    }
  }
  // the colours flow along: every group in use keeps its place in the rainbow and the whole rainbow turns, a few seconds, then the old colours come back
  async function rainbowFlow(d){
    if(C.flow && C.flow.ip === d.ip){ C.flow.stop = true; return; }
    const plan = api.rainbowPlan(d.cur); if(!plan.targets.length){ App.ui.toast(t('No groups in use to colour', 'Geen groepen in gebruik om te kleuren'), 'info'); return; }
    const h = logged(d), run = C.flow = { ip:d.ip, stop:false }; paint(); let err = '', prev = 'groups';
    try {
      await load(); const n = plan.targets.length;
      try { prev = (await h('GET', '/api/interface/info/current_state')) || 'groups'; if(prev !== 'groups') await h('PUT', '/api/interface/set_state', { state:'groups' }); } catch {}          // the port lights only show group colours in this state
      for(let f = 0; f < 90 && !run.stop; f++){
        const results = await Promise.allSettled(plan.targets.map((path, i) => h('PUT', path, api.hslHex(((360 * i / n) + f * 14) % 360))));
        const bad = results.find(r => r.status === 'rejected'); if(bad){ err = String(bad.reason?.message || bad.reason); break; }
        await sleep(160);
      }
    } catch(x) { err = String(x.message || x); }
    try { await Promise.allSettled(plan.before.map(b => h('PUT', b.path, b.color))); if(prev !== 'groups') await h('PUT', '/api/interface/set_state', { state:prev }); } catch {}
    C.flow = null; if(err) d.err = err; await readDev(d, true); paint();
  }
  async function rainbowColours(d, undo){
    d.busy = true; d.err = ''; paint();
    try {
      await load(); const h = logged(d);
      const plan = undo ? { ops:(d.rainbowBefore || []).map(b => ({ method:'PUT', path:b.path, body:b.color, text:b.path, kind:'config', soft:true })) } : api.rainbowPlan(d.cur);
      if(!undo) d.rainbowBefore = plan.before;
      const done = await api.runOps(h, plan.ops), bad = done.filter(o => o.failed);
      if(undo) d.rainbowBefore = null;
      else { try { await h('PUT', '/api/interface/set_state', { state:'groups' }); } catch {} }         // let the port lights show the group colours
      await readDev(d, true);
      App.ui.toast(bad.length ? `${done.length - bad.length}/${done.length} ${t('colours changed — the switch refused the rest', 'kleuren aangepast — de switch weigerde de rest')}` : (undo ? t('Colours are back', 'Kleuren zijn terug') : `${done.length} ${t('groups in rainbow colours', 'groepen in regenboogkleuren')}`), bad.length ? 'info' : 'ok');
    } catch(x) { d.err = String(x.message || x); }
    d.busy = false; paint();
  }
  async function luminexMode(d){
    const ok = await App.ui.confirmDialog({ title:t('Switch to Luminex configuration mode?', 'Naar Luminex-configuratiemodus?'), okLabel:t('Switch and reboot', 'Omzetten en herstarten'), danger:true, message:t('In “advanced” mode the switch is also configured with its command line, and groups / trunks set through this API may not show correctly. Switching to “luminex” mode makes the API the only way to configure it. The switch reboots.', 'In “advanced” modus wordt de switch ook via de commandoregel ingesteld, en groepen / trunks die via deze API worden gezet kunnen verkeerd getoond worden. Naar “luminex” modus maakt de API de enige manier om hem in te stellen. De switch herstart.') });
    if(!ok) return;
    try { await load(); await logged(d)('PUT', '/api/config/mode', 'luminex'); App.ui.toast(t('The switch reboots — discover again in a minute', 'De switch herstart — ontdek over een minuut opnieuw'), 'info'); } catch(x) { d.err = String(x.message || x); }
    paint();
  }
  function trunkHtml(d){
    const cur = d.cur, used = [...new Set(cur.ports.filter(p => p.member_of?.type === 'trunk').map(p => p.member_of.id))];
    const ids = used.length ? used : (cur.trunks.find(x => x.predefined) ? [cur.trunks.find(x => x.predefined).trunk_id] : []);
    if(!ids.length) return '';
    return `<div class="nc-trunks">${ids.map(tid => {
      const ti = api.trunkInfo(cur, tid); if(!ti) return '';
      const un = d.trunkEdit?.tid === tid ? d.trunkEdit.vid : ti.untaggedVid;
      const vl = [...new Set(ti.vlans)].sort((a, b) => a - b);
      return `<div class="nc-trunk"><b>Trunk “${esc(ti.name)}”</b> <span class="subtle">${ti.predefined ? t('(built into the switch — carries every VLAN)', '(zit in de switch — voert elke VLAN)') : ''}</span>
        <span class="subtle">${t('ports', 'poorten')}: ${ti.ports.length ? ti.ports.join(', ') : t('none yet', 'nog geen')} · VLAN: ${vl.join(', ') || '–'}</span>
        <label>${t('Untagged VLAN', 'Untagged VLAN')}<select data-trunkun="${tid}"><option value="0" ${!un ? 'selected' : ''}>${t('none (all tagged)', 'geen (alles getagd)')}</option>${vl.map(v => `<option value="${v}" ${un === v ? 'selected' : ''}>${v} ${esc(cur.groups.find(g => g.vid === v)?.name || '')}</option>`).join('')}</select></label></div>`;
    }).join('')}</div>`;
  }
  const lightsHtml = d => `<div class="nc-lights"><b>${t('Lights', 'Lampjes')}</b>
    <button data-rainbow="${esc(d.ip)}" class="${C.show?.ip === d.ip ? 'primary' : ''}">${C.show?.ip === d.ip ? '■ ' + t('Stop', 'Stop') : '🌈 ' + t('Rainbow show', 'Regenboogshow')}</button>
    <button data-rainbowf="${esc(d.ip)}" class="${C.flow?.ip === d.ip ? 'primary' : ''}">${C.flow?.ip === d.ip ? '■ ' + t('Stop', 'Stop') : '🌊 ' + t('Rainbow flow', 'Regenboogstroom')}</button>
    <button data-rainbowc="${esc(d.ip)}" ${d.busy ? 'disabled' : ''}>${t('Rainbow colours on the groups', 'Regenboogkleuren op de groepen')}</button>
    <button data-lstate="${esc(d.ip)}|groups">${t('Ports show group colours', 'Poorten tonen groepskleuren')}</button><button data-lstate="${esc(d.ip)}|dark_mode">${t('Lights off', 'Lampjes uit')}</button>
    ${d.rainbowBefore ? `<button data-rainbowu="${esc(d.ip)}">${t('Colours back', 'Kleuren terug')}</button>` : ''}
    <span class="subtle" style="font-size:12px">${t('The show runs the front-panel colours red → magenta a few times and then goes back. The port lights follow the colour of their group, so “rainbow colours” gives every group in use its own colour, left to right, and “rainbow flow” lets those colours run along like a wave (ports in the same VLAN change together; a single port cannot get a colour of its own without moving it to another group). A group colour has no effect on traffic.', 'De show laat de kleuren van het voorpaneel een paar keer van rood → magenta lopen en gaat dan terug. De poortlampjes volgen de kleur van hun groep, dus “regenboogkleuren” geeft elke gebruikte groep een eigen kleur, van links naar rechts, en de “regenboogstroom” laat die kleuren als een golf langs lopen (poorten in dezelfde VLAN veranderen samen; een losse poort kan geen eigen kleur krijgen zonder naar een andere groep te verhuizen). Een groepskleur heeft geen invloed op het verkeer.')}</span></div>`;
  const logHtml = d => (d.log && d.log.length) ? `<details class="nc-log"><summary>${t('Last calls to this device', 'Laatste aanroepen naar dit apparaat')} (${d.log.length})</summary><button data-copylog="${esc(d.ip)}">${t('Copy', 'Kopieer')}</button><pre>${d.log.slice(-40).map(l => `${l.ok ? '✓' : '✗'} ${esc(l.line)}${l.ok ? (l.res ? '  → ' + esc(l.res) : '') : '  → ' + esc(l.err)}`).join('\n')}</pre></details>` : '';

  // ---------- the e-ink display of a GigaCore 20t ----------
  const EK = d => { let e = C.eink.get(d.ip); if(!e){ e = { w:0, h:0, kind:'text', text:'', size:0, align:'center', bold:true, fit:'contain', dither:true, invert:false, img:null, imgName:'', shot:null, prev:null, busy:false, err:'', ok:'' }; C.eink.set(d.ip, e); } return e; };
  async function einkLoad(d){
    const e = EK(d); e.busy = true; e.err = ''; paint();
    try { await load(); const sz = await api.einkSize(transport(d.ip)); e.w = sz.w; e.h = sz.h; e.shot = sz.screenshot; d.cur.eink = await transport(d.ip)('GET', '/api/eink'); }
    catch(x) { e.err = String(x.message || x); }
    e.busy = false; paint(); einkPreviewUpdate(d);
  }
  // what will be sent: a white canvas of the display size with the text or the picture on it, in pure black and white
  function einkCanvas(e){
    const W = e.w || 250, H = e.h || 122, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently:true }); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000'; g.textBaseline = 'middle';
    if(e.kind === 'text'){
      const lines = String(e.text || '').split('\n'), pad = 6, font = sz => `${e.bold ? 'bold ' : ''}${sz}px "DejaVu Sans", Arial, sans-serif`;
      let sz = Number(e.size) || 0;
      if(!sz){ sz = 64; for(; sz > 7; sz--){ g.font = font(sz); if(Math.max(...lines.map(l => g.measureText(l).width), 0) <= W - 2 * pad && lines.length * sz * 1.15 <= H - 2 * pad) break; } }
      g.font = font(sz); const lh = sz * 1.15, y0 = (H - lines.length * lh) / 2 + lh / 2;
      g.textAlign = e.align === 'left' ? 'left' : e.align === 'right' ? 'right' : 'center';
      lines.forEach((l, i) => g.fillText(l, e.align === 'left' ? pad : e.align === 'right' ? W - pad : W / 2, y0 + i * lh));
    } else if(e.img){
      const iw = e.img.naturalWidth || e.img.width, ih = e.img.naturalHeight || e.img.height, k = (e.fit === 'cover' ? Math.max : Math.min)(W / iw, H / ih), w = iw * k, h = ih * k;
      g.drawImage(e.img, (W - w) / 2, (H - h) / 2, w, h);
    }
    // to black and white: the picture dithered (Floyd–Steinberg) or cut at the middle; text is cut at the middle
    const im = g.getImageData(0, 0, W, H), px = im.data, L = new Float32Array(W * H);
    for(let i = 0; i < W * H; i++) L[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    const dith = e.kind === 'image' && e.dither;
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const i = y * W + x, old = L[i], nw = old < 128 ? 0 : 255, err = old - nw; L[i] = nw;
      if(dith){ if(x + 1 < W) L[i + 1] += err * 7 / 16; if(y + 1 < H){ if(x > 0) L[i + W - 1] += err * 3 / 16; L[i + W] += err * 5 / 16; if(x + 1 < W) L[i + W + 1] += err / 16; } }
    }
    for(let i = 0; i < W * H; i++){ const v = e.invert ? 255 - L[i] : L[i]; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); return c;
  }
  const einkB64 = c => c.toDataURL('image/png').split(',')[1];
  function einkPreviewUpdate(d){
    const img = root?.querySelector(`[data-eip="${d.ip}"] .ek-mine`); if(!img) return;
    const e = EK(d); img.src = einkCanvas(e).toDataURL('image/png');
  }
  function einkHtml(d){
    const e = EK(d), open = C.einkOpen.has(d.ip), ev = d.cur.eink;
    if(!ev) return '';
    const head = `<div class="nc-eink-h" data-ekopen="${esc(d.ip)}"><span class="nc-chev ${open ? 'open' : ''}">${I('chevronRight', 13)}</span><b>${t('E-ink display', 'E-ink display')}</b><span class="subtle">${esc(ev.mode === 'custom' ? t('showing your own picture', 'toont je eigen afbeelding') : t('standard layout', 'standaardweergave'))}</span></div>`;
    if(!open) return `<div class="nc-eink" data-eip="${esc(d.ip)}">${head}</div>`;
    const sel = (f, v, opts) => `<select data-ek="${f}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<div class="nc-eink open" data-eip="${esc(d.ip)}">${head}
      <div class="ek-grid">
        <div class="ek-ctl">
          <div class="segmented"><button data-ekkind="text" class="${e.kind === 'text' ? 'active' : ''}">${t('Text', 'Tekst')}</button><button data-ekkind="image" class="${e.kind === 'image' ? 'active' : ''}">${t('Picture', 'Afbeelding')}</button></div>
          ${e.kind === 'text' ? `<textarea data-ek="text" rows="4" placeholder="${t('One line per line', 'Eén regel per regel')}" style="width:100%">${esc(e.text)}</textarea>
            <div class="nc-row">${'' }<label>${t('Size', 'Grootte')}${sel('size', e.size, [[0, t('automatic', 'automatisch')], [14, '14'], [20, '20'], [28, '28'], [40, '40'], [56, '56']])}</label><label>${t('Align', 'Uitlijnen')}${sel('align', e.align, [['left', t('left', 'links')], ['center', t('centre', 'midden')], ['right', t('right', 'rechts')]])}</label><label class="nc-chk"><input type="checkbox" data-ek="bold" ${e.bold ? 'checked' : ''}> ${t('bold', 'vet')}</label></div>`
          : `<input type="file" data-ekfile accept="image/*"><div class="subtle" style="font-size:12px">${e.imgName ? esc(e.imgName) : t('JPG, PNG, GIF … — it is scaled to the display and made black and white.', 'JPG, PNG, GIF … — het wordt op de display geschaald en zwart-wit gemaakt.')}</div>
            <div class="nc-row"><label>${t('Fit', 'Passen')}${sel('fit', e.fit, [['contain', t('whole picture', 'hele afbeelding')], ['cover', t('fill the display', 'display vullen')]])}</label><label class="nc-chk"><input type="checkbox" data-ek="dither" ${e.dither ? 'checked' : ''}> ${t('dither (grey tones as dots)', 'dither (grijstinten als puntjes)')}</label></div>`}
          <label class="nc-chk"><input type="checkbox" data-ek="invert" ${e.invert ? 'checked' : ''}> ${t('invert (white on black)', 'omkeren (wit op zwart)')}</label>
          <div class="nc-row"><button data-ekact="preview" ${e.busy ? 'disabled' : ''}>${t('Send as preview', 'Als voorbeeld sturen')}</button><button class="primary" data-ekact="show" ${e.busy || !e.prev ? 'disabled' : ''} title="${t('Send a preview first', 'Stuur eerst een voorbeeld')}">${t('Show on the display', 'Op de display tonen')}</button><button data-ekact="standard" ${e.busy ? 'disabled' : ''}>${t('Standard layout', 'Standaardweergave')}</button><button data-ekact="clear" ${e.busy ? 'disabled' : ''}>${t('Remove my picture', 'Mijn afbeelding wissen')}</button></div>
          <div class="nc-row"><label class="nc-chk"><input type="checkbox" data-ekdev="show_ip" ${ev.show_ip !== false ? 'checked' : ''}> ${t('show IP address', 'toon IP-adres')}</label><label class="nc-chk"><input type="checkbox" data-ekdev="show_qr" ${ev.show_qr ? 'checked' : ''}> ${t('show QR code', 'toon QR-code')}</label><label class="nc-chk"><input type="checkbox" data-ekdev="invert" ${ev.invert ? 'checked' : ''}> ${t('invert standard layout', 'standaardweergave omkeren')}</label></div>
          ${e.err ? `<div class="su-warn">${esc(e.err)}</div>` : ''}${e.ok ? `<div class="tag green">${esc(e.ok)}</div>` : ''}
        </div>
        <div class="ek-prev"><small>${t('What will be sent', 'Wat gestuurd wordt')} (${e.w || '?'}×${e.h || '?'})</small><img class="ek-mine" alt="" ${e.w ? '' : 'hidden'}>
          ${e.prev ? `<small>${t('What the display made of it (preview)', 'Wat de display ervan maakte (voorbeeld)')}</small><img class="ek-dev" src="data:image/png;base64,${e.prev}" alt="">` : ''}
          ${e.shot ? `<small>${t('On the display now', 'Nu op de display')}</small><img class="ek-dev" src="data:image/png;base64,${e.shot}" alt="">` : ''}</div>
      </div></div>`;
  }
  async function einkAct(d, act){
    const e = EK(d), h = transport(d.ip); e.busy = true; e.err = ''; e.ok = ''; paint();
    try {
      await load();
      if(act === 'preview'){ e.prev = await api.einkPreview(h, einkB64(einkCanvas(e))); e.ok = t('Preview is on the device. Check it, then show it.', 'Het voorbeeld staat op het apparaat. Controleer het en toon het dan.'); }
      else if(act === 'show'){ await api.einkShow(h); d.cur.eink = await h('GET', '/api/eink'); e.shot = (await api.einkSize(h)).screenshot; e.ok = t('Shown on the display.', 'Getoond op de display.'); }
      else if(act === 'standard'){ await api.einkStandard(h); d.cur.eink = await h('GET', '/api/eink'); e.shot = (await api.einkSize(h)).screenshot; e.ok = t('Standard layout is back.', 'De standaardweergave is terug.'); }
      else if(act === 'clear'){ await api.einkClear(h); d.cur.eink = await h('GET', '/api/eink'); e.prev = null; e.shot = (await api.einkSize(h)).screenshot; e.ok = t('Picture removed.', 'Afbeelding gewist.'); }
    } catch(x) { e.err = String(x.message || x); }
    e.busy = false; paint(); einkPreviewUpdate(d);
  }


  // ---------- all settings: everything the API of the device allows to change ----------
  const kindOf = d => (isSw(d) ? 'gigacore' : 'lumi');
  const skey = (fid, ids) => fid + '|' + ids.join(',');
  async function settingsLoad(d){
    if(d.tree || d.treeBusy) return; d.treeBusy = true; paint();
    try { await load(); d.tree = await SET.readTree(kindOf(d), transport(d.ip)); } catch(x) { d.err = String(x.message || x); d.tree = {}; }
    d.treeBusy = false; paint();
  }
  const setCount = (d, sec) => { let n = 0; for(const e of d.S.values()) if(!sec || SET.fieldById(kindOf(d), e.fid)?.sec === sec) n++; return n; };
  // one control for one value of one setting
  function ctl(d, f, ids, val, extra = ''){
    const key = skey(f.id, ids), edited = d.S.has(key), v = edited ? d.S.get(key).value : val, cls = edited ? 'chg' : '', at = `data-sf="${esc(f.id)}" data-ids='${esc(JSON.stringify(ids))}' ${extra}`;
    const title = esc([f.desc, f.min != null || f.max != null ? `${f.min ?? ''}…${f.max ?? ''}` : '', f.danger ? t('Careful: this can cut the connection', 'Pas op: dit kan de verbinding verbreken') : ''].filter(Boolean).join(' — '));
    if(v === undefined) return `<span class="subtle">–</span>`;
    if(f.type === 'boolean') return `<input type="checkbox" class="${cls}" ${at} ${v ? 'checked' : ''} title="${title}">`;
    if(f.type === 'enum') return `<select class="${cls}" ${at} title="${title}">${f.enum.map(o => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}${f.enum.some(o => String(o) === String(v)) ? '' : `<option value="${esc(v)}" selected>${esc(v)}</option>`}</select>`;
    if(f.type === 'integer' || f.type === 'number') return `<input type="number" class="${cls}" ${at} value="${esc(v)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.type === 'integer' ? 1 : 'any'}" title="${title}">`;
    if(f.type === 'list') return `<input type="text" class="${cls}" ${at} value="${esc(SET.display(v))}" title="${title}" placeholder="1, 2, 3">`;
    if(/^#/.test(String(v)) && f.pattern && /a-fA-F0-9/.test(f.pattern)) return `<input type="color" class="${cls}" ${at} value="${esc(String(v).slice(0, 7))}" title="${title}">`;
    return `<input type="text" class="${cls}" ${at} value="${esc(v)}" ${f.maxLength ? `maxlength="${f.maxLength}"` : ''} title="${title}">`;
  }
  function fieldsTable(d, list){
    const k = kindOf(d), tree = d.tree, cid = list[0].coll, ids = SET.itemsOf(k, tree, cid);
    if(!ids.length) return `<div class="subtle">${t('None on this device.', 'Geen op dit apparaat.')}</div>`;
    const head = list.map(f => `<th title="${esc((f.group ? f.group + ' › ' : '') + f.label)}">${esc(f.label)}${f.danger ? ' ⚠' : ''}<div class="nc-all">${ctl(d, f, [], SET.valueOf(k, tree, f, ids[0]) ?? (f.type === 'boolean' ? false : f.enum?.[0] ?? ''), 'data-all="1"')}<button data-sfall="${esc(f.id)}" title="${t('Set this value on every row', 'Zet deze waarde op elke rij')}">${t('all', 'alle')}</button></div></th>`).join('');
    const rows = ids.map(it => `<tr><th class="nc-rowh">${esc(SET.labelOfItem(k, cid, it))}</th>${list.map(f => `<td>${ctl(d, f, it, SET.valueOf(k, tree, f, it))}</td>`).join('')}</tr>`).join('');
    return `<div class="nc-set-wrap" data-scrollkey="${esc(d.ip + cid)}"><table class="nc-set-table"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function settingsBody(d){
    const k = kindOf(d), secs = SET.sections(k), q = d.setQ.trim().toLowerCase();
    const sec = d.setSec && secs.some(x => x.id === d.setSec) ? d.setSec : secs[0].id;
    const match = f => !q || `${f.label} ${f.group} ${f.desc || ''} ${SET.titleOf(k, f.sec)}`.toLowerCase().includes(q);
    const all = SET.fields(k).filter(f => (q ? true : f.sec === sec) && match(f));
    const bySec = new Map(); for(const f of all){ if(!bySec.has(f.sec)) bySec.set(f.sec, []); bySec.get(f.sec).push(f); }
    const part = [...bySec.entries()].map(([sc, list]) => {
      const glob = list.filter(f => !f.coll), colls = [...new Set(list.filter(f => f.coll).map(f => f.coll))];
      const groups = [...new Set(glob.map(f => f.group))];
      return `${q ? `<h4 class="nc-set-h">${esc(SET.titleOf(k, sc))}</h4>` : ''}
        ${groups.map(g => `<div class="nc-set-grid">${g ? `<div class="nc-set-g">${esc(g)}</div>` : ''}${glob.filter(f => f.group === g).map(f => `<label class="nc-set-row"><span>${esc(f.label)}${f.danger ? ' ⚠' : ''}${f.desc ? `<small>${esc(f.desc)}</small>` : ''}</span>${ctl(d, f, [], SET.valueOf(k, d.tree, f, []))}</label>`).join('')}</div>`).join('')}
        ${colls.map(cid => `<div class="nc-set-coll"><b>${esc(SET.collOf(k, { coll: cid }) ? (SET.fieldById(k, list.find(f => f.coll === cid).id) && cid.split('/').filter(x => !x.startsWith('{')).slice(2).map(x => x.replace(/_/g, ' ')).join(' › ')) : cid)}</b></div>${fieldsTable(d, list.filter(f => f.coll === cid))}`).join('')}`;
    }).join('') || `<div class="subtle">${t('Nothing found.', 'Niets gevonden.')}</div>`;
    return `<div class="nc-set-chips">${secs.map(x => `<button class="nc-chip ${!q && x.id === sec ? 'on' : ''}" data-setsec="${esc(x.id)}" style="--pc:var(--accent)">${esc(x.title)} <small>${x.count}</small>${setCount(d, x.id) ? `<b class="nc-set-n">${setCount(d, x.id)}</b>` : ''}</button>`).join('')}</div>${part}`;
  }
  function settingsHtml(d){
    if(!d.cur) return '';
    const n = d.S.size;
    const head = `<div class="nc-eink-h" data-setopen="${esc(d.ip)}"><span class="nc-chev ${d.setOpen ? 'open' : ''}">${I('chevronRight', 13)}</span><b>${t('All settings', 'Alle instellingen')}</b><span class="subtle">${t('everything the device lets you change', 'alles wat het apparaat laat veranderen')}</span>${n ? `<span class="tag yellow">${n} ${t('changed', 'gewijzigd')}</span>` : ''}</div>`;
    if(!d.setOpen) return `<div class="nc-eink" data-sip="${esc(d.ip)}">${head}</div>`;
    return `<div class="nc-eink open nc-set" data-sip="${esc(d.ip)}">${head}<div class="nc-set-body">
      <div class="nc-row"><label>${t('Search', 'Zoeken')}<input data-setq value="${esc(d.setQ)}" placeholder="${t('e.g. jumbo, IGMP, PoE …', 'bijv. jumbo, IGMP, PoE …')}" style="width:240px"></label><span style="flex:1"></span>
        <button data-setcopy="${esc(d.ip)}">${I('copy', 13)}${t('Send to other devices…', 'Naar andere apparaten sturen…')}</button><button data-setreload="${esc(d.ip)}">${I('refresh', 13)}${t('Read again', 'Opnieuw lezen')}</button></div>
      ${d.treeBusy || !d.tree ? `<div class="subtle">${t('Reading all settings…', 'Alle instellingen uitlezen…')}</div>` : settingsBody(d)}</div></div>`;
  }
  // ---- send settings to other devices of the same kind ----
  async function copyDialog(d){
    await load(); const k = kindOf(d), others = [...C.dev.values()].filter(x => x !== d && x.kind === d.kind && x.cur);
    if(!others.length){ App.ui.toast(t('There is no other device of this kind', 'Er is geen ander apparaat van dit soort'), 'info'); return; }
    const secs = SET.sections(k), mine = d.S.size;
    const dlg = App.ui.openDialog({ title:t('Send settings to other devices', 'Instellingen naar andere apparaten sturen'), subtitle:`${d.name || d.ip}`, width:'720px', body:`<div class="nc-copy">
        <div><b>${t('What', 'Wat')}</b>
          <label class="nc-chk"><input type="radio" name="cpwhat" value="mine" ${mine ? 'checked' : 'disabled'}> ${t('My changes in All settings', 'Mijn wijzigingen in Alle instellingen')} (${mine})</label>
          <label class="nc-chk"><input type="radio" name="cpwhat" value="secs" ${mine ? '' : 'checked'}> ${t('Whole sections of this device (only where the other device differs):', 'Hele onderdelen van dit apparaat (alleen waar het andere apparaat verschilt):')}</label>
          <div class="nc-cp-secs">${secs.map(x => `<label class="nc-chk"><input type="checkbox" data-cpsec="${esc(x.id)}" ${x.id === d.setSec ? 'checked' : ''}> ${esc(x.title)}</label>`).join('')}</div>
          <label class="nc-chk"><input type="checkbox" id="cpDev"> ${t('also names, descriptions and addresses', 'ook namen, beschrijvingen en adressen')}</label>
          <label class="nc-chk"><input type="checkbox" id="cpDanger"> ${t('also risky settings (IP, security, switching ports off)', 'ook risicovolle instellingen (IP, beveiliging, poorten uitzetten)')}</label></div>
        <div><b>${t('To', 'Naar')}</b> <button id="cpAll">${t('all', 'alle')}</button> <button id="cpNone">${t('none', 'geen')}</button>
          <div class="nc-cp-list">${others.map(o => `<label class="nc-chk"><input type="checkbox" data-cpdev="${esc(o.ip)}" checked> ${esc(o.name || o.ip)} <span class="subtle">${esc(o.ip)}${o.link ? ' · ' + esc(linkLabel(planItems().find(x => x.id === o.link) || { kind:'sw', label:'', dc:'' })) : ''}</span></label>`).join('')}</div></div>
        <div class="subtle">${t('This only prepares the changes on those devices. Check them on each device (or under “Apply all”) and send when you are ready.', 'Dit zet de wijzigingen alleen klaar op die apparaten. Controleer ze per apparaat (of onder “Alles toepassen”) en stuur als je klaar bent.')}</div></div>`,
      footer:`<button class="primary" data-a="go">${t('Prepare', 'Klaarzetten')}</button><button data-a="x">${t('Cancel', 'Annuleren')}</button>` });
    const q = s => dlg.body.querySelector(s), qa = s => [...dlg.body.querySelectorAll(s)];
    q('#cpAll').onclick = () => qa('[data-cpdev]').forEach(c => { c.checked = true; }); q('#cpNone').onclick = () => qa('[data-cpdev]').forEach(c => { c.checked = false; });
    dlg.footer.querySelector('[data-a=x]').onclick = () => dlg.close();
    dlg.footer.querySelector('[data-a=go]').onclick = async () => {
      const what = qa('[name=cpwhat]').find(r => r.checked)?.value, secsSel = qa('[data-cpsec]').filter(c => c.checked).map(c => c.dataset.cpsec), targets = qa('[data-cpdev]').filter(c => c.checked).map(c => D(c.dataset.cpdev));
      if(!targets.length){ App.ui.toast(t('Pick at least one device', 'Kies minstens één apparaat'), 'info'); return; }
      if(what === 'secs' && !secsSel.length){ App.ui.toast(t('Pick at least one section', 'Kies minstens één onderdeel'), 'info'); return; }
      if(!d.tree) await settingsLoad(d);
      let total = 0;
      for(const o of targets){
        if(!o.tree) o.tree = await SET.readTree(k, transport(o.ip));
        const edits = what === 'mine' ? SET.carryEdits(k, [...d.S.values()], o.tree) : SET.copyEdits(k, d.tree, o.tree, { secs:secsSel, includeDev:q('#cpDev').checked, includeDanger:q('#cpDanger').checked });
        for(const e of edits){ const f = SET.fieldById(k, e.fid); if(!SET.same(SET.valueOf(k, o.tree, f, e.ids), e.value)){ o.S.set(skey(e.fid, e.ids), e); total++; } }
      }
      dlg.close(); paint();
      App.ui.toast(`${total} ${t('changes prepared on', 'wijzigingen klaargezet op')} ${targets.length} ${t('devices — look at “Apply all”', 'apparaten — kijk bij “Alles toepassen”')}`, 'ok');
    };
  }
  function bindSettings(qa){
    const dv = el => D(el.closest('[data-sip]').dataset.sip);
    qa('[data-setopen]').forEach(h => h.onclick = () => { const d = D(h.dataset.setopen); d.setOpen = !d.setOpen; paint(); if(d.setOpen) settingsLoad(d); });
    qa('[data-setsec]').forEach(b => b.onclick = () => { const d = dv(b); d.setSec = b.dataset.setsec; d.setQ = ''; paint(); });
    qa('[data-setq]').forEach(i => { i.onchange = () => { const d = dv(i); d.setQ = i.value; paint(); const n = root.querySelector(`[data-sip="${d.ip}"] [data-setq]`); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }; });
    qa('[data-setreload]').forEach(b => b.onclick = () => { const d = D(b.dataset.setreload); d.tree = null; paint(); settingsLoad(d); });
    qa('[data-setcopy]').forEach(b => b.onclick = () => copyDialog(D(b.dataset.setcopy)));
    const store = (d, f, ids, el) => {
      const raw = el.type === 'checkbox' ? el.checked : el.value, c = SET.coerce(f, raw), key = skey(f.id, ids);
      if(!c.ok){ el.classList.add('bad'); el.title = c.err; return false; }
      const cur = SET.valueOf(kindOf(d), d.tree, f, ids);
      if(SET.same(cur, c.value)) d.S.delete(key); else d.S.set(key, { fid:f.id, ids:ids.slice(), value:c.value });
      return true;
    };
    qa('[data-sf]:not([data-all])').forEach(el => el.onchange = () => { const d = dv(el), f = SET.fieldById(kindOf(d), el.dataset.sf); if(store(d, f, JSON.parse(el.dataset.ids), el)) paint(); });
    qa('[data-sfall]').forEach(b => b.onclick = () => {
      const d = dv(b), k = kindOf(d), f = SET.fieldById(k, b.dataset.sfall), src = b.parentElement.querySelector('[data-sf]');
      let n = 0; for(const ids of SET.itemsOf(k, d.tree, f.coll)){ if(SET.valueOf(k, d.tree, f, ids) === undefined) continue; if(store(d, f, ids, src)) n++; }
      paint();
    });
  }

  // ---------- drawing ----------
  const linkLabel = it => `${it.kind === 'sw' ? 'Switch' : 'LumiNode'} · ${it.label} (${it.dc})`;
  function swTileHtml(d, r){
    const v = swTile(d, r), sel = d.sel === r.port;
    return `<button class="nc-port ${v.changed ? 'chg' : ''} ${sel ? 'sel' : ''} ${v.trunk ? 'trunk' : ''}" data-port="${r.port}" style="--pc:${esc(v.color)}" title="${esc(`${t('Port', 'Poort')} ${r.port} · ${v.legend || '—'} · ${v.trunk ? 'Trunk' : v.vid != null ? `VLAN ${v.vid} ${v.label}` : '—'}${v.poe ? ' · PoE' : ''}`)}">
      <span class="nc-top"><span class="nc-no">${r.port}</span><span class="nc-ico">${v.poe ? I('plug', 11) : ''}${v.trunk ? '⇄' : ''}</span></span>
      <span class="nc-nm">${esc(v.legend || '')}</span>
      <span class="nc-vl">${esc(v.trunk ? 'Trunk' : v.vid != null ? v.vid : '–')}</span></button>`;
  }
  function ndView(d, p){
    const e = d.E.get(p.index) || {};
    return { name:e.name ?? p.name ?? '', dir:e.dir ?? p.dir, klass:e.klass ?? p.klass, uni:e.universe != null ? e.universe : api.uniShown(p, C.offset), changed:d.E.has(p.index) && Object.keys(e).length > 0 };
  }
  const KL = k => (k === 'sacn' ? 'sACN' : k === 'artnet' ? 'Art-Net' : '–');
  function ndTileHtml(d, p){
    const v = ndView(d, p), sel = d.sel === p.index, off = v.dir === 'idle';
    const col = off || v.uni == null ? '#64748b' : v.klass === 'artnet' ? `hsl(${(v.uni * 37) % 360} 60% 46%)` : `hsl(${(v.uni * 37 + 180) % 360} 55% 44%)`;
    return `<button class="nc-port nd ${v.changed ? 'chg' : ''} ${sel ? 'sel' : ''} ${off ? 'off' : ''}" data-port="${p.index}" style="--pc:${col}" title="${esc(`DMX ${p.index + 1} · ${v.name || '—'} · ${v.dir === 'output' ? t('output', 'uitgang') : v.dir === 'input' ? t('input', 'ingang') : t('off', 'uit')} · ${KL(v.klass)} ${v.uni ?? ''}${p.understood ? '' : ' · ' + t('set-up not recognised', 'opzet niet herkend')}`)}">
      <span class="nc-top"><span class="nc-no">${p.index + 1}</span><span class="nc-ico">${v.dir === 'output' ? '→ DMX' : v.dir === 'input' ? 'DMX →' : t('off', 'uit')}</span></span>
      <span class="nc-nm">${esc(v.name)}</span>
      <span class="nc-vl"><small>${v.klass === 'sacn' ? 'sACN' : v.klass === 'artnet' ? 'Art' : ''}</small> ${v.uni == null || off ? '–' : v.uni}</span></button>`;
  }
  function detailHtml(d){
    const idx = d.sel; if(idx == null) return `<div class="subtle nc-det">${isSw(d) ? t('Pick a VLAN and click ports, or click a port to edit it.', 'Kies een VLAN en klik op poorten, of klik op een poort om hem aan te passen.') : t('Set a universe (and protocol / direction) in the brush and click ports, or click a port to edit it.', 'Stel een universe (en protocol / richting) in de kwast in en klik op poorten, of klik op een poort om hem aan te passen.')}</div>`;
    if(isSw(d)){
      const r = api.portRows(d.cur).find(x => x.port === idx); if(!r) return '';
      const v = swTile(d, r), brushes = swBrushes(d);
      const cur = v.trunk ? 'fibre' : v.vid != null ? `vid:${v.vid}` : '';
      return `<div class="nc-det"><b>${t('Port', 'Poort')} ${r.port}</b> <span class="subtle">${esc(r.type)} · ${t('on the switch', 'op de switch')}: ${esc(r.member ? `${r.member.type} ${r.member.id}${r.groupName ? ' “' + r.groupName + '”' : ''}` : t('no group', 'geen groep'))}${r.link != null ? ` · ${esc(typeof r.link === 'object' ? JSON.stringify(r.link) : r.link)}` : ''}</span>
        <label>${t('Name', 'Naam')}<input data-f="legend" maxlength="16" value="${esc(v.legend)}"></label>
        <label>${t('Type / VLAN', 'Type / VLAN')}<select data-f="member"><option value="" ${cur ? '' : 'selected'}>—</option><optgroup label="${t('Access (one VLAN)', 'Toegang (één VLAN)')}">${brushes.map(b => `<option value="vid:${b.vid}" ${cur === `vid:${b.vid}` ? 'selected' : ''}>${b.vid} · ${esc(b.name)}${b.isNew ? ` (${t('new', 'nieuw')})` : ''}</option>`).join('')}</optgroup><optgroup label="Trunk"><option value="fibre" ${cur === 'fibre' ? 'selected' : ''}>${t('Trunk (all VLANs, fibre)', 'Trunk (alle VLAN’s, fibre)')}</option></optgroup></select></label>
        ${v.poe == null ? '' : `<label>PoE<span><input type="checkbox" data-f="poe" ${v.poe ? 'checked' : ''}> ${t('on', 'aan')}</span></label>`}
        <label>${t('Speed', 'Snelheid')}<select data-f="speed">${api.SPEEDS.map(s => `<option value="${esc(s)}" ${s === v.speed ? 'selected' : ''}>${esc(s === 'auto' ? 'Auto' : s)}</option>`).join('')}</select></label></div>`;
    }
    const p = d.cur.ports[idx]; if(!p) return ''; const v = ndView(d, p);
    return `<div class="nc-det"><b>DMX ${idx + 1}</b>
      <label>${t('Name', 'Naam')}<input data-f="name" maxlength="64" value="${esc(v.name)}"></label>
      <label>${t('Direction', 'Richting')}<select data-f="dir"><option value="output" ${v.dir === 'output' ? 'selected' : ''}>${t('Output — network → DMX', 'Uitgang — netwerk → DMX')}</option><option value="input" ${v.dir === 'input' ? 'selected' : ''}>${t('Input — DMX → network', 'Ingang — DMX → netwerk')}</option><option value="idle" ${v.dir === 'idle' ? 'selected' : ''}>${t('Off', 'Uit')}</option></select></label>
      <label>${t('Protocol', 'Protocol')}<select data-f="klass"><option value="sacn" ${v.klass === 'sacn' ? 'selected' : ''}>sACN</option><option value="artnet" ${v.klass === 'artnet' ? 'selected' : ''}>Art-Net</option>${v.klass ? '' : '<option value="" selected>–</option>'}</select></label>
      <label>Universe<input data-f="universe" type="number" min="0" max="63999" value="${esc(v.uni ?? '')}" style="width:90px"></label>
      ${!p.understood ? `<span class="su-warn">${t('The set-up of this port is not recognised, so it is not changed.', 'De opzet van deze poort wordt niet herkend, dus hij wordt niet gewijzigd.')}</span>` : ''}</div>`;
  }
  function brushBar(d){
    if(isSw(d)){
      const b = d.brush;
      return `<div class="nc-brush"><span class="subtle">${t('Pick a VLAN, then click or drag over ports', 'Kies een VLAN, klik of sleep dan over poorten')}:</span>${swBrushes(d).map(x => `<button class="nc-chip ${b?.vid === x.vid && b.type === 'vid' ? 'on' : ''}" data-brush="vid:${x.vid}" style="--pc:${esc(x.color || '#64748b')}"><i></i>${x.vid} ${esc(x.name)}${x.isNew ? ' +' : ''}</button>`).join('')}<button class="nc-chip ${b?.type === 'fibre' ? 'on' : ''}" data-brush="fibre" style="--pc:#38bdf8"><i></i>Trunk</button>${b ? `<button class="nc-chip x" data-brush="">${I('x', 11)} ${t('no brush', 'geen kwast')}</button>` : ''}</div>`;
    }
    const b = d.brush || {};
    return `<div class="nc-brush"><span class="subtle">${t('Brush', 'Kwast')}:</span>
      <label class="nc-bl">${t('Direction', 'Richting')}<select data-bdir><option value="" ${!b.dir ? 'selected' : ''}>${t('keep', 'houden')}</option><option value="output" ${b.dir === 'output' ? 'selected' : ''}>${t('Output', 'Uitgang')}</option><option value="input" ${b.dir === 'input' ? 'selected' : ''}>${t('Input', 'Ingang')}</option><option value="idle" ${b.dir === 'idle' ? 'selected' : ''}>${t('Off', 'Uit')}</option></select></label>
      <label class="nc-bl">${t('Protocol', 'Protocol')}<select data-bklass><option value="" ${!b.klass ? 'selected' : ''}>${t('keep', 'houden')}</option><option value="sacn" ${b.klass === 'sacn' ? 'selected' : ''}>sACN</option><option value="artnet" ${b.klass === 'artnet' ? 'selected' : ''}>Art-Net</option></select></label>
      <label class="nc-bl">Universe<input type="number" min="0" max="63999" data-uni value="${esc(b.universe ?? '')}" placeholder="–" style="width:90px"></label>
      <label class="nc-chk"><input type="checkbox" data-auto ${b.auto !== false ? 'checked' : ''}> ${t('next port gets the next universe', 'volgende poort krijgt het volgende universe')}</label>${d.brush ? `<button class="nc-chip x" data-brush="">${I('x', 11)} ${t('no brush', 'geen kwast')}</button>` : ''}</div>`;
  }
  function cardHtml(d){
    const it = planOf(d), open = C.open.has(d.ip), n = d.cur ? changeCount(d) : 0;
    const ico = d.kind === 'gigacore' ? 'switchDev' : 'network';
    const status = d.busy ? `<span class="tag">${t('working…', 'bezig…')}</span>` : d.moved ? `<span class="tag yellow">${t('moved', 'verhuisd')}</span>` : d.err ? `<span class="tag red" title="${esc(d.err)}">${t('error', 'fout')}</span>` : d.kind === 'unknown' ? `<span class="tag yellow">${t('login needed', 'login nodig')}</span>` : !d.cur ? `<span class="tag">${t('not read', 'niet gelezen')}</span>` : n ? `<span class="tag yellow">${n} ${t('changes', 'wijzigingen')}</span>` : d.verified ? `<span class="tag green">${t('sent and checked', 'verstuurd en gecontroleerd')}</span>` : `<span class="tag green">${t('up to date', 'actueel')}</span>`;
    const opts = planItems().filter(x => x.kind === (isSw(d) ? 'sw' : 'nd') && (x.id === d.link || ![...C.dev.values()].some(o => o.link === x.id)));
    const head = `<div class="nc-head" data-toggle="${esc(d.ip)}"><span class="nc-chev ${open ? 'open' : ''}">${I('chevronRight', 14)}</span><span class="nc-ic ${d.kind}">${I(ico, 18)}</span>
      <span class="nc-title"><b>${esc(d.name || d.model || d.ip)}</b><small>${esc(d.ip)} · ${esc(d.kind === 'gigacore' ? (d.model || 'GigaCore') : `LumiNode${d.version ? ' ' + d.version : ''}`)}${d.cur ? ` · ${isSw(d) ? d.cur.ports.length + ' ' + t('ports', 'poorten') : d.cur.ports.length + ' DMX'}` : ''}</small></span>
      ${d.kind === 'unknown' ? '' : `<select class="nc-link" data-link="${esc(d.ip)}" title="${t('Which switch or node of the plan this is', 'Welke switch of node uit het plan dit is')}"><option value="">${t('not linked to the plan', 'niet gekoppeld aan het plan')}</option>${opts.map(x => `<option value="${esc(x.id)}" ${x.id === d.link ? 'selected' : ''}>${esc(linkLabel(x))}</option>`).join('')}</select>`}
      ${status}</div>`;
    if(!open) return `<div class="nc-card">${head}</div>`;
    let body = '';
    if(d.kind === 'unknown') body = `<div class="nc-body"><div class="subtle">${t('This device asks for a login. Fill in the user name and password above and discover again.', 'Dit apparaat vraagt om een login. Vul gebruikersnaam en wachtwoord hierboven in en ontdek opnieuw.')}</div></div>`;
    else if(!d.cur) body = `<div class="nc-body">${d.moved ? `<div class="su-warn">${I('alert', 13)} ${t(`This device moved to ${d.moved.to} (was ${d.moved.from}). This computer has no address in that range.`, `Dit apparaat is verhuisd naar ${d.moved.to} (was ${d.moved.from}). Deze computer heeft geen adres in dat bereik.`)} <button class="sm" data-fixmoved="${esc(d.ip)}">${t('Add address to this computer', 'Adres toevoegen aan deze computer')}</button></div>` : ''}${d.err ? `<div class="su-warn">${esc(d.err)}</div>` : ''}<button data-read="${esc(d.ip)}" ${d.busy ? 'disabled' : ''}>${I('refresh', 13)}${t('Read the device', 'Apparaat uitlezen')}</button></div>`;
    else {
      const o = opsOf(d), f = d.dev;
      const grid = isSw(d)
        ? `<div class="nc-grid">${api.portRows(d.cur).map(r => swTileHtml(d, r)).join('')}</div>`
        : `<div class="nc-grid nd">${d.cur.ports.map(p => ndTileHtml(d, p)).join('')}</div>`;
      const devFields = isSw(d)
        ? `<label>${t('Name', 'Naam')}<input data-df="name" value="${esc(f.name ?? d.cur.device?.name ?? '')}" maxlength="64"></label><label>IP<input data-df="ip" value="${esc(f.ip ?? d.cur.ip?.ip_address ?? '')}" style="width:130px"></label>`
        : `<label>${t('Name', 'Naam')}<input data-df="shortName" value="${esc(f.shortName ?? d.cur.info?.short_name ?? '')}" maxlength="17"></label><label>${t('Long name', 'Lange naam')}<input data-df="longName" value="${esc(f.longName ?? d.cur.info?.long_name ?? '')}" maxlength="63"></label><label>IP<input data-df="ip" value="${esc(f.ip ?? d.cur.ip?.ipaddress ?? '')}" style="width:130px"></label>`;
      body = `<div class="nc-body">${d.err ? `<div class="su-warn">${esc(d.err)}</div>` : ''}
        <div class="nc-row">${devFields}<span style="flex:1"></span>${it ? `<button data-fill="${esc(d.ip)}">${t('Fill from the plan', 'Invullen uit het plan')}</button>` : ''}<button data-read="${esc(d.ip)}">${I('refresh', 13)}${t('Read again', 'Opnieuw lezen')}</button></div>
        ${f.ip && f.ip !== (isSw(d) ? d.cur.ip?.ip_address : d.cur.ip?.ipaddress) ? `<div class="su-warn">${t('The IP address changes when you apply; the device then moves to the new address.', 'Het IP-adres verandert bij het toepassen; het apparaat verhuist dan naar het nieuwe adres.')}</div>` : ''}
        ${isSw(d) && d.cur.mode === 'advanced' ? `<div class="su-warn">${t('This switch is in “advanced” configuration mode: it is also set with its command line, so groups and trunks made here may not show correctly.', 'Deze switch staat in “advanced” configuratiemodus: hij wordt ook met zijn commandoregel ingesteld, dus groepen en trunks die hier gemaakt worden kunnen verkeerd getoond worden.')} <button data-lxmode="${esc(d.ip)}">${t('Switch to Luminex mode…', 'Naar Luminex-modus…')}</button></div>` : ''}
        ${brushBar(d)}${grid}${detailHtml(d)}
        ${isSw(d) ? trunkHtml(d) + einkHtml(d) + lightsHtml(d) : ''}
        ${settingsHtml(d)}
        ${o.notes.map(x => `<div class="subtle" style="font-size:12px">${I('info', 12)} ${esc(x)}</div>`).join('')}
        ${logHtml(d)}
        <div class="nc-row"><span class="subtle">${n} ${t('changes waiting', 'wijzigingen wachten')}</span><span style="flex:1"></span><button data-undo="${esc(d.ip)}" ${d.E.size || Object.keys(f).length || d.trunkEdit || d.S.size ? '' : 'disabled'}>${t('Undo my changes', 'Mijn wijzigingen ongedaan maken')}</button><button class="primary" data-apply="${esc(d.ip)}" ${n && !d.busy ? '' : 'disabled'}>${t('Apply…', 'Toepassen…')}</button></div></div>`;
    }
    return `<div class="nc-card open">${head}${body}</div>`;
  }
  function paint(){
    if(App.getMODEL?.()?.ui?.view !== 'NETCONFIG') return;       // never draw over another page
    if(!root || !root.isConnected) root = App.$('#lkDetail'); if(!root) return;
    const sc = App.$('#mainScroll'), top = sc ? sc.scrollTop : 0, wraps = {}; root.querySelectorAll('[data-scrollkey]').forEach(w => { wraps[w.dataset.scrollkey] = [w.scrollLeft, w.scrollTop]; });
    const devs = [...C.dev.values()].sort((a, b) => (a.kind === 'gigacore' ? 0 : a.kind === 'lumi' ? 1 : 2) - (b.kind === 'gigacore' ? 0 : b.kind === 'lumi' ? 1 : 2) || ipNum(a.ip) - ipNum(b.ip));
    const total = devs.reduce((n, d) => n + (d.cur ? changeCount(d) : 0), 0);
    const missing = planItems().filter(x => !devs.some(d => d.link === x.id));
    const nSw = devs.filter(d => d.kind === 'gigacore').length, nNd = devs.filter(d => d.kind === 'lumi').length, nUn = devs.filter(d => d.kind === 'unknown').length;
    App.pageHead?.({ eyebrow:t('Network', 'Netwerk'), title:t('Network config', 'Netwerkconfig'), sub:t('All your LumiNodes and GigaCore switches on one page: discover them, paint the VLANs and universes, apply.', 'Al je LumiNodes en GigaCore-switches op één pagina: ontdek ze, schilder de VLAN’s en universes, pas toe.'),
      actions:`<button data-cmd="align" title="${t('Find, blink, link and send in guided steps', 'Zoeken, knipperen, koppelen en sturen in stappen')}">${I('compass', 15)}${t('Align tool', 'Uitlijntool')}</button><button class="primary" id="ncDisc" ${C.busy ? 'disabled' : ''}>${I('search', 15)}${C.busy ? t('Searching…', 'Zoeken…') : C.found ? t('Discover again', 'Opnieuw ontdekken') : t('Discover devices', 'Apparaten ontdekken')}</button>` });
    root.innerHTML = `<div class="stack nc">
      <details class="nc-conn" ${C.found ? '' : 'open'}><summary>${I('sliders', 14)} ${t('Connection', 'Verbinding')} <span class="subtle">${esc(C.user)}${C.ranges ? ' · ' + esc(C.ranges) : ''}</span></summary>
        <div class="nc-row"><label>${t('User name', 'Gebruikersnaam')}<input id="ncUser" value="${esc(C.user)}" style="width:110px" autocomplete="off"></label><label>${t('Password', 'Wachtwoord')}<input id="ncPass" type="password" value="${esc(C.pass)}" style="width:110px" autocomplete="off"></label>
          <label class="nc-chk"><input type="checkbox" id="ncTls" ${C.https ? 'checked' : ''}> https</label>
          <label>${t('Where to look', 'Waar zoeken')}<input id="ncRanges" value="${esc(C.ranges)}" placeholder="${t('empty = the networks of this computer', 'leeg = de netwerken van deze computer')}" style="width:300px"></label></div>
        <div class="nc-row"><label>${t('Art-Net universe numbers', 'Art-Net-universenummers')}<select id="ncOff"><option value="0" ${C.offset === 0 ? 'selected' : ''}>${t('as the node shows them (default)', 'zoals de node ze toont (standaard)')}</option><option value="-1" ${C.offset === -1 ? 'selected' : ''}>${t('one lower (universe 1 = Art-Net 0)', 'één lager (universe 1 = Art-Net 0)')}</option></select></label>
          <label>${t('Save switch in profile slot', 'Bewaar switch in profielslot')}<input id="ncSlot" value="${esc(C.slot)}" placeholder="–" style="width:60px"></label>
          <label class="nc-chk"><input type="checkbox" id="ncIp" ${C.withIp ? 'checked' : ''}> ${t('“Fill from the plan” also sets the IP address', '“Invullen uit het plan” zet ook het IP-adres')}</label></div>
        <div class="subtle" style="font-size:12px">${t('Examples to look: 192.168.40.0/24 · 10.90.101.20-60 · 192.168.1.10. Leave empty to search the whole network of this computer (up to a /16, about 15 seconds).', 'Voorbeelden: 192.168.40.0/24 · 10.90.101.20-60 · 192.168.1.10. Leeg laten doorzoekt het hele netwerk van deze computer (tot een /16, ongeveer 15 seconden).')}</div>
        ${real() ? '' : `<div class="hint nd-sim">${I('info', 13)} ${t('Simulated devices — one pretend device on every planned address, so you can try this out. In the desktop app the real devices answer.', 'Gesimuleerde apparaten — één nepapparaat op elk gepland adres, zodat je dit kunt uitproberen. In de desktop-app antwoorden de echte apparaten.')}</div>`}</details>
      ${C.err ? `<div class="su-warn">${esc(C.err)}</div>` : ''}
      ${C.found ? `<div class="nc-bar"><span><b>${nSw}</b> GigaCore · <b>${nNd}</b> LumiNode${nUn ? ` · <b>${nUn}</b> ${t('need a login', 'vragen een login')}` : ''}${C.info ? ` <span class="subtle">· ${esc(C.info)}</span>` : ''}</span><span style="flex:1"></span>
        <button id="ncFillAll">${t('Fill all from the plan', 'Alles invullen uit het plan')}</button><button id="ncReadAll">${I('refresh', 13)}${t('Read all', 'Alles lezen')}</button><button class="primary" id="ncApplyAll" ${total ? '' : 'disabled'}>${t('Apply all', 'Alles toepassen')} (${total})…</button></div>
        ${devs.length ? devs.map(cardHtml).join('') : `<div class="subtle" style="margin:14px 0">${t('Nothing answered. Check the cable and the address range, and fill in the user name and password if the devices ask for a login.', 'Niets antwoordde. Controleer de kabel en het adresbereik, en vul gebruikersnaam en wachtwoord in als de apparaten om een login vragen.')}</div>`}
        ${missing.length ? `<details class="nc-missing"><summary>${missing.length} ${t('items of the plan have no device yet', 'onderdelen uit het plan hebben nog geen apparaat')}</summary><div class="subtle">${missing.map(x => `${esc(linkLabel(x))}${x.ip ? ` · ${esc(x.ip)}` : ''}`).join('<br>')}</div></details>` : ''}`
        : `<div class="nc-empty">${I('search', 30)}<b>${t('Find your devices', 'Vind je apparaten')}</b><span>${t('Press Discover to list every LumiNode and GigaCore switch on the network at once. Each one is linked to a switch or node of your plan.', 'Druk op Ontdekken om elke LumiNode en GigaCore-switch op het netwerk in één keer te tonen. Elk apparaat wordt gekoppeld aan een switch of node uit je plan.')}</span></div>`}
    </div>`;
    if(sc) sc.scrollTop = top;
    root.querySelectorAll('[data-scrollkey]').forEach(w => { const p = wraps[w.dataset.scrollkey]; if(p){ w.scrollLeft = p[0]; w.scrollTop = p[1]; } });
    bind();
  }
  function tileUpdate(d, port){
    const el = root.querySelector(`.nc-port[data-port="${port}"]`); if(!el) return;
    const html = isSw(d) ? swTileHtml(d, api.portRows(d.cur).find(r => r.port === port)) : ndTileHtml(d, d.cur.ports[port]);
    const tmp = document.createElement('div'); tmp.innerHTML = html; el.replaceWith(tmp.firstElementChild);
  }
  function bind(){
    const q = s => root.querySelector(s), qa = s => root.querySelectorAll(s), devOf = el => D(el.closest('[data-ip]')?.dataset.ip || el.dataset.ip);
    q('#ncDisc') ; const disc = document.querySelector('#ncDisc'); if(disc) disc.onclick = discover;
    qa('[data-fixmoved]').forEach(b => b.onclick = async () => { b.disabled = true; await fixMoved(D(b.dataset.fixmoved)); });
    const bindVal = (id, fn) => { const e = q(id); if(e) e.onchange = ev => fn(ev.target); };
    bindVal('#ncUser', e => { C.user = e.value; }); bindVal('#ncPass', e => { C.pass = e.value; }); bindVal('#ncTls', e => { C.https = e.checked; }); bindVal('#ncRanges', e => { C.ranges = e.value.trim(); });
    bindVal('#ncOff', e => { C.offset = Number(e.value); paint(); }); bindVal('#ncSlot', e => { C.slot = e.value.trim(); }); bindVal('#ncIp', e => { C.withIp = e.checked; });
    if(q('#ncReadAll')) q('#ncReadAll').onclick = async () => { await pool([...C.dev.values()].filter(d => d.kind !== 'unknown'), 4, async d => { await readDev(d); paint(); }); };
    if(q('#ncFillAll')) q('#ncFillAll').onclick = () => { let n = 0; for(const d of C.dev.values()) if(fillFromPlan(d)) n++; paint(); App.ui.toast(`${n} ${t('devices filled from the plan — nothing is sent yet', 'apparaten ingevuld uit het plan — er is nog niets gestuurd')}`, 'info'); };
    if(q('#ncApplyAll')) q('#ncApplyAll').onclick = () => applyDevs([...C.dev.values()].filter(d => d.cur));
    qa('[data-toggle]').forEach(h => h.onclick = ev => { if(ev.target.closest('select,button,input')) return; const ip = h.dataset.toggle; C.open.has(ip) ? C.open.delete(ip) : C.open.add(ip); const d = D(ip); if(C.open.has(ip) && d && !d.cur && d.kind !== 'unknown' && !d.busy) readDev(d).then(paint); paint(); });
    qa('select[data-link]').forEach(s => s.onchange = () => { const d = D(s.dataset.link); d.link = s.value || null; paint(); });
    qa('[data-read]').forEach(b => b.onclick = async () => { const d = D(b.dataset.read); await readDev(d); paint(); });
    qa('[data-fill]').forEach(b => b.onclick = () => { const d = D(b.dataset.fill); fillFromPlan(d); paint(); });
    qa('[data-undo]').forEach(b => b.onclick = () => { const d = D(b.dataset.undo); d.E = new Map(); d.dev = {}; d.trunkEdit = null; d.S = new Map(); paint(); });
    qa('[data-apply]').forEach(b => b.onclick = () => applyDevs([D(b.dataset.apply)]));
    qa('[data-df]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); const k = i.dataset.df, v = i.value.trim(); d.dev[k] = v; if(k === 'ip' && !ipOk(v)) delete d.dev.ip; if(k === 'ip' && d.dev.ip && !d.dev.mask) d.dev.mask = planOf(d)?.s?.dev?.subnet || planOf(d)?.inst?.subnet || '255.255.255.0'; paint(); });
    // brushes
    qa('[data-brush]').forEach(b => b.onclick = () => { const d = D(b.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); const v = b.dataset.brush; if(!v) d.brush = null; else if(v === 'fibre') d.brush = { type:'fibre' }; else { const x = swBrushes(d).find(y => y.vid === Number(v.split(':')[1])); d.brush = { type:'vid', ...x }; } paint(); });
    qa('[data-uni]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); const n = i.value === '' ? null : Math.max(0, Math.min(63999, Math.round(Number(i.value)))); d.brush = { ...(d.brush || {}), universe:n, auto:d.brush?.auto !== false }; paint(); });
    qa('[data-auto]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); d.brush = { ...(d.brush || {}), auto:i.checked }; });
    qa('[data-bdir]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); d.brush = { ...(d.brush || {}), dir:i.value || undefined, auto:d.brush?.auto !== false }; paint(); });
    qa('[data-bklass]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); d.brush = { ...(d.brush || {}), klass:i.value || undefined, auto:d.brush?.auto !== false }; paint(); });
    qa('[data-trunkun]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); d.trunkEdit = { tid:Number(i.dataset.trunkun), vid:Number(i.value) || 0 }; paint(); });
    qa('[data-rainbow]').forEach(b => b.onclick = () => rainbowShow(D(b.dataset.rainbow)));
    qa('[data-rainbowf]').forEach(b => b.onclick = () => rainbowFlow(D(b.dataset.rainbowf)));
    qa('[data-rainbowc]').forEach(b => b.onclick = () => rainbowColours(D(b.dataset.rainbowc), false));
    qa('[data-rainbowu]').forEach(b => b.onclick = () => rainbowColours(D(b.dataset.rainbowu), true));
    qa('[data-lstate]').forEach(b => b.onclick = async () => { const [ip, st] = b.dataset.lstate.split('|'), d = D(ip); try { await load(); await logged(d)('PUT', '/api/interface/set_state', { state:st }); } catch(x) { d.err = String(x.message || x); } paint(); });
    qa('[data-lxmode]').forEach(b => b.onclick = () => luminexMode(D(b.dataset.lxmode)));
    qa('[data-copylog]').forEach(b => b.onclick = () => { const d = D(b.dataset.copylog); navigator.clipboard?.writeText((d.log || []).map(l => `${l.ok ? 'OK ' : 'ERR'} ${l.line}${l.ok ? '' : '  -> ' + l.err}`).join('\n')); App.ui.toast(t('Copied', 'Gekopieerd'), 'ok'); });
    bindSettings(qa);
    // e-ink display
    const ekDev = el => D(el.closest('[data-eip]').dataset.eip);
    qa('[data-ekopen]').forEach(h => h.onclick = () => { const d = D(h.dataset.ekopen); if(C.einkOpen.has(d.ip)) C.einkOpen.delete(d.ip); else { C.einkOpen.add(d.ip); if(!EK(d).w) einkLoad(d); } paint(); einkPreviewUpdate(d); });
    qa('[data-ekkind]').forEach(b => b.onclick = () => { const d = ekDev(b); EK(d).kind = b.dataset.ekkind; paint(); einkPreviewUpdate(d); });
    qa('[data-ek]').forEach(i => { const fn = () => { const d = ekDev(i), e = EK(d), f = i.dataset.ek; e[f] = i.type === 'checkbox' ? i.checked : (f === 'size' ? Number(i.value) : i.value); e.prev = null; einkPreviewUpdate(d); if(i.type === 'checkbox' || i.tagName === 'SELECT') paint(), einkPreviewUpdate(d); }; i.oninput = fn; i.onchange = fn; });
    qa('[data-ekfile]').forEach(i => i.onchange = () => { const d = ekDev(i), e = EK(d), f = i.files?.[0]; if(!f) return; const img = new Image(); img.onload = () => { e.img = img; e.imgName = f.name; e.prev = null; paint(); einkPreviewUpdate(d); }; img.onerror = () => { e.err = t('That file is not a picture the browser can read.', 'Dat bestand is geen afbeelding die de browser kan lezen.'); paint(); }; img.src = URL.createObjectURL(f); });
    qa('[data-ekact]').forEach(b => b.onclick = () => einkAct(ekDev(b), b.dataset.ekact));
    qa('[data-ekdev]').forEach(i => i.onchange = async () => { const d = ekDev(i); try { await load(); await transport(d.ip)('PUT', `/api/eink/${i.dataset.ekdev}`, i.checked); d.cur.eink = await transport(d.ip)('GET', '/api/eink'); } catch(x) { EK(d).err = String(x.message || x); } paint(); einkPreviewUpdate(d); });
    if(root) for(const ip of C.einkOpen){ const d = D(ip); if(d) einkPreviewUpdate(d); }
    // ports: click = paint with the brush (or select), drag = paint a row of ports
    qa('.nc-grid').forEach(g => {
      const dev = () => D(g.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle), noOf = el => Number(el.closest('.nc-port')?.dataset.port);
      g.onmousedown = ev => { const el = ev.target.closest('.nc-port'); if(!el) return; ev.preventDefault(); const d = dev(), p = noOf(el); if(d.brush && applyBrush(d, p)){ C.drag = d; d.sel = p; tileUpdate(d, p); } else { d.sel = p; paint(); } };
      g.onmouseover = ev => { if(C.drag && !(ev.buttons & 1)){ endDrag(); return; } const el = ev.target.closest('.nc-port'); if(!el || !C.drag || C.drag !== dev()) return; const d = C.drag, p = noOf(el); if(applyBrush(d, p)) tileUpdate(d, p); };
    });
    // detail panel
    qa('.nc-det [data-f]').forEach(i => i.onchange = () => {
      const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle), p = d.sel, f = i.dataset.f, e = d.E.get(p) || {};
      if(f === 'legend' || f === 'name') e[f] = i.value; else if(f === 'dir' || f === 'klass') e[f] = i.value; else if(f === 'poe') e.poe = i.checked; else if(f === 'speed') e.speed = i.value;
      else if(f === 'universe'){ if(i.value === '') delete e.universe; else e.universe = Math.max(0, Math.min(63999, Math.round(Number(i.value)))); }
      else if(f === 'member'){ if(!i.value) delete e.member; else if(i.value === 'fibre') e.member = fibreMember(d); else { const x = swBrushes(d).find(y => y.vid === Number(i.value.split(':')[1])); e.member = { type:'vid', vid:x.vid, name:x.name, color:x.color }; } }
      if(Object.keys(e).length) d.E.set(p, e); else d.E.delete(p);
      paint();
    });
  }
  const endDrag = () => { if(C.drag){ C.drag = null; paint(); } };
  document.addEventListener('mouseup', endDrag, true); document.addEventListener('pointerup', endDrag, true); window.addEventListener('blur', endDrag);

  async function render(){
    root = App.$('#lkDetail'); if(!root) return;
    await load().catch(() => {});
    paint();
  }
  window.NetConfig = { moveWarnings, addAddresses, fixMoved, render, state:C, discover, readDev, opsOf, fillFromPlan, applyBrush, planItems, wantSwitch, wantNode, transport, dev:D, applyDevs, autoLink, real, changeCount };
})();
