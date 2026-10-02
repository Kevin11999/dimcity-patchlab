// core/library.js
// Personal library: node/splitter/switch/panel types, racks and PDF templates.
// Lives outside the projects (userData/library.lklib) and can be exported/imported to share
// with colleagues. Every show (.lkproj) also carries its own copy, so it opens anywhere;
// when a show has items the library doesn't, the user is asked whether to add them.
const App = window.LKApp;
const { esc, nextTypedId } = App.net;
const I = (n, s) => App.ui.icon(n, s);

const KINDS = [
  { key:'nodeTypes',     label:'Nodes',         prefix:'NODE:' },
  { key:'splitterTypes', label:'Splitters',     prefix:'SPLIT:' },
  { key:'switchTypes',   label:'Switches',      prefix:'SWITCH:' },
  { key:'panelTypes',    label:'Panels',        prefix:'PANEL:' },
  { key:'rackTypes',     label:'Racks',         prefix:'RACK:' },
  { key:'pdfTemplates',  label:'PDF templates', prefix:'tpl_' }
];
const RACK_ITEM_KIND = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' };
const LS_KEY = 'patchlab.library';

let LIB = emptyLib();
let loaded = false;

function emptyLib(){ return Object.fromEntries(KINDS.map(k => [k.key, []])); }
const clone = x => JSON.parse(JSON.stringify(x));
function normalizeLib(data){
  const out = emptyLib();
  if(!data || typeof data !== 'object') return out;
  for(const { key } of KINDS) if(Array.isArray(data[key])) out[key] = data[key].filter(x => x && typeof x === 'object' && x.id);
  return out;
}
// Lijst in het project voor een soort (maakt hem aan als hij ontbreekt)
function projectList(M, key){
  if(key === 'pdfTemplates'){ if(!Array.isArray(M.pdfTemplates)) M.pdfTemplates = []; return M.pdfTemplates; }
  M.networkDevices = App.net.normalizeNetworkDevices(M.networkDevices);
  return M.networkDevices[key];
}
function stable(v){
  if(Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if(v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
function hash(str){
  let h = 5381;
  for(let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const same = (a, b) => stable(a) === stable(b);
const itemName = item => [item.brand, item.name].filter(Boolean).join(' ') || item.id;
const kindOf = key => KINDS.find(k => k.key === key);

// ---- Opslag ----
async function load(){
  let text = null;
  try {
    text = window.app?.libraryRead ? await window.app.libraryRead() : localStorage.getItem(LS_KEY);
  } catch { text = null; }
  try { LIB = normalizeLib(text ? JSON.parse(text) : null); }
  catch { LIB = emptyLib(); App.ui.toast('Library file is damaged — starting with an empty library', 'err'); }
  loaded = true;
  return LIB;
}
function serialize(){
  return JSON.stringify({ fileType:'patchlab-library', version:1, savedAt:new Date().toISOString(), ...LIB }, null, 2);
}
async function save(){
  try {
    if(window.app?.libraryWrite) await window.app.libraryWrite(serialize());
    else localStorage.setItem(LS_KEY, serialize());
  } catch(err){
    App.ui.toast(`Could not save library: ${err.message}`, 'err');
  }
}

// ---- Bewerken (gespiegeld vanuit Device Builder en Report Builder) ----
function put(key, item, oldId){
  const ids = new Set([item.id, oldId].filter(Boolean));
  const idx = LIB[key].findIndex(x => ids.has(x.id));
  const rest = LIB[key].filter(x => !ids.has(x.id));
  rest.splice(idx >= 0 ? Math.min(idx, rest.length) : rest.length, 0, clone(item));
  LIB[key] = rest;
  return save();
}
function del(key, id){
  LIB[key] = LIB[key].filter(x => x.id !== id);
  return save();
}
function get(key, id){ return LIB[key].find(x => x.id === id) || null; }
function list(key){ return LIB[key]; }
// 'ok' | 'missing' (niet in bibliotheek) | 'different' (zelfde id, andere inhoud)
function status(key, item){
  const lib = get(key, item.id);
  if(!lib) return 'missing';
  return same(lib, item) ? 'ok' : 'different';
}

// Alle bibliotheek-items die het project nog niet heeft, toevoegen aan het project.
// De versie in het project wint bij een gelijk id: daarmee is de show gemaakt.
function fillProject(M){
  let added = 0;
  for(const { key } of KINDS){
    const pl = projectList(M, key);
    for(const item of LIB[key]) if(!pl.some(x => x.id === item.id)){ pl.push(clone(item)); added++; }
  }
  return added;
}

// Verschillen tussen een bron (project of bestand) en de bibliotheek
function diffAgainstLibrary(source, dismissed=[]){
  const out = [];
  for(const { key } of KINDS){
    for(const item of (source[key] || [])){
      if(!item?.id) continue;
      const st = status(key, item);
      if(st === 'ok') continue;
      const token = `${key}:${item.id}:${hash(stable(item))}`;
      if(dismissed.includes(token)) continue;
      out.push({ key, item, status:st, token });
    }
  }
  return out;
}
function sourceFromProject(M){
  return Object.fromEntries(KINDS.map(({ key }) => [key, projectList(M, key)]));
}

// ---- Review-dialoog: welke items naar de bibliotheek? ----
function reviewDialog(diffs, { title, intro, source, project, onSkip }){
  return new Promise(resolve => {
    let done = false;
    const groups = KINDS.map(k => ({ k, rows: diffs.filter(d => d.key === k.key) })).filter(g => g.rows.length);
    const rowHtml = (d, i) => {
      const lib = d.status === 'different' ? get(d.key, d.item.id) : null;
      return `<tr>
        <td style="width:28px"><input type="checkbox" data-i="${i}" checked></td>
        <td><b>${esc(itemName(d.item))}</b><div class="subtle" style="font-size:11.5px">${esc(d.item.id)}${lib ? ` · your library has “${esc(itemName(lib))}”` : ''}</div></td>
        <td>${d.status === 'missing' ? '<span class="tag blue">New</span>' : '<span class="tag yellow">Differs</span>'}</td>
        <td>${d.status === 'different' ? `<select data-act-i="${i}">
              <option value="copy">${project ? 'Keep both (new key for this one)' : 'Add as copy'}</option>
              <option value="replace">Replace my version</option>
            </select>` : '<span class="subtle">Add</span>'}</td>
      </tr>`;
    };
    const body = `<p style="margin:0 0 12px;color:var(--text-2);line-height:1.55">${intro}</p>
      ${groups.map(g => `<div class="lib-review-group"><div class="rb-label">${esc(g.k.label)}</div>
        <div class="table-wrap"><table class="data-table"><tbody>${g.rows.map(d => rowHtml(d, diffs.indexOf(d))).join('')}</tbody></table></div></div>`).join('')}`;
    const d = App.ui.openDialog({
      title, width:'720px', body,
      footer:`<button data-act="skip">Not now</button><button class="primary" data-act="add">${I('download',14)}Add to Library</button>`,
      onClose:() => { if(!done) resolve(false); }
    });
    d.footer.querySelector('[data-act=skip]').onclick = () => {
      done = true; d.close(); onSkip?.(diffs); resolve(false);
    };
    d.footer.querySelector('[data-act=add]').onclick = async () => {
      const chosen = [], skipped = [];
      diffs.forEach((x, i) => {
        const on = d.body.querySelector(`[data-i="${i}"]`)?.checked;
        const action = d.body.querySelector(`[data-act-i="${i}"]`)?.value || 'add';
        (on ? chosen : skipped).push({ ...x, action });
      });
      done = true; d.close();
      const n = await applyReview(chosen, source, project);
      if(skipped.length) onSkip?.(skipped);
      App.ui.toast(n ? `${n} item${n === 1 ? '' : 's'} added to your library` : 'Library unchanged', n ? 'ok' : 'info');
      resolve(n > 0);
    };
  });
}
// Bij een show (project) krijgt de kopie in de show een nieuwe key, zodat jouw eigen versie
// met de oude key ook in de show beschikbaar blijft. Bij een bestand alleen in de bibliotheek.
async function applyReview(chosen, source, project){
  let n = 0;
  const addOne = (key, item) => { LIB[key].push(clone(item)); n++; };
  for(const c of chosen){
    if(c.status === 'missing') addOne(c.key, c.item);
    else if(c.action === 'replace'){ LIB[c.key] = LIB[c.key].map(x => x.id === c.item.id ? clone(c.item) : x); n++; }
    else {
      const k = kindOf(c.key);
      const copy = { ...clone(c.item), id: nextTypedId(k.prefix, LIB[c.key].concat(source[c.key] || [])) };
      if(project) rekeyProject(project, c.key, c.item.id, copy.id);
      else if(copy.name) copy.name = `${copy.name} (copy)`;
      addOne(c.key, copy);
    }
    // Een rack neemt de devices mee die erin zitten en nog niet in de bibliotheek staan
    if(c.key === 'rackTypes'){
      for(const it of (c.item.items || [])){
        const dk = RACK_ITEM_KIND[it.kind];
        if(!dk || get(dk, it.typeId)) continue;
        const dep = (source[dk] || []).find(x => x.id === it.typeId);
        if(dep) addOne(dk, dep);
      }
    }
  }
  if(n) await save();
  return n;
}

// Een type-key in het project hernoemen, inclusief alle verwijzingen (racks, DimCity-plannen)
function rekeyProject(M, key, oldId, newId){
  const pl = projectList(M, key);
  const item = pl.find(x => x.id === oldId);
  if(item) item.id = newId;
  const kind = Object.keys(RACK_ITEM_KIND).find(k => RACK_ITEM_KIND[k] === key);
  for(const r of projectList(M, 'rackTypes')) for(const it of (r.items || [])) if(it.kind === kind && it.typeId === oldId) it.typeId = newId;
  const swap = v => v === oldId ? newId : v;
  for(const plan of Object.values(M.networkDevices.dimCityPlans || {})){
    if(key === 'nodeTypes'){
      plan.nodeTypeId = swap(plan.nodeTypeId);
      for(const n of (plan.nodes || [])) n.typeId = swap(n.typeId);
      for(const d of (plan.loose || [])) if(d.kind === 'node') d.typeId = swap(d.typeId);
    }
    if(key === 'splitterTypes'){
      plan.lastSplitterTypeId = swap(plan.lastSplitterTypeId);
      if(Array.isArray(plan.splitterTypeIds)) plan.splitterTypeIds = plan.splitterTypeIds.map(swap);
      for(const sp of (plan.splitters || [])) sp.typeId = swap(sp.typeId);
    }
    if(key === 'switchTypes') for(const sw of (plan.switches || [])) sw.typeId = swap(sw.typeId);
  }
  M.ui.dirty = true;
}

// Na het openen van een show: ontbrekende items aanbieden, daarna eigen bibliotheek beschikbaar maken
async function reviewProject(M){
  if(!loaded) await load();
  if(!Array.isArray(M.libraryDismissed)) M.libraryDismissed = [];
  const source = sourceFromProject(M);
  const diffs = diffAgainstLibrary(source, M.libraryDismissed);
  fillProject(M);
  App.renderAll?.();
  if(!diffs.length) return;
  const nNew = diffs.filter(d => d.status === 'missing').length;
  const nDiff = diffs.length - nNew;
  const parts = [nNew && `<b>${nNew}</b> item${nNew === 1 ? '' : 's'} that ${nNew === 1 ? 'is' : 'are'} not in your library`, nDiff && `<b>${nDiff}</b> that differ${nDiff === 1 ? 's' : ''} from your version`].filter(Boolean);
  await reviewDialog(diffs, {
    title:'This show has devices you don\'t have',
    intro:`This show contains ${parts.join(' and ')}. The show keeps working either way — add them to your library to use them in other shows too.`,
    source,
    project:M,
    onSkip:skipped => {
      // niet opnieuw vragen voor exact deze versies in dit project
      const tokens = new Set(M.libraryDismissed);
      skipped.forEach(s => tokens.add(s.token));
      M.libraryDismissed = [...tokens];
      M.ui.dirty = true;
      App.updateChrome?.();
    }
  });
  fillProject(M);
  App.renderAll?.();
}

// ---- Export / import (.lklib) ----
async function exportFile(){
  if(!loaded) await load();
  const M = App.getMODEL();
  // Eerst de items uit het open project die nog niet in de bibliotheek staan aanbieden
  const pending = diffAgainstLibrary(sourceFromProject(M)).filter(d => d.status === 'missing');
  if(pending.length){
    await reviewDialog(pending, {
      title:'Add project devices before exporting?',
      intro:`The open project has <b>${pending.length}</b> item${pending.length === 1 ? '' : 's'} that ${pending.length === 1 ? 'is' : 'are'} not in your library yet. Add them so they are included in the export.`,
      source:sourceFromProject(M)
    });
  }
  const total = KINDS.reduce((n, k) => n + LIB[k.key].length, 0);
  if(!total){ App.ui.toast('Your library is empty — create devices in the Device Builder first', 'info'); return; }
  const content = serialize();
  const defaultName = 'PatchLab Library.lklib';
  if(window.app?.showSaveDialog){
    const res = await window.app.showSaveDialog({ title:'Export Library', defaultPath:defaultName, filters:[{ name:'PatchLab Library', extensions:['lklib'] }] });
    if(!res || res.canceled || !res.filePath) return;
    const p = /\.lklib$/i.test(res.filePath) ? res.filePath : `${res.filePath}.lklib`;
    await window.app.writeTextFile({ filePath:p, content });
    App.ui.toast(`Library exported (${total} items)`, 'ok', { action:{ label:'Show', run:() => window.app.showItemInFolder?.(p) } });
  } else {
    const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([content], { type:'application/json' })), download:defaultName });
    document.body.appendChild(a); a.click(); a.remove();
  }
}
function pickFileBrowser(){
  return new Promise(resolve => {
    const inp = Object.assign(document.createElement('input'), { type:'file', accept:'.lklib,.lkproj,.json' });
    inp.onchange = () => {
      const f = inp.files?.[0]; if(!f) return resolve(null);
      const rd = new FileReader(); rd.onload = () => resolve({ path:f.name, content:rd.result }); rd.readAsText(f);
    };
    inp.click();
  });
}
// Leest een bibliotheek, een show (.lkproj) of een oude node/splitter-export
function sourceFromFile(data){
  if(data?.fileType === 'dimcity-node-types') return { ...emptyLib(), nodeTypes:data.items || [] };
  if(data?.fileType === 'dimcity-splitter-types') return { ...emptyLib(), splitterTypes:data.items || [] };
  if(data?.networkDevices) return normalizeLib({ ...data.networkDevices, pdfTemplates:data.pdfTemplates });
  return normalizeLib(data);
}
async function importFile(){
  if(!loaded) await load();
  let file = null;
  if(window.app?.showOpenDialog){
    const res = await window.app.showOpenDialog({ title:'Import Library', properties:['openFile'], filters:[{ name:'PatchLab Library or Show', extensions:['lklib', 'lkproj', 'json'] }] });
    if(!res || res.canceled || !res.filePaths?.[0]) return;
    file = { path:res.filePaths[0], content:await window.app.readTextFile(res.filePaths[0]) };
  } else file = await pickFileBrowser();
  if(!file) return;
  let source;
  try { source = sourceFromFile(JSON.parse(file.content)); }
  catch(err){ App.ui.toast(`Not a valid library file: ${err.message}`, 'err'); return; }
  const diffs = diffAgainstLibrary(source);
  const fname = String(file.path).split(/[\\/]/).pop();
  if(!diffs.length){ App.ui.toast(`Everything in ${fname} is already in your library`, 'info'); return; }
  const added = await reviewDialog(diffs, {
    title:`Import ${fname}`,
    intro:`Choose which items to add to your library. Items with the same key but different settings can be added as a copy or replace your version.`,
    source
  });
  if(added){
    const M = App.getMODEL();
    // vervangen versies ook in het open project bijwerken, nieuwe items beschikbaar maken
    for(const d of diffs) if(d.status === 'different'){
      const lib = get(d.key, d.item.id); const pl = projectList(M, d.key);
      const i = pl.findIndex(x => x.id === d.item.id);
      if(lib && i >= 0 && same(lib, d.item)){ pl[i] = clone(lib); M.ui.dirty = true; }
    }
    fillProject(M);
    App.renderAll?.();
    window.DeviceBuilder?.refresh?.();
  }
}

window.Library = { KINDS, RACK_ITEM_KIND, load, save, put, del, get, list, status, fillProject, reviewProject, exportFile, importFile, itemName };

// Bij het opstarten: bibliotheek laden en beschikbaar maken in het (lege) startproject
load().then(() => { if(fillProject(App.getMODEL())) App.renderAll?.(); });
