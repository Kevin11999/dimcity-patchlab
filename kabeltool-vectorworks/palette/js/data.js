// Standaardwaarden: kabelbibliotheek, blokken en instellingen.
// Alles is in de palette aan te passen; dit is alleen de eerste vulling.
window.KT = window.KT || {};
(function () {
  const KT = window.KT;

  // l([5,10,25], {25:5}) -> lengtes; tweede argument: lengte -> aantal kabels in de loom
  const l = (lijst, looms) => lijst.map(m => (looms && looms[m])
    ? { m, loom: true, aantal: looms[m] } : { m, loom: false, aantal: 1 });
  // rand/3D-kleur en vet per familie: multi blauw, VEAM/LK oranje en vet (zoals de tekeningen van Kevin)
  const RAND = { socapex: '#29b6f6', harting: '#29b6f6', lk: '#ff7043', veam: '#ff7043' };
  const VET = { lk: true, veam: true };
  // kleur van de kabel in 3D (palette en Vectorworks): per type duidelijk anders, zoals in FixturePilot
  const KLEUR3D = {
    socapex: '#2196f3', harting: '#00bcd4', lk: '#ff9800', veam: '#ffc107', dmx3: '#ab47bc', dmx5: '#ab47bc',
    cat5e: '#43a047', cat6a: '#43a047', cat7: '#2e7d32', catloom: '#66bb6a', cathaspel: '#43a047',
    opticalcon: '#ec407a', fiberfox: '#ec407a', sfp: '#f48fb1', schuko: '#9e9e9e', cee16: '#1e88e5', cee32: '#e53935',
    cee63r: '#c62828', cee63b: '#1565c0', cee125: '#b71c1c', powerlock: '#6d4c41', camlock: '#795548',
    powercon: '#42a5f5', true1: '#607d8b', speakon: '#78909c', sceptron: '#26a69a', atomic: '#26c6da',
  };
  KT.typeKleur3D = type => (type && (type.kleur3D || KLEUR3D[type.id] || (type.kleur && type.kleur !== '#000000' ? type.kleur : ''))) || '#9e9e9e';
  const t = (id, naam, kort, voorvoegsel, connector, lengtes, stempel) =>
    ({ id, naam, kort, voorvoegsel, connector, lengtes, stempel: stempel || '', diameter: KT.standaardDiameter(id), kleur: RAND[id] || '#000000', vet: !!VET[id], kleur3D: KLEUR3D[id] || '' });

  // Oude bibliotheek (SOCA, LK, V, LK-blok …) omzetten naar de huidige namen en kleuren. Eigen types blijven staan.
  KT.werkBibBij = function (lib) {
    if (!lib || !lib.families) return lib;
    const oud = { socapex: ['SOCA'], lk: ['LK'], veam: ['V', 'VEAM'] }, nieuw = { socapex: 'SOC', lk: 'V12', veam: 'V4' };
    lib.families.forEach(f => (f.types || []).forEach(ty => {
      if (oud[ty.id] && oud[ty.id].includes(ty.kort)) ty.kort = nieuw[ty.id];
      if (RAND[ty.id] && (!ty.kleur || ty.kleur === '#000000')) ty.kleur = RAND[ty.id];
      if (ty.vet == null && VET[ty.id]) ty.vet = true;
      if (!ty.kleur3D && KLEUR3D[ty.id]) ty.kleur3D = KLEUR3D[ty.id];
    }));
    (lib.blokken || []).forEach(b => {
      if (b.id === 'lkblok' && /^LK[- ]?blok$/i.test(b.naam || '')) b.naam = 'VEAM12';
      if (b.id === 'veamsplitter' && /splitter/i.test(b.naam || '')) b.naam = 'VEAM4';
    });
    return lib;
  };

  const STD = [2.5, 5, 10, 15, 25];

  // Dikte van de kabel in mm, voor de 3D-weergave en de 3D-kabels in Vectorworks
  const DIAMETERS = {
    socapex: 25, harting: 25, lk: 22, veam: 18, dmx3: 7, dmx5: 7, cat5e: 7, cat6a: 8, cat7: 8, catloom: 20, cathaspel: 8,
    opticalcon: 7, fiberfox: 8, sfp: 4, schuko: 10, cee16: 14, cee32: 18, cee63r: 25, cee63b: 25, cee125: 35,
    powerlock: 30, camlock: 25, powercon: 10, true1: 10, speakon: 12, sceptron: 12, atomic: 12,
  };
  KT.standaardDiameter = id => DIAMETERS[id] || 15;
  KT.diameter = type => (type && +type.diameter > 0) ? +type.diameter : KT.standaardDiameter(type && type.id);

  KT.standaardBibliotheek = () => ({
    versie: 1,
    families: [
      { id: 'multi', naam: 'Multi', types: [
        t('socapex', 'Socapex', 'SOC', 'M', 'Socapex 19p', l([2.5, 5, 10, 15, 25, 35, 50], { 25: 5, 35: 5 }), 'multi'),
        t('harting', 'Harting', 'HART', 'M', 'Harting 16p', l([5, 10, 15, 25, 35], { 25: 5, 35: 5 }), 'multi'),
      ] },
      { id: 'data', naam: 'Data', types: [
        t('lk', 'VEAM 12 / LK (12 DMX-lijnen)', 'V12', 'LK', 'VEAM 12', l([5, 10, 15, 25, 35, 50]), 'data'),
        t('veam', 'VEAM 4', 'V4', 'V', 'VEAM 4', l([5, 10, 15, 25, 35, 50]), 'data'),
        t('dmx3', 'DMX 3-polig', 'DMX3', 'DMX', 'XLR 3p', l([1, 2.5, 5, 10, 15, 25])),
        t('dmx5', 'DMX 5-polig', 'DMX', 'DMX', 'XLR 5p', l([1, 2.5, 5, 10, 15, 25])),
        t('cat5e', 'Ethernet CAT5e', 'CAT5', 'CAT', 'etherCON', l(STD)),
        t('cat6a', 'Ethernet CAT6A', 'CAT6', 'CAT', 'etherCON', l(STD)),
        t('cat7', 'Ethernet CAT7', 'CAT7', 'CAT', 'etherCON', l(STD)),
        t('catloom', 'CAT-loom', 'CATL', 'CAT', 'etherCON', l([25, 35], { 25: 4, 35: 4 })),
        t('cathaspel', 'CAT-haspel', 'CATH', 'CAT', 'etherCON', l([50, 75, 100])),
      ] },
      { id: 'fiber', naam: 'Fiber', types: [
        t('opticalcon', 'opticalCON', 'OPTI', 'F', 'opticalCON', l([25, 50, 100, 150])),
        t('fiberfox', 'FiberFox', 'FOX', 'F', 'FiberFox', l([25, 50, 100, 150])),
        t('sfp', 'SFP', 'SFP', 'F', 'LC', l([1, 2.5, 5, 10])),
      ] },
      { id: 'stroom', naam: 'Stroom', types: [
        t('schuko', 'Schuko', 'SCH', 'S', 'Schuko', l([1, 2.5, 5, 10, 15, 25])),
        t('cee16', 'CEE 16 A', '16A', 'P', 'CEE 16A', l(STD)),
        t('cee32', 'CEE 32 A', '32A', 'P', 'CEE 32A', l(STD)),
        t('cee63r', 'CEE 63 A rood', '63A', 'P', 'CEE 63A rood', l(STD)),
        t('cee63b', 'CEE 63 A blauw', '63B', 'P', 'CEE 63A blauw', l(STD)),
        t('cee125', 'CEE 125 A', '125A', 'P', 'CEE 125A', l([5, 10, 15, 25])),
        t('powerlock', 'Powerlock', 'PL', 'P', 'Powerlock', l([5, 10, 15, 25])),
        t('camlock', 'Camlock', 'CAM', 'P', 'Camlock', l([5, 10, 15, 25])),
        t('powercon', 'powerCON', 'PC', 'S', 'powerCON', l([1, 2.5, 5, 10])),
        t('true1', 'powerCON TRUE1', 'T1', 'S', 'TRUE1', l([1, 2.5, 5, 10])),
        t('speakon', 'speakON', 'SPK', 'SP', 'speakON', l([2.5, 5, 10, 15, 25])),
      ] },
      { id: 'martin', naam: 'Fabrikantspecifiek', types: [
        t('sceptron', 'Martin Sceptron', 'SCEP', 'SC', 'Martin P3 hybrid', l([1, 2.5, 5, 10, 25])),
        t('atomic', 'Martin Atomic Dot/Bolt', 'ATOM', 'AT', 'Martin hybrid', l([1, 2.5, 5, 10, 25])),
      ] },
    ],
    blokken: [
      { id: 'socabreakout', naam: 'Soca-breakout', ingang: 'socapex', poorten: 6, uitgang: 'schuko' },
      { id: 'lkblok', naam: 'VEAM12', ingang: 'lk', poorten: 12, uitgang: 'dmx5' },
      { id: 'veamsplitter', naam: 'VEAM4', ingang: 'veam', poorten: 4, uitgang: 'dmx5' },
    ],
  });

  KT.standaardInstellingen = () => ({
    prefix: 'PP/',                 // placeholder, later exact invullen
    slackDimCity: 2.5,             // m per kabel bij de dim city
    tolerantie: 2,                 // m: hoe dicht een route bij dim city/voet moet beginnen
    symboolBreedte: 13,            // mm op papier (kabelsymbool)
    symboolHoogte: 4,              // mm op papier
    dimcityMaat: 1,                // m, zijde van het vierkant
    laagCabling: 'Cabling',
    laagInfra: 'Infraplot',
    trussHoogte: 8,                // m, voor "Truss-lijn van selectie" bij een 2D-lijn
    laagKabels: 'Cabling',         // laag voor de 3D-kabels
    kabels3D: true,                // Tekening bijwerken maakt elke kabel als 3D-buis
    kabels2D: true,                // en als dunne lijn in bovenaanzicht
    kabelAfstand: 0.002,           // m speling tussen de kabels in de bundel
    kleurKabels: 'type',           // 3D-kabels: 'type' (kleur van het kabeltype) of 'lengte' (magazijnkleur)
    kabelDikte3D: 3,               // kabels in de palette-3D zoveel keer dikker tekenen (beter te zien)
    migratie: 3,                   // versie van de instellingen (voor het omzetten van oude projecten)
    dimcityKast: 2,                // m, hoogte van de dim city-kast in 3D
    dropSymbool: 0.3,              // m, doorsnede dropsymbool
    dropLengtes: [25, 35],         // looms die als drop mogen
    lengtehulp: true,
    lengtehulpLengtes: [5, 10, 15, 25],
    // magazijnkleurcode per lengte (wit krijgt in de tekening een zwarte rand)
    lengteKleuren: {
      '0.5': '#ffffff', '1': '#8d5524', '2.5': '#ffffff', '5': '#ffd600', '10': '#e53935', '15': '#2fb344',
      '25': '#ffffff', '35': '#9e9e9e', '50': '#8e24aa', '75': '#fb8c00', '100': '#8d5524', '150': '#2fb344',
    },
    kleurDrop: '#33cc00',          // kader en rondje van een drop
    kleurRoute: '#ff0000',         // kader en rondje van een koppelpunt/route
    kleurDB: '#ff0000',            // vlak van de dim city
  });
})();
