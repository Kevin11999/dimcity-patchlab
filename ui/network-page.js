// ui/network-page.js — the Network page: everything about the network in one place, in four tabs.
//   Switches & ports · VLAN & addresses · Fibres · Overview
// (Nodes and splitters are planned on the page "Nodes & Splitters"; the DimCity page only shows a summary.)
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const S = { tab:'ports', dc:null };
  const TABS = [['ports', 'Switches & ports', 'Switches & poorten', 'switchDev'], ['vlan', 'VLAN & addresses', 'VLAN & adressen', 'network'], ['fibers', 'Fibres', 'Fibers', 'cable'], ['overview', 'Overview', 'Overzicht', 'table']];

  // numbers per DimCity for the overview and the summary card
  function stats(dc){
    const rows = window.FentUI ? window.FentUI.portPlan(dc).rows : [];
    const sws = window.NetSwitches ? window.NetSwitches.list(dc) : [];
    const plan = App.net.getDimPlan(dc);
    const cap = sws.reduce((n, s) => n + s.rj, 0), sfp = sws.reduce((n, s) => n + s.sfp, 0);
    const fibers = window.Fibers ? window.Fibers.links(dc).length : 0;
    const cLines = (M().netLines || []).filter(n => n.dimcity === dc).length;
    const over = rows.filter(r => r.over).length;
    const noIp = (plan.nodes || []).filter(n => !n.ip).length;
    return { nodes:(plan.nodes || []).length, switches:sws.length, planSwitches:(plan.switches || []).length, used:rows.length, cap, sfp, cLines, fibers, over, noIp };
  }
  const status = st => !st.switches ? { cls:'err', text:t('no switch', 'geen switch') } : st.over ? { cls:'err', text:t(`${st.over} ports short`, `${st.over} poorten te weinig`) } : st.noIp ? { cls:'warn', text:t(`${st.noIp} nodes without address`, `${st.noIp} nodes zonder adres`) } : { cls:'ok', text:t('ready', 'klaar') };

  // the short card on the DimCity page
  function summaryCard(dc){
    const st = stats(dc), s = status(st);
    const body = `<div class="net-sum"><div class="net-sum-row"><span><b>${st.switches}</b> ${t('switches', 'switches')}</span><span><b>${st.used}</b>/${st.cap || '—'} ${t('ports used', 'poorten in gebruik')}</span><span><b>${st.cLines}</b> ${t('network cable lines', 'netwerkkabellijnen')}</span><span><b>${st.fibers}</b> ${t('fibres', 'fibers')}</span><span class="net-st ${s.cls}">${esc(s.text)}</span></div>
      <button data-cmd="network" data-arg="${esc(dc)}">${I('network', 14)}${t('Open Network', 'Open Netwerk')}</button></div>`;
    return App.ui.card({ key:`${dc}:netsum`, title:t('Network', 'Netwerk'), icon:'switchDev', meta:s.text, body, collapsible:false });
  }

  function dcBar(){
    const dims = App.sortedDims(); if(!S.dc || !dims.includes(S.dc)) S.dc = dims[0] || null;
    return `<div class="rb-chips" style="margin:0 0 12px">${dims.map(d => `<label class="rb-chip ${S.dc === d ? 'on' : ''}"><input type="radio" name="netdc" data-netdc="${esc(d)}" ${S.dc === d ? 'checked' : ''}><i class="dot" style="background:${App.dimColor(d)}"></i>${esc(d)}</label>`).join('')}<button class="sm ghost" data-cmd="addDb">${I('plus', 12)} DB</button>${dims.includes('FOH') ? '' : `<button class="sm ghost" data-cmd="addFoh">${I('plus', 12)} FOH</button>`}</div>`;
  }
  function portsTab(){
    const dc = S.dc; if(!dc) return `<div class="empty"><p>${t('Import a patch first.', 'Importeer eerst een patch.')}</p></div>`;
    const rows = window.FentUI.portPlan(dc).rows;
    return `${dcBar()}<div class="stack">${window.NetSwitches.card(dc)}
      ${App.ui.card({ key:`${dc}:netports`, title:t('Port plan', 'Poortplan'), icon:'table', meta:`${rows.length} ${t('ports', 'poorten')}`, collapsible:false, body:`<div style="padding:4px 14px 12px">${window.FentUI.portTable(dc)}</div>` })}
      ${window.NetCables?.card(dc) || ''}</div>`;
  }
  function addressTable(){
    const out = [];
    for(const dc of App.sortedDims()) for(const { kind, dev } of window.FentUI.devices(dc)){
      const eth = kind === 'node' ? Math.min(2, Math.max(1, Number((M().networkDevices.nodeTypes || []).find(x => x.id === dev.typeId)?.ethernetCount) || 1)) : 1;
      const ifs = window.Fent.ifaces(dev, eth);
      out.push(`<tr><td>${esc(dc)}</td><td><b>${esc(dev.id || dev.name || kind)}</b> <span class="subtle">${kind === 'node' ? t('node', 'node') : t('splitter', 'splitter')}</span></td><td>${ifs.map(x => `${x.vlan != null && window.NetCables ? window.NetCables.vlanChip(x.vlan) : ''} <span class="mono">${esc(x.ip)}</span>${eth > 1 ? ` <span class="subtle">ETH${x.eth}</span>` : ''}`).join('<br>') || '<span class="subtle">—</span>'}</td></tr>`);
    }
    for(const dc of App.sortedDims()) for(const s of (window.NetSwitches.list(dc))) if(s.source === 'plan'){
      const ifs = window.Fent.ifaces(s.dev, 1);
      out.push(`<tr><td>${esc(dc)}</td><td><b>${esc(s.label)}</b> <span class="subtle">${t('switch', 'switch')}</span></td><td>${ifs.map(x => `${x.vlan != null && window.NetCables ? window.NetCables.vlanChip(x.vlan) : ''} <span class="mono">${esc(x.ip)}</span>`).join('<br>') || '<span class="subtle">—</span>'}</td></tr>`);
    }
    return out.length ? `<table class="data-table"><thead><tr><th>DimCity</th><th>${t('Device', 'Apparaat')}</th><th>${t('Addresses', 'Adressen')}</th></tr></thead><tbody>${out.join('')}</tbody></table>` : `<div class="subtle" style="padding:8px 0">${t('No addresses yet.', 'Nog geen adressen.')}</div>`;
  }
  function vlanTab(){
    return `<div class="stack">${window.FentUI.vlanCard()}${window.FentUI.plannerCard({ ports:false })}
      ${App.ui.card({ key:'net-addr', title:t('All addresses', 'Alle adressen'), icon:'table', collapsible:false, body:`<div style="padding:4px 14px 12px">${addressTable()}<div class="hint" style="margin-top:8px">${I('info', 13)} ${t('Change an address on the DimCity page, in the node card.', 'Wijzig een adres op de DimCity-pagina, in de nodekaart.')}</div></div>` })}</div>`;
  }
  function fibersTab(){
    const F = window.Fibers;
    const top = App.ui.card({ key:'net-fibstock', title:t('Fibre stock and auto-assign', 'Fiberoverzicht en automatisch koppelen'), icon:'layers', collapsible:false, body:`<div style="padding:8px 14px 14px">${F.stockCard()}<div class="su-row" style="margin-top:10px"><button class="primary" id="fibAuto">${I('check', 14)}${t('Auto-assign fibres…', 'Fibers automatisch koppelen…')}</button><button id="fibView">${I('cable', 14)}${t('Draw in the fibre overview', 'Tekenen in het fiber-overzicht')}</button></div></div>` });
    return `<div class="stack">${top}${window.Fibers.card()}
      ${App.ui.card({ key:'net-cabletypes', title:t('Cable types', 'Kabeltypes'), icon:'cable', meta:`${(M().networkDevices.cableTypes || []).length}`, collapsible:false, body:`<div style="padding:8px 14px 12px">${(M().networkDevices.cableTypes || []).map(ty => `<div class="subtle" style="font-size:12.5px;margin:2px 0"><span class="fent-sw" style="background:${esc(ty.color || '#22c3d6')}"></span>${esc([ty.brand, ty.name].filter(Boolean).join(' '))} · ${esc(ty.connA || '')} · ${Number(ty.lengthM) || 0} m</div>`).join('') || `<div class="subtle">${t('None yet.', 'Nog geen.')}</div>`}<button class="sm" data-cmd="deviceBuilder" data-arg="cable" style="margin-top:8px">${I('plus', 13)}${t('Make cable types', 'Kabeltypes maken')}</button></div>` })}</div>`;
  }
  function overviewTab(){
    const rows = App.sortedDims().map(dc => { const st = stats(dc), s = status(st); return `<tr><td><i class="dot" style="background:${App.dimColor(dc)}"></i> <b>${esc(dc)}</b></td><td class="num">${st.nodes}</td><td class="num">${st.switches}</td><td class="num">${st.used} / ${st.cap || '—'}</td><td class="num">${st.cLines}</td><td class="num">${st.fibers}</td><td><span class="net-st ${s.cls}">${esc(s.text)}</span></td><td><button class="sm ghost" data-netopen="${esc(dc)}">${t('Open', 'Open')}</button></td></tr>`; }).join('');
    return `<div class="stack">${App.ui.card({ key:'net-over', title:t('Network per DimCity', 'Netwerk per DimCity'), icon:'table', collapsible:false, body:`<table class="data-table"><thead><tr><th>DimCity</th><th class="num">${t('Nodes', 'Nodes')}</th><th class="num">${t('Switches', 'Switches')}</th><th class="num">${t('Ports used', 'Poorten')}</th><th class="num">${t('Cat lines', 'Cat-lijnen')}</th><th class="num">${t('Fibres', 'Fibers')}</th><th>${t('Status', 'Status')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` })}
      <div class="hint">${I('info', 13)} ${t('Not sure where to start? Use Setup (toolbar) for the steps in order.', 'Weet je niet waar je moet beginnen? Gebruik Setup (werkbalk) voor de stappen op volgorde.')}</div></div>`;
  }

  function render(opts = {}){
    const root = App.$('#lkDetail'); if(!root) return;
    if(opts.tab) S.tab = opts.tab; if(opts.dc) S.dc = opts.dc;
    { const dims = App.sortedDims(); if(!S.dc || !dims.includes(S.dc)) S.dc = dims[0] || null; }
    App.pageHead?.({ eyebrow:'Project', title:t('Network', 'Netwerk'), sub:t('Switches and ports, VLANs and addresses, and fibres — everything about the network in one place.', 'Switches en poorten, VLAN\'s en adressen, en fibers — alles over het netwerk op één plek.'),
      actions:`<button data-cmd="setup">${I('check', 15)}${t('Setup', 'Setup')}</button>` });
    const tabs = `<div class="segmented net-tabs" id="netTabs">${TABS.map(([k, en, nl, ic]) => `<button data-tab="${k}" class="${S.tab === k ? 'active' : ''}">${I(ic, 14)}${t(en, nl)}</button>`).join('')}</div>`;
    const body = !window.FentUI || !window.NetSwitches || !window.Fibers ? '' : S.tab === 'vlan' ? vlanTab() : S.tab === 'fibers' ? fibersTab() : S.tab === 'overview' ? overviewTab() : portsTab();
    root.innerHTML = `${tabs}<div class="net-body">${body}</div>`;
    const again = () => { const keep = App.$('#mainScroll')?.scrollTop || 0; render(); const sc = App.$('#mainScroll'); if(sc) sc.scrollTop = keep; };
    root.querySelectorAll('#netTabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; render(); });
    root.querySelectorAll('[data-netdc]').forEach(i => i.onchange = () => { S.dc = i.dataset.netdc; render(); });
    root.querySelectorAll('[data-netopen]').forEach(b => b.onclick = () => { S.dc = b.dataset.netopen; S.tab = 'ports'; render(); });
    if(S.tab === 'ports' && S.dc){ window.NetSwitches.bind(root, S.dc, again); window.FentUI.bindDevice(root, S.dc, again); }
    if(S.tab === 'vlan') window.FentUI.bindPlanner(root, again);
    if(S.tab === 'fibers'){ window.Fibers.bind(root, again); window.Fibers.bindStock(root, again);
      const au = root.querySelector('#fibAuto'); if(au) au.onclick = () => window.Fibers.autoDialog(again);
      const fv = root.querySelector('#fibView'); if(fv) fv.onclick = () => window.Flow?.openFibres?.();
    }
  }
  window.NetworkPage = { render, summaryCard, stats, status, state:S };
})();
