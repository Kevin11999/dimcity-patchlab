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

  // advanced network (LumiNode): VLAN groups on the node itself, with the Luminex VLANs, FENT addresses and a choice per RJ45 (see ui/advnet.js).
  // The warnings of the IP plan about the switch port (trunk needed, wrong VLAN) are shown under the editor.
  function advancedHtml(dc, idx, inst, nt){
    const issues = inst.advanced ? (window.IpPlan?.check() || []).filter(i => i.dc === dc && i.label === (inst.id || inst.name) && (i.code === 'TRUNK' || i.code === 'PORTVLAN')) : [];
    return window.AdvNet.html(dc, idx, inst, nt, issues.map(i => `<div class="rp-adv-note warn">${I('alert', 13)} ${esc(t(i.en, i.nl))}</div>`).join(''));
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
      ${ifs.length && !inst.advanced ? `<div class="nn-addr">${ifs.map(x => `${x.vlan != null && window.NetCables ? window.NetCables.vlanChip(x.vlan) : ''}<span class="mono">${esc(x.ip)}</span>${Number(nt.ethernetCount) > 1 ? `<span class="subtle">ETH${x.eth}</span>` : ''}`).join(' ')}</div>` : ''}
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

  // consoles (lighting desks) and other plain network devices: a name, one or two network ports, plugged into a switch like a node
  function consolesHtml(dc, sws, rows, links){
    const list = plan(dc).consoles || [];
    const items = list.map((c, i) => { const mine = rows.filter(r => r.kind === 'console' && r.idx === i), ifs = window.Fent ? window.Fent.ifaces(c, c.ethCount === 2 ? 2 : 1) : [];
      return `<div class="nn-con" data-nncon="${i}"><div class="nn-con-h">${I('console', 15)}<b>${esc(c.id || '')}</b>
          <input class="nn-con-name" data-nnconname="${i}" value="${esc(c.name || '')}" placeholder="${esc(t('Name, e.g. grandMA3 full-size', 'Naam, bv. grandMA3 full-size'))}">
          <label class="nn-con-eth">${t('Network ports', 'Netwerkpoorten')}<select data-nnconeth="${i}"><option value="1" ${c.ethCount === 2 ? '' : 'selected'}>1</option><option value="2" ${c.ethCount === 2 ? 'selected' : ''}>2</option></select></label>
          <button class="sm ghost" data-nnconrm="${i}" title="${esc(t('Remove this device', 'Verwijder dit apparaat'))}">${I('trash', 13)}</button></div>
        <div class="nn-plugs">${mine.map(r => plugRow(dc, r, sws, rows, links)).join('')}</div>
        ${ifs.length ? `<div class="nn-addr">${ifs.map(x => `${x.vlan != null && window.NetCables ? window.NetCables.vlanChip(x.vlan) : ''}<span class="mono">${esc(x.ip)}</span>${c.ethCount === 2 ? `<span class="subtle">ETH${x.eth}</span>` : ''}`).join(' ')}</div>` : `<div class="subtle" style="font-size:12px">${t('No address yet — give it one on the Addresses tab (or create the IP plan).', 'Nog geen adres — geef hem er een op het tabblad Adressen (of maak het IP-plan).')}</div>`}</div>`; }).join('');
    return `<div class="nn-cons"><div class="rb-label" style="margin:12px 0 6px">${t('Consoles and other network devices', 'Lichttafels en andere netwerkapparaten')}</div>${items || `<div class="subtle" style="font-size:12.5px;margin-bottom:6px">${t('A lighting console sends the lighting data: add it here with its name, plug it into a switch, and it gets an address like the nodes.', 'Een lichttafel stuurt de lichtdata: voeg hem hier toe met zijn naam, steek hem in een switch en hij krijgt een adres zoals de nodes.')}</div>`}
      <div class="nn-con-add"><input id="nnConName-${esc(dc)}" placeholder="${esc(t('Name, e.g. grandMA3 full-size', 'Naam, bv. grandMA3 full-size'))}"><select id="nnConEth-${esc(dc)}"><option value="1">${t('1 network port', '1 netwerkpoort')}</option><option value="2">${t('2 network ports', '2 netwerkpoorten')}</option></select><button class="sm primary" data-nnconadd="${esc(dc)}">${I('plus', 13)} ${t('Add console', 'Lichttafel toevoegen')}</button></div></div>`;
  }

  function card(dc){
    const p = plan(dc), sws = window.NetSwitches.list(dc), rows = window.FentUI.portPlan(dc).rows, c = ctx(dc), car = carriers(dc), links = window.NetSwitches.linksOf(dc);
    const nodes = p.nodes.map((n, i) => n.gone ? '' : nodeCard(dc, i, c, car, sws, rows, links)).join('');
    const gone = p.nodes.map((n, i) => n.gone ? goneCard(dc, i, n, c, rows) : '').join('');
    const unplaced = rows.filter(r => r.kind === 'node' && r.unplaced).length;
    return `<div class="nn-db" style="--dim-color:${App.dimColor(dc)}"><div class="nn-db-h"><i class="dot" style="background:${App.dimColor(dc)}"></i><b>${esc(dc)}</b><span class="subtle">${p.nodes.length} ${t('nodes', 'nodes')}</span>${unplaced ? `<span class="tag yellow">${unplaced} ${t('without a switch port', 'zonder switchpoort')}</span>` : ''}</div>
      ${gone}${planCard(dc)}${nodes || `<div class="nn-empty">${t('No nodes in this DimCity yet. Place a rack (or add a loose node) on the Racks card of this DimCity and its nodes appear here by themselves — or let PatchLab plan them from the universes.', 'Nog geen nodes in deze DimCity. Plaats een rek (of voeg een losse node toe) op de racks-kaart van deze DimCity en de nodes verschijnen hier vanzelf — of laat PatchLab ze plannen vanuit de universes.')}</div>`}${splittersHtml(dc)}${consolesHtml(dc, sws, rows, links)}</div>`;
  }

  function bind(root, dc, rerender){
    root.querySelectorAll('[data-nnplug]').forEach(sel => sel.onchange = () => {       // the plug select of a node, a splitter or a console
      window.PatchHistory?.label?.(`${dc}: ${sel.dataset.nnplug} plugged in`);
      if(!sel.value) window.PortPlan.unplace(dc, sel.dataset.nnplug);
      else { const [sw, port] = sel.value.split('|'); window.PortPlan.place(dc, sel.dataset.nnplug, sw, Number(port)); }
      rerender();
    });
    root.querySelectorAll('[data-nnadv]').forEach(c => c.onchange = () => { const n = plan(dc).nodes[Number(c.dataset.nnadv)]; if(!n) return; window.PatchHistory?.label?.(`${dc}: advanced network ${c.checked ? 'on' : 'off'}`); window.AdvNet.toggle(dc, n, c.checked); dirty(); rerender(); });
    window.AdvNet.bind(root, dc, rerender);
    root.querySelectorAll('[data-nnrm]').forEach(b => b.onclick = async () => {
      const idx = Number(b.dataset.nnrm), n = plan(dc).nodes[idx]; if(!n) return;
      const ok = await App.ui.confirmDialog({ title:t('Remove this node?', 'Deze node verwijderen?'), message:`${n.id || ''} ${t('is removed from the network plan of', 'wordt uit het netwerkplan van')} ${dc} ${t(`. Its address and switch port go with it.`, ` gehaald. Zijn adres en switchpoort verdwijnen mee.`)}`, okLabel:t('Remove', 'Verwijderen'), danger:true });
      if(!ok) return; window.RackPlan.removeNode(dc, idx); dirty(); rerender();
    });
    root.querySelectorAll('[data-nnconadd]').forEach(b => b.onclick = () => {
      const d = b.dataset.nnconadd, name = (root.querySelector(`#nnConName-${CSS.escape(d)}`)?.value || '').trim(), eth = Number(root.querySelector(`#nnConEth-${CSS.escape(d)}`)?.value) === 2 ? 2 : 1;
      window.PatchHistory?.label?.(`${d}: console added`);
      const inst = App.net.createConsoleInstance(d, name, eth); plan(d).consoles.push(inst);
      if(M().networkDevices?.prefs?.fent?.on) window.FentUI?.addressNew?.(d, 'console', inst);
      dirty(); rerender();
    });
    root.querySelectorAll('[data-nnconname]').forEach(inp => inp.onchange = () => { const c = (plan(dc).consoles || [])[Number(inp.dataset.nnconname)]; if(!c) return; c.name = inp.value.trim() || c.id; dirty(); rerender(); });
    root.querySelectorAll('[data-nnconeth]').forEach(sel => sel.onchange = () => { const c = (plan(dc).consoles || [])[Number(sel.dataset.nnconeth)]; if(!c) return; c.ethCount = Number(sel.value) === 2 ? 2 : 1; (c.ifaces || []).forEach(x => { if(x && c.ethCount === 1) x.eth = 1; }); dirty(); rerender(); });
    root.querySelectorAll('[data-nnconrm]').forEach(b => b.onclick = async () => {
      const i = Number(b.dataset.nnconrm), c = (plan(dc).consoles || [])[i]; if(!c) return;
      const ok = await App.ui.confirmDialog({ title:t('Remove this device?', 'Dit apparaat verwijderen?'), message:`${c.name || c.id} ${t('is removed from', 'wordt uit')} ${dc} ${t('. Its address and switch port go with it.', ' gehaald. Zijn adres en switchpoort verdwijnen mee.')}`, okLabel:t('Remove', 'Verwijderen'), danger:true });
      if(!ok) return; window.PatchHistory?.label?.(`${dc}: console removed`); window.PortPlan?.forget?.(dc, `n:${c.id}#`); plan(dc).consoles.splice(i, 1); dirty(); rerender();
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
