// Echte 3D-weergave met Three.js (meegeleverd in vendor/, werkt offline).
// Trussen met hun echte vorm uit Vectorworks, lampen met een vorm per soort, kabels als strakke bundel met ronde
// bochten, dim city-kasten, drops (groene klem) en routes. Zacht licht met schaduw.
// Linker muisknop = draaien · rechter muisknop of Shift = verschuiven · scrollen = zoomen · hover = info · klik = selecteren.
// Geeft null terug als WebGL niet beschikbaar is; dan gebruikt de palette de eenvoudige canvas-weergave.
(function () {
  const KT = window.KT;
  const ONDERDELEN = [
    ['dimcities', 'Dim cities'], ['routes', 'Routes'], ['drops', 'Drops'], ['kabels', 'Kabels'],
    ['lampen', 'Lampen'], ['trussen', 'Trussen'], ['waarsch', 'Waarschuwingen'], ['namen', 'Namen'], ['raster', 'Raster'],
  ];

  // ---------- lampsoort uit het Inst Type van Spotlight ----------
  const SOORTEN = [
    ['strobe', /strobe|atomic|jdc|x4 ?bar|stormy/i],
    ['blinder', /blinder|molefay|dwe|[248]-?lite|audience/i],
    ['bar', /\bbar\b|batten|pixel ?line|sunstrip|linear|led ?line/i],
    ['wash', /wash|aura|b-?eye|spiider|lustr/i],
    ['par', /\bpar\b|par ?\d|\bpc\b|fresnel|cyc/i],
    ['profiel', /source ?four|\bs4\b|leko|ellipsoid|profiel/i],
  ];
  KT.lampSoort = type => {
    for (const [s, re] of SOORTEN) if (re.test(type || '')) return s;
    return 'moving';
  };

  KT.viewerGL = function (houder, tip, onKlik) {
    const THREE = window.THREE;
    if (!THREE || !THREE.WebGLRenderer) return null;
    try {
      const test = document.createElement('canvas');
      if (!(test.getContext('webgl2') || test.getContext('webgl'))) return null;
    } catch (e) { return null; }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x1b1e23);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    houder.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // omgeving voor de weerspiegeling op metaal (truss, kasten)
    if (THREE.RoomEnvironment && THREE.PMREMGenerator) {
      try {
        const pm = new THREE.PMREMGenerator(renderer);
        scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.55;
        pm.dispose();
      } catch (e) { /* zonder omgeving gaat het ook */ }
    }
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 5000);
    camera.up.set(0, 0, 1);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.zoomToCursor = true;

    scene.add(new THREE.HemisphereLight(0xe6edf5, 0x2a2e35, 0.9));
    const zon = new THREE.DirectionalLight(0xffffff, 2.2);
    zon.castShadow = true;
    zon.shadow.mapSize.set(2048, 2048);
    zon.shadow.bias = -0.0004;
    zon.shadow.normalBias = 0.02;
    scene.add(zon); scene.add(zon.target);
    const tegenlicht = new THREE.DirectionalLight(0x9fb4ff, 0.45);
    scene.add(tegenlicht); scene.add(tegenlicht.target);

    const vloerGroep = new THREE.Group(); scene.add(vloerGroep);
    const groepen = {};
    ONDERDELEN.forEach(o => { groepen[o[0]] = new THREE.Group(); scene.add(groepen[o[0]]); });
    const zicht = Object.fromEntries(ONDERDELEN.map(o => [o[0], true]));
    const lagenUit = new Set();
    let kader = null, gebouwdVoor = null, gebouwdRes = null;
    let pickbaar = [];

    // ---------- bedieningsbalk ----------
    const balk = document.createElement('div');
    balk.className = 'drie-balk';
    houder.parentNode.insertBefore(balk, houder);
    const legenda = document.createElement('div');
    legenda.className = 'legenda';
    houder.appendChild(legenda);
    function balkTekenen() {
      const lagen = (KT.tekening && KT.tekening.lagen) || [];
      const open = balk.querySelector('details.lagen');
      const wasOpen = !!(open && open.open);
      balk.innerHTML =
        `<span class="groep"><button data-aanzicht="boven">Boven</button><button data-aanzicht="voor">Voor</button>
          <button data-aanzicht="zij">Zij</button><button data-aanzicht="3d">3D</button><button data-fit="1" title="Alles in beeld">⤢ Alles</button></span>
        <span class="groep">${ONDERDELEN.map(o => `<label><input type="checkbox" data-zicht="${o[0]}" ${zicht[o[0]] ? 'checked' : ''}>${o[1]}</label>`).join('')}</span>
        ${lagen.length ? `<details class="groep lagen" ${wasOpen ? 'open' : ''}><summary>Lagen (${lagen.length - lagen.filter(l => lagenUit.has(l)).length}/${lagen.length})</summary><div>
          ${lagen.map(l => `<label><input type="checkbox" data-laag="${encodeURIComponent(l)}" ${lagenUit.has(l) ? '' : 'checked'}>${l.replace(/</g, '&lt;')}</label>`).join('')}</div></details>` : ''}`;
    }
    balk.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.aanzicht) aanzicht(b.dataset.aanzicht);
      if (b.dataset.fit) aanzicht('fit');
    });
    balk.addEventListener('change', e => {
      const i = e.target;
      if (i.dataset.zicht) zicht[i.dataset.zicht] = i.checked;
      if (i.dataset.laag) { const l = decodeURIComponent(i.dataset.laag); if (i.checked) lagenUit.delete(l); else lagenUit.add(l); }
      zichtbaarheid(); balkTekenen(); render();
    });

    // ---------- hulpjes ----------
    const kleur = c => new THREE.Color(c || '#9e9e9e');
    const v3 = p => new THREE.Vector3(+p[0] || 0, +p[1] || 0, +p[2] || 0);
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    function leeg(g) {
      while (g.children.length) {
        const o = g.children.pop();
        o.traverse(x => {
          if (x.geometry && !x.geometry.userData.gedeeld) x.geometry.dispose();
          if (x.material) [].concat(x.material).forEach(m => { if (m.userData && m.userData.gedeeld) return; if (m.map) m.map.dispose(); m.dispose(); });
        });
      }
    }
    function lijn(punten, c, dash, opacity) {
      const g = new THREE.BufferGeometry().setFromPoints(punten.map(v3));
      const m = dash ? new THREE.LineDashedMaterial({ color: c, dashSize: 0.3, gapSize: 0.2, transparent: opacity != null, opacity: opacity == null ? 1 : opacity })
        : new THREE.LineBasicMaterial({ color: c });
      const l = new THREE.Line(g, m);
      if (dash) l.computeLineDistances();
      return l;
    }
    function naambord(tekst, c) {
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
      const fs = 40;
      ctx.font = `600 ${fs}px Segoe UI, sans-serif`;
      cv.width = Math.ceil(ctx.measureText(tekst).width) + 28; cv.height = fs + 22;
      ctx.font = `600 ${fs}px Segoe UI, sans-serif`;
      const r = 12;
      ctx.fillStyle = 'rgba(16,18,22,0.78)';
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(cv.width - r, 0); ctx.quadraticCurveTo(cv.width, 0, cv.width, r);
      ctx.lineTo(cv.width, cv.height - r); ctx.quadraticCurveTo(cv.width, cv.height, cv.width - r, cv.height);
      ctx.lineTo(r, cv.height); ctx.quadraticCurveTo(0, cv.height, 0, cv.height - r); ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.fill();
      ctx.fillStyle = c || '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(tekst, 14, cv.height / 2 + 1);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      s.renderOrder = 10;
      s.userData.verhouding = cv.width / cv.height;
      return s;
    }
    // onzichtbaar blok om op te wijzen (hover/klik) bij objecten die uit veel delen bestaan
    function wijsblok(box) {
      const d = box.getSize(new THREE.Vector3());
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(d.x, 0.05), Math.max(d.y, 0.05), Math.max(d.z, 0.05)),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      box.getCenter(m.position);
      m.userData.pick = true;
      return m;
    }

    // Gladde buis langs een pad (meedraaiend kruis, geen naden of bolletjes), met dichte uiteinden
    function buis(punten, r, zijden) {
      const n = punten.length, z = zijden || 12;
      if (n < 2) return null;
      const P = punten.map(v3);
      const T = P.map((p, i) => P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize());
      let N = Math.abs(T[0].z) > 0.9 ? X.clone() : Z.clone().cross(T[0]).normalize();
      const pos = [], nor = [], idx = [];
      for (let i = 0; i < n; i++) {
        if (i) {
          N.sub(T[i].clone().multiplyScalar(N.dot(T[i])));
          if (N.lengthSq() < 1e-10) N = Math.abs(T[i].z) > 0.9 ? X.clone() : Z.clone().cross(T[i]);
          N.normalize();
        }
        const B = T[i].clone().cross(N).normalize();
        for (let k = 0; k < z; k++) {
          const h = (k / z) * Math.PI * 2, c = Math.cos(h), s = Math.sin(h);
          const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
          pos.push(P[i].x + nx * r, P[i].y + ny * r, P[i].z + nz * r); nor.push(nx, ny, nz);
        }
      }
      for (let i = 0; i < n - 1; i++) for (let k = 0; k < z; k++) {
        const a = i * z + k, b = i * z + (k + 1) % z, c = (i + 1) * z + k, d = (i + 1) * z + (k + 1) % z;
        idx.push(a, c, b, b, c, d);
      }
      // doppen
      [[0, -1], [n - 1, 1]].forEach(([i, kant]) => {
        const m = pos.length / 3;
        pos.push(P[i].x, P[i].y, P[i].z); nor.push(T[i].x * kant, T[i].y * kant, T[i].z * kant);
        for (let k = 0; k < z; k++) {
          const a = i * z + k, b = i * z + (k + 1) % z;
          if (kant > 0) idx.push(m, a, b); else idx.push(m, b, a);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setIndex(idx);
      return g;
    }

    // vakwerk (zoals een echte truss): 4 regels in de lengte, ringen en diagonalen op elk vlak.
    // o = hoek, u = lengterichting (eenheid), v en w = dwarsrichtingen (eenheid) met maat bv en bw
    function vakwerk(o, u, len, v, bv, w, bw) {
      const hoek = [[0, 0], [1, 0], [1, 1], [0, 1]], P = [];
      const pt = (t, h) => o.clone().addScaledVector(u, t).addScaledVector(v, hoek[h][0] * bv).addScaledVector(w, hoek[h][1] * bw);
      const n = Math.max(1, Math.round(len / Math.max(0.25, Math.max(bv, bw) * 1.7)));
      const stap = len / n;
      for (let h = 0; h < 4; h++) P.push(pt(0, h), pt(len, h));
      for (let i = 0; i <= n; i++) for (let h = 0; h < 4; h++) P.push(pt(i * stap, h), pt(i * stap, (h + 1) % 4));
      for (let i = 0; i < n; i++) for (let h = 0; h < 4; h++) {
        const om = (i + h) % 2;
        P.push(pt(i * stap, om ? h : (h + 1) % 4), pt((i + 1) * stap, om ? (h + 1) % 4 : h));
      }
      const groep = new THREE.Group();
      groep.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(P), new THREE.LineBasicMaterial({ color: 0xb4bcc6 })));
      const blok = new THREE.Mesh(new THREE.BoxGeometry(len, bv, bw), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      blok.position.copy(o.clone().addScaledVector(u, len / 2).addScaledVector(v, bv / 2).addScaledVector(w, bw / 2));
      blok.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, w));
      blok.userData.pick = true;
      groep.add(blok);
      return { groep, blok };
    }

    // ---------- materialen ----------
    const MAT = {
      truss: new THREE.MeshStandardMaterial({ color: 0xc9cfd6, metalness: 0.85, roughness: 0.32 }),
      body: new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.35, roughness: 0.4 }),
      bodyLicht: new THREE.MeshStandardMaterial({ color: 0x454a52, metalness: 0.45, roughness: 0.34 }),
      klem: new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.35 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.4, roughness: 0.45 }),
    };
    Object.values(MAT).forEach(m => { m.userData.gedeeld = true; });
    const lensMat = {};
    function lens(c) {
      if (!lensMat[c]) {
        const k = kleur(c);
        lensMat[c] = new THREE.MeshStandardMaterial({ color: k, emissive: k, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0 });
        lensMat[c].userData.gedeeld = true;
      }
      return lensMat[c];
    }

    // ---------- lampmodellen (oorsprong = ophangpunt bovenaan, lens naar beneden) ----------
    const GEO = {};
    function geo(naam, maak) { if (!GEO[naam]) { GEO[naam] = maak(); GEO[naam].userData.gedeeld = true; } return GEO[naam]; }
    const doos = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    // doos met afgeronde hoeken (in bovenaanzicht) en een klein afgerond randje
    const rondeDoos = (x, y, z, r) => {
      const s = new THREE.Shape(), a = x / 2 - r, b = y / 2 - r;
      s.moveTo(-a, -y / 2); s.lineTo(a, -y / 2); s.absarc(a, -b, r, -Math.PI / 2, 0); s.lineTo(x / 2, b);
      s.absarc(a, b, r, 0, Math.PI / 2); s.lineTo(-a, y / 2); s.absarc(-a, b, r, Math.PI / 2, Math.PI); s.lineTo(-x / 2, -b);
      s.absarc(-a, -b, r, Math.PI, Math.PI * 1.5);
      const bt = Math.min(0.012, z * 0.15), bs = Math.min(0.01, r * 0.5);
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, z - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -(z - 2 * bt) / 2);
      return g;
    };
    const cil = (r1, r2, h, n) => { const g = new THREE.CylinderGeometry(r1, r2, h, n || 28, 1); g.rotateX(Math.PI / 2); return g; };   // as = z
    const schijf = (r, n) => { const g = new THREE.CircleGeometry(r, n || 32); g.rotateX(Math.PI); return g; };                        // kijkt naar -z
    const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; return o; };

    function lampModel(soort, lc) {
      const gr = new THREE.Group(), L = lens(lc);
      // klem aan de truss
      gr.add(mesh(geo('klem', () => cil(0.028, 0.028, 0.06, 16)), MAT.klem, 0, 0, -0.03));
      gr.add(mesh(geo('klemplaat', () => doos(0.05, 0.12, 0.012)), MAT.klem, 0, 0, -0.066));
      if (soort === 'moving' || soort === 'wash') {
        const wash = soort === 'wash', HC = -0.56;
        gr.add(mesh(geo('voet', () => rondeDoos(0.44, 0.34, 0.15, 0.06)), MAT.body, 0, 0, -0.147));
        gr.add(mesh(geo('display', () => doos(0.09, 0.006, 0.045)), lens('#4a90e2'), 0, -0.172, -0.15));
        gr.add(mesh(geo('jukDraai', () => cil(0.09, 0.09, 0.03, 24)), MAT.bodyLicht, 0, 0, -0.237));
        gr.add(mesh(geo('jukBalk', () => rondeDoos(0.46, 0.1, 0.05, 0.04)), MAT.body, 0, 0, -0.275));
        [-1, 1].forEach(k => gr.add(mesh(geo('jukArm', () => rondeDoos(0.055, 0.12, 0.31, 0.025)), MAT.body, k * 0.205, 0, -0.45)));
        [-1, 1].forEach(k => gr.add(mesh(geo('tiltas', () => { const g = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20); g.rotateZ(Math.PI / 2); return g; }),
          MAT.bodyLicht, k * 0.168, 0, HC)));
        const r = wash ? 0.165 : 0.15, lang = wash ? 0.26 : 0.36;
        gr.add(mesh(geo('kop' + soort, () => new THREE.CapsuleGeometry(r, lang - r, 8, 28).rotateX(Math.PI / 2)), MAT.body, 0, 0, HC));
        const zl = HC - lang / 2 - r * 0.55;
        gr.add(mesh(geo('lensring' + soort, () => cil(r * 0.98, r * 0.98, 0.05, 32)), MAT.bodyLicht, 0, 0, zl + 0.02));
        if (wash) {
          gr.add(mesh(geo('lensvlak', () => schijf(0.15, 36)), MAT.body, 0, 0, zl - 0.006));
          const cel = geo('washcel', () => schijf(0.032, 18));
          [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * 0.085, Math.sin(i * Math.PI / 3) * 0.085])]
            .forEach(([x, y]) => gr.add(mesh(cel, L, x, y, zl - 0.008)));
        } else {
          gr.add(mesh(geo('lensspot', () => schijf(0.118, 36)), L, 0, 0, zl - 0.006));
        }
      } else if (soort === 'profiel' || soort === 'par') {
        const par = soort === 'par';
        gr.add(mesh(geo('vjuk', () => doos(0.27, 0.03, 0.03)), MAT.body, 0, 0, -0.085));
        [-1, 1].forEach(k => gr.add(mesh(geo('vjukarm', () => doos(0.025, 0.03, 0.2)), MAT.body, k * 0.135, 0, -0.18)));
        const kop = new THREE.Group(); kop.position.set(0, 0, -0.25); kop.rotation.x = par ? 0.5 : 0.6;
        if (par) {
          kop.add(mesh(geo('parbus', () => cil(0.115, 0.105, 0.3, 32)), MAT.body, 0, 0, -0.05));
          kop.add(mesh(geo('parlens', () => schijf(0.1, 32)), L, 0, 0, -0.202));
        } else {
          kop.add(mesh(geo('pbody', () => rondeDoos(0.22, 0.22, 0.26, 0.05)), MAT.body, 0, 0, 0.05));
          kop.add(mesh(geo('pvat', () => cil(0.085, 0.095, 0.38, 28)), MAT.body, 0, 0, -0.27));
          kop.add(mesh(geo('plens', () => schijf(0.075, 30)), L, 0, 0, -0.462));
        }
        gr.add(kop);
      } else if (soort === 'blinder' || soort === 'strobe') {
        gr.add(mesh(geo('bljuk', () => doos(0.5, 0.03, 0.03)), MAT.body, 0, 0, -0.085));
        [-1, 1].forEach(k => gr.add(mesh(geo('bljukarm', () => doos(0.025, 0.03, 0.16)), MAT.body, k * 0.25, 0, -0.16)));
        const kop = new THREE.Group(); kop.position.set(0, 0, -0.22); kop.rotation.x = 0.7;
        kop.add(mesh(geo('blkast', () => rondeDoos(0.48, 0.24, 0.12, 0.025)), MAT.body, 0, 0, 0));
        if (soort === 'blinder') {
          const cel = geo('blcel', () => schijf(0.07, 28));
          [[-0.12, -0.055], [0.12, -0.055], [-0.12, 0.055], [0.12, 0.055]].forEach(([x, y]) => kop.add(mesh(cel, lens('#ffb74d'), x, y, -0.062)));
        } else {
          kop.add(mesh(geo('strpaneel', () => { const g = new THREE.PlaneGeometry(0.42, 0.18); g.rotateX(Math.PI); return g; }), lens('#e3f2fd'), 0, 0, -0.062));
        }
        gr.add(kop);
      } else if (soort === 'bar') {
        gr.add(mesh(geo('barkast', () => rondeDoos(1.0, 0.1, 0.09, 0.03)), MAT.body, 0, 0, -0.12));
        gr.add(mesh(geo('barstrip', () => { const g = new THREE.PlaneGeometry(0.94, 0.06); g.rotateX(Math.PI); return g; }), L, 0, 0, -0.166));
      }
      return gr;
    }

    // vaste kleur per lamptype (uit Inst Type), zodat je de soorten lampen uit elkaar houdt
    const LAMPKLEUREN = ['#ffd54f', '#4fc3f7', '#f06292', '#aed581', '#ba68c8', '#ff8a65', '#4db6ac', '#e0e0e0'];
    const lampKleur = type => {
      let h = 0;
      for (const c of String(type || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return LAMPKLEUREN[h % LAMPKLEUREN.length];
    };

    const kastCache = {};
    function geoKast(m, h) {
      const k = m + 'x' + h;
      if (!kastCache[k]) { kastCache[k] = rondeDoos(m, m, h, Math.min(0.06, m * 0.08)); kastCache[k].userData.gedeeld = true; }
      return kastCache[k];
    }

    // ---------- opbouwen ----------
    function bouw() {
      const tk = KT.tekening || {}, res = KT.res || {}, inst = (KT.project && KT.project.instellingen) || {};
      Object.values(groepen).forEach(leeg); leeg(vloerGroep);
      pickbaar = [];
      const paden = res.kabelpaden3D || res.kabelpaden || [];

      // kader van alles
      const box = new THREE.Box3();
      const neem = p => box.expandByPoint(v3(p));
      (tk.dimcities || []).forEach(d => { neem([d.x, d.y, 0]); neem([d.x, d.y, +d.kast || 0]); });
      [].concat(tk.vloerroutes || [], tk.trusslijnen || []).forEach(r => (r.punten || []).forEach(neem));
      paden.forEach(k => k.punten.forEach(neem));
      (tk.alleLampen || []).forEach(l => neem([l.x, l.y, l.z]));
      (tk.trussen || []).forEach(t => { neem(t.min); neem(t.max); });
      if (box.isEmpty()) box.set(new THREE.Vector3(-5, -5, 0), new THREE.Vector3(5, 5, 3));
      kader = box;
      const midden = box.getCenter(new THREE.Vector3());
      const maat = Math.max(4, box.max.x - box.min.x, box.max.y - box.min.y);

      // vloer met schaduw + fijn raster
      const vloer = new THREE.Mesh(new THREE.PlaneGeometry(maat * 4 + 40, maat * 4 + 40),
        new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.95, metalness: 0 }));
      vloer.position.set(midden.x, midden.y, -0.002); vloer.receiveShadow = true;
      vloerGroep.add(vloer);
      const n = Math.ceil(maat / 5) * 5 + 10;
      const raster = new THREE.GridHelper(n, n, 0x3a4048, 0x2c3138);
      raster.rotation.x = Math.PI / 2;
      raster.position.set(Math.round(midden.x), Math.round(midden.y), 0);
      groepen.raster.add(raster);

      // licht en schaduw op de maat van de tekening
      const r = Math.max(6, box.getSize(new THREE.Vector3()).length() / 2 + 2);
      zon.position.copy(midden).add(new THREE.Vector3(-0.45, -0.7, 1).normalize().multiplyScalar(r * 2.2));
      zon.target.position.copy(midden);
      Object.assign(zon.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.1, far: r * 5 });
      zon.shadow.camera.updateProjectionMatrix();
      tegenlicht.position.copy(midden).add(new THREE.Vector3(0.6, 0.8, 0.5).multiplyScalar(r));
      tegenlicht.target.position.copy(midden);

      const kleurDB = inst.kleurDB || '#ff3b30', kleurDrop = inst.kleurDrop || '#33cc00';

      // dim cities als kast
      (tk.dimcities || []).forEach(d => {
        const m = +d.maat || 1, h = Math.max(0.05, +d.kast || 0.05);
        const kast = new THREE.Mesh(geoKast(m, h), new THREE.MeshStandardMaterial({ color: kleur(kleurDB), roughness: 0.45, metalness: 0.25 }));
        kast.position.set(+d.x || 0, +d.y || 0, h / 2); kast.castShadow = true; kast.receiveShadow = true;
        kast.userData = { id: d.id, laag: d.laag, info: 'Dim city ' + (d.naam || d.id) };
        groepen.dimcities.add(kast); pickbaar.push(kast);
        const s = naambord(d.naam || d.id, '#ffffff');
        s.position.set(+d.x || 0, +d.y || 0, h + 0.5); s.userData.laag = d.laag; s.userData.maat = 0.6;
        groepen.namen.add(s);
      });

      // echte trussen uit de tekening (de 3D-vorm die Vectorworks doorgeeft; anders vakwerk op de buitenmaat)
      const echteBoxen = [], echtTruss = inst.weergave3D !== 'basis';
      (tk.trussen || []).forEach(t => {
        const a = v3(t.min), b = v3(t.max), d = b.clone().sub(a);
        const info = 'Truss: ' + (t.naam || '') + (t.klasse ? ' · ' + t.klasse : '');
        if (echtTruss && t.vorm && t.vorm.v && t.vorm.f && t.vorm.f.length) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(t.vorm.v.map(x => x / 1000), 3));
          g.setIndex(t.vorm.f);
          g.computeVertexNormals();
          const m = new THREE.Mesh(g, MAT.truss);
          m.castShadow = true; m.receiveShadow = true;
          m.userData = { laag: t.laag, info };
          groepen.trussen.add(m); pickbaar.push(m);
          echteBoxen.push(new THREE.Box3(a, b).expandByScalar(0.3));
          return;
        }
        if (d.x <= 0 || d.y <= 0 || d.z <= 0) return;
        const as = d.x >= d.y && d.x >= d.z ? [X, d.x, Y, d.y, Z, d.z] : d.y >= d.z ? [Y, d.y, X, d.x, Z, d.z] : [Z, d.z, X, d.x, Y, d.y];
        const { groep, blok } = vakwerk(a, as[0], as[1], as[2], as[3], as[4], as[5]);
        groep.userData = { laag: t.laag };
        blok.userData = { pick: true, laag: t.laag, info };
        groepen.trussen.add(groep); pickbaar.push(blok);
        echteBoxen.push(new THREE.Box3(a, b).expandByScalar(0.3));
      });

      // routes: vloer als zachte stippellijn, truss-lijn als vakwerk (niet als er al een echte truss hangt)
      (tk.vloerroutes || []).forEach(rt => {
        const l = lijn(rt.punten || [], 0x5c6573, true, 0.6); l.userData.laag = rt.laag; groepen.routes.add(l);
      });
      (tk.trusslijnen || []).forEach(rt => {
        const pts = rt.punten || [];
        const T = 0.29;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = v3(pts[i]), b = v3(pts[i + 1]), d = b.clone().sub(a), len = d.length();
          if (len < 1e-3) continue;
          const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, T / 2));
          if (echteBoxen.some(bx => bx.containsPoint(mid))) continue;
          const u = d.normalize();
          const v = Math.abs(u.z) > 0.99 ? X.clone() : Z.clone().cross(u).normalize();
          const w = u.clone().cross(v).normalize();
          const { groep, blok } = vakwerk(a.clone().addScaledVector(v, -T / 2), u, len, v, T, w, T);
          groep.userData = { laag: rt.laag };
          blok.userData = { pick: true, laag: rt.laag, info: 'Truss-lijn ' + (rt.naam || rt.id) };
          groepen.routes.add(groep); pickbaar.push(blok);
        }
        if (rt.naam && pts[0]) {
          const s = naambord(rt.naam, '#c9ced6'); s.position.copy(v3(pts[0])).add(new THREE.Vector3(0, 0, 0.7)); s.userData.laag = rt.laag; s.userData.maat = 0.45;
          groepen.namen.add(s);
        }
      });

      // lampen: vorm per soort, lens in de kleur van het type
      const echt = inst.weergave3D !== 'basis';
      (tk.alleLampen || []).forEach(l => {
        const info = 'Lamp: ' + (l.naam || l.uuid) + (l.klasse ? ' · ' + l.klasse : '') + (l.drop ? ' · ' + l.drop : '');
        if (echt && l.vorm && l.vorm.v && l.vorm.f && l.vorm.f.length) {
          // de echte vorm uit Vectorworks (zelfde manier als de trussen)
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(l.vorm.v.map(x => x / 1000), 3));
          g.setIndex(l.vorm.f);
          g.computeVertexNormals();
          const mesh = new THREE.Mesh(g, MAT.lamp);
          mesh.castShadow = true;
          mesh.userData = { laag: l.laag };
          groepen.lampen.add(mesh);
          g.computeBoundingBox();
          const blok = wijsblok(g.boundingBox.clone());
          blok.userData = { pick: true, laag: l.laag, info };
          groepen.lampen.add(blok); pickbaar.push(blok);
          // lens in de kleur van het type, onderaan de vorm
          const bb = g.boundingBox, lensR = Math.max(0.03, Math.min(0.12, Math.min(bb.max.x - bb.min.x, bb.max.y - bb.min.y) * 0.3));
          const ls = new THREE.Mesh(new THREE.CircleGeometry(lensR, 20), lens(lampKleur(l.type || l.naam)));
          ls.rotation.x = Math.PI; ls.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.min.z - 0.002);
          ls.userData = { laag: l.laag };
          groepen.lampen.add(ls);
          return;
        }
        const soort = KT.lampSoort(l.type || l.naam), m = l.maat || [];
        const breed = Math.max(+m[0] || 0, +m[1] || 0);
        const s = breed > 0.15 && breed < 2 ? Math.max(0.7, Math.min(1.5, breed / 0.45)) : 1;
        const g = lampModel(soort, lampKleur(l.type || l.naam));
        g.scale.setScalar(s);
        g.position.set(+l.x || 0, +l.y || 0, (+l.z || 0) + ((+m[2] || 0) / 2));
        g.userData = { laag: l.laag };
        groepen.lampen.add(g);
        g.updateMatrixWorld(true);
        const blok = wijsblok(new THREE.Box3().setFromObject(g));
        blok.userData = { pick: true, laag: l.laag, info };
        groepen.lampen.add(blok); pickbaar.push(blok);
      });

      // drops: groene bol op de truss met een pijl naar de dropkant; eindpunt als groene ring bij het object
      (tk.drops || []).forEach(d => {
        const di = KT.dropInst(d.id), u = di._uitkomst || {};
        const groen = kleur(kleurDrop);
        const mat = new THREE.MeshStandardMaterial({ color: groen, emissive: groen.clone(), emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1 });
        const p = v3(u.punt || [d.x, d.y, d.z]);
        const top = p.clone().add(new THREE.Vector3(0, 0, 0.12));
        const bol = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), mat);
        bol.position.copy(top); bol.castShadow = true;
        bol.userData = { laag: d.laag, id: d.id, mat };
        groepen.drops.add(bol);
        if (u.zij) {
          const n = new THREE.Vector3(u.zij[0], u.zij[1], 0).normalize();
          const pijl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 14), mat);
          pijl.position.copy(top).addScaledVector(n, 0.24);
          pijl.quaternion.setFromUnitVectors(Y, n);
          pijl.userData = { laag: d.laag };
          groepen.drops.add(pijl);
        }
        const info = `Drop ${d.id}${di.naam ? ' · ' + di.naam : ''}${u.vorm ? ' · ' + u.vorm : ''}${u.slack != null ? ' · slack ' + u.slack.toFixed(1).replace('.', ',') + ' m' : ''}`;
        const blok = wijsblok(new THREE.Box3().setFromCenterAndSize(top, new THREE.Vector3(0.5, 0.5, 0.5)));
        blok.userData = { pick: true, id: d.id, laag: d.laag, info };
        groepen.drops.add(blok); pickbaar.push(blok);
        if (u.doelPunt) {
          const q = v3(u.doelPunt);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 10, 32), mat);
          ring.position.copy(q); ring.userData = { laag: d.laag, id: d.id, mat };
          groepen.drops.add(ring);
          const doelBlok = wijsblok(new THREE.Box3().setFromCenterAndSize(q, new THREE.Vector3(0.45, 0.45, 0.3)));
          doelBlok.userData = { pick: true, id: d.id, laag: d.laag, info: 'Eindpunt van ' + d.id + ' · ' + (d.doel ? d.doel.klasse : '') + ' · ' + q.z.toFixed(1).replace('.', ',') + ' m' };
          groepen.drops.add(doelBlok); pickbaar.push(doelBlok);
          if (!paden.some(k => k.drop === d.id)) {
            const l = lijn([[top.x, top.y, top.z], [q.x, q.y, q.z]], groen, true, 0.8); l.userData.laag = d.laag;
            groepen.drops.add(l);
          }
        }
        const s = naambord(di.naam ? d.id + ' · ' + di.naam : d.id, kleurDrop); s.position.copy(top).add(new THREE.Vector3(0, 0, 0.5));
        s.userData.laag = d.laag; s.userData.maat = 0.4;
        groepen.namen.add(s);
      });

      // waarschuwingen: bordje met uitroepteken op de plek
      (res.waarschuwingen || []).forEach(w => {
        if (w.x == null || w.y == null) return;
        const dr = (tk.drops || []).find(d => d.id === w.id);
        const z = dr ? (+dr.z || 0) + 1.1 : 1.2;
        const s = naambord('⚠ ' + (w.kort || w.tekst), w.niveau === 'fout' ? '#ff6b6b' : '#ffc14d');
        s.position.set(+w.x, +w.y, z); s.userData.maat = 0.42;
        groepen.waarsch.add(s);
        const blok = wijsblok(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(+w.x, +w.y, z), new THREE.Vector3(0.6, 0.6, 0.4)));
        blok.userData = { pick: true, id: w.id || undefined, info: w.tekst };
        groepen.waarsch.add(blok); pickbaar.push(blok);
      });

      // kabels: elk stuk een gladde buis in zijn eigen kleur
      const laagKabels = inst.laagKabels || inst.laagCabling;
      const dikte = paden === res.kabelpaden ? 1 : Math.max(1, Math.min(10, +inst.kabelDikte3D || 1));
      paden.forEach(k => {
        const rr = Math.max(0.003, (+k.diameter || 15) / 2000 * dikte);
        const g = buis(k.punten, rr, 12);
        if (!g) return;
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: kleur(k.kleur), roughness: 0.5, metalness: 0.0, transparent: true, opacity: 1 }));
        m.castShadow = true; m.receiveShadow = true;
        m.userData = { laag: laagKabels, info: `${k.nummer} · ${k.type} ${k.lengte} m (totaal ${k.totaal} m)`, nummer: k.nummer, dc: k.dc, drop: k.drop };
        groepen.kabels.add(m); pickbaar.push(m);
      });

      // legenda: soorten kabels in beeld
      const soorten = new Map();
      paden.forEach(k => { if (!soorten.has(k.type)) soorten.set(k.type, k.kleur); });
      legenda.innerHTML = soorten.size ? [...soorten].map(([t, c]) => `<span><i style="background:${c}"></i>${String(t).replace(/</g, '&lt;')}</span>`).join('') : '';
      legenda.style.display = soorten.size ? 'flex' : 'none';

      zichtbaarheid();
    }

    function zichtbaarheid() {
      Object.entries(groepen).forEach(([naam, g]) => {
        g.visible = !!zicht[naam];
        g.children.forEach(o => { o.visible = !o.userData.laag || !lagenUit.has(o.userData.laag); });
      });
    }

    // selectie: kabels van de gekozen drop/dim city fel, de rest gedimd
    function markeer() {
      const sel = KT.ui && KT.ui.sel;
      const heeft = sel && groepen.kabels.children.some(m => m.userData.drop === sel || m.userData.dc === sel);
      groepen.kabels.children.forEach(m => {
        const aan = !heeft || m.userData.drop === sel || m.userData.dc === sel;
        m.material.opacity = aan ? 1 : 0.15;
        m.material.depthWrite = aan;
        m.castShadow = aan;
      });
      groepen.dimcities.children.forEach(m => {
        if (!m.material || !m.material.emissive || !m.userData.id) return;
        m.material.emissive.set(m.userData.id === sel ? 0x441010 : 0x000000);
      });
      groepen.drops.children.forEach(m => {
        if (!m.userData.mat) return;
        m.userData.mat.emissiveIntensity = m.userData.id === sel ? 1.4 : 0.35;
      });
    }

    // ---------- camera ----------
    function aanzicht(soort) {
      const box = kader || new THREE.Box3(new THREE.Vector3(-5, -5, 0), new THREE.Vector3(5, 5, 3));
      const c = box.getCenter(new THREE.Vector3()), r = Math.max(2, box.getSize(new THREE.Vector3()).length() / 2);
      const afst = r / Math.sin((camera.fov * Math.PI / 180) / 2);
      const richting = {
        boven: [0, -0.0001, 1], voor: [0, -1, 0.08], zij: [1, 0, 0.08], '3d': [-0.6, -0.9, 0.55], fit: null,
      }[soort];
      const dir = richting ? new THREE.Vector3(...richting).normalize() : camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(c);
      camera.position.copy(c.clone().add(dir.multiplyScalar(afst)));
      camera.near = afst / 500; camera.far = afst * 20; camera.updateProjectionMatrix();
      controls.update();
      render();
    }

    // ---------- tekenen ----------
    function maat() {
      const w = houder.clientWidth || 400, h = houder.clientHeight || 300;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    function render() {
      // naambordjes op een vaste grootte op het scherm
      const h = houder.clientHeight || 300;
      groepen.namen.children.concat(groepen.waarsch.children.filter(s => s.isSprite)).forEach(s => {
        const afst = camera.position.distanceTo(s.position);
        const schaal = afst * Math.tan((camera.fov * Math.PI / 180) / 2) * 2 / h * 22 * (s.userData.maat ? s.userData.maat / 0.5 : 1);
        s.scale.set(schaal * s.userData.verhouding, schaal, 1);
      });
      renderer.render(scene, camera);
    }
    controls.addEventListener('change', render);
    if (window.ResizeObserver) new ResizeObserver(() => { maat(); render(); }).observe(houder);

    // ---------- muis: info en selecteren ----------
    const ray = new THREE.Raycaster(), muis = new THREE.Vector2();
    function raak(e) {
      const r = renderer.domElement.getBoundingClientRect();
      muis.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(muis, camera);
      const zichtbaar = o => { for (let x = o; x && x !== scene; x = x.parent) if (!x.visible) return false; return true; };
      const hits = ray.intersectObjects(pickbaar.filter(zichtbaar), false)
        .filter(h => h.object.userData.pick || !h.object.material || h.object.material.opacity > 0.5);
      return hits.length ? hits[0].object : null;
    }
    let neer = null, wacht = 0;
    renderer.domElement.addEventListener('pointerdown', e => { neer = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (neer && Math.hypot(e.clientX - neer[0], e.clientY - neer[1]) < 4 && e.button === 0) {
        const o = raak(e);
        if (o && o.userData.id) onKlik(o.userData.id);
      }
      neer = null;
    });
    renderer.domElement.addEventListener('pointermove', e => {
      if (neer) { tip.style.display = 'none'; return; }
      const nu = Date.now();
      if (nu - wacht < 40) return;
      wacht = nu;
      const o = raak(e);
      if (o && o.userData.info) {
        const r = houder.parentNode.getBoundingClientRect();
        tip.style.display = 'block';
        tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
        tip.textContent = o.userData.info;
        renderer.domElement.style.cursor = o.userData.id ? 'pointer' : 'default';
      } else { tip.style.display = 'none'; renderer.domElement.style.cursor = 'default'; }
    });
    renderer.domElement.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    // ---------- naar buiten ----------
    function teken() {
      maat();
      if (KT.tekening !== gebouwdVoor || KT.res !== gebouwdRes) {
        const eerste = !gebouwdVoor;
        gebouwdVoor = KT.tekening; gebouwdRes = KT.res;
        bouw();
        if (eerste) { balkTekenen(); aanzicht('3d'); }
      }
      markeer();
      render();
    }
    function ververs() {
      gebouwdVoor = KT.tekening; gebouwdRes = KT.res;
      maat(); bouw(); balkTekenen(); markeer(); aanzicht('3d');
    }
    // voor de eigen controle (screenshots): camera op een vaste plek zetten
    function kijk(pos, doel) {
      camera.position.set(...pos); controls.target.set(...doel);
      const afst = camera.position.distanceTo(controls.target);
      camera.near = afst / 500; camera.far = afst * 40; camera.updateProjectionMatrix();
      controls.update(); render();
    }
    balkTekenen();
    return { teken, ververs, kijk };
  };
})();
