// ui/align.js — the Align tool: find the devices, make each one blink, say which device of the plan it is, then send everything.
//
//   1  Find      look for every LumiNode and GigaCore on the network (the same discovery as Network Config)
//   2  Align     the next device blinks (screen and port lights on a GigaCore, the LEDs of a LumiNode); the person standing at the rack
//                points at the place in the plan ("DB3 switch 1"), the link is made and the next one blinks
//   3  Send      names, IP addresses, VLANs and universes of the plan go to all linked devices in one go
//
// It uses the engine of Network Config (state, discovery, planning, sending), so both always agree. Network Config stays as it is,
// for working on a single device or port.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const NC = () => window.NetConfig;
  const A = { phase:'find', cur:null, skipped:new Set(), history:[], blink:true, busy:false, err:'', filled:false };
  let R = null;

  const isSw = d => d.kind === 'gigacore';
  const ipNum = ip => String(ip).split('.').reduce((n, x) => n * 256 + Number(x), 0);
  const devs = () => [...NC().state.dev.values()].filter(d => d.kind !== 'unknown').sort((a, b) => (isSw(a) ? 0 : 1) - (isSw(b) ? 0 : 1) || ipNum(a.ip) - ipNum(b.ip));
  // the devices that still have a free place in the plan come first; devices the plan has no place for wait at the end
  const queue = () => { const q = devs().filter(d => !d.link && !A.skipped.has(d.ip)), fit = d => freeItems(d).length > 0; return [...q.filter(fit), ...q.filter(d => !fit(d))]; };
  const freeItems = d => NC().planItems().filter(x => x.kind === (isSw(d) ? 'sw' : 'nd') && !devs().some(y => y.link === x.id));
  const nameOf = d => d.name || d.model || (isSw(d) ? 'GigaCore' : 'LumiNode');

  // ---- make a device blink ----
  async function blink(d, on){
    if(!d) return;
    try { const h = NC().transport(d.ip);
      if(isSw(d)) await h('PUT', '/api/identify', { duration:on ? 60 : 0 });
      else if(on) await h('POST', '/api/identify', {});
      A.err = '';
    } catch(x) { A.err = `${t('Could not make', 'Kon')} ${d.ip} ${t('blink', 'niet laten knipperen')}: ${String(x.message || x)}`; }
  }
  async function stopAll(){ for(const d of devs()) if(isSw(d) && d.blinking){ d.blinking = false; await blink(d, false); } }
  async function showCurrent(){
    const q = queue(); A.cur = q.find(d => d.ip === A.cur)?.ip || q[0]?.ip || null;
    const d = A.cur && NC().dev(A.cur);
    for(const o of devs()) if(o !== d && o.blinking){ o.blinking = false; if(isSw(o)) await blink(o, false); }
    if(d && A.blink){ d.blinking = true; await blink(d, true); }
    paint();
  }

  // ---- actions ----
  async function find(){
    A.busy = true; A.err = ''; paint();
    const iv = setInterval(paint, 300);                 // devices appear one by one while the search runs
    try { await NC().discover(); } catch(x) { A.err = String(x.message || x); }
    clearInterval(iv); A.busy = false; A.phase = 'find'; paint();
  }
  async function link(d, it){
    A.history.push({ ip:d.ip, prev:d.link }); d.link = it.id; d.blinking = false;
    if(isSw(d)) await blink(d, false);
    A.cur = null; await showCurrent();
  }
  async function undo(){
    const h = A.history.pop(); if(!h) return; const d = NC().dev(h.ip); if(d) d.link = h.prev || null; A.skipped.delete(h.ip); A.cur = h.ip; await showCurrent();
  }
  async function skip(d){ A.skipped.add(d.ip); if(isSw(d)) await blink(d, false); d.blinking = false; A.cur = null; await showCurrent(); }
  async function fillAll(){
    A.busy = true; paint();
    NC().state.withIp = !!A.withIp; NC().state.withNames = A.withNames !== false;
    for(const d of devs()) if(d.link){ if(!d.cur) await NC().readDev(d); d.E = new Map(); d.dev = {}; NC().fillFromPlan(d); }
    A.filled = true; A.moves = await NC().moveWarnings(devs().filter(d => d.link && d.cur)); A.busy = false; paint();
  }
  async function prepare(){
    const need = (A.moves || []).filter(m => !m.reachable); if(!need.length) return;
    const r = await NC().addAddresses(need);
    if(!r.ok) App.ui.toast(`${t('Could not add the address', 'Kon het adres niet toevoegen')}: ${r.error}`, 'err', { ms:8000 });
    else App.ui.toast(`${t('Addresses added to this computer', 'Adressen toegevoegd aan deze computer')}: ${r.adds.map(a => a.ip).join(', ')}`, 'ok');
    A.moves = await NC().moveWarnings(devs().filter(d => d.link && d.cur)); paint();
  }
  async function send(){
    const list = devs().filter(d => d.link && d.cur);
    await NC().applyDevs(list);
    paint();
  }

  // ---- screen ----
  const steps = () => [['find', t('1 · Find', '1 · Zoeken')], ['align', t('2 · Align', '2 · Uitlijnen')], ['send', t('3 · Send', '3 · Sturen')]];
  function bodyFind(){
    const C = NC().state, n = devs();
    return `<div class="su-big">${n.length ? `<b>${n.length}</b> ${t('devices found', 'apparaten gevonden')} · ${n.filter(isSw).length} GigaCore · ${n.filter(d => !isSw(d)).length} LumiNode` : t('Nothing searched yet.', 'Nog niet gezocht.')}</div>
      <div class="su-row"><label>${t('Look in', 'Zoek in')}<input id="alRanges" value="${esc(C.ranges)}" placeholder="${t('empty = the network of this computer', 'leeg = het netwerk van deze computer')}" style="width:300px"></label>
        <label>${t('User', 'Gebruiker')}<input id="alUser" value="${esc(C.user)}" style="width:110px"></label><label>${t('Password', 'Wachtwoord')}<input id="alPass" type="password" value="${esc(C.pass)}" style="width:130px"></label></div>
      <div class="su-row"><button class="primary" id="alFind" ${A.busy ? 'disabled' : ''}>${I('refresh', 14)}${A.busy ? t('Searching…', 'Zoeken…') : t('Search the network', 'Zoek in het netwerk')}</button>${n.length ? `<button id="alToAlign">${t('Next: align', 'Verder: uitlijnen')}</button>` : ''}</div>
      ${C.info ? `<div class="subtle">${esc(C.info)}</div>` : ''}
      <div class="su-list">${n.map(d => `<div class="su-item"><b>${esc(nameOf(d))}</b><span class="subtle">${esc(d.ip)} · ${isSw(d) ? 'GigaCore' : 'LumiNode'}</span></div>`).join('')}</div>`;
  }
  function bodyAlign(){
    const all = devs(), done = all.filter(d => d.link).length, q = queue(), d = A.cur && NC().dev(A.cur);
    const bar = `<div class="su-big"><b>${done}</b> / ${all.length} ${t('linked', 'gekoppeld')}${A.skipped.size ? ` · ${A.skipped.size} ${t('skipped', 'overgeslagen')}` : ''}</div>`;
    if(!all.length) return `<div class="su-warn">${I('alert', 13)} ${t('Search the network first (step 1).', 'Zoek eerst in het netwerk (stap 1).')}</div>`;
    if(!d) return `${bar}<div class="su-big"><b>${t('Every device has its place.', 'Elk apparaat heeft zijn plek.')}</b></div>
      <div class="su-row"><button class="primary" id="alToSend">${t('Next: send the configuration', 'Verder: configuratie sturen')}</button>${A.history.length ? `<button id="alUndo">${t('Undo last link', 'Laatste koppeling ongedaan')}</button>` : ''}${A.skipped.size ? `<button id="alUnskip">${t('Take skipped ones again', 'Overgeslagen apparaten opnieuw')}</button>` : ''}</div>`;
    const items = freeItems(d), guess = items.find(x => x.ip && x.ip === d.ip) || items[0];
    const byDc = {}; items.forEach(x => (byDc[x.dc] ||= []).push(x));
    return `${bar}<div class="al-now"><div class="al-blink ${A.blink ? 'on' : ''}"></div><div><b style="font-size:18px">${esc(nameOf(d))}</b> <span class="subtle">${esc(d.ip)}${d.model ? ' · ' + esc(d.model) : ''}</span>
        <div>${A.blink ? t('This device is blinking now (screen and port lights, or the LEDs). Go to the device and say what it is:', 'Dit apparaat knippert nu (scherm en poortlampjes, of de LED\'s). Ga naar het apparaat en geef aan wat het is:') : t('Blinking is off.', 'Knipperen staat uit.')}</div></div></div>
      <div class="su-row"><button id="alBlink">${I('refresh', 13)}${t('Blink again', 'Laat opnieuw knipperen')}</button><button id="alSkip">${t('Skip this device', 'Dit apparaat overslaan')}</button>${A.history.length ? `<button id="alUndo">${t('Undo last link', 'Laatste koppeling ongedaan')}</button>` : ''}${done ? `<button id="alToSend">${t('Go on to send →', 'Door naar sturen →')}</button>` : ''}
        <label class="nc-chk"><input type="checkbox" id="alAuto" ${A.blink ? 'checked' : ''}> ${t('blink automatically', 'automatisch laten knipperen')}</label></div>
      ${A.err ? `<div class="su-warn">${I('alert', 13)} ${esc(A.err)}</div>` : ''}
      <div class="rb-label">${isSw(d) ? t('Which switch of the plan is this?', 'Welke switch uit het plan is dit?') : t('Which node of the plan is this?', 'Welke node uit het plan is dit?')}</div>
      ${items.length ? Object.keys(byDc).map(dc => `<div class="al-dc"><i class="dot" style="background:${App.dimColor(dc)}"></i><b>${esc(dc)}</b></div><div class="al-items">${byDc[dc].map(x => `<button class="al-item ${x === guess ? 'guess' : ''}" data-alpick="${esc(x.id)}">${esc(x.label)}${x.ip ? `<span class="subtle">${esc(x.ip)}</span>` : ''}</button>`).join('')}</div>`).join('')
        : `<div class="su-warn">${I('alert', 13)} ${t('The plan has no free place of this kind left. Add one in the Network step, or skip this device.', 'Het plan heeft geen vrije plek van dit soort meer. Voeg er een toe bij de stap Netwerk, of sla dit apparaat over.')}</div>`}
      <div class="hint" style="margin-top:10px">${I('info', 13)} ${q.length - 1 > 0 ? `${q.length - 1} ${t('more to go', 'nog te gaan')}. ` : ''}${t('The suggestion (orange) is the first free place in the plan, or the one with the same IP address.', 'Het voorstel (oranje) is de eerste vrije plek in het plan, of die met hetzelfde IP-adres.')}</div>`;
  }
  function moveBox(){
    const mv = A.moves || []; if(!mv.length) return '';
    const bad = mv.filter(m => !m.reachable);
    return `<div class="${bad.length ? 'su-warn' : 'hint'}">${I(bad.length ? 'alert' : 'info', 13)} <b>${mv.length}</b> ${t('devices get a new IP address.', 'apparaten krijgen een nieuw IP-adres.')} ${t('Everything else is sent to all devices first; then the addresses go to all devices at the same moment, and each device is checked at its new address.', 'Eerst gaat al het andere naar alle apparaten; daarna gaan de adressen op hetzelfde moment naar alle apparaten en wordt elk apparaat op zijn nieuwe adres gecontroleerd.')}
      ${bad.length ? `<div style="margin-top:6px">${t('This computer has no address in the range of', 'Deze computer heeft geen adres in het bereik van')} <b>${bad.map(m => esc(m.to)).slice(0, 6).join(', ')}${bad.length > 6 ? ' …' : ''}</b>. ${t('After the change it can no longer see them. Add addresses to this computer first (the system asks permission); you can still send without, then the devices are just not read back.', 'Na de wijziging ziet hij ze niet meer. Voeg eerst adressen toe aan deze computer (het systeem vraagt toestemming); je kunt ook zonder sturen, dan worden de apparaten alleen niet teruggelezen.')} <button class="sm" id="alPrep">${t('Add addresses to this computer', 'Adressen toevoegen aan deze computer')}</button></div>` : `<div class="subtle">${t('This computer can reach all the new addresses.', 'Deze computer kan alle nieuwe adressen bereiken.')}</div>`}</div>`;
  }
  function bodySend(){
    const C = NC().state, l = devs().filter(d => d.link), unl = devs().filter(d => !d.link);
    if(!l.length) return `<div class="su-warn">${I('alert', 13)} ${t('Nothing is linked yet (step 2).', 'Er is nog niets gekoppeld (stap 2).')}</div>`;
    const rows = l.map(d => { const it = NC().planItems().find(x => x.id === d.link), n = d.cur ? NC().changeCount(d) : 0;
      return `<tr><td>${esc(it?.label || '?')}</td><td>${esc(nameOf(d))}</td><td>${esc(d.ip)}</td><td>${A.filled ? `<b>${n}</b> ${t('changes', 'wijzigingen')}` : '–'}${d.err ? `<div class="su-warn">${esc(d.err)}</div>` : ''}</td><td>${d.verified ? I('check', 14) : ''}</td></tr>`; }).join('');
    return `<div class="su-big"><b>${l.length}</b> ${t('devices linked', 'apparaten gekoppeld')}${unl.length ? ` · ${unl.length} ${t('not linked (they are left alone)', 'niet gekoppeld (die blijven ongemoeid)')}` : ''}</div>
      <label class="nc-chk"><input type="checkbox" id="alNames" ${A.withNames !== false ? 'checked' : ''}> ${t('Also set the port names of the plan (off: the names on the devices stay)', 'Zet ook de poortnamen van het plan (uit: de namen op de apparaten blijven)')}</label>
      <label class="nc-chk"><input type="checkbox" id="alIp" ${A.withIp ? 'checked' : ''}> ${t('Also set the IP addresses of the plan (the device moves to its new address; do this when the network is new)', 'Ook de IP-adressen uit het plan instellen (het apparaat gaat naar zijn nieuwe adres; doe dit bij een nieuw netwerk)')}</label>
      ${moveBox()}
      <div class="su-row"><button id="alFill" ${A.busy ? 'disabled' : ''}>${t('1 · Fill in from the plan', '1 · Invullen uit het plan')}</button><button class="primary" id="alSend" ${A.filled ? '' : 'disabled'}>${I('upload', 14)}${t('2 · Send config', '2 · Config sturen')}</button></div>
      <table class="data-table"><thead><tr><th>${t('Place in the plan', 'Plek in het plan')}</th><th>${t('Device', 'Apparaat')}</th><th>IP</th><th>${t('To send', 'Te sturen')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="hint" style="margin-top:10px">${I('info', 13)} ${t('“Fill in” puts names, VLANs, ports and universes of the plan on the devices; nothing is sent yet. “Send config” sends at once and then shows in a window what was changed.', '“Invullen” zet namen, VLAN’s, poorten en universes uit het plan op de apparaten; er wordt nog niets gestuurd. “Config sturen” stuurt meteen en toont daarna in een venster wat er is aangepast.')}</div>`;
  }
  function paint(){
    if(!R) return;
    R.querySelector('#alSteps').innerHTML = `<div class="su-steps">${steps().map(([id, label]) => `<button class="su-step ${A.phase === id ? 'on' : ''}" data-alphase="${id}"><span class="su-t"><b>${esc(label)}</b></span></button>`).join('')}</div>`;
    const body = A.phase === 'find' ? bodyFind() : A.phase === 'align' ? bodyAlign() : bodySend();
    const head = { find:[t('Find the devices', 'De apparaten zoeken'), t('Search the network for every LumiNode and GigaCore.', 'Zoek in het netwerk naar elke LumiNode en GigaCore.')],
      align:[t('Align: which device is which?', 'Uitlijnen: welk apparaat is welk?'), t('One device at a time blinks. You see which one it is and pick its place in the plan.', 'Steeds knippert één apparaat. Jij ziet welke het is en kiest zijn plek in het plan.')],
      send:[t('Send the configuration', 'De configuratie sturen'), t('Names, IP addresses, VLANs and universes of the plan go to the linked devices.', 'Namen, IP-adressen, VLAN\'s en universes uit het plan gaan naar de gekoppelde apparaten.')] }[A.phase];
    R.querySelector('#alMain').innerHTML = `<div class="su-card"><div class="su-head">${I('compass', 20)}<div><h2>${esc(head[0])}</h2><p>${esc(head[1])}</p></div></div><div class="su-content">${body}</div></div>`;
    bind();
  }
  function bind(){
    const q = s => R.querySelector(s), qa = s => [...R.querySelectorAll(s)];
    qa('[data-alphase]').forEach(b => b.onclick = async () => { A.phase = b.dataset.alphase; if(A.phase === 'align') await showCurrent(); else { await stopAll(); paint(); } });
    const set = (id, fn) => { const e = q(id); if(e) e.onclick = fn; };
    set('#alFind', async () => { const C = NC().state; C.ranges = q('#alRanges').value.trim(); C.user = q('#alUser').value.trim() || 'admin'; C.pass = q('#alPass').value; await find(); });
    set('#alToAlign', async () => { A.phase = 'align'; await showCurrent(); });
    set('#alToSend', async () => { A.phase = 'send'; await stopAll(); paint(); });
    set('#alUndo', undo); set('#alUnskip', async () => { A.skipped.clear(); await showCurrent(); });
    set('#alBlink', () => { const d = NC().dev(A.cur); if(d){ d.blinking = true; blink(d, true).then(paint); } });
    set('#alSkip', () => skip(NC().dev(A.cur)));
    const au = q('#alAuto'); if(au) au.onchange = async () => { A.blink = au.checked; if(!A.blink) await stopAll(); else await showCurrent(); paint(); };
    qa('[data-alpick]').forEach(b => b.onclick = () => link(NC().dev(A.cur), NC().planItems().find(x => x.id === b.dataset.alpick)));
    const nm = q('#alNames'); if(nm) nm.onchange = () => { A.withNames = nm.checked; A.filled = false; paint(); };
    const ip = q('#alIp'); if(ip) ip.onchange = () => { A.withIp = ip.checked; A.filled = false; A.moves = null; paint(); };
    set('#alFill', fillAll); set('#alSend', send); set('#alPrep', prepare);
  }

  async function close(){ await stopAll(); document.removeEventListener('keydown', onKey, true); R?.remove(); R = null; }
  const onKey = e => { if(e.key === 'Escape' && R && !document.querySelector('.modal-backdrop')){ e.stopPropagation(); close(); } };
  async function open(opts = {}){
    if(!App.getMODEL?.()) return;
    document.getElementById('alRoot')?.remove();
    A.phase = opts.phase || (devs().length ? 'align' : 'find'); A.cur = null; A.skipped = new Set(); A.history = []; A.filled = false; A.err = ''; if(A.withIp === undefined) A.withIp = true;
    R = document.createElement('div'); R.id = 'alRoot'; R.className = 'rb';
    R.innerHTML = `<div class="rb-top"><div class="rb-title">${I('compass', 18)}<div><b>${t('Align tool', 'Uitlijntool')}</b><span>${t('find · blink · link · send', 'zoeken · knipperen · koppelen · sturen')}</span></div></div><div class="rb-top-actions"><button class="primary" id="alStop">${t('Close', 'Sluiten')}</button></div></div>
      <div class="rb-body su-body"><aside class="rb-panel"><div class="rb-panel-body" id="alSteps"></div></aside><section class="su-main" id="alMain"></section></div>`;
    document.body.appendChild(R); document.addEventListener('keydown', onKey, true);
    R.querySelector('#alStop').onclick = close;
    if(A.phase === 'align') await showCurrent(); else paint();
  }
  window.Align = { open, close, state:A };
})();
