// Eenvoudige 3D-skeletweergave op een canvas (geen externe bibliotheek nodig, werkt dus ook offline).
// Slepen = draaien, scrollen = zoomen, hover = nummers, klik = selecteren.
(function () {
  const KT = window.KT;
  const KLEUREN = ['#4fc3f7', '#ffb74d', '#81c784', '#e57373', '#ba68c8', '#fff176', '#4db6ac', '#f06292'];

  KT.viewer = function (canvas, tip, onKlik) {
    const ctx = canvas.getContext('2d');
    let yaw = -0.5, pitch = 0.9, zoom = 1, sleep = null, lijnen = [], punten = [];

    function teken() {
      const res = KT.res, tk = KT.tekening;
      const W = canvas.width = canvas.clientWidth, H = canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);
      lijnen = []; punten = [];
      if (!res) return;
      const alle = [];
      res.stukken.forEach(s => { alle.push(s.a, s.b); });
      (tk.dimcities || []).forEach(d => alle.push([+d.x || 0, +d.y || 0, +d.z || 0]));
      if (!alle.length) { ctx.fillStyle = '#888'; ctx.fillText('Nog geen routes. Laad de demo of ververs uit Vectorworks.', 20, 30); return; }
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      alle.forEach(p => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } });
      const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      const maat = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1);
      const s = Math.min(W, H) / maat * 0.75 * zoom;
      const pr = p => {
        const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
        const x1 = x * Math.cos(yaw) - y * Math.sin(yaw), y1 = x * Math.sin(yaw) + y * Math.cos(yaw);
        return [W / 2 + x1 * s, H / 2 - (y1 * Math.cos(pitch) + z * Math.sin(pitch)) * s];
      };
      const dcIndex = id => Math.max(0, (tk.dimcities || []).findIndex(d => d.id === id));
      const sel = KT.ui.sel;
      const selNrs = new Set(res.kabels.filter(k => k.drop === sel || k.dc === sel).map(k => k.nr));

      res.stukken.forEach(st => {
        const a = pr(st.a), b = pr(st.b);
        const licht = st.nrs.some(n => selNrs.has(n));
        ctx.strokeStyle = licht ? '#ffffff' : KLEUREN[dcIndex(st.dc) % KLEUREN.length];
        ctx.lineWidth = Math.min(12, 1 + st.nrs.length);
        ctx.setLineDash(st.soort === 'drop' ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        lijnen.push({ a, b, st });
      });
      ctx.setLineDash([]);
      Object.values(res.knopen).forEach(k => {
        if (k.soort === 'dimcity') return;
        const q = pr(k.p); ctx.fillStyle = '#bbb'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5, 0, 7); ctx.fill();
      });
      (tk.dimcities || []).forEach((d, i) => {
        const q = pr([+d.x || 0, +d.y || 0, +d.z || 0]);
        ctx.fillStyle = KLEUREN[i % KLEUREN.length]; ctx.fillRect(q[0] - 7, q[1] - 7, 14, 14);
        if (sel === d.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(q[0] - 9, q[1] - 9, 18, 18); }
        ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(d.id, q[0] + 11, q[1] + 4);
        punten.push({ q, id: d.id });
      });
      (tk.drops || []).forEach(d => {
        const q = pr([+d.x || 0, +d.y || 0, +d.z || 0]);
        ctx.fillStyle = sel === d.id ? '#fff' : '#ff5252'; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#ddd'; ctx.font = '11px sans-serif'; ctx.fillText((KT.dropInst(d.id).naam || d.id), q[0] + 8, q[1] - 6);
        punten.push({ q, id: d.id });
      });
    }

    const afstLijn = (p, a, b) => {
      const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      let t = l2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
    };
    const plek = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    canvas.onmousedown = e => { sleep = { x: e.clientX, y: e.clientY, bewogen: false }; };
    window.addEventListener('mouseup', () => { sleep = null; });
    canvas.onmousemove = e => {
      if (sleep) {
        yaw += (e.clientX - sleep.x) * 0.01; pitch = Math.max(0, Math.min(Math.PI / 2, pitch + (e.clientY - sleep.y) * 0.01));
        sleep.x = e.clientX; sleep.y = e.clientY; sleep.bewogen = true; teken(); return;
      }
      const p = plek(e); let best = null;
      lijnen.forEach(l => { const d = afstLijn(p, l.a, l.b); if (d < 8 && (!best || d < best.d)) best = { d, l }; });
      if (best) {
        tip.style.display = 'block'; tip.style.left = (p[0] + 14) + 'px'; tip.style.top = (p[1] + 14) + 'px';
        tip.textContent = best.l.st.soort + ': ' + (best.l.st.nrs.join(', ') || 'geen kabels');
      } else tip.style.display = 'none';
    };
    canvas.onmouseleave = () => { tip.style.display = 'none'; };
    canvas.onclick = e => {
      const p = plek(e); let best = null;
      punten.forEach(k => { const d = Math.hypot(p[0] - k.q[0], p[1] - k.q[1]); if (d < 12 && (!best || d < best.d)) best = { d, k }; });
      if (best) onKlik(best.k.id);
    };
    canvas.onwheel = e => { e.preventDefault(); zoom *= e.deltaY < 0 ? 1.1 : 0.9; teken(); };

    return { teken };
  };
})();
