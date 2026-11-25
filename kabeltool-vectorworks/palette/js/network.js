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

  // ---------- vectoren ----------
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


  // ---------- routenetwerk over de vloer ----------
  // Knopen: punten van de vloerroutes, dim cities en het begin van elke truss-lijn. Uiteinden van routes haken in op
  // andere routes (ook halverwege een stuk). Per dim city de kortste weg (Dijkstra) naar het begin van elke truss.
  function routeNetwerk(tk, dcs, trusslijnen, tol, waarschuw) {
    const nodes = [], adj = [], segs = [];
    const nieuw = p => { nodes.push([p[0], p[1], 0]); adj.push([]); return nodes.length - 1; };
    const verbind = (a, b) => { if (a === b) return; const L = d2(nodes[a], nodes[b]); adj[a].push([b, L]); adj[b].push([a, L]); };
    const routes = [];
    (tk.vloerroutes || []).forEach(r => {
      const pts = (r.punten || []).map(P);
      if (pts.length < 2) return;
      const ids = pts.map(p => nieuw(p));
      ids.forEach((n, i) => { if (i) { verbind(ids[i - 1], n); segs.push([ids[i - 1], n]); } });
      routes.push({ r, ids });
    });
    const hang = (p, uitsluiten) => {
      let best = null;
      nodes.forEach((q, i) => { if (uitsluiten(i)) return; const d = d2(q, p); if (!best || d < best.d) best = { d, i }; });
      segs.forEach(([a, b]) => {
        if (uitsluiten(a) || uitsluiten(b)) return;
        const A = nodes[a], B = nodes[b], vx = B[0] - A[0], vy = B[1] - A[1], l2 = vx * vx + vy * vy;
        if (!l2) return;
        const f = ((p[0] - A[0]) * vx + (p[1] - A[1]) * vy) / l2;
        if (f <= 0.001 || f >= 0.999) return;
        const q = [A[0] + vx * f, A[1] + vy * f, 0], d = d2(q, p);
        if (!best || d < best.d - 1e-9) best = { d, seg: [a, b], q };
      });
      return best;
    };
    const koppel = (n, best) => {
      if (best.seg) { const m = nieuw(best.q); verbind(best.seg[0], m); verbind(m, best.seg[1]); verbind(n, m); }
      else verbind(n, best.i);
    };
    routes.forEach(({ ids }) => {
      const eigen = new Set(ids);
      [ids[0], ids[ids.length - 1]].forEach(n => { const b = hang(nodes[n], i => eigen.has(i)); if (b && b.d <= tol) koppel(n, b); });
    });
    const dcKnoop = {};
    dcs.forEach(dc => {
      const p = [+dc.x || 0, +dc.y || 0, 0], n = nieuw(p);
      dcKnoop[dc.id] = n;
      const b = hang(p, i => i === n);
      if (b && b.d <= Math.max(tol, (+dc.maat || 1))) koppel(n, b);
    });
    const trussKnoop = {};
    trusslijnen.forEach(T => {
      const p = [T.pts[0][0], T.pts[0][1], 0], n = nieuw(p);
      trussKnoop[T.id] = n;
      const b = hang(p, i => i === n);
      if (!b) return;
      if (b.d > tol) waarschuw('let op', `Truss-lijn ${T.naam} begint ${b.d.toFixed(1)} m naast de vloerroute; de kabels lopen er toch heen.`, T.id, p);
      koppel(n, b);
    });
    const kortste = start => {
      const N = nodes.length, dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), klaar = new Array(N).fill(false);
      dist[start] = 0;
      for (let k = 0; k < N; k++) {
        let u = -1;
        for (let i = 0; i < N; i++) if (!klaar[i] && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || dist[u] === Infinity) break;
        klaar[u] = true;
        adj[u].forEach(([v, L]) => { if (dist[u] + L < dist[v]) { dist[v] = dist[u] + L; prev[v] = u; } });
      }
      return { dist, prev };
    };
    const paden = {};
    dcs.forEach(dc => { paden[dc.id] = kortste(dcKnoop[dc.id]); });
    // weg van de dim city naar het begin van de truss (punten op de vloer)
    const weg = (dcId, trussId) => {
      const W = paden[dcId], doel = trussKnoop[trussId];
      if (!W || doel == null || W.dist[doel] === Infinity) return null;
      const pts = [];
      for (let n = doel; n !== -1; n = W.prev[n]) pts.unshift(nodes[n].slice());
      return { pts, lengte: W.dist[doel] };
    };
    const stukken = [];
    segs.forEach(([a, b]) => stukken.push([nodes[a], nodes[b]]));
    return { weg, stukken };
  }

  // ---------- dropvorm tussen A (zijkant van de truss) en B (bij het object) ----------
  // Recht: strakke lijn. Boog: nette boog, nooit lager dan het laagste van de twee punten (hangt het doel hoger,
  // dan over de bovenkant). Realistisch: hangt door op de vrije lengte (kettinglijn; recht omlaag als lus).
  // Nooit door de vloer.
  function dropVorm(A, B, n2, vrij, vorm, r) {
    const koorde = V.len(V.sub(B, A)), uit = [];
    const vloer = p => [p[0], p[1], Math.max(r, p[2])];
    if (vorm === 'Recht' || !(vrij > koorde + 1e-3)) {
      for (let i = 0; i <= 12; i++) uit.push(vloer(V.lerp(A, B, i / 12)));
      return uit;
    }
    if (vorm === 'Boog') {
      const slack = vrij - koorde, k = Math.max(0.2, Math.min(0.35 * koorde + 0.5 * slack, 0.12 * koorde + 0.6 * slack + 0.2));
      let P1, P2;
      if (B[2] <= A[2]) {
        P1 = [A[0] + n2[0] * k, A[1] + n2[1] * k, A[2]];
        P2 = [B[0], B[1], B[2] + Math.min(A[2] - B[2], k) * 0.9];
      } else {
        const op = B[2] - A[2] + Math.min(1.5, k);
        P1 = [A[0] + n2[0] * k * 0.4, A[1] + n2[1] * k * 0.4, A[2] + op];
        P2 = [B[0], B[1], B[2] + Math.min(1.5, k) * 0.8];
      }
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, s = 1 - t;
        uit.push(vloer([0, 1, 2].map(c => s * s * s * A[c] + 3 * s * s * t * P1[c] + 3 * s * t * t * P2[c] + t * t * t * B[c])));
      }
      return uit;
    }
    // realistisch
    const h = Math.hypot(B[0] - A[0], B[1] - A[1]), v = B[2] - A[2];
    if (h < 0.05 * vrij) {
      // (bijna) recht onder elkaar: het overschot hangt als lus onder het doel
      const laag = A[2] - (vrij + A[2] - B[2]) / 2;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, z0 = A[2] + (B[2] - A[2]) * t;
        const zuig = Math.sin(Math.PI * t), diep = Math.min(z0, laag);
        const z = z0 - (z0 - diep) * zuig;
        const naar = 0.25 * Math.sin(Math.PI * t);
        uit.push(vloer([A[0] + (B[0] - A[0]) * t + n2[0] * naar, A[1] + (B[1] - A[1]) * t + n2[1] * naar, z]));
      }
      return uit;
    }
    // kettinglijn met booglengte vrij: sqrt(s²−v²) = 2a·sinh(h/2a)
    const doel = Math.sqrt(Math.max(1e-9, vrij * vrij - v * v));
    let lo = 1e-4, hi = 1e6;
    for (let i = 0; i < 200; i++) { const a = Math.sqrt(lo * hi); if (2 * a * Math.sinh(Math.min(700, h / (2 * a))) > doel) lo = a; else hi = a; }
    const a = Math.sqrt(lo * hi), x0 = h / 2 - a * Math.atanh(Math.max(-0.999999, Math.min(0.999999, v / vrij))), c = -a * Math.cosh(-x0 / a);
    for (let i = 0; i <= 32; i++) {
      const x = h * i / 32, t = i / 32;
      uit.push(vloer([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + a * Math.cosh((x - x0) / a) + c]));
    }
    return uit;
  }

  // ---------- kabels als 3D-pad ----------
  // Kabels liggen plat naast elkaar óp de truss, in de volgorde van de drops: wie het eerst afgaat ligt buiten aan zijn
  // dropkant, zodat niemand een andere kabel kruist. Bij de drop gaan ze over de rand naast elkaar langs de zijkant
  // naar beneden en dan in de gekozen dropvorm naar het object. Op de vloer liggen ze naast elkaar op de grond.
  // schaal: alleen voor de palette (dikkere kabels zodat je ze ziet); Vectorworks krijgt schaal 1 (echte maat).
  KT.kabelPaden = function (kabels, trussen, tk, inst, schaal) {
    schaal = +schaal > 0 ? +schaal : 1;
    const tussen = Math.max(0, Math.min(0.05, +inst.kabelAfstand || 0)) * schaal;
    const kleurVan = (k, st) => inst.kleurKabels === 'lengte' ? KT.kleurVoor(st.m) : KT.typeKleur3D(k.type);
    const nrCmp = (a, b) => String(a.nr).localeCompare(String(b.nr), 'nl', { numeric: true });
    const uit = [], bundels = {};

    const perTruss = {};
    kabels.forEach((k, i) => { if (trussen[k.truss] && k.weg) (perTruss[k.truss] = perTruss[k.truss] || []).push(i); });
    const perDc = {};
    Object.keys(perTruss).forEach(id => new Set(perTruss[id].map(i => kabels[i].dc)).forEach(dc => (perDc[dc] = perDc[dc] || []).push(id)));

    Object.keys(perTruss).forEach(id => {
      const T = trussen[id], lijst = perTruss[id];
      const dmax = Math.max(...lijst.map(i => KT.diameter(kabels[i].type))) / 1000 * schaal;
      const d = dmax + tussen, N = lijst.length;
      bundels[id] = N * d / 2;
      const opVolgorde = (a, b) => (kabels[a].sDrop - kabels[b].sDrop) || nrCmp(kabels[a], kabels[b]);
      const slot = {};
      lijst.filter(i => kabels[i].kant !== 'R').sort(opVolgorde).forEach((i, j) => { slot[i] = N - 1 - j; });
      lijst.filter(i => kabels[i].kant === 'R').sort(opVolgorde).forEach((i, j) => { slot[i] = j; });
      // kabels die bij dezelfde drop afgaan: naast elkaar langs de truss
      const perDrop = {};
      lijst.slice().sort((a, b) => Math.abs(slot[b] - (N - 1) / 2) - Math.abs(slot[a] - (N - 1) / 2)).forEach(i => (perDrop[kabels[i].drop] = perDrop[kabels[i].drop] || []).push(i));

      lijst.forEach(i => {
        const k = kabels[i], r0 = KT.diameter(k.type) / 2000 * schaal;
        const u = (slot[i] - (N - 1) / 2) * d;
        const buren = perDc[k.dc] || [id], opzij = (buren.indexOf(id) - (buren.length - 1) / 2) * (N * d + 0.04 * schaal);

        // hartlijn: dim city → vloer → grote drop omhoog → over de truss tot de drop
        const hart = [], zet = p => { const q = hart[hart.length - 1]; if (!q || V.len(V.sub(q.p, p)) > 1e-4) hart.push({ p, t: q ? q.t + V.len(V.sub(q.p, p)) : 0 }); };
        k.weg.pts.forEach(p => zet([p[0], p[1], dmax / 2]));
        const T0 = T.pts[0];
        zet([T0[0], T0[1], dmax / 2]);
        const tVloer = hart[hart.length - 1].t;
        let rest = k.afstand;
        zet([T0[0], T0[1], T0[2] + dmax / 2]);
        for (let j = 1; j < T.pts.length && rest > 1e-6; j++) {
          const a = T.pts[j - 1], b = T.pts[j], L = d3(a, b);
          if (rest >= L) { zet([b[0], b[1], b[2] + dmax / 2]); rest -= L; }
          else { const q = V.lerp(a, b, rest / L); zet([q[0], q[1], q[2] + dmax / 2]); rest = 0; }
        }
        if (hart.length < 2) return;
        const tTrussBegin = hart.findIndex(q => q.p[2] > dmax);
        const tOp = tTrussBegin >= 0 ? hart[tTrussBegin].t : tVloer;
        const rond = rondeBochten(hart, Math.max(0.25, N * d), 10);
        const kruis = assen(rond);
        const offset = tt => tt <= tVloer ? u + opzij : tt >= tOp ? u : u + opzij * (1 - (tt - tVloer) / ((tOp - tVloer) || 1));
        const op = (tt, extra) => {
          let j = 0;
          while (j < rond.length - 2 && rond[j + 1].t < tt) j++;
          const A = rond[j], B = rond[j + 1], f = Math.max(0, Math.min(1, (tt - A.t) / ((B.t - A.t) || 1)));
          const o = (extra == null ? offset(tt) : extra);
          const pa = V.add(A.p, V.mul(kruis[j].u, o)), pb = V.add(B.p, V.mul(kruis[j + 1].u, o));
          return { p: V.lerp(pa, pb, f), u: V.norm(V.lerp(kruis[j].u, kruis[j + 1].u, f)), r: V.norm(V.sub(B.p, A.p)) };
        };

        const groep = perDrop[k.drop], jj = groep.indexOf(i);
        const tEind = rond[rond.length - 1].t;
        const tUit = Math.max(tOp, tEind - (jj + 0.5) * d * 1.2);
        const lijn = [];
        rond.forEach(q => { if (q.t < tUit - 1e-6) lijn.push({ t: q.t, p: op(q.t).p }); });
        const plek = op(tUit);
        lijn.push({ t: tUit, p: plek.p });

        // over de rand en langs de zijkant naar beneden, dan de dropvorm naar het object
        const kant = k.kant === 'R' ? -1 : 1;
        const zijU = plek.u, half = T.breedte / 2 + r0;
        const rand = V.add(V.sub(plek.p, V.mul(zijU, u)), V.mul(zijU, kant * half));
        const zij = [rand[0], rand[1], plek.p[2] - T.diepte - r0];
        const naar = (p, extra) => { const q = lijn[lijn.length - 1]; lijn.push({ t: q.t + V.len(V.sub(p, q.p)) + (extra || 0), p }); };
        naar(rand); naar(zij);
        const langs = (jj - (groep.length - 1) / 2) * d * 1.4;
        const B = k.doelPunt ? [k.doelPunt[0] + plek.r[0] * langs, k.doelPunt[1] + plek.r[1] * langs, k.doelPunt[2]] : [zij[0], zij[1], Math.max(r0, zij[2] - (k.val || 0))];
        const n2 = [zijU[0] * kant, zijU[1] * kant];
        const vrij = Math.max(0.01, k.L - (k.slinger || 0) - T.diepte);
        dropVorm(zij, B, n2, vrij, k.vorm, r0).slice(1).forEach(p => naar(p));
        for (let n = 1; n < lijn.length; n++) if (lijn[n].t <= lijn[n - 1].t) lijn[n].t = lijn[n - 1].t + 1e-6;

        // opknippen in de stukken (25 m, 10 m …), elk in zijn eigen kleur. s (langs de route) -> t (langs het pad)
        const schaalT = tUit / Math.max(1e-6, k.sDrop);
        k.stukken.forEach((st, n) => {
          const t0 = Math.max(0, st.s1 * schaalT), t1 = n === 0 ? lijn[lijn.length - 1].t : st.s0 * schaalT;
          if (t1 - t0 < 0.01) return;
          const punten = knip(lijn, t0, t1);
          if (punten.length < 2) return;
          uit.push({ nummer: k.nr, type: k.type.naam, kort: k.type.kort, lengte: KT.lengteTekst(st.m), totaal: k.totaal,
            diameter: KT.diameter(k.type), kleur: kleurVan(k, st), klasse: T.klasse || '', dc: k.dc, drop: k.drop,
            punten: punten.map(p => p.map(v => Math.round(v * 1000) / 1000)) });
        });
      });
    });
    uit.bundels = bundels;
    return uit;
  };

  // ---------- het model ----------
  KT.bereken = function () {
    const tk = KT.tekening, pr = KT.project, inst = pr.instellingen;
    const w = [];
    const waarschuw = (niveau, tekst, id, p, kort) => w.push({ niveau, tekst, id: id || '', x: p ? p[0] : null, y: p ? p[1] : null, kort: kort || tekst });
    const dcs = tk.dimcities || [], tol = +inst.tolerantie || 2;
    const dcVanNr = nr => dcs.find(d => (+d.nr || +String(d.id).replace(/\D/g, '')) === nr);

    // --- truss-lijnen: bovenkant, breedte en diepte van de echte truss eronder ---
    const echte = tk.trussen || [];
    const trussen = {}, lijnen = [];
    (tk.trusslijnen || []).forEach(t => {
      if (!t.punten || t.punten.length < 2) return;
      const lijn = t.punten.map(P), z = lijn[0][2];
      const top = t.bovenkant != null && Math.abs(+t.bovenkant - z) < 3 ? +t.bovenkant : z;
      const pts = lijn.map(p => [p[0], p[1], top + (p[2] - z)]);
      const maten = [];
      echte.forEach(e => {
        if (!e.min || !e.max) return;
        const dx = e.max[0] - e.min[0], dy = e.max[1] - e.min[1], dz = e.max[2] - e.min[2];
        if (!lijn.some(p => p[0] >= e.min[0] - 0.25 && p[0] <= e.max[0] + 0.25 && p[1] >= e.min[1] - 0.25 && p[1] <= e.max[1] + 0.25)) return;
        const b = Math.min(dx, dy);
        if (b > 0.05 && b < 1.5) maten.push([b, dz > 0.05 && dz < 1.5 ? dz : b]);
      });
      maten.sort((a, b) => a[0] - b[0]);
      const m = maten[Math.floor(maten.length / 2)];
      const breedte = m ? m[0] : (+inst.trussBreedte || 0.3), diepte = m ? m[1] : (+inst.trussBreedte || 0.3);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + d3(pts[i - 1], pts[i]));
      const T = { t, id: t.id, naam: t.naam || t.id, klasse: t.klasse || t.naam || '', pts, cum, lengte: cum[cum.length - 1], breedte, diepte, top };
      trussen[t.id] = T; lijnen.push(T);
    });
    const net = routeNetwerk(tk, dcs, lijnen, tol, waarschuw);

    // --- lampen per class (hoogte van het doel) ---
    const lampen = {};
    (tk.alleLampen || []).forEach(l => { if (l.klasse) (lampen[l.klasse] = lampen[l.klasse] || []).push(l); });

    // --- blokken: bij welke drop horen ze (dichtstbijzijnde eindpunt in dezelfde class) ---
    const drops = tk.drops || [];
    const blokVan = {};
    (tk.blokken || []).forEach(b => {
      let best = null;
      drops.forEach(d => {
        const doel = d.doel, klasse = (doel && doel.klasse) || d.doelKlasse;
        if (!klasse || klasse !== b.klasse) return;
        const dd = doel ? Math.hypot(doel.x - b.x, doel.y - b.y) : 0;
        if (!best || dd < best.d) best = { d: dd, id: d.id };
      });
      if (best) (blokVan[best.id] = blokVan[best.id] || []).push(b);
    });
    const losBlok = (tk.blokken || []).filter(b => !drops.some(d => ((d.doel && d.doel.klasse) || d.doelKlasse) === b.klasse));
    if (losBlok.length) waarschuw('let op', `Blokken zonder drop: ${losBlok.map(b => b.nummer + ' (' + b.klasse + ')').join(', ')}.`, '', null, 'Blokken zonder drop');

    // --- kabels per drop ---
    const kabels = [], labels = [], stempels = [], extraStukken = [];
    const gebruikt = new Set(Object.values(pr.nummers).map(n => n.nr));
    const basisVan = dc => dcs.length > 1 ? (+dc.nr || 1) * 100 : 0;
    const vrij = (dc, voorv) => { const basis = basisVan(dc); for (let k = 1; k < 10000; k++) { const c = voorv + (basis + k); if (!gebruikt.has(c)) return c; } return voorv + '?'; };
    const rij = (k, m) => ({ kort: k.type.kort, lengte: KT.lengteTekst(m), kleur: KT.kleurVoor(m), nummer: k.nr, rand: k.type.kleur || '#000000', vet: !!k.type.vet });
    const kleurDrop = inst.kleurDrop || '#33cc00', kleurRoute = inst.kleurRoute || '#ff0000', kleurDB = inst.kleurDB || '#ff0000';
    const locatieBij = p => {
      let best = null;
      (tk.vloerroutes || []).forEach(r => {
        const pts = (r.punten || []).map(P);
        if (pts.length < 2) return;
        const pj = projecteer(pts, p);
        if (pj && (!best || pj.d < best.d)) best = { d: pj.d, r };
      });
      return best && best.d < 0.5 ? (best.r.locatie || '') : '';
    };
    const koppel = {};
    const dropLooms = inst.dropLengtes || [];
    const typeVanBlok = b => KT.type(b.type) || KT.type(b.voorv === 'LK' ? 'lk' : b.voorv === 'V' ? 'veam' : 'socapex');

    drops.forEach(d => {
      const T = trussen[d.truss];
      const di = KT.dropInst(d.id), naam = di.naam || d.objectnaam || (d.doel && d.doel.klasse) || d.doelKlasse || d.id;
      if (!T) { waarschuw('fout', `Drop ${d.id} hoort niet bij een bekende truss-lijn.`, d.id, [d.x, d.y], 'Geen truss-lijn'); return; }
      const pj = projecteer(T.pts, P([d.x, d.y, d.z]));
      const afstand = pj.afstand, p = pj.punt;
      const kant = (di.kant || d.kant) === 'R' ? 'R' : 'L';
      const vorm = ['Recht', 'Boog', 'Realistisch'].includes(di.vorm) ? di.vorm : ['Recht', 'Boog', 'Realistisch'].includes(d.vorm) ? d.vorm : (inst.dropVorm || 'Boog');
      const slinger = di.slinger != null && di.slinger !== '' ? +di.slinger : (+d.slingers || 0);
      const vasteLengte = +di.droplengte > 0 ? +di.droplengte : (+d.droplengte > 0 ? +d.droplengte : 0);
      const doel = d.doel, klasse = (doel && doel.klasse) || d.doelKlasse || '';

      // hoogte van het doel: ingesteld bij het eindpunt, anders de lampen in die class
      let zDoel = null;
      if (doel) {
        if (+doel.hoogte > 0) zDoel = +doel.hoogte;
        else if ((lampen[klasse] || []).length) zDoel = lampen[klasse].reduce((s, l) => s + (+l.z || 0), 0) / lampen[klasse].length;
        else { zDoel = 0; waarschuw('let op', `${d.id}: geen lampen in class ${klasse}; het eindpunt ligt op de vloer. Vul een hoogte in bij het eindpunt.`, d.id, [doel.x, doel.y], 'Doelhoogte onbekend'); }
      }
      const val = (di.valhoogte !== '' && di.valhoogte != null) ? +di.valhoogte : p[2];
      const doelPunt = doel ? [doel.x, doel.y, zDoel] : null;

      // wat gaat erin: de blokken bij het eindpunt (nummer = leidend), anders de oude lijst "wat heeft dit object nodig"
      const behoefte = [];
      if (doel) {
        (blokVan[d.id] || []).sort((a, b) => String(a.nummer).localeCompare(String(b.nummer), 'nl', { numeric: true })).forEach(b => behoefte.push({ blok: b }));
        if (!behoefte.length) waarschuw('let op', `${d.id} (${klasse}): geen multi-, SOCA-, LK- of VEAM-blok met nummer in class ${klasse} op ${inst.laagInfra}.`, d.id, [doel.x, doel.y], 'Geen blok');
      } else (di.behoefte || []).forEach(b => { for (let i = 0; i < (+b.aantal || 1); i++) behoefte.push({ oud: b, i }); });

      const eigen = [];
      behoefte.forEach(bh => {
        let type, nr, sleutel, dc, handmatig = false;
        if (bh.blok) {
          const b = bh.blok;
          type = typeVanBlok(b);
          nr = b.nummer; sleutel = d.id + '|' + b.nummer;
          dc = dcs.length <= 1 ? dcs[0] : dcVanNr(b.getal >= 100 ? Math.floor(b.getal / 100) : 1);
          if (!dc) { waarschuw('fout', `${b.nummer}: dim city DB${Math.floor(b.getal / 100)} bestaat niet.`, d.id, [b.x, b.y], b.nummer + ': geen dim city'); return; }
        } else {
          type = KT.type(bh.oud.type);
          if (!type) return;
          sleutel = d.id + '|' + bh.oud.id + '|' + bh.i;
          dc = dcs[0];
          let n = pr.nummers[sleutel];
          if (!n) {
            if (pr.slot) n = { nr: '?' };
            else { n = pr.nummers[sleutel] = { nr: dc ? vrij(dc, bh.oud.voorvoegsel || type.voorvoegsel || type.kort) : '?' }; gebruikt.add(n.nr); }
          }
          nr = n.nr; handmatig = !!n.handmatig;
        }
        if (!dc) return;
        const weg = net.weg(dc.id, T.id);
        if (!weg) { waarschuw('fout', `${nr}: geen route van ${dc.naam || dc.id} naar ${T.naam}. Teken een vloerroute.`, d.id, p, nr + ': geen route'); return; }
        const naarDc = weg.lengte + T.pts[0][2];
        const sDrop = naarDc + afstand;
        const lens = type.lengtes.map(x => +x.m).filter(x => x > 0).sort((a, c) => a - c);
        if (!lens.length) { waarschuw('fout', `${type.naam} heeft geen lengtes in de bibliotheek.`); return; }

        // benodigde droplengte: over de truss (slingers) + langs de zijkant omlaag + recht naar het doel
        const zijkant = T.diepte;
        const A = [p[0], p[1], p[2] - zijkant];
        const koorde = doelPunt ? d3(A, doelPunt) : Math.max(0, val - zijkant);
        const nodig = slinger + zijkant + koorde;
        let dl = lens.filter(x => dropLooms.includes(x)); if (!dl.length) dl = lens;
        let L = vasteLengte || dl.find(x => x >= nodig - 0.001);
        if (L == null) L = dl[dl.length - 1];
        const slack = L - nodig;
        if (slack < -0.001) waarschuw('fout', `${d.id} ${naam}: ${type.kort} ${KT.lengteTekst(L)} m is te kort; ${nodig.toFixed(1).replace('.', ',')} m nodig.`, d.id, p, `${nr} te kort`);

        // realistisch: ligt het overschot op de vloer?
        if (doelPunt && vorm === 'Realistisch' && slack > 0.5) {
          const laagste = Math.min(...dropVorm(A, doelPunt, [0, 0], L - slinger - zijkant, 'Realistisch', -1e9).map(q => q[2]));
          if (laagste < 0) waarschuw('let op', `${d.id} ${naam}: het overschot van ${slack.toFixed(1).replace('.', ',')} m hangt tot op de vloer. Leg meer over de truss (slingers) of kies een kortere droplengte.`, d.id, doelPunt, 'Overschot op de vloer');
        }

        // bouwcheck: truss op trim, object op bouwhoogte
        if (doelPunt && inst.bouwcheck !== false) {
          const hb = +inst.bouwhoogte >= 0 ? +inst.bouwhoogte : 1.5;
          if (zDoel > hb + 0.05) {
            const horiz = Math.hypot(A[0] - doelPunt[0], A[1] - doelPunt[1]), beschikbaar = L - slinger - zijkant;
            const nodigBouw = slinger + zijkant + Math.hypot(horiz, A[2] - hb);
            if (L < nodigBouw - 0.001 && slack >= -0.001) {
              const h = beschikbaar >= horiz ? A[2] - Math.sqrt(beschikbaar * beschikbaar - horiz * horiz) : null;
              waarschuw('fout', h != null
                ? `${d.id} ${naam}: koppelen in de lucht. Met ${KT.lengteTekst(L)} m haal je het object op bouwhoogte ${KT.lengteTekst(hb)} m niet; koppelen kan vanaf ${h.toFixed(1).replace('.', ',')} m hoogte.`
                : `${d.id} ${naam}: koppelen in de lucht. Met ${KT.lengteTekst(L)} m haal je het object op bouwhoogte niet.`, d.id, p, 'Koppelen in de lucht');
            }
          }
        }

        // drop uit één stuk; de rest in standaardlengtes terug naar de dim city (koppelpunten)
        let s = sDrop - slinger;
        const stukken = [{ m: L, s0: sDrop, s1: s }];
        let rest = s + (+inst.slackDimCity || 0);
        const max = lens[lens.length - 1];
        let teller = 0;
        while (rest > 0.001 && teller++ < 200) {
          const m = rest > max ? max : lens.find(x => x >= rest - 0.001);
          stukken.push({ m, s0: s, s1: s - m });
          s -= m; rest -= m;
        }
        const k = { sleutel, nr, handmatig, blok: bh.blok || null, type, drop: d.id, dc: dc.id, truss: T.id, stukken, afstand, weg,
          totaal: stukken.reduce((a, x) => a + x.m, 0), sDrop, naarDc, val: isFinite(val) ? Math.max(0, val) : 0, dropPunt: p, doelPunt,
          kant, vorm, L, slinger, slack, nodig };
        kabels.push(k); eigen.push(k);

        // koppelpunten: einde van elk stuk behalve het laatste
        stukken.slice(0, -1).forEach(st => {
          if (st.s1 <= 0.05) return;
          const ks = T.id + '|' + dc.id + '@' + st.s1.toFixed(1);
          if (!koppel[ks]) {
            const opTruss = st.s1 > naarDc ? st.s1 - naarDc : null;
            let q;
            if (opTruss != null) q = puntOp(T.pts, opTruss).p;
            else {
              const pad = weg.pts.concat([[T.pts[0][0], T.pts[0][1], 0]]);
              q = puntOp(pad, Math.min(st.s1, weg.lengte)).p;
            }
            const locatie = opTruss != null ? (T.t.locatie || '') : locatieBij(q);
            koppel[ks] = { soort: 'koppel', laag: 'infra', x: q[0], y: q[1], z: q[2], titel: locatie, kader: kleurRoute,
              klasse: opTruss != null ? T.klasse : dc.id, rijen: [], opTruss, truss: T.id };
          }
          koppel[ks].rijen.push(rij(k, st.m));
        });
      });

      // vlaggetje bij de drop (infra, class van de kabeltruss)
      labels.push({ soort: 'vlag', laag: 'infra', x: p[0], y: p[1], z: p[2], titel: 'Drop > ' + naam, kader: kleurDrop, klasse: T.klasse, rijen: eigen.map(k => rij(k, k.stukken[0].m)) });
      if (eigen.length) extraStukken.push({ a: p, b: doelPunt || [p[0], p[1], p[2] - val], soort: 'drop', dc: eigen[0].dc, id: d.id, nrs: eigen.map(k => k.nr) });
      const richt = puntOp(T.pts, afstand), zij = kant === 'R' ? [richt.ry, -richt.rx] : [-richt.ry, richt.rx];
      di._uitkomst = Object.assign({ zDoel, vorm, kant, punt: p, zij, doelPunt },
        eigen.length ? { L: eigen.map(k => k.L), slack: Math.min(...eigen.map(k => k.slack)), nodig: Math.max(...eigen.map(k => k.nodig)) } : {});

      // stempels voor de lampen van deze drop: gekoppeld, of in de class van het eindpunt
      const multis = eigen.filter(k => k.type.stempel === 'multi'), datas = eigen.filter(k => k.type.stempel === 'data');
      KT.lampenVanDrop(d).forEach(l => {
        const li = di.lampen[l.uuid] || {}, m = multis[+li.multi || 0], dt = datas[+li.data || 0];
        stempels.push({ uuid: l.uuid, naam: l.naam || '', drop: d.id, circuitName: m ? m.nr : '', circuitNumber: li.circuit != null ? String(li.circuit) : '', uf2: dt ? dt.nr : '', uf3: li.poort != null ? String(li.poort) : '' });
      });
    });
    Object.values(koppel).forEach(l => labels.push(l));

    // dropsymbool aan het begin van elke kabeltruss + label bij de dim city
    lijnen.forEach(T => {
      const rijen = [];
      kabels.filter(k => k.truss === T.id).forEach(k => {
        const st = k.stukken.find(x => x.s1 <= k.naarDc + 0.001 && x.s0 >= k.naarDc - 0.001);
        if (st) rijen.push(rij(k, st.m));
      });
      if (rijen.length) labels.push({ soort: 'bol', laag: 'infra', x: T.pts[0][0], y: T.pts[0][1], z: T.pts[0][2], titel: 'Drop > Floor', kader: kleurDrop, klasse: T.klasse, rijen });
    });
    dcs.forEach(dc => {
      const rijen = kabels.filter(k => k.dc === dc.id).map(k => rij(k, k.stukken[k.stukken.length - 1].m));
      if (rijen.length) labels.push({ soort: 'dimcity', laag: 'infra', x: +dc.x || 0, y: +dc.y || 0, z: 0, titel: dc.naam || dc.id, kader: kleurDB, klasse: dc.id, rijen });
    });

    // lengtehulp: streepjes waar een standaardkabel precies uitkomt (vanaf het begin of het laatste koppelpunt)
    if (inst.lengtehulp) {
      lijnen.forEach(T => {
        const refs = [0].concat(Object.values(koppel).filter(l => l.truss === T.id && l.opTruss != null).map(l => l.opTruss));
        const gezien = new Set();
        refs.forEach(r => (inst.lengtehulpLengtes || []).forEach(L => {
          const pos = r + (+L);
          if (pos > T.lengte + 0.001 || gezien.has(pos.toFixed(1))) return;
          gezien.add(pos.toFixed(1));
          const q = puntOp(T.pts, pos);
          labels.push({ soort: 'streepje', laag: 'infra', x: q.p[0], y: q.p[1], z: q.p[2], nx: -q.ry, ny: q.rx, titel: KT.lengteTekst(L), klasse: T.klasse, rijen: [] });
        }));
      });
    }

    // skelet voor de eenvoudige 3D-weergave
    const knopen = {};
    dcs.forEach(dc => { knopen[dc.id] = { id: dc.id, soort: 'dimcity', p: [+dc.x || 0, +dc.y || 0, 0] }; });
    const stukken = net.stukken.map((s, i) => ({ a: s[0], b: s[1], soort: 'vloer', id: 'v' + i, nrs: [] }))
      .concat(lijnen.flatMap(T => T.pts.slice(1).map((q, i) => ({ a: T.pts[i], b: q, soort: 'truss', id: T.id + ':' + i,
        nrs: kabels.filter(k => k.truss === T.id && k.afstand > T.cum[i] + 0.001).map(k => k.nr) }))))
      .concat(lijnen.map(T => ({ a: [T.pts[0][0], T.pts[0][1], 0], b: T.pts[0], soort: 'drop', id: T.id + ':grote drop', nrs: kabels.filter(k => k.truss === T.id).map(k => k.nr) })))
      .concat(extraStukken);
    stukken.forEach(s => { if (!s.dc) { const k = kabels.find(x => s.nrs.includes(x.nr)); s.dc = k ? k.dc : (dcs[0] || {}).id; } });

    // --- elke kabel als eigen 3D-pad naast de andere, opgeknipt per stuk (voor de 3D en Vectorworks) ---
    const kabelpaden = KT.kabelPaden(kabels, trussen, tk, inst);
    const dikte = Math.max(1, Math.min(10, +inst.kabelDikte3D || 1));
    const kabelpaden3D = dikte === 1 ? kabelpaden : KT.kabelPaden(kabels, trussen, tk, inst, dikte);

    const dubbel = {};
    kabels.forEach(k => { dubbel[k.nr] = (dubbel[k.nr] || 0) + 1; });
    Object.keys(dubbel).filter(n => dubbel[n] > 1 && n !== '?').forEach(n => waarschuw('fout', `Nummer ${n} komt ${dubbel[n]}× voor.`, '', null, n + ' dubbel'));
    // drops met hetzelfde nummer of een nummer dat niet bij de dim city van de blokken past
    drops.forEach(d => {
      const ks = kabels.filter(k => k.drop === d.id && k.blok);
      if (!ks.length || dcs.length <= 1) return;
      const dropDc = Math.floor((+String(d.id).replace(/\D/g, '') || 0) / 100), blokDc = +String(ks[0].dc).replace(/\D/g, '');
      if (dropDc && blokDc && dropDc !== blokDc) waarschuw('let op', `${d.id} hangt aan ${ks[0].dc} (${ks.map(k => k.nr).join(', ')}); het dropnummer hoort bij DB${dropDc}.`, d.id, [d.x, d.y], 'Dropnummer');
    });

    KT.res = { knopen, stukken, kabels, labels, stempels, waarschuwingen: w, trussen, kabelpaden, kabelpaden3D };
    return KT.res;
  };

  // Lampen van een drop: gekoppeld met "Lampen koppelen", of (niet gekoppeld) in de class van het eindpunt
  KT.lampenVanDrop = function (d) {
    const tk = KT.tekening || {}, klasse = (d.doel && d.doel.klasse) || d.doelKlasse || '';
    const uit = new Map();
    (tk.lampen || []).filter(l => l.drop === d.id).forEach(l => uit.set(l.uuid, l));
    if (klasse) (tk.alleLampen || []).filter(l => l.klasse === klasse && (!l.drop || l.drop === d.id)).forEach(l => { if (!uit.has(l.uuid)) uit.set(l.uuid, l); });
    return [...uit.values()];
  };
})();
