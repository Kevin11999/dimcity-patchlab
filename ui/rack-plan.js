// ui/rack-plan.js
// Racks per DimCity: place racks from the library, see how LKs and Veams are patched
// (colour per node), follow the recommendations and copy the result into the network plan.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc, safeHex } = App.net;
const M = () => App.getMODEL();
const E = () => window.RackEngine;

function racksOf(dc){
  const plan = App.net.getDimPlan(dc);
  if(!Array.isArray(plan.racks)) plan.racks = [];
  return plan.racks;
}
const typeName = t => [t?.brand, t?.name].filter(Boolean).join(' ') || t?.id || '';

// Rek met de berekende patch erin: nodes met universes, panelen met aangesloten LK/Veam
function rackFace(plan, ri){
  const R = plan.racks[ri];
  const rack = R.rack;
  if(!rack) return `<div class="placeholder-row">${I('alert', 14)} Rack ${esc(R.placement.rackId)} is not in this show any more.</div>`;
  const owners = E().ownerColors(plan);
  const nodeBy = new Map(plan.nodes.filter(n => n.rack === ri).map(n => [n.iid, n]));
  const splitBy = new Map(plan.splitters.filter(s => s.rack === ri).map(s => [s.iid, s]));
  const groupsBy = new Map(); plan.groups.filter(g => g.rack === ri).forEach(g => { if(!groupsBy.has(g.iid)) groupsBy.set(g.iid, []); groupsBy.get(g.iid).push(g); });
  const soloBy = new Map(); plan.soloVims.filter(v => v.rack === ri).forEach(v => { if(!soloBy.has(v.iid)) soloBy.set(v.iid, []); soloBy.get(v.iid).push(v); });
  const find = (key, id) => (M().networkDevices?.[key] || []).find(x => x.id === id);
  const port = (cls, label, title, color, empty) => `<span class="rp ${cls} ${empty ? 'free' : ''}" style="${color ? `--c:${color}` : ''}" title="${esc(title)}"><i>${esc(label)}</i></span>`;
  const H = rack.heightU;
  const rows = (rack.items || []).slice().sort((a, b) => a.u - b.u).map(it => {
    const key = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' }[it.kind];
    const t = find(key, it.typeId); if(!t) return '';
    let ports = '', badge = '';
    if(it.kind === 'node'){
      const n = nodeBy.get(it.iid);
      badge = n ? `<span class="rk-badge" style="--c:${n.color}">${n.label}</span>` : '';
      const eth = Math.min(2, Math.max(1, Number(t.ethernetCount) || 1));
      ports = `<span class="ru-grp">${(n?.ports || []).map((p, i) => port('dmx', p ? `U${p.universe}` : i + 1, p ? `${n.label} port ${i + 1} · U${p.universe} → ${p.to}` : `${n.label} port ${i + 1} · free`, n.color, !p)).join('')}</span>`
        + `<span class="ru-grp">${Array.from({ length:eth }, (_, i) => port('rj', eth > 1 ? i + 1 : '', eth > 1 ? `Network ${i + 1}` : 'Network')).join('')}</span>`;
    } else if(it.kind === 'splitter'){
      const s = splitBy.get(it.iid);
      badge = s ? `<span class="rk-badge">${s.label}</span>` : '';
      ports = `<span class="ru-grp">${s?.inputs.length ? s.inputs.map(u => port('dmx in', `U${u}`, `${s.label} input · U${u}`, s.feedColor)).join('') : port('dmx in', 'A', 'Input — not used', null, true)}</span>
        <span class="ru-grp">${(s?.outputs || []).map((o, i) => port('dmx', o ? o.port : i + 1, o ? `${s.label} out ${i + 1} → ${o.label}` : `${s.label} out ${i + 1} · free`, o?.feed?.color, !o)).join('')}</span>`;
    } else if(it.kind === 'panel'){
      const gs = groupsBy.get(it.iid) || [], vs = soloBy.get(it.iid) || [];
      ports = gs.map(g => `<span class="ru-grp">${port('lk', g.lk ? g.lk.id.replace(/^LK/, '') : '', g.lk ? `${g.label}: ${g.lk.id}` : `${g.label}: free`, g.lk ? owners.get(g.lk.id) : null, !g.lk)}${g.vims.map(v => port('vim', v.used ? v.used.id.replace(/^V/, '') : '', v.used ? `${v.label}: ${v.used.id}` : `${v.label}: free`, v.used ? owners.get(v.used.id) : null, !v.used)).join('')}</span>`).join('')
        + (vs.length ? `<span class="ru-grp">${vs.map(v => port('vim', v.used ? v.used.id.replace(/^V/, '') : '', v.used ? `${v.label}: ${v.used.id}` : `${v.label}: free`, v.used ? owners.get(v.used.id) : null, !v.used)).join('')}</span>` : '');
    } else {
      ports = `<span class="ru-grp">${Array.from({ length:Number(t.portCount) || 0 }, (_, i) => port('rj', i + 1, `Port ${i + 1}`)).join('')}</span>`;
    }
    const hu = Math.max(1, Number(t.heightU) || 1);
    return `<div class="rk-item static" style="grid-row:${it.u} / span ${hu}"><div class="ru ru-rack" style="--c:${safeHex(t.color, '#4c9dff')};--hu:${hu}"><span class="ru-ear"></span><div class="ru-body"><div class="ru-label"><b>${badge}${esc(typeName(t))}</b><span>${esc(it.kind)}</span></div><div class="ru-ports">${ports}</div></div><span class="ru-ear"></span></div></div>`;
  }).join('');
  const rail = `<div class="rack-rail">${Array.from({ length:H }, (_, i) => `<span>${H - i}</span>`).join('')}</div>`;
  return `<div class="rack" style="--h:${H}">${rail}<div class="rack-bay" style="grid-template-rows:repeat(${H}, var(--uh))">${Array.from({ length:H }, (_, i) => `<div class="rk-slot" style="grid-row:${i + 1}"></div>`).join('')}${rows}</div>${rail}</div>`;
}

function cardHtml(dc){
  if(!E()) return '';
  const placed = racksOf(dc);
  const rackTypes = M().networkDevices?.rackTypes || [];
  const plan = E().computeRackPlan(M(), dc);
  const s = plan.stats;
  const owners = E().ownerColors(plan);
  const opts = rackTypes.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)} · ${r.heightU}U</option>`).join('');
  const controls = `<div class="planner-controls">
      <label>Rack<select id="rpRackType" ${rackTypes.length ? '' : 'disabled'}>${opts || '<option>No racks yet</option>'}</select></label>
      <button id="rpPlace" ${rackTypes.length ? '' : 'disabled'}>${I('plus', 14)}Place rack</button>
      <button data-cmd="deviceBuilder" data-arg="rack">${I('rack', 14)}Rack Builder</button>
      ${placed.length ? `<button class="primary" id="rpApply" title="Create the network nodes and splitters of this DimCity from the rack patch">${I('check', 14)}Use as network plan</button>` : ''}
    </div>`;
  if(!placed.length){
    return App.ui.card({ key:`${dc}:racks`, title:'Racks', icon:'rack', meta:'none placed', collapsed:false,
      body:`${controls}<div class="hint" style="margin-top:10px">${I('info', 13)} Place a rack and PatchLab patches the LKs and Veams of ${esc(dc)} onto its sockets and node ports automatically.${rackTypes.length ? '' : ' Build a rack in the Rack Builder first.'}</div>` });
  }
  const chip = (label, used, total, warn) => `<div class="rp-stat ${warn ? 'warn' : ''}"><span>${label}</span><b>${used}<em>/${total}</em></b></div>`;
  const stats = `<div class="rp-stats">
      ${chip('LK7-1 sockets', s.lkUsed, s.lkSockets, s.spiders.lk)}
      ${chip('VIM4 sockets', s.vimUsed, s.vimSockets, s.spiders.vim)}
      ${chip('Node ports', s.nodePortsUsed, s.nodePorts, s.unfed)}
      ${chip('Lines', s.lines - s.unfed, s.lines, s.unfed)}
    </div>`;
  const recs = `<ul class="rp-recs">${plan.recs.map(r => `<li class="${r.level}">${I(r.level === 'warn' ? 'alert' : r.level === 'ok' ? 'checkCircle' : 'info', 14)}<span>${esc(r.text)}</span></li>`).join('')}</ul>`;
  const legend = [...owners.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric:true }))
    .map(([id, c]) => { const nodes = [...new Set(plan.lines.filter(l => l.owner === id && l.feed?.node).map(l => l.feed.node))]; return `<span class="rp-owner" style="--c:${c}"><i></i>${esc(id)}<em>${nodes.join(' + ')}</em></span>`; }).join('');
  const racks = plan.racks.map((R, ri) => `<div class="rp-rack">
      <div class="rp-rack-head"><b>${esc(R.placement.name || R.rack?.name || R.placement.rackId)}</b><span class="subtle">${R.rack ? `${R.rack.heightU}U${R.rack.articleKey ? ` · ${esc(R.rack.articleKey)}` : ''}` : ''}</span>
        <input type="text" class="rp-name" data-rp="${esc(R.placement.iid)}" value="${esc(R.placement.name || '')}" placeholder="Name in this DimCity">
        <button class="sm ghost" data-rp-remove="${esc(R.placement.iid)}" title="Remove from ${esc(dc)}">${I('trash', 13)}</button></div>
      <div class="rk-canvas compact">${rackFace(plan, ri)}</div></div>`).join('');
  const rowsSorted = plan.lines.slice().sort((a, b) => (a.feed ? 0 : 1) - (b.feed ? 0 : 1) || String(a.feed?.node || '').localeCompare(String(b.feed?.node || ''), undefined, { numeric:true }) || (a.feed?.port || 0) - (b.feed?.port || 0));
  const table = `<details class="rp-table"><summary>${I('table', 14)} Patch table <span class="subtle">${plan.lines.length} lines</span></summary>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Node port</th><th class="num">Universe</th><th>Via</th><th>Socket</th><th>LK / Veam port</th><th>Location</th></tr></thead><tbody>
    ${rowsSorted.map(l => `<tr><td>${l.feed ? `<span class="rp-dot" style="--c:${l.feed.color}"></span><b>${esc(l.feed.node)}</b> · ${l.feed.port}` : '<span class="tag red">no port</span>'}</td><td class="num">U${l.universe}</td><td>${l.feed?.splitter ? `${esc(l.feed.splitter)} · out ${l.feed.out}` : '<span class="subtle">direct</span>'}</td><td>${esc(l.socket)}</td><td>${esc(l.label)}${l.via ? ` <span class="subtle">(${esc(l.via)})</span>` : ''}</td><td>${esc(l.dest)}</td></tr>`).join('')}
    </tbody></table></div></details>`;
  const warn = plan.recs.some(r => r.level === 'warn');
  return App.ui.card({ key:`${dc}:racks`, title:'Racks', icon:'rack', meta:`${App.ui.plural(placed.length, 'rack')} · ${warn ? 'needs attention' : 'all patched'}`,
    body:`${controls}${stats}${recs}${legend ? `<div class="rp-legend"><span class="subtle">Node per LK / Veam:</span>${legend}</div>` : ''}<div class="rp-racks">${racks}</div>${table}` });
}

function bind(root, dc, rerender){
  const place = root.querySelector('#rpPlace');
  if(place) place.onclick = () => {
    const id = root.querySelector('#rpRackType').value;
    const rack = (M().networkDevices?.rackTypes || []).find(r => r.id === id); if(!rack) return;
    window.PatchHistory?.label?.(`Placed ${rack.name || rack.id} in ${dc}`);
    racksOf(dc).push({ iid:`rk_${Date.now().toString(36)}`, rackId:id, name:'' });
    if(!M().ui.cardCollapsed) M().ui.cardCollapsed = {};
    M().ui.cardCollapsed[`${dc}:racks`] = false;
    M().ui.dirty = true; rerender();
  };
  root.querySelectorAll('[data-rp-remove]').forEach(b => b.onclick = () => {
    const plan = App.net.getDimPlan(dc);
    window.PatchHistory?.label?.(`Removed rack from ${dc}`);
    plan.racks = racksOf(dc).filter(r => r.iid !== b.dataset.rpRemove);
    M().ui.dirty = true; rerender();
  });
  root.querySelectorAll('.rp-name').forEach(inp => inp.onchange = () => {
    const r = racksOf(dc).find(x => x.iid === inp.dataset.rp); if(!r) return;
    r.name = inp.value.trim(); M().ui.dirty = true; rerender();
  });
  const apply = root.querySelector('#rpApply');
  if(apply) apply.onclick = async () => {
    const plan = App.net.getDimPlan(dc);
    if(plan.nodes.length || plan.splitters.length){
      const ok = await App.ui.confirmDialog({ title:'Replace the network plan?', message:`The nodes and splitters of ${dc} are replaced by the ones from the rack, with the universes from the rack patch. IP addresses are generated again.`, okLabel:'Replace' });
      if(!ok) return;
    }
    applyToNetworkPlan(dc);
    rerender();
  };
}

// Rack-patch omzetten naar de node- en splitter-instanties van de DimCity (voor PDF en netwerkplan)
function applyToNetworkPlan(dc){
  const r = E().computeRackPlan(M(), dc);
  const plan = App.net.getDimPlan(dc);
  window.PatchHistory?.label?.(`${dc}: network plan from rack patch`);
  plan.nodes = r.nodes.map((n, i) => App.net.createNodeInstance(dc, n.type, i, n.ports.map(p => p ? p.universe : null)));
  plan.nodeTypeId = r.nodes[0]?.type.id || plan.nodeTypeId;
  const used = r.splitters.filter(s => s.inputs.length);
  plan.splitters = used.map((s, i) => {
    const inst = App.net.createSplitterInstance(dc, s.type, i, s.inputs);
    inst.inputUniverses = s.inputs.slice();
    inst.portAssignments = s.outputs.map(l => l ? { kind:l.ownerKind === 'VEAM' ? 'Veam' : l.ownerKind, id:l.owner, port:l.port, universe:l.universe, dest:l.dest } : null);
    return inst;
  });
  if(used[0]) plan.lastSplitterTypeId = used[0].type.id;
  App.net.refreshDimDeviceIdentity(dc);
  M().ui.dirty = true;
  App.ui.toast(`${dc}: ${App.ui.plural(plan.nodes.length, 'node')}${plan.splitters.length ? ` and ${App.ui.plural(plan.splitters.length, 'splitter')}` : ''} taken from the rack`);
}

window.RackPlan = { cardHtml, bind, rackFace, applyToNetworkPlan };
