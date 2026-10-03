// ui/fibre-view.js — the fibre overview of the Signal Flow page: every location (DB, FOH …) on a circle with its switches,
// the fibre ports with their numbers and connectors, and the cables between them. Pick a cable at the bottom, click a free port
// and then another one to draw a fibre. Auto-assign uses the stock (Network page → Fibres).
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const S = { type:null, pending:null, sel:null, zoom:1, tx:0, ty:0, fit:true, layout:null };

  const CW = 270, HEAD = 30, SH = 66, GAP = 8, PW = 34, PH = 24;
  const F = () => window.Fibers;

  // ---- model -> geometry ----
  function build(){
    const locs = [];
    for(const dc of App.sortedDims()){
      const sws = (window.NetSwitches?.list(dc) || []).filter(s => s.sfp > 0 || s.rj > 0);
      if(sws.length) locs.push({ id:dc, dc, color:App.dimColor(dc), sws });
    }
    // ends that are not a switch of the show: "other end" cards
    const known = new Set(locs.map(l => l.id));
    for(const l of F().all()) for(const e of [l.a, l.b]) if(e?.free && !known.has('~' + e.free)){ known.add('~' + e.free); locs.push({ id:'~' + e.free, dc:null, free:e.free, color:'#64748b', sws:[] }); }
    const n = locs.length, R = n <= 1 ? 0 : n === 2 ? 0 : Math.max(300, 78 * n + 120);
    locs.forEach((l, i) => {
      l.h = HEAD + Math.max(1, l.sws.length) * (SH + GAP) + 6; l.w = CW;
      if(n === 1){ l.x = -CW / 2; l.y = -l.h / 2; }
      else if(n === 2){ l.x = (i ? 1 : -1) * 260 - CW / 2; l.y = -l.h / 2; }
      else { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; l.x = R * 1.25 * Math.cos(a) - CW / 2; l.y = R * Math.sin(a) - l.h / 2; }
    });
    const ports = new Map();   // `${dc}|${sw}|${n}` -> { x, y, loc, sw, n }
    for(const l of locs) l.sws.forEach((s, si) => {
      s.y = l.y + HEAD + si * (SH + GAP);
      for(let k = 1; k <= s.sfp; k++) ports.set(`${l.dc}|${s.label}|${k}`, { x:l.x + 14 + (k - 1) * (PW + 4) + PW / 2, y:s.y + 48, loc:l, sw:s, n:k });
    });
    return { locs, ports, R };
  }
  const keyOf = e => `${e.dc}|${e.sw}|${e.sfp}`;

  function cableSvg(link, g, idx){
    const a = g.ports.get(keyOf(link.a || {})), b = g.ports.get(keyOf(link.b || {}));
    if(!a || !b) return '';
    const col = F().color(link), sel = S.sel === link.id;
    let d, mx, my;
    if(a.loc === b.loc){
      const top = a.y <= b.y ? a : b, low = top === a ? b : a, lane = (idx % 3) * 4;
      const xr = a.loc.x + CW + 22 + (idx % 4) * 9, y1 = top.y + PH / 2 + 6 + lane, y2 = low.y - PH / 2 - 6 - lane;
      d = `M${top.x},${top.y + PH / 2} L${top.x},${y1} L${xr},${y1} L${xr},${y2} L${low.x},${y2} L${low.x},${low.y - PH / 2}`;
      mx = xr; my = (y1 + y2) / 2;
    } else {
      const x1 = a.x, y1 = a.y - PH / 2, x2 = b.x, y2 = b.y - PH / 2;
      const cx = (x1 + x2) / 2 * .55, cy = (y1 + y2) / 2 * .55 - 10;   // bend towards the middle of the circle
      d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
      mx = .25 * x1 + .5 * cx + .25 * x2; my = .25 * y1 + .5 * cy + .25 * y2;
    }
    const label = F().code(link.typeId);
    const w = label.length * 7 + 12;
    return `<g class="fv-cable ${sel ? 'sel' : ''}" data-link="${esc(link.id)}" style="--c:${col}"><path class="fv-hit" d="${d}"/><path class="fv-line" d="${d}" stroke="${col}"/><rect x="${mx - w / 2}" y="${my - 9}" width="${w}" height="16" rx="4" fill="#0e1117" stroke="${col}"/><text x="${mx}" y="${my + 3}" text-anchor="middle" class="fv-code" fill="${col}">${esc(label)}</text><title>${esc(link.id)} · ${esc(F().typeName(F().typeOf(link.typeId)))} · ${esc(F().endLabel(link.a))} ⇄ ${esc(F().endLabel(link.b))}</title></g>`;
  }
  function locSvg(l, usage){
    let o = `<g class="fv-loc" style="--c:${l.color}"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="10" class="fv-card"/><rect x="${l.x}" y="${l.y}" width="5" height="${l.h}" rx="2" fill="${l.color}"/><text x="${l.x + 16}" y="${l.y + 20}" class="fv-title">${esc(l.free || l.dc)}</text>`;
    if(l.free) o += `<text x="${l.x + 16}" y="${l.y + 44}" class="fv-sub">${t('other end', 'andere kant')}</text>`;
    for(const s of l.sws){
      const SP = window.SwPorts, ty = s.type;
      o += `<rect x="${l.x + 8}" y="${s.y}" width="${CW - 16}" height="${SH}" rx="6" class="fv-sw"/><text x="${l.x + 16}" y="${s.y + 16}" class="fv-swt">${esc(s.label)}</text><text x="${l.x + CW - 14}" y="${s.y + 16}" text-anchor="end" class="fv-sub">${esc([ty?.brand, ty?.name].filter(Boolean).join(' ').slice(0, 26))}</text>`;
      const ps = [];
      for(let k = 1; k <= s.sfp; k++){
        const px = l.x + 14 + (k - 1) * (PW + 4), py = s.y + 48 - PH / 2, key = `${l.dc}|${s.label}|${k}`, link = usage.get(key);
        const conn = SP.conn(ty, k), cls = SP.kindOf(conn), base = cls === 'oc' ? '#35a7ff' : cls === 'ff' ? '#ff4d4d' : '#94a3b8';
        const col = link ? F().color(link) : base, pend = S.pending === key;
        ps.push(`<g class="fv-port ${link ? 'used' : 'free'} ${pend ? 'pend' : ''}" data-port="${esc(key)}" style="--c:${col}"><rect x="${px}" y="${py}" width="${PW}" height="${PH}" rx="5" fill="${link ? col : '#0b0d10'}" fill-opacity="${link ? .28 : 1}" stroke="${col}" stroke-width="${pend ? 3 : 1.6}"/><text x="${px + PW / 2}" y="${py + 11}" text-anchor="middle" class="fv-pn">${esc(SP.short(ty, k))}</text><text x="${px + PW / 2}" y="${py + 20}" text-anchor="middle" class="fv-pc">${esc(conn ? conn.replace(/ DUO| QUAD/i, '').slice(0, 7) : 'SFP')}</text><title>${esc(SP.label(ty, k))}${link ? ` · ${esc(link.id)} ${esc(F().code(link.typeId))} → ${esc(F().endLabel(keyOf(link.a) === key ? link.b : link.a))}` : ` · ${t('free', 'vrij')}`}</title></g>`);
      }
      o += ps.join('');
      if(!s.sfp) o += `<text x="${l.x + 16}" y="${s.y + 46}" class="fv-sub">${t('no fibre ports', 'geen fiberpoorten')}</text>`;
      o += `<text x="${l.x + CW - 14}" y="${s.y + SH - 8}" text-anchor="end" class="fv-sub">${s.rj} ${t('copper', 'koper')}${s.sfp ? ` · ${s.sfp} ${t('fibre', 'fiber')}` : ''}</text>`;
    }
    return o + '</g>';
  }

  // ---- page ----
  function render(root){
    const types = (M().networkDevices.cableTypes || []).filter(ty => ty.medium !== 'cat');
    if(!S.type || !types.some(x => x.id === S.type)) S.type = types.find(x => F().leftOf(x.id) > 0)?.id || types[0]?.id || null;
    const g = build(); S.layout = g;
    const links = F().all();
    const usage = new Map(); for(const l of links) for(const e of [l.a, l.b]) if(e && !e.free) usage.set(keyOf(e), l);
    const cables = links.map((l, i) => cableSvg(l, g, i)).join('');
    const sel = links.find(l => l.id === S.sel);
    const side = `<aside class="fl-side">
      <div class="fl-sec"><div class="rb-label">${t('Show', 'Tonen')}</div><div class="segmented rb-full" id="fvLayer"><button data-v="all">${t('All', 'Alles')}</button><button data-v="dmx">DMX</button><button data-v="net">${t('Network', 'Netwerk')}</button><button data-v="fibre" class="active">${t('Fibres', 'Fibers')}</button></div></div>
      <div class="fl-sec"><div class="rb-label">${t('Fibres', 'Fibers')} <span class="subtle">${links.length}</span></div>
        ${links.map(l => `<button class="fl-item fv-li ${S.sel === l.id ? 'on' : ''}" data-pick="${esc(l.id)}"><i class="dot" style="background:${F().color(l)}"></i><span>${esc(l.id)} · ${esc(F().code(l.typeId))}</span><em>${esc((l.a?.dc || l.a?.free || '') + ' ⇄ ' + (l.b?.dc || l.b?.free || ''))}</em></button>`).join('') || `<div class="subtle" style="font-size:12.5px">${t('No fibres yet — draw one or use Auto-assign.', 'Nog geen fibers — teken er een of gebruik Automatisch koppelen.')}</div>`}</div>
      <div class="fl-sec"><div class="hint">${I('info', 13)} ${t('Pick a cable below, click a free port, then click the port at the other end. Click a cable to select or delete it.', 'Kies hieronder een kabel, klik op een vrije poort en daarna op de poort aan de andere kant. Klik op een kabel om hem te selecteren of te verwijderen.')}</div></div>
    </aside>`;
    const bar = `<div class="fl-bar">
      <button class="ghost sm icon-only" id="fvOut">${I('zoomOut', 15)}</button><button class="ghost sm icon-only" id="fvIn">${I('zoomIn', 15)}</button>
      <button class="sm" id="fvFit">${I('compass', 14)}${t('Fit', 'Passend')}</button><span class="fl-sep"></span>
      <button class="sm primary" id="fvAuto">${I('check', 14)}${t('Auto-assign…', 'Automatisch koppelen…')}</button>
      <button class="sm" id="fvStock">${I('layers', 14)}${t('Stock…', 'Voorraad…')}</button>
      ${sel ? `<span class="fl-sep"></span><span class="fv-selbar"><b>${esc(sel.id)}</b> ${esc(F().code(sel.typeId))} · ${esc(F().endLabel(sel.a))} ⇄ ${esc(F().endLabel(sel.b))}</span><button class="sm danger" id="fvDel">${I('trash', 13)}${t('Delete', 'Verwijderen')}</button>` : ''}
      <span class="fl-hint">${S.pending ? t('Now click the port at the other end · Esc = cancel', 'Klik nu op de poort aan de andere kant · Esc = annuleren') : t('Drag = move · wheel = zoom', 'Sleep = verschuiven · wiel = zoomen')}</span></div>`;
    const pal = `<div class="fv-pal"><span class="rb-label" style="margin:0 8px 0 0">${t('Cable', 'Kabel')}</span>${types.map(ty => { const left = F().leftOf(ty.id), q = F().qtyOf(ty.id);
      return `<button class="fv-chip ${S.type === ty.id ? 'on' : ''} ${left === 0 ? 'out' : ''}" data-type="${esc(ty.id)}" style="--c:${esc(ty.color || '#22c3d6')}"><i></i><b>${esc(F().code(ty.id))}</b><span>${q == null ? '' : `${left}/${q}`}</span></button>`; }).join('') || `<span class="subtle">${t('Make cable types in the Device Builder (Cables).', 'Maak kabeltypes in de Device Builder (Kabels).')}</span>`}</div>`;
    const svg = `<svg id="fvSvg" xmlns="http://www.w3.org/2000/svg"><g id="fvView" transform="translate(${S.tx},${S.ty}) scale(${S.zoom})"><g>${g.locs.map(l => locSvg(l, usage)).join('')}</g><g>${cables}</g></g></svg>${g.locs.length ? '' : `<div class="empty fl-empty">${I('cable', 30)}<h3>${t('No switches yet', 'Nog geen switches')}</h3><p>${t('Add network switches to the DimCities first (Network page).', 'Voeg eerst netwerkswitches toe aan de DimCities (pagina Netwerk).')}</p></div>`}`;
    root.innerHTML = `<div class="fl-wrap">${side}<div class="fl-main">${bar}<div class="fl-canvas fv-canvas" id="fvCanvas">${svg}</div>${pal}</div></div>`;
    bind(root);
    if(S.fit){ S.fit = false; fit(); }
  }
  function bounds(){ const L = S.layout?.locs || []; if(!L.length) return null; return { x0:Math.min(...L.map(l => l.x)) - 50, y0:Math.min(...L.map(l => l.y)) - 40, x1:Math.max(...L.map(l => l.x + l.w)) + 70, y1:Math.max(...L.map(l => l.y + l.h)) + 40 }; }
  function apply(){ const v = document.getElementById('fvView'); if(v) v.setAttribute('transform', `translate(${S.tx},${S.ty}) scale(${S.zoom})`); }
  function fit(){
    const c = document.getElementById('fvCanvas'), b = bounds(); if(!c || !b) return;
    const r = c.getBoundingClientRect(), w = b.x1 - b.x0, h = b.y1 - b.y0;
    S.zoom = Math.max(.2, Math.min(1.4, Math.min(r.width / w, r.height / h)));
    S.tx = (r.width - w * S.zoom) / 2 - b.x0 * S.zoom; S.ty = (r.height - h * S.zoom) / 2 - b.y0 * S.zoom; apply();
  }
  function zoomAt(z, px, py){ z = Math.max(.2, Math.min(3, z)); S.tx = px - (px - S.tx) * (z / S.zoom); S.ty = py - (py - S.ty) * (z / S.zoom); S.zoom = z; apply(); }

  function bind(root){
    const again = () => render(root);
    const canvas = root.querySelector('#fvCanvas');
    root.querySelectorAll('#fvLayer button').forEach(b => b.onclick = () => window.Flow.setLayer(b.dataset.v));
    root.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { S.type = b.dataset.type; again(); });
    root.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { S.sel = S.sel === b.dataset.pick ? null : b.dataset.pick; again(); });
    root.querySelector('#fvIn').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(S.zoom * 1.25, r.width / 2, r.height / 2); };
    root.querySelector('#fvOut').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(S.zoom / 1.25, r.width / 2, r.height / 2); };
    root.querySelector('#fvFit').onclick = fit;
    root.querySelector('#fvAuto').onclick = () => F().autoDialog(again);
    root.querySelector('#fvStock').onclick = () => {
      const d = App.ui.openDialog({ title:t('Fibre stock', 'Fibervoorraad'), width:'640px', body:F().stockCard(), footer:`<button class="primary" data-a="ok">${t('Done', 'Klaar')}</button>` });
      F().bindStock(d.body, () => { d.body.innerHTML = F().stockCard(); F().bindStock(d.body, () => {}); });
      d.footer.querySelector('[data-a=ok]').onclick = () => { d.close(); again(); };
    };
    const del = root.querySelector('#fvDel'); if(del) del.onclick = () => { const a = F().all(), i = a.findIndex(l => l.id === S.sel); if(i >= 0){ a.splice(i, 1); M().ui.dirty = true; S.sel = null; again(); } };
    // draw: free port -> free port
    root.querySelectorAll('.fv-port').forEach(p => p.onclick = e => {
      e.stopPropagation();
      const key = p.dataset.port;
      const link = F().all().find(l => [l.a, l.b].some(x => x && !x.free && keyOf(x) === key));
      if(link){ S.sel = link.id; S.pending = null; return again(); }
      if(!S.type){ App.ui.toast(t('Pick a cable first', 'Kies eerst een kabel'), 'info'); return; }
      if(!S.pending){ S.pending = key; S.sel = null; return again(); }
      if(S.pending === key){ S.pending = null; return again(); }
      if(F().leftOf(S.type) <= 0){ App.ui.toast(t('None of that cable left in stock', 'Van die kabel is er geen meer in voorraad'), 'err'); S.pending = null; return again(); }
      const [d1, s1, n1] = S.pending.split('|'), [d2, s2, n2] = key.split('|');
      const l = F().addLink({ dc:d1, sw:s1, sfp:Number(n1) }, { dc:d2, sw:s2, sfp:Number(n2) }, S.type);
      S.pending = null; S.sel = l.id; again();
    });
    root.querySelectorAll('.fv-cable').forEach(c => c.onclick = e => { e.stopPropagation(); S.sel = S.sel === c.dataset.link ? null : c.dataset.link; S.pending = null; again(); });
    // pan / zoom
    let drag = null;
    canvas.onmousedown = e => { if(e.target.closest('.fv-port, .fv-cable')) return; drag = { x:e.clientX, y:e.clientY, tx:S.tx, ty:S.ty }; canvas.classList.add('grab'); };
    window.onmousemove = e => { if(!drag) return; S.tx = drag.tx + e.clientX - drag.x; S.ty = drag.ty + e.clientY - drag.y; apply(); };
    window.onmouseup = () => { drag = null; canvas.classList.remove('grab'); };
    canvas.onwheel = e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top); };
    canvas.onclick = e => { if(!e.target.closest('.fv-port, .fv-cable') && (S.sel || S.pending)){ S.sel = null; S.pending = null; again(); } };
    document.onkeydown = e => { if(e.key === 'Escape' && (S.pending || S.sel)){ S.pending = null; S.sel = null; again(); } };
  }
  window.FibreView = { render, state:S };
})();
