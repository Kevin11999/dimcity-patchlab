// core/fent.js — the FENT Framework (Framework Entertainment Netwerk Technologie, v1.1, 16 April 2026):
// VLANs, IP ranges, colours and the checks for an address plan. Pure data and functions, no UI.
// Source: "FENT Framework met bijlagen V1.1" — chapter 2.2 / 3.4 (IP scheme), 3.5 (VLANs, colours),
// 4.2 (lighting) and 9 (VLAN and IP table).
//
//  - One private range 10.x.x.x with a /16 mask (255.255.0.0). The second byte is the discipline.
//  - The third byte splits Location (1-99 static, 100 DHCP) from Production (101-199 static, 200 DHCP).
//  - The fourth byte is the device: 11-250. 1-10 and 251-254 are for network equipment (switches, routers).
//  - Management is its own VLAN (1090, 10.90.x.x); lighting is VLAN 1040 (10.40.x.x). A device that is
//    managed on one VLAN and sends or scans on another therefore needs more than one IP address.
(function(){
  'use strict';
  const VLANS = [
    { id:2,    name:'AVB',         discipline:'AVB',          net:'10.2.0.0/16',  second:2,  color:null,      colorName:'—' },
    { id:1010, name:'AUDIO-PRI',   discipline:'Audio',        net:'10.10.0.0/16', second:10, color:'#FF0000', colorName:'Rood' },
    { id:1015, name:'AUDIO-SEC',   discipline:'Audio',        net:'10.15.0.0/16', second:15, color:'#0000FF', colorName:'Blauw' },
    { id:1020, name:'INTERCOM',    discipline:'Intercom',     net:'10.20.0.0/16', second:20, color:'#00FF00', colorName:'Groen' },
    { id:1030, name:'VIDEO',       discipline:'Video',        net:'10.30.0.0/16', second:30, color:'#FFFF00', colorName:'Geel' },
    { id:1040, name:'LIGHTING',    discipline:'Licht',        net:'10.40.0.0/16', second:40, color:'#A000FF', colorName:'Paars' },
    { id:1041, name:'LIGHTING-2',  discipline:'Licht',        net:'10.40.0.0/16', second:40, color:'#A000FF', colorName:'Paars', extension:true, note:'1041-1049 are reserved for lighting extensions, e.g. Art-Net apart from sACN' },
    { id:1050, name:'SHOWCONTROL', discipline:'ShowControl',  net:'10.50.0.0/16', second:50, color:'#FF7FFF', colorName:'Roze' },
    { id:1080, name:'SPECIAL',     discipline:'Functiegebonden', net:'10.80.0.0/16', second:80, color:'#80FFFF', colorName:'Aqua' },
    { id:1090, name:'MANAGEMENT',  discipline:'Management',   net:'10.90.0.0/16', second:90, color:'#FF8000', colorName:'Oranje' }
  ];
  // Luminex GigaCore groups: group 1 is Management with VLAN ID 1, group N has VLAN ID N × 100 (200, 300 … 2000).
  // The colours are the ones the GigaCore web interface shows. Only the first three groups have an IP range
  // here (Management 10.90, Lighting 10.40); the others are free to use.
  const LUMI_COLORS = ['#325197', '#E80000', '#32CD32', '#00E8E8', '#CC00CC', '#FF8200', '#E8E800', '#FF0099', '#20B2AA', '#FA8072', '#0033FF', '#008000', '#BB5555', '#8B0000', '#4B0082', '#999900', '#7CE800', '#660066', '#2F4F4F', '#0066CC'];
  const LUMINEX = LUMI_COLORS.map((color, i) => ({ id:i === 0 ? 1 : (i + 1) * 100, group:i + 1, name:i === 0 ? 'Management' : `Group${String(i + 1).padStart(2, '0')}`, discipline:i === 0 ? 'Management' : `Group ${i + 1}`, net:'', second:i === 0 ? 90 : i <= 2 ? 40 : null, color, colorName:'', luminex:true }));
  const MASK = '255.255.0.0';
  // what a device uses an address for -> default VLAN
  const ROLES = {
    management: { vlan:1090, luminex:1,   second:90, en:'Management', nl:'Beheer' },
    lighting:   { vlan:1040, luminex:200, second:40, en:'Lighting data (sACN / Art-Net)', nl:'Lichtdata (sACN / Art-Net)' },
    scan:       { vlan:1041, luminex:300, second:40, en:'Scan / second lighting VLAN', nl:'Scan / tweede licht-VLAN' },
    other:      { vlan:1040, luminex:200, second:40, en:'Other', nl:'Overig' }
  };
  // 'luminex' = VLAN IDs like the GigaCore groups, 'fent' = the FENT numbers (1090, 1040 …)
  const vlanList = mode => mode === 'fent' ? VLANS : LUMINEX;
  const roleVlan = (role, mode) => { const r = ROLES[role] || ROLES.other; return mode === 'fent' ? r.vlan : r.luminex; };
  const GROUPS = { location:{ first:1, last:99, dhcp:100 }, production:{ first:101, last:199, dhcp:200 } };

  const isIp = s => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(String(s || '').trim()) && String(s).trim().split('.').every(n => Number(n) <= 255);
  const vlanById = id => LUMINEX.find(v => v.id === Number(id)) || VLANS.find(v => v.id === Number(id)) || null;
  const vlanBySecond = b => VLANS.find(v => v.second === Number(b) && !v.extension) || null;
  const parts = ip => String(ip).trim().split('.').map(Number);

  // Which FENT VLAN / group does an address belong to?
  function classify(ip){
    if(!isIp(ip)) return null;
    const [a, b, c, d] = parts(ip);
    if(a !== 10) return { outside:true };
    const vlan = vlanBySecond(b);
    const group = c >= 1 && c <= 100 ? 'location' : c >= 101 && c <= 200 ? 'production' : null;
    return { vlan, group, dhcp:c === 100 || c === 200, reserved:(d >= 1 && d <= 10) || (d >= 251 && d <= 254), host:d, third:c };
  }
  // A sensible address: second byte from the VLAN, third byte from the DimCity number, fourth byte = device
  function suggest(vlanId, group, dimNo, host){
    const v = vlanById(vlanId); if(!v) return '';
    const g = GROUPS[group] || GROUPS.production;
    const third = Math.min(g.last, g.first - 1 + Math.max(1, Number(dimNo) || 1));
    const fourth = Math.max(11, Math.min(250, Number(host) || 11));
    return `10.${v.second}.${third}.${fourth}`;
  }
  // Network equipment (a switch) uses 1-10 in the management range
  // Address for a role (management → 10.90.x.x, lighting and scan → 10.40.x.x), whatever the VLAN numbering
  function suggestRole(role, group, dimNo, host){
    const r = ROLES[role] || ROLES.other, g = GROUPS[group] || GROUPS.production;
    return `10.${r.second}.${Math.min(g.last, g.first - 1 + Math.max(1, Number(dimNo) || 1))}.${Math.max(11, Math.min(250, Number(host) || 11))}`;
  }
  function suggestEquipment(vlanId, group, dimNo, n){
    const v = vlanById(vlanId); if(!v) return '';
    const g = GROUPS[group] || GROUPS.production;
    return `10.${v.second}.${Math.min(g.last, g.first - 1 + Math.max(1, Number(dimNo) || 1))}.${Math.max(1, Math.min(10, Number(n) || 1))}`;
  }
  // Checks for one address. kind: 'device' (node, splitter) or 'equipment' (switch, router)
  function checkIp(ip, mask, vlanId, group, kind = 'device'){
    const out = [];
    if(!ip) return out;
    if(!isIp(ip)){ out.push({ level:'warn', code:'FORMAT', en:'Not a valid IPv4 address', nl:'Geen geldig IPv4-adres' }); return out; }
    const c = classify(ip), v = vlanById(vlanId);
    if(c.outside){ out.push({ level:'info', code:'OUTSIDE', en:'Not in the FENT range 10.x.x.x', nl:'Niet in de FENT-reeks 10.x.x.x' }); return out; }
    if(v && c.vlan && v.second != null && c.vlan.second !== v.second) out.push({ level:'warn', code:'VLAN', en:`${ip} belongs to ${c.vlan.name} (${c.vlan.id}), not to ${v.name} (${v.id})`, nl:`${ip} hoort bij ${c.vlan.name} (${c.vlan.id}), niet bij ${v.name} (${v.id})` });
    if(!c.vlan) out.push({ level:'info', code:'UNKNOWN_NET', en:`10.${parts(ip)[1]}.x.x is not a FENT discipline range`, nl:`10.${parts(ip)[1]}.x.x is geen FENT-disciplinereeks` });
    if(c.dhcp) out.push({ level:'warn', code:'DHCP', en:'In the DHCP range — fixed devices should have a static address', nl:'In de DHCP-reeks — vaste apparaten horen een vast adres te hebben' });
    if(c.group === null && c.vlan) out.push({ level:'warn', code:'GROUP', en:'Third byte outside 1-200 (location 1-99, production 101-199)', nl:'Derde byte buiten 1-200 (locatie 1-99, productie 101-199)' });
    else if(group && c.group && c.group !== group && !c.dhcp) out.push({ level:'info', code:'OTHER_GROUP', en:`This is a ${c.group} address while the plan uses ${group}`, nl:`Dit is een ${c.group === 'location' ? 'locatie' : 'productie'}-adres terwijl het plan ${group === 'location' ? 'locatie' : 'productie'} gebruikt` });
    if(kind === 'device' && c.reserved) out.push({ level:'warn', code:'RESERVED', en:'Last byte 1-10 and 251-254 are reserved for network equipment', nl:'Laatste byte 1-10 en 251-254 zijn gereserveerd voor netwerkapparatuur' });
    if(kind === 'equipment' && !c.reserved) out.push({ level:'info', code:'EQUIPMENT', en:'Network equipment normally uses 1-10 or 251-254', nl:'Netwerkapparatuur gebruikt normaal 1-10 of 251-254' });
    if(mask && mask !== MASK) out.push({ level:'info', code:'MASK', en:`FENT uses ${MASK} (/16)`, nl:`FENT gebruikt ${MASK} (/16)` });
    return out;
  }
  // Check a whole list: [{ owner, ip, mask, vlan, kind }] -> adds duplicate warnings
  function checkAll(list, group){
    const issues = [], seen = new Map();
    for(const e of list){
      if(!e.ip) continue;
      for(const r of checkIp(e.ip, e.mask, e.vlan, group, e.kind)) issues.push({ ...r, owner:e.owner, ip:e.ip });
      const k = String(e.ip).trim(); if(seen.has(k)) issues.push({ level:'err', code:'DUPLICATE', en:`${k} is used by ${seen.get(k)} and ${e.owner}`, nl:`${k} wordt gebruikt door ${seen.get(k)} en ${e.owner}`, owner:e.owner, ip:k }); else seen.set(k, e.owner);
    }
    return issues;
  }
  // ---- addresses of one device: the primary address (dev.ip / dev.subnet) and more (dev.ifaces) ----
  // { role, vlan, ip, mask, eth }  eth = which RJ45 of the device (1 or 2) carries it
  function ifaces(dev, ethCount = 1){
    const list = [];
    if(dev?.ip) list.push({ primary:true, role:dev.ipRole || 'management', vlan:dev.ipVlan ?? classify(dev.ip)?.vlan?.id ?? null, ip:dev.ip, mask:dev.subnet || '', eth:1 });
    (dev?.ifaces || []).forEach((x, i) => { if(x && (x.ip || x.vlan)) list.push({ primary:false, i, role:x.role || 'lighting', vlan:x.vlan ?? ROLES[x.role || 'lighting']?.luminex ?? null, ip:x.ip || '', mask:x.mask || '', eth:Math.min(Math.max(1, ethCount), Number(x.eth) || 1) }); });
    return list;
  }
  // The RJ45 ports of a device and what they carry. One VLAN on a port = access port; two or more = trunk
  // (tagged), which is what one cable with a management and a lighting address needs.
  function portsOf(dev, ethCount = 1){
    const list = ifaces(dev, ethCount), out = [];
    for(let e = 1; e <= Math.max(1, ethCount); e++){
      const on = list.filter(x => x.eth === e), vlans = [...new Set(on.map(x => x.vlan).filter(v => v != null))];
      out.push({ eth:e, ifs:on, vlans, mode:vlans.length > 1 ? 'trunk' : 'access' });
    }
    return out.filter(p => p.ifs.length || p.eth === 1);
  }
  // Switch port plan: every RJ45 of every device gets the next switch port. devices: [{ label, ethCount, dev }]
  function switchPlan(devices, first = 1){
    const rows = []; let port = first;
    for(const d of devices) for(const p of portsOf(d.dev, d.ethCount)){ rows.push({ port:port++, device:d.label, ref:d.ref || null, eth:p.eth, ethCount:d.ethCount, mode:p.mode, vlans:p.vlans, ips:p.ifs.map(x => x.ip).filter(Boolean) }); }
    return rows;
  }
  // The VLAN column of a C row: a GigaCore group number (1-20) or a VLAN ID (1, 200, 300 … or a FENT number)
  function vlanFromColumn(v){
    if(v == null || v === '') return null;
    const n = Number(v); if(!Number.isFinite(n)) return null;
    if(n >= 1 && n <= 20) return n === 1 ? 1 : n * 100;
    return n;
  }
  window.Fent = { vlanFromColumn, VLANS, LUMINEX, vlanList, roleVlan, suggestRole, MASK, ROLES, GROUPS, isIp, vlanById, classify, suggest, suggestEquipment, checkIp, checkAll, ifaces, portsOf, switchPlan };
})();
