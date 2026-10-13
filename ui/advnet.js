// ui/advnet.js — the network of the nodes (LumiNode, LumiCore …), on the Nodes tab.
// ONE switch decides for all nodes (prefs.advancedNet):
//   basic     every node has ONE cable and ONE address: on the lighting VLAN (sACN / Art-Net, 10.40.x.x), on ETH1, as an access port
//   advanced  every node has a trunk on ETH1 with VLAN groups: management (VLAN 1) and data (VLAN 200, set as output by the DMX ports); more groups can be added.
//             ETH2 is free to carry one VLAN of that trunk.
// In the advanced network the VLAN of a group is always the Luminex one (group 1 = VLAN 1, group 2 = VLAN 200, group 3 = VLAN 300 …), whatever VLAN
// numbering the show uses; the address of every group is made with the FENT scheme (management 10.90.x.x, lighting 10.40.x.x — or the range chosen for
// that VLAN) and can be changed. What every RJ45 carries: one group = an access port, two or more = a trunk (the switch port it is plugged into becomes a trunk as well).
// Stored on the node: dev.advanced, dev.advPorts = { 1:[VLAN ids], 2:[…] }, and the addresses as always (dev.ip / dev.ifaces[{ role, vlan, ip, mask, listen, eth }]).
// What goes to the node is made by core/luminex-api.js (lumiNetWant / lumiNetPlan) and sent from the Align / Network config tools.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const F = () => window.Fent;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const plan = dc => App.net.getDimPlan(dc);
  const fcfg = () => M().networkDevices.prefs.fent || (M().networkDevices.prefs.fent = { on:false, group:'production', scan:false, vlanMode:'luminex' });
  const dimNo = dc => (App.dimSlot ? App.dimSlot(dc) : (/(\d+)/.exec(String(dc)) || [0, 1])[1] * 1);
  const ethOf = nt => Math.min(2, Math.max(1, Number(nt?.ethernetCount) || 1));
  const nodeType = inst => (M().networkDevices.nodeTypes || []).find(x => x.id === inst.typeId);
  const dirty = () => { const m = M(); if(m?.ui) m.ui.dirty = true; };
  const ROLE_NAME = { management:['Management', 'Beheer'], lighting:['Lighting', 'Licht'], scan:['Scan', 'Scan'], other:['Other', 'Overig'] };
  const PIPES = [['input+output', 'input + output', 'input + output'], ['input', 'input', 'input'], ['output', 'output', 'output'], ['', 'none', 'geen']];
  // the VLAN of a group is a Luminex one: keep it when it is one (also an own VLAN), else the one of its role
  const isLumi = v => F().luminexGroups().some(g => g.id === Number(v));
  const lumiVlan = (vlan, role) => (vlan != null && vlan !== '' && isLumi(vlan)) ? Number(vlan) : F().groupVlan(role);
  const uniq = a => [...new Set(a.map(Number).filter(Number.isFinite))];

  // ---- the rows of the editor: the first address of the node, then the extra ones (a row is an address; a group is its VLAN) ----
  function rowsOf(inst){
    const r0 = inst.ipRole || 'management', rows = [{ k:'p', role:r0, vlan:Number(inst.ipVlan ?? F().groupVlan(r0)), ip:inst.ip || '', mask:inst.subnet || '', listen:inst.ipListen, eth:1 }];
    (inst.ifaces || []).forEach((x, i) => { if(x) rows.push({ k:i, role:x.role || 'lighting', vlan:Number(x.vlan ?? F().groupVlan(x.role || 'lighting')), ip:x.ip || '', mask:x.mask || '', listen:x.listen, eth:Number(x.eth) || 1 }); });
    return rows;
  }
  function write(inst, k, f, v){
    if(k === 'p'){ const m = { role:'ipRole', vlan:'ipVlan', ip:'ip', mask:'subnet', listen:'ipListen' }[f]; if(!m) return; if(v === undefined) delete inst[m]; else inst[m] = v; return; }
    const x = (inst.ifaces || [])[Number(k)]; if(!x) return; if(v === undefined) delete x[f]; else x[f] = v;
  }
  // the groups on each RJ45: what was chosen; not chosen yet = what the addresses said (the same as Fent.portsOf does without a choice)
  function portsOf(inst, rows, eth){
    const vids = uniq(rows.map(r => r.vlan)), out = { 1:[], 2:[] };
    for(let e = 1; e <= Math.min(2, eth); e++) out[e] = uniq(inst.advPorts ? (inst.advPorts[e] || []) : rows.filter(r => Math.min(eth, r.eth || 1) === e).map(r => r.vlan)).filter(v => e === 2 || vids.includes(v));      // ETH2 may carry any Luminex group, also one the node has no address in
    return out;
  }
  const save = (inst, ports) => { inst.advPorts = { 1:uniq(ports[1] || []), 2:uniq(ports[2] || []) }; };

  // ---- the addresses of a group, made with the FENT scheme ----
  // The scheme is used for the groups of an advanced node whether the project switched the FENT scheme on or not: the node needs its addresses.
  const SCHEME = ['management', 'lighting', 'scan'];
  function hostFor(dc, inst){ return window.FentUI?.hostOf?.(dc, inst) || 11; }
  function suggest(dc, inst, role, host = hostFor(dc, inst), vlan){
    if(!SCHEME.includes(role)) return '';
    return F().suggestRole(role, fcfg().group, dimNo(dc), role === 'scan' ? Math.min(250, host + 100) : host, vlan);
  }
  // every group of the node gets its address again (the host number the node already has stays); returns how many were set
  function fentAll(dc, inst){
    const host = hostFor(dc, inst); let n = 0;
    for(const r of rowsOf(inst)){ const ip = suggest(dc, inst, r.role, host, r.vlan); if(ip){ write(inst, r.k, 'ip', ip); write(inst, r.k, 'mask', F().MASK); n++; } }
    return n;
  }

  // ---- the one switch for all nodes ----
  const prefs = () => (M().networkDevices.prefs ||= {});
  const isOn = () => !!prefs().advancedNet;
  // basic → advanced: the one (lighting) address becomes the lighting group, the node gets a management group, everything sits on the ETH1 trunk
  function toAdvanced(dc, inst){
    inst.advanced = true;
    inst.ifaces = (inst.ifaces || []).filter(Boolean);
    const wasMgmt = (inst.ipRole || 'management') === 'management';
    if(!wasMgmt){
      if(inst.ip && !inst.ifaces.some(x => x.role === inst.ipRole)) inst.ifaces.unshift({ role:inst.ipRole, vlan:lumiVlan(inst.ipVlan, inst.ipRole), ip:inst.ip, mask:inst.subnet || F().MASK, eth:1 });
      inst.ip = ''; inst.subnet = ''; delete inst.ipListen;
    }
    inst.ipRole = 'management'; inst.ipVlan = lumiVlan(wasMgmt ? inst.ipVlan : null, 'management');
    for(const x of inst.ifaces){ x.role = x.role || 'lighting'; x.vlan = lumiVlan(x.vlan, x.role); x.eth = 1; }
    if(!inst.ifaces.some(x => x.role === 'lighting')) inst.ifaces.push({ role:'lighting', vlan:F().groupVlan('lighting'), ip:'', mask:F().MASK, eth:1 });
    const host = hostFor(dc, inst);
    if(!inst.ip){ const ip = suggest(dc, inst, 'management', host, inst.ipVlan); if(ip){ inst.ip = ip; inst.subnet = F().MASK; } }
    for(const x of inst.ifaces) if(!x.ip){ const ip = suggest(dc, inst, x.role, host, x.vlan); if(ip){ x.ip = ip; x.mask = x.mask || F().MASK; } }
    // one cable: every group on ETH1 (two groups on one cable is a trunk); ETH2 is free to choose
    save(inst, { 1:uniq(rowsOf(inst).map(r => r.vlan)), 2:[] });
  }
  // advanced → basic: ONE address, the lighting one, on ETH1
  function toBasic(dc, inst){
    const rows = rowsOf(inst), mode = fcfg().vlanMode;
    const one = rows.find(r => r.role === 'lighting' && r.ip) || rows.find(r => r.role !== 'management' && r.ip) || rows.find(r => r.ip);
    const scan = (inst.ifaces || []).filter(x => x && x.role === 'scan' && x.ip).map(x => ({ ...x, vlan:F().roleVlan('scan', mode), eth:1 }));
    delete inst.advanced; delete inst.advPorts; delete inst.ipListen;
    inst.ifaces = scan;
    const role = one ? one.role : 'lighting';
    inst.ipRole = role; inst.ipVlan = F().roleVlan(role, mode);
    inst.ip = one ? one.ip : ''; inst.subnet = one ? (one.mask || F().MASK) : '';
    if(!inst.ip && fcfg().on) window.FentUI?.addressNew?.(dc, 'node', inst);
  }
  const convert = (dc, inst, on) => { if(on) toAdvanced(dc, inst); else toBasic(dc, inst); };
  // a node follows the switch (a new node, a node of an older project)
  function adopt(dc, inst){ if(!!inst.advanced !== isOn()) convert(dc, inst, isOn()); }
  // every node of every DimCity; returns how many were changed
  function sync(){
    let n = 0;
    for(const dc of App.sortedDims()) for(const inst of (plan(dc).nodes || [])) if(!!inst.advanced !== isOn()){ convert(dc, inst, isOn()); n++; }
    if(n) dirty();
    return n;
  }
  function setAll(on){ prefs().advancedNet = !!on; return sync(); }
  const toggle = (dc, inst, on) => { if(!!inst.advanced !== !!on) convert(dc, inst, !!on); };      // one node (kept for the tools that switch a single node)
  function globalHtml(){
    const on = isOn();
    const body = `<div class="nn-adv-global"><label class="nn-adv-sw" title="${esc(t('One switch for every node and LumiCore of the show', 'Eén schakelaar voor elke node en LumiCore van de show'))}"><input type="checkbox" data-advglobal ${on ? 'checked' : ''}> <b>${t('Advanced network', 'Advanced netwerk')}</b> <span class="subtle">${t('for all nodes and LumiCores', 'voor alle nodes en LumiCores')}</span></label>
      <div class="subtle av-note">${on ? t('On: every node has ONE cable that is a trunk (ETH1) with two addresses: management (VLAN 1) and data (VLAN 200, set as output by its DMX ports). More groups can be added per node. ETH2 can carry one VLAN of that trunk, for instance to daisy-chain the data.', 'Aan: elke node heeft ÉÉN kabel die een trunk is (ETH1) met twee adressen: beheer (VLAN 1) en data (VLAN 200, als output ingesteld door zijn DMX-poorten). Per node kunnen groepen worden toegevoegd. ETH2 kan één VLAN van die trunk dragen, bijvoorbeeld om de data door te lussen.')
        : t('Off (basic): every node has ONE cable and ONE address, on the lighting VLAN (sACN / Art-Net, 10.40.x.x) as an access port. Switch it on for a trunk with a management and a data address.', 'Uit (basic): elke node heeft ÉÉN kabel en ÉÉN adres, op het licht-VLAN (sACN / Art-Net, 10.40.x.x) als access-poort. Zet hem aan voor een trunk met een beheer- en een dataadres.')}</div></div>`;
    return App.ui.card({ key:'net-advglobal', title:t('Network of the nodes', 'Netwerk van de nodes'), icon:'network', meta:on ? 'advanced' : 'basic', collapsible:false, body });
  }
  function bindGlobal(root, rerender){
    const c = root.querySelector('[data-advglobal]'); if(!c) return;
    c.onchange = () => {
      if(c.checked !== isOn()){
        window.PatchHistory?.label?.(`Advanced network ${c.checked ? 'on' : 'off'} for all nodes`);
        const n = setAll(c.checked);
        App.ui.toast(`${n} ${t('nodes', 'nodes')} — ${c.checked ? t('advanced network', 'advanced netwerk') : t('basic network', 'basic netwerk')}`, 'ok');
      }
      rerender();
    };
  }

  // ---- small helpers for the other editors of the same addresses (the DimCity page) ----
  // a group got another VLAN there: the ports follow
  function moved(inst, from, to){
    if(!inst?.advPorts || from == null || to == null || Number(from) === Number(to)) return;
    const still = rowsOf(inst).some(r => r.vlan === Number(from));
    for(const e of [1, 2]){ const a = inst.advPorts[e] || []; if(a.map(Number).includes(Number(from))){ if(!still) inst.advPorts[e] = uniq(a.filter(v => Number(v) !== Number(from))); inst.advPorts[e] = uniq([...(inst.advPorts[e] || []), to]); } }
  }
  // VLANs that no address has any more leave the ports
  function prune(inst){
    if(!inst?.advPorts) return;
    const vids = uniq(rowsOf(inst).map(r => r.vlan));
    inst.advPorts[1] = uniq((inst.advPorts[1] || []).filter(v => vids.includes(Number(v))));      // ETH2 keeps its own choice
  }
  // a new group: on ETH1
  function placeNew(inst, vlan){
    if(!inst?.advPorts || vlan == null) return;
    if(![1, 2].some(e => (inst.advPorts[e] || []).map(Number).includes(Number(vlan)))) inst.advPorts[1] = uniq([...(inst.advPorts[1] || []), vlan]);
  }

  // ---- the HTML ----
  function html(dc, idx, inst, nt, warnHtml = ''){
    if(!inst.advanced) return '';
    const eth = ethOf(nt);
    const rows = rowsOf(inst), ports = portsOf(inst, rows, eth), groups = F().luminexGroups(), vids = uniq(rows.map(r => r.vlan));
    const groupOpts = cur => { const list = groups.slice(); if(cur != null && !list.some(g => g.id === Number(cur))) list.unshift({ id:Number(cur), name:`VLAN ${cur}` }); return list.map(g => `<option value="${g.id}" ${Number(cur) === g.id ? 'selected' : ''}>${g.group ? `${t('Group', 'Groep')} ${g.group} · ` : ''}VLAN ${g.id} · ${esc(g.name)}</option>`).join(''); };
    // the lighting data of a data group follows the DMX ports of the node: output ports → output, input ports → input, both → input + output
    const dpipe = window.PortPlan?.pipeOf ? window.PortPlan.pipeOf(dc, inst, idx) : 'input+output';
    const pipeOf = r => r.listen !== undefined && r.listen !== null ? String(r.listen) : (r.role === 'management' ? '' : dpipe);
    const warns = F().checkAll(rows.filter(r => r.ip).map(r => ({ owner:inst.id || 'node', ip:r.ip, mask:r.mask, vlan:r.vlan, kind:'device' })), fcfg().group).filter(w => w.code !== 'DUPLICATE').map(w => t(w.en, w.nl));
    for(const v of vids) if(!ports[1].includes(v) && !ports[2].includes(v)) warns.push(t(`VLAN ${v} is on no network port of this node — tick ETH1${eth > 1 ? ' or choose it for ETH2' : ''}.`, `VLAN ${v} zit op geen netwerkpoort van deze node — vink ETH1 aan${eth > 1 ? ' of kies hem voor ETH2' : ''}.`));
    if(!rows.some(r => pipeOf(r)) && rows.some(r => r.listen !== undefined && r.listen !== null)) warns.push(t('No group takes part in the lighting data: choose input / output on the lighting group.', 'Geen enkele groep doet mee met de lichtdata: kies input / output bij de lichtgroep.'));
    const trs = rows.map(r => {
      const pipe = pipeOf(r), col = F().vlanById(r.vlan)?.color || '#94a3b8';
      return `<tr data-avk="${r.k}"><td><span class="av-dot" style="--c:${esc(col)}"></span><select data-av="vlan" title="${esc(t('The VLAN of a group is always the Luminex one', 'Het VLAN van een groep is altijd dat van Luminex'))}">${groupOpts(r.vlan)}</select></td>
        <td><select data-av="role" title="${esc(t('What the group is for: management → 10.90.x.x, lighting (sACN / Art-Net) and scan → 10.40.x.x in the FENT scheme', 'Waar de groep voor is: beheer → 10.90.x.x, licht (sACN / Art-Net) en scan → 10.40.x.x in het FENT-schema'))}">${Object.keys(ROLE_NAME).map(k => `<option value="${k}" ${r.role === k ? 'selected' : ''}>${esc(t(...ROLE_NAME[k]))}</option>`).join('')}</select></td>
        <td><input data-av="ip" class="mono ${r.ip && !F().isIp(r.ip) ? 'invalid' : ''}" value="${esc(r.ip)}" placeholder="10.40.101.11" inputmode="numeric" style="width:130px"></td>
        <td><input data-av="mask" class="mono" value="${esc(r.mask)}" placeholder="${F().MASK}" inputmode="numeric" style="width:120px"></td>
        <td><select data-av="listen" title="${esc(t('What lighting data may use this group. By default it follows the DMX ports of the node: output = the node takes the network data to its DMX ports, input = it takes DMX in and sends it on the network', 'Welke lichtdata deze groep mag gebruiken. Standaard volgt dit de DMX-poorten van de node: output = de node neemt de netwerkdata naar zijn DMX-poorten, input = hij neemt DMX in en stuurt het het netwerk op'))}">${PIPES.map(([v, en, nl]) => `<option value="${v}" ${pipe === v ? 'selected' : ''}>${esc(t(en, nl))}</option>`).join('')}</select></td>
        <td class="av-chk"><input type="checkbox" data-avport="1" ${ports[1].includes(r.vlan) ? 'checked' : ''} title="ETH1"></td>
        <td>${r.k === 'p' ? '' : `<button class="sm ghost" data-avrm title="${esc(t('Remove this group', 'Verwijder deze groep'))}">${I('x', 13)}</button>`}</td></tr>`;
    }).join('');
    const portLine = e => { const v = ports[e]; return `<span class="av-port ${v.length > 1 ? 'trunk' : v.length ? 'access' : 'off'}"><b>ETH${e}</b> ${v.length > 1 ? `<span class="tag blue">trunk</span>` : v.length ? `<span class="tag">access</span>` : `<span class="tag">${t('not used', 'niet gebruikt')}</span>`} ${v.length ? `VLAN ${v.join(' + ')}` : ''}</span>`; };
    // ETH2: nothing, any Luminex group (one VLAN), or the same trunk as ETH1 (the node's own predefined trunk)
    const cur2 = ports[2].length === 1 ? ports[2][0] : null, trunk2 = ports[2].length > 1, canTrunk = ports[1].length > 1;
    const eth2 = eth > 1 ? `<label class="av-eth2" title="${esc(t('Choose what the other network port carries: one VLAN (any Luminex group) or the trunk with all the groups of ETH1', 'Kies wat de andere netwerkpoort draagt: één VLAN (elke Luminex-groep) of de trunk met alle groepen van ETH1'))}"><b>ETH2</b> <select data-aveth2><option value="">${t('not used', 'niet gebruikt')}</option>${canTrunk || trunk2 ? `<option value="trunk" ${trunk2 ? 'selected' : ''}>${t('Trunk · all groups of ETH1', 'Trunk · alle groepen van ETH1')}</option>` : ''}${groupOpts(cur2).replace(/<option value="(\d+)"/g, '<option value="v$1"')}</select></label>` : '';
    return `<div class="nn-adv on" data-advnode="${idx}">
      <div class="av-wrap"><table class="data-table nn-adv-t av-t"><thead><tr><th>${t('Group (Luminex VLAN)', 'Groep (Luminex-VLAN)')}</th><th>${t('Used for', 'Gebruikt voor')}</th><th>${t('Address', 'Adres')}</th><th>${t('Mask', 'Mask')}</th><th>${t('Lighting data', 'Lichtdata')}</th><th class="av-chk">ETH1</th><th></th></tr></thead><tbody>${trs}</tbody></table></div>
      <div class="av-bar"><button class="sm" data-avadd>${I('plus', 13)} ${t('Add group', 'Groep toevoegen')}</button><button class="sm" data-avfent title="${esc(t('Make the address of every group again with the FENT scheme (10.90.x.x management, 10.40.x.x lighting)', 'Maak het adres van elke groep opnieuw met het FENT-schema (10.90.x.x beheer, 10.40.x.x licht)'))}">${I('refresh', 13)} ${t('Addresses from the FENT scheme', 'Adressen volgens het FENT-schema')}</button>${eth2}
        <span class="av-ports">${Array.from({ length:eth }, (_, i) => portLine(i + 1)).join('')}</span></div>
      <div class="subtle av-note">${t('The VLAN of a group stays the Luminex one (group 1 = VLAN 1, group 2 = VLAN 200 …) whatever VLAN numbering the show uses. A port with two or more groups is a trunk; the switch port it is plugged into is made a trunk too.', 'Het VLAN van een groep blijft dat van Luminex (groep 1 = VLAN 1, groep 2 = VLAN 200 …), welke VLAN-nummering de show ook gebruikt. Een poort met twee of meer groepen is een trunk; de switchpoort waar hij in zit wordt ook een trunk.')}</div>
      ${warns.map(w => `<div class="rp-adv-note warn">${I('alert', 13)} ${esc(w)}</div>`).join('')}${warnHtml}</div>`;
  }

  // ---- the handlers ----
  function bind(root, dc, rerender){
    root.querySelectorAll('[data-advnode]').forEach(box => {
      const inst = plan(dc).nodes[Number(box.dataset.advnode)]; if(!inst) return;
      const eth = ethOf(nodeType(inst)), done = () => { dirty(); rerender(); };
      const label = s => window.PatchHistory?.label?.(`${dc}: ${inst.id} advanced network — ${s}`);
      const rowOf = k => rowsOf(inst).find(r => String(r.k) === String(k));
      box.querySelectorAll('tr[data-avk]').forEach(tr => {
        const k = tr.dataset.avk;
        tr.querySelectorAll('[data-av]').forEach(el => el.onchange = () => {
          const f = el.dataset.av, v = el.value.trim(), rows = rowsOf(inst), row = rowOf(k); if(!row) return;
          label(f);
          if(f === 'vlan'){                                     // another group: the ports follow it
            const ports = portsOf(inst, rows, eth), old = Number(row.vlan), nv = Number(v);
            write(inst, k, 'vlan', nv);
            const stays = rowsOf(inst).some(r => r.vlan === old);
            for(const e of [1, 2]) ports[e] = ports[e].includes(old) ? uniq([...ports[e].filter(x => stays || x !== old), nv]) : ports[e];
            save(inst, ports);
          } else if(f === 'role'){                              // another use: the group and its address follow, unless they were set by hand
            const was = suggest(dc, inst, row.role, undefined, row.vlan), ports = portsOf(inst, rows, eth), old = Number(row.vlan);
            write(inst, k, 'role', v);
            if(v !== 'other' && old === F().groupVlan(row.role)){
              const nv = F().groupVlan(v); write(inst, k, 'vlan', nv);
              const stays = rowsOf(inst).some(r => r.vlan === old);
              for(const e of [1, 2]) ports[e] = ports[e].includes(old) ? uniq([...ports[e].filter(x => stays || x !== old), nv]) : ports[e];
              save(inst, ports);
            }
            if(!row.ip || row.ip === was){ const ip = suggest(dc, inst, v, undefined, rowOf(k)?.vlan); if(ip){ write(inst, k, 'ip', ip); write(inst, k, 'mask', row.mask || F().MASK); } }
          } else if(f === 'listen') write(inst, k, 'listen', v);
          else write(inst, k, f, v);
          done();
        });
        tr.querySelectorAll('[data-avport]').forEach(cb => cb.onchange = () => {
          const rows = rowsOf(inst), row = rowOf(k), ports = portsOf(inst, rows, eth), e = Number(cb.dataset.avport), vid = Number(row.vlan);
          label(`ETH${e}`);
          ports[e] = cb.checked ? uniq([...(ports[e] || []), vid]) : (ports[e] || []).filter(x => x !== vid);
          save(inst, ports); done();
        });
        const rm = tr.querySelector('[data-avrm]'); if(rm) rm.onclick = () => {
          const ports = portsOf(inst, rowsOf(inst), eth);
          label('group removed'); inst.ifaces.splice(Number(k), 1);
          const left = uniq(rowsOf(inst).map(r => r.vlan));
          for(const e of [1, 2]) ports[e] = ports[e].filter(x => left.includes(x));      // a VLAN another group still uses stays on its port
          save(inst, ports); done();
        };
      });
      const add = box.querySelector('[data-avadd]'); if(add) add.onclick = () => {
        const rows = rowsOf(inst), used = new Set(rows.map(r => r.vlan));
        const pick = [[F().groupVlan('lighting'), 'lighting'], [F().groupVlan('scan'), 'scan'], ...Array.from({ length:18 }, (_, i) => [(i + 4) * 100, 'other'])].find(([v]) => !used.has(v));
        if(!pick){ App.ui.toast(t('All groups are in use', 'Alle groepen zijn in gebruik'), 'info'); return; }
        label('group added'); const [vid, role] = pick, ports = portsOf(inst, rows, eth);
        (inst.ifaces ||= []).push({ role, vlan:vid, ip:suggest(dc, inst, role, undefined, vid), mask:F().MASK, eth:1 });
        ports[1] = uniq([...(ports[1] || []), vid]); save(inst, ports); done();
      };
      const e2 = box.querySelector('[data-aveth2]'); if(e2) e2.onchange = () => {
        const ports = portsOf(inst, rowsOf(inst), eth); label('ETH2');
        ports[2] = e2.value === '' ? [] : e2.value === 'trunk' ? ports[1].slice() : [Number(e2.value.slice(1))]; save(inst, ports); done();
      };
      const fe = box.querySelector('[data-avfent]'); if(fe) fe.onclick = () => {
        label('addresses from the FENT scheme'); fentAll(dc, inst); done();
      };
    });
  }
  window.AdvNet = { html, bind, toggle, isOn, setAll, sync, adopt, globalHtml, bindGlobal, rowsOf, portsOf, moved, prune, placeNew, fentAll };
})();
