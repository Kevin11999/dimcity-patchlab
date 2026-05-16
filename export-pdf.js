// export-pdf.js
// V9 professional PDF export foundation.
// Fixed order per DB: Project info -> Network/Nodes/Switches -> Splitters -> LK/Veam.
(function(){
  'use strict';

  const getM = () => (typeof window.LKApp?.getMODEL === 'function' ? window.LKApp.getMODEL() : null);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeFile = s => String(s || 'DimCity').replace(/[^a-z0-9_\-]+/gi, '_');
  const listFromMap = m => m && typeof m.values === 'function' ? [...m.values()] : [];
  const keysFromMap = m => m && typeof m.keys === 'function' ? [...m.keys()] : [];

  function safeColor(c, fallback='#2563eb'){
    return /^#[0-9a-fA-F]{6}$/.test(String(c||'')) ? c : fallback;
  }
  function dcColor(M, dc){ return safeColor(M?.dimColors?.[dc], '#2563eb'); }
  function uniColor(uni){
    const hue = (Number(uni || 0) * 47) % 360;
    return `hsl(${hue} 72% 38%)`;
  }
  function effBlockType(lk){
    if(lk?.blockType?.mode === 'Manual') return lk.blockType.value || 'MIXED';
    let used = 0;
    for(const L of (lk?.lines || [])) if(L && (L.universe != null || (L.dest && L.dest !== ''))) used++;
    return used > 4 ? 'XLR12' : 'MIXED';
  }
  function blockLabel(t){
    if(t === 'XLR12') return '12× XLR';
    if(t === 'VEAM_ONLY') return '3× Veam';
    return '4× XLR + 3× Veam';
  }
  function getDimPlan(M, dc){
    const p = M?.networkDevices?.dimCityPlans?.[dc];
    return p || {nodes:[],splitters:[],switches:[]};
  }
  function getPortRecord(lines, port){ return (lines || []).find(x => Number(x.port) === Number(port)) || null; }
  function getVeamRecord(M, veamId){ return M?.byVeam?.get?.(veamId) || null; }
  function veamPort(M, veamId, port){ return getPortRecord(getVeamRecord(M, veamId)?.lines || [], port); }
  function splitterTypeById(M, id){ return (M?.networkDevices?.splitterTypes || []).find(t => String(t.id) === String(id)) || {}; }

  function universeOverview(M, dc){
    const map = new Map();
    const bump = (u, kind) => {
      if(u == null || u === '') return;
      const k = String(u);
      if(!map.has(k)) map.set(k, { lk:0, veam:0, dmx:0 });
      map.get(k)[kind] += 1;
    };
    for(const L of (M.lines||[]).filter(x=>x.dimcity===dc)) bump(L.universe,'lk');
    for(const V of (M.veamLines||[]).filter(x=>x.dimcity===dc)) bump(V.universe,'veam');
    for(const D of (M.dmxLoose||[]).filter(x=>x.dimcity===dc)) bump(D.universe,'dmx');
    return [...map.entries()].sort((a,b)=>Number(a[0])-Number(b[0]));
  }
  function allPatchPointsForDim(M, dc){
    const out=[];
    for(const L of (M.lines||[])) if(L.dimcity===dc && L.universe!=null && L.universe!=='') out.push({kind:'LK',id:L.id,port:L.port,universe:Number(L.universe),dest:L.dest||''});
    for(const V of (M.veamLines||[])) if(V.dimcity===dc && V.universe!=null && V.universe!=='') out.push({kind:'Veam',id:V.id,port:V.port,universe:Number(V.universe),dest:V.dest||''});
    for(const D of (M.dmxLoose||[])) if(D.dimcity===dc && D.universe!=null && D.universe!=='') out.push({kind:'DMX',id:'Loose DMX',port:'—',universe:Number(D.universe),dest:D.dest||''});
    return out.sort((a,b)=>a.universe-b.universe || String(a.id).localeCompare(String(b.id)) || Number(a.port||0)-Number(b.port||0));
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
      port, slot, veamId, veamPort:veamPortNr,
      universe: hasV ? vLine.universe : lkLine.universe,
      dest: hasV ? vLine.dest : lkLine.dest,
      source: hasV && hasLk ? 'LK+Veam' : hasV ? 'Veam' : 'LK',
      conflict: hasV && hasLk && String(vLine.universe ?? '') !== String(lkLine.universe ?? '')
    };
  }

  function ensureModal(){
    if(document.getElementById('pdfExportModal')) return;
    const style = document.createElement('style');
    style.textContent = `
#pdfExportBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:9998}
#pdfExportModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999}
.pdf-card{width:min(1050px,94vw);max-height:90vh;overflow:auto;background:#101f34;color:#eaf4ff;border:1px solid #23405f;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.55)}
.pdf-hd{padding:16px 18px;border-bottom:1px solid #23405f;font-weight:700;font-size:19px;background:linear-gradient(90deg,rgba(78,168,255,.16),transparent)}
.pdf-bd{padding:14px 18px;display:grid;grid-template-columns:1.1fr .9fr;gap:16px}.pdf-ft{padding:14px 18px;border-top:1px solid #23405f;display:flex;gap:10px;justify-content:flex-end}.pdf-box{border:1px solid #23405f;border-radius:12px;padding:12px;background:#0b1728}.pdf-box h4{margin:0 0 10px;color:#9fc0df}.pdf-row{display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:center;margin:7px 0}.pdf-row input,.pdf-row select{width:100%;padding:7px 8px;border:1px solid #23405f;border-radius:8px;background:#07111f;color:#eaf4ff}.pdf-muted{color:#9fc0df;font-size:12px}.pdf-chips{display:flex;flex-wrap:wrap;gap:8px}.pdf-chip{display:inline-flex;gap:6px;align-items:center;padding:6px 10px;border:1px solid #23405f;border-radius:999px;background:#07111f}.pdf-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.btn{padding:8px 12px;border:1px solid #23405f;border-radius:10px;background:#07111f;color:#eaf4ff;cursor:pointer}.btn.primary{background:#4ea8ff;color:#041423;border-color:#4ea8ff}#pdfLogoPreview{max-width:220px;max-height:110px;display:none;border:1px dashed #23405f;border-radius:8px;padding:6px;background:#07111f;margin-top:8px}
@media(max-width:850px){.pdf-bd{grid-template-columns:1fr}.pdf-options{grid-template-columns:1fr}.pdf-row{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
    const bd = document.createElement('div'); bd.id='pdfExportBackdrop';
    const md = document.createElement('div'); md.id='pdfExportModal';
    md.innerHTML = `<div class="pdf-card"><div class="pdf-hd">Export PDF</div><div class="pdf-bd"><div class="pdf-box"><h4>Project information</h4><div class="pdf-row"><label>Project</label><input id="pdfProject" type="text"></div><div class="pdf-row"><label>Area</label><input id="pdfArea" type="text"></div><div class="pdf-row"><label>Location</label><input id="pdfLocation" type="text"></div><div class="pdf-row"><label>Date</label><input id="pdfDate" type="date"></div><div class="pdf-row"><label>Prepared by</label><input id="pdfPrepared" type="text"></div><div class="pdf-row"><label>Logo</label><div><input id="pdfLogoFile" type="file" accept="image/*"><img id="pdfLogoPreview"></div></div></div><div class="pdf-box"><h4>Layout and scope</h4><div class="pdf-row"><label>Preset</label><select id="pdfPreset"><option value="DB_DETAILED">DB detailed paperwork</option><option value="NETWORK_FIRST">Network crew overview</option><option value="PATCH_CREW">Patch crew overview</option></select></div><div class="pdf-row"><label>Page</label><select id="pdfPage"><option value="landscape">A4 landscape</option><option value="portrait">A4 portrait</option></select></div><div class="pdf-options"><label><input id="pdfIncProject" type="checkbox" checked> Project info first</label><label><input id="pdfIncNetwork" type="checkbox" checked> Nodes / Network info</label><label><input id="pdfIncSwitches" type="checkbox" checked> Future switches placeholder</label><label><input id="pdfIncSplitters" type="checkbox" checked> Splitters</label><label><input id="pdfIncPatch" type="checkbox" checked> LK / Veam info last</label><label><input id="pdfIncWarnings" type="checkbox" checked> Warnings / errors</label></div><div style="margin-top:12px"><b>DimCities</b></div><div style="margin:6px 0"><label><input type="radio" name="pdfScope" value="ALL" checked> All</label> &nbsp; <label><input type="radio" name="pdfScope" value="SEL"> Select</label></div><div id="pdfDimList" class="pdf-chips" style="display:none"></div><div class="pdf-muted" style="margin-top:10px">Export order: project info → network/nodes/switches → splitters → LK/Veam patch info.</div></div></div><div class="pdf-ft"><button class="btn" id="pdfCancel">Cancel</button><button class="btn primary" id="pdfExport">Export PDF</button></div></div>`;
    document.body.appendChild(bd); document.body.appendChild(md);
    bd.addEventListener('click', close); document.getElementById('pdfCancel').addEventListener('click', close); document.getElementById('pdfExport').addEventListener('click', onExport);
    document.querySelectorAll('input[name="pdfScope"]').forEach(r=>r.addEventListener('change', renderDimList));
    document.getElementById('pdfLogoFile').addEventListener('change', async e=>{ const f=e.target.files?.[0], img=document.getElementById('pdfLogoPreview'); if(!f){img.style.display='none'; img.src=''; delete img.dataset.dataurl; return;} const data=await fileToDataUrl(f); img.src=data; img.dataset.dataurl=data; img.style.display='block'; });
  }
  function open(){ ensureModal(); hydrateModalDefaults(); renderDimList(); document.getElementById('pdfExportBackdrop').style.display='block'; document.getElementById('pdfExportModal').style.display='flex'; }
  function close(){ const a=document.getElementById('pdfExportBackdrop'), b=document.getElementById('pdfExportModal'); if(a) a.style.display='none'; if(b) b.style.display='none'; }
  function hydrateModalDefaults(){ const M=getM()||{}, meta=M.projectMeta||{}; const set=(id,v)=>{const n=document.getElementById(id); if(n&&!n.value)n.value=v||'';}; set('pdfProject',meta.project); set('pdfArea',meta.area); set('pdfLocation',meta.location); set('pdfPrepared',meta.prepared); const d=document.getElementById('pdfDate'); if(d&&!d.value){const t=new Date(); d.value=meta.date||`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;} }
  function renderDimList(){ const M=getM()||{}, useSel=document.querySelector('input[name="pdfScope"][value="SEL"]')?.checked, box=document.getElementById('pdfDimList'); if(!box)return; box.innerHTML=''; box.style.display=useSel?'flex':'none'; if(!useSel)return; for(const dc of keysFromMap(M.byDim).sort((a,b)=>a.localeCompare(b))){ const lab=document.createElement('label'); lab.className='pdf-chip'; lab.innerHTML=`<input type="checkbox" value="${esc(dc)}" checked> ${esc(dc)}`; box.appendChild(lab);} }
  function fileToDataUrl(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
  async function onExport(){
    const M=getM(); if(!M)return;
    let dcs=keysFromMap(M.byDim).sort((a,b)=>a.localeCompare(b));
    if((document.querySelector('input[name="pdfScope"]:checked')?.value||'ALL')==='SEL') dcs=[...document.querySelectorAll('#pdfDimList input[type="checkbox"]')].filter(x=>x.checked).map(x=>x.value);
    if(!dcs.length){ alert('Select at least one DimCity.'); return; }
    const logo=document.getElementById('pdfLogoPreview');
    const meta={project:document.getElementById('pdfProject').value.trim(),area:document.getElementById('pdfArea').value.trim(),location:document.getElementById('pdfLocation').value.trim(),date:document.getElementById('pdfDate').value,prepared:document.getElementById('pdfPrepared').value.trim(),logoDataUrl:logo?.dataset?.dataurl||null};
    const options={preset:document.getElementById('pdfPreset').value,page:document.getElementById('pdfPage').value,incProject:document.getElementById('pdfIncProject').checked,incNetwork:document.getElementById('pdfIncNetwork').checked,incSwitches:document.getElementById('pdfIncSwitches').checked,incSplitters:document.getElementById('pdfIncSplitters').checked,incPatch:document.getElementById('pdfIncPatch').checked,incWarnings:document.getElementById('pdfIncWarnings').checked};
    const html=buildPdfHtml({M,meta,dcs,options});
    await window.app?.exportPdfFromHtml?.({html,defaultPath:`${safeFile(meta.project||'DimCity')}-${dcs.map(safeFile).join('_')}-DB_export.pdf`});
    close();
  }
  function buildPdfHtml({M,meta,dcs,options}){ return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.project||'DimCity Export')}</title><style>${printCss(options)}</style></head><body>${buildCover(meta,dcs,options)}${dcs.map(dc=>buildDimCity(M,meta,dc,options)).join('')}</body></html>`; }
  function printCss(options){
    const landscape = options.page !== 'portrait';
    return `@page{size:A4 ${landscape?'landscape':'portrait'};margin:8mm}*{box-sizing:border-box}body{font:9.5px/1.28 Arial,Helvetica,sans-serif;color:#0f172a;margin:0;background:#fff}.page{page-break-after:always}.cover{min-height:190mm;display:flex;flex-direction:column;justify-content:space-between;border:2px solid #cbd5e1;border-radius:14px;padding:18mm;text-align:center;background:linear-gradient(180deg,#fff,#f8fafc)}.cover h1{font-size:34px;letter-spacing:.13em;margin:0;color:#0f172a}.cover h2{font-size:18px;color:#2563eb;margin:7mm 0}.cover dl{display:grid;grid-template-columns:38mm 1fr;max-width:120mm;margin:0 auto;text-align:left;gap:4px}.cover dt{font-weight:700;color:#64748b}.cover dd{margin:0}.cover img{max-width:110mm;max-height:65mm;object-fit:contain}.db-page{padding:0}.db-head{border-left:8px solid var(--db,#2563eb);background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:4mm 5mm;margin-bottom:4mm;display:flex;justify-content:space-between;gap:6mm}.db-title{font-size:24px;font-weight:900;color:#0f172a}.db-sub{font-size:9px;color:#64748b}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:2mm;margin-top:2mm}.stat{border:1px solid #cbd5e1;border-radius:7px;padding:1.8mm;background:#fff}.stat b{display:block;font-size:14px}.section{break-inside:avoid;margin:0 0 4mm 0}.section h3{font-size:12px;margin:0 0 2mm 0;padding:2mm 3mm;background:#0f172a;color:#fff;border-radius:7px;letter-spacing:.04em}.grid{display:grid;gap:2.5mm}.cols2{grid-template-columns:1fr 1fr}.cols3{grid-template-columns:repeat(3,1fr)}.card{border:1px solid #cbd5e1;border-radius:8px;background:#fff;break-inside:avoid;overflow:hidden;margin-bottom:2.5mm}.card-h{background:#e2e8f0;padding:2mm 3mm;font-weight:900;display:flex;justify-content:space-between;gap:4mm}.card-b{padding:2.3mm}table{width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #cbd5e1;padding:1.25mm 1.6mm;vertical-align:top}th{background:#e2e8f0;text-align:left;font-weight:800}.port-grid{display:grid;gap:1mm}.ports4{grid-template-columns:repeat(4,1fr)}.ports8{grid-template-columns:repeat(8,1fr)}.ports12{grid-template-columns:repeat(12,1fr)}.port{border:1.5px solid var(--uni,#94a3b8);border-radius:6px;padding:1.2mm;background:color-mix(in srgb,var(--uni,#94a3b8) 10%,#fff);min-height:14mm;overflow:hidden}.port .nr{font-weight:900;color:#0f172a}.port .uni{font-size:10px;font-weight:900;color:var(--uni,#2563eb)}.port .dest,.port .src{font-size:7.8px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.node .port{border-radius:999px;text-align:center;min-height:11mm}.splitter .port{background:color-mix(in srgb,var(--uni,#f59e0b) 14%,#fff)}.spare{border-style:dashed!important;color:#94a3b8!important;background:#f8fafc!important}.lk-block{margin-bottom:3mm}.lk-groups{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm}.lk-group{border:1px solid #cbd5e1;border-radius:7px;padding:2mm;background:#f8fafc}.lk-group h4{margin:0 0 1.4mm;font-size:9.5px}.conflict{background:#fee2e2!important;border-color:#dc2626!important}.placeholder{border:1px dashed #94a3b8;border-radius:8px;padding:4mm;color:#64748b;background:#f8fafc}.small{font-size:8px;color:#64748b}.err{color:#b91c1c}.warn{color:#b45309}`;
  }
  function buildCover(meta,dcs,options){ const logo=meta.logoDataUrl?`<img src="${meta.logoDataUrl}">`:'<div class="placeholder">No logo selected</div>'; return `<section class="page cover"><div><h1>${esc(meta.project||'DIMCITY PATCHLAB')}</h1><h2>${esc(dcs.join(', '))}</h2><dl><dt>Area</dt><dd>${esc(meta.area||'—')}</dd><dt>Location</dt><dd>${esc(meta.location||'—')}</dd><dt>Date</dt><dd>${esc(meta.date||'—')}</dd><dt>Prepared by</dt><dd>${esc(meta.prepared||'—')}</dd><dt>Layout</dt><dd>${esc(options.preset)}</dd></dl></div><div>${logo}</div><div class="small">Project info → Network / Nodes / Switches → Splitters → LK / Veam patch info</div></section>`; }
  function buildDimCity(M,meta,dc,options){ const dim=M.byDim?.get?.(dc)||{lks:new Set(),veams:new Set(),red:0,yellow:0}; const unis=universeOverview(M,dc); const points=unis.reduce((n,[,x])=>n+x.lk+x.veam+x.dmx,0); return `<section class="page db-page" style="--db:${dcColor(M,dc)}">${options.incProject?buildDbHeader(meta,dc,dim,unis.length,points):''}${options.incNetwork?buildNetworkSection(M,dc,options):''}${options.incSplitters?buildSplitterSection(M,dc):''}${options.incPatch?buildPatchSection(M,dc):''}${options.incWarnings?buildWarningsSection(M,dc):''}</section>`; }
  function buildDbHeader(meta,dc,dim,uniCount,points){ return `<div class="db-head"><div><div class="db-title">${esc(dc)}</div><div class="db-sub">${esc(meta.project||'Project')} • ${esc(meta.area||'Area')} • ${esc(meta.location||'Location')}</div><div class="stats"><div class="stat"><b>${uniCount}</b>Universes</div><div class="stat"><b>${points}</b>Patch points</div><div class="stat"><b>${dim.lks?.size||0}</b>LK</div><div class="stat"><b>${dim.veams?.size||0}</b>Veam</div><div class="stat"><b class="err">${dim.red||0}</b>Errors</div></div></div><div class="stat"><b class="warn">${dim.yellow||0}</b>Warnings</div></div>`; }
  function buildNetworkSection(M,dc,options){ const plan=getDimPlan(M,dc), nodes=plan.nodes||[], switches=plan.switches||plan.networkSwitches||[]; const nodeHtml=nodes.length?nodes.map(n=>renderNode(n)).join(''):'<div class="placeholder">No nodes assigned to this DB yet.</div>'; const swHtml=options.incSwitches?(switches.length?switches.map(renderSwitch).join(''):'<div class="placeholder">Switches placeholder: future network switches will appear here with switch ID, IP, ports, VLAN/network segment and connected nodes.</div>'):''; return `<div class="section"><h3>1. Network / Nodes</h3><div class="grid cols2"><div>${nodeHtml}</div><div>${buildUniverseTable(M,dc)}${swHtml}</div></div></div>`; }
  function renderNode(n){ const ports=Array.isArray(n.universes)?n.universes:[]; const portHtml=ports.map((u,i)=>`<div class="port ${u?'':'spare'}" style="--uni:${u?uniColor(u):'#94a3b8'}"><div class="nr">${i+1}</div><div class="uni">${u?'UNI '+esc(u):'SPARE'}</div></div>`).join('')||'<div class="small">No ports</div>'; return `<div class="card node"><div class="card-h"><span>${esc(n.id||n.name||'Node')}</span><span>${esc(n.ip||'')}</span></div><div class="card-b"><div class="small">${esc(n.name||'')} ${n.segment?'• segment '+esc(n.segment):''} ${n.subnet?'• '+esc(n.subnet):''}</div><div class="port-grid ports8">${portHtml}</div></div></div>`; }
  function renderSwitch(sw){ return `<div class="card"><div class="card-h"><span>${esc(sw.id||sw.name||'Switch')}</span><span>${esc(sw.ip||'')}</span></div><div class="card-b small">${esc(sw.type||sw.model||'Network switch')} • ${esc(sw.segment||'')}</div></div>`; }
  function buildUniverseTable(M,dc){ const rows=universeOverview(M,dc).map(([u,x])=>`<tr><td><b style="color:${uniColor(u)}">UNI ${esc(u)}</b></td><td>${x.lk}</td><td>${x.veam}</td><td>${x.dmx}</td><td>${x.lk+x.veam+x.dmx}</td></tr>`).join(''); return `<div class="card"><div class="card-h"><span>Universe overview</span><span>physical patch points</span></div><div class="card-b"><table><thead><tr><th>Universe</th><th>LK</th><th>Veam</th><th>DMX</th><th>Total</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No universes</td></tr>'}</tbody></table></div></div>`; }
  function buildSplitterSection(M,dc){ const plan=getDimPlan(M,dc), splitters=plan.splitters||[]; return `<div class="section"><h3>2. Splitters</h3><div class="grid cols2">${splitters.length?splitters.map(sp=>renderSplitter(M,dc,sp)).join(''):'<div class="placeholder">No splitters assigned to this DB yet.</div>'}</div></div>`; }
  function renderSplitter(M,dc,inst){ const type=splitterTypeById(M,inst.typeId), count=Number(type.outputCount||inst.portAssignments?.length||0)||10; let assigns=Array.isArray(inst.portAssignments)?inst.portAssignments:[]; if(!assigns.length) assigns=allPatchPointsForDim(M,dc).filter(p=>(inst.universes||[]).map(Number).includes(Number(p.universe))).slice(0,count); const ports=Array.from({length:count},(_,i)=>{const a=assigns[i]; if(!a)return `<div class="port spare"><div class="nr">${i+1}</div><div class="uni">SPARE</div></div>`; return `<div class="port" style="--uni:${uniColor(a.universe)}"><div class="nr">${i+1}</div><div class="uni">UNI ${esc(a.universe)}</div><div class="dest">${esc(a.kind)} ${esc(a.id)}${a.port!=='—'?' / P'+esc(a.port):''}</div><div class="src">${esc(a.dest||'')}</div></div>`;}).join(''); return `<div class="card splitter"><div class="card-h"><span>${esc(inst.id||inst.name||'Splitter')}</span><span>${esc(type.mode||'')}</span></div><div class="card-b"><div class="small">${esc(inst.name||type.name||type.type||'')} • ${esc(type.switching||'independent')}</div><div class="port-grid ports8">${ports}</div></div></div>`; }
  function buildPatchSection(M,dc){ const lks=listFromMap(M.byLK).filter(x=>x.dimcity===dc).sort((a,b)=>a.id.localeCompare(b.id)); const linked=new Set(); for(const lk of lks){ for(const s of [1,2,3]) if(lk.veam?.[s]) linked.add(lk.veam[s]); } const loose=listFromMap(M.byVeam).filter(v=>v.dimcity===dc&&!linked.has(v.id)).sort((a,b)=>a.id.localeCompare(b.id)); return `<div class="section"><h3>3. LK / Veam patch information</h3>${lks.map(lk=>renderLk(M,lk)).join('')||'<div class="placeholder">No LK blocks.</div>'}${loose.length?`<h3 style="margin-top:3mm">Standalone Veams</h3><div class="grid cols3">${loose.map(v=>renderVeam(v)).join('')}</div>`:''}</div>`; }
  function renderLk(M,lk){ const mode=effBlockType(lk); if(mode==='XLR12'){ const ports=Array.from({length:12},(_,i)=>renderPort(getPortRecord(lk.lines,i+1),i+1)); return `<div class="card lk-block"><div class="card-h"><span>${esc(lk.id)}</span><span>${blockLabel(mode)}</span></div><div class="card-b"><div class="port-grid ports12">${ports.join('')}</div></div></div>`;} const groups=[1,2,3].map(slot=>{ const start=slot===1?1:slot===2?5:9; const title=slot===1?(mode==='MIXED'?'Top XLR 1-4 / Veam A':'Veam A'):slot===2?'Veam B':'Veam C'; const vid=lk.veam?.[slot]||''; return `<div class="lk-group"><h4>${title} ${vid?'• '+esc(vid):''}</h4><div class="port-grid ports4">${[0,1,2,3].map(i=>renderMergedPort(M,lk,start+i)).join('')}</div></div>`; }).join(''); return `<div class="card lk-block"><div class="card-h"><span>${esc(lk.id)}</span><span>${blockLabel(mode)}</span></div><div class="card-b"><div class="lk-groups">${groups}</div></div></div>`; }
  function renderPort(L,nr){ const u=L?.universe; return `<div class="port ${u?'':'spare'}" style="--uni:${u?uniColor(u):'#94a3b8'}"><div class="nr">${nr}</div><div class="uni">${u!=null?'UNI '+esc(u):'—'}</div><div class="dest">${esc(L?.dest||'')}</div></div>`; }
  function renderMergedPort(M,lk,nr){ const m=mergedLkPort(M,lk,nr), u=m.universe; return `<div class="port ${m.conflict?'conflict':''} ${u?'':'spare'}" style="--uni:${u?uniColor(u):'#94a3b8'}"><div class="nr">${nr}</div><div class="uni">${u!=null?'UNI '+esc(u):'—'}</div><div class="dest">${esc(m.dest||'')}</div><div class="src">${esc(m.source||'')}${m.veamId?' • '+esc(m.veamId)+'/'+m.veamPort:''}</div></div>`; }
  function renderVeam(v){ let ports=''; for(let i=1;i<=4;i++) ports+=renderPort(getPortRecord(v.lines,i),i); return `<div class="card"><div class="card-h"><span>${esc(v.id)}</span><span>Veam 4</span></div><div class="card-b"><div class="port-grid ports4">${ports}</div></div></div>`; }
  function buildWarningsSection(M){ const rows=(M.issues||[]).map(i=>`<tr><td>${esc(i.severity||'')}</td><td>${esc(i.code||'')}</td><td>${esc(i.message||'')}</td></tr>`).join(''); return `<div class="section"><h3>4. Warnings / Errors</h3><table><thead><tr><th>Status</th><th>Code</th><th>Message</th></tr></thead><tbody>${rows||'<tr><td colspan="3">No issues</td></tr>'}</tbody></table></div>`; }

  window.PdfExport = { open, buildPdfHtml };
  function hook(){ const btn=document.getElementById('fileExportPdf'); if(!btn||btn.dataset.pdfHooked)return false; btn.addEventListener('click', e=>{ e.preventDefault(); open(); }); btn.dataset.pdfHooked='1'; return true; }
  if(!hook()) document.addEventListener('DOMContentLoaded', hook);
})();
