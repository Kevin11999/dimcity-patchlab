// core/luminex-api.js — read and configure Luminex devices through their documented HTTP APIs.
//   GigaCore generation 2  ("GigaCore WebApi 1.5.0", http://<ip>/api/doc)   groups = VLANs, trunks, port membership, names, IP
//   LumiNode / LumiCore    ("LumiNode/LumiCore WebApi 2.8.1")               names, IP, the universe of every DMX output port
// Everything here is plain logic on an injected transport  h(method, path, body) -> parsed JSON  (throws on an error),
// so the same code runs in the app (transport = main process, Basic auth), against a simulated device, and in tests.
// "plan" functions never talk to a device: they compare what a device has with what PatchLab wants and return the exact calls.

export const MAX_GROUP_NAME = 31, MAX_LEGEND = 16;
const clip = (s, n) => String(s ?? '').slice(0, n);
const clipBytes = (s, n) => { let out = '', used = 0; for(const ch of String(s ?? '')){ const b = new TextEncoder().encode(ch).length; if(used + b > n) break; out += ch; used += b; } return out; };      // group names are limited in bytes, not characters
export const gcName = s => String(s ?? '').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().slice(0, 64);       // device name pattern ^[a-zA-Z0-9\-_ ]*$
export const DEFAULT_MASK = '255.255.0.0';
export const prefixOf = mask => String(mask || DEFAULT_MASK).split('.').reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, '').length, 0);
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

// want = { name, ip:{address,mask,gateway}|null, groups:[{vid,name,color}], mgmtVid, ports:[{port,vid|null,trunk:bool,legend}] }
// Trunk ports go in the switch's own predefined trunk (it carries all the built-in VLANs and stays reachable over the fibre).
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
  // name and colour of a group the switch already has. VLAN 1 (the management group) is left as it is; a built-in group the switch refuses is a soft call
  const look = (have, vid, name, color) => {
    if(vid === 1 || have.vid === 1) return;
    const soft = !!have.predefined;
    if(name && have.name !== name){ add('PUT', `/api/groups/group/${have.group_id}/name`, name, `Group ${have.group_id} (VLAN ${vid}): name “${have.name}” → “${name}”`); ops[ops.length - 1].soft = soft; }
    if(color && String(have.color).toLowerCase() !== color.toLowerCase()){ add('PUT', `/api/groups/group/${have.group_id}/color`, color, `Group ${have.group_id} (VLAN ${vid}): colour ${have.color} → ${color}`); ops[ops.length - 1].soft = soft; }
  };
  for(const g of want.groups){
    const have = cur.groups.find(x => x.vid === g.vid);
    const name = clipBytes(g.name, MAX_GROUP_NAME), color = /^#[0-9a-f]{6}$/i.test(g.color || '') ? g.color : null;
    if(have){
      gid.set(g.vid, have.group_id);
      // the name and colour of the plan are always sent, also for the built-in groups (1–20), so every device in the system has the same group names;
      // a built-in group may be refused by the switch: that is reported, the rest of the configuration goes on
      look(have, g.vid, name, color);
    } else {
      const id = nextId(); gid.set(g.vid, id);
      add('POST', '/api/groups/group', { group_id: id, name: name || `VLAN ${g.vid}`, vid: g.vid, ...(color ? { color } : {}) }, `New group ${id}: VLAN ${g.vid} “${name || `VLAN ${g.vid}`}”`);
    }
  }
  // every other VLAN of the VLAN overview: the groups the switch has already (the 20 standard ones) get the name and colour of the overview, so every device has the same names
  for(const g of want.names || []){
    if(want.groups.some(x => x.vid === g.vid)) continue;
    const have = cur.groups.find(x => x.vid === g.vid); if(!have) continue;
    look(have, g.vid, clipBytes(g.name, MAX_GROUP_NAME), /^#[0-9a-f]{6}$/i.test(g.color || '') ? g.color : null);
  }
  // the trunk: always the switch's own predefined trunk (never a trunk of our own); groups made later are added to it
  const fibrePorts = want.ports.filter(p => p.trunk).map(p => p.port);
  let trunkId = null, trunkLabel = 'trunk';
  if(fibrePorts.length){
    const pre = cur.trunks.find(t => t.predefined) || cur.trunks.find(t => t.trunk_id === 1);
    if(!pre) notes.push('This switch has no predefined trunk — the ports were not put in a trunk.');
    else {
      trunkId = pre.trunk_id; trunkLabel = pre.name;
      const ref = trunkRefMode(cur), ids = want.groups.map(g => (ref === 'vid' ? g.vid : gid.get(g.vid))).filter(x => x != null), have = new Set(pre.groups || []), more = ids.filter(x => !have.has(x));
      if(more.length) add('PUT', `/api/trunks/trunk/${pre.trunk_id}/groups`, [...(pre.groups || []), ...more].sort((a, b) => a - b), `Trunk “${pre.name}”: also carry ${ref === 'vid' ? 'VLAN' : 'group'} ${more.join(', ')}`);
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
  if(trunkNew.length){ const keep = cur.ports.filter(x => x.member_of?.type === 'trunk' && x.member_of.id === trunkId).map(x => x.port_number), all = [...new Set([...keep, ...trunkNew])].sort((a, b) => a - b); add('PUT', '/api/trunks/assign_ports', { id: trunkId, ports: all }, `Trunk “${trunkLabel}”: ports ${all.join(', ')}`); }
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
      if(!made.has(e.member.vid)){ let id = 21; while(used.has(id)) id++; used.add(id); made.set(e.member.vid, id); const nm = clipBytes(e.member.name || `VLAN ${e.member.vid}`, MAX_GROUP_NAME); const col = /^#[0-9a-f]{6}$/i.test(e.member.color || '') ? e.member.color : null;
        add('POST', '/api/groups/group', { group_id: id, name: nm, vid: e.member.vid, ...(col ? { color: col } : {}) }, `New group ${id}: VLAN ${e.member.vid} “${nm}”`); }
      e.member = { type: 'group', id: made.get(e.member.vid), newVid: e.member.vid };
    }
  }
  // a member { type:'fibre', vids:[…], mgmtVid, groups:[{vid,name,color}] } means "the fibre trunk" — made / completed first, with every VLAN it has to carry
  const fib = edits.filter(e => e.member?.type === 'fibre');
  if(fib.length){
    const f = fib[0].member, pre = cur.trunks.find(t => t.predefined) || cur.trunks.find(t => t.trunk_id === 1);
    const idOf = vid => { const have = cur.groups.find(g => g.vid === vid); if(have) return have.group_id;
      if(!made.has(vid)){ let id = 21; while(used.has(id)) id++; used.add(id); made.set(vid, id); const g = (f.groups || []).find(x => x.vid === vid) || {}; const nm = clipBytes(g.name || `VLAN ${vid}`, MAX_GROUP_NAME); const col = /^#[0-9a-f]{6}$/i.test(g.color || '') ? g.color : null;
        add('POST', '/api/groups/group', { group_id: id, name: nm, vid, ...(col ? { color: col } : {}) }, `New group ${id}: VLAN ${vid} “${nm}”`); }
      return made.get(vid); };
    if(pre){
      // the switch's own trunk (named ISL on a real GigaCore). It carries the groups listed in it: the built-in ones, but NOT the groups made later, so those are added to it
      const ref = trunkRefMode(cur), ids = (f.vids || []).map(v => ({ v, id: idOf(v) }));
      const have = new Set(pre.groups || []), add2 = ids.map(x => (ref === 'vid' ? x.v : x.id)).filter(x => !have.has(x));
      if(add2.length) add('PUT', `/api/trunks/trunk/${pre.trunk_id}/groups`, [...(pre.groups || []), ...add2].sort((a, b) => a - b), `Trunk “${pre.name}”: also carry ${ref === 'vid' ? 'VLAN' : 'group'} ${add2.join(', ')}`, undefined, { soft: true, trunkGroups: true });
      for(const e of fib) e.member = { type: 'trunk', id: pre.trunk_id, name: pre.name, needVids: f.vids || [] };
    } else {                                                  // never a trunk of our own
      notes.push('This switch has no predefined trunk — the fibre ports were not put in a trunk.');
      for(const e of fib) e.member = null;
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
    add('PUT', '/api/trunks/assign_ports', { id: tid, ports: all }, `Trunk “${tr?.name || 'trunk'}”: ports ${all.join(', ')}`, undefined, { needVids: nv || [] });
  }
  return { ops, notes };
}

// the names and colours of the VLAN overview for the groups the switch already has (the 20 built-in ones); VLAN 1 is left as it is
export function gigacoreNamesPlan(cur, names){
  const r = gigacorePlan(cur, { groups: [], names: names || [], ports: [] });
  return { ops: r.ops.filter(o => String(o.path).startsWith('/api/groups/group/')), notes: [] };
}

// the device itself: name and (last) the IP address
export function gigacoreDevicePlan(cur, { name, ip } = {}, { withIp = false } = {}){
  const r = gigacorePlan(cur, { name, ip, groups: [], ports: [] }, { withIp });
  return { ops: r.ops, notes: r.notes.filter(n => !/advanced/.test(n)) };
}

// ---- the lights of a GigaCore: port LEDs show the colour of the group the port is in, and the front panel can show one colour on all ports ----
export const hslHex = (h, s = 1, l = 0.5) => { const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
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
  const [info, ip, ios, blocks, ver, netcfg, features] = await Promise.all([h('GET', '/api/deviceinfo'), h('GET', '/api/ipsettings'), h('GET', '/api/IO'), h('GET', '/api/processblock'), h('GET', '/api/software/version').catch(() => null), h('GET', '/api/network_config').catch(() => null), h('GET', '/api/deviceinfo/features').catch(() => null)]);
  const list = Array.isArray(ios) ? ios : [];
  const dmx = list.filter(x => x.io_class === 'dmx').sort((a, b) => (a.port_number ?? a.id) - (b.port_number ?? b.id));   // IO 100000 = port 1
  const byId = new Map(list.map(x => [x.id, x]));
  const pb = Array.isArray(blocks) ? blocks : [];
  const usedBy = id => pb.filter(b => idsIn(b.inputs).includes(id) || idsIn(b.outputs).includes(id)).length;
  const ports = dmx.map((io, i) => {
    const dir = io.io_type === 'input' ? 'input' : io.io_type === 'output' ? 'output' : 'idle';
    // an output port is fed by the network input in slot 0 of the block that has it as output; an input port feeds the network output of the block that has it as input
    // a port that is switched off ("idle") can still hang on an engine as the output OR as the input it had: look at both
    const asOut = pb.filter(b => idsIn(b.outputs).includes(io.id)), asIn = pb.filter(b => idsIn(b.inputs).includes(io.id));
    const via = dir !== 'idle' ? dir : asOut.length ? 'output' : asIn.length ? 'input' : 'idle';
    const owner = via === 'input' ? asIn : asOut;
    const block = owner.length === 1 ? owner[0] : null;
    const freeBlock = !block ? pb.find(b => b.id === i && !idsIn(b.outputs).includes(io.id) && !idsIn(b.inputs).includes(io.id) && !idsIn(b.outputs).length) || null : null;
    const b0 = block || (dir === 'output' ? freeBlock : null);      // a block with no output yet still has the input that should feed this port
    let net = null;
    if(b0) net = via === 'input' ? idsIn(b0.outputs).map(id => byId.get(id)).find(x => x && NET.has(x.io_class)) : (byId.get(Number(b0.inputs?.[0] ?? b0.inputs?.['0'])) || null);
    if(net && !NET.has(net.io_class)) net = null;
    return { index: i, io, name: io.name ?? '', dir, via, block, freeBlock, net, input: net, universe: net?.universe ?? null, klass: net?.io_class || null, shared: net ? usedBy(net.id) > 1 : false, understood: !!block || dir === 'idle' || !!freeBlock };
  });
  return { info, ip, ios: list, blocks: pb, ports, version: typeof ver === 'object' && ver ? ver.current : null, netcfg: netcfg && typeof netcfg === 'object' && netcfg.groups ? netcfg : null, features: features && typeof features === 'object' ? features : null };
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
  const ports = Array.from({ length:Math.max(1, ethCount) }, (_, i) => ({ eth:i + 1, ...(portVids?.isl?.[i + 1] ? { isl:true } : {}), vids:portVids ? [...new Set((portVids[i + 1] || []).map(Number).filter(Number.isFinite))] : [...new Set((ifs || []).filter(x => (Number(x.eth) || 1) === i + 1 && x.vlan != null && x.ip).map(x => Number(x.vlan)))] }));
  for(const p of ports) for(const v of p.vids) if(!groups.has(v)) groups.set(v, mk(v));           // a port can carry a VLAN that has no address of its own
  for(const g of groups.values()) g.listen = !!g.pipe;
  return { groups:[...groups.values()].sort((a, b) => a.vid - b.vid), ports, names:[] };
}
// the group of a wanted node network that carries the lighting: the VLAN of the "lighting" role, else a group that takes part in the lighting data (not management)
export function lumiLightGroup(net){
  const gs = net?.groups || [];
  return gs.find(g => g.addresses.some(a => a.role === 'lighting')) || gs.find(g => g.listen && !g.mgmt) || gs.find(g => g.listen) || null;
}
// the node's own (predefined) trunk: the one that cannot be edited, if the node has one
// A node that says so (editable:false), else the trunk named ISL / number 1 that carries all the groups the node had (a real LumiNode reports it as editable)
const predefTrunk = (trunks, groups) => {
  const e = Object.entries(trunks || {}), fixed = e.find(([, t]) => t.editable === false); if(fixed) return fixed[0];
  const all = Object.keys(groups || {}).map(Number); if(!all.length) return null;
  return e.find(([k, t]) => (t.name === 'ISL' || k === '1') && all.every(g => (t.groups || []).includes(g)))?.[0] ?? null;
};
export const lumiIsl = nc => { const k = predefTrunk(nc?.trunks, nc?.groups); return k == null ? null : Number(k); };
const sameSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((x, i) => x === [...b].sort((p, q) => p - q)[i]);
export const prefixToMask = p => { const n = Math.max(0, Math.min(32, Number(p) || 0)); return [0, 1, 2, 3].map(i => Math.max(0, Math.min(8, n - i * 8))).map(b => (256 - (1 << (8 - b))) & 255).join('.'); };
// the calls that bring a node to the wanted network: validate, send, commit. want = lumiNetWant(...)
//   currentIp       the address this node is reached on now: when the wanted network no longer has it, the node moves (result.moveTo / moveMask)
//   keepAddresses   the groups the node has already keep their addresses (only the lighting data and the ports are set); new groups get theirs
//   force           send the whole network configuration again, also when the node already has exactly this
//   portEdits       { 1:{ isl:true } | { vid, name?, color? } | { off:true }, 2:… } what a person set on the network ports (ETH1, ETH2) of the node itself:
//                   its own built-in trunk (ISL) or one VLAN (that group may then configure the node). Without a plan for the groups these alone are sent.
export function lumiNetPlan(cur, want, { id = Date.now(), currentIp = '', keepAddresses = false, portEdits = null, force = false } = {}){
  const ops = [], notes = [], changes = [], nc = cur?.netcfg;
  const pe = portEdits && Object.keys(portEdits).length ? portEdits : null;
  if(!want?.groups?.length && !pe) return { ops, notes, changes, moveTo:null, moveMask:null };
  if(!want) want = { groups:[], ports:[], names:[] };
  const wantNames = (want.names || []).filter(g => g.vid !== 1 && !want.groups.some(x => x.vid === g.vid));
  if(!nc){ notes.push('This LumiNode does not offer the advanced network (no /api/network_config) — only its basic IP address can be set.'); return { ops, notes, changes, moveTo:null, moveMask:null }; }
  const next = { groups:clone(nc.groups || {}), trunks:clone(nc.trunks || {}), ports:clone(nc.ports || {}), stp_mode:nc.stp_mode || 'rstp', allow_ipv6_only_configurability:!!nc.allow_ipv6_only_configurability };
  const gid = new Map(Object.entries(next.groups).map(([k, g]) => [Number(g.vid), Number(k)]));
  let top = Math.max(0, ...Object.keys(next.groups).map(Number)), ttop = Math.max(0, ...Object.keys(next.trunks).map(Number));
  const cidr = a => `${a.ip}/${a.prefix}`;
  // the name and colour of the plan go to a group the node already has, so the group names are the same in the whole system. VLAN 1 (management) is left as it is;
  // a group the node does not let us change keeps its own (a note says so)
  const look = (k, g) => {
    const cg = next.groups[k], nm = clipBytes(g.name, MAX_GROUP_NAME); if(!cg || g.vid === 1) return;
    if(cg.editable === false){ if(nm && cg.name !== nm) notes.push(`Group ${k} (VLAN ${g.vid}) is built into the node — its name “${cg.name}” cannot be changed.`); return; }
    if(nm && cg.name !== nm){ changes.push(`Group ${k} (VLAN ${g.vid}): name “${cg.name}” → “${nm}”`); cg.name = nm; }
    if(/^#[0-9a-f]{6}$/i.test(g.color || '') && String(cg.color || '').toLowerCase() !== g.color.toLowerCase()){ changes.push(`Group ${k} (VLAN ${g.vid}): colour ${cg.color || 'none'} → ${g.color}`); cg.color = g.color; }
  };
  const lgW = lumiLightGroup(want);          // a new lighting group cannot be used to configure the node (only management can)
  const hasMgmtIp = want.groups.some(x => x.mgmt && (x.addresses.length || (next.groups[gid.get(x.vid)]?.network_settings?.addresses || []).length));
  for(const g of want.groups){
    let k = gid.get(g.vid), fresh = false;
    if(k == null){ if(top >= 255){ notes.push(`No room for a group for VLAN ${g.vid} (a node holds 255 groups).`); continue; } k = ++top; fresh = true; next.groups[k] = { name:g.name, vid:g.vid, color:g.color, editable:true, network_settings:{ addresses:[], routes:[], pipeline_setting:'', allow_config:!(lgW && g.vid === lgW.vid && !g.mgmt && hasMgmtIp) } }; gid.set(g.vid, k); }
    if(!fresh) look(k, g);
    const ns = (next.groups[k].network_settings ||= { addresses:[], routes:[], pipeline_setting:'', allow_config:true });
    if(!fresh && !g.addresses.length) continue;       // a group the node has and the plan gives no address: leave it as it is (its ports are still set below)
    const old = (ns.addresses || []).map(a => a.ip), wantIps = g.addresses.map(cidr), keep = keepAddresses && !fresh;
    const addrs = keep ? ns.addresses : g.addresses.map((a, i) => ({ ip:cidr(a), mode:'static', ...(g.addresses.length > 1 && i === 0 ? { preferred_output:true } : {}) }));
    // not every node can split input and output (GET /api/deviceinfo/features): then one group takes part in both, or in none
    let pipe = g.pipe ?? (g.listen ? 'input+output' : '');
    if(pipe && cur.features?.['networking: Split pipeline IO'] !== true) pipe = 'input+output';
    if(fresh) changes.push(`New group ${k} “${g.name}” (VLAN ${g.vid}): ${wantIps.join(', ')}${g.listen ? ' · lighting' : ''}`);
    else {
      if(!keep && old.join() !== wantIps.join()) changes.push(`Group ${k} “${next.groups[k].name}” (VLAN ${g.vid}): ${old.join(', ') || 'no address'} → ${wantIps.join(', ')}`);
      if((ns.pipeline_setting || '') !== pipe) changes.push(`Group ${k} “${next.groups[k].name}”: lighting ${ns.pipeline_setting ? `“${ns.pipeline_setting}”` : 'off'} → ${pipe ? `“${pipe}”` : 'off'}`);
    }
    ns.addresses = addrs; ns.pipeline_setting = pipe;
    if(g.mgmt) ns.allow_config = true;
    else if(lgW && g.vid === lgW.vid){          // the lighting group cannot configure the node — as long as management still can
      if(!hasMgmtIp) notes.push(`Group ${k} (the lighting VLAN) keeps allow_config as it is: the node has no management address to configure it on.`);
      else if(!fresh && ns.allow_config !== false){ ns.allow_config = false; changes.push(`Group ${k} “${next.groups[k].name}”: configuring the node through it → off`); }
    }
  }
  for(const g of wantNames){ const k = gid.get(g.vid); if(k != null) look(k, g); }          // the other VLANs of the overview that the node has (not used on it)
  const rj = Object.entries(next.ports).filter(([, p]) => (p.type || 'rj45') === 'rj45').map(([name]) => name);
  // a port on the node's own trunk (ISL): it carries every group of the node, groups made later too. No trunk of our own is made.
  const islPort = name => {
    const port = next.ports[name], was = port.trunk != null ? `trunk ${port.trunk}` : port.group != null ? `group ${port.group}` : 'no group';
    const tid = predefTrunk(next.trunks, nc.groups);
    if(tid == null){ notes.push(`Port ${name}: this node does not report its own trunk (ISL), so it was not set.`); return; }
    const tr = next.trunks[tid], every = Object.keys(next.groups).map(Number), miss = every.filter(x => !(tr.groups || []).includes(x));
    if(miss.length && tr.editable !== false){ tr.groups = [...(tr.groups || []), ...miss].sort((a, b) => a - b); changes.push(`Trunk ${tid} “${tr.name}”: also carry group ${miss.join(', ')}`); }
    if(Number(port.trunk) !== Number(tid)) changes.push(`Port ${name}: ${was} → the node's own trunk ${tid} “${tr.name}”`);
    port.trunk = Number(tid); port.group = null;
  };
  (want.ports || []).forEach((wp, i) => {
    const name = rj[i]; if(!name){ if(wp.vids.length) notes.push(`This node has no network port ${i + 1}.`); return; }
    if(wp.isl){ islPort(name); return; }
    const ids = wp.vids.map(v => gid.get(v)).filter(x => x != null); if(!ids.length) return;
    const port = next.ports[name];
    if(ids.length === 1){
      if(port.group !== ids[0] || port.trunk != null) changes.push(`Port ${name}: ${port.trunk != null ? `trunk ${port.trunk}` : port.group != null ? `group ${port.group}` : 'no group'} → group ${ids[0]}`);
      port.group = ids[0]; port.trunk = null;
    } else {
      // The node's own predefined trunk when it has one (a trunk that cannot be edited); else a trunk that already carries exactly these groups;
      // else ONE new trunk. Never one trunk per port: ports that carry the same groups share the same trunk.
      let tid = predefTrunk(next.trunks, nc.groups);
      if(tid != null){
        const tr = next.trunks[tid], miss = ids.filter(x => !(tr.groups || []).includes(x));
        if(miss.length){
          if(tr.editable === false) notes.push(`Port ${name}: the node's own trunk “${tr.name}” does not carry group ${miss.join(', ')} and cannot be changed.`);
          else { tr.groups = [...(tr.groups || []), ...miss].sort((a, b) => a - b); changes.push(`Trunk ${tid} “${tr.name}”: also carry group ${miss.join(', ')}`); }
        }
      } else {
        tid = Object.entries(next.trunks).find(([, tr]) => sameSet(tr.groups || [], ids))?.[0];
        if(tid == null){ tid = ++ttop; const mg = want.groups.find(g => g.mgmt && ids.includes(gid.get(g.vid))); next.trunks[tid] = { name:`Trunk ${wp.vids.join('+')}`.slice(0, 31), groups:[...ids], untagged_group:mg ? gid.get(mg.vid) : null, color:'#38bdf8', editable:true }; changes.push(`New trunk ${tid} “${next.trunks[tid].name}” with groups ${ids.join(', ')}`); }
      }
      if(Number(port.trunk) !== Number(tid)) changes.push(`Port ${name}: ${port.trunk != null ? `trunk ${port.trunk}` : port.group != null ? `group ${port.group}` : 'no group'} → trunk ${tid} (VLAN ${wp.vids.join(' + ')})`);
      port.trunk = Number(tid); port.group = null;
    }
  });
  // what a person set on ETH1 / ETH2 of the node itself
  for(const [eth, e] of Object.entries(pe || {})){
    const name = rj[Number(eth) - 1], port = next.ports[name]; if(!port){ notes.push(`This node has no network port ${eth}.`); continue; }
    const was = port.trunk != null ? `trunk ${port.trunk}` : port.group != null ? `group ${port.group}` : 'no group';
    if(e.isl){ islPort(name); continue; }
    else if(e.vid != null){
      let k = gid.get(Number(e.vid));
      if(k == null){
        if(top >= 255){ notes.push(`No room for a group for VLAN ${e.vid} (a node holds 255 groups).`); continue; }
        k = ++top; next.groups[k] = { name:String(e.name || `VLAN ${e.vid}`).slice(0, MAX_GROUP_NAME), vid:Number(e.vid), color:e.color || '#38bdf8', editable:true, network_settings:{ addresses:[], routes:[], pipeline_setting:'', allow_config:true } }; gid.set(Number(e.vid), k);
        changes.push(`New group ${k} “${next.groups[k].name}” (VLAN ${e.vid})`);
        { const it = predefTrunk(next.trunks, nc.groups); if(it != null && next.trunks[it].editable !== false) next.trunks[it].groups = [...(next.trunks[it].groups || []), k].sort((x, y) => x - y); }
      }
      const ns = (next.groups[k].network_settings ||= { addresses:[], routes:[], pipeline_setting:'', allow_config:true });
      if(ns.allow_config === false){ ns.allow_config = true; changes.push(`Group ${k} “${next.groups[k].name}”: configuring the node through it → on`); }
      if(port.group !== k || port.trunk != null) changes.push(`Port ${name}: ${was} → group ${k} (VLAN ${e.vid})`);
      port.group = k; port.trunk = null;
    }
  }
  if(pe && !want.groups.length && !changes.length) return { ops, notes, changes, moveTo:null, moveMask:null };
  if(nc.is_basic_config) changes.unshift('Switch the node to the advanced network configuration');
  // does the node still answer on the address it is reached on now? If not it moves: to the address of its management group (else the first one)
  const reach = Object.values(next.groups).filter(g => g.network_settings?.allow_config !== false).flatMap(g => (g.network_settings?.addresses || []).map(a => a.ip));
  let moveTo = null, moveMask = null;
  if(currentIp && reach.length && !reach.some(a => a.split('/')[0] === currentIp)){
    const mg = want.groups.find(g => g.mgmt && g.addresses.length), pick = mg ? cidr(mg.addresses[0]) : reach[0];
    moveTo = pick.split('/')[0]; moveMask = prefixToMask(pick.split('/')[1]);
  }
  if(!changes.length && !nc.is_basic_config){ if(!force) return { ops, notes, changes, moveTo:null, moveMask:null }; changes.push('Send the network configuration again (nothing changed)'); }
  const ports = Object.fromEntries(Object.entries(next.ports).map(([k, p]) => [k, { group:p.group ?? null, trunk:p.trunk ?? null, ...(p.link_speed ? { link_speed:p.link_speed } : {}), ...(p.type ? { type:p.type } : {}) }]));
  const body = { is_basic_config:false, allow_ipv6_only_configurability:next.allow_ipv6_only_configurability, configuration_identifier:id, groups:next.groups, trunks:next.trunks, ports, stp_mode:next.stp_mode };
  ops.push({ method:'POST', path:'/api/network_config/validate', body, text:`Check the new network configuration (${changes.length} change${changes.length === 1 ? '' : 's'})`, kind:'net' });
  ops.push({ method:'PUT', path:'/api/network_config', body, text:changes.join(' · '), kind:'net' });
  ops.push({ method:'POST', path:'/api/network_config/commit', body:{ configuration_identifier:id, timeout:0 }, text:`Activate it${moveTo ? ` — the node moves to ${moveTo}` : ' — the node may stop answering on its old address'}`, kind:'net' });
  const lg = lumiLightGroup(want);
  return { ops, notes, changes, moveTo, moveMask, lightGroup: lg ? (gid.get(lg.vid) ?? null) : null };
}

// What PatchLab shows as a universe number: sACN as it is; Art-Net as the node shows it, minus `offset` (0 = the same number, the default).
export const uniShown = (p, offset = 0) => (p.universe == null ? null : p.klass === 'artnet' ? p.universe - offset : p.universe);

// want = { shortName, longName, ip:{address,mask,gateway}|null, ports:[ { name?, dir?:'output'|'input'|'idle', klass?:'sacn'|'artnet', universe? } per port, null = untouched ] }
// opt = { artnetOffset (0), protocol:'sacn'|'artnet' for inputs made without a stated protocol }
// lightGroup: the group (number) of the lighting VLAN when the node has it already: the network IOs of the engines get it right away.
// lightGroupLate: the number that group will get when the network configuration has been sent: the IOs get it in `late`, to be run after that configuration.
export function lumiPlan(cur, want, { withIp = false, artnetOffset = 0, protocol = 'sacn', lightGroup = null, lightGroupLate = null } = {}){
  const ops = [], notes = [], late = [];
  const add = (method, path, body, text, kind = 'config', extra = {}) => ops.push({ method, path, body, text, kind, ...extra });
  const sn = clip(want.shortName, 17), ln = clip(want.longName, 63);
  if((sn && sn !== cur.info?.short_name) || (ln && ln !== cur.info?.long_name))
    add('PUT', '/api/deviceinfo', { ID: cur.info?.ID ?? 0, colors: cur.info?.colors || [], short_name: sn || cur.info?.short_name || '', long_name: ln || cur.info?.long_name || '' },
      `Name “${cur.info?.short_name ?? ''}” → “${sn}”${ln ? `, long name “${cur.info?.long_name ?? ''}” → “${ln}”` : ''}`);
  const api = (u, klass) => (klass === 'sacn' ? Math.max(1, Number(u)) : Math.max(0, Number(u) + artnetOffset));
  const label = k => (k === 'sacn' ? 'sACN' : 'Art-Net');
  // Art-Net universes run 0–32767 (as sent to the node, so with the offset), sACN 1–63999: never silently clamp
  const inRange = (klass, u) => Number.isInteger(u) && (klass === 'sacn' ? u >= 1 && u <= 63999 : u + artnetOffset >= 0 && u + artnetOffset <= 32767);
  // what every port should become
  const wants = (want.ports || []).map((e, i) => {
    const p = e ? cur.ports[i] : null; if(!p) return null;
    const w = { name: e.name != null ? clip(e.name, 64) : p.name, dir: e.dir ?? p.dir, klass: e.klass ?? p.klass ?? protocol, universe: e.universe != null && e.universe !== '' ? Number(e.universe) : uniShown(p, artnetOffset) };
    const bad = w.universe != null && !inRange(w.klass, w.universe);
    return { bad, p, w, nameCh: w.name !== p.name, dirCh: w.dir !== p.dir, klassCh: !!p.net && w.klass !== p.klass, uniCh: w.universe != null && w.universe !== uniShown(p, artnetOffset) };
  });
  // ---- Engines (process blocks) belong to ONE node. DMX outputs of this node with the same protocol and universe share ONE engine: one network input feeding them all,
  //      instead of an engine per port. engines: 'klass:universe' → block id; users: block id → the DMX outputs (port index) that hang on it. ----
  const eKey = (klass, uni) => `${klass}:${uni}`;
  const engines = new Map(), users = new Map(), claimed = new Set(), modeSet = new Set();
  const userSet = id => users.get(id) || users.set(id, new Set()).get(id);
  const dropEngine = id => { for(const [k, v] of engines) if(v === id) engines.delete(k); };
  const othersOn = (b, i) => [...userSet(b)].filter(j => j !== i).length;               // the other DMX outputs on this engine
  const hungOn = p => (p.block && p.via !== 'input' ? p.block.id : null);      // the engine a DMX output hangs on now (also when it is switched off)
  cur.ports.forEach((p, i) => { if(p.dir === 'output' && p.block) userSet(p.block.id).add(i); });
  cur.ports.forEach((p, i) => {                                 // the engines that stay as they are: only ports that do not change seed them
    const x = wants[i]; if(x && (x.dirCh || x.klassCh || x.uniCh)) return;
    if(p.dir === 'output' && p.block && p.net && !p.shared){ const k = eKey(p.net.io_class, p.net.universe); if(!engines.has(k)) engines.set(k, p.block.id); }
  });
  // a block that is free to become an engine: no output, nobody uses it in this plan; the block with the number of the port first
  const freeBlockFor = i => { const c = (cur.blocks || []).filter(x => !idsIn(x.outputs).length && !claimed.has(x.id) && !(users.get(x.id)?.size)).map(x => x.id); return c.includes(i) ? i : c[0] ?? null; };
  // an engine whose ports ALL go to the same new universe (same protocol, still outputs): its one input changes universe, nothing else
  for(const [bid, set] of users){
    const idx = [...set]; if(idx.length < 2) continue;
    const first = cur.ports[idx[0]]; if(!first.net || first.shared || idx.some(j => cur.ports[j].net?.id !== first.net.id)) continue;
    const ws = idx.map(j => wants[j]); if(ws.some(x => !x || x.bad)) continue;
    const t = ws[0].w; if(!ws.every(x => x.w.dir === 'output' && !x.dirCh && !x.klassCh && x.w.klass === t.klass && x.w.universe === t.universe) || !ws.some(x => x.uniCh) || t.universe == null) continue;
    const key = eKey(t.klass, api(t.universe, t.klass)); if(engines.has(key) && engines.get(key) !== bid) continue;           // that universe has an engine already: they join it
    const { duplicate_ios, ...rest } = first.net;
    add('PUT', `/api/IO/${first.net.id}`, { ...rest, universe: api(t.universe, t.klass) }, `Engine ${bid} (DMX ${idx.map(j => j + 1).join(', ')}): universe ${uniShown(first, artnetOffset)} → ${t.universe} (${label(t.klass)}${t.klass === 'artnet' ? ` ${api(t.universe, 'artnet')}` : ''})`);
    dropEngine(bid); engines.set(key, bid); ws.forEach(x => { x.uniCh = false; });
  }
  wants.forEach((x, i) => {
    if(!x) return;
    const { p, w, nameCh, dirCh, klassCh, uniCh, bad } = x;
    if(!nameCh && !dirCh && !klassCh && !uniCh) return;
    const P = `DMX ${i + 1}`, dmxId = p.io.id;
    // when the network side of a port cannot be done, the port must not end up half changed: the direction is taken back out of the plan
    let dirOp = null;
    const note = msg => {
      notes.push(msg);
      if(!dirOp) return;
      const k = ops.indexOf(dirOp); if(k < 0) return;
      if(nameCh){ dirOp.body = { ...dirOp.body, io_type: p.dir }; dirOp.text = `${P}: name “${p.name}” → “${w.name}”`; } else ops.splice(k, 1);
      dirOp = null;
    };
    // the port itself: name and direction, the whole IO is sent back (firmware 2.6 insists on rdm_universe)
    if(nameCh || dirCh) { add('PUT', `/api/IO/${dmxId}`, { ...p.io, name: w.name, io_type: w.dir, rdm_universe: p.io.rdm_universe ?? -1 },
      `${P}: ${[nameCh ? `name “${p.name}” → “${w.name}”` : '', dirCh ? `${p.dir === 'idle' ? 'off' : p.dir} → ${w.dir === 'idle' ? 'off' : w.dir}` : ''].filter(Boolean).join(', ')}`); if(dirCh) dirOp = ops[ops.length - 1]; }
    if(w.dir === 'idle'){ if(p.dir === 'output' && p.block) userSet(p.block.id).delete(i); return; }
    if(!dirCh && !klassCh && !uniCh) return;
    if(w.universe == null){ note(`${P}: fill in a universe.`); return; }
    if(bad){ note(`${P}: universe ${w.universe} is not allowed for ${label(w.klass)} (${w.klass === 'sacn' ? '1–63999' : `0–${32767 - artnetOffset}`}) — not changed.`); return; }
    const del = (txt, path) => add('DELETE', path, undefined, txt);
    const outTo = (b, txt) => add('PUT', `/api/processblock/${b}/output`, { io_id: dmxId }, txt);
    // an engine that is not set up yet (mode NONE) forwards nothing: it is set to REROUTE (one input in, the outputs out) before it gets its input
    const ensure = b => { if(cur.blocks?.find(x => x.id === b)?.mode === 'NONE' && !modeSet.has(b)){ modeSet.add(b); add('PUT', `/api/processblock/${b}`, { mode: 'REROUTE' }, `${P}: set up engine ${b} (forward)`); } };
    const inTo = (b, txt, io) => add('PUT', `/api/processblock/${b}/input/0`, typeof io === 'function' ? c => ({ io_id: io(c) }) : { io_id: io }, txt);
    const uni = api(w.universe, w.klass), key = eKey(w.klass, uni);
    const sameDirNet = !!p.net && !dirCh && !klassCh;           // the same kind of network input / output, only the universe
    // ---- a DMX output: join the engine that already has this universe, else make one ----
    if(w.dir === 'output'){
      const eng = engines.get(key), mine = hungOn(p);
      if(eng != null && eng === mine) return;
      if(eng != null){                                          // join the engine of this universe
        if(mine != null){
          del(`${P}: leave engine ${mine}`, `/api/processblock/${mine}/output/${dmxId}`); userSet(mine).delete(i);
          if(!userSet(mine).size && p.net && !p.shared){        // nobody is left on that engine: its input goes too
            del(`${P}: engine ${mine} is empty — remove its input`, `/api/processblock/${mine}/input/0`);
            del(`${P}: remove the old ${label(p.klass)} input (universe ${uniShown(p, artnetOffset)})`, `/api/IO/${p.net.id}`); dropEngine(mine);
          }
        } else if(p.via === 'input' && p.net){
          if(p.block) del(`${P}: disconnect its ${label(p.klass)} output`, `/api/processblock/${p.block.id}/output/${p.net.id}`);
          if(!p.shared){ if(p.block) del(`${P}: remove the old output from engine ${p.block.id}`, `/api/processblock/${p.block.id}/input/0`); del(`${P}: remove the old ${label(p.klass)} output`, `/api/IO/${p.net.id}`); }
        }
        outTo(eng, `${P}: connect the DMX output to engine ${eng} (${label(w.klass)} universe ${w.universe})`); userSet(eng).add(i); return;
      }
      // no engine with this universe yet: this port makes it
      if(mine != null && !othersOn(mine, i) && sameDirNet){   // it is alone on its engine: only the universe changes
        if(p.shared){ note(`${P}: its ${label(p.klass)} input is shared with another process block — universe not changed.`); return; }
        const { duplicate_ios, ...rest } = p.net;
        add('PUT', `/api/IO/${p.net.id}`, { ...rest, universe: uni }, `${P}: universe ${uniShown(p, artnetOffset)} → ${w.universe} (${label(p.klass)}${p.klass === 'artnet' ? ` ${uni}` : ''})`);
        dropEngine(mine); engines.set(key, mine); return;
      }
      let b = p.block?.id ?? p.freeBlock?.id, split = false;
      if(mine != null && othersOn(mine, i) > 0){               // it leaves an engine others stay on: it needs an engine of its own
        b = freeBlockFor(i);
        if(b == null){ note(`${P}: no free engine on this node for its own universe — not changed.`); return; }
        split = true; del(`${P}: leave engine ${mine}`, `/api/processblock/${mine}/output/${dmxId}`); userSet(mine).delete(i);
      }
      if(b == null){ note(`${P}: no process block found for this port — not changed.`); return; }
      if(!split && p.net && p.shared){ note(`${P}: its ${p.via === 'input' ? 'output' : 'input'} is shared with another process block — not changed.`); return; }
      if(p.via === 'input' && p.net && p.block) del(`${P}: disconnect its ${label(p.klass)} output`, `/api/processblock/${p.block.id}/output/${p.net.id}`);
      if(split || mine == null) outTo(b, `${P}: connect the DMX output to engine ${b}`);
      ensure(b);
      add('POST', '/api/IO', { io_class: w.klass, io_type: 'input', universe: uni, name: `U${w.universe}`, ...(w.klass === 'sacn' ? { priority: 100 } : {}) }, `${P}: new ${label(w.klass)} input for universe ${w.universe}`, 'io-new', { saveAs: 'n' });
      inTo(b, `${P}: … and connect it to engine ${b}`, c => c.n);
      if(p.net && !split) del(`${P}: remove the old ${label(p.klass)} ${p.via === 'input' ? 'output' : 'input'}`, `/api/IO/${p.net.id}`);      // an input other ports of its engine use stays
      claimed.add(b); dropEngine(b); engines.set(key, b); userSet(b).add(i); return;
    }
    // ---- a DMX input: it feeds a network output of its own engine (one per port) ----
    const b = p.block?.id ?? p.freeBlock?.id;
    if(sameDirNet){
      if(p.shared){ note(`${P}: its ${label(p.klass)} output is shared with another process block — universe not changed.`); return; }
      const { duplicate_ios, ...rest } = p.net;
      add('PUT', `/api/IO/${p.net.id}`, { ...rest, universe: uni }, `${P}: universe ${uniShown(p, artnetOffset)} → ${w.universe} (${label(p.klass)}${p.klass === 'artnet' ? ` ${uni}` : ''})`);
      return;
    }
    if(b == null){ note(`${P}: no process block found for this port — not changed.`); return; }
    if(p.net && p.shared){ note(`${P}: its ${p.via === 'input' ? 'output' : 'input'} is shared with another process block — not changed.`); return; }
    const hung = hungOn(p), others = hung != null ? othersOn(hung, i) : 0;
    if(others > 0){                                             // it leaves an engine others stay on: it needs an engine of its own
      const nb = freeBlockFor(i); if(nb == null){ note(`${P}: no free engine on this node for its own input — not changed.`); return; }
      del(`${P}: leave engine ${b}`, `/api/processblock/${b}/output/${dmxId}`); userSet(b).delete(i); claimed.add(nb);
      ensure(nb); add('PUT', `/api/processblock/${nb}/input/0`, { io_id: dmxId }, `${P}: connect the DMX input to engine ${nb}`);
      add('POST', '/api/IO', { io_class: w.klass, io_type: 'output', universe: uni, name: `U${w.universe}`, ...(w.klass === 'sacn' ? { priority: 100 } : {}) }, `${P}: new ${label(w.klass)} output for universe ${w.universe}`, 'io-new', { saveAs: 'n' });
      add('PUT', `/api/processblock/${nb}/output`, c => ({ io_id: c.n }), `${P}: … and connect it to engine ${nb}`);
      return;
    }
    if(hung != null){ del(`${P}: disconnect the DMX output from engine ${b}`, `/api/processblock/${b}/output/${dmxId}`); userSet(b).delete(i); dropEngine(b); }
    else if(p.via === 'input' && p.net) del(`${P}: disconnect its ${label(p.klass)} output`, `/api/processblock/${b}/output/${p.net.id}`);
    ensure(b); inTo(b, `${P}: connect the DMX input to engine ${b}`, dmxId);
    add('POST', '/api/IO', { io_class: w.klass, io_type: 'output', universe: uni, name: `U${w.universe}`, ...(w.klass === 'sacn' ? { priority: 100 } : {}) }, `${P}: new ${label(w.klass)} output for universe ${w.universe}`, 'io-new', { saveAs: 'n' });
    add('PUT', `/api/processblock/${b}/output`, c => ({ io_id: c.n }), `${P}: … and connect it to engine ${b}`);
    if(p.net) del(`${P}: remove the old ${label(p.klass)} ${p.via === 'input' ? 'output' : 'input'}`, `/api/IO/${p.net.id}`);
  });
  // advanced network: the network inputs and outputs of the engines sit on the lighting group (the VLAN the lighting data comes in on and goes out on)
  const K = lightGroup ?? lightGroupLate, isLate = lightGroup == null && lightGroupLate != null;
  if(K != null){
    const del = new Set(ops.filter(o => o.method === 'DELETE' && /^\/api\/IO\/\d+$/.test(o.path)).map(o => Number(o.path.split('/').pop()))), set = new Set();
    const push = (method, path, body, text) => (isLate ? late : ops).push({ method, path, body, text, kind: 'config' });
    let k = 0;
    for(const o of ops.slice()){
      if(o.method === 'POST' && o.path === '/api/IO' && o.body && NET.has(o.body.io_class)){
        if(!isLate) o.body.group = K;
        else { const key = `io${k++}`, post = o.body; o.saveAlso = key; push('PUT', c => `/api/IO/${c[key]}`, c => ({ ...post, id: c[key], group: K }), `${o.text} → lighting group ${K}`); }
      }
      const m = o.method === 'PUT' && String(o.path).match(/^\/api\/IO\/(\d+)$/);
      if(m && o.body && NET.has(o.body.io_class)){
        set.add(Number(m[1]));
        if(!isLate) o.body.group = K; else push('PUT', o.path, { ...o.body, group: K }, `${o.text} → lighting group ${K}`);
      }
    }
    for(const p of cur.ports){
      const n = p.net, dir = wants[p.index]?.w.dir ?? p.dir;
      if(!n || !NET.has(n.io_class) || dir === 'idle' || del.has(n.id) || set.has(n.id) || Number(n.group ?? 0) === K) continue;
      set.add(n.id); const { duplicate_ios, ...rest } = n;
      push('PUT', `/api/IO/${n.id}`, { ...rest, group: K }, `DMX ${p.index + 1}: ${label(n.io_class)} ${n.io_class === 'artnet' ? n.universe - artnetOffset : n.universe} on the lighting group ${K}`);
    }
  }
  if(withIp && want.ip?.address){
    const cip = cur.ip;
    if(cip?.ipaddress !== want.ip.address || cip?.netmask !== want.ip.mask)
      add('PUT', '/api/ipsettings', { ipaddress: want.ip.address, netmask: want.ip.mask || DEFAULT_MASK, gateway: want.ip.gateway || '0.0.0.0' }, `IP address ${cip?.ipaddress ?? '?'} → ${want.ip.address}`, 'ip');
  }
  return { ops, notes, late };
}

// run the calls one after the other (stops at the first error). A call can carry its body / path as a function of what earlier calls
// returned (ctx), and save the id a POST gives back with saveAs; `after` is the older single follow-up.
// what a device said, without the technical wrapper: "Error invoking remote method 'luminexHttp': Error: 404 {"description":"…"}" -> "404 …"
export function plainError(e){
  let m = String(e?.message ?? e ?? '').replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '');
  const j = /^(\d{3})\s+(\{[\s\S]*\})\s*$/.exec(m);
  if(j){ try { const o = JSON.parse(j[2]); m = `${j[1]} ${o.description || o.message || o.name || ''}`.trim(); } catch {} }
  return m;
}
export async function runOps(h, ops, onStep = () => {}){
  const done = [], ctx = {};
  for(const op of ops){
    onStep(op, 'start');
    const path = typeof op.path === 'function' ? op.path(ctx) : op.path, body = typeof op.body === 'function' ? op.body(ctx) : op.body;
    let r;
    try { r = await h(op.method, path, body); }
    catch(e) { if(op.soft){ op.failed = String(e.message || e); done.push(op); onStep(op, 'failed'); continue; } throw Object.assign(new Error(`${op.method} ${path}: ${plainError(e)}${op.text ? ` (${op.text})` : ''}`), { status: e.status, cause: e }); }       // a soft call (like a colour) may be refused without stopping the rest; the others say which call it was
    if(op.saveAs) ctx[op.saveAs] = r?.index ?? r?.id;
    if(op.saveAlso) ctx[op.saveAlso] = r?.index ?? r?.id;
    done.push(op);
    if(op.after){ const a = op.after; await h(a.method, a.path, a.bodyFromResult ? a.bodyFromResult(r) : a.body); }
    onStep(op, 'done');
  }
  return done;
}
