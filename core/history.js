// core/history.js
// Undo / redo and a readable change history for the open show.
// Every change in the app sets MODEL.ui.dirty = true; we hook that flag, take a snapshot of
// the project shortly after, and describe what changed compared to the previous snapshot.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;

const MAX = 80;
const H = { undo:[], redo:[], cur:null, curObj:null, timer:null, busy:false, label:null, hookedUi:null, changeCount:0 };
const listeners = new Set();
const emit = () => listeners.forEach(fn => { try { fn(); } catch {} });

function snapshot(){
  const s = window.ProjectIO.buildSnapshot();
  delete s.savedAt;
  return s;
}

// ---- dirty-vlag van het model afvangen ----
function hook(){
  const M = App.getMODEL();
  const ui = M?.ui;
  if(!ui || ui === H.hookedUi) return;
  let val = !!ui.dirty;
  Object.defineProperty(ui, 'dirty', {
    configurable:true, enumerable:true,
    get(){ return val; },
    set(v){ val = !!v; if(v) schedule(); }
  });
  H.hookedUi = ui;
}
setInterval(hook, 250);

function schedule(){
  if(H.busy) return;
  clearTimeout(H.timer);
  H.timer = setTimeout(capture, 350);
}
function capture(){
  clearTimeout(H.timer); H.timer = null;
  if(H.busy || !window.ProjectIO) return;
  let obj;
  try { obj = snapshot(); } catch { return; }
  const str = JSON.stringify(obj);
  if(H.cur === null){ H.cur = str; H.curObj = obj; return; }
  if(str === H.cur) return;
  const label = H.label || describe(H.curObj, obj);
  H.label = null;
  H.undo.push({ state:H.cur, label, time:Date.now() });
  if(H.undo.length > MAX) H.undo.shift();
  H.redo = [];
  H.cur = str; H.curObj = obj;
  H.changeCount++;
  emit();
}
// Geeft de volgende wijziging een eigen omschrijving (bijv. een snelle fix)
function label(text){ H.label = text; }
function flush(){ if(H.timer) capture(); }

function reset(){
  clearTimeout(H.timer); H.timer = null;
  H.undo = []; H.redo = []; H.label = null; H.changeCount = 0;
  try { H.curObj = snapshot(); H.cur = JSON.stringify(H.curObj); } catch { H.cur = null; H.curObj = null; }
  hook();
  emit();
}

// ---- terugzetten ----
async function restore(str){
  H.busy = true;
  const M0 = App.getMODEL();
  const keep = { filePath:M0.filePath, projectPath:M0.projectPath, view:M0.ui?.view, selected:M0.selected, rightMode:M0.ui?.rightMode };
  try {
    await window.ProjectIO.applySnapshot(JSON.parse(str));
    const M = App.getMODEL();
    M.filePath = keep.filePath; M.projectPath = keep.projectPath;
    M.ui.view = keep.view || 'HOME';
    // terug naar hetzelfde scherm als het onderdeel nog bestaat
    const exists = keep.selected?.kind === 'LK' ? M.byLK.has(keep.selected.id) : keep.selected?.kind === 'VEAM' ? M.byVeam.has(keep.selected.id) : keep.selected?.kind === 'DIM' ? M.byDim.has(keep.selected.id) : false;
    if(exists){ M.selected = keep.selected; M.ui.rightMode = keep.rightMode; }
    H.hookedUi = null; hook();
    M.ui.dirty = true;
    App.renderAll?.();
  } finally {
    clearTimeout(H.timer); H.timer = null;
    H.busy = false;
  }
}
const isTextField = el => el && (el.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|range|color|button|file)$/i.test(el.type)));
async function undo(){
  if(isTextField(document.activeElement)){ document.execCommand('undo'); return; }
  flush();
  const e = H.undo.pop(); if(!e) return App.ui.toast('Nothing to undo', 'info');
  H.redo.push({ state:H.cur, label:e.label, time:e.time });
  H.cur = e.state; H.curObj = JSON.parse(e.state);
  await restore(e.state);
  App.ui.toast(`Undone: ${e.label}`, 'info', { action:{ label:'Redo', run:redo } });
  emit();
}
async function redo(){
  if(isTextField(document.activeElement)){ document.execCommand('redo'); return; }
  flush();
  const e = H.redo.pop(); if(!e) return App.ui.toast('Nothing to redo', 'info');
  H.undo.push({ state:H.cur, label:e.label, time:e.time });
  H.cur = e.state; H.curObj = JSON.parse(e.state);
  await restore(e.state);
  App.ui.toast(`Redone: ${e.label}`, 'info');
  emit();
}
// Meerdere stappen tegelijk (vanuit het geschiedenisvenster)
async function jump(stepsBack){
  flush();
  if(stepsBack > 0){ for(let i = 0; i < stepsBack && H.undo.length; i++){ const e = H.undo.pop(); H.redo.push({ state:H.cur, label:e.label, time:e.time }); H.cur = e.state; } }
  else { for(let i = 0; i < -stepsBack && H.redo.length; i++){ const e = H.redo.pop(); H.undo.push({ state:H.cur, label:e.label, time:e.time }); H.cur = e.state; } }
  H.curObj = JSON.parse(H.cur);
  await restore(H.cur);
  emit();
}

// ---- omschrijving van een wijziging ----
function describe(a, b){
  const out = [];
  const rowKey = r => r[0] ? `${r[0]} port ${r[1]}` : `Loose DMX ${r[5] || ''} ${r[3] || ''}`.trim();
  const rowMap = rows => { const m = new Map(); for(const r of rows || []){ const k = rowKey(r); m.set(m.has(k) ? `${k}#${m.size}` : k, r); } return m; };
  const ra = rowMap(a.rows), rb = rowMap(b.rows);
  const changed = [], added = [], removed = [];
  for(const [k, r] of rb){
    const o = ra.get(k);
    if(!o) added.push(k);
    else if(String(o[2]) !== String(r[2]) || String(o[3] || '') !== String(r[3] || '')){
      changed.push(String(o[2]) !== String(r[2]) ? `${k}: U${o[2] === '' ? '–' : o[2]} → U${r[2] === '' ? '–' : r[2]}` : `${k}: location “${r[3] || ''}”`);
    }
  }
  for(const k of ra.keys()) if(!rb.has(k)) removed.push(k);
  const many = (list, verb) => list.length === 1 ? `${verb} ${list[0]}` : `${verb} ${list.length} patch rows`;
  if(changed.length) out.push(changed.length === 1 ? changed[0] : `${changed.length} patch rows changed`);
  if(added.length) out.push(many(added, 'Added'));
  if(removed.length) out.push(many(removed, 'Removed'));

  const srcNames = s => (s || []).map(x => `${x.id}|${x.name}|${x.updatedAt}`);
  const sa = srcNames(a.csvSources), sb = srcNames(b.csvSources);
  if(sa.join() !== sb.join()){
    const na = new Set((a.csvSources || []).map(x => x.id)), nb = new Set((b.csvSources || []).map(x => x.id));
    const imp = (b.csvSources || []).filter(x => !na.has(x.id)).map(x => x.name);
    const del = (a.csvSources || []).filter(x => !nb.has(x.id)).map(x => x.name);
    if(imp.length) out.unshift(`Imported ${imp.join(', ')}`);
    else if(del.length) out.unshift(`Removed file ${del.join(', ')}`);
    else out.unshift('Replaced imported file');
  }
  for(const [id, v] of Object.entries(b.lkAssign || {})){
    const o = a.lkAssign?.[id] || {};
    for(const s of ['1', '2', '3']) if((o[s] || null) !== (v[s] || null)) out.push(v[s] ? `${id} Veam ${s} → ${v[s]}` : `${id} Veam ${s} unlinked`);
  }
  for(const [id, v] of Object.entries(b.lkBlockType || {})){
    const o = a.lkBlockType?.[id];
    if(o && (o.value !== v.value || o.mode !== v.mode)) out.push(`${id} block type → ${v.mode === 'Auto' ? 'Auto' : App.blockTypeLabel(v.value)}`);
  }
  const listDiff = (key, noun) => {
    const x = new Set(a[key] || []), y = new Set(b[key] || []);
    for(const id of y) if(!x.has(id)) out.push(`Added ${noun} ${id}`);
    for(const id of x) if(!y.has(id)) out.push(`Removed ${noun} ${id}`);
  };
  listDiff('manualLKs', ''); listDiff('manualVeams', '');
  const same = k => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null);
  if(!same('projectMeta')) out.push('Project info changed');
  if(!same('dimColors')) out.push('DimCity color changed');
  const na = a.networkDevices || {}, nb = b.networkDevices || {};
  const nsame = k => JSON.stringify(na[k] ?? null) === JSON.stringify(nb[k] ?? null);
  if(!nsame('dimCityPlans')){
    const dcs = [...new Set([...Object.keys(na.dimCityPlans || {}), ...Object.keys(nb.dimCityPlans || {})])]
      .filter(dc => JSON.stringify(na.dimCityPlans?.[dc] ?? null) !== JSON.stringify(nb.dimCityPlans?.[dc] ?? null));
    out.push(`Network plan ${dcs.join(', ')} changed`);
  }
  if(!nsame('rackTypes')) out.push('Racks changed');
  if(['nodeTypes', 'splitterTypes', 'switchTypes', 'panelTypes'].some(k => !nsame(k))) out.push('Devices changed');
  if(!same('pdfSettings') || !same('pdfTemplates')) out.push('PDF layout changed');
  if(!out.length) return 'Edit';
  return out.length > 2 ? `${out.slice(0, 2).join(' · ')} · +${out.length - 2} more` : out.join(' · ');
}

// ---- Geschiedenisvenster ----
function openPanel(){
  flush();
  const fmt = t => new Date(t).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const d = App.ui.openDialog({
    title:'History', subtitle:'Every change in this session. Click a step to go back to it — you can always redo.',
    width:'620px', body:'',
    footer:`<span class="left">${I('info', 13)} Cmd+Z undo · Shift+Cmd+Z redo</span><button class="primary" data-a="ok">Close</button>`
  });
  d.footer.querySelector('[data-a=ok]').onclick = d.close;
  const draw = () => {
    const done = H.undo.map((e, i) => ({ ...e, steps:H.undo.length - i }));          // 1 = laatste wijziging
    const future = H.redo.map((e, i) => ({ ...e, steps:-(H.redo.length - i) })).reverse();
    const row = (e, cls) => `<li class="hist-item ${cls}" data-steps="${e.steps}"><span class="hist-dot"></span><div><b>${esc(e.label)}</b><span>${fmt(e.time)}</span></div>
      <button class="sm ghost">${cls === 'undone' ? `${I('refresh', 13)}Redo to here` : `${I('chevronLeft', 13)}Undo to before`}</button></li>`;
    d.body.innerHTML = done.length || future.length ? `<ul class="hist-list">
        ${future.map(e => row(e, 'undone')).join('')}
        <li class="hist-now"><span class="hist-dot"></span><b>Current state</b></li>
        ${done.slice().reverse().map(e => row(e, '')).join('')}
        <li class="hist-item start"><span class="hist-dot"></span><div><b>Opened / created</b><span>start of this session</span></div></li>
      </ul>` : `<div class="empty">${I('clock', 30)}<h3>No changes yet</h3><p>Changes you make in this show appear here.</p></div>`;
    d.body.querySelectorAll('.hist-item[data-steps] button').forEach(b => b.onclick = async () => {
      const steps = Number(b.closest('[data-steps]').dataset.steps);
      await jump(steps);
      draw();
    });
  };
  draw();
  const off = onChange(draw);
  const obs = new MutationObserver(() => { if(!d.bd.isConnected){ off(); obs.disconnect(); } });
  obs.observe(document.body, { childList:true });
}
function onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }

// (niet window.History: dat is de ingebouwde browser-interface)
window.PatchHistory = { undo, redo, reset, label, flush, openPanel, onChange, describe,
  get canUndo(){ return H.undo.length > 0; }, get canRedo(){ return H.redo.length > 0; }, get changeCount(){ return H.changeCount; } };
setTimeout(reset, 0);
