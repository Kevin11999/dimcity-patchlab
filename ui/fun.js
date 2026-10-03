// ui/fun.js — confetti when a show gets clean, "Festival wrapped" card, and sharing a drawing as an image.
// Confetti can be switched off in Settings (fun.confetti). Nothing here changes the show.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });   // LKApp is created later than this script
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const enabled = () => window.Settings?.get?.().fun?.confetti !== false;

  // ---------- confetti ----------
  function confetti(){
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    Object.assign(cv.style, { position:'fixed', inset:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:99999 });
    cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
    const g = cv.getContext('2d'), colors = ['#4c9dff', '#35c47c', '#f2b33d', '#e05dd8', '#22c3d6', '#ff7a45', '#a78bfa', '#94d82d'];
    const bits = Array.from({ length:140 }, () => ({ x:innerWidth * (.2 + Math.random() * .6), y:innerHeight * .75, vx:(Math.random() - .5) * 13, vy:-(7 + Math.random() * 12), s:5 + Math.random() * 6, r:Math.random() * 6, vr:(Math.random() - .5) * .4, c:colors[(Math.random() * colors.length) | 0] }));
    const t0 = performance.now();
    (function tick(now){
      const age = now - t0;
      g.clearRect(0, 0, cv.width, cv.height);
      for(const b of bits){ b.vy += .35; b.x += b.vx; b.y += b.vy; b.vx *= .99; b.r += b.vr; g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.globalAlpha = Math.max(0, 1 - age / 3200); g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); g.restore(); }
      if(age < 3200) requestAnimationFrame(tick); else cv.remove();
    })(t0);
  }
  function celebrate(){ if(!enabled()) return; confetti(); App.ui.toast(t('Patch perfect! No errors, no warnings.', 'Patch perfect! Geen fouten, geen waarschuwingen.'), 'ok'); }

  // A show that goes from "has issues" to "none" (same project) gets a little party.
  let prev = null, prevKey = null;
  setInterval(() => {
    const m = M(); if(!m) return;
    const rows = (m.lines?.length || 0) + (m.veamLines?.length || 0) + (m.dmxLoose?.length || 0);
    const key = `${m.projectMeta?.project || ''}|${m.filePath || ''}`;
    const n = (m.issues || []).length;
    if(key !== prevKey || !rows){ prevKey = key; prev = rows ? n : null; return; }
    if(prev != null && prev > 0 && n === 0) celebrate();
    prev = n;
  }, 1200);

  // ---------- share a drawing as an image ----------
  function svgToPng(svg, w, h, scale = 2){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([svg], { type:'image/svg+xml' }));
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); cv.toBlob(b => b ? resolve(b) : reject(new Error('no image')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The drawing could not be rendered')); };
      img.src = url;
    });
  }
  async function shareBlob(blob, name, { copy = true } = {}){
    try {
      if(copy && navigator.clipboard?.write && window.ClipboardItem){ await navigator.clipboard.write([new ClipboardItem({ 'image/png':blob })]); App.ui.toast(t('Image copied — paste it in a chat or e-mail', 'Afbeelding gekopieerd — plak hem in een chat of e-mail')); return 'copied'; }
    } catch {}
    const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:name });
    document.body.appendChild(a); a.click(); a.remove();
    App.ui.toast(t('Image saved', 'Afbeelding opgeslagen')); return 'saved';
  }
  async function shareFlow(){
    const f = window.Flow; const dcs = f?.state?.dc && f.state.dc !== 'ALL' ? [f.state.dc] : App.sortedDims();
    const r = f?.standaloneSvg?.(dcs); if(!r){ App.ui.toast(t('Nothing to share yet', 'Nog niets om te delen'), 'info'); return; }
    const scale = Math.min(2, 4096 / Math.max(r.w, r.h));
    try { await shareBlob(await svgToPng(r.svg, r.w, r.h, scale), `${(M().projectMeta?.project || 'PatchLab').replace(/[^a-z0-9_-]+/gi, '_')}-signal-flow.png`); }
    catch(err){ App.ui.toast(err.message, 'err'); }
  }

  // ---------- Festival wrapped ----------
  // Rough cable lengths for the fun number: LK multicore 25 m, Veam cable 15 m, every XLR / DMX line 10 m.
  function stats(){
    const m = M();
    const unis = new Set(); [...(m.lines || []), ...(m.veamLines || []), ...(m.dmxLoose || [])].forEach(l => { if(l.universe != null && l.universe !== '') unis.add(String(l.universe)); });
    const rows = (m.lines?.length || 0) + (m.veamLines?.length || 0) + (m.dmxLoose?.length || 0);
    const lk = m.byLK?.size || 0, ve = m.byVeam?.size || 0;
    let racks = 0, nodes = 0;
    for(const dc of App.sortedDims()){ try { const P = window.RackEngine.computeRackPlan(m, dc); racks += P.racks.filter(r => r.rack).length; nodes += P.nodes.length; } catch {} }
    const meters = lk * 25 + ve * 15 + rows * 10;
    const issues = (m.issues || []).length;
    return { project:m.projectMeta?.project || 'My show', area:m.projectMeta?.area || '', dcs:m.byDim?.size || 0, lk, ve, rows, universes:unis.size, racks, nodes, km:(meters / 1000).toFixed(1), issues };
  }
  function wrappedCanvas(s){
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#1b1233'); grad.addColorStop(.55, '#12263f'); grad.addColorStop(1, '#0d3a33'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const dots = ['#4c9dff', '#35c47c', '#f2b33d', '#e05dd8', '#22c3d6', '#ff7a45']; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for(let i = 0; i < 70; i++){ g.fillStyle = dots[i % dots.length] + '33'; g.beginPath(); g.arc(rnd() * W, rnd() * H, 6 + rnd() * 26, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.font = '600 34px system-ui, sans-serif'; g.fillStyle = '#ffb366'; g.fillText('DIMCITY PATCHLAB  ·  WRAPPED', 80, 120);
    g.fillStyle = '#fff'; g.font = '800 84px system-ui, sans-serif';
    const words = s.project.split(' '); let line = '', y = 250; for(const w of words){ const tst = line ? `${line} ${w}` : w; if(g.measureText(tst).width > W - 160 && line){ g.fillText(line, 80, y); line = w; y += 92; } else line = tst; } g.fillText(line, 80, y);
    if(s.area){ g.font = '500 36px system-ui, sans-serif'; g.fillStyle = '#b8c2d6'; g.fillText(s.area, 80, y + 60); }
    const tiles = [[s.dcs, 'DimCities'], [s.lk, 'LK blocks'], [s.ve, 'Veams'], [s.universes, 'universes'], [s.rows, 'patch points'], [s.racks, 'racks'], [s.nodes, 'nodes'], [s.km, 'km of cable (estimated)']];
    const top = 560, cw = (W - 160 - 30) / 2, ch = 150;
    tiles.forEach(([v, l], i) => { const x = 80 + (i % 2) * (cw + 30), yy = top + Math.floor(i / 2) * (ch + 24); g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.roundRect(x, yy, cw, ch, 22); g.fill(); g.fillStyle = dots[i % dots.length]; g.fillRect(x, yy + 22, 8, ch - 44); g.fillStyle = '#fff'; g.font = '800 64px system-ui, sans-serif'; g.fillText(String(v), x + 36, yy + 78); g.fillStyle = '#b8c2d6'; g.font = '500 28px system-ui, sans-serif'; g.fillText(l, x + 36, yy + 120); });
    g.fillStyle = s.issues ? '#f2b33d' : '#35c47c'; g.font = '700 40px system-ui, sans-serif'; g.fillText(s.issues ? `${s.issues} open issue${s.issues === 1 ? '' : 's'} left` : 'Patch perfect — zero issues', 80, 1290);
    return cv;
  }
  function wrapped(){
    const s = stats(); if(!s.rows){ App.ui.toast(t('Import or add a patch first', 'Importeer of voeg eerst een patch toe'), 'info'); return; }
    const cv = wrappedCanvas(s); cv.style.cssText = 'width:100%;max-width:380px;border-radius:14px;display:block;margin:0 auto';
    const d = App.ui.openDialog({ title:t('Festival wrapped', 'Festival wrapped'), subtitle:t('Your show in numbers — cable length is a rough estimate (LK 25 m, Veam 15 m, 10 m per DMX line).', 'Je show in cijfers — kabellengte is een ruwe schatting (LK 25 m, Veam 15 m, 10 m per DMX-lijn).'), width:'460px', body:'<div id="fwBox"></div>',
      footer:`<button data-a="c">${t('Close', 'Sluiten')}</button><button data-a="s">${I('download', 14)}${t('Save image', 'Afbeelding opslaan')}</button><button class="primary" data-a="p">${I('copy', 14)}${t('Copy image', 'Afbeelding kopiëren')}</button>` });
    d.body.querySelector('#fwBox').appendChild(cv);
    const blob = () => new Promise(res => cv.toBlob(res, 'image/png'));
    const nm = `${s.project.replace(/[^a-z0-9_-]+/gi, '_')}-wrapped.png`;
    d.footer.querySelector('[data-a=c]').onclick = d.close;
    d.footer.querySelector('[data-a=s]').onclick = async () => shareBlob(await blob(), nm, { copy:false });
    d.footer.querySelector('[data-a=p]').onclick = async () => shareBlob(await blob(), nm);
  }

  window.Fun = { celebrate, confetti, wrapped, shareFlow, svgToPng, shareBlob, stats };
})();
