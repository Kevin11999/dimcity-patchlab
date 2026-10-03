// ui/switches.js — network switches per DimCity and the automatic coupling of nodes and network cables to their ports.
// A switch of a DimCity lives in MODEL.networkDevices.dimCityPlans[dc].switches (type from the Device Builder, own
// addresses like a node). Switches that sit in a rack of the DimCity are used as well. Ports are given out in order:
// first the RJ45 of the nodes in node number order, then the lines of the network cables (C) that come into the DB.
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
      P.racks.forEach((R, ri) => { for(const it of (R.rack?.items || [])) if(it.kind === 'switch'){ const ty = types().find(x => x.id === it.typeId); if(!ty) continue; n++; out.push({ source:'rack', label:`R-SW${n}`, type:ty, rj:Number(ty.portCount) || 0, sfp:Number(ty.sfpCount) || 0, where:R.placement.name || R.rack?.name || `Rack ${ri + 1}` }); } });
    } catch {}
    return out;
  }
  // hand out RJ45 ports in order: rows come from FentUI.portPlan (nodes, then C lines) with a running number
  function assign(dc, rows){
    const sws = list(dc); if(!sws.length) return rows;
    let si = 0, used = 0;
    for(const r of rows){
      while(si < sws.length && used >= sws[si].rj){ si++; used = 0; }
      if(si >= sws.length){ r.sw = ''; r.swPort = null; r.over = true; continue; }
      used++; r.sw = sws[si].label; r.swPort = used; r.over = false;
    }
    return rows;
  }
  const usage = (dc, rows) => list(dc).map(s => ({ ...s, used:rows.filter(r => r.sw === s.label).length }));

  // ---- UI: the card on the DimCity page ----
  function portStrip(dc, s, rows){
    const mine = rows.filter(r => r.sw === s.label), byPort = new Map(mine.map(r => [r.swPort, r])), fib = window.Fibers && s.source === 'plan' ? window.Fibers.usage(dc, s.label) : (window.Fibers ? window.Fibers.usage(dc, s.label) : new Map());
    const sq = (n, kind) => { const f = kind === 'sfp' ? fib.get(n) : null; if(f) return `<span class="swp sfp on" style="--c:${window.Fibers.color(f)}" title="${esc(`SFP ${n} · ${f.id} · ${window.Fibers.typeName(window.Fibers.typeOf(f.typeId))} · ${window.Fibers.endLabel(f.a?.dc === dc && f.a?.sw === s.label && Number(f.a?.sfp) === n ? f.b : f.a)}`)}"><i>${n}</i></span>`; const r = kind === 'rj' ? byPort.get(n) : null; const v = r?.vlans?.[0] != null ? window.Fent?.vlanById(r.vlans[0]) : null;
      return `<span class="swp ${kind} ${r ? 'on' : ''}" style="${v?.color ? `--c:${v.color}` : ''}" title="${esc(kind === 'sfp' ? `SFP ${n}` : `${t('Port', 'Poort')} ${n}${r ? ` · ${r.device}${r.ethCount > 1 ? ` ETH${r.eth}` : ''}` : ` · ${t('free', 'vrij')}`}`)}"><i>${n}</i></span>`; };
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
    const summary = `<div class="hint ${sws.length && need > cap ? 'fent-bad' : ''}" style="margin:8px 0">${sws.length && need > cap ? I('alert', 13) : I('info', 13)} ${need} ${t('ports needed', 'poorten nodig')} · ${cap} RJ45 ${t('available', 'beschikbaar')}. ${t('Nodes first (in node number order), then the network cables (C).', 'Eerst de nodes (op volgorde van nodenummer), dan de netwerkkabels (C).')}</div>`;
    const body = tools + (sws.length ? summary : '') + `<div class="network-device-list">${sws.map(s => {
      const ty = s.type, un = rows.filter(r => r.sw === s.label).length;
      const head = `<div class="network-instance-head"><div><b>${esc(s.label)}</b> <span class="muted">${esc(s.dev?.name || '')}${s.where ? esc(` ${t('in', 'in')} ${s.where}`) : ''}</span><div class="subtle" style="font-size:12px">${esc(typeName(ty))} · ${s.rj} RJ45${s.sfp ? ` + ${s.sfp} SFP` : ''} · ${un}/${s.rj} ${t('used', 'gebruikt')}${s.source === 'rack' ? ` · ${t('from the rack', 'uit het rek')}` : ''}</div></div>${s.source === 'plan' ? `<button class="sm danger dimRemoveSwitch" data-i="${s.idx}">${I('trash', 13)}${t('Remove', 'Verwijderen')}</button>` : ''}</div>`;
      const fields = s.source === 'plan' ? `<div class="network-instance-fields"><label>ID<input class="dimSwitchField" data-i="${s.idx}" data-field="id" value="${esc(s.dev.id || '')}"></label><label>${t('Name', 'Naam')}<input class="dimSwitchField" data-i="${s.idx}" data-field="name" value="${esc(s.dev.name || '')}"></label>
        <label>${t('IP address', 'IP-adres')}<input class="dimSwitchField" data-i="${s.idx}" data-field="ip" value="${esc(s.dev.ip || '')}" inputmode="numeric" placeholder="10.90.101.2"></label><label>Subnet<input class="dimSwitchField" data-i="${s.idx}" data-field="subnet" value="${esc(s.dev.subnet || ty.subnet || '255.255.255.0')}" inputmode="numeric"></label></div>${window.FentUI?.deviceBlock(dc, 'switch', s.idx, s.dev) || ''}` : '';
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
      if(M().networkDevices?.prefs?.fent?.on && window.Fent){ const c = M().networkDevices.prefs.fent; sw.ip = window.Fent.suggestEquipment(window.Fent.roleVlan('management', c.vlanMode), c.group, (/(\d+)/.exec(dc) || [0, 1])[1], n); sw.subnet = window.Fent.MASK; sw.ipRole = 'management'; sw.ipVlan = window.Fent.roleVlan('management', c.vlanMode); }
      p.switches.push(sw); M().ui.dirty = true; rerender();
    };
    root.querySelectorAll('.dimRemoveSwitch').forEach(b => b.onclick = () => { plan(dc).switches.splice(Number(b.dataset.i), 1); M().ui.dirty = true; rerender(); });
    root.querySelectorAll('.dimSwitchField').forEach(inp => inp.onchange = () => { const sw = plan(dc).switches[Number(inp.dataset.i)]; if(!sw) return; sw[inp.dataset.field] = inp.value.trim(); M().ui.dirty = true; if(inp.dataset.field === 'ip' || inp.dataset.field === 'subnet') rerender(); });
  }
  window.NetSwitches = { list, assign, usage, card, bind, typeName };
})();
