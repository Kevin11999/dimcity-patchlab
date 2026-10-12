// ui/labels.js — sticker sheets: Herma A4 label sheets (laser), content from the show, exact positions.
// The sheet geometry comes from the HERMA label templates ("Etiketten-Vorlage … blanko"): size of one
// label, number of columns and rows, margins and gaps. Printing goes through the PDF engine with a zero
// page margin, so every label sits where the template puts it. A calibration sheet (outlines only) lets
// you check that on a real sheet. Settings live in the project: MODEL.labels.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = (v, d) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
  const trim = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  // ---------- Sheets ----------
  // Values in mm, read from the vector drawing of the HERMA templates (rectangles are drawn half a stroke
  // inside the label edge: 48,26 × 25,4 mm with 8,48 mm left margin; 45,72 × 21,167 mm with 2,54 mm gap).
  // The 97 × 42,33 mm sheet (HERMA 4623 / 4669 / 5056 / 4228 / 8628): the rectangles of the template are 96,52 × 42,333 mm (2 columns × 6 rows, 8,48 mm from the left, 21,5 mm from the top).
  const SHEETS = [
    { id:'herma-48-3x25-4', brand:'HERMA', articles:['4680', '4690', '4102', '4112'], w:48.26, h:25.4, cols:4, rows:11, left:8.48, top:8.8, gapX:0, gapY:0, source:'HERMA label template 48,3 × 25,4 mm' },
    { id:'herma-45-7x21-2', brand:'HERMA', articles:['4097', '4232', '4221'], w:45.72, h:21.167, cols:4, rows:12, left:9.75, top:21.5, gapX:2.54, gapY:0, source:'HERMA label template 45,7 × 21,2 mm' },
    { id:'herma-97-42-3', brand:'HERMA', articles:['4623', '4669', '5056', '4228', '8628'], w:96.52, h:42.333, cols:2, rows:6, left:8.48, top:21.5, gapX:0, gapY:0, source:'HERMA label template 97 × 42,33 mm' }
  ];
  const DEFAULT_BIG = 'herma-97-42-3';      // node and switch stickers go on this sheet unless you choose another
  const customSheet = c => ({ id:'custom', brand:'', articles:[], w:num(c.w, 48.26), h:num(c.h, 25.4), cols:Math.max(1, num(c.cols, 4) | 0), rows:Math.max(1, num(c.rows, 11) | 0), left:num(c.left, 8.48), top:num(c.top, 8.8), gapX:num(c.gapX, 0), gapY:num(c.gapY, 0), source:'custom' });
  // sheets you made yourself: { id:'SHEET:01', name, w, h, cols, rows, left, top, gapX, gapY } — in the show (MODEL.labelSheets) and in the library of the app
  const savedSheets = () => { const m = M(); return Array.isArray(m?.labelSheets) ? m.labelSheets : []; };
  const asSheet = x => ({ id:x.id, brand:'', articles:[], name:String(x.name || x.id), w:num(x.w, 48.26), h:num(x.h, 25.4), cols:Math.max(1, num(x.cols, 1) | 0), rows:Math.max(1, num(x.rows, 1) | 0), left:num(x.left, 0), top:num(x.top, 0), gapX:num(x.gapX, 0), gapY:num(x.gapY, 0), source:'saved', saved:true });
  const allSheets = () => [...SHEETS, ...savedSheets().map(asSheet)];
  const sheetById = (id, L) => id === 'custom' ? customSheet(L?.custom || {}) : (allSheets().find(s => s.id === id) || null);
  // group 'big' = the sheet of the node and switch stickers, 'small' = the sheet of everything else
  const sheetOf = (L, group = 'small') => sheetById(group === 'big' ? L.sheetBig : L.sheet, L) || (group === 'big' ? SHEETS.find(s => s.id === DEFAULT_BIG) : SHEETS[0]);
  const fmt = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const sheetName = s => s.id === 'custom' ? t('Custom sheet', 'Eigen vel') : s.saved ? `${s.name} · ${fmt(s.w)} × ${fmt(s.h)} mm` : `${s.brand} ${s.articles.join(' / ')} · ${fmt(s.w)} × ${fmt(s.h)} mm`;
  const perSheet = s => s.cols * s.rows;

  function defaults(){
    return { sheet:SHEETS[0].id, sheetBig:DEFAULT_BIG, custom:{ w:48.26, h:25.4, cols:4, rows:11, left:8.48, top:8.8, gapX:0, gapY:0 },
      kinds:{ cables:true, strips:true, nodePorts:false, devices:true, qr:false, qrDb:false, qrSys:false, switchPorts:false, netCables:true, fibers:true, nodeStickers:true, switchStickers:true }, dcs:null, perDc:true, start:1, startBig:1, mono:false, outline:false,
      company:{ on:true, img:null }, show:{ on:true, img:null } };
  }
  function state(){
    const m = M(); const d = defaults();
    const L = m.labels && typeof m.labels === 'object' ? m.labels : (m.labels = d);
    for(const k of Object.keys(d)) if(L[k] === undefined) L[k] = d[k];
    L.kinds = { ...d.kinds, ...L.kinds }; L.custom = { ...d.custom, ...L.custom }; L.company = { ...d.company, ...L.company }; L.show = { ...d.show, ...L.show };
    return L;
  }

  // ---------- QR ----------
  function qrSvg(text){
    const qr = window.qrcode; if(!qr) return '';
    try {
      qr.stringToBytes = qr.stringToBytesFuncs?.['UTF-8'] || qr.stringToBytes;
      const q = qr(0, 'L'); q.addData(text); q.make();
      const n = q.getModuleCount(); let d = '';
      for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(q.isDark(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`;
      return `<svg viewBox="0 0 ${n + 2} ${n + 2}" shape-rendering="crispEdges" style="width:100%;height:100%;display:block"><rect width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    } catch { return ''; }
  }

  // ---------- Content ----------
  // what sits on a port of a node, as short text: "LK102.1" (LK 102, port 1), "V101.2", "S1 in" (a splitter), "CSV 601.1" (a line of the CSV)
  const srcText = p => !p ? '' : p.fixed ? `CSV ${String(p.to || '').replace(/^Node\s*/i, '')}` : String(p.to || `${p.owner || ''} ${p.ownerPort || ''}`).replace(/\s*·\s*/g, '.').trim();
  function itemsFor(dc, L){
    const m = M(), E = window.RackEngine; if(!E || !m.byDim?.get(dc)) return [];
    const P = E.computeRackPlan(m, dc), owners = E.ownerColors(P), out = [];
    const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';
    const rackName = ri => ri < 0 ? t('Loose', 'Los') : (P.racks[ri]?.placement.name || P.racks[ri]?.rack?.name || `Rack ${ri + 1}`);
    const feeders = id => [...new Set(P.lines.filter(l => l.owner === id && l.feed?.node).map(l => l.feed.node))];
    const dests = id => { const d = P.lines.filter(l => l.owner === id && l.dest).map(l => l.dest); return d.length ? `${trim(d[0], 22)}${d.length > 1 ? ` +${d.length - 1}` : ''}` : ''; };
    const sockets = [];   // { label, where, owner, kind }
    for(const g of P.groups){
      if(g.lk) sockets.push({ label:g.label, where:g.loose ? t('Loose LK spider', 'Losse LK-spin') : rackName(g.rack), owner:g.lk.id, kind:'LK' });
      for(const v of g.vims) if(v.used) sockets.push({ label:v.label, where:rackName(g.rack), owner:v.used.id, kind:'Veam' });
    }
    for(const v of P.soloVims) if(v.used) sockets.push({ label:v.label, where:v.loose ? t('Loose Veam4 spider', 'Losse Veam4-spin') : rackName(v.rack), owner:v.used.id, kind:'Veam' });
    const qrText = (id, extra) => {
      const rows = P.lines.filter(l => l.owner === id).slice(0, 8).map(l => `${l.label.split(' · ').pop()} U${l.universe} ${trim(l.dest, 18)}`.trim());
      return trim([`${id} · ${dc}`, extra, ...rows].filter(Boolean).join("\n"), 170);
    };
    if(L.kinds.cables){
      const done = new Set();
      for(const s of sockets){
        const n = feeders(s.owner); done.add(s.owner);
        out.push({ kind:'cable', dc, title:s.owner, sub:`${dc} · ${s.label}`, lines:[s.where, n.length ? `${t('Node', 'Node')} ${n.join(' + ')}` : ''].filter(Boolean), color:owners.get(s.owner), badge:n[0] || '', copies:2 });
      }
      for(const lk of m.byLK.values()){   // Veam cables between an LK slot and a Veam
        if(lk.dimcity !== dc) continue;
        for(const slot of [1, 2, 3]){ const vid = lk.veam?.[slot]; if(!vid || !m.byVeam.has(vid) || done.has(vid)) continue; done.add(vid);
          out.push({ kind:'cable', dc, title:vid, sub:`${dc} · ${lk.id} ${t('slot', 'slot')} ${'ABC'[slot - 1]}`, lines:[dests(vid)].filter(Boolean), color:owners.get(lk.id) || owners.get(vid), badge:'', copies:2 }); }
      }
    }
    if(L.kinds.strips) for(const s of sockets) out.push({ kind:'strip', dc, title:s.label, sub:`→ ${s.owner}`, lines:[s.where, dests(s.owner)].filter(Boolean), color:owners.get(s.owner), badge:feeders(s.owner)[0] || '', copies:1 });
    if(L.kinds.nodePorts) for(const n of P.nodes) n.ports.forEach((p, i) => { if(p) out.push({ kind:'port', dc, title:`${n.label} · ${i + 1}`, sub:`U${p.universe}`, lines:[`${p.owner} ${p.ownerPort === 'in' ? 'in' : p.ownerPort}`, trim(p.dest, 24)].filter(Boolean), color:owners.get(p.owner) || n.color, badge:n.label, copies:1 }); });
    if(L.kinds.devices){
      P.racks.forEach((R, ri) => { if(!R.rack) return; out.push({ kind:'device', dc, title:rackName(ri), sub:`${R.rack.heightU}U${R.rack.articleKey ? ` · ${R.rack.articleKey}` : ''}`, lines:[dc], color:'#475569', badge:'', copies:1 });
        let sw = 0; for(const it of (R.rack.items || [])) if(it.kind === 'switch'){ const ty = (m.networkDevices?.switchTypes || []).find(x => x.id === it.typeId); out.push({ kind:'device', dc, title:`SW${++sw}`, sub:typeName(ty), lines:[rackName(ri), dc], color:'#a78bfa', badge:'', copies:1 }); } });
      for(const n of P.nodes) out.push({ kind:'device', dc, title:n.label, sub:typeName(n.type), lines:[n.loose ? ((n.name || t('Loose node', 'Losse node')) + (n.field ? ` · ${t('elsewhere', 'elders')}` : '')) : rackName(n.rack), dc], color:n.color, badge:n.label, copies:1 });
      for(const s of P.splitters) out.push({ kind:'device', dc, title:s.label, sub:typeName(s.type), lines:[rackName(s.rack), dc], color:s.feedColor || '#35c47c', badge:'', copies:1 });
    }
    // a sticker on the node itself: ID, address, VLAN, the switch port, the universes and where it is — all taken from the network plan
    if(L.kinds.nodeStickers && window.IpPlan){
      const F = window.Fent, rows = window.FentUI?.portPlan?.(dc)?.rows || [], nodeTypes = m.networkDevices?.nodeTypes || [];
      const bits = mk => mk ? String(mk).split('.').reduce((n, x) => n + (Number(x) || 0).toString(2).replace(/0/g, '').length, 0) : 0;
      const vl = x => { const v = x.vlan != null ? F?.vlanById(x.vlan) : null; return v ? `${v.id} ${v.name}` : ''; };
      for(const d of window.IpPlan.all()){
        if(d.dc !== dc || d.kind !== 'node' || d.gone) continue;
        const inst = d.dev, pn = P.nodes.find(x => x.key === inst.src), ty = nodeTypes.find(x => x.id === inst.typeId);
        const ifs = d.ifs.filter(x => x.ip), pr = rows.filter(r => r.kind === 'node' && r.idx === d.idx && r.sw && r.swPort);
        const unis = Array.isArray(inst.universes) ? inst.universes.filter(u => u != null && u !== '' && Number.isFinite(Number(u))).map(Number) : [];
        const ip = ifs[0] ? `${ifs[0].ip}${ifs[0].mask ? ` /${bits(ifs[0].mask)}` : ''}` : t('no address yet', 'nog geen adres');
        const extra = ifs.slice(1).map(x => `${x.ip}${vl(x) ? ` ${vl(x).split(' ').slice(1).join(' ')}` : ''}`).join(' · ');
        const where = pn ? (pn.loose ? (pn.field ? (pn.name || t('Elsewhere', 'Elders')) : t('Loose', 'Los')) : rackName(pn.rack)) : '';
        // for a big label: every DMX port with its universe, direction, protocol and the LK / Veam port that sits on it, and the addresses with their VLAN colour
        const nps = window.PortPlan?.ndPorts ? window.PortPlan.ndPorts(dc, inst, d.idx) : [], dcl = App.dimLabel ? App.dimLabel(dc) : dc;
        const big = { kind:'node', id:d.label, type:ty ? typeName(ty) : '', short:window.ShortName ? window.ShortName.port(ty || {}) : '', where:`${dcl}${where ? ` · ${where}` : ''}`, color:pn?.color || '#94a3b8', def:window.PortPlan?.dmxDef?.() || { klass:'sacn', dir:'output' },
          ports:nps.map((p, j) => { const rp = pn?.ports?.[j] || null; return { n:p.n, uni:p.uni, dir:p.dir, klass:p.klass, src:srcText(rp), dest:rp ? String(rp.dest || '') : '', name:p.manualName ? p.name : '', color:rp ? (owners.get(rp.owner) || pn.color) : null }; }),
          nets:ifs.map(x => { const v = x.vlan != null ? F?.vlanById(x.vlan) : null; return { ip:x.ip, bits:bits(x.mask), vlan:v ? { id:v.id, name:v.name, color:v.color } : null }; }),
          sw:pr.map(r => ({ sw:r.sw, port:r.swPort })) };
        out.push({ kind:'nodeSticker', dc, title:d.label, sub:ip, maxLines:4, big,
          lines:[ifs[0] && vl(ifs[0]) ? `VLAN ${vl(ifs[0])}` : '', extra, pr.length ? pr.map(r => `${r.sw} · ${t('port', 'poort')} ${r.swPort}`).join(' + ') : '', unis.length ? `U ${window.NetCables?.uniText ? window.NetCables.uniText(unis) : unis.join(',')}` : '', `${dcl}${where ? ` · ${where}` : ''}`].filter(Boolean),
          color:pn?.color || '#94a3b8', badge:window.ShortName ? window.ShortName.port(ty || {}) : '', copies:1 });
      }
    }
    // a sticker on the switch itself: name, management address, VLAN, ports, where the fibres go
    if(L.kinds.switchStickers && window.NetSwitches){
      const F = window.Fent, bits = mk => mk ? String(mk).split('.').reduce((n, x) => n + (Number(x) || 0).toString(2).replace(/0/g, '').length, 0) : 0;
      const links = window.Fibers ? window.Fibers.links(dc) : [], trunks = window.NetSwitches.linksOf ? window.NetSwitches.linksOf(dc) : [];
      for(const s of window.NetSwitches.list(dc)){
        const ifs = F && s.dev ? F.ifaces(s.dev, 1).filter(x => x.ip) : [], first = ifs[0], v = first && first.vlan != null ? F?.vlanById(first.vlan) : null;
        const to = new Set();
        for(const l of links){ const a = l.a?.dc === dc && l.a?.sw === s.label ? l.b : l.b?.dc === dc && l.b?.sw === s.label ? l.a : null; if(a?.sw) to.add(a.dc && a.dc !== dc ? `${a.dc} ${a.sw}` : a.sw); }
        for(const l of trunks) if(l.sw === s.label && l.to?.sw) to.add(l.to.sw);
        // for a big label: every port as a small tile in the colour of its VLAN, with what sits on it; the addresses; the VLANs in use
        const sps = window.PortPlan?.swPorts ? window.PortPlan.swPorts(dc, s) : [], vs = new Map(), dcl = App.dimLabel ? App.dimLabel(dc) : dc;
        const rowOf = new Map((window.FentUI?.portPlanBase?.(dc)?.rows || []).map(r => [r.key, r]));        // what sits on a port: the device (ID:01, CL101.2 …) and its short type or destination
        const cells = sps.map(p => {
          const pv = p.vid != null ? F?.vlanById(p.vid) : null; if(pv) vs.set(pv.id, pv);
          const r = p.devKey ? rowOf.get(p.devKey) : null;
          let main = '', sub = '';
          if(p.manualName) main = p.name;
          else if(r){ main = r.kind === 'console' ? String(r.name || r.device) : String(r.device); sub = r.kind === 'cable' ? String(r.name || '') : r.kind === 'console' ? '' : `${r.short || ''}${r.multi && !r.cable ? ` E${r.eth}` : ''}`.trim(); }
          else if(p.link) { main = String(p.link.to?.sw || ''); sub = '→'; }
          else if(p.partner) { const [a, ...more] = String(p.partner.text || '').replace(/^→\s*/, '').split(' · '); main = a || ''; sub = `→${more.length ? ' ' + more.join(' ') : ''}`; }
          else main = String(p.name || '');
          return { n:p.n, kind:p.kind, label:p.label, trunk:!!p.trunk, main, sub, vlan:pv ? { id:pv.id, name:pv.name, color:pv.color } : null };
        });
        const big = { kind:'switch', id:s.label, type:typeName(s.type), short:window.ShortName ? window.ShortName.port(s.type || {}) : '', where:`${dcl}${s.where ? ` · ${s.where}` : ''}`, color:v?.color || '#a78bfa', rj:s.rj, sfp:s.sfp, cells,
          vlans:[...vs.values()].sort((a, b) => a.id - b.id).map(x => ({ id:x.id, name:x.name, color:x.color })), trunk:cells.some(c => c.trunk),
          nets:ifs.map(x => { const nv = x.vlan != null ? F?.vlanById(x.vlan) : null; return { ip:x.ip, bits:bits(x.mask), vlan:nv ? { id:nv.id, name:nv.name, color:nv.color } : null }; }) };
        out.push({ kind:'switchSticker', dc, title:s.label, sub:first ? `${first.ip}${first.mask ? ` /${bits(first.mask)}` : ''}` : t('no address yet', 'nog geen adres'), maxLines:4, big,
          lines:[v ? `VLAN ${v.id} ${v.name}` : '', `${s.rj} RJ45${s.sfp ? ` + ${s.sfp} SFP` : ''}`, to.size ? `→ ${[...to].join(' · ')}` : '', `${dcl}${s.where ? ` · ${s.where}` : ''}`].filter(Boolean),
          color:v?.color || '#a78bfa', badge:window.ShortName ? window.ShortName.port(s.type || {}) : '', copies:1 });
      }
    }
    if(L.kinds.fibers && window.Fibers){   // a label on both ends of every fibre; the label tells where the other end goes
      for(const l of window.Fibers.links(dc)) for(const [mine, other] of [[l.a, l.b], [l.b, l.a]]){ if(!mine || mine.dc !== dc) continue; const ty = window.Fibers.typeOf(l.typeId);
        out.push({ kind:'fiber', dc, title:l.id, sub:`${mine.sw} · ${window.Fibers.portName(mine.dc || dc, mine.sw, mine.sfp)}`, lines:[`→ ${window.Fibers.endLabel(other)}`, ty ? `${window.Fibers.typeName(ty)} ${ty.lengthM} m` : ''].filter(Boolean), color:window.Fibers.color(l), badge:'', copies:1 }); }
    }
    if(L.kinds.netCables && window.NetCables){   // Cat looms: one label per line, both ends, in the colour of its VLAN
      for(const c of window.NetCables.cables(dc)) for(const l of c.lines){ if(l.empty) continue; const v = l.vlan != null ? window.Fent?.vlanById(l.vlan) : null;
        out.push({ kind:'netCable', dc, title:`${c.id}.${l.port}`, sub:`${dc} · ${c.id}`, lines:[v ? `${v.id} ${v.name}` : '', l.dest].filter(Boolean), color:v?.color || '#94a3b8', badge:'', copies:2 }); }
    }
    if(L.kinds.switchPorts && window.FentUI){   // label strip for the switch: port, device and VLAN colour of the FENT scheme
      for(const r of window.FentUI.portPlan(dc).rows){
        if(!r.sw || !r.swPort) continue;                               // a device without a port gets no label yet
        const v = window.Fent?.vlanById(r.vlans[0]);
        out.push({ kind:'switchPort', dc, title:`${r.sw ? `${r.sw} · ` : ''}${t('Port', 'Poort')} ${r.swPort || r.port}`, sub:`${r.device}${r.ethCount > 1 ? ` ETH${r.eth}` : ''}`, lines:[r.vlans.map(x => { const q = window.Fent?.vlanById(x); return q ? `${q.id} ${q.name}` : x; }).join(' + '), r.cable ? r.dest : (r.ips[0] || '')].filter(Boolean), color:v?.color || '#94a3b8', badge:r.mode === 'trunk' ? 'TRUNK' : '', copies:1 });
      }
    }
    if(L.kinds.qr){
      for(const s of sockets) out.push({ kind:'qr', dc, title:s.owner, sub:`${dc} · ${s.label}`, lines:[s.where, feeders(s.owner).join(' + ')].filter(Boolean), color:owners.get(s.owner), badge:'', qr:qrText(s.owner, `${s.label} @ ${s.where}`), copies:1 });
      P.racks.forEach((R, ri) => { if(R.rack) out.push({ kind:'qr', dc, title:rackName(ri), sub:`${R.rack.heightU}U · ${dc}`, lines:[R.rack.articleKey || ''].filter(Boolean), color:'#475569', badge:'', qr:trim(`${rackName(ri)} · ${dc}\n${P.nodes.filter(n => n.rack === ri).map(n => `${n.label} ${typeName(n.type)}`).join('\n')}`, 300), copies:1 }); });
    }
    if(L.kinds.qrDb && window.QrInfo){   // the whole DB in QR codes: numbered parts, scan them in order
      const ps = window.QrInfo.parts(dc, window.QrInfo.dbText(dc), 300);
      ps.forEach((p, i) => out.push({ kind:'qr', dc, title:`${dc} ${t('info', 'info')}`, sub:ps.length > 1 ? `${i + 1}/${ps.length}` : t('everything of this DB', 'alles van deze DB'), lines:[`LK ${[...m.byLK.values()].filter(x => x.dimcity === dc).length} · ${P.nodes.length} nodes`], color:'#ff8a1f', badge:'', qr:p, copies:1 }));
    }
    if(L.kinds.qrSys && window.QrInfo && dc === App.sortedDims()[0]){
      const ps = window.QrInfo.parts(t('System', 'Systeem'), window.QrInfo.sysText(), 300);
      ps.forEach((p, i) => out.push({ kind:'qr', dc, title:t('System', 'Systeem'), sub:ps.length > 1 ? `${i + 1}/${ps.length}` : (M().projectMeta?.project || ''), lines:[t('all DBs, nodes, switches, fibres', 'alle DB\'s, nodes, switches, fibers')], color:'#0ea5e9', badge:'', qr:p, copies:1 }));
    }
    return out.flatMap(it => Array.from({ length:it.copies || 1 }, () => it));
  }
  function allItems(L){
    const dcs = App.sortedDims().filter(d => !L.dcs || L.dcs.includes(d));
    return dcs.map(dc => ({ dc, items:itemsFor(dc, L) })).filter(g => g.items.length);
  }

  // ---------- Pages ----------
  function paginate(groups, sh, start, perDc){
    const per = perSheet(sh), pages = []; let first = true;
    const seq = perDc ? groups.map(g => g.items.map(it => it)) : [groups.flatMap(g => g.items)];
    for(const items of seq){
      let off = first ? Math.max(0, Math.min(per - 1, (start | 0) - 1)) : 0; first = false;
      let i = 0;
      while(i < items.length || !pages.length){
        const take = items.slice(i, i + per - off);
        pages.push({ off, cells:take }); i += take.length; off = 0;
        if(!take.length) break;
      }
    }
    return pages;
  }
  const cellPos = (sh, idx) => { const c = idx % sh.cols, r = Math.floor(idx / sh.cols); return { x:sh.left + c * (sh.w + sh.gapX), y:sh.top + r * (sh.h + sh.gapY) }; };

  // The node and switch stickers have their own sheet (L.sheetBig); everything else is on L.sheet. One print = the big sheets first, then the others.
  const BIG_KINDS = new Set(['nodeSticker', 'switchSticker']);
  function partsOf(L){
    const groups = allItems(L), split = big => groups.map(g => ({ dc:g.dc, items:g.items.filter(it => BIG_KINDS.has(it.kind) === big) })).filter(g => g.items.length);
    const parts = [], bg = split(true), sm = split(false);
    if(bg.length) parts.push({ sh:sheetOf(L, 'big'), groups:bg, start:L.startBig });
    if(sm.length) parts.push({ sh:sheetOf(L, 'small'), groups:sm, start:L.start });
    return parts;
  }
  const pagesOf = L => partsOf(L).flatMap(p => paginate(p.groups, p.sh, p.start, L.perDc).filter(pg => pg.cells.length).map(pg => ({ ...pg, sh:p.sh })));

  // ---------- The big stickers: a node or a switch on a label of about 97 × 42 mm ----------
  // Node: the ID, type and place, then every DMX port (universe big; protocol and direction; small: the LK / Veam port that sits on it), then the addresses with their VLAN colour and the switch port.
  // Switch: the name, type and place, then every port as a small tile in the colour of its VLAN with what sits on it, then the addresses and the VLANs in use.
  const isBig = sh => sh.w >= 85 && sh.h >= 38;
  const okHex = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : null;
  const lum = hex => { let h = String(hex || '').replace('#', ''); if(h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return Number.isFinite(n) ? (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 : .5; };
  const ink = hex => lum(hex) > .6 ? '#000' : '#fff';
  const tint = (c, p) => okHex(c) ? `color-mix(in srgb, ${c} ${p}%, #fff)` : '#eef1f5';
  const fit = (text, w, max, min) => Math.max(min, Math.min(max, w / (.58 * Math.max(3, String(text).length))));       // font size (mm) that lets `text` fit `w` mm
  const arrow = (dir, c) => `<svg viewBox="0 0 8 8" class="ar">${dir === 'input' ? `<path d="M4 7.6 L7.4 3.8 H5.1 V0.4 H2.9 V3.8 H0.6 Z" fill="${c}"/>` : dir === 'idle' ? `<path d="M1 1 L7 7 M7 1 L1 7" stroke="${c}" stroke-width="1.5" fill="none"/>` : `<path d="M4 0.4 L7.4 4.2 H5.1 V7.6 H2.9 V4.2 H0.6 Z" fill="${c}"/>`}</svg>`;
  const chipStyle = (c, mono) => mono ? 'border:.25mm solid #000;color:#000;background:#fff' : `background:${okHex(c) || '#64748b'};color:${ink(c)}`;
  function bigHead(b, L, imgs){
    const logos = [imgs.show, imgs.company].filter(Boolean);
    const chip = b.short ? `<b class="bd" style="${chipStyle(b.color || '#475569', L.mono)}">${esc(b.short)}</b>` : '';
    const im = logos.length ? `<div class="bx-im">${logos.map(s => `<img src="${esc(s)}" alt="">`).join('')}</div>` : '';
    return `<div class="bx-h"><span class="bx-id" style="font-size:${fit(b.id, 36, 5.6, 3.4).toFixed(2)}mm">${esc(b.id)}</span>${chip}<span class="bx-wh">${esc(b.where)}</span>${im}</div>`;
  }
  const netRows = (nets, L) => nets.map(x => `<div class="r">${x.vlan ? `<b class="vc" style="${chipStyle(x.vlan.color, L.mono)}">${esc(x.vlan.id)} ${esc(x.vlan.name)}</b>` : ''}<span class="ip">${esc(x.ip)}${x.bits ? `<small>/${x.bits}</small>` : ''}</span></div>`).join('') || `<div class="r nn">${esc(t('no address yet', 'nog geen adres'))}</div>`;
  // `text` in at most two lines of `n` characters (cut at a space when it can be, with … when there is more)
  function two(text, n){
    const words = String(text || '').trim().split(/\s+/).filter(Boolean), lines = ['']; let cut = false;
    for(const w0 of words){
      let w = w0;
      while(w){
        const cur = lines[lines.length - 1], cand = cur ? `${cur} ${w}` : w;
        if(cand.length <= n){ lines[lines.length - 1] = cand; w = ''; }
        else if(cur){ if(lines.length === 2){ cut = true; w = ''; } else lines.push(''); }
        else { lines[lines.length - 1] = w.slice(0, n); w = w.slice(n); if(w){ if(lines.length === 2){ cut = true; w = ''; } else lines.push(''); } }
      }
      if(cut) break;
    }
    if(cut){ const l = lines[1] || ''; lines[1] = l.length >= n ? `${l.slice(0, n - 1)}…` : `${l}…`; }
    return lines;
  }
  const protoName = k => k === 'artnet' ? 'Art-Net' : 'sACN';
  const dirName = d => d === 'input' ? t('input', 'ingang') : d === 'idle' ? t('off', 'uit') : t('output', 'uitgang');
  // The protocol and direction that every port has (the show default) are said once at the bottom; a port that differs from it says so itself.
  function bigPorts(b, L){
    const n = b.ports.length, def = b.def;
    if(!n) return `<div class="bx-g bx-none">${esc(t('No DMX ports', 'Geen DMX-poorten'))}</div>`;
    const rows = n <= 4 ? 1 : n <= 16 ? 2 : 3, cols = Math.ceil(n / rows), cw = 91 / cols - .7, k = rows === 1 ? 1.3 : rows === 2 ? 1.12 : .78, ac = L.mono ? '#000' : '#b91c1c';
    const cells = b.ports.map(p => {
      const col = !L.mono && okHex(p.color) ? p.color : null, uni = p.uni == null ? '–' : String(p.uni), small = p.src || p.name || '';
      const tag = `${p.klass !== def.klass ? protoName(p.klass) : ''}${p.dir !== def.dir ? arrow(p.dir, ac) : ''}`;
      return `<div class="pc${p.uni == null ? ' fr' : ''}${p.dir === 'idle' ? ' of' : ''}"${col ? ` style="border-left-color:${col};background:${tint(col, 15)}"` : ''}>
        <div class="pt"><i>${p.n}</i><em style="color:${ac}">${tag}</em></div>
        <div class="pu" style="font-size:${(fit(uni, cw - 1.4, 4.7, 2.4) * k).toFixed(2)}mm">${esc(uni)}</div>
        <div class="pl" style="font-size:${fit(small, cw - 1.6, 2.2 * (rows === 1 ? 1.25 : 1), 1.45).toFixed(2)}mm">${esc(small)}</div>${rows <= 2 && p.dest ? `<div class="pd">${esc(p.dest)}</div>` : ''}</div>`;
    }).join('');
    return `<div class="bx-g" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);--k:${k}">${cells}</div>`;
  }
  const bigNodeFoot = (b, L) => `<div class="bx-f"><div class="c1">${netRows(b.nets, L)}</div><div class="c2">${b.sw.length ? b.sw.map(s => `<div class="r"><span class="lbl">${esc(t('on', 'op'))}</span><b class="sv">${esc(s.sw)} · ${esc(t('port', 'poort'))} ${s.port}</b></div>`).join('') : `<div class="r nn">${esc(t('not on a switch yet', 'nog niet op een switch'))}</div>`}<div class="r dm">DMX ${esc(protoName(b.def.klass))} ${arrow(b.def.dir, L.mono ? '#000' : '#1f2937')} ${esc(dirName(b.def.dir))}</div></div></div>`;
  function bigSwitchPorts(b, L){
    const rj = b.cells.filter(c => c.kind === 'rj'), sf = b.cells.filter(c => c.kind === 'sfp');
    if(!rj.length && !sf.length) return `<div class="bx-g bx-none">${esc(t('No ports', 'Geen poorten'))}</div>`;
    const rows = rj.length <= 16 ? 2 : rj.length <= 24 ? 3 : 4, rc = Math.max(1, Math.ceil(rj.length / rows)), sc = sf.length ? Math.ceil(sf.length / rows) : 0;
    const cw = (91 - (sc ? 2 : 0)) / (rc + sc * 1.2) - .7;
    const cell = (c, r, col) => {
      const v = c.vlan, base = c.trunk ? '#38bdf8' : (v?.color || null), cc = !L.mono && okHex(base) ? base : null, main = c.main || '';
      return `<div class="sp${main ? '' : ' em'}" style="grid-row:${r};grid-column:${col}${cc ? `;background:${tint(cc, main ? 32 : 10)};border-bottom-color:${cc}` : ''}">
        <div class="st"><i>${c.n}</i><em>${c.trunk ? 'T' : v ? esc(v.id) : ''}</em></div>
        <div class="sm" style="font-size:${fit(main, cw - .8, 2.8, 1.7).toFixed(2)}mm">${esc(main)}</div>
        <div class="sr">${two(c.sub, Math.max(4, Math.floor((cw - .8) / .82))).map(esc).join('<br>')}</div></div>`;
    };
    const cells = rj.map((c, i) => cell(c, Math.floor(i / rc) + 1, i % rc + 1)).concat(sf.map((c, j) => cell(c, Math.floor(j / sc) + 1, rc + 2 + j % sc))).join('');
    return `<div class="bx-g${rows >= 3 ? ' cp' : ''}" style="grid-template-columns:repeat(${rc},1fr)${sc ? ` 1.6mm repeat(${sc},1.2fr)` : ''};grid-template-rows:repeat(${rows},1fr)">${cells}</div>`;
  }
  function bigSwitchFoot(b, L){
    const dot = c => `<i style="${L.mono ? 'border:.25mm solid #000;background:#fff' : `background:${okHex(c) || '#64748b'}`}"></i>`;
    const leg = b.vlans.map(v => `<span class="lg">${dot(v.color)}${esc(v.id)} ${esc(v.name)}</span>`).join('') + (b.trunk ? `<span class="lg">${dot('#38bdf8')}T = trunk</span>` : '');
    return `<div class="bx-f"><div class="c1">${netRows(b.nets, L)}</div><div class="c2 lgs">${leg}</div></div>`;
  }
  function bigCellHtml(it, sh, L, imgs, idx){
    const { x, y } = cellPos(sh, idx), b = it.big, band = L.mono ? '#000' : (okHex(it.color) || '#94a3b8');
    return `<div class="lb bg${L.mono ? ' mono' : ''}${L.outline ? ' o' : ''}" style="left:${x.toFixed(3)}mm;top:${y.toFixed(3)}mm;width:${sh.w}mm;height:${sh.h}mm">
      <i class="band" style="background:${band};width:1.6mm"></i><div class="bx-in">${bigHead(b, L, imgs)}${b.kind === 'node' ? bigPorts(b, L) + bigNodeFoot(b, L) : bigSwitchPorts(b, L) + bigSwitchFoot(b, L)}</div></div>`;
  }

  function imagesOf(L){
    const m = M(), brand = m.pdfSettings?.layout?.brand;
    return { company:L.company.on ? (L.company.img || brand?.logo || null) : null, show:L.show.on ? (L.show.img || m.projectMeta?.logo || null) : null };
  }
  function cellHtml(it, sh, L, imgs, idx){
    if(it.big && isBig(sh)) return bigCellHtml(it, sh, L, imgs, idx);       // a big label gets the port overview, a small one the short sticker below
    const { x, y } = cellPos(sh, idx);
    const u = Math.min(1, sh.h / 25.4), pad = 1.1, bandW = 1.6;
    const band = L.mono ? '#000' : (it.color || '#94a3b8');
    const withQr = !!it.qr, qrS = +(sh.h - 2 * pad - .4).toFixed(2);
    const hasImg = (imgs.company || imgs.show) && (!withQr || sh.w >= 60), imgW = hasImg ? 11 : 0;
    const left = bandW + pad + (withQr ? qrS + pad : 0), right = pad + (hasImg ? imgW + 0.6 : 0);
    const badge = it.badge ? `<b class="bd" style="${L.mono ? 'border:.25mm solid #000;color:#000' : `background:${it.color || '#475569'};color:#fff`}">${esc(it.badge)}</b>` : '';
    const lines = (it.lines || []).slice(0, it.maxLines || 3).map(s => `<div class="l">${esc(s)}</div>`).join('');
    const im = hasImg ? `<div class="im" style="width:${imgW}mm">${imgs.show ? `<img src="${esc(imgs.show)}" alt="">` : '<span></span>'}${imgs.company ? `<img src="${esc(imgs.company)}" alt="">` : ''}</div>` : '';
    return `<div class="lb${withQr ? ' q' : ''}${L.outline ? ' o' : ''}" style="left:${x.toFixed(3)}mm;top:${y.toFixed(3)}mm;width:${sh.w}mm;height:${sh.h}mm;--u:${u.toFixed(3)}">
      <i class="band" style="background:${band};width:${bandW}mm"></i>
      ${withQr ? `<div class="qr" style="left:${bandW + pad}mm;width:${qrS}mm;height:${qrS}mm">${qrSvg(it.qr)}</div>` : ''}
      <div class="tx" style="left:${left}mm;right:${right}mm"><div class="t">${badge}<span>${esc(it.title)}</span></div>${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ''}${lines}</div>${im}</div>`;
  }
  const labelCss = () => `
    @page{size:210mm 297mm;margin:0}
    *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff;font-family:Helvetica,Arial,sans-serif;color:#000}
    .sheet{position:relative;width:210mm;height:296.5mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
    .sheet:last-child{page-break-after:auto;break-after:auto}
    .lb{position:absolute;overflow:hidden}
    .lb.o{outline:.15mm solid #9aa3b2;outline-offset:-.15mm}
    .band{position:absolute;left:0;top:0;bottom:0}
    .tx{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:calc(.35mm*var(--u));min-width:0}
    .t{display:flex;align-items:center;gap:.8mm;font-weight:800;font-size:calc(4.5mm*var(--u));line-height:1.05;white-space:nowrap;overflow:hidden}
    .t span{overflow:hidden;text-overflow:ellipsis}
    .q .t{font-size:calc(3.7mm*var(--u))}
    .bd{font-size:calc(2.6mm*var(--u));padding:.1mm .8mm;border-radius:.6mm;line-height:1.3;flex:none}
    .s{font-size:calc(2.9mm*var(--u));line-height:1.1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .l{font-size:calc(2.5mm*var(--u));line-height:1.1;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .q .s{font-size:calc(2.6mm*var(--u))}.q .l{font-size:calc(2.3mm*var(--u))}
    .qr{position:absolute;top:50%;transform:translateY(-50%)}
    .im{position:absolute;right:1mm;top:1mm;bottom:1mm;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end}
    .im img{max-width:100%;max-height:48%;object-fit:contain;display:block}
    .bg .bx-in{position:absolute;left:3.1mm;right:1.6mm;top:1mm;bottom:1mm;display:flex;flex-direction:column;gap:.8mm;min-width:0}
    .bx-h{display:flex;align-items:center;gap:1.5mm;height:7mm;flex:none;min-width:0}
    .bx-id{font-weight:800;line-height:1;white-space:nowrap}
    .bx-h .bd{font-size:2.6mm;padding:.1mm .8mm;border-radius:.6mm;line-height:1.3;flex:none}
    .bx-wh{font-size:2.5mm;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
    .bx-im{display:flex;gap:1.2mm;align-items:center;height:100%;flex:none}
    .bx-im img{height:6.2mm;width:auto;max-width:18mm;object-fit:contain;display:block}
    .bx-g{flex:1;min-height:0;display:grid;gap:.7mm}
    .bx-none{place-items:center;color:#777;font-size:2.8mm}
    .pc{--k:1;border-left:.9mm solid #94a3b8;background:#eef1f5;border-radius:.5mm;padding:.15mm .5mm .1mm .7mm;display:flex;flex-direction:column;justify-content:space-between;min-width:0;overflow:hidden}
    .pc .pt{display:flex;justify-content:space-between;align-items:center;font-size:calc(1.8mm*var(--k));line-height:1.15;color:#222;gap:.4mm}
    .pc .pt i{font-style:normal;font-weight:800}
    .pc .pt em{font-style:normal;display:inline-flex;align-items:center;gap:.3mm;white-space:nowrap}
    .pc .pu{font-weight:800;line-height:1;text-align:center;white-space:nowrap}
    .pc .pl{text-align:center;color:#222;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:1.6mm}
    .pc.fr{background:#f6f7f9;border-left-color:#cbd5e1}.pc.fr .pu{color:#9aa3b2;font-weight:600}
    .pc.of{opacity:.55}
    .ar{width:1.8mm;height:1.8mm;flex:none;display:block}
    .bx-f{flex:none;display:grid;grid-template-columns:1.3fr 1fr;gap:2.4mm;align-items:end;border-top:.2mm solid #c7cdd6;padding-top:.7mm;min-width:0}
    .pd{font-size:calc(1.55mm*var(--k));color:#444;text-align:center;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bx-f .dm{font-size:2.2mm;color:#555}
    .bx-f .r{display:flex;align-items:center;gap:1.2mm;white-space:nowrap;overflow:hidden;line-height:1.3}
    .bx-f .nn{color:#777;font-size:2.4mm}
    .vc{font-size:2.2mm;font-weight:700;padding:.1mm 1mm;border-radius:.7mm;line-height:1.35;flex:none}
    .ip{font-size:3mm;font-weight:800}.ip small{font-size:2.2mm;font-weight:600}
    .lbl{font-size:2.2mm;color:#555}.sv{font-size:2.8mm}
    .lgs{display:flex;flex-wrap:wrap;gap:.4mm 2.2mm;align-content:flex-end;justify-content:flex-start}
    .lg{display:inline-flex;align-items:center;gap:.8mm;font-size:2.2mm;white-space:nowrap}
    .lg i{width:2.2mm;height:2.2mm;border-radius:.5mm;display:inline-block}
    .sp{border-bottom:.9mm solid #cbd5e1;border-radius:.5mm;background:#eef1f5;padding:.1mm .4mm 0;display:flex;flex-direction:column;justify-content:space-between;min-width:0;overflow:hidden;text-align:center}
    .sp .st{display:flex;justify-content:space-between;font-size:1.7mm;line-height:1.15;color:#222}
    .sp .st i{font-style:normal;font-weight:800}.sp .st em{font-style:normal;font-weight:700}
    .sp .sm{font-weight:800;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sp .sr{font-size:1.7mm;color:#333;line-height:1.08;min-height:1.5mm;flex:none;white-space:nowrap;overflow:hidden}
    .sp.em{background:#f6f7f9}
    .cp .sp{justify-content:flex-start;gap:.1mm}.cp .st{font-size:1.45mm}.cp .sr{display:none}.cp .sm{margin:auto 0}
    .mono .pc{background:#fff;border:.2mm solid #000;border-left:.9mm solid #000}
    .mono .sp{background:#fff;border:.2mm solid #000;border-bottom:.9mm solid #000}
    .mono .bx-f{border-top-color:#000}
  `;
  // images: the logos to use instead of the saved ones (the Publish window has its own, not yet saved, layout)
  function buildHtml(L, { preview = false, calibration = false, images = null } = {}){
    const imgs = images ? { company:L.company.on ? (L.company.img || images.company || null) : null, show:L.show.on ? (L.show.img || images.show || null) : null } : imagesOf(L);
    let pages;
    if(calibration){      // one calibration page for each different sheet that is in use
      const seen = new Set();
      pages = [sheetOf(L, 'big'), sheetOf(L, 'small')].filter(s => { const k = JSON.stringify([s.w, s.h, s.cols, s.rows, s.left, s.top, s.gapX, s.gapY]); if(seen.has(k)) return false; seen.add(k); return true; }).map(sh => ({ off:0, cells:[], sh }));
    } else { pages = pagesOf(L); if(!pages.length) pages = [{ off:0, cells:[], sh:sheetOf(L, 'small') }]; }
    const sheets = pages.map((pg, pi) => {
      const sh = pg.sh; let body = '';
      if(calibration){
        const rects = Array.from({ length:perSheet(sh) }, (_, i) => { const p = cellPos(sh, i); return `<rect x="${p.x.toFixed(3)}" y="${p.y.toFixed(3)}" width="${sh.w}" height="${sh.h}" fill="none" stroke="#000" stroke-width=".2"/><text x="${(p.x + 1).toFixed(2)}" y="${(p.y + 3).toFixed(2)}" font-size="2.4" font-family="Helvetica,Arial,sans-serif" fill="#555">${i + 1}</text>`; }).join('');
        body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 296.5" width="210mm" height="296.5mm" style="position:absolute;left:0;top:0">${rects}
          <text x="105" y="${(sh.top / 2 + 1).toFixed(2)}" text-anchor="middle" font-size="3" font-family="Helvetica,Arial,sans-serif" fill="#000">${esc(sheetName(sh))} — calibration sheet: print at 100% (Actual size), hold it against a real sheet in front of a light</text></svg>`;
      } else body = pg.cells.map((it, k) => cellHtml(it, sh, L, imgs, pg.off + k)).join('');
      return `<section class="sheet">${body}</section>`;
    }).join('');
    const screen = preview ? `html{background:#2a2e35}body{padding:16px 0 30px;zoom:var(--zoom,1)}.sheet{margin:0 auto 16px;box-shadow:0 4px 18px rgba(0,0,0,.4);outline:1px solid #ccc}` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Stickers</title><style>${labelCss()}${screen}</style></head><body>${sheets}</body></html>`;
  }

  // ---------- Dialog ----------
  let B = null;
  function open(opts = {}){
    const m = M(); if(!m || !App.sortedDims().length){ App.ui.toast(t('Import or add a patch first', 'Importeer of voeg eerst een patch toe'), 'info'); return; }
    const L = state();
    if(Array.isArray(opts.dcs) && opts.dcs.length) L.dcs = opts.dcs.slice();
    B = { L, tab:null, timer:null };
    mount();
  }
  function close(){ document.getElementById('lbRoot')?.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fitZoom); B = null; }
  const onKey = e => { if(B && e.key === 'Escape' && !document.querySelector('.modal-backdrop')){ e.preventDefault(); close(); } };
  const changed = () => { const m = M(); if(m?.ui) m.ui.dirty = true; schedule(); };
  function schedule(){ clearTimeout(B?.timer); if(B) B.timer = setTimeout(preview, 140); }

  function mount(){
    document.getElementById('lbRoot')?.remove();
    const root = document.createElement('div'); root.id = 'lbRoot'; root.className = 'rb';
    root.innerHTML = `
      <div class="rb-top">
        <div class="rb-title">${I('grid', 18)}<div><b>${t('Stickers', 'Stickers')}</b><span id="lbSummary"></span></div></div>
        <div class="rb-top-mid"><span class="subtle" id="lbSheetInfo"></span></div>
        <div class="rb-top-actions"><button id="lbClose">${t('Close', 'Sluiten')}</button><button id="lbCal" title="${esc(t('Outlines only, to check the alignment on a real sheet', 'Alleen kaders, om de uitlijning op een echt vel te controleren'))}">${I('layout', 14)}${t('Calibration sheet', 'Kalibratieblad')}</button><button class="primary" id="lbExport">${I('download', 15)}<span>${t('Export PDF', 'PDF exporteren')}</span></button></div>
      </div>
      <div class="rb-body"><aside class="rb-panel"><div class="rb-panel-body" id="lbPanel"></div></aside>
        <section class="rb-preview"><div class="rb-preview-bar"><span class="subtle" id="lbPageInfo"></span><span class="spacer"></span><span class="subtle rb-hint">${I('info', 13)} ${t('Print the PDF at 100% (Actual size), no fit-to-page, from your laser printer', 'Print de PDF op 100% (Werkelijke grootte), niet passend maken, vanaf je laserprinter')}</span></div><iframe id="lbFrame" title="Sticker preview"></iframe></section></div>`;
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey, true); window.addEventListener('resize', fitZoom);
    root.querySelector('#lbClose').onclick = close;
    root.querySelector('#lbCal').onclick = () => exportPdf(true);
    root.querySelector('#lbExport').onclick = () => exportPdf(false);
    renderPanel(); preview(true);
  }
  function counts(){
    const L = B.L, out = {};
    for(const k of Object.keys(L.kinds)){ const one = { ...L, kinds:Object.fromEntries(Object.keys(L.kinds).map(x => [x, x === k])) }; out[k] = allItems(one).reduce((n, g) => n + g.items.length, 0); }
    return out;
  }
  function renderPanel(){
    const L = B.L, p = document.getElementById('lbPanel'); if(!p) return;
    const keep = p.scrollTop, dims = App.sortedDims(), cnt = counts();
    const sw = (k, on, label, hint = '') => `<label class="rb-row"><span>${label}${hint ? `<span class="hint" style="display:block;margin:2px 0 0">${hint}</span>` : ''}</span><span class="switch"><input type="checkbox" data-sw="${k}" ${on ? 'checked' : ''}><span></span></span></label>`;
    const img = (k, label) => `<div class="rb-row" style="cursor:default"><span>${label}</span><span style="display:flex;gap:6px"><button class="sm" data-pick="${k}">${t('Choose…', 'Kies…')}</button>${L[k].img ? `<button class="sm ghost" data-clear="${k}" title="${esc(t('Use the default', 'Standaard gebruiken'))}">${I('x', 13)}</button>` : ''}</span></div>`;
    const field = (k, label) => `<label class="field">${label}<input type="text" inputmode="decimal" data-c="${k}" value="${esc(L.custom[k])}"></label>`;
    // the list of sheets: the HERMA ones, the ones you made yourself, and "New sheet…" (which asks for a name and the sizes and saves it)
    const mine = savedSheets().map(asSheet);
    const opts = cur => `<optgroup label="HERMA">${SHEETS.map(s => `<option value="${s.id}" ${cur === s.id ? 'selected' : ''}>${esc(sheetName(s))}</option>`).join('')}</optgroup>${mine.length ? `<optgroup label="${esc(t('My sheets', 'Mijn vellen'))}">${mine.map(s => `<option value="${esc(s.id)}" ${cur === s.id ? 'selected' : ''}>${esc(sheetName(s))}</option>`).join('')}</optgroup>` : ''}${cur === 'custom' ? `<option value="custom" selected>${esc(t('Custom sheet (not saved)', 'Eigen vel (niet opgeslagen)'))}</option>` : ''}<option value="__new">${esc(t('New sheet…', 'Nieuw vel…'))}</option>`;
    const sheetBlock = (which, label, hint) => {
      const cur = which === 'big' ? L.sheetBig : L.sheet, s = sheetOf(L, which), st = which === 'big' ? L.startBig : L.start;
      return `<div class="rb-group"><div class="rb-label">${label}</div>
        <select data-sheet="${which}" style="width:100%">${opts(cur)}</select>
        <div class="hint" style="margin-top:6px">${perSheet(s)} ${t('labels per sheet', 'labels per vel')} · ${t('left', 'links')} ${fmt(s.left)} mm · ${t('top', 'boven')} ${fmt(s.top)} mm${s.gapX ? ` · ${t('gap', 'tussenruimte')} ${fmt(s.gapX)} mm` : ''}</div>
        ${s.saved ? `<div style="display:flex;gap:6px;margin-top:6px"><button class="sm" data-sheet-edit="${esc(s.id)}">${I('sliders', 13)} ${t('Edit sheet…', 'Vel bewerken…')}</button></div>`
          : cur === 'custom' ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">${field('w', t('Label width (mm)', 'Labelbreedte (mm)'))}${field('h', t('Label height (mm)', 'Labelhoogte (mm)'))}${field('cols', t('Columns', 'Kolommen'))}${field('rows', t('Rows', 'Rijen'))}${field('left', t('Left margin (mm)', 'Marge links (mm)'))}${field('top', t('Top margin (mm)', 'Marge boven (mm)'))}${field('gapX', t('Gap across (mm)', 'Ruimte opzij (mm)'))}${field('gapY', t('Gap down (mm)', 'Ruimte onder (mm)'))}</div><div style="margin-top:8px"><button class="sm" data-sheet-save="${which}">${t('Save this sheet…', 'Dit vel opslaan…')}</button></div>`
          : `<div class="hint">${t('Taken from the HERMA label template of this format.', 'Overgenomen uit het HERMA-sjabloon van dit formaat.')}</div>`}
        <label class="field" style="margin-top:10px">${t('Start at label', 'Begin bij label')}<input type="number" min="1" max="${perSheet(s)}" data-start="${which}" value="${st}"></label>
        <div class="hint">${t('For a part-used sheet: the first sheet skips the labels before this number.', 'Voor een deels gebruikt vel: het eerste vel slaat de labels voor dit nummer over.')}</div>${hint || ''}</div>`;
    };
    const sel = L.dcs || dims;
    p.innerHTML = `
      <div class="rb-group"><div class="rb-label">DimCities <span class="subtle">${sel.length}/${dims.length}</span></div>
        <div class="rb-chips">${dims.map(d => `<label class="rb-chip ${sel.includes(d) ? 'on' : ''}"><input type="checkbox" data-dc="${esc(d)}" ${sel.includes(d) ? 'checked' : ''}><i class="dot" style="background:${App.dimColor(d)}"></i>${esc(d)}</label>`).join('')}</div>
        <div style="display:flex;gap:6px;margin-top:8px"><button class="sm" data-all>${t('All', 'Alle')}</button></div>
        ${sw('perDc', L.perDc, t('Start a new sheet for each DimCity', 'Begin een nieuw vel voor elke DimCity'), t('Hand each DB its own sheet', 'Geef elke DB zijn eigen vel'))}</div>
      ${sheetBlock('big', t('Sheet for node and switch stickers', 'Vel voor node- en switchstickers'), `<div class="hint">${t('A sheet of about 97 × 42 mm gives every node and switch a sticker with an overview of its ports; a smaller sheet gets the short sticker.', 'Een vel van ongeveer 97 × 42 mm geeft elke node en switch een sticker met een overzicht van zijn poorten; op een kleiner vel komt de korte sticker.')}</div>`)}
      ${sheetBlock('small', t('Sheet for the rest (cables, panels, QR …)', 'Vel voor de rest (kabels, panelen, QR …)'), `<div class="hint">${t('Use a sheet marked for laser printers (check the pack) — the templates do not say which printers a sheet suits.', 'Gebruik een vel dat voor laserprinters is bedoeld (kijk op de verpakking) — de sjablonen vermelden niet voor welke printers een vel geschikt is.')}</div>`)}
      <div class="rb-group"><div class="rb-label">${t('What to print', 'Wat printen')}</div>
        ${sw('k:cables', L.kinds.cables, `${t('Cable labels', 'Kabellabels')} <span class="subtle">${cnt.cables}</span>`, t('LK multicores and Veam cables, 2 per cable (both ends)', 'LK-multicores en Veam-kabels, 2 per kabel (beide uiteinden)'))}
        ${sw('k:strips', L.kinds.strips, `${t('Panel connection labels', 'Aansluitlabels paneel')} <span class="subtle">${cnt.strips}</span>`, t('One per LK37 / Veam4 socket', 'Eén per LK37- / Veam4-aansluiting'))}
        ${sw('k:nodePorts', L.kinds.nodePorts, `${t('Node port labels', 'Nodepoort-labels')} <span class="subtle">${cnt.nodePorts}</span>`, t('Universe and where each port goes', 'Universe en waar elke poort heen gaat'))}
        ${sw('k:nodeStickers', L.kinds.nodeStickers, `${t('Node stickers', 'Nodestickers')} <span class="subtle">${cnt.nodeStickers}</span>`, t('One on every node: its ports with universe and LK / Veam, the address with the VLAN colour, the switch port and where it is', 'Eén op elke node: zijn poorten met universe en LK / Veam, het adres met de VLAN-kleur, de switchpoort en waar hij staat'))}
        ${sw('k:switchStickers', L.kinds.switchStickers, `${t('Switch stickers', 'Switchstickers')} <span class="subtle">${cnt.switchStickers}</span>`, t('One on every switch: every port with what sits on it in its VLAN colour, the address and the VLANs in use', 'Eén op elke switch: elke poort met wat erop zit in zijn VLAN-kleur, het adres en de VLAN’s in gebruik'))}
        ${sw('k:devices', L.kinds.devices, `${t('Racks, nodes, switches, splitters', 'Racks, nodes, switches, splitters')} <span class="subtle">${cnt.devices}</span>`)}
        ${sw('k:fibers', L.kinds.fibers, `${t('Fibre labels', 'Fiberlabels')} <span class="subtle">${cnt.fibers}</span>`, t('Both ends of every fibre, with where the other end goes', 'Beide uiteinden van elke fiber, met waar het andere uiteinde heen gaat'))}
        ${sw('k:netCables', L.kinds.netCables, `${t('Network cable labels', 'Netwerkkabel-labels')} <span class="subtle">${cnt.netCables}</span>`, t('C cables: one per line, both ends, in the VLAN colour', 'C-kabels: één per lijn, beide uiteinden, in de VLAN-kleur'))}
        ${sw('k:switchPorts', L.kinds.switchPorts, `${t('Switch port labels', 'Switchpoort-labels')} <span class="subtle">${cnt.switchPorts}</span>`, t('Port, device and VLAN (FENT colour) for the switch', 'Poort, apparaat en VLAN (FENT-kleur) voor de switch'))}
        ${sw('k:qrDb', L.kinds.qrDb, `${t('DB info QR', 'DB-info QR')} <span class="subtle">${cnt.qrDb}</span>`, t('Scan = the whole DB as text: LK/Veam → socket → node, racks, nodes with IP, switches, fibres', 'Scan = de hele DB als tekst: LK/Veam → aansluiting → node, racks, nodes met IP, switches, fibers'))}
        ${sw('k:qrSys', L.kinds.qrSys, `${t('System QR', 'Systeem-QR')} <span class="subtle">${cnt.qrSys}</span>`, t('One QR set for the whole show: every DB with its universes, nodes and switches, and the fibres', 'Eén QR-set voor de hele show: elke DB met universes, nodes en switches, en de fibers'))}
        ${sw('k:qr', L.kinds.qr, `${t('QR stickers', 'QR-stickers')} <span class="subtle">${cnt.qr}</span>`, t('QR code with the patch as plain text, one per LK / Veam / rack', 'QR-code met de patch als platte tekst, één per LK / Veam / rack'))}</div>
      <div class="rb-group"><div class="rb-label">${t('Images and look', 'Afbeeldingen en uiterlijk')}</div>
        ${sw('company', L.company.on, t('Company image', 'Bedrijfsafbeelding'), t('Default: the company logo of the report brand', 'Standaard: het bedrijfslogo uit de huisstijl van het rapport'))}${L.company.on ? img('company', t('Image', 'Afbeelding')) : ''}
        ${sw('show', L.show.on, t('Show image', 'Showafbeelding'), t('Default: the logo of the project', 'Standaard: het logo van het project'))}${L.show.on ? img('show', t('Image', 'Afbeelding')) : ''}
        ${sw('mono', L.mono, t('Black and white', 'Zwart-wit'), t('For a mono laser printer: colour bands become black', 'Voor een zwart-wit laserprinter: kleurbanden worden zwart'))}
        ${sw('outline', L.outline, t('Draw label outlines', 'Teken label-kaders'), t('Only for a test print on plain paper', 'Alleen voor een testprint op gewoon papier'))}</div>`;
    p.scrollTop = keep;
    renderSummaryOnly();
    document.getElementById('lbSheetInfo').textContent = [...new Set(partsOf(L).map(x => sheetName(x.sh)))].join('  +  ');
    bindPanel(p);
  }
  function bindPanel(p){
    const L = B.L;
    p.querySelectorAll('[data-dc]').forEach(c => c.onchange = () => { const dims = App.sortedDims(); const cur = new Set(L.dcs || dims); c.checked ? cur.add(c.dataset.dc) : cur.delete(c.dataset.dc); L.dcs = dims.filter(d => cur.has(d)); if(L.dcs.length === dims.length) L.dcs = null; changed(); renderPanel(); });
    p.querySelector('[data-all]').onclick = () => { L.dcs = null; changed(); renderPanel(); };
    // one list of sheets for the node and switch stickers ('big') and one for the rest ('small')
    p.querySelectorAll('[data-sheet]').forEach(sel => sel.onchange = () => {
      const which = sel.dataset.sheet;
      if(sel.value === '__new'){ sheetDialog(null, s => { if(s) setSheet(which, s.id); else renderPanel(); }); return; }
      setSheet(which, sel.value);
    });
    p.querySelectorAll('[data-sheet-edit]').forEach(b => b.onclick = () => sheetDialog(savedSheets().find(x => x.id === b.dataset.sheetEdit), () => { changed(); renderPanel(); }));
    p.querySelectorAll('[data-sheet-save]').forEach(b => b.onclick = () => sheetDialog(null, s => { if(s) setSheet(b.dataset.sheetSave, s.id); }, { ...L.custom }));
    p.querySelectorAll('[data-c]').forEach(i => i.onchange = () => { L.custom[i.dataset.c] = i.value; changed(); renderPanel(); });
    p.querySelectorAll('[data-start]').forEach(st => st.onchange = () => { const which = st.dataset.start, v = Math.max(1, Math.min(perSheet(sheetOf(L, which)), num(st.value, 1) | 0)); if(which === 'big') L.startBig = v; else L.start = v; changed(); renderPanel(); });
    p.querySelectorAll('[data-sw]').forEach(i => i.onchange = () => { const k = i.dataset.sw; if(k.startsWith('k:')) L.kinds[k.slice(2)] = i.checked; else if(k === 'company' || k === 'show') L[k].on = i.checked; else L[k] = i.checked; changed(); renderPanel(); });
    p.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pickImage(b.dataset.pick));
    p.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { L[b.dataset.clear].img = null; changed(); renderPanel(); });
  }
  function setSheet(which, id){
    const L = B.L; if(which === 'big') L.sheetBig = id; else L.sheet = id;
    const per = perSheet(sheetOf(L, which)); if(which === 'big') L.startBig = Math.min(L.startBig, per); else L.start = Math.min(L.start, per);
    changed(); renderPanel();
  }

  // ---------- Your own sheets: a name and the sizes, saved in the show (MODEL.labelSheets) and in the library of the app ----------
  function saveSheet(item){
    const m = M(); if(!Array.isArray(m.labelSheets)) m.labelSheets = [];
    const i = m.labelSheets.findIndex(x => x.id === item.id);
    if(i >= 0) m.labelSheets[i] = item; else m.labelSheets.push(item);
    window.Library?.put?.('labelSheets', item);
    if(m.ui) m.ui.dirty = true;
  }
  function deleteSheet(id){
    const m = M(), L = state();
    m.labelSheets = savedSheets().filter(x => x.id !== id);
    window.Library?.del?.('labelSheets', id);
    if(L.sheet === id) L.sheet = SHEETS[0].id;
    if(L.sheetBig === id) L.sheetBig = DEFAULT_BIG;
    if(m.ui) m.ui.dirty = true;
  }
  // existing = a saved sheet to edit (or null for a new one); seed = sizes to start from; done(item | null) is called after Save / Delete / Cancel
  function sheetDialog(existing, done, seed = null){
    const src = existing ? asSheet(existing) : { name:'', w:96.52, h:42.33, cols:2, rows:6, left:8.48, top:21.5, gapX:0, gapY:0, ...(seed || {}) };
    let closed = false;
    const F = (k, label) => `<label class="field">${label}<input type="text" inputmode="decimal" data-sf="${k}" value="${esc(String(src[k]).replace('.', ','))}"></label>`;
    const dlg = App.ui.openDialog({ title:existing ? t('Edit sheet', 'Vel bewerken') : t('New sheet', 'Nieuw vel'), width:'700px', onClose:() => { if(!closed){ closed = true; done?.(null); } }, body:`<div style="display:flex;gap:18px;align-items:flex-start">
        <div style="flex:1;min-width:0"><label class="field">${t('Name', 'Naam')}<input type="text" data-sf="name" maxlength="60" value="${esc(existing ? src.name : '')}" placeholder="${esc(t('e.g. HERMA 4623 stickers 97 × 42', 'bijv. HERMA 4623 stickers 97 × 42'))}"></label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">${F('w', t('Label width (mm)', 'Labelbreedte (mm)'))}${F('h', t('Label height (mm)', 'Labelhoogte (mm)'))}${F('cols', t('Columns', 'Kolommen'))}${F('rows', t('Rows', 'Rijen'))}${F('left', t('Left margin (mm)', 'Marge links (mm)'))}${F('top', t('Top margin (mm)', 'Marge boven (mm)'))}${F('gapX', t('Gap across (mm)', 'Ruimte opzij (mm)'))}${F('gapY', t('Gap down (mm)', 'Ruimte onder (mm)'))}</div>
          <div class="hint" style="margin-top:8px">${t('The sizes are on the label template (PDF) of the sheet. Saved in this show and in your library, so the sheet is there in every show.', 'De maten staan op het labelsjabloon (PDF) van het vel. Opgeslagen in deze show en in je bibliotheek, dus het vel staat in elke show klaar.')}</div>
          <div class="su-warn" data-sd-msg style="display:none"></div></div>
        <div style="flex:none"><svg data-sd-pv viewBox="0 0 210 297" width="150" style="display:block;background:#fff;border:1px solid var(--border);border-radius:4px"></svg><div class="hint" style="text-align:center;margin-top:4px">A4 · ${t('every label', 'elk label')}</div></div></div>`,
      footer:`<button class="primary" data-a="save">${t('Save', 'Opslaan')}</button>${existing ? `<button data-a="del">${I('trash', 13)} ${t('Delete sheet', 'Vel verwijderen')}</button>` : ''}<button data-a="x">${t('Cancel', 'Annuleren')}</button>` });
    const q = s => dlg.body.querySelector(s), val = k => q(`[data-sf="${k}"]`).value;
    const read = () => ({ name:val('name').trim(), w:num(val('w'), 0), h:num(val('h'), 0), cols:num(val('cols'), 0) | 0, rows:num(val('rows'), 0) | 0, left:num(val('left'), 0), top:num(val('top'), 0), gapX:num(val('gapX'), 0), gapY:num(val('gapY'), 0) });
    // what is wrong with the sizes (the message is shown, Save waits)
    const problem = s => {
      if(!s.name) return t('Give the sheet a name.', 'Geef het vel een naam.');
      if(!(s.w > 0 && s.h > 0 && s.cols >= 1 && s.rows >= 1)) return t('Fill in the label size, the columns and the rows.', 'Vul het labelformaat, de kolommen en de rijen in.');
      if(s.left + s.cols * s.w + (s.cols - 1) * s.gapX > 210.5 || s.top + s.rows * s.h + (s.rows - 1) * s.gapY > 297.5) return t('These labels do not fit on an A4 sheet: check the sizes and the margins.', 'Deze labels passen niet op een A4-vel: controleer de maten en de marges.');
      if(savedSheets().some(x => x.id !== existing?.id && String(x.name).trim().toLowerCase() === s.name.toLowerCase())) return t('A sheet with this name exists already.', 'Er is al een vel met deze naam.');
      return '';
    };
    const draw = () => {
      const s = read(), ok = s.w > 0 && s.h > 0 && s.cols >= 1 && s.rows >= 1 && s.cols * s.rows <= 400;
      q('[data-sd-pv]').innerHTML = ok ? Array.from({ length:s.cols * s.rows }, (_, i) => { const p = cellPos(s, i); return `<rect x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" width="${s.w}" height="${s.h}" fill="#eef1f5" stroke="#64748b" stroke-width=".5"/>`; }).join('') : '';
      const m = q('[data-sd-msg]'), pr = problem(s); m.style.display = pr && (s.name || existing) ? '' : 'none'; m.textContent = pr;
    };
    dlg.body.querySelectorAll('[data-sf]').forEach(i => i.oninput = draw); draw();
    const finish = v => { if(closed) return; closed = true; dlg.close(); done?.(v); };
    dlg.footer.querySelector('[data-a=x]').onclick = () => finish(null);
    dlg.footer.querySelector('[data-a=save]').onclick = () => {
      const s = read(), pr = problem(s); if(pr){ const m = q('[data-sd-msg]'); m.style.display = ''; m.textContent = pr; return; }
      const id = existing?.id || App.net.nextTypedId('SHEET:', savedSheets().concat(window.Library?.list?.('labelSheets') || []));
      const item = { id, ...s };
      saveSheet(item); App.ui.toast(`${t('Sheet saved', 'Vel opgeslagen')}: ${s.name}`, 'ok'); finish(asSheet(item));
    };
    const del = dlg.footer.querySelector('[data-a=del]');
    if(del) del.onclick = async () => {
      const ok = await App.ui.confirmDialog({ title:t('Delete this sheet?', 'Dit vel verwijderen?'), message:t('The sheet leaves the list in this show and in your library.', 'Het vel verdwijnt uit de lijst in deze show en in je bibliotheek.'), okLabel:t('Delete', 'Verwijderen') });
      if(!ok) return; deleteSheet(existing.id); finish(null);
    };
  }

  function pickImage(k){
    const inp = Object.assign(document.createElement('input'), { type:'file', accept:'image/png,image/jpeg,image/svg+xml,image/webp' });
    inp.onchange = () => { const f = inp.files?.[0]; if(!f) return; const r = new FileReader(); r.onload = () => shrink(String(r.result)).then(d => { B.L[k].img = d; changed(); renderPanel(); }); r.readAsDataURL(f); };
    inp.click();
  }
  // keep the project file small: big pictures are scaled down to 500 px (SVG stays as it is)
  function shrink(url){
    return new Promise(res => { if(url.startsWith('data:image/svg')) return res(url); const im = new Image(); im.onload = () => { const s = Math.min(1, 500 / Math.max(im.width, im.height)); if(s >= 1 && url.length < 250000) return res(url); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); }; im.onerror = () => res(url); im.src = url; });
  }
  function preview(first){
    if(!B) return;
    const frame = document.getElementById('lbFrame'); if(!frame) return;
    const L = B.L, html = buildHtml(L, { preview:true });
    frame.onload = () => { fitZoom(); const n = frame.contentDocument?.querySelectorAll('.sheet').length || 0; const info = document.getElementById('lbPageInfo'); if(info) info.textContent = `${n} ${n === 1 ? t('sheet', 'vel') : t('sheets', 'vellen')} ${t('in preview', 'in voorbeeld')}`; };
    frame.srcdoc = html;
    if(!first) renderSummaryOnly();
  }
  function renderSummaryOnly(){ const L = B.L; const sum = allItems(L).reduce((n, g) => n + g.items.length, 0); const pages = pagesOf(L).length; const s = document.getElementById('lbSummary'); if(s) s.textContent = `${sum} ${t('labels', 'labels')} · ${pages} ${pages === 1 ? t('sheet', 'vel') : t('sheets', 'vellen')}`; }
  function fitZoom(){ const f = document.getElementById('lbFrame'), d = f?.contentDocument; if(!d?.body) return; d.body.style.setProperty('--zoom', String(Math.max(.3, Math.min(1.3, (f.clientWidth - 40) / (210 * 3.7795))))); }

  async function exportPdf(calibration){
    if(!B) return;
    const L = B.L, html = buildHtml(L, { calibration });
    if(!calibration && !allItems(L).length){ App.ui.toast(t('Nothing to print with these choices', 'Niets te printen met deze keuzes'), 'info'); return; }
    const base = (M().projectMeta?.project || 'PatchLab').replace(/[^a-z0-9_-]+/gi, '_');
    const name = calibration ? `${base}-sticker-calibration.pdf` : `${base}-stickers${L.dcs && L.dcs.length === 1 ? `-${L.dcs[0]}` : ''}.pdf`;
    const btn = document.getElementById('lbExport'); btn.disabled = true;
    try {
      const out = await window.app?.exportPdfFromHtml?.({ html, defaultPath:name, landscape:false, pageSize:'A4', footer:null, brand:null });
      if(out) App.ui.toast(`${t('Exported', 'Geëxporteerd')} ${out.split(/[\\/]/).pop()}`, 'ok', { action:{ label:t('Show in folder', 'Toon in map'), run:() => window.app?.showItemInFolder?.(out) }, ms:6000 });
    } catch(err){ App.ui.toast(`${t('PDF export failed', 'PDF-export mislukt')}: ${err?.message || err}`, 'err', { ms:7000 }); }
    finally { if(btn.isConnected) btn.disabled = false; }
  }

  // ---------- For the Publish window: the sheets of one DimCity for one group of stickers ----------
  //   variant: 'nodes' (a sticker on every node, and the port labels when `ports`), 'switches' (the same for the switches), 'cables' (cables, panel strips, network cables, fibres)
  function docHtml({ dc, variant, ports = false, preview = false, images = null } = {}){
    const base = state(), off = Object.fromEntries(Object.keys(base.kinds).map(k => [k, false]));
    const kinds = { ...off, ...(variant === 'nodes' ? { nodeStickers:true, nodePorts:!!ports } : variant === 'switches' ? { switchStickers:true, switchPorts:!!ports } : { cables:true, strips:true, netCables:true, fibers:true }) };
    const L = { ...base, kinds, dcs:[dc], perDc:true, start:1, startBig:1, outline:false };
    const groups = allItems(L), count = groups.reduce((n, g) => n + g.items.length, 0);
    if(!count) return { html:'', pages:0, count:0 };
    return { html:buildHtml(L, { preview, images }), pages:pagesOf(L).length, count };
  }

  window.Labels = { open, close, docHtml, SHEETS, allSheets, sheetName, sheetDialog, saveSheet, deleteSheet, buildHtml, itemsFor, allItems, paginate, partsOf, pagesOf, cellPos, sheetOf, state, defaults };
})();
document.getElementById('tbStickers')?.addEventListener('click', () => window.Labels.open());
