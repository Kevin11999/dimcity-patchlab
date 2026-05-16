// v9-runtime-fixes.js
// Runtime fixes that improve current renderer output without a risky renderer.js rewrite.
// Focus:
// - spare ports are calculated per complete DB, not per device
// - splitter outputs show LK/Veam patch points and universe color
// - LK/Veam open panels are moved inside their own cards
// - LK/Veam overview sections become collapsible
// - Veam cards show linked LK status
(function(){
  'use strict';

  const state = {
    lkCollapsed:false,
    veamCollapsed:false,
    busy:false
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const getM = () => window.LKApp?.getMODEL?.();
  const saveM = M => window.LKApp?.setMODEL?.(M);
  const render = () => window.LKApp?.renderAll?.();

  function dimNumber(dc){
    const m = String(dc || '').match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }
  function dimDeviceNumber(dc, index){
    const d = dimNumber(dc);
    if(d <= 1) return index + 1;
    return d * 10 + index + 1;
  }
  function formatNodeId(dc, index){ return `ID:${String(dimDeviceNumber(dc,index)).padStart(2,'0')}`; }
  function formatSplitterId(dc, index){ return `SP:${String(dimDeviceNumber(dc,index)).padStart(2,'0')}`; }
  function segmentFromDim(dc){ return dimNumber(dc) || 1; }
  function validIp(ip){ return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip||'')); }
  function ipWithLastOctet(ip,last){
    if(!validIp(ip)) return '';
    const p = String(ip).split('.').map(Number);
    p[3] = Math.max(1, Math.min(254, Number(last||1)));
    return p.join('.');
  }
  function getPlan(M, dc){
    if(!M.networkDevices) M.networkDevices = {};
    if(!M.networkDevices.dimCityPlans) M.networkDevices.dimCityPlans = {};
    if(!M.networkDevices.dimCityPlans[dc]) M.networkDevices.dimCityPlans[dc] = {nodes:[],splitters:[],switches:[]};
    const p = M.networkDevices.dimCityPlans[dc];
    if(!Array.isArray(p.nodes)) p.nodes = [];
    if(!Array.isArray(p.splitters)) p.splitters = [];
    if(!Array.isArray(p.switches)) p.switches = [];
    return p;
  }
  function uniqueUniverses(M, dc){
    const stat = M.uniStats?.get?.(dc);
    if(!stat?.counts) return [];
    return [...stat.counts.keys()].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  }
  function allPatchPointsForDim(M, dc){
    const out = [];
    for(const L of (M.lines||[])){
      if(L.dimcity!==dc || L.universe==null || L.universe==='') continue;
      out.push({kind:'LK', id:L.id, port:L.port, universe:Number(L.universe), dest:L.dest||''});
    }
    for(const V of (M.veamLines||[])){
      if(V.dimcity!==dc || V.universe==null || V.universe==='') continue;
      out.push({kind:'Veam', id:V.id, port:V.port, universe:Number(V.universe), dest:V.dest||''});
    }
    for(const D of (M.dmxLoose||[])){
      if(D.dimcity!==dc || D.universe==null || D.universe==='') continue;
      out.push({kind:'DMX', id:'Loose DMX', port:'—', universe:Number(D.universe), dest:D.dest||''});
    }
    out.sort((a,b)=>a.universe-b.universe || String(a.id).localeCompare(String(b.id)) || Number(a.port||0)-Number(b.port||0));
    return out;
  }
  function uniColor(uni){
    const n = Number(uni || 0);
    const hue = (n * 47) % 360;
    return `hsl(${hue} 78% 43%)`;
  }
  function nodeTypeById(M,id){ return (M.networkDevices?.nodeTypes||[]).find(x=>x.id===id) || (M.networkDevices?.nodeTypes||[])[0]; }
  function splitterTypeById(M,id){ return (M.networkDevices?.splitterTypes||[]).find(x=>x.id===id) || (M.networkDevices?.splitterTypes||[])[0]; }

  function autoAssignNodesDbSpare(dc, nodeTypeId){
    const M = getM(); if(!M) return;
    const nt = nodeTypeById(M, nodeTypeId); if(!nt) return;
    const portCount = Math.max(1, Number(nt.portCount || 1));
    const spareTotal = Math.max(0, Number(M.networkDevices?.prefs?.nodeSparePorts || 0));
    const universes = uniqueUniverses(M, dc);
    const neededPorts = universes.length + spareTotal;
    const nodeCount = Math.max(1, Math.ceil(neededPorts / portCount));
    const plan = getPlan(M, dc);
    plan.nodeTypeId = nt.id;
    plan.nodes = [];
    let cursor = 0;
    for(let i=0;i<nodeCount;i++){
      const num = dimDeviceNumber(dc,i);
      const arr = [];
      for(let p=0;p<portCount;p++){
        arr.push(cursor < universes.length ? universes[cursor++] : null);
      }
      plan.nodes.push({
        id: formatNodeId(dc,i),
        name: `${dc} ${nt.brand || 'Node'} ${nt.name || nt.id} ${String(i+1).padStart(2,'0')}`,
        typeId: nt.id,
        deviceNo: num,
        segment: segmentFromDim(dc),
        ip: ipWithLastOctet(nt.defaultIp || '', num),
        subnet: nt.subnet || '255.255.255.0',
        universes: arr
      });
    }
    M.ui.dirty = true;
    saveM(M);
    render();
  }

  function autoAssignSplittersDbSpare(dc, splitterTypeId){
    const M = getM(); if(!M) return;
    const sp = splitterTypeById(M, splitterTypeId); if(!sp) return;
    const outCount = Math.max(1, Number(sp.outputCount || sp.totalOutputs || 1));
    const spareTotal = Math.max(0, Number(M.networkDevices?.prefs?.splitterSparePorts || 0));
    const points = allPatchPointsForDim(M, dc);
    const needed = points.length + spareTotal;
    const splitterCount = Math.max(1, Math.ceil(needed / outCount));
    const plan = getPlan(M, dc);
    plan.lastSplitterTypeId = sp.id;
    plan.splitters = [];
    let cursor = 0;
    for(let i=0;i<splitterCount;i++){
      const num = dimDeviceNumber(dc,i);
      const portAssignments = [];
      for(let p=0;p<outCount;p++){
        portAssignments.push(cursor < points.length ? points[cursor++] : null);
      }
      const universes = [...new Set(portAssignments.filter(Boolean).map(x=>x.universe))].sort((a,b)=>a-b);
      plan.splitters.push({
        id: formatSplitterId(dc,i),
        name: `${dc} ${sp.brand || 'Splitter'} ${sp.name || sp.id} ${String(i+1).padStart(2,'0')}`,
        typeId: sp.id,
        deviceNo: num,
        segment: segmentFromDim(dc),
        ip: ipWithLastOctet(sp.defaultIp || '', num),
        subnet: sp.subnet || '',
        universes,
        portAssignments
      });
    }
    M.ui.dirty = true;
    saveM(M);
    render();
  }

  function enhanceSplitterViews(){
    const M = getM(); if(!M) return;
    document.querySelectorAll('.splitter-dim-section').forEach(section=>{
      const h3 = section.querySelector('h3')?.textContent || '';
      const dc = (h3.match(/in\s+(DB\d+)/i)||[])[1];
      if(!dc) return;
      const plan = getPlan(M, dc);
      section.querySelectorAll('.splitter-instance').forEach((instEl, idx)=>{
        const inst = plan.splitters?.[idx];
        if(!inst) return;
        const sp = splitterTypeById(M, inst.typeId) || {};
        const outCount = Math.max(1, Number(sp.outputCount || inst.portAssignments?.length || 1));
        let assignments = Array.isArray(inst.portAssignments) ? inst.portAssignments : [];
        if(!assignments.length){
          const points = allPatchPointsForDim(M, dc).filter(p => (inst.universes||[]).map(Number).includes(Number(p.universe)));
          assignments = points.slice(0,outCount);
        }
        const grid = document.createElement('div');
        grid.className = 'splitter-port-map';
        grid.innerHTML = Array.from({length:outCount},(_,i)=>{
          const a = assignments[i];
          if(!a) return `<div class="splitter-map-port spare"><b>${i+1}</b><span>SPARE</span></div>`;
          const color = uniColor(a.universe);
          const label = `${a.kind} ${a.id}${a.port!=='—' ? ' / P'+a.port : ''}`;
          return `<div class="splitter-map-port" style="--uni:${color}" title="UNI ${esc(a.universe)} • ${esc(label)} • ${esc(a.dest||'')}"><b>${i+1}</b><strong>UNI ${esc(a.universe)}</strong><span>${esc(label)}</span><em>${esc(a.dest||'')}</em></div>`;
        }).join('');
        const old = instEl.querySelector('.splitter-port-map');
        if(old) old.replaceWith(grid); else instEl.appendChild(grid);
      });
    });
  }

  function enhanceInlinePanels(){
    document.querySelectorAll('.lk-card-grid').forEach(grid=>{
      [...grid.children].forEach(child=>{
        if(child.classList?.contains('inline-detail-panel')){
          const prev = child.previousElementSibling;
          if(prev?.classList?.contains('lk-mini-card')) prev.appendChild(child);
        }
      });
    });
  }

  function enhanceVeamLinkedStatus(){
    const M = getM(); if(!M) return;
    document.querySelectorAll('.veam-mini[data-veam]').forEach(card=>{
      const vid = card.dataset.veam;
      const uses = M.veamUse?.get?.(vid) || [];
      let badge = card.querySelector('.veam-link-badge');
      if(!badge){ badge = document.createElement('div'); badge.className='veam-link-badge'; card.prepend(badge); }
      if(uses.length===1){
        badge.innerHTML = `Linked to <b>${esc(uses[0].lkId)}</b> / Veam ${esc(uses[0].slot)}`;
        badge.classList.remove('warn'); badge.classList.add('good');
      } else if(uses.length>1){
        badge.innerHTML = `Double linked: ${uses.map(u=>esc(u.lkId)).join(', ')}`;
        badge.classList.remove('good'); badge.classList.add('warn');
      } else {
        badge.textContent = 'Not linked';
        badge.classList.remove('good'); badge.classList.add('warn');
      }
    });
  }

  function enhanceCollapsibleLists(){
    const sections = [...document.querySelectorAll('#lkDetail > .section, #lkDetail .section')];
    for(const sec of sections){
      const h3 = sec.querySelector(':scope > h3');
      const txt = (h3?.textContent || '').trim();
      const isLK = /^LK overview/i.test(txt);
      const isVeam = /^Veam overview/i.test(txt);
      if(!isLK && !isVeam) continue;
      const content = sec.querySelector(':scope > .content');
      if(!content) continue;
      if(!h3.querySelector('.v9-collapse-btn')){
        const btn = document.createElement('button');
        btn.className = 'v9-collapse-btn';
        btn.textContent = (isLK ? state.lkCollapsed : state.veamCollapsed) ? 'Expand' : 'Collapse';
        btn.onclick = e=>{
          e.stopPropagation();
          if(isLK) state.lkCollapsed = !state.lkCollapsed;
          if(isVeam) state.veamCollapsed = !state.veamCollapsed;
          enhanceAll();
        };
        h3.appendChild(btn);
      }
      const collapsed = isLK ? state.lkCollapsed : state.veamCollapsed;
      content.style.display = collapsed ? 'none' : '';
      h3.querySelector('.v9-collapse-btn').textContent = collapsed ? 'Expand' : 'Collapse';
    }
  }

  function interceptButtons(){
    const M = getM(); if(!M) return;
    const dc = M.selected?.kind === 'DIM' ? M.selected.id : null;
    if(!dc) return;
    const nodeBtn = document.getElementById('dimAutoAssignNodes');
    if(nodeBtn && !nodeBtn.dataset.v9Hooked){
      nodeBtn.dataset.v9Hooked = '1';
      nodeBtn.addEventListener('click', e=>{
        e.preventDefault(); e.stopImmediatePropagation();
        const sel = document.getElementById('dimNodeType');
        autoAssignNodesDbSpare(dc, sel?.value || '');
      }, true);
    }
    const splitBtn = document.getElementById('dimAutoSplitters');
    if(splitBtn && !splitBtn.dataset.v9Hooked){
      splitBtn.dataset.v9Hooked = '1';
      splitBtn.addEventListener('click', e=>{
        e.preventDefault(); e.stopImmediatePropagation();
        const sel = document.getElementById('dimSplitterType');
        autoAssignSplittersDbSpare(dc, sel?.value || '');
      }, true);
    }
  }

  function addStyles(){
    if(document.getElementById('v9RuntimeStyles')) return;
    const s = document.createElement('style');
    s.id = 'v9RuntimeStyles';
    s.textContent = `
.v9-collapse-btn{float:right;background:#334155!important;color:#eaf2ff!important;padding:5px 9px!important;font-size:12px!important;border-radius:7px!important}
.lk-mini-card .inline-detail-panel{margin-top:12px!important;grid-column:auto!important;background:linear-gradient(180deg,#0b1d35,#07111f)!important}
.veam-link-badge{border-radius:999px;padding:4px 8px;margin:0 0 8px 0;font-size:12px;width:max-content}.veam-link-badge.good{background:rgba(29,185,84,.18);border:1px solid rgba(29,185,84,.55);color:#7dffae}.veam-link-badge.warn{background:rgba(255,193,7,.14);border:1px solid rgba(255,193,7,.5);color:#ffd76a}
.splitter-port-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:7px;margin-top:10px}.splitter-map-port{border:2px solid var(--uni,#4ea8ff);border-radius:10px;padding:7px;background:color-mix(in srgb,var(--uni,#4ea8ff) 18%,#07111f);min-height:74px}.splitter-map-port b{display:block;font-size:12px}.splitter-map-port strong{display:block;font-size:12px;color:#fff}.splitter-map-port span{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.splitter-map-port em{display:block;font-style:normal;font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.splitter-map-port.spare{border-color:#475569;background:#0b1728;color:#9fc0df}
`;
    document.head.appendChild(s);
  }

  function enhanceAll(){
    if(state.busy) return;
    state.busy = true;
    try{
      addStyles();
      interceptButtons();
      enhanceInlinePanels();
      enhanceVeamLinkedStatus();
      enhanceCollapsibleLists();
      enhanceSplitterViews();
    } finally {
      state.busy = false;
    }
  }

  function waitForApp(){
    if(window.LKApp?.getMODEL){
      enhanceAll();
      const obs = new MutationObserver(()=>enhanceAll());
      obs.observe(document.body,{childList:true,subtree:true});
      const oldRenderAll = window.LKApp.renderAll;
      if(typeof oldRenderAll === 'function' && !oldRenderAll.__v9Wrapped){
        const wrapped = function(...args){ const r = oldRenderAll.apply(this,args); setTimeout(enhanceAll,0); return r; };
        wrapped.__v9Wrapped = true;
        window.LKApp.renderAll = wrapped;
      }
    } else {
      setTimeout(waitForApp,50);
    }
  }
  waitForApp();
})();
