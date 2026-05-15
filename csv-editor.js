const App = window.LKApp || {};
const $  = App.$  || (s=>document.querySelector(s));
const el = App.el || ((t,c,h)=>{const n=document.createElement(t); if(c) n.className=c; if(h!=null) n.innerHTML=h; return n;});

// ——— lokale editor-state ———
let EDIT = null;           // { rowsCsv, rowsCustom, origCsv, dirty, selection:Set }
let BACKDROP, BODY, META;  // DOM refs

// utils
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
function newRid(prefix){ return `${prefix}:${Math.random().toString(36).slice(2,8)}`; }

// minimale validatie/status
function validateRow(row){
  const { isV, dimCityFromId, portRangeOk, statusColor } = App;

  // soort bepalen
  if (!row.id || row.id.trim()==='') row.kind = 'DMX';
  else row.kind = isV(row.id) ? 'VEAM' : 'LK';

  // DimCity:
  if (row.kind === 'DMX') {
    // handmatig, niets uit ID afleiden
    row.dimcity = (row.dimcity || '').toUpperCase() || null;
    row.port = null; // afdwingen: geen port bij DMX
  } else {
    row.dimcity = row.id ? (dimCityFromId(row.id) || null) : null;
  }

  // basiscontroles alleen voor LK/VEAM
  let hard = false;
  if (row.kind !== 'DMX'){
    if (!row.id || !/^(?:LK\d+|VEAM12\d+|V\d+)$/i.test(row.id)) hard = true;
    if (row.kind==='LK'   && !portRangeOk('LK1', Number(row.port)))  hard = true;
    if (row.kind==='VEAM' && !portRangeOk('V1',  Number(row.port)))  hard = true;
    if (!row.dimcity) hard = true;
  }

  // universe normaliseren
  if (row.universe!==null && row.universe!==''){
    const u = Number(row.universe);
    if (!Number.isFinite(u)) hard = true; else row.universe = u;
  } else row.universe = null;

  row.status = hard ? 'RED' : statusColor(row.universe, !!(row.dest && row.dest.trim()!==''));
  return row;
}



function ensureStateFromModel(){
  if (EDIT) return;
  const M = App.getMODEL();

  const rowsCsv = []
    .concat((M.lines||[]).map(L => ({
      rid:newRid('CSV'),
      id:L.id, port:L.port??null, universe:L.universe??null, dest:L.dest||'',
      dimcity:L.dimcity||App.dimCityFromId(L.id)||null, kind: App.isV(L.id)?'VEAM':'LK',
      source:'CSV', status:L.status||'YELLOW'
    })))
    .concat((M.veamLines||[]).map(V => ({
      rid:newRid('CSV'),
      id:V.id, port:V.port??null, universe:V.universe??null, dest:V.dest||'',
      dimcity:V.dimcity||App.dimCityFromId(V.id)||null, kind:'VEAM',
      source:'CSV', status:V.status||'YELLOW'
    })));

  const rowsCustom = deepClone(M.customRows||[]).map(r => validateRow({
    rid:newRid('CUST'),
    id:r.id||'', port:r.port??null, universe:r.universe??null, dest:r.dest||'',
    dimcity:(r.kind==='DMX' ? (r.dimcity||null) : (r.id?App.dimCityFromId(r.id):null)),
    kind:r.kind || (r.id ? (App.isV(r.id)?'VEAM':'LK') : 'DMX'),
    source:'Custom', status:r.status||'YELLOW'
  }));

  EDIT = { rowsCsv, rowsCustom, origCsv: deepClone(rowsCsv), dirty:false, selection:new Set() };
}


// commit helper → csv-achtige 5 kolommen
function collectAsCsvRows(){
  const all = []
    .concat(EDIT.rowsCsv||[])
    .concat(EDIT.rowsCustom||[]);

  // LK/VEAM → 5 velden (laat 5e leeg als placeholder voor oude 'truss')
  // DMX     → 6 velden: ['', '', universe, dest, '', dimcity]
  return all.map(r => {
    const base5 = [
      r.id || '',
      (r.port==null?'':String(r.port)),
      (r.universe==null?'':String(r.universe)),
      r.dest || '',
      '' // placeholder voor legacy kolom 5
    ];
    if (r.kind === 'DMX') {
      return base5.concat([ (r.dimcity || '') ]);
    }
    return base5;
  });
}



// ===== UI bouwen =====
function renderToolbar(container){
  const row = el('div','row');

  const bSave   = el('button', null, 'Save');
  const bCancel = el('button', null, 'Cancel');
  const bRevert = el('button', null, 'Revert CSV');
  const spacer  = el('span', 'right');
  const bAddLK  = el('button', null, 'Add LK');
  const bAddV   = el('button', null, 'Add Veam');
  const bAddDMX = el('button', null, 'Add DMX');

  row.appendChild(bSave);
  row.appendChild(bCancel);
  row.appendChild(bRevert);
  row.appendChild(spacer);
  row.appendChild(bAddLK);
  row.appendChild(bAddV);
  row.appendChild(bAddDMX);

  // acties
  bAddLK.onclick = ()=>{ EDIT.rowsCustom.push(validateRow({
    rid:newRid('CUST'), id:'LK', port:null, universe:null, dest:'', truss:'', dimcity:null, kind:'LK', source:'Custom', status:'YELLOW'
  })); EDIT.dirty=true; redraw(); };

  bAddV.onclick = ()=>{ EDIT.rowsCustom.push(validateRow({
    rid:newRid('CUST'), id:'V', port:null, universe:null, dest:'', truss:'', dimcity:null, kind:'VEAM', source:'Custom', status:'YELLOW'
  })); EDIT.dirty=true; redraw(); };

bAddDMX.onclick = ()=>{ EDIT.rowsCustom.push(validateRow({
  rid:newRid('CUST'), id:'', port:null, universe:null, dest:'', truss:'', dimcity:null, kind:'DMX', source:'Custom', status:'YELLOW'
})); EDIT.dirty=true; redraw(); };

bAddDMX.onclick = ()=>{
  EDIT.rowsCustom.push(validateRow({
    rid:newRid('CUST'),
    id:'',             // ← onder water leeg laten (processRows => DMX)
    port:null,         // ← geen port voor DMX
    universe:null,
    dest:'',
    dimcity:null,      // user vult DBxx in
    kind:'DMX',
    source:'Custom',
    status:'YELLOW'
  }));
  EDIT.dirty = true;
  redraw();
};

  bRevert.onclick = ()=>{ EDIT.rowsCsv = deepClone(EDIT.origCsv); EDIT.dirty=true; redraw(); };
  bCancel.onclick = close;

  bSave.onclick = async ()=>{
    const savedCustom = deepClone(EDIT.rowsCustom);
    const rows = collectAsCsvRows();

    // sluit popup-state vóór verwerken om dubbele renders te voorkomen
    close(/*silent*/true);

    // verwerk
    await App.processRows(rows);

    // custom terugzetten (processRows reset M.customRows)
    const M = App.getMODEL();
    M.customRows = savedCustom;
    App.setMODEL(M);

    // herberekenen + UI
    App.recomputeVeamUseAndIssues();
    App.recomputeUniverseStats();
    App.hydrateDimOrigins?.();
    App.renderRight();
  };

  container.appendChild(row);
}

function renderTable(container){
  const sec = el('div','section');
  sec.appendChild(el('h3', null, 'Rows'));

  const cnt = el('div','content');
  const tbl = el('table', null, `
    <thead>
      <tr>
        <th>Source</th><th>Status</th><th>ID</th><th>Port</th>
        <th>Universe</th><th>Bestemming</th><th>DimCity</th><th>Actie</th>
      </tr>
    </thead>
    <tbody></tbody>
  `);
  const tbody = tbl.querySelector('tbody');

  function drawAll(){
    tbody.innerHTML = '';

    const all = []
      .concat(EDIT.rowsCsv||[])
      .concat(EDIT.rowsCustom||[]);

    for (const row of all){
      validateRow(row);

      const tr = el('tr');
      tr.innerHTML = `
        <td><span class="badge">${row.source}</span></td>
        <td class="td-status"><span class="pill ${row.status}">${row.status}</span></td>
        <td class="td-id"></td>
        <td class="td-port"></td>
        <td class="td-uni"></td>
        <td class="td-dst"></td>
        <td class="td-dc"></td>
        <td><button class="row-del" title="Delete">✕</button></td>
      `;

      // cell refs
      const tdId   = tr.querySelector('.td-id');
      const tdPt   = tr.querySelector('.td-port');
      const tdUni  = tr.querySelector('.td-uni');
      const tdDst  = tr.querySelector('.td-dst');
      const tdDc   = tr.querySelector('.td-dc');
      const tdStat = tr.querySelector('.td-status');

      // ===== ID =====
      if (row.kind === 'DMX'){
        // Toon label "DMX", niet bewerkbaar
        tdId.textContent = 'DMX';
      } else {
        const inpId = el('input'); inpId.type='text'; inpId.value = row.id || '';
        tdId.appendChild(inpId);
        inpId.oninput = ()=>{
          row.id = inpId.value.trim();
          EDIT.dirty = true;
          // herbereken afgeleiden (status/dimcity)
          validateRow(row);
          tdStat.innerHTML = `<span class="pill ${row.status}">${row.status}</span>`;
          // voor LK/VEAM wordt DimCity afgeleid, toon direct
          tdDc.textContent = row.dimcity || '';
        };
      }

      // ===== PORT =====
      if (row.kind === 'DMX'){
        tdPt.textContent = '—'; // geen port voor DMX
      } else {
        const inpPt = el('input'); inpPt.type='number'; inpPt.value = (row.port==null?'':row.port);
        tdPt.appendChild(inpPt);
        inpPt.oninput = ()=>{
          row.port = (inpPt.value===''? null : Number(inpPt.value));
          EDIT.dirty = true;
          validateRow(row);
          tdStat.innerHTML = `<span class="pill ${row.status}">${row.status}</span>`;
        };
      }

      // ===== UNIVERSE =====
      const inpUni = el('input'); inpUni.type='number'; inpUni.value = (row.universe==null?'':row.universe);
      tdUni.appendChild(inpUni);

      // ===== BESTEMMING =====
      const inpDst = el('input'); inpDst.type='text'; inpDst.value = row.dest || '';
      tdDst.appendChild(inpDst);

      // ===== DIMCITY =====
      if (row.kind === 'DMX'){
        const inpDc = el('input');
        inpDc.type = 'text';
        inpDc.placeholder = 'DB01';
        inpDc.value = (row.dimcity || '');
        tdDc.appendChild(inpDc);
        inpDc.oninput = ()=>{
          row.dimcity = (inpDc.value || '').toUpperCase();
          EDIT.dirty = true;
          validateRow(row);
          tdStat.innerHTML = `<span class="pill ${row.status}">${row.status}</span>`;
        };
      } else {
        tdDc.textContent = row.dimcity || '';
      }

      // ===== Gezamenlijke input-handlers voor universe/bestemming =====
      const onCommon = ()=>{
        // ID/Port van DMX blijven ongemoeid; hier alleen universe/dest
        row.universe = (inpUni.value===''? null : Number(inpUni.value));
        row.dest     = inpDst.value;
        EDIT.dirty = true;
        validateRow(row);
        tdStat.innerHTML = `<span class="pill ${row.status}">${row.status}</span>`;
      };
      inpUni.oninput = onCommon;
      inpDst.oninput = onCommon;

      // ===== Delete =====
      tr.querySelector('.row-del').onclick = ()=>{
        const ok = window.confirm('Are you sure you want to delete this row?');
        if (!ok) return;
        const a = EDIT.rowsCsv;
        const b = EDIT.rowsCustom;
        const ixA = a.findIndex(r=>r.rid===row.rid);
        const ixB = b.findIndex(r=>r.rid===row.rid);
        if (ixA>=0) a.splice(ixA,1);
        else if (ixB>=0) b.splice(ixB,1);
        EDIT.dirty = true;
        drawAll();
        redraw(); // meta bijwerken
      };

      tbody.appendChild(tr);
    }
  }

  cnt.appendChild(tbl);
  sec.appendChild(cnt);
  container.appendChild(sec);

  renderTable._drawRows = drawAll;
  drawAll();
}



function redraw(){
  // meta
  const total =
    (EDIT.rowsCsv?.length||0) + (EDIT.rowsCustom?.length||0);
  META.textContent = `${total} rows (CSV: ${EDIT.rowsCsv.length} • Custom: ${EDIT.rowsCustom.length})`;
  // rows (alleen nodig na toevoegen/verwijderen/revert)
  renderTable._drawRows?.();
}

function mountPopup(){
  BACKDROP = $('#editCsvBackdrop');
  BODY     = $('#editCsvBody');
  META     = $('#editCsvMeta');

  BODY.innerHTML = '';

  // toolbar + tabel
  renderToolbar(BODY);
  renderTable(BODY);

  redraw();

  // show
  BACKDROP.style.display = 'flex';

  // klikken naast modal sluit af
  BACKDROP.onclick = (e)=>{ if (e.target===BACKDROP) close(); };
}

// ===== Public API =====
function open(){
  ensureStateFromModel();
  mountPopup();
}

function close(silent=false){
  if (!silent){
    // alleen visueel sluiten; EDIT naar null
  }
  if (BACKDROP){ BACKDROP.style.display = 'none'; }
  if (BODY) BODY.innerHTML = '';
  EDIT = null;
}

// exporteer naar window
window.CsvEditor = { open, close };