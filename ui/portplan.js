// ui/portplan.js — plan the ports of switches and nodes before any device is on the network.
// The PATCH BOARD (top of the Network page) draws every switch like its front: drag a device (a node, a cable line) onto a port,
// or click the device and then the port. A device on a used port replaces the one that was there (that one goes back to the tray,
// the port it came from stays empty). Nothing is placed by itself; "Auto-fill ports…" fills the free ports once.
// Per switch port: VLAN or trunk, name, PoE (on/off) and speed; fibre (SFP) ports too — pick a VLAN at the top, click or drag over
// the ports and they get it. Nodes: universe, name, sACN / Art-Net and direction per DMX port.
// What is planned here is what the Network config page puts on the real devices later (see wantSwitch / wantNode there).
// A switch can be copied to other switches (with or without the port names), a node to other nodes.
// Stored in MODEL.networkDevices.portPlans = { 'sw:DB01|SW1': { ports: { 3: { vid, trunk, name, poe:'on'|'off', speed } } }, 'nd:DB01|N1': { ports: { 1: { name, klass, dir:'output'|'input'|'idle' } } } }
// Only what differs from the automatic plan is stored; a port without an entry follows the plan.
// Where devices sit: MODEL.networkDevices.portPatch[dc] = { order, sort, manual:{ key:{ sw, port } } } (key 'n:<node>#<eth>' or 'c:<cable>.<line>').
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const F = () => window.Fent;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const S = { swBrush:null, swExtra:{ poe:'', speed:'' }, sel:null, extra:new Set(), drag:null, dragDev:null, armed:null, rerender:null, down:false, fill:{ order:'nodes', sort:'id', keep:true, all:false } };
  const SPEEDS = ['auto', '1gbps fdx', '100mbps fdx', '100mbps hdx', '10mbps fdx', '10mbps hdx', '10gbps fdx', '2.5gbps fdx'];
  const DIRS = () => [['output', t('Output — network → DMX', 'Uitgang — netwerk → DMX')], ['input', t('Input — DMX → network', 'Ingang — DMX → netwerk')], ['idle', t('Off', 'Uit')]];

  const store = () => { const nd = M().networkDevices; return (nd.portPlans ||= {}); };
  const swKey = (dc, label) => `sw:${dc}|${label}`;
  const ndKey = (dc, inst, i) => `nd:${dc}|${inst.id || '#' + i}`;
  const get = key => store()[key]?.ports || {};
  const put = (key, port) => ((store()[key] ||= { ports:{} }).ports[port] ||= {});
  function prune(key){ const e = store()[key]; if(!e) return; for(const [p, v] of Object.entries(e.ports)) if(!Object.keys(v).length || Object.values(v).every(x => x === undefined || x === null || x === '')) delete e.ports[p]; if(!Object.keys(e.ports).length) delete store()[key]; }
  const dirty = () => { const m = M(); if(m?.ui) m.ui.dirty = true; };
  const vlanById = id => F()?.vlanById?.(Number(id)) || null;
  const vlanName = id => vlanById(id)?.name || `VLAN ${id}`;
  const vlanColor = id => vlanById(id)?.color || '#64748b';
  const mode = () => M().networkDevices?.prefs?.fent?.vlanMode || 'luminex';

  // ---- port names ----
  // Switch port (a GigaCore legend holds 16 characters): a node "ID:12 LN12" (its ID and the short name of its type), a network cable "CL503.4 Foyer"
  // (the line and its location), a console its name. A name typed by hand always goes first.
  function autoSwitchName(r){
    const eth = r.multi && !r.cable ? ` E${r.eth}` : '';       // only when both network ports of the device sit on a switch
    if(r.kind === 'cable') return `${r.device}${r.name ? ' ' + r.name : ''}`.slice(0, 16);
    if(r.kind === 'console' && !r.short) return `${String(r.name || r.device).slice(0, 16 - eth.length)}${eth}`;
    return `${r.device}${r.short ? ' ' + r.short : ''}`.slice(0, 16 - eth.length) + eth;
  }
  // DMX port of a node (the node holds 64 characters): the LK / Veam port(s) patched on its universe and a short piece of its location, "LK101.1 Truss 3" or "LK101.1-4 Truss 1 SL";
  // several sources: the first and "+2"; nothing patched on it: the ID of the node and the port, "ID:01.1"
  function autoDmxName(inst, j, uni, car){
    const base = `${inst.id || 'N'}.${j + 1}`;
    if(uni == null) return base;
    const own = (car.get(Number(uni)) || []).filter(o => o.kind !== 'DMX'), first = own[0];
    if(!first) return base;
    const nm = first.ports ? `${first.id}.${String(first.ports).replace(/\s+/g, '')}` : first.id, loc = String((first.dests || [])[0] || '').trim().slice(0, 16);
    return `${nm}${loc ? ' ' + loc : ''}${own.length > 1 ? ` +${own.length - 1}` : ''}`.slice(0, 64);
  }
  const carOf = dc => { try { return window.NetNodes?.carriers?.(dc) || new Map(); } catch { return new Map(); } };

  // ---- switches: what every port looks like (plan + what was changed by hand) ----
  const sfpNo = (s, i) => window.SwPorts?.no(s.type, i) ?? s.rj + i;
  // the other end of a fibre that sits on SFP port i of this switch: { text, title } (null when there is no fibre)
  function fibrePartner(dc, s, i, fl){
    if(!fl) return null;
    const me = e => e && !e.free && e.dc === dc && e.sw === s.label && Number(e.sfp) === i;
    const o = [fl.a, fl.b].find(e => e && !me(e)); if(!o) return { text:'', title:fl.id };
    if(o.free) return { text:`→ ${o.free}`, title:`${fl.id} → ${o.free}` };
    const os = (window.NetSwitches?.list(o.dc) || []).find(x => x.label === o.sw);
    return { text:`→ ${o.sw}${o.dc !== dc ? ` · ${o.dc}` : ''} · ${window.SwPorts ? window.SwPorts.short(os?.type, Number(o.sfp)) : 'S' + o.sfp}`, title:`${fl.id}: ${window.Fibers.endLabel(o)}` };
  }
  function swPorts(dc, s){
    const rows = (window.FentUI?.portPlanBase(dc).rows || []).filter(r => r.sw === s.label && r.swPort);
    // every RJ45 port starts on the management VLAN, every SFP port is a trunk — until you choose something else
    const mg = F()?.roleVlan?.('management', mode()) ?? null;
    // a node that carries two VLANs on one cable (management + lighting) needs a trunk port; the plan says so by itself
    const auto = new Map(rows.map(r => [r.swPort, { vid:Number.isFinite(Number((r.vlans || [])[0])) && (r.vlans || []).length ? Number(r.vlans[0]) : mg, trunk:r.mode === 'trunk', name:autoSwitchName(r), key:r.key, unis:r.unis || '' }]));
    const links = window.Fibers ? window.Fibers.usage(dc, s.label) : new Map();
    const sl = new Map((window.NetSwitches?.linksOf(dc) || []).filter(l => l.sw === s.label).map(l => [l.port, l]));   // ports of a link to another switch: always a trunk
    const ov = get(swKey(dc, s.label)), out = [];
    const one = (n, kind, a, label) => {
      const o = ov[n] || {}, trunk = a.link ? true : o.trunk ? true : o.vid != null ? false : !!a.trunk, vid = trunk ? null : (o.vid != null ? Number(o.vid) : a.vid);
      out.push({ n, kind, label, vid, trunk, link:a.link || null, partner:a.partner || null, devKey:a.key || '', unis:a.unis || '', name:o.name != null && o.name !== '' ? String(o.name) : a.name, autoName:a.name, autoVid:a.vid, autoTrunk:!!a.trunk, poe:o.poe || '', speed:o.speed || '',
        manualName:o.name != null && o.name !== '', manualVlan:!a.link && (o.vid != null || !!o.trunk), manualExtra:!!(o.poe || o.speed) });
    };
    for(let n = 1; n <= s.rj; n++){ const l = sl.get(n); one(n, 'rj', l ? { vid:null, name:`→ ${l.to.sw}`, trunk:true, link:l } : (auto.get(n) || { vid:mg, name:'' }), `${t('Port', 'Poort')} ${n}`); }
    for(let i = 1; i <= s.sfp; i++) one(sfpNo(s, i), 'sfp', { vid:null, name:'', trunk:true, partner:fibrePartner(dc, s, i, links.get(i)) }, window.SwPorts ? window.SwPorts.label(s.type, i) : `SFP ${i}`);
    return out;
  }
  const vlansInUse = dc => { const set = new Set(); for(const s of (window.NetSwitches?.list(dc) || [])) for(const p of swPorts(dc, s)) if(p.vid != null) set.add(p.vid); return set; };

  // ---- which device sits on which port (the patch) ----
  // MODEL.networkDevices.portPatch[dc] = { order:'nodes'|'cables', sort:'id'|'plan', manual:{ key: { sw, port } } }
  // key: 'n:<node>#<eth>' or 'c:<cable>.<line>'. Only what you placed is here; a device without an entry waits in the tray.
  const pstore = () => { const nd = M().networkDevices; return (nd.portPatch ||= {}); };
  const wpatch = dc => { const st = pstore(); const p = (st[dc] ||= {}); p.order ||= 'nodes'; p.sort ||= 'id'; p.manual ||= {}; delete p.auto; return p; };
  const patch = dc => { const p = pstore()[dc]; return { order:'nodes', sort:'id', ...(p || {}), manual:p?.manual || {} }; };
  const baseRows = dc => window.FentUI.portPlanBase(dc).rows;
  const sameRow = (a, b) => a && b && a.sw === b.sw && Number(a.port) === Number(b.port);
  // Projects made with 0.12 and older filled the ports by themselves. The first time such a project is looked at, what it showed is frozen
  // as "placed", so nothing moves; from then on only your own placing counts.
  function ensureV2(){
    const nd = M()?.networkDevices; if(!nd || nd.portPatchV === 2) return;
    nd.portPatchV = 2;
    const dims = (App.sortedDims?.() || []);
    for(const dc of dims){
      const old = pstore()[dc]; if(old && old.v === 2) continue;
      const rows = window.FentUI.portRows(dc, { order:old?.order, sort:old?.sort });
      window.NetSwitches.legacyAssign(dc, rows, old ? { manual:old.manual || {}, auto:old.auto } : null);
      const p = wpatch(dc); p.manual = {};
      for(const r of rows) if(r.sw && r.swPort) p.manual[r.key] = { sw:r.sw, port:r.swPort };
      p.v = 2;
    }
  }
  // put a device on a port. The device that was there goes back to the tray; the port the moved device came from is empty again.
  function place(dc, key, sw, port){
    const p = wpatch(dc), rows = baseRows(dc), me = rows.find(r => r.key === key); if(!me) return false;
    const s = window.NetSwitches.list(dc).find(x => x.label === sw); port = Number(port);
    if(!s || port < 1 || port > s.rj || window.NetSwitches.linkAt(dc, sw, port)) return false;
    const occ = rows.find(r => r.sw === sw && r.swPort === port && r.key !== key);
    if(occ) delete p.manual[occ.key];
    p.manual[key] = { sw, port }; dirty(); return { replaced:occ || null };
  }
  function unplace(dc, key){ const p = wpatch(dc); delete p.manual[key]; dirty(); }
  // a device is gone for good: its places go too (a later device with the same id must not inherit them)
  function forget(dc, prefix){ const p = pstore()[dc]; if(!p?.manual) return; for(const k of Object.keys(p.manual)) if(k.startsWith(prefix)) delete p.manual[k]; dirty(); }
  const unplaceAll = dc => { wpatch(dc).manual = {}; dirty(); };
  // Auto-fill, once: the devices without a port go on the free ports, in the order asked. o = { order, sort, keep (keep what is placed), all (every DimCity) }
  function autoFill(dc, o = {}){
    const dcs = o.all ? App.sortedDims() : [dc]; let placed = 0, left = 0, noSwitch = 0;
    for(const d of dcs){
      const p = wpatch(d); if(o.order) p.order = o.order; if(o.sort) p.sort = o.sort; if(o.keep === false) p.manual = {};
      const sws = window.NetSwitches.list(d), rows = window.FentUI.portRows(d, { order:p.order, sort:p.sort });
      window.NetSwitches.assign(d, rows, patch(d));
      if(!sws.length){ noSwitch += rows.filter(r => r.unplaced).length; continue; }
      const taken = new Map(sws.map(s => [s.label, new Set()]));
      for(const r of rows) if(r.sw) taken.get(r.sw)?.add(r.swPort);
      for(const l of window.NetSwitches.linksOf(d)) taken.get(l.sw)?.add(l.port);
      let si = 0, port = 1;
      for(const r of rows){
        if(!r.unplaced) continue;
        while(si < sws.length){ const set = taken.get(sws[si].label); while(port <= sws[si].rj && set.has(port)) port++; if(port <= sws[si].rj) break; si++; port = 1; }
        if(si >= sws.length){ left++; continue; }
        taken.get(sws[si].label).add(port); p.manual[r.key] = { sw:sws[si].label, port }; port++; placed++;
      }
    }
    dirty(); return { placed, left, noSwitch };
  }

  // ---- the VLAN bar ----
  function brushBar(dc){
    const used = vlansInUse(dc), all = F().vlanList(mode());
    const ids = [...new Set([...used, ...S.extra])].sort((a, b) => a - b);
    const b = S.swBrush;
    const chips = ids.map(id => `<button class="pp-chip ${b && b.vid === id ? 'on' : ''}" data-ppb="vid" data-vid="${id}" style="--c:${vlanColor(id)}" title="${esc(vlanById(id)?.discipline || '')}"><i></i><b>${id}</b> ${esc(vlanName(id))}</button>`).join('');
    const more = all.filter(v => !ids.includes(v.id));
    return `<div class="pp-bar"><span class="subtle">${t('Pick a VLAN, then click or drag over the ports', 'Kies een VLAN, klik of sleep dan over de poorten')}:</span>${chips}
      <button class="pp-chip trunk ${b?.trunk ? 'on' : ''}" data-ppb="trunk">${t('Trunk', 'Trunk')}</button>
      <button class="pp-chip ${b?.clear ? 'on' : ''}" data-ppb="clear" title="${esc(t('Back to the automatic plan', 'Terug naar het automatische plan'))}">${t('Automatic', 'Automatisch')}</button>
      <select data-ppmore title="${esc(t('Add another VLAN to the bar', 'Voeg een ander VLAN aan de balk toe'))}"><option value="">${t('More VLANs…', 'Meer VLAN’s…')}</option>${more.map(v => `<option value="${v.id}">${v.id} ${esc(v.name)}</option>`).join('')}</select>
      <label>PoE<select data-ppxpoe><option value="">–</option><option value="on" ${S.swExtra.poe === 'on' ? 'selected' : ''}>${t('on', 'aan')}</option><option value="off" ${S.swExtra.poe === 'off' ? 'selected' : ''}>${t('off', 'uit')}</option></select></label>
      <label>${t('Speed', 'Snelheid')}<select data-ppxspeed><option value="">–</option>${SPEEDS.map(x => `<option value="${esc(x)}" ${S.swExtra.speed === x ? 'selected' : ''}>${esc(x === 'auto' ? 'Auto' : x)}</option>`).join('')}</select></label></div>`;
  }

  // ---- the PATCH BOARD: every switch drawn like its front, devices on their ports ----
  const KIND_ICON = { node:'network', splitter:'split', cable:'cable', link:'plug', console:'console' };
  const devTip = r => [`${r.device}${r.ethCount > 1 && !r.cable ? ` ETH${r.eth}` : ''}`, r.typeFull, r.name && r.name !== r.device ? r.name : '', r.csvRef ? `Node ${r.csvRef}` : '', r.unis ? `U ${r.unis}` : '', r.dest || ''].filter(Boolean).join(' · ');
  const devShort = r => `${r.kind === 'console' ? (r.name || r.device) : r.device}${r.ethCount > 1 && !r.cable ? `·${r.eth}` : ''}`;
  function chip(r, ctx, extra = ''){
    const pl = r.kind === 'node' && ctx ? ctx.panelOf(r.idx) : null;
    return `<div class="pb-dev k-${r.kind} ${r.gone ? 'gone' : ''} ${S.armed === r.key ? 'armed' : ''} ${extra}" draggable="true" data-pbdev="${esc(r.key)}" title="${esc(devTip(r) + (r.gone ? ` · ${t('no longer in a rack', 'niet meer in een rek')}` : '') + (pl ? ` · ${t('plug into', 'steek in')} ${pl.panel} etherCON ${pl.no}` : ''))}"><i>${I(KIND_ICON[r.kind] || 'network', 13)}</i><b>${esc(devShort(r))}</b><em>${esc(r.typeName || '')}</em>${pl ? `<s title="${esc(`${pl.panel} · etherCON ${pl.no}`)}">${esc(pl.panel)}.${pl.no}</s>` : ''}</div>`;
  }
  const speedShort = x => (x === 'auto' ? 'auto' : String(x).replace(' fdx', '').replace('bps', ''));
  function boardPort(dc, s, p, byPort, ctx, fib){
    const sel = S.armed && !p.link;
    if(p.kind === 'sfp'){
      const idx = p.n - sfpNo(s, 1) + 1, fl = fib.get(idx), fcol = fl ? window.Fibers.color(fl) : '#475569';
      const pt = p.partner && p.partner.text ? `<span class="pb-meta" title="${esc(p.partner.title)}">${esc(p.partner.text)}</span>` : '';
      return `<div class="pb-port sfp ${fl ? 'used' : ''}" style="--pc:${fcol}" title="${esc(p.label + (fl ? ` · ${fl.id}` : '') + (p.partner?.text ? ` ${p.partner.text}` : '') + ' · Trunk')}"><small>${esc(window.SwPorts ? window.SwPorts.short(s.type, idx) : p.n)}</small>${fl ? `<div class="pb-dev k-fibre"><i>${I('cable', 13)}</i><b>${esc(fl.id)}</b><em>${t('fibre', 'fiber')}</em></div>` : `<span class="pb-empty">SFP</span>`}${pt}<u class="pb-vl">T</u></div>`;
    }
    const r = byPort.get(p.n), col = p.trunk ? '#38bdf8' : p.vid != null ? vlanColor(p.vid) : '#475569';
    const lane = p.link ? (p.link.lane === 1 ? t('main', 'main') : p.link.lane === 2 ? t('backup', 'backup') : '') : '';
    const body = p.link ? `<div class="pb-dev k-link" draggable="true" data-pblink="${esc(p.link.id)}|${esc(s.label)}|${p.n}" title="${esc(`${t('Link to', 'Koppeling naar')} ${p.link.to.sw} · ${p.link.to.port} (trunk${lane ? ', ' + lane : ''}) — ${t('drag it to another port', 'sleep hem naar een andere poort')}`)}"><i>${I('plug', 13)}</i><b>${esc(p.link.to.sw)}</b><em>⇄ ${p.link.to.port}${lane ? ` · ${lane}` : ''}</em></div>`
      : r ? chip(r, ctx) : `<span class="pb-empty">${t('free', 'vrij')}</span>`;
    // what was set on the Switches tab shows here too: the name of the port, PoE and speed
    const meta = `${p.manualName && !p.link ? `<span class="pb-nm" title="${esc(t('Port name', 'Poortnaam'))}">${esc(p.name)}</span>` : ''}${p.poe || p.speed ? `<span class="pb-xt">${p.poe ? `<b>PoE ${p.poe === 'on' ? '✓' : '✗'}</b>` : ''}${p.speed ? `<b>${esc(speedShort(p.speed))}</b>` : ''}</span>` : ''}`;
    const tip = `${p.label}${p.link ? ' · trunk' : p.trunk ? ' · Trunk' : p.vid != null ? ` · ${p.vid} ${vlanName(p.vid)}` : ''}${p.manualName && !p.link ? ' · ' + p.name : ''}${p.poe ? ' · PoE ' + p.poe : ''}${p.speed ? ' · ' + p.speed : ''}`;
    return `<div class="pb-port ${r ? 'used' : ''} ${p.link ? 'link' : ''} ${sel ? 'pickable' : ''}" data-pbsw="${esc(s.label)}" data-pbport="${p.n}" style="--pc:${col}" title="${esc(tip)}"><small>${p.n}</small>${body}${meta}<u class="pb-vl">${p.trunk ? 'T' : p.vid != null ? p.vid : '–'}</u></div>`;
  }
  function boardSwitch(dc, s, rows, ctx){
    const fib = window.Fibers ? window.Fibers.usage(dc, s.label) : new Map();
    const ports = swPorts(dc, s), byPort = new Map(rows.filter(r => r.sw === s.label).map(r => [r.swPort, r]));
    const used = rows.filter(r => r.sw === s.label).length, links = (window.NetSwitches.linksOf(dc) || []).filter(l => l.sw === s.label).length;
    const ip = s.dev?.ip ? `<span class="mono subtle">${esc(s.dev.ip)}</span>` : '';
    return `<div class="pb-sw" data-pbkey="${esc(s.label)}"><div class="pb-head"><b>${esc(s.label)}</b><span class="subtle">${esc(window.NetSwitches.typeName(s.type))} · ${s.rj} RJ45${s.sfp ? ` + ${s.sfp} SFP` : ''}${s.where ? ` · ${esc(s.where)}` : ''}</span>${ip}<span style="flex:1"></span><span class="pb-count"><b>${used}</b>/${s.rj} ${t('used', 'gebruikt')}${links ? ` · ${links} ${links === 1 ? t('link', 'koppeling') : t('links', 'koppelingen')}` : ''}</span>
        <button class="sm" data-pblinkdlg="${esc(s.label)}" title="${esc(t('Connect this switch to another switch through two RJ45 ports (a trunk)', 'Verbind deze switch met een andere switch via twee RJ45-poorten (een trunk)'))}">${I('plug', 13)} ${t('Link to switch…', 'Koppel aan switch…')}</button></div>
      <div class="pb-ports">${ports.filter(p => p.kind === 'rj').map(p => boardPort(dc, s, p, byPort, ctx, fib)).join('')}${s.sfp ? `<span class="pb-gap"></span>${ports.filter(p => p.kind === 'sfp').map(p => boardPort(dc, s, p, byPort, ctx, fib)).join('')}` : ''}</div></div>`;
  }
  function boardHtml(dc){
    const sws = window.NetSwitches.list(dc), rows = baseRows(dc), ctx = window.NetNodes ? window.NetNodes.ctx(dc) : null;
    const loose = rows.filter(r => r.unplaced), placed = rows.length - loose.length, cap = sws.reduce((n, s) => n + s.rj, 0);
    const groups = [['node', t('Nodes', 'Nodes')], ['splitter', t('Splitters', 'Splitters')], ['console', t('Consoles', 'Lichttafels')], ['cable', t('Network cables', 'Netwerkkabels')]].map(([k, l]) => ({ k, l, list:loose.filter(r => r.kind === k) })).filter(g => g.list.length);
    const bar = `<div class="pb-bar"><span class="pb-stat"><b>${placed}</b>/${rows.length} ${t('on a port', 'op een poort')}</span>${rows.length > cap && sws.length ? `<span class="pb-stat bad">${I('alert', 13)} ${rows.length} ${t('ports needed', 'poorten nodig')}, ${cap} ${t('available', 'beschikbaar')}</span>` : ''}
        <span style="flex:1"></span>
        <button class="primary" data-pbfill title="${esc(t('Fill the free ports with the devices that have no port, once. Nothing moves by itself afterwards.', 'Vul de vrije poorten één keer met de apparaten die nog geen poort hebben. Daarna verschuift er niets vanzelf.'))}">${I('check', 14)} ${t('Auto-fill ports…', 'Poorten automatisch vullen…')}</button>
        <button data-pbclear ${placed ? '' : 'disabled'} title="${esc(t('Take every device off its port (they wait in the tray)', 'Haal elk apparaat van zijn poort (ze wachten in de bak)'))}">${t('Take all off', 'Alles eraf halen')}</button></div>`;
    const hint = `<div class="pb-hint">${I('info', 13)} ${t('Drag a device onto a port — or click the device, then the port. A device dropped on a used port takes its place; the one that was there goes back to the tray and the port it came from stays empty.', 'Sleep een apparaat op een poort — of klik het apparaat en dan de poort. Een apparaat op een bezette poort neemt de plek over; het apparaat dat er zat gaat terug in de bak en de poort waar het vandaan kwam blijft leeg.')}</div>`;
    const tray = `<div class="pb-tray" data-pbtray><div class="pb-tray-h"><b>${t('Without a port', 'Zonder poort')}</b><span class="subtle">${loose.length ? `${loose.length} — ${t('drag one onto a port', 'sleep er een op een poort')}` : t('everything has a port · drop a device here to take it off its port', 'alles heeft een poort · laat een apparaat hier los om het van zijn poort te halen')}</span></div>
        ${groups.map(g => `<div class="pb-tray-g"><span class="pb-tray-l">${g.l}</span>${g.list.map(r => chip(r, ctx)).join('')}</div>`).join('')}</div>`;
    const empty = !sws.length ? `<div class="pb-none">${I('switchDev', 20)}<div><b>${t('No switch in this DimCity yet', 'Nog geen switch in deze DimCity')}</b><div class="subtle">${t('Add a switch on the Switches tab (or put one in a rack); it appears here and the devices can be dragged onto its ports.', 'Voeg een switch toe op het tabblad Switches (of zet er een in een rek); hij verschijnt hier en je kunt de apparaten op zijn poorten slepen.')}</div><button class="sm" data-nettab="switches" style="margin-top:6px">${t('Go to Switches', 'Naar Switches')}</button></div></div>` : '';
    return `${bar}${hint}${empty}<div class="pb-board">${sws.map(s => boardSwitch(dc, s, rows, ctx)).join('')}</div>${tray}${linksCard(dc, sws)}`;
  }
  // ---- links between two switches (RJ45, trunk) ----
  function linksCard(dc, sws){
    if(sws.length < 2 && !(window.NetSwitches.linksOf(dc) || []).length) return '';
    const links = window.NetSwitches.linksOf(dc).filter(l => !(l.to.dc === dc && l.sw > l.to.sw && window.NetSwitches.linksOf(dc).some(m => m.id === l.id && m !== l)));
    const seen = new Set(), rows = [];
    for(const l of window.NetSwitches.linksOf(dc)){ if(seen.has(l.id)) continue; seen.add(l.id); rows.push(l); }
    return `<div class="pb-links"><div class="pb-tray-h"><b>${t('Links between switches', 'Koppelingen tussen switches')}</b><span class="subtle">${t('RJ45 ports connected to each other, as a trunk (all VLANs)', 'RJ45-poorten die met elkaar verbonden zijn, als trunk (alle VLAN’s)')}</span><span style="flex:1"></span>
        ${sws.length > 1 ? `<button class="sm" data-pbautolink>${I('plug', 13)} ${t('Link automatically', 'Automatisch koppelen')}</button>` : ''}</div>
      ${rows.length ? rows.map(l => `<div class="pb-link"><b>${esc(l.sw)}</b> <span class="mono">${t('port', 'poort')} ${l.port}</span> <span class="pb-lk">⇄</span> <b>${esc(l.to.sw)}</b>${l.to.dc !== dc ? ` <span class="subtle">${esc(l.to.dc)}</span>` : ''} <span class="mono">${t('port', 'poort')} ${l.to.port}</span> <span class="tag blue">trunk</span>${l.lane ? ` <span class="tag">${l.lane === 1 ? t('main', 'main') : t('backup', 'backup')}</span>` : ''}<button class="sm ghost" data-pbunlink="${esc(l.id)}" title="${esc(t('Remove this link', 'Verwijder deze koppeling'))}">${I('trash', 13)}</button></div>`).join('') : `<div class="subtle" style="padding:2px 0 4px">${t('None. Switches in one DB are best linked with a trunk so every VLAN reaches them all.', 'Geen. Switches in één DB koppel je het best met een trunk, zodat elk VLAN ze allemaal bereikt.')}</div>`}</div>`;
  }
  function linkDialog(dc, from, rerender){
    const all = App.sortedDims().flatMap(d => window.NetSwitches.list(d).map(s => ({ dc:d, s }))), src = all.find(x => x.dc === dc && x.s.label === from); if(!src) return;
    const others = all.filter(x => !(x.dc === dc && x.s.label === from));
    if(!others.length){ App.ui.toast(t('Add a second switch first', 'Voeg eerst een tweede switch toe'), 'info'); return; }
    const freePorts = (d, s) => Array.from({ length:s.rj }, (_, i) => i + 1).filter(n => !window.NetSwitches.linkAt(d, s.label, n));
    // the last free ports first (the first ones are for the devices); a port with a device on it is used last
    const pick = (d, s, skip = []) => { const rows = baseRows(d), free = freePorts(d, s).filter(n => !skip.includes(n)), empty = free.filter(n => !rows.some(r => r.sw === s.label && r.swPort === n)); return (empty.length ? empty : free).slice(-1)[0] || 0; };
    const opts = (d, s, sel, skip = []) => freePorts(d, s).filter(n => !skip.includes(n)).map(n => { const r = baseRows(d).find(x => x.sw === s.label && x.swPort === n); return `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}${r ? ` — ${esc(r.device)}` : ''}</option>`; }).join('');
    const two = freePorts(dc, src.s).length >= 2 && others.some(x => freePorts(x.dc, x.s).length >= 2);
    const dlg = App.ui.openDialog({ title:t('Link two switches', 'Koppel twee switches'), subtitle:t('RJ45 to RJ45, as a trunk', 'RJ45 naar RJ45, als trunk'), width:'680px', body:`<div class="nc-copy">
        <div class="nc-cp-col"><div class="nc-cp-h">${esc(from)} <span class="subtle">${esc(dc)}</span></div><label class="field">${t('Main port', 'Hoofdpoort')}<select id="lkA"></select></label><label class="field lk-2">${t('Backup port', 'Backup-poort')}<select id="lkA2"></select></label></div>
        <div class="nc-cp-col"><div class="nc-cp-h">${t('To switch', 'Naar switch')}</div><label class="field"><select id="lkSw">${others.map((x, i) => `<option value="${i}">${esc(x.s.label)} · ${esc(x.dc)}</option>`).join('')}</select></label><label class="field">${t('Main port', 'Hoofdpoort')}<select id="lkB"></select></label><label class="field lk-2">${t('Backup port', 'Backup-poort')}<select id="lkB2"></select></label></div>
        <label class="field" style="grid-column:1/-1">${t('Lines', 'Lijnen')}<select id="lkN"><option value="2" ${two ? 'selected' : ''} ${two ? '' : 'disabled'}>${t('2 — main and backup (a trunk usually has two)', '2 — main en backup (een trunk heeft meestal twee)')}</option><option value="1" ${two ? '' : 'selected'}>${t('1 — a single line', '1 — één lijn')}</option></select></label>
        <div class="subtle nc-cp-note">${t('Both ports of each line become a trunk that carries every VLAN. A device that sits on one of these ports goes back to the tray.', 'Beide poorten van elke lijn worden een trunk die elk VLAN draagt. Een apparaat dat op een van deze poorten zit gaat terug in de bak.')}<span id="lkLoop" style="display:block;margin-top:6px"></span></div></div>`,
      footer:`<button class="primary" data-a="go">${t('Link', 'Koppel')}</button><button data-a="x">${t('Cancel', 'Annuleren')}</button>` });
    const q = x => dlg.body.querySelector(x), target = () => others[Number(q('#lkSw').value)];
    const fill = () => {
      const o = target(), n = Number(q('#lkN').value);
      const a1 = pick(dc, src.s), b1 = pick(o.dc, o.s);
      q('#lkA').innerHTML = opts(dc, src.s, a1); q('#lkB').innerHTML = opts(o.dc, o.s, b1);
      q('#lkA2').innerHTML = opts(dc, src.s, pick(dc, src.s, [a1]), [a1]); q('#lkB2').innerHTML = opts(o.dc, o.s, pick(o.dc, o.s, [b1]), [b1]);
      dlg.body.querySelectorAll('.lk-2').forEach(el => { el.style.display = n === 2 ? '' : 'none'; });
      q('#lkLoop').innerHTML = n === 2 ? `${I('alert', 12)} ${t('Two parallel links between two switches make a loop unless the switches treat them as one group (link aggregation) or run RSTP. Set that on the switches — PatchLab only plans the ports.', 'Twee parallelle koppelingen tussen twee switches vormen een lus, tenzij de switches ze als één groep (link aggregation) behandelen of RSTP draaien. Stel dat in op de switches — PatchLab plant alleen de poorten.')}` : '';
    };
    // choosing the main port keeps the backup port apart from it
    const sync = (main, back, d, s) => { const m = Number(q(main).value), keep = Number(q(back).value); q(back).innerHTML = opts(d, s, keep !== m ? keep : pick(d, s, [m]), [m]); };
    q('#lkSw').onchange = fill; q('#lkN').onchange = fill; q('#lkA').onchange = () => sync('#lkA', '#lkA2', dc, src.s); q('#lkB').onchange = () => sync('#lkB', '#lkB2', target().dc, target().s);
    fill();
    dlg.footer.querySelector('[data-a=x]').onclick = () => dlg.close();
    dlg.footer.querySelector('[data-a=go]').onclick = () => {
      const o = target(), n = Number(q('#lkN').value), A = [Number(q('#lkA').value), Number(q('#lkA2').value)], B = [Number(q('#lkB').value), Number(q('#lkB2').value)];
      const pairs = Array.from({ length:n }, (_, i) => [{ dc, sw:from, port:A[i] }, { dc:o.dc, sw:o.s.label, port:B[i] }]);
      window.PatchHistory?.label?.(`${dc}: ${from} linked to ${o.s.label}`);
      const err = window.NetSwitches.addLinks(pairs); if(err){ App.ui.toast(err, 'err'); return; } dlg.close(); rerender();
    };
  }
  // ---- auto-fill, once ----
  function fillDialog(dc, rerender){
    const f = S.fill, sws = window.NetSwitches.list(dc);
    const dlg = App.ui.openDialog({ title:t('Fill the ports automatically', 'Poorten automatisch vullen'), subtitle:t('Once — nothing moves by itself afterwards', 'Eén keer — daarna verschuift er niets vanzelf'), width:'640px', body:`<div class="nc-copy">
        <div class="nc-cp-col"><div class="nc-cp-h">${t('Order', 'Volgorde')}</div><div class="nc-cp-opts">
          <label class="field">${t('First', 'Eerst')}<select id="fiOrder"><option value="nodes" ${f.order === 'nodes' ? 'selected' : ''}>${t('all nodes, then the cables', 'alle nodes, dan de kabels')}</option><option value="cables" ${f.order === 'cables' ? 'selected' : ''}>${t('all cables, then the nodes', 'alle kabels, dan de nodes')}</option></select></label>
          <label class="field">${t('Sorted', 'Gesorteerd')}<select id="fiSort"><option value="id" ${f.sort === 'id' ? 'selected' : ''}>${t('by id', 'op id')}</option><option value="plan" ${f.sort === 'plan' ? 'selected' : ''}>${t('as planned', 'zoals gepland')}</option></select></label></div></div>
        <div class="nc-cp-col"><div class="nc-cp-h">${t('What', 'Wat')}</div><div class="nc-cp-opts">
          <label class="nc-chk"><input type="checkbox" id="fiKeep" ${f.keep ? 'checked' : ''}><span>${t('Keep what I placed already', 'Houd wat ik al geplaatst heb')}<small>${t('Off: everything is taken off first and placed again.', 'Uit: alles gaat eerst van de poorten en wordt opnieuw geplaatst.')}</small></span></label>
          <label class="nc-chk"><input type="checkbox" id="fiAll" ${f.all ? 'checked' : ''}><span>${t('All DimCities', 'Alle DimCities')}<small>${t('Off: only', 'Uit: alleen')} ${esc(dc)}.</small></span></label></div></div>
        <div class="subtle nc-cp-note">${sws.length ? t('Devices go on the free ports of the switches in order; ports of a switch link are skipped.', 'Apparaten komen op de vrije poorten van de switches, op volgorde; poorten van een switchkoppeling worden overgeslagen.') : t('This DimCity has no switch yet.', 'Deze DimCity heeft nog geen switch.')}</div></div>`,
      footer:`<button class="primary" data-a="go">${t('Fill the ports', 'Vul de poorten')}</button><button data-a="x">${t('Cancel', 'Annuleren')}</button>` });
    const q = x => dlg.body.querySelector(x);
    dlg.footer.querySelector('[data-a=x]').onclick = () => dlg.close();
    dlg.footer.querySelector('[data-a=go]').onclick = () => {
      Object.assign(S.fill, { order:q('#fiOrder').value, sort:q('#fiSort').value, keep:q('#fiKeep').checked, all:q('#fiAll').checked });
      window.PatchHistory?.label?.(`${dc}: ports filled`);
      const r = autoFill(dc, S.fill); dlg.close(); rerender();
      App.ui.toast(r.noSwitch && !r.placed ? t('There is no switch to put them on', 'Er is geen switch om ze op te zetten') : `${r.placed} ${t('devices placed', 'apparaten geplaatst')}${r.left ? ` — ${r.left} ${t('did not fit: no free port left', 'pasten niet: geen vrije poort meer')}` : ''}`, r.left ? 'info' : 'ok');
    };
  }
  // the table of connections (secondary, below the board): every device with its switch and port, as a list
  function connectionsCard(dc){
    const sws = window.NetSwitches.list(dc), rows = window.FentUI.portPlan(dc).rows;
    if(!rows.length) return '';
    const used = new Map(sws.map(s => [s.label, new Set([...rows.filter(r => r.sw === s.label).map(r => r.swPort), ...window.NetSwitches.linksOf(dc).filter(l => l.sw === s.label).map(l => l.port)])]));
    const body = `<div style="padding:4px 14px 12px"><div class="subtle" style="font-size:12.5px;margin:4px 0 8px">${t('The same as the patch board, as a list. Choosing a used port takes that port over; the device that was there goes back to the tray.', 'Hetzelfde als het patchbord, als lijst. Kies je een bezette poort, dan neem je die over; het apparaat dat er zat gaat terug in de bak.')}</div>
      <table class="data-table fent-ports"><thead><tr><th>${t('Device / cable', 'Apparaat / kabel')}</th><th>${t('Type', 'Type')}</th><th>${t('Switch', 'Switch')}</th><th>${t('Port', 'Poort')}</th><th>VLAN</th><th>${t('Mode', 'Modus')}</th><th>${t('Universes', 'Universes')}</th><th>${t('Address / location', 'Adres / locatie')}</th><th></th></tr></thead><tbody>
      ${rows.map(r => { const s = sws.find(x => x.label === r.sw), v = r.vlans?.[0] != null ? window.Fent?.vlanById(r.vlans[0]) : null;
        const ports = s ? Array.from({ length:s.rj }, (_, i) => i + 1).filter(n => !window.NetSwitches.linkAt(dc, s.label, n)) : [];
        return `<tr class="${r.unplaced ? 'fent-bad' : ''}" data-ppcrow="${esc(r.key)}"><td><b>${esc(r.device)}</b>${r.ethCount > 1 && !r.cable ? ` <span class="subtle">ETH${r.eth}</span>` : ''}</td><td class="subtle">${esc(r.typeName || '')}</td>
          <td><select data-ppcsw><option value="">—</option>${sws.map(x => `<option value="${esc(x.label)}" ${x.label === r.sw ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></td>
          <td>${s ? `<select data-ppcport>${ports.map(n => { const o = rows.find(q => q.sw === s.label && q.swPort === n && q.key !== r.key); return `<option value="${n}" ${n === r.swPort ? 'selected' : ''}>${n}${o ? ` — ${esc(o.device)}` : ''}</option>`; }).join('')}</select>` : '<span class="subtle">—</span>'}</td>
          <td>${r.trunk || r.mode === 'trunk' ? 'Trunk' : v ? window.NetCables.vlanChip(v.id) : ''}${r.portName ? ` <span class="subtle">${esc(r.portName)}</span>` : ''}</td><td>${r.mode === 'trunk' ? 'Trunk' : 'Access'}</td><td class="mono">${esc(r.unis || '')}</td><td class="mono">${esc((r.ips || []).join(' · ') || r.dest || '')}</td>
          <td>${r.sw ? `<button class="sm ghost" data-ppcun title="${esc(t('Take off its port', 'Van zijn poort halen'))}">${I('x', 13)}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    return App.ui.card({ key:`${dc}:ppconn`, title:t('Connections as a list', 'Aansluitingen als lijst'), icon:'table', meta:`${rows.length}`, collapsible:true, collapsed:true, body });
  }

  // ---- switch grid ----
  function swTile(dc, s, p){
    const sel = S.sel && S.sel.key === swKey(dc, s.label) && S.sel.port === p.n;
    const col = p.trunk ? '#38bdf8' : p.vid != null ? vlanColor(p.vid) : '#475569';
    const tip = `${p.label} · ${p.trunk ? 'Trunk' : p.vid != null ? `${p.vid} ${vlanName(p.vid)}` : t('no VLAN', 'geen VLAN')}${p.name ? ' · ' + p.name : ''}${p.partner?.title ? ' · ' + p.partner.title : ''}${p.poe ? ' · PoE ' + p.poe : ''}${p.speed ? ' · ' + p.speed : ''}`;
    const tags = `${p.poe ? `<em>PoE ${p.poe === 'on' ? '✓' : '✗'}</em>` : ''}${p.speed ? `<em>${esc(p.speed === 'auto' ? 'auto' : p.speed.replace(' fdx', '').replace('bps', ''))}</em>` : ''}`;
    return `<button class="pp-port ${p.kind} ${sel ? 'sel' : ''} ${p.link ? 'link' : ''} ${p.manualVlan || p.manualName || p.manualExtra ? 'man' : ''}" data-pport="${p.n}" data-ppsw="${esc(s.label)}" style="--pc:${col}" title="${esc(tip + (p.unis ? ' · U ' + p.unis : ''))}"><small>${p.kind === 'sfp' ? 'SFP ' : ''}${p.n}</small><b>${p.trunk ? 'T' : p.vid != null ? p.vid : '–'}</b><span>${esc(p.name || p.partner?.text || '')}${p.name && p.partner?.text ? ` <em class="pp-partner">${esc(p.partner.text)}</em>` : ''}${tags}</span></button>`;
  }
  function swDetail(dc, s){
    const key = swKey(dc, s.label); if(!S.sel || S.sel.key !== key) return '';
    const p = swPorts(dc, s).find(x => x.n === S.sel.port); if(!p) return '';
    const cur = p.trunk ? 'trunk' : p.manualVlan ? String(p.vid) : '';
    const all = F().vlanList(mode());
    return `<div class="pp-detail" data-ppdet="${esc(s.label)}"><b>${esc(p.label)}</b>${p.partner ? `<span class="pp-fibre">${I('cable', 13)} ${esc(t('Fibre', 'Fiber'))} ${esc(p.partner.title)}</span>` : ''}
      <label>${t('Name', 'Naam')}<input data-ppname value="${esc(p.manualName ? p.name : '')}" placeholder="${esc(p.autoName || t('(none)', '(geen)'))}" maxlength="16" style="width:170px"></label>
      <label>VLAN<select data-ppvlan><option value="" ${cur === '' ? 'selected' : ''}>${t('Automatic', 'Automatisch')}${p.autoVid != null ? ` (${p.autoVid})` : ''}</option><option value="trunk" ${cur === 'trunk' ? 'selected' : ''}>Trunk</option>${all.map(v => `<option value="${v.id}" ${cur === String(v.id) ? 'selected' : ''}>${v.id} ${esc(v.name)}</option>`).join('')}</select></label>
      <label>PoE<select data-ppoe><option value="" ${p.poe ? '' : 'selected'}>${t('Leave as is', 'Laten zoals het is')}</option><option value="on" ${p.poe === 'on' ? 'selected' : ''}>${t('on', 'aan')}</option><option value="off" ${p.poe === 'off' ? 'selected' : ''}>${t('off', 'uit')}</option></select></label>
      <label>${t('Speed', 'Snelheid')}<select data-ppspeed><option value="" ${p.speed ? '' : 'selected'}>${t('Leave as is', 'Laten zoals het is')}</option>${SPEEDS.map(x => `<option value="${esc(x)}" ${p.speed === x ? 'selected' : ''}>${esc(x === 'auto' ? 'Auto' : x)}</option>`).join('')}</select></label>
      <button class="sm ghost" data-ppreset>${t('Reset this port', 'Poort terugzetten')}</button></div>`;
  }
  function swBlock(dc, s){
    const key = swKey(dc, s.label), ports = swPorts(dc, s), man = ports.filter(p => p.manualName || p.manualVlan).length;
    return `<div class="pp-sw" data-ppkey="${esc(key)}"><div class="pp-head"><b>${esc(s.label)}</b><span class="subtle">${esc(window.NetSwitches.typeName(s.type))} · ${s.rj} RJ45${s.sfp ? ` + ${s.sfp} SFP` : ''}${man ? ` · ${man} ${t('by hand', 'handmatig')}` : ''}</span><span style="flex:1"></span>
      <button class="sm" data-ppcopy="${esc(s.label)}" title="${esc(t('Copy the port settings of this switch to other switches', 'Kopieer de poortinstellingen van deze switch naar andere switches'))}">${I('copy', 13)} ${t('Copy to other switches…', 'Naar andere switches kopiëren…')}</button>
      <button class="sm ghost" data-ppnames="${esc(s.label)}" title="${esc(t('Remove all names typed by hand: the automatic names come back', 'Haal alle handmatige namen weg: de automatische namen komen terug'))}">${t('Automatic names', 'Automatische namen')}</button>
      <button class="sm ghost" data-ppresetall="${esc(s.label)}">${t('Reset all', 'Alles terugzetten')}</button></div>
      <div class="pp-grid">${ports.map(p => swTile(dc, s, p)).join('')}</div><div class="subtle" style="font-size:12px;margin-top:4px">${t('Click a port to set its VLAN, name, PoE and speed; double-click it to type a name straight away. Every RJ45 port starts on the management VLAN; the SFP ports are here too and are a trunk by themselves. A port with a fibre shows the switch at the other end. The cables themselves are on the Fibres tab.', 'Klik op een poort voor VLAN, naam, PoE en snelheid; dubbelklik om meteen een naam te typen. Elke RJ45-poort staat standaard op het management-VLAN; de SFP-poorten staan hier ook en zijn vanzelf een trunk. Een poort met een fiber toont de switch aan de andere kant. De kabels zelf staan op het tabblad Fibers.')}</div>${swDetail(dc, s)}${namesList(swKey(dc, s.label), t('Port names as a list', 'Poortnamen als lijst'), `data-ppnsw="${esc(s.label)}"`, ports.map(p => ({ n:p.n, label:p.label, info:p.link ? t('link', 'koppeling') : p.trunk ? 'Trunk' : p.vid != null ? `${p.vid} ${vlanName(p.vid)}` : '', name:p.manualName ? p.name : '', auto:p.autoName || p.partner?.text || '', attr:'data-ppnm', max:16, off:!!p.link })))}</div>`;
  }

  // ---- nodes ----
  // what a DMX port does when nothing else is chosen for it: prefs.dmx = { klass:'sacn'|'artnet', dir:'output'|'input'|'idle' } (set in the card of the node ports)
  const dmxDef = () => { const d = M().networkDevices?.prefs?.dmx || {}; return { klass:d.klass === 'artnet' ? 'artnet' : 'sacn', dir:['output', 'input', 'idle'].includes(d.dir) ? d.dir : 'output' }; };
  // `use` = what the racks put on that port (inst.rackPorts, kept by RackPlan.syncNodes): { by:'LK201 · 1', uni } or null when the port is free.
  // The universe of a port in use comes from the CSV / the LK; the other settings of a port (name, protocol, direction) are always the user's.
  function ndPorts(dc, inst, i, car = carOf(dc)){
    const ty = (M().networkDevices.nodeTypes || []).find(x => x.id === inst.typeId) || {}, n = Math.max(1, Number(ty.portCount) || (Array.isArray(inst.universes) ? inst.universes.length : 0) || 1);
    const ov = get(ndKey(dc, inst, i)), u = Array.isArray(inst.universes) ? inst.universes : [], out = [], def = dmxDef();
    const racks = !inst.gone && Array.isArray(inst.rackPorts) ? inst.rackPorts : [];
    for(let j = 0; j < n; j++){
      const o = ov[j + 1] || {}, uni = u[j] == null || u[j] === '' ? null : Number(u[j]), auto = autoDmxName(inst, j, uni, car);
      out.push({ n:j + 1, uni, name:o.name || auto, autoName:auto, manualName:!!o.name, klass:o.klass || def.klass, dir:o.dir || def.dir, manualKlass:!!o.klass, manualDir:!!o.dir, use:racks[j] || null });
    }
    return out;
  }
  // A universe typed by hand on a FREE port. A node that follows the racks gets the universes of its other ports from the racks every time (RackPlan.syncNodes),
  // so the number is also kept in inst.manualUni, which that sync leaves alone.
  function setNodeUniverse(inst, n, v){
    inst.universes = Array.isArray(inst.universes) ? inst.universes : [];
    inst.universes[n - 1] = v;
    if(inst.src){
      if(v == null) { if(inst.manualUni) delete inst.manualUni[n]; } else (inst.manualUni ||= {})[n] = v;
      if(inst.manualUni && !Object.keys(inst.manualUni).length) delete inst.manualUni;
    }
  }
  const wasText = w => [w.name ? `${t('name', 'naam')} “${w.name}”` : '', w.uni != null ? `universe ${w.uni}` : '', w.klass ? protoName(w.klass) : '', w.dir ? (DIRS().find(d => d[0] === w.dir)?.[1] || '').split(' — ')[0].toLowerCase() : ''].filter(Boolean).join(', ');
  // The racks start using a port of this node (an LK line needs it): what was set by hand on that port goes — the LK decides — and the user is told.
  // Returns the sentence for the pop-up, or '' when nothing was set on that port.
  function takeOver(dc, inst, i, n, by){
    const key = ndKey(dc, inst, i), e = store()[key]?.ports?.[n], was = {};
    if(e){ for(const k of ['name', 'klass', 'dir']) if(e[k]) was[k] = e[k]; delete store()[key].ports[n]; prune(key); }
    if(inst.manualUni && inst.manualUni[n] != null){ was.uni = inst.manualUni[n]; delete inst.manualUni[n]; if(!Object.keys(inst.manualUni).length) delete inst.manualUni; }
    if(!Object.keys(was).length) return '';
    (inst.takeovers ||= []).push({ port:n, by, was });
    return t(`${inst.id || dc} port ${n} is now used by ${by}: your own settings (${wasText(was)}) are replaced`, `${inst.id || dc} poort ${n} wordt nu gebruikt door ${by}: jouw eigen instelling (${wasText(was)}) is vervangen`);
  }
  // The lighting data the data group of an advanced node takes part in follows its DMX ports: output ports → 'output', input ports → 'input', both → 'input+output', all off → ''
  function pipeOf(dc, inst, i){
    const all = ndPorts(dc, inst, i), used = all.filter(p => p.uni != null), dirs = new Set((used.length ? used : all).map(p => p.dir));
    const inp = dirs.has('input'), out = dirs.has('output');
    return inp && out ? 'input+output' : inp ? 'input' : out ? 'output' : '';
  }
  const protoName = k => (k === 'artnet' ? 'Art-Net' : 'sACN');
  const dirArrow = d => (d === 'input' ? '↓' : d === 'idle' ? '⏻' : '↑');
  function ndTile(dc, inst, i, p){
    const sel = S.sel && S.sel.key === ndKey(dc, inst, i) && S.sel.port === p.n;
    const col = p.uni == null ? '#475569' : `hsl(${(p.uni * 37) % 360} 55% 44%)`;
    return `<button class="pp-port nd ${sel ? 'sel' : ''} ${p.manualName || p.manualKlass || p.manualDir ? 'man' : ''}" data-pport="${p.n}" data-ppnd="${i}" style="--pc:${col}" title="${esc(`DMX ${p.n} · ${p.uni == null ? t('no universe', 'geen universe') : 'U' + p.uni} · ${p.name} · ${protoName(p.klass)} ${DIRS().find(d => d[0] === p.dir)?.[1] || ''}`)}"><small class="pp-top"><span>${p.n}</span><i>${protoName(p.klass)} ${dirArrow(p.dir)}</i></small><b>${p.uni == null ? '–' : p.uni}</b><span class="pp-nm">${esc(p.name)}</span></button>`;
  }
  function ndDetail(dc, inst, i, car){
    const key = ndKey(dc, inst, i); if(!S.sel || S.sel.key !== key) return '';
    const p = ndPorts(dc, inst, i, car).find(x => x.n === S.sel.port); if(!p) return '';
    return `<div class="pp-detail" data-ppdet-nd="${i}"><b>DMX ${p.n}</b>
      <label>Universe<input data-ppuni type="number" min="0" max="63999" value="${p.uni ?? ''}" style="width:90px"></label>
      <label>${t('Name', 'Naam')}<input data-ppname value="${esc(p.manualName ? p.name : '')}" placeholder="${esc(p.autoName)}" maxlength="64" style="width:210px"></label>
      <label>${t('Protocol', 'Protocol')}<select data-ppklass><option value="">${t('Default', 'Standaard')} (${protoName(dmxDef().klass)})</option><option value="sacn" ${p.manualKlass && p.klass === 'sacn' ? 'selected' : ''}>sACN</option><option value="artnet" ${p.manualKlass && p.klass === 'artnet' ? 'selected' : ''}>Art-Net</option></select></label>
      <label>${t('Direction', 'Richting')}<select data-ppdir><option value="">${t('Default', 'Standaard')} (${(DIRS().find(d => d[0] === dmxDef().dir)?.[1] || '').split(' — ')[0]})</option>${DIRS().map(([v, l]) => `<option value="${v}" ${p.manualDir && p.dir === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="sm ghost" data-ppreset>${t('Reset this port', 'Poort terugzetten')}</button>
      <div class="su-warn" data-ppwarn style="flex:1 0 100%;display:none"></div></div>`;
  }
  // a port that the racks have taken over while it had settings of its own: stays on screen until you click OK
  const takeoverNotes = (inst, i) => (inst.takeovers || []).map((x, k) => `<div class="su-warn">${I('alert', 13)} <span>${esc(t(`Port ${x.port} is now used by ${x.by}: your own settings (${wasText(x.was)}) are replaced by the name and function of the LK.`, `Poort ${x.port} wordt nu gebruikt door ${x.by}: jouw eigen instelling (${wasText(x.was)}) is vervangen door de naam en functie van de LK.`))}</span> <button class="sm ghost" data-pptake="${i}:${k}">OK</button></div>`).join('');
  function ndBlock(dc, inst, i, car){
    const key = ndKey(dc, inst, i), ports = ndPorts(dc, inst, i, car);
    return `<div class="pp-sw" data-ppkey="${esc(key)}"><div class="pp-head"><b>${esc(inst.id || `Node ${i + 1}`)}</b><span class="subtle">${esc(inst.name || '')}</span><span style="flex:1"></span>
      <button class="sm" data-ppndcopy="${i}">${I('copy', 13)} ${t('Copy to other nodes…', 'Naar andere nodes kopiëren…')}</button>
      <button class="sm ghost" data-ppndnames="${i}">${t('Automatic names', 'Automatische namen')}</button></div>${takeoverNotes(inst, i)}
      <div class="pp-grid">${ports.map(p => ndTile(dc, inst, i, p)).join('')}</div>${ndDetail(dc, inst, i, car)}${namesList(ndKey(dc, inst, i), t('DMX port names as a list', 'DMX-poortnamen als lijst'), `data-ppnnode="${i}"`, ports.map(p => ({ n:p.n, label:`DMX ${p.n}`, info:p.uni == null ? '' : `U${p.uni}`, name:p.manualName ? p.name : '', auto:p.autoName, attr:'data-ppnn', max:64 })))}</div>`;
  }
  // the show-wide default of every DMX port; a port can have its own choice (click it)
  function ndDefaults(){
    const d = dmxDef();
    return `<div class="pp-bar pp-defaults"><b>${t('Every DMX port, unless it has its own choice', 'Elke DMX-poort, tenzij hij een eigen keuze heeft')}:</b>
      <label>${t('Protocol', 'Protocol')}<select data-ppdefklass><option value="sacn" ${d.klass === 'sacn' ? 'selected' : ''}>sACN</option><option value="artnet" ${d.klass === 'artnet' ? 'selected' : ''}>Art-Net</option></select></label>
      <label>${t('Direction', 'Richting')}<select data-ppdefdir>${DIRS().map(([v, l]) => `<option value="${v}" ${d.dir === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="subtle">${t('Click a port below to give just that port its own protocol or direction.', 'Klik hieronder op een poort om alleen die poort een eigen protocol of richting te geven.')}</span></div>`;
  }

  // A list of every port with a field for its name (empty = the automatic name, which is the placeholder). rows: [{ n, label, info, name, auto, attr, max, off }]
  const namesOpen = new Set();
  function namesList(key, title, attrs, rows){
    return `<details class="pp-names" data-ppnl="${esc(key)}" ${namesOpen.has(key) ? 'open' : ''} ${attrs}><summary>${esc(title)}</summary><table class="data-table pp-names-t"><tbody>${rows.map(r => `<tr><td class="pp-nl-n">${esc(r.label)}</td><td class="subtle">${esc(r.info || '')}</td><td><input ${r.attr}="${r.n}" value="${esc(r.name)}" placeholder="${esc(r.auto)}" maxlength="${r.max}" ${r.off ? 'disabled' : ''}></td></tr>`).join('')}</tbody></table></details>`;
  }

  // ---- the cards ----
  // VLAN, trunk, name, PoE and speed per switch port (the Switches tab)
  function switchesHtml(dc){
    if(!F() || !window.NetSwitches) return '';
    const sws = window.NetSwitches.list(dc);
    const swBody = sws.length ? `${brushBar(dc)}${sws.map(s => swBlock(dc, s)).join('')}` : `<div class="subtle" style="padding:6px 0">${t('Add a switch below first; then you can set its ports here.', 'Voeg eerst hieronder een switch toe; dan stel je hier zijn poorten in.')}</div>`;
    return App.ui.card({ key:`${dc}:ppsw`, title:t('Switch ports: VLAN and names', 'Switchpoorten: VLAN en namen'), icon:'switchDev', meta:t('prepare before you go on site', 'voorbereiden vóór je op locatie bent'), collapsible:false,
      body:`<div class="pp" style="padding:4px 14px 12px"><div class="hint" style="margin-bottom:8px">${I('info', 13)} ${t('Set the VLAN of every port in advance. Ports without a choice follow the plan: a node port follows the VLAN of the node, a port with two VLANs becomes a trunk. Later, “Fill in from the plan” on the Network config page puts all this on the real switch.', 'Stel van tevoren het VLAN van elke poort in. Poorten zonder keuze volgen het plan: een nodepoort volgt het VLAN van de node, een poort met twee VLAN’s wordt een trunk. Later zet “Invullen vanuit plan” op de pagina Netwerkconfig dit alles op de echte switch.')}</div>${swBody}</div>` });
  }
  // the patch board with the list of connections below it
  function boardCard(dc){
    if(!F() || !window.NetSwitches) return '';
    return `<div class="pb" data-pbroot="${esc(dc)}">${boardHtml(dc)}</div>${connectionsCard(dc)}`;
  }
  function nodesCard(dc){
    const nodes = App.net.getDimPlan(dc).nodes || [];
    return nodes.length ? App.ui.card({ key:`${dc}:ppnd`, title:t('Node ports: universes, protocol and direction', 'Nodepoorten: universes, protocol en richting'), icon:'network', meta:`${nodes.length} nodes`, collapsible:true, collapsed:false,
      body:`<div class="pp" style="padding:4px 14px 12px">${ndDefaults()}${(() => { const car = carOf(dc); return nodes.map((n, i) => ndBlock(dc, n, i, car)).join(''); })()}</div>` }) : '';
  }
  const html = dc => boardCard(dc) + switchesHtml(dc) + nodesCard(dc);

  // ---- events ----
  // painting needs a VLAN (or Trunk / Automatic) picked in the bar; PoE and speed in the bar are painted along with it
  function apply(dc, s, n){
    const br = S.swBrush, x = S.swExtra; if(!br) return false;
    if(window.NetSwitches.linkAt(dc, s.label, n)) return false;
    const key = swKey(dc, s.label), e = put(key, n);
    if(br.clear){ delete e.vid; delete e.trunk; } else if(br.trunk){ e.trunk = true; delete e.vid; } else { e.vid = br.vid; delete e.trunk; }
    if(x.poe) e.poe = x.poe; if(x.speed) e.speed = x.speed;
    prune(key); dirty(); return true;
  }
  // the mouse button goes up (anywhere, or outside the window): the row of ports you were painting ends. One listener for the whole page, that never runs out.
  const endDrag = () => { if(S.drag){ S.drag = null; S.rerender?.(); } };
  document.addEventListener('mousedown', () => { S.down = true; }, true);
  document.addEventListener('mouseup', () => { S.down = false; }, true);
  document.addEventListener('mouseup', endDrag, true); window.addEventListener('blur', () => { S.down = false; endDrag(); });
  function bind(root, dc, rerender){
    if(!root.querySelector('[data-ppkey], [data-ppb], [data-pbroot], [data-ppcrow]')) return;
    S.rerender = rerender;
    const sw = l => (window.NetSwitches.list(dc) || []).find(s => s.label === l);
    // one tile drawn again (a tile that was painted, or a panel that changed its port); the new tile gets its mouse handlers too
    const redrawTile = el => {
      let html;
      if(el.dataset.ppsw){ const s = sw(el.dataset.ppsw), p = swPorts(dc, s).find(x => x.n === Number(el.dataset.pport)); html = swTile(dc, s, p); }
      else { const i = Number(el.dataset.ppnd), inst = App.net.getDimPlan(dc).nodes[i], p = ndPorts(dc, inst, i).find(x => x.n === Number(el.dataset.pport)); html = ndTile(dc, inst, i, p); }
      const tmp = document.createElement('div'); tmp.innerHTML = html; const nu = tmp.firstElementChild; el.replaceWith(nu); wireTile(nu); return nu;
    };
    const tileOf = (attr, id, n) => [...root.querySelectorAll('.pp-port')].find(x => x.dataset[attr] === String(id) && Number(x.dataset.pport) === n);
    // A panel (one port): a change is saved and shown on the tile at once, and the panel stays as it is, so you can go from field to field.
    // The page is rebuilt when you are done with the panel (the focus leaves it; a click on a button still lands first).
    const panelDone = box => box.addEventListener('focusout', ev => {
      if(!box.dataset.dirty || box.contains(ev.relatedTarget)) return;
      const go = () => { if(box.isConnected && !box.contains(document.activeElement) && document.hasFocus()) rerender(); };
      if(S.down) document.addEventListener('mouseup', () => setTimeout(go, 0), { once:true }); else setTimeout(go, 0);
    });
    root.querySelectorAll('[data-ppb]').forEach(b => b.onclick = () => { const k = b.dataset.ppb; S.swBrush = S.swBrush && ((k === 'vid' && S.swBrush.vid === Number(b.dataset.vid)) || (k === 'trunk' && S.swBrush.trunk) || (k === 'clear' && S.swBrush.clear)) ? null : k === 'vid' ? { vid:Number(b.dataset.vid) } : k === 'trunk' ? { trunk:true } : { clear:true }; rerender(); });
    const xp = root.querySelector('[data-ppxpoe]'); if(xp){ xp.onchange = () => { S.swExtra.poe = xp.value; }; root.querySelector('[data-ppxspeed]').onchange = e => { S.swExtra.speed = e.target.value; }; }
    const more = root.querySelector('[data-ppmore]'); if(more) more.onchange = () => { if(more.value){ S.extra.add(Number(more.value)); S.swBrush = { vid:Number(more.value) }; } rerender(); };
    // ports: with a VLAN picked in the bar a click paints the port, and dragging with the button held down paints a row of ports.
    // Moving over ports never paints. Without a VLAN a click selects the port (its own panel opens) and a double-click types a name.
    const wireTile = el => {
      const isSw = !!el.dataset.ppsw;
      const painting = () => isSw && !!S.swBrush;
      const selKey = () => isSw ? swKey(dc, el.dataset.ppsw) : ndKey(dc, App.net.getDimPlan(dc).nodes[Number(el.dataset.ppnd)], Number(el.dataset.ppnd));
      const paint = () => { const s = isSw && sw(el.dataset.ppsw); if(s && apply(dc, s, Number(el.dataset.pport))){ redrawTile(el); return true; } return false; };
      el.onmousedown = ev => { if(ev.button !== 0 || !painting()) return; ev.preventDefault(); if(paint()){ S.drag = 'sw'; S.sel = null; } };
      el.onclick = () => { if(painting() || S.drag) return; const key = selKey(), n = Number(el.dataset.pport); S.sel = S.sel && S.sel.key === key && S.sel.port === n ? null : { key, port:n }; rerender(); };
      el.onmouseenter = ev => { if(!S.drag) return; if(!(ev.buttons & 1)){ endDrag(); return; } if(isSw && S.drag === 'sw') paint(); };
      el.ondblclick = ev => { ev.preventDefault(); inlineEdit(el); };
    };
    root.querySelectorAll('.pp-port').forEach(wireTile);
    // ---- names: double-click a port to type its name there and then; the lists hold every port ----
    const inlineEdit = el => {
      const isSw = !!el.dataset.ppsw, n = Number(el.dataset.pport); let key, cur, auto, max;
      if(isSw){ const s = sw(el.dataset.ppsw), p = s && swPorts(dc, s).find(x => x.n === n); if(!p || p.link) return; key = swKey(dc, s.label); cur = p.manualName ? p.name : ''; auto = p.autoName; max = 16; }
      else { const i = Number(el.dataset.ppnd), inst = App.net.getDimPlan(dc).nodes[i], p = inst && ndPorts(dc, inst, i).find(x => x.n === n); if(!p) return; key = ndKey(dc, inst, i); cur = p.manualName ? p.name : ''; auto = p.autoName; max = 64; }
      const r = el.getBoundingClientRect(), inp = document.createElement('input'); let done = false;
      inp.className = 'pp-inline'; inp.value = cur; inp.placeholder = auto; inp.maxLength = max; inp.title = t('Enter = save · Esc = cancel · empty = the automatic name', 'Enter = opslaan · Esc = annuleren · leeg = de automatische naam');
      Object.assign(inp.style, { position:'fixed', left:`${Math.round(r.left)}px`, top:`${Math.round(r.bottom - 30)}px`, width:`${Math.round(Math.max(r.width, 170))}px`, zIndex:'9999' });
      document.body.appendChild(inp); inp.focus(); inp.select();
      const finish = save => { if(done) return; done = true; const v = inp.value.trim().slice(0, max); inp.remove(); if(!save) return; window.PatchHistory?.label?.(`${dc}: port name`); const o = put(key, n); if(v) o.name = v; else delete o.name; prune(key); dirty(); rerender(); };
      inp.onkeydown = e => { e.stopPropagation(); if(e.key === 'Enter'){ e.preventDefault(); finish(true); } else if(e.key === 'Escape'){ e.preventDefault(); finish(false); } };
      inp.onblur = () => finish(true);
    };
    root.querySelectorAll('.pp-names').forEach(d => {
      d.ontoggle = () => { if(d.open) namesOpen.add(d.dataset.ppnl); else namesOpen.delete(d.dataset.ppnl); };
      d.querySelectorAll('[data-ppnm]').forEach(inp => inp.onchange = () => { const s = sw(d.dataset.ppnsw); if(!s) return; const key = swKey(dc, s.label), n = Number(inp.dataset.ppnm), v = inp.value.trim().slice(0, 16), o = put(key, n); if(v) o.name = v; else delete o.name; prune(key); dirty(); rerender(); });
      d.querySelectorAll('[data-ppnn]').forEach(inp => inp.onchange = () => { const i = Number(d.dataset.ppnnode), inst = App.net.getDimPlan(dc).nodes[i]; if(!inst) return; const key = ndKey(dc, inst, i), n = Number(inp.dataset.ppnn), v = inp.value.trim().slice(0, 64), o = put(key, n); if(v) o.name = v; else delete o.name; prune(key); dirty(); rerender(); });
    });
    // ---- the patch board ----
    const pb = root.querySelector('[data-pbroot]');
    if(pb){
      const portsAt = el => ({ sw:el.dataset.pbsw, port:Number(el.dataset.pbport) });
      const doPlace = (key, el) => {
        const { sw, port } = portsAt(el), before = baseRows(dc).find(r => r.sw === sw && r.swPort === port && r.key !== key);
        window.PatchHistory?.label?.(`${dc}: device on ${sw} port ${port}`);
        const r = place(dc, key, sw, port); S.armed = null;
        if(!r){ App.ui.toast(t('That port cannot be used (it is part of a switch link)', 'Die poort kan niet gebruikt worden (hij hoort bij een switchkoppeling)'), 'info'); return; }
        if(before) App.ui.toast(`${before.device} ${t('went back to the tray', 'is terug in de bak gezet')}`, 'info');
        rerender();
      };
      pb.querySelectorAll('[data-pbdev]').forEach(el => {
        el.ondragstart = ev => { S.dragDev = el.dataset.pbdev; S.armed = null; el.classList.add('dragging'); pb.classList.add('dragging'); try { ev.dataTransfer.setData('text/plain', S.dragDev); ev.dataTransfer.effectAllowed = 'move'; } catch {} };
        el.ondragend = () => { S.dragDev = null; el.classList.remove('dragging'); pb.classList.remove('dragging'); pb.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); };
        el.onclick = ev => { ev.stopPropagation(); S.armed = S.armed === el.dataset.pbdev ? null : el.dataset.pbdev; rerender(); };
      });
      // a link (trunk) can be picked up and put on another port of the same switch
      const doMoveLink = el => {
        const [id, sw0, from] = String(S.dragLink || '').split('|'); S.dragLink = null; if(!id) return;
        const { sw, port } = portsAt(el);
        if(sw !== sw0){ App.ui.toast(t('A link end can only move to another port of the same switch', 'Een koppeling kan alleen naar een andere poort van dezelfde switch'), 'info'); return; }
        const before = baseRows(dc).find(r => r.sw === sw && r.swPort === port);
        window.PatchHistory?.label?.(`${dc}: link moved to ${sw} port ${port}`);
        const err = window.NetSwitches.moveLinkEnd(id, dc, sw, Number(from), port);
        if(err){ App.ui.toast(t(err, err), 'err'); return; }
        if(before) App.ui.toast(`${before.device} ${t('went back to the tray', 'is terug in de bak gezet')}`, 'info');
        rerender();
      };
      pb.querySelectorAll('[data-pblink]').forEach(el => {
        el.ondragstart = ev => { S.dragLink = el.dataset.pblink; S.dragDev = null; S.armed = null; el.classList.add('dragging'); pb.classList.add('dragging'); try { ev.dataTransfer.setData('text/plain', 'link'); ev.dataTransfer.effectAllowed = 'move'; } catch {} };
        el.ondragend = () => { S.dragLink = null; el.classList.remove('dragging'); pb.classList.remove('dragging'); pb.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); };
      });
      pb.querySelectorAll('.pb-port:not(.sfp)').forEach(el => {
        el.ondragover = ev => { if(S.dragLink){ if(el.classList.contains('link')) return; ev.preventDefault(); el.classList.add('drop'); return; } if(!S.dragDev || el.classList.contains('link')) return; ev.preventDefault(); el.classList.add('drop'); };
        el.ondragleave = () => el.classList.remove('drop');
        el.ondrop = ev => { ev.preventDefault(); el.classList.remove('drop'); if(S.dragLink){ if(!el.classList.contains('link')) doMoveLink(el); else S.dragLink = null; return; } const k = S.dragDev; S.dragDev = null; if(k && !el.classList.contains('link')) doPlace(k, el); };
        el.onclick = () => { if(S.armed && !el.classList.contains('link')) doPlace(S.armed, el); };
      });
      const tray = pb.querySelector('[data-pbtray]');
      if(tray){ tray.ondragover = ev => { if(S.dragDev){ ev.preventDefault(); tray.classList.add('drop'); } }; tray.ondragleave = () => tray.classList.remove('drop');
        tray.ondrop = ev => { ev.preventDefault(); tray.classList.remove('drop'); const k = S.dragDev; S.dragDev = null; if(k){ window.PatchHistory?.label?.(`${dc}: device off its port`); unplace(dc, k); rerender(); } };
        tray.onclick = ev => { if(S.armed && !ev.target.closest('[data-pbdev]')){ unplace(dc, S.armed); S.armed = null; rerender(); } }; }
      const fillB = pb.querySelector('[data-pbfill]'); if(fillB) fillB.onclick = () => fillDialog(dc, rerender);
      const clr = pb.querySelector('[data-pbclear]'); if(clr) clr.onclick = async () => {
        const ok = await App.ui.confirmDialog({ title:t('Take every device off its port?', 'Elk apparaat van zijn poort halen?'), message:t('All devices go back to the tray; the ports are empty. VLAN settings of the ports stay.', 'Alle apparaten gaan terug in de bak; de poorten zijn leeg. De VLAN-instellingen van de poorten blijven.'), okLabel:t('Take all off', 'Alles eraf halen') });
        if(!ok) return; window.PatchHistory?.label?.(`${dc}: all devices off their ports`); unplaceAll(dc); rerender();
      };
      pb.querySelectorAll('[data-pblinkdlg]').forEach(b => b.onclick = () => linkDialog(dc, b.dataset.pblinkdlg, rerender));
      pb.querySelectorAll('[data-pbunlink]').forEach(b => b.onclick = () => { window.PatchHistory?.label?.(`${dc}: switch link removed`); window.NetSwitches.removeLink(b.dataset.pbunlink); rerender(); });
      const al = pb.querySelector('[data-pbautolink]'); if(al) al.onclick = () => { window.PatchHistory?.label?.(`${dc}: switches linked`); const n = window.NetSwitches.autoLink(dc); App.ui.toast(n ? `${n} ${t('switch links made', 'switchkoppelingen gemaakt')}` : t('The switches are linked already', 'De switches zijn al gekoppeld'), n ? 'ok' : 'info'); rerender(); };
      pb.querySelectorAll('[data-nettab]').forEach(b => b.onclick = () => window.NetworkPage?.go?.(b.dataset.nettab));
    }
    root.querySelectorAll('[data-ppcrow]').forEach(tr => {
      const key = tr.dataset.ppcrow, ssw = tr.querySelector('[data-ppcsw]'), sp = tr.querySelector('[data-ppcport]'), un = tr.querySelector('[data-ppcun]');
      const free = label => { const s = sw(label), taken = new Set([...baseRows(dc).filter(r => r.sw === label && r.key !== key).map(r => r.swPort), ...window.NetSwitches.linksOf(dc).filter(l => l.sw === label).map(l => l.port)]); for(let n = 1; s && n <= s.rj; n++) if(!taken.has(n)) return n; return null; };
      ssw.onchange = () => { if(!ssw.value){ unplace(dc, key); } else { const n = free(ssw.value); if(n == null){ App.ui.toast(t('That switch has no free port', 'Die switch heeft geen vrije poort'), 'info'); } else place(dc, key, ssw.value, n); } rerender(); };
      if(sp) sp.onchange = () => { place(dc, key, ssw.value, Number(sp.value)); rerender(); };
      if(un) un.onclick = () => { unplace(dc, key); rerender(); };
    });
    // detail of a switch port (a change is shown on the tile at once; see panelDone)
    root.querySelectorAll('[data-ppdet]').forEach(box => {
      const s = sw(box.dataset.ppdet), key = swKey(dc, s.label), n = S.sel.port;
      const changed = () => { box.dataset.dirty = '1'; dirty(); const el = tileOf('ppsw', s.label, n); if(el) redrawTile(el); };
      box.querySelector('[data-ppname]').onchange = e => { const v = e.target.value.trim().slice(0, 16); const o = put(key, n); if(v) o.name = v; else delete o.name; prune(key); changed(); };
      box.querySelector('[data-ppvlan]').onchange = e => { const o = put(key, n), v = e.target.value; delete o.vid; delete o.trunk; if(v === 'trunk') o.trunk = true; else if(v) o.vid = Number(v); prune(key); changed(); };
      box.querySelector('[data-ppoe]').onchange = e => { const o = put(key, n); if(e.target.value) o.poe = e.target.value; else delete o.poe; prune(key); changed(); };
      box.querySelector('[data-ppspeed]').onchange = e => { const o = put(key, n); if(e.target.value) o.speed = e.target.value; else delete o.speed; prune(key); changed(); };
      box.querySelector('[data-ppreset]').onclick = () => { delete store()[key]?.ports[n]; prune(key); dirty(); rerender(); };
      panelDone(box);
    });
    root.querySelectorAll('[data-ppcopy]').forEach(b => b.onclick = () => copySwitchDialog(dc, sw(b.dataset.ppcopy), rerender));
    root.querySelectorAll('[data-ppndcopy]').forEach(b => b.onclick = () => copyNodeDialog(dc, Number(b.dataset.ppndcopy), rerender));
    root.querySelectorAll('[data-ppnames]').forEach(b => b.onclick = () => { const key = swKey(dc, b.dataset.ppnames), e = store()[key]; if(e){ for(const v of Object.values(e.ports)) delete v.name; prune(key); dirty(); } rerender(); });
    root.querySelectorAll('[data-ppresetall]').forEach(b => b.onclick = () => { delete store()[swKey(dc, b.dataset.ppresetall)]; dirty(); rerender(); });
    // nodes
    const q = s => root.querySelector(s);
    if(q('[data-ppdefklass]')){
      q('[data-ppdefklass]').onchange = e => { const pr = M().networkDevices.prefs; (pr.dmx ||= {}).klass = e.target.value === 'artnet' ? 'artnet' : 'sacn'; window.PatchHistory?.label?.('DMX default protocol'); dirty(); rerender(); };
      q('[data-ppdefdir]').onchange = e => { const pr = M().networkDevices.prefs; (pr.dmx ||= {}).dir = ['output', 'input', 'idle'].includes(e.target.value) ? e.target.value : 'output'; window.PatchHistory?.label?.('DMX default direction'); dirty(); rerender(); };
    }
    // detail of a DMX port of a node: every port has its own universe, name, protocol and direction.
    // A port the racks use (an LK line is on it) keeps the universe of that line; trying to change it gives a warning.
    root.querySelectorAll('[data-ppdet-nd]').forEach(box => {
      const i = Number(box.dataset.ppdetNd), inst = App.net.getDimPlan(dc).nodes[i], key = ndKey(dc, inst, i), n = S.sel.port;
      const changed = () => { box.dataset.dirty = '1'; dirty(); const el = tileOf('ppnd', i, n); if(el) redrawTile(el); };
      box.querySelector('[data-ppuni]').onchange = e => {
        const p = ndPorts(dc, inst, i).find(x => x.n === n); if(!p) return;
        if(p.use){
          e.target.value = p.uni ?? '';
          const w = box.querySelector('[data-ppwarn]');
          w.innerHTML = `${I('alert', 13)} <span>${esc(t(`Port ${n} is used by ${p.use.by} (universe ${p.uni}). That universe comes from the CSV / the LK and cannot be changed here — change it in the CSV or in the patch.`, `Poort ${n} wordt gebruikt door ${p.use.by} (universe ${p.uni}). Dat universe komt uit de CSV / de LK en kan hier niet aangepast worden — pas het aan in de CSV of in de patch.`))}</span>`;
          w.style.display = ''; return;
        }
        setNodeUniverse(inst, n, e.target.value === '' ? null : Math.max(0, Math.min(63999, Math.round(Number(e.target.value))))); changed();
      };
      box.querySelector('[data-ppname]').onchange = e => { const v = e.target.value.trim().slice(0, 64), o = put(key, n); if(v) o.name = v; else delete o.name; prune(key); changed(); };
      box.querySelector('[data-ppklass]').onchange = e => { const o = put(key, n); if(e.target.value) o.klass = e.target.value; else delete o.klass; prune(key); changed(); };
      box.querySelector('[data-ppdir]').onchange = e => { const o = put(key, n); if(e.target.value) o.dir = e.target.value; else delete o.dir; prune(key); changed(); };
      box.querySelector('[data-ppreset]').onclick = () => { delete store()[key]?.ports[n]; prune(key); if(inst.src && inst.manualUni?.[n] != null) setNodeUniverse(inst, n, null); dirty(); rerender(); };
      panelDone(box);
    });
    root.querySelectorAll('[data-pptake]').forEach(b => b.onclick = () => {
      const [i, k] = b.dataset.pptake.split(':').map(Number), inst = App.net.getDimPlan(dc).nodes[i];
      if(inst?.takeovers){ inst.takeovers.splice(k, 1); if(!inst.takeovers.length) delete inst.takeovers; dirty(); }
      rerender();
    });
    root.querySelectorAll('[data-ppndnames]').forEach(b => b.onclick = () => { const i = Number(b.dataset.ppndnames), key = ndKey(dc, App.net.getDimPlan(dc).nodes[i], i), e = store()[key]; if(e){ for(const v of Object.values(e.ports)) delete v.name; prune(key); dirty(); } rerender(); });
  }


  // ---- copy the port settings of one switch / node to others ----
  const allSwitches = () => App.sortedDims().flatMap(d => (window.NetSwitches?.list(d) || []).map(s => ({ dc:d, s })));
  const allNodes = () => App.sortedDims().flatMap(d => (App.net.getDimPlan(d).nodes || []).map((inst, i) => ({ dc:d, inst, i })));
  function copySwitchDialog(dc, src, rerender){
    if(!src) return;
    const others = allSwitches().filter(x => !(x.dc === dc && x.s.label === src.label));
    if(!others.length){ App.ui.toast(t('There is no other switch', 'Er is geen andere switch'), 'info'); return; }
    const opt = (id, on, label, hint = '') => `<label class="nc-chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    const dlg = App.ui.openDialog({ title:t('Copy the port settings to other switches', 'Kopieer de poortinstellingen naar andere switches'), subtitle:src.label, width:'700px', body:`<div class="nc-copy">
        <div class="nc-cp-col"><div class="nc-cp-h">${t('What', 'Wat')}</div><div class="nc-cp-opts">
          ${opt('cpVlan', true, t('VLAN / trunk of every port', 'VLAN / trunk van elke poort'))}
          ${opt('cpExtra', true, t('PoE and speed', 'PoE en snelheid'))}
          ${opt('cpNames', false, t('Port names typed by hand', 'Poortnamen die je met de hand typte'), t('Off: every switch keeps its own names, because they differ with network cables and nodes.', 'Uit: elke switch houdt zijn eigen namen, want die verschillen door netwerkkabels en nodes.'))}
          ${opt('cpSfp', false, t('The SFP / fibre ports too', 'Ook de SFP- / fiberpoorten'))}
          ${opt('cpMan', false, t('Only the ports I changed by hand', 'Alleen de poorten die ik met de hand veranderde'))}</div></div>
        <div class="nc-cp-col"><div class="nc-cp-h">${t('To', 'Naar')} <span class="nc-cp-btns"><button id="cpAll">${t('all', 'alle')}</button><button id="cpNone">${t('none', 'geen')}</button></span></div>
          <div class="nc-cp-list">${others.map((x, i) => `<label class="nc-chk"><input type="checkbox" data-cptg="${i}" checked><span><b>${esc(x.s.label)}</b></span><span class="subtle">${esc(x.dc)} · ${x.s.rj} RJ45${x.s.sfp ? ` + ${x.s.sfp} SFP` : ''}</span></label>`).join('')}</div></div>
        <div class="subtle nc-cp-note">${t('Nothing is sent. This only fills the plan of those switches; you can still change every port.', 'Er wordt niets gestuurd. Dit vult alleen het plan van die switches; je kunt elke poort nog aanpassen.')}</div></div>`,
      footer:`<button class="primary" data-a="go">${t('Copy', 'Kopiëren')}</button><button data-a="x">${t('Cancel', 'Annuleren')}</button>` });
    const q = x => dlg.body.querySelector(x), qa = x => [...dlg.body.querySelectorAll(x)];
    q('#cpAll').onclick = () => qa('[data-cptg]').forEach(c => { c.checked = true; }); q('#cpNone').onclick = () => qa('[data-cptg]').forEach(c => { c.checked = false; });
    dlg.footer.querySelector('[data-a=x]').onclick = () => dlg.close();
    dlg.footer.querySelector('[data-a=go]').onclick = () => {
      const o = { vlan:q('#cpVlan').checked, extra:q('#cpExtra').checked, names:q('#cpNames').checked, sfp:q('#cpSfp').checked, man:q('#cpMan').checked };
      const targets = qa('[data-cptg]').filter(c => c.checked).map(c => others[Number(c.dataset.cptg)]);
      if(!targets.length){ App.ui.toast(t('Pick at least one switch', 'Kies minstens één switch'), 'info'); return; }
      const n = copySwitch(dc, src, targets, o); dlg.close(); rerender();
      App.ui.toast(`${n} ${t('ports filled on', 'poorten ingevuld op')} ${targets.length} ${t('switches', 'switches')}`, 'ok');
    };
  }
  function copySwitch(dc, src, targets, o){
    const mine = swPorts(dc, src).filter(p => (o.sfp || p.kind === 'rj') && (!o.man || p.manualVlan || p.manualName || p.manualExtra)); let n = 0;
    for(const tg of targets){
      const tp = new Map(swPorts(tg.dc, tg.s).map(p => [p.kind === 'sfp' ? 'f' + p.n : p.n, p])), key = swKey(tg.dc, tg.s.label);
      for(const p of mine){
        const t2 = tp.get(p.kind === 'sfp' ? 'f' + p.n : p.n); if(!t2) continue; let hit = false; const e = put(key, p.n);
        if(o.vlan){ if(p.trunk && !t2.trunk){ e.trunk = true; delete e.vid; hit = true; } else if(!p.trunk && p.vid != null && (t2.trunk || t2.vid !== p.vid)){ e.vid = p.vid; delete e.trunk; hit = true; } }
        if(o.extra){ if(p.poe){ e.poe = p.poe; hit = true; } if(p.speed){ e.speed = p.speed; hit = true; } }
        if(o.names && p.manualName){ e.name = p.name; hit = true; }
        if(hit) n++;
      }
      prune(key);
    }
    dirty(); return n;
  }
  function copyNodeDialog(dc, idx, rerender){
    const src = App.net.getDimPlan(dc).nodes[idx]; if(!src) return;
    const others = allNodes().filter(x => !(x.dc === dc && x.i === idx));
    if(!others.length){ App.ui.toast(t('There is no other node', 'Er is geen andere node'), 'info'); return; }
    const opt = (id, on, label, hint = '') => `<label class="nc-chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    const dlg = App.ui.openDialog({ title:t('Copy the port settings to other nodes', 'Kopieer de poortinstellingen naar andere nodes'), subtitle:src.id || `Node ${idx + 1}`, width:'700px', body:`<div class="nc-copy">
        <div class="nc-cp-col"><div class="nc-cp-h">${t('What', 'Wat')}</div><div class="nc-cp-opts">
          ${opt('cpProto', true, t('Protocol (sACN / Art-Net) and direction of every port', 'Protocol (sACN / Art-Net) en richting van elke poort'))}
          ${opt('cpNames', false, t('Port names typed by hand', 'Poortnamen die je met de hand typte'), t('Off: the automatic names stay.', 'Uit: de automatische namen blijven.'))}
          ${opt('cpUni', false, t('The universes too', 'Ook de universes'), t('The same numbers on the other nodes (not on ports an LK uses).', 'Dezelfde nummers op de andere nodes (niet op poorten die een LK gebruikt).'))}</div></div>
        <div class="nc-cp-col"><div class="nc-cp-h">${t('To', 'Naar')} <span class="nc-cp-btns"><button id="cpAll">${t('all', 'alle')}</button><button id="cpNone">${t('none', 'geen')}</button></span></div>
          <div class="nc-cp-list">${others.map((x, i) => `<label class="nc-chk"><input type="checkbox" data-cptg="${i}" checked><span><b>${esc(x.inst.id || `Node ${x.i + 1}`)}</b></span><span class="subtle">${esc(x.dc)}</span></label>`).join('')}</div></div>
        <div class="subtle nc-cp-note">${t('Nothing is sent. This only fills the plan of those nodes.', 'Er wordt niets gestuurd. Dit vult alleen het plan van die nodes.')}</div></div>`,
      footer:`<button class="primary" data-a="go">${t('Copy', 'Kopiëren')}</button><button data-a="x">${t('Cancel', 'Annuleren')}</button>` });
    const q = x => dlg.body.querySelector(x), qa = x => [...dlg.body.querySelectorAll(x)];
    q('#cpAll').onclick = () => qa('[data-cptg]').forEach(c => { c.checked = true; }); q('#cpNone').onclick = () => qa('[data-cptg]').forEach(c => { c.checked = false; });
    dlg.footer.querySelector('[data-a=x]').onclick = () => dlg.close();
    dlg.footer.querySelector('[data-a=go]').onclick = () => {
      const o = { proto:q('#cpProto').checked, names:q('#cpNames').checked, uni:q('#cpUni').checked };
      const targets = qa('[data-cptg]').filter(c => c.checked).map(c => others[Number(c.dataset.cptg)]);
      if(!targets.length){ App.ui.toast(t('Pick at least one node', 'Kies minstens één node'), 'info'); return; }
      const mine = ndPorts(dc, src, idx); let n = 0;
      for(const tg of targets){
        const key = ndKey(tg.dc, tg.inst, tg.i), tp = ndPorts(tg.dc, tg.inst, tg.i).length;
        for(const p of mine){ if(p.n > tp) continue; const e = put(key, p.n); let hit = false;
          if(o.proto){ if(p.manualKlass){ e.klass = p.klass; hit = true; } if(p.manualDir){ e.dir = p.dir; hit = true; } }
          if(o.names && p.manualName){ e.name = p.name; hit = true; }
          if(o.uni && p.uni != null){ const tpt = ndPorts(tg.dc, tg.inst, tg.i).find(x => x.n === p.n); if(tpt && !tpt.use){ setNodeUniverse(tg.inst, p.n, p.uni); hit = true; } }
          if(hit) n++; }
        prune(key);
      }
      dirty(); dlg.close(); rerender(); App.ui.toast(`${n} ${t('ports filled on', 'poorten ingevuld op')} ${targets.length} nodes`, 'ok');
    };
  }

  // ---- for the Network config page: what the plan wants on a switch / node, including the hand-made choices ----
  const forSwitch = (dc, label) => get(swKey(dc, label));
  const forNode = (dc, inst, i) => get(ndKey(dc, inst, i));
  window.PortPlan = { autoSwitchName, pipeOf, dmxDef, html, boardCard, boardHtml, switchesHtml, nodesCard, bind, state:S, patch, ensureV2, place, unplace, forget, unplaceAll, autoFill, fillDialog, forSwitch, forNode, swPorts, ndPorts, swKey, ndKey, takeOver, setNodeUniverse };
})();
