// project-io.js
// Project save/load for DimCity PatchLab.
// Single implementation: no duplicate window.ProjectIO exports.
(function(){
  'use strict';

  const App = window.LKApp || {};

  function ensureLkprojPath(p){
    if (!p) return p;
    const low = String(p).toLowerCase();
    if (!/\.[^/\\]+$/.test(p) || !low.endsWith('.lkproj')) return p + '.lkproj';
    return p;
  }

  function deepClone(x){
    return JSON.parse(JSON.stringify(x ?? null));
  }

  function downloadJson(filename, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ensureLkprojPath(filename || 'project.lkproj');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function pickFileOnce(){
    return new Promise((resolve)=>{
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.lkproj,.json,application/json';
      inp.onchange = ()=>{
        const f = inp.files?.[0];
        if(!f){ resolve(null); return; }
        const rd = new FileReader();
        rd.onload = ()=> resolve({ path: f.name, content: rd.result });
        rd.readAsText(f);
      };
      inp.click();
    });
  }

  function normalizeNetworkDevices(net){
    const base = {
      prefs: { nodeSparePorts:0, splitterSparePorts:0, switchSparePorts:0 },
      nodeTypes: [],
      splitterTypes: [],
      switchTypes: [],
      nodes: [],
      splitters: [],
      switches: [],
      dimCityPlans: {}
    };
    if(!net || typeof net !== 'object') return base;

    const plans = (net.dimCityPlans && typeof net.dimCityPlans === 'object' && !Array.isArray(net.dimCityPlans))
      ? deepClone(net.dimCityPlans)
      : {};

    for(const plan of Object.values(plans)){
      if(!Array.isArray(plan.nodes)) plan.nodes = [];
      if(!Array.isArray(plan.splitters)) plan.splitters = [];
      if(!Array.isArray(plan.switches)) plan.switches = Array.isArray(plan.networkSwitches) ? plan.networkSwitches : [];
    }

    return {
      prefs: {
        nodeSparePorts: Number(net.prefs?.nodeSparePorts ?? 0),
        splitterSparePorts: Number(net.prefs?.splitterSparePorts ?? 0),
        switchSparePorts: Number(net.prefs?.switchSparePorts ?? 0)
      },
      nodeTypes: Array.isArray(net.nodeTypes) ? net.nodeTypes : [],
      splitterTypes: Array.isArray(net.splitterTypes) ? net.splitterTypes : [],
      switchTypes: Array.isArray(net.switchTypes) ? net.switchTypes : [],
      nodes: Array.isArray(net.nodes) ? net.nodes : [],
      splitters: Array.isArray(net.splitters) ? net.splitters : [],
      switches: Array.isArray(net.switches) ? net.switches : [],
      dimCityPlans: plans
    };
  }

  function defaultPdfSettings(existing={}){
    return {
      preset: existing.preset || 'DB_DETAILED',
      page: existing.page || 'landscape',
      incProject: existing.incProject ?? true,
      incNetwork: existing.incNetwork ?? true,
      incSwitches: existing.incSwitches ?? true,
      incSplitters: existing.incSplitters ?? true,
      incPatch: existing.incPatch ?? true,
      incWarnings: existing.incWarnings ?? true
    };
  }

  function buildRowsFromModel(M){
    const rows = [];
    for (const L of (M.lines || [])) rows.push([ L.id, String(L.port ?? ''), (L.universe ?? ''), (L.dest ?? ''), '' ]);
    for (const V of (M.veamLines || [])) rows.push([ V.id, String(V.port ?? ''), (V.universe ?? ''), (V.dest ?? ''), '' ]);
    for (const D of (M.dmxLoose || [])) rows.push([ '', '', (D.universe ?? ''), (D.dest ?? ''), '', (D.dimcity ?? '') ]);
    return rows;
  }

  function buildSnapshot(){
    const M = App.getMODEL();
    const lkAssign = {};
    const lkBlockType = {};

    for (const [id, rec] of (M.byLK || new Map()).entries()){
      lkAssign[id] = {
        1: rec.veam?.[1] ?? null,
        2: rec.veam?.[2] ?? null,
        3: rec.veam?.[3] ?? null
      };
      lkBlockType[id] = {
        mode: rec.blockType?.mode || 'Auto',
        value: rec.blockType?.value || 'MIXED'
      };
    }

    return {
      fileVersion: 3,
      app: 'DimCity PatchLab',
      savedAt: new Date().toISOString(),
      rows: buildRowsFromModel(M),
      csvSources: Array.isArray(M.csvSources) ? M.csvSources : [],
      lkAssign,
      lkBlockType,
      dimFromManual: [...(M.dimFromManual || new Set())],
      projectMeta: M.projectMeta || null,
      dimColors: M.dimColors && typeof M.dimColors === 'object' ? M.dimColors : {},
      networkDevices: normalizeNetworkDevices(M.networkDevices),
      pdfSettings: defaultPdfSettings(M.pdfSettings || {}),
      pdfTemplates: Array.isArray(M.pdfTemplates) ? M.pdfTemplates : []
    };
  }

  function rowsFromSnapshot(snap){
    if (Array.isArray(snap.csvSources) && snap.csvSources.length){
      const rows = [];
      for (const src of snap.csvSources){
        for (const r of (src.rows || [])){
          const row = Array.isArray(r) ? r.slice() : [];
          row[6] = src.id;
          row[7] = src.name || src.path || 'CSV';
          rows.push(row);
        }
      }
      return rows;
    }
    if (Array.isArray(snap.rows)) return snap.rows;
    if (Array.isArray(snap.csvRows)){
      const rows = snap.csvRows.map(([id,port,uni,dest])=>[id||'', String(port||''), String(uni||''), dest||'', '']);
      if (Array.isArray(snap.dmxLoose)){
        for (const D of snap.dmxLoose){
          rows.push(['','', String(D.universe??''), String(D.dest??''), '', String(D.dimcity??'')]);
        }
      }
      return rows;
    }
    return null;
  }

  async function applySnapshot(snap){
    const rows = rowsFromSnapshot(snap);
    if (!rows){
      alert('Unknown project format.');
      return;
    }

    await App.processRows(rows);

    const M = App.getMODEL();
    M.csvSources = Array.isArray(snap.csvSources) ? snap.csvSources : [];
    M.projectMeta = snap.projectMeta || M.projectMeta || null;
    M.dimColors = snap.dimColors && typeof snap.dimColors === 'object' ? snap.dimColors : (M.dimColors || {});
    M.networkDevices = normalizeNetworkDevices(snap.networkDevices || M.networkDevices);
    M.pdfSettings = defaultPdfSettings(snap.pdfSettings || M.pdfSettings || {});
    M.pdfTemplates = Array.isArray(snap.pdfTemplates) ? snap.pdfTemplates : [];

    if (snap.lkBlockType){
      for (const [id, bt] of Object.entries(snap.lkBlockType)){
        const rec = M.byLK.get(id);
        if (!rec) continue;
        rec.blockType = { mode: bt.mode || 'Auto', value: bt.value || 'MIXED' };
      }
    }

    if (snap.lkAssign){
      for (const [id, a] of Object.entries(snap.lkAssign)){
        const rec = M.byLK.get(id);
        if (!rec) continue;
        rec.veam = { 1: a['1'] || null, 2: a['2'] || null, 3: a['3'] || null };
        if ((rec.veam[1] || rec.veam[2] || rec.veam[3]) && (!rec.blockType || rec.blockType.mode === 'Auto')){
          rec.blockType = { mode:'Manual', value:'MIXED' };
        }
      }
    }

    M.dimFromManual = new Set(snap.dimFromManual || []);
    App.hydrateDimOrigins?.();
    App.recomputeVeamUseAndIssues?.();
    App.recomputeUniverseStats?.();

    M.ui.defaultClosed = true;
    M.ui.groupOpen = new Map();
    M.selected = { kind:null, id:null };
    M.ui.rightMode = 'HOME';
    M.ui.dirty = false;
    App.setMODEL(M);
    App.renderAll?.();
  }

  async function fileSaveProject(){
    const M = App.getMODEL();
    let path = M.filePath || M.projectPath || null;
    if (!path) return fileSaveProjectAs();

    const snap = buildSnapshot();
    if (window.app?.writeTextFile){
      path = ensureLkprojPath(path);
      await window.app.writeTextFile({ filePath:path, content:JSON.stringify(snap, null, 2) });
      M.filePath = path;
      M.projectPath = path;
      M.ui.dirty = false;
      App.setMODEL(M);
      return;
    }

    downloadJson(path || 'project.lkproj', snap);
    M.ui.dirty = false;
    App.setMODEL(M);
  }

  async function fileSaveProjectAs(){
    const M = App.getMODEL();
    const snap = buildSnapshot();

    if (window.app?.showSaveDialog && window.app?.writeTextFile){
      const res = await window.app.showSaveDialog({
        title: 'Save project',
        defaultPath: ensureLkprojPath(M.filePath || 'project.lkproj'),
        filters: [{ name:'LK Project', extensions:['lkproj'] }]
      });
      if (!res || res.canceled) return;

      const path = ensureLkprojPath(res.filePath || res);
      await window.app.writeTextFile({ filePath:path, content:JSON.stringify(snap, null, 2) });
      M.filePath = path;
      M.projectPath = path;
      M.ui.dirty = false;
      App.setMODEL(M);
      return;
    }

    downloadJson('project.lkproj', snap);
    M.filePath = 'project.lkproj';
    M.projectPath = M.filePath;
    M.ui.dirty = false;
    App.setMODEL(M);
  }

  async function fileOpenProject(){
    let path, content;

    if (window.app?.showOpenDialog && window.app?.readTextFile){
      const res = await window.app.showOpenDialog({
        title: 'Open project',
        properties: ['openFile'],
        filters: [
          { name:'LK Project', extensions:['lkproj'] },
          { name:'JSON', extensions:['json'] },
          { name:'All Files', extensions:['*'] }
        ]
      });
      if (!res || res.canceled) return;
      path = Array.isArray(res.filePaths) ? res.filePaths[0] : (res.filePath || res);
      if (!path) return;
      content = await window.app.readTextFile(path);
    } else {
      const pick = await pickFileOnce();
      if (!pick) return;
      path = pick.path;
      content = pick.content;
    }

    const snap = JSON.parse(content);
    await applySnapshot(snap);

    const M = App.getMODEL();
    M.filePath = ensureLkprojPath(path);
    M.projectPath = M.filePath;
    M.ui.dirty = false;
    App.setMODEL(M);
  }

  async function confirmSaveIfDirty(){
    const M = App.getMODEL();
    if (!M?.ui?.dirty) return true;
    return window.confirm('Current project has unsaved changes. Continue without saving?');
  }

  function emptyModel(){
    App.setMODEL({
      filePath: null,
      projectPath: null,
      projectMeta: null,
      lines: [],
      veamLines: [],
      dmxLoose: [],
      customRows: [],
      csvSources: [],
      dimColors: {},
      networkDevices: normalizeNetworkDevices(null),
      pdfSettings: defaultPdfSettings(),
      pdfTemplates: [],
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
    });
    App.renderAll?.();
    const fi = document.getElementById('fileInfo');
    if (fi) fi.textContent = '';
  }

  async function newFileWithMeta(){
    return new Promise((resolve)=>{
      const bd = document.createElement('div');
      bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10001';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:520px;background:#121820;color:#eaf2ff;border:1px solid #1e2835;border-radius:10px;padding:14px;font:14px/1.4 system-ui;';
      modal.innerHTML = `
        <h3 style="margin-top:0;margin-bottom:10px">New project — Project information</h3>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Project</div><input id="_new_proj" type="text"></div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Area</div><input id="_new_area" type="text"></div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Location</div><input id="_new_loc" type="text"></div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:8px;"><div>Date</div><input id="_new_date" type="date"></div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:12px;"><div>Prepared by</div><input id="_new_prep" type="text"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;"><button id="_new_cancel" style="padding:6px 10px;border-radius:8px;background:#0b0f14;color:#eaf2ff;border:1px solid #2a3442">Cancel</button><button id="_new_ok" style="padding:6px 10px;border-radius:8px;background:#4ea8ff;color:#00121a;border:1px solid #4ea8ff">Create new project</button></div>
      `;
      bd.appendChild(modal);
      document.body.appendChild(bd);

      const M = App.getMODEL();
      const meta = M?.projectMeta || {};
      modal.querySelector('#_new_proj').value = meta.project || '';
      modal.querySelector('#_new_area').value = meta.area || '';
      modal.querySelector('#_new_loc').value = meta.location || '';
      modal.querySelector('#_new_date').value = meta.date || '';
      modal.querySelector('#_new_prep').value = meta.prepared || '';

      const cleanup = ()=> bd.remove();
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
        const M2 = App.getMODEL();
        M2.projectMeta = meta;
        M2.ui.dirty = false;
        App.setMODEL(M2);
        resolve(true);
      });
    });
  }

  async function createNewFile(){
    const ok = await confirmSaveIfDirty();
    if (!ok) return false;
    return await newFileWithMeta();
  }

  async function importCsvStart(){
    if (typeof window.startImportCsv === 'function'){
      await window.startImportCsv();
      return;
    }
    if (window.app?.openCsv){
      const res = await window.app.openCsv();
      if (!res) return;
      const parsed = window.Papa.parse(res.content.trim(), { delimiter:',', skipEmptyLines:true });
      const rows = (parsed.data||[]).map(r => [r[0]||'', r[1]||'', r[2]||'', r[3]||'', '']);
      await App.processRows(rows);
      const M = App.getMODEL();
      M.ui.dirty = true;
      App.setMODEL(M);
    } else {
      alert('Import CSV is not available.');
    }
  }

  async function exportPdf(){
    if (window.PdfExport?.open){
      window.PdfExport.open();
      return;
    }
    if (window.app?.exportPdf){
      const out = await window.app.exportPdf('lk-veam-report.pdf');
      alert(`PDF saved: ${out}`);
    } else {
      alert('PDF export is not available.');
    }
  }

  window.ProjectIO = {
    fileOpenProject,
    fileSaveProject,
    fileSaveProjectAs,
    importCsvStart,
    exportPdf,
    createNewFile,
    buildSnapshot,
    applySnapshot
  };
})();
