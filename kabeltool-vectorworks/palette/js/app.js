// Schermen van de palette.
(function () {
  const KT = window.KT;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ui = KT.ui = { tab: 'drie', type: null, sel: null };
  let viewer = null, laatsteTekening = null;
  const klikIn3D = id => { ui.sel = id; KT.project.selecteer = id; KT.opslaan().then(() => render()); };

  KT.status = t => { $('#status').textContent = t; };

  // Eigen vensters in plaats van confirm()/prompt(): die werken niet betrouwbaar in de web palette van Vectorworks.
  function venster(tekst, metInvoer, standaard) {
    return new Promise(klaarMet => {
      const bg = document.createElement('div');
      bg.className = 'venster-bg';
      bg.innerHTML = `<div class="venster"><p></p>${metInvoer ? '<input>' : ''}
        <div class="knoppen"><button data-k="nee">Annuleren</button><button data-k="ja">OK</button></div></div>`;
      bg.querySelector('p').textContent = tekst;
      const inp = bg.querySelector('input');
      if (inp) inp.value = standaard == null ? '' : standaard;
      const sluit = ja => { bg.remove(); klaarMet(metInvoer ? (ja ? inp.value : null) : ja); };
      bg.querySelector('[data-k="ja"]').onclick = () => sluit(true);
      bg.querySelector('[data-k="nee"]').onclick = () => sluit(false);
      bg.addEventListener('keydown', e => { if (e.key === 'Enter') sluit(true); if (e.key === 'Escape') sluit(false); });
      document.body.appendChild(bg);
      (inp || bg.querySelector('[data-k="ja"]')).focus();
    });
  }
  KT.vraag = tekst => venster(tekst, false);
  KT.invoer = (tekst, standaard) => venster(tekst, true, standaard);
  async function klaar() { await KT.opslaan(); render(); }
  const opties = (lijst, gekozen, leeg) => (leeg != null ? `<option value="">${esc(leeg)}</option>` : '') +
    lijst.map(o => `<option value="${esc(o.id)}" ${o.id === gekozen ? 'selected' : ''}>${esc(o.naam)}</option>`).join('');

  // ---------- Bibliotheek ----------
  function rBib() {
    const t = KT.type(ui.type);
    const links = KT.lib.families.map(f => `<details open><summary>${esc(f.naam)}
      <button title="Kabeltype toevoegen" onclick="event.preventDefault();KT.ui.typeErbij('${f.id}')">+</button></summary>
      ${f.types.map(x => `<div class="item ${x.id === ui.type ? 'actief' : ''}" onclick="KT.ui.kies('type','${x.id}')">${esc(x.naam)}</div>`).join('')}</details>`).join('') +
      `<button onclick="KT.ui.familieErbij()">+ familie</button>
       <p><button onclick="KT.ui.standaardBib()">Standaardbibliotheek terugzetten…</button></p>`;
    let rechts = '<p class="stil">Kies links een kabeltype.</p>';
    if (t) {
      const fam = KT.lib.families.find(f => f.types.includes(t));
      const inp = (lbl, k) => `<label>${lbl}<input value="${esc(t[k])}" onchange="KT.ui.zetType('${k}',this.value)"></label>`;
      rechts = `<div class="velden">
        ${inp('Naam', 'naam')}${inp('Korte naam in symbool', 'kort')}${inp('Voorvoegsel nummer', 'voorvoegsel')}${inp('Connector', 'connector')}
        <label>Familie<select onchange="KT.ui.zetFamilie(this.value)">${opties(KT.lib.families, fam.id)}</select></label>
        <label>Diameter (mm, voor 3D)<input type="number" min="1" step="1" value="${esc(KT.diameter(t))}" onchange="KT.ui.zetType('diameter',+this.value)"></label>
        <label>Randkleur symbool / 3D<input type="color" value="${esc(t.kleur || '#000000')}" onchange="KT.ui.zetType('kleur',this.value)"></label>
        <label class="slot"><input type="checkbox" ${t.vet ? 'checked' : ''} onchange="KT.ui.zetType('vet',this.checked)"> Korte naam vet</label>
        <label>Stempelen als<select onchange="KT.ui.zetType('stempel',this.value)">
          ${[['', 'niet stempelen'], ['multi', 'multi (Circuit Name)'], ['data', 'data (User Field 2)']].map(o => `<option value="${o[0]}" ${t.stempel === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>
        </div>
        <h3>Lengtes</h3>
        <table><tr><th>m</th><th>loom</th><th>kabels in loom</th><th></th></tr>
        ${t.lengtes.map((l, i) => `<tr><td><input type="number" step="0.5" min="0" value="${esc(l.m)}" onchange="KT.ui.zetLengte(${i},'m',+this.value)"></td>
          <td><input type="checkbox" ${l.loom ? 'checked' : ''} onchange="KT.ui.zetLengte(${i},'loom',this.checked)"></td>
          <td><input type="number" min="1" value="${esc(l.aantal || 1)}" ${l.loom ? '' : 'disabled'} onchange="KT.ui.zetLengte(${i},'aantal',+this.value)"></td>
          <td><button onclick="KT.ui.wegLengte(${i})">×</button></td></tr>`).join('')}</table>
        <button onclick="KT.ui.lengteErbij()">+ lengte</button>
        <button class="gevaar" onclick="KT.ui.wegType()">Kabeltype verwijderen</button>
        <h3>Voorbeeld</h3>
        <div class="voorbeeld">${t.lengtes.map(l => KT.symboolSVG(t.kort, l.m, (t.voorvoegsel || t.kort) + '101', 26, t)).join('')}</div>`;
    }
    return `<div class="twee"><div class="links">${links}</div><div class="rechts">${rechts}</div></div>`;
  }

  // ---------- Blokken ----------
  function rBlokken() {
    const types = KT.alleTypes();
    return `<table><tr><th>Naam</th><th>Kabel erin</th><th>Poorten</th><th>Kabel op poorten</th><th></th></tr>
      ${KT.lib.blokken.map((b, i) => `<tr>
        <td><input value="${esc(b.naam)}" onchange="KT.ui.zetBlok(${i},'naam',this.value)"></td>
        <td><select onchange="KT.ui.zetBlok(${i},'ingang',this.value)">${opties(types, b.ingang)}</select></td>
        <td><input type="number" min="1" value="${esc(b.poorten)}" onchange="KT.ui.zetBlok(${i},'poorten',+this.value)"></td>
        <td><select onchange="KT.ui.zetBlok(${i},'uitgang',this.value)">${opties(types, b.uitgang)}</select></td>
        <td><button onclick="KT.ui.wegBlok(${i})">×</button></td></tr>`).join('')}</table>
      <button onclick="KT.ui.blokErbij()">+ blok</button>
      <p class="stil">Blokken worden in Vectorworks op de infra-laag gezet, in de klasse van de truss.</p>`;
  }

  // ---------- Project ----------
  const stukTekst = k => k.stukken.map(s => KT.lengteTekst(s.m)).join(' + ') + ' m';
  function kabelTabel(lijst, metInvoer) {
    if (!lijst.length) return '<p class="stil">Geen kabels.</p>';
    return `<table><tr><th>Nummer</th><th>Type</th><th>Stukken (drop → dim city)</th><th>Totaal</th><th>Drop</th></tr>
      ${lijst.map(k => `<tr><td>${metInvoer ? `<input class="nr" value="${esc(k.nr)}" ${KT.project.slot ? 'disabled' : ''} onchange="KT.ui.zetNummer('${esc(k.sleutel)}',this.value)">${k.handmatig ? ' ✎' : ''}` : esc(k.nr)}</td>
        <td>${KT.symboolSVG(k.type.kort, k.stukken[0].m, '', 18, k.type)} ${esc(k.type.naam)}</td><td>${esc(stukTekst(k))}</td><td>${k.totaal} m</td>
        <td>${esc(KT.dropInst(k.drop).naam || k.drop)}</td></tr>`).join('')}</table>`;
  }
  // Kolom: instellingen van de geselecteerde drop
  function rDropKolom(d) {
    const di = KT.dropInst(d.id), types = KT.alleTypes();
    return `<div class="kaart"><h4><span class="chip dr actief" style="cursor:default">${esc(d.id)}</span> Drop op ${esc(d.truss)}</h4>
      <div class="velden">
        <label style="grid-column:span 2">Objectnaam<input value="${esc(di.naam)}" placeholder="bijv. LX01 US HL" onchange="KT.ui.zetDrop('naam',this.value)"></label>
        <label>Valhoogte (m)<input type="number" step="0.1" value="${esc(di.valhoogte)}" placeholder="tot vloer" onchange="KT.ui.zetDrop('valhoogte',this.value)"></label>
        <label>Slingers (m)<input type="number" step="0.5" value="${esc(di.slinger)}" onchange="KT.ui.zetDrop('slinger',+this.value)"></label>
      </div>
      <div class="groep-titel" style="margin-left:0">Wat heeft dit object nodig</div>
      ${di.behoefte.map((b, i) => `<div class="behoefte">
        <select onchange="KT.ui.zetBehoefte(${i},'type',this.value)">${opties(types, b.type)}</select>
        <input type="number" min="1" value="${esc(b.aantal)}" title="aantal" onchange="KT.ui.zetBehoefte(${i},'aantal',+this.value)">
        <select title="blok" onchange="KT.ui.zetBehoefte(${i},'blok',this.value)">${opties(KT.lib.blokken, b.blok, 'geen blok')}</select>
        <button title="weg" onclick="KT.ui.wegBehoefte(${i})">×</button></div>`).join('')}
      <button onclick="KT.ui.behoefteErbij()">+ kabel</button>
      <button onclick="KT.ui.tabblad('project')">Kabels en lampen…</button></div>`;
  }
  // Tabblad Kabels: kabels en lampen van de geselecteerde drop
  function rDrop(d) {
    const di = KT.dropInst(d.id), eigen = KT.res.kabels.filter(k => k.drop === d.id);
    const multis = eigen.filter(k => k.type.stempel === 'multi'), datas = eigen.filter(k => k.type.stempel === 'data');
    const lampen = (KT.tekening.lampen || []).filter(l => l.drop === d.id);
    const kies = (lijst, v, uuid, veld) => `<select onchange="KT.ui.zetLamp('${esc(uuid)}','${veld}',+this.value)">${lijst.map((k, i) => `<option value="${i}" ${(+v || 0) === i ? 'selected' : ''}>${esc(k.nr)}</option>`).join('') || '<option>–</option>'}</select>`;
    return `<h3>Drop ${esc(d.id)}${di.naam ? ' – ' + esc(di.naam) : ''}: kabels</h3>${kabelTabel(eigen, true)}
      <h3>Lampen (${lampen.length})</h3>
      ${lampen.length ? `<table><tr><th>Lamp</th><th>Multi</th><th>Circuit</th><th>Data</th><th>Poort</th><th>Wordt</th></tr>
        ${lampen.map(l => { const li = di.lampen[l.uuid] || {}; const m = multis[+li.multi || 0], dt = datas[+li.data || 0];
          return `<tr><td>${esc(l.naam || l.uuid)}</td><td>${kies(multis, li.multi, l.uuid, 'multi')}</td>
          <td><input class="nr" type="number" min="1" value="${esc(li.circuit)}" onchange="KT.ui.zetLamp('${esc(l.uuid)}','circuit',this.value)"></td>
          <td>${kies(datas, li.data, l.uuid, 'data')}</td>
          <td><input class="nr" type="number" min="1" value="${esc(li.poort)}" onchange="KT.ui.zetLamp('${esc(l.uuid)}','poort',this.value)"></td>
          <td>${esc((m ? m.nr + (li.circuit ? '.' + li.circuit : '') : '') + (dt ? '  ' + dt.nr + (li.poort ? '.' + li.poort : '') : ''))}</td></tr>`; }).join('')}</table>`
        : '<p class="stil">Nog geen lampen gekoppeld. Selecteer in Vectorworks de drop en de lampen en klik op "Lampen koppelen".</p>'}`;
  }
  function rDimcity(dc) {
    const lijst = KT.res.kabels.filter(k => k.dc === dc.id);
    const voorv = [...new Set(KT.alleTypes().filter(t => t.stempel).map(t => t.voorvoegsel).concat(['D']))];
    return `<h3>Dim city ${esc(dc.id)}</h3>
      <p>Eerstvolgende vrije nummers: ${voorv.map(v => `<b>${esc(KT.volgendVrij(dc.id, v))}</b>`).join(' · ')}</p>
      ${kabelTabel(lijst, false)}`;
  }
  function rProject() {
    const tk = KT.tekening, res = KT.res;
    const dc = (tk.dimcities || []).find(d => d.id === ui.sel), dr = (tk.drops || []).find(d => d.id === ui.sel);
    const waarsch = res.waarschuwingen.length ? `<div class="waarsch"><b>Let op</b><ul>${res.waarschuwingen.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    if (dc) return waarsch + rDimcity(dc);
    if (dr) return waarsch + rDrop(dr);
    const perDc = (tk.dimcities || []).map(d => `<h3>${esc(d.naam || d.id)} – ${res.kabels.filter(k => k.dc === d.id).length} kabels</h3>
      ${kabelTabel(res.kabels.filter(k => k.dc === d.id), false)}`).join('');
    return waarsch + (perDc || '<p class="stil">Nog geen kabels. Kies links een drop en geef aan wat hij nodig heeft.</p>') +
      `<p><button onclick="KT.ui.hernummer()" ${KT.project.slot ? 'disabled' : ''}>Opnieuw nummeren…</button></p>`;
  }

  // ---------- Kolom: tools en selectie ----------
  const ICOON = {
    dimcity: '<svg viewBox="0 0 18 18"><rect x="3" y="3" width="12" height="12" rx="1.5" fill="#ff3b30"/><path d="M6 7h6M6 10h6" stroke="#fff" stroke-width="1.4"/></svg>',
    vloer: '<svg viewBox="0 0 18 18" fill="none" stroke="#8fb8ff" stroke-width="1.8" stroke-linejoin="round"><path d="M2 15V8h7V3h7"/><circle cx="2" cy="15" r="1.6" fill="#8fb8ff"/></svg>',
    truss: '<svg viewBox="0 0 18 18" fill="none" stroke="#c9ced6" stroke-width="1.3"><path d="M1 6h16M1 12h16M2 12l3-6 3 6 3-6 3 6 3-6"/></svg>',
    drop: '<svg viewBox="0 0 18 18"><path d="M9 3v9" stroke="#33cc00" stroke-width="1.6" stroke-dasharray="2 2"/><circle cx="9" cy="4" r="3" fill="#33cc00"/><path d="M5 13h8v3H5z" fill="none" stroke="#33cc00" stroke-width="1.3"/></svg>',
    selectie: '<svg viewBox="0 0 18 18" fill="none" stroke="#c9ced6" stroke-width="1.4"><path d="M3 3h12v12H3z" stroke-dasharray="2 2"/><path d="M7 7l6 3-3 1-1 3z" fill="#c9ced6"/></svg>',
    lampen: '<svg viewBox="0 0 18 18"><circle cx="9" cy="7" r="4.5" fill="#ffd54f"/><path d="M7 12h4v3H7z" fill="#c9ced6"/></svg>',
    bijwerken: '<svg viewBox="0 0 18 18" fill="none" stroke="#8fb8ff" stroke-width="1.6"><rect x="2.5" y="4" width="9" height="6" rx="1"/><path d="M2.5 5.5h9" stroke="#33cc00" stroke-width="2"/><path d="M13 9l3 3-3 3"/></svg>',
    stempelen: '<svg viewBox="0 0 18 18" fill="#c9ced6"><path d="M7 2h4v5l3 2v2H4V9l3-2z"/><rect x="3" y="13" width="12" height="2" rx="1"/></svg>',
    verversen: '<svg viewBox="0 0 18 18" fill="none" stroke="#c9ced6" stroke-width="1.6"><path d="M15 9a6 6 0 1 1-2-4.5M15 3v4h-4"/></svg>',
    demo: '<svg viewBox="0 0 18 18"><path d="M5 3l10 6-10 6z" fill="#ff9500"/></svg>',
    map: '<svg viewBox="0 0 18 18" fill="none" stroke="#c9ced6" stroke-width="1.5"><path d="M2 5h5l2 2h7v8H2z"/></svg>',
  };
  const tool = (icoon, tekst, actie, extra) => `<button class="tool ${extra || ''}" onclick="${actie}">${ICOON[icoon]}${tekst}</button>`;
  function rTools() {
    if (KT.vw) return `<div class="groep-titel">Tekenen</div><div class="toolraster">
        ${tool('dimcity', 'Dim city', "KT.vw.tool('dimcity')")}${tool('drop', 'Drop', "KT.vw.tool('drop')")}
        ${tool('vloer', 'Vloerroute', "KT.vw.tool('vloer')")}${tool('truss', 'Truss-lijn', "KT.vw.tool('truss')")}</div>
      <div class="groep-titel">Van selectie</div><div class="toolraster">
        ${tool('selectie', 'Vloerroute', "KT.vw.actie('vloer')")}${tool('selectie', 'Truss-lijn', 'KT.vw.trussVanSelectie()')}
        ${tool('lampen', 'Lampen koppelen', "KT.vw.actie('lampen')", 'breed')}</div>
      <div class="groep-titel">Tekening</div><div class="toolraster">
        ${tool('bijwerken', 'Tekening bijwerken', "KT.vw.actie('bijwerken')", 'breed hoofd')}
        ${tool('stempelen', 'Stempelen', "KT.vw.actie('stempelen')")}${tool('verversen', 'Verversen', 'KT.vw.ververs()')}
        ${tool('demo', 'Demo-show maken', "KT.vw.actie('demo')", 'breed')}</div>`;
    return `<div class="groep-titel">Zonder Vectorworks</div><div class="toolraster">
        ${tool('demo', 'Demo', 'KT.ui.demo()', 'breed hoofd')}
        ${tool('map', 'Map van tekening', 'KT.ui.kiesMap()')}${tool('verversen', 'Verversen', 'KT.ui.ververs()')}
        ${tool('map', 'Bibliotheekmap', 'KT.ui.kiesBib()', 'breed')}</div>`;
  }
  function rSelectie() {
    const tk = KT.tekening || {};
    const chip = (id, tekst, soort) => `<span class="chip ${soort} ${ui.sel === id ? 'actief' : ''}" onclick="KT.ui.kies('sel','${esc(id)}')">${esc(tekst)}</span>`;
    const dc = (tk.dimcities || []).find(d => d.id === ui.sel), dr = (tk.drops || []).find(d => d.id === ui.sel);
    let detail = '<p class="stil" style="margin-top:10px">Klik op een dim city of drop (hier, in 3D of in Vectorworks).</p>';
    if (dr) detail = rDropKolom(dr);
    if (dc) {
      const voorv = [...new Set(KT.alleTypes().filter(t => t.stempel).map(t => t.voorvoegsel).concat(['D']))];
      detail = `<div class="kaart"><h4><span class="chip dc actief" style="cursor:default">${esc(dc.id)}</span> Dim city</h4>
        <div class="stil">${KT.res.kabels.filter(k => k.dc === dc.id).length} kabels</div>
        <div class="groep-titel" style="margin-left:0">Eerstvolgende vrije nummers</div>
        <div>${voorv.map(v => `<b>${esc(KT.volgendVrij(dc.id, v))}</b>`).join(' · ')}</div></div>`;
    }
    return `<div class="groep-titel">Dim cities</div><div class="lijstje">${(tk.dimcities || []).map(d => chip(d.id, d.naam || d.id, 'dc')).join('') || '<span class="stil">geen</span>'}</div>
      <div class="groep-titel">Drops</div><div class="lijstje">${(tk.drops || []).map(d => chip(d.id, d.id + (KT.dropInst(d.id).naam ? ' · ' + KT.dropInst(d.id).naam : ''), 'dr')).join('') || '<span class="stil">geen</span>'}</div>
      ${detail}`;
  }

  // ---------- Instellingen ----------
  function rInst() {
    const s = KT.project.instellingen;
    const v = (lbl, k, soort) => `<label>${lbl}<input ${soort === 'n' ? 'type="number" step="0.1"' : ''} value="${esc(Array.isArray(s[k]) ? s[k].join(', ') : s[k])}" onchange="KT.ui.zetInst('${k}',this.value,'${soort || ''}')"></label>`;
    return `<div class="velden">
      ${v('Klasseprefix', 'prefix')}${v('Slack bij dim city (m)', 'slackDimCity', 'n')}${v('Tolerantie aansluiten (m)', 'tolerantie', 'n')}
      ${v('Symbool breedte (mm op papier)', 'symboolBreedte', 'n')}${v('Symbool hoogte (mm op papier)', 'symboolHoogte', 'n')}${v('Dim city vierkant (m)', 'dimcityMaat', 'n')}
      ${v('Laag bekabeling', 'laagCabling')}${v('Laag infra', 'laagInfra')}
      ${v('Trusshoogte bij "Truss-lijn van selectie" (m)', 'trussHoogte', 'n')}
      ${v('Hoogte dim city-kast in 3D (m)', 'dimcityKast', 'n')}${v('Dropsymbool (m)', 'dropSymbool', 'n')}
      ${v('Looms voor drops (m)', 'dropLengtes', 'l')}${v('Lengtehulp-lengtes (m)', 'lengtehulpLengtes', 'l')}
      <label>Lengtehulp tekenen<input type="checkbox" ${s.lengtehulp ? 'checked' : ''} onchange="KT.ui.zetInst('lengtehulp',this.checked,'b')"></label>
      </div>
      <h3>3D-kabels</h3>
      <div class="velden">
      <label>Kabels als 3D-buis tekenen<input type="checkbox" ${s.kabels3D !== false ? 'checked' : ''} onchange="KT.ui.zetInst('kabels3D',this.checked,'b')"></label>
      <label>Ook lijn in bovenaanzicht<input type="checkbox" ${s.kabels2D !== false ? 'checked' : ''} onchange="KT.ui.zetInst('kabels2D',this.checked,'b')"></label>
      ${v('Laag voor de 3D-kabels', 'laagKabels')}${v('Ruimte tussen kabels (m)', 'kabelAfstand', 'n')}
      <label>Kleur van de kabels<select onchange="KT.ui.zetInst('kleurKabels',this.value)">
        <option value="lengte" ${s.kleurKabels !== 'type' ? 'selected' : ''}>per lengte (magazijnkleur)</option>
        <option value="type" ${s.kleurKabels === 'type' ? 'selected' : ''}>per kabeltype</option></select></label>
      </div>
      <h3>Kleur per lengte (placeholder voor de magazijnkleurcode)</h3>
      <table><tr><th>m</th><th>kleur</th><th></th></tr>
      ${Object.keys(s.lengteKleuren).sort((a, b) => a - b).map(m => `<tr><td>${esc(KT.lengteTekst(m))}</td>
        <td><input type="color" value="${esc(s.lengteKleuren[m])}" onchange="KT.ui.zetKleur('${esc(m)}',this.value)"></td>
        <td><button onclick="KT.ui.zetKleur('${esc(m)}',null)">×</button></td></tr>`).join('')}</table>
      <button onclick="KT.ui.kleurErbij()">+ lengte</button>
      <h3>Bestanden</h3>
      <button onclick="KT.download('kabelbibliotheek.json',KT.lib)">Bibliotheek downloaden</button>
      <button onclick="KT.download((KT.basis||'project')+'.kt-project.json',KT.projectBestand())">Projectbestand downloaden</button>
      <label class="knop">Bestand inlezen…<input type="file" accept=".json" hidden onchange="KT.ui.leesIn(this.files[0])"></label>`;
  }

  function render() {
    if (!KT.res) KT.bereken();
    $('#tools').innerHTML = rTools();
    $('#selectie').innerHTML = rSelectie();
    $('#bestand').textContent = KT.basis ? KT.basis + (KT.vw ? '' : ' (zonder Vectorworks)') : 'Geen tekening geladen';
    document.querySelectorAll('#tabs > button').forEach(b => b.classList.toggle('actief', b.dataset.tab === ui.tab));
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
    el.innerHTML = ui.tab === 'bib' ? rBib() : ui.tab === 'blokken' ? rBlokken() : ui.tab === 'project' ? rProject() : rInst();
  }

  // ---------- Acties ----------
  const t = () => KT.type(ui.type);
  const di = () => KT.dropInst(ui.sel);
  Object.assign(ui, {
    render,
    tabblad(naam) { ui.tab = naam; render(); },
    kies(wat, id) { ui[wat] = id; if (wat === 'sel') { KT.project.selecteer = id; klaar(); } else render(); },
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
    // blokken
    zetBlok(i, k, v) { KT.lib.blokken[i][k] = v; klaar(); },
    wegBlok(i) { KT.lib.blokken.splice(i, 1); klaar(); },
    blokErbij() { const eerste = (KT.alleTypes()[0] || {}).id || ''; KT.lib.blokken.push({ id: KT.uid(), naam: 'Nieuw blok', ingang: eerste, poorten: 4, uitgang: eerste }); klaar(); },
    // drop
    zetDrop(k, v) { di()[k] = v; klaar(); },
    behoefteErbij() { di().behoefte.push({ id: KT.uid(), type: (KT.alleTypes()[0] || {}).id || '', aantal: 1, voorvoegsel: '', blok: '' }); klaar(); },
    zetBehoefte(i, k, v) { di().behoefte[i][k] = v; klaar(); },
    wegBehoefte(i) { di().behoefte.splice(i, 1); klaar(); },
    zetLamp(uuid, k, v) { const l = di().lampen; l[uuid] = l[uuid] || {}; l[uuid][k] = v; klaar(); },
    // nummers
    async zetNummer(sleutel, nr) {
      const k = KT.res.kabels.find(x => x.sleutel === sleutel); nr = String(nr).trim();
      if (KT.project.slot || !k || !nr || nr === k.nr) { render(); return; }
      const dubbel = Object.entries(KT.project.nummers).some(([s, n]) => s !== sleutel && n.nr === nr);
      const lampen = (KT.tekening.lampen || []).filter(l => l.drop === k.drop).map(l => l.naam || l.uuid);
      const vraag = `Kabel ${k.nr} wordt ${nr}.` + (dubbel ? '\nLet op: dit nummer is al in gebruik.' : '') +
        `\nLampen die veranderen (${lampen.length}): ${lampen.join(', ') || 'geen'}\n\nDoorgaan?`;
      if (!await KT.vraag(vraag)) { render(); return; }
      KT.project.nummers[sleutel] = { nr, handmatig: true }; klaar();
    },
    async hernummer() {
      if (KT.project.slot) return;
      const n = KT.res.kabels.filter(k => !k.handmatig).length, lampen = (KT.tekening.lampen || []).length;
      if (!await KT.vraag(`Alle ${n} automatische nummers worden opnieuw uitgedeeld (handmatige blijven staan).\nDit kan de stempeling van ${lampen} lampen veranderen.\n\nDoorgaan?`)) return;
      Object.keys(KT.project.nummers).forEach(s => { if (!KT.project.nummers[s].handmatig) delete KT.project.nummers[s]; });
      klaar();
    },
    zetSlot(aan) { KT.project.slot = aan; klaar(); },
    // instellingen
    zetInst(k, v, soort) {
      const s = KT.project.instellingen;
      s[k] = soort === 'n' ? (+v || 0) : soort === 'b' ? !!v : soort === 'l' ? String(v).split(/[;,\s]+/).map(x => +x.replace(',', '.')).filter(x => x > 0) : v;
      klaar();
    },
    zetKleur(m, kleur) { const c = KT.project.instellingen.lengteKleuren; if (kleur) c[m] = kleur; else delete c[m]; klaar(); },
    async kleurErbij() { const m = await KT.invoer('Lengte in meters?'); if (m && +m.replace(',', '.') > 0) { KT.project.instellingen.lengteKleuren[String(+m.replace(',', '.'))] = '#9e9e9e'; klaar(); } },
    // bestanden
    async kiesMap() { try { await KT.kiesTekeningMap(); } catch (e) { return; } ui.sel = (KT.tekening.selectie || [])[0] || null; ui.tab = 'project'; klaar(); },
    async kiesBib() { try { await KT.kiesBibMap(); } catch (e) { return; } klaar(); },
    async ververs() { await KT.ververs(); const s = (KT.tekening.selectie || [])[0]; if (s) ui.sel = s; klaar(); },
    async leesIn(bestand) { if (bestand) { await KT.importeer(bestand); klaar(); } },
    demo() { KT.laadDemo(); ui.sel = 'D1'; ui.tab = 'project'; klaar(); },
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
