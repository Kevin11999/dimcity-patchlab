// ui/flow-bg.js — a background picture (floor plan, stage plot, logo …) under the Signal Flow drawings.
// One picture per view (Everything / DMX / Network / Fibres) or one for all views; opacity, size and position are set per picture.
// Saved with the project (MODEL.flow.bg). The picture lives in the drawing's own coordinates, so it zooms and pans with it.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const LAYERS = [['all', 'Everything', 'Alles'], ['dmx', 'DMX', 'DMX'], ['net', 'Network', 'Netwerk'], ['fibre', 'Fibres', 'Fibers']];

  function store(){
    const m = M(); m.flow ||= { v:2, dir:'ltr', labels:{}, pos:{}, view:{} };
    return (m.flow.bg ||= { shared:false, items:{} });
  }
  const keyOf = layer => store().shared ? '*' : layer;
  const cfgFor = layer => store().items[keyOf(layer)] || null;
  const dirty = () => { M().ui.dirty = true; };

  function imageEl(layer, bb){
    const c = cfgFor(layer); if(!c?.img) return '';
    const iw = c.w * (c.size || 100) / 100, ih = c.h * (c.size || 100) / 100;
    const cx = (bb ? (bb.minX + bb.maxX) / 2 : 0) + (c.x || 0), cy = (bb ? (bb.minY + bb.maxY) / 2 : 0) + (c.y || 0);
    return `<image href="${c.img}" x="${(cx - iw / 2).toFixed(1)}" y="${(cy - ih / 2).toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" opacity="${((c.opacity ?? 35) / 100).toFixed(2)}" preserveAspectRatio="none" style="pointer-events:none"/>`;
  }
  // the drawing's bounds are needed to centre the picture: give them as { minX, minY, maxX, maxY }
  let lastBB = null;
  const svg = (layer, bb) => { lastBB = bb; return imageEl(layer, bb); };

  // read a file, shrink it (longest side 2400 px) and keep it as a data URL
  function readFile(file){
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('read'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('image'));
        img.onload = () => {
          const k = Math.min(1, 2400 / Math.max(img.width, img.height)), w = Math.round(img.width * k), h = Math.round(img.height * k);
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
          const png = /png|svg|gif|webp/i.test(file.type);
          let out = cv.toDataURL(png ? 'image/png' : 'image/jpeg', .85);
          if(png && out.length > 2.2e6) out = cv.toDataURL('image/jpeg', .85);
          res({ img:out, w, h });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function sectionHtml(layer){
    const st = store(), c = cfgFor(layer), name = LAYERS.find(l => l[0] === layer);
    return `<div class="fl-sec fl-bgsec"><div class="rb-label">${t('Background picture', 'Achtergrondafbeelding')}</div>
      ${c?.img ? `<div class="flbg-thumb" style="background-image:url('${c.img}')"></div>
        <label class="flbg-row">${t('Opacity', 'Doorzichtigheid')} <span class="subtle" id="bgOpV">${c.opacity ?? 35}%</span><input type="range" id="bgOp" min="5" max="100" step="5" value="${c.opacity ?? 35}"></label>
        <label class="flbg-row">${t('Size', 'Grootte')} <span class="subtle" id="bgSzV">${c.size || 100}%</span><input type="range" id="bgSz" min="10" max="400" step="5" value="${c.size || 100}"></label>
        <label class="flbg-row">${t('Left ↔ right', 'Links ↔ rechts')}<input type="range" id="bgX" min="-1500" max="1500" step="10" value="${c.x || 0}"></label>
        <label class="flbg-row">${t('Up ↔ down', 'Boven ↔ onder')}<input type="range" id="bgY" min="-1500" max="1500" step="10" value="${c.y || 0}"></label>
        <div class="flbg-btns"><button class="sm" id="bgPick">${t('Replace…', 'Vervangen…')}</button><button class="sm danger" id="bgDel">${t('Remove', 'Verwijderen')}</button></div>`
      : `<button class="sm" id="bgPick" style="width:100%">${t('Choose a picture…', 'Kies een afbeelding…')}</button><div class="hint" style="margin-top:6px">${t('A floor plan or stage plot under the drawing.', 'Een plattegrond of stageplot onder de tekening.')}</div>`}
      <label class="rb-row" style="margin-top:8px"><span>${t('Same picture on every view', 'Zelfde afbeelding op elke weergave')}<span class="hint" style="display:block;margin:2px 0 0">${t(`Off: this view (${name?.[1] || layer}) has its own picture.`, `Uit: deze weergave (${name?.[2] || layer}) heeft een eigen afbeelding.`)}</span></span><span class="switch"><input type="checkbox" id="bgShared" ${st.shared ? 'checked' : ''}><span></span></span></label>
      <input type="file" id="bgFile" accept="image/*" hidden></div>`;
  }

  // layer: which view this is; onChange(full): redraw (full = a new picture / switch changed), live changes only touch the <image>
  function bind(root, layer, onChange){
    const st = store();
    const live = () => { const c = cfgFor(layer); const el = root.querySelector('#flBg image, #fvBg image'); if(el && c?.img){ const fresh = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${imageEl(layer, lastBB)}</svg>`, 'image/svg+xml').documentElement.firstChild; if(fresh) el.replaceWith(document.importNode(fresh, true)); } };
    const pick = root.querySelector('#bgPick'), file = root.querySelector('#bgFile');
    if(pick && file){
      pick.onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files[0]; if(!f) return;
        try { const r = await readFile(f); const prev = cfgFor(layer) || {}; st.items[keyOf(layer)] = { ...r, opacity:prev.opacity ?? 35, size:prev.img ? prev.size : 100, x:prev.x || 0, y:prev.y || 0 }; dirty(); onChange(true); }
        catch { App.ui.toast(t('That file is not a picture I can read', 'Dat bestand is geen afbeelding die ik kan lezen'), 'err'); }
      };
    }
    const del = root.querySelector('#bgDel'); if(del) del.onclick = () => { delete st.items[keyOf(layer)]; dirty(); onChange(true); };
    const bind1 = (id, key, vid) => { const el = root.querySelector('#' + id); if(!el) return; el.oninput = () => { const c = cfgFor(layer); if(!c) return; c[key] = Number(el.value); if(vid) root.querySelector('#' + vid).textContent = `${el.value}%`; dirty(); live(); }; };
    bind1('bgOp', 'opacity', 'bgOpV'); bind1('bgSz', 'size', 'bgSzV'); bind1('bgX', 'x'); bind1('bgY', 'y');
    const sh = root.querySelector('#bgShared');
    if(sh) sh.onchange = () => {
      if(sh.checked){ const src = st.items['*'] || st.items[layer] || LAYERS.map(l => st.items[l[0]]).find(Boolean); if(src) st.items['*'] = { ...src }; else delete st.items['*']; }
      else { for(const [l] of LAYERS) if(!st.items[l] && st.items['*']) st.items[l] = { ...st.items['*'] }; }
      st.shared = sh.checked; dirty(); onChange(true);
    };
  }
  window.FlowBg = { imageSvg:imageEl, svg, sectionHtml, bind, cfgFor, LAYERS };
})();
