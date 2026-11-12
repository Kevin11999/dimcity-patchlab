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

    KT.vw = {
      // Wordt door de plug-in aangeroepen als de selectie of het document verandert.
      gewijzigd() { clearTimeout(timer); timer = setTimeout(ververs, 500); },
      async actie(fn) {
        if (bezig) return;
        bezig = true;
        try {
          await KT.opslaan();                 // Vectorworks leest het projectbestand
          await py(fn);
          if (await laad()) { await KT.opslaan(); KT.ui.render(); }
        } catch (e) { KT.status(e.message); } finally { bezig = false; }
        // na een klik in de tekening (dim city / drop) komt het resultaat iets later
        if (fn === 'dimcity' || fn === 'drop') [2000, 6000, 15000].forEach(ms => setTimeout(ververs, ms));
      },
      ververs,
    };

    // Knoppen: bestandsknoppen weg, Vectorworks-knoppen erbij.
    document.querySelectorAll('header button').forEach(b => { if (!/kiesBib/.test(b.getAttribute('onclick') || '')) b.style.display = 'none'; });
    const balk = document.createElement('div');
    balk.className = 'vwbalk';
    balk.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;background:#26303c';
    balk.innerHTML = [
      ['dimcity', 'Dim city plaatsen'], ['vloer', 'Vloerroute van selectie'], ['truss', 'Truss-lijn van selectie'],
      ['drop', 'Drop toevoegen'], ['lampen', 'Lampen koppelen'], ['bijwerken', 'Tekening bijwerken'], ['stempelen', 'Stempelen'],
    ].map(k => `<button onclick="KT.vw.actie('${k[0]}')">${k[1]}</button>`).join('') + '<button onclick="KT.vw.ververs()">Verversen</button>';
    document.querySelector('header').after(balk);

    KT.ui.tab = 'project';
    ververs();
  });
})();
