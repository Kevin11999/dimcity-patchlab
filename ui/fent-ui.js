// ui/fent-ui.js — several addresses per network device, the FENT scheme and the switch port plan.
// A device keeps its first address in dev.ip / dev.subnet (as before) and more addresses in dev.ifaces:
//   [{ role:'management'|'lighting'|'scan'|'other', vlan, ip, mask, eth }]   (see core/fent.js)
// MODEL.networkDevices.prefs.fent = { on, group:'production'|'location', scan }
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const F = () => window.Fent;
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const cfg = () => { const nd = M().networkDevices; nd.prefs ||= {}; nd.prefs.fent ||= { on:false, group:'production', scan:false }; nd.prefs.fent.vlanMode ||= 'luminex'; return nd.prefs.fent; };
  const dimNo = dc => (window.LKApp?.dimSlot ? window.LKApp.dimSlot(dc) : (/(\d+)/.exec(String(dc)) || [0, 1])[1] * 1);
  const plan = dc => M().networkDevices?.dimCityPlans?.[dc] || { nodes:[], splitters:[], switches:[] };
  const TYPES = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes' }, LISTS = { node:'nodes', splitter:'splitters', switch:'switches' };
  const typeOf = (kind, dev) => (M().networkDevices?.[TYPES[kind]] || []).find(x => x.id === dev.typeId) || {};
  const ethOf = (kind, dev) => kind === 'node' ? Math.min(2, Math.max(1, Number(typeOf(kind, dev).ethernetCount) || 1)) : 1;
  // devices with an address: nodes, and splitters that have (or can get) one
  const devices = dc => { const p = plan(dc); return [...p.nodes.map((dev, idx) => ({ kind:'node', idx, dev })), ...p.splitters.map((dev, idx) => ({ kind:'splitter', idx, dev })).filter(d => d.dev.ip || d.dev.ifaces?.length || typeOf('splitter', d.dev).defaultIp)]; };
  const vlanChip = v => v ? `<span class="fent-chip" style="--c:${v.color || '#94a3b8'}" title="${esc(v.discipline)} · ${esc(v.net)}">${esc(v.name)} ${v.id}</span>` : '';
  const roleName = r => { const x = F().ROLES[r]; return x ? t(x.en, x.nl) : r; };

  // ---- the block under the first address of a node / splitter ----
  // all VLANs of the chosen numbering, plus the current one when it comes from the other list
  function vlanOptions(cur){
    const list = F().vlanList(cfg().vlanMode).slice(); const c = F().vlanById(cur);
    if(c && !list.includes(c)) list.unshift(c);
    return list.map(v => `<option value="${v.id}" ${Number(cur) === v.id ? 'selected' : ''}>${v.id} ${esc(v.name)}</option>`).join('');
  }
  function deviceBlock(dc, kind, idx, dev){
    if(!F()) return '';
    const eth = ethOf(kind, dev), on = cfg().on;
    const first = dev.ip ? F().classify(dev.ip) : null;
    const rows = (dev.ifaces || []).map((x, i) => `<div class="fent-row" data-i="${i}">
        <select data-f="role">${Object.keys(F().ROLES).map(r => `<option value="${r}" ${x.role === r ? 'selected' : ''}>${esc(roleName(r))}</option>`).join('')}</select>
        <select data-f="vlan" title="VLAN">${vlanOptions(x.vlan)}</select>
        <input data-f="ip" value="${esc(x.ip || '')}" placeholder="10.40.101.11" inputmode="numeric" class="${x.ip && !F().isIp(x.ip) ? 'invalid' : ''}">
        <input data-f="mask" value="${esc(x.mask || '')}" placeholder="${F().MASK}" inputmode="numeric" style="max-width:120px">
        ${eth > 1 ? `<select data-f="eth" title="${esc(t('Which RJ45 carries this address', 'Welke RJ45 dit adres draagt'))}"><option value="1" ${Number(x.eth) !== 2 ? 'selected' : ''}>ETH1</option><option value="2" ${Number(x.eth) === 2 ? 'selected' : ''}>ETH2</option></select>` : ''}
        <button class="sm ghost" data-rm title="${esc(t('Remove this address', 'Verwijder dit adres'))}">${I('x', 13)}</button></div>`).join('');
    const warns = on ? F().checkAll(F().ifaces(dev, eth).map(x => ({ owner:dev.id || dev.name || kind, ip:x.ip, mask:x.mask, vlan:x.vlan, kind:kind === 'switch' ? 'equipment' : 'device' })), cfg().group).filter(w => w.code !== 'DUPLICATE') : [];
    return `<div class="fent-ifaces" data-fent="${esc(dc)}|${kind}|${idx}">
      <div class="fent-head"><span class="rb-label" style="margin:0">${t('Addresses', 'Adressen')}</span> ${first?.vlan ? vlanChip(first.vlan) : ''}
        <button class="sm" data-add>${I('plus', 13)}${t('Add address', 'Adres toevoegen')}</button></div>
      ${rows || `<div class="subtle" style="font-size:12px">${t('One address. Add more if this device is managed on one VLAN and sends or scans on another.', 'Eén adres. Voeg er meer toe als dit apparaat op het ene VLAN wordt beheerd en op een ander VLAN data stuurt of scant.')}</div>`}
      ${warns.length ? `<div class="fent-warns">${warns.map(w => `<span class="fent-w ${w.level}">${esc(t(w.en, w.nl))}</span>`).join('')}</div>` : ''}</div>`;
  }
  function bindDevice(root, dc, rerender){
    root.querySelectorAll('.fent-ifaces').forEach(box => {
      const [bdc, kind, idxS] = box.dataset.fent.split('|'); if(bdc !== dc) return;
      const dev = (plan(dc)[LISTS[kind]] || [])[Number(idxS)]; if(!dev) return;
      const eth = ethOf(kind, dev);
      box.querySelector('[data-add]').onclick = () => {
        const used = new Set((dev.ifaces || []).map(x => x.role)); const role = !used.has('lighting') ? 'lighting' : !used.has('scan') ? 'scan' : 'other';
        const c = cfg(), v = F().roleVlan(role, c.vlanMode);
        (dev.ifaces ||= []).push({ role, vlan:v, ip:c.on ? F().suggestRole(role, c.group, dimNo(dc), Number(String(dev.ip || '').split('.')[3]) || 11) : '', mask:c.on ? F().MASK : (dev.subnet || ''), eth:eth > 1 ? 2 : 1 });
        M().ui.dirty = true; rerender();
      };
      box.querySelectorAll('.fent-row').forEach(row => {
        const x = dev.ifaces[Number(row.dataset.i)]; if(!x) return;
        row.querySelector('[data-rm]').onclick = () => { dev.ifaces.splice(Number(row.dataset.i), 1); M().ui.dirty = true; rerender(); };
        row.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
          const f = inp.dataset.f; x[f] = (f === 'vlan' || f === 'eth') ? Number(inp.value) : inp.value.trim();
          if(f === 'role' && F().ROLES[inp.value]) x.vlan = F().roleVlan(inp.value, cfg().vlanMode);
          M().ui.dirty = true; rerender();
        });
      });
    });
  }

  // ---- FENT: apply the scheme ----
  function applyDim(dc){
    const c = cfg(), p = plan(dc), no = dimNo(dc); let host = 11, n = 0, over = false;
    for(const { kind, dev } of devices(dc)){
      if(host > 250){ over = true; break; }
      const eth = ethOf(kind, dev);
      const vm = F().roleVlan('management', c.vlanMode), vl = F().roleVlan('lighting', c.vlanMode), vs = F().roleVlan('scan', c.vlanMode);
      dev.ip = F().suggestRole('management', c.group, no, host); dev.subnet = F().MASK; dev.ipRole = 'management'; dev.ipVlan = vm;
      dev.ifaces = [{ role:'lighting', vlan:vl, ip:F().suggestRole('lighting', c.group, no, host), mask:F().MASK, eth:eth > 1 ? 2 : 1 }];
      if(c.scan && host + 100 <= 250) dev.ifaces.push({ role:'scan', vlan:vs, ip:F().suggestRole('scan', c.group, no, host + 100), mask:F().MASK, eth:eth > 1 ? 2 : 1 });
      host++; n++;
    }
    // switches are network equipment: management address from 1 to 10
    (p.switches || []).forEach((sw, i) => {
      if(i >= 10) return;
      const vm = F().roleVlan('management', c.vlanMode);
      sw.ip = F().suggestEquipment(vm, c.group, no, i + 1); sw.subnet = F().MASK; sw.ipRole = 'management'; sw.ipVlan = vm; sw.ifaces = sw.ifaces || []; n++;
    });
    return { n, over };
  }
  async function applyAll(dcs){
    const count = dcs.reduce((s, dc) => s + devices(dc).length, 0);
    if(!count){ App.ui.toast(t('No nodes planned yet', 'Nog geen nodes gepland'), 'info'); return; }
    const ok = await App.ui.confirmDialog({ title:t('Apply the FENT scheme?', 'Het FENT-schema toepassen?'), message:t(`${count} device(s) get a management address (VLAN ${F().roleVlan('management', cfg().vlanMode)}, 10.90.x.x) and a lighting address (VLAN ${F().roleVlan('lighting', cfg().vlanMode)}, 10.40.x.x). Their current addresses are replaced.`, `${count} apparaat/apparaten krijgen een beheeradres (VLAN ${F().roleVlan('management', cfg().vlanMode)}, 10.90.x.x) en een lichtadres (VLAN ${F().roleVlan('lighting', cfg().vlanMode)}, 10.40.x.x). Hun huidige adressen worden vervangen.`), okLabel:t('Apply', 'Toepassen') });
    if(!ok) return;
    let done = 0, over = false; for(const dc of dcs){ const r = applyDim(dc); done += r.n; over = over || r.over; }
    M().ui.dirty = true; App.ui.toast(over ? t(`${done} devices addressed — more than 240 devices in one DimCity, the rest was skipped`, `${done} apparaten voorzien van een adres — meer dan 240 apparaten in één DimCity, de rest is overgeslagen`) : t(`${done} devices addressed with the FENT scheme`, `${done} apparaten voorzien van een adres volgens het FENT-schema`));
  }

  // ---- switch port plan per DimCity ----
  function switchCapacity(dc){
    try { const P = window.RackEngine.computeRackPlan(M(), dc); let rj = 0, sfp = 0, n = 0;
      for(const R of P.racks) for(const it of (R.rack?.items || [])) if(it.kind === 'switch'){ const ty = (M().networkDevices.switchTypes || []).find(x => x.id === it.typeId); if(ty){ n++; rj += Number(ty.portCount) || 0; sfp += Number(ty.sfpCount) || 0; } }
      return { n, rj, sfp };
    } catch { return { n:0, rj:0, sfp:0 }; }
  }
  function portPlan(dc){
    const rows = F().switchPlan(devices(dc).map(({ kind, idx, dev }) => ({ label:dev.id || dev.name || kind, ethCount:ethOf(kind, dev), dev, ref:{ kind, idx } })));
    // after the nodes: the network cables (C) that come into the DimCity, one switch port per line
    let port = rows.length + 1;
    for(const c of (window.NetCables?.cables(dc) || [])) for(const l of c.lines) if(!l.empty) rows.push({ port:port++, device:`${c.id}.${l.port}`, eth:1, ethCount:1, mode:'access', vlans:l.vlan != null ? [l.vlan] : [], ips:[], dest:l.dest || '', cable:true });
    window.NetSwitches?.assign(dc, rows);
    return { rows, cap:switchCapacity(dc) };
  }
  const vlanLabel = id => { const v = F().vlanById(id); return v ? `${v.id} ${v.name}` : String(id); };
  function portTable(dc){
    const { rows, cap } = portPlan(dc);
    if(!rows.length) return `<div class="subtle" style="padding:6px 0">${t('No addresses yet — give the nodes an address (or apply the FENT scheme) and the ports appear here.', 'Nog geen adressen — geef de nodes een adres (of pas het FENT-schema toe) en de poorten verschijnen hier.')}</div>`;
    const sws = window.NetSwitches?.list(dc) || [], capAll = sws.reduce((n, s) => n + s.rj, 0), over = sws.length && rows.length > capAll;
    return `${sws.length ? `<div class="hint ${over ? 'fent-bad' : ''}">${over ? I('alert', 13) : I('info', 13)} ${rows.length} ${t('ports needed', 'poorten nodig')} · ${capAll} RJ45 ${t('on', 'op')} ${sws.map(s => esc(s.label)).join(' + ')}</div>` : `<div class="hint">${I('info', 13)} ${rows.length} ${t('ports needed — add a switch to the DimCity (or put one in a rack) and the ports are handed out in order', 'poorten nodig — voeg een switch toe aan de DimCity (of zet er een in een rek) en de poorten worden op volgorde uitgedeeld')}</div>`}
      <table class="data-table fent-ports"><thead><tr><th>${t('Switch port', 'Switchpoort')}</th><th>${t('Device', 'Apparaat')}</th><th>${t('Mode', 'Modus')}</th><th>VLAN</th><th>${t('Addresses', 'Adressen')}</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.over ? 'fent-bad' : ''}"><td><b>${r.sw ? `${esc(r.sw)} · ${r.swPort}` : (r.over ? '—' : r.port)}</b></td><td>${esc(r.device)}${r.ethCount > 1 ? ` <span class="subtle">ETH${r.eth}</span>` : ''}</td><td>${r.mode === 'trunk' ? t('Trunk (tagged)', 'Trunk (tagged)') : t('Access (untagged)', 'Access (untagged)')}</td><td>${r.vlans.map(v => vlanChip(F().vlanById(v)) || esc(v)).join(' ') || '—'}</td><td class="mono">${r.cable ? esc(r.dest) : r.ips.map(esc).join(' · ')}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---- the card on the Network Planner page ----
  // the VLAN list (names and colours can be changed, own VLANs can be added) — always visible, with or without the FENT scheme
  function vlanCard(){
    if(!F()) return '';
    const c = cfg(), list = F().vlanList(c.vlanMode).filter(v => !v.extension);
    const used = new Map(); try { for(const dc of App.sortedDims()) for(const r of (window.FentUI.portPlan ? window.FentUI.portPlan(dc) : [])) for(const v of (r.vlans || [])) used.set(Number(v), (used.get(Number(v)) || 0) + 1); } catch {}
    const rows = list.map(v => `<tr><td><b>${v.id}</b></td>
      <td><input type="text" class="vlanName" data-vlan="${v.id}" maxlength="24" value="${esc(v.name)}" placeholder="${esc(v.stdName || v.name)}" style="width:170px"> <span class="subtle">${esc(v.custom ? t('own VLAN', 'eigen VLAN') : (v.discipline || ''))}</span></td>
      <td><input type="color" class="vlanColor" data-vlan="${v.id}" value="${/^#[0-9a-f]{6}$/i.test(v.color || '') ? v.color : '#94a3b8'}"></td>
      <td class="mono">${v.net ? `${v.net} · ${F().MASK}` : (v.second ? `10.${v.second}.x.x · ${F().MASK}` : '—')}</td>
      <td class="num">${used.get(v.id) || ''}</td>
      <td>${v.custom ? `<button class="sm ghost vlanDel" data-vlan="${v.id}" title="${esc(t('Remove this VLAN', 'Verwijder dit VLAN'))}">${I('trash', 13)}</button>` : ((v.stdName && v.stdName !== v.name) || (v.stdColor && v.stdColor !== v.color) ? `<button class="sm ghost vlanReset" data-vlan="${v.id}" title="${esc(t('Back to the standard name and colour', 'Terug naar standaardnaam en -kleur'))}">${I('refresh', 13)}</button>` : '')}</td></tr>`).join('');
    const body = `<div style="padding:6px 14px 14px"><table class="data-table fent-vlans"><thead><tr><th>ID</th><th>${t('Name', 'Naam')}</th><th>${t('Colour', 'Kleur')}</th><th>${t('Network', 'Netwerk')}</th><th class="num">${t('Ports', 'Poorten')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="su-row" style="margin-top:10px"><b style="font-size:12.5px">${t('Add your own VLAN', 'Eigen VLAN toevoegen')}</b><input type="number" id="vlanNewId" min="1" max="4094" placeholder="ID" style="width:90px"><input type="text" id="vlanNewName" maxlength="24" placeholder="${esc(t('Name', 'Naam'))}" style="width:160px"><button id="vlanAdd">${I('plus', 13)}${t('Add', 'Toevoegen')}</button></div>
      <div class="hint" style="margin-top:6px">${t('The name and colour are used in the port plan, on the stickers and in the PDF. Empty name = standard name.', 'De naam en kleur worden gebruikt in het poortplan, op de stickers en in de PDF. Lege naam = standaardnaam.')}</div></div>`;
    return App.ui.card({ key:'net-vlans', title:`VLAN ${c.vlanMode === 'fent' ? 'FENT' : 'Luminex'}`, icon:'network', meta:`${list.length}`, collapsible:false, body });
  }
  function plannerCard(opts = {}){
    if(!F()) return '';
    const c = cfg(), dims = App.sortedDims();
    const sw = (k, on, label, hint) => `<label class="rb-row"><span>${label}${hint ? `<span class="hint" style="display:block;margin:2px 0 0">${hint}</span>` : ''}</span><span class="switch"><input type="checkbox" data-fent-sw="${k}" ${on ? 'checked' : ''}><span></span></span></label>`;
    const vm = `<div class="rb-group"><div class="rb-label">${t('VLAN numbering', 'VLAN-nummering')}</div>
        <div class="segmented rb-full" data-fent-mode><button data-v="luminex" class="${c.vlanMode === 'luminex' ? 'active' : ''}">${t('Luminex groups (1, 200, 300 …)', 'Luminex-groepen (1, 200, 300 …)')}</button><button data-v="fent" class="${c.vlanMode === 'fent' ? 'active' : ''}">${t('FENT (1090, 1040 …)', 'FENT (1090, 1040 …)')}</button></div>
        <div class="hint" style="margin-top:6px">${c.vlanMode === 'luminex' ? t('Like the GigaCore: Management is VLAN 1, group 2 is VLAN 200, group 3 is VLAN 300 and so on. Use the same IDs on every switch.', 'Zoals de GigaCore: Management is VLAN 1, groep 2 is VLAN 200, groep 3 is VLAN 300 enzovoort. Gebruik dezelfde ID\'s op elke switch.') : t('The FENT VLAN numbers. Set your switches to the same IDs.', 'De FENT VLAN-nummers. Zet je switches op dezelfde ID\'s.')}</div></div>`;
    let body = vm + sw('on', c.on, t('Use the FENT scheme', 'Gebruik het FENT-schema'), t('Standard IP and VLAN numbering for entertainment networks (FENT Framework v1.1): management on VLAN 1090 (10.90.x.x), lighting on VLAN 1040 (10.40.x.x).', 'Standaard IP- en VLAN-nummering voor entertainmentnetwerken (FENT Framework v1.1): beheer op VLAN 1090 (10.90.x.x), licht op VLAN 1040 (10.40.x.x).'));
    if(c.on){
      const list = [];
      for(const dc of dims) for(const { kind, dev } of devices(dc)) for(const x of F().ifaces(dev, ethOf(kind, dev))) list.push({ owner:`${dc} · ${dev.id || dev.name || kind}`, ip:x.ip, mask:x.mask, vlan:x.vlan, kind:'device' });
      for(const dc of dims) for(const sw of (window.NetSwitches?.list(dc) || [])) if(sw.source === 'plan') for(const x of F().ifaces(sw.dev, 1)) list.push({ owner:`${dc} · ${sw.label}`, ip:x.ip, mask:x.mask, vlan:x.vlan, kind:'equipment' });
      const issues = F().checkAll(list, c.group);
      body += `<div class="rb-group"><div class="rb-label">${t('Group and scheme', 'Groep en schema')}</div>
        <div class="segmented rb-full" data-fent-group><button data-v="production" class="${c.group === 'production' ? 'active' : ''}">${t('Production (101-199)', 'Productie (101-199)')}</button><button data-v="location" class="${c.group === 'location' ? 'active' : ''}">${t('Location (1-99)', 'Locatie (1-99)')}</button></div>
        ${sw('scan', c.scan, t('Also a scan address per device', 'Ook een scanadres per apparaat'), t('A third address on its own VLAN (10.40.x.x, last byte +100) for scanning.', 'Een derde adres op een eigen VLAN (10.40.x.x, laatste byte +100) om te scannen.'))}
        <div style="display:flex;gap:8px;margin-top:10px"><button class="primary" data-fent-apply>${I('check', 14)}${t('Apply to all DimCities', 'Toepassen op alle DimCities')}</button></div>
        <div class="hint" style="margin-top:8px">${t('Third byte = DimCity number (DB02 → 102 in production), last byte = device from 11. Network equipment (switches) uses 1-10. Set the VLAN IDs in your GigaCore groups to these numbers — Luminex defaults to group × 100.', 'Derde byte = DimCity-nummer (DB02 → 102 bij productie), laatste byte = apparaat vanaf 11. Netwerkapparatuur (switches) gebruikt 1-10. Zet de VLAN-ID\'s in je GigaCore-groepen op deze nummers — Luminex gebruikt standaard groep × 100.')}</div></div>
        <div class="rb-group"><div class="rb-label">${t('Check', 'Controle')}</div>${issues.length ? `<div class="fent-issues">${issues.map(w => `<div class="fent-i ${w.level}">${I(w.level === 'err' ? 'alert' : w.level === 'warn' ? 'alert' : 'info', 13)}<b>${esc(w.owner)}</b> ${esc(w.ip)} — ${esc(t(w.en, w.nl))}</div>`).join('')}</div>` : `<div class="status-ok">${I('checkCircle', 13)} ${t('All addresses fit the scheme.', 'Alle adressen passen in het schema.')}</div>`}</div>
`;
    }
    return App.ui.card({ key:'net-fent', title:'FENT', icon:'network', meta:c.on ? (c.group === 'production' ? t('production', 'productie') : t('location', 'locatie')) : '', collapsible:false, body });
  }
  function bindPlanner(root, rerender){
    const stdOf = id => F().LUMINEX.concat(F().VLANS).find(v => v.id === Number(id));
    root.querySelectorAll('.vlanName').forEach(i => i.onchange = () => {
      const c = cfg(), id = Number(i.dataset.vlan), val = i.value.trim(), cv = (c.customVlans || []).find(v => Number(v.id) === id);
      if(cv){ cv.name = val || `VLAN ${id}`; }
      else { c.vlanNames ||= {}; if(!val || val === stdOf(id)?.name) delete c.vlanNames[id]; else c.vlanNames[id] = val; }
      M().ui.dirty = true; rerender();
    });
    root.querySelectorAll('.vlanColor').forEach(i => i.onchange = () => {
      const c = cfg(), id = Number(i.dataset.vlan), cv = (c.customVlans || []).find(v => Number(v.id) === id);
      if(cv) cv.color = i.value; else { c.vlanColors ||= {}; if(i.value.toLowerCase() === (stdOf(id)?.color || '').toLowerCase()) delete c.vlanColors[id]; else c.vlanColors[id] = i.value; }
      M().ui.dirty = true; rerender();
    });
    root.querySelectorAll('.vlanReset').forEach(b => b.onclick = () => { const c = cfg(); delete (c.vlanNames || {})[b.dataset.vlan]; delete (c.vlanColors || {})[b.dataset.vlan]; M().ui.dirty = true; rerender(); });
    root.querySelectorAll('.vlanDel').forEach(b => b.onclick = () => { const c = cfg(); c.customVlans = (c.customVlans || []).filter(v => Number(v.id) !== Number(b.dataset.vlan)); M().ui.dirty = true; rerender(); });
    const va = root.querySelector('#vlanAdd'); if(va) va.onclick = () => {
      const id = Number(root.querySelector('#vlanNewId').value), name = root.querySelector('#vlanNewName').value.trim();
      if(!Number.isInteger(id) || id < 1 || id > 4094){ App.ui.toast(t('Give a VLAN ID between 1 and 4094', 'Geef een VLAN-ID tussen 1 en 4094'), 'err'); return; }
      if(F().vlanList(cfg().vlanMode).some(v => v.id === id)){ App.ui.toast(t(`VLAN ${id} exists already`, `VLAN ${id} bestaat al`), 'err'); return; }
      const c = cfg(); (c.customVlans ||= []).push({ id, name:name || `VLAN ${id}`, color:'#94a3b8' }); M().ui.dirty = true; rerender();
    };
    root.querySelectorAll('[data-fent-sw]').forEach(i => i.onchange = () => { cfg()[i.dataset.fentSw] = i.checked; M().ui.dirty = true; rerender(); });
    root.querySelectorAll('[data-fent-mode] button').forEach(b => b.onclick = () => { cfg().vlanMode = b.dataset.v; M().ui.dirty = true; rerender(); });
    root.querySelectorAll('[data-fent-group] button').forEach(b => b.onclick = () => { cfg().group = b.dataset.v; M().ui.dirty = true; rerender(); });
    const ap = root.querySelector('[data-fent-apply]'); if(ap) ap.onclick = async () => { await applyAll(App.sortedDims()); rerender(); };
  }

  window.FentUI = { deviceBlock, bindDevice, vlanCard, plannerCard, bindPlanner, portPlan, portTable, devices, applyAll, applyDim };
})();
