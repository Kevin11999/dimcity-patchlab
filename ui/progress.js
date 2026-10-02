// ui/progress.js
// Small progress bar bottom-left: how complete is this show? Every check is a step; click the bar
// for the checklist with what is still missing and a jump to the right place.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;
const M = () => App.getMODEL();
const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
const t = (en, nl) => (lang() === 'nl' ? nl : en);

// Elke stap: { id, label, done, detail, go } — `go` springt naar de plek waar je het oplost
function compute(){
  const m = M(); if(!m) return { steps:[], done:0, total:0, pct:0 };
  const meta = m.projectMeta || {};
  const dims = App.sortedDims?.() || [];
  const lines = (m.lines || []).length + (m.veamLines || []).length + (m.dmxLoose || []).length;
  const issues = m.issues || [];
  const errs = issues.filter(i => i.severity === 'RED').length, warns = issues.length - errs;
  const incomplete = [...(m.lines || []), ...(m.veamLines || []), ...(m.dmxLoose || [])].filter(L => L.status === 'YELLOW' || L.universe == null || L.universe === '').length;
  const veams = [...(m.byVeam?.values?.() || [])];
  const E = window.RackEngine;
  const rackDims = dims.map(dc => ({ dc, has:E?.hasRackPlan?.(m, dc), plan:E?.hasRackPlan?.(m, dc) ? E.computeRackPlan(m, dc) : null }));
  // een Veam is in orde als hij aan een LK gekoppeld is, óf als losse Veam op een Veam4-aansluiting zit
  const onSocket = new Set(rackDims.flatMap(r => r.plan ? [...r.plan.groups.flatMap(g => g.vims), ...r.plan.soloVims].filter(v => v.used).map(v => v.used.id) : []));
  const unlinked = veams.filter(v => !(m.veamUse?.get(v.id) || []).length && !onSocket.has(v.id));
  const rackMissing = rackDims.filter(r => !r.has).map(r => r.dc);
  const rackWarn = rackDims.filter(r => r.plan?.recs.some(x => x.level === 'warn')).map(r => r.dc);
  const netMissing = dims.filter(dc => !(m.networkDevices?.dimCityPlans?.[dc]?.nodes || []).length);
  const pdf = !!m.pdfSettings?.layout;
  const saved = !!m.filePath && !m.ui?.dirty;
  const open = (kind, id) => () => App.openEntity(kind, id);
  const steps = [
    { id:'info', label:t('Project info', 'Projectinfo'), done:!!(meta.project && meta.area && meta.location && meta.date && meta.prepared),
      detail:meta.project ? t('Fill in area, location, date and prepared by', 'Vul gebied, locatie, datum en opgesteld door in') : t('Give the project a name', 'Geef het project een naam'), go:() => App.runCommand('projectInfo') },
    { id:'patch', label:t('Patch imported', 'Patch geïmporteerd'), done:lines > 0,
      detail:t('Import a CSV or add LKs and Veams', 'Importeer een CSV of voeg LK’s en Veams toe'), go:() => App.runCommand('importCsv') },
    { id:'errors', label:t('No errors', 'Geen fouten'), done:lines > 0 && errs === 0,
      detail:errs ? `${errs} ${t(errs === 1 ? 'error' : 'errors', errs === 1 ? 'fout' : 'fouten')}` : '', go:() => App.navigate('ISSUES') },
    { id:'complete', label:t('Rows complete', 'Regels compleet'), done:lines > 0 && incomplete === 0,
      detail:incomplete ? `${incomplete} ${t('rows without universe or location', 'regels zonder universe of locatie')}${warns ? ` · ${warns} ${t('warnings', 'waarschuwingen')}` : ''}` : (warns ? `${warns} ${t('warnings', 'waarschuwingen')}` : ''), go:() => App.navigate('TABLE') },
    { id:'veams', label:t('Veams linked', 'Veams gekoppeld'), done:veams.length > 0 && unlinked.length === 0, skip:!veams.length,
      detail:unlinked.length ? `${unlinked.slice(0, 5).map(v => v.id).join(', ')}${unlinked.length > 5 ? '…' : ''} ${t('not linked to an LK and not on a Veam4 socket', 'niet aan een LK gekoppeld en niet op een Veam4-aansluiting')}` : '', go:unlinked[0] ? open('VEAM', unlinked[0].id) : null },
    { id:'racks', label:t('Racks patched', 'Racks gepatcht'), done:dims.length > 0 && !rackMissing.length && !rackWarn.length, skip:!dims.length,
      detail:rackMissing.length ? `${t('No rack or loose node in', 'Geen rek of losse node in')} ${rackMissing.join(', ')}` : rackWarn.length ? `${t('Check the recommendations in', 'Bekijk de adviezen in')} ${rackWarn.join(', ')}` : '', go:(rackMissing[0] || rackWarn[0]) ? open('DIM', rackMissing[0] || rackWarn[0]) : null },
    { id:'network', label:t('Network plan', 'Netwerkplan'), done:dims.length > 0 && !netMissing.length, skip:!dims.length,
      detail:netMissing.length ? `${t('No nodes planned in', 'Geen nodes gepland in')} ${netMissing.join(', ')} — ${t('use the rack patch as network plan', 'gebruik de rack-patch als netwerkplan')}` : '', go:netMissing[0] ? open('DIM', netMissing[0]) : () => App.navigate('NETWORK') },
    { id:'pdf', label:t('PDF layout', 'PDF-indeling'), done:pdf, detail:t('Open the Report Builder once and choose your sections', 'Open de Rapportbouwer één keer en kies je secties'), go:() => App.runCommand('exportPdf') },
    { id:'saved', label:t('Saved', 'Opgeslagen'), done:saved, detail:m.filePath ? t('Unsaved changes', 'Niet-opgeslagen wijzigingen') : t('Not saved to a file yet', 'Nog niet in een bestand opgeslagen'), go:() => App.runCommand('save') }
  ].filter(s => !s.skip);
  const done = steps.filter(s => s.done).length;
  return { steps, done, total:steps.length, pct:steps.length ? Math.round(done / steps.length * 100) : 0 };
}

let last = '', lastModel = null, lastSig = '';
// goedkope vingerafdruk: alleen doorrekenen als het model, de dirty-vlag, het bestand, de taal of een wijziging veranderd is
function fingerprint(){
  const m = M();
  return `${m === lastModel ? 1 : 0}|${m?.ui?.dirty ? 1 : 0}|${m?.filePath || ''}|${lang()}|${window.PatchHistory?.changeCount ?? ''}|${m?.lines?.length}|${m?.issues?.length}|${!!m?.pdfSettings?.layout}`;
}
function refresh(force=false){
  const el = document.getElementById('statusProgress'); if(!el) return;
  const sigNow = fingerprint();
  if(!force && sigNow === lastSig) return;
  lastSig = sigNow; lastModel = M();
  const p = compute();
  const sig = `${p.done}/${p.total}|${lang()}`;
  if(sig === last) return;
  last = sig;
  const cls = p.pct === 100 ? 'ok' : p.pct >= 60 ? 'mid' : '';
  el.innerHTML = `<span class="pbar ${cls}" title="${esc(t('Show progress — click for the checklist', 'Voortgang van de show — klik voor de checklist'))}"><i style="width:${p.pct}%"></i></span><b>${p.done}/${p.total}</b>`;
  el.className = `item progress ${cls}`;
}
function openPopover(anchor){
  document.querySelectorAll('.popover-menu').forEach(x => x.remove());
  const p = compute();
  const r = anchor.getBoundingClientRect();
  const m = document.createElement('div');
  m.className = 'popover-menu progress-pop';
  m.setAttribute('data-no-i18n', '');
  m.innerHTML = `<div class="pp-head"><b>${t('Show checklist', 'Checklist van de show')}</b><span>${p.done} ${t('of', 'van')} ${p.total}</span></div>
    ${p.steps.map((s, i) => `<button class="pp-row ${s.done ? 'done' : ''}" data-i="${i}" ${s.done || !s.go ? '' : 'title="' + esc(t('Go there', 'Ga ernaartoe')) + '"'}>${I(s.done ? 'checkCircle' : 'chevronRight', 14)}<span><b>${esc(s.label)}</b>${!s.done && s.detail ? `<em>${esc(s.detail)}</em>` : ''}</span></button>`).join('')}
    ${p.pct === 100 ? `<div class="pp-foot ok">${I('star', 13)} ${t('Everything is set — ready to export.', 'Alles staat — klaar om te exporteren.')}</div>` : ''}`;
  document.body.appendChild(m);
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px`;
  m.style.top = `${Math.max(8, r.top - m.offsetHeight - 6)}px`;
  m.querySelectorAll('.pp-row').forEach(b => b.onclick = () => { const s = p.steps[Number(b.dataset.i)]; m.remove(); if(!s.done && s.go) s.go(); });
  setTimeout(() => { const off = e => { if(!m.contains(e.target)){ m.remove(); document.removeEventListener('mousedown', off, true); } }; document.addEventListener('mousedown', off, true); }, 0);
}

// statusbalk-element (links) en klik
const bar = document.getElementById('statusProgress');
if(bar) bar.onclick = () => openPopover(bar);
window.Progress = { compute, refresh, openPopover };
refresh(true);
window.PatchHistory?.onChange?.(() => refresh());
setInterval(() => refresh(), 1500);
