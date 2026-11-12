// Kabelsymbool: blokje 1 hoog op 5 breed, links korte naam, rechts lengte, gekleurde balk over de volle breedte.
(function () {
  const KT = window.KT;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  KT.lengteTekst = m => String(m).replace('.', ',');
  KT.kleurVoor = m => (KT.project.instellingen.lengteKleuren || {})[String(m)] || '#9e9e9e';

  // Geeft een SVG-tekst. px = hoogte van het blokje op het scherm.
  KT.symboolSVG = function (kort, m, nummer, px) {
    const inst = KT.project.instellingen;
    const H = 20, B = H * (inst.symboolBreedte / inst.symboolHoogte || 5);
    const balk = H * 0.22, vak = H - balk;
    const past = t => Math.min(vak * 0.8, (B / 2 * 0.85) / (Math.max(String(t).length, 1) * 0.6));
    const lt = KT.lengteTekst(m);
    const nr = nummer ? `<text x="${B + 5}" y="${H / 2}" font-size="${H * 0.6}" dominant-baseline="central" fill="currentColor">${esc(nummer)}</text>` : '';
    const breed = B + (nummer ? 8 + String(nummer).length * H * 0.38 : 1);
    const schaal = (px || 22) / H;
    return `<svg class="ksym" xmlns="http://www.w3.org/2000/svg" width="${breed * schaal}" height="${(H + 1) * schaal}" viewBox="-0.5 -0.5 ${breed} ${H + 1}" font-family="Arial, Helvetica, sans-serif">
<rect x="0" y="0" width="${B}" height="${H}" fill="#fff" stroke="#000" stroke-width="0.8"/>
<rect x="0" y="${vak}" width="${B}" height="${balk}" fill="${esc(KT.kleurVoor(m))}" stroke="#000" stroke-width="0.8"/>
<line x1="${B / 2}" y1="0" x2="${B / 2}" y2="${vak}" stroke="#000" stroke-width="0.8"/>
<text x="${B / 4}" y="${vak / 2}" font-size="${past(kort)}" text-anchor="middle" dominant-baseline="central" fill="#000">${esc(kort)}</text>
<text x="${B * 0.75}" y="${vak / 2}" font-size="${past(lt)}" text-anchor="middle" dominant-baseline="central" fill="#000">${esc(lt)}</text>
${nr}</svg>`;
  };
})();
