// ui/help.js
// Help panel (the manual from core/manual.js, opened on the chapter that matches where you are)
// and the Request dialog (feature request / bug / question → pre-filled GitHub issue).
const App = window.LKApp;
const I = (n, s) => App.ui.icon(n, s);
const { esc } = App.net;
const M = () => App.getMODEL();
const lang = () => (window.I18n?.language === 'nl' ? 'nl' : 'en');
const t = (en, nl) => (lang() === 'nl' ? nl : en);

// ---- Which chapter belongs to what the user is looking at right now ----
function currentContext(){
  const dlgOpen = sel => !!document.querySelector(sel);
  if(document.getElementById('rbRoot')) return 'reportBuilder';
  if(dlgOpen('.db-modal')) return `deviceBuilder:${window.DeviceBuilder?.tab?.() || 'node'}`;
  if(dlgOpen('.settings-modal')) return 'settings';
  const ed = document.getElementById('editCsvBackdrop'); if(ed && ed.style.display && ed.style.display !== 'none') return 'csvEditor';
  const wiz = document.getElementById('backdrop'); if(wiz && wiz.style.display === 'flex') return 'wizard';
  if(document.querySelector('.welcome')) return 'welcome';
  const m = M(); if(!m) return 'HOME';
  if(m.ui?.rightMode === 'DETAIL' && m.selected?.kind){
    if(m.selected.kind === 'DIM'){
      // de kaart die het dichtst bij de bovenkant van het scherm staat bepaalt het hoofdstuk
      // de kaart die het grootste deel van het scherm inneemt bepaalt het hoofdstuk
      const sc = document.getElementById('mainScroll');
      const vTop = sc ? sc.getBoundingClientRect().top : 0, vBot = innerHeight;
      let near = null, best = 0;
      for(const c of document.querySelectorAll('#lkDetail .card[data-card]')){
        const r = c.getBoundingClientRect();
        const vis = Math.min(r.bottom, vBot) - Math.max(r.top, vTop);
        if(vis > best){ best = vis; near = c; }
      }
      const key = near?.dataset.card?.split(':')[1];
      if(key === 'racks') return 'DIM:racks';
      if(key === 'nodes' || key === 'splitters') return 'DIM:nodes';
      return 'DIM';
    }
    return m.selected.kind;   // LK | VEAM
  }
  const view = m.ui?.view || 'HOME';
  if(view === 'HOME' && !(m.byDim?.size)) return 'HOME:empty';
  return view;               // HOME | ISSUES | TABLE | NETWORK | FLOW
}

// ---- Panel ----
let panel = null, current = null, query = '';
function open(chapterId){
  const Man = window.Manual; if(!Man) return;
  const ch = chapterId ? Man.CHAPTERS.find(c => c.id === chapterId) : Man.chapterFor(currentContext());
  current = ch || Man.CHAPTERS[0];
  if(!panel){
    panel = document.createElement('aside');
    panel.className = 'help-panel';
    panel.setAttribute('data-no-i18n', '');   // de handleiding is al in de gekozen taal
    panel.innerHTML = `<div class="help-head"><b>${I('book', 16)}<span></span></b><input type="search" class="help-search"><button class="ghost icon-only" data-h="close" title="Close">${I('x', 16)}</button></div>
      <div class="help-body"><nav class="help-toc"></nav><article class="help-article"></article></div>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-h=close]').onclick = close;
    const inp = panel.querySelector('.help-search');
    inp.oninput = () => { query = inp.value.trim().toLowerCase(); renderToc(); if(query) renderSearch(); else renderArticle(); };
    document.addEventListener('keydown', onKey, true);
  }
  panel.querySelector('.help-head b span').textContent = t('User manual', 'Handleiding');
  panel.querySelector('.help-search').placeholder = t('Search the manual…', 'Zoek in de handleiding…');
  query = ''; panel.querySelector('.help-search').value = '';
  renderToc(); renderArticle();
  document.body.classList.add('help-open');
}
function close(){
  if(!panel) return;
  panel.remove(); panel = null;
  document.body.classList.remove('help-open');
  document.removeEventListener('keydown', onKey, true);
}
function toggle(){ panel ? close() : open(); }
function onKey(e){ if(e.key === 'Escape' && panel && !document.querySelector('.modal-backdrop')){ e.preventDefault(); close(); } }
function renderToc(){
  const Man = window.Manual, L = lang();
  const hit = c => c.title.en.toLowerCase().includes(query) || c.title.nl.toLowerCase().includes(query) || c.en.toLowerCase().includes(query) || c.nl.toLowerCase().includes(query);
  const list = Man.CHAPTERS.filter(c => !query || hit(c));
  panel.querySelector('.help-toc').innerHTML = list.map(c => `<a class="${current?.id === c.id && !query ? 'on' : ''}" data-ch="${c.id}">${I(c.icon, 14)}<span>${esc(c.title[L])}</span></a>`).join('') || `<div class="subtle" style="padding:10px">${t('Nothing found', 'Niets gevonden')}</div>`;
  panel.querySelectorAll('[data-ch]').forEach(a => a.onclick = () => { current = Man.CHAPTERS.find(c => c.id === a.dataset.ch); query = ''; panel.querySelector('.help-search').value = ''; renderToc(); renderArticle(); });
}
const link = (id, label) => `<a data-ch="${esc(id)}">${esc(label)}</a>`;
function renderArticle(){
  const Man = window.Manual, L = lang(), c = current;
  const art = panel.querySelector('.help-article');
  art.innerHTML = `<h3>${I(c.icon, 18)}${esc(c.title[L])}</h3>${Man.toHtml(c[L], { esc, link })}
    <div class="help-foot"><span class="subtle">${t('Something missing or wrong in this chapter?', 'Mist er iets of klopt er iets niet in dit hoofdstuk?')}</span><button class="sm" data-h="req">${I('message', 13)}${t('Send a request', 'Verzoek sturen')}</button></div>`;
  art.scrollTop = 0;
  if(c.id === 'videos') videoPlayer(art);
  art.querySelectorAll('[data-ch]').forEach(a => a.onclick = () => { current = Man.CHAPTERS.find(x => x.id === a.dataset.ch) || current; renderToc(); renderArticle(); });
  art.querySelector('[data-h=req]').onclick = () => openRequest({ about:c.title[L] });
}
// ---- Videos (assets/videos/<part>-<lang>.webm, made by tools/make-videos.mjs) ----
const PARTS = ['import', 'network', 'racks', 'lks', 'fibers', 'pdf', 'stickers'];
const VIDEOS = [
  ['full', 'Complete tour', 'Complete rondleiding'], ['import', '1 · Import', '1 · Importeren'], ['network', '2 · Network', '2 · Netwerk'],
  ['racks', '3 · Racks', '3 · Racks'], ['lks', '4 · Couple the LKs', '4 · LK’s koppelen'], ['fibers', '5 · Fibres', '5 · Fibers'],
  ['pdf', '6 · PDF', '6 · PDF'], ['stickers', '7 · Stickers', '7 · Stickers'],
];
let videoId = 'full';
function videoPlayer(art, auto = false){
  const L = lang();
  const box = document.createElement('div'); box.className = 'help-videos';
  box.innerHTML = `<video class="help-video" controls preload="metadata" src="assets/videos/${videoId === 'full' ? PARTS[0] : videoId}-${L}.webm" ${auto ? 'autoplay' : ''}></video>
    <div class="help-vlist">${VIDEOS.map(([id, en, nl]) => `<button class="sm ${id === videoId ? 'primary' : 'ghost'}" data-vid="${id}">${I('play', 13)}${esc(t(en, nl))}</button>`).join('')}</div>
    <div class="subtle" style="margin-top:6px">${t('Subtitles only — no sound.', 'Alleen ondertiteling — geen geluid.')}</div>`;
  const h = art.querySelector('h3'); h.after(box);
  box.querySelectorAll('[data-vid]').forEach(b => b.onclick = () => { videoId = b.dataset.vid; box.remove(); videoPlayer(art, true); });
  if(videoId === 'full'){ const v = box.querySelector('video'); let i = 0; v.onended = () => { if(++i < PARTS.length){ v.src = `assets/videos/${PARTS[i]}-${L}.webm`; v.play(); } }; }
  box.querySelector('video').onerror = () => { box.querySelector('video').replaceWith(Object.assign(document.createElement('div'), { className: 'subtle', textContent: t('This video is not available in this build.', 'Deze video is niet beschikbaar in deze versie.') })); };
}
function renderSearch(){
  const Man = window.Manual, L = lang(), art = panel.querySelector('.help-article');
  const hits = [];
  for(const c of Man.CHAPTERS){
    let body = c[L], i = body.toLowerCase().indexOf(query);
    if(i < 0){ body = c[L === 'nl' ? 'en' : 'nl']; i = body.toLowerCase().indexOf(query); }   // ook in de andere taal zoeken (spider / spin)
    if(i < 0 && !c.title.en.toLowerCase().includes(query) && !c.title.nl.toLowerCase().includes(query)) continue;
    const from = Math.max(0, i - 60), snippet = i < 0 ? body.slice(0, 140) : body.slice(from, i + 90);
    hits.push(`<a class="help-hit" data-ch="${c.id}"><b>${I(c.icon, 14)}${esc(c.title[L])}</b><span>${esc(snippet.replace(/[#*\[\]|]/g, ' ').replace(/\s+/g, ' ').trim())}…</span></a>`);
  }
  art.innerHTML = `<h3>${I('search', 18)}${t('Search results', 'Zoekresultaten')}</h3>${hits.join('') || `<p class="subtle">${t('Nothing found.', 'Niets gevonden.')}</p>`}`;
  art.querySelectorAll('[data-ch]').forEach(a => a.onclick = () => { current = Man.CHAPTERS.find(x => x.id === a.dataset.ch); query = ''; panel.querySelector('.help-search').value = ''; renderToc(); renderArticle(); });
}

// ---- Request dialog → pre-filled GitHub issue ----
const TYPES = [['feature', 'Feature request', 'Wens / verbetering', 'enhancement'], ['bug', 'Bug report', 'Fout', 'bug'], ['question', 'Question', 'Vraag', 'question']];
async function openRequest({ about='' } = {}){
  const info = (await window.app?.appInfo?.().catch(() => null)) || { version:'', platform:navigator.platform };
  const repo = window.Settings?.get?.().updates?.repo || 'Kevin11999/dimcity-patchlab';
  const ctx = currentContext();
  const page = window.Manual?.chapterFor(ctx)?.title[lang()] || ctx;
  const d = App.ui.openDialog({
    title:t('Send a request', 'Een verzoek sturen'),
    subtitle:t('A wish, a bug or a question — it becomes a GitHub issue so you can follow it.', 'Een wens, een fout of een vraag — het wordt een GitHub-issue zodat je het kunt volgen.'),
    width:'560px', cls:'request-modal',
    body:`<div class="segmented rb-full" id="rqType">${TYPES.map(([v, en, nl], i) => `<button data-v="${v}" class="${i === 0 ? 'active' : ''}">${esc(t(en, nl))}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px">${t('Title', 'Titel')}<input id="rqTitle" type="text" maxlength="120" placeholder="${esc(t('Short and specific, e.g. "Export racks as PNG"', 'Kort en concreet, bijv. "Racks als PNG exporteren"'))}" value="${esc(about ? `${about}: ` : '')}"></label>
      <label class="field">${t('Description', 'Beschrijving')}<textarea id="rqBody" rows="6" placeholder="${esc(t('What would you like, or what went wrong? What did you expect?', 'Wat wil je graag, of wat ging er mis? Wat verwachtte je?'))}"></textarea></label>
      <div class="hint">${I('info', 12)} ${t('Added automatically:', 'Automatisch toegevoegd:')} PatchLab ${esc(info.version || '')} · ${esc(info.platform || '')} · ${esc(page)}</div>
      <div class="hint">${t('You need a GitHub account with access to the repository. Without it, use Copy and send the text to the maintainer.', 'Je hebt een GitHub-account met toegang tot de repository nodig. Zonder dat: gebruik Kopiëren en stuur de tekst naar de beheerder.')}</div>
      <div id="rqError" class="form-error"></div>`,
    footer:`<button data-a="copy" style="margin-right:auto">${I('copy', 14)}${t('Copy', 'Kopiëren')}</button><button data-a="cancel">${t('Cancel', 'Annuleren')}</button><button class="primary" data-a="go">${I('arrowRight', 14)}${t('Open on GitHub', 'Openen op GitHub')}</button>`
  });
  let type = 'feature';
  d.body.querySelectorAll('#rqType button').forEach(b => b.onclick = () => { type = b.dataset.v; d.body.querySelectorAll('#rqType button').forEach(x => x.classList.toggle('active', x === b)); });
  setTimeout(() => d.body.querySelector('#rqTitle').focus(), 30);
  const compose = () => {
    const title = d.body.querySelector('#rqTitle').value.trim();
    const desc = d.body.querySelector('#rqBody').value.trim();
    if(!title){ d.body.querySelector('#rqError').textContent = t('Give the request a title.', 'Geef het verzoek een titel.'); d.body.querySelector('#rqTitle').focus(); return null; }
    const T = TYPES.find(x => x[0] === type);
    const body = `${desc || '_(no description)_'}\n\n---\n**Type:** ${T[1]}\n**PatchLab:** ${info.version || '?'} · ${info.platform || '?'}\n**Page:** ${page}\n_Sent from the Request button in DimCity PatchLab_`;
    return { title:`[${T[1]}] ${title}`, body, label:T[3] };
  };
  d.footer.querySelector('[data-a=cancel]').onclick = d.close;
  d.footer.querySelector('[data-a=copy]').onclick = async () => {
    const r = compose(); if(!r) return;
    try { await navigator.clipboard.writeText(`${r.title}\n\n${r.body}`); App.ui.toast(t('Copied — paste it in an e-mail or chat to the maintainer', 'Gekopieerd — plak het in een e-mail of chat naar de beheerder')); }
    catch { App.ui.toast(t('Could not copy', 'Kopiëren mislukt'), 'err'); }
  };
  d.footer.querySelector('[data-a=go]').onclick = () => {
    const r = compose(); if(!r) return;
    const url = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(r.title)}&body=${encodeURIComponent(r.body)}&labels=${encodeURIComponent(r.label)}`;
    if(window.app?.openExternal) window.app.openExternal(url); else window.open(url, '_blank');
    d.close();
    App.ui.toast(t('GitHub opened in your browser — click "Submit new issue" there', 'GitHub is in je browser geopend — klik daar op "Submit new issue"'), 'info', { ms:7000 });
  };
}

// ---- Wiring: toolbar, keys ----
document.getElementById('tbHelp')?.addEventListener('click', () => toggle());
document.getElementById('tbRequest')?.addEventListener('click', () => openRequest());
document.addEventListener('keydown', e => {
  if(e.key === 'F1' || (e.key === '?' && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable)){
    e.preventDefault(); toggle();
  }
});

window.Help = { open, close, toggle, openRequest, currentContext };
