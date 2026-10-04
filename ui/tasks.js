// ui/tasks.js — the Tasks page: what is done, what is next, and where, at a glance.
//   · "Next up": the one thing to do now, with a button that takes you there
//   · the pipeline: the Setup steps in order as a visual line (done / to do / skipped)
//   · the matrix: every DB against every step, so you see which DB still needs what
//   · the show checks (project info, errors, PDF, saved …)
// Everything is worked out from the show itself (Setup.status / Setup.facts), so it is always true.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  // columns of the matrix = the Setup steps that belong to a DB
  const COLS = [
    { step:'racks',   icon:'rack',      en:'Rack & devices', nl:'Rack & apparaten' },
    { step:'lks',     icon:'box',       en:'LKs coupled',    nl:'LK\'s gekoppeld' },
    { step:'nodes',   icon:'network',   en:'Nodes',          nl:'Nodes' },
    { step:'network', icon:'switchDev', en:'Switch',         nl:'Switch' },
    { step:'fibers',  icon:'cable',     en:'Fibres',         nl:'Fibers' },
    { step:'check',   icon:'checkCircle', en:'No issues',    nl:'Geen meldingen' }
  ];
  function cell(col, dc, f){
    const x = f.per[dc], m = M();
    const isFoh = dc === 'FOH';
    switch(col.step){
      case 'racks':   return isFoh ? { s:'na', tip:t('FOH has no rack of its own', 'FOH heeft geen eigen rek') } : x.hasPlan ? { s:'done', tip:`${x.racks} ${t('racks', 'racks')} · ${x.loose} ${t('loose', 'los')}` } : { s:'todo', tip:t('No rack or loose devices yet', 'Nog geen rek of losse apparaten') };
      case 'lks':     return !x.hasPlan ? { s:isFoh ? 'na' : 'todo', tip:t('Place a rack first', 'Plaats eerst een rek') } : x.unfed ? { s:'warn', tip:`${x.unfed} ${t('lines without a node port', 'lijnen zonder nodepoort')}` } : { s:'done', tip:t('All lines patched', 'Alle lijnen gepatcht') };
      case 'nodes':   return x.nodes ? { s:'done', tip:`${x.nodes} ${t('nodes in the network plan', 'nodes in het netwerkplan')}` } : x.hasPlan ? { s:'todo', tip:t('Make the nodes from the rack', 'Maak de nodes uit het rek') } : { s:'na', tip:'' };
      case 'network': return x.switches.length ? { s:'done', tip:`${x.switches.length} ${t('switches', 'switches')}` } : { s:'todo', tip:t('No switch yet', 'Nog geen switch') };
      case 'fibers':  { const n = window.Fibers ? window.Fibers.links(dc).length : 0; return n ? { s:'done', tip:`${n} ${t('fibres', 'fibers')}` } : f.dims.length > 1 ? { s:'todo', tip:t('No fibre yet', 'Nog geen fiber') } : { s:'na', tip:'' }; }
      case 'check':   { const n = (m.issues || []).filter(i => i.dimcity === dc).length; return n ? { s:'warn', tip:`${n} ${t('open issues', 'open meldingen')}` } : { s:'done', tip:t('No open issues', 'Geen open meldingen') }; }
    }
    return { s:'na', tip:'' };
  }
  const ico = s => s === 'done' ? I('check', 15) : s === 'warn' ? I('alert', 15) : s === 'na' ? '–' : I('plus', 14);

  function render(){
    const root = App.$('#lkDetail'); if(!root) return;
    App.pageHead?.({ eyebrow:t('Project', 'Project'), title:t('Tasks', 'Taken'), sub:t('What is done, what is next and where — worked out from your show, so it is always true.', 'Wat klaar is, wat de volgende stap is en waar — berekend uit je show, dus altijd waar.'),
      actions:`<button class="primary" data-cmd="setup">${I('check', 15)}${t('Open Setup', 'Open Setup')}</button>` });
    const S = window.Setup; if(!S){ root.innerHTML = ''; return; }
    const f = S.facts(), dims = f.dims;
    const st = S.STEPS.map(s => ({ ...s, ...S.status(s.id, f) }));
    const next = st.find(s => !s.done && !s.skipped) || st.find(s => !s.done);
    const doneN = st.filter(s => s.done).length;
    // which DB first needs the next step?
    let nextDc = null;
    if(next){ const idx = COLS.findIndex(c => c.step === next.id); if(idx >= 0) nextDc = dims.find(d => { const c = cell(COLS[idx], d, f); return c.s === 'todo' || c.s === 'warn'; }) || null; }
    const nextCard = !dims.length
      ? `<div class="tk-next"><div class="tk-next-ic">${I('upload', 26)}</div><div class="tk-next-tx"><small>${t('Next up', 'Hierna')}</small><b>${t('Import your patch', 'Importeer je patch')}</b><span>${t('Bring in the CSV with the LK, Veam, DMX and network rows — or open the demo show to look around.', 'Haal de CSV met LK-, Veam-, DMX- en netwerkregels binnen — of open de demo-show om rond te kijken.')}</span></div><div class="tk-next-act"><button class="primary" data-cmd="importCsv">${I('upload', 14)}${t('Import CSV…', 'CSV importeren…')}</button><button data-cmd="demo">${t('Demo show', 'Demo-show')}</button></div></div>`
      : next
        ? `<div class="tk-next"><div class="tk-next-ic">${I(next.icon, 26)}</div><div class="tk-next-tx"><small>${t('Next up', 'Hierna')} · ${t('step', 'stap')} ${S.STEPS.indexOf(S.STEPS.find(s => s.id === next.id)) + 1} ${t('of', 'van')} ${S.STEPS.length}</small><b>${esc(t(next.en, next.nl))}${nextDc ? ` — ${esc(nextDc)}` : ''}</b><span>${esc(t(next.hen, next.hnl))}</span><em>${esc(next.detail)}</em></div><div class="tk-next-act"><button class="primary" data-tk-go="${next.id}" data-dc="${esc(nextDc || '')}">${t('Do this now', 'Doe dit nu')}</button></div></div>`
        : `<div class="tk-next ok"><div class="tk-next-ic">${I('star', 26)}</div><div class="tk-next-tx"><small>${t('All done', 'Alles klaar')}</small><b>${t('The show is ready', 'De show is klaar')}</b><span>${t('Export the PDF report and print the stickers.', 'Exporteer het PDF-rapport en print de stickers.')}</span></div><div class="tk-next-act"><button class="primary" id="tkPdf">${I('file', 14)}${t('Export PDF', 'PDF exporteren')}</button><button id="tkStk">${t('Stickers', 'Stickers')}</button></div></div>`;
    const pipe = `<div class="tk-pipe">${st.map((s, i) => `<button class="tk-node ${s.done ? 'done' : s.skipped ? 'skip' : (next && next.id === s.id ? 'now' : '')}" data-tk-go="${s.id}" title="${esc(s.detail)}"><span class="tk-dot">${s.done ? I('check', 16) : i + 1}</span><b>${esc(t(s.en, s.nl))}</b><em>${esc(s.skipped ? t('skipped', 'overgeslagen') : s.detail)}</em></button>`).join('<i class="tk-line"></i>')}</div>`;
    const matrix = dims.length ? `<div class="tk-matrix"><div class="tk-mrow tk-mhead"><span></span>${COLS.map(c => `<span title="${esc(t(c.en, c.nl))}">${I(c.icon, 15)}<small>${esc(t(c.en, c.nl))}</small></span>`).join('')}</div>${dims.map(d => `<div class="tk-mrow"><b class="tk-db"><i style="background:${App.dimColor(d)}"></i>${esc(d)}</b>${COLS.map(c => { const x = cell(c, d, f); return `<button class="tk-cell ${x.s}" ${x.s === 'na' ? 'disabled' : `data-tk-go="${c.step}" data-dc="${esc(d)}"`} title="${esc(x.tip)}">${ico(x.s)}</button>`; }).join('')}</div>`).join('')}</div>
      <div class="tk-key"><span><i class="done"></i>${t('done', 'klaar')}</span><span><i class="todo"></i>${t('to do', 'te doen')}</span><span><i class="warn"></i>${t('needs attention', 'aandacht nodig')}</span><span><i class="na"></i>${t('not needed', 'niet nodig')}</span></div>` : `<div class="subtle">${t('No DimCities yet.', 'Nog geen DimCities.')}</div>`;
    const P = window.Progress?.compute?.() || { steps:[], done:0, total:0 };
    const checks = `<div class="tk-checks">${P.steps.map(s => `<button class="tk-check ${s.done ? 'done' : ''}" data-tk-check="${esc(s.id)}">${I(s.done ? 'checkCircle' : 'clock', 16)}<span><b>${esc(s.label)}</b>${s.done ? '' : `<em>${esc(s.detail || '')}</em>`}</span></button>`).join('')}</div>`;
    root.innerHTML = `<div class="stack">
      ${nextCard}
      ${App.ui.card({ key:'tasks:pipe', title:t('The workflow', 'De werkwijze'), icon:'cable', meta:`${doneN}/${st.length}`, collapsible:false, body:pipe })}
      ${App.ui.card({ key:'tasks:matrix', title:t('Per DB', 'Per DB'), icon:'grid', meta:t('click a square to go there', 'klik op een vakje om ernaartoe te gaan'), collapsible:false, body:matrix })}
      ${App.ui.card({ key:'tasks:nc', title:t('Network config', 'Netwerkconfig'), icon:'sliders', collapsible:false, meta:'LumiNode · GigaCore', body:`<div class="subtle" style="margin-bottom:10px">${t('Discover all LumiNodes and GigaCore switches, paint the VLANs on the ports and the universes on the DMX ports, and send it.', 'Ontdek alle LumiNodes en GigaCore-switches, schilder de VLAN’s op de poorten en de universes op de DMX-poorten en stuur het.')}</div><button class="primary" data-cmd="align">${I('compass', 14)}${t('Open Align tool', 'Open Uitlijntool')}</button> <button data-cmd="netDevices">${I('sliders', 14)}${t('Open Network config', 'Open Netwerkconfig')}</button>` })}
      ${App.ui.card({ key:'tasks:ex', title:t('Exchange with other programs', 'Uitwisselen met andere programma\'s'), icon:'refresh', collapsible:false, meta:'Lightwright · Vectorworks', body:`<div class="subtle" style="margin-bottom:10px">${t('Send the patch to Lightwright or Vectorworks, and take their changes back — universe and position per LK / Veam port.', 'Stuur de patch naar Lightwright of Vectorworks en neem hun wijzigingen terug — universe en positie per LK-/Veam-poort.')}</div><button data-cmd="exchange">${I('refresh', 14)}${t('Open exchange…', 'Uitwisseling openen…')}</button> <button data-cmd="netDevices">${I('network', 14)}${t('Devices on the network…', 'Apparaten op het netwerk…')}</button>` })}
      ${App.ui.card({ key:'tasks:checks', title:t('Show checks', 'Controles van de show'), icon:'checkCircle', meta:`${P.done}/${P.total}`, body:checks })}
    </div>`;
    root.querySelectorAll('[data-tk-go]').forEach(b => b.onclick = () => S.open({ step:b.dataset.tkGo, dc:b.dataset.dc || undefined }));
    root.querySelectorAll('[data-tk-check]').forEach(b => b.onclick = () => { const s = P.steps.find(x => x.id === b.dataset.tkCheck); if(s && !s.done && s.go) s.go(); });
    root.querySelector('#tkPdf')?.addEventListener('click', () => window.PdfExport?.open?.());
    root.querySelector('#tkStk')?.addEventListener('click', () => document.getElementById('tbStickers')?.click());
  }
  // slim version for the Overview: the pipeline dots and the next step
  function miniHtml(){
    const S = window.Setup; if(!S) return '';
    const f = S.facts(); if(!f.dims.length) return '';
    const st = S.STEPS.map(s => ({ ...s, ...S.status(s.id, f) })), next = st.find(s => !s.done && !s.skipped) || st.find(s => !s.done);
    const dots = st.map((s, i) => `<i class="tk-mdot ${s.done ? 'done' : next && next.id === s.id ? 'now' : s.skipped ? 'skip' : ''}" title="${esc(t(s.en, s.nl))} — ${esc(s.detail)}">${s.done ? '✓' : i + 1}</i>`).join('<b class="tk-mline"></b>');
    return `<div class="tk-mini"><div class="tk-mdots">${dots}</div><div class="tk-mtx">${next ? `<small>${t('Next up', 'Hierna')}</small> <b>${esc(t(next.en, next.nl))}</b> <span>${esc(next.detail)}</span>` : `<b>${t('The show is ready — export the PDF.', 'De show is klaar — exporteer de PDF.')}</b>`}</div><button data-qr-open="*" class="sm" title="${esc(t('QR code for the whole system', 'QR-code voor het hele systeem'))}">QR</button><button data-view="TASKS" class="sm">${t('All tasks', 'Alle taken')}</button>${next ? `<button class="sm primary" onclick="window.Setup.open({step:'${next.id}'})">${t('Do this now', 'Doe dit nu')}</button>` : ''}</div>`;
  }
  window.Tasks = { render, cell, COLS, miniHtml };
})();
