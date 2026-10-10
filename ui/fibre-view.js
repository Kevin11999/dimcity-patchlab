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
  const S = { type:null, pending:null, sel:null, zoom:1, tx:0, ty:0, fit:true, layout:null, float:null };

  const SWW = 270, CELLW = SWW + 12, HEAD = 30, SH = 66, CELLH = SH + 12, PW = 34, PH = 24, PAD = 8;
  const F = () => window.Fibers;
  const store = () => { const m = M(); m.flow ||= { v:2, dir:'ltr', labels:{}, pos:{}, view:{} }; return (m.flow.fibre ||= { loc:{}, sw:{} }); };

  // ---- model -> geometry ----
  // every location is a card; its switches sit in a grid (default: side by side) and can be dragged to another cell
  function build(){
    const locs = [], st = store();
    for(const dc of App.sortedDims()){
      const sws = (window.NetSwitches?.list(dc) || []).filter(s => s.sfp > 0 || s.rj > 0);
      if(sws.length) locs.push({ id:dc, dc, color:App.dimColor(dc), sws });
    }
    const known = new Set(locs.map(l => l.id));
    for(const l of F().all()) for(const e of [l.a, l.b]) if(e?.free && !known.has('~' + e.free)){ known.add('~' + e.free); locs.push({ id:'~' + e.free, dc:null, free:e.free, color:'#64748b', sws:[] }); }
    for(const l of locs){
      const used = new Set();
      l.sws.forEach((s, i) => {   // saved cell, else the next free one in a row of three
        const k = `${l.dc}|${s.label}`, c = st.sw[k];
        if(c && !used.has(`${c.col},${c.row}`)){ s.col = c.col; s.row = c.row; }
        else { let n = i; while(used.has(`${n % 3},${Math.floor(n / 3)}`)) n++; s.col = n % 3; s.row = Math.floor(n / 3); }
        used.add(`${s.col},${s.row}`);
      });
      const cols = Math.max(1, ...l.sws.map(s => s.col + 1)), rows = Math.max(1, ...l.sws.map(s => s.row + 1));
      l.cols = cols; l.rows = rows; l.w = PAD * 2 + cols * CELLW - 12; l.h = HEAD + rows * CELLH - 6 + PAD;
    }
    const n = locs.length;
    const maxW = Math.max(300, ...locs.map(l => l.w)), maxH = Math.max(120, ...locs.map(l => l.h));
    const rx = n <= 1 ? 0 : n === 2 ? maxW * .75 + 60 : Math.max(maxW * .9, 120 * n) + 120, ry = n <= 2 ? 0 : maxH * .9 + 100 + n * 20;
    locs.forEach((l, i) => {
      const saved = st.loc[l.id];
      if(saved){ l.x = saved.x; l.y = saved.y; return; }
      if(n === 1){ l.x = -l.w / 2; l.y = -l.h / 2; }
      else if(n === 2){ l.x = (i ? 1 : -1) * rx - l.w / 2; l.y = -l.h / 2; }
      else { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; l.x = rx * Math.cos(a) - l.w / 2; l.y = ry * Math.sin(a) - l.h / 2; }
    });
    const ports = new Map();   // `${dc}|${sw}|${n}` -> { x, y, loc, sw, n }
    for(const l of locs) for(const s of l.sws){
      s.x = l.x + PAD + s.col * CELLW; s.y = l.y + HEAD + s.row * CELLH; s.w = SWW; s.h = SH;
      if(S.float && S.float.key === `${l.dc}|${s.label}`){ s.x = S.float.x; s.y = S.float.y; }   // a switch being dragged follows the pointer, its cables with it
      for(let k = 1; k <= s.sfp; k++) ports.set(`${l.dc}|${s.label}|${k}`, { x:s.x + 14 + (k - 1) * (PW + 4) + PW / 2, y:s.y + 48, loc:l, sw:s, n:k });
    }
    return { locs, ports };
  }
  const keyOf = e => `${e.dc}|${e.sw}|${e.sfp}`;

  // ---- cables go around the switches and the texts (grid router), with right angles; where one crosses another it hops over with a little bridge ----
  function makeRouter(g){
    const b = bounds(); if(!b || !window.EdgeRouter) return null;
    const r = window.EdgeRouter.make({ x0:b.x0 - 160, y0:b.y0 - 160, x1:b.x1 + 160, y1:b.y1 + 160, cell:8 });
    g.obst = [];
    const hard = (x, y, w, h, m, kind, of) => { r.block(x, y, w, h, m); g.obst.push({ x, y, w, h, kind, of }); };
    g.locs.forEach((l, i) => {
      l.zone = i + 1; r.zone(l.zone, l.x, l.y, l.w, l.h);
      l.titleBox = { x:l.x + 10, y:l.y + 5, w:Math.max(30, String(l.free || l.dc).length * 8 + 12), h:20 };     // the name of the location
      hard(l.titleBox.x, l.titleBox.y, l.titleBox.w, l.titleBox.h, 4, 'title', l);
      if(l.free) hard(l.x + 10, l.y + 30, 90, 20, 4, 'title', l);
      for(const s of l.sws){ s.nameBox = { x:s.x + SWW - 12 - String(s.label).length * 7.4, y:s.y + 3, w:String(s.label).length * 7.4 + 8, h:16 }; hard(s.x, s.y, SWW, SH, 6, 'switch', s); }
    });
    return r;
  }
  // leaving a port upwards or downwards must not run into another switch of the same card, nor through a text (the name of the card or of the switch)
  const inX = (b, x) => x > b.x - 4 && x < b.x + b.w + 4;
  const exitOk = (p, dir) => !p.loc.sws.some(o => o !== p.sw && p.x > o.x - 6 && p.x < o.x + SWW + 6 && (dir === 'down' ? o.y > p.sw.y : o.y < p.sw.y))
    && (dir === 'down' || (!(p.loc.titleBox && inX(p.loc.titleBox, p.x)) && !(p.sw.nameBox && inX(p.sw.nameBox, p.x))));
  function routeAround(link, g, router){
    const a = g.ports.get(keyOf(link.a || {})), b = g.ports.get(keyOf(link.b || {}));
    if(!a || !b || !router) return null;
    let best = null;
    for(const da of ['down', 'up']) for(const db of ['down', 'up']){
      if(!exitOk(a, da) || !exitOk(b, db)) continue;
      const res = router.route({ from:{ x:a.x, y:da === 'down' ? a.y + PH / 2 : a.y - PH / 2, dx:0, dy:da === 'down' ? 1 : -1 }, to:{ x:b.x, y:db === 'down' ? b.y + PH / 2 : b.y - PH / 2, dx:0, dy:db === 'down' ? 1 : -1 }, zones:[a.loc.zone, b.loc.zone] });
      if(!res) continue; const cost = res.len + res.bends * 30; if(!best || cost < best.cost) best = { ...res, cost };
    }
    if(!best) return null;
    router.mark(best.pts); return { link, pts:best.pts, a, b };
  }
  function route(link, g, idx){
    const a = g.ports.get(keyOf(link.a || {})), b = g.ports.get(keyOf(link.b || {}));
    if(!a || !b) return null;
    const ca = a.loc, cb = b.loc, lane = (idx % 6) * 7;
    const cyA = ca.y + ca.h / 2, cyB = cb.y + cb.h / 2;
    let da = 'up', db = 'up';
    if(ca !== cb){ if(cyB > cyA + 4){ da = 'down'; db = 'up'; } else if(cyB < cyA - 4){ da = 'up'; db = 'down'; } }
    else if(a.sw !== b.sw){ da = db = 'up'; }
    const ya = da === 'up' ? a.y - PH / 2 : a.y + PH / 2, yb = db === 'up' ? b.y - PH / 2 : b.y + PH / 2;
    let yc;
    if(da === db){
      yc = da === 'up' ? Math.min(a.sw.y, b.sw.y, ca.y, cb.y) - 16 - lane : Math.max(a.sw.y + SH, b.sw.y + SH, ca.y + ca.h, cb.y + cb.h) + 16 + lane;
    } else {
      const top = da === 'down' ? ca : cb, bot = da === 'down' ? cb : ca;   // the card the line leaves downwards, the card it enters from above
      if(bot.y - (top.y + top.h) > 36) yc = (top.y + top.h + bot.y) / 2 + (lane - 17);
      else { da = db = 'up'; yc = Math.min(a.sw.y, b.sw.y, ca.y, cb.y) - 16 - lane; }
    }
    const pts = [[a.x, da === db ? (da === 'up' ? a.y - PH / 2 : a.y + PH / 2) : ya], [a.x, yc], [b.x, yc], [b.x, da === db ? (db === 'up' ? b.y - PH / 2 : b.y + PH / 2) : yb]];
    return { link, pts, a, b };
  }
  // path text with a hop over every vertical line of another cable that a horizontal piece crosses
  function pathOf(rt, all){
    const R = 5; let d = `M${rt.pts[0][0]},${rt.pts[0][1]}`;
    for(let i = 1; i < rt.pts.length; i++){
      const [x1, y1] = rt.pts[i - 1], [x2, y2] = rt.pts[i];
      if(y1 === y2 && x1 !== x2){
        const dir = Math.sign(x2 - x1), hops = [];
        for(const o of all) if(o !== rt) for(let j = 1; j < o.pts.length; j++){
          const [ux1, uy1] = o.pts[j - 1], [ux2, uy2] = o.pts[j];
          if(ux1 === ux2 && Math.min(uy1, uy2) + 3 < y1 && Math.max(uy1, uy2) - 3 > y1 && ux1 > Math.min(x1, x2) + R + 3 && ux1 < Math.max(x1, x2) - R - 3) hops.push(ux1);
        }
        hops.sort((p, q) => dir * (p - q));
        for(const hx of hops) d += ` L${hx - dir * R},${y1} A${R},${R} 0 0 ${dir > 0 ? 1 : 0} ${hx + dir * R},${y1}`;
        d += ` L${x2},${y2}`;
      } else d += ` L${x2},${y2}`;
    }
    return d;
  }
  function hasHop(rt, all){
    for(let i = 1; i < rt.pts.length; i++){ const [x1, y1] = rt.pts[i - 1], [x2, y2] = rt.pts[i]; if(y1 !== y2) continue;
      for(const o of all) if(o !== rt) for(let j = 1; j < o.pts.length; j++){ const [ux1, uy1] = o.pts[j - 1], [ux2, uy2] = o.pts[j]; if(ux1 === ux2 && Math.min(uy1, uy2) + 3 < y1 && Math.max(uy1, uy2) - 3 > y1 && ux1 > Math.min(x1, x2) + 8 && ux1 < Math.max(x1, x2) - 8) return true; } }
    return false;
  }
  function cablesSvg(g, quick){
    const router = quick ? null : makeRouter(g), links = F().all();
    // the short cables first: they get the straightest way, the longer ones go around them
    const len = l => { const a = g.ports.get(keyOf(l.a || {})), b = g.ports.get(keyOf(l.b || {})); return a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : 0; };
    const done = new Map(links.slice().sort((p, q) => len(p) - len(q)).map(l => [l, routeAround(l, g, router)]));
    const routes = links.map((l, i) => done.get(l) || route(l, g, i)).filter(Boolean);
    const ordered = routes.slice().sort((p, q) => (hasHop(p, routes) ? 1 : 0) - (hasHop(q, routes) ? 1 : 0));   // cables that hop over others are drawn on top
    return ordered.map(rt => {
      const link = rt.link, col = F().color(link), sel = S.sel === link.id, d = pathOf(rt, routes);
      // the label sits on the longest horizontal piece
      let best = null; for(let i = 1; i < rt.pts.length; i++){ const [x1, y1] = rt.pts[i - 1], [x2, y2] = rt.pts[i]; if(y1 === y2 && (!best || Math.abs(x2 - x1) > best.len)) best = { len:Math.abs(x2 - x1), x:(x1 + x2) / 2, y:y1 }; }
      best ||= { x:rt.pts[0][0], y:(rt.pts[0][1] + rt.pts[rt.pts.length - 1][1]) / 2 };
      const label = F().code(link.typeId), w = label.length * 7 + 12;
      const dot = (p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="${col}"/>`;
      return `<g class="fv-cable ${sel ? 'sel' : ''}" data-link="${esc(link.id)}" style="--c:${col}"><path class="fv-hit" d="${d}"/><path class="fv-halo" d="${d}"/><path class="fv-line" d="${d}" stroke="${col}"/>${dot(rt.pts[0])}${dot(rt.pts[rt.pts.length - 1])}<rect x="${best.x - w / 2}" y="${best.y - 9}" width="${w}" height="16" rx="4" fill="#0e1117" stroke="${col}"/><text x="${best.x}" y="${best.y + 3}" text-anchor="middle" class="fv-code" fill="${col}">${esc(label)}</text><title>${esc(link.id)} · ${esc(F().typeName(F().typeOf(link.typeId)))} · ${esc(F().endLabel(link.a))} ⇄ ${esc(F().endLabel(link.b))}</title></g>`;
    }).join('');
  }
  function locSvg(l, usage){
    let o = `<g class="fv-loc" style="--c:${l.color}"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="10" class="fv-card"/><rect x="${l.x}" y="${l.y}" width="5" height="${l.h}" rx="2" fill="${l.color}"/><rect class="fv-drag" data-loc="${esc(l.id)}" x="${l.x}" y="${l.y}" width="${l.w}" height="${HEAD - 4}" rx="8"/><text x="${l.x + 16}" y="${l.y + 20}" class="fv-title">${esc(l.free || l.dc)}</text>`;
    if(l.free) o += `<text x="${l.x + 16}" y="${l.y + 44}" class="fv-sub">${t('other end', 'andere kant')}</text>`;
    for(const s of l.sws){
      const SP = window.SwPorts, ty = s.type;
      o += `<g class="fv-swg" data-sw="${esc(l.dc + '|' + s.label)}"><rect x="${s.x}" y="${s.y}" width="${SWW}" height="${SH}" rx="6" class="fv-sw"/><rect class="fv-swdrag" data-swd="${esc(l.dc + '|' + s.label)}" x="${s.x}" y="${s.y}" width="${SWW}" height="22" rx="6"/><text x="${s.x + SWW - 8}" y="${s.y + 16}" text-anchor="end" class="fv-swt">${esc(s.label)}</text><title>${esc([ty?.brand, ty?.name].filter(Boolean).join(' '))}</title></g>`;
      const ps = [];
      for(let k = 1; k <= s.sfp; k++){
        const px = s.x + 14 + (k - 1) * (PW + 4), py = s.y + 48 - PH / 2, key = `${l.dc}|${s.label}|${k}`, link = usage.get(key);
        const conn = SP.conn(ty, k), cls = SP.kindOf(conn), base = cls === 'oc' ? '#35a7ff' : cls === 'ff' ? '#ff4d4d' : '#94a3b8';
        const col = link ? F().color(link) : base, pend = S.pending === key;
        const fitsNow = !S.type || !!link || F().fits(S.type, { dc:l.dc, sw:s.label, sfp:k }, null).ok;
        ps.push(`<g class="fv-port ${link ? 'used' : 'free'} ${pend ? 'pend' : ''} ${fitsNow ? '' : 'nofit'}" data-port="${esc(key)}" style="--c:${col}"><rect x="${px}" y="${py}" width="${PW}" height="${PH}" rx="5" fill="${link ? col : '#0b0d10'}" fill-opacity="${link ? .28 : 1}" stroke="${col}" stroke-width="${pend ? 3 : 1.6}"/><text x="${px + PW / 2}" y="${py + 11}" text-anchor="middle" class="fv-pn">${esc(SP.short(ty, k))}</text><text x="${px + PW / 2}" y="${py + 20}" text-anchor="middle" class="fv-pc">${esc(conn ? conn.replace(/ DUO| QUAD/i, '').slice(0, 7) : 'SFP')}</text><title>${esc(SP.label(ty, k))}${link ? ` · ${esc(link.id)} ${esc(F().code(link.typeId))} → ${esc(F().endLabel(keyOf(link.a) === key ? link.b : link.a))}` : ` · ${t('free', 'vrij')}`}</title></g>`);
      }
      o += ps.join('');
      if(!s.sfp) o += `<text x="${s.x + 8}" y="${s.y + 46}" class="fv-sub">${t('no fibre ports', 'geen fiberpoorten')}</text>`;
      o += `<text x="${s.x + SWW - 8}" y="${s.y + SH - 22}" text-anchor="end" class="fv-sub">${esc([ty?.name].filter(Boolean).join(' ').slice(0, 24))}</text><text x="${s.x + SWW - 8}" y="${s.y + SH - 9}" text-anchor="end" class="fv-sub">${s.rj} ${t('copper', 'koper')}${s.sfp ? ` · ${s.sfp} ${t('fibre', 'fiber')}` : ''}</text>`;
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
    const cables = cablesSvg(g);
    const sel = links.find(l => l.id === S.sel);
    const side = `<aside class="fl-side">
      <div class="fl-sec"><div class="rb-label">${t('Show', 'Tonen')}</div><div class="segmented rb-full" id="fvLayer"><button data-v="all">${t('All', 'Alles')}</button><button data-v="dmx">DMX</button><button data-v="net">${t('Network', 'Netwerk')}</button><button data-v="fibre" class="active">${t('Fibres', 'Fibers')}</button></div></div>
      <div class="fl-sec"><div class="rb-label">${t('Fibres', 'Fibers')} <span class="subtle">${links.length}</span></div>
        ${links.map(l => `<button class="fl-item fv-li ${S.sel === l.id ? 'on' : ''}" data-pick="${esc(l.id)}"><i class="dot" style="background:${F().color(l)}"></i><span>${esc(l.id)} · ${esc(F().code(l.typeId))}</span><em>${esc((l.a?.dc || l.a?.free || '') + ' ⇄ ' + (l.b?.dc || l.b?.free || ''))}</em></button>`).join('') || `<div class="subtle" style="font-size:12.5px">${t('No fibres yet — draw one or use Auto-assign.', 'Nog geen fibers — teken er een of gebruik Automatisch koppelen.')}</div>`}</div>
      ${window.FlowBg ? window.FlowBg.sectionHtml('fibre') : ''}
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
    const svg = `<svg id="fvSvg" xmlns="http://www.w3.org/2000/svg"><g id="fvView" transform="translate(${S.tx},${S.ty}) scale(${S.zoom})"><g id="fvBg">${window.FlowBg ? window.FlowBg.svg('fibre', (() => { const b = bounds(); return b ? { minX:b.x0, minY:b.y0, maxX:b.x1, maxY:b.y1 } : null; })()) : ''}</g><g>${g.locs.map(l => locSvg(l, usage)).join('')}</g><g id="fvCables">${cables}</g></g></svg>${g.locs.length ? '' : `<div class="empty fl-empty">${I('cable', 30)}<h3>${t('No switches yet', 'Nog geen switches')}</h3><p>${t('Add network switches to the DimCities first (Network page).', 'Voeg eerst netwerkswitches toe aan de DimCities (pagina Netwerk).')}</p></div>`}`;
    root.innerHTML = `<div class="fl-wrap">${side}<div class="fl-main">${bar}<div class="fl-canvas fv-canvas" id="fvCanvas">${svg}</div>${pal}</div></div>`;
    bind(root);
    if(S.fit){ S.fit = false; fit(); }
  }
  function bounds(){ const L = S.layout?.locs || []; if(!L.length) return null; return { x0:Math.min(...L.map(l => l.x)) - 60, y0:Math.min(...L.map(l => l.y)) - 90, x1:Math.max(...L.map(l => l.x + l.w)) + 70, y1:Math.max(...L.map(l => l.y + l.h)) + 90 }; }
  function apply(){ const v = document.getElementById('fvView'); if(v) v.setAttribute('transform', `translate(${S.tx},${S.ty}) scale(${S.zoom})`); }
  function fit(){
    const c = document.getElementById('fvCanvas'), b = bounds(); if(!c || !b) return;
    const r = c.getBoundingClientRect(), w = b.x1 - b.x0, h = b.y1 - b.y0;
    S.zoom = Math.max(.2, Math.min(1.4, Math.min(r.width / w, r.height / h)));
    S.tx = (r.width - w * S.zoom) / 2 - b.x0 * S.zoom; S.ty = (r.height - h * S.zoom) / 2 - b.y0 * S.zoom; apply();
  }
  function zoomAt(z, px, py){ z = Math.max(.2, Math.min(3, z)); S.tx = px - (px - S.tx) * (z / S.zoom); S.ty = py - (py - S.ty) * (z / S.zoom); S.zoom = z; apply(); }

  // while a location card is dragged: redraw the drawing without losing the drag
  function liveRedraw(root){
    const v = root.querySelector('#fvView'); if(!v) return;
    const g = build(); S.layout = g;
    const usage = new Map(); for(const l of F().all()) for(const e of [l.a, l.b]) if(e && !e.free) usage.set(keyOf(e), l);
    v.innerHTML = `<g>${g.locs.map(l => locSvg(l, usage)).join('')}</g><g id="fvCables">${cablesSvg(g, true)}</g>`;
  }
  function bind(root){
    const again = () => render(root);
    const canvas = root.querySelector('#fvCanvas');
    root.querySelectorAll('#fvLayer button').forEach(b => b.onclick = () => window.Flow.setLayer(b.dataset.v));
    window.FlowBg?.bind(root, 'fibre', () => again());
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
      const ea = { dc:d1, sw:s1, sfp:Number(n1) }, eb = { dc:d2, sw:s2, sfp:Number(n2) }, fit = F().fits(S.type, ea, eb);
      if(!fit.ok){ App.ui.toast(fit.why, 'err'); S.pending = null; return again(); }
      const l = F().addLink(ea, eb, S.type);
      S.pending = null; S.sel = l.id; again();
    });
    root.querySelectorAll('.fv-cable').forEach(c => c.onclick = e => { e.stopPropagation(); S.sel = S.sel === c.dataset.link ? null : c.dataset.link; S.pending = null; again(); });
    // pan / zoom
    let drag = null;
    const toWorld = e => { const r = canvas.getBoundingClientRect(); return { x:(e.clientX - r.left - S.tx) / S.zoom, y:(e.clientY - r.top - S.ty) / S.zoom }; };
    canvas.onmousedown = e => {
      if(e.target.closest('.fv-port, .fv-cable')) return;
      const sw = e.target.closest('.fv-swdrag'), card = e.target.closest('.fv-drag');
      if(sw){ const loc = S.layout.locs.find(l => sw.dataset.swd.startsWith(l.dc + '|')); const s = loc?.sws.find(x => `${loc.dc}|${x.label}` === sw.dataset.swd); const w = toWorld(e); drag = { kind:'sw', key:sw.dataset.swd, loc, s, ox:w.x - s.x, oy:w.y - s.y, moved:false }; return; }
      if(card){ const loc = S.layout.locs.find(l => l.id === card.dataset.loc); const w = toWorld(e); drag = { kind:'loc', loc, ox:w.x - loc.x, oy:w.y - loc.y, moved:false }; return; }
      drag = { kind:'pan', x:e.clientX, y:e.clientY, tx:S.tx, ty:S.ty }; canvas.classList.add('grab');
    };
    window.onmousemove = e => {
      if(!drag) return;
      if(drag.kind === 'pan'){ S.tx = drag.tx + e.clientX - drag.x; S.ty = drag.ty + e.clientY - drag.y; apply(); return; }
      const w = toWorld(e); drag.moved = true;
      if(drag.kind === 'loc'){ drag.loc.x = w.x - drag.ox; drag.loc.y = w.y - drag.oy; drag.pos = { x:drag.loc.x, y:drag.loc.y }; drag.redraw = true; }
      else { drag.dropX = w.x; drag.dropY = w.y; S.float = { key:drag.key, x:w.x - drag.ox, y:w.y - drag.oy }; }
      liveRedraw(root);
    };
    window.onmouseup = e => {
      const d = drag; drag = null; S.float = null; canvas.classList.remove('grab');
      if(!d || d.kind === 'pan' || !d.moved) return;
      const st = store();
      if(d.kind === 'loc'){ st.loc[d.loc.id] = { x:Math.round(d.loc.x), y:Math.round(d.loc.y) }; }
      else {
        const l = d.loc, w = toWorld(e), col = Math.max(0, Math.min(3, Math.round((w.x - d.ox - l.x - PAD) / CELLW))), row = Math.max(0, Math.min(3, Math.round((w.y - d.oy - l.y - HEAD) / CELLH)));
        const other = l.sws.find(x => x !== d.s && x.col === col && x.row === row);
        if(other) st.sw[`${l.dc}|${other.label}`] = { col:d.s.col, row:d.s.row };
        st.sw[d.key] = { col, row };
        for(const x of l.sws) if(!st.sw[`${l.dc}|${x.label}`]) st.sw[`${l.dc}|${x.label}`] = { col:x.col, row:x.row };
      }
      M().ui.dirty = true; again();
    };
    canvas.onwheel = e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top); };
    canvas.onclick = e => { if(!e.target.closest('.fv-port, .fv-cable') && (S.sel || S.pending)){ S.sel = null; S.pending = null; again(); } };
    document.onkeydown = e => { if(e.key === 'Escape' && (S.pending || S.sel)){ S.pending = null; S.sel = null; again(); } };
  }
  window.FibreView = { render, state:S };
})();
