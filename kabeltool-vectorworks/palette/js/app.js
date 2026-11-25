// Schermen van de palette.
// Opbouw: bovenbalk (tekening, verversen, bijwerken, stempelen, menu) · kolom links (tools, overzicht, inspector)
// · rechts tabbladen (3D, Kabels, Waarschuwingen, Bibliotheek, Instellingen) · statusregel.
(function () {
  const KT = window.KT;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getal = (v, n) => (Math.round((+v || 0) * Math.pow(10, n == null ? 1 : n)) / Math.pow(10, n == null ? 1 : n)).toString().replace('.', ',');
  const ui = KT.ui = { tab: 'drie', type: null, sel: null, zoek: '', open: {} };
  let viewer = null, laatsteTekening = null;
  const klikIn3D = id => { ui.sel = id; KT.project.selecteer = id; KT.opslaan().then(() => render()); };

  KT.status = (t, soort) => {
    const el = $('#status');
    if (!el) return;
    el.textContent = t || '';
    el.className = 'status' + (soort ? ' ' + soort : '');
  };

  // ---------- thema: volgt Vectorworks (licht/donker), anders het systeem ----------
  const zetThema = donker => document.documentElement.setAttribute('data-thema', donker ? 'donker' : 'licht');
  if (typeof window.setVectorworksThemeCallback === 'function') {
    try { window.setVectorworksThemeCallback(isDark => zetThema(!!isDark)); } catch (e) { /* oude Vectorworks */ }
  }
  zetThema(window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true);

  // ---------- eigen vensters (confirm/prompt werken niet betrouwbaar in de web palette) ----------
  function venster(inhoud, opties) {
    opties = opties || {};
    return new Promise(klaarMet => {
      const bg = document.createElement('div');
      bg.className = 'venster-bg';
      bg.innerHTML = `<div class="venster ${opties.breed ? 'breed' : ''}" role="dialog">
        ${opties.titel ? `<h4>${esc(opties.titel)}</h4>` : ''}<div class="venster-inhoud"></div>${opties.invoer ? '<input class="venster-invoer">' : ''}
        <div class="knoppen">${opties.alleenOk ? '' : '<button data-k="nee">Annuleren</button>'}<button data-k="ja" class="primair">${esc(opties.ok || 'OK')}</button></div></div>`;
      const vak = bg.querySelector('.venster-inhoud');
      if (opties.html) vak.innerHTML = inhoud; else vak.textContent = inhoud;
      const inp = bg.querySelector('input');
      if (inp) inp.value = opties.standaard == null ? '' : opties.standaard;
      const sluit = ja => { bg.remove(); klaarMet(opties.invoer ? (ja ? inp.value : null) : ja); };
      bg.querySelector('[data-k="ja"]').onclick = () => sluit(true);
      const nee = bg.querySelector('[data-k="nee"]');
      if (nee) nee.onclick = () => sluit(false);
      bg.addEventListener('keydown', e => { if (e.key === 'Enter') sluit(true); if (e.key === 'Escape') sluit(false); });
      document.body.appendChild(bg);
      (inp || bg.querySelector('[data-k="ja"]')).focus();
    });
  }
  KT.vraag = tekst => venster(tekst, {});
  KT.invoer = (tekst, standaard) => venster(tekst, { invoer: true, standaard });
  KT.toon = (titel, html, breed) => venster(html, { titel, html: true, breed, alleenOk: true, ok: 'Sluiten' });

  async function klaar() { await KT.opslaan(); render(); }
  const opties = (lijst, gekozen, leeg) => (leeg != null ? `<option value="">${esc(leeg)}</option>` : '') +
    lijst.map(o => `<option value="${esc(o.id)}" ${o.id === gekozen ? 'selected' : ''}>${esc(o.naam)}</option>`).join('');
  const seg = (waarden, gekozen, actie) => `<div class="seg">${waarden.map(([v, t, tip]) =>
    `<button class="${v === gekozen ? 'aan' : ''}" title="${esc(tip || t)}" onclick="${actie.replace('$', v)}">${esc(t)}</button>`).join('')}</div>`;

  // ---------- iconen ----------
  const ICOON = {
    dimcity: '<svg viewBox="0 0 18 18"><rect x="3" y="3" width="12" height="12" rx="1.5" fill="#e5484d"/><path d="M6 7h6M6 10h6" stroke="#fff" stroke-width="1.4"/></svg>',
    vloer: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M2 15V8h7V3h7"/><circle cx="2" cy="15" r="1.6" fill="currentColor"/></svg>',
    truss: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1 6h16M1 12h16M2 12l3-6 3 6 3-6 3 6 3-6"/></svg>',
    drop: '<svg viewBox="0 0 18 18"><path d="M5 4c3 0 3 3 5 5s2 5 4 5" fill="none" stroke="#30a46c" stroke-width="1.6"/><circle cx="5" cy="4" r="2.6" fill="#30a46c"/><path d="M12 12h4v4h-4z" fill="none" stroke="#30a46c" stroke-width="1.3"/><path d="M14 11v6M11 14h6" stroke="#30a46c" stroke-width="1"/></svg>',
    selectie: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3h12v12H3z" stroke-dasharray="2 2"/><path d="M7 7l6 3-3 1-1 3z" fill="currentColor"/></svg>',
    lampen: '<svg viewBox="0 0 18 18"><circle cx="9" cy="7" r="4.5" fill="#f5b400"/><path d="M7 12h4v3H7z" fill="currentColor"/></svg>',
    bijwerken: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="4" width="9" height="6" rx="1"/><path d="M2.5 5.2h9" stroke="#30a46c" stroke-width="1.6"/><path d="M13 9l3 3-3 3"/></svg>',
    stempelen: '<svg viewBox="0 0 18 18" fill="currentColor"><path d="M7 2h4v5l3 2v2H4V9l3-2z"/><rect x="3" y="13" width="12" height="2" rx="1"/></svg>',
    verversen: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 9a6 6 0 1 1-2-4.5M15 3v4h-4"/></svg>',
    meer: '<svg viewBox="0 0 18 18" fill="currentColor"><circle cx="4" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="14" cy="9" r="1.5"/></svg>',
    fout: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#e5484d"/><path d="M8 4v5" stroke="#fff" stroke-width="1.8"/><circle cx="8" cy="11.6" r="1.1" fill="#fff"/></svg>',
    letop: '<svg viewBox="0 0 16 16"><path d="M8 1.5l7 12.5H1z" fill="#f5a623"/><path d="M8 6v4" stroke="#fff" stroke-width="1.6"/><circle cx="8" cy="12" r="1" fill="#fff"/></svg>',
    ok: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#30a46c"/><path d="M4.8 8.2l2.2 2.2 4.2-4.6" fill="none" stroke="#fff" stroke-width="1.7"/></svg>',
    map: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h5l2 2h7v8H2z"/></svg>',
    demo: '<svg viewBox="0 0 18 18"><path d="M5 3l10 6-10 6z" fill="#f76b15"/></svg>',
  };

  // ---------- bovenbalk ----------
  function rBalk() {
    const metVw = !!KT.vw, w = (KT.res && KT.res.waarschuwingen) || [];
    const fouten = w.filter(x => x.niveau === 'fout').length;
    const tekening = KT.basis ? esc(KT.basis) : 'Geen tekening geladen';
    const knop = (icoon, tekst, actie, extra, tip) => `<button class="balkknop ${extra || ''}" title="${esc(tip || tekst)}" onclick="${actie}">${ICOON[icoon]}<span>${esc(tekst)}</span></button>`;
    return `<div class="merk"><span class="logo-blok"></span><div><div class="merknaam">Kabeltool</div>
        <div class="tekeningnaam" title="${tekening}">${tekening}${metVw ? '' : ' · zonder Vectorworks'}</div></div></div>
      <div class="balk-acties">
        ${metVw ? knop('verversen', 'Verversen', 'KT.vw.ververs()', '', 'Tekening opnieuw inlezen') + knop('bijwerken', 'Tekening bijwerken', "KT.vw.actie('bijwerken')", 'primair', 'Labels en 3D-kabels opnieuw tekenen')
          + knop('stempelen', 'Stempelen', "KT.vw.actie('stempelen')", '', 'Multinummer, circuit, LK/VEAM en poort in de Spotlight-velden')
          : knop('demo', 'Demo', 'KT.ui.demo()', 'primair') + knop('map', 'Map van tekening…', 'KT.ui.kiesMap()') + knop('verversen', 'Verversen', 'KT.ui.ververs()')}
        <span class="waarsch-teller ${fouten ? 'rood' : w.length ? 'oranje' : 'groen'}" title="Waarschuwingen" onclick="KT.ui.tabblad('waarsch')">
          ${ICOON[fouten ? 'fout' : w.length ? 'letop' : 'ok']}${w.length}</span>
        <div class="menu"><button class="balkknop icoon" title="Meer" onclick="KT.ui.menu(event)">${ICOON.meer}</button></div>
      </div>`;
  }
  ui.menu = function (e) {
    e.stopPropagation();
    const oud = document.querySelector('.menu-lijst');
    if (oud) { oud.remove(); return; }
    const items = KT.vw ? [
      ['Truss-diagnose (selectie)', 'KT.vw.diagnose()'], ['Lagen opruimen…', 'KT.vw.opruimen()'], ['Demo-show maken', "KT.vw.actie('demo')"],
      ['—'], ['Bibliotheekmap kiezen…', 'KT.ui.kiesBib()'], ['Projectbestand downloaden', "KT.download((KT.basis||'project')+'.kt-project.json',KT.projectBestand())"],
    ] : [['Bibliotheekmap kiezen…', 'KT.ui.kiesBib()'], ['Bestand inlezen…', "document.getElementById('bestandIn').click()"],
      ['Projectbestand downloaden', "KT.download((KT.basis||'project')+'.kt-project.json',KT.projectBestand())"]];
    const m = document.createElement('div');
    m.className = 'menu-lijst';
    m.innerHTML = items.map(([t, a]) => t === '—' ? '<hr>' : `<button onclick="document.querySelector('.menu-lijst').remove();${a}">${esc(t)}</button>`).join('');
    e.target.closest('.menu').appendChild(m);
    setTimeout(() => document.addEventListener('click', function weg() { m.remove(); document.removeEventListener('click', weg); }), 0);
  };

  // ---------- kolom: tools ----------
  function rTools() {
    if (!KT.vw) return '';
    const tool = (icoon, tekst, actie, tip) => `<button class="tool" title="${esc(tip)}" onclick="${actie}">${ICOON[icoon]}<span>${esc(tekst)}</span></button>`;
    return `<div class="sectie"><div class="sectie-kop">Tekenen</div><div class="toolraster">
        ${tool('dimcity', 'Dim city', "KT.vw.tool('dimcity')", 'Eén klik: plaatst DB1, DB2 … op PP Infra')}
        ${tool('vloer', 'Vloerroute', "KT.vw.tool('vloer')", 'Klik vanaf de dim city naar de voet van de grote drop; dubbelklik = klaar')}
        ${tool('truss', 'Truss-lijn', "KT.vw.tool('truss')", 'Klik over de kabeltruss (eerste punt = begin); naam en hoogte in de modusbalk')}
        ${tool('drop', 'Drop', "KT.vw.tool('drop')", 'Klik 1 op de truss-lijn (kant = waar de muis staat), klik 2 bij het object; kies de class in de modusbalk')}
      </div>
      <div class="sectie-kop">Van selectie</div><div class="toolraster drie">
        ${tool('selectie', 'Vloerroute', "KT.vw.actie('vloer')", 'Geselecteerde lijn/polylijn wordt een vloerroute')}
        ${tool('selectie', 'Truss-lijn', 'KT.vw.trussVanSelectie()', 'Geselecteerde lijn/polylijn wordt een truss-lijn')}
        ${tool('lampen', 'Lampen', "KT.vw.actie('lampen')", 'Selecteer een drop en lampen: lampen koppelen aan die drop (alleen nodig als ze niet in de class van het eindpunt staan)')}
      </div></div>`;
  }

  // ---------- kolom: overzicht (dim city → drops) ----------
  function dropsVan(dcId) {
    const tk = KT.tekening || {}, res = KT.res;
    return (tk.drops || []).filter(d => {
      const k = res.kabels.find(x => x.drop === d.id);
      if (k) return k.dc === dcId;
      const n = +String(d.id).replace(/\D/g, '') || 0, dcs = tk.dimcities || [];
      return dcs.length <= 1 ? dcId === (dcs[0] || {}).id : String(Math.floor(n / 100)) === String(dcId).replace(/\D/g, '');
    });
  }
  function rOverzicht() {
    const tk = KT.tekening || {}, res = KT.res, w = res.waarschuwingen;
    const dcs = tk.dimcities || [];
    const telW = id => w.filter(x => x.id === id);
    const regel = (id, tekst, sub, soort) => {
      const ww = telW(id), f = ww.some(x => x.niveau === 'fout');
      return `<div class="boom-regel ${soort} ${ui.sel === id ? 'actief' : ''}" onclick="KT.ui.kies('sel','${esc(id)}')">
        <span class="stip"></span><span class="boom-naam">${esc(tekst)}</span><span class="boom-sub">${esc(sub || '')}</span>
        ${ww.length ? `<span class="mini ${f ? 'rood' : 'oranje'}">${ICOON[f ? 'fout' : 'letop']}</span>` : ''}</div>`;
    };
    const gezien = new Set();
    let html = dcs.map(dc => {
      const drops = dropsVan(dc.id);
      drops.forEach(d => gezien.add(d.id));
      const n = res.kabels.filter(k => k.dc === dc.id).length;
      return regel(dc.id, dc.naam || dc.id, n + ' kabels', 'dc') +
        `<div class="boom-kinderen">${drops.map(d => regel(d.id, d.id, KT.dropInst(d.id).naam || d.objectnaam || (d.doel && d.doel.klasse) || '', 'dr')).join('') || '<div class="leeg">geen drops</div>'}</div>`;
    }).join('');
    const los = (tk.drops || []).filter(d => !gezien.has(d.id));
    if (los.length) html += `<div class="boom-groep">Zonder dim city</div>` + los.map(d => regel(d.id, d.id, KT.dropInst(d.id).naam || '', 'dr')).join('');
    if (!html) html = `<div class="leeg">${KT.vw ? 'Klik op Verversen om de tekening te laden, of begin met de tool Dim city.' : 'Klik op Demo om de palette te proberen.'}</div>`;
    return `<div class="sectie"><div class="sectie-kop">Overzicht</div><div class="boom">${html}</div></div>`;
  }

  // ---------- kolom: inspector ----------
  function rInspector() {
    const tk = KT.tekening || {};
    const dc = (tk.dimcities || []).find(d => d.id === ui.sel), dr = (tk.drops || []).find(d => d.id === ui.sel);
    if (dr) return rDropInspector(dr);
    if (dc) {
      const ks = KT.res.kabels.filter(k => k.dc === dc.id);
      const perType = {};
      ks.forEach(k => { perType[k.type.kort] = (perType[k.type.kort] || 0) + 1; });
      return `<div class="sectie inspector"><div class="sectie-kop"><span class="badge dc">${esc(dc.naam || dc.id)}</span> Dim city</div>
        <dl class="feiten"><dt>Kabels</dt><dd>${ks.length}${Object.keys(perType).length ? ' (' + Object.entries(perType).map(([k, n]) => n + '× ' + k).join(', ') + ')' : ''}</dd>
        <dt>Drops</dt><dd>${dropsVan(dc.id).length}</dd>
        <dt>Meters kabel</dt><dd>${getal(ks.reduce((s, k) => s + k.totaal, 0), 0)} m</dd></dl>
        <button class="breed" onclick="KT.ui.tabblad('project')">Kabellijst van ${esc(dc.naam || dc.id)}</button></div>`;
    }
    return '';
  }
  function rDropInspector(d) {
    const di = KT.dropInst(d.id), eigen = KT.res.kabels.filter(k => k.drop === d.id), u = di._uitkomst || {};
    const T = KT.res.trussen[d.truss];
    const vorm = u.vorm || 'Boog', kant = u.kant || 'L';
    const ww = KT.res.waarschuwingen.filter(x => x.id === d.id);
    const looms = [...new Set([].concat(...eigen.map(k => k.type.lengtes.map(l => +l.m))))].filter(m => m >= 5).sort((a, b) => a - b);
    const gekozen = +di.droplengte > 0 ? +di.droplengte : (+d.droplengte > 0 ? +d.droplengte : 0);
    const slack = u.slack, nodig = u.nodig;
    return `<div class="sectie inspector"><div class="sectie-kop"><span class="badge dr">${esc(d.id)}</span> Drop op ${esc(T ? T.naam : d.truss)}${d.doel ? ' → ' + esc(d.doel.klasse) : ''}</div>
      <label>Naam in het label<input value="${esc(di.naam || d.objectnaam || '')}" placeholder="${esc((d.doel && d.doel.klasse) || 'bijv. LX01 HL')}" onchange="KT.ui.zetDrop('naam',this.value)"></label>
      <div class="veld"><span>Dropkant</span>${seg([['L', 'Links', 'Kabels zakken links van de looprichting van de truss'], ['R', 'Rechts', 'Kabels zakken rechts van de looprichting van de truss']], kant, "KT.ui.zetDrop('kant','$')")}</div>
      <div class="veld"><span>Dropvorm</span>${seg([['Boog', 'Boog', 'Nette boog, nooit lager dan het laagste punt'], ['Recht', 'Recht', 'Strakke lijn; de droplengte blijft bewaard'], ['Realistisch', 'Echt', 'Hangt door op de droplengte']], vorm, "KT.ui.zetDrop('vorm','$')")}</div>
      <div class="velden twee">
        <label>Droplengte<select onchange="KT.ui.zetDrop('droplengte',+this.value)"><option value="0" ${!gekozen ? 'selected' : ''}>automatisch</option>
          ${looms.map(m => `<option value="${m}" ${gekozen === m ? 'selected' : ''}>${getal(m)} m</option>`).join('')}</select></label>
        <label>Over de truss (m)<input type="number" step="0.5" min="0" value="${esc(di.slinger != null && di.slinger !== '' ? di.slinger : d.slingers)}" onchange="KT.ui.zetDrop('slinger',+this.value)"></label>
      </div>
      ${eigen.length ? `<dl class="feiten">
        <dt>Doelhoogte</dt><dd>${u.zDoel != null ? getal(u.zDoel) + ' m' : '–'}</dd>
        <dt>Nodig</dt><dd>${nodig != null ? getal(nodig) + ' m' : '–'}</dd>
        <dt>Droplengte</dt><dd>${[...new Set(eigen.map(k => k.L))].map(m => getal(m) + ' m').join(', ')}</dd>
        <dt>Slack</dt><dd class="${slack < 0 ? 'rood' : ''}">${slack != null ? getal(slack) + ' m' : '–'}</dd></dl>` : ''}
      ${ww.length ? `<div class="meldingen">${ww.map(x => `<div class="melding ${x.niveau === 'fout' ? 'rood' : 'oranje'}">${ICOON[x.niveau === 'fout' ? 'fout' : 'letop']}<span>${esc(x.tekst)}</span></div>`).join('')}</div>`
        : eigen.length ? `<div class="melding groen">${ICOON.ok}<span>Drop klopt${KT.project.instellingen.bouwcheck !== false ? ', ook op bouwhoogte' : ''}.</span></div>` : ''}
      <div class="sectie-kop klein">Kabels${d.doel ? ' (uit de blokken in ' + esc(d.doel.klasse) + ')' : ''}</div>
      <div class="kabels-mini">${eigen.map(k => `<div>${KT.symboolSVG(k.type.kort, k.L, k.nr, 18, k.type)}</div>`).join('') || '<div class="leeg">Geen kabels</div>'}</div>
      ${d.doel ? '' : rOudeBehoefte(d, di)}
      <button class="breed" onclick="KT.ui.tabblad('project')">Kabels en lampen van ${esc(d.id)}</button></div>`;
  }
  // drops van vóór de eindpunten: kabels met de hand opgeven
  function rOudeBehoefte(d, di) {
    const types = KT.alleTypes();
    return `<div class="sectie-kop klein">Wat heeft dit object nodig (oude drop zonder eindpunt)</div>
      ${di.behoefte.map((b, i) => `<div class="behoefte">
        <select onchange="KT.ui.zetBehoefte(${i},'type',this.value)">${opties(types, b.type)}</select>
        <input type="number" min="1" value="${esc(b.aantal)}" title="aantal" onchange="KT.ui.zetBehoefte(${i},'aantal',+this.value)">
        <button title="weg" onclick="KT.ui.wegBehoefte(${i})">×</button></div>`).join('')}
      <button onclick="KT.ui.behoefteErbij()">+ kabel</button>`;
  }

  // ---------- tabblad Kabels ----------
  const stukTekst = k => k.stukken.map(s => getal(s.m)).join(' + ') + ' m';
  function kabelTabel(lijst, metNummerInvoer) {
    const z = ui.zoek.toLowerCase();
    if (z) lijst = lijst.filter(k => [k.nr, k.type.naam, k.type.kort, k.drop, KT.dropInst(k.drop).naam].join(' ').toLowerCase().includes(z));
    if (!lijst.length) return '<div class="leeg">Geen kabels.</div>';
    return `<table class="lijst"><thead><tr><th>Kabel</th><th>Type</th><th>Drop</th><th>Stukken (drop → dim city)</th><th class="num">Totaal</th><th class="num">Slack drop</th></tr></thead><tbody>
      ${lijst.map(k => `<tr class="${ui.sel === k.drop ? 'actief' : ''}" onclick="KT.ui.kies('sel','${esc(k.drop)}')">
        <td>${metNummerInvoer && !k.blok ? `<input class="nr" value="${esc(k.nr)}" ${KT.project.slot ? 'disabled' : ''} onclick="event.stopPropagation()" onchange="KT.ui.zetNummer('${esc(k.sleutel)}',this.value)">` : KT.symboolSVG(k.type.kort, k.L, k.nr, 18, k.type)}</td>
        <td>${esc(k.type.naam)}</td><td>${esc(k.drop)}${KT.dropInst(k.drop).naam ? ' · ' + esc(KT.dropInst(k.drop).naam) : ''}</td>
        <td>${esc(stukTekst(k))}</td><td class="num">${getal(k.totaal)} m</td><td class="num ${k.slack < 0 ? 'rood' : ''}">${getal(k.slack)} m</td></tr>`).join('')}
      </tbody></table>`;
  }
  function rLampen(d) {
    const di = KT.dropInst(d.id), eigen = KT.res.kabels.filter(k => k.drop === d.id);
    const multis = eigen.filter(k => k.type.stempel === 'multi'), datas = eigen.filter(k => k.type.stempel === 'data');
    const lampen = KT.lampenVanDrop(d);
    const kies = (lijst, v, uuid, veld) => `<select onchange="KT.ui.zetLamp('${esc(uuid)}','${veld}',+this.value)">${lijst.map((k, i) => `<option value="${i}" ${(+v || 0) === i ? 'selected' : ''}>${esc(k.nr)}</option>`).join('') || '<option>–</option>'}</select>`;
    if (!lampen.length) return '<div class="leeg">Geen lampen bij deze drop. Lampen in de class van het eindpunt horen er vanzelf bij; andere koppel je met "Lampen".</div>';
    return `<table class="lijst"><thead><tr><th>Lamp</th><th>Multi</th><th>Circuit</th><th>Data</th><th>Poort</th><th>Stempel</th></tr></thead><tbody>
      ${lampen.map(l => { const li = di.lampen[l.uuid] || {}; const m = multis[+li.multi || 0], dt = datas[+li.data || 0];
        return `<tr><td>${esc(l.naam || l.uuid)}</td><td>${kies(multis, li.multi, l.uuid, 'multi')}</td>
        <td><input class="nr" type="number" min="1" value="${esc(li.circuit)}" onchange="KT.ui.zetLamp('${esc(l.uuid)}','circuit',this.value)"></td>
        <td>${kies(datas, li.data, l.uuid, 'data')}</td>
        <td><input class="nr" type="number" min="1" value="${esc(li.poort)}" onchange="KT.ui.zetLamp('${esc(l.uuid)}','poort',this.value)"></td>
        <td class="stil">${esc((m ? m.nr + (li.circuit ? '.' + li.circuit : '') : '') + (dt ? '  ' + dt.nr + (li.poort ? '.' + li.poort : '') : ''))}</td></tr>`; }).join('')}</tbody></table>`;
  }
  function rProject() {
    const tk = KT.tekening || {}, res = KT.res;
    const dr = (tk.drops || []).find(d => d.id === ui.sel);
    const zoek = `<div class="werkbalk"><input class="zoek" type="search" placeholder="Zoek kabel, type of drop…" value="${esc(ui.zoek)}" oninput="KT.ui.zoeken(this.value)">
      <span class="stil">${res.kabels.length} kabels · ${getal(res.kabels.reduce((s, k) => s + k.totaal, 0), 0)} m</span>
      <button onclick="KT.ui.hernummer()" ${KT.project.slot ? 'disabled' : ''} title="Alleen voor kabels zonder blok">Opnieuw nummeren…</button></div>`;
    if (dr) return zoek + `<h3>${esc(dr.id)}${KT.dropInst(dr.id).naam ? ' – ' + esc(KT.dropInst(dr.id).naam) : ''}: kabels</h3>${kabelTabel(res.kabels.filter(k => k.drop === dr.id), true)}
      <h3>Lampen</h3>${rLampen(dr)}`;
    const perDc = (tk.dimcities || []).map(d => {
      const ks = res.kabels.filter(k => k.dc === d.id);
      return `<h3>${esc(d.naam || d.id)} <span class="stil">· ${ks.length} kabels</span></h3>${kabelTabel(ks, true)}`;
    }).join('');
    return zoek + (perDc || '<div class="leeg">Nog geen kabels. Plaats een drop met de tool Drop (klik 1 op de truss-lijn, klik 2 bij het object met blokken).</div>');
  }

  // ---------- tabblad Waarschuwingen ----------
  function rWaarsch() {
    const w = KT.res.waarschuwingen;
    const blokken = (KT.tekening && KT.tekening.blokken) || [];
    const lijst = w.length ? `<div class="meldingen groot">${w.map(x => `<div class="melding ${x.niveau === 'fout' ? 'rood' : 'oranje'} ${x.id ? 'klik' : ''}" ${x.id ? `onclick="KT.ui.kies('sel','${esc(x.id)}')"` : ''}>
        ${ICOON[x.niveau === 'fout' ? 'fout' : 'letop']}<span>${esc(x.tekst)}</span>${x.id ? `<span class="tag">${esc(x.id)}</span>` : ''}</div>`).join('')}</div>`
      : `<div class="melding groen">${ICOON.ok}<span>Geen waarschuwingen. Alle drops halen hun object${KT.project.instellingen.bouwcheck !== false ? ', ook op bouwhoogte' : ''}.</span></div>`;
    return `${lijst}
      <p class="stil">Rood = fout (te kort, koppelen in de lucht, dubbel nummer). Oranje = let op. Klik op een melding om de drop te kiezen.
      ${KT.project.instellingen.markeringen ? 'Markeringen in de tekening staan aan (Instellingen).' : 'Zet in Instellingen “Ook in de tekening” aan voor rode markeringen bij Tekening bijwerken.'}</p>
      <h3>Gevonden blokken <span class="stil">· ${blokken.length} op ${esc(KT.project.instellingen.laagInfra)}</span></h3>
      ${blokken.length ? `<table class="lijst"><thead><tr><th>Nummer</th><th>Class</th><th>Kabel</th><th>Gelezen uit</th><th>Symbool</th></tr></thead><tbody>
        ${blokken.map(b => { const t = KT.type(b.type); return `<tr><td><b>${esc(b.nummer)}</b></td><td>${esc(b.klasse)}</td><td>${t ? KT.symboolSVG(t.kort, 25, '', 16, t) + ' ' + esc(t.naam) : esc(b.type)}</td><td>${esc(b.bron)}</td><td class="stil">${esc(b.symbool || '')}</td></tr>`; }).join('')}</tbody></table>`
        : '<div class="leeg">Geen blokken met een nummer (M101, LK101, V101) gevonden.</div>'}`;
  }

  // ---------- tabblad Bibliotheek (kabeltypes + blokken) ----------
  function rBib() {
    const t = KT.type(ui.type);
    const links = KT.lib.families.map(f => `<details open><summary>${esc(f.naam)}
      <button class="mini-knop" title="Kabeltype toevoegen" onclick="event.preventDefault();KT.ui.typeErbij('${f.id}')">+</button></summary>
      ${f.types.map(x => `<div class="item ${x.id === ui.type ? 'actief' : ''}" onclick="KT.ui.kies('type','${x.id}')">${KT.symboolSVG(x.kort, 25, '', 14, x)} ${esc(x.naam)}</div>`).join('')}</details>`).join('') +
      `<button onclick="KT.ui.familieErbij()">+ familie</button>
       <p><button onclick="KT.ui.standaardBib()">Standaardbibliotheek terugzetten…</button></p>`;
    let rechts = '<div class="leeg">Kies links een kabeltype.</div>';
    if (t) {
      const fam = KT.lib.families.find(f => f.types.includes(t));
      const inp = (lbl, k) => `<label>${lbl}<input value="${esc(t[k])}" onchange="KT.ui.zetType('${k}',this.value)"></label>`;
      rechts = `<div class="velden">
        ${inp('Naam', 'naam')}${inp('Korte naam in symbool', 'kort')}${inp('Voorvoegsel nummer', 'voorvoegsel')}${inp('Connector', 'connector')}
        <label>Familie<select onchange="KT.ui.zetFamilie(this.value)">${opties(KT.lib.families, fam.id)}</select></label>
        <label>Diameter (mm, voor 3D)<input type="number" min="1" step="1" value="${esc(KT.diameter(t))}" onchange="KT.ui.zetType('diameter',+this.value)"></label>
        <label>Randkleur symbool<input type="color" value="${esc(t.kleur || '#000000')}" onchange="KT.ui.zetType('kleur',this.value)"></label>
        <label class="vink"><input type="checkbox" ${t.vet ? 'checked' : ''} onchange="KT.ui.zetType('vet',this.checked)"> Korte naam vet</label>
        <label>Stempelen als<select onchange="KT.ui.zetType('stempel',this.value)">
          ${[['', 'niet stempelen'], ['multi', 'multi (Circuit Name)'], ['data', 'data (User Field 2)']].map(o => `<option value="${o[0]}" ${t.stempel === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>
        </div>
        <h3>Lengtes</h3>
        <table class="lijst smal"><thead><tr><th>m</th><th>loom</th><th>kabels in loom</th><th></th></tr></thead><tbody>
        ${t.lengtes.map((l, i) => `<tr><td><input type="number" step="0.5" min="0" value="${esc(l.m)}" onchange="KT.ui.zetLengte(${i},'m',+this.value)"></td>
          <td><input type="checkbox" ${l.loom ? 'checked' : ''} onchange="KT.ui.zetLengte(${i},'loom',this.checked)"></td>
          <td><input type="number" min="1" value="${esc(l.aantal || 1)}" ${l.loom ? '' : 'disabled'} onchange="KT.ui.zetLengte(${i},'aantal',+this.value)"></td>
          <td><button onclick="KT.ui.wegLengte(${i})">×</button></td></tr>`).join('')}</tbody></table>
        <button onclick="KT.ui.lengteErbij()">+ lengte</button>
        <button class="gevaar" onclick="KT.ui.wegType()">Kabeltype verwijderen</button>
        <h3>Voorbeeld</h3>
        <div class="voorbeeld">${t.lengtes.map(l => KT.symboolSVG(t.kort, l.m, (t.voorvoegsel || t.kort) + '101', 26, t)).join('')}</div>`;
    }
    const types = KT.alleTypes();
    const blokken = `<h3>Blokken (naslag)</h3><p class="stil">De Kabeltool tekent geen blokken: jij plaatst je eigen blokken in ${esc(KT.project.instellingen.laagInfra)} en typt het nummer erin (M101, LK101, V101). Deze lijst is alleen naslag voor poorten.</p>
      <table class="lijst smal"><thead><tr><th>Naam</th><th>Kabel erin</th><th>Poorten</th><th>Kabel op poorten</th><th></th></tr></thead><tbody>
      ${KT.lib.blokken.map((b, i) => `<tr>
        <td><input value="${esc(b.naam)}" onchange="KT.ui.zetBlok(${i},'naam',this.value)"></td>
        <td><select onchange="KT.ui.zetBlok(${i},'ingang',this.value)">${opties(types, b.ingang)}</select></td>
        <td><input type="number" min="1" value="${esc(b.poorten)}" onchange="KT.ui.zetBlok(${i},'poorten',+this.value)"></td>
        <td><select onchange="KT.ui.zetBlok(${i},'uitgang',this.value)">${opties(types, b.uitgang)}</select></td>
        <td><button onclick="KT.ui.wegBlok(${i})">×</button></td></tr>`).join('')}</tbody></table>
      <button onclick="KT.ui.blokErbij()">+ blok</button>`;
    return `<div class="twee"><div class="links">${links}</div><div class="rechts">${rechts}${blokken}</div></div>`;
  }

  // ---------- tabblad Instellingen ----------
  function rInst() {
    const s = KT.project.instellingen;
    const v = (lbl, k, soort, tip) => `<label title="${esc(tip || '')}">${lbl}<input ${soort === 'n' ? 'type="number" step="any"' : ''} value="${esc(Array.isArray(s[k]) ? s[k].join(', ') : s[k])}" onchange="KT.ui.zetInst('${k}',this.value,'${soort || ''}')"></label>`;
    const vink = (lbl, k, standaardAan) => `<label class="vink"><input type="checkbox" ${(standaardAan ? s[k] !== false : !!s[k]) ? 'checked' : ''} onchange="KT.ui.zetInst('${k}',this.checked,'b')"> ${lbl}</label>`;
    const groep = (titel, inhoud, uitleg) => `<section class="groep-inst"><h3>${titel}</h3>${uitleg ? `<p class="stil">${uitleg}</p>` : ''}<div class="velden">${inhoud}</div></section>`;
    return groep('Tekening', `${v('Laag lampen', 'laagLampen')}${v('Laag infra (blokken, drops, labels)', 'laagInfra')}${v('Laag kabels', 'laagCabling')}${v('Laag 3D-kabels', 'laagKabels')}
        ${v('Klasseprefix (leeg = objectnaam)', 'prefix')}${v('Tolerantie aansluiten (m)', 'tolerantie', 'n', 'Hoe dicht een route bij de dim city of een andere route moet beginnen')}`,
        'Lampen van LX1 staan in de laag lampen, class LX1; de blokken van LX1 in de laag infra, class LX1.')
      + groep('Drops', `<label>Standaard dropvorm<select onchange="KT.ui.zetInst('dropVorm',this.value)">${['Boog', 'Recht', 'Realistisch'].map(x => `<option ${s.dropVorm === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        ${v('Looms voor drops (m)', 'dropLengtes', 'l')}${v('Slack bij dim city (m per kabel)', 'slackDimCity', 'n')}
        ${v('Bouwhoogte object (m)', 'bouwhoogte', 'n', 'Hoogte van het object tijdens de bouw; de kabeltruss hangt al op trim')}${vink('Bouwcheck (koppelen in de lucht)', 'bouwcheck', true)}
        ${v('Trussbreedte als de truss niet gevonden wordt (m)', 'trussBreedte', 'n')}`)
      + groep('Waarschuwingen', `${vink('Ook in de tekening (rode markering bij Tekening bijwerken)', 'markeringen')}`)
      + groep('Kabelsymbool', `${v('Breedte (mm op papier)', 'symboolBreedte', 'n')}${v('Hoogte (mm op papier)', 'symboolHoogte', 'n')}
        ${v('Dim city vierkant (m)', 'dimcityMaat', 'n')}${v('Dropsymbool (m)', 'dropSymbool', 'n')}${v('Lengtehulp-lengtes (m)', 'lengtehulpLengtes', 'l')}${vink('Lengtehulp tekenen', 'lengtehulp')}`)
      + `<section class="groep-inst"><h3>Kleur per lengte (magazijnkleurcode)</h3><div class="kleuren">
        ${Object.keys(s.lengteKleuren).sort((a, b) => a - b).map(m => `<div class="kleur"><input type="color" value="${esc(s.lengteKleuren[m])}" onchange="KT.ui.zetKleur('${esc(m)}',this.value)">
          <span>${esc(KT.lengteTekst(m))} m</span><button class="mini-knop" onclick="KT.ui.zetKleur('${esc(m)}',null)">×</button></div>`).join('')}
        <button onclick="KT.ui.kleurErbij()">+ lengte</button></div></section>`
      + groep('3D', `<label>Weergave<select onchange="KT.ui.zetInst('weergave3D',this.value)"><option value="echt" ${s.weergave3D !== 'basis' ? 'selected' : ''}>Echte vorm uit Vectorworks</option><option value="basis" ${s.weergave3D === 'basis' ? 'selected' : ''}>Basisweergave (zware tekeningen)</option></select></label>
        ${vink('Kabels als 3D-buis tekenen', 'kabels3D', true)}${vink('Ook lijn in bovenaanzicht', 'kabels2D', true)}
        ${v('Ruimte tussen kabels (m)', 'kabelAfstand', 'n')}
        <label>Kleur van de 3D-kabels<select onchange="KT.ui.zetInst('kleurKabels',this.value)"><option value="type" ${s.kleurKabels !== 'lengte' ? 'selected' : ''}>per kabeltype</option><option value="lengte" ${s.kleurKabels === 'lengte' ? 'selected' : ''}>per lengte (magazijnkleur)</option></select></label>
        ${v('Dikte kabels in de palette-3D (×)', 'kabelDikte3D', 'n')}${v('Hoogte dim city-kast (m)', 'dimcityKast', 'n')}`,
        'Basisweergave: geen echte vormen van trussen en lampen; sneller bij grote tekeningen. Na wijzigen: Verversen.')
      + groep('Trussen herkennen', `<label class="breed">Woorden in symboolnaam of map (komma's)<input value="${esc(s.trussWoorden)}" onchange="KT.ui.zetInst('trussWoorden',this.value)"></label>`,
        'Een symbool is een truss als de naam, de map in het hulpbronnenbeheer, de class of de laag een van deze woorden bevat. Klopt het niet? Selecteer een truss en kies Truss-diagnose (menu ⋯).')
      + `<section class="groep-inst"><h3>Bestanden</h3>
        <button onclick="KT.download('kabelbibliotheek.json',KT.lib)">Bibliotheek downloaden</button>
        <button onclick="KT.download((KT.basis||'project')+'.kt-project.json',KT.projectBestand())">Projectbestand downloaden</button>
        <label class="knop">Bestand inlezen…<input id="bestandIn" type="file" accept=".json" hidden onchange="KT.ui.leesIn(this.files[0])"></label></section>`;
  }

  // ---------- opbouw ----------
  function render() {
    if (!KT.res) KT.bereken();
    $('#balk').innerHTML = rBalk();
    $('#kolom-inhoud').innerHTML = rTools() + rOverzicht() + rInspector();
    const w = KT.res.waarschuwingen, f = w.filter(x => x.niveau === 'fout').length;
    document.querySelectorAll('#tabs > button').forEach(b => {
      b.classList.toggle('actief', b.dataset.tab === ui.tab);
      if (b.dataset.tab === 'waarsch') b.innerHTML = `Waarschuwingen${w.length ? `<span class="teller ${f ? 'rood' : 'oranje'}">${w.length}</span>` : ''}`;
    });
    $('#slot').checked = !!KT.project.slot;
    const el = $('#inhoud'), v = $('#drie');
    v.style.display = ui.tab === 'drie' ? 'flex' : 'none';
    el.style.display = ui.tab === 'drie' ? 'none' : 'block';
    if (ui.tab === 'drie') {
      try {
        if (KT.tekening !== laatsteTekening) { laatsteTekening = KT.tekening; viewer.ververs(); } else viewer.teken();
      } catch (e) {
        // de echte 3D lukt niet in deze omgeving: over op de eenvoudige canvas-weergave
        if (viewer && viewer.isGL) {
          $('#gl').style.display = 'none'; $('#canvas').style.display = 'block';
          viewer = KT.viewer($('#canvas'), $('#tip'), klikIn3D);
          KT.status('3D: eenvoudige weergave gebruikt (' + (e.message || e) + ')');
          viewer.ververs();
        } else throw e;
      }
      return;
    }
    const scroll = el.scrollTop;
    el.innerHTML = ui.tab === 'bib' ? rBib() : ui.tab === 'project' ? rProject() : ui.tab === 'waarsch' ? rWaarsch() : rInst();
    el.scrollTop = scroll;
  }

  // ---------- acties ----------
  const t = () => KT.type(ui.type);
  const di = () => KT.dropInst(ui.sel);
  let zoekTimer = null;
  Object.assign(ui, {
    render,
    tabblad(naam) { ui.tab = naam; render(); },
    kies(wat, id) { ui[wat] = id; if (wat === 'sel') { KT.project.selecteer = id; klaar(); } else render(); },
    zoeken(v) { ui.zoek = v; clearTimeout(zoekTimer); zoekTimer = setTimeout(() => { render(); const z = document.querySelector('.zoek'); if (z) { z.focus(); z.setSelectionRange(v.length, v.length); } }, 200); },
    // bibliotheek
    async familieErbij() { const naam = await KT.invoer('Naam van de familie?'); if (naam) { KT.lib.families.push({ id: KT.uid(), naam, types: [] }); klaar(); } },
    typeErbij(fid) {
      const x = { id: KT.uid(), naam: 'Nieuw type', kort: 'NEW', voorvoegsel: '', connector: '', lengtes: [{ m: 5, loom: false, aantal: 1 }], stempel: '' };
      KT.lib.families.find(f => f.id === fid).types.push(x); ui.type = x.id; klaar();
    },
    zetType(k, v) { t()[k] = v; klaar(); },
    async standaardBib() {
      if (!await KT.vraag('De kabelbibliotheek terugzetten naar de standaard (SOC, V12, V4, kleuren en diameters)?\nEigen kabeltypes en blokken gaan verloren.')) return;
      KT.lib = KT.standaardBibliotheek(); ui.type = null; klaar();
    },
    zetFamilie(fid) { const x = t(); KT.lib.families.forEach(f => { f.types = f.types.filter(y => y !== x); }); KT.lib.families.find(f => f.id === fid).types.push(x); klaar(); },
    async wegType() { const x = t(); if (!await KT.vraag(`Kabeltype "${x.naam}" verwijderen?`)) return; KT.lib.families.forEach(f => { f.types = f.types.filter(y => y !== x); }); ui.type = null; klaar(); },
    zetLengte(i, k, v) { t().lengtes[i][k] = v; if (k === 'loom' && !v) t().lengtes[i].aantal = 1; klaar(); },
    wegLengte(i) { t().lengtes.splice(i, 1); klaar(); },
    lengteErbij() { t().lengtes.push({ m: 10, loom: false, aantal: 1 }); klaar(); },
    zetBlok(i, k, v) { KT.lib.blokken[i][k] = v; klaar(); },
    wegBlok(i) { KT.lib.blokken.splice(i, 1); klaar(); },
    blokErbij() { const eerste = (KT.alleTypes()[0] || {}).id || ''; KT.lib.blokken.push({ id: KT.uid(), naam: 'Nieuw blok', ingang: eerste, poorten: 4, uitgang: eerste }); klaar(); },
    // drop
    zetDrop(k, v) { di()[k] = v; klaar(); },
    behoefteErbij() { di().behoefte.push({ id: KT.uid(), type: (KT.alleTypes()[0] || {}).id || '', aantal: 1, voorvoegsel: '', blok: '' }); klaar(); },
    zetBehoefte(i, k, v) { di().behoefte[i][k] = v; klaar(); },
    wegBehoefte(i) { di().behoefte.splice(i, 1); klaar(); },
    zetLamp(uuid, k, v) { const l = di().lampen; l[uuid] = l[uuid] || {}; l[uuid][k] = v; klaar(); },
    // nummers (alleen kabels zonder blok; bij blokken is het nummer in het blok leidend)
    async zetNummer(sleutel, nr) {
      const k = KT.res.kabels.find(x => x.sleutel === sleutel); nr = String(nr).trim();
      if (KT.project.slot || !k || !nr || nr === k.nr) { render(); return; }
      const dubbel = Object.entries(KT.project.nummers).some(([s, n]) => s !== sleutel && n.nr === nr);
      const lampen = KT.lampenVanDrop((KT.tekening.drops || []).find(d => d.id === k.drop) || { id: k.drop }).map(l => l.naam || l.uuid);
      const vraag = `Kabel ${k.nr} wordt ${nr}.` + (dubbel ? '\nLet op: dit nummer is al in gebruik.' : '') +
        `\nLampen die veranderen (${lampen.length}): ${lampen.join(', ') || 'geen'}\n\nDoorgaan?`;
      if (!await KT.vraag(vraag)) { render(); return; }
      KT.project.nummers[sleutel] = { nr, handmatig: true }; klaar();
    },
    async hernummer() {
      if (KT.project.slot) return;
      const n = KT.res.kabels.filter(k => !k.handmatig && !k.blok).length;
      if (!n) { KT.status('Alle kabels krijgen hun nummer uit de blokken; er is niets om opnieuw te nummeren.'); return; }
      if (!await KT.vraag(`${n} automatische nummers (kabels zonder blok) worden opnieuw uitgedeeld.\n\nDoorgaan?`)) return;
      Object.keys(KT.project.nummers).forEach(s => { if (!KT.project.nummers[s].handmatig) delete KT.project.nummers[s]; });
      klaar();
    },
    zetSlot(aan) { KT.project.slot = aan; klaar(); },
    // instellingen
    zetInst(k, v, soort) {
      const s = KT.project.instellingen;
      s[k] = soort === 'n' ? (+String(v).replace(',', '.') || 0) : soort === 'b' ? !!v : soort === 'l' ? String(v).split(/[;,\s]+/).map(x => +x.replace(',', '.')).filter(x => x > 0) : v;
      klaar();
    },
    zetKleur(m, kleur) { const c = KT.project.instellingen.lengteKleuren; if (kleur) c[m] = kleur; else delete c[m]; klaar(); },
    async kleurErbij() { const m = await KT.invoer('Lengte in meters?'); if (m && +m.replace(',', '.') > 0) { KT.project.instellingen.lengteKleuren[String(+m.replace(',', '.'))] = '#9e9e9e'; klaar(); } },
    // bestanden
    async kiesMap() { try { await KT.kiesTekeningMap(); } catch (e) { return; } ui.sel = (KT.tekening.selectie || [])[0] || null; klaar(); },
    async kiesBib() { try { await KT.kiesBibMap(); } catch (e) { return; } klaar(); },
    async ververs() { await KT.ververs(); const s = (KT.tekening.selectie || [])[0]; if (s) ui.sel = s; klaar(); },
    async leesIn(bestand) { if (bestand) { await KT.importeer(bestand); klaar(); } },
    demo() { KT.laadDemo(); ui.sel = 'D101'; klaar(); },
  });

  window.addEventListener('DOMContentLoaded', () => {
    KT.laadLokaal();
    let gl = null;
    try { gl = KT.viewerGL && KT.viewerGL($('#gl'), $('#tip'), klikIn3D); } catch (e) { gl = null; }
    if (gl) { viewer = gl; viewer.isGL = true; }
    else {                                            // geen WebGL: eenvoudige 3D op een canvas
      $('#gl').style.display = 'none'; $('#canvas').style.display = 'block';
      viewer = KT.viewer($('#canvas'), $('#tip'), klikIn3D);
    }
    window.addEventListener('resize', () => { if (ui.tab === 'drie') viewer.teken(); });
    KT.bereken(); render();
  });
})();
