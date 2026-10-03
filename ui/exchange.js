// ui/exchange.js — exchange the patch with Lightwright and Vectorworks (Spotlight), in both directions, through files.
//
//   Export  → a tab-delimited (Lightwright) or comma-separated (Vectorworks) file with one row per LK / Veam port:
//             Circuit Name (the key, e.g. LK101.4) · Position (the location) · Universe, plus Node / Socket / DB for information.
//   Import  → read such a file (also one that Lightwright or Vectorworks wrote after you changed things there), match every row
//             on its Circuit Name, show exactly what differs (universe, position), and apply only the changes you tick.
//
// This is a file exchange on the standard field names; map the columns in Lightwright / Vectorworks when you import there.
// Nothing here talks to those programs directly.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const clone = x => JSON.parse(JSON.stringify(x));

  const PROFILES = {
    lightwright: { name:'Lightwright', delim:'\t', ext:'txt', key:'Circuit Name', pos:'Position', uni:'Universe',
      how:t('In Lightwright: File ▸ Import ▸ Text file (tab-delimited). Match on “Circuit Name”; bring in Position and Universe.', 'In Lightwright: File ▸ Import ▸ Tekstbestand (tab-gescheiden). Match op “Circuit Name”; neem Position en Universe mee.') },
    vectorworks: { name:'Vectorworks Spotlight', delim:',', ext:'csv', key:'Circuit Name', pos:'Position', uni:'Universe',
      how:t('In Vectorworks: import the CSV into a worksheet / data-exchange mapping on the Light Info Record fields “Circuit Name”, “Position” and “Universe”.', 'In Vectorworks: importeer de CSV in een worksheet / data-exchange mapping op de Light Info Record-velden “Circuit Name”, “Position” en “Universe”.') },
    generic: { name:t('Generic CSV', 'Algemene CSV'), delim:',', ext:'csv', key:'Circuit Name', pos:'Position', uni:'Universe', how:t('Any program that reads CSV.', 'Elk programma dat CSV leest.') }
  };
  const ALIAS = {
    key: ['circuit name', 'circuitname', 'circuit', 'patch point', 'patchpoint', 'lk port', 'port id', 'patchlab id', 'id', 'cable'],
    pos: ['position', 'location', 'destination', 'dest', 'purpose', 'plaats', 'locatie'],
    uni: ['universe', 'uni', 'dmx universe', 'universum']
  };

  // ---- the patch as rows ----
  function rows(dcs){
    const m = M(), E = window.RackEngine, out = [];
    const plans = new Map();
    const plan = dc => { if(!plans.has(dc)) { try { plans.set(dc, E.computeRackPlan(m, dc)); } catch { plans.set(dc, null); } } return plans.get(dc); };
    const push = (kind, L) => {
      if(dcs && !dcs.includes(L.dimcity)) return;
      const P = plan(L.dimcity), line = P?.lines.find(l => l.owner === L.id && String(l.port) === String(L.port));
      out.push({ kind, id:L.id, port:L.port, key:`${L.id}.${L.port}`, dest:L.dest || '', universe:L.universe ?? '', dc:L.dimcity, socket:line?.socket || '', node:line?.feed?.node || '', nodePort:line?.feed?.port || '' });
    };
    for(const L of (m.lines || [])) push('LK', L);
    for(const V of (m.veamLines || [])) push('Veam', V);
    return out.sort((a, b) => a.dc.localeCompare(b.dc, undefined, { numeric:true }) || a.id.localeCompare(b.id, undefined, { numeric:true }) || (a.port - b.port));
  }
  const cell = (v, delim) => { const s = String(v ?? ''); return (s.includes(delim) || /["\n\r]/.test(s)) ? `"${s.replace(/"/g, '""')}"` : s; };
  function build(profileId, dcs){
    const P = PROFILES[profileId] || PROFILES.generic, d = P.delim;
    const head = [P.key, P.pos, P.uni, 'DB', 'Socket', 'Node', 'Node Port'];
    const body = rows(dcs).map(r => [r.key, r.dest, r.universe, r.dc, r.socket, r.node, r.nodePort].map(v => cell(v, d)).join(d));
    return '﻿' + [head.map(v => cell(v, d)).join(d), ...body].join('\r\n') + '\r\n';
  }

  // ---- reading a file ----
  const norm = s => String(s ?? '').trim().toLowerCase().replace(/[_]+/g, ' ');
  function parseKey(raw){
    const s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    const m = /^(LK|VEAM|V)\s*0*(\d+)\s*[.\-_/: ]\s*(\d+)$/.exec(s) || /^(LK|VEAM|V)\s*0*(\d+)\s*P(?:ORT)?\s*(\d+)$/.exec(s);
    if(!m) return null;
    return { id:`${m[1] === 'LK' ? 'LK' : 'V'}${m[2]}`, port:Number(m[3]) };
  }
  const parseUni = raw => { const s = String(raw ?? '').trim(); if(!s) return null; const m = /^[Uu]?(?:niverse)?\s*(\d+)\s*(?:[\/:.-].*)?$/.exec(s); return m ? Number(m[1]) : null; };
  function readTable(text){
    const P = window.Papa; if(!P) throw new Error('CSV reader missing');
    const r = P.parse(String(text).replace(/^﻿/, ''), { skipEmptyLines:true });
    return r.data.filter(a => a.some(c => String(c).trim() !== ''));
  }
  function detect(table){
    const head = (table[0] || []).map(norm), idx = {};
    for(const [k, al] of Object.entries(ALIAS)) idx[k] = head.findIndex(h => al.includes(h));
    return { head:table[0] || [], idx };
  }
  // compare with the patch → list of differences
  function diff(table, map){
    const m = M(), res = { changes:[], news:[], same:0, unknown:0, missing:0 };
    const seen = new Set();
    for(const r of table.slice(1)){
      const k = parseKey(r[map.key]); if(!k){ res.unknown++; continue; }
      const ours = (k.id.startsWith('LK') ? m.lines : m.veamLines || []).find(L => String(L.id).toUpperCase().replace(/\s+/g, '') === k.id && Number(L.port) === k.port);
      const uni = map.uni >= 0 ? parseUni(r[map.uni]) : null, pos = map.pos >= 0 ? String(r[map.pos] ?? '').trim() : '';
      if(!ours){ if(uni != null || pos) res.news.push({ ...k, key:`${k.id}.${k.port}`, universe:uni, dest:pos }); continue; }
      seen.add(`${ours.id}.${ours.port}`);
      let any = false;
      if(uni != null && Number(ours.universe) !== uni){ res.changes.push({ key:`${ours.id}.${ours.port}`, line:ours, kind:k.id.startsWith('LK') ? 'LK' : 'Veam', field:'universe', ours:ours.universe ?? '', theirs:uni }); any = true; }
      if(pos && pos !== String(ours.dest || '').trim()){ res.changes.push({ key:`${ours.id}.${ours.port}`, line:ours, kind:k.id.startsWith('LK') ? 'LK' : 'Veam', field:'dest', ours:ours.dest || '', theirs:pos }); any = true; }
      if(!any) res.same++;
    }
    const all = [...(m.lines || []), ...(m.veamLines || [])];
    res.missing = all.filter(L => !seen.has(`${L.id}.${L.port}`) && (L.universe != null || L.dest)).length;
    return res;
  }
  // write the accepted changes into the rows they came from, then rebuild
  async function apply(changes, news){
    const m = M(); let n = 0;
    const same = (a, b) => String(a ?? '').trim().toUpperCase().replace(/\s+/g, '') === String(b ?? '').trim().toUpperCase().replace(/\s+/g, '');
    for(const c of changes){
      const L = c.line, src = (m.csvSources || []).find(s => s.id === L.sourceId);
      const row = src?.rows.find(r => same(r[0], L.id) && String(r[1]).trim() === String(L.port));
      if(row){ if(c.field === 'universe') row[2] = String(c.theirs); else row[3] = c.theirs; n++; continue; }
      const cu = (m.customRows || []).find(r => same(r.id, L.id) && String(r.port) === String(L.port));
      if(cu){ if(c.field === 'universe') cu.universe = c.theirs; else cu.dest = c.theirs; n++; }
    }
    for(const a of news){ (m.customRows ||= []).push({ kind:a.id.startsWith('LK') ? 'LK' : 'VEAM', id:a.id, port:a.port, universe:a.universe, dest:a.dest || '' }); n++; }
    const saved = clone(m.customRows || []);
    await App.rebuildFromCsvSources();
    const M2 = App.getMODEL(); M2.customRows = saved; M2.ui.dirty = true; App.setMODEL?.(M2);
    App.recomputeVeamUseAndIssues?.(); App.recomputeUniverseStats?.(); App.hydrateDimOrigins?.(); App.renderAll?.();
    return n;
  }

  // ---- files ----
  async function saveText(name, content, ext){
    if(window.app?.showSaveDialog && window.app?.writeTextFile){
      const r = await window.app.showSaveDialog({ defaultPath:name, filters:[{ name:ext.toUpperCase(), extensions:[ext] }] });
      const path = r?.filePath || (typeof r === 'string' ? r : null); if(!path || r?.canceled) return false;
      await window.app.writeTextFile({ filePath:path, content }); return path;
    }
    const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(new Blob([content], { type:'text/plain' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return name;
  }
  async function openText(){
    if(window.app?.showOpenDialog && window.app?.readTextFile){
      const r = await window.app.showOpenDialog({ properties:['openFile'], filters:[{ name:'Text / CSV', extensions:['txt', 'csv', 'tsv'] }] });
      const path = r?.filePaths?.[0]; if(!path || r?.canceled) return null;
      return { name:path.split(/[\\/]/).pop(), text:await window.app.readTextFile(path) };
    }
    return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.txt,.csv,.tsv'; i.onchange = () => { const f = i.files?.[0]; if(!f) return res(null); const rd = new FileReader(); rd.onload = () => res({ name:f.name, text:rd.result }); rd.readAsText(f); }; i.click(); });
  }

  // ---- UI ----
  function open(){
    const dims = App.sortedDims();
    const d = App.ui.openDialog({ title:t('Exchange with Lightwright / Vectorworks', 'Uitwisselen met Lightwright / Vectorworks'), subtitle:t('Both ways, through a file. Nothing changes until you tick it and apply.', 'Beide kanten op, via een bestand. Er verandert niets tot je het aanvinkt en toepast.'), width:'900px', body:'', footer:`<button class="primary" data-a="done">${t('Close', 'Sluiten')}</button>` });
    d.footer.querySelector('[data-a=done]').onclick = () => d.close();
    const st = { profile:'lightwright', dcs:null, file:null, table:null, map:null, res:null, on:new Set(), addNew:false };
    const view = () => {
      const P = PROFILES[st.profile];
      const prof = `<div class="segmented" id="exProf">${Object.entries(PROFILES).map(([k, p]) => `<button data-p="${k}" class="${st.profile === k ? 'active' : ''}">${esc(p.name)}</button>`).join('')}</div>`;
      const exp = `<div class="ex-box"><h4>${I('download', 15)} ${t('Send to the other program', 'Naar het andere programma sturen')}</h4>
        <p class="subtle">${t('One row per LK / Veam port: Circuit Name (the key), Position, Universe — plus DB, socket and node for information.', 'Eén regel per LK-/Veam-poort: Circuit Name (de sleutel), Position, Universe — plus DB, aansluiting en node ter informatie.')}</p>
        <div class="ex-row"><label>${t('DBs', 'DB\'s')}<select id="exDcs"><option value="">${t('All', 'Alle')}</option>${dims.map(x => `<option value="${esc(x)}" ${st.dcs && st.dcs[0] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label><button class="primary" id="exSave">${I('download', 14)}${t('Export file…', 'Bestand exporteren…')}</button></div>
        <div class="hint">${I('info', 13)} ${esc(P.how)}</div></div>`;
      let imp = `<div class="ex-box"><h4>${I('upload', 15)} ${t('Take changes from the other program', 'Wijzigingen overnemen uit het andere programma')}</h4>
        <p class="subtle">${t('Choose the file you exported from Lightwright / Vectorworks. PatchLab matches every row on its Circuit Name and shows what differs.', 'Kies het bestand dat je uit Lightwright / Vectorworks exporteerde. PatchLab matcht elke regel op de Circuit Name en toont wat verschilt.')}</p>
        <div class="ex-row"><button id="exOpen">${I('upload', 14)}${t('Choose file…', 'Bestand kiezen…')}</button><span class="subtle">${esc(st.file || '')}</span></div>`;
      if(st.table){
        const heads = st.table[0].map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('');
        const sel = (k, label) => `<label>${label}<select data-map="${k}"><option value="-1">—</option>${st.table[0].map((h, i) => `<option value="${i}" ${st.map[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`;
        imp += `<div class="ex-row ex-map">${sel('key', 'Circuit Name')}${sel('pos', 'Position')}${sel('uni', 'Universe')}</div>`;
        if(st.map.key < 0) imp += `<div class="su-warn">${I('alert', 13)} ${t('No column with the Circuit Name found — choose it above.', 'Geen kolom met de Circuit Name gevonden — kies hem hierboven.')}</div>`;
        else if(st.res){
          const r = st.res;
          imp += `<div class="ex-sum"><span class="tag green">${r.same} ${t('identical', 'gelijk')}</span><span class="tag yellow">${r.changes.length} ${t('differences', 'verschillen')}</span><span class="tag">${r.news.length} ${t('only in the file', 'alleen in het bestand')}</span><span class="tag">${r.missing} ${t('only in PatchLab', 'alleen in PatchLab')}</span>${r.unknown ? `<span class="tag red">${r.unknown} ${t('rows not understood', 'regels niet begrepen')}</span>` : ''}</div>`;
          imp += r.changes.length ? `<div class="table-wrap" style="max-height:260px;overflow:auto"><table class="data-table"><thead><tr><th></th><th>${t('Port', 'Poort')}</th><th>${t('Field', 'Veld')}</th><th>PatchLab</th><th>${t('File', 'Bestand')}</th></tr></thead><tbody>${r.changes.map((c, i) => `<tr><td><input type="checkbox" data-c="${i}" ${st.on.has(i) ? 'checked' : ''}></td><td><b>${esc(c.key)}</b></td><td>${c.field === 'universe' ? 'Universe' : 'Position'}</td><td>${esc(c.ours)}</td><td><b>${esc(c.theirs)}</b></td></tr>`).join('')}</tbody></table></div>` : `<div class="subtle" style="margin:8px 0">${t('No differences — both sides agree.', 'Geen verschillen — beide kanten komen overeen.')}</div>`;
          if(r.news.length) imp += `<label class="rp-inline" style="margin-top:8px"><input type="checkbox" id="exNew" ${st.addNew ? 'checked' : ''}> ${t(`Also add the ${r.news.length} lines that only exist in the file`, `Voeg ook de ${r.news.length} regels toe die alleen in het bestand staan`)}</label>`;
          imp += `<div class="ex-row" style="margin-top:10px"><button id="exAll">${t('Select all', 'Alles aanvinken')}</button><button id="exNone">${t('Select none', 'Niets aanvinken')}</button><span style="flex:1"></span><button class="primary" id="exApply" ${(st.on.size || (st.addNew && r.news.length)) ? '' : 'disabled'}>${t('Apply', 'Toepassen')} ${st.on.size + (st.addNew ? r.news.length : 0)}</button></div>`;
        }
      }
      imp += '</div>';
      d.body.innerHTML = `<div class="ex">${prof}${exp}${imp}</div>`;
      d.body.querySelectorAll('#exProf button').forEach(b => b.onclick = () => { st.profile = b.dataset.p; view(); });
      d.body.querySelector('#exDcs').onchange = e => { st.dcs = e.target.value ? [e.target.value] : null; };
      d.body.querySelector('#exSave').onclick = async () => {
        const p = PROFILES[st.profile], text = build(st.profile, st.dcs), name = `${(M().projectMeta?.project || 'PatchLab').replace(/[^\w\-]+/g, '_')}-${st.profile}.${p.ext}`;
        const ok = await saveText(name, text, p.ext); if(ok) App.ui.toast(`${t('Exported', 'Geëxporteerd')}: ${rows(st.dcs).length} ${t('rows', 'regels')}`);
      };
      d.body.querySelector('#exOpen').onclick = async () => {
        const f = await openText(); if(!f) return;
        try { st.table = readTable(f.text); } catch(e) { App.ui.toast(String(e.message || e), 'err'); return; }
        st.file = f.name; const det = detect(st.table); st.map = { key:det.idx.key, pos:det.idx.pos, uni:det.idx.uni };
        st.res = st.map.key >= 0 ? diff(st.table, st.map) : null; st.on = new Set((st.res?.changes || []).map((_, i) => i)); view();
      };
      d.body.querySelectorAll('[data-map]').forEach(s => s.onchange = () => { st.map[s.dataset.map] = Number(s.value); st.res = st.map.key >= 0 ? diff(st.table, st.map) : null; st.on = new Set((st.res?.changes || []).map((_, i) => i)); view(); });
      d.body.querySelectorAll('[data-c]').forEach(c => c.onchange = () => { c.checked ? st.on.add(Number(c.dataset.c)) : st.on.delete(Number(c.dataset.c)); view(); });
      const all = d.body.querySelector('#exAll'); if(all) all.onclick = () => { st.on = new Set(st.res.changes.map((_, i) => i)); view(); };
      const none = d.body.querySelector('#exNone'); if(none) none.onclick = () => { st.on = new Set(); view(); };
      const nw = d.body.querySelector('#exNew'); if(nw) nw.onchange = () => { st.addNew = nw.checked; view(); };
      const ap = d.body.querySelector('#exApply'); if(ap) ap.onclick = async () => {
        window.PatchHistory?.label?.(t('Changes taken over from Lightwright / Vectorworks', 'Wijzigingen overgenomen uit Lightwright / Vectorworks'));
        const n = await apply(st.res.changes.filter((_, i) => st.on.has(i)), st.addNew ? st.res.news : []);
        App.ui.toast(`${n} ${t('changes applied', 'wijzigingen toegepast')}`); st.res = diff(st.table, st.map); st.on = new Set(); st.addNew = false; view();
      };
    };
    view();
  }
  window.Exchange = { open, build, rows, parseKey, parseUni, readTable, detect, diff, apply, PROFILES };
})();
