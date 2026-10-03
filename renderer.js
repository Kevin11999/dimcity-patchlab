// ===== Helpers =====
const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const n=document.createElement(t); if(c) n.className=c; if(h!=null) n.innerHTML=h; return n;};

// Experimentele UI
const EXP = Object.freeze({
  rightPaneCsv: true,   // rechterpaneel: Total Import CSV + Edit-knop
  rightPaneCustom: false
});



// ===== Domein =====
function dimCityFromId(id){
  const m = id?.match(/^(?:LK|VEAM12|V)(\d+)$/i);
  if(!m) return null;
  const n = parseInt(m[1],10);
  return 'DB' + String(Math.floor(n/100)).padStart(2,'0'); // DB in hoofdletters
}
function isLK(id){ return /^LK\d+$/i.test(id) || /^VEAM12\d+$/i.test(id); }
function normLK(id){ return id?.replace(/^VEAM12/i,'LK'); }
function isV(id){ return /^V\d+$/i.test(id); }
function portRangeOk(id, port){ if(isV(id)) return port>=1 && port<=4; if(isLK(id)) return port>=1 && port<=12; return false; }
function statusColor(u, pos){ if(u!=null && pos) return 'GREEN'; if((u!=null && !pos) || (u==null && pos)) return 'YELLOW'; return 'YELLOW'; }

function statusLabel(st){
  if(st==='GREEN') return 'OK';
  if(st==='YELLOW') return 'Incomplete';
  if(st==='RED') return 'Error';
  return st || '—';
}
function statusDot(st){
  const safe = st || 'YELLOW';
  return `<span class="status-dot ${safe}" title="${statusLabel(safe)}"></span><span class="status-text">${statusLabel(safe)}</span>`;
}
function issueLabel(st){
  if(st==='RED') return 'Error';
  if(st==='YELLOW') return 'Warning';
  if(st==='GREEN') return 'Good';
  return st || 'Info';
}
function shortFileName(path){
  const s = (path || '').toString();
  return s.split(/[\\/]/).pop() || s || 'CSV file';
}

const DEFAULT_DIM_COLORS = ['#4ea8ff','#42A5F5','#21d4fd','#54a0ff','#5f8cff','#7b61ff','#1DB954','#FFC107','#9b5cff','#f368e0','#10ac84','#ee5253'];
function safeHex(c, fallback='#4ea8ff'){
  const v = String(c || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}
function ensureDimColors(){
  if(!MODEL || typeof MODEL !== 'object') return {};
  if(!MODEL.dimColors || typeof MODEL.dimColors !== 'object' || Array.isArray(MODEL.dimColors)) MODEL.dimColors = {};
  const dims = [...(MODEL.byDim?.keys?.() || [])].sort((a,b)=>a.localeCompare(b));
  dims.forEach((dc, idx)=>{
    if(!MODEL.dimColors[dc]) MODEL.dimColors[dc] = DEFAULT_DIM_COLORS[idx % DEFAULT_DIM_COLORS.length];
  });
  return MODEL.dimColors;
}
function dimColor(dc){
  ensureDimColors();
  const dims = [...(MODEL.byDim?.keys?.() || [])].sort((a,b)=>a.localeCompare(b));
  const idx = Math.max(0, dims.indexOf(dc));
  return safeHex(MODEL.dimColors?.[dc], DEFAULT_DIM_COLORS[idx % DEFAULT_DIM_COLORS.length]);
}
function colorSwatchesHtml(active){
  return DEFAULT_DIM_COLORS.map(c=>`<button class="color-swatch ${safeHex(active)===c?'active':''}" style="background:${c}" data-color="${c}" title="${c}"></button>`).join('') + `<input id="dimCustomColor" type="color" value="${safeHex(active)}" title="Custom color">`;
}
function esc(s){
  return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}

function makeId(prefix='csv'){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
}
function nowIso(){ return new Date().toISOString(); }
function looksLikeImportRow(r){
  if(!Array.isArray(r)) return false;
  const id = (r[WIZ.map?.id ?? 0] ?? r[0] ?? '').toString().trim().toUpperCase();
  const port = (r[WIZ.map?.port ?? 1] ?? r[1] ?? '').toString().trim();
  const uni = (r[WIZ.map?.uni ?? 2] ?? r[2] ?? '').toString().trim();
  const dest = (r[WIZ.map?.dest ?? 3] ?? r[3] ?? '').toString().trim();
  const idOk = /^(LK|VEAM12|V)\d+$/i.test(id);
  const portOk = /^\d+$/.test(port);
  const uniOk = uni==='' || /^\d+$/.test(uni);
  return idOk && portOk && uniOk && dest !== '';
}
function autoDetectSkip(rawRows){
  const rows = rawRows || [];
  let first = rows.findIndex(looksLikeImportRow);
  if(first < 0) first = 0;
  let last = -1;
  for(let i=rows.length-1;i>=0;i--){
    if(looksLikeImportRow(rows[i])) { last = i; break; }
  }
  if(last < 0) last = rows.length - 1;
  return { skipFirst:first, skipLast:Math.max(0, rows.length - 1 - last) };
}
function rowsFromCsvSources(){
  const out = [];
  for(const src of (MODEL.csvSources || [])){
    for(const r of (src.rows || [])){
      const row = Array.isArray(r) ? r.slice() : [];
      row[6] = src.id;
      row[7] = src.name || shortFileName(src.path);
      out.push(row);
    }
  }
  return out.concat(rowsFromCustomRows(MODEL.customRows));
}
// Custom-rijen uit de CSV-editor in processRows-vorm: [id, port, uni, dest, '', dimcity, sourceId, sourceName]
function rowsFromCustomRows(customRows){
  return (customRows || []).map(r => [
    r.kind === 'DMX' ? '' : (r.id || ''),
    r.kind === 'DMX' || r.port == null ? '' : String(r.port),
    r.universe == null ? '' : String(r.universe),
    r.dest || '',
    '',
    r.kind === 'DMX' ? (r.dimcity || '') : '',
    null,
    'Custom'
  ]);
}
// Effectieve rijen uit het model (incl. bewerkingen en ongeldige rijen), in processRows-vorm
function currentRows(M = MODEL){
  const rows = [];
  const src = x => [x.sourceId ?? null, x.sourceName ?? null];
  for (const L of (M.lines || [])) rows.push([ L.id, String(L.port ?? ''), (L.universe ?? ''), (L.dest ?? ''), '', '', ...src(L) ]);
  for (const V of (M.veamLines || [])) rows.push([ V.id, String(V.port ?? ''), (V.universe ?? ''), (V.dest ?? ''), '', '', ...src(V) ]);
  for (const D of (M.dmxLoose || [])) rows.push([ '', '', (D.universe ?? ''), (D.dest ?? ''), '', (D.dimcity ?? ''), ...src(D) ]);
  for (const N of (M.netLines || [])) rows.push([ N.id, String(N.port ?? ''), (N.vlan ?? ''), (N.dest ?? ''), '', '', ...src(N) ]);
  for (const r of (M.invalidRows || [])) rows.push(r.slice());
  for (const r of (M.conflictRows || [])) rows.push(r.slice());
  return rows;
}
async function rebuildFromCsvSources(){
  await processRows(rowsFromCsvSources());
}

// Bloktype helpers
function blockTypeLabel(t){
  if(t==='MIXED')     return '4× XLR + 3× Veam';
  if(t==='VEAM_ONLY') return '3× Veam';
  if(t==='XLR12')     return '12× XLR';
  return t || '—';
}
function autoBlockType(lk){
  // meer dan 4 gebruikte poorten => 12X XLR
  let used = 0;
  for(const L of lk.lines){
    if (L && (L.universe!=null || (L.dest && L.dest!==''))) used++;
  }
  return used > 4 ? 'XLR12' : 'MIXED';
}
function effectiveBlockType(lk){
  return lk?.blockType?.mode==='Manual' ? lk.blockType.value : autoBlockType(lk);
}

// ——— Herkomstsets robuust opbouwen uit huidige MODEL ———
function hydrateDimOrigins(){
  // Zorg dat beide sets bestaan en écht Set-instanties zijn
  if (!(MODEL.dimFromManual instanceof Set)) {
    MODEL.dimFromManual = new Set(MODEL.dimFromManual ? [...MODEL.dimFromManual] : []);
  }
  if (!(MODEL.dimFromCSV instanceof Set)) {
    MODEL.dimFromCSV = new Set(MODEL.dimFromCSV ? [...MODEL.dimFromCSV] : []);
  }

  // Alle bekende DimCities uit het model
  const allDims = new Set(MODEL.byDim ? [...MODEL.byDim.keys()] : []);

  // Alles wat handmatig is, blijft expliciet gemarkeerd
  for (const dc of MODEL.dimFromManual) allDims.add(dc);

  // CSV = alles wat níet handmatig is
  const rebuiltCSV = new Set();
  for (const dc of allDims) {
    if (!MODEL.dimFromManual.has(dc)) rebuiltCSV.add(dc);
  }
  MODEL.dimFromCSV = rebuiltCSV;
}



function lkAutoLocation(lk){
  const labels = lk.lines.map(x=>x.dest).filter(Boolean);
  if(!labels.length) return null;
  const counts = Object.create(null);
  for(const a of labels) counts[a] = (counts[a]||0)+1;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}

function veamAutoLocation(ve){
  if(!ve || !ve.lines) return null;
  const labels = ve.lines.map(x=>x.dest).filter(Boolean);
  if(!labels.length) return null;
  const counts = Object.create(null);
  for (const a of labels) counts[a] = (counts[a] || 0) + 1;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}


// ===== Universe stats =====
function recomputeUniverseStats(){
  const uniStats = new Map(); // dc -> { counts: Map(uni->{lk,veam,dmx}), totalPorts, totalUniq }
  const bump = (dc, uni, kind) => {
    if(uni==null || uni==='') return;
    if(!uniStats.has(dc)) uniStats.set(dc, { counts:new Map(), totalPorts:0, totalUniq:0 });
    const s = uniStats.get(dc);
    if(!s.counts.has(uni)) s.counts.set(uni, { lk:0, veam:0, dmx:0 });
    s.counts.get(uni)[kind] += 1;
    s.totalPorts += 1;
  };

  for(const [,lk] of MODEL.byLK){
    const dc = lk.dimcity;
    for(const L of lk.lines){
      if(L && (L.universe!=null && L.universe!=='')) bump(dc, String(L.universe), 'lk');
    }
  }
  for(const [,ve] of MODEL.byVeam){
    const dc = ve.dimcity;
    for(const R of ve.lines){
      if(R && (R.universe!=null && R.universe!=='')) bump(dc, String(R.universe), 'veam');
    }
  }
  // ← nieuwe bron: losse DMX-kabels
  for(const D of (MODEL.dmxLoose || [])){
    if(!D) continue;
    const { dimcity:dc, universe:u } = D;
    if(dc && u!=null && u!=='') bump(dc, String(u), 'dmx');
  }

  for(const [,s] of uniStats){
    s.totalUniq = s.counts.size;
  }
  MODEL.uniStats = uniStats;
}



let MODEL = {
  filePath: null,
  projectPath: null,
  projectMeta: null,
  lines: [],            // LK-lijnen (deduped)
  veamLines: [],        // Veam-lijnen (deduped)
  dmxLoose: [],         // ← losse DMX-lijnen [{universe, dest, dimcity, source}]
  netLines: [],         // ← netwerkkabels C101.1 … [{id, port, vlan, dest, dimcity, source}]
  customRows: [],       // ← bewaarde Custom-rijen voor edit-ronde
  csvSources: [],       // imported CSV source files [{id,name,path,rows,importedAt,updatedAt}]
  dimColors: {},        // DimCity accent colors { DB01:'#4ea8ff' }
  networkDevices: {     // reusable device type libraries + future placed devices
    prefs: { nodeSparePorts: 0, splitterSparePorts: 0 },
    nodeTypes: [],
    splitterTypes: [],
    nodes: [],
    splitters: [],
    dimCityPlans: {}
  },

  issues: [],
  byDim: new Map(),
  byLK: new Map(),
  byVeam: new Map(),
  veamPool: new Map(),
  veamUse: new Map(),
  uniStats: new Map(),

  // herkomstregistratie
  dimFromCSV: new Set(),
  dimFromManual: new Set(),

  // editor state
  edit: null,           // ← { rowsCsv:[], rowsCustom:[], origCsv:[], dirty:boolean }

  selected: { kind:null, id:null },
  ui: { 
    dimOpen: new Map(), 
    groupOpen: new Map(), 
    defaultClosed: true,
    universeOpen: new Map(),
    // editor UI toggles
    rightCsvOpen: true,
    customOpen: true,
      rightMode: 'HOME',   // 'HOME' | 'DETAIL' | 'CSV_EDIT'
      dirty: false
  }
};




// ===== Wizard state =====
let WIZ = {
  rawRows: [],
  skipFirst: 0,
  skipLast: 0,
  map: { id:0, port:1, uni:2, dest:3, truss:4 },
  useTruss: false,
  path: null,
  sourceName: null,
  replaceSourceId: null
};

function openWizard(){ $('#backdrop').style.display='flex'; }
function closeWizard(){ $('#backdrop').style.display='none'; }

$('#sfMinus').onclick = ()=>{ if(WIZ.skipFirst>0){ WIZ.skipFirst--; renderWizard(); } };
$('#sfPlus').onclick  = ()=>{ if(WIZ.skipFirst < Math.max(0, WIZ.rawRows.length - WIZ.skipLast - 1)){ WIZ.skipFirst++; renderWizard(); } };
$('#slMinus').onclick = ()=>{ if(WIZ.skipLast>0){ WIZ.skipLast--; renderWizard(); } };
$('#slPlus').onclick  = ()=>{ if(WIZ.skipLast < Math.max(0, WIZ.rawRows.length - WIZ.skipFirst - 1)){ WIZ.skipLast++; renderWizard(); } };

$('#wizCancel').onclick = ()=> closeWizard();
$('#wizImport').onclick = ()=> importSelected();


['mapId','mapPort','mapUni','mapDest'].forEach(id=>{
  const node = document.getElementById(id);
  if (!node) return;
  node.addEventListener('change', (e)=>{
    const val = parseInt(e.target.value,10);
    if(id==='mapId')   WIZ.map.id   = val;
    if(id==='mapPort') WIZ.map.port = val;
    if(id==='mapUni')  WIZ.map.uni  = val;
    if(id==='mapDest') WIZ.map.dest = val;
    renderWizard();
  });
});
{
  const useTrussEl = document.getElementById('useTruss');
  if (useTrussEl){
    useTrussEl.addEventListener('change', (e)=>{
      WIZ.useTruss = e.target.checked;
      const mapTrussSel = document.getElementById('mapTruss');
      if (mapTrussSel) mapTrussSel.disabled = !WIZ.useTruss;
      renderWizard();
    });
  }
}

function fillMappingSelect(sel, label, selectedIndex){
  sel.innerHTML = '';
  for(let i=0;i<5;i++){
    const opt = el('option', null, `Column ${i+1}`);
    opt.value = i; if(i===selectedIndex) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderWizard(){
  $('#skipFirst').value = WIZ.skipFirst;
  $('#skipLast').value  = WIZ.skipLast;
{
  const useTrussEl = document.getElementById('useTruss');
  if (useTrussEl) useTrussEl.checked = WIZ.useTruss;

  const mapTrussSel = document.getElementById('mapTruss');
  if (mapTrussSel){
    mapTrussSel.disabled = !WIZ.useTruss;
    fillMappingSelect(mapTrussSel,'', WIZ.map.truss);
  }
}

fillMappingSelect(document.getElementById('mapId'),   'LK / Veam',     WIZ.map.id);
fillMappingSelect(document.getElementById('mapPort'), 'LK/Veam.POINT', WIZ.map.port);
fillMappingSelect(document.getElementById('mapUni'),  'UNIVERSE',      WIZ.map.uni);
fillMappingSelect(document.getElementById('mapDest'), 'POSITION',      WIZ.map.dest);
// mapTruss alleen als het element bestaat (zie stap 3)


  const total = WIZ.rawRows.length;
  const start = WIZ.skipFirst;
  const end   = total - WIZ.skipLast - 1;
  const include = (idx)=> idx>=start && idx<=end;
  $('#wizCount').textContent = `${Math.max(0, end-start+1)} of ${total} rows selected`;

  const tb = $('#wizRows'); tb.innerHTML='';
  // preview zonder limiet
  for(let i=0;i<WIZ.rawRows.length;i++){
    const r = WIZ.rawRows[i];
    const tr = el('tr', include(i) ? '' : 'excluded');
    tr.appendChild(el('td','idx', i.toString()));
    for(let j=0;j<5;j++) tr.appendChild(el('td', null, (r[j]??'').toString()));
    tb.appendChild(tr);
  }
}

async function importSelected(){
  const total = WIZ.rawRows.length;
  const start = WIZ.skipFirst;
  const end   = total - WIZ.skipLast - 1;
  const rows = [];
  for(let i=start;i<=end;i++){
    const r = WIZ.rawRows[i]; 
    if(!r) continue;

    const id   = (r[WIZ.map.id]   ?? '').toString().trim();
    const port = (r[WIZ.map.port] ?? '').toString().trim();
    const uni  = (r[WIZ.map.uni]  ?? '').toString().trim();
    const pos  = (r[WIZ.map.dest] ?? '').toString();

    // rijvorm blijft compatibel met processRows
    rows.push([id, port, uni, pos, '', '', null, null]);
  }

  const currentSources = Array.isArray(MODEL.csvSources) ? MODEL.csvSources.slice() : [];
  const sourceId = WIZ.replaceSourceId || makeId('csv');
  const sourceName = WIZ.sourceName || shortFileName(WIZ.path);
  const source = {
    id: sourceId,
    name: sourceName,
    path: WIZ.path || sourceName,
    importedAt: WIZ.replaceSourceId
      ? (currentSources.find(s=>s.id===WIZ.replaceSourceId)?.importedAt || nowIso())
      : nowIso(),
    updatedAt: nowIso(),
    rawRowCount: total,
    rowCount: rows.length,
    skipFirst: WIZ.skipFirst,
    skipLast: WIZ.skipLast,
    map: {...WIZ.map},
    rows
  };

  if(WIZ.replaceSourceId){
    const idx = currentSources.findIndex(s=>s.id===WIZ.replaceSourceId);
    if(idx >= 0) currentSources[idx] = source;
    else currentSources.push(source);
  } else {
    currentSources.push(source);
  }

  MODEL.csvSources = currentSources;
  closeWizard();
  await rebuildFromCsvSources();
  MODEL.ui.dirty = true;
  MODEL.ui.view = 'HOME';
  renderAll();
  const errs = MODEL.issues.filter(i=>i.severity==='RED').length;
  toast(`Imported ${rows.length} rows from ${sourceName}${errs ? ` — ${errs} error${errs===1?'':'s'} found` : ''}`, errs ? 'err' : 'ok',
        errs ? { action:{ label:'Show', run:()=>navigate('ISSUES') } } : { action:{ label:'Setup', run:()=>window.Setup?.open?.() }, ms:7000 });
}


// Publieke starter voor de CSV-wizard (ProjectIO gebruikt deze)
window.startImportCsv = async function(options={}){
  const res = await window.app?.openCsv?.();
  if(!res) return;
  const parsed = window.Papa.parse(res.content.trim(), { delimiter:',', skipEmptyLines:true });
  WIZ.rawRows = parsed.data;
  WIZ.map = { id:0, port:1, uni:2, dest:3, truss:4 };
  WIZ.useTruss = false;
  WIZ.path = res.path;
  WIZ.sourceName = options.sourceName || shortFileName(res.path);
  WIZ.replaceSourceId = options.replaceSourceId || null;

  const auto = autoDetectSkip(WIZ.rawRows);
  WIZ.skipFirst = auto.skipFirst;
  WIZ.skipLast = auto.skipLast;

  $('#wizPath').textContent = `${WIZ.replaceSourceId ? 'Replace: ' : ''}${WIZ.sourceName}`;
  openWizard(); renderWizard();
};


// ===== Verwerking =====
async function processRows(rows){

  const lkLines = [];
  const veLines = [];
  const dmxLoose = [];                 // << NIEUW
  const netRaw = [];                   // netwerkkabels (Cat): C101 + poort 1-4, kolom 3 = VLAN-groep
  const issues = [];
  const veamPool = new Map();
  // Ongeldige rijen bewaren (niet weggooien), zodat ze vanuit Validation hersteld kunnen worden
  const invalidRows = [];
  const keepInvalid = (r, issue) => {
    invalidRows.push(Array.isArray(r) ? r.slice() : []);
    issue.fix = { type:'row', index:invalidRows.length - 1 };
    issues.push(issue);
  };

  for (const r of rows){
    if (r.length < 4){ 
      keepInvalid(r, {severity:'RED', code:'CSV_MIN_FIELDS', message:`Too few fields: ${r.join(',')}`});
      continue;
    }

    // Ondersteun 5 of 6 velden:
    // [0]=id, [1]=port, [2]=uni, [3]=position, [4]=(legacy truss/unused), [5]=dimcity (alleen bij DMX)
    const id        = (r[0] ?? '').toString().trim();
    const portS     = (r[1] ?? '').toString().trim();
    const uniS      = (r[2] ?? '').toString().trim();
    const position  = (r[3] ?? '').toString();
    const maybeDim  = (r[5] ?? '').toString().trim().toUpperCase(); // 6e veld voor DMX
    const sourceId   = (r[6] ?? '').toString().trim() || null;
    const sourceName = (r[7] ?? '').toString().trim() || 'CSV';
    const port      = portS==='' ? NaN : parseInt(portS,10);
    const universe  = (uniS===''||uniS==null) ? null : parseInt(uniS,10);

    // --- DMX zonder ID ---
    if (!id){
      const dimcity = maybeDim || null;
      if (!dimcity){
        keepInvalid(r, {severity:'RED', code:'DMX_DIMCITY_REQ', message:`Loose DMX line${position ? ` “${position}”` : ''} has no DimCity`});
        continue;
      }
      dmxLoose.push({
        id: null,
        universe,
        dest: position || '',
        dimcity,
        status: statusColor(universe, position),
        source: sourceName,
        sourceId,
        sourceName
      });
      continue;
    }

    // --- Netwerkkabel: C101 (poort in kolom 2) of C101.1 (poort achter de punt); C = Cat, 4 lijnen per kabel ---
    const cm = id.match(/^C(\d+)(?:\.(\d+))?$/i);
    if(cm){
      const cid = `C${cm[1]}`, cdim = dimCityFromId(`V${cm[1]}`), cport = cm[2] != null ? parseInt(cm[2], 10) : port;
      if(!cdim || !Number.isFinite(cport) || cport < 1 || cport > 4){
        keepInvalid(r, {severity:'RED', code:'PORT_RANGE', dimcity:cdim, port:cport, message:`${id}${cm[2] == null ? ` port ${Number.isFinite(port) ? port : `“${portS}”`}` : ''} does not exist — a network cable (C) has lines 1–4`});
        continue;
      }
      const vlan = window.Fent ? window.Fent.vlanFromColumn(universe) : universe;
      netRaw.push({ id:cid, port:cport, vlan, dest:position || '', dimcity:cdim, status: position ? 'GREEN' : 'YELLOW', source:sourceName, sourceId, sourceName });
      continue;
    }

    // --- LK/VEAM met ID ---
    const dimcity = dimCityFromId(id);
    if(!dimcity) { keepInvalid(r, {severity:'RED', code:'ID_PATTERN', message:`Unknown ID "${id}" — expected LK###, VEAM12### or V###`}); continue; }
    if(!portRangeOk(id, port)){
      const max = isV(id) ? 4 : 12;
      keepInvalid(r, {severity:'RED', code:'PORT_RANGE', dimcity, port, ref: isV(id) ? {kind:'VEAM', id} : {kind:'LK', id:normLK(id)},
        message:`${id} port ${Number.isFinite(port) ? port : `“${portS}”`} does not exist — a ${isV(id) ? 'Veam' : 'LK'} has ports 1–${max}${universe != null ? ` (universe ${universe}${position ? `, ${position}` : ''})` : ''}`});
      continue;
    }

    const rec = {
      id,
      port,
      universe,
      dest: position || '',
      dimcity,
      status: statusColor(universe, position),
      source: sourceName,
      sourceId,
      sourceName
    };

    if(isV(id)){
      if(!veamPool.has(dimcity)) veamPool.set(dimcity, new Set());
      veamPool.get(dimcity).add(id);
      veLines.push(rec);
    } else {
      lkLines.push(rec);
    }
  }

  // Rijen die botsen (zelfde poort, andere universe) bewaren tot de gebruiker kiest
  const conflictRows = [];
  const rawRow = L => [L.id, String(L.port ?? ''), L.universe ?? '', L.dest || '', '', '', L.sourceId ?? null, L.sourceName ?? null];
  function dedup(lines){
    const key = L => `${normLK(L.id)||L.id}#${L.port}`;
    const seen = new Map(); const outIssues = [];
    for(const L of lines){
      const k = key(L);
      if(!seen.has(k)){ seen.set(k,[L]); continue; }
      const arr = seen.get(k);
      const universes = new Set(arr.concat([L]).map(x => x.universe).filter(v => v!=null));
      if(universes.size>1){
        const options = arr.concat([L]).filter((x, i, all) => all.findIndex(y => y.universe === x.universe && y.dest === x.dest) === i).map(x => ({ universe:x.universe, dest:x.dest, source:x.sourceName }));
        outIssues.push({severity:'RED', code:'UNIVERSE_CONFLICT', dimcity:L.dimcity, port:L.port, ref: isV(L.id) ? {kind:'VEAM', id:L.id} : {kind:'LK', id:normLK(L.id)},
          fix:{ type:'conflict', id:L.id, port:L.port, options }, message:`${normLK(L.id)||L.id} port ${L.port} is patched twice with different universes (${[...universes].map(u=>`U${u}`).join(' / ')})`});
        arr.forEach(x => x.status='RED'); L.status='RED';
        if(L.universe !== arr[0].universe || L.dest !== arr[0].dest) conflictRows.push(rawRow(L));
      } else {
        const nonNull = [ ...arr, L ].find(x => x.universe!=null);
        arr[0].universe = nonNull?.universe ?? arr[0].universe;
        arr[0].dest = arr[0].dest || L.dest;
      }
    }
    const ded = Array.from(new Set([...seen.values()].map(v=>v[0])));
    return {ded, issues: outIssues};
  }

  const d1 = dedup(lkLines); const d2 = dedup(veLines);
  const netLines = []; { const seenNet = new Map(); for(const N of netRaw){ const k = `${N.id}#${N.port}`; const prev = seenNet.get(k); if(!prev){ seenNet.set(k, N); netLines.push(N); } else { prev.dest = prev.dest || N.dest; if(prev.vlan == null) prev.vlan = N.vlan; if(N.vlan != null && prev.vlan != null && N.vlan !== prev.vlan) issues.push({severity:'YELLOW', code:'NET_CONFLICT', dimcity:N.dimcity, message:`${N.id}.${N.port} is patched twice with different VLANs — the first one is kept`}); } } }
  issues.push(...d1.issues, ...d2.issues);

  // Groeperen
  const byLK = new Map();
  for(const L of d1.ded){
    const id = isLK(L.id) ? normLK(L.id) : L.id;
    if(isLK(id)){
      if(!byLK.has(id)) byLK.set(id, {
        id, dimcity: L.dimcity,
        lines: [],
        names: {'1-4':null,'5-8':null,'9-12':null},
        veam:{1:null,2:null,3:null},
        blockType:{ mode:'Auto', value:'MIXED' }
      });
      byLK.get(id).lines.push(L);
    }
  }

  const byVeam = new Map();
  for(const V of d2.ded){
    if(!byVeam.has(V.id)) byVeam.set(V.id, { id: V.id, dimcity: V.dimcity, lines: [] });
    byVeam.get(V.id).lines.push(V);
  }

  // auto bloktype
  for (const [,rec] of byLK) rec.blockType.value = autoBlockType(rec);

  // byDim
  const byDim = new Map();
  for(const L of d1.ded){
    const dc = L.dimcity;
    if(!byDim.has(dc)) byDim.set(dc, { lks:new Set(), veams:new Set(), lines_total:0, filled:0, empty:0, red:0, yellow:0 });
    const s = byDim.get(dc);
    if(isLK(L.id)) s.lks.add(normLK(L.id));
    s.lines_total++; if(L.universe!=null) s.filled++; else s.empty++;
    if(L.status==='RED') s.red++; if(L.status==='YELLOW') s.yellow++;
  }
  for(const V of d2.ded){
    const dc = V.dimcity;
    if(!byDim.has(dc)) byDim.set(dc, { lks:new Set(), veams:new Set(), lines_total:0, filled:0, empty:0, red:0, yellow:0 });
    byDim.get(dc).veams.add(V.id);
  }
  for(const N of netLines){ if(N.dimcity && !byDim.has(N.dimcity)) byDim.set(N.dimcity, emptyDimStats()); }
  // DimCities die alleen losse DMX hebben moeten ook bestaan (anders ontbreken ze in UI en PDF)
  for(const D of dmxLoose){
    if(D.dimcity && !byDim.has(D.dimcity)) byDim.set(D.dimcity, emptyDimStats());
  }

  // Handmatige instellingen uit het vorige model meenemen, zodat een (her)import
  // geen Veam-koppelingen, bloktypes of handmatig toegevoegde LK/Veam/DimCities wist.
  carryOverManualState(MODEL, { byLK, byVeam, byDim, veamPool });

  // --- MODEL opbouwen, inclusief DMX ---
  MODEL = {
    filePath: MODEL.filePath,
    projectPath: MODEL.projectPath,
    projectMeta: MODEL.projectMeta,
    networkDevices: normalizeNetworkDevices(MODEL.networkDevices),
    pdfSettings: MODEL.pdfSettings,
    flow: MODEL.flow || null,           // signaalstroom: eigen namen en posities van blokken
    labels: MODEL.labels || null,       // sticker-instellingen
    setup: MODEL.setup || null,         // stappenplan: overgeslagen stappen
    pdfTemplates: Array.isArray(MODEL.pdfTemplates) ? MODEL.pdfTemplates : [],
    libraryDismissed: Array.isArray(MODEL.libraryDismissed) ? MODEL.libraryDismissed : [],
    dimColors: MODEL.dimColors && typeof MODEL.dimColors === 'object' ? {...MODEL.dimColors} : {},
    csvSources: Array.isArray(MODEL.csvSources) ? MODEL.csvSources.slice() : [],
    lines: d1.ded,
    veamLines: d2.ded,
    dmxLoose,                         // << NIEUW
    netLines,
    customRows: MODEL.customRows || [],
    invalidRows,
    conflictRows,
    issues,
    byDim,
    byLK,
    byVeam,
    veamPool,
    veamUse: new Map(),
    uniStats: new Map(),
    dimFromCSV: new Set(), // gevuld door hydrateDimOrigins()
    dimFromManual: MODEL.dimFromManual instanceof Set ? new Set(MODEL.dimFromManual) : new Set(),
    selected: {kind:null, id:null},
    ui: MODEL.ui
  };

  // herkomst + stats
  hydrateDimOrigins();
  recomputeVeamUseAndIssues();
  recomputeUniverseStats();

  // reset rechterpaneel
  MODEL.selected = { kind: null, id: null };
  MODEL.ui.rightMode = 'HOME';

  renderAll();
}

function emptyDimStats(){
  return { lks:new Set(), veams:new Set(), lines_total:0, filled:0, empty:0, red:0, yellow:0 };
}

function carryOverManualState(prev, { byLK, byVeam, byDim, veamPool }){
  const ensureDim = dc => { if(dc && !byDim.has(dc)) byDim.set(dc, emptyDimStats()); return byDim.get(dc); };

  for(const [id, old] of (prev?.byLK || new Map())){
    let rec = byLK.get(id);
    if(!rec){
      if(!old.manual) continue; // LK kwam uit CSV en staat er niet meer in
      rec = {
        id, dimcity: old.dimcity, lines: [],
        names: {'1-4':null,'5-8':null,'9-12':null},
        veam: {1:null,2:null,3:null},
        blockType: { mode:'Manual', value: old.blockType?.value || 'MIXED' }
      };
      byLK.set(id, rec);
      ensureDim(rec.dimcity)?.lks.add(id);
    }
    if(old.manual) rec.manual = true;
    if(old.blockType?.mode === 'Manual') rec.blockType = { mode:'Manual', value: old.blockType.value || 'MIXED' };
    if(old.names) rec.names = { ...rec.names, ...old.names };
    rec.veam = { 1: old.veam?.[1] ?? null, 2: old.veam?.[2] ?? null, 3: old.veam?.[3] ?? null };
  }

  for(const [id, old] of (prev?.byVeam || new Map())){
    if(!old.manual) continue;
    const existing = byVeam.get(id);
    if(existing){ existing.manual = true; continue; }
    byVeam.set(id, { id, dimcity: old.dimcity, lines: [], manual: true });
    ensureDim(old.dimcity)?.veams.add(id);
    if(!veamPool.has(old.dimcity)) veamPool.set(old.dimcity, new Set());
    veamPool.get(old.dimcity).add(id);
  }

  for(const dc of (prev?.dimFromManual || [])) ensureDim(dc);
}

// ===== Veam-allocaties en issues =====
function recomputeVeamUseAndIssues(){
  const veamUse = new Map();

  // Registreer Veam-gebruik. Blokkeer bij 12X XLR.
  for (const [lkId, rec] of MODEL.byLK){
  if (effectiveBlockType(rec) === 'XLR12'){
  // Laat koppelingen staan voor validatie; UI blokkeert wijzigingen al bij XLR12.
  continue;
}

    for (const slot of [1,2,3]){
      const v = rec.veam[slot];
      if(!v) continue;
      const arr = veamUse.get(v) || [];
      arr.push({ lkId, slot });
      veamUse.set(v, arr);
    }
  }
  MODEL.veamUse = veamUse;

  // Oude issues weg voor deze codes
  MODEL.issues = MODEL.issues.filter(x =>
    x.code !== 'VEAM_DUPLICATE' &&
    x.code !== 'VEAM_MISSING' &&
    x.code !== 'XLR12_VEAM_IGNORED' &&
    x.code !== 'BLOCKTYPE_XLR_CONFLICT'
  );

  // Dubbele Veam-koppelingen
  for (const [vid, uses] of MODEL.veamUse){
    if(uses.length > 1){
      const refs = uses.map(u => `${u.lkId}(Veam ${u.slot})`).join(', ');
      MODEL.issues.push({
        severity:'RED',
        code:'VEAM_DUPLICATE',
        dimcity: MODEL.byLK.get(uses[0].lkId)?.dimcity || dimCityFromId(vid),
        ref: MODEL.byVeam.has(vid) ? { kind:'VEAM', id:vid } : { kind:'LK', id:uses[0].lkId },
        message:`Veam ${vid} is linked more than once: ${refs}`
      });
    }
    if(!MODEL.byVeam.has(vid)){
      for(const u of uses){
        MODEL.issues.push({
          severity:'YELLOW',
          code:'VEAM_MISSING',
          dimcity: MODEL.byLK.get(u.lkId)?.dimcity || null,
          ref: { kind:'LK', id:u.lkId },
          message:`${u.lkId} (Veam ${u.slot}) is linked to ${vid}, but ${vid} no longer exists`
        });
      }
    }
  }

  // 12× XLR maar er staan nog Veam-koppelingen => waarschuwing (koppelingen worden genegeerd)
  for (const [, rec] of MODEL.byLK){
    if (effectiveBlockType(rec) !== 'XLR12') continue;
    const linked = [1,2,3].map(s=>rec.veam?.[s]).filter(Boolean);
    if (linked.length){
      MODEL.issues.push({
        severity:'YELLOW', code:'XLR12_VEAM_IGNORED', dimcity: rec.dimcity, ref:{ kind:'LK', id:rec.id },
        message:`${rec.id} is a 12× XLR block, so its Veam link${linked.length>1?'s':''} (${linked.join(', ')}) ${linked.length>1?'are':'is'} ignored. Change the block type or remove the link.`
      });
    }
  }

  // VEAM_ONLY maar LK ports hebben data => waarschuwing
  for (const [, rec] of MODEL.byLK){
    if (effectiveBlockType(rec) === 'VEAM_ONLY'){
      const used = rec.lines.filter(L => (L.universe!=null) || (L.dest && L.dest!=='')).length;
      if (used > 0){
        MODEL.issues.push({
          severity:'YELLOW',
          code:'BLOCKTYPE_XLR_CONFLICT',
          dimcity: rec.dimcity,
          ref: { kind:'LK', id:rec.id },
          message:`${rec.id} is set to 3× Veam, but ${used} of its own LK port(s) contain data`
        });
      }
    }
  }
    recomputeUniverseStats(); // ← deze regel moet de laatste stap zijn
}



// ===== Slot-usage =====
function slotUsage(lk, slot){
  const ranges = {1:[1,4], 2:[5,8], 3:[9,12]};
  const [s,e] = ranges[slot];
  let used = 0;
  for(let p=s;p<=e;p++){
    const L = lk.lines.find(x=>x.port===p);
    if(L && (L.universe!=null || (L.dest && L.dest!=='') )) used++;
  }
  return { used, total:4, full: used===4, partial: used>0 && used<4 };
}

// ===== Helpers voor Veam data in poorten =====
function veamPortRecord(veamId, port){
  // port 1..4 binnen de Veam
  const rec = MODEL.byVeam.get(veamId);
  if(!rec) return null;
  return rec.lines.find(x=>x.port===port) || null;
}

// Centrale helper: alles opnieuw uit MODEL herberekenen + UI redraw
function fullRebuildAndRender(){
  // DimCity-herkomst (CSV/manual)
  hydrateDimOrigins();
  // Veam-gebruik + alle issues (incl. VEAM_DUPLICATE, universe-conflicts, etc.)
  recomputeVeamUseAndIssues();
  // Universe-statistieken per DimCity (LK/Veam/DMX)
  recomputeUniverseStats();
  // Alles opnieuw tekenen
  renderAll();
}


// ===== Rendering =====
const I = (name, size=16, cls='') => window.Icons?.icon(name, size, cls) || '';
const byId = (a,b)=> String(a.id).localeCompare(String(b.id), undefined, {numeric:true});
function sortedDims(){ return [...(MODEL.byDim?.keys?.() || [])].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})); }
function uniHue(u){ return `hsl(${(Number(u||0)*47)%360} 72% 60%)`; }
function issuesForDim(dc){ return (MODEL.issues||[]).filter(i=>i.dimcity===dc); }
function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso.length===10 ? iso+'T12:00:00' : iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function plural(n, one, many){ return `${n} ${n===1?one:(many||one+'s')}`; }

function hydrateIcons(root=document){
  root.querySelectorAll('[data-icon]').forEach(n=>{ n.outerHTML = I(n.dataset.icon, Number(n.dataset.size||16)); });
}

// ---- Toasts, menus en dialogen ----
function toast(message, kind='ok', opts={}){
  const host = $('#toastHost'); if(!host) return;
  const t = el('div', `toast ${kind}`, `${I(kind==='err'?'alert':kind==='info'?'info':'checkCircle',16)}<span>${esc(message)}</span>`);
  if(opts.action){
    const b = el('button','sm', esc(opts.action.label));
    b.onclick = ()=>{ opts.action.run(); t.remove(); };
    t.appendChild(b);
  }
  host.appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity .3s'; t.style.opacity='0'; setTimeout(()=>t.remove(), 300); }, opts.ms || 3200);
}

function showMenu(anchor, items){
  document.querySelectorAll('.popover-menu').forEach(m=>m.remove());
  const r = anchor.getBoundingClientRect();
  const m = el('div','popover-menu');
  m.innerHTML = items.map((it,i)=> it==='-' ? '<div class="sep"></div>'
    : `<button data-i="${i}">${it.icon?I(it.icon,15):''}<span>${esc(it.label)}</span></button>`).join('');
  document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = (r.bottom + 4) + 'px';
  m.querySelectorAll('button[data-i]').forEach(b=> b.onclick = ()=>{ m.remove(); items[Number(b.dataset.i)].run(); });
  setTimeout(()=>{
    const off = e=>{ if(!m.contains(e.target)){ m.remove(); document.removeEventListener('mousedown', off, true); } };
    document.addEventListener('mousedown', off, true);
  }, 0);
}

function openDialog({ title, subtitle='', body='', width='', cls='', footer=null, onClose }){
  const bd = el('div','modal-backdrop');
  const m = el('div', `modal ${cls}`);
  if(width) m.style.width = `min(${width}, 100%)`;
  m.innerHTML = `<div class="modal-header"><div><h2>${esc(title)}</h2>${subtitle?`<div class="sub">${subtitle}</div>`:''}</div><button class="ghost icon-only dlg-x" title="Close">${I('x',16)}</button></div><div class="modal-body">${body}</div>${footer!==null?`<div class="modal-footer">${footer}</div>`:''}`;
  bd.appendChild(m);
  document.body.appendChild(bd);
  const onKey = e=>{ if(e.key==='Escape' && [...document.querySelectorAll('.modal-backdrop')].pop()===bd) close(); };
  function close(){ bd.remove(); document.removeEventListener('keydown', onKey); onClose?.(); }
  document.addEventListener('keydown', onKey);
  m.querySelector('.dlg-x').onclick = close;
  bd.addEventListener('mousedown', e=>{ if(e.target===bd) close(); });
  return { bd, modal:m, body:m.querySelector('.modal-body'), footer:m.querySelector('.modal-footer'), close };
}

function confirmDialog({ title='Are you sure?', message='', okLabel='Continue', cancelLabel='Cancel', danger=false }){
  return new Promise(resolve=>{
    let done = false;
    const d = openDialog({
      title, width:'440px', body:`<p style="margin:0;color:var(--text-2);line-height:1.55;white-space:pre-line">${esc(message)}</p>`,
      footer:`<button data-act="cancel">${esc(cancelLabel)}</button><button data-act="ok" class="${danger?'danger':'primary'}">${esc(okLabel)}</button>`,
      onClose:()=>{ if(!done) resolve(false); }
    });
    d.footer.querySelector('[data-act=cancel]').onclick = ()=>{ done=true; d.close(); resolve(false); };
    d.footer.querySelector('[data-act=ok]').onclick = ()=>{ done=true; d.close(); resolve(true); };
    d.footer.querySelector('[data-act=ok]').focus();
  });
}

// ---- Navigatie ----
function navigate(view){
  MODEL.ui.view = view;
  MODEL.ui.rightMode = 'HOME';
  MODEL.selected = { kind:null, id:null };
  renderSummary();
  renderRight();
  const sc = $('#mainScroll'); if(sc) sc.scrollTop = 0;
}
function openEntity(kind, id){
  MODEL.selected = { kind, id };
  MODEL.ui.rightMode = 'DETAIL';
  renderSummary();
  renderRight();
  const sc = $('#mainScroll'); if(sc) sc.scrollTop = 0;
}

function pageHead({ eyebrow='', title='', sub='', actions='', crumbs='' }){
  const h = $('#lkHeader'); if(!h) return;
  h.innerHTML = `<div style="min-width:0">${crumbs?`<div class="breadcrumb">${crumbs}</div>`:''}${eyebrow?`<div class="eyebrow">${eyebrow}</div>`:''}<h1>${title}</h1>${sub?`<div class="sub">${sub}</div>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}`;
}
function card({ key='', title='', icon='', meta='', actions='', body='', flush=false, collapsible=true, collapsed:defaultCollapsed=false, style='' }){
  const collapsed = key ? (MODEL.ui.cardCollapsed?.[key] ?? defaultCollapsed) : false;
  return `<section class="card ${collapsed?'collapsed':''}" ${key?`data-card="${esc(key)}"`:''} ${style?`style="${style}"`:''}>
    <div class="card-head"><h3>${icon?I(icon,15):''}${title}${meta?`<span class="meta">${meta}</span>`:''}</h3>
      <div class="actions">${actions}${collapsible && key ? `<button class="ghost sm icon-only collapse-btn" data-collapse="${esc(key)}" title="Show / hide">${I('chevronDown',15)}</button>` : ''}</div></div>
    <div class="card-body ${flush?'flush':''}">${body}</div></section>`;
}
function kpi(label, value, icon, cls='', foot=''){
  return `<div class="kpi ${cls}"><div class="label">${I(icon,14)}${esc(label)}</div><div class="value">${value}</div>${foot?`<div class="foot">${foot}</div>`:''}</div>`;
}

// ---- Centrale render ----
// Veams that are patched on a Veam4 socket of a rack / loose spider (they need no LK link): { V101 -> 'Veam3' }
let SOCK = null;
function veamSockets(){
  if(SOCK) return SOCK;
  SOCK = new Map();
  try {
    const E = window.RackEngine;
    for(const dc of sortedDims()){
      if(!E?.hasRackPlan?.(MODEL, dc)) continue;
      const P = E.computeRackPlan(MODEL, dc);
      for(const v of [...P.groups.flatMap(g => g.vims), ...P.soloVims]) if(v.used) SOCK.set(v.used.id, v.label);
    }
  } catch {}
  return SOCK;
}
const veamIsPatched = vid => (MODEL.veamUse.get(vid) || []).length >= 1 || veamSockets().has(vid);
function renderAll(){
  SOCK = null;
  renderSummary();
  renderIssues();
  renderRight();
}

function renderIssues(){
  const errs = (MODEL.issues||[]).filter(i=>i.severity==='RED').length;
  const warns = (MODEL.issues||[]).length - errs;
  const c = $('#navIssueCount');
  if(c){
    c.className = 'count' + (errs ? ' err' : warns ? ' warn' : '');
    c.textContent = errs || warns || '';
  }
  if(MODEL.ui.rightMode !== 'DETAIL' && MODEL.ui.view === 'ISSUES') renderIssuesView();
  updateChrome();
}

// Titelbalk, statusbalk en venstertitel
let _chromeSig = '';
function updateChrome(){
  const meta = MODEL.projectMeta || {};
  const name = meta.project || (MODEL.filePath ? shortFileName(MODEL.filePath).replace(/\.lkproj$/i,'') : '');
  const dirty = !!MODEL.ui?.dirty;
  const errs = (MODEL.issues||[]).filter(i=>i.severity==='RED').length;
  const warns = (MODEL.issues||[]).length - errs;
  const rows = (MODEL.lines?.length||0) + (MODEL.veamLines?.length||0) + (MODEL.dmxLoose?.length||0) + (MODEL.netLines?.length||0);
  const sig = [name, dirty, errs, warns, rows, MODEL.filePath, MODEL.byDim?.size, MODEL.byLK?.size, MODEL.byVeam?.size].join('|');
  if(sig === _chromeSig) return;
  _chromeSig = sig;

  const t = $('#projectTitle'); if(t) t.textContent = name || 'Untitled project';
  const dd = $('#dirtyDot'); if(dd) dd.hidden = !dirty;
  const fi = $('#fileInfo'); if(fi) fi.textContent = [meta.area, meta.location].filter(Boolean).join(' · ');
  const sv = $('#statusValidation');
  if(sv) sv.innerHTML = errs ? `<span class="status-err">${I('alert',13)} ${plural(errs,'error')}</span>${warns?` · <span class="status-warn">${plural(warns,'warning')}</span>`:''}`
    : warns ? `<span class="status-warn">${I('alert',13)} ${plural(warns,'warning')}</span>`
    : rows ? `<span class="status-ok">${I('checkCircle',13)} No issues</span>` : '';
  const sc = $('#statusCounts');
  if(sc) sc.innerHTML = rows ? `<b>${MODEL.byDim.size}</b> DimCities · <b>${MODEL.byLK.size}</b> LK · <b>${MODEL.byVeam.size}</b> Veam · <b>${rows}</b> patch rows` : '';
  const sf = $('#statusFile'); if(sf) sf.innerHTML = MODEL.filePath ? `${I('file',13)} ${esc(shortFileName(MODEL.filePath))}` : '<span class="subtle">Not saved yet</span>';
  const ss = $('#statusSaved'); if(ss) ss.innerHTML = dirty ? '<span class="status-warn">● Unsaved changes</span>' : (MODEL.filePath ? '<span class="status-ok">Saved</span>' : '');
  const nr = $('#navRowCount'); if(nr) nr.textContent = rows || '';
  window.app?.setDocumentState?.({ title: name || 'Untitled project', dirty, filePath: MODEL.filePath || '' });
}
// Veel code zet alleen MODEL.ui.dirty; de chrome volgt via een goedkope poll.
setInterval(()=>{ try { updateChrome(); } catch {} }, 400);

// ---- Zijbalk ----
function navEntity(kind, id, icon, active, extra=''){
  return `<button class="nav-item ${active?'active':''}" data-open-kind="${kind}" data-open-id="${esc(id)}" title="${esc(id)}">${I(icon,14)}<span class="label">${esc(id)}</span>${extra}</button>`;
}
function renderSummary(){
  const c = $('#summary'); if(!c) return;
  ensureDimColors();
  const dims = sortedDims();
  const sel = MODEL.selected || {};
  const detail = MODEL.ui.rightMode === 'DETAIL';
  const activeDim = !detail ? null
    : sel.kind==='DIM' ? sel.id
    : sel.kind==='LK' ? MODEL.byLK.get(sel.id)?.dimcity
    : sel.kind==='VEAM' ? MODEL.byVeam.get(sel.id)?.dimcity : null;

  if(!dims.length){
    c.innerHTML = '<div class="nav-empty">No DimCities yet. Import a CSV or add an LK to get started.</div>';
  } else {
    c.innerHTML = dims.map(dc=>{
      const iss = issuesForDim(dc);
      const errs = iss.filter(i=>i.severity==='RED').length;
      const warns = iss.length - errs;
      const count = errs ? `<span class="count err" title="${plural(errs,'error')}">${errs}</span>`
        : warns ? `<span class="count warn" title="${plural(warns,'warning')}">${warns}</span>`
        : `<span class="count">${MODEL.byDim.get(dc)?.lks?.size || 0} LK</span>`;
      let sub = '';
      if(activeDim === dc){
        const lks = [...MODEL.byLK.values()].filter(x=>x.dimcity===dc).sort(byId);
        const ves = [...MODEL.byVeam.values()].filter(x=>x.dimcity===dc).sort(byId);
        sub = `<div class="nav-sub">${lks.map(lk=>navEntity('LK', lk.id, 'box', detail && sel.kind==='LK' && sel.id===lk.id)).join('')}${ves.map(v=>{
          const uses = MODEL.veamUse.get(v.id)||[];
          const mark = uses.length>1 ? '<span class="count err">2×</span>' : (uses.length===0 && !veamSockets().has(v.id)) ? '<span class="count">free</span>' : '';
          return navEntity('VEAM', v.id, 'plug', detail && sel.kind==='VEAM' && sel.id===v.id, mark);
        }).join('')}${!lks.length && !ves.length ? '<div class="nav-empty">No LK or Veam yet</div>' : ''}</div>`;
      }
      return `<button class="nav-item ${detail && sel.kind==='DIM' && sel.id===dc ? 'active' : ''}" data-open-kind="DIM" data-open-id="${esc(dc)}" title="${esc(dc)}"><span class="dim-dot" style="background:${dimColor(dc)}"></span><span class="label">${esc(dc)}</span>${count}</button>${sub}`;
    }).join('');
  }

  const view = MODEL.ui.view || 'HOME';
  document.querySelectorAll('.nav-item[data-view]').forEach(b=> b.classList.toggle('active', !detail && view===b.dataset.view));
}

// ---- Router ----
function renderRight(){
  SOCK = null;
  const sel = MODEL.selected || {};
  const detail = MODEL.ui.rightMode === 'DETAIL' && sel.kind;
  const view = detail ? 'DETAIL' : (MODEL.ui.view || 'HOME');
  const table = $('#rightCsvSection'); if(table) table.hidden = view !== 'TABLE';
  const detailEl = $('#lkDetail'); if(detailEl){ detailEl.hidden = view === 'TABLE'; detailEl.style.removeProperty('--dim-color'); }
  document.body.classList.toggle('view-flow', view === 'FLOW');   // the Signal Flow page fills the window, no scrolling

  if(view === 'DETAIL') renderRightDetail();
  else if(view === 'ISSUES') renderIssuesView();
  else if(view === 'TABLE') renderTableView();
  else if(view === 'NETWORK') renderNetworkView();
  else if(view === 'NET') window.NetworkPage?.render?.();
  else if(view === 'FLOW') window.Flow?.render?.();
  else renderRightHome();
  updateChrome();
}
function renderRightDetail(){
  const sel = MODEL.selected || {};
  if (sel.kind === 'LK')   return renderLKDetail(sel.id);
  if (sel.kind === 'VEAM') return renderVeamDetail(sel.id);
  if (sel.kind === 'DIM')  return renderDimCityDetail(sel.id);
  return renderRightHome();
}
function updateRightCsvVisibility(){ /* patch list is a separate view now */ }

// ---- Overview ----
function renderRightHome(){
  const meta = MODEL.projectMeta || {};
  const dims = sortedDims();
  const hasData = dims.length > 0;
  const subParts = [meta.area, meta.location, meta.date ? fmtDate(meta.date) : '', meta.prepared ? `Prepared by ${meta.prepared}` : ''].filter(Boolean).map(esc);
  pageHead({
    eyebrow: 'Project overview',
    title: esc(meta.project || 'Untitled project'),
    sub: subParts.join('<span class="subtle"> · </span>') || '<span class="subtle">No project details yet — add them via Project Info.</span>',
    actions: `<button data-cmd="projectInfo">${I('edit',15)}Project Info</button><button data-cmd="importCsv">${I('upload',15)}Import CSV</button><button class="primary" data-cmd="exportPdf">${I('file',15)}Export PDF</button>`
  });
  const root = $('#lkDetail');
  if(!hasData){
    root.innerHTML = `<div class="card"><div class="empty">${I('upload',36)}<h3>Import your patch data</h3>
      <p>Start with a CSV export of LK, Veam and DMX patch points. DimCities, LK blocks and Veams are created automatically. You can also add them by hand.</p>
      <div class="actions"><button class="primary" data-cmd="importCsv">${I('upload',15)}Import CSV</button><button data-cmd="addLK">${I('plus',15)}Add LK</button><button data-cmd="addVeam">${I('plus',15)}Add Veam</button></div></div></div>`;
    return;
  }

  const allUnis = new Set();
  let points = 0;
  for(const [, s] of MODEL.uniStats){ for(const u of s.counts.keys()) allUnis.add(u); points += s.totalPorts; }
  const errs = MODEL.issues.filter(i=>i.severity==='RED').length;
  const warns = MODEL.issues.length - errs;
  const linkedVeams = [...MODEL.byVeam.keys()].filter(v=>(MODEL.veamUse.get(v)||[]).length===1 || ((MODEL.veamUse.get(v)||[]).length===0 && veamSockets().has(v))).length;

  const kpis = `<div class="kpis">
    ${kpi('DimCities', dims.length, 'layers')}
    ${kpi('LK blocks', MODEL.byLK.size, 'box')}
    ${kpi('Veams', MODEL.byVeam.size, 'plug', '', `${linkedVeams} linked`)}
    ${kpi('Universes', allUnis.size, 'universe')}
    ${kpi('Patch points', points, 'cable')}
    ${kpi('Errors', errs, 'alert', errs?'err':'ok')}
    ${kpi('Warnings', warns, 'alert', warns?'warn':'')}
  </div>`;

  const dimRows = dims.map(dc=>{
    const s = MODEL.byDim.get(dc);
    const st = MODEL.uniStats.get(dc);
    const iss = issuesForDim(dc);
    const e = iss.filter(i=>i.severity==='RED').length, w = iss.length - e;
    const vs = [...(s.veams||[])];
    const linked = vs.filter(v=>veamIsPatched(v)).length;
    const status = e ? `<span class="tag red">${plural(e,'error')}</span>` : w ? `<span class="tag yellow">${plural(w,'warning')}</span>` : '<span class="tag green">OK</span>';
    return `<tr class="clickable-row" data-open-kind="DIM" data-open-id="${esc(dc)}">
      <td><span class="dim-dot" style="display:inline-block;margin-right:8px;vertical-align:-1px;background:${dimColor(dc)}"></span><b>${esc(dc)}</b></td>
      <td class="num">${s.lks.size}</td><td class="num">${vs.length}</td><td class="num">${vs.length ? `${linked}/${vs.length}` : '—'}</td>
      <td class="num">${st?.totalUniq || 0}</td><td class="num">${st?.totalPorts || 0}</td>
      <td>${status}</td><td class="num subtle">${I('chevronRight',15)}</td></tr>`;
  }).join('');
  const dimTable = `<table class="data-table"><thead><tr><th>DimCity</th><th class="num">LK</th><th class="num">Veam</th><th class="num">Veams linked</th><th class="num">Universes</th><th class="num">Patch points</th><th>Status</th><th></th></tr></thead><tbody>${dimRows}</tbody></table>`;

  const topIssues = MODEL.issues.slice().sort((a,b)=>(a.severity==='RED'?0:1)-(b.severity==='RED'?0:1)).slice(0,6);
  const issuesBody = topIssues.length
    ? `<ul class="issue-list">${topIssues.map(issueItemHtml).join('')}</ul>`
    : `<div class="empty" style="padding:28px">${I('checkCircle',28)}<h3>All checks passed</h3><p>No duplicate Veams, conflicts or missing data found.</p></div>`;

  const sources = Array.isArray(MODEL.csvSources) ? MODEL.csvSources : [];
  const custom = (MODEL.customRows||[]).length;
  const srcBody = sources.length || custom
    ? `<table class="data-table"><thead><tr><th>Source</th><th class="num">Rows</th><th>Updated</th></tr></thead><tbody>${sources.map(s=>`<tr><td>${I('file',14)} ${esc(s.name || shortFileName(s.path))}</td><td class="num">${s.rowCount || s.rows?.length || 0}</td><td class="subtle">${s.updatedAt ? new Date(s.updatedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}) : '—'}</td></tr>`).join('')}${custom?`<tr><td>${I('edit',14)} Manual rows</td><td class="num">${custom}</td><td class="subtle">—</td></tr>`:''}</tbody></table>`
    : '<div class="empty" style="padding:24px"><p>No CSV files imported. Rows were added by hand.</p></div>';

  root.innerHTML = `<div class="stack">${kpis}
    ${card({ key:'home-dims', title:'DimCities', icon:'layers', meta:plural(dims.length,'DimCity','DimCities'), body:dimTable, flush:true, collapsible:false })}
    <div class="grid-2">
      ${card({ key:'home-issues', title:'Validation', icon:'alert', meta: MODEL.issues.length ? `${MODEL.issues.length} total` : '', actions: MODEL.issues.length ? `<button class="sm ghost" data-nav-view="ISSUES">View all ${I('arrowRight',13)}</button>` : '', body:issuesBody, flush:true, collapsible:false })}
      ${card({ key:'home-sources', title:'Data sources', icon:'file', actions:`<button class="sm ghost" data-cmd="csvSources">Manage</button>`, body:srcBody, flush:true, collapsible:false })}
    </div></div>`;
}

// ---- Validation ----
function issueRef(it){
  if(it.ref?.kind && it.ref?.id) return it.ref;
  return null;
}
function issueItemHtml(it){
  const ref = issueRef(it);
  const idx = (MODEL.issues||[]).indexOf(it);
  const canFix = window.IssueFix?.canFix?.(it);
  return `<li class="issue ${it.severity==='RED'?'RED':'YELLOW'} ${ref?'clickable':''}" data-issue="${idx}" title="${ref ? `Go to ${esc(ref.id)}${it.port ? ` port ${esc(it.port)}` : ''}` : ''}"><span class="sev">${I('alert',13)}</span>
    <div><div class="msg">${esc(it.message||'')}</div><div class="where"><span class="code">${esc(it.code||'')}</span>${it.dimcity?` <span class="subtle">·</span> <span class="muted">${esc(it.dimcity)}</span>`:''}${ref?` <span class="subtle">·</span> <span class="muted">${esc(ref.id)}${it.port?` port ${esc(it.port)}`:''}</span>`:''}</div></div>
    <div class="issue-actions">${canFix ? `<button class="sm primary" data-fix-issue="${idx}">${I('check',13)}Fix…</button>` : ''}${ref ? `<button class="sm ghost" data-open-kind="${ref.kind}" data-open-id="${esc(ref.id)}">Open ${I('arrowRight',13)}</button>` : ''}</div></li>`;
}
function renderIssuesView(){
  const f = MODEL.ui.issueFilter || 'ALL';
  const fdc = MODEL.ui.issueDim || '';
  const all = MODEL.issues || [];
  const errs = all.filter(i=>i.severity==='RED').length;
  const warns = all.length - errs;
  const list = all.filter(i=>(f==='ALL' || (f==='RED' ? i.severity==='RED' : i.severity!=='RED')) && (!fdc || i.dimcity===fdc))
                  .sort((a,b)=>(a.severity==='RED'?0:1)-(b.severity==='RED'?0:1));
  const dimOpts = ['<option value="">All DimCities</option>'].concat(sortedDims().map(dc=>`<option value="${esc(dc)}" ${dc===fdc?'selected':''}>${esc(dc)}</option>`)).join('');
  pageHead({
    eyebrow:'Project', title:'Validation',
    sub: all.length ? `${plural(errs,'error')} · ${plural(warns,'warning')}` : 'Everything checks out',
    actions:`<div class="segmented" id="issueFilter">${['ALL','RED','YELLOW'].map(k=>`<button data-f="${k}" class="${f===k?'active':''}">${k==='ALL'?'All':k==='RED'?'Errors':'Warnings'}</button>`).join('')}</div>
      <select id="issueDim" style="width:150px">${dimOpts}</select><button data-cmd="rebuild">${I('refresh',15)}Recalculate</button>`
  });
  $('#lkDetail').innerHTML = list.length
    ? `<div class="card"><ul class="issue-list">${list.map(issueItemHtml).join('')}</ul></div>`
    : `<div class="card"><div class="empty">${I('checkCircle',36)}<h3>${all.length ? 'Nothing matches this filter' : 'No issues found'}</h3><p>${all.length ? 'Try another filter.' : 'Duplicate Veam links, universe conflicts, missing Veams and block-type conflicts are checked automatically.'}</p></div></div>`;
  $('#issueFilter')?.querySelectorAll('button').forEach(b=> b.onclick = ()=>{ MODEL.ui.issueFilter = b.dataset.f; renderIssuesView(); });
  const sd = $('#issueDim'); if(sd) sd.onchange = ()=>{ MODEL.ui.issueDim = sd.value; renderIssuesView(); };
}

// ---- Patch list ----
function renderTableView(){
  const sources = (MODEL.csvSources||[]).length;
  pageHead({
    eyebrow:'Project', title:'Patch List',
    sub:`All LK, Veam and loose DMX rows${sources?` from ${plural(sources,'CSV file')}`:''}`,
    actions:`<button data-cmd="csvSources">${I('file',15)}Imported Files</button><button data-cmd="importCsv">${I('upload',15)}Import CSV</button>`
  });
  $('#lkDetail').innerHTML = '';
  const f = $('#rawFilter');
  if(f && !f.dataset.bound){ f.dataset.bound = '1'; f.addEventListener('input', renderRawRows); }
  renderRawRows();
}
function renderRawRows(){
  const tb = $('#rawRows'); if(!tb) return;
  const q = ($('#rawFilter')?.value || '').trim().toLowerCase();
  const all = []
    .concat(MODEL.lines.map(L => ({ type:'LK', ...L })))
    .concat(MODEL.veamLines.map(V => ({ type:'Veam', ...V })))
    .concat((MODEL.dmxLoose || []).map(D => ({ type:'DMX', ...D })))
    .concat((MODEL.netLines || []).map(N => ({ type:'C', ...N, universe:N.vlan })))
    .filter(R => !q || [R.type, R.id, R.port, R.universe, R.dest, R.dimcity, R.sourceName].some(v => String(v ?? '').toLowerCase().includes(q)));
  all.sort((a,b)=>{
    const ord = x => x.type==='LK'?0 : x.type==='Veam'?1 : x.type==='C'?2 : 3;
    if (ord(a)!==ord(b)) return ord(a)-ord(b);
    const ida=(a.id||''), idb=(b.id||'');
    if (ida!==idb) return ida.localeCompare(idb, undefined, {numeric:true});
    return (a.port??1e9)-(b.port??1e9);
  });
  const cnt = $('#rawCount'); if(cnt) cnt.textContent = `${all.length} row${all.length===1?'':'s'}`;
  tb.innerHTML = all.length ? all.map(R=>`<tr>
      <td><span class="tag ${R.type==='LK'?'accent':R.type==='Veam'?'blue':R.type==='C'?'green':''}">${R.type}</span></td>
      <td>${R.id ? (R.type==='C' ? esc(R.id) : `<a data-open-kind="${R.type==='LK'?'LK':'VEAM'}" data-open-id="${esc(R.type==='LK'?normLK(R.id):R.id)}">${esc(R.id)}</a>`) : '<span class="subtle">—</span>'}</td>
      <td class="num">${R.port ?? '—'}</td>
      <td class="num">${R.universe ?? ''}</td>
      <td>${esc(R.dest || '')}</td>
      <td>${esc(R.dimcity ?? '')}</td>
      <td class="subtle">${esc(R.sourceName || '')}</td>
      <td>${statusDot(R.status || 'YELLOW')}</td></tr>`).join('')
    : `<tr><td colspan="8"><div class="empty" style="padding:28px"><p>${q ? 'No rows match this filter.' : 'No patch rows yet. Import a CSV to get started.'}</p></div></td></tr>`;
}

// ---- Network planner (page) ----
function renderNetworkView(){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const nd = MODEL.networkDevices;
  pageHead({
    eyebrow:'Project', title:'Nodes & Splitters',
    sub:'Plan DMX nodes and splitters per DimCity. Device types are kept in reusable libraries. Switches, VLANs and fibres are on the Network page.',
    actions:`<button data-cmd="deviceBuilder">${I('network',15)}Device Builder <span class="badge">${nd.nodeTypes.length + nd.splitterTypes.length + nd.switchTypes.length + nd.panelTypes.length}</span></button><button data-cmd="deviceBuilder" data-arg="rack">${I('grid',15)}Racks <span class="badge">${nd.rackTypes.length}</span></button>`
  });
  const dims = sortedDims();
  const nodeOpts = sel => nd.nodeTypes.map(nt=>`<option value="${esc(nt.id)}" ${sel===nt.id?'selected':''}>${esc([nt.brand, nt.name || nt.id].filter(Boolean).join(' '))} · ${Number(nt.portCount||0)} ports</option>`).join('') || '<option value="">No node types yet</option>';
  const splitOpts = sel => nd.splitterTypes.map(sp=>`<option value="${esc(sp.id)}" ${sel===sp.id?'selected':''}>${esc([sp.brand, sp.name || sp.id].filter(Boolean).join(' '))} · ${Number(sp.outputCount||0)} outputs</option>`).join('') || '<option value="">No splitter types yet</option>';
  const libsEmpty = !nd.nodeTypes.length || !nd.splitterTypes.length;

  const prefs = card({ key:'net-prefs', title:'Preferences', icon:'sliders', collapsible:false, body:`<div class="planner-controls" style="max-width:560px">
      <label>Spare ports per node<input id="netPrefNodeSpare" type="number" min="0" value="${Number(nd.prefs.nodeSparePorts||0)}"></label>
      <label>Spare outputs per splitter<input id="netPrefSplitterSpare" type="number" min="0" value="${Number(nd.prefs.splitterSparePorts||0)}"></label></div>
      ${libsEmpty ? `<div class="hint">${I('info',13)} Create at least one node type and one splitter type first (buttons top right).</div>` : ''}` });

  const rows = dims.map(dc=>{
    const plan = getDimPlan(dc);
    const unis = uniqueUniversesInDim(dc);
    const nt = nd.nodeTypes.find(x=>x.id===plan.nodeTypeId) || nd.nodeTypes[0];
    const need = nt ? calculateNodeNeedForDim(dc, nt.portCount) : null;
    return `<div class="planner-row" style="--dim-color:${dimColor(dc)}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="display:flex;align-items:center;gap:10px"><b style="font-size:14px">${esc(dc)}</b><span class="info-pill">${plural(unis.length,'universe')}</span>${need?`<span class="info-pill">${plural(need.nodeCount,'node')} needed</span>`:''}<span class="info-pill">${plural(plan.nodes.length,'node')} placed</span><span class="info-pill">${plural(plan.splitters.length,'splitter')} placed</span></div>
        <button class="sm ghost" data-open-kind="DIM" data-open-id="${esc(dc)}">Open DimCity ${I('arrowRight',13)}</button>
      </div>
      <div class="planner-controls" style="margin-top:12px">
        <label>Node type<select class="planNodeType" data-dc="${esc(dc)}">${nodeOpts(plan.nodeTypeId)}</select></label>
        <button class="planAutoNode" data-dc="${esc(dc)}" ${nd.nodeTypes.length?'':'disabled'}>${I('refresh',14)}Auto-assign nodes</button>
        <label>Splitter type<select class="planSplitterType" data-dc="${esc(dc)}">${splitOpts(plan.lastSplitterTypeId)}</select></label>
        <button class="planAutoSplit" data-dc="${esc(dc)}" ${nd.splitterTypes.length?'':'disabled'}>${I('refresh',14)}Auto-calculate splitters</button>
      </div>
      <div class="universe-chip-grid">${unis.map(u=>`<span class="info-pill"><span class="status-dot" style="background:${uniHue(u)};margin:0"></span>UNI ${u}</span>`).join('') || '<span class="subtle">No universes</span>'}</div>
    </div>`;
  }).join('') || '<div class="device-list-empty">No DimCities yet.</div>';

  $('#lkDetail').innerHTML = `<div class="stack">${prefs}${card({ key:'net-dims', title:'DimCities', icon:'layers', collapsible:false, body:rows })}</div>`;

  const root = $('#lkDetail');
  root.querySelector('#netPrefNodeSpare').oninput = e=>{ nd.prefs.nodeSparePorts = Math.max(0, Number(e.target.value||0)); MODEL.ui.dirty = true; };
  root.querySelector('#netPrefSplitterSpare').oninput = e=>{ nd.prefs.splitterSparePorts = Math.max(0, Number(e.target.value||0)); MODEL.ui.dirty = true; };
  root.querySelectorAll('.planNodeType').forEach(sel=> sel.onchange = ()=>{ getDimPlan(sel.dataset.dc).nodeTypeId = sel.value; MODEL.ui.dirty = true; renderNetworkView(); });
  root.querySelectorAll('.planSplitterType').forEach(sel=> sel.onchange = ()=>{ getDimPlan(sel.dataset.dc).lastSplitterTypeId = sel.value; MODEL.ui.dirty = true; });
  root.querySelectorAll('.planAutoNode').forEach(btn=> btn.onclick = ()=>{
    const dc = btn.dataset.dc;
    const plan = autoAssignDimCityNodes(dc, root.querySelector(`.planNodeType[data-dc="${dc}"]`)?.value || '');
    if(plan) toast(`${dc}: ${plural(plan.nodes.length,'node')} assigned`);
    renderNetworkView();
  });
  root.querySelectorAll('.planAutoSplit').forEach(btn=> btn.onclick = ()=>{
    const dc = btn.dataset.dc;
    const plan = autoAddSplittersForDim(dc, root.querySelector(`.planSplitterType[data-dc="${dc}"]`)?.value || '');
    if(plan) toast(`${dc}: ${plural(plan.splitters.length,'splitter')} calculated`);
    renderNetworkView();
  });
}
function showNetworkDevicesTool(){ navigate('NETWORK'); }

// ---- Gedeelde LK/Veam visuals ----
function lkLineForPort(lk, p){
  return lk.lines.find(x=>Number(x.port)===Number(p)) || {port:p, universe:null, dest:'', status:'YELLOW'};
}
const SLOT_META = {
  1: { name:'Veam A', ports:[1,2,3,4], range:'LK ports 1–4' },
  2: { name:'Veam B', ports:[5,6,7,8], range:'LK ports 5–8' },
  3: { name:'Veam C', ports:[9,10,11,12], range:'LK ports 9–12' }
};
function renderLkVisual(lk){
  const eff = effectiveBlockType(lk);
  const color = dimColor(lk.dimcity);
  const loc = lkAutoLocation(lk) || '';
  const head = `<div class="lk-visual-head"><div class="left"><b>${esc(lk.id)}</b><span class="tag">${esc(blockTypeLabel(eff))}</span>${lk.blockType?.mode==='Manual'?'':'<span class="tag" title="Block type detected automatically">Auto</span>'}${lk.manual?'<span class="tag blue">Manual</span>':''}</div><span class="dimcity-tag">${esc(loc) || ''}</span></div>`;
  if(eff === 'XLR12'){
    return `<div class="lk-visual" style="--dim-color:${color}">${head}<div class="lk-xlr12-grid">${renderCombinedPortCells(lk,[1,2,3,4,5,6,7,8,9,10,11,12])}</div></div>`;
  }
  const groups = [1,2,3].map(slot=>{
    const meta = SLOT_META[slot];
    const title = slot===1 && eff==='MIXED' ? 'XLR 1–4 / Veam A' : meta.name;
    const linked = lk.veam?.[slot] || '';
    return `<div class="lk-group g${slot} ${linked?'linked':'not-linked'}"><div class="lk-group-title"><div><b>${title}</b><span>${meta.range}</span></div><em>${linked ? `${I('check',11)} ${esc(linked)}` : 'No Veam'}</em></div><div class="lk-port-grid">${renderCombinedPortCells(lk, meta.ports)}</div></div>`;
  }).join('');
  return `<div class="lk-visual" style="--dim-color:${color}">${head}<div class="lk-block-layout"><div class="lk-input">LK<br>INPUT</div><div class="lk-groups">${groups}</div></div></div>`;
}
function veamPortsHtml(ve){
  const ports = [];
  for(let i=1;i<=4;i++){
    const L = ve.lines.find(x=>Number(x.port)===i) || {universe:null,dest:''};
    const filled = L.universe != null && L.universe !== '';
    ports.push(`<div class="lk-port-cell ${filled?'filled':''}" data-port="${i}" title="${esc(ve.id)} port ${i}${filled?` • UNI ${esc(L.universe)}`:''}${L.dest?` • ${esc(L.dest)}`:''}"><div class="pnum">${i}</div><div class="puniverse">${filled?`UNI ${esc(L.universe)}`:'—'}</div><div class="pdest">${esc(L.dest||'')}</div></div>`);
  }
  return `<div class="veam-port-grid">${ports.join('')}</div>`;
}
function veamLinkBadge(vid){
  const uses = MODEL.veamUse.get(vid)||[];
  if(uses.length===1) return `<span class="veam-link-badge good">${I('check',12)} ${esc(uses[0].lkId)} · Veam ${'ABC'[uses[0].slot-1]}</span>`;
  if(uses.length>1) return `<span class="veam-link-badge bad">${I('alert',12)} Linked ${uses.length}×: ${uses.map(u=>esc(u.lkId)).join(', ')}</span>`;
  const sk = veamSockets().get(vid);
  if(sk) return `<span class="veam-link-badge good">${I('check',12)} On ${esc(sk)} in the rack</span>`;
  return '<span class="veam-link-badge warn">Not linked</span>';
}
function universeInfoForDim(dc){
  const perU = new Map();
  const bump = (u, kind, rec) => {
    if(u==null || u==='') return;
    u = String(u);
    if(!perU.has(u)) perU.set(u, { lk:[], veam:[], dmx:[] });
    perU.get(u)[kind].push(rec);
  };
  for (const [, lk] of MODEL.byLK){
    if (lk.dimcity !== dc) continue;
    for (const L of lk.lines) bump(L?.universe, 'lk', { lk: lk.id, port: L.port, location: L.dest||'' });
  }
  for (const [, ve] of MODEL.byVeam){
    if (ve.dimcity !== dc) continue;
    for (const R of ve.lines) bump(R?.universe, 'veam', { veam: ve.id, port: R.port, location: R.dest||'' });
  }
  for (const D of (MODEL.dmxLoose||[])){
    if(D.dimcity === dc) bump(D.universe, 'dmx', { location:D.dest||'' });
  }
  return perU;
}
function renderInlineUniverseDetails(dc, focusU){
  if(focusU == null || focusU === '') return '<div class="hint">Select a universe to see which LK and Veam ports carry it.</div>';
  const info = universeInfoForDim(dc).get(String(focusU));
  if(!info) return '<div class="inline-uni-detail muted">No patch points for this universe.</div>';
  const tbl = (arr, cols) => arr.length
    ? `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${arr.map(x=>`<tr>${cols.map(c=>`<td>${esc(x[c.toLowerCase()] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<div class="subtle">None</div>';
  return `<div class="inline-uni-detail"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:14px"><span class="status-dot" style="background:${uniHue(focusU)}"></span>Universe ${esc(focusU)}</b><span class="info-pill">${plural(info.lk.length + info.veam.length + info.dmx.length,'patch point')}</span></div>
    <div class="inline-uni-columns"><div><b>LK ports</b>${tbl(info.lk, ['LK','Port','Location'])}</div><div><b>Veam ports</b>${tbl(info.veam, ['Veam','Port','Location'])}</div>${info.dmx.length?`<div><b>Loose DMX</b>${tbl(info.dmx, ['Location'])}</div>`:''}</div></div>`;
}

// Bloktype + Veam-slots: één implementatie voor inline paneel en LK-pagina
function slotState(lk, slot){
  const eff = effectiveBlockType(lk);
  if(eff === 'XLR12') return lk.veam?.[slot]
    ? { disabled:false, reason:'Ignored in 12× XLR mode — choose “Not linked” to remove it' }
    : { disabled:true, reason:'Not used in 12× XLR mode' };
  const usage = slotUsage(lk, slot);
  if(usage.full) return { disabled:true, reason:`${SLOT_META[slot].range} are all patched on the LK itself` };
  return { disabled:false, reason: usage.partial ? `${usage.used} of 4 LK ports in this range are patched` : '' };
}
function blockTypeSelectHtml(lk, cls){
  const m = lk.blockType?.mode==='Manual' ? lk.blockType.value : 'Auto';
  return `<select class="${cls}" data-lk="${esc(lk.id)}">
    <option value="Auto" ${m==='Auto'?'selected':''}>Auto-detect (${esc(blockTypeLabel(autoBlockType(lk)))})</option>
    <option value="MIXED" ${m==='MIXED'?'selected':''}>${esc(blockTypeLabel('MIXED'))}</option>
    <option value="VEAM_ONLY" ${m==='VEAM_ONLY'?'selected':''}>${esc(blockTypeLabel('VEAM_ONLY'))}</option>
    <option value="XLR12" ${m==='XLR12'?'selected':''}>${esc(blockTypeLabel('XLR12'))}</option></select>`;
}
function veamSlotSelectHtml(lk, slot, cls){
  const st = slotState(lk, slot);
  const pool = [...(MODEL.byDim.get(lk.dimcity)?.veams || [])].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
  const cur = lk.veam?.[slot] || '';
  const opt = v => {
    const uses = (MODEL.veamUse.get(v)||[]).filter(u=>!(u.lkId===lk.id && u.slot===slot));
    const note = uses.length ? ` — used by ${uses.map(u=>u.lkId).join(', ')}` : '';
    return `<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(v)}${esc(note)}</option>`;
  };
  return `<select class="${cls}" data-lk="${esc(lk.id)}" data-slot="${slot}" ${st.disabled?'disabled':''} title="${esc(st.reason)}"><option value="">Not linked</option>${pool.map(opt).join('')}${cur && !pool.includes(cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} (missing)</option>` : ''}</select>`;
}
function applyBlockType(lk, value){
  if(value === 'Auto') lk.blockType = { mode:'Auto', value:autoBlockType(lk) };
  else lk.blockType = { mode:'Manual', value };
  if(effectiveBlockType(lk) === 'XLR12') lk.veam = {1:null,2:null,3:null};
  recomputeVeamUseAndIssues();
  MODEL.ui.dirty = true;
}
function applyVeamSlot(lk, slot, value){
  lk.veam[slot] = value || null;
  recomputeVeamUseAndIssues();
  MODEL.ui.dirty = true;
}
function bindLkControls(root, rerender){
  root.querySelectorAll('select.lkBlockType').forEach(sel=>{
    sel.onclick = e=>e.stopPropagation();
    sel.onchange = ()=>{ const lk = MODEL.byLK.get(sel.dataset.lk); if(!lk) return; applyBlockType(lk, sel.value); renderSummary(); renderIssues(); rerender(); };
  });
  root.querySelectorAll('select.lkVeamSlot').forEach(sel=>{
    sel.onclick = e=>e.stopPropagation();
    sel.onchange = ()=>{ const lk = MODEL.byLK.get(sel.dataset.lk); if(!lk) return; applyVeamSlot(lk, Number(sel.dataset.slot), sel.value); renderSummary(); renderIssues(); rerender(); };
  });
  bindDeleteButtons(root);
}
function mergedPortsTable(lk){
  const rows = [1,2,3,4,5,6,7,8,9,10,11,12].map(p=>{
    const m = mergedPortRecord(lk,p);
    return `<tr><td class="num">${p}</td><td class="num">${m.universe ?? ''}</td><td>${esc(m.dest||'')}</td><td>${esc(m.source||'')}</td><td>${m.ve.veamId ? `${esc(m.ve.veamId)} · port ${m.ve.veamPort}` : '<span class="subtle">—</span>'}</td><td>${m.conflict?'<span class="tag red">Conflict</span>':statusDot(m.status||'YELLOW')}</td></tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th class="num">LK port</th><th class="num">Universe</th><th>Location</th><th>Source</th><th>Veam port</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderInlineLkDetails(lk){
  const eff = effectiveBlockType(lk);
  const slots = eff === 'XLR12' ? '' : [1,2,3].map(s=>`<label>${SLOT_META[s].name} <span class="subtle">(${SLOT_META[s].range})</span>${veamSlotSelectHtml(lk, s, 'lkVeamSlot')}</label>`).join('');
  return `<div class="inline-detail-panel">
    <div class="inline-controls"><label>Block type${blockTypeSelectHtml(lk, 'lkBlockType')}</label>${slots}</div>
    ${eff==='XLR12' ? '<div class="hint" style="margin:-4px 0 10px">12× XLR mode: Veam links are not used.</div>' : ''}
    <div class="inline-table-wrap">${mergedPortsTable(lk)}</div>
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:10px"><button class="sm ghost danger" data-del-lk="${esc(lk.id)}">${I('trash',13)}Delete</button><button class="sm" data-open-kind="LK" data-open-id="${esc(lk.id)}">Open LK page ${I('arrowRight',13)}</button></div>
  </div>`;
}

// ---- DimCity ----
function renderDimCityDetail(dc){
  const root = $('#lkDetail');
  const dim = MODEL.byDim.get(dc);
  if(!dim){
    pageHead({ title: esc(dc || 'DimCity') });
    root.innerHTML = '<div class="card"><div class="empty"><p>No data for this DimCity.</p></div></div>';
    return;
  }
  ensureDimColors();
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const color = dimColor(dc);
  const stat = MODEL.uniStats.get(dc);
  const uniCount = stat?.totalUniq || 0;
  const pointCount = stat?.totalPorts || 0;
  const lks = [...MODEL.byLK.values()].filter(x=>x.dimcity===dc).sort(byId);
  const veams = [...MODEL.byVeam.values()].filter(x=>x.dimcity===dc).sort(byId);
  const dmx = (MODEL.dmxLoose||[]).filter(d=>d.dimcity===dc);
  const focusU = MODEL.ui.dimFocusUniverse?.[dc] || null;
  const iss = issuesForDim(dc);
  const errs = iss.filter(i=>i.severity==='RED').length, warns = iss.length - errs;
  const linked = veams.filter(v=>veamIsPatched(v.id)).length;

  pageHead({
    crumbs:`<a data-nav-view="HOME">Overview</a>${I('chevronRight',12)}<span>DimCities</span>`,
    title:`<span class="dim-dot" style="width:14px;height:14px;border-radius:4px;background:${color}"></span>${esc(dc)}`,
    sub:`${plural(lks.length,'LK block')} · ${plural(veams.length,'Veam')} · ${plural(uniCount,'universe')} · ${plural(pointCount,'patch point')}`,
    actions:`<button id="dimColorBtn">${I('sliders',15)}Color</button><button data-cmd="addLK">${I('plus',15)}Add LK</button><button data-cmd="stickers" data-arg="${esc(dc)}" title="Print the stickers of this DimCity">${I('grid',15)}Stickers</button><button class="primary" id="dimExport">${I('file',15)}Export ${esc(dc)}</button>`
  });

  const kpis = `<div class="kpis">
    ${kpi('LK blocks', lks.length, 'box')}
    ${kpi('Veams', veams.length, 'plug', '', veams.length ? `${linked} of ${veams.length} linked` : '')}
    ${kpi('Universes', uniCount, 'universe')}
    ${kpi('Patch points', pointCount, 'cable')}
    ${kpi('Errors', errs, 'alert', errs?'err':'ok')}
    ${kpi('Warnings', warns, 'alert', warns?'warn':'')}
  </div>`;

  const uniCards = stat && stat.counts.size ? [...stat.counts.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([u,c])=>{
    const total = c.lk + c.veam + (c.dmx || 0);
    return `<div class="uni-card ${String(focusU)===String(u)?'active':''}" data-uni="${esc(u)}" style="--uni:${uniHue(u)}"><div class="uni-title">UNI ${esc(u)}</div><div class="uni-sub">${plural(total,'patch point')}</div><div class="dim-pill-row">${c.lk?`<span class="info-pill">LK ${c.lk}</span>`:''}${c.veam?`<span class="info-pill">Veam ${c.veam}</span>`:''}${c.dmx?`<span class="info-pill">DMX ${c.dmx}</span>`:''}</div></div>`;
  }).join('') : '<div class="device-list-empty">No universes patched in this DimCity.</div>';

  const lkCards = lks.length ? lks.map(lk=>{
    const open = isInlineOpen(dc,'lk',lk.id);
    return `<div class="lk-mini-card clickable ${open?'open':''}" data-lk="${esc(lk.id)}">${renderLkVisual(lk)}${open ? renderInlineLkDetails(lk) : ''}</div>`;
  }).join('') : '<div class="device-list-empty">No LK blocks in this DimCity.</div>';

  const veamCards = veams.length ? veams.map(ve=>{
    const loc = veamAutoLocation(ve) || '';
    return `<div class="lk-mini-card clickable veam-mini" data-veam="${esc(ve.id)}"><div class="lk-visual" style="--dim-color:${color}"><div class="lk-visual-head"><div class="left"><b>${esc(ve.id)}</b>${veamLinkBadge(ve.id)}</div><span class="dimcity-tag">${esc(loc)}</span></div>${veamPortsHtml(ve)}</div></div>`;
  }).join('') : '<div class="device-list-empty">No Veams in this DimCity.</div>';

  const dmxBody = dmx.length ? `<table class="data-table"><thead><tr><th class="num">Universe</th><th>Location</th><th>Source</th></tr></thead><tbody>${dmx.slice().sort((a,b)=>(a.universe??1e9)-(b.universe??1e9)).map(d=>`<tr><td class="num">${d.universe ?? '—'}</td><td>${esc(d.dest||'')}</td><td class="subtle">${esc(d.sourceName||'')}</td></tr>`).join('')}</tbody></table>` : '';

  const rows = []
    .concat(MODEL.lines.map(L => ({ type:'LK', ...L })))
    .concat(MODEL.veamLines.map(V => ({ type:'Veam', ...V })))
    .concat(dmx.map(D => ({ type:'DMX', ...D })))
    .filter(r => r.dimcity === dc)
    .sort((a,b)=> (a.universe??1e9)-(b.universe??1e9) || String(a.id||'').localeCompare(String(b.id||''), undefined, {numeric:true}) || (a.port??1e9)-(b.port??1e9));
  const rowsBody = `<div class="table-scroll"><table class="data-table"><thead><tr><th>Type</th><th>ID</th><th class="num">Port</th><th class="num">Universe</th><th>Location</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.type}</td><td>${esc(r.id || '—')}</td><td class="num">${r.port ?? '—'}</td><td class="num">${r.universe ?? ''}</td><td>${esc(r.dest || '')}</td><td>${statusDot(r.status || 'YELLOW')}</td></tr>`).join('') || '<tr><td colspan="6" class="subtle">No rows</td></tr>'}</tbody></table></div>`;

  const anyOpen = lks.some(lk=>isInlineOpen(dc,'lk',lk.id));
  root.style.setProperty('--dim-color', color);
  root.innerHTML = `<div class="stack">${kpis}
    ${window.DimOverview?.card?.(dc) || ''}
    ${card({ key:`${dc}:uni`, title:'Universes', icon:'universe', meta:plural(uniCount,'universe'), body:`<div class="uni-overview-grid">${uniCards}</div>${renderInlineUniverseDetails(dc, focusU)}` })}
    ${card({ key:`${dc}:lk`, title:'LK blocks', icon:'box', meta:plural(lks.length,'block'), actions: lks.length ? `<button class="sm ghost" id="dimToggleAll">${anyOpen?'Collapse all':'Expand all'}</button>` : '', body:`<div class="hint" style="margin:-4px 0 10px">Click a block to edit its block type and Veam links.</div><div class="lk-card-grid">${lkCards}</div>` })}
    ${card({ key:`${dc}:veam`, title:'Veams', icon:'plug', meta:`${linked}/${veams.length} linked`, body:`<div class="lk-card-grid veams">${veamCards}</div>` })}
    ${window.NetCables?.card(dc) || ''}
    ${dmx.length ? card({ key:`${dc}:dmx`, title:'Loose DMX', icon:'cable', meta:plural(dmx.length,'line'), body:dmxBody, flush:true }) : ''}
    ${window.RackPlan?.cardHtml?.(dc) || ''}
    ${renderDimNetworkDevices(dc)}
    ${card({ key:`${dc}:rows`, title:'Patch rows', icon:'table', meta:plural(rows.length,'row'), body:rowsBody, flush:true, collapsed:true })}
  </div>`;

  const rerender = ()=> renderDimCityDetail(dc);
  const exp = $('#dimExport'); if(exp) exp.onclick = ()=> window.PdfExport?.open?.({ dcs:[dc] });
  const colorBtn = $('#dimColorBtn'); if(colorBtn) colorBtn.onclick = e=> openDimColorPicker(e.currentTarget, dc);
  root.querySelectorAll('.uni-card[data-uni]').forEach(chip=>{
    chip.onclick = ()=>{
      if(!MODEL.ui.dimFocusUniverse) MODEL.ui.dimFocusUniverse = {};
      MODEL.ui.dimFocusUniverse[dc] = String(focusU)===chip.dataset.uni ? null : chip.dataset.uni;
      rerender();
    };
  });
  root.querySelectorAll('.lk-mini-card[data-lk] > .lk-visual').forEach(v=>{
    v.onclick = ()=>{ openInlineState(dc, 'lk', v.parentElement.dataset.lk); rerender(); };
  });
  root.querySelectorAll('.lk-mini-card[data-veam]').forEach(c=>{
    c.onclick = ()=> openEntity('VEAM', c.dataset.veam);
  });
  const tAll = root.querySelector('#dimToggleAll');
  if(tAll) tAll.onclick = ()=>{ setAllInline(dc, !anyOpen); rerender(); };
  bindLkControls(root, rerender);
  bindDimNetworkDevices(root, dc, rerender);
  window.RackPlan?.bind?.(root, dc, rerender);
}
function openDimColorPicker(anchor, dc){
  document.querySelectorAll('.popover-menu').forEach(m=>m.remove());
  const r = anchor.getBoundingClientRect();
  const m = el('div','popover-menu', `<div style="padding:6px 6px 2px;font-size:11px;color:var(--text-3);font-weight:600;letter-spacing:.05em;text-transform:uppercase">${esc(dc)} color</div><div class="dim-color-row" style="padding:6px;max-width:220px">${colorSwatchesHtml(dimColor(dc))}</div>`);
  document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = (r.bottom + 4) + 'px';
  const apply = c => { MODEL.dimColors[dc] = safeHex(c, dimColor(dc)); MODEL.ui.dirty = true; renderSummary(); renderDimCityDetail(dc); };
  m.querySelectorAll('.color-swatch').forEach(b=> b.onclick = ()=>{ apply(b.dataset.color); m.remove(); });
  const custom = m.querySelector('#dimCustomColor'); if(custom) custom.oninput = ()=> apply(custom.value);
  setTimeout(()=>{
    const off = e=>{ if(!m.contains(e.target)){ m.remove(); document.removeEventListener('mousedown', off, true); } };
    document.addEventListener('mousedown', off, true);
  }, 0);
}

// ---- LK pagina ----
function renderLKDetail(id){
  const root = $('#lkDetail');
  const lk = MODEL.byLK.get(id);
  if(!lk){ pageHead({ title: esc(id || 'LK') }); root.innerHTML = '<div class="card"><div class="empty"><p>This LK no longer exists.</p></div></div>'; return; }
  const eff = effectiveBlockType(lk);
  const loc = lkAutoLocation(lk) || '';
  const iss = (MODEL.issues||[]).filter(i=>i.ref?.id===lk.id);
  pageHead({
    crumbs:`<a data-nav-view="HOME">Overview</a>${I('chevronRight',12)}<a data-open-kind="DIM" data-open-id="${esc(lk.dimcity)}">${esc(lk.dimcity)}</a>${I('chevronRight',12)}<span>LK</span>`,
    title:`${esc(lk.id)} <span class="tag accent" style="font-size:12px;height:22px">${esc(blockTypeLabel(eff))}</span>`,
    sub: loc ? `Main location: ${esc(loc)}` : 'No locations patched yet',
    actions:`<button data-open-kind="DIM" data-open-id="${esc(lk.dimcity)}">${I('chevronLeft',15)}Back to ${esc(lk.dimcity)}</button><button class="danger" data-del-lk="${esc(lk.id)}">${I('trash',15)}Delete LK</button>`
  });
  const slotRows = [1,2,3].map(s=>{
    const st = slotState(lk, s);
    const v = lk.veam?.[s];
    const uses = v ? (MODEL.veamUse.get(v)||[]) : [];
    const tag = eff==='XLR12' ? (v ? '<span class="tag yellow">Ignored</span>' : '<span class="tag">Unused</span>')
      : st.disabled ? '<span class="tag">Full</span>'
      : !v ? '<span class="tag">Free</span>'
      : !MODEL.byVeam.has(v) ? '<span class="tag yellow">Missing</span>'
      : uses.length>1 ? '<span class="tag red">Duplicate</span>' : '<span class="tag green">Linked</span>';
    return `<div class="slot-row"><div class="slot-name"><b>${SLOT_META[s].name}</b><span>${SLOT_META[s].range}</span></div><div>${tag}</div><div>${veamSlotSelectHtml(lk, s, 'lkVeamSlot')}</div><div class="subtle" style="font-size:12px">${esc(st.reason || (v && MODEL.byVeam.has(v) ? `${veamAutoLocation(MODEL.byVeam.get(v)) || ''}` : ''))}${v && MODEL.byVeam.has(v) ? ` <a data-open-kind="VEAM" data-open-id="${esc(v)}">Open ${esc(v)}</a>` : ''}</div></div>`;
  }).join('');
  const config = `<div style="display:grid;grid-template-columns:150px minmax(0,360px);gap:12px;align-items:center;margin-bottom:6px"><b>Block type</b>${blockTypeSelectHtml(lk, 'lkBlockType')}</div>
    <div class="hint" style="margin:0 0 10px 162px">Auto-detect picks 12× XLR when more than 4 LK ports are patched.</div>
    ${slotRows}`;
  root.innerHTML = `<div class="stack">
    ${iss.length ? `<div class="card"><ul class="issue-list">${iss.map(issueItemHtml).join('')}</ul></div>` : ''}
    ${card({ key:'lk-config', title:'Configuration', icon:'sliders', collapsible:false, body:config })}
    ${card({ key:'lk-visual', title:'Port layout', icon:'grid', collapsible:false, body:`<div class="lk-mini-card" style="--dim-color:${dimColor(lk.dimcity)}">${renderLkVisual(lk)}</div>` })}
    ${card({ key:'lk-ports', title:'Ports', icon:'table', collapsible:false, body:mergedPortsTable(lk), flush:true })}
  </div>`;
  bindLkControls(root, ()=>renderLKDetail(id));
  bindDeleteButtons($('#lkHeader'));
}

// ---- Veam pagina ----
function renderVeamDetail(vid){
  const root = $('#lkDetail');
  const ve = MODEL.byVeam.get(vid);
  if(!ve){ pageHead({ title: esc(vid || 'Veam') }); root.innerHTML = '<div class="card"><div class="empty"><p>This Veam no longer exists.</p></div></div>'; return; }
  const loc = veamAutoLocation(ve) || '';
  const uses = MODEL.veamUse.get(ve.id)||[];
  pageHead({
    crumbs:`<a data-nav-view="HOME">Overview</a>${I('chevronRight',12)}<a data-open-kind="DIM" data-open-id="${esc(ve.dimcity)}">${esc(ve.dimcity)}</a>${I('chevronRight',12)}<span>Veam</span>`,
    title:`${esc(ve.id)} ${veamLinkBadge(ve.id)}`,
    sub: loc ? `Main location: ${esc(loc)}` : 'No locations patched yet',
    actions:`<button data-open-kind="DIM" data-open-id="${esc(ve.dimcity)}">${I('chevronLeft',15)}Back to ${esc(ve.dimcity)}</button><button class="danger" data-del-veam="${esc(ve.id)}">${I('trash',15)}Delete Veam</button>`
  });
  const onSock = veamSockets().get(ve.id);
  const link = (uses.length===0 && onSock)
    ? `<div class="empty" style="padding:20px"><p>${esc(ve.id)} is patched on <b>${esc(onSock)}</b> of the rack, so it does not need to be linked to an LK.</p></div>`
    : uses.length===0
    ? `<div class="empty" style="padding:20px"><p>This Veam is not linked to an LK yet. Open an LK in ${esc(ve.dimcity)} and pick ${esc(ve.id)} in one of its Veam slots.</p></div>`
    : `<table class="data-table"><thead><tr><th>LK</th><th>Slot</th><th>LK ports</th><th></th></tr></thead><tbody>${uses.map(u=>`<tr><td><b>${esc(u.lkId)}</b></td><td>${SLOT_META[u.slot].name}</td><td>${SLOT_META[u.slot].range}</td><td class="num"><button class="sm ghost" data-open-kind="LK" data-open-id="${esc(u.lkId)}">Open ${I('arrowRight',13)}</button></td></tr>`).join('')}</tbody></table>${uses.length>1?'<div class="hint" style="padding:0 16px 12px;color:var(--red)">A Veam can only be connected to one LK slot. Remove the extra links.</div>':''}`;
  const rows = [1,2,3,4].map(p=>{
    const L = ve.lines.find(x=>x.port===p) || {universe:null,dest:'',status:'YELLOW'};
    return `<tr><td class="num">${p}</td><td class="num">${L.universe ?? ''}</td><td>${esc(L.dest||'')}</td><td>${statusDot(L.status)}</td></tr>`;
  }).join('');
  const iss = (MODEL.issues||[]).filter(i=>i.ref?.id===ve.id);
  root.innerHTML = `<div class="stack">
    ${iss.length ? `<div class="card"><ul class="issue-list">${iss.map(issueItemHtml).join('')}</ul></div>` : ''}
    ${card({ key:'ve-link', title:'Linked LK', icon:'box', collapsible:false, body:link, flush:true })}
    ${card({ key:'ve-ports', title:'Ports', icon:'grid', collapsible:false, body:`<div class="lk-mini-card" style="--dim-color:${dimColor(ve.dimcity)}"><div class="lk-visual">${veamPortsHtml(ve)}</div></div><div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th class="num">Port</th><th class="num">Universe</th><th>Location</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` })}
  </div>`;
  bindDeleteButtons($('#lkHeader'));
}
// Verwijderknoppen (LK-/Veam-pagina en inline LK-paneel)
function bindDeleteButtons(root){
  if(!root) return;
  root.querySelectorAll('[data-del-lk]').forEach(b => b.onclick = e => { e.stopPropagation(); deleteLK(b.dataset.delLk); });
  root.querySelectorAll('[data-del-veam]').forEach(b => b.onclick = e => { e.stopPropagation(); deleteVeam(b.dataset.delVeam); });
}

// ---- Gedelegeerde klikken binnen de view en de zijbalk ----
function handleNavClick(e){
  const fixBtn = e.target.closest('[data-fix-issue]');
  if(fixBtn){ e.stopPropagation(); window.IssueFix?.open?.(MODEL.issues[Number(fixBtn.dataset.fixIssue)]); return; }
  const issueEl = e.target.closest('li[data-issue]');
  if(issueEl && !e.target.closest('button,a,select,input')){ window.IssueFix?.go?.(MODEL.issues[Number(issueEl.dataset.issue)]); return; }
  const t = e.target.closest('[data-open-kind],[data-nav-view],[data-view],[data-cmd],[data-collapse]');
  if(!t) return;
  if(t.matches('select,input')) return;
  if(t.dataset.collapse){
    e.stopPropagation();
    if(!MODEL.ui.cardCollapsed) MODEL.ui.cardCollapsed = {};
    const cardEl = t.closest('.card');
    const now = !cardEl.classList.contains('collapsed');
    cardEl.classList.toggle('collapsed', now);
    MODEL.ui.cardCollapsed[t.dataset.collapse] = now;
    return;
  }
  if(t.dataset.openKind){ e.stopPropagation(); openEntity(t.dataset.openKind, t.dataset.openId); return; }
  if(t.dataset.navView){ navigate(t.dataset.navView); return; }
  if(t.dataset.view){ navigate(t.dataset.view); return; }
  if(t.dataset.cmd){ runCommand(t.dataset.cmd, t.dataset.arg); }
}

// ===== File: Imported CSV files modal =====
function showCsvSourcesModal(){
  const sources = Array.isArray(MODEL.csvSources) ? MODEL.csvSources : [];
  const fmt = iso => iso ? new Date(iso).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' }) : '—';
  const body = sources.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>File</th><th class="num">Rows</th><th>Imported</th><th>Updated</th><th></th></tr></thead><tbody>${sources.map(src=>`<tr>
        <td>${I('file',14)} <b>${esc(src.name || shortFileName(src.path))}</b><div class="subtle" style="font-size:11.5px">${esc(src.path || '')}</div></td>
        <td class="num">${src.rowCount || (src.rows?.length || 0)}</td><td class="subtle">${fmt(src.importedAt)}</td><td class="subtle">${fmt(src.updatedAt)}</td>
        <td class="num" style="white-space:nowrap"><button class="sm csv-replace" data-source-id="${esc(src.id)}">${I('refresh',13)}Replace</button> <button class="sm danger csv-remove" data-source-id="${esc(src.id)}">${I('trash',13)}Remove</button></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">${I('file',30)}<h3>No CSV files imported</h3><p>Imported files are stored inside the project, so you can replace them when the source changes.</p></div>`;
  const d = openDialog({
    title:'Imported Files', subtitle:'Use Replace when a source CSV has been updated, or Remove to drop it from the project. Veam links and block types are kept.',
    width:'860px', body,
    footer:`<button data-act="import">${I('upload',14)}Import Another CSV</button><button class="primary" data-act="close">Done</button>`
  });
  d.footer.querySelector('[data-act=close]').onclick = d.close;
  d.footer.querySelector('[data-act=import]').onclick = ()=>{ d.close(); window.startImportCsv?.(); };
  d.body.querySelectorAll('.csv-replace').forEach(btn=>{
    btn.onclick = async ()=>{
      const src = sources.find(s=>s.id===btn.dataset.sourceId);
      if(!src) return;
      const ok = await confirmDialog({ title:`Replace ${src.name || shortFileName(src.path)}?`, message:'Rows from this file will be replaced by the new import. Manual edits to these rows are overwritten. Veam links, block types and manual rows are kept.', okLabel:'Choose New File' });
      if(!ok) return;
      d.close();
      await window.startImportCsv?.({ replaceSourceId:src.id, sourceName:src.name || shortFileName(src.path) });
    };
  });
  d.body.querySelectorAll('.csv-remove').forEach(btn=>{
    btn.onclick = async ()=>{
      const src = sources.find(s=>s.id===btn.dataset.sourceId);
      if(!src) return;
      const name = src.name || shortFileName(src.path);
      const ok = await confirmDialog({ title:`Remove ${name}?`, message:`All ${plural(src.rowCount || (src.rows?.length || 0), 'row')} from this file are removed from the project. Manual rows, Veam links and block types are kept.`, okLabel:'Remove File', danger:true });
      if(!ok) return;
      MODEL.csvSources = (MODEL.csvSources || []).filter(s=>s.id !== src.id);
      await rebuildFromCsvSources();
      MODEL.ui.dirty = true;
      d.close();
      renderAll();
      toast(`${name} removed`);
      showCsvSourcesModal();
    };
  });
}

// ===== Network Devices: data helpers =====
function normalizeNetworkDevices(net){
  const base = { prefs:{ nodeSparePorts:0, splitterSparePorts:0, switchSparePorts:0, fent:{ on:false, group:'production', scan:false, vlanMode:'luminex' } }, nodeTypes:[], splitterTypes:[], switchTypes:[], panelTypes:[], rackTypes:[], cableTypes:[], fiberLinks:[], nodes:[], splitters:[], switches:[], dimCityPlans:{} };
  if(!net || typeof net !== 'object') return base;

  const nodeTypes = Array.isArray(net.nodeTypes) ? net.nodeTypes.slice() : [];
  const splitterTypes = Array.isArray(net.splitterTypes) ? net.splitterTypes.slice() : [];

  // Migration from V2: old created nodes/splitters can also appear as reusable types.
  if(!nodeTypes.length && Array.isArray(net.nodes)){
    for(const n of net.nodes){
      nodeTypes.push({
        id: n.typeId || n.id || nextNetworkId('NT', nodeTypes),
        name: n.name || n.brand || n.id || 'DMX Node',
        brand: n.brand || '',
        usageType: n.usageType || '',
        portCount: Number(n.portCount || 8),
        defaultIp: n.ip || '',
        subnet: n.subnet || '255.255.255.0',
        color: n.color || '#4ea8ff'
      });
    }
  }
  if(!splitterTypes.length && Array.isArray(net.splitters)){
    for(const sp of net.splitters){
      splitterTypes.push({
        id: sp.typeId || sp.id || nextNetworkId('ST', splitterTypes),
        name: sp.name || sp.brand || sp.id || 'DMX Splitter',
        brand: sp.brand || '',
        mode: sp.mode || 'A',
        inputs: Number(sp.inputs || (sp.mode === 'AB' ? 2 : 1)),
        outputCount: Number(sp.outputCount || sp.outputsA || 10),
        switching: sp.switching || (sp.pairedSwitching ? 'paired' : 'independent'),
        pairSize: Number(sp.pairSize || 2),
        color: sp.color || '#FFC107'
      });
    }
  }

  const plans = (net.dimCityPlans && typeof net.dimCityPlans === 'object' && !Array.isArray(net.dimCityPlans)) ? net.dimCityPlans : {};
  return {
    prefs: {
      nodeSparePorts: Number(net.prefs?.nodeSparePorts ?? 0),
      splitterSparePorts: Number(net.prefs?.splitterSparePorts ?? 0),
      switchSparePorts: Number(net.prefs?.switchSparePorts ?? 0),
      fent: { on:!!net.prefs?.fent?.on, group:net.prefs?.fent?.group === 'location' ? 'location' : 'production', scan:!!net.prefs?.fent?.scan, vlanMode:net.prefs?.fent?.vlanMode === 'fent' ? 'fent' : 'luminex', vlanNames:(net.prefs?.fent?.vlanNames && typeof net.prefs.fent.vlanNames === 'object') ? { ...net.prefs.fent.vlanNames } : {}, vlanColors:(net.prefs?.fent?.vlanColors && typeof net.prefs.fent.vlanColors === 'object') ? { ...net.prefs.fent.vlanColors } : {}, customVlans:Array.isArray(net.prefs?.fent?.customVlans) ? net.prefs.fent.customVlans.map(v => ({ ...v })) : [] }
    },
    nodeTypes,
    splitterTypes,
    switchTypes: Array.isArray(net.switchTypes) ? net.switchTypes : [],
    panelTypes: Array.isArray(net.panelTypes) ? net.panelTypes : [],
    rackTypes: Array.isArray(net.rackTypes) ? net.rackTypes : [],
    cableTypes: Array.isArray(net.cableTypes) ? net.cableTypes : [],
    fiberLinks: Array.isArray(net.fiberLinks) ? net.fiberLinks : [], fiberStock: Array.isArray(net.fiberStock) ? net.fiberStock : [],
    nodes: Array.isArray(net.nodes) ? net.nodes : [],
    splitters: Array.isArray(net.splitters) ? net.splitters : [],
    switches: Array.isArray(net.switches) ? net.switches : [],
    dimCityPlans: plans
  };
}
function nextNetworkId(prefix, list){
  const nums = (list||[]).map(x=>String(x.id||'').match(new RegExp(`^${prefix}(\\d+)$`))).filter(Boolean).map(m=>Number(m[1]));
  const n = nums.length ? Math.max(...nums)+1 : 1;
  return `${prefix}${String(n).padStart(2,'0')}`;
}

function nextTypedId(prefix, list){
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp('^' + escaped + '([0-9]+)$', 'i');
  const nums = (list||[]).map(x=>String(x.id||'').match(rx)).filter(Boolean).map(m=>Number(m[1]));
  const n = nums.length ? Math.max(...nums)+1 : 1;
  return `${prefix}${String(n).padStart(2,'0')}`;
}
function sanitizeIpv4Value(value){
  let clean = String(value || '').replace(/[^0-9.]/g, '');
  clean = clean.replace(/\.{2,}/g, '.');
  const parts = clean.split('.').slice(0,4).map(part=>{
    part = part.slice(0,3);
    if(part === '') return part;
    const n = Math.min(255, Number(part));
    return Number.isFinite(n) ? String(n) : '';
  });
  return parts.join('.');
}
function isValidIpv4(value, allowEmpty=false){
  const v = String(value || '').trim();
  if(!v) return !!allowEmpty;
  const parts = v.split('.');
  if(parts.length !== 4) return false;
  return parts.every(p=>/^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}
function bindIpv4Input(input, allowEmpty=false){
  if(!input) return;
  const update = ()=>{
    const pos = input.selectionStart;
    input.value = sanitizeIpv4Value(input.value);
    input.classList.toggle('invalid', !isValidIpv4(input.value, allowEmpty));
    try{ input.setSelectionRange(pos, pos); }catch(_e){}
  };
  input.addEventListener('input', update);
  input.addEventListener('blur', update);
  update();
}
function nodeInstanceIpFromType(nt, index){
  const base = String(nt?.defaultIp || '').trim();
  if(!isValidIpv4(base, true) || !base) return '';
  const parts = base.split('.').map(Number);
  parts[3] = Math.min(254, Math.max(1, parts[3] + Number(index || 0)));
  return parts.join('.');
}
function uniqueUniversesInDim(dc){
  const stat = MODEL.uniStats?.get(dc);
  if(!stat || !stat.counts) return [];
  return [...stat.counts.keys()].map(x=>Number(x)).filter(Number.isFinite).sort((a,b)=>a-b);
}
function calculateNodeNeedForDim(dc, nodePorts){
  const universes = uniqueUniversesInDim(dc);
  const spare = Number(MODEL.networkDevices?.prefs?.nodeSparePorts || 0);
  const usable = Math.max(1, Number(nodePorts || 1) - spare);
  return { universeCount: universes.length, nodeCount: Math.ceil(universes.length / usable), usablePorts: usable, sparePorts: spare };
}
function devicePortHtml(label, title='', bus='', cls=''){
  return `<span class="device-port ${cls}" ${bus?`data-bus="${bus}"`:''} title="${esc(title || label)}">${esc(label)}</span>`;
}
// Aantal RJ45-poorten op een nodetype (1 of 2); oudere types hebben het veld niet
function nodeEthernetPorts(nt){
  const n = Number(nt?.ethernetCount);
  return Number.isFinite(n) ? Math.min(2, Math.max(1, n)) : 1;
}
function dimNumber(dc){
  const m = String(dc || '').match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}
function dimDeviceNumber(dc, index){
  const d = dimNumber(dc);
  if(d <= 1) return index + 1;
  return d * 10 + index + 1;
}
function formatNodeId(dc, index){
  return `ID:${String(dimDeviceNumber(dc, index)).padStart(2,'0')}`;
}
function formatSplitterId(dc, index){
  return `SP:${String(dimDeviceNumber(dc, index)).padStart(2,'0')}`;
}
function ipWithLastOctet(ip, last){
  if(!isValidIpv4(ip, true) || !ip) return '';
  const parts = String(ip).split('.').map(Number);
  parts[3] = Math.max(1, Math.min(254, Number(last || 1)));
  return parts.join('.');
}
function segmentFromDim(dc){
  const d = dimNumber(dc);
  return d || 1;
}
function rowsForDimUniverse(dc, uni){
  const s = String(uni);
  return []
    .concat(MODEL.lines.filter(L=>L.dimcity===dc && String(L.universe)===s).map(L=>({type:'LK', id:L.id, port:L.port, dest:L.dest||''})))
    .concat(MODEL.veamLines.filter(V=>V.dimcity===dc && String(V.universe)===s).map(V=>({type:'Veam', id:V.id, port:V.port, dest:V.dest||''})))
    .concat((MODEL.dmxLoose||[]).filter(D=>D.dimcity===dc && String(D.universe)===s).map(D=>({type:'DMX', id:'Loose DMX', port:'—', dest:D.dest||''})));
}
function dimUniversePointCounts(dc){
  const stat = MODEL.uniStats?.get(dc);
  if(!stat || !stat.counts) return [];
  return [...stat.counts.entries()].map(([u,c])=>({
    universe:Number(u),
    patchPoints:Number(c.lk||0)+Number(c.veam||0)+Number(c.dmx||0),
    lk:Number(c.lk||0), veam:Number(c.veam||0), dmx:Number(c.dmx||0)
  })).filter(x=>Number.isFinite(x.universe)).sort((a,b)=>a.universe-b.universe);
}
function veamPortForLkPort(lk, lkPort){
  const p = Number(lkPort);
  const slot = p<=4 ? 1 : p<=8 ? 2 : 3;
  const vp = ((p-1) % 4) + 1;
  // In 12× XLR-modus worden Veam-koppelingen genegeerd (alleen LK-poorten tellen).
  const vid = effectiveBlockType(lk) === 'XLR12' ? null : (lk.veam?.[slot] || null);
  return { slot, veamId:vid, veamPort:vp, rec: vid ? veamPortRecord(vid, vp) : null };
}
function mergedPortRecord(lk, lkPort){
  const lkRec = lkLineForPort(lk, lkPort);
  const ve = veamPortForLkPort(lk, lkPort);
  const veRec = ve.rec;
  const lkHas = lkRec && lkRec.universe != null && lkRec.universe !== '';
  const veHas = veRec && veRec.universe != null && veRec.universe !== '';
  const conflict = lkHas && veHas && String(lkRec.universe) !== String(veRec.universe);
  const universe = lkHas ? lkRec.universe : (veHas ? veRec.universe : null);
  const dest = lkRec?.dest || veRec?.dest || '';
  const source = lkHas && veHas ? 'LK+Veam' : lkHas ? 'LK' : veHas ? 'Veam' : '';
  return { lkRec, ve, veRec, universe, dest, source, conflict, status: conflict ? 'RED' : (lkRec?.status || veRec?.status || 'YELLOW') };
}
function renderCombinedPortCells(lk, ports){
  return ports.map(p=>{
    const m = mergedPortRecord(lk, p);
    const filled = m.universe != null && m.universe !== '';
    const titleParts = [`${lk.id} port ${p}`];
    if(m.ve.veamId) titleParts.push(`Veam ${m.ve.slot}: ${m.ve.veamId} port ${m.ve.veamPort}`);
    if(filled) titleParts.push(`UNI ${m.universe}`);
    if(m.dest) titleParts.push(m.dest);
    if(m.conflict) titleParts.push('CONFLICT: LK and Veam universe differ');
    return `<div class="lk-port-cell ${filled?'filled':''} ${m.conflict?'conflict':''}" data-port="${p}" title="${esc(titleParts.join(' • '))}"><div class="pnum">${p}</div><div class="puniverse">${filled?`UNI ${esc(m.universe)}`:'—'}</div><div class="pdest">${esc(m.dest || '')}</div><div class="psource">${esc(m.source || '')}</div></div>`;
  }).join('');
}
function createNodeInstance(dc, nt, index, universes=[]){
  const num = dimDeviceNumber(dc, index);
  return {
    id: formatNodeId(dc, index),
    name: `${dc} ${nt.brand || 'Node'} ${nt.name || nt.id} ${String(index+1).padStart(2,'0')}`,
    typeId: nt.id,
    deviceNo: num,
    segment: segmentFromDim(dc),
    ip: ipWithLastOctet(nt.defaultIp || '', num),
    subnet: nt.subnet || '255.255.255.0',
    universes: Array.isArray(universes) ? universes.slice() : []
  };
}
function createSplitterInstance(dc, sp, index, universes=[]){
  const num = dimDeviceNumber(dc, index);
  return {
    id: formatSplitterId(dc, index),
    name: `${dc} ${sp.brand || 'Splitter'} ${sp.name || sp.id} ${String(index+1).padStart(2,'0')}`,
    typeId: sp.id,
    deviceNo: num,
    segment: segmentFromDim(dc),
    ip: ipWithLastOctet(sp.defaultIp || '', num),
    subnet: sp.subnet || '',
    universes: Array.isArray(universes) ? universes.slice() : []
  };
}
function refreshDimDeviceIdentity(dc){
  const plan = getDimPlan(dc);
  plan.nodes.forEach((n,idx)=>{
    const nt = MODEL.networkDevices.nodeTypes.find(x=>x.id===n.typeId);
    const num = dimDeviceNumber(dc, idx);
    n.deviceNo = num;
    n.segment = segmentFromDim(dc);
    if(!n.id || /^ID:\d+/i.test(n.id)) n.id = formatNodeId(dc, idx);
    if(nt && !n.ip) n.ip = ipWithLastOctet(nt.defaultIp || '', num);
    if(nt && !n.subnet) n.subnet = nt.subnet || '255.255.255.0';
  });
  plan.splitters.forEach((s,idx)=>{
    const sp = MODEL.networkDevices.splitterTypes.find(x=>x.id===s.typeId);
    const num = dimDeviceNumber(dc, idx);
    s.deviceNo = num;
    s.segment = segmentFromDim(dc);
    if(!s.id || /^SP:\d+/i.test(s.id)) s.id = formatSplitterId(dc, idx);
    if(sp && !s.ip) s.ip = ipWithLastOctet(sp.defaultIp || '', num);
    if(sp && !s.subnet) s.subnet = sp.subnet || '';
  });
}
function splitCalcForDim(dc, splitterTypeId){
  const sp = MODEL.networkDevices.splitterTypes.find(x=>x.id===splitterTypeId) || MODEL.networkDevices.splitterTypes[0];
  const spare = Number(MODEL.networkDevices?.prefs?.splitterSparePorts || 0);
  if(!sp) return { splitterCount:0, details:[], capacity:0, buses:1 };
  const buses = sp.mode === 'AB' ? 2 : 1;
  const totalOutputs = Math.max(1, Number(sp.outputCount || 1));
  const capacity = Math.max(1, totalOutputs - spare);
  const perUni = dimUniversePointCounts(dc);
  // Conservative: per universe output count is calculated separately. AB splitters can carry two universes, so two universe plans can share one physical splitter.
  const requiredFeeds = perUni.reduce((sum,u)=>sum + Math.max(1, Math.ceil(u.patchPoints / capacity)), 0);
  const splitterCount = Math.ceil(requiredFeeds / buses);
  return { splitterCount, details:perUni.map(u=>({...u, splitters:Math.max(1, Math.ceil(u.patchPoints / capacity))})), capacity, buses, type:sp };
}
function openPortUniversePicker(dc, nodeIndex, portIndex){
  const plan = getDimPlan(dc);
  const n = plan.nodes[nodeIndex];
  if(!n) return;
  const universes = uniqueUniversesInDim(dc);
  const bd = document.createElement('div');
  bd.className = 'mini-modal-backdrop';
  bd.innerHTML = `<div class="mini-modal" style="width:420px"><div class="mini-modal-head"><div><b>Assign universe</b><div class="subtle" style="font-size:12px">${esc(n.id || n.name)} · port ${portIndex+1}</div></div><button id="miniClose" class="ghost icon-only">${I('x',16)}</button></div><div class="universe-picker"><button class="pick-empty">Empty</button>${universes.map(u=>`<button class="pick-uni" data-uni="${u}">UNI ${u}</button>`).join('')}</div></div>`;
  document.body.appendChild(bd);
  bd.querySelector('#miniClose').onclick=()=>bd.remove();
  bd.addEventListener('mousedown', e=>{ if(e.target===bd) bd.remove(); });
  bd.querySelector('.pick-empty').onclick=()=>{ n.universes[portIndex]=null; MODEL.ui.dirty=true; bd.remove(); renderDimCityDetail(dc); };
  bd.querySelectorAll('.pick-uni').forEach(btn=>btn.onclick=()=>{ n.universes[portIndex]=Number(btn.dataset.uni); MODEL.ui.dirty=true; bd.remove(); renderDimCityDetail(dc); });
}
function openInlineState(dc, key, id){
  if(!MODEL.ui.dimInline) MODEL.ui.dimInline = {};
  if(!MODEL.ui.dimInline[dc]) MODEL.ui.dimInline[dc] = { lks:{}, veams:{} };
  const group = key === 'lk' ? MODEL.ui.dimInline[dc].lks : MODEL.ui.dimInline[dc].veams;
  group[id] = !group[id];
}
function isInlineOpen(dc, key, id){
  return !!MODEL.ui.dimInline?.[dc]?.[key === 'lk' ? 'lks' : 'veams']?.[id];
}
function setAllInline(dc, open){
  if(!MODEL.ui.dimInline) MODEL.ui.dimInline = {};
  MODEL.ui.dimInline[dc] = { lks:{}, veams:{} };
  for(const lk of [...MODEL.byLK.values()].filter(x=>x.dimcity===dc)) MODEL.ui.dimInline[dc].lks[lk.id] = !!open;
  for(const ve of [...MODEL.byVeam.values()].filter(x=>x.dimcity===dc)) MODEL.ui.dimInline[dc].veams[ve.id] = !!open;
}
function renderNodeInstanceFace(nodeType, inst, nodeIndex, dc){
  const ports = Number(nodeType.portCount || 0);
  const color = safeHex(nodeType.color || '#4ea8ff');
  const assigned = Array.isArray(inst.universes) ? inst.universes : [];
  let html = '';
  for(let i=1;i<=ports;i++){
    const u = assigned[i-1];
    const empty = (u == null || u === '');
    html += `<span class="device-port assignable ${empty?'empty':''}" draggable="false" data-node-index="${nodeIndex}" data-port-index="${i-1}" data-dc="${esc(dc||'')}" title="${empty ? `Port ${i} empty` : `Port ${i} • Universe ${u}`}">${esc(empty?'—':`UNI ${u}`)}</span>`;
  }
  // netwerkaansluitingen: 1 of 2 RJ45 (link + redundant / daisy chain)
  const eth = nodeEthernetPorts(nodeType);
  const ethHtml = Array.from({ length:eth }, (_, i) => devicePortHtml(eth > 1 ? `LAN ${i+1}` : 'LAN', eth > 1 ? `Network port ${i+1}${i ? ' (redundant / daisy chain)' : ''}` : 'Network port', '', 'small rj'));
  return `<div class="device-face node-instance-face" style="--device-color:${color}"><div class="device-face-title"><b>${esc(nodeType.brand || 'DMX Node')} ${esc(nodeType.name || nodeType.id || '')}</b><span>${ports} universe ports · ${eth}× RJ45</span></div><div class="device-ports node-port-row">${html}<span class="device-port-sep"></span>${ethHtml.join('')}</div></div>`;
}
function renderSplitterTypeFace(sp){
  const count = Number(sp.outputCount || 0);
  const paired = sp.switching === 'paired';
  const pairSize = Math.max(2, Number(sp.pairSize || 2));
  const color = safeHex(sp.color || '#FFC107');
  let html = '';
  if(paired){
    for(let i=1;i<=count;i+=pairSize){
      let pair = '';
      for(let j=0;j<pairSize && i+j<=count;j++){
        const n = i+j;
        pair += devicePortHtml(String(n), `Output ${n} • paired selector group ${Math.ceil(i/pairSize)}`, '', 'small');
      }
      html += `<span class="pair-wrap" title="Paired selector group ${Math.ceil(i/pairSize)}"><span class="muted" style="font-size:10px;padding-left:4px">A/B</span>${pair}</span>`;
    }
  } else {
    for(let i=1;i<=count;i++) html += devicePortHtml(String(i), `Output ${i}`, '', 'small');
  }
  const mode = sp.mode === 'AB' ? 'A/B input' : 'Single input';
  return `<div class="device-face compact" style="--device-color:${color}"><div class="device-face-title"><b>${esc(sp.brand || 'Splitter')} ${esc(sp.name || sp.id || '')}</b><span>${mode} • ${count} outputs${paired?' • paired per 2':''}</span></div><div class="device-ports">${html}</div></div>`;
}
function getDimPlan(dc){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  if(!MODEL.networkDevices.dimCityPlans[dc]){
    MODEL.networkDevices.dimCityPlans[dc] = { nodeTypeId:'', splitterTypeIds:[], nodes:[], splitters:[], switches:[] };
  }
  const plan = MODEL.networkDevices.dimCityPlans[dc];
  if(!Array.isArray(plan.splitterTypeIds)) plan.splitterTypeIds = [];
  if(!Array.isArray(plan.nodes)) plan.nodes = [];
  if(!Array.isArray(plan.splitters)) plan.splitters = [];
  if(!Array.isArray(plan.switches)) plan.switches = [];
  return plan;
}
function autoAssignDimCityNodes(dc, nodeTypeId){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const nt = MODEL.networkDevices.nodeTypes.find(x=>x.id===nodeTypeId) || MODEL.networkDevices.nodeTypes[0];
  if(!nt) return null;
  const universes = uniqueUniversesInDim(dc);
  const portCount = Math.max(1, Number(nt.portCount || 1));
  const spare = Math.max(0, Number(MODEL.networkDevices.prefs.nodeSparePorts || 0));
  const usable = Math.max(1, portCount - spare);
  const plan = getDimPlan(dc);
  plan.nodeTypeId = nt.id;
  plan.nodes = [];
  // Universes laag→hoog, per node `usable` poorten gevuld; de rest blijft reserve.
  for(let i=0; i<Math.max(1, universes.length); i+=usable){
    const chunk = universes.slice(i, i+usable);
    while(chunk.length < portCount) chunk.push(null);
    plan.nodes.push(createNodeInstance(dc, nt, plan.nodes.length, chunk));
  }
  refreshDimDeviceIdentity(dc);
  MODEL.ui.dirty = true;
  return plan;
}
function addSplitterToDimCity(dc, splitterTypeId){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const sp = MODEL.networkDevices.splitterTypes.find(x=>x.id===splitterTypeId) || MODEL.networkDevices.splitterTypes[0];
  if(!sp) return null;
  const plan = getDimPlan(dc);
  const inst = createSplitterInstance(dc, sp, plan.splitters.length, []);
  inst.portAssignments = Array.from({ length: Math.max(1, Number(sp.outputCount||1)) }, ()=>null);
  plan.splitters.push(inst);
  refreshDimDeviceIdentity(dc);
  MODEL.ui.dirty = true;
  return plan;
}
function patchPointsForDim(dc){
  const out = [];
  for(const L of (MODEL.lines||[])) if(L.dimcity===dc && L.universe!=null && L.universe!=='') out.push({kind:'LK', id:L.id, port:L.port, universe:Number(L.universe), dest:L.dest||''});
  for(const V of (MODEL.veamLines||[])) if(V.dimcity===dc && V.universe!=null && V.universe!=='') out.push({kind:'Veam', id:V.id, port:V.port, universe:Number(V.universe), dest:V.dest||''});
  for(const D of (MODEL.dmxLoose||[])) if(D.dimcity===dc && D.universe!=null && D.universe!=='') out.push({kind:'DMX', id:'Loose DMX', port:'—', universe:Number(D.universe), dest:D.dest||''});
  return out.sort((a,b)=>a.universe-b.universe || String(a.id).localeCompare(String(b.id), undefined, {numeric:true}) || Number(a.port||0)-Number(b.port||0));
}
// Single input = 1 universe feed per splitter; A/B input = max. 2 universe feeds per splitter.
// Elke patch point krijgt een splitter-output; reserve-outputs blijven leeg.
function autoAddSplittersForDim(dc, splitterTypeId){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const sp = MODEL.networkDevices.splitterTypes.find(x=>x.id===splitterTypeId) || MODEL.networkDevices.splitterTypes[0];
  if(!sp) return null;
  const outCount = Math.max(1, Number(sp.outputCount || 1));
  const usable = Math.max(1, outCount - Math.max(0, Number(MODEL.networkDevices.prefs.splitterSparePorts || 0)));
  const buses = sp.mode === 'AB' ? 2 : 1;
  const points = patchPointsForDim(dc);
  const universes = [...new Set(points.map(p=>p.universe))].sort((a,b)=>a-b);
  const plan = getDimPlan(dc);
  plan.lastSplitterTypeId = sp.id;
  plan.splitters = [];
  for(let u=0; u<universes.length; u+=buses){
    const feed = universes.slice(u, u+buses);
    const feedPoints = points.filter(p=>feed.includes(p.universe));
    let cursor = 0;
    do {
      const inst = createSplitterInstance(dc, sp, plan.splitters.length, []);
      inst.portAssignments = Array.from({ length: outCount }, (_, i)=> i < usable && cursor < feedPoints.length ? feedPoints[cursor++] : null);
      inst.inputUniverses = feed;
      inst.universes = [...new Set(inst.portAssignments.filter(Boolean).map(x=>x.universe))];
      plan.splitters.push(inst);
    } while(cursor < feedPoints.length);
  }
  refreshDimDeviceIdentity(dc);
  MODEL.ui.dirty = true;
  return plan;
}
function splitterPortMapHtml(sp, inst){
  const count = Math.max(1, Number(sp.outputCount || inst.portAssignments?.length || 1));
  const assigns = Array.isArray(inst.portAssignments) ? inst.portAssignments : [];
  const feed = (inst.inputUniverses || inst.universes || []).map(u=>`UNI ${u}`).join(' / ') || 'not assigned';
  const ports = Array.from({ length: count }, (_, i)=>{
    const a = assigns[i];
    if(!a) return `<div class="split-map-port spare"><b>${i+1}</b><span>Spare</span></div>`;
    return `<div class="split-map-port" style="--uni:${uniHue(a.universe)}" title="UNI ${esc(a.universe)} • ${esc(a.kind)} ${esc(a.id)} P${esc(a.port)} • ${esc(a.dest)}"><b>${i+1}</b><strong>UNI ${esc(a.universe)}</strong><span>${esc(a.kind)} ${esc(a.id)}${a.port!=='—'?' · P'+esc(a.port):''}</span><em>${esc(a.dest||'')}</em></div>`;
  }).join('');
  return `<div class="splitter-port-map"><div class="split-feed-line"><b>Input feed:</b> ${esc(feed)} <span class="subtle">(${sp.mode==='AB'?'A/B input':'single input'})</span></div>${ports}</div>`;
}
function renderDimNetworkDevices(dc){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const nd = MODEL.networkDevices;
  const plan = getDimPlan(dc);
  refreshDimDeviceIdentity(dc);
  const universes = uniqueUniversesInDim(dc);
  const nodeTypeOptions = nd.nodeTypes.map(nt=>`<option value="${esc(nt.id)}" ${plan.nodeTypeId===nt.id?'selected':''}>${esc([nt.brand, nt.name || nt.id].filter(Boolean).join(' '))} · ${Number(nt.portCount||0)} ports</option>`).join('');
  const splitterTypeOptions = nd.splitterTypes.map(sp=>`<option value="${esc(sp.id)}" ${plan.lastSplitterTypeId===sp.id?'selected':''}>${esc([sp.brand, sp.name || sp.id].filter(Boolean).join(' '))} · ${Number(sp.outputCount||0)} outputs</option>`).join('');
  const selectedSplitter = nd.splitterTypes.find(x=>x.id === plan.lastSplitterTypeId) || nd.splitterTypes[0];
  const splitCalc = selectedSplitter ? splitCalcForDim(dc, selectedSplitter.id) : null;

  const nodeHtml = plan.nodes.map((n,idx)=>{
    const nt = nd.nodeTypes.find(x=>x.id===n.typeId);
    if(!nt) return `<div class="network-instance node-instance" style="--device-color:#ef4444"><div class="network-instance-head"><div><b>${esc(n.id || '')}</b> <span class="muted">${esc(n.name || '')}</span><div class="subtle" style="font-size:12px">${I('alert',13)} Node type ${esc(n.typeId || '?')} is not in this show any more</div></div><button class="sm danger dimRemoveNode" data-node-index="${idx}">${I('trash',13)}Remove</button></div></div>`;
    if(!Array.isArray(n.universes)) n.universes = [];
    return `<div class="network-instance node-instance" style="--device-color:${safeHex(nt.color || '#4c9dff')}">
      <div class="network-instance-head"><div><b>${esc(n.id || '')}</b> <span class="muted">${esc(n.name || '')}</span><div class="subtle" style="font-size:12px">${esc([nt.brand, nt.name || nt.id].filter(Boolean).join(' '))} · segment ${esc(n.segment || '')} · ${Number(nt.portCount||0)} ports</div></div><button class="sm danger dimRemoveNode" data-node-index="${idx}">${I('trash',13)}Remove</button></div>
      <div class="network-instance-fields">
        <label>ID<input class="dimNodeField" data-node-index="${idx}" data-field="id" value="${esc(n.id || '')}"></label>
        <label>Name<input class="dimNodeField" data-node-index="${idx}" data-field="name" value="${esc(n.name || '')}"></label>
        <label>IP address<input class="dimNodeField ipv4" data-node-index="${idx}" data-field="ip" value="${esc(n.ip || '')}" inputmode="numeric" placeholder="192.168.1.10"></label>
        <label>Subnet<input class="dimNodeField ipv4" data-node-index="${idx}" data-field="subnet" value="${esc(n.subnet || nt.subnet || '255.255.255.0')}" inputmode="numeric"></label>
      </div>
      ${window.NodeLink?.selectHtml(dc, idx, n) || ''}
      ${window.FentUI?.deviceBlock(dc, 'node', idx, n) || ''}
      ${renderNodeInstanceFace(nt, n, idx, dc)}
    </div>`;
  }).join('');
  const splitterHtml = plan.splitters.map((inst,idx)=>{
    const sp = nd.splitterTypes.find(x=>x.id===inst.typeId);
    if(!sp) return `<div class="network-instance splitter-instance" style="--device-color:#ef4444"><div class="network-instance-head"><div><b>${esc(inst.id || '')}</b> <span class="muted">${esc(inst.name || '')}</span><div class="subtle" style="font-size:12px">${I('alert',13)} Splitter type ${esc(inst.typeId || '?')} is not in this show any more</div></div><button class="sm danger dimRemoveSplitter" data-splitter-index="${idx}">${I('trash',13)}Remove</button></div></div>`;
    return `<div class="network-instance splitter-instance" style="--device-color:${safeHex(sp.color || '#f2b33d')}">
      <div class="network-instance-head"><div><b>${esc(inst.id || '')}</b> <span class="muted">${esc(inst.name || '')}</span><div class="subtle" style="font-size:12px">${esc([sp.brand, sp.name || sp.id].filter(Boolean).join(' '))} · ${sp.mode==='AB'?'A/B input':'Single input'} · ${Number(sp.outputCount||0)} outputs</div></div><button class="sm danger dimRemoveSplitter" data-splitter-index="${idx}">${I('trash',13)}Remove</button></div>
      <div class="network-instance-fields">
        <label>ID<input class="dimSplitterField" data-splitter-index="${idx}" data-field="id" value="${esc(inst.id || '')}"></label>
        <label>Name<input class="dimSplitterField" data-splitter-index="${idx}" data-field="name" value="${esc(inst.name || '')}"></label>
      </div>
      ${(inst.ip || inst.ifaces?.length) ? (window.FentUI?.deviceBlock(dc, 'splitter', idx, inst) || '') : ''}
      ${Array.isArray(inst.portAssignments) && inst.portAssignments.length ? splitterPortMapHtml(sp, inst) : renderSplitterTypeFace(sp)}
    </div>`;
  }).join('');

  const noLib = !nd.nodeTypes.length || !nd.splitterTypes.length;
  const tools = `<div class="planner-controls">
      <label>Node type<select id="dimNodeType">${nodeTypeOptions || '<option value="">No node types yet</option>'}</select></label>
      <button id="dimAutoAssignNodes" ${nd.nodeTypes.length?'':'disabled'}>${I('refresh',14)}Auto-assign nodes</button>
      <label>Splitter type<select id="dimSplitterType">${splitterTypeOptions || '<option value="">No splitter types yet</option>'}</select></label>
      <button id="dimAutoSplitters" ${nd.splitterTypes.length?'':'disabled'}>${I('refresh',14)}Auto-calculate splitters</button>
      <button id="dimAddSplitter" ${nd.splitterTypes.length?'':'disabled'}>${I('plus',14)}Add one splitter</button>
    </div>
    ${noLib ? `<div class="hint">${I('info',13)} No device types yet. <a data-cmd="nodeBuilder">Create a node type</a> or <a data-cmd="splitterBuilder">a splitter type</a> first.</div>` : ''}
    ${splitCalc ? `<div class="split-calc-box">${I('info',13)} ${esc(selectedSplitter.brand || '')} ${esc(selectedSplitter.name || selectedSplitter.id)}: about <b>${plural(splitCalc.splitterCount,'splitter')}</b> needed · ${splitCalc.capacity} usable outputs per feed · ${plural(splitCalc.buses,'input bus','input buses')}</div>` : ''}`;

  const universePool = universes.map(u=>`<button class="uni-pool-chip" draggable="true" data-uni="${u}" title="Drag onto a node port">UNI ${u}</button>`).join('') || '<span class="subtle">No universes</span>';
  const nodesBody = `${tools}<div class="network-layout" style="margin-top:14px">
      <div class="universe-pool"><div class="network-list-title">Universe pool</div><div class="universe-pool-list">${universePool}</div><div class="hint">Drag a universe onto a node port, or click a port to pick one.</div></div>
      <div><div class="network-list-title">DMX nodes <span class="subtle">${plan.nodes.length} placed</span></div><div class="network-device-list">${nodeHtml || '<div class="device-list-empty">No nodes yet. Choose a node type and click Auto-assign.</div>'}</div></div>
    </div>`;
  const splitBody = `<div class="network-device-list">${splitterHtml || '<div class="device-list-empty">No splitters yet. Choose a splitter type and click Auto-calculate.</div>'}</div>`;

  return card({ key:`${dc}:nodes`, title:'Network nodes', icon:'network', meta:`${plural(plan.nodes.length,'node')} · ${plural(universes.length,'universe')}`, body:nodesBody, collapsed: !plan.nodes.length })
       + card({ key:`${dc}:splitters`, title:'Splitters', icon:'cable', meta:`${plural(plan.splitters.length,'splitter')} · ${Number(nd.prefs.splitterSparePorts || 0)} spare outputs`, body:splitBody, collapsed: !plan.splitters.length })
       + (window.NetworkPage?.summaryCard(dc) || '');
}
function bindDimNetworkDevices(root, dc, rerender){
  const nodeSelect = root.querySelector('#dimNodeType');
  const splitterSelect = root.querySelector('#dimSplitterType');
  if(nodeSelect) nodeSelect.onchange = ()=>{ getDimPlan(dc).nodeTypeId = nodeSelect.value; MODEL.ui.dirty = true; };
  if(splitterSelect) splitterSelect.onchange = ()=>{ getDimPlan(dc).lastSplitterTypeId = splitterSelect.value; MODEL.ui.dirty = true; rerender(); };
  const on = (sel, fn) => { const b = root.querySelector(sel); if(b) b.onclick = fn; };
  on('#dimAutoAssignNodes', ()=>{
    const plan = autoAssignDimCityNodes(dc, nodeSelect?.value || '');
    if(plan){ if(!MODEL.ui.cardCollapsed) MODEL.ui.cardCollapsed = {}; MODEL.ui.cardCollapsed[`${dc}:nodes`] = false; toast(`${plural(plan.nodes.length,'node')} assigned in ${dc}`); }
    rerender();
  });
  on('#dimAutoSplitters', ()=>{
    const plan = autoAddSplittersForDim(dc, splitterSelect?.value || '');
    if(plan){ if(!MODEL.ui.cardCollapsed) MODEL.ui.cardCollapsed = {}; MODEL.ui.cardCollapsed[`${dc}:splitters`] = false; toast(`${plural(plan.splitters.length,'splitter')} calculated for ${dc}`); }
    rerender();
  });
  on('#dimAddSplitter', ()=>{ addSplitterToDimCity(dc, splitterSelect?.value || ''); if(!MODEL.ui.cardCollapsed) MODEL.ui.cardCollapsed = {}; MODEL.ui.cardCollapsed[`${dc}:splitters`] = false; rerender(); });
  window.NodeLink?.bind(root, rerender);
  root.querySelectorAll('.dimRemoveNode').forEach(btn=> btn.onclick = ()=>{ getDimPlan(dc).nodes.splice(Number(btn.dataset.nodeIndex),1); MODEL.ui.dirty = true; rerender(); });
  root.querySelectorAll('.dimRemoveSplitter').forEach(btn=> btn.onclick = ()=>{ getDimPlan(dc).splitters.splice(Number(btn.dataset.splitterIndex),1); MODEL.ui.dirty = true; rerender(); });
  root.querySelectorAll('.dimNodeField').forEach(inp=>{
    if(inp.classList.contains('ipv4')) bindIpv4Input(inp, inp.dataset.field==='ip');
    inp.onchange = ()=>{
      const n = getDimPlan(dc).nodes[Number(inp.dataset.nodeIndex)]; if(!n) return;
      n[inp.dataset.field] = inp.value.trim(); MODEL.ui.dirty = true;
      inp.classList.toggle('invalid', inp.classList.contains('ipv4') && !isValidIpv4(inp.value, inp.dataset.field==='ip'));
    };
  });
  root.querySelectorAll('.dimSplitterField').forEach(inp=>{
    inp.onchange = ()=>{ const s = getDimPlan(dc).splitters[Number(inp.dataset.splitterIndex)]; if(!s) return; s[inp.dataset.field] = inp.value.trim(); MODEL.ui.dirty = true; };
  });
  window.FentUI?.bindDevice(root, dc, rerender);
  window.NetSwitches?.bind(root, dc, rerender);
  root.querySelectorAll('.uni-pool-chip').forEach(chip=> chip.addEventListener('dragstart', e=> e.dataTransfer.setData('text/plain', chip.dataset.uni || '')));
  root.querySelectorAll('.device-port.assignable[data-node-index]').forEach(port=>{
    port.onclick = e=>{ e.stopPropagation(); openPortUniversePicker(dc, Number(port.dataset.nodeIndex), Number(port.dataset.portIndex)); };
    port.addEventListener('dragover', e=>{ e.preventDefault(); port.classList.add('drop-hover'); });
    port.addEventListener('dragleave', ()=> port.classList.remove('drop-hover'));
    port.addEventListener('drop', e=>{
      e.preventDefault(); port.classList.remove('drop-hover');
      const n = getDimPlan(dc).nodes[Number(port.dataset.nodeIndex)]; if(!n) return;
      n.universes[Number(port.dataset.portIndex)] = Number(e.dataTransfer.getData('text/plain'));
      MODEL.ui.dirty = true; rerender();
    });
  });
}
window.LKApp = {
  getMODEL: ()=> MODEL,
  setMODEL: (m)=> { MODEL = m; },

  // functies die de editor en ProjectIO nodig hebben
  processRows,
  renderAll,
  renderRight,
  renderSummary,
  renderIssues,
  recomputeVeamUseAndIssues,
  recomputeUniverseStats,
  hydrateDimOrigins,
  fullRebuildAndRender,
  rebuildFromCsvSources,
  navigate,
  openEntity,
  updateChrome,

  // helpers
  isLK,
  isV,
  dimCityFromId,
  portRangeOk,
  statusColor,
  blockTypeLabel,
  effectiveBlockType,
  dimColor,
  mergedPortRecord,
  lkAutoLocation,
  veamAutoLocation,
  sortedDims,
  addDimCity,
  nextDbName,

  // UI helpers
  ui: { toast, openDialog, confirmDialog, showMenu, icon: I, card, plural },
  pageHead,

  applyBlockType,
  currentRows,

  // network device helpers (Device Builder / Library)
  net: { normalizeNetworkDevices, nextTypedId, safeHex, isValidIpv4, bindIpv4Input, esc, getDimPlan, createNodeInstance, createSplitterInstance, refreshDimDeviceIdentity },

  // DOM helpers
  $,el
};

// ===== Commando's (native menu, werkbalk, knoppen met data-cmd) =====
async function runCommand(cmd, arg){
  const PIO = window.ProjectIO, UI = window.PatchLabUI;
  switch(cmd){
    case 'newProject':    return UI?.newProject?.();
    case 'openProject':   return PIO?.fileOpenProject?.();
    case 'openRecent':    return PIO?.openProjectPath?.(arg);
    case 'openFile':
      if (await PIO?.openProjectPath?.(arg)) UI?.closeWelcome?.();
      return;
    case 'save':          return PIO?.fileSaveProject?.();
    case 'saveAs':        return PIO?.fileSaveProjectAs?.();
    case 'importCsv':     return PIO?.importCsvStart?.();
    case 'csvSources':    return showCsvSourcesModal();
    case 'editCsv':       return window.CsvEditor?.open?.();
    case 'exportPdf':     return window.PdfExport?.open?.();
    case 'addDb':         return newLocation(nextDbName());
    case 'addFoh':        return newLocation('FOH');
    case 'addLocation': {
      const d = openDialog({ title:'Add a location', width:'380px', body:'<label class="field">Name<input id="locName" type="text" maxlength="12" placeholder="DB05, FOH, STAGE…"></label><div class="subtle" style="margin-top:6px">A DB, FOH (front of house) or any other place with its own racks and network switches.</div>', footer:'<button data-a="c">Cancel</button><button class="primary" data-a="ok">Add</button>' });
      const inp = d.body.querySelector('#locName'); setTimeout(()=> inp.focus(), 30);
      const ok = ()=>{ const r = newLocation(inp.value, true); if(r) d.close(); };
      d.footer.querySelector('[data-a=c]').onclick = ()=> d.close(); d.footer.querySelector('[data-a=ok]').onclick = ok; inp.onkeydown = e=>{ if(e.key === 'Enter') ok(); };
      return;
    }
    case 'addLK':         return showToolsModal('LK');
    case 'addVeam':       return showToolsModal('VEAM');
    case 'deviceBuilder':   return window.DeviceBuilder?.open?.(arg);
    case 'nodeBuilder':     return window.DeviceBuilder?.open?.('node');
    case 'splitterBuilder': return window.DeviceBuilder?.open?.('splitter');
    case 'libraryExport':   return window.Library?.exportFile?.();
    case 'libraryImport':   return window.Library?.importFile?.();
    case 'networkPlanner':  return navigate('NETWORK');
    case 'network':         navigate('NET'); if(arg) window.NetworkPage?.render?.({ dc:arg }); return;
    case 'setup':           return window.Setup?.open?.();
    case 'signalFlow':      return navigate('FLOW');
    case 'projectInfo':   return UI?.editProjectInfo?.();
    case 'rebuild':
      fullRebuildAndRender();
      return toast('Validation and statistics recalculated', 'info');
    case 'view':          return navigate(arg || 'HOME');
    case 'tour':          return UI?.startTour?.();
    case 'welcome':       return UI?.showWelcome?.();
    case 'shortcuts':     return window.Help?.open?.('shortcuts');
    case 'about':         return UI?.showAbout?.();
    case 'recentChanged': return;
    case 'undo':          return window.PatchHistory?.undo?.();
    case 'redo':          return window.PatchHistory?.redo?.();
    case 'history':       return window.PatchHistory?.openPanel?.();
    case 'settings':      return window.Settings?.open?.(arg);
    case 'search':        return window.Search?.open?.();
    case 'checkUpdates':  return window.Updater?.check?.({ manual:true });
    case 'help':          return window.Help?.open?.(arg);
    case 'demo':          return window.Demo?.open?.();
    case 'wrapped':       return window.Fun?.wrapped?.();
    case 'stickers':      return window.Labels?.open?.(arg ? { dcs:[arg] } : {});
    case 'shareFlow':     return window.Fun?.shareFlow?.();
    case 'tourMenu':      return UI?.chooseTour?.();
    case 'request':       return window.Help?.openRequest?.();
  }
}
window.LKApp.runCommand = runCommand;
window.app?.onMenuCommand?.((cmd, arg)=> runCommand(cmd, arg));

// Zijbalk in- en uitklappen (alleen iconen), onthouden op deze computer
function setNavMini(on){
  document.body.classList.toggle('nav-mini', on);
  const b = document.getElementById('navToggle');
  if(b){ b.innerHTML = I(on ? 'chevronRight' : 'chevronLeft', 16); b.title = on ? 'Expand sidebar' : 'Collapse sidebar'; }
  try { localStorage.setItem('patchlab.navMini', on ? '1' : '0'); } catch {}
}
try { setNavMini(localStorage.getItem('patchlab.navMini') === '1'); } catch {}
document.getElementById('navToggle')?.addEventListener('click', () => setNavMini(!document.body.classList.contains('nav-mini')));

// Werkbalk
const bindClick = (id, fn) => { const n = document.getElementById(id); if(n) n.addEventListener('click', e=>{ e.preventDefault(); fn(e); }); };
bindClick('tbImport',      ()=> runCommand('importCsv'));
bindClick('tbEditRows',    ()=> runCommand('editCsv'));
bindClick('btnRebuild',    ()=> runCommand('rebuild'));
bindClick('tbSave',        ()=> runCommand('save'));
bindClick('btnCsvEdit',    ()=> runCommand('editCsv'));
bindClick('navAddMenu',    e=> showMenu(e.currentTarget, [
  { label:'Add DB (next number)', icon:'layers', run:()=> runCommand('addDb') },
  { label:'Add FOH (front of house)', icon:'layers', run:()=> runCommand('addFoh') },
  { label:'Add location with a name…', icon:'layers', run:()=> runCommand('addLocation') },
  '-',
  { label:'Add LK…', icon:'box', run:()=> runCommand('addLK') },
  { label:'Add Veam…', icon:'plug', run:()=> runCommand('addVeam') },
  '-',
  { label:'Import CSV…', icon:'upload', run:()=> runCommand('importCsv') }
]));
// export-pdf.js bindt #fileExportPdf zelf.

// Gedelegeerde navigatie in zijbalk en hoofdweergave
$('#sidebar')?.addEventListener('click', handleNavClick);
$('#view')?.addEventListener('click', handleNavClick);

// ===== Add LK / Add Veam =====
function showToolsModal(which){
  $('#toolsBackdrop').style.display = 'flex';
  $('#modalAddLK').style.display   = (which==='LK')   ? 'flex' : 'none';
  $('#modalAddVeam').style.display = (which==='VEAM') ? 'flex' : 'none';
  if (which==='LK'){
    $('#lkInputId').value = '';
    $('#lkInputBlockType').value = 'MIXED';
    $('#lkAddError').textContent = '';
    setTimeout(()=>$('#lkInputId').focus(), 30);
  } else {
    $('#veamInputId').value = '';
    $('#veamAddError').textContent = '';
    setTimeout(()=>$('#veamInputId').focus(), 30);
  }
}
function closeToolsModal(){
  $('#toolsBackdrop').style.display = 'none';
  $('#modalAddLK').style.display = 'none';
  $('#modalAddVeam').style.display = 'none';
}
$('#lkAddCancel').onclick   = closeToolsModal;
$('#veamAddCancel').onclick = closeToolsModal;
$('#toolsBackdrop').addEventListener('mousedown', (e)=>{ if (e.target === e.currentTarget) closeToolsModal(); });
$('#toolsBackdrop').addEventListener('keydown', (e)=>{
  if (e.key === 'Escape') closeToolsModal();
  if (e.key === 'Enter') ($('#modalAddLK').style.display !== 'none' ? $('#lkAddConfirm') : $('#veamAddConfirm')).click();
});

// Extra location without patch rows yet (a DB, or FOH = front of house, where the lighting desk stands)
function addDimCity(raw){
  const id = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if(!/^[A-Z0-9][A-Z0-9_-]{1,11}$/.test(id)) return { ok:false, error:'Use letters and numbers, for example DB04 or FOH.' };
  if(MODEL.byDim.has(id)) return { ok:false, error:`${id} exists already.` };
  MODEL.byDim.set(id, emptyDimStats());
  if(!MODEL.dimFromManual) MODEL.dimFromManual = new Set();
  MODEL.dimFromManual.add(id);
  MODEL.ui.dirty = true;
  ensureDimColors();
  return { ok:true, id };
}
function newLocation(name, keepOpen){
  const r = addDimCity(name);
  if(!r.ok){ toast(r.error, 'err'); return false; }
  renderAll(); openEntity('DIM', r.id);
  toast(`${r.id} added — place a rack or add a network switch (Setup, or the Network page).`);
  return true;
}
function nextDbName(){
  const nums = sortedDims().map(d => /^DB(\d+)$/.exec(d)).filter(Boolean).map(m => Number(m[1]));
  return 'DB' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0');
}

async function ensureDimForNew(id, dim, errEl){
  if (MODEL.byDim.has(dim)) return true;
  const ok = await confirmDialog({ title:`Create ${dim}?`, message:`${id} belongs to DimCity ${dim}, which does not exist yet.`, okLabel:`Create ${dim}` });
  if (!ok){ errEl.textContent = ''; return false; }
  MODEL.byDim.set(dim, emptyDimStats());
  if (!MODEL.dimFromManual) MODEL.dimFromManual = new Set();
  MODEL.dimFromManual.add(dim);
  return true;
}

$('#lkAddConfirm').onclick = async ()=>{
  const raw = ($('#lkInputId').value || '').trim().toUpperCase();
  const id  = raw.replace(/^VEAM12/,'LK');
  const typeSel = $('#lkInputBlockType').value;
  const err = $('#lkAddError');
  if(!/^LK\d+$/.test(id)){ err.textContent = 'Invalid format. Use for example LK101.'; return; }
  const dim = dimCityFromId(id);
  if(!dim){ err.textContent = 'The DimCity cannot be derived from this number.'; return; }
  if (MODEL.byLK.has(id)){ err.textContent = `${id} already exists.`; return; }
  if (!(await ensureDimForNew(id, dim, err))) return;

  MODEL.byLK.set(id, {
    id, dimcity: dim, lines: [],
    names: {'1-4':null,'5-8':null,'9-12':null},
    veam: {1:null,2:null,3:null},
    blockType: { mode:'Manual', value: typeSel },
    manual: true
  });
  MODEL.byDim.get(dim).lks.add(id);
  MODEL.ui.dirty = true;
  hydrateDimOrigins();
  recomputeVeamUseAndIssues();
  closeToolsModal();
  renderIssues();
  openEntity('LK', id);
  toast(`${id} added to ${dim}`);
};

$('#veamAddConfirm').onclick = async ()=>{
  const id = ($('#veamInputId').value || '').trim().toUpperCase();
  const err = $('#veamAddError');
  if(!/^V\d+$/.test(id)){ err.textContent = 'Invalid format. Use for example V101.'; return; }
  const dim = dimCityFromId(id);
  if(!dim){ err.textContent = 'The DimCity cannot be derived from this number.'; return; }
  if (MODEL.byVeam.has(id)){ err.textContent = `${id} already exists.`; return; }
  if (!(await ensureDimForNew(id, dim, err))) return;

  MODEL.byVeam.set(id, { id, dimcity: dim, lines: [], manual: true });
  MODEL.byDim.get(dim).veams.add(id);
  const pool = MODEL.veamPool.get(dim) || new Set(); pool.add(id); MODEL.veamPool.set(dim, pool);
  MODEL.ui.dirty = true;
  hydrateDimOrigins();
  recomputeVeamUseAndIssues();
  closeToolsModal();
  renderIssues();
  openEntity('VEAM', id);
  toast(`${id} added to ${dim}`);
};

// ===== LK / Veam verwijderen (handmatig of uit CSV) =====
// De effectieve rijen (CSV + bewerkingen + custom) zonder dit ID opnieuw verwerken. Vooraf uit het
// model halen, anders zet carryOverManualState een handmatige LK/Veam weer terug.
const sameId = (a, b) => normLK(String(a ?? '').trim().toUpperCase()) === normLK(String(b ?? '').trim().toUpperCase());
async function reprocessWithout(id){
  const rows = currentRows(MODEL).filter(r => !sameId(r[0], id));
  const custom = (MODEL.customRows || []).filter(r => !sameId(r.id, id));
  // ook uit de bewaarde CSV-bestanden, anders komt het ID terug bij een volgende (her)import
  for(const src of (MODEL.csvSources || [])){ src.rows = (src.rows || []).filter(r => !sameId(r[0], id)); src.rowCount = src.rows.length; }
  await processRows(rows);
  MODEL.customRows = custom;
  MODEL.ui.dirty = true;
}
function afterDelete(dc, msg){
  if(MODEL.byDim.has(dc)) openEntity('DIM', dc); else navigate('HOME');
  toast(msg);
}
async function deleteLK(id){
  const lk = MODEL.byLK.get(id); if(!lk) return false;
  const rows = lk.lines.filter(L => L.universe != null || L.dest).length;
  const linked = [1,2,3].map(s => lk.veam?.[s]).filter(Boolean);
  const ok = await confirmDialog({
    title:`Delete ${id}?`,
    message:`${id} is removed from ${lk.dimcity}${rows ? ` together with its ${plural(rows, 'patch row')}` : ''}.${linked.length ? `\n\nThe link${linked.length > 1 ? 's' : ''} to ${linked.join(', ')} ${linked.length > 1 ? 'are' : 'is'} removed; the Veam${linked.length > 1 ? 's' : ''} stay in the show.` : ''}\n\nYou can undo this with Undo.`,
    okLabel:'Delete LK', danger:true
  });
  if(!ok) return false;
  window.PatchHistory?.label?.(`Deleted ${id}`);
  const dc = lk.dimcity;
  MODEL.byLK.delete(id);
  MODEL.byDim.get(dc)?.lks.delete(id);
  await reprocessWithout(id);
  afterDelete(dc, `${id} deleted`);
  return true;
}
async function deleteVeam(id){
  const ve = MODEL.byVeam.get(id); if(!ve) return false;
  const rows = ve.lines.filter(L => L.universe != null || L.dest).length;
  const uses = MODEL.veamUse.get(id) || [];
  const ok = await confirmDialog({
    title:`Delete ${id}?`,
    message:`${id} is removed from ${ve.dimcity}${rows ? ` together with its ${plural(rows, 'patch row')}` : ''}.${uses.length ? `\n\nThe link from ${uses.map(u => `${u.lkId} (Veam ${'ABC'[u.slot - 1]})`).join(', ')} is removed.` : ''}\n\nYou can undo this with Undo.`,
    okLabel:'Delete Veam', danger:true
  });
  if(!ok) return false;
  window.PatchHistory?.label?.(`Deleted ${id}`);
  const dc = ve.dimcity;
  for(const u of uses){ const lk = MODEL.byLK.get(u.lkId); if(lk?.veam) lk.veam[u.slot] = null; }
  MODEL.byVeam.delete(id);
  MODEL.byDim.get(dc)?.veams.delete(id);
  MODEL.veamPool.get(dc)?.delete(id);
  await reprocessWithout(id);
  afterDelete(dc, `${id} deleted`);
  return true;
}
window.LKApp.deleteLK = deleteLK;
window.LKApp.deleteVeam = deleteVeam;

// ===== Init =====
hydrateIcons();
renderAll();
