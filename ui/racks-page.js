// ui/racks-page.js — the page where DBs and their racks are made: add a DB (DimCity), build rack types in the Rack Builder,
// place racks in a DB (or a custom rack), see what each DB holds. The planning itself is the same as on the DimCity page
// (ui/rack-plan.js): this is only a front door that is always in the menu.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const U = { dc:null };

  function render(){
    const root = App.$('#lkDetail'); if(!root || M()?.ui?.view !== 'RACKS') return;
    const ds = App.sortedDims(); if(!U.dc || !ds.includes(U.dc)) U.dc = ds[0] || null;
    const types = M().networkDevices?.rackTypes || [];
    const sc = App.$('#mainScroll'), top = sc ? sc.scrollTop : 0;
    App.pageHead?.({ eyebrow:t('Build', 'Bouwen'), title:t('Racks & DBs', 'Racks & DB’s'), sub:t('Make the DBs of the show, build the racks and place them in the DBs. PatchLab then patches every LK and Veam onto the racks.', 'Maak de DB’s van de show, bouw de racks en plaats ze in de DB’s. PatchLab patcht daarna elke LK en Veam op de racks.'),
      actions:`<button id="rkPd" title="${t('Build the power racks (PDs): outlets, phases, groups', 'Bouw de stroomracks (PD’s): uitgangen, fases, groepen')}">${I('plug', 15)}${t('PD builder', 'PD-bouwer')}</button><button id="rkAddFoh" ${ds.includes('FOH') ? 'disabled' : ''}>${I('plus', 15)}FOH</button><button id="rkAddDb">${I('plus', 15)}${t('New DB', 'Nieuwe DB')}</button><button class="primary" id="rkBuilder">${I('rack', 15)}${t('Rack Builder', 'Rack Builder')}</button>` });
    const counts = id => ds.reduce((n, d) => n + (App.net.getDimPlan(d).racks || []).filter(r => r.rackId === id).length, 0);
    const lib = `<div class="rk-lib"><h3>${t('Rack types', 'Racktypes')} <span class="subtle">${types.length}</span></h3>${types.length ? `<div class="rk-types">${types.map(r => `<div class="rk-type"><b>${esc(r.name || r.id)}</b><span class="subtle">${r.heightU}U · ${(r.items || []).length} ${t('devices', 'apparaten')} · ${counts(r.id)}× ${t('placed', 'geplaatst')}</span></div>`).join('')}</div><div class="subtle">${t('Edit or make types in the Rack Builder. A rack is built once and can be placed in as many DBs as you like.', 'Wijzig of maak typen in de Rack Builder. Een rack bouw je één keer en je plaatst hem in zoveel DB’s als je wilt.')}</div>` : `<div class="hint">${I('info', 13)} ${t('No rack types yet. Press “Rack Builder” to build your first rack (choose the devices that sit in it), or place a custom rack straight in a DB below.', 'Nog geen racktypen. Druk op “Rack Builder” om je eerste rack te bouwen (kies de apparaten die erin zitten), of plaats hieronder een eigen rack direct in een DB.')}</div>`}</div>`;
    const chips = ds.length ? `<div class="rb-chips">${ds.map(d => { const n = (App.net.getDimPlan(d).racks || []).length; return `<label class="rb-chip ${d === U.dc ? 'on' : ''}"><input type="radio" name="rkdc" data-dc="${esc(d)}" ${d === U.dc ? 'checked' : ''}><i class="dot" style="background:${App.dimColor(d)}"></i>${esc(d)}<span class="subtle">${n} ${t('racks', 'racks')}</span></label>`; }).join('')}</div>` : '';
    const body = U.dc ? `<div id="rkPlan">${window.RackPlan?.cardHtml?.(U.dc) || ''}</div>` : `<div class="nc-empty">${I('rack', 30)}<b>${t('No DBs yet', 'Nog geen DB’s')}</b><span>${t('A DB appears when you import a patch (from the LK and Veam numbers), or add one here.', 'Een DB verschijnt als je een patch importeert (uit de LK- en Veam-nummers), of voeg er hier een toe.')}</span><button class="primary" id="rkAddDb2">${I('plus', 14)}${t('Add the first DB', 'Voeg de eerste DB toe')}</button></div>`;
    root.innerHTML = `<div class="stack rk">${lib}${chips}${body}</div>`;
    if(sc) sc.scrollTop = top;
    bind(root);
  }
  function bind(root){
    const addDb = name => { const r = App.addDimCity(name); if(!r.ok){ App.ui.toast(r.error, 'err'); return; } U.dc = r.id; App.renderAll(); App.ui.toast(`${r.id} ${t('added — now place a rack in it', 'toegevoegd — plaats er nu een rack in')}`, 'ok'); };
    const on = (id, fn, scope = document) => { const e = scope.querySelector(id); if(e) e.onclick = fn; };
    on('#rkAddDb', () => addDb(App.nextDbName())); on('#rkAddDb2', () => addDb(App.nextDbName())); on('#rkAddFoh', () => addDb('FOH'));
    on('#rkPd', () => { window.Power && (window.Power.state.tab = 'types', window.Power.state.pd = null); App.navigate('POWER'); });
    on('#rkBuilder', () => App.runCommand?.('deviceBuilder', 'rack'));
    root.querySelectorAll('[data-dc]').forEach(i => i.onchange = () => { U.dc = i.dataset.dc; render(); });
    if(U.dc) window.RackPlan?.bind?.(root, U.dc, render);
  }
  window.RacksPage = { render, state:U };
})();
