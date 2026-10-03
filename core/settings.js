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
  const d = App.ui.openDialog({
    title:'Settings', subtitle:'These settings apply to the app on this computer, not to a single show.',
    width:'720px', cls:'settings-modal', body:'',
    footer:`<button class="primary" data-a="done">Done</button>`
  });
  d.footer.querySelector('[data-a=done]').onclick = d.close;
  const seg = (name, value, options) => `<div class="segmented rb-full" data-seg="${name}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(value) === String(v) ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  const sw = (name, on, label, hint='') => `<label class="rb-row"><span>${label}${hint ? `<span class="hint" style="display:block;margin:2px 0 0">${hint}</span>` : ''}</span><span class="switch"><input type="checkbox" data-sw="${name}" ${on ? 'checked' : ''}><span></span></span></label>`;
  const sections = {
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
      <nav class="settings-nav">${[['general', 'sliders', 'General'], ['autosave', 'save', 'Autosave & backup'], ['updates', 'download', 'Updates'], ['library', 'network', 'Device library']].map(([k, ic, l]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${I(ic, 15)}${l}</button>`).join('')}</nav>
      <div class="settings-body">${sections[tab]()}</div></div>`;
    d.body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    d.body.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = async () => { setPath(g.dataset.seg, b.dataset.v); await save(); render(); }));
    d.body.querySelectorAll('[data-sw]').forEach(n => n.onchange = async () => { setPath(n.dataset.sw, n.checked); await save(); render(); });
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
