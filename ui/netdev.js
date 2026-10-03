// ui/netdev.js — Devices on the network: find the Art-Net nodes, match each one to a node in the plan by IP / name / MAC,
// show what differs (IP, names, port universes) and send the planned configuration to the ones you tick.
//   · Nodes   — Art-Net (ArtPoll / ArtAddress / ArtIpProg). Works with any Art-Net node, Luminex LumiNode included.
//   · Switches — reachability of the planned addresses, and a configuration sheet (port, device, VLAN) per switch.
// Sending is always an explicit step: preview → confirm → send → scan again to check. IP changes are a separate tick.
// Outside the desktop app (or in the demo) a simulated network is used, clearly marked, so you can try it out.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const OFFSETS = [[-1, 'PatchLab universe 1 = Art-Net universe 0 (Luminex, most nodes)', 'PatchLab universe 1 = Art-Net universe 0 (Luminex, de meeste nodes)'], [0, 'Same number in both', 'Zelfde nummer in beide']];
  const S = { devices:[], scanned:false, sim:false, offset:-1, extra:'', match:new Map(), sel:new Set(), withIp:false, busy:false, tab:'nodes', log:[] };

  // ---- the nodes of the plan ----
  function planNodes(){
    const out = [];
    for(const dc of App.sortedDims()){ const plan = App.net.getDimPlan(dc); (plan.nodes || []).forEach((inst, i) => out.push({ key:`${dc}#${i}`, dc, i, inst })); }
    return out;
  }
  const nodeLabel = n => `${n.dc} · ${n.inst.id}${n.inst.ip ? ` · ${n.inst.ip}` : ''}`;
  const expected = n => (Array.isArray(n.inst.universes) ? n.inst.universes : []).map(u => (u == null || u === '' ? null : Number(u)));
  const art = u => Math.max(0, Number(u) + S.offset);
  function autoMatch(dev, nodes, used){
    const byIp = nodes.find(n => n.inst.ip && n.inst.ip === dev.ip && !used.has(n.key)); if(byIp) return byIp;
    const nm = `${dev.shortName} ${dev.longName}`.toLowerCase();
    const byName = nodes.find(n => !used.has(n.key) && ((n.inst.id && nm.includes(String(n.inst.id).toLowerCase())) || (n.inst.name && nm.includes(String(n.inst.name).toLowerCase()))));
    if(byName) return byName;
    return nodes.find(n => !used.has(n.key) && n.inst.mac && String(n.inst.mac).toLowerCase() === String(dev.mac).toLowerCase()) || null;
  }
  function rematch(){
    const nodes = planNodes(), used = new Set(); S.match = new Map();
    for(const d of S.devices){ const n = autoMatch(d, nodes, used); if(n){ S.match.set(d.mac || d.ip, n.key); used.add(n.key); } }
  }
  // what differs between a device and the plan
  function diff(dev, n){
    const ch = [], inst = n.inst;
    if(inst.ip && dev.ip !== inst.ip) ch.push({ k:'ip', text:`IP ${dev.ip} → ${inst.ip}`, ip:true });
    if(inst.id && dev.shortName !== String(inst.id).slice(0, 17)) ch.push({ k:'short', text:`${t('name', 'naam')} “${dev.shortName}” → “${String(inst.id).slice(0, 17)}”` });
    if(inst.name && dev.longName !== String(inst.name).slice(0, 63)) ch.push({ k:'long', text:`${t('long name', 'lange naam')} “${dev.longName}” → “${String(inst.name).slice(0, 63)}”` });
    const exp = expected(n), bad = [];
    exp.forEach((u, j) => { if(u == null || j >= dev.ports.length) return; if(dev.ports[j].outUniverse !== art(u)) bad.push({ j, from:fromAddr(dev.ports[j].outUniverse), to:u }); });
    if(bad.length) ch.push({ k:'uni', text:`${bad.length} ${t('port universes', 'poortuniverses')}: ${bad.slice(0, 4).map(b => `${b.j + 1}: U${b.from}→U${b.to}`).join(', ')}${bad.length > 4 ? ' …' : ''}`, bad });
    return ch;
  }
  const fromAddr = a => Number(a) - S.offset;

  // ---- the jobs sent to a device ----
  function jobFor(dev, n, withIp){
    const inst = n.inst, exp = expected(n), job = { ip:dev.ip, address:[], ipProg:null, warnings:[] };
    const groups = Math.max(1, Math.ceil(dev.ports.length / 4));
    for(let g = 0; g < groups; g++){
      const swOut = [null, null, null, null], addrs = [];
      for(let s = 0; s < 4; s++){ const j = g * 4 + s, u = exp[j]; if(u == null || j >= dev.ports.length) continue; const a = art(u); addrs.push(a); swOut[s] = a & 0x0f; }
      const a0 = { bindIndex:g + 1, swOut };
      if(addrs.length){ const nets = new Set(addrs.map(a => a >> 8)), subs = new Set(addrs.map(a => (a >> 4) & 15)); if(nets.size > 1 || subs.size > 1) job.warnings.push(`${t('ports', 'poorten')} ${g * 4 + 1}-${g * 4 + 4}: ${t('universes span more than one Net/Sub-Net — one group of 4 ports shares it', 'universes liggen in meer dan één Net/Sub-Net — een groep van 4 poorten deelt die')}`); a0.net = addrs[0] >> 8; a0.sub = (addrs[0] >> 4) & 15; }
      if(g === 0){ if(inst.id) a0.shortName = String(inst.id).slice(0, 17); if(inst.name) a0.longName = String(inst.name).slice(0, 63); }
      job.address.push(a0);
    }
    if(withIp && inst.ip && inst.ip !== dev.ip) job.ipProg = { ip:inst.ip, mask:inst.subnet || '255.255.255.0' };
    return job;
  }

  // ---- talking to the network (real or simulated) ----
  const real = () => !!window.app?.artnetScan && !S.sim;
  function simDevices(){
    const nodes = planNodes().slice(0, 5); if(!nodes.length) return [];
    const out = nodes.map((n, k) => {
      const exp = expected(n), ports = (exp.length ? exp : Array(8).fill(null)).map((u, j) => ({ index:j % 4, slot:j % 4, bindIndex:Math.floor(j / 4) + 1, output:true, outUniverse:u == null ? 0 : art(u) }));
      const dev = { ip:n.inst.ip || `10.90.${100 + k}.${11 + k}`, mac:`00:50:c2:a${k}:00:0${k + 1}`, shortName:String(n.inst.id || 'Node').slice(0, 17), longName:String(n.inst.name || 'LumiNode').slice(0, 63), oem:0, net:0, sub:0, ports, sim:true };
      if(k === 0 && ports.length > 3){ ports[2].outUniverse = 0; ports[3].outUniverse = 0; }              // wrong universes on two ports
      if(k === 1){ dev.shortName = 'LumiNode 12'; dev.longName = 'factory default'; }                     // never named
      if(k === 2){ dev.ip = `10.90.99.${40 + k}`; dev.shortName = String(n.inst.id).slice(0, 17); }       // still on another address
      return dev;
    });
    out.push({ ip:'10.90.101.250', mac:'00:50:c2:ff:00:99', shortName:'Unknown node', longName:'Not in the plan', oem:0, net:0, sub:0, ports:[{ index:0, slot:0, bindIndex:1, output:true, outUniverse:7 }], sim:true });
    return out;
  }
  async function scan(){
    S.busy = true; render();
    try {
      if(real()){ const targets = S.extra.split(/[\s,;]+/).filter(Boolean); S.devices = await window.app.artnetScan({ targets: targets.length ? [...targets] : null, timeoutMs:2200 }); }
      else { if(!S.sim) S.sim = true; if(!S.scanned || !S.devices.length) S.devices = simDevices(); await new Promise(r => setTimeout(r, 500)); }
      S.scanned = true; rematch(); S.sel = new Set(S.devices.filter(d => { const k = S.match.get(d.mac || d.ip); const n = planNodes().find(x => x.key === k); return n && diff(d, n).some(c => !c.ip); }).map(d => d.mac || d.ip));
    } catch(e) { App.ui.toast(String(e.message || e), 'err'); }
    S.busy = false; render();
  }
  async function send(items){
    S.busy = true; render(); const results = [];
    for(const { dev, node } of items){
      const job = jobFor(dev, node, S.withIp);
      try {
        if(real()) await window.app.artnetApply(job);
        else { for(const a of job.address){ if(a.shortName) dev.shortName = a.shortName; if(a.longName) dev.longName = a.longName; a.swOut.forEach((v, i) => { const p = dev.ports[(a.bindIndex - 1) * 4 + i]; if(v != null && p) p.outUniverse = ((a.net || 0) << 8) | ((a.sub || 0) << 4) | v; }); } if(job.ipProg) dev.ip = job.ipProg.ip; }
        results.push({ dev, ok:true });
      } catch(e) { results.push({ dev, ok:false, err:String(e.message || e) }); }
    }
    window.PatchHistory?.label?.(t('Configuration sent to devices', 'Configuratie naar apparaten gestuurd'));
    await new Promise(r => setTimeout(r, 700));
    await scan();
    const bad = results.filter(r => !r.ok);
    App.ui.toast(bad.length ? `${bad.length} ${t('failed', 'mislukt')}: ${bad[0].err}` : `${results.length} ${t('devices configured and checked', 'apparaten ingesteld en gecontroleerd')}`, bad.length ? 'err' : 'ok');
  }

  // ---- switches ----
  async function probeAll(){
    const sws = window.NetSwitches ? App.sortedDims().flatMap(dc => window.NetSwitches.list(dc).map(s => ({ dc, s }))) : [];
    S.probe = new Map(); S.busy = true; render();
    for(const { dc, s } of sws){ const ip = s.dev?.ip; if(!ip) continue; let open = []; try { open = real() ? await window.app.netProbe({ ip, ports:[80, 443] }) : (Math.random() < .8 ? [80] : []); } catch {} S.probe.set(`${dc}|${s.label}`, open); }
    S.busy = false; render();
  }
  function sheet(){
    const L = [];
    for(const dc of App.sortedDims()){
      const sws = window.NetSwitches?.list(dc) || []; if(!sws.length) continue;
      const rows = window.FentUI?.portPlan(dc).rows || [];
      for(const s of sws){
        L.push(`# ${s.label} — ${[s.type?.brand, s.type?.name].filter(Boolean).join(' ')} — ${s.dev?.ip || 'no IP'} / ${s.dev?.subnet || ''} — ${dc}`);
        L.push('port\tdevice\tVLAN(s)\taddress');
        for(const r of rows.filter(x => x.sw === s.label)) L.push([r.swPort, r.device, r.vlans.join('+'), (r.ips || []).join(' ')].join('\t'));
        if(window.Fibers) for(const f of window.Fibers.links(dc)) for(const e of [f.a, f.b]) if(e && e.dc === dc && e.sw === s.label) L.push([window.Fibers.portName(dc, s.label, e.sfp).split(' ')[0], `fibre ${f.id}`, '', window.Fibers.endLabel(e === f.a ? f.b : f.a)].join('\t'));
        L.push('');
      }
    }
    return L.join('\r\n');
  }

  // ---- dialog ----
  let D = null;
  function render(){
    if(!D) return;
    const body = D.body, nodes = planNodes();
    const tabs = `<div class="segmented" id="ndTabs"><button data-t="nodes" class="${S.tab === 'nodes' ? 'active' : ''}">${I('network', 14)}${t('Nodes (Art-Net)', 'Nodes (Art-Net)')}</button><button data-t="switches" class="${S.tab === 'switches' ? 'active' : ''}">${I('switchDev', 14)}${t('Switches', 'Switches')}</button></div>`;
    let main = '';
    if(S.tab === 'nodes'){
      const opts = nodes.map(n => `<option value="${esc(n.key)}">${esc(nodeLabel(n))}</option>`).join('');
      const rows = S.devices.map(d => {
        const id = d.mac || d.ip, key = S.match.get(id), n = nodes.find(x => x.key === key), ch = n ? diff(d, n) : [];
        const st = !n ? `<span class="tag">${t('not in the plan', 'niet in het plan')}</span>` : ch.length ? `<span class="tag yellow">${ch.length} ${t('differences', 'verschillen')}</span>` : `<span class="tag green">${t('matches the plan', 'komt overeen met het plan')}</span>`;
        return `<tr><td><input type="checkbox" data-sel="${esc(id)}" ${S.sel.has(id) ? 'checked' : ''} ${n && ch.length ? '' : 'disabled'}></td><td><b>${esc(d.ip)}</b><div class="subtle" style="font-size:11px">${esc(d.mac)}</div></td><td>${esc(d.shortName)}<div class="subtle" style="font-size:11px">${esc(d.longName)}</div></td><td class="num">${d.ports.length}</td>
          <td><select data-match="${esc(id)}"><option value="">—</option>${opts.replace(`value="${esc(key)}"`, `value="${esc(key)}" selected`)}</select></td><td>${st}${ch.map(c => `<div class="nd-ch">${esc(c.text)}</div>`).join('')}</td></tr>`;
      }).join('');
      const nSel = S.sel.size;
      main = `<div class="ex-row"><label>${t('Universe numbering', 'Universe-nummering')}<select id="ndOff">${OFFSETS.map(([v, en, nl]) => `<option value="${v}" ${S.offset === v ? 'selected' : ''}>${esc(t(en, nl))}</option>`).join('')}</select></label>
          <label>${t('Also look at (optional)', 'Kijk ook bij (optioneel)')}<input id="ndExtra" placeholder="10.90.101.255, 2.255.255.255" value="${esc(S.extra)}" style="width:230px"></label>
          <button class="primary" id="ndScan" ${S.busy ? 'disabled' : ''}>${I('refresh', 14)}${S.busy ? t('Working…', 'Bezig…') : S.scanned ? t('Scan again', 'Opnieuw scannen') : t('Scan the network', 'Netwerk scannen')}</button></div>
        ${S.sim || !window.app?.artnetScan ? `<div class="hint nd-sim">${I('info', 13)} ${t('Simulated network — a few pretend nodes made from your plan, so you can try this out. In the desktop app on a real network the scan finds real nodes.', 'Gesimuleerd netwerk — een paar nepnodes uit je plan, zodat je dit kunt uitproberen. In de desktop-app op een echt netwerk vindt de scan echte nodes.')}</div>` : ''}
        ${S.scanned ? (S.devices.length ? `<div class="table-wrap" style="max-height:340px;overflow:auto"><table class="data-table"><thead><tr><th></th><th>IP / MAC</th><th>${t('Name on the device', 'Naam op het apparaat')}</th><th class="num">${t('Ports', 'Poorten')}</th><th>${t('Node in the plan', 'Node in het plan')}</th><th>${t('Status', 'Status')}</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="ex-row" style="margin-top:10px"><label class="rp-inline"><input type="checkbox" id="ndIp" ${S.withIp ? 'checked' : ''}> ${t('Also change the IP address (the node moves — scan again afterwards)', 'Verander ook het IP-adres (de node verhuist — scan daarna opnieuw)')}</label><span style="flex:1"></span><button class="primary" id="ndSend" ${nSel && !S.busy ? '' : 'disabled'}>${t('Send configuration to', 'Configuratie sturen naar')} ${nSel} ${t('devices', 'apparaten')}…</button></div>` : `<div class="subtle" style="margin:12px 0">${t('No Art-Net node answered. Check the cable and that you are in the same network (or enter the broadcast address above).', 'Geen Art-Net-node antwoordde. Controleer de kabel en dat je in hetzelfde netwerk zit (of vul het broadcast-adres hierboven in).')}</div>`)
          : `<div class="subtle" style="margin:12px 0">${t('Scan to see which nodes are on the network. PatchLab matches each one with a node of your plan by IP address, name or MAC.', 'Scan om te zien welke nodes op het netwerk zitten. PatchLab koppelt elke node aan een node uit je plan op IP-adres, naam of MAC.')}</div>`}
        <div class="hint">${I('info', 13)} ${t('What is sent: the short and long name, the universe of every output port, and (only if you tick it) the IP address and subnet. Standard Art-Net (ArtAddress / ArtIpProg). Nothing is sent until you confirm.', 'Wat wordt gestuurd: de korte en lange naam, het universe van elke uitgangspoort en (alleen als je het aanvinkt) het IP-adres en subnet. Standaard Art-Net (ArtAddress / ArtIpProg). Er wordt niets gestuurd zonder jouw bevestiging.')}</div>`;
    } else {
      const sws = window.NetSwitches ? App.sortedDims().flatMap(dc => window.NetSwitches.list(dc).map(s => ({ dc, s }))) : [];
      main = `<div class="ex-row"><button class="primary" id="ndProbe" ${S.busy ? 'disabled' : ''}>${I('refresh', 14)}${t('Check which switches answer', 'Controleer welke switches antwoorden')}</button><button id="ndSheet">${I('download', 14)}${t('Configuration sheet (all switches)…', 'Configuratieblad (alle switches)…')}</button></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>${t('Switch', 'Switch')}</th><th>${t('Type', 'Type')}</th><th>IP</th><th>${t('Answers', 'Antwoordt')}</th></tr></thead><tbody>${sws.map(({ dc, s }) => { const r = S.probe?.get(`${dc}|${s.label}`); return `<tr><td><b>${esc(s.label)}</b> <span class="subtle">${esc(dc)}</span></td><td>${esc(window.ShortName ? window.ShortName.of(s.type) : s.type?.name)}</td><td>${esc(s.dev?.ip || '—')}</td><td>${!s.dev?.ip ? '<span class="subtle">—</span>' : r == null ? '<span class="subtle">?</span>' : r.length ? `<span class="tag green">${t('yes', 'ja')} (${r.map(p => p === 443 ? 'https' : 'http').join(', ')})</span>` : `<span class="tag red">${t('no answer', 'geen antwoord')}</span>`}</td></tr>`; }).join('') || `<tr><td colspan="4" class="subtle">${t('No switches in the plan yet.', 'Nog geen switches in het plan.')}</td></tr>`}</tbody></table></div>
        <div class="hint" style="margin-top:10px">${I('info', 13)} ${t('Sending a configuration to Luminex GigaCore switches is not built in: it needs the switch’s own control interface, which PatchLab cannot verify here. What you get: a check that each planned address answers, and a sheet with port, device, VLAN and address per switch to enter or import there. If you tell us which interface you use (web API, CLI, SNMP) it can be added.', 'Configuratie sturen naar Luminex GigaCore-switches zit er niet in: daarvoor is de eigen besturingsinterface van de switch nodig, die PatchLab hier niet kan controleren. Wel: een controle of elk geplande adres antwoordt, en een blad met poort, apparaat, VLAN en adres per switch om daar in te voeren of te importeren. Als je zegt welke interface je gebruikt (web-API, CLI, SNMP) kan die erbij.')}</div>`;
    }
    body.innerHTML = `<div class="ex">${tabs}<div class="ex-box">${main}</div></div>`;
    body.querySelectorAll('#ndTabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; render(); });
    const q = s => body.querySelector(s);
    if(q('#ndOff')) q('#ndOff').onchange = e => { S.offset = Number(e.target.value); render(); };
    if(q('#ndExtra')) q('#ndExtra').onchange = e => { S.extra = e.target.value; };
    if(q('#ndScan')) q('#ndScan').onclick = scan;
    if(q('#ndIp')) q('#ndIp').onchange = e => { S.withIp = e.target.checked; };
    body.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); render(); });
    body.querySelectorAll('[data-match]').forEach(s => s.onchange = () => { if(s.value) S.match.set(s.dataset.match, s.value); else S.match.delete(s.dataset.match); render(); });
    if(q('#ndSend')) q('#ndSend').onclick = async () => {
      const nodes2 = planNodes(), items = S.devices.filter(d => S.sel.has(d.mac || d.ip)).map(d => ({ dev:d, node:nodes2.find(x => x.key === S.match.get(d.mac || d.ip)) })).filter(x => x.node);
      const lines = items.map(({ dev, node }) => { const j = jobFor(dev, node, S.withIp); return `<li><b>${esc(dev.ip)}</b> → ${esc(node.inst.id)} (${esc(node.dc)}): ${diff(dev, node).filter(c => S.withIp || !c.ip).map(c => esc(c.text)).join('; ')}${j.warnings.map(w => `<div class="su-warn">${esc(w)}</div>`).join('')}</li>`; }).join('');
      const ok = await App.ui.confirmDialog({ title:t('Send configuration?', 'Configuratie sturen?'), message:`<div style="max-height:280px;overflow:auto"><p>${S.sim ? t('Simulated devices — nothing real is changed.', 'Gesimuleerde apparaten — er wordt niets echts veranderd.') : t('These devices will be changed. Check that the show is not running on them.', 'Deze apparaten worden veranderd. Controleer dat de show er niet op draait.')}</p><ul>${lines}</ul></div>`, okLabel:t('Send', 'Sturen'), html:true });
      if(ok) send(items);
    };
    if(q('#ndProbe')) q('#ndProbe').onclick = probeAll;
    if(q('#ndSheet')) q('#ndSheet').onclick = async () => {
      const text = sheet(); if(!text.trim()){ App.ui.toast(t('No switches in the plan yet', 'Nog geen switches in het plan'), 'info'); return; }
      const a = document.createElement('a'); a.download = `${(M().projectMeta?.project || 'PatchLab').replace(/[^\w\-]+/g, '_')}-switch-config.txt`; a.href = URL.createObjectURL(new Blob([text], { type:'text/plain' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }
  function open(opts = {}){
    if(opts.tab) S.tab = opts.tab;
    D = App.ui.openDialog({ title:t('Devices on the network', 'Apparaten op het netwerk'), subtitle:t('Find the nodes, compare them with your plan and send the planned configuration.', 'Vind de nodes, vergelijk ze met je plan en stuur de geplande configuratie.'), width:'1000px', body:'', footer:`<button class="primary" data-a="done">${t('Close', 'Sluiten')}</button>`, onClose:() => { D = null; } });
    D.footer.querySelector('[data-a=done]').onclick = () => D.close();
    render();
  }
  window.NetDev = { open, diff, jobFor, state:S, simDevices };
})();
