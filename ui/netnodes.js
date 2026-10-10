// ui/netnodes.js — the Nodes tab of the Network page: every DMX node with the universes on its ports, the names of the LKs and Veams that
// are patched on those universes, and where the node has to be plugged in (a switch port, and the network port of a rack panel it sits behind).
//   NetNodes.ctx(dc)       rack data for one render: which panel port a node is behind
//   NetNodes.card(dc)      the nodes of one DimCity as cards, plus the planning (node type, auto-assign nodes, splitters)
//   NetNodes.bind(root, dc, rerender)
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const E = () => window.RackEngine;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const plan = dc => App.net.getDimPlan(dc);
  const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';
  const dirty = () => { const m = M(); if(m?.ui) m.ui.dirty = true; };

  // the rack side of a DimCity, worked out once per render: which node of the plan stands behind which network port of a panel
  function ctx(dc){
    let P = null, ports = [];
    try { P = E().computeRackPlan(M(), dc); ports = E().panelPorts(M(), dc, P); } catch { P = null; }
    const nodes = plan(dc).nodes || [];
    const rackNode = idx => { const dev = nodes[idx]; return dev?.src ? (P?.nodes || []).find(n => n.key === dev.src) || null : null; };
    return { P, ports, rackNode, panelOf(idx){ const n = rackNode(idx); const pl = n ? ports.find(x => x.node === n) : null; return pl ? { panel:pl.panel, no:pl.no, title:pl.title } : null; } };
  }

  // universe → who is patched on it: [{ id, kind, ports:'1-4', color, dests:[] }]
  function carriers(dc){
    const by = new Map(), add = (u, e) => { u = Number(u); if(!Number.isFinite(u)) return; if(!by.has(u)) by.set(u, new Map()); const m = by.get(u); if(!m.has(e.id)) m.set(e.id, { id:e.id, kind:e.kind, ports:[], dests:new Set() }); const x = m.get(e.id); if(e.port != null && e.port !== '—') x.ports.push(Number(e.port)); if(e.dest) x.dests.add(e.dest); };
    try { const D = E().demand(M(), dc); for(const need of [...D.lkNeeds, ...D.veNeeds]) for(const l of need.lines) add(l.universe, { id:l.owner, kind:l.ownerKind, port:l.port, dest:l.dest }); for(const l of D.loose) add(l.universe, { id:'DMX', kind:'DMX', dest:l.dest }); } catch {}
    for(const d of (M().dmxLoose || [])) if(d.dimcity === dc && d.nodeRow && d.universe != null && d.note) add(d.universe, { id:'DMX', kind:'DMX', dest:d.note });
    const out = new Map();
    for(const [u, m] of by) out.set(u, [...m.values()].map(x => ({ id:x.id, kind:x.kind, ports:window.NetCables ? window.NetCables.uniText(x.ports) : x.ports.join(','), color:x.kind === 'DMX' ? '#7d8594' : (E().ownerColor?.(x.id) || '#94a3b8'), dests:[...x.dests] })));
    return out;
  }

  function dmxPorts(dc, inst, idx, car){
    const pp = window.PortPlan ? window.PortPlan.ndPorts(dc, inst, idx) : [];
    return pp.map(p => {
      const own = p.uni != null ? (car.get(p.uni) || []) : [];
      const first = own.find(o => o.kind !== 'DMX') || own[0];
      const dests = [...new Set(own.flatMap(o => o.dests))];
      const tip = `${t('DMX port', 'DMX-poort')} ${p.n} · ${p.uni == null ? t('no universe', 'geen universe') : 'U' + p.uni}${own.length ? ' · ' + own.map(o => `${o.id}${o.ports ? ' ' + o.ports : ''}`).join(', ') : ''}${dests.length ? ' · ' + dests.join(', ') : ''}`;
      return `<div class="nn-port ${p.uni == null ? 'free' : ''}" style="--c:${first ? first.color : 'var(--text-3)'}" title="${esc(tip)}"><small>${p.n}</small><b>${p.uni == null ? '—' : 'U' + p.uni}</b>
        <span class="nn-own">${own.slice(0, 2).map(o => `<span><i style="--c:${o.color}"></i>${esc(o.id === 'DMX' ? t('Loose DMX', 'Los DMX') : o.id)}${o.ports ? ` <small>${esc(o.ports)}</small>` : ''}</span>`).join('') || (p.uni == null ? '' : `<span class="subtle">${t('no LK / Veam', 'geen LK / Veam')}</span>`)}${own.length > 2 ? `<span class="subtle">+${own.length - 2}</span>` : ''}</span>
        <em>${esc(dests[0] || '')}</em></div>`;
    }).join('');
  }

  // where to plug a node: a select with every switch port (the ports with a device show it; choosing one takes it over)
  function plugRow(dc, row, sws, rows, links){
    const opts = sws.map(s => `<optgroup label="${esc(s.label)}${s.where ? ' · ' + esc(s.where) : ''}">${Array.from({ length:s.rj }, (_, i) => i + 1).filter(n => !links.some(l => l.sw === s.label && l.port === n)).map(n => {
      const o = rows.find(r => r.sw === s.label && r.swPort === n && r.key !== row.key);
      return `<option value="${esc(s.label)}|${n}" ${row.sw === s.label && row.swPort === n ? 'selected' : ''}>${esc(s.label)} · ${t('port', 'poort')} ${n}${o ? ` — ${esc(o.device)}` : ''}</option>`;
    }).join('')}</optgroup>`).join('');
    const v = row.vlans?.[0] != null ? window.Fent?.vlanById(row.vlans[0]) : null;
    return `<div class="nn-plug ${row.unplaced ? 'warn' : ''}"><span class="nn-plug-l">${row.ethCount > 1 ? `ETH${row.eth}` : t('Network', 'Netwerk')}</span>
      <select data-nnplug="${esc(row.key)}" ${sws.length ? '' : 'disabled'}><option value="">${sws.length ? t('— not plugged in yet —', '— nog niet aangesloten —') : t('no switch in this DimCity', 'geen switch in deze DimCity')}</option>${opts}</select>
      ${row.sw ? `<span class="nn-tag">${row.mode === 'trunk' ? 'Trunk' : v ? window.NetCables.vlanChip(v.id) : ''}</span>` : ''}</div>`;
  }

  // advanced network (LumiNode): VLAN groups on the node itself. The groups come from the addresses of the node: every VLAN is a group with its
  // addresses, the lighting groups listen for lighting, and a port that carries two VLANs is a trunk (so the switch port must be a trunk too).
  let apiMod = null; import(new URL('./core/luminex-api.js', document.baseURI).href).then(m => { apiMod = m; }).catch(() => {});
  function advancedHtml(dc, idx, inst, nt){
    const eth = Math.min(2, Math.max(1, Number(nt.ethernetCount) || 1)), on = !!inst.advanced;
    const head = `<label class="nn-adv-sw" title="${esc(t('Send the VLAN groups to the node through its network API (/api/network_config) instead of one IP address', 'Stuur de VLAN-groepen via de netwerk-API van de node (/api/network_config) in plaats van één IP-adres'))}"><input type="checkbox" data-nnadv="${idx}" ${on ? 'checked' : ''}> <b>${t('Advanced network', 'Advanced netwerk')}</b> <span class="subtle">${t('VLAN groups on the node', 'VLAN-groepen op de node')}</span></label>`;
    if(!on || !apiMod) return `<div class="nn-adv">${head}</div>`;
    const want = apiMod.lumiNetWant(window.Fent.ifaces(inst, eth), eth, id => window.Fent.vlanById(id));
    const issues = (window.IpPlan?.check() || []).filter(i => i.dc === dc && i.label === (inst.id || inst.name) && (i.code === 'TRUNK' || i.code === 'PORTVLAN'));
    if(!want.groups.length) return `<div class="nn-adv">${head}<div class="subtle" style="margin-top:4px">${t('Give this node addresses on one or more VLANs (Addresses tab); every VLAN becomes a group.', 'Geef deze node adressen op één of meer VLAN’s (tab Adressen); elk VLAN wordt een groep.')}</div></div>`;
    return `<div class="nn-adv on">${head}
      <table class="data-table nn-adv-t"><thead><tr><th>${t('Group', 'Groep')}</th><th>${t('Addresses', 'Adressen')}</th><th>${t('Lighting', 'Licht')}</th><th>${t('Port', 'Poort')}</th></tr></thead><tbody>
      ${want.groups.map(g => `<tr><td>${window.NetCables ? window.NetCables.vlanChip(g.vid) : g.vid}</td><td class="mono">${g.addresses.map(a => `${esc(a.ip)}/${a.prefix}${eth > 1 ? ` <span class="subtle">ETH${a.eth}</span>` : ''}`).join('<br>')}</td><td>${g.listen ? `<span class="tag green">${t('listens', 'luistert')}</span>` : `<span class="subtle">—</span>`}${g.mgmt ? ` <span class="tag">${t('management', 'beheer')}</span>` : ''}</td><td>${want.ports.filter(p => p.vids.includes(g.vid)).map(p => `ETH${p.eth}${p.vids.length > 1 ? ' <span class="tag blue">trunk</span>' : ''}`).join(', ')}</td></tr>`).join('')}</tbody></table>
      ${issues.map(i => `<div class="rp-adv-note warn">${I('alert', 13)} ${esc(t(i.en, i.nl))}</div>`).join('')}</div>`;
  }

  function nodeCard(dc, idx, c, car, sws, rows, links){
    const inst = plan(dc).nodes[idx], nt = (M().networkDevices.nodeTypes || []).find(x => x.id === inst.typeId);
    if(!nt) return `<div class="nn-node bad"><div class="nn-head">${I('alert', 14)} <b>${esc(inst.id || '')}</b> <span class="subtle">${t('node type', 'nodetype')} ${esc(inst.typeId || '?')} ${t('is not in this show any more', 'zit niet meer in deze show')}</span><span style="flex:1"></span><button class="sm ghost" data-nnrm="${idx}">${I('trash', 13)}</button></div></div>`;
    const mine = rows.filter(r => r.kind === 'node' && r.idx === idx), pl = c.panelOf(idx), rn = c.rackNode(idx);
    const ifs = window.Fent ? window.Fent.ifaces(inst, Math.min(2, Math.max(1, Number(nt.ethernetCount) || 1))) : [];
    const used = (inst.universes || []).filter(u => u != null && u !== '').length, total = Math.max(1, Number(nt.portCount) || 1);
    return `<div class="nn-node" data-nnnode="${idx}"><div class="nn-head">${rn ? `<span class="rk-badge" style="--c:${rn.color}">${esc(rn.label)}</span>` : ''}<b>${esc(inst.id || `Node ${idx + 1}`)}</b><span>${esc(typeName(nt))}</span>${inst.csvRef ? `<span class="nn-csv" title="${esc(t('Name in the CSV', 'Naam in de CSV'))}">Node ${esc(inst.csvRef)}</span>` : ''}${rn ? `<span class="subtle">${esc(rn.loose ? (rn.name || t('loose node', 'losse node')) : (c.P.racks[rn.rack]?.placement.name || c.P.racks[rn.rack]?.rack?.name || ''))}</span>` : `<span class="subtle">${esc(inst.name || '')}</span>`}
        <span style="flex:1"></span><span class="subtle">${used}/${total} ${t('ports in use', 'poorten in gebruik')}</span>${inst.src ? '' : `<button class="sm ghost" data-nnrm="${idx}" title="${esc(t('Remove this node', 'Verwijder deze node'))}">${I('trash', 13)}</button>`}</div>
      <div class="nn-plugs">${mine.map(r => plugRow(dc, r, sws, rows, links)).join('') || `<div class="nn-plug warn"><span class="nn-plug-l">${t('Network', 'Netwerk')}</span><span class="subtle">${t('This node has no address yet, so it is not in the port plan. Give it one on the Addresses tab.', 'Deze node heeft nog geen adres, dus staat hij niet in het poortplan. Geef hem er een op het tabblad Adressen.')}</span></div>`}
        ${pl ? `<div class="nn-via">${I('network', 13)} ${t('The node stands behind', 'De node zit achter')} <b>${esc(pl.panel)} · etherCON ${pl.no}</b> ${t('of the rack panel: the cable to the switch goes into that port on the front.', 'van het rekpaneel: de kabel naar de switch gaat in die poort aan de voorkant.')}</div>` : (rn && !rn.loose ? `<div class="nn-via subtle">${I('info', 13)} ${t('This rack node is plugged straight into the switch (no network port on a panel).', 'Deze racknode zit rechtstreeks aan de switch (geen netwerkpoort op een paneel).')}</div>` : '')}</div>
      ${ifs.length ? `<div class="nn-addr">${ifs.map(x => `${x.vlan != null && window.NetCables ? window.NetCables.vlanChip(x.vlan) : ''}<span class="mono">${esc(x.ip)}</span>${Number(nt.ethernetCount) > 1 ? `<span class="subtle">ETH${x.eth}</span>` : ''}`).join(' ')}</div>` : ''}
      ${advancedHtml(dc, idx, inst, nt)}
      <div class="nn-ports">${dmxPorts(dc, inst, idx, car)}</div>${window.NodeLink ? window.NodeLink.selectHtml(dc, idx, inst) : ''}</div>`;
  }

  // a node that is no longer in a rack: its id, addresses and switch port are kept; hand them to a new node, or remove it
  function goneCard(dc, idx, inst, c, rows){
    const nt = (M().networkDevices.nodeTypes || []).find(x => x.id === inst.typeId), mine = rows.filter(r => r.kind === 'node' && r.idx === idx && r.sw);
    const fresh = window.RackPlan.freshNodesOf(dc).map(n => ({ n, i:plan(dc).nodes.indexOf(n) })), same = fresh.find(f => f.n.typeId === inst.typeId) || fresh[0];
    const label = f => { const rn = c.rackNode(f.i), ty = (M().networkDevices.nodeTypes || []).find(x => x.id === f.n.typeId); return `${f.n.id} · ${esc(typeName(ty))}${rn ? ` · ${esc(rn.loose ? (rn.name || t('loose node', 'losse node')) : (c.P.racks[rn.rack]?.placement.name || c.P.racks[rn.rack]?.rack?.name || ''))}` : ''}`; };
    const ips = window.Fent ? window.Fent.ifaces(inst, Math.min(2, Math.max(1, Number(nt?.ethernetCount) || 1))).map(x => x.ip).filter(Boolean) : [];
    return `<div class="nn-node gone"><div class="nn-head">${I('alert', 14)} <b>${esc(inst.id || '')}</b><span>${esc(nt ? typeName(nt) : inst.typeId || '')}</span><span class="tag yellow">${t('no longer in a rack', 'niet meer in een rek')}</span><span style="flex:1"></span></div>
      <div class="subtle" style="font-size:12.5px;margin:2px 0 8px">${t('Its address, switch port and universes are kept. Give them to a new node, or remove it.', 'Zijn adres, switchpoort en universes blijven bewaard. Geef ze aan een nieuwe node, of verwijder hem.')}
        ${ips.length ? ` <span class="mono">${ips.map(esc).join(' · ')}</span>` : ''}${mine.length ? ` · ${t('plugged into', 'aangesloten op')} ${mine.map(r => `${esc(r.sw)} ${t('port', 'poort')} ${r.swPort}`).join(', ')}` : ''}</div>
      <div class="nn-gone-act"><label class="nn-gone-l">${t('Replace by', 'Vervangen door')}<select data-nnrepl="${idx}" ${fresh.length ? '' : 'disabled'}>${fresh.length ? fresh.map(f => `<option value="${f.i}" ${same && f.i === same.i ? 'selected' : ''}>${label(f)}</option>`).join('') : `<option>${t('no new node yet — add the new device to a rack first', 'nog geen nieuwe node — zet het nieuwe apparaat eerst in een rek')}</option>`}</select></label>
        <button class="sm primary" data-nnreplace="${idx}" ${fresh.length ? '' : 'disabled'}>${t('Replace', 'Vervangen')}</button><button class="sm" data-nnrm="${idx}">${I('trash', 13)} ${t('Remove', 'Verwijderen')}</button></div></div>`;
  }

  function planCard(dc){
    const nd = M().networkDevices, p = plan(dc), unis = App.net.uniqueUniversesInDim(dc), nt = nd.nodeTypes.find(x => x.id === p.nodeTypeId) || nd.nodeTypes[0];
    const need = nt ? App.net.calculateNodeNeedForDim(dc, nt.portCount) : null, hasRacks = E()?.hasRackPlan?.(M(), dc);
    const nodeOpts = nd.nodeTypes.map(x => `<option value="${esc(x.id)}" ${p.nodeTypeId === x.id ? 'selected' : ''}>${esc(typeName(x))} · ${Number(x.portCount || 0)} ${t('ports', 'poorten')}</option>`).join('') || `<option value="">${t('No node types yet', 'Nog geen nodetypes')}</option>`;
    const splOpts = nd.splitterTypes.map(x => `<option value="${esc(x.id)}" ${p.lastSplitterTypeId === x.id ? 'selected' : ''}>${esc(typeName(x))} · ${Number(x.outputCount || 0)} ${t('outputs', 'uitgangen')}</option>`).join('') || `<option value="">${t('No splitter types yet', 'Nog geen splittertypes')}</option>`;
    return `<div class="nn-plan"><span class="info-pill">${unis.length} ${t('universes', 'universes')}</span>${need && !hasRacks ? `<span class="info-pill">${need.nodeCount} ${t('nodes needed', 'nodes nodig')}</span>` : ''}<span class="info-pill">${p.nodes.length} ${t('nodes placed', 'nodes geplaatst')}</span><span class="info-pill">${p.splitters.length} ${t('splitters', 'splitters')}</span>
      <span style="flex:1"></span>
      ${hasRacks ? `<span class="subtle" title="${esc(t('Place or remove racks and loose nodes on the Racks card of this DimCity: the nodes follow by themselves', 'Plaats of verwijder racks en losse nodes op de racks-kaart van deze DimCity: de nodes volgen vanzelf'))}">${I('rack', 13)} ${t('The nodes follow the racks of this DimCity', 'De nodes volgen de racks van deze DimCity')}</span>` : ''}
      ${hasRacks ? '' : `<details class="nn-more"><summary class="sm">${t('Plan by hand…', 'Zelf plannen…')}</summary><div class="planner-controls" style="margin-top:8px">
        <label>${t('Node type', 'Nodetype')}<select class="nnNodeType" data-dc="${esc(dc)}">${nodeOpts}</select></label><button class="nnAutoNode" data-dc="${esc(dc)}" ${nd.nodeTypes.length ? '' : 'disabled'}>${I('refresh', 14)}${t('Auto-assign nodes', 'Nodes automatisch indelen')}</button>
        <label>${t('Splitter type', 'Splittertype')}<select class="nnSplitType" data-dc="${esc(dc)}">${splOpts}</select></label><button class="nnAutoSplit" data-dc="${esc(dc)}" ${nd.splitterTypes.length ? '' : 'disabled'}>${I('refresh', 14)}${t('Auto-calculate splitters', 'Splitters automatisch berekenen')}</button></div>
        <div class="subtle" style="font-size:12px;margin-top:4px">${t('Auto-assign puts the universes of this DimCity on nodes of the chosen type, lowest first. It replaces the nodes of this DimCity.', 'Automatisch indelen zet de universes van deze DimCity op nodes van het gekozen type, laagste eerst. Het vervangt de nodes van deze DimCity.')}</div></details>`}</div>`;
  }
  function splittersHtml(dc){
    const sp = plan(dc).splitters || []; if(!sp.length) return '';
    const nd = M().networkDevices;
    return `<div class="nn-spl"><div class="rb-label" style="margin:10px 0 4px">${t('Splitters', 'Splitters')}</div>${sp.map(s => { const ty = nd.splitterTypes.find(x => x.id === s.typeId); const outs = (s.portAssignments || []).filter(Boolean).length;
      return `<div class="nn-spl-row"><b>${esc(s.id || '')}</b><span>${esc(ty ? typeName(ty) : s.typeId || '')}</span><span class="subtle">${t('input', 'ingang')}: ${(s.inputUniverses || s.universes || []).map(u => 'U' + u).join(' / ') || '—'}</span><span class="subtle">${outs}/${ty?.outputCount || (s.portAssignments || []).length} ${t('outputs used', 'uitgangen gebruikt')}</span>${s.ip ? `<span class="mono subtle">${esc(s.ip)}</span>` : ''}</div>`; }).join('')}</div>`;
  }

  function card(dc){
    const p = plan(dc), sws = window.NetSwitches.list(dc), rows = window.FentUI.portPlan(dc).rows, c = ctx(dc), car = carriers(dc), links = window.NetSwitches.linksOf(dc);
    const nodes = p.nodes.map((n, i) => n.gone ? '' : nodeCard(dc, i, c, car, sws, rows, links)).join('');
    const gone = p.nodes.map((n, i) => n.gone ? goneCard(dc, i, n, c, rows) : '').join('');
    const unplaced = rows.filter(r => r.kind === 'node' && r.unplaced).length;
    return `<div class="nn-db" style="--dim-color:${App.dimColor(dc)}"><div class="nn-db-h"><i class="dot" style="background:${App.dimColor(dc)}"></i><b>${esc(dc)}</b><span class="subtle">${p.nodes.length} ${t('nodes', 'nodes')}</span>${unplaced ? `<span class="tag yellow">${unplaced} ${t('without a switch port', 'zonder switchpoort')}</span>` : ''}</div>
      ${gone}${planCard(dc)}${nodes || `<div class="nn-empty">${t('No nodes in this DimCity yet. Place a rack (or add a loose node) on the Racks card of this DimCity and its nodes appear here by themselves — or let PatchLab plan them from the universes.', 'Nog geen nodes in deze DimCity. Plaats een rek (of voeg een losse node toe) op de racks-kaart van deze DimCity en de nodes verschijnen hier vanzelf — of laat PatchLab ze plannen vanuit de universes.')}</div>`}${splittersHtml(dc)}</div>`;
  }

  function bind(root, dc, rerender){
    root.querySelectorAll(`[data-nnnode]`).forEach(card => {
      const idx = Number(card.dataset.nnnode);
      card.querySelectorAll('[data-nnplug]').forEach(sel => sel.onchange = () => {
        window.PatchHistory?.label?.(`${dc}: ${sel.dataset.nnplug} plugged in`);
        if(!sel.value) window.PortPlan.unplace(dc, sel.dataset.nnplug);
        else { const [sw, port] = sel.value.split('|'); window.PortPlan.place(dc, sel.dataset.nnplug, sw, Number(port)); }
        rerender();
      });
    });
    root.querySelectorAll('[data-nnadv]').forEach(c => c.onchange = () => { const n = plan(dc).nodes[Number(c.dataset.nnadv)]; if(!n) return; window.PatchHistory?.label?.(`${dc}: advanced network ${c.checked ? 'on' : 'off'}`); if(c.checked) n.advanced = true; else delete n.advanced; dirty(); rerender(); });
    root.querySelectorAll('[data-nnrm]').forEach(b => b.onclick = async () => {
      const idx = Number(b.dataset.nnrm), n = plan(dc).nodes[idx]; if(!n) return;
      const ok = await App.ui.confirmDialog({ title:t('Remove this node?', 'Deze node verwijderen?'), message:`${n.id || ''} ${t('is removed from the network plan of', 'wordt uit het netwerkplan van')} ${dc} ${t(`. Its address and switch port go with it.`, ` gehaald. Zijn adres en switchpoort verdwijnen mee.`)}`, okLabel:t('Remove', 'Verwijderen'), danger:true });
      if(!ok) return; window.RackPlan.removeNode(dc, idx); dirty(); rerender();
    });
    root.querySelectorAll('[data-nnreplace]').forEach(b => b.onclick = () => {
      const gi = Number(b.dataset.nnreplace), sel = root.querySelector(`[data-nnrepl="${gi}"]`), wi = Number(sel?.value);
      if(!Number.isInteger(wi) || !plan(dc).nodes[wi]) return;
      const id = plan(dc).nodes[gi]?.id;
      if(window.RackPlan.replaceNode(dc, gi, wi)){ App.ui.toast(`${id}: ${t('taken over by the new node', 'overgenomen door de nieuwe node')}`); dirty(); rerender(); }
    });
    root.querySelectorAll('.nnNodeType').forEach(sel => sel.onchange = () => { plan(sel.dataset.dc).nodeTypeId = sel.value; dirty(); });
    root.querySelectorAll('.nnSplitType').forEach(sel => sel.onchange = () => { plan(sel.dataset.dc).lastSplitterTypeId = sel.value; dirty(); });
    root.querySelectorAll('.nnAutoNode').forEach(b => b.onclick = async () => {
      const d = b.dataset.dc, p = plan(d);
      if(p.nodes.length){ const ok = await App.ui.confirmDialog({ title:t('Replace the nodes?', 'De nodes vervangen?'), message:t(`${d} has ${p.nodes.length} node(s). They are replaced by nodes planned from the universes.`, `${d} heeft ${p.nodes.length} node(s). Ze worden vervangen door nodes die uit de universes zijn gepland.`), okLabel:t('Replace', 'Vervangen') }); if(!ok) return; }
      window.PatchHistory?.label?.(`${d}: nodes auto-assigned`);
      const r = App.net.autoAssignDimCityNodes(d, root.querySelector(`.nnNodeType[data-dc="${d}"]`)?.value || ''); if(r) App.ui.toast(`${d}: ${r.nodes.length} ${t('nodes assigned', 'nodes ingedeeld')}`); rerender();
    });
    root.querySelectorAll('.nnAutoSplit').forEach(b => b.onclick = () => {
      const d = b.dataset.dc; window.PatchHistory?.label?.(`${d}: splitters calculated`);
      const r = App.net.autoAddSplittersForDim(d, root.querySelector(`.nnSplitType[data-dc="${d}"]`)?.value || ''); if(r) App.ui.toast(`${d}: ${r.splitters.length} ${t('splitters calculated', 'splitters berekend')}`); rerender();
    });
    window.NodeLink?.bind(root, rerender);
  }
  window.NetNodes = { ctx, carriers, card, bind };
})();
