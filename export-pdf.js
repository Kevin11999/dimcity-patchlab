// export-pdf.js — the PDF engine of the Publish window (ui/publish.js).
// The layout (sections, order, style, cover, header / footer, logos) is kept in the project (MODEL.pdfSettings.layout) and can be
// stored as a template. The documents — the total DB book, LK info, Node info, the IP address book, the A3 network flow — are built
// from it as fixed sheets (core/paginate.js): the preview and the PDF are made from the same pages, with the logos of the company
// and the project, the page numbers and the contents on them. ui/labels.js makes the sticker sheets.
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
  const dcName = dc => window.DimLabel ? window.DimLabel(dc) : dc;

  // ===================== Layout model =====================
  // `docs` says in which documents a section appears (book = the total DB book, lk = LK info, nodes = Node info)
  const SECTIONS = {
    summary:   { title:'DimCity header & key figures', icon:'layout',   desc:'DimCity name, project line and totals.', docs:['book', 'lk', 'nodes'] },
    switches:  { title:'Switches: ports and VLAN',   icon:'network',  desc:'Per switch: a drawing of the ports in the VLAN colours and a table with device, VLAN, PoE, speed and universes.', docs:['book', 'nodes'] },
    network:   { title:'Network / DMX nodes',          icon:'network',  desc:'Planned nodes with IP and universe per port.', docs:['book', 'nodes'] },
    splitters: { title:'Splitters',                    icon:'cable',    desc:'Splitters with input feed and output map.', docs:['book', 'nodes'] },
    racks:     { title:'Racks',                        icon:'rack',     desc:'Racks with sockets, node colours and patch table.', docs:['book', 'nodes'] },
    flow:      { title:'Signal flow drawing',          icon:'cable',    desc:'The cabling from rack to objects, as arranged on the Signal Flow page.', docs:['book'] },
    patch:     { title:'LK / Veam patch',              icon:'box',      desc:'Every LK as a row of 12 ports with its Veam4s underneath: universe, and the node and node port each one is on.', docs:['book', 'lk'] },
    universes: { title:'Universe overview',            icon:'universe', desc:'Patch points per universe (LK / Veam / DMX).', docs:['book', 'lk'] },
    patchlist: { title:'Patch list table',             icon:'table',    desc:'All rows of this DimCity sorted by universe.', docs:['book', 'lk'] },
    warnings:  { title:'Warnings & errors',            icon:'alert',    desc:'Validation results for this DimCity.', docs:['book', 'lk'] },
    qr:        { title:'QR codes (the whole DB)',    icon:'grid',     desc:'QR codes that hold everything of this DB as text: sockets, nodes with IP, switches, fibres. Optional: the whole system.', docs:['book'] },
    notes:     { title:'Notes',                        icon:'note',     desc:'Free text, e.g. crew instructions.', docs:['book', 'lk', 'nodes'] }
  };
  const SECTION_OPTS = {
    network:   [['universeTable','Include universe overview table', true], ['switches','Show switches placeholder', false], ['addresses','All addresses of a device and the switch port plan', true]],
    switches:  [['overview','Overview of all switches and their fibres first', true], ['names','Show the port names typed by hand', true]],
    patch:     [['nodePorts','Show the node and node port per port', true], ['standaloneVeams','Include Veams that are not linked to an LK', true], ['location','Show location per port', true], ['source','Show source (LK / Veam) per port', false], ['groupColors','Tint Veam groups A / B / C', true]],
    patchlist: [['dmx','Include loose DMX', true]],
    racks:     [['drawing','Rack drawing', true], ['nodes','Node ports (which LK / Veam port is on which node port)', true], ['loose','Loose devices (nodes and spiders without a rack)', true], ['table','Patch table (node port → LK / Veam)', true], ['advice','Notes (what is still needed)', true]],
    flow:      [['legend','Cable legend', true], ['ownPage','Start on a new sheet', true], ['netOnly','Also a drawing of only the network (switches, Cat cables, fibres)', true]],
    warnings:  [['projectWide','Include project-wide issues', true]],
    qr:        [['system','Also the QR set for the whole system (first DB only)', true]]
  };
  // the documents that can be published (the window is ui/publish.js); `per`: one for the whole show or one for every DimCity
  const DOCS = {
    book:     { title:'Total DB book',     per:'all',   desc:'All chosen DimCities in one booklet: cover, contents, page numbers and the sections you choose.' },
    lk:       { title:'LK info',           per:'dc',    desc:'The LK / Veam patch sheets, the universes and the patch list of a DimCity.' },
    nodes:    { title:'Node info',         per:'dc',    desc:'Nodes, splitters, switches, racks and node ports of a DimCity.' },
    stickers: { title:'Stickers',          per:'dc',    desc:'Label sheets for the nodes, the switches and the cables, for the Herma sheets.' },
    a3:       { title:'Network flow (A3)', per:'dc',    desc:'The network flow and the signal flow drawn on A3: one file per DimCity and one for the whole show.' },
    ip:       { title:'IP address book',   per:'all',   desc:'Every address of the nodes, switches and consoles: per DimCity, per VLAN and sorted by number.' }
  };

  function defaultLayout(){
    return {
      version: 3,
      scope: 'ALL', dims: [], output: 'SINGLE',
      docs: { book:true, lk:true, nodes:true, stickers:true, a3:true, ip:true, stickerKinds:{ nodes:true, nodePorts:false, switches:true, switchPorts:false, cables:false } },
      publish: { structure:true, folder:'', open:true },
      page: { size:'A4', orientation:'portrait', margin:10 },
      a3: { orientation:'auto' },
      style: { accent:'#ff8a1f', font:'helvetica', fontSize:9.5, density:'comfortable', colorUniverses:true, dimBand:true, grayscale:false, lineWeight:'normal' },
      header: { show:true, text:'{project} · {dimcity}' },
      footer: { show:true, left:'{project} · {area}', center:'Prepared by {prepared} · {date}', pageNumbers:true },
      brand: { logo:null, logoPos:'header-right', logoHeight:9, projectLogoPos:'header-left', projectLogoHeight:9, wm:{ type:'none', text:'CONFIDENTIAL', opacity:8, size:55, angle:-30 } },
      cover: { show:true, title:'', subtitle:'{area} · {location}', showLogo:true, logoX:1, logoY:0, logoW:60, fields:{ area:true, location:true, date:true, prepared:true, dimcities:true, totals:true }, note:'', summaryPage:true, contents:true },
      sections: [
        { key:'summary', on:true }, { key:'network', on:true, opts:{ universeTable:true, switches:false, addresses:true } }, { key:'switches', on:true, opts:{ overview:true, names:true } },
        { key:'splitters', on:true }, { key:'racks', on:true, opts:{ drawing:true, nodes:true, loose:true, table:true, advice:true } }, { key:'flow', on:true, opts:{ legend:true, ownPage:true, netOnly:true } }, { key:'patch', on:true, opts:{ nodePorts:true, standaloneVeams:true, location:true, source:false, groupColors:true } },
        { key:'universes', on:false }, { key:'patchlist', on:false, opts:{ dmx:true } },
        { key:'warnings', on:true, opts:{ projectWide:true } }, { key:'qr', on:false, opts:{ system:true } }, { key:'notes', on:false, opts:{ text:'' } }
      ]
    };
  }
  const PRESETS = {
    DB_DETAILED: { name:'DB detailed paperwork', apply:L=>{ setOn(L, ['summary','network','splitters','patch','warnings']); L.style.density='comfortable'; L.cover.show=true; } },
    NETWORK_FIRST: { name:'Network crew', apply:L=>{ setOn(L, ['summary','network','switches','splitters','universes']); L.cover.show=true; } },
    PATCH_CREW: { name:'Patch crew', apply:L=>{ setOn(L, ['summary','patch','patchlist']); L.style.density='comfortable'; } },
    COMPACT: { name:'Compact patch sheets', apply:L=>{ setOn(L, ['patch']); L.style.density='compact'; L.cover.show=false; L.cover.summaryPage=false; } },
    RACKS_ONLY: { name:'Racks only', apply:L=>{ setOn(L, ['summary','racks']); L.cover.show=false; L.cover.summaryPage=false; const r = L.sections.find(s=>s.key==='racks'); r.opts = { ...(r.opts||{}), drawing:true, nodes:true, loose:true, table:true, advice:false }; } }
  };
  function setOn(L, keys){
    L.sections.forEach(s => s.on = keys.includes(s.key));
    const order = keys.concat(L.sections.map(s=>s.key).filter(k=>!keys.includes(k)));
    L.sections.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
  }
  // Oude pdfSettings (V9) omzetten naar een layout
  function layoutFromSettings(ps){
    if(ps?.layout && Number(ps.layout.version) >= 2) return mergeLayout(ps.layout);
    const L = defaultLayout();
    if(!ps) return L;
    L.page.orientation = ps.page === 'landscape' ? 'landscape' : 'portrait';
    const map = { incNetwork:'network', incSplitters:'splitters', incPatch:'patch', incWarnings:'warnings', incProject:'summary' };
    for(const [k, sec] of Object.entries(map)) if(k in ps){ const s = L.sections.find(x=>x.key===sec); if(s) s.on = ps[k] !== false; }
    const net = L.sections.find(s=>s.key==='network'); if(net && 'incSwitches' in ps) net.opts.switches = !!ps.incSwitches;
    return L;
  }
  function mergeLayout(saved){
    const L = defaultLayout();
    const out = { ...L, ...saved, version:3,
      docs:{ ...L.docs, ...(saved.docs||{}), stickerKinds:{ ...L.docs.stickerKinds, ...(saved.docs?.stickerKinds||{}) } }, publish:{ ...L.publish, ...(saved.publish||{}) }, a3:{ ...L.a3, ...(saved.a3||{}) },
      page:{ ...L.page, ...(saved.page||{}) }, style:{ ...L.style, ...(saved.style||{}) },
      header:{ ...L.header, ...(saved.header||{}) }, footer:{ ...L.footer, ...(saved.footer||{}) },
      brand:{ ...L.brand, ...(saved.brand||{}), wm:{ ...L.brand.wm, ...(saved.brand?.wm||{}) } },
      cover:{ ...L.cover, ...(saved.cover||{}), fields:{ ...L.cover.fields, ...(saved.cover?.fields||{}) } } };
    // a layout from before the Publish window: the pages are made for portrait now, which is the default (it can be changed again in the Look step)
    if(Number(saved.version) < 3) out.page.orientation = 'portrait';
    // oude S/M/L-logogrootte omzetten naar millimeters
    if(saved.cover && saved.cover.logoW == null && saved.cover.logoSize) out.cover.logoW = { S:35, M:60, L:90 }[saved.cover.logoSize] || 60;
    const known = Array.isArray(saved.sections) ? saved.sections.filter(s => SECTIONS[s.key]) : [];
    out.sections = known.map(s => ({ ...L.sections.find(d=>d.key===s.key), ...s, opts:{ ...(L.sections.find(d=>d.key===s.key)?.opts||{}), ...(s.opts||{}) }, pos: normPos(s.pos) }));
    for(const d of L.sections) if(!out.sections.some(s=>s.key===d.key)) out.sections.push(clone(d));
    return out;
  }
  // Positie van een sectie op het blad: null = automatisch onder elkaar, anders { x, y, w } in mm
  // (gemeten vanaf de linkerbovenhoek van het inhoudsvlak, binnen de marges)
  function normPos(p){
    if(!p || typeof p !== 'object' || p.mode === 'auto') return null;
    const n = (v, d) => { const x = Number(v); return Number.isFinite(x) ? Math.round(x * 2) / 2 : d; };
    return { x:Math.max(0, n(p.x, 0)), y:Math.max(0, n(p.y, 0)), w:Math.max(20, n(p.w, 120)) };
  }
  const GRID_MM = 5;
  const snap = v => Math.round(v / GRID_MM) * GRID_MM;

  // ===================== Data helpers =====================
  function currentMeta(){
    const M = getM() || {};
    return { project:'', area:'', location:'', date:'', prepared:'', logo:null, ...(M.projectMeta || {}) };
  }
  function allDims(){ const M = getM(); return (App()?.sortedDims?.() || keysFromMap(M?.byDim).sort()); }
  function selectedDims(L){
    const all = allDims();
    if(L.scope !== 'SEL') return all;
    return all.filter(d => L.dims.includes(d));
  }
  function uniColor(u, L){ return L.style.colorUniverses ? `hsl(${(Number(u||0)*47)%360} 70% 40%)` : '#64748b'; }
  function dcColor(M, dc){ return hex(App()?.dimColor?.(dc) || M?.dimColors?.[dc], '#2563eb'); }
  // Vervangt {placeholders}; segmenten (gescheiden door " · ") waarvan alle placeholders leeg zijn vallen weg.
  function tokens(str, meta, dc=''){
    const d = meta.date ? new Date(meta.date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';
    const vals = { project:meta.project||'', area:meta.area||'', location:meta.location||'', date:d, prepared:meta.prepared||'', dimcity:dc ? dcName(dc) : '' };
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

  // ===================== The sheet: size, margins, logos in the head and the foot =====================
  // Where the logos are, how big the head and the foot are, how much room is left for the content (mm).
  const LOGO_DIM = new Map();
  const logoKey = src => `${String(src || '').length}:${String(src || '').slice(-48)}`;
  function loadLogoDims(src){
    return new Promise(res => {
      if(!src) return res(null);
      const k = logoKey(src); if(LOGO_DIM.has(k)) return res(LOGO_DIM.get(k));
      const im = new Image(), done = d => { LOGO_DIM.set(k, d); res(d); };
      im.onload = () => done({ w:im.naturalWidth || 150, h:im.naturalHeight || 50 });
      im.onerror = () => done({ w:150, h:50 });
      im.src = src;
    });
  }
  const logoRatio = src => { const d = LOGO_DIM.get(logoKey(src)); return d && d.h ? d.w / d.h : 3; };
  const LOGO_POS = ['none', 'header-left', 'header-right', 'footer-left', 'footer-right'];
  function logoList(L, meta){
    const b = L.brand || {}, out = [];
    const add = (key, src, pos, h) => {
      if(!src || !LOGO_POS.includes(pos) || pos === 'none') return;
      let hh = Math.max(4, Math.min(30, Number(h) || 9)), w = hh * logoRatio(src);
      if(w > 70){ w = 70; hh = w / logoRatio(src); }
      out.push({ key, src, pos, h:+hh.toFixed(2), w:+w.toFixed(2) });
    };
    add('pr', meta.logo, b.projectLogoPos ?? 'header-left', b.projectLogoHeight);
    add('co', b.logo, b.logoPos, b.logoHeight);
    return out;
  }
  // kind: 'a3' has its own paper; everything else follows the Style tab
  function geo(L, meta, kind = 'book', orient = null){
    const size = kind === 'a3' ? (L.a3?.size || 'A3') : (L.page.size || 'A4');
    const want = orient || (kind === 'a3' ? L.a3?.orientation : L.page.orientation);
    const land = (want === 'auto' ? 'landscape' : want) === 'landscape';
    const [w, h] = PAGE_MM[size] || PAGE_MM.A4, pw = land ? h : w, ph = land ? w : h;
    const m = Math.max(5, Math.min(25, Number(L.page.margin) || 10));
    const logos = logoList(L, meta);
    const lh = pre => Math.max(0, ...logos.filter(x => x.pos.startsWith(pre)).map(x => x.h));
    const hdrOn = !!L.header.show || lh('header') > 0, ftrOn = !!L.footer.show || lh('footer') > 0;
    const hT = Math.max(4, m - 5), hH = hdrOn ? Math.max(6, lh('header')) : 0;
    const fB = Math.max(4, m - 5), fH = ftrOn ? Math.max(5, lh('footer')) : 0;
    const mt = hdrOn ? hT + hH + 5 : m, mb = ftrOn ? fB + fH + 5 : m;
    return { size, land, pw, ph, m, mt, mb, hT, hH, fB, fH, hdrOn, ftrOn, logos, bodyW:pw - 2 * m, bodyH:ph - mt - mb };
  }
  const contentBox = (L, meta = currentMeta()) => { const G = geo(L, meta); return { w:G.bodyW, h:G.bodyH }; };
  // the watermark as a picture (SVG, mm units) that sits in the content area of every sheet
  function watermarkUrl(L, meta, w, h){
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
    if(!inner) return '';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${inner}</svg>`)}`;
  }
  // The A3 sheets: 'auto' picks the orientation that makes the drawings the biggest (wide drawings lie, tall ones stand)
  function a3Orientation(L, meta, dcs, kind){
    const o = L.a3?.orientation || 'auto';
    if(o === 'landscape' || o === 'portrait') return o;
    const F = window.Flow; if(!F?.printSvg) return 'landscape';
    const rs = (kind === 'a3all' ? [F.printSvg(dcs, 'net')] : [F.printSvg(dcs[0], 'net'), F.printSvg(dcs[0], 'all')]).filter(Boolean);
    if(!rs.length) return 'landscape';
    const GL = geo(L, meta, 'a3', 'landscape'), GP = geo(L, meta, 'a3', 'portrait');
    const fit = G => rs.reduce((n, r) => n + Math.min(G.bodyW / r.w, (G.bodyH - 36) / r.h), 0);
    return fit(GP) > fit(GL) * 1.05 ? 'portrait' : 'landscape';
  }
  // what the content builders need to know about the sheet they are building for (set by renderDocument)
  let CTX = { G:null, meta:null, kind:'book' };
  const curG = () => CTX.G || geo(layoutFromSettings(getM()?.pdfSettings), currentMeta());

  // ===================== CSS of a document =====================
  // Everything is in mm; the sheet is as big as the paper, so the preview and the PDF can not differ.
  function docCss(L, G, meta, { preview = false } = {}){
    const compact = L.style.density === 'compact';
    const fs = Number(L.style.fontSize) || 9.5;
    const font = L.style.font === 'system' ? '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' : L.style.font === 'georgia' ? 'Georgia,"Times New Roman",serif' : 'Helvetica,Arial,sans-serif';
    const acc = hex(L.style.accent, '#ff8a1f');
    const gap = compact ? 1.6 : 2.6;
    // lijndikte en -kleur: licht (zoals vroeger), normaal (duidelijk op papier), dik (zwaar, voor op de vloer)
    const LW = { light:{ bw:.25, ln:'#e2e8f0', ln2:'#cbd5e1', ln3:'#94a3b8' }, normal:{ bw:.35, ln:'#94a3b8', ln2:'#64748b', ln3:'#334155' }, bold:{ bw:.55, ln:'#475569', ln2:'#1e293b', ln3:'#0f172a' } }[L.style.lineWeight] || { bw:.35, ln:'#94a3b8', ln2:'#64748b', ln3:'#334155' };
    const wm = watermarkUrl(L, meta, G.bodyW, G.bodyH);
    const logos = G.logos.map(x => `.lg-${x.key}{background-image:url("${x.src}")}`).join('');
    const frame = `
      @page{size:${G.size} ${G.land ? 'landscape' : 'portrait'};margin:0}
      html,body{margin:0;padding:0}
      .sheet{position:relative;width:${G.pw}mm;height:${(G.ph - .4).toFixed(2)}mm;overflow:hidden;background:#fff;page-break-after:always;break-after:page;contain:layout}
      .sheet:last-of-type{page-break-after:auto;break-after:auto}
      ${wm ? `.sheet:not(.cover-sheet)::before{content:"";position:absolute;left:${G.m}mm;right:${G.m}mm;top:${G.mt}mm;bottom:${G.mb}mm;background:url("${wm}") center/100% 100% no-repeat;pointer-events:none}` : ''}
      .sh-body{position:absolute;left:${G.m}mm;right:${G.m}mm;top:${G.mt}mm;bottom:${G.mb}mm;overflow:hidden}
      .cover-sheet .sh-body{top:${G.m}mm;bottom:${G.m}mm}
      .fill{display:flow-root}
      ${logos}
      .lg{display:inline-block;flex:none;background-repeat:no-repeat;background-position:center;background-size:contain}
      .sh-head{position:absolute;left:${G.m}mm;right:${G.m}mm;top:${G.hT}mm;height:${(G.hH + 1.5).toFixed(2)}mm;display:flex;align-items:center;gap:4mm;padding-bottom:1.5mm;border-bottom:var(--bw) solid var(--ln2)}
      .sh-head .hm{flex:1;min-width:0;text-align:center;font-size:${(fs * .88).toFixed(2)}px;font-weight:600;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.02em}
      .sh-head .hs{display:flex;align-items:center;gap:3mm;min-width:0;flex:none}
      .sh-head .hs.r{justify-content:flex-end}
      .sh-foot{position:absolute;left:${G.m}mm;right:${G.m}mm;bottom:${G.fB}mm;height:${(G.fH + 1.5).toFixed(2)}mm;display:flex;align-items:center;gap:4mm;padding-top:1.5mm;border-top:var(--bw) solid var(--ln2);font-size:${(fs * .82).toFixed(2)}px;color:#64748b}
      .sh-foot .fs{display:flex;align-items:center;gap:3mm;flex:1;min-width:0}
      .sh-foot .fs.r{justify-content:flex-end}
      .sh-foot .fm{flex:1.4;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sh-foot .fs span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sh-foot .pgl{font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums}
      .sh-foot .pgl i{font-style:normal}
    `;
    const screen = !preview ? '' : `
      html{background:#2a2e35}
      body{padding:18px 0 40px}
      .pv-wrap{position:relative;width:calc(var(--zoom,1) * ${G.pw}mm);height:calc(var(--zoom,1) * ${(G.ph - .4).toFixed(2)}mm);margin:0 auto 6px}
      .pv-wrap > .sheet{position:absolute;left:0;top:0;margin:0;transform:scale(var(--zoom,1));transform-origin:0 0;box-shadow:0 4px 18px rgba(0,0,0,.35)}
      .pv-label{width:calc(var(--zoom,1) * ${G.pw}mm);margin:22px auto 6px;font:600 10px/1 system-ui,sans-serif;color:#9aa3b2;letter-spacing:.04em}
      [data-sec]{cursor:pointer;outline-offset:1.5mm;border-radius:1.5mm}
      [data-sec]:hover{outline:1.5px dashed rgba(255,138,31,.55)}
      [data-sec].sel{outline:2px solid #ff8a1f}
      [data-sec].fixed{outline:1px dashed rgba(255,138,31,.45)}
      [data-sec].dragging{opacity:.75;outline:2px solid #ff8a1f}
      .cover .logo{cursor:move}
      .cover .logo:hover{outline:1.5px dashed rgba(255,138,31,.8);outline-offset:1.5mm}
      .sec-grip{position:absolute;left:-1mm;top:-1mm;transform:translate(-100%,0);width:5mm;height:5mm;border-radius:1mm;background:#ff8a1f;color:#fff;display:none;align-items:center;justify-content:center;cursor:move;font-size:9px;z-index:6;box-shadow:0 1px 3px rgba(0,0,0,.3)}
      [data-sec]:hover > .sec-grip,[data-sec].sel > .sec-grip{display:flex}
      .sheet.grid-bg .sh-body{background-image:linear-gradient(to right,rgba(15,23,42,.07) 1px,transparent 1px),linear-gradient(to bottom,rgba(15,23,42,.07) 1px,transparent 1px);background-size:${GRID_MM}mm ${GRID_MM}mm}
    `;
    return `
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      :root{--bw:${LW.bw}mm;--ln:${LW.ln};--ln2:${LW.ln2};--ln3:${LW.ln3}}
      body{margin:0;font:${fs}px/1.32 ${font};color:#0f172a;${L.style.grayscale?'filter:grayscale(1);':''}}
      ${frame}
      [data-sec]{position:relative}
      .sh-body > [data-sec].fixed{position:absolute;left:var(--x);top:var(--y);width:var(--w);z-index:3;margin:0}
      [data-sec].fixed .section{margin-bottom:0}
      h1,h2,h3,h4{margin:0}
      .cover{display:flex;flex-direction:column;height:100%;position:relative}
      .cover-bar{height:3mm;background:${acc};border-radius:1mm;margin-bottom:12mm;width:40mm}
      .cover-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm}
      .cover h1{font-size:${fs*3.8}px;line-height:1.05;letter-spacing:-.02em;font-weight:800;max-width:65%}
      .cover .subtitle{font-size:${fs*1.6}px;color:#475569;margin-top:4mm}
      .cover .logo{position:absolute;z-index:2;left:calc(var(--x) * 100%);top:calc(var(--y) * 100%);transform:translate(calc(var(--x) * -100%), calc(var(--y) * -100%))}
      .cover .logo img{object-fit:contain;display:block;width:var(--w);max-height:calc(var(--w) * .8);height:auto}
      .cover-meta{margin-top:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;border-top:var(--bw) solid var(--ln);padding-top:6mm}
      .cover-meta dt{font-size:${fs*.82}px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700}
      .cover-meta dd{margin:1mm 0 0;font-size:${fs*1.25}px;font-weight:600}
      .cover-totals{display:flex;gap:8mm;margin-top:10mm}
      .cover-totals div b{display:block;font-size:${fs*2.4}px;font-weight:800;color:${acc}}
      .cover-totals div span{font-size:${fs*.9}px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
      .cover-note{margin-top:8mm;padding:4mm 5mm;border-left:1mm solid ${acc};background:#f8fafc;white-space:pre-line;font-size:${fs*1.05}px}
      .cover-gen{margin-top:6mm;font-size:${fs*.8}px;color:#94a3b8}
      .doc-h2{font-size:${fs*1.9}px;font-weight:800;margin-bottom:4mm}
      .run-head{display:flex;justify-content:space-between;font-size:${fs*.8}px;color:#94a3b8;border-bottom:var(--bw) solid var(--ln);padding-bottom:1.5mm;margin-bottom:${compact?3:4}mm}
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
      .section > h3{font-size:${fs*1.15}px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:0 0 ${gap}mm;padding-bottom:1.2mm;border-bottom:var(--bw) solid var(--ln2);display:flex;justify-content:space-between;align-items:baseline}
      .section > h3 small{font-weight:600;text-transform:none;letter-spacing:0;color:#94a3b8;font-size:${fs*.85}px}
      .section > h3 .n{color:${acc};margin-right:2mm}
      .grid{display:grid;gap:${gap}mm}.cols2{grid-template-columns:1fr 1fr}.cols3{grid-template-columns:repeat(3,1fr)}
      .card{border:var(--bw) solid var(--ln2);border-radius:1.6mm;break-inside:avoid;overflow:hidden;margin-bottom:${gap}mm;background:#fff}
      .card-h{background:#f1f5f9;padding:${compact?1.2:1.8}mm 2.5mm;font-weight:800;display:flex;justify-content:space-between;align-items:center;gap:3mm}
      .card-h small{font-weight:600;color:#64748b}
      .card-b{padding:${compact?1.4:2.2}mm}
      table{width:100%;border-collapse:collapse}
      th,td{border-bottom:calc(var(--bw) * .8) solid var(--ln);padding:${compact?.7:1.1}mm 1.6mm;text-align:left;vertical-align:top}
      th{font-size:${fs*.8}px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700;border-bottom:var(--bw) solid var(--ln2)}
      td.num,th.num{text-align:right}
      tr{break-inside:avoid}
      .ports{display:grid;gap:${compact?.8:1.1}mm}
      .p4{grid-template-columns:repeat(4,1fr)}.p8{grid-template-columns:repeat(8,1fr)}.p12{grid-template-columns:repeat(12,1fr)}
      .port{border:var(--bw) solid var(--ln2);border-top:1mm solid var(--uni,#cbd5e1);border-radius:1mm;padding:${compact?.7:1}mm ${compact?.9:1.2}mm;min-height:${compact?9:12}mm;overflow:hidden;background:#fff}
      .port .nr{font-size:${fs*.75}px;color:#94a3b8;font-weight:700}
      .port .uni{font-size:${fs*1.08}px;font-weight:800;color:#0f172a}
      .port .dest,.port .src{font-size:${fs*.74}px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .port .src{color:#94a3b8}
      .port.empty{border-top-color:var(--ln);border-color:var(--ln);background:#f8fafc}.port.empty .uni{color:#cbd5e1;font-weight:600}
      .port.conflict{background:#fee2e2;border-color:#dc2626}
      .lkrow{display:grid;grid-template-columns:repeat(12,1fr);gap:${compact?.8:1.1}mm;margin-bottom:${compact?.8:1.2}mm}.lkrow .c1{min-width:0}
      .lkv{grid-column:span 4;border:var(--bw) dashed var(--oc,#94a3b8);border-radius:1mm;padding:1mm 1.6mm;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;background:color-mix(in srgb,var(--oc,#94a3b8) 12%,#fff);font-size:${fs*1.05}px}.lkv small{font-weight:600;color:#64748b;font-size:${fs*.74}px}
      .vb{grid-column:span 4;min-width:0;border:var(--bw) solid var(--oc,#94a3b8);border-top:1.4mm solid var(--oc,#94a3b8);border-radius:1.2mm;padding:1.2mm 1.4mm;background:color-mix(in srgb,var(--oc,#94a3b8) 7%,#fff)}
      .vb h4{font-size:${fs*.88}px;margin:0 0 1mm;display:flex;justify-content:space-between}.vb h4 small{color:#64748b;font-weight:600}
      .vb.none{border-style:dashed;border-color:var(--ln2);background:transparent;color:#94a3b8;display:flex;align-items:center;justify-content:center;text-align:center;font-size:${fs*.8}px}.vb.gap{border:0;background:transparent}
      .np{font-size:${fs*.78}px;font-weight:700;color:#0f172a;background:#eef2ff;border-radius:.8mm;padding:0 .8mm;margin:.4mm 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.np.none{background:#fee2e2;color:#b91c1c}.np i{font-weight:500;color:#64748b;font-style:normal}
      .lkrow .port .dest,.vb .port .dest{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.15}
      .lk-groups{display:grid;grid-template-columns:repeat(3,1fr);gap:${gap}mm}
      .lk-group{border:var(--bw) solid var(--ln);border-radius:1.2mm;padding:${compact?1:1.6}mm}
      .tint .g1{background:#eff6ff}.tint .g2{background:#fff7ed}.tint .g3{background:#f0fdf4}
      .lk-group h4{font-size:${fs*.88}px;margin:0 0 1.2mm;display:flex;justify-content:space-between}
      .lk-group h4 small{color:#16a34a;font-weight:700}
      .lk-group h4 small.none{color:#94a3b8;font-weight:600}
      .node .port{border-radius:6mm;text-align:center;border-top-width:.35mm;border-color:var(--uni,#cbd5e1);border-width:.6mm}
      .placeholder{border:var(--bw) dashed var(--ln2);border-radius:1.6mm;padding:3mm;color:#94a3b8;text-align:center}
      .tag{display:inline-block;padding:.3mm 1.6mm;border-radius:1mm;font-size:${fs*.78}px;font-weight:700;background:#f1f5f9;color:#475569}
      .tag.red{background:#fee2e2;color:#b91c1c}.tag.yellow{background:#fef3c7;color:#b45309}.tag.green{background:#dcfce7;color:#15803d}
      .dot{display:inline-block;width:2mm;height:2mm;border-radius:50%;margin-right:1.2mm;vertical-align:middle}
      .notes{white-space:pre-line;border-left:1mm solid ${acc};padding:2mm 4mm;background:#f8fafc}
      .small{font-size:${fs*.8}px;color:#64748b}
      .rk-tbl td{vertical-align:middle}
      .rk-u{width:12mm;color:#64748b;font-weight:700}
      .rk-ports{line-height:1.9}
      .rk-p{display:inline-block;min-width:6mm;text-align:center;padding:0 1.2mm;margin:0 .6mm .4mm 0;border-radius:3mm;border:var(--bw) solid var(--c,#94a3b8);font-size:${fs*.78}px;font-weight:700;color:#0f172a;background:color-mix(in srgb,var(--c,#94a3b8) 12%,#fff)}
      .rk-p.free{border-style:dashed;color:#94a3b8;background:#fff;font-weight:500}
      .rk-tag{display:inline-block;padding:0 1.4mm;margin-right:1.5mm;border-radius:1mm;background:var(--c,#e2e8f0);color:#0f172a;font-size:${fs*.8}px}
      .rk-advice{display:flex;flex-direction:column;gap:1mm;margin-bottom:${gap}mm}
      .rk-advice div{padding:1.2mm 2.5mm;border-radius:1mm;background:#f1f5f9;font-size:${fs*.9}px}
      .rk-advice .warn{background:#fef3c7;color:#92400e}.rk-advice .ok{background:#dcfce7;color:#166534}
      /* rack-tekening: zoals in de app, met dikke contouren voor op papier */
      .prk-row{display:flex;flex-wrap:wrap;gap:${gap}mm;align-items:flex-start}
      .prk-card{flex:1 1 120mm;max-width:100%;margin-bottom:0}
      .prk{display:grid;grid-template-columns:6mm minmax(0,1fr) 6mm;border:.9mm solid #0f172a;border-radius:1mm;background:#fff}
      .prk-rail{display:grid;grid-template-rows:repeat(var(--h),var(--uh));background:#e2e8f0}
      .prk-rail:first-child{border-right:.35mm solid #475569}.prk-rail:last-child{border-left:.35mm solid #475569}
      .prk-rail span{display:flex;align-items:center;justify-content:center;font-size:${fs*.68}px;font-weight:700;color:#1e293b;border-bottom:.2mm solid #cbd5e1}
      .prk-bay{display:grid;grid-template-rows:repeat(var(--h),var(--uh));grid-template-columns:minmax(0,1fr);position:relative}
      .prk-slot{grid-column:1;border-bottom:.25mm dashed #94a3b8}
      .prk-it{grid-column:1;position:relative;z-index:1;padding:.35mm .6mm;min-width:0}
      .pru{height:100%;display:flex;align-items:center;gap:1.5mm;border:.5mm solid #0f172a;border-left:1.8mm solid var(--c,#475569);border-radius:.8mm;background:#fff;padding:0 1.5mm;overflow:hidden}
      .qrgrid{display:flex;flex-wrap:wrap;gap:6mm}.qrf{margin:0;width:48mm;text-align:center}.qrb{width:48mm;height:48mm;border:.3mm solid #cbd5e1}.qrf figcaption{font-size:${fs*.8}px;margin-top:1mm}
      .pru-label{width:30mm;flex:none;line-height:1.12;overflow:hidden}
      .pru-label b{display:flex;align-items:center;gap:.6mm;font-size:${fs*.84}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pru-label span{display:block;font-size:${fs*.66}px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pru-ports{flex:1;display:flex;gap:1mm;align-items:center;min-width:0;overflow:hidden;flex-wrap:nowrap}
      .pp-grp{display:flex;gap:.6mm;align-items:center;flex:0 1 auto;min-width:0}
      .pp-grp+.pp-grp{margin-left:.4mm;padding-left:1mm;border-left:.3mm solid #94a3b8}
      .pp{--ps:calc(var(--uh) * .64);width:var(--ps);height:var(--ps);flex:0 1 var(--ps);min-width:1.6mm;border-radius:50%;border:.45mm solid var(--c,#475569);display:flex;align-items:center;justify-content:center;font-size:${fs*.6}px;font-weight:700;color:#0f172a;background:color-mix(in srgb,var(--c,#94a3b8) 18%,#fff);overflow:hidden;white-space:nowrap}
      .pp.free{border-style:dashed;border-color:#94a3b8;color:#94a3b8;background:#fff;font-weight:500}
      .pp.lk{--ps:calc(var(--uh) * .82);border-width:.75mm}
      .pp.vim{--ps:calc(var(--uh) * .72);border-style:double;border-width:.95mm}
      .pp.in{border-color:#2563eb}
      .pp.rj,.pp.sfp{border-radius:.5mm;border-width:.3mm;border-color:#475569;background:#f1f5f9;--ps:calc(var(--uh) * .55)}
      .pp.sfp{width:calc(var(--ps) * 1.4);flex-basis:calc(var(--ps) * 1.4)}
      .pru-special{padding:0;display:block;background:#10131a}.pru-special .gc20t{display:block;width:100%;height:100%}
      .prk-half{width:50%}.prk-R{justify-self:end}.prk-L{justify-self:start}
      .prk-tag{display:inline-block;font-size:${fs*.68}px;font-weight:800;padding:0 .9mm;border-radius:.6mm;background:var(--c,#475569);color:#fff;line-height:1.5}
      /* signaalstroom-tekening */
      .pflow-page{break-before:page;page-break-before:always}
      .pflow{border:var(--bw) solid var(--ln2);border-radius:1.6mm;padding:2mm;background:#fff;break-inside:avoid}
      .pflow svg{display:block;width:100%;height:auto;max-height:${Math.max(60, G.bodyH - 36)}mm}
      .pflow-sub{font-weight:800;font-size:${fs*.95}px;text-transform:uppercase;letter-spacing:.05em;margin:4mm 0 1.5mm;color:#334155}
      .pflow-legend{display:flex;flex-wrap:wrap;gap:5mm;margin-top:1.5mm;font-size:${fs*.8}px;color:#475569}
      .pflow-legend span{display:inline-flex;align-items:center;gap:1.2mm}
      .pflow-legend i{display:inline-block;width:8mm;background:#334155;border-radius:.4mm}
      /* nodepoorten: welke LK-/Veam-poort op welke nodepoort */
      .pnp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${gap}mm;margin-top:${gap}mm}
      .pnp-node{border:.4mm solid #0f172a;border-left:1.8mm solid var(--c);border-radius:1mm;padding:1.4mm 2mm;break-inside:avoid;background:#fff}
      .pnp-head{display:flex;align-items:center;gap:1.5mm;margin-bottom:1.2mm;font-size:${fs*.9}px}
      .pnp-head small{color:#64748b;margin-left:auto}
      .pnp-strip{display:flex;flex-wrap:wrap;gap:.9mm}
      .pnp{display:flex;flex-direction:column;align-items:center;min-width:13mm;padding:.6mm 1mm;border:.4mm solid var(--c,#94a3b8);border-radius:1mm;line-height:1.15;background:color-mix(in srgb,var(--c,#94a3b8) 10%,#fff)}
      .pnp b{font-size:${fs*.62}px;color:#64748b}
      .pnp em{font-style:normal;font-weight:800;font-size:${fs*.95}px}
      .pnp span{font-size:${fs*.7}px;color:#1e293b;white-space:nowrap}
      .pnp i{font-style:normal;font-size:${fs*.62}px;color:#64748b;white-space:nowrap;max-width:22mm;overflow:hidden;text-overflow:ellipsis}
      .pnp.free{border-style:dashed;background:#fff;color:#94a3b8}.pnp.free span,.pnp.free em{color:#94a3b8}
      /* quiet table rows, what continues on the next sheet */
      tbody tr:nth-child(even) > td{background:#f8fafc}
      .card tbody tr:nth-child(even) > td{background:#f8fafc}
      .cont{font-size:${fs*.82}px;color:#94a3b8;margin:0 0 ${gap}mm;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
      /* pieces that are never cut across two sheets (when they fit on one) */
      .ports,.lkrow,.pnp-strip,.prk,.cover-meta,.cover-totals,.rk-advice,.notes,.db-head,.pflow-legend,.qrgrid,.stat,.ipv-vlans{break-inside:avoid}
      .pflow-sub{break-after:avoid}
      /* contents */
      .toc{max-width:100%}
      .toc-h{font-size:${fs*2.2}px;font-weight:800;letter-spacing:-.01em;margin:0 0 6mm;padding-bottom:2mm;border-bottom:.6mm solid ${acc}}
      .toc-row{display:flex;align-items:baseline;gap:2mm;padding:${compact?.6:1}mm 0;font-size:${fs*1.02}px;break-inside:avoid}
      .toc-row .t{flex:none;max-width:78%}
      .toc-row .dots{flex:1;border-bottom:.3mm dotted #94a3b8;transform:translateY(-.7mm);min-width:6mm}
      .toc-row .pg{flex:none;min-width:8mm;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
      .toc-row.l1{margin-top:3mm;font-weight:800;font-size:${fs*1.15}px;border-top:.3mm solid var(--ln)}
      .toc-row.l1 .dot{display:inline-block;width:3mm;height:3mm;border-radius:.8mm;margin-right:2mm;background:var(--db,${acc})}
      .toc-row.l2{padding-left:6mm;color:#334155}
      /* the cover: the company logo at the bottom */
      .cover-co{display:block;margin-top:5mm;max-width:60mm;max-height:16mm;object-fit:contain}
      .cover-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:8mm}
      /* the IP address book */
      .ipv-vlans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${gap}mm}
      .ipv-vlan{display:flex;align-items:center;gap:2.5mm;border:var(--bw) solid var(--ln2);border-radius:1.4mm;padding:1.6mm 2.4mm;border-left:2mm solid var(--c,#94a3b8);break-inside:avoid}
      .ipv-vlan b{font-size:${fs*1.05}px}.ipv-vlan span{color:#64748b;font-size:${fs*.9}px}.ipv-vlan em{margin-left:auto;font-style:normal;font-weight:800;font-variant-numeric:tabular-nums}
      .ip-tbl td.ip,.ip-tbl td.mono{font-family:Menlo,Consolas,"DejaVu Sans Mono",monospace;font-size:${fs*.95}px;white-space:nowrap}
      .ip-tbl td.dup,.ip-tbl td.dup b{color:#b91c1c}
      .ip-tbl .vl{display:inline-block;width:2mm;height:2mm;border-radius:.5mm;margin-right:1.2mm;vertical-align:middle;background:var(--c,#94a3b8)}
      .ip-tbl tr.cont-row > td{border-top:0}
      .ip-tbl td.sub{color:#64748b;font-size:${fs*.88}px}
      /* the A3 sheets */
      .a3p{break-inside:avoid}
      .a3p .pflow{padding:1.5mm;display:flex;align-items:center;justify-content:center}
      .a3p .pflow svg{max-width:100%}
      .a3-title{display:flex;justify-content:space-between;align-items:flex-end;margin:0 0 3mm;padding-bottom:2mm;border-bottom:.6mm solid var(--db,${acc})}
      .a3-title b{font-size:${fs*2}px;font-weight:800;letter-spacing:-.01em}.a3-title span{color:#64748b;font-size:${fs*1.05}px}
      ${screen}`;
  }

  // ===================== Sheets =====================
  // one sheet with its head (logos of the project and the company, the running text) and foot (texts, page numbers)
  function makeSheet(doc, L, meta, G, ctx){
    const s = doc.createElement('section');
    s.className = `sheet${ctx.cover ? ' cover-sheet' : ''}`;
    s.setAttribute('data-label', ctx.label || '');
    const slot = pos => G.logos.filter(x => x.pos === pos).map(x => `<span class="lg lg-${x.key}" style="width:${x.w}mm;height:${x.h}mm"></span>`).join('');
    const dc = ctx.dc || '';
    const run = [tokens(L.header.text, meta, dc), ctx.docName].filter(Boolean).join(' — ');
    const head = ctx.cover || !G.hdrOn ? '' : `<div class="sh-head"><div class="hs l">${slot('header-left')}</div><div class="hm">${L.header.show ? esc(run) : ''}</div><div class="hs r">${slot('header-right')}</div></div>`;
    const pn = L.footer.pageNumbers ? '<span class="pgl">Page <i class="pn"></i> of <i class="pt"></i></span>' : '';
    const foot = ctx.cover || !G.ftrOn ? '' : `<div class="sh-foot"><div class="fs l">${slot('footer-left')}<span>${L.footer.show ? esc(tokens(L.footer.left, meta, dc)) : ''}</span></div><div class="fm">${L.footer.show ? esc(tokens(L.footer.center, meta, dc)) : ''}</div><div class="fs r">${L.footer.show ? pn : ''}${slot('footer-right')}</div></div>`;
    s.innerHTML = `${head}<div class="sh-body"></div>${foot}`;
    doc.body.appendChild(s);
    return { sheet:s, body:s.querySelector('.sh-body') };
  }

  // ===================== Cover, summary, contents =====================
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
      f.dimcities && ['DimCities', dcs.map(dcName).join(', ')]
    ].filter(x => x && x[1]);
    let totals = '';
    if(f.totals){
      const lk = listFromMap(M.byLK).filter(x=>dcs.includes(x.dimcity)).length;
      const ve = listFromMap(M.byVeam).filter(x=>dcs.includes(x.dimcity)).length;
      const unis = new Set(); let pts = 0;
      for(const dc of dcs){ for(const [u, x] of universeOverview(M, dc)){ unis.add(u); pts += x.lk + x.veam + x.dmx; } }
      totals = `<div class="cover-totals"><div><b>${dcs.length}</b><span>DimCities</span></div><div><b>${lk}</b><span>LK blocks</span></div><div><b>${ve}</b><span>Veams</span></div><div><b>${unis.size}</b><span>Universes</span></div><div><b>${pts}</b><span>Patch points</span></div></div>`;
    }
    return `<div class="cover" data-sec="cover"><div class="cover-bar"></div>
      <div class="cover-top"><div><h1>${title}</h1>${sub?`<div class="subtitle">${sub}</div>`:''}${totals}</div></div>${logo}
      ${c.note ? `<div class="cover-note">${esc(c.note)}</div>` : ''}
      ${items.length ? `<dl class="cover-meta">${items.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '<div style="margin-top:auto"></div>'}
      <div class="cover-foot"><div class="cover-gen">Generated with DimCity PatchLab · ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>${L.brand?.logo ? `<img class="cover-co" src="${L.brand.logo}" alt="">` : ''}</div></div>`;
  }
  function buildProjectSummary(M, dcs){
    const rows = dcs.map(dc=>{
      const d = M.byDim?.get?.(dc) || { lks:new Set(), veams:new Set() };
      const u = universeOverview(M, dc);
      const pts = u.reduce((n,[,x])=>n+x.lk+x.veam+x.dmx,0);
      const iss = (M.issues||[]).filter(i=>i.dimcity===dc);
      const e = iss.filter(i=>i.severity==='RED').length, w = iss.length - e;
      return `<tr><td><span class="dot" style="background:${dcColor(M,dc)}"></span><b>${esc(dcName(dc))}</b></td><td class="num">${d.lks?.size||0}</td><td class="num">${d.veams?.size||0}</td><td class="num">${u.length}</td><td class="num">${pts}</td><td class="num">${plan(M,dc).nodes?.length||0}</td><td class="num">${plan(M,dc).splitters?.length||0}</td><td>${e?`<span class="tag red">${e} error${e>1?'s':''}</span> `:''}${w?`<span class="tag yellow">${w} warning${w>1?'s':''}</span>`:''}${!e&&!w?'<span class="tag green">OK</span>':''}</td></tr>`;
    }).join('');
    return `<div class="section" data-sec="cover"><h2 class="doc-h2">Project summary</h2>
      <table><thead><tr><th>DimCity</th><th class="num">LK</th><th class="num">Veam</th><th class="num">Universes</th><th class="num">Patch points</th><th class="num">Nodes</th><th class="num">Splitters</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const tocHtml = entries => `<div class="toc"><h2 class="toc-h">Contents</h2>${entries.map((e, i) => `<div class="toc-row l${e.level}"${e.color ? ` style="--db:${esc(e.color)}"` : ''}><span class="t">${e.level === 1 && e.color ? '<i class="dot"></i>' : ''}${esc(e.title)}</span><span class="dots"></span><span class="pg" data-toc="${i}">00</span></div>`).join('')}</div>`;

  // Sectie-wrapper: automatisch in de stroom, of vast op x/y (mm) met een breedte (op het eerste blad van de DimCity).
  function secWrap(s, html, db){
    if(!html) return '';
    const p = normPos(s.pos);
    const st = [db ? `--db:${db}` : '', p ? `--x:${p.x}mm;--y:${p.y}mm;--w:${p.w}mm` : ''].filter(Boolean).join(';');
    return `<div data-sec="${s.key}" class="${p ? 'fixed' : ''}"${st ? ` style="${st}"` : ''}>${html}</div>`;
  }

  // QR codes with the whole DB (and, on the first DB, the whole system) as plain text, in numbered parts
  function buildQr(M, dc, L, n, o){
    const Q = window.QrInfo; if(!Q) return '';
    const sets = [{ name:dc, text:Q.dbText(dc) }];
    if(o.system !== false && App().sortedDims()[0] === dc) sets.push({ name:'System', text:Q.sysText() });
    const cells = sets.flatMap(st => Q.parts(st.name, st.text, 700).map((p, i, a) => `<figure class="qrf"><div class="qrb">${Q.svg(p)}</div><figcaption><b>${esc(st.name)}</b>${a.length > 1 ? ` ${i + 1}/${a.length}` : ''}</figcaption></figure>`));
    if(!cells.length) return '';
    return `<div class="section">${h3(n, 'QR codes', 'scan to read the whole DB')}<div class="qrgrid">${cells.join('')}</div></div>`;
  }

  const h3 = (n, title, small='') => `<h3><span><span class="n">${n}</span>${esc(title)}</span>${small?`<small>${small}</small>`:''}</h3>`;

  function buildDbHeader(M, meta, dc, L){
    const dim = M.byDim?.get?.(dc) || { lks:new Set(), veams:new Set() };
    const u = universeOverview(M, dc);
    const pts = u.reduce((n,[,x])=>n+x.lk+x.veam+x.dmx,0);
    const iss = (M.issues||[]).filter(i=>i.dimcity===dc);
    const e = iss.filter(i=>i.severity==='RED').length, w = iss.length - e;
    const sub = [meta.project, meta.area, meta.location].filter(Boolean).map(esc).join(' · ');
    return `<div class="db-head ${L.style.dimBand?'band':''}"><div><h2 class="db-title">${L.style.dimBand?'<i></i>':''}${esc(window.DimLabel ? window.DimLabel(dc) : dc)}</h2>${sub?`<div class="db-sub">${sub}</div>`:''}</div>
      <div class="stats"><div class="stat"><b>${dim.lks?.size||0}</b><span>LK</span></div><div class="stat"><b>${dim.veams?.size||0}</b><span>Veam</span></div><div class="stat"><b>${u.length}</b><span>Universes</span></div><div class="stat"><b>${pts}</b><span>Patch pts</span></div>${e?`<div class="stat err"><b>${e}</b><span>Errors</span></div>`:''}${w?`<div class="stat warn"><b>${w}</b><span>Warnings</span></div>`:''}</div></div>`;
  }
  function buildUniverseTable(M, dc, L){
    const rows = universeOverview(M, dc).map(([u,x])=>`<tr><td><span class="dot" style="background:${uniColor(u,L)}"></span><b>UNI ${esc(u)}</b></td><td class="num">${x.lk}</td><td class="num">${x.veam}</td><td class="num">${x.dmx}</td><td class="num"><b>${x.lk+x.veam+x.dmx}</b></td></tr>`).join('');
    return `<table><thead><tr><th>Universe</th><th class="num">LK</th><th class="num">Veam</th><th class="num">DMX</th><th class="num">Total</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="small">No universes</td></tr>'}</tbody></table>`;
  }
  function buildNetwork(M, dc, L, n, o){
    const p = plan(M, dc), nodes = p.nodes || [], switches = p.switches || [];
    const nodeHtml = nodes.length ? '<div class="grid cols2">' + nodes.map(nd=>{
      const ports = (Array.isArray(nd.universes) ? nd.universes : []).map((u,i)=>`<div class="port ${u?'':'empty'}" style="--uni:${u?uniColor(u,L):'#cbd5e1'}"><div class="nr">${i+1}</div><div class="uni">${u?'U'+esc(u):'—'}</div></div>`).join('');
      const nt = (M.networkDevices?.nodeTypes || []).find(t => t.id === nd.typeId) || {};
      const eth = Math.min(2, Math.max(1, Number(nt.ethernetCount) || 1));
      const F = window.Fent, more = o.addresses !== false && F && (nd.ifaces || []).length ? F.ifaces(nd, eth).filter(x => !x.primary && x.ip) : [];
      const vname = v => { const x = F?.vlanById(v); return x ? ` ${x.name} ${x.id}` : ''; };
      const first = F && nd.ip && o.addresses !== false ? F.classify(nd.ip)?.vlan : null;
      const addr = more.length ? `<div class="small" style="margin-bottom:1.2mm">${first ? `<b>${esc(nd.ip)}</b>${esc(' ' + first.name + ' ' + first.id)}` : esc(nd.ip || '')}${more.map(x => ` · <b>${esc(x.ip)}</b>${esc(vname(x.vlan))}${eth > 1 ? ' ETH' + x.eth : ''}`).join('')}</div>` : '';
      return `<div class="card node"><div class="card-h"><span>${esc(nd.id || 'Node')}</span><small>${esc(nd.ip || '')}${nd.subnet?' / '+esc(nd.subnet):''}${eth > 1 ? ' · 2× RJ45' : ''}</small></div><div class="card-b"><div class="small" style="margin-bottom:1.2mm">${esc(nd.name || '')}</div>${addr}<div class="ports p8">${ports || '<span class="small">No ports</span>'}</div></div></div>`;
    }).join('') + '</div>' : '<div class="placeholder">No nodes planned for this DimCity.</div>';
    const consoles = (p.consoles || []).map(c => { const F = window.Fent, eth = c.ethCount === 2 ? 2 : 1, ifs = F ? F.ifaces(c, eth).filter(x => x.ip) : [];
      return `<div class="card"><div class="card-h"><span>${esc(c.name || c.id || 'Console')}</span><small>${esc(c.id || '')}${eth > 1 ? ' · 2× RJ45' : ''}</small></div>${ifs.length ? `<div class="card-b small">${ifs.map(x => `<b>${esc(x.ip)}</b>${F?.vlanById(x.vlan) ? esc(' ' + F.vlanById(x.vlan).name + ' ' + x.vlan) : ''}`).join(' · ')}</div>` : ''}</div>`; }).join('');
    const sw = o.switches ? (switches.length ? switches.map(s=>`<div class="card"><div class="card-h"><span>${esc(s.id||'Switch')}</span><small>${esc(s.ip||'')}</small></div></div>`).join('') : '<div class="placeholder">Network switches will appear here.</div>') : '';
    const pp = o.addresses !== false ? window.FentUI?.portPlan?.(dc)?.rows || [] : [];
    const portCard = pp.length ? `<div class="card"><div class="card-h"><span>Switch ports &amp; VLAN</span><small>${pp.length} ports</small></div><div class="card-b"><table><thead><tr><th>Port</th><th>Device</th><th>Mode</th><th>VLAN</th><th>Address / location</th></tr></thead><tbody>${pp.map(r => `<tr><td><b>${r.sw ? esc(r.sw) + ' · ' + r.swPort : '—'}</b></td><td>${esc(r.device)}${r.ethCount > 1 ? ' ETH' + r.eth : ''}</td><td>${r.mode === 'trunk' ? 'Trunk (tagged)' : 'Access'}</td><td>${r.vlans.map(v => { const x = window.Fent?.vlanById(v); return x ? `<span class="tag" style="${x.color ? `border-left:2mm solid ${x.color}` : ''}">${esc(x.id + ' ' + x.name)}</span>` : esc(v); }).join(' ')}</td><td>${r.cable ? esc(r.dest) : r.ips.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    const fl = o.addresses !== false ? (window.Fibers?.links?.(dc) || []) : [];
    const fiberCard = fl.length ? `<div class="card"><div class="card-h"><span>Fibre links</span><small>${fl.length}</small></div><div class="card-b"><table><thead><tr><th>ID</th><th>Cable</th><th>A</th><th>B</th></tr></thead><tbody>${fl.map(l => { const ty = window.Fibers.typeOf(l.typeId); return `<tr><td><b style="border-left:2mm solid ${window.Fibers.color(l)};padding-left:1mm">${esc(l.id)}</b></td><td>${esc(window.Fibers.typeName(ty))}<br><span class="small">${ty ? esc(`${ty.medium === 'smf' ? 'Singlemode' : ty.medium === 'mmf' ? 'Multimode' : ty.medium === 'dac' ? 'SFP patch' : 'Cat'} · ${ty.cores}-core · ${ty.connA || ''} · ${ty.lengthM} m`) : ''}</span></td><td>${esc(window.Fibers.endLabel(l.a))}</td><td>${esc(window.Fibers.endLabel(l.b))}</td></tr>`; }).join('')}</tbody></table></div></div>` : '';
    const right = portCard + fiberCard + (o.universeTable !== false ? `<div class="card"><div class="card-h"><span>Universe overview</span><small>physical patch points</small></div><div class="card-b">${buildUniverseTable(M, dc, L)}</div></div>` : '') + sw;
    if(!nodes.length && !consoles && !right.trim()) return '';
    return `<div class="section">${h3(n, 'Network / DMX nodes', `${nodes.length} node${nodes.length===1?'':'s'}`)}${nodeHtml}${consoles ? `<div class="small" data-keepnext="1" style="margin:2mm 0 1.5mm"><b>Consoles and other network devices</b></div><div class="grid cols2">${consoles}</div>` : ''}${right}</div>`;
  }
  // ---- the switches: a drawing of the ports in the VLAN colours and a table of what hangs on them ----
  function buildSwitches(M, dc, L, n, o){
    const NS = window.NetSwitches, PP = window.PortPlan, F = window.Fent;
    const sws = NS && PP ? NS.list(dc) : [];
    if(!sws.length) return '';
    const rows = window.FentUI.portPlan(dc).rows, fibres = window.Fibers?.links?.(dc) || [];
    const vl = id => F?.vlanById(id), vtxt = id => { const v = vl(id); return v ? `${v.id} ${v.name}` : (id != null ? String(id) : ''); };
    const vcell = p => p.trunk ? '<b style="border-left:2mm solid #38bdf8;padding-left:1.2mm">Trunk</b>' : p.vid != null ? `<span style="border-left:2mm solid ${esc(vl(p.vid)?.color || '#cbd5e1')};padding-left:1.2mm">${esc(vtxt(p.vid))}</span>` : '';
    const per = sws.map(s => {
      const ports = PP.swPorts(dc, s), mine = rows.filter(r => r.sw === s.label), by = new Map(mine.map(r => [r.swPort, r]));
      const fib = window.Fibers ? window.Fibers.usage(dc, s.label) : new Map();
      const used = ports.filter(p => by.has(p.n) || p.link || p.manualName || p.manualVlan || p.manualExtra || (p.kind === 'sfp' && fib.size && fib.has(ports.filter(x => x.kind === 'sfp').indexOf(p) + 1)));   // the drawing shows every port, the table the ports in use
      const vids = [...new Set(ports.filter(p => !p.trunk && p.vid != null).map(p => p.vid))].sort((a, b) => a - b);
      const mgmt = s.dev?.ip && F ? F.classify(s.dev.ip)?.vlan : null;
      const name = p => (o.names === false ? (by.get(p.n)?.device || '') : (p.name || ''));
      const tiles = ports.map(p => { const v = p.vid != null ? vl(p.vid) : null, col = p.trunk ? '#38bdf8' : (v?.color || '#cbd5e1'), r = by.get(p.n);
        return `<div class="port ${r || p.vid != null || p.trunk ? '' : 'empty'}" style="--uni:${esc(col)}"><div class="nr">${p.kind === 'sfp' ? 'SFP ' : ''}${p.n}</div><div class="uni">${p.trunk ? 'T' : p.vid != null ? esc(p.vid) : '—'}</div><div class="dest">${esc(name(p))}</div></div>`; }).join('');
      const trs = used.map(p => { const r = by.get(p.n), sfpNo = p.kind === 'sfp' ? ports.filter(x => x.kind === 'sfp').indexOf(p) + 1 : 0, f = sfpNo ? fib.get(sfpNo) : null;
        const what = r ? esc(r.device) + (r.ethCount > 1 && !r.cable ? ` <span class="small">ETH${r.eth}</span>` : '') + (r.typeName ? ` <span class="small">${esc(r.typeName)}</span>` : '') : p.link ? `Switch link → ${esc(p.link.to.sw)} port ${p.link.to.port} (trunk)` : f ? `Fibre ${esc(f.id)} → ${esc(window.Fibers.endLabel(f.a?.dc === dc && f.a?.sw === s.label && Number(f.a?.sfp) === sfpNo ? f.b : f.a))}` : '';
        return `<tr><td><b>${p.kind === 'sfp' ? 'SFP ' : ''}${p.n}</b></td><td>${what}</td><td>${esc(o.names === false ? '' : (p.manualName ? p.name : ''))}</td><td>${vcell(p)}</td><td>${p.trunk || r?.mode === 'trunk' ? 'Trunk' : p.vid != null || r ? 'Access' : ''}</td><td>${p.poe ? (p.poe === 'on' ? 'PoE on' : 'PoE off') : ''}</td><td>${esc(p.speed || '')}</td><td>${esc(r?.unis || '')}</td><td>${esc(r ? ((r.ips || []).join(' · ') || r.dest || '') : '')}</td></tr>`; }).join('');
      return { s, vids, mgmt, used: used.length, html:`<div class="card"><div class="card-h"><span>${esc(s.label)}</span><small>${esc(NS.typeName(s.type))} · ${esc(s.dev?.ip || '')}${mgmt ? ' · ' + esc(vtxt(mgmt.id)) : ''}</small></div><div class="card-b">
        <div class="ports p8" style="margin-bottom:2mm">${tiles}</div>
        ${vids.length ? `<div class="small" style="margin-bottom:2mm">${vids.map(id => `<span style="border-left:2mm solid ${esc(vl(id)?.color || '#cbd5e1')};padding-left:1.2mm;margin-right:3mm">${esc(vtxt(id))}</span>`).join('')}<span style="border-left:2mm solid #38bdf8;padding-left:1.2mm">Trunk</span></div>` : ''}
        <table><thead><tr><th>Port</th><th>Device / cable</th><th>Name</th><th>VLAN</th><th>Mode</th><th>PoE</th><th>Speed</th><th>Universes</th><th>Address / location</th></tr></thead><tbody>${trs || '<tr><td colspan="9" class="small">No ports in use.</td></tr>'}</tbody></table></div></div>` };
    });
    const overview = o.overview === false ? '' : `<div class="card"><div class="card-h"><span>Switch overview</span><small>${sws.length} switch${sws.length === 1 ? '' : 'es'} · ${fibres.length} fibre link${fibres.length === 1 ? '' : 's'}</small></div><div class="card-b"><table><thead><tr><th>Switch</th><th>Type</th><th>IP address</th><th class="num">Ports in use</th><th>VLANs</th></tr></thead><tbody>${per.map(x => `<tr><td><b>${esc(x.s.label)}</b></td><td>${esc(NS.typeName(x.s.type))}</td><td>${esc(x.s.dev?.ip || '')}</td><td class="num">${x.used} / ${x.s.rj + x.s.sfp}</td><td>${x.vids.map(id => esc(vtxt(id))).join(', ')}</td></tr>`).join('')}</tbody></table>
      ${fibres.length ? `<table style="margin-top:2mm"><thead><tr><th>Fibre</th><th>Cable</th><th>A</th><th>B</th></tr></thead><tbody>${fibres.map(l => `<tr><td><b>${esc(l.id)}</b></td><td>${esc(window.Fibers.typeName(window.Fibers.typeOf(l.typeId)))}</td><td>${esc(window.Fibers.endLabel(l.a))}</td><td>${esc(window.Fibers.endLabel(l.b))}</td></tr>`).join('')}</tbody></table>` : ''}</div></div>`;
    // the plug list: where every node and cable goes (switch port, and the network port of the rack panel the node sits behind)
    const nctx = window.NetNodes ? window.NetNodes.ctx(dc) : null;
    const plug = o.plugList === false || !rows.length ? '' : `<div class="card"><div class="card-h"><span>Plug list</span><small>${rows.filter(r => r.sw).length}/${rows.length} on a port</small></div><div class="card-b"><table><thead><tr><th>Device / cable</th><th>Type</th><th>Switch</th><th>Port</th><th>Panel port</th><th>VLAN</th><th>Address / location</th></tr></thead><tbody>${rows.map(r => {
      const pl = r.kind === 'node' && nctx ? nctx.panelOf(r.idx) : null, v = r.vlans?.[0] != null ? vl(r.vlans[0]) : null;
      return `<tr><td><b>${esc(r.device)}</b>${r.ethCount > 1 && !r.cable ? ` <span class="small">ETH${r.eth}</span>` : ''}</td><td>${esc(r.typeName || '')}</td><td>${r.sw ? esc(r.sw) : '<span class="small">no port yet</span>'}</td><td>${r.swPort || ''}</td><td>${pl ? `${esc(pl.panel)} · etherCON ${pl.no}` : ''}</td><td>${r.mode === 'trunk' ? 'Trunk' : v ? esc(`${v.id} ${v.name}`) : ''}</td><td>${esc((r.ips || []).join(' · ') || r.dest || '')}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    return `<div class="section">${h3(n, 'Switches: ports and VLAN', `${sws.length} switch${sws.length === 1 ? '' : 'es'}`)}${overview}${plug}${per.map(x => x.html).join('')}</div>`;
  }
  function buildSplitters(M, dc, L, n){
    const sps = plan(M, dc).splitters || [];
    if(!sps.length) return '';
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
  // Racks: de rack-tekening zoals in de app (rail met U-nummers, device-faces, poorten per node),
  // de nodepoorten met de LK-/Veam-poort die erop zit, losse apparaten en de patchtabel.
  const typeNameOf = t => [t?.brand, t?.name].filter(Boolean).join(' ') || t?.id || '';
  function rackDrawing(M, P, R, ri, L, owners){
    const find = (key, id) => (M.networkDevices?.[key] || []).find(x => x.id === id);
    const pp = (cls, label, color, free) => `<span class="pp ${cls} ${free ? 'free' : ''}" style="${color ? `--c:${color}` : ''}">${esc(label)}</span>`;
    const grp = inner => inner ? `<span class="pp-grp">${inner}</span>` : '';
    const H = R.rack.heightU;
    const G = curG(), ph = G.ph, mt = G.mt, mb = G.mb;
    const uh = Math.max(3.2, Math.min(6.5, (ph - mt - mb - 45) / H));   // mm per U, zodat het rek op één pagina past
    const nodes = new Map(P.nodes.filter(x => x.rack === ri).map(x => [x.iid, x]));
    const splits = new Map(P.splitters.filter(x => x.rack === ri).map(x => [x.iid, x]));
    const items = (R.rack.items || []).slice().sort((a, b) => (a.u - b.u) || ((a.side === 'R') - (b.side === 'R'))).map(it => {
      if(it.kind === 'blind') return `<div class="prk-it prk-half prk-${it.side === 'R' ? 'R' : 'L'}" style="grid-row:${it.u} / span 1"><div class="pru" style="--c:#000;background:#0b0c0e"></div></div>`;
      const key = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' }[it.kind];
      const t = find(key, it.typeId); if(!t) return '';
      if(t.special) return `<div class="prk-it" style="grid-row:${it.u} / span ${Math.max(1, Number(t.heightU) || 3)}"><div class="pru pru-special">${window.SwPorts.gc20tSvg({ title:'GigaCore 20t' }, 4.2)}</div></div>`;
      let ports = '', tag = '';
      if(it.kind === 'node'){
        const x = nodes.get(it.iid);
        tag = x ? `<b class="prk-tag" style="--c:${x.color}">${x.label}</b>` : '';
        const eth = Math.min(2, Math.max(1, Number(t.ethernetCount) || 1));
        ports = grp((x?.ports || []).map((p, i) => pp('dmx', p ? `U${p.universe}` : String(i + 1), (p && owners.get(p.owner)) || x.color, !p)).join('')) + grp(Array.from({ length:eth }, (_, i) => pp('rj', eth > 1 ? String(i + 1) : '', null)).join(''));
      } else if(it.kind === 'splitter'){
        const x = splits.get(it.iid);
        tag = x ? `<b class="prk-tag" style="--c:#475569">${x.label}</b>` : '';
        ports = grp(x?.inputs.length ? x.inputs.map(u => pp('dmx in', `U${u}`, x.feedColor)).join('') : pp('dmx in', 'A', null, true)) + grp((x?.outputs || []).map((l, i) => pp('dmx', l ? l.owner.replace(/^(LK|V)/, '') : String(i + 1), (l && owners.get(l.owner)) || l?.feed?.color, !l)).join(''));
      } else if(it.kind === 'panel'){
        ports = P.groups.filter(g => g.iid === it.iid && g.rack === ri).map(g => grp(pp('lk', g.lk ? g.lk.id.replace(/^LK/, '') : '', g.lk ? owners.get(g.lk.id) : null, !g.lk) + g.vims.map(v => { const id = v.used?.id || v.linked; return pp('vim', id ? id.replace(/^V/, '') : '', id ? owners.get(id) : null, !id); }).join(''))).join('')
          + window.SwPorts.panelGroups(t).map(g => grp(g.items.map(x => pp(g.cls, String(x.no), null)).join(''))).join('')
          + grp(P.soloVims.filter(v => v.iid === it.iid && v.rack === ri).map(v => pp('vim', v.used ? v.used.id.replace(/^V/, '') : '', v.used ? owners.get(v.used.id) : null, !v.used)).join(''));
      } else {
        const SP = window.SwPorts, panels = (R.rack.items || []).filter(x => x.kind === 'panel').map(x => find('panelTypes', x.typeId));
        ports = grp(Array.from({ length:SP.front(t) }, (_, i) => pp('rj', String(i + 1), null)).join('')) + (SP.fibreOnPanel(t, panels) ? '' : grp(Array.from({ length:Number(t.sfpCount) || 0 }, (_, i) => pp('sfp', SP.short(t, i + 1), null)).join('')));
      }
      const hu = Math.max(1, Number(t.heightU) || 1);
      return `<div class="prk-it ${t.width === 'half' ? `prk-half prk-${it.side === 'R' ? 'R' : 'L'}` : ''}" style="grid-row:${it.u} / span ${hu}"><div class="pru" style="--c:${hex(t.color, '#475569')}"><div class="pru-label"><b>${tag}${esc(window.ShortName ? window.ShortName.of(t) : typeNameOf(t))}</b><span>${esc(it.kind)} · ${hu}U</span></div><div class="pru-ports">${ports}</div></div></div>`;
    }).join('');
    const rail = `<div class="prk-rail">${Array.from({ length:H }, (_, i) => `<span>${H - i}</span>`).join('')}</div>`;
    const slots = Array.from({ length:H }, (_, i) => `<div class="prk-slot" style="grid-row:${i + 1}"></div>`).join('');
    return `<div class="card prk-card"><div class="card-h"><span>${esc(R.placement.name || R.rack.name || R.rack.id)}</span><small>${H}U${R.rack.articleKey ? ` · ${esc(R.rack.articleKey)}` : ''}</small></div>
      <div class="card-b"><div class="prk" style="--h:${H};--uh:${uh}mm">${rail}<div class="prk-bay">${slots}${items}</div>${rail}</div></div></div>`;
  }
  function nodePortsPrint(P, n, where, owners){
    const cells = n.ports.map((p, i) => p
      ? `<span class="pnp" style="--c:${owners.get(p.owner) || n.color}"><b>${i + 1}</b><em>U${p.universe}</em><span>${p.ownerPort === 'in' ? `${esc(p.owner)} in` : `${esc(p.owner)} · ${esc(p.ownerPort)}`}</span>${p.dest ? `<i>${esc(p.dest)}</i>` : ''}</span>`
      : `<span class="pnp free"><b>${i + 1}</b><em>—</em><span>free</span></span>`).join('');
    return `<div class="pnp-node" style="--c:${n.color}"><div class="pnp-head"><b class="prk-tag" style="--c:${n.color}">${n.label}</b><b>${esc(typeNameOf(n.type))}</b><small>${esc(where)}</small></div><div class="pnp-strip">${cells}</div></div>`;
  }
  // De signaalstroom-tekening van de pagina Signaalstroom (met de indeling zoals de gebruiker hem heeft neergezet)
  function buildFlow(M, dc, L, n, o={}){
    const r = window.Flow?.printSvg?.(dc);
    if(!r) return '';
    const legend = o.legend === false ? '' : `<div class="pflow-legend"><span><i style="height:1.6mm"></i>LK multicore</span><span><i style="height:1.1mm"></i>Veam cable</span><span><i style="height:.6mm;background:linear-gradient(90deg,#f87171,#60a5fa,#4ade80)"></i>DMX line (universe colour)</span><span><i style="height:.8mm;background:linear-gradient(90deg,#325197,#E80000,#32CD32)"></i>Network cable (VLAN colour)</span><span><i style="height:1.3mm;background:#22c3d6"></i>Fibre</span><span>Every LK and every Veam has its own colour, on the rack, in the flow and on the node ports</span></div>`;
    const sub = [r.racks ? `${r.racks} rack${r.racks===1?'':'s'}` : '', `${r.lk} LK`, `${r.veams} Veam`, `${r.lines} lines`].filter(Boolean).join(' · ');
    const net = o.netOnly !== false ? window.Flow?.printSvg?.(dc, 'net') : null;
    const netBlock = net ? `<div class="pflow-sub" data-keepnext="1">Network only</div><div class="pflow">${net.svg}</div>` : '';
    return `<div class="section ${o.ownPage === false ? '' : 'pflow-page'}">${h3(n, 'Signal flow', sub)}<div class="pflow">${r.svg}</div>${legend}${netBlock}</div>`;
  }
  function buildRacks(M, dc, L, n, o={}){
    const E = window.RackEngine;
    if(!E || !(E.hasRackPlan ? E.hasRackPlan(M, dc) : E.placedRacks(M, dc).length)) return '';
    const P = E.computeRackPlan(M, dc);
    const owners = E.ownerColors(P);
    const drawing = o.drawing === false ? '' : `<div class="prk-row">${P.racks.map((R, ri) => R.rack ? rackDrawing(M, P, R, ri, L, owners) : '').join('')}</div>`;
    const whereOf = x => x.loose ? (x.field ? (x.name ? `Elsewhere · ${x.name}` : 'Elsewhere (belongs to this DB)') : (x.name ? `Loose · ${x.name}` : 'Loose node')) : (P.racks[x.rack]?.placement.name || P.racks[x.rack]?.rack?.name || '');
    const nodeList = o.nodes === false || !P.nodes.length ? '' : `<div class="pnp-grid">${P.nodes.map(x => nodePortsPrint(P, x, whereOf(x), owners)).join('')}</div>`;
    const loose = P.loose || [];
    let looseHtml = '';
    if(o.loose !== false && loose.length){
      const rows = loose.map(d => {
        if(d.kind === 'node'){ const x = P.nodes.find(y => y.iid === d.iid); return `<tr><td><b>${x ? x.label : '—'}</b></td><td>Node${x ? ` · ${esc(typeNameOf(x.type))}` : ` · <span class="tag red">${esc(d.typeId)} missing</span>`}</td><td>${esc(d.name || '')}${d.place === 'field' ? `${d.name ? ' · ' : ''}<span class="small">elsewhere, belongs to this DB</span>` : ''}</td><td>${x ? `${x.ports.filter(Boolean).length}/${x.ports.length} ports used` : ''}</td></tr>`; }
        const isLk = d.kind === 'lkSpider';
        const s = isLk ? P.groups.find(g => g.iid === d.iid) : P.soloVims.find(v => v.iid === d.iid);
        const used = isLk ? s?.lk : s?.used;
        const onNode = d.nodeIid ? P.nodes.find(y => y.iid === d.nodeIid)?.label : '';
        const fed = used ? [...new Set(P.lines.filter(l => l.owner === used.id && l.feed?.node).map(l => l.feed.node))].join(' + ') : '';
        return `<tr><td><b>${s?.label || ''}</b></td><td>${isLk ? 'LK spider' : 'Veam4 spider'}</td><td>${used ? `<span class="dot" style="background:${owners.get(used.id) || '#94a3b8'}"></span><b>${esc(used.id)}</b>` : '<span class="small">free</span>'}</td><td>${fed ? `on ${esc(fed)}` : onNode ? `on ${esc(onNode)}` : ''}</td></tr>`;
      }).join('');
      looseHtml = `<div class="card"><div class="card-h"><span>Loose devices</span><small>${loose.length} without a rack</small></div><table><thead><tr><th style="width:14mm">Label</th><th style="width:34mm">Device</th><th>Name / LK / Veam</th><th style="width:34mm">Node</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const advice = o.advice === false ? '' : `<div class="rk-advice">${P.recs.map(r => `<div class="${r.level}">${esc(r.text)}</div>`).join('')}</div>`;
    const lines = P.lines.slice().sort((a, b) => String(a.feed?.node || '~').localeCompare(String(b.feed?.node || '~'), undefined, { numeric:true }) || (a.feed?.port || 0) - (b.feed?.port || 0));
    const table = o.table === false ? '' : `<table><thead><tr><th>Node port</th><th class="num">Universe</th><th>Via</th><th>Socket</th><th>LK / Veam port</th><th>Location</th></tr></thead><tbody>${lines.map(l => `<tr><td>${l.feed ? `<span class="dot" style="background:${l.feed.color}"></span><b>${esc(l.feed.node)}</b> · ${l.feed.port}` : '<span class="tag red">no port</span>'}</td><td class="num">U${l.universe}</td><td>${l.feed?.splitter ? `${esc(l.feed.splitter)} · out ${l.feed.out}` : 'direct'}</td><td>${esc(l.socket)}</td><td>${esc(l.label)}</td><td>${esc(l.dest)}${l.note ? ` · ${esc(l.note)}` : ''}</td></tr>`).join('')}</tbody></table>`;
    const st = P.stats;
    return `<div class="section">${h3(n, 'Racks', `${st.lkUsed}/${st.lkSockets} LK37 · ${st.vimUsed}/${st.vimSockets} Veam4 · ${st.nodePortsUsed}/${st.nodePorts} node ports`)}${advice}${drawing}${nodeList}${looseHtml}${table}</div>`;
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
    // which node and node port every port is on (needs racks in this DimCity; without them only the universe is shown)
    const E = window.RackEngine; let P = null, owners = new Map();
    if(o.nodePorts !== false && E && (E.hasRackPlan ? E.hasRackPlan(M, dc) : false)){ try { P = E.computeRackPlan(M, dc); owners = E.ownerColors(P); } catch { P = null; } }
    const ownerCol = id => owners.get(id) || null;
    const feedOf = (owner, port) => { if(!P) return ''; const l = P.lines.find(x => x.owner === owner && Number(x.port) === Number(port)); if(!l) return ''; return l.feed?.node ? `<div class="np"><b>${esc(l.feed.node)}</b>·${esc(l.feed.port)}${l.feed.splitter ? ` <i>via ${esc(l.feed.splitter)}</i>` : ''}</div>` : '<div class="np none">no node port</div>'; };
    // one port: number, universe, node · node port, location
    const cell = (m, nr, owner, ownerPort) => {
      const has = m.universe != null && m.universe !== '';
      return `<div class="port ${has?'':'empty'} ${m.conflict?'conflict':''}" style="--uni:${has?uniColor(m.universe,L):'#e2e8f0'}"><div class="nr">${nr}</div><div class="uni">${has?'U'+esc(m.universe):'—'}</div>${has ? feedOf(owner, ownerPort) : ''}${o.location!==false?`<div class="dest">${esc(m.dest||'')}</div>`:''}${o.source && has?`<div class="src">${esc(m.source||'')}${m.veamId?' · '+esc(m.veamId)+'/'+esc(m.veamPort):''}</div>`:''}</div>`;
    };
    if(!lks.length && !loose.length) return '';
    const lkHtml = lks.map(lk=>{
      const mode = effBlock(lk), col = ownerCol(lk.id);
      const head = `<div class="card-h"><span>${col ? `<i class="dot" style="background:${col}"></i>` : ''}${esc(lk.id)} <small>${esc(loc(lk))}</small></span><small>${esc(blockLabel(mode))}</small></div>`;
      if(mode === 'XLR12'){
        return `<div class="card">${head}<div class="card-b"><div class="lkrow">${Array.from({length:12},(_,i)=>`<div class="c1">${cell(merged(lk,i+1), i+1, lk.id, i+1)}</div>`).join('')}</div></div></div>`;
      }
      // the LK with its 12 ports on top; underneath, each Veam that hangs on it as a block of 4 (12 wide in all)
      const top = [1,2,3].map(slot=>{
        const start = (slot-1)*4 + 1, vid = lk.veam?.[slot] || '';
        if(vid) return `<div class="lkv" style="--oc:${ownerCol(vid) || '#94a3b8'}"><span>${esc(vid)}</span><small>ports ${start}–${start+3}</small></div>`;
        return [0,1,2,3].map(i=>`<div class="c1">${cell(merged(lk,start+i), start+i, lk.id, start+i)}</div>`).join('');
      }).join('');
      const under = [1,2,3].map(slot=>{
        const start = (slot-1)*4 + 1, vid = lk.veam?.[slot] || '';
        if(!vid) return mode === 'VEAM_ONLY' ? `<div class="vb none">Veam ${'ABC'[slot-1]}<br>not linked</div>` : `<div class="vb gap"></div>`;
        return `<div class="vb" style="--oc:${ownerCol(vid) || '#94a3b8'}"><h4><span>${esc(vid)}</span><small>Veam ${'ABC'[slot-1]}</small></h4><div class="ports p4">${[0,1,2,3].map(i=>cell(merged(lk,start+i), i+1, lk.id, start+i)).join('')}</div></div>`;
      }).join('');
      return `<div class="card">${head}<div class="card-b"><div class="lkrow top">${top}</div><div class="lkrow under">${under}</div></div></div>`;
    }).join('') || '<div class="placeholder">No LK blocks in this DimCity.</div>';
    const veHtml = loose.length ? `<div style="margin-top:2mm" class="small"><b>Veams not linked to an LK</b></div><div class="grid cols3" style="margin-top:1.5mm">${loose.map(v=>`<div class="card"><div class="card-h"><span>${ownerCol(v.id) ? `<i class="dot" style="background:${ownerCol(v.id)}"></i>` : ''}${esc(v.id)}</span><small>Veam · 4 ports</small></div><div class="card-b"><div class="ports p4">${[1,2,3,4].map(i=>{ const r = portRec(v.lines,i) || {}; return cell({ universe:r.universe, dest:r.dest, source:'Veam' }, i, v.id, i); }).join('')}</div></div></div>`).join('')}</div>` : '';
    return `<div class="section">${h3(n, 'LK / Veam patch', `${lks.length} LK block${lks.length===1?'':'s'}`)}${lkHtml}${veHtml}</div>`;
  }
  function buildUniverses(M, dc, L, n){
    const pts = allPoints(M, dc).filter(p=>p.universe!=null && p.universe!=='');
    if(!pts.length) return '';
    const by = new Map(); for(const p of pts){ const k = String(p.universe); if(!by.has(k)) by.set(k, []); by.get(k).push(p); }
    const rows = [...by.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([u, list])=>`<tr><td><span class="dot" style="background:${uniColor(u,L)}"></span><b>UNI ${esc(u)}</b></td><td class="num">${list.length}</td><td>${list.map(p=>esc(p.kind==='DMX'?'DMX':`${p.id}/${p.port}`)).join(', ')}</td></tr>`).join('');
    return `<div class="section">${h3(n, 'Universe overview', `${by.size} universes`)}<table><thead><tr><th style="width:22mm">Universe</th><th class="num" style="width:14mm">Points</th><th>Patched on</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="small">No universes</td></tr>'}</tbody></table></div>`;
  }
  function buildPatchList(M, dc, L, n, o){
    const pts = allPoints(M, dc, o.dmx !== false);
    if(!pts.length) return '';
    const label = st => st==='RED' ? '<span class="tag red">Error</span>' : st==='GREEN' ? '<span class="tag green">OK</span>' : '<span class="tag yellow">Incomplete</span>';
    const rows = pts.map(p=>`<tr><td>${esc(p.kind)}</td><td><b>${esc(p.id)}</b></td><td class="num">${esc(p.port)}</td><td class="num">${p.universe ?? ''}</td><td>${esc(p.dest)}</td><td>${label(p.status)}</td></tr>`).join('');
    return `<div class="section">${h3(n, 'Patch list', `${pts.length} rows`)}<table><thead><tr><th>Type</th><th>ID</th><th class="num">Port</th><th class="num">Universe</th><th>Location</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="small">No rows</td></tr>'}</tbody></table></div>`;
  }
  function buildWarnings(M, dc, L, n, o){
    const list = (M.issues||[]).filter(i => i.dimcity === dc || (o.projectWide !== false && !i.dimcity));
    const rows = list.map(i=>`<tr><td>${i.severity==='RED'?'<span class="tag red">Error</span>':'<span class="tag yellow">Warning</span>'}</td><td>${esc(i.message||'')}</td><td class="small">${esc(i.code||'')}</td></tr>`).join('');
    return `<div class="section">${h3(n, 'Warnings & errors', list.length ? `${list.length} item${list.length===1?'':'s'}` : '')}${list.length ? `<table><thead><tr><th style="width:20mm">Status</th><th>Message</th><th style="width:40mm">Code</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="placeholder">No issues — all checks passed.</div>'}</div>`;
  }

  // ===================== The documents =====================
  // The blocks (sections) of one DimCity for a document: kind = 'book' | 'lk' | 'nodes'. Only the sections that belong in that document.
  function dbBlocks(M, meta, dc, L, kind){
    const ctx = { dc, docName:kind === 'book' ? '' : DOCS[kind].title, label:dcName(dc) };
    const group = `dc:${dc}`, blocks = [], toc = [], db = dcColor(M, dc);
    let n = 0, first = true, real = 0;
    for(const s of L.sections){
      if(!s.on || !SECTIONS[s.key].docs.includes(kind)) continue;
      const o = s.opts || {};
      if(s.key === 'notes' && !o.text) continue;
      let html = '';
      if(s.key === 'summary') html = buildDbHeader(M, meta, dc, L);
      else {
        n++;
        switch(s.key){
          case 'network':   html = buildNetwork(M, dc, L, n, o); break;
          case 'switches':  html = buildSwitches(M, dc, L, n, o); break;
          case 'splitters': html = buildSplitters(M, dc, L, n); break;
          case 'racks':     html = buildRacks(M, dc, L, n, o); break;
          case 'flow':      html = buildFlow(M, dc, L, n, o); break;
          case 'patch':     html = buildPatch(M, dc, L, n, o); break;
          case 'universes': html = buildUniverses(M, dc, L, n); break;
          case 'patchlist': html = buildPatchList(M, dc, L, n, o); break;
          case 'warnings':  html = buildWarnings(M, dc, L, n, o); break;
          case 'qr':        html = buildQr(M, dc, L, n, o); break;
          case 'notes':     html = `<div class="section">${h3(n, 'Notes')}<div class="notes">${esc(fillTokens(o.text, meta, dc))}</div></div>`; break;
        }
        if(!html) n--;
      }
      if(!html) continue;
      if(s.key !== 'summary' && s.key !== 'notes' && (s.key !== 'warnings' || (M.issues || []).some(i => i.dimcity === dc))) real++;
      const entry = { level:first ? 1 : 2, title:first ? dcName(dc) : SECTIONS[s.key].title, color:first ? db : null, page:0 };
      toc.push(entry);
      blocks.push({ html:secWrap(s, html, db), ctx, group, breakBefore:first || (s.key === 'flow' && (s.opts || {}).ownPage !== false), fixed:!!normPos(s.pos) && !first, chapter:entry });
      first = false;
    }
    if(!blocks.length){ const e = { level:1, title:dcName(dc), color:db, page:0 }; toc.push(e); blocks.push({ html:`<div class="placeholder">No sections for this document are switched on. Turn sections on in the Content step.</div>`, ctx, group, breakBefore:true, chapter:e }); }
    else if(kind !== 'book' && !real) return { blocks:[], toc:[] };      // only the header: this DimCity has nothing for this document
    return { blocks, toc };
  }

  // ---- the IP address book: every address of the nodes, switches and consoles ----
  const ipCmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for(let i = 0; i < 4; i++) if((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  const natCmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric:true });
  function ipRows(dcs){
    const IP = window.IpPlan, F = window.Fent; if(!IP || !F) return [];
    const list = IP.all().filter(d => dcs.includes(d.dc));
    const seen = new Map(); for(const d of list) for(const x of d.ifs){ const k = String(x.ip || '').trim(); if(k) seen.set(k, (seen.get(k) || 0) + 1); }
    const fentOn = !!getM()?.networkDevices?.prefs?.fent?.on;
    const ports = new Map(); for(const dc of dcs){ try { ports.set(dc, window.FentUI.portPlan(dc).rows); } catch { ports.set(dc, []); } }
    const rank = { switch:0, node:1, splitter:2, console:3 };
    const kindName = { switch:'Switch', node:'Node', splitter:'Splitter', console:'Console' };
    return list.map(d => {
      const prow = (ports.get(d.dc) || []).filter(r => r.kind === d.kind && r.idx === d.idx);
      const ifs = d.ifs.map(x => {
        const v = x.vlan != null ? F.vlanById(x.vlan) : null, r = prow.find(q => q.eth === x.eth) || (d.eth === 1 ? prow[0] : null);
        const role = F.ROLES[x.role]?.en || '';
        return { ip:String(x.ip || '').trim(), mask:x.mask || (fentOn ? F.MASK : ''), vlan:v, vlanId:x.vlan, role, eth:d.eth > 1 ? x.eth : 0, port:r?.sw && r?.swPort ? `${r.sw} · ${r.swPort}` : '', dup:!!(x.ip && seen.get(String(x.ip).trim()) > 1) };
      });
      return { dc:d.dc, kind:d.kind, kindName:kindName[d.kind] || d.kind, label:d.label, type:d.typeName || '', where:d.kind === 'switch' ? (d.where || '') : (d.dev?.name && d.dev.name !== d.label ? d.dev.name : ''), ifs, gone:!!d.gone };
    }).sort((a, b) => natCmp(a.dc, b.dc) || (rank[a.kind] - rank[b.kind]) || natCmp(a.label, b.label));
  }
  const vlanChip = (v, id) => v ? `<span class="vl" style="--c:${esc(v.color || '#94a3b8')}"></span>${esc(v.name)} <span class="small">${v.id}</span>` : (id != null ? esc(String(id)) : '');
  function ipBlocks(M, meta, dcs, L){
    const F = window.Fent, rows = ipRows(dcs), blocks = [];
    const ctx = { docName:'IP address book', label:'IP address book' };
    const all = rows.flatMap(r => r.ifs.map(x => ({ r, x })));
    const dups = new Set(all.filter(a => a.x.dup).map(a => a.x.ip));
    // 1. overview
    const byVlan = new Map();
    for(const { x } of all){ const k = x.vlanId != null ? String(x.vlanId) : '-'; if(!byVlan.has(k)) byVlan.set(k, { vlan:x.vlan, id:x.vlanId, n:0, masks:new Set(), ips:[] }); const e = byVlan.get(k); e.n++; if(x.mask) e.masks.add(x.mask); e.ips.push(x.ip); }
    const vl = [...byVlan.values()].sort((a, b) => (Number(a.id) || 1e9) - (Number(b.id) || 1e9));
    const range = e => { const r = e.id != null ? F?.rangeOf(Number(e.id)) : null; if(r) return r.text; const ips = e.ips.filter(Boolean).sort(ipCmp); return ips.length ? `${ips[0].split('.').slice(0, 2).join('.')}.x.x` : ''; };
    const vlTable = vl.length ? `<div class="card"><div class="card-h"><span>VLANs in use</span><small>${vl.length} VLAN${vl.length === 1 ? '' : 's'}</small></div><div class="card-b"><table><thead><tr><th>VLAN</th><th>Name</th><th>Address range</th><th>Mask</th><th class="num">Addresses</th></tr></thead><tbody>${vl.map(e => `<tr><td class="mono">${e.id ?? '—'}</td><td>${vlanChip(e.vlan, null) || '<span class="small">no VLAN</span>'}</td><td class="mono">${esc(range(e))}</td><td class="mono">${esc([...e.masks].join(' · '))}</td><td class="num"><b>${e.n}</b></td></tr>`).join('')}</tbody></table></div></div>` : '';
    const issues = window.IpPlan?.check?.().filter(i => i.level !== 'info' && (!i.dc || dcs.includes(i.dc))) || [];
    const totals = `<div class="cover-totals" style="margin-top:2mm"><div><b>${rows.length}</b><span>Devices</span></div><div><b>${all.filter(a => a.x.ip).length}</b><span>Addresses</span></div><div><b>${vl.length}</b><span>VLANs</span></div><div><b>${dups.size}</b><span>Double</span></div></div>`;
    const e0 = { level:1, title:'Overview', page:0 };
    blocks.push({ html:`<div class="section"><h2 class="doc-h2">IP address book</h2><div class="small" style="margin:-2mm 0 3mm">${esc([meta.project, meta.area, meta.location].filter(Boolean).join(' · '))}</div>${totals}${vlTable}</div>`, ctx, breakBefore:true, chapter:e0 });
    if(issues.length) blocks.push({ html:`<div class="section"><h3><span>Check</span><small>${issues.length} item${issues.length === 1 ? '' : 's'}</small></h3><table class="ip-tbl"><thead><tr><th style="width:16mm">Level</th><th>Device</th><th>Address</th><th>What</th></tr></thead><tbody>${issues.map(i => `<tr><td>${i.level === 'err' ? '<span class="tag red">Error</span>' : '<span class="tag yellow">Warning</span>'}</td><td>${esc([i.dc && dcName(i.dc), i.label].filter(Boolean).join(' · '))}</td><td class="ip">${esc(i.ip || '')}</td><td>${esc(i.en || '')}</td></tr>`).join('')}</tbody></table></div>`, ctx });
    // 2. per DimCity
    let n = 0;
    for(const dc of dcs){
      const mine = rows.filter(r => r.dc === dc); if(!mine.length) continue;
      n++;
      const body = mine.map(r => {
        const ifs = r.ifs.length ? r.ifs : [{ ip:'', mask:'', vlan:null, port:'', role:'', eth:0 }];
        return ifs.map((x, i) => `<tr class="${i ? 'cont-row' : ''}"${i < ifs.length - 1 ? ' data-keepnext="1"' : ''}><td>${i ? '<span class="small">↳</span>' : `<b>${esc(r.label)}</b>`}</td><td class="sub">${i ? '' : esc(r.kindName + (r.type ? ` · ${r.type}` : ''))}</td><td class="sub">${i ? esc(x.role) : esc(r.where || x.role || '')}${x.eth ? ` ETH${x.eth}` : ''}</td><td class="ip ${x.dup ? 'dup' : ''}">${x.ip ? `<b>${esc(x.ip)}</b>` : '<span class="small">no address</span>'}</td><td class="mono sub">${esc(x.mask)}</td><td>${vlanChip(x.vlan, x.vlanId)}</td><td class="sub">${esc(x.port)}</td></tr>`).join('');
      }).join('');
      const e = { level:1, title:dcName(dc), color:dcColor(M, dc), page:0 };
      blocks.push({ html:`<div class="section" data-keep="1" style="--db:${dcColor(M, dc)}"><h3><span><span class="n">${n}</span>${esc(dcName(dc))}</span><small>${mine.length} device${mine.length === 1 ? '' : 's'}</small></h3><table class="ip-tbl"><thead><tr><th>Device</th><th>Type</th><th>Where / use</th><th>IP address</th><th>Mask</th><th>VLAN</th><th>Switch · port</th></tr></thead><tbody>${body}</tbody></table></div>`, ctx:{ ...ctx, dc }, chapter:e });
    }
    // 3. all addresses by number
    const sorted = all.filter(a => a.x.ip).sort((a, b) => ipCmp(a.x.ip, b.x.ip));
    if(sorted.length) blocks.push({ html:`<div class="section"><h3><span><span class="n">${n + 1}</span>All addresses by number</span><small>${sorted.length} addresses</small></h3><table class="ip-tbl"><thead><tr><th>IP address</th><th>Device</th><th>DimCity</th><th>VLAN</th><th>Mask</th><th>Switch · port</th></tr></thead><tbody>${sorted.map(({ r, x }) => `<tr><td class="ip ${x.dup ? 'dup' : ''}"><b>${esc(x.ip)}</b></td><td><b>${esc(r.label)}</b> <span class="small">${esc(r.kindName)}${x.eth ? ` ETH${x.eth}` : ''}</span></td><td class="sub">${esc(dcName(r.dc))}</td><td>${vlanChip(x.vlan, x.vlanId)}</td><td class="mono sub">${esc(x.mask)}</td><td class="sub">${esc(x.port)}</td></tr>`).join('')}</tbody></table></div>`, ctx, breakBefore:true, chapter:{ level:1, title:'All addresses by number', page:0 } });
    if(!rows.length) blocks.splice(0, blocks.length, { html:`<div class="section"><h2 class="doc-h2">IP address book</h2><div class="placeholder">There are no network devices yet. Add nodes and switches on the Network page and give them an address.</div></div>`, ctx, breakBefore:true });
    return blocks;
  }

  // ---- the A3 sheets: the network flow and the signal flow, one drawing per sheet ----
  const flowLegend = () => `<div class="pflow-legend"><span><i style="height:1.6mm"></i>LK multicore</span><span><i style="height:1.1mm"></i>Veam cable</span><span><i style="height:.6mm;background:linear-gradient(90deg,#f87171,#60a5fa,#4ade80)"></i>DMX line (universe colour)</span><span><i style="height:.8mm;background:linear-gradient(90deg,#325197,#E80000,#32CD32)"></i>Network cable (VLAN colour)</span><span><i style="height:1.3mm;background:#22c3d6"></i>Fibre</span></div>`;
  function a3Blocks(M, meta, dcs, L, kind){
    const blocks = [], F = window.Flow; if(!F?.printSvg) return blocks;
    const meta2 = (title, sub, db) => `<div class="a3-title" style="--db:${db}"><b>${esc(title)}</b><span>${esc(sub)}</span></div>`;
    const one = (dc, layer, title, ctx, db, svgFrom) => {
      const r = F.printSvg(svgFrom || dc, layer); if(!r) return null;
      const sub = layer === 'net' ? 'Switches · Cat cables · fibres' : [r.racks ? `${r.racks} rack${r.racks === 1 ? '' : 's'}` : '', `${r.lk} LK`, `${r.veams} Veam`, `${r.lines} lines`].filter(Boolean).join(' · ');
      return { html:`<div class="a3p" data-sec="flow">${meta2(title, sub, db)}<div class="pflow">${r.svg}</div>${flowLegend()}</div>`, ctx, breakBefore:true };
    };
    if(kind === 'a3all'){
      const ctx = { docName:'Network overview', label:'Network overview' };
      const b = one(null, 'net', 'Network overview — all DimCities', ctx, '#ff8a1f', dcs); if(b) blocks.push(b);
      return blocks;
    }
    const dc = dcs[0], ctx = { dc, docName:'Network flow', label:dcName(dc) }, db = dcColor(M, dc);
    const a = one(dc, 'net', `${dcName(dc)} — Network flow`, ctx, db), b = one(dc, 'all', `${dcName(dc)} — Signal flow`, ctx, db);
    if(a) blocks.push(a); if(b) blocks.push(b);
    return blocks;
  }

  // ===================== The file plan =====================
  const fname = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // every file that is made with the choices of the What step: where it goes (dir / name) and what it is
  function filePlan(L, dcs, meta = currentMeta()){
    const proj = fname(meta.project) || 'PatchLab', st = L.publish.structure !== false, root = st ? (fname(L.publish.folder) || proj) : '';
    const j = (...p) => p.filter(Boolean).join('/');
    const out = [], add = f => out.push({ ...f, rel:j(root, f.dir, f.name) });
    const k = L.docs.stickerKinds || {};
    if(L.docs.book && dcs.length) add({ id:'book', kind:'book', title:DOCS.book.title, dir:'', name:`${proj} - DB book.pdf`, dcs });
    if(L.docs.ip && dcs.length) add({ id:'ip', kind:'ip', title:DOCS.ip.title, dir:'', name:`${proj} - IP address book.pdf`, dcs });
    if(L.docs.a3 && dcs.length > 1) add({ id:'a3all', kind:'a3all', title:'Network overview (A3)', dir:st ? 'A3' : '', name:`${proj} - Network overview A3.pdf`, dcs });
    for(const dc of dcs){
      const d = fname(dcName(dc)), dir = st ? d : '', sd = st ? j(d, 'Stickers') : '';
      if(L.docs.lk) add({ id:`lk:${dc}`, kind:'lk', dc, title:`${dcName(dc)} · LK info`, dir, name:`${d} - LK info.pdf`, dcs:[dc] });
      if(L.docs.nodes) add({ id:`nodes:${dc}`, kind:'nodes', dc, title:`${dcName(dc)} · Node info`, dir, name:`${d} - Node info.pdf`, dcs:[dc] });
      if(L.docs.stickers){
        if(k.nodes) add({ id:`st-nodes:${dc}`, kind:'stickers', variant:'nodes', ports:!!k.nodePorts, dc, title:`${dcName(dc)} · Node stickers`, dir:sd, name:`${d} - Node stickers.pdf`, dcs:[dc] });
        if(k.switches) add({ id:`st-switches:${dc}`, kind:'stickers', variant:'switches', ports:!!k.switchPorts, dc, title:`${dcName(dc)} · Switch stickers`, dir:sd, name:`${d} - Switch stickers.pdf`, dcs:[dc] });
        if(k.cables) add({ id:`st-cables:${dc}`, kind:'stickers', variant:'cables', dc, title:`${dcName(dc)} · Cable stickers`, dir:sd, name:`${d} - Cable stickers.pdf`, dcs:[dc] });
      }
      if(L.docs.a3) add({ id:`a3:${dc}`, kind:'a3', dc, title:`${dcName(dc)} · Network flow (A3)`, dir:st ? 'A3' : '', name:`${d} - Network flow A3.pdf`, dcs:[dc] });
    }
    return out;
  }

  // ===================== Render a document =====================
  // → { html, pages, over, size, landscape, empty }   (null when a newer render took over: isStale)
  async function renderDocument({ kind, dcs, layout:L, preview = false, isStale = null, title = '' }){
    const M = getM(), meta = currentMeta();
    if(!M || !dcs.length) return { html:'', pages:0, empty:true };
    await Promise.all([loadLogoDims(L.brand?.logo), loadLogoDims(meta.logo)]);
    const a3 = kind === 'a3' || kind === 'a3all';
    const G = geo(L, meta, a3 ? 'a3' : 'book', a3 ? a3Orientation(L, meta, dcs, kind) : null);
    CTX = { G, meta, kind };
    // all the blocks are built here, in one go (they read CTX)
    let cover = '', toc = [], blocks = [];
    if(kind === 'book'){
      if(L.cover.show) cover = buildCover(M, meta, dcs, L);
      if(L.cover.summaryPage && dcs.length > 1){ const e = { level:1, title:'Project summary', page:0 }; toc.push(e); blocks.push({ html:buildProjectSummary(M, dcs), ctx:{ label:'Project summary' }, breakBefore:true, chapter:e }); }
      for(const dc of dcs){ const r = dbBlocks(M, meta, dc, L, 'book'); blocks.push(...r.blocks); toc.push(...r.toc); }
    } else if(kind === 'lk' || kind === 'nodes') blocks = dbBlocks(M, meta, dcs[0], L, kind).blocks;
    else if(kind === 'ip') blocks = ipBlocks(M, meta, dcs, L);
    else if(a3) blocks = a3Blocks(M, meta, dcs, L, kind);
    if(!blocks.length) return { html:'', pages:0, empty:true };

    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;left:-30000px;top:0;width:2000px;height:1200px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(fr);
    try {
      const doc = fr.contentDocument;
      doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || meta.project || 'PatchLab')}</title><style>${docCss(L, G, meta, { preview })}</style></head><body></body></html>`); doc.close();
      const mk = ctx => makeSheet(doc, L, meta, G, ctx);
      const o = { bodyW:G.bodyW * MM, bodyH:(G.bodyH - 1.5) * MM, frame:mk, isStale, contLabel:'continued' };
      if(cover){ const s = mk({ cover:true, label:'Cover' }); s.body.innerHTML = cover; }
      let tocPages = 0;
      const useToc = kind === 'book' && L.cover.contents !== false && toc.length > 1;
      if(useToc){ const t = await window.Paginate.run(doc, { ...o, blocks:[{ html:tocHtml(toc), ctx:{ label:'Contents' }, breakBefore:true }] }); if(!t) return null; tocPages = t.length; }
      const pages = await window.Paginate.run(doc, { ...o, blocks });
      if(!pages) return null;
      const sheets = [...doc.querySelectorAll('.sheet')], off = (cover ? 1 : 0) + tocPages;
      doc.querySelectorAll('[data-toc]').forEach(e => { const en = toc[Number(e.dataset.toc)]; e.textContent = en ? String(off + (en.page || 1)) : ''; });
      sheets.forEach((s, i) => { s.setAttribute('data-n', String(i + 1)); s.querySelectorAll('.pn').forEach(x => { x.textContent = String(i + 1); }); s.querySelectorAll('.pt').forEach(x => { x.textContent = String(sheets.length); }); });
      if(preview) sheets.forEach((s, i) => {
        const w = doc.createElement('div'); w.className = 'pv-wrap'; s.replaceWith(w); w.appendChild(s);
        w.insertAdjacentHTML('beforebegin', `<div class="pv-label">Page ${i + 1} of ${sheets.length}${s.dataset.label ? ` · ${esc(s.dataset.label)}` : ''}</div>`);
      });
      const html = '<!doctype html>' + doc.documentElement.outerHTML;
      return { html, pages:sheets.length, over:(pages.over || []).map(x => x.page), size:G.size, landscape:G.land, empty:false, G };
    } finally { fr.remove(); }
  }

  // one file of the plan → { html, pages, size, landscape, empty } (stickers come from ui/labels.js, the rest from the sheets above)
  async function renderFile(f, L, { preview = false, isStale = null } = {}){
    if(f.kind === 'stickers'){
      const r = window.Labels?.docHtml?.({ dc:f.dc, variant:f.variant, ports:!!f.ports, preview, images:{ company:L.brand?.logo || null, show:currentMeta().logo || null } });
      if(!r || !r.count) return { html:'', pages:0, empty:true };
      return { html:r.html, pages:r.pages, size:'A4', landscape:false, empty:false, count:r.count, sticker:true, G:{ pw:210, ph:297 } };
    }
    return renderDocument({ kind:f.kind, dcs:f.dcs, layout:L, preview, isStale, title:String(f.name || '').replace(/\.pdf$/i, '') });
  }

  // ===================== Public API =====================
  window.PdfExport = {
    DOCS, SECTIONS, SECTION_OPTS, PRESETS, GRID_MM,
    defaultLayout, layoutFromSettings, mergeLayout, normPos, snap, setOn,
    currentMeta, allDims, selectedDims, geo, contentBox, loadLogoDims, logoList, tokens, safeFile, fname,
    filePlan, renderDocument, renderFile, dcName,
    open: (...a) => window.Publish?.open?.(...a), close: (...a) => window.Publish?.close?.(...a)
  };
})();
