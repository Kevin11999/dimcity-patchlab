// ui/advnet.js — the advanced network of a LumiNode, on the Nodes tab.
// A LumiNode in its advanced network has VLAN groups instead of one address. Here you set, per node:
//   · its groups: the VLAN of a group is always the Luminex one (group 1 = VLAN 1, group 2 = VLAN 200, group 3 = VLAN 300 …), whatever VLAN
//     numbering the show uses; the address of every group is made with the FENT scheme (management 10.90.x.x, lighting 10.40.x.x) and can be changed;
//   · what every RJ45 carries: one group = an access port, two or more = a trunk (the switch port it is plugged into becomes a trunk as well).
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
  const defPipe = role => role === 'management' ? '' : 'input+output';
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
    for(let e = 1; e <= Math.min(2, eth); e++) out[e] = uniq(inst.advPorts ? (inst.advPorts[e] || []) : rows.filter(r => Math.min(eth, r.eth || 1) === e).map(r => r.vlan)).filter(v => vids.includes(v));
    return out;
  }
  const save = (inst, ports) => { inst.advPorts = { 1:uniq(ports[1] || []), 2:uniq(ports[2] || []) }; };

  // ---- the addresses of a group, made with the FENT scheme ----
  // The scheme is used for the groups of an advanced node whether the project switched the FENT scheme on or not: the node needs its addresses.
  const SCHEME = ['management', 'lighting', 'scan'];
  function hostFor(dc, inst){ return window.FentUI?.hostOf?.(dc, inst) || 11; }
  function suggest(dc, inst, role, host = hostFor(dc, inst)){
    if(!SCHEME.includes(role)) return '';
    return F().suggestRole(role, fcfg().group, dimNo(dc), role === 'scan' ? Math.min(250, host + 100) : host);
  }
  // every group of the node gets its address again (the host number the node already has stays); returns how many were set
  function fentAll(dc, inst){
    const host = hostFor(dc, inst); let n = 0;
    for(const r of rowsOf(inst)){ const ip = suggest(dc, inst, r.role, host); if(ip){ write(inst, r.k, 'ip', ip); write(inst, r.k, 'mask', F().MASK); n++; } }
    return n;
  }

  // ---- switching it on and off ----
  function toggle(dc, inst, on){
    if(!on){ delete inst.advanced; return; }            // the choices stay (advPorts), for the next time it is switched on
    const nt = nodeType(inst), eth = ethOf(nt);
    inst.advanced = true;
    // every group gets the Luminex VLAN of its role (a Luminex VLAN that was chosen already stays); the node has at least a management and a lighting group
    inst.ipRole = inst.ipRole || 'management'; inst.ipVlan = lumiVlan(inst.ipVlan, inst.ipRole);
    inst.ifaces = (inst.ifaces || []).filter(Boolean);
    for(const x of inst.ifaces){ x.role = x.role || 'lighting'; x.vlan = lumiVlan(x.vlan, x.role); }
    if(!inst.ifaces.some(x => x.role === 'lighting')) inst.ifaces.push({ role:'lighting', vlan:F().groupVlan('lighting'), ip:'', mask:F().MASK, eth:1 });
    const host = hostFor(dc, inst);
    if(!inst.ip){ const ip = suggest(dc, inst, inst.ipRole, host); if(ip){ inst.ip = ip; inst.subnet = F().MASK; } }
    for(const x of inst.ifaces) if(!x.ip){ const ip = suggest(dc, inst, x.role, host); if(ip){ x.ip = ip; x.mask = x.mask || F().MASK; } }
    // what every RJ45 carries: the choice made before, else everything on ETH1 — two groups on one cable is a trunk; ETH2 is free to choose
    const rows = rowsOf(inst), vids = uniq(rows.map(r => r.vlan)), kept = inst.advPorts ? portsOf(inst, rows, eth) : { 1:vids, 2:[] };
    for(const v of vids) if(!kept[1].includes(v) && !kept[2].includes(v)) kept[1].push(v);
    save(inst, kept);
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
    for(const e of [1, 2]) inst.advPorts[e] = uniq((inst.advPorts[e] || []).filter(v => vids.includes(Number(v))));
  }
  // a new group: on ETH1
  function placeNew(inst, vlan){
    if(!inst?.advPorts || vlan == null) return;
    if(![1, 2].some(e => (inst.advPorts[e] || []).map(Number).includes(Number(vlan)))) inst.advPorts[1] = uniq([...(inst.advPorts[1] || []), vlan]);
  }

  // ---- the HTML ----
  function html(dc, idx, inst, nt, warnHtml = ''){
    const eth = ethOf(nt), on = !!inst.advanced;
    const head = `<label class="nn-adv-sw" title="${esc(t('Send the VLAN groups to the node through its network API (/api/network_config) instead of one IP address', 'Stuur de VLAN-groepen via de netwerk-API van de node (/api/network_config) in plaats van één IP-adres'))}"><input type="checkbox" data-nnadv="${idx}" ${on ? 'checked' : ''}> <b>${t('Advanced network', 'Advanced netwerk')}</b> <span class="subtle">${t('VLAN groups on the node', 'VLAN-groepen op de node')}</span></label>`;
    if(!on) return `<div class="nn-adv">${head}</div>`;
    const rows = rowsOf(inst), ports = portsOf(inst, rows, eth), groups = F().luminexGroups(), vids = uniq(rows.map(r => r.vlan));
    const groupOpts = cur => { const list = groups.slice(); if(cur != null && !list.some(g => g.id === Number(cur))) list.unshift({ id:Number(cur), name:`VLAN ${cur}` }); return list.map(g => `<option value="${g.id}" ${Number(cur) === g.id ? 'selected' : ''}>${g.group ? `${t('Group', 'Groep')} ${g.group} · ` : ''}VLAN ${g.id} · ${esc(g.name)}</option>`).join(''); };
    const pipeOf = r => r.listen !== undefined && r.listen !== null ? String(r.listen) : defPipe(r.role);
    const warns = F().checkAll(rows.filter(r => r.ip).map(r => ({ owner:inst.id || 'node', ip:r.ip, mask:r.mask, vlan:r.vlan, kind:'device' })), fcfg().group).filter(w => w.code !== 'DUPLICATE').map(w => t(w.en, w.nl));
    for(const v of vids) if(!ports[1].includes(v) && !ports[2].includes(v)) warns.push(t(`VLAN ${v} is on no network port of this node — tick ETH1${eth > 1 ? ' or ETH2' : ''}.`, `VLAN ${v} zit op geen netwerkpoort van deze node — vink ETH1${eth > 1 ? ' of ETH2' : ''} aan.`));
    if(!rows.some(r => pipeOf(r)) && rows.some(r => r.listen !== undefined && r.listen !== null)) warns.push(t('No group takes part in the lighting data: choose input / output on the lighting group.', 'Geen enkele groep doet mee met de lichtdata: kies input / output bij de lichtgroep.'));
    const trs = rows.map(r => {
      const pipe = pipeOf(r), col = F().vlanById(r.vlan)?.color || '#94a3b8';
      return `<tr data-avk="${r.k}"><td><span class="av-dot" style="--c:${esc(col)}"></span><select data-av="vlan" title="${esc(t('The VLAN of a group is always the Luminex one', 'Het VLAN van een groep is altijd dat van Luminex'))}">${groupOpts(r.vlan)}</select></td>
        <td><select data-av="role" title="${esc(t('What the group is for: management → 10.90.x.x, lighting (sACN / Art-Net) and scan → 10.40.x.x in the FENT scheme', 'Waar de groep voor is: beheer → 10.90.x.x, licht (sACN / Art-Net) en scan → 10.40.x.x in het FENT-schema'))}">${Object.keys(ROLE_NAME).map(k => `<option value="${k}" ${r.role === k ? 'selected' : ''}>${esc(t(...ROLE_NAME[k]))}</option>`).join('')}</select></td>
        <td><input data-av="ip" class="mono ${r.ip && !F().isIp(r.ip) ? 'invalid' : ''}" value="${esc(r.ip)}" placeholder="10.40.101.11" inputmode="numeric" style="width:130px"></td>
        <td><input data-av="mask" class="mono" value="${esc(r.mask)}" placeholder="${F().MASK}" inputmode="numeric" style="width:120px"></td>
        <td><select data-av="listen" title="${esc(t('What lighting data may use this group: input = the node takes DMX in and sends it on the network, output = it takes the network data to its DMX ports', 'Welke lichtdata deze groep mag gebruiken: input = de node neemt DMX in en stuurt het het netwerk op, output = hij neemt netwerkdata naar zijn DMX-poorten'))}">${PIPES.map(([v, en, nl]) => `<option value="${v}" ${pipe === v ? 'selected' : ''}>${esc(t(en, nl))}</option>`).join('')}</select></td>
        ${Array.from({ length:eth }, (_, i) => `<td class="av-chk"><input type="checkbox" data-avport="${i + 1}" ${ports[i + 1].includes(r.vlan) ? 'checked' : ''} title="${esc(`ETH${i + 1}`)}"></td>`).join('')}
        <td>${r.k === 'p' ? '' : `<button class="sm ghost" data-avrm title="${esc(t('Remove this group', 'Verwijder deze groep'))}">${I('x', 13)}</button>`}</td></tr>`;
    }).join('');
    const portLine = e => { const v = ports[e]; return `<span class="av-port ${v.length > 1 ? 'trunk' : v.length ? 'access' : 'off'}"><b>ETH${e}</b> ${v.length > 1 ? `<span class="tag blue">trunk</span>` : v.length ? `<span class="tag">access</span>` : `<span class="tag">${t('not used', 'niet gebruikt')}</span>`} ${v.length ? `VLAN ${v.join(' + ')}` : ''}</span>`; };
    return `<div class="nn-adv on" data-advnode="${idx}">${head}
      <div class="av-wrap"><table class="data-table nn-adv-t av-t"><thead><tr><th>${t('Group (Luminex VLAN)', 'Groep (Luminex-VLAN)')}</th><th>${t('Used for', 'Gebruikt voor')}</th><th>${t('Address', 'Adres')}</th><th>${t('Mask', 'Mask')}</th><th>${t('Lighting data', 'Lichtdata')}</th>${Array.from({ length:eth }, (_, i) => `<th class="av-chk">ETH${i + 1}</th>`).join('')}<th></th></tr></thead><tbody>${trs}</tbody></table></div>
      <div class="av-bar"><button class="sm" data-avadd>${I('plus', 13)} ${t('Add group', 'Groep toevoegen')}</button><button class="sm" data-avfent title="${esc(t('Make the address of every group again with the FENT scheme (10.90.x.x management, 10.40.x.x lighting)', 'Maak het adres van elke groep opnieuw met het FENT-schema (10.90.x.x beheer, 10.40.x.x licht)'))}">${I('refresh', 13)} ${t('Addresses from the FENT scheme', 'Adressen volgens het FENT-schema')}</button>
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
            const was = suggest(dc, inst, row.role), ports = portsOf(inst, rows, eth), old = Number(row.vlan);
            write(inst, k, 'role', v);
            if(v !== 'other' && old === F().groupVlan(row.role)){
              const nv = F().groupVlan(v); write(inst, k, 'vlan', nv);
              const stays = rowsOf(inst).some(r => r.vlan === old);
              for(const e of [1, 2]) ports[e] = ports[e].includes(old) ? uniq([...ports[e].filter(x => stays || x !== old), nv]) : ports[e];
              save(inst, ports);
            }
            if(!row.ip || row.ip === was){ const ip = suggest(dc, inst, v); if(ip){ write(inst, k, 'ip', ip); write(inst, k, 'mask', row.mask || F().MASK); } }
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
        (inst.ifaces ||= []).push({ role, vlan:vid, ip:suggest(dc, inst, role), mask:F().MASK, eth:1 });
        ports[1] = uniq([...(ports[1] || []), vid]); save(inst, ports); done();
      };
      const fe = box.querySelector('[data-avfent]'); if(fe) fe.onclick = () => {
        label('addresses from the FENT scheme'); fentAll(dc, inst); done();
      };
    });
  }
  window.AdvNet = { html, bind, toggle, rowsOf, portsOf, moved, prune, placeNew, fentAll };
})();
