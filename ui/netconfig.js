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
  const C = { user:'admin', pass:'', https:false, ranges:'', withIp:false, slot:'', offset:0, einkOpen:new Set(), eink:new Map(), found:null, busy:false, err:'', info:'', dev:new Map(), open:new Set(), simDevs:null, drag:null, watching:false, watchState:null, nets:null };
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
  const DEF_MASK = '255.255.0.0';          // the FENT mask: a device or an address without its own mask gets /16, not /24
  const reaches = (ip, nets) => !nets || nets.some(n => sameNet(ip, n.address, n.netmask || '255.255.255.0'));
  async function localNets(){ if(real()) return window.app.luminexLocalNets ? await window.app.luminexLocalNets() : null; return C.simNets || null; }
  const hostIn = ip => { const p = ip.split('.'); p[3] = p[3] === '250' ? '251' : '250'; return p.join('.'); };
  // the devices of this list whose pending IP change puts them where this computer has no address
  async function moveWarnings(devs){
    const nets = await localNets(), out = [];
    for(const d of devs){ const to = d.dev?.ip; if(!to || to === d.ip) continue; out.push({ d, from:d.ip, to, mask:d.dev.mask || DEF_MASK, reachable:reaches(to, nets) }); }
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

  // ---------- where to look and how: Settings > Network (one place; here only a line that says it) ----------
  const netPrefs = () => window.Settings?.get?.().network || { auto:false, adapters:{}, range:'' };
  const autoOn = () => netPrefs().auto === true;
  let offWatch = null, guard = null, settingsHooked = false;
  async function refreshNets(){ try { C.nets = real() && window.app.netAdapters ? (await window.app.netAdapters()).filter(a => a.on) : null; } catch { C.nets = null; } }
  function searchLine(){
    const nets = C.nets, p = netPrefs();
    const where = !real() ? t('simulated devices', 'gesimuleerde apparaten')
      : p.range ? `<span class="mono">${esc(p.range)}</span>`
      : nets === null ? '…'
      : nets.length ? nets.map(a => `<b>${esc(a.label)}</b> <span class="mono">${esc(a.addresses.map(x => x.address).join(', '))}</span>`).join(' · ')
      : `<span class="nc-bad">${t('no network adapter ticked', 'geen netwerkadapter aangevinkt')}</span>`;
    return `<div class="nc-via">${I('network', 14)}<span>${t('Searching via', 'Zoekt via')} ${where} · ${autoOn() ? t('automatic', 'automatisch') : t('scan', 'scannen')}</span><button class="sm" data-opennet>${t('Change in Settings', 'Wijzigen in Instellingen')}</button></div>`;
  }
  // Automatic: while this page (or the Align tool) is open, the main process keeps looking and tells what it sees (core/netwatch.js)
  const visible = () => App.getMODEL?.()?.ui?.view === 'NETCONFIG' || !!document.getElementById('alRoot');
  const seedOf = () => [...C.dev.values()].map(d => ({ ip:d.ip, kind:d.kind, name:d.name, longName:d.longName, model:d.model, version:d.version, auth:d.auth, via:d.via || [], reach:!d.far }));
  const devsChanged = () => { try { window.dispatchEvent(new Event('nc-devices')); } catch {} };
  function liveHtml(){
    const s = C.watchState; if(!C.watching) return '';
    const ad = (s?.adapters || []).map(a => esc(a.label || a.name)).join(', ') || t('no adapter ticked', 'geen adapter aangevinkt');
    const sw = s?.sweep?.total && s.sweep.done < s.sweep.total ? ` · ${t('looking through the range', 'zoekt door het bereik')} ${Math.round(100 * s.sweep.done / s.sweep.total)}%` : '';
    return `<i class="nc-pulse"></i>${t('Automatic: listening on', 'Automatisch: luistert op')} ${ad}${sw}`;
  }
  const liveUpdate = () => { const el = root?.querySelector?.('#ncLive'); if(el) el.innerHTML = liveHtml(); };
  function startWatch(){
    if(C.watching || !autoOn()) return;
    C.watching = true; C.watchState = null; if(!C.found) C.found = [...C.dev.keys()];
    if(real() && window.app.netWatchStart && window.app.onNetWatch){
      offWatch = window.app.onNetWatch((kind, data) => { if(kind === 'seen') addSeen(data); else if(kind === 'gone') markGone(data.ip); else if(kind === 'state'){ C.watchState = data; liveUpdate(); } });
      window.app.netWatchStart({ user:C.user, pass:C.pass, https:C.https, seed:seedOf() }).catch(x => { stopWatch(); C.err = String(x.message || x); paint(); });
    } else if(!C.dev.size) discover();                 // outside the desktop app the simulated devices appear at once
    if(!guard) guard = setInterval(() => { if(C.watching && !visible()) stopWatch(); }, 2500);
    paint();
  }
  function stopWatch(){
    if(!C.watching) return; C.watching = false; C.watchState = null;
    try { offWatch?.(); } catch {} offWatch = null;
    try { window.app?.netWatchStop?.(); } catch {}
    if(guard){ clearInterval(guard); guard = null; }
  }
  const restartWatch = () => { if(C.watching){ stopWatch(); startWatch(); } };
  const ensureWatch = () => { if(autoOn()) startWatch(); else stopWatch(); };
  // a device was seen by the watcher: new, back again after it was gone, or something new about it
  function addSeen(f){
    const was = C.dev.get(f.ip), wasGone = !!was?.gone;
    addFound(f);
    const d = C.dev.get(f.ip);
    if(d && wasGone && !f.gone && d.cur && !d.busy) readDev(d, true).then(paint);          // it was away: read what it says now (what you changed here stays)
  }
  function markGone(ip){ const d = C.dev.get(ip); if(d){ d.gone = true; paint(); devsChanged(); } }
  // a device in another IP range: give this computer an address in that range (the system asks permission), then read it
  async function fixFar(d){
    if(!d?.far) return;
    const r = await addAddresses([{ to:d.ip, mask:d.far.mask || DEF_MASK }]);
    if(!r.ok){ App.ui.toast(`${t('Could not add the address', 'Kon het adres niet toevoegen')}: ${r.error}`, 'err', { ms:8000 }); return; }
    if(real()) await sleep(1500);
    await readDev(d);
    if(d.cur){ d.far = null; d.err = ''; App.ui.toast(t('Reached it.', 'Bereikt.'), 'ok'); }
    paint(); devsChanged();
  }

  // ---------- the plan ----------
  const swList = () => App.sortedDims().flatMap(dc => (window.NetSwitches?.list(dc) || []).map(s => ({ id:`sw:${dc}|${s.label}`, kind:'sw', dc, s, label:s.label, ip:s.dev?.ip })));
  const ndList = () => App.sortedDims().flatMap(dc => (App.net.getDimPlan(dc).nodes || []).map((inst, i) => ({ id:`nd:${dc}#${i}`, kind:'nd', dc, inst, i, label:inst.id || `Node ${i + 1}`, ip:inst.ip })));
  const planItems = () => [...swList(), ...ndList()];
  const planOf = d => planItems().find(x => x.id === d.link) || null;
  // a node and a place in the plan fit when the type of the place has as many DMX ports as the node has (a LumiNode 4 does not go on the place of a LumiNode 12);
  // a node that has not been read yet, or a type without a port count, is not judged. A switch fits any switch of the plan.
  const planPorts = it => Number((App.getMODEL().networkDevices.nodeTypes || []).find(x => x.id === it?.inst?.typeId)?.portCount) || null;
  const canLink = (d, it) => !it || (it.kind === 'sw') === isSw(d) && (isSw(d) || !d.cur || !planPorts(it) || d.cur.ports.length === planPorts(it));
  const misfit = d => { const it = planOf(d); return it && !canLink(d, it) ? t(`This LumiNode has ${d.cur.ports.length} DMX ports, but ${it.label} of the plan has ${planPorts(it)}: nothing is sent to it. Link it to a place with ${d.cur.ports.length} ports.`, `Deze LumiNode heeft ${d.cur.ports.length} DMX-poorten, maar ${it.label} uit het plan heeft er ${planPorts(it)}: er wordt niets naar gestuurd. Koppel hem aan een plek met ${d.cur.ports.length} poorten.`) : ''; };
  // the VLAN of the management address of a switch, in the numbering of the project (Luminex: management = 1, FENT: 1090)
  const mgmtVid = s => { try { if(!s?.dev?.ip) return null; const v = FENT().classify(s.dev.ip)?.vlan, role = v && ({ 90:'management', 40:'lighting' })[v.second]; return role ? FENT().roleVlan(role, App.getMODEL().networkDevices?.prefs?.fent?.vlanMode || 'luminex') : (v?.id ?? null); } catch { return null; } };
  // the management VLAN every RJ45 port starts on: the one of the switch's own address, else the management VLAN of the numbering of the project
  // every VLAN of the VLAN overview with its name and colour: sent to the groups a device has already (the standard 20), so all devices have the same names
  const allNames = () => { try { const mode = App.getMODEL().networkDevices?.prefs?.fent?.vlanMode || 'luminex'; return FENT().vlanList(mode).filter(v => !v.extension).map(v => ({ vid:v.id, name:v.name, color:v.color })); } catch { return []; } };
  // the group of an advanced node that carries the lighting (the VLAN with the role "lighting", 200): the network inputs and outputs of its engines belong to it. null while the node does not have that group yet.
  const lightGroupOf = d => {
    try {
      const it = planOf(d), nc = d.cur?.netcfg; if(!it || it.kind !== 'nd' || !it.inst.advanced || !nc || nc.is_basic_config) return null;
      const g = api.lumiLightGroup(wantNode(it).net); if(!g) return null;
      const k = Object.entries(nc.groups || {}).find(([, x]) => Number(x.vid) === g.vid)?.[0];
      return k == null ? null : Number(k);
    } catch { return null; }
  };
  const defMgmt = s => { try { return mgmtVid(s) ?? FENT().roleVlan('management', App.getMODEL().networkDevices?.prefs?.fent?.vlanMode || 'luminex'); } catch { return null; } };
  const vlansOf = (dc, label) => { const set = new Set(); for(const r of (window.FentUI?.portPlan(dc).rows || [])) if(r.sw === label) (r.vlans || []).forEach(v => set.add(Number(v))); const m = defMgmt(swList().find(x => x.dc === dc && x.label === label)?.s); if(m != null) set.add(m); return set; };
  function wantSwitch(it){
    const dc = it.dc, s = it.s, rows = (window.FentUI?.portPlan(dc).rows || []).filter(r => r.sw === s.label && r.swPort), vset = vlansOf(dc, s.label), ports = [], fibre = [];
    const autoTrunk = [];
    for(const r of rows){ const v = (r.vlans || []).map(Number)[0]; ports.push({ port:r.swPort, vid:Number.isFinite(v) ? v : null, legend:window.PortPlan?.autoSwitchName ? window.PortPlan.autoSwitchName(r) : String(r.device ?? '') }); if(r.mode === 'trunk' && !r.cable) autoTrunk.push(r.swPort); }
    // what was set by hand in the Network page (VLAN, trunk, name per port) goes on top of the automatic plan
    const ov = window.PortPlan?.forSwitch(dc, s.label) || {}, trunkPorts = [], vidPorts = new Set();
    for(const [pn, o] of Object.entries(ov)){
      const n = Number(pn); let e = ports.find(x => x.port === n); if(!e){ e = { port:n, vid:null, legend:'' }; ports.push(e); }
      if(o.name) e.legend = o.name;
      if(o.trunk){ e.vid = null; trunkPorts.push(n); } else if(o.vid != null){ e.vid = Number(o.vid); vset.add(Number(o.vid)); vidPorts.add(n); }
      if(o.poe) e.poe = o.poe; if(o.speed) e.speed = o.speed;
    }
    // a cable that carries two VLANs (a node with a management and a lighting address, a LumiNode in its advanced network) needs a trunk port on the switch
    for(const n of autoTrunk){ const e = ports.find(x => x.port === n); if(e) e.vid = null; if(!trunkPorts.includes(n)) trunkPorts.push(n); }
    // every RJ45 port that has no VLAN of its own starts on the management VLAN (the ports of a switch link are left alone)
    const mg = defMgmt(s), linked = new Set((window.NetSwitches?.linksOf(dc) || []).filter(l => l.sw === s.label).map(l => l.port));
    if(mg != null){
      vset.add(mg);
      for(const e of ports) if(e.vid == null && !trunkPorts.includes(e.port)) e.vid = mg;
      for(let n = 1; n <= s.rj; n++) if(!linked.has(n) && !ports.some(x => x.port === n)) ports.push({ port:n, vid:mg, legend:'', def:true });
    }
    ports.sort((a, b) => a.port - b.port);
    for(const l of (window.Fibers?.links(dc) || [])) for(const [me, other] of [[l.a, l.b], [l.b, l.a]]){
      if(!me || me.free || me.dc !== dc || me.sw !== s.label) continue;
      fibre.push(window.SwPorts?.no(s.type, Number(me.sfp)) ?? (s.rj + Number(me.sfp)));
      if(other && !other.free && other.sw) vlansOf(other.dc, other.sw).forEach(v => vset.add(v));
    }
    // a copper link between two switches: both ends are trunk ports, carrying the VLANs of the switch at the other end (a fibre link does the same)
    for(const l of (window.NetSwitches?.linksOf(dc) || [])){
      if(l.sw !== s.label) continue;
      if(!fibre.includes(l.port)) fibre.push(l.port);
      if(l.to && l.to.sw) vlansOf(l.to.dc, l.to.sw).forEach(v => vset.add(v));
    }
    // every SFP port is a trunk
    for(let i = 1; i <= s.sfp; i++){ const no = window.SwPorts?.no(s.type, i) ?? (s.rj + i); if(!fibre.includes(no)) fibre.push(no); }
    for(let k = fibre.length - 1; k >= 0; k--) if(vidPorts.has(fibre[k])) fibre.splice(k, 1);
    for(const n of trunkPorts) if(!fibre.includes(n)) fibre.push(n);
    const groups = [...vset].sort((a, b) => a - b).map(id => FENT().vlanById(id)).filter(Boolean).map(v => ({ vid:v.id, name:v.name, color:v.color }));
    return { name:s.dev?.id || s.label, ip:s.dev?.ip ? { address:s.dev.ip, mask:s.dev.subnet || DEF_MASK, gateway:s.dev.gateway || '' } : null, ports, fibre, groups, names:allNames(), mgmt:mgmtVid(s) };
  }
  // what every network port (ETH) of a node carries: what its cable carries in the port plan (the switch port it is plugged in: trunk = all its VLANs, access = its VLAN);
  // an ETH that is not on a switch port yet keeps the choice of the Advanced screen, else the VLANs of its addresses
  function portVids(it, inst, eth, ifs){
    let rows = []; try { rows = window.FentUI?.portPlan?.(it.dc)?.rows || []; } catch { rows = []; }
    const key = inst.id || inst.name, out = {};
    for(let k = 1; k <= eth; k++){
      const r = rows.find(x => x.kind !== 'console' && x.device === key && Number(x.eth) === k && x.sw), v = r ? (r.vlans || []).map(Number).filter(Number.isFinite) : [];
      out[k] = v.length ? v : inst.advPorts ? (inst.advPorts[k] || []) : [...new Set(ifs.filter(x => (Number(x.eth) || 1) === k && x.vlan != null && x.ip).map(x => Number(x.vlan)))];
      // painted Trunk ISL: the node's own trunk carries every group of the node, but the node only gets the groups it has an address in (not all 20 Luminex groups)
      if(inst.advanced && window.AdvNet?.isIsl(inst, k)){ out[k] = [...new Set(ifs.filter(x => x.vlan != null && x.ip).map(x => Number(x.vlan)))]; (out.isl ||= {})[k] = true; }
    }
    return out;
  }
  function wantNode(it){
    const inst = it.inst, u = Array.isArray(inst.universes) ? inst.universes : [];
    const nt = (App.getMODEL().networkDevices.nodeTypes || []).find(x => x.id === inst.typeId), eth = Math.min(2, Math.max(1, Number(nt?.ethernetCount) || 1));
    const PP = window.PortPlan, pp = PP ? PP.ndPorts(it.dc, inst, it.i) : [];
    // the lighting data of the groups: input + output, unless a group was given its own choice
    const pipe = 'input+output';
    // exactly ONE group takes part in the lighting data (a node cannot split input and output): the one chosen, else the lighting group; a node with only a management address keeps it all there
    const ifs0 = FENT().ifaces(inst, eth), isOn = x => ['input', 'output', 'input+output'].includes(String(x.listen)), hasChoice = ifs0.some(x => x.listen !== undefined && x.listen !== null);
    const lightIdx = hasChoice ? ifs0.findIndex(isOn) : (i => (i >= 0 ? i : ifs0.findIndex(x => x.role !== 'management')))(ifs0.findIndex(x => x.role === 'lighting'));
    const ifs = lightIdx < 0 && !hasChoice ? ifs0 : ifs0.map((x, i) => ({ ...x, listen:i === lightIdx ? pipe : '' }));
    return { shortName:inst.id, longName:inst.name, advanced:!!inst.advanced, net:inst.advanced ? { ...api.lumiNetWant(ifs, eth, id => FENT().vlanById(id), portVids(it, inst, eth, ifs)), names:allNames() } : null, ip:inst.ip ? { address:inst.ip, mask:inst.subnet || DEF_MASK, gateway:inst.gateway || '' } : null,
      ports:u.map((x, j) => { if(x == null || x === '') return null; const p = pp[j] || {}; return { universe:Number(x), name:p.name || `${inst.id || 'N'}.${j + 1}`, klass:p.klass || undefined, dir:p.dir || undefined }; }) };
  }
  const projectVlans = () => { const set = new Set(); for(const it of swList()) vlansOf(it.dc, it.s.label).forEach(v => set.add(v)); return [...set].sort((a, b) => a - b).map(id => FENT().vlanById(id)).filter(Boolean); };

  // ---------- one device ----------
  const D = ip => C.dev.get(ip);
  function mk(f){ return { ip:f.ip, kind:f.kind, name:f.name || '', longName:f.longName || '', model:f.model || '', version:f.version || '', auth:!!f.auth, link:null, cur:null, E:new Map(), NE:new Map(), dev:{}, brush:null, sel:null, tree:null, treeBusy:false, S:new Map(), setOpen:false, setSec:null, setQ:'', busy:false, err:'', note:'', verified:false, step:1, via:f.via || [], from:'', far:null, gone:false }; }
  // how it was found, for the small line under the name
  const viaName = v => ({ sweep:t('IP scan', 'IP-scan'), mdns:'mDNS', lldp:'LLDP', artnet:'Art-Net' }[v] || v);
  const viaText = d => [(d.via || []).map(viaName).join(' + '), d.from ? `${t('port', 'poort')} ${d.fromPort ?? '?'} ${t('of', 'van')} ${d.from}` : ''].filter(Boolean).join(' · ');
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
  // only a switch has a brush (a VLAN); a node port is set in its own panel
  function applyBrush(d, port){
    const b = d.brush; if(!b || !isSw(d)) return false;
    const e = d.E.get(port) || {};
    e.member = b.type === 'fibre' ? fibreMember(d) : { type:'vid', vid:b.vid, name:b.name, color:b.color };
    d.E.set(port, e); return true;
  }
  // ETH1 / ETH2 of a node: what they carry now (the node's own trunk ISL, another trunk, one VLAN) with the pending edit on top
  const ethNames = d => Object.entries(d.cur?.netcfg?.ports || {}).filter(([, p]) => (p.type || 'rj45') === 'rj45').map(([n]) => n);
  function ethView(d, eth){
    const nc = d.cur.netcfg, port = nc.ports[ethNames(d)[eth - 1]] || {}, e = d.NE.get(eth), isl = api.lumiIsl(nc);
    const look = vid => { const g = Object.values(nc.groups).find(x => x.vid === vid) || FENT().luminexGroups().find(x => x.id === vid); return { name:g?.name || '', color:g?.color || '#38bdf8' }; };
    const now = (() => {                       // what the node has now
      if(port.trunk != null) return { kind:isl != null && Number(port.trunk) === isl ? 'isl' : 'trunk', label:nc.trunks?.[port.trunk]?.name || 'Trunk' };
      const g = port.group != null ? nc.groups[port.group] : null;
      return g ? { kind:'vid', vid:g.vid, color:g.color || '#64748b', label:g.name || '' } : { kind:'none' };
    })();
    // …and what is waiting to be sent: a brush edit, else what "Fill from the plan" put in the network of the node
    const pp = d.dev.net?.ports?.[eth - 1], pv = (pp?.vids || []).map(Number);
    let want = null;
    if(e?.isl) want = { kind:'isl' };
    else if(e?.vid != null) want = { kind:'vid', vid:e.vid, color:e.color || look(e.vid).color, label:e.name || look(e.vid).name };
    else if(pp?.isl || pv.length > 1) want = { kind:isl != null ? 'isl' : 'trunk', label:'Trunk' };
    else if(pv.length === 1) want = { kind:'vid', vid:pv[0], ...look(pv[0]), label:look(pv[0]).name };
    const v = want || now;
    const color = v.kind === 'isl' || v.kind === 'trunk' ? '#38bdf8' : v.kind === 'vid' ? (v.color || '#64748b') : '#64748b';
    const differs = !!want && (want.kind !== now.kind || want.vid !== now.vid);
    const unsent = !!want && nc.is_basic_config && want.kind === 'vid' && !!e;
    return { kind:v.kind, vid:v.vid ?? null, color, label:v.kind === 'isl' ? 'ISL' : (v.label || ''), changed:differs && !unsent, unsent };
  }
  // what the person set on the network ports, as the node plan takes it: a node that is still basic only takes the trunk (a VLAN there changes nothing in it)
  function portEditsOf(d){
    const nc = d.cur?.netcfg; if(!nc || !d.NE?.size) return null;
    const o = {}; for(const [eth, e] of d.NE) if(e.isl || (e.vid != null && !nc.is_basic_config)) o[eth] = e;
    return Object.keys(o).length ? o : null;
  }
  // a node brush: its own trunk (ISL) or a VLAN, set on ETH1 / ETH2
  function applyEth(d, eth){
    const b = d.brush; if(!b || isSw(d) || !d.cur?.netcfg) return false;
    d.NE.set(eth, b.type === 'isl' ? { isl:true } : { vid:b.vid, name:b.name, color:b.color }); return true;
  }
  const ethBrushes = d => {
    const have = new Map(Object.values(d.cur.netcfg.groups).filter(g => g.vid != null).map(g => [g.vid, { vid:g.vid, name:g.name, color:g.color }]));
    for(const g of FENT().luminexGroups()) if(!have.has(g.id)) have.set(g.id, { vid:g.id, name:g.name, color:g.color, isNew:true });
    return [...have.values()].sort((a, b) => a.vid - b.vid);
  };
  // ---------- calls ----------
  // "send again": the plan is filled in on a copy, and the device is shown as if it had none of it yet, so every call of the plan goes out, not only the differences
  // (the DMX ports and their engines of a LumiNode are not part of it: they are only sent where they differ)
  function resendView(d){
    const it = planOf(d); if(!it || !d.cur || misfit(d)) return null;
    const t = { ...d, E:new Map([...d.E].map(([k, v]) => [k, clone(v)])), NE:new Map(d.NE), dev:{ ...d.dev }, S:new Map(d.S), trunkEdit:d.trunkEdit, err:'', warn:'' };
    if(!fillFromPlan(t)) return null;
    const cur = clone(d.cur);
    if(isSw(d)){
      t.dev.name ??= d.cur.device?.name;
      if(cur.device) cur.device.name = '';
      for(const g of cur.groups) if(g.vid !== 1){ g.name = ''; g.color = ''; }
      for(const [no, e] of t.E){
        const p = cur.ports.find(x => x.port_number === no); if(!p) continue;
        if(e.legend != null) p.legend = ''; if(e.member) p.member_of = {};
        if(e.poe != null){ const po = cur.poe.find(x => x.port_number === no); if(po) po.enabled = !e.poe; }
        if(e.speed != null) p.link_speed = { mode:'fixed', speed:['?'] };
      }
    } else {
      t.dev.shortName ??= d.cur.info?.short_name; t.dev.longName ??= d.cur.info?.long_name;
      cur.info = { ...cur.info, short_name:'', long_name:'' };
    }
    t.cur = cur; t.resend = true; return t;
  }
  function opsOf(d, resend = false){
    if(resend){ const rv = resendView(d); if(!rv) return { ops:[], notes:[] }; const r = opsOf(rv); return { ...r, ops:r.ops.map(o => ({ ...o, text:`${t('Send again', 'Opnieuw sturen')} · ${o.text}` })) }; }
    if(!d.cur) return { ops:[], notes:[] };
    { const m = misfit(d); if(m) return { ops:[], notes:[m] }; }
    const ops = [], notes = [];
    if(isSw(d)){
      const edits = [...d.E.entries()].map(([port, v]) => ({ port, ...clone(v) }));
      const p = api.gigacorePortPlan(d.cur, edits); ops.push(...p.ops); notes.push(...p.notes);
      const dp = api.gigacoreDevicePlan(d.cur, { name:d.dev.name ?? d.cur.device?.name, ip:d.dev.ip ? { address:d.dev.ip, mask:d.dev.mask || DEF_MASK, gateway:d.dev.gateway || '' } : null }, { withIp:!!d.dev.ip });
      ops.push(...dp.ops); notes.push(...dp.notes);
      ops.push(...api.gigacoreNamesPlan(d.cur, allNames()).ops);          // the names and colours of the VLAN overview go with every send
      if(d.trunkEdit){ const tp = api.gigacoreTrunkPlan(d.cur, d.trunkEdit.tid, d.trunkEdit.vid); ops.push(...tp.ops); notes.push(...tp.notes); }
    } else {
      const n = d.cur.ports.length, per = Array(n).fill(null);
      for(const [i, e] of d.E) if(i < n) per[i] = clone(e);
      const adv = (d.dev.net || portEditsOf(d)) && d.cur.netcfg;       // an advanced network configuration is on its way: the addresses go with it, not through /api/ipsettings
      // the network calls are made first: the group of the lighting VLAN may only be made by them, and the network IOs of the engines are put on it afterwards (p.late)
      const pe = portEditsOf(d), np = d.dev.net || pe ? api.lumiNetPlan(d.cur, d.dev.net || null, { currentIp:d.ip, keepAddresses:!!d.dev.netKeep, portEdits:pe, force:!!d.resend }) : null;
      const have = lightGroupOf(d);
      const p = api.lumiPlan(d.cur, { shortName:d.dev.shortName ?? d.cur.info?.short_name, longName:d.dev.longName ?? d.cur.info?.long_name, ip:d.dev.ip ? { address:d.dev.ip, mask:d.dev.mask || DEF_MASK, gateway:d.dev.gateway || '' } : null, ports:per }, { withIp:!!d.dev.ip && !adv, artnetOffset:C.offset, lightGroup:have, lightGroupLate:have == null && np ? np.lightGroup : null });
      ops.push(...p.ops); notes.push(...p.notes);
      if(np){
        // a node that is going to answer on another address moves like any other node: its network calls go with the address calls, to all devices at the same moment
        const mv = np.moveTo && d.dev.ip; ops.push(...(mv ? np.ops.map(o => ({ ...o, kind:'ip' })) : np.ops)); notes.push(...np.notes);
        ops.push(...(mv ? p.late.map(o => ({ ...o, kind:'ip' })) : p.late));
      } else ops.push(...p.late);
    }
    if(d.S.size && d.tree){ const so = SET.settingsOps(isSw(d) ? 'gigacore' : 'lumi', d.tree, [...d.S.values()]); ops.push(...so.ops); notes.push(...so.notes); }
    return { ops, notes };
  }
  const changeCount = d => opsOf(d).ops.length;
  // an advanced node that was sent is only "checked" when planning it again against what it reports now gives nothing more to send
  function netPending(d){
    if(isSw(d) || !d.cur?.netcfg) return false;
    const it = planOf(d); if(!it || it.kind !== 'nd' || !it.inst.advanced) return false;
    const w = wantNode(it); if(!w.net?.groups.length) return false;
    return api.lumiNetPlan(d.cur, w.net, { currentIp:d.ip, keepAddresses:false }).ops.length > 0;
  }
  // What the plan would send to a linked device that is not pending yet: the same calls as "Fill from the plan", worked out on a copy, so nothing the person
  // filled in by hand is touched. What a device refused when it was last sent (a built-in group name, for example) does not count: it would never go away.
  function planDiff(d){
    if(!d.cur || !d.link || d.busy || d.kind === 'unknown') return 0;
    const it = planOf(d); if(!it || misfit(d)) return 0;
    try {
      const t = { ...d, E:new Map(), NE:new Map(), dev:{}, S:new Map(), trunkEdit:null, err:'', warn:'' };
      if(!fillFromPlan(t)) return 0;
      return opsOf(t).ops.filter(o => !(d.refused && d.refused.has(o.text))).length;
    } catch { return 0; }
  }
  // fill what the plan wants into the pending changes (nothing is sent)
  function fillFromPlan(d){
    const it = planOf(d); if(!it || !d.cur) return false;
    { const m = misfit(d); if(m){ d.err = m; return false; } }
    if(isSw(d) && it.kind === 'sw'){
      const w = wantSwitch(it);
      const rowsNow = api.portRows(d.cur);
      for(const p of w.ports){ if(!d.cur.ports.some(x => x.port_number === p.port)) continue; const e = d.E.get(p.port) || {}; if(C.withNames !== false && !p.def) e.legend = String(p.legend).slice(0, 16); const rw = rowsNow.find(x => x.port === p.port); if(p.poe && rw?.poe != null) e.poe = p.poe === 'on'; if(p.speed && api.SPEEDS.includes(p.speed)) e.speed = p.speed; const g = w.groups.find(x => x.vid === p.vid); if(g) e.member = { type:'vid', vid:g.vid, name:g.name, color:g.color }; d.E.set(p.port, e); }
      if(w.fibre.length){ const fm = { type:'fibre', vids:w.groups.map(g => g.vid), mgmtVid:w.mgmt, groups:w.groups }; for(const no of w.fibre) if(d.cur.ports.some(x => x.port_number === no)){ const e = d.E.get(no) || {}; e.member = clone(fm); d.E.set(no, e); } }
      if(w.name && w.name !== d.cur.device?.name) d.dev.name = w.name;
      if(C.withIp && w.ip?.address && w.ip.address !== d.cur.ip?.ip_address) Object.assign(d.dev, { ip:w.ip.address, mask:w.ip.mask, gateway:w.ip.gateway });
      return true;
    }
    if(!isSw(d) && it.kind === 'nd'){
      const w = wantNode(it);
      w.ports.forEach((q, j) => { if(!q || j >= d.cur.ports.length) return; const e = d.E.get(j) || {}; e.universe = q.universe; if(C.withNames !== false) e.name = q.name; if(q.klass) e.klass = q.klass; if(q.dir) e.dir = q.dir; d.E.set(j, e); });
      if(w.shortName && w.shortName !== d.cur.info?.short_name) d.dev.shortName = String(w.shortName).slice(0, 17);
      if(w.longName && w.longName !== d.cur.info?.long_name) d.dev.longName = String(w.longName).slice(0, 63);
      if(w.advanced && w.net?.groups.length){                          // the node is planned in the advanced network: send the groups and the ports
        d.dev.net = w.net; d.dev.netKeep = false;                        // the addresses of the plan always go with it ("Apply all without IP" leaves them out)
        const np = api.lumiNetPlan(d.cur, w.net, { currentIp:d.ip, keepAddresses:false });
        if(np.moveTo) Object.assign(d.dev, { ip:np.moveTo, mask:np.moveMask });          // …and a node that moves is announced (the "devices get a new IP address" warning)
      }
      else if(C.withIp && w.ip?.address && w.ip.address !== d.cur.ip?.ipaddress) Object.assign(d.dev, { ip:w.ip.address, mask:w.ip.mask, gateway:w.ip.gateway });
      return true;
    }
    return false;
  }

  // ---------- actions ----------
  async function readDev(d, keepEdits){
    d.busy = true; d.err = ''; d.verified = false;
    try { await load(); const h = transport(d.ip); d.cur = isSw(d) ? await api.gigacoreRead(h) : await api.lumiRead(h);
      if(!keepEdits){ d.E = new Map(); d.NE = new Map(); d.dev = {}; d.S = new Map(); d.tree = null; }
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
      const it = items.find(x => x.kind === want && !taken.has(x.id) && canLink(d, x) && x.ip === d.ip) || items.find(x => x.kind === want && !taken.has(x.id) && canLink(d, x) && nm.trim() && String(x.label).length > 1 && new RegExp('(^|[^a-z0-9])' + String(x.label).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(nm));
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
    if(f.via?.length) d.via = [...new Set([...(d.via || []), ...f.via])]; if(f.from){ d.from = f.from; d.fromPort = f.port; }
    d.far = f.reach === false ? (d.far || { mask:DEF_MASK }) : null; d.gone = !!f.gone;          // far: in another IP range, this computer cannot ask it yet
    autoLink(); paint(); devsChanged(); if((isNew || !d.cur) && !d.far) queueRead(d);
  }
  async function discover(){
    // while the page listens by itself the devices stay (they are tracked live); a scan then only adds to them
    C.busy = true; C.err = ''; C.info = ''; const old = C.dev; if(!C.watching) C.dev = new Map(); C.found = [...C.dev.keys()]; paint();
    let off = null;
    try {
      if(real()){
        if(!window.app.luminexScan) throw new Error(t('This version of the app cannot scan.', 'Deze versie van de app kan niet scannen.'));
        off = window.app.onLuminexDevice?.(f => addFound({ ...f, via:['sweep'] }, old));
        const r = await window.app.luminexScan({ ranges:'', user:C.user, pass:C.pass, https:C.https });
        for(const f of (r.devices || [])) if(!C.dev.has(f.ip)) addFound({ ...f, via:['sweep'] }, old);
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
  async function applyDevs(devs, { noIp = false, resend = false } = {}){
    const todo = devs.map(d => ({ d, ...opsOf(d, resend) })).map(x => noIp ? { ...x, ops:x.ops.filter(o => o.kind !== 'ip') } : x).filter(x => x.ops.length);
    if(!todo.length){ if(resend) App.ui.toast(t('Nothing to send again: this device is not linked to the plan.', 'Niets om opnieuw te sturen: dit apparaat is niet gekoppeld aan het plan.'), 'info'); return; }
    const moving = todo.filter(x => x.ops.some(o => o.kind === 'ip'));
    if(moving.length){          // a new address can make a device unreachable: say so first
      const ok = await App.ui.confirmDialog({ title:t('Change IP addresses?', 'IP-adressen veranderen?'), okLabel:t('Send including IP addresses', 'Versturen inclusief IP-adressen'), danger:true,
        message:moving.map(x => `${x.d.name || x.d.model || ''}  ${x.d.ip}${x.d.dev?.ip && x.d.dev.ip !== x.d.ip ? ' → ' + x.d.dev.ip : ''}`).join('\n') + '\n\n' + t('First the settings go to every device, then the new addresses go to all devices at the same moment. If this computer has no address in the new range, the devices can no longer be read back. To send only the settings, use “Apply all without IP”.', 'Eerst gaan de instellingen naar elk apparaat, daarna gaan de nieuwe adressen op hetzelfde moment naar alle apparaten. Heeft deze computer geen adres in het nieuwe bereik, dan kunnen de apparaten niet meer teruggelezen worden. Wil je alleen de instellingen sturen, gebruik dan “Alles toepassen zonder IP”.') });
      if(!ok) return;
    }
    let failed = 0; await load();
    for(const x of todo){ x.cfg = x.ops.filter(o => o.kind !== 'ip'); x.ipOps = x.ops.filter(o => o.kind === 'ip'); x.newIp = x.d.dev?.ip || null; x.mask = x.d.dev?.mask || DEF_MASK; x.d.err = ''; x.d.warn = ''; x.d.moved = null; }
    // 1 · everything but the address, to every device
    for(const x of todo){
      const { d } = x; d.busy = true; paint();
      try { const h = logged(d); if(x.cfg.length){ const done = await api.runOps(h, x.cfg), refused = done.filter(o => o.failed); d.refused = new Set(refused.map(o => o.text)); if(refused.length) d.warn = t(`The device did not accept ${refused.length} setting(s): ${refused.map(o => o.text).join('; ')}. Open “Last calls” for what it said.`, `Het apparaat nam ${refused.length} instelling(en) niet aan: ${refused.map(o => o.text).join('; ')}. Open “Laatste aanroepen” voor wat het zei.`); } if(isSw(d) && Number(C.slot) >= 1 && Number(C.slot) <= 20 && x.cfg.length) await h('PUT', `/api/config/profiles/${Number(C.slot)}/save`); }
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
      try { d.E = new Map(); d.NE = new Map(); d.dev = {}; d.S = new Map(); d.tree = null; d.trunkEdit = null; await readDev(d); if(!d.cur){ d.err = ''; d.moved = { from:x.sent, to:d.ip, mask:x.mask }; } x.after = true; }
      catch(e) { failed++; x.dead = true; d.err = String(e.message || e); }
      d.busy = false; paint();
    });
    // 3 · read every device back and check it (the ones that moved out of reach are skipped)
    for(const x of todo.filter(y => !y.dead && !y.d.moved)){
      const { d } = x; d.busy = true; paint();
      try { if(!x.after){ d.E = new Map(); d.NE = new Map(); d.dev = {}; d.trunkEdit = null; d.S = new Map(); d.tree = null; await readDev(d); } await verifyTrunk(d, x.ops, logged(d)); d.verified = !d.err && changeCount(d) === 0 && !netPending(d); }
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
        ${d.err ? `<p class="su-warn">${esc(d.err)}</p>` : ''}${d.warn ? `<p class="su-warn">${I('alert', 13)} ${esc(d.warn)}</p>` : ''}${d.moved ? `<p class="su-warn">${I('alert', 13)} ${t(`Now at ${d.moved.to} (was ${d.moved.from}). This computer has no address in that range, so it cannot read the device back. Add an address to this computer (the system asks permission), or give your network adapter an address in that range yourself.`, `Nu op ${d.moved.to} (was ${d.moved.from}). Deze computer heeft geen adres in dat bereik en kan het apparaat dus niet terugcontroleren. Voeg een adres toe aan deze computer (het systeem vraagt toestemming), of geef je netwerkadapter zelf een adres in dat bereik.`)} <button class="sm" data-fix="${esc(d.ip)}">${t('Add address to this computer', 'Adres toevoegen aan deze computer')}</button></p>` : ''}<ol>${ops.map(o => `<li>${esc(o.text)}</li>`).join('')}</ol>${ops.some(o => o.kind === 'ip') ? `<p class="subtle">${t('The IP address changed; the device now answers on the new address.', 'Het IP-adres is veranderd; het apparaat antwoordt nu op het nieuwe adres.')}</p>` : ''}`).join('')}</div>`;
    const dlg = App.ui.openDialog({ title:failed ? `${failed} ${t('of', 'van')} ${todo.length} ${t('devices failed', 'apparaten mislukt')}` : `${n} ${t('changes sent to', 'wijzigingen gestuurd naar')} ${todo.length} ${t('devices', 'apparaten')}`, subtitle:real() ? '' : t('Simulated devices — nothing real was changed.', 'Gesimuleerde apparaten — er is niets echts veranderd.'), width:'620px', body, footer:`<button class="primary" data-a="ok">OK</button>` });
    dlg.footer.querySelector('[data-a=ok]').onclick = () => dlg.close();
    dlg.body.querySelectorAll('[data-fix]').forEach(b => b.onclick = async () => { const d = C.dev.get(b.dataset.fix); if(d){ b.disabled = true; await fixMoved(d); if(!d.moved) b.closest('p').innerHTML = I('check', 13) + ' ' + t('Reached again.', 'Weer bereikbaar.'); else b.disabled = false; } });
  }



  // ---------- calls that are logged (so a failing switch can be diagnosed) ----------
  const logged = d => { const h = transport(d.ip); d.log ||= []; return async (m, p, b, o) => { const line = `${m} ${p}${b !== undefined && !o?.bodyBase64 ? ' ' + JSON.stringify(b).slice(0, 160) : ''}`; try { const r = await h(m, p, b, o); d.log.push({ ok:true, line, res:r == null ? '' : String(JSON.stringify(r)).slice(0, 100) }); if(d.log.length > 80) d.log.shift(); return r; } catch(x) { d.log.push({ ok:false, line, err:String(x.message || x) }); throw x; } }; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // ---------- the lights ----------
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
    // does the trunk really carry every VLAN of the plan? Never a trunk of our own: say what the switch does not carry
    const need = [...new Set(tops.flatMap(o => o.needVids || []))];
    const tids = [...new Set(asg.map(o => o.body.id))].concat(asg.length ? [] : [d.cur.trunks.find(x => x.predefined)?.trunk_id].filter(x => x != null));
    for(const tid of tids){
      const lack = api.trunkMissingVlans(d.cur, tid, need);
      if(!lack.length){ d.log.push({ ok:true, line:`verify: trunk ${tid} carries VLAN ${need.join(', ')}`, res:'' }); continue; }
      d.log.push({ ok:false, line:`verify: trunk ${tid}`, err:`does not carry VLAN ${lack.join(', ')}` });
      d.err = t(`The switch's own trunk does not carry VLAN ${lack.join(', ')}. PatchLab does not make a trunk of its own: add the VLAN to the trunk on the switch. Open “Last calls” for what the switch said.`, `De eigen trunk van de switch draagt VLAN ${lack.join(', ')} niet. PatchLab maakt geen eigen trunk: voeg het VLAN toe aan de trunk op de switch. Open “Laatste aanroepen” voor wat de switch zei.`);
    }
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
    <button data-rainbowc="${esc(d.ip)}" ${d.busy ? 'disabled' : ''}>${t('Rainbow colours on the groups', 'Regenboogkleuren op de groepen')}</button>
    <button data-lstate="${esc(d.ip)}|groups">${t('Ports show group colours', 'Poorten tonen groepskleuren')}</button><button data-lstate="${esc(d.ip)}|dark_mode">${t('Lights off', 'Lampjes uit')}</button>
    ${d.rainbowBefore ? `<button data-rainbowu="${esc(d.ip)}">${t('Colours back', 'Kleuren terug')}</button>` : ''}
    <span class="subtle" style="font-size:12px">${t('The port lights follow the colour of their group, so “rainbow colours” gives every group in use its own colour, left to right (ports in the same VLAN share a colour; a single port cannot get a colour of its own without moving it to another group). “Colours back” restores the old colours. A group colour has no effect on traffic.', 'De poortlampjes volgen de kleur van hun groep, dus “regenboogkleuren” geeft elke gebruikte groep een eigen kleur, van links naar rechts (poorten in dezelfde VLAN delen een kleur; een losse poort kan geen eigen kleur krijgen zonder naar een andere groep te verhuizen). “Kleuren terug” zet de oude kleuren terug. Een groepskleur heeft geen invloed op het verkeer.')}</span></div>`;
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
    const dlg = App.ui.openDialog({ title:t('Send settings to other devices', 'Instellingen naar andere apparaten sturen'), subtitle:`${d.name || d.ip}`, width:'760px', body:`<div class="nc-copy">
        <div class="nc-cp-col"><div class="nc-cp-h">${t('What', 'Wat')}</div><div class="nc-cp-opts">
          <label class="nc-chk"><input type="radio" name="cpwhat" value="mine" ${mine ? 'checked' : 'disabled'}><span>${t('My changes in All settings', 'Mijn wijzigingen in Alle instellingen')} (${mine})</span></label>
          <label class="nc-chk"><input type="radio" name="cpwhat" value="secs" ${mine ? '' : 'checked'}><span>${t('Whole sections of this device', 'Hele onderdelen van dit apparaat')}<small>${t('only where the other device differs', 'alleen waar het andere apparaat verschilt')}</small></span></label>
          <div class="nc-cp-secs">${secs.map(x => `<label class="nc-chk"><input type="checkbox" data-cpsec="${esc(x.id)}" ${x.id === d.setSec ? 'checked' : ''}><span>${esc(x.title)}</span></label>`).join('')}</div>
          <label class="nc-chk"><input type="checkbox" id="cpDev"><span>${t('Also names, descriptions and addresses', 'Ook namen, beschrijvingen en adressen')}</span></label>
          <label class="nc-chk"><input type="checkbox" id="cpDanger"><span>${t('Also risky settings', 'Ook risicovolle instellingen')}<small>${t('IP, security, switching ports off', 'IP, beveiliging, poorten uitzetten')}</small></span></label></div></div>
        <div class="nc-cp-col"><div class="nc-cp-h">${t('To', 'Naar')} <span class="nc-cp-btns"><button id="cpAll">${t('all', 'alle')}</button><button id="cpNone">${t('none', 'geen')}</button></span></div>
          <div class="nc-cp-list">${others.map(o => `<label class="nc-chk"><input type="checkbox" data-cpdev="${esc(o.ip)}" checked><span><b>${esc(o.name || o.ip)}</b></span><span class="subtle">${esc(o.ip)}${o.link ? ' · ' + esc(linkLabel(planItems().find(x => x.id === o.link) || { kind:'sw', label:'', dc:'' })) : ''}</span></label>`).join('')}</div></div>
        <div class="subtle nc-cp-note">${t('This only prepares the changes on those devices. Check them on each device (or under “Apply all”) and send when you are ready.', 'Dit zet de wijzigingen alleen klaar op die apparaten. Controleer ze per apparaat (of onder “Alles toepassen”) en stuur als je klaar bent.')}</div></div>`,
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
  function ethTileHtml(d, eth){
    const v = ethView(d, eth), nm = v.kind === 'isl' ? 'Trunk ISL' : v.kind === 'trunk' ? v.label : v.kind === 'vid' ? v.label : t('not used', 'niet gebruikt');
    return `<button class="nc-port nd eth ${v.changed ? 'chg' : ''} ${v.kind === 'isl' || v.kind === 'trunk' ? 'trunk' : ''} ${v.kind === 'none' ? 'off' : ''}" data-eth="${eth}" style="--pc:${esc(v.color)}" title="${esc(`ETH${eth} · ${nm}${v.vid != null ? ` · VLAN ${v.vid}` : ''}${v.unsent ? ' · ' + t('not sent: the node is still on the basic network', 'niet gestuurd: de node staat nog op het basisnetwerk') : ''}`)}">
      <span class="nc-top"><span class="nc-no">ETH${eth}</span><span class="nc-ico">${v.kind === 'isl' || v.kind === 'trunk' ? '⇄' : ''}</span></span>
      <span class="nc-nm">${esc(nm)}</span>
      <span class="nc-vl">${v.kind === 'isl' || v.kind === 'trunk' ? 'Trunk' : v.vid != null ? v.vid : '–'}${v.unsent ? ' *' : ''}</span></button>`;
  }
  function detailHtml(d){
    const idx = d.sel; if(idx == null) return `<div class="subtle nc-det">${isSw(d) ? t('Pick a VLAN and click ports, or click a port to edit it.', 'Kies een VLAN en klik op poorten, of klik op een poort om hem aan te passen.') : t('Click a port to set its universe, name, protocol and direction.', 'Klik op een poort om zijn universe, naam, protocol en richting in te stellen.')}</div>`;
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
      <label>Universe<input data-f="universe" type="number" min="${v.klass === 'artnet' ? 0 : 1}" max="${v.klass === 'artnet' ? 32767 - C.offset : 63999}" value="${esc(v.uni ?? '')}" style="width:90px"></label>
      ${!p.understood ? `<span class="su-warn">${t('The set-up of this port is not recognised, so it is not changed.', 'De opzet van deze poort wordt niet herkend, dus hij wordt niet gewijzigd.')}</span>` : ''}</div>`;
  }
  // the network of a LumiNode: basic (one address) or advanced (groups and ports), and what the plan wants on it
  function advNetHtml(d, it){
    if(isSw(d) || !d.cur) return '';
    const nc = d.cur.netcfg, planned = d.dev.net || (it?.kind === 'nd' && it.inst.advanced ? wantNode(it).net : null);
    if(!nc && !planned) return '';
    const g = nc ? Object.entries(nc.groups).map(([id, x]) => `<div class="nc-net-g"><i style="background:${esc(x.color || '#808080')}"></i><b>${t('Group', 'Groep')} ${id}</b> ${esc(x.name || '')} <span class="subtle">VLAN ${x.vid}</span> <span class="mono">${(x.network_settings?.addresses || []).map(a => esc(a.ip)).join(', ') || '—'}</span>${x.network_settings?.pipeline_setting ? ` <span class="tag green">${t('lighting', 'licht')} ${esc(x.network_settings.pipeline_setting)}</span>` : ''}</div>`).join('') : '';
    const ps = nc ? Object.entries(nc.ports).filter(([, p]) => (p.type || 'rj45') === 'rj45').map(([n, p]) => `<span class="tag">${esc(n)} → ${p.trunk != null ? `trunk ${p.trunk}` : p.group != null ? `${t('group', 'groep')} ${p.group}` : '—'}</span>`).join(' ') : '';
    const pl = planned && planned.groups.length ? `<div class="nc-net-plan"><b>${t('The plan wants', 'Het plan wil')}</b>: ${planned.groups.map(x => `VLAN ${x.vid} <span class="mono">${x.addresses.map(a => a.ip + '/' + a.prefix).join(', ')}</span>${x.listen ? ' · ' + t('lighting', 'licht') : ''}`).join(' · ')} · ${planned.ports.map(p => `ETH${p.eth}: ${p.vids.length > 1 ? 'trunk ' : ''}VLAN ${p.vids.join('+') || '—'}`).join(' · ')}</div>` : '';
    const warn = it?.kind === 'nd' ? (window.IpPlan?.check() || []).filter(i => i.dc === it.dc && i.label === (it.inst.id || it.inst.name) && (i.code === 'TRUNK' || i.code === 'PORTVLAN')).map(i => `<div class="su-warn">${I('alert', 13)} ${esc(t(i.en, i.nl))}</div>`).join('') : '';
    const note = d.dev.net ? (d.dev.ip ? `<div class="su-warn">${I('alert', 13)} ${t(`After this the node answers on ${esc(d.dev.ip)}.`, `Hierna antwoordt de node op ${esc(d.dev.ip)}.`)}</div>` : d.dev.netKeep ? `<div class="subtle" style="margin-top:3px">${t('The groups the node has keep their addresses (tick “Fill from the plan also sets the IP address” to change them).', 'De groepen die de node al heeft houden hun adres (vink “Invullen uit het plan zet ook het IP-adres” aan om ze te wijzigen).')}</div>` : '') : '';
    return `<div class="nc-net"><div class="nc-net-h"><b>${t('Network of this node', 'Netwerk van deze node')}</b> ${nc ? (nc.is_basic_config ? `<span class="tag">${t('basic: one address', 'basis: één adres')}</span>` : `<span class="tag blue">${t('advanced', 'advanced')}</span>`) : `<span class="tag">${t('basic only', 'alleen basis')}</span>`}</div>${g}${ps ? `<div style="margin:3px 0">${ps}</div>` : ''}${pl}${note}${warn}</div>`;
  }
  function brushBar(d){
    if(isSw(d)){
      const b = d.brush;
      return `<div class="nc-brush"><span class="subtle">${t('Pick a VLAN, then click or drag over ports', 'Kies een VLAN, klik of sleep dan over poorten')}:</span>${swBrushes(d).map(x => `<button class="nc-chip ${b?.vid === x.vid && b.type === 'vid' ? 'on' : ''}" data-brush="vid:${x.vid}" style="--pc:${esc(x.color || '#64748b')}"><i></i>${x.vid} ${esc(x.name)}${x.isNew ? ' +' : ''}</button>`).join('')}<button class="nc-chip ${b?.type === 'fibre' ? 'on' : ''}" data-brush="fibre" style="--pc:#38bdf8"><i></i>Trunk</button>${b ? `<button class="nc-chip x" data-brush="">${I('x', 11)} ${t('no brush', 'geen kwast')}</button>` : ''}</div>`;
    }
    if(!d.cur?.netcfg) return '';       // a node: a brush for its network ports (ETH1, ETH2); a DMX port is set in its own panel
    const b = d.brush;
    return `<div class="nc-brush"><span class="subtle">${t('Network ports (ETH): pick a brush, then click or drag over ETH1 / ETH2', 'Netwerkpoorten (ETH): kies een kwast, klik of sleep dan over ETH1 / ETH2')}:</span><button class="nc-chip ${b?.type === 'isl' ? 'on' : ''}" data-brush="isl" style="--pc:#38bdf8"><i></i>Trunk ISL</button>${ethBrushes(d).map(x => `<button class="nc-chip ${b?.vid === x.vid && b.type === 'vid' ? 'on' : ''}" data-brush="vid:${x.vid}" style="--pc:${esc(x.color || '#64748b')}"><i></i>${x.vid} ${esc(x.name)}${x.isNew ? ' +' : ''}</button>`).join('')}${b ? `<button class="nc-chip x" data-brush="">${I('x', 11)} ${t('no brush', 'geen kwast')}</button>` : ''}</div>`;
  }
  // the plan and the device differ, and nothing is waiting to be sent: say so, so it is sent (again)
  const driftTag = (d, n) => { if(n || d.busy) return ''; const k = planDiff(d); return k ? `<span class="tag yellow" title="${esc(t('The plan wants something else than this device has now. Press “Fill from the plan”, then apply.', 'Het plan wil iets anders dan dit apparaat nu heeft. Druk op “Invullen uit het plan” en dan op toepassen.'))}">${t('differs from the plan', 'wijkt af van het plan')}: ${k}</span>` : ''; };
  function cardHtml(d){
    const it = planOf(d), open = C.open.has(d.ip), n = d.cur ? changeCount(d) : 0;
    const ico = d.kind === 'gigacore' ? 'switchDev' : 'network';
    const status = d.busy ? `<span class="tag">${t('working…', 'bezig…')}</span>` : d.gone ? `<span class="tag red">${t('offline', 'offline')}</span>` : d.far ? `<span class="tag yellow">${t('other IP range', 'ander IP-bereik')}</span>` : d.moved ? `<span class="tag yellow">${t('moved', 'verhuisd')}</span>` : d.err ? `<span class="tag red" title="${esc(d.err)}">${t('error', 'fout')}</span>` : d.kind === 'unknown' ? `<span class="tag yellow">${t('login needed', 'login nodig')}</span>` : !d.cur ? `<span class="tag">${t('not read', 'niet gelezen')}</span>` : n ? `<span class="tag yellow">${n} ${t('changes', 'wijzigingen')}</span>` : d.verified ? `<span class="tag green">${t('sent and checked', 'verstuurd en gecontroleerd')}</span>` : `<span class="tag green">${t('up to date', 'actueel')}</span>`;
    const opts = planItems().filter(x => x.kind === (isSw(d) ? 'sw' : 'nd') && (x.id === d.link || (canLink(d, x) && ![...C.dev.values()].some(o => o.link === x.id))));
    const head = `<div class="nc-head" data-toggle="${esc(d.ip)}"><span class="nc-chev ${open ? 'open' : ''}">${I('chevronRight', 14)}</span><span class="nc-ic ${d.kind}">${I(ico, 18)}</span>
      <span class="nc-title"><b>${esc(d.name || d.model || d.ip)}</b><small>${esc(d.ip)} · ${esc(d.kind === 'gigacore' ? (d.model || 'GigaCore') : `LumiNode${d.version ? ' ' + d.version : ''}`)}${d.cur ? ` · ${isSw(d) ? d.cur.ports.length + ' ' + t('ports', 'poorten') : d.cur.ports.length + ' DMX'}` : ''}${viaText(d) ? ' · ' + esc(viaText(d)) : ''}</small></span>
      ${d.kind === 'unknown' ? '' : `<select class="nc-link" data-link="${esc(d.ip)}" title="${t('Which switch or node of the plan this is', 'Welke switch of node uit het plan dit is')}"><option value="">${t('not linked to the plan', 'niet gekoppeld aan het plan')}</option>${opts.map(x => `<option value="${esc(x.id)}" ${x.id === d.link ? 'selected' : ''}>${esc(linkLabel(x))}</option>`).join('')}</select>`}
      ${status}${driftTag(d, n)}</div>`;
    if(!open) return `<div class="nc-card">${head}</div>`;
    let body = '';
    if(d.kind === 'unknown') body = `<div class="nc-body"><div class="subtle">${t('This device asks for a login. Fill in the user name and password above and discover again.', 'Dit apparaat vraagt om een login. Vul gebruikersnaam en wachtwoord hierboven in en ontdek opnieuw.')}</div></div>`;
    else if(!d.cur) body = `<div class="nc-body">${d.far ? `<div class="su-warn">${I('alert', 13)} ${t(`This device is at ${esc(d.ip)}, in another IP range than this computer. PatchLab can add an address in that range to this computer (the system asks permission) so you can reach it.`, `Dit apparaat staat op ${esc(d.ip)}, in een ander IP-bereik dan deze computer. PatchLab kan een adres in dat bereik aan deze computer toevoegen (het systeem vraagt toestemming) zodat je erbij kunt.`)} <button class="sm" data-fixfar="${esc(d.ip)}">${t('Add address to this computer', 'Adres toevoegen aan deze computer')}</button></div>` : ''}${d.moved ? `<div class="su-warn">${I('alert', 13)} ${t(`This device moved to ${d.moved.to} (was ${d.moved.from}). This computer has no address in that range.`, `Dit apparaat is verhuisd naar ${d.moved.to} (was ${d.moved.from}). Deze computer heeft geen adres in dat bereik.`)} <button class="sm" data-fixmoved="${esc(d.ip)}">${t('Add address to this computer', 'Adres toevoegen aan deze computer')}</button></div>` : ''}${d.err ? `<div class="su-warn">${esc(d.err)}</div>` : ''}<button data-read="${esc(d.ip)}" ${d.busy ? 'disabled' : ''}>${I('refresh', 13)}${t('Read the device', 'Apparaat uitlezen')}</button></div>`;
    else {
      const o = opsOf(d), f = d.dev;
      const grid = isSw(d)
        ? `<div class="nc-grid">${api.portRows(d.cur).map(r => swTileHtml(d, r)).join('')}</div>`
        : `<div class="nc-grid nd">${d.cur.ports.map(p => ndTileHtml(d, p)).join('')}${d.cur.netcfg ? ethNames(d).map((_, i) => ethTileHtml(d, i + 1)).join('') : ''}</div>`;
      const devFields = isSw(d)
        ? `<label>${t('Name', 'Naam')}<input data-df="name" value="${esc(f.name ?? d.cur.device?.name ?? '')}" maxlength="64"></label><label>IP<input data-df="ip" value="${esc(f.ip ?? d.cur.ip?.ip_address ?? '')}" style="width:130px"></label>`
        : `<label>${t('Name', 'Naam')}<input data-df="shortName" value="${esc(f.shortName ?? d.cur.info?.short_name ?? '')}" maxlength="17"></label><label>${t('Long name', 'Lange naam')}<input data-df="longName" value="${esc(f.longName ?? d.cur.info?.long_name ?? '')}" maxlength="63"></label><label>IP<input data-df="ip" value="${esc(f.ip ?? d.cur.ip?.ipaddress ?? '')}" style="width:130px"></label>`;
      body = `<div class="nc-body">${misfit(d) ? `<div class="su-warn">${I('alert', 13)} ${esc(misfit(d))}</div>` : ''}${d.err && d.err !== misfit(d) ? `<div class="su-warn">${esc(d.err)}</div>` : ''}${d.warn ? `<div class="su-warn">${esc(d.warn)}</div>` : ''}
        <div class="nc-row">${devFields}<span style="flex:1"></span>${it ? `<button data-fill="${esc(d.ip)}">${t('Fill from the plan', 'Invullen uit het plan')}</button>` : ''}<button data-read="${esc(d.ip)}">${I('refresh', 13)}${t('Read again', 'Opnieuw lezen')}</button></div>
        ${f.ip && f.ip !== (isSw(d) ? d.cur.ip?.ip_address : d.cur.ip?.ipaddress) ? `<div class="su-warn">${t('The IP address changes when you apply; the device then moves to the new address.', 'Het IP-adres verandert bij het toepassen; het apparaat verhuist dan naar het nieuwe adres.')}</div>` : ''}
        ${isSw(d) && d.cur.mode === 'advanced' ? `<div class="su-warn">${t('This switch is in “advanced” configuration mode: it is also set with its command line, so groups and trunks made here may not show correctly.', 'Deze switch staat in “advanced” configuratiemodus: hij wordt ook met zijn commandoregel ingesteld, dus groepen en trunks die hier gemaakt worden kunnen verkeerd getoond worden.')} <button data-lxmode="${esc(d.ip)}">${t('Switch to Luminex mode…', 'Naar Luminex-modus…')}</button></div>` : ''}
        ${advNetHtml(d, it)}
        ${brushBar(d)}${grid}${detailHtml(d)}
        ${isSw(d) ? trunkHtml(d) + einkHtml(d) + lightsHtml(d) : ''}
        ${settingsHtml(d)}
        ${o.notes.map(x => `<div class="subtle" style="font-size:12px">${I('info', 12)} ${esc(x)}</div>`).join('')}
        ${logHtml(d)}
        <div class="nc-row"><span class="subtle">${n} ${t('changes waiting', 'wijzigingen wachten')}</span><span style="flex:1"></span><button data-undo="${esc(d.ip)}" ${d.E.size || d.NE.size || Object.keys(f).length || d.trunkEdit || d.S.size ? '' : 'disabled'}>${t('Undo my changes', 'Mijn wijzigingen ongedaan maken')}</button><button class="primary" data-apply="${esc(d.ip)}" ${d.busy ? 'disabled' : ''} title="${esc(n ? '' : t('Nothing changed: this sends the plan to the device again', 'Niets veranderd: dit stuurt het plan opnieuw naar het apparaat'))}">${t('Apply…', 'Toepassen…')}</button></div></div>`;
    }
    return `<div class="nc-card open">${head}${body}</div>`;
  }
  function paint(){
    if(App.getMODEL?.()?.ui?.view !== 'NETCONFIG') return;       // never draw over another page
    if(!root || !root.isConnected) root = App.$('#lkDetail'); if(!root) return;
    const sc = App.$('#mainScroll'), top = sc ? sc.scrollTop : 0, wraps = {}; root.querySelectorAll('[data-scrollkey]').forEach(w => { wraps[w.dataset.scrollkey] = [w.scrollLeft, w.scrollTop]; });
    const devs = [...C.dev.values()].sort((a, b) => (a.kind === 'gigacore' ? 0 : a.kind === 'lumi' ? 1 : 2) - (b.kind === 'gigacore' ? 0 : b.kind === 'lumi' ? 1 : 2) || ipNum(a.ip) - ipNum(b.ip));
    const total = devs.reduce((n, d) => n + (d.cur ? changeCount(d) : 0), 0);
    const anyRead = devs.some(d => d.cur && !d.busy);
    const drifted = devs.filter(d => d.cur && !changeCount(d) && planDiff(d) > 0);
    const missing = planItems().filter(x => !devs.some(d => d.link === x.id));
    const nSw = devs.filter(d => d.kind === 'gigacore').length, nNd = devs.filter(d => d.kind === 'lumi').length, nUn = devs.filter(d => d.kind === 'unknown').length;
    App.pageHead?.({ eyebrow:t('Network', 'Netwerk'), title:t('Network config', 'Netwerkconfig'), sub:t('All your LumiNodes and GigaCore switches on one page: discover them, paint the VLANs and universes, apply.', 'Al je LumiNodes en GigaCore-switches op één pagina: ontdek ze, schilder de VLAN’s en universes, pas toe.'),
      actions:`<button data-cmd="align" title="${t('Find, blink, link and send in guided steps', 'Zoeken, knipperen, koppelen en sturen in stappen')}">${I('compass', 15)}${t('Align tool', 'Uitlijntool')}</button><button class="primary" id="ncDisc" ${C.busy ? 'disabled' : ''}>${I('search', 15)}${C.busy ? t('Searching…', 'Zoeken…') : C.watching ? t('Search now', 'Nu zoeken') : C.found ? t('Discover again', 'Opnieuw ontdekken') : t('Discover devices', 'Apparaten ontdekken')}</button>` });
    root.innerHTML = `<div class="stack nc">
      ${searchLine()}${C.watching ? `<div class="nc-live" id="ncLive">${liveHtml()}</div>` : ''}
      <details class="nc-conn" ${C.found ? '' : 'open'}><summary>${I('sliders', 14)} ${t('Connection', 'Verbinding')} <span class="subtle">${esc(C.user)}</span></summary>
        <div class="nc-row"><label>${t('User name', 'Gebruikersnaam')}<input id="ncUser" value="${esc(C.user)}" style="width:110px" autocomplete="off"></label><label>${t('Password', 'Wachtwoord')}<input id="ncPass" type="password" value="${esc(C.pass)}" style="width:110px" autocomplete="off"></label>
          <label class="nc-chk"><input type="checkbox" id="ncTls" ${C.https ? 'checked' : ''}> https</label></div>
        <div class="nc-row"><label>${t('Art-Net universe numbers', 'Art-Net-universenummers')}<select id="ncOff"><option value="0" ${C.offset === 0 ? 'selected' : ''}>${t('as the node shows them (default)', 'zoals de node ze toont (standaard)')}</option><option value="-1" ${C.offset === -1 ? 'selected' : ''}>${t('one lower (universe 1 = Art-Net 0)', 'één lager (universe 1 = Art-Net 0)')}</option></select></label>
          <label>${t('Save switch in profile slot', 'Bewaar switch in profielslot')}<input id="ncSlot" value="${esc(C.slot)}" placeholder="–" style="width:60px"></label>
          <label class="nc-chk"><input type="checkbox" id="ncNames" ${C.withNames !== false ? 'checked' : ''}> ${t('“Fill from the plan” also sets the port names', '“Invullen uit het plan” zet ook de poortnamen')}</label>
          <label class="nc-chk"><input type="checkbox" id="ncIp" ${C.withIp ? 'checked' : ''}> ${t('“Fill from the plan” also sets the IP address', '“Invullen uit het plan” zet ook het IP-adres')}</label></div>
        ${real() ? '' : `<div class="hint nd-sim">${I('info', 13)} ${t('Simulated devices — one pretend device on every planned address, so you can try this out. In the desktop app the real devices answer.', 'Gesimuleerde apparaten — één nepapparaat op elk gepland adres, zodat je dit kunt uitproberen. In de desktop-app antwoorden de echte apparaten.')}</div>`}</details>
      ${C.err ? `<div class="su-warn">${esc(C.err)}</div>` : ''}
      ${C.found ? `<div class="nc-bar"><span><b>${nSw}</b> GigaCore · <b>${nNd}</b> LumiNode${nUn ? ` · <b>${nUn}</b> ${t('need a login', 'vragen een login')}` : ''}${C.info ? ` <span class="subtle">· ${esc(C.info)}</span>` : ''}</span><span style="flex:1"></span>
        <button id="ncFillAll">${t('Fill all from the plan', 'Alles invullen uit het plan')}</button><button id="ncReadAll">${I('refresh', 13)}${t('Read all', 'Alles lezen')}</button><button id="ncApplyAllNoIp" ${anyRead ? '' : 'disabled'} title="${t('Send the settings only; IP addresses are left as they are', 'Stuur alleen de instellingen; IP-adressen blijven zoals ze zijn')}">${t('Apply all without IP', 'Alles toepassen zonder IP')}</button><button class="primary" id="ncApplyAll" ${anyRead ? '' : 'disabled'}>${t('Apply all', 'Alles toepassen')} (${total})…</button></div>
        ${drifted.length ? `<div class="su-warn">${I('alert', 13)} <b>${drifted.length}</b> ${t('devices differ from the plan', 'apparaten wijken af van het plan')}: ${drifted.slice(0, 8).map(d => esc(planOf(d)?.label || d.name || d.ip)).join(', ')}${drifted.length > 8 ? ' …' : ''}. ${t('The configuration has to be sent again: press “Fill all from the plan”, then “Apply all”.', 'De configuratie moet nog een keer verzonden worden: druk op “Alles invullen uit het plan” en dan op “Alles toepassen”.')}</div>` : ''}
        ${devs.length ? devs.map(cardHtml).join('') : `<div class="subtle" style="margin:14px 0">${C.watching ? t('Listening… connect a LumiNode or GigaCore and it shows up here by itself. Fill in the user name and password if the devices ask for a login.', 'Luistert… sluit een LumiNode of GigaCore aan en hij verschijnt hier vanzelf. Vul gebruikersnaam en wachtwoord in als de apparaten om een login vragen.') : t('Nothing answered. Check the cable and the adapter in Settings > Network, and fill in the user name and password if the devices ask for a login.', 'Niets antwoordde. Controleer de kabel en de adapter bij Instellingen > Netwerk, en vul gebruikersnaam en wachtwoord in als de apparaten om een login vragen.')}</div>`}
        ${missing.length ? `<details class="nc-missing"><summary>${missing.length} ${t('items of the plan have no device yet', 'onderdelen uit het plan hebben nog geen apparaat')}</summary><div class="subtle">${missing.map(x => `${esc(linkLabel(x))}${x.ip ? ` · ${esc(x.ip)}` : ''}`).join('<br>')}</div></details>` : ''}`
        : `<div class="nc-empty">${I('search', 30)}<b>${t('Find your devices', 'Vind je apparaten')}</b><span>${t('Press Discover to list every LumiNode and GigaCore switch on the network at once. Each one is linked to a switch or node of your plan.', 'Druk op Ontdekken om elke LumiNode en GigaCore-switch op het netwerk in één keer te tonen. Elk apparaat wordt gekoppeld aan een switch of node uit je plan.')}</span></div>`}
    </div>`;
    if(sc) sc.scrollTop = top;
    root.querySelectorAll('[data-scrollkey]').forEach(w => { const p = wraps[w.dataset.scrollkey]; if(p){ w.scrollLeft = p[0]; w.scrollTop = p[1]; } });
    bind();
  }
  const cardOf = d => [...root.querySelectorAll('.nc-card')].find(c => c.querySelector('[data-toggle]')?.dataset.toggle === d.ip);
  function tileUpdate(d, port){
    const el = cardOf(d)?.querySelector(`.nc-port[data-port="${port}"]`); if(!el) return;
    const html = isSw(d) ? swTileHtml(d, api.portRows(d.cur).find(r => r.port === port)) : ndTileHtml(d, d.cur.ports[port]);
    const tmp = document.createElement('div'); tmp.innerHTML = html; el.replaceWith(tmp.firstElementChild);
  }
  function ethUpdate(d, eth){
    const el = cardOf(d)?.querySelector(`.nc-port[data-eth="${eth}"]`); if(!el) return;
    const tmp = document.createElement('div'); tmp.innerHTML = ethTileHtml(d, eth); el.replaceWith(tmp.firstElementChild);
  }
  const allCount = () => [...C.dev.values()].reduce((n, d) => n + (d.cur ? changeCount(d) : 0), 0);
  function bind(){
    const q = s => root.querySelector(s), qa = s => root.querySelectorAll(s), devOf = el => D(el.closest('[data-ip]')?.dataset.ip || el.dataset.ip);
    q('#ncDisc') ; const disc = document.querySelector('#ncDisc'); if(disc) disc.onclick = discover;
    qa('[data-fixmoved]').forEach(b => b.onclick = async () => { b.disabled = true; await fixMoved(D(b.dataset.fixmoved)); });
    const bindVal = (id, fn) => { const e = q(id); if(e) e.onchange = ev => fn(ev.target); };
    bindVal('#ncUser', e => { C.user = e.value; restartWatch(); }); bindVal('#ncPass', e => { C.pass = e.value; restartWatch(); }); bindVal('#ncTls', e => { C.https = e.checked; restartWatch(); });
    qa('[data-opennet]').forEach(b => b.onclick = () => window.Settings?.open?.('network'));
    qa('[data-fixfar]').forEach(b => b.onclick = async () => { b.disabled = true; await fixFar(D(b.dataset.fixfar)); });
    bindVal('#ncOff', e => { C.offset = Number(e.value); paint(); }); bindVal('#ncSlot', e => { C.slot = e.value.trim(); }); bindVal('#ncIp', e => { C.withIp = e.checked; }); bindVal('#ncNames', e => { C.withNames = e.checked; });
    if(q('#ncReadAll')) q('#ncReadAll').onclick = async () => { await pool([...C.dev.values()].filter(d => d.kind !== 'unknown'), 4, async d => { await readDev(d); paint(); }); };
    if(q('#ncFillAll')) q('#ncFillAll').onclick = () => { let n = 0; for(const d of C.dev.values()) if(fillFromPlan(d)) n++; paint(); App.ui.toast(`${n} ${t('devices filled from the plan — nothing is sent yet', 'apparaten ingevuld uit het plan — er is nog niets gestuurd')}`, 'info'); };
    if(q('#ncApplyAllNoIp')) q('#ncApplyAllNoIp').onclick = () => applyDevs([...C.dev.values()].filter(d => d.cur), { noIp:true, resend:!allCount() });
    if(q('#ncApplyAll')) q('#ncApplyAll').onclick = () => applyDevs([...C.dev.values()].filter(d => d.cur), { resend:!allCount() });
    qa('[data-toggle]').forEach(h => h.onclick = ev => { if(ev.target.closest('select,button,input')) return; const ip = h.dataset.toggle; C.open.has(ip) ? C.open.delete(ip) : C.open.add(ip); const d = D(ip); if(C.open.has(ip) && d && !d.cur && d.kind !== 'unknown' && !d.busy) readDev(d).then(paint); paint(); });
    qa('select[data-link]').forEach(s => s.onchange = () => { const d = D(s.dataset.link); d.link = s.value || null; paint(); });
    qa('[data-read]').forEach(b => b.onclick = async () => { const d = D(b.dataset.read); await readDev(d); paint(); });
    qa('[data-fill]').forEach(b => b.onclick = () => { const d = D(b.dataset.fill); fillFromPlan(d); paint(); });
    qa('[data-undo]').forEach(b => b.onclick = () => { const d = D(b.dataset.undo); d.E = new Map(); d.NE = new Map(); d.dev = {}; d.trunkEdit = null; d.S = new Map(); paint(); });
    qa('[data-apply]').forEach(b => b.onclick = () => { const d = D(b.dataset.apply); applyDevs([d], { resend:!changeCount(d) }); });
    qa('[data-df]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); const k = i.dataset.df, v = i.value.trim(); d.dev[k] = v; if(k === 'ip' && !ipOk(v)) delete d.dev.ip; if(k === 'ip' && d.dev.ip && !d.dev.mask) d.dev.mask = planOf(d)?.s?.dev?.subnet || planOf(d)?.inst?.subnet || DEF_MASK; paint(); });
    // brushes
    qa('[data-brush]').forEach(b => b.onclick = () => { const d = D(b.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); const v = b.dataset.brush; if(!v) d.brush = null; else if(v === 'fibre') d.brush = { type:'fibre' }; else if(v === 'isl') d.brush = { type:'isl' }; else if(!isSw(d)){ const x = ethBrushes(d).find(y => y.vid === Number(v.split(':')[1])); d.brush = { type:'vid', ...x }; } else { const x = swBrushes(d).find(y => y.vid === Number(v.split(':')[1])); d.brush = { type:'vid', ...x }; } paint(); });
    qa('[data-trunkun]').forEach(i => i.onchange = () => { const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle); d.trunkEdit = { tid:Number(i.dataset.trunkun), vid:Number(i.value) || 0 }; paint(); });
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
      g.onmousedown = ev => { const el = ev.target.closest('.nc-port'); if(!el || ev.button !== 0) return; ev.preventDefault(); const d = dev(); if(el.dataset.eth){ if(applyEth(d, Number(el.dataset.eth))){ C.drag = d; ethUpdate(d, Number(el.dataset.eth)); } return; } const p = noOf(el); if(d.brush && applyBrush(d, p)){ C.drag = d; d.sel = p; tileUpdate(d, p); } else { d.sel = p; paint(); } };
      g.onmouseover = ev => { if(C.drag && !(ev.buttons & 1)){ endDrag(); return; } const el = ev.target.closest('.nc-port'); if(!el || !C.drag || C.drag !== dev()) return; const d = C.drag; if(el.dataset.eth){ if(applyEth(d, Number(el.dataset.eth))) ethUpdate(d, Number(el.dataset.eth)); return; } const p = noOf(el); if(applyBrush(d, p)) tileUpdate(d, p); };
    });
    // detail panel of one port: a change is saved and shown on the tile at once, and the panel stays as it is so you can go from field to field.
    // The page is rebuilt when you are done with the panel (the focus leaves it; a click on a button still lands first).
    qa('.nc-det').forEach(box => {
      box.querySelectorAll('[data-f]').forEach(i => i.onchange = () => {
        const d = D(i.closest('.nc-card').querySelector('[data-toggle]').dataset.toggle), p = d.sel, f = i.dataset.f, e = d.E.get(p) || {};
        if(f === 'legend' || f === 'name') e[f] = i.value; else if(f === 'dir' || f === 'klass') e[f] = i.value; else if(f === 'poe') e.poe = i.checked; else if(f === 'speed') e.speed = i.value;
        else if(f === 'universe'){ if(i.value === '') delete e.universe; else { const kl = e.klass || d.cur.ports[p]?.klass || 'sacn'; e.universe = kl === 'artnet' ? Math.max(0, Math.min(32767 - C.offset, Math.round(Number(i.value)))) : Math.max(1, Math.min(63999, Math.round(Number(i.value)))); } }
        else if(f === 'member'){ if(!i.value) delete e.member; else if(i.value === 'fibre') e.member = fibreMember(d); else { const x = swBrushes(d).find(y => y.vid === Number(i.value.split(':')[1])); e.member = { type:'vid', vid:x.vid, name:x.name, color:x.color }; } }
        if(Object.keys(e).length) d.E.set(p, e); else d.E.delete(p);
        box.dataset.dirty = '1'; tileUpdate(d, p);
      });
      box.addEventListener('focusout', ev => {
        if(!box.dataset.dirty || box.contains(ev.relatedTarget)) return;
        const go = () => { if(box.isConnected && !box.contains(document.activeElement) && document.hasFocus()) paint(); };
        if(mouseDown) document.addEventListener('mouseup', () => setTimeout(go, 0), { once:true }); else setTimeout(go, 0);
      });
    });
  }
  const endDrag = () => { if(C.drag){ C.drag = null; paint(); } };
  let mouseDown = false;       // the mouse button is down (the panel of a port is rebuilt only after it is up again)
  document.addEventListener('mousedown', () => { mouseDown = true; }, true);
  document.addEventListener('mouseup', () => { mouseDown = false; }, true);
  document.addEventListener('mouseup', endDrag, true); document.addEventListener('pointerup', endDrag, true); window.addEventListener('blur', () => { mouseDown = false; endDrag(); });

  async function render(){
    root = App.$('#lkDetail'); if(!root) return;
    await load().catch(() => {});
    if(!settingsHooked && window.Settings?.onChange){ settingsHooked = true; window.Settings.onChange(() => { refreshNets().then(() => { if(visible()) paint(); }); if(visible()) ensureWatch(); else if(!autoOn()) stopWatch(); }); }
    await refreshNets(); paint(); ensureWatch();
  }
  window.NetConfig = { planDiff, canLink, misfit, moveWarnings, addAddresses, fixMoved, fixFar, render, state:C, discover, readDev, opsOf, fillFromPlan, applyBrush, planItems, wantSwitch, wantNode, transport, dev:D, applyDevs, autoLink, real, changeCount, netPending, searchLine, ensureWatch, restartWatch, refreshNets };
})();
