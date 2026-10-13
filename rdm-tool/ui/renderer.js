// renderer.js — the screen: fixture list, detail panel with every RDM setting, and the Align tool.
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = n => '0x' + n.toString(16).toUpperCase().padStart(4, '0');

const state = { devices: new Map(), selected: null, identifying: new Set(), align: null, busy: false };

async function call(name, ...args){
  const r = await window.rdm[name](...args);
  if(!r.ok) throw new Error(r.error);
  return r.result;
}
const status = t => { $('#status').textContent = t; };

// ---------- Modal dialogs (Electron has no prompt()) ----------
function dialog(html, onOpen){
  return new Promise(resolve => {
    $('#dialog').innerHTML = html;
    $('#modal').classList.remove('hidden');
    const close = v => { $('#modal').classList.add('hidden'); resolve(v); };
    $('#dialog').querySelectorAll('[data-close]').forEach(b => b.onclick = () => close(b.dataset.close === 'ok' ? (onOpen?.collect?.() ?? true) : null));
    onOpen?.init?.();
    $('#dialog').querySelector('input, select, button.primary')?.focus();
  });
}
const message = (title, body) => dialog(`<h2>${esc(title)}</h2><div>${body}</div><div class="actions"><button class="primary" data-close="ok">OK</button></div>`);
const confirmBox = (title, body, ok = 'Doorgaan') => dialog(`<h2>${esc(title)}</h2><div>${body}</div><div class="actions"><button data-close="cancel">Annuleren</button><button class="primary" data-close="ok">${esc(ok)}</button></div>`);

// ---------- Network ----------
async function loadInterfaces(){
  const list = await call('interfaces');
  $('#iface').innerHTML = list.map(i => `<option value="${esc(i.ip)}">${esc(i.name)} — ${esc(i.ip)}</option>`).join('') || '<option value="">Geen netwerk gevonden</option>';
  let saved = null; try { saved = localStorage.getItem('iface'); } catch {}
  if(saved && list.some(i => i.ip === saved)) $('#iface').value = saved;
  else { const two = list.find(i => /^(2|10)\./.test(i.ip)); if(two) $('#iface').value = two.ip; }
}
async function useInterface(){
  const ip = $('#iface').value;
  if(!ip) throw new Error('Geen netwerkkaart gekozen');
  try { localStorage.setItem('iface', ip); } catch {}
  await call('setInterface', ip);
}

async function busy(fn){
  if(state.busy) return;
  state.busy = true; document.querySelectorAll('.bar button').forEach(b => b.disabled = true);
  try { await fn(); } catch(e){ status(e.message); await message('Fout', esc(e.message)); }
  finally { state.busy = false; document.querySelectorAll('.bar button').forEach(b => b.disabled = false); }
}

$('#btnArtnet').onclick = () => busy(async () => {
  await useInterface();
  const list = await call('discoverArtnet', { full: $('#fullDisc').checked });
  setDevices(list);
});
$('#btnRdmnet').onclick = () => busy(async () => {
  await useInterface();
  const host = $('#broker').value.trim();
  const [h, p] = host.split(':');
  const list = await call('discoverRdmnet', { host: h || undefined, port: p ? Number(p) : undefined });
  setDevices(list);
});

window.rdm.on('status', status);
window.rdm.on('device', d => { state.devices.set(d.id, d); renderList(); });
window.rdm.on('devices', list => setDevices(list));
window.rdm.on('rdmnet', s => { const el = $('#rdmnetState'); el.className = 'pill ' + (s.connected ? 'on' : 'off'); el.textContent = s.connected ? 'RDMnet ' + s.host : 'RDMnet uit'; });
window.rdm.on('align', a => { const el = $('#alignLog'); if(el){ el.insertAdjacentHTML('beforeend', `<div>${esc(a.text)}</div>`); el.scrollTop = el.scrollHeight; } });

// ---------- Fixture list ----------
function setDevices(list){
  state.devices = new Map(list.map(d => [d.id, d]));
  const groups = [...new Set(list.map(d => d.group))].sort();
  const cur = $('#groupFilter').value;
  $('#groupFilter').innerHTML = '<option value="">Alle lampen</option>' + groups.map(g => `<option>${esc(g)}</option>`).join('');
  if(groups.includes(cur)) $('#groupFilter').value = cur;
  renderList();
}
// Fixtures in the chosen line, sorted by line and then by start address.
function visible(){
  const g = $('#groupFilter').value;
  return [...state.devices.values()].filter(d => !g || d.group === g)
    .sort((a, b) => a.group.localeCompare(b.group) || (a.address ?? 999) - (b.address ?? 999) || a.uid.localeCompare(b.uid));
}
$('#groupFilter').onchange = renderList;

function renderList(){
  const list = visible(), al = state.align;
  $('#empty').classList.toggle('hidden', list.length > 0);
  $('#devTable tbody').innerHTML = list.map(d => {
    const pos = al ? al.order.indexOf(d.id) : -1;
    const cls = [d.id === state.selected ? 'sel' : '', al && al.current === d.id ? 'blink' : '', pos >= 0 ? 'assigned' : ''].join(' ');
    const uni = d.pixeline ? `A ${d.artnetUniverse ?? '?'} / S ${d.sacnUniverse ?? '?'}` : (d.route.kind === 'artnet' ? `${d.route.portAddress}` : '');
    return `<tr data-id="${esc(d.id)}" class="${cls}">
      <td>${pos >= 0 ? pos + 1 : ''}</td>
      <td>${esc(d.model)}${d.pixeline ? ' <span class="pill on">Pixeline</span>' : ''}</td>
      <td>${esc(d.label)}</td><td class="mono">${esc(d.uid)}</td>
      <td>${d.error ? `<span class="err">${esc(d.error)}</span>` : esc(d.personalityName ? `${d.personality}: ${d.personalityName}` : d.personality ?? '')}</td>
      <td>${esc(d.address ?? '')}</td><td>${esc(d.footprint ?? '')}</td><td>${esc(uni)}</td>
      <td class="muted">${esc(d.group)}</td>
      <td><button class="small" data-ident="${esc(d.id)}">${state.identifying.has(d.id) ? 'Uit' : 'Aan'}</button></td></tr>`;
  }).join('');
  if(al) renderAlignBar();
}

$('#devTable tbody').onclick = async e => {
  const b = e.target.closest('button[data-ident]');
  if(b){
    e.stopPropagation();
    if(state.align) return;
    const id = b.dataset.ident, on = !state.identifying.has(id);
    try { await call('identify', id, on); on ? state.identifying.add(id) : state.identifying.delete(id); } catch(err){ status(err.message); }
    return renderList();
  }
  const tr = e.target.closest('tr[data-id]');
  if(tr){ state.selected = tr.dataset.id; renderList(); showDetail(tr.dataset.id); }
};

// ---------- Detail panel ----------
function editorHtml(p){
  const e = p.editor;
  if(p.readOnly || !e) return `<span class="val">${esc(p.value)}</span>`;
  if(e.type === 'select' && e.options){
    const opts = Object.entries(e.options);
    if(p.value != null && !opts.some(([k]) => Number(k) === p.value)) opts.push([p.value, `${p.value}`]);
    return `<select data-pid="${p.pid}">${opts.map(([k, v]) => `<option value="${esc(k)}" ${Number(k) === p.value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  }
  if(e.type === 'text') return `<input type="text" data-pid="${p.pid}" maxlength="${e.maxLength || 32}" value="${esc(p.value)}">`;
  return `<input type="number" data-pid="${p.pid}" min="${e.min ?? 0}" max="${e.max ?? ''}" value="${esc(p.value)}">`;
}

async function showDetail(id){
  const el = $('#detail');
  el.innerHTML = '<div class="empty">Instellingen uitlezen…</div>';
  let det;
  try { det = await call('details', id); } catch(e){ el.innerHTML = `<div class="warn">${esc(e.message)}</div>`; return; }
  if(state.selected !== id) return;
  const d = det.device; state.devices.set(d.id, d); renderList();
  const persOpts = d.personalities.map(p => `<option value="${p.n}" ${p.n === d.personality ? 'selected' : ''}>${p.n}: ${esc(p.name)} (${p.footprint ?? '?'} kan.)</option>`).join('');
  let html = `<h2>${esc(d.model)}</h2><div class="muted">${esc(d.manufacturer)} · <span class="mono">${esc(d.uid)}</span> · ${esc(d.group)}</div>
    <h3>DMX</h3>
    <div class="row"><span class="name">Mode</span><select id="dPers">${persOpts}</select><button data-set="pers">Zet</button></div>
    <div class="row"><span class="name">Startadres</span><input type="number" id="dAddr" min="1" max="512" value="${esc(d.address)}"><button data-set="addr">Zet</button></div>
    <div class="row"><span class="name">Identify</span><span class="val">${state.identifying.has(id) ? 'aan' : 'uit'}</span><button data-set="ident">${state.identifying.has(id) ? 'Uit' : 'Aan'}</button></div>`;
  if(det.network){
    const n = det.network, st = n.static || n.current;
    html += `<h3>Netwerk (Pixeline IP)</h3>
      <div class="row"><span class="name">Huidig IP</span><span class="val mono">${esc(n.current ? `${n.current.ip}/${n.current.mask}${n.current.dhcp ? ' (DHCP)' : ''}` : 'onbekend')}</span><span></span></div>
      <div class="row"><span class="name">Vast IP</span><span class="val"><input type="text" id="dIp" value="${esc(st?.ip ?? '')}" class="ipinput"> / <input type="number" id="dMask" min="1" max="32" value="${esc(st?.mask ?? 8)}" class="maskinput"></span><button data-set="ip">Zet</button></div>`;
  }
  html += '<h3>Instellingen</h3>';
  html += det.params.map(p => `<div class="row ${p.error ? 'error' : ''}"><span class="name" title="${hex(p.pid)}">${esc(p.name)}</span>
    ${p.error ? `<span class="val">${esc(p.error)}</span>` : editorHtml(p)}
    ${!p.readOnly && !p.error && p.editor ? `<button data-pidset="${p.pid}">Zet</button>` : '<span></span>'}
    ${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}</div>`).join('') || '<div class="muted">Geen extra instellingen.</div>';
  if(det.sensors.length){
    html += '<h3>Sensoren</h3>' + det.sensors.map(s => `<div class="row"><span class="name">${esc(s.name)}</span><span class="val">${esc(s.value)} ${esc(s.unit)}</span><span></span></div>`).join('');
  }
  html += `<h3>Overig</h3><div class="row"><span class="name">Herstarten</span><span class="val muted">Lamp opnieuw opstarten</span><button class="danger" data-set="reset">Reset</button></div>`;
  el.innerHTML = html;

  el.onclick = async e => {
    const b = e.target.closest('button'); if(!b) return;
    try {
      if(b.dataset.set === 'pers') await call('setParam', id, 0x00E0, Number($('#dPers').value));
      else if(b.dataset.set === 'addr') await call('setParam', id, 0x00F0, Number($('#dAddr').value));
      else if(b.dataset.set === 'ident'){ const on = !state.identifying.has(id); await call('identify', id, on); on ? state.identifying.add(id) : state.identifying.delete(id); }
      else if(b.dataset.set === 'reset'){ if(!await confirmBox('Lamp herstarten?', 'De lamp start opnieuw op.', 'Herstarten')) return; await call('reset', id); status('Reset gestuurd'); return; }
      else if(b.dataset.set === 'ip'){
        if(!await confirmBox('IP-adres wijzigen?', 'Na het wijzigen van het IP-adres is de lamp mogelijk niet meer bereikbaar op het oude adres. Zoek daarna opnieuw.', 'Wijzigen')) return;
        await call('setParam', id, 0x0706, { ip: $('#dIp').value.trim(), mask: Number($('#dMask').value) });
        status('IP-adres gestuurd. Zoek opnieuw om de lamp op het nieuwe adres te vinden.'); return;
      } else if(b.dataset.pidset){
        const pid = Number(b.dataset.pidset), input = el.querySelector(`[data-pid="${pid}"]`);
        const v = input.type === 'text' ? input.value : Number(input.value);
        if((pid === 0xA034 || pid === 0xA035) && !await confirmBox('Universe wijzigen?', 'De lamp luistert daarna op een andere universe. De app volgt dit voor Art-Net, maar zoek bij twijfel opnieuw.', 'Wijzigen')) return;
        await call('setParam', id, pid, v);
      }
      status('Ingesteld'); showDetail(id);
    } catch(err){ await message('Niet gelukt', esc(err.message)); }
  };
}

// ---------- Align tool ----------
// Candidates are the fixtures of the chosen line. Next / Previous move identify along the fixtures
// that have no place yet; Align gives the blinking one the next place in the rig.
$('#btnAlign').onclick = async () => {
  if(state.align) return;
  const list = visible().filter(d => !d.error);
  if(!list.length) return message('Align', 'Er staan geen lampen in deze lijn.');
  for(const id of state.identifying){ try { await call('identify', id, false); } catch {} }
  state.identifying.clear();
  state.align = { candidates: list.map(d => d.id), order: [], current: null };
  $('#alignBar').classList.remove('hidden');
  $('#groupFilter').disabled = true; $('#btnAlign').disabled = true;
  await moveTo(list[0].id);
};

const unassigned = () => state.align.candidates.filter(id => !state.align.order.includes(id));

async function moveTo(id){
  const al = state.align, prev = al.current;
  al.current = id; renderList();
  if(prev && prev !== id){ try { await call('identify', prev, false); } catch(e){ status(e.message); } }
  if(id){ try { await call('identify', id, true); } catch(e){ status('Identify: ' + e.message); } }
}
function step(dir){
  const free = unassigned();
  if(!free.length) return;
  const i = free.indexOf(state.align.current);
  moveTo(free[(i + dir + free.length) % free.length]);
}
$('#alNext').onclick = () => step(1);
$('#alPrev').onclick = () => step(-1);
$('#alAlign').onclick = async () => {
  const al = state.align; if(!al?.current) return;
  const free = unassigned(), i = free.indexOf(al.current);
  al.order.push(al.current);
  const rest = free.filter(id => id !== al.current);
  await moveTo(rest.length ? rest[Math.min(i, rest.length - 1)] : null);
  if(!rest.length) status('Alle lampen staan op volgorde. Klik op Klaar.');
};
$('#alUndo').onclick = async () => { const al = state.align; if(!al?.order.length) return; await moveTo(al.order.pop()); };
$('#alStop').onclick = () => endAlign();

async function endAlign(){
  const al = state.align; if(!al) return;
  if(al.current){ try { await call('identify', al.current, false); } catch {} }
  state.align = null;
  $('#alignBar').classList.add('hidden'); $('#groupFilter').disabled = false; $('#btnAlign').disabled = false;
  renderList();
}

function renderAlignBar(){
  const al = state.align, cur = al.current && state.devices.get(al.current);
  $('#alignCurrent').textContent = cur ? `${cur.model} ${cur.label ? '“' + cur.label + '” ' : ''}(${cur.uid})` : 'geen — alle lampen hebben een plek';
  $('#alignCount').textContent = `${al.order.length} van ${al.candidates.length} op volgorde gezet`;
  $('#alignOrder').innerHTML = al.order.map(id => { const d = state.devices.get(id); return `<li>${esc(d?.model)} <span class="mono">${esc(d?.uid)}</span></li>`; }).join('');
  $('#alAlign').disabled = !al.current; $('#alUndo').disabled = !al.order.length; $('#alDone').disabled = !al.order.length;
}

$('#alDone').onclick = async () => {
  const al = state.align; if(!al?.order.length) return;
  const left = unassigned().length;
  if(left && !await confirmBox('Niet alle lampen staan op volgorde', `${left} lamp(en) hebben nog geen plek en worden niet aangepast.`)) return;
  const order = [...al.order], devs = order.map(id => state.devices.get(id));

  // 1. Start address (and, with Pixelines in the line, the universes to start from)
  const px = devs.find(d => d.pixeline);
  const start = await dialog(`<h2>Beginadres</h2>
    <div class="field"><label>Welk beginadres heeft je eerste fixture?</label><input type="number" id="stAddr" min="1" max="512" value="1"></div>
    ${px ? `<div class="field"><label>Art-Net universe van de eerste Pixeline</label><input type="number" id="stArt" min="0" max="32767" value="${esc(px.artnetUniverse ?? 0)}"></div>
    <div class="field"><label>sACN universe van de eerste Pixeline</label><input type="number" id="stSacn" min="1" max="32000" value="${esc(px.sacnUniverse ?? 1)}"></div>
    <div class="muted">Komt een Pixeline boven adres 512, dan gaat hij door in de volgende universe (Art-Net en sACN +1) op adres 1.</div>` : ''}
    <div class="actions"><button data-close="cancel">Annuleren</button><button class="primary" data-close="ok">Volgende</button></div>`,
    { collect: () => ({ address: Number($('#stAddr').value), artnet: px ? $('#stArt').value : '', sacn: px ? $('#stSacn').value : '' }) });
  if(!start) return;

  // 2. Mode per fixture type
  const types = [];
  for(const d of devs) if(!types.some(t => t.typeKey === d.typeKey)) types.push(d);
  const modes = {};
  for(const t of types){
    const n = devs.filter(d => d.typeKey === t.typeKey).length;
    const m = await dialog(`<h2>Mode voor ${esc(t.model)}</h2><div class="muted">${n} lamp(en) van dit type</div>
      <div class="modes">${t.personalities.map(p => `<label><input type="radio" name="mode" value="${p.n}" ${p.n === t.personality ? 'checked' : ''}> ${p.n}: ${esc(p.name)} — ${p.footprint ?? '?'} kanalen</label>`).join('')}</div>
      <div class="actions"><button data-close="cancel">Annuleren</button><button class="primary" data-close="ok">Volgende</button></div>`,
      { collect: () => Number(document.querySelector('input[name=mode]:checked')?.value) });
    if(!m) return;
    modes[t.typeKey] = m;
  }

  // 3. Check the plan, then write it
  const job = { order, start, modes };
  let plan;
  try { plan = await call('planAlign', job); } catch(e){ return message('Niet gelukt', esc(e.message)); }
  if(!plan.complete) return message('Gestopt', plan.warnings.map(w => `<div class="warn">${esc(w)}</div>`).join('') + '<div>Er is niets aangepast.</div>');
  const last = plan.plan[plan.plan.length - 1];
  if(!await confirmBox('Adresseren', `${plan.plan.length} lamp(en): adres ${plan.plan[0].address} t/m ${last.address + last.footprint - 1}${last.universeStep ? ` (verdeeld over ${last.universeStep + 1} universes)` : ''}. Ook worden de overige instellingen van de eerste lamp per type naar de andere lampen van dat type gekopieerd.`, 'Adresseren')) return;

  $('#dialog').innerHTML = '<h2>Bezig met adresseren…</h2><div class="log" id="alignLog"></div>';
  $('#modal').classList.remove('hidden');
  let res;
  try { res = await call('runAlign', job); } catch(e){ res = { done: 0, warnings: [], errors: [e.message] }; }
  await endAlign();
  await message('Klaar', `${res.done} lamp(en) geadresseerd.` + [...res.warnings, ...res.errors].map(w => `<div class="warn">${esc(w)}</div>`).join(''));
  if(state.selected) showDetail(state.selected);
};

loadInterfaces().catch(e => status(e.message));
