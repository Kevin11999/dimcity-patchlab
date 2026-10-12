// ui/publish.js — the Publish window.
// Steps: 1 What (which documents, which DimCities) · 2 Content (the sections) · 3 Look (style, cover, logos) · 4 Publish (a folder, the files).
// The pages are made by export-pdf.js (core/paginate.js): what the preview shows is what the PDF holds.
// The choices are kept in the project (MODEL.pdfSettings.layout) and are the same for every DimCity.
(function(){
  'use strict';

  const PE = () => window.PdfExport;
  const App = () => window.LKApp;
  const getM = () => App()?.getMODEL?.() || null;
  const I = (n, s = 16) => window.Icons?.icon(n, s) || '';
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  const clone = x => JSON.parse(JSON.stringify(x));
  const MM = 3.7795275591;
  const $ = sel => document.querySelector(`#rbRoot ${sel}`);
  const toast = (msg, kind = 'info', o) => App()?.ui?.toast?.(msg, kind, o);

  let B = null;      // the state of the open window

  // ---------- Texts ----------
  const DOC_NL = {
    book:     ['Totaal DB-boek', 'Alle gekozen DimCities in één boekje: omslag, inhoudsopgave, bladnummers en de secties die je kiest.'],
    lk:       ['LK-info', 'De LK- / Veam-patchbladen, de universes en de patchlijst van een DimCity.'],
    nodes:    ['Node-info', 'Nodes, splitters, switches, racks en nodepoorten van een DimCity.'],
    stickers: ['Stickers', 'Labelvellen voor de nodes, de switches en de kabels, voor de Herma-vellen.'],
    a3:       ['Netwerkflow (A3)', 'De netwerkflow en de signaalstroom op A3: een bestand per DimCity en één voor de hele show.'],
    ip:       ['IP-adresboek', 'Elk adres van de nodes, switches en consoles: per DimCity, per VLAN en op nummer.']
  };
  const docTitle = k => t(PE().DOCS[k].title, DOC_NL[k][0]);
  const docDesc = k => t(PE().DOCS[k].desc, DOC_NL[k][1]);
  const DOC_SHORT = () => ({ book:t('Book', 'Boek'), lk:t('LK info', 'LK-info'), nodes:t('Node info', 'Node-info') });
  // the sections of the Content step in Dutch (the PDF itself stays English)
  const SEC_NL = {
    summary:['DimCity-kop en kerncijfers', 'Naam van de DimCity, projectregel en totalen.'],
    switches:['Switches: poorten en VLAN', 'Per switch: een tekening van de poorten in de VLAN-kleuren en een tabel met apparaat, VLAN, PoE, snelheid en universes.'],
    network:['Netwerk- / DMX-nodes', 'Geplande nodes met IP en universe per poort.'],
    splitters:['Splitters', 'Splitters met ingangsvoeding en uitgangsoverzicht.'],
    racks:['Racks', 'Racks met aansluitingen, nodekleuren en patchtabel.'],
    flow:['Signaalstroom-tekening', 'De bekabeling van rek naar objecten, zoals ingedeeld op de pagina Signaalstroom.'],
    patch:['LK- / Veam-patch', 'Elke LK als rij van 12 poorten met zijn Veam4’s eronder: universe, en de node en nodepoort waar elke poort op zit.'],
    universes:['Universe-overzicht', 'Patchpunten per universe (LK / Veam / DMX).'],
    patchlist:['Patchlijst-tabel', 'Alle regels van deze DimCity op universe gesorteerd.'],
    warnings:['Waarschuwingen en fouten', 'Validatieresultaten voor deze DimCity.'],
    qr:['QR-codes (de hele DB)', 'QR-codes met alles van deze DB als tekst: aansluitingen, nodes met IP, switches, fibers. Optioneel: het hele systeem.'],
    notes:['Notities', 'Vrije tekst, bijvoorbeeld instructies voor de crew.']
  };
  const OPT_NL = {
    'Include universe overview table':'Universe-overzichtstabel opnemen', 'Show switches placeholder':'Plaatshouder voor switches tonen', 'All addresses of a device and the switch port plan':'Alle adressen van een apparaat en het switchpoortplan',
    'Overview of all switches and their fibres first':'Eerst een overzicht van alle switches en hun fibers', 'Show the port names typed by hand':'De met de hand getypte poortnamen tonen',
    'Show the node and node port per port':'Node en nodepoort per poort tonen', 'Include Veams that are not linked to an LK':'Veams die niet aan een LK hangen opnemen', 'Show location per port':'Locatie per poort tonen',
    'Show source (LK / Veam) per port':'Bron (LK / Veam) per poort tonen', 'Tint Veam groups A / B / C':'Veam-groepen A / B / C inkleuren', 'Include loose DMX':'Losse DMX opnemen',
    'Rack drawing':'Rektekening', 'Node ports (which LK / Veam port is on which node port)':'Nodepoorten (welke LK- / Veam-poort op welke nodepoort zit)', 'Loose devices (nodes and spiders without a rack)':'Losse apparaten (nodes en spinnen zonder rek)',
    'Patch table (node port → LK / Veam)':'Patchtabel (nodepoort → LK / Veam)', 'Notes (what is still needed)':'Opmerkingen (wat er nog nodig is)', 'Cable legend':'Kabellegenda', 'Start on a new sheet':'Op een nieuw blad beginnen',
    'Also a drawing of only the network (switches, Cat cables, fibres)':'Ook een tekening van alleen het netwerk (switches, Cat-kabels, fibers)', 'Include project-wide issues':'Projectbrede problemen opnemen',
    'Also the QR set for the whole system (first DB only)':'Ook de QR-set voor het hele systeem (alleen de eerste DB)'
  };
  const STEPS = () => [['what', t('What', 'Wat')], ['content', t('Content', 'Inhoud')], ['look', t('Look', 'Opmaak')], ['publish', t('Publish', 'Publiceren')]];
  const STICKER_KINDS = () => [
    ['nodes', t('Node stickers', 'Nodestickers'), t('A sticker on every node: its ports with universe and LK / Veam, the address with the VLAN colour, the switch port', 'Een sticker op elke node: zijn poorten met universe en LK / Veam, het adres met de VLAN-kleur, de switchpoort')],
    ['nodePorts', t('Node port labels', 'Nodepoort-labels'), t('One label per DMX port with its universe and where it goes', 'Eén label per DMX-poort met universe en waar hij heen gaat')],
    ['switches', t('Switch stickers', 'Switchstickers'), t('A sticker on every switch: every port in its VLAN colour with what sits on it, the address and the VLANs in use', 'Een sticker op elke switch: elke poort in zijn VLAN-kleur met wat erop zit, het adres en de VLAN’s in gebruik')],
    ['switchPorts', t('Switch port labels', 'Switchpoort-labels'), t('One label per port with the device and the VLAN colour', 'Eén label per poort met het apparaat en de VLAN-kleur')],
    ['cables', t('Cable and panel labels', 'Kabel- en paneellabels'), t('LK / Veam cables, panel strips, network cables and fibres', 'LK- / Veam-kabels, paneelstrips, netwerkkabels en fibers')],
    ['together', t('One run across the DimCities', 'Doorlopend over de DimCities'), t('Off: every DimCity starts on its own sheet. On: DB1 fills the sheet and DB2 goes on right behind it, so no stickers are wasted (one file per kind of sticker)', 'Uit: elke DimCity begint op een eigen vel. Aan: DB1 vult het vel en DB2 gaat er direct achteraan door, zodat er geen stickers verspild worden (één bestand per soort sticker)')]
  ];

  // ---------- State helpers ----------
  const dims = () => PE().allDims();
  const sel = () => PE().selectedDims(B.L);
  const plan = () => PE().filePlan(B.L, sel(), PE().currentMeta());
  // the files that really get made: a DimCity with nothing for a document gets no file (known once the pages are counted)
  const todo = () => plan().filter(f => !B.pages.get(f.id)?.empty);
  const sig = () => `${B.ver}`;
  function persist(){
    const M = getM(); if(!M || !B || B.temp) return;
    const before = JSON.stringify(M.pdfSettings?.layout || null);
    M.pdfSettings = { ...(M.pdfSettings || {}), layout:clone(B.L), page:B.L.page.orientation };
    if(before !== JSON.stringify(B.L) && M.ui) M.ui.dirty = true;
  }
  const changed = (rerender = false) => {
    B.ver++; B.cache.clear(); B.pages.clear(); B.status.clear();
    if(rerender) renderPanel();
    renderPvBar(); schedulePreview(); updateSummary();
    if(B.step === 'publish') { renderFiles(); scheduleCount(); }
  };

  // ---------- Open / close ----------
  function open(opts = {}){
    const M = getM(); if(!M) return;
    if(!(M.byDim && M.byDim.size)){ toast(t('Nothing to publish yet — import a CSV or add an LK first.', 'Nog niets te publiceren — importeer eerst een CSV of voeg een LK toe.'), 'info'); return; }
    const L = PE().layoutFromSettings(M.pdfSettings);
    if(Array.isArray(opts.dcs) && opts.dcs.length){ L.scope = 'SEL'; L.dims = opts.dcs.slice(); }
    if(opts.preset && PE().PRESETS[opts.preset]){
      PE().PRESETS[opts.preset].apply(L);
      L.docs = { ...L.docs, book:true, lk:false, nodes:false, stickers:false, a3:false, ip:false };
      L.publish = { ...L.publish, structure:false };
    }
    const first = L.docs.book ? 'book' : L.docs.lk ? 'lk' : L.docs.nodes ? 'nodes' : L.docs.ip ? 'ip' : 'book';
    const step = opts.step || (opts.preset ? 'publish' : 'what');
    B = { L, step, lookTab:'style', expanded:null, selSec:null, zoom:'fit', view:step === 'publish' ? 'files' : 'pages', pv:{ doc:first, dc:null }, timer:null, countTimer:null, token:0, ver:0,
      cache:new Map(), pages:new Map(), status:new Map(), temp:!!opts.preset, busy:false, last:null, countToken:0 };
    mount();
  }
  function close(save = true){
    if(!B) return;
    if(save) persist();
    clearTimeout(B.timer); clearTimeout(B.countTimer); B.token++; B.countToken++;
    document.getElementById('rbRoot')?.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', applyZoom);
    B = null;
  }
  function onKey(e){
    if(!B) return;
    if(e.key === 'Escape' && !B.busy && !document.querySelector('.modal-backdrop')){ e.preventDefault(); close(true); }
  }

  // ---------- The window ----------
  function mount(){
    document.getElementById('rbRoot')?.remove();
    const root = document.createElement('div');
    root.id = 'rbRoot'; root.className = 'rb pb';
    root.innerHTML = `
      <div class="rb-top">
        <div class="rb-title">${I('file', 18)}<div><b>${t('Publish', 'Publiceren')}</b><span id="rbSummary"></span></div></div>
        <div class="rb-top-mid"><nav class="pb-steps" id="rbSteps"></nav></div>
        <div class="rb-top-actions"><button id="rbClose">${t('Close', 'Sluiten')}</button></div>
      </div>
      <div class="rb-body">
        <aside class="rb-panel"><div class="rb-panel-body" id="rbPanel"></div>
          <div class="pb-nav"><button id="pbBack">${I('chevronLeft', 14)}${t('Back', 'Terug')}</button><span class="subtle" id="pbStepInfo"></span><button class="primary" id="pbNext"><span>${t('Next', 'Volgende')}</span></button></div></aside>
        <section class="rb-preview">
          <div class="rb-preview-bar">
            <div class="segmented" id="pbView"><button data-v="pages">${I('file', 13)}${t('Pages', 'Pagina’s')}</button><button data-v="files">${I('folder', 13)}${t('Files', 'Bestanden')}</button></div>
            <span class="pb-pv" id="pbPv"></span>
            <span class="subtle" id="rbPageInfo"></span>
            <span class="spacer"></span>
            <span class="subtle rb-hint" id="rbHint"></span>
            <div class="segmented" id="rbZoom"><button data-z="fit">${t('Fit', 'Passend')}</button><button data-z="0.5">50%</button><button data-z="0.75">75%</button><button data-z="1">100%</button></div>
          </div>
          <iframe id="rbFrame" title="${esc(t('Preview of the pages', 'Voorbeeld van de pagina’s'))}"></iframe>
          <div class="pb-files" id="pbFiles" hidden></div>
        </section>
      </div>`;
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', applyZoom);
    $('#rbClose').onclick = () => close(true);
    $('#pbBack').onclick = () => go(-1);
    $('#pbNext').onclick = () => B.step === 'publish' ? doPublish() : go(1);
    root.querySelectorAll('#rbZoom button').forEach(b => b.onclick = () => { B.zoom = b.dataset.z; applyZoom(); });
    root.querySelectorAll('#pbView button').forEach(b => b.onclick = () => { B.view = b.dataset.v; syncView(); });
    renderSteps(); renderPanel(); renderPvBar(); syncView(); updateSummary(); schedulePreview(true);
    if(B.step === 'publish') scheduleCount();
  }
  const stepIndex = () => STEPS().findIndex(s => s[0] === B.step);
  function go(d){ const i = Math.max(0, Math.min(3, stepIndex() + d)); setStep(STEPS()[i][0]); }
  function setStep(k){
    B.step = k; B.view = k === 'publish' ? 'files' : 'pages';
    renderSteps(); renderPanel(); syncView();
    if(k === 'publish'){ renderFiles(); scheduleCount(); }
  }
  function renderSteps(){
    const el = $('#rbSteps'); if(!el) return;
    el.innerHTML = STEPS().map(([k, l], i) => `<button data-step="${k}" class="${B.step === k ? 'active' : ''} ${i < stepIndex() ? 'past' : ''}"><i>${i + 1}</i>${esc(l)}</button>`).join('<span class="pb-sep"></span>');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { if(!B.busy) setStep(b.dataset.step); });
    document.getElementById('rbRoot')?.classList.toggle('busy', !!B.busy);
    const i = stepIndex();
    $('#pbBack').disabled = i === 0 || B.busy;
    const cl = $('#rbClose'); if(cl) cl.disabled = !!B.busy;
    const nx = $('#pbNext');
    nx.querySelector('span').textContent = B.step === 'publish' ? publishLabel() : t('Next', 'Volgende');
    nx.disabled = B.busy || (B.step === 'publish' && !todo().length);
    $('#pbStepInfo').textContent = `${i + 1} / 4`;
  }
  function publishLabel(){ const n = todo().length; return `${t('Publish', 'Publiceer')} ${n} ${n === 1 ? t('file', 'bestand') : t('files', 'bestanden')}`; }
  function updateSummary(){
    const s = $('#rbSummary'); if(!s || !B) return;
    const dcs = sel(), n = todo().length;
    s.textContent = `${dcs.length} ${dcs.length === 1 ? 'DimCity' : 'DimCities'} · ${n} ${n === 1 ? t('file', 'bestand') : t('files', 'bestanden')}${B.temp ? ` · ${t('temporary layout (your saved layout is kept)', 'tijdelijke indeling (je bewaarde indeling blijft)')}` : ''}`;
    const nx = $('#pbNext'); if(nx && B.step === 'publish'){ nx.querySelector('span').textContent = B.busy ? t('Publishing…', 'Bezig met publiceren…') : publishLabel(); nx.disabled = B.busy || !n; }
  }
  function syncView(){
    const files = B.view === 'files';
    $('#rbFrame').hidden = files; $('#pbFiles').hidden = !files;
    document.querySelectorAll('#rbRoot #pbView button').forEach(b => b.classList.toggle('active', b.dataset.v === B.view));
    $('#rbZoom').style.display = files ? 'none' : '';
    $('#pbPv').style.display = files ? 'none' : '';
    $('#rbPageInfo').style.display = files ? 'none' : '';
    const h = $('#rbHint'); if(h) h.innerHTML = files ? `${I('info', 13)} ${t('These files are made in the folder you choose', 'Deze bestanden worden gemaakt in de map die je kiest')}` : `${I('info', 13)} ${t('The pages are the ones in the PDF · click a part to edit it', 'Dit zijn de pagina’s uit de PDF · klik op een deel om het aan te passen')}`;
    if(files) renderFiles(); else { applyZoom(); if(B.stale) schedulePreview(true); }
  }

  // ---------- Panels ----------
  const sw = (id, on, label, extra = '') => `<label class="rb-row"><span>${label}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${extra}><span></span></span></label>`;
  function renderPanel(){
    const root = document.getElementById('rbRoot'); if(!root) return;
    const P = root.querySelector('#rbPanel'), keep = P.scrollTop;
    P.innerHTML = B.step === 'what' ? panelWhat() : B.step === 'content' ? panelContent() : B.step === 'look' ? panelLook() : panelPublish();
    P.scrollTop = keep;
    bindPanel(P);
    if(B.step === 'content') renderTemplates();
    renderSteps();
  }

  // ---- 1 · What ----
  function panelWhat(){
    const L = B.L, all = dims(), cur = sel(), files = plan(), count = k => files.filter(f => f.kind === k || (k === 'stickers' && f.kind === 'stickers') || (k === 'a3' && f.kind === 'a3all')).length;
    const scope = `<div class="rb-group"><div class="rb-label">DimCities</div>
      <div class="segmented rb-full" id="rbScope"><button data-v="ALL" class="${L.scope !== 'SEL' ? 'active' : ''}">${t('All', 'Alle')} (${all.length})</button><button data-v="SEL" class="${L.scope === 'SEL' ? 'active' : ''}">${t('Choose…', 'Kies…')}</button></div>
      ${L.scope === 'SEL' ? `<div class="rb-chips">${all.map(dc => `<label class="rb-chip ${L.dims.includes(dc) ? 'on' : ''}"><input type="checkbox" data-dim="${esc(dc)}" ${L.dims.includes(dc) ? 'checked' : ''}><span class="dot" style="background:${esc(App().dimColor?.(dc) || '#2563eb')}"></span>${esc(PE().dcName(dc))}</label>`).join('')}</div>` : ''}
      <div class="hint">${cur.length === 1 ? t('Only this DimCity is published.', 'Alleen deze DimCity wordt gepubliceerd.') : t('Every choice below is the same for every DimCity.', 'Elke keuze hieronder geldt voor elke DimCity.')}</div></div>`;
    const kinds = L.docs.stickerKinds || {}, SL = window.Labels, sheet = SL ? SL.state().sheet : '', sheetBig = SL ? SL.state().sheetBig : '';
    // the sheets: the HERMA ones and your own, and "New sheet…" (asks for a name and the sizes, then saves it)
    const sheetOpts = cur => `${(SL?.allSheets?.() || []).map(x => `<option value="${esc(x.id)}" ${cur === x.id ? 'selected' : ''}>${esc(SL.sheetName(x))}</option>`).join('')}${cur === 'custom' ? `<option value="custom" selected>${t('Custom sheet (not saved)', 'Eigen vel (niet opgeslagen)')}</option>` : ''}<option value="__new">${t('New sheet…', 'Nieuw vel…')}</option>`;
    const docRow = k => {
      const on = !!L.docs[k], n = count(k);
      return `<div class="pb-doc ${on ? 'on' : ''}" data-doc="${k}">
        <label class="switch"><input type="checkbox" data-doc-on="${k}" ${on ? 'checked' : ''}><span></span></label>
        <div class="pb-doc-t"><b>${esc(docTitle(k))}</b><span>${esc(docDesc(k))}</span>${on ? `<em>${n} ${n === 1 ? t('file', 'bestand') : t('files', 'bestanden')}</em>` : ''}</div>
        <button class="ghost sm icon-only" data-doc-eye="${k}" title="${esc(t('Show it in the preview', 'Toon in het voorbeeld'))}">${I('eye', 15)}</button>
      </div>${k === 'stickers' && on ? `<div class="pb-sub">
        ${STICKER_KINDS().map(([kk, label, hint]) => `<label class="rb-row sm" title="${esc(hint)}"><span>${esc(label)}</span><span class="switch"><input type="checkbox" data-stk="${kk}" ${kinds[kk] ? 'checked' : ''}><span></span></span></label>`).join('')}
        <div class="pb-sheet"><label class="field">${t('Sheet for node and switch stickers', 'Vel voor node- en switchstickers')}<select id="pbSheetBig">${sheetOpts(sheetBig)}</select></label>
          <label class="field">${t('Sheet for the rest (cables, panels …)', 'Vel voor de rest (kabels, panelen …)')}<select id="pbSheet">${sheetOpts(sheet)}</select></label>
          <button class="sm" id="pbStickerOpen">${I('grid', 13)}${t('Sticker settings…', 'Stickerinstellingen…')}</button></div></div>` : ''}`;
    };
    // the groups: Network (IP overview with the VLANs, nodes, network flow, node and switch stickers), LK, Stickers, Handbook. Every part can also be ticked on its own.
    const stkRow = kk => { const hit = STICKER_KINDS().find(x => x[0] === kk), on = !!L.docs.stickers && !!kinds[kk]; return `<div class="pb-doc ${on ? 'on' : ''}"><label class="switch"><input type="checkbox" data-stk="${kk}" ${on ? 'checked' : ''}><span></span></label><div class="pb-doc-t"><b>${esc(hit[1])}</b><span>${esc(hit[2])}</span></div></div>`; };
    const netOn = ['ip', 'nodes', 'a3'].every(k => L.docs[k]) && L.docs.stickers && kinds.nodes && kinds.switches;
    const grp = (key, title, body, sw) => `<div class="rb-group pb-grp"><div class="rb-label pb-grp-h"><span>${title}</span>${sw ? `<label class="switch" title="${esc(t('Everything in this group', 'Alles in deze groep'))}"><input type="checkbox" data-grp="${key}" ${sw === 'on' ? 'checked' : ''}><span></span></label>` : ''}</div><div class="pb-docs">${body}</div></div>`;
    return `${scope}${grp('net', t('Network', 'Netwerk'), `${docRow('ip')}${docRow('nodes')}${docRow('a3')}${stkRow('nodes')}${stkRow('switches')}`, netOn ? 'on' : 'off')}
      ${grp('lk', 'LK', docRow('lk'))}${grp('stk', t('Stickers', 'Stickers'), docRow('stickers'))}${grp('book', t('Handbook', 'Handboek'), docRow('book'))}
      <div class="rb-group"><div class="hint">${I('info', 12)} ${t('The next steps set what is in these documents and how they look. They are the same for every DimCity. Step 4 chooses the folder.', 'De volgende stappen bepalen wat erin staat en hoe ze eruitzien. Ze gelden voor elke DimCity. Stap 4 kiest de map.')}</div></div>`;
  }

  // ---- 2 · Content ----
  function panelContent(){
    const L = B.L, PEx = PE(), short = DOC_SHORT();
    const tpl = `<div class="rb-group"><div class="rb-label">${t('Template', 'Template')}</div><div class="pb-tpl"><select id="rbTemplate"></select><button class="sm" id="rbSaveTpl">${I('copy', 14)}${t('Save as template', 'Opslaan als template')}</button></div></div>`;
    const secs = L.sections.map((s, i) => {
      const meta = PEx.SECTIONS[s.key], open = B.expanded === s.key, opts = PEx.SECTION_OPTS[s.key] || [];
      const optHtml = s.key === 'notes'
        ? `<label class="field" style="margin-top:4px">${t('Text', 'Tekst')}<textarea rows="5" data-notes placeholder="${esc(t('Crew instructions, contact numbers… Supports {project}, {dimcity}, {date}.', 'Instructies voor de crew, telefoonnummers… Kent {project}, {dimcity}, {date}.'))}">${esc(s.opts?.text || '')}</textarea></label>`
        : opts.map(([k, label, def]) => `<label class="rb-row sm"><span>${esc(t(label, OPT_NL[label] || label))}</span><span class="switch"><input type="checkbox" data-opt="${k}" data-sec="${s.key}" ${(s.opts?.[k] ?? def) ? 'checked' : ''}><span></span></span></label>`).join('');
      const p = PEx.normPos(s.pos), cbx = PEx.contentBox(L);
      const posHtml = `<div class="rb-pos-sec">
          <div class="rb-pos-head"><span>${t('Position on the sheet', 'Positie op het blad')}</span><div class="segmented" data-posmode="${s.key}"><button data-v="auto" class="${p ? '' : 'active'}">${t('Auto', 'Automatisch')}</button><button data-v="fixed" class="${p ? 'active' : ''}">${t('Fixed', 'Vast')}</button></div></div>
          ${p ? `<div class="rb-pos-fields">
            <label>X <input type="number" data-pos="x" data-sec="${s.key}" min="0" max="${Math.floor(cbx.w)}" step="${PEx.GRID_MM}" value="${p.x}"><span>mm</span></label>
            <label>Y <input type="number" data-pos="y" data-sec="${s.key}" min="0" max="${Math.floor(cbx.h)}" step="${PEx.GRID_MM}" value="${p.y}"><span>mm</span></label>
            <label>${t('Width', 'Breedte')} <input type="number" data-pos="w" data-sec="${s.key}" min="20" max="${Math.floor(cbx.w)}" step="${PEx.GRID_MM}" value="${p.w}"><span>mm</span></label>
          </div><div class="hint">${t(`Drag the orange handle in the preview to move it (snaps to ${PEx.GRID_MM} mm). The sheet is ${Math.round(cbx.w)} × ${Math.round(cbx.h)} mm inside the margins; the position is on the first sheet of every DimCity.`, `Sleep de oranje greep in het voorbeeld om hem te verplaatsen (springt naar ${PEx.GRID_MM} mm). Het blad is ${Math.round(cbx.w)} × ${Math.round(cbx.h)} mm binnen de marges; de positie geldt op het eerste blad van elke DimCity.`)}</div>` : `<div class="hint">${t('Auto: sections follow each other from top to bottom. Choose Fixed, or drag the handle in the preview, to place this section yourself.', 'Automatisch: secties volgen elkaar van boven naar beneden op. Kies Vast, of sleep de greep in het voorbeeld, om deze sectie zelf te plaatsen.')}</div>`}
        </div>`;
      return `<div class="rb-sec ${s.on ? '' : 'off'} ${open ? 'open' : ''} ${B.selSec === s.key ? 'sel' : ''} ${p ? 'has-pos' : ''}" draggable="true" data-key="${s.key}">
        <div class="rb-sec-head">
          <span class="grip" title="${esc(t('Drag to reorder', 'Sleep om te ordenen'))}">${I('grip', 14)}</span>
          <label class="switch" title="${esc(s.on ? t('Hide section', 'Sectie verbergen') : t('Show section', 'Sectie tonen'))}"><input type="checkbox" data-on="${s.key}" ${s.on ? 'checked' : ''}><span></span></label>
          <div class="rb-sec-title" data-toggle="${s.key}"><b>${I(meta.icon, 14)} ${esc(t(meta.title, SEC_NL[s.key][0]))}${p ? `<span class="tag" title="${esc(t('Fixed position', 'Vaste positie'))}">${p.x}, ${p.y} mm</span>` : ''}</b><span>${esc(t(meta.desc, SEC_NL[s.key][1]))}</span><span class="pb-docs-in">${meta.docs.map(d => `<em>${esc(short[d])}</em>`).join('')}</span></div>
          <div class="rb-sec-move"><button class="ghost sm icon-only" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="${esc(t('Move up', 'Omhoog'))}">${I('chevronDown', 13).replace('<svg', '<svg style="transform:rotate(180deg)"')}</button><button class="ghost sm icon-only" data-down="${i}" ${i === L.sections.length - 1 ? 'disabled' : ''} title="${esc(t('Move down', 'Omlaag'))}">${I('chevronDown', 13)}</button></div>
          <button class="ghost sm icon-only" data-toggle="${s.key}" title="${esc(t('Options', 'Opties'))}">${I(open ? 'chevronDown' : 'chevronRight', 14)}</button>
        </div>
        ${open ? `<div class="rb-sec-opts">${optHtml}${posHtml}</div>` : ''}
      </div>`;
    }).join('');
    return `${tpl}<div class="rb-group"><div class="rb-label">${t('Sections per DimCity', 'Secties per DimCity')} <span class="subtle">· ${t('drag to reorder', 'sleep om te ordenen')}</span></div>
      <div class="hint" style="margin:-2px 0 8px">${t('The small labels show where a section is used: in the total book, in LK info, in Node info.', 'De kleine labels tonen waar een sectie wordt gebruikt: in het totaalboek, in LK-info, in Node-info.')}</div>
      <div class="rb-secs" id="rbSecs">${secs}</div></div>`;
  }

  // ---- 3 · Look ----
  function panelLook(){
    const tabs = `<div class="rb-tabs segmented" id="rbTabs"><button data-tab="style" class="${B.lookTab === 'style' ? 'active' : ''}">${I('sliders', 14)}${t('Style', 'Stijl')}</button><button data-tab="cover" class="${B.lookTab === 'cover' ? 'active' : ''}">${I('image', 14)}${t('Cover', 'Voorblad')}</button><button data-tab="brand" class="${B.lookTab === 'brand' ? 'active' : ''}">${I('star', 14)}${t('Logos', 'Logo’s')}</button></div>`;
    return tabs + (B.lookTab === 'style' ? panelStyle() : B.lookTab === 'cover' ? panelCover() : panelBrand());
  }
  function panelStyle(){
    const L = B.L, accents = ['#ff8a1f', '#2563eb', '#0f766e', '#7c3aed', '#dc2626', '#0f172a'];
    return `<div class="rb-group"><div class="rb-label">${t('Page', 'Pagina')}</div>
        <div class="form-grid">
          <label class="field">${t('Paper size', 'Papierformaat')}<select id="rbSize">${Object.keys({ A4:1, A3:1, Letter:1 }).map(k => `<option ${L.page.size === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          <label class="field">${t('Orientation', 'Richting')}<select id="rbOrient"><option value="portrait" ${L.page.orientation !== 'landscape' ? 'selected' : ''}>${t('Portrait', 'Staand')}</option><option value="landscape" ${L.page.orientation === 'landscape' ? 'selected' : ''}>${t('Landscape', 'Liggend')}</option></select></label>
          <label class="field span-2">${t('Margins', 'Marges')} <span class="subtle" id="rbMarginVal">${L.page.margin} mm</span><input type="range" id="rbMargin" min="5" max="20" step="1" value="${L.page.margin}"></label>
          <label class="field span-2">${t('The A3 drawings (network flow)', 'De A3-tekeningen (netwerkflow)')}<select id="rbA3Orient"><option value="auto" ${!['landscape', 'portrait'].includes(L.a3.orientation) ? 'selected' : ''}>${t('Automatic — the best fit', 'Automatisch — wat het best past')}</option><option value="landscape" ${L.a3.orientation === 'landscape' ? 'selected' : ''}>${t('A3 landscape', 'A3 liggend')}</option><option value="portrait" ${L.a3.orientation === 'portrait' ? 'selected' : ''}>${t('A3 portrait', 'A3 staand')}</option></select></label>
        </div></div>
      <div class="rb-group"><div class="rb-label">${t('Look', 'Uiterlijk')}</div>
        <label class="field">${t('Accent color', 'Accentkleur')}</label>
        <div class="rb-swatches">${accents.map(c => `<button class="color-swatch ${L.style.accent === c ? 'active' : ''}" data-accent="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="rbAccent" value="${/^#[0-9a-fA-F]{6}$/.test(L.style.accent) ? L.style.accent : '#ff8a1f'}"></div>
        <div class="form-grid" style="margin-top:12px">
          <label class="field">Font<select id="rbFont"><option value="helvetica" ${L.style.font === 'helvetica' ? 'selected' : ''}>Helvetica / Arial</option><option value="system" ${L.style.font === 'system' ? 'selected' : ''}>System UI</option><option value="georgia" ${L.style.font === 'georgia' ? 'selected' : ''}>Georgia (serif)</option></select></label>
          <label class="field">${t('Text size', 'Tekstgrootte')}<select id="rbFs">${[8, 8.5, 9, 9.5, 10, 11].map(v => `<option value="${v}" ${Number(L.style.fontSize) === v ? 'selected' : ''}>${v} pt</option>`).join('')}</select></label>
          <label class="field span-2">${t('Density', 'Dichtheid')}<div class="segmented rb-full" id="rbDensity"><button data-v="compact" class="${L.style.density === 'compact' ? 'active' : ''}">${t('Compact', 'Compact')}</button><button data-v="comfortable" class="${L.style.density !== 'compact' ? 'active' : ''}">${t('Comfortable', 'Ruim')}</button></div></label>
        </div>
        <label class="field" style="margin-top:12px">${t('Line weight', 'Lijndikte')}<div class="segmented rb-full" id="rbLine">${[['light', t('Light', 'Licht')], ['normal', t('Normal', 'Normaal')], ['bold', t('Bold', 'Dik')]].map(([v, l]) => `<button data-v="${v}" class="${(L.style.lineWeight || 'normal') === v ? 'active' : ''}">${l}</button>`).join('')}</div></label>
        <div class="hint">${t('Normal and Bold give darker, thicker lines that stay readable on paper.', 'Normaal en Dik geven donkerdere, dikkere lijnen die op papier leesbaar blijven.')}</div>
        ${sw('rbColorU', L.style.colorUniverses, t('Color-code universes', 'Universes in kleur'))}
        ${sw('rbBand', L.style.dimBand, t('Use DimCity color in headers', 'DimCity-kleur in de koppen'))}
        ${sw('rbGray', L.style.grayscale, t('Print-friendly grayscale', 'Grijswaarden om te printen'))}
      </div>
      <div class="rb-group"><div class="rb-label">${t('Header & footer', 'Kop & voet')}</div>
        ${sw('rbHead', L.header.show, t('Running header on every page', 'Lopende kop op elke pagina'))}
        ${L.header.show ? `<label class="field"><input type="text" id="rbHeadText" value="${esc(L.header.text)}"></label>` : ''}
        ${sw('rbFoot', L.footer.show, t('Footer on every page', 'Voet op elke pagina'))}
        ${L.footer.show ? `<div class="form-grid"><label class="field">${t('Left', 'Links')}<input type="text" id="rbFootL" value="${esc(L.footer.left)}"></label><label class="field">${t('Center', 'Midden')}<input type="text" id="rbFootC" value="${esc(L.footer.center)}"></label></div>${sw('rbPageNo', L.footer.pageNumbers, t('Page numbers (Page 3 of 12)', 'Bladnummers (Page 3 of 12)'))}` : ''}
        <div class="hint">${t('Placeholders', 'Plaatshouders')}: {project} {area} {location} {date} {prepared} {dimcity}</div>
      </div>`;
  }
  function panelBrand(){
    const L = B.L, b = L.brand, wm = b.wm, meta = PE().currentMeta();
    const range = (id, label, v, min, max, unit, step = 1) => `<label class="field">${label} <span class="subtle" id="${id}Val">${v}${unit}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
    const posSeg = (id, cur) => `<div class="segmented rb-full rb-wrap" id="${id}">${[['none', t('Off', 'Uit')], ['header-left', t('Top left', 'Boven links')], ['header-right', t('Top right', 'Boven rechts')], ['footer-left', t('Bottom left', 'Onder links')], ['footer-right', t('Bottom right', 'Onder rechts')]].map(([v, l]) => `<button data-v="${v}" class="${cur === v ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    return `<div class="rb-group"><div class="rb-label">${t('Project logo', 'Projectlogo')}</div>
        <div class="rb-logo">${meta.logo ? `<img src="${meta.logo}" alt="">` : `<div class="rb-logo-empty">${I('image', 22)}<span>${t('No project logo', 'Geen projectlogo')}</span></div>`}
          <div class="rb-logo-actions"><button class="sm" id="rbLogoPick">${I('upload', 13)}${meta.logo ? t('Replace', 'Vervangen') : t('Upload', 'Uploaden')}</button>${meta.logo ? `<button class="sm ghost" id="rbLogoDel">${I('trash', 13)}${t('Remove', 'Verwijderen')}</button>` : ''}</div></div>
        <input type="file" id="rbLogoFile" accept="image/*" hidden>
        ${meta.logo ? `<div class="rb-label" style="margin-top:14px">${t('On every page', 'Op elke pagina')}</div>${posSeg('rbPrPos', b.projectLogoPos ?? 'header-left')}
          ${(b.projectLogoPos ?? 'header-left') !== 'none' ? range('rbPrH', t('Logo height', 'Logohoogte'), Number(b.projectLogoHeight) || 9, 5, 25, ' mm') : ''}
          <div class="hint">${I('info', 12)} ${t('The same logo is on the cover (Cover tab).', 'Hetzelfde logo staat op het voorblad (tabblad Voorblad).')}</div>` : ''}
      </div>
      <div class="rb-group"><div class="rb-label">${t('Company logo', 'Bedrijfslogo')}</div>
        <div class="rb-logo">${b.logo ? `<img src="${b.logo}" alt="">` : `<div class="rb-logo-empty">${I('image', 22)}<span>${t('No company logo', 'Geen bedrijfslogo')}</span></div>`}
          <div class="rb-logo-actions"><button class="sm" id="rbBrandPick">${I('upload', 13)}${b.logo ? t('Replace', 'Vervangen') : t('Upload', 'Uploaden')}</button>
            ${b.logo ? `<button class="sm ghost" id="rbBrandDel">${I('trash', 13)}${t('Remove', 'Verwijderen')}</button>` : meta.logo ? `<button class="sm ghost" id="rbBrandUseProject">${t('Use project logo', 'Projectlogo gebruiken')}</button>` : ''}</div></div>
        <input type="file" id="rbBrandFile" accept="image/*" hidden>
        ${b.logo ? `<div class="rb-label" style="margin-top:14px">${t('On every page', 'Op elke pagina')}</div>${posSeg('rbBrandPos', b.logoPos)}
          ${b.logoPos !== 'none' ? range('rbBrandH', t('Logo height', 'Logohoogte'), Number(b.logoHeight) || 9, 5, 25, ' mm') : ''}
          <div class="hint">${t('The company logo is also at the bottom of the cover and on the stickers.', 'Het bedrijfslogo staat ook onderaan het voorblad en op de stickers.')}</div>` : ''}
      </div>
      <div class="rb-group"><div class="rb-label">${t('Watermark', 'Watermerk')}</div>
        <div class="segmented rb-full" id="rbWmType">${[['none', t('None', 'Geen')], ['logo', t('Logo', 'Logo')], ['text', t('Text', 'Tekst')]].map(([v, l]) => `<button data-v="${v}" class="${wm.type === v ? 'active' : ''}">${l}</button>`).join('')}</div>
        ${wm.type === 'logo' && !(b.logo || meta.logo) ? `<div class="hint">${I('info', 12)} ${t('Upload a company logo above first.', 'Upload eerst een bedrijfslogo hierboven.')}</div>` : ''}
        ${wm.type === 'text' ? `<label class="field" style="margin-top:12px">${t('Text', 'Tekst')}<input type="text" id="rbWmText" value="${esc(wm.text)}" placeholder="CONFIDENTIAL / DRAFT / CONCEPT"></label>` : ''}
        ${wm.type !== 'none' ? `<div class="rb-stack">${range('rbWmOp', t('Strength', 'Sterkte'), Number(wm.opacity) || 8, 2, 40, '%')}${range('rbWmSize', t('Size', 'Grootte'), Number(wm.size) || 55, 15, 100, '%')}${range('rbWmAngle', t('Angle', 'Hoek'), Number(wm.angle) || 0, -90, 90, '°', 5)}</div>` : ''}
      </div>
      <div class="hint">${I('info', 12)} ${t('Your logos and style are part of the layout: use Save as template (step 2) to reuse them in every show — templates are kept in your library.', 'Je logo’s en stijl horen bij de indeling: gebruik Opslaan als template (stap 2) om ze in elke show te hergebruiken — templates staan in je bibliotheek.')}</div>`;
  }
  function panelCover(){
    const L = B.L, c = L.cover, meta = PE().currentMeta(), f = c.fields;
    return `${sw('rbCover', c.show, `<b>${t('Cover page', 'Voorblad')}</b>`)}
      ${sw('rbToc', c.contents !== false, t('Contents page with page numbers', 'Inhoudsopgave met bladnummers'))}
      ${sw('rbSummaryPage', c.summaryPage, t('Project summary page (when more than one DimCity)', 'Projectoverzicht (bij meer dan één DimCity)'))}
      ${c.show ? `<div class="rb-group">
        <div class="form-grid">
          <label class="field span-2">${t('Title', 'Titel')} <span class="subtle">(${t('empty = project name', 'leeg = projectnaam')})</span><input type="text" id="rbCTitle" placeholder="${esc(meta.project || t('Project name', 'Projectnaam'))}" value="${esc(c.title)}"></label>
          <label class="field span-2">${t('Subtitle', 'Ondertitel')}<input type="text" id="rbCSub" value="${esc(c.subtitle)}"></label>
        </div>
        <div class="rb-label" style="margin-top:14px">${t('Show on cover', 'Tonen op voorblad')}</div>
        <div class="rb-chips">${[['area', t('Area', 'Gebied')], ['location', t('Location', 'Locatie')], ['date', t('Date', 'Datum')], ['prepared', t('Prepared by', 'Opgesteld door')], ['dimcities', t('DimCity list', 'DimCity-lijst')], ['totals', t('Totals', 'Totalen')]].map(([k, l]) => `<label class="rb-chip ${f[k] ? 'on' : ''}"><input type="checkbox" data-field="${k}" ${f[k] ? 'checked' : ''}>${l}</label>`).join('')}</div>
        <div class="rb-label" style="margin-top:14px">${t('Project logo on the cover', 'Projectlogo op het voorblad')}</div>
        ${meta.logo ? `<div class="rb-pos-row">
          <div class="rb-pos" id="rbLogoPos" title="${esc(t('Position on the cover', 'Positie op het voorblad'))}">${[0, .5, 1].map(y => [0, .5, 1].map(x => `<button data-x="${x}" data-y="${y}" class="${Number(c.logoX) === x && Number(c.logoY) === y ? 'active' : ''}"></button>`).join('')).join('')}</div>
          <div style="flex:1"><label class="field">${t('Size', 'Grootte')} <span class="subtle" id="rbLogoWVal">${Number(c.logoW) || 60} mm</span><input type="range" id="rbLogoW" min="15" max="180" step="1" value="${Number(c.logoW) || 60}"></label>
          <div class="hint">${I('info', 12)} ${t('Or drag the image in the preview. Upload it in the Logos tab.', 'Of sleep de afbeelding in het voorbeeld. Upload hem in het tabblad Logo’s.')}</div></div>
        </div>` : `<div class="hint">${t('No project logo yet — upload one in the Logos tab.', 'Nog geen projectlogo — upload er een in het tabblad Logo’s.')}</div>`}
        <label class="field" style="margin-top:14px">${t('Note on cover', 'Notitie op voorblad')}<textarea id="rbCNote" rows="3" placeholder="${esc(t('Optional — e.g. version, revision or crew note', 'Optioneel — bijv. versie, revisie of crewnotitie'))}">${esc(c.note)}</textarea></label>
      </div>` : ''}
      <div class="rb-group"><div class="rb-label">${t('Project details', 'Projectgegevens')}</div>
        <div class="form-grid">
          <label class="field span-2">${t('Project', 'Project')}<input type="text" data-meta="project" value="${esc(meta.project)}"></label>
          <label class="field">${t('Area', 'Gebied')}<input type="text" data-meta="area" value="${esc(meta.area)}"></label>
          <label class="field">${t('Location', 'Locatie')}<input type="text" data-meta="location" value="${esc(meta.location)}"></label>
          <label class="field">${t('Date', 'Datum')}<input type="date" data-meta="date" value="${esc(meta.date)}"></label>
          <label class="field">${t('Prepared by', 'Opgesteld door')}<input type="text" data-meta="prepared" value="${esc(meta.prepared)}"></label>
        </div>
        <div class="hint">${t('These are the project details from Project Info — changes here update the project.', 'Dit zijn de projectgegevens uit Projectinfo — wijzigingen hier passen het project aan.')}</div>
      </div>`;
  }

  // ---- 4 · Publish ----
  function panelPublish(){
    const L = B.L, pub = L.publish, meta = PE().currentMeta(), files = plan(), api = !!window.app?.publishPdf;
    const proj = PE().fname(meta.project) || 'PatchLab';
    return `<div class="rb-group"><div class="rb-label">${t('Location', 'Locatie')}</div>
        <div class="pb-loc"><button id="pbChoose" ${api ? '' : 'disabled'}>${I('folder', 14)}${pub.dir ? t('Change folder…', 'Andere map…') : t('Choose folder…', 'Kies map…')}</button>
          <span class="pb-dir" title="${esc(pub.dir || '')}">${pub.dir ? esc(pub.dir) : `<em>${t('No folder chosen yet', 'Nog geen map gekozen')}</em>`}</span></div>
        ${api ? '' : `<div class="hint warn">${I('alert', 12)} ${t('Publishing PDFs works in the desktop app. Here you can still look at every page.', 'PDF’s publiceren werkt in de desktop-app. Hier kun je nog wel elke pagina bekijken.')}</div>`}
        ${sw('pbStructure', pub.structure !== false, t('Create a folder structure', 'Maak een mappenstructuur'))}
        <div class="hint">${pub.structure !== false ? t('A folder with the project name; in it one folder per DimCity (LK info, Node info and a Stickers folder), an A3 folder for the network flow, and the total book and IP address book.', 'Een map met de projectnaam; daarin een map per DimCity (LK-info, Node-info en een map Stickers), een map A3 voor de netwerkflow, en het totaalboek en het IP-adresboek.') : t('All files go straight into the folder you choose, with the DimCity in every file name.', 'Alle bestanden komen rechtstreeks in de gekozen map, met de DimCity in elke bestandsnaam.')}</div>
        ${pub.structure !== false ? `<label class="field" style="margin-top:8px">${t('Name of the project folder', 'Naam van de projectmap')}<input type="text" id="pbFolder" value="${esc(pub.folder || '')}" placeholder="${esc(proj)}"></label>` : ''}
        ${sw('pbOpen', pub.open !== false, t('Open the folder when it is done', 'Open de map als het klaar is'))}
      </div>
      <div class="rb-group"><div class="rb-label">${t('Summary', 'Samenvatting')}</div>
        <div class="pb-sum" id="pbSum"></div>
        <div class="hint">${I('info', 12)} ${t('Every file is made again each time you publish, so the folder always holds the latest version.', 'Elk bestand wordt bij het publiceren opnieuw gemaakt, dus de map bevat altijd de nieuwste versie.')}</div>
      </div>`;
  }
  const summaryHtml = () => {
    const all = plan(), files = todo(), pages = files.reduce((n, f) => n + (B.pages.get(f.id)?.pages || 0), 0), counted = all.filter(f => B.pages.has(f.id)).length, empty = all.length - files.length;
    const total = `${files.length} ${files.length === 1 ? t('file', 'bestand') : t('files', 'bestanden')}`;
    return `<b>${total}</b>${counted ? ` · ${pages} ${t('pages', 'pagina’s')}` : ''}${empty ? ` <span class="subtle">· ${empty} ${t('with nothing to publish', 'zonder inhoud')}</span>` : ''}${counted < all.length && all.length ? ` <span class="subtle">${t('counting pages…', 'pagina’s tellen…')}</span>` : ''}`;
  };

  // ---------- Panel events ----------
  function bindPanel(P){
    const L = B.L, PEx = PE();
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach(n => n.addEventListener(ev, fn));
    const seg = (id, fn) => P.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => { fn(b.dataset.v); changed(true); });
    const val = (id, fn, ev = 'change') => { const n = P.querySelector('#' + id); if(n) n.addEventListener(ev, () => { fn(n); changed(); }); };
    const valP = (id, fn) => { const n = P.querySelector('#' + id); if(n) n.addEventListener('change', () => { fn(n); changed(true); }); };

    // 1 · What
    seg('rbScope', v => { L.scope = v; if(v === 'SEL' && !L.dims.length) L.dims = dims().slice(); });
    on('[data-dim]', 'change', e => { const d = e.target.dataset.dim; L.dims = e.target.checked ? [...new Set([...L.dims, d])] : L.dims.filter(x => x !== d); changed(true); });
    on('[data-doc-on]', 'change', e => { L.docs[e.target.dataset.docOn] = e.target.checked; changed(true); });
    on('[data-doc-eye]', 'click', e => { const k = e.currentTarget.dataset.docEye; const sk = L.docs.stickerKinds || {}; B.pv.doc = k === 'stickers' ? (sk.nodes ? 'st-nodes' : sk.switches ? 'st-switches' : sk.cables ? 'st-cables' : 'st-nodes') : k; B.view = 'pages'; renderPvBar(); syncView(); schedulePreview(true); });
    on('[data-stk]', 'change', e => { L.docs.stickerKinds[e.target.dataset.stk] = e.target.checked; if(e.target.checked && e.target.dataset.stk !== 'together') L.docs.stickers = true; changed(true); });
    on('[data-grp]', 'change', e => { const v = e.target.checked; if(e.target.dataset.grp === 'net'){ for(const k of ['ip', 'nodes', 'a3']) L.docs[k] = v; L.docs.stickerKinds.nodes = v; L.docs.stickerKinds.switches = v; if(v) L.docs.stickers = true; } changed(true); });
    // one list of sheets for the node and switch stickers (sheetBig) and one for the rest (sheet); "New sheet…" opens the dialog that names and saves it
    [['#pbSheetBig', 'sheetBig'], ['#pbSheet', 'sheet']].forEach(([id, key]) => {
      const el = P.querySelector(id); if(!el) return;
      el.onchange = () => {
        const set = v => { window.Labels.state()[key] = v; if(getM()?.ui) getM().ui.dirty = true; renderPanel(); changed(); };
        if(el.value === '__new') window.Labels.sheetDialog(null, s => { if(s) set(s.id); else renderPanel(); }); else set(el.value);
      };
    });
    on('#pbStickerOpen', 'click', () => {
      window.Labels?.open?.();
      const iv = setInterval(() => { if(!document.getElementById('lbRoot')){ clearInterval(iv); if(B){ renderPanel(); changed(); } } }, 400);     // back from the sticker settings: show what changed
    });

    // 2 · Content
    P.querySelector('#rbTemplate')?.addEventListener('change', e => applyTemplate(e.target.value));
    P.querySelector('#rbSaveTpl')?.addEventListener('click', saveTemplate);
    on('[data-on]', 'change', e => { const s = L.sections.find(x => x.key === e.target.dataset.on); s.on = e.target.checked; changed(true); });
    on('[data-toggle]', 'click', e => { const k = e.currentTarget.dataset.toggle; B.expanded = B.expanded === k ? null : k; B.selSec = k; renderPanel(); highlightPreview(); });
    on('[data-opt]', 'change', e => { const s = L.sections.find(x => x.key === e.target.dataset.sec); s.opts = { ...(s.opts || {}), [e.target.dataset.opt]: e.target.checked }; changed(); });
    on('[data-notes]', 'input', e => { const s = L.sections.find(x => x.key === 'notes'); s.opts = { ...(s.opts || {}), text:e.target.value }; if(e.target.value && !s.on){ s.on = true; P.querySelector('[data-on="notes"]').checked = true; P.querySelector('.rb-sec[data-key="notes"]').classList.remove('off'); } changed(); });
    on('[data-up]', 'click', e => move(Number(e.currentTarget.dataset.up), -1));
    on('[data-down]', 'click', e => move(Number(e.currentTarget.dataset.down), 1));
    P.querySelectorAll('[data-posmode]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => {
      const s = L.sections.find(x => x.key === sg.dataset.posmode); if(!s) return;
      if(b.dataset.v === 'auto') s.pos = null;
      else if(!PEx.normPos(s.pos)){ const cbx = PEx.contentBox(L); s.pos = { x:0, y:0, w:Math.min(120, PEx.snap(cbx.w)) }; }
      changed(true);
    }));
    on('[data-pos]', 'change', e => { const s = L.sections.find(x => x.key === e.target.dataset.sec); const p = PEx.normPos(s?.pos); if(!p) return; p[e.target.dataset.pos] = Number(e.target.value); s.pos = PEx.normPos(p); changed(true); });
    let dragKey = null;
    on('.rb-sec', 'dragstart', e => { dragKey = e.currentTarget.dataset.key; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    on('.rb-sec', 'dragend', e => { e.currentTarget.classList.remove('dragging'); P.querySelectorAll('.rb-sec').forEach(n => n.classList.remove('drop-before', 'drop-after')); });
    on('.rb-sec', 'dragover', e => {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      P.querySelectorAll('.rb-sec').forEach(n => n.classList.remove('drop-before', 'drop-after'));
      e.currentTarget.classList.add(after ? 'drop-after' : 'drop-before');
    });
    on('.rb-sec', 'drop', e => {
      e.preventDefault();
      const target = e.currentTarget.dataset.key; if(!dragKey || dragKey === target) return;
      const r = e.currentTarget.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      const from = L.sections.findIndex(s => s.key === dragKey), [item] = L.sections.splice(from, 1);
      L.sections.splice(L.sections.findIndex(s => s.key === target) + (after ? 1 : 0), 0, item);
      changed(true);
    });

    // 3 · Look
    on('#rbTabs button', 'click', e => { B.lookTab = e.currentTarget.dataset.tab; renderPanel(); });
    val('rbSize', n => L.page.size = n.value);
    val('rbOrient', n => L.page.orientation = n.value);
    val('rbA3Orient', n => L.a3.orientation = n.value);
    val('rbMargin', n => { L.page.margin = Number(n.value); P.querySelector('#rbMarginVal').textContent = `${n.value} mm`; }, 'input');
    on('[data-accent]', 'click', e => { L.style.accent = e.currentTarget.dataset.accent; changed(true); });
    val('rbAccent', n => L.style.accent = n.value, 'input');
    val('rbFont', n => L.style.font = n.value);
    val('rbFs', n => L.style.fontSize = Number(n.value));
    seg('rbDensity', v => L.style.density = v);
    seg('rbLine', v => L.style.lineWeight = v);
    val('rbColorU', n => L.style.colorUniverses = n.checked);
    val('rbBand', n => L.style.dimBand = n.checked);
    val('rbGray', n => L.style.grayscale = n.checked);
    valP('rbHead', n => L.header.show = n.checked);
    valP('rbFoot', n => L.footer.show = n.checked);
    val('rbHeadText', n => L.header.text = n.value, 'input');
    val('rbFootL', n => L.footer.left = n.value, 'input');
    val('rbFootC', n => L.footer.center = n.value, 'input');
    val('rbPageNo', n => L.footer.pageNumbers = n.checked);
    valP('rbCover', n => L.cover.show = n.checked);
    val('rbToc', n => L.cover.contents = n.checked);
    val('rbSummaryPage', n => L.cover.summaryPage = n.checked);
    val('rbCTitle', n => L.cover.title = n.value, 'input');
    val('rbCSub', n => L.cover.subtitle = n.value, 'input');
    val('rbCNote', n => L.cover.note = n.value, 'input');
    on('[data-field]', 'change', e => { L.cover.fields[e.target.dataset.field] = e.target.checked; e.target.closest('.rb-chip').classList.toggle('on', e.target.checked); changed(); });
    on('#rbLogoPos button', 'click', e => { L.cover.logoX = Number(e.currentTarget.dataset.x); L.cover.logoY = Number(e.currentTarget.dataset.y); changed(true); });
    val('rbLogoW', n => { L.cover.logoW = Number(n.value); P.querySelector('#rbLogoWVal').textContent = `${n.value} mm`; }, 'input');
    const M = getM(), setMeta = (k, v) => { M.projectMeta = { ...(M.projectMeta || {}), [k]: v }; if(M.ui) M.ui.dirty = true; };
    on('[data-meta]', 'input', e => { setMeta(e.target.dataset.meta, e.target.value); changed(); });
    on('[data-meta]', 'change', () => App()?.renderAll?.());
    const pickFile = (btn, input, fn) => { const b = P.querySelector(btn), f = P.querySelector(input); if(b) b.onclick = () => f.click(); if(f) f.onchange = async () => { const x = f.files?.[0]; if(!x) return; try { await fn(await imageToDataUrl(x)); } catch(err){ toast(`${t('Could not read image', 'Kon de afbeelding niet lezen')}: ${err.message || err}`, 'err'); } }; };
    pickFile('#rbLogoPick', '#rbLogoFile', url => { setMeta('logo', url); if((L.brand.projectLogoPos ?? 'header-left') === 'none') L.brand.projectLogoPos = 'header-left'; changed(true); });
    on('#rbLogoDel', 'click', () => { setMeta('logo', null); changed(true); });
    pickFile('#rbBrandPick', '#rbBrandFile', url => { L.brand.logo = url; if(L.brand.logoPos === 'none') L.brand.logoPos = 'header-right'; changed(true); });
    on('#rbBrandDel', 'click', () => { L.brand.logo = null; changed(true); });
    on('#rbBrandUseProject', 'click', () => { L.brand.logo = PEx.currentMeta().logo; if(L.brand.logoPos === 'none') L.brand.logoPos = 'header-right'; changed(true); });
    seg('rbBrandPos', v => L.brand.logoPos = v);
    seg('rbPrPos', v => L.brand.projectLogoPos = v);
    val('rbBrandH', n => { L.brand.logoHeight = Number(n.value); P.querySelector('#rbBrandHVal').textContent = `${n.value} mm`; }, 'input');
    val('rbPrH', n => { L.brand.projectLogoHeight = Number(n.value); P.querySelector('#rbPrHVal').textContent = `${n.value} mm`; }, 'input');
    seg('rbWmType', v => L.brand.wm.type = v);
    val('rbWmText', n => L.brand.wm.text = n.value, 'input');
    const rng = (id, key, unit) => val(id, n => { L.brand.wm[key] = Number(n.value); P.querySelector(`#${id}Val`).textContent = `${n.value}${unit}`; }, 'input');
    rng('rbWmOp', 'opacity', '%'); rng('rbWmSize', 'size', '%'); rng('rbWmAngle', 'angle', '°');

    // 4 · Publish
    on('#pbChoose', 'click', chooseDir);
    valP('pbStructure', n => L.publish.structure = n.checked);
    val('pbFolder', n => L.publish.folder = n.value.trim(), 'input');
    val('pbOpen', n => L.publish.open = n.checked);
    if(B.step === 'publish'){ const s = P.querySelector('#pbSum'); if(s) s.innerHTML = summaryHtml(); }
  }
  function move(i, d){
    const L = B.L, j = i + d;
    if(j < 0 || j >= L.sections.length) return;
    [L.sections[i], L.sections[j]] = [L.sections[j], L.sections[i]];
    changed(true);
  }
  // pictures are made smaller (max 1200 px, PNG with transparency) so the project, the templates and the PDF stay small
  const fileToDataUrl = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  async function imageToDataUrl(file){
    if(file.size > 15 * 1024 * 1024) throw new Error('image is larger than 15 MB');
    const url = await fileToDataUrl(file);
    if(/svg/i.test(file.type)) return url;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not a supported image')); i.src = url; });
    const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    if(k === 1 && file.size < 400 * 1024) return url;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  // ---------- Templates ----------
  function renderTemplates(){
    const M = getM(), sel = document.getElementById('rbTemplate'); if(!sel) return;
    const tpls = Array.isArray(M.pdfTemplates) ? M.pdfTemplates : [];
    sel.innerHTML = `<option value="">${t('Choose…', 'Kies…')}</option><optgroup label="Presets">${Object.entries(PE().PRESETS).map(([k, p]) => `<option value="preset:${k}">${esc(p.name)}</option>`).join('')}</optgroup>${tpls.length ? `<optgroup label="${esc(t('My templates', 'Mijn templates'))}">${tpls.map(x => `<option value="tpl:${esc(x.id)}">${esc(x.name)}</option>`).join('')}</optgroup><optgroup label="${esc(t('Manage', 'Beheren'))}"><option value="manage">${t('Delete a template…', 'Een template verwijderen…')}</option></optgroup>` : ''}`;
    sel.value = '';
  }
  function applyTemplate(v){
    if(!v) return;
    const M = getM();
    if(v === 'manage') return manageTemplates();
    const keep = { scope:B.L.scope, dims:B.L.dims.slice(), docs:clone(B.L.docs), publish:clone(B.L.publish) };
    if(v.startsWith('preset:')){
      const p = PE().PRESETS[v.slice(7)]; if(!p) return;
      const L = PE().defaultLayout(); L.style.accent = B.L.style.accent; L.brand = clone(B.L.brand); L.header = clone(B.L.header); L.footer = clone(B.L.footer); L.page = clone(B.L.page); L.a3 = clone(B.L.a3); p.apply(L);
      B.L = { ...L, ...keep };
      toast(`${t('Preset', 'Voorinstelling')} “${p.name}” ${t('applied', 'toegepast')}`, 'info');
    } else if(v.startsWith('tpl:')){
      const x = (M.pdfTemplates || []).find(q => q.id === v.slice(4)); if(!x) return;
      B.L = { ...PE().mergeLayout(x.layout), ...keep };
      toast(`${t('Template', 'Template')} “${x.name}” ${t('applied', 'toegepast')}`, 'info');
    }
    changed(true);
  }
  function saveTemplate(){
    const ui = App()?.ui, M = getM();
    const d = ui.openDialog({ title:t('Save as Template', 'Opslaan als template'), subtitle:t('Saves sections, order, style, header/footer, cover and logos. Project details and the choice of documents are not part of a template.', 'Bewaart secties, volgorde, stijl, kop/voet, voorblad en logo’s. Projectgegevens en de keuze van documenten horen niet bij een template.'), width:'460px',
      body:`<label class="field">${t('Template name', 'Naam van de template')}<input id="tplName" type="text" placeholder="${esc(t('e.g. Mainstage crew sheets', 'bijv. Mainstage crewbladen'))}"></label>`,
      footer:`<button data-a="c">${t('Cancel', 'Annuleren')}</button><button class="primary" data-a="s">${t('Save Template', 'Template opslaan')}</button>` });
    const inp = d.modal.querySelector('#tplName'); setTimeout(() => inp.focus(), 30);
    const save = () => {
      const name = inp.value.trim(); if(!name){ inp.focus(); return; }
      if(!Array.isArray(M.pdfTemplates)) M.pdfTemplates = [];
      const existing = M.pdfTemplates.find(x => x.name.toLowerCase() === name.toLowerCase());
      const layout = clone(B.L); layout.scope = 'ALL'; layout.dims = []; delete layout.publish; delete layout.docs;
      const tpl = existing || { id:`tpl_${Date.now().toString(36)}`, name };
      tpl.layout = layout;
      if(!existing) M.pdfTemplates.push(tpl);
      window.Library?.put?.('pdfTemplates', tpl);
      if(M.ui) M.ui.dirty = true;
      d.close(); renderTemplates();
      ui.toast(`${t('Template', 'Template')} “${name}” ${t('saved in this project and your library', 'opgeslagen in dit project en je bibliotheek')}`);
    };
    d.footer.querySelector('[data-a=c]').onclick = d.close;
    d.footer.querySelector('[data-a=s]').onclick = save;
    inp.onkeydown = e => { if(e.key === 'Enter') save(); };
  }
  function manageTemplates(){
    const ui = App()?.ui, M = getM();
    const draw = d => {
      const tpls = M.pdfTemplates || [];
      d.body.innerHTML = tpls.length ? `<div class="table-wrap"><table class="data-table"><tbody>${tpls.map(x => `<tr><td>${esc(x.name)}</td><td class="num"><button class="sm danger" data-del="${esc(x.id)}">${I('trash', 13)}${t('Delete', 'Verwijderen')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><p>${t('No templates left.', 'Geen templates meer.')}</p></div>`;
      d.body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { M.pdfTemplates = tpls.filter(x => x.id !== b.dataset.del); window.Library?.del?.('pdfTemplates', b.dataset.del); if(M.ui) M.ui.dirty = true; draw(d); renderTemplates(); });
    };
    const d = ui.openDialog({ title:t('Templates', 'Templates'), subtitle:t('Deleting removes the template from this project and your library.', 'Verwijderen haalt de template uit dit project en je bibliotheek.'), width:'440px', body:'', footer:`<button class="primary" data-a="ok">${t('Done', 'Klaar')}</button>` });
    d.footer.querySelector('[data-a=ok]').onclick = d.close;
    draw(d); renderTemplates();
  }

  // ---------- The preview ----------
  const PV = () => [['book', docTitle('book'), 'all'], ['lk', docTitle('lk'), 'dc'], ['nodes', docTitle('nodes'), 'dc'], ['st-nodes', t('Node stickers', 'Nodestickers'), 'dc'], ['st-switches', t('Switch stickers', 'Switchstickers'), 'dc'], ['st-cables', t('Cable stickers', 'Kabelstickers'), 'dc'], ['a3', t('Network flow (A3)', 'Netwerkflow (A3)'), 'dc'], ['a3all', t('Network overview (A3)', 'Netwerkoverzicht (A3)'), 'all'], ['ip', docTitle('ip'), 'all']];
  // the documents the preview offers: only what is ticked in step 1 (all of them when nothing is)
  const pvList = () => { const d = B.L.docs, k = d.stickerKinds || {}, on = { book:d.book, lk:d.lk, nodes:d.nodes, ip:d.ip, a3:d.a3, a3all:d.a3, 'st-nodes':d.stickers && k.nodes, 'st-switches':d.stickers && k.switches, 'st-cables':d.stickers && k.cables }; const l = PV().filter(x => on[x[0]]); return l.length ? l : PV(); };
  const stickerRuns = () => { const L = B.L, k = L.docs.stickerKinds || {}; return !!k.together && sel().length > 1; };       // the stickers of every chosen DimCity run on in one file
  function renderPvBar(){
    const el = $('#pbPv'); if(!el) return;
    const list = pvList(), cur = list.find(x => x[0] === B.pv.doc) || list[0], dcs = sel(); B.pv.doc = cur[0];
    const oneRun = /^st-/.test(cur[0]) && stickerRuns();
    el.innerHTML = `<select id="pvDoc" title="${esc(t('Which document to look at', 'Welk document je bekijkt'))}">${list.map(([k, l]) => `<option value="${k}" ${k === cur[0] ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      ${cur[2] === 'dc' && dcs.length && !oneRun ? `<select id="pvDc" title="${esc(t('Which DimCity', 'Welke DimCity'))}">${dcs.map(d => `<option value="${esc(d)}" ${d === (B.pv.dc && dcs.includes(B.pv.dc) ? B.pv.dc : dcs[0]) ? 'selected' : ''}>${esc(PE().dcName(d))}</option>`).join('')}</select>` : ''}`;
    el.querySelector('#pvDoc').onchange = e => { B.pv.doc = e.target.value; renderPvBar(); schedulePreview(true); };
    const dc = el.querySelector('#pvDc'); if(dc) dc.onchange = e => { B.pv.dc = e.target.value; schedulePreview(true); };
  }
  function previewFile(){
    const L = B.L, dcs = sel(); if(!dcs.length) return null;
    const dc = B.pv.dc && dcs.includes(B.pv.dc) ? B.pv.dc : dcs[0], k = L.docs.stickerKinds || {}, d = B.pv.doc;
    if(d === 'book' || d === 'ip' || d === 'a3all') return { kind:d, dcs, name:d };
    if(d === 'lk' || d === 'nodes' || d === 'a3') return { kind:d, dc, dcs:[dc], name:d };
    const run = stickerRuns(), who = run ? { dc:null, dcs } : { dc, dcs:[dc] };       // one run: every chosen DimCity in the same file
    if(d === 'st-nodes') return { kind:'stickers', variant:'nodes', ports:!!k.nodePorts, ...who, name:d };
    if(d === 'st-switches') return { kind:'stickers', variant:'switches', ports:!!k.switchPorts, ...who, name:d };
    if(d === 'st-cables') return { kind:'stickers', variant:'cables', ...who, name:d };
    return null;
  }
  function schedulePreview(now = false){ clearTimeout(B.timer); B.timer = setTimeout(renderPreview, now ? 10 : 170); }
  const emptyDoc = msg => `<!doctype html><html><body style="margin:0;background:#2a2e35;color:#9aa3b2;font:14px system-ui;display:grid;place-items:center;height:90vh;text-align:center;padding:0 40px">${esc(msg)}</body></html>`;
  async function renderPreview(){
    if(!B) return;
    const frame = document.getElementById('rbFrame'); if(!frame) return;
    if(B.view === 'files'){ B.stale = true; return; }          // not on screen: it is made again when you go back to the pages
    B.stale = false;
    const my = ++B.token, f = previewFile(), info = $('#rbPageInfo');
    if(!f){ frame.srcdoc = emptyDoc(t('Choose at least one DimCity.', 'Kies minstens één DimCity.')); if(info) info.textContent = ''; return; }
    if(info) info.textContent = t('Making the pages…', 'De pagina’s worden gemaakt…');
    let r = null;
    try { r = await PE().renderFile(f, B.L, { preview:true, isStale:() => !B || my !== B.token }); }
    catch(err){ console.error(err); if(B && my === B.token){ frame.srcdoc = emptyDoc(`${t('The preview could not be made', 'Het voorbeeld kon niet gemaakt worden')}: ${err.message || err}`); if(info) info.textContent = ''; } return; }
    if(!B || my !== B.token || !r) return;
    if(r.empty){ frame.srcdoc = emptyDoc(t('Nothing in this document for this DimCity (or all its sections are switched off).', 'Niets in dit document voor deze DimCity (of alle secties staan uit).')); if(info) info.textContent = ''; B.last = null; return; }
    const scrollY = frame.contentWindow?.scrollY || 0;
    B.last = r;
    frame.onload = () => {
      const doc = frame.contentDocument; if(!doc) return;
      applyZoom();
      frame.contentWindow.scrollTo(0, scrollY);
      const n = r.pages;
      if(info) info.textContent = `${n} ${r.sticker ? (n === 1 ? t('sheet', 'vel') : t('sheets', 'vellen')) : (n === 1 ? t('page', 'pagina') : t('pages', 'pagina’s'))}${r.size && !r.sticker ? ` · ${r.size} ${r.landscape ? t('landscape', 'liggend') : t('portrait', 'staand')}` : ''}${r.over?.length ? ` · ⚠ ${t('too big on page', 'te groot op pagina')} ${r.over.join(', ')}` : ''}`;
      if(r.sticker) return;
      doc.addEventListener('click', e => {
        if(!B || B.busy || e.target.closest('.sec-grip')) return;
        const sec = e.target.closest('[data-sec]'); if(!sec) return;
        const key = sec.dataset.sec;
        if(key === 'cover'){ B.step = 'look'; B.lookTab = 'cover'; B.selSec = null; }
        else { B.step = 'content'; B.selSec = key; B.expanded = (PE().SECTION_OPTS[key] || key === 'notes') ? key : B.expanded; }
        renderSteps(); renderPanel(); highlightPreview();
        document.querySelector(`.rb-sec[data-key="${key}"]`)?.scrollIntoView({ block:'nearest', behavior:'smooth' });
      });
      addGrips(doc); highlightPreview(); bindCoverLogoDrag(doc); bindSectionDrag(doc);
    };
    frame.srcdoc = r.html;
  }
  // a handle on the first piece of every section of every DimCity: drag it to put the section on a fixed place of the sheet
  function addGrips(doc){
    const seen = new Set();
    doc.querySelectorAll('.sheet [data-sec]').forEach(sec => {
      if(sec.dataset.sec === 'cover') return;
      const k = `${sec.dataset.sec}|${sec.closest('.sheet')?.dataset.label || ''}`;
      if(seen.has(k)) return; seen.add(k);
      const g = doc.createElement('span'); g.className = 'sec-grip'; g.dataset.grip = sec.dataset.sec; g.title = 'Drag to position this section on the sheet'; g.innerHTML = I('grip', 10);
      sec.insertBefore(g, sec.firstChild);
    });
  }
  function bindSectionDrag(doc){
    doc.querySelectorAll('.sec-grip').forEach(grip => grip.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const sec = grip.closest('[data-sec]'), sheet = sec?.closest('.sheet'); if(!sec || !sheet || !B.last?.G) return;
      const s = B.L.sections.find(x => x.key === sec.dataset.sec); if(!s) return;
      const G = B.last.G, body = sheet.querySelector('.sh-body'), PEx = PE();
      const pr = body.getBoundingClientRect(), sr = sec.getBoundingClientRect(), mmpp = G.bodyW / pr.width;       // mm per pixel, whatever the zoom
      let p = PEx.normPos(s.pos);
      if(!p){ p = { x:PEx.snap((sr.left - pr.left) * mmpp), y:PEx.snap((sr.top - pr.top) * mmpp), w:Math.max(20, PEx.snap(sr.width * mmpp)) }; s.pos = p; }
      const x0 = p.x, y0 = p.y, sx = e.clientX, sy = e.clientY;
      const put = () => { sec.style.cssText += `;position:absolute;left:${p.x}mm;top:${p.y}mm;width:${p.w}mm;z-index:3;margin:0`; };
      put(); sec.classList.add('dragging', 'fixed'); sheet.classList.add('grid-bg');
      const mv = ev => { p.x = Math.max(0, Math.min(G.bodyW - p.w, PEx.snap(x0 + (ev.clientX - sx) * mmpp))); p.y = Math.max(0, Math.min(G.bodyH - 10, PEx.snap(y0 + (ev.clientY - sy) * mmpp))); put(); };
      const up = () => {
        doc.removeEventListener('mousemove', mv); doc.removeEventListener('mouseup', up);
        s.pos = PEx.normPos(p); B.step = 'content'; B.selSec = s.key; B.expanded = s.key;
        changed(true); renderSteps();
        document.querySelector(`.rb-sec[data-key="${s.key}"]`)?.scrollIntoView({ block:'nearest' });
      };
      doc.addEventListener('mousemove', mv); doc.addEventListener('mouseup', up);
    }));
  }
  function bindCoverLogoDrag(doc){
    const logo = doc.getElementById('coverLogo'); if(!logo) return;
    const cover = logo.closest('.cover');
    logo.addEventListener('mousedown', e => {
      e.preventDefault();
      const c = B.L.cover, cr = cover.getBoundingClientRect(), lr = logo.getBoundingClientRect();
      const freeW = cr.width - lr.width, freeH = cr.height - lr.height, sx = e.clientX, sy = e.clientY, x0 = Number(c.logoX ?? 1), y0 = Number(c.logoY ?? 0);
      let moved = false;
      const clamp = v => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
      const mv = ev => { moved = true; c.logoX = clamp(x0 + (freeW > 0 ? (ev.clientX - sx) / freeW : 0)); c.logoY = clamp(y0 + (freeH > 0 ? (ev.clientY - sy) / freeH : 0)); logo.style.setProperty('--x', c.logoX); logo.style.setProperty('--y', c.logoY); };
      const up = () => { doc.removeEventListener('mousemove', mv); doc.removeEventListener('mouseup', up); if(moved){ B.ver++; B.cache.clear(); B.step = 'look'; B.lookTab = 'cover'; renderSteps(); renderPanel(); } };
      doc.addEventListener('mousemove', mv); doc.addEventListener('mouseup', up);
    });
  }
  function highlightPreview(){
    const doc = document.getElementById('rbFrame')?.contentDocument; if(!doc) return;
    doc.querySelectorAll('[data-sec]').forEach(n => n.classList.toggle('sel', !!B.selSec && n.dataset.sec === B.selSec));
  }
  function applyZoom(){
    if(!B) return;
    const frame = document.getElementById('rbFrame'), doc = frame?.contentDocument; if(!doc?.body) return;
    let z = Number(B.zoom);
    if(B.zoom === 'fit'){
      const pw = (B.last?.G?.pw || 210) * MM;
      z = Math.max(0.25, Math.min(1.25, (frame.clientWidth - 56) / pw));
    }
    doc.body.style.setProperty('--zoom', String(z));
    document.querySelectorAll('#rbRoot #rbZoom button').forEach(b => b.classList.toggle('active', b.dataset.z === String(B.zoom)));
  }

  // ---------- The files ----------
  function tree(files){
    const root = { dirs:new Map(), files:[] };
    for(const f of files){
      const parts = f.rel.split('/'); let n = root;
      for(const p of parts.slice(0, -1)){ if(!n.dirs.has(p)) n.dirs.set(p, { dirs:new Map(), files:[] }); n = n.dirs.get(p); }
      n.files.push(f);
    }
    return root;
  }
  const STATE_ICON = { ok:'checkCircle', work:'refresh', err:'alert', skip:'x' };
  function renderFiles(){
    const el = document.getElementById('pbFiles'); if(!el || !B) return;
    const files = plan(), sm = $('#pbSum'); if(sm) sm.innerHTML = summaryHtml();
    if(!files.length){ el.innerHTML = `<div class="pb-empty">${I('file', 28)}<p>${t('Nothing is switched on. Tick at least one document in step 1.', 'Er staat niets aan. Vink in stap 1 minstens één document aan.')}</p></div>`; return; }
    const row = f => {
      const st = B.status.get(f.id), pg = B.pages.get(f.id), name = f.rel.split('/').pop();
      const n = st?.pages ?? pg?.pages ?? 0, unit = f.kind === 'stickers' ? (n === 1 ? t('sheet', 'vel') : t('sheets', 'vellen')) : (n === 1 ? t('page', 'pagina') : t('pages', 'pagina’s'));
      const info = st?.state === 'err' ? esc(st.msg || t('failed', 'mislukt')) : st?.state === 'skip' || pg?.empty ? t('nothing to publish', 'niets te publiceren') : n ? `${n} ${unit}` : '';
      return `<div class="pb-file ${st ? 'st-' + st.state : ''} ${pg?.empty ? 'st-empty' : ''}" data-fid="${esc(f.id)}"><span class="pb-st">${st ? I(STATE_ICON[st.state] || 'file', 14) : I('file', 14)}</span><b>${esc(name)}</b><em>${info}</em><button class="ghost sm icon-only" data-look="${esc(f.id)}" title="${esc(t('Show in the preview', 'Toon in het voorbeeld'))}">${I('eye', 14)}</button></div>`;
    };
    const draw = (n, name, depth) => `${name ? `<div class="pb-dirrow" style="--d:${depth}">${I('folder', 15)}<b>${esc(name)}</b></div>` : ''}<div class="pb-kids" style="--d:${depth + (name ? 1 : 0)}">${n.files.map(row).join('')}${[...n.dirs.entries()].map(([k, v]) => draw(v, k, depth + (name ? 1 : 0))).join('')}</div>`;
    el.innerHTML = `<div class="pb-treewrap"><div class="pb-where">${B.L.publish.dir ? `${I('folder', 14)} ${esc(B.L.publish.dir)}` : `<span class="subtle">${t('Choose a folder in the panel on the left.', 'Kies een map in het paneel links.')}</span>`}</div>${draw(tree(files), '', 0)}</div>`;
    el.querySelectorAll('[data-look]').forEach(b => b.onclick = () => {
      const f = files.find(x => x.id === b.dataset.look); if(!f) return;
      B.pv.doc = f.kind === 'stickers' ? `st-${f.variant}` : f.kind; if(f.dc) B.pv.dc = f.dc;
      B.view = 'pages'; renderPvBar(); syncView(); schedulePreview(true);
    });
  }
  // the page counts of the files, made one by one in the background (and kept for publishing)
  function scheduleCount(){ clearTimeout(B.countTimer); B.countTimer = setTimeout(countPages, 250); }
  async function countPages(){
    if(!B || B.step !== 'publish') return;
    const my = ++B.countToken, ver = B.ver;
    for(const f of plan()){
      if(!B || my !== B.countToken || ver !== B.ver) return;
      if(B.pages.has(f.id)) continue;
      try {
        const r = await fileResult(f);
        if(!B || my !== B.countToken || ver !== B.ver) return;
        B.pages.set(f.id, { pages:r?.pages || 0, empty:!!r?.empty });
      } catch { B.pages.set(f.id, { pages:0, empty:false }); }
      renderFiles(); updateSummary();
    }
  }
  async function fileResult(f){
    if(B.cache.has(f.id)) return B.cache.get(f.id);
    const r = await PE().renderFile(f, B.L, { preview:false });
    if(r) B.cache.set(f.id, r);
    return r;
  }

  // ---------- Publishing ----------
  async function chooseDir(){
    if(!window.app?.showOpenDialog) return null;
    const res = await window.app.showOpenDialog({ title:t('Choose where to publish', 'Kies waar je publiceert'), buttonLabel:t('Choose', 'Kies'), properties:['openDirectory', 'createDirectory'], defaultPath:B.L.publish.dir || undefined });
    if(!res || res.canceled || !res.filePaths?.[0]) return null;
    B.L.publish.dir = res.filePaths[0]; if(getM()?.ui) getM().ui.dirty = true;
    if(B) { renderPanel(); renderFiles(); }
    return B.L.publish.dir;
  }
  async function doPublish(){
    if(!B || B.busy) return;
    const files = plan(); if(!files.length) return;
    if(!window.app?.publishPdf){ toast(t('Publishing PDFs needs the desktop app.', 'PDF’s publiceren kan alleen in de desktop-app.'), 'info'); return; }
    let dir = B.L.publish.dir || await chooseDir(); if(!dir) return;
    persist();
    const me = B;
    B.busy = true; B.status.clear(); B.view = 'files'; syncView(); renderSteps(); updateSummary(); renderFiles();
    let done = 0, skipped = 0, failed = 0, pages = 0, first = null;
    for(const f of files){
      if(B !== me) return;
      B.status.set(f.id, { state:'work' }); renderFiles();
      try {
        const r = await fileResult(f);
        if(B !== me) return;
        if(!r || r.empty){ B.status.set(f.id, { state:'skip' }); skipped++; continue; }
        const out = await window.app.publishPdf({ dir, relPath:f.rel, html:r.html, pageSize:r.size || 'A4', landscape:!!r.landscape });
        if(B !== me) return;
        done++; pages += r.pages || 0; first = first || out;
        B.status.set(f.id, { state:'ok', pages:r.pages });
      } catch(err){
        if(B !== me) return;
        failed++; B.status.set(f.id, { state:'err', msg:String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
        if(/folder does not exist|No folder/i.test(String(err?.message || ''))){ B.L.publish.dir = ''; }
      }
      renderFiles(); const s = $('#pbSum'); if(s) s.innerHTML = `<b>${done + skipped + failed} / ${files.length}</b> ${t('files', 'bestanden')}…`;
    }
    if(B !== me) return;
    B.busy = false; renderSteps(); updateSummary(); renderFiles(); const s = $('#pbSum'); if(s) s.innerHTML = summaryHtml();
    const where = files[0] && files[0].rel.includes('/') ? files[0].rel.split('/')[0] : '';
    const sep = dir.includes('\\') ? '\\' : '/', join2 = (a, b) => `${a.replace(/[\\/]+$/, '')}${sep}${b}`;
    const msg = failed ? `${done} ${t('published', 'gepubliceerd')}, ${failed} ${t('failed', 'mislukt')}` : `${done} ${done === 1 ? t('file', 'bestand') : t('files', 'bestanden')} ${t('published', 'gepubliceerd')} (${pages} ${t('pages', 'pagina’s')})`;
    toast(msg, failed ? 'err' : 'ok', { action:{ label:t('Show in folder', 'Toon in map'), run:() => (where && window.app?.openPath ? window.app.openPath(join2(dir, where)) : window.app?.showItemInFolder?.(first)) }, ms:9000 });
    if(done && B.L.publish.open !== false && window.app?.openPath) Promise.resolve(window.app.openPath(where ? join2(dir, where) : dir)).catch(() => {});
    persist();
  }

  // ---------- Hooks ----------
  window.Publish = { open, close, get state(){ return B; } };
  const hook = () => { const b = document.getElementById('fileExportPdf'); if(!b || b.dataset.pdfHooked) return !!b; b.addEventListener('click', e => { e.preventDefault(); open(); }); b.dataset.pdfHooked = '1'; return true; };
  if(!hook()) document.addEventListener('DOMContentLoaded', hook);
})();
