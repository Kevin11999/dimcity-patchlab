// core/autosave.js
// Autosave (every N changes or every N minutes), optional separate backup copies, and a
// crash-recovery copy of unsaved work. Settings live in core/settings.js.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;

const A = { changesSinceSave:0, lastRun:Date.now(), running:false, lastAt:null, recoveryTimer:null, hadRecovery:false };
const cfg = () => window.Settings?.get?.() || {};
const M = () => App.getMODEL();

function status(text){
  const el = document.getElementById('statusAutosave');
  if(el) el.innerHTML = text ? `${I('clock', 12)} ${esc(text)}` : '';
}
const hhmm = d => d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

async function run(reason){
  if(A.running) return;
  const s = cfg().autosave || {};
  const m = M();
  if(!m?.ui?.dirty) return;
  A.running = true;
  try {
    let did = [];
    if(s.saveOriginal && m.filePath){
      if(await window.ProjectIO.saveQuietly()) did.push('saved');
    }
    if(s.backup){
      const dir = window.Settings.backupDir();
      if(dir){
        const content = JSON.stringify(window.ProjectIO.buildSnapshot(), null, 2);
        await window.app?.backupWrite?.({ dir, baseName:window.ProjectIO.projectName() || 'Untitled', content, keep:s.keep });
        did.push('backup');
      }
    }
    A.changesSinceSave = 0; A.lastRun = Date.now();
    if(did.length){ A.lastAt = new Date(); status(`Autosaved ${hhmm(A.lastAt)}${did.includes('backup') ? ' + backup' : ''}`); }
  } catch(err){
    App.ui.toast(`Autosave failed: ${err.message || err}`, 'err');
  } finally { A.running = false; }
}

// Elke wijziging (via de geschiedenis) telt mee
window.PatchHistory?.onChange?.(() => {
  A.changesSinceSave++;
  const s = cfg().autosave || {};
  if(s.mode === 'actions' && A.changesSinceSave >= Math.max(1, Number(s.actions) || 20)) run('actions');
  scheduleRecovery();
});
// Tijd: elke 20 s kijken of de ingestelde minuten voorbij zijn
setInterval(() => {
  const s = cfg().autosave || {};
  if(s.mode === 'time' && Date.now() - A.lastRun >= Math.max(1, Number(s.minutes) || 5) * 60000) run('time');
}, 20000);

// Na handmatig of automatisch opslaan
function onSaved(){
  A.changesSinceSave = 0; A.lastRun = Date.now();
  clearTimeout(A.recoveryTimer);
  window.app?.recoveryClear?.();
}

// ---- Herstel na crash ----
function scheduleRecovery(){
  if(!cfg().recovery || !window.app?.recoveryWrite) return;
  clearTimeout(A.recoveryTimer);
  A.recoveryTimer = setTimeout(async () => {
    const m = M();
    if(!m?.ui?.dirty) return;
    try {
      await window.app.recoveryWrite({ content:JSON.stringify(window.ProjectIO.buildSnapshot()), meta:{ filePath:m.filePath || null, name:window.ProjectIO.projectName() || 'Untitled project' } });
      A.hadRecovery = true;
    } catch {}
  }, 2500);
}
async function offerRecovery(){
  const rec = await window.app?.recoveryRead?.();
  if(!rec?.content) return;
  const when = rec.meta?.savedAt ? new Date(rec.meta.savedAt).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' }) : '';
  const ok = await App.ui.confirmDialog({
    title:'Restore unsaved work?',
    message:`PatchLab was closed while “${rec.meta?.name || 'a show'}” had unsaved changes${when ? ` (${when})` : ''}.\n\nRestore them now? If you choose Discard, the recovery copy is deleted.`,
    okLabel:'Restore', cancelLabel:'Discard'
  });
  if(!ok){ await window.app.recoveryClear(); return; }
  try {
    window.PatchLabUI?.closeWelcome?.();
    await window.ProjectIO.applySnapshot(JSON.parse(rec.content));
    const m = M();
    m.filePath = rec.meta?.filePath || null; m.projectPath = m.filePath;
    window.PatchHistory?.reset?.();
    m.ui.dirty = true;
    App.renderAll?.(); App.navigate?.('HOME');
    App.ui.toast(m.filePath ? 'Unsaved work restored — save to keep it' : 'Unsaved work restored — use Save As to keep it', 'ok', { ms:7000 });
  } catch(err){
    App.ui.toast(`Could not restore: ${err.message || err}`, 'err');
  }
}

window.Autosave = { run, onSaved, offerRecovery };
(window.Settings?.ready || Promise.resolve()).then(() => setTimeout(offerRecovery, 900));
