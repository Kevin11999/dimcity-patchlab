// export-pdf.js
// V7 PDF foundation for DimCity PatchLab.
// Export order per DimCity:
// 1) Project info
// 2) Network / Nodes / future Switches
// 3) Splitters
// 4) LK / Veam patch information
(function(){
  'use strict';

  const getM = () => (typeof window.LKApp?.getMODEL === 'function' ? window.LKApp.getMODEL() : null);

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[m]));
  }
  function safeFile(s){ return String(s || 'DimCity').replace(/[^a-z0-9_\-]+/gi, '_'); }
  function listFromMap(m){ return m && typeof m.values === 'function' ? [...m.values()] : []; }
  function keysFromMap(m){ return m && typeof m.keys === 'function' ? [...m.keys()] : []; }
  function dcColor(M, dc){
    const c = M?.dimColors?.[dc];
    return /^#[0-9a-fA-F]{6}$/.test(String(c||'')) ? c : '#4ea8ff';
  }
  function effBlockType(lk){
    if(lk?.blockType?.mode === 'Manual') return lk.blockType.value || 'MIXED';
    let used = 0;
    for(const L of (lk?.lines || [])){
      if(L && (L.universe != null || (L.dest && L.dest !== ''))) used++;
    }
    return used > 4 ? 'XLR12' : 'MIXED';
  }
  function blockLabel(t){
    if(t === 'XLR12') return '12× XLR';
    if(t === 'VEAM_ONLY') return '3× Veam';
    return '4× XLR + 3× Veam';
  }
  function getDimPlan(M, dc){
    const plans = M?.networkDevices?.dimCityPlans || {};
    return plans[dc] || { nodes:[], splitters:[], switches:[] };
  }
  function nodeTypeById(M, id){
    return (M?.networkDevices?.nodeTypes || []).find(t => String(t.id || t.typeId || t.key || t.typeKey) === String(id));
  }
  function splitterTypeById(M, id){
    return (M?.networkDevices?.splitterTypes || []).find(t => String(t.id || t.typeId || t.key || t.typeKey) === String(id));
  }
  function getPortRecord(lines, port){
    return (lines || []).find(x => Number(x.port) === Number(port)) || null;
  }
  function getVeamRecord(M, veamId){
    return M?.byVeam?.get?.(veamId) || null;
  }
  function veamPort(M, veamId, port){
    const v = getVeamRecord(M, veamId);
    return getPortRecord(v?.lines || [], port);
  }
  function mergedLkPort(M, lk, port){
    const lkLine = getPortRecord(lk.lines || [], port) || {};
    const slot = port <= 4 ? 1 : port <= 8 ? 2 : 3;
    const veamPortNr = ((port - 1) % 4) + 1;
    const veamId = lk.veam?.[slot] || null;
    const vLine = veamId ? veamPort(M, veamId, veamPortNr) : null;
    const hasLk = lkLine.universe != null || lkLine.dest;
    const hasV = vLine && (vLine.universe != null || vLine.dest);
    return {
      port,
      slot,
      veamId,
      veamPort: veamPortNr,
      universe: hasV ? vLine.universe : lkLine.universe,
      dest: hasV ? vLine.dest : lkLine.dest,
      source: hasV && hasLk ? 'LK + Veam' : hasV ? 'Veam' : 'LK',
      conflict: hasV && hasLk && String(vLine.universe ?? '') !== String(lkLine.universe ?? '')
    };
  }
  function universeOverview(M, dc){
    const map = new Map();
    const bump = (u, kind, label, port, dest) => {
      if(u == null || u === '') return;
      const key = String(u);
      if(!map.has(key)) map.set(key, { lk:[], veam:[], dmx:[] });
      map.get(key)[kind].push({ label, port, dest: dest || '' });
    };
    for(const lk of listFromMap(M.byLK).filter(x=>x.dimcity===dc)){
      for(const L of (lk.lines || [])) bump(L.universe, 'lk', lk.id, L.port, L.dest);
    }
    for(const ve of listFromMap(M.byVeam).filter(x=>x.dimcity===dc)){
      for(const V of (ve.lines || [])) bump(V.universe, 'veam', ve.id, V.port, V.dest);
    }
    for(const D of (M.dmxLoose || []).filter(x=>x.dimcity===dc)) bump(D.universe, 'dmx', 'Loose DMX', '—', D.dest);
    return [...map.entries()].sort((a,b)=>Number(a[0])-Number(b[0]));
  }

  function ensureModal(){
    if(document.getElementById('pdfExportModal')) return;
    const style = document.createElement('style');
    style.textContent = `
#pdfExportBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:9998}
#pdfExportModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999}
.pdf-card{width:min(1050px,94vw);max-height:90vh;overflow:auto;background:#101f34;color:#eaf4ff;border:1px solid #23405f;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.55)}
.pdf-hd{padding:16px 18px;border-bottom:1px solid #23405f;font-weight:700;font-size:19px;background:linear-gradient(90deg,rgba(78,168,255,.16),transparent)}
.pdf-bd{padding:14px 18px;display:grid;grid-template-columns:1.1fr .9fr;gap:16px}.pdf-ft{padding:14px 18px;border-top:1px solid #23405f;display:flex;gap:10px;justify-content:flex-end}
.pdf-box{border:1px solid #23405f;border-radius:12px;padding:12px;background:#0b1728}.pdf-box h4{margin:0 0 10px;color:#9fc0df}.pdf-row{display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:center;margin:7px 0}.pdf-row input,.pdf-row select{width:100%;padding:7px 8px;border:1px solid #23405f;border-radius:8px;background:#07111f;color:#eaf4ff}.pdf-muted{color:#9fc0df;font-size:12px}.pdf-chips{display:flex;flex-wrap:wrap;gap:8px}.pdf-chip{display:inline-flex;gap:6px;align-items:center;padding:6px 10px;border:1px solid #23405f;border-radius:999px;background:#07111f}.pdf-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.btn{padding:8px 12px;border:1px solid #23405f;border-radius:10px;background:#07111f;color:#eaf4ff;cursor:pointer}.btn.primary{background:#4ea8ff;color:#041423;border-color:#4ea8ff}#pdfLogoPreview{max-width:220px;max-height:110px;display:none;border:1px dashed #23405f;border-radius:8px;padding:6px;background:#07111f;margin-top:8px}
@media(max-width:850px){.pdf-bd{grid-template-columns:1fr}.pdf-options{grid-template-columns:1fr}.pdf-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'pdfExportBackdrop';
    const modal = document.createElement('div');
    modal.id = 'pdfExportModal';
    modal.innerHTML = `
<div class="pdf-card">
  <div class="pdf-hd">Export PDF</div>
  <div class="pdf-bd">
    <div class="pdf-box">
      <h4>Project information</h4>
      <div class="pdf-row"><label>Project</label><input id="pdfProject" type="text"></div>
      <div class="pdf-row"><label>Area</label><input id="pdfArea" type="text"></div>
      <div class="pdf-row"><label>Location</label><input id="pdfLocation" type="text"></div>
      <div class="pdf-row"><label>Date</label><input id="pdfDate" type="date"></div>
      <div class="pdf-row"><label>Prepared by</label><input id="pdfPrepared" type="text"></div>
      <div class="pdf-row"><label>Logo</label><div><input id="pdfLogoFile" type="file" accept="image/*"><img id="pdfLogoPreview"></div></div>
    </div>
    <div class="pdf-box">
      <h4>Layout and scope</h4>
      <div class="pdf-row"><label>Preset</label><select id="pdfPreset"><option value="DB_DETAILED">DB detailed paperwork</option><option value="NETWORK_FIRST">Network crew overview</option><option value="PATCH_CREW">Patch crew overview</option></select></div>
      <div class="pdf-row"><label>Page</label><select id="pdfPage"><option value="landscape">A4 landscape</option><option value="portrait">A4 portrait</option></select></div>
      <div class="pdf-options">
        <label><input id="pdfIncProject" type="checkbox" checked> Project info first</label>
        <label><input id="pdfIncNetwork" type="checkbox" checked> Nodes / Network info</label>
        <label><input id="pdfIncSwitches" type="checkbox" checked> Future switches placeholder</label>
        <label><input id="pdfIncSplitters" type="checkbox" checked> Splitters</label>
        <label><input id="pdfIncPatch" type="checkbox" checked> LK / Veam info last</label>
        <label><input id="pdfIncWarnings" type="checkbox" checked> Warnings / errors</label>
      </div>
      <div style="margin-top:12px"><b>DimCities</b></div>
      <div style="margin:6px 0"><label><input type="radio" name="pdfScope" value="ALL" checked> All</label> &nbsp; <label><input type="radio" name="pdfScope" value="SEL"> Select</label></div>
      <div id="pdfDimList" class="pdf-chips" style="display:none"></div>
      <div class="pdf-muted" style="margin-top:10px">Export order: project info → network/nodes/switches → splitters → LK/Veam patch info.</div>
    </div>
  </div>
  <div class="pdf-ft"><button class="btn" id="pdfCancel">Cancel</button><button class="btn primary" id="pdfExport">Export PDF</button></div>
</div>`;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    backdrop.addEventListener('click', close);
    document.getElementById('pdfCancel').addEventListener('click', close);
    document.getElementById('pdfExport').addEventListener('click', onExport);
    document.querySelectorAll('input[name="pdfScope"]').forEach(r=>r.addEventListener('change', renderDimList));
    document.getElementById('pdfLogoFile').addEventListener('change', async e=>{
      const f = e.target.files?.[0];
      const img = document.getElementById('pdfLogoPreview');
      if(!f){ img.style.display='none'; img.src=''; delete img.dataset.dataurl; return; }
      const dataUrl = await fileToDataUrl(f);
      img.src = dataUrl; img.dataset.dataurl = dataUrl; img.style.display='block';
    });
  }

  function open(){
    ensureModal();
    hydrateModalDefaults();
    renderDimList();
    document.getElementById('pdfExportBackdrop').style.display='block';
    document.getElementById('pdfExportModal').style.display='flex';
  }
  function close(){
    const a=document.getElementById('pdfExportBackdrop'), b=document.getElementById('pdfExportModal');
    if(a) a.style.display='none'; if(b) b.style.display='none';
  }
  function hydrateModalDefaults(){
    const M = getM() || {};
    const meta = M.projectMeta || {};
    const set = (id,v)=>{ const n=document.getElementById(id); if(n && !n.value) n.value=v||''; };
    set('pdfProject', meta.project);
    set('pdfArea', meta.area);
    set('pdfLocation', meta.location);
    set('pdfPrepared', meta.prepared);
    const d=document.getElementById('pdfDate');
    if(d && !d.value){
      const today = new Date();
      d.value = meta.date || `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
  }
  function renderDimList(){
    const M = getM() || {};
    const useSel = document.querySelector('input[name="pdfScope"][value="SEL"]')?.checked;
    const box = document.getElementById('pdfDimList');
    if(!box) return;
    box.innerHTML=''; box.style.display = useSel ? 'flex' : 'none';
    if(!useSel) return;
    for(const dc of keysFromMap(M.byDim).sort((a,b)=>a.localeCompare(b))){
      const lab=document.createElement('label');
      lab.className='pdf-chip';
      lab.innerHTML=`<input type="checkbox" value="${esc(dc)}" checked> ${esc(dc)}`;
      box.appendChild(lab);
    }
  }
  function fileToDataUrl(file){
    return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
  }

  async function onExport(){
    const M = getM(); if(!M) return;
    let dcs = keysFromMap(M.byDim).sort((a,b)=>a.localeCompare(b));
    const scope = document.querySelector('input[name="pdfScope"]:checked')?.value || 'ALL';
    if(scope === 'SEL'){
      dcs = [...document.querySelectorAll('#pdfDimList input[type="checkbox"]')].filter(x=>x.checked).map(x=>x.value);
      if(!dcs.length){ alert('Select at least one DimCity.'); return; }
    }
    const logo = document.getElementById('pdfLogoPreview');
    const meta = {
      project: document.getElementById('pdfProject').value.trim(),
      area: document.getElementById('pdfArea').value.trim(),
      location: document.getElementById('pdfLocation').value.trim(),
      date: document.getElementById('pdfDate').value,
      prepared: document.getElementById('pdfPrepared').value.trim(),
      logoDataUrl: logo?.dataset?.dataurl || null
    };
    const options = {
      preset: document.getElementById('pdfPreset').value,
      page: document.getElementById('pdfPage').value,
      incProject: document.getElementById('pdfIncProject').checked,
      incNetwork: document.getElementById('pdfIncNetwork').checked,
      incSwitches: document.getElementById('pdfIncSwitches').checked,
      incSplitters: document.getElementById('pdfIncSplitters').checked,
      incPatch: document.getElementById('pdfIncPatch').checked,
      incWarnings: document.getElementById('pdfIncWarnings').checked
    };
    const html = buildPdfHtml({ M, meta, dcs, options });
    const name = `${safeFile(meta.project || 'DimCity')}-${dcs.map(safeFile).join('_')}-DB_export.pdf`;
    await window.app?.exportPdfFromHtml?.({ html, defaultPath:name });
    close();
  }

  function buildPdfHtml({ M, meta, dcs, options }){
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.project || 'DimCity Export')}</title><style>${printCss(options)}</style></head><body>${buildCover(meta, dcs, options)}${dcs.map(dc=>buildDimCity(M, meta, dc, options)).join('')}</body></html>`;
  }
  function printCss(options){
    const landscape = options.page !== 'portrait';
    return `
@page{size:A4 ${landscape?'landscape':'portrait'};margin:10mm}*{box-sizing:border-box}body{font:10px/1.35 Arial,Helvetica,sans-serif;color:#111827;margin:0;background:#fff}.page{page-break-after:always}.cover{height:185mm;display:flex;flex-direction:column;justify-content:space-between;border:2px solid #cbd5e1;border-radius:10px;padding:18mm;text-align:center}.cover h1{font-size:34px;letter-spacing:.12em;margin:0;color:#0f172a}.cover h2{font-size:18px;color:#2563eb;margin:6mm 0}.cover dl{display:grid;grid-template-columns:38mm 1fr;max-width:120mm;margin:0 auto;text-align:left;gap:3px}.cover dt{font-weight:700;color:#64748b}.cover dd{margin:0}.cover img{max-width:110mm;max-height:65mm;object-fit:contain}.db-head{border-left:8px solid var(--db,#4ea8ff);background:#f8fafc;border-bottom:1px solid #cbd5e1;padding:5mm;margin-bottom:4mm;display:flex;justify-content:space-between;gap:8mm}.db-title{font-size:28px;font-weight:900;color:#0f172a}.db-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:2mm}.stat{border:1px solid #cbd5e1;border-radius:5px;padding:2mm;background:#fff}.stat b{font-size:15px}.section{break-inside:avoid;margin:0 0 5mm 0}.section h3{font-size:13px;margin:0 0 2mm 0;padding:2mm 3mm;background:#0f172a;color:#fff;border-radius:5px}.grid{display:grid;gap:3mm}.grid.cols2{grid-template-columns:1fr 1fr}.grid.cols3{grid-template-columns:repeat(3,1fr)}table{width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #cbd5e1;padding:1.5mm 1.8mm;vertical-align:top}th{background:#e2e8f0;text-align:left;font-weight:800}.card{border:1px solid #cbd5e1;border-radius:6px;background:#fff;break-inside:avoid;overflow:hidden}.card-h{background:#e2e8f0;padding:2mm 3mm;font-weight:900;display:flex;justify-content:space-between}.card-b{padding:2.5mm}.port-grid{display:grid;gap:1.3mm}.ports4{grid-template-columns:repeat(4,1fr)}.ports8{grid-template-columns:repeat(8,1fr)}.ports12{grid-template-columns:repeat(12,1fr)}.port{border:1px solid #94a3b8;border-radius:4px;padding:1.3mm;background:#f8fafc;min-height:15mm}.port .nr{font-weight:900;color:#0f172a}.port .uni{font-size:11px;font-weight:800;color:#2563eb}.port .dest{font-size:8.5px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.node .port{border-radius:999px;min-height:12mm;text-align:center}.splitter .port{background:#fff7ed}.warn{color:#b45309}.err{color:#b91c1c}.placeholder{border:1px dashed #94a3b8;border-radius:6px;padding:4mm;color:#64748b;background:#f8fafc}.small{font-size:8.5px;color:#64748b}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.lk-block{margin-bottom:3mm}.lk-groups{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm}.lk-group{border:1px solid #cbd5e1;border-radius:5px;padding:2mm;background:#f8fafc}.lk-group h4{margin:0 0 1.5mm;font-size:10px}.conflict{background:#fee2e2!important;border-color:#ef4444!important}`;
  }
  function buildCover(meta,dcs,options){
    const logo = meta.logoDataUrl ? `<img src="${meta.logoDataUrl}">` : '<div class="placeholder">No logo selected</div>';
    return `<section class="page cover"><div><h1>${esc(meta.project || 'DIMCITY PATCHLAB')}</h1><h2>${esc(dcs.join(', '))}</h2><dl><dt>Area</dt><dd>${esc(meta.area||'—')}</dd><dt>Location</dt><dd>${esc(meta.location||'—')}</dd><dt>Date</dt><dd>${esc(meta.date||'—')}</dd><dt>Prepared by</dt><dd>${esc(meta.prepared||'—')}</dd><dt>Layout</dt><dd>${esc(options.preset)}</dd></dl></div><div>${logo}</div><div class="small">Export order: Project info → Network/Nodes/Switches → Splitters → LK/Veam patch info</div></section>`;
  }
  function buildDimCity(M, meta, dc, options){
    const color = dcColor(M, dc);
    const dim = M.byDim?.get?.(dc) || {lks:new Set(),veams:new Set(),red:0,yellow:0,lines_total:0};
    const unis = universeOverview(M, dc);
    const patchPoints = unis.reduce((n,[,x])=>n+x.lk.length+x.veam.length+x.dmx.length,0);
    return `<section class="page" style="--db:${color}">
${options.incProject ? buildDbHeader(meta, dc, dim, unis.length, patchPoints) : ''}
${options.incNetwork ? buildNetworkSection(M, dc, options) : ''}
${options.incSplitters ? buildSplitterSection(M, dc) : ''}
${options.incPatch ? buildPatchSection(M, dc) : ''}
${options.incWarnings ? buildWarningsSection(M, dc) : ''}
</section>`;
  }
  function buildDbHeader(meta, dc, dim, uniCount, patchPoints){
    return `<div class="db-head"><div><div class="db-title">${esc(dc)}</div><div class="small">${esc(meta.project||'Project')} • ${esc(meta.area||'Area')} • ${esc(meta.location||'Location')}</div><div class="db-meta"><div class="stat"><b>${uniCount}</b><br>Universes</div><div class="stat"><b>${patchPoints}</b><br>Patch points</div><div class="stat"><b>${dim.lks?.size||0}</b><br>LK</div><div class="stat"><b>${dim.veams?.size||0}</b><br>Veam</div></div></div><div><div class="stat"><b class="err">${dim.red||0}</b><br>Errors</div><div class="stat"><b class="warn">${dim.yellow||0}</b><br>Warnings</div></div></div>`;
  }
  function buildNetworkSection(M, dc, options){
    const plan = getDimPlan(M, dc);
    const nodes = plan.nodes || [];
    const switches = plan.switches || plan.networkSwitches || [];
    const nodeHtml = nodes.length ? nodes.map(n=>renderNode(M,n)).join('') : '<div class="placeholder">No nodes assigned to this DB yet.</div>';
    const switchHtml = options.incSwitches ? (switches.length ? switches.map(sw=>renderSwitch(sw)).join('') : '<div class="placeholder">Switches placeholder: future network switches will appear here with switch ID, IP, ports, VLAN/network segment and connected nodes.</div>') : '';
    const uniHtml = buildUniverseTable(M, dc);
    return `<div class="section"><h3>1. Network / Nodes</h3><div class="grid cols2"><div>${nodeHtml}</div><div>${uniHtml}${switchHtml}</div></div></div>`;
  }
  function renderNode(M,n){
    const ports = Array.isArray(n.universes) ? n.universes : [];
    const portHtml = ports.map((u,i)=>`<div class="port"><div class="nr">${i+1}</div><div class="uni">${u ? 'UNI '+esc(u) : 'SPARE'}</div></div>`).join('') || '<div class="small">No ports</div>';
    return `<div class="card node"><div class="card-h"><span>${esc(n.id||n.name||'Node')}</span><span>${esc(n.ip||'')}</span></div><div class="card-b"><div class="small">${esc(n.name||'')} ${n.segment?'• '+esc(n.segment):''} ${n.subnet?'• '+esc(n.subnet):''}</div><div class="port-grid ports8">${portHtml}</div></div></div>`;
  }
  function renderSwitch(sw){
    return `<div class="card"><div class="card-h"><span>${esc(sw.id||sw.name||'Switch')}</span><span>${esc(sw.ip||'')}</span></div><div class="card-b small">${esc(sw.type||sw.model||'Network switch')} • ${esc(sw.segment||'')}</div></div>`;
  }
  function buildUniverseTable(M, dc){
    const rows = universeOverview(M, dc).map(([u,x])=>`<tr><td><b>UNI ${esc(u)}</b></td><td>${x.lk.length}</td><td>${x.veam.length}</td><td>${x.dmx.length}</td><td>${x.lk.length+x.veam.length+x.dmx.length}</td></tr>`).join('');
    return `<div class="card"><div class="card-h"><span>Universe overview</span><span>patch points</span></div><div class="card-b"><table><thead><tr><th>Universe</th><th>LK</th><th>Veam</th><th>DMX</th><th>Total</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No universes</td></tr>'}</tbody></table></div></div>`;
  }
  function buildSplitterSection(M, dc){
    const plan = getDimPlan(M, dc);
    const splitters = plan.splitters || [];
    const html = splitters.length ? splitters.map(sp=>renderSplitter(M,sp)).join('') : '<div class="placeholder">No splitters assigned to this DB yet.</div>';
    return `<div class="section"><h3>2. Splitters</h3><div class="grid cols2">${html}</div></div>`;
  }
  function renderSplitter(M,sp){
    const type = splitterTypeById(M, sp.typeId || sp.typeKey || sp.type) || {};
    const count = Number(sp.totalOutputs || type.totalOutputs || type.outputs || 0);
    const mode = sp.mode || type.mode || 'Single';
    const switching = sp.switching || type.switching || 'independent';
    let ports = '';
    for(let i=1;i<=count;i++) ports += `<div class="port"><div class="nr">${i}</div><div class="uni">OUT</div></div>`;
    return `<div class="card splitter"><div class="card-h"><span>${esc(sp.id||sp.name||'Splitter')}</span><span>${esc(mode)}</span></div><div class="card-b"><div class="small">${esc(sp.name||type.type||'')} • ${esc(switching)}</div><div class="port-grid ports8">${ports || '<div class="small">No outputs</div>'}</div></div></div>`;
  }
  function buildPatchSection(M, dc){
    const lks = listFromMap(M.byLK).filter(x=>x.dimcity===dc).sort((a,b)=>a.id.localeCompare(b.id));
    const linked = new Set();
    for(const lk of lks){ for(const slot of [1,2,3]) if(lk.veam?.[slot]) linked.add(lk.veam[slot]); }
    const looseVeams = listFromMap(M.byVeam).filter(v=>v.dimcity===dc && !linked.has(v.id)).sort((a,b)=>a.id.localeCompare(b.id));
    return `<div class="section"><h3>3. LK / Veam patch information</h3>${lks.map(lk=>renderLk(M,lk)).join('') || '<div class="placeholder">No LK blocks.</div>'}${looseVeams.length ? `<h3 style="margin-top:4mm">Standalone Veams</h3><div class="grid cols3">${looseVeams.map(renderVeam).join('')}</div>` : ''}</div>`;
  }
  function renderLk(M,lk){
    const mode = effBlockType(lk);
    if(mode === 'XLR12'){
      const ports = Array.from({length:12},(_,i)=>renderPort(getPortRecord(lk.lines,i+1),i+1));
      return `<div class="card lk-block"><div class="card-h"><span>${esc(lk.id)}</span><span>${blockLabel(mode)}</span></div><div class="card-b"><div class="port-grid ports12">${ports.join('')}</div></div></div>`;
    }
    const groups = [1,2,3].map(slot=>{
      const start = slot===1?1:slot===2?5:9;
      const title = slot===1 ? (mode==='MIXED'?'Top XLR 1-4 / Veam A':'Veam A') : slot===2 ? 'Veam B' : 'Veam C';
      const veamId = lk.veam?.[slot] || '';
      const ports = [0,1,2,3].map(i=>renderMergedPort(M, lk, start+i)).join('');
      return `<div class="lk-group"><h4>${title} ${veamId ? '• '+esc(veamId) : ''}</h4><div class="port-grid ports4">${ports}</div></div>`;
    }).join('');
    return `<div class="card lk-block"><div class="card-h"><span>${esc(lk.id)}</span><span>${blockLabel(mode)}</span></div><div class="card-b"><div class="lk-groups">${groups}</div></div></div>`;
  }
  function renderPort(L, nr){
    return `<div class="port"><div class="nr">${nr}</div><div class="uni">${L?.universe != null ? 'UNI '+esc(L.universe) : '—'}</div><div class="dest">${esc(L?.dest || '')}</div></div>`;
  }
  function renderMergedPort(M,lk,nr){
    const m = mergedLkPort(M, lk, nr);
    return `<div class="port ${m.conflict?'conflict':''}"><div class="nr">${nr}</div><div class="uni">${m.universe != null ? 'UNI '+esc(m.universe) : '—'}</div><div class="dest">${esc(m.dest || '')}</div><div class="small">${esc(m.source)}${m.veamId?' • '+esc(m.veamId)+'/'+m.veamPort:''}</div></div>`;
  }
  function renderVeam(v){
    let ports='';
    for(let i=1;i<=4;i++) ports += renderPort(getPortRecord(v.lines,i),i);
    return `<div class="card"><div class="card-h"><span>${esc(v.id)}</span><span>Veam 4</span></div><div class="card-b"><div class="port-grid ports4">${ports}</div></div></div>`;
  }
  function buildWarningsSection(M, dc){
    const rows = (M.issues || []).filter(i => !dc || String(i.message||'').includes(dc) || true).map(i=>`<tr><td>${esc(i.severity||'')}</td><td>${esc(i.code||'')}</td><td>${esc(i.message||'')}</td></tr>`).join('');
    return `<div class="section"><h3>4. Warnings / Errors</h3><table><thead><tr><th>Status</th><th>Code</th><th>Message</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No issues</td></tr>'}</tbody></table></div>`;
  }

  window.PdfExport = { open, buildPdfHtml };
  function hook(){
    const btn = document.getElementById('fileExportPdf');
    if(!btn || btn.dataset.pdfHooked) return false;
    btn.addEventListener('click', e=>{ e.preventDefault(); open(); });
    btn.dataset.pdfHooked='1';
    return true;
  }
  if(!hook()) document.addEventListener('DOMContentLoaded', hook);
})();
