// Standaardwaarden: kabelbibliotheek, blokken en instellingen.
// Alles is in de palette aan te passen; dit is alleen de eerste vulling.
window.KT = window.KT || {};
(function () {
  const KT = window.KT;

  // l([5,10,25], {25:5}) -> lengtes; tweede argument: lengte -> aantal kabels in de loom
  const l = (lijst, looms) => lijst.map(m => (looms && looms[m])
    ? { m, loom: true, aantal: looms[m] } : { m, loom: false, aantal: 1 });
  const t = (id, naam, kort, voorvoegsel, connector, lengtes, stempel) =>
    ({ id, naam, kort, voorvoegsel, connector, lengtes, stempel: stempel || '' });

  const STD = [2.5, 5, 10, 15, 25];

  KT.standaardBibliotheek = () => ({
    versie: 1,
    families: [
      { id: 'multi', naam: 'Multi', types: [
        t('socapex', 'Socapex', 'SOCA', 'M', 'Socapex 19p', l([2.5, 5, 10, 15, 25, 35, 50], { 25: 5, 35: 5 }), 'multi'),
        t('harting', 'Harting', 'HART', 'M', 'Harting 16p', l([5, 10, 15, 25, 35], { 25: 5, 35: 5 }), 'multi'),
      ] },
      { id: 'data', naam: 'Data', types: [
        t('lk', 'LK (12 DMX-lijnen)', 'LK', 'LK', 'LK 37', l([5, 10, 15, 25, 35, 50]), 'data'),
        t('veam', 'VEAM', 'V', 'VEAM', 'VEAM', l([5, 10, 15, 25, 35, 50]), 'data'),
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
      { id: 'lkblok', naam: 'LK-blok', ingang: 'lk', poorten: 12, uitgang: 'dmx5' },
      { id: 'veamsplitter', naam: 'VEAM-splitter', ingang: 'veam', poorten: 4, uitgang: 'dmx5' },
    ],
  });

  KT.standaardInstellingen = () => ({
    prefix: 'PP/',                 // placeholder, later exact invullen
    slackDimCity: 2.5,             // m per kabel bij de dim city
    tolerantie: 2,                 // m: hoe dicht een route bij dim city/voet moet beginnen
    symboolBreedte: 20,            // mm op papier
    symboolHoogte: 4,              // mm op papier
    dimcityMaat: 1,                // m, zijde van het vierkant
    laagCabling: 'Cabling',
    laagInfra: 'Infraplot',
    trussHoogte: 8,                // m, voor "Truss-lijn van selectie" bij een 2D-lijn
    dropLengtes: [25, 35],         // looms die als drop mogen
    lengtehulp: true,
    lengtehulpLengtes: [5, 10, 15, 25],
    // tijdelijke placeholderkleuren; later de magazijnkleurcode
    lengteKleuren: {
      '1': '#bdbdbd', '2.5': '#ffffff', '5': '#ffd400', '10': '#2e7dff', '15': '#2fb344',
      '25': '#e53935', '35': '#8e44ad', '50': '#ff8a00', '75': '#00a6a6', '100': '#222222', '150': '#795548',
    },
  });
})();
