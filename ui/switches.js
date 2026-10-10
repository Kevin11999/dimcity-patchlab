// ui/switches.js — network switches per DimCity and the ports their devices sit on.
// A switch of a DimCity lives in MODEL.networkDevices.dimCityPlans[dc].switches (type from the Device Builder, own
// addresses like a node). Switches that sit in a rack of the DimCity are used as well; their addresses live in
// dimCityPlans[dc].rackDev['<placement>|<item>']. Which device sits on which port is what you placed (PortPlan, portPatch[dc].manual):
// nothing is moved by itself; "Auto-fill" on the patch board fills the free ports once, in the order of your choice.
// Two switches can be linked through RJ45 ports (networkDevices.swLinks, a trunk): those ports are taken.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const plan = dc => App.net.getDimPlan(dc);
  const types = () => M().networkDevices?.switchTypes || [];
  const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';

  // all switches that serve a DimCity, plan switches first, then switches in its racks
  function list(dc){
    const out = [];
    (plan(dc).switches || []).forEach((sw, idx) => { const ty = types().find(x => x.id === sw.typeId) || {}; out.push({ source:'plan', idx, dev:sw, label:sw.id || `SW${idx + 1}`, type:ty, rj:Number(ty.portCount) || 0, sfp:Number(ty.sfpCount) || 0, where:'' }); });
    try {
      const P = window.RackEngine.computeRackPlan(M(), dc); let n = 0;
      const rd = (plan(dc).rackDev ||= {});
      P.racks.forEach((R, ri) => { for(const it of (R.rack?.items || [])) if(it.kind === 'switch'){ const ty = types().find(x => x.id === it.typeId); if(!ty) continue; n++; const key = `${R.placement.iid}|${it.iid}`; out.push({ source:'rack', key, dev:(rd[key] ||= { id:'', name:'', ip:'', subnet:'', ifaces:[] }), rackTypeId:R.rack?.id, itemIid:it.iid, label:`R-SW${n}`, type:ty, rj:Number(ty.portCount) || 0, sfp:Number(ty.sfpCount) || 0, where:R.placement.name || R.rack?.name || `Rack ${ri + 1}` }); } });
    } catch {}
    return out;
  }
  // ---- switch links: two switches connected through RJ45 ports (a trunk). networkDevices.swLinks = [{ id, a:{ dc, sw, port }, b:{ dc, sw, port } }] ----
  const linkStore = () => { const nd = M().networkDevices; return (nd.swLinks ||= []); };
  // the links that end on a switch of this DimCity: [{ id, sw, port, to:{ dc, sw, port } }]
  function linksOf(dc){
    const out = [];
    for(const l of linkStore()){ if(l.a?.dc === dc) out.push({ id:l.id, sw:l.a.sw, port:Number(l.a.port), to:l.b }); if(l.b?.dc === dc) out.push({ id:l.id, sw:l.b.sw, port:Number(l.b.port), to:l.a }); }
    return out;
  }
  const linkAt = (dc, sw, port) => linksOf(dc).find(l => l.sw === sw && l.port === Number(port)) || null;
  function addLink(a, b){
    if(!a?.sw || !b?.sw || (a.dc === b.dc && a.sw === b.sw)) return 'Pick two different switches';
    for(const x of [a, b]){ const sw = list(x.dc).find(s => s.label === x.sw); if(!sw || x.port < 1 || x.port > sw.rj) return 'That port does not exist'; if(linkAt(x.dc, x.sw, x.port)) return 'That port is in a link already'; }
    // a device that sat on one of the two ports goes back to the tray
    for(const x of [a, b]){ const pm = window.PortPlan?.patch(x.dc).manual || {}; for(const [k, v] of Object.entries(pm)) if(v?.sw === x.sw && Number(v.port) === Number(x.port)) window.PortPlan.unplace(x.dc, k); }
    const nd = M().networkDevices, n = linkStore().reduce((m, l) => Math.max(m, Number(String(l.id).replace(/\D/g, '')) || 0), 0) + 1;
    linkStore().push({ id:`L${n}`, a:{ dc:a.dc, sw:a.sw, port:Number(a.port) }, b:{ dc:b.dc, sw:b.sw, port:Number(b.port) } }); if(M().ui) M().ui.dirty = true; return '';
  }
  function removeLink(id){ const nd = M().networkDevices; nd.swLinks = linkStore().filter(l => l.id !== id); if(M().ui) M().ui.dirty = true; }
  // the switches of a DimCity chained with their last free RJ45 ports (SW1 ↔ SW2, SW2 ↔ SW3 …)
  function autoLink(dc){
    const sws = list(dc); let made = 0;
    const lastFree = (s, skip = []) => { for(let p = s.rj; p >= 1; p--) if(!linkAt(dc, s.label, p) && !skip.includes(p) && !devAt(dc, s.label, p)) return p; for(let p = s.rj; p >= 1; p--) if(!linkAt(dc, s.label, p) && !skip.includes(p)) return p; return 0; };
    for(let i = 0; i + 1 < sws.length; i++){
      if(linksOf(dc).some(l => (l.sw === sws[i].label && l.to.sw === sws[i + 1].label && l.to.dc === dc) || (l.sw === sws[i + 1].label && l.to.sw === sws[i].label && l.to.dc === dc))) continue;
      const pa = lastFree(sws[i]), pb = lastFree(sws[i + 1]); if(!pa || !pb) continue;
      if(!addLink({ dc, sw:sws[i].label, port:pa }, { dc, sw:sws[i + 1].label, port:pb })) made++;
    }
    return made;
  }
  // which device row sits on a port right now (from the current port plan)
  const devAt = (dc, sw, port) => (window.FentUI ? window.FentUI.portPlanBase(dc).rows : []).find(r => r.sw === sw && r.swPort === Number(port)) || null;

  // Which device sits on which port: what was placed by hand (pt.manual: key → { sw, port }). Nothing else: a device without an entry
  // has no port yet (it waits in the tray). Ports taken by a switch link are not free.
  function assign(dc, rows, pt){
    const sws = list(dc); pt = pt || { manual:{} };
    const taken = new Map(sws.map(s => [s.label, new Set()]));
    for(const l of linksOf(dc)) taken.get(l.sw)?.add(l.port);
    for(const r of rows){
      r.sw = ''; r.swPort = null; r.over = false; r.unplaced = true; r.manual = false;
      const m = pt.manual?.[r.key]; if(!m?.sw) continue;
      const s = sws.find(x => x.label === m.sw), set = taken.get(m.sw);
      if(s && m.port >= 1 && m.port <= s.rj && !set.has(m.port)){ set.add(m.port); r.sw = m.sw; r.swPort = m.port; r.unplaced = false; r.manual = true; }
    }
    return rows;
  }
  // The way projects of 0.12 and older filled the ports (in order, by itself): only used once, to freeze what such a project showed.
  function legacyAssign(dc, rows, pt){
    const sws = list(dc); if(!sws.length) return rows;
    pt = pt || { manual:{}, auto:true };
    const taken = new Map(sws.map(s => [s.label, new Set()])), todo = [];
    for(const r of rows){
      const m = pt.manual?.[r.key];
      if(m){
        if(!m.sw){ r.sw = ''; r.swPort = null; continue; }
        const s = sws.find(x => x.label === m.sw), set = taken.get(m.sw);
        if(s && m.port >= 1 && m.port <= s.rj && !set.has(m.port)){ set.add(m.port); r.sw = m.sw; r.swPort = m.port; continue; }
      }
      todo.push(r);
    }
    if(pt.auto === false){ todo.forEach(r => { r.sw = ''; r.swPort = null; }); return rows; }
    let si = 0, port = 1;
    for(const r of todo){
      while(si < sws.length){ const set = taken.get(sws[si].label); while(port <= sws[si].rj && set.has(port)) port++; if(port <= sws[si].rj) break; si++; port = 1; }
      if(si >= sws.length){ r.sw = ''; r.swPort = null; continue; }
      taken.get(sws[si].label).add(port); r.sw = sws[si].label; r.swPort = port; port++;
    }
    return rows;
  }
  const usage = (dc, rows) => list(dc).map(s => ({ ...s, used:rows.filter(r => r.sw === s.label).length }));

  // ---- UI: the card on the DimCity page ----
  function portStrip(dc, s, rows){
    const mine = rows.filter(r => r.sw === s.label), byPort = new Map(mine.map(r => [r.swPort, r])), fib = window.Fibers ? window.Fibers.usage(dc, s.label) : new Map();
    const eff = new Map((window.PortPlan?.swPorts(dc, s) || []).map(p => [p.n, p]));
    const sq = (n, kind) => {
      const f = kind === 'sfp' ? fib.get(n) : null;
      if(f) return `<span class="swp sfp on" style="--c:${window.Fibers.color(f)}" title="${esc(`${window.SwPorts.label(s.type, n)} · ${f.id} · ${window.Fibers.typeName(window.Fibers.typeOf(f.typeId))} · ${window.Fibers.endLabel(f.a?.dc === dc && f.a?.sw === s.label && Number(f.a?.sfp) === n ? f.b : f.a)}`)}"><i>${window.SwPorts.short(s.type, n)}</i></span>`;
      const r = kind === 'rj' ? byPort.get(n) : null, p = kind === 'rj' ? eff.get(n) : null, vid = p ? (p.trunk ? null : p.vid) : r?.vlans?.[0], v = vid != null ? window.Fent?.vlanById(vid) : null, on = !!(r || (p && (p.trunk || p.vid != null)));
      return `<span class="swp ${kind} ${on ? 'on' : ''}" style="${p?.trunk ? '--c:#38bdf8' : v?.color ? `--c:${v.color}` : ''}" title="${esc(kind === 'sfp' ? window.SwPorts.label(s.type, n) : `${t('Port', 'Poort')} ${n}${r ? ` · ${r.device}${r.ethCount > 1 ? ` ETH${r.eth}` : ''}` : ` · ${t('free', 'vrij')}`}${p?.trunk ? ' · Trunk' : v ? ` · ${v.id} ${v.name}` : ''}${p?.name ? ` · ${p.name}` : ''}`)}"><i>${n}</i></span>`;
    };
    return `<div class="swp-strip">${Array.from({ length:s.rj }, (_, i) => sq(i + 1, 'rj')).join('')}${s.sfp ? `<span class="swp-gap"></span>${Array.from({ length:s.sfp }, (_, i) => sq(i + 1, 'sfp')).join('')}` : ''}</div>`;
  }
  function card(dc){
    const nd = M().networkDevices, ts = nd?.switchTypes || [], sws = list(dc);
    const rows = window.FentUI ? window.FentUI.portPlan(dc).rows : [];
    const opts = ts.map(ty => `<option value="${esc(ty.id)}">${esc(typeName(ty))} · ${Number(ty.portCount) || 0} RJ45${Number(ty.sfpCount) ? ` + ${Number(ty.sfpCount)} SFP` : ''}</option>`).join('');
    const tools = `<div class="planner-controls"><label>${t('Switch type', 'Switchtype')}<select id="dimSwitchType">${opts || `<option value="">${t('No switch types yet', 'Nog geen switchtypes')}</option>`}</select></label>
      <button id="dimAddSwitch" ${ts.length ? '' : 'disabled'}>${I('plus', 14)}${t('Add switch', 'Switch toevoegen')}</button></div>
      ${ts.length ? '' : `<div class="hint">${I('info', 13)} ${t('Create a switch type in the Device Builder first.', 'Maak eerst een switchtype in de Device Builder.')} <a data-cmd="deviceBuilder">${t('Open Device Builder', 'Open Device Builder')}</a></div>`}`;
    const need = rows.length, cap = sws.reduce((n, s) => n + s.rj, 0);
    const summary = `<div class="hint ${sws.length && need > cap ? 'fent-bad' : ''}" style="margin:8px 0">${sws.length && need > cap ? I('alert', 13) : I('info', 13)} ${need} ${t('devices need a port', 'apparaten hebben een poort nodig')} · ${cap} RJ45 ${t('available', 'beschikbaar')}. ${t('Which device sits on which port is set on the Patch board.', 'Welk apparaat op welke poort zit stel je in op het Patchbord.')}</div>`;
    const body = tools + (sws.length ? summary : '') + `<div class="network-device-list">${sws.map(s => {
      const ty = s.type, un = rows.filter(r => r.sw === s.label).length;
      const head = `<div class="network-instance-head"><div><b>${esc(s.label)}</b> <span class="muted">${esc(s.dev?.name || '')}${s.where ? esc(` ${t('in', 'in')} ${s.where}`) : ''}</span><div class="subtle" style="font-size:12px">${esc(typeName(ty))} · ${s.rj} RJ45${s.sfp ? ` + ${s.sfp} SFP` : ''} · ${un}/${s.rj} ${t('used', 'gebruikt')}${s.source === 'rack' ? ` · ${t('from the rack', 'uit het rek')}` : ''}</div></div>${s.source === 'plan' ? `<button class="sm danger dimRemoveSwitch" data-i="${s.idx}">${I('trash', 13)}${t('Remove', 'Verwijderen')}</button>` : `<button class="sm danger dimRemoveRackSwitch" data-rack="${esc(s.rackTypeId || '')}" data-iid="${esc(s.itemIid || '')}" title="${esc(t('This switch is part of a rack. Remove it from the rack.', 'Deze switch zit in een rek. Haal hem uit het rek.'))}">${I('trash', 13)}${t('Remove from rack', 'Uit rek halen')}</button>`}</div>`;
      const fields = s.source === 'plan' ? `<div class="network-instance-fields"><label>ID<input class="dimSwitchField" data-i="${s.idx}" data-field="id" value="${esc(s.dev.id || '')}"></label><label>${t('Name', 'Naam')}<input class="dimSwitchField" data-i="${s.idx}" data-field="name" value="${esc(s.dev.name || '')}"></label>
        <label>${t('IP address', 'IP-adres')}<input class="dimSwitchField" data-i="${s.idx}" data-field="ip" value="${esc(s.dev.ip || '')}" inputmode="numeric" placeholder="10.90.101.2"></label><label>Subnet<input class="dimSwitchField" data-i="${s.idx}" data-field="subnet" value="${esc(s.dev.subnet || ty.subnet || '255.255.255.0')}" inputmode="numeric"></label></div>${window.FentUI?.deviceBlock(dc, 'switch', s.idx, s.dev) || ''}`
        : `<div class="network-instance-fields"><label>${t('Name', 'Naam')}<input class="dimRackSwField" data-key="${esc(s.key)}" data-field="name" value="${esc(s.dev.name || '')}" placeholder="${esc(s.label)}"></label>
        <label>${t('IP address', 'IP-adres')}<input class="dimRackSwField" data-key="${esc(s.key)}" data-field="ip" value="${esc(s.dev.ip || '')}" inputmode="numeric" placeholder="10.90.101.2"></label><label>Subnet<input class="dimRackSwField" data-key="${esc(s.key)}" data-field="subnet" value="${esc(s.dev.subnet || ty.subnet || '255.255.255.0')}" inputmode="numeric"></label></div>${window.FentUI?.deviceBlock(dc, 'rswitch', s.key, s.dev) || ''}`;
      return `<div class="network-instance switch-instance" style="--device-color:${esc(/^#[0-9a-f]{6}$/i.test(ty.color || '') ? ty.color : '#35c47c')}">${head}${fields}${portStrip(dc, s, rows)}</div>`;
    }).join('') || `<div class="device-list-empty">${t('No switches yet. Add a switch to give the nodes and network cables their ports.', 'Nog geen switches. Voeg een switch toe om de nodes en netwerkkabels hun poorten te geven.')}</div>`}</div>`;
    return App.ui.card({ key:`${dc}:switches`, title:t('Network switches', 'Netwerkswitches'), icon:'switchDev', meta:`${sws.length} ${t('switches', 'switches')} · ${need} ${t('ports used', 'poorten in gebruik')}`, body, collapsed:!sws.length && !need });
  }
  function bind(root, dc, rerender){
    const add = root.querySelector('#dimAddSwitch');
    if(add) add.onclick = () => {
      const ty = types().find(x => x.id === root.querySelector('#dimSwitchType')?.value) || types()[0]; if(!ty) return;
      const p = plan(dc); p.switches ||= []; const n = p.switches.length + 1;
      const sw = { id:`${dc}-SW${n}`, name:`${dc} ${typeName(ty)}`, typeId:ty.id, ip:'', subnet:ty.subnet || '', ifaces:[] };
      if(M().networkDevices?.prefs?.fent?.on && window.Fent){ const c = M().networkDevices.prefs.fent; sw.ip = window.Fent.suggestEquipment(window.Fent.roleVlan('management', c.vlanMode), c.group, App.dimSlot(dc), n); sw.subnet = window.Fent.MASK; sw.ipRole = 'management'; sw.ipVlan = window.Fent.roleVlan('management', c.vlanMode); }
      p.switches.push(sw); M().ui.dirty = true; rerender();
    };
    root.querySelectorAll('.dimRemoveRackSwitch').forEach(b => b.onclick = async () => {
      const rt = (M().networkDevices.rackTypes || []).find(r => r.id === b.dataset.rack); if(!rt) return;
      const uses = Object.values(M().networkDevices.dimCityPlans || {}).reduce((n, p) => n + (p.racks || []).filter(r => r.rackId === rt.id).length, 0);
      const ok = await App.ui.confirmDialog({ title:t('Remove the switch from the rack?', 'Switch uit het rek halen?'), message:t(`The switch is part of the rack “${rt.name || rt.id}”, which is placed ${uses}× in this show. It is removed from that rack everywhere (the other devices stay).`, `De switch zit in het rek “${rt.name || rt.id}”, dat ${uses}× in deze show is geplaatst. Hij wordt overal uit dat rek gehaald (de andere devices blijven).`), okLabel:t('Remove', 'Verwijderen'), danger:true });
      if(!ok) return;
      rt.items = (rt.items || []).filter(it => it.iid !== b.dataset.iid); M().ui.dirty = true; rerender();
    });
    root.querySelectorAll('.dimRemoveSwitch').forEach(b => b.onclick = () => { plan(dc).switches.splice(Number(b.dataset.i), 1); M().ui.dirty = true; rerender(); });
    root.querySelectorAll('.dimRackSwField').forEach(inp => inp.onchange = () => { const s = list(dc).find(x => x.key === inp.dataset.key); if(!s) return; s.dev[inp.dataset.field] = inp.value.trim(); M().ui.dirty = true; if(inp.dataset.field === 'ip' || inp.dataset.field === 'subnet') rerender(); });
    root.querySelectorAll('.dimSwitchField').forEach(inp => inp.onchange = () => { const sw = plan(dc).switches[Number(inp.dataset.i)]; if(!sw) return; sw[inp.dataset.field] = inp.value.trim(); M().ui.dirty = true; if(inp.dataset.field === 'ip' || inp.dataset.field === 'subnet') rerender(); });
  }
  window.NetSwitches = { list, assign, legacyAssign, usage, card, bind, typeName, linksOf, linkAt, addLink, removeLink, autoLink };
})();
