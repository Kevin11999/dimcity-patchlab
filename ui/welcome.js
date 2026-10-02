// ui/welcome.js — welkomstscherm, nieuw-project-flow, rondleiding, projectinformatie.
const App = window.LKApp;
const UIx = App.ui;
const I = (n, s=16) => window.Icons.icon(n, s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const PREF_STARTUP = 'patchlab.showWelcomeAtStartup';

const prefGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const prefSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; };
function timeAgo(iso){
  if(!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if(s < 60) return 'just now';
  if(s < 3600) return `${Math.floor(s/60)} min ago`;
  if(s < 86400) return `${Math.floor(s/3600)} h ago`;
  if(s < 86400*7) return `${Math.floor(s/86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

// ===================== Welcome =====================
let welcomeEl = null;

async function showWelcome(){
  closeWelcome();
  const info = await window.app?.appInfo?.().catch(()=>null) || { version:'' };
  const recent = await window.app?.recentList?.().catch(()=>[]) || [];
  const last = recent.find(r => r.exists);
  const others = recent.filter(r => r !== last);

  welcomeEl = document.createElement('div');
  welcomeEl.className = 'welcome';
  welcomeEl.innerHTML = `
    <div class="welcome-card" role="dialog" aria-label="Welcome">
      <div class="welcome-left">
        <div class="logo"><img src="./assets/dimcity-patchlab-logo.svg" width="46" height="46" alt=""></div>
        <h1>Welcome to PatchLab</h1>
        <p>Prepare, validate and document LK, Veam and DMX patching per DimCity — from CSV import to a print-ready PDF report.</p>
        <div class="welcome-actions">
          <button class="welcome-action primary-action" data-w="new"><span class="ic">${I('filePlus',18)}</span><span><b>New Project</b><span class="d">Start fresh — with an optional quick tour</span></span></button>
          <button class="welcome-action" data-w="open"><span class="ic">${I('folder',18)}</span><span><b>Open Project…</b><span class="d">Browse for a .lkproj file</span></span></button>
          <button class="welcome-action" data-w="tour"><span class="ic">${I('compass',18)}</span><span><b>Take the Tour</b><span class="d">A one-minute walkthrough of the workspace</span></span></button>
        </div>
        <div class="welcome-foot">
          <label class="check"><input type="checkbox" id="wStartup" ${prefGet(PREF_STARTUP, true) ? 'checked' : ''}> Show at startup</label>
          <span>DimCity PatchLab ${esc(info.version || '')}</span>
        </div>
      </div>
      <div class="welcome-right">
        ${last ? `
          <h2>Continue where you left off</h2>
          <div class="last-file">
            <span class="ic">${I('file',20)}</span>
            <div class="info"><b>${esc(last.name)}</b><span title="${esc(last.path)}">${esc(last.path)}</span><span>Last opened ${esc(timeAgo(last.openedAt))}</span></div>
            <button class="primary" data-w="last">Open ${I('arrowRight',14)}</button>
          </div>` : ''}
        <h2>Recent projects</h2>
        <div class="recent-list">
          ${others.length ? others.map(r => `
            <button class="recent-item ${r.exists ? '' : 'missing'}" data-path="${esc(r.path)}" ${r.exists ? '' : 'title="File not found"'}>
              ${I(r.exists ? 'file' : 'alert', 16)}
              <span class="info"><b>${esc(r.name)}</b><span>${esc(r.exists ? r.path : 'File not found — ' + r.path)}</span></span>
              <span class="when">${esc(timeAgo(r.openedAt))}</span>
            </button>`).join('')
          : `<div class="empty" style="padding:30px 10px">${I('clock',26)}<p>${last ? 'No other recent projects.' : 'No recent projects yet. Projects you open or save will appear here.'}</p></div>`}
        </div>
      </div>
    </div>`;
  document.body.appendChild(welcomeEl);

  const q = s => welcomeEl.querySelector(s);
  q('[data-w=new]').onclick = ()=> newProject({ fromWelcome:true, skipDirtyCheck:true });
  q('[data-w=open]').onclick = async ()=>{ if(await window.ProjectIO.fileOpenProject()) closeWelcome(); };
  q('[data-w=tour]').onclick = ()=>{ closeWelcome(); startTour({ onDone: ()=> showWelcome() }); };
  q('[data-w=last]')?.addEventListener('click', async ()=>{ if(await window.ProjectIO.openProjectPath(last.path)) closeWelcome(); });
  welcomeEl.querySelectorAll('.recent-item').forEach(b => b.onclick = async ()=>{
    const r = recent.find(x => x.path === b.dataset.path);
    if(!r) return;
    if(!r.exists){
      await window.app?.recentRemove?.(r.path);
      UIx.toast(`${r.name} was moved or deleted and has been removed from the list.`, 'info');
      return showWelcome();
    }
    if(await window.ProjectIO.openProjectPath(r.path)) closeWelcome();
  });
  q('#wStartup').onchange = e => prefSet(PREF_STARTUP, e.target.checked);
}
function closeWelcome(){ welcomeEl?.remove(); welcomeEl = null; }

// ===================== New project =====================
async function newProject({ fromWelcome=false, skipDirtyCheck=false } = {}){
  if(!skipDirtyCheck && !(await window.ProjectIO.confirmSaveIfDirty())) return;
  const d = UIx.openDialog({
    title:'New Project',
    subtitle:'Would you like a short tour of PatchLab first?',
    width:'600px',
    body:`<div class="np-choice">
      <button class="np-option" data-c="tour"><span class="ic">${I('compass',18)}</span><b>Take the quick tour</b><span>A one-minute walkthrough of the workspace — click Next at your own pace. You create the project at the end.</span></button>
      <button class="np-option" data-c="skip"><span class="ic">${I('arrowRight',18)}</span><b>Skip the tour</b><span>Go straight to the project details and start working.</span></button>
    </div>`,
    footer:`<button data-c="cancel">${fromWelcome ? 'Back' : 'Cancel'}</button>`
  });
  d.modal.querySelector('[data-c=cancel]').onclick = ()=> d.close();
  d.modal.querySelector('[data-c=skip]').onclick = ()=>{ d.close(); closeWelcome(); window.ProjectIO.newProject({}); projectInfoDialog({ mode:'new', fromWelcome }); };
  d.modal.querySelector('[data-c=tour]').onclick = ()=>{
    d.close(); closeWelcome();
    window.ProjectIO.newProject({});
    startTour({ onDone: ()=> projectInfoDialog({ mode:'new', fromWelcome }), finishLabel: L() === 'nl' ? 'Project aanmaken' : 'Create Project' });
  };
}

function projectInfoDialog({ mode='edit', fromWelcome=false } = {}){
  const M = App.getMODEL();
  const meta = M.projectMeta || {};
  const isNew = mode === 'new';
  const d = UIx.openDialog({
    title: isNew ? 'Create Project' : 'Project Information',
    subtitle: isNew ? 'These details appear on the cover of your PDF reports. You can change them later.' : 'Shown in the overview and on the cover of PDF reports.',
    width:'560px',
    body:`<div class="form-grid">
      <label class="field span-2">Project name<input id="piProject" type="text" placeholder="e.g. Defqon.1 2026" value="${esc(meta.project || '')}"></label>
      <label class="field">Area<input id="piArea" type="text" placeholder="e.g. Mainstage" value="${esc(meta.area || '')}"></label>
      <label class="field">Location<input id="piLocation" type="text" placeholder="e.g. Biddinghuizen" value="${esc(meta.location || '')}"></label>
      <label class="field">Date<input id="piDate" type="date" value="${esc(meta.date || (isNew ? todayIso() : ''))}"></label>
      <label class="field">Prepared by<input id="piPrepared" type="text" placeholder="Your name" value="${esc(meta.prepared || '')}"></label>
      ${isNew ? `<label class="check span-2" style="margin-top:4px"><input type="checkbox" id="piImport" checked> Import a CSV file right away</label>` : ''}
    </div><div class="form-error" id="piError"></div>`,
    footer:`<button data-a="cancel">${isNew && fromWelcome ? 'Back' : 'Cancel'}</button><button class="primary" data-a="ok">${isNew ? 'Create Project' : 'Save'}</button>`,
    onClose: ()=>{ if(isNew && fromWelcome && !created) showWelcome(); }
  });
  let created = false;
  const q = s => d.modal.querySelector(s);
  setTimeout(()=> q('#piProject').focus(), 30);
  q('[data-a=cancel]').onclick = ()=> d.close();
  const submit = ()=>{
    const next = {
      ...meta,
      project: q('#piProject').value.trim(),
      area: q('#piArea').value.trim(),
      location: q('#piLocation').value.trim(),
      date: q('#piDate').value,
      prepared: q('#piPrepared').value.trim(),
      logo: meta.logo || null
    };
    if(isNew && !next.project){ q('#piError').textContent = 'Give your project a name.'; q('#piProject').focus(); return; }
    created = true;
    const wantImport = isNew && q('#piImport')?.checked;
    d.close();
    if(isNew){
      window.ProjectIO.newProject(next);
      UIx.toast(`Project “${next.project}” created`);
      if(wantImport) window.ProjectIO.importCsvStart();
    } else {
      const M2 = App.getMODEL();
      M2.projectMeta = next;
      M2.ui.dirty = true;
      App.renderAll();
    }
  };
  q('[data-a=ok]').onclick = submit;
  d.modal.addEventListener('keydown', e=>{ if(e.key === 'Enter' && e.target.tagName === 'INPUT') submit(); });
}

// ===================== Tour =====================
// Every step has an English and a Dutch text. `go` navigates before the step is shown,
// `when` skips the step when it does not apply (for example no DimCity yet).
const L = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
const firstDim = () => App.sortedDims?.()[0] || null;
const goDim = () => { const dc = firstDim(); if(dc) App.openEntity('DIM', dc); };
const scrollCard = key => { const dc = firstDim(); const c = document.querySelector(`[data-card="${dc}:${key}"]`); if(c){ c.classList.remove('collapsed'); c.scrollIntoView({ block:'start' }); } };
const TOUR_STEPS = [
  { title:{ en:'Welcome to PatchLab', nl:'Welkom bij PatchLab' },
    body:{ en:'PatchLab turns your LK, Veam and DMX patch lists into a validated, well-organised project — and into clean PDF paperwork for the crew. This tour takes about two minutes; use the arrow keys or the buttons.',
           nl:'PatchLab maakt van je LK-, Veam- en DMX-patchlijsten een gecontroleerd, overzichtelijk project — en nette PDF-paperwork voor de crew. Deze rondleiding duurt ongeveer twee minuten; gebruik de pijltjestoetsen of de knoppen.' } },
  { target:'#tbImport', place:'bottom', title:{ en:'1 · Import your patch data', nl:'1 · Importeer je patchgegevens' },
    body:{ en:'Start by importing a CSV with LK/Veam IDs, port numbers, universes and locations. Header and footer rows are detected automatically, and you map the columns yourself.',
           nl:'Begin met het importeren van een CSV met LK-/Veam-ID’s, poortnummers, universes en locaties. Kop- en voetregels worden automatisch herkend, en je koppelt de kolommen zelf.' } },
  { target:'#summary', place:'right', title:{ en:'2 · DimCities', nl:'2 · DimCities' },
    body:{ en:'Everything is grouped per DimCity. The DimCity is derived from the ID: LK101 and V105 belong to DB01, LK215 to DB02. Select a DimCity to see its universes, LK blocks, Veams, racks and nodes.',
           nl:'Alles is gegroepeerd per DimCity. De DimCity volgt uit het ID: LK101 en V105 horen bij DB01, LK215 bij DB02. Kies een DimCity om zijn universes, LK-blokken, Veams, racks en nodes te zien.' } },
  { target:'.nav-item[data-view="HOME"]', place:'right', title:{ en:'3 · Project overview', nl:'3 · Projectoverzicht' },
    body:{ en:'The overview shows totals per DimCity, how many Veams are linked, and the status of every check at a glance.',
           nl:'Het overzicht toont totalen per DimCity, hoeveel Veams gekoppeld zijn en in één oogopslag de status van elke controle.' } },
  { target:'.nav-item[data-view="ISSUES"]', place:'right', title:{ en:'4 · Validation', nl:'4 · Validatie' },
    body:{ en:'PatchLab checks your patch continuously: Veams linked twice, universe conflicts, links to Veams that no longer exist, block-type conflicts. The red badge counts open errors; most issues have a Fix button.',
           nl:'PatchLab controleert je patch voortdurend: dubbel gekoppelde Veams, universe-conflicten, koppelingen naar Veams die niet meer bestaan, bloktype-conflicten. Het rode badge telt open fouten; de meeste meldingen hebben een knop Oplossen.' } },
  { target:'#tbEditRows', place:'bottom', title:{ en:'5 · Edit rows', nl:'5 · Regels bewerken' },
    body:{ en:'Fix or add patch rows without touching the original CSV. Manual rows and edits are saved inside the project file.',
           nl:'Herstel of voeg patchregels toe zonder de originele CSV aan te raken. Handmatige regels en bewerkingen worden in het projectbestand opgeslagen.' } },
  { when:() => !!firstDim(), go:() => { goDim(); scrollCard('lk'); }, target:'.lk-card-grid', place:'bottom', title:{ en:'6 · LK blocks and Veams', nl:'6 · LK-blokken en Veams' },
    body:{ en:'On a DimCity page every LK is drawn with its 12 ports. Click a block to set its block type (4× XLR + 3× Veam, 3× Veam or 12× XLR) and to link a Veam to slot A, B or C. Delete buttons remove an LK or Veam together with its rows.',
           nl:'Op een DimCity-pagina staat elke LK getekend met zijn 12 poorten. Klik op een blok om het bloktype te kiezen (4× XLR + 3× Veam, 3× Veam of 12× XLR) en een Veam aan slot A, B of C te koppelen. Met Verwijderen haal je een LK of Veam met zijn regels weg.' } },
  { when:() => !!firstDim(), go:() => { goDim(); scrollCard('racks'); }, target:'[data-card$=":racks"]', place:'bottom', title:{ en:'7 · Racks and loose devices', nl:'7 · Racks en losse apparaten' },
    body:{ en:'Place a rack from the Rack Builder, or add a loose node, LK spider or VIM4 spider. PatchLab patches every LK and Veam onto a socket and a node port, colours each node, and tells you what is still missing. Every node shows which LK/Veam port is on which node port.',
           nl:'Plaats een rek uit de Rack Builder, of voeg een losse node, LK-spin of VIM4-spin toe. PatchLab patcht elke LK en Veam op een aansluiting en een nodepoort, geeft elke node een kleur en vertelt wat er nog ontbreekt. Elke node laat zien welke LK-/Veam-poort op welke nodepoort zit.' } },
  { go:() => App.navigate('HOME'), target:'.nav-item[data-view="NETWORK"]', place:'right', title:{ en:'8 · Network planner and Device Builder', nl:'8 · Netwerkplanner en Device Builder' },
    body:{ en:'Plan DMX nodes and splitters per DimCity, with IP addresses and universes per port. Device types and racks are built once in the Device Builder (Network menu) and kept in your personal library for every show.',
           nl:'Plan DMX-nodes en splitters per DimCity, met IP-adressen en universes per poort. Devicetypes en racks bouw je één keer in de Device Builder (menu Netwerk); ze blijven in je persoonlijke bibliotheek voor elke show.' } },
  { target:'#fileExportPdf', place:'bottom', title:{ en:'9 · Report Builder', nl:'9 · Rapportbouwer' },
    body:{ en:'Design your PDF in a live preview: sections and their order, rack drawings, colours, line weight, page size and cover. Place sections anywhere on the sheet by dragging. Export one PDF or one per DimCity, and save layouts as templates.',
           nl:'Ontwerp je PDF in een live voorbeeld: secties en hun volgorde, rektekeningen, kleuren, lijndikte, papierformaat en voorblad. Plaats secties waar je wilt door te slepen. Exporteer één PDF of één per DimCity, en bewaar indelingen als template.' } },
  { target:'#tbSearch', place:'bottom', title:{ en:'10 · Search everything', nl:'10 · Alles zoeken' },
    body:{ en:'Cmd/Ctrl+K finds LKs, Veams, universes, locations, nodes, devices and commands. Undo with Cmd/Ctrl+Z; the history (Edit menu) describes every change.',
           nl:'Cmd/Ctrl+K vindt LK’s, Veams, universes, locaties, nodes, devices en opdrachten. Ongedaan maken met Cmd/Ctrl+Z; de geschiedenis (menu Bewerken) beschrijft elke wijziging.' } },
  { target:'#tbHelp', place:'bottom', title:{ en:'11 · Help, right where you are', nl:'11 · Help, precies waar je bent' },
    body:{ en:'Help (or ? / F1) opens the manual on the chapter that matches the page or dialog you are looking at — racks, nodes, the Report Builder, settings. It is searchable and available in English and Dutch.',
           nl:'Help (of ? / F1) opent de handleiding op het hoofdstuk dat hoort bij de pagina of het venster waar je naar kijkt — racks, nodes, de Rapportbouwer, instellingen. Je kunt erin zoeken, in het Engels en Nederlands.' } },
  { target:'#tbRequest', place:'bottom', title:{ en:'12 · Wishes and bugs', nl:'12 · Wensen en fouten' },
    body:{ en:'Missing something? Request opens a short form; it becomes a GitHub issue with the app version and page added, so you can follow what happens with it.',
           nl:'Mis je iets? Request opent een kort formulier; het wordt een GitHub-issue met de app-versie en pagina erbij, zodat je kunt volgen wat ermee gebeurt.' } },
  { target:'#tbSave', place:'bottom', title:{ en:'13 · Save your work', nl:'13 · Sla je werk op' },
    body:{ en:'Projects are saved as .lkproj files with everything inside — CSV sources, Veam links, racks, network plans and report settings. Autosave, backups and the language are set under Settings (Cmd/Ctrl+,).',
           nl:'Projecten worden opgeslagen als .lkproj-bestanden met alles erin — CSV-bronnen, Veam-koppelingen, racks, netwerkplannen en rapportinstellingen. Automatisch opslaan, back-ups en de taal stel je in onder Instellingen (Cmd/Ctrl+,).' } },
  { title:{ en:"You're all set", nl:'Je bent klaar om te beginnen' },
    body:{ en:'You can replay this tour any time from Help → Take the Tour, and open the manual with ?. Next, give your project a name.',
           nl:'Je kunt deze rondleiding altijd opnieuw starten via Help → Rondleiding, en de handleiding openen met ?. Geef nu je project een naam.' } }
];
const tourSteps = () => TOUR_STEPS.filter(s => !s.when || s.when());

let tourState = null;
function startTour({ onDone, finishLabel } = {}){
  finishLabel = finishLabel || (L() === 'nl' ? 'Klaar' : 'Finish');
  endTour(false);
  const layer = document.createElement('div');
  layer.className = 'tour-layer';
  layer.setAttribute('data-no-i18n', '');   // de stappen zijn al in de gekozen taal
  layer.innerHTML = '<div class="tour-spot center"></div><div class="tour-pop" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(layer);
  tourState = { i:0, layer, onDone, finishLabel, went:-1 };
  const onKey = e=>{
    if(!tourState) return;
    if(e.key === 'ArrowRight' || e.key === 'Enter'){ e.preventDefault(); step(1); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); step(-1); }
    else if(e.key === 'Escape'){ e.preventDefault(); endTour(true); }
  };
  const onResize = ()=> placeTour();
  tourState.cleanup = ()=>{ document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  placeTour();
}
function step(delta){
  if(!tourState) return;
  const next = tourState.i + delta;
  if(next < 0) return;
  if(next >= tourSteps().length) return endTour(true);
  tourState.i = next;
  placeTour();
}
function endTour(callDone){
  if(!tourState) return;
  const { layer, onDone, cleanup } = tourState;
  cleanup?.();
  layer.remove();
  tourState = null;
  if(callDone) onDone?.();
}
function placeTour(){
  const { i, layer, finishLabel } = tourState;
  const steps = tourSteps(), s = steps[i], lg = L();
  if(s.go && tourState.went !== i){ tourState.went = i; try { s.go(); } catch {} }
  const spot = layer.querySelector('.tour-spot');
  const pop = layer.querySelector('.tour-pop');
  const last = i === steps.length - 1;
  const T = (en, nl) => lg === 'nl' ? nl : en;
  pop.innerHTML = `<div class="step">${T('Step', 'Stap')} ${i+1} ${T('of', 'van')} ${steps.length}</div><h3>${esc(s.title[lg])}</h3><p>${esc(s.body[lg])}</p>
    <div class="dots">${steps.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div>
    <div class="nav"><button class="ghost sm skip" data-t="skip">${last ? '' : T('Skip tour', 'Rondleiding overslaan')}</button>${i>0?`<button class="sm" data-t="back">${T('Back', 'Terug')}</button>`:''}<button class="primary sm" data-t="next">${last ? esc(finishLabel) : T('Next', 'Volgende')} ${I('arrowRight',13)}</button></div>`;
  if(last) pop.querySelector('[data-t=skip]').style.visibility = 'hidden';
  pop.querySelector('[data-t=skip]').onclick = ()=> endTour(true);
  pop.querySelector('[data-t=back]')?.addEventListener('click', ()=> step(-1));
  pop.querySelector('[data-t=next]').onclick = ()=> step(1);

  const target = s.target ? s.target.split(',').map(x => document.querySelector(x.trim())).find(Boolean) : null;
  if(s.target && !target && s.go && !tourState.retried){ tourState.retried = i; return requestAnimationFrame(placeTour); }
  const pw = pop.offsetWidth, ph = pop.offsetHeight, pad = 6, gap = 14;
  if(!target){
    spot.classList.add('center');
    pop.style.left = `${Math.round(innerWidth/2 - pw/2)}px`;
    pop.style.top = `${Math.round(innerHeight*0.42 - ph/2)}px`;
    return;
  }
  let r = target.getBoundingClientRect();
  if(target.id === 'summary'){ // zijbalksectie: neem label + lijst samen
    const label = target.previousElementSibling?.getBoundingClientRect();
    if(label) r = { left:Math.min(label.left, r.left), top:label.top, right:Math.max(label.right, r.right), bottom:Math.max(r.bottom, label.bottom + 60), width:0, height:0 };
  }
  const rect = { left:r.left - pad, top:r.top - pad, width:(r.right - r.left) + pad*2, height:(r.bottom - r.top) + pad*2 };
  spot.classList.remove('center');
  Object.assign(spot.style, { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px` });
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  let left, top;
  if(s.place === 'right'){ left = rect.left + rect.width + gap; top = rect.top; }
  else if(s.place === 'left'){ left = rect.left - pw - gap; top = rect.top; }
  else { left = rect.left + rect.width/2 - pw/2; top = rect.top + rect.height + gap; }
  pop.style.left = `${clamp(left, 12, innerWidth - pw - 12)}px`;
  pop.style.top = `${clamp(top, 12, innerHeight - ph - 12)}px`;
}

// ===================== Shortcuts / About =====================
function showShortcuts(){
  const mac = navigator.platform.toLowerCase().includes('mac');
  const k = s => s.split('+').map(x => `<kbd>${x === 'Mod' ? (mac ? '⌘' : 'Ctrl') : x === 'Shift' ? (mac ? '⇧' : 'Shift') : x}</kbd>`).join(' ');
  const rows = [
    ['New project','Mod+N'], ['Open project','Mod+O'], ['Save','Mod+S'], ['Save as','Mod+Shift+S'],
    ['Import CSV','Mod+I'], ['Edit patch rows','Mod+E'], ['Report builder / Export PDF','Mod+P'],
    ['Overview','Mod+1'], ['Validation','Mod+2'], ['Patch list','Mod+3'], ['Recalculate','Mod+R']
  ];
  const d = UIx.openDialog({ title:'Keyboard Shortcuts', width:'440px', body:`<div class="kbd-list">${rows.map(([a,b])=>`<span>${a}</span><span>${k(b)}</span>`).join('')}</div>`, footer:'<button class="primary" data-a="ok">Close</button>' });
  d.footer.querySelector('[data-a=ok]').onclick = d.close;
}
async function showAbout(){
  const info = await window.app?.appInfo?.().catch(()=>null) || {};
  const d = UIx.openDialog({ title:'About DimCity PatchLab', width:'440px',
    body:`<div style="display:flex;gap:16px;align-items:center"><img src="./assets/dimcity-patchlab-logo.svg" width="64" height="64" alt=""><div><b style="font-size:15px">DimCity PatchLab</b><div class="muted">Version ${esc(info.version || '—')}</div><div class="subtle" style="margin-top:6px">LK / Veam patching, validation and DimCity reporting.</div></div></div>`,
    footer:'<button class="primary" data-a="ok">Close</button>' });
  d.footer.querySelector('[data-a=ok]').onclick = d.close;
}

window.PatchLabUI = {
  showWelcome, closeWelcome, newProject,
  editProjectInfo: ()=> projectInfoDialog({ mode:'edit' }),
  startTour, showShortcuts, showAbout
};

// Bij opstarten automatisch tonen
if(prefGet(PREF_STARTUP, true) && !new URLSearchParams(location.search).has('nowelcome')) showWelcome();
