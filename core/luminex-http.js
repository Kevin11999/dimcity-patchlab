// core/luminex-http.js — one HTTP call to a Luminex device (GigaCore gen 2 WebApi / LumiNode WebApi), run in the main process.
// Only /api/ paths on a plain IPv4 address, GET/PUT/POST, Basic auth when a user name is given, short time-out.
export async function luminexHttp(req = {}){
  const { ip, method = 'GET', path: apiPath = '', body, user, pass, https: useTls, timeoutMs = 6000 } = req;
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '')) throw new Error('Bad IP');
  if(!/^\/api\/[A-Za-z0-9_\-\/{}.]*$/.test(apiPath) || apiPath.includes('..')) throw new Error('Bad path');
  if(!['GET', 'PUT', 'POST'].includes(method)) throw new Error('Bad method');
  const mod = await import(useTls ? 'node:https' : 'node:http');
  const payload = body === undefined ? null : JSON.stringify(body);
  const headers = { Accept: 'application/json' };
  if(payload != null){ headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
  if(user) headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass || ''}`).toString('base64');
  return await new Promise((resolve, reject) => {
    const r = mod.request({ host: ip, port: useTls ? 443 : 80, path: apiPath, method, headers, timeout: Math.min(10000, Math.max(300, Number(timeoutMs) || 6000)), rejectUnauthorized: false }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', c => { if(data.length < 4e6) data += c; });
      res.on('end', () => {
        if(res.statusCode === 401 || res.statusCode === 403) return reject(Object.assign(new Error('401 Wrong user name or password'), { status: 401 }));
        if(res.statusCode < 200 || res.statusCode >= 300) return reject(Object.assign(new Error(`${res.statusCode} ${data.slice(0, 200)}`), { status: res.statusCode }));
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

// Ask every address whether it is a LumiNode / LumiCore (GET /api/deviceinfo) or a GigaCore (GET /api/device).
// A device that wants a password answers 401: it is listed as a Luminex-style web API, kind "unknown", needs login.
export async function luminexScan({ ips = [], user, pass, https: useTls, timeoutMs = 1500, concurrency = 48 } = {}, onProgress){
  const list = (ips || []).filter(x => /^\d{1,3}(\.\d{1,3}){3}$/.test(x)).slice(0, 2048), found = [];
  let i = 0, done = 0;
  const one = async ip => {
    const base = { ip, user, pass, https: useTls, timeoutMs };
    let auth = false;
    try { const d = await luminexHttp({ ...base, path: '/api/deviceinfo' }); if(d && typeof d === 'object' && (d.short_name != null || d.long_name != null)) return found.push({ ip, kind: 'lumi', name: d.short_name || '', longName: d.long_name || '', model: '', auth: false }); }
    catch(e) { if(e.status === 401) auth = true; else if(!e.status) return; }
    try { const d = await luminexHttp({ ...base, path: '/api/device' }); if(d && typeof d === 'object' && (d.model != null || d.name != null)) return found.push({ ip, kind: 'gigacore', name: d.name || '', longName: d.description || '', model: d.model || '', mac: d.mac_address || '', auth: false }); }
    catch(e) { if(e.status === 401) auth = true; }
    if(auth) found.push({ ip, kind: 'unknown', name: '', longName: '', model: '', auth: true });
  };
  const worker = async () => { while(i < list.length){ const ip = list[i++]; try { await one(ip); } catch {} onProgress?.(++done, list.length); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length || 1) }, worker));
  return found.sort((a, b) => a.ip.split('.').reduce((n, o) => n * 256 + +o, 0) - b.ip.split('.').reduce((n, o) => n * 256 + +o, 0));
}

// the /24 around every address of this computer (not loopback)
export async function localRanges(){
  const os = await import('node:os'), out = [];
  for(const list of Object.values(os.networkInterfaces())) for(const a of list || []) if(a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address.split('.').slice(0, 3).join('.') + '.0/24');
  return [...new Set(out)];
}
