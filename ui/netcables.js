// ui/netcables.js — network cables (Cat looms): C101 = a cable of 4 lines for DimCity 01, lines C101.1 … C101.4.
// They come from the CSV like an LK or a Veam (id C101, port 1-4, VLAN group in the third column, location in the
// fourth) and can only be plugged into a network switch. MODEL.netLines = [{ id, port, vlan, dest, dimcity }].
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  // cables of a DimCity: [{ id, dimcity, lines:[{ port, vlan, dest, status }] }] with every cable's 4 lines
  function cables(dc){
    const by = new Map();
    for(const N of (M().netLines || [])){ if(dc && N.dimcity !== dc) continue; if(!by.has(N.id)) by.set(N.id, { id:N.id, dimcity:N.dimcity, lines:new Map() }); by.get(N.id).lines.set(N.port, N); }
    return [...by.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true })).map(c => ({ id:c.id, dimcity:c.dimcity, lines:[1, 2, 3, 4].map(p => c.lines.get(p) || { id:c.id, port:p, vlan:null, dest:'', dimcity:c.dimcity, empty:true }) }));
  }
  const vlanChip = v => { const x = v != null ? window.Fent?.vlanById(v) : null; return x ? `<span class="fent-chip" style="--c:${x.color || '#94a3b8'}" title="${esc(x.discipline)}">${x.id} ${esc(x.name)}</span>` : (v != null ? `<span class="fent-chip" style="--c:#94a3b8">${esc(v)}</span>` : ''); };
  function card(dc){
    const list = cables(dc); if(!list.length) return '';
    const lines = list.reduce((n, c) => n + c.lines.filter(l => !l.empty).length, 0);
    const body = `<div class="lk-card-grid veams">${list.map(c => `<div class="netcable"><div class="netcable-head"><b>${esc(c.id)}</b><span class="subtle">${t('network cable', 'netwerkkabel')} · ${c.lines.filter(l => !l.empty).length}/4</span></div>
        ${c.lines.map(l => `<div class="netcable-line ${l.empty ? "nl-empty" : ""}"><span class="nl-n">${esc(c.id)}.${l.port}</span>${vlanChip(l.vlan)}<span class="nl-d">${l.empty ? '—' : esc(l.dest || '')}</span></div>`).join('')}</div>`).join('')}</div>
      <div class="hint" style="margin:8px 12px">${I('info', 13)} ${t('These cables plug into a network switch. In the Network Planner they get the switch ports after the nodes.', 'Deze kabels gaan in een netwerkswitch. In de Netwerkplanner krijgen ze de switchpoorten na de nodes.')}</div>`;
    return App.ui.card({ key:`${dc}:net`, title:t('Network cables', 'Netwerkkabels'), icon:'network', meta:`${list.length} ${t('cables', 'kabels')} · ${lines} ${t('lines', 'lijnen')}`, body });
  }
  window.NetCables = { cables, card, vlanChip };
})();
