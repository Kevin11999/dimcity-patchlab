// core/updater.js
// Update check against GitHub Releases (repository set in Settings → Updates). When a newer
// version exists, the user can download the installer for this computer; it is opened from the
// Downloads folder so the user completes the install. Unsigned builds can't self-replace, so
// this is deliberately a guided download rather than a silent update.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;

function newer(a, b){            // is a > b  (1.2.10 > 1.2.9)
  const pa = String(a).split(/[.-]/).map(x => parseInt(x, 10) || 0), pb = String(b).split(/[.-]/).map(x => parseInt(x, 10) || 0);
  for(let i = 0; i < Math.max(pa.length, pb.length); i++){ if((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
// Het juiste installatiebestand voor dit systeem
function pickAsset(info){
  const a = info.assets || [];
  const by = rx => a.filter(x => rx.test(x.name));
  if(info.platform === 'darwin'){
    const dmg = by(/\.dmg$/i);
    return dmg.find(x => info.arch === 'arm64' ? /arm64/i.test(x.name) : !/arm64/i.test(x.name)) || dmg[0] || by(/mac.*\.zip$/i)[0] || null;
  }
  if(info.platform === 'win32') return by(/\.exe$/i).find(x => !/blockmap/i.test(x.name)) || null;
  return by(/\.AppImage$/i)[0] || null;
}
// Release-notities (markdown) eenvoudig en veilig weergeven
function notesHtml(md){
  const lines = String(md || '').split(/\r?\n/).slice(0, 60);
  return lines.map(l => {
    const t = esc(l.trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    if(!t) return '';
    if(/^#{1,6}\s/.test(l.trim())) return `<h4>${t.replace(/^#+\s*/, '')}</h4>`;
    if(/^[-*]\s/.test(l.trim())) return `<li>${t.replace(/^[-*]\s*/, '')}</li>`;
    return `<p>${t}</p>`;
  }).join('');
}

let checking = false;
async function check({ manual=false } = {}){
  if(checking || !window.app?.updateCheck) return;
  const cfg = window.Settings?.get?.().updates || {};
  checking = true;
  let info;
  try { info = await window.app.updateCheck({ repo:cfg.repo, token:cfg.token }); }
  catch(err){ info = { error:err.message || String(err) }; }
  finally { checking = false; }
  if(info?.error){ if(manual) App.ui.toast(`Update check failed: ${info.error}`, 'err', { ms:7000 }); return; }
  if(!info?.latest || !newer(info.latest, info.current)){
    if(manual) App.ui.toast(`You're up to date (version ${info?.current || '?'})`, 'ok');
    return;
  }
  if(!manual && cfg.skipped === info.latest) return;
  const asset = pickAsset(info);
  const d = App.ui.openDialog({
    title:`Version ${esc(info.latest)} is available`,
    subtitle:`You have ${esc(info.current)}${info.publishedAt ? ` · released ${new Date(info.publishedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}` : ''}`,
    width:'580px',
    body:`<div class="update-notes">${notesHtml(info.notes) || '<p class="subtle">No release notes.</p>'}</div>
      ${asset ? `<div class="hint">${I('download', 13)} ${esc(asset.name)} · ${(asset.size / 1048576).toFixed(1)} MB — it is saved in Downloads and opened, then follow the installer. Save your show first.</div>`
        : `<div class="hint">${I('info', 13)} No installer for this computer in this release — open the release page instead.</div>`}`,
    footer:`<button data-a="skip" style="margin-right:auto">Skip this version</button><button data-a="page">${I('arrowRight', 14)}Release page</button><button data-a="later">Later</button>${asset ? `<button class="primary" data-a="get">${I('download', 14)}Download & install</button>` : ''}`
  });
  const on = (a, fn) => { const b = d.footer.querySelector(`[data-a="${a}"]`); if(b) b.onclick = fn; };
  on('later', d.close);
  on('page', () => window.app.openExternal(info.url));
  on('skip', async () => { if(window.Settings){ window.Settings.get().updates.skipped = info.latest; await window.Settings.save(); } d.close(); });
  on('get', async () => {
    const b = d.footer.querySelector('[data-a="get"]');
    b.disabled = true; b.textContent = 'Downloading…';
    try {
      if(App.getMODEL()?.ui?.dirty && App.getMODEL().filePath) await window.ProjectIO?.saveQuietly?.();
      const file = await window.app.updateDownload({ asset, token:cfg.token });
      d.close();
      App.ui.toast(`Installer opened: ${file.split(/[\\/]/).pop()} — quit PatchLab and follow the installer`, 'ok', { ms:9000 });
    } catch(err){
      b.disabled = false; b.textContent = 'Download & install';
      App.ui.toast(`Download failed: ${err.message || err}`, 'err');
    }
  });
}

window.Updater = { check, newer, pickAsset };
// Bij het opstarten (stil) controleren
(window.Settings?.ready || Promise.resolve()).then(() => {
  if(window.Settings?.get?.().updates?.checkOnStart) setTimeout(() => check({ manual:false }), 6000);
});
