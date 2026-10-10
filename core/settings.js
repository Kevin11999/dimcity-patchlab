// core/settings.js
// App-wide preferences (not per show): theme, language, autosave/backup, updates.
// Stored in userData/settings.json via the main process.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;

const DEFAULTS = {
  theme: 'dark',                 // dark | light | system
  language: 'en',                // en | nl
  autosave: {
    mode: 'time',                // off | actions | time
    actions: 20,                 // elke N wijzigingen
    minutes: 5,                  // elke N minuten
    saveOriginal: true,          // het projectbestand zelf opslaan (alleen als het al een bestand heeft)
    backup: false,               // daarnaast een losse back-upkopie maken
    backupDir: '',               // leeg = Documenten/DimCity PatchLab Backups
    keep: 20                     // aantal back-ups per project
  },
  recovery: true,                // herstelbestand bijhouden voor na een crash
  updates: { repo:'Kevin11999/dimcity-patchlab', token:'', checkOnStart:true },
  library: { checkOnStart:true },    // standaardbibliotheek (Luminex / ELC …) van GitHub bijwerken
  fun: { confetti:true }             // confetti zodra de validatie schoon is
};

let S = structuredClone(DEFAULTS);
let paths = {};
const listeners = new Set();

function merge(base, over){
  const out = { ...base };
  for(const [k, v] of Object.entries(over || {})){
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  }
  return out;
}
async function load(){
  try {
    const data = window.app?.settingsRead ? await window.app.settingsRead() : JSON.parse(localStorage.getItem('patchlab.settings') || '{}');
    S = merge(DEFAULTS, data);
  } catch { S = structuredClone(DEFAULTS); }
  try { paths = (await window.app?.appPaths?.()) || {}; } catch { paths = {}; }
  apply();
  return S;
}
async function save(){
  try {
    if(window.app?.settingsWrite) await window.app.settingsWrite(S);
    else localStorage.setItem('patchlab.settings', JSON.stringify(S));
  } catch(err){ App.ui.toast(`Could not save settings: ${err.message}`, 'err'); }
  apply();
  listeners.forEach(fn => { try { fn(S); } catch {} });
}
function get(){ return S; }
function onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }
const backupDir = () => S.autosave.backupDir || paths.defaultBackups || '';

// ---- Thema + taal toepassen ----
const media = window.matchMedia?.('(prefers-color-scheme: light)');
function resolvedTheme(){ return S.theme === 'system' ? (media?.matches ? 'light' : 'dark') : S.theme; }
function apply(){
  document.documentElement.dataset.theme = resolvedTheme();
  window.I18n?.setLanguage?.(S.language);
}
media?.addEventListener?.('change', () => { if(S.theme === 'system') apply(); });

// ---- Instellingenvenster ----
function open(section = 'general'){
  let tab = section;
  const tt = (en, nl) => ((window.I18n?.language || S.language) === 'nl' ? nl : en);
  const CR = () => window.CsvRules;
  let draft = null;                                   // the rules of the show while they are being edited
  const showModel = () => App.getMODEL();
  const loadDraft = () => { draft = JSON.parse(JSON.stringify(CR().rules(showModel()))); };
  const d = App.ui.openDialog({
    title:'Settings', subtitle:'General, autosave, updates and library apply to the app on this computer. “This show” is saved in the show file.',
    width:'720px', cls:'settings-modal', body:'',
    footer:`<button class="primary" data-a="done">Done</button>`
  });
  d.footer.querySelector('[data-a=done]').onclick = d.close;
  const seg = (name, value, options) => `<div class="segmented rb-full" data-seg="${name}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(value) === String(v) ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  const sw = (name, on, label, hint='') => `<label class="rb-row"><span>${label}${hint ? `<span class="hint" style="display:block;margin:2px 0 0">${hint}</span>` : ''}</span><span class="switch"><input type="checkbox" data-sw="${name}" ${on ? 'checked' : ''}><span></span></span></label>`;
  const sections = {
    show: () => {
      if(!draft) loadDraft();
      const m = showModel(), cur = CR().rules(m), changed = JSON.stringify(CR().rules({ rules:draft })) !== JSON.stringify(cur);
      const cnt = CR().count(window.LKApp.csvRows?.() || [], { rules:draft });
      const prefixes = [['lk', tt('An LK is called', 'Een LK heet'), 'LK101'], ['veam', tt('A Veam is called', 'Een Veam heet'), 'V101'], ['node', tt('A node is called', 'Een node heet'), 'Node601,1']];
      const dup = (() => { const seen = new Map(), bad = new Set(); const all = [draft.lk, draft.veam, draft.node, ...draft.looms.map(l => l.prefix)]; for(const p of all){ const k = String(p || '').toUpperCase(); if(!k) continue; if(seen.has(k)) bad.add(k); seen.set(k, 1); } return bad; })();
      return `
      <div class="hint" style="margin-bottom:10px">${I('info', 13)} ${tt('These rules belong to the show that is open now and are saved in its file. They tell PatchLab how to read the first column of your patch CSV.', 'Deze regels horen bij de show die nu open is en worden in het bestand bewaard. Ze vertellen PatchLab hoe de eerste kolom van je patch-CSV gelezen wordt.')}</div>
      <div class="rb-group"><div class="rb-label">${tt('Names in the first column of the CSV', 'Namen in de eerste kolom van de CSV')}</div>
        ${prefixes.map(([k, l, ex]) => `<label class="field" style="margin-bottom:8px"><span>${l}</span><span style="display:flex;gap:10px;align-items:center"><input type="text" data-rule="${k}" value="${esc(draft[k])}" maxlength="12" style="width:140px"><span class="subtle">${tt('followed by the number, like', 'gevolgd door het nummer, zoals')} <b>${esc(draft[k])}${k === 'node' ? '601,1' : '101'}</b></span></span></label>`).join('')}
        <div class="hint">${tt('The number tells the DB: 101 is DB01, 601 is DB06. Other names stay valid as long as they do not mean something else in this show (for example VEAM12101 is still LK101).', 'Het nummer bepaalt de DB: 101 is DB01, 601 is DB06. Andere namen blijven geldig zolang ze in deze show niets anders betekenen (VEAM12101 is bijvoorbeeld nog steeds LK101).')}</div></div>
      <div class="rb-group"><div class="rb-label">${tt('Network looms (Cat cables)', 'Netwerklooms (Cat-kabels)')}</div>
        <table class="data-table" style="max-width:560px"><thead><tr><th>${tt('Name', 'Naam')}</th><th>${tt('Prefix', 'Voorvoegsel')}</th><th>${tt('Lines', 'Lijnen')}</th><th></th></tr></thead><tbody>
          ${draft.looms.map((l, i) => `<tr><td><input type="text" data-loom="${i}" data-k="name" value="${esc(l.name)}" maxlength="40" style="width:170px"></td><td><input type="text" data-loom="${i}" data-k="prefix" value="${esc(l.prefix)}" maxlength="12" style="width:90px" class="${dup.has(String(l.prefix).toUpperCase()) || !l.prefix ? 'invalid' : ''}"></td><td><input type="number" data-loom="${i}" data-k="lines" min="1" max="48" value="${l.lines}" style="width:70px"></td><td>${draft.looms.length > 1 ? `<button class="sm ghost" data-a="loomdel" data-i="${i}" title="${tt('Remove this loom type', 'Verwijder dit loomtype')}">${I('trash', 13)}</button>` : ''}</td></tr>`).join('')}</tbody></table>
        <div style="margin-top:8px"><button class="sm" data-a="loomadd">${I('plus', 13)} ${tt('Add a loom type', 'Loomtype toevoegen')}</button></div>
        <div class="hint">${tt('A loom has its own prefix and number of lines. Line numbers are written C101.1 or in the port column, like an LK.', 'Een loom heeft een eigen voorvoegsel en aantal lijnen. Lijnen schrijf je als C101.1 of in de poortkolom, zoals bij een LK.')}</div></div>
      <div class="rb-group"><div class="rb-label">${tt('What these rules find in your CSV files', 'Wat deze regels in je CSV-bestanden vinden')}</div>
        <div class="fent-warns"><span class="fent-chip" style="--c:#4ea8ff">LK · ${cnt.LK}</span><span class="fent-chip" style="--c:#35c47c">Veam · ${cnt.V}</span><span class="fent-chip" style="--c:#22c3d6">${tt('Loom lines', 'Loomlijnen')} · ${cnt.NET}</span><span class="fent-chip" style="--c:#f2b33d">Node · ${cnt.NODE}</span><span class="fent-chip" style="--c:#94a3b8">${tt('Loose DMX', 'Losse DMX')} · ${cnt.DMX}</span><span class="fent-chip" style="--c:${cnt.unknown ? '#ef4444' : '#94a3b8'}">${tt('Not recognised', 'Niet herkend')} · ${cnt.unknown}</span></div>
        <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button class="primary" data-a="rulesapply" ${changed && !dup.size && draft.looms.every(l => l.prefix) ? '' : 'disabled'}>${tt('Apply and read the CSV again', 'Toepassen en de CSV opnieuw inlezen')}</button><button class="sm ghost" data-a="rulesreset">${tt('Back to the standard names', 'Terug naar de standaardnamen')}</button>${dup.size ? `<span class="su-warn">${tt('Two names are the same', 'Twee namen zijn gelijk')}</span>` : ''}</div></div>
      <div class="rb-group"><div class="rb-label">${tt('Racks', 'Racks')}</div>
        ${sw('show.veamOnLkPanel', cur.veamOnLkPanel, tt('A Veam may go on a free Veam4 socket of an LK panel', 'Een Veam mag op een vrije Veam4-aansluiting van een LK-paneel'), tt('Off (standard): the Veam4 sockets of an LK panel belong to that LK. Switch this on if you want Setup and the automatic coupling to use them for other Veams as well.', 'Uit (standaard): de Veam4-aansluitingen van een LK-paneel horen bij die LK. Zet dit aan als Setup en het automatisch koppelen ze ook voor andere Veams mogen gebruiken.'))}</div>`;
    },
    general: () => `
      <div class="rb-group"><div class="rb-label">Appearance</div>${seg('theme', S.theme, [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match system']])}</div>
      <div class="rb-group"><div class="rb-label">Language</div>${seg('language', S.language, [['en', 'English'], ['nl', 'Nederlands']])}
        <div class="hint">Changes the app and its menus. PDF reports stay in English.</div></div>
      <div class="rb-group"><div class="rb-label">Fun</div>${sw('fun.confetti', S.fun.confetti, 'Confetti when a show has no errors or warnings left', 'A little party when the validation turns clean. Switch it off if you prefer a quiet app.')}</div>`,
    autosave: () => {
      const a = S.autosave;
      return `
      <div class="rb-group"><div class="rb-label">Save automatically</div>
        ${seg('autosave.mode', a.mode, [['off', 'Off'], ['actions', 'Every N changes'], ['time', 'Every N minutes']])}
        ${a.mode === 'actions' ? `<label class="field" style="margin-top:12px">After this many changes<input type="number" min="1" max="500" data-num="autosave.actions" value="${a.actions}"></label>` : ''}
        ${a.mode === 'time' ? `<label class="field" style="margin-top:12px">Every … minutes<input type="number" min="1" max="120" data-num="autosave.minutes" value="${a.minutes}"></label>` : ''}
      </div>
      ${a.mode !== 'off' ? `<div class="rb-group"><div class="rb-label">What to save</div>
        ${sw('autosave.saveOriginal', a.saveOriginal, 'Save the show file itself', 'Only for shows that already have a file. New shows are never saved without asking.')}
        ${sw('autosave.backup', a.backup, 'Also make a separate backup copy', 'A dated copy in a backup folder — the original file is not touched by this.')}
        ${a.backup ? `<div class="set-folder"><div><b>Backup folder</b><span>${esc(backupDir() || '—')}</span></div>
            <button class="sm" data-a="pickdir">${I('folder', 13)}Choose…</button>
            ${S.autosave.backupDir ? `<button class="sm ghost" data-a="resetdir">Default</button>` : ''}
            <button class="sm ghost" data-a="opendir" title="Open folder">${I('arrowRight', 13)}</button></div>
          <label class="field" style="margin-top:10px">Keep the last … backups per show<input type="number" min="1" max="500" data-num="autosave.keep" value="${a.keep}"></label>` : ''}
      </div>` : ''}
      <div class="rb-group"><div class="rb-label">Crash recovery</div>
        ${sw('recovery', S.recovery, 'Keep a recovery copy of unsaved work', 'If the app closes unexpectedly, you can restore your last changes the next time it starts.')}
      </div>`;
    },
    updates: () => `
      <div class="rb-group"><div class="rb-label">Version</div>
        <div class="set-folder"><div><b id="setVersion">DimCity PatchLab</b><span>Updates are downloaded from GitHub Releases.</span></div>
        <button class="sm primary" data-a="check">${I('refresh', 13)}Check now</button></div>
        ${sw('updates.checkOnStart', S.updates.checkOnStart, 'Check for updates when the app starts')}
      </div>
      <div class="rb-group"><div class="rb-label">Release source</div>
        <label class="field">GitHub repository<input type="text" data-text="updates.repo" value="${esc(S.updates.repo)}" placeholder="owner/name"></label>
        <label class="field" style="margin-top:10px">Access token <span class="subtle">(only for a private repository)</span><input type="password" data-text="updates.token" value="${esc(S.updates.token)}" placeholder="github_pat_…" autocomplete="off"></label>
        <div class="hint">Tip: publish releases in a public repository, so colleagues don't need a token.</div>
      </div>`,
    library: () => { const li = window.Library?.standardInfo?.() || { version:0, count:0, checkedAt:null }; return `
      <div class="rb-group"><div class="rb-label">Standard device library</div>
        <div class="set-folder"><div><b>Luminex, ELC and standard panels</b><span>${li.count} standard types in your library</span><span>Library version ${li.version || '—'}</span>${li.checkedAt ? `<span>Last checked ${new Date(li.checkedAt).toLocaleDateString(S.language === 'nl' ? 'nl-NL' : 'en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>` : ''}</div>
        <button class="sm primary" data-a="libcheck">${I('refresh', 13)}Check now</button></div>
        ${sw('library.checkOnStart', S.library.checkOnStart, 'Check for library updates when the app starts', 'Separate from app updates: new or corrected device types are added to your library. Types you edited yourself are never overwritten.')}
        <div class="hint">The standard library is read from the same GitHub repository as the app updates (library/standard-library.json).</div>
      </div>`; }
  };
  const setPath = (p, v) => { const k = p.split('.'); let o = S; while(k.length > 1) o = o[k.shift()]; o[k[0]] = v; };
  const getPath = p => p.split('.').reduce((o, k) => o?.[k], S);
  function render(){
    d.body.innerHTML = `<div class="settings-layout">
      <nav class="settings-nav">${[['show', 'file', tt('This show', 'Deze show')], ['general', 'sliders', 'General'], ['autosave', 'save', 'Autosave & backup'], ['updates', 'download', 'Updates'], ['library', 'network', 'Device library']].map(([k, ic, l]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${I(ic, 15)}${l}</button>`).join('')}</nav>
      <div class="settings-body">${sections[tab]()}</div></div>`;
    d.body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    d.body.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = async () => { setPath(g.dataset.seg, b.dataset.v); await save(); render(); }));
    d.body.querySelectorAll('[data-sw]').forEach(n => n.onchange = async () => {
      if(n.dataset.sw.startsWith('show.')){ const m = showModel(); m.rules = { ...(m.rules || {}), [n.dataset.sw.slice(5)]: n.checked }; m.ui.dirty = true; window.LKApp.renderAll?.(); render(); return; }
      setPath(n.dataset.sw, n.checked); await save(); render();
    });
    if(tab === 'show'){
      d.body.querySelectorAll('[data-rule]').forEach(n => { n.oninput = () => { n.value = n.value.replace(/[^A-Za-z]/g, ''); }; n.onchange = () => { draft[n.dataset.rule] = n.value.replace(/[^A-Za-z]/g, '') || CR().DEFAULTS()[n.dataset.rule]; render(); }; });
      d.body.querySelectorAll('[data-loom]').forEach(n => n.onchange = () => {
        const l = draft.looms[Number(n.dataset.loom)], k = n.dataset.k;
        if(k === 'prefix') l.prefix = n.value.replace(/[^A-Za-z]/g, ''); else if(k === 'lines') l.lines = Math.max(1, Math.min(48, Math.round(Number(n.value) || 4))); else l.name = n.value.trim().slice(0, 40);
        render();
      });
      const act2 = (a, fn) => d.body.querySelectorAll(`[data-a="${a}"]`).forEach(b => b.onclick = () => fn(b));
      act2('loomadd', () => { draft.looms.push({ id:'loom' + Date.now().toString(36), name:tt('Loom', 'Loom'), prefix:'', lines:4 }); render(); });
      act2('loomdel', b => { draft.looms.splice(Number(b.dataset.i), 1); render(); });
      act2('rulesreset', () => { draft = CR().DEFAULTS(); render(); });
      act2('rulesapply', async () => {
        const m = showModel(), clean = CR().rules({ rules:draft });
        m.rules = { ...(m.rules || {}), lk:clean.lk, veam:clean.veam, node:clean.node, looms:clean.looms };
        await window.LKApp.rebuild();
        App.ui.toast(tt('The CSV is read again with these names', 'De CSV is opnieuw gelezen met deze namen'), 'ok');
        loadDraft(); render();
      });
    }
    d.body.querySelectorAll('[data-num]').forEach(n => n.onchange = async () => {
      const v = Math.max(Number(n.min) || 1, Math.min(Number(n.max) || 999, Math.round(Number(n.value) || getPath(n.dataset.num))));
      n.value = v; setPath(n.dataset.num, v); await save();
    });
    d.body.querySelectorAll('[data-text]').forEach(n => n.onchange = async () => { setPath(n.dataset.text, n.value.trim()); await save(); });
    const act = (a, fn) => { const b = d.body.querySelector(`[data-a="${a}"]`); if(b) b.onclick = fn; };
    act('pickdir', async () => {
      const res = await window.app?.showOpenDialog?.({ title:'Choose backup folder', properties:['openDirectory', 'createDirectory'], defaultPath:backupDir() || undefined });
      if(res && !res.canceled && res.filePaths?.[0]){ S.autosave.backupDir = res.filePaths[0]; await save(); render(); }
    });
    act('resetdir', async () => { S.autosave.backupDir = ''; await save(); render(); });
    act('opendir', () => window.app?.openPath?.(backupDir()));
    act('check', () => window.Updater?.check?.({ manual:true }));
    act('libcheck', async () => { const b = d.body.querySelector('[data-a=libcheck]'); b.disabled = true; await window.Library?.checkStandardUpdate?.({ manual:true }); render(); });
    window.app?.appInfo?.().then(info => { const v = d.body.querySelector('#setVersion'); if(v && info) v.textContent = `${info.name} ${info.version}`; });
  }
  render();
}

const ready = load();
window.Settings = { load, save, get, onChange, open, backupDir, ready, DEFAULTS };
