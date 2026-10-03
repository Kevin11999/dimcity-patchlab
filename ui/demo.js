// ui/demo.js
// The demo show: a complete, fully set-up project (three DimCities, LKs and Veams with links,
// racks and loose devices from the standard library, network plan, PDF layout) so you can see
// what PatchLab does before importing your own CSV. Open it from the welcome screen or Help menu.
const App = window.LKApp;
const M = () => App.getMODEL();
const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
const t = (en, nl) => (lang() === 'nl' ? nl : en);

// [id, port, universe, location]
const ROWS = [
  // DB01 — Mainstage: LK101 is a 12× XLR block on the front truss
  ['LK101', 1, 1, 'Truss 1 SL'], ['LK101', 2, 1, 'Truss 1 SL-C'], ['LK101', 3, 1, 'Truss 1 C'], ['LK101', 4, 1, 'Truss 1 SR-C'],
  ['LK101', 5, 2, 'Truss 1 SR'], ['LK101', 6, 2, 'Truss 1 blinders'], ['LK101', 7, 3, 'Truss 2 SL'], ['LK101', 8, 3, 'Truss 2 SR'],
  ['LK101', 9, 4, 'Truss 2 strobes'], ['LK101', 10, 4, 'Truss 2 C'],
  // LK102: XLR on ports 1–3, Veams in slot B (V101) and C (V102); V103 is a stand-alone Veam on a Veam4 socket
  ['LK102', 1, 5, 'Floor SL'], ['LK102', 2, 5, 'Floor SR'], ['LK102', 3, 6, 'Floor C'],
  ['V101', 1, 7, 'Set piece 1'], ['V101', 2, 7, 'Set piece 2'], ['V101', 3, 7, 'Set piece 3'], ['V101', 4, 8, 'Set piece 4'],
  ['V102', 1, 9, 'Upstage truss SL'], ['V102', 2, 9, 'Upstage truss C'], ['V102', 3, 9, 'Upstage truss SR'],
  ['V103', 1, 10, 'Audience blinders L'], ['V103', 2, 10, 'Audience blinders R'],
  // LK103: 3× Veam (V104, V105, V106)
  ['V104', 1, 11, 'LED wall L'], ['V104', 2, 11, 'LED wall R'], ['V104', 3, 12, 'Lasers SL'], ['V104', 4, 12, 'Lasers SR'],
  ['V105', 1, 13, 'Pyro truss'], ['V105', 2, 13, 'Pyro floor'],
  ['V106', 1, 14, 'Follow spot tower L'], ['V106', 2, 14, 'Follow spot tower R'],
  // Network cables (Cat): C101 = 4 lines, VLAN group in the third column (2 = VLAN 200, 3 = VLAN 300)
  ['C201', 1, 2, 'B-stage desk'], ['C201', 2, 2, 'B-stage media server'], ['C301', 1, 2, 'FOH console'],
  ['C101', 1, 2, 'FOH desk'], ['C101', 2, 2, 'Media server'], ['C101', 3, 3, 'Lighting console B'], ['C101', 4, 1, 'Stage manager laptop'],
  ['C102', 1, 2, 'Truss 1 node'],
  // Loose DMX in DB01
  ['', '', 15, 'Hazer SL', 'DB01'], ['', '', 15, 'Hazer SR', 'DB01'],
  // DMX lines that name the node and port they go to (DB02, node 01)
  ['', '', 40, 'Node 201.1', 'DB02'], ['', '', 41, 'Node 201.2', 'DB02'],
  // DB02 — B-stage
  ['LK201', 1, 21, 'B truss SL'], ['LK201', 2, 21, 'B truss C'], ['LK201', 3, 21, 'B truss SR'], ['LK201', 4, 22, 'B floor'],
  ['V201', 1, 23, 'B upstage L'], ['V201', 2, 23, 'B upstage R'], ['V201', 3, 24, 'B LED strip'],
  ['LK202', 1, 25, 'B tower L'], ['LK202', 2, 25, 'B tower R'], ['LK202', 5, 26, 'B blinders'], ['LK202', 6, 26, 'B strobes'],
  ['V202', 1, 27, 'B DJ booth L'], ['V202', 2, 27, 'B DJ booth R'],
  // DB03 — Delay towers / FOH
  ['LK301', 1, 31, 'Delay tower 1'], ['LK301', 2, 31, 'Delay tower 2'], ['LK301', 3, 32, 'Delay tower 3'], ['LK301', 4, 32, 'Delay tower 4'],
  ['V301', 1, 33, 'FOH truss L'], ['V301', 2, 33, 'FOH truss R'], ['V301', 3, 34, 'FOH house lights'],
  ['', '', 35, 'FOH roof wash', 'DB03']
];
const LINKS = { LK102:{ 2:'V101', 3:'V102' }, LK103:{ 1:'V104', 2:'V105', 3:'V106' }, LK201:{ 2:'V201' }, LK202:{ 3:'V202' }, LK301:{ 2:'V301' } };
const BLOCKS = { LK101:'XLR12', LK103:'VEAM_ONLY' };

async function standardLibrary(){
  try {
    if(window.app?.standardLibraryRead) return await window.app.standardLibraryRead();
    const r = await fetch('./library/standard-library.json'); return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function open({ silent=false, tutorial=false } = {}){
  if(!silent && !(await window.ProjectIO?.confirmSaveIfDirty?.())) return false;
  window.PatchLabUI?.closeWelcome?.();
  const meta = { project:'Demo Festival 2026', area:'Mainstage + B-stage', location:'Biddinghuizen', date:new Date().toISOString().slice(0, 10), prepared:'PatchLab demo', logo:null };
  window.ProjectIO.newProject(meta);
  const m = M();
  // 1. patch rows as one imported CSV file
  const rows = ROWS.map(r => [String(r[0]), r[1] === '' ? '' : String(r[1]), String(r[2]), r[3], '', r[4] || '', null, null]);
  m.csvSources = [{ id:'csv_demo', name:'Demo patch list.csv', path:'Demo patch list.csv', importedAt:new Date().toISOString(), updatedAt:new Date().toISOString(), rawRowCount:rows.length + 2, rowCount:rows.length, skipFirst:1, skipLast:1, map:{ id:0, port:1, uni:2, dest:3, truss:4 }, rows }];
  await App.rebuildFromCsvSources();
  const M2 = M();
  // 2. LK103 is a 3× Veam block without rows of its own (added by hand, like Add LK), then links and block types
  if(!M2.byLK.has('LK103')){
    M2.byLK.set('LK103', { id:'LK103', dimcity:'DB01', lines:[], names:{ '1-4':null, '5-8':null, '9-12':null }, veam:{ 1:null, 2:null, 3:null }, blockType:{ mode:'Manual', value:'VEAM_ONLY' }, manual:true });
    M2.byDim.get('DB01')?.lks.add('LK103');
  }
  for(const [lk, slots] of Object.entries(LINKS)){ const rec = M2.byLK.get(lk); if(rec) for(const [s, v] of Object.entries(slots)) rec.veam[Number(s)] = v; }
  for(const [lk, type] of Object.entries(BLOCKS)){ const rec = M2.byLK.get(lk); if(rec) rec.blockType = { mode:'Manual', value:type }; }
  M2.dimColors = { DB01:'#ff8a1f', DB02:'#4ea8ff', DB03:'#1DB954' };
  // 3. device types from the standard library (Luminex / ELC), racks and loose devices
  const std = await standardLibrary();
  M2.networkDevices = App.net.normalizeNetworkDevices(M2.networkDevices);
  const nd = M2.networkDevices;
  for(const key of ['nodeTypes', 'splitterTypes', 'switchTypes', 'panelTypes', 'rackTypes']) for(const it of (std?.[key] || [])) if(!nd[key].some(x => x.id === it.id)) nd[key].push(JSON.parse(JSON.stringify(it)));
  window.Library?.fillProject?.(M2);
  const plan = dc => App.net.getDimPlan(dc);
  plan('DB01').racks = [{ iid:'rk_demo1', rackId:'RACK:STD-DIM-LMX', name:'Dimmer rack SL' }, { iid:'rk_demo1b', rackId:'RACK:STD-NODE-LMX', name:'Node rack SR' }];
  plan('DB01').loose = [{ iid:'ls_demo1', kind:'node', typeId:'NODE:LMX-LN4', name:'Truss 2 node' }, { iid:'ls_demo2', kind:'vimSpider', nodeIid:'ls_demo1' }];
  plan('DB02').racks = [{ iid:'rk_demo2', rackId:'RACK:STD-DIM-ELC', name:'B-stage rack' }];
  plan('DB02').loose = [{ iid:'ls_demo6', kind:'node', typeId:'NODE:ELC-NGBX8', name:'B-stage truss node' }];
  plan('DB03').racks = [];
  plan('DB03').loose = [{ iid:'ls_demo3', kind:'node', typeId:'NODE:LMX-LN12', name:'FOH node' }, { iid:'ls_demo4', kind:'lkSpider', nodeIid:'ls_demo3' }, { iid:'ls_demo5', kind:'vimSpider', nodeIid:'ls_demo3' }];
  nd.prefs.nodeSparePorts = 0;
  // fibre between the stage switch and the B-stage switch, with two cable types made by hand
  const nd2 = M2.networkDevices;   // fillProject made a new object: use the current one
  nd2.cableTypes = [
    { id:'CABLE:DEMO-OC250', brand:'', name:'opticalCON DUO 4-core singlemode', medium:'smf', cores:4, connA:'opticalCON DUO', connB:'opticalCON DUO', lengthM:250, articleKey:'', color:'#22c3d6' },
    { id:'CABLE:DEMO-OC75', brand:'', name:'opticalCON DUO 4-core singlemode', medium:'smf', cores:4, connA:'opticalCON DUO', connB:'opticalCON DUO', lengthM:7.5, articleKey:'', color:'#2f5bff' },
    { id:'CABLE:DEMO-FF250', brand:'', name:'FiberFox DUO 4-core singlemode', medium:'smf', cores:4, connA:'FiberFox', connB:'FiberFox', lengthM:250, articleKey:'', color:'#ff3b30' },
    { id:'CABLE:DEMO-SFP', brand:'', name:'SFP patch LC duplex', medium:'smf', cores:2, connA:'SFP (LC)', connB:'SFP (LC)', lengthM:3, articleKey:'', color:'#f2b33d' }
  ];
  // the switches of the demo are the GigaCore 20t 3U set (opticalCON 17-18, FiberFox 19-20): they sit next to the racks, not in them
  for(const r of (nd2.rackTypes || [])){ const had = (r.items || []).filter(it => it.kind === 'switch'); if(!had.length) continue; r.items = r.items.filter(it => it.kind !== 'switch'); r.items.forEach(it => { it.u = Math.max(1, it.u - had.length); }); r.heightU = Math.max(1, r.heightU - had.length); }
  nd2.fiberStock = [{ typeId:'CABLE:DEMO-OC250', qty:6 }, { typeId:'CABLE:DEMO-OC75', qty:6 }, { typeId:'CABLE:DEMO-FF250', qty:2 }];
  nd2.fiberLinks = [];
  if(tutorial){
    // the start of the video tutorials: the patch is imported, nothing is built yet (no racks, devices, switches or fibres)
    for(const dc of ['DB01', 'DB02', 'DB03']){ const p = plan(dc); p.racks = []; p.loose = []; p.switches = []; p.nodes = []; p.splitters = []; delete p.assign; }
    M2.ui.dirty = false; M2.ui.cardCollapsed = {};
    App.setMODEL(M2);
    App.fullRebuildAndRender(); window.PatchHistory?.reset?.();
    App.navigate('HOME');
    return true;
  }
  // 4. network plan from the rack patch
  App.hydrateDimOrigins(); App.recomputeVeamUseAndIssues(); App.recomputeUniverseStats();
  for(const dc of ['DB01', 'DB02', 'DB03']) window.RackPlan?.applyToNetworkPlan?.(dc, { quiet:true });
  // 5. PDF layout
  const L = window.PdfExport.defaultLayout();
  L.style.accent = '#ff8a1f'; L.style.lineWeight = 'normal';
  L.cover.note = t('Demo show — every page of this report is built from the data in PatchLab. Change anything in the app and export again.', 'Demo-show — elke pagina van dit rapport komt uit de gegevens in PatchLab. Verander iets in de app en exporteer opnieuw.');
  const notes = L.sections.find(s => s.key === 'notes'); notes.on = true; notes.opts = { text:'Crew call 09:00 · Patch check 11:00 · Questions: {prepared}' };
  L.sections.find(s => s.key === 'universes').on = true;
  M2.pdfSettings = { ...(M2.pdfSettings || {}), layout:L, page:L.page.orientation, output:L.output };
  // 6. done: a fresh, clean project
  M2.ui.dirty = false;
  M2.ui.cardCollapsed = {};
  App.setMODEL(M2);
  // a network switch in every DimCity (nodes first, then the Cat cables), addressed with the FENT scheme
  App.addDimCity('FOH');
  const swOf = (dc, k) => ({ id:`${dc}-SW${k}`, name:`${dc} Luminex GigaCore 20t (3U set)`, typeId:'SWITCH:LMX-GC20T-3U', ip:'', subnet:'', ifaces:[] });
  for(const dc of ['DB01', 'DB02', 'DB03', 'FOH']){
    const p = plan(dc);
    p.switches = dc === 'DB01' ? [swOf(dc, 1), swOf(dc, 2), swOf(dc, 3)] : [swOf(dc, 1)];
  }
  M2.networkDevices.prefs.fent = { on:true, group:'production', scan:false, vlanMode:'luminex' };
  for(const dc of ['DB01', 'DB02', 'DB03', 'FOH']) window.FentUI?.applyDim?.(dc);
  window.NodeLink?.autoLink?.();   // “Node 201.1” / “Node 201.2” go on ports 1 and 2 of node 01 of DB02
  // fibres: the three switches of DB01 are chained with the short cable, the locations form a ring with the long one
  window.Fibers?.autoAssign?.({ topology:'ring', intraType:'CABLE:DEMO-OC75', interType:'CABLE:DEMO-OC250' });
  App.fullRebuildAndRender();
  window.PatchHistory?.reset?.();
  App.openEntity('DIM', 'DB01');
  App.ui.toast(t('Demo show opened — look around, change things, export a PDF. Nothing is saved until you choose Save.', 'Demo-show geopend — kijk rond, verander dingen, exporteer een PDF. Er wordt niets opgeslagen tot je op Opslaan klikt.'), 'info', { ms:7000 });
  return true;
}

window.Demo = { open, ROWS };
