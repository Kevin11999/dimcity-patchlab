// ui/fibers.js — fibre links between the SFP ports of switches (and so between DBs).
// Cable types (opticalCON / FiberFox / 4-core / singlemode / SFP patch …) are made in the Device Builder (tab Cables).
// MODEL.networkDevices.fiberLinks = [{ id, typeId, a:{ dc, sw, sfp } | { free:'text' }, b:{…}, note }]
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const nd = () => { const n = M().networkDevices; n.fiberLinks ||= []; n.cableTypes ||= []; return n; };
  const typeOf = id => nd().cableTypes.find(x => x.id === id) || null;
  const typeName = ty => ty ? ([ty.brand, ty.name].filter(Boolean).join(' ') || ty.id) : '';
  const MEDIUM = { smf:'Singlemode', mmf:'Multimode', dac:'SFP patch / DAC', cat:'Cat' };
  const nextId = () => { const used = new Set(nd().fiberLinks.map(l => l.id)); let n = 1; while(used.has(`F${n}`)) n++; return `F${n}`; };

  const all = () => nd().fiberLinks;
  const ends = l => [l.a, l.b];
  const endLabel = e => !e ? '—' : e.free ? e.free : `${e.dc} · ${e.sw} · SFP ${e.sfp}`;
  const links = dc => all().filter(l => ends(l).some(e => e?.dc === dc));
  // which fibre sits on SFP port n of a switch
  function usage(dc, sw){ const m = new Map(); for(const l of all()) for(const e of ends(l)) if(e?.dc === dc && e.sw === sw) m.set(Number(e.sfp), l); return m; }
  const keyOf = e => `${e.dc}|${e.sw}|${e.sfp}`;
  function freePorts(){
    const used = new Set(); for(const l of all()) for(const e of ends(l)) if(e && !e.free) used.add(keyOf(e));
    const out = [];
    for(const dc of App.sortedDims()) for(const s of (window.NetSwitches?.list(dc) || [])) for(let n = 1; n <= s.sfp; n++){ const k = `${dc}|${s.label}|${n}`; if(!used.has(k)) out.push({ dc, sw:s.label, sfp:n, key:k, text:`${dc} · ${s.label} · SFP ${n}` }); }
    return out;
  }
  // DB-to-DB overview: [{ a:'DB01', b:'DB02', count }]
  function matrix(){
    const m = new Map();
    for(const l of all()){ const a = l.a?.dc, b = l.b?.dc; if(!a || !b) continue; const k = [a, b].sort().join(' ⇄ '); m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].map(([k, count]) => ({ pair:k, count }));
  }
  const color = l => /^#[0-9a-f]{6}$/i.test(typeOf(l.typeId)?.color || '') ? typeOf(l.typeId).color : '#22c3d6';
  const lenOf = l => Number(typeOf(l.typeId)?.lengthM) || 0;

  // ---- the card on the Network Planner page ----
  function card(){
    const free = freePorts(), types = nd().cableTypes;
    const opt = (list, sel) => list.map(p => `<option value="${esc(p.key)}" ${sel === p.key ? 'selected' : ''}>${esc(p.text)}</option>`).join('');
    const tOpts = types.map(ty => `<option value="${esc(ty.id)}">${esc(typeName(ty))} · ${esc(MEDIUM[ty.medium] || '')} ${Number(ty.cores) || ''}-core · ${Number(ty.lengthM) || 0} m</option>`).join('');
    const form = `<div class="planner-controls" id="fibForm">
        <label>${t('Cable', 'Kabel')}<select id="fibType">${tOpts || `<option value="">${t('No cable types yet', 'Nog geen kabeltypes')}</option>`}</select></label>
        <label>${t('End A', 'Uiteinde A')}<select id="fibA">${opt(free)}<option value="*">${t('Other (type a name)…', 'Anders (typ een naam)…')}</option></select></label>
        <label>${t('End B', 'Uiteinde B')}<select id="fibB">${opt(free)}<option value="*">${t('Other (type a name)…', 'Anders (typ een naam)…')}</option></select></label>
        <button id="fibAdd" ${types.length && (free.length || true) ? '' : 'disabled'}>${I('plus', 14)}${t('Add fibre', 'Fiber toevoegen')}</button></div>
      ${types.length ? '' : `<div class="hint">${I('info', 13)} ${t('Make a fibre or SFP cable type first.', 'Maak eerst een fiber- of SFP-kabeltype.')} <a data-cmd="deviceBuilder" data-arg="cable">${t('Open the Device Builder (Cables)', 'Open de Device Builder (Kabels)')}</a></div>`}
      ${free.length ? '' : `<div class="hint">${I('info', 13)} ${t('No free SFP ports: add a switch with SFP ports to a DimCity first (or use “Other”).', 'Geen vrije SFP-poorten: voeg eerst een switch met SFP-poorten toe aan een DimCity (of kies “Anders”).')}</div>`}`;
    const rows = all().map((l, i) => { const ty = typeOf(l.typeId); return `<tr><td><span class="fent-sw" style="background:${color(l)}"></span><b>${esc(l.id)}</b></td><td>${esc(typeName(ty) || t('(type removed)', '(type verwijderd)'))}<div class="subtle" style="font-size:11px">${ty ? `${esc(MEDIUM[ty.medium] || '')} · ${Number(ty.cores) || ''}-core · ${esc(ty.connA || '')}${ty.connB && ty.connB !== ty.connA ? ` ↔ ${esc(ty.connB)}` : ''} · ${lenOf(l)} m` : ''}</div></td><td>${esc(endLabel(l.a))}</td><td>${esc(endLabel(l.b))}</td><td><input class="fibNote" data-i="${i}" value="${esc(l.note || '')}" placeholder="${esc(t('note', 'notitie'))}" style="width:130px"></td><td><button class="sm ghost fibRm" data-i="${i}" title="${esc(t('Remove', 'Verwijderen'))}">${I('trash', 13)}</button></td></tr>`; }).join('');
    const mx = matrix();
    const body = form + (all().length ? `<table class="data-table fent-ports" style="margin-top:10px"><thead><tr><th>ID</th><th>${t('Cable', 'Kabel')}</th><th>A</th><th>B</th><th>${t('Note', 'Notitie')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      ${mx.length ? `<div class="rb-label" style="margin-top:12px">${t('Between DBs', 'Tussen DB\'s')}</div><div class="fent-warns">${mx.map(x => `<span class="fent-chip" style="--c:#22c3d6">${esc(x.pair)} · ${x.count}×</span>`).join('')}</div>` : ''}` : `<div class="device-list-empty" style="margin-top:10px">${t('No fibres yet.', 'Nog geen fibers.')}</div>`);
    return App.ui.card({ key:'net-fibers', title:t('Fibre links', 'Fiberverbindingen'), icon:'cable', meta:`${all().length} ${t('links', 'verbindingen')}`, collapsible:false, body });
  }
  function bind(root, rerender){
    const add = root.querySelector('#fibAdd'); if(!add) return;
    const endOf = async v => {
      if(v === '*'){ const name = await ask(t('Name of the other end', 'Naam van het andere uiteinde'), t('For example “FOH rack switch”', 'Bijvoorbeeld “FOH-rack switch”')); return name ? { free:name } : null; }
      const [dc, sw, sfp] = v.split('|'); return { dc, sw, sfp:Number(sfp) };
    };
    add.onclick = async () => {
      const typeId = root.querySelector('#fibType').value, av = root.querySelector('#fibA').value, bv = root.querySelector('#fibB').value;
      if(!typeId){ App.ui.toast(t('Choose a cable type', 'Kies een kabeltype'), 'info'); return; }
      if(av === bv && av !== '*'){ App.ui.toast(t('End A and B are the same port', 'Uiteinde A en B zijn dezelfde poort'), 'err'); return; }
      const a = await endOf(av), b = await endOf(bv); if(!a || !b) return;
      nd().fiberLinks.push({ id:nextId(), typeId, a, b, note:'' }); M().ui.dirty = true; rerender();
    };
    root.querySelectorAll('.fibRm').forEach(b => b.onclick = () => { nd().fiberLinks.splice(Number(b.dataset.i), 1); M().ui.dirty = true; rerender(); });
    root.querySelectorAll('.fibNote').forEach(i => i.onchange = () => { const l = nd().fiberLinks[Number(i.dataset.i)]; if(l){ l.note = i.value.trim(); M().ui.dirty = true; } });
  }
  function ask(title, ph){
    return new Promise(res => {
      const d = App.ui.openDialog({ title, width:'400px', body:`<label class="field"><input id="fibFree" type="text" placeholder="${esc(ph)}" maxlength="60"></label>`, footer:`<button data-a="c">${t('Cancel', 'Annuleren')}</button><button class="primary" data-a="ok">OK</button>`, onClose:() => res(null) });
      const inp = d.body.querySelector('#fibFree'); setTimeout(() => inp.focus(), 30);
      const ok = () => { const v = inp.value.trim(); d.close(); res(v || null); };
      d.footer.querySelector('[data-a=c]').onclick = () => { d.close(); res(null); }; d.footer.querySelector('[data-a=ok]').onclick = ok; inp.onkeydown = e => { if(e.key === 'Enter') ok(); };
    });
  }
  window.Fibers = { all, links, usage, matrix, card, bind, typeOf, typeName, endLabel, color, lenOf, freePorts };
})();
