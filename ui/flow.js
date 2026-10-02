// ui/flow.js — Signal Flow page (issue #3)
// Draws the cabling the way it is on the floor: the rack (nodes, splitter, panel with LK7-1 / Veam4
// sockets) → one thick LK multicore per LK block → a Veam cable per linked Veam → thin DMX lines to the
// objects (locations). Line thickness = cable type (LK > Veam > DMX); LK and Veam cables take the colour
// of the node that feeds them, DMX lines the colour of their universe.
// Hover a universe, a port, a line or a block and that path comes alive; click to pin it. Blocks can be
// dragged; the rest lays itself out. LK blocks can be given their own name (project only).
// MODEL.flow = { dir:'ltr'|'btt', spacing, labels:{ [dc]:{ [lkId]:name } }, pos:{ [dc]:{ [dir]:{ [blockId]:{x,y} } } } }
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;
const M = () => App.getMODEL();
const E = () => window.RackEngine;
const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
const t = (en, nl) => (lang() === 'nl' ? nl : en);
const uniHue = u => `hsl(${(Number(u || 0) * 47) % 360} 72% 58%)`;

const S = { dc:'ALL', zoom:1, tx:40, ty:30, layout:null, drag:null, pan:null, pin:null };
const ROW = 15, HEAD = 26, PAD = 8;
const GAP = () => Math.round(22 * (flowState().spacing || 1)), COL_GAP = () => Math.round(130 * (flowState().spacing || 1));
const W = { node:180, splitter:150, panel:190, socket:170, lk:210, veam:170, dmx:200, obj:210, mini:160 };

function flowState(){
  const m = M();
  if(!m.flow || typeof m.flow !== 'object') m.flow = { dir:'ltr', labels:{}, pos:{} };
  m.flow.labels ||= {}; m.flow.pos ||= {}; m.flow.dir ||= 'ltr'; m.flow.spacing ||= 1;
  return m.flow;
}
const label = (dc, lkId) => flowState().labels?.[dc]?.[lkId] || lkId;
const trim = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// ---------- Graph ----------
// block: { id, kind, dc, col, rack, title, sub, color, rows:[{ key, type:'head'|'port'|'slot', h, label, universe, dest, lines:[lineKey], ... }] }
// edge:  { id, from:{block,port}, to:{block,port}, cable:'patch'|'lk'|'veam'|'dmx', color, lines:[lineKey], universe? }
// line:  one DMX line of the show (an LK port, a Veam port or a loose DMX line) with its universe
function buildGraph(dcs){
  const m = M(), blocks = [], edges = [], lines = new Map();
  const B = new Map();
  const add = b => { b.rows ||= []; B.set(b.id, b); blocks.push(b); return b; };
  const rowOf = (b, key) => b.rows.find(r => r.key === key);
  const port = (key, label, universe, extra={}) => ({ key, type:'port', h:ROW, label, universe:universe ?? null, lines:[], ...extra });
  const edge = (from, to, cable, color, lineKeys, extra={}) => { const e = { id:`e${edges.length}`, from, to, cable, color, lines:[...new Set(lineKeys)], ...extra }; edges.push(e); return e; };
  const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';
  for(const dc of dcs){
    if(!m.byDim.get(dc)) continue;
    const P = E().computeRackPlan(m, dc);
    const owners = E().ownerColors(P);
    const lineKey = l => `${dc}|${l.owner}|${l.port}|${String(l.label || "").replace(/\s+/g, "_")}`;
    for(const l of P.lines) lines.set(lineKey(l), { universe:l.universe, dest:l.dest, owner:l.owner, ownerKind:l.ownerKind, label:l.label });

    // ---- rack contents (column 0): nodes, splitters, panels — with the rack they sit in ----
    const rackName = ri => ri < 0 ? null : (P.racks[ri]?.placement.name || P.racks[ri]?.rack?.name || `Rack ${ri + 1}`);
    const rackKey = ri => ri < 0 ? null : `${dc}|rack|${ri}`;
    for(const n of P.nodes){
      add({ id:`${dc}|node|${n.label}`, kind:'node', dc, col:0, rack:rackKey(n.rack), title:`${n.label} · ${typeName(n.type)}`, sub:n.loose ? (n.name || t('Loose node', 'Losse node')) : '', color:n.color,
        rows:n.ports.map((p, i) => port(`p${i + 1}`, `${i + 1}`, p ? p.universe : null, { to:p ? p.to : '' })) });
    }
    for(const sp of P.splitters){
      if(!sp.inputs.length) continue;
      add({ id:`${dc}|split|${sp.label}`, kind:'splitter', dc, col:0, rack:rackKey(sp.rack), title:`${sp.label} · ${typeName(sp.type)}`, sub:t('Splitter', 'Splitter'), color:sp.feedColor || '#94a3b8',
        rows:[...sp.inputs.map((u, i) => port(`in${i}`, `in ${'AB'[i] || i + 1}`, u, { isIn:true })), ...sp.outputs.map((o, i) => port(`out${i + 1}`, `${i + 1}`, o ? o.universe : null))] });
    }
    // panels: LK7-1 and Veam4 sockets grouped per rack panel item; loose spiders as their own small block
    const socketBlocks = new Map();   // `${rack}|${iid}` -> block
    const socketBlock = (ri, iid, panelName, loose) => {
      const key = `${dc}|panel|${ri}|${iid}`;
      if(!B.has(key)) add({ id:key, kind:loose ? 'socket' : 'panel', dc, col:0, rack:rackKey(ri), title:loose ? panelName : panelName, sub:loose ? t('Loose spider', 'Losse spin') : t('Panel', 'Paneel'), color:'#94a3b8', rows:[] });
      return B.get(key);
    };
    for(const g of P.groups){
      const b = socketBlock(g.rack, g.iid, g.panel, g.loose);
      b.rows.push(port(`s${g.label}`, g.label, null, { socket:'lk', owner:g.lk?.id || null, dest:g.lk ? g.lk.id : '', color:g.lk ? owners.get(g.lk.id) : null }));
      for(const v of g.vims) b.rows.push(port(`s${v.label}`, v.label, null, { socket:'veam', owner:v.used?.id || null, dest:v.used ? v.used.id : '', color:v.used ? owners.get(v.used.id) : null }));
    }
    for(const v of P.soloVims){ const b = socketBlock(v.rack, v.iid, v.panel, v.loose); b.rows.push(port(`s${v.label}`, v.label, null, { socket:'veam', owner:v.used?.id || null, dest:v.used ? v.used.id : '', color:v.used ? owners.get(v.used.id) : null })); }
    for(const b of blocks) if(b.dc === dc && (b.kind === 'panel' || b.kind === 'socket')){ b.rows = b.rows.filter(r => r.owner); if(!b.rows.length){ B.delete(b.id); blocks.splice(blocks.indexOf(b), 1); } }
    const socketOf = ownerId => { for(const b of blocks){ if(b.dc !== dc || (b.kind !== 'panel' && b.kind !== 'socket')) continue; const r = b.rows.find(x => x.owner === ownerId); if(r) return { b, r }; } return null; };

    // ---- LK blocks (column 1) ----
    const lks = [...m.byLK.values()].filter(l => l.dimcity === dc).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
    const linked = new Map();   // veamId -> { lk, slot }
    for(const lk of lks){
      const eff = App.effectiveBlockType(lk);
      const rows = [];
      const slotVeam = s => eff !== 'XLR12' && lk.veam?.[s] && m.byVeam.has(lk.veam[s]) ? lk.veam[s] : null;
      let used = false;
      for(let s = 1; s <= 3; s++){
        const vid = slotVeam(s);
        if(vid){
          linked.set(vid, { lk:lk.id, slot:s });
          rows.push({ key:`g${s}`, type:'slot', h:ROW + 6, label:`Veam ${'ABC'[s - 1]}`, dest:vid, lines:[] });
          used = true;
        } else {
          if(eff !== 'XLR12') rows.push({ key:`h${s}`, type:'head', h:13, label:`${s === 1 ? 'XLR 1–4' : `XLR ${(s - 1) * 4 + 1}–${s * 4}`}` });
          for(let p = (s - 1) * 4 + 1; p <= s * 4; p++){
            const L = lk.lines.find(x => Number(x.port) === p);
            rows.push(port(`p${p}`, `${p}`, L?.universe ?? null, { dest:L?.dest || '' }));
            if(L?.universe != null) used = true;
          }
        }
      }
      if(!used) continue;
      add({ id:`${dc}|lk|${lk.id}`, kind:'lk', dc, col:1, lkId:lk.id, title:label(dc, lk.id), sub:App.blockTypeLabel(eff), color:owners.get(lk.id) || '#94a3b8', rows });
    }
    // ---- Veams: linked (column 2) or stand-alone on a Veam4 socket (column 1) ----
    const veams = [...m.byVeam.values()].filter(v => v.dimcity === dc).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
    for(const ve of veams){
      const link = linked.get(ve.id);
      const vl = ve.lines || [];
      if(!vl.some(L => L.universe != null) && !link) continue;
      add({ id:`${dc}|veam|${ve.id}`, kind:'veam', dc, col:link ? 2 : 1, link, title:ve.id, sub:link ? `${t('via', 'via')} ${label(dc, link.lk)} · Veam ${'ABC'[link.slot - 1]}` : t('Veam4 socket', 'Veam4-aansluiting'), color:owners.get(ve.id) || (link ? owners.get(link.lk) : null) || '#94a3b8',
        rows:[1, 2, 3, 4].map(p => { const L = vl.find(x => Number(x.port) === p); return port(`p${p}`, `${p}`, L?.universe ?? null, { dest:L?.dest || '' }); }) });
    }
    // ---- loose DMX (column 1): the block itself lists the locations, no further objects ----
    const dmx = (m.dmxLoose || []).filter(D => D.dimcity === dc && D.universe != null);
    if(dmx.length) add({ id:`${dc}|dmx`, kind:'dmx', dc, col:1, title:t('Direct (XLR)', 'Direct (XLR)'), sub:t('Loose DMX lines', 'Losse DMX-lijnen'), color:owners.get('DMX') || '#94a3b8',
      rows:dmx.map((D, i) => port(`d${i}`, `${i + 1}`, D.universe, { dest:D.dest || '' })) });

    // ---- objects: XLR on the LK → small block per port; the end of a Veam → one group ----
    const groupOf = src => { const key = `${src.id}|objs`; if(!B.has(key)) add({ id:key, kind:'obj', dc, col:src.col + 1, title:t('Objects', 'Objecten'), sub:src.title, color:src.color, rows:[], anchor:{ block:src.id } }); return B.get(key); };
    const miniOf = (src, portKey, universe, dest) => { const key = `${src.id}|obj|${portKey}`; if(!B.has(key)) add({ id:key, kind:'obj', mini:true, dc, col:src.col + 1, title:dest, sub:'', color:uniHue(universe), rows:[port('r', '', universe, { dest })], anchor:{ block:src.id, port:portKey } }); return B.get(key); };

    // ---- edges ----
    const nodeBlock = l => l.feed ? B.get(`${dc}|node|${l.feed.node}`) : null;
    const pairs = new Map();   // one cable per (from port/block, to port/block): collect its lines
    const cable = (from, to, kind, color, lk, extra={}) => { const k = `${from.block}|${from.port}|${to.block}|${to.port}`; if(!pairs.has(k)){ pairs.set(k, edge(from, to, kind, color, [], extra)); } const e = pairs.get(k); if(!e.lines.includes(lk)) e.lines.push(lk); return e; };
    const tagRow = (b, key, lk) => { const r = b && rowOf(b, key); if(r && !r.lines.includes(lk)) r.lines.push(lk); };
    for(const l of P.lines){
      const key = lineKey(l), color = l.feed?.color || '#94a3b8';
      const nb = nodeBlock(l);
      const target = l.ownerKind === 'LK' ? B.get(`${dc}|lk|${l.owner}`) : l.ownerKind === 'VEAM' ? B.get(`${dc}|veam|${l.owner}`) : B.get(`${dc}|dmx`);
      if(!target) continue;
      // inside the rack: node port → (splitter) → socket of this LK / Veam, or straight to a loose DMX line
      const sock = l.ownerKind === 'DMX' ? null : socketOf(l.owner);
      if(nb){
        tagRow(nb, `p${l.feed.port}`, key);
        let src = { block:nb.id, port:`p${l.feed.port}` };
        if(l.feed.splitter){
          const sb = B.get(`${dc}|split|${l.feed.splitter}`);
          if(sb){ const inKey = `in${sb.rows.filter(r => r.isIn).findIndex(r => r.universe === l.universe)}`; tagRow(sb, inKey, key); tagRow(sb, `out${l.feed.out}`, key); cable(src, { block:sb.id, port:inKey }, 'patch', color, key, { universe:l.universe }); src = { block:sb.id, port:`out${l.feed.out}` }; }
        }
        if(l.ownerKind === 'DMX'){
          const dr = target.rows.find(r => r.universe === l.universe && r.dest === l.dest && !r.lines.length) || target.rows.find(r => r.universe === l.universe && r.dest === l.dest);
          if(dr){ dr.lines.push(key); cable(src, { block:target.id, port:dr.key }, 'dmx', uniHue(l.universe), key, { universe:l.universe }); }
          continue;
        }
        if(sock){ tagRow(sock.b, sock.r.key, key); cable(src, { block:sock.b.id, port:sock.r.key }, 'patch', color, key, { universe:l.universe }); }
      }
      // the multicore / Veam cable from the socket to the block
      const ownerColor = owners.get(l.owner) || color;
      if(sock) cable({ block:sock.b.id, port:sock.r.key }, { block:target.id, port:'in' }, l.ownerKind === 'LK' ? 'lk' : 'veam', ownerColor, key);
      // on the LK: an XLR port goes to its own object; a Veam-fed port goes through the Veam
      if(l.ownerKind === 'LK'){
        const slot = Math.ceil(l.port / 4);
        if(l.via){
          const [vid, vp] = l.via.split(' · ');
          const vb = B.get(`${dc}|veam|${vid}`);
          if(vb){
            tagRow(target, `g${slot}`, key); tagRow(vb, `p${vp}`, key);
            cable({ block:target.id, port:`g${slot}` }, { block:vb.id, port:'in' }, 'veam', ownerColor, key);
            if(l.dest){ const gb = groupOf(vb); let r = rowOf(gb, `r${vp}`); if(!r){ r = port(`r${vp}`, vp, l.universe, { dest:l.dest }); gb.rows.push(r); } r.lines.push(key); cable({ block:vb.id, port:`p${vp}` }, { block:gb.id, port:`r${vp}` }, 'dmx', uniHue(l.universe), key, { universe:l.universe }); }
          }
          continue;
        }
        tagRow(target, `p${l.port}`, key);
        if(l.dest){ const mb = miniOf(target, `p${l.port}`, l.universe, l.dest); mb.rows[0].lines.push(key); cable({ block:target.id, port:`p${l.port}` }, { block:mb.id, port:'r' }, 'dmx', uniHue(l.universe), key, { universe:l.universe }); }
      } else {
        tagRow(target, `p${l.port}`, key);
        if(l.dest){ const gb = groupOf(target); let r = rowOf(gb, `r${l.port}`); if(!r){ r = port(`r${l.port}`, `${l.port}`, l.universe, { dest:l.dest }); gb.rows.push(r); } r.lines.push(key); cable({ block:target.id, port:`p${l.port}` }, { block:gb.id, port:`r${l.port}` }, 'dmx', uniHue(l.universe), key, { universe:l.universe }); }
      }
    }
    // Veam linked to an LK slot without lines of its own yet: still draw the Veam cable
    for(const [vid, link] of linked){
      const lb = B.get(`${dc}|lk|${link.lk}`), vb = B.get(`${dc}|veam|${vid}`);
      if(lb && vb && !edges.some(e => e.from.block === lb.id && e.from.port === `g${link.slot}` && e.to.block === vb.id)) cable({ block:lb.id, port:`g${link.slot}` }, { block:vb.id, port:'in' }, 'veam', lb.color, `${dc}|${vid}|slot`);
    }
    // objects of a Veam not patched on a node yet
    for(const ve of veams){ const vb = B.get(`${dc}|veam|${ve.id}`); if(!vb) continue; for(const r of vb.rows){ if(r.universe == null || !r.dest || r.lines.length) continue; const key = `${dc}|${ve.id}|${r.key}|unfed`; lines.set(key, { universe:r.universe, dest:r.dest, owner:ve.id, ownerKind:'VEAM', label:`${ve.id} · ${r.label}` }); r.lines.push(key); const gb = groupOf(vb); let g = rowOf(gb, `r${r.label}`); if(!g){ g = port(`r${r.label}`, r.label, r.universe, { dest:r.dest }); gb.rows.push(g); } g.lines.push(key); cable({ block:vb.id, port:r.key }, { block:gb.id, port:`r${r.label}` }, 'dmx', uniHue(r.universe), key, { universe:r.universe }); } }
    // rack containers
    P.racks.forEach((R, ri) => { if(blocks.some(b => b.rack === rackKey(ri))) blocks.push({ id:rackKey(ri), kind:'rackbox', dc, title:rackName(ri), sub:R.rack ? `${R.rack.heightU}U${R.rack.articleKey ? ` · ${R.rack.articleKey}` : ''}` : '', members:blocks.filter(b => b.rack === rackKey(ri)).map(b => b.id) }); });
  }
  for(const b of blocks) if(b.kind === 'obj' && !b.mini) b.rows.sort((a, c) => Number(a.label) - Number(c.label));
  return { blocks, edges, lines };
}

// ---------- Sizes and port positions ----------
function blockSize(b){
  if(b.mini) return { w:W.mini, h:ROW + 6 };
  return { w:W[b.kind] || 180, h:HEAD + PAD + b.rows.reduce((n, r) => n + r.h, 0) + 4 };
}
function portOffset(b, key){
  if(b.mini) return (ROW + 6) / 2;
  if(key === 'in') return HEAD / 2;
  let y = HEAD + PAD;
  for(const r of b.rows){ if(r.key === key) return y + r.h / 2; y += r.h; }
  return HEAD / 2;
}

// ---------- Layout ----------
function layout(graph, dcs){
  const dir = flowState().dir, posSaved = flowState().pos;
  const byId = new Map(graph.blocks.map(b => [b.id, b]));
  const real = graph.blocks.filter(b => b.kind !== 'rackbox');
  const cols = new Map();
  for(const b of real){ b.size = blockSize(b); if(!cols.has(b.col)) cols.set(b.col, []); cols.get(b.col).push(b); }
  const feedOrder = new Map(); graph.edges.forEach((e, i) => { if(!feedOrder.has(e.to.block)) feedOrder.set(e.to.block, i); });
  const colIdx = [...cols.keys()].sort((a, b) => a - b);
  let main = 0;
  for(const c of colIdx){
    let list = cols.get(c).sort((a, b) => dcs.indexOf(a.dc) - dcs.indexOf(b.dc) || String(a.rack || '~').localeCompare(String(b.rack || '~')) || (feedOrder.get(a.id) ?? 1e9) - (feedOrder.get(b.id) ?? 1e9) || a.title.localeCompare(b.title, undefined, { numeric:true }));
    const widest = Math.max(...list.map(b => b.size.w));
    // wanted position along the column: anchored blocks exactly at their source row, other blocks at the
    // height of the row that feeds them; then stack without overlap
    const want = b => {
      const feed = b.anchor ? null : graph.edges.find(e => e.to.block === b.id);
      const src = b.anchor ? byId.get(b.anchor.block) : byId.get(feed?.from.block);
      if(!src?.pos) return null;
      const off = b.anchor?.port ? portOffset(src, b.anchor.port) - b.size.h / 2 : b.anchor ? 0 : Math.max(0, portOffset(src, feed.from.port) - HEAD);
      return dir === 'ltr' ? src.pos.y + off : src.pos.x;
    };
    const wants = new Map(list.map(b => [b.id, want(b)]));
    if(c > 0) list = list.slice().sort((a, b) => (wants.get(a.id) ?? 1e9) - (wants.get(b.id) ?? 1e9) || list.indexOf(a) - list.indexOf(b));
    let cross = 0, lastRack = null;
    for(const b of list){
      if(c === 0 && b.rack !== lastRack){ cross += b.rack ? 30 : (lastRack ? 18 : 0); lastRack = b.rack; }   // room for the rack title
      const saved = posSaved?.[b.dc]?.[dir]?.[b.id];
      const w = wants.get(b.id);
      const at = w == null ? cross : Math.max(cross, w);
      b.auto = dir === 'ltr' ? { x:main, y:at } : { x:at, y:-(main + b.size.h) };
      b.pos = saved ? { x:saved.x, y:saved.y } : b.auto;
      cross = at + (dir === 'ltr' ? b.size.h : b.size.w) + (b.mini || b.anchor ? Math.round(GAP() / 3) : (c === 0 && b.rack ? 10 : GAP()));
    }
    main += (dir === 'ltr' ? widest : Math.max(...list.map(b => b.size.h))) + COL_GAP();
  }
  if(dir === 'btt'){ const minY = Math.min(0, ...real.map(b => b.pos.y)); for(const b of real){ b.pos.y -= minY; b.auto.y -= minY; } }
  rackBoxes(graph, byId);
  return graph;
}
function rackBoxes(graph, byId){
  for(const r of graph.blocks){ if(r.kind !== 'rackbox') continue;
    const ms = r.members.map(id => byId.get(id)).filter(b => b?.pos);
    if(!ms.length) continue;
    const x0 = Math.min(...ms.map(b => b.pos.x)) - 10, y0 = Math.min(...ms.map(b => b.pos.y)) - 28;
    r.box = { x:x0, y:y0, w:Math.max(...ms.map(b => b.pos.x + b.size.w)) + 10 - x0, h:Math.max(...ms.map(b => b.pos.y + b.size.h)) + 10 - y0 };
  }
}
function anchor(b, key, side){
  if(flowState().dir === 'ltr') return { x:b.pos.x + (side === 'out' ? b.size.w : 0), y:b.pos.y + portOffset(b, key) };
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
const linesAttr = ls => esc((ls || []).join(' '));
function blockSvg(b){
  const { w, h } = b.size;
  if(b.mini){ const r = b.rows[0]; return `<g class="fb fb-obj fb-mini" data-block="${esc(b.id)}" data-dc="${esc(b.dc)}" transform="translate(${b.pos.x},${b.pos.y})" style="--c:${b.color}"><title>${esc(r.dest)} · U${esc(r.universe)}</title><rect class="fb-bg" width="${w}" height="${h}" rx="5"/><rect class="fb-bar" x="0" y="0" width="4" height="${h}" rx="2"/><g class="fp" data-port="r" data-lines="${linesAttr(r.lines)}"><text x="10" y="${h / 2 + 3.5}" class="fb-t" style="font-size:11px">${esc(trim(r.dest, 18))}</text><text x="${w - 8}" y="${h / 2 + 3.5}" class="fp-u" text-anchor="end" style="fill:${uniHue(r.universe)}">U${esc(r.universe)}</text></g></g>`; }
  let y = HEAD + PAD;
  const rows = b.rows.map(r => {
    const yy = y; y += r.h;
    if(r.type === 'head') return `<g class="fp-grp" transform="translate(0,${yy})"><text x="12" y="10" class="fp-g">${esc(r.label)}</text></g>`;
    if(r.type === 'slot') return `<g class="fp slot" data-port="${esc(r.key)}" data-lines="${linesAttr(r.lines)}" transform="translate(0,${yy})"><title>${esc(r.label)} → ${esc(r.dest)}</title><rect x="6" y="2" width="${w - 12}" height="${r.h - 4}" rx="3"/><text x="12" y="${r.h / 2 + 3.5}" class="fp-g" style="text-transform:none">${esc(r.label)}</text><text x="${w - 12}" y="${r.h / 2 + 3.5}" class="fp-u" text-anchor="end">→ ${esc(r.dest)}</text></g>`;
    const objRow = b.kind === 'obj';
    const uni = r.universe != null ? `<text x="30" y="${ROW / 2 + 3.5}" class="fp-u" style="fill:${uniHue(r.universe)}">U${esc(r.universe)}</text>` : '';
    const right = r.socket ? `<text x="${w - 12}" y="${ROW / 2 + 3.5}" class="fp-u" text-anchor="end" style="fill:${r.color || 'var(--text-3)'}">${esc(r.dest)}</text>` : objRow ? `<text x="60" y="${ROW / 2 + 3.5}" class="fp-d">${esc(trim(r.dest || r.to || '', 24))}</text>` : `<text x="${w - 12}" y="${ROW / 2 + 3.5}" class="fp-d" text-anchor="end">${esc(trim(r.dest || r.to || '', 14))}</text>`;
    const sockIcon = r.socket ? `<circle cx="${w - 28 - Math.min(60, (r.dest || '').length * 6)}" cy="${ROW / 2}" r="${r.socket === 'lk' ? 4.5 : 3.5}" class="fp-sock ${r.socket}" style="stroke:${r.color || 'var(--text-3)'}"/>` : '';
    return `<g class="fp ${r.isIn ? 'in' : ''} ${r.socket ? 'sock' : ''}" data-port="${esc(r.key)}" data-lines="${linesAttr(r.lines)}" transform="translate(0,${yy})"><title>${esc(r.label)}${r.universe != null ? ` · U${r.universe}` : ''}${r.dest ? ` · ${esc(r.dest)}` : ''}${r.to ? ` → ${esc(r.to)}` : ''}</title><rect x="6" y="1" width="${w - 12}" height="${ROW - 2}" rx="3"/><text x="12" y="${ROW / 2 + 3.5}" class="fp-n">${esc(r.label)}</text>${uni}${sockIcon}${right}</g>`;
  }).join('');
  const name = b.kind === 'lk' ? `<text x="10" y="17" class="fb-t fb-edit" data-rename="${esc(b.lkId)}">${esc(b.title)}${b.title !== b.lkId ? ` <tspan class="fb-id">(${esc(b.lkId)})</tspan>` : ''}</text>` : `<text x="10" y="17" class="fb-t">${esc(trim(b.title, 30))}</text>`;
  return `<g class="fb fb-${b.kind}" data-block="${esc(b.id)}" data-dc="${esc(b.dc)}" transform="translate(${b.pos.x},${b.pos.y})" style="--c:${b.color}">
    <rect class="fb-bg" width="${w}" height="${h}" rx="6"/><rect class="fb-head" width="${w}" height="${HEAD}" rx="6"/><rect class="fb-bar" x="0" y="0" width="4" height="${h}" rx="2"/>
    ${name}<text x="${w - 8}" y="17" class="fb-s" text-anchor="end">${esc(trim(b.sub, 26))}</text>${rows}</g>`;
}
function rackSvg(r){
  if(!r.box) return '';
  return `<g class="frack" data-rack="${esc(r.id)}"><rect x="${r.box.x}" y="${r.box.y}" width="${r.box.w}" height="${r.box.h}" rx="10"/><text x="${r.box.x + 12}" y="${r.box.y + 18}" class="frack-t">${I('rack', 12).replace('<svg', `<svg x="${r.box.x + 12}" y="${r.box.y + 7}"`)}</text><text x="${r.box.x + 30}" y="${r.box.y + 18}" class="frack-t">${esc(r.title)}</text><text x="${r.box.x + r.box.w - 10}" y="${r.box.y + 18}" class="frack-s" text-anchor="end">${esc(r.sub)}</text></g>`;
}

function render(){
  const root = App.$('#lkDetail'); if(!root) return;
  const m = M(); const dims = App.sortedDims();
  if(S.dc !== 'ALL' && !dims.includes(S.dc)) S.dc = 'ALL';
  const dcs = selectedDims();
  App.pageHead?.({ eyebrow:'Project', title:t('Signal Flow', 'Signaalstroom'), sub:t('How the data runs from the rack to every object. Hover a universe, a port or a line to follow it; click to pin.', 'Hoe de data van het rek naar elk object loopt. Beweeg over een universe, een poort of een lijn om hem te volgen; klik om vast te zetten.'),
    actions:`<button id="flFit">${I('zoomOut', 15)}${t('Fit', 'Passend')}</button><button id="flReset" title="${esc(t('Put every block back in its automatic place', 'Zet elk blok terug op zijn automatische plek'))}">${I('refresh', 15)}${t('Reset layout', 'Indeling herstellen')}</button><button id="flSvg" title="${esc(t('Save the drawing as an SVG image', 'Sla de tekening op als SVG-afbeelding'))}">${I('download', 15)}${t('Save image', 'Afbeelding opslaan')}</button>` });
  const graph = layout(buildGraph(dcs), dcs);
  S.layout = graph;
  const byId = new Map(graph.blocks.map(b => [b.id, b]));
  const unis = new Map();
  for(const [, l] of graph.lines) if(l.universe != null){ const k = String(l.universe); unis.set(k, (unis.get(k) || 0) + 1); }
  const uniList = [...unis.keys()].sort((a, b) => Number(a) - Number(b));
  const nodes = graph.blocks.filter(b => b.kind === 'node');
  const dir = flowState().dir;
  const side = `<aside class="fl-side">
    <div class="fl-sec"><div class="rb-label">DimCities</div>
      <button class="fl-item ${S.dc === 'ALL' ? 'on' : ''}" data-dc="ALL">${I('layers', 14)}<span>${t('All DimCities', 'Alle DimCities')}</span><em>${dims.length}</em></button>
      ${dims.map(dc => `<button class="fl-item ${S.dc === dc ? 'on' : ''}" data-dc="${esc(dc)}"><i class="dot" style="background:${App.dimColor(dc)}"></i><span>${esc(dc)}</span><em>${m.byDim.get(dc)?.lks?.size || 0} LK</em></button>`).join('')}</div>
    <div class="fl-sec"><div class="rb-label">${t('Universes', 'Universes')} <span class="subtle">${uniList.length}</span></div>
      <div class="fl-unis">${uniList.map(u => `<button class="fl-uni" data-uni="${u}" style="--u:${uniHue(u)}"><b>U${u}</b><span>${unis.get(u)}</span></button>`).join('') || `<div class="subtle" style="padding:4px 8px">${t('No universes patched', 'Geen universes gepatcht')}</div>`}</div></div>
    <div class="fl-sec"><div class="rb-label">${t('Nodes', 'Nodes')}</div>${nodes.map(n => `<div class="fl-node"><i style="background:${n.color}"></i><span>${esc(n.title)}</span><em>${esc(n.sub || byId.get(n.rack)?.title || '')}</em></div>`).join('') || `<div class="subtle" style="padding:4px 8px">${t('Place a rack or loose node first', 'Plaats eerst een rek of losse node')}</div>`}</div>
    <div class="fl-sec"><div class="rb-label">${t('Cables', 'Kabels')}</div><div class="fl-legend"><span><i class="lk"></i>${t('LK multicore', 'LK-multicore')}</span><span><i class="veam"></i>${t('Veam cable', 'Veam-kabel')}</span><span><i class="dmx"></i>${t('DMX line (universe colour)', 'DMX-lijn (universe-kleur)')}</span><span><i class="patch"></i>${t('Patch in the rack', 'Patch in het rek')}</span></div></div>
    <div class="fl-sec"><div class="rb-label">${t('Direction', 'Richting')}</div>
      <div class="segmented rb-full" id="flDir"><button data-v="ltr" class="${dir === 'ltr' ? 'active' : ''}">${t('Left → right', 'Links → rechts')}</button><button data-v="btt" class="${dir === 'btt' ? 'active' : ''}">${t('Bottom → top', 'Onder → boven')}</button></div>
      <label class="field" style="margin-top:10px">${t('Spacing', 'Afstand')} <span class="subtle" id="flSpVal">${Math.round((flowState().spacing || 1) * 100)}%</span><input type="range" id="flSpacing" min="50" max="250" step="10" value="${Math.round((flowState().spacing || 1) * 100)}"></label>
      <div class="hint" style="margin-top:8px">${t('Hover a block for its whole flow, a port for that line only. Click to pin, Esc to release. Drag a block to move it; click an LK name to rename it.', 'Beweeg over een blok voor zijn hele flow, over een poort voor alleen die lijn. Klik om vast te zetten, Esc om los te laten. Sleep een blok om het te verplaatsen; klik op een LK-naam om te hernoemen.')}</div></div>
  </aside>`;
  const defs = `<defs><marker id="flArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`;
  const edgesSvg = graph.edges.map(e => { const d = edgePath(e, byId); const a = byId.get(e.from.block), z = byId.get(e.to.block); return `<path class="fe c-${e.cable}" data-edge="${e.id}" data-lines="${linesAttr(e.lines)}" data-from="${esc(e.from.block)}" data-to="${esc(e.to.block)}" data-fromport="${esc(e.from.port)}" data-toport="${esc(e.to.port)}" d="${d}" style="--c:${e.color}"/><path class="fe-hit" data-hit="${e.id}" data-lines="${linesAttr(e.lines)}" d="${d}"><title>${esc({ lk:t('LK multicore', 'LK-multicore'), veam:t('Veam cable', 'Veam-kabel'), dmx:'DMX', patch:t('Patch', 'Patch') }[e.cable])}${e.universe != null ? ` U${e.universe}` : ''} · ${esc(a?.title || '')} → ${esc(z?.title || '')}${e.lines.length > 1 ? ` · ${e.lines.length} ${t('lines', 'lijnen')}` : ''}</title></path>`; }).join('');
  const canvas = `<div class="fl-canvas" id="flCanvas"><svg id="flSvg" xmlns="http://www.w3.org/2000/svg">${defs}<g id="flView" transform="translate(${S.tx},${S.ty}) scale(${S.zoom})"><g id="flRacks">${graph.blocks.filter(b => b.kind === 'rackbox').map(rackSvg).join('')}</g><g id="flEdges">${edgesSvg}</g><g id="flBlocks">${graph.blocks.filter(b => b.kind !== 'rackbox').map(blockSvg).join('')}</g></g></svg>
    ${graph.edges.length ? '' : `<div class="empty fl-empty">${I('cable', 30)}<h3>${t('Nothing to draw yet', 'Nog niets te tekenen')}</h3><p>${t('Import a patch and place a rack or loose node in a DimCity; the flow appears here.', 'Importeer een patch en plaats een rek of losse node in een DimCity; de stroom verschijnt hier.')}</p></div>`}</div>`;
  root.innerHTML = `<div class="fl-wrap">${side}${canvas}</div>`;
  bind(root, graph, byId);
  if(S.fitNext){ S.fitNext = false; fit(); }
}

// ---------- Interaction ----------
function setView(){ const v = document.getElementById('flView'); if(v) v.setAttribute('transform', `translate(${S.tx},${S.ty}) scale(${S.zoom})`); }
function fit(){
  const g = S.layout, c = document.getElementById('flCanvas'); if(!g || !c) return;
  const bs = g.blocks.filter(b => b.pos); if(!bs.length) return;
  const minX = Math.min(...bs.map(b => b.pos.x)) - 12, minY = Math.min(...bs.map(b => b.pos.y)) - 30;
  const maxX = Math.max(...bs.map(b => b.pos.x + b.size.w)) + 12, maxY = Math.max(...bs.map(b => b.pos.y + b.size.h)) + 12;
  const r = c.getBoundingClientRect();
  S.zoom = Math.max(.2, Math.min(1.4, Math.min((r.width - 40) / (maxX - minX), (r.height - 40) / (maxY - minY))));
  S.tx = 20 - minX * S.zoom + ((r.width - 40) - (maxX - minX) * S.zoom) / 2; S.ty = 20 - minY * S.zoom;
  setView();
}
// What lights up — everything is a set of DMX lines:
//  - a universe: every line that carries it;  - a port or a cable: the lines on it;
//  - a block: every line that runs through it (upstream and downstream alike)
function highlight(root, sel){
  if(S.pin) sel = S.pin;
  sel = sel || null;
  root.querySelectorAll('.fe, .fb, .fp, .frack').forEach(el => el.classList.remove('lit', 'flow'));
  if(!sel) return;
  const g = S.layout; if(!g) return;
  const edges = [...root.querySelectorAll('.fe')];
  const ls = el => (el.dataset.lines || '').split(' ').filter(Boolean);
  let want = new Set();
  if(sel.uni != null) for(const [k, l] of g.lines) if(String(l.universe) === String(sel.uni)) want.add(k);
  if(sel.lines) sel.lines.forEach(k => want.add(k));
  if(sel.block && sel.port){ const p = root.querySelector(`.fb[data-block="${CSS.escape(sel.block)}"] .fp[data-port="${CSS.escape(sel.port)}"]`); ls(p).forEach(k => want.add(k)); if(!want.size) for(const e of edges) if((e.dataset.from === sel.block && e.dataset.fromport === sel.port) || (e.dataset.to === sel.block && e.dataset.toport === sel.port)) ls(e).forEach(k => want.add(k)); }
  else if(sel.block){ for(const e of edges) if(e.dataset.from === sel.block || e.dataset.to === sel.block) ls(e).forEach(k => want.add(k)); if(sel.block.includes('|rack|')){ const r = g.blocks.find(b => b.id === sel.block); for(const e of edges) if(r?.members.includes(e.dataset.from) || r?.members.includes(e.dataset.to)) ls(e).forEach(k => want.add(k)); } }
  if(!want.size) return;
  const litBlocks = new Set();
  for(const e of edges) if(ls(e).some(k => want.has(k))){ e.classList.add('lit', 'flow'); litBlocks.add(e.dataset.from); litBlocks.add(e.dataset.to); }
  if(sel.block) litBlocks.add(sel.block);
  root.querySelectorAll('.fb').forEach(b => { if(litBlocks.has(b.dataset.block)) b.classList.add('lit'); });
  root.querySelectorAll('.fp').forEach(p => { if(ls(p).some(k => want.has(k))) p.classList.add('lit'); });
  root.querySelectorAll('.frack').forEach(r => { const rb = g.blocks.find(b => b.id === r.dataset.rack); if(rb?.members.some(id => litBlocks.has(id))) r.classList.add('lit'); });
}
function bind(root, graph, byId){
  const canvas = root.querySelector('#flCanvas'), svg = root.querySelector('#flSvg'); if(!svg) return;
  root.querySelectorAll('[data-dc]').forEach(b => b.onclick = () => { S.dc = b.dataset.dc; S.pin = null; S.fitNext = true; render(); });
  root.querySelectorAll('#flDir button').forEach(b => b.onclick = () => { flowState().dir = b.dataset.v; M().ui.dirty = true; S.fitNext = true; render(); });
  App.$('#flFit')?.addEventListener('click', fit);
  App.$('#flReset')?.addEventListener('click', () => { const f = flowState(); for(const dc of selectedDims()) delete f.pos[dc]; M().ui.dirty = true; S.fitNext = true; render(); });
  App.$('#flSvg')?.addEventListener('click', () => exportSvg(root));
  const unpinUi = () => root.querySelectorAll('.fl-uni.pinned').forEach(x => x.classList.remove('pinned'));
  const pinToggle = sel => { S.pin = S.pin && JSON.stringify(S.pin) === JSON.stringify(sel) ? null : sel; unpinUi(); if(S.pin?.uni != null) root.querySelector(`.fl-uni[data-uni="${S.pin.uni}"]`)?.classList.add('pinned'); highlight(root); };
  root.querySelectorAll('.fl-uni').forEach(b => { b.onmouseenter = () => highlight(root, { uni:b.dataset.uni }); b.onmouseleave = () => highlight(root); b.onclick = () => pinToggle({ uni:b.dataset.uni }); if(S.pin?.uni === b.dataset.uni) b.classList.add('pinned'); });
  root.querySelectorAll('.fe-hit').forEach(e => { const sel = { lines:(e.dataset.lines || '').split(' ').filter(Boolean) }; e.onmouseenter = () => highlight(root, sel); e.onmouseleave = () => highlight(root); e.onclick = ev => { ev.stopPropagation(); pinToggle(sel); }; });
  root.querySelectorAll('.fb').forEach(b => {
    b.onmouseenter = () => { if(!S.drag) highlight(root, { block:b.dataset.block }); };
    b.onmouseleave = () => { if(!S.drag) highlight(root); };
    b.querySelectorAll('.fp').forEach(p => { p.onmouseenter = ev => { ev.stopPropagation(); if(!S.drag) highlight(root, { block:b.dataset.block, port:p.dataset.port }); }; p.onmouseleave = ev => { ev.stopPropagation(); if(!S.drag) highlight(root, { block:b.dataset.block }); }; });
  });
  root.querySelectorAll('.frack').forEach(r => { r.onmouseenter = () => { if(!S.drag) highlight(root, { block:r.dataset.rack }); }; r.onmouseleave = () => { if(!S.drag) highlight(root); }; });
  const sp = root.querySelector('#flSpacing'); if(sp){ sp.oninput = () => { root.querySelector('#flSpVal').textContent = `${sp.value}%`; }; sp.onchange = () => { flowState().spacing = Number(sp.value) / 100; M().ui.dirty = true; S.fitNext = true; render(); }; }
  const onKey = e => { if(e.key === 'Escape' && S.pin){ S.pin = null; unpinUi(); highlight(root); } };
  document.addEventListener('keydown', onKey);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const k = Math.exp(-e.deltaY * 0.0015); const z = Math.max(.2, Math.min(3, S.zoom * k)); S.tx = px - (px - S.tx) * (z / S.zoom); S.ty = py - (py - S.ty) * (z / S.zoom); S.zoom = z; setView(); }, { passive:false });
  svg.addEventListener('mousedown', e => {
    const blockEl = e.target.closest('.fb');
    if(blockEl){
      const b = byId.get(blockEl.dataset.block);
      S.drag = { b, el:blockEl, sx:e.clientX, sy:e.clientY, x0:b.pos.x, y0:b.pos.y, moved:false, port:e.target.closest('.fp')?.dataset.port || null, rename:e.target.closest('[data-rename]')?.dataset.rename || null };
    } else S.pan = { sx:e.clientX, sy:e.clientY, tx:S.tx, ty:S.ty, moved:false };
    e.preventDefault();
  });
  const redrawEdges = b => root.querySelectorAll(`.fe[data-from="${CSS.escape(b.id)}"], .fe[data-to="${CSS.escape(b.id)}"]`).forEach(p => { const ed = graph.edges.find(x => x.id === p.dataset.edge); const dd = edgePath(ed, byId); p.setAttribute('d', dd); root.querySelector(`.fe-hit[data-hit="${p.dataset.edge}"]`)?.setAttribute('d', dd); });
  const redrawRack = b => { if(!b.rack) return; rackBoxes(graph, byId); const r = byId.get(b.rack); const el = root.querySelector(`.frack[data-rack="${CSS.escape(b.rack)}"]`); if(el && r?.box){ el.outerHTML = rackSvg(r); root.querySelector(`.frack[data-rack="${CSS.escape(b.rack)}"]`).onmouseenter = () => highlight(root, { block:b.rack }); } };
  const mv = e => {
    if(S.drag){
      const d = S.drag, dx = (e.clientX - d.sx) / S.zoom, dy = (e.clientY - d.sy) / S.zoom;
      if(!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.moved = true; d.b.pos = { x:Math.round(d.x0 + dx), y:Math.round(d.y0 + dy) };
      d.el.setAttribute('transform', `translate(${d.b.pos.x},${d.b.pos.y})`);
      redrawEdges(d.b); redrawRack(d.b);
    } else if(S.pan){ if(Math.hypot(e.clientX - S.pan.sx, e.clientY - S.pan.sy) > 3) S.pan.moved = true; S.tx = S.pan.tx + (e.clientX - S.pan.sx); S.ty = S.pan.ty + (e.clientY - S.pan.sy); setView(); }
  };
  const up = () => {
    if(S.drag){
      const d = S.drag; S.drag = null;
      if(d.moved){ const f = flowState(); ((f.pos[d.b.dc] ||= {})[f.dir] ||= {})[d.b.id] = { ...d.b.pos }; M().ui.dirty = true; window.PatchHistory?.label?.(t('Moved a block in the signal flow', 'Blok verplaatst in de signaalstroom')); }
      else if(d.rename) renameLk(d.b.dc, d.rename);
      else pinToggle(d.port ? { block:d.b.id, port:d.port } : { block:d.b.id });
    } else if(S.pan){ if(!S.pan.moved && S.pin){ S.pin = null; unpinUi(); highlight(root); } S.pan = null; }
  };
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  S.cleanup?.(); S.cleanup = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.removeEventListener('keydown', onKey); };
  highlight(root);
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
  const svg = root.querySelector('#flSvg'); const g = S.layout; if(!svg || !g) return;
  const bs = g.blocks.filter(b => b.pos); if(!bs.length) return;
  const minX = Math.min(...bs.map(b => b.pos.x)) - 24, minY = Math.min(...bs.map(b => b.pos.y)) - 40;
  const maxX = Math.max(...bs.map(b => b.pos.x + b.size.w)) + 24, maxY = Math.max(...bs.map(b => b.pos.y + b.size.h)) + 24;
  const css = `.fe{fill:none;opacity:.9}.c-lk{stroke-width:6}.c-veam{stroke-width:4}.c-patch{stroke-width:2.5}.c-dmx{stroke-width:2}.fe-hit{display:none}.fb-bg{fill:#fff;stroke:#334155}.fb-head{fill:#e2e8f0}.fb-t{font:600 12px sans-serif;fill:#0f172a}.fb-id{font-weight:400;fill:#64748b}.fb-s{font:10.5px sans-serif;fill:#64748b}.fp rect{fill:#f1f5f9}.fp-n{font:10px monospace;fill:#64748b}.fp-u{font:600 10.5px sans-serif;fill:#0f172a}.fp-d{font:9.5px sans-serif;fill:#334155}.fp-g{font:600 9.5px sans-serif;fill:#64748b;text-transform:uppercase}.fp-sock{fill:#fff;stroke-width:2}.frack rect{fill:#f8fafc;stroke:#94a3b8;stroke-width:1.5}.frack-t{font:700 12px sans-serif;fill:#0f172a}.frack-s{font:10px sans-serif;fill:#64748b}`;
  const tmp = document.createElement('div'); tmp.innerHTML = svg.querySelector('#flView').innerHTML;
  tmp.querySelectorAll('[style]').forEach(el => { const c = el.style.getPropertyValue('--c'); if(c){ if(el.classList.contains('fe')) el.setAttribute('stroke', c); if(el.classList.contains('fb')) el.querySelector('.fb-bar')?.setAttribute('fill', c); } });
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}"><style>${css}</style><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#fff"/>${svg.querySelector('defs').outerHTML.replace('context-stroke', '#334155')}${tmp.innerHTML}</svg>`;
  const name = `${(M().projectMeta?.project || 'PatchLab').replace(/[^a-z0-9_-]+/gi, '_')}-signal-flow-${S.dc}.svg`;
  const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([out], { type:'image/svg+xml' })), download:name });
  document.body.appendChild(a); a.click(); a.remove();
  App.ui.toast(t('Drawing saved as SVG', 'Tekening opgeslagen als SVG'));
}

window.Flow = { render, fit, buildGraph };
