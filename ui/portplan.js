// ui/portplan.js — plan the ports of switches and nodes before any device is on the network.
// Pick a VLAN at the top, click or drag over the ports of a switch and they get that VLAN; click a port to give it a name
// by hand (without a name the automatic one from the plan is used). Nodes: universe, name, sACN / Art-Net and direction per DMX port.
// What is planned here is what the Network config page puts on the real devices later (see wantSwitch / wantNode there).
// Stored in MODEL.networkDevices.portPlans = { 'sw:DB01|SW1': { ports: { 3: { vid, trunk, name } } }, 'nd:DB01|N1': { ports: { 1: { name, klass, dir } } } }
// Only what differs from the automatic plan is stored; a port without an entry follows the plan.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const F = () => window.Fent;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const S = { swBrush:null, ndBrush:{ universe:null, auto:true, klass:'', dir:'' }, sel:null, extra:new Set(), drag:null };

  const store = () => { const nd = M().networkDevices; return (nd.portPlans ||= {}); };
  const swKey = (dc, label) => `sw:${dc}|${label}`;
  const ndKey = (dc, inst, i) => `nd:${dc}|${inst.id || '#' + i}`;
  const get = key => store()[key]?.ports || {};
  const put = (key, port) => ((store()[key] ||= { ports:{} }).ports[port] ||= {});
  function prune(key){ const e = store()[key]; if(!e) return; for(const [p, v] of Object.entries(e.ports)) if(!Object.keys(v).length || Object.values(v).every(x => x === undefined || x === null || x === '')) delete e.ports[p]; if(!Object.keys(e.ports).length) delete store()[key]; }
  const dirty = () => { const m = M(); if(m?.ui) m.ui.dirty = true; };
  const vlanById = id => F()?.vlanById?.(Number(id)) || null;
  const vlanName = id => vlanById(id)?.name || `VLAN ${id}`;
  const vlanColor = id => vlanById(id)?.color || '#64748b';
  const mode = () => M().networkDevices?.prefs?.fent?.vlanMode || 'luminex';

  // ---- switches: what every port looks like (plan + what was changed by hand) ----
  function swPorts(dc, s){
    const rows = (window.FentUI?.portPlan(dc).rows || []).filter(r => r.sw === s.label && r.swPort);
    const auto = new Map(rows.map(r => [r.swPort, { vid:Number.isFinite(Number((r.vlans || [])[0])) && (r.vlans || []).length ? Number(r.vlans[0]) : null, name:String(r.device ?? '') }]));
    const ov = get(swKey(dc, s.label)), out = [];
    for(let n = 1; n <= s.rj; n++){
      const a = auto.get(n) || { vid:null, name:'' }, o = ov[n] || {};
      const trunk = !!o.trunk, vid = trunk ? null : (o.vid != null ? Number(o.vid) : a.vid);
      out.push({ n, vid, trunk, name:o.name != null && o.name !== '' ? String(o.name) : a.name, autoName:a.name, autoVid:a.vid, manualName:o.name != null && o.name !== '', manualVlan:o.vid != null || trunk });
    }
    return out;
  }
  const vlansInUse = dc => { const set = new Set(); for(const s of (window.NetSwitches?.list(dc) || [])) for(const p of swPorts(dc, s)) if(p.vid != null) set.add(p.vid); return set; };

  // ---- the VLAN bar ----
  function brushBar(dc){
    const used = vlansInUse(dc), all = F().vlanList(mode());
    const ids = [...new Set([...used, ...S.extra])].sort((a, b) => a - b);
    const b = S.swBrush;
    const chips = ids.map(id => `<button class="pp-chip ${b && b.vid === id ? 'on' : ''}" data-ppb="vid" data-vid="${id}" style="--c:${vlanColor(id)}" title="${esc(vlanById(id)?.discipline || '')}"><i></i><b>${id}</b> ${esc(vlanName(id))}</button>`).join('');
    const more = all.filter(v => !ids.includes(v.id));
    return `<div class="pp-bar"><span class="subtle">${t('Pick a VLAN, then click or drag over the ports', 'Kies een VLAN, klik of sleep dan over de poorten')}:</span>${chips}
      <button class="pp-chip trunk ${b?.trunk ? 'on' : ''}" data-ppb="trunk">${t('Trunk', 'Trunk')}</button>
      <button class="pp-chip ${b?.clear ? 'on' : ''}" data-ppb="clear" title="${esc(t('Back to the automatic plan', 'Terug naar het automatische plan'))}">${t('Automatic', 'Automatisch')}</button>
      <select data-ppmore title="${esc(t('Add another VLAN to the bar', 'Voeg een ander VLAN aan de balk toe'))}"><option value="">${t('More VLANs…', 'Meer VLAN’s…')}</option>${more.map(v => `<option value="${v.id}">${v.id} ${esc(v.name)}</option>`).join('')}</select></div>`;
  }

  // ---- switch grid ----
  function swTile(dc, s, p){
    const sel = S.sel && S.sel.key === swKey(dc, s.label) && S.sel.port === p.n;
    const col = p.trunk ? '#38bdf8' : p.vid != null ? vlanColor(p.vid) : '#475569';
    const tip = `${t('Port', 'Poort')} ${p.n} · ${p.trunk ? 'Trunk' : p.vid != null ? `${p.vid} ${vlanName(p.vid)}` : t('no VLAN', 'geen VLAN')}${p.name ? ' · ' + p.name : ''}`;
    return `<button class="pp-port ${sel ? 'sel' : ''} ${p.manualVlan || p.manualName ? 'man' : ''}" data-pport="${p.n}" data-ppsw="${esc(s.label)}" style="--pc:${col}" title="${esc(tip)}"><small>${p.n}</small><b>${p.trunk ? 'T' : p.vid != null ? p.vid : '–'}</b><span>${esc(p.name)}</span></button>`;
  }
  function swDetail(dc, s){
    const key = swKey(dc, s.label); if(!S.sel || S.sel.key !== key) return '';
    const p = swPorts(dc, s).find(x => x.n === S.sel.port); if(!p) return '';
    const cur = p.trunk ? 'trunk' : p.manualVlan ? String(p.vid) : '';
    const all = F().vlanList(mode());
    return `<div class="pp-detail" data-ppdet="${esc(s.label)}"><b>${t('Port', 'Poort')} ${p.n}</b>
      <label>${t('Name', 'Naam')}<input data-ppname value="${esc(p.manualName ? p.name : '')}" placeholder="${esc(p.autoName || t('(none)', '(geen)'))}" maxlength="16" style="width:170px"></label>
      <label>VLAN<select data-ppvlan><option value="" ${cur === '' ? 'selected' : ''}>${t('Automatic', 'Automatisch')}${p.autoVid != null ? ` (${p.autoVid})` : ''}</option><option value="trunk" ${cur === 'trunk' ? 'selected' : ''}>Trunk</option>${all.map(v => `<option value="${v.id}" ${cur === String(v.id) ? 'selected' : ''}>${v.id} ${esc(v.name)}</option>`).join('')}</select></label>
      <button class="sm ghost" data-ppreset>${t('Reset this port', 'Poort terugzetten')}</button></div>`;
  }
  function swBlock(dc, s){
    const key = swKey(dc, s.label), ports = swPorts(dc, s), man = ports.filter(p => p.manualName || p.manualVlan).length;
    return `<div class="pp-sw" data-ppkey="${esc(key)}"><div class="pp-head"><b>${esc(s.label)}</b><span class="subtle">${esc(window.NetSwitches.typeName(s.type))} · ${s.rj} RJ45${s.sfp ? ` + ${s.sfp} SFP` : ''}${man ? ` · ${man} ${t('by hand', 'handmatig')}` : ''}</span><span style="flex:1"></span>
      <button class="sm ghost" data-ppnames="${esc(s.label)}" title="${esc(t('Remove all names typed by hand: the automatic names come back', 'Haal alle handmatige namen weg: de automatische namen komen terug'))}">${t('Automatic names', 'Automatische namen')}</button>
      <button class="sm ghost" data-ppresetall="${esc(s.label)}">${t('Reset all', 'Alles terugzetten')}</button></div>
      <div class="pp-grid">${ports.map(p => swTile(dc, s, p)).join('')}</div>${s.sfp ? `<div class="subtle" style="font-size:12px;margin-top:4px">${t('The fibre ports are set on the Fibres tab.', 'De fiberpoorten stel je in op het tabblad Fibers.')}</div>` : ''}${swDetail(dc, s)}</div>`;
  }

  // ---- nodes ----
  function ndPorts(dc, inst, i){
    const ty = (M().networkDevices.nodeTypes || []).find(x => x.id === inst.typeId) || {}, n = Math.max(1, Number(ty.portCount) || (Array.isArray(inst.universes) ? inst.universes.length : 0) || 1);
    const ov = get(ndKey(dc, inst, i)), u = Array.isArray(inst.universes) ? inst.universes : [], out = [];
    for(let j = 0; j < n; j++){
      const o = ov[j + 1] || {}, auto = `${inst.id || 'N'}.${j + 1}`, uni = u[j] == null || u[j] === '' ? null : Number(u[j]);
      out.push({ n:j + 1, uni, name:o.name || auto, autoName:auto, manualName:!!o.name, klass:o.klass || '', dir:o.dir || '' });
    }
    return out;
  }
  function ndTile(dc, inst, i, p){
    const sel = S.sel && S.sel.key === ndKey(dc, inst, i) && S.sel.port === p.n;
    const col = p.uni == null ? '#475569' : `hsl(${(p.uni * 37) % 360} 55% 44%)`;
    return `<button class="pp-port nd ${sel ? 'sel' : ''} ${p.manualName || p.klass || p.dir ? 'man' : ''}" data-pport="${p.n}" data-ppnd="${i}" style="--pc:${col}" title="${esc(`DMX ${p.n} · ${p.uni == null ? t('no universe', 'geen universe') : 'U' + p.uni} · ${p.name}`)}"><small>${p.n}</small><b>${p.uni == null ? '–' : p.uni}</b><span>${esc(p.name)}${p.klass ? ' · ' + (p.klass === 'sacn' ? 'sACN' : 'Art') : ''}${p.dir ? ' ' + (p.dir === 'in' ? '↓' : '↑') : ''}</span></button>`;
  }
  function ndDetail(dc, inst, i){
    const key = ndKey(dc, inst, i); if(!S.sel || S.sel.key !== key) return '';
    const p = ndPorts(dc, inst, i).find(x => x.n === S.sel.port); if(!p) return '';
    return `<div class="pp-detail" data-ppdet-nd="${i}"><b>DMX ${p.n}</b>
      <label>Universe<input data-ppuni type="number" min="0" max="63999" value="${p.uni ?? ''}" style="width:90px"></label>
      <label>${t('Name', 'Naam')}<input data-ppname value="${esc(p.manualName ? p.name : '')}" placeholder="${esc(p.autoName)}" maxlength="16" style="width:150px"></label>
      <label>${t('Protocol', 'Protocol')}<select data-ppklass><option value="">–</option><option value="sacn" ${p.klass === 'sacn' ? 'selected' : ''}>sACN</option><option value="artnet" ${p.klass === 'artnet' ? 'selected' : ''}>Art-Net</option></select></label>
      <label>${t('Direction', 'Richting')}<select data-ppdir><option value="">–</option><option value="out" ${p.dir === 'out' ? 'selected' : ''}>${t('Output', 'Uitgang')}</option><option value="in" ${p.dir === 'in' ? 'selected' : ''}>${t('Input', 'Ingang')}</option></select></label>
      <button class="sm ghost" data-ppreset>${t('Reset this port', 'Poort terugzetten')}</button></div>`;
  }
  function ndBlock(dc, inst, i){
    const key = ndKey(dc, inst, i), ports = ndPorts(dc, inst, i);
    return `<div class="pp-sw" data-ppkey="${esc(key)}"><div class="pp-head"><b>${esc(inst.id || `Node ${i + 1}`)}</b><span class="subtle">${esc(inst.name || '')}</span><span style="flex:1"></span>
      <button class="sm ghost" data-ppndnames="${i}">${t('Automatic names', 'Automatische namen')}</button></div>
      <div class="pp-grid">${ports.map(p => ndTile(dc, inst, i, p)).join('')}</div>${ndDetail(dc, inst, i)}</div>`;
  }
  function ndBar(){
    const b = S.ndBrush;
    return `<div class="pp-bar"><span class="subtle">${t('Type a universe, then click or drag over the DMX ports', 'Typ een universe, klik of sleep dan over de DMX-poorten')}:</span>
      <label>Universe<input data-ppbuni type="number" min="0" max="63999" value="${b.universe ?? ''}" style="width:90px"></label>
      <label class="nc-chk"><input type="checkbox" data-ppbauto ${b.auto ? 'checked' : ''}> ${t('next port gets the next universe', 'volgende poort krijgt het volgende universe')}</label>
      <label>${t('Protocol', 'Protocol')}<select data-ppbklass><option value="">–</option><option value="sacn" ${b.klass === 'sacn' ? 'selected' : ''}>sACN</option><option value="artnet" ${b.klass === 'artnet' ? 'selected' : ''}>Art-Net</option></select></label>
      <label>${t('Direction', 'Richting')}<select data-ppbdir><option value="">–</option><option value="out" ${b.dir === 'out' ? 'selected' : ''}>${t('Output', 'Uitgang')}</option><option value="in" ${b.dir === 'in' ? 'selected' : ''}>${t('Input', 'Ingang')}</option></select></label></div>`;
  }

  // ---- the cards ----
  function html(dc){
    if(!F() || !window.NetSwitches) return '';
    const sws = window.NetSwitches.list(dc), nodes = App.net.getDimPlan(dc).nodes || [];
    const swBody = sws.length ? `${brushBar(dc)}${sws.map(s => swBlock(dc, s)).join('')}` : `<div class="subtle" style="padding:6px 0">${t('Add a switch below first; then you can set its ports here.', 'Voeg eerst hieronder een switch toe; dan stel je hier zijn poorten in.')}</div>`;
    const a = App.ui.card({ key:`${dc}:ppsw`, title:t('Switch ports: VLAN and names', 'Switchpoorten: VLAN en namen'), icon:'switchDev', meta:t('prepare before you go on site', 'voorbereiden vóór je op locatie bent'), collapsible:false,
      body:`<div class="pp" style="padding:4px 14px 12px"><div class="hint" style="margin-bottom:8px">${I('info', 13)} ${t('Set the VLAN of every port in advance. Ports without a choice follow the automatic plan (nodes, then network cables). Later, “Fill in from the plan” on the Network config page puts all this on the real switch.', 'Stel van tevoren het VLAN van elke poort in. Poorten zonder keuze volgen het automatische plan (nodes, daarna netwerkkabels). Later zet “Invullen vanuit plan” op de pagina Netwerkconfig dit alles op de echte switch.')}</div>${swBody}</div>` });
    const b = nodes.length ? App.ui.card({ key:`${dc}:ppnd`, title:t('Node ports: universes and names', 'Nodepoorten: universes en namen'), icon:'network', meta:`${nodes.length} nodes`, collapsible:true, collapsed:true,
      body:`<div class="pp" style="padding:4px 14px 12px">${ndBar()}${nodes.map((n, i) => ndBlock(dc, n, i)).join('')}</div>` }) : '';
    return a + b;
  }

  // ---- events ----
  function apply(dc, s, n){
    const br = S.swBrush; if(!br) return false; const key = swKey(dc, s.label), e = put(key, n);
    if(br.clear){ delete e.vid; delete e.trunk; } else if(br.trunk){ e.trunk = true; delete e.vid; } else { e.vid = br.vid; delete e.trunk; }
    prune(key); dirty(); return true;
  }
  function applyNode(dc, inst, i, n){
    const b = S.ndBrush; if(b.universe == null && !b.klass && !b.dir) return false;
    const key = ndKey(dc, inst, i); inst.universes = Array.isArray(inst.universes) ? inst.universes : [];
    if(b.universe != null){ inst.universes[n - 1] = b.universe; if(b.auto) b.universe = Math.min(63999, b.universe + 1); }
    const e = put(key, n); if(b.klass) e.klass = b.klass; if(b.dir) e.dir = b.dir; prune(key); dirty(); return true;
  }
  function bind(root, dc, rerender){
    const pp = root.querySelector('.pp'); if(!root.querySelector('[data-ppkey], [data-ppb], [data-ppbuni]')) return;
    const sw = l => (window.NetSwitches.list(dc) || []).find(s => s.label === l);
    const redrawTile = el => { const dcs = dc; if(el.dataset.ppsw){ const s = sw(el.dataset.ppsw), p = swPorts(dcs, s).find(x => x.n === Number(el.dataset.pport)); el.outerHTML = swTile(dcs, s, p); } else { const i = Number(el.dataset.ppnd), inst = App.net.getDimPlan(dcs).nodes[i], p = ndPorts(dcs, inst, i).find(x => x.n === Number(el.dataset.pport)); el.outerHTML = ndTile(dcs, inst, i, p); } };
    root.querySelectorAll('[data-ppb]').forEach(b => b.onclick = () => { const k = b.dataset.ppb; S.swBrush = S.swBrush && ((k === 'vid' && S.swBrush.vid === Number(b.dataset.vid)) || (k === 'trunk' && S.swBrush.trunk) || (k === 'clear' && S.swBrush.clear)) ? null : k === 'vid' ? { vid:Number(b.dataset.vid) } : k === 'trunk' ? { trunk:true } : { clear:true }; rerender(); });
    const more = root.querySelector('[data-ppmore]'); if(more) more.onchange = () => { if(more.value){ S.extra.add(Number(more.value)); S.swBrush = { vid:Number(more.value) }; } rerender(); };
    // ports: click paints with the brush (or selects the port), dragging paints a row of ports
    const finish = () => { if(S.drag){ S.drag = null; rerender(); } };
    root.querySelectorAll('.pp-port').forEach(el => {
      const paint = () => {
        if(el.dataset.ppsw){ const s = sw(el.dataset.ppsw); if(s && apply(dc, s, Number(el.dataset.pport))) { redrawTile(el); return true; } return false; }
        const i = Number(el.dataset.ppnd), inst = App.net.getDimPlan(dc).nodes[i]; if(inst && applyNode(dc, inst, i, Number(el.dataset.pport))){ redrawTile(el); return true; } return false;
      };
      el.onmousedown = ev => { ev.preventDefault(); const kind = el.dataset.ppsw ? 'sw' : 'nd'; if(paint()){ S.drag = kind; S.sel = null; } else { const key = el.dataset.ppsw ? swKey(dc, el.dataset.ppsw) : ndKey(dc, App.net.getDimPlan(dc).nodes[Number(el.dataset.ppnd)], Number(el.dataset.ppnd)); S.sel = S.sel && S.sel.key === key && S.sel.port === Number(el.dataset.pport) ? null : { key, port:Number(el.dataset.pport) }; rerender(); } };
      el.onmouseenter = () => { if(S.drag && (el.dataset.ppsw ? 'sw' : 'nd') === S.drag) paint(); };
    });
    window.addEventListener('mouseup', function once(){ window.removeEventListener('mouseup', once); finish(); });
    // detail of a switch port
    root.querySelectorAll('[data-ppdet]').forEach(box => {
      const s = sw(box.dataset.ppdet), key = swKey(dc, s.label), n = S.sel.port;
      box.querySelector('[data-ppname]').onchange = e => { const v = e.target.value.trim().slice(0, 16); const o = put(key, n); if(v) o.name = v; else delete o.name; prune(key); dirty(); rerender(); };
      box.querySelector('[data-ppvlan]').onchange = e => { const o = put(key, n), v = e.target.value; delete o.vid; delete o.trunk; if(v === 'trunk') o.trunk = true; else if(v) o.vid = Number(v); prune(key); dirty(); rerender(); };
      box.querySelector('[data-ppreset]').onclick = () => { delete store()[key]?.ports[n]; prune(key); dirty(); rerender(); };
    });
    root.querySelectorAll('[data-ppnames]').forEach(b => b.onclick = () => { const key = swKey(dc, b.dataset.ppnames), e = store()[key]; if(e){ for(const v of Object.values(e.ports)) delete v.name; prune(key); dirty(); } rerender(); });
    root.querySelectorAll('[data-ppresetall]').forEach(b => b.onclick = () => { delete store()[swKey(dc, b.dataset.ppresetall)]; dirty(); rerender(); });
    // nodes
    const nb = S.ndBrush, q = s => root.querySelector(s);
    if(q('[data-ppbuni]')){ q('[data-ppbuni]').oninput = e => { nb.universe = e.target.value === '' ? null : Math.max(0, Math.min(63999, Math.round(Number(e.target.value)))); }; q('[data-ppbauto]').onchange = e => { nb.auto = e.target.checked; }; q('[data-ppbklass]').onchange = e => { nb.klass = e.target.value; }; q('[data-ppbdir]').onchange = e => { nb.dir = e.target.value; }; }
    root.querySelectorAll('[data-ppdet-nd]').forEach(box => {
      const i = Number(box.dataset.ppdetNd), inst = App.net.getDimPlan(dc).nodes[i], key = ndKey(dc, inst, i), n = S.sel.port;
      box.querySelector('[data-ppuni]').onchange = e => { inst.universes = Array.isArray(inst.universes) ? inst.universes : []; inst.universes[n - 1] = e.target.value === '' ? null : Math.max(0, Math.min(63999, Math.round(Number(e.target.value)))); dirty(); rerender(); };
      box.querySelector('[data-ppname]').onchange = e => { const v = e.target.value.trim().slice(0, 16), o = put(key, n); if(v) o.name = v; else delete o.name; prune(key); dirty(); rerender(); };
      box.querySelector('[data-ppklass]').onchange = e => { const o = put(key, n); if(e.target.value) o.klass = e.target.value; else delete o.klass; prune(key); dirty(); rerender(); };
      box.querySelector('[data-ppdir]').onchange = e => { const o = put(key, n); if(e.target.value) o.dir = e.target.value; else delete o.dir; prune(key); dirty(); rerender(); };
      box.querySelector('[data-ppreset]').onclick = () => { delete store()[key]?.ports[n]; prune(key); dirty(); rerender(); };
    });
    root.querySelectorAll('[data-ppndnames]').forEach(b => b.onclick = () => { const i = Number(b.dataset.ppndnames), key = ndKey(dc, App.net.getDimPlan(dc).nodes[i], i), e = store()[key]; if(e){ for(const v of Object.values(e.ports)) delete v.name; prune(key); dirty(); } rerender(); });
  }

  // ---- for the Network config page: what the plan wants on a switch / node, including the hand-made choices ----
  const forSwitch = (dc, label) => get(swKey(dc, label));
  const forNode = (dc, inst, i) => get(ndKey(dc, inst, i));
  window.PortPlan = { html, bind, state:S, forSwitch, forNode, swPorts, ndPorts, swKey, ndKey };
})();
