// Netwerkmodel: boom met de dim city als wortel. Rekent kabels, lengtes, nummers, labels en stempels uit.
(function () {
  const KT = window.KT;
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const P = p => [+p[0] || 0, +p[1] || 0, +p[2] || 0];

  // Dichtstbijzijnde punt op een lijn (in bovenaanzicht); afstand gemeten in 3D langs de lijn.
  function projecteer(pts, p) {
    let best = null, cum = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = d3(a, b);
      const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      let t = l2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const q = [a[0] + vx * t, a[1] + vy * t, a[2] + (b[2] - a[2]) * t];
      const d = d2(q, p);
      if (!best || d < best.d) best = { d, afstand: cum + L * t, punt: q };
      cum += L;
    }
    return best;
  }
  // Punt op afstand s langs een lijn, plus de richting daar.
  function puntOp(pts, s) {
    s = Math.max(0, s);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = d3(a, b);
      if (s <= L || i === pts.length - 2) {
        const t = L ? Math.min(1, s / L) : 0, h = d2(a, b) || 1;
        return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], rx: (b[0] - a[0]) / h, ry: (b[1] - a[1]) / h };
      }
      s -= L;
    }
    return { p: pts[0], rx: 1, ry: 0 };
  }

  function basisVoor(dc, dcs) { return dcs.length > 1 ? (dc.nr || 1) * 100 : 0; }

  KT.volgendVrij = function (dcId, voorv) {
    const dcs = KT.tekening.dimcities || [], dc = dcs.find(d => d.id === dcId);
    if (!dc) return '';
    const gebruikt = new Set(Object.values(KT.project.nummers).map(n => n.nr));
    const basis = basisVoor(dc, dcs);
    for (let k = 1; k < 10000; k++) if (!gebruikt.has(voorv + (basis + k))) return voorv + (basis + k);
    return '';
  };

  // ---------- kabels als strakke bundel ----------
  // Alle kabels van één truss lopen als één ronde bundel: van de dim city over de vloer, de grote drop omhoog en
  // onder de truss langs. Elke kabel houdt de hele weg dezelfde plek in de bundel. Wie het eerst de bundel verlaat
  // (dichtstbijzijnde drop) ligt onderin, zodat niemand een andere kabel kruist. Bochten zijn rond.
  // schaal: alleen voor de palette (dikkere kabels zodat je ze ziet); Vectorworks krijgt schaal 1 (echte maat).
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, f) => [a[0] * f, a[1] * f, a[2] * f],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f],
  };
  // vector v om as k (eenheid) draaien over hoek h (Rodrigues)
  const draai = (v, k, h) => {
    const c = Math.cos(h), sn = Math.sin(h);
    return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), sn)), V.mul(k, V.dot(k, v) * (1 - c)));
  };

  // Ronde bochten: elke hoek wordt een boog (kwadratische bezier). pts = [{p, t}], t = afstand langs het oorspronkelijke pad.
  function rondeBochten(pts, straal, stappen) {
    if (pts.length < 3) return pts.slice();
    const uit = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const A = pts[i - 1], B = pts[i], C = pts[i + 1];
      const d1 = V.sub(B.p, A.p), d2 = V.sub(C.p, B.p), L1 = V.len(d1), L2 = V.len(d2);
      if (L1 < 1e-6 || L2 < 1e-6) { uit.push(B); continue; }
      const u1 = V.mul(d1, 1 / L1), u2 = V.mul(d2, 1 / L2);
      const hoek = Math.acos(Math.max(-1, Math.min(1, V.dot(u1, u2))));
      if (hoek < 0.03) { uit.push(B); continue; }
      const a = Math.min(straal * Math.tan(hoek / 2), L1 * 0.5, L2 * 0.5);
      const P1 = V.sub(B.p, V.mul(u1, a)), P2 = V.add(B.p, V.mul(u2, a));
      const t1 = B.t - (B.t - A.t) * a / L1, t2 = B.t + (C.t - B.t) * a / L2;
      const n = Math.max(3, Math.round(stappen * hoek / (Math.PI / 2)));
      for (let k = 0; k <= n; k++) {
        const f = k / n, g = 1 - f;
        const p = V.add(V.add(V.mul(P1, g * g), V.mul(B.p, 2 * g * f)), V.mul(P2, f * f));
        uit.push({ p, t: t1 + (t2 - t1) * f });
      }
    }
    uit.push(pts[pts.length - 1]);
    // t moet oplopen (nodig voor het knippen in stukken)
    for (let i = 1; i < uit.length; i++) if (uit[i].t <= uit[i - 1].t) uit[i].t = uit[i - 1].t + 1e-6;
    return uit;
  }

  // Assenkruis langs de lijn: U = opzij, W = 'omhoog' in de doorsnede. Op liggende stukken wijst W echt omhoog
  // (zo ligt 'onderin de bundel' ook echt onderin); op staande stukken draait het kruis geleidelijk mee.
  function assen(pts) {
    const n = pts.length, T = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(n - 1, i + 1)].p;
      T.push(V.norm(V.sub(b, a)));
    }
    const rechtop = t => {
      const u = Math.abs(t[2]) > 0.999 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], t));
      return u;
    };
    // meedraaiend kruis (zonder te tollen)
    const U = [rechtop(T[0])];
    for (let i = 1; i < n; i++) {
      const as = V.cross(T[i - 1], T[i]), sn = V.len(as);
      let u = U[i - 1];
      if (sn > 1e-8) u = draai(u, V.mul(as, 1 / sn), Math.atan2(sn, V.dot(T[i - 1], T[i])));
      u = V.norm(V.sub(u, V.mul(T[i], V.dot(u, T[i]))));
      U.push(u);
    }
    // gewenste draaiing: liggend -> W omhoog; staand -> geleidelijk tussen de liggende stukken
    const hoekVan = i => {
      const doel = rechtop(T[i]);
      return Math.atan2(V.dot(V.cross(U[i], doel), T[i]), V.dot(U[i], doel));
    };
    const ligt = T.map(t => Math.abs(t[2]) < 0.7);
    const phi = new Array(n).fill(null);
    for (let i = 0; i < n; i++) if (ligt[i]) phi[i] = hoekVan(i);
    for (let i = 1; i < n; i++) if (phi[i] != null && phi[i - 1] != null) {      // geen sprong van 2π
      while (phi[i] - phi[i - 1] > Math.PI) phi[i] -= 2 * Math.PI;
      while (phi[i] - phi[i - 1] < -Math.PI) phi[i] += 2 * Math.PI;
    }
    const s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + V.len(V.sub(pts[i].p, pts[i - 1].p)));
    for (let i = 0; i < n; i++) if (phi[i] == null) {
      let a = i - 1; while (a >= 0 && phi[a] == null) a--;
      let b = i + 1; while (b < n && phi[b] == null) b++;
      if (a < 0 && b >= n) phi[i] = 0;
      else if (a < 0) phi[i] = phi[b];
      else if (b >= n) phi[i] = phi[a];
      else {
        let pb = phi[b];
        while (pb - phi[a] > Math.PI) pb -= 2 * Math.PI;
        while (pb - phi[a] < -Math.PI) pb += 2 * Math.PI;
        phi[i] = phi[a] + (pb - phi[a]) * (s[i] - s[a]) / ((s[b] - s[a]) || 1);
      }
    }
    return pts.map((q, i) => {
      const u = draai(U[i], T[i], phi[i]);
      return { u, w: V.cross(T[i], u) };
    });
  }

  // Plekken in een ronde bundel (zeshoekig gestapeld), van onder naar boven
  function bundelPlekken(n, d) {
    const kand = [], K = Math.ceil(Math.sqrt(n)) + 2, h = d * Math.sqrt(3) / 2;
    for (let j = -K; j <= K; j++) for (let i = -K; i <= K; i++) {
      const x = (i + (Math.abs(j) % 2) * 0.5) * d, y = j * h;
      kand.push([x, y]);
    }
    kand.sort((a, b) => (Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1])) || (Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])));
    const plek = kand.slice(0, n);
    const mx = plek.reduce((s, p) => s + p[0], 0) / (n || 1), my = plek.reduce((s, p) => s + p[1], 0) / (n || 1);
    plek.forEach(p => { p[0] -= mx; p[1] -= my; });
    plek.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
    const R = plek.reduce((m, p) => Math.max(m, Math.hypot(p[0], p[1])), 0) + d / 2;
    return { plek, R };
  }

  KT.kabelPaden = function (kabels, trussen, tk, inst, schaal) {
    schaal = +schaal > 0 ? +schaal : 1;
    const tussen = Math.max(0, Math.min(0.05, +inst.kabelAfstand || 0)) * schaal;
    const kleurVan = (k, st) => inst.kleurKabels === 'lengte' ? KT.kleurVoor(st.m) : KT.typeKleur3D(k.type);

    // kabels per truss (= per bundel)
    const perTruss = {};
    kabels.forEach((k, i) => { if (trussen[k.truss]) (perTruss[k.truss] = perTruss[k.truss] || []).push(i); });
    // bundels van dezelfde dim city liggen op de vloer naast elkaar
    const perDc = {};
    Object.keys(perTruss).forEach(id => { const dc = trussen[id].dc; (perDc[dc] = perDc[dc] || []).push(id); });

    const uit = [], bundels = {};
    Object.keys(perTruss).forEach(id => {
      const T = trussen[id], lijst = perTruss[id];
      const d = Math.max(...lijst.map(i => KT.diameter(kabels[i].type))) / 1000 * schaal + tussen;
      const volgorde = lijst.slice().sort((x, y) => (kabels[x].sDrop - kabels[y].sDrop)
        || String(kabels[x].nr).localeCompare(String(kabels[y].nr), 'nl', { numeric: true }));
      const { plek, R } = bundelPlekken(volgorde.length, d);
      bundels[id] = R;
      const buren = perDc[T.dc], nr = buren.indexOf(id);
      const opzij = (nr - (buren.length - 1) / 2) * (2 * R + 0.03 * schaal);

      // hartlijn van de bundel: op de vloer erop, onder de truss eronder
      const nTruss = T.pts.length, start = T.pad.length - nTruss;
      let t = 0;
      const hart = T.pad.map((p, i) => {
        if (i) t += d3(T.pad[i - 1], p);
        const z = i >= start ? p[2] - R : (p[2] < 0.01 ? R : p[2]);
        return { p: [p[0], p[1], z], t };
      });
      const rond = rondeBochten(hart, Math.max(0.3, R * 5), 10);
      const kruis = assen(rond);

      // punt van een kabel op afstand tt langs de bundel
      const op = (pl, tt) => {
        let i = 0;
        while (i < rond.length - 2 && rond[i + 1].t < tt) i++;
        const A = rond[i], B = rond[i + 1], f = Math.max(0, Math.min(1, (tt - A.t) / ((B.t - A.t) || 1)));
        const pa = V.add(A.p, V.add(V.mul(kruis[i].u, pl[0] + opzij), V.mul(kruis[i].w, pl[1])));
        const pb = V.add(B.p, V.add(V.mul(kruis[i + 1].u, pl[0] + opzij), V.mul(kruis[i + 1].w, pl[1])));
        return V.lerp(pa, pb, f);
      };

      // kabels die bij dezelfde drop uitstappen: de onderste eerst, een kabeldikte uit elkaar
      const perDrop = {};
      volgorde.forEach((i, r) => { const k = kabels[i]; (perDrop[k.drop] = perDrop[k.drop] || []).push(r); });

      volgorde.forEach((i, r) => {
        const k = kabels[i], pl = plek[r];
        const groep = perDrop[k.drop], j = groep.indexOf(r);
        const tUit = Math.max(0, k.sDrop + (j - (groep.length - 1) / 2) * d);
        const lijst2 = [];
        rond.forEach((q, n) => {
          if (q.t >= tUit - 1e-6) return;
          lijst2.push({ t: q.t, p: V.add(q.p, V.add(V.mul(kruis[n].u, pl[0] + opzij), V.mul(kruis[n].w, pl[1]))) });
        });
        const boven = op(pl, tUit);
        lijst2.push({ t: tUit, p: boven });
        const tEind = k.sDrop + k.val;
        if (k.val > 0.01) {
          const onder = [boven[0], boven[1], (k.dropPunt ? k.dropPunt[2] : boven[2]) - k.val];
          const staart = rondeBochten([lijst2[lijst2.length - 2] || lijst2[0], lijst2[lijst2.length - 1], { t: tEind, p: onder }],
            Math.max(0.15, d * 6), 8);
          lijst2.pop(); if (lijst2.length) lijst2.pop();
          staart.forEach(q => lijst2.push(q));
        }
        for (let n = 1; n < lijst2.length; n++) if (lijst2[n].t <= lijst2[n - 1].t) lijst2[n].t = lijst2[n - 1].t + 1e-6;
        if (lijst2.length < 2) return;

        // opknippen in de stukken (25 m, 10 m …), elk in zijn eigen kleur
        k.stukken.forEach((st, jj) => {
          const t0 = Math.max(0, st.s1), t1 = jj === 0 ? lijst2[lijst2.length - 1].t : st.s0;
          if (t1 - t0 < 0.01) return;
          const punten = knip(lijst2, t0, t1);
          if (punten.length < 2) return;
          uit.push({ nummer: k.nr, type: k.type.naam, kort: k.type.kort, lengte: KT.lengteTekst(st.m), totaal: k.totaal,
            diameter: KT.diameter(k.type), kleur: kleurVan(k, st), klasse: (T.t.klasse || T.t.naam) || '', dc: k.dc, drop: k.drop,
            punten: punten.map(p => p.map(v => Math.round(v * 1000) / 1000)) });
        });
      });
    });
    uit.bundels = bundels;          // straal van elke bundel (voor de dropklem in de 3D)
    return uit;
  };

  // stuk van een pad tussen t0 en t1 (lijst = [{t, p}] met oplopende t)
  function knip(lijst, t0, t1) {
    const uit = [];
    const zet = p => { const q = uit[uit.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 1e-4) uit.push(p); };
    for (let i = 0; i < lijst.length - 1; i++) {
      const A = lijst[i], B = lijst[i + 1];
      const lo = Math.max(t0, A.t), hi = Math.min(t1, B.t);
      if (hi < lo) continue;
      const f = tt => V.lerp(A.p, B.p, (tt - A.t) / ((B.t - A.t) || 1));
      zet(f(lo)); zet(f(hi));
    }
    return uit;
  }

  KT.bereken = function () {
    const tk = KT.tekening, pr = KT.project, inst = pr.instellingen, w = [];
    const dcs = tk.dimcities || [], tol = +inst.tolerantie || 2;
    const knopen = {};
    dcs.forEach(dc => { knopen[dc.id] = { id: dc.id, soort: 'dimcity', p: P([dc.x, dc.y, dc.z]), ouder: null, len: 0, dc: dc.id }; });

    const dichtst = (p, filter) => {
      let b = null;
      for (const k of Object.values(knopen)) {
        if (filter && !filter(k)) continue;
        const d = d2(k.p, p);
        if (!b || d < b.d) b = { k, d };
      }
      return b;
    };

    // --- vloerroutes aan de boom hangen ---
    const leg = (r, ouder) => {
      let vorige = ouder;
      r.punten.forEach((q, i) => {
        const p = P(q), id = r.id + ':' + i;
        knopen[id] = { id, soort: i === r.punten.length - 1 ? 'voet' : 'bocht', p, ouder: vorige.id, len: d3(vorige.p, p), stuk: 'vloer', dc: vorige.dc };
        vorige = knopen[id];
      });
    };
    let open = (tk.vloerroutes || []).filter(r => r.punten && r.punten.length > 1);
    open = open.filter(r => { const b = dichtst(r.punten[0], k => k.soort === 'dimcity'); if (b && b.d <= tol) { leg(r, b.k); return false; } return true; });
    let voortgang = true;
    while (open.length && voortgang) {
      voortgang = false;
      open = open.filter(r => { const b = dichtst(r.punten[0]); if (b && b.d <= tol) { leg(r, b.k); voortgang = true; return false; } return true; });
    }
    open.forEach(r => {
      const b = dichtst(r.punten[0]);
      if (b) { leg(r, b.k); w.push(`Vloerroute ${r.id} begint ${b.d.toFixed(1)} m van het dichtstbijzijnde punt (${b.k.id}).`); }
      else w.push(`Vloerroute ${r.id} heeft geen dim city.`);
    });

    // --- truss-lijnen: grote drop van de vloer naar het begin van de truss ---
    const trussen = {};
    (tk.trusslijnen || []).forEach(t => {
      if (!t.punten || t.punten.length < 2) return;
      const pts = t.punten.map(P);
      const b = dichtst(pts[0], k => k.soort === 'dimcity' || k.soort === 'bocht' || k.soort === 'voet');
      if (!b) { w.push(`Truss-lijn ${t.naam || t.id} heeft geen vloerroute of dim city.`); return; }
      if (b.d > tol) w.push(`Truss-lijn ${t.naam || t.id} begint ${b.d.toFixed(1)} m naast de vloerroute.`);
      let vorige = b.k; const cum = [0];
      pts.forEach((p, i) => {
        const id = t.id + ':' + i;
        knopen[id] = { id, soort: i ? 'truss' : 'trussbegin', p, ouder: vorige.id, len: d3(vorige.p, p), stuk: i ? 'truss' : 'drop', dc: vorige.dc, truss: t.id };
        if (i) cum.push(cum[i - 1] + d3(pts[i - 1], p));
        vorige = knopen[id];
      });
      let naarDc = 0, k = knopen[t.id + ':0']; const pad = [pts[0]];
      while (k.ouder) { naarDc += k.len; k = knopen[k.ouder]; pad.unshift(k.p); }
      trussen[t.id] = { t, pts, cum, naarDc, dc: k.id, pad: pad.concat(pts.slice(1)), lengte: cum[cum.length - 1] };
    });

    // --- kabels per drop ---
    const kabels = [], labels = [], stempels = [], extraStukken = [];
    const gebruikt = new Set(Object.values(pr.nummers).map(n => n.nr));
    const vrij = (dc, voorv) => {
      const basis = basisVoor(dc, dcs);
      for (let k = 1; k < 10000; k++) { const c = voorv + (basis + k); if (!gebruikt.has(c)) return c; }
      return voorv + '?';
    };
    // één regel in een kader: kabelsymbool (korte naam, lengte, balk = lengtekleur, rand = typekleur) + nummer
    const rij = (k, m) => ({ kort: k.type.kort, lengte: KT.lengteTekst(m), kleur: KT.kleurVoor(m), nummer: k.nr,
      rand: k.type.kleur || '#000000', vet: !!k.type.vet });
    const kleurDrop = inst.kleurDrop || '#33cc00', kleurRoute = inst.kleurRoute || '#ff0000', kleurDB = inst.kleurDB || '#ff0000';
    // locatienaam van de route waar een punt op ligt (voor de titel van het rode kader)
    const locatieBij = (p, T) => {
      let best = null;
      [].concat(tk.vloerroutes || [], T ? [T.t] : []).forEach(r => {
        const pts = (r.punten || []).map(P);
        if (pts.length < 2) return;
        const pj = projecteer(pts, p);
        if (pj && (!best || pj.d < best.d)) best = { d: pj.d, r };
      });
      return best && best.d < 0.5 ? (best.r.locatie || '') : '';
    };
    const koppel = {};   // sleutel -> label bij een koppelpunt
    const dropDichtheid = inst.dropLengtes || [];

    (tk.drops || []).forEach(d => {
      const T = trussen[d.truss];
      if (!T) { w.push(`Drop ${d.id} hoort niet bij een bekende truss-lijn.`); return; }
      const di = KT.dropInst(d.id), naam = di.naam || d.id;
      const pj = projecteer(T.pts, P([d.x, d.y, d.z]));
      const afstand = pj.afstand, p = pj.punt;
      const val = (di.valhoogte !== '' && di.valhoogte != null) ? +di.valhoogte : p[2];
      const nodig = val + (+di.slinger || 0);
      const sDrop = T.naarDc + afstand, dc = dcs.find(x => x.id === T.dc);
      const eigen = [];

      (di.behoefte || []).forEach(b => {
        const type = KT.type(b.type);
        if (!type) return;
        const lens = type.lengtes.map(x => +x.m).filter(x => x > 0).sort((a, c) => a - c);
        if (!lens.length) { w.push(`${type.naam} heeft geen lengtes in de bibliotheek.`); return; }
        const voorv = b.voorvoegsel || type.voorvoegsel || type.kort;
        for (let i = 0; i < (+b.aantal || 1); i++) {
          const sleutel = d.id + '|' + b.id + '|' + i;
          let n = pr.nummers[sleutel];
          if (!n) {
            if (pr.slot) { n = { nr: '?' }; w.push(`Project op slot: ${type.naam} bij ${naam} heeft nog geen nummer.`); }
            else { n = pr.nummers[sleutel] = { nr: vrij(dc, voorv) }; gebruikt.add(n.nr); }
          }
          // drop uit één stuk: kortste passende (25, anders 35)
          let dl = lens.filter(x => dropDichtheid.includes(x)); if (!dl.length) dl = lens;
          let L = dl.find(x => x >= nodig - 0.001);
          if (L == null) { L = dl[dl.length - 1]; w.push(`${naam}: ${type.naam} ${L} m is te kort voor de drop (${nodig.toFixed(1)} m nodig).`); }
          let s = sDrop - Math.max(0, L - nodig);       // hier eindigt het dropstuk (koppelpunt)
          const stukken = [{ m: L, s0: sDrop, s1: s }];
          let rest = s + (+inst.slackDimCity || 0);
          const max = lens[lens.length - 1];
          let teller = 0;
          while (rest > 0.001 && teller++ < 200) {
            const m = rest > max ? max : lens.find(x => x >= rest - 0.001);
            stukken.push({ m, s0: s, s1: s - m });
            s -= m; rest -= m;
          }
          const k = { sleutel, nr: n.nr, handmatig: !!n.handmatig, type, voorv, drop: d.id, dc: T.dc, truss: d.truss, blok: b.blok || '', stukken, afstand, totaal: stukken.reduce((a, x) => a + x.m, 0),
            sDrop, val: isFinite(val) ? Math.max(0, val) : 0, dropPunt: p };
          kabels.push(k); eigen.push(k);

          // koppelpunten: einde van elk stuk behalve het laatste
          stukken.slice(0, -1).forEach(st => {
            if (st.s1 <= 0.05) return;
            const ks = T.t.id + '@' + st.s1.toFixed(1);
            if (!koppel[ks]) {
              const q = puntOp(T.pad, st.s1);
              const opTruss = st.s1 > T.naarDc ? st.s1 - T.naarDc : null;
              const locatie = opTruss != null ? (T.t.locatie || '') : locatieBij(q.p, null);
              koppel[ks] = { soort: 'koppel', laag: 'cabling', x: q.p[0], y: q.p[1], z: q.p[2], titel: locatie, kader: kleurRoute, klasse: T.t.klasse || T.t.naam || '', rijen: [], opTruss, truss: T.t.id };
            }
            koppel[ks].rijen.push(rij(k, st.m));
          });
        }
      });

      // vlaggetje bij de drop
      labels.push({ soort: 'vlag', laag: 'cabling', x: p[0], y: p[1], z: p[2], titel: 'Drop > ' + naam, kader: kleurDrop, klasse: T.t.klasse || T.t.naam || '', rijen: eigen.map(k => rij(k, k.stukken[0].m)) });
      if (eigen.length) extraStukken.push({ a: p, b: [p[0], p[1], p[2] - val], soort: 'drop', dc: T.dc, id: d.id, nrs: eigen.map(k => k.nr) });

      // stempels voor de lampen van deze drop
      const multis = eigen.filter(k => k.type.stempel === 'multi'), datas = eigen.filter(k => k.type.stempel === 'data');
      const opPoort = {};          // kabelnummer -> poort -> lampnamen (voor de blokken)
      (tk.lampen || []).filter(l => l.drop === d.id).forEach(l => {
        const li = di.lampen[l.uuid] || {}, m = multis[+li.multi || 0], dt = datas[+li.data || 0];
        stempels.push({ uuid: l.uuid, naam: l.naam || '', drop: d.id, circuitName: m ? m.nr : '', circuitNumber: li.circuit != null ? String(li.circuit) : '', uf2: dt ? dt.nr : '', uf3: li.poort != null ? String(li.poort) : '' });
        const zet = (k, poort) => { if (!k || !poort) return; const a = (opPoort[k.nr] = opPoort[k.nr] || {}); (a[poort] = a[poort] || []).push(l.naam || l.uuid); };
        zet(m, li.circuit); zet(dt, li.poort);
      });

      // blokken op de infra-laag: breakout (rondjes per circuit) of splitter (poorten met wat erop zit)
      eigen.filter(k => k.blok && KT.blok(k.blok)).forEach((k, i) => {
        const b = KT.blok(k.blok), n = Math.max(1, +b.poorten || 1);
        const breakout = k.type.stempel === 'multi';
        const poorten = [];
        for (let j = 1; j <= n; j++) poorten.push({ kort: ((opPoort[k.nr] || {})[j] || []).join(', ') });
        labels.push({ soort: 'blok', laag: 'infra', x: p[0], y: p[1], z: p[2], rijNr: i, titel: breakout ? b.naam + ' ' + k.nr : b.naam + '-' + k.nr,
          blokSoort: breakout ? 'breakout' : 'splitter', poorten: n, letter: k.voorv, kader: breakout ? '#e53935' : kleurRoute,
          klasse: T.t.klasse || T.t.naam || '', rijen: breakout ? [] : poorten });
      });
    });
    Object.values(koppel).forEach(l => labels.push(l));

    // dropsymbool aan het begin van elke kabeltruss + label bij de dim city
    Object.values(trussen).forEach(T => {
      const rijen = [];
      kabels.filter(k => k.truss === T.t.id).forEach(k => {
        const st = k.stukken.find(x => x.s1 <= T.naarDc + 0.001 && x.s0 >= T.naarDc - 0.001);
        if (st) rijen.push(rij(k, st.m));
      });
      if (rijen.length) labels.push({ soort: 'bol', laag: 'cabling', x: T.pts[0][0], y: T.pts[0][1], z: T.pts[0][2], titel: 'Drop > Floor', kader: kleurDrop, klasse: T.t.klasse || T.t.naam || '', rijen });
    });
    dcs.forEach(dc => {
      const rijen = kabels.filter(k => k.dc === dc.id).map(k => rij(k, k.stukken[k.stukken.length - 1].m));
      if (rijen.length) labels.push({ soort: 'dimcity', laag: 'cabling', x: +dc.x || 0, y: +dc.y || 0, z: +dc.z || 0, titel: dc.naam || dc.id, kader: kleurDB, klasse: dc.id, rijen });
    });

    // lengtehulp: streepjes waar een standaardkabel precies uitkomt
    if (inst.lengtehulp) {
      Object.values(trussen).forEach(T => {
        const refs = [0].concat(Object.values(koppel).filter(l => l.truss === T.t.id && l.opTruss != null).map(l => l.opTruss));
        const gezien = new Set();
        refs.forEach(r => (inst.lengtehulpLengtes || []).forEach(L => {
          const pos = r + (+L);
          if (pos > T.lengte + 0.001 || gezien.has(pos.toFixed(1))) return;
          gezien.add(pos.toFixed(1));
          const q = puntOp(T.pts, pos);
          labels.push({ soort: 'streepje', laag: 'cabling', x: q.p[0], y: q.p[1], z: q.p[2], nx: -q.ry, ny: q.rx, titel: KT.lengteTekst(L), klasse: T.t.klasse || T.t.naam || '', rijen: [] });
        }));
      });
    }

    // stukken van de boom, met welke nummers erover lopen (voor de 3D-weergave)
    const over = {};
    kabels.forEach(k => {
      const T = trussen[k.truss];
      for (let i = T.cum.length - 1; i >= 1; i--) if (k.afstand > T.cum[i - 1] + 0.001) (over[T.t.id + ':' + i] = over[T.t.id + ':' + i] || []).push(k.nr);
      let n = knopen[T.t.id + ':0'];
      while (n && n.ouder) { (over[n.id] = over[n.id] || []).push(k.nr); n = knopen[n.ouder]; }
    });
    const stukken = Object.values(knopen).filter(k => k.ouder).map(k => ({ a: knopen[k.ouder].p, b: k.p, soort: k.stuk, dc: k.dc, id: k.id, nrs: over[k.id] || [] })).concat(extraStukken);

    // --- elke kabel als eigen 3D-pad naast de andere, opgeknipt per stuk (voor de 3D en Vectorworks) ---
    const kabelpaden = KT.kabelPaden(kabels, trussen, tk, inst);
    const dikte = Math.max(1, Math.min(10, +inst.kabelDikte3D || 1));
    const kabelpaden3D = dikte === 1 ? kabelpaden : KT.kabelPaden(kabels, trussen, tk, inst, dikte);

    const dubbel = {};
    kabels.forEach(k => { dubbel[k.nr] = (dubbel[k.nr] || 0) + 1; });
    Object.keys(dubbel).filter(n => dubbel[n] > 1 && n !== '?').forEach(n => w.push(`Nummer ${n} komt ${dubbel[n]}× voor.`));

    KT.res = { knopen, stukken, kabels, labels, stempels, waarschuwingen: w, trussen, kabelpaden, kabelpaden3D };
    return KT.res;
  };
})();
