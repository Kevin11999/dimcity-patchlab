// core/rack-engine.js
// Auto-patch for the racks placed in a DimCity:
//  1. LKs go on LK7-1 sockets; Veams that are not linked to an LK go on a free VIM4 socket
//     (first the VIM4 sockets next to an LK that doesn't use those lines, then separate ones).
//  2. Every used line gets a DMX feed from a node port; when node ports run short, universes
//     with several lines go through the rack's splitters.
//  3. Recommendations: free ports, missing sockets (loose LK / VIM4 spider), missing node ports.
// The result is computed from the current show every time — nothing goes stale.
const App = window.LKApp;

export const NODE_COLORS = ['#4c9dff', '#35c47c', '#f2b33d', '#e05dd8', '#22c3d6', '#ff7a45', '#a78bfa', '#94d82d', '#ff6b8b', '#5ee7c8'];
const num = (v, d=0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const byNum = (a, b) => String(a).localeCompare(String(b), undefined, { numeric:true });
const typeName = t => [t?.brand, t?.name].filter(Boolean).join(' ') || t?.id || '';

function types(M){
  const nd = M.networkDevices || {};
  const find = (key, id) => (nd[key] || []).find(x => x.id === id) || null;
  return { nd, find };
}
export function placedRacks(M, dc){
  const plan = M.networkDevices?.dimCityPlans?.[dc];
  return Array.isArray(plan?.racks) ? plan.racks : [];
}
// Losse apparaten zonder rek: { iid, kind:'node'|'lkSpider'|'vimSpider', typeId?, name?, nodeIid? }
// (nodeIid = de losse node waar een spin bij voorkeur op gepatcht wordt)
export function looseDevices(M, dc){
  const plan = M.networkDevices?.dimCityPlans?.[dc];
  return Array.isArray(plan?.loose) ? plan.loose : [];
}
export const hasRackPlan = (M, dc) => placedRacks(M, dc).length > 0 || looseDevices(M, dc).length > 0;

// Alle lijnen (poorten met een universe) van een DimCity, met wat er fysiek op aangesloten moet worden
function demand(M, dc){
  const lks = [...M.byLK.values()].filter(l => l.dimcity === dc).sort((a, b) => byNum(a.id, b.id));
  const linked = new Set();
  const lkNeeds = lks.map(lk => {
    const lines = [];
    const slotUsed = [false, false, false];
    for(let p = 1; p <= 12; p++){
      const m = App.mergedPortRecord(lk, p);
      if(m.ve?.veamId) linked.add(m.ve.veamId);
      if(m.universe == null || m.universe === '') continue;
      slotUsed[Math.floor((p - 1) / 4)] = true;
      lines.push({ universe:num(m.universe), port:p, dest:m.dest || '', label:`${lk.id} · ${p}`, owner:lk.id, ownerKind:'LK', via:m.ve?.veamId ? `${m.ve.veamId} · ${m.ve.veamPort}` : '' });
    }
    // gekoppelde Veams worden via de LK gevoed en hebben geen eigen aansluiting nodig
    for(const s of [1, 2, 3]) if(lk.veam?.[s] && App.effectiveBlockType(lk) !== 'XLR12') { linked.add(lk.veam[s]); slotUsed[s - 1] = true; }
    return { kind:'LK', id:lk.id, lines, slotUsed };
  });
  const veams = [...M.byVeam.values()].filter(v => v.dimcity === dc && !linked.has(v.id) && !(M.veamUse?.get(v.id) || []).length).sort((a, b) => byNum(a.id, b.id));
  const veNeeds = veams.map(ve => ({
    kind:'VEAM', id:ve.id,
    lines:(ve.lines || []).filter(L => L.universe != null && L.universe !== '').map(L => ({ universe:num(L.universe), port:L.port, dest:L.dest || '', label:`${ve.id} · ${L.port}`, owner:ve.id, ownerKind:'VEAM' }))
  }));
  const loose = (M.dmxLoose || []).filter(D => D.dimcity === dc && D.universe != null && D.universe !== '')
    .map((D, i) => ({ universe:num(D.universe), port:'—', dest:D.dest || '', label:`Loose DMX ${i + 1}`, owner:'DMX', ownerKind:'DMX' }));
  return { lkNeeds, veNeeds, loose };
}

// Hulpmiddelen van alle racks in deze DimCity, in volgorde (rek, dan positie van boven naar beneden)
function resources(M, dc){
  const { find } = types(M);
  const nodes = [], splitters = [], groups = [], soloVims = [], racks = [];
  let lkNo = 0, vimNo = 0;
  placedRacks(M, dc).forEach((pl, ri) => {
    const rack = find('rackTypes', pl.rackId);
    racks.push({ placement:pl, rack, index:ri });
    if(!rack) return;
    const items = (rack.items || []).slice().sort((a, b) => a.u - b.u);
    for(const it of items){
      const kindKey = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' }[it.kind];
      const t = find(kindKey, it.typeId);
      if(!t) continue;
      if(it.kind === 'node'){
        const n = nodes.length;
        nodes.push({ rack:ri, iid:it.iid, type:t, label:`N${n + 1}`, color:NODE_COLORS[n % NODE_COLORS.length], ports:Array.from({ length:Math.max(1, num(t.portCount, 8)) }, () => null) });
      } else if(it.kind === 'splitter'){
        const inputs = t.mode === 'AB' ? 2 : 1;
        splitters.push({ rack:ri, iid:it.iid, type:t, label:`S${splitters.length + 1}`, inputs:[], maxInputs:inputs, outputs:Array.from({ length:Math.max(1, num(t.outputCount, 10)) }, () => null) });
      } else if(it.kind === 'panel'){
        const lk = num(t.lkCount), vim = num(t.vimCount);
        // VIM4-aansluitingen delen de lijnen van een LK-aansluiting (3 per LK); de rest is los
        const shared = Math.min(vim, lk * 3);
        for(let g = 0; g < lk; g++){
          lkNo++;
          groups.push({ rack:ri, panel:typeName(t), iid:it.iid, label:`LK${lkNo}`, vims:[0, 1, 2].filter(k => g * 3 + k < shared).map(k => ({ label:`VIM${++vimNo}`, slot:k, used:null })), lk:null });
        }
        for(let k = shared; k < vim; k++) soloVims.push({ rack:ri, panel:typeName(t), iid:it.iid, label:`VIM${++vimNo}`, used:null });
      }
    }
  });
  // Losse apparaten komen na de rekken (rack:-1): een node zonder rek, een losse LK- of VIM4-spin
  const loose = [];
  for(const d of looseDevices(M, dc)){
    if(d.kind === 'node'){
      const t = find('nodeTypes', d.typeId);
      if(!t){ loose.push({ ...d, missing:true }); continue; }
      const n = nodes.length;
      nodes.push({ rack:-1, loose:true, iid:d.iid, type:t, name:d.name || '', label:`N${n + 1}`, color:NODE_COLORS[n % NODE_COLORS.length], ports:Array.from({ length:Math.max(1, num(t.portCount, 8)) }, () => null) });
    } else if(d.kind === 'lkSpider'){
      groups.push({ rack:-1, loose:true, panel:'Loose LK spider', iid:d.iid, nodeIid:d.nodeIid || null, label:`LK${++lkNo}`, vims:[], lk:null });
    } else if(d.kind === 'vimSpider'){
      soloVims.push({ rack:-1, loose:true, panel:'Loose VIM4 spider', iid:d.iid, nodeIid:d.nodeIid || null, label:`VIM${++vimNo}`, used:null });
    }
    loose.push(d);
  }
  return { nodes, splitters, groups, soloVims, racks, loose };
}

export function computeRackPlan(M, dc){
  const R = resources(M, dc);
  const D = demand(M, dc);
  const recs = [];
  const lines = [];                 // alle te voeden lijnen
  const noSocket = { lk:[], ve:[] };
  const prefNode = new Map();       // LK/Veam-id -> iid van de losse node waar de spin bij voorkeur op zit

  // 1. LK's op LK-aansluitingen
  let gi = 0;
  for(const need of D.lkNeeds){
    if(!need.lines.length && !need.slotUsed.some(Boolean)) continue;     // LK zonder data: niets aansluiten
    const g = R.groups[gi++];
    if(g){
      g.lk = need;
      if(g.nodeIid) prefNode.set(need.id, g.nodeIid);
      need.lines.forEach(l => lines.push({ ...l, socket:g.label }));
    } else {
      noSocket.lk.push(need.id);
      need.lines.forEach(l => lines.push({ ...l, socket:'Loose LK spider' }));
    }
  }
  // 2. Losse Veams: eerst vrije VIM4 naast een LK, dan losse VIM4, dan VIM4 van lege LK-groepen
  const freeVims = [];
  for(const g of R.groups) if(g.lk) g.vims.forEach(v => { if(!g.lk.slotUsed[v.slot]) freeVims.push(v); });
  freeVims.push(...R.soloVims);
  for(const g of R.groups) if(!g.lk) freeVims.push(...g.vims);
  let vi = 0;
  for(const need of D.veNeeds){
    if(!need.lines.length) continue;
    const v = freeVims[vi++];
    if(v){ v.used = need; if(v.nodeIid) prefNode.set(need.id, v.nodeIid); need.lines.forEach(l => lines.push({ ...l, socket:v.label })); }
    else { noSocket.ve.push(need.id); need.lines.forEach(l => lines.push({ ...l, socket:'Loose VIM4 spider' })); }
  }
  D.loose.forEach(l => lines.push({ ...l, socket:'Direct (XLR)' }));

  // 3. Voeding: nodepoorten, en splitters als de poorten niet genoeg zijn
  const totalPorts = R.nodes.reduce((n, x) => n + x.ports.length, 0);
  const byUni = new Map();
  for(const l of lines){ if(!byUni.has(l.universe)) byUni.set(l.universe, []); byUni.get(l.universe).push(l); }
  const feeds = [];                 // { universe, lines:[...], via:'direct' | splitter }
  let needPorts = lines.length;
  const unis = [...byUni.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  for(const [u, ls] of unis){
    if(needPorts <= totalPorts || ls.length < 2) continue;
    for(const sp of R.splitters){
      if(needPorts <= totalPorts) break;
      const free = sp.outputs.filter(o => !o).length;
      if(sp.inputs.length >= sp.maxInputs || free < 2) continue;
      const rest = ls.filter(l => !l.feed);
      if(rest.length < 2) break;
      const take = rest.slice(0, free);
      sp.inputs.push(u);
      take.forEach(l => { const o = sp.outputs.indexOf(null); sp.outputs[o] = l; l.feed = { splitter:sp.label, out:o + 1, color:null }; });
      needPorts -= take.length - 1;   // de splitter zelf kost één nodepoort
      feeds.push({ universe:u, splitter:sp, lines:take });
    }
  }
  for(const l of lines) if(!l.feed) feeds.push({ universe:l.universe, line:l });
  // Per LK/Veam zoveel mogelijk op één node (één kleur per LK): grootste eerst op een node
  // waar alles past; past het nergens meer, dan over de vrije poorten verdelen.
  const units = new Map();
  for(const f of feeds){
    const key = f.splitter ? `split:${f.splitter.label}:${f.universe}` : f.line.owner;
    if(!units.has(key)) units.set(key, []);
    units.get(key).push(f);
  }
  const free = node => node.ports.filter(p => !p).length;
  const put = (node, f) => {
    const pi = node.ports.indexOf(null);
    node.ports[pi] = { universe:f.universe, to:f.splitter ? `${f.splitter.label} in` : f.line.label, splitter:f.splitter?.label || null,
      owner:f.splitter ? f.splitter.label : f.line.owner, ownerPort:f.splitter ? 'in' : f.line.port, dest:f.splitter ? '' : f.line.dest };
    const ref = { node:node.label, port:pi + 1, color:node.color };
    if(f.splitter){ f.lines.forEach(l => { l.feed = { ...l.feed, ...ref }; }); f.splitter.feedColor = node.color; }
    else f.line.feed = ref;
  };
  // Een spin die aan een losse node hangt gaat eerst naar die node (prefNode); units daarvan eerst
  const prefOf = u => prefNode.get(u[0].line?.owner) || null;
  const sortedUnits = [...units.values()].sort((x, y) => (prefOf(y) ? 1 : 0) - (prefOf(x) ? 1 : 0) || y.length - x.length);
  const rest = [];
  for(const u of sortedUnits){
    const pref = prefOf(u);
    const node = (pref && R.nodes.find(n => n.iid === pref && free(n) >= u.length)) || R.nodes.find(n => free(n) >= u.length);
    if(node) u.sort((x, y) => (x.line?.port ?? 0) - (y.line?.port ?? 0)).forEach(f => put(node, f));
    else rest.push(...u);
  }
  let unfed = 0;
  for(const f of rest){
    const pref = f.line ? prefNode.get(f.line.owner) : null;
    const node = (pref && R.nodes.find(n => n.iid === pref && free(n) > 0)) || R.nodes.find(n => free(n) > 0);
    if(node) put(node, f);
    else { unfed += f.splitter ? f.lines.length : 1; if(f.line) f.line.feed = null; else f.lines.forEach(l => l.feed = null); }
  }

  // 4. Adviezen
  const usedPorts = R.nodes.reduce((n, x) => n + x.ports.filter(Boolean).length, 0);
  const lkSockets = R.groups.length, lkUsed = R.groups.filter(g => g.lk).length;
  const vimSockets = R.groups.reduce((n, g) => n + g.vims.length, 0) + R.soloVims.length;
  const vimUsed = freeVims.filter(v => v.used).length;
  const nodeTypes = [...new Set(R.nodes.map(n => n.type))];
  if(!R.racks.length && !R.loose.length) recs.push({ level:'info', text:'Place a rack to patch this DimCity automatically.' });
  else {
    const missing = R.loose.filter(d => d.missing);
    if(missing.length) recs.push({ level:'warn', text:`${missing.length} loose node${missing.length > 1 ? 's use' : ' uses'} a node type that is no longer in this show.` });
    if(noSocket.lk.length) recs.push({ level:'warn', text:`${noSocket.lk.length} LK${noSocket.lk.length > 1 ? 's have' : ' has'} no LK7-1 socket (${noSocket.lk.join(', ')}) → add ${noSocket.lk.length > 1 ? `${noSocket.lk.length} loose LK spiders` : 'a loose LK spider'}, or a panel with more LK sockets.` });
    if(noSocket.ve.length) recs.push({ level:'warn', text:`${noSocket.ve.length} Veam${noSocket.ve.length > 1 ? 's have' : ' has'} no VIM4 socket (${noSocket.ve.join(', ')}) → add ${noSocket.ve.length > 1 ? `${noSocket.ve.length} loose VIM4 spiders` : 'a loose VIM4 spider'}.` });
    if(unfed){
      const per = num(nodeTypes[0]?.portCount, 8);
      recs.push({ level:'warn', text:`${unfed} line${unfed > 1 ? 's have' : ' has'} no node port → add ${Math.ceil(unfed / per)}× ${nodeTypes[0] ? typeName(nodeTypes[0]) : 'node'}${R.splitters.length ? '' : ', or a splitter for universes that are used more than once'}.` });
    }
    if(!R.nodes.length && lines.length) recs.push({ level:'warn', text:R.racks.length ? 'This rack has no DMX nodes.' : 'There is no DMX node yet — add a loose node or place a rack.' });
    const freePorts = totalPorts - usedPorts;
    if(freePorts > 0 && !unfed) recs.push({ level:'ok', text:`${freePorts} node port${freePorts > 1 ? 's' : ''} still free.` });
    const freeLk = lkSockets - lkUsed;
    if(freeLk > 0) recs.push({ level:'info', text:`${freeLk} LK7-1 socket${freeLk > 1 ? 's' : ''} unused.` });
    const usedSplit = R.splitters.filter(s => s.inputs.length).length;
    if(R.splitters.length && usedSplit < R.splitters.length) recs.push({ level:'info', text:`${R.splitters.length - usedSplit} splitter${R.splitters.length - usedSplit > 1 ? 's are' : ' is'} not needed — there are enough node ports.` });
    if(!recs.some(r => r.level === 'warn') && lines.length) recs.unshift({ level:'ok', text:`Everything fits: ${lines.length} line${lines.length > 1 ? 's' : ''} patched on ${usedPorts} node port${usedPorts === 1 ? '' : 's'}.` });
  }
  return {
    dc, racks:R.racks, loose:R.loose, nodes:R.nodes, splitters:R.splitters, groups:R.groups, soloVims:R.soloVims, lines, recs,
    stats:{ lkSockets, lkUsed, vimSockets, vimUsed, nodePorts:totalPorts, nodePortsUsed:usedPorts, lines:lines.length, unfed,
      spiders:{ lk:noSocket.lk.length, vim:noSocket.ve.length } }
  };
}

// Kleur per LK/Veam: de node waar de meeste lijnen op zitten
export function ownerColors(plan){
  const tally = new Map();
  for(const l of plan.lines){
    if(!l.feed?.color) continue;
    const t = tally.get(l.owner) || new Map();
    t.set(l.feed.color, (t.get(l.feed.color) || 0) + 1);
    tally.set(l.owner, t);
  }
  const out = new Map();
  for(const [owner, t] of tally) out.set(owner, [...t.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

window.RackEngine = { computeRackPlan, placedRacks, looseDevices, hasRackPlan, ownerColors, NODE_COLORS };
