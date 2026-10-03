// core/rack-engine.js
// Auto-patch for the racks placed in a DimCity:
//  1. LKs go on LK7-1 sockets; Veams that are not linked to an LK go on a free Veam4 socket
//     (first the Veam4 sockets next to an LK that doesn't use those lines, then separate ones).
//  2. Every used line gets a DMX feed from a node port; when node ports run short, universes
//     with several lines go through the rack's splitters.
//  3. Recommendations: free ports, missing sockets (loose LK / Veam4 spider), missing node ports.
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
// Racks that sit directly on top of each other (placement.stack = "on the rack above") form one zone: the short
// LK / Veam / XLR cables reach inside a zone only. Between zones only network cables (Cat, fibre) run.
// zone null = loose (a loose spider is a loose cable, it reaches every node).
export const zoneOk = (a, b) => a == null || b == null || a === b;
function zonesOf(M, dc){
  const z = [];
  placedRacks(M, dc).forEach((pl, i) => { z[i] = pl.stack && i > 0 ? z[i - 1] : i; });
  return z;
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
      lines.push({ universe:num(m.universe), port:p, dest:m.dest || '', label:`${lk.id} · ${p}`, owner:lk.id, ownerKind:'LK', via:m.source === 'Veam' && m.ve?.veamId ? `${m.ve.veamId} · ${m.ve.veamPort}` : '' });
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
  const zones = zonesOf(M, dc);
  placedRacks(M, dc).forEach((pl, ri) => {
    const rack = find('rackTypes', pl.rackId);
    racks.push({ placement:pl, rack, index:ri, zone:zones[ri] });
    if(!rack) return;
    const items = (rack.items || []).slice().sort((a, b) => (a.u - b.u) || ((a.side === 'R') - (b.side === 'R')));
    for(const it of items){
      const kindKey = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' }[it.kind];
      const t = find(kindKey, it.typeId);
      if(!t) continue;
      if(it.kind === 'node'){
        const n = nodes.length;
        nodes.push({ rack:ri, zone:zones[ri], iid:it.iid, type:t, label:`N${n + 1}`, color:NODE_COLORS[n % NODE_COLORS.length], ports:Array.from({ length:Math.max(1, num(t.portCount, 8)) }, () => null) });
      } else if(it.kind === 'splitter'){
        const inputs = t.mode === 'AB' ? 2 : 1;
        splitters.push({ rack:ri, zone:zones[ri], iid:it.iid, type:t, label:`S${splitters.length + 1}`, inputs:[], maxInputs:inputs, outputs:Array.from({ length:Math.max(1, num(t.outputCount, 10)) }, () => null) });
      } else if(it.kind === 'panel'){
        const lk = num(t.lkCount), vim = num(t.vimCount);
        // Veam4-aansluitingen delen de lijnen van een LK-aansluiting (3 per LK); de rest is los
        const shared = Math.min(vim, lk * 3);
        for(let g = 0; g < lk; g++){
          lkNo++;
          groups.push({ rack:ri, zone:zones[ri], panel:typeName(t), iid:it.iid, label:`LK${lkNo}`, vims:[0, 1, 2].filter(k => g * 3 + k < shared).map(k => ({ label:`Veam${++vimNo}`, slot:k, used:null, zone:zones[ri] })), lk:null });
        }
        for(let k = shared; k < vim; k++) soloVims.push({ rack:ri, zone:zones[ri], panel:typeName(t), iid:it.iid, label:`Veam${++vimNo}`, used:null });
      }
    }
  });
  // Losse apparaten komen na de rekken (rack:-1): een node zonder rek, een losse LK- of Veam4-spin
  const loose = [];
  for(const d of looseDevices(M, dc)){
    if(d.kind === 'node'){
      const t = find('nodeTypes', d.typeId);
      if(!t){ loose.push({ ...d, missing:true }); continue; }
      const n = nodes.length;
      nodes.push({ rack:-1, zone:'loose', loose:true, iid:d.iid, type:t, name:d.name || '', label:`N${n + 1}`, color:NODE_COLORS[n % NODE_COLORS.length], ports:Array.from({ length:Math.max(1, num(t.portCount, 8)) }, () => null) });
    } else if(d.kind === 'lkSpider'){
      groups.push({ rack:-1, zone:null, loose:true, panel:'Loose LK spider', iid:d.iid, nodeIid:d.nodeIid || null, label:`LK${++lkNo}`, vims:[], lk:null });
    } else if(d.kind === 'vimSpider'){
      soloVims.push({ rack:-1, zone:null, loose:true, panel:'Loose Veam4 spider', iid:d.iid, nodeIid:d.nodeIid || null, label:`Veam${++vimNo}`, used:null });
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

  // Own choices per LK / Veam (plan.assign): 'auto' (default) | an exact socket label ('LK2', 'Veam3') | 'spider' (a loose spider) | 'none' (do not patch)
  const assign = M.networkDevices?.dimCityPlans?.[dc]?.assign || {};
  const skipped = [], badAssign = [];
  const give = (need, socket, node, zone = null) => { if(node) prefNode.set(need.id, node); need.lines.forEach(l => lines.push({ ...l, socket, zone })); };

  // 1. LK's op LK-aansluitingen: eerst de eigen keuzes, dan spinnen die aan een losse node hangen, dan de rekpanelen, dan losse spinnen
  const wanted = D.lkNeeds.filter(n => n.lines.length || n.slotUsed.some(Boolean));     // LK zonder data: niets aansluiten
  const done = new Set();
  for(const need of wanted){
    const a = assign[need.id];
    if(!a || a === 'auto') continue;
    if(a === 'none'){ skipped.push(need.id); done.add(need.id); continue; }
    if(a === 'spider'){ noSocket.lk.push(need.id); give(need, 'Loose LK spider'); done.add(need.id); continue; }
    const g = R.groups.find(x => x.label === a && !x.lk);
    if(g){ g.lk = need; give(need, g.label, g.nodeIid, g.zone); done.add(need.id); }
    else badAssign.push(`${need.id} → ${a}`);
  }
  const groupsInOrder = [...R.groups.filter(g => g.nodeIid && !g.lk), ...R.groups.filter(g => !g.nodeIid && !g.lk)];
  let gi = 0;
  for(const need of wanted){
    if(done.has(need.id)) continue;
    const g = groupsInOrder[gi++];
    if(g){ g.lk = need; give(need, g.label, g.nodeIid, g.zone); }
    else { noSocket.lk.push(need.id); give(need, 'Loose LK spider'); }
  }
  // 2. Losse Veams: eigen keuzes, dan vrije Veam4 naast een LK, dan losse Veam4, dan Veam4 van lege LK-groepen
  const freeVims = [...R.soloVims.filter(v => v.nodeIid)];               // Veam4-spin aan een losse node eerst
  for(const g of R.groups) if(g.lk) g.vims.forEach(v => { if(!g.lk.slotUsed[v.slot]) freeVims.push(v); });
  freeVims.push(...R.soloVims.filter(v => !v.nodeIid));
  for(const g of R.groups) if(!g.lk) freeVims.push(...g.vims);
  const veWanted = D.veNeeds.filter(n => n.lines.length), veDone = new Set();
  for(const need of veWanted){
    const a = assign[need.id];
    if(!a || a === 'auto') continue;
    if(a === 'none'){ skipped.push(need.id); veDone.add(need.id); continue; }
    if(a === 'spider'){ noSocket.ve.push(need.id); give(need, 'Loose Veam4 spider'); veDone.add(need.id); continue; }
    const v = freeVims.find(x => x.label === a && !x.used);
    if(v){ v.used = need; give(need, v.label, v.nodeIid, v.zone); veDone.add(need.id); }
    else badAssign.push(`${need.id} → ${a}`);
  }
  for(const need of veWanted){
    if(veDone.has(need.id)) continue;
    const v = freeVims.find(x => !x.used);
    if(v){ v.used = need; give(need, v.label, v.nodeIid, v.zone); }
    else { noSocket.ve.push(need.id); give(need, 'Loose Veam4 spider'); }
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
      const rest = ls.filter(l => !l.feed && zoneOk(l.zone, sp.zone));
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
  const zoneOfF = f => f.splitter ? f.splitter.zone : f.line.zone;
  for(const u of sortedUnits){
    const pref = prefOf(u), uz = zoneOfF(u[0]);
    const node = (pref && R.nodes.find(n => n.iid === pref && free(n) >= u.length && zoneOk(n.zone, uz))) || R.nodes.find(n => free(n) >= u.length && zoneOk(n.zone, uz));
    if(node) u.sort((x, y) => (x.line?.port ?? 0) - (y.line?.port ?? 0)).forEach(f => put(node, f));
    else rest.push(...u);
  }
  let unfed = 0; const unfedLines = [];
  for(const f of rest){
    const pref = f.line ? prefNode.get(f.line.owner) : null;
    const fz = zoneOfF(f);
    const node = (pref && R.nodes.find(n => n.iid === pref && free(n) > 0 && zoneOk(n.zone, fz))) || R.nodes.find(n => free(n) > 0 && zoneOk(n.zone, fz));
    if(node) put(node, f);
    else { unfed += f.splitter ? f.lines.length : 1; (f.splitter ? f.lines : [f.line]).forEach(l => unfedLines.push(l)); if(f.line) f.line.feed = null; else f.lines.forEach(l => l.feed = null); }
  }

  // 4. Adviezen
  const usedPorts = R.nodes.reduce((n, x) => n + x.ports.filter(Boolean).length, 0);
  const lkSockets = R.groups.length, lkUsed = R.groups.filter(g => g.lk).length;
  const vimSockets = R.groups.reduce((n, g) => n + g.vims.length, 0) + R.soloVims.length;
  const vimUsed = freeVims.filter(v => v.used).length;
  const nodeTypes = [...new Set(R.nodes.map(n => n.type))];
  if(badAssign.length) recs.push({ level:'warn', text:`Your socket choice is not possible any more for ${badAssign.join(', ')} → automatic instead.` });
  if(skipped.length) recs.push({ level:'info', text:`Not patched on purpose: ${skipped.join(', ')}.` });
  if(!R.racks.length && !R.loose.length) recs.push({ level:'info', text:'Place a rack to patch this DimCity automatically.' });
  else {
    const missing = R.loose.filter(d => d.missing);
    if(missing.length) recs.push({ level:'warn', text:`${missing.length} loose node${missing.length > 1 ? 's use' : ' uses'} a node type that is no longer in this show.` });
    if(noSocket.lk.length) recs.push({ level:'warn', text:`${noSocket.lk.length} LK${noSocket.lk.length > 1 ? 's have' : ' has'} no LK7-1 socket (${noSocket.lk.join(', ')}) → add ${noSocket.lk.length > 1 ? `${noSocket.lk.length} loose LK spiders` : 'a loose LK spider'}, or a panel with more LK sockets.` });
    if(noSocket.ve.length) recs.push({ level:'warn', text:`${noSocket.ve.length} Veam${noSocket.ve.length > 1 ? 's have' : ' has'} no Veam4 socket (${noSocket.ve.join(', ')}) → add ${noSocket.ve.length > 1 ? `${noSocket.ve.length} loose Veam4 spiders` : 'a loose Veam4 spider'}.` });
    if(unfed){
      const per = num(nodeTypes[0]?.portCount, 8);
      const farFree = R.nodes.some(n => n.ports.some(p => !p) && unfedLines.some(l => !zoneOk(n.zone, l.zone)));
      if(farFree) recs.push({ level:'warn', text:`${unfedLines.filter(l => l.zone != null).length || unfed} line${unfed > 1 ? 's have' : ' has'} no free node port in the same rack. LK and Veam cables are short and cannot go from one rack to another — put a node in that rack, or place the racks on top of each other (tick "stacked" on the upper rack). Only network cables run between racks.` });
      else recs.push({ level:'warn', text:`${unfed} line${unfed > 1 ? 's have' : ' has'} no node port → add ${Math.ceil(unfed / per)}× ${nodeTypes[0] ? typeName(nodeTypes[0]) : 'node'}${R.splitters.length ? '' : ', or a splitter for universes that are used more than once'}.` });
    }
    const lonely = R.nodes.filter(n => n.loose && !R.loose.some(d => (d.kind === 'lkSpider' || d.kind === 'vimSpider') && (!d.nodeIid || d.nodeIid === n.iid)));
    if(lonely.length) recs.push({ level:'warn', text:`A node without a rack needs a loose LK spider or a loose Veam spider to be fed: ${lonely.map(n => n.label).join(', ')} ${lonely.length > 1 ? 'have' : 'has'} none → add one next to ${lonely.length > 1 ? 'each of them' : 'it'}.` });
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
    dc, skipped, badAssign, lonely:R.nodes.filter(n => n.loose && !R.loose.some(d => (d.kind === 'lkSpider' || d.kind === 'vimSpider') && (!d.nodeIid || d.nodeIid === n.iid))), racks:R.racks, loose:R.loose, nodes:R.nodes, splitters:R.splitters, groups:R.groups, soloVims:R.soloVims, lines, recs,
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

window.RackEngine = { zoneOk, computeRackPlan, placedRacks, looseDevices, hasRackPlan, ownerColors, demand, NODE_COLORS };
