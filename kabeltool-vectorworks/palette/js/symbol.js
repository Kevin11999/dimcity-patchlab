// Kabelsymbool: blokje 1 hoog op 5 breed, links korte naam, rechts lengte, gekleurde balk over de volle breedte.
(function () {
  const KT = window.KT;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  KT.lengteTekst = m => String(m).replace('.', ',');
  KT.kleurVoor = m => (KT.project.instellingen.lengteKleuren || {})[String(m)] || '#9e9e9e';

  // Kabelsymbool zoals in de tekening: blokje met dunne balk bovenop (lengtekleur), rand in de kleur van het
  // kabeltype, korte naam links (vet bij VEAM), lengte rechts; nummer grijs ernaast. px = hoogte op het scherm.
  KT.symboolSVG = function (kort, m, nummer, px, type) {
    const inst = KT.project.instellingen;
    const H = 20, B = H * ((+inst.symboolBreedte || 13) / (+inst.symboolHoogte || 4));
    const balk = H * 0.16, fs = H * 0.62;
    const t = type || KT.alleTypes().find(x => x.kort === kort) || {};
    const rand = t.kleur || '#000', vet = t.vet ? 'bold' : 'normal';
    const lt = KT.lengteTekst(m);
    const nr = nummer ? `<text x="${B + 4}" y="${balk + (H - balk) / 2}" font-size="${fs}" dominant-baseline="central" fill="#777">${esc(nummer)}</text>` : '';
    const breed = B + (nummer ? 6 + String(nummer).length * fs * 0.62 : 1);
    const schaal = (px || 22) / H;
    return `<svg class="ksym" xmlns="http://www.w3.org/2000/svg" width="${breed * schaal}" height="${(H + 1) * schaal}" viewBox="-0.5 -0.5 ${breed} ${H + 1}" font-family="Arial, Helvetica, sans-serif">
<rect x="0" y="0" width="${B}" height="${H}" fill="#fff" stroke="${esc(rand)}" stroke-width="1"/>
<rect x="0" y="0" width="${B}" height="${balk}" fill="${esc(KT.kleurVoor(m))}" stroke="#000" stroke-width="0.6"/>
<text x="${H * 0.25}" y="${balk + (H - balk) / 2}" font-size="${fs}" font-weight="${vet}" dominant-baseline="central" fill="#000">${esc(kort)}</text>
<text x="${B - H * 0.25}" y="${balk + (H - balk) / 2}" font-size="${fs}" text-anchor="end" dominant-baseline="central" fill="#000">${esc(lt)}</text>
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
    return s;
  };
})();
