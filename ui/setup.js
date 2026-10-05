// ui/setup.js — Setup: a guided path through a show, in the order you work.
//   1 Import · 2 Network per DB · 3 Racks per DB · 4 Couple the LKs to the racks · 5 Fibres · 6 Check and output
// Every step shows its own status (worked out from the show, so it is always true), can be skipped, and can be
// reopened later from the list. Stopping at any moment is fine: nothing here is a lock. MODEL.setup = { skipped:{} }
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const E = () => window.RackEngine;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';
  const plan = dc => App.net.getDimPlan(dc);
  const nd = () => { const n = M().networkDevices = App.net.normalizeNetworkDevices(M().networkDevices); return n; };
  const newIid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const state = () => (M().setup ||= { skipped:{} });
  const S = { step:'import', dc:null };

  // The order follows the work: what the show needs → racks and devices → which socket every LK / Veam gets → the nodes that come out
  // of that → the network that connects those nodes → fibres between the DBs → check and print.
  // The order follows the work: first the paper plan (patch, racks, sockets, nodes, switches, fibres), then check it,
  // and only then the real devices (find them, say which is which, send the configuration) and the printouts.
  const STEPS = [
    { id:'import',  icon:'upload',  en:'Import the patch',            nl:'De patch importeren',
      hen:'What is this? Your patch list (a CSV file) is the start of everything. What do you do? Press “Import CSV” and pick the file. What next? PatchLab finds your DimCities (the DBs) by itself.',
      hnl:'Wat is dit? Je patchlijst (een CSV-bestand) is het begin van alles. Wat doe je? Druk op “CSV importeren” en kies het bestand. Hoe verder? PatchLab vindt zelf je DimCities (de DB’s).' },
    { id:'racks',   icon:'rack',    en:'Racks and devices per DB',    nl:'Racks en apparaten per DB',
      hen:'What is this? What stands in each DB: racks, nodes, splitters. What do you do? Read the advice and press Apply; or place racks and devices yourself. What next? The sockets of the LKs and Veams get a place to go.',
      hnl:'Wat is dit? Wat er in elke DB staat: racks, nodes, splitters. Wat doe je? Lees het advies en druk op Toepassen; of plaats zelf racks en apparaten. Hoe verder? De aansluitingen van de LK’s en Veams krijgen een plek.' },
    { id:'lks',     icon:'box',     en:'Couple LKs and Veams',        nl:'LK\'s en Veams koppelen',
      hen:'What is this? Every LK and Veam cable must end on a socket of a device. What do you do? Press “Automatic”; fix by hand what is left over. What next? Every line has a node port.',
      hnl:'Wat is dit? Elke LK- en Veam-kabel moet eindigen op een aansluiting van een apparaat. Wat doe je? Druk op “Automatisch”; los wat overblijft zelf op. Hoe verder? Elke lijn heeft een nodepoort.' },
    { id:'nodes',   icon:'network', en:'Nodes',                       nl:'Nodes',
      hen:'What is this? The nodes and splitters from the racks go into the network plan, with names like “Node 401.1”. What do you do? Press the button that makes the network plan and link the node names. What next? The switches get their ports.',
      hnl:'Wat is dit? De nodes en splitters uit de racks komen in het netwerkplan, met namen als “Node 401.1”. Wat doe je? Druk op de knop die het netwerkplan maakt en koppel de nodenamen. Hoe verder? De switches krijgen hun poorten.' },
    { id:'network', icon:'switchDev', en:'Network per DB',            nl:'Netwerk per DB',
      hen:'What is this? The network switch of every DB and the numbering of the VLANs. What do you do? Pick the VLAN numbering and add a switch to every DB. What next? Nodes and network cables take the switch ports in order.',
      hnl:'Wat is dit? De netwerkswitch van elke DB en de nummering van de VLAN’s. Wat doe je? Kies de VLAN-nummering en voeg aan elke DB een switch toe. Hoe verder? Nodes en netwerkkabels pakken de poorten van de switch op volgorde.' },
    { id:'fibers',  icon:'cable',   en:'Couple the fibres',           nl:'Fibers koppelen',
      hen:'What is this? The fibres between the switches, also between DBs. What do you do? Press auto-assign (it uses your cable stock) or draw them. Make the cable types in the Device Builder first. What next? The plan is complete.',
      hnl:'Wat is dit? De fibers tussen de switches, ook tussen DB’s. Wat doe je? Druk op automatisch toewijzen (uit je voorraad) of teken ze. Maak eerst de kabeltypes in de Device Builder. Hoe verder? Het plan is compleet.' },
    { id:'check',   icon:'checkCircle', en:'Check the plan',          nl:'Het plan controleren',
      hen:'What is this? A last look at the paper plan, before the real devices. What do you do? Look at the signal flow and clear every open issue. What next? Now you can go to the devices.',
      hnl:'Wat is dit? Een laatste blik op het plan op papier, vóór de echte apparaten. Wat doe je? Bekijk de signaalstroom en los elke open melding op. Hoe verder? Nu kun je naar de apparaten.' },
    { id:'align',   icon:'compass', en:'Find and align the devices',  nl:'Apparaten zoeken en uitlijnen',
      hen:'What is this? Now the real devices. PatchLab finds every switch and node on the network, makes them blink one by one, and you say which is which (“this is DB3 switch 1”). What do you do? Open the Align tool and follow it. What next? Every device knows its place in the plan.',
      hnl:'Wat is dit? Nu de echte apparaten. PatchLab vindt elke switch en node in het netwerk, laat ze één voor één knipperen en jij zegt welke wat is (“dit is DB3 switch 1”). Wat doe je? Open de Uitlijntool en volg hem. Hoe verder? Elk apparaat weet zijn plek in het plan.' },
    { id:'send',    icon:'upload',  en:'Send the configuration',      nl:'De configuratie sturen',
      hen:'What is this? Names, IP addresses, VLANs and universes of the plan go to the devices. What do you do? In the Align tool press “Fill in from the plan” and then “Send config”; you see every change before it is sent. What next? The devices are read back and checked.',
      hnl:'Wat is dit? Namen, IP-adressen, VLAN’s en universes uit het plan gaan naar de apparaten. Wat doe je? In de Uitlijntool druk je op “Invullen uit het plan” en dan op “Config sturen”; je ziet elke wijziging vóór hij wordt gestuurd. Hoe verder? De apparaten worden teruggelezen en gecontroleerd.' },
    { id:'output',  icon:'file',    en:'Print and share',             nl:'Printen en delen',
      hen:'What is this? The paperwork: the PDF report, stickers and QR codes, and the exchange with Lightwright or Vectorworks. What do you do? Press the button of what you need. What next? You are done; come back whenever the show changes.',
      hnl:'Wat is dit? De papieren: het PDF-rapport, stickers en QR-codes, en de uitwisseling met Lightwright of Vectorworks. Wat doe je? Druk op de knop van wat je nodig hebt. Hoe verder? Je bent klaar; kom terug als de show verandert.' }
  ];

  // ---- what is true about the show right now ----
  function facts(){
    const m = M(), dims = App.sortedDims(), out = { rows:(m.lines?.length || 0) + (m.veamLines?.length || 0) + (m.dmxLoose?.length || 0) + (m.netLines?.length || 0), dims, per:{} };
    for(const dc of dims){
      let P = null; try { P = E().computeRackPlan(m, dc); } catch {}
      const sw = window.NetSwitches ? window.NetSwitches.list(dc) : [], p = plan(dc);
      out.per[dc] = { switches:sw, racks:(p.racks || []).length, loose:(p.loose || []).length, P, nodes:(p.nodes || []).length, lines:P?.lines.length || 0, unfed:P?.stats.unfed || 0, hasPlan:!!(P && (P.racks.length || P.loose.length)) };
    }
    return out;
  }
  function status(id, f = facts()){
    const dims = f.dims, sk = state().skipped?.[id];
    let done = false, detail = '';
    if(id === 'import'){ done = f.rows > 0; detail = done ? `${f.rows} ${t('rows', 'regels')} · ${dims.length} DimCities` : t('nothing imported yet', 'nog niets geïmporteerd'); }
    else if(id === 'network'){ const have = dims.filter(d => f.per[d].switches.length).length; done = !!dims.length && have === dims.length; detail = `${have}/${dims.length} ${t('DBs with a switch', 'DB\'s met een switch')}`; }
    else if(id === 'racks'){ const rd = dims.filter(d => d !== 'FOH'), have = rd.filter(d => f.per[d].hasPlan).length; done = !!rd.length && have === rd.length; detail = `${have}/${rd.length} ${t('DBs with a rack or devices', 'DB\'s met een rek of apparaten')}`; }
    else if(id === 'lks'){ const ok = dims.filter(d => f.per[d].hasPlan && !f.per[d].unfed).length; const need = dims.filter(d => f.per[d].hasPlan).length; done = need > 0 && ok === need; detail = `${ok}/${need} ${t('DBs fully patched', 'DB\'s volledig gepatcht')}`; }
    else if(id === 'nodes'){
      const st = window.NodeLink ? window.NodeLink.status() : { total:0, linked:0 }, rd = dims.filter(d => d !== 'FOH' && f.per[d].hasPlan), have = rd.filter(d => f.per[d].nodes).length;
      done = rd.length > 0 && have === rd.length && st.linked === st.total;
      detail = `${have}/${rd.length} ${t('DBs with nodes', 'DB\'s met nodes')}${st.total ? ` · ${st.linked}/${st.total} ${t('CSV names', 'CSV-namen')}` : ''}`; }
    else if(id === 'fibers'){ const n = window.Fibers ? window.Fibers.all().length : 0; done = n > 0; detail = n ? `${n} ${t('fibres', 'fibers')}` : t('no fibres yet', 'nog geen fibers'); }
    else if(id === 'align'){
      const NC = window.NetConfig, devs = NC ? [...NC.state.dev.values()].filter(d => d.kind !== 'unknown') : [], planned = NC ? NC.planItems().length : 0, linked = devs.filter(d => d.link).length;
      done = planned > 0 && linked >= planned; detail = devs.length ? `${linked}/${planned} ${t('linked', 'gekoppeld')} · ${devs.length} ${t('found', 'gevonden')}` : t('not searched yet', 'nog niet gezocht'); }
    else if(id === 'send'){
      const NC = window.NetConfig, l = NC ? [...NC.state.dev.values()].filter(d => d.link) : [];
      done = l.length > 0 && l.every(d => d.verified && !NC.changeCount(d)); detail = l.length ? `${l.filter(d => d.verified).length}/${l.length} ${t('sent and checked', 'gestuurd en gecontroleerd')}` : t('nothing linked yet', 'nog niets gekoppeld'); }
    else if(id === 'output'){ done = !!state().outputDone; detail = done ? t('printed or shared', 'geprint of gedeeld') : t('when you need paperwork', 'als je papieren nodig hebt'); }
    else if(id === 'check'){ const n = (m().issues || []).length; done = f.rows > 0 && n === 0; detail = n ? `${n} ${t('open issues', 'open meldingen')}` : t('no open issues', 'geen open meldingen'); }
    return { done, skipped:!!sk && !done, detail };
  }
  const m = () => M();
  const idx = id => STEPS.findIndex(s => s.id === id);

  // ---- dialog ----
  let R = null;
  function open(opts = {}){
    if(!M()) return;
    const f = facts();
    S.step = opts.step || STEPS.find(s => { const st = status(s.id, f); return !st.done && !st.skipped; })?.id || 'check';
    if(opts.dc) S.dc = opts.dc;
    if(!S.dc || !f.dims.includes(S.dc)) S.dc = f.dims[0] || null;
    document.getElementById('suRoot')?.remove();
    R = document.createElement('div'); R.id = 'suRoot'; R.className = 'rb';
    R.innerHTML = `<div class="rb-top"><div class="rb-title">${I('check', 18)}<div><b>Setup</b><span id="suSub"></span></div></div><div class="rb-top-mid"><span class="subtle">${t('Take the steps in order — or stop whenever you like. Nothing is locked.', 'Doe de stappen op volgorde — of stop wanneer je wilt. Niets zit vast.')}</span></div><div class="rb-top-actions"><button id="suReset" title="${esc(t('Forget which steps you skipped', 'Vergeet welke stappen je hebt overgeslagen'))}">${I('refresh', 14)}${t('Start over', 'Opnieuw beginnen')}</button><button class="primary" id="suStop">${t('Stop', 'Stoppen')}</button></div></div>
      <div class="rb-body su-body"><aside class="rb-panel"><div class="rb-panel-body" id="suList"></div></aside><section class="su-main" id="suMain"></section></div>`;
    document.body.appendChild(R);
    document.addEventListener('keydown', onKey, true);
    R.querySelector('#suStop').onclick = close;
    R.querySelector('#suReset').onclick = () => { state().skipped = {}; M().ui.dirty = true; const f2 = facts(); S.step = STEPS.find(s => !status(s.id, f2).done)?.id || 'import'; render(); };
    render();
  }
  function close(){ document.getElementById('suRoot')?.remove(); document.removeEventListener('keydown', onKey, true); R = null; }
  const onKey = e => { if(R && e.key === 'Escape' && !document.querySelector('.modal-backdrop')){ e.preventDefault(); close(); } };

  function render(){
    if(!R) return;
    const f = facts(), cur = STEPS[idx(S.step)];
    const done = STEPS.filter(s => status(s.id, f).done).length;
    R.querySelector('#suSub').textContent = `${t('Step', 'Stap')} ${idx(S.step) + 1} ${t('of', 'van')} ${STEPS.length} · ${done} ${t('done', 'klaar')}`;
    R.querySelector('#suList').innerHTML = `<div class="su-steps">${STEPS.map((s, i) => { const st = status(s.id, f); return `<button class="su-step ${S.step === s.id ? 'on' : ''} ${st.done ? 'done' : st.skipped ? 'skip' : ''}" data-go="${s.id}"><span class="su-n">${st.done ? I('check', 13) : i + 1}</span><span class="su-t"><b>${esc(t(s.en, s.nl))}</b><em>${esc(st.skipped ? t('skipped', 'overgeslagen') : st.detail)}</em></span></button>`; }).join('')}</div>`;
    R.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { S.step = b.dataset.go; render(); });
    const body = bodyFor(cur.id, f), st = status(cur.id, f);
    R.querySelector('#suMain').innerHTML = `<div class="su-card"><div class="su-head">${I(cur.icon, 20)}<div><h2>${esc(t(cur.en, cur.nl))}</h2>${stepIntro(t(cur.hen, cur.hnl))}</div><span class="net-st ${st.done ? 'ok' : st.skipped ? 'warn' : ''}">${esc(st.done ? t('done', 'klaar') : st.skipped ? t('skipped', 'overgeslagen') : t('to do', 'te doen'))}</span></div>
      <div class="su-content">${body}</div>
      <div class="su-nav"><button id="suBack" ${idx(S.step) === 0 ? 'disabled' : ''}>${t('Back', 'Terug')}</button><span style="flex:1"></span>${st.done ? '' : `<button id="suSkip" class="ghost">${t('Skip this step', 'Deze stap overslaan')}</button>`}<button class="primary" id="suNext">${idx(S.step) === STEPS.length - 1 ? t('Finish', 'Afronden') : t('Next step', 'Volgende stap')}</button></div></div>`;
    R.querySelector('#suBack').onclick = () => { S.step = STEPS[Math.max(0, idx(S.step) - 1)].id; render(); };
    R.querySelector('#suNext').onclick = () => { if(idx(S.step) === STEPS.length - 1){ close(); App.ui.toast(t('Setup closed — open it again from the toolbar whenever you want.', 'Setup gesloten — open hem opnieuw via de werkbalk wanneer je wilt.')); } else { S.step = STEPS[idx(S.step) + 1].id; render(); } };
    const sk = R.querySelector('#suSkip'); if(sk) sk.onclick = () => { state().skipped[S.step] = true; M().ui.dirty = true; S.step = STEPS[Math.min(STEPS.length - 1, idx(S.step) + 1)].id; render(); };
    bindStep(cur.id);
  }
  const dcBar = f => `<div class="rb-chips" style="margin:0 0 14px">${f.dims.map(d => `<label class="rb-chip ${S.dc === d ? 'on' : ''}"><input type="radio" name="sudc" data-sudc="${esc(d)}" ${S.dc === d ? 'checked' : ''}><i class="dot" style="background:${App.dimColor(d)}"></i>${esc(d)}<span class="subtle">${f.per[d].switches.length ? '✓' : ''}</span></label>`).join('')}<button class="sm ghost" data-su-adddb title="${esc(t('Add a DB', 'Een DB toevoegen'))}">${I('plus', 12)} DB</button>${f.dims.includes('FOH') ? '' : `<button class="sm ghost" data-su-addfoh title="${esc(t('Front of house: where the lighting desk stands', 'Front of house: waar de lichttafel staat'))}">${I('plus', 12)} FOH</button>`}</div>`;

  // “What is this? … What do you do? … What next? …” as three short lines with the question in bold
  const stepIntro = txt => String(txt).split(/(?=Wat doe je\?|Hoe verder\?|What do you do\?|What next\?)/).map(x => { const m = x.match(/^([^?]+\?)\s*(.*)$/); return m ? `<p><b>${esc(m[1])}</b> ${esc(m[2])}</p>` : `<p>${esc(x)}</p>`; }).join('');

  function bodyFor(id, f){
    const dc = S.dc, n = nd(), c = n.prefs.fent;
    if(id === 'import') return `<div class="su-big">${f.rows ? `<b>${f.rows}</b> ${t('rows in', 'regels in')} <b>${f.dims.length}</b> DimCities` : t('No patch yet.', 'Nog geen patch.')}</div>
      <div class="su-row"><button class="primary" data-cmd-run="importCsv">${I('upload', 15)}${t('Import CSV…', 'CSV importeren…')}</button><button data-cmd-run="demo">${t('Or open the demo show', 'Of open de demo-show')}</button></div>
      <div class="hint" style="margin-top:12px">${I('info', 13)} ${t('Rows: LK101 / V101 / C101 (network cable, 4 lines) with port, universe (or VLAN for C) and location.', 'Regels: LK101 / V101 / C101 (netwerkkabel, 4 lijnen) met poort, universe (of VLAN bij C) en locatie.')}</div>`;
    if(id === 'network'){
      if(!dc) return `<div class="subtle">${t('Import a patch first.', 'Importeer eerst een patch.')}</div>`;
      const sws = f.per[dc].switches, ts = n.switchTypes;
      return `<div class="su-grid"><div><div class="rb-label">${t('VLAN numbering', 'VLAN-nummering')}</div><div class="segmented rb-full" data-su-mode><button data-v="luminex" class="${c.vlanMode !== 'fent' ? 'active' : ''}">Luminex (1, 200, 300…)</button><button data-v="fent" class="${c.vlanMode === 'fent' ? 'active' : ''}">FENT (1090, 1040…)</button></div>
          <label class="rb-row" style="margin-top:8px"><span>${t('Use the FENT IP scheme', 'Gebruik het FENT IP-schema')}<span class="hint" style="display:block;margin:2px 0 0">${t('10.90.x.x management, 10.40.x.x lighting', '10.90.x.x beheer, 10.40.x.x licht')}</span></span><span class="switch"><input type="checkbox" data-su-fent ${c.on ? 'checked' : ''}><span></span></span></label></div></div>
        <div class="rb-label" style="margin-top:14px">${t('Switch per DB', 'Switch per DB')}</div>${dcBar(f)}
        <div class="su-list">${sws.map(s => `<div class="su-item"><b>${esc(s.label)}</b><span class="subtle">${esc(typeName(s.type))} · ${s.rj} RJ45${s.sfp ? ` + ${s.sfp} SFP` : ''}${s.source === 'rack' ? ` · ${t('in', 'in')} ${esc(s.where)}` : ''}</span>${s.source === 'plan' ? `<button class="sm ghost" data-su-rmsw="${s.idx}" title="${esc(t('Remove', 'Verwijderen'))}">${I('trash', 13)}</button>` : ''}</div>`).join('') || `<div class="subtle">${t('No switch in this DB yet.', 'Nog geen switch in deze DB.')}</div>`}</div>
        <div class="su-row"><select id="suSwType" ${ts.length ? '' : 'disabled'}>${ts.map(ty => `<option value="${esc(ty.id)}">${esc(typeName(ty))} · ${Number(ty.portCount) || 0} RJ45 + ${Number(ty.sfpCount) || 0} ${String(ty.sfpConnectors || '').trim() ? 'fibre' : 'SFP'}${Number(ty.heightU) > 1 ? ` · ${ty.heightU}U` : ''}</option>`).join('') || `<option>${t('No switch types', 'Geen switchtypes')}</option>`}</select><button class="primary" data-su-addsw ${ts.length ? '' : 'disabled'}>${I('plus', 14)}${t('Add switch to', 'Switch toevoegen aan')} ${esc(dc)}</button><button data-su-addall ${ts.length ? '' : 'disabled'}>${t('Same switch in every DB', 'Dezelfde switch in elke DB')}</button></div>
        ${(() => { const rs = n.rackTypes.filter(r => (r.items || []).some(it => it.kind === 'switch')); return rs.length ? `<div class="rb-label" style="margin-top:12px">${t('Or place a rack that has a switch in it', 'Of plaats een rek waar een switch in zit')}</div><div class="su-row"><select id="suSwRack">${rs.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)} · ${r.heightU}U</option>`).join('')}</select><button data-su-addswrack>${I('plus', 14)}${t('Place rack in', 'Rek plaatsen in')} ${esc(dc)}</button></div>` : ''; })()}
        <div class="hint" style="margin-top:10px">${I('info', 13)} ${t('Fine detail (addresses, VLAN per port) is on the Network page.', 'Details (adressen, VLAN per poort) staan op de pagina Netwerk.')} <a data-cmd-run="network">${t('Open Network', 'Open Netwerk')}</a></div>`;
    }
    if(id === 'racks'){
      if(!dc) return `<div class="subtle">${t('Import a patch first.', 'Importeer eerst een patch.')}</div>`;
      const p = plan(dc), rts = n.rackTypes, nts = n.nodeTypes, P = f.per[dc].P;
      const rackList = (p.racks || []).map((r, i) => { const rt = rts.find(x => x.id === r.rackId); return `<div class="su-item"><b>${esc(r.name || rt?.name || r.rackId)}</b><span class="subtle">${rt ? `${rt.heightU}U` : t('type missing', 'type ontbreekt')}</span>${i > 0 ? `<label class="rp-inline" title="${esc(t('Stands directly on the rack above: LK / Veam cables can reach the nodes of both racks', 'Staat direct op het rek erboven: LK-/Veam-kabels reiken dan naar de nodes van beide rekken'))}"><input type="checkbox" data-su-stack="${esc(r.iid)}" ${r.stack ? 'checked' : ''}> ${t('stacked on the one above', 'gestapeld op het rek erboven')}</label>` : ''}<button class="sm ghost" data-su-rmrack="${esc(r.iid)}">${I('trash', 13)}</button></div>`; }).join('');
      const looseList = (p.loose || []).map(d => `<div class="su-item"><b>${d.kind === 'node' ? t('Loose node', 'Losse node') : d.kind === 'lkSpider' ? t('LK spider', 'LK-spin') : t('Veam4 spider', 'Veam4-spin')}</b><span class="subtle">${esc(d.kind === 'node' ? typeName(nts.find(x => x.id === d.typeId)) : '')}</span><button class="sm ghost" data-su-rmloose="${esc(d.iid)}">${I('trash', 13)}</button></div>`).join('');
      return `${dcBar(f)}${window.RackPlan ? `<div data-adv="${esc(dc)}">${window.RackPlan.adviceHtml(dc, { compact:false })}</div>` : ''}<div class="rb-label" style="margin-top:12px">${t('Placed in this DB', 'Geplaatst in deze DB')}</div><div class="su-list">${rackList}${looseList || ''}${rackList || looseList ? '' : `<div class="subtle">${t('Nothing placed in this DB yet.', 'Nog niets geplaatst in deze DB.')}</div>`}</div>
        <div class="su-row"><select id="suRackType" ${rts.length ? '' : 'disabled'}>${rts.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)} · ${r.heightU}U</option>`).join('') || `<option>${t('No racks yet', 'Nog geen racks')}</option>`}</select><button class="primary" data-su-addrack ${rts.length ? '' : 'disabled'}>${I('plus', 14)}${t('Place rack in', 'Rek plaatsen in')} ${esc(dc)}</button><button data-cmd-run="deviceBuilder" data-arg="rack">${t('Rack Builder', 'Rack Builder')}</button><button data-su-custom>${I('plus', 14)}${t('Custom rack…', 'Eigen rek…')}</button></div>
        <div class="su-row"><select id="suNodeType" ${nts.length ? '' : 'disabled'}>${nts.map(x => `<option value="${esc(x.id)}">${esc(typeName(x))}</option>`).join('')}</select><button data-su-addloose="node">${t('Add loose node', 'Losse node toevoegen')}</button><button data-su-addloose="lkSpider">${t('Add LK spider', 'LK-spin toevoegen')}</button><button data-su-addloose="vimSpider">${t('Add Veam4 spider', 'Veam4-spin toevoegen')}</button></div>
        ${P ? `<div class="hint" style="margin-top:10px">${I('info', 13)} ${P.racks.filter(r => r.rack).length} ${t('racks', 'racks')} · ${P.nodes.length} ${t('nodes', 'nodes')} · LK ${P.stats.lkUsed}/${P.stats.lkSockets} · Veam ${P.stats.vimUsed}/${P.stats.vimSockets}</div>` : ''}`;
    }
    if(id === 'lks'){
      return f.dims.map(d => { const x = f.per[d], P = x.P; if(!P) return ''; const ok = x.hasPlan && !x.unfed;
        return `<div class="su-dc" data-asg="${esc(d)}"><div class="su-dc-head"><i class="dot" style="background:${App.dimColor(d)}"></i><b>${esc(d)}</b><span class="net-st ${ok ? 'ok' : x.hasPlan ? 'warn' : 'err'}">${esc(!x.hasPlan ? t('no rack yet', 'nog geen rek') : x.unfed ? t(`${x.unfed} lines without a node port`, `${x.unfed} lijnen zonder nodepoort`) : t('all lines patched', 'alle lijnen gepatcht'))}</span></div>
          <div class="subtle" style="font-size:12.5px">LK ${P.stats.lkUsed}/${P.stats.lkSockets} · Veam ${P.stats.vimUsed}/${P.stats.vimSockets} · ${t('node ports', 'nodepoorten')} ${P.stats.nodePortsUsed}/${P.stats.nodePorts} · ${P.lines.length} ${t('lines', 'lijnen')}${(P.stats.spiders.lk || P.stats.spiders.vim) ? ` · ${t('loose spiders', 'losse spinnen')}: ${P.stats.spiders.lk + P.stats.spiders.vim}` : ''}</div>
          ${P.recs.filter(r => r.level === 'warn').slice(0, 3).map(r => `<div class="su-warn">${I('alert', 13)} ${esc(r.text)}${r.fix ? ` <button class="sm primary" data-su-fix="${esc(r.fix.iid)}" data-dc="${esc(d)}">${t('Fix: stack', 'Oplossen: stapel')} ${esc(r.fix.label)}</button>` : ''}</div>`).join('')}
          ${window.RackPlan && x.hasPlan ? window.RackPlan.assignHtml(P, d) : `<div class="subtle" style="margin-top:6px">${t('Place a rack or loose devices first (previous step).', 'Plaats eerst een rek of losse apparaten (vorige stap).')}</div>`}
          <div class="su-row" style="margin-top:8px"><button class="ghost" data-su-open="${esc(d)}">${t('Open', 'Open')} ${esc(d)}</button></div></div>`; }).join('') +
        `<div class="hint" style="margin-top:6px">${I('info', 13)} ${t('Not sure which setup is best? The advice is in the previous step.', 'Niet zeker welke setup het beste is? Het advies staat in de vorige stap.')}</div>`;
    }
    if(id === 'nodes'){
      const sg = window.NodeLink ? window.NodeLink.suggest() : [];
      const head = `<div class="rb-label">${t('Nodes and splitters from the racks', 'Nodes en splitters uit de racks')}</div>` + f.dims.filter(d => f.per[d].hasPlan).map(d => { const x = f.per[d]; return `<div class="su-item"><i class="dot" style="background:${App.dimColor(d)}"></i><b>${esc(d)}</b><span class="subtle">${x.nodes ? `${x.nodes} ${t('nodes in the network plan', 'nodes in het netwerkplan')}` : t('not in the network plan yet', 'nog niet in het netwerkplan')}</span><button class="sm" data-su-apply="${esc(d)}">${t(x.nodes ? 'Update' : 'Make', x.nodes ? 'Bijwerken' : 'Maken')}</button></div>`; }).join('') + `<div class="su-row"><button class="primary" data-su-applyall>${t('Make the nodes in every DB', 'Maak de nodes in elke DB')}</button></div><div class="hint" style="margin-bottom:14px">${I('info', 13)} ${t('Addresses you set before are kept when you update.', 'Adressen die je eerder hebt ingesteld blijven behouden als je bijwerkt.')}</div>`;
      if(!sg.length) return head + `<div class="su-big"><b>${t('Nothing to link', 'Niets te koppelen')}</b></div><div class="hint">${I('info', 13)} ${t('No DMX line has a destination like “Node 401.1”. Nothing to do here — go on.', 'Geen DMX-regel heeft een bestemming zoals “Node 401.1”. Hier hoeft niets — ga door.')}</div>`;
      const nodesOf = dc2 => App.net.getDimPlan(dc2).nodes || [];
      return head + `<div class="rb-label">${t('Node names from the CSV', 'Nodenamen uit de CSV')}</div><div class="su-big"><b>${sg.filter(x => x.linked).length}</b> / ${sg.length} ${t('names linked', 'namen gekoppeld')}</div>
        <table class="data-table"><thead><tr><th>${t('Name in the CSV', 'Naam in de CSV')}</th><th>${t('Lines', 'Regels')}</th><th>${t('Node in the plan', 'Node in het plan')}</th></tr></thead><tbody>${sg.map(x => `<tr><td><b>Node ${x.no}</b> <span class="subtle">→ ${esc(x.dc)}</span></td><td>${x.ports.map(p => `${p.port ? 'P' + p.port : '—'} U${p.universe ?? '?'}`).join(' · ')}</td><td><select data-su-nl="${x.no}" data-dc="${esc(x.dc)}"><option value="">—</option>${nodesOf(x.dc).map((n, i) => `<option value="${i}" ${x.linked && x.nodeIndex === i ? 'selected' : ''}>${esc(n.id || `N${i + 1}`)} · ${esc(n.name || '')}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
        <div class="su-row" style="margin-top:12px"><button class="primary" data-su-nlauto>${t('Link automatically (401 → DB04 node 01)', 'Automatisch koppelen (401 → DB04 node 01)')}</button></div>
        <div class="hint" style="margin-top:10px">${I('info', 13)} ${t('Nodes come from “Use as network plan” in the previous step. You can also pick the name on the node itself (Nodes & Splitters page).', 'Nodes komen uit “Gebruik als netwerkplan” in de vorige stap. Je kunt de naam ook op de node zelf kiezen (pagina Nodes & splitters).')}</div>`;
    }
    if(id === 'fibers'){
      const links = window.Fibers ? window.Fibers.all() : [], types = n.cableTypes;
      return `<div class="su-big"><b>${links.length}</b> ${t('fibres', 'fibers')} · <b>${types.length}</b> ${t('cable types', 'kabeltypes')}</div>
        <div class="su-list">${links.map(l => `<div class="su-item"><b>${esc(l.id)}</b><span class="subtle">${esc(window.Fibers.endLabel(l.a))} ⇄ ${esc(window.Fibers.endLabel(l.b))}</span></div>`).join('') || `<div class="subtle">${t('No fibres yet.', 'Nog geen fibers.')}</div>`}</div>
        <div class="su-row">${types.length ? '' : `<button class="primary" data-cmd-run="deviceBuilder" data-arg="cable">${I('plus', 14)}${t('Make cable types first', 'Maak eerst kabeltypes')}</button>`}<button class="${types.length ? 'primary' : ''}" data-su-autofib>${t('Auto-assign…', 'Automatisch koppelen…')}</button><button data-su-drawfib>${t('Draw in the fibre overview', 'Tekenen in het fiber-overzicht')}</button><button data-su-fibers>${I('cable', 14)}${t('Couple fibres on the Network page', 'Fibers koppelen op de pagina Netwerk')}</button><button class="ghost" data-su-nofiber>${t('No fibres needed', 'Geen fibers nodig')}</button></div>`;
    }
    if(id === 'align' || id === 'send'){
      const NC = window.NetConfig, devs = NC ? [...NC.state.dev.values()].filter(d => d.kind !== 'unknown') : [], planned = NC ? NC.planItems() : [], linked = devs.filter(d => d.link).length;
      const stp = status(id, f);
      return `<div class="su-big">${id === 'align' ? `<b>${linked}</b> / ${planned.length} ${t('places of the plan have their device', 'plekken van het plan hebben hun apparaat')}` : `<b>${stp.detail}</b>`}</div>
        <div class="su-row"><button class="primary" data-cmd-run="align" data-arg="${id === 'send' ? 'send' : devs.length ? 'align' : 'find'}">${I('compass', 15)}${t('Open the Align tool', 'Open de Uitlijntool')}</button><button data-cmd-run="netDevices">${I('sliders', 14)}${t('Network config (one device or port)', 'Netwerkconfig (één apparaat of poort)')}</button></div>
        <div class="hint" style="margin-top:12px">${I('info', 13)} ${id === 'align' ? t('The Align tool blinks one device at a time. You need to be at the network with the devices switched on and connected to this computer.', 'De Uitlijntool laat steeds één apparaat knipperen. Je moet dan op het netwerk zitten, met de apparaten aan en verbonden met deze computer.') : t('Sending goes at once, and a window then lists every change that was made. Changing an IP address makes the device move; do that on a new network.', 'Sturen gaat meteen en een venster toont daarna elke wijziging die is gedaan. Een ander IP-adres laat het apparaat verhuizen; doe dat op een nieuw netwerk.')}</div>`;
    }
    if(id === 'output') return `<div class="su-row"><button class="primary" data-cmd-run="exportPdf" data-done="1">${I('file', 14)}${t('Export PDF report', 'PDF-rapport exporteren')}</button><button data-cmd-run="stickers" data-done="1">${I('grid', 14)}${t('Print stickers', 'Stickers printen')}</button><button data-cmd-run="exchange" data-done="1">${I('refresh', 14)}${t('Exchange with Lightwright / Vectorworks', 'Uitwisselen met Lightwright / Vectorworks')}</button></div>
        <div class="hint" style="margin-top:12px">${I('info', 13)} ${t('The PDF report holds the racks, the patch, the network plan and the signal flow, per DimCity or all together. Stickers and QR codes have their own settings.', 'Het PDF-rapport bevat de racks, de patch, het netwerkplan en de signaalstroom, per DimCity of allemaal samen. Stickers en QR-codes hebben hun eigen instellingen.')}</div>`;
    const issues = (M().issues || []);
    return `<div class="su-big">${issues.length ? `<b>${issues.length}</b> ${t('open issues', 'open meldingen')}` : `<b>${t('No open issues', 'Geen open meldingen')}</b>`}</div>
      ${issues.slice(0, 5).map(i => `<div class="su-warn">${I('alert', 13)} ${esc(i.message)}</div>`).join('')}
      <div class="su-row" style="margin-top:12px"><button data-cmd-run="signalFlow">${I('cable', 14)}${t('Look at the signal flow', 'Bekijk de signaalstroom')}</button><button data-cmd-run="issues">${t('Open validation', 'Open validatie')}</button></div>`;
  }

  function bindStep(id){
    const n = nd(), root = R, dc = S.dc;
    const dirty = () => { M().ui.dirty = true; };
    root.querySelectorAll('[data-adv]').forEach(el => window.RackPlan?.bindAdvice(el, el.dataset.adv, render));
    root.querySelectorAll('[data-asg]').forEach(el => window.RackPlan?.bindAssign(el, el.dataset.asg, render));
    for(const [sid, key] of [['suSwType', 'swType'], ['suRackType', 'rackType'], ['suNodeType', 'nodeType']]){
      const sel = root.querySelector('#' + sid); if(!sel) continue;
      if(S[key] && [...sel.options].some(o => o.value === S[key])) sel.value = S[key];
      sel.onchange = () => { S[key] = sel.value; };
    }
    const mkLoc = name => { const r = App.addDimCity(name); if(!r.ok){ App.ui.toast(r.error); return; } S.dc = r.id; App.renderAll(); render(); };
    const adb = root.querySelector('[data-su-adddb]'); if(adb) adb.onclick = () => mkLoc(App.nextDbName());
    const afoh = root.querySelector('[data-su-addfoh]'); if(afoh) afoh.onclick = () => mkLoc('FOH');
    root.querySelectorAll('[data-sudc]').forEach(i => i.onchange = () => { S.dc = i.dataset.sudc; render(); });
    root.querySelectorAll('[data-cmd-run]').forEach(b => b.onclick = () => {
      const cmd = b.dataset.cmdRun, arg = b.dataset.arg;
      if(b.dataset.done){ state().outputDone = true; M().ui.dirty = true; }
      if(cmd === 'issues'){ close(); App.navigate('ISSUES'); return; }
      if(cmd === 'demo'){ close(); window.Demo?.open?.(); return; }
      const back = { step:S.step, dc:S.dc }, before = new Set(document.querySelectorAll('.rb, .modal-backdrop'));
      close(); App.runCommand?.(cmd, arg);
      comeBack(back, before);
    });
    root.querySelectorAll('[data-su-mode] button').forEach(b => b.onclick = () => { n.prefs.fent.vlanMode = b.dataset.v; dirty(); render(); });
    const fe = root.querySelector('[data-su-fent]'); if(fe) fe.onchange = () => { n.prefs.fent.on = fe.checked; dirty(); render(); };
    const addSw = (d, typeId) => { const ty = n.switchTypes.find(x => x.id === typeId) || n.switchTypes[0]; if(!ty) return; const p = plan(d); p.switches ||= []; const k = p.switches.length + 1;
      const sw = { id:`${d}-SW${k}`, name:`${d} ${typeName(ty)}`, typeId:ty.id, ip:'', subnet:ty.subnet || '', ifaces:[] };
      if(n.prefs.fent.on && window.Fent){ const c = n.prefs.fent; sw.ip = window.Fent.suggestEquipment(window.Fent.roleVlan('management', c.vlanMode), c.group, App.dimSlot(d), k); sw.subnet = window.Fent.MASK; sw.ipRole = 'management'; sw.ipVlan = window.Fent.roleVlan('management', c.vlanMode); }
      p.switches.push(sw); dirty(); };
    const a1 = root.querySelector('[data-su-addsw]'); if(a1) a1.onclick = () => { addSw(dc, root.querySelector('#suSwType').value); render(); };
    const a2 = root.querySelector('[data-su-addall]'); if(a2) a2.onclick = () => { const tid = root.querySelector('#suSwType').value; for(const d of App.sortedDims()) if(!(plan(d).switches || []).length && !(window.NetSwitches.list(d).length)) addSw(d, tid); render(); };
    root.querySelectorAll('[data-su-rmsw]').forEach(b => b.onclick = () => { plan(dc).switches.splice(Number(b.dataset.suRmsw), 1); dirty(); render(); });
    root.querySelectorAll('[data-su-fix]').forEach(b => b.onclick = () => { window.RackPlan.fixStack(b.dataset.dc, b.dataset.suFix); dirty(); render(); });
    const cu = root.querySelector('[data-su-custom]'); if(cu) cu.onclick = () => window.RackPlan?.customRack?.(dc, render);
    root.querySelectorAll('[data-su-stack]').forEach(c => c.onchange = () => { const r = (plan(dc).racks || []).find(x => x.iid === c.dataset.suStack); if(!r) return; if(c.checked) r.stack = true; else delete r.stack; dirty(); render(); });
    const asr = root.querySelector('[data-su-addswrack]'); if(asr) asr.onclick = () => { const id2 = root.querySelector('#suSwRack').value; const rt = n.rackTypes.find(r => r.id === id2); if(!rt) return; (plan(dc).racks ||= []).push({ iid:`rk_${Date.now().toString(36)}`, rackId:id2, name:'' }); window.PatchHistory?.label?.(`Placed ${rt.name || rt.id} in ${dc}`); dirty(); render(); };
    const ar = root.querySelector('[data-su-addrack]'); if(ar) ar.onclick = () => { const id2 = root.querySelector('#suRackType').value; const rt = n.rackTypes.find(r => r.id === id2); if(!rt) return; (plan(dc).racks ||= []).push({ iid:`rk_${Date.now().toString(36)}`, rackId:id2, name:'' }); window.PatchHistory?.label?.(`Placed ${rt.name || rt.id} in ${dc}`); dirty(); render(); };
    root.querySelectorAll('[data-su-rmrack]').forEach(b => b.onclick = () => { const p = plan(dc); p.racks = (p.racks || []).filter(r => r.iid !== b.dataset.suRmrack); dirty(); render(); });
    root.querySelectorAll('[data-su-addloose]').forEach(b => b.onclick = () => { const kind = b.dataset.suAddloose, p = plan(dc); p.loose ||= []; const item = { iid:newIid('ls'), kind };
      if(kind === 'node'){ const t2 = n.nodeTypes.find(x => x.id === root.querySelector('#suNodeType')?.value); if(!t2) return; window.RackPlan.addLooseNode(dc, t2.id); App.ui.toast(t('Loose node added with an LK spider — a node without a rack needs one', 'Losse node toegevoegd met een LK-spin — een node zonder rek heeft er een nodig')); dirty(); render(); return; } else { const last = p.loose.filter(d => d.kind === 'node').pop(); if(last) item.nodeIid = last.iid; }
      p.loose.push(item); dirty(); render(); });
    root.querySelectorAll('[data-su-rmloose]').forEach(b => b.onclick = () => { const p = plan(dc); p.loose = (p.loose || []).filter(d => d.iid !== b.dataset.suRmloose); dirty(); render(); });
    root.querySelectorAll('[data-su-apply]').forEach(b => b.onclick = () => { window.RackPlan?.applyToNetworkPlan?.(b.dataset.suApply, { quiet:true }); App.ui.toast(`${b.dataset.suApply}: ${t('network plan updated', 'netwerkplan bijgewerkt')}`); render(); });
    const aa = root.querySelector('[data-su-applyall]'); if(aa) aa.onclick = () => { for(const d of App.sortedDims()) if(facts().per[d].hasPlan) window.RackPlan?.applyToNetworkPlan?.(d, { quiet:true }); App.ui.toast(t('Network plan updated in every DB', 'Netwerkplan bijgewerkt in elke DB')); render(); };
    root.querySelectorAll('[data-su-open]').forEach(b => b.onclick = () => { close(); App.openEntity('DIM', b.dataset.suOpen); });
    root.querySelectorAll('[data-su-nl]').forEach(sel => sel.onchange = () => { const n = window.NodeLink.link(sel.dataset.dc, sel.value === '' ? -1 : Number(sel.value), sel.value === '' ? '' : sel.dataset.suNl); if(sel.value === ''){ for(const x of App.net.getDimPlan(sel.dataset.dc).nodes) if(x.csvRef === sel.dataset.suNl) delete x.csvRef; } render(); });
    const nla = root.querySelector('[data-su-nlauto]'); if(nla) nla.onclick = () => { const k = window.NodeLink.autoLink(); App.ui.toast(`${k} ${t('names linked', 'namen gekoppeld')}`); render(); };
    const af = root.querySelector('[data-su-autofib]'); if(af) af.onclick = () => window.Fibers.autoDialog(render);
    const df = root.querySelector('[data-su-drawfib]'); if(df) df.onclick = () => { close(); window.Flow?.openFibres?.(); };
    const fb = root.querySelector('[data-su-fibers]'); if(fb) fb.onclick = () => { close(); App.navigate('NET'); window.NetworkPage?.render?.({ tab:'fibers' }); };
    const nf = root.querySelector('[data-su-nofiber]'); if(nf) nf.onclick = () => { state().skipped.fibers = true; dirty(); S.step = 'check'; render(); };
  }

  // A builder / report dialog that opens on top of the wizard: when it closes, return to the same step
  function comeBack(back, before){
    let tries = 0;
    const sel = '.rb:not(#suRoot), .modal-backdrop';
    const iv = setInterval(() => {
      const el = [...document.querySelectorAll(sel)].find(e => !before.has(e) && e.style.display !== 'none');
      if(el){
        clearInterval(iv);
        const mo = new MutationObserver(() => { if(!document.body.contains(el)){ mo.disconnect(); setTimeout(() => open(back), 80); } });
        mo.observe(document.body, { childList:true, subtree:true });
      } else if(++tries > 12) clearInterval(iv);
    }, 150);
  }

  window.Setup = { open, close, status, facts, STEPS };
  document.getElementById('tbSetup')?.addEventListener('click', () => open());
})();
