// ui/netdev-lx.js — Luminex GigaCore (generation 2) switches and LumiNode/LumiCore nodes over their documented HTTP APIs.
// For every switch / node of the plan: read what the device has, compare it with the plan, show the exact calls, send after a
// confirmation, then read again to check. The logic lives in core/luminex-api.js; this file builds the wanted state from PatchLab's
// data, keeps the form state and draws the two panels used by the "Devices on the network" dialog (ui/netdev.js).
// Outside the desktop app a simulated device per planned address answers, clearly marked.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const LX = { user:'admin', pass:'', https:false, sim:false, withIp:false, saveSlot:'', protocol:'artnet', sw:new Map(), nd:new Map(), simDevs:null, busy:false };
  let api = null, simm = null;
  const load = async () => { if(!api){ const b = document.baseURI; api = await import(new URL('./core/luminex-api.js', b).href); simm = await import(new URL('./core/luminex-sim.js', b).href); } };
  const real = () => !!window.app?.luminexHttp && !LX.sim;
  const ipOk = ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip || '').trim());

  // ---- transport: the real network (main process) or a simulated device on the planned address ----
  function simNet(){
    if(LX.simDevs) return LX.simDevs;
    const L = []; let k = 0;
    for(const dc of App.sortedDims()){
      for(const s of (window.NetSwitches?.list(dc) || [])) if(s.dev?.ip) L.push({ kind:'gigacore', dev:simm.gigacoreSim({ name:`GigaCore ${++k}`, ip:s.dev.ip, ports:Math.max(4, s.rj + s.sfp) }) });
      (App.net.getDimPlan(dc).nodes || []).forEach((n, i) => { if(!n.ip) return; const u = Array.isArray(n.universes) ? n.universes : []; const sim = simm.lumiNodeSim({ short:'LumiNode', long:'factory default', ip:n.ip, outputs:Math.max(4, Math.ceil((u.length || 4) / 4) * 4), universes:Array.from({ length:8 }, (_, j) => j) }); L.push({ kind:'lumi', dev:sim }); });
    }
    return (LX.simDevs = L);
  }
  const simIp = d => (d.kind === 'gigacore' ? d.dev.state.ip.ip_address : d.dev.state.ip.ipaddress);
  function transport(ip){
    if(real()) return (method, path, body) => window.app.luminexHttp({ ip, method, path, body, user:LX.user, pass:LX.pass, https:LX.https });
    return async (method, path, body) => { const d = simNet().find(x => simIp(x) === ip); await new Promise(r => setTimeout(r, 25)); if(!d) throw new Error('Timeout — no answer from ' + ip); return d.dev.h(method, path, body); };
  }

  // ---- what the plan wants ----
  const F = () => window.Fent;
  const swOf = (dc, label) => (window.NetSwitches?.list(dc) || []).find(x => x.label === label);
  const mgmtVid = s => { try { return s?.dev?.ip ? (F().classify(s.dev.ip)?.vlan?.id ?? null) : null; } catch { return null; } };
  const fibreEnds = (dc, label) => (window.Fibers?.links(dc) || []).flatMap(l => [[l.a, l.b], [l.b, l.a]].filter(([me]) => me && !me.free && me.dc === dc && me.sw === label).map(([me, other]) => ({ me, other })));
  function vlansOf(dc, label){
    const rows = (window.FentUI?.portPlan(dc).rows || []).filter(r => r.sw === label), set = new Set();
    rows.forEach(r => (r.vlans || []).forEach(v => set.add(Number(v)))); const m = mgmtVid(swOf(dc, label)); if(m != null) set.add(m); return set;
  }
  function wantSwitch(dc, s){
    const rows = (window.FentUI?.portPlan(dc).rows || []).filter(r => r.sw === s.label && r.swPort), notes = [];
    const vset = new Set([...vlansOf(dc, s.label)]), ports = [];
    for(const r of rows){ const v = (r.vlans || []).map(Number)[0]; if((r.vlans || []).length > 1) notes.push(t(`Port ${r.swPort} (${r.device}) has several VLANs in the plan — the first one is used.`, `Poort ${r.swPort} (${r.device}) heeft meerdere VLAN’s in het plan — de eerste wordt gebruikt.`)); ports.push({ port:r.swPort, vid:Number.isFinite(v) ? v : null, trunk:false, legend:r.device }); }
    for(const { me, other } of fibreEnds(dc, s.label)){
      const no = window.SwPorts?.no(s.type, Number(me.sfp)) ?? (s.rj + Number(me.sfp));
      ports.push({ port:no, vid:null, trunk:true, legend:`→ ${other.free || other.sw || 'fibre'}` });
      if(other.sw && !other.free) vlansOf(other.dc, other.sw).forEach(v => vset.add(v));                  // the trunk carries what the other end needs too
    }
    const groups = [...vset].sort((a, b) => a - b).map(id => F().vlanById(id)).filter(Boolean).map(v => ({ vid:v.id, name:v.name, color:v.color }));
    const ip = s.dev?.ip ? { address:s.dev.ip, mask:s.dev.subnet || '255.255.255.0', gateway:s.dev.gateway || '' } : null;
    return { want:{ name:s.dev?.id || s.label, ip, groups, mgmtVid:mgmtVid(s), ports, trunkName:'Fibre' }, notes };
  }
  const swList = () => App.sortedDims().flatMap(dc => (window.NetSwitches?.list(dc) || []).map(s => ({ dc, s, key:`${dc}|${s.label}` })));
  const ndList = () => App.sortedDims().flatMap(dc => (App.net.getDimPlan(dc).nodes || []).map((inst, i) => ({ dc, inst, i, key:`${dc}#${i}` })));
  const offset = () => (window.NetDev?.state?.offset ?? -1);
  function wantNode(n){
    const u = Array.isArray(n.inst.universes) ? n.inst.universes : [];
    return { shortName:n.inst.id, longName:n.inst.name, ip:n.inst.ip ? { address:n.inst.ip, mask:n.inst.subnet || '255.255.255.0', gateway:n.inst.gateway || '' } : null, universes:u.map(x => (x == null || x === '' ? null : Number(x))) };
  }

  // ---- actions ----
  const slotOf = () => { const n = Number(LX.saveSlot); return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null; };
  async function readOne(kind, e){
    const st = LX[kind === 'sw' ? 'sw' : 'nd'].get(e.key) || {}; LX[kind === 'sw' ? 'sw' : 'nd'].set(e.key, st);
    st.at ||= kind === 'sw' ? e.s.dev?.ip : e.inst.ip; st.err = ''; st.verified = false; st.busy = true; st.done = null;
    if(!ipOk(st.at)){ st.err = t('Fill in the address the device has now.', 'Vul het adres in dat het apparaat nu heeft.'); st.busy = false; return; }
    try {
      await load(); const h = transport(st.at);
      if(kind === 'sw'){ st.cur = await api.gigacoreRead(h); const w = wantSwitch(e.dc, e.s); st.plan = api.gigacorePlan(st.cur, w.want, { withIp:LX.withIp }); st.plan.notes.push(...w.notes); }
      else { st.cur = await api.lumiRead(h); st.plan = api.lumiPlan(st.cur, wantNode(e), { withIp:LX.withIp, artnetOffset:offset(), protocol:LX.protocol }); }
    } catch(x) { st.cur = null; st.plan = null; st.err = String(x.message || x); }
    st.busy = false;
  }
  async function sendOne(kind, e, rerender){
    const st = LX[kind].get(e.key); if(!st?.plan?.ops.length) return;
    const ops = st.plan.ops, ipChange = ops.some(o => o.kind === 'ip');
    const list = ops.map(o => `<li>${esc(o.text)}<div class="subtle" style="font-size:11px;font-family:monospace">${esc(o.method)} ${esc(o.path)}</div></li>`).join('');
    const ok = await App.ui.confirmDialog({ title:t('Send to the device?', 'Naar het apparaat sturen?'), okLabel:t('Send', 'Sturen'), html:true, width:'560px',
      message:`<div style="max-height:320px;overflow:auto"><p>${real() ? t(`This changes the live configuration of <b>${esc(st.at)}</b>. Check that the show is not running on it.`, `Dit verandert de actieve configuratie van <b>${esc(st.at)}</b>. Controleer dat de show er niet op draait.`) : t('Simulated device — nothing real is changed.', 'Gesimuleerd apparaat — er wordt niets echts veranderd.')}</p><ol>${list}</ol>${ipChange ? `<p class="su-warn">${t('The IP address changes last; the device then answers on the new address.', 'Het IP-adres verandert als laatste; het apparaat antwoordt daarna op het nieuwe adres.')}</p>` : ''}${kind === 'sw' && slotOf() ? `<p>${t('Afterwards the configuration is saved in profile slot', 'Daarna wordt de configuratie bewaard in profielslot')} ${slotOf()}.</p>` : ''}</div>` });
    if(!ok) return;
    st.busy = true; st.err = ''; rerender();
    try {
      await load(); const h = transport(st.at);
      await api.runOps(h, ops);
      if(kind === 'sw' && slotOf()) await h('PUT', `/api/config/profiles/${slotOf()}/save`);
      if(ipChange){ const ip2 = kind === 'sw' ? e.s.dev.ip : e.inst.ip; st.at = ip2; if(real()) await new Promise(r => setTimeout(r, 2500)); }
      window.PatchHistory?.label?.(t('Configuration sent to a Luminex device', 'Configuratie naar een Luminex-apparaat gestuurd'));
      await readOne(kind, e); st.verified = !st.err && st.plan.ops.length === 0; st.done = ops.length;
    } catch(x) { st.err = t(`Stopped after an error: ${x.message || x}. Read the device again to see what was applied.`, `Gestopt door een fout: ${x.message || x}. Lees het apparaat opnieuw uit om te zien wat is toegepast.`); }
    st.busy = false;
  }

  // ---- panels ----
  function cardHtml(kind, e){
    const st = LX[kind].get(e.key) || {}, title = kind === 'sw' ? e.s.label : `${e.inst.id || 'Node'}`;
    const planIp = kind === 'sw' ? e.s.dev?.ip : e.inst.ip, at = st.at ?? planIp ?? '';
    const sub = kind === 'sw' ? `${esc(window.ShortName ? window.ShortName.of(e.s.type) : e.s.type?.name || '')} · ${esc(e.dc)}` : `${esc(e.dc)} · ${esc(e.inst.name || '')}`;
    let status = '<span class="subtle">—</span>';
    if(st.busy) status = `<span class="tag">${t('working…', 'bezig…')}</span>`;
    else if(st.err) status = `<span class="tag red">${t('error', 'fout')}</span>`;
    else if(st.plan) status = st.plan.ops.length ? `<span class="tag yellow">${st.plan.ops.length} ${t('changes', 'wijzigingen')}</span>` : `<span class="tag green">${st.verified ? t('sent and checked', 'verstuurd en gecontroleerd') : t('matches the plan', 'komt overeen met het plan')}</span>`;
    const dev = st.cur ? (kind === 'sw' ? `${esc(st.cur.device?.model || 'GigaCore')} · ${esc(st.cur.device?.name || '')} · ${st.cur.ports.length} ${t('ports', 'poorten')}` : `${esc(st.cur.info?.long_name || st.cur.info?.short_name || 'LumiNode')} · ${st.cur.ports.length} DMX`) : '';
    return `<tr data-k="${esc(e.key)}"><td><b>${esc(title)}</b><div class="subtle" style="font-size:11px">${sub}</div></td>
      <td><input data-at="${esc(e.key)}" value="${esc(at)}" placeholder="${esc(planIp || '10.…')}" style="width:130px" ${st.busy ? 'disabled' : ''}>${planIp && at !== planIp ? `<div class="subtle" style="font-size:11px">${t('plan', 'plan')}: ${esc(planIp)}</div>` : ''}</td>
      <td>${status}<div class="subtle" style="font-size:11px">${dev}</div></td>
      <td style="text-align:right;white-space:nowrap"><button data-read="${esc(e.key)}" ${st.busy ? 'disabled' : ''}>${I('refresh', 13)}${t('Read', 'Uitlezen')}</button> <button class="primary" data-send="${esc(e.key)}" ${st.plan?.ops.length && !st.busy ? '' : 'disabled'}>${t('Send…', 'Sturen…')}</button></td></tr>
      ${st.err ? `<tr><td colspan="4"><div class="su-warn">${esc(st.err)}</div></td></tr>` : ''}
      ${st.plan && (st.plan.ops.length || st.plan.notes.length) ? `<tr><td colspan="4"><div class="nd-diff">${st.plan.ops.map(o => `<div class="nd-ch">${esc(o.text)}</div>`).join('')}${st.plan.notes.map(n => `<div class="subtle" style="font-size:12px">${I('info', 12)} ${esc(n)}</div>`).join('')}</div></td></tr>` : ''}`;
  }
  function common(){
    return `<div class="ex-row"><label>${t('User name', 'Gebruikersnaam')}<input id="lxUser" value="${esc(LX.user)}" style="width:110px" autocomplete="off"></label>
      <label>${t('Password', 'Wachtwoord')}<input id="lxPass" type="password" value="${esc(LX.pass)}" style="width:110px" autocomplete="off"></label>
      <label class="rp-inline" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="lxTls" ${LX.https ? 'checked' : ''}> https</label>
      <label class="rp-inline" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="lxIp" ${LX.withIp ? 'checked' : ''}> ${t('Also change the IP address', 'Verander ook het IP-adres')}</label></div>
      ${real() ? '' : `<div class="hint nd-sim">${I('info', 13)} ${t('Simulated devices — one pretend device on every planned address, so you can try this out. In the desktop app on a real network the real devices answer.', 'Gesimuleerde apparaten — één nepapparaat op elk gepland adres, zodat je dit kunt uitproberen. In de desktop-app op een echt netwerk antwoorden de echte apparaten.')}</div>`}`;
  }
  function switchesHtml(){
    const L = swList();
    return `${common()}<div class="ex-row"><label>${t('Save in profile slot (optional)', 'Bewaar in profielslot (optioneel)')}<input id="lxSlot" value="${esc(LX.saveSlot)}" placeholder="–" style="width:60px"></label><span style="flex:1"></span><button id="lxReadAll">${I('refresh', 14)}${t('Read all switches', 'Alle switches uitlezen')}</button></div>
      <div class="table-wrap" style="max-height:380px;overflow:auto"><table class="data-table"><thead><tr><th>${t('Switch', 'Switch')}</th><th>${t('Address now', 'Adres nu')}</th><th>${t('Status', 'Status')}</th><th></th></tr></thead><tbody>${L.map(e => cardHtml('sw', e)).join('') || `<tr><td colspan="4" class="subtle">${t('No switches in the plan yet.', 'Nog geen switches in het plan.')}</td></tr>`}</tbody></table></div>
      <div class="hint" style="margin-top:10px">${I('info', 13)} ${t('GigaCore generation 2 (WebApi 1.5): PatchLab makes a group per VLAN of the plan (name and colour), puts every port in the group of its device, names the ports after the device, and puts the fibre ports in a “Fibre” trunk that carries these VLANs with the management VLAN untagged. Nothing else on the switch is touched. The change is made on the running configuration; give a profile slot to also save it there.', 'GigaCore generatie 2 (WebApi 1.5): PatchLab maakt een groep per VLAN van het plan (naam en kleur), zet elke poort in de groep van zijn apparaat, noemt de poorten naar het apparaat en zet de fibre-poorten in een trunk “Fibre” met deze VLAN’s en het beheer-VLAN untagged. Verder wordt niets op de switch aangeraakt. De wijziging gaat in de actieve configuratie; geef een profielslot op om het daar ook te bewaren.')}</div>`;
  }
  function nodesHtml(){
    const L = ndList();
    return `${common()}<div class="ex-row"><label>${t('Input type of new universes', 'Type van nieuwe universes')}<select id="lxProto"><option value="artnet" ${LX.protocol === 'artnet' ? 'selected' : ''}>Art-Net</option><option value="sacn" ${LX.protocol === 'sacn' ? 'selected' : ''}>sACN</option></select></label><span style="flex:1"></span><button id="lxReadAll">${I('refresh', 14)}${t('Read all nodes', 'Alle nodes uitlezen')}</button></div>
      <div class="table-wrap" style="max-height:380px;overflow:auto"><table class="data-table"><thead><tr><th>${t('Node', 'Node')}</th><th>${t('Address now', 'Adres nu')}</th><th>${t('Status', 'Status')}</th><th></th></tr></thead><tbody>${L.map(e => cardHtml('nd', e)).join('') || `<tr><td colspan="4" class="subtle">${t('No nodes in the plan yet.', 'Nog geen nodes in het plan.')}</td></tr>`}</tbody></table></div>
      <div class="hint" style="margin-top:10px">${I('info', 13)} ${t('LumiNode / LumiCore WebApi 2.8: the name, the IP address and the universe of every DMX output port (in port order). Each output is followed through its process block to the input that feeds it; outputs that share an input with another block, or have an unknown set-up, are left alone and explained.', 'LumiNode / LumiCore WebApi 2.8: de naam, het IP-adres en het universe van elke DMX-uitgang (in poortvolgorde). Elke uitgang wordt via zijn process block gevolgd naar de ingang die hem voedt; uitgangen die een ingang delen met een ander blok of een onbekende opzet hebben, blijven ongemoeid en worden uitgelegd.')}</div>`;
  }
  function bind(root, kind, rerender){
    const q = s => root.querySelector(s), L = kind === 'sw' ? swList() : ndList(), find = k => L.find(x => x.key === k);
    if(q('#lxUser')) q('#lxUser').onchange = e => { LX.user = e.target.value; };
    if(q('#lxPass')) q('#lxPass').onchange = e => { LX.pass = e.target.value; };
    if(q('#lxTls')) q('#lxTls').onchange = e => { LX.https = e.target.checked; };
    if(q('#lxIp')) q('#lxIp').onchange = e => { LX.withIp = e.target.checked; L.forEach(x => { const st = LX[kind].get(x.key); if(st?.cur) readOne(kind, x).then(rerender); }); };
    if(q('#lxSlot')) q('#lxSlot').onchange = e => { LX.saveSlot = e.target.value.trim(); };
    if(q('#lxProto')) q('#lxProto').onchange = e => { LX.protocol = e.target.value; };
    root.querySelectorAll('[data-at]').forEach(i => i.onchange = () => { const st = LX[kind].get(i.dataset.at) || {}; st.at = i.value.trim(); LX[kind].set(i.dataset.at, st); });
    root.querySelectorAll('[data-read]').forEach(b => b.onclick = async () => { const e = find(b.dataset.read); if(!e) return; const st = LX[kind].get(e.key) || {}; LX[kind].set(e.key, st); st.busy = true; rerender(); await readOne(kind, e); rerender(); });
    root.querySelectorAll('[data-send]').forEach(b => b.onclick = async () => { const e = find(b.dataset.send); if(e){ await sendOne(kind, e, rerender); rerender(); } });
    if(q('#lxReadAll')) q('#lxReadAll').onclick = async () => { for(const e of L){ if(!(LX[kind].get(e.key)?.at || (kind === 'sw' ? e.s.dev?.ip : e.inst.ip))) continue; await readOne(kind, e); rerender(); } };
  }
  window.NetLx = { state:LX, switchesHtml, nodesHtml, bind, wantSwitch, wantNode, swList, ndList, readOne, sendOne, transport };
})();
