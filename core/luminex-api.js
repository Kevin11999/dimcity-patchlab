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

// ===================== GigaCore generation 2 =====================
export async function gigacoreRead(h){
  const [device, groups, trunks, ports, ip, mode] = await Promise.all([
    h('GET', '/api/device'), h('GET', '/api/groups/group'), h('GET', '/api/trunks/trunk'), h('GET', '/api/ports'), h('GET', '/api/ip_settings'),
    h('GET', '/api/config/mode').catch(() => null)]);
  const plist = Array.isArray(ports) ? ports : (ports?.port || []);
  return { device, groups: groups || [], trunks: trunks || [], ports: plist, ip, mode: typeof mode === 'string' ? mode : mode?.mode || null };
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
  for(const p of want.ports){
    const have = cur.ports.find(x => x.port_number === p.port);
    if(!have){ notes.push(`Port ${p.port} does not exist on this switch.`); continue; }
    let target = null;
    if(p.trunk && trunkId != null) target = { type: 'trunk', id: trunkId };
    else if(p.vid != null && gid.has(p.vid)) target = { type: 'group', id: gid.get(p.vid) };
    if(target && !same({ type: have.member_of?.type, id: have.member_of?.id }, target)) add('PUT', `/api/ports/port/${p.port}/member_of`, target, `Port ${p.port}: ${have.member_of?.type === 'group' ? `group ${have.member_of.id}` : have.member_of?.type === 'trunk' ? `trunk ${have.member_of.id}` : 'no group'} → ${target.type} ${target.id}${p.vid != null && !p.trunk ? ` (VLAN ${p.vid})` : ''}`);
    const lg = clip(p.legend, MAX_LEGEND);
    if(lg && lg !== (have.legend ?? '')) add('PUT', `/api/ports/port/${p.port}/legend`, lg, `Port ${p.port}: label “${have.legend ?? ''}” → “${lg}”`);
  }
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

// ===================== LumiNode / LumiCore =====================
export async function lumiRead(h){
  const [info, ip, ios, blocks] = await Promise.all([h('GET', '/api/deviceinfo'), h('GET', '/api/ipsettings'), h('GET', '/api/IO'), h('GET', '/api/processblock')]);
  const list = Array.isArray(ios) ? ios : [];
  // DMX output ports in port order, and for each the Art-Net / sACN input that feeds it through its process block
  const dmx = list.filter(x => x.io_class === 'dmx' && (x.io_type === 'output' || x.io_type === undefined)).sort((a, b) => a.port_number - b.port_number);
  const byId = new Map(list.map(x => [x.id, x]));
  const idsIn = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? [...Object.keys(v).map(Number), ...Object.values(v)] : [v]).filter(n => Number.isFinite(Number(n))).map(Number);
  const pb = Array.isArray(blocks) ? blocks : [];
  const ports = dmx.map((io, i) => {
    const owner = pb.filter(b => idsIn(b.outputs).includes(io.id));
    const block = owner.length === 1 ? owner[0] : null;
    const inId = block ? (block.inputs?.[0] ?? block.inputs?.['0']) : null;
    const inIo = inId != null ? byId.get(Number(inId)) : null;
    const sharedBy = inIo ? pb.filter(b => Object.values(b.inputs || {}).map(Number).includes(inIo.id)).length : 0;
    return { index: i, io, block, input: inIo || null, universe: inIo?.universe ?? null, klass: inIo?.io_class || null, shared: sharedBy > 1, understood: !!block };
  });
  return { info, ip, ios: list, blocks: pb, ports };
}

// want = { shortName, longName, ip:{address,mask,gateway}|null, universes:[n|null per port] }, opt = { artnetOffset (-1), protocol:'artnet'|'sacn' }
export function lumiPlan(cur, want, { withIp = false, artnetOffset = -1, protocol = 'artnet' } = {}){
  const ops = [], notes = [];
  const add = (method, path, body, text, kind = 'config') => ops.push({ method, path, body, text, kind });
  const sn = clip(want.shortName, 17), ln = clip(want.longName, 63);
  if((sn && sn !== cur.info?.short_name) || (ln && ln !== cur.info?.long_name))
    add('PUT', '/api/deviceinfo', { ID: cur.info?.ID ?? 0, colors: cur.info?.colors || [], short_name: sn || cur.info?.short_name || '', long_name: ln || cur.info?.long_name || '' },
      `Name “${cur.info?.short_name ?? ''}” → “${sn}”${ln ? `, long name “${cur.info?.long_name ?? ''}” → “${ln}”` : ''}`);
  const uni = (n, klass) => (klass === 'sacn' || (!klass && protocol === 'sacn') ? Number(n) : Math.max(0, Number(n) + artnetOffset));
  (want.universes || []).forEach((u, i) => {
    if(u == null || u === '') return;
    const p = cur.ports[i]; if(!p){ notes.push(`DMX port ${i + 1} does not exist on this device.`); return; }
    if(!p.understood){ notes.push(`DMX port ${i + 1}: the pipeline is not understood (the output is in no or several process blocks) — not changed.`); return; }
    if(p.input){
      if(p.shared){ notes.push(`DMX port ${i + 1}: its input is shared with another process block — not changed.`); return; }
      const target = uni(u, p.klass);
      if(p.universe !== target){
        const { duplicate_ios, ...rest } = p.input;
        add('PUT', `/api/IO/${p.input.id}`, { ...rest, universe: target }, `DMX port ${i + 1}: universe ${p.klass === 'sacn' ? p.universe : (p.universe ?? -1) - artnetOffset} → ${u} (${p.klass || protocol} ${target})`);
      }
    } else {
      const klass = protocol, target = uni(u, klass);
      add('POST', '/api/IO', { io_class: klass, io_type: 'input', universe: target, name: `U${u}`, ...(klass === 'sacn' ? { priority: 100 } : {}) }, `DMX port ${i + 1}: new ${klass} input for universe ${u}`, 'io-new');
      ops[ops.length - 1].after = { method: 'PUT', path: `/api/processblock/${p.block.id}/input/0`, bodyFromResult: r => ({ io_id: r.index }), text: `… and connect it to the process block of DMX port ${i + 1}` };
    }
  });
  if(withIp && want.ip?.address){
    const cip = cur.ip;
    if(cip?.ipaddress !== want.ip.address || cip?.netmask !== want.ip.mask)
      add('PUT', '/api/ipsettings', { ipaddress: want.ip.address, netmask: want.ip.mask || '255.255.255.0', gateway: want.ip.gateway || '0.0.0.0' }, `IP address ${cip?.ipaddress ?? '?'} → ${want.ip.address}`, 'ip');
  }
  return { ops, notes };
}

// run the calls one after the other (stops at the first error); `after` follow-ups use the result of the call before
export async function runOps(h, ops, onStep = () => {}){
  const done = [];
  for(const op of ops){
    onStep(op, 'start');
    const r = await h(op.method, op.path, op.body);
    done.push(op);
    if(op.after){ const a = op.after; await h(a.method, a.path, a.bodyFromResult ? a.bodyFromResult(r) : a.body); }
    onStep(op, 'done');
  }
  return done;
}
