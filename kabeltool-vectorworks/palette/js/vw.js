// Alleen actief als de pagina in Vectorworks draait als web palette (dan bestaat vwAPI).
// In een gewone browser doet dit bestand niets en werkt de palette met Demo / bestanden.
(function () {
  const KT = window.KT;

  window.addEventListener('DOMContentLoaded', () => {
    if (typeof vwAPI === 'undefined' || !vwAPI.py) return;

    let geladen = false, laatsteSel = null, timer = null, bezig = false;

    // Eén ingang naar Vectorworks: voert kabeltool_brug.roep(fn, args) uit.
    const py = (fn, args) => vwAPI.py(fn, args || {}).then(r => {
      if (r && r.meldingen && r.meldingen.length) KT.status(r.meldingen.join(' · '));
      if (!r || !r.ok) throw new Error((r && r.fout) || 'geen antwoord van Vectorworks');
      return r.data;
    });

    function neemProject(p) {
      const kopie = Object.assign({}, p);
      if (p.bibliotheek && p.bibliotheek.families) KT.lib = p.bibliotheek;
      delete kopie.bibliotheek; delete kopie.tekenlijst; delete kopie.stempels;
      KT.project = kopie;
      KT.project.instellingen = Object.assign(KT.standaardInstellingen(), KT.project.instellingen || {});
      KT.project.dropinst = KT.project.dropinst || {};
      KT.project.nummers = KT.project.nummers || {};
    }

    async function laad() {
      try {
        const d = await py('laad');
        if (!geladen || d.basis !== KT.basis) {
          if (d.project && d.project.instellingen) neemProject(d.project); else KT.project = KT.nieuwProject();
        }
        KT.tekening = d.tekening; KT.basis = d.basis; geladen = true;
        const s = (d.tekening.selectie || [])[0];
        if (s) { KT.ui.sel = s; KT.project.selecteer = s; laatsteSel = s; }
        return true;
      } catch (e) { geladen = false; KT.status(e.message); return false; }
    }

    // Opslaan gaat nu ook naar het projectbestand naast de tekening, via Vectorworks.
    const lokaal = KT.opslaan;
    KT.opslaan = async function () {
      await lokaal();
      if (!geladen) return;
      try {
        await py('bewaar', KT.projectBestand());
        if (KT.project.selecteer && KT.project.selecteer !== laatsteSel) {
          laatsteSel = KT.project.selecteer;
          await py('selecteer', { id: laatsteSel });
        }
      } catch (e) { KT.status('Opslaan mislukt: ' + e.message); }
    };

    async function ververs() {
      if (bezig) return;
      bezig = true;
      try { if (await laad()) { await KT.opslaan(); KT.ui.render(); } } finally { bezig = false; }
    }

    // Na Demo-show: drops alvast invullen zoals de demo in de browser, lampen krijgen circuit/poort 1-4.
    function demoInstellingen() {
      const b = (type, blok) => ({ id: KT.uid(), type, aantal: 1, voorvoegsel: '', blok: blok || '' });
      const inst = {
        D1: { naam: 'Trusje links', valhoogte: 3, slinger: 1, behoefte: [b('socapex', 'socabreakout'), b('lk', 'lkblok')] },
        D2: { naam: 'Trusje rechts', valhoogte: 3, slinger: 1, behoefte: [b('socapex', 'socabreakout'), b('veam', 'veamsplitter')] },
        D3: { naam: 'Podiumrand', valhoogte: 7, slinger: 2, behoefte: [b('socapex'), b('lk')] },
      };
      KT.project.dropinst = KT.project.dropinst || {};
      Object.keys(inst).forEach(id => {
        if (KT.project.dropinst[id]) return;              // nooit iets overschrijven
        const lampen = {};
        (KT.tekening.lampen || []).filter(l => l.drop === id)
          .forEach((l, i) => { lampen[l.uuid] = { circuit: i + 1, poort: i + 1 }; });
        KT.project.dropinst[id] = Object.assign(inst[id], { lampen });
      });
      KT.ui.sel = 'D1'; KT.project.selecteer = 'D1';
    }

    KT.vw = {
      // Wordt door de plug-in aangeroepen als de selectie of het document verandert.
      // Pas als de tekening een keer met Verversen geladen is.
      gewijzigd() { if (!geladen) return; clearTimeout(timer); timer = setTimeout(ververs, 500); },
      async actie(fn, args) {
        if (bezig) return;
        bezig = true;
        try {
          await KT.opslaan();                 // Vectorworks leest het projectbestand
          await py(fn, args);
          if (await laad()) {
            if (fn === 'demo') demoInstellingen();
            await KT.opslaan(); KT.ui.render();
          }
        } catch (e) { KT.status(e.message); } finally { bezig = false; }
      },
      ververs,
      // Kiest een tool uit de gereedschapset Kabeltool; daarna klik je in de tekening.
      async tool(naam) {
        try {
          const ok = await vwAPI.tool(naam);
          KT.status(ok ? 'Tool gekozen: klik in de tekening.' : 'Tool niet gevonden. Staat de gereedschapset Kabeltool in je werkruimte?');
        } catch (e) { KT.status(e.message || String(e)); }
      },
      trussVanSelectie() { return KT.vw.actie('truss', { hoogte: KT.project.instellingen.trussHoogte }); },
    };

    // Knoppen: bestandsknoppen weg, Vectorworks-knoppen erbij.
    document.querySelectorAll('header button').forEach(b => { if (!/kiesBib/.test(b.getAttribute('onclick') || '')) b.style.display = 'none'; });
    const balk = document.createElement('div');
    balk.className = 'vwbalk';
    balk.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;background:#26303c';
    // Dim city / drop / vloerroute / truss-lijn tekenen gaat met de tools (klik in de tekening).
    // De palette wacht zelf nooit op een klik: dat liet Vectorworks crashen.
    balk.innerHTML = [
      ["KT.vw.tool('dimcity')", 'Dim city plaatsen'], ["KT.vw.tool('vloer')", 'Vloerroute tekenen'],
      ["KT.vw.tool('truss')", 'Truss-lijn tekenen'], ["KT.vw.tool('drop')", 'Drop toevoegen'],
      ["KT.vw.actie('vloer')", 'Vloerroute van selectie'], ['KT.vw.trussVanSelectie()', 'Truss-lijn van selectie'],
      ["KT.vw.actie('lampen')", 'Lampen koppelen'], ["KT.vw.actie('bijwerken')", 'Tekening bijwerken'],
      ["KT.vw.actie('stempelen')", 'Stempelen'], ["KT.vw.actie('demo')", 'Demo-show maken'],
      ['KT.vw.ververs()', 'Verversen'],
    ].map(k => `<button onclick="${k[0]}">${k[1]}</button>`).join('');
    document.querySelector('header').after(balk);

    KT.ui.tab = 'project';
    // Niet meteen Python starten bij het openen van de palette (dat liet Vectorworks crashen).
    // De eerste keer laden gaat met de knop Verversen.
    KT.status('Klik op Verversen om de tekening te laden.');
  });
})();
