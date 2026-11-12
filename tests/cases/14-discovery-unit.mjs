import dgram from 'node:dgram';
import { ROOT } from '../lib.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
// Finding devices: the mDNS answer of a Luminex device (_luminex._tcp.local), IPv6 link-local zones, and the watcher; plus the plain error text of a failed call.
// No real device and no IPv6 route here: the IPv6 connection itself is only tried with a stand-in for the device check.
export default { name:'discovery: _luminex answer, IPv6 zones, watcher, failed-call text', kind:'node', timeout:60000, async run(t){
  const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
  const { dnsParse, luminexAnswer, linkLocalZones, createWatcher } = await imp('core/netwatch.js'), { luminexHttp, V6_LINK_LOCAL } = await imp('core/luminex-http.js'), { runOps, plainError } = await imp('core/luminex-api.js');
  const nm = n => Buffer.concat([...n.split('.').map(p => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])), Buffer.from([0])]);
  const rr = (name, type, data) => Buffer.concat([nm(name), Buffer.from([0, type, 0x80, 1, 0, 0, 0x78, 0]), Buffer.from([data.length >> 8, data.length & 255]), data]);
  const txt = list => Buffer.concat(list.map(s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s)])));
  const answer = ({ serial = 'LUM080001924', product = 'GigaCore 20t', ip = '192.168.71.195/16', v4 = [192, 168, 71, 195], v6 = 'fe80:0:0:0:d269:9eff:fe11:1f0c', name = 'GigaCore 20t' } = {}) => {
    const svc = `${serial}._luminex._tcp.local`, host = `${serial}.local`, aaaa = Buffer.alloc(16); v6.split(':').forEach((g, i) => aaaa.writeUInt16BE(parseInt(g, 16), i * 2));
    const recs = [rr('_luminex._tcp.local', 12, nm(svc)), rr(svc, 16, txt(['txtvers=1', `product_type=${product}`, 'mac=d0:69:9e:11:1f:0c', 'firmware_version=1.9.2', `serial=${serial}`, `device_name=${name}`, `ip_address=${ip}`, 'ip_address_info=config_allowed'])), rr(svc, 33, Buffer.concat([Buffer.from([0, 0, 0, 0, 0x2d, 0xc5]), nm(host)])), rr(host, 1, Buffer.from(v4)), rr(host, 28, aaaa)];
    return Buffer.concat([Buffer.from([0, 0, 0x84, 0, 0, 0, 0, recs.length, 0, 0, 0, 0]), ...recs]);
  };
  const rec = dnsParse(answer()), la = luminexAnswer(rec);
  t.ok(rec && rec.some(r => r.type === 28 && r.data === 'fe80:0:0:0:d269:9eff:fe11:1f0c'), 'the AAAA record is read');
  t.ok(la && la.serial === 'LUM080001924' && la.product === 'GigaCore 20t' && la.mac === 'd0:69:9e:11:1f:0c' && la.firmware === '1.9.2' && la.ipv4 === '192.168.71.195' && /^fe80:/.test(la.v6), 'type, serial, MAC, firmware, IPv4 and IPv6 come out of the answer');
  t.ok(luminexAnswer(dnsParse(Buffer.concat([Buffer.from([0, 0, 0x84, 0, 0, 0, 0, 1, 0, 0, 0, 0]), rr('x._http._tcp.local', 12, nm('y._http._tcp.local'))]))) === null, 'an answer that is not from a Luminex device is ignored');
  const ifs = { Ethernet:[{ family:'IPv6', address:'fe80::1', scopeid:17, internal:false }], 'Wi-Fi':[{ family:'IPv6', address:'fe80::2', scopeid:9, internal:false }], lo:[{ family:'IPv6', address:'::1', internal:true }] };
  t.ok(JSON.stringify(linkLocalZones(['Ethernet'], ifs, 'win32')) === '["17"]', 'Windows: the zone is the interface number'); t.ok(JSON.stringify(linkLocalZones(['Ethernet'], ifs, 'linux')) === '["Ethernet"]', 'elsewhere: the zone is the adapter name');
  t.ok(V6_LINK_LOCAL.test('fe80::d269:9eff:fe11:1f0c%17') && !V6_LINK_LOCAL.test('fe80::1') && !V6_LINK_LOCAL.test('2001:db8::1%1') && !V6_LINK_LOCAL.test('fe80::1%1/../x'), 'only a link-local address with a zone is accepted');
  let e1 = ''; await luminexHttp({ ip:'10.0.0.1', v6:'2001:db8::1', path:'/api/x' }).catch(e => { e1 = e.message; }); t.ok(/Bad IPv6/.test(e1), 'luminexHttp refuses a v6 that is not link-local');
  const watch = async (mk, who, opts) => { const seen = [], w = createWatcher({ getAdapters:async () => [{ name:opts.adapter || 'lo', label:'x', kind:'ethernet', addresses:[{ address:'127.0.0.1', netmask:'255.0.0.0', prefix:8 }] }], range:'127.0.0.1', onSeen:d => seen.push(d), ...(opts.extra || {}) });
    w.start(); await new Promise(r => setTimeout(r, 1500)); const s = dgram.createSocket('udp4'); s.send(mk, 5353, '127.0.0.1'); await new Promise(r => setTimeout(r, 1500)); w.stop(); s.close(); return seen.find(x => x.ip === who); };
  const far = await watch(answer({ serial:'LUM072012854', product:'LumiNode12', ip:'2.164.235.10/8', v4:[2, 164, 235, 10], name:'LumiNode12', v6:'fe80:0:0:0:d269:9eff:fea0:eb0a' }), '2.164.235.10', {});
  t.ok(!!far && far.serial === 'LUM072012854' && far.kind === 'lumi' && far.reach === false, 'a LumiNode in another IP range is found with its serial number (no IPv6 route here, so not reachable)');
  const tried = [], v6 = await watch(answer({ serial:'LUM071011179', product:'LumiNode4', ip:'10.90.102.14/8', v4:[10, 90, 102, 14], name:'ID:24', v6:'fe80:0:0:0:d269:9eff:fe9f:ca32' }), '10.90.102.14', { adapter:'Ethernet', extra:{ zonesOf:() => ['9', '17'], identify:async ({ ip, v6 }) => { tried.push(v6); return /%17$/.test(v6) ? { ip, v6, kind:'lumi', name:'ID:24', longName:'', model:'', version:'v2.9.1', auth:false } : null; } } });
  t.ok(!!v6 && v6.reach === true && /%17$/.test(v6.v6) && tried.length === 2, 'IPv6: the zones are tried in turn, the one that answers is kept, the device is reachable');
  const raw = `Error invoking remote method 'luminexHttp': Error: 404 {"description":"The requested URL was not found on the server","code":404,"name":"Not Found","id":"f944","fmt":{}}`;
  t.ok(plainError(new Error(raw)) === '404 The requested URL was not found on the server', 'a device answer is shown plainly');
  let msg = ''; await runOps(async (m, p) => { if(p === '/api/IO/100000') throw new Error(raw); return null; }, [{ method:'PUT', path:'/api/deviceinfo', body:{}, text:'Name' }, { method:'PUT', path:'/api/IO/100000', body:{}, text:'DMX 1: name' }]).catch(e => { msg = e.message; });
  t.ok(/^PUT \/api\/IO\/100000: 404 The requested URL was not found/.test(msg) && /DMX 1/.test(msg), 'a failed call names the call, what the device said and what it was for');
} };
