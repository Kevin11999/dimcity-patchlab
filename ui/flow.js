// ui/flow.js — Signal Flow page (issue #3)
// Draws how the data runs: rack / node port → (splitter) → LK7-1 or Veam4 socket → LK block → Veam →
// object (location), as one diagram per DimCity (or all). Hover a universe in the side bar or a line
// in the drawing and the whole path lights up with the data moving along it. Blocks can be dragged;
// everything else lays itself out. LK blocks can be given their own name (project only).
// Layout and names live in MODEL.flow = { dir:'ltr'|'btt', labels:{ [dc]:{ [lkId]:name } }, pos:{ [dc]:{ [dir]:{ [blockId]:{x,y} } } } }.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;
const M = () => App.getMODEL();
const E = () => window.RackEngine;
const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
const t = (en, nl) => (lang() === 'nl' ? nl : en);
const uniHue = u => `hsl(${(Number(u || 0) * 47) % 360} 72% 58%)`;

const S = { dc:'ALL', zoom:1, tx:40, ty:30, layout:null, drag:null, pan:null, pin:null, navCollapsed:false, sideCollapsed:false };
const PORT_H = 15, HEAD_H = 26;
const GAP = () => Math.round(22 * (flowState().spacing || 1)), COL_GAP = () => Math.round(120 * (flowState().spacing || 1));
try { S.navCollapsed = localStorage.getItem('patchlab.flow.nav') === '1'; S.sideCollapsed = localStorage.getItem('patchlab.flow.side') === '1'; } catch {}
const W = { node:180, splitter:150, lk:210, veam:170, dmx:170, obj:200 };

function flowState(){
  const m = M();
  if(!m.flow || typeof m.flow !== 'object') m.flow = { dir:'ltr', labels:{}, pos:{} };
  m.flow.labels ||= {}; m.flow.pos ||= {}; m.flow.dir ||= 'ltr'; m.flow.spacing ||= 1;
  return m.flow;
}
const label = (dc, lkId) => flowState().labels?.[dc]?.[lkId] || lkId;

// ---------- Graph ----------
// blocks: { id, kind, dc, col, title, sub, color, ports:[{ key, label, universe, lit }], groups? }
// edges:  { id, from:{block,port}, to:{block,port}, universe, color, trace }
function buildGraph(dcs){
  const m = M(), blocks = [], edges = [];
  const B = new Map();
  const add = b => { B.set(b.id, b); blocks.push(b); return b; };
  const port = (b, key) => b.ports.find(p => p.key === key);
  for(const dc of dcs){
    if(!E()?.hasRackPlan?.(m, dc) && !m.byDim.get(dc)) continue;
    const P = E().computeRackPlan(m, dc);
    const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';
    // nodes (column 0), grouped by rack
    for(const n of P.nodes){
      const where = n.loose ? (n.name || t('Loose node', 'Losse node')) : (P.racks[n.rack]?.placement.name || P.racks[n.rack]?.rack?.name || t('Rack', 'Rek'));
      add({ id:`${dc}|node|${n.label}`, kind:'node', dc, col:0, title:`${n.label} · ${typeName(n.type)}`, sub:where, color:n.color,
        ports:n.ports.map((p, i) => ({ key:`p${i + 1}`, label:`${i + 1}`, universe:p ? p.universe : null, to:p ? p.to : '' })) });
    }
    // splitters in use (column 1)
    for(const sp of P.splitters){
      if(!sp.inputs.length) continue;
      add({ id:`${dc}|split|${sp.label}`, kind:'splitter', dc, col:1, title:`${sp.label} · ${typeName(sp.type)}`, sub:t('Splitter', 'Splitter'), color:sp.feedColor || '#94a3b8',
        ports:[...sp.inputs.map((u, i) => ({ key:`in${i}`, label:`in ${'AB'[i] || i + 1}`, universe:u, isIn:true })), ...sp.outputs.map((o, i) => ({ key:`out${i + 1}`, label:`${i + 1}`, universe:o ? o.universe : null }))] });
    }
    const owners = E().ownerColors(P);
    const socketOf = id => P.groups.find(g => g.lk?.id === id)?.label || [...P.groups.flatMap(g => g.vims), ...P.soloVims].find(v => v.used?.id === id)?.label || '';
    // LK blocks (column 2) with ports 1..12 in groups A/B/C
    const lks = [...m.byLK.values()].filter(l => l.dimcity === dc).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
    const linkedVeams = new Map();   // veamId -> { lk, slot }
    for(const lk of lks){
      const eff = App.effectiveBlockType(lk);
      const ports = [];
      for(let p = 1; p <= 12; p++){ const mr = App.mergedPortRecord(lk, p); ports.push({ key:`p${p}`, label:`${p}`, universe:mr.universe ?? null, dest:mr.dest || '', via:mr.ve?.veamId || null }); }
      if(eff !== 'XLR12') for(const s of [1, 2, 3]) if(lk.veam?.[s] && m.byVeam.has(lk.veam[s])) linkedVeams.set(lk.veam[s], { lk:lk.id, slot:s });
      const used = ports.some(p => p.universe != null) || [...linkedVeams.values()].some(v => v.lk === lk.id);
      if(!used) continue;
      add({ id:`${dc}|lk|${lk.id}`, kind:'lk', dc, col:2, lkId:lk.id, title:label(dc, lk.id), sub:`${socketOf(lk.id) ? socketOf(lk.id) + ' · ' : ''}${App.blockTypeLabel(eff)}`, color:owners.get(lk.id) || '#94a3b8', xlr12:eff === 'XLR12', ports });
    }
    // Veams: linked (column 3, fed by an LK slot) or standalone (column 2, own Veam4 socket)
    const veams = [...m.byVeam.values()].filter(v => v.dimcity === dc).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
    for(const ve of veams){
      const lines = ve.lines || [];
      const link = linkedVeams.get(ve.id);
      if(!lines.some(L => L.universe != null) && !link) continue;
      const ports = [1, 2, 3, 4].map(p => { const L = lines.find(x => Number(x.port) === p); return { key:`p${p}`, label:`${p}`, universe:L?.universe ?? null, dest:L?.dest || '' }; });
      add({ id:`${dc}|veam|${ve.id}`, kind:'veam', dc, col:link ? 3 : 2, title:ve.id, sub:link ? `${t('via', 'via')} ${label(dc, link.lk)} · Veam ${'ABC'[link.slot - 1]}` : `${socketOf(ve.id) || t('Veam4 socket', 'Veam4-aansluiting')}`, color:owners.get(ve.id) || owners.get(link?.lk) || '#94a3b8', link, ports });
    }
    // loose DMX (column 2, own branch)
    const dmx = (m.dmxLoose || []).filter(D => D.dimcity === dc && D.universe != null);
    if(dmx.length) add({ id:`${dc}|dmx`, kind:'dmx', dc, col:2, title:t('Direct (XLR)', 'Direct (XLR)'), sub:t('Loose DMX lines', 'Losse DMX-lijnen'), color:owners.get('DMX') || '#94a3b8',
      ports:dmx.map((D, i) => ({ key:`d${i}`, label:`${i + 1}`, universe:D.universe, dest:D.dest || '' })) });
    // objects (column 4 / 3): one block per location, with the universes that arrive there
    const objs = new Map();
    const obj = (dest, col) => { const key = `${dc}|obj|${dest}`; if(!B.has(key)) add({ id:key, kind:'obj', dc, col, title:dest, sub:'', color:'#94a3b8', ports:[] }); const b = B.get(key); b.col = Math.max(b.col, col); return b; };
    const objPort = (b, universe, from, color) => { let p = b.ports.find(x => x.universe === universe); if(!p){ p = { key:`u${universe}`, label:`U${universe}`, universe, from:[], color }; b.ports.push(p); } p.from.push(from); return p; };

    // ---- edges ----
    const traceOf = l => l.feed ? `${dc}|${l.feed.node}|${l.feed.port}` : `${dc}|unfed|${l.label}`;
    const nodeBlock = l => l.feed ? B.get(`${dc}|node|${l.feed.node}`) : null;
    const seenSplitIn = new Set();
    for(const l of P.lines){
      const color = l.feed?.color || '#94a3b8';
      const trace = traceOf(l);
      const target = l.ownerKind === 'LK' ? { b:B.get(`${dc}|lk|${l.owner}`), p:`p${l.port}` } : l.ownerKind === 'VEAM' ? { b:B.get(`${dc}|veam|${l.owner}`), p:`p${l.port}` } : { b:B.get(`${dc}|dmx`), p:B.get(`${dc}|dmx`)?.ports.find(p => p.universe === l.universe && p.dest === l.dest)?.key };
      if(!target.b) continue;
      const nb = nodeBlock(l);
      if(nb && l.feed.splitter){
        const sb = B.get(`${dc}|split|${l.feed.splitter}`);
        if(sb){
          const inKey = `in${sb.ports.filter(p => p.isIn).findIndex(p => p.universe === l.universe)}`;
          const k = `${nb.id}|${l.feed.port}|${sb.id}`;
          if(!seenSplitIn.has(k)){ seenSplitIn.add(k); edges.push({ id:`e${edges.length}`, from:{ block:nb.id, port:`p${l.feed.port}` }, to:{ block:sb.id, port:inKey }, universe:l.universe, color, trace }); }
          edges.push({ id:`e${edges.length}`, from:{ block:sb.id, port:`out${l.feed.out}` }, to:{ block:target.b.id, port:target.p }, universe:l.universe, color, trace });
        }
      } else if(nb){
        edges.push({ id:`e${edges.length}`, from:{ block:nb.id, port:`p${l.feed.port}` }, to:{ block:target.b.id, port:target.p }, universe:l.universe, color, trace });
      }
      // onward: LK port fed via a Veam → LK slot → Veam → Veam port → object; otherwise straight to the object
      if(l.ownerKind === 'LK' && l.via){
        const [vid, vp] = l.via.split(' · ');
        const vb = B.get(`${dc}|veam|${vid}`);
        if(vb){
          const slot = Math.ceil(l.port / 4);
          const k2 = `${target.b.id}|slot${slot}|${vb.id}`;
          if(!seenSplitIn.has(k2)){ seenSplitIn.add(k2); edges.push({ id:`e${edges.length}`, from:{ block:target.b.id, port:`g${slot}` }, to:{ block:vb.id, port:'in' }, universe:null, color, trace:`${target.b.id}|g${slot}`, slot:true }); }
          if(l.dest){ const ob = obj(l.dest, 4); objPort(ob, l.universe, `${vid} · ${vp}`, color); edges.push({ id:`e${edges.length}`, from:{ block:vb.id, port:`p${vp}` }, to:{ block:ob.id, port:`u${l.universe}` }, universe:l.universe, color, trace }); }
          continue;
        }
      }
      if(l.dest){ const ob = obj(l.dest, l.ownerKind === 'LK' ? 3 : 3); objPort(ob, l.universe, l.label, color); edges.push({ id:`e${edges.length}`, from:{ block:target.b.id, port:target.p }, to:{ block:ob.id, port:`u${l.universe}` }, universe:l.universe, color, trace }); }
    }
    // Veams linked to an LK but with no line of their own on that LK port range still get the slot edge
    for(const [vid, link] of linkedVeams){
      const lb = B.get(`${dc}|lk|${link.lk}`), vb = B.get(`${dc}|veam|${vid}`);
      if(lb && vb && !edges.some(e => e.from.block === lb.id && e.from.port === `g${link.slot}` && e.to.block === vb.id)) edges.push({ id:`e${edges.length}`, from:{ block:lb.id, port:`g${link.slot}` }, to:{ block:vb.id, port:'in' }, universe:null, color:lb.color, trace:`${lb.id}|g${link.slot}`, slot:true });
    }
    // objects fed from a Veam port that was not in P.lines (Veam not patched on a node yet)
    for(const ve of veams){ const vb = B.get(`${dc}|veam|${ve.id}`); if(!vb) continue; for(const p of vb.ports){ if(p.universe == null || !p.dest) continue; if(edges.some(e => e.from.block === vb.id && e.from.port === p.key)) continue; const ob = obj(p.dest, vb.col + 1); objPort(ob, p.universe, `${ve.id} · ${p.label}`, vb.color); edges.push({ id:`e${edges.length}`, from:{ block:vb.id, port:p.key }, to:{ block:ob.id, port:`u${p.universe}` }, universe:p.universe, color:vb.color, trace:`${vb.id}|${p.key}` }); } }
  }
  // object port colours: majority of feeding node colours is already set; sort object universes
  for(const b of blocks) if(b.kind === 'obj') b.ports.sort((a, c) => a.universe - c.universe);
  return { blocks, edges };
}

// ---------- Layout ----------
function blockSize(b){
  let h = HEAD_H + 8;
  if(b.kind === 'lk') h += b.xlr12 ? 12 * PORT_H : 3 * (14 + 4 * PORT_H);
  else h += Math.max(1, b.ports.length) * PORT_H;
  if(b.kind === 'splitter') h += 6;
  return { w:W[b.kind] || 180, h };
}
function portOffset(b, key){
  // y-offset of a port row inside the block (ltr), from the top
  if(b.kind === 'lk'){
    if(key?.startsWith('g')){ const g = Number(key.slice(1)); return HEAD_H + 8 + (b.xlr12 ? 0 : (g - 1) * (14 + 4 * PORT_H) + 7); }
    const p = Number(key.slice(1)); const g = Math.ceil(p / 4);
    return HEAD_H + 8 + (b.xlr12 ? (p - 1) * PORT_H : (g - 1) * (14 + 4 * PORT_H) + 14 + ((p - 1) % 4) * PORT_H) + PORT_H / 2;
  }
  if(key === 'in') return HEAD_H / 2;
  const i = Math.max(0, b.ports.findIndex(p => p.key === key));
  return HEAD_H + 8 + i * PORT_H + PORT_H / 2;
}
function layout(graph, dcs){
  const dir = flowState().dir, posSaved = flowState().pos;
  const cols = new Map();
  for(const b of graph.blocks){ b.size = blockSize(b); if(!cols.has(b.col)) cols.set(b.col, []); cols.get(b.col).push(b); }
  // order inside a column: by DimCity, then by the colour / name of what feeds it (keeps related blocks together)
  const feedOrder = new Map();
  graph.edges.forEach((e, i) => { if(!feedOrder.has(e.to.block)) feedOrder.set(e.to.block, i); });
  const colIdx = [...cols.keys()].sort((a, b) => a - b);
  let main = 0;
  for(const c of colIdx){
    const list = cols.get(c).sort((a, b) => dcs.indexOf(a.dc) - dcs.indexOf(b.dc) || (feedOrder.get(a.id) ?? 1e9) - (feedOrder.get(b.id) ?? 1e9) || a.title.localeCompare(b.title, undefined, { numeric:true }));
    const widest = Math.max(...list.map(b => b.size.w));
    let cross = 0;
    for(const b of list){
      const saved = posSaved?.[b.dc]?.[dir]?.[b.id];
      b.auto = dir === 'ltr' ? { x:main, y:cross } : { x:cross, y:-(main + b.size.h) };
      b.pos = saved ? { x:saved.x, y:saved.y } : b.auto;
      cross += (dir === 'ltr' ? b.size.h : b.size.w) + GAP();
    }
    main += (dir === 'ltr' ? widest : Math.max(...list.map(b => b.size.h))) + COL_GAP();
  }
  // bottom→top: columns stack upwards; shift so everything is positive
  if(dir === 'btt'){ const minY = Math.min(0, ...graph.blocks.map(b => b.pos.y)); for(const b of graph.blocks){ b.pos.y -= minY; b.auto.y -= minY; } }
  return graph;
}
function anchor(b, key, side){
  const dir = flowState().dir;
  if(dir === 'ltr'){ return { x:b.pos.x + (side === 'out' ? b.size.w : 0), y:b.pos.y + portOffset(b, key) }; }
  // bottom→top: leave from the top edge, arrive at the bottom edge, spread by port row
  const frac = Math.min(1, portOffset(b, key) / b.size.h);
  return { x:b.pos.x + 12 + frac * (b.size.w - 24), y:b.pos.y + (side === 'out' ? 0 : b.size.h) };
}
function edgePath(e, byId){
  const a = anchor(byId.get(e.from.block), e.from.port, 'out'), z = anchor(byId.get(e.to.block), e.to.port, 'in');
  if(flowState().dir === 'ltr'){ const dx = Math.max(40, (z.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${z.x - dx},${z.y} ${z.x},${z.y}`; }
  const dy = Math.max(40, (a.y - z.y) / 2); return `M${a.x},${a.y} C${a.x},${a.y - dy} ${z.x},${z.y + dy} ${z.x},${z.y}`;
}

// ---------- Render ----------
function selectedDims(){ const all = App.sortedDims(); return S.dc === 'ALL' ? all : all.filter(d => d === S.dc); }
function blockSvg(b){
  const { w, h } = b.size;
  const rows = [];
  const portRow = (p, y, cls='') => `<g class="fp ${cls}" data-port="${esc(p.key)}" data-uni="${p.universe ?? ''}" transform="translate(0,${y})"><title>${esc(p.label)}${p.universe != null ? ` · U${p.universe}` : ''}${p.dest ? ` · ${esc(p.dest)}` : ''}${p.to ? ` → ${esc(p.to)}` : ''}${p.from ? ` ← ${esc(p.from.join(', '))}` : ''}</title><rect x="6" y="1" width="${w - 12}" height="${PORT_H - 2}" rx="3"/><text x="12" y="${PORT_H / 2 + 3.5}" class="fp-n">${esc(p.label)}</text>${p.universe != null ? `<text x="${w / 2}" y="${PORT_H / 2 + 3.5}" class="fp-u" text-anchor="middle">U${esc(p.universe)}</text>` : ''}<text x="${w - 12}" y="${PORT_H / 2 + 3.5}" class="fp-d" text-anchor="end">${esc(trim(p.dest || (p.from ? p.from.join(', ') : p.to || ''), b.kind === 'obj' ? 22 : 14))}</text></g>`;
  if(b.kind === 'lk' && !b.xlr12){
    for(let g = 1; g <= 3; g++){
      const y0 = HEAD_H + 8 + (g - 1) * (14 + 4 * PORT_H);
      rows.push(`<g class="fp-grp" data-port="g${g}" transform="translate(0,${y0})"><text x="12" y="10" class="fp-g">Veam ${'ABC'[g - 1]}${g === 1 ? ' / XLR 1–4' : ''}</text></g>`);
      for(let i = 0; i < 4; i++) rows.push(portRow(b.ports[(g - 1) * 4 + i], y0 + 14 + i * PORT_H));
    }
  } else b.ports.forEach((p, i) => rows.push(portRow(p, HEAD_H + 8 + i * PORT_H, p.isIn ? 'in' : '')));
  const name = b.kind === 'lk' ? `<text x="10" y="17" class="fb-t fb-edit" data-rename="${esc(b.lkId)}">${esc(b.title)}${b.title !== b.lkId ? ` <tspan class="fb-id">(${esc(b.lkId)})</tspan>` : ''}</text>` : `<text x="10" y="17" class="fb-t">${esc(trim(b.title, 30))}</text>`;
  return `<g class="fb fb-${b.kind}" data-block="${esc(b.id)}" data-dc="${esc(b.dc)}" transform="translate(${b.pos.x},${b.pos.y})" style="--c:${b.color}">
    <rect class="fb-bg" width="${w}" height="${h}" rx="6"/><rect class="fb-head" width="${w}" height="${HEAD_H}" rx="6"/><rect class="fb-bar" x="0" y="0" width="4" height="${h}" rx="2"/>
    ${name}<text x="${w - 8}" y="17" class="fb-s" text-anchor="end">${esc(trim(b.sub, 26))}</text>${rows.join('')}</g>`;
}
const trim = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function render(){
  const root = App.$('#lkDetail'); if(!root) return;
  const m = M(); const dims = App.sortedDims();
  if(S.dc !== 'ALL' && !dims.includes(S.dc)) S.dc = 'ALL';
  const dcs = selectedDims();
  App.pageHead?.({ eyebrow:'Project', title:t('Signal Flow', 'Signaalstroom'), sub:t('How the data runs from the rack to every object. Hover a universe or a line to follow it.', 'Hoe de data van het rek naar elk object loopt. Beweeg over een universe of een lijn om hem te volgen.'),
    actions:`<button id="flNav" title="${esc(t('Hide or show the app sidebar for more room', 'Verberg of toon de zijbalk van de app voor meer ruimte'))}">${I(S.navCollapsed ? 'chevronRight' : 'chevronLeft', 15)}${S.navCollapsed ? t('Show sidebar', 'Zijbalk tonen') : t('Hide sidebar', 'Zijbalk verbergen')}</button><button id="flFit">${I('zoomOut', 15)}${t('Fit', 'Passend')}</button><button id="flReset" title="${esc(t('Put every block back in its automatic place', 'Zet elk blok terug op zijn automatische plek'))}">${I('refresh', 15)}${t('Reset layout', 'Indeling herstellen')}</button><button id="flSvg" title="${esc(t('Save the drawing as an SVG image', 'Sla de tekening op als SVG-afbeelding'))}">${I('download', 15)}${t('Save image', 'Afbeelding opslaan')}</button>` });
  document.body.classList.toggle('nav-collapsed', S.navCollapsed);
  const graph = layout(buildGraph(dcs), dcs);
  S.layout = graph;
  const byId = new Map(graph.blocks.map(b => [b.id, b]));
  // universes in scope, with the node colours that carry them
  const unis = new Map();
  for(const e of graph.edges) if(e.universe != null){ const k = String(e.universe); if(!unis.has(k)) unis.set(k, new Set()); unis.get(k).add(e.color); }
  const uniList = [...unis.keys()].sort((a, b) => Number(a) - Number(b));
  const nodes = graph.blocks.filter(b => b.kind === 'node');
  const dir = flowState().dir;
  const side = `<aside class="fl-side ${S.sideCollapsed ? 'collapsed' : ''}"><button class="fl-collapse" id="flSide" title="${esc(t('Collapse or expand this panel', 'Klap dit paneel in of uit'))}">${I(S.sideCollapsed ? 'chevronRight' : 'chevronLeft', 14)}</button>
    <div class="fl-sec"><div class="rb-label">DimCities</div>
      <button class="fl-item ${S.dc === 'ALL' ? 'on' : ''}" data-dc="ALL">${I('layers', 14)}<span>${t('All DimCities', 'Alle DimCities')}</span><em>${dims.length}</em></button>
      ${dims.map(dc => `<button class="fl-item ${S.dc === dc ? 'on' : ''}" data-dc="${esc(dc)}"><i class="dot" style="background:${App.dimColor(dc)}"></i><span>${esc(dc)}</span><em>${m.byDim.get(dc)?.lks?.size || 0} LK</em></button>`).join('')}</div>
    <div class="fl-sec"><div class="rb-label">${t('Universes', 'Universes')} <span class="subtle">${uniList.length}</span></div>
      <div class="fl-unis">${uniList.map(u => `<button class="fl-uni" data-uni="${u}" style="--u:${uniHue(u)}"><b>U${u}</b><span>${[...unis.get(u)].map(c => `<i style="background:${c}"></i>`).join('')}</span></button>`).join('') || `<div class="subtle" style="padding:4px 8px">${t('No universes patched', 'Geen universes gepatcht')}</div>`}</div></div>
    <div class="fl-sec"><div class="rb-label">${t('Nodes', 'Nodes')}</div>${nodes.map(n => `<div class="fl-node"><i style="background:${n.color}"></i><span>${esc(n.title)}</span><em>${esc(n.sub)}</em></div>`).join('') || `<div class="subtle" style="padding:4px 8px">${t('Place a rack or loose node first', 'Plaats eerst een rek of losse node')}</div>`}</div>
    <div class="fl-sec"><div class="rb-label">${t('Direction', 'Richting')}</div>
      <div class="segmented rb-full" id="flDir"><button data-v="ltr" class="${dir === 'ltr' ? 'active' : ''}">${t('Left → right', 'Links → rechts')}</button><button data-v="btt" class="${dir === 'btt' ? 'active' : ''}">${t('Bottom → top', 'Onder → boven')}</button></div>
      <label class="field" style="margin-top:10px">${t('Spacing', 'Afstand')} <span class="subtle" id="flSpVal">${Math.round((flowState().spacing || 1) * 100)}%</span><input type="range" id="flSpacing" min="50" max="250" step="10" value="${Math.round((flowState().spacing || 1) * 100)}"></label>
      <div class="hint" style="margin-top:8px">${t('Hover a block for its whole flow, a port for that line only. Click to pin, Esc to release. Drag a block to move it; click an LK name to rename it.', 'Beweeg over een blok voor zijn hele flow, over een poort voor alleen die lijn. Klik om vast te zetten, Esc om los te laten. Sleep een blok om het te verplaatsen; klik op een LK-naam om te hernoemen.')}</div></div>
  </aside>`;
  const defs = `<defs><marker id="flArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`;
  const edgesSvg = graph.edges.map(e => { const d = edgePath(e, byId); return `<path class="fe ${e.slot ? 'slot' : ''}" data-edge="${e.id}" data-uni="${e.universe ?? ''}" data-trace="${esc(e.trace)}" data-from="${esc(e.from.block)}" data-to="${esc(e.to.block)}" data-fromport="${esc(e.from.port)}" data-toport="${esc(e.to.port)}" d="${d}" style="--c:${e.color}"/><path class="fe-hit" data-hit="${e.id}" data-trace="${esc(e.trace)}" d="${d}"><title>U${e.universe ?? '—'} · ${esc(byId.get(e.from.block)?.title || '')} → ${esc(byId.get(e.to.block)?.title || '')}</title></path>`; }).join('');
  const canvas = `<div class="fl-canvas" id="flCanvas"><svg id="flSvg" xmlns="http://www.w3.org/2000/svg">${defs}<g id="flView" transform="translate(${S.tx},${S.ty}) scale(${S.zoom})"><g id="flEdges">${edgesSvg}</g><g id="flBlocks">${graph.blocks.map(blockSvg).join('')}</g></g></svg>
    ${graph.blocks.length ? '' : `<div class="empty fl-empty">${I('cable', 30)}<h3>${t('Nothing to draw yet', 'Nog niets te tekenen')}</h3><p>${t('Import a patch and place a rack or loose node in a DimCity; the flow appears here.', 'Importeer een patch en plaats een rek of losse node in een DimCity; de stroom verschijnt hier.')}</p></div>`}</div>`;
  root.innerHTML = `<div class="fl-wrap">${side}${canvas}</div>`;
  bind(root, graph, byId);
  if(S.fitNext){ S.fitNext = false; fit(); }
}

// ---------- Interaction ----------
function setView(){ const v = document.getElementById('flView'); if(v) v.setAttribute('transform', `translate(${S.tx},${S.ty}) scale(${S.zoom})`); }
function fit(){
  const g = S.layout, c = document.getElementById('flCanvas'); if(!g?.blocks.length || !c) return;
  const minX = Math.min(...g.blocks.map(b => b.pos.x)), minY = Math.min(...g.blocks.map(b => b.pos.y));
  const maxX = Math.max(...g.blocks.map(b => b.pos.x + b.size.w)), maxY = Math.max(...g.blocks.map(b => b.pos.y + b.size.h));
  const r = c.getBoundingClientRect();
  S.zoom = Math.max(.2, Math.min(1.4, Math.min((r.width - 60) / (maxX - minX), (r.height - 60) / (maxY - minY))));
  S.tx = 30 - minX * S.zoom + ((r.width - 60) - (maxX - minX) * S.zoom) / 2; S.ty = 30 - minY * S.zoom;
  setView();
}
// What lights up:
//  - a universe: every line that carries it (plus the LK-slot → Veam lines between lit blocks)
//  - a line or a port: that one flow, from the node port to the objects (through splitter and Veam)
//  - a block: its whole flow, upstream to the node and downstream to every object
function highlight(root, sel){
  sel = sel || S.pin || null;
  root.querySelectorAll('.fe, .fb, .fp').forEach(el => el.classList.remove('lit', 'dim', 'flow'));
  if(!sel) return;
  const { uni=null, trace=null, block=null, port=null } = sel;
  const edges = [...root.querySelectorAll('.fe')];
  const litEdges = new Set(), litBlocks = new Set();
  const addE = e => { litEdges.add(e); litBlocks.add(e.dataset.from); litBlocks.add(e.dataset.to); };
  // follow a set of trace ids and the LK-slot links they pass through
  const grow = ids => { let again = true; while(again){ again = false;
    for(const e of edges) if(ids.has(e.dataset.trace) && !litEdges.has(e)){ addE(e); again = true; }
    for(const e of edges) if(e.classList.contains('slot') && !litEdges.has(e) && litBlocks.has(e.dataset.from) && [...litEdges].some(x => x.dataset.to === e.dataset.from && x.dataset.toport?.startsWith('p') && Math.ceil(Number(x.dataset.toport.slice(1)) / 4) === Number(e.dataset.fromport.slice(1)))){ addE(e); again = true; }
    // after a slot link: continue with the Veam's outgoing lines that belong to the same node traces
    for(const e of edges) if(!litEdges.has(e) && !e.classList.contains('slot') && ids.has(e.dataset.trace) ){ addE(e); again = true; }
  } };
  if(uni != null){
    for(const e of edges) if(e.dataset.uni === String(uni)) addE(e);
    for(const e of edges) if(e.classList.contains('slot') && litBlocks.has(e.dataset.from) && litBlocks.has(e.dataset.to)) litEdges.add(e);
  }
  if(trace != null) grow(new Set([trace]));
  if(block != null && port != null){
    const ids = new Set(edges.filter(e => (e.dataset.from === block && e.dataset.fromport === port) || (e.dataset.to === block && e.dataset.toport === port)).map(e => e.dataset.trace));
    grow(ids);
  } else if(block != null){
    // whole flow: everything downstream of the block and everything upstream of it
    const down = new Set([block]), up = new Set([block]);
    let again = true; while(again){ again = false; for(const e of edges){ if(down.has(e.dataset.from) && !litEdges.has(e)){ addE(e); down.add(e.dataset.to); again = true; } if(up.has(e.dataset.to) && !litEdges.has(e)){ addE(e); up.add(e.dataset.from); again = true; } } }
    litBlocks.add(block);
  }
  for(const e of edges) e.classList.add(litEdges.has(e) ? 'lit' : 'dim');
  if(trace != null || block != null) litEdges.forEach(e => e.classList.add('flow'));
  root.querySelectorAll('.fb').forEach(b => b.classList.add(litBlocks.has(b.dataset.block) ? 'lit' : 'dim'));
  // ports: those on a lit edge (by universe) light up
  const litUnis = new Set([...litEdges].map(e => e.dataset.uni).filter(Boolean));
  root.querySelectorAll('.fb.lit .fp').forEach(p => { if(p.dataset.uni && litUnis.has(p.dataset.uni)) p.classList.add('lit'); });
}
function bind(root, graph, byId){
  const canvas = root.querySelector('#flCanvas'), svg = root.querySelector('#flSvg'); if(!svg) return;
  root.querySelectorAll('[data-dc]').forEach(b => b.onclick = () => { S.dc = b.dataset.dc; S.fitNext = true; render(); });
  root.querySelectorAll('#flDir button').forEach(b => b.onclick = () => { flowState().dir = b.dataset.v; M().ui.dirty = true; S.fitNext = true; render(); });
  App.$('#flFit')?.addEventListener('click', fit);
  App.$('#flReset')?.addEventListener('click', () => { const f = flowState(); for(const dc of selectedDims()) delete f.pos[dc]; M().ui.dirty = true; S.fitNext = true; render(); });
  const pinToggle = sel => { S.pin = S.pin && JSON.stringify(S.pin) === JSON.stringify(sel) ? null : sel; root.querySelectorAll('.fl-uni.pinned').forEach(x => x.classList.remove('pinned')); if(S.pin?.uni != null) root.querySelector(`.fl-uni[data-uni="${S.pin.uni}"]`)?.classList.add('pinned'); highlight(root); };
  root.querySelectorAll('.fl-uni').forEach(b => { b.onmouseenter = () => highlight(root, { uni:b.dataset.uni }); b.onmouseleave = () => highlight(root); b.onclick = () => pinToggle({ uni:b.dataset.uni }); if(S.pin?.uni === b.dataset.uni) b.classList.add('pinned'); });
  root.querySelectorAll('.fe-hit').forEach(e => { e.onmouseenter = () => highlight(root, { trace:e.dataset.trace }); e.onmouseleave = () => highlight(root); e.onclick = ev => { ev.stopPropagation(); pinToggle({ trace:e.dataset.trace }); }; });
  root.querySelectorAll('.fb').forEach(b => {
    b.onmouseenter = () => { if(!S.drag) highlight(root, { block:b.dataset.block }); };
    b.onmouseleave = () => { if(!S.drag) highlight(root); };
    // a port inside the block: only that line
    b.querySelectorAll('.fp').forEach(p => { p.onmouseenter = ev => { ev.stopPropagation(); if(!S.drag) highlight(root, { block:b.dataset.block, port:p.dataset.port }); }; p.onmouseleave = ev => { ev.stopPropagation(); if(!S.drag) highlight(root, { block:b.dataset.block }); }; });
  });
  const sp = root.querySelector('#flSpacing'); if(sp){ sp.oninput = () => { root.querySelector('#flSpVal').textContent = `${sp.value}%`; }; sp.onchange = () => { flowState().spacing = Number(sp.value) / 100; M().ui.dirty = true; S.fitNext = true; render(); }; }
  App.$('#flNav')?.addEventListener('click', () => { S.navCollapsed = !S.navCollapsed; try { localStorage.setItem('patchlab.flow.nav', S.navCollapsed ? '1' : '0'); } catch {} S.fitNext = true; render(); });
  root.querySelector('#flSide')?.addEventListener('click', () => { S.sideCollapsed = !S.sideCollapsed; try { localStorage.setItem('patchlab.flow.side', S.sideCollapsed ? '1' : '0'); } catch {} S.fitNext = true; render(); });
  App.$('#flSvg')?.addEventListener('click', () => exportSvg(root));
  const onKey = e => { if(e.key === 'Escape' && S.pin){ S.pin = null; highlight(root); root.querySelectorAll('.fl-uni.pinned').forEach(x => x.classList.remove('pinned')); } };
  document.addEventListener('keydown', onKey);
  highlight(root);
  // zoom with the wheel around the cursor, pan by dragging the background
  canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const k = Math.exp(-e.deltaY * 0.0015); const z = Math.max(.2, Math.min(3, S.zoom * k)); S.tx = px - (px - S.tx) * (z / S.zoom); S.ty = py - (py - S.ty) * (z / S.zoom); S.zoom = z; setView(); }, { passive:false });
  svg.addEventListener('mousedown', e => {
    const blockEl = e.target.closest('.fb');
    if(blockEl){
      const b = byId.get(blockEl.dataset.block);
      S.drag = { b, el:blockEl, sx:e.clientX, sy:e.clientY, x0:b.pos.x, y0:b.pos.y, moved:false, rename:e.target.closest('[data-rename]')?.dataset.rename || null };
    } else S.pan = { sx:e.clientX, sy:e.clientY, tx:S.tx, ty:S.ty };
    e.preventDefault();
  });
  const mv = e => {
    if(S.drag){
      const d = S.drag, dx = (e.clientX - d.sx) / S.zoom, dy = (e.clientY - d.sy) / S.zoom;
      if(!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.moved = true; d.b.pos = { x:Math.round(d.x0 + dx), y:Math.round(d.y0 + dy) };
      d.el.setAttribute('transform', `translate(${d.b.pos.x},${d.b.pos.y})`);
      root.querySelectorAll(`.fe[data-from="${CSS.escape(d.b.id)}"], .fe[data-to="${CSS.escape(d.b.id)}"]`).forEach(p => { const ed = graph.edges.find(x => x.id === p.dataset.edge); const dd = edgePath(ed, byId); p.setAttribute('d', dd); root.querySelector(`.fe-hit[data-hit="${p.dataset.edge}"]`)?.setAttribute('d', dd); });
    } else if(S.pan){ if(Math.hypot(e.clientX - S.pan.sx, e.clientY - S.pan.sy) > 3) S.panMoved = true; S.tx = S.pan.tx + (e.clientX - S.pan.sx); S.ty = S.pan.ty + (e.clientY - S.pan.sy); setView(); }
  };
  const up = () => {
    if(S.drag){
      const d = S.drag; S.drag = null;
      if(d.moved){ const f = flowState(); ((f.pos[d.b.dc] ||= {})[f.dir] ||= {})[d.b.id] = { ...d.b.pos }; M().ui.dirty = true; window.PatchHistory?.label?.(t('Moved a block in the signal flow', 'Blok verplaatst in de signaalstroom')); }
      else if(d.rename) renameLk(d.b.dc, d.rename);
      else pinToggle({ block:d.b.id });
    } else if(S.pan && Math.hypot(0, 0) === 0 && S.pin && !S.panMoved){ /* click on the background releases a pin */ S.pin = null; highlight(root); root.querySelectorAll('.fl-uni.pinned').forEach(x => x.classList.remove('pinned')); }
    S.pan = null; S.panMoved = false;
  };
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  S.cleanup?.(); S.cleanup = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.removeEventListener('keydown', onKey); };
}
function renameLk(dc, lkId){
  const cur = label(dc, lkId);
  const d = App.ui.openDialog({ title:t('Name of this block', 'Naam van dit blok'), subtitle:t('Only for the drawing — the LK number, its ports and the CSV do not change.', 'Alleen voor de tekening — het LK-nummer, de poorten en de CSV veranderen niet.'), width:'420px',
    body:`<label class="field">${esc(lkId)}<input id="flName" type="text" value="${esc(cur === lkId ? '' : cur)}" placeholder="${esc(lkId)}" maxlength="40"></label>`,
    footer:`<button data-a="c">${t('Cancel', 'Annuleren')}</button><button class="primary" data-a="ok">${t('Save', 'Opslaan')}</button>` });
  const inp = d.body.querySelector('#flName'); setTimeout(() => inp.focus(), 30);
  const save = () => { const f = flowState(); f.labels[dc] ||= {}; const v = inp.value.trim(); if(v && v !== lkId) f.labels[dc][lkId] = v; else delete f.labels[dc][lkId]; M().ui.dirty = true; d.close(); render(); };
  d.footer.querySelector('[data-a=c]').onclick = d.close; d.footer.querySelector('[data-a=ok]').onclick = save;
  inp.onkeydown = e => { if(e.key === 'Enter') save(); };
}

// The drawing as a stand-alone SVG file (styles inlined so it looks the same outside the app)
function exportSvg(root){
  const svg = root.querySelector('#flSvg'); if(!svg || !S.layout?.blocks.length) return;
  const g = S.layout;
  const minX = Math.min(...g.blocks.map(b => b.pos.x)) - 20, minY = Math.min(...g.blocks.map(b => b.pos.y)) - 20;
  const maxX = Math.max(...g.blocks.map(b => b.pos.x + b.size.w)) + 20, maxY = Math.max(...g.blocks.map(b => b.pos.y + b.size.h)) + 20;
  const inner = svg.querySelector('#flView').innerHTML;
  const css = `.fe{fill:none;stroke-width:2;opacity:.9}.fe.slot{stroke-dasharray:4 4}.fe-hit{display:none}.fb-bg{fill:#fff;stroke:#334155}.fb-head{fill:#e2e8f0}.fb-t{font:600 12px sans-serif;fill:#0f172a}.fb-id{font-weight:400;fill:#64748b}.fb-s{font:10.5px sans-serif;fill:#64748b}.fp rect{fill:#f1f5f9}.fp-n{font:10px monospace;fill:#64748b}.fp-u{font:600 10.5px sans-serif;fill:#0f172a}.fp-d{font:9.5px sans-serif;fill:#334155}.fp-g{font:600 9.5px sans-serif;fill:#64748b;text-transform:uppercase}`;
  // colours are CSS variables on the elements; resolve them to plain attributes
  const tmp = document.createElement('div'); tmp.innerHTML = inner;
  tmp.querySelectorAll('[style]').forEach(el => { const c = el.style.getPropertyValue('--c'); if(c){ if(el.classList.contains('fe')) el.setAttribute('stroke', c); if(el.classList.contains('fb')){ el.querySelector('.fb-bar')?.setAttribute('fill', c); } } });
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}"><style>${css}</style><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#fff"/>${svg.querySelector('defs').outerHTML.replace('context-stroke', '#334155')}${tmp.innerHTML}</svg>`;
  const name = `${(M().projectMeta?.project || 'PatchLab').replace(/[^a-z0-9_-]+/gi, '_')}-signal-flow-${S.dc}.svg`;
  const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([out], { type:'image/svg+xml' })), download:name });
  document.body.appendChild(a); a.click(); a.remove();
  App.ui.toast(t('Drawing saved as SVG', 'Tekening opgeslagen als SVG'));
}

window.Flow = { render, fit, buildGraph, navCollapsed:() => S.navCollapsed };
