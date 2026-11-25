// Kabelsymbool: blokje 1 hoog op 5 breed, links korte naam, rechts lengte, gekleurde balk over de volle breedte.
(function () {
  const KT = window.KT;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  KT.lengteTekst = m => String(m).replace('.', ',');
  KT.kleurVoor = m => (KT.project.instellingen.lengteKleuren || {})[String(m)] || '#9e9e9e';

  // Kabelsymbool 1-op-1 naar Kevins voorbeeld ("SOC 15"): wit blokje, dunne rand in de typekleur, dunne balk bovenop
  // (9 % van de hoogte) in de lengtekleur met een zwarte lijn, korte naam gecentreerd op 26 % (vet bij VEAM), lengte
  // gecentreerd op 78 %, geen scheidingslijn; nummer grijs ernaast. px = hoogte op het scherm.
  KT.symboolSVG = function (kort, m, nummer, px, type) {
    const inst = KT.project.instellingen;
    const H = 20, B = H * ((+inst.symboolBreedte || 12.7) / (+inst.symboolHoogte || 4));
    const balk = H * 0.087;
    const t = type || KT.alleTypes().find(x => x.kort === kort) || {};
    const rand = t.kleur || '#000', vet = !!t.vet;
    const lt = KT.lengteTekst(m);
    const past = (tekst, isVet) => {
      let em = H * 0.8;
      const schat = Math.max(1, String(tekst).length) * 0.66 * em * (isVet ? 1.08 : 1);
      if (schat > B * 0.47) em *= B * 0.47 / schat;
      return em;
    };
    const my = H * 0.495, fsNr = H * 0.72;
    const nr = nummer ? `<text x="${B + H * 0.25}" y="${my}" font-size="${fsNr}" dominant-baseline="central" fill="#777">${esc(nummer)}</text>` : '';
    const breed = B + (nummer ? H * 0.35 + String(nummer).length * fsNr * 0.6 : 1);
    const schaal = (px || 22) / H;
    return `<svg class="ksym" xmlns="http://www.w3.org/2000/svg" width="${breed * schaal}" height="${(H + 1) * schaal}" viewBox="-0.5 -0.5 ${breed} ${H + 1}" font-family="Arial, Helvetica, sans-serif">
<rect x="0" y="0" width="${B}" height="${H}" fill="#fff" stroke="${esc(rand)}" stroke-width="0.9"/>
<rect x="0" y="0" width="${B}" height="${balk}" fill="${esc(KT.kleurVoor(m))}" stroke="#000" stroke-width="0.5"/>
<text x="${B * 0.26}" y="${my}" font-size="${past(kort, vet)}" font-weight="${vet ? 'bold' : 'normal'}" text-anchor="middle" dominant-baseline="central" fill="#000">${esc(kort)}</text>
<text x="${B * 0.785}" y="${my}" font-size="${past(lt, false)}" text-anchor="middle" dominant-baseline="central" fill="#000">${esc(lt)}</text>
${nr}</svg>`;
  };

  // Oude placeholderkleuren en -maten vervangen door de magazijnkleurcode
  KT.werkInstellingenBij = function (s) {
    const k = s.lengteKleuren || {};
    if (k['10'] === '#2e7dff' && k['25'] === '#e53935') s.lengteKleuren = KT.standaardInstellingen().lengteKleuren;
    if (!(+s.migratie >= 2)) {                   // eenmalig: oude maat en 3D-kleur per type
      if (+s.symboolBreedte === 20) s.symboolBreedte = 13;
      if (s.kleurKabels === 'lengte') s.kleurKabels = 'type';
      s.migratie = 2;
    }
    if (+s.migratie < 3) {                       // eenmalig: kabels liggen nu als strakke bundel
      if (+s.kabelAfstand === 0.03) s.kabelAfstand = 0.002;
      if (+s.kabelDikte3D === 2) s.kabelDikte3D = 3;
      s.migratie = 3;
    }
    if (+s.migratie < 4) {                       // eenmalig: tekeningstructuur van Kevin, symbool volgens voorbeeld
      const std = KT.standaardInstellingen();
      if (s.prefix === 'PP/') s.prefix = '';
      if (!s.laagCabling || s.laagCabling === 'Cabling') s.laagCabling = std.laagCabling;
      if (!s.laagInfra || s.laagInfra === 'Infraplot') s.laagInfra = std.laagInfra;
      if (!s.laagKabels || s.laagKabels === 'Cabling') s.laagKabels = std.laagKabels;
      if (!s.laagLampen || s.laagLampen === 'Lightplot') s.laagLampen = std.laagLampen;
      if (+s.symboolBreedte === 13) s.symboolBreedte = 12.7;
      if (+s.kabelAfstand === 0.002) s.kabelAfstand = std.kabelAfstand;
      if (+s.kabelDikte3D === 3) s.kabelDikte3D = 1;
      const k = s.lengteKleuren || {};
      ['15', '150'].forEach(m => { if (k[m] === '#2fb344') k[m] = '#2ebb2e'; });
      s.migratie = 4;
    }
    return s;
  };
})();
