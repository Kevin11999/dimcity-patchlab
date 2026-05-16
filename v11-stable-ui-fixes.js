// v11-stable-ui-fixes.js
// Stable UI fixes. V11 fixes AB splitter auto-calculate:
// Single input = 1 universe feed per splitter. AB input = max 2 universe feeds per splitter.
(function(){
  'use strict';

  const state = { lkCollapsed:false, veamCollapsed:false, running:false };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const getM = () => window.LKApp?.getMODEL?.();
  const setM = M => window.LKApp?.setMODEL?.(M);
  const renderAll = () => window.LKApp?.renderAll?.();

  function dimNumber(dc){ const m=String(dc||'').match(/(\d+)/); return m?Number(m[1]):0; }
  function segmentFromDim(dc){ return dimNumber(dc)||1; }
  function dimDeviceNumber(dc, index){ const d=dimNumber(dc); return d<=1 ? index+1 : d*10+index+1; }
  function formatNodeId(dc,index){ return `ID:${String(dimDeviceNumber(dc,index)).padStart(2,'0')}`; }
  function formatSplitterId(dc,index){ return `SP:${String(dimDeviceNumber(dc,index)).padStart(2,'0')}`; }
  function validIp(ip){ return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip||'')); }
  function ipWithLastOctet(ip,last){ if(!validIp(ip)) return ''; const p=String(ip).split('.').map(Number); p[3]=Math.max(1,Math.min(254,Number(last||1))); return p.join('.'); }
  function uniColor(u){ const hue=(Number(u||0)*47)%360; return `hsl(${hue} 78% 43%)`; }

  function currentDc(){ const M=getM(); return M?.selected?.kind==='DIM' ? M.selected.id : null; }
  function getPlan(M, dc){
    if(!M.networkDevices) M.networkDevices={};
    if(!M.networkDevices.dimCityPlans) M.networkDevices.dimCityPlans={};
    if(!M.networkDevices.dimCityPlans[dc]) M.networkDevices.dimCityPlans[dc]={nodes:[],splitters:[],switches:[]};
    const p=M.networkDevices.dimCityPlans[dc];
    if(!Array.isArray(p.nodes)) p.nodes=[];
    if(!Array.isArray(p.splitters)) p.splitters=[];
    if(!Array.isArray(p.switches)) p.switches=[];
    return p;
  }
  function nodeTypeById(M,id){ return (M.networkDevices?.nodeTypes||[]).find(x=>x.id===id) || (M.networkDevices?.nodeTypes||[])[0]; }
  function splitterTypeById(M,id){ return (M.networkDevices?.splitterTypes||[]).find(x=>x.id===id) || (M.networkDevices?.splitterTypes||[])[0]; }
  function splitterBusCount(sp){ return String(sp?.mode||'').toUpperCase()==='AB' ? 2 : 1; }
  function uniqueUniverses(M,dc){ const stat=M.uniStats?.get?.(dc); if(!stat?.counts) return []; return [...stat.counts.keys()].map(Number).filter(Number.isFinite).sort((a,b)=>a-b); }
  function allPatchPoints(M,dc){
    const out=[];
    for(const L of (M.lines||[])) if(L.dimcity===dc && L.universe!=null && L.universe!=='') out.push({kind:'LK',id:L.id,port:L.port,universe:Number(L.universe),dest:L.dest||''});
    for(const V of (M.veamLines||[])) if(V.dimcity===dc && V.universe!=null && V.universe!=='') out.push({kind:'Veam',id:V.id,port:V.port,universe:Number(V.universe),dest:V.dest||''});
    for(const D of (M.dmxLoose||[])) if(D.dimcity===dc && D.universe!=null && D.universe!=='') out.push({kind:'DMX',id:'Loose DMX',port:'—',universe:Number(D.universe),dest:D.dest||''});
    return out.sort((a,b)=>a.universe-b.universe || String(a.id).localeCompare(String(b.id)) || Number(a.port||0)-Number(b.port||0));
  }

  function autoAssignNodesPerDb(dc, nodeTypeId){
    const M=getM(); if(!M) return;
    const nt=nodeTypeById(M,nodeTypeId); if(!nt) return;
    const portCount=Math.max(1,Number(nt.portCount||1));
    const spareTotal=Math.max(0,Number(M.networkDevices?.prefs?.nodeSparePorts||0));
    const unis=uniqueUniverses(M,dc);
    const nodeCount=Math.max(1,Math.ceil((unis.length+spareTotal)/portCount));
    const plan=getPlan(M,dc);
    plan.nodeTypeId=nt.id;
    plan.nodes=[];
    let cursor=0;
    for(let i=0;i<nodeCount;i++){
      const num=dimDeviceNumber(dc,i);
      const universes=[];
      for(let p=0;p<portCount;p++) universes.push(cursor<unis.length ? unis[cursor++] : null);
      plan.nodes.push({ id:formatNodeId(dc,i), name:`${dc} ${nt.brand||'Node'} ${nt.name||nt.id} ${String(i+1).padStart(2,'0')}`, typeId:nt.id, deviceNo:num, segment:segmentFromDim(dc), ip:ipWithLastOctet(nt.defaultIp||'',num), subnet:nt.subnet||'255.255.255.0', universes });
    }
    M.ui.dirty=true; setM(M); renderAll();
  }

  function autoAssignSplittersPerDb(dc, splitterTypeId){
    const M=getM(); if(!M) return;
    const sp=splitterTypeById(M,splitterTypeId); if(!sp) return;
    const outCount=Math.max(1,Number(sp.outputCount||sp.totalOutputs||1));
    const spareTotal=Math.max(0,Number(M.networkDevices?.prefs?.splitterSparePorts||0));
    const busCount=splitterBusCount(sp);
    const allPoints=allPatchPoints(M,dc);
    const universes=[...new Set(allPoints.map(p=>p.universe))].sort((a,b)=>a-b);
    const pointsByUni=new Map(universes.map(u=>[u, allPoints.filter(p=>Number(p.universe)===Number(u))]));
    const plan=getPlan(M,dc);
    plan.lastSplitterTypeId=sp.id;
    plan.splitters=[];

    let uniCursor=0;
    while(uniCursor < universes.length){
      const feedUnis=universes.slice(uniCursor, uniCursor + busCount);
      uniCursor += busCount;

      const feedPoints=[];
      for(const u of feedUnis) feedPoints.push(...(pointsByUni.get(u)||[]));

      let pointCursor=0;
      const usableOutputs=Math.max(1,outCount - spareTotal);
      do{
        const idx=plan.splitters.length;
        const num=dimDeviceNumber(dc,idx);
        const portAssignments=[];
        for(let p=0;p<outCount;p++){
          if(p < usableOutputs && pointCursor < feedPoints.length) portAssignments.push(feedPoints[pointCursor++]);
          else portAssignments.push(null);
        }
        const usedUnis=[...new Set(portAssignments.filter(Boolean).map(x=>x.universe))].sort((a,b)=>a-b);
        plan.splitters.push({ id:formatSplitterId(dc,idx), name:`${dc} ${sp.brand||'Splitter'} ${sp.name||sp.id} ${String(idx+1).padStart(2,'0')}`, typeId:sp.id, deviceNo:num, segment:segmentFromDim(dc), ip:ipWithLastOctet(sp.defaultIp||'',num), subnet:sp.subnet||'', universes:usedUnis, inputUniverses:feedUnis, portAssignments });
      } while(pointCursor < feedPoints.length);
    }

    if(!plan.splitters.length){
      const num=dimDeviceNumber(dc,0);
      plan.splitters.push({ id:formatSplitterId(dc,0), name:`${dc} ${sp.brand||'Splitter'} ${sp.name||sp.id} 01`, typeId:sp.id, deviceNo:num, segment:segmentFromDim(dc), ip:ipWithLastOctet(sp.defaultIp||'',num), subnet:sp.subnet||'', universes:[], inputUniverses:[], portAssignments:Array.from({length:outCount},()=>null) });
    }
    M.ui.dirty=true; setM(M); renderAll();
  }

  function moveInlinePanelsInsideCards(){
    document.querySelectorAll('.lk-card-grid').forEach(grid=>{
      [...grid.children].forEach(child=>{
        if(!child.classList?.contains('inline-detail-panel')) return;
        const prev=child.previousElementSibling;
        if(prev?.classList?.contains('lk-mini-card')) prev.appendChild(child);
      });
    });
  }
  function addLinkedStatusOnVeams(){
    const M=getM(); if(!M) return;
    document.querySelectorAll('.veam-mini[data-veam]').forEach(card=>{
      const vid=card.dataset.veam;
      const uses=M.veamUse?.get?.(vid)||[];
      let badge=card.querySelector(':scope > .veam-link-badge');
      if(!badge){ badge=document.createElement('div'); badge.className='veam-link-badge'; card.prepend(badge); }
      if(uses.length===1){ badge.className='veam-link-badge good'; badge.innerHTML=`Linked to <b>${esc(uses[0].lkId)}</b> / Veam ${esc(uses[0].slot)}`; }
      else if(uses.length>1){ badge.className='veam-link-badge warn'; badge.innerHTML=`Double linked: ${uses.map(u=>esc(u.lkId)).join(', ')}`; }
      else { badge.className='veam-link-badge warn'; badge.textContent='Not linked'; }
    });
  }
  function addSectionCollapse(){
    document.querySelectorAll('#lkDetail > .section').forEach(sec=>{
      const h3=sec.querySelector(':scope > h3'); const content=sec.querySelector(':scope > .content'); if(!h3||!content) return;
      const txt=h3.textContent.trim(); const isLK=/^LK overview/i.test(txt); const isVeam=/^Veam overview/i.test(txt); if(!isLK&&!isVeam) return;
      let btn=h3.querySelector('.v11-collapse-btn'); if(!btn){ btn=document.createElement('button'); btn.className='v11-collapse-btn'; h3.appendChild(btn); }
      const collapsed=isLK?state.lkCollapsed:state.veamCollapsed; btn.textContent=collapsed?'Expand':'Collapse'; content.style.display=collapsed?'none':'';
      btn.onclick=e=>{ e.preventDefault(); e.stopPropagation(); if(isLK) state.lkCollapsed=!state.lkCollapsed; else state.veamCollapsed=!state.veamCollapsed; enhanceAll(); };
    });
  }
  function enhanceSplitterPorts(){
    const M=getM(); if(!M) return;
    document.querySelectorAll('.splitter-dim-section').forEach(section=>{
      const dc=currentDc(); if(!dc) return;
      const plan=getPlan(M,dc);
      section.querySelectorAll('.splitter-instance').forEach((instEl,idx)=>{
        const inst=plan.splitters?.[idx]; if(!inst) return;
        const sp=splitterTypeById(M,inst.typeId)||{};
        const count=Math.max(1,Number(sp.outputCount||inst.portAssignments?.length||1));
        let assignments=Array.isArray(inst.portAssignments)?inst.portAssignments:[];
        if(!assignments.length){ const wanted=(inst.universes||[]).map(Number); assignments=allPatchPoints(M,dc).filter(p=>wanted.includes(Number(p.universe))).slice(0,count); }
        const feedTxt=(inst.inputUniverses||inst.universes||[]).map(u=>`UNI ${u}`).join(' / ') || 'not assigned';
        const html=Array.from({length:count},(_,i)=>{
          const a=assignments[i];
          if(!a) return `<div class="split-map-port spare"><b>${i+1}</b><span>SPARE</span></div>`;
          const c=uniColor(a.universe);
          return `<div class="split-map-port" style="--uni:${c}" title="UNI ${esc(a.universe)} • ${esc(a.kind)} ${esc(a.id)} P${esc(a.port)} • ${esc(a.dest)}"><b>${i+1}</b><strong>UNI ${esc(a.universe)}</strong><span>${esc(a.kind)} ${esc(a.id)}${a.port!=='—'?' / P'+esc(a.port):''}</span><em>${esc(a.dest||'')}</em></div>`;
        }).join('');
        let map=instEl.querySelector('.splitter-port-map'); if(!map){ map=document.createElement('div'); map.className='splitter-port-map'; instEl.appendChild(map); }
        map.innerHTML=`<div class="split-feed-line"><b>Input feed:</b> ${esc(feedTxt)} <span class="muted">(${splitterBusCount(sp)} bus${splitterBusCount(sp)>1?'ses':''})</span></div>${html}`;
      });
    });
  }
  function hookButtons(){
    const dc=currentDc(); if(!dc) return;
    const btnNode=document.getElementById('dimAutoAssignNodes');
    if(btnNode && !btnNode.dataset.v11){ btnNode.dataset.v11='1'; btnNode.addEventListener('click', e=>{ e.preventDefault(); e.stopImmediatePropagation(); autoAssignNodesPerDb(dc, document.getElementById('dimNodeType')?.value||''); }, true); }
    const btnSplit=document.getElementById('dimAutoSplitters');
    if(btnSplit && !btnSplit.dataset.v11){ btnSplit.dataset.v11='1'; btnSplit.addEventListener('click', e=>{ e.preventDefault(); e.stopImmediatePropagation(); autoAssignSplittersPerDb(dc, document.getElementById('dimSplitterType')?.value||''); }, true); }
  }
  function addStyles(){
    if(document.getElementById('v11StableStyles')) return;
    const s=document.createElement('style'); s.id='v11StableStyles';
    s.textContent=`
.v11-collapse-btn{float:right;background:#334155!important;color:#eaf2ff!important;padding:5px 9px!important;font-size:12px!important;border-radius:7px!important;margin-left:8px!important}.lk-mini-card .inline-detail-panel{margin-top:12px!important;grid-column:auto!important;background:linear-gradient(180deg,#0b1d35,#07111f)!important}.veam-link-badge{border-radius:999px;padding:4px 8px;margin:0 0 8px 0;font-size:12px;width:max-content}.veam-link-badge.good{background:rgba(29,185,84,.18);border:1px solid rgba(29,185,84,.55);color:#7dffae}.veam-link-badge.warn{background:rgba(255,193,7,.14);border:1px solid rgba(255,193,7,.5);color:#ffd76a}.splitter-port-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(94px,1fr));gap:7px;margin-top:10px}.split-feed-line{grid-column:1/-1;border:1px solid var(--line);border-radius:9px;padding:6px 8px;background:#071a30;color:var(--muted)}.split-map-port{border:2px solid var(--uni,#4ea8ff);border-radius:10px;padding:7px;background:color-mix(in srgb,var(--uni,#4ea8ff) 18%,#07111f);min-height:74px}.split-map-port b{display:block;font-size:12px}.split-map-port strong{display:block;font-size:12px;color:#fff}.split-map-port span{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.split-map-port em{display:block;font-style:normal;font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.split-map-port.spare{border-color:#475569;background:#0b1728;color:#9fc0df}`;
    document.head.appendChild(s);
  }
  function enhanceAll(){ if(state.running) return; state.running=true; try{ addStyles(); moveInlinePanelsInsideCards(); addLinkedStatusOnVeams(); addSectionCollapse(); enhanceSplitterPorts(); hookButtons(); } finally{ state.running=false; } }
  function start(){
    addStyles();
    document.addEventListener('click', ()=>setTimeout(enhanceAll,0), true);
    document.addEventListener('change', ()=>setTimeout(enhanceAll,0), true);
    document.addEventListener('drop', ()=>setTimeout(enhanceAll,0), true);
    const wait=()=>{ if(window.LKApp?.renderAll){ const old=window.LKApp.renderAll; if(!old.__v11Wrapped){ const wrapped=function(...args){ const r=old.apply(this,args); setTimeout(enhanceAll,0); return r; }; wrapped.__v11Wrapped=true; window.LKApp.renderAll=wrapped; } enhanceAll(); } else setTimeout(wait,100); };
    wait();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
