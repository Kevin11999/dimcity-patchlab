// ui/search.js
// Cmd+K: search everything in the show (DimCities, LK, Veam, universes, locations, nodes,
// devices, racks) and run commands, with keyboard navigation.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;

const COMMANDS = [
  ['Save', 'save', 'save'], ['Save As…', 'saveAs', 'save'], ['Open Project…', 'openProject', 'folder'], ['New Project…', 'newProject', 'filePlus'],
  ['Import CSV…', 'importCsv', 'upload'], ['Imported Files…', 'csvSources', 'file'], ['Edit Patch Rows…', 'editCsv', 'edit'],
  ['Export PDF / Report Builder…', 'exportPdf', 'file'], ['Device Builder…', 'deviceBuilder', 'network'], ['Rack Builder…', 'deviceBuilder', 'rack', 'rack'],
  ['Network Planner', 'networkPlanner', 'network'], ['Validation', 'view', 'alert', 'ISSUES'], ['Patch List', 'view', 'table', 'TABLE'],
  ['Project Overview', 'view', 'home', 'HOME'], ['History…', 'history', 'clock'], ['Undo', 'undo', 'chevronLeft'], ['Redo', 'redo', 'chevronRight'],
  ['Settings…', 'settings', 'sliders'], ['Check for Updates…', 'checkUpdates', 'download'], ['Add LK…', 'addLK', 'plus'], ['Add Veam…', 'addVeam', 'plus'],
  ['Recalculate', 'rebuild', 'refresh'], ['Export Library…', 'libraryExport', 'download'], ['Import Library…', 'libraryImport', 'upload']
];

function buildIndex(){
  const M = App.getMODEL();
  const out = [];
  const add = (group, icon, title, sub, run, keys='') => out.push({ group, icon, title, sub, run, hay:`${title} ${sub} ${keys}`.toLowerCase() });
  for(const dc of App.sortedDims()){
    const d = M.byDim.get(dc);
    add('DimCities', 'layers', dc, `${d?.lks?.size || 0} LK · ${d?.veams?.size || 0} Veam`, () => App.openEntity('DIM', dc));
  }
  for(const lk of M.byLK.values()) add('LK', 'box', lk.id, `${lk.dimcity} · ${App.blockTypeLabel(App.effectiveBlockType(lk))}${App.lkAutoLocation(lk) ? ` · ${App.lkAutoLocation(lk)}` : ''}`, () => App.openEntity('LK', lk.id));
  for(const ve of M.byVeam.values()) add('Veam', 'plug', ve.id, `${ve.dimcity}${App.veamAutoLocation(ve) ? ` · ${App.veamAutoLocation(ve)}` : ''}`, () => App.openEntity('VEAM', ve.id));
  // universes per DimCity
  const uni = new Map();
  const bump = (dc, u) => { if(u == null || u === '') return; const k = `${dc}|${u}`; uni.set(k, (uni.get(k) || 0) + 1); };
  for(const L of M.lines || []) bump(L.dimcity, L.universe);
  for(const V of M.veamLines || []) bump(V.dimcity, V.universe);
  for(const D of M.dmxLoose || []) bump(D.dimcity, D.universe);
  for(const [k, n] of uni){ const [dc, u] = k.split('|'); add('Universes', 'universe', `Universe ${u}`, `${dc} · ${n} patch point${n === 1 ? '' : 's'}`, () => App.openEntity('DIM', dc), `u${u} uni${u}`); }
  // locaties (per poort)
  const port = (kind, id, p) => () => { App.openEntity(kind, id); requestAnimationFrame(() => { const c = document.querySelector(`#lkDetail .lk-port-cell[data-port="${p}"]`); if(c){ c.scrollIntoView({ block:'center', behavior:'smooth' }); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } }); };
  for(const L of M.lines || []) if(L.dest) add('Locations', 'compass', L.dest, `${L.id} port ${L.port}${L.universe != null ? ` · U${L.universe}` : ''}`, port('LK', App.isLK(L.id) ? L.id.replace(/^VEAM12/i, 'LK') : L.id, L.port));
  for(const V of M.veamLines || []) if(V.dest) add('Locations', 'compass', V.dest, `${V.id} port ${V.port}${V.universe != null ? ` · U${V.universe}` : ''}`, port('VEAM', V.id, V.port));
  for(const D of M.dmxLoose || []) if(D.dest) add('Locations', 'compass', D.dest, `Loose DMX · ${D.dimcity}${D.universe != null ? ` · U${D.universe}` : ''}`, () => App.openEntity('DIM', D.dimcity));
  // netwerk
  const nd = M.networkDevices || {};
  for(const [dc, plan] of Object.entries(nd.dimCityPlans || {})){
    (plan.nodes || []).forEach((n, i) => add('Network', 'network', n.name || n.id || `Node ${i + 1}`, `${dc}${n.ip ? ` · ${n.ip}` : ''}`, () => App.openEntity('DIM', dc), n.ip || ''));
    (plan.racks || []).forEach(r => { const t = (nd.rackTypes || []).find(x => x.id === r.rackId); add('Network', 'rack', r.name || t?.name || r.rackId, `${dc} · rack`, () => App.openEntity('DIM', dc)); });
  }
  const kinds = [['nodeTypes', 'node', 'network'], ['splitterTypes', 'splitter', 'cable'], ['switchTypes', 'switch', 'switchDev'], ['panelTypes', 'panel', 'panel'], ['rackTypes', 'rack', 'rack']];
  for(const [key, tab, icon] of kinds) for(const t of nd[key] || []) add('Devices', icon, [t.brand, t.name].filter(Boolean).join(' ') || t.id, `${t.id} · Device Builder`, () => window.DeviceBuilder?.open?.(tab));
  for(const [title, cmd, icon, arg] of COMMANDS) add('Commands', icon, title, '', () => App.runCommand(cmd, arg), 'command');
  return out;
}

function score(item, terms){
  let s = 0;
  for(const t of terms){
    const i = item.hay.indexOf(t);
    if(i < 0) return -1;
    s += i === 0 ? 30 : item.title.toLowerCase().startsWith(t) ? 25 : item.hay[i - 1] === ' ' ? 12 : 4;
  }
  if(item.title.toLowerCase() === terms.join(' ')) s += 50;
  return s - item.title.length * .05;
}
const GROUP_ORDER = ['DimCities', 'LK', 'Veam', 'Universes', 'Locations', 'Network', 'Devices', 'Commands'];

let open_ = null;
function open(){
  if(open_){ open_.input.focus(); open_.input.select(); return; }
  const index = buildIndex();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop search-backdrop';
  bd.innerHTML = `<div class="search-box" role="dialog" aria-label="Search">
      <div class="search-input">${I('search', 18)}<input type="text" placeholder="Search LK, Veam, universe, location, node… or a command" spellcheck="false"><kbd>esc</kbd></div>
      <div class="search-results"></div>
      <div class="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>⌘K</kbd> search</span></div>
    </div>`;
  document.body.appendChild(bd);
  const input = bd.querySelector('input'), list = bd.querySelector('.search-results');
  let results = [], sel = 0;
  const close = () => { bd.remove(); open_ = null; };
  const run = r => { close(); r?.run(); };
  function render(){
    const q = input.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    if(!terms.length){
      results = index.filter(x => x.group === 'DimCities').concat(index.filter(x => x.group === 'Commands').slice(0, 8));
    } else {
      results = index.map(x => ({ x, s:score(x, terms) })).filter(r => r.s >= 0)
        .sort((a, b) => GROUP_ORDER.indexOf(a.x.group) - GROUP_ORDER.indexOf(b.x.group) || b.s - a.s)
        .map(r => r.x);
      // per groep maximaal 8, zodat alle soorten zichtbaar blijven
      const per = {}; results = results.filter(r => (per[r.group] = (per[r.group] || 0) + 1) <= 8);
    }
    sel = Math.min(sel, Math.max(0, results.length - 1));
    let last = '';
    list.innerHTML = results.length ? results.map((r, i) => {
      const head = r.group !== last ? `<div class="search-group">${esc(r.group)}</div>` : '';
      last = r.group;
      return `${head}<button class="search-item ${i === sel ? 'sel' : ''}" data-i="${i}">${I(r.icon, 15)}<b>${esc(r.title)}</b><span>${esc(r.sub)}</span></button>`;
    }).join('') : `<div class="search-empty">No results for “${esc(input.value)}”</div>`;
    list.querySelector('.search-item.sel')?.scrollIntoView({ block:'nearest' });
  }
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); render(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if(e.key === 'Enter'){ e.preventDefault(); run(results[sel]); }
    else if(e.key === 'Escape'){ e.preventDefault(); close(); }
  });
  list.addEventListener('mousedown', e => { const b = e.target.closest('[data-i]'); if(b){ e.preventDefault(); run(results[Number(b.dataset.i)]); } });
  list.addEventListener('mousemove', e => { const b = e.target.closest('[data-i]'); if(b && Number(b.dataset.i) !== sel){ sel = Number(b.dataset.i); list.querySelectorAll('.search-item').forEach(n => n.classList.toggle('sel', Number(n.dataset.i) === sel)); } });
  bd.addEventListener('mousedown', e => { if(e.target === bd) close(); });
  open_ = { input };
  render();
  input.focus();
}

// Knop in de titelbalk + sneltoets ook zonder native menu (browser)
document.getElementById('tbSearch')?.addEventListener('click', open);
document.addEventListener('keydown', e => { if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !window.app){ e.preventDefault(); open(); } });

window.Search = { open };
