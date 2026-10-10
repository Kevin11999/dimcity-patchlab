// ui/node-link.js — "Node 401.1" in the CSV: a DMX line whose destination names a node and a port.
// 401 = DB04, node 01 (the number works like V401); .1 = port 1. A node of the network plan can be linked to such a name:
// the universes of the CSV lines are then put on the right ports of that node.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const M = () => App.getMODEL();
  const RE = /^\s*node\s*0*(\d{3,4})(?:\s*[.\-/]\s*(\d{1,3}))?\s*$/i;

  // [{ no:'401', dc:'DB04', index:1, ports:[{ port, universe, dest, dimcity }] }]
  function refs(){
    const map = new Map();
    for(const D of (M()?.dmxLoose || [])){
      const m = RE.exec(String(D.dest || '')); if(!m) continue;
      const no = m[1], r = map.get(no) || { no, dc:`DB${String(Math.floor(Number(no) / 100)).padStart(2, '0')}`, index:Number(no) % 100 || 1, ports:[] };
      r.ports.push({ port:m[2] ? Number(m[2]) : null, universe:D.universe, dest:D.dest, dimcity:D.dimcity });
      map.set(no, r);
    }
    return [...map.values()].sort((a, b) => a.no.localeCompare(b.no, undefined, { numeric:true }));
  }
  const planNodes = dc => (App.net.getDimPlan(dc).nodes || []);
  const refOf = no => refs().find(r => r.no === no);
  // put the universes of the CSV lines on the ports of the linked node
  function fill(node, ref){
    node.universes = Array.isArray(node.universes) ? node.universes : [];
    let n = 0;
    for(const p of ref.ports) if(p.port && p.universe != null){ node.universes[p.port - 1] = p.universe; n++; }
    return n;
  }
  function link(dc, index, no){
    const node = planNodes(dc)[index]; if(!node) return 0;
    for(const x of planNodes(dc)) if(x !== node && x.csvRef === no) delete x.csvRef;
    if(!no){ delete node.csvRef; M().ui.dirty = true; return 0; }
    const ref = refOf(no); if(!ref) return 0;
    node.csvRef = no; M().ui.dirty = true;
    return fill(node, ref);
  }
  // the universes of a linked node are put on its ports again (after the rack patch gave it new ones)
  function refill(node){ const r = node?.csvRef ? refOf(node.csvRef) : null; if(r) fill(node, r); }
  // after the network plan was rebuilt from the racks: linked nodes get their ports back
  function reapply(dc, oldNodes){
    const nodes = planNodes(dc);
    (oldNodes || []).forEach((o, i) => { if(o?.csvRef && nodes[i]){ nodes[i].csvRef = o.csvRef; const r = refOf(o.csvRef); if(r) fill(nodes[i], r); } });
  }
  // 401 -> node 1 of DB04 …
  function suggest(){
    return refs().map(r => { const nodes = planNodes(r.dc); const idx = r.index - 1; const taken = nodes.findIndex(n => n.csvRef === r.no);
      return { ...r, nodeIndex: taken >= 0 ? taken : (nodes[idx] ? idx : -1), linked: taken >= 0, nodeCount: nodes.length }; });
  }
  function autoLink(){ let n = 0; for(const s of suggest()) if(!s.linked && s.nodeIndex >= 0 && !planNodes(s.dc)[s.nodeIndex].csvRef){ link(s.dc, s.nodeIndex, s.no); n++; } return n; }
  const status = () => { const all = suggest(); return { total:all.length, linked:all.filter(x => x.linked).length }; };
  // <select> shown on a node of the network plan
  function selectHtml(dc, index, node){
    const all = refs(); if(!all.length) return '';
    const mine = all.filter(r => r.dc === dc), rest = all.filter(r => r.dc !== dc);
    const opt = r => `<option value="${r.no}" ${node.csvRef === r.no ? 'selected' : ''}>Node ${r.no} · ${r.ports.length} ${t('lines', 'regels')}</option>`;
    return `<label class="field nl-field">${t('Name from the CSV', 'Naam uit de CSV')}<select class="nlSelect" data-nl-dc="${dc}" data-nl-index="${index}"><option value="">—</option>${mine.map(opt).join('')}${rest.length ? `<optgroup label="${t('Other DimCities', 'Andere DimCities')}">${rest.map(opt).join('')}</optgroup>` : ''}</select></label>`;
  }
  function bind(root, rerender){
    root.querySelectorAll('.nlSelect').forEach(sel => sel.onchange = () => {
      const n = link(sel.dataset.nlDc, Number(sel.dataset.nlIndex), sel.value);
      if(sel.value) App.ui.toast(`Node ${sel.value}: ${n} ${t('ports filled from the CSV', 'poorten gevuld uit de CSV')}`);
      rerender();
    });
  }
  window.NodeLink = { refs, suggest, link, autoLink, reapply, refill, status, selectHtml, bind };
})();
