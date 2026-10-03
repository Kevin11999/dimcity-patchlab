// core/qrinfo.js — QR codes with the whole picture: one DB, or the whole system, as plain text any phone can read.
// The text is compact and structured (header, LK/Veam → socket → node, racks, nodes with IP, switches, fibres).
// A long text is cut into numbered parts "[DB01 2/3]" so each QR stays readable; scan them in order.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const M = () => App.getMODEL();
  const short = ty => (window.ShortName ? window.ShortName.of(ty) : [ty?.brand, ty?.name].filter(Boolean).join(' ') || ty?.id || '');
  const nd = () => M().networkDevices || {};
  const find = (key, id) => (nd()[key] || []).find(x => x.id === id) || null;
  const uniRanges = list => { const u = [...new Set(list)].filter(x => x != null).sort((a, b) => a - b), out = []; for(let i = 0; i < u.length; i++){ let j = i; while(u[j + 1] === u[j] + 1) j++; out.push(j > i ? `${u[i]}-${u[j]}` : `${u[i]}`); i = j; } return out.join(','); };

  const end = e => (e ? (e.free ? e.free : `${e.sw}:${String(window.Fibers?.portName(e.dc, e.sw, e.sfp) || e.sfp).split(' ')[0]}`) : '?');
  function dbText(dc){
    const m = M(), E = window.RackEngine; if(!E || !m.byDim?.get(dc)) return '';
    const P = E.computeRackPlan(m, dc), plan = App.net.getDimPlan(dc), L = [];
    const meta = m.projectMeta || {};
    L.push(`${dc} · ${meta.project || ''}`.trim());
    const lks = [...m.byLK.values()].filter(x => x.dimcity === dc), ves = [...m.byVeam.values()].filter(x => x.dimcity === dc);
    const unis = [...new Set(P.lines.map(l => l.universe))];
    L.push(`LK ${lks.length} · Veam ${ves.length} · U ${uniRanges(unis) || '-'} (${unis.length}) · ${P.lines.length} lines`);
    // every LK / Veam: socket, node, universes, locations
    const owners = [...new Set(P.lines.map(l => l.owner))].sort((a, b) => a.localeCompare(b, undefined, { numeric:true }));
    for(const id of owners){
      const ls = P.lines.filter(l => l.owner === id);
      const nodes = [...new Set(ls.filter(l => l.feed?.node).map(l => l.feed.node))].join('+') || '?';
      L.push(`${id} ${[...new Set(ls.map(l => l.socket))].join('/')}>${nodes} U${uniRanges(ls.map(l => l.universe))}${ls[0]?.dest ? ` ${String(ls[0].dest).slice(0, 22)}${ls.length > 1 ? '+' : ''}` : ''}`);
    }
    // racks
    P.racks.forEach(R => { if(!R.rack) return; const items = (R.rack.items || []).filter(i => i.kind !== 'blind').sort((a, b) => b.u - a.u).map(i => short(find({ node:'nodeTypes', splitter:'splitterTypes', switch:'switchTypes', panel:'panelTypes' }[i.kind], i.typeId))); L.push(`RACK ${R.placement.name || R.rack.name} ${R.rack.heightU}U${R.placement.stack ? ' stacked' : ''}: ${items.join(', ')}`); });
    // nodes with address
    P.nodes.forEach(n => { const inst = (plan.nodes || [])[P.nodes.indexOf(n)]; L.push(`${n.label} ${short(n.type)}${inst?.ip ? ` ${inst.ip}` : ''}${n.loose ? ' (loose)' : ''}: ${n.ports.map((p, i) => p ? `${i + 1}=U${p.universe}` : '').filter(Boolean).join(' ')}`); });
    P.splitters.filter(s => s.inputs.length).forEach(s => L.push(`${s.label} ${short(s.type)} in U${s.inputs.join('/')}`));
    // switches
    for(const s of (window.NetSwitches?.list(dc) || [])) L.push(`SW ${s.label} ${short(s.type)}${s.dev?.ip ? ` ${s.dev.ip}` : ''}`);
    // fibres
    if(window.Fibers) for(const f of window.Fibers.links(dc)) L.push(`FIBRE ${f.id} ${end(f.a)}-${end(f.b)}`);
    return L.join('\n');
  }
  function sysText(){
    const m = M(), meta = m.projectMeta || {}, L = [];
    L.push(`${meta.project || 'Project'}${meta.area ? ` · ${meta.area}` : ''}${meta.date ? ` · ${meta.date}` : ''}`);
    const dims = App.sortedDims();
    L.push(`${dims.length} DB · ${m.byLK.size} LK · ${m.byVeam.size} Veam · ${(m.lines?.length || 0) + (m.veamLines?.length || 0) + (m.dmxLoose?.length || 0)} lines`);
    for(const dc of dims){
      let P = null; try { P = window.RackEngine.computeRackPlan(m, dc); } catch {}
      const sws = window.NetSwitches?.list(dc) || [], unis = P ? [...new Set(P.lines.map(l => l.universe))] : [];
      L.push(`${dc}: LK ${[...m.byLK.values()].filter(x => x.dimcity === dc).length} U${uniRanges(unis) || '-'} nodes ${P ? P.nodes.length : 0} sw ${sws.length}${sws[0]?.dev?.ip ? ` ${sws.map(s => s.dev?.ip).filter(Boolean).join(',')}` : ''}`);
    }
    if(window.Fibers) for(const f of window.Fibers.all()) L.push(`FIBRE ${f.id} ${end(f.a)}-${end(f.b)}`);
    return L.join('\n');
  }
  // cut a text into parts of at most `max` characters, on line breaks; every part says what it is and where it sits
  function parts(name, text, max = 320){
    const lines = String(text).split('\n'), out = []; let cur = '';
    const room = max - 14;
    for(const ln of lines){
      let l = ln;
      while(l.length > room){ if(cur){ out.push(cur); cur = ''; } out.push(l.slice(0, room)); l = l.slice(room); }
      if((cur ? cur.length + 1 : 0) + l.length > room){ out.push(cur); cur = l; } else cur = cur ? `${cur}\n${l}` : l;
    }
    if(cur) out.push(cur);
    return out.map((p, i) => (out.length > 1 ? `[${name} ${i + 1}/${out.length}]\n` : `[${name}]\n`) + p);
  }
  function svg(text){
    const qr = window.qrcode; if(!qr) return '';
    try {
      qr.stringToBytes = qr.stringToBytesFuncs?.['UTF-8'] || qr.stringToBytes;
      const q = qr(0, 'L'); q.addData(text); q.make();
      const n = q.getModuleCount(); let d = '';
      for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(q.isDark(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2} ${n + 2}" shape-rendering="crispEdges" style="width:100%;height:100%;display:block"><rect width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    } catch { return ''; }
  }
  // dialog: the QR codes of one DB (or the whole system when dc is null), large, with the text below
  function openDialog(dc){
    const text = dc ? dbText(dc) : sysText(), name = dc || 'System';
    const ps = parts(name, text, 600);
    const body = `<div class="qr-dlg">${ps.map((p, i) => `<figure><div class="qr-big">${svg(p)}</div><figcaption>${ps.length > 1 ? `${i + 1} / ${ps.length}` : ''}</figcaption></figure>`).join('')}</div>
      <details style="margin-top:12px"><summary>Text in the QR codes</summary><pre class="qr-pre">${text.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]))}</pre></details>
      <div class="hint" style="margin-top:8px">Scan with any phone camera: it shows the text. Long DBs are cut into numbered parts — scan them in order. Print them as stickers (Stickers → DB info QR) or in the PDF (section “QR codes”).</div>`;
    const d = App.ui.openDialog({ title:`QR — ${dc ? dc : 'whole system'}`, subtitle:'Everything in one scan', width:'760px', body,
      footer:'<button data-a="copy">Copy text</button><button data-a="svg">Save as SVG</button><button class="primary" data-a="ok">Done</button>' });
    d.footer.querySelector('[data-a=ok]').onclick = () => d.close();
    d.footer.querySelector('[data-a=copy]').onclick = () => { navigator.clipboard?.writeText(text); App.ui.toast('Text copied'); };
    d.footer.querySelector('[data-a=svg]').onclick = () => {
      const a = document.createElement('a'); a.download = `QR-${name}.svg`; a.href = URL.createObjectURL(new Blob([ps.map(svg).join('\n')], { type:'image/svg+xml' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }
  document.addEventListener('click', e => { const b = e.target.closest?.('[data-qr-open]'); if(b) openDialog(b.dataset.qrOpen === '*' ? null : b.dataset.qrOpen); });
  window.QrInfo = { dbText, sysText, parts, svg, openDialog };
})();
