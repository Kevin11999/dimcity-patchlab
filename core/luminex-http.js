// core/luminex-http.js — one HTTP call to a Luminex device (GigaCore gen 2 WebApi / LumiNode WebApi), run in the main process.
// Only /api/ paths on a plain IPv4 address, GET/PUT/POST, Basic auth when a user name is given, short time-out.
export async function luminexHttp(req = {}){
  const { ip, method = 'GET', path: apiPath = '', body, bodyBase64, contentType, asBase64, user, pass, https: useTls, timeoutMs = 6000 } = req;
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '')) throw new Error('Bad IP');
  if(!/^\/api\/[A-Za-z0-9_\-\/{}.]*(\?[A-Za-z0-9_=&]*)?$/.test(apiPath) || apiPath.includes('..')) throw new Error('Bad path');
  if(!['GET', 'PUT', 'POST', 'DELETE'].includes(method)) throw new Error('Bad method');
  const mod = await import(useTls ? 'node:https' : 'node:http');
  // JSON by default; a binary body (an image) comes in as base64 and goes out as raw bytes
  if(bodyBase64 != null && (typeof bodyBase64 !== 'string' || bodyBase64.length > 8e6)) throw new Error('Bad body');
  const payload = bodyBase64 != null ? Buffer.from(bodyBase64, 'base64') : body === undefined ? null : JSON.stringify(body);
  const headers = { Accept: asBase64 ? '*/*' : 'application/json' };
  if(payload != null){ headers['Content-Type'] = bodyBase64 != null ? 'application/octet-stream' : 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
  if(user) headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass || ''}`).toString('base64');
  return await new Promise((resolve, reject) => {
    const r = mod.request({ host: ip, port: useTls ? 443 : 80, path: apiPath, method, headers, timeout: Math.min(10000, Math.max(300, Number(timeoutMs) || 6000)), rejectUnauthorized: false }, res => {
      const chunks = []; let size = 0; res.on('data', c => { size += c.length; if(size < 6e6) chunks.push(c); });
      res.on('end', () => {
        const buf = Buffer.concat(chunks), data = buf.toString('utf8');
        if(res.statusCode === 401 || res.statusCode === 403) return reject(Object.assign(new Error('401 Wrong user name or password'), { status: 401 }));
        if(res.statusCode < 200 || res.statusCode >= 300) return reject(Object.assign(new Error(`${res.statusCode} ${data.slice(0, 200)}`), { status: res.statusCode }));
        if(asBase64) return resolve({ base64: buf.toString('base64'), contentType: String(res.headers['content-type'] || '') });
        if(!data.trim()) return resolve(null);
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('Timeout — no answer from ' + ip), { status: 0 })));
    r.on('error', e => reject(e));
    if(payload != null) r.write(payload);
    r.end();
  });
}

// "10.0.0.5", "10.0.0.0/24", "10.0.0.20-60" or "10.0.0.20-10.0.0.60" -> list of addresses (at most `max`)
export function expandRanges(text, max = 1024){
  const out = new Set(), ip2n = s => s.split('.').reduce((n, o) => n * 256 + Number(o), 0), n2ip = n => [24, 16, 8, 0].map(b => (n >>> b) & 255).join('.');
  const isIp = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every(o => Number(o) <= 255);
  for(const part of String(text || '').split(/[\s,;]+/).filter(Boolean)){
    let m;
    if(isIp(part)) out.add(part);
    else if((m = part.match(/^(\S+)\/(\d{1,2})$/)) && isIp(m[1]) && Number(m[2]) >= 16 && Number(m[2]) <= 32){
      const bits = Number(m[2]), size = 2 ** (32 - bits), base = Math.floor(ip2n(m[1]) / size) * size;
      for(let i = size > 2 ? 1 : 0; i < (size > 2 ? size - 1 : size); i++) out.add(n2ip(base + i));
    } else if((m = part.match(/^(\d{1,3}(?:\.\d{1,3}){2})\.(\d{1,3})-(\d{1,3})$/))) { for(let i = Number(m[2]); i <= Math.min(255, Number(m[3])); i++) out.add(`${m[1]}.${i}`); }
    else if((m = part.match(/^(\S+)-(\S+)$/)) && isIp(m[1]) && isIp(m[2])) { for(let n = ip2n(m[1]); n <= ip2n(m[2]) && out.size <= max; n++) out.add(n2ip(n)); }
    if(out.size > max) break;
  }
  return [...out].slice(0, max);
}

// Find LumiNodes / LumiCores and GigaCores. Step 1: which addresses have port 80 open (fast, many at once).
// Step 2: ask those — GET /api/software/version with a "current" field is a LumiNode / LumiCore, GET /api/device with a model is a GigaCore.
// A device that asks for a login answers 401: listed as "unknown", login needed. Things with port 80 open that are neither (routers, printers) are left out.
export async function luminexScan({ ips = [], user, pass, https: useTls, timeoutMs = 1500, tcpMs = 600, concurrency = 400 } = {}){
  const net = await import('node:net');
  const list = (ips || []).filter(x => /^\d{1,3}(\.\d{1,3}){3}$/.test(x)).slice(0, 65536), open = [];
  let i = 0;
  const probePort = ip => new Promise(res => {
    const sock = net.connect({ host: ip, port: useTls ? 443 : 80 }); let done = false;
    const end = ok => { if(done) return; done = true; sock.destroy(); res(ok); };
    sock.setTimeout(tcpMs); sock.on('connect', () => end(true)); sock.on('timeout', () => end(false)); sock.on('error', () => end(false));
  });
  const w1 = async () => { while(i < list.length){ const ip = list[i++]; if(await probePort(ip)) open.push(ip); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length || 1) }, w1));
  const found = []; let k = 0;
  const one = async ip => {
    const base = { ip, user, pass, https: useTls, timeoutMs };
    let auth = false;
    try {
      const v = await luminexHttp({ ...base, path: '/api/software/version' });
      if(v && typeof v === 'object' && v.current != null){
        let info = {}; try { info = (await luminexHttp({ ...base, path: '/api/deviceinfo' })) || {}; } catch {}
        return found.push({ ip, kind: 'lumi', name: info.short_name || '', longName: info.long_name || '', model: '', version: String(v.current), auth: false });
      }
    } catch(e) { if(e.status === 401) auth = true; }
    try {
      const d = await luminexHttp({ ...base, path: '/api/device' });
      if(d && typeof d === 'object' && (d.model != null || d.name != null)) return found.push({ ip, kind: 'gigacore', name: d.name || '', longName: d.description || '', model: d.model || '', mac: d.mac_address || '', version: '', auth: false });
    } catch(e) { if(e.status === 401) auth = true; }
    if(auth) found.push({ ip, kind: 'unknown', name: '', longName: '', model: '', version: '', auth: true });
  };
  const w2 = async () => { while(k < open.length){ const ip = open[k++]; try { await one(ip); } catch {} } };
  await Promise.all(Array.from({ length: Math.min(32, open.length || 1) }, w2));
  const n = a => a.split('.').reduce((x, o) => x * 256 + +o, 0);
  return found.sort((a, b) => n(a.ip) - n(b.ip));
}

// the networks this computer is in (whole subnet up to a /16; anything wider or narrower than that becomes the /24 around the address)
export async function localRanges(){
  const os = await import('node:os'), out = [];
  for(const list of Object.values(os.networkInterfaces())) for(const a of list || []) if(a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')){
    const bits = a.netmask ? a.netmask.split('.').reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, '').length, 0) : 24;
    out.push(bits >= 16 && bits <= 30 ? `${a.address}/${bits}` : a.address.split('.').slice(0, 3).join('.') + '.0/24');
  }
  return [...new Set(out)];
}
