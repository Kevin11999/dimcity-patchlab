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
    if (!d[id].behoefte) d[id].behoefte = [];
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
    stempels: KT.res.stempels,
    kabelpaden: KT.res.kabelpaden,
    waarschuwingen: (KT.res.waarschuwingen || []).filter(w => w.x != null && w.y != null),
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

  // Demo zoals de tekeningstructuur van Kevin: PP Infra (dim cities, kabeltrussen CB01/CB02, drops, blokken),
  // PP Lichtplot (lampen in class LX1, LX2, LX3), PP Cables (vloerroutes). Blokken met nummer bepalen de kabels.
  KT.laadDemo = function () {
    KT.mappen.tekening = null; KT.basis = 'demo';
    const I = 'PP Infra', L = 'PP Lichtplot', C = 'PP Cables';
    const doel = (klasse, x, y) => ({ x, y, klasse, hoogte: 0 });
    KT.tekening = {
      versie: 3,
      dimcities: [
        { id: 'DB1', nr: 1, naam: 'DB1', x: 0, y: 0, z: 0, maat: 1, kast: 2, laag: I },
        { id: 'DB2', nr: 2, naam: 'DB2', x: 30, y: 0, z: 0, maat: 1, kast: 2, laag: I },
      ],
      vloerroutes: [
        { id: 'V1', laag: C, punten: [[0, 0, 0], [0, 10, 0], [8, 10, 0]], locatie: 'Over vloer' },
        { id: 'V2', laag: C, punten: [[30, 0, 0], [30, -8, 0]], locatie: '' },
      ],
      trusslijnen: [
        { id: 'T1', naam: 'CB01', klasse: 'CB01', laag: I, locatie: 'Over Catwalk', punten: [[8, 10, 8.4], [28, 10, 8.4]], bovenkant: 8.4 },
        { id: 'T2', naam: 'CB02', klasse: 'CB02', laag: I, locatie: 'Over Catwalk', punten: [[30, -8, 7.4], [10, -8, 7.4]], bovenkant: 7.4 },
      ],
      drops: [
        { id: 'D101', truss: 'T1', x: 14, y: 10, z: 8.4, kant: 'R', vorm: 'Boog', slingers: 1, doel: doel('LX1', 14, 5), laag: I },
        { id: 'D102', truss: 'T1', x: 24, y: 10, z: 8.4, kant: 'R', vorm: 'Realistisch', slingers: 1, droplengte: 25, doel: doel('LX2', 24, 7), laag: I },
        { id: 'D201', truss: 'T2', x: 18, y: -8, z: 7.4, kant: 'R', vorm: 'Recht', slingers: 2, doel: doel('LX3', 18, -3), laag: I },
      ],
      blokken: [
        { nummer: 'M101', voorv: 'M', getal: 101, type: 'socapex', klasse: 'LX1', x: 15, y: 5, z: 0, laag: I, bron: 'tekst' },
        { nummer: 'LK101', voorv: 'LK', getal: 101, type: 'lk', klasse: 'LX1', x: 15, y: 4.5, z: 0, laag: I, bron: 'tekst' },
        { nummer: 'M102', voorv: 'M', getal: 102, type: 'socapex', klasse: 'LX2', x: 25, y: 7, z: 0, laag: I, bron: 'tekst' },
        { nummer: 'V101', voorv: 'V', getal: 101, type: 'veam', klasse: 'LX2', x: 25, y: 6.5, z: 0, laag: I, bron: 'tekst' },
        { nummer: 'M201', voorv: 'M', getal: 201, type: 'socapex', klasse: 'LX3', x: 19, y: -3, z: 0, laag: I, bron: 'tekst' },
        { nummer: 'LK201', voorv: 'LK', getal: 201, type: 'lk', klasse: 'LX3', x: 19, y: -3.5, z: 0, laag: I, bron: 'tekst' },
      ],
      lampen: [],
      selectie: [],
      lagen: [C, I, L],
    };
    // lampen en trussen zoals ze uit Vectorworks zouden komen
    const tl = KT.tekening;
    tl.alleLampen = [];
    [['LX1', 14, 5, 6], ['LX2', 24, 7, 4.5], ['LX3', 18, -3, 6]].forEach(([k, x, y, z]) => {
      for (let i = 0; i < 4; i++) tl.alleLampen.push({ uuid: k + '-' + i, naam: 'Spot ' + k + '-' + (i + 1), type: 'Spot', laag: L, klasse: k, x: x - 1.5 + i, y, z });
    });
    tl.trussen = tl.trusslijnen.map(t => {
      const [a, b] = t.punten;
      return { naam: 'Truss', klasse: t.naam, laag: I, min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]) - 0.15, a[2] - 0.3], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]) + 0.15, a[2]] };
    });
    [['LX1', 14, 5, 6], ['LX2', 24, 7, 4.5], ['LX3', 18, -3, 6]].forEach(([k, x, y, z]) =>
      tl.trussen.push({ naam: 'Truss', klasse: k, laag: 'Truss', min: [x - 3, y - 0.15, z + 0.2], max: [x + 3, y + 0.15, z + 0.5] }));
    KT.project = KT.nieuwProject();
    KT.project.dropinst = {
      D101: { naam: 'LX1', slinger: 1, behoefte: [], lampen: { 'LX1-0': { circuit: 1, poort: 1 }, 'LX1-1': { circuit: 2, poort: 2 } } },
    };
    vulAan();
    KT.status('Demo geladen (niets uit Vectorworks).');
  };
})();
