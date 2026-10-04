// tools/build-luminex-catalog.mjs — turns the OpenAPI files of the GigaCore (gen 2) and the LumiNode / LumiCore into the list of
// settings PatchLab can show and change (core/luminex-catalog.js). Run:  node tools/build-luminex-catalog.mjs <gigacore.json> <luminode.json>
// Only things that can be written are kept; counters, status and actions are left out. The catalogue is read by core/luminex-settings.js.
import fs from 'node:fs';
const [,, gcFile, lnFile, outFile = new URL('../core/luminex-catalog.js', import.meta.url).pathname] = process.argv;
if(!gcFile || !lnFile){ console.error('usage: node tools/build-luminex-catalog.mjs gigacore.json luminode.json [out.js]'); process.exit(1); }

const human = k => { const s = String(k).replace(/_/g, ' ').replace(/\bip\b/gi, 'IP').replace(/\bvid\b/gi, 'VLAN id').replace(/\bpoe\b/gi, 'PoE').replace(/\bigmp\b/gi, 'IGMP').replace(/\bmld\b/gi, 'MLD').replace(/\bptp\b/gi, 'PTP').replace(/\bdhcp\b/gi, 'DHCP').replace(/\bdns\b/gi, 'DNS').replace(/\bavb\b/gi, 'AVB').replace(/\bdmx\b/gi, 'DMX').replace(/\bpvid\b/gi, 'PVID').replace(/\bmstp?\b/gi, 'MST').replace(/\bsnmp\b/gi, 'SNMP').replace(/\blldp\b/gi, 'LLDP').replace(/\bmdns\b/gi, 'mDNS').replace(/\bstp\b/gi, 'STP').replace(/\bmac\b/gi, 'MAC').replace(/\bsfp\b/gi, 'SFP'); return s.charAt(0).toUpperCase() + s.slice(1); };
const SECTION_TITLES = { device:'Device', led:'LEDs', ip_settings:'IP settings', snmp:'SNMP', lldp:'LLDP', tunnels:'Tunnels', layer3:'Layer 3', maap:'MAAP', ports:'Ports', security:'Security', poe:'PoE', snooping:'IGMP / MLD snooping', spanning_tree:'Spanning tree', vlans:'VLANs', avdecc:'AVDECC', avb:'AVB', port_mirror:'Port mirroring', gptp:'gPTP', ptp:'PTP', rlinkx:'R-LinkX', groups:'VLAN groups', trunks:'Trunks', interface:'Front panel', extension_board:'Extension board', fans:'Fans', display:'Display', milan:'Milan', dhcp_server:'DHCP server', eink:'E-ink display', mdns:'mDNS', power:'Power', eula:'EULA',
  deviceinfo:'Device', ipsettings:'IP settings', protocols_config:'Protocols', dmx_config:'DMX output', display_settings:'Display', leds:'LEDs', ethdmx_compatibility:'EthDMX compatibility', contact_closure:'Contact closure', nfc:'NFC', license:'License', processblock:'Process blocks', network_config:'Network' };
const DEVICE_SPECIFIC = /(^|_)(name|hostname|description|system_id|ip_address|ipaddress|gateway|default_gateway|prefix_length|netmask|serial|mac_address|legend|short_name|long_name|id|password|pin_code|client_ip|source_ip|querier_ip|license)($|_)/;
const DANGER = /ip_settings|ipsettings|security|\/ports\/port\/\{port_number\}\/enabled|layer3|network_config|auth/;

function load(file){ const j = JSON.parse(fs.readFileSync(file, 'utf8')); return { j, S: j.components.schemas, P: j.paths }; }
function resolver(S){ const R = (x, d = 0) => (x && x.$ref && d < 40 ? R(S[x.$ref.split('/').pop()], d + 1) : x); return R; }
const kind = s => (s.enum ? 'enum' : s.type === 'boolean' ? 'boolean' : s.type === 'integer' ? 'integer' : s.type === 'number' ? 'number' : s.type === 'string' ? 'string' : s.type === 'array' ? 'list' : null);

function walkProduct({ j, S, P }, roots, opt){
  const R = resolver(S), fields = [], colls = {};
  const leaf = (steps, parts, vars, collId, s, tmpl, objAnc) => {
    const sc = R(s); if(!sc || sc.readOnly) return;
    let k = kind(sc); if(k === 'list'){ const it = R(sc.items); if(!it || !['integer', 'number', 'string'].includes(it.type)) return; }
    if(!k) return;
    const put = P[tmpl]?.put; const putOk = put && !(R(put.requestBody?.content?.['application/json']?.schema)?.writeOnly);
    let mode = null, objPath = null, objSteps = null;
    if(putOk) mode = 'leaf';
    else if(objAnc){ mode = 'object'; objPath = objAnc.path; objSteps = objAnc.steps; }
    if(!mode) return;
    const f = { id: tmpl, sec: opt.secOf(parts), label: human(parts[parts.length - 1]), group: parts.slice(1, -1).filter(x => !/^\{/.test(x)).map(human).join(' › '), steps, vars: vars.slice(), coll: collId, type: k, mode };
    if(sc.enum) f.enum = sc.enum; if(k === 'list') f.itemType = R(sc.items).type;
    for(const a of ['minimum', 'maximum', 'maxLength', 'pattern', 'default']) if(sc[a] !== undefined) f[a === 'minimum' ? 'min' : a === 'maximum' ? 'max' : a] = sc[a];
    const d = (sc.description || sc.title || '').replace(/\s+/g, ' ').trim(); if(d) f.desc = d.slice(0, 220);
    if(mode === 'object'){ f.objPath = objPath; f.objSteps = objSteps; }
    if(DEVICE_SPECIFIC.test(parts[parts.length - 1])) f.dev = 1;
    if(DANGER.test(tmpl)) f.danger = 1;
    fields.push(f);
  };
  const walk = (node, steps, parts, vars, collId, depth, objAnc) => {
    const sc = R(node); if(!sc || depth > 12) return;
    if(sc.type === 'object' || sc.properties){
      const tmpl = '/' + parts.join('/'); const hasPut = P[tmpl]?.put && R(P[tmpl].put.requestBody?.content?.['application/json']?.schema)?.type !== undefined && !R(P[tmpl].put.requestBody.content['application/json'].schema).writeOnly;
      const anc = hasPut && parts.length > 2 ? { path: tmpl, steps } : objAnc;
      for(const [k, v] of Object.entries(sc.properties || {})){
        const r = R(v); if(!r || r.readOnly) continue;
        if(opt.skipKey?.(parts, k)) continue;
        if(vars.includes(k) || (collId && k === 'id' && !/processblock/.test(collId))) continue;                 // the key of a list item is not a setting
        if(parts[1] === 'deviceinfo' && (k === 'ID' || k === 'colors')) continue;
        if(r.type === 'array' && R(r.items)?.type === 'object' || r.type === 'array' && R(r.items)?.properties){
          // a list of things with a key: ports, groups, ...
          const prefix = '/' + [...parts, k].join('/'); const kp = Object.keys(P).find(p => p.startsWith(prefix + '/{') && !p.slice(prefix.length + 2).includes('/') && p.endsWith('}'));
          if(!kp) continue; const variable = kp.slice(prefix.length + 2, -1);
          const cid = prefix + '/{' + variable + '}'; colls[cid] = { id: cid, steps: [...steps, [k, opt.idKey?.(cid, variable) || variable]], variable, title: human(k) };
          walk(r.items, [...steps, [k, opt.idKey?.(cid, variable) || variable]], [...parts, k, '{' + variable + '}'], [...vars, variable], cid, depth + 1, anc);
        } else if(r.type === 'object' || r.properties) walk(r, [...steps, [k]], [...parts, k], vars, collId, depth + 1, anc);
        else leaf([...steps, [k]], [...parts, k], vars, collId, r, '/' + [...parts, k].join('/'), anc);
      }
    }
  };
  for(const r of roots){ walk(r.schema, r.steps, r.parts, [], null, 0, r.objAnc); }
  return { fields, colls };
}

// ---- GigaCore: the whole tree under /api ----
{
  const g = load(gcFile), R = resolver(g.S);
  const root = g.S._api;
  var GC = walkProduct(g, [{ schema: root, steps: [], parts: ['api'], objAnc: null }], {
    secOf: parts => parts[1],
    skipKey: (parts, k) => parts.length === 1 && ['config', 'status_message', 'mac', 'sfp', 'eula', 'fans', 'power', 'temperatures', 'duplicate_ip', 'lldp', 'tunnels'].includes(k) ? (k === 'lldp' || k === 'tunnels' ? false : true) : false });
}
// ---- LumiNode: the settings roots one by one (there is no tree) ----
{
  const l = load(lnFile), R = resolver(l.S);
  const ROOTS = ['deviceinfo', 'deviceinfo/auth', 'ipsettings', 'protocols_config', 'dmx_config', 'display_settings', 'leds', 'ethdmx_compatibility', 'contact_closure', 'snmp', 'nfc'];
  const roots = [];
  for(const r of ROOTS){
    const tmpl = '/api/' + r, o = l.P[tmpl]; if(!o?.put) continue;
    const sc = R(o.put.requestBody?.content?.['application/json']?.schema); if(!sc) continue;
    roots.push({ schema: sc, steps: r.split('/').map(x => [x]), parts: ['api', ...r.split('/')], objAnc: { path: tmpl, steps: r.split('/').map(x => [x]) } });
  }
  // process blocks: the simple properties of every block
  const pbs = R({ $ref: '#/components/schemas/ProcessBlockSerialize' });
  var LN = walkProduct(l, roots, { secOf: parts => (parts[1] === 'deviceinfo' ? 'deviceinfo' : parts[1]) });
  if(pbs?.properties){
    const keep = ['name', 'mode', 'ratelimiting', 'backup_auto_recover'];
    for(const k of keep){ const v = R(pbs.properties[k]); if(!v || v.readOnly) continue; const kd = kind(v); if(!kd) continue;
      const f = { id: '/api/processblock/{processblock_idx}/' + k, sec: 'processblock', label: human(k), group: '', steps: [['processblock', 'id'], [k]], vars: ['processblock_idx'], coll: '/api/processblock/{processblock_idx}', type: kd, mode: 'object', objPath: '/api/processblock/{processblock_idx}', objSteps: [['processblock', 'id']] };
      if(v.enum) f.enum = v.enum; if(k === 'name') f.dev = 1; LN.fields.push(f); }
    LN.colls['/api/processblock/{processblock_idx}/'.slice(0, -1)] = { id: '/api/processblock/{processblock_idx}', steps: [['processblock', 'id']], variable: 'processblock_idx', title: 'Process block' };
  }
}
const out = { gigacore: { titles: SECTION_TITLES, fields: GC.fields, colls: GC.colls }, luminode: { titles: SECTION_TITLES, fields: LN.fields, colls: LN.colls } };
fs.writeFileSync(outFile, `// Generated by tools/build-luminex-catalog.mjs from the OpenAPI files of the GigaCore (WebApi 1.5.0) and the LumiNode / LumiCore (WebApi 2.9.1). Do not edit by hand.\nexport const CATALOG = ${JSON.stringify(out)};\n`);
for(const [n, c] of Object.entries(out)){ const bySec = {}; for(const f of c.fields) bySec[f.sec] = (bySec[f.sec] || 0) + 1; console.log(n, c.fields.length, 'fields,', Object.keys(c.colls).length, 'lists', JSON.stringify(bySec)); }
console.log('written', outFile, (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB');
