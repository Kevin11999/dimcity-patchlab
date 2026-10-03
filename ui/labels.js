// ui/labels.js — sticker sheets: Herma A4 label sheets (laser), content from the show, exact positions.
// The sheet geometry comes from the HERMA label templates ("Etiketten-Vorlage … blanko"): size of one
// label, number of columns and rows, margins and gaps. Printing goes through the PDF engine with a zero
// page margin, so every label sits where the template puts it. A calibration sheet (outlines only) lets
// you check that on a real sheet. Settings live in the project: MODEL.labels.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = (v, d) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
  const trim = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  // ---------- Sheets ----------
  // Values in mm, read from the vector drawing of the HERMA templates (rectangles are drawn half a stroke
  // inside the label edge: 48,26 × 25,4 mm with 8,48 mm left margin; 45,72 × 21,167 mm with 2,54 mm gap).
  const SHEETS = [
    { id:'herma-48-3x25-4', brand:'HERMA', articles:['4680', '4690', '4102', '4112'], w:48.26, h:25.4, cols:4, rows:11, left:8.48, top:8.8, gapX:0, gapY:0, source:'HERMA label template 48,3 × 25,4 mm' },
    { id:'herma-45-7x21-2', brand:'HERMA', articles:['4097', '4232', '4221'], w:45.72, h:21.167, cols:4, rows:12, left:9.75, top:21.5, gapX:2.54, gapY:0, source:'HERMA label template 45,7 × 21,2 mm' }
  ];
  const customSheet = c => ({ id:'custom', brand:'', articles:[], w:num(c.w, 48.26), h:num(c.h, 25.4), cols:Math.max(1, num(c.cols, 4) | 0), rows:Math.max(1, num(c.rows, 11) | 0), left:num(c.left, 8.48), top:num(c.top, 8.8), gapX:num(c.gapX, 0), gapY:num(c.gapY, 0), source:'custom' });
  const sheetName = s => s.id === 'custom' ? t('Custom sheet', 'Eigen vel') : `${s.brand} ${s.articles.join(' / ')} · ${String(s.w).replace('.', ',')} × ${String(s.h).replace('.', ',')} mm`;
  const perSheet = s => s.cols * s.rows;

  function defaults(){
    return { sheet:SHEETS[0].id, custom:{ w:48.26, h:25.4, cols:4, rows:11, left:8.48, top:8.8, gapX:0, gapY:0 },
      kinds:{ cables:true, strips:true, nodePorts:false, devices:true, qr:false, switchPorts:false, netCables:true }, dcs:null, perDc:true, start:1, mono:false, outline:false,
      company:{ on:true, img:null }, show:{ on:true, img:null } };
  }
  function state(){
    const m = M(); const d = defaults();
    const L = m.labels && typeof m.labels === 'object' ? m.labels : (m.labels = d);
    for(const k of Object.keys(d)) if(L[k] === undefined) L[k] = d[k];
    L.kinds = { ...d.kinds, ...L.kinds }; L.custom = { ...d.custom, ...L.custom }; L.company = { ...d.company, ...L.company }; L.show = { ...d.show, ...L.show };
    return L;
  }
  const sheetOf = L => L.sheet === 'custom' ? customSheet(L.custom) : (SHEETS.find(s => s.id === L.sheet) || SHEETS[0]);

  // ---------- QR ----------
  function qrSvg(text){
    const qr = window.qrcode; if(!qr) return '';
    try {
      qr.stringToBytes = qr.stringToBytesFuncs?.['UTF-8'] || qr.stringToBytes;
      const q = qr(0, 'L'); q.addData(text); q.make();
      const n = q.getModuleCount(); let d = '';
      for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(q.isDark(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`;
      return `<svg viewBox="0 0 ${n + 2} ${n + 2}" shape-rendering="crispEdges" style="width:100%;height:100%;display:block"><rect width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    } catch { return ''; }
  }

  // ---------- Content ----------
  function itemsFor(dc, L){
    const m = M(), E = window.RackEngine; if(!E || !m.byDim?.get(dc)) return [];
    const P = E.computeRackPlan(m, dc), owners = E.ownerColors(P), out = [];
    const typeName = ty => [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '';
    const rackName = ri => ri < 0 ? t('Loose', 'Los') : (P.racks[ri]?.placement.name || P.racks[ri]?.rack?.name || `Rack ${ri + 1}`);
    const feeders = id => [...new Set(P.lines.filter(l => l.owner === id && l.feed?.node).map(l => l.feed.node))];
    const dests = id => { const d = P.lines.filter(l => l.owner === id && l.dest).map(l => l.dest); return d.length ? `${trim(d[0], 22)}${d.length > 1 ? ` +${d.length - 1}` : ''}` : ''; };
    const sockets = [];   // { label, where, owner, kind }
    for(const g of P.groups){
      if(g.lk) sockets.push({ label:g.label, where:g.loose ? t('Loose LK spider', 'Losse LK-spin') : rackName(g.rack), owner:g.lk.id, kind:'LK' });
      for(const v of g.vims) if(v.used) sockets.push({ label:v.label, where:rackName(g.rack), owner:v.used.id, kind:'Veam' });
    }
    for(const v of P.soloVims) if(v.used) sockets.push({ label:v.label, where:v.loose ? t('Loose Veam4 spider', 'Losse Veam4-spin') : rackName(v.rack), owner:v.used.id, kind:'Veam' });
    const qrText = (id, extra) => {
      const rows = P.lines.filter(l => l.owner === id).slice(0, 8).map(l => `${l.label.split(' · ').pop()} U${l.universe} ${trim(l.dest, 18)}`.trim());
      return trim([`${id} · ${dc}`, extra, ...rows].filter(Boolean).join("\n"), 170);
    };
    if(L.kinds.cables){
      const done = new Set();
      for(const s of sockets){
        const n = feeders(s.owner); done.add(s.owner);
        out.push({ kind:'cable', dc, title:s.owner, sub:`${dc} · ${s.label}`, lines:[s.where, n.length ? `${t('Node', 'Node')} ${n.join(' + ')}` : ''].filter(Boolean), color:owners.get(s.owner), badge:n[0] || '', copies:2 });
      }
      for(const lk of m.byLK.values()){   // Veam cables between an LK slot and a Veam
        if(lk.dimcity !== dc) continue;
        for(const slot of [1, 2, 3]){ const vid = lk.veam?.[slot]; if(!vid || !m.byVeam.has(vid) || done.has(vid)) continue; done.add(vid);
          out.push({ kind:'cable', dc, title:vid, sub:`${dc} · ${lk.id} ${t('slot', 'slot')} ${'ABC'[slot - 1]}`, lines:[dests(vid)].filter(Boolean), color:owners.get(lk.id) || owners.get(vid), badge:'', copies:2 }); }
      }
    }
    if(L.kinds.strips) for(const s of sockets) out.push({ kind:'strip', dc, title:s.label, sub:`→ ${s.owner}`, lines:[s.where, dests(s.owner)].filter(Boolean), color:owners.get(s.owner), badge:feeders(s.owner)[0] || '', copies:1 });
    if(L.kinds.nodePorts) for(const n of P.nodes) n.ports.forEach((p, i) => { if(p) out.push({ kind:'port', dc, title:`${n.label} · ${i + 1}`, sub:`U${p.universe}`, lines:[`${p.owner} ${p.ownerPort === 'in' ? 'in' : p.ownerPort}`, trim(p.dest, 24)].filter(Boolean), color:n.color, badge:n.label, copies:1 }); });
    if(L.kinds.devices){
      P.racks.forEach((R, ri) => { if(!R.rack) return; out.push({ kind:'device', dc, title:rackName(ri), sub:`${R.rack.heightU}U${R.rack.articleKey ? ` · ${R.rack.articleKey}` : ''}`, lines:[dc], color:'#475569', badge:'', copies:1 });
        let sw = 0; for(const it of (R.rack.items || [])) if(it.kind === 'switch'){ const ty = (m.networkDevices?.switchTypes || []).find(x => x.id === it.typeId); out.push({ kind:'device', dc, title:`SW${++sw}`, sub:typeName(ty), lines:[rackName(ri), dc], color:'#a78bfa', badge:'', copies:1 }); } });
      for(const n of P.nodes) out.push({ kind:'device', dc, title:n.label, sub:typeName(n.type), lines:[n.loose ? (n.name || t('Loose node', 'Losse node')) : rackName(n.rack), dc], color:n.color, badge:n.label, copies:1 });
      for(const s of P.splitters) out.push({ kind:'device', dc, title:s.label, sub:typeName(s.type), lines:[rackName(s.rack), dc], color:s.feedColor || '#35c47c', badge:'', copies:1 });
    }
    if(L.kinds.netCables && window.NetCables){   // Cat looms: one label per line, both ends, in the colour of its VLAN
      for(const c of window.NetCables.cables(dc)) for(const l of c.lines){ if(l.empty) continue; const v = l.vlan != null ? window.Fent?.vlanById(l.vlan) : null;
        out.push({ kind:'netCable', dc, title:`${c.id}.${l.port}`, sub:`${dc} · ${c.id}`, lines:[v ? `${v.id} ${v.name}` : '', l.dest].filter(Boolean), color:v?.color || '#94a3b8', badge:'', copies:2 }); }
    }
    if(L.kinds.switchPorts && window.FentUI){   // label strip for the switch: port, device and VLAN colour of the FENT scheme
      for(const r of window.FentUI.portPlan(dc).rows){
        const v = window.Fent?.vlanById(r.vlans[0]);
        out.push({ kind:'switchPort', dc, title:`${t('Port', 'Poort')} ${r.port}`, sub:`${r.device}${r.ethCount > 1 ? ` ETH${r.eth}` : ''}`, lines:[r.vlans.map(x => { const q = window.Fent?.vlanById(x); return q ? `${q.id} ${q.name}` : x; }).join(' + '), r.cable ? r.dest : (r.ips[0] || '')].filter(Boolean), color:v?.color || '#94a3b8', badge:r.mode === 'trunk' ? 'TRUNK' : '', copies:1 });
      }
    }
    if(L.kinds.qr){
      for(const s of sockets) out.push({ kind:'qr', dc, title:s.owner, sub:`${dc} · ${s.label}`, lines:[s.where, feeders(s.owner).join(' + ')].filter(Boolean), color:owners.get(s.owner), badge:'', qr:qrText(s.owner, `${s.label} @ ${s.where}`), copies:1 });
      P.racks.forEach((R, ri) => { if(R.rack) out.push({ kind:'qr', dc, title:rackName(ri), sub:`${R.rack.heightU}U · ${dc}`, lines:[R.rack.articleKey || ''].filter(Boolean), color:'#475569', badge:'', qr:trim(`${rackName(ri)} · ${dc}\n${P.nodes.filter(n => n.rack === ri).map(n => `${n.label} ${typeName(n.type)}`).join('\n')}`, 300), copies:1 }); });
    }
    return out.flatMap(it => Array.from({ length:it.copies || 1 }, () => it));
  }
  function allItems(L){
    const dcs = App.sortedDims().filter(d => !L.dcs || L.dcs.includes(d));
    return dcs.map(dc => ({ dc, items:itemsFor(dc, L) })).filter(g => g.items.length);
  }

  // ---------- Pages ----------
  function paginate(groups, sh, start, perDc){
    const per = perSheet(sh), pages = []; let first = true;
    const seq = perDc ? groups.map(g => g.items.map(it => it)) : [groups.flatMap(g => g.items)];
    for(const items of seq){
      let off = first ? Math.max(0, Math.min(per - 1, (start | 0) - 1)) : 0; first = false;
      let i = 0;
      while(i < items.length || !pages.length){
        const take = items.slice(i, i + per - off);
        pages.push({ off, cells:take }); i += take.length; off = 0;
        if(!take.length) break;
      }
    }
    return pages;
  }
  const cellPos = (sh, idx) => { const c = idx % sh.cols, r = Math.floor(idx / sh.cols); return { x:sh.left + c * (sh.w + sh.gapX), y:sh.top + r * (sh.h + sh.gapY) }; };

  function imagesOf(L){
    const m = M(), brand = m.pdfSettings?.layout?.brand;
    return { company:L.company.on ? (L.company.img || brand?.logo || null) : null, show:L.show.on ? (L.show.img || m.projectMeta?.logo || null) : null };
  }
  function cellHtml(it, sh, L, imgs, idx){
    const { x, y } = cellPos(sh, idx);
    const u = Math.min(1, sh.h / 25.4), pad = 1.1, bandW = 1.6;
    const band = L.mono ? '#000' : (it.color || '#94a3b8');
    const withQr = !!it.qr, qrS = +(sh.h - 2 * pad - .4).toFixed(2);
    const hasImg = (imgs.company || imgs.show) && (!withQr || sh.w >= 60), imgW = hasImg ? 11 : 0;
    const left = bandW + pad + (withQr ? qrS + pad : 0), right = pad + (hasImg ? imgW + 0.6 : 0);
    const badge = it.badge ? `<b class="bd" style="${L.mono ? 'border:.25mm solid #000;color:#000' : `background:${it.color || '#475569'};color:#fff`}">${esc(it.badge)}</b>` : '';
    const lines = (it.lines || []).slice(0, withQr ? 3 : 3).map(s => `<div class="l">${esc(s)}</div>`).join('');
    const im = hasImg ? `<div class="im" style="width:${imgW}mm">${imgs.show ? `<img src="${esc(imgs.show)}" alt="">` : '<span></span>'}${imgs.company ? `<img src="${esc(imgs.company)}" alt="">` : ''}</div>` : '';
    return `<div class="lb${withQr ? ' q' : ''}" style="left:${x.toFixed(3)}mm;top:${y.toFixed(3)}mm;width:${sh.w}mm;height:${sh.h}mm;--u:${u.toFixed(3)}">
      <i class="band" style="background:${band};width:${bandW}mm"></i>
      ${withQr ? `<div class="qr" style="left:${bandW + pad}mm;width:${qrS}mm;height:${qrS}mm">${qrSvg(it.qr)}</div>` : ''}
      <div class="tx" style="left:${left}mm;right:${right}mm"><div class="t">${badge}<span>${esc(it.title)}</span></div>${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ''}${lines}</div>${im}</div>`;
  }
  const labelCss = () => `
    @page{size:210mm 297mm;margin:0}
    *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff;font-family:Helvetica,Arial,sans-serif;color:#000}
    .sheet{position:relative;width:210mm;height:296.5mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
    .sheet:last-child{page-break-after:auto;break-after:auto}
    .lb{position:absolute;overflow:hidden}
    .lb.o{outline:.15mm solid #9aa3b2;outline-offset:-.15mm}
    .band{position:absolute;left:0;top:0;bottom:0}
    .tx{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:calc(.35mm*var(--u));min-width:0}
    .t{display:flex;align-items:center;gap:.8mm;font-weight:800;font-size:calc(4.5mm*var(--u));line-height:1.05;white-space:nowrap;overflow:hidden}
    .t span{overflow:hidden;text-overflow:ellipsis}
    .q .t{font-size:calc(3.7mm*var(--u))}
    .bd{font-size:calc(2.6mm*var(--u));padding:.1mm .8mm;border-radius:.6mm;line-height:1.3;flex:none}
    .s{font-size:calc(2.9mm*var(--u));line-height:1.1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .l{font-size:calc(2.5mm*var(--u));line-height:1.1;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .q .s{font-size:calc(2.6mm*var(--u))}.q .l{font-size:calc(2.3mm*var(--u))}
    .qr{position:absolute;top:50%;transform:translateY(-50%)}
    .im{position:absolute;right:1mm;top:1mm;bottom:1mm;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end}
    .im img{max-width:100%;max-height:48%;object-fit:contain;display:block}
  `;
  function buildHtml(L, { preview = false, calibration = false } = {}){
    const sh = sheetOf(L), imgs = imagesOf(L);
    let pages;
    if(calibration) pages = [{ off:0, cells:[] }];
    else pages = paginate(allItems(L), sh, L.start, L.perDc);
    const sheets = pages.map((pg, pi) => {
      let body = '';
      if(calibration){
        const rects = Array.from({ length:perSheet(sh) }, (_, i) => { const p = cellPos(sh, i); return `<rect x="${p.x.toFixed(3)}" y="${p.y.toFixed(3)}" width="${sh.w}" height="${sh.h}" fill="none" stroke="#000" stroke-width=".2"/><text x="${(p.x + 1).toFixed(2)}" y="${(p.y + 3).toFixed(2)}" font-size="2.4" font-family="Helvetica,Arial,sans-serif" fill="#555">${i + 1}</text>`; }).join('');
        body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 296.5" width="210mm" height="296.5mm" style="position:absolute;left:0;top:0">${rects}
          <text x="105" y="${(sh.top / 2 + 1).toFixed(2)}" text-anchor="middle" font-size="3" font-family="Helvetica,Arial,sans-serif" fill="#000">${esc(sheetName(sh))} — calibration sheet: print at 100% (Actual size), hold it against a real sheet in front of a light</text></svg>`;
      } else body = pg.cells.map((it, k) => cellHtml(it, sh, L, imgs, pg.off + k)).join('').replace(/class="lb( q)?"/g, (m0, q) => `class="lb${q || ''}${L.outline ? ' o' : ''}"`);
      return `<section class="sheet" ${pi === 0 ? '' : ''}>${body}</section>`;
    }).join('');
    const screen = preview ? `html{background:#2a2e35}body{padding:16px 0 30px;zoom:var(--zoom,1)}.sheet{margin:0 auto 16px;box-shadow:0 4px 18px rgba(0,0,0,.4);outline:1px solid #ccc}` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Stickers</title><style>${labelCss()}${screen}</style></head><body>${sheets}</body></html>`;
  }

  // ---------- Dialog ----------
  let B = null;
  function open(opts = {}){
    const m = M(); if(!m || !App.sortedDims().length){ App.ui.toast(t('Import or add a patch first', 'Importeer of voeg eerst een patch toe'), 'info'); return; }
    const L = state();
    if(Array.isArray(opts.dcs) && opts.dcs.length) L.dcs = opts.dcs.slice();
    B = { L, tab:null, timer:null };
    mount();
  }
  function close(){ document.getElementById('lbRoot')?.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fitZoom); B = null; }
  const onKey = e => { if(B && e.key === 'Escape' && !document.querySelector('.modal-backdrop')){ e.preventDefault(); close(); } };
  const changed = () => { const m = M(); if(m?.ui) m.ui.dirty = true; schedule(); };
  function schedule(){ clearTimeout(B?.timer); if(B) B.timer = setTimeout(preview, 140); }

  function mount(){
    document.getElementById('lbRoot')?.remove();
    const root = document.createElement('div'); root.id = 'lbRoot'; root.className = 'rb';
    root.innerHTML = `
      <div class="rb-top">
        <div class="rb-title">${I('grid', 18)}<div><b>${t('Stickers', 'Stickers')}</b><span id="lbSummary"></span></div></div>
        <div class="rb-top-mid"><span class="subtle" id="lbSheetInfo"></span></div>
        <div class="rb-top-actions"><button id="lbClose">${t('Close', 'Sluiten')}</button><button id="lbCal" title="${esc(t('Outlines only, to check the alignment on a real sheet', 'Alleen kaders, om de uitlijning op een echt vel te controleren'))}">${I('layout', 14)}${t('Calibration sheet', 'Kalibratieblad')}</button><button class="primary" id="lbExport">${I('download', 15)}<span>${t('Export PDF', 'PDF exporteren')}</span></button></div>
      </div>
      <div class="rb-body"><aside class="rb-panel"><div class="rb-panel-body" id="lbPanel"></div></aside>
        <section class="rb-preview"><div class="rb-preview-bar"><span class="subtle" id="lbPageInfo"></span><span class="spacer"></span><span class="subtle rb-hint">${I('info', 13)} ${t('Print the PDF at 100% (Actual size), no fit-to-page, from your laser printer', 'Print de PDF op 100% (Werkelijke grootte), niet passend maken, vanaf je laserprinter')}</span></div><iframe id="lbFrame" title="Sticker preview"></iframe></section></div>`;
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey, true); window.addEventListener('resize', fitZoom);
    root.querySelector('#lbClose').onclick = close;
    root.querySelector('#lbCal').onclick = () => exportPdf(true);
    root.querySelector('#lbExport').onclick = () => exportPdf(false);
    renderPanel(); preview(true);
  }
  function counts(){
    const L = B.L, out = {};
    for(const k of Object.keys(L.kinds)){ const one = { ...L, kinds:Object.fromEntries(Object.keys(L.kinds).map(x => [x, x === k])) }; out[k] = allItems(one).reduce((n, g) => n + g.items.length, 0); }
    return out;
  }
  function renderPanel(){
    const L = B.L, p = document.getElementById('lbPanel'); if(!p) return;
    const keep = p.scrollTop, sh = sheetOf(L), dims = App.sortedDims(), cnt = counts();
    const sw = (k, on, label, hint = '') => `<label class="rb-row"><span>${label}${hint ? `<span class="hint" style="display:block;margin:2px 0 0">${hint}</span>` : ''}</span><span class="switch"><input type="checkbox" data-sw="${k}" ${on ? 'checked' : ''}><span></span></span></label>`;
    const img = (k, label) => `<div class="rb-row" style="cursor:default"><span>${label}</span><span style="display:flex;gap:6px"><button class="sm" data-pick="${k}">${t('Choose…', 'Kies…')}</button>${L[k].img ? `<button class="sm ghost" data-clear="${k}" title="${esc(t('Use the default', 'Standaard gebruiken'))}">${I('x', 13)}</button>` : ''}</span></div>`;
    const field = (k, label) => `<label class="field">${label}<input type="text" inputmode="decimal" data-c="${k}" value="${esc(L.custom[k])}"></label>`;
    const sel = L.dcs || dims;
    p.innerHTML = `
      <div class="rb-group"><div class="rb-label">DimCities <span class="subtle">${sel.length}/${dims.length}</span></div>
        <div class="rb-chips">${dims.map(d => `<label class="rb-chip ${sel.includes(d) ? 'on' : ''}"><input type="checkbox" data-dc="${esc(d)}" ${sel.includes(d) ? 'checked' : ''}><i class="dot" style="background:${App.dimColor(d)}"></i>${esc(d)}</label>`).join('')}</div>
        <div style="display:flex;gap:6px;margin-top:8px"><button class="sm" data-all>${t('All', 'Alle')}</button></div>
        ${sw('perDc', L.perDc, t('Start a new sheet for each DimCity', 'Begin een nieuw vel voor elke DimCity'), t('Hand each DB its own sheet', 'Geef elke DB zijn eigen vel'))}</div>
      <div class="rb-group"><div class="rb-label">${t('Sheet', 'Vel')}</div>
        <select data-sheet style="width:100%">${SHEETS.map(s => `<option value="${s.id}" ${L.sheet === s.id ? 'selected' : ''}>${esc(sheetName(s))}</option>`).join('')}<option value="custom" ${L.sheet === 'custom' ? 'selected' : ''}>${t('Custom sheet…', 'Eigen vel…')}</option></select>
        <div class="hint" style="margin-top:6px">${perSheet(sh)} ${t('labels per sheet', 'labels per vel')} · ${t('left', 'links')} ${String(sh.left).replace('.', ',')} mm · ${t('top', 'boven')} ${String(sh.top).replace('.', ',')} mm${sh.gapX ? ` · ${t('gap', 'tussenruimte')} ${String(sh.gapX).replace('.', ',')} mm` : ''}</div>
        ${L.sheet === 'custom' ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">${field('w', t('Label width (mm)', 'Labelbreedte (mm)'))}${field('h', t('Label height (mm)', 'Labelhoogte (mm)'))}${field('cols', t('Columns', 'Kolommen'))}${field('rows', t('Rows', 'Rijen'))}${field('left', t('Left margin (mm)', 'Marge links (mm)'))}${field('top', t('Top margin (mm)', 'Marge boven (mm)'))}${field('gapX', t('Gap across (mm)', 'Ruimte opzij (mm)'))}${field('gapY', t('Gap down (mm)', 'Ruimte onder (mm)'))}</div>` : `<div class="hint">${t('Taken from the HERMA label template of this format.', 'Overgenomen uit het HERMA-sjabloon van dit formaat.')}</div>`}
        <label class="field" style="margin-top:10px">${t('Start at label', 'Begin bij label')}<input type="number" min="1" max="${perSheet(sh)}" data-start value="${L.start}"></label>
        <div class="hint">${t('For a part-used sheet: the first sheet skips the labels before this number.', 'Voor een deels gebruikt vel: het eerste vel slaat de labels voor dit nummer over.')}</div>
        <div class="hint">${t('Use a sheet marked for laser printers (check the pack) — the templates do not say which printers a sheet suits.', 'Gebruik een vel dat voor laserprinters is bedoeld (kijk op de verpakking) — de sjablonen vermelden niet voor welke printers een vel geschikt is.')}</div></div>
      <div class="rb-group"><div class="rb-label">${t('What to print', 'Wat printen')}</div>
        ${sw('k:cables', L.kinds.cables, `${t('Cable labels', 'Kabellabels')} <span class="subtle">${cnt.cables}</span>`, t('LK multicores and Veam cables, 2 per cable (both ends)', 'LK-multicores en Veam-kabels, 2 per kabel (beide uiteinden)'))}
        ${sw('k:strips', L.kinds.strips, `${t('Panel connection labels', 'Aansluitlabels paneel')} <span class="subtle">${cnt.strips}</span>`, t('One per LK7-1 / Veam4 socket', 'Eén per LK7-1- / Veam4-aansluiting'))}
        ${sw('k:nodePorts', L.kinds.nodePorts, `${t('Node port labels', 'Nodepoort-labels')} <span class="subtle">${cnt.nodePorts}</span>`, t('Universe and where each port goes', 'Universe en waar elke poort heen gaat'))}
        ${sw('k:devices', L.kinds.devices, `${t('Racks, nodes, switches, splitters', 'Racks, nodes, switches, splitters')} <span class="subtle">${cnt.devices}</span>`)}
        ${sw('k:netCables', L.kinds.netCables, `${t('Network cable labels', 'Netwerkkabel-labels')} <span class="subtle">${cnt.netCables}</span>`, t('C cables: one per line, both ends, in the VLAN colour', 'C-kabels: één per lijn, beide uiteinden, in de VLAN-kleur'))}
        ${sw('k:switchPorts', L.kinds.switchPorts, `${t('Switch port labels', 'Switchpoort-labels')} <span class="subtle">${cnt.switchPorts}</span>`, t('Port, device and VLAN (FENT colour) for the switch', 'Poort, apparaat en VLAN (FENT-kleur) voor de switch'))}
        ${sw('k:qr', L.kinds.qr, `${t('QR stickers', 'QR-stickers')} <span class="subtle">${cnt.qr}</span>`, t('QR code with the patch as plain text, one per LK / Veam / rack', 'QR-code met de patch als platte tekst, één per LK / Veam / rack'))}</div>
      <div class="rb-group"><div class="rb-label">${t('Images and look', 'Afbeeldingen en uiterlijk')}</div>
        ${sw('company', L.company.on, t('Company image', 'Bedrijfsafbeelding'), t('Default: the company logo of the report brand', 'Standaard: het bedrijfslogo uit de huisstijl van het rapport'))}${L.company.on ? img('company', t('Image', 'Afbeelding')) : ''}
        ${sw('show', L.show.on, t('Show image', 'Showafbeelding'), t('Default: the logo of the project', 'Standaard: het logo van het project'))}${L.show.on ? img('show', t('Image', 'Afbeelding')) : ''}
        ${sw('mono', L.mono, t('Black and white', 'Zwart-wit'), t('For a mono laser printer: colour bands become black', 'Voor een zwart-wit laserprinter: kleurbanden worden zwart'))}
        ${sw('outline', L.outline, t('Draw label outlines', 'Teken label-kaders'), t('Only for a test print on plain paper', 'Alleen voor een testprint op gewoon papier'))}</div>`;
    p.scrollTop = keep;
    const sum = allItems(L).reduce((n, g) => n + g.items.length, 0);
    const pages = paginate(allItems(L), sh, L.start, L.perDc).filter(pg => pg.cells.length).length;
    document.getElementById('lbSummary').textContent = `${sum} ${t('labels', 'labels')} · ${pages} ${pages === 1 ? t('sheet', 'vel') : t('sheets', 'vellen')}`;
    document.getElementById('lbSheetInfo').textContent = sheetName(sh);
    bindPanel(p);
  }
  function bindPanel(p){
    const L = B.L;
    p.querySelectorAll('[data-dc]').forEach(c => c.onchange = () => { const dims = App.sortedDims(); const cur = new Set(L.dcs || dims); c.checked ? cur.add(c.dataset.dc) : cur.delete(c.dataset.dc); L.dcs = dims.filter(d => cur.has(d)); if(L.dcs.length === dims.length) L.dcs = null; changed(); renderPanel(); });
    p.querySelector('[data-all]').onclick = () => { L.dcs = null; changed(); renderPanel(); };
    p.querySelector('[data-sheet]').onchange = e => { L.sheet = e.target.value; L.start = Math.min(L.start, perSheet(sheetOf(L))); changed(); renderPanel(); };
    p.querySelectorAll('[data-c]').forEach(i => i.onchange = () => { L.custom[i.dataset.c] = i.value; changed(); renderPanel(); });
    const st = p.querySelector('[data-start]'); st.onchange = () => { L.start = Math.max(1, Math.min(perSheet(sheetOf(L)), num(st.value, 1) | 0)); changed(); renderPanel(); };
    p.querySelectorAll('[data-sw]').forEach(i => i.onchange = () => { const k = i.dataset.sw; if(k.startsWith('k:')) L.kinds[k.slice(2)] = i.checked; else if(k === 'company' || k === 'show') L[k].on = i.checked; else L[k] = i.checked; changed(); renderPanel(); });
    p.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pickImage(b.dataset.pick));
    p.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { L[b.dataset.clear].img = null; changed(); renderPanel(); });
  }
  function pickImage(k){
    const inp = Object.assign(document.createElement('input'), { type:'file', accept:'image/png,image/jpeg,image/svg+xml,image/webp' });
    inp.onchange = () => { const f = inp.files?.[0]; if(!f) return; const r = new FileReader(); r.onload = () => shrink(String(r.result)).then(d => { B.L[k].img = d; changed(); renderPanel(); }); r.readAsDataURL(f); };
    inp.click();
  }
  // keep the project file small: big pictures are scaled down to 500 px (SVG stays as it is)
  function shrink(url){
    return new Promise(res => { if(url.startsWith('data:image/svg')) return res(url); const im = new Image(); im.onload = () => { const s = Math.min(1, 500 / Math.max(im.width, im.height)); if(s >= 1 && url.length < 250000) return res(url); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); }; im.onerror = () => res(url); im.src = url; });
  }
  function preview(first){
    if(!B) return;
    const frame = document.getElementById('lbFrame'); if(!frame) return;
    const L = B.L, html = buildHtml(L, { preview:true });
    frame.onload = () => { fitZoom(); const n = frame.contentDocument?.querySelectorAll('.sheet').length || 0; const info = document.getElementById('lbPageInfo'); if(info) info.textContent = `${n} ${n === 1 ? t('sheet', 'vel') : t('sheets', 'vellen')} ${t('in preview', 'in voorbeeld')}`; };
    frame.srcdoc = html;
    if(!first) renderSummaryOnly();
  }
  function renderSummaryOnly(){ const L = B.L, sh = sheetOf(L); const sum = allItems(L).reduce((n, g) => n + g.items.length, 0); const pages = paginate(allItems(L), sh, L.start, L.perDc).filter(pg => pg.cells.length).length; const s = document.getElementById('lbSummary'); if(s) s.textContent = `${sum} ${t('labels', 'labels')} · ${pages} ${pages === 1 ? t('sheet', 'vel') : t('sheets', 'vellen')}`; }
  function fitZoom(){ const f = document.getElementById('lbFrame'), d = f?.contentDocument; if(!d?.body) return; d.body.style.setProperty('--zoom', String(Math.max(.3, Math.min(1.3, (f.clientWidth - 40) / (210 * 3.7795))))); }

  async function exportPdf(calibration){
    if(!B) return;
    const L = B.L, html = buildHtml(L, { calibration });
    if(!calibration && !allItems(L).length){ App.ui.toast(t('Nothing to print with these choices', 'Niets te printen met deze keuzes'), 'info'); return; }
    const base = (M().projectMeta?.project || 'PatchLab').replace(/[^a-z0-9_-]+/gi, '_');
    const name = calibration ? `${base}-sticker-calibration.pdf` : `${base}-stickers${L.dcs && L.dcs.length === 1 ? `-${L.dcs[0]}` : ''}.pdf`;
    const btn = document.getElementById('lbExport'); btn.disabled = true;
    try {
      const out = await window.app?.exportPdfFromHtml?.({ html, defaultPath:name, landscape:false, pageSize:'A4', footer:null, brand:null });
      if(out) App.ui.toast(`${t('Exported', 'Geëxporteerd')} ${out.split(/[\\/]/).pop()}`, 'ok', { action:{ label:t('Show in folder', 'Toon in map'), run:() => window.app?.showItemInFolder?.(out) }, ms:6000 });
    } catch(err){ App.ui.toast(`${t('PDF export failed', 'PDF-export mislukt')}: ${err?.message || err}`, 'err', { ms:7000 }); }
    finally { if(btn.isConnected) btn.disabled = false; }
  }

  window.Labels = { open, close, SHEETS, buildHtml, itemsFor, allItems, paginate, cellPos, sheetOf, state, defaults };
})();
document.getElementById('tbStickers')?.addEventListener('click', () => window.Labels.open());
