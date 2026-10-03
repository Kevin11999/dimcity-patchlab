// ui/dim-overview.js — "At a glance" card at the top of a DimCity page: how the DimCity is built, in one view.
// LK blocks with their socket and node, racks with their devices, network switches (and fibres), nodes and splitters.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
  const t = (en, nl) => (lang() === 'nl' ? nl : en);
  const I = (n, s) => App.ui.icon(n, s);
  const M = () => App.getMODEL();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const short = ty => (window.ShortName ? window.ShortName.of(ty) : [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '');
  const full = ty => (window.ShortName ? window.ShortName.full(ty) : short(ty));
  const nd = () => M().networkDevices || {};
  const find = (key, id) => (nd()[key] || []).find(x => x.id === id) || null;
  const KEY = { node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' };

  function lkTable(dc, P){
    const lks = [...M().byLK.values()].filter(l => l.dimcity === dc).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
    const veams = [...M().byVeam.values()].filter(v => v.dimcity === dc && !(App.getMODEL().veamUse?.get(v.id) || []).length);
    const owners = window.RackEngine.ownerColors(P);
    const row = (id, kind, mode) => {
      const ls = P.lines.filter(l => l.owner === id);
      const socket = [...new Set(ls.map(l => l.socket))].join(', ') || '—';
      const nodes = [...new Set(ls.filter(l => l.feed?.node).map(l => l.feed.node))];
      const unfed = ls.filter(l => !l.feed).length;
      const unis = [...new Set(ls.map(l => l.universe))].length;
      return `<tr><td><b>${esc(id)}</b></td><td>${esc(mode)}</td><td>${esc(socket)}</td><td>${nodes.map(n => `<span class="rp-owner" style="--c:${owners.get(id) || '#7d8594'}"><i></i>${esc(n)}</span>`).join(' ') || '<span class="subtle">—</span>'}${unfed ? ` <span class="tag red">${unfed} ${t('no port', 'geen poort')}</span>` : ''}</td><td class="num">${unis}</td></tr>`;
    };
    const rows = lks.map(l => row(l.id, 'LK', App.blockTypeLabel(App.effectiveBlockType(l)))).concat(veams.map(v => row(v.id, 'Veam', 'Veam')));
    return `<div class="gl-col"><div class="gl-h">${I('box', 14)} ${t('LK blocks & Veams', 'LK-blokken & Veams')}</div>${rows.length ? `<table class="data-table gl-table"><thead><tr><th>${t('Device', 'Apparaat')}</th><th>${t('Mode', 'Modus')}</th><th>${t('Socket', 'Aansluiting')}</th><th>${t('Node', 'Node')}</th><th class="num">Uni</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : `<div class="subtle">${t('No LK or Veam in this DimCity.', 'Geen LK of Veam in deze DimCity.')}</div>`}</div>`;
  }
  function racksCol(dc, P){
    const racks = P.racks.map((R, ri) => {
      const items = (R.rack?.items || []).slice().sort((a, b) => b.u - a.u);
      const chips = items.map(it => { if(it.kind === 'blind') return ''; const ty = find(KEY[it.kind], it.typeId); return ty ? `<span class="gl-chip k-${it.kind}" title="${esc(full(ty))}">${esc(short(ty))}</span>` : ''; }).join('');
      return `<div class="gl-rack"><b>${esc(R.placement.name || R.rack?.name || R.placement.rackId)}</b> <span class="subtle">${R.rack ? `${R.rack.heightU}U` : ''}${R.placement.stack ? ` · ${t('stacked', 'gestapeld')}` : ''}</span><div class="gl-chips">${chips || '<span class="subtle">—</span>'}</div></div>`;
    }).join('');
    const loose = P.loose.map(d => { if(d.kind === 'node'){ const n = P.nodes.find(x => x.iid === d.iid); return `<span class="gl-chip k-node" title="${esc(t('Loose node', 'Losse node'))}">${esc(n ? `${n.label} ${short(n.type)}` : d.typeId)}</span>`; } return `<span class="gl-chip k-spider">${d.kind === 'lkSpider' ? t('LK spider', 'LK-spin') : t('Veam4 spider', 'Veam4-spin')}</span>`; }).join('');
    return `<div class="gl-col"><div class="gl-h">${I('rack', 14)} ${t('Racks & loose devices', 'Racks & losse apparaten')}</div>${racks || `<div class="subtle">${t('No rack placed.', 'Geen rack geplaatst.')}</div>`}${loose ? `<div class="gl-rack"><b>${t('Loose', 'Los')}</b><div class="gl-chips">${loose}</div></div>` : ''}</div>`;
  }
  function netCol(dc){
    const sws = window.NetSwitches?.list(dc) || [];
    let rows = []; try { rows = window.FentUI.portPlan(dc).rows; } catch {}
    const cards = sws.map(s => {
      const used = rows.filter(r => r.sw === s.label).length;
      return `<div class="gl-sw"><b>${esc(s.label)}</b> <span class="subtle">${esc(short(s.type))}${s.where ? ` · ${esc(s.where)}` : ''}</span><div class="gl-sub">${s.dev?.ip ? `<code>${esc(s.dev.ip)}</code> · ` : ''}${used}/${s.rj} RJ45${s.sfp ? ` · ${s.sfp} SFP` : ''}</div></div>`;
    }).join('');
    const fibres = window.Fibers ? window.Fibers.links(dc).length : 0;
    const cLines = (M().netLines || []).filter(n => n.dimcity === dc).length;
    return `<div class="gl-col"><div class="gl-h">${I('switchDev', 14)} ${t('Network', 'Netwerk')}</div>${cards || `<div class="subtle">${t('No switch yet.', 'Nog geen switch.')}</div>`}<div class="gl-sub" style="margin-top:6px">${fibres} ${t('fibre links', 'fiberverbindingen')} · ${cLines} ${t('network cables', 'netwerkkabels')}</div><button class="sm" data-cmd="network" data-arg="${esc(dc)}" style="margin-top:8px">${I('network', 13)}${t('Open Network', 'Open Netwerk')}</button></div>`;
  }
  function nodesCol(P){
    const nodes = P.nodes.map(n => { const u = n.ports.filter(Boolean).length; return `<div class="gl-sw"><span class="rk-badge" style="--c:${n.color}">${n.label}</span> <b>${esc(short(n.type))}</b> <span class="subtle">${n.loose ? t('loose', 'los') : esc(P.racks[n.rack]?.placement.name || P.racks[n.rack]?.rack?.name || '')}</span><div class="gl-sub">${u}/${n.ports.length} ${t('ports', 'poorten')}</div></div>`; }).join('');
    const sp = P.splitters.map(s => `<div class="gl-sw"><b>${s.label}</b> ${esc(short(s.type))} <span class="subtle">${s.inputs.length ? `${s.outputs.filter(Boolean).length}/${s.outputs.length}` : t('not used', 'niet gebruikt')}</span></div>`).join('');
    return `<div class="gl-col"><div class="gl-h">${I('network', 14)} ${t('Nodes & splitters', 'Nodes & splitters')}</div>${nodes || `<div class="subtle">${t('No nodes yet.', 'Nog geen nodes.')}</div>`}${sp}</div>`;
  }
  function card(dc){
    if(!window.RackEngine) return '';
    const P = window.RackEngine.computeRackPlan(M(), dc);
    const sws = (window.NetSwitches?.list(dc) || []).length;
    const warn = P.recs.some(r => r.level === 'warn');
    return App.ui.card({ key:`${dc}:glance`, title:t('At a glance', 'In één oogopslag'), icon:'grid', meta:`${P.racks.length} ${t('racks', 'racks')} · ${P.nodes.length} ${t('nodes', 'nodes')} · ${sws} ${t('switches', 'switches')}${warn ? ` · ${t('needs attention', 'aandacht nodig')}` : ''}`,
      body:`<div class="gl-grid">${lkTable(dc, P)}${racksCol(dc, P)}${nodesCol(P)}${netCol(dc)}</div>` });
  }
  window.DimOverview = { card };
})();
