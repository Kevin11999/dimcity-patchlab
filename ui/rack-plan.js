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
function looseOf(dc){
  const plan = App.net.getDimPlan(dc);
  if(!Array.isArray(plan.loose)) plan.loose = [];
  return plan.loose;
}
const typeName = t => [t?.brand, t?.name].filter(Boolean).join(' ') || t?.id || '';
const newIid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Poortstrook van een node: per poort universe + de LK-/Veam-poort die erop zit
function nodePortsStrip(n, size=''){
  const cells = n.ports.map((p, i) => {
    if(!p) return `<span class="np ${size} free" title="${esc(n.label)} port ${i + 1} · free"><b>${i + 1}</b><span>—</span></span>`;
    const to = p.ownerPort === 'in' ? `${esc(p.owner)} in` : `${esc(p.owner)} · ${esc(p.ownerPort)}`;
    return `<span class="np ${size}" style="--c:${n.color}" title="${esc(n.label)} port ${i + 1} · U${p.universe} → ${esc(p.to)}${p.dest ? ` (${esc(p.dest)})` : ''}"><b>${i + 1}</b><em>U${p.universe}</em><span>${to}</span></span>`;
  }).join('');
  return `<div class="np-strip">${cells}</div>`;
}


// ---- Advice: the best setup for this DimCity from its LKs, Veams and universes ----
function adviceHtml(dc, { compact = false } = {}){
  const A = window.RackAdvisor?.advise(dc); if(!A) return '';
  if(!A.lines && !A.lk && !A.veams) return '';
  const ico = l => l === 'warn' ? 'alert' : l === 'ok' ? 'checkCircle' : 'info';
  const items = A.items.map(i => `<tr><td><b>${i.count}×</b></td><td>${esc(typeName(i.type))}</td><td class="num">${i.u}U</td><td class="subtle">${esc(i.why)}</td></tr>`).join('');
  const blocks = A.blocks.map(b => `<tr><td><b>${esc(b.id)}</b></td><td>${esc(b.label)}</td><td class="subtle">${esc(b.why)}</td><td>${b.differs ? `<span class="tag yellow" title="${esc(b.manual ? 'You set this mode yourself' : 'Auto-detect shows')}">now ${esc(b.currentLabel)}</span> <button class="sm" data-adv-mode="${esc(b.id)}" data-mode="${esc(b.mode)}">Use ${esc(b.label)}</button>` : '<span class="tag green">matches</span>'}</td></tr>`).join('');
  const rackLine = A.rack.existing ? `fits in <b>${esc(A.rack.type.name || A.rack.type.id)}</b> (${A.rack.type.heightU}U) — or a rack made for it` : `needs a rack of <b>${A.rack.height}U</b> (you have no rack type that big)`;
  const body = `<div class="adv-sum"><b>${A.lk}</b> LK · <b>${A.veams}</b> Veam · <b>${A.lines}</b> lines · <b>${A.universes}</b> universes → <b>${A.totalU}U</b> of devices, ${rackLine}.</div>
    ${A.items.length ? `<table class="data-table adv-items"><thead><tr><th></th><th>Device</th><th class="num">Space</th><th>Why</th></tr></thead><tbody>${items}</tbody></table>` : ''}
    ${A.notes.map(n => `<div class="rp-adv-note ${n.level}">${I(ico(n.level), 13)} ${esc(n.text)}</div>`).join('')}
    ${!compact && blocks ? `<details class="adv-blocks" ${A.blocks.some(b => b.differs) ? 'open' : ''}><summary>Block mode per LK</summary><table class="data-table"><thead><tr><th>LK</th><th>Advice</th><th>Because</th><th></th></tr></thead><tbody>${blocks}</tbody></table></details>` : ''}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="primary" data-adv-apply ${A.ok ? '' : 'disabled'}>${I('check', 14)} Apply this advice to ${esc(dc)}</button><span class="subtle" style="align-self:center;font-size:12px">It adds a rack made for this DimCity${(A.spiders.lk || A.spiders.vim) ? ' and loose spiders' : ''}. Your own racks stay.</span></div>`;
  return App.ui.card({ key:`${dc}:advice`, title:'Advice: best setup', icon:'star', meta:A.ok ? `${A.totalU}U · ${A.items.reduce((n, i) => n + i.count, 0)} devices` : '', collapsible:true, collapsed:compact, body:`<div class="rp-advice">${body}</div>` });
}
function bindAdvice(root, dc, rerender){
  const ap = root.querySelector('[data-adv-apply]');
  if(ap) ap.onclick = async () => {
    const plan = App.net.getDimPlan(dc);
    if((plan.racks || []).some(r => r.iid !== plan.adviceRack?.iid)){
      const ok = await App.ui.confirmDialog({ title:`Add the advice to ${dc}?`, message:`${dc} already has racks. The advice adds a rack made for it next to them (a rack from an earlier advice is replaced).`, okLabel:'Add rack' });
      if(!ok) return;
    }
    const a = window.RackAdvisor.apply(dc);
    if(a) App.ui.toast(`${dc}: advice applied — ${a.totalU}U in a new rack${(a.spiders.lk || a.spiders.vim) ? ' plus loose spiders' : ''}`);
    rerender();
  };
  root.querySelectorAll('[data-adv-mode]').forEach(b => b.onclick = () => {
    const lk = M().byLK.get(b.dataset.advMode); if(!lk) return;
    App.applyBlockType(lk, b.dataset.mode); M().ui.dirty = true; rerender();
  });
}

// ---- Couple every LK / Veam to a socket: automatic by default, every line can be overruled ----
const isLkId = id => /^LK\d+$/i.test(id);
function assignRows(dc, plan){
  const m = M(), assign = App.net.getDimPlan(dc).assign || {};
  const rows = new Map();
  for(const l of plan.lines){
    if(l.ownerKind !== 'LK' && l.ownerKind !== 'VEAM') continue;
    const r = rows.get(l.owner) || { id:l.owner, kind:l.ownerKind, lines:0, unis:new Set(), socket:l.socket };
    r.lines++; if(l.universe != null) r.unis.add(l.universe); rows.set(l.owner, r);
  }
  for(const id of (plan.skipped || [])){
    const src = isLkId(id) ? m.byLK.get(id) : m.byVeam.get(id);
    const ls = (src?.lines || []).filter(L => L.universe != null && L.universe !== '');
    rows.set(id, { id, kind:isLkId(id) ? 'LK' : 'VEAM', lines:ls.length, unis:new Set(ls.map(L => L.universe)), socket:null, skipped:true });
  }
  const sockets = {
    LK: plan.groups.map(g => ({ value:g.label, text:`${g.label} · ${g.panel}${g.lk ? ` — ${g.lk.id}` : ''}`, by:g.lk?.id })),
    VEAM: [...plan.groups.flatMap(g => g.vims.map(v => ({ ...v, panel:g.panel }))), ...plan.soloVims].map(v => ({ value:v.label, text:`${v.label} · ${v.panel}${v.used ? ` — ${v.used.id}` : ''}`, by:v.used?.id }))
  };
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true })).map(r => ({ ...r, mode:assign[r.id] || 'auto', options:sockets[r.kind] }));
}
function assignHtml(plan, dc){
  const rows = assignRows(dc, plan);
  if(!rows.length) return '';
  const own = rows.filter(r => r.mode !== 'auto').length;
  const opt = (r) => `<option value="auto" ${r.mode === 'auto' ? 'selected' : ''}>Automatic</option>${r.options.map(o => `<option value="${esc(o.value)}" ${r.mode === o.value ? 'selected' : ''}>${esc(o.text)}</option>`).join('')}<option value="spider" ${r.mode === 'spider' ? 'selected' : ''}>Loose ${r.kind === 'LK' ? 'LK' : 'Veam4'} spider</option><option value="none" ${r.mode === 'none' ? 'selected' : ''}>Do not patch</option>`;
  const now = r => r.skipped ? '<span class="tag">not patched</span>' : /spider/i.test(r.socket || '') ? `<span class="tag yellow">${esc(r.socket)}</span>` : `<span class="tag green">${esc(r.socket || '—')}</span>`;
  return `<details class="rp-table rp-assign" open><summary>${I('plug', 14)} Couple LKs &amp; Veams to sockets <span class="subtle">${own ? `${own} of your own choice${own > 1 ? 's' : ''}` : 'all automatic'}</span></summary>
    <div class="rp-assign-body"><div class="subtle" style="font-size:12.5px;margin:0 0 8px">Automatic fills the sockets in order. Choose a socket to decide yourself, <b>Loose spider</b> when it should not sit in the rack, or <b>Do not patch</b> to leave it out. A socket you choose is kept first; the rest stays automatic.</div>
    <table class="data-table"><thead><tr><th>LK / Veam</th><th class="num">Lines</th><th>Universes</th><th>Now on</th><th>Choose</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.id)}</b></td><td class="num">${r.lines}</td><td class="subtle">${[...r.unis].sort((a, b) => a - b).slice(0, 6).map(u => 'U' + u).join(' ')}${r.unis.size > 6 ? ' …' : ''}</td><td>${now(r)}</td><td><select class="rp-assign-sel ${r.mode !== 'auto' ? 'own' : ''}" data-owner="${esc(r.id)}">${opt(r)}</select></td></tr>`).join('')}</tbody></table>
    ${own ? `<div style="margin-top:8px"><button class="sm" data-assign-reset>${I('refresh', 13)} Everything automatic again</button></div>` : ''}</div></details>`;
}
function bindAssign(root, dc, rerender){
  root.querySelectorAll('.rp-assign-sel').forEach(sel => sel.onchange = () => {
    const plan = App.net.getDimPlan(dc); plan.assign ||= {};
    window.PatchHistory?.label?.(`${dc}: socket choice for ${sel.dataset.owner}`);
    if(sel.value === 'auto') delete plan.assign[sel.dataset.owner]; else plan.assign[sel.dataset.owner] = sel.value;
    M().ui.dirty = true; rerender();
  });
  const rs = root.querySelector('[data-assign-reset]');
  if(rs) rs.onclick = () => { App.net.getDimPlan(dc).assign = {}; M().ui.dirty = true; rerender(); };
}

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
  const rows = (rack.items || []).slice().sort((a, b) => (a.u - b.u) || ((a.side === 'R') - (b.side === 'R'))).map(it => {
    if(it.kind === 'blind') return `<div class="rk-item static half half-${it.side || 'L'}" style="grid-row:${it.u} / span 1"><div class="ru ru-rack ru-blind" style="--hu:1"><span class="ru-ear"></span><div class="ru-body"></div><span class="ru-ear"></span></div></div>`;
    const key = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' }[it.kind];
    const t = find(key, it.typeId); if(!t) return '';
    if(t.special) return `<div class="rk-item static" style="grid-row:${it.u} / span ${Math.max(1, Number(t.heightU) || 3)}"><div class="ru ru-rack ru-special" style="--hu:${Math.max(1, Number(t.heightU) || 3)}">${window.SwPorts.gc20tSvg({ title:'GigaCore 20t' })}</div></div>`;
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
      const statics = window.SwPorts.panelGroups(t).map(g => `<span class="ru-grp">${g.items.map(x => port(`${g.cls} ${g.sub}`, x.no, x.title)).join('')}</span>`).join('');
      ports = statics + gs.map(g => `<span class="ru-grp">${port('lk', g.lk ? g.lk.id.replace(/^LK/, '') : '', g.lk ? `${g.label}: ${g.lk.id}` : `${g.label}: free`, g.lk ? owners.get(g.lk.id) : null, !g.lk)}${g.vims.map(v => port('vim', v.used ? v.used.id.replace(/^V/, '') : '', v.used ? `${v.label}: ${v.used.id}` : `${v.label}: free`, v.used ? owners.get(v.used.id) : null, !v.used)).join('')}</span>`).join('')
        + (vs.length ? `<span class="ru-grp">${vs.map(v => port('vim', v.used ? v.used.id.replace(/^V/, '') : '', v.used ? `${v.label}: ${v.used.id}` : `${v.label}: free`, v.used ? owners.get(v.used.id) : null, !v.used)).join('')}</span>` : '');
    } else {
      const SP = window.SwPorts, panels = (rack.items || []).filter(x => x.kind === 'panel').map(x => find('panelTypes', x.typeId));
      ports = `<span class="ru-grp">${Array.from({ length:SP.front(t) }, (_, i) => port(t.jack === 'etherCON' ? 'rj ec' : 'rj', i + 1, `Port ${i + 1}`)).join('')}</span>`
        + (SP.fibreOnPanel(t, panels) ? '' : (Number(t.sfpCount) ? `<span class="ru-grp">${Array.from({ length:Number(t.sfpCount) }, (_, i) => port(`sfp ${SP.kindOf(SP.conn(t, i + 1))}`, SP.short(t, i + 1), SP.label(t, i + 1))).join('')}</span>` : ''));
    }
    const hu = Math.max(1, Number(t.heightU) || 1);
    return `<div class="rk-item static ${t.width === 'half' ? `half half-${it.side || 'L'}` : ''}" style="grid-row:${it.u} / span ${hu}"><div class="ru ru-rack" style="--c:${safeHex(t.color, '#4c9dff')};--hu:${hu}"><span class="ru-ear"></span><div class="ru-body"><div class="ru-label"><b>${badge}${esc(typeName(t))}</b><span>${esc(it.kind)}</span></div><div class="ru-ports">${ports}</div></div><span class="ru-ear"></span></div></div>`;
  }).join('');
  const rail = `<div class="rack-rail">${Array.from({ length:H }, (_, i) => `<span>${H - i}</span>`).join('')}</div>`;
  return `<div class="rack" style="--h:${H}">${rail}<div class="rack-bay" style="grid-template-rows:repeat(${H}, var(--uh))">${Array.from({ length:H }, (_, i) => `<div class="rk-slot" style="grid-row:${i + 1}"></div>`).join('')}${rows}</div>${rail}</div>`;
}

// Losse apparaten (zonder rek): node, LK-spin, Veam4-spin
function looseHtml(plan, dc){
  const loose = looseOf(dc);
  const nodeTypes = M().networkDevices?.nodeTypes || [];
  const owners = E().ownerColors(plan);
  const looseNodes = plan.nodes.filter(n => n.loose);
  const nodeOpts = nodeTypes.map(t => `<option value="${esc(t.id)}">${esc(typeName(t))} · ${Number(t.portCount) || 8} ports</option>`).join('');
  const controls = `<div class="planner-controls">
      <label>Node<select id="rpLooseType" ${nodeTypes.length ? '' : 'disabled'}>${nodeOpts || '<option>No node types yet</option>'}</select></label>
      <button data-loose-add="node" ${nodeTypes.length ? '' : 'disabled'}>${I('plus', 14)}Add loose node</button>
      <button data-loose-add="lkSpider">${I('plus', 14)}Add LK spider</button>
      <button data-loose-add="vimSpider">${I('plus', 14)}Add Veam4 spider</button>
    </div>`;
  const onNode = d => `<select class="rp-onnode" data-loose="${esc(d.iid)}" title="Patch this spider on a loose node first"><option value="">Any node</option>${looseNodes.map(n => `<option value="${esc(n.iid)}" ${d.nodeIid === n.iid ? 'selected' : ''}>${n.label} · ${esc(n.name || typeName(n.type))}</option>`).join('')}</select>`;
  const rows = loose.map(d => {
    const rm = `<button class="sm ghost" data-loose-remove="${esc(d.iid)}" title="Remove">${I('trash', 13)}</button>`;
    if(d.kind === 'node'){
      const n = plan.nodes.find(x => x.iid === d.iid);
      if(!n) return `<div class="rp-loose missing"><div class="rp-loose-head">${I('alert', 14)}<b>Loose node</b><span class="subtle">${esc(d.typeId)} is not in this show any more</span>${rm}</div></div>`;
      return `<div class="rp-loose" style="--c:${n.color}"><div class="rp-loose-head"><span class="rk-badge" style="--c:${n.color}">${n.label}</span><b>${esc(typeName(n.type))}</b>
          <input type="text" class="rp-name" data-loose-name="${esc(d.iid)}" value="${esc(d.name || '')}" placeholder="Name / location">${rm}</div>${nodePortsStrip(n)}</div>`;
    }
    const isLk = d.kind === 'lkSpider';
    const sock = isLk ? plan.groups.find(g => g.iid === d.iid) : plan.soloVims.find(v => v.iid === d.iid);
    const used = isLk ? sock?.lk : sock?.used;
    const chip = used ? `<span class="rp-owner" style="--c:${owners.get(used.id) || '#7d8594'}"><i></i>${esc(used.id)}<em>${[...new Set(plan.lines.filter(l => l.owner === used.id && l.feed?.node).map(l => l.feed.node))].join(' + ') || 'no port'}</em></span>` : '<span class="tag">free</span>';
    return `<div class="rp-loose spider"><div class="rp-loose-head">${I(isLk ? 'box' : 'plug', 14)}<b>${sock?.label || ''} · ${isLk ? 'LK spider' : 'Veam4 spider'}</b>${chip}<label class="rp-inline">On node${onNode(d)}</label>${rm}</div></div>`;
  }).join('');
  return `<div class="rp-section-title">${I('cable', 14)} Loose devices <span class="subtle">${loose.length ? App.ui.plural(loose.length, 'device') : 'none'}</span></div>${controls}${rows ? `<div class="rp-loose-list">${rows}</div>` : ''}`;
}

function cardHtml(dc){
  if(!E()) return '';
  const placed = racksOf(dc);
  const loose = looseOf(dc);
  const rackTypes = M().networkDevices?.rackTypes || [];
  const plan = E().computeRackPlan(M(), dc);
  const s = plan.stats;
  const owners = E().ownerColors(plan);
  const opts = rackTypes.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)} · ${r.heightU}U</option>`).join('');
  const any = placed.length || loose.length;
  const controls = `<div class="planner-controls">
      <label>Rack<select id="rpRackType" ${rackTypes.length ? '' : 'disabled'}>${opts || '<option>No racks yet</option>'}</select></label>
      <button id="rpPlace" ${rackTypes.length ? '' : 'disabled'}>${I('plus', 14)}Place rack</button>
      <button data-cmd="deviceBuilder" data-arg="rack">${I('rack', 14)}Rack Builder</button>
      ${any ? `<button class="primary" id="rpApply" title="Create the network nodes and splitters of this DimCity from the rack patch">${I('check', 14)}Use as network plan</button>` : ''}
      ${any ? `<button id="rpPrint" title="Export a PDF with only the racks of this DimCity">${I('file', 14)}Print racks</button>` : ''}
    </div>`;
  if(!any){
    return App.ui.card({ key:`${dc}:racks`, title:'Racks', icon:'rack', meta:'none placed', collapsed:false,
      body:`${adviceHtml(dc)}${controls}<div class="hint" style="margin-top:10px">${I('info', 13)} Place a rack and PatchLab patches the LKs and Veams of ${esc(dc)} onto its sockets and node ports automatically.${rackTypes.length ? '' : ' Build a rack in the Rack Builder first.'}</div>${looseHtml(plan, dc)}` });
  }
  const chip = (label, used, total, warn) => `<div class="rp-stat ${warn ? 'warn' : ''}"><span>${label}</span><b>${used}<em>/${total}</em></b></div>`;
  const stats = `<div class="rp-stats">
      ${chip('LK7-1 sockets', s.lkUsed, s.lkSockets, s.spiders.lk)}
      ${chip('Veam4 sockets', s.vimUsed, s.vimSockets, s.spiders.vim)}
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
  // Per node in een rek: welke LK-/Veam-poort op welke nodepoort zit (de rekweergave is daar te klein voor)
  const rackNodes = plan.nodes.filter(n => !n.loose);
  const nodeStrips = rackNodes.length ? `<details class="rp-table" open><summary>${I('network', 14)} Node ports <span class="subtle">${App.ui.plural(rackNodes.length, 'node')}</span></summary><div class="rp-nodes">${rackNodes.map(n => `<div class="rp-loose" style="--c:${n.color}"><div class="rp-loose-head"><span class="rk-badge" style="--c:${n.color}">${n.label}</span><b>${esc(typeName(n.type))}</b><span class="subtle">${esc(plan.racks[n.rack]?.placement.name || plan.racks[n.rack]?.rack?.name || '')}</span></div>${nodePortsStrip(n)}</div>`).join('')}</div></details>` : '';
  const warn = plan.recs.some(r => r.level === 'warn');
  const meta = [placed.length ? App.ui.plural(placed.length, 'rack') : '', loose.length ? App.ui.plural(loose.length, 'loose device') : ''].filter(Boolean).join(' + ');
  return App.ui.card({ key:`${dc}:racks`, title:'Racks', icon:'rack', meta:`${meta} · ${warn ? 'needs attention' : 'all patched'}`,
    body:`${adviceHtml(dc)}${controls}${stats}${recs}${legend ? `<div class="rp-legend"><span class="subtle">Node per LK / Veam:</span>${legend}</div>` : ''}<div class="rp-racks">${racks}</div>${assignHtml(plan, dc)}${nodeStrips}${looseHtml(plan, dc)}${table}` });
}

function bind(root, dc, rerender){
  bindAssign(root, dc, rerender);
  bindAdvice(root, dc, rerender);
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
  root.querySelectorAll('.rp-name[data-rp]').forEach(inp => inp.onchange = () => {
    const r = racksOf(dc).find(x => x.iid === inp.dataset.rp); if(!r) return;
    r.name = inp.value.trim(); M().ui.dirty = true; rerender();
  });
  // losse apparaten
  root.querySelectorAll('[data-loose-add]').forEach(b => b.onclick = () => {
    const kind = b.dataset.looseAdd;
    const item = { iid:newIid('ls'), kind };
    if(kind === 'node'){
      const id = root.querySelector('#rpLooseType')?.value;
      const t = (M().networkDevices?.nodeTypes || []).find(x => x.id === id); if(!t) return;
      item.typeId = t.id; item.name = '';
      window.PatchHistory?.label?.(`Added loose ${typeName(t)} in ${dc}`);
    } else {
      // een nieuwe spin hangt standaard aan de laatst toegevoegde losse node
      const lastNode = looseOf(dc).filter(d => d.kind === 'node').pop();
      if(lastNode) item.nodeIid = lastNode.iid;
      window.PatchHistory?.label?.(`Added loose ${kind === 'lkSpider' ? 'LK' : 'Veam4'} spider in ${dc}`);
    }
    looseOf(dc).push(item);
    if(!M().ui.cardCollapsed) M().ui.cardCollapsed = {};
    M().ui.cardCollapsed[`${dc}:racks`] = false;
    M().ui.dirty = true; rerender();
  });
  root.querySelectorAll('[data-loose-remove]').forEach(b => b.onclick = () => {
    const plan = App.net.getDimPlan(dc);
    const iid = b.dataset.looseRemove;
    window.PatchHistory?.label?.(`Removed loose device from ${dc}`);
    plan.loose = looseOf(dc).filter(d => d.iid !== iid);
    for(const d of plan.loose) if(d.nodeIid === iid) d.nodeIid = null;
    M().ui.dirty = true; rerender();
  });
  root.querySelectorAll('[data-loose-name]').forEach(inp => inp.onchange = () => {
    const d = looseOf(dc).find(x => x.iid === inp.dataset.looseName); if(!d) return;
    d.name = inp.value.trim(); M().ui.dirty = true; rerender();
  });
  root.querySelectorAll('.rp-onnode').forEach(sel => sel.onchange = () => {
    const d = looseOf(dc).find(x => x.iid === sel.dataset.loose); if(!d) return;
    d.nodeIid = sel.value || null; M().ui.dirty = true; rerender();
  });
  const print = root.querySelector('#rpPrint');
  if(print) print.onclick = () => window.PdfExport?.open?.({ dcs:[dc], preset:'RACKS_ONLY' });
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
function applyToNetworkPlan(dc, { quiet=false } = {}){
  const r = E().computeRackPlan(M(), dc);
  const plan = App.net.getDimPlan(dc);
  window.PatchHistory?.label?.(`${dc}: network plan from rack patch`);
  const before = (plan.nodes || []).slice();
  plan.nodes = r.nodes.map((n, i) => {
    const inst = App.net.createNodeInstance(dc, n.type, i, n.ports.map(p => p ? p.universe : null));
    if(n.loose && n.name) inst.name = `${dc} ${n.name}`;
    const o = before[i];   // addresses set before stay (also the extra ones)
    if(o && o.typeId === inst.typeId) for(const k of ['ip', 'subnet', 'ifaces', 'ipRole', 'ipVlan']) if(o[k] !== undefined && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)) inst[k] = o[k];
    return inst;
  });
  plan.nodeTypeId = r.nodes[0]?.type.id || plan.nodeTypeId;
  const used = r.splitters.filter(s => s.inputs.length);
  plan.splitters = used.map((s, i) => {
    const inst = App.net.createSplitterInstance(dc, s.type, i, s.inputs);
    inst.inputUniverses = s.inputs.slice();
    inst.portAssignments = s.outputs.map(l => l ? { kind:l.ownerKind === 'VEAM' ? 'Veam' : l.ownerKind, id:l.owner, port:l.port, universe:l.universe, dest:l.dest } : null);
    return inst;
  });
  if(used[0]) plan.lastSplitterTypeId = used[0].type.id;
  window.NodeLink?.reapply(dc, before);
  App.net.refreshDimDeviceIdentity(dc);
  if(M().networkDevices?.prefs?.fent?.on && plan.nodes.some(n => !(n.ifaces && n.ifaces.length))) window.FentUI?.applyDim?.(dc);
  M().ui.dirty = true;
  if(!quiet) App.ui.toast(`${dc}: ${App.ui.plural(plan.nodes.length, 'node')}${plan.splitters.length ? ` and ${App.ui.plural(plan.splitters.length, 'splitter')}` : ''} taken from the rack`);
}

window.RackPlan = { cardHtml, bind, rackFace, nodePortsStrip, applyToNetworkPlan, assignHtml, bindAssign, adviceHtml, bindAdvice };
