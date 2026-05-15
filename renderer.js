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
  if(st==='GREEN') return 'Good';
  if(st==='YELLOW') return 'Warning';
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
  return s.split(/[\/]/).pop() || s || 'CSV bestand';
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
function colorChip(c){
  return `<span class="color-chip" style="background:${safeHex(c)}"></span>`;
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
  return out;
}
async function rebuildFromCsvSources(){
  await processRows(rowsFromCsvSources());
}

// Bloktype helpers
function blockTypeLabel(t){
  if(t==='MIXED')     return '4X XLR 3p+5p + 3X Veam 4';
  if(t==='VEAM_ONLY') return '3X Veam 4';
  if(t==='XLR12')     return '12X XLR 3p+5p';
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
    const opt = el('option', null, `${label} ← kolom ${i+1}`);
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
    fillMappingSelect(mapTrussSel,'—', WIZ.map.truss);
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
  $('#wizCount').textContent = `${Math.max(0, end-start+1)} selected of ${total}`;

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
  MODEL.ui.dirty = true;
};


// renderer.js — Bestand-menu events (zonder eigen Export-PDF handler)
(function bindFileMenu(){
  const q = id => document.getElementById(id);
  q('fileSave')     ?.addEventListener('click', ()=> ProjectIO.fileSaveProject());
  q('fileSaveAs')   ?.addEventListener('click', ()=> ProjectIO.fileSaveProjectAs());
  q('fileOpen')     ?.addEventListener('click', ()=> ProjectIO.fileOpenProject());
  q('fileImportCsv')?.addEventListener('click', ()=> ProjectIO.importCsvStart());
  q('fileNew')      ?.addEventListener('click', async ()=> {
     const ok = await ProjectIO.createNewFile?.(); 
     if (!ok) console.log('Nieuwe file geannuleerd'); 
    });
  // GEEN q('fileExportPdf') hier: export-pdf.js regelt dit.
})();

// Herbereken-knop in de header
(function bindRebuildButton(){
  const btn = document.getElementById('btnRebuild');
  if (!btn) return;
  btn.addEventListener('click', ()=>{
    if (typeof fullRebuildAndRender === 'function'){
      fullRebuildAndRender();
    }
  });
})();

// ===== Verwerking =====
async function processRows(rows){
  $('#fileInfo').textContent = `Selected rows: ${rows.length}`;

  const lkLines = [];
  const veLines = [];
  const dmxLoose = [];                 // << NIEUW
  const issues = [];
  const veamPool = new Map();

  for (const r of rows){
    if (r.length < 4){ 
      issues.push({severity:'RED', code:'CSV_MIN_FIELDS', message:`Too few fields: ${r.join(',')}`});
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
        issues.push({severity:'RED', code:'DMX_DIMCITY_REQ', message:`DMX row without DimCity (add DBxx in field 6)`});
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

    // --- LK/VEAM met ID ---
    const dimcity = dimCityFromId(id);
    if(!dimcity) { issues.push({severity:'RED', code:'ID_PATTERN', message:`Unknown ID: ${id}`}); continue; }
    if(!portRangeOk(id, port)){ issues.push({severity:'RED', code:'PORT_RANGE', message:`Port out of range: ${id}#${port}`}); continue; }

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

  function dedup(lines){
    const key = L => `${normLK(L.id)||L.id}#${L.port}`;
    const seen = new Map(); const outIssues = [];
    for(const L of lines){
      const k = key(L);
      if(!seen.has(k)){ seen.set(k,[L]); continue; }
      const arr = seen.get(k);
      const universes = new Set(arr.concat([L]).map(x => x.universe).filter(v => v!=null));
      if(universes.size>1){
        outIssues.push({severity:'RED', code:'UNIVERSE_CONFLICT', message:`Conflicting universe on ${k}`});
        arr.forEach(x => x.status='RED'); L.status='RED';
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

  // --- MODEL opbouwen, inclusief DMX ---
  MODEL = {
    filePath: MODEL.filePath,
    projectPath: MODEL.projectPath,
    projectMeta: MODEL.projectMeta,
    networkDevices: normalizeNetworkDevices(MODEL.networkDevices),
    dimColors: MODEL.dimColors && typeof MODEL.dimColors === 'object' ? {...MODEL.dimColors} : {},
    csvSources: Array.isArray(MODEL.csvSources) ? MODEL.csvSources.slice() : [],
    lines: d1.ded,
    veamLines: d2.ded,
    dmxLoose,                         // << NIEUW
    customRows: MODEL.customRows || [],
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
    x.code !== 'BLOCKTYPE_XLR_CONFLICT'
  );

  // Dubbele Veam-koppelingen
  for (const [vid, uses] of MODEL.veamUse){
    if(uses.length > 1){
      const refs = uses.map(u => `${u.lkId}(Veam ${u.slot})`).join(', ');
      MODEL.issues.push({
        severity:'RED',
        code:'VEAM_DUPLICATE',
        message:`Veam ${vid} is linked more than once: ${refs}`
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
          message:`${rec.id}: VEAM_ONLY selected but ${used} LK port(s) contain data`
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
function renderAll(){
  renderRawRows();
  renderSummary();
  renderIssues();
  renderRight();   // ← centrale controller
}



function renderRawRows(){
  const tb = $('#rawRows'); 
  tb.innerHTML = '';

  // Combineer alle rijen die we willen tonen
  const all = []
    .concat(MODEL.lines.map(L => ({ type:'LK',   ...L })))
    .concat(MODEL.veamLines.map(V => ({ type:'VEAM', ...V })))
    .concat((MODEL.dmxLoose || []).map(D => ({ type:'DMX', ...D })));

  // Sorteer: Type → ID → Port → Universe (mag zo blijven)
  all.sort((a,b)=>{
    const ord = (x)=> x.type==='LK'?0 : x.type==='VEAM'?1 : 2;
    if (ord(a)!==ord(b)) return ord(a)-ord(b);
    const ida=(a.id||''), idb=(b.id||'');
    if (ida!==idb) return ida.localeCompare(idb);
    const pa=(a.port??1e9), pb=(b.port??1e9);
    if (pa!==pb) return pa-pb;
    const ua=(a.universe??1e9), ub=(b.universe??1e9);
    return ua-ub;
  });

  for(const R of all){
    // Bepaal status (val terug op 'YELLOW' als onbekend)
    const st = R.status || 'YELLOW';

    // Bouw exact 6 cellen op in dezelfde volgorde als de nieuwe <thead>:
    // 1) LK/veam Name (= id)
    // 2) Port
    // 3) Universe
    // 4) Location (= dest)
    // 5) DimCity
    // 6) status (gekleurde pill)
    const tr = el('tr', null, `
      <td>${R.id ?? '—'}</td>
      <td>${R.port ?? '—'}</td>
      <td>${R.universe ?? ''}</td>
      <td>${R.dest || ''}</td>
      <td>${R.dimcity ?? ''}</td>
      <td>${statusDot(st)}</td>
    `);
    tb.appendChild(tr);
  }
}


function renderSummary(){
  const c = $('#summary'); c.innerHTML='';
  renderDimCitiesBanner(c);
  ensureDimColors();

  const dims = [...MODEL.byDim.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  for(const [dc,s] of dims){
    const open = MODEL.ui.dimOpen.has(dc) ? MODEL.ui.dimOpen.get(dc) : !MODEL.ui.defaultClosed;
    const lkCount = s.lks.size;
    const veCount = s.veams.size;
    const color = dimColor(dc);
    const stat = MODEL.uniStats.get(dc);
    const uniCount = stat?.totalUniq || 0;

    const header = el('div','toggle', `
      <span><span class="twist">${open?'▾':'▸'}</span> ${colorChip(color)}<b>${dc}</b></span>
      <span><span class="badge">${uniCount} UNI</span> <span class="badge">${lkCount} LK</span> <span class="badge">${veCount} Veam</span></span>
    `);
    const box = el('div','section dim-section');
    box.style.setProperty('--dim-color', color);
    const hdr = el('h3'); hdr.appendChild(header);
    const meta = el('div','content', `<div class="muted">patch points ${s.lines_total} • with universe ${s.filled} • empty ${s.empty} • <span class="danger">errors ${s.red}</span> • <span class="warn">warnings ${s.yellow}</span></div>`);
    box.appendChild(hdr); box.appendChild(meta);

    const content = el('div','content');
    if(open){
      const gLK = `${dc}::LK`;
      const lkOpen = MODEL.ui.groupOpen.has(gLK) ? MODEL.ui.groupOpen.get(gLK) : false;
      const lkHdr = el('div','toggle', `<span><span class="twist">${lkOpen?'▾':'▸'}</span> LKs</span>`);
      lkHdr.onclick = ()=>{ MODEL.ui.groupOpen.set(gLK, !lkOpen); renderSummary(); };
      content.appendChild(lkHdr);

      if(lkOpen){
        const lks = [...MODEL.byLK.values()].filter(x=>x.dimcity===dc).sort((a,b)=>a.id.localeCompare(b.id));
        const ul = el('ul','list subsec');
        if(!lks.length) ul.appendChild(el('li','item','<div class="muted">No LKs</div>'));
        for (const lk of lks) {
          const rowKey = `LKROW::${dc}::${lk.id}`;
          const rowOpen = MODEL.ui.groupOpen.get(rowKey) ?? false;
          const li = el('li','item');
          const loc = lkAutoLocation(lk) || '';
          const headerRow = el('div','toggle', `<span><span class="twist">${rowOpen ? '▾' : '▸'}</span> <b>${lk.id}</b> <span class="dimcity-tag">${esc(loc)}</span></span>`);
          headerRow.querySelector('.twist').onclick = (e)=>{ e.stopPropagation(); MODEL.ui.groupOpen.set(rowKey, !rowOpen); renderSummary(); };
          headerRow.onclick = ()=>{ MODEL.selected = { kind:'LK', id: lk.id }; MODEL.ui.rightMode = 'DETAIL'; renderRight(); };
          li.appendChild(headerRow);
          if (rowOpen) {
            const mini = el('div','subsec');
            const eff = effectiveBlockType(lk);
            mini.innerHTML = `<div><b>Block type:</b> ${blockTypeLabel(eff)}</div><div style="margin-top:6px"><b>V1:</b> ${lk.veam?.[1] ?? '—'}</div><div><b>V2:</b> ${lk.veam?.[2] ?? '—'}</div><div><b>V3:</b> ${lk.veam?.[3] ?? '—'}</div>`;
            li.appendChild(mini);
          }
          ul.appendChild(li);
        }
        content.appendChild(ul);
      }

      const gVE = `${dc}::VE`;
      const veOpen = MODEL.ui.groupOpen.has(gVE) ? MODEL.ui.groupOpen.get(gVE) : false;
      const veHdr = el('div','toggle', `<span><span class="twist">${veOpen?'▾':'▸'}</span> Veams</span>`);
      veHdr.onclick = ()=>{ MODEL.ui.groupOpen.set(gVE, !veOpen); renderSummary(); };
      content.appendChild(veHdr);
      if(veOpen){
        const pool = [...(MODEL.byDim.get(dc)?.veams || new Set())].sort();
        const ul = el('ul','list subsec');
        if(!pool.length) ul.appendChild(el('li','item','<div class="muted">No Veams found</div>'));
        for(const v of pool){
          const uses = MODEL.veamUse.get(v)||[];
          const status = uses.length===0 ? '<span class="ok">free</span>' : uses.length===1 ? `linked to ${uses[0].lkId} (Veam ${uses[0].slot})` : `<span class="danger">DOUBLE: ${uses.map(u=>u.lkId+'(V'+u.slot+')').join(', ')}</span>`;
          const ve = MODEL.byVeam.get(v);
          const loc = veamAutoLocation(ve) || '';
          const li = el('li','item');
          li.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><div><b>${v}</b></div><div class="dimcity-tag">Location: ${esc(loc) || '—'}</div></div><div class="sub">${status}</div>`;
          li.onclick = ()=>{ MODEL.selected = { kind:'VEAM', id: v }; MODEL.ui.rightMode = 'DETAIL'; renderRight(); };
          ul.appendChild(li);
        }
        content.appendChild(ul);
      }

      renderDmxCablesGroup(dc, content);
      renderSummaryUniversesSection(dc, content);
    }

    header.onclick = ()=>{
      const willOpen = !open;
      MODEL.ui.dimOpen.set(dc, willOpen);
      if (willOpen){
        MODEL.ui.groupOpen.set(`${dc}::LK`,  false);
        MODEL.ui.groupOpen.set(`${dc}::VE`,  false);
        MODEL.ui.groupOpen.set(`${dc}::DMX`, false);
        MODEL.ui.groupOpen.set(`${dc}::UNI`, false);
      }
      MODEL.selected = { kind:'DIM', id: dc };
      MODEL.ui.rightMode = 'DETAIL';
      renderSummary();
      renderRight();
    };

    c.appendChild(box); box.appendChild(content);
  }
}

function renderIssues(){
  const ul = $('#issues'); ul.innerHTML='';
  if(!MODEL.issues.length){ ul.appendChild(el('li','item','<span class="ok">No issues found</span>')); return; }
  for(const it of MODEL.issues){
    const li = el('li','item', `<div>${statusDot(it.severity)} <b>${issueLabel(it.severity)}</b> • ${it.code}</div><div class="sub">${it.message||''}</div>`);
    ul.appendChild(li);
  }
}

function labelForLK(lk){
  const n1 = lk.names['1-4']?.value || '-';
  const n2 = lk.names['5-8']?.value || '-';
  const n3 = lk.names['9-12']?.value || '-';
  const v = lk.veam || {};
  const vtxt = [v[1]?`V1:${v[1]}`:'V1:—', v[2]?`V2:${v[2]}`:'V2:—', v[3]?`V3:${v[3]}`:'V3:—'].join(' ');
  return `Blokken: 1–4=${n1} • 5–8=${n2} • 9–12=${n3} • Veams [${vtxt}]`;
}



function lkLineForPort(lk, p){
  return lk.lines.find(x=>Number(x.port)===Number(p)) || {port:p, universe:null, dest:'', status:'YELLOW'};
}
function renderPortCells(lk, start, end){
  let out = '';
  for(let p=start;p<=end;p++){
    const L = lkLineForPort(lk, p);
    const filled = L && L.universe != null && L.universe !== '';
    out += `<div class="lk-port-cell ${filled?'filled':''}" title="${esc(lk.id)} port ${p}${filled?` • UNI ${esc(L.universe)}`:''}${L.dest?` • ${esc(L.dest)}`:''}"><div class="pnum">${p}</div><div class="puniverse">${filled?`U${esc(L.universe)}`:'—'}</div><div class="pdest">${esc(L.dest || '')}</div></div>`;
  }
  return out;
}
function renderLkVisual(lk){
  const eff = effectiveBlockType(lk);
  const color = dimColor(lk.dimcity);
  const loc = lkAutoLocation(lk) || '';
  if(eff === 'XLR12'){
    return `<div class="lk-visual" style="--dim-color:${color}"><div class="lk-visual-head"><div><b>${esc(lk.id)}</b> <span class="badge">12× XLR outputs</span></div><span class="dimcity-tag">${esc(loc) || '—'}</span></div><div class="lk-xlr12-grid">${renderCombinedPortCells(lk,[1,2,3,4,5,6,7,8,9,10,11,12])}</div></div>`;
  }
  const groups = [
    {slot:1, title: eff==='MIXED' ? 'Top XLR 1–4' : 'Veam A', subtitle: eff==='MIXED' ? 'same circuit as optional Veam A' : 'ports 1–4', ports:[1,2,3,4]},
    {slot:2, title:'Veam B', subtitle:'LK ports 5–8', ports:[5,6,7,8]},
    {slot:3, title:'Veam C', subtitle:'LK ports 9–12', ports:[9,10,11,12]}
  ].map(g=>{
    const linked = lk.veam?.[g.slot] || '';
    const linkText = linked ? `Linked: ${linked}` : 'No Veam linked';
    return `<div class="lk-group ${linked?'linked':'not-linked'}"><div class="lk-group-title"><div><b>${g.title}</b><span>${g.subtitle}</span></div><em>${esc(linkText)}</em></div><div class="lk-port-grid">${renderCombinedPortCells(lk,g.ports)}</div></div>`;
  }).join('');
  return `<div class="lk-visual" style="--dim-color:${color}"><div class="lk-visual-head"><div><b>${esc(lk.id)}</b> <span class="badge">${esc(blockTypeLabel(eff))}</span></div><span class="dimcity-tag">${esc(loc) || '—'}</span></div><div class="lk-block-layout"><div class="lk-input">LK<br>INPUT</div><div class="lk-groups">${groups}</div></div></div>`;
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
    for (const L of lk.lines){
      if(!L || L.universe==null || L.universe==='') continue;
      bump(L.universe, 'lk', { lkId: lk.id, port: L.port, dest: L.dest||'' });
    }
  }
  for (const [, ve] of MODEL.byVeam){
    if (ve.dimcity !== dc) continue;
    for (const R of ve.lines){
      if(!R || R.universe==null || R.universe==='') continue;
      bump(R.universe, 'veam', { veamId: ve.id, port: R.port, dest: R.dest||'' });
    }
  }
  for (const D of (MODEL.dmxLoose||[])){
    if(D.dimcity !== dc || D.universe==null || D.universe==='') continue;
    bump(D.universe, 'dmx', { dest:D.dest||'' });
  }
  return perU;
}
function renderInlineUniverseDetails(dc, focusU){
  if(focusU == null || focusU === '') return '<div class="hint">Click a UNI card to show its LK/Veam patch points here.</div>';
  const perU = universeInfoForDim(dc);
  const info = perU.get(String(focusU));
  if(!info) return '<div class="inline-uni-detail muted">No patch points for this universe.</div>';
  const rows = (arr, cols) => arr.length ? `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${arr.map(x=>`<tr>${cols.map(c=>`<td>${esc(x[c] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="muted">None</div>';
  return `<div class="inline-uni-detail" style="--dim-color:${dimColor(dc)}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h3 style="margin:0;border:0;background:none;padding:0">UNI ${esc(focusU)}</h3><span class="info-pill">${info.lk.length + info.veam.length + info.dmx.length} patch points</span></div><div class="inline-uni-columns"><div><b>LK ports</b>${rows(info.lk, ['lkId','port','dest'])}</div><div><b>Veam ports</b>${rows(info.veam, ['veamId','port','dest'])}</div><div><b>Loose DMX</b>${rows(info.dmx, ['dest'])}</div></div></div>`;
}

function renderInlineLkDetails(lk){
  if(!lk) return '';
  const eff = effectiveBlockType(lk);
  const color = dimColor(lk.dimcity);
  const veams = Array.from(MODEL.byDim.get(lk.dimcity)?.veams || []).sort();
  const optionHtml = (selected)=> ['<option value="">— not linked —</option>'].concat(veams.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`)).join('');
  const slotControls = eff === 'XLR12' ? '<div class="hint">12× XLR mode: Veam links are not used for the visual block.</div>' : [1,2,3].map(slot=>`<label>Veam ${slot===1?'A':slot===2?'B':'C'} link<select class="inlineLkVeamSlot" data-lk="${esc(lk.id)}" data-slot="${slot}">${optionHtml(lk.veam?.[slot] || '')}</select></label>`).join('');
  const mergedRows = [1,2,3,4,5,6,7,8,9,10,11,12].map(p=>{
    const m = mergedPortRecord(lk,p);
    return `<tr><td>${p}</td><td>${m.universe ?? ''}</td><td>${esc(m.dest||'')}</td><td>${esc(m.source||'')}</td><td>${m.ve.veamId ? `${esc(m.ve.veamId)} / ${m.ve.veamPort}` : '—'}</td><td>${m.conflict?statusDot('RED'):statusDot(m.status||'YELLOW')}</td></tr>`;
  }).join('');
  return `<div class="inline-detail-panel lk-open-panel" style="--dim-color:${color}" data-inline-lk="${esc(lk.id)}">
    <div class="inline-detail-head"><div><b class="inline-title">${esc(lk.id)} opened</b><div class="hint">Edit this LK block inline. No page switch.</div></div><span class="badge">${esc(blockTypeLabel(eff))}</span></div>
    <div class="inline-controls">
      <label>Block type<select class="inlineLkBlockType" data-lk="${esc(lk.id)}">
        <option value="Auto" ${lk.blockType?.mode!=='Manual'?'selected':''}>Auto</option>
        <option value="MIXED" ${lk.blockType?.mode==='Manual' && lk.blockType.value==='MIXED'?'selected':''}>4× XLR + 3× Veam</option>
        <option value="VEAM_ONLY" ${lk.blockType?.mode==='Manual' && lk.blockType.value==='VEAM_ONLY'?'selected':''}>3× Veam</option>
        <option value="XLR12" ${lk.blockType?.mode==='Manual' && lk.blockType.value==='XLR12'?'selected':''}>12× XLR</option>
      </select></label>
      ${slotControls}
    </div>
    ${renderLkVisual(lk)}
    <div class="inline-table-wrap"><table><thead><tr><th>LK port</th><th>UNI</th><th>Location</th><th>Source</th><th>Linked Veam port</th><th>Status</th></tr></thead><tbody>${mergedRows}</tbody></table></div>
  </div>`;
}
function renderInlineVeamDetails(ve){
  if(!ve) return '';
  const color = dimColor(ve.dimcity);
  const loc = veamAutoLocation(ve) || '';
  const ports = [];
  for(let i=1;i<=4;i++){
    const L = ve.lines.find(x=>Number(x.port)===i) || {universe:null,dest:'',status:'YELLOW'};
    const filled = L.universe != null && L.universe !== '';
    ports.push(`<div class="lk-port-cell ${filled?'filled':''}" title="${esc(ve.id)} port ${i}${filled?` • UNI ${esc(L.universe)}`:''}"><div class="pnum">${i}</div><div class="puniverse">${filled?`UNI ${esc(L.universe)}`:'—'}</div><div class="pdest">${esc(L.dest||'')}</div></div>`);
  }
  const uses = MODEL.veamUse.get(ve.id)||[];
  const status = uses.length===0 ? 'Not linked to an LK yet' : uses.length===1 ? `Linked to ${uses[0].lkId} / Veam ${uses[0].slot}` : `Linked multiple times: ${uses.map(u=>u.lkId+' V'+u.slot).join(', ')}`;
  return `<div class="inline-detail-panel veam-open-panel" style="--dim-color:${color}" data-inline-veam="${esc(ve.id)}">
    <div class="inline-detail-head"><div><b class="inline-title">${esc(ve.id)} opened</b><div class="hint">${esc(status)}</div></div><span class="badge">Veam 4</span></div>
    <div class="hint">Location: ${esc(loc)||'—'}</div>
    <div class="veam-port-grid" style="margin-top:8px">${ports.join('')}</div>
  </div>`;
}
function renderDimCityDetail(dc){
  const root = $('#lkDetail');
  const head = $('#lkHeader');
  const dim = MODEL.byDim.get(dc);
  if(!dim){
    head.textContent = dc || 'DimCity';
    root.innerHTML = '<div class="muted">No data for this DimCity.</div>';
    updateRightCsvVisibility();
    return;
  }
  ensureDimColors();
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const color = dimColor(dc);
  const rows = []
    .concat(MODEL.lines.map(L => ({ type:'LK', ...L })))
    .concat(MODEL.veamLines.map(V => ({ type:'VEAM', ...V })))
    .concat((MODEL.dmxLoose || []).map(D => ({ type:'DMX', ...D })))
    .filter(r => r.dimcity === dc)
    .sort((a,b)=>{
      const ua=(a.universe??1e9), ub=(b.universe??1e9);
      if(ua!==ub) return ua-ub;
      const ia=(a.id||''), ib=(b.id||'');
      if(ia!==ib) return ia.localeCompare(ib);
      return (a.port??1e9) - (b.port??1e9);
    });

  const stat = MODEL.uniStats.get(dc);
  const uniCount = stat?.totalUniq || 0;
  const pointCount = stat?.totalPorts || 0;
  const lks = [...MODEL.byLK.values()].filter(x=>x.dimcity===dc).sort((a,b)=>a.id.localeCompare(b.id));
  const veams = [...MODEL.byVeam.values()].filter(x=>x.dimcity===dc).sort((a,b)=>a.id.localeCompare(b.id));
  const focusU = MODEL.ui.dimFocusUniverse?.[dc] || null;

  head.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div>${colorChip(color)}<b style="font-size:26px">${dc}</b> <span class="dimcity-tag">DimCity visual overview</span></div></div>`;

  const uniCards = stat && stat.counts.size ? [...stat.counts.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([u,c])=>{
    const total = c.lk + c.veam + (c.dmx || 0);
    const active = String(focusU) === String(u);
    return `<div class="uni-card ${active?'active':''}" data-uni="${u}" title="LK ${c.lk} • Veam ${c.veam}${c.dmx?` • DMX ${c.dmx}`:''}"><div class="uni-title">UNI ${u}</div><div class="uni-sub">${total} patch points</div><div class="dim-pill-row"><span class="info-pill">LK ${c.lk}</span><span class="info-pill">Veam ${c.veam}</span>${c.dmx?`<span class="info-pill">DMX ${c.dmx}</span>`:''}</div></div>`;
  }).join('') : '<div class="muted">No universes</div>';

  const lkCards = lks.length ? lks.map(lk=>`<div class="lk-mini-card clickable v6" data-lk="${esc(lk.id)}">${renderLkVisual(lk)}</div>${isInlineOpen(dc,'lk',lk.id) ? renderInlineLkDetails(lk) : ''}`).join('') : '<div class="device-list-empty">No LKs in this DimCity.</div>';
  const veamCards = veams.length ? veams.map(ve=>{
    const loc = veamAutoLocation(ve) || '';
    const ports = [];
    for(let i=1;i<=4;i++){
      const L = ve.lines.find(x=>Number(x.port)===i) || {universe:null,dest:'',status:'YELLOW'};
      const filled = L.universe != null && L.universe !== '';
      ports.push(`<div class="lk-port-cell ${filled?'filled':''}" title="${esc(ve.id)} port ${i}${filled?` • UNI ${esc(L.universe)}`:''}"><div class="pnum">${i}</div><div class="puniverse">${filled?`U${esc(L.universe)}`:'—'}</div><div class="pdest">${esc(L.dest||'')}</div></div>`);
    }
    return `<div class="lk-mini-card clickable veam-mini v6" data-veam="${esc(ve.id)}"><div class="lk-visual" style="--dim-color:${color}"><div class="lk-visual-head"><div><b>${esc(ve.id)}</b> <span class="badge">Veam 4</span></div><span class="dimcity-tag">${esc(loc)||'—'}</span></div><div class="veam-port-grid">${ports.join('')}</div></div></div>${isInlineOpen(dc,'veam',ve.id) ? renderInlineVeamDetails(ve) : ''}`;
  }).join('') : '<div class="device-list-empty">No Veams in this DimCity.</div>';

  const importRows = rows.map(r=>`
    <tr>
      <td>${esc(r.type)}</td>
      <td>${esc(r.id || 'DMX')}</td>
      <td>${r.port ?? '—'}</td>
      <td>${r.universe ?? ''}</td>
      <td>${esc(r.dest || '')}</td>
      <td>${statusDot(r.status || 'YELLOW')}</td>
    </tr>
  `).join('');

  root.style.setProperty('--dim-color', color);
  root.innerHTML = `
    <div class="dim-hero v4" style="--dim-color:${color}">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div class="dim-title v4">${dc}</div>
          <div class="dim-subtitle">This is ${dc} • physical patch points only, not DMX-channel usage</div>
          <div class="dim-pill-row"><span class="info-pill">${dim.lks.size} LK blocks</span><span class="info-pill">${dim.veams.size} Veams</span><span class="info-pill">${uniCount} universes</span><span class="info-pill">${pointCount} patch points</span></div>
          <div class="dim-action-row"><button id="dimExpandAll" style="background:#334155;color:#eaf2ff">Expand all LK/Veam</button><button id="dimCollapseAll" style="background:#334155;color:#eaf2ff">Collapse all</button></div>
        </div>
        <div>
          <div class="dim-subtitle">DimCity color</div>
          <div class="dim-color-row">${colorSwatchesHtml(color)}</div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><b>${dim.lks.size}</b><span>LK blocks</span></div>
        <div class="stat-card"><b>${dim.veams.size}</b><span>Veams</span></div>
        <div class="stat-card"><b>${rows.length}</b><span>total rows</span></div>
        <div class="stat-card"><b>${uniCount}</b><span>unique universes</span></div>
        <div class="stat-card"><b>${pointCount}</b><span>universe patch points</span></div>
        <div class="stat-card"><b>${dim.red}</b><span>errors</span></div>
        <div class="stat-card"><b>${dim.yellow}</b><span>warnings</span></div>
      </div>
    </div>

    <div class="section dim-section" style="--dim-color:${color}"><h3>Universe overview</h3><div class="content">
      <div class="uni-overview-grid">${uniCards}</div>
      ${renderInlineUniverseDetails(dc, focusU)}
    </div></div>

    <div class="section dim-section" style="--dim-color:${color}"><h3>LK overview</h3><div class="content">
      <div class="lk-card-grid">${lkCards}</div>
    </div></div>

    <div class="section dim-section" style="--dim-color:${color}"><h3>Veam overview</h3><div class="content">
      <div class="lk-card-grid">${veamCards}</div>
    </div></div>

    ${renderDimNetworkDevices(dc)}

    <div class="section dim-section" style="--dim-color:${color}"><h3>Import rows in ${dc}</h3><div class="content" style="max-height:520px;overflow:auto;">
      <table><thead><tr><th>Type</th><th>ID</th><th>Port</th><th>Universe</th><th>Location</th><th>Status</th></tr></thead><tbody>${importRows || '<tr><td colspan="6" class="muted">No rows</td></tr>'}</tbody></table>
    </div></div>
  `;

  root.querySelectorAll('.color-swatch').forEach(btn=>{
    btn.onclick = ()=>{
      MODEL.dimColors[dc] = safeHex(btn.dataset.color, color);
      MODEL.ui.dirty = true;
      renderSummary();
      renderDimCityDetail(dc);
    };
  });
  const custom = root.querySelector('#dimCustomColor');
  if(custom){
    custom.oninput = ()=>{
      MODEL.dimColors[dc] = safeHex(custom.value, color);
      MODEL.ui.dirty = true;
      renderSummary();
      renderDimCityDetail(dc);
    };
  }
  root.querySelectorAll('.uni-card[data-uni]').forEach(chip=>{
    chip.onclick = ()=>{
      if(!MODEL.ui.dimFocusUniverse) MODEL.ui.dimFocusUniverse = {};
      MODEL.ui.dimFocusUniverse[dc] = chip.dataset.uni;
      MODEL.selected = { kind:'DIM', id: dc };
      MODEL.ui.rightMode = 'DETAIL';
      renderDimCityDetail(dc);
    };
  });
  root.querySelectorAll('.lk-mini-card[data-lk]').forEach(card=>{
    card.onclick = (e)=>{
      if(!MODEL.ui.dimFocusLK) MODEL.ui.dimFocusLK = {};
      const id = card.dataset.lk;
      openInlineState(dc, 'lk', id);
      renderDimCityDetail(dc);
    };
  });
  root.querySelectorAll('.lk-mini-card[data-veam]').forEach(card=>{
    card.onclick = ()=>{
      if(!MODEL.ui.dimFocusVeam) MODEL.ui.dimFocusVeam = {};
      const id = card.dataset.veam;
      openInlineState(dc, 'veam', id);
      renderDimCityDetail(dc);
    };
  });
  root.querySelectorAll('.inlineLkBlockType').forEach(sel=>{
    sel.onclick = e=>e.stopPropagation();
    sel.onchange = ()=>{
      const lk = MODEL.byLK.get(sel.dataset.lk); if(!lk) return;
      if(sel.value === 'Auto') lk.blockType = {mode:'Auto', value:'MIXED'};
      else lk.blockType = {mode:'Manual', value:sel.value};
      recomputeVeamUseAndIssues();
      recomputeUniverseStats();
      MODEL.ui.dirty = true;
      renderDimCityDetail(dc);
    };
  });
  root.querySelectorAll('.inlineLkVeamSlot').forEach(sel=>{
    sel.onclick = e=>e.stopPropagation();
    const lk = MODEL.byLK.get(sel.dataset.lk); if(lk) sel.value = lk.veam?.[Number(sel.dataset.slot)] || '';
    sel.onchange = ()=>{
      const lk = MODEL.byLK.get(sel.dataset.lk); if(!lk) return;
      const slot = Number(sel.dataset.slot);
      lk.veam[slot] = sel.value || null;
      recomputeVeamUseAndIssues();
      MODEL.ui.dirty = true;
      renderDimCityDetail(dc);
    };
  });
  const nodeSelect = root.querySelector('#dimNodeType');
  const splitterSelect = root.querySelector('#dimSplitterType');
  const btnAuto = root.querySelector('#dimAutoAssignNodes');
  const btnAddSplit = root.querySelector('#dimAddSplitter');
  if(btnAuto){
    btnAuto.onclick = ()=>{
      autoAssignDimCityNodes(dc, nodeSelect?.value || '');
      renderDimCityDetail(dc);
    };
  }
  const assignToggle = root.querySelector('#dimNetAssignToggle');
  if(assignToggle){
    assignToggle.onclick = ()=>{
      if(!MODEL.ui.dimNetworkAssignOpen) MODEL.ui.dimNetworkAssignOpen = {};
      MODEL.ui.dimNetworkAssignOpen[dc] = !MODEL.ui.dimNetworkAssignOpen[dc];
      renderDimCityDetail(dc);
    };
  }
  if(btnAddSplit){
    btnAddSplit.onclick = ()=>{
      const plan=getDimPlan(dc); plan.lastSplitterTypeId = splitterSelect?.value || '';
      addSplitterToDimCity(dc, splitterSelect?.value || '');
      renderDimCityDetail(dc);
    };
  }
  const btnAutoSplitters = root.querySelector('#dimAutoSplitters');
  if(btnAutoSplitters){
    btnAutoSplitters.onclick = ()=>{
      const plan=getDimPlan(dc); plan.lastSplitterTypeId = splitterSelect?.value || '';
      autoAddSplittersForDim(dc, splitterSelect?.value || '');
      renderDimCityDetail(dc);
    };
  }
  if(splitterSelect){ splitterSelect.onchange = ()=>{ const plan=getDimPlan(dc); plan.lastSplitterTypeId = splitterSelect.value; MODEL.ui.dirty=true; renderDimCityDetail(dc); }; }
  root.querySelectorAll('.dimRemoveNode').forEach(btn=>btn.onclick=()=>{ const plan=getDimPlan(dc); plan.nodes.splice(Number(btn.dataset.nodeIndex),1); MODEL.ui.dirty=true; renderDimCityDetail(dc); });
  root.querySelectorAll('.dimRemoveSplitter').forEach(btn=>btn.onclick=()=>{ const plan=getDimPlan(dc); plan.splitters.splice(Number(btn.dataset.splitterIndex),1); MODEL.ui.dirty=true; renderDimCityDetail(dc); });
  root.querySelectorAll('.dimNodeField').forEach(inp=>{
    if(inp.classList.contains('ipv4')) bindIpv4Input(inp, inp.dataset.field==='ip');
    inp.onclick=e=>e.stopPropagation();
    inp.onchange=()=>{ const plan=getDimPlan(dc); const n=plan.nodes[Number(inp.dataset.nodeIndex)]; if(!n) return; n[inp.dataset.field]=inp.value.trim(); MODEL.ui.dirty=true; if(inp.classList.contains('ipv4') && !isValidIpv4(inp.value, inp.dataset.field==='ip')) inp.classList.add('invalid'); };
  });
  root.querySelectorAll('.dimSplitterField').forEach(inp=>{ inp.onclick=e=>e.stopPropagation(); inp.onchange=()=>{ const plan=getDimPlan(dc); const sp=plan.splitters[Number(inp.dataset.splitterIndex)]; if(!sp) return; sp[inp.dataset.field]=inp.value.trim(); MODEL.ui.dirty=true; }; });
  root.querySelectorAll('.device-port.assignable[data-node-index]').forEach(port=>{ port.onclick=(e)=>{ e.stopPropagation(); openPortUniversePicker(dc, Number(port.dataset.nodeIndex), Number(port.dataset.portIndex)); }; });
  const btnExpandAll = root.querySelector('#dimExpandAll');
  if(btnExpandAll){ btnExpandAll.onclick = ()=>{ setAllInline(dc, true); renderDimCityDetail(dc); }; }
  const btnCollapseAll = root.querySelector('#dimCollapseAll');
  if(btnCollapseAll){ btnCollapseAll.onclick = ()=>{ setAllInline(dc, false); renderDimCityDetail(dc); }; }
  root.querySelectorAll('.uni-pool-chip').forEach(chip=>{
    chip.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', chip.dataset.uni || ''); });
  });
  root.querySelectorAll('.device-port.assignable[data-node-index]').forEach(port=>{
    port.addEventListener('dragover', e=>{ e.preventDefault(); port.classList.add('drop-hover'); });
    port.addEventListener('dragleave', ()=>port.classList.remove('drop-hover'));
    port.addEventListener('drop', e=>{
      e.preventDefault(); port.classList.remove('drop-hover');
      const uni = e.dataTransfer.getData('text/plain');
      const plan = getDimPlan(dc); const n = plan.nodes[Number(port.dataset.nodeIndex)]; if(!n) return;
      n.universes[Number(port.dataset.portIndex)] = Number(uni);
      MODEL.ui.dirty = true; renderDimCityDetail(dc);
    });
  });
  updateRightCsvVisibility();
}

// ===== Detailrouter =====
function renderDetail(kind, id, arg){
  if(kind==='VEAM')   return renderVeamDetail(id);
  if(kind==='LK')     return renderLKDetail(id);
  if(kind==='UNISUM') return renderUniverseDetail(id, arg);
  // Niet meer opstarten vanuit hier; de controller bepaalt.
  return renderRight();
}

// -- Rechterpaneel: HOME/DETAIL controller implementaties --
function renderRightHome(){
  const head = $('#lkHeader');
  const root = $('#lkDetail');
  if (!head || !root) return; // als de DOM-secties ontbreken, stil terugvallen

  head.textContent = 'Select an LK';
  root.innerHTML = '<div class="muted">No LK selected yet.</div>';
}

function renderRightDetail(){
  const sel = MODEL.selected || {};
  // Routeer uitsluitend het detail in de bovenste kaart (#lkDetail/#lkHeader);
  // het vaste CSV-paneel (#rightCsvSection) blijft buiten deze functie.
  if (sel.kind === 'LK')        return renderLKDetail(sel.id);
  if (sel.kind === 'VEAM')      return renderVeamDetail(sel.id);
  if (sel.kind === 'UNISUM')    return renderUniverseDetail(sel.id, sel.arg);
  if (sel.kind === 'DIM')       return renderDimCityDetail(sel.id);

  // Onbekend -> terug naar home
  return renderRightHome();
}



function renderDimCitiesBanner(container){
  hydrateDimOrigins();
  ensureDimColors();
  const sec = el('div','section');
  sec.appendChild(el('h3', null, 'DimCities'));
  const cnt = el('div','content');
  const dims = [...(MODEL.byDim?.keys?.() || [])].sort((a,b)=>a.localeCompare(b));
  cnt.innerHTML = dims.length
    ? `<div class="universe-chip-grid">${dims.map(dc=>`<button class="badge dim-quick" data-dc="${dc}" style="border-color:${dimColor(dc)};color:#eaf2ff;background:color-mix(in srgb,${dimColor(dc)} 20%,#0d1420)">${colorChip(dimColor(dc))}${dc}</button>`).join('')}</div><div class="hint">Select a DimCity to open the visual overview and change its color.</div>`
    : '<div class="muted">No DimCities yet.</div>';
  sec.appendChild(cnt);
  container.appendChild(sec);
  cnt.querySelectorAll('.dim-quick').forEach(btn=>{
    btn.onclick = ()=>{
      MODEL.selected = { kind:'DIM', id: btn.dataset.dc };
      MODEL.ui.rightMode = 'DETAIL';
      renderRight();
    };
  });
}

function renderDmxCablesGroup(dc, content){
  const key = `${dc}::DMX`;
  const open = MODEL.ui.groupOpen.has(key) ? MODEL.ui.groupOpen.get(key) : false;
  const hdr = el('div','toggle', `<span><span class="twist">${open?'▾':'▸'}</span> DMX Cables</span>`);
  hdr.onclick = ()=>{ MODEL.ui.groupOpen.set(key, !open); renderSummary(); };
  content.appendChild(hdr);

  if(!open) return;

  const list = el('ul','list subsec');
  const dmx = (MODEL.dmxLoose || []).filter(r=>r.dimcity===dc);
  if(!dmx.length){
    list.appendChild(el('li','item','<div class="muted">No loose DMX lines</div>'));
  } else {
    // sorteer: universe → dest
    dmx.sort((a,b)=>{
      const ua=(a.universe??1e9), ub=(b.universe??1e9);
      if(ua!==ub) return ua-ub;
      return (a.dest||'').localeCompare(b.dest||'');
    });
    for(const row of dmx){
      const li = el('li','item', `<div><b>Uni ${row.universe??'—'}</b> <span class="muted">${row.dest||'—'}</span> <span class="badge">DMX</span></div>`);
      list.appendChild(li);
    }
  }
  content.appendChild(list);
}


function renderLKDetail(id){
  const root = $('#lkDetail'); const head = $('#lkHeader');
  if(!id){ head.textContent='Select an LK'; root.innerHTML='<div class="muted">No LK selected yet.</div>'; return; }
  const lk = MODEL.byLK.get(id);
  const eff = effectiveBlockType(lk);

  // Kop
  const loc = (typeof lkAutoLocation === 'function' ? lkAutoLocation(lk) : '') || '';
  head.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div><b>${lk.id}</b></div>
      <div class="dimcity-tag">Location: ${loc || '—'}</div>
    </div>`;

  const container = el('div');

  // ========== Bloktype ==========
  const blkSec = el('div','section');
  blkSec.appendChild(el('h3', null, 'Bloktype'));
  const blkCnt = el('div','content');

  const selBlk = el('select');
  selBlk.innerHTML = `
    <option value="AUTO"  ${lk.blockType.mode==='Auto' ? 'selected' : ''}>Auto (detectie)</option>
    <option value="MIXED" ${lk.blockType.mode==='Manual'&&lk.blockType.value==='MIXED' ? 'selected' : ''}>${blockTypeLabel('MIXED')}</option>
    <option value="VEAM_ONLY" ${lk.blockType.mode==='Manual'&&lk.blockType.value==='VEAM_ONLY' ? 'selected' : ''}>${blockTypeLabel('VEAM_ONLY')}</option>
    <option value="XLR12" ${lk.blockType.mode==='Manual'&&lk.blockType.value==='XLR12' ? 'selected' : ''}>${blockTypeLabel('XLR12')}</option>
  `;
  const infoBlk = el('span','muted', ` Huidig: ${blockTypeLabel(eff)}`);
  blkCnt.appendChild(selBlk);
  blkCnt.appendChild(infoBlk);
  blkSec.appendChild(blkCnt);
  container.appendChild(blkSec);

  selBlk.onchange = ()=>{
    if (selBlk.value==='AUTO'){
      lk.blockType.mode='Auto';
      lk.blockType.value=autoBlockType(lk);
    } else {
      lk.blockType.mode='Manual';
      lk.blockType.value=selBlk.value;
    }
    if (effectiveBlockType(lk)==='XLR12'){
      // bij XLR12 alle Veam-koppelingen wissen
      lk.veam[1]=lk.veam[2]=lk.veam[3]=null;
    }
// In #lkAddConfirm
recomputeVeamUseAndIssues();
hydrateDimOrigins();   // ← toevoegen
renderSummary();
renderIssues();
MODEL.selected = { kind:'LK', id };
MODEL.ui.rightMode = 'DETAIL';
renderRight();

  };

  // Helper voor Veam-koppeling (alleen dropdown, GEEN handmatige input)
  const makeVeamRow = (label, slot, rangeTxt)=>{
    const wrap = el('div','row');
    wrap.appendChild(el('div',null,`<b>${label}</b> <span class="muted">(${rangeTxt})</span>`));

    // statusbadge
    const usage = slotUsage(lk, slot);
    const hardDisable = (effectiveBlockType(lk) === 'XLR12');
    const assigned = lk.veam[slot];
    const uses = assigned ? (MODEL.veamUse.get(assigned)||[]) : [];
    let badgeTxt, badgeClr;
    if (hardDisable){ badgeTxt='XLR12'; badgeClr='#9fb0c3'; }
    else if(usage.full){ badgeTxt='VOL'; badgeClr='#E53935'; }
    else if(assigned){
      if(uses.length>1){ badgeTxt='DUBBEL'; badgeClr='#E53935'; }
      else { badgeTxt='OK'; badgeClr='#1DB954'; }
    } else if(usage.partial){ badgeTxt='DEEL'; badgeClr='#FFC107'; }
    else { badgeTxt='VRIJ'; badgeClr='#9fb0c3'; }
    const note = el('span','badge', badgeTxt); note.style.color = badgeClr;
    wrap.appendChild(note);

    // dropdown (geen tekstveld)
    const pool = Array.from(MODEL.byDim.get(lk.dimcity)?.veams || []).sort();
    const sel = el('select'); sel.style.minWidth='180px';
    sel.innerHTML = `<option value="">— None —</option>` + pool.map(v=>`<option ${lk.veam[slot]===v?'selected':''} value="${v}">${v}</option>`).join('');
    sel.disabled = usage.full || hardDisable;

    // blokkerings-afhandeling
    if ((usage.full || hardDisable) && lk.veam[slot]) { lk.veam[slot] = null; }

    sel.onchange = ()=>{
      const u = slotUsage(lk, slot);
      const hd = effectiveBlockType(lk) === 'XLR12';
      if(u.full || hd){ sel.value=''; lk.veam[slot]=null; return; }
      lk.veam[slot] = sel.value || null;
recomputeVeamUseAndIssues();
renderIssues();
renderSummary();
MODEL.selected = { kind:'LK', id: lk.id };
MODEL.ui.rightMode = 'DETAIL';
renderRight();

    };

    wrap.appendChild(sel);
    return wrap;
  };

  // ========== Koppeling-sectie (alleen tonen als NIET XLR12) ==========
  if(eff !== 'XLR12'){
    const veSec = el('div','section');
    veSec.appendChild(el('h3', null, 'Veams aangesloten op LK'));
    const veCnt = el('div','content');
    const pool = Array.from(MODEL.byDim.get(lk.dimcity)?.veams || []).sort();
    veCnt.appendChild(el('div','hint', pool.length ? `Available in ${lk.dimcity}: ${pool.join(', ')}` : 'No Veams (V-IDs) in this DimCity.'));

    veCnt.appendChild(makeVeamRow('Veam 1','1','ports 1–4'));
    veCnt.appendChild(makeVeamRow('Veam 2','2','ports 5–8'));
    veCnt.appendChild(makeVeamRow('Veam 3','3','ports 9–12'));
    veSec.appendChild(veCnt);
    container.appendChild(veSec);
  }

  // ========== Detail-secties ==========
  const addXlr12PortsSection = ()=>{
    const sec = el('div','section');
    sec.appendChild(el('h3', null, 'LK ports 1–12'));
    const grid = el('div','grid4');
    for(let p=1;p<=12;p++){
      const LkLine = lk.lines.find(x=>x.port===p) || {universe:null,dest:'',status:'YELLOW'};
      const card = el('div','port', `
        <h5>Port ${p}</h5>
        <div class="kv">
          <div><b>LK Universe</b> ${LkLine.universe??'<span class="muted">leeg</span>'}</div>
          <div><b>LK Position</b> ${LkLine.dest||'<span class="muted">leeg</span>'}</div>
          <div><span class="pill ${LkLine.status}">${LkLine.status}</span></div>
        </div>`);
      grid.appendChild(card);
    }
    sec.appendChild(grid);
    container.appendChild(sec);
  };

  const addSlotSection = (slotIdx)=>{
    // Titel per modus
    const title =
      (eff === 'VEAM_ONLY')
        ? `Veam ${slotIdx}`
        : (slotIdx===1 ? `Veam 1 / Top 1–4` : (slotIdx===2 ? `Veam 2` : `Veam 3`));

    const ranges = {1:[1,4], 2:[5,8], 3:[9,12]};
    const [s,e] = ranges[slotIdx];

    const sec = el('div','section'); sec.appendChild(el('h3', null, title));
    const cnt = el('div','content');
    cnt.appendChild(el('div','hint',
      eff==='MIXED' && slotIdx===1
        ? 'Dit blok toont zowel LK- als Veam-waarden (zelfde circuit).'
        : 'Dit blok toont alleen Veam-waarden.'
    ));

    const grid = el('div','grid4');
    const assignedVeam = lk.veam[slotIdx] || null;

    for(let p=s;p<=e;p++){
      // LK-bron (alleen tonen bij MIXED & slot 1)
      const LkLine = lk.lines.find(x=>x.port===p) || {universe:null,dest:'',status:'YELLOW'};
      // Veam-bron
      let vePort=null;
      if(assignedVeam){
        const vPort = 1 + (p - s); // 1..4
        vePort = veamPortRecord(assignedVeam, vPort) || {universe:null,dest:''};
      }

      // inhoud conditioneel opbouwen
      const rows = [];
      const showLK = (eff==='MIXED' && slotIdx===1); // alleen voor slot 1 in MIXED
      const showVeam = (eff!=='XLR12');              // in MIXED/VEAM_ONLY altijd Veam-regels

      if (showLK){
        rows.push(`<div><b>LK Universe</b> ${LkLine.universe ?? '<span class="muted">leeg</span>'}</div>`);
        rows.push(`<div><b>LK Position</b> ${LkLine.dest || '<span class="muted">leeg</span>'}</div>`);
      }
      if (showVeam){
        rows.push(`<div><b>Veam Universe</b> ${vePort?.universe ?? '<span class="muted">—</span>'}</div>`);
        rows.push(`<div><b>Veam Position</b> ${vePort?.dest || '<span class="muted">—</span>'}</div>`);
      }
      // statusbadge alleen zinvol als LK zichtbaar is, anders laten we hem weg
      if (showLK){
        rows.push(`<div><span class="pill ${LkLine.status}">${LkLine.status}</span></div>`);
      }

      const card = el('div','port', `
        <h5>Port ${p}</h5>
        <div class="kv">${rows.join('')}</div>
      `);
      grid.appendChild(card);
    }

    cnt.appendChild(grid);
    sec.appendChild(cnt);
    container.appendChild(sec);
  };

  // Render detail volgens bloktype
  if (eff === 'XLR12'){
    // Alleen één sectie met LK ports
    addXlr12PortsSection();
  } else {
    // MIXED of VEAM_ONLY: drie slot-secties
    addSlotSection(1);
    addSlotSection(2);
    addSlotSection(3);
  }

  root.innerHTML=''; root.appendChild(container);
}





function renderVeamDetail(vid){
  const root = $('#lkDetail'); const head=$('#lkHeader');
  const ve = MODEL.byVeam.get(vid);
  if(!ve){ head.textContent=`${vid}`; root.innerHTML='<div class="muted">No data for this Veam.</div>'; return; }
  const loc = veamAutoLocation(ve) || '';
head.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
    <div><b>${ve.id}</b></div>
    <div class="dimcity-tag">Location: ${loc || '—'}</div>
  </div>`;

  const container = el('div');

  const sec = el('div','section');
  sec.appendChild(el('h3', null, `Veam ${ve.id} — ports`));
  const cnt = el('div','content');
  const grid = el('div','grid4');

  for(let p=1;p<=4;p++){
    const L = ve.lines.find(x=>x.port===p) || {universe:null,dest:'',status:'YELLOW'};
    const card = el('div','port', `
      <h5>Port ${p}</h5>
      <div class="kv">
        <div><b>Universe</b> ${L.universe??'<span class="muted">leeg</span>'}</div>
        <div><b>Position</b> ${L.dest||'<span class="muted">leeg</span>'}</div>
        <div><span class="pill ${L.status}">${L.status}</span></div>
      </div>`);
    grid.appendChild(card);
  }
  cnt.appendChild(grid);
  const uses = MODEL.veamUse.get(ve.id)||[];
  const status = uses.length===0 ? '<span class="ok">Niet gekoppeld</span>'
                : uses.length===1 ? `Gekoppeld aan ${uses[0].lkId} (Veam ${uses[0].slot})`
                : `<span class="danger">DUBBEL: ${uses.map(u=>u.lkId+'(V'+u.slot+')').join(', ')}</span>`;
  cnt.appendChild(el('div','hint', `Status: ${status}`));
  sec.appendChild(cnt);
  container.appendChild(sec);

  root.innerHTML=''; root.appendChild(container);
}

// ——— Rechterpaneel: universes per DimCity, uitklapbaar in tabellen ———
function renderUniverseDetail(dc, focusU){
  const head = $('#lkHeader'), root = $('#lkDetail');
  head.innerHTML = `Universes in <span class="dimcity-tag">${dc}</span>`;

  // eigen open/dicht map voor RECHTERpaneel
  if (!MODEL.ui.universeOpenRight) MODEL.ui.universeOpenRight = new Map();

  // verzamel per-universe alle hits
  const perU = new Map(); // '123' -> { lk:[{lkId,port,dest}], veam:[{veamId,port,dest}] }
  const bump = (u, kind, rec) => {
    if(u==null || u==='') return;
    u = String(u);
    if(!perU.has(u)) perU.set(u, { lk:[], veam:[] });
    perU.get(u)[kind].push(rec);
  };

  // LK-bron
  for (const [, lk] of MODEL.byLK){
    if (lk.dimcity !== dc) continue;
    for (const L of lk.lines){
      if(!L || L.universe==null || L.universe==='') continue;
      bump(L.universe, 'lk',   { lkId: lk.id,   port: L.port, dest: L.dest||'' });
    }
  }
  // Veam-bron
  for (const [, ve] of MODEL.byVeam){
    if (ve.dimcity !== dc) continue;
    for (const R of ve.lines){
      if(!R || R.universe==null || R.universe==='') continue;
      bump(R.universe, 'veam', { veamId: ve.id, port: R.port, dest: R.dest||'' });
    }
  }

  const entries = [...perU.entries()].sort((a,b)=> Number(a[0]) - Number(b[0]));
  const container = el('div');

  // samenvatting bovenaan
  const totalUniq  = entries.length;
  const totalPorts = entries.reduce((acc,[,info])=> acc + info.lk.length + info.veam.length, 0);
  container.appendChild(
    el('div','content', `<div><b>${totalUniq}</b> unique universes • <b>${totalPorts}</b> patch points</div>`)
  );

  // accordeonlijst
  const ul = el('ul','list');

  for (const [u, info] of entries){
    const key = `RIGHT::${dc}::U::${u}`;
    const presetOpen = (focusU != null && String(focusU) === String(u));
    const remembered  = MODEL.ui.universeOpenRight.get(key);
    const open = (remembered == null) ? !!presetOpen : remembered;

    const li  = el('li','item');
    const hdr = el('div','toggle',
      `<span class="twist">${open ? '▾' : '▸'}</span> <b>Uni${u}</b> <span class="muted">Total ${info.lk.length + info.veam.length} • LK ${info.lk.length} • Veam ${info.veam.length}</span>`
    );

    const toggle = ()=>{
      MODEL.ui.universeOpenRight.set(key, !open);
      renderUniverseDetail(dc, u);
    };
    hdr.querySelector('.twist').onclick = (e)=>{ e.stopPropagation(); toggle(); };
    hdr.onclick = toggle;
    li.appendChild(hdr);

    if(open){
      const sub = el('div','subsec');

      // ===== Tabel: LK ports =====
      if (info.lk.length){
        const rowsLK = info.lk
          .sort((a,b)=> (a.lkId===b.lkId ? a.port-b.port : a.lkId.localeCompare(b.lkId)))
          .map(x => `<tr><td>${x.lkId}</td><td>${x.port}</td><td>${x.dest || '—'}</td></tr>`)
          .join('');
        const tblLK = `
          <div><b>LK ports</b></div>
          <div class="content" style="padding-left:0;">
            <table>
              <thead><tr><th>LK</th><th>Port</th><th>Locatie</th></tr></thead>
              <tbody>${rowsLK}</tbody>
            </table>
          </div>`;
        sub.appendChild(el('div', null, tblLK));
      } else {
        sub.appendChild(el('div','muted','Geen LK ports'));
      }

      // ===== Tabel: Veam ports =====
      if (info.veam.length){
        const rowsV = info.veam
          .sort((a,b)=> (a.veamId===b.veamId ? a.port-b.port : a.veamId.localeCompare(b.veamId)))
          .map(x => `<tr><td>${x.veamId}</td><td>${x.port}</td><td>${x.dest || '—'}</td></tr>`)
          .join('');
        const tblV = `
          <div style="margin-top:10px;"><b>Veam ports</b></div>
          <div class="content" style="padding-left:0;">
            <table>
              <thead><tr><th>Veam</th><th>Port</th><th>Locatie</th></tr></thead>
              <tbody>${rowsV}</tbody>
            </table>
          </div>`;
        sub.appendChild(el('div', null, tblV));
      } else {
        sub.appendChild(el('div','muted','Geen Veam ports'));
      }

      li.appendChild(sub);
    }

    ul.appendChild(li);
  }

  container.appendChild(ul);
  root.innerHTML = '';
  root.appendChild(container);

  // bij focus: scroll die Uni in beeld
  if (focusU != null){
    setTimeout(()=>{
      const items = [...root.querySelectorAll('.item')];
      const t = items.find(el => el.textContent.trim().startsWith(`Uni${focusU}`));
      if (t) t.scrollIntoView({ block:'start' });
    }, 0);
  }
}






function renderHeaderInline(lk){
  const loc = (typeof lkAutoLocation === 'function' ? lkAutoLocation(lk) : '') || '';
  $('#lkHeader').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div><b>${lk.id}</b></div>
      <div class="dimcity-tag">Location: ${loc || '—'}</div>
    </div>`;
}


// ——— Universes-sectie in het Overzicht (links) ———
function renderSummaryUniversesSection(dc, content){
  const gUNI = `${dc}::UNI`;
  const uniOpen = MODEL.ui.groupOpen.has(gUNI) ? MODEL.ui.groupOpen.get(gUNI) : false;

  const uniHdr = el('div','toggle', `<span><span class="twist">${uniOpen?'▾':'▸'}</span> Universes</span>`);
  uniHdr.onclick = ()=>{ MODEL.ui.groupOpen.set(gUNI, !uniOpen); renderSummary(); };
  uniHdr.ondblclick = (e)=>{
    e.stopPropagation();
    MODEL.selected = { kind:'DIM', id: dc };
    MODEL.ui.rightMode = 'DETAIL';
    renderRight();
  };
  content.appendChild(uniHdr);
  if (!uniOpen) return;

  const ulU = el('ul','list subsec');
  const stat = MODEL.uniStats.get(dc);
  if (!stat || stat.counts.size === 0){
    ulU.appendChild(el('li','item','<div class="muted">No universes</div>'));
    content.appendChild(ulU);
    return;
  }

  const liTot = el('li','item', `<div><b>${stat.totalUniq}</b> unique • <b>${stat.totalPorts}</b> patch points</div>`);
  liTot.onclick = ()=>{
    MODEL.selected = { kind:'DIM', id: dc };
    MODEL.ui.rightMode = 'DETAIL';
    renderRight();
  };
  ulU.appendChild(liTot);

  const all = [...stat.counts.entries()].sort((a,b)=> Number(a[0]) - Number(b[0]));
  for (const [u,c] of all){
    const total = c.lk + c.veam + (c.dmx||0);
    const parts = [`Total ${total}`, `LK ${c.lk}`, `Veam ${c.veam}`];
    if ((c.dmx||0) > 0) parts.push(`DMX ${c.dmx}`);
    const liU = el('li','item', `<div><b>UNI ${u}</b> <span class="muted">${parts.join(' • ')}</span></div>`);
    liU.onclick = ()=>{
      if(!MODEL.ui.dimFocusUniverse) MODEL.ui.dimFocusUniverse = {};
      MODEL.ui.dimFocusUniverse[dc] = String(u);
      MODEL.selected = { kind:'DIM', id: dc };
      MODEL.ui.rightMode = 'DETAIL';
      renderRight();
    };
    ulU.appendChild(liU);
  }
  content.appendChild(ulU);
}


// LAAT IN renderRightDetail() ALLEEN HET DETAIL STAAN
function updateRightCsvVisibility(){
  const sec = document.querySelector('#rightCsvSection');
  if(!sec) return;
  const sel = MODEL.selected || {};
  const show = (MODEL.ui.rightMode === 'DETAIL' && sel.kind === 'DIM');
  sec.style.display = show ? '' : 'none';
}
function renderRight(){
  const mode = MODEL.ui.rightMode || 'HOME';
  const sel = MODEL.selected || {kind:null};
  updateRightCsvVisibility();
  if (mode === 'DETAIL' && sel.kind){
    return renderRightDetail();
  }
  return renderRightHome();
}

// ===== Tools: helpers =====
function showToolsModal(which){
  // which: 'LK' | 'VEAM'
  $('#toolsBackdrop').style.display = 'flex';
  $('#modalAddLK').style.display   = (which==='LK')   ? 'block' : 'none';
  $('#modalAddVeam').style.display = (which==='VEAM') ? 'block' : 'none';
  if (which==='LK'){
    $('#lkInputId').value = '';
    $('#lkInputBlockType').value = 'MIXED';
    $('#lkAddError').textContent = '';
    $('#lkInputId').focus();
  } else {
    $('#veamInputId').value = '';
    $('#veamAddError').textContent = '';
    $('#veamInputId').focus();
  }
}
function closeToolsModal(){
  $('#toolsBackdrop').style.display = 'none';
  $('#modalAddLK').style.display = 'none';
  $('#modalAddVeam').style.display = 'none';
}


// ===== File: Imported CSV files modal =====
function showCsvSourcesModal(){
  const sources = Array.isArray(MODEL.csvSources) ? MODEL.csvSources : [];
  const bd = document.createElement('div');
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:10002';
  const modal = document.createElement('div');
  modal.style.cssText = 'width:min(760px,94vw);max-height:86vh;overflow:auto;background:#121820;color:#eaf2ff;border:1px solid #1e2835;border-radius:12px;padding:14px;font:14px/1.4 system-ui';
  modal.innerHTML = `
    <h3 style="margin:0 0 10px 0">Imported CSV files</h3>
    <div class="hint" style="margin-bottom:10px">These files are part of the project. Use Replace when a source CSV has been updated.</div>
    <div id="csvSourceList"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button id="csvSourcesClose" style="background:#334155;color:#eaf2ff">Close</button></div>
  `;
  bd.appendChild(modal);
  document.body.appendChild(bd);
  const list = modal.querySelector('#csvSourceList');
  if(!sources.length){
    list.innerHTML = '<div class="device-list-empty">No imported CSV files yet.</div>';
  } else {
    list.innerHTML = sources.map(src => `
      <div class="device-card">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div>
            <h4>${src.name || shortFileName(src.path)}</h4>
            <div class="muted">Rows: ${src.rowCount || (src.rows?.length || 0)}</div>
            <div class="muted">Imported: ${src.importedAt ? new Date(src.importedAt).toLocaleString() : '—'}</div>
            <div class="muted">Updated: ${src.updatedAt ? new Date(src.updatedAt).toLocaleString() : '—'}</div>
          </div>
          <button class="csv-replace" data-source-id="${src.id}" style="background:#4ea8ff;color:#00111f">Replace</button>
        </div>
      </div>
    `).join('');
  }
  modal.querySelector('#csvSourcesClose').onclick = ()=> bd.remove();
  bd.addEventListener('mousedown', e=>{ if(e.target===bd) bd.remove(); });
  modal.querySelectorAll('.csv-replace').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const src = sources.find(s=>s.id===btn.dataset.sourceId);
      if(!src) return;
      const ok = window.confirm(`Replace CSV: ${src.name || shortFileName(src.path)}\n\nWarning: if rows from this CSV were changed manually, they will be overwritten by the new import.`);
      if(!ok) return;
      bd.remove();
      await window.startImportCsv?.({ replaceSourceId:src.id, sourceName:src.name || shortFileName(src.path) });
    });
  });
}

// ===== Network Devices: data helpers =====
function normalizeNetworkDevices(net){
  const base = { prefs:{ nodeSparePorts:0, splitterSparePorts:0 }, nodeTypes:[], splitterTypes:[], nodes:[], splitters:[], dimCityPlans:{} };
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
      splitterSparePorts: Number(net.prefs?.splitterSparePorts ?? 0)
    },
    nodeTypes,
    splitterTypes,
    nodes: Array.isArray(net.nodes) ? net.nodes : [],
    splitters: Array.isArray(net.splitters) ? net.splitters : [],
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
function normalizeTypeId(prefix, value, list){
  const v = String(value || '').trim();
  if(v) return v;
  return nextTypedId(prefix, list || []);
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
  const vid = lk.veam?.[slot] || null;
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
    return `<div class="lk-port-cell ${filled?'filled':''} ${m.conflict?'conflict':''}" title="${esc(titleParts.join(' • '))}"><div class="pnum">${p}</div><div class="puniverse">${filled?`UNI ${esc(m.universe)}`:'—'}</div><div class="pdest">${esc(m.dest || '')}</div><div class="psource">${esc(m.source || '')}</div></div>`;
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
  bd.innerHTML = `<div class="mini-modal"><div class="mini-modal-head"><b>Select universe</b><button id="miniClose" style="background:#334155;color:#eaf2ff">Close</button></div><div class="hint">${esc(n.id || n.name)} • port ${portIndex+1}</div><div class="universe-picker"><button class="pick-empty">Empty</button>${universes.map(u=>`<button class="pick-uni" data-uni="${u}">UNI ${u}</button>`).join('')}</div></div>`;
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
function renderNodeTypeFace(nodeType, assigned=[]){
  const ports = Number(nodeType.portCount || 0);
  const color = safeHex(nodeType.color || '#4ea8ff');
  let html = '';
  for(let i=1;i<=ports;i++){
    const u = assigned[i-1];
    const label = u != null && u !== '' ? `UNI ${u}` : String(i);
    html += devicePortHtml(label, `Port ${i}${u != null && u !== '' ? ` • Universe ${u}` : ''}`);
  }
  return `<div class="device-face compact" style="--device-color:${color}"><div class="device-face-title"><b>${esc(nodeType.brand || 'DMX Node')} ${esc(nodeType.name || nodeType.id || '')}</b><span>${ports} universe ports</span></div><div class="device-ports">${html}</div></div>`;
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
  return `<div class="device-face node-instance-face" style="--device-color:${color}"><div class="device-face-title"><b>${esc(nodeType.brand || 'DMX Node')} ${esc(nodeType.name || nodeType.id || '')}</b><span>${ports} universe ports</span></div><div class="device-ports node-port-row">${html}</div></div>`;
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
    MODEL.networkDevices.dimCityPlans[dc] = { nodeTypeId:'', splitterTypeIds:[], nodes:[], splitters:[] };
  }
  const plan = MODEL.networkDevices.dimCityPlans[dc];
  if(!Array.isArray(plan.splitterTypeIds)) plan.splitterTypeIds = [];
  if(!Array.isArray(plan.nodes)) plan.nodes = [];
  if(!Array.isArray(plan.splitters)) plan.splitters = [];
  return plan;
}
function autoAssignDimCityNodes(dc, nodeTypeId){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const nt = MODEL.networkDevices.nodeTypes.find(x=>x.id===nodeTypeId) || MODEL.networkDevices.nodeTypes[0];
  if(!nt) return null;
  const universes = uniqueUniversesInDim(dc);
  const spare = Number(MODEL.networkDevices.prefs.nodeSparePorts || 0);
  const usable = Math.max(1, Number(nt.portCount || 1) - spare);
  const plan = getDimPlan(dc);
  plan.nodeTypeId = nt.id;
  plan.nodes = [];
  for(let i=0;i<universes.length;i+=usable){
    const chunk = universes.slice(i, i+usable);
    const idx = plan.nodes.length;
    plan.nodes.push(createNodeInstance(dc, nt, idx, chunk));
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
  if(!Array.isArray(plan.splitterTypeIds)) plan.splitterTypeIds = [];
  plan.splitterTypeIds.push(sp.id);
  plan.splitters.push(createSplitterInstance(dc, sp, plan.splitters.length, []));
  refreshDimDeviceIdentity(dc);
  MODEL.ui.dirty = true;
  return plan;
}
function autoAddSplittersForDim(dc, splitterTypeId){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const sp = MODEL.networkDevices.splitterTypes.find(x=>x.id===splitterTypeId) || MODEL.networkDevices.splitterTypes[0];
  if(!sp) return null;
  const calc = splitCalcForDim(dc, sp.id);
  const plan = getDimPlan(dc);
  plan.splitters = [];
  const universes = uniqueUniversesInDim(dc);
  for(let i=0;i<calc.splitterCount;i++){
    const u = universes.slice(i*(sp.mode==='AB'?2:1), i*(sp.mode==='AB'?2:1)+(sp.mode==='AB'?2:1));
    plan.splitters.push(createSplitterInstance(dc, sp, plan.splitters.length, u));
  }
  refreshDimDeviceIdentity(dc);
  MODEL.ui.dirty = true;
  return plan;
}
function renderDimNetworkDevices(dc){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const plan = getDimPlan(dc);
  refreshDimDeviceIdentity(dc);
  const assignOpen = !!MODEL.ui.dimNetworkAssignOpen?.[dc];
  const universes = uniqueUniversesInDim(dc);
  const universePool = universes.map(u=>`<button class="uni-pool-chip" draggable="true" data-uni="${u}" title="Drag to a node port or click a node port to choose">UNI ${u}</button>`).join('') || '<span class="muted">No universes in this DimCity.</span>';
  const nodeTypeOptions = MODEL.networkDevices.nodeTypes.map(nt=>`<option value="${esc(nt.id)}" ${plan.nodeTypeId===nt.id?'selected':''}>${esc(nt.brand || '')} ${esc(nt.name || nt.id)} (${Number(nt.portCount||0)} ports)</option>`).join('');
  const splitterTypeOptions = MODEL.networkDevices.splitterTypes.map(sp=>`<option value="${esc(sp.id)}">${esc(sp.brand || '')} ${esc(sp.name || sp.id)} (${Number(sp.outputCount||0)} outputs)</option>`).join('');
  const selectedSplitter = MODEL.networkDevices.splitterTypes.find(x=>x.id === (plan.lastSplitterTypeId || MODEL.networkDevices.splitterTypes[0]?.id)) || MODEL.networkDevices.splitterTypes[0];
  const splitCalc = selectedSplitter ? splitCalcForDim(dc, selectedSplitter.id) : null;

  const nodeHtml = (plan.nodes||[]).map((n,idx)=>{
    const nt = MODEL.networkDevices.nodeTypes.find(x=>x.id===n.typeId);
    if(!nt) return '';
    if(!Array.isArray(n.universes)) n.universes = [];
    const ip = n.ip || '';
    const subnet = n.subnet || nt.subnet || '255.255.255.0';
    return `<div class="network-instance node-instance" style="--device-color:${safeHex(nt.color || '#4ea8ff')}">
      <div class="network-instance-head"><div><b>${esc(n.id || '')}</b> <span class="muted">${esc(n.name || '')}</span><div class="muted">${esc(nt.brand || '')} ${esc(nt.name || nt.id)} • segment ${esc(n.segment || '')} • ${Number(nt.portCount||0)} ports</div></div><button class="dimRemoveNode" data-node-index="${idx}" style="background:#E53935;color:#fff">Remove</button></div>
      <div class="network-instance-fields">
        <label>ID<input class="dimNodeField" data-node-index="${idx}" data-field="id" value="${esc(n.id || '')}"></label>
        <label>Name<input class="dimNodeField" data-node-index="${idx}" data-field="name" value="${esc(n.name || '')}"></label>
        <label>Device no.<input class="dimNodeField" data-node-index="${idx}" data-field="deviceNo" value="${esc(n.deviceNo || '')}"></label>
        <label>Segment<input class="dimNodeField" data-node-index="${idx}" data-field="segment" value="${esc(n.segment || '')}"></label>
        <label>IP address<input class="dimNodeField ipv4" data-node-index="${idx}" data-field="ip" value="${esc(ip)}" inputmode="numeric" placeholder="192.168.1.10"></label>
        <label>Subnet<input class="dimNodeField ipv4" data-node-index="${idx}" data-field="subnet" value="${esc(subnet)}" inputmode="numeric" placeholder="255.255.255.0"></label>
      </div>
      ${renderNodeInstanceFace(nt, n, idx, dc)}
    </div>`;
  }).join('');
  const splitterHtml = (plan.splitters||[]).map((spInst,idx)=>{
    const sp = MODEL.networkDevices.splitterTypes.find(x=>x.id===spInst.typeId);
    if(!sp) return '';
    return `<div class="network-instance splitter-instance" style="--device-color:${safeHex(sp.color || '#FFC107')}">
      <div class="network-instance-head"><div><b>${esc(spInst.id || '')}</b> <span class="muted">${esc(spInst.name || '')}</span><div class="muted">${esc(sp.brand || '')} ${esc(sp.name || sp.id)} • ${sp.mode==='AB'?'A/B input':'Single input'} • ${Number(sp.outputCount||0)} outputs</div></div><button class="dimRemoveSplitter" data-splitter-index="${idx}" style="background:#E53935;color:#fff">Remove</button></div>
      <div class="network-instance-fields">
        <label>ID<input class="dimSplitterField" data-splitter-index="${idx}" data-field="id" value="${esc(spInst.id || '')}"></label>
        <label>Name<input class="dimSplitterField" data-splitter-index="${idx}" data-field="name" value="${esc(spInst.name || '')}"></label>
        <label>Device no.<input class="dimSplitterField" data-splitter-index="${idx}" data-field="deviceNo" value="${esc(spInst.deviceNo || '')}"></label>
        <label>Segment<input class="dimSplitterField" data-splitter-index="${idx}" data-field="segment" value="${esc(spInst.segment || '')}"></label>
      </div>
      ${renderSplitterTypeFace(sp)}
      <div class="hint">Universes planned: ${(spInst.universes||[]).map(u=>`UNI ${u}`).join(', ') || 'not assigned yet'}</div>
    </div>`;
  }).join('');
  return `
    <div class="section dim-section network-dim-section" style="--dim-color:${dimColor(dc)}"><h3>Nodes in ${dc}</h3><div class="content">
      <div class="toggle" id="dimNetAssignToggle"><span><span class="twist">${assignOpen?'▾':'▸'}</span> Auto-assign / add devices</span><span class="muted">${universes.length} universes</span></div>
      <div class="network-assign-panel ${assignOpen?'open':''}">
        <div class="planner-controls">
          <label><span class="muted">Node type</span><select id="dimNodeType">${nodeTypeOptions || '<option value="">No node types yet</option>'}</select></label>
          <button id="dimAutoAssignNodes">Auto-assign nodes</button>
          <label><span class="muted">Splitter type</span><select id="dimSplitterType">${splitterTypeOptions || '<option value="">No splitter types yet</option>'}</select></label>
          <button id="dimAddSplitter" style="background:#334155;color:#eaf2ff">Add one splitter</button>
          <button id="dimAutoSplitters" style="background:#334155;color:#eaf2ff">Auto-calculate splitters</button>
        </div>
        <div class="hint">Node auto-assign places universes low-to-high. Device ID/IP are refreshed from the DimCity number and selected type.</div>
        ${splitCalc ? `<div class="split-calc-box"><b>Splitter calculation</b><br>${esc(selectedSplitter.brand || '')} ${esc(selectedSplitter.name || selectedSplitter.id)}: ${splitCalc.splitterCount} splitter(s) estimated • capacity ${splitCalc.capacity} outputs per universe feed • ${splitCalc.buses} input bus(es)</div>` : ''}
      </div>
      <div class="network-layout">
        <div class="universe-pool"><div class="network-list-title">Universe pool</div><div class="universe-pool-list">${universePool}</div><div class="hint">Drag a UNI to a node port, or click a node port for a selector.</div></div>
        <div><div class="network-list-title">DMX nodes <span class="muted">${plan.nodes.length} placed</span></div><div class="network-device-list">${nodeHtml || '<div class="device-list-empty">No nodes assigned yet.</div>'}</div></div>
      </div>
    </div></div>
    <div class="section dim-section splitter-dim-section" style="--dim-color:${dimColor(dc)}"><h3>Splitters in ${dc}</h3><div class="content">
      <div class="dim-pill-row"><span class="info-pill">${plan.splitters.length} splitters placed</span><span class="info-pill">Spare outputs: ${Number(MODEL.networkDevices.prefs.splitterSparePorts || 0)}</span></div>
      <div class="network-device-list">${splitterHtml || '<div class="device-list-empty">No splitters assigned yet.</div>'}</div>
    </div></div>`;
}
function downloadNetworkLibrary(kind){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const isNode = kind === 'node';
  const payload = {
    fileType: isNode ? 'dimcity-node-types' : 'dimcity-splitter-types',
    version: 1,
    exportedAt: new Date().toISOString(),
    items: isNode ? MODEL.networkDevices.nodeTypes : MODEL.networkDevices.splitterTypes
  };
  const name = isNode ? 'dimcity-node-types.json' : 'dimcity-splitter-types.json';
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function importNetworkLibrary(kind, onDone){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = ()=>{
    const f = input.files?.[0];
    if(!f) return;
    const rd = new FileReader();
    rd.onload = ()=>{
      try{
        const data = JSON.parse(rd.result);
        const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
        MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
        const key = kind === 'node' ? 'nodeTypes' : 'splitterTypes';
        let added = 0, updated = 0;
        for(const item of items){
          if(!item || typeof item !== 'object') continue;
          const id = String(item.id || '').trim();
          if(!id) continue;
          const list = MODEL.networkDevices[key];
          const idx = list.findIndex(x=>x.id === id);
          if(idx >= 0){ list[idx] = {...list[idx], ...item}; updated++; }
          else { list.push(item); added++; }
        }
        MODEL.ui.dirty = true;
        alert(`Library imported. Added: ${added}. Updated: ${updated}.`);
        onDone?.();
      }catch(err){
        alert('Could not import library: ' + err.message);
      }
    };
    rd.readAsText(f);
  };
  input.click();
}

// ===== Node Type Builder =====
function showNodeTypeBuilder(){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const bd = document.createElement('div');
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;z-index:10002';
  const modal = document.createElement('div');
  modal.style.cssText = 'width:min(1180px,96vw);max-height:92vh;overflow:auto;background:#101f34;color:#eaf4ff;border:1px solid #23405f;border-radius:14px;padding:16px;font:14px/1.4 system-ui';
  modal.innerHTML = `
    <div class="builder-v4-toolbar" style="margin-bottom:12px">
      <h3 style="margin:0">Node Type Builder</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="nodeNew">Build new node type</button>
        <button id="nodeExport" style="background:#334155;color:#eaf2ff">Export library</button>
        <button id="nodeImport" style="background:#334155;color:#eaf2ff">Import library</button>
        <button id="nodeBuilderClose" style="background:#334155;color:#eaf2ff">Close</button>
      </div>
    </div>
    <div class="builder-v4-grid">
      <div class="device-card builder-v4-form" id="nodeFormWrap">
        <h4 id="nodeFormTitle">New node type</h4>
        <input id="nodeEditId" type="hidden">
        <div class="device-form">
          <label>Type key</label><input id="ntId" type="text" value="${nextTypedId('NODE:', MODEL.networkDevices.nodeTypes)}" placeholder="NODE:01">
          <label>Brand</label><input id="ntBrand" type="text" placeholder="Luminex / ELC / ...">
          <label>Type</label><input id="ntName" type="text" placeholder="LumiNode 12">
          <label>Universe ports</label><input id="ntPorts" type="number" min="1" max="64" value="8">
          <label>Default IP</label><input id="ntIp" class="ipv4" type="text" inputmode="numeric" placeholder="192.168.1.1">
          <label>Subnet</label><input id="ntSubnet" class="ipv4" type="text" inputmode="numeric" value="255.255.255.0">
          <label>Color</label><input id="ntColor" type="color" value="#4ea8ff">
        </div>
        <div id="nodeTypePreview" style="margin-top:10px"></div>
        <div class="device-actions">
          <button id="nodeDelete" style="background:#E53935;color:#fff">Delete</button>
          <button id="nodeSave">Save type</button>
        </div>
      </div>
      <div>
        <div class="hint" style="margin-bottom:10px">Create reusable node types once. Actual device IDs/IPs are created later inside a DimCity.</div>
        <div id="nodeTypeList" class="builder-list"></div>
      </div>
    </div>`;
  bd.appendChild(modal);
  document.body.appendChild(bd);
  const formWrap = modal.querySelector('#nodeFormWrap');
  bindIpv4Input(modal.querySelector('#ntIp'), true);
  bindIpv4Input(modal.querySelector('#ntSubnet'), false);
  const getForm = () => ({
    id: normalizeTypeId('NODE:', modal.querySelector('#ntId').value, MODEL.networkDevices.nodeTypes),
    name: modal.querySelector('#ntName').value.trim(),
    brand: modal.querySelector('#ntBrand').value.trim(),
    portCount: Math.max(1, Number(modal.querySelector('#ntPorts').value || 1)),
    defaultIp: modal.querySelector('#ntIp').value.trim(),
    subnet: modal.querySelector('#ntSubnet').value.trim() || '255.255.255.0',
    color: safeHex(modal.querySelector('#ntColor').value, '#4ea8ff')
  });
  const setForm = (nt=null)=>{
    formWrap.classList.add('open');
    modal.querySelector('#nodeEditId').value = nt?.id || '';
    modal.querySelector('#nodeFormTitle').textContent = nt ? `Edit node type: ${nt.brand || ''} ${nt.name || nt.id}` : 'Build new node type';
    modal.querySelector('#ntId').value = nt?.id || nextTypedId('NODE:', MODEL.networkDevices.nodeTypes);
    modal.querySelector('#ntName').value = nt?.name || '';
    modal.querySelector('#ntBrand').value = nt?.brand || '';
    modal.querySelector('#ntPorts').value = nt?.portCount || 8;
    modal.querySelector('#ntIp').value = nt?.defaultIp || '';
    modal.querySelector('#ntSubnet').value = nt?.subnet || '255.255.255.0';
    modal.querySelector('#ntColor').value = safeHex(nt?.color || '#4ea8ff', '#4ea8ff');
    redraw(nt?.id || '');
  };
  const redraw = (selectedId='')=>{
    MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
    modal.querySelector('#nodeTypePreview').innerHTML = renderNodeTypeFace(getForm());
    modal.querySelector('#nodeTypeList').innerHTML = MODEL.networkDevices.nodeTypes.length ? MODEL.networkDevices.nodeTypes.map(nt=>`
      <div class="builder-type-card ${selectedId===nt.id?'selected':''}" data-id="${esc(nt.id)}" style="--device-color:${safeHex(nt.color || '#4ea8ff')}">
        <h4>${colorChip(nt.color || '#4ea8ff')}${esc(nt.brand || 'DMX Node')} ${esc(nt.name || nt.id)}</h4>
        <div class="muted">Type key: ${esc(nt.id)} • ${Number(nt.portCount || 0)} ports • ${esc(nt.defaultIp || '')} ${esc(nt.subnet || '')}</div>
        ${renderNodeTypeFace(nt)}
      </div>`).join('') : '<div class="device-list-empty">No node types yet. Click “Build new node type”.</div>';
    modal.querySelectorAll('.builder-type-card[data-id]').forEach(card=>card.onclick=()=>{
      const nt = MODEL.networkDevices.nodeTypes.find(x=>x.id===card.dataset.id);
      if(nt) setForm(nt);
    });
  };
  modal.querySelector('#nodeBuilderClose').onclick = ()=> bd.remove();
  bd.addEventListener('mousedown', e=>{ if(e.target===bd) bd.remove(); });
  ['ntId','ntName','ntBrand','ntPorts','ntIp','ntSubnet','ntColor'].forEach(id=>modal.querySelector('#'+id).addEventListener('input', ()=>redraw(modal.querySelector('#nodeEditId').value)));
  modal.querySelector('#nodeNew').onclick = ()=> setForm(null);
  modal.querySelector('#nodeSave').onclick = ()=>{
    if(!isValidIpv4(modal.querySelector('#ntIp').value, true)){ alert('Default IP must be a valid IPv4 address, for example 192.168.1.1'); return; }
    if(!isValidIpv4(modal.querySelector('#ntSubnet').value, false)){ alert('Subnet must be a valid IPv4 address, for example 255.255.255.0'); return; }
    const item = getForm();
    const oldId = modal.querySelector('#nodeEditId').value;
    const idx = MODEL.networkDevices.nodeTypes.findIndex(x=>x.id === oldId || x.id === item.id);
    if(idx >= 0) MODEL.networkDevices.nodeTypes[idx] = item; else MODEL.networkDevices.nodeTypes.push(item);
    MODEL.ui.dirty = true;
    setForm(item);
  };
  modal.querySelector('#nodeDelete').onclick = ()=>{
    const id = modal.querySelector('#nodeEditId').value || modal.querySelector('#ntId').value.trim();
    if(!id) return;
    if(!confirm(`Delete node type ${id}?`)) return;
    MODEL.networkDevices.nodeTypes = MODEL.networkDevices.nodeTypes.filter(x=>x.id !== id);
    MODEL.ui.dirty = true;
    formWrap.classList.remove('open');
    redraw();
  };
  modal.querySelector('#nodeExport').onclick = ()=>downloadNetworkLibrary('node');
  modal.querySelector('#nodeImport').onclick = ()=>importNetworkLibrary('node', redraw);
  redraw();
}

// ===== Splitter Type Builder =====
function showSplitterTypeBuilder(){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const bd = document.createElement('div');
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;z-index:10002';
  const modal = document.createElement('div');
  modal.style.cssText = 'width:min(1180px,96vw);max-height:92vh;overflow:auto;background:#101f34;color:#eaf4ff;border:1px solid #23405f;border-radius:14px;padding:16px;font:14px/1.4 system-ui';
  modal.innerHTML = `
    <div class="builder-v4-toolbar" style="margin-bottom:12px">
      <h3 style="margin:0">Splitter Type Builder</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="splitterNew">Build new splitter type</button>
        <button id="splitterExport" style="background:#334155;color:#eaf2ff">Export library</button>
        <button id="splitterImport" style="background:#334155;color:#eaf2ff">Import library</button>
        <button id="splitterBuilderClose" style="background:#334155;color:#eaf2ff">Close</button>
      </div>
    </div>
    <div class="builder-v4-grid">
      <div class="device-card builder-v4-form" id="splitterFormWrap">
        <h4 id="splitterFormTitle">New splitter type</h4>
        <input id="splitterEditId" type="hidden">
        <div class="device-form">
          <label>Type key</label><input id="stId" type="text" value="${nextTypedId('SPLIT:', MODEL.networkDevices.splitterTypes)}" placeholder="SPLIT:01">
          <label>Brand</label><input id="stBrand" type="text" placeholder="Luminex / EOC / ...">
          <label>Type</label><input id="stName" type="text" placeholder="10 output splitter">
          <label>Mode</label><select id="stMode"><option value="A">Single input</option><option value="AB">A/B input</option></select>
          <label>Total outputs</label><input id="stOutputs" type="number" min="1" max="64" value="10">
          <label>Switching</label><select id="stSwitching"><option value="independent">Every output independent</option><option value="paired">Outputs paired per 2</option></select>
          <label>Default IP</label><input id="stIp" class="ipv4" type="text" inputmode="numeric" placeholder="optional">
          <label>Subnet</label><input id="stSubnet" class="ipv4" type="text" inputmode="numeric" placeholder="optional">
          <label>Color</label><input id="stColor" type="color" value="#FFC107">
        </div>
        <div id="splitterTypePreview" style="margin-top:10px"></div>
        <div class="hint">Single input = one universe feed. A/B input = two universe feeds. Paired switching means 1+2, 3+4, 5+6 etc. follow the same selector group.</div>
        <div class="device-actions">
          <button id="splitterDelete" style="background:#E53935;color:#fff">Delete</button>
          <button id="splitterSave">Save type</button>
        </div>
      </div>
      <div>
        <div class="hint" style="margin-bottom:10px">Create reusable splitter types once. Actual splitter IDs are created later inside a DimCity.</div>
        <div id="splitterTypeList" class="builder-list"></div>
      </div>
    </div>`;
  bd.appendChild(modal);
  document.body.appendChild(bd);
  const formWrap = modal.querySelector('#splitterFormWrap');
  bindIpv4Input(modal.querySelector('#stIp'), true);
  bindIpv4Input(modal.querySelector('#stSubnet'), true);
  const getForm = ()=>({
    id: normalizeTypeId('SPLIT:', modal.querySelector('#stId').value, MODEL.networkDevices.splitterTypes),
    name: modal.querySelector('#stName').value.trim(),
    brand: modal.querySelector('#stBrand').value.trim(),
    mode: modal.querySelector('#stMode').value,
    inputs: modal.querySelector('#stMode').value === 'AB' ? 2 : 1,
    outputCount: Math.max(1, Number(modal.querySelector('#stOutputs').value || 1)),
    switching: modal.querySelector('#stSwitching').value,
    pairSize: 2,
    defaultIp: modal.querySelector('#stIp').value.trim(),
    subnet: modal.querySelector('#stSubnet').value.trim(),
    color: safeHex(modal.querySelector('#stColor').value, '#FFC107')
  });
  const setForm = (sp=null)=>{
    formWrap.classList.add('open');
    modal.querySelector('#splitterEditId').value = sp?.id || '';
    modal.querySelector('#splitterFormTitle').textContent = sp ? `Edit splitter type: ${sp.brand || ''} ${sp.name || sp.id}` : 'Build new splitter type';
    modal.querySelector('#stId').value = sp?.id || nextTypedId('SPLIT:', MODEL.networkDevices.splitterTypes);
    modal.querySelector('#stName').value = sp?.name || '';
    modal.querySelector('#stBrand').value = sp?.brand || '';
    modal.querySelector('#stMode').value = sp?.mode || 'A';
    modal.querySelector('#stOutputs').value = sp?.outputCount || 10;
    modal.querySelector('#stSwitching').value = sp?.switching || 'independent';
    modal.querySelector('#stIp').value = sp?.defaultIp || '';
    modal.querySelector('#stSubnet').value = sp?.subnet || '';
    modal.querySelector('#stColor').value = safeHex(sp?.color || '#FFC107', '#FFC107');
    redraw(sp?.id || '');
  };
  const redraw = (selectedId='')=>{
    MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
    const current = getForm();
    modal.querySelector('#splitterTypePreview').innerHTML = renderSplitterTypeFace(current);
    modal.querySelector('#splitterTypeList').innerHTML = MODEL.networkDevices.splitterTypes.length ? MODEL.networkDevices.splitterTypes.map(sp=>`
      <div class="builder-type-card ${selectedId===sp.id?'selected':''}" data-id="${esc(sp.id)}" style="--device-color:${safeHex(sp.color || '#FFC107')}">
        <h4>${colorChip(sp.color || '#FFC107')}${esc(sp.brand || 'Splitter')} ${esc(sp.name || sp.id)}</h4>
        <div class="muted">Type key: ${esc(sp.id)} • ${sp.mode==='AB'?'A/B':'Single'} • ${Number(sp.outputCount||0)} outputs • ${sp.switching==='paired'?'paired':'independent'}</div>
        ${renderSplitterTypeFace(sp)}
      </div>`).join('') : '<div class="device-list-empty">No splitter types yet. Click “Build new splitter type”.</div>';
    modal.querySelectorAll('.builder-type-card[data-id]').forEach(card=>card.onclick=()=>{
      const sp = MODEL.networkDevices.splitterTypes.find(x=>x.id===card.dataset.id);
      if(sp) setForm(sp);
    });
  };
  modal.querySelector('#splitterBuilderClose').onclick = ()=> bd.remove();
  bd.addEventListener('mousedown', e=>{ if(e.target===bd) bd.remove(); });
  ['stId','stName','stBrand','stMode','stOutputs','stSwitching','stIp','stSubnet','stColor'].forEach(id=>modal.querySelector('#'+id).addEventListener('input', ()=>redraw(modal.querySelector('#splitterEditId').value)));
  modal.querySelector('#splitterNew').onclick = ()=> setForm(null);
  modal.querySelector('#splitterSave').onclick = ()=>{
    if(!isValidIpv4(modal.querySelector('#stIp').value, true)){ alert('Default IP must be a valid IPv4 address, for example 192.168.1.1'); return; }
    if(!isValidIpv4(modal.querySelector('#stSubnet').value, true)){ alert('Subnet must be a valid IPv4 address, for example 255.255.255.0'); return; }
    const item = getForm();
    const oldId = modal.querySelector('#splitterEditId').value;
    const idx = MODEL.networkDevices.splitterTypes.findIndex(x=>x.id === oldId || x.id === item.id);
    if(idx >= 0) MODEL.networkDevices.splitterTypes[idx] = item; else MODEL.networkDevices.splitterTypes.push(item);
    MODEL.ui.dirty = true;
    setForm(item);
  };
  modal.querySelector('#splitterDelete').onclick = ()=>{
    const id = modal.querySelector('#splitterEditId').value || modal.querySelector('#stId').value.trim();
    if(!id) return;
    if(!confirm(`Delete splitter type ${id}?`)) return;
    MODEL.networkDevices.splitterTypes = MODEL.networkDevices.splitterTypes.filter(x=>x.id !== id);
    MODEL.ui.dirty = true;
    formWrap.classList.remove('open');
    redraw();
  };
  modal.querySelector('#splitterExport').onclick = ()=>downloadNetworkLibrary('splitter');
  modal.querySelector('#splitterImport').onclick = ()=>importNetworkLibrary('splitter', redraw);
  redraw();
}

// ===== Network Planner modal =====
function showNetworkDevicesTool(){
  MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
  const bd = document.createElement('div');
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;z-index:10002';
  const modal = document.createElement('div');
  modal.style.cssText = 'width:min(1180px,96vw);max-height:92vh;overflow:auto;background:#101f34;color:#eaf4ff;border:1px solid #23405f;border-radius:14px;padding:16px;font:14px/1.4 system-ui';
  const nodeOptions = MODEL.networkDevices.nodeTypes.map(nt=>`<option value="${esc(nt.id)}">${esc(nt.name || nt.id)} (${Number(nt.portCount||0)} ports)</option>`).join('');
  const splitterOptions = MODEL.networkDevices.splitterTypes.map(sp=>`<option value="${esc(sp.id)}">${esc(sp.name || sp.id)} (${Number(sp.outputCount||0)} outputs)</option>`).join('');
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">Network Planner</h3>
      <button id="networkClose" style="background:#334155;color:#eaf2ff">Close</button>
    </div>
    <div class="device-card">
      <h4>Preferences</h4>
      <div class="planner-controls">
        <label><span class="muted">Node spare ports</span><input id="netPrefNodeSpare" type="number" min="0" value="${MODEL.networkDevices.prefs.nodeSparePorts}"></label>
        <label><span class="muted">Splitter spare outputs</span><input id="netPrefSplitterSpare" type="number" min="0" value="${MODEL.networkDevices.prefs.splitterSparePorts}"></label>
      </div>
    </div>
    <div id="networkDimPreview"></div>`;
  bd.appendChild(modal);
  document.body.appendChild(bd);
  const redraw = ()=>{
    MODEL.networkDevices = normalizeNetworkDevices(MODEL.networkDevices);
    const dims = [...(MODEL.byDim?.keys?.() || [])].sort((a,b)=>a.localeCompare(b));
    modal.querySelector('#networkDimPreview').innerHTML = dims.length ? dims.map(dc=>{
      const plan = getDimPlan(dc);
      const selectedNt = MODEL.networkDevices.nodeTypes.find(x=>x.id===plan.nodeTypeId) || MODEL.networkDevices.nodeTypes[0];
      const nodePorts = Number(selectedNt?.portCount || 1);
      const calc = calculateNodeNeedForDim(dc, nodePorts);
      const universes = uniqueUniversesInDim(dc);
      const color = dimColor(dc);
      const localNodeOptions = MODEL.networkDevices.nodeTypes.map(nt=>`<option value="${esc(nt.id)}" ${plan.nodeTypeId===nt.id?'selected':''}>${esc(nt.name || nt.id)} (${Number(nt.portCount||0)} ports)</option>`).join('') || '<option value="">No node types yet</option>';
      const localSplitterOptions = splitterOptions || '<option value="">No splitter types yet</option>';
      return `<div class="planner-row" style="--dim-color:${color}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${colorChip(color)}${dc}</b><span class="muted">${calc.universeCount} universes • ${calc.nodeCount} calculated nodes</span></div><div class="planner-controls"><label><span class="muted">Node type</span><select data-dc="${dc}" class="planNodeType">${localNodeOptions}</select></label><label><span class="muted">Splitter type</span><select data-dc="${dc}" class="planSplitterType">${localSplitterOptions}</select></label><button data-dc="${dc}" class="planAutoNode">Auto-assign nodes</button><button data-dc="${dc}" class="planAddSplitter" style="background:#334155;color:#eaf2ff">Add splitter</button></div><div class="universe-chip-grid" style="margin-top:8px">${universes.map(u=>`<span class="badge">UNI ${u}</span>`).join(' ') || '<span class="muted">No universes</span>'}</div><div class="hint">Placed in DimCity: ${plan.nodes.length} nodes • ${plan.splitters.length} splitters</div></div>`;
    }).join('') : '<div class="device-list-empty">No DimCities yet. Import CSV first.</div>';
    modal.querySelectorAll('.planNodeType').forEach(sel=>sel.onchange=()=>{ const plan=getDimPlan(sel.dataset.dc); plan.nodeTypeId=sel.value; MODEL.ui.dirty=true; redraw(); });
    modal.querySelectorAll('.planAutoNode').forEach(btn=>btn.onclick=()=>{ const dc=btn.dataset.dc; const sel=modal.querySelector(`.planNodeType[data-dc="${dc}"]`); autoAssignDimCityNodes(dc, sel?.value || ''); renderSummary(); redraw(); });
    modal.querySelectorAll('.planAddSplitter').forEach(btn=>btn.onclick=()=>{ const dc=btn.dataset.dc; const sel=modal.querySelector(`.planSplitterType[data-dc="${dc}"]`); addSplitterToDimCity(dc, sel?.value || ''); renderSummary(); redraw(); });
  };
  modal.querySelector('#networkClose').onclick = ()=> bd.remove();
  bd.addEventListener('mousedown', e=>{ if(e.target===bd) bd.remove(); });
  modal.querySelector('#netPrefNodeSpare').oninput = e=>{ MODEL.networkDevices.prefs.nodeSparePorts = Math.max(0, Number(e.target.value||0)); MODEL.ui.dirty = true; redraw(); };
  modal.querySelector('#netPrefSplitterSpare').oninput = e=>{ MODEL.networkDevices.prefs.splitterSparePorts = Math.max(0, Number(e.target.value||0)); MODEL.ui.dirty = true; redraw(); };
  redraw();
}

window.LKApp = {
  getMODEL: ()=> MODEL,
  setMODEL: (m)=> { MODEL = m; },

  // functies die de editor nodig heeft
  processRows,
  renderAll,
  renderRight,
  recomputeVeamUseAndIssues,
  recomputeUniverseStats,
  hydrateDimOrigins,
  fullRebuildAndRender,
  rebuildFromCsvSources,

  // helpers
  isLK,
  isV,
  dimCityFromId,
  portRangeOk,
  statusColor,

  // DOM helpers
  $,el
};

// Koppel de vaste Edit-knop uit index.html aan de popup-editor:
const _btnCsvEdit = document.getElementById('btnCsvEdit');
if (_btnCsvEdit){
  _btnCsvEdit.onclick = ()=> window.CsvEditor?.open?.();
}



// ===== Tools: menu clicks =====
$('#toolAddLK').addEventListener('click', (e)=>{ e.preventDefault(); showToolsModal('LK'); });
$('#toolAddVeam').addEventListener('click', (e)=>{ e.preventDefault(); showToolsModal('VEAM'); });
const _toolNodeBuilder = document.getElementById('toolNodeBuilder');
if (_toolNodeBuilder) _toolNodeBuilder.addEventListener('click', (e)=>{ e.preventDefault(); showNodeTypeBuilder(); });
const _toolSplitterBuilder = document.getElementById('toolSplitterBuilder');
if (_toolSplitterBuilder) _toolSplitterBuilder.addEventListener('click', (e)=>{ e.preventDefault(); showSplitterTypeBuilder(); });
const _toolNetworkDevices = document.getElementById('toolNetworkDevices');
if (_toolNetworkDevices) _toolNetworkDevices.addEventListener('click', (e)=>{ e.preventDefault(); showNetworkDevicesTool(); });
const _fileCsvSources = document.getElementById('fileCsvSources');
if (_fileCsvSources) _fileCsvSources.addEventListener('click', (e)=>{ e.preventDefault(); showCsvSourcesModal(); });

// backdrop: Cancel knoppen
$('#lkAddCancel').onclick   = closeToolsModal;
$('#veamAddCancel').onclick = closeToolsModal;

// Sluit alleen bij klik op de achtergrond zelf (niet op kinderen)
$('#toolsBackdrop').addEventListener('click', (e)=>{
  if (e.target === e.currentTarget) closeToolsModal();
});
// Extra robuust: ook bij mousedown (voorkomt korte “select” klik-bubbels)
$('#toolsBackdrop').addEventListener('mousedown', (e)=>{
  if (e.target === e.currentTarget) closeToolsModal();
});

// ===== Vast CSV-paneel: twist en Edit-knop =====
(() => {
  const sec = document.querySelector('#rightCsvSection');
  const twist = document.querySelector('#csvTwist');
  const content = sec?.querySelector('.content');
  const btnEdit = document.querySelector('#btnCsvEdit');

  if (twist && content) {
    twist.addEventListener('click', () => {
      const collapsed = content.style.display === 'none';
      content.style.display = collapsed ? '' : 'none';
      twist.textContent = collapsed ? '▾' : '▸';
    });
  }

})();


// ===== Tools: submit Add LK =====
$('#lkAddConfirm').onclick = ()=>{
  const raw = ($('#lkInputId').value || '').trim().toUpperCase();
  const id  = raw.replace(/^VEAM12/,'LK'); // alias normaliseren
  const typeSel = $('#lkInputBlockType').value; // 'MIXED' | 'VEAM_ONLY' | 'XLR12'

  // validatie
  if(!/^LK\d+$/.test(id)){
    $('#lkAddError').textContent = 'Invalid format. Use for example LK101.';
    return;
  }
  const dim = dimCityFromId(id);
  if(!dim){ $('#lkAddError').textContent = 'DimCity cannot be derived from this number.'; return; }
  if (MODEL.byLK.has(id)){ $('#lkAddError').textContent = `${id} already exists.`; return; }

  // nieuwe DimCity?
if(!MODEL.byDim.has(dim)){
  const ok = window.confirm(`${id} belongs to ${dim}. This DimCity does not exist yet. Create ${dim}?`);
  if(!ok) return;
  MODEL.byDim.set(dim, { lks:new Set(), veams:new Set(), lines_total:0, filled:0, empty:0, red:0, yellow:0 });
  if (!MODEL.dimFromManual) MODEL.dimFromManual = new Set();
  MODEL.dimFromManual.add(dim); // ← markeer als handmatig
}


  // nieuw LK-record
  const rec = {
    id, dimcity: dim,
    lines: [],
    names: {'1-4':null,'5-8':null,'9-12':null},
    veam:{1:null,2:null,3:null},
    blockType:{ mode:'Manual', value: typeSel }
  };
  MODEL.byLK.set(id, rec);
  MODEL.byDim.get(dim).lks.add(id);

recomputeVeamUseAndIssues();
hydrateDimOrigins();
renderSummary();
renderIssues();
MODEL.selected = { kind:'LK', id };
MODEL.ui.rightMode = 'DETAIL';
renderRight();


  closeToolsModal();
};

// ===== Tools: submit Add Veam =====
$('#veamAddConfirm').onclick = ()=>{
  const id = ($('#veamInputId').value || '').trim().toUpperCase();

  if(!/^V\d+$/.test(id)){
    $('#veamAddError').textContent = 'Invalid format. Use for example V101.';
    return;
  }
  const dim = dimCityFromId(id);
  if(!dim){ $('#veamAddError').textContent = 'DimCity cannot be derived from this number.'; return; }
  if (MODEL.byVeam.has(id)){ $('#veamAddError').textContent = `${id} already exists.`; return; }

if(!MODEL.byDim.has(dim)){
  const ok = window.confirm(`${id} belongs to ${dim}. This DimCity does not exist yet. Create ${dim}?`);
  if(!ok) return;
  MODEL.byDim.set(dim, { lks:new Set(), veams:new Set(), lines_total:0, filled:0, empty:0, red:0, yellow:0 });
  if (!MODEL.dimFromManual) MODEL.dimFromManual = new Set();
  MODEL.dimFromManual.add(dim); // ← markeer als handmatig
}


  // nieuw Veam-record
  const rec = { id, dimcity: dim, lines: [] };
  MODEL.byVeam.set(id, rec);

  // registreren
  MODEL.byDim.get(dim).veams.add(id);
  const pool = MODEL.veamPool.get(dim) || new Set(); pool.add(id); MODEL.veamPool.set(dim, pool);

 // In #veamAddConfirm
recomputeVeamUseAndIssues();
hydrateDimOrigins();   // ← toevoegen
renderSummary();
renderIssues();
MODEL.selected = { kind:'VEAM', id };
MODEL.ui.rightMode = 'DETAIL';
renderRight();


  closeToolsModal();
};

// Init
$('#summary').textContent = 'Nog geen data';
