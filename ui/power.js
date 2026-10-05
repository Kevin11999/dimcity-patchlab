// ui/power.js — the Power section: PD types, PDs and feeds per DimCity, the Socapex cables from the fixture sheet, the load per
// circuit / phase / PD / feed, and the booklet (PDF). A part of its own: it keeps its data in model.power and talks to the rest of
// the app only through DimCity names. The sums are in core/power.js.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let PW = null, root = null;
  const U = { tab:'overview', dc:null, pd:null, type:null, msg:'' };
  const load = async () => { if(!PW) PW = await import(new URL('./core/power.js', document.baseURI).href); };
  const P = () => { const m = M(); m.power = PW.normalizePower(m.power); return m.power; };
  const dirty = () => { M().ui.dirty = true; };
  const dims = () => App.sortedDims();
  const r1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const phaseCells = (a, max) => a.map(x => `<td class="pw-n ${max && x > max ? 'bad' : max && x / max > 0.8 ? 'warn' : ''}">${r1(x)}</td>`).join('');
  const sel = (id, opts, val, extra = '') => `<select ${id} ${extra}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

  // ---------- the page ----------
  async function render(){
    await load(); root = App.$('#lkDetail'); if(!root || M()?.ui?.view !== 'POWER') return;
    const p = P(), ds = dims(); if(!U.dc || !ds.includes(U.dc)) U.dc = ds[0] || null;
    const R = PW.compute(p, ds), n = p.fixtures.length;
    const sc = App.$('#mainScroll'), top = sc ? sc.scrollTop : 0;
    App.pageHead?.({ eyebrow:t('Power', 'Stroom'), title:t('Power distribution', 'Stroomverdeling'), sub:t('PDs, Socapex cables and feeds: what hangs where, and how many amps each phase pulls.', 'PD’s, Socapex-kabels en voedingen: wat waar hangt en hoeveel ampère elke fase trekt.'),
      actions:`<button id="pwImport">${I('upload', 15)}${t('Import fixture sheet…', 'Armaturenblad importeren…')}</button><button class="primary" id="pwBook" ${p.pds.length ? '' : 'disabled'}>${I('file', 15)}${t('Booklet (PDF)', 'Boekje (PDF)')}</button><input type="file" id="pwFile" accept=".csv,.txt,.tsv" style="display:none">` });
    const tabs = [['overview', t('Overview', 'Overzicht')], ['pds', t('PDs & feeds', 'PD’s & voedingen')], ['types', t('PD types', 'PD-typen')]];
    root.innerHTML = `<div class="stack pw">
      <div class="pw-tabs">${tabs.map(([k, l]) => `<button class="${U.tab === k && !U.pd ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}${U.pd ? `<button class="on">${esc(U.pd)}</button>` : ''}</div>
      ${U.msg ? `<div class="hint">${I('info', 13)} ${esc(U.msg)}</div>` : ''}
      ${U.pd ? pdDetail(p, R) : U.tab === 'types' ? typesTab(p) : U.tab === 'pds' ? pdsTab(p, R, ds) : overview(p, R, ds, n)}
    </div>`;
    if(sc) sc.scrollTop = top;
    bind();
  }

  // ---------- overview ----------
  function warnList(R){
    const w = R.warnings; if(!w.length) return `<div class="subtle">${t('No warnings.', 'Geen waarschuwingen.')}</div>`;
    const rank = { err:0, warn:1, info:2 }, shown = [...w].sort((a, b) => rank[a.level] - rank[b.level]);
    return `<details class="pw-warn" ${shown.some(x => x.level === 'err') ? 'open' : ''}><summary>${w.filter(x => x.level === 'err').length} ${t('errors', 'fouten')} · ${w.filter(x => x.level === 'warn').length} ${t('warnings', 'waarschuwingen')} · ${w.filter(x => x.level === 'info').length} ${t('notes', 'opmerkingen')}</summary>
      ${shown.slice(0, 60).map(x => `<div class="pw-w ${x.level}">${I(x.level === 'info' ? 'info' : 'alert', 13)} ${esc(x.text)}</div>`).join('')}${shown.length > 60 ? `<div class="subtle">… ${shown.length - 60} ${t('more', 'meer')}</div>` : ''}</details>`;
  }
  function overview(p, R, ds, n){
    if(!n && !p.pds.length) return `<div class="nc-empty">${I('plug', 30)}<b>${t('Start with the fixture sheet', 'Begin met het armaturenblad')}</b><span>${t('Import the fixture sheet (CSV from Vectorworks / Lightwright). Its “Circuit Name” column names the Socapex cables (M101 …) and “Circuit Number” the circuit 1–6; the wattage gives the amps. Then add your PDs and feeds.', 'Importeer het armaturenblad (CSV uit Vectorworks / Lightwright). De kolom “Circuit Name” noemt de Socapex-kabels (M101 …) en “Circuit Number” het circuit 1–6; de wattage geeft de ampère. Voeg daarna je PD’s en voedingen toe.')}</span><button class="primary" id="pwImport2">${I('upload', 14)}${t('Import fixture sheet…', 'Armaturenblad importeren…')}</button></div>`;
    const cabN = R.cables.size, tot = [...R.cables.values()].reduce((a, c) => PW.sum3(c.perPhase) + a, 0);
    const head = `<div class="pw-bar"><span><b>${n}</b> ${t('fixtures', 'armaturen')} · <b>${cabN}</b> ${t('Socapex cables', 'Socapex-kabels')} · <b>${p.pds.length}</b> PD · <b>${p.feeds.length}</b> ${t('feeds', 'voedingen')} · <b>${r1(tot)}</b> A ${t('in total on the cables', 'totaal op de kabels')}${p.source ? ` <span class="subtle">· ${esc(p.source.name)}</span>` : ''}</span></div>`;
    const per = ds.map(dc => {
      const feeds = p.feeds.filter(f => f.dc === dc), pds = p.pds.filter(d => d.dc === dc), cabs = [...R.cables.values()].filter(c => PW.dimOfCable(c.name, ds) === dc);
      if(!feeds.length && !pds.length && !cabs.length) return '';
      return `<div class="pw-dc"><h3><i class="dot" style="background:${App.dimColor(dc)}"></i>${esc(dc)} <span class="subtle">${cabs.length} ${t('cables', 'kabels')} · ${r1(cabs.reduce((a, c) => a + PW.sum3(c.perPhase), 0))} A</span></h3>
        ${pds.length ? `<table class="data-table pw-t"><thead><tr><th>PD</th><th>${t('Type', 'Type')}</th><th>${t('Feed', 'Voeding')}</th><th>${t('Cables', 'Kabels')}</th><th>L1</th><th>L2</th><th>L3</th></tr></thead><tbody>${pds.map(d => { const r = R.pds.get(d.id), f = p.feeds.find(x => x.id === d.feedId); return `<tr><td><a href="#" data-pd="${esc(d.id)}">${esc(d.id)}</a></td><td>${esc(r.type?.name || '–')}</td><td>${esc(f?.name || '–')}</td><td>${d.cables.length}</td>${phaseCells(r.perPhase)}</tr>`; }).join('')}</tbody></table>` : `<div class="subtle">${t('No PD yet in this DimCity.', 'Nog geen PD in deze DimCity.')} ${cabs.length ? `<a href="#" data-goto="pds" data-dc="${esc(dc)}">${t('Add PDs', 'PD’s toevoegen')}</a>` : ''}</div>`}
        ${feeds.length ? `<table class="data-table pw-t"><thead><tr><th>${t('Feed', 'Voeding')}</th><th>${t('Type', 'Type')}</th><th>${t('Max', 'Max')} A</th><th>L1</th><th>L2</th><th>L3</th></tr></thead><tbody>${feeds.map(f => { const r = R.feeds.get(f.id); return `<tr><td>${esc(f.name)}${f.upstream ? ` <span class="subtle">↪ ${esc(p.feeds.find(x => x.id === f.upstream)?.name || '')}</span>` : ''}</td><td>${esc(f.kind || '')}</td><td class="pw-n">${f.max || ''}</td>${phaseCells(r.total, f.max)}</tr>`; }).join('')}</tbody></table>` : ''}
      </div>`;
    }).join('');
    return head + `<div class="pw-sec"><h3>${t('Warnings', 'Waarschuwingen')}</h3>${warnList(R)}</div>` + (per || `<div class="subtle">${t('No PDs yet. Add them under “PDs & feeds”.', 'Nog geen PD’s. Voeg ze toe bij “PD’s & voedingen”.')}</div>`);
  }

  // ---------- PDs & feeds ----------
  function pdsTab(p, R, ds){
    const dc = U.dc; if(!dc) return `<div class="subtle">${t('Import the patch first: there are no DimCities yet.', 'Importeer eerst de patch: er zijn nog geen DimCities.')}</div>`;
    const feeds = p.feeds.filter(f => f.dc === dc), pds = p.pds.filter(d => d.dc === dc), cabs = [...R.cables.values()].filter(c => PW.dimOfCable(c.name, ds) === dc).sort((a, b) => a.nn - b.nn);
    const chips = `<div class="rb-chips">${ds.map(d => `<label class="rb-chip ${d === dc ? 'on' : ''}"><input type="radio" name="pwdc" data-dc="${esc(d)}" ${d === dc ? 'checked' : ''}><i class="dot" style="background:${App.dimColor(d)}"></i>${esc(d)}</label>`).join('')}</div>`;
    const feedOpts = [['', t('– no feed –', '– geen voeding –')], ...feeds.map(f => [f.id, f.name])];
    const feedsHtml = `<div class="pw-sec"><h3>${t('Feeds', 'Voedingen')} <button class="sm" id="pwAddFeed">${I('plus', 12)} ${t('Feed', 'Voeding')}</button></h3>
      ${feeds.length ? `<table class="data-table pw-t"><thead><tr><th>${t('Name', 'Naam')}</th><th>${t('Type', 'Type')}</th><th>${t('Max A per phase', 'Max A per fase')}</th><th>${t('Loops on from', 'Loopt door vanaf')}</th><th></th></tr></thead><tbody>${feeds.map(f => `<tr><td><input data-feed="${esc(f.id)}" data-k="name" value="${esc(f.name)}" style="width:190px"></td>
        <td>${sel(`data-feed="${esc(f.id)}" data-k="kind"`, [['Powerlock', 'Powerlock'], ['CEE', 'CEE'], ['Other', t('Other', 'Overig')]], f.kind)}</td><td><input data-feed="${esc(f.id)}" data-k="max" type="number" min="0" value="${f.max || ''}" style="width:80px"></td>
        <td>${sel(`data-feed="${esc(f.id)}" data-k="upstream"`, [['', '–'], ...p.feeds.filter(x => x.id !== f.id).map(x => [x.id, x.name])], f.upstream || '')}</td><td><button class="sm ghost" data-delfeed="${esc(f.id)}" title="${t('Remove', 'Verwijderen')}">${I('trash', 13)}</button></td></tr>`).join('')}</tbody></table>` : `<div class="subtle">${t('No feeds yet. A feed is a Powerlock / CEE run that carries one or more PDs.', 'Nog geen voedingen. Een voeding is een Powerlock- of CEE-run die één of meer PD’s draagt.')}</div>`}</div>`;
    const typeOpts = p.types.map(x => [x.id, x.name]);
    const used = new Set(p.pds.flatMap(d => d.cables));
    const pdHtml = pds.map(d => { const r = R.pds.get(d.id), socas = r.outs.filter(o => o.kind === 'soca');
      return `<div class="pw-pd"><div class="pw-pdh"><b><a href="#" data-pd="${esc(d.id)}">${esc(d.id)}</a></b>
        ${sel(`data-pd2="${esc(d.id)}" data-k="typeId"`, typeOpts.length ? typeOpts : [['', t('– make a PD type first –', '– maak eerst een PD-type –')]], d.typeId)}
        ${sel(`data-pd2="${esc(d.id)}" data-k="feedId"`, feedOpts, d.feedId || '')}<span style="flex:1"></span>
        <span class="subtle">${r.perPhase.map(r1).join(' / ')} A</span><button class="sm ghost" data-delpd="${esc(d.id)}" title="${t('Remove', 'Verwijderen')}">${I('trash', 13)}</button></div>
        ${socas.length ? `<div class="pw-slots">${socas.map((o, i) => `<label>${esc(o.label)}${sel(`data-slot="${esc(d.id)}" data-i="${i}"`, [['', '–'], ...cabs.filter(c => c.name === d.cables[i] || !used.has(c.name)).map(c => [c.name, `${c.name}  (${r1(PW.sum3(c.perPhase))} A)`])], d.cables[i] || '')}</label>`).join('')}</div>` : `<div class="subtle">${t('This PD has no Socapex outputs.', 'Deze PD heeft geen Socapex-uitgangen.')}</div>`}</div>`; }).join('');
    return `${chips}${feedsHtml}<div class="pw-sec"><h3>PD's <button class="sm" id="pwAddPd" ${typeOpts.length ? '' : 'disabled'}>${I('plus', 12)} PD</button>
      <button class="sm" id="pwAuto" ${pds.length && cabs.length ? '' : 'disabled'} title="${t('Gives the PDs their cables: a block of 12 numbers each (M101–M112, M113–M124 …), in order', 'Geeft de PD’s hun kabels: een blok van 12 nummers per PD (M101–M112, M113–M124 …), op volgorde')}">${I('refresh', 12)} ${t('Fill cables automatically', 'Kabels automatisch vullen')}</button></h3>
      ${!typeOpts.length ? `<div class="hint">${I('info', 13)} ${t('There are no PD types yet. Add them under “PD types” (the two examples are one click away).', 'Er zijn nog geen PD-typen. Voeg ze toe bij “PD-typen” (de twee voorbeelden zijn één klik weg).')}</div>` : ''}
      ${pdHtml || `<div class="subtle">${t('No PD in this DimCity yet.', 'Nog geen PD in deze DimCity.')}</div>`}
      <div class="subtle">${cabs.length} ${t('Socapex cables in this DimCity', 'Socapex-kabels in deze DimCity')} · ${cabs.filter(c => !used.has(c.name)).length} ${t('not on a PD yet', 'nog niet op een PD')}</div></div>`;
  }

  // ---------- one PD like a page of the booklet ----------
  function pdDetail(p, R){
    const d = p.pds.find(x => x.id === U.pd), r = d && R.pds.get(d.id); if(!r) { U.pd = null; return ''; }
    const max = (p.feeds.find(f => f.id === d.feedId)?.max) || 0;
    const rows = [];
    for(const s of r.slots){
      const circs = [1, 2, 3, 4, 5, 6], c = s.data;
      circs.forEach((n, i) => { const k = c?.circuits.get(n), fx = k?.fixtures || [], ph = k ? k.phase : PW.phaseOf(n), a = k ? k.amps : 0;
        rows.push(`<tr class="${i === 0 ? 'pw-first' : ''}">${i === 0 ? `<td rowspan="6" class="pw-soca">Soca ${s.letter}${s.cable ? `<br><small>${esc(s.cable)}</small>` : ''}</td>` : ''}<td>${r.slots.indexOf(s) + 1}.${n}</td><td>${esc(PW.dmxLabel(fx))}</td><td>${s.cable ? `${esc(s.cable)}-${n}` : ''}</td><td>${esc(PW.unitRanges(fx.map(f => f.unit)))}</td><td>${esc(PW.fixturesText(fx))}</td><td>${esc(PW.positionText(fx))}</td>${[1, 2, 3].map(q => `<td class="pw-n ${a > p.settings.circuitMax && ph === q ? 'bad' : ''}">${ph === q && a ? r1(a) : ''}</td>`).join('')}</tr>`); });
      rows.push(`<tr class="pw-sum"><td colspan="7">Total Soca ${s.letter}</td>${phaseCells(s.perPhase)}</tr>`);
    }
    const man = r.manual.map(o => { const m = d.manual[o.key] || {}; return `<tr><td>${esc(o.label)}</td><td><input data-man="${esc(d.id)}" data-key="${esc(o.key)}" data-k="label" value="${esc(m.label || '')}" style="width:160px"></td><td><input data-man="${esc(d.id)}" data-key="${esc(o.key)}" data-k="location" value="${esc(m.location || '')}" style="width:120px"></td>${['l1', 'l2', 'l3'].map(k => `<td><input data-man="${esc(d.id)}" data-key="${esc(o.key)}" data-k="${k}" type="number" step="0.1" min="0" value="${m[k] || ''}" style="width:64px"></td>`).join('')}</tr>`; }).join('');
    return `<div class="pw-sec"><div class="pw-bar"><button id="pwBack">← ${t('Back', 'Terug')}</button><b style="font-size:18px">${esc(d.id)}</b><span class="subtle">${esc(r.type?.name || '')} · ${esc(p.feeds.find(f => f.id === d.feedId)?.name || t('no feed', 'geen voeding'))}</span><span style="flex:1"></span><b>${r.perPhase.map(r1).join(' / ')} A</b></div>
      ${r.slots.length ? `<table class="data-table pw-t pw-book"><thead><tr><th></th><th>CH</th><th>DMX</th><th>Multi</th><th>Fix nr.</th><th>${t('Fixtures', 'Armaturen')}</th><th>${t('Location', 'Locatie')}</th><th>L1</th><th>L2</th><th>L3</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}
      ${r.manual.length ? `<h3>${t('Other outlets (type the load yourself)', 'Overige uitgangen (vul de belasting zelf in)')}</h3><table class="data-table pw-t"><thead><tr><th>${t('Outlet', 'Uitgang')}</th><th>${t('Name', 'Naam')}</th><th>${t('Location', 'Locatie')}</th><th>L1 A</th><th>L2 A</th><th>L3 A</th></tr></thead><tbody>${man}</tbody></table>` : ''}
      <table class="data-table pw-t pw-tot"><tbody><tr><td><b>TOTAL</b></td>${phaseCells(r.perPhase, max)}</tr></tbody></table></div>`;
  }

  // ---------- PD types ----------
  function typesTab(p){
    const ty = p.types.find(x => x.id === U.type) || null;
    const list = p.types.map(x => `<div class="pw-ty ${x.id === U.type ? 'on' : ''}" data-ty="${esc(x.id)}"><b>${esc(x.name)}</b><span class="subtle">${esc(x.input?.kind || '')} ${x.input?.amps || ''} A · ${PW.socaCount(x)} Soca · ${p.pds.filter(d => d.typeId === x.id).length}× ${t('used', 'gebruikt')}</span></div>`).join('');
    const ed = ty ? `<div class="pw-sec"><div class="pw-row"><label>${t('Name', 'Naam')}<input id="tyName" value="${esc(ty.name)}" style="width:380px"></label>
        <label>${t('Input', 'Ingang')}${sel('id="tyIn"', [['Powerlock', 'Powerlock'], ['CEE', 'CEE'], ['Other', t('Other', 'Overig')]], ty.input?.kind || 'Powerlock')}</label><label>A<input id="tyAmps" type="number" min="0" value="${ty.input?.amps || ''}" style="width:80px"></label></div>
      <h3>${t('Outputs', 'Uitgangen')}</h3><table class="data-table pw-t"><thead><tr><th>${t('Kind', 'Soort')}</th><th>${t('Count', 'Aantal')}</th><th>A</th><th>${t('Name', 'Naam')}</th><th>${t('Phases', 'Fases')}</th><th></th></tr></thead><tbody>
      ${ty.outputs.map((o, i) => `<tr><td>${sel(`data-o="${i}" data-k="kind"`, [['soca', 'Socapex (6 circuits)'], ['cee', 'CEE'], ['schuko', 'Schuko']], o.kind)}</td><td><input data-o="${i}" data-k="count" type="number" min="1" value="${o.count || 1}" style="width:64px"></td><td><input data-o="${i}" data-k="amps" type="number" min="0" value="${o.amps || ''}" style="width:70px"></td>
        <td><input data-o="${i}" data-k="label" value="${esc(o.label || '')}" style="width:130px" ${o.kind === 'soca' ? 'disabled' : ''}></td><td>${o.kind === 'cee' ? sel(`data-o="${i}" data-k="phases"`, [['1', '1'], ['3', '3']], String(o.phases || 1)) : ''}</td><td><button class="sm ghost" data-delo="${i}">${I('trash', 13)}</button></td></tr>`).join('')}</tbody></table>
      <div class="pw-row"><button class="sm" id="tyAddO">${I('plus', 12)} ${t('Output', 'Uitgang')}</button><span style="flex:1"></span><button class="sm danger" id="tyDel">${I('trash', 12)} ${t('Delete type', 'Type verwijderen')}</button></div></div>` : `<div class="subtle">${t('Pick a type, or make a new one.', 'Kies een type, of maak een nieuwe.')}</div>`;
    return `<div class="pw-sec"><div class="pw-row"><button class="sm primary" id="tyNew">${I('plus', 12)} ${t('New PD type', 'Nieuw PD-type')}</button><button class="sm" id="tySamples">${t('Add the two examples', 'Voeg de twee voorbeelden toe')}</button></div>${list || `<div class="subtle">${t('No PD types yet.', 'Nog geen PD-typen.')}</div>`}</div>${ed}`;
  }

  // ---------- events ----------
  function bind(){
    const q = s => root.querySelector(s), qa = s => [...root.querySelectorAll(s)], p = P();
    const redo = () => { dirty(); render(); };
    qa('[data-tab]').forEach(b => b.onclick = () => { U.tab = b.dataset.tab; U.pd = null; U.msg = ''; render(); });
    qa('[data-pd]').forEach(a => a.onclick = e => { e.preventDefault(); U.pd = a.dataset.pd; render(); });
    qa('[data-goto]').forEach(a => a.onclick = e => { e.preventDefault(); U.tab = a.dataset.goto; U.dc = a.dataset.dc || U.dc; render(); });
    qa('[data-dc]').forEach(i => i.onchange = () => { U.dc = i.dataset.dc; render(); });
    const back = q('#pwBack'); if(back) back.onclick = () => { U.pd = null; render(); };
    const dq = s => document.querySelector(s), file = dq('#pwFile'), pick = () => file.click();
    ['#pwImport', '#pwImport2'].forEach(s => { const b = dq(s); if(b) b.onclick = pick; });
    file.onchange = async () => {
      const f = file.files[0]; if(!f) return; const text = await f.text(); const { fixtures, warnings } = PW.parseSheet(text);
      if(!fixtures.length){ App.ui.toast(t('No fixtures found in that file', 'Geen armaturen gevonden in dat bestand'), 'err'); return; }
      p.fixtures = fixtures; p.source = { name:f.name, rows:fixtures.length, at:new Date().toISOString() };
      U.msg = `${f.name}: ${fixtures.length} ${t('fixtures read', 'armaturen ingelezen')}${warnings.length ? ' · ' + warnings.join(' ') : ''}`; redo();
    };
    // feeds
    qa('[data-feed]').forEach(e => e.onchange = () => { const f = p.feeds.find(x => x.id === e.dataset.feed), k = e.dataset.k; f[k] = k === 'max' ? Number(e.value) || 0 : e.value; redo(); });
    const af = q('#pwAddFeed'); if(af) af.onclick = () => { const n = p.feeds.filter(f => f.dc === U.dc).length + 1, num = Number(String(U.dc).replace(/\D/g, '')) || n; p.feeds.push({ id:PW.newId('F'), dc:U.dc, name:`${U.dc.replace(/^DB0*/, 'DB')}.${n} PWL250 Run`, kind:'Powerlock', max:250, upstream:'' }); redo(); };
    qa('[data-delfeed]').forEach(b => b.onclick = () => { const id = b.dataset.delfeed; p.feeds = p.feeds.filter(f => f.id !== id); p.pds.forEach(d => { if(d.feedId === id) d.feedId = ''; }); p.feeds.forEach(f => { if(f.upstream === id) f.upstream = ''; }); redo(); });
    // PDs
    const ap = q('#pwAddPd'); if(ap) ap.onclick = () => { const dnum = String(U.dc).replace(/^DB0*/, ''), k = p.pds.filter(d => d.dc === U.dc).length + 1; const typ = p.types[p.types.length - 1]; p.pds.push({ id:`PD${dnum}.${k}`, dc:U.dc, typeId:p.types.find(x => PW.socaCount(x))?.id || typ.id, feedId:p.feeds.find(f => f.dc === U.dc)?.id || '', cables:[], manual:{} }); redo(); };
    qa('[data-pd2]').forEach(e => e.onchange = () => { const d = p.pds.find(x => x.id === e.dataset.pd2); d[e.dataset.k] = e.value; if(e.dataset.k === 'typeId') d.cables = d.cables.slice(0, PW.socaCount(p.types.find(x => x.id === e.value))); redo(); });
    qa('[data-delpd]').forEach(b => b.onclick = () => { p.pds = p.pds.filter(d => d.id !== b.dataset.delpd); redo(); });
    qa('[data-slot]').forEach(e => e.onchange = () => { const d = p.pds.find(x => x.id === e.dataset.slot), i = Number(e.dataset.i); const a = d.cables.slice(); while(a.length <= i) a.push(''); a[i] = e.value; d.cables = a; while(d.cables.length && !d.cables[d.cables.length - 1]) d.cables.pop(); redo(); });
    const au = q('#pwAuto'); if(au) au.onclick = () => { const r = PW.autoAssign(p, U.dc, dims()); U.msg = `${r.placed}/${r.total} ${t('cables placed on', 'kabels geplaatst op')} ${r.pdsUsed} PD${r.pdsNeeded > r.pdsUsed ? ` — ${t('needs', 'nodig')} ${r.pdsNeeded} PD` : ''}.`; redo(); };
    qa('[data-man]').forEach(e => e.onchange = () => { const d = p.pds.find(x => x.id === e.dataset.man); const m = (d.manual[e.dataset.key] ||= {}); m[e.dataset.k] = ['l1', 'l2', 'l3'].includes(e.dataset.k) ? Number(e.value) || 0 : e.value; redo(); });
    // types
    qa('[data-ty]').forEach(e => e.onclick = () => { U.type = e.dataset.ty; render(); });
    const tn = q('#tyNew'); if(tn) tn.onclick = () => { const ty = { id:PW.newId('PDT:'), name:t('New PD', 'Nieuwe PD'), input:{ kind:'Powerlock', amps:250 }, outputs:[{ kind:'soca', count:12, amps:16 }] }; p.types.push(ty); U.type = ty.id; redo(); };
    const ts = q('#tySamples'); if(ts) ts.onclick = () => { for(const s of PW.SAMPLE_TYPES) if(!p.types.some(x => x.id === s.id)) p.types.push(JSON.parse(JSON.stringify(s))); redo(); };
    const ty = p.types.find(x => x.id === U.type);
    const bv = (id, fn) => { const e = q(id); if(e) e.onchange = () => { fn(e.value); redo(); }; };
    if(ty){
      bv('#tyName', v => { ty.name = v; }); bv('#tyIn', v => { ty.input = { ...(ty.input || {}), kind:v }; }); bv('#tyAmps', v => { ty.input = { ...(ty.input || {}), amps:Number(v) || 0 }; });
      qa('[data-o]').forEach(e => e.onchange = () => { const o = ty.outputs[Number(e.dataset.o)], k = e.dataset.k; o[k] = ['count', 'amps', 'phases'].includes(k) ? Number(e.value) || 0 : e.value; redo(); });
      qa('[data-delo]').forEach(b => b.onclick = () => { ty.outputs.splice(Number(b.dataset.delo), 1); redo(); });
      const ao = q('#tyAddO'); if(ao) ao.onclick = () => { ty.outputs.push({ kind:'cee', count:1, amps:32, label:'32A', phases:3 }); redo(); };
      const dl = q('#tyDel'); if(dl) dl.onclick = () => { if(p.pds.some(d => d.typeId === ty.id)){ App.ui.toast(t('This type is used by a PD', 'Dit type wordt door een PD gebruikt'), 'err'); return; } p.types = p.types.filter(x => x !== ty); U.type = null; redo(); };
    }
    const bk = dq('#pwBook'); if(bk) bk.onclick = exportBooklet;
  }

  // ---------- booklet (PDF) ----------
  function bookletHtml(p, R, ds){
    const meta = M().projectMeta || {}, title = meta.project || 'Power', css = `@page{size:A4;margin:12mm}body{font:11px Arial,sans-serif;color:#111}h1{font-size:28px;margin:30px 0 4px}h2{font-size:20px;margin:0 0 8px}h3{font-size:14px;margin:14px 0 4px}table{border-collapse:collapse;width:100%;margin:0 0 10px}td,th{border:1px solid #333;padding:2px 5px;text-align:left}td.n{text-align:right}.pg{page-break-after:always}.cv{text-align:center;padding-top:110px}.sum td{font-weight:bold;background:#eee}small{color:#555}.hd{display:flex;justify-content:space-between;border-bottom:2px solid #333;margin-bottom:8px;font-size:12px}`;
    const n1 = a => a.map(r1).map(x => `<td class="n">${x}</td>`).join('');
    const pages = [`<div class="pg cv"><h1>${esc(title)}</h1><div>${esc(meta.date || '')}</div><div style="margin-top:40px;font-size:22px">${esc(meta.venue || '')}</div></div>`];
    for(const dc of ds){
      const pds = p.pds.filter(d => d.dc === dc), feeds = p.feeds.filter(f => f.dc === dc); if(!pds.length && !feeds.length) continue;
      pages.push(`<div class="pg"><div class="hd"><b>${esc(title)}</b><span>${esc(dc)}</span></div><h2>${esc(dc)}</h2><table><tr><th>PD</th><th>Type</th><th>Feed</th><th>L1</th><th>L2</th><th>L3</th></tr>${pds.map(d => { const r = R.pds.get(d.id); return `<tr><td>${esc(d.id)}</td><td>${esc(r.type?.name || '')}</td><td>${esc(p.feeds.find(f => f.id === d.feedId)?.name || '')}</td>${n1(r.perPhase)}</tr>`; }).join('')}</table>
        <table><tr><th>Feed</th><th>Type</th><th>Max A</th><th>L1</th><th>L2</th><th>L3</th></tr>${feeds.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.kind || '')}</td><td class="n">${f.max || ''}</td>${n1(R.feeds.get(f.id).total)}</tr>`).join('')}</table></div>`);
      for(const d of pds){ const r = R.pds.get(d.id); if(r.slots.length){ const rows = r.slots.map((s, si) => [1, 2, 3, 4, 5, 6].map(n => { const k = s.data?.circuits.get(n), fx = k?.fixtures || [], ph = k ? k.phase : PW.phaseOf(n); return `<tr>${n === 1 ? `<td rowspan="6"><b>Soca ${s.letter}</b><br><small>${esc(s.cable)}</small></td>` : ''}<td>${si + 1}.${n}</td><td>${esc(PW.dmxLabel(fx))}</td><td>${s.cable ? esc(s.cable) + '-' + n : ''}</td><td>${esc(PW.unitRanges(fx.map(f => f.unit)))}</td><td>${esc(PW.fixturesText(fx))}</td><td>${esc(PW.positionText(fx))}</td>${[1, 2, 3].map(q => `<td class="n">${k && ph === q ? r1(k.amps) : ''}</td>`).join('')}</tr>`; }).join('') + `<tr class="sum"><td colspan="7">Total Soca ${s.letter}</td>${n1(s.perPhase)}</tr>`).join('');
        pages.push(`<div class="pg"><div class="hd"><b>${esc(title)}</b><span>${esc(d.id)} — ${esc(r.type?.name || '')}</span></div><table><tr><th></th><th>CH</th><th>DMX</th><th>Multi</th><th>Fix nr.</th><th>Fixtures</th><th>Location</th><th>L1</th><th>L2</th><th>L3</th></tr>${rows}<tr class="sum"><td colspan="7">TOTAL</td>${n1(r.perPhase)}</tr></table></div>`); }
        else pages.push(`<div class="pg"><div class="hd"><b>${esc(title)}</b><span>${esc(d.id)} — ${esc(r.type?.name || '')}</span></div><table><tr><th>Outlet</th><th>Name</th><th>Location</th><th>L1</th><th>L2</th><th>L3</th></tr>${r.manual.map(o => `<tr><td>${esc(o.label)}</td><td>${esc(o.label2)}</td><td>${esc(o.location)}</td>${n1(o.perPhase)}</tr>`).join('')}<tr class="sum"><td colspan="3">TOTAL</td>${n1(r.perPhase)}</tr></table></div>`); }
    }
    pages.push(`<div><div class="hd"><b>${esc(title)}</b><span>Power summary</span></div>${p.feeds.map(f => { const r = R.feeds.get(f.id); return `<h3>${esc(f.name)} <small>${esc(f.dc)} · max ${f.max || '–'} A</small></h3><table><tr><th>PD</th><th>L1</th><th>L2</th><th>L3</th></tr>${p.pds.filter(d => d.feedId === f.id).map(d => `<tr><td>${esc(d.id)}</td>${n1(R.pds.get(d.id).perPhase)}</tr>`).join('')}<tr class="sum"><td>TOTAL</td>${n1(r.total)}</tr></table>`; }).join('')}</div>`);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${pages.join('')}</body></html>`;
  }
  async function exportBooklet(){
    const p = P(), ds = dims(), R = PW.compute(p, ds), html = bookletHtml(p, R, ds), base = ((M().projectMeta?.project) || 'Power').replace(/[^a-z0-9_-]+/gi, '_');
    try {
      if(window.app?.exportPdfFromHtml){ const out = await window.app.exportPdfFromHtml({ html, defaultPath:`${base}-PD-booklet.pdf`, landscape:false, pageSize:'A4', footer:null, brand:null }); if(out) App.ui.toast(`${t('Exported', 'Geëxporteerd')} ${out.split(/[\\/]/).pop()}`, 'ok'); }
      else { const w = window.open('', '_blank'); if(w){ w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); } }
    } catch(err){ App.ui.toast(`${t('PDF export failed', 'PDF-export mislukt')}: ${err?.message || err}`, 'err', { ms:7000 }); }
  }

  window.Power = { render, state:U, bookletHtml: (...a) => PW && bookletHtml(...a), core: () => PW };
})();
