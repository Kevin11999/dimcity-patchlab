// core/luminex-api.js — read and configure Luminex devices through their documented HTTP APIs.
//   GigaCore generation 2  ("GigaCore WebApi 1.5.0", http://<ip>/api/doc)   groups = VLANs, trunks, port membership, names, IP
//   LumiNode / LumiCore    ("LumiNode/LumiCore WebApi 2.8.1")               names, IP, the universe of every DMX output port
// Everything here is plain logic on an injected transport  h(method, path, body) -> parsed JSON  (throws on an error),
// so the same code runs in the app (transport = main process, Basic auth), against a simulated device, and in tests.
// "plan" functions never talk to a device: they compare what a device has with what PatchLab wants and return the exact calls.

export const MAX_GROUP_NAME = 31, MAX_LEGEND = 16;
const clip = (s, n) => String(s ?? '').slice(0, n);
export const gcName = s => String(s ?? '').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().slice(0, 64);       // device name pattern ^[a-zA-Z0-9\-_ ]*$
export const prefixOf = mask => String(mask || '255.255.255.0').split('.').reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, '').length, 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = x => JSON.parse(JSON.stringify(x));

// ===================== GigaCore generation 2 =====================
export async function gigacoreRead(h){
  const [device, groups, trunks, ports, ip, mode, poeCap, poe] = await Promise.all([
    h('GET', '/api/device'), h('GET', '/api/groups/group'), h('GET', '/api/trunks/trunk'), h('GET', '/api/ports'), h('GET', '/api/ip_settings'),
    h('GET', '/api/config/mode').catch(() => null), h('GET', '/api/poe/capable').catch(() => false), h('GET', '/api/poe/ports').catch(() => null)]);
  // lists come back as an array or wrapped in an object ({ group:[…] }, { trunk:[…] }, { port:[…] }): accept both
  const arr = (x, ...keys) => Array.isArray(x) ? x : (keys.map(k => x?.[k]).find(Array.isArray) || (x && typeof x === 'object' ? Object.values(x).filter(v => v && typeof v === 'object') : []));
  const eink = await h('GET', '/api/eink').catch(() => null);
  return { device, groups: arr(groups, 'group'), trunks: arr(trunks, 'trunk'), ports: arr(ports, 'port'), ip, mode: typeof mode === 'string' ? mode : mode?.mode || null,
    poeCapable: poeCap === true, poe: arr(poe, 'port', 'ports').filter(x => x && typeof x === 'object'),
    eink: eink && typeof eink === 'object' && eink.present !== false ? eink : null };
}

// want = { name, ip:{address,mask,gateway}|null, groups:[{vid,name,color}], mgmtVid, ports:[{port,vid|null,trunk:bool,legend}] , trunkName }
// The management VLAN is untagged on the fibre trunk, so the switch stays reachable over the fibre.
export function gigacorePlan(cur, want, { withIp = false } = {}){
  const ops = [], notes = [];
  const add = (method, path, body, text, kind = 'config') => ops.push({ method, path, body, text, kind });
  if(cur.mode && cur.mode !== 'luminex') notes.push('The switch is in "advanced" configuration mode: changes made with the command line may not be shown correctly through the API.');
  // device name
  const nm = gcName(want.name);
  if(nm && nm !== cur.device?.name) add('PUT', '/api/device/name', nm, `Name “${cur.device?.name ?? ''}” → “${nm}”`);
  // groups (= VLANs), matched on the VLAN id
  const gid = new Map(), used = new Set(cur.groups.map(g => g.group_id));
  const nextId = () => { let i = 21; while(used.has(i)) i++; used.add(i); return i; };
  for(const g of want.groups){
    const have = cur.groups.find(x => x.vid === g.vid);
    const name = clip(g.name, MAX_GROUP_NAME), color = /^#[0-9a-f]{6}$/i.test(g.color || '') ? g.color : null;
    if(have){
      gid.set(g.vid, have.group_id);
      if(have.predefined){ if(name && have.name !== name) notes.push(`Group ${have.group_id} (VLAN ${g.vid}) is a built-in group of the switch — its name “${have.name}” is kept.`); }
      else {
      if(name && have.name !== name) add('PUT', `/api/groups/group/${have.group_id}/name`, name, `Group ${have.group_id} (VLAN ${g.vid}): name “${have.name}” → “${name}”`);
      if(color && String(have.color).toLowerCase() !== color.toLowerCase()) add('PUT', `/api/groups/group/${have.group_id}/color`, color, `Group ${have.group_id} (VLAN ${g.vid}): colour ${have.color} → ${color}`);
      }
    } else {
      const id = nextId(); gid.set(g.vid, id);
      add('POST', '/api/groups/group', { group_id: id, name: name || `VLAN ${g.vid}`, vid: g.vid, ...(color ? { color } : {}) }, `New group ${id}: VLAN ${g.vid} “${name || `VLAN ${g.vid}`}”`);
    }
  }
  // the fibre trunk: carries every group, the management VLAN untagged
  const fibrePorts = want.ports.filter(p => p.trunk).map(p => p.port);
  let trunkId = null;
  if(fibrePorts.length){
    const groupIds = want.groups.map(g => gid.get(g.vid)).filter(x => x != null).sort((a, b) => a - b);
    const untagged = want.mgmtVid != null && gid.has(want.mgmtVid) ? gid.get(want.mgmtVid) : 0;
    const tn = clip(want.trunkName || 'Fibre', 31);
    const have = cur.trunks.find(t => t.name === tn);
    if(have){
      trunkId = have.trunk_id;
      if(!same([...(have.groups || [])].sort((a, b) => a - b), groupIds)) add('PUT', `/api/trunks/trunk/${have.trunk_id}/groups`, groupIds, `Trunk “${tn}”: groups ${(have.groups || []).join(',') || '–'} → ${groupIds.join(',')}`);
      if((have.untagged_group ?? 0) !== untagged) add('PUT', `/api/trunks/trunk/${have.trunk_id}/untagged_group`, untagged, `Trunk “${tn}”: untagged group → ${untagged || 'none'}`);
    } else {
      const usedT = new Set(cur.trunks.map(t => t.trunk_id)); trunkId = 2; while(usedT.has(trunkId)) trunkId++;
      add('POST', '/api/trunks/trunk', { trunk_id: trunkId, name: tn, groups: groupIds, untagged_group: untagged }, `New trunk ${trunkId} “${tn}” with groups ${groupIds.join(',')}`);
    }
  }
  // ports: membership and legend
  const trunkNew = [];
  for(const p of want.ports){
    const have = cur.ports.find(x => x.port_number === p.port);
    if(!have){ notes.push(`Port ${p.port} does not exist on this switch.`); continue; }
    let target = null;
    if(p.trunk && trunkId != null) target = { type: 'trunk', id: trunkId };
    else if(p.vid != null && gid.has(p.vid)) target = { type: 'group', id: gid.get(p.vid) };
    if(target?.type === 'trunk' && !same({ type: have.member_of?.type, id: have.member_of?.id }, target)) trunkNew.push(p.port);
    else if(target && !same({ type: have.member_of?.type, id: have.member_of?.id }, target)) add('PUT', `/api/ports/port/${p.port}/member_of`, target, `Port ${p.port}: ${have.member_of?.type === 'group' ? `group ${have.member_of.id}` : have.member_of?.type === 'trunk' ? `trunk ${have.member_of.id}` : 'no group'} → ${target.type} ${target.id}${p.vid != null && !p.trunk ? ` (VLAN ${p.vid})` : ''}`);
    const lg = clip(p.legend, MAX_LEGEND);
    if(lg && lg !== (have.legend ?? '')) add('PUT', `/api/ports/port/${p.port}/legend`, lg, `Port ${p.port}: label “${have.legend ?? ''}” → “${lg}”`);
  }
  if(trunkNew.length){ const keep = cur.ports.filter(x => x.member_of?.type === 'trunk' && x.member_of.id === trunkId).map(x => x.port_number), all = [...new Set([...keep, ...trunkNew])].sort((a, b) => a - b); add('PUT', '/api/trunks/assign_ports', { id: trunkId, ports: all }, `Trunk “${want.trunkName || 'Fibre'}”: ports ${all.join(', ')}`); }
  // the IP address last: the switch moves
  if(withIp && want.ip?.address){
    const prefix = prefixOf(want.ip.mask);
    if(cur.ip?.ip_address !== want.ip.address || cur.ip?.prefix_length !== prefix || cur.ip?.mode !== 'static'){
      add('PUT', '/api/ip_settings/mode', 'static', `IP mode → static`, 'ip');
      add('PUT', '/api/ip_settings/prefix_length', prefix, `Prefix length → /${prefix}`, 'ip');
      if(want.ip.gateway) add('PUT', '/api/ip_settings/default_gateway', want.ip.gateway, `Gateway → ${want.ip.gateway}`, 'ip');
      add('PUT', '/api/ip_settings/ip_address', want.ip.address, `IP address ${cur.ip?.ip_address ?? '?'} → ${want.ip.address}`, 'ip');
    }
  }
  return { ops, notes, groupIds: Object.fromEntries(gid), trunkId };
}

// ---- one port at a time: name, VLAN (group / trunk), PoE and speed ----
export const SPEEDS = ['auto', '1gbps fdx', '100mbps fdx', '100mbps hdx', '10mbps fdx', '10mbps hdx', '10gbps fdx', '2.5gbps fdx'];
// what each port looks like on the switch, in a form a table can show
export function portRows(cur){
  return cur.ports.map(p => {
    const poe = cur.poe.find(x => x.port_number === p.port_number);
    const m = p.member_of || {}, grp = m.type === 'group' ? cur.groups.find(g => g.group_id === m.id) : null, tr = m.type === 'trunk' ? cur.trunks.find(t => t.trunk_id === m.id) : null;
    const ls = p.link_speed || {}, sp = Array.isArray(ls.speed) ? ls.speed : [];
    return { port: p.port_number, type: p.type || '', legend: p.legend ?? '', member: m.type ? { type: m.type, id: m.id } : null, vid: grp?.vid ?? null, groupName: grp?.name || tr?.name || '',
      poe: poe ? poe.enabled !== false : null, speed: ls.mode === 'fixed' && sp.length === 1 && sp[0] !== 'all' ? sp[0] : 'auto', link: p.link_state ?? null, enabled: p.enabled !== false };
  });
}
// Do the trunks of this switch list group numbers or VLAN ids? Looked up from the switch's own predefined trunk (which carries every group); group numbers if unsure.
export function trunkRefMode(cur){
  const tr = cur.trunks.find(t => t.predefined) || cur.trunks.find(t => t.trunk_id === 1);
  const list = tr?.groups || []; if(!list.length) return 'id';
  const ids = new Set(cur.groups.map(g => g.group_id)), vids = new Set(cur.groups.map(g => g.vid));
  const allIds = list.every(x => ids.has(x)), allVids = list.every(x => vids.has(x));
  return allVids && !allIds ? 'vid' : 'id';
}
// the trunk of this switch in words: name, VLANs it carries, which one is untagged, which ports sit in it
export function trunkInfo(cur, tid){
  const tr = cur.trunks.find(t => t.trunk_id === tid); if(!tr) return null;
  const ref = trunkRefMode(cur), g = x => (ref === 'vid' ? cur.groups.find(y => y.vid === x) : cur.groups.find(y => y.group_id === x));
  const un = tr.untagged_group ? g(tr.untagged_group) : null;
  return { id: tid, name: tr.name, predefined: !!tr.predefined, vlans: (tr.groups || []).map(x => g(x)?.vid ?? x), untaggedVid: un?.vid ?? null, untaggedGroup: tr.untagged_group ?? 0, ports: cur.ports.filter(p => p.member_of?.type === 'trunk' && p.member_of.id === tid).map(p => p.port_number) };
}
// After a trunk change: which of the ports that should sit in the trunk do not (according to the switch), and what it says about them
export function trunkMissing(cur, tid, ports){
  return ports.map(n => cur.ports.find(p => p.port_number === n)).filter(p => !p || p.member_of?.type !== 'trunk' || p.member_of.id !== tid).map(p => ({ port: p?.port_number, says: p ? JSON.stringify(p.member_of ?? null) : 'no such port' }));
}
// which of these VLANs does the trunk not carry (according to the switch)?
export function trunkMissingVlans(cur, tid, vids){
  const ti = trunkInfo(cur, tid); if(!ti) return vids.slice();
  const have = new Set(ti.vlans); return vids.filter(v => !have.has(v));
}
// the other documented way into a trunk: each port's own group membership
export const trunkFallbackOps = (tid, ports) => ports.map(n => ({ method: 'PUT', path: `/api/ports/port/${n}/member_of`, body: { type: 'trunk', id: tid }, text: `Port ${n}: member of trunk ${tid} (port by port)`, kind: 'config' }));

// change which VLAN is untagged on a trunk (vid = a VLAN id, or null / 0 for none)
export function gigacoreTrunkPlan(cur, tid, untaggedVid){
  const tr = cur.trunks.find(t => t.trunk_id === tid); if(!tr) return { ops: [], notes: [] };
  const ref = trunkRefMode(cur), g = untaggedVid ? cur.groups.find(x => x.vid === untaggedVid) : null;
  if(untaggedVid && !g) return { ops: [], notes: [`VLAN ${untaggedVid} does not exist on this switch.`] };
  const value = !g ? 0 : ref === 'vid' ? g.vid : g.group_id;
  if((tr.untagged_group ?? 0) === value) return { ops: [], notes: [] };
  return { ops: [{ method: 'PUT', path: `/api/trunks/trunk/${tid}/untagged_group`, body: value, text: `Trunk “${tr.name}”: untagged VLAN → ${untaggedVid || 'none'}`, kind: 'config' }], notes: [] };
}

// edits = [{ port, legend?, member?:{type,id}, poe?:bool, speed?:'auto'|'1gbps fdx'… }] -> calls, only for what differs
export function gigacorePortPlan(cur, edits){
  const ops = [], notes = [], rows = portRows(cur), trunkIn = new Map(), trunkOut = new Map();
  const add = (method, path, body, text, _kind, extra = {}) => ops.push({ method, path, body, text, kind: 'config', ...extra });
  // a member given as { type:'vid', vid, name, color } means "the group of this VLAN" — made first when the switch does not have it yet
  const used = new Set(cur.groups.map(g => g.group_id)), made = new Map();
  for(const e of edits) if(e.member?.type === 'vid'){
    const have = cur.groups.find(g => g.vid === e.member.vid);
    if(have) e.member = { type: 'group', id: have.group_id };
    else {
      if(!made.has(e.member.vid)){ let id = 21; while(used.has(id)) id++; used.add(id); made.set(e.member.vid, id); const nm = clip(e.member.name || `VLAN ${e.member.vid}`, MAX_GROUP_NAME); const col = /^#[0-9a-f]{6}$/i.test(e.member.color || '') ? e.member.color : null;
        add('POST', '/api/groups/group', { group_id: id, name: nm, vid: e.member.vid, ...(col ? { color: col } : {}) }, `New group ${id}: VLAN ${e.member.vid} “${nm}”`); }
      e.member = { type: 'group', id: made.get(e.member.vid), newVid: e.member.vid };
    }
  }
  // a member { type:'fibre', vids:[…], mgmtVid, groups:[{vid,name,color}] } means "the fibre trunk" — made / completed first, with every VLAN it has to carry
  const fib = edits.filter(e => e.member?.type === 'fibre');
  if(fib.length){
    const f = fib[0].member, tn = 'Fibre', pre = cur.trunks.find(t => t.predefined) || cur.trunks.find(t => t.trunk_id === 1);
    const idOf = vid => { const have = cur.groups.find(g => g.vid === vid); if(have) return have.group_id;
      if(!made.has(vid)){ let id = 21; while(used.has(id)) id++; used.add(id); made.set(vid, id); const g = (f.groups || []).find(x => x.vid === vid) || {}; const nm = clip(g.name || `VLAN ${vid}`, MAX_GROUP_NAME); const col = /^#[0-9a-f]{6}$/i.test(g.color || '') ? g.color : null;
        add('POST', '/api/groups/group', { group_id: id, name: nm, vid, ...(col ? { color: col } : {}) }, `New group ${id}: VLAN ${vid} “${nm}”`); }
      return made.get(vid); };
    if(pre && !f.own){
      // the switch's own trunk (named ISL on a real GigaCore). It carries the groups listed in it: the built-in ones, but NOT the groups made later, so those are added to it
      const ref = trunkRefMode(cur), ids = (f.vids || []).map(v => ({ v, id: idOf(v) }));
      const have = new Set(pre.groups || []), add2 = ids.map(x => (ref === 'vid' ? x.v : x.id)).filter(x => !have.has(x));
      if(add2.length) add('PUT', `/api/trunks/trunk/${pre.trunk_id}/groups`, [...(pre.groups || []), ...add2].sort((a, b) => a - b), `Trunk “${pre.name}”: also carry ${ref === 'vid' ? 'VLAN' : 'group'} ${add2.join(', ')}`, undefined, { soft: true, trunkGroups: true });
      for(const e of fib) e.member = { type: 'trunk', id: pre.trunk_id, name: pre.name, needVids: f.vids || [] };
    } else {
      const ref = trunkRefMode(cur);                           // does a trunk list group numbers or VLAN ids?
      const vids = [...new Set([...(f.vids || []), ...cur.trunks.filter(t => t.name === tn).flatMap(t => (t.groups || []).map(id => ref === 'vid' ? id : cur.groups.find(g => g.group_id === id)?.vid).filter(v => v != null))])];
      const list = vids.map(v => (ref === 'vid' ? (idOf(v), v) : idOf(v))).sort((a, b) => a - b), untagged = pre ? (pre.untagged_group ?? 0) : (f.mgmtVid != null && vids.includes(f.mgmtVid) ? (ref === 'vid' ? f.mgmtVid : idOf(f.mgmtVid)) : 0);       // the same untagged VLAN as the switch's own trunk, so the switch stays reachable
      const have = cur.trunks.find(t => t.name === tn); let tid;
      if(have){ tid = have.trunk_id;
        if(!same([...(have.groups || [])].sort((a, b) => a - b), list)) add('PUT', `/api/trunks/trunk/${tid}/groups`, list, `Trunk “${tn}”: ${ref === 'vid' ? 'VLANs' : 'groups'} → ${list.join(',')}`);
        if((have.untagged_group ?? 0) !== untagged) add('PUT', `/api/trunks/trunk/${tid}/untagged_group`, untagged, `Trunk “${tn}”: untagged → ${untagged || 'none'}`);
      } else { const ut = new Set(cur.trunks.map(t => t.trunk_id)); tid = 2; while(ut.has(tid)) tid++; add('POST', '/api/trunks/trunk', { trunk_id: tid, name: tn, groups: list, untagged_group: untagged }, `New trunk ${tid} “${tn}” with ${ref === 'vid' ? 'VLANs' : 'groups'} ${list.join(',')}`); }
      for(const e of fib) e.member = { type: 'trunk', id: tid, name: tn };
    }
  }
  for(const e of edits){
    const r = rows.find(x => x.port === e.port); if(!r){ notes.push(`Port ${e.port} does not exist on this switch.`); continue; }
    if(e.legend != null && clip(e.legend, MAX_LEGEND) !== r.legend) add('PUT', `/api/ports/port/${e.port}/legend`, clip(e.legend, MAX_LEGEND), `Port ${e.port}: name “${r.legend}” → “${clip(e.legend, MAX_LEGEND)}”`);
    if(e.member && e.member.type === 'trunk' && !same({ type: r.member?.type, id: r.member?.id }, { type: 'trunk', id: e.member.id })){
      (trunkIn.get(e.member.id) || trunkIn.set(e.member.id, []).get(e.member.id)).push(e.port);        // trunk membership goes through "assign ports to a trunk"
    } else if(e.member && !same({ type: r.member?.type, id: r.member?.id }, { type: e.member.type, id: e.member.id })){
      if(r.member?.type === 'trunk') (trunkOut.get(r.member.id) || trunkOut.set(r.member.id, []).get(r.member.id)).push(e.port);
      const to = e.member.type === 'group' ? (cur.groups.find(g => g.group_id === e.member.id) || (e.member.newVid != null ? { name: `VLAN ${e.member.newVid}`, vid: e.member.newVid } : null)) : cur.trunks.find(t => t.trunk_id === e.member.id);
      add('PUT', `/api/ports/port/${e.port}/member_of`, { type: e.member.type, id: e.member.id }, `Port ${e.port}: ${r.groupName || 'no group'} → ${to?.name || `${e.member.type} ${e.member.id}`}${e.member.type === 'group' && to?.vid != null ? ` (VLAN ${to.vid})` : ''}`);
    }
    if(e.poe != null){
      if(r.poe == null) notes.push(`Port ${e.port} has no PoE.`);
      else if(e.poe !== r.poe) add('PUT', `/api/poe/ports/${e.port}/enabled`, !!e.poe, `Port ${e.port}: PoE ${r.poe ? 'on' : 'off'} → ${e.poe ? 'on' : 'off'}`);
    }
    if(e.speed != null && e.speed !== r.speed){
      if(e.speed === 'auto') add('PUT', `/api/ports/port/${e.port}/link_speed/mode`, 'auto', `Port ${e.port}: speed ${r.speed} → auto`);
      else { add('PUT', `/api/ports/port/${e.port}/link_speed/speed`, [e.speed], `Port ${e.port}: speed ${r.speed} → ${e.speed}`); add('PUT', `/api/ports/port/${e.port}/link_speed/mode`, 'fixed', `Port ${e.port}: speed fixed`); }
    }
  }
  for(const [tid, list] of trunkIn){
    const tr = cur.trunks.find(t => t.trunk_id === tid), keep = rows.filter(r => r.member?.type === 'trunk' && r.member.id === tid && !(trunkOut.get(tid) || []).includes(r.port)).map(r => r.port);
    const all = [...new Set([...keep, ...list])].sort((a, b) => a - b);
    const nv = edits.find(e => e.member?.type === 'trunk' && e.member.id === tid)?.member?.needVids;
    add('PUT', '/api/trunks/assign_ports', { id: tid, ports: all }, `Trunk “${tr?.name || 'Fibre'}”: ports ${all.join(', ')}`, undefined, { needVids: nv || [] });
  }
  return { ops, notes };
}

// the device itself: name and (last) the IP address
export function gigacoreDevicePlan(cur, { name, ip } = {}, { withIp = false } = {}){
  const r = gigacorePlan(cur, { name, ip, groups: [], ports: [] }, { withIp });
  return { ops: r.ops, notes: r.notes.filter(n => !/advanced/.test(n)) };
}

// ---- the lights of a GigaCore: port LEDs show the colour of the group the port is in, and the front panel can show one colour on all ports ----
export const hslHex = (h, s = 1, l = 0.5) => { const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
export const RAINBOW_STATES = ['all_red', 'all_yellow', 'all_green', 'all_cyan', 'all_blue', 'all_magenta'];
// recolour the groups (and the own trunk) in use evenly over the rainbow, left to right along the ports; returns the calls and the colours that were there
export function rainbowPlan(cur){
  const order = []; const seen = new Set();
  for(const p of [...cur.ports].sort((a, b) => a.port_number - b.port_number)){ const m = p.member_of; if(!m?.type || m.type === 'none') continue; const k = `${m.type}:${m.id}`; if(!seen.has(k)){ seen.add(k); order.push(m); } }
  const ops = [], before = [], n = order.length, targets = [];
  order.forEach((m, i) => {
    const color = hslHex(Math.round(300 * i / Math.max(1, n - 1)));          // red … magenta, never wrapping back to red
    if(m.type === 'group'){ const g = cur.groups.find(x => x.group_id === m.id); if(g){ before.push({ path: `/api/groups/group/${g.group_id}/color`, color: g.color }); targets.push(`/api/groups/group/${g.group_id}/color`); ops.push({ method: 'PUT', path: `/api/groups/group/${g.group_id}/color`, body: color, text: `Group ${g.group_id} “${g.name}”: colour → ${color}`, kind: 'config', soft: true }); } }
    else if(m.type === 'trunk'){ const t = cur.trunks.find(x => x.trunk_id === m.id); if(t && !t.predefined){ before.push({ path: `/api/trunks/trunk/${t.trunk_id}/color`, color: t.color }); targets.push(`/api/trunks/trunk/${t.trunk_id}/color`); ops.push({ method: 'PUT', path: `/api/trunks/trunk/${t.trunk_id}/color`, body: color, text: `Trunk “${t.name}”: colour → ${color}`, kind: 'config', soft: true }); } }
  });
  return { ops, before, targets };
}

// ---- the e-ink display of a GigaCore 20t: show your own picture or text ----
export const pngSize = b64 => { const bin = atob(String(b64).slice(0, 64)); const u = i => (bin.charCodeAt(i) << 24 | bin.charCodeAt(i + 1) << 16 | bin.charCodeAt(i + 2) << 8 | bin.charCodeAt(i + 3)) >>> 0; return bin.slice(1, 4) === 'PNG' ? { w: u(16), h: u(20) } : null; };
export async function einkSize(h){ const r = await h('GET', '/api/eink/screenshot', undefined, { asBase64: true }); return { ...(pngSize(r.base64) || { w: 0, h: 0 }), screenshot: r.base64 }; }
// upload as a preview (does not touch the picture on the display), and give back what the device made of it
export async function einkPreview(h, b64){ await h('PUT', '/api/eink/custom/upload?preview=true', undefined, { bodyBase64: b64 }); return (await h('GET', '/api/eink/custom/download?preview=true', undefined, { asBase64: true })).base64; }
export async function einkShow(h){ await h('PUT', '/api/eink/custom/apply', {}); await h('PUT', '/api/eink/mode', 'custom'); }
export const einkStandard = h => h('PUT', '/api/eink/mode', 'standard');
export const einkClear = async h => { await h('PUT', '/api/eink/custom/clear', {}); await h('PUT', '/api/eink/mode', 'standard'); };

// ===================== LumiNode / LumiCore =====================
const NET = new Set(['artnet', 'sacn']);
const idsIn = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : v == null ? [] : [v]).map(Number).filter(Number.isFinite);
export async function lumiRead(h){
  const [info, ip, ios, blocks, ver, netcfg] = await Promise.all([h('GET', '/api/deviceinfo'), h('GET', '/api/ipsettings'), h('GET', '/api/IO'), h('GET', '/api/processblock'), h('GET', '/api/software/version').catch(() => null), h('GET', '/api/network_config').catch(() => null)]);
  const list = Array.isArray(ios) ? ios : [];
  const dmx = list.filter(x => x.io_class === 'dmx').sort((a, b) => (a.port_number ?? a.id) - (b.port_number ?? b.id));   // IO 100000 = port 1
  const byId = new Map(list.map(x => [x.id, x]));
  const pb = Array.isArray(blocks) ? blocks : [];
  const usedBy = id => pb.filter(b => idsIn(b.inputs).includes(id) || idsIn(b.outputs).includes(id)).length;
  const ports = dmx.map((io, i) => {
    const dir = io.io_type === 'input' ? 'input' : io.io_type === 'output' ? 'output' : 'idle';
    // an output port is fed by the network input in slot 0 of the block that has it as output; an input port feeds the network output of the block that has it as input
    const owner = pb.filter(b => (dir === 'input' ? idsIn(b.inputs) : idsIn(b.outputs)).includes(io.id));
    const block = owner.length === 1 ? owner[0] : null;
    const freeBlock = !block ? pb.find(b => b.id === i && !idsIn(b.outputs).includes(io.id) && !idsIn(b.inputs).includes(io.id) && !idsIn(b.outputs).length) || null : null;
    const b0 = block || (dir === 'output' ? freeBlock : null);      // a block with no output yet still has the input that should feed this port
    let net = null;
    if(b0) net = dir === 'input' ? idsIn(b0.outputs).map(id => byId.get(id)).find(x => x && NET.has(x.io_class)) : (byId.get(Number(b0.inputs?.[0] ?? b0.inputs?.['0'])) || null);
    if(net && !NET.has(net.io_class)) net = null;
    return { index: i, io, name: io.name ?? '', dir, block, freeBlock, net, input: net, universe: net?.universe ?? null, klass: net?.io_class || null, shared: net ? usedBy(net.id) > 1 : false, understood: !!block || dir === 'idle' || !!freeBlock };
  });
  return { info, ip, ios: list, blocks: pb, ports, version: typeof ver === 'object' && ver ? ver.current : null, netcfg: netcfg && typeof netcfg === 'object' && netcfg.groups ? netcfg : null };
}

// ---- LumiNode advanced network (/api/network_config) ----
// A LumiNode in its basic configuration has one address (/api/ipsettings). In the advanced configuration it has VLAN groups, each with its own
// addresses (CIDR) and a "pipeline" (does lighting go in / out on this group), and every RJ45 port sits in one group or in a trunk of several.
//   GET  /api/network_config            { is_basic_config, groups:{ id:{ name, vid, color, editable, network_settings:{ addresses:[{ ip:'10.40.101.11/16', mode, preferred_output }], routes, pipeline_setting, allow_config } } },
//                                         ports:{ name:{ group, trunk, link_speed, link_state, type } }, trunks:{ id:{ name, groups:[ids], untagged_group, color } }, stp_mode }
//   POST /api/network_config/validate   the same body → 204 or an error;  PUT /api/network_config  (with configuration_identifier it waits)  ·  POST /api/network_config/commit { configuration_identifier, timeout }
export const maskToPrefix = m => { const p = String(m || '').split('.').map(Number); if(p.length !== 4 || p.some(x => !(x >= 0 && x <= 255))) return 24; let n = 0; for(const x of p) for(let i = 7; i >= 0; i--) if((x >> i) & 1) n++; return n; };
// what the plan wants on a node: ifs = [{ role, vlan, ip, mask, eth, listen }] (Fent.ifaces), vlanOf(id) → { name, color },
// portVids = { 1:[VLAN ids], 2:[…] } what every RJ45 carries (when it was chosen per port); without it a port carries the VLANs of its addresses.
// A group is a VLAN: its addresses, and what lighting data it takes part in (pipe: '' | 'input' | 'output' | 'input+output').
export function lumiNetWant(ifs, ethCount = 1, vlanOf = () => null, portVids = null){
  const groups = new Map(), mk = vid => { const v = vlanOf(vid) || {}; return { vid:Number(vid), name:String(v.name || `VLAN ${vid}`).slice(0, 31), color:/^#[0-9a-f]{6}$/i.test(v.color || '') ? v.color : '#808080', addresses:[], pipe:'', listen:false, mgmt:false }; };
  for(const x of ifs || []){
    if(x.vlan == null) continue;
    const g = groups.get(x.vlan) || mk(x.vlan);
    if(x.ip) g.addresses.push({ ip:x.ip, prefix:maskToPrefix(x.mask || '255.255.0.0'), eth:Number(x.eth) || 1, role:x.role || 'lighting' });
    if(x.role === 'management') g.mgmt = true;
    const pipe = x.listen !== undefined && x.listen !== null ? String(x.listen) : (x.role === 'management' ? '' : 'input+output');
    if(pipe && !g.pipe) g.pipe = pipe;
    groups.set(x.vlan, g);
  }
  // only management addresses (and nothing chosen): that group carries the lighting too
  if(groups.size && !(ifs || []).some(x => x.listen !== undefined && x.listen !== null) && ![...groups.values()].some(g => g.pipe)) for(const g of groups.values()) g.pipe = 'input+output';
  const ports = Array.from({ length:Math.max(1, ethCount) }, (_, i) => ({ eth:i + 1, vids:portVids ? [...new Set((portVids[i + 1] || []).map(Number).filter(Number.isFinite))] : [...new Set((ifs || []).filter(x => (Number(x.eth) || 1) === i + 1 && x.vlan != null && x.ip).map(x => Number(x.vlan)))] }));
  for(const p of ports) for(const v of p.vids) if(!groups.has(v)) groups.set(v, mk(v));           // a port can carry a VLAN that has no address of its own
  for(const g of groups.values()) g.listen = !!g.pipe;
  return { groups:[...groups.values()].sort((a, b) => a.vid - b.vid), ports };
}
const sameSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((x, i) => x === [...b].sort((p, q) => p - q)[i]);
export const prefixToMask = p => { const n = Math.max(0, Math.min(32, Number(p) || 0)); return [0, 1, 2, 3].map(i => Math.max(0, Math.min(8, n - i * 8))).map(b => (256 - (1 << (8 - b))) & 255).join('.'); };
// the calls that bring a node to the wanted network: validate, send, commit. want = lumiNetWant(...)
//   currentIp       the address this node is reached on now: when the wanted network no longer has it, the node moves (result.moveTo / moveMask)
//   keepAddresses   the groups the node has already keep their addresses (only the lighting data and the ports are set); new groups get theirs
export function lumiNetPlan(cur, want, { id = Date.now(), currentIp = '', keepAddresses = false } = {}){
  const ops = [], notes = [], changes = [], nc = cur?.netcfg;
  if(!want?.groups?.length) return { ops, notes, changes, moveTo:null, moveMask:null };
  if(!nc){ notes.push('This LumiNode does not offer the advanced network (no /api/network_config) — only its basic IP address can be set.'); return { ops, notes, changes, moveTo:null, moveMask:null }; }
  const next = { groups:clone(nc.groups || {}), trunks:clone(nc.trunks || {}), ports:clone(nc.ports || {}), stp_mode:nc.stp_mode || 'rstp', allow_ipv6_only_configurability:!!nc.allow_ipv6_only_configurability };
  const gid = new Map(Object.entries(next.groups).map(([k, g]) => [Number(g.vid), Number(k)]));
  let top = Math.max(0, ...Object.keys(next.groups).map(Number)), ttop = Math.max(0, ...Object.keys(next.trunks).map(Number));
  const cidr = a => `${a.ip}/${a.prefix}`;
  for(const g of want.groups){
    let k = gid.get(g.vid), fresh = false;
    if(k == null){ if(top >= 255){ notes.push(`No room for a group for VLAN ${g.vid} (a node holds 255 groups).`); continue; } k = ++top; fresh = true; next.groups[k] = { name:g.name, vid:g.vid, color:g.color, editable:true, network_settings:{ addresses:[], routes:[], pipeline_setting:'', allow_config:true } }; gid.set(g.vid, k); }
    const ns = (next.groups[k].network_settings ||= { addresses:[], routes:[], pipeline_setting:'', allow_config:true });
    if(!fresh && !g.addresses.length) continue;       // a group the node has and the plan gives no address: leave it as it is (its ports are still set below)
    const old = (ns.addresses || []).map(a => a.ip), wantIps = g.addresses.map(cidr), keep = keepAddresses && !fresh;
    const addrs = keep ? ns.addresses : g.addresses.map((a, i) => ({ ip:cidr(a), mode:'static', ...(g.addresses.length > 1 && i === 0 ? { preferred_output:true } : {}) }));
    const pipe = g.pipe ?? (g.listen ? 'input+output' : '');
    if(fresh) changes.push(`New group ${k} “${g.name}” (VLAN ${g.vid}): ${wantIps.join(', ')}${g.listen ? ' · lighting' : ''}`);
    else {
      if(!keep && old.join() !== wantIps.join()) changes.push(`Group ${k} “${next.groups[k].name}” (VLAN ${g.vid}): ${old.join(', ') || 'no address'} → ${wantIps.join(', ')}`);
      if((ns.pipeline_setting || '') !== pipe) changes.push(`Group ${k} “${next.groups[k].name}”: lighting ${ns.pipeline_setting ? `“${ns.pipeline_setting}”` : 'off'} → ${pipe ? `“${pipe}”` : 'off'}`);
    }
    ns.addresses = addrs; ns.pipeline_setting = pipe; if(g.mgmt) ns.allow_config = true;
  }
  const rj = Object.entries(next.ports).filter(([, p]) => (p.type || 'rj45') === 'rj45').map(([name]) => name);
  (want.ports || []).forEach((wp, i) => {
    const name = rj[i]; if(!name){ if(wp.vids.length) notes.push(`This node has no network port ${i + 1}.`); return; }
    const ids = wp.vids.map(v => gid.get(v)).filter(x => x != null); if(!ids.length) return;
    const port = next.ports[name];
    if(ids.length === 1){
      if(port.group !== ids[0] || port.trunk != null) changes.push(`Port ${name}: ${port.trunk != null ? `trunk ${port.trunk}` : port.group != null ? `group ${port.group}` : 'no group'} → group ${ids[0]}`);
      port.group = ids[0]; port.trunk = null;
    } else {
      let tid = Object.entries(next.trunks).find(([, tr]) => sameSet(tr.groups || [], ids))?.[0];
      if(tid == null){ tid = ++ttop; const mg = want.groups.find(g => g.mgmt && ids.includes(gid.get(g.vid))); next.trunks[tid] = { name:`Trunk ${wp.vids.join('+')}`.slice(0, 31), groups:[...ids], untagged_group:mg ? gid.get(mg.vid) : null, color:'#38bdf8', editable:true }; changes.push(`New trunk ${tid} “${next.trunks[tid].name}” with groups ${ids.join(', ')}`); }
      if(Number(port.trunk) !== Number(tid)) changes.push(`Port ${name}: ${port.trunk != null ? `trunk ${port.trunk}` : port.group != null ? `group ${port.group}` : 'no group'} → trunk ${tid} (VLAN ${wp.vids.join(' + ')})`);
      port.trunk = Number(tid); port.group = null;
    }
  });
  if(nc.is_basic_config) changes.unshift('Switch the node to the advanced network configuration');
  // does the node still answer on the address it is reached on now? If not it moves: to the address of its management group (else the first one)
  const reach = Object.values(next.groups).filter(g => g.network_settings?.allow_config !== false).flatMap(g => (g.network_settings?.addresses || []).map(a => a.ip));
  let moveTo = null, moveMask = null;
  if(currentIp && reach.length && !reach.some(a => a.split('/')[0] === currentIp)){
    const mg = want.groups.find(g => g.mgmt && g.addresses.length), pick = mg ? cidr(mg.addresses[0]) : reach[0];
    moveTo = pick.split('/')[0]; moveMask = prefixToMask(pick.split('/')[1]);
  }
  if(!changes.length && !nc.is_basic_config) return { ops, notes, changes, moveTo:null, moveMask:null };
  const ports = Object.fromEntries(Object.entries(next.ports).map(([k, p]) => [k, { group:p.group ?? null, trunk:p.trunk ?? null, ...(p.link_speed ? { link_speed:p.link_speed } : {}), ...(p.type ? { type:p.type } : {}) }]));
  const body = { is_basic_config:false, allow_ipv6_only_configurability:next.allow_ipv6_only_configurability, configuration_identifier:id, groups:next.groups, trunks:next.trunks, ports, stp_mode:next.stp_mode };
  ops.push({ method:'POST', path:'/api/network_config/validate', body, text:`Check the new network configuration (${changes.length} change${changes.length === 1 ? '' : 's'})`, kind:'net' });
  ops.push({ method:'PUT', path:'/api/network_config', body, text:changes.join(' · '), kind:'net' });
  ops.push({ method:'POST', path:'/api/network_config/commit', body:{ configuration_identifier:id, timeout:0 }, text:`Activate it${moveTo ? ` — the node moves to ${moveTo}` : ' — the node may stop answering on its old address'}`, kind:'net' });
  return { ops, notes, changes, moveTo, moveMask };
}

// What PatchLab shows as a universe number: sACN as it is; Art-Net as the node shows it, minus `offset` (0 = the same number, the default).
export const uniShown = (p, offset = 0) => (p.universe == null ? null : p.klass === 'artnet' ? p.universe - offset : p.universe);

// want = { shortName, longName, ip:{address,mask,gateway}|null, ports:[ { name?, dir?:'output'|'input'|'idle', klass?:'sacn'|'artnet', universe? } per port, null = untouched ] }
// opt = { artnetOffset (0), protocol:'sacn'|'artnet' for inputs made without a stated protocol }
export function lumiPlan(cur, want, { withIp = false, artnetOffset = 0, protocol = 'sacn' } = {}){
  const ops = [], notes = [];
  const add = (method, path, body, text, kind = 'config', extra = {}) => ops.push({ method, path, body, text, kind, ...extra });
  const sn = clip(want.shortName, 17), ln = clip(want.longName, 63);
  if((sn && sn !== cur.info?.short_name) || (ln && ln !== cur.info?.long_name))
    add('PUT', '/api/deviceinfo', { ID: cur.info?.ID ?? 0, colors: cur.info?.colors || [], short_name: sn || cur.info?.short_name || '', long_name: ln || cur.info?.long_name || '' },
      `Name “${cur.info?.short_name ?? ''}” → “${sn}”${ln ? `, long name “${cur.info?.long_name ?? ''}” → “${ln}”` : ''}`);
  const api = (u, klass) => (klass === 'sacn' ? Math.max(1, Number(u)) : Math.max(0, Number(u) + artnetOffset));
  const label = k => (k === 'sacn' ? 'sACN' : 'Art-Net');
  (want.ports || []).forEach((e, i) => {
    if(!e) return;
    const p = cur.ports[i]; if(!p){ notes.push(`DMX port ${i + 1} does not exist on this device.`); return; }
    const w = { name: e.name != null ? clip(e.name, 64) : p.name, dir: e.dir ?? p.dir, klass: e.klass ?? p.klass ?? protocol, universe: e.universe != null && e.universe !== '' ? Number(e.universe) : uniShown(p, artnetOffset) };
    const nameCh = w.name !== p.name, dirCh = w.dir !== p.dir, klassCh = !!p.net && w.klass !== p.klass, uniCh = w.universe != null && w.universe !== uniShown(p, artnetOffset);
    if(!nameCh && !dirCh && !klassCh && !uniCh) return;
    const P = `DMX ${i + 1}`, dmxId = p.io.id;
    const block = p.block || p.freeBlock;
    // the port itself: name and direction, the whole IO is sent back (firmware 2.6 insists on rdm_universe)
    if(nameCh || dirCh) add('PUT', `/api/IO/${dmxId}`, { ...p.io, name: w.name, io_type: w.dir, rdm_universe: p.io.rdm_universe ?? -1 },
      `${P}: ${[nameCh ? `name “${p.name}” → “${w.name}”` : '', dirCh ? `${p.dir === 'idle' ? 'off' : p.dir} → ${w.dir === 'idle' ? 'off' : w.dir}` : ''].filter(Boolean).join(', ')}`);
    if(w.dir === 'idle') return;
    const b = block?.id;
    const out = (txt, io) => add('PUT', `/api/processblock/${b}/output`, typeof io === 'function' ? c => ({ io_id: io(c) }) : { io_id: io }, txt);
    const inp = (txt, io) => add('PUT', `/api/processblock/${b}/input/0`, typeof io === 'function' ? c => ({ io_id: io(c) }) : { io_id: io }, txt);
    const del = (txt, path) => add('DELETE', path, undefined, txt);
    let connected = false;
    if(!p.block && p.freeBlock && w.dir === 'output'){ out(`${P}: connect the DMX output to process block ${b}`, dmxId); connected = true; }   // an output that hangs on no block yet
    const needNet = !p.net || dirCh || klassCh;
    if(!needNet){                                              // same kind of input / output, only the universe
      if(p.shared){ notes.push(`${P}: its ${label(p.klass)} ${p.dir === 'input' ? 'output' : 'input'} is shared with another process block — universe not changed.`); return; }
      const { duplicate_ios, ...rest } = p.net;
      add('PUT', `/api/IO/${p.net.id}`, { ...rest, universe: api(w.universe, p.klass) }, `${P}: universe ${uniShown(p, artnetOffset)} → ${w.universe} (${label(p.klass)}${p.klass === 'artnet' ? ` ${api(w.universe, 'artnet')}` : ''})`);
      return;
    }
    if(w.universe == null){ notes.push(`${P}: fill in a universe.`); return; }
    if(!block){ notes.push(`${P}: no process block found for this port — not changed.`); return; }
    if(p.net && p.shared){ notes.push(`${P}: its ${p.dir === 'input' ? 'output' : 'input'} is shared with another process block — not changed.`); return; }
    const newDir = w.dir === 'output' ? 'input' : 'output', uni = api(w.universe, w.klass);
    const body = { io_class: w.klass, io_type: newDir, universe: uni, name: `U${w.universe}`, ...(w.klass === 'sacn' ? { priority: 100 } : {}) };
    const mk = `new ${label(w.klass)} ${newDir} for universe ${w.universe}`;
    if(w.dir === 'output'){                                    // network input -> process block -> DMX output
      if(p.dir === 'input' && p.net) del(`${P}: disconnect its ${label(p.klass)} output`, `/api/processblock/${b}/output/${p.net.id}`);
      if(p.dir !== 'output' && !connected) out(`${P}: connect the DMX output to process block ${b}`, dmxId);
      add('POST', '/api/IO', body, `${P}: ${mk}`, 'io-new', { saveAs: 'n' });
      inp(`${P}: … and connect it to process block ${b}`, c => c.n);
    } else {                                                   // DMX input -> process block -> network output
      if(p.dir === 'output') del(`${P}: disconnect the DMX output from process block ${b}`, `/api/processblock/${b}/output/${dmxId}`);
      else if(p.dir === 'input' && p.net) del(`${P}: disconnect its ${label(p.klass)} output`, `/api/processblock/${b}/output/${p.net.id}`);
      inp(`${P}: connect the DMX input to process block ${b}`, dmxId);
      add('POST', '/api/IO', body, `${P}: ${mk}`, 'io-new', { saveAs: 'n' });
      out(`${P}: … and connect it to process block ${b}`, c => c.n);
    }
    if(p.net) del(`${P}: remove the old ${label(p.klass)} ${p.dir === 'input' ? 'output' : 'input'}`, `/api/IO/${p.net.id}`);
  });
  if(withIp && want.ip?.address){
    const cip = cur.ip;
    if(cip?.ipaddress !== want.ip.address || cip?.netmask !== want.ip.mask)
      add('PUT', '/api/ipsettings', { ipaddress: want.ip.address, netmask: want.ip.mask || '255.255.255.0', gateway: want.ip.gateway || '0.0.0.0' }, `IP address ${cip?.ipaddress ?? '?'} → ${want.ip.address}`, 'ip');
  }
  return { ops, notes };
}

// run the calls one after the other (stops at the first error). A call can carry its body / path as a function of what earlier calls
// returned (ctx), and save the id a POST gives back with saveAs; `after` is the older single follow-up.
export async function runOps(h, ops, onStep = () => {}){
  const done = [], ctx = {};
  for(const op of ops){
    onStep(op, 'start');
    const path = typeof op.path === 'function' ? op.path(ctx) : op.path, body = typeof op.body === 'function' ? op.body(ctx) : op.body;
    let r;
    try { r = await h(op.method, path, body); }
    catch(e) { if(op.soft){ op.failed = String(e.message || e); done.push(op); onStep(op, 'failed'); continue; } throw e; }       // a soft call (like a colour) may be refused without stopping the rest
    if(op.saveAs) ctx[op.saveAs] = r?.index ?? r?.id;
    done.push(op);
    if(op.after){ const a = op.after; await h(a.method, a.path, a.bodyFromResult ? a.bodyFromResult(r) : a.body); }
    onStep(op, 'done');
  }
  return done;
}
