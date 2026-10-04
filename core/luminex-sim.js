// core/luminex-sim.js — in-memory GigaCore (gen 2) and LumiNode devices that answer the documented HTTP calls.
// Used by the demo mode, the tests and the "simulated devices" of the network dialog. h(method, path, body) -> JSON, throws on a bad call.
const err = (code, msg) => Object.assign(new Error(`${code} ${msg}`), { status: code });
const clone = x => JSON.parse(JSON.stringify(x));

// a white 250 x 122 PNG, what the e-ink display of a 20t could look like
const WHITE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAPoAAAB6AQAAAAC+J3NIAAAAJklEQVR4nO3KoQEAAAwCIP9/Wk9YXIFMeoggCIIgCIIgCIIgCH9hZZExotrhapAAAAAASUVORK5CYII=';
export function gigacoreSim({ name = 'GigaCore', ip = '192.168.1.10', ports = 12, mode = 'luminex', eink = false, ignoreAssign = false } = {}){
  const st = {
    device: { name, model: 'GigaCore 12t', api_version: '1.5.0' },
    groups: [{ group_id: 1, name: 'Default', vid: 1, color: '#808080', predefined: true }, { group_id: 2, name: 'Management', vid: 10, color: '#2266cc', predefined: true }],
    trunks: [{ trunk_id: 1, name: 'ISL', predefined: true, color: '#999999', groups: [1, 2], untagged_group: 1 }], mode, state: 'groups', eink: { present: !!eink, mode: 'standard', show_ip: true, show_qr: false, invert: false, shot: WHITE_PNG, custom: null, preview: null, up: null },
    ports: Array.from({ length: ports }, (_, i) => ({ port_number: i + 1, legend: '', member_of: { type: 'group', id: 1 }, type: i >= ports - 2 ? 'sfp' : 'rj45', enabled: true, link_speed: { mode: 'auto', speed: ['all'] } })),
    poe: Array.from({ length: Math.min(8, ports - 2) }, (_, i) => ({ port_number: i + 1, enabled: true })),
    ip: { mode: 'dhcp', ip_address: ip, prefix_length: 24, default_gateway: '0.0.0.0' },
    log: [] };
  const h = async (method, path, body, opts = {}) => {
    st.log.push(`${method} ${path}`);
    let m;
    if(path.startsWith('/api/eink')){
      if(!st.eink.present) throw err(404, 'no e-ink');
      if(method === 'GET' && path === '/api/eink') return { present: true, mode: st.eink.mode, show_ip: st.eink.show_ip, show_qr: st.eink.show_qr, invert: st.eink.invert };
      if(method === 'GET' && path === '/api/eink/screenshot') return { base64: st.eink.shot, contentType: 'image/png' };
      if(method === 'PUT' && path.startsWith('/api/eink/custom/upload')){ st.eink.up = opts.bodyBase64 && atob(opts.bodyBase64.slice(0, 12)).slice(1, 4) === 'PNG' ? opts.bodyBase64 : null; if(!st.eink.up) throw err(400, 'not a PNG'); (path.includes('preview=true') ? (st.eink.preview = st.eink.up) : (st.eink.custom = st.eink.up)); return null; }
      if(method === 'GET' && path.startsWith('/api/eink/custom/download')) return { base64: path.includes('preview=true') ? st.eink.preview : st.eink.custom, contentType: 'image/png' };
      if(method === 'PUT' && path === '/api/eink/custom/apply'){ if(!st.eink.preview) throw err(409, 'no preview'); st.eink.custom = st.eink.preview; return null; }
      if(method === 'PUT' && path === '/api/eink/custom/clear'){ st.eink.custom = null; return null; }
      if(method === 'PUT' && /^\/api\/eink\/(mode|show_ip|show_qr|invert)$/.test(path)){ st.eink[path.split('/').pop()] = body; return body; }
      throw err(404, path);
    }
    if(method === 'GET'){
      if(path === '/api/device') return clone(st.device);
      if(path === '/api/groups/group') return clone(st.groups);
      if(path === '/api/trunks/trunk') return clone(st.trunks);
      if(path === '/api/ports') return clone({ port: st.ports });
      if(path === '/api/ip_settings') return clone(st.ip);
      if(path === '/api/interface/info/current_state') return st.state;
      if(path === '/api/poe/capable') return st.poe.length > 0;
      if(path === '/api/poe/ports') return clone(st.poe);
      if(path === '/api/config/mode') return st.mode;
      throw err(404, path);
    }
    if(path === '/api/device/name' && method === 'PUT'){ if(!/^[a-zA-Z0-9\-_ ]*$/.test(body)) throw err(400, 'name pattern'); st.device.name = body; return body; }
    if(path === '/api/groups/group' && method === 'POST'){
      if(st.groups.some(g => g.group_id === body.group_id || g.vid === body.vid)) throw err(409, 'duplicate group');
      if(body.name && body.name.length > 31) throw err(400, 'name too long'); st.groups.push({ color: '#808080', ...clone(body) }); return body;
    }
    if(path === '/api/interface/set_state' && method === 'PUT'){ if(!/^(dark_mode|groups|rlinkx|multilinkx|poe|milan|all_(red|green|blue|white|cyan|magenta|yellow|black))$/.test(body?.state)) throw err(400, 'state'); st.state = body.state; return null; }
    if((m = path.match(/^\/api\/trunks\/trunk\/(\d+)\/color$/)) && method === 'PUT'){ const t = st.trunks.find(x => x.trunk_id === +m[1]); if(!t) throw err(404, 'trunk'); if(t.predefined) throw err(403, 'the predefined trunk is white'); t.color = body; return body; }
    if((m = path.match(/^\/api\/groups\/group\/(\d+)\/(name|color)$/)) && method === 'PUT'){
      const g = st.groups.find(x => x.group_id === +m[1]); if(!g) throw err(404, 'group'); if(g.predefined && m[2] === 'name') throw err(403, 'predefined group name is read-only'); g[m[2]] = body; return body;
    }
    if(path === '/api/trunks/trunk' && method === 'POST'){
      if(st.trunks.some(t => t.trunk_id === body.trunk_id)) throw err(409, 'duplicate trunk');
      for(const gid of body.groups || []) if(!st.groups.some(g => g.group_id === gid)) throw err(400, 'unknown group ' + gid);
      st.trunks.push(clone(body)); return body;
    }
    if(path === '/api/trunks/assign_ports' && method === 'PUT'){
      if(!st.trunks.some(t => t.trunk_id === body?.id) || !Array.isArray(body.ports)) throw err(400, 'unknown trunk / ports');
      if(ignoreAssign || st.ignoreAssign) return {};              // a switch that says ok and does nothing
      for(const q of st.ports){ const inList = body.ports.includes(q.port_number); if(inList) q.member_of = { type: 'trunk', id: body.id }; else if(q.member_of.type === 'trunk' && q.member_of.id === body.id) q.member_of = { type: 'group', id: 1 }; }
      return null;
    }
    if((m = path.match(/^\/api\/trunks\/trunk\/(\d+)\/(groups|untagged_group)$/)) && method === 'PUT'){
      const t = st.trunks.find(x => x.trunk_id === +m[1]); if(!t) throw err(404, 'trunk'); if(t.predefined && st.lockIsl && m[2] === 'groups') throw err(403, 'predefined trunk groups are read-only'); t[m[2]] = body; return body;
    }
    if((m = path.match(/^\/api\/ports\/port\/(\d+)\/(legend|member_of)$/)) && method === 'PUT'){
      const p = st.ports.find(x => x.port_number === +m[1]); if(!p) throw err(404, 'port');
      if(m[2] === 'legend' && String(body).length > 16) throw err(400, 'legend too long');
      if(m[2] === 'member_of'){
        const ok = body.type === 'group' ? st.groups.some(g => g.group_id === body.id) : body.type === 'trunk' && st.trunks.some(t => t.trunk_id === body.id);
        if(!ok) throw err(400, 'unknown member');
      }
      p[m[2]] = body; return body;
    }
    if((m = path.match(/^\/api\/poe\/ports\/(\d+)\/enabled$/)) && method === 'PUT'){ const q = st.poe.find(x => x.port_number === +m[1]); if(!q) throw err(404, 'no PoE on port'); if(typeof body !== 'boolean') throw err(400, 'boolean'); q.enabled = body; return body; }
    if((m = path.match(/^\/api\/ports\/port\/(\d+)\/link_speed\/(mode|speed)$/)) && method === 'PUT'){
      const q = st.ports.find(x => x.port_number === +m[1]); if(!q) throw err(404, 'port');
      if(m[2] === 'mode' && !['auto', 'fixed'].includes(body)) throw err(400, 'mode'); if(m[2] === 'speed' && !Array.isArray(body)) throw err(400, 'speed list');
      q.link_speed[m[2]] = clone(body); if(m[2] === 'mode' && body === 'auto') q.link_speed.speed = ['all']; return body;
    }
    if((m = path.match(/^\/api\/config\/profiles\/(\d+)\/save$/)) && method === 'PUT'){ st.profiles = st.profiles || {}; st.profiles[m[1]] = clone({ device: st.device, groups: st.groups, trunks: st.trunks, ports: st.ports }); return null; }
    if((m = path.match(/^\/api\/ip_settings\/(mode|prefix_length|default_gateway|ip_address)$/)) && method === 'PUT'){ st.ip[m[1]] = body; return body; }
    throw err(404, `${method} ${path}`);
  };
  return { kind: 'gigacore', state: st, h };
}

export function lumiNodeSim({ short = 'LumiNode', long = 'LumiNode 4', ip = '192.168.1.60', outputs = 4, universes = [0, 1, 2, 3], klass = 'artnet', version = 'v2.9.1', dmxIn = [] } = {}){
  const st = { info: { ID: 0, colors: [], short_name: short, long_name: long }, ip: { ipaddress: ip, netmask: '255.255.255.0', gateway: '0.0.0.0' }, ios: [], blocks: [], log: [] };
  let nextIo = 1;
  for(let i = 0; i < outputs; i++){
    const isIn = dmxIn.includes(i);
    const net = { id: nextIo++, io_class: klass, io_type: isIn ? 'output' : 'input', universe: universes[i] ?? i, name: `${isIn ? 'Out' : 'In'} ${i + 1}`, duplicate_ios: [] };
    const dmx = { id: 100000 + i, io_class: 'dmx', io_type: isIn ? 'input' : 'output', port_number: i, name: `${isIn ? 'In' : 'Out'} ${i + 1}`, rdm: false, interweaving: false, adaptive_discovery: false, rdm_universe: -1 };
    st.ios.push(net, dmx); st.blocks.push({ id: i, name: `PB ${i + 1}`, inputs: { 0: isIn ? dmx.id : net.id }, outputs: { 0: isIn ? net.id : dmx.id } });
  }
  const h = async (method, path, body) => {
    st.log.push(`${method} ${path}`);
    let m;
    if(method === 'GET'){
      if(path === '/api/software/version') return { current: version, minimum: 'v2.0.0', alternate: null };
      if(path === '/api/deviceinfo') return clone(st.info);
      if(path === '/api/ipsettings') return clone(st.ip);
      if(path === '/api/IO') return clone(st.ios);
      if(path === '/api/processblock') return clone(st.blocks);
      throw err(404, path);
    }
    if(path === '/api/deviceinfo' && method === 'PUT'){ if((body.short_name || '').length > 17) throw err(400, 'short name'); Object.assign(st.info, clone(body)); return body; }
    if(path === '/api/ipsettings' && method === 'PUT'){ st.ip = clone(body); return body; }
    if((m = path.match(/^\/api\/IO\/(\d+)$/)) && method === 'PUT'){
      const i = st.ios.findIndex(x => x.id === +m[1]); if(i < 0) throw err(404, 'io');
      if(body.io_class === 'artnet' && (body.universe < 0 || body.universe > 32767)) throw err(400, 'universe range');
      if(body.io_class === 'dmx' && body.rdm_universe == null) throw err(422, 'rdm_universe: Missing data for required field');
      st.ios[i] = { ...clone(body), id: +m[1] }; return st.ios[i];
    }
    if(path === '/api/IO' && method === 'POST'){ const io = { ...clone(body), id: nextIo++ }; st.ios.push(io); return { ...io, index: io.id }; }
    if((m = path.match(/^\/api\/processblock\/(\d+)\/output$/)) && method === 'PUT'){ const b = st.blocks.find(x => x.id === +m[1]); if(!b) throw err(404, 'block'); if(!st.ios.some(x => x.id === body.io_id)) throw err(400, 'unknown io'); const k = Object.keys(b.outputs).length; b.outputs[k] = body.io_id; return body; }
    if((m = path.match(/^\/api\/processblock\/(\d+)\/input\/(\d+)$/)) && method === 'PUT'){
      const b = st.blocks.find(x => x.id === +m[1]); if(!b) throw err(404, 'block');
      if(!st.ios.some(x => x.id === body.io_id)) throw err(400, 'unknown io'); b.inputs[m[2]] = body.io_id; return body;
    }
    if((m = path.match(/^\/api\/processblock\/(\d+)\/output\/(\d+)$/)) && method === 'DELETE'){
      const b = st.blocks.find(x => x.id === +m[1]); if(!b) throw err(404, 'block'); const k = Object.keys(b.outputs).find(k => b.outputs[k] === +m[2]); if(k == null) throw err(404, 'not an output of this block'); delete b.outputs[k]; return null;
    }
    if((m = path.match(/^\/api\/IO\/(\d+)$/)) && method === 'DELETE'){
      const id = +m[1], io = st.ios.find(x => x.id === id); if(!io) throw err(404, 'io'); if(io.io_class === 'dmx') throw err(400, 'DMX IOs are not deleted');
      if(st.blocks.some(b => [...Object.values(b.inputs), ...Object.values(b.outputs)].includes(id))) throw err(409, 'IO still in use');
      st.ios = st.ios.filter(x => x.id !== id); return null;
    }
    throw err(404, `${method} ${path}`);
  };
  return { kind: 'lumi', state: st, h };
}

// a little network: ip -> simulated device, as one transport  net(ip)(method, path, body)
export function simNetwork(devs){
  const map = new Map(devs.map(d => [d.ip, d]));
  const net = ip => { const d = map.get(ip); if(!d) return async () => { throw Object.assign(new Error('timeout'), { status: 0 }); }; return d.dev.h; };
  net.devices = map; return net;
}
