// ui/device-builder.js
// Device Builder: node, splitter, switch and panel types, and 19" racks built from them.
// Everything saved here goes into the open project and is mirrored to the personal library
// (core/library.js), so devices are available in every show and can be shared with colleagues.
const App = window.LKApp;
const { esc, safeHex, nextTypedId, isValidIpv4, bindIpv4Input } = App.net;
const I = (n, s) => App.ui.icon(n, s);
const Lib = () => window.Library;

const KINDS = {
  node:     { key:'nodeTypes',     label:'Nodes',     one:'Node',     prefix:'NODE:',   icon:'network',   color:'#4ea8ff' },
  splitter: { key:'splitterTypes', label:'Splitters', one:'Splitter', prefix:'SPLIT:',  icon:'cable',     color:'#FFC107' },
  switch:   { key:'switchTypes',   label:'Switches',  one:'Switch',   prefix:'SWITCH:', icon:'switchDev', color:'#35c47c' },
  panel:    { key:'panelTypes',    label:'Panels',    one:'Panel',    prefix:'PANEL:',  icon:'panel',     color:'#b18cff' },
  cable:    { key:'cableTypes',    label:'Cables',    one:'Cable',    prefix:'CABLE:',  icon:'cable',     color:'#22c3d6' },
  rack:     { key:'rackTypes',     label:'Racks',     one:'Rack',     prefix:'RACK:',   icon:'rack' }
};
const DEVICE_KINDS = ['node', 'splitter', 'switch', 'panel'];
const RACK_HEIGHTS = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 44, 48];

const F_ID     = { k:'id', label:'Type key', type:'id' };
const F_BRAND  = { k:'brand', label:'Brand', type:'text', ph:'Luminex / ELC / …' };
const F_IP     = { k:'defaultIp', label:'Default IP', type:'ip', ph:'optional' };
const F_SUBNET = { k:'subnet', label:'Subnet', type:'ip', def:'255.255.255.0' };
const F_HEIGHT = { k:'heightU', label:'Height (U)', type:'number', min:1, max:8, def:1 };
const F_COLOR  = kind => ({ k:'color', label:'Color', type:'color', def:KINDS[kind].color });
const CONNECTORS = ['opticalCON DUO', 'opticalCON QUAD', 'opticalCON ADVANCED', 'FiberFox', 'LC duplex', 'SC duplex', 'SFP (LC)', 'SFP DAC', 'RJ45'];
const MEDIUM = { smf:'Singlemode', mmf:'Multimode', dac:'SFP patch / DAC', cat:'Cat' };
const FIELDS = {
  node: [F_ID, F_BRAND, { k:'name', label:'Type', type:'text', ph:'LumiNode 12' },
    { k:'portCount', label:'DMX ports', type:'number', min:1, max:64, def:8 },
    { k:'ethernetCount', label:'Ethernet ports', type:'select', def:'1', options:[['1', '1× RJ45'], ['2', '2× RJ45 (link + redundant)']] },
    { k:'width', label:'Width in the rack', type:'select', def:'full', options:[['full', 'Full 19″'], ['half', 'Half 19″ — two side by side; a blind plate fills the rest']] },
    F_IP, F_SUBNET, F_HEIGHT, F_COLOR('node')],
  splitter: [F_ID, F_BRAND, { k:'name', label:'Type', type:'text', ph:'10 output splitter' },
    { k:'mode', label:'Input', type:'select', def:'A', options:[['A', 'Single input'], ['AB', 'A/B input']] },
    { k:'outputCount', label:'Outputs', type:'number', min:1, max:64, def:10 },
    { k:'switching', label:'Switching', type:'select', def:'independent', options:[['independent', 'Every output independent'], ['paired', 'Outputs paired per 2']] },
    F_IP, F_SUBNET, F_HEIGHT, F_COLOR('splitter')],
  switch: [F_ID, F_BRAND, { k:'name', label:'Type', type:'text', ph:'GigaCore 16Xt' },
    { k:'portCount', label:'RJ45 ports', type:'number', min:1, max:96, def:16 },
    { k:'sfpCount', label:'SFP / fibre ports', type:'number', min:0, max:16, def:2 },
    { k:'jack', label:'Copper port jack', type:'select', def:'RJ45', options:[['RJ45', 'RJ45'], ['etherCON', 'etherCON']] },
    { k:'frontCount', label:'Ports on the front (0 = all; the rest go to a panel)', type:'number', min:0, max:96, def:0 },
    { k:'sfpConnectors', label:'Fibre connector per port, in order (numbers continue after the copper ports)', type:'text', ph:'opticalCON DUO, opticalCON DUO, FiberFox DUO, FiberFox DUO' },
    F_IP, F_SUBNET, F_HEIGHT, F_COLOR('switch')],
  cable: [F_ID, F_BRAND, { k:'name', label:'Type', type:'text', ph:'opticalCON DUO 4-core' },
    { k:'medium', label:'Medium', type:'select', def:'smf', options:[['smf', 'Fibre, singlemode'], ['mmf', 'Fibre, multimode'], ['dac', 'SFP patch / DAC (short)'], ['cat', 'Copper Cat (RJ45)']] },
    { k:'cores', label:'Cores', type:'number', min:1, max:48, def:4 },
    { k:'connA', label:'Connector end A', type:'combo', ph:'opticalCON DUO', list:CONNECTORS },
    { k:'connB', label:'Connector end B', type:'combo', ph:'opticalCON DUO', list:CONNECTORS },
    { k:'lengthM', label:'Length (m)', type:'number', dec:true, min:0.5, max:2000, def:50 },
    { k:'articleKey', label:'Article key', type:'text', ph:'optional' },
    F_COLOR('cable')],
  panel: [F_ID, F_BRAND, { k:'name', label:'Name', type:'text', ph:'LK panel 3×' },
    { k:'lkCount', label:'LK7-1 sockets', type:'number', min:0, max:12, def:3 },
    { k:'vimCount', label:'Veam4 sockets', type:'number', min:0, max:12, def:0 },
    { k:'xlrCount', label:'XLR 5-pin', type:'number', min:0, max:48, def:0 },
    { k:'etherconCount', label:'etherCON', type:'number', min:0, max:48, def:0 },
    { k:'etherconFirst', label:'First etherCON number', type:'number', min:1, max:96, def:1 },
    { k:'opticalConCount', label:'opticalCON DUO', type:'number', min:0, max:12, def:0 },
    { k:'fiberfoxCount', label:'FiberFox DUO', type:'number', min:0, max:12, def:0 },
    { k:'fibreFirst', label:'First fibre port number', type:'number', min:1, max:96, def:17 },
    F_HEIGHT, F_COLOR('panel')]
};

const S = { d:null, tab:'node', sel:{}, draft:null, origId:null, base:'', rackId:null, drag:null };
const M = () => App.getMODEL();
const clone = x => JSON.parse(JSON.stringify(x));
const num = (v, d=0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const range = (n, fn) => Array.from({ length:Math.max(0, n) }, (_, i) => fn(i + 1)).join('');
const typeName = t => [t?.brand, t?.name].filter(Boolean).join(' ') || t?.id || '';
// Aantal RJ45-poorten op een node (1 of 2); oudere types hebben het veld niet
const ethernetPorts = t => Math.min(2, Math.max(1, num(t?.ethernetCount, 1)));

function plist(key){
  const m = M();
  m.networkDevices = App.net.normalizeNetworkDevices(m.networkDevices);
  return m.networkDevices[key];
}
function setList(key, list){
  const m = M();
  m.networkDevices = App.net.normalizeNetworkDevices(m.networkDevices);
  m.networkDevices[key] = list;
}
function findType(kind, id){ return !KINDS[kind] ? null : plist(KINDS[kind].key).find(x => x.id === id) || null; }
function afterChange(){
  M().ui.dirty = true;
  App.updateChrome?.();
  App.renderRight?.();
}

// ===== Device faces: 19" front panel, ports always in one row from left to right =====
function metaLine(kind, t){
  switch(kind){
    case 'node': return `${num(t.portCount, 8)} DMX ports${ethernetPorts(t) > 1 ? ` · ${ethernetPorts(t)}× RJ45` : ''}`;
    case 'splitter': return `${t.mode === 'AB' ? 'A/B' : '1'} in · ${num(t.outputCount, 10)} out${t.switching === 'paired' ? ' · paired' : ''}`;
    case 'switch': return `${num(t.portCount, 16)} ${t.jack === 'etherCON' ? 'etherCON' : 'RJ45'}${num(t.sfpCount) ? ` + ${num(t.sfpCount)} ${String(t.sfpConnectors || '').trim() ? 'fibre' : 'SFP'}` : ''}`;
    case 'cable': return `${MEDIUM[t.medium] || 'Fibre'} · ${num(t.cores, 4)}-core · ${String(num(t.lengthM, 50)).replace('.', ',')} m`;
    case 'panel': return [[t.lkCount, 'LK7-1'], [t.vimCount, 'Veam4'], [t.xlrCount, 'XLR'], [t.etherconCount, 'etherCON']]
      .filter(([n]) => num(n) > 0).map(([n, l]) => `${num(n)}× ${l}`).join(' · ') || 'No sockets';
  }
  return '';
}
function portsHtml(kind, t, opts = {}){
  const port = (cls, label, title) => `<span class="rp ${cls}" title="${esc(title)}"><i>${esc(label)}</i></span>`;
  const grp = (inner, cls='') => `<span class="ru-grp ${cls}">${inner}</span>`;
  switch(kind){
    case 'node':
      return grp(range(num(t.portCount, 8), i => port('dmx', i, `DMX port ${i}`))) + grp(range(ethernetPorts(t), i => port('rj', ethernetPorts(t) > 1 ? i : '', ethernetPorts(t) > 1 ? `Network ${i}` : 'Network')));
    case 'splitter': {
      const count = num(t.outputCount, 10);
      const ins = grp(port('dmx in', 'A', 'Input A') + (t.mode === 'AB' ? port('dmx in b', 'B', 'Input B') : ''));
      let outs = '';
      if(t.switching === 'paired'){
        for(let i = 1; i <= count; i += 2) outs += `<span class="ru-pair">${port('dmx', i, `Output ${i}`)}${i + 1 <= count ? port('dmx', i + 1, `Output ${i + 1}`) : ''}</span>`;
      } else outs = range(count, i => port('dmx', i, `Output ${i}`));
      return ins + grp(outs);
    }
    case 'switch': {
      const SP = window.SwPorts, all = num(t.portCount, 16), fr = SP ? SP.front(t) : all, jack = t.jack === 'etherCON' ? 'rj ec' : 'rj';
      let h = grp(range(fr, i => port(jack, i, `Port ${i}`)));
      if(fr < all) h += grp(`<span class="rp-more" title="Ports ${fr + 1}-${all} sit on a panel">${fr + 1}–${all} ▸ panel</span>`);
      if(num(t.sfpCount) && !opts.noSfp) h += grp(range(num(t.sfpCount), i => port(`sfp ${SP ? SP.kindOf(SP.conn(t, i)) : ''}`, SP ? SP.short(t, i) : `S${i}`, SP ? SP.label(t, i) : `SFP ${i}`)));
      return h;
    }
    case 'panel': {
      const g = [], ef = num(t.etherconFirst, 1) || 1;
      if(num(t.lkCount) > 0) g.push(grp(range(num(t.lkCount), i => port('lk', i, `LK7-1 ${i}`))));
      if(num(t.vimCount) > 0) g.push(grp(range(num(t.vimCount), i => port('vim', i, `Veam4 ${i}`))));
      if(num(t.xlrCount) > 0) g.push(grp(range(num(t.xlrCount), i => port('dmx', i, `XLR 5-pin ${i}`))));
      if(num(t.etherconCount) > 0) g.push(grp(range(num(t.etherconCount), i => port('rj ec', i + ef - 1, `etherCON ${i + ef - 1}`))));
      const ff = num(t.fibreFirst, 17), oc = num(t.opticalConCount), fx = num(t.fiberfoxCount);
      if(oc > 0) g.push(grp(range(oc, i => port('sfp oc', ff + i - 1, `opticalCON DUO ${ff + i - 1}`))));
      if(fx > 0) g.push(grp(range(fx, i => port('sfp ff', ff + oc + i - 1, `FiberFox DUO ${ff + oc + i - 1}`))));
      return g.join('') || '<span class="subtle">No sockets</span>';
    }
  }
  return '';
}
function cableFace(t, size){
  const c = safeHex(t?.color, KINDS.cable.color), lbl = typeName(t) || 'New cable';
  return `<div class="cb-face cb-${size}" style="--c:${c}"><span class="cb-end">${esc(t?.connA || '—')}</span><span class="cb-line"><b>${esc(lbl)}</b><small>${esc(metaLine('cable', t || {}))}</small></span><span class="cb-end">${esc(t?.connB || t?.connA || '—')}</span></div>`;
}
function unitFace(kind, t, size='md', opts = {}){
  if(kind === 'cable') return cableFace(t, size);
  if(t?.special && window.SwPorts) return `<div class="ru ru-${size} ru-special" style="--hu:${Math.max(1, num(t.heightU, 3))}">${window.SwPorts.gc20tSvg({ title:'GigaCore 20t' })}</div>`;
  const hu = Math.max(1, num(t?.heightU, 1));
  return `<div class="ru ru-${size}" style="--c:${safeHex(t?.color, KINDS[kind].color)};--hu:${hu}">
    <span class="ru-ear"></span>
    <div class="ru-body">
      <div class="ru-label"><b>${esc(typeName(t) || `New ${KINDS[kind].one.toLowerCase()}`)}</b><span>${esc(metaLine(kind, t))}</span></div>
      <div class="ru-ports">${portsHtml(kind, t, opts)}</div>
    </div>
    <span class="ru-ear"></span>
  </div>`;
}
function libBadge(key, item){
  const st = Lib()?.status(key, item);
  if(st === 'missing') return '<span class="tag" title="Only in this project">Not in library</span>';
  if(st === 'different') return '<span class="tag yellow" title="Your library has another version">Differs</span>';
  return '';
}

// ===== Device type tabs =====
function blank(kind){
  const t = {};
  for(const f of FIELDS[kind]) if(f.def !== undefined) t[f.k] = f.def;
  t.id = nextTypedId(KINDS[kind].prefix, plist(KINDS[kind].key));
  t.brand = ''; t.name = '';
  return t;
}
function withDefaults(kind, t){
  const out = { ...t };
  for(const f of FIELDS[kind]) if(out[f.k] === undefined && f.def !== undefined) out[f.k] = f.def;
  return out;
}
function setDraft(kind, item){
  S.origId = item ? item.id : null;
  S.draft = item ? withDefaults(kind, clone(item)) : blank(kind);
  S.base = JSON.stringify(S.draft);
  if(item) S.sel[kind] = item.id;
}
const isDirty = () => !!S.draft && S.tab !== 'rack' && JSON.stringify(S.draft) !== S.base;

function fieldHtml(f, t){
  const v = t[f.k] ?? '';
  const attrs = `data-f="${f.k}"`;
  let input;
  switch(f.type){
    case 'id': input = `<input type="text" ${attrs} value="${esc(v)}" ${S.origId ? 'readonly title="The type key cannot change once saved — shows refer to it"' : ''}>`; break;
    case 'number': input = f.dec ? `<input type="text" inputmode="decimal" ${attrs} value="${esc(String(v ?? '').replace('.', ','))}" placeholder="7,5">` : `<input type="number" ${attrs} min="${f.min}" max="${f.max}" value="${esc(v)}">`; break;
    case 'select': input = `<select ${attrs}>${f.options.map(([val, lab]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`; break;
    case 'color': input = `<input type="color" ${attrs} value="${safeHex(v, f.def)}">`; break;
    case 'combo': input = `<input type="text" ${attrs} list="dl-${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || '')}"><datalist id="dl-${f.k}">${(f.list || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>`; break;
    case 'ip': input = `<input type="text" class="ipv4" inputmode="numeric" ${attrs} value="${esc(v)}" placeholder="${esc(f.ph || '')}">`; break;
    default: input = `<input type="text" ${attrs} value="${esc(v)}" placeholder="${esc(f.ph || '')}">`;
  }
  return `<label class="field">${esc(f.label)}${input}</label>`;
}
function racksUsing(kind, id){
  return plist('rackTypes').filter(r => (r.items || []).some(it => it.kind === kind && it.typeId === id));
}
function editorHtml(kind){
  const K = KINDS[kind], t = S.draft;
  const saved = S.origId ? findType(kind, S.origId) : null;
  const st = saved ? Lib()?.status(K.key, saved) : null;
  const used = saved ? racksUsing(kind, saved.id) : [];
  const libNote = st === 'missing'
    ? `<div class="db-libnote">${I('info', 14)}<span>This ${K.one.toLowerCase()} is only in this show, not in your library.</span><button class="sm" data-libadd>${I('download', 13)}Add to Library</button></div>`
    : st === 'different'
      ? `<div class="db-libnote warn">${I('alert', 14)}<span>Your library has a different version of ${esc(saved.id)}.</span><button class="sm" data-libuse>Use Library Version</button><button class="sm" data-libadd>Save This to Library</button></div>`
      : '';
  return `
    <div class="db-preview">${unitFace(kind, t, 'lg')}</div>
    <div class="db-edit-head"><h3>${S.origId ? esc(typeName(saved) || saved.id) : `New ${K.one.toLowerCase()}`}</h3>
      ${used.length ? `<span class="subtle">Used in ${used.map(r => esc(r.name || r.id)).join(', ')}</span>` : ''}</div>
    ${libNote}
    ${t.special ? `<div class="db-libnote">${I('info', 14)}<span>This is a built-in special device. It is drawn exactly like the real set and cannot be changed or built in the Device Builder; place it in a rack or choose it as a network switch.</span></div>
    <div class="db-actions"><span style="flex:1"></span></div>` : `<div class="db-form">${FIELDS[kind].map(f => fieldHtml(f, t)).join('')}</div>
    <div class="db-actions">
      ${S.origId ? `<button class="danger" data-del>${I('trash', 14)}Delete</button><button data-dup>${I('copy', 14)}Duplicate</button>` : ''}
      <span style="flex:1"></span>
      <span class="subtle db-dirty" ${isDirty() ? '' : 'hidden'}>Unsaved changes</span>
      <button class="primary" data-save>${I('check', 14)}Save ${K.one}</button>
    </div>`}`;
}
function renderDeviceTab(kind){
  const K = KINDS[kind], list = plist(K.key);
  if(!S.draft){
    const pick = list.find(x => x.id === S.sel[kind]) || list[0] || null;
    setDraft(kind, pick);
  }
  const cards = list.map(t => `
    <div class="db-card ${S.origId === t.id ? 'sel' : ''}" data-pick="${esc(t.id)}" tabindex="0">
      <div class="db-card-head"><b>${esc(typeName(t))}</b>${libBadge(K.key, t)}</div>
      <div class="subtle db-card-meta">${esc(t.id)} · ${esc(metaLine(kind, t))}${kind === 'cable' ? '' : ` · ${num(t.heightU, 1)}U`}</div>
      ${unitFace(kind, t, 'sm')}
    </div>`).join('');
  return `<div class="db-split">
    <aside class="db-side">
      <button class="db-new ${S.origId ? '' : 'sel'}" data-new>${I('plus', 14)}New ${K.one.toLowerCase()}</button>
      <div class="db-cards">${cards || `<div class="db-empty">No ${K.label.toLowerCase()} yet.<br>Fill in the form and click Save.</div>`}</div>
    </aside>
    <section class="db-main" id="dbEditor">${editorHtml(kind)}</section>
  </div>`;
}
function readField(f, el){
  if(f.type === 'number' && f.dec) return Math.min(f.max, Math.max(f.min, Math.round(num(String(el.value).replace(',', '.'), f.def) * 100) / 100));
  if(f.type === 'number') return Math.min(f.max, Math.max(f.min, Math.round(num(el.value, f.def))));
  if(f.type === 'color') return safeHex(el.value, f.def);
  return el.value.trim();
}
function bindDeviceTab(kind){
  const body = S.d.body, K = KINDS[kind];
  body.querySelectorAll('.ipv4[data-f]').forEach(inp => bindIpv4Input(inp, true));
  for(const f of FIELDS[kind]){
    const el = body.querySelector(`[data-f="${f.k}"]`);
    if(!el) continue;
    el.addEventListener('input', () => {
      S.draft[f.k] = f.type === 'number' ? (el.value === '' ? '' : readField(f, el)) : (f.type === 'color' ? safeHex(el.value, f.def) : el.value);
      body.querySelector('.db-preview').innerHTML = unitFace(kind, { ...S.draft, heightU:num(S.draft.heightU, 1) }, 'lg');
      body.querySelector('.db-dirty').hidden = !isDirty();
    });
  }
  body.querySelectorAll('[data-pick]').forEach(card => {
    const go = () => guardDiscard(() => { setDraft(kind, findType(kind, card.dataset.pick)); render(); });
    card.onclick = go;
    card.onkeydown = e => { if(e.key === 'Enter') go(); };
  });
  body.querySelector('[data-new]').onclick = () => guardDiscard(() => { setDraft(kind, null); render(); body.querySelector('[data-f="brand"]')?.focus(); });
  const sv = body.querySelector('[data-save]'); if(sv) sv.onclick = () => saveType(kind);
  const dup = body.querySelector('[data-dup]');
  if(dup) dup.onclick = () => guardDiscard(() => {
    const src = findType(kind, S.origId);
    setDraft(kind, null);
    S.draft = { ...withDefaults(kind, clone(src)), id:nextTypedId(K.prefix, plist(K.key)), name:`${src.name || ''} copy`.trim() };
    render();
  });
  const del = body.querySelector('[data-del]');
  if(del) del.onclick = () => deleteType(kind);
  const libAdd = body.querySelector('[data-libadd]');
  if(libAdd) libAdd.onclick = async () => {
    await Lib().put(K.key, findType(kind, S.origId));
    App.ui.toast('Saved to your library');
    render();
  };
  const libUse = body.querySelector('[data-libuse]');
  if(libUse) libUse.onclick = () => {
    const lib = Lib().get(K.key, S.origId);
    setList(K.key, plist(K.key).map(x => x.id === lib.id ? clone(lib) : x));
    afterChange();
    setDraft(kind, lib);
    render();
  };
}
function saveType(kind){
  const K = KINDS[kind], body = S.d.body;
  const item = {};
  for(const f of FIELDS[kind]){
    const el = body.querySelector(`[data-f="${f.k}"]`);
    if(!el) continue;
    if(f.type === 'ip' && !isValidIpv4(el.value, true)){
      el.focus(); App.ui.toast(`${f.label} must be a valid IPv4 address, for example 192.168.1.1`, 'err'); return;
    }
    item[f.k] = readField(f, el);
  }
  item.id = item.id || nextTypedId(K.prefix, plist(K.key));
  const list = plist(K.key);
  if(!S.origId && list.some(x => x.id === item.id)){
    App.ui.toast(`Type key ${item.id} is already in use`, 'err');
    body.querySelector('[data-f="id"]').focus();
    return;
  }
  if(kind === 'splitter'){ item.inputs = item.mode === 'AB' ? 2 : 1; item.pairSize = 2; }
  // velden die deze builder niet kent (bijv. usageType) behouden
  const prev = S.origId ? list.find(x => x.id === S.origId) : null;
  const saved = { ...(prev || {}), ...item };
  delete saved.std;   // door de gebruiker aangepast: niet meer overschrijven bij een bibliotheek-update
  setList(K.key, prev ? list.map(x => x.id === S.origId ? saved : x) : list.concat(saved));
  Lib()?.put(K.key, saved);
  afterChange();
  setDraft(kind, saved);
  render();
  App.ui.toast(`${typeName(saved)} saved`);
}
async function deleteType(kind){
  const K = KINDS[kind];
  const t = findType(kind, S.origId);
  if(!t) return;
  const used = racksUsing(kind, t.id);
  const ok = await App.ui.confirmDialog({
    title:`Delete ${typeName(t)}?`,
    message:`It is removed from this show and from your library.${used.length ? `\n\nIt is also taken out of: ${used.map(r => r.name || r.id).join(', ')}.` : ''}`,
    okLabel:'Delete', danger:true
  });
  if(!ok) return;
  setList(K.key, plist(K.key).filter(x => x.id !== t.id));
  Lib()?.del(K.key, t.id);
  for(const r of used){
    r.items = r.items.filter(it => !(it.kind === kind && it.typeId === t.id));
    Lib()?.put('rackTypes', r);
  }
  afterChange();
  S.draft = null; S.sel[kind] = null;
  render();
}

// ===== Racks =====
const itemHU = it => it.kind === 'blind' ? 1 : Math.max(1, num(findType(it.kind, it.typeId)?.heightU, 1));
const typeHalf = (kind, typeId) => kind === 'blind' || findType(kind, typeId)?.width === 'half';
const itemHalf = it => typeHalf(it.kind, it.typeId);
const currentRack = () => plist('rackTypes').find(r => r.id === S.rackId) || null;
// half-width devices (and blind plates) may share a U when they sit on opposite sides
function canPlace(rack, row, hu, ignoreIid, half = false, side = 'L'){
  if(row < 1 || row + hu - 1 > rack.heightU) return false;
  return (rack.items || []).every(it => {
    if(it.iid === ignoreIid) return true;
    const a = it.u, b = it.u + itemHU(it) - 1;
    if(row + hu - 1 < a || row > b) return true;
    return half && itemHalf(it) && (it.side || 'L') !== side;
  });
}
function firstFree(rack, hu, half = false){
  for(let r = 1; r <= rack.heightU - hu + 1; r++) for(const side of half ? ['L', 'R'] : ['L']) if(canPlace(rack, r, hu, null, half, side)) return { row:r, side };
  return null;
}
function saveRack(rack){
  delete rack.std;
  setList('rackTypes', plist('rackTypes').map(r => r.id === rack.id ? rack : r));
  Lib()?.put('rackTypes', rack);
  afterChange();
  render();
}
function newRack(){
  const list = plist('rackTypes');
  const rack = { id:nextTypedId(KINDS.rack.prefix, list), name:`Rack ${list.length + 1}`, heightU:12, items:[] };
  setList('rackTypes', list.concat(rack));
  Lib()?.put('rackTypes', rack);
  S.rackId = rack.id;
  afterChange();
  render();
  S.d.body.querySelector('[data-rk="name"]')?.select();
}
function rackSummary(rack){
  const t = { node:0, splitter:0, switch:0, panel:0 }, p = { dmx:0, out:0, rj:0, sfp:0, lk:0, vim:0, xlr:0, ec:0 };
  const rows = new Set();
  for(const it of rack.items || []){
    for(let r = it.u; r < it.u + itemHU(it); r++) rows.add(r);
    const ty = findType(it.kind, it.typeId); if(!ty) continue;
    t[it.kind]++;
    if(it.kind === 'node') p.dmx += num(ty.portCount, 8);
    if(it.kind === 'splitter') p.out += num(ty.outputCount, 10);
    if(it.kind === 'switch'){ p.rj += num(ty.portCount, 16); p.sfp += num(ty.sfpCount); }
    if(it.kind === 'panel'){ p.lk += num(ty.lkCount); p.vim += num(ty.vimCount); p.xlr += num(ty.xlrCount); p.ec += num(ty.etherconCount); }
  }
  const used = rows.size;
  const stat = (label, value, sub='') => `<div class="rk-stat"><span>${label}</span><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  return `<div class="rk-summary">
    ${stat('Height used', `${used} / ${rack.heightU}U`, `${rack.heightU - used}U free`)}
    ${stat('Nodes', t.node, `${p.dmx} DMX ports`)}
    ${stat('Splitters', t.splitter, `${p.out} outputs`)}
    ${stat('Switches', t.switch, `${p.rj} RJ45${p.sfp ? ` · ${p.sfp} SFP` : ''}`)}
    ${stat('Panels', t.panel, [p.lk && `${p.lk}× LK7-1`, p.vim && `${p.vim}× Veam4`, p.xlr && `${p.xlr}× XLR`, p.ec && `${p.ec}× etherCON`].filter(Boolean).join(' · ') || '—')}
  </div>`;
}
function rackHtml(rack){
  const H = rack.heightU;
  const label = r => H - r + 1;            // U1 onderaan, zoals op een echt rek
  const rail = `<div class="rack-rail">${range(H, r => `<span>${label(r)}</span>`)}</div>`;
  const slots = range(H, r => `<div class="rk-slot" data-row="${r}" style="grid-row:${r}"></div>`);
  const items = (rack.items || []).map(it => {
    const ty = findType(it.kind, it.typeId), hu = itemHU(it), half = itemHalf(it), side = it.side || 'L';
    const face = it.kind === 'blind' ? `<div class="ru ru-rack ru-blind" style="--hu:1"><span class="ru-ear"></span><div class="ru-body"><div class="ru-label"><b>Blind plate</b></div></div><span class="ru-ear"></span></div>`
      : ty ? unitFace(it.kind, ty, 'rack', { noSfp: it.kind === 'switch' && window.SwPorts?.fibreOnPanel(ty, (rack.items || []).filter(x => x.kind === 'panel').map(x => findType('panel', x.typeId))) })
      : `<div class="ru ru-rack ru-missing" style="--hu:1"><span class="ru-ear"></span><div class="ru-body"><div class="ru-label"><b>Missing device</b><span>${esc(it.typeId)} is not in this show</span></div></div><span class="ru-ear"></span></div>`;
    return `<div class="rk-item ${half ? `half half-${side}` : ''}" draggable="true" data-iid="${esc(it.iid)}" style="grid-row:${it.u} / span ${ty || it.kind === 'blind' ? hu : 1}">
      ${face}
      <div class="rk-tools">${half ? `<button class="ghost sm icon-only" data-side title="Left / right">⇄</button>` : ''}
        <button class="ghost sm icon-only" data-mv="-1" title="Move up">${I('chevronDown', 13).replace('<svg', '<svg style="transform:rotate(180deg)"')}</button>
        <button class="ghost sm icon-only" data-mv="1" title="Move down">${I('chevronDown', 13)}</button>
        <button class="ghost sm icon-only" data-rm title="Remove from rack">${I('x', 13)}</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="rack" style="--h:${H}">${rail}<div class="rack-bay" id="rkBay" style="grid-template-rows:repeat(${H}, var(--uh))">${slots}${items}</div>${rail}</div>`;
}
function paletteHtml(){
  const blind = `<div class="pal-group"><div class="rb-label">${I('rack', 13)} Fillers</div>
    <div class="pal-card" draggable="true" data-kind="blind" data-type="blind" style="--c:#111" title="Half-width blind plate (1U)"><div><b>Blind plate ½</b><span>black, half width, 1U</span></div><span class="tag">1U</span><button class="ghost sm icon-only" data-add title="Add at first free position">${I('plus', 14)}</button></div>
    <button class="sm" data-rkblind style="margin-top:6px">Fill gaps next to half-width devices</button></div>`;
  return blind + DEVICE_KINDS.map(kind => {
    const K = KINDS[kind], list = plist(K.key);
    return `<div class="pal-group">
      <div class="rb-label">${I(K.icon, 13)} ${K.label} <span class="subtle">${list.length}</span></div>
      ${list.map(t => `<div class="pal-card" draggable="true" data-kind="${kind}" data-type="${esc(t.id)}" style="--c:${safeHex(t.color, K.color)}" title="Drag into the rack">
          <div><b>${esc(typeName(t))}</b><span>${esc(metaLine(kind, t))}</span></div>
          <span class="tag">${num(t.heightU, 1)}U</span>
          <button class="ghost sm icon-only" data-add title="Add at first free position">${I('plus', 14)}</button>
        </div>`).join('') || `<div class="db-empty sm">None yet — <a data-tab="${kind}">create a ${K.one.toLowerCase()}</a></div>`}
    </div>`;
  }).join('');
}
function renderRackTab(){
  const racks = plist('rackTypes');
  if(!racks.some(r => r.id === S.rackId)) S.rackId = racks[0]?.id || null;
  const rack = currentRack();
  const cards = racks.map(r => `
    <div class="db-card ${r.id === S.rackId ? 'sel' : ''}" data-rack="${esc(r.id)}" tabindex="0">
      <div class="db-card-head"><b>${esc(r.name || r.id)}</b>${libBadge('rackTypes', r)}</div>
      <div class="subtle db-card-meta">${esc(r.id)}${r.articleKey ? ` · ${esc(r.articleKey)}` : ''} · ${r.heightU}U · ${(r.items || []).length} device${(r.items || []).length === 1 ? '' : 's'}</div>
    </div>`).join('');
  const minH = rack ? Math.max(1, ...(rack.items || []).map(it => it.u + itemHU(it) - 1)) : 1;
  const heights = rack ? [...new Set(RACK_HEIGHTS.concat(rack.heightU))].sort((a, b) => a - b) : [];
  const main = rack ? `
    <div class="rk-head">
      <label class="field">Rack name<input type="text" data-rk="name" value="${esc(rack.name || '')}"></label>
      <label class="field">Article key<input type="text" data-rk="articleKey" value="${esc(rack.articleKey || '')}" placeholder="e.g. RK-0123"></label>
      <label class="field">Height<select data-rk="heightU">${heights.map(h => `<option value="${h}" ${h === rack.heightU ? 'selected' : ''} ${h < minH ? 'disabled' : ''}>${h}U</option>`).join('')}</select></label>
      <div class="rk-head-actions">${libBadge('rackTypes', rack)}
        ${Lib()?.status('rackTypes', rack) !== 'ok' ? `<button class="sm" data-rklib>${I('download', 13)}Save to Library</button>` : ''}
        <button class="sm" data-rkdup>${I('copy', 13)}Duplicate</button>
        <button class="sm danger" data-rkdel>${I('trash', 13)}Delete</button></div>
    </div>
    <div class="rk-canvas">${rackHtml(rack)}</div>
    ${rackSummary(rack)}`
    : `<div class="empty">${I('rack', 30)}<h3>No racks yet</h3><p>Build a rack from your nodes, splitters, switches and panels.</p><button class="primary" data-newrack>${I('plus', 14)}New Rack</button></div>`;
  return `<div class="db-split rk-split">
    <aside class="db-side">
      <button class="db-new" data-newrack>${I('plus', 14)}New rack</button>
      <div class="db-cards">${cards || '<div class="db-empty">No racks yet.</div>'}</div>
    </aside>
    <section class="db-main rk-main">${main}</section>
    <aside class="db-side rk-pal">${rack ? `<div class="hint" style="margin:0 0 10px">Drag devices into the rack, or click + to add at the first free position.</div>${paletteHtml()}` : ''}</aside>
  </div>`;
}
function placeNew(rack, kind, typeId, row, side){
  const hu = kind === 'blind' ? 1 : Math.max(1, num(findType(kind, typeId)?.heightU, 1)), half = typeHalf(kind, typeId);
  const at = row != null ? { row, side:side || 'L' } : firstFree(rack, hu, half);
  if(!at || !canPlace(rack, at.row, hu, null, half, at.side)){ App.ui.toast(row ? 'Not enough free space there' : `No ${hu}U space left in this rack`, 'err'); return; }
  const item = { iid:`it_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind, typeId: kind === 'blind' ? '' : typeId, u:at.row };
  if(half) item.side = at.side;
  rack.items = (rack.items || []).concat(item);
  saveRack(rack);
}
function moveItem(rack, iid, dir){
  const me = rack.items.find(x => x.iid === iid); if(!me) return;
  const hu = itemHU(me);
  if(canPlace(rack, me.u + dir, hu, iid, itemHalf(me), me.side || 'L')){ me.u += dir; return saveRack(rack); }
  // anders wisselen met het buur-apparaat
  const nb = rack.items.find(x => x.iid !== iid && (dir < 0 ? x.u + itemHU(x) === me.u : x.u === me.u + hu));
  if(!nb) return;
  if(dir < 0){ const top = nb.u; nb.u = top + hu; me.u = top; }
  else { const top = me.u; me.u = top + itemHU(nb); nb.u = top; }
  saveRack(rack);
}
function bindRackTab(){
  const body = S.d.body;
  body.querySelectorAll('[data-newrack]').forEach(b => b.onclick = newRack);
  body.querySelectorAll('[data-rack]').forEach(card => {
    const go = () => { S.rackId = card.dataset.rack; render(); };
    card.onclick = go; card.onkeydown = e => { if(e.key === 'Enter') go(); };
  });
  body.querySelectorAll('[data-tab]').forEach(a => a.onclick = () => switchTab(a.dataset.tab));
  const rack = currentRack();
  if(!rack) return;
  body.querySelector('[data-rk="name"]').onchange = e => { rack.name = e.target.value.trim() || rack.id; saveRack(rack); };
  body.querySelector('[data-rk="articleKey"]').onchange = e => { rack.articleKey = e.target.value.trim(); saveRack(rack); };
  body.querySelector('[data-rk="heightU"]').onchange = e => { rack.heightU = num(e.target.value, rack.heightU); saveRack(rack); };
  const lib = body.querySelector('[data-rklib]');
  if(lib) lib.onclick = async () => {
    await Lib().put('rackTypes', rack);
    // devices in het rek die nog niet in de bibliotheek staan gaan mee
    for(const it of rack.items || []){
      const ty = findType(it.kind, it.typeId);
      if(ty && Lib().status(KINDS[it.kind].key, ty) === 'missing') await Lib().put(KINDS[it.kind].key, ty);
    }
    App.ui.toast('Rack saved to your library'); render();
  };
  body.querySelector('[data-rkdup]').onclick = () => {
    const list = plist('rackTypes');
    const copy = { ...clone(rack), id:nextTypedId(KINDS.rack.prefix, list), name:`${rack.name || rack.id} copy` };
  delete copy.std;
    setList('rackTypes', list.concat(copy)); Lib()?.put('rackTypes', copy);
    S.rackId = copy.id; afterChange(); render();
  };
  body.querySelector('[data-rkdel]').onclick = async () => {
    const ok = await App.ui.confirmDialog({ title:`Delete ${rack.name || rack.id}?`, message:'The rack is removed from this show and from your library. The devices themselves are kept.', okLabel:'Delete Rack', danger:true });
    if(!ok) return;
    setList('rackTypes', plist('rackTypes').filter(r => r.id !== rack.id));
    Lib()?.del('rackTypes', rack.id);
    S.rackId = null; afterChange(); render();
  };
  const fill = body.querySelector('[data-rkblind]'); if(fill) fill.onclick = () => {
    let n = 0;
    for(const it of [...(rack.items || [])]){
      if(!itemHalf(it)) continue;
      const other = (it.side || 'L') === 'L' ? 'R' : 'L';
      if(canPlace(rack, it.u, 1, null, true, other)){ rack.items.push({ iid:`it_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${n}`, kind:'blind', typeId:'', u:it.u, side:other }); n++; }
    }
    if(n) saveRack(rack); else App.ui.toast('No gaps next to half-width devices');
  };
  body.querySelectorAll('.pal-card [data-add]').forEach(b => b.onclick = e => {
    const card = e.currentTarget.closest('.pal-card');
    placeNew(rack, card.dataset.kind, card.dataset.type);
  });
  body.querySelectorAll('.rk-item').forEach(itEl => {
    const iid = itEl.dataset.iid;
    itEl.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => moveItem(rack, iid, num(b.dataset.mv)));
    const sd = itEl.querySelector('[data-side]'); if(sd) sd.onclick = () => { const me = rack.items.find(x => x.iid === iid), to = (me.side || 'L') === 'L' ? 'R' : 'L'; if(canPlace(rack, me.u, 1, iid, true, to)){ me.side = to; saveRack(rack); } else App.ui.toast('That side is taken', 'err'); };
    itEl.querySelector('[data-rm]').onclick = () => { rack.items = rack.items.filter(x => x.iid !== iid); saveRack(rack); };
  });

  // ---- slepen ----
  const bay = body.querySelector('#rkBay');
  const clear = () => bay.querySelectorAll('.rk-slot').forEach(s => s.classList.remove('ok', 'bad'));
  const sideAt = x => { const rc = bay.getBoundingClientRect(); return x < rc.left + rc.width / 2 ? 'L' : 'R'; };
  const rowAt = y => {
    const rc = bay.getBoundingClientRect();
    return Math.min(rack.heightU, Math.max(1, Math.floor((y - rc.top) / (rc.height / rack.heightU)) + 1));
  };
  body.querySelectorAll('.pal-card').forEach(card => card.addEventListener('dragstart', e => {
    S.drag = { kind:card.dataset.kind, typeId:card.dataset.type, hu:card.dataset.kind === 'blind' ? 1 : Math.max(1, num(findType(card.dataset.kind, card.dataset.type)?.heightU, 1)), grab:0, half:typeHalf(card.dataset.kind, card.dataset.type) };
    e.dataTransfer.setData('text/plain', card.dataset.type);
    e.dataTransfer.effectAllowed = 'copy';
  }));
  body.querySelectorAll('.rk-item').forEach(itEl => itEl.addEventListener('dragstart', e => {
    const it = rack.items.find(x => x.iid === itEl.dataset.iid);
    S.drag = { iid:it.iid, hu:itemHU(it), grab:rowAt(e.clientY) - it.u, half:itemHalf(it) };
    e.dataTransfer.setData('text/plain', it.iid);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => itEl.classList.add('dragging'));
  }));
  body.ondragend = () => { S.drag = null; clear(); body.querySelectorAll('.rk-item.dragging').forEach(x => x.classList.remove('dragging')); };
  bay.addEventListener('dragover', e => {
    if(!S.drag) return;
    e.preventDefault();
    const row = rowAt(e.clientY) - S.drag.grab, side = sideAt(e.clientX);
    const fits = canPlace(rack, row, S.drag.hu, S.drag.iid, S.drag.half, side);
    clear();
    for(let r = Math.max(1, row); r < row + S.drag.hu && r <= rack.heightU; r++) bay.querySelector(`.rk-slot[data-row="${r}"]`)?.classList.add(fits ? 'ok' : 'bad');
    e.dataTransfer.dropEffect = fits ? (S.drag.iid ? 'move' : 'copy') : 'none';
  });
  bay.addEventListener('dragleave', e => { if(!bay.contains(e.relatedTarget)) clear(); });
  bay.addEventListener('drop', e => {
    e.preventDefault();
    const drag = S.drag; S.drag = null; clear();
    if(!drag) return;
    const row = rowAt(e.clientY) - drag.grab, side = sideAt(e.clientX);
    if(drag.iid){
      if(!canPlace(rack, row, drag.hu, drag.iid, drag.half, side)){ App.ui.toast('Not enough free space there', 'err'); return; }
      const me = rack.items.find(x => x.iid === drag.iid); me.u = row; if(drag.half) me.side = side;
      saveRack(rack);
    } else placeNew(rack, drag.kind, drag.typeId, row, side);
  });
}

// ===== Dialog =====
function guardDiscard(fn){
  if(!isDirty()) return fn();
  App.ui.confirmDialog({ title:'Discard changes?', message:`The ${KINDS[S.tab].one.toLowerCase()} you are editing has unsaved changes.`, okLabel:'Discard', danger:true })
    .then(ok => { if(ok){ S.base = JSON.stringify(S.draft); fn(); } });
}
function switchTab(tab){
  if(!KINDS[tab] || tab === S.tab) return;
  guardDiscard(() => { S.tab = tab; S.draft = null; S.origId = null; render(); });
}
function render(){
  if(!S.d) return;
  const body = S.d.body;
  const scroll = [...body.querySelectorAll('.db-side, .db-main')].map(n => n.scrollTop);
  const count = k => plist(KINDS[k].key).length;
  body.innerHTML = `<div class="db-top">
      <div class="segmented db-tabs">${Object.entries(KINDS).map(([k, K]) => `<button data-tabbtn="${k}" class="${S.tab === k ? 'active' : ''}">${I(K.icon, 14)}${K.label}<span class="db-count">${count(k)}</span></button>`).join('')}</div>
      <span class="subtle">Saved in this show and in your library</span>
    </div>
    ${S.tab === 'rack' ? renderRackTab() : renderDeviceTab(S.tab)}`;
  [...body.querySelectorAll('.db-side, .db-main')].forEach((n, i) => { n.scrollTop = scroll[i] || 0; });
  body.querySelectorAll('[data-tabbtn]').forEach(b => b.onclick = () => switchTab(b.dataset.tabbtn));
  if(S.tab === 'rack') bindRackTab(); else bindDeviceTab(S.tab);
}
function open(tab){
  if(tab && KINDS[tab]) { if(S.d){ switchTab(tab); return; } S.tab = tab; }
  if(S.d) return;
  S.draft = null; S.origId = null;
  const d = App.ui.openDialog({
    title:'Device Builder',
    subtitle:'Nodes, splitters, switches, panels and cables — and the racks you build from them.',
    cls:'xl db-modal', body:'',
    footer:`<span class="left">Share your devices with a colleague via Export Library.</span>
      <button data-a="import">${I('upload', 14)}Import Library…</button>
      <button data-a="export">${I('download', 14)}Export Library…</button>
      <button class="primary" data-a="done">Done</button>`,
    onClose:() => { S.d = null; S.draft = null; window.removeEventListener('keydown', escGuard, true); }
  });
  S.d = d;
  // niet per ongeluk sluiten met onopgeslagen wijzigingen
  const guardClose = e => {
    if(!isDirty()) return;
    e.stopImmediatePropagation(); e.preventDefault();
    guardDiscard(() => d.close());
  };
  function escGuard(e){
    if(e.key !== 'Escape' || [...document.querySelectorAll('.modal-backdrop')].pop() !== d.bd) return;
    guardClose(e);
  }
  window.addEventListener('keydown', escGuard, true);
  d.bd.addEventListener('mousedown', e => { if(e.target === d.bd) guardClose(e); }, true);
  d.modal.querySelector('.dlg-x').addEventListener('click', guardClose, true);
  d.footer.querySelector('[data-a=done]').onclick = () => guardDiscard(() => d.close());
  d.footer.querySelector('[data-a=export]').onclick = () => window.Library?.exportFile();
  d.footer.querySelector('[data-a=import]').onclick = () => window.Library?.importFile();
  render();
}
function refresh(){ if(S.d){ if(!isDirty()) S.draft = null; render(); } }

window.DeviceBuilder = { open, refresh, unitFace, tab:() => (S.d ? S.tab : null), close:() => { if(S.d){ S.base = JSON.stringify(S.draft); S.d.close(); } } };
