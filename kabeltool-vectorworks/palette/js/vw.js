// Alleen actief als de pagina in Vectorworks draait als web palette (dan bestaat vwAPI).
// In een gewone browser doet dit bestand niets en werkt de palette met Demo / bestanden.
(function () {
  const KT = window.KT;

  window.addEventListener('DOMContentLoaded', () => {
    if (typeof vwAPI === 'undefined' || !vwAPI.kt) return;

    let geladen = false, laatsteSel = null, timer = null, bezig = false;

    // Eén ingang naar Vectorworks: de plug-in voert de functie in C++ uit (geen Python).
    const py = (fn, args) => vwAPI.kt(fn, args || {}).then(r => {
      if (r && r.meldingen && r.meldingen.length) KT.status(r.meldingen.join(' · '));
      if (!r || !r.ok) throw new Error((r && r.fout) || 'geen antwoord van Vectorworks');
      return r.data;
    });

    function neemProject(p) {
      const kopie = Object.assign({}, p);
      if (p.bibliotheek && p.bibliotheek.families) KT.lib = KT.werkBibBij(p.bibliotheek);
      delete kopie.bibliotheek; delete kopie.tekenlijst; delete kopie.stempels;
      KT.project = kopie;
      KT.project.instellingen = KT.werkInstellingenBij(Object.assign(KT.standaardInstellingen(), KT.project.instellingen || {}));
      KT.project.dropinst = KT.project.dropinst || {};
      KT.project.nummers = KT.project.nummers || {};
    }

    // Drop-instellingen staan ook in de Object Info van de drop. Is daar iets veranderd sinds de palette
    // het er zelf in zette (_sync), dan neemt de palette dat over; anders gaan de palette-waarden naar de drop.
    const dropWaarden = di => ({ naam: di.naam || '', valhoogte: di.valhoogte === '' || di.valhoogte == null ? '' : +di.valhoogte, slinger: +di.slinger || 0,
      vorm: di.vorm || 'Boog', kant: di.kant === 'R' ? 'R' : 'L', droplengte: +di.droplengte || 0 });
    function neemDrops(drops) {
      drops.forEach(dr => {
        if (dr.objectnaam === undefined) return;
        const di = KT.dropInst(dr.id), s = di._sync;
        const obj = dropWaarden({ naam: dr.objectnaam, valhoogte: dr.valhoogte, slinger: dr.slingers, vorm: dr.vorm, kant: dr.kant, droplengte: dr.droplengte });
        if (!s || JSON.stringify(s) !== JSON.stringify(obj)) Object.assign(di, obj);
        di._sync = dropWaarden(di);
      });
    }

    async function laad() {
      try {
        const d = await py('laad');
        if (!geladen || d.basis !== KT.basis) {
          if (d.project && d.project.instellingen) neemProject(d.project); else KT.project = KT.nieuwProject();
        }
        KT.tekening = d.tekening; KT.basis = d.basis; geladen = true;
        neemDrops(d.tekening.drops || []);
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
      // Pas als de tekening een keer met Verversen geladen is.
      gewijzigd() { if (!geladen) return; clearTimeout(timer); timer = setTimeout(ververs, 500); },
      async actie(fn, args) {
        if (bezig) return;
        bezig = true;
        document.body.classList.add('bezig');
        KT.status('');
        try {
          await KT.opslaan();                 // Vectorworks leest het projectbestand
          const klaarTekst = { bijwerken: 'Tekening bijgewerkt.', stempelen: 'Gestempeld.', demo: 'Demo-show getekend.' }[fn];
          await py(fn, args);
          if (klaarTekst && !document.getElementById('status').textContent) KT.status(klaarTekst);
          if (await laad()) {
            if (fn === 'demo') { KT.ui.sel = 'D101'; KT.project.selecteer = 'D101'; }
            await KT.opslaan(); KT.ui.render();
          }
        } catch (e) { KT.status(e.message, 'rood'); } finally { bezig = false; document.body.classList.remove('bezig'); }
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
      // Truss-diagnose: wat is het geselecteerde object en wordt het als truss herkend?
      async diagnose() {
        try {
          await KT.opslaan();
          const lijst = await py('diagnose', {});
          if (!lijst || !lijst.length) return;
          const esc = t => String(t == null ? '' : t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
          const m = v => (+v || 0).toFixed(2).replace('.', ',');
          KT.toon('Truss-diagnose', `<table class="lijst"><thead><tr><th>Type</th><th>Naam / symbool</th><th>Map</th><th>Class</th><th>Laag</th><th>Records</th><th>Maat (m)</th><th>Herkend als</th></tr></thead><tbody>
            ${lijst.map(d => `<tr><td>${esc(d.type)}</td><td>${esc(d.soort || d.naam)}</td><td>${esc(d.map)}</td><td>${esc(d.klasse)}</td><td>${esc(d.laag)}</td>
              <td>${esc((d.records || []).join(', '))}</td><td>${(d.maat || []).map(m).join(' × ')}</td>
              <td>${d.truss ? '<b style="color:var(--groen)">truss</b> (' + esc(d.waarom) + ')' : d.lamp ? 'lamp' : d.blok ? 'blok ' + esc(d.blok) : '<span class="rood">geen truss</span><br><span class="stil">' + esc(d.waarom) + '</span>'}</td></tr>`).join('')}
            </tbody></table><p class="stil">Wordt je truss niet herkend? Zet een woord uit de naam of de map in Instellingen › Trussen herkennen, en klik op Verversen. De gegevens staan ook in %TEMP%\\kabeltool_log.txt.</p>`, true);
        } catch (e) { KT.status(e.message, 'rood'); }
      },
      // Extra lagen (Cabling-2, Infraplot-3 …) van de oude fout terugzetten naar de echte lagen
      async opruimen() {
        const i = KT.project.instellingen;
        if (!await KT.vraag(`Lagen opruimen?\nAlles op lagen als "${i.laagCabling}-2", "${i.laagInfra}-3", "Cabling-2" of "Lightplot-2" gaat terug naar de echte laag. De lege extra lagen worden verwijderd.\nDit kun je niet ongedaan maken; bewaar je tekening eerst.`)) return;
        return KT.vw.actie('opruimen');
      },
    };

    // De tekening wordt pas geladen met Verversen (niet meteen bij het openen van de palette).
    KT.ui.render();
    KT.status('Klik op Verversen om de tekening te laden.');
  });
})();
