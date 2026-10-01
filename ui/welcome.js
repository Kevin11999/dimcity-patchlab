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
    startTour({ onDone: ()=> projectInfoDialog({ mode:'new', fromWelcome }), finishLabel:'Create Project' });
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
const TOUR_STEPS = [
  { title:'Welcome to PatchLab', body:'PatchLab turns your LK, Veam and DMX patch lists into a validated, well-organised project — and into clean PDF paperwork for the crew. This tour takes about a minute.' },
  { target:'#tbImport', place:'bottom', title:'1 · Import your patch data', body:'Start by importing a CSV with LK/Veam IDs, port numbers, universes and locations. Header and footer rows are detected automatically, and you can map the columns yourself.' },
  { target:'#summary', place:'right', title:'2 · DimCities', body:'Everything is grouped per DimCity. The DimCity is derived from the ID: LK101 and V105 belong to DB01, LK215 to DB02. Select a DimCity to see its universes, LK blocks and Veams.' },
  { target:'.nav-item[data-view="HOME"]', place:'right', title:'3 · Project overview', body:'The overview shows totals per DimCity, how many Veams are linked, and the status of every check at a glance.' },
  { target:'.nav-item[data-view="ISSUES"]', place:'right', title:'4 · Validation', body:'PatchLab checks your patch continuously: Veams linked twice, universe conflicts, links to Veams that no longer exist, and block-type conflicts. The red badge shows open errors.' },
  { target:'#tbEditRows', place:'bottom', title:'5 · Edit rows', body:'Fix or add patch rows without touching the original CSV. Manual rows and edits are saved inside the project file.' },
  { target:'.nav-item[data-view="NETWORK"]', place:'right', title:'6 · Network planner', body:'Plan DMX nodes and splitters per DimCity. Build reusable node and splitter types once, then let PatchLab auto-assign universes and outputs.' },
  { target:'#fileExportPdf', place:'bottom', title:'7 · Report builder', body:'Design your PDF in a live preview: choose sections and their order, colours, page size and cover. Export one PDF or one per DimCity, and save layouts as templates.' },
  { target:'#tbSave', place:'bottom', title:'8 · Save your work', body:'Projects are saved as .lkproj files with everything inside — CSV sources, Veam links, network plans and report settings. Recent projects appear on the welcome screen.' },
  { title:"You're all set", body:'You can replay this tour any time from Help → Take the Tour. Next, give your project a name.' }
];

let tourState = null;
function startTour({ onDone, finishLabel='Finish' } = {}){
  endTour(false);
  const layer = document.createElement('div');
  layer.className = 'tour-layer';
  layer.innerHTML = '<div class="tour-spot center"></div><div class="tour-pop" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(layer);
  tourState = { i:0, layer, onDone, finishLabel };
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
  if(next >= TOUR_STEPS.length) return endTour(true);
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
  const s = TOUR_STEPS[i];
  const spot = layer.querySelector('.tour-spot');
  const pop = layer.querySelector('.tour-pop');
  const last = i === TOUR_STEPS.length - 1;
  pop.innerHTML = `<div class="step">Step ${i+1} of ${TOUR_STEPS.length}</div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>
    <div class="dots">${TOUR_STEPS.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div>
    <div class="nav"><button class="ghost sm skip" data-t="skip">${last ? '' : 'Skip tour'}</button>${i>0?`<button class="sm" data-t="back">Back</button>`:''}<button class="primary sm" data-t="next">${last ? esc(finishLabel) : 'Next'} ${I('arrowRight',13)}</button></div>`;
  if(last) pop.querySelector('[data-t=skip]').style.visibility = 'hidden';
  pop.querySelector('[data-t=skip]').onclick = ()=> endTour(true);
  pop.querySelector('[data-t=back]')?.addEventListener('click', ()=> step(-1));
  pop.querySelector('[data-t=next]').onclick = ()=> step(1);

  const target = s.target ? s.target.split(',').map(x => document.querySelector(x.trim())).find(Boolean) : null;
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
