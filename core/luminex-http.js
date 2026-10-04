// core/luminex-http.js — one HTTP call to a Luminex device (GigaCore gen 2 WebApi / LumiNode WebApi), run in the main process.
// Only /api/ paths on a plain IPv4 address, GET/PUT/POST, Basic auth when a user name is given, short time-out.
export async function luminexHttp(req = {}){
  const { ip, method = 'GET', path: apiPath = '', body, user, pass, https: useTls } = req;
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '')) throw new Error('Bad IP');
  if(!/^\/api\/[A-Za-z0-9_\-\/{}.]*$/.test(apiPath) || apiPath.includes('..')) throw new Error('Bad path');
  if(!['GET', 'PUT', 'POST'].includes(method)) throw new Error('Bad method');
  const mod = await import(useTls ? 'node:https' : 'node:http');
  const payload = body === undefined ? null : JSON.stringify(body);
  const headers = { Accept: 'application/json' };
  if(payload != null){ headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
  if(user) headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass || ''}`).toString('base64');
  return await new Promise((resolve, reject) => {
    const r = mod.request({ host: ip, port: useTls ? 443 : 80, path: apiPath, method, headers, timeout: 6000, rejectUnauthorized: false }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', c => { if(data.length < 4e6) data += c; });
      res.on('end', () => {
        if(res.statusCode === 401 || res.statusCode === 403) return reject(Object.assign(new Error('401 Wrong user name or password'), { status: 401 }));
        if(res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`${res.statusCode} ${data.slice(0, 200)}`));
        if(!data.trim()) return resolve(null);
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    r.on('timeout', () => r.destroy(new Error('Timeout — no answer from ' + ip)));
    r.on('error', e => reject(e));
    if(payload != null) r.write(payload);
    r.end();
  });
}
