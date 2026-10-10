// core/ipplan.js — the address plan of the whole show: every network device with its addresses, an automatic IP plan and the checks.
//   all()      every node, splitter and switch of every DimCity with its addresses (primary address + extra ones)
//   check()    duplicate addresses (also between DimCities and between the extra addresses of a device), addresses that do not fit the
//              scheme, devices on one VLAN in different networks, and ports that are not a trunk although the device needs one
//   preview()  what "Create IP plan" would change (old → new), nothing is touched
//   apply()    create the plan: switch 1 of every DimCity is .1, switch 2 is .2 …; nodes and splitters count on from .11 (FENT scheme)
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const F = () => window.Fent;
  const M = () => App.getMODEL();
  const plan = dc => M().networkDevices?.dimCityPlans?.[dc] || { nodes:[], splitters:[], switches:[] };
  const nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric:true });
  const ip2n = ip => String(ip).trim().split('.').reduce((n, p) => n * 256 + Number(p), 0);
  const maskBits = m => { if(!F().isIp(m)) return null; const n = ip2n(m); let b = 0; for(let i = 31; i >= 0 && (n >>> i) & 1; i--) b++; return b; };
  const network = (ip, mask) => { const b = maskBits(mask); if(b == null || !F().isIp(ip)) return null; const m = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0; return `${((ip2n(ip) & m) >>> 0).toString(16).padStart(8, '0')}/${b}`; };
  const netText = key => { if(!key) return ''; const [h, b] = key.split('/'); const n = parseInt(h, 16); return `${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}/${b}`; };

  // all devices with an address (or that can have one)
  function all(){
    const out = [], nd = M().networkDevices || {};
    const typeOf = (key, id) => (nd[key] || []).find(x => x.id === id) || {};
    const SN = window.ShortName;
    for(const dc of App.sortedDims()){
      const p = plan(dc);
      (p.nodes || []).forEach((dev, idx) => { const ty = typeOf('nodeTypes', dev.typeId), eth = Math.min(2, Math.max(1, Number(ty.ethernetCount) || 1)); out.push({ dc, kind:'node', idx, dev, label:dev.id || dev.name || `Node ${idx + 1}`, typeName:SN ? SN.of(ty) : ty.name || '', eth, ifs:F().ifaces(dev, eth) }); });
      (p.splitters || []).forEach((dev, idx) => { const ty = typeOf('splitterTypes', dev.typeId); if(!(dev.ip || dev.ifaces?.length || ty.defaultIp)) return; out.push({ dc, kind:'splitter', idx, dev, label:dev.id || dev.name || `Splitter ${idx + 1}`, typeName:SN ? SN.of(ty) : ty.name || '', eth:1, ifs:F().ifaces(dev, 1) }); });
      for(const s of (window.NetSwitches?.list(dc) || [])) out.push({ dc, kind:'switch', source:s.source, idx:s.source === 'plan' ? s.idx : null, key:s.key || null, dev:s.dev, label:s.source === 'plan' ? (s.dev.id || s.label) : (s.dev?.name || s.label), swLabel:s.label, typeName:SN ? SN.of(s.type) : s.type?.name || '', eth:1, ifs:F().ifaces(s.dev, 1), where:s.where || '' });
    }
    return out;
  }

  // ---- the checks ----
  // issues: [{ level:'err'|'warn'|'info', code, en, nl, dc, label, ip, others:[labels] }]
  function check(){
    const list = all(), cfg = M().networkDevices?.prefs?.fent || {}, issues = [];
    const own = d => `${d.dc} · ${d.label}`;
    // 1. the same address twice (any VLAN: two devices with one address cannot both be right)
    const byIp = new Map();
    for(const d of list) for(const x of d.ifs){ const ip = String(x.ip || '').trim(); if(!ip) continue; if(!byIp.has(ip)) byIp.set(ip, []); byIp.get(ip).push({ d, x }); }
    for(const [ip, uses] of byIp) if(uses.length > 1){
      const names = uses.map(u => own(u.d) + (u.d.eth > 1 ? ` ETH${u.x.eth}` : '')), vlans = new Set(uses.map(u => u.x.vlan));
      const sameDev = new Set(uses.map(u => u.d)).size === 1;
      issues.push({ level:'err', code:'DUPLICATE', en:`${ip} is used ${sameDev ? 'twice by' : 'by'} ${names.join(' and ')}${vlans.size > 1 ? ' (on different VLANs)' : ''}`, nl:`${ip} wordt ${sameDev ? 'twee keer gebruikt door' : 'gebruikt door'} ${names.join(' en ')}${vlans.size > 1 ? ' (op verschillende VLAN’s)' : ''}`, dc:uses[0].d.dc, label:uses[0].d.label, ip, others:names });
    }
    // 2. an address that is not an address, or does not fit the scheme
    for(const d of list) for(const x of d.ifs){
      if(!x.ip) continue;
      if(!F().isIp(x.ip)){ issues.push({ level:'warn', code:'FORMAT', en:'Not a valid IPv4 address', nl:'Geen geldig IPv4-adres', dc:d.dc, label:d.label, ip:x.ip }); continue; }
      if(cfg.on) for(const r of F().checkIp(x.ip, x.mask, x.vlan, cfg.group, d.kind === 'switch' ? 'equipment' : 'device')) issues.push({ ...r, dc:d.dc, label:d.label, ip:x.ip });
    }
    // 3. devices on one VLAN that sit in different networks cannot reach each other
    const byVlan = new Map();
    for(const d of list) for(const x of d.ifs){ const n = x.vlan != null ? network(x.ip, x.mask || F().MASK) : null; if(!n) continue; if(!byVlan.has(x.vlan)) byVlan.set(x.vlan, new Map()); const m = byVlan.get(x.vlan); if(!m.has(n)) m.set(n, []); m.get(n).push({ d, x }); }
    for(const [vlan, nets] of byVlan) if(nets.size > 1){
      const sorted = [...nets.entries()].sort((a, b) => b[1].length - a[1].length), main = sorted[0];
      for(const [n, uses] of sorted.slice(1)) for(const u of uses) issues.push({ level:'warn', code:'SUBNET', en:`${u.x.ip} is in ${netText(n)}, the rest of VLAN ${vlan} is in ${netText(main[0])}`, nl:`${u.x.ip} zit in ${netText(n)}, de rest van VLAN ${vlan} zit in ${netText(main[0])}`, dc:u.d.dc, label:u.d.label, ip:u.x.ip });
    }
    // 4. nodes without an address
    for(const d of list) if(d.kind === 'node' && !d.ifs.length) issues.push({ level:'info', code:'NOIP', en:'No address yet', nl:'Nog geen adres', dc:d.dc, label:d.label, ip:'' });
    issues.push(...portIssues());
    const rank = { err:0, warn:1, info:2 };
    return issues.sort((a, b) => rank[a.level] - rank[b.level] || nat(a.dc, b.dc) || nat(a.label, b.label));
  }
  // 5. ports: a node cable that carries two VLANs (or an advanced LumiNode with groups) needs a trunk port; an access port needs the VLAN of the device
  function portIssues(){
    const out = [];
    for(const dc of App.sortedDims()){
      let rows = []; try { rows = window.FentUI.portPlan(dc).rows; } catch { continue; }
      const eff = new Map(); for(const s of (window.NetSwitches?.list(dc) || [])) for(const p of (window.PortPlan?.swPorts(dc, s) || [])) eff.set(`${s.label}|${p.n}`, p);
      const nodes = plan(dc).nodes || [];
      for(const r of rows){
        if(!r.sw || !r.swPort || r.cable) continue;
        const p = eff.get(`${r.sw}|${r.swPort}`); if(!p) continue;
        const dev = r.kind === 'node' ? nodes[r.idx] : r.kind === 'splitter' ? (plan(dc).splitters || [])[r.idx] : null, adv = !!dev?.advanced;
        const ports = F().portsOf(dev || { ifaces:[] }, r.ethCount || 1).find(x => x.eth === r.eth);
        const vlans = ports?.vlans || [];
        if(vlans.length > 1 && !p.trunk) out.push({ level:'warn', code:'TRUNK', en:`${r.device}${r.ethCount > 1 ? ` ETH${r.eth}` : ''} carries ${vlans.length} VLANs (${vlans.join(', ')})${adv ? ' — advanced network' : ''} but ${r.sw} port ${r.swPort} is not a trunk`, nl:`${r.device}${r.ethCount > 1 ? ` ETH${r.eth}` : ''} draagt ${vlans.length} VLAN’s (${vlans.join(', ')})${adv ? ' — advanced netwerk' : ''} maar ${r.sw} poort ${r.swPort} is geen trunk`, dc, label:r.device, ip:'' });
        else if(vlans.length === 1 && !p.trunk && p.vid != null && Number(p.vid) !== Number(vlans[0])) out.push({ level:'warn', code:'PORTVLAN', en:`${r.device} is on VLAN ${vlans[0]} but ${r.sw} port ${r.swPort} is VLAN ${p.vid}`, nl:`${r.device} zit op VLAN ${vlans[0]} maar ${r.sw} poort ${r.swPort} is VLAN ${p.vid}`, dc, label:r.device, ip:'' });
      }
    }
    return out;
  }
  // the issues of one device (for the red marks in the tables)
  const issuesOf = (list, d) => list.filter(i => i.dc === d.dc && (i.label === d.label || (i.others || []).some(o => o === `${d.dc} · ${d.label}` || o.startsWith(`${d.dc} · ${d.label} `))));

  // ---- the IP plan ----
  const snap = d => JSON.parse(JSON.stringify({ ip:d.ip ?? '', subnet:d.subnet ?? '', ifaces:d.ifaces ?? [], ipRole:d.ipRole ?? null, ipVlan:d.ipVlan ?? null }));
  const restore = (d, s) => { d.ip = s.ip; d.subnet = s.subnet; d.ifaces = s.ifaces; if(s.ipRole == null) delete d.ipRole; else d.ipRole = s.ipRole; if(s.ipVlan == null) delete d.ipVlan; else d.ipVlan = s.ipVlan; };
  const texts = d => F().ifaces(d.dev, d.eth).map(x => x.ip).filter(Boolean);
  // what would change: [{ dc, label, kind, typeName, before:[ip], after:[ip], changed }] — the devices are put back as they were
  function preview(dcs = App.sortedDims()){
    const list = all().filter(d => dcs.includes(d.dc)), before = new Map(list.map(d => [d.dev, snap(d.dev)])), rows = [];
    const was = new Map(list.map(d => [d.dev, texts(d)]));
    for(const dc of dcs) window.FentUI.applyDim(dc);
    const now = all().filter(d => dcs.includes(d.dc));
    for(const d of now){ const a = was.get(d.dev) || [], b = texts(d); rows.push({ dc:d.dc, label:d.label, kind:d.kind, typeName:d.typeName, before:a, after:b, changed:a.join() !== b.join() }); }
    for(const d of list) restore(d.dev, before.get(d.dev));
    return rows;
  }
  function apply(dcs = App.sortedDims()){
    const cfg = M().networkDevices.prefs.fent; cfg.on = true;
    let n = 0, over = false; for(const dc of dcs){ const r = window.FentUI.applyDim(dc); n += r.n; over = over || r.over; }
    M().ui.dirty = true; return { n, over };
  }
  window.IpPlan = { all, check, issuesOf, preview, apply, network, netText };
})();
