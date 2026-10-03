// core/swports.js — port naming for switch types with fibre connectors (e.g. Luminex GigaCore 20t:
// ports 1-16 etherCON/RJ45, 17-18 opticalCON DUO, 19-20 FiberFox DUO).
// A switch type can carry `sfpConnectors` ("opticalCON DUO, opticalCON DUO, FiberFox DUO, FiberFox DUO"),
// `frontCount` (how many RJ45 ports sit on the switch itself; the rest are on a panel) and `jack` ('RJ45' | 'etherCON').
(() => {
  const list = ty => String(ty?.sfpConnectors || '').split(',').map(s => s.trim()).filter(Boolean);
  const SwPorts = {
    connectors: list,
    conn: (ty, n) => list(ty)[n - 1] || '',
    // port number printed on the device for fibre port n (17 on a 16-port + 4-fibre switch), or null for plain "SFP n"
    no: (ty, n) => list(ty).length ? (Number(ty.portCount) || 0) + n : null,
    label(ty, n){ const no = this.no(ty, n); return no ? `${no} · ${this.conn(ty, n)}`.replace(/ · $/, '') : `SFP ${n}`; },
    short(ty, n){ const no = this.no(ty, n); return no ? String(no) : `S${n}`; },
    front: ty => { const f = Number(ty?.frontCount); return Number.isFinite(f) && f > 0 && f < (Number(ty?.portCount) || 0) ? f : (Number(ty?.portCount) || 0); },
    // static (non-patchable) sockets of a panel type: [{ cls:'rj'|'sfp'|'dmx', sub, items:[{ no, title }] }]
    panelGroups(ty){
      const n = k => Number(ty?.[k]) || 0, out = [], range = (c, first, name) => Array.from({ length:c }, (_, i) => ({ no:first + i, title:`${name} ${first + i}` }));
      if(n('xlrCount')) out.push({ cls:'dmx', sub:'', items:range(n('xlrCount'), 1, 'XLR 5-pin') });
      if(n('etherconCount')) out.push({ cls:'rj', sub:'ec', items:range(n('etherconCount'), Number(ty.etherconFirst) || 1, 'etherCON') });
      const ff = Number(ty?.fibreFirst) || 17;
      if(n('opticalConCount')) out.push({ cls:'sfp', sub:'oc', items:range(n('opticalConCount'), ff, 'opticalCON DUO') });
      if(n('fiberfoxCount')) out.push({ cls:'sfp', sub:'ff', items:range(n('fiberfoxCount'), ff + n('opticalConCount'), 'FiberFox DUO') });
      return out;
    },
    // does the rack carry the fibre connectors of this switch on a panel (then the switch itself does not draw them)?
    fibreOnPanel: (ty, rackPanelTypes) => list(ty).length > 0 && (rackPanelTypes || []).some(p => (Number(p?.opticalConCount) || 0) + (Number(p?.fiberfoxCount) || 0) > 0),
    kindOf(conn){ return /optical/i.test(conn) ? 'oc' : /fiberfox/i.test(conn) ? 'ff' : 'sfp'; }
  };

  // ---- special built-in device: the Luminex GigaCore 20t as a 3U set (switch with its connector panel) ----
  // Drawn as SVG for any width / height, so the Rack Builder, the DimCity page, the Signal Flow and the PDF show the same device.
  //   top 1U : logo, display, mode button, second display, knob, label, rear-port LEDs, 4 etherCON (1-4) on the right
  //   lower 2U: black panel with etherCON 5-16 (two rows), opticalCON DUO 17-18 and FiberFox DUO 19-20
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function gc20tShapes(w, h, info = {}){
    const U = h / 3, f = 'font-family="system-ui,Arial,sans-serif"';
    const r = (x, y, ww, hh, fill, stroke, rx = 0, extra = '') => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${hh.toFixed(1)}" rx="${rx}" fill="${fill}" ${stroke ? `stroke="${stroke}"` : ''} ${extra}/>`;
    const c = (cx, cy, rr, fill, stroke, sw = 1) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
    const tx = (x, y, size, txt, fill = '#e8eaef', anchor = 'start', wt = 600) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(1)}" font-weight="${wt}" text-anchor="${anchor}" fill="${fill}" ${f}>${esc(txt)}</text>`;
    let o = r(0, 0, w, U, '#26344d', '#3a4a68') + r(0, U, w, h - U, '#0a0a0b', '#1b1d22');
    // 1U top
    o += `<g transform="translate(${(w * .022).toFixed(1)},${(U * .5).toFixed(1)}) rotate(-90)">${tx(0, 0, U * .2, 'Luminex', '#ffffff', 'middle', 700)}</g>`;
    const lcdX = w * .045, lcdW = w * .105;
    o += r(lcdX, U * .14, lcdW, U * .72, '#05080d', '#0d1118', 2) + tx(lcdX + 5, U * .34, U * .16, esc(info.title || 'GigaCore 20t'), '#d8dde6') + tx(lcdX + 5, U * .54, U * .14, info.ip || '', '#9aa3b2', 'start', 500) + r(lcdX + 5, U * .60, lcdW * .38, U * .22, '#f1f3f6', '', 2) + tx(lcdX + 5 + lcdW * .19, U * .77, U * .17, '10G', '#0b0f17', 'middle', 800);
    o += c(w * .168, U * .66, U * .09, '#0b0d12', '#586174') + tx(w * .168, U * .30, U * .10, 'Mode', '#c3cad6', 'middle', 500);
    o += r(w * .195, U * .14, w * .115, U * .72, '#07090d', '#1a1f29', 2);
    o += tx(w * .318, U * .36, U * .15, 'GigaCore 20t', '#cfd6e3', 'start', 600);
    o += c(w * .435, U * .56, U * .30, '#0c0d10', '#2b2f38', 2) + c(w * .435, U * .56, U * .24, '#14161b', '#20242c');
    o += r(w * .475, U * .12, w * .14, U * .76, '#f4f5f7', '#c9ced6', 2) + tx(w * .481, U * .30, U * .15, info.sticker?.[0] || 'Luminex 20T', '#1a2438', 'start', 700) + tx(w * .481, U * .48, U * .115, info.sticker?.[1] || '', '#3a4458', 'start', 500) + tx(w * .481, U * .64, U * .115, info.sticker?.[2] || '', '#3a4458', 'start', 500);
    // rear port LEDs
    const lx = w * .635, lw = w * .215;
    o += r(lx, U * .12, lw, U * .76, '#161c29', '#2c3650', 3) + tx(lx + 6, U * .27, U * .12, 'REAR PORTS', '#c3cad6', 'start', 600);
    for(let i = 0; i < 12; i++) o += c(lx + 10 + i * (lw - 20) / 12, U * .66, U * .06, '#2f6bff', '#0b1020', 1);
    for(let i = 0; i < 4; i++) o += c(lx + 10 + (i + 4) * (lw - 20) / 12 + 6, U * .42, U * .06, '#2f6bff', '#0b1020', 1);
    // front etherCON 1-4
    for(let i = 0; i < 4; i++){ const cx = w * .875 + i * w * .031; o += c(cx, U * .52, Math.min(w * .0125, U * .24), '#0b0b0c', '#69707e', 2) + c(cx, U * .52, U * .12, '#1d2026', '') + tx(cx, U * .94, U * .12, String(i + 1), '#c3cad6', 'middle', 600); }
    // 2U panel: etherCON 5-16
    const ec = (cx, cy, n) => { const bw = w * .056, bh = U * .62; return r(cx - bw / 2, cy - bh / 2, bw, bh, '#0f1013', '#33363d', 6) + r(cx - bw * .30, cy - bh * .16, bw * .6, bh * .40, '#1b1d22', '#2a2d33', 2) + r(cx - bw * .18, cy - bh * .42, bw * .36, bh * .12, '#b9bec8', '#8a909c', 2) + tx(cx, cy - bh * .56, U * .15, String(n), '#f1f3f6', 'middle', 700); };
    for(let col = 0; col < 6; col++){ const cx = w * (.052 + col * .0735); o += ec(cx, U * 1.62, 5 + col * 2) + ec(cx, U * 2.40, 6 + col * 2); }
    // opticalCON DUO 17 / 18
    const oc = (cx, cy, n) => { const bw = w * .062, bh = U * .66; return r(cx - bw / 2, cy - bh / 2, bw, bh, '#101216', '#4d535f', 5) + c(cx, cy, bh * .30, '#171a20', '#9aa1ad', 2) + tx(cx - bw * .30, cy + U * .05, U * .13, 'A', '#e8eaef', 'middle', 700) + tx(cx + bw * .30, cy + U * .05, U * .13, 'B', '#e8eaef', 'middle', 700) + tx(cx, cy - bh * .56, U * .15, String(n), '#f1f3f6', 'middle', 700); };
    o += oc(w * .64, U * 1.62, 17) + oc(w * .64, U * 2.40, 18);
    // FiberFox DUO 19 / 20
    const ff = (cx, cy, n) => { const rr = U * .34; return c(cx, cy, rr, '#7a0f12', '#d11a1f', 2) + c(cx, cy, rr * .72, '#15171c', '#b9bec8', 2) + tx(cx - rr * .42, cy + U * .035, U * .09, n === 19 ? 'A1' : 'A2', '#f1f3f6', 'middle', 700) + tx(cx + rr * .42, cy + U * .035, U * .09, n === 19 ? 'B1' : 'B2', '#f1f3f6', 'middle', 700) + tx(cx, cy - rr - U * .06, U * .15, String(n), '#f1f3f6', 'middle', 700); };
    o += ff(w * .79, U * 1.66, 19) + ff(w * .79, U * 2.44, 20);
    o += tx(w * .925, U * 1.62, U * .13, 'FIBRE', '#6b7280', 'middle', 600) + tx(w * .925, U * 1.8, U * .13, 'SFP+', '#6b7280', 'middle', 600);
    return o;
  }
  // as a stand-alone <svg> for HTML (the box decides the size, the drawing stretches to it)
  function gc20tSvg(info = {}, aspect = 5.2){
    const h = 150, w = Math.round(h * aspect);
    return `<svg class="gc20t" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${gc20tShapes(w, h, info)}</svg>`;
  }
  const isSpecial = ty => !!ty?.special;

  SwPorts.gc20tShapes = gc20tShapes; SwPorts.gc20tSvg = gc20tSvg; SwPorts.isSpecial = isSpecial;
  window.SwPorts = SwPorts;
  // Short names: a device type can have its own short name (Device Builder); without one, the shortest sensible name is derived
  // (brand dropped, filler words and spaces removed). Racks and overviews use it, so long names are no longer cut off.
  const ShortName = {
    derive(t){
      let n = String(t?.name || t?.id || '').trim();
      const b = String(t?.brand || '').trim();
      if(b && n.toLowerCase().startsWith(b.toLowerCase() + ' ')) n = n.slice(b.length).trim();
      n = n.replace(/\bpanel\b/gi, '').replace(/(\d)×\s+/g, '$1×').replace(/\s*\+\s*/g, ' + ').replace(/\s{2,}/g, ' ').trim();
      return n || String(t?.id || '');
    },
    of(t){ return String(t?.short || '').trim() || ShortName.derive(t); },
    full(t){ return [t?.brand, t?.name].filter(Boolean).join(' ') || t?.id || ''; }
  };
  window.ShortName = ShortName;
})();
