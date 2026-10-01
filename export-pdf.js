// export-pdf.js — Report Builder
// Visuele PDF-builder met live preview. De layout (secties, volgorde, stijl, cover, kop/voet)
// wordt in het project bewaard (MODEL.pdfSettings.layout) en kan als template worden opgeslagen.
(function(){
  'use strict';

  const App = () => window.LKApp;
  const getM = () => App()?.getMODEL?.() || null;
  const I = (n, s=16) => window.Icons?.icon(n, s) || '';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeFile = s => String(s || 'DimCity').trim().replace(/[^a-z0-9_\-]+/gi, '_').replace(/^_+|_+$/g, '') || 'export';
  const clone = x => JSON.parse(JSON.stringify(x));
  const listFromMap = m => m && typeof m.values === 'function' ? [...m.values()] : [];
  const keysFromMap = m => m && typeof m.keys === 'function' ? [...m.keys()] : [];
  const byId = (a,b) => String(a.id).localeCompare(String(b.id), undefined, {numeric:true});
  const hex = (c, f='#2563eb') => /^#[0-9a-fA-F]{6}$/.test(String(c||'')) ? c : f;
  const PAGE_MM = { A4:[210,297], A3:[297,420], Letter:[215.9,279.4] };
  const MM = 3.7795275591;

  // ===================== Layout model =====================
  const SECTIONS = {
    summary:   { title:'DimCity header & key figures', icon:'layout',   desc:'DimCity name, project line and totals.' },
    network:   { title:'Network / DMX nodes',          icon:'network',  desc:'Planned nodes with IP and universe per port.' },
    splitters: { title:'Splitters',                    icon:'cable',    desc:'Splitters with input feed and output map.' },
    patch:     { title:'LK / Veam patch',              icon:'box',      desc:'Every LK block as a port grid, grouped per Veam.' },
    universes: { title:'Universe overview',            icon:'universe', desc:'Patch points per universe (LK / Veam / DMX).' },
    patchlist: { title:'Patch list table',             icon:'table',    desc:'All rows of this DimCity sorted by universe.' },
    warnings:  { title:'Warnings & errors',            icon:'alert',    desc:'Validation results for this DimCity.' },
    notes:     { title:'Notes',                        icon:'note',     desc:'Free text, e.g. crew instructions.' }
  };
  const SECTION_OPTS = {
    network:   [['universeTable','Include universe overview table', true], ['switches','Show switches placeholder', false]],
    patch:     [['standaloneVeams','Include Veams that are not linked to an LK', true], ['location','Show location per port', true], ['source','Show source (LK / Veam) per port', false], ['groupColors','Tint Veam groups A / B / C', true]],
    patchlist: [['dmx','Include loose DMX', true]],
    warnings:  [['projectWide','Include project-wide issues', true]]
  };

  function defaultLayout(){
    return {
      version: 2,
      scope: 'ALL', dims: [], output: 'SINGLE',
      page: { size:'A4', orientation:'landscape', margin:10 },
      style: { accent:'#ff8a1f', font:'helvetica', fontSize:9.5, density:'comfortable', colorUniverses:true, dimBand:true, grayscale:false },
      header: { show:true, text:'{project} · {dimcity}' },
      footer: { show:true, left:'{project} · {area}', center:'Prepared by {prepared} · {date}', pageNumbers:true },
      brand: { logo:null, logoPos:'none', logoHeight:9, wm:{ type:'none', text:'CONFIDENTIAL', opacity:8, size:55, angle:-30 } },
      cover: { show:true, title:'', subtitle:'{area} · {location}', showLogo:true, logoX:1, logoY:0, logoW:60, fields:{ area:true, location:true, date:true, prepared:true, dimcities:true, totals:true }, note:'', summaryPage:true },
      sections: [
        { key:'summary', on:true }, { key:'network', on:true, opts:{ universeTable:true, switches:false } },
        { key:'splitters', on:true }, { key:'patch', on:true, opts:{ standaloneVeams:true, location:true, source:false, groupColors:true } },
        { key:'universes', on:false }, { key:'patchlist', on:false, opts:{ dmx:true } },
        { key:'warnings', on:true, opts:{ projectWide:true } }, { key:'notes', on:false, opts:{ text:'' } }
      ]
    };
  }
  const PRESETS = {
    DB_DETAILED: { name:'DB detailed paperwork', apply:L=>{ setOn(L, ['summary','network','splitters','patch','warnings']); L.style.density='comfortable'; L.cover.show=true; } },
    NETWORK_FIRST: { name:'Network crew', apply:L=>{ setOn(L, ['summary','network','splitters','universes']); L.cover.show=true; } },
    PATCH_CREW: { name:'Patch crew', apply:L=>{ setOn(L, ['summary','patch','patchlist']); L.style.density='comfortable'; } },
    COMPACT: { name:'Compact patch sheets', apply:L=>{ setOn(L, ['patch']); L.style.density='compact'; L.cover.show=false; L.cover.summaryPage=false; } }
  };
  function setOn(L, keys){
    L.sections.forEach(s => s.on = keys.includes(s.key));
    const order = keys.concat(L.sections.map(s=>s.key).filter(k=>!keys.includes(k)));
    L.sections.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
  }
  // Oude pdfSettings (V9) omzetten naar een layout
  function layoutFromSettings(ps){
    if(ps?.layout?.version === 2) return mergeLayout(ps.layout);
    const L = defaultLayout();
    if(!ps) return L;
    L.page.orientation = ps.page === 'portrait' ? 'portrait' : 'landscape';
    L.output = ps.output === 'PER_DIM' ? 'PER_DIM' : 'SINGLE';
    const map = { incNetwork:'network', incSplitters:'splitters', incPatch:'patch', incWarnings:'warnings', incProject:'summary' };
    for(const [k, sec] of Object.entries(map)) if(k in ps){ const s = L.sections.find(x=>x.key===sec); if(s) s.on = ps[k] !== false; }
    const net = L.sections.find(s=>s.key==='network'); if(net && 'incSwitches' in ps) net.opts.switches = !!ps.incSwitches;
    return L;
  }
  function mergeLayout(saved){
    const L = defaultLayout();
    const out = { ...L, ...saved,
      page:{ ...L.page, ...(saved.page||{}) }, style:{ ...L.style, ...(saved.style||{}) },
      header:{ ...L.header, ...(saved.header||{}) }, footer:{ ...L.footer, ...(saved.footer||{}) },
      brand:{ ...L.brand, ...(saved.brand||{}), wm:{ ...L.brand.wm, ...(saved.brand?.wm||{}) } },
      cover:{ ...L.cover, ...(saved.cover||{}), fields:{ ...L.cover.fields, ...(saved.cover?.fields||{}) } } };
    // oude S/M/L-logogrootte omzetten naar millimeters
    if(saved.cover && saved.cover.logoW == null && saved.cover.logoSize) out.cover.logoW = { S:35, M:60, L:90 }[saved.cover.logoSize] || 60;
    const known = Array.isArray(saved.sections) ? saved.sections.filter(s => SECTIONS[s.key]) : [];
    out.sections = known.map(s => ({ ...L.sections.find(d=>d.key===s.key), ...s, opts:{ ...(L.sections.find(d=>d.key===s.key)?.opts||{}), ...(s.opts||{}) } }));
    for(const d of L.sections) if(!out.sections.some(s=>s.key===d.key)) out.sections.push(clone(d));
    return out;
  }

  // ===================== Data helpers =====================
  function uniColor(u, L){ return L.style.colorUniverses ? `hsl(${(Number(u||0)*47)%360} 70% 40%)` : '#64748b'; }
  function dcColor(M, dc){ return hex(App()?.dimColor?.(dc) || M?.dimColors?.[dc], '#2563eb'); }
  // Vervangt {placeholders}; segmenten (gescheiden door " · ") waarvan alle placeholders leeg zijn vallen weg.
  function tokens(str, meta, dc=''){
    const d = meta.date ? new Date(meta.date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';
    const vals = { project:meta.project||'', area:meta.area||'', location:meta.location||'', date:d, prepared:meta.prepared||'', dimcity:dc||'' };
    return String(str || '').split(/\s+[·•|]\s+/).map(seg=>{
      let had = false, filled = false;
      const out = seg.replace(/\{(\w+)\}/g, (_, k)=>{ had = true; const v = vals[k] ?? ''; if(v) filled = true; return v; });
      return had && !filled ? '' : out.trim();
    }).filter(Boolean).join(' · ');
  }
  // Eenvoudige vervanging voor vrije tekst (notities): niets weglaten.
  function fillTokens(str, meta, dc=''){
    return String(str || '').replace(/\{(\w+)\}/g, (m, k)=> k in { project:1, area:1, location:1, date:1, prepared:1, dimcity:1 } ? tokens(`{${k}}`, meta, dc) : m);
  }
  function effBlock(lk){ return App()?.effectiveBlockType?.(lk) || 'MIXED'; }
  function blockLabel(t){ return App()?.blockTypeLabel?.(t) || t; }
  function portRec(lines, port){ return (lines || []).find(x => Number(x.port) === Number(port)) || null; }
  function merged(lk, p){
    const m = App()?.mergedPortRecord?.(lk, p);
    if(m) return { universe:m.universe, dest:m.dest, source:m.source, conflict:m.conflict, veamId:m.ve?.veamId, veamPort:m.ve?.veamPort };
    const L = portRec(lk.lines, p) || {};
    return { universe:L.universe, dest:L.dest, source:'LK', conflict:false };
  }
  function universeOverview(M, dc){
    const map = new Map();
    const bump = (u, kind) => { if(u == null || u === '') return; const k = String(u); if(!map.has(k)) map.set(k, { lk:0, veam:0, dmx:0 }); map.get(k)[kind]++; };
    for(const L of (M.lines||[])) if(L.dimcity===dc) bump(L.universe,'lk');
    for(const V of (M.veamLines||[])) if(V.dimcity===dc) bump(V.universe,'veam');
    for(const D of (M.dmxLoose||[])) if(D.dimcity===dc) bump(D.universe,'dmx');
    return [...map.entries()].sort((a,b)=>Number(a[0])-Number(b[0]));
  }
  function allPoints(M, dc, withDmx=true){
    const out = [];
    for(const L of (M.lines||[])) if(L.dimcity===dc) out.push({ kind:'LK', id:L.id, port:L.port, universe:L.universe, dest:L.dest||'', status:L.status });
    for(const V of (M.veamLines||[])) if(V.dimcity===dc) out.push({ kind:'Veam', id:V.id, port:V.port, universe:V.universe, dest:V.dest||'', status:V.status });
    if(withDmx) for(const D of (M.dmxLoose||[])) if(D.dimcity===dc) out.push({ kind:'DMX', id:'—', port:'—', universe:D.universe, dest:D.dest||'', status:D.status });
    return out.sort((a,b)=>(a.universe??1e9)-(b.universe??1e9) || String(a.id).localeCompare(String(b.id), undefined, {numeric:true}) || Number(a.port||0)-Number(b.port||0));
  }
  const plan = (M, dc) => M?.networkDevices?.dimCityPlans?.[dc] || { nodes:[], splitters:[], switches:[] };
  const splitterType = (M, id) => (M?.networkDevices?.splitterTypes || []).find(t => String(t.id) === String(id)) || {};

  // ===================== Brand: logo op elke pagina + watermerk =====================
  const pageDims = L => { const [w, h] = PAGE_MM[L.page.size] || PAGE_MM.A4; return L.page.orientation !== 'portrait' ? [h, w] : [w, h]; };
  const brandLogoOn = L => !!(L.brand?.logo && L.brand.logoPos && L.brand.logoPos !== 'none');
  const logoTop = m => Math.max(3, m / 2 - 1);
  function pageMargins(L){
    const m = Math.max(5, Number(L.page.margin) || 10);
    const h = Number(L.brand?.logoHeight) || 9;
    const pos = brandLogoOn(L) ? L.brand.logoPos : '';
    let mt = m, mb = L.footer.show ? Math.max(m, 13) : m;
    if(pos.startsWith('header')) mt = Math.max(m, logoTop(m) + h + 7);
    if(pos.startsWith('footer')) mb = Math.max(mb, h + 6);
    return { m, mt, mb };
  }
  // SVG (mm-eenheden) met watermerk en, voor de preview, het logo op de plek van kop/voet
  function brandSvg(L, meta, { w, h, withLogo }){
    const b = L.brand || {}, wm = b.wm || {};
    let inner = '';
    const op = Math.max(1, Math.min(60, Number(wm.opacity) || 8)) / 100;
    const cx = w / 2, cy = h / 2, rot = `rotate(${Number(wm.angle) || 0} ${cx} ${cy})`;
    const wmLogo = b.logo || meta.logo;
    if(wm.type === 'logo' && wmLogo){
      const s = w * Math.max(10, Math.min(100, Number(wm.size) || 55)) / 100;
      inner += `<image href="${wmLogo}" x="${cx - s/2}" y="${cy - s/2}" width="${s}" height="${s}" opacity="${op}" transform="${rot}" preserveAspectRatio="xMidYMid meet"/>`;
    } else if(wm.type === 'text' && String(wm.text || '').trim()){
      const t = String(wm.text).trim();
      const fs = Math.min(w * (Number(wm.size) || 55) / 100 / Math.max(3, t.length * .62), h * .4);
      inner += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="${fs}" fill="#0f172a" fill-opacity="${op}" letter-spacing="${fs * .06}" transform="${rot}">${esc(t)}</text>`;
    }
    if(withLogo && brandLogoOn(L)){
      const { m, mb } = pageMargins(L);
      const lh = Number(b.logoHeight) || 9, lw = 70;
      const right = b.logoPos.endsWith('right');
      const y = b.logoPos.startsWith('header') ? logoTop(m) : h - mb / 2 - lh / 2;
      inner += `<image href="${b.logo}" x="${right ? w - m - lw : m}" y="${y}" width="${lw}" height="${lh}" preserveAspectRatio="${right ? 'xMaxYMid' : 'xMinYMid'} meet"/>`;
    }
    if(!inner) return '';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${inner}</svg>`)}`;
  }
  // In de print staat het watermerk vast (herhaalt op elke pagina) binnen het inhoudsvlak
  function printWatermark(L, meta){
    const [pw, ph] = pageDims(L);
    const { m, mt, mb } = pageMargins(L);
    const src = brandSvg(L, meta, { w:pw - 2*m, h:ph - mt - mb, withLogo:false });
    return src ? `<div class="wm-print"><img src="${src}" alt=""></div>` : '';
  }

  // ===================== HTML generation =====================
  function printCss(L, { preview=false, meta={} } = {}){
    const [w, h] = PAGE_MM[L.page.size] || PAGE_MM.A4;
    const land = L.page.orientation !== 'portrait';
    const pw = land ? h : w, ph = land ? w : h;
    const m = Math.max(5, Number(L.page.margin) || 10);
    const { mt, mb } = pageMargins(L);
    // binnenmarges van de pagina (alleen in de preview; in print doet @page dat)
    const padT = preview ? mt : 0, padS = preview ? m : 0, padB = preview ? mb : 0;
    const previewTile = preview ? brandSvg(L, meta, { w:pw, h:ph, withLogo:true }) : '';
    const compact = L.style.density === 'compact';
    const fs = Number(L.style.fontSize) || 9.5;
    const font = L.style.font === 'system' ? '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' : L.style.font === 'georgia' ? 'Georgia,"Times New Roman",serif' : 'Helvetica,Arial,sans-serif';
    const acc = hex(L.style.accent, '#ff8a1f');
    const gap = compact ? 1.6 : 2.6;
    const screen = preview ? `
      html{background:#2a2e35}
      body{padding:18px 0 40px;zoom:var(--zoom,1)}
      .page{width:${pw}mm;min-height:${ph}mm;margin:0 auto 18px;background:#fff;padding:${mt}mm ${m}mm ${mb}mm;box-shadow:0 4px 18px rgba(0,0,0,.35);position:relative;
        background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${ph}mm - 1px),rgba(255,138,31,.55) calc(${ph}mm - 1px),rgba(255,138,31,.55) ${ph}mm)}
      .page::after{content:attr(data-label);position:absolute;top:-15px;left:0;font:600 10px/1 system-ui;color:#9aa3b2;letter-spacing:.04em}
      [data-sec]{cursor:pointer;outline-offset:2mm;border-radius:2mm}
      [data-sec]:hover{outline:1.5px dashed rgba(255,138,31,.55)}
      [data-sec].sel{outline:2px solid #ff8a1f}
      .pv-footer{position:absolute;left:${m}mm;right:${m}mm;bottom:${Math.max(4, mb/2 - 2)}mm;display:flex;justify-content:space-between;font-size:7px;color:#64748b}
      ${previewTile ? `.page::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:5;background:url("${previewTile}") top center/100% ${ph}mm repeat-y}` : ''}
      .cover .logo{cursor:move}
      .cover .logo:hover{outline:1.5px dashed rgba(255,138,31,.8);outline-offset:1.5mm}` : `
      @page{size:${L.page.size} ${land?'landscape':'portrait'};margin:${mt}mm ${m}mm ${mb}mm}
      .wm-print{position:fixed;inset:0;pointer-events:none;z-index:50}
      .wm-print img{width:100%;height:100%;display:block}
      .page{page-break-after:always;break-after:page}
      .page:last-child{page-break-after:auto;break-after:auto}
      .pv-footer{display:none}`;
    return `
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{margin:0;font:${fs}px/1.32 ${font};color:#0f172a;${L.style.grayscale?'filter:grayscale(1);':''}}
      ${screen}
      h1,h2,h3,h4{margin:0}
      .cover{display:flex;flex-direction:column;min-height:${ph - mt - mb - 2}mm;position:relative}
      .cover-bar{height:3mm;background:${acc};border-radius:1mm;margin-bottom:12mm;width:40mm}
      .cover-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm}
      .cover h1{font-size:${fs*3.8}px;line-height:1.05;letter-spacing:-.02em;font-weight:800;max-width:65%}
      .cover .subtitle{font-size:${fs*1.6}px;color:#475569;margin-top:4mm}
      .cover .logo{position:absolute;z-index:2;left:calc(${padS}mm + (100% - ${2*padS}mm) * var(--x));top:calc(${padT}mm + (100% - ${padT+padB}mm) * var(--y));transform:translate(calc(var(--x) * -100%), calc(var(--y) * -100%))}
      .cover .logo img{object-fit:contain;display:block;width:var(--w);max-height:calc(var(--w) * .8);height:auto}
      .cover-meta{margin-top:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;border-top:.4mm solid #e2e8f0;padding-top:6mm}
      .cover-meta dt{font-size:${fs*.82}px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700}
      .cover-meta dd{margin:1mm 0 0;font-size:${fs*1.25}px;font-weight:600}
      .cover-totals{display:flex;gap:8mm;margin-top:10mm}
      .cover-totals div b{display:block;font-size:${fs*2.4}px;font-weight:800;color:${acc}}
      .cover-totals div span{font-size:${fs*.9}px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
      .cover-note{margin-top:8mm;padding:4mm 5mm;border-left:1mm solid ${acc};background:#f8fafc;white-space:pre-line;font-size:${fs*1.05}px}
      .cover-gen{margin-top:6mm;font-size:${fs*.8}px;color:#94a3b8}
      .doc-h2{font-size:${fs*1.9}px;font-weight:800;margin-bottom:4mm}
      .run-head{display:flex;justify-content:space-between;font-size:${fs*.8}px;color:#94a3b8;border-bottom:.3mm solid #e2e8f0;padding-bottom:1.5mm;margin-bottom:${compact?3:4}mm}
      .db-head{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;margin-bottom:${compact?3:5}mm;padding-bottom:${compact?2:3}mm;border-bottom:.5mm solid #0f172a}
      .db-head.band{border-bottom:1.2mm solid var(--db)}
      .db-title{font-size:${fs*2.8}px;font-weight:800;letter-spacing:-.01em;line-height:1;display:flex;align-items:center;gap:3mm}
      .db-title i{display:inline-block;width:4mm;height:4mm;border-radius:1mm;background:var(--db)}
      .db-sub{font-size:${fs*.95}px;color:#64748b;margin-top:1.5mm}
      .stats{display:flex;gap:${compact?3:5}mm}
      .stat{text-align:right}.stat b{display:block;font-size:${fs*1.7}px;font-weight:800;line-height:1.1}
      .stat span{font-size:${fs*.78}px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
      .stat.err b{color:#dc2626}.stat.warn b{color:#d97706}
      .section{margin:0 0 ${compact?3:5}mm}
      .section > h3{font-size:${fs*1.15}px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:0 0 ${gap}mm;padding-bottom:1.2mm;border-bottom:.3mm solid #cbd5e1;display:flex;justify-content:space-between;align-items:baseline}
      .section > h3 small{font-weight:600;text-transform:none;letter-spacing:0;color:#94a3b8;font-size:${fs*.85}px}
      .section > h3 .n{color:${acc};margin-right:2mm}
      .grid{display:grid;gap:${gap}mm}.cols2{grid-template-columns:1fr 1fr}.cols3{grid-template-columns:repeat(3,1fr)}
      .card{border:.3mm solid #cbd5e1;border-radius:1.6mm;break-inside:avoid;overflow:hidden;margin-bottom:${gap}mm;background:#fff}
      .card-h{background:#f1f5f9;padding:${compact?1.2:1.8}mm 2.5mm;font-weight:800;display:flex;justify-content:space-between;align-items:center;gap:3mm}
      .card-h small{font-weight:600;color:#64748b}
      .card-b{padding:${compact?1.4:2.2}mm}
      table{width:100%;border-collapse:collapse}
      th,td{border-bottom:.25mm solid #e2e8f0;padding:${compact?.7:1.1}mm 1.6mm;text-align:left;vertical-align:top}
      th{font-size:${fs*.8}px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700;border-bottom:.35mm solid #94a3b8}
      td.num,th.num{text-align:right}
      tr{break-inside:avoid}
      .ports{display:grid;gap:${compact?.8:1.1}mm}
      .p4{grid-template-columns:repeat(4,1fr)}.p8{grid-template-columns:repeat(8,1fr)}.p12{grid-template-columns:repeat(12,1fr)}
      .port{border:.35mm solid #cbd5e1;border-top:1mm solid var(--uni,#cbd5e1);border-radius:1mm;padding:${compact?.7:1}mm ${compact?.9:1.2}mm;min-height:${compact?9:12}mm;overflow:hidden;background:#fff}
      .port .nr{font-size:${fs*.75}px;color:#94a3b8;font-weight:700}
      .port .uni{font-size:${fs*1.08}px;font-weight:800;color:#0f172a}
      .port .dest,.port .src{font-size:${fs*.74}px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .port .src{color:#94a3b8}
      .port.empty{border-top-color:#e2e8f0;background:#f8fafc}.port.empty .uni{color:#cbd5e1;font-weight:600}
      .port.conflict{background:#fee2e2;border-color:#dc2626}
      .lk-groups{display:grid;grid-template-columns:repeat(3,1fr);gap:${gap}mm}
      .lk-group{border:.3mm solid #e2e8f0;border-radius:1.2mm;padding:${compact?1:1.6}mm}
      .tint .g1{background:#eff6ff}.tint .g2{background:#fff7ed}.tint .g3{background:#f0fdf4}
      .lk-group h4{font-size:${fs*.88}px;margin:0 0 1.2mm;display:flex;justify-content:space-between}
      .lk-group h4 small{color:#16a34a;font-weight:700}
      .lk-group h4 small.none{color:#94a3b8;font-weight:600}
      .node .port{border-radius:6mm;text-align:center;border-top-width:.35mm;border-color:var(--uni,#cbd5e1);border-width:.6mm}
      .placeholder{border:.3mm dashed #cbd5e1;border-radius:1.6mm;padding:3mm;color:#94a3b8;text-align:center}
      .tag{display:inline-block;padding:.3mm 1.6mm;border-radius:1mm;font-size:${fs*.78}px;font-weight:700;background:#f1f5f9;color:#475569}
      .tag.red{background:#fee2e2;color:#b91c1c}.tag.yellow{background:#fef3c7;color:#b45309}.tag.green{background:#dcfce7;color:#15803d}
      .dot{display:inline-block;width:2mm;height:2mm;border-radius:50%;margin-right:1.2mm;vertical-align:middle}
      .notes{white-space:pre-line;border-left:1mm solid ${acc};padding:2mm 4mm;background:#f8fafc}
      .small{font-size:${fs*.8}px;color:#64748b}`;
  }


  function buildCover(M, meta, dcs, L){
    const c = L.cover;
    const title = esc(tokens(c.title, meta) || meta.project || 'Untitled project');
    const sub = esc(tokens(c.subtitle, meta));
    const clamp01 = v => Math.max(0, Math.min(1, Number(v)));
    const logo = c.showLogo && meta.logo ? `<div class="logo" id="coverLogo" style="--x:${clamp01(c.logoX ?? 1)};--y:${clamp01(c.logoY ?? 0)};--w:${Math.max(10, Number(c.logoW) || 60)}mm"><img src="${meta.logo}" alt="" draggable="false"></div>` : '';
    const f = c.fields || {};
    const date = meta.date ? new Date(meta.date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : '';
    const items = [
      f.area && ['Area', meta.area], f.location && ['Location', meta.location], f.date && ['Date', date], f.prepared && ['Prepared by', meta.prepared],
      f.dimcities && ['DimCities', dcs.join(', ')]
    ].filter(x => x && x[1]);
    let totals = '';
    if(f.totals){
      const lk = listFromMap(M.byLK).filter(x=>dcs.includes(x.dimcity)).length;
      const ve = listFromMap(M.byVeam).filter(x=>dcs.includes(x.dimcity)).length;
      const unis = new Set(); let pts = 0;
      for(const dc of dcs){ for(const [u, x] of universeOverview(M, dc)){ unis.add(u); pts += x.lk + x.veam + x.dmx; } }
      totals = `<div class="cover-totals"><div><b>${dcs.length}</b><span>DimCities</span></div><div><b>${lk}</b><span>LK blocks</span></div><div><b>${ve}</b><span>Veams</span></div><div><b>${unis.size}</b><span>Universes</span></div><div><b>${pts}</b><span>Patch points</span></div></div>`;
    }
    return `<section class="page cover" data-label="COVER" data-sec="cover"><div class="cover-bar"></div>
      <div class="cover-top"><div><h1>${title}</h1>${sub?`<div class="subtitle">${sub}</div>`:''}${totals}</div></div>${logo}
      ${c.note ? `<div class="cover-note">${esc(c.note)}</div>` : ''}
      ${items.length ? `<dl class="cover-meta">${items.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '<div style="margin-top:auto"></div>'}
      <div class="cover-gen">Generated with DimCity PatchLab · ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>
      ${footerPreview(L, meta, '')}</section>`;
  }
  function buildProjectSummary(M, meta, dcs, L){
    const rows = dcs.map(dc=>{
      const d = M.byDim?.get?.(dc) || { lks:new Set(), veams:new Set() };
      const u = universeOverview(M, dc);
      const pts = u.reduce((n,[,x])=>n+x.lk+x.veam+x.dmx,0);
      const iss = (M.issues||[]).filter(i=>i.dimcity===dc);
      const e = iss.filter(i=>i.severity==='RED').length, w = iss.length - e;
      return `<tr><td><span class="dot" style="background:${dcColor(M,dc)}"></span><b>${esc(dc)}</b></td><td class="num">${d.lks?.size||0}</td><td class="num">${d.veams?.size||0}</td><td class="num">${u.length}</td><td class="num">${pts}</td><td class="num">${plan(M,dc).nodes?.length||0}</td><td class="num">${plan(M,dc).splitters?.length||0}</td><td>${e?`<span class="tag red">${e} error${e>1?'s':''}</span> `:''}${w?`<span class="tag yellow">${w} warning${w>1?'s':''}</span>`:''}${!e&&!w?'<span class="tag green">OK</span>':''}</td></tr>`;
    }).join('');
    return `<section class="page" data-label="PROJECT SUMMARY" data-sec="cover">${runHead(L, meta, '')}<div class="doc-h2">Project summary</div>
      <table><thead><tr><th>DimCity</th><th class="num">LK</th><th class="num">Veam</th><th class="num">Universes</th><th class="num">Patch points</th><th class="num">Nodes</th><th class="num">Splitters</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      ${footerPreview(L, meta, '')}</section>`;
  }
  function runHead(L, meta, dc){
    if(!L.header.show) return '';
    const t = tokens(L.header.text, meta, dc);
    return t ? `<div class="run-head"><span>${esc(t)}</span><span>${esc(meta.location||'')}</span></div>` : '';
  }
  function footerPreview(L, meta, dc){
    if(!L.footer.show) return '';
    return `<div class="pv-footer"><span>${esc(tokens(L.footer.left, meta, dc))}</span><span>${esc(tokens(L.footer.center, meta, dc))}</span><span>${L.footer.pageNumbers?'Page n of N':''}</span></div>`;
  }

  function buildDimCity(M, meta, dc, L){
    let n = 0;
    const parts = L.sections.filter(s => s.on).map(s => {
      const o = s.opts || {};
      if(s.key === 'notes' && !o.text) return '';
      if(s.key === 'summary') return wrap('summary', buildDbHeader(M, meta, dc, L));
      n++;
      switch(s.key){
        case 'network':   return wrap('network', buildNetwork(M, dc, L, n, o));
        case 'splitters': return wrap('splitters', buildSplitters(M, dc, L, n));
        case 'patch':     return wrap('patch', buildPatch(M, dc, L, n, o));
        case 'universes': return wrap('universes', buildUniverses(M, dc, L, n));
        case 'patchlist': return wrap('patchlist', buildPatchList(M, dc, L, n, o));
        case 'warnings':  return wrap('warnings', buildWarnings(M, dc, L, n, o));
        case 'notes':     return wrap('notes', `<div class="section">${h3(n, 'Notes')}<div class="notes">${esc(fillTokens(o.text, meta, dc))}</div></div>`);
      }
      return '';
    }).join('');
    return `<section class="page" style="--db:${dcColor(M,dc)}" data-label="${esc(dc)}">${runHead(L, meta, dc)}${parts || '<div class="placeholder">No sections enabled. Turn sections on in the Content tab.</div>'}${footerPreview(L, meta, dc)}</section>`;
  }
  const wrap = (key, html) => html ? `<div data-sec="${key}">${html}</div>` : '';
  const h3 = (n, title, small='') => `<h3><span><span class="n">${n}</span>${esc(title)}</span>${small?`<small>${small}</small>`:''}</h3>`;

  function buildDbHeader(M, meta, dc, L){
    const dim = M.byDim?.get?.(dc) || { lks:new Set(), veams:new Set() };
    const u = universeOverview(M, dc);
    const pts = u.reduce((n,[,x])=>n+x.lk+x.veam+x.dmx,0);
    const iss = (M.issues||[]).filter(i=>i.dimcity===dc);
    const e = iss.filter(i=>i.severity==='RED').length, w = iss.length - e;
    const sub = [meta.project, meta.area, meta.location].filter(Boolean).map(esc).join(' · ');
    return `<div class="db-head ${L.style.dimBand?'band':''}"><div><div class="db-title">${L.style.dimBand?'<i></i>':''}${esc(dc)}</div>${sub?`<div class="db-sub">${sub}</div>`:''}</div>
      <div class="stats"><div class="stat"><b>${dim.lks?.size||0}</b><span>LK</span></div><div class="stat"><b>${dim.veams?.size||0}</b><span>Veam</span></div><div class="stat"><b>${u.length}</b><span>Universes</span></div><div class="stat"><b>${pts}</b><span>Patch pts</span></div>${e?`<div class="stat err"><b>${e}</b><span>Errors</span></div>`:''}${w?`<div class="stat warn"><b>${w}</b><span>Warnings</span></div>`:''}</div></div>`;
  }
  function buildUniverseTable(M, dc, L){
    const rows = universeOverview(M, dc).map(([u,x])=>`<tr><td><span class="dot" style="background:${uniColor(u,L)}"></span><b>UNI ${esc(u)}</b></td><td class="num">${x.lk}</td><td class="num">${x.veam}</td><td class="num">${x.dmx}</td><td class="num"><b>${x.lk+x.veam+x.dmx}</b></td></tr>`).join('');
    return `<table><thead><tr><th>Universe</th><th class="num">LK</th><th class="num">Veam</th><th class="num">DMX</th><th class="num">Total</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="small">No universes</td></tr>'}</tbody></table>`;
  }
  function buildNetwork(M, dc, L, n, o){
    const p = plan(M, dc), nodes = p.nodes || [], switches = p.switches || [];
    const nodeHtml = nodes.length ? nodes.map(nd=>{
      const ports = (Array.isArray(nd.universes) ? nd.universes : []).map((u,i)=>`<div class="port ${u?'':'empty'}" style="--uni:${u?uniColor(u,L):'#cbd5e1'}"><div class="nr">${i+1}</div><div class="uni">${u?'U'+esc(u):'—'}</div></div>`).join('');
      return `<div class="card node"><div class="card-h"><span>${esc(nd.id || 'Node')}</span><small>${esc(nd.ip || '')}${nd.subnet?' / '+esc(nd.subnet):''}</small></div><div class="card-b"><div class="small" style="margin-bottom:1.2mm">${esc(nd.name || '')}</div><div class="ports p8">${ports || '<span class="small">No ports</span>'}</div></div></div>`;
    }).join('') : '<div class="placeholder">No nodes planned for this DimCity.</div>';
    const sw = o.switches ? (switches.length ? switches.map(s=>`<div class="card"><div class="card-h"><span>${esc(s.id||'Switch')}</span><small>${esc(s.ip||'')}</small></div></div>`).join('') : '<div class="placeholder">Network switches will appear here.</div>') : '';
    const right = (o.universeTable !== false ? `<div class="card"><div class="card-h"><span>Universe overview</span><small>physical patch points</small></div><div class="card-b">${buildUniverseTable(M, dc, L)}</div></div>` : '') + sw;
    return `<div class="section">${h3(n, 'Network / DMX nodes', `${nodes.length} node${nodes.length===1?'':'s'}`)}<div class="grid ${right?'cols2':''}"><div>${nodeHtml}</div>${right?`<div>${right}</div>`:''}</div></div>`;
  }
  function buildSplitters(M, dc, L, n){
    const sps = plan(M, dc).splitters || [];
    const body = sps.length ? `<div class="grid cols2">${sps.map(inst=>{
      const t = splitterType(M, inst.typeId);
      const count = Number(t.outputCount || inst.portAssignments?.length || 0) || 8;
      const a = Array.isArray(inst.portAssignments) ? inst.portAssignments : [];
      const ports = Array.from({ length:count }, (_,i)=>{ const x = a[i]; return x ? `<div class="port" style="--uni:${uniColor(x.universe,L)}"><div class="nr">${i+1}</div><div class="uni">U${esc(x.universe)}</div><div class="dest">${esc(x.kind)} ${esc(x.id)}${x.port!=='—'?' · P'+esc(x.port):''}</div><div class="src">${esc(x.dest||'')}</div></div>` : `<div class="port empty"><div class="nr">${i+1}</div><div class="uni">Spare</div></div>`; }).join('');
      const feed = (inst.inputUniverses || inst.universes || []).map(u=>'U'+u).join(' / ');
      return `<div class="card"><div class="card-h"><span>${esc(inst.id || 'Splitter')}</span><small>${esc([t.brand, t.name].filter(Boolean).join(' '))} · ${t.mode==='AB'?'A/B':'Single'}${feed?' · feed '+esc(feed):''}</small></div><div class="card-b"><div class="ports p8">${ports}</div></div></div>`;
    }).join('')}</div>` : '<div class="placeholder">No splitters planned for this DimCity.</div>';
    return `<div class="section">${h3(n, 'Splitters', `${sps.length} splitter${sps.length===1?'':'s'}`)}${body}</div>`;
  }
  function portHtml(m, nr, L, o){
    const u = m.universe;
    const has = u != null && u !== '';
    return `<div class="port ${has?'':'empty'} ${m.conflict?'conflict':''}" style="--uni:${has?uniColor(u,L):'#e2e8f0'}"><div class="nr">${nr}</div><div class="uni">${has?'U'+esc(u):'—'}</div>${o.location!==false?`<div class="dest">${esc(m.dest||'')}</div>`:''}${o.source && has?`<div class="src">${esc(m.source||'')}${m.veamId?' · '+esc(m.veamId)+'/'+esc(m.veamPort):''}</div>`:''}</div>`;
  }
  function buildPatch(M, dc, L, n, o){
    const lks = listFromMap(M.byLK).filter(x=>x.dimcity===dc).sort(byId);
    const linked = new Set(); for(const lk of lks) for(const s of [1,2,3]) if(lk.veam?.[s]) linked.add(lk.veam[s]);
    const loose = o.standaloneVeams === false ? [] : listFromMap(M.byVeam).filter(v=>v.dimcity===dc && !linked.has(v.id)).sort(byId);
    const loc = lk => App()?.lkAutoLocation?.(lk) || '';
    const lkHtml = lks.map(lk=>{
      const mode = effBlock(lk);
      if(mode === 'XLR12'){
        return `<div class="card"><div class="card-h"><span>${esc(lk.id)} <small>${esc(loc(lk))}</small></span><small>${esc(blockLabel(mode))}</small></div><div class="card-b"><div class="ports p12">${Array.from({length:12},(_,i)=>portHtml(merged(lk,i+1), i+1, L, o)).join('')}</div></div></div>`;
      }
      const groups = [1,2,3].map(slot=>{
        const start = (slot-1)*4 + 1;
        const title = slot===1 && mode==='MIXED' ? 'XLR 1–4 / Veam A' : `Veam ${'ABC'[slot-1]}`;
        const vid = lk.veam?.[slot] || '';
        return `<div class="lk-group g${slot}"><h4><span>${title}</span>${vid?`<small>${esc(vid)}</small>`:'<small class="none">not linked</small>'}</h4><div class="ports p4">${[0,1,2,3].map(i=>portHtml(merged(lk,start+i), start+i, L, o)).join('')}</div></div>`;
      }).join('');
      return `<div class="card"><div class="card-h"><span>${esc(lk.id)} <small>${esc(loc(lk))}</small></span><small>${esc(blockLabel(mode))}</small></div><div class="card-b"><div class="lk-groups ${o.groupColors!==false?'tint':''}">${groups}</div></div></div>`;
    }).join('') || '<div class="placeholder">No LK blocks in this DimCity.</div>';
    const veHtml = loose.length ? `<div style="margin-top:2mm" class="small"><b>Veams not linked to an LK</b></div><div class="grid cols3" style="margin-top:1.5mm">${loose.map(v=>`<div class="card"><div class="card-h"><span>${esc(v.id)}</span><small>Veam · 4 ports</small></div><div class="card-b"><div class="ports p4">${[1,2,3,4].map(i=>{ const r = portRec(v.lines,i) || {}; return portHtml({ universe:r.universe, dest:r.dest, source:'Veam' }, i, L, o); }).join('')}</div></div></div>`).join('')}</div>` : '';
    return `<div class="section">${h3(n, 'LK / Veam patch', `${lks.length} LK block${lks.length===1?'':'s'}`)}${lkHtml}${veHtml}</div>`;
  }
  function buildUniverses(M, dc, L, n){
    const pts = allPoints(M, dc).filter(p=>p.universe!=null && p.universe!=='');
    const by = new Map(); for(const p of pts){ const k = String(p.universe); if(!by.has(k)) by.set(k, []); by.get(k).push(p); }
    const rows = [...by.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([u, list])=>`<tr><td><span class="dot" style="background:${uniColor(u,L)}"></span><b>UNI ${esc(u)}</b></td><td class="num">${list.length}</td><td>${list.map(p=>esc(p.kind==='DMX'?'DMX':`${p.id}/${p.port}`)).join(', ')}</td></tr>`).join('');
    return `<div class="section">${h3(n, 'Universe overview', `${by.size} universes`)}<table><thead><tr><th style="width:22mm">Universe</th><th class="num" style="width:14mm">Points</th><th>Patched on</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="small">No universes</td></tr>'}</tbody></table></div>`;
  }
  function buildPatchList(M, dc, L, n, o){
    const pts = allPoints(M, dc, o.dmx !== false);
    const label = st => st==='RED' ? '<span class="tag red">Error</span>' : st==='GREEN' ? '<span class="tag green">OK</span>' : '<span class="tag yellow">Incomplete</span>';
    const rows = pts.map(p=>`<tr><td>${esc(p.kind)}</td><td><b>${esc(p.id)}</b></td><td class="num">${esc(p.port)}</td><td class="num">${p.universe ?? ''}</td><td>${esc(p.dest)}</td><td>${label(p.status)}</td></tr>`).join('');
    return `<div class="section">${h3(n, 'Patch list', `${pts.length} rows`)}<table><thead><tr><th>Type</th><th>ID</th><th class="num">Port</th><th class="num">Universe</th><th>Location</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="small">No rows</td></tr>'}</tbody></table></div>`;
  }
  function buildWarnings(M, dc, L, n, o){
    const list = (M.issues||[]).filter(i => i.dimcity === dc || (o.projectWide !== false && !i.dimcity));
    const rows = list.map(i=>`<tr><td>${i.severity==='RED'?'<span class="tag red">Error</span>':'<span class="tag yellow">Warning</span>'}</td><td>${esc(i.message||'')}</td><td class="small">${esc(i.code||'')}</td></tr>`).join('');
    return `<div class="section">${h3(n, 'Warnings & errors', list.length ? `${list.length} item${list.length===1?'':'s'}` : '')}${list.length ? `<table><thead><tr><th style="width:20mm">Status</th><th>Message</th><th style="width:40mm">Code</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="placeholder">No issues — all checks passed.</div>'}</div>`;
  }

  function buildPdfHtml({ M, meta, dcs, layout, preview=false, coverOnce=true }){
    const L = layout;
    const cover = L.cover.show ? buildCover(M, meta, dcs, L) : '';
    const summary = L.cover.summaryPage && dcs.length > 1 ? buildProjectSummary(M, meta, dcs, L) : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.project || 'PatchLab report')}</title><style>${printCss(L, { preview, meta })}</style></head><body>${preview ? '' : printWatermark(L, meta)}${coverOnce ? cover + summary : ''}${dcs.map(dc => buildDimCity(M, meta, dc, L)).join('')}</body></html>`;
  }

  // ===================== Builder UI =====================
  let B = null; // builder state

  function currentMeta(){
    const M = getM() || {};
    return { project:'', area:'', location:'', date:'', prepared:'', logo:null, ...(M.projectMeta || {}) };
  }
  function allDims(){ const M = getM(); return (App()?.sortedDims?.() || keysFromMap(M?.byDim).sort()); }
  function selectedDims(){
    const all = allDims();
    if(B.L.scope !== 'SEL') return all;
    const sel = all.filter(d => B.L.dims.includes(d));
    return sel;
  }

  function open(opts = {}){
    const M = getM(); if(!M) return;
    if(!keysFromMap(M.byDim).length){ App()?.ui?.toast?.('Nothing to export yet — import a CSV or add an LK first.', 'info'); return; }
    const L = layoutFromSettings(M.pdfSettings);
    if(Array.isArray(opts.dcs) && opts.dcs.length){ L.scope = 'SEL'; L.dims = opts.dcs.slice(); }
    B = { L, tab:'content', expanded:null, zoom:'fit', selSec:null, timer:null };
    mount();
  }
  function close(save = true){
    if(!B) return;
    if(save) persist();
    document.getElementById('rbRoot')?.remove();
    document.removeEventListener('keydown', onKey, true);
    B = null;
  }
  function persist(){
    const M = getM(); if(!M || !B) return;
    const before = JSON.stringify(M.pdfSettings?.layout || null);
    M.pdfSettings = { ...(M.pdfSettings || {}), layout: clone(B.L), page: B.L.page.orientation, output: B.L.output };
    if(before !== JSON.stringify(B.L) && M.ui) M.ui.dirty = true;
  }
  function onKey(e){
    if(!B) return;
    if(e.key === 'Escape' && !document.querySelector('.modal-backdrop')){ e.preventDefault(); close(true); }
  }

  function mount(){
    document.getElementById('rbRoot')?.remove();
    const root = document.createElement('div');
    root.id = 'rbRoot';
    root.className = 'rb';
    root.innerHTML = `
      <div class="rb-top">
        <div class="rb-title">${I('file',18)}<div><b>Report Builder</b><span id="rbSummary"></span></div></div>
        <div class="rb-top-mid">
          <label class="rb-inline">Template<select id="rbTemplate"></select></label>
          <button class="sm" id="rbSaveTpl">${I('copy',14)}Save as template</button>
        </div>
        <div class="rb-top-actions">
          <button id="rbClose">Close</button>
          <button class="primary" id="rbExport">${I('download',15)}<span>Export PDF</span></button>
        </div>
      </div>
      <div class="rb-body">
        <aside class="rb-panel">
          <div class="rb-tabs segmented" id="rbTabs">
            <button data-tab="content">${I('layers',14)}Content</button>
            <button data-tab="style">${I('sliders',14)}Style</button>
            <button data-tab="cover">${I('image',14)}Cover</button>
            <button data-tab="brand">${I('star',14)}Brand</button>
          </div>
          <div class="rb-panel-body" id="rbPanel"></div>
        </aside>
        <section class="rb-preview">
          <div class="rb-preview-bar">
            <span class="subtle" id="rbPageInfo"></span>
            <span class="spacer"></span>
            <span class="subtle rb-hint">${I('info',13)} Click a part of the preview to edit it · orange lines mark page breaks</span>
            <div class="segmented" id="rbZoom">
              <button data-z="fit">Fit</button><button data-z="0.5">50%</button><button data-z="0.75">75%</button><button data-z="1">100%</button>
            </div>
          </div>
          <iframe id="rbFrame" title="Report preview"></iframe>
        </section>
      </div>`;
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey, true);

    root.querySelector('#rbClose').onclick = ()=> close(true);
    root.querySelector('#rbExport').onclick = onExport;
    root.querySelector('#rbSaveTpl').onclick = saveTemplate;
    root.querySelector('#rbTemplate').onchange = e => applyTemplate(e.target.value);
    root.querySelectorAll('#rbTabs button').forEach(b => b.onclick = ()=>{ B.tab = b.dataset.tab; renderPanel(); });
    root.querySelectorAll('#rbZoom button').forEach(b => b.onclick = ()=>{ B.zoom = b.dataset.z; applyZoom(); syncZoomButtons(); });
    window.addEventListener('resize', applyZoom);
    renderTemplates();
    renderPanel();
    renderPreview(true);
  }

  // ---- Templates ----
  function renderTemplates(){
    const M = getM();
    const sel = document.getElementById('rbTemplate'); if(!sel) return;
    const tpls = Array.isArray(M.pdfTemplates) ? M.pdfTemplates : [];
    sel.innerHTML = `<option value="">Choose…</option><optgroup label="Presets">${Object.entries(PRESETS).map(([k,p])=>`<option value="preset:${k}">${esc(p.name)}</option>`).join('')}</optgroup>${tpls.length?`<optgroup label="My templates">${tpls.map(t=>`<option value="tpl:${esc(t.id)}">${esc(t.name)}</option>`).join('')}</optgroup><optgroup label="Manage"><option value="manage">Delete a template…</option></optgroup>`:''}`;
    sel.value = '';
  }
  function applyTemplate(v){
    if(!v) return;
    const M = getM();
    if(v === 'manage') return manageTemplates();
    const keep = { scope:B.L.scope, dims:B.L.dims.slice(), output:B.L.output };
    if(v.startsWith('preset:')){
      const p = PRESETS[v.slice(7)]; if(!p) return;
      const L = defaultLayout(); L.style.accent = B.L.style.accent; p.apply(L);
      B.L = { ...L, ...keep };
      App()?.ui?.toast?.(`Preset “${p.name}” applied`, 'info');
    } else if(v.startsWith('tpl:')){
      const t = (M.pdfTemplates||[]).find(x=>x.id === v.slice(4)); if(!t) return;
      B.L = { ...mergeLayout(t.layout), ...keep };
      App()?.ui?.toast?.(`Template “${t.name}” applied`, 'info');
    }
    renderTemplates(); renderPanel(); renderPreview();
  }
  function saveTemplate(){
    const ui = App()?.ui; const M = getM();
    const d = ui.openDialog({ title:'Save as Template', subtitle:'Saves sections, order, style, header/footer and cover settings. Project details are not part of a template.', width:'460px',
      body:`<label class="field">Template name<input id="tplName" type="text" placeholder="e.g. Mainstage crew sheets"></label>`,
      footer:`<button data-a="c">Cancel</button><button class="primary" data-a="s">Save Template</button>` });
    const inp = d.modal.querySelector('#tplName'); setTimeout(()=>inp.focus(), 30);
    const save = ()=>{
      const name = inp.value.trim(); if(!name){ inp.focus(); return; }
      if(!Array.isArray(M.pdfTemplates)) M.pdfTemplates = [];
      const existing = M.pdfTemplates.find(t => t.name.toLowerCase() === name.toLowerCase());
      const layout = clone(B.L); layout.scope = 'ALL'; layout.dims = [];
      const tpl = existing || { id:`tpl_${Date.now().toString(36)}`, name };
      tpl.layout = layout;
      if(!existing) M.pdfTemplates.push(tpl);
      window.Library?.put?.('pdfTemplates', tpl);
      if(M.ui) M.ui.dirty = true;
      d.close(); renderTemplates();
      ui.toast(`Template “${name}” saved in this project and your library`);
    };
    d.footer.querySelector('[data-a=c]').onclick = d.close;
    d.footer.querySelector('[data-a=s]').onclick = save;
    inp.onkeydown = e => { if(e.key === 'Enter') save(); };
  }
  function manageTemplates(){
    const ui = App()?.ui; const M = getM();
    const draw = d => {
      const tpls = M.pdfTemplates || [];
      d.body.innerHTML = tpls.length ? `<div class="table-wrap"><table class="data-table"><tbody>${tpls.map(t=>`<tr><td>${esc(t.name)}</td><td class="num"><button class="sm danger" data-del="${esc(t.id)}">${I('trash',13)}Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>No templates left.</p></div>';
      d.body.querySelectorAll('[data-del]').forEach(b => b.onclick = ()=>{ M.pdfTemplates = tpls.filter(t => t.id !== b.dataset.del); window.Library?.del?.('pdfTemplates', b.dataset.del); if(M.ui) M.ui.dirty = true; draw(d); renderTemplates(); });
    };
    const d = ui.openDialog({ title:'Templates', subtitle:'Deleting removes the template from this project and your library.', width:'440px', body:'', footer:'<button class="primary" data-a="ok">Done</button>' });
    d.footer.querySelector('[data-a=ok]').onclick = d.close;
    draw(d); renderTemplates();
  }

  // ---- Panel ----
  const sw = (id, on, label, extra='') => `<label class="rb-row"><span>${label}</span><span class="switch"><input type="checkbox" id="${id}" ${on?'checked':''} ${extra}><span></span></span></label>`;
  function renderPanel(){
    const root = document.getElementById('rbRoot'); if(!root) return;
    root.querySelectorAll('#rbTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === B.tab));
    const P = root.querySelector('#rbPanel');
    if(B.tab === 'content') P.innerHTML = panelContent();
    else if(B.tab === 'style') P.innerHTML = panelStyle();
    else if(B.tab === 'brand') P.innerHTML = panelBrand();
    else P.innerHTML = panelCover();
    bindPanel(P);
  }
  function panelContent(){
    const L = B.L, dims = allDims();
    const scope = `<div class="rb-group"><div class="rb-label">DimCities</div>
      <div class="segmented rb-full" id="rbScope"><button data-v="ALL" class="${L.scope!=='SEL'?'active':''}">All (${dims.length})</button><button data-v="SEL" class="${L.scope==='SEL'?'active':''}">Select…</button></div>
      ${L.scope==='SEL' ? `<div class="rb-chips">${dims.map(dc=>`<label class="rb-chip ${L.dims.includes(dc)?'on':''}"><input type="checkbox" data-dim="${esc(dc)}" ${L.dims.includes(dc)?'checked':''}><span class="dot" style="background:${dcColor(getM(),dc)}"></span>${esc(dc)}</label>`).join('')}</div>` : ''}
      <div class="rb-label" style="margin-top:14px">Output</div>
      <div class="segmented rb-full" id="rbOutput"><button data-v="SINGLE" class="${L.output!=='PER_DIM'?'active':''}">One PDF</button><button data-v="PER_DIM" class="${L.output==='PER_DIM'?'active':''}">One PDF per DimCity</button></div>
      <div class="hint">${L.output==='PER_DIM' ? 'Each DimCity gets its own file, each with its own cover page.' : 'All selected DimCities in one file, one cover page.'}</div></div>`;
    const secs = L.sections.map((s, i)=>{
      const meta = SECTIONS[s.key];
      const open = B.expanded === s.key;
      const opts = SECTION_OPTS[s.key] || [];
      const optHtml = s.key === 'notes'
        ? `<label class="field" style="margin-top:4px">Text<textarea rows="5" data-notes placeholder="Crew instructions, contact numbers… Supports {project}, {dimcity}, {date}.">${esc(s.opts?.text || '')}</textarea></label>`
        : opts.map(([k, label, def])=>`<label class="rb-row sm"><span>${label}</span><span class="switch"><input type="checkbox" data-opt="${k}" data-sec="${s.key}" ${(s.opts?.[k] ?? def)?'checked':''}><span></span></span></label>`).join('');
      return `<div class="rb-sec ${s.on?'':'off'} ${open?'open':''} ${B.selSec===s.key?'sel':''}" draggable="true" data-key="${s.key}">
        <div class="rb-sec-head">
          <span class="grip" title="Drag to reorder">${I('grip',14)}</span>
          <label class="switch" title="${s.on?'Hide':'Show'} section"><input type="checkbox" data-on="${s.key}" ${s.on?'checked':''}><span></span></label>
          <div class="rb-sec-title" data-toggle="${s.key}"><b>${I(meta.icon,14)} ${esc(meta.title)}</b><span>${esc(meta.desc)}</span></div>
          <div class="rb-sec-move"><button class="ghost sm icon-only" data-up="${i}" ${i===0?'disabled':''} title="Move up">${I('chevronDown',13).replace('<svg','<svg style="transform:rotate(180deg)"')}</button><button class="ghost sm icon-only" data-down="${i}" ${i===L.sections.length-1?'disabled':''} title="Move down">${I('chevronDown',13)}</button></div>
          ${opts.length || s.key==='notes' ? `<button class="ghost sm icon-only" data-toggle="${s.key}" title="Options">${I(open?'chevronDown':'chevronRight',14)}</button>` : '<span style="width:26px"></span>'}
        </div>
        ${open ? `<div class="rb-sec-opts">${optHtml}</div>` : ''}
      </div>`;
    }).join('');
    return `${scope}<div class="rb-group"><div class="rb-label">Sections per DimCity <span class="subtle">· drag to reorder</span></div><div class="rb-secs" id="rbSecs">${secs}</div></div>`;
  }
  function panelStyle(){
    const L = B.L;
    const accents = ['#ff8a1f','#2563eb','#0f766e','#7c3aed','#dc2626','#0f172a'];
    return `<div class="rb-group"><div class="rb-label">Page</div>
        <div class="form-grid">
          <label class="field">Paper size<select id="rbSize">${Object.keys(PAGE_MM).map(k=>`<option ${L.page.size===k?'selected':''}>${k}</option>`).join('')}</select></label>
          <label class="field">Orientation<select id="rbOrient"><option value="landscape" ${L.page.orientation!=='portrait'?'selected':''}>Landscape</option><option value="portrait" ${L.page.orientation==='portrait'?'selected':''}>Portrait</option></select></label>
          <label class="field span-2">Margins <span class="subtle" id="rbMarginVal">${L.page.margin} mm</span><input type="range" id="rbMargin" min="5" max="20" step="1" value="${L.page.margin}"></label>
        </div></div>
      <div class="rb-group"><div class="rb-label">Look</div>
        <label class="field">Accent color</label>
        <div class="rb-swatches">${accents.map(c=>`<button class="color-swatch ${L.style.accent===c?'active':''}" data-accent="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="rbAccent" value="${hex(L.style.accent,'#ff8a1f')}"></div>
        <div class="form-grid" style="margin-top:12px">
          <label class="field">Font<select id="rbFont"><option value="helvetica" ${L.style.font==='helvetica'?'selected':''}>Helvetica / Arial</option><option value="system" ${L.style.font==='system'?'selected':''}>System UI</option><option value="georgia" ${L.style.font==='georgia'?'selected':''}>Georgia (serif)</option></select></label>
          <label class="field">Text size<select id="rbFs">${[8,8.5,9,9.5,10,11].map(v=>`<option value="${v}" ${Number(L.style.fontSize)===v?'selected':''}>${v} pt</option>`).join('')}</select></label>
          <label class="field span-2">Density<div class="segmented rb-full" id="rbDensity"><button data-v="compact" class="${L.style.density==='compact'?'active':''}">Compact</button><button data-v="comfortable" class="${L.style.density!=='compact'?'active':''}">Comfortable</button></div></label>
        </div>
        ${sw('rbColorU', L.style.colorUniverses, 'Color-code universes')}
        ${sw('rbBand', L.style.dimBand, 'Use DimCity color in headers')}
        ${sw('rbGray', L.style.grayscale, 'Print-friendly grayscale')}
      </div>
      <div class="rb-group"><div class="rb-label">Header & footer</div>
        ${sw('rbHead', L.header.show, 'Running header on DimCity pages')}
        ${L.header.show ? `<label class="field"><input type="text" id="rbHeadText" value="${esc(L.header.text)}"></label>` : ''}
        ${sw('rbFoot', L.footer.show, 'Footer on every page')}
        ${L.footer.show ? `<div class="form-grid"><label class="field">Left<input type="text" id="rbFootL" value="${esc(L.footer.left)}"></label><label class="field">Center<input type="text" id="rbFootC" value="${esc(L.footer.center)}"></label></div>${sw('rbPageNo', L.footer.pageNumbers, 'Page numbers (Page 1 of 12)')}` : ''}
        <div class="hint">Placeholders: {project} {area} {location} {date} {prepared} {dimcity}</div>
      </div>`;
  }
  function panelBrand(){
    const b = B.L.brand, wm = b.wm, meta = currentMeta();
    const range = (id, label, v, min, max, unit, step=1) => `<label class="field">${label} <span class="subtle" id="${id}Val">${v}${unit}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
    return `<div class="rb-group"><div class="rb-label">Company logo</div>
        <div class="rb-logo">${b.logo ? `<img src="${b.logo}" alt="">` : `<div class="rb-logo-empty">${I('image',22)}<span>No company logo</span></div>`}
          <div class="rb-logo-actions"><button class="sm" id="rbBrandPick">${I('upload',13)}${b.logo?'Replace':'Upload'}</button>
            ${b.logo ? `<button class="sm ghost" id="rbBrandDel">${I('trash',13)}Remove</button>` : meta.logo ? `<button class="sm ghost" id="rbBrandUseProject">Use project logo</button>` : ''}</div></div>
        <input type="file" id="rbBrandFile" accept="image/*" hidden>
        ${b.logo ? `<div class="rb-label" style="margin-top:14px">On every page</div>
          <div class="segmented rb-full rb-wrap" id="rbBrandPos">${[['none','Off'],['header-left','Top left'],['header-right','Top right'],['footer-left','Bottom left'],['footer-right','Bottom right']].map(([v,l])=>`<button data-v="${v}" class="${b.logoPos===v?'active':''}">${l}</button>`).join('')}</div>
          ${b.logoPos !== 'none' ? range('rbBrandH', 'Logo height', Number(b.logoHeight) || 9, 5, 25, ' mm') : ''}` : ''}
      </div>
      <div class="rb-group"><div class="rb-label">Watermark</div>
        <div class="segmented rb-full" id="rbWmType">${[['none','None'],['logo','Logo'],['text','Text']].map(([v,l])=>`<button data-v="${v}" class="${wm.type===v?'active':''}">${l}</button>`).join('')}</div>
        ${wm.type === 'logo' && !(b.logo || meta.logo) ? `<div class="hint">${I('info',12)} Upload a company logo above first.</div>` : ''}
        ${wm.type === 'text' ? `<label class="field" style="margin-top:12px">Text<input type="text" id="rbWmText" value="${esc(wm.text)}" placeholder="CONFIDENTIAL / DRAFT / CONCEPT"></label>` : ''}
        ${wm.type !== 'none' ? `<div class="rb-stack">
          ${range('rbWmOp', 'Strength', Number(wm.opacity) || 8, 2, 40, '%')}
          ${range('rbWmSize', 'Size', Number(wm.size) || 55, 15, 100, '%')}
          ${range('rbWmAngle', 'Angle', Number(wm.angle) || 0, -90, 90, '°', 5)}</div>` : ''}
      </div>
      <div class="hint">${I('info',12)} Your company style is part of the layout: use <b>Save as template</b> to reuse it in every show — templates are stored in your library.</div>`;
  }
  function panelCover(){
    const L = B.L, c = L.cover, meta = currentMeta();
    const f = c.fields;
    return `${sw('rbCover', c.show, '<b>Cover page</b>')}
      ${c.show ? `<div class="rb-group">
        <div class="form-grid">
          <label class="field span-2">Title <span class="subtle">(empty = project name)</span><input type="text" id="rbCTitle" placeholder="${esc(meta.project || 'Project name')}" value="${esc(c.title)}"></label>
          <label class="field span-2">Subtitle<input type="text" id="rbCSub" value="${esc(c.subtitle)}"></label>
        </div>
        <div class="rb-label" style="margin-top:14px">Show on cover</div>
        <div class="rb-chips">${[['area','Area'],['location','Location'],['date','Date'],['prepared','Prepared by'],['dimcities','DimCity list'],['totals','Totals']].map(([k,l])=>`<label class="rb-chip ${f[k]?'on':''}"><input type="checkbox" data-field="${k}" ${f[k]?'checked':''}>${l}</label>`).join('')}</div>
        <div class="rb-label" style="margin-top:14px">Logo</div>
        <div class="rb-logo">${meta.logo ? `<img src="${meta.logo}" alt="">` : `<div class="rb-logo-empty">${I('image',22)}<span>No logo</span></div>`}
          <div class="rb-logo-actions"><button class="sm" id="rbLogoPick">${I('upload',13)}${meta.logo?'Replace':'Upload'}</button>${meta.logo?`<button class="sm ghost" id="rbLogoDel">${I('trash',13)}Remove</button>`:''}
          </div></div>
        <input type="file" id="rbLogoFile" accept="image/*" hidden>
        ${meta.logo ? `<div class="rb-pos-row">
          <div class="rb-pos" id="rbLogoPos" title="Position on the cover">${[0, .5, 1].map(y => [0, .5, 1].map(x => `<button data-x="${x}" data-y="${y}" class="${Number(c.logoX) === x && Number(c.logoY) === y ? 'active' : ''}"></button>`).join('')).join('')}</div>
          <div style="flex:1"><label class="field">Size <span class="subtle" id="rbLogoWVal">${Number(c.logoW) || 60} mm</span><input type="range" id="rbLogoW" min="15" max="180" step="1" value="${Number(c.logoW) || 60}"></label>
          <div class="hint">${I('info',12)} Or drag the image in the preview.</div></div>
        </div>` : ''}
        <label class="field" style="margin-top:14px">Note on cover<textarea id="rbCNote" rows="3" placeholder="Optional — e.g. version, revision or crew note">${esc(c.note)}</textarea></label>
      </div>` : ''}
      ${sw('rbSummaryPage', c.summaryPage, 'Project summary page (when exporting more than one DimCity)')}
      <div class="rb-group"><div class="rb-label">Project details</div>
        <div class="form-grid">
          <label class="field span-2">Project<input type="text" data-meta="project" value="${esc(meta.project)}"></label>
          <label class="field">Area<input type="text" data-meta="area" value="${esc(meta.area)}"></label>
          <label class="field">Location<input type="text" data-meta="location" value="${esc(meta.location)}"></label>
          <label class="field">Date<input type="date" data-meta="date" value="${esc(meta.date)}"></label>
          <label class="field">Prepared by<input type="text" data-meta="prepared" value="${esc(meta.prepared)}"></label>
        </div>
        <div class="hint">These are the project details from Project Info — changes here update the project.</div>
      </div>`;
  }

  function bindPanel(P){
    const L = B.L;
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach(n => n.addEventListener(ev, fn));
    const changed = (rerenderPanel=false) => { if(rerenderPanel) renderPanel(); schedulePreview(); };
    const seg = (id, fn) => P.querySelectorAll(`#${id} button`).forEach(b => b.onclick = ()=>{ fn(b.dataset.v); changed(true); });

    // Content
    seg('rbScope', v => { L.scope = v; if(v==='SEL' && !L.dims.length) L.dims = allDims().slice(); });
    seg('rbOutput', v => { L.output = v; updateSummary(); });
    on('[data-dim]', 'change', e => { const d = e.target.dataset.dim; L.dims = e.target.checked ? [...new Set([...L.dims, d])] : L.dims.filter(x=>x!==d); changed(true); });
    on('[data-on]', 'change', e => { const s = L.sections.find(x=>x.key===e.target.dataset.on); s.on = e.target.checked; changed(true); });
    on('[data-toggle]', 'click', e => { const k = e.currentTarget.dataset.toggle; B.expanded = B.expanded===k ? null : k; B.selSec = k; renderPanel(); highlightPreview(); });
    on('[data-opt]', 'change', e => { const s = L.sections.find(x=>x.key===e.target.dataset.sec); s.opts = { ...(s.opts||{}), [e.target.dataset.opt]: e.target.checked }; changed(); });
    on('[data-notes]', 'input', e => { const s = L.sections.find(x=>x.key==='notes'); s.opts = { ...(s.opts||{}), text:e.target.value }; if(e.target.value && !s.on){ s.on = true; P.querySelector('[data-on="notes"]').checked = true; P.querySelector('.rb-sec[data-key="notes"]').classList.remove('off'); } changed(); });
    on('[data-up]', 'click', e => { move(Number(e.currentTarget.dataset.up), -1); });
    on('[data-down]', 'click', e => { move(Number(e.currentTarget.dataset.down), 1); });
    // drag & drop volgorde
    let dragKey = null;
    on('.rb-sec', 'dragstart', e => { dragKey = e.currentTarget.dataset.key; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    on('.rb-sec', 'dragend', e => { e.currentTarget.classList.remove('dragging'); P.querySelectorAll('.rb-sec').forEach(n=>n.classList.remove('drop-before','drop-after')); });
    on('.rb-sec', 'dragover', e => {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect(); const after = e.clientY > r.top + r.height/2;
      P.querySelectorAll('.rb-sec').forEach(n=>n.classList.remove('drop-before','drop-after'));
      e.currentTarget.classList.add(after ? 'drop-after' : 'drop-before');
    });
    on('.rb-sec', 'drop', e => {
      e.preventDefault();
      const target = e.currentTarget.dataset.key; if(!dragKey || dragKey === target) return;
      const r = e.currentTarget.getBoundingClientRect(); const after = e.clientY > r.top + r.height/2;
      const from = L.sections.findIndex(s=>s.key===dragKey);
      const [item] = L.sections.splice(from, 1);
      let to = L.sections.findIndex(s=>s.key===target) + (after ? 1 : 0);
      L.sections.splice(to, 0, item);
      changed(true);
    });

    // Style
    const val = (id, fn, ev='change') => { const n = P.querySelector('#'+id); if(n) n.addEventListener(ev, ()=>{ fn(n); changed(); }); };
    val('rbSize', n => L.page.size = n.value);
    val('rbOrient', n => L.page.orientation = n.value);
    val('rbMargin', n => { L.page.margin = Number(n.value); P.querySelector('#rbMarginVal').textContent = `${n.value} mm`; }, 'input');
    on('[data-accent]', 'click', e => { L.style.accent = e.currentTarget.dataset.accent; changed(true); });
    val('rbAccent', n => L.style.accent = n.value, 'input');
    val('rbFont', n => L.style.font = n.value);
    val('rbFs', n => L.style.fontSize = Number(n.value));
    seg('rbDensity', v => L.style.density = v);
    val('rbColorU', n => L.style.colorUniverses = n.checked);
    val('rbBand', n => L.style.dimBand = n.checked);
    val('rbGray', n => L.style.grayscale = n.checked);
    const valP = (id, fn) => { const n = P.querySelector('#'+id); if(n) n.addEventListener('change', ()=>{ fn(n); changed(true); }); };
    valP('rbHead', n => L.header.show = n.checked);
    valP('rbFoot', n => L.footer.show = n.checked);
    val('rbHeadText', n => L.header.text = n.value, 'input');
    val('rbFootL', n => L.footer.left = n.value, 'input');
    val('rbFootC', n => L.footer.center = n.value, 'input');
    val('rbPageNo', n => L.footer.pageNumbers = n.checked);

    // Cover
    valP('rbCover', n => L.cover.show = n.checked);
    val('rbSummaryPage', n => L.cover.summaryPage = n.checked);
    val('rbCTitle', n => L.cover.title = n.value, 'input');
    val('rbCSub', n => L.cover.subtitle = n.value, 'input');
    val('rbCNote', n => L.cover.note = n.value, 'input');
    on('[data-field]', 'change', e => { L.cover.fields[e.target.dataset.field] = e.target.checked; e.target.closest('.rb-chip').classList.toggle('on', e.target.checked); changed(); });
    on('#rbLogoPos button', 'click', e => { L.cover.logoX = Number(e.currentTarget.dataset.x); L.cover.logoY = Number(e.currentTarget.dataset.y); changed(true); });
    val('rbLogoW', n => { L.cover.logoW = Number(n.value); P.querySelector('#rbLogoWVal').textContent = `${n.value} mm`; }, 'input');

    // Brand
    const bfile = P.querySelector('#rbBrandFile');
    on('#rbBrandPick', 'click', () => bfile.click());
    if(bfile) bfile.onchange = async () => {
      const f = bfile.files?.[0]; if(!f) return;
      try { L.brand.logo = await imageToDataUrl(f); if(L.brand.logoPos === 'none') L.brand.logoPos = 'header-right'; changed(true); }
      catch(err){ App()?.ui?.toast?.(`Could not read image: ${err.message || err}`, 'err'); }
    };
    on('#rbBrandDel', 'click', () => { L.brand.logo = null; changed(true); });
    on('#rbBrandUseProject', 'click', () => { L.brand.logo = currentMeta().logo; if(L.brand.logoPos === 'none') L.brand.logoPos = 'header-right'; changed(true); });
    seg('rbBrandPos', v => L.brand.logoPos = v);
    val('rbBrandH', n => { L.brand.logoHeight = Number(n.value); P.querySelector('#rbBrandHVal').textContent = `${n.value} mm`; }, 'input');
    seg('rbWmType', v => L.brand.wm.type = v);
    val('rbWmText', n => L.brand.wm.text = n.value, 'input');
    const rng = (id, key, unit) => val(id, n => { L.brand.wm[key] = Number(n.value); P.querySelector(`#${id}Val`).textContent = `${n.value}${unit}`; }, 'input');
    rng('rbWmOp', 'opacity', '%'); rng('rbWmSize', 'size', '%'); rng('rbWmAngle', 'angle', '°');
    const M = getM();
    const setMeta = (k, v) => { M.projectMeta = { ...(M.projectMeta||{}), [k]: v }; if(M.ui) M.ui.dirty = true; };
    on('[data-meta]', 'input', e => { setMeta(e.target.dataset.meta, e.target.value); changed(); });
    on('[data-meta]', 'change', ()=> App()?.renderAll?.());
    const pick = P.querySelector('#rbLogoPick'), file = P.querySelector('#rbLogoFile');
    if(pick) pick.onclick = ()=> file.click();
    if(file) file.onchange = async ()=>{
      const f = file.files?.[0]; if(!f) return;
      try { setMeta('logo', await imageToDataUrl(f)); changed(true); }
      catch(err){ App()?.ui?.toast?.(`Could not read image: ${err.message || err}`, 'err'); }
    };
    const del = P.querySelector('#rbLogoDel'); if(del) del.onclick = ()=>{ setMeta('logo', null); changed(true); };
  }
  function move(i, d){
    const L = B.L, j = i + d;
    if(j < 0 || j >= L.sections.length) return;
    [L.sections[i], L.sections[j]] = [L.sections[j], L.sections[i]];
    renderPanel(); schedulePreview();
  }
  function fileToDataUrl(file){ return new Promise((res, rej)=>{ const r = new FileReader(); r.onload = ()=>res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
  // Afbeeldingen verkleinen (max 1200 px, PNG met transparantie) zodat project, templates en PDF klein blijven
  async function imageToDataUrl(file){
    if(file.size > 15 * 1024 * 1024) throw new Error('image is larger than 15 MB');
    const url = await fileToDataUrl(file);
    if(/svg/i.test(file.type)) return url;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not a supported image')); i.src = url; });
    const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    if(k === 1 && file.size < 400 * 1024) return url;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  // ---- Preview ----
  function schedulePreview(){ clearTimeout(B.timer); B.timer = setTimeout(()=>renderPreview(), 140); updateSummary(); }
  function updateSummary(){
    const dcs = selectedDims();
    const s = document.getElementById('rbSummary');
    if(s) s.textContent = `${dcs.length} DimCit${dcs.length===1?'y':'ies'} · ${B.L.output==='PER_DIM' ? `${dcs.length} PDF file${dcs.length===1?'':'s'}` : 'one PDF'} · ${B.L.page.size} ${B.L.page.orientation}`;
    const btn = document.querySelector('#rbExport span');
    if(btn) btn.textContent = B.L.output==='PER_DIM' && dcs.length > 1 ? `Export ${dcs.length} PDFs` : 'Export PDF';
    const ex = document.getElementById('rbExport'); if(ex) ex.disabled = !dcs.length;
  }
  function renderPreview(first=false){
    if(!B) return;
    const frame = document.getElementById('rbFrame'); if(!frame) return;
    const M = getM(), meta = currentMeta();
    let dcs = selectedDims();
    updateSummary();
    // Bij "één PDF per DimCity" tonen we de eerste DimCity als voorbeeld
    const previewDcs = B.L.output === 'PER_DIM' ? dcs.slice(0, 1) : dcs;
    const html = previewDcs.length ? buildPdfHtml({ M, meta, dcs:previewDcs, layout:B.L, preview:true })
      : `<!doctype html><html><body style="background:#2a2e35;color:#9aa3b2;font:14px system-ui;display:grid;place-items:center;height:90vh">Select at least one DimCity.</body></html>`;
    const scrollY = first ? 0 : (frame.contentWindow?.scrollY || 0);
    frame.onload = ()=>{
      const doc = frame.contentDocument; if(!doc) return;
      applyZoom();
      frame.contentWindow.scrollTo(0, scrollY);
      const pages = doc.querySelectorAll('.page').length;
      const info = document.getElementById('rbPageInfo');
      if(info) info.textContent = `${pages} sheet${pages===1?'':'s'} in preview${B.L.output==='PER_DIM' && dcs.length>1 ? ` · showing ${previewDcs[0]} (each DimCity becomes its own file)` : ''}`;
      doc.addEventListener('click', e=>{
        const sec = e.target.closest('[data-sec]'); if(!sec) return;
        const key = sec.dataset.sec;
        if(key === 'cover'){ B.tab = 'cover'; B.selSec = null; }
        else { B.tab = 'content'; B.selSec = key; B.expanded = (SECTION_OPTS[key] || key==='notes') ? key : B.expanded; }
        renderPanel(); highlightPreview();
        document.querySelector(`.rb-sec[data-key="${key}"]`)?.scrollIntoView({ block:'nearest', behavior:'smooth' });
      });
      highlightPreview();
      bindCoverLogoDrag(doc);
    };
    frame.srcdoc = html;
  }
  // Coverafbeelding vrij verslepen in de preview
  function bindCoverLogoDrag(doc){
    const logo = doc.getElementById('coverLogo'); if(!logo) return;
    const cover = logo.closest('.cover');
    logo.addEventListener('mousedown', e => {
      e.preventDefault();
      const c = B.L.cover, cr = cover.getBoundingClientRect(), lr = logo.getBoundingClientRect();
      const [pw, ph] = pageDims(B.L), { m, mt, mb } = pageMargins(B.L);
      const freeW = cr.width * (1 - 2*m/pw) - lr.width, freeH = cr.height * (1 - (mt+mb)/ph) - lr.height;
      const sx = e.clientX, sy = e.clientY, x0 = Number(c.logoX ?? 1), y0 = Number(c.logoY ?? 0);
      let moved = false;
      const clamp = v => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
      const mv = ev => {
        moved = true;
        c.logoX = clamp(x0 + (freeW > 0 ? (ev.clientX - sx) / freeW : 0));
        c.logoY = clamp(y0 + (freeH > 0 ? (ev.clientY - sy) / freeH : 0));
        logo.style.setProperty('--x', c.logoX); logo.style.setProperty('--y', c.logoY);
      };
      const up = () => {
        doc.removeEventListener('mousemove', mv); doc.removeEventListener('mouseup', up);
        if(moved){ B.tab = 'cover'; renderPanel(); }
      };
      doc.addEventListener('mousemove', mv); doc.addEventListener('mouseup', up);
    });
  }
  function highlightPreview(){
    const doc = document.getElementById('rbFrame')?.contentDocument; if(!doc) return;
    doc.querySelectorAll('[data-sec]').forEach(n => n.classList.toggle('sel', !!B.selSec && n.dataset.sec === B.selSec));
  }
  function applyZoom(){
    if(!B) return;
    const frame = document.getElementById('rbFrame'); const doc = frame?.contentDocument; if(!doc?.body) return;
    let z = Number(B.zoom);
    if(B.zoom === 'fit'){
      const [w, h] = PAGE_MM[B.L.page.size] || PAGE_MM.A4;
      const pw = (B.L.page.orientation === 'portrait' ? w : h) * MM;
      z = Math.max(0.25, Math.min(1.25, (frame.clientWidth - 56) / pw));
    }
    doc.body.style.setProperty('--zoom', String(z));
    syncZoomButtons();
  }
  function syncZoomButtons(){ document.querySelectorAll('#rbZoom button').forEach(b => b.classList.toggle('active', b.dataset.z === String(B.zoom))); }

  // ---- Export ----
  async function onExport(){
    const M = getM(); if(!M || !B) return;
    const dcs = selectedDims();
    if(!dcs.length){ App()?.ui?.toast?.('Select at least one DimCity.', 'err'); return; }
    persist();
    const meta = currentMeta();
    const L = B.L;
    const landscape = L.page.orientation !== 'portrait';
    const footer = dc => L.footer.show ? { left:tokens(L.footer.left, meta, dc), center:tokens(L.footer.center, meta, dc), pageNumbers:L.footer.pageNumbers } : null;
    const base = safeFile(meta.project || 'PatchLab');
    const brand = brandLogoOn(L) ? { logo:L.brand.logo, pos:L.brand.logoPos, height:L.brand.logoHeight, margin:pageMargins(L).m } : null;
    const btn = document.getElementById('rbExport');
    btn.disabled = true; const label = btn.querySelector('span').textContent; btn.querySelector('span').textContent = 'Exporting…';
    try{
      if(L.output === 'PER_DIM'){
        const items = dcs.map(dc => ({ fileName:`${base}-${safeFile(dc)}.pdf`, html:buildPdfHtml({ M, meta, dcs:[dc], layout:L }), footer:footer(dc) }));
        const res = await window.app?.exportPdfBatch?.({ items, landscape, pageSize:L.page.size, brand });
        if(!res) return;
        App()?.ui?.toast?.(`${res.files.length} PDF file${res.files.length===1?'':'s'} exported`, 'ok', { action:{ label:'Show in folder', run:()=>window.app?.showItemInFolder?.(res.files[0]) }, ms:6000 });
      } else {
        const all = allDims();
        const name = dcs.length === all.length ? `${base}.pdf` : `${base}-${dcs.map(safeFile).join('_')}.pdf`;
        const out = await window.app?.exportPdfFromHtml?.({ html:buildPdfHtml({ M, meta, dcs, layout:L }), defaultPath:name, landscape, pageSize:L.page.size, footer:footer(''), brand });
        if(!out) return;
        App()?.ui?.toast?.(`Exported ${out.split(/[\\/]/).pop()}`, 'ok', { action:{ label:'Show in folder', run:()=>window.app?.showItemInFolder?.(out) }, ms:6000 });
      }
      close(true);
    } catch(err){
      App()?.ui?.toast?.(`PDF export failed: ${err?.message || err}`, 'err', { ms:7000 });
    } finally {
      if(btn.isConnected){ btn.disabled = false; btn.querySelector('span').textContent = label; }
    }
  }

  window.PdfExport = { open, close, buildPdfHtml, defaultLayout, layoutFromSettings };
  function hook(){ const btn = document.getElementById('fileExportPdf'); if(!btn || btn.dataset.pdfHooked) return false; btn.addEventListener('click', e=>{ e.preventDefault(); open(); }); btn.dataset.pdfHooked = '1'; return true; }
  if(!hook()) document.addEventListener('DOMContentLoaded', hook);
})();
