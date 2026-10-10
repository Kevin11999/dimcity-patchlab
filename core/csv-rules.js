// core/csv-rules.js — how the first column of the patch CSV is read: which prefix is an LK, a Veam, a network loom (Cat cable) or a node.
// The rules live in the show (MODEL.rules), so the file carries its own conventions; the defaults are the ones PatchLab always used:
//   LK101 · VEAM12101 (an old name of LK101) · V101 · C101 / C101.1 (a Cat loom of 4 lines) · Node 601.1 (node 01 of DB06, port 1)
// A show can say "my LKs are called K101" or add loom types with their own prefix and number of lines. Inside the app an LK is always
// LK101 and a Veam V101 (rows with another prefix are translated when they are read, and back when the CSV is exported);
// a loom keeps the prefix it was given, so several loom types can live next to each other.
(function(){
  'use strict';
  const DEFAULT_LOOM = { id:'cat', name:'Cat loom', prefix:'C', lines:4 };
  const DEFAULTS = () => ({ lk:'LK', veam:'V', node:'Node', looms:[{ ...DEFAULT_LOOM }], veamOnLkPanel:false });
  const clean = (s, fb) => { const v = String(s ?? '').replace(/[^A-Za-z]/g, '').slice(0, 12); return v || fb; };
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const getModel = () => { try { return window.LKApp?.getMODEL?.() || null; } catch { return null; } };

  // the rules of a show with every missing value filled in
  function rules(m = getModel()){
    const D = DEFAULTS(), r = m?.rules || {};
    const out = { lk:clean(r.lk, D.lk), veam:clean(r.veam, D.veam), node:clean(r.node, D.node), veamOnLkPanel:!!r.veamOnLkPanel, looms:[] };
    const seen = new Set();
    for(const l of (Array.isArray(r.looms) && r.looms.length ? r.looms : D.looms)){
      const prefix = clean(l?.prefix, ''); if(!prefix || seen.has(prefix.toUpperCase())) continue; seen.add(prefix.toUpperCase());
      out.looms.push({ id:String(l.id || prefix.toLowerCase()), name:String(l.name || `${prefix} loom`).slice(0, 40), prefix, lines:Math.max(1, Math.min(48, Math.round(Number(l.lines) || 4))) });
    }
    if(!out.looms.length) out.looms.push({ ...DEFAULT_LOOM });
    return out;
  }
  const isDefault = r => { const a = JSON.stringify(rules({ rules:r })), b = JSON.stringify(rules({ rules:{} })); return a === b; };
  const dimOf = n => 'DB' + String(Math.floor(Number(n) / 100)).padStart(2, '0');

  // the prefixes to try, longest first, so "VEAM12" is tried before "V"
  function candidates(R){
    const list = [];
    const used = new Set();
    const add = (prefix, kind, extra = {}) => { const k = prefix.toUpperCase(); list.push({ prefix, kind, ...extra }); };
    for(const l of R.looms){ add(l.prefix, 'NET', { loom:l }); used.add(l.prefix.toUpperCase()); }
    add(R.node, 'NODE'); used.add(R.node.toUpperCase());
    add(R.lk, 'LK'); used.add(R.lk.toUpperCase());
    add(R.veam, 'V'); used.add(R.veam.toUpperCase());
    // the names PatchLab always understood stay valid unless a prefix of this show means something else
    for(const [p, k] of [['LK', 'LK'], ['VEAM12', 'LK'], ['V', 'V']]) if(!used.has(p)){ add(p, k, { legacy:true }); used.add(p); }
    return list.sort((a, b) => b.prefix.length - a.prefix.length);
  }
  const cache = new Map();
  function compiled(R){
    const key = JSON.stringify(R); let c = cache.get(key);
    if(!c){ c = candidates(R).map(x => ({ ...x, re:x.kind === 'NODE' ? new RegExp(`^${esc(x.prefix)}\\s*0*(\\d{3,4})(?:\\s*[.,\\-/]\\s*(\\d{1,3}))?$`, 'i') : x.kind === 'NET' ? new RegExp(`^${esc(x.prefix)}0*(\\d+)(?:\\.(\\d+))?$`, 'i') : new RegExp(`^${esc(x.prefix)}(\\d+)$`, 'i') })); if(cache.size > 20) cache.clear(); cache.set(key, c); }
    return c;
  }

  // what is this ID? { kind:'LK'|'V'|'NET'|'NODE', id (as PatchLab keeps it), num, dim, … } or null
  function classify(id, m = getModel()){
    const s = String(id ?? '').trim(); if(!s) return null;
    for(const c of compiled(rules(m))){
      const x = c.re.exec(s); if(!x) continue;
      if(c.kind === 'NODE'){ const no = x[1]; return { kind:'NODE', no, num:Number(no), dim:dimOf(Number(no)), index:Number(no) % 100 || 1, port:x[2] ? Number(x[2]) : null, id:`${c.prefix} ${no}` }; }
      const num = parseInt(x[1], 10);
      if(c.kind === 'NET') return { kind:'NET', loom:c.loom, num, dim:dimOf(num), line:x[2] != null ? Number(x[2]) : null, id:`${c.loom.prefix.toUpperCase()}${x[1].replace(/^0+(?=\d)/, '')}` };
      if(c.kind === 'LK') return { kind:'LK', num, dim:dimOf(num), id:c.legacy ? s.toUpperCase() : `LK${x[1]}` };
      return { kind:'V', num, dim:dimOf(num), id:c.legacy ? s.toUpperCase() : `V${x[1]}` };
    }
    return null;
  }
  const canonical = (id, m) => { const c = classify(id, m); return c ? c.id : String(id ?? '').trim(); };
  const isLK = (id, m) => classify(id, m)?.kind === 'LK';
  const isV = (id, m) => classify(id, m)?.kind === 'V';
  const dimOfId = (id, m) => classify(id, m)?.dim || null;
  // the DB a CSV row belongs to (rows without an ID are loose DMX lines: the DimCity is in column 6)
  function rowDim(r, m){
    const id = String(r?.[0] ?? '').trim();
    if(!id) return String(r?.[5] ?? '').trim().toUpperCase() || null;
    return dimOfId(id, m);
  }
  // an ID of PatchLab as it is written in the CSV of this show (LK101 → K101 when the show calls its LKs "K")
  function toCsvId(id, m = getModel()){
    const c = classify(id, m); if(!c) return id;
    const R = rules(m);
    if(c.kind === 'LK' && /^LK\d+$/i.test(id) && R.lk !== 'LK') return `${R.lk}${c.num}`;
    if(c.kind === 'V' && /^V\d+$/i.test(id) && R.veam !== 'V') return `${R.veam}${c.num}`;
    return id;
  }
  const loomOf = (id, m) => { const c = classify(id, m); return c?.kind === 'NET' ? c.loom : null; };
  const loomByPrefix = (prefix, m) => rules(m).looms.find(l => l.prefix.toUpperCase() === String(prefix).toUpperCase()) || null;
  // how many rows of each kind a set of CSV rows contains (for the preview in the settings)
  function count(rows, m){
    const out = { LK:0, V:0, NET:0, NODE:0, DMX:0, unknown:0 };
    for(const r of rows || []){
      const id = String(r?.[0] ?? '').trim();
      if(!id){ if(String(r?.[3] ?? '').trim() || String(r?.[2] ?? '').trim()) out.DMX++; continue; }
      const c = classify(id, m); if(c) out[c.kind]++; else out.unknown++;
    }
    return out;
  }
  // a short line that tells people which IDs a show accepts
  function expected(m){ const R = rules(m); return `${R.lk}###, ${R.veam}###, ${R.looms.map(l => l.prefix + '###').join(', ')}, ${R.node}###`; }

  window.CsvRules = { DEFAULTS, rules, isDefault, classify, canonical, isLK, isV, dimOf, dimOfId, rowDim, toCsvId, loomOf, loomByPrefix, count, expected };
})();
