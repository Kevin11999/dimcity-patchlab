// ui/netcables.js — network cables (Cat looms): C101 = a cable of 4 lines for DimCity 01, lines C101.1 … C101.4.
// They come from the CSV like an LK or a Veam (id C101, port 1-4, VLAN group in the third column, location in the
// fourth) and can only be plugged into a network switch. MODEL.netLines = [{ id, port, vlan, dest, dimcity }].
// What you change here (VLAN, location, the universes a line carries, a new or a removed line) is kept apart from the CSV in
// MODEL.networkDevices.netLineEdits = { 'C101.1': { vlan, dest, universes, removed, added, id, port, dimcity } },
// so a new import does not lose it. The CSV export contains the edited VLAN and location.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const edits = (m = M()) => { const nd = m.networkDevices; return (nd.netLineEdits ||= {}); };
  const dirty = () => { const m = M(); if(m?.ui) m.ui.dirty = true; };
  const loomOf = id => window.CsvRules?.loomOf(id) || { name:'Cat loom', prefix:'C', lines:4 };
  const linesOf = id => Array.from({ length:loomOf(id).lines }, (_, i) => i + 1);
  const nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric:true });

  // every line that exists: the CSV lines with the edits on top, plus the lines added here. [{ id, port, vlan, dest, dimcity, universes, added }]
  function effective(m = M()){
    const ed = edits(m), out = [], seen = new Set();
    for(const N of (m.netLines || [])){
      const k = `${N.id}.${N.port}`; seen.add(k); const e = ed[k] || {};
      if(e.removed) continue;
      out.push({ ...N, vlan:e.vlan !== undefined ? e.vlan : N.vlan, dest:e.dest !== undefined ? e.dest : N.dest, universes:e.universes || '' });
    }
    for(const [k, e] of Object.entries(ed)){
      if(seen.has(k) || !e.added || e.removed) continue;
      out.push({ id:e.id, port:Number(e.port), vlan:e.vlan ?? null, dest:e.dest || '', dimcity:e.dimcity, universes:e.universes || '', added:true });
    }
    return out;
  }
  // cables of a DimCity: [{ id, dimcity, lines:[{ port, vlan, dest, universes, empty }] }] with every cable's 4 lines
  function cables(dc){
    const by = new Map();
    for(const N of effective()){ if(dc && N.dimcity !== dc) continue; if(!by.has(N.id)) by.set(N.id, { id:N.id, dimcity:N.dimcity, lines:new Map() }); by.get(N.id).lines.set(N.port, N); }
    return [...by.values()].sort((a, b) => nat(a.id, b.id)).map(c => ({ id:c.id, dimcity:c.dimcity, lines:linesOf(c.id).map(p => c.lines.get(p) || { id:c.id, port:p, vlan:null, dest:'', universes:'', dimcity:c.dimcity, empty:true }) }));
  }
  const vlanChip = v => { const x = v != null ? window.Fent?.vlanById(v) : null; return x ? `<span class="fent-chip" style="--c:${x.color || '#94a3b8'}" title="${esc(x.discipline)}">${x.id} ${esc(x.name)}</span>` : (v != null ? `<span class="fent-chip" style="--c:#94a3b8">${esc(v)}</span>` : ''); };

  // ---- changing lines ----
  function setLine(c, port, patch){
    const k = `${c.id}.${port}`, ed = edits(), base = (M().netLines || []).some(N => `${N.id}.${N.port}` === k);
    const e = ed[k] || (ed[k] = base ? {} : { added:true, id:c.id, port, dimcity:c.dimcity });
    delete e.removed; Object.assign(e, patch);
    if(base && !Object.keys(e).length) delete ed[k];
    dirty();
  }
  function removeLine(c, port){
    const k = `${c.id}.${port}`, ed = edits(), base = (M().netLines || []).some(N => `${N.id}.${N.port}` === k);
    if(base) ed[k] = { ...(ed[k] || {}), removed:true }; else delete ed[k];
    dirty();
  }
  // a new cable: "C105", or just "105" with the loom type chosen next to it
  function addCable(text, dc, loomPrefix){
    const R = window.CsvRules, raw = String(text || '').trim(), looms = R.rules().looms;
    const loom = looms.find(l => l.prefix.toUpperCase() === String(loomPrefix || '').toUpperCase()) || looms[0];
    const id0 = /^\d+$/.test(raw) ? `${loom.prefix}${raw}` : raw, cls = R.classify(id0);
    if(!cls || cls.kind !== 'NET') return t(`A network cable is called ${looms.map(l => l.prefix).join(' / ')} and a number, like ${loom.prefix}105`, `Een netwerkkabel heet ${looms.map(l => l.prefix).join(' / ')} en een nummer, zoals ${loom.prefix}105`);
    const id = cls.id;
    if(cables().some(c => c.id === id)) return t('That cable exists already', 'Die kabel bestaat al');
    for(const p of linesOf(id)) edits()[`${id}.${p}`] = { added:true, id, port:p, dimcity:cls.dim === dc ? dc : dc };
    dirty(); return '';
  }
  function removeCable(c){ for(const p of linesOf(c.id)) removeLine(c, p); }

  // the universes a line carries, as typed ("1-4, 7"): a list of numbers
  function uniList(text){
    const out = [];
    for(const part of String(text || '').split(/[,;\s]+/).filter(Boolean)){
      const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if(m){ const a = Number(m[1]), b = Number(m[2]); for(let u = Math.min(a, b); u <= Math.max(a, b) && out.length < 4096; u++) out.push(u); }
      else if(/^\d+$/.test(part)) out.push(Number(part));
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }
  // 1,2,3,4,7 → "1-4, 7"
  function uniText(list){
    const l = [...new Set(list)].sort((a, b) => a - b), runs = []; let s = null, p = null;
    for(const u of l){ if(s === null){ s = p = u; } else if(u === p + 1){ p = u; } else { runs.push(s === p ? `${s}` : p === s + 1 ? `${s}, ${p}` : `${s}-${p}`); s = p = u; } }
    if(s !== null) runs.push(s === p ? `${s}` : p === s + 1 ? `${s}, ${p}` : `${s}-${p}`);
    return runs.join(', ');
  }

  function card(dc, opts = {}){
    const list = cables(dc), edit = !!opts.edit;
    if(!list.length && !edit) return '';
    const lines = list.reduce((n, c) => n + c.lines.filter(l => !l.empty).length, 0);
    const vlans = window.Fent ? window.Fent.vlanList(M().networkDevices?.prefs?.fent?.vlanMode || 'luminex') : [];
    const lineHtml = (c, l) => edit
      ? `<div class="netcable-line ${l.empty ? 'nl-empty' : ''}" data-ncl="${esc(c.id)}|${l.port}"><span class="nl-n">${esc(c.id)}.${l.port}</span>
          <select data-ncf="vlan" title="VLAN"><option value="">—</option>${vlans.map(v => `<option value="${v.id}" ${Number(l.vlan) === v.id ? 'selected' : ''}>${v.id} ${esc(v.name)}</option>`).join('')}${l.vlan != null && !vlans.some(v => v.id === Number(l.vlan)) ? `<option value="${esc(l.vlan)}" selected>${esc(l.vlan)}</option>` : ''}</select>
          <input data-ncf="dest" value="${esc(l.dest || '')}" placeholder="${esc(t('location', 'locatie'))}" style="width:120px">
          <input data-ncf="universes" value="${esc(l.universes || '')}" placeholder="${esc(t('universes, e.g. 1-4, 7', 'universes, bv. 1-4, 7'))}" style="width:130px" title="${esc(t('The universes this line carries (information for the paperwork)', 'De universes die deze lijn draagt (informatie voor het papierwerk)'))}">
          ${l.empty ? '' : `<button class="sm ghost" data-ncdel title="${esc(t('Remove this line', 'Verwijder deze lijn'))}">${I('trash', 13)}</button>`}</div>`
      : `<div class="netcable-line ${l.empty ? 'nl-empty' : ''}"><span class="nl-n">${esc(c.id)}.${l.port}</span>${vlanChip(l.vlan)}<span class="nl-d">${l.empty ? '—' : esc(l.dest || '')}</span>${l.universes ? `<span class="nl-u">U ${esc(l.universes)}</span>` : ''}</div>`;
    const body = `${edit ? `<div class="su-row" style="margin:6px 12px"><b style="font-size:12.5px">${t('New network cable', 'Nieuwe netwerkkabel')}</b>${window.CsvRules.rules().looms.length > 1 ? `<select id="ncNewLoom">${window.CsvRules.rules().looms.map(l => `<option value="${esc(l.prefix)}">${esc(l.name)} (${esc(l.prefix)}, ${l.lines})</option>`).join('')}</select>` : ''}<input id="ncNewId" placeholder="${esc(window.CsvRules.rules().looms[0].prefix)}105" style="width:100px"><button class="sm" id="ncNew">${I('plus', 13)} ${t('Add', 'Toevoegen')}</button><span class="subtle" id="ncNewErr"></span></div>` : ''}
      <div class="lk-card-grid veams">${list.map(c => `<div class="netcable" data-nccable="${esc(c.id)}"><div class="netcable-head"><b>${esc(c.id)}</b><span class="subtle">${esc(loomOf(c.id).name)} · ${c.lines.filter(l => !l.empty).length}/${c.lines.length}</span>${edit ? `<button class="sm ghost" data-ncdelcable title="${esc(t('Remove the whole cable', 'Verwijder de hele kabel'))}">${I('trash', 13)}</button>` : ''}</div>
        ${c.lines.map(l => lineHtml(c, l)).join('')}</div>`).join('')}</div>
      <div class="hint" style="margin:8px 12px">${I('info', 13)} ${edit ? t('Every line gets its own switch port. Pick the VLAN of the line, its location and the universes it carries; change the order and the ports in the connections table above. What you change here is kept when you import the CSV again.', 'Elke lijn krijgt een eigen switchpoort. Kies het VLAN van de lijn, de locatie en de universes die hij draagt; de volgorde en de poorten wijzig je in de tabel met aansluitingen hierboven. Wat je hier wijzigt blijft bewaard als je de CSV opnieuw importeert.') : t('These cables plug into a network switch. In the Network Planner they get the switch ports after the nodes.', 'Deze kabels gaan in een netwerkswitch. In de Netwerkplanner krijgen ze de switchpoorten na de nodes.')}</div>`;
    return App.ui.card({ key:`${dc}:net`, title:t('Network cables', 'Netwerkkabels'), icon:'network', meta:`${list.length} ${t('cables', 'kabels')} · ${lines} ${t('lines', 'lijnen')}`, body });
  }
  function bind(root, dc, rerender){
    const add = root.querySelector('#ncNew');
    if(add) add.onclick = () => { const err = addCable(root.querySelector('#ncNewId').value, dc, root.querySelector('#ncNewLoom')?.value); if(err){ root.querySelector('#ncNewErr').textContent = err; return; } rerender(); };
    root.querySelectorAll('[data-ncl]').forEach(row => {
      const [id, port] = row.dataset.ncl.split('|'), c = cables(dc).find(x => x.id === id); if(!c) return; const p = Number(port);
      row.querySelectorAll('[data-ncf]').forEach(inp => inp.onchange = () => {
        const f = inp.dataset.ncf, v = inp.value.trim();
        if(f === 'vlan') setLine(c, p, { vlan:v === '' ? null : Number(v) });
        else if(f === 'universes') setLine(c, p, { universes:uniText(uniList(v)) });
        else setLine(c, p, { dest:v });
        rerender();
      });
      const del = row.querySelector('[data-ncdel]'); if(del) del.onclick = () => { removeLine(c, p); rerender(); };
    });
    root.querySelectorAll('[data-ncdelcable]').forEach(b => b.onclick = () => { const c = cables(dc).find(x => x.id === b.closest('[data-nccable]').dataset.nccable); if(c){ removeCable(c); rerender(); } });
  }
  window.NetCables = { cables, card, bind, vlanChip, effective, setLine, uniList, uniText };
})();
