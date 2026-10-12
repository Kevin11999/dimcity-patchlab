// core/rack-engine.js
// Auto-patch for the racks placed in a DimCity:
//  1. LKs go on LK37 sockets; Veams that are not linked to an LK go on a free Veam4 socket
//     (first the Veam4 sockets next to an LK that doesn't use those lines, then separate ones).
//  2. Every used line gets a DMX feed from a node port; when node ports run short, universes
//     with several lines go through the rack's splitters.
//  3. Recommendations: free ports, missing sockets (loose LK / Veam4 spider), missing node ports.
// The result is computed from the current show every time — nothing goes stale.
const App = window.LKApp;

// Nodes are told apart by their label (N1, N2 …); their colour stays neutral so the colours are for the LKs and Veams only
export const NODE_COLORS = ['#94a3b8', '#8190a6', '#a3afc0', '#74839a', '#aeb9c8', '#8896ab'];
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

// A node line of the CSV (Node601,1 → "Node 601.1"): the universe that sits on port 1 of CSV node 601. { no:'601', port:1 | null } or null.
// (also what an older file has: a loose DMX line whose place is a node and a port)
const NODE_RE = /^\s*node\s*0*(\d{3,4})(?:\s*[.\-/]\s*(\d{1,3}))?\s*$/i;
export const nodeRef = D => { const m = NODE_RE.exec(String(D?.dest ?? '')); return m ? { no:m[1], port:m[2] ? Number(m[2]) : null } : null; };
// CSV node → the node of a network plan that carries its name ("Name from the CSV"): { dc, node }
export function csvLinks(M){
  const out = new Map();
  for(const [dc, plan] of Object.entries(M.networkDevices?.dimCityPlans || {})) for(const n of plan?.nodes || []) if(n.csvRef) out.set(String(n.csvRef), { dc, node:n });
  return out;
}
// every node line of the show, by CSV node: no → [{ universe, port, dest, note, label }]
export function csvNodeLines(M){
  const out = new Map();
  for(const D of (M.dmxLoose || [])){
    const ref = nodeRef(D); if(!ref || D.universe == null || D.universe === '') continue;
    if(!out.has(ref.no)) out.set(ref.no, []);
    out.get(ref.no).push({ universe:num(D.universe), port:ref.port, dest:D.dest || '', note:D.note || '', label:`Node ${ref.no}${ref.port ? `.${ref.port}` : ''}`, dimcity:D.dimcity });
  }
  return out;
}

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
    const veamOn = [null, null, null];
    for(const s of [1, 2, 3]) if(lk.veam?.[s] && App.effectiveBlockType(lk) !== 'XLR12') { linked.add(lk.veam[s]); slotUsed[s - 1] = true; veamOn[s - 1] = lk.veam[s]; }
    return { kind:'LK', id:lk.id, lines, slotUsed, veamOn };
  });
  const veams = [...M.byVeam.values()].filter(v => v.dimcity === dc && !linked.has(v.id) && !(M.veamUse?.get(v.id) || []).length).sort((a, b) => byNum(a.id, b.id));
  const veNeeds = veams.map(ve => ({
    kind:'VEAM', id:ve.id,
    lines:(ve.lines || []).filter(L => L.universe != null && L.universe !== '').map(L => ({ universe:num(L.universe), port:L.port, dest:L.dest || '', label:`${ve.id} · ${L.port}`, owner:ve.id, ownerKind:'VEAM' }))
  }));
  // a node line (Node 601.1) says which port of which node carries the universe: it is not fed from another node; the others (a line to a place) are
  const here = (M.dmxLoose || []).filter(D => D.dimcity === dc && D.universe != null && D.universe !== '');
  const loose = here.filter(D => !nodeRef(D)).map((D, i) => ({ universe:num(D.universe), port:'—', dest:D.dest || '', label:`Loose DMX ${i + 1}`, owner:'DMX', ownerKind:'DMX' }));
  const nodeLines = here.filter(D => nodeRef(D)).map(D => { const r = nodeRef(D); return { universe:num(D.universe), no:r.no, port:r.port, dest:D.dest || '', note:D.note || '', label:`Node ${r.no}${r.port ? `.${r.port}` : ''}` }; });
  return { lkNeeds, veNeeds, loose, nodeLines };
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
        nodes.push({ rack:ri, zone:zones[ri], iid:it.iid, key:`r:${pl.iid}:${it.iid}`, type:t, label:`N${n + 1}`, color:NODE_COLORS[n % NODE_COLORS.length], ports:Array.from({ length:Math.max(1, num(t.portCount, 8)) }, () => null) });
      } else if(it.kind === 'splitter'){
        const inputs = t.mode === 'AB' ? 2 : 1;
        splitters.push({ rack:ri, zone:zones[ri], iid:it.iid, key:`r:${pl.iid}:${it.iid}`, type:t, label:`S${splitters.length + 1}`, inputs:[], maxInputs:inputs, outputs:Array.from({ length:Math.max(1, num(t.outputCount, 10)) }, () => null) });
      } else if(it.kind === 'panel'){
        const lk = num(t.lkCount), vim = num(t.vimCount);
        // Veam4-aansluitingen delen de lijnen van een LK-aansluiting (standaard 3 per LK, in de paneel-builder in te stellen); de rest is los
        const per = Math.min(3, Math.max(0, num(t.vimPerLk, 3))), shared = Math.min(vim, lk * per);
        for(let g = 0; g < lk; g++){
          lkNo++;
          groups.push({ rack:ri, zone:zones[ri], panel:typeName(t), iid:it.iid, label:`LK${lkNo}`, vims:Array.from({ length:per }, (_, k) => k).filter(k => g * per + k < shared).map(k => ({ label:`Veam${++vimNo}`, slot:k, used:null, zone:zones[ri] })), lk:null });
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
      nodes.push({ rack:-1, zone:'loose', loose:true, field:d.place === 'field', iid:d.iid, key:`l:${d.iid}`, type:t, name:d.name || '', label:`N${n + 1}`, color:NODE_COLORS[n % NODE_COLORS.length], ports:Array.from({ length:Math.max(1, num(t.portCount, 8)) }, () => null) });
    } else if(d.kind === 'lkSpider'){
      groups.push({ rack:-1, zone:null, loose:true, panel:'Loose LK spider', iid:d.iid, nodeIid:d.nodeIid || null, label:`LK${++lkNo}`, vims:[], lk:null });
    } else if(d.kind === 'vimSpider'){
      soloVims.push({ rack:-1, zone:null, loose:true, panel:'Loose Veam4 spider', iid:d.iid, nodeIid:d.nodeIid || null, label:`Veam${++vimNo}`, used:null });
    }
    loose.push(d);
  }
  // the CSV name a node carries (Network → Nodes → "Name from the CSV"): its universes sit on the ports the CSV says
  const planNodes = M.networkDevices?.dimCityPlans?.[dc]?.nodes || [];
  for(const n of nodes){ const pn = planNodes.find(x => x.src === n.key && !x.gone); n.csvRef = pn?.csvRef ? String(pn.csvRef) : null; }
  return { nodes, splitters, groups, soloVims, racks, loose };
}

// How many loose spiders a DimCity needs for L LKs and V loose Veams. cap = { groups:[Veam4 sockets of every free panel group], lkOnly:LK-only sockets and
// loose LK spiders, soloVim:Veam4 sockets that are not part of a group }. Every panel group serves either one LK or its Veam4's; the choice that needs the
// fewest spiders wins, and when two choices need the same number the LKs get the rack (LK37) first.
export function solveSockets(L, V, cap){
  const groups = cap.groups || [];
  let best = null;
  for(let a = groups.length; a >= 0; a--){
    const lkMiss = Math.max(0, L - ((cap.lkOnly || 0) + a));
    const veMiss = Math.max(0, V - ((cap.soloVim || 0) + groups.slice(a).reduce((c, n) => c + n, 0)));
    if(!best || lkMiss + veMiss < best.lkMiss + best.veMiss) best = { groupsAsLk:a, lkMiss, veMiss };
  }
  return best || { groupsAsLk:0, lkMiss:Math.max(0, L - (cap.lkOnly || 0)), veMiss:Math.max(0, V - (cap.soloVim || 0)) };
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

  // 1. Sockets. Your own choices (plan.assign) come first, the rest is automatic.
  //  · A panel group is one LK37 socket OR the Veam4 sockets next to it: they carry the same node ports. With an LK on it the Veam4's cannot be
  //    used, and the other way round.
  //  · A Veam that is linked to an LK (slot A/B/C) hangs on the far end of that LK's cable: the LK comes into the DB, the Veam needs no socket.
  //  · The automatic part makes as few loose spiders as possible: it decides per panel group whether it serves an LK or the loose Veams.
  const wanted = D.lkNeeds.filter(n => n.lines.length || n.slotUsed.some(Boolean));     // LK zonder data: niets aansluiten
  const veWanted = D.veNeeds.filter(n => n.lines.length);
  const done = new Set(), veDone = new Set();
  const withVims = g => g.vims.length > 0;                                                 // a panel group (LK37 + Veam4's); the others are LK-only sockets / loose LK spiders
  const hasVeam = g => g.vims.some(v => v.used);
  for(const need of wanted){
    const a = assign[need.id];
    if(!a || a === 'auto') continue;
    if(a === 'none'){ skipped.push(need.id); done.add(need.id); continue; }
    if(a === 'spider'){ noSocket.lk.push(need.id); give(need, 'Loose LK spider'); done.add(need.id); continue; }
    const g = R.groups.find(x => x.label === a && !x.lk && !hasVeam(x));
    if(g){ g.lk = need; give(need, g.label, g.nodeIid, g.zone); done.add(need.id); }
    else badAssign.push(`${need.id} → ${a}`);
  }
  const anyVims = [...R.groups.flatMap(g => g.vims.map(v => ({ v, g }))), ...R.soloVims.map(v => ({ v, g:null }))];
  for(const need of veWanted){
    const a = assign[need.id];
    if(!a || a === 'auto') continue;
    if(a === 'none'){ skipped.push(need.id); veDone.add(need.id); continue; }
    if(a === 'spider'){ noSocket.ve.push(need.id); give(need, 'Loose Veam4 spider'); veDone.add(need.id); continue; }
    const f = anyVims.find(x => x.v.label === a && !x.v.used);                          // your own choice: any free Veam4 socket, unless an LK sits on that panel group
    if(f && !(f.g && f.g.lk)){ f.v.used = need; give(need, f.v.label, f.v.nodeIid, f.v.zone); veDone.add(need.id); }
    else badAssign.push(`${need.id} → ${a}`);
  }
  const autoLk = wanted.filter(n => !done.has(n.id)), autoVe = veWanted.filter(n => !veDone.has(n.id));
  const freeGroups = R.groups.filter(g => withVims(g) && !g.lk && !hasVeam(g));          // panel groups nobody has taken yet
  const lkOnly = R.groups.filter(g => !withVims(g) && !g.lk);                             // LK-only sockets and loose LK spiders that are free
  const soloFree = R.soloVims.filter(v => !v.used);
  const vimCap = k => soloFree.length + R.groups.filter(g => hasVeam(g) && !g.lk).reduce((c, g) => c + g.vims.filter(v => !v.used).length, 0) + freeGroups.slice(k).reduce((c, g) => c + g.vims.length, 0);
  const best = solveSockets(autoLk.length, autoVe.length, { groups:freeGroups.map(g => g.vims.length), lkOnly:lkOnly.length, soloVim:vimCap(freeGroups.length) });
  const lkMode = new Set(freeGroups.slice(0, best.groupsAsLk));
  const lkCands = [...R.groups.filter(g => g.nodeIid && !g.lk && !withVims(g)), ...R.groups.filter(g => !g.nodeIid && !g.lk && (!withVims(g) || lkMode.has(g)))];
  let gi = 0;
  for(const need of autoLk){
    const g = lkCands[gi++];
    if(g){ g.lk = need; give(need, g.label, g.nodeIid, g.zone); }
    else { noSocket.lk.push(need.id); give(need, 'Loose LK spider'); }
  }
  const veCands = [...R.soloVims.filter(v => !v.used && v.nodeIid), ...R.soloVims.filter(v => !v.used && !v.nodeIid),
    ...R.groups.filter(g => hasVeam(g) && !g.lk).flatMap(g => g.vims.filter(v => !v.used)), ...freeGroups.filter(g => !lkMode.has(g)).flatMap(g => g.vims)];
  for(const need of autoVe){
    const v = veCands.find(x => !x.used);
    if(v){ v.used = need; give(need, v.label, v.nodeIid, v.zone); }
    else { noSocket.ve.push(need.id); give(need, 'Loose Veam4 spider'); }
  }
  D.loose.forEach(l => lines.push({ ...l, socket:'Direct (XLR)' }));

  // 2b. The node lines of the CSV: the universes of a CSV node that is linked to a node sit on that node's ports, exactly as the CSV says
  // (they are fed by nothing else, and nothing else takes those ports). A CSV node that is linked to nothing is not patched: it is reported.
  const csv = csvNodeLines(M), links = csvLinks(M), csvProblems = [];
  let csvFixed = 0;
  for(const n of R.nodes){
    if(!n.csvRef) continue;
    for(const c of (csv.get(n.csvRef) || [])){
      if(!c.port){ csvProblems.push({ kind:'noPort', no:n.csvRef, universe:c.universe, node:n.label }); continue; }
      if(c.port > n.ports.length){ csvProblems.push({ kind:'range', no:n.csvRef, port:c.port, universe:c.universe, node:n.label, ports:n.ports.length }); continue; }
      if(n.ports[c.port - 1]){ csvProblems.push({ kind:'twice', no:n.csvRef, port:c.port, universe:c.universe, other:n.ports[c.port - 1].universe, node:n.label }); continue; }
      n.ports[c.port - 1] = { universe:c.universe, to:c.label, splitter:null, owner:`Node ${n.csvRef}`, ownerPort:c.port, dest:c.note || c.dest, fixed:true };
      lines.push({ universe:c.universe, port:'—', dest:c.dest, note:c.note, label:c.label, owner:'DMX', ownerKind:'DMX', socket:'—', fixed:true, feed:{ node:n.label, port:c.port, color:n.color } });
      csvFixed++;
    }
  }
  const unlinked = [];
  if(hasRackPlan(M, dc)){
    const byNo = new Map(); for(const l of D.nodeLines){ if(!byNo.has(l.no)) byNo.set(l.no, []); byNo.get(l.no).push(l); }
    for(const [no, ls] of byNo){
      const lk = links.get(no);
      if(!lk) unlinked.push({ no, lines:ls.length, universes:ls.map(x => x.universe), reason:'none' });
      else if(lk.node.gone) unlinked.push({ no, lines:ls.length, universes:ls.map(x => x.universe), reason:'gone', node:lk.node.id || '' });
    }
  }

  // 3. Voeding: nodepoorten, en splitters als de poorten niet genoeg zijn
  // a node that stands elsewhere (not in the DB) is never fed by the automatic patch; only a spider that was put on it by hand reaches it
  const feedNodes = R.nodes.filter(n => !n.field);
  const totalPorts = R.nodes.reduce((n, x) => n + x.ports.length, 0);
  const availPorts = feedNodes.reduce((n, x) => n + x.ports.filter(p => !p).length, 0);
  const byUni = new Map();
  for(const l of lines){ if(l.feed) continue; if(!byUni.has(l.universe)) byUni.set(l.universe, []); byUni.get(l.universe).push(l); }
  const feeds = [];                 // { universe, lines:[...], via:'direct' | splitter }
  let needPorts = lines.filter(l => !l.feed).length;
  const unis = [...byUni.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  for(const [u, ls] of unis){
    if(needPorts <= availPorts || ls.length < 2) continue;
    for(const sp of R.splitters){
      if(needPorts <= availPorts) break;
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
    const node = (pref && R.nodes.find(n => n.iid === pref && free(n) >= u.length && zoneOk(n.zone, uz))) || feedNodes.find(n => free(n) >= u.length && zoneOk(n.zone, uz));
    if(node) u.sort((x, y) => (x.line?.port ?? 0) - (y.line?.port ?? 0)).forEach(f => put(node, f));
    else rest.push(...u);
  }
  let unfed = 0; const unfedLines = [];
  for(const f of rest){
    const pref = f.line ? prefNode.get(f.line.owner) : null;
    const fz = zoneOfF(f);
    const node = (pref && R.nodes.find(n => n.iid === pref && free(n) > 0 && zoneOk(n.zone, fz))) || feedNodes.find(n => free(n) > 0 && zoneOk(n.zone, fz));
    if(node) put(node, f);
    else { unfed += f.splitter ? f.lines.length : 1; (f.splitter ? f.lines : [f.line]).forEach(l => unfedLines.push(l)); if(f.line) f.line.feed = null; else f.lines.forEach(l => l.feed = null); }
  }

  // 4. Adviezen
  const usedPorts = R.nodes.reduce((n, x) => n + x.ports.filter(Boolean).length, 0);
  const lkSockets = R.groups.length, lkUsed = R.groups.filter(g => g.lk).length;
  const allVims = [...R.groups.flatMap(g => g.vims), ...R.soloVims];
  const vimSockets = allVims.length;
  const vimUsed = allVims.filter(v => v.used).length;
  const nodeTypes = [...new Set(R.nodes.map(n => n.type))];
  if(badAssign.length) recs.push({ level:'warn', text:`Your socket choice is not possible any more for ${badAssign.join(', ')} → automatic instead.` });
  if(skipped.length) recs.push({ level:'info', text:`Not patched on purpose: ${skipped.join(', ')}.` });
  if(!R.racks.length && !R.loose.length) recs.push({ level:'info', text:'Place a rack to patch this DimCity automatically.' });
  else {
    const missing = R.loose.filter(d => d.missing);
    if(missing.length) recs.push({ level:'warn', text:`${missing.length} loose node${missing.length > 1 ? 's use' : ' uses'} a node type that is no longer in this show.` });
    if(noSocket.lk.length) recs.push({ level:'warn', text:`${noSocket.lk.length} LK${noSocket.lk.length > 1 ? 's have' : ' has'} no LK37 socket (${noSocket.lk.join(', ')}) → add ${noSocket.lk.length > 1 ? `${noSocket.lk.length} loose LK spiders` : 'a loose LK spider'}, or a panel with more LK sockets.` });
    if(noSocket.ve.length) recs.push({ level:'warn', text:`${noSocket.ve.length} Veam${noSocket.ve.length > 1 ? 's have' : ' has'} no Veam4 socket (${noSocket.ve.join(', ')}) → add ${noSocket.ve.length > 1 ? `${noSocket.ve.length} loose Veam4 spiders` : 'a loose Veam4 spider'}.` });
    if(unfed){
      const per = num(nodeTypes[0]?.portCount, 8);
      const farFree = R.nodes.some(n => n.ports.some(p => !p) && unfedLines.some(l => !zoneOk(n.zone, l.zone)));
      let fix = null;
      if(farFree){   // two racks next to each other, one with the lines, one with a free node port → "stack" the lower one on the upper
        const zs = new Set(unfedLines.map(l => l.zone).filter(z => z != null));
        for(const n of R.nodes) if(!fix && n.rack >= 0 && n.ports.some(p => !p) && !zs.has(n.zone)) for(const r of R.racks) if(zs.has(r.zone) && Math.abs(r.index - n.rack) === 1){ const top = Math.max(r.index, n.rack); fix = { type:'stack', iid:R.racks[top].placement.iid, label:`${R.racks[top].placement.name || R.racks[top].rack?.name || 'Rack'} → ${R.racks[top - 1].placement.name || R.racks[top - 1].rack?.name || 'rack above'}` }; break; }
      }
      if(farFree) recs.push({ level:'warn', text:`${unfedLines.filter(l => l.zone != null).length || unfed} line${unfed > 1 ? 's have' : ' has'} no free node port in the same rack. LK and Veam cables are short and cannot go from one rack to another — put a node in that rack, or place the racks on top of each other (tick "stacked" on the upper rack). Only network cables run between racks.`, fix });
      else recs.push({ level:'warn', text:`${unfed} line${unfed > 1 ? 's have' : ' has'} no node port → add ${Math.ceil(unfed / per)}× ${nodeTypes[0] ? typeName(nodeTypes[0]) : 'node'}${R.splitters.length ? '' : ', or a splitter for universes that are used more than once'}.` });
    }
    const lonely = R.nodes.filter(n => n.loose && !n.field && !n.csvRef && !R.loose.some(d => (d.kind === 'lkSpider' || d.kind === 'vimSpider') && (!d.nodeIid || d.nodeIid === n.iid)));
    const lines1 = x => `${x} line${x === 1 ? '' : 's'}`;
    for(const u of unlinked) recs.push({ level:'warn', text:u.reason === 'gone'
      ? `Node ${u.no} (${lines1(u.lines)} in the CSV) is linked to ${u.node || 'a node'} that is no longer in a rack, so these lines are not patched. Link Node ${u.no} to another node (Network page → Nodes → “Name from the CSV”, or on the loose node).`
      : `Node ${u.no} (${lines1(u.lines)} in the CSV: ${u.universes.slice(0, 4).map(x => 'U' + x).join(', ')}${u.universes.length > 4 ? ' …' : ''}) is not linked to a node yet, so these lines are not patched on any node. Choose “Name from the CSV” on the node that is Node ${u.no} (Network page → Nodes, or on the loose node).` });
    for(const q of csvProblems) recs.push({ level:'warn', text:q.kind === 'noPort' ? `Node ${q.no}: the CSV line with universe ${q.universe} has no port number, so it is not put on a port of ${q.node}.`
      : q.kind === 'range' ? `Node ${q.no}: port ${q.port} (universe ${q.universe}) does not exist on ${q.node} (${q.ports} ports), so it is not patched.`
      : `Node ${q.no}: port ${q.port} is used twice in the CSV (universe ${q.other} and ${q.universe}); only universe ${q.other} is on that port of ${q.node}.` });
    if(lonely.length) recs.push({ level:'warn', text:`A node without a rack needs a loose LK spider or a loose Veam spider to be fed: ${lonely.map(n => n.label).join(', ')} ${lonely.length > 1 ? 'have' : 'has'} none → add one next to ${lonely.length > 1 ? 'each of them' : 'it'}.` });
    if(!R.nodes.length && lines.length) recs.push({ level:'warn', text:R.racks.length ? 'This rack has no DMX nodes.' : 'There is no DMX node yet — add a loose node or place a rack.' });
    const freePorts = totalPorts - usedPorts;
    if(freePorts > 0 && !unfed) recs.push({ level:'ok', text:`${freePorts} node port${freePorts > 1 ? 's' : ''} still free.` });
    const freeLk = R.groups.filter(g => !g.lk && (!withVims(g) || lkMode.has(g))).length;
    if(freeLk > 0) recs.push({ level:'info', text:`${freeLk} LK37 socket${freeLk > 1 ? 's' : ''} unused.` });
    const usedSplit = R.splitters.filter(s => s.inputs.length).length;
    if(R.splitters.length && usedSplit < R.splitters.length) recs.push({ level:'info', text:`${R.splitters.length - usedSplit} splitter${R.splitters.length - usedSplit > 1 ? 's are' : ' is'} not needed — there are enough node ports.` });
    if(!recs.some(r => r.level === 'warn') && lines.length) recs.unshift({ level:'ok', text:`Everything fits: ${lines.length} line${lines.length > 1 ? 's' : ''} patched on ${usedPorts} node port${usedPorts === 1 ? '' : 's'}.` });
  }
  // the checklist: what this DimCity needs, what the racks and loose devices give, what is still missing (and so what loose spiders to add)
  const lonelyNodes = R.nodes.filter(n => n.loose && !n.field && !n.csvRef && !R.loose.some(d => (d.kind === 'lkSpider' || d.kind === 'vimSpider') && (!d.nodeIid || d.nodeIid === n.iid)));
  const lkNeed = wanted.filter(n => !skipped.includes(n.id)), veLoose = veWanted.filter(n => !skipped.includes(n.id));
  // "in the racks" is what the racks give in the arrangement that was chosen: a panel group counts as one LK37 or as its Veam4's, never both
  const panelGroups = R.groups.filter(withVims), asLk = panelGroups.filter(g => g.lk || lkMode.has(g)), asVeam = panelGroups.filter(g => !asLk.includes(g));
  const needs = {
    lk:{ need:lkNeed.length, have:R.groups.filter(g => !withVims(g)).length + asLk.length, missing:noSocket.lk.length },
    vim:{ need:veLoose.length, have:R.soloVims.length + asVeam.reduce((c, g) => c + g.vims.length, 0), missing:noSocket.ve.length },
    groups:{ total:panelGroups.length, asLk:asLk.length, asVeam:asVeam.length },
    cap:{ groups:panelGroups.map(g => g.vims.length), lkOnly:R.groups.filter(g => !withVims(g)).length, soloVim:R.soloVims.length },     // everything the racks and loose devices give, before anyone chose
    ports:{ need:lines.length, have:totalPorts, missing:unfed },
    spiders:{ lk:noSocket.lk.length, vim:noSocket.ve.length },
    nodesToAdd:unfed ? Math.ceil(unfed / Math.max(1, num(nodeTypes[0]?.portCount, 8))) : 0,
    lonely:lonelyNodes.length, missingTypes:R.loose.filter(d => d.missing).length,
    csvNodes:{ lines:csvFixed, unlinked:unlinked.length, problems:csvProblems.length }
  };
  needs.empty = !needs.lk.need && !needs.vim.need && !needs.ports.need && !needs.csvNodes.unlinked;
  needs.complete = !needs.empty && !needs.lk.missing && !needs.vim.missing && !needs.ports.missing && !needs.lonely && !needs.missingTypes && !badAssign.length && !needs.csvNodes.unlinked && !needs.csvNodes.problems;
  return {
    dc, skipped, badAssign, needs, lonely:lonelyNodes, unlinked, csvProblems, racks:R.racks, loose:R.loose, nodes:R.nodes, splitters:R.splitters, groups:R.groups, soloVims:R.soloVims, lines, recs,
    stats:{ lkSockets, lkUsed, vimSockets, vimUsed, nodePorts:totalPorts, nodePortsUsed:usedPorts, lines:lines.length, unfed,
      spiders:{ lk:noSocket.lk.length, vim:noSocket.ve.length } }
  };
}

// Network ports on the panels of the racks: a rack with a panel of 3 etherCON ports and 3 nodes behind it — every node is plugged into one
// of them (the cable to the switch goes to that port on the front). By default the nodes of a rack take the ports of its panels in order;
// plan.panelLinks = { [nodeIid]: { panelIid, port } | null } holds what was chosen by hand (null = this node is not on a panel).
// -> [{ rack, panelIid, panel:'P1', no, title, node:<plan node>|null, manual }]
export function panelPorts(M, dc, P = computeRackPlan(M, dc)){
  const { find } = types(M), chosen = M.networkDevices?.dimCityPlans?.[dc]?.panelLinks || {};
  const ports = []; let pn = 0;
  P.racks.forEach((R, ri) => {
    for(const it of (R.rack?.items || []).slice().sort((a, b) => (a.u - b.u) || ((a.side === 'R') - (b.side === 'R')))){
      if(it.kind !== 'panel') continue;
      const t = find('panelTypes', it.typeId), n = num(t?.etherconCount); if(!n) continue;
      pn++; const first = num(t.etherconFirst, 1) || 1;
      for(let i = 0; i < n; i++) ports.push({ rack:ri, panelIid:it.iid, panel:`P${pn}`, panelName:typeName(t), no:first + i, title:`${typeName(t)} · etherCON ${first + i}`, node:null, manual:false });
    }
  });
  const nodes = P.nodes.filter(n => !n.loose);
  for(const n of nodes){            // 1. what was chosen by hand
    const m = chosen[n.iid]; if(!m) continue;
    const p = ports.find(x => x.panelIid === m.panelIid && x.no === m.port && x.rack === n.rack && !x.node);
    if(p){ p.node = n; p.manual = true; }
  }
  for(const n of nodes){            // 2. the others in order, in their own rack
    if(chosen[n.iid] === null || ports.some(x => x.node === n)) continue;
    const p = ports.find(x => !x.node && x.rack === n.rack && !x.manual); if(p) p.node = n;
  }
  return ports;
}

// Kleur per LK/Veam: elke LK en elke Veam van de show heeft een eigen kleur, nooit twee dezelfde, en overal dezelfde kleur
// (rek, signaalstroom, PDF, labels). De kleur hangt af van het nummer in de hele show, niet van het rek waar hij op zit.
const OWNER_BASE = ['#f2b33d', '#4c9dff', '#e8503a', '#35c47c', '#b86bff', '#22d3ee', '#ff6fb5', '#a3e635', '#ff8a3d', '#7c8cff', '#2dd4bf', '#d946ef'];
const hsl2rgb = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; };
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lab = ([r, g, b]) => {                 // sRGB → CIE Lab, to measure how different two colours look
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * .4124 + G * .3576 + B * .1805) / .95047, Y = R * .2126 + G * .7152 + B * .0722, Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
  const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
let paletteCache = { key:'', map:new Map() };
function ownerPalette(ids){
  const key = ids.join('|'); if(paletteCache.key === key) return paletteCache.map;
  const out = new Map(), used = [];
  const cand = []; for(let h = 0; h < 360; h += 4) for(const [s, l] of [[78, 60], [62, 48], [80, 72], [55, 38]]) { const c = hex(hsl2rgb(h, s, l)); cand.push({ c, lab:lab(unhex(c)) }); }
  ids.forEach((id, i) => {
    let c;
    if(i < OWNER_BASE.length) c = OWNER_BASE[i];
    else {           // the colour that differs most from every colour given out so far
      let best = null, bestD = -1;
      for(const k of cand){ let d = 1e9; for(const u of used){ const e = (k.lab[0] - u[0]) ** 2 + (k.lab[1] - u[1]) ** 2 + (k.lab[2] - u[2]) ** 2; if(e < d) d = e; if(d <= bestD) break; } if(d > bestD){ bestD = d; best = k; } }
      c = best.c;
    }
    out.set(id, c); used.push(lab(unhex(c)));
  });
  paletteCache = { key, map:out }; return out;
}
export function ownerColors(plan){
  const M = App.getMODEL();
  const all = [...M.byLK.keys(), ...M.byVeam.keys()].sort((a, b) => byNum(a.replace(/^\D+/, ''), b.replace(/^\D+/, '')) || (/^V/i.test(a) ? 1 : -1) - (/^V/i.test(b) ? 1 : -1));
  const pal = ownerPalette(all), out = new Map();
  const give = id => { if(id && !out.has(id)) out.set(id, pal.get(id) || ownerPalette([...all, id]).get(id)); };
  for(const l of plan.lines) if(l.ownerKind === 'LK' || l.ownerKind === 'VEAM') give(l.owner);
  for(const id of (plan.skipped || [])) give(id);
  for(const g of plan.groups || []){ give(g.lk?.id); for(const v of g.vims || []){ give(v.used?.id); give(v.linked); } }
  for(const v of plan.soloVims || []) give(v.used?.id);
  return out;
}

// the colour of one LK or Veam of the show (the same colour as on the rack and in the flow), or null
export function ownerColor(id){
  const M = App.getMODEL(), all = [...M.byLK.keys(), ...M.byVeam.keys()].sort((a, b) => byNum(a.replace(/^\D+/, ''), b.replace(/^\D+/, '')) || (/^V/i.test(a) ? 1 : -1) - (/^V/i.test(b) ? 1 : -1));
  const pal = ownerPalette(all); return pal.get(id) || null;
}
window.RackEngine = { zoneOk, computeRackPlan, solveSockets, placedRacks, looseDevices, hasRackPlan, ownerColors, ownerColor, panelPorts, demand, nodeRef, csvLinks, csvNodeLines, NODE_COLORS };
