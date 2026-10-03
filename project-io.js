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
      panelTypes: [],
      rackTypes: [],
      cableTypes: [],
      fiberLinks: [],
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
      panelTypes: Array.isArray(net.panelTypes) ? net.panelTypes : [],
      rackTypes: Array.isArray(net.rackTypes) ? net.rackTypes : [],
      cableTypes: Array.isArray(net.cableTypes) ? net.cableTypes : [],
      fiberLinks: Array.isArray(net.fiberLinks) ? net.fiberLinks : [],
      nodes: Array.isArray(net.nodes) ? net.nodes : [],
      splitters: Array.isArray(net.splitters) ? net.splitters : [],
      switches: Array.isArray(net.switches) ? net.switches : [],
      dimCityPlans: plans
    };
  }

  function defaultPdfSettings(existing={}){
    const e = existing && typeof existing === 'object' ? existing : {};
    return {
      ...e,
      preset: e.preset || 'DB_DETAILED',
      page: e.page || 'landscape',
      incProject: e.incProject ?? true,
      incNetwork: e.incNetwork ?? true,
      incSwitches: e.incSwitches ?? true,
      incSplitters: e.incSplitters ?? true,
      incPatch: e.incPatch ?? true,
      incWarnings: e.incWarnings ?? true
    };
  }

  // Effectieve rijen uit het model (incl. CSV-editor wijzigingen), met bron-informatie in kolom 7/8.
  function buildRowsFromModel(M){
    const rows = [];
    const src = x => [x.sourceId ?? null, x.sourceName ?? null];
    for (const L of (M.lines || [])) rows.push([ L.id, String(L.port ?? ''), (L.universe ?? ''), (L.dest ?? ''), '', '', ...src(L) ]);
    for (const V of (M.veamLines || [])) rows.push([ V.id, String(V.port ?? ''), (V.universe ?? ''), (V.dest ?? ''), '', '', ...src(V) ]);
    for (const D of (M.dmxLoose || [])) rows.push([ '', '', (D.universe ?? ''), (D.dest ?? ''), '', (D.dimcity ?? ''), ...src(D) ]);
    for (const N of (M.netLines || [])) rows.push([ N.id, String(N.port ?? ''), (N.vlan ?? ''), (N.dest ?? ''), '', '', ...src(N) ]);
    // ongeldige rijen bewaren zodat ze later hersteld kunnen worden
    for (const r of (M.invalidRows || [])) rows.push(r.slice());
    for (const r of (M.conflictRows || [])) rows.push(r.slice());
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

    const manualLKs = [...(M.byLK || new Map()).values()].filter(r => r.manual).map(r => r.id);
    const manualVeams = [...(M.byVeam || new Map()).values()].filter(r => r.manual).map(r => r.id);

    return {
      fileVersion: 4,
      app: 'DimCity PatchLab',
      savedAt: new Date().toISOString(),
      rows: buildRowsFromModel(M),
      csvSources: Array.isArray(M.csvSources) ? M.csvSources : [],
      customRows: Array.isArray(M.customRows) ? M.customRows : [],
      manualLKs,
      manualVeams,
      lkAssign,
      lkBlockType,
      dimFromManual: [...(M.dimFromManual || new Set())],
      projectMeta: M.projectMeta || null,
      dimColors: M.dimColors && typeof M.dimColors === 'object' ? M.dimColors : {},
      networkDevices: normalizeNetworkDevices(M.networkDevices),
      pdfSettings: defaultPdfSettings(M.pdfSettings || {}),
      pdfTemplates: Array.isArray(M.pdfTemplates) ? M.pdfTemplates : [],
      libraryDismissed: Array.isArray(M.libraryDismissed) ? M.libraryDismissed : [],
      flow: M.flow && typeof M.flow === 'object' ? M.flow : null,
      labels: M.labels && typeof M.labels === 'object' ? M.labels : null,
      setup: M.setup && typeof M.setup === 'object' ? M.setup : null
    };
  }

  function rowsFromSnapshot(snap){
    // Vanaf v4 zijn `rows` de effectieve rijen (CSV + editor-wijzigingen + custom); die zijn leidend.
    if (Number(snap.fileVersion) >= 4 && Array.isArray(snap.rows)) return snap.rows;
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
      notify('Unknown project format — this file was not made with PatchLab.', 'err');
      return;
    }

    // Begin met een leeg model: processRows neemt handmatige staat over uit het vorige model,
    // en dat mag niet het project zijn dat nu open staat.
    const seed = freshModel();
    seed.ui = App.getMODEL()?.ui || seed.ui;
    seed.dimFromManual = new Set(snap.dimFromManual || []);
    for (const id of (snap.manualLKs || [])){
      const bt = snap.lkBlockType?.[id];
      seed.byLK.set(id, {
        id, dimcity: App.dimCityFromId(id), lines: [], manual: true,
        names: {'1-4':null,'5-8':null,'9-12':null}, veam: {1:null,2:null,3:null},
        blockType: { mode:'Manual', value: bt?.value || 'MIXED' }
      });
    }
    for (const id of (snap.manualVeams || [])){
      seed.byVeam.set(id, { id, dimcity: App.dimCityFromId(id), lines: [], manual: true });
    }
    seed.customRows = Array.isArray(snap.customRows) ? snap.customRows : [];
    App.setMODEL(seed);

    await App.processRows(rows);

    const M = App.getMODEL();
    M.csvSources = Array.isArray(snap.csvSources) ? snap.csvSources : [];
    M.customRows = Array.isArray(snap.customRows) ? snap.customRows : [];
    M.projectMeta = snap.projectMeta || M.projectMeta || null;
    M.dimColors = snap.dimColors && typeof snap.dimColors === 'object' ? snap.dimColors : (M.dimColors || {});
    M.networkDevices = normalizeNetworkDevices(snap.networkDevices || M.networkDevices);
    M.pdfSettings = defaultPdfSettings(snap.pdfSettings || M.pdfSettings || {});
    M.pdfTemplates = Array.isArray(snap.pdfTemplates) ? snap.pdfTemplates : [];
    M.libraryDismissed = Array.isArray(snap.libraryDismissed) ? snap.libraryDismissed : [];
    M.flow = snap.flow && typeof snap.flow === 'object' ? snap.flow : null;
    M.labels = snap.labels && typeof snap.labels === 'object' ? snap.labels : null;
    M.setup = snap.setup && typeof snap.setup === 'object' ? snap.setup : null;

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

  const UI = () => App.ui || window.LKApp?.ui || {};
  const notify = (msg, kind='ok', opts) => (UI().toast ? UI().toast(msg, kind, opts) : null);
  const fileName = p => String(p || '').split(/[\\/]/).pop();
  const projectName = (M, path) => M.projectMeta?.project || fileName(path).replace(/\.lkproj$/i, '');

  async function writeProject(path, M, { quiet=false } = {}){
    const snap = buildSnapshot();
    await window.app.writeTextFile({ filePath:path, content:JSON.stringify(snap, null, 2) });
    M.filePath = path;
    M.projectPath = path;
    M.ui.dirty = false;
    App.setMODEL(M);
    await window.app.recentAdd?.(path, projectName(M, path));
    App.updateChrome?.();
    if (!quiet) notify(`Saved ${fileName(path)}`);
    window.Autosave?.onSaved?.();
    return true;
  }
  // Autosave: alleen projecten die al een bestand hebben, zonder melding
  async function saveQuietly(){
    const M = App.getMODEL();
    const path = M.filePath || M.projectPath;
    if (!path || !window.app?.writeTextFile) return false;
    return writeProject(ensureLkprojPath(path), M, { quiet:true });
  }

  async function fileSaveProject(){
    const M = App.getMODEL();
    const path = M.filePath || M.projectPath || null;
    if (!path) return fileSaveProjectAs();
    if (!window.app?.writeTextFile){
      downloadJson(path, buildSnapshot());
      M.ui.dirty = false; App.setMODEL(M);
      return true;
    }
    try { return await writeProject(ensureLkprojPath(path), M); }
    catch (err) { notify(`Could not save: ${err.message}`, 'err'); return false; }
  }

  async function fileSaveProjectAs(){
    const M = App.getMODEL();
    if (!(window.app?.showSaveDialog && window.app?.writeTextFile)){
      downloadJson(`${projectName(M, 'project') || 'project'}.lkproj`, buildSnapshot());
      M.ui.dirty = false; App.setMODEL(M);
      return true;
    }
    const suggested = M.filePath || `${(M.projectMeta?.project || 'Untitled project').replace(/[\\/:*?"<>|]+/g, '_')}.lkproj`;
    const res = await window.app.showSaveDialog({
      title: 'Save Project',
      defaultPath: ensureLkprojPath(suggested),
      filters: [{ name:'PatchLab Project', extensions:['lkproj'] }]
    });
    if (!res || res.canceled || !res.filePath) return false;
    try { return await writeProject(ensureLkprojPath(res.filePath), M); }
    catch (err) { notify(`Could not save: ${err.message}`, 'err'); return false; }
  }

  // Laadt een projectbestand vanaf een pad (Open-dialoog, recente bestanden, welkomstscherm).
  async function openProjectPath(path, { skipDirtyCheck=false } = {}){
    if (!path) return false;
    if (!skipDirtyCheck && !(await confirmSaveIfDirty())) return false;
    let content;
    try {
      content = await window.app.readTextFile(path);
    } catch (err) {
      notify(`Could not open ${fileName(path)} — the file was moved or deleted.`, 'err');
      await window.app.recentRemove?.(path);
      return false;
    }
    return loadProjectContent(path, content);
  }

  async function loadProjectContent(path, content){
    let snap;
    try {
      snap = JSON.parse(content);
    } catch (err) {
      await UI().confirmDialog?.({ title:'Could not open project', message:`${fileName(path)} is not a valid PatchLab project file.\n\n${err.message}`, okLabel:'OK', cancelLabel:'Close' });
      return false;
    }
    await applySnapshot(snap);
    const M = App.getMODEL();
    M.filePath = ensureLkprojPath(path);
    M.projectPath = M.filePath;
    M.ui.dirty = false;
    App.setMODEL(M);
    await window.app?.recentAdd?.(M.filePath, projectName(M, path));
    App.navigate?.('HOME');
    notify(`Opened ${fileName(path)}`);
    // Devices/racks/templates uit de show die nog niet in de eigen bibliotheek staan aanbieden
    await window.Library?.reviewProject?.(M);
    window.PatchHistory?.reset?.();
    return true;
  }

  async function fileOpenProject(){
    if (!(await confirmSaveIfDirty())) return false;
    if (window.app?.showOpenDialog && window.app?.readTextFile){
      const res = await window.app.showOpenDialog({
        title: 'Open Project',
        properties: ['openFile'],
        filters: [
          { name:'PatchLab Project', extensions:['lkproj'] },
          { name:'JSON', extensions:['json'] },
          { name:'All Files', extensions:['*'] }
        ]
      });
      if (!res || res.canceled) return false;
      const path = Array.isArray(res.filePaths) ? res.filePaths[0] : (res.filePath || res);
      return openProjectPath(path, { skipDirtyCheck:true });
    }
    const pick = await pickFileOnce();
    if (!pick) return false;
    return loadProjectContent(pick.path, pick.content);
  }

  // true = doorgaan (opgeslagen of bewust weggegooid), false = annuleren
  function confirmSaveIfDirty(){
    const M = App.getMODEL();
    if (!M?.ui?.dirty) return Promise.resolve(true);
    const openDialog = UI().openDialog;
    if (!openDialog) return Promise.resolve(window.confirm('This project has unsaved changes. Continue without saving?'));
    return new Promise(resolve=>{
      let done = false;
      const name = projectName(M, M.filePath || '') || 'this project';
      const d = openDialog({
        title: 'Save changes?',
        width: '460px',
        body: `<p style="margin:0;color:var(--text-2);line-height:1.55">Do you want to save the changes to <b style="color:var(--text)">${String(name).replace(/[&<>"]/g,'')}</b>? Your changes will be lost if you don't save them.</p>`,
        footer: `<button data-a="discard" style="margin-right:auto">Don't Save</button><button data-a="cancel">Cancel</button><button data-a="save" class="primary">Save</button>`,
        onClose: ()=>{ if(!done) resolve(false); }
      });
      const finish = v => { done = true; d.close(); resolve(v); };
      d.footer.querySelector('[data-a=discard]').onclick = ()=> finish(true);
      d.footer.querySelector('[data-a=cancel]').onclick = ()=> finish(false);
      d.footer.querySelector('[data-a=save]').onclick = async ()=>{ done = true; d.close(); resolve(!!(await fileSaveProject())); };
    });
  }

  function freshModel(){
    return {
      filePath: null,
      projectPath: null,
      projectMeta: null,
      lines: [],
      veamLines: [],
      dmxLoose: [],
      netLines: [],
      customRows: [],
      csvSources: [],
      dimColors: {},
      networkDevices: normalizeNetworkDevices(null),
      pdfSettings: defaultPdfSettings(),
      pdfTemplates: [],
      libraryDismissed: [],
      flow: null,
      labels: null,
      setup: null,
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
  }

  function emptyModel(){
    const M = freshModel();
    window.Library?.fillProject?.(M);   // nieuw project start met alle devices uit de bibliotheek
    App.setMODEL(M);
    App.renderAll?.();
    const fi = document.getElementById('fileInfo');
    if (fi) fi.textContent = '';
  }

  // Nieuw leeg project met projectinformatie (welkomstscherm / File → New Project)
  function newProject(meta){
    emptyModel();
    const M = App.getMODEL();
    M.projectMeta = { project:'', area:'', location:'', date:'', prepared:'', logo:null, ...(meta || {}) };
    M.ui.dirty = false;
    M.ui.view = 'HOME';
    App.setMODEL(M);
    App.renderAll?.();
    window.PatchHistory?.reset?.();
  }

  async function createNewFile(){
    if (!(await confirmSaveIfDirty())) return false;
    if (window.PatchLabUI?.newProject) { await window.PatchLabUI.newProject({ skipDirtyCheck:true }); return true; }
    newProject({});
    return true;
  }

  async function importCsvStart(){
    if (typeof window.startImportCsv === 'function'){
      await window.startImportCsv();
      return;
    }
    notify('CSV import is not available.', 'err');
  }

  async function exportPdf(){
    window.PdfExport?.open?.();
  }

  window.ProjectIO = {
    fileOpenProject,
    fileSaveProject,
    fileSaveProjectAs,
    openProjectPath,
    confirmSaveIfDirty,
    importCsvStart,
    exportPdf,
    createNewFile,
    newProject,
    buildSnapshot,
    applySnapshot,
    saveQuietly,
    projectName: () => projectName(App.getMODEL(), App.getMODEL().filePath)
  };
})();
