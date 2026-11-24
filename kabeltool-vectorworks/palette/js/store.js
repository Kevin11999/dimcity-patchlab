// Gegevens bewaren: werkkopie in de browser + bestanden naast de tekening / in de bibliotheekmap.
(function () {
  const KT = window.KT;
  const LS = 'kabeltool-v1';

  KT.lib = null;        // kabel- en blokbibliotheek
  KT.project = null;    // instellingen, drop-instellingen, nummers (palette is eigenaar)
  KT.tekening = null;   // geometrie uit Vectorworks (Python is eigenaar)
  KT.res = null;        // uitkomst van KT.bereken()
  KT.mappen = { tekening: null, bib: null };
  KT.basis = '';        // bestandsnaam van de tekening zonder .vwx

  KT.uid = () => Math.random().toString(36).slice(2, 8);
  KT.nieuwProject = () => ({ versie: 1, slot: false, instellingen: KT.standaardInstellingen(), dropinst: {}, nummers: {}, selecteer: '' });
  KT.legeTekening = () => ({ versie: 1, dimcities: [], vloerroutes: [], trusslijnen: [], drops: [], lampen: [], selectie: [] });

  KT.alleTypes = () => KT.lib.families.flatMap(f => f.types);
  KT.type = id => KT.alleTypes().find(t => t.id === id) || null;
  KT.blok = id => KT.lib.blokken.find(b => b.id === id) || null;
  KT.dropInst = id => {
    const d = KT.project.dropinst;
    if (!d[id]) d[id] = { naam: '', valhoogte: '', slinger: 1, behoefte: [], lampen: {} };
    if (!d[id].lampen) d[id].lampen = {};
    return d[id];
  };

  function vulAan() {
    KT.lib = KT.werkBibBij(KT.lib || KT.standaardBibliotheek());
    KT.project = KT.project || KT.nieuwProject();
    KT.tekening = KT.tekening || KT.legeTekening();
    KT.project.instellingen = KT.werkInstellingenBij(Object.assign(KT.standaardInstellingen(), KT.project.instellingen || {}));
    KT.project.dropinst = KT.project.dropinst || {};
    KT.project.nummers = KT.project.nummers || {};
  }

  KT.laadLokaal = function () {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || 'null');
      if (s) { KT.lib = s.lib; KT.project = s.project; KT.tekening = s.tekening; KT.basis = s.basis || ''; }
    } catch (e) { /* lege start */ }
    vulAan();
  };

  async function schrijf(map, naam, obj) {
    const fh = await map.getFileHandle(naam, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(obj, null, 1));
    await w.close();
  }
  async function lees(map, naam) {
    try {
      const fh = await map.getFileHandle(naam);
      return JSON.parse(await (await fh.getFile()).text());
    } catch (e) { return null; }
  }

  // Wat Python leest: project + kopie van de bibliotheek + teken- en stempellijst.
  KT.projectBestand = () => Object.assign({}, KT.project, {
    bibliotheek: KT.lib,
    tekenlijst: KT.res.labels,
    kabelpaden: KT.res.kabelpaden,
    stempels: KT.res.stempels,
  });

  KT.opslaan = async function () {
    KT.bereken();
    try { localStorage.setItem(LS, JSON.stringify({ lib: KT.lib, project: KT.project, tekening: KT.tekening, basis: KT.basis })); } catch (e) { /* vol of geblokkeerd */ }
    try {
      if (KT.mappen.tekening && KT.basis) await schrijf(KT.mappen.tekening, KT.basis + '.kt-project.json', KT.projectBestand());
      if (KT.mappen.bib) await schrijf(KT.mappen.bib, 'kabelbibliotheek.json', KT.lib);
    } catch (e) { KT.status('Opslaan in bestand mislukt: ' + e.message); }
  };

  function neemProject(p) {
    const kopie = Object.assign({}, p);
    if (!KT.mappen.bib && p.bibliotheek) KT.lib = KT.werkBibBij(p.bibliotheek);   // kopie uit de tekening
    delete kopie.bibliotheek; delete kopie.tekenlijst; delete kopie.stempels; delete kopie.kabelpaden;
    KT.project = kopie;
  }

  KT.kiesTekeningMap = async function () {
    if (!window.showDirectoryPicker) { KT.status('Deze browser kan geen map openen. Gebruik Chrome/Edge of de knoppen Importeren/Exporteren.'); return; }
    const map = await window.showDirectoryPicker({ mode: 'readwrite' });
    const gevonden = [];
    for await (const [naam] of map.entries()) if (naam.endsWith('.kt-tekening.json')) gevonden.push(naam.replace('.kt-tekening.json', ''));
    if (!gevonden.length) { KT.status('Geen .kt-tekening.json in deze map. Draai eerst "Exporteren" in Vectorworks.'); return; }
    let basis = gevonden[0];
    if (gevonden.length > 1) {
      const k = await KT.invoer('Welke tekening?\n' + gevonden.map((g, i) => (i + 1) + ': ' + g).join('\n'), '1');
      basis = gevonden[(parseInt(k, 10) || 1) - 1] || gevonden[0];
    }
    KT.mappen.tekening = map; KT.basis = basis;
    const p = await lees(map, basis + '.kt-project.json');
    if (p) neemProject(p); else KT.project = KT.nieuwProject();
    KT.tekening = (await lees(map, basis + '.kt-tekening.json')) || KT.legeTekening();
    vulAan();
    KT.status('Geopend: ' + basis);
  };

  KT.ververs = async function () {
    if (!KT.mappen.tekening || !KT.basis) { KT.status('Kies eerst de map van de tekening.'); return; }
    const t = await lees(KT.mappen.tekening, KT.basis + '.kt-tekening.json');
    if (t) { KT.tekening = t; KT.status('Ververst: ' + new Date().toLocaleTimeString()); } else KT.status('Tekeningbestand niet gevonden.');
  };

  KT.kiesBibMap = async function () {
    if (!window.showDirectoryPicker) { KT.status('Deze browser kan geen map openen.'); return; }
    const map = await window.showDirectoryPicker({ mode: 'readwrite' });
    KT.mappen.bib = map;
    const b = await lees(map, 'kabelbibliotheek.json');
    if (b && b.families) { KT.lib = KT.werkBibBij(b); KT.status('Bibliotheek geladen uit de map.'); } else KT.status('Nieuwe kabelbibliotheek.json wordt in deze map gezet.');
  };

  // Uitwijk zonder mappen: bestand inlezen / downloaden.
  KT.importeer = async function (bestand) {
    const o = JSON.parse(await bestand.text());
    if (o.families) KT.lib = o;
    else if (o.dimcities) { KT.tekening = o; KT.basis = KT.basis || bestand.name.replace('.kt-tekening.json', ''); }
    else if (o.instellingen) neemProject(o);
    else { KT.status('Onbekend bestand.'); return; }
    vulAan();
    KT.status('Ingelezen: ' + bestand.name);
  };
  KT.download = function (naam, obj) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
    a.download = naam; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  KT.laadDemo = function () {
    KT.mappen.tekening = null; KT.basis = 'demo';
    KT.tekening = {
      versie: 1,
      dimcities: [{ id: 'DB1', nr: 1, naam: 'DB1', x: 0, y: 0, z: 0, maat: 1, kast: 2, laag: 'Cabling' }, { id: 'DB2', nr: 2, naam: 'DB2', x: 30, y: 0, z: 0, maat: 1, kast: 2, laag: 'Cabling' }],
      vloerroutes: [
        { id: 'V1', punten: [[0, 0, 0], [0, 10, 0], [8, 10, 0]] },
        { id: 'V2', punten: [[30, 0, 0], [30, -8, 0]] },
      ],
      trusslijnen: [
        { id: 'T1', naam: 'LX01', klasse: 'LX01', punten: [[8, 10, 8], [28, 10, 8]] },
        { id: 'T2', naam: 'LX02', klasse: 'LX02', punten: [[30, -8, 7], [10, -8, 7]] },
      ],
      drops: [
        { id: 'D1', truss: 'T1', x: 14, y: 10, z: 8 },
        { id: 'D2', truss: 'T1', x: 24, y: 10, z: 8 },
        { id: 'D3', truss: 'T2', x: 18, y: -8, z: 7 },
      ],
      lampen: [
        { uuid: 'demo-1', naam: 'Spot 1', drop: 'D1' }, { uuid: 'demo-2', naam: 'Spot 2', drop: 'D1' },
        { uuid: 'demo-3', naam: 'Wash 1', drop: 'D2' },
      ],
      selectie: [],
      lagen: ['Cabling', 'Infraplot', 'Lightplot'],
    };
    // lampen en trussen zoals ze uit Vectorworks zouden komen
    const tl = KT.tekening;
    tl.alleLampen = [];
    tl.drops.forEach(d => { for (let i = 0; i < 4; i++) tl.alleLampen.push({ uuid: d.id + '-' + i, naam: 'Spot ' + d.id + '-' + (i + 1), laag: 'Lightplot', drop: d.id, x: d.x - 1.5 + i, y: d.y - 1.5, z: d.z - 3.3 }); });
    tl.trussen = tl.trusslijnen.map(t => {
      const [a, b] = t.punten;
      return { naam: 'Truss', klasse: t.naam, laag: 'Infraplot', min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]) - 0.15, a[2] - 0.3], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]) + 0.15, a[2]] };
    });
    [].concat(tl.vloerroutes, tl.drops).forEach(o => { o.laag = 'Cabling'; });
    tl.trusslijnen.forEach(o => { o.laag = 'Infraplot'; });
    KT.project = KT.nieuwProject();
    const b = (type, blok) => ({ id: KT.uid(), type, aantal: 1, voorvoegsel: '', blok: blok || '' });
    KT.project.dropinst = {
      D1: { naam: 'Trusje links', valhoogte: 3, slinger: 1, behoefte: [b('socapex', 'socabreakout'), b('lk', 'lkblok')], lampen: { 'demo-1': { circuit: 1, poort: 1 }, 'demo-2': { circuit: 2, poort: 2 } } },
      D2: { naam: 'Trusje rechts', valhoogte: 3, slinger: 1, behoefte: [b('socapex', 'socabreakout'), b('veam', 'veamsplitter')], lampen: {} },
      D3: { naam: 'Podiumrand', valhoogte: 7, slinger: 2, behoefte: [b('socapex'), b('lk')], lampen: {} },
    };
    vulAan();
    KT.status('Demo geladen (niets uit Vectorworks).');
  };
})();
