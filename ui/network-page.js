// ui/network-page.js — the Network page: everything about the network in one place, in six tabs.
//   Patch board · Nodes · Switches · Addresses · Fibres · Overview
//   Patch board  every switch drawn like its front; drag a node or cable onto a port (the first thing you do)
//   Nodes        every DMX node: the universes on its ports with the names of the LKs and Veams, and where it is plugged in
//   Switches     the switches themselves: address, VLAN / trunk per port, copying settings, links between switches
//   Addresses    every address of every network device in one table, the automatic IP plan, the checks (duplicates …) and the VLANs
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const S = { tab:'patch', dc:null };
  const ALL = '*';
  const TABS = [['patch', 'Patch board', 'Patchbord', 'plug'], ['nodes', 'Nodes', 'Nodes', 'network'], ['switches', 'Switches', 'Switches', 'switchDev'], ['addr', 'Addresses', 'Adressen', 'table'], ['fibers', 'Fibres', 'Fibers', 'cable'], ['overview', 'Overview', 'Overzicht', 'layers']];

  // numbers per DimCity for the overview and the summary card
  function stats(dc){
    const rows = window.FentUI ? window.FentUI.portPlan(dc).rows : [];
    const sws = window.NetSwitches ? window.NetSwitches.list(dc) : [];
    const plan = App.net.getDimPlan(dc);
    const cap = sws.reduce((n, s) => n + s.rj, 0), sfp = sws.reduce((n, s) => n + s.sfp, 0);
    const fibers = window.Fibers ? window.Fibers.links(dc).length : 0;
    const cLines = (M().netLines || []).filter(n => n.dimcity === dc).length;
    const unplaced = rows.filter(r => r.unplaced).length, over = Math.max(0, rows.length - cap);
    const noIp = (plan.nodes || []).filter(n => !n.ip).length;
    return { nodes:(plan.nodes || []).length, switches:sws.length, planSwitches:(plan.switches || []).length, used:rows.length - unplaced, need:rows.length, cap, sfp, cLines, fibers, over, unplaced, noIp };
  }
  const status = st => !st.switches && st.need ? { cls:'err', text:t('no switch', 'geen switch') } : st.over ? { cls:'err', text:t(`${st.over} ports short`, `${st.over} poorten te weinig`) } : st.unplaced ? { cls:'warn', text:t(`${st.unplaced} devices without a port`, `${st.unplaced} apparaten zonder poort`) } : st.noIp ? { cls:'warn', text:t(`${st.noIp} nodes without address`, `${st.noIp} nodes zonder adres`) } : { cls:'ok', text:t('ready', 'klaar') };

  // the short card on the DimCity page
  function summaryCard(dc){
    const st = stats(dc), s = status(st);
    const body = `<div class="net-sum"><div class="net-sum-row"><span><b>${st.switches}</b> ${t('switches', 'switches')}</span><span><b>${st.used}</b>/${st.need || '—'} ${t('devices on a port', 'apparaten op een poort')}</span><span><b>${st.cLines}</b> ${t('network cable lines', 'netwerkkabellijnen')}</span><span><b>${st.fibers}</b> ${t('fibres', 'fibers')}</span><span class="net-st ${s.cls}">${esc(s.text)}</span></div>
      <button data-cmd="network" data-arg="${esc(dc)}">${I('network', 14)}${t('Open Network', 'Open Netwerk')}</button></div>`;
    return App.ui.card({ key:`${dc}:netsum`, title:t('Network', 'Netwerk'), icon:'switchDev', meta:s.text, body, collapsible:false });
  }

  // which DimCity(s) a tab shows: one, or all of them
  function dcBar(allOk){
    const dims = App.sortedDims(); if(!S.dc || (S.dc !== ALL && !dims.includes(S.dc)) || (S.dc === ALL && !allOk)) S.dc = dims[0] || null;
    const chip = (v, label, color) => `<label class="rb-chip ${S.dc === v ? 'on' : ''}"><input type="radio" name="netdc" data-netdc="${esc(v)}" ${S.dc === v ? 'checked' : ''}>${color ? `<i class="dot" style="background:${color}"></i>` : ''}${esc(label)}</label>`;
    return `<div class="rb-chips" style="margin:0 0 12px">${allOk && dims.length > 1 ? chip(ALL, t('All', 'Alle')) : ''}${dims.map(d => chip(d, d, App.dimColor(d))).join('')}<button class="sm ghost" data-cmd="addDb">${I('plus', 12)} DB</button>${dims.includes('FOH') ? '' : `<button class="sm ghost" data-cmd="addFoh">${I('plus', 12)} FOH</button>`}</div>`;
  }
  const dcsOf = () => S.dc === ALL ? App.sortedDims() : S.dc ? [S.dc] : [];
  const dcHead = dc => `<div class="net-dc-h"><i class="dot" style="background:${App.dimColor(dc)}"></i><b>${esc(dc)}</b></div>`;
  const nothing = () => `<div class="empty"><p>${t('Import a patch first.', 'Importeer eerst een patch.')}</p></div>`;

  // ---- Patch board ----
  function patchTab(){
    if(!S.dc) return nothing();
    const dcs = dcsOf();
    return `${dcBar(true)}<div class="stack">${dcs.map(dc => `<div class="net-sec" data-dcsec="${esc(dc)}">${dcs.length > 1 ? dcHead(dc) : ''}${window.PortPlan.boardCard(dc)}</div>`).join('')}</div>`;
  }
  // ---- Nodes ----
  function nodesTab(){
    if(!S.dc) return nothing();
    return `${dcBar(true)}<div class="stack">${dcsOf().map(dc => `<div class="net-sec" data-dcsec="${esc(dc)}">${window.NetNodes.card(dc)}${window.PortPlan.nodesCard(dc)}</div>`).join('')}</div>`;
  }
  // ---- Switches ----
  function switchesTab(){
    if(!S.dc) return nothing();
    return `${dcBar(true)}<div class="stack">${dcsOf().map(dc => `<div class="net-sec" data-dcsec="${esc(dc)}">${dcsOf().length > 1 ? dcHead(dc) : ''}${window.PortPlan.switchesHtml(dc)}${window.NetSwitches.card(dc)}</div>`).join('')}<div data-netcables>${window.NetCables?.card(S.dc === ALL ? App.sortedDims()[0] : S.dc, { edit:true }) || ''}</div></div>`;
  }

  // ---- Addresses ----
  const lvl = { err:'bad', warn:'warn', info:'info' };
  function ipPlanCard(issues){
    const cfg = M().networkDevices.prefs.fent, F = window.Fent, errs = issues.filter(i => i.level === 'err'), warns = issues.filter(i => i.level === 'warn');
    const seg = (attr, cur, items) => `<div class="segmented" ${attr}>${items.map(([v, l]) => `<button data-v="${v}" class="${cur === v ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    const sw1 = `${F.suggestEquipment(F.roleVlan('management', cfg.vlanMode), cfg.group, 1, 1)}`, sw2 = `${F.suggestEquipment(F.roleVlan('management', cfg.vlanMode), cfg.group, 2, 1)}`;
    const body = `<div class="ad-plan"><div class="ad-opts"><div><div class="rb-label">${t('VLAN numbering', 'VLAN-nummering')}</div>${seg('data-fent-mode', cfg.vlanMode, [['luminex', t('Luminex groups (1, 200, 300 …)', 'Luminex-groepen (1, 200, 300 …)')], ['fent', t('FENT (1090, 1040 …)', 'FENT (1090, 1040 …)')]])}</div>
        <div><div class="rb-label">${t('Third number', 'Derde getal')}</div>${seg('data-fent-group', cfg.group, [['production', t('Production (101–199)', 'Productie (101–199)')], ['location', t('Location (1–99)', 'Locatie (1–99)')]])}</div>
        <label class="rb-row" style="align-self:end"><span>${t('Also a scan address per device', 'Ook een scanadres per apparaat')}</span><span class="switch"><input type="checkbox" data-fent-sw="scan" ${cfg.scan ? 'checked' : ''}><span></span></span></label></div>
      <div class="ad-rule">${I('info', 13)} <span>${t('<b>Switch 1 of every DB is .1</b>, switch 2 is .2 and so on (DB01: ' + sw1 + ', DB02: ' + sw2 + '). Nodes and splitters count on from .11. The management address is 10.90.x.x, the lighting address 10.40.x.x; the third number is the number of the DB.', '<b>Switch 1 van elke DB is .1</b>, switch 2 is .2 enzovoort (DB01: ' + sw1 + ', DB02: ' + sw2 + '). Nodes en splitters tellen door vanaf .11. Het beheeradres is 10.90.x.x, het lichtadres 10.40.x.x; het derde getal is het nummer van de DB.')}</span></div>
      <div class="ad-btns"><button class="primary" data-adplan>${I('check', 14)} ${t('Create the IP plan…', 'Maak het IP-plan…')}</button><span class="subtle">${t('You see what changes first.', 'Je ziet eerst wat er verandert.')}</span><span style="flex:1"></span>
        <span class="ad-check ${errs.length ? 'bad' : warns.length ? 'warn' : 'ok'}">${errs.length ? `${I('alert', 14)} ${errs.length} ${t('duplicate' + (errs.length > 1 ? 's' : ''), 'dubbel' + (errs.length > 1 ? 'e' : ''))}` : warns.length ? `${I('alert', 14)} ${warns.length} ${t('to check', 'om te controleren')}` : `${I('checkCircle', 14)} ${t('no duplicates, all addresses fit', 'geen dubbele adressen, alles past')}`}</span></div></div>`;
    return App.ui.card({ key:'net-ipplan', title:t('IP plan', 'IP-plan'), icon:'network', meta:cfg.on ? (cfg.group === 'production' ? t('production', 'productie') : t('location', 'locatie')) : t('not made yet', 'nog niet gemaakt'), collapsible:false, body });
  }
  function issuesCard(issues){
    const list = issues.filter(i => i.level !== 'info' || i.code === 'NOIP').slice(0, 60);
    if(!list.length) return '';
    return App.ui.card({ key:'net-issues', title:t('Checks', 'Controles'), icon:'alert', meta:`${issues.filter(i => i.level === 'err').length} ${t('errors', 'fouten')} · ${issues.filter(i => i.level === 'warn').length} ${t('warnings', 'waarschuwingen')}`, collapsible:true,
      body:`<div class="fent-issues" style="padding:6px 14px 12px">${list.map(w => `<div class="fent-i ${w.level}">${I(w.level === 'info' ? 'info' : 'alert', 13)}<b>${esc(w.dc)} · ${esc(w.label)}</b> ${w.ip ? `<span class="mono">${esc(w.ip)}</span> — ` : ''}${esc(t(w.en, w.nl))}</div>`).join('')}${issues.length > list.length ? `<div class="subtle">+ ${issues.length - list.length}</div>` : ''}</div>` });
  }
  const KIND_NAME = { node:['node', 'node'], splitter:['splitter', 'splitter'], switch:['switch', 'switch'], console:['console', 'lichttafel'] };
  function addressTable(issues, list){
    const rowsBy = new Map(); for(const dc of App.sortedDims()){ try { rowsBy.set(dc, window.FentUI.portPlan(dc).rows); } catch { rowsBy.set(dc, []); } }
    const dcs = App.sortedDims().filter(dc => list.some(d => d.dc === dc));
    if(!dcs.length) return `<div class="subtle" style="padding:8px 0">${t('No devices yet.', 'Nog geen apparaten.')}</div>`;
    const head = `<thead><tr><th>${t('Device', 'Apparaat')}</th><th>${t('Addresses', 'Adressen')}</th><th>${t('Plugged into', 'Aangesloten op')}</th><th></th></tr></thead>`;
    const body = dcs.map(dc => {
      const devs = list.filter(d => d.dc === dc);
      return `<tr class="ad-dc"><td colspan="4"><i class="dot" style="background:${App.dimColor(dc)}"></i> <b>${esc(dc)}</b> <span class="subtle">${devs.length} ${t('devices', 'apparaten')}</span></td></tr>` + devs.map(d => {
        const n = list.indexOf(d), mine = issues.filter(i => i.dc === d.dc && (i.label === d.label || (i.others || []).some(o => o === `${d.dc} · ${d.label}` || o.startsWith(`${d.dc} · ${d.label} `))));
        const worst = mine.find(i => i.level === 'err') || mine.find(i => i.level === 'warn') || mine[0];
        const rows = rowsBy.get(dc).filter(r => (r.kind === d.kind && r.device === (d.dev.id || d.dev.name || d.kind)));
        const plug = d.kind === 'switch' ? `<span class="subtle">${esc(d.swLabel)}${d.where ? ' · ' + esc(d.where) : ''}</span>` : rows.length ? rows.map(r => r.sw ? `<span class="ad-port"><b>${esc(r.sw)}</b> · ${r.swPort}${r.ethCount > 1 ? ` <small>ETH${r.eth}</small>` : ''}</span>` : `<span class="ad-port none">${t('no port', 'geen poort')}</span>`).join(' ') : '';
        const ifs = d.ifs.length ? d.ifs.map((x, i) => `<div class="ad-if ${mine.some(m => m.ip === x.ip && m.level === 'err') ? 'dup' : ''}">${x.vlan != null && window.NetCables ? window.NetCables.vlanChip(x.vlan) : ''}<input class="ad-ip ${x.ip && !window.Fent.isIp(x.ip) ? 'invalid' : ''}" data-adip="${n}|${x.primary ? 'p' : x.i}" value="${esc(x.ip)}" inputmode="numeric" placeholder="10.90.101.11"><input class="ad-mask" data-admask="${n}|${x.primary ? 'p' : x.i}" value="${esc(x.mask)}" inputmode="numeric" placeholder="${window.Fent.MASK}">${d.eth > 1 ? `<span class="subtle">ETH${x.eth}</span>` : ''}</div>`).join('') : `<div class="ad-if"><input class="ad-ip" data-adip="${n}|p" value="" inputmode="numeric" placeholder="${d.kind === 'switch' ? '10.90.101.1' : '10.90.101.11'}"><input class="ad-mask" data-admask="${n}|p" value="" placeholder="${window.Fent.MASK}"></div>`;
        return `<tr class="${worst?.level === 'err' ? 'bad' : ''}"><td><b>${esc(d.label)}</b>${d.gone ? ` <span class="tag yellow" title="${esc(t('This device is no longer in a rack. Replace or remove it on the Nodes tab.', 'Dit apparaat staat niet meer in een rek. Vervang of verwijder het op het tabblad Nodes.'))}">${t('no longer in a rack', 'niet meer in een rek')}</span>` : ''}<div class="subtle" style="font-size:12px">${esc(d.typeName)} · ${t(...KIND_NAME[d.kind])}</div></td><td>${ifs}</td><td>${plug}</td>
          <td class="ad-st">${worst ? `<span class="ad-flag ${lvl[worst.level]}" title="${esc(mine.map(m => t(m.en, m.nl)).join('\n'))}">${I(worst.level === 'info' ? 'info' : 'alert', 14)}${mine.length > 1 ? mine.length : ''}</span>` : `<span class="ad-flag ok">${I('checkCircle', 14)}</span>`}</td></tr>`;
      }).join('');
    }).join('');
    return `<table class="data-table ad-table">${head}<tbody>${body}</tbody></table>`;
  }
  function addrTab(){
    const list = window.IpPlan.all(), issues = window.IpPlan.check();
    return `<div class="stack">${ipPlanCard(issues)}${issuesCard(issues)}${App.ui.card({ key:'net-addr', title:t('All addresses', 'Alle adressen'), icon:'table', meta:`${list.length} ${t('devices', 'apparaten')}`, collapsible:false, body:`<div style="padding:4px 14px 12px">${addressTable(issues, list)}<div class="hint" style="margin-top:8px">${I('info', 13)} ${t('Type a new address in the table; it is checked at once. A node can have more addresses (management and lighting): add them on the Nodes tab or on the DimCity page.', 'Typ een nieuw adres in de tabel; het wordt meteen gecontroleerd. Een node kan meer adressen hebben (beheer en licht): voeg ze toe op het tabblad Nodes of op de DimCity-pagina.')}</div></div>` })}${window.FentUI.vlanCard()}</div>`;
  }
  // the preview of "Create the IP plan": old → new for every device
  function planDialog(rerender){
    const dcs = App.sortedDims(), rows = window.IpPlan.preview(dcs), changed = rows.filter(r => r.changed).length;
    const dlg = App.ui.openDialog({ title:t('Create the IP plan', 'Maak het IP-plan'), subtitle:t(`${changed} of ${rows.length} devices get a new address`, `${changed} van ${rows.length} apparaten krijgen een nieuw adres`), width:'760px', body:`<div class="subtle" style="margin-bottom:8px">${t('Switch 1 of every DB is .1, switch 2 is .2 … Nodes and splitters count on from .11. Their current addresses are replaced.', 'Switch 1 van elke DB is .1, switch 2 is .2 … Nodes en splitters tellen door vanaf .11. Hun huidige adressen worden vervangen.')}</div>
        <div class="table-wrap" style="max-height:52vh;overflow:auto"><table class="data-table"><thead><tr><th>DB</th><th>${t('Device', 'Apparaat')}</th><th>${t('Now', 'Nu')}</th><th></th><th>${t('New', 'Nieuw')}</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.changed ? '' : 'subtle'}"><td>${esc(r.dc)}</td><td><b>${esc(r.label)}</b> <span class="subtle">${esc(r.typeName)}</span></td><td class="mono">${r.before.map(esc).join('<br>') || '—'}</td><td>${r.changed ? '→' : '='}</td><td class="mono">${r.after.map(esc).join('<br>') || '—'}</td></tr>`).join('')}</tbody></table></div>`,
      footer:`<button class="primary" data-a="go" ${changed ? '' : 'disabled'}>${t('Apply', 'Toepassen')}</button><button data-a="x">${t('Cancel', 'Annuleren')}</button>` });
    dlg.footer.querySelector('[data-a=x]').onclick = () => dlg.close();
    dlg.footer.querySelector('[data-a=go]').onclick = () => { window.PatchHistory?.label?.('IP plan created'); const r = window.IpPlan.apply(dcs); dlg.close(); App.ui.toast(r.over ? t(`${r.n} devices addressed — more than 240 devices in one DimCity, the rest was skipped`, `${r.n} apparaten voorzien van een adres — meer dan 240 apparaten in één DimCity, de rest is overgeslagen`) : t(`${r.n} devices addressed`, `${r.n} apparaten voorzien van een adres`)); rerender(); };
  }
  function bindAddr(root, rerender){
    window.FentUI.bindPlanner(root, rerender);
    const ap = root.querySelector('[data-adplan]'); if(ap) ap.onclick = () => planDialog(rerender);
    const list = window.IpPlan.all();
    const find = ref => { const [n, w] = ref.split('|'); const d = list[Number(n)]; if(!d) return null; return { d, x:w === 'p' ? null : (d.dev.ifaces || [])[Number(w)] }; };
    root.querySelectorAll('[data-adip]').forEach(inp => inp.onchange = () => { const f = find(inp.dataset.adip); if(!f) return; const v = inp.value.trim(); window.PatchHistory?.label?.(`${f.d.label}: address`); if(f.x) f.x.ip = v; else { f.d.dev.ip = v; if(v && !f.d.dev.subnet) f.d.dev.subnet = window.Fent.MASK; } M().ui.dirty = true; rerender(); });
    root.querySelectorAll('[data-admask]').forEach(inp => inp.onchange = () => { const f = find(inp.dataset.admask); if(!f) return; const v = inp.value.trim(); if(f.x) f.x.mask = v; else f.d.dev.subnet = v; M().ui.dirty = true; rerender(); });
  }

  // ---- Fibres / Overview (as before) ----
  function fibersTab(){
    const F = window.Fibers;
    const top = App.ui.card({ key:'net-fibstock', title:t('Fibre stock and auto-assign', 'Fiberoverzicht en automatisch koppelen'), icon:'layers', collapsible:false, body:`<div style="padding:8px 14px 14px">${F.stockCard()}<div class="su-row" style="margin-top:10px"><button class="primary" id="fibAuto">${I('check', 14)}${t('Auto-assign fibres…', 'Fibers automatisch koppelen…')}</button><button id="fibView">${I('cable', 14)}${t('Draw in the fibre overview', 'Tekenen in het fiber-overzicht')}</button></div></div>` });
    return `<div class="stack">${top}${window.Fibers.card()}
      ${App.ui.card({ key:'net-cabletypes', title:t('Cable types', 'Kabeltypes'), icon:'cable', meta:`${(M().networkDevices.cableTypes || []).length}`, collapsible:false, body:`<div style="padding:8px 14px 12px">${(M().networkDevices.cableTypes || []).map(ty => `<div class="subtle" style="font-size:12.5px;margin:2px 0"><span class="fent-sw" style="background:${esc(ty.color || '#22c3d6')}"></span>${esc([ty.brand, ty.name].filter(Boolean).join(' '))} · ${esc(ty.connA || '')} · ${Number(ty.lengthM) || 0} m</div>`).join('') || `<div class="subtle">${t('None yet.', 'Nog geen.')}</div>`}<button class="sm" data-cmd="deviceBuilder" data-arg="cable" style="margin-top:8px">${I('plus', 13)}${t('Make cable types', 'Kabeltypes maken')}</button></div>` })}</div>`;
  }
  function overviewTab(){
    const rows = App.sortedDims().map(dc => { const st = stats(dc), s = status(st); return `<tr><td><i class="dot" style="background:${App.dimColor(dc)}"></i> <b>${esc(dc)}</b></td><td class="num">${st.nodes}</td><td class="num">${st.switches}</td><td class="num">${st.used} / ${st.need}</td><td class="num">${st.cLines}</td><td class="num">${st.fibers}</td><td><span class="net-st ${s.cls}">${esc(s.text)}</span></td><td><button class="sm ghost" data-netopen="${esc(dc)}">${t('Open', 'Open')}</button></td></tr>`; }).join('');
    return `<div class="stack">${App.ui.card({ key:'net-over', title:t('Network per DimCity', 'Netwerk per DimCity'), icon:'table', collapsible:false, body:`<table class="data-table"><thead><tr><th>DimCity</th><th class="num">${t('Nodes', 'Nodes')}</th><th class="num">${t('Switches', 'Switches')}</th><th class="num">${t('On a port', 'Op een poort')}</th><th class="num">${t('Cat lines', 'Cat-lijnen')}</th><th class="num">${t('Fibres', 'Fibers')}</th><th>${t('Status', 'Status')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` })}
      <div class="hint">${I('info', 13)} ${t('Not sure where to start? Use Setup (toolbar) for the steps in order.', 'Weet je niet waar je moet beginnen? Gebruik Setup (werkbalk) voor de stappen op volgorde.')}</div></div>`;
  }

  function render(opts = {}){
    const root = App.$('#lkDetail'); if(!root) return;
    try { window.RackPlan?.syncAll?.(); } catch(e){ console.error('node sync', e); }      // the nodes follow the racks
    if(opts.tab) S.tab = opts.tab; if(opts.dc) S.dc = opts.dc;
    if(!TABS.some(x => x[0] === S.tab)) S.tab = 'patch';
    { const dims = App.sortedDims(); if(!S.dc || (S.dc !== ALL && !dims.includes(S.dc))) S.dc = dims[0] || null; }
    App.pageHead?.({ eyebrow:'Project', title:t('Network', 'Netwerk'), sub:t('Where every device is plugged in, the nodes with their universes, the switches, and all addresses — in one place.', 'Waar elk apparaat is aangesloten, de nodes met hun universes, de switches en alle adressen — op één plek.'),
      actions:`<button data-cmd="setup">${I('check', 15)}${t('Setup', 'Setup')}</button>` });
    const tabs = `<div class="segmented net-tabs" id="netTabs">${TABS.map(([k, en, nl, ic]) => `<button data-tab="${k}" class="${S.tab === k ? 'active' : ''}">${I(ic, 14)}${t(en, nl)}</button>`).join('')}</div>`;
    const ready = window.FentUI && window.NetSwitches && window.Fibers && window.PortPlan && window.IpPlan && window.NetNodes;
    const body = !ready ? '' : S.tab === 'nodes' ? nodesTab() : S.tab === 'switches' ? switchesTab() : S.tab === 'addr' ? addrTab() : S.tab === 'fibers' ? fibersTab() : S.tab === 'overview' ? overviewTab() : patchTab();
    root.innerHTML = `${tabs}<div class="net-body">${body}</div>`;
    const again = () => { const keep = App.$('#mainScroll')?.scrollTop || 0; render(); const sc = App.$('#mainScroll'); if(sc) sc.scrollTop = keep; };
    root.querySelectorAll('#netTabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; render(); });
    root.querySelectorAll('[data-netdc]').forEach(i => i.onchange = () => { S.dc = i.dataset.netdc; render(); });
    root.querySelectorAll('[data-netopen]').forEach(b => b.onclick = () => { S.dc = b.dataset.netopen; S.tab = 'patch'; render(); });
    if(!ready) return;
    const sec = dc => root.querySelector(`[data-dcsec="${CSS.escape(dc)}"]`);
    if(S.tab === 'patch') for(const dc of dcsOf()) if(sec(dc)) window.PortPlan.bind(sec(dc), dc, again);
    if(S.tab === 'nodes') for(const dc of dcsOf()) if(sec(dc)){ window.NetNodes.bind(sec(dc), dc, again); window.PortPlan.bind(sec(dc), dc, again); }
    if(S.tab === 'switches'){ for(const dc of dcsOf()) if(sec(dc)){ window.NetSwitches.bind(sec(dc), dc, again); window.PortPlan.bind(sec(dc), dc, again); window.FentUI.bindDevice(sec(dc), dc, again); } const nc = root.querySelector('[data-netcables]'); if(nc) window.NetCables?.bind(nc, S.dc === ALL ? App.sortedDims()[0] : S.dc, again); }
    if(S.tab === 'addr') bindAddr(root, again);
    if(S.tab === 'fibers'){ window.Fibers.bind(root, again); window.Fibers.bindStock(root, again);
      const au = root.querySelector('#fibAuto'); if(au) au.onclick = () => window.Fibers.autoDialog(again);
      const fv = root.querySelector('#fibView'); if(fv) fv.onclick = () => window.Flow?.openFibres?.();
    }
  }
  const go = tab => render({ tab });
  window.NetworkPage = { render, go, summaryCard, stats, status, state:S };
})();
