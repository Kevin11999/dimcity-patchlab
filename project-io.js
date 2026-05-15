// project-io.js
// Snapshotten & laden van je project – één consistente implementatie
(function(){
  const App = window.LKApp || {};
  const $  = App.$  || (s=>document.querySelector(s));

  // ---------- helpers ----------
  function nowIso(){ return new Date().toISOString(); }
  function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
  function asArr(it){ return Array.isArray(it) ? it : Array.from(it||[]); }

function ensureLkprojPath(p){
  if (!p) return p;
  const low = p.toLowerCase();
  // geen extensie óf niet .lkproj => toevoegen
  if (!/\.[^/\\]+$/.test(p) || !low.endsWith('.lkproj')) return p + '.lkproj';
  return p;
}

function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ensureLkprojPath(filename || 'project.lkproj');
  document.body.appendChild(a); a.click(); a.remove();
}

function pickFileOnce(){
  return new Promise((resolve)=>{
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.lkproj,.json,application/json';
    inp.onchange = ()=>{
      const f = inp.files?.[0]; if(!f){ resolve(null); return; }
      const rd = new FileReader();
      rd.onload = ()=> resolve({ path: f.name, content: rd.result });
      rd.readAsText(f);
    };
    inp.click();
  });
}


function normalizeNetworkDevices(net){
  const base = { prefs:{ nodeSparePorts:0, splitterSparePorts:0 }, nodeTypes:[], splitterTypes:[], nodes:[], splitters:[], dimCityPlans:{} }
  if(!net || typeof net !== 'object') return base;
  const nodeTypes = Array.isArray(net.nodeTypes) ? net.nodeTypes : [];
  const splitterTypes = Array.isArray(net.splitterTypes) ? net.splitterTypes : [];
  return {
    prefs: {
      nodeSparePorts: Number(net.prefs?.nodeSparePorts ?? 0),
      splitterSparePorts: Number(net.prefs?.splitterSparePorts ?? 0)
    },
    nodeTypes,
    splitterTypes,
    nodes: Array.isArray(net.nodes) ? net.nodes : [],
    splitters: Array.isArray(net.splitters) ? net.splitters : [],
    dimCityPlans: (net.dimCityPlans && typeof net.dimCityPlans === 'object' && !Array.isArray(net.dimCityPlans)) ? net.dimCityPlans : {}
  };
}

  // ---------- snapshot bouw ----------
  // rijen voor processRows: [id, port, universe, dest, (legacy truss leeg), (dmx dimcity optioneel)]
  function collectRowsForSave(){
    const M = App.getMODEL();
    const rows = [];

    // LK
    for (const L of (M.lines || [])){
      rows.push([ L.id, String(L.port ?? ''), (L.universe ?? ''), (L.dest ?? ''), '' ]);
    }
    // VEAM
    for (const V of (M.veamLines || [])){
      rows.push([ V.id, String(V.port ?? ''), (V.universe ?? ''), (V.dest ?? ''), '' ]);
    }
    // DMX losse kabels (id leeg, dimcity op veld 6)
    for (const D of (M.dmxLoose || [])){
      rows.push([ '', '', (D.universe ?? ''), (D.dest ?? ''), '', (D.dimcity ?? '') ]);
    }
    return rows;
  }

 
// --- Snapshot v1 (rows + lkAssign + lkBlockType) ---
function buildSnapshot(){
  const M = window.LKApp.getMODEL();
  const rows = [];
  for (const L of (M.lines || []))      rows.push([ L.id, String(L.port), (L.universe ?? ''), (L.dest ?? ''), '' ]);
  for (const V of (M.veamLines || []))  rows.push([ V.id, String(V.port), (V.universe ?? ''), (V.dest ?? ''), '' ]);
  for (const D of (M.dmxLoose || []))   rows.push([ '', '', (D.universe ?? ''), (D.dest ?? ''), '', (D.dimcity ?? '') ]);

  const lkAssign = {};
  const lkBlockType = {};
  for (const [id, rec] of (M.byLK || new Map()).entries()){
    lkAssign[id]    = { 1: rec.veam?.[1] ?? null, 2: rec.veam?.[2] ?? null, 3: rec.veam?.[3] ?? null };
    lkBlockType[id] = { mode: rec.blockType?.mode || 'Auto', value: rec.blockType?.value || 'MIXED' };
  }
  return {
    fileVersion: 2,
    rows,
    csvSources: Array.isArray(M.csvSources) ? M.csvSources : [],
    lkAssign,
    lkBlockType,
    dimFromManual: [...(M.dimFromManual || new Set())],
    projectMeta: M.projectMeta || null,
    dimColors: M.dimColors && typeof M.dimColors === 'object' ? M.dimColors : {},
    networkDevices: normalizeNetworkDevices(M.networkDevices)
  };
}

// ---- 4) APPLY: blocktype eerst, dan veam, dan fix op Auto→Manual bij koppelingen ----
async function applySnapshot(snap){
  // rows bepalen (v1 of legacy)
  let rows = [];
  if (Array.isArray(snap.csvSources) && snap.csvSources.length) {
    rows = [];
    for (const src of snap.csvSources){
      for (const r of (src.rows || [])){
        const row = Array.isArray(r) ? r.slice() : [];
        row[6] = src.id;
        row[7] = src.name || src.path || 'CSV';
        rows.push(row);
      }
    }
  } else if (Array.isArray(snap.rows)) {
    rows = snap.rows;
  } else if (Array.isArray(snap.csvRows)) {
    rows = snap.csvRows.map(([id,port,uni,dest])=>[id||'', String(port||''), String(uni||''), dest||'', '']);
    if (Array.isArray(snap.dmxLoose)) {
      for (const D of snap.dmxLoose){
        rows.push(['','', String(D.universe??''), String(D.dest??''), '', String(D.dimcity??'')]);
      }
    }
  } else {
    alert('Unknown project format.');
    return;
  }

  // 1) basismodel
  await window.LKApp.processRows(rows);

  // 2) settings terugzetten (eerst blocktype)
  const M = window.LKApp.getMODEL();
  M.csvSources = Array.isArray(snap.csvSources) ? snap.csvSources : [];
  M.projectMeta = snap.projectMeta || M.projectMeta || null;
  M.dimColors = snap.dimColors && typeof snap.dimColors === 'object' ? snap.dimColors : (M.dimColors || {});
  M.networkDevices = normalizeNetworkDevices(snap.networkDevices || M.networkDevices);

  if (snap.lkBlockType){
    for (const [id, bt] of Object.entries(snap.lkBlockType)){
      const rec = M.byLK.get(id); if (!rec) continue;
      rec.blockType = { mode: bt.mode || 'Auto', value: bt.value || 'MIXED' };
    }
  }
  if (snap.lkAssign){
    for (const [id, a] of Object.entries(snap.lkAssign)){
      const rec = M.byLK.get(id); if (!rec) continue;
      rec.veam = { 1: a['1'] || null, 2: a['2'] || null, 3: a['3'] || null };

      // BELANGRIJK: als er koppelingen zijn en modus is Auto, dwing Manual/MIXED af
      if ((rec.veam[1] || rec.veam[2] || rec.veam[3]) && (!rec.blockType || rec.blockType.mode === 'Auto')){
        rec.blockType = { mode:'Manual', value:'MIXED' };
      }
    }
  }

  // 3) handmatige DB’s
  M.dimFromManual = new Set(snap.dimFromManual || []);

  // 4) herberekenen + UI reset (zorgt o.a. voor VEAM_DUPLICATE)
  window.LKApp.hydrateDimOrigins?.();
  window.LKApp.recomputeVeamUseAndIssues?.();
  window.LKApp.recomputeUniverseStats?.();

  M.ui.defaultClosed = true;
  M.ui.groupOpen = new Map();
  M.selected = { kind:null, id:null };
  M.ui.rightMode = 'HOME';
  M.ui.dirty = false;
  window.LKApp.setMODEL(M);
  window.LKApp.renderAll?.();
}

// ---- 5) SAVE (met Electron óf browser fallback) ----
async function fileSaveProject(){
  const M = window.LKApp.getMODEL();
  let path = M.filePath || M.projectPath || null;

  const snap = buildSnapshot();

  // Geen bestaand pad → door naar Save As
  if (!path){
    return fileSaveProjectAs();
  }

  // Electron?
  if (window.app?.writeTextFile){
    path = ensureLkprojPath(path);
    await window.app.writeTextFile(path, JSON.stringify(snap, null, 2));
    M.filePath = path;
    M.projectPath = path;
    M.ui.dirty = false;
    window.LKApp.setMODEL(M);
    return;
  }

  // Browser fallback
  downloadJson(path || 'project.lkproj', snap);
  M.ui.dirty = false;
  window.LKApp.setMODEL(M);
}

async function fileSaveProjectAs(){
  const M = window.LKApp.getMODEL();
  const snap = buildSnapshot();

  // Electron?
  if (window.app?.showSaveDialog && window.app?.writeTextFile){
    const res = await window.app.showSaveDialog({
      title: 'Save project',
      defaultPath: ensureLkprojPath(M.filePath || 'project.lkproj'),
      filters: [{ name:'LK Project', extensions:['lkproj'] }]
    });
    if (!res || res.canceled) return;

    let path = ensureLkprojPath(res.filePath || res);
    await window.app.writeTextFile(path, JSON.stringify(snap, null, 2));
    M.filePath = path;
    M.projectPath = path;
    M.ui.dirty = false;
    window.LKApp.setMODEL(M);
    return;
  }

  // Browser fallback
  downloadJson('project.lkproj', snap);
  M.filePath = 'project.lkproj'; // nominale naam voor volgende "Save"
  M.projectPath = M.filePath;
  M.ui.dirty = false;
  window.LKApp.setMODEL(M);
}

// ---- 6) OPEN (met Electron óf browser fallback) ----
async function fileOpenProject(){
  let path, content;

  // Electron?
  if (window.app?.showOpenDialog && window.app?.readTextFile){
    const res = await window.app.showOpenDialog({
      title: 'Open project',
      properties: ['openFile'],
      filters: [
        { name:'LK Project', extensions:['lkproj'] },
        { name:'All Files', extensions:['*'] }
      ]
    });
    if (!res || res.canceled) return;
    path = (Array.isArray(res.filePaths) ? res.filePaths[0] : (res.filePath || res));
    if (!path) return;
    content = await window.app.readTextFile(path);
  } else {
    // Browser fallback
    const pick = await pickFileOnce();
    if (!pick) return;
    path = pick.path;
    content = pick.content;
  }

  const snap = JSON.parse(content);
  await applySnapshot(snap);

  // Pad bijhouden + UI schoon
  const M = window.LKApp.getMODEL();
  M.filePath = ensureLkprojPath(path);
  M.projectPath = M.filePath;
  M.ui.dirty = false;
  window.LKApp.setMODEL(M);
}

// ---- Nieuw bestand workflow ----
async function confirmSaveIfDirty(){
  const M = window.LKApp.getMODEL();
  // alleen vragen als er CSV-data ingeladen is (lines of veamLines of dmxLoose)
  const hasCsv = (M && ((M.lines && M.lines.length) || (M.veamLines && M.veamLines.length) || (M.dmxLoose && M.dmxLoose.length)));
  if (!hasCsv) return true;
  const ok = window.confirm('Your current data is not saved. Save before creating a new project? (Cancel = do not save)');
  if (!ok) return true; // user kiest niet te bewaren, proceed anyway
  // Laat de gebruiker zelf kiezen via Bestand -> Opslaan als
  return true;
}

function emptyModel(){
  const empty = {
    filePath: null,
    lines: [],
    veamLines: [],
    dmxLoose: [],
    customRows: [],
    csvSources: [],
    projectMeta: null,
    networkDevices: { prefs:{ nodeSparePorts:0, splitterSparePorts:0 }, nodeTypes:[], splitterTypes:[], nodes:[], splitters:[], dimCityPlans:{} },
    dimColors: {},
    issues: [],
    byDim: new Map(),
    byLK: new Map(),
    byVeam: new Map(),
    veamPool: new Map(),
    veamUse: new Map(),
    uniStats: new Map(),
    dimFromCSV: new Set(),
    dimFromManual: new Set(),
    edit: null,
    selected: { kind:null, id:null },
    ui: { 
      dimOpen: new Map(),
      groupOpen: new Map(),
      defaultClosed: true,
      universeOpen: new Map(),
      rightCsvOpen: true,
      customOpen: true,
      rightMode: 'HOME',
      dirty: false
    }
  };

  // Nieuw, compleet leeg MODEL
  window.LKApp.setMODEL(empty);

  // Alles opnieuw tekenen
  window.LKApp.renderAll?.();

  // Belangrijk: UI-header "Geselecteerde rijen: ..."
  // ook leeg maken, zodat het echt aanvoelt als een vers bestand
  const fi = document.getElementById('fileInfo');
  if (fi) fi.textContent = '';
}


// Toon een kleine custom modal voor project-informatie (vermijdt hergebruik van export-modal)
async function newFileWithMeta(){
  return new Promise((resolve)=>{
    // backdrop
    const bd = document.createElement('div'); bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10001';
    // modal
    const modal = document.createElement('div'); modal.style.cssText = 'width:520px;background:#121820;color:#eaf2ff;border:1px solid #1e2835;border-radius:10px;padding:14px;font:14px/1.4 system-ui;';
    modal.innerHTML = `
      <h3 style="margin-top:0;margin-bottom:10px">New project — Project information</h3>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Project</div><input id="_new_proj" type="text"></div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Area</div><input id="_new_area" type="text"></div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Location</div><input id="_new_loc" type="text"></div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Date</div><input id="_new_date" type="date"></div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:12px;"><div>Prepared by</div><input id="_new_prep" type="text"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;"><button id="_new_cancel" style="padding:6px 10px;border-radius:8px;background:#0b0f14;color:#eaf2ff;border:1px solid #2a3442">Cancel</button><button id="_new_ok" style="padding:6px 10px;border-radius:8px;background:#4ea8ff;color:#00121a;border:1px solid #4ea8ff">Create new project</button></div>
    `;
    bd.appendChild(modal); document.body.appendChild(bd);

    // Prefill from existing projectMeta if present
    try{
      const M = window.LKApp.getMODEL();
      const meta = M?.projectMeta || {};
      modal.querySelector('#_new_proj').value = meta.project || '';
      modal.querySelector('#_new_area').value = meta.area || '';
      modal.querySelector('#_new_loc').value = meta.location || '';
      modal.querySelector('#_new_date').value = meta.date || '';
      modal.querySelector('#_new_prep').value = meta.prepared || '';
    }catch(e){}

    const cleanup = ()=>{ bd.remove(); };

    modal.querySelector('#_new_cancel').addEventListener('click', ()=>{ cleanup(); resolve(false); });

    modal.querySelector('#_new_ok').addEventListener('click', ()=>{
      const meta = {
        project: modal.querySelector('#_new_proj').value.trim(),
        area: modal.querySelector('#_new_area').value.trim(),
        location: modal.querySelector('#_new_loc').value.trim(),
        date: modal.querySelector('#_new_date').value,
        prepared: modal.querySelector('#_new_prep').value.trim(),
        logo: null
      };
      cleanup();
      emptyModel();
      const M = window.LKApp.getMODEL();
      M.projectMeta = meta;
      M.ui.dirty = false;
      window.LKApp.setMODEL(M);
      resolve(true);
    });
  });
}


// Public helper: Nieuw bestand
async function createNewFile(){
  await confirmSaveIfDirty();
  const ok = await newFileWithMeta();
  return ok;
}

// ---- 7) Exporteer API voor renderer.js ----
window.ProjectIO = {
  fileOpenProject,
  fileSaveProject,
  fileSaveProjectAs,
  importCsvStart, // laat jouw bestaande wrappers staan
  exportPdf,
  createNewFile
 };

// === CSV import (wrapper naar de wizard in renderer.js) ===
async function importCsvStart(){
  // Prefer de bestaande wizard-start zodat mapping/preview blijft werken
  if (typeof window.startImportCsv === 'function'){
    await window.startImportCsv();
    return;
  }
  // Fallback (zonder wizard) – alleen als er geen startImportCsv() bestaat
  if (window.app?.openCsv){
    const res = await window.app.openCsv();
    if (!res) return;
    const parsed = window.Papa.parse(res.content.trim(), { delimiter:',', skipEmptyLines:true });
    // eenvoudige 4-koloms fallback: [id,port,uni,dest]
    const rows = (parsed.data||[]).map(r => [r[0]||'', r[1]||'', r[2]||'', r[3]||'', '']);
    await window.LKApp.processRows(rows);
    const M = window.LKApp.getMODEL(); M.ui.dirty = true; window.LKApp.setMODEL(M);
  } else {
    alert('Import CSV is niet beschikbaar (bridge mist).');
  }
}

// === PDF export (wrapper naar Electron bridge) ===
async function exportPdf(){
  if (window.app?.exportPdf){
    const out = await window.app.exportPdf('lk-veam-report.pdf');
    alert(`PDF opgeslagen: ${out}`);
  } else {
    alert('PDF export vereist Electron-bridge (window.app.exportPdf).');
  }
}

// === Exporteer ALLE vereiste API’s waar renderer.js op rekent ===
window.ProjectIO = {
  fileOpenProject,
  fileSaveProject,
  fileSaveProjectAs,
  importCsvStart,
  exportPdf,
  createNewFile
};

})();
