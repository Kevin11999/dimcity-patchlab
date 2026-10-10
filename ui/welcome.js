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
          <button class="welcome-action" data-w="demo"><span class="ic">${I('star',18)}</span><span><b>Open Demo Show</b><span class="d">A complete festival show to explore: racks, nodes, PDF</span></span></button>
          <button class="welcome-action" data-w="tour"><span class="ic">${I('compass',18)}</span><span><b>Take the Tour</b><span class="d">Full tour, or one about LKs, nodes, racks or the PDF</span></span></button>
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
  q('[data-w=tour]').onclick = ()=>{ closeWelcome(); chooseTour({ onCancel: ()=> showWelcome(), onDone: ()=> showWelcome() }); };
  q('[data-w=demo]').onclick = ()=> window.Demo?.open?.({ silent:true });
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
    body:{ en:'Place a rack from the Rack Builder, or add a loose node, LK spider or Veam4 spider. PatchLab patches every LK and Veam onto a socket and a node port, colours each node, and tells you what is still missing. Every node shows which LK/Veam port is on which node port.',
           nl:'Plaats een rek uit de Rack Builder, of voeg een losse node, LK-spin of Veam4-spin toe. PatchLab patcht elke LK en Veam op een aansluiting en een nodepoort, geeft elke node een kleur en vertelt wat er nog ontbreekt. Elke node laat zien welke LK-/Veam-poort op welke nodepoort zit.' } },
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
// ---- Topic tours: LK & Veam, nodes & network, racks, PDF ----
const S2 = (en, nl) => ({ en, nl });
// liefst een LK met Veam-slots (geen 12× XLR), zodat de stappen over slots iets te laten zien hebben
const firstLk = () => { const dc = firstDim(); const lks = [...App.getMODEL().byLK.values()].filter(l => l.dimcity === dc); return (lks.find(l => App.effectiveBlockType(l) !== 'XLR12') || lks[0])?.id || null; };
const closeDialogs = () => { window.DeviceBuilder?.close?.(); window.PdfExport?.close?.(true); };
const click = sel => document.querySelector(sel)?.click();
const TOURS = {
  full: { title:S2('Full tour', 'Volledige rondleiding'), desc:S2('Everything in two minutes: import, DimCities, validation, racks, PDF, help.', 'Alles in twee minuten: import, DimCities, validatie, racks, PDF, help.'), icon:'compass', steps:TOUR_STEPS },
  lk: { title:S2('LK blocks & Veams', 'LK-blokken & Veams'), desc:S2('Block types, Veam slots, the merged port table, adding and deleting.', 'Bloktypes, Veam-slots, de samengevoegde poortentabel, toevoegen en verwijderen.'), icon:'box', steps:[
    { title:S2('LK blocks & Veams', 'LK-blokken & Veams'), body:S2('An LK block has 12 ports in three groups of four. Each group is XLR, or fed by a Veam in slot A, B or C. This tour shows how you set that up.', 'Een LK-blok heeft 12 poorten in drie groepen van vier. Elke groep is XLR, of wordt gevoed door een Veam in slot A, B of C. Deze rondleiding laat zien hoe je dat instelt.') },
    { go:() => { closeDialogs(); goDim(); scrollCard('lk'); }, target:'.lk-card-grid', place:'bottom', title:S2('1 · The LK blocks of a DimCity', '1 · De LK-blokken van een DimCity'), body:S2('Every LK is drawn with its ports: universe, location and source (LK, Veam or both). Grey ports are empty, red ones have a conflict between the LK and the Veam.', 'Elke LK staat getekend met zijn poorten: universe, locatie en bron (LK, Veam of beide). Grijze poorten zijn leeg, rode hebben een conflict tussen LK en Veam.') },
    { go:() => { const id = firstLk(); const c = document.querySelector(`.lk-mini-card[data-lk="${id}"]`); if(c && !c.classList.contains('open')) c.querySelector('.lk-visual')?.click(); }, target:'.inline-controls', place:'bottom', title:S2('2 · Click a block to edit it', '2 · Klik op een blok om het te bewerken'), body:S2('The inline panel opens with the block type and the three Veam slots. The same controls are on the LK page.', 'Het inline paneel opent met het bloktype en de drie Veam-slots. Dezelfde instellingen staan op de LK-pagina.') },
    { target:'select.lkBlockType', place:'bottom', title:S2('3 · Block type', '3 · Bloktype'), body:S2('Auto-detect picks 12× XLR when more than four LK ports are patched, otherwise 4× XLR + 3× Veam. Choose 3× Veam when all groups are Veams, or set the type yourself.', 'Automatisch kiest 12× XLR als meer dan vier LK-poorten gepatcht zijn, anders 4× XLR + 3× Veam. Kies 3× Veam als alle groepen Veams zijn, of zet het type zelf.') },
    { target:'select.lkVeamSlot', place:'bottom', title:S2('4 · Veam slots', '4 · Veam-slots'), body:S2('Pick a Veam of the same DimCity for slot A, B or C. A slot is greyed out when its four LK ports are already patched on the LK. A Veam can be linked once; a second link becomes an error.', 'Kies een Veam uit dezelfde DimCity voor slot A, B of C. Een slot is grijs als zijn vier LK-poorten al op de LK gepatcht zijn. Een Veam kan één keer gekoppeld worden; een tweede koppeling wordt een fout.') },
    { target:'.inline-table-wrap', place:'bottom', title:S2('5 · Merged port table', '5 · Samengevoegde poortentabel'), body:S2('The LK’s own rows and the linked Veam’s rows merged per port: universe, location, source and Veam port. A conflict means the two carry different universes.', 'De eigen regels van de LK en die van de gekoppelde Veam samengevoegd per poort: universe, locatie, bron en Veam-poort. Een conflict betekent dat ze een andere universe hebben.') },
    { go:() => { goDim(); scrollCard('veam'); }, target:'.lk-card-grid.veams', place:'bottom', title:S2('6 · Veams', '6 · Veams'), body:S2('Every Veam shows its four ports and whether it is linked (green), not linked (orange) or linked twice (red). An unlinked Veam gets its own Veam4 socket in the rack patch.', 'Elke Veam toont zijn vier poorten en of hij gekoppeld is (groen), niet gekoppeld (oranje) of twee keer gekoppeld (rood). Een niet-gekoppelde Veam krijgt een eigen Veam4-aansluiting in de rack-patch.') },
    { go:() => { const id = firstLk(); if(id) App.openEntity('LK', id); }, target:'[data-del-lk]', place:'bottom', title:S2('7 · Delete and undo', '7 · Verwijderen en ongedaan maken'), body:S2('Delete LK removes the block with its rows, also when they came from a CSV; links are cleaned up. Cmd/Ctrl+Z brings it back.', 'LK verwijderen haalt het blok met zijn regels weg, ook als die uit een CSV komen; koppelingen worden opgeruimd. Cmd/Ctrl+Z zet het terug.') },
    { go:() => App.navigate('HOME'), target:'#navAddMenu', place:'right', title:S2('8 · Adding by hand', '8 · Met de hand toevoegen'), body:S2('The + next to DimCities adds an LK or Veam without a CSV. The DimCity follows from the number; a new DimCity is created when needed. Rows for it go in via Edit Rows.', 'De + naast DimCities voegt een LK of Veam toe zonder CSV. De DimCity volgt uit het nummer; een nieuwe DimCity wordt aangemaakt als dat nodig is. Regels ervoor zet je in via Rijen bewerken.') },
    { title:S2('Done', 'Klaar'), body:S2('More in the manual: press ? on an LK page for the LK chapter.', 'Meer in de handleiding: druk op ? op een LK-pagina voor het LK-hoofdstuk.') }
  ] },
  nodes: { title:S2('Nodes & network', 'Nodes & netwerk'), desc:S2('Node types in the Device Builder, auto-assign, universes per port, IP addresses.', 'Nodetypes in de Device Builder, automatisch toewijzen, universes per poort, IP-adressen.'), icon:'network', steps:[
    { title:S2('Nodes & network', 'Nodes & netwerk'), body:S2('A node converts network data to DMX. You define node types once, then plan nodes per DimCity with a universe on every port and an IP address.', 'Een node zet netwerkdata om naar DMX. Je definieert nodetypes één keer, en plant daarna nodes per DimCity met een universe op elke poort en een IP-adres.') },
    { go:() => { closeDialogs(); window.DeviceBuilder?.open?.('node'); }, target:'.db-tabs', place:'bottom', title:S2('1 · Device Builder', '1 · Device Builder'), body:S2('Nodes, splitters, switches, panels and racks each have a tab. Luminex and ELC types are already in your library; add your own with New node.', 'Nodes, splitters, switches, panelen en racks hebben elk een tabblad. Luminex- en ELC-types staan al in je bibliotheek; voeg je eigen types toe met Nieuwe node.') },
    { target:'.db-form', place:'left', title:S2('2 · Node type', '2 · Nodetype'), body:S2('Brand and type, the number of DMX ports, 1 or 2 Ethernet ports, a default IP and subnet, height in U and a colour. The type key is fixed after saving.', 'Merk en type, het aantal DMX-poorten, 1 of 2 Ethernet-poorten, een standaard-IP en subnet, hoogte in U en een kleur. De typesleutel ligt vast na het opslaan.') },
    { target:'.db-preview', place:'bottom', title:S2('3 · Front face', '3 · Voorkant'), body:S2('The preview is the face you will see in racks and on the PDF: DMX ports left, network ports right.', 'Het voorbeeld is de voorkant die je in racks en op de PDF ziet: DMX-poorten links, netwerkpoorten rechts.') },
    { target:'[data-save]', place:'top', title:S2('4 · Save', '4 · Opslaan'), body:S2('Saving writes the type to this show and to your personal library, so it is available in every show. Export Library shares it with a colleague.', 'Opslaan schrijft het type naar deze show en naar je persoonlijke bibliotheek, dus het is in elke show beschikbaar. Bibliotheek exporteren deelt het met een collega.') },
    { go:() => { closeDialogs(); goDim(); scrollCard('nodes'); }, target:'[data-card$=":nodes"]', place:'bottom', title:S2('5 · Network nodes per DimCity', '5 · Netwerknodes per DimCity'), body:S2('Choose a node type and Auto-assign: PatchLab spreads the universes of the DimCity over as many nodes as needed. Or build it from the rack patch (Use as network plan on the Racks card).', 'Kies een nodetype en Automatisch toewijzen: PatchLab verdeelt de universes van de DimCity over zoveel nodes als nodig. Of bouw het uit de rack-patch (Gebruik als netwerkplan op de Racks-kaart).') },
    { target:'.node-instance-face', place:'bottom', title:S2('6 · Ports and IP', '6 · Poorten en IP'), body:S2('Every node shows its ports with the universe; click a port or drag a universe from the pool to change it. ID, name, IP and subnet follow the DimCity (node 1 of DB02 → ID:21, IP …21) and are editable.', 'Elke node toont zijn poorten met de universe; klik op een poort of sleep een universe uit de pool om hem te wijzigen. ID, naam, IP en subnet volgen de DimCity (node 1 van DB02 → ID:21, IP …21) en zijn te bewerken.') },
    { go:() => scrollCard('splitters'), target:'[data-card$=":splitters"]', place:'bottom', title:S2('7 · Splitters', '7 · Splitters'), body:S2('Auto-calculate splitters gives every patch point of a universe an output; A/B splitters carry two universes. The output map shows LK / Veam port and location per output.', 'Splitters automatisch berekenen geeft elk patchpunt van een universe een uitgang; A/B-splitters dragen twee universes. De uitgangenkaart toont LK- / Veam-poort en locatie per uitgang.') },
    { go:() => App.navigate('NETWORK'), target:'.nav-item[data-view="NETWORK"]', place:'right', title:S2('8 · Network planner', '8 · Netwerkplanner'), body:S2('The Network Planner page lists all nodes and splitters of the show with their IP addresses — the same data that goes on the PDF.', 'De pagina Netwerkplanner somt alle nodes en splitters van de show op met hun IP-adressen — dezelfde gegevens die op de PDF komen.') },
    { title:S2('Done', 'Klaar'), body:S2('Settings → Device library checks GitHub for new Luminex / ELC types. Press ? on the Nodes card for the manual.', 'Instellingen → Devicebibliotheek controleert GitHub op nieuwe Luminex- / ELC-types. Druk op ? op de Nodes-kaart voor de handleiding.') }
  ] },
  racks: { title:S2('Racks', 'Racks'), desc:S2('Build a rack, place it in a DimCity, loose devices, the automatic patch, node ports.', 'Een rek bouwen, in een DimCity plaatsen, losse apparaten, de automatische patch, nodepoorten.'), icon:'rack', steps:[
    { title:S2('Racks', 'Racks'), body:S2('A rack is built once in the Rack Builder and placed in DimCities as often as you like. PatchLab then patches every LK and Veam of that DimCity onto its sockets and node ports.', 'Een rek bouw je één keer in de Rack Builder en plaats je zo vaak als je wilt in DimCities. PatchLab patcht daarna elke LK en Veam van die DimCity op de aansluitingen en nodepoorten.') },
    { go:() => { closeDialogs(); window.DeviceBuilder?.open?.('rack'); }, target:'.rk-pal', place:'left', title:S2('1 · Palette', '1 · Palet'), body:S2('Your nodes, splitters, switches and panels. Drag one into the rack, or click + to add it at the first free position.', 'Je nodes, splitters, switches en panelen. Sleep er een in het rek, of klik op + om hem op de eerste vrije plek te zetten.') },
    { target:'#rkBay', place:'right', title:S2('2 · The rack', '2 · Het rek'), body:S2('U1 is at the bottom, like a real rack. Green rows mean a device fits, red means it does not. Move devices with the arrows or by dragging; racks can be 1U to 48U.', 'U1 staat onderaan, zoals in een echt rek. Groene rijen betekenen dat een device past, rood dat het niet past. Verplaats devices met de pijltjes of door te slepen; racks kunnen 1U tot 48U zijn.') },
    { target:'[data-rk="articleKey"]', place:'bottom', title:S2('3 · Name, article key, height', '3 · Naam, artikelsleutel, hoogte'), body:S2('The article key is your inventory number; it is printed on the Racks card and the PDF.', 'De artikelsleutel is je voorraadnummer; hij staat op de Racks-kaart en de PDF.') },
    { target:'.rk-summary', place:'top', title:S2('4 · Summary', '4 · Samenvatting'), body:S2('Counts the DMX ports, splitter outputs, RJ45 and LK37 / Veam4 / XLR sockets of the rack, so you see at a glance what it can feed.', 'Telt de DMX-poorten, splitteruitgangen, RJ45 en LK37- / Veam4- / XLR-aansluitingen van het rek, zodat je in één oogopslag ziet wat het kan voeden.') },
    { go:() => { closeDialogs(); goDim(); scrollCard('racks'); }, target:'#rpPlace', place:'bottom', title:S2('5 · Place it in a DimCity', '5 · In een DimCity plaatsen'), body:S2('Choose a rack and Place rack. Give it a name for this DimCity (Rack SL). The patch is computed from the current show every time, so it never goes stale.', 'Kies een rek en Rek plaatsen. Geef het een naam voor deze DimCity (Rack SL). De patch wordt elke keer uit de huidige show berekend, dus hij loopt nooit achter.') },
    { target:'.rp-stats', place:'bottom', title:S2('6 · Counters and recommendations', '6 · Tellers en adviezen'), body:S2('Used / available LK37 sockets, Veam4 sockets, node ports and lines. The recommendations say what is missing: a loose spider, an extra node, an unneeded splitter.', 'Gebruikt / beschikbaar voor LK37-aansluitingen, Veam4-aansluitingen, nodepoorten en lijnen. De adviezen zeggen wat er ontbreekt: een losse spin, een extra node, een overbodige splitter.') },
    { target:'.rp-racks', place:'top', title:S2('7 · The patched rack', '7 · Het gepatchte rek'), body:S2('Node ports show their universe, sockets the LK / Veam number. Every node has its own colour; the legend shows which node feeds which LK or Veam. Hover for details.', 'Nodepoorten tonen hun universe, aansluitingen het LK- / Veam-nummer. Elke node heeft een eigen kleur; de legenda toont welke node welke LK of Veam voedt. Beweeg eroverheen voor details.') },
    { target:'[data-loose-add="node"]', place:'top', title:S2('8 · Loose devices', '8 · Losse apparaten'), body:S2('A node without a rack, a loose LK spider or a Veam4 spider. A spider can be pinned to a loose node (On node) so its lines are patched there first.', 'Een node zonder rek, een losse LK-spin of een Veam4-spin. Een spin kun je aan een losse node hangen (Op node), zodat zijn lijnen daar eerst gepatcht worden.') },
    { target:'.np-strip', place:'top', title:S2('9 · Node ports', '9 · Nodepoorten'), body:S2('Per node: which LK or Veam port, with its location, sits on which node port — exactly what the crew needs at the rack. The same strip is on the PDF.', 'Per node: welke LK- of Veam-poort, met locatie, op welke nodepoort zit — precies wat de crew bij het rek nodig heeft. Dezelfde strook staat op de PDF.') },
    { target:'#rpApply', place:'bottom', title:S2('10 · Use it', '10 · Gebruiken'), body:S2('Use as network plan copies nodes and splitters with their universes into the network plan (IPs generated). Print racks opens the Report Builder with the Racks only preset.', 'Gebruik als netwerkplan kopieert nodes en splitters met hun universes naar het netwerkplan (IP’s gegenereerd). Racks printen opent de Rapportbouwer met de voorinstelling Alleen racks.') },
    { title:S2('Done', 'Klaar'), body:S2('Press ? on the Racks card for the full chapter, including how the patch order works.', 'Druk op ? op de Racks-kaart voor het volledige hoofdstuk, inclusief hoe de patchvolgorde werkt.') }
  ] },
  pdf: { title:S2('PDF layout', 'PDF-opmaak'), desc:S2('Sections, placing them on the sheet, style and line weight, cover, brand, templates, export.', 'Secties, plaatsen op het blad, stijl en lijndikte, voorblad, huisstijl, templates, exporteren.'), icon:'file', steps:[
    { title:S2('PDF layout', 'PDF-opmaak'), body:S2('The Report Builder designs the paperwork in a live preview. Everything you set is saved in the show and can be stored as a template.', 'De Rapportbouwer ontwerpt de paperwork in een live voorbeeld. Alles wat je instelt wordt in de show bewaard en kan als template opgeslagen worden.') },
    { go:() => { closeDialogs(); window.PdfExport?.open?.(); }, target:'#rbTabs', place:'bottom', title:S2('1 · Four tabs', '1 · Vier tabbladen'), body:S2('Content (DimCities, output, sections), Style (paper, colours, lines), Cover (title, logo, project details) and Brand (company logo, watermark).', 'Inhoud (DimCities, uitvoer, secties), Stijl (papier, kleuren, lijnen), Voorblad (titel, logo, projectgegevens) en Huisstijl (bedrijfslogo, watermerk).') },
    { target:'#rbSecs', place:'right', title:S2('2 · Sections', '2 · Secties'), body:S2('Switch sections on or off, drag to reorder, open the chevron for options and for Position on the sheet: Auto (top to bottom) or Fixed at X / Y with a width in mm.', 'Zet secties aan of uit, sleep om te ordenen, open het pijltje voor opties en voor Positie op het blad: Automatisch (van boven naar beneden) of Vast op X / Y met een breedte in mm.') },
    { target:'#rbFrame', place:'left', title:S2('3 · Live preview', '3 · Live voorbeeld'), body:S2('Click a part of the preview to jump to its settings. Drag the orange handle of a section to place it on the sheet (5 mm grid). Orange lines mark page breaks.', 'Klik op een deel van het voorbeeld om naar de instellingen te springen. Sleep de oranje greep van een sectie om hem op het blad te plaatsen (raster van 5 mm). Oranje lijnen markeren pagina-einden.') },
    { go:() => click('#rbTabs [data-tab="style"]'), target:'#rbPanel', place:'right', title:S2('4 · Style', '4 · Stijl'), body:S2('Paper size and orientation, margins, accent colour, font, text size, density and Line weight: Normal or Bold keeps lines readable on paper. Header and footer texts take {project}, {dimcity} and more.', 'Papierformaat en richting, marges, accentkleur, lettertype, tekstgrootte, dichtheid en Lijndikte: Normaal of Dik houdt lijnen leesbaar op papier. Kop- en voetteksten kennen {project}, {dimcity} en meer.') },
    { go:() => click('#rbTabs [data-tab="cover"]'), target:'#rbPanel', place:'right', title:S2('5 · Cover and project details', '5 · Voorblad en projectgegevens'), body:S2('Title, subtitle, which fields to show, a note and a logo you can drag around on the cover. The project details here update the project itself.', 'Titel, ondertitel, welke velden getoond worden, een notitie en een logo dat je op het voorblad kunt verslepen. De projectgegevens hier werken het project zelf bij.') },
    { go:() => click('#rbTabs [data-tab="brand"]'), target:'#rbPanel', place:'right', title:S2('6 · Brand', '6 · Huisstijl'), body:S2('A company logo on every page (top or bottom) and a text or logo watermark. Save it as a template to reuse your house style in every show.', 'Een bedrijfslogo op elke pagina (boven of onder) en een tekst- of logowatermerk. Sla het op als template om je huisstijl in elke show te gebruiken.') },
    { target:'#rbTemplate', place:'bottom', title:S2('7 · Templates and presets', '7 · Templates en voorinstellingen'), body:S2('Presets such as Patch crew or Racks only switch the right sections on. Save as template stores your own layout in the project and your library.', 'Voorinstellingen zoals Patch crew of Alleen racks zetten de juiste secties aan. Opslaan als template bewaart je eigen indeling in het project en je bibliotheek.') },
    { target:'#rbExport', place:'bottom', title:S2('8 · Export', '8 · Exporteren'), body:S2('One PDF, or one per DimCity (each with its own cover). The file name follows the project and the DimCities.', 'Eén PDF, of één per DimCity (elk met een eigen voorblad). De bestandsnaam volgt het project en de DimCities.') },
    { title:S2('Done', 'Klaar'), body:S2('The Report Builder stays open — try it out. Press ? here for the manual chapter.', 'De Rapportbouwer blijft open — probeer het uit. Druk hier op ? voor het hoofdstuk in de handleiding.') }
  ] }
};
const tourSteps = () => (TOURS[tourState?.tour || 'full']?.steps || TOUR_STEPS).filter(s => !s.when || s.when());

// Keuzemenu: welke rondleiding? Zonder gegevens eerst de demo-show aanbieden.
function chooseTour({ onCancel, onDone } = {}){
  const lg = L(), T = (en, nl) => lg === 'nl' ? nl : en;
  const empty = !(App.getMODEL()?.byDim?.size);
  const d = UIx.openDialog({
    title:T('Take a tour', 'Rondleiding'), width:'560px',
    subtitle:T('Choose the whole story or one subject. Use the arrow keys to step through.', 'Kies het hele verhaal of één onderwerp. Stap door met de pijltjestoetsen.'),
    body:`<div class="np-choice tour-choice">${Object.entries(TOURS).map(([k, tr]) => `<button class="np-option" data-tour="${k}"><span class="ic">${I(tr.icon, 18)}</span><b>${esc(tr.title[lg])}</b><span>${esc(tr.desc[lg])} <em class="subtle">· ${tr.steps.length} ${T('steps', 'stappen')}</em></span></button>`).join('')}</div>
      ${empty ? `<label class="check" style="margin-top:12px"><input type="checkbox" id="tourDemo" checked> ${T('Open the demo show first, so there is something to see', 'Open eerst de demo-show, zodat er iets te zien is')}</label>` : ''}`,
    footer:`<button data-c="cancel">${T('Cancel', 'Annuleren')}</button>`,
    onClose:() => { if(!picked) onCancel?.(); }
  });
  let picked = false;
  d.modal.querySelector('[data-c=cancel]').onclick = () => d.close();
  d.modal.querySelectorAll('[data-tour]').forEach(b => b.onclick = async () => {
    picked = true;
    const wantDemo = d.modal.querySelector('#tourDemo')?.checked;
    d.close();
    if(wantDemo) await window.Demo?.open?.({ silent:true });
    startTour({ tour:b.dataset.tour, onDone });
  });
}


let tourState = null;
function startTour({ onDone, finishLabel, tour='full' } = {}){
  finishLabel = finishLabel || (L() === 'nl' ? 'Klaar' : 'Finish');
  endTour(false);
  const layer = document.createElement('div');
  layer.className = 'tour-layer';
  layer.setAttribute('data-no-i18n', '');   // de stappen zijn al in de gekozen taal
  layer.innerHTML = '<div class="tour-spot center"></div><div class="tour-pop" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(layer);
  tourState = { i:0, layer, onDone, finishLabel, went:-1, tour:TOURS[tour] ? tour : 'full' };
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
  if(s.target && !target && s.go && tourState.retried !== i){ tourState.retried = i; return requestAnimationFrame(placeTour); }
  const pw = pop.offsetWidth, ph = pop.offsetHeight, pad = 6, gap = 14;
  if(!target){
    spot.classList.add('center');
    pop.style.left = `${Math.round(innerWidth/2 - pw/2)}px`;
    pop.style.top = `${Math.round(innerHeight*0.42 - ph/2)}px`;
    return;
  }
  // doel in beeld brengen als het buiten het scherm staat (eenmalig per stap)
  if(tourState.scrolled !== i){
    tourState.scrolled = i;
    const rr = target.getBoundingClientRect();
    if(rr.top < 60 || rr.bottom > innerHeight - 60){ target.scrollIntoView({ block:'center' }); return requestAnimationFrame(placeTour); }
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
  startTour, chooseTour, showShortcuts, showAbout
};

// Bij opstarten automatisch tonen
if(prefGet(PREF_STARTUP, true) && !new URLSearchParams(location.search).has('nowelcome')) showWelcome();
