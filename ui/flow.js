// ui/flow.js — Signal Flow page (issue #3)
// The cabling the way it is on the floor: the rack, drawn like in the Rack Builder (rails, U numbers, the
// faces of nodes, splitters and panels with their sockets) → one thick LK multicore per LK block → a Veam
// cable per linked Veam → thin DMX lines to the objects (locations). Line thickness = cable type
// (LK > Veam > DMX); every LK and every Veam has a colour of its own (never twice the same), DMX lines the colour
// of their universe. Every line leaves a block straight out of its side and never runs through a block.
// The patch inside a rack (node port → splitter → socket) is drawn only while that path is lit.
// Hover a universe, a port, a line or a block and that path comes alive; click to pin it. Blocks can be
// dragged (a rack moves as one), selected with a rubber band and moved together; they never overlap.
// The arrangement per DimCity, the zoom and the names of LK blocks are kept in the project.
// MODEL.flow = { v:2, dir:'ltr', spacing, labels:{ [dc]:{ [lkId]:name } },
//                pos:{ [dc]:{ [dir]:{ [blockId]:{x,y} } } }, view:{ [dcKey]:{ zoom, tx, ty } } }
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;
const M = () => App.getMODEL();
const E = () => window.RackEngine;
const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
const t = (en, nl) => (lang() === 'nl' ? nl : en);
const uniHue = u => `hsl(${(Number(u || 0) * 47) % 360} 72% 58%)`;

const S = { layer:'all', dc:'ALL', zoom:1, tx:40, ty:30, tool:'select', sel:new Set(), view:{}, layout:null, drag:null, pan:null, marquee:null, pin:null, hoverEl:null, space:false, fitNext:true };
const ROW = 15, HEAD = 26, PAD = 8, MINI_H = ROW;
// rack geometry, after the Rack Builder: rails with U numbers, a bay of 500 px, 34 px per U
const UH = 34, RAIL = 22, FRAME = 6, EAR = 11, LABEL_W = 150, BAY = 490, TITLE = 24, STACK_GAP = 4;
const sp = () => flowState().spacing || 1;
const GAP = () => Math.round(22 * sp()), COL_GAP = () => Math.round(130 * sp()), DC_GAP = () => Math.round(90 * sp());
const W = { lk:210, veam:170, dmx:200, obj:210, mini:160, switch:230, cat:210, ext:220, netnode:200 };
// colours of the rack drawing: dark like the Rack Builder in the app, light on paper
const THEME = {
  app:  { frame:'#2a2f38', bg:'#111317', rail:'#1a1d23', railLine:'#20242b', railText:'#7d8594', slot:'#22262d', face:'url(#flFace)', faceStroke:'#3a414d', ear:'#323843', screw:'#151820', screwRing:'#4a5260', text:'#e8eaef', text3:'#7d8594', portBg:'#0d0f13', portText:'#a3aab7', rj:'#5a6372', rjBg:'#0b0d10', badgeText:'#0b0d10', title:'var(--text)', sub:'var(--text-3)', font:'var(--font,system-ui)', mono:'var(--mono,monospace)' },
  print:{ frame:'#0f172a', bg:'#ffffff', rail:'#e2e8f0', railLine:'#cbd5e1', railText:'#1e293b', slot:'#94a3b8', face:'#ffffff', faceStroke:'#0f172a', ear:'#e2e8f0', screw:'#cbd5e1', screwRing:'#64748b', text:'#0f172a', text3:'#475569', portBg:null, portText:'#0f172a', rj:'#475569', rjBg:'#f1f5f9', badgeText:'#ffffff', title:'#0f172a', sub:'#64748b', font:'Helvetica,Arial,sans-serif', mono:'Menlo,Consolas,monospace' }
};

function flowState(){
  const m = M();
  if(!m.flow || typeof m.flow !== 'object') m.flow = { v:2, dir:'ltr', labels:{}, pos:{}, view:{} };
  if(m.flow.v !== 2){ m.flow.pos = {}; m.flow.view = {}; m.flow.v = 2; }   // older arrangements no longer fit the drawing
  m.flow.labels ||= {}; m.flow.pos ||= {}; m.flow.view ||= {}; m.flow.dir = 'ltr'; m.flow.spacing ||= 1;   // one direction: the ports sit on the sides of the blocks
  return m.flow;
}
const label = (dc, lkId) => flowState().labels?.[dc]?.[lkId] || lkId;
const trim = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const linesAttr = ls => esc((ls || []).join(' '));

// ---------- Graph ----------
// block: { id, kind:'rack'|'stack'|'lk'|'veam'|'dmx'|'obj', dc, col, title, sub, color,
//          rows:[{ key, type:'head'|'port'|'slot', h, label, universe, dest, lines }]   (lk / veam / dmx / obj)
//          units:[{ iid, kind, u, hu, name, meta, color, badge, badgeColor, groups:[[port]], lines }]  (rack / stack)
//          port: { key, cls:'dmx'|'in'|'rj'|'sfp'|'lk'|'vim', label, color, free, lines, title } }
// edge:  { id, from:{block,port}, to:{block,port}, cable:'patch'|'lk'|'veam'|'dmx', color, lines, universe, inner }
// line:  one DMX line of the show (an LK port, a Veam port or a loose DMX line) with its universe
function buildGraph(dcs){
  const m = M(), blocks = [], edges = [], lines = new Map(), nodes = [];
  const B = new Map();
  const add = b => { b.rows ||= []; B.set(b.id, b); blocks.push(b); return b; };
  const rowOf = (b, key) => b.rows.find(r => r.key === key);
  const port = (key, label, universe, extra={}) => ({ key, type:'port', h:ROW, label, universe:universe ?? null, lines:[], ...extra });
  const edge = (from, to, cable, color, lineKeys, extra={}) => { const e = { id:`e${edges.length}`, from, to, cable, color, lines:[...new Set(lineKeys)], inner:from.block === to.block, ...extra }; edges.push(e); return e; };
  const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';
  const safeHex = (c, d) => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : d;
  const find = (key, id) => (m.networkDevices?.[key] || []).find(x => x.id === id);
  const KIND_KEY = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' };
  const KIND_COLOR = { node:'#4c9dff', splitter:'#35c47c', switch:'#a78bfa', panel:'#94a3b8' };
  const KIND_NAME = { node:t('Node', 'Node'), splitter:t('Splitter', 'Splitter'), switch:t('Switch', 'Switch'), panel:t('Panel', 'Paneel') };
  for(const dc of dcs){
    if(!m.byDim.get(dc)) continue;
    const P = E().computeRackPlan(m, dc);
    const owners = E().ownerColors(P);
    const lineKey = l => `${dc}|${l.owner}|${l.port}|${String(l.label || '').replace(/\s+/g, '_')}`;
    for(const l of P.lines) lines.set(lineKey(l), { universe:l.universe, dest:l.dest, owner:l.owner, ownerKind:l.ownerKind, label:l.label, dc });
    const refs = new Map();   // `node:N1:3`, `owner:LK101`, `split:S1:in0` / `split:S1:out2` -> { block, key }
    const pp = (key, cls, label, color, extra={}) => ({ key, cls, label:String(label ?? ''), color:color || null, free:!!extra.free, lines:[], title:extra.title || '', owner:extra.owner || null });
    const rackName = ri => P.racks[ri]?.placement.name || P.racks[ri]?.rack?.name || `Rack ${ri + 1}`;
    // one unit (a face with its ports) of a rack or of a loose device, as the Rack Builder draws it
    const unitOf = (it, ty, ri, blockId) => {
      const u = { iid:it.iid, kind:it.kind, u:it.u || 1, hu:Math.max(1, Number(ty.heightU) || 1), name:window.ShortName ? window.ShortName.of(ty) : typeName(ty), meta:KIND_NAME[it.kind] || it.kind, color:safeHex(ty.color, KIND_COLOR[it.kind]), badge:null, badgeColor:null, groups:[], lines:[], side:ty.width === 'half' ? (it.side || 'L') : null, special:ty.special || null };
      const grp = ps => { if(ps.length) u.groups.push(ps); };
      const inRack = x => ri < 0 ? x.loose : x.rack === ri;
      if(it.kind === 'node'){
        const n = P.nodes.find(x => x.iid === it.iid && inRack(x));
        if(n){
          u.badge = n.label; u.badgeColor = n.color;
          nodes.push({ label:n.label, title:`${n.label} · ${u.name}`, color:n.color, where:n.loose ? (n.name || t('Loose node', 'Losse node')) : rackName(ri) });
          grp(n.ports.map((p, i) => { const k = `n${i + 1}`; refs.set(`node:${n.label}:${i + 1}`, { block:blockId, port:k }); return pp(k, 'dmx', p ? `U${p.universe}` : i + 1, (p && owners.get(p.owner)) || n.color, { free:!p, title:p ? `${n.label} ${t('port', 'poort')} ${i + 1} · U${p.universe} → ${p.to}` : `${n.label} ${t('port', 'poort')} ${i + 1} · ${t('free', 'vrij')}` }); }));
          const eth = Math.min(2, Math.max(1, Number(ty.ethernetCount) || 1));
          grp(Array.from({ length:eth }, (_, i) => { refs.set(`eth:${n.label}:${i + 1}`, { block:blockId, port:`e${i + 1}` }); return pp(`e${i + 1}`, 'rj', eth > 1 ? i + 1 : '', null, { title:eth > 1 ? `${t('Network', 'Netwerk')} ${i + 1}` : t('Network', 'Netwerk') }); }));
        }
      } else if(it.kind === 'splitter'){
        const s = P.splitters.find(x => x.iid === it.iid && x.rack === ri);
        if(s){
          u.badge = s.label; u.badgeColor = '#475569';
          grp(s.inputs.length ? s.inputs.map((uni, i) => { refs.set(`split:${s.label}:in${i}`, { block:blockId, port:`i${i}` }); return pp(`i${i}`, 'in', `U${uni}`, s.feedColor, { title:`${s.label} ${t('input', 'ingang')} · U${uni}` }); }) : [pp('i0', 'in', 'A', null, { free:true, title:t('Input — not used', 'Ingang — niet gebruikt') })]);
          grp(s.outputs.map((o, i) => { refs.set(`split:${s.label}:out${i + 1}`, { block:blockId, port:`o${i + 1}` }); return pp(`o${i + 1}`, 'dmx', o ? String(o.owner).replace(/^(LK|V)/, '') : i + 1, (o && owners.get(o.owner)) || o?.feed?.color, { free:!o, title:o ? `${s.label} ${t('out', 'uit')} ${i + 1} → ${o.label}` : `${s.label} ${t('out', 'uit')} ${i + 1} · ${t('free', 'vrij')}` }); }));
        }
      } else if(it.kind === 'panel'){
        const gs = P.groups.filter(g => g.iid === it.iid && inRack(g)), vs = P.soloVims.filter(v => v.iid === it.iid && inRack(v));
        for(const g of gs){
          const ps = [pp(`s${g.label}`, 'lk', g.lk ? g.lk.id.replace(/^LK/, '') : '', g.lk ? owners.get(g.lk.id) : null, { free:!g.lk, owner:g.lk?.id, title:`${g.label}: ${g.lk ? g.lk.id : t('free', 'vrij')}` })];
          if(g.lk) refs.set(`owner:${g.lk.id}`, { block:blockId, port:`s${g.label}` });
          // the Veam4 sockets of an LK belong to that LK: a Veam linked to it shows there (its cable runs through the LK, not from this socket)
          for(const v of g.vims){ const vid = v.used?.id || v.linked || null; ps.push(pp(`s${v.label}`, 'vim', vid ? vid.replace(/^V/, '') : '', vid ? owners.get(vid) : null, { free:!vid, owner:v.used?.id, title:`${v.label}: ${vid ? vid : t('belongs to', 'hoort bij') + ' ' + (g.lk?.id || g.label)}` })); if(v.used) refs.set(`owner:${v.used.id}`, { block:blockId, port:`s${v.label}` }); }
          grp(ps);
        }
        for(const g of window.SwPorts.panelGroups(ty)) grp(g.items.map(x => pp(`st${g.sub || g.cls}${x.no}`, g.cls, x.no, null, { title:x.title })));
        grp(vs.map(v => { if(v.used) refs.set(`owner:${v.used.id}`, { block:blockId, port:`s${v.label}` }); return pp(`s${v.label}`, 'vim', v.used ? v.used.id.replace(/^V/, '') : '', v.used ? owners.get(v.used.id) : null, { free:!v.used, owner:v.used?.id, title:`${v.label}: ${v.used ? v.used.id : t('free', 'vrij')}` }); }));
      } else if(ty.special){
        u.groups = [];   // the face is drawn as a picture of the real set
      } else {
        const SP = window.SwPorts, panels = ri >= 0 ? (P.racks[ri]?.rack?.items || []).filter(x => x.kind === 'panel').map(x => find('panelTypes', x.typeId)) : [];
        grp(Array.from({ length:SP.front(ty) }, (_, i) => pp(`r${i + 1}`, 'rj', i + 1, null, { title:`${t('Port', 'Poort')} ${i + 1}` })));
        if(!SP.fibreOnPanel(ty, panels)) grp(Array.from({ length:Number(ty.sfpCount) || 0 }, (_, i) => pp(`f${i + 1}`, 'sfp', SP.short(ty, i + 1), null, { title:SP.label(ty, i + 1) })));
      }
      return u;
    };
    // ---- racks (column 0): one block per rack, drawn like in the Rack Builder ----
    P.racks.forEach((R, ri) => {
      if(!R.rack) return;
      const id = `${dc}|rack|${ri}`;
      const units = (R.rack.items || []).slice().sort((a, b) => (a.u - b.u) || ((a.side === 'R') - (b.side === 'R'))).map(it => { if(it.kind === 'blind') return { iid:it.iid, kind:'blind', u:it.u || 1, hu:1, name:'', meta:'', color:'#000000', badge:null, badgeColor:null, groups:[], lines:[], side:it.side || 'L', blind:true }; const ty = find(KIND_KEY[it.kind], it.typeId); return ty ? unitOf(it, ty, ri, id) : null; }).filter(Boolean);
      add({ id, kind:'rack', dc, col:0, H:Math.max(1, Number(R.rack.heightU) || 1), units, title:rackName(ri), sub:`${R.rack.heightU}U${R.rack.articleKey ? ` · ${R.rack.articleKey}` : ''}`, color:'#94a3b8' });
    });
    // ---- loose devices: a node with the spiders it feeds as one stack; other spiders on their own ----
    const feederOf = ownerId => { const tally = new Map(); for(const l of P.lines) if(l.owner === ownerId && l.feed?.node) tally.set(l.feed.node, (tally.get(l.feed.node) || 0) + 1); return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
    const stackOf = new Map();   // node label -> stack block
    for(const n of P.nodes.filter(x => x.loose)){
      const id = `${dc}|node|${n.label}`;
      const b = add({ id, kind:'stack', dc, col:0, units:[unitOf({ iid:n.iid, kind:'node', u:1 }, n.type, -1, id)], title:`${n.label} · ${n.name || t('Loose node', 'Losse node')}`, sub:typeName(n.type), color:n.color });
      stackOf.set(n.label, b);
    }
    const spiderUnit = (g, isLk, blockId) => {
      const used = isLk ? g.lk : g.used;
      const key = `s${g.label}`;
      refs.set(`owner:${used.id}`, { block:blockId, port:key });
      const p = isLk ? pp(key, 'lk', used.id.replace(/^LK/, ''), owners.get(used.id), { owner:used.id, title:`${g.label}: ${used.id}` }) : pp(key, 'vim', used.id.replace(/^V/, ''), owners.get(used.id), { owner:used.id, title:`${g.label}: ${used.id}` });
      return { iid:g.iid, kind:'panel', u:1, hu:1, name:isLk ? t('LK spider', 'LK-spin') : t('Veam4 spider', 'Veam4-spin'), meta:g.label, color:owners.get(used.id) || '#94a3b8', badge:null, groups:[[p]], lines:[] };
    };
    const spiders = [...P.groups.filter(g => g.loose && g.lk).map(g => ({ g, isLk:true, owner:g.lk.id })), ...P.soloVims.filter(v => v.loose && v.used).map(v => ({ g:v, isLk:false, owner:v.used.id }))];
    for(const sdef of spiders){
      const feeder = feederOf(sdef.owner);
      const host = feeder ? stackOf.get(feeder) : null;
      if(host){ host.units.push(spiderUnit(sdef.g, sdef.isLk, host.id)); continue; }
      const id = `${dc}|spider|${sdef.g.label}`;
      add({ id, kind:'stack', dc, col:feeder ? 0.5 : 0, units:[spiderUnit(sdef.g, sdef.isLk, id)], title:sdef.isLk ? t('Loose LK spider', 'Losse LK-spin') : t('Loose Veam4 spider', 'Losse Veam4-spin'), sub:sdef.g.label, color:owners.get(sdef.owner) || '#94a3b8' });
    }

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
          if(eff !== 'XLR12') rows.push({ key:`h${s}`, type:'head', h:13, label:`XLR ${(s - 1) * 4 + 1}–${s * 4}` });
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
    const pairs = new Map();   // one cable per (from port, to port): collect its lines
    const cable = (from, to, kind, color, lk, extra={}) => { const k = `${from.block}|${from.port}|${to.block}|${to.port}`; if(!pairs.has(k)) pairs.set(k, edge(from, to, kind, color, [], extra)); const e = pairs.get(k); if(!e.lines.includes(lk)) e.lines.push(lk); return e; };
    const tagRow = (b, key, lk) => { const r = b && rowOf(b, key); if(r && !r.lines.includes(lk)) r.lines.push(lk); };
    const tagRef = (ref, lk) => { if(!ref) return; const b = B.get(ref.block); for(const u of b?.units || []){ const p = u.groups.flat().find(x => x.key === ref.port); if(p){ if(!p.lines.includes(lk)) p.lines.push(lk); if(!u.lines.includes(lk)) u.lines.push(lk); return; } } };
    for(const l of P.lines){
      const key = lineKey(l), color = owners.get(l.owner) || l.feed?.color || '#94a3b8';
      const target = l.ownerKind === 'LK' ? B.get(`${dc}|lk|${l.owner}`) : l.ownerKind === 'VEAM' ? B.get(`${dc}|veam|${l.owner}`) : B.get(`${dc}|dmx`);
      if(!target) continue;
      const np = l.feed?.node ? refs.get(`node:${l.feed.node}:${l.feed.port}`) : null;
      const sock = l.ownerKind === 'DMX' ? null : refs.get(`owner:${l.owner}`);
      if(np){
        tagRef(np, key);
        let src = np;
        if(l.feed.splitter){
          const spl = P.splitters.find(x => x.label === l.feed.splitter);
          const inRef = refs.get(`split:${l.feed.splitter}:in${Math.max(0, spl ? spl.inputs.indexOf(l.universe) : 0)}`), outRef = refs.get(`split:${l.feed.splitter}:out${l.feed.out}`);
          if(inRef && outRef){ tagRef(inRef, key); tagRef(outRef, key); cable(src, inRef, 'patch', color, key, { universe:l.universe }); src = outRef; }
        }
        if(l.ownerKind === 'DMX'){
          const dr = target.rows.find(r => r.universe === l.universe && r.dest === l.dest && !r.lines.length) || target.rows.find(r => r.universe === l.universe && r.dest === l.dest);
          if(dr){ dr.lines.push(key); cable(src, { block:target.id, port:dr.key }, 'dmx', uniHue(l.universe), key, { universe:l.universe }); }
          continue;
        }
        if(sock){ tagRef(sock, key); cable(src, sock, 'patch', color, key, { universe:l.universe }); }
      }
      // the multicore / Veam cable from the socket to the block
      const ownerColor = owners.get(l.owner) || color;
      if(sock) cable(sock, { block:target.id, port:'in' }, l.ownerKind === 'LK' ? 'lk' : 'veam', ownerColor, key);
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
        if(l.dest){ const mb = miniOf(target, `p${l.port}`, l.universe, l.dest); mb.rows[0].lines.push(key); cable({ block:target.id, port:`p${l.port}` }, { block:mb.id, port:'in' }, 'dmx', uniHue(l.universe), key, { universe:l.universe }); }
      } else {
        tagRow(target, `p${l.port}`, key);
        if(l.dest){ const gb = groupOf(target); let r = rowOf(gb, `r${l.port}`); if(!r){ r = port(`r${l.port}`, `${l.port}`, l.universe, { dest:l.dest }); gb.rows.push(r); } r.lines.push(key); cable({ block:target.id, port:`p${l.port}` }, { block:gb.id, port:`r${l.port}` }, 'dmx', uniHue(l.universe), key, { universe:l.universe }); }
      }
    }
    // a rack (or loose node) that patches into the panel of another rack stands to the left of it
    const devs = blocks.filter(b => b.dc === dc && (b.kind === 'rack' || b.kind === 'stack'));
    for(const b of devs){
      const out = edges.some(e => !e.inner && e.from.block === b.id && devs.some(o => o.id === e.to.block)), inn = edges.some(e => !e.inner && e.to.block === b.id && devs.some(o => o.id === e.from.block));
      if(out && !inn) b.col = -1;
    }
    // Veam linked to an LK slot without lines of its own yet: still draw the Veam cable
    for(const [vid, link] of linked){
      const lb = B.get(`${dc}|lk|${link.lk}`), vb = B.get(`${dc}|veam|${vid}`);
      if(lb && vb && !edges.some(e => e.from.block === lb.id && e.from.port === `g${link.slot}` && e.to.block === vb.id)) cable({ block:lb.id, port:`g${link.slot}` }, { block:vb.id, port:'in' }, 'veam', lb.color, `${dc}|${vid}|slot`);
    }
    // objects of a Veam not patched on a node yet
    for(const ve of veams){ const vb = B.get(`${dc}|veam|${ve.id}`); if(!vb) continue; for(const r of vb.rows){ if(r.universe == null || !r.dest || r.lines.length) continue; const key = `${dc}|${ve.id}|${r.key}|unfed`; lines.set(key, { universe:r.universe, dest:r.dest, owner:ve.id, ownerKind:'VEAM', label:`${ve.id} · ${r.label}`, dc }); r.lines.push(key); const gb = groupOf(vb); let g = rowOf(gb, `r${r.label}`); if(!g){ g = port(`r${r.label}`, r.label, r.universe, { dest:r.dest }); gb.rows.push(g); } g.lines.push(key); cable({ block:vb.id, port:r.key }, { block:gb.id, port:`r${r.label}` }, 'dmx', uniHue(r.universe), key, { universe:r.universe }); } }

    // ---- network layer: nodes → switch ports, network cables (C) → switch ports ----
    if(window.NetSwitches && window.FentUI){
      const vlanColor = v => (v != null && window.Fent?.vlanById(v)?.color) || null;
      const vlanTag = v => v != null ? String(v) : '';
      const swRows = window.FentUI.portPlan(dc).rows;
      const swList = window.NetSwitches.list(dc);
      const fibUse = sw => (window.Fibers ? window.Fibers.usage(dc, sw) : new Map());
      for(const sw of swList){
        const mine = swRows.filter(r => r.sw === sw.label), fib = fibUse(sw.label);
        if(!mine.length && !fib.size) continue;
        const rows = mine.map(r => port(`p${r.swPort}`, String(r.swPort), null, { dest:`${r.device}${r.ethCount > 1 && !r.cable ? ` ETH${r.eth}` : ''}`, tag:vlanTag(r.vlans[0]), tagColor:vlanColor(r.vlans[0]) }));
        for(const [n, l] of [...fib.entries()].sort((a, b) => a[0] - b[0])){ const other = (l.a?.dc === dc && l.a?.sw === sw.label && Number(l.a?.sfp) === n) ? l.b : l.a; rows.push(port(`s${n}`, window.SwPorts.label(sw.type, n), null, { dest:window.Fibers.endLabel(other), tag:l.id, tagColor:window.Fibers.color(l) })); }
        const ty = sw.type || {};
        add({ id:`${dc}|sw|${sw.label}`, kind:'switch', band:'net', dc, col:1, title:sw.label, sub:`${[ty.brand, ty.name].filter(Boolean).join(' ')}${sw.where ? ` · ${sw.where}` : ''}`, color:/^#[0-9a-f]{6}$/i.test(ty.color || '') ? ty.color : '#35c47c', rows });
      }
      const swBlock = r => B.get(`${dc}|sw|${r.sw}`);
      for(const r of swRows){
        const sb = r.sw ? swBlock(r) : null; if(!sb) continue;
        const key = `net|${dc}|${r.device}`, col = vlanColor(r.vlans[0]);
        const row = rowOf(sb, `p${r.swPort}`); if(row) row.lines.push(key);
        lines.set(key, { universe:null, dest:r.device, owner:r.device, ownerKind:'NET', label:r.device, dc, net:true });
        let from = null;
        if(r.cable){
          const cid = r.device.split('.')[0];
          const cbId = `${dc}|cat|${cid}`;
          if(!B.has(cbId)){
            const cab = (window.NetCables?.cables(dc) || []).find(c => c.id === cid);
            add({ id:cbId, kind:'cat', band:'net', dc, col:0, title:cid, sub:t('network cable', 'netwerkkabel'), color:'#94a3b8', rows:(cab?.lines || []).filter(l => !l.empty).map(l => port(`l${l.port}`, `${cid}.${l.port}`, null, { dest:l.dest, tag:vlanTag(l.vlan), tagColor:vlanColor(l.vlan) })) });
          }
          const cb = B.get(cbId), cr = rowOf(cb, `l${r.device.split('.')[1]}`); if(cr) cr.lines.push(key);
          from = { block:cbId, port:`l${r.device.split('.')[1]}` };
        } else if(r.ref?.kind === 'node'){
          const en = P.nodes[r.ref.idx], ref = en ? refs.get(`eth:${en.label}:${r.eth}`) : null;
          if(ref){ tagRef(ref, key); from = ref; }
          else {
            const nid = `${dc}|netnode|${r.device}`;
            if(!B.has(nid)) add({ id:nid, kind:'netnode', band:'net', dc, col:0, title:r.device, sub:t('node', 'node'), color:en?.color || '#4c9dff', rows:[port('e', 'ETH', null, { dest:r.device })] });
            rowOf(B.get(nid), 'e').lines.push(key); from = { block:nid, port:'e' };
          }
        }
        if(from) cable(from, { block:sb.id, port:`p${r.swPort}` }, 'cat', col || '#94a3b8', key);
      }
    }
  }
  // fibres: switch SFP port ↔ switch SFP port (another DimCity, or outside the show: a block for the far end)
  if(window.Fibers){
    const dcSet = new Set(dcs);
    const lastRow = (b, key) => b.rows.find(r => r.key === key);
    for(const l of window.Fibers.all()){
      const aIn = l.a?.dc && dcSet.has(l.a.dc), bIn = l.b?.dc && dcSet.has(l.b.dc);
      if(!aIn && !bIn) continue;
      const key = `net|fiber|${l.id}`; lines.set(key, { universe:null, dest:l.id, owner:l.id, ownerKind:'NET', label:l.id, dc:(aIn ? l.a : l.b).dc, net:true });
      const endBlock = (e, home) => {
        if(e && !e.free && dcSet.has(e.dc)){ const sb = B.get(`${e.dc}|sw|${e.sw}`); if(sb) return { b:sb, port:`s${e.sfp}` }; }
        const id = `${home}|ext|${window.Fibers.endLabel(e)}`;
        if(!B.has(id)) blocks.push(Object.assign(B.set(id, { id, kind:'ext', band:'net', dc:home, col:2, title:e?.free || `${e?.dc || ''} · ${e?.sw || ''}`, sub:t('other end', 'andere kant'), color:'#94a3b8', rows:[{ key:'s', type:'port', h:ROW, label:e?.free ? '' : `SFP ${e?.sfp}`, universe:null, lines:[], dest:'' }], lines:[] }).get(id)));
        return { b:B.get(id), port:'s' };
      };
      const home = (aIn ? l.a : l.b).dc;
      const A = endBlock(l.a, home), Bz = endBlock(l.b, home);
      for(const x of [A, Bz]){ const r = lastRow(x.b, x.port); if(r && !r.lines.includes(key)) r.lines.push(key); }
      edges.push({ id:`e${edges.length}`, from:{ block:A.b.id, port:A.port }, to:{ block:Bz.b.id, port:Bz.port }, cable:'fiber', color:window.Fibers.color(l), lines:[key], inner:false, label:l.id });
    }
  }
  for(const b of blocks) if(b.kind === 'obj' && !b.mini) b.rows.sort((a, c) => Number(a.label) - Number(c.label));
  // every block knows the lines that run through it (for hovering the block as a whole)
  const through = new Map();
  for(const e of edges){ for(const id of [e.from.block, e.to.block]){ if(!through.has(id)) through.set(id, new Set()); e.lines.forEach(k => through.get(id).add(k)); } }
  for(const b of blocks) b.lines = [...(through.get(b.id) || [])];
  return { blocks, edges, lines, nodes };
}

// ---------- Layers: everything, only the DMX side, or only the network ----------
function filterLayer(graph, layer){
  if(!layer || layer === 'all') return graph;
  const isNet = b => b.band === 'net';
  graph.blocks = graph.blocks.filter(b => layer === 'net' ? (isNet(b) || b.kind === 'rack' || b.kind === 'stack') : !isNet(b));
  const ids = new Set(graph.blocks.map(b => b.id));
  graph.edges = graph.edges.filter(e => ids.has(e.from.block) && ids.has(e.to.block) && !(layer === 'net' && e.inner));
  const through = new Map();
  for(const e of graph.edges){ for(const id of [e.from.block, e.to.block]){ if(!through.has(id)) through.set(id, new Set()); e.lines.forEach(k => through.get(id).add(k)); } }
  for(const b of graph.blocks) b.lines = [...(through.get(b.id) || [])];
  return graph;
}

// ---------- Sizes, port positions and the points where a line leaves or enters a block ----------
const unitH = u => u.hu * UH;
function prepare(b){
  if(b.kind === 'rack' || b.kind === 'stack'){
    const rack = b.kind === 'rack';
    b.portPos = new Map(); b.unitRect = new Map();
    let y = TITLE;
    for(const u of b.units){
      const rect = rack ? { x:FRAME + RAIL + 1 + (u.side === 'R' ? BAY / 2 : 0), y:TITLE + FRAME + (u.u - 1) * UH + 1, w:(u.side ? BAY / 2 : BAY) - 2, h:unitH(u) - 2 } : { x:1, y, w:BAY, h:unitH(u) };
      if(!rack) y += unitH(u) + STACK_GAP;
      b.unitRect.set(u, rect);
      for(const p of portLayout(u, rect)) b.portPos.set(p.p.key, p);
    }
    b.size = rack ? { w:FRAME * 2 + RAIL * 2 + BAY, h:TITLE + FRAME * 2 + b.H * UH } : { w:BAY + 2, h:y - STACK_GAP };
    return;
  }
  if(b.mini){ b.size = { w:W.mini, h:MINI_H }; return; }
  b.size = { w:W[b.kind] || 180, h:HEAD + PAD + b.rows.reduce((n, r) => n + r.h, 0) + 4 };
}
// the ports of a unit on its face: groups with a gap between them, scaled down when they do not fit
const labelW = u => u.side ? Math.round(LABEL_W * .55) : LABEL_W;   // half-width devices get a shorter name field
function portLayout(u, rect){
  const base = { dmx:UH * .5, in:UH * .5, rj:UH * .5, sfp:UH * .5, lk:UH * .74, vim:UH * .62 };
  const sizeOf = p => (base[p.cls] || UH * .5) * (p.cls === 'sfp' ? 1.4 : 1);
  const natural = u.groups.reduce((n, g) => n + g.reduce((s, p) => s + sizeOf(p), 0) + (g.length - 1) * 3, 0) + (u.groups.length - 1) * 8;
  const x0 = rect.x + EAR + 10 + labelW(u) + 10, avail = rect.x + rect.w - EAR - 8 - x0;
  const k = natural > avail ? avail / natural : 1;
  const cy = rect.y + rect.h / 2;
  let x = x0; const out = [];
  u.groups.forEach((g, gi) => { if(gi) x += 8 * k; g.forEach((p, i) => { const s = sizeOf(p) * k; if(i) x += 3 * k; out.push({ p, cx:x + s / 2, cy, s }); x += s; }); });
  return out;
}
// where the external lines of a rack / stack leave (right side, fanned out over the unit) or enter
function assignExits(graph){
  for(const b of graph.blocks){
    if(b.kind !== 'rack' && b.kind !== 'stack') continue;
    b.exit = new Map();
    for(const u of b.units){
      const rect = b.unitRect.get(u), keys = new Set(u.groups.flat().map(p => p.key));
      for(const side of ['out', 'in']){
        const ks = [...new Set(graph.edges.filter(e => !e.inner && (side === 'out' ? e.from.block === b.id && keys.has(e.from.port) : e.to.block === b.id && keys.has(e.to.port))).map(e => side === 'out' ? e.from.port : e.to.port))].sort((p, q) => b.portPos.get(p).cx - b.portPos.get(q).cx);
        ks.forEach((k, i) => b.exit.set(`${side}:${k}`, { x:b.portPos.get(k).cx, y:rect.y + rect.h * (.35 + .65 * (i + 1) / (ks.length + 1)), i, rect }));   // in the lower part of the unit, near the lead
      }
    }
  }
}
function portOffset(b, key){
  if(b.mini) return MINI_H / 2;
  if(key === 'in') return HEAD / 2;
  let y = HEAD + PAD;
  for(const r of b.rows){ if(r.key === key) return y + r.h / 2; y += r.h; }
  return HEAD / 2;
}
// absolute point where a line leaves ('out') or enters ('in') a block — always on the side of the block
function anchorPt(b, key, side){
  const x = b.pos.x + (side === 'out' ? b.size.w : 0);
  if(b.kind === 'rack' || b.kind === 'stack'){ const ex = b.exit?.get(`${side}:${key}`); return { x, y:b.pos.y + (ex ? ex.y : b.size.h / 2) }; }
  return { x, y:b.pos.y + portOffset(b, key) };
}
// height of a port within its block, for lining blocks up
function crossOff(b, key, side){ return anchorPt({ ...b, pos:{ x:0, y:0 } }, key, side).y; }
function edgePath(e, byId){
  const a = anchorPt(byId.get(e.from.block), e.from.port, 'out'), z = anchorPt(byId.get(e.to.block), e.to.port, 'in');
  const dx = Math.max(40, Math.abs(z.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${z.x - dx},${z.y} ${z.x},${z.y}`;
}
// the patch inside a rack: from the node port to the right, down the side of the rack, to the socket
function innerPath(b, e, idx){
  const a = b.portPos.get(e.from.port), z = b.portPos.get(e.to.port); if(!a || !z) return '';
  const xr = b.size.w - (b.kind === 'rack' ? FRAME + RAIL : 0) - 4 - (idx % 6) * 1.6;
  return `M${a.cx},${a.cy} H${xr} V${z.cy} H${z.cx}`;
}
// the lead from a port to the side of the rack where its cable leaves (or enters): along the bottom of the
// unit and the margin of the face, so it never crosses a label — drawn only while lit
function leadPath(b, key, side){
  const p = b.portPos.get(key), ex = b.exit?.get(`${side}:${key}`); if(!p || !ex) return '';
  const r = ex.rect, yb = r.y + r.h - 3 - (ex.i % 4) * 2;
  if(side === 'out'){ const xr = r.x + r.w - 5 - (ex.i % 4) * 2; return `M${p.cx},${p.cy} V${yb} H${xr} V${ex.y} H${b.size.w}`; }
  const xl = r.x + 5 + (ex.i % 4) * 2; return `M0,${ex.y} H${xl} V${yb} H${p.cx} V${p.cy}`;
}

// ---------- Layout ----------
// Columns: racks and loose devices → LK blocks, stand-alone Veams, direct DMX → Veams on an LK slot and
// the objects of XLR ports → the objects of Veams. Each block wants to sit level with the port that feeds
// it; blocks are stacked in that order without overlapping. Every DimCity is laid out on its own and the
// DimCities are placed one below the other.
function layout(graph, dcs){
  const f = flowState(), dir = f.dir;
  const byId = new Map(graph.blocks.map(b => [b.id, b]));
  for(const b of graph.blocks) prepare(b);
  assignExits(graph);
  const gapAfter = b => b.mini ? 0 : b.col <= 0 ? Math.round(GAP() * 1.6) : GAP();
  const rank = b => b.kind === 'rack' ? 0 : b.kind === 'stack' ? 1 : 2;
  const feedOf = b => graph.edges.find(e => e.to.block === b.id && !e.inner);
  graph.origins = {};
  let off = 0;
  for(const dc of dcs){
    const bl = graph.blocks.filter(b => b.dc === dc);
    if(!bl.length) continue;
    const cols = new Map();
    for(const b of bl){ if(!cols.has(b.col)) cols.set(b.col, []); cols.get(b.col).push(b); }
    const colKeys = [...cols.keys()].sort((a, b) => a - b);
    // where a block wants to sit: level with the port that feeds it (anchored blocks exactly on their row)
    const want = b => {
      const e = b.anchor ? null : feedOf(b);
      const src = byId.get(b.anchor ? b.anchor.block : e?.from.block); if(!src?.rel) return null;
      if(b.anchor) return b.anchor.port ? src.rel.y + crossOff(src, b.anchor.port, 'out') - crossOff(b, 'in', 'in') : src.rel.y;
      return src.rel.y + crossOff(src, e.from.port, 'out') - crossOff(b, e.to.port, 'in');
    };
    const stack = (list, wants, from) => { let cross = from; for(const b of list){ const w = wants.get(b.id), at = w == null ? cross : Math.max(cross, w); b.rel = { x:b.rel?.x ?? 0, y:Math.round(at) }; cross = at + b.size.h + gapAfter(b); } };
    let main = 0;
    const order = new Map();
    const colNets = new Map();
    for(const c of colKeys){
      const everything = cols.get(c);
      colNets.set(c, everything.filter(b => b.band === 'net').sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric:true })));
      let list = everything.filter(b => b.band !== 'net').sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, undefined, { numeric:true }));
      for(const b of everything) b.rel = { x:main, y:0 };
      const wants = new Map(list.map(b => [b.id, c <= 0 ? null : want(b)]));
      if(c > 0) list = list.slice().sort((a, b) => (wants.get(a.id) ?? 1e9) - (wants.get(b.id) ?? 1e9) || list.indexOf(a) - list.indexOf(b));
      stack(list, wants, 0);
      order.set(c, list);
      const colW = Math.max(...everything.map(b => b.size.w));
      if(c <= 0) for(const b of colNets.get(c)) b.rel = { x:main + colW - b.size.w, y:0 };   // network blocks on the left: right edges level, so lines leave the column and never cross a rack
      main += colW + COL_GAP();
    }
    // the racks (and the node racks that feed them) move level with the blocks they feed, so the
    // cables leave as straight as possible; the rest keeps its place
    for(const c of colKeys.filter(k => k <= 0).sort((a, b) => b - a)){
      const list = order.get(c);
      const wants = new Map(list.map(b => {
        const outs = graph.edges.filter(e => !e.inner && e.from.block === b.id && byId.get(e.to.block)?.col > c && byId.get(e.to.block)?.band !== 'net');
        if(!outs.length) return [b.id, b.rel.y];
        const d = outs.map(e => { const z = byId.get(e.to.block); return z.rel.y + crossOff(z, e.to.port, 'in') - crossOff(b, e.from.port, 'out'); });
        return [b.id, Math.round(d.reduce((p, q) => p + q, 0) / d.length)];
      }));
      stack(list, wants, -1e9);
    }
    // the network band (switches, network cables, far ends of fibres): below the blocks of its own column on the
    // left (racks), and level across the columns to the right: below the DMX blocks, or at the top when there are none
    { const normal = bl.filter(b => b.band !== 'net');
      const leftBottom = Math.max(-1e9, ...normal.filter(b => b.col <= 0).map(b => b.rel.y + b.size.h));
      const right = normal.filter(b => b.col > 0), rightBottom = right.length ? Math.max(...right.map(b => b.rel.y + b.size.h)) + GAP() * 3 : 0;
      for(const c of colKeys){ let cross = c <= 0 ? (leftBottom > -1e9 ? leftBottom + GAP() * 3 : 0) : rightBottom; for(const b of colNets.get(c)){ b.rel = { x:b.rel.x, y:Math.round(cross) }; cross += b.size.h + GAP(); } } }
    for(const b of bl) b.auto = { ...b.rel };
    // the user's own positions, relative to this DimCity's origin
    const saved = f.pos?.[dc]?.[dir] || {};
    for(const b of bl) if(saved[b.id] && Number.isFinite(saved[b.id].x) && Number.isFinite(saved[b.id].y)) b.rel = { x:saved[b.id].x, y:saved[b.id].y };
    const minX = Math.min(...bl.map(b => b.rel.x)), minY = Math.min(...bl.map(b => b.rel.y)), maxX = Math.max(...bl.map(b => b.rel.x + b.size.w)), maxY = Math.max(...bl.map(b => b.rel.y + b.size.h));
    const origin = { x:-minX, y:off - minY };
    graph.origins[dc] = { x:origin.x, y:origin.y, box:{ x:0, y:off, w:maxX - minX, h:maxY - minY } };
    for(const b of bl) b.pos = { x:origin.x + b.rel.x, y:origin.y + b.rel.y };
    off += (maxY - minY) + DC_GAP();
  }
  return graph;
}
// blocks never overlap: after a drag the moved blocks (kept together) go to the nearest free spot,
// tried along the edges of the blocks they bump into
const overlaps = (a, b, pad) => a.pos.x < b.pos.x + b.size.w + pad && a.pos.x + a.size.w + pad > b.pos.x && a.pos.y < b.pos.y + b.size.h + pad && a.pos.y + a.size.h + pad > b.pos.y;
function settle(graph, moved){
  const arr = [...moved], statics = graph.blocks.filter(b => !moved.has(b)), pad = 8;
  const free = (dx, dy) => arr.every(b => statics.every(o => !overlaps({ pos:{ x:b.pos.x + dx, y:b.pos.y + dy }, size:b.size }, o, pad)));
  if(free(0, 0)) return;
  const u = { x:Math.min(...arr.map(b => b.pos.x)), y:Math.min(...arr.map(b => b.pos.y)) };
  u.w = Math.max(...arr.map(b => b.pos.x + b.size.w)) - u.x; u.h = Math.max(...arr.map(b => b.pos.y + b.size.h)) - u.y;
  const near = statics.filter(o => overlaps({ pos:{ x:u.x - 700, y:u.y - 700 }, size:{ w:u.w + 1400, h:u.h + 1400 } }, o, 0));
  const xs = new Set([0]), ys = new Set([0]);
  for(const o of near){ xs.add((o.pos.x - pad) - (u.x + u.w)); xs.add((o.pos.x + o.size.w + pad) - u.x); ys.add((o.pos.y - pad) - (u.y + u.h)); ys.add((o.pos.y + o.size.h + pad) - u.y); }
  let best = null;
  for(const dx of xs) for(const dy of ys){ const d = Math.hypot(dx, dy); if(best && d >= best.d) continue; if(free(dx, dy)) best = { dx, dy, d }; }
  if(!best) return;
  for(const b of arr) b.pos = { x:Math.round(b.pos.x + best.dx), y:Math.round(b.pos.y + best.dy) };
}

// ---------- SVG ----------
function blockSvg(b, TH, print){
  const { w, h } = b.size;
  const bar = print ? `fill="${b.color}"` : '', headFill = print ? `fill="${b.color}" fill-opacity=".16"` : '';
  const selbox = `<rect class="fb-selbox" x="-3" y="-3" width="${w + 6}" height="${h + 6}" rx="8"/>`;
  if(b.kind === 'rack' || b.kind === 'stack') return deviceSvg(b, TH, print, selbox);
  if(b.mini){ const r = b.rows[0]; return `<g class="fb fb-obj fb-mini" data-block="${esc(b.id)}" data-dc="${esc(b.dc)}" data-lines="${linesAttr(b.lines)}" transform="translate(${b.pos.x},${b.pos.y})" style="--c:${b.color}"><title>${esc(r.dest)} · U${esc(r.universe)}</title>${selbox}<rect class="fb-bg" y=".5" width="${w}" height="${h - 1}" rx="4"/><rect class="fb-bar" x="0" y=".5" width="4" height="${h - 1}" rx="2" ${bar}/><g class="fp" data-port="in" data-lines="${linesAttr(r.lines)}"><text x="10" y="${h / 2 + 3.5}" class="fb-t" style="font-size:10.5px">${esc(trim(r.dest, 18))}</text><text x="${w - 8}" y="${h / 2 + 3.5}" class="fp-u" text-anchor="end" style="fill:${uniHue(r.universe)}">U${esc(r.universe)}</text></g></g>`; }
  let y = HEAD + PAD;
  const rows = b.rows.map(r => {
    const yy = y; y += r.h;
    if(r.type === 'head') return `<g class="fp-grp" transform="translate(0,${yy})"><text x="12" y="10" class="fp-g">${esc(r.label)}</text></g>`;
    if(r.type === 'slot') return `<g class="fp slot" data-port="${esc(r.key)}" data-lines="${linesAttr(r.lines)}" transform="translate(0,${yy})"><title>${esc(r.label)} → ${esc(r.dest)}</title><rect x="6" y="2" width="${w - 12}" height="${r.h - 4}" rx="3" ${print ? `fill="${b.color}" fill-opacity=".14"` : ''}/><text x="12" y="${r.h / 2 + 3.5}" class="fp-g" style="text-transform:none">${esc(r.label)}</text><text x="${w - 12}" y="${r.h / 2 + 3.5}" class="fp-u" text-anchor="end" ${print ? `fill="${b.color}"` : ''}>→ ${esc(r.dest)}</text></g>`;
    const objRow = b.kind === 'obj';
    const netKind = ['switch', 'cat', 'ext', 'netnode'].includes(b.kind);
    const uni = r.tag ? `<text x="${netKind ? 54 : 30}" y="${ROW / 2 + 3.5}" class="fp-u" style="fill:${r.tagColor || 'var(--text)'}">${esc(r.tag)}</text>` : r.universe != null ? `<text x="30" y="${ROW / 2 + 3.5}" class="fp-u" style="fill:${uniHue(r.universe)}">U${esc(r.universe)}</text>` : '';
    const right = objRow ? `<text x="60" y="${ROW / 2 + 3.5}" class="fp-d">${esc(trim(r.dest || r.to || '', 24))}</text>` : `<text x="${w - 12}" y="${ROW / 2 + 3.5}" class="fp-d" text-anchor="end">${esc(trim(r.dest || r.to || '', netKind ? 24 : 14))}</text>`;
    return `<g class="fp ${r.isIn ? 'in' : ''}" data-port="${esc(r.key)}" data-lines="${linesAttr(r.lines)}" transform="translate(0,${yy})"><title>${esc(r.label)}${r.universe != null ? ` · U${r.universe}` : ''}${r.dest ? ` · ${esc(r.dest)}` : ''}</title><rect x="6" y="1" width="${w - 12}" height="${ROW - 2}" rx="3"/><text x="12" y="${ROW / 2 + 3.5}" class="fp-n">${esc(r.label)}</text>${uni}${right}</g>`;
  }).join('');
  const name = b.kind === 'lk' ? `<text x="10" y="17" class="fb-t fb-edit" data-rename="${esc(b.lkId)}">${esc(b.title)}${b.title !== b.lkId ? ` <tspan class="fb-id">(${esc(b.lkId)})</tspan>` : ''}</text>` : `<text x="10" y="17" class="fb-t">${esc(trim(b.title, 30))}</text>`;
  return `<g class="fb fb-${b.kind}" data-block="${esc(b.id)}" data-dc="${esc(b.dc)}" data-lines="${linesAttr(b.lines)}" transform="translate(${b.pos.x},${b.pos.y})" style="--c:${b.color}">${selbox}
    <rect class="fb-bg" width="${w}" height="${h}" rx="6"/><rect class="fb-head" width="${w}" height="${HEAD}" rx="6" ${headFill}/><rect class="fb-bar" x="0" y="0" width="4" height="${h}" rx="2" ${bar}/>
    ${name}<text x="${w - 8}" y="17" class="fb-s" text-anchor="end">${esc(trim(b.sub, ['switch', 'cat', 'ext', 'netnode'].includes(b.kind) ? 30 : 26))}</text><g class="fp in" data-port="in"><title>${esc(b.title)}</title></g>${rows}</g>`;
}
// a rack (frame, rails, U numbers, faces) or a stack of loose devices, drawn like the Rack Builder does
function deviceSvg(b, TH, print, selbox){
  const { w, h } = b.size, rack = b.kind === 'rack';
  let out = `<text x="2" y="15" class="fb-t" fill="${TH.title}">${esc(trim(b.title, 40))}</text><text x="${w - 2}" y="15" class="fb-s" text-anchor="end" fill="${TH.sub}">${esc(trim(b.sub, 30))}</text>`;
  if(rack){
    const H = b.H, fy = TITLE, by = fy + FRAME;
    out += `<rect class="fb-frame" x="0" y="${fy}" width="${w}" height="${FRAME * 2 + H * UH}" rx="6" fill="${TH.frame}"/><rect x="${FRAME}" y="${by}" width="${w - FRAME * 2}" height="${H * UH}" fill="${TH.bg}"/>`;
    for(const x of [FRAME, w - FRAME - RAIL]){
      out += `<rect x="${x}" y="${by}" width="${RAIL}" height="${H * UH}" fill="${TH.rail}"/>`;
      for(let i = 0; i < H; i++) out += `<text x="${x + RAIL / 2}" y="${by + i * UH + UH / 2 + 3.5}" text-anchor="middle" font-size="9.5" font-family="${TH.mono}" fill="${TH.railText}">${H - i}</text><line x1="${x}" x2="${x + RAIL}" y1="${by + (i + 1) * UH}" y2="${by + (i + 1) * UH}" stroke="${TH.railLine}"/>`;
    }
    for(let i = 1; i < H; i++) out += `<line x1="${FRAME + RAIL}" x2="${w - FRAME - RAIL}" y1="${by + i * UH - .5}" y2="${by + i * UH - .5}" stroke="${TH.slot}" stroke-dasharray="3 3"/>`;
  }
  // layers: the faces, then the patch inside and the leads to the sides (only drawn while lit), then the ports on top
  for(const u of b.units) out += unitFaceSvg(b, u, TH);
  const all = S.layout?.edges || b.graphEdges || [];
  let k = 0;
  for(const e of all){
    if(e.from.block !== b.id && e.to.block !== b.id) continue;
    const d = e.inner ? innerPath(b, e, k++) : leadPath(b, e.from.block === b.id ? e.from.port : e.to.port, e.from.block === b.id ? 'out' : 'in');
    if(d) out += `<path class="fe fe-inner c-patch" data-edge="${e.id}" data-lines="${linesAttr(e.lines)}" d="${d}" style="--c:${e.color}" ${print ? `stroke="${e.color}"` : ''}/>`;
  }
  for(const u of b.units) out += unitPortsSvg(b, u, TH);
  return `<g class="fb fb-${b.kind}" data-block="${esc(b.id)}" data-dc="${esc(b.dc)}" data-lines="${linesAttr(b.lines)}" transform="translate(${b.pos.x},${b.pos.y})" style="--c:${b.color}">${selbox}${out}</g>`;
}
function unitFaceSvg(b, u, TH){
  const r = b.unitRect.get(u), { x, y, w, h } = r;
  if(u.special) return `<g class="funit" data-unit="${esc(u.iid)}"><g transform="translate(${x},${y})">${window.SwPorts.gc20tShapes(w, h, { title:'GigaCore 20t' })}</g><title>${esc(u.name)}</title></g>`;
  if(u.blind) return `<g class="funit"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#0b0c0e" stroke="#2b2f36"/><circle cx="${x + 9}" cy="${y + h * .3}" r="2.3" fill="${TH.screw}"/><circle cx="${x + w - 9}" cy="${y + h * .3}" r="2.3" fill="${TH.screw}"/><circle cx="${x + 9}" cy="${y + h * .72}" r="2.3" fill="${TH.screw}"/><circle cx="${x + w - 9}" cy="${y + h * .72}" r="2.3" fill="${TH.screw}"/></g>`;
  const screw = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="2.3" fill="${TH.screw}" stroke="${TH.screwRing}"/>`;
  const ear = ex => `<rect x="${ex}" y="${y}" width="${EAR}" height="${h}" fill="${TH.ear}"/>${screw(ex + EAR / 2, y + h * .28)}${screw(ex + EAR / 2, y + h * .72)}`;
  const lx = x + EAR + 10, mid = y + h / 2;
  const bw = u.badge ? Math.round(String(u.badge).length * 6.6 + 8) : 0;
  const badge = u.badge ? `<rect x="${lx}" y="${mid - 13}" width="${bw}" height="13" rx="3" fill="${u.badgeColor}"/><text x="${lx + bw / 2}" y="${mid - 3}" text-anchor="middle" font-size="9.5" font-weight="700" font-family="${TH.font}" fill="${TH.badgeText}">${esc(u.badge)}</text>` : '';
  const face = `<rect class="fu-face" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${TH.face}" stroke="${TH.faceStroke}"/><rect x="${x + 14}" y="${y}" width="${w - 28}" height="2" fill="${u.color}" opacity=".85"/>${ear(x)}${ear(x + w - EAR)}`;
  const maxChars = Math.max(6, Math.floor((labelW(u) - (bw ? bw + 5 : 0) - 4) / 6.1));
  const text = `${badge}<text x="${lx + (bw ? bw + 5 : 0)}" y="${mid - 3}" font-size="10.5" font-weight="700" font-family="${TH.font}" fill="${TH.text}">${esc(trim(u.name, maxChars))}</text><text x="${lx}" y="${mid + 9}" font-size="10" font-family="${TH.font}" fill="${TH.text3}">${esc(trim(u.meta, 26))}</text>`;
  return `<g class="funit" data-unit="${esc(u.iid)}" data-lines="${linesAttr(u.lines)}"><title>${esc((u.badge ? u.badge + ' · ' : '') + u.name)}</title>${face}${text}</g>`;
}
function unitPortsSvg(b, u, TH){
  const ports = portLayout(u, b.unitRect.get(u)).map(({ p, cx, cy, s }) => portSvg(p, cx, cy, s, TH)).join('');
  return `<g class="funit-ports" data-unit="${esc(u.iid)}" data-lines="${linesAttr(u.lines)}">${ports}</g>`;
}
function portSvg(p, cx, cy, s, TH){
  const r = s / 2, col = p.color || TH.rj, free = p.free;
  const bg = TH.portBg ? `fill="${TH.portBg}"` : `fill="${p.color || '#94a3b8'}" fill-opacity="${free ? .05 : .18}"`;
  const dash = free ? 'stroke-dasharray="3 2"' : '';
  let shape;
  if(p.cls === 'rj' || p.cls === 'sfp') shape = `<rect x="${cx - s / 2}" y="${cy - (p.cls === 'sfp' ? s / 2.8 : r)}" width="${s}" height="${p.cls === 'sfp' ? s / 1.4 : s}" rx="3" fill="${TH.rjBg}" stroke="${TH.rj}"/>`;
  else if(p.cls === 'vim') shape = `<circle class="fport-ring" cx="${cx}" cy="${cy}" r="${r}" ${bg} stroke="${col}" stroke-width="1.6" ${dash}/><circle cx="${cx}" cy="${cy}" r="${Math.max(2, r - 3.5)}" fill="none" stroke="${col}" stroke-width="1.6" ${dash}/>`;
  else shape = `<circle class="fport-ring" cx="${cx}" cy="${cy}" r="${r}" ${bg} stroke="${col}" stroke-width="${p.cls === 'lk' ? 3 : 2}" ${dash}/>`;
  const label = p.label && s >= 13 ? `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="${s >= 20 ? 8.5 : 7.5}" font-weight="700" font-family="${TH.font}" fill="${TH.portText}">${esc(p.label)}</text>` : '';
  return `<g class="fport ${p.cls} ${free ? 'free' : ''}" data-port="${esc(p.key)}" data-lines="${linesAttr(p.lines)}" style="--c:${col}" ${free ? 'opacity=".45"' : ''}><title>${esc(p.title)}</title>${shape}${label}</g>`;
}
const cableName = e => ({ lk:t('LK multicore', 'LK-multicore'), veam:t('Veam cable', 'Veam-kabel'), dmx:'DMX', patch:t('Patch', 'Patch'), cat:t('Network cable (Cat)', 'Netwerkkabel (Cat)'), fiber:t('Fibre', 'Fiber') }[e.cable]);
function edgesSvg(graph, byId, print){
  return graph.edges.filter(e => !e.inner).map(e => { const d = edgePath(e, byId); const a = byId.get(e.from.block), z = byId.get(e.to.block); return `<path class="fe c-${e.cable}" data-edge="${e.id}" data-lines="${linesAttr(e.lines)}" data-from="${esc(e.from.block)}" data-to="${esc(e.to.block)}" d="${d}" style="--c:${e.color}" ${print ? `stroke="${e.color}"` : ''}/>${print ? '' : `<path class="fe-hit" data-hit="${e.id}" data-lines="${linesAttr(e.lines)}" d="${d}"><title>${esc(cableName(e))}${e.universe != null ? ` U${e.universe}` : ''} · ${esc(a?.title || '')} → ${esc(z?.title || '')}${e.lines.length > 1 ? ` · ${e.lines.length} ${t('lines', 'lijnen')}` : ''}</title></path>`}`; }).join('');
}
function bandsSvg(graph, dcs){
  if(dcs.length < 2) return '';
  const m = M();
  return dcs.map(dc => { const o = graph.origins[dc]; if(!o) return ''; const { box } = o; const n = graph.blocks.filter(b => b.dc === dc); const lk = n.filter(b => b.kind === 'lk').length, ve = n.filter(b => b.kind === 'veam').length;
    return `<g class="fl-band" style="--c:${App.dimColor(dc)}"><rect x="${box.x - 6}" y="${box.y - 36}" width="10" height="10" rx="3" fill="${App.dimColor(dc)}"/><text class="fl-band-t" x="${box.x + 10}" y="${box.y - 27}">${esc(dc)}${m.dimNames?.[dc] ? ` · ${esc(m.dimNames[dc])}` : ''}</text><text class="fl-band-s" x="${box.x + 10}" y="${box.y - 13}">${lk} LK · ${ve} Veam</text><line x1="${box.x - 6}" x2="${box.x + box.w + 6}" y1="${box.y - 6}" y2="${box.y - 6}"/></g>`; }).join('');
}
const defsSvg = () => `<defs><marker id="flArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker><linearGradient id="flFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f38"/><stop offset="1" stop-color="#1d2129"/></linearGradient></defs>`;
function bounds(graph){
  const bs = graph.blocks.filter(b => b.pos); if(!bs.length) return null;
  const many = Object.keys(graph.origins || {}).length > 1;
  return { minX:Math.min(...bs.map(b => b.pos.x)) - 12, minY:Math.min(...bs.map(b => b.pos.y)) - (many ? 44 : 12), maxX:Math.max(...bs.map(b => b.pos.x + b.size.w)) + 12, maxY:Math.max(...bs.map(b => b.pos.y + b.size.h)) + 12 };
}
// The drawing as a stand-alone SVG (print colours, styles inlined) — for "Save image" and the PDF
function standaloneSvg(dcs, layer = 'all'){
  const graph = layout(filterLayer(buildGraph(dcs), layer), dcs);
  const byId = new Map(graph.blocks.map(b => [b.id, b]));
  for(const b of graph.blocks) b.graphEdges = graph.edges;
  const bb = bounds(graph); if(!bb || !graph.edges.length) return null;
  const css = `svg{font-family:Helvetica,Arial,sans-serif}.fe{fill:none;opacity:.95;stroke-linecap:round}.c-lk{stroke-width:6}.c-veam{stroke-width:4}.c-patch{stroke-width:2.5}.c-dmx{stroke-width:2}.c-cat{stroke-width:2.8}.c-fiber{stroke-width:4.5}.fe-inner{display:none}.fb-selbox{fill:none;stroke:none}.fb-bg{fill:#fff;stroke:#334155}.fb-t{font-size:12px;font-weight:600;fill:#0f172a}.fb-id{font-weight:400;fill:#64748b}.fb-s{font-size:10.5px;fill:#64748b}.fp rect{fill:#f1f5f9}.fp-n{font-family:Menlo,Consolas,monospace;font-size:10px;fill:#64748b}.fp-u{font-size:10.5px;font-weight:600;fill:#0f172a}.fp-d{font-size:9.5px;fill:#334155}.fp-g{font-size:9.5px;font-weight:600;fill:#64748b;text-transform:uppercase}.fl-band-t{font-size:13px;font-weight:700;fill:#0f172a}.fl-band-s{font-size:10.5px;fill:#64748b}.fl-band line{stroke:#cbd5e1}`;
  const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
  const body = `${bandsSvg(graph, dcs)}<g>${edgesSvg(graph, byId, true)}</g><g>${graph.blocks.map(b => blockSvg(b, THEME.print, true)).join('')}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.minX} ${bb.minY} ${w} ${h}" width="${w}" height="${h}"><style>${css}</style><rect x="${bb.minX}" y="${bb.minY}" width="${w}" height="${h}" fill="#fff"/>${window.FlowBg ? window.FlowBg.imageSvg(layer, { minX:bb.minX, minY:bb.minY, maxX:bb.maxX, maxY:bb.maxY }) : ''}${defsSvg().replace('context-stroke', '#334155')}${body}</svg>`;
  const lk = graph.blocks.filter(b => b.kind === 'lk').length, ve = graph.blocks.filter(b => b.kind === 'veam').length, racks = graph.blocks.filter(b => b.kind === 'rack').length;
  return { svg, w, h, lk, veams:ve, racks, lines:graph.lines.size };
}
// one DimCity for the PDF (the arrangement from the Signal Flow page)
function printSvg(dc, layer = 'all'){
  try{ const r = standaloneSvg([dc], layer); if(!r) return null; return { ...r, svg:r.svg.replace(/ width="\d+(\.\d+)?" height="\d+(\.\d+)?"><style>/, '><style>') }; } catch(err){ console.warn('Signal flow for PDF failed', err); return null; }
}

// ---------- Render ----------
function selectedDims(){ const all = App.sortedDims(); return S.dc === 'ALL' ? all : all.filter(d => d === S.dc); }
function render(){
  const root = App.$('#lkDetail'); if(!root) return;
  const m = M(); const dims = App.sortedDims(); const f = flowState();
  if(S.dc !== 'ALL' && !dims.includes(S.dc)) S.dc = 'ALL';
  if(S.layer === 'fibre'){
    App.pageHead?.({ eyebrow:'Project', title:t('Signal Flow', 'Signaalstroom'), sub:t('The fibres between the switches of every location. Draw a fibre from one port to another, or let Auto-assign do it.', 'De fibers tussen de switches van elke locatie. Teken een fiber van de ene poort naar de andere, of laat Automatisch koppelen het doen.') });
    window.FibreView.render(root); return;
  }
  const dcs = selectedDims();
  App.pageHead?.({ eyebrow:'Project', title:t('Signal Flow', 'Signaalstroom'), sub:t('How the data runs from the rack to every object. Hover a universe, a port or a line to follow it; click to pin.', 'Hoe de data van het rek naar elk object loopt. Beweeg over een universe, een poort of een lijn om hem te volgen; klik om vast te zetten.') });
  const graph = layout(filterLayer(buildGraph(dcs), S.layer), dcs);
  S.layout = graph;
  const byId = new Map(graph.blocks.map(b => [b.id, b]));
  const unis = new Map();
  for(const [, l] of graph.lines) if(l.universe != null){ const k = String(l.universe); unis.set(k, (unis.get(k) || 0) + 1); }
  const uniList = [...unis.keys()].sort((a, b) => Number(a) - Number(b));
  const side = `<aside class="fl-side">
    <div class="fl-sec"><div class="rb-label">DimCities</div>
      <button class="fl-item ${S.dc === 'ALL' ? 'on' : ''}" data-dc="ALL">${I('layers', 14)}<span>${t('All DimCities', 'Alle DimCities')}</span><em>${dims.length}</em></button>
      ${dims.map(dc => `<button class="fl-item ${S.dc === dc ? 'on' : ''}" data-dc="${esc(dc)}"><i class="dot" style="background:${App.dimColor(dc)}"></i><span>${esc(dc)}</span><em>${m.byDim.get(dc)?.lks?.size || 0} LK</em></button>`).join('')}</div>
    <div class="fl-sec"><div class="rb-label">${t('Show', 'Tonen')}</div><div class="segmented rb-full" id="flLayer"><button data-v="all" class="${S.layer === 'all' ? 'active' : ''}">${t('All', 'Alles')}</button><button data-v="dmx" class="${S.layer === 'dmx' ? 'active' : ''}">DMX</button><button data-v="net" class="${S.layer === 'net' ? 'active' : ''}">${t('Network', 'Netwerk')}</button><button data-v="fibre">${t('Fibres', 'Fibers')}</button></div></div>
    ${window.FlowBg ? window.FlowBg.sectionHtml(S.layer) : ''}
    <div class="fl-sec"><div class="rb-label">${t('Universes', 'Universes')} <span class="subtle">${uniList.length}</span></div>
      <div class="fl-unis">${uniList.map(u => `<button class="fl-uni ${S.pin?.uni === u ? 'pinned' : ''}" data-uni="${u}" style="--u:${uniHue(u)}"><b>U${u}</b><span>${unis.get(u)}</span></button>`).join('') || `<div class="subtle" style="padding:4px 8px">${t('No universes patched', 'Geen universes gepatcht')}</div>`}</div></div>
    <div class="fl-sec"><div class="rb-label">${t('Nodes', 'Nodes')}</div>${graph.nodes.map(n => `<div class="fl-node"><i style="background:${n.color}"></i><span>${esc(n.title)}</span><em title="${esc(n.where)}">${esc(n.where)}</em></div>`).join('') || `<div class="subtle" style="padding:4px 8px">${t('Place a rack or loose node first', 'Plaats eerst een rek of losse node')}</div>`}</div>
    <div class="fl-sec"><div class="rb-label">${t('Cables', 'Kabels')}</div><div class="fl-legend"><span><i class="lk"></i>${t('LK multicore', 'LK-multicore')}</span><span><i class="veam"></i>${t('Veam cable', 'Veam-kabel')}</span><span><i class="dmx"></i>${t('DMX line (universe colour)', 'DMX-lijn (universe-kleur)')}</span><span><i class="patch"></i>${t('Patch in the rack (shown when lit)', 'Patch in het rek (zichtbaar als hij oplicht)')}</span><span><i class="cat"></i>${t('Network cable (VLAN colour)', 'Netwerkkabel (VLAN-kleur)')}</span><span><i class="fiber"></i>${t('Fibre', 'Fiber')}</span></div></div>
    <div class="fl-sec"><div class="rb-label">${t('Layout', 'Indeling')}</div>
      <label class="field">${t('Spacing', 'Afstand')} <span class="subtle" id="flSpVal">${Math.round((f.spacing || 1) * 100)}%</span><input type="range" id="flSpacing" min="50" max="250" step="10" value="${Math.round((f.spacing || 1) * 100)}"></label>
      <div class="hint" style="margin-top:8px">${t('The arrangement, zoom and LK names of every DimCity are saved with the project and printed with Export PDF.', 'De indeling, zoom en LK-namen van elke DimCity worden met het project opgeslagen en geprint bij Export PDF.')}</div></div>
  </aside>`;
  const bar = `<div class="fl-bar">
    <div class="segmented fl-tools" id="flTool"><button data-tool="select" class="${S.tool === 'select' ? 'active' : ''}" title="${esc(t('Select and move (V) — drag the background to select several blocks', 'Selecteren en verplaatsen (V) — sleep over de achtergrond om meerdere blokken te kiezen'))}">${I('cursor', 15)}</button><button data-tool="pan" class="${S.tool === 'pan' ? 'active' : ''}" title="${esc(t('Hand: grab the drawing and move it (H, or hold Space)', 'Handje: pak de tekening en verschuif hem (H, of houd Spatie ingedrukt)'))}">${I('hand', 15)}</button></div>
    <span class="fl-sep"></span>
    <button class="ghost sm icon-only" id="flZoomOut" title="${esc(t('Zoom out (−)', 'Uitzoomen (−)'))}">${I('zoomOut', 15)}</button><input type="range" id="flZoom" min="20" max="300" step="5" value="${Math.round(S.zoom * 100)}" title="Zoom"><button class="ghost sm icon-only" id="flZoomIn" title="${esc(t('Zoom in (+)', 'Inzoomen (+)'))}">${I('zoomIn', 15)}</button><span class="fl-pct" id="flPct">${Math.round(S.zoom * 100)}%</span>
    <button class="sm" id="flFit" title="${esc(t('Fit the whole drawing in view (0)', 'Hele tekening in beeld (0)'))}">${I('compass', 14)}${t('Fit', 'Passend')}</button>
    <span class="fl-sep"></span>
    <button class="sm" id="flAuto" title="${esc(t('Put every block of the DimCities in view back in its automatic place', 'Zet elk blok van de DimCities in beeld terug op zijn automatische plek'))}">${I('layout', 14)}${t('Auto layout', 'Auto-indeling')}</button>
    <button class="sm" id="flShare" title="${esc(t('Copy the drawing as a picture to paste in a chat or e-mail', 'Kopieer de tekening als afbeelding om in een chat of e-mail te plakken'))}">${I('copy', 14)}${t('Share image', 'Afbeelding delen')}</button>
    <button class="sm" id="flSave" title="${esc(t('Save the drawing as an SVG image', 'Sla de tekening op als SVG-afbeelding'))}">${I('download', 14)}${t('Save image', 'Afbeelding opslaan')}</button>
    <span class="fl-hint">${t('Hover = follow · click = pin · Esc = release · drag = move', 'Beweeg = volgen · klik = vastzetten · Esc = loslaten · sleep = verplaatsen')}</span></div>`;
  for(const b of graph.blocks) b.graphEdges = graph.edges;
  const svg = `<svg id="flSvg" xmlns="http://www.w3.org/2000/svg">${defsSvg()}<g id="flView" transform="translate(${S.tx},${S.ty}) scale(${S.zoom})"><g id="flBg">${window.FlowBg ? window.FlowBg.svg(S.layer, (() => { const b = bounds(graph); return b ? { minX:b.minX, minY:b.minY, maxX:b.maxX, maxY:b.maxY } : null; })()) : ''}</g><g id="flBands">${bandsSvg(graph, dcs)}</g><g id="flEdges">${edgesSvg(graph, byId, false)}</g><g id="flBlocks">${graph.blocks.map(b => blockSvg(b, THEME.app, false)).join('')}</g></g></svg><div class="fl-marquee" id="flMarquee" hidden></div>`;
  const empty = graph.edges.length ? '' : `<div class="empty fl-empty">${I('cable', 30)}<h3>${t('Nothing to draw yet', 'Nog niets te tekenen')}</h3><p>${t('Import a patch and place a rack or loose node in a DimCity; the flow appears here.', 'Importeer een patch en plaats een rek of losse node in een DimCity; de stroom verschijnt hier.')}</p></div>`;
  root.innerHTML = `<div class="fl-wrap">${side}<div class="fl-main">${bar}<div class="fl-canvas tool-${S.tool}" id="flCanvas">${svg}${empty}</div></div></div>`;
  bind(root, graph, byId);
  S.sel = new Set([...S.sel].filter(id => byId.has(id)));
  applySel();
  const v = S.view[S.dc] || f.view?.[S.dc];
  if(S.fitNext || !v){ S.fitNext = false; fit(); } else { S.zoom = v.zoom; S.tx = v.tx; S.ty = v.ty; setView(); }
  highlight();
}

// ---------- View (zoom / pan) ----------
function setView(){
  const v = document.getElementById('flView'); if(v) v.setAttribute('transform', `translate(${S.tx},${S.ty}) scale(${S.zoom})`);
  const z = document.getElementById('flZoom'), p = document.getElementById('flPct');
  if(z) z.value = Math.round(S.zoom * 100); if(p) p.textContent = `${Math.round(S.zoom * 100)}%`;
  const view = { zoom:S.zoom, tx:Math.round(S.tx), ty:Math.round(S.ty) };
  S.view[S.dc] = view; flowState().view[S.dc] = view;   // remembered per DimCity (saved with the project, no 'unsaved' flag for just looking)
}
function zoomAt(z, px, py){ z = Math.max(.2, Math.min(3, z)); S.tx = px - (px - S.tx) * (z / S.zoom); S.ty = py - (py - S.ty) * (z / S.zoom); S.zoom = z; setView(); }
function zoomCenter(z){ const c = document.getElementById('flCanvas'); if(!c) return; const r = c.getBoundingClientRect(); zoomAt(z, r.width / 2, r.height / 2); }
function fit(){
  const g = S.layout, c = document.getElementById('flCanvas'); if(!g || !c) return;
  const bb = bounds(g); if(!bb) return;
  const r = c.getBoundingClientRect(), w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
  S.zoom = Math.max(.15, Math.min(1.5, Math.min((r.width - 40) / w, (r.height - 40) / h)));
  S.tx = (r.width - w * S.zoom) / 2 - bb.minX * S.zoom; S.ty = (r.height - h * S.zoom) / 2 - bb.minY * S.zoom;
  setView();
}
function setTool(tool){ S.tool = tool; document.querySelectorAll('#flTool button').forEach(b => b.classList.toggle('active', b.dataset.tool === tool)); const c = document.getElementById('flCanvas'); if(c){ c.classList.toggle('tool-select', tool === 'select'); c.classList.toggle('tool-pan', tool === 'pan'); } }

// ---------- Highlight: everything is a set of DMX lines ----------
//  a universe: every line that carries it · a port, a unit or a cable: the lines on it · a block: every line through it
const linesOf = el => new Set((el?.dataset.lines || '').split(' ').filter(Boolean));
function linesEl(target){ let el = target?.closest?.('[data-lines]'); while(el && !el.dataset.lines) el = el.parentElement?.closest?.('[data-lines]'); return el || null; }
function uniLines(u){ const out = new Set(); for(const [k, l] of S.layout?.lines || []) if(String(l.universe) === String(u)) out.add(k); return out; }
function highlight(lines){
  const root = document.getElementById('flCanvas'); if(!root) return;
  const want = S.pin ? S.pin.lines : lines;
  root.querySelectorAll('.lit').forEach(el => el.classList.remove('lit', 'flow'));
  if(!want || !want.size) return;
  root.querySelectorAll('[data-lines]').forEach(el => { const ls = el.dataset.lines; if(!ls) return; for(const k of ls.split(' ')) if(want.has(k)){ el.classList.add('lit'); if(el.classList.contains('fe')) el.classList.add('flow'); return; } });
}
function pinToggle(pin){
  S.pin = S.pin && S.pin.key === pin.key ? null : pin;
  document.querySelectorAll('.fl-uni').forEach(x => x.classList.toggle('pinned', !!S.pin?.uni && x.dataset.uni === S.pin.uni));
  highlight(S.hoverEl ? linesOf(S.hoverEl) : null);
}
function applySel(){ document.querySelectorAll('#flBlocks .fb').forEach(el => el.classList.toggle('sel', S.sel.has(el.dataset.block))); }

// ---------- Interaction ----------
function bind(root, graph, byId){
  const canvas = root.querySelector('#flCanvas'), svg = root.querySelector('#flSvg'); if(!svg) return;
  const f = flowState();
  root.querySelectorAll('[data-dc]').forEach(b => b.onclick = () => { S.dc = b.dataset.dc; S.pin = null; S.sel.clear(); render(); });
  const spc = root.querySelector('#flSpacing'); if(spc){ spc.oninput = () => { root.querySelector('#flSpVal').textContent = `${spc.value}%`; }; spc.onchange = () => { f.spacing = Number(spc.value) / 100; M().ui.dirty = true; S.fitNext = true; render(); }; }
  root.querySelectorAll('#flLayer button').forEach(b => b.onclick = () => setLayer(b.dataset.v));
  window.FlowBg?.bind(root, S.layer, () => render());
  root.querySelectorAll('#flTool button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  root.querySelector('#flZoomIn').onclick = () => zoomCenter(S.zoom * 1.25);
  root.querySelector('#flZoomOut').onclick = () => zoomCenter(S.zoom / 1.25);
  root.querySelector('#flZoom').oninput = e => zoomCenter(Number(e.target.value) / 100);
  root.querySelector('#flFit').onclick = fit;
  root.querySelector('#flAuto').onclick = () => { for(const dc of selectedDims()){ if(f.pos[dc]) delete f.pos[dc][f.dir]; } M().ui.dirty = true; S.fitNext = true; S.sel.clear(); render(); App.ui.toast(t('Blocks put back in their automatic place', 'Blokken terug op hun automatische plek')); };
  root.querySelector("#flSave").onclick = () => exportSvg();
  root.querySelector("#flShare").onclick = () => window.Fun?.shareFlow?.();
  root.querySelectorAll('.fl-uni').forEach(chip => { const u = chip.dataset.uni; chip.onmouseenter = () => highlight(uniLines(u)); chip.onmouseleave = () => highlight(); chip.onclick = () => pinToggle({ key:`uni:${u}`, uni:u, lines:uniLines(u) }); });
  // hovering: the innermost element with lines under the mouse decides what lights up
  svg.addEventListener('mousemove', e => { if(S.drag || S.pan || S.marquee) return; const el = linesEl(e.target); if(el !== S.hoverEl){ S.hoverEl = el; highlight(el ? linesOf(el) : null); } });
  svg.addEventListener('mouseleave', () => { if(S.hoverEl){ S.hoverEl = null; highlight(); } });
  canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(S.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive:false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  const toWorld = (cx, cy) => { const r = canvas.getBoundingClientRect(); return { x:(cx - r.left - S.tx) / S.zoom, y:(cy - r.top - S.ty) / S.zoom }; };
  const edgeEls = new Map(); root.querySelectorAll('.fe[data-edge]').forEach(p => edgeEls.set(p.dataset.edge, p)); const hitEls = new Map(); root.querySelectorAll('.fe-hit').forEach(p => hitEls.set(p.dataset.hit, p));
  const redrawEdges = ids => { for(const e of graph.edges){ if(e.inner || !(ids.has(e.from.block) || ids.has(e.to.block))) continue; const d = edgePath(e, byId); edgeEls.get(e.id)?.setAttribute('d', d); hitEls.get(e.id)?.setAttribute('d', d); } };
  const place = b => root.querySelector(`.fb[data-block="${CSS.escape(b.id)}"]`)?.setAttribute('transform', `translate(${b.pos.x},${b.pos.y})`);
  svg.addEventListener('mousedown', e => {
    if(e.button === 2) return;
    if(e.button === 1 || S.tool === 'pan' || S.space){ S.pan = { sx:e.clientX, sy:e.clientY, tx:S.tx, ty:S.ty, moved:false }; canvas.classList.add('panning'); e.preventDefault(); return; }
    if(e.button !== 0) return;
    const blockEl = e.target.closest('.fb');
    if(blockEl){
      const b = byId.get(blockEl.dataset.block);
      if(!S.sel.has(b.id)){ if(!e.shiftKey) S.sel.clear(); S.sel.add(b.id); applySel(); }
      const group = [...S.sel].map(id => byId.get(id)).filter(Boolean);
      S.drag = { blocks:group.map(x => ({ b:x, x0:x.pos.x, y0:x.pos.y })), sx:e.clientX, sy:e.clientY, moved:false, pressed:b, hover:S.hoverEl, rename:e.target.closest('[data-rename]')?.dataset.rename || null, shift:e.shiftKey };
    } else {
      const m = root.querySelector('#flMarquee');
      S.marquee = { sx:e.clientX, sy:e.clientY, moved:false, shift:e.shiftKey, el:m };
    }
    e.preventDefault();
  });
  const mv = e => {
    if(S.drag){
      const d = S.drag, dx = (e.clientX - d.sx) / S.zoom, dy = (e.clientY - d.sy) / S.zoom;
      if(!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.moved = true;
      for(const it of d.blocks){ it.b.pos = { x:Math.round(it.x0 + dx), y:Math.round(it.y0 + dy) }; place(it.b); }
      redrawEdges(new Set(d.blocks.map(it => it.b.id)));
    } else if(S.marquee){
      const q = S.marquee; if(!q.moved && Math.hypot(e.clientX - q.sx, e.clientY - q.sy) < 4) return;
      q.moved = true; const r = canvas.getBoundingClientRect();
      const x = Math.min(q.sx, e.clientX) - r.left, y = Math.min(q.sy, e.clientY) - r.top, w = Math.abs(e.clientX - q.sx), h = Math.abs(e.clientY - q.sy);
      Object.assign(q.el.style, { left:`${x}px`, top:`${y}px`, width:`${w}px`, height:`${h}px` }); q.el.hidden = false;
      const a = toWorld(Math.min(q.sx, e.clientX), Math.min(q.sy, e.clientY)), z = toWorld(Math.max(q.sx, e.clientX), Math.max(q.sy, e.clientY));
      const inside = new Set(graph.blocks.filter(b => b.pos.x < z.x && b.pos.x + b.size.w > a.x && b.pos.y < z.y && b.pos.y + b.size.h > a.y).map(b => b.id));
      S.sel = q.shift ? new Set([...(q.base || (q.base = new Set(S.sel))), ...inside]) : inside; applySel();
    } else if(S.pan){ if(Math.hypot(e.clientX - S.pan.sx, e.clientY - S.pan.sy) > 3) S.pan.moved = true; S.tx = S.pan.tx + (e.clientX - S.pan.sx); S.ty = S.pan.ty + (e.clientY - S.pan.sy); setView(); }
  };
  const up = () => {
    if(S.drag){
      const d = S.drag; S.drag = null;
      if(d.moved){
        const moved = new Set(d.blocks.map(it => it.b));
        settle(graph, moved);
        for(const b of moved){ place(b); const o = graph.origins[b.dc]; ((f.pos[b.dc] ||= {})[f.dir] ||= {})[b.id] = { x:b.pos.x - o.x, y:b.pos.y - o.y }; }
        redrawEdges(new Set([...moved].map(b => b.id)));
        M().ui.dirty = true; window.PatchHistory?.label?.(t('Moved blocks in the signal flow', 'Blokken verplaatst in de signaalstroom'));
      } else if(d.rename) renameLk(d.pressed.dc, d.rename);
      else { const el = d.hover || root.querySelector(`.fb[data-block="${CSS.escape(d.pressed.id)}"]`); pinToggle({ key:`el:${d.pressed.id}|${el?.dataset.port || el?.dataset.unit || el?.dataset.hit || ''}`, lines:linesOf(el) }); }
      highlight(S.hoverEl ? linesOf(S.hoverEl) : null);
    } else if(S.marquee){
      const q = S.marquee; S.marquee = null; q.el.hidden = true;
      if(!q.moved){ S.sel.clear(); applySel(); if(S.pin){ S.pin = null; pinToggle({ key:'none', lines:new Set() }); S.pin = null; highlight(); } }
    } else if(S.pan){ if(!S.pan.moved && S.pin){ S.pin = null; document.querySelectorAll('.fl-uni.pinned').forEach(x => x.classList.remove('pinned')); highlight(); } S.pan = null; canvas.classList.remove('panning'); }
  };
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable || document.querySelector('.modal-backdrop');
  const onKey = e => {
    if(typing(e) || !document.getElementById('flCanvas')) return;
    if(e.key === 'Escape'){ S.pin = null; S.sel.clear(); applySel(); document.querySelectorAll('.fl-uni.pinned').forEach(x => x.classList.remove('pinned')); highlight(S.hoverEl ? linesOf(S.hoverEl) : null); }
    else if(e.key === ' '){ if(!S.space){ S.space = true; canvas.classList.add('tool-pan'); } e.preventDefault(); }
    else if(e.key === 'v' || e.key === 'V') setTool('select');
    else if(e.key === 'h' || e.key === 'H') setTool('pan');
    else if(e.key === '+' || e.key === '=') zoomCenter(S.zoom * 1.25);
    else if(e.key === '-') zoomCenter(S.zoom / 1.25);
    else if(e.key === '0') fit();
    else if((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey)){ e.preventDefault(); S.sel = new Set(graph.blocks.map(b => b.id)); applySel(); }
  };
  const onKeyUp = e => { if(e.key === ' '){ S.space = false; if(S.tool !== 'pan') canvas.classList.remove('tool-pan'); } };
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);
  S.cleanup?.(); S.cleanup = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); };
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
function exportSvg(){
  const r = standaloneSvg(selectedDims(), S.layer); if(!r){ App.ui.toast(t('Nothing to save yet', 'Nog niets om op te slaan'), 'info'); return; }
  const name = `${(M().projectMeta?.project || 'PatchLab').replace(/[^a-z0-9_-]+/gi, '_')}-signal-flow-${S.dc}.svg`;
  const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([r.svg], { type:'image/svg+xml' })), download:name });
  document.body.appendChild(a); a.click(); a.remove();
  App.ui.toast(t('Drawing saved as SVG', 'Tekening opgeslagen als SVG'));
}

function setLayer(v){ S.layer = v; S.pin = null; S.sel.clear(); S.fitNext = true; if(v === 'fibre' && window.FibreView) window.FibreView.state.fit = true; render(); }
function openFibres(){ S.layer = 'fibre'; window.FibreView.state.fit = true; App.navigate('FLOW'); render(); }
window.Flow = { setLayer, openFibres, render, fit, buildGraph, layout, standaloneSvg, printSvg, state:S };
