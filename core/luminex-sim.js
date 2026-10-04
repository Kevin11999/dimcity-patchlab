// core/luminex-sim.js — in-memory GigaCore (gen 2) and LumiNode devices that answer the documented HTTP calls.
// Used by the demo mode, the tests and the "simulated devices" of the network dialog. h(method, path, body) -> JSON, throws on a bad call.
const err = (code, msg) => Object.assign(new Error(`${code} ${msg}`), { status: code });
const clone = x => JSON.parse(JSON.stringify(x));

export function gigacoreSim({ name = 'GigaCore', ip = '192.168.1.10', ports = 12, mode = 'luminex' } = {}){
  const st = {
    device: { name, model: 'GigaCore 12t', api_version: '1.5.0' },
    groups: [{ group_id: 1, name: 'Default', vid: 1, color: '#808080', predefined: true }, { group_id: 2, name: 'Management', vid: 10, color: '#2266cc', predefined: true }],
    trunks: [], mode,
    ports: Array.from({ length: ports }, (_, i) => ({ port_number: i + 1, legend: '', member_of: { type: 'group', id: 1 }, type: i >= ports - 2 ? 'sfp' : 'rj45' })),
    ip: { mode: 'dhcp', ip_address: ip, prefix_length: 24, default_gateway: '0.0.0.0' },
    log: [] };
  const h = async (method, path, body) => {
    st.log.push(`${method} ${path}`);
    let m;
    if(method === 'GET'){
      if(path === '/api/device') return clone(st.device);
      if(path === '/api/groups/group') return clone(st.groups);
      if(path === '/api/trunks/trunk') return clone(st.trunks);
      if(path === '/api/ports') return clone({ port: st.ports });
      if(path === '/api/ip_settings') return clone(st.ip);
      if(path === '/api/config/mode') return st.mode;
      throw err(404, path);
    }
    if(path === '/api/device/name' && method === 'PUT'){ if(!/^[a-zA-Z0-9\-_ ]*$/.test(body)) throw err(400, 'name pattern'); st.device.name = body; return body; }
    if(path === '/api/groups/group' && method === 'POST'){
      if(st.groups.some(g => g.group_id === body.group_id || g.vid === body.vid)) throw err(409, 'duplicate group');
      if(body.name && body.name.length > 31) throw err(400, 'name too long'); st.groups.push({ color: '#808080', ...clone(body) }); return body;
    }
    if((m = path.match(/^\/api\/groups\/group\/(\d+)\/(name|color)$/)) && method === 'PUT'){
      const g = st.groups.find(x => x.group_id === +m[1]); if(!g) throw err(404, 'group'); if(g.predefined) throw err(403, 'predefined group is read-only'); g[m[2]] = body; return body;
    }
    if(path === '/api/trunks/trunk' && method === 'POST'){
      if(st.trunks.some(t => t.trunk_id === body.trunk_id)) throw err(409, 'duplicate trunk');
      for(const gid of body.groups || []) if(!st.groups.some(g => g.group_id === gid)) throw err(400, 'unknown group ' + gid);
      st.trunks.push(clone(body)); return body;
    }
    if((m = path.match(/^\/api\/trunks\/trunk\/(\d+)\/(groups|untagged_group)$/)) && method === 'PUT'){
      const t = st.trunks.find(x => x.trunk_id === +m[1]); if(!t) throw err(404, 'trunk'); t[m[2]] = body; return body;
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
    if((m = path.match(/^\/api\/config\/profiles\/(\d+)\/save$/)) && method === 'PUT'){ st.profiles = st.profiles || {}; st.profiles[m[1]] = clone({ device: st.device, groups: st.groups, trunks: st.trunks, ports: st.ports }); return null; }
    if((m = path.match(/^\/api\/ip_settings\/(mode|prefix_length|default_gateway|ip_address)$/)) && method === 'PUT'){ st.ip[m[1]] = body; return body; }
    throw err(404, `${method} ${path}`);
  };
  return { kind: 'gigacore', state: st, h };
}

export function lumiNodeSim({ short = 'LumiNode', long = 'LumiNode 4', ip = '192.168.1.60', outputs = 4, universes = [0, 1, 2, 3] } = {}){
  const st = { info: { ID: 0, colors: [], short_name: short, long_name: long }, ip: { ipaddress: ip, netmask: '255.255.255.0', gateway: '0.0.0.0' }, ios: [], blocks: [], log: [] };
  let nextIo = 1;
  for(let i = 0; i < outputs; i++){
    const inp = { id: nextIo++, io_class: 'artnet', io_type: 'input', universe: universes[i] ?? i, name: `In ${i + 1}`, duplicate_ios: [] };
    const out = { id: nextIo++, io_class: 'dmx', io_type: 'output', port_number: i, name: `Out ${i + 1}` };
    st.ios.push(inp, out); st.blocks.push({ id: i, name: `PB ${i + 1}`, inputs: { 0: inp.id }, outputs: { 0: out.id } });
  }
  const h = async (method, path, body) => {
    st.log.push(`${method} ${path}`);
    let m;
    if(method === 'GET'){
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
      st.ios[i] = { ...clone(body), id: +m[1] }; return st.ios[i];
    }
    if(path === '/api/IO' && method === 'POST'){ const io = { ...clone(body), id: nextIo++ }; st.ios.push(io); return { ...io, index: io.id }; }
    if((m = path.match(/^\/api\/processblock\/(\d+)\/input\/(\d+)$/)) && method === 'PUT'){
      const b = st.blocks.find(x => x.id === +m[1]); if(!b) throw err(404, 'block');
      if(!st.ios.some(x => x.id === body.io_id)) throw err(400, 'unknown io'); b.inputs[m[2]] = body.io_id; return body;
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
