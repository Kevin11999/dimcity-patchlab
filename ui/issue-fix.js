// ui/issue-fix.js
// Validation: jump to the problem and fix it in place (wrong port, unknown ID, universe
// conflicts, Veam links, block types). Every fix is recorded in the change history.
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;
const M = () => App.getMODEL();

const BLOCK_FIX_CODES = ['XLR12_VEAM_IGNORED', 'BLOCKTYPE_XLR_CONFLICT'];
function canFix(it){
  if(!it) return false;
  if(it.fix?.type === 'row' || it.fix?.type === 'conflict') return true;
  return ['VEAM_DUPLICATE', 'VEAM_MISSING', ...BLOCK_FIX_CODES].includes(it.code);
}

// ---- Naar het probleem toe ----
function go(it){
  if(!it) return;
  const ref = it.ref;
  if(!ref?.kind || !ref?.id){ if(canFix(it)) open(it); return; }
  App.openEntity(ref.kind, ref.id);
  requestAnimationFrame(() => {
    const root = document.getElementById('lkDetail');
    const cell = it.port != null ? root?.querySelector(`.lk-port-cell[data-port="${it.port}"]`) : null;
    // bestaat de poort niet (bijv. Veam poort 6), dan de melding zelf markeren
    const target = cell || [...(root?.querySelectorAll('li[data-issue]') || [])].find(li => M().issues[Number(li.dataset.issue)] === it);
    if(!target) return;
    target.scrollIntoView({ block:'center', behavior:'smooth' });
    target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
  });
}

// ---- Opnieuw verwerken met behoud van scherm ----
async function reprocess(rows, label, { customUpdate } = {}){
  const m0 = M();
  const keep = { selected:m0.selected, rightMode:m0.ui.rightMode, view:m0.ui.view };
  window.PatchHistory?.label?.(label);
  const custom = customUpdate ? customUpdate(structuredClone(m0.customRows || [])) : m0.customRows;
  await App.processRows(rows);
  const m = M();
  m.customRows = custom;
  const exists = keep.selected?.kind === 'LK' ? m.byLK.has(keep.selected.id) : keep.selected?.kind === 'VEAM' ? m.byVeam.has(keep.selected.id) : keep.selected?.kind === 'DIM' ? m.byDim.has(keep.selected.id) : false;
  m.ui.view = keep.view;
  if(exists){ m.selected = keep.selected; m.ui.rightMode = keep.rightMode; }
  m.ui.dirty = true;
  App.renderAll();
  App.ui.toast(label);
}
function mutate(label, fn){
  window.PatchHistory?.label?.(label);
  fn();
  App.recomputeVeamUseAndIssues();
  M().ui.dirty = true;
  App.renderAll();
  App.ui.toast(label);
}

// ---- Dialogen ----
function open(it){
  if(!it) return;
  if(it.fix?.type === 'row') return fixRow(it);
  if(it.fix?.type === 'conflict') return fixConflict(it);
  if(it.code === 'VEAM_DUPLICATE') return fixVeamDuplicate(it);
  if(it.code === 'VEAM_MISSING') return fixVeamMissing(it);
  if(BLOCK_FIX_CODES.includes(it.code)) return fixBlockType(it);
}
const issueBanner = it => `<div class="fix-issue ${it.severity === 'RED' ? 'RED' : 'YELLOW'}">${I('alert', 14)}<span>${esc(it.message)}</span></div>`;

// Ongeldige rij (verkeerde poort, onbekend ID, losse DMX zonder DimCity, te weinig velden)
function fixRow(it){
  const m = M();
  const idx = it.fix.index;
  const r = (m.invalidRows || [])[idx];
  if(!r) return;
  const orig = { id:String(r[0] ?? '').trim(), port:String(r[1] ?? '').trim(), uni:String(r[2] ?? '').trim(), dest:String(r[3] ?? ''), dim:String(r[5] ?? '').trim().toUpperCase() };
  const isDmx = !orig.id && it.code === 'DMX_DIMCITY_REQ';
  const dims = App.sortedDims();
  const d = App.ui.openDialog({
    title:'Fix patch row', subtitle:`From ${esc(r[7] || 'CSV')}. The change is kept in History, so you can always undo it.`,
    width:'560px',
    body:`${issueBanner(it)}
      <div class="form-grid" style="margin-top:14px">
        ${isDmx ? `<label class="field span-2">DimCity<select id="fxDim"><option value="">Choose…</option>${dims.map(dc => `<option ${dc === orig.dim ? 'selected' : ''}>${esc(dc)}</option>`).join('')}</select></label>`
          : `<label class="field">LK / Veam<input type="text" id="fxId" value="${esc(orig.id)}" placeholder="LK101 or V101"></label>
             <label class="field">Port<select id="fxPort"></select></label>`}
        <label class="field">Universe<input type="number" id="fxUni" min="0" value="${esc(orig.uni)}"></label>
        <label class="field">Location<input type="text" id="fxDest" value="${esc(orig.dest)}"></label>
      </div>
      <div class="fix-hint" id="fxHint"></div>
      <div class="fix-before"><span>Before</span><code>${esc([orig.id || '(loose DMX)', orig.port && `port ${orig.port}`, orig.uni && `U${orig.uni}`, orig.dest].filter(Boolean).join(' · '))}</code></div>`,
    footer:`<button class="danger" data-a="del" style="margin-right:auto">${I('trash', 14)}Delete row</button><button data-a="cancel">Cancel</button><button class="primary" data-a="ok">${I('check', 14)}Apply fix</button>`
  });
  const $ = s => d.body.querySelector(s);
  const ok = d.footer.querySelector('[data-a=ok]');
  // poortkeuze met bezetting van de gekozen LK/Veam
  const fillPorts = () => {
    if(isDmx) return;
    const id = $('#fxId').value.trim().toUpperCase();
    const isV = App.isV(id), isL = App.isLK(id);
    const max = isV ? 4 : 12;
    const lines = isV ? (m.byVeam.get(id)?.lines || []) : isL ? (m.byLK.get(id.replace(/^VEAM12/, 'LK'))?.lines || []) : [];
    const cur = $('#fxPort').value || orig.port;
    let opts = '';
    for(let p = 1; p <= max; p++){
      const used = lines.find(L => Number(L.port) === p);
      opts += `<option value="${p}">${p}${used ? ` — in use: ${used.universe != null ? `U${used.universe}` : ''} ${used.dest || ''}` : ' — free'}</option>`;
    }
    $('#fxPort').innerHTML = opts;
    const firstFree = [...Array(max)].map((_, i) => i + 1).find(p => !lines.some(L => Number(L.port) === p));
    $('#fxPort').value = App.portRangeOk(id, Number(cur)) ? cur : String(firstFree || 1);
  };
  const check = () => {
    let msg = '', bad = false;
    if(isDmx){ bad = !$('#fxDim').value; msg = bad ? 'Choose the DimCity this DMX line belongs to.' : ''; }
    else {
      const id = $('#fxId').value.trim().toUpperCase();
      if(!App.dimCityFromId(id)){ bad = true; msg = 'Use an ID like LK101, VEAM12101 or V101.'; }
      else {
        const p = Number($('#fxPort').value);
        const lines = App.isV(id) ? (m.byVeam.get(id)?.lines || []) : (m.byLK.get(id.replace(/^VEAM12/, 'LK'))?.lines || []);
        const used = lines.find(L => Number(L.port) === p);
        if(used){
          const sameUni = String(used.universe ?? '') === $('#fxUni').value.trim();
          msg = sameUni ? `Port ${p} already has U${used.universe} — the rows are merged.` : `Port ${p} already has ${used.universe != null ? `U${used.universe}` : 'data'} — this creates a universe conflict.`;
        } else msg = `${id} port ${p} is free.`;
      }
    }
    $('#fxHint').innerHTML = msg ? `${I(bad ? 'alert' : 'info', 13)} ${esc(msg)}` : '';
    $('#fxHint').classList.toggle('bad', bad);
    ok.disabled = bad;
  };
  if(!isDmx){ fillPorts(); $('#fxId').addEventListener('input', () => { fillPorts(); check(); }); $('#fxPort').onchange = check; }
  else $('#fxDim').onchange = check;
  $('#fxUni').addEventListener('input', check);
  check();

  const isCustom = (r[7] ?? '') === 'Custom';
  const sameCustom = c => String(c.id || '') === orig.id && String(c.port ?? '') === orig.port && String(c.dest || '') === orig.dest;
  d.footer.querySelector('[data-a=cancel]').onclick = d.close;
  d.footer.querySelector('[data-a=del]').onclick = async () => {
    d.close();
    const inv = m.invalidRows.filter((_, i) => i !== idx);
    await reprocess(App.currentRows({ ...m, invalidRows:inv }), `Deleted invalid row ${orig.id || 'loose DMX'}${orig.port ? ` port ${orig.port}` : ''}`,
      isCustom ? { customUpdate:list => list.filter(c => !sameCustom(c)) } : {});
  };
  ok.onclick = async () => {
    const id = isDmx ? '' : $('#fxId').value.trim().toUpperCase();
    const port = isDmx ? '' : $('#fxPort').value;
    const uni = $('#fxUni').value.trim(), dest = $('#fxDest').value;
    const dim = isDmx ? $('#fxDim').value : '';
    d.close();
    const inv = m.invalidRows.slice();
    inv[idx] = [id, port, uni, dest, '', dim, r[6] ?? null, r[7] ?? null];
    const label = isDmx ? `Fixed loose DMX line → ${dim}`
      : `Fixed ${orig.id || '?'}${orig.port ? ` port ${orig.port}` : ''} → ${id} port ${port}`;
    await reprocess(App.currentRows({ ...m, invalidRows:inv }), label,
      isCustom ? { customUpdate:list => list.map(c => sameCustom(c) ? { ...c, id, port:port === '' ? null : Number(port), universe:uni === '' ? null : Number(uni), dest, dimcity:dim || c.dimcity } : c) } : {});
  };
}

// Dezelfde poort twee keer met verschillende universes
function fixConflict(it){
  const { id, port, options } = it.fix;
  const d = App.ui.openDialog({
    title:`Choose the universe for ${esc(id)} port ${esc(port)}`, width:'520px',
    body:`${issueBanner(it)}<div class="fix-options">${options.map((o, i) => `<label class="fix-option"><input type="radio" name="fxOpt" value="${i}" ${i === 0 ? 'checked' : ''}><b>U${esc(o.universe ?? '–')}</b><span>${esc(o.dest || 'no location')}</span><em>${esc(o.source || '')}</em></label>`).join('')}</div>`,
    footer:`<button data-a="cancel">Cancel</button><button class="primary" data-a="ok">${I('check', 14)}Keep this one</button>`
  });
  d.footer.querySelector('[data-a=cancel]').onclick = d.close;
  d.footer.querySelector('[data-a=ok]').onclick = async () => {
    const o = options[Number(d.body.querySelector('input[name=fxOpt]:checked').value)];
    d.close();
    const rows = App.currentRows().map(r => String(r[0]) === String(id) && String(r[1]) === String(port) ? [r[0], r[1], o.universe ?? '', o.dest || '', ...r.slice(4)] : r);
    await reprocess(rows, `Fixed ${id} port ${port}: kept U${o.universe ?? '–'}`);
  };
}

// Veam aan meer dan één LK-slot gekoppeld
function fixVeamDuplicate(it){
  const vid = it.message.match(/Veam (\S+)/)?.[1] || it.ref?.id;
  const uses = M().veamUse.get(vid) || [];
  const slotName = s => ({ 1:'Veam A (ports 1–4)', 2:'Veam B (ports 5–8)', 3:'Veam C (ports 9–12)' }[s] || `slot ${s}`);
  const d = App.ui.openDialog({
    title:`Which LK keeps ${esc(vid)}?`, subtitle:'A Veam can only be connected to one LK slot. The other links are removed.', width:'520px',
    body:`${issueBanner(it)}<div class="fix-options">${uses.map((u, i) => `<label class="fix-option"><input type="radio" name="fxOpt" value="${i}" ${i === 0 ? 'checked' : ''}><b>${esc(u.lkId)}</b><span>${slotName(u.slot)}</span></label>`).join('')}</div>`,
    footer:`<button data-a="cancel">Cancel</button><button class="primary" data-a="ok">${I('check', 14)}Keep this link</button>`
  });
  d.footer.querySelector('[data-a=cancel]').onclick = d.close;
  d.footer.querySelector('[data-a=ok]').onclick = () => {
    const keep = uses[Number(d.body.querySelector('input[name=fxOpt]:checked').value)];
    d.close();
    mutate(`Fixed ${vid}: only linked to ${keep.lkId}`, () => {
      for(const u of uses) if(u !== keep){ const lk = M().byLK.get(u.lkId); if(lk) lk.veam[u.slot] = null; }
    });
  };
}
// Gekoppelde Veam bestaat niet meer
function fixVeamMissing(it){
  const lk = M().byLK.get(it.ref?.id); if(!lk) return;
  const missing = [1, 2, 3].filter(s => lk.veam?.[s] && !M().byVeam.has(lk.veam[s]));
  App.ui.confirmDialog({ title:`Remove the link${missing.length > 1 ? 's' : ''}?`, message:`${it.message}\n\nThe link${missing.length > 1 ? 's are' : ' is'} removed from ${lk.id}.`, okLabel:'Remove link' })
    .then(ok => { if(ok) mutate(`Fixed ${lk.id}: removed link to ${missing.map(s => lk.veam[s]).join(', ')}`, () => { missing.forEach(s => lk.veam[s] = null); }); });
}
// Bloktype past niet bij de inhoud
function fixBlockType(it){
  const lk = M().byLK.get(it.ref?.id); if(!lk) return;
  const choices = it.code === 'XLR12_VEAM_IGNORED'
    ? [['unlink', `Remove the Veam links`, 'Keep 12× XLR'], ['MIXED', `Change to ${App.blockTypeLabel('MIXED')}`, 'Keep the Veam links']]
    : [['MIXED', `Change to ${App.blockTypeLabel('MIXED')}`, 'Use the LK ports and the Veams'], ['XLR12', `Change to ${App.blockTypeLabel('XLR12')}`, 'Use all 12 LK ports']];
  const d = App.ui.openDialog({
    title:`Fix ${esc(lk.id)}`, width:'520px',
    body:`${issueBanner(it)}<div class="fix-options">${choices.map(([v, l, h], i) => `<label class="fix-option"><input type="radio" name="fxOpt" value="${v}" ${i === 0 ? 'checked' : ''}><b>${esc(l)}</b><span>${esc(h)}</span></label>`).join('')}</div>`,
    footer:`<button data-a="cancel">Cancel</button><button class="primary" data-a="ok">${I('check', 14)}Apply</button>`
  });
  d.footer.querySelector('[data-a=cancel]').onclick = d.close;
  d.footer.querySelector('[data-a=ok]').onclick = () => {
    const v = d.body.querySelector('input[name=fxOpt]:checked').value;
    d.close();
    if(v === 'unlink') mutate(`Fixed ${lk.id}: removed Veam links`, () => { lk.veam = { 1:null, 2:null, 3:null }; });
    else mutate(`Fixed ${lk.id}: block type → ${App.blockTypeLabel(v)}`, () => App.applyBlockType(lk, v));
  };
}

window.IssueFix = { canFix, open, go };
