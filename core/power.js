// core/power.js — power distribution: PD types, PDs, feeds, and the load per Socapex / circuit / phase / PD / feed.
//
// This is a separate part of the project (model.power), linked to the rest only by DimCity name and by the cable names in the
// fixture sheet (M101 … = a Socapex cable, circuit 1…6). Nothing here touches the patch, the racks or the network plan.
//
// Rules (checked against the "PD boekje" of a real show):
//   · The fixture sheet is the source. A row's "Circuit Name" is a Socapex cable (M101), its "Circuit Number" the circuit (1–6).
//   · Circuit 1…6 sit on L1 L2 L3 L1 L2 L3.            · Current = Wattage / voltage (230 V).
//   · The first digit(s) of M101 name the DB (M1xx = DB1).
//   · A PD takes the cables of one block of 12 numbers (M101–M112, M113–M124 …), packed in order as Soca A, B, C …
//   · A feed (Powerlock run) carries its PDs; a feed that loops on from another feed counts in that feed too.

export const DEFAULTS = { voltage: 230, circuitMax: 16, skewPct: 15, warnPct: 80 };
const clone = x => JSON.parse(JSON.stringify(x));
const num = x => (Number.isFinite(Number(x)) ? Number(x) : 0);
export const round1 = x => Math.round(x * 10) / 10;
export const phaseOf = c => ((Number(c) - 1) % 3 + 3) % 3 + 1;                     // 1→L1 … 4→L1
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---- reading numbers and sheets ----
export function parseWatt(s){ const m = String(s ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : 0; }
export function parseSheet(text){
  const t = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const first = t.split('\n', 1)[0] || '', delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for(let i = 0; i < t.length; i++){
    const c = t[i];
    if(q){ if(c === '"'){ if(t[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if(c === '"') q = true;
    else if(c === delim){ row.push(cur); cur = ''; }
    else if(c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  const col = (...names) => { for(const n of names){ const i = head.indexOf(n); if(i >= 0) return i; } return -1; };
  const ix = { unit: col('unit number', 'unit'), name: col('fixture id', 'fixture', 'fixture type'), mode: col('fixture mode', 'mode'), uni: col('universe'), veam: col('veam', 'line', 'source'), addr: col('address', 'dmx address'),
    cable: col('circuit name', 'circuit'), circ: col('circuit number', 'circuit no'), pos: col('position', 'location'), watt: col('wattage', 'watt', 'power') };
  const warnings = [];
  if(ix.cable < 0 || ix.circ < 0) warnings.push('The sheet has no "Circuit Name" / "Circuit Number" columns, so there are no Socapex cables in it.');
  if(ix.watt < 0) warnings.push('The sheet has no "Wattage" column: no current can be worked out.');
  const get = (r, i) => (i >= 0 && i < r.length ? String(r[i]).trim() : '');
  const fixtures = []; let skipped = 0;
  for(const r of rows){
    if(!r.some(x => String(x).trim() !== '')) continue;
    const f = { unit: get(r, ix.unit), name: get(r, ix.name), mode: get(r, ix.mode), uni: get(r, ix.uni), veam: get(r, ix.veam), addr: get(r, ix.addr), cable: get(r, ix.cable), circ: get(r, ix.circ), pos: get(r, ix.pos), wattTxt: get(r, ix.watt) };
    f.watt = parseWatt(f.wattTxt);
    if(!f.name && !f.cable){ skipped++; continue; }
    fixtures.push(f);
  }
  if(skipped) warnings.push(`${skipped} empty row${skipped > 1 ? 's' : ''} left out.`);
  return { fixtures, warnings, delim };
}

// ---- the model ----
export function normalizePower(p){
  const o = p && typeof p === 'object' ? clone(p) : {};
  o.settings = { ...DEFAULTS, ...(o.settings || {}) };
  o.types = Array.isArray(o.types) ? o.types : [];
  o.feeds = Array.isArray(o.feeds) ? o.feeds : [];
  o.pds = Array.isArray(o.pds) ? o.pds : [];
  o.fixtures = Array.isArray(o.fixtures) ? o.fixtures : [];
  o.source = o.source || null;
  for(const d of o.pds){ d.cables = Array.isArray(d.cables) ? d.cables : []; d.manual = d.manual && typeof d.manual === 'object' ? d.manual : {}; }
  return o;
}
let idn = 0; export const newId = pre => `${pre}${Date.now().toString(36)}${(idn++).toString(36)}`;
export const SAMPLE_TYPES = [
  { id: 'PDT:soca12', name: 'PSU Powerlock → 12x Soca + 12x Sch/CEE + 32/63A', input: { kind: 'Powerlock', amps: 250 }, outputs: [{ kind: 'soca', count: 12, amps: 16 }, { kind: 'cee', count: 12, amps: 16, label: 'Schuko/CEE' }, { kind: 'cee', count: 1, amps: 32, label: '32A', phases: 3 }, { kind: 'cee', count: 1, amps: 63, label: '63A', phases: 3 }] },
  { id: 'PDT:pd400', name: 'PD400 → 3x 125/63/32 + 3x Schuko', input: { kind: 'Powerlock', amps: 400 }, outputs: [{ kind: 'cee', count: 3, amps: 125, label: '125A', phases: 3 }, { kind: 'cee', count: 3, amps: 63, label: '63A', phases: 3 }, { kind: 'cee', count: 3, amps: 32, label: '32A', phases: 3 }, { kind: 'schuko', count: 3, amps: 16, label: 'Schuko' }] }
];
// the outlets of a PD type, in order: Socapex cables first (A, B, C …), then the other outlets with a running number
export function outletsOf(type){
  const out = []; let soca = 0;
  for(const o of type?.outputs || []){
    const n = Math.max(0, Number(o.count) || 0);
    for(let i = 0; i < n; i++){
      if(o.kind === 'soca'){ out.push({ key: 'S' + LETTERS[soca], kind: 'soca', label: 'Soca ' + LETTERS[soca], amps: num(o.amps) || 16, group: o.group || '' }); soca++; }
      else { const lab = o.label || (o.kind === 'schuko' ? 'Schuko' : (o.amps || '') + 'A'); out.push({ key: `${lab}#${i + 1}`, kind: o.kind, label: n > 1 ? `${lab} ${i + 1}` : lab, amps: num(o.amps), phases: o.kind === 'cee' && o.phases === 3 ? 3 : 1, phase: o.kind === 'cee' && o.phases === 3 ? 0 : (Number(o.phase) || 0), group: o.group || '' }); }
    }
  }
  return out;
}
export const socaCount = type => outletsOf(type).filter(o => o.kind === 'soca').length;

// ---- cable names ----
export function cableInfo(name){ const m = String(name || '').trim().match(/^M(\d{3,4})$/i); if(!m) return null; const d = m[1]; const n = d.length === 3 ? [Number(d[0]), Number(d.slice(1))] : [Number(d.slice(0, 2)), Number(d.slice(2))]; return { name: 'M' + d, dcNum: n[0], nn: n[1] }; }
export function dimOfCable(name, dims){ const ci = cableInfo(name); if(!ci) return null; return (dims || []).find(d => Number(String(d).replace(/\D/g, '')) === ci.dcNum) || 'DB' + ci.dcNum; }
// all DB names the power section knows: the DimCities of the project plus those named by the cables (M4xx → DB4), so a fixture sheet works on its own
export function allDims(P, appDims = []){ const set = new Set(appDims); for(const f of P.fixtures){ const d = dimOfCable(f.cable, appDims) || directDim(f.cable, appDims); if(d) set.add(d); } for(const x of [...P.pds, ...P.feeds]) if(x.dc) set.add(x.dc); return [...set].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })); }
export const directDim = (name, dims) => { const m = String(name || '').trim().match(/^DB\s*0*(\d+)$/i); return m ? (dims || []).find(d => Number(String(d).replace(/\D/g, '')) === Number(m[1])) || ('DB' + m[1]) : null; };

// ---- describing what hangs on a circuit (the booklet columns) ----
export function unitRanges(units){
  const n = [...new Set(units.map(u => String(u).trim()).filter(Boolean))];
  const ns = n.map(Number); if(ns.some(x => !Number.isFinite(x))) return n.join(', ');
  ns.sort((a, b) => a - b); const runs = []; let s = ns[0], p = ns[0];
  for(let i = 1; i <= ns.length; i++){ if(ns[i] === p + 1){ p = ns[i]; continue; } runs.push([s, p]); s = ns[i]; p = ns[i]; }
  if(!ns.length) return '';
  if(runs.length === 1 && runs[0][0] === runs[0][1]) return String(runs[0][0]);
  if(runs.length === 1 && runs[0][1] - runs[0][0] === 1) return `${runs[0][0]} & ${runs[0][1]}`;
  return runs.map(([a, b]) => (a === b ? String(a) : b - a === 1 ? `${a} & ${b}` : `${a} - ${b}`)).join(', ');
}
export function groupFixtures(list){
  const by = new Map();
  for(const f of list){ const k = f.name || '?'; if(!by.has(k)) by.set(k, { name: k, count: 0, units: [] }); const g = by.get(k); g.count++; g.units.push(f.unit); }
  return [...by.values()];
}
export const fixturesText = list => groupFixtures(list).map(g => `${g.count}* ${g.name}`).join(' + ');
// universe-address like the booklet: one fixture → "1-501", several on one universe → "10-Var", several universes → "Var"
export function dmxLabel(list){
  const fx = list.filter(f => f.uni !== ''); if(!fx.length) return '';
  const us = [...new Set(fx.map(f => f.uni))];
  if(us.length > 1) return 'Var';
  return fx.length === 1 && fx[0].addr && fx[0].addr !== '0' ? `${us[0]}-${fx[0].addr}` : `${us[0]}-Var`;
}
export const positionText = list => { const p = [...new Set(list.map(f => f.pos).filter(Boolean))]; return p.length > 3 ? p.slice(0, 3).join(', ') + ' …' : p.join(', '); };

// ---- the load ----
const zero = () => [0, 0, 0];
const addTo = (a, b) => { for(let i = 0; i < 3; i++) a[i] += b[i]; return a; };
export function cablesOf(P){
  const V = P.settings.voltage, cables = new Map(), direct = [], loose = [];
  for(const f of P.fixtures){
    const ci = cableInfo(f.cable);
    if(!ci){ if(/^DB\s*\d+$/i.test(f.cable)) direct.push(f); else loose.push(f); continue; }
    const c = cables.get(ci.name) || cables.set(ci.name, { ...ci, circuits: new Map(), fixtures: [], perPhase: zero() }).get(ci.name);
    const n = Number(f.circ); c.fixtures.push(f);
    if(!(n >= 1)){ loose.push(f); continue; }
    const k = c.circuits.get(n) || c.circuits.set(n, { n, phase: phaseOf(n), watt: 0, amps: 0, fixtures: [] }).get(n);
    k.fixtures.push(f); k.watt += f.watt; k.amps = k.watt / V;
  }
  for(const c of cables.values()) for(const k of c.circuits.values()) c.perPhase[k.phase - 1] += k.amps;
  return { cables, direct, loose };
}
// give the PDs of one DimCity their Socapex cables: block of 12 numbers per PD, packed in order
export function autoAssign(P, dc, dims){
  const { cables } = cablesOf(P);
  const mine = [...cables.values()].filter(c => dimOfCable(c.name, dims) === dc).sort((a, b) => a.nn - b.nn);
  const pds = P.pds.filter(d => d.dc === dc && socaCount(P.types.find(t => t.id === d.typeId)) > 0).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for(const d of pds) d.cables = [];
  const blocks = new Map(); for(const c of mine){ const b = Math.floor((c.nn - 1) / 12); (blocks.get(b) || blocks.set(b, []).get(b)).push(c.name); }
  const keys = [...blocks.keys()].sort((a, b) => a - b); let placed = 0;
  keys.forEach((b, i) => { const d = pds[i]; if(!d) return; const cap = socaCount(P.types.find(t => t.id === d.typeId)); d.cables = blocks.get(b).slice(0, cap); placed += d.cables.length; });
  return { placed, total: mine.length, pdsUsed: Math.min(keys.length, pds.length), pdsNeeded: keys.length };
}

export function compute(P, dims = []){
  const S = P.settings, { cables, direct, loose } = cablesOf(P);
  const typeOf = id => P.types.find(t => t.id === id);
  const res = { cables, direct, loose, pds: new Map(), feeds: new Map(), warnings: [], assigned: new Set() };
  const warn = (level, text, where) => res.warnings.push({ level, text, where: where || '' });
  for(const d of P.pds){
    const type = typeOf(d.typeId), outs = outletsOf(type), socas = outs.filter(o => o.kind === 'soca');
    const r = { id: d.id, dc: d.dc, type, outs, slots: [], manual: [], perPhase: zero() };
    socas.forEach((o, i) => {
      const name = d.cables[i] || '', c = name ? cables.get(name) : null;
      if(name) res.assigned.add(name);
      r.slots.push({ letter: o.label.replace('Soca ', ''), cable: name, data: c || null, perPhase: c ? c.perPhase.slice() : zero() });
      if(c) addTo(r.perPhase, c.perPhase);
    });
    if(d.cables.length > socas.length) warn('err', `${d.id}: ${d.cables.length} cables but only ${socas.length} Socapex outputs.`, d.id);
    for(const o of outs.filter(o => o.kind !== 'soca')){ const m = d.manual[o.key] || {}, a = [num(m.l1), num(m.l2), num(m.l3)]; r.manual.push({ ...o, label2: m.label || '', location: m.location || '', perPhase: a }); addTo(r.perPhase, a); }
    // the breaker groups of the type (a group can carry several outlets, they share its limit)
    r.groups = (type?.groups || []).map(g => { const per = zero(); let n = 0; for(const o of outs) if(o.group === g.id){ n++; if(o.kind === 'soca'){ const sl = r.slots.find(x => 'Soca ' + x.letter === o.label); if(sl) addTo(per, sl.perPhase); } else { const m = r.manual.find(x => x.key === o.key); if(m) addTo(per, m.perPhase); } } return { ...g, outlets: n, perPhase: per }; });
    for(const g of r.groups) if(num(g.amps) && g.perPhase.some(x => x > num(g.amps) + 1e-9)) warn('err', `${d.id} group ${g.name}: ${g.perPhase.map(round1).join(' / ')} A is more than ${g.amps} A.`, d.id);
    res.pds.set(d.id, r);
    if(!d.feedId) warn('warn', `${d.id} has no feed (Powerlock run).`, d.id);
    for(const s of r.slots) for(const k of (s.data?.circuits.values() || [])) if(k.amps > S.circuitMax + 1e-9) warn('err', `${d.id} Soca ${s.letter} (${s.cable}-${k.n}): ${round1(k.amps)} A is more than ${S.circuitMax} A.`, d.id);
  }
  for(const c of cables.values()) if(!res.assigned.has(c.name)){ const dc = dimOfCable(c.name, dims); warn('warn', `Cable ${c.name} (${round1(c.perPhase.reduce((a, b) => a + b, 0))} A) is not on a PD${dc ? ' of ' + dc : ''}.`, c.name); }
  const own = new Map(); for(const f of P.feeds) own.set(f.id, zero());
  for(const d of P.pds){ const r = res.pds.get(d.id); if(d.feedId && own.has(d.feedId)) addTo(own.get(d.feedId), r.perPhase); }
  const total = id => { const f = P.feeds.find(x => x.id === id); const t = own.get(id).slice(); const seen = new Set([id]); for(const g of P.feeds.filter(x => x.upstream === id)){ if(seen.has(g.id)) continue; seen.add(g.id); addTo(t, total(g.id)); } return t; };
  for(const f of P.feeds){
    const o = own.get(f.id), t = total(f.id), max = num(f.max), pct = t.map(x => (max ? x / max * 100 : 0));
    res.feeds.set(f.id, { id: f.id, own: o, total: t, max, pct });
    if(max && t.some(x => x > max)) warn('err', `${f.name}: ${t.map(round1).join(' / ')} A is more than ${max} A on a phase.`, f.id);
    else if(max && t.some(x => x / max * 100 > S.warnPct)) warn('warn', `${f.name} is above ${S.warnPct}% on a phase (${t.map(round1).join(' / ')} of ${max} A).`, f.id);
    const hi = Math.max(...t), lo = Math.min(...t);
    if(hi > 0 && (hi - lo) / hi * 100 > S.skewPct) warn('warn', `${f.name}: the phases are uneven (${t.map(round1).join(' / ')} A).`, f.id);
  }
  if(direct.length) warn('info', `${direct.length} fixture${direct.length > 1 ? 's' : ''} hang straight on a DB (${[...new Set(direct.map(f => f.cable))].join(', ')}), not on a Socapex.`, 'direct');
  if(loose.length) warn('info', `${loose.length} row${loose.length > 1 ? 's have' : ' has'} no usable Socapex cable / circuit.`, 'loose');
  const noW = P.fixtures.filter(f => f.cable && !f.watt).length; if(noW) warn('warn', `${noW} fixture${noW > 1 ? 's have' : ' has'} no wattage.`, 'watt');
  return res;
}
export const sum3 = a => a.reduce((x, y) => x + y, 0);
