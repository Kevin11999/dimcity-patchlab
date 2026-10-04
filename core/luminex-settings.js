// core/luminex-settings.js — every setting the OpenAPI files of the GigaCore (WebApi 1.5) and the LumiNode / LumiCore (WebApi 2.9) allow to change.
// The list of settings (core/luminex-catalog.js) is generated from those files; this file reads a device into a tree, looks values up,
// turns changes into calls and works out what to copy from one device to others. Plain logic on an injected transport h(method, path, body).
import { CATALOG } from './luminex-catalog.js';

const clone = x => JSON.parse(JSON.stringify(x));
export const kinds = { gigacore: 'gigacore', lumi: 'luminode' };
const cat = kind => CATALOG[kinds[kind] || kind];
export const fields = kind => cat(kind).fields;
export const titleOf = (kind, sec) => cat(kind).titles[sec] || sec.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const byId = new Map(); const fieldMap = kind => { if(!byId.has(kind)) byId.set(kind, new Map(fields(kind).map(f => [f.id, f]))); return byId.get(kind); };
export const fieldById = (kind, id) => fieldMap(kind).get(id);
export const collOf = (kind, f) => (f.coll ? cat(kind).colls[f.coll] : null);

// ---- sections: [{ id, title, count }] in the order of the catalogue ----
export function sections(kind){
  const out = new Map();
  for(const f of fields(kind)){ if(!out.has(f.sec)) out.set(f.sec, { id: f.sec, title: titleOf(kind, f.sec), count: 0 }); out.get(f.sec).count++; }
  return [...out.values()];
}

// ---- reading ----
const setPath = (tree, keys, val) => { let o = tree; keys.slice(0, -1).forEach(k => { o = (o[k] ??= {}); }); o[keys[keys.length - 1]] = val; };
export async function readTree(kind, h){
  if(kind === 'gigacore'){
    try { const t = await h('GET', '/api'); if(t && typeof t === 'object' && !Array.isArray(t)) return t; } catch {}
    const tree = {}, secs = [...new Set(fields(kind).map(f => f.steps[0][0]))];                 // no whole tree: one section at a time
    await Promise.all(secs.map(async s => { try { tree[s] = await h('GET', '/api/' + s); } catch {} }));
    return tree;
  }
  const tree = {}, roots = [...new Set(fields(kind).filter(f => f.objPath && !f.objPath.includes('{')).map(f => f.objPath))];
  await Promise.all(roots.map(async p => { try { setPath(tree, p.replace(/^\/api\//, '').split('/'), await h('GET', p)); } catch {} }));
  try { tree.processblock = await h('GET', '/api/processblock'); } catch {}
  return tree;
}

// ---- walking the tree ----
const keyOf = step => step[0];
function walk(tree, steps, ids){
  let node = tree, ii = 0;
  for(const st of steps){
    if(node == null) return undefined;
    node = node[st[0]];
    if(st[1]){                                                   // a list: pick the item with this key
      if(!Array.isArray(node)) return undefined;
      const want = ids[ii++]; node = node.find(x => String(x?.[st[1]]) === String(want));
    }
  }
  return node;
}
export const valueOf = (kind, tree, f, ids) => walk(tree, f.steps, ids);
// the items of a list (all keys), nested lists give lists of keys: [[ids…], …]
export function itemsOf(kind, tree, collId){
  const c = cat(kind).colls[collId]; if(!c) return [];
  const rec = (node, steps, acc) => {
    if(!steps.length) return [acc];
    const [st, ...rest] = steps; const n = node?.[st[0]];
    if(!st[1]) return rec(n, rest, acc);
    if(!Array.isArray(n)) return [];
    return n.flatMap(it => rec(it, rest, [...acc, it[st[1]]]));
  };
  return rec(tree, c.steps, []);
}
const fillPath = (tmpl, vars, ids) => vars.reduce((p, v, i) => p.replace('{' + v + '}', encodeURIComponent(ids[i])), tmpl);
export const labelOfItem = (kind, collId, ids) => ids.join(' / ');

// ---- turning typed text into a value ----
export function coerce(f, raw){
  const bad = msg => ({ ok: false, err: msg });
  if(f.type === 'boolean') return { ok: true, value: raw === true || raw === 'true' || raw === 'on' };
  if(f.type === 'enum'){ const hit = f.enum.find(e => String(e) === String(raw)); return hit === undefined ? bad('not one of ' + f.enum.join(', ')) : { ok: true, value: hit }; }
  if(f.type === 'integer' || f.type === 'number'){
    if(raw === '' || raw == null) return bad('fill in a number'); const n = Number(raw);
    if(!Number.isFinite(n) || (f.type === 'integer' && !Number.isInteger(n))) return bad('not a ' + (f.type === 'integer' ? 'whole ' : '') + 'number');
    if(f.min != null && n < f.min) return bad('at least ' + f.min); if(f.max != null && n > f.max) return bad('at most ' + f.max);
    return { ok: true, value: n };
  }
  if(f.type === 'list'){
    const parts = (Array.isArray(raw) ? raw : String(raw).split(/[\s,;]+/)).filter(x => x !== '' && x != null);
    const vals = parts.map(x => (f.itemType === 'integer' || f.itemType === 'number' ? Number(x) : String(x)));
    if(vals.some(v => typeof v === 'number' && !Number.isFinite(v))) return bad('only numbers, separated by commas');
    return { ok: true, value: vals };
  }
  const s = String(raw ?? '');
  if(f.maxLength != null && s.length > f.maxLength) return bad('at most ' + f.maxLength + ' characters');
  if(f.pattern){ try { if(!new RegExp(f.pattern).test(s)) return bad('not allowed here'); } catch {} }
  return { ok: true, value: s };
}
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const display = v => (v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));

// ---- changes -> calls ----
// edits: [{ fid, ids:[…], value }]. A setting with its own address is a call of its own; settings that live in a whole object
// (LumiNode) are put back together with the rest of that object, one call per object.
export function settingsOps(kind, tree, edits){
  const ops = [], notes = [], objs = new Map();
  for(const e of edits){
    const f = fieldById(kind, e.fid); if(!f){ notes.push('Unknown setting ' + e.fid); continue; }
    const old = valueOf(kind, tree, f, e.ids);
    if(same(old, e.value)) continue;
    const where = [titleOf(kind, f.sec), f.coll && e.ids.length ? e.ids.join(' / ') : '', f.group && !f.group.startsWith(titleOf(kind, f.sec)) ? f.group : '', f.label].filter(Boolean).join(' › ');
    const text = `${where}: ${display(old) || '–'} → ${display(e.value)}`;
    if(f.mode === 'leaf') ops.push({ method: 'PUT', path: fillPath(f.id, f.vars, e.ids), body: e.value, text, kind: f.id.includes('ip_settings') || f.id.includes('ipsettings') ? 'ip' : 'config' });
    else {
      const path = fillPath(f.objPath, f.vars, e.ids), key = path;
      if(!objs.has(key)){ const cur = walk(tree, f.objSteps, e.ids); if(cur == null){ notes.push('Cannot find ' + path + ' on the device'); continue; } objs.set(key, { path, body: clone(cur), texts: [], f }); }
      const o = objs.get(key); let node = o.body; const rel = f.steps.slice(f.objSteps.length).map(keyOf);
      rel.slice(0, -1).forEach(k => { node = (node[k] ??= {}); }); node[rel[rel.length - 1]] = e.value; o.texts.push(text);
    }
  }
  for(const o of objs.values()) ops.push({ method: 'PUT', path: o.path, body: o.body, text: o.texts.join(' · '), kind: /ipsettings/.test(o.path) ? 'ip' : 'config' });
  ops.sort((a, b) => (a.kind === 'ip') - (b.kind === 'ip'));                  // an address change last: the device moves
  return { ops, notes };
}

// ---- copying to other devices ----
// from = the tree of the device to copy from; to = the tree of a target. Which sections, and whether names / addresses go along.
// Gives edits for the target (only where the target differs, only for items the target has).
export function copyEdits(kind, from, to, { secs = null, includeDev = false, includeDanger = false, only = null } = {}){
  const out = [];
  for(const f of fields(kind)){
    if(secs && !secs.includes(f.sec)) continue; if(only && !only.has(f.id)) continue;
    if(f.dev && !includeDev) continue; if(f.danger && !includeDanger) continue;
    const idLists = f.coll ? itemsOf(kind, from, f.coll) : [[]];
    for(const ids of idLists){
      const v = valueOf(kind, from, f, ids); if(v === undefined) continue;
      const t = valueOf(kind, to, f, ids); if(t === undefined) continue;                 // the target has no such item / setting
      if(!same(v, t)) out.push({ fid: f.id, ids: ids.slice(), value: clone(v) });
    }
  }
  return out;
}
// the same typed changes on another device (for "send my changes to the others")
export function carryEdits(kind, edits, to){
  const out = [];
  for(const e of edits){ const f = fieldById(kind, e.fid); if(!f) continue; if(valueOf(kind, to, f, e.ids) === undefined) continue; out.push({ fid: e.fid, ids: e.ids.slice(), value: clone(e.value) }); }
  return out;
}
