// export-pdf.js
// Wizard + PDF-html builder voor LK/Veam export.
// Vereist: window.LKApp (getMODEL, effectiveBlockType, veam helpers)
// en window.app.exportPdfFromHtml({html, defaultPath})

(function(){
  'use strict';

  // ---- korte aliassen / guards
  const getM  = () => (typeof window.LKApp?.getMODEL === 'function' ? window.LKApp.getMODEL() : null);
  const effBT = (lk) => (typeof window.effectiveBlockType === 'function'
                          ? window.effectiveBlockType(lk)
                          : (lk?.blockType?.mode==='Manual' ? lk.blockType.value : autoBlockTypeFallback(lk)));

  function autoBlockTypeFallback(lk){
    let used=0;
    for(const L of (lk?.lines||[])) if (L && (L.universe!=null || (L.dest && L.dest!==''))) used++;
    return used>4 ? 'XLR12' : 'MIXED';
  }

  // =========================
  //  UI WIZARD (IN DE APP)
  // =========================
  function ensureModal(){
    if (document.getElementById('pdfExportModal')) return;

    const style = document.createElement('style');
    style.textContent = `
#pdfExportBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;z-index:9998}
#pdfExportModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999}
.pdf-card{width:min(920px,92vw);max-height:88vh;overflow:auto;background:#121820;color:#eaf2ff;border:1px solid #1e2835;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.pdf-hd{padding:16px 18px;border-bottom:1px solid #1e2835;font-weight:600;font-size:18px}
.pdf-bd{padding:14px 18px;display:grid;grid-template-columns: 1.2fr .8fr;gap:16px}
.pdf-ft{padding:14px 18px;border-top:1px solid #1e2835;display:flex;gap:10px;justify-content:flex-end}
.pdf-box{border:1px solid #1e2835;border-radius:10px;padding:12px}
.pdf-box h4{margin:0 0 10px 0;font-size:14px;color:#9fb0c3}
.pdf-row{display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center;margin:6px 0}
.pdf-row input[type="text"], .pdf-row input[type="date"]{width:100%;padding:6px 8px;border:1px solid #2a3442;border-radius:8px;background:#0b0f14;color:#eaf2ff}
.pdf-chips{display:flex;flex-wrap:wrap;gap:8px}
.pdf-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #2a3442;border-radius:999px;background:#0b0f14;cursor:pointer}
.pdf-muted{color:#9fb0c3;font-size:12px}
.pdf-split{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.pdf-split label{display:inline-flex;gap:8px;align-items:center}
.pdf-actions{display:flex;gap:8px}
.btn{padding:8px 12px;border:1px solid #2a3442;border-radius:10px;background:#0b0f14;color:#eaf2ff;cursor:pointer}
.btn.primary{background:#4ea8ff;color:#041423;border-color:#4ea8ff}
.btn:disabled{opacity:.6;cursor:not-allowed}
.pdf-help{margin-top:8px}
#pdfLogoPreview{max-width:220px;max-height:110px;display:block;border:1px dashed #2a3442;border-radius:8px;padding:6px;background:#0b0f14}
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'pdfExportBackdrop';

    const wrap = document.createElement('div');
    wrap.id = 'pdfExportModal';
    wrap.innerHTML = `
      <div class="pdf-card">
        <div class="pdf-hd">Export PDF</div>
        <div class="pdf-bd">
          <div class="pdf-box">
            <h4>Project information</h4>
            <div class="pdf-row"><label>Project naam</label><input id="pdfMetaProject" type="text" placeholder="Projectnaam"></div>
            <div class="pdf-row"><label>Area</label><input id="pdfMetaArea" type="text" placeholder="Area"></div>
            <div class="pdf-row"><label>Location</label><input id="pdfMetaLocation" type="text" placeholder="Location"></div>
            <div class="pdf-row"><label>Project date</label><input id="pdfMetaDate" type="date"></div>
            <div class="pdf-row"><label>Prepared by</label><input id="pdfMetaPrep" type="text" placeholder="Name"></div>
            <div class="pdf-row">
              <label>Logo / image</label>
              <div>
                <input id="pdfMetaLogoFile" type="file" accept="image/*">
                <div class="pdf-help pdf-muted">Optional. Shown large on the cover page.</div>
                <img id="pdfLogoPreview" style="margin-top:8px;display:none;">
              </div>
            </div>
          </div>

          <div class="pdf-box">
            <h4>Scope and output</h4>

            <div class="pdf-split" style="margin-bottom:10px;">
              <div><b>DimCities</b></div>
              <label><input type="radio" name="pdfScope" value="ALL" checked> All</label>
              <label><input type="radio" name="pdfScope" value="SEL"> Select</label>
            </div>

            <div id="pdfDimList" class="pdf-chips" style="display:none;"></div>
            <div class="pdf-help pdf-muted" id="pdfDimHelp"></div>

            <div class="pdf-split" style="margin:14px 0 4px;">
              <div><b>Mode</b></div>
              <label><input type="radio" name="pdfMode" value="COMBINED" checked> One PDF (all)</label>
              <label><input type="radio" name="pdfMode" value="PER_DC"> DimCities as separate files (1 PDF per DimCity)</label>
            </div>

            <div class="pdf-help pdf-muted">
              Layout per blok:
              <ul style="margin:6px 0 0 18px;">
                <li>LK 12×XLR: ports 1–12 horizontaal; per poort duidelijk “Port / Universe / Location”.</li>
                <li>LK 4×XLR + 3×Veam: ports 1–12 in groepen 1–4, 5–8, 9–12 met kaders per Veam.</li>
                <li>LK 3×Veam: groepen 1–4, 5–8, 9–12 duidelijk gelabeld per Veam.</li>
                <li>Losse Veam 4: 3 blokken naast elkaar per rij (4 ports breed).</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="pdf-ft">
          <button class="btn" id="pdfCancel">Cancel</button>
          <button class="btn primary" id="pdfExport">Exporteren</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(wrap);

    // Events
    backdrop.addEventListener('click', close);
    document.getElementById('pdfCancel').addEventListener('click', close);

    // Scope radios
    for (const r of document.querySelectorAll('input[name="pdfScope"]')){
      r.addEventListener('change', () => renderDimchips());
    }
    document.getElementById('pdfExport').addEventListener('click', onExport);

    // Logo file preview
    const fi = document.getElementById('pdfMetaLogoFile');
    fi.addEventListener('change', async (e)=>{
      const f = e.target.files?.[0];
      const prev = document.getElementById('pdfLogoPreview');
      if(!f){ prev.style.display='none'; prev.src=''; delete prev.dataset.dataurl; return; }
      const dataUrl = await fileToDataUrl(f);
      prev.src = dataUrl; prev.style.display='block';
      prev.dataset.dataurl = dataUrl;
    });

    renderDimchips();
  }

  function open(){
    ensureModal();
    document.getElementById('pdfExportBackdrop').style.display = 'block';
    document.getElementById('pdfExportModal').style.display = 'flex';
    hydrateDefaults();
  }
  function close(){
    const bd = document.getElementById('pdfExportBackdrop');
    const md = document.getElementById('pdfExportModal');
    if (bd) bd.style.display = 'none';
    if (md) md.style.display = 'none';
  }

  function hydrateDefaults(){
    const M = getM(); if(!M) return;
    const d = document.getElementById('pdfMetaDate');
    if (d && !d.value){
      const now = new Date();
      const iso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      d.value = iso;
    }
    const help = document.getElementById('pdfDimHelp');
    const dcCount = (M.byDim ? M.byDim.size : 0);
    if (help) help.textContent = `${dcCount} DimCities gevonden.`;
  }

  function renderDimchips(){
    const M = getM(); if(!M) return;
    const useSel = document.querySelector('input[name="pdfScope"][value="SEL"]')?.checked;
    const box = document.getElementById('pdfDimList');
    if (!box) return;
    box.innerHTML = '';
    box.style.display = useSel ? '' : 'none';

    const parent = box.parentElement;
    if (parent){
      const oldTools = parent.querySelectorAll('.pdf-dim-tools');
      oldTools.forEach(el => el.remove());
    }

    if(!useSel) return;

    const all = [...(M.byDim?.keys?.()||[])].sort((a,b)=>a.localeCompare(b));
    for (const dc of all){
      const chip = document.createElement('label');
      chip.className = 'pdf-chip';
      chip.innerHTML = `<input type="checkbox" value="${dc}" checked><span>${dc}</span>`;
      box.appendChild(chip);
    }
    const tools = document.createElement('div');
    tools.className = 'pdf-dim-tools';
    tools.style.marginTop = '8px';
    tools.innerHTML = `
      <button type="button" class="btn" id="pdfSelAll">Alls</button>
      <button type="button" class="btn" id="pdfSelNone">Niets</button>
    `;
    parent.appendChild(tools);
    tools.querySelector('#pdfSelAll').onclick  = ()=> box.querySelectorAll('input[type="checkbox"]').forEach(c=>c.checked=true);
    tools.querySelector('#pdfSelNone').onclick = ()=> box.querySelectorAll('input[type="checkbox"]').forEach(c=>c.checked=false);
  }

  // =========================
  //  EXPORT LOGICA
  // =========================
  async function onExport(){
    const logoPrev = document.getElementById('pdfLogoPreview');
    const meta = {
      project:   document.getElementById('pdfMetaProject').value.trim(),
      area:      document.getElementById('pdfMetaArea').value.trim(),
      location:  document.getElementById('pdfMetaLocation').value.trim(),
      date:      document.getElementById('pdfMetaDate').value,
      prepared:  document.getElementById('pdfMetaPrep').value.trim(),
      logoDataUrl: (logoPrev && logoPrev.dataset && logoPrev.dataset.dataurl) ? logoPrev.dataset.dataurl : null
    };
    const scope = document.querySelector('input[name="pdfScope"]:checked')?.value || 'ALL';
    const mode  = document.querySelector('input[name="pdfMode"]:checked')?.value || 'COMBINED';

    const M = getM(); if(!M) return;

    let dcs = [...(M.byDim?.keys?.()||[])].sort((a,b)=>a.localeCompare(b));
    if (scope === 'SEL'){
      const sel = [...document.querySelectorAll('#pdfDimList input[type="checkbox"]')]
        .filter(c=>c.checked).map(c=>c.value);
      if (!sel.length){ alert('Kies minimaal één DimCity.'); return; }
      dcs = sel;
    }

    const base = (meta.project || 'LK-VEAM').replace(/[^\w\-]+/g,'_');

    if (mode === 'COMBINED'){
      const dcSuffix = dcs.length ? '-' + dcs.map(dc => String(dc).toUpperCase()).join('_') : '';
      const scopeLabel = scope === 'ALL'
        ? 'All DimCities'
        : 'Selected DimCities: ' + dcs.map(dc=>String(dc).toUpperCase()).join(', ');
      const html = buildPdfHtml({ meta, dcs, scopeLabel, currentDc: null });
      const defName = `${base}${dcSuffix}-LK_Veam_export.pdf`;
      await doExport(html, defName);
    } else {
      for (const dc of dcs){
        const dcUpper = String(dc).toUpperCase();
        const scopeLabel = `DimCity ${dcUpper}`;
        const html = buildPdfHtml({ meta, dcs:[dc], scopeLabel, currentDc: dc });
        const defName = `${base}-${dcUpper}-LK_Veam_export.pdf`;
        // eslint-disable-next-line no-await-in-loop
        await doExport(html, defName);
      }
    }

    close();
  }

  async function doExport(html, defaultPath){
    if (!window.app?.exportPdfFromHtml){
      alert('PDF export bridge ontbreekt (exportPdfFromHtml).');
      return;
    }
    try{
      await window.app.exportPdfFromHtml({ html, defaultPath });
    }catch(e){
      console.error(e);
      alert('PDF export mislukt. Zie console.');
    }
  }

  function fileToDataUrl(file){
    return new Promise((resolve,reject)=>{
      const rd = new FileReader();
      rd.onload = ()=> resolve(rd.result);
      rd.onerror = reject;
      rd.readAsDataURL(file);
    });
  }

  // =========================
  //  HTML / CSS BUILDER
  // =========================
  function buildPdfHtml({ meta, dcs, scopeLabel = null, currentDc = null }){
    const M = getM() || {};
    const css = buildPrintCss();
    const cover = buildCover(meta, { scopeLabel, dcs, currentDc });
    const sections = dcs.map(dc => buildDimCitySection(dc, M)).join('\n');

    return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Export • ${escapeHtml(meta.project||'LK/Veam')}</title>
  <style>${css}</style>
</head>
<body>
  ${cover}
  ${sections}
</body>
</html>`;
  }

  function buildPrintCss(){
    return `
@page { size: A4; margin: 12mm; }
*{box-sizing:border-box}
body{
  font:11px/1.4 system-ui,-apple-system,Segoe UI,Roboto;
  color:#0b0f14;
  margin:0;
  padding:0;
  background:#ffffff;
}

/* Cover */
section.cover{page-break-after:always;padding:8mm 10mm;}
.cover-inner{
  min-height:240mm;
  border:2px solid #e2e8f0;
  border-radius:12px;
  padding:20mm 15mm;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  background:#ffffff;
  text-align:center;
}
.cover-title{
  font-size:30px;
  font-weight:800;
  margin:0 0 6mm 0;
  letter-spacing:0.18em;
  color:#ff7b00;
}
.cover-meta{
  font-size:11px;
  margin:0 0 6mm 0;
  color:#4a5568;
}
.cover-meta dl{
  margin:0 auto;
  display:grid;
  grid-template-columns:28mm 1fr;
  row-gap:3px;
  column-gap:8px;
  max-width:90mm;
  text-align:left;
}
.cover-meta dt{
  margin:0;
  font-weight:600;
  color:#718096;
}
.cover-meta dd{
  margin:0;
}
.cover-scope{
  margin-top:6mm;
  font-size:11px;
  color:#2b6cb0;
  font-weight:600;
}
.cover-logo-wrap{
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  margin-top:10mm;
}
.cover-logo{
  max-width:110mm;
  max-height:70mm;
  border-radius:10px;
  border:1px solid rgba(226,232,240,0.9);
  padding:4mm;
  object-fit:contain;
  background:#f7fafc;
}
.cover-logo-placeholder{
  border:1px dashed rgba(203,213,224,0.9);
  border-radius:10px;
  padding:10mm;
  font-size:11px;
  color:#718096;
  background:#f7fafc;
}

/* DimCity secties */
section.dc{
  page-break-after:always;
  padding:4mm 4mm 6mm 4mm;
}
.dc-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin:0 0 4mm 0;
  padding:2mm 3mm;
  border-radius:6px;
  background:#ffffff;
  border:1px solid #d3dce8;
}
.dc-header-left{
  flex:1;
  display:flex;
  flex-direction:column;
  gap:1mm;
  align-items:center;
  text-align:center;
}
.dc-title{
  font-size:22px;
  font-weight:800;
  color:#ff7b00;
  letter-spacing:0.2em;
}
.dc-header-right{
  display:flex;
  flex-direction:column;
  align-items:flex-end;
  font-size:10px;
  color:#2d3748;
}
.dc-header-right div{
  line-height:1.2;
}
.dc-rows{
  display:flex;
  flex-direction:column;
  gap:5mm;
}
.dc-row{
  display:flex;
  flex-wrap:nowrap;
  gap:3mm;
  page-break-inside:avoid;
}

/* Blokken */
.lk-block,.veam-block{
  border-radius:6px;
  padding:3mm 4mm;
  font-size:10px;
  page-break-inside:avoid;
  background:#17345b;
  box-shadow:0 1px 2px rgba(15,23,42,0.35);
  color:#f7fafc;
}
.lk-block{
  flex:1 1 100%;
  border:1px solid #0b2745;
}
.veam-block{
  flex:0 0 33.3333%;
  border:1px solid #dd6b20;
}

.block-title{
  font-weight:800;
  margin:0 0 0.5mm 0;
  color:#ff8b1a;
  font-size:13px;
}
.block-sub{
  font-size:9px;
  color:#f6e05e;
  margin:0 0 2mm 0;
}

/* Groepen in LK mixed / LK Veam-only */
.mixed-groups,
.veam-groups{
  display:flex;
  flex-direction:column;
  gap:2mm;
}
.mixed-group,
.veam-group{
  border-radius:4px;
  padding:1.5mm 2mm 2mm 2mm;
  background:rgba(15,23,42,0.65);
  border:1px solid rgba(15,23,42,0.9);
}
.mixed-group-header,
.veam-group-header{
  font-size:9.5px;
  font-weight:700;
  color:#ffb347;
  text-align:center;
  margin:0 0 1mm 0;
}

/* Poorten */
.port-table{
  display:grid;
  gap:0.8mm;
}
.lk-ports{
  grid-template-columns:repeat(12,1fr);
}
.veam-ports{
  grid-template-columns:repeat(4,1fr);
}
.group-ports{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:0.8mm;
}
.port-col{
  padding:0;
}
.port-box{
  border:1px solid #e2e8f0;
  border-radius:3px;
  padding:0.6mm 0.6mm;
  background:#edf2f7;
  color:#1a202c;
}
.port-box.group1{
  background:#f6ad55;
  border-color:#dd6b20;
}
.port-box.group2{
  background:#9ae6b4;
  border-color:#38a169;
}
.port-box.group3{
  background:#bee3f8;
  border-color:#3182ce;
}

.port-label{
  font-size:8px;
  font-weight:800;
  margin-bottom:0.3mm;
  color:#1a202c;
}
.port-universe,
.port-loc{
  font-size:7.5px;
  color:#1a202c;
  line-height:1.25;
}
.port-universe-label,
.port-loc-label{
  font-weight:600;
  margin-right:1mm;
}
.port-universe-value,
.port-loc-value{
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* tweede (Veam-)regel in mixed */
.port-universe.veam-line,
.port-loc.veam-line{
  margin-top:0.3mm;
  border-top:1px dashed rgba(26,32,44,0.35);
  padding-top:0.3mm;
}
    `;
  }

  function buildCover(meta, { scopeLabel, dcs, currentDc }){
    const p = escapeHtml(meta.project || '');
    const a = escapeHtml(meta.area || '');
    const l = escapeHtml(meta.location || '');
    const d = escapeHtml(meta.date || '');
    const pr= escapeHtml(meta.prepared || '');
    const dcUpper = currentDc ? String(currentDc).toUpperCase() : null;
    const mainTitle = dcUpper || (p || 'LK/Veam Rapport');
    const logo = meta.logoDataUrl ? `<img class="cover-logo" src="${meta.logoDataUrl}" alt="logo">` : '';
    const autoScope = (dcs && dcs.length===1)
      ? `DimCity ${String(dcs[0]).toUpperCase()}`
      : 'All DimCities';
    const scope = escapeHtml(scopeLabel || autoScope);

    return `
<section class="cover">
  <div class="cover-inner">
    <div>
      <div class="cover-title">${mainTitle}</div>
      <div class="cover-meta">
        <dl>
          <dt>Project</dt><dd>${p || '—'}</dd>
          <dt>Area</dt><dd>${a || '—'}</dd>
          <dt>Location</dt><dd>${l || '—'}</dd>
          <dt>Datum</dt><dd>${d || '—'}</dd>
          <dt>Prepared by</dt><dd>${pr || '—'}</dd>
        </dl>
        <div class="cover-scope">Scope: ${scope}</div>
      </div>
    </div>
    <div class="cover-logo-wrap">
      ${logo || '<div class="cover-logo-placeholder">Geen afbeelding geselecteerd</div>'}
    </div>
  </div>
</section>`;
  }

  function buildDimCitySection(dc, M){
    const blocks = collectBlocksForDimCity(dc, M);
    const rowsHtml = layoutBlocksIntoRows(blocks, M);

    const lkCount   = blocks.filter(b => b.kind === 'LK').length;
    const veamCount = blocks.filter(b => b.kind === 'VEAM').length;
    const dcUpper   = String(dc).toUpperCase();

    return `
<section class="dc">
  <div class="dc-header">
    <div class="dc-header-left">
      <div class="dc-title">${escapeHtml(dcUpper)}</div>
    </div>
    <div class="dc-header-right">
      <div>LK’s: ${lkCount}</div>
      <div>Veams: ${veamCount}</div>
    </div>
  </div>
  <div class="dc-rows">
    ${rowsHtml}
  </div>
</section>`;
  }

  // =========================
  //  MODEL → BLOKKEN
  // =========================
  function collectBlocksForDimCity(dc, M){
    const byLK   = M.byLK   || new Map();
    const byVeam = M.byVeam || new Map();
    const blocks = [];
    const usedVeamIds = new Set();

    const lks = [...byLK.values()].filter(x=>x.dimcity===dc).sort((a,b)=>a.id.localeCompare(b.id));
    for (const lk of lks){
      const mode = effBT(lk); // 'XLR12' | 'MIXED' | 'VEAM_ONLY'
      let type;
      if (mode === 'XLR12') type = 'LK_XLR12';
      else if (mode === 'MIXED') type = 'LK_MIXED';
      else type = 'LK_VEAM3';

      blocks.push({ kind:'LK', type, width:12, lk });

      if (lk.veam){
        for (const slot of [1,2,3]){
          const vid = lk.veam[slot];
          if (vid) usedVeamIds.add(vid);
        }
      }
    }

    const standaloneVeams = [];
    for (const v of byVeam.values()){
      if (!v.dimcity || v.dimcity !== dc) continue;
      if (usedVeamIds.has(v.id)) continue;
      standaloneVeams.push(v);
    }
    standaloneVeams.sort((a,b)=>a.id.localeCompare(b.id));
    for (const veam of standaloneVeams){
      blocks.push({ kind:'VEAM', type:'VEAM4', width:4, veam });
    }

    return blocks;
  }

  function layoutBlocksIntoRows(blocks, M){
    let rowsHtml = '';
    let rowHtml = '';
    let usedWidth = 0;

    function flushRow(){
      if (!rowHtml) return;
      rowsHtml += `<div class="dc-row">${rowHtml}</div>`;
      rowHtml = '';
      usedWidth = 0;
    }

    for (const block of blocks){
      const html = renderBlock(block, M);
      if (block.width === 12){
        flushRow();
        rowsHtml += `<div class="dc-row">${html}</div>`;
      } else {
        if (usedWidth + block.width > 12){
          flushRow();
        }
        rowHtml += html;
        usedWidth += block.width;
      }
    }

    flushRow();
    return rowsHtml;
  }

  function renderBlock(block, M){
    const byVeam = M.byVeam || new Map();
    switch (block.type){
      case 'LK_XLR12':
        return renderLkBlockXlr12(block.lk);
      case 'LK_MIXED':
        return renderLkBlockMixed(block.lk, byVeam);
      case 'LK_VEAM3':
        return renderLkBlockVeamOnly(block.lk, byVeam);
      case 'VEAM4':
        return renderStandaloneVeamBlock(block.veam);
      default:
        return '';
    }
  }

  // =========================
  //  LK / VEAM BLOKKEN
  // =========================

  // 1) LK met 12×XLR
  function renderLkBlockXlr12(lk){
    let html = `<div class="lk-block">`;
    html += `<div class="block-title">${escapeHtml(lk.id || '')}</div>`;
    html += `<div class="block-sub">12× XLR</div>`;
    html += `<div class="port-table lk-ports">`;

    for (let p=1;p<=12;p++){
      const L = (lk.lines||[]).find(x=>x.port===p) || {};
      const uni = L.universe != null ? String(L.universe) : '—';
      const loc = L.dest || '—';
      const groupClass = p<=4 ? 'group1' : (p<=8 ? 'group2' : 'group3');
      html += `
      <div class="port-col">
        <div class="port-box ${groupClass}">
          <div class="port-label">Poort ${p}</div>
          <div class="port-universe">
            <span class="port-universe-label">Universe:</span>
            <span class="port-universe-value">${escapeHtml(uni)}</span>
          </div>
          <div class="port-loc">
            <span class="port-loc-label">Location:</span>
            <span class="port-loc-value">${escapeHtml(loc)}</span>
          </div>
        </div>
      </div>`;
    }

    html += `</div></div>`;
    return html;
  }

  // 2) LK met 4×XLR + 3×Veam 4
  function renderLkBlockMixed(lk, byVeam){
    const veamId1 = lk.veam?.[1] || null;
    const veamId2 = lk.veam?.[2] || null;
    const veamId3 = lk.veam?.[3] || null;

    const veam1 = veamId1 ? byVeam.get(veamId1) : null;
    const veam2 = veamId2 ? byVeam.get(veamId2) : null;
    const veam3 = veamId3 ? byVeam.get(veamId3) : null;

    let html = `<div class="lk-block">`;
    html += `<div class="block-title">${escapeHtml(lk.id || '')}</div>`;
    html += `<div class="block-sub">4× XLR + 3× Veam 4</div>`;
    html += `<div class="mixed-groups">`;

    const veamLine = (veamRec, vPort) => {
      if (!veamRec) return { universe:null, dest:'' };
      const line = (veamRec.lines||[]).find(x=>x.port===vPort) || {};
      return { universe: line.universe ?? null, dest: line.dest || '' };
    };

    const slotRange = {1:[1,4],2:[5,8],3:[9,12]};

    for (const slot of [1,2,3]){
      const [s,e] = slotRange[slot];

      let headerText;
      let vRec;
      let groupClass;
      if (slot===1){
        headerText = `XLR 1–4 + Veam 1${veamId1 ? ' ('+escapeHtml(veamId1)+')' : ''}`;
        vRec = veam1;
        groupClass = 'group1';
      } else if (slot===2){
        headerText = `Veam 2 (ports 5–8)${veamId2 ? ' ('+escapeHtml(veamId2)+')' : ''}`;
        vRec = veam2;
        groupClass = 'group2';
      } else {
        headerText = `Veam 3 (ports 9–12)${veamId3 ? ' ('+escapeHtml(veamId3)+')' : ''}`;
        vRec = veam3;
        groupClass = 'group3';
      }

      html += `<div class="mixed-group ${groupClass}">
        <div class="mixed-group-header">${headerText}</div>
        <div class="group-ports">`;

      for (let p=s;p<=e;p++){
        const L = (lk.lines||[]).find(x=>x.port===p) || {};
        const uniLk = L.universe != null ? String(L.universe) : '—';
        const locLk = L.dest || '—';

        const vPort = 1 + (p - s);
        const vInfo = veamLine(vRec, vPort);
        const uniV = vInfo.universe != null ? String(vInfo.universe) : '—';
        const locV = vInfo.dest || '—';

        html += `<div class="port-col"><div class="port-box ${groupClass}">`;
        html += `<div class="port-label">Poort ${p}</div>`;

        if (slot===1){
          html += `
          <div class="port-universe">
            <span class="port-universe-label">XLR Universe:</span>
            <span class="port-universe-value">${escapeHtml(uniLk)}</span>
          </div>
          <div class="port-loc">
            <span class="port-loc-label">XLR Location:</span>
            <span class="port-loc-value">${escapeHtml(locLk)}</span>
          </div>
          <div class="port-universe veam-line">
            <span class="port-universe-label">Veam1 Universe:</span>
            <span class="port-universe-value">${escapeHtml(uniV)}</span>
          </div>
          <div class="port-loc veam-line">
            <span class="port-loc-label">Veam1 Location:</span>
            <span class="port-loc-value">${escapeHtml(locV)}</span>
          </div>`;
        } else if (slot===2){
          html += `
          <div class="port-universe">
            <span class="port-universe-label">Veam2 Universe:</span>
            <span class="port-universe-value">${escapeHtml(uniV)}</span>
          </div>
          <div class="port-loc">
            <span class="port-loc-label">Veam2 Location:</span>
            <span class="port-loc-value">${escapeHtml(locV)}</span>
          </div>`;
        } else {
          html += `
          <div class="port-universe">
            <span class="port-universe-label">Veam3 Universe:</span>
            <span class="port-universe-value">${escapeHtml(uniV)}</span>
          </div>
          <div class="port-loc">
            <span class="port-loc-label">Veam3 Location:</span>
            <span class="port-loc-value">${escapeHtml(locV)}</span>
          </div>`;
        }

        html += `</div></div>`;
      }

      html += `</div></div>`;
    }

    html += `</div></div>`;
    return html;
  }

  // 3) LK met 3× Veam 4 (VEAM_ONLY)
  function renderLkBlockVeamOnly(lk, byVeam){
    const veamId1 = lk.veam?.[1] || null;
    const veamId2 = lk.veam?.[2] || null;
    const veamId3 = lk.veam?.[3] || null;

    const veam1 = veamId1 ? byVeam.get(veamId1) : null;
    const veam2 = veamId2 ? byVeam.get(veamId2) : null;
    const veam3 = veamId3 ? byVeam.get(veamId3) : null;

    let html = `<div class="lk-block">`;
    html += `<div class="block-title">${escapeHtml(lk.id || '')}</div>`;
    html += `<div class="block-sub">3× Veam 4</div>`;
    html += `<div class="veam-groups">`;

    const slotRange = {1:[1,4],2:[5,8],3:[9,12]};
    const veamDefs = {
      1: { rec: veam1, id: veamId1, label: 'Veam 1 (ports 1–4)', group:'group1' },
      2: { rec: veam2, id: veamId2, label: 'Veam 2 (ports 5–8)', group:'group2' },
      3: { rec: veam3, id: veamId3, label: 'Veam 3 (ports 9–12)', group:'group3' }
    };

    const veamLine = (veamRec, vPort) => {
      if (!veamRec) return { universe:null, dest:'' };
      const line = (veamRec.lines||[]).find(x=>x.port===vPort) || {};
      return { universe: line.universe ?? null, dest: line.dest || '' };
    };

    for (const slot of [1,2,3]){
      const [s,e] = slotRange[slot];
      const def = veamDefs[slot];
      const rec = def.rec;
      const id  = def.id;
      const groupClass = def.group;

      const header = def.label + (id ? ` (${escapeHtml(id)})` : '');

      html += `<div class="veam-group ${groupClass}">
        <div class="veam-group-header">${header}</div>
        <div class="group-ports">`;

      for (let p=s;p<=e;p++){
        const vPort = ((p - s) + 1);
        const info = veamLine(rec, vPort);
        const uni = info.universe != null ? String(info.universe) : '—';
        const loc = info.dest || '—';

        html += `
        <div class="port-col">
          <div class="port-box ${groupClass}">
            <div class="port-label">Poort ${p}</div>
            <div class="port-universe">
              <span class="port-universe-label">Veam${slot} Universe:</span>
              <span class="port-universe-value">${escapeHtml(uni)}</span>
            </div>
            <div class="port-loc">
              <span class="port-loc-label">Veam${slot} Location:</span>
              <span class="port-loc-value">${escapeHtml(loc)}</span>
            </div>
          </div>
        </div>`;
      }

      html += `</div></div>`;
    }

    html += `</div></div>`;
    return html;
  }

  // 4) Losse Veam 4 (geen gekoppelde LK)
  function renderStandaloneVeamBlock(veam){
    let html = `<div class="veam-block">`;
    html += `<div class="block-title">${escapeHtml(veam.id || '')}</div>`;
    html += `<div class="block-sub">Veam 4-poorts</div>`;
    html += `<div class="port-table veam-ports">`;

    for (let p=1;p<=4;p++){
      const L = (veam.lines||[]).find(x=>x.port===p) || {};
      const uni = L.universe != null ? String(L.universe) : '—';
      const loc = L.dest || '—';
      html += `
      <div class="port-col">
        <div class="port-box group1">
          <div class="port-label">Poort ${p}</div>
          <div class="port-universe">
            <span class="port-universe-label">Universe:</span>
            <span class="port-universe-value">${escapeHtml(uni)}</span>
          </div>
          <div class="port-loc">
            <span class="port-loc-label">Location:</span>
            <span class="port-loc-value">${escapeHtml(loc)}</span>
          </div>
        </div>
      </div>`;
    }

    html += `</div></div>`;
    return html;
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[m]));
  }

  // =========================
  //  EXPORT HOOK
  // =========================
  window.PdfExport = { open, buildPdfHtml };

  function tryAttachExportHook(){
    const btn = document.getElementById('fileExportPdf');
    if (!btn) return false;
    if (btn.dataset.pdfHooked) return true;
    btn.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
    btn.dataset.pdfHooked = '1';
    return true;
  }

  if(!tryAttachExportHook()){
    document.addEventListener('DOMContentLoaded', ()=> tryAttachExportHook());
  }

})();
