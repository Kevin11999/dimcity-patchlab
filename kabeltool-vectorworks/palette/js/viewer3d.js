// 3D-weergave op een canvas (geen externe bibliotheek nodig, werkt dus ook offline).
// Toont dim cities, routes, drops, elke kabel apart, lampen en trussen uit de tekening.
// Slepen = draaien · Shift+slepen of rechts slepen = verschuiven · scrollen = zoomen · hover = info · klik = selecteren.
(function () {
  const KT = window.KT;
  const KLEUREN = ['#4fc3f7', '#ffb74d', '#81c784', '#e57373', '#ba68c8', '#fff176', '#4db6ac', '#f06292'];
  const ONDERDELEN = [
    ['dimcities', 'Dim cities'], ['routes', 'Routes'], ['drops', 'Drops'],
    ['kabels', 'Kabels'], ['lampen', 'Lampen'], ['trussen', 'Trussen'], ['raster', 'Raster'],
  ];
  const AANZICHTEN = { boven: [0, 0], voor: [0, Math.PI / 2], zij: [Math.PI / 2, Math.PI / 2], '3d': [-0.6, 0.95] };

  KT.viewer = function (canvas, tip, onKlik) {
    const ctx = canvas.getContext('2d');
    const zicht = Object.fromEntries(ONDERDELEN.map(o => [o[0], true]));
    const lagenUit = new Set();
    let yaw = AANZICHTEN['3d'][0], pitch = AANZICHTEN['3d'][1], zoom = 1, pan = [0, 0];
    let sleep = null, netGesleept = false, hits = [], kader = null;

    // ---------- bedieningsbalk ----------
    const balk = document.createElement('div');
    balk.className = 'drie-balk';
    canvas.parentNode.insertBefore(balk, canvas);
    function balkTekenen() {
      const lagen = (KT.tekening && KT.tekening.lagen) || [];
      balk.innerHTML =
        `<span class="groep">${Object.keys(AANZICHTEN).map(a => `<button data-aanzicht="${a}">${a === '3d' ? '3D' : a[0].toUpperCase() + a.slice(1)}</button>`).join('')}
          <button data-fit="1" title="Alles in beeld">⤢ Alles</button></span>
        <span class="groep">${ONDERDELEN.map(o => `<label><input type="checkbox" data-zicht="${o[0]}" ${zicht[o[0]] ? 'checked' : ''}>${o[1]}</label>`).join('')}</span>
        ${lagen.length ? `<details class="groep lagen"><summary>Lagen (${lagen.length - lagenUit.size}/${lagen.length})</summary>
          ${lagen.map(l => `<label><input type="checkbox" data-laag="${encodeURIComponent(l)}" ${lagenUit.has(l) ? '' : 'checked'}>${l.replace(/</g, '&lt;')}</label>`).join('')}</details>` : ''}`;
    }
    balk.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.aanzicht) { [yaw, pitch] = AANZICHTEN[b.dataset.aanzicht]; kader = null; teken(); }
      if (b.dataset.fit) { zoom = 1; pan = [0, 0]; kader = null; teken(); }
    });
    balk.addEventListener('change', e => {
      const i = e.target;
      if (i.dataset.zicht) zicht[i.dataset.zicht] = i.checked;
      if (i.dataset.laag) { const l = decodeURIComponent(i.dataset.laag); if (i.checked) lagenUit.delete(l); else lagenUit.add(l); }
      kader = null;
      const open = balk.querySelector('details.lagen');
      const wasOpen = open && open.open;
      teken(); balkTekenen();
      if (wasOpen) balk.querySelector('details.lagen').open = true;
    });

    const zichtbaar = laag => !laag || !lagenUit.has(laag);

    // ---------- tekenen ----------
    function teken() {
      const res = KT.res, tk = KT.tekening || {};
      const W = canvas.width = canvas.clientWidth, H = canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);
      hits = [];
      if (!balk.innerHTML) balkTekenen();
      if (!res) return;
      const inst = KT.project.instellingen || {};

      // wat er te zien is
      const dcs = zicht.dimcities ? (tk.dimcities || []).filter(d => zichtbaar(d.laag)) : [];
      const routes = zicht.routes ? [].concat(tk.vloerroutes || [], tk.trusslijnen || []).filter(r => zichtbaar(r.laag)) : [];
      const drops = zicht.drops ? (tk.drops || []).filter(d => zichtbaar(d.laag)) : [];
      const kabels = zicht.kabels && zichtbaar(inst.laagKabels || inst.laagCabling) ? (res.kabelpaden || []) : [];
      const lampen = zicht.lampen ? (tk.alleLampen || []).filter(l => zichtbaar(l.laag)) : [];
      const trussen = zicht.trussen ? (tk.trussen || []).filter(t => zichtbaar(t.laag)) : [];

      // kader voor "alles in beeld" (van alles, ook wat uit staat, zodat het beeld niet springt)
      if (!kader) {
        const alle = [];
        (tk.dimcities || []).forEach(d => alle.push([+d.x || 0, +d.y || 0, 0], [+d.x || 0, +d.y || 0, +d.kast || 0]));
        [].concat(tk.vloerroutes || [], tk.trusslijnen || []).forEach(r => (r.punten || []).forEach(p => alle.push(p)));
        (res.kabelpaden || []).forEach(k => k.punten.forEach(p => alle.push(p)));
        (tk.alleLampen || []).forEach(l => alle.push([l.x, l.y, l.z]));
        (tk.trussen || []).forEach(t => { alle.push(t.min, t.max); });
        if (!alle.length) { ctx.fillStyle = '#888'; ctx.font = '13px sans-serif'; ctx.fillText('Nog niets te zien. Laad de demo of klik op Verversen.', 20, 30); return; }
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        alle.forEach(p => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], +p[i] || 0); mx[i] = Math.max(mx[i], +p[i] || 0); } });
        kader = { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], maat: Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1) };
      }
      const c = kader.c;
      const s = Math.min(W, H) / kader.maat * 0.8 * zoom;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const pr = p => {
        const x = p[0] - c[0], y = p[1] - c[1], z = (p[2] || 0) - c[2];
        const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
        return [W / 2 + pan[0] + x1 * s, H / 2 + pan[1] - (y1 * cp + z * sp) * s];
      };
      const lijn = (a, b, kleur, dikte, streep) => {
        const p = pr(a), q = pr(b);
        ctx.strokeStyle = kleur; ctx.lineWidth = dikte; ctx.setLineDash(streep || []);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        return [p, q];
      };
      const tekst = (t, p, kleur, grootte) => { ctx.fillStyle = kleur; ctx.font = (grootte || 11) + 'px sans-serif'; ctx.fillText(t, p[0], p[1]); };

      const sel = KT.ui.sel;
      const selNrs = new Set(res.kabels.filter(k => k.drop === sel || k.dc === sel).map(k => k.nr));

      // raster op de vloer
      if (zicht.raster) {
        const stap = kader.maat > 60 ? 5 : 1;
        const x0 = Math.floor((kader.mn[0] - 2) / stap) * stap, x1 = Math.ceil((kader.mx[0] + 2) / stap) * stap;
        const y0 = Math.floor((kader.mn[1] - 2) / stap) * stap, y1 = Math.ceil((kader.mx[1] + 2) / stap) * stap;
        for (let x = x0; x <= x1 + 1e-9; x += stap) lijn([x, y0, 0], [x, y1, 0], x % (stap * 5) === 0 ? '#2c2f36' : '#1f2228', 1);
        for (let y = y0; y <= y1 + 1e-9; y += stap) lijn([x0, y, 0], [x1, y, 0], y % (stap * 5) === 0 ? '#2c2f36' : '#1f2228', 1);
      }

      // trussen uit de tekening: kader van het object
      trussen.forEach(t => {
        const a = t.min, b = t.max;
        const h = [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]], [a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]];
        [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(e => lijn(h[e[0]], h[e[1]], '#8a8f99', 1));
        hits.push({ q: pr([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), tekst: 'Truss: ' + (t.naam || '') + (t.klasse ? ' · ' + t.klasse : '') });
      });

      // routes als dunne geleiders
      routes.forEach(r => {
        const pts = r.punten || [];
        for (let i = 0; i < pts.length - 1; i++) lijn(pts[i], pts[i + 1], r.naam ? '#6d7480' : '#4b505a', 1, r.naam ? [] : [4, 4]);
        if (r.naam && pts[0]) tekst(r.naam, pr(pts[0]), '#aab', 11);
      });

      // elke kabel apart, in zijn eigen kleur; die van de selectie fel, de rest iets gedempt
      ctx.lineCap = 'round';
      kabels.forEach(k => {
        const fel = !selNrs.size || selNrs.has(k.nummer);
        const dikte = Math.max(1.2, Math.min(6, (k.diameter / 1000) * s));
        ctx.globalAlpha = fel ? 1 : 0.35;
        for (let i = 0; i < k.punten.length - 1; i++) {
          const [p, q] = lijn(k.punten[i], k.punten[i + 1], k.kleur || '#9e9e9e', dikte);
          hits.push({ lijn: [p, q], tekst: `${k.nummer} · ${k.type} ${k.lengte} m (totaal ${k.totaal} m)` });
        }
      });
      ctx.globalAlpha = 1; ctx.setLineDash([]);

      // lampen
      lampen.forEach(l => {
        const q = pr([l.x, l.y, l.z]);
        ctx.fillStyle = l.drop ? '#ffd54f' : '#c9a93a';
        ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 7); ctx.fill();
        hits.push({ q, tekst: 'Lamp: ' + (l.naam || l.uuid) + (l.drop ? ' · ' + l.drop : '') });
      });

      // drops: bolletje op de truss en de drop naar beneden
      drops.forEach(d => {
        const di = KT.dropInst(d.id);
        const val = di.valhoogte !== '' && di.valhoogte != null ? +di.valhoogte : +d.z;
        lijn([+d.x, +d.y, +d.z], [+d.x, +d.y, +d.z - val], '#ff5252', 1, [5, 4]);
        ctx.setLineDash([]);
        const q = pr([+d.x || 0, +d.y || 0, +d.z || 0]);
        ctx.fillStyle = sel === d.id ? '#fff' : '#ff5252'; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fill();
        tekst(di.naam || d.id, [q[0] + 8, q[1] - 6], '#ddd', 11);
        hits.push({ q, id: d.id, tekst: 'Drop ' + d.id + (di.naam ? ' · ' + di.naam : '') });
      });

      // dim cities als kast
      dcs.forEach(d => {
        const i = (tk.dimcities || []).indexOf(d), kleur = KLEUREN[i % KLEUREN.length];
        const m = (+d.maat || 1) / 2, k = +d.kast || 0, x = +d.x || 0, y = +d.y || 0;
        const h = [[x - m, y - m, 0], [x + m, y - m, 0], [x + m, y + m, 0], [x - m, y + m, 0]];
        const t = h.map(p => [p[0], p[1], k]);
        ctx.fillStyle = kleur + '55';
        ctx.beginPath(); h.map(pr).forEach((p, j) => j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
        for (let j = 0; j < 4; j++) { lijn(h[j], h[(j + 1) % 4], kleur, sel === d.id ? 2.5 : 1.5); if (k > 0) { lijn(t[j], t[(j + 1) % 4], kleur, 1.5); lijn(h[j], t[j], kleur, 1.5); } }
        const q = pr([x, y, k]);
        tekst(d.naam || d.id, [q[0] + 10, q[1] - 4], '#fff', 12);
        hits.push({ q: pr([x, y, 0]), id: d.id, tekst: 'Dim city ' + d.id });
      });
    }

    // ---------- muis ----------
    const plek = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const afstLijn = (p, a, b) => {
      const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      let t = l2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
    };
    const zoek = p => {
      let best = null;
      hits.forEach(h => {
        const d = h.q ? Math.hypot(p[0] - h.q[0], p[1] - h.q[1]) : afstLijn(p, h.lijn[0], h.lijn[1]) + 2;
        if (d < 9 && (!best || d < best.d)) best = { d, h };
      });
      return best && best.h;
    };

    canvas.oncontextmenu = e => e.preventDefault();
    canvas.onmousedown = e => { sleep = { x: e.clientX, y: e.clientY, bewogen: false, schuif: e.shiftKey || e.button === 2 || e.button === 1 }; };
    window.addEventListener('mouseup', () => { netGesleept = !!(sleep && sleep.bewogen); sleep = null; });
    canvas.onmousemove = e => {
      if (sleep) {
        const dx = e.clientX - sleep.x, dy = e.clientY - sleep.y;
        if (sleep.schuif) { pan[0] += dx; pan[1] += dy; }
        else { yaw += dx * 0.01; pitch = Math.max(0, Math.min(Math.PI / 2, pitch + dy * 0.01)); }
        sleep.x = e.clientX; sleep.y = e.clientY; sleep.bewogen = true; teken(); tip.style.display = 'none'; return;
      }
      const p = plek(e), h = zoek(p);
      if (h) {
        tip.style.display = 'block'; tip.style.left = (p[0] + 14) + 'px'; tip.style.top = (p[1] + 14 + balk.offsetHeight) + 'px';
        tip.textContent = h.tekst;
      } else tip.style.display = 'none';
    };
    canvas.onmouseleave = () => { tip.style.display = 'none'; };
    canvas.onclick = e => {
      if (netGesleept) { netGesleept = false; return; }      // na draaien niet ook nog selecteren
      const h = zoek(plek(e));
      if (h && h.id) onKlik(h.id);
    };
    canvas.onwheel = e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15, p = plek(e);
      // zoomen rond de muis
      const W = canvas.clientWidth, H = canvas.clientHeight;
      pan[0] = (pan[0] - (p[0] - W / 2)) * f + (p[0] - W / 2);
      pan[1] = (pan[1] - (p[1] - H / 2)) * f + (p[1] - H / 2);
      zoom *= f; teken();
    };

    // nieuwe tekening: lagenlijst en kader opnieuw
    function ververs() { kader = null; balkTekenen(); teken(); }
    return { teken, ververs };
  };
})();
