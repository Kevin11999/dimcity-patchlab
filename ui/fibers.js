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
  // name of a fibre port as printed on the device: "SFP 1", or "17 · opticalCON DUO" for types that define connectors
  const swOf = (dc, sw) => (window.NetSwitches?.list(dc) || []).find(x => x.label === sw);
  const portName = (dc, sw, n) => window.SwPorts ? window.SwPorts.label(swOf(dc, sw)?.type, Number(n)) : `SFP ${n}`;
  const endLabel = e => !e ? '—' : e.free ? e.free : `${e.dc} · ${e.sw} · ${portName(e.dc, e.sw, e.sfp)}`;
  const links = dc => all().filter(l => ends(l).some(e => e?.dc === dc));
  // which fibre sits on SFP port n of a switch
  function usage(dc, sw){ const m = new Map(); for(const l of all()) for(const e of ends(l)) if(e?.dc === dc && e.sw === sw) m.set(Number(e.sfp), l); return m; }
  const keyOf = e => `${e.dc}|${e.sw}|${e.sfp}`;
  function freePorts(){
    const used = new Set(); for(const l of all()) for(const e of ends(l)) if(e && !e.free) used.add(keyOf(e));
    const out = [];
    for(const dc of App.sortedDims()) for(const s of (window.NetSwitches?.list(dc) || [])) for(let n = 1; n <= s.sfp; n++){ const k = `${dc}|${s.label}|${n}`; if(!used.has(k)) out.push({ dc, sw:s.label, sfp:n, key:k, text:`${dc} · ${s.label} · ${window.SwPorts ? window.SwPorts.label(s.type, n) : 'SFP ' + n}` }); }
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
    const tOpts = types.map(ty => `<option value="${esc(ty.id)}">${esc(typeName(ty))} · ${esc(MEDIUM[ty.medium] || '')} ${Number(ty.cores) || ''}-core · ${String(Number(ty.lengthM) || 0).replace('.', ',')} m</option>`).join('');
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
      const fit = fits(typeId, a, b); if(!fit.ok){ App.ui.toast(fit.why, 'err'); return; }
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

  // ---- stock: "4× OC 7,5 m, 6× OC 250 m …" — how many of each cable type you own ----
  const stock = () => (nd().fiberStock ||= []);
  const qtyOf = typeId => { const e = stock().find(x => x.typeId === typeId); return e ? Number(e.qty) || 0 : null; };   // null = not counted (unlimited)
  const usedOf = typeId => all().filter(l => l.typeId === typeId).length;
  const leftOf = typeId => { const q = qtyOf(typeId); return q == null ? Infinity : Math.max(0, q - usedOf(typeId)); };
  function setQty(typeId, qty){
    const list = stock(), i = list.findIndex(x => x.typeId === typeId);
    if(qty == null || qty === ''){ if(i >= 0) list.splice(i, 1); }
    else if(i >= 0) list[i].qty = Math.max(0, Number(qty) || 0); else list.push({ typeId, qty:Math.max(0, Number(qty) || 0) });
    M().ui.dirty = true;
  }
  const fmtLen = m => String(Number(m) || 0).replace('.', ',');
  // short code printed on a drawing / label: OC250, FF250, OC7,5, SFP3
  function code(typeId){
    const ty = typeOf(typeId); if(!ty) return '?';
    const c = String(ty.connA || ''), pre = /optical/i.test(c) ? 'OC' : /fiberfox/i.test(c) ? 'FF' : /sfp|dac/i.test(c) || ty.medium === 'dac' ? 'SFP' : (c.slice(0, 2).toUpperCase() || 'F');
    return pre + fmtLen(ty.lengthM);
  }
  const connClass = c => /optical/i.test(c) ? 'oc' : /fiberfox/i.test(c) ? 'ff' : 'sfp';
  // a cable only fits a port with the same connector: opticalCON on opticalCON, FiberFox on FiberFox, SFP patch on a plain SFP
  const portClass = (e) => { const sw = swOf(e.dc, e.sw); return window.SwPorts.kindOf(window.SwPorts.conn(sw?.type, Number(e.sfp))); };
  const CLS = { oc:'opticalCON', ff:'FiberFox', sfp:'SFP' };
  function fits(typeId, a, b){
    const ty = typeOf(typeId); if(!ty) return { ok:true };
    const ca = connClass(ty.connA), cb = connClass(ty.connB || ty.connA);
    const pa = a && !a.free ? portClass(a) : null, pb = b && !b.free ? portClass(b) : null;
    const direct = (pa == null || pa === ca) && (pb == null || pb === cb), swapped = (pa == null || pa === cb) && (pb == null || pb === ca);
    if(direct || swapped) return { ok:true };
    return { ok:false, why:t(`${typeName(ty)} has ${CLS[ca]} connectors${cb !== ca ? ` / ${CLS[cb]}` : ''}, but the ports are ${CLS[pa] || '?'} and ${CLS[pb] || '?'}.`, `${typeName(ty)} heeft ${CLS[ca]}-connectoren${cb !== ca ? ` / ${CLS[cb]}` : ''}, maar de poorten zijn ${CLS[pa] || '?'} en ${CLS[pb] || '?'}.`) };
  }
  function addLink(a, b, typeId, note = ''){
    const l = { id:nextId(), typeId, a, b, note }; nd().fiberLinks.push(l); M().ui.dirty = true; return l;
  }
  // free fibre ports of the switches in a location, preferring the connector class of the cable
  function freeIn(dc, swLabel, cls, taken){
    const sw = (window.NetSwitches?.list(dc) || []).find(x => x.label === swLabel); if(!sw) return null;
    const used = new Set(taken); for(const l of all()) for(const e of ends(l)) if(e?.dc === dc && e.sw === swLabel) used.add(Number(e.sfp));
    const ok = [];
    for(let n = 1; n <= sw.sfp; n++) if(!used.has(n)) ok.push(n);
    return ok.find(n => window.SwPorts.kindOf(window.SwPorts.conn(sw.type, n)) === cls) ?? null;   // strictly the connector of the cable
  }
  // Auto-assign: switches in one location are chained with the short cable, locations are linked with the long cable (ring or chain).
  function autoAssign({ topology = 'ring', intraType, interType, dryRun = false } = {}){
    const out = { made:[], missing:[], noPort:[] };
    const locs = App.sortedDims().map(dc => ({ dc, sws:(window.NetSwitches?.list(dc) || []).filter(s => s.sfp > 0) })).filter(l => l.sws.length);
    const reserve = new Map();   // typeId -> used by this run
    const left = id => leftOf(id) - (reserve.get(id) || 0);
    const taken = new Map();     // `${dc}|${sw}` -> ports used by this run
    const take = (dc, sw, cls) => { const k = `${dc}|${sw}`; const arr = taken.get(k) || []; const n = freeIn(dc, sw, cls, arr); if(n != null){ arr.push(n); taken.set(k, arr); } return n; };
    const linked = (x, y) => all().some(l => (l.a?.dc === x.dc && l.a?.sw === x.sw && l.b?.dc === y.dc && l.b?.sw === y.sw) || (l.b?.dc === x.dc && l.b?.sw === x.sw && l.a?.dc === y.dc && l.a?.sw === y.sw)) || out.made.some(m => (m.a.dc === x.dc && m.a.sw === x.sw && m.b.dc === y.dc && m.b.sw === y.sw) || (m.b.dc === x.dc && m.b.sw === x.sw && m.a.dc === y.dc && m.a.sw === y.sw));
    const connect = (x, y, typeId) => {
      if(!typeId) return;
      if(x.dc === y.dc && x.sw === y.sw) return;
      if(linked(x, y)) return;
      if(left(typeId) <= 0){ out.missing.push({ typeId, between:`${x.dc} ${x.sw} ⇄ ${y.dc} ${y.sw}` }); return; }
      const cls = connClass(typeOf(typeId)?.connA);
      const pa = take(x.dc, x.sw, cls), pb = take(y.dc, y.sw, cls);
      if(pa == null || pb == null){ out.noPort.push(`${x.dc} ${x.sw} ⇄ ${y.dc} ${y.sw}`); return; }
      reserve.set(typeId, (reserve.get(typeId) || 0) + 1);
      out.made.push({ a:{ dc:x.dc, sw:x.sw, sfp:pa }, b:{ dc:y.dc, sw:y.sw, sfp:pb }, typeId });
    };
    for(const l of locs) for(let i = 0; i + 1 < l.sws.length; i++) connect({ dc:l.dc, sw:l.sws[i].label }, { dc:l.dc, sw:l.sws[i + 1].label }, intraType);
    const n = locs.length;
    for(let i = 0; i < n; i++){
      if(i + 1 >= n && !(topology === 'ring' && n > 2)) break;
      const A = locs[i], B = locs[(i + 1) % n];
      connect({ dc:A.dc, sw:A.sws[A.sws.length - 1].label }, { dc:B.dc, sw:B.sws[0].label }, interType);
    }
    if(!dryRun) for(const m of out.made) addLink(m.a, m.b, m.typeId, '');
    return out;
  }
  function suggestTypes(){
    const types = nd().cableTypes.slice().sort((a, b) => (Number(a.lengthM) || 0) - (Number(b.lengthM) || 0));
    const pool = types.filter(ty => ty.medium !== 'cat');
    const stocked = pool.filter(ty => qtyOf(ty.id) != null && leftOf(ty.id) > 0);
    const src = stocked.length >= 2 ? stocked : pool;
    return { intra:src[0]?.id || '', inter:src[src.length - 1]?.id || '' };
  }
  function stockCard(){
    const types = nd().cableTypes;
    if(!types.length) return `<div class="hint">${I('info', 13)} ${t('Make cable types first (Device Builder → Cables).', 'Maak eerst kabeltypes (Device Builder → Kabels).')} <a data-cmd="deviceBuilder" data-arg="cable">${t('Open', 'Openen')}</a></div>`;
    return `<table class="data-table fent-ports"><thead><tr><th>${t('Cable', 'Kabel')}</th><th>${t('Code', 'Code')}</th><th class="num">${t('In stock', 'Voorraad')}</th><th class="num">${t('Used', 'Gebruikt')}</th><th class="num">${t('Left', 'Over')}</th></tr></thead><tbody>${types.map(ty => { const q = qtyOf(ty.id), u = usedOf(ty.id), l = leftOf(ty.id);
      return `<tr><td><i class="dot" style="background:${esc(ty.color || '#22c3d6')}"></i> ${esc(typeName(ty))} <span class="subtle">${esc(MEDIUM[ty.medium] || '')} ${fmtLen(ty.lengthM)} m</span></td><td><b>${esc(code(ty.id))}</b></td><td class="num"><input type="number" min="0" max="999" class="fibQty" data-t="${esc(ty.id)}" value="${q == null ? '' : q}" placeholder="–" style="width:70px"></td><td class="num">${u}</td><td class="num ${l === 0 ? 'err' : ''}">${l === Infinity ? '∞' : l}</td></tr>`; }).join('')}</tbody></table>
      <div class="hint" style="margin-top:6px">${t('Fill in how many of each cable you have. Empty = not counted.', 'Vul in hoeveel je van elke kabel hebt. Leeg = niet geteld.')}</div>`;
  }
  function bindStock(root, rerender){
    root.querySelectorAll('.fibQty').forEach(i => i.onchange = () => { setQty(i.dataset.t, i.value === '' ? null : i.value); rerender(); });
  }
  function autoDialog(done){
    const types = nd().cableTypes.filter(ty => ty.medium !== 'cat');
    if(!types.length){ App.ui.toast(t('Make cable types first', 'Maak eerst kabeltypes'), 'info'); return; }
    const sg = suggestTypes();
    const opts = sel => types.map(ty => `<option value="${esc(ty.id)}" ${ty.id === sel ? 'selected' : ''}>${esc(code(ty.id))} · ${esc(typeName(ty))} (${leftOf(ty.id) === Infinity ? '∞' : leftOf(ty.id)} ${t('left', 'over')})</option>`).join('');
    const d = App.ui.openDialog({ title:t('Auto-assign fibres', 'Fibers automatisch koppelen'), width:'520px',
      body:`<div class="hint" style="margin:0 0 12px">${t('Switches inside one location are chained with the short cable; the locations are linked with the long cable. Free ports with the right connector are used first.', 'Switches binnen één locatie worden achter elkaar gekoppeld met de korte kabel; de locaties worden met de lange kabel gekoppeld. Vrije poorten met de juiste connector gaan eerst.')}</div>
        <label class="field">${t('Cable inside a location (switch to switch)', 'Kabel binnen een locatie (switch naar switch)')}<select id="auIntra">${opts(sg.intra)}</select></label>
        <label class="field">${t('Cable between locations', 'Kabel tussen locaties')}<select id="auInter">${opts(sg.inter)}</select></label>
        <label class="field">${t('Between locations', 'Tussen locaties')}<select id="auTopo"><option value="ring">${t('Ring (last back to first)', 'Ring (laatste terug naar eerste)')}</option><option value="chain">${t('Chain (in a line)', 'Ketting (op een rij)')}</option></select></label>
        <div id="auPrev" class="subtle" style="margin-top:8px"></div>`,
      footer:`<button data-a="c">${t('Cancel', 'Annuleren')}</button><button class="primary" data-a="ok">${t('Assign', 'Koppelen')}</button>` });
    const get = () => ({ topology:d.body.querySelector('#auTopo').value, intraType:d.body.querySelector('#auIntra').value, interType:d.body.querySelector('#auInter').value });
    const prev = () => { const r = autoAssign({ ...get(), dryRun:true }); d.body.querySelector('#auPrev').innerHTML = `${r.made.length} ${t('new fibres', 'nieuwe fibers')}${r.missing.length ? ` · <span style="color:var(--yellow)">${r.missing.length} ${t('missing in stock', 'te weinig voorraad')}</span>` : ''}${r.noPort.length ? ` · <span style="color:var(--yellow)">${r.noPort.length} ${t('without a free port', 'zonder vrije poort')}</span>` : ''}`; };
    d.body.querySelectorAll('select').forEach(x => x.onchange = prev); prev();
    d.footer.querySelector('[data-a=c]').onclick = () => d.close();
    d.footer.querySelector('[data-a=ok]').onclick = () => { const r = autoAssign(get()); d.close(); App.ui.toast(`${r.made.length} ${t('fibres coupled', 'fibers gekoppeld')}${r.missing.length ? ` · ${r.missing.length} ${t('short in stock', 'tekort in voorraad')}` : ''}${r.noPort.length ? ` · ${r.noPort.length} ${t('no free port', 'geen vrije poort')}` : ''}`); done?.(); };
  }

  window.Fibers = { fits, portClass, all, links, usage, matrix, card, bind, typeOf, typeName, endLabel, portName, color, lenOf, freePorts, stock, qtyOf, usedOf, leftOf, setQty, code, connClass, addLink, autoAssign, suggestTypes, stockCard, bindStock, autoDialog, fmtLen };
})();
