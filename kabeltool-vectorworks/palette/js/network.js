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

  // Elke kabel een eigen pad: van de dim city over de vloer, de grote drop omhoog, over de truss en de drop af.
  // Kabels die over hetzelfde stuk lopen liggen naast/boven elkaar (doorsnede als raster).
  // Daarna opgeknipt in de stukken (25 m, 10 m …) zodat elk stuk zijn eigen kleur en lengte heeft.
  KT.kabelPaden = function (kabels, trussen, tk, inst) {
    const afst = +inst.kabelAfstand > 0 ? +inst.kabelAfstand : 0.03;
    const sleutelPt = p => p.map(v => (+v).toFixed(2)).join(',');
    const sleutel = (a, b) => [sleutelPt(a), sleutelPt(b)].sort().join('|');

    // 1. basispad per kabel: lijst segmenten {a, b, t0, t1, key}
    const basis = kabels.map(k => {
      const T = trussen[k.truss];
      const segs = [];
      if (!T) return segs;
      let t = 0;
      for (let i = 0; i < T.pad.length - 1 && t < k.sDrop - 1e-6; i++) {
        const a = T.pad[i], b = T.pad[i + 1], L = d3(a, b);
        if (L < 1e-6) continue;
        const key = sleutel(a, b);
        if (t + L <= k.sDrop + 1e-6) segs.push({ a, b, t0: t, t1: t + L, key });
        else {
          const r = (k.sDrop - t) / L;
          segs.push({ a, b: [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r], t0: t, t1: k.sDrop, key });
        }
        t += L;
      }
      const p = k.dropPunt;
      if (p && k.val > 0.01) segs.push({ a: p, b: [p[0], p[1], p[2] - k.val], t0: k.sDrop, t1: k.sDrop + k.val, key: 'drop:' + k.drop });
      return segs;
    });

    // 2. per segment: welke kabels lopen er (gesorteerd op nummer)
    const perSeg = {};
    kabels.forEach((k, i) => basis[i].forEach(s => { (perSeg[s.key] = perSeg[s.key] || []).push(i); }));
    Object.values(perSeg).forEach(l => l.sort((x, y) => String(kabels[x].nr).localeCompare(String(kabels[y].nr), 'nl', { numeric: true })));

    const offset = (s, i) => {
      const lijst = perSeg[s.key], n = lijst.length, idx = lijst.indexOf(i);
      const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
      const col = idx % cols, row = Math.floor(idx / cols);
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], h = Math.hypot(dx, dy);
      let u, v;
      if (h < 1e-6) { u = [1, 0, 0]; v = [0, 1, 0]; }          // verticaal
      else { u = [-dy / h, dx / h, 0]; v = [0, 0, 1]; }
      const opVloer = Math.abs(s.a[2]) < 0.01 && Math.abs(s.b[2]) < 0.01 && h >= 1e-6;
      const cu = (col - (cols - 1) / 2) * afst;
      const cv = opVloer ? (row + 0.5) * afst : (row - (rows - 1) / 2) * afst;   // op de vloer: erop, niet erin
      return [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv, u[2] * cu + v[2] * cv];
    };

    // 3. per kabel een lijst {t, p} met verschuiving, daarna knippen per stuk
    const knip = (lijst, t0, t1) => {
      const uit = [];
      const zet = p => { const q = uit[uit.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 1e-4) uit.push(p); };
      for (let i = 0; i < lijst.length - 1; i++) {
        const A = lijst[i], B = lijst[i + 1];
        if (B.t > A.t + 1e-9) {
          const lo = Math.max(t0, A.t), hi = Math.min(t1, B.t);
          if (hi < lo) continue;
          const f = tt => { const r = (tt - A.t) / (B.t - A.t); return [A.p[0] + (B.p[0] - A.p[0]) * r, A.p[1] + (B.p[1] - A.p[1]) * r, A.p[2] + (B.p[2] - A.p[2]) * r]; };
          zet(f(lo)); zet(f(hi));
        } else if (A.t >= t0 - 1e-9 && A.t <= t1 + 1e-9) { zet(A.p); zet(B.p); }
      }
      return uit;
    };

    const uit = [];
    kabels.forEach((k, i) => {
      const lijst = [];
      basis[i].forEach(s => {
        const o = offset(s, i);
        lijst.push({ t: s.t0, p: [s.a[0] + o[0], s.a[1] + o[1], s.a[2] + o[2]] });
        lijst.push({ t: s.t1, p: [s.b[0] + o[0], s.b[1] + o[1], s.b[2] + o[2]] });
      });
      if (lijst.length < 2) return;
      const tEind = k.sDrop + k.val, T = trussen[k.truss];
      k.stukken.forEach((st, j) => {
        const t0 = Math.max(0, st.s1), t1 = j === 0 ? tEind : st.s0;
        if (t1 - t0 < 0.01) return;
        const punten = knip(lijst, t0, t1);
        if (punten.length < 2) return;
        const kleur = inst.kleurKabels === 'type' && k.type.kleur ? k.type.kleur : KT.kleurVoor(st.m);
        uit.push({ nummer: k.nr, type: k.type.naam, kort: k.type.kort, lengte: KT.lengteTekst(st.m), totaal: k.totaal,
          diameter: KT.diameter(k.type), kleur, klasse: (T && (T.t.klasse || T.t.naam)) || '', dc: k.dc, drop: k.drop,
          punten: punten.map(p => p.map(v => Math.round(v * 1000) / 1000)) });
      });
    });
    return uit;
  };

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
    const rij = (k, m) => ({ kort: k.type.kort, lengte: KT.lengteTekst(m), kleur: KT.kleurVoor(m), nummer: k.nr });
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
              koppel[ks] = { soort: 'koppel', laag: 'cabling', x: q.p[0], y: q.p[1], z: q.p[2], titel: '', klasse: T.t.klasse || T.t.naam || '', rijen: [], opTruss: st.s1 > T.naarDc ? st.s1 - T.naarDc : null, truss: T.t.id };
            }
            koppel[ks].rijen.push(rij(k, st.m));
          });
        }
      });

      // vlaggetje bij de drop
      labels.push({ soort: 'vlag', laag: 'cabling', x: p[0], y: p[1], z: p[2], titel: naam, klasse: T.t.klasse || T.t.naam || '', rijen: eigen.map(k => rij(k, k.stukken[0].m)) });
      // blokken op de infra-laag
      eigen.filter(k => k.blok && KT.blok(k.blok)).forEach((k, i) => {
        labels.push({ soort: 'blok', laag: 'infra', x: p[0], y: p[1], z: p[2], rijNr: i, titel: KT.blok(k.blok).naam + ' ' + k.nr, klasse: T.t.klasse || T.t.naam || '', rijen: [] });
      });
      if (eigen.length) extraStukken.push({ a: p, b: [p[0], p[1], p[2] - val], soort: 'drop', dc: T.dc, id: d.id, nrs: eigen.map(k => k.nr) });

      // stempels voor de lampen van deze drop
      const multis = eigen.filter(k => k.type.stempel === 'multi'), datas = eigen.filter(k => k.type.stempel === 'data');
      (tk.lampen || []).filter(l => l.drop === d.id).forEach(l => {
        const li = di.lampen[l.uuid] || {}, m = multis[+li.multi || 0], dt = datas[+li.data || 0];
        stempels.push({ uuid: l.uuid, naam: l.naam || '', drop: d.id, circuitName: m ? m.nr : '', circuitNumber: li.circuit != null ? String(li.circuit) : '', uf2: dt ? dt.nr : '', uf3: li.poort != null ? String(li.poort) : '' });
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
      if (rijen.length) labels.push({ soort: 'bol', laag: 'cabling', x: T.pts[0][0], y: T.pts[0][1], z: T.pts[0][2], titel: T.t.naam || T.t.id, klasse: T.t.klasse || T.t.naam || '', rijen });
    });
    dcs.forEach(dc => {
      const rijen = kabels.filter(k => k.dc === dc.id).map(k => rij(k, k.stukken[k.stukken.length - 1].m));
      if (rijen.length) labels.push({ soort: 'dimcity', laag: 'cabling', x: +dc.x || 0, y: +dc.y || 0, z: +dc.z || 0, titel: dc.id, klasse: dc.id, rijen });
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

    const dubbel = {};
    kabels.forEach(k => { dubbel[k.nr] = (dubbel[k.nr] || 0) + 1; });
    Object.keys(dubbel).filter(n => dubbel[n] > 1 && n !== '?').forEach(n => w.push(`Nummer ${n} komt ${dubbel[n]}× voor.`));

    KT.res = { knopen, stukken, kabels, labels, stempels, waarschuwingen: w, trussen, kabelpaden };
    return KT.res;
  };
})();
