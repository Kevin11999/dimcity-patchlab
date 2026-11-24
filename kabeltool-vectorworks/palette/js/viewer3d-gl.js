// Echte 3D-weergave met Three.js (meegeleverd in vendor/, werkt offline).
// Kabels als buizen per stuk in hun eigen kleur, trussen, lampen, dim city-kasten, drops en routes.
// Linker muisknop = draaien · rechter muisknop of Shift = verschuiven · scrollen = zoomen · hover = info · klik = selecteren.
// Geeft null terug als WebGL niet beschikbaar is; dan gebruikt de palette de eenvoudige canvas-weergave.
(function () {
  const KT = window.KT;
  const ONDERDELEN = [
    ['dimcities', 'Dim cities'], ['routes', 'Routes'], ['drops', 'Drops'], ['kabels', 'Kabels'],
    ['lampen', 'Lampen'], ['trussen', 'Trussen'], ['namen', 'Namen'], ['raster', 'Raster'],
  ];

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
    renderer.setClearColor(0x15171b);
    houder.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 5000);
    camera.up.set(0, 0, 1);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.zoomToCursor = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2d33, 1.6));
    const zon = new THREE.DirectionalLight(0xffffff, 1.6);
    zon.position.set(30, -40, 60);
    scene.add(zon);

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
    function leeg(g) {
      while (g.children.length) {
        const o = g.children.pop();
        o.traverse(x => {
          if (x.geometry) x.geometry.dispose();
          if (x.material) [].concat(x.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        });
      }
    }
    function lijn(punten, c, dash) {
      const g = new THREE.BufferGeometry().setFromPoints(punten.map(v3));
      const m = dash ? new THREE.LineDashedMaterial({ color: c, dashSize: 0.3, gapSize: 0.2 }) : new THREE.LineBasicMaterial({ color: c });
      const l = new THREE.Line(g, m);
      if (dash) l.computeLineDistances();
      return l;
    }
    function naambord(tekst, c) {
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
      const fs = 40;
      ctx.font = `600 ${fs}px Segoe UI, sans-serif`;
      cv.width = Math.ceil(ctx.measureText(tekst).width) + 24; cv.height = fs + 20;
      ctx.font = `600 ${fs}px Segoe UI, sans-serif`;
      ctx.fillStyle = 'rgba(15,17,20,0.75)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = c || '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(tekst, 12, cv.height / 2);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      s.renderOrder = 10;
      s.userData.verhouding = cv.width / cv.height;
      return s;
    }
    // buis langs een pad: cilinders per stuk + bolletjes in de bochten, samengevoegd tot één geometrie
    function buis(punten, r, zijden) {
      const z = zijden || 8;
      const delen = [], Y = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < punten.length - 1; i++) {
        const a = v3(punten[i]), b = v3(punten[i + 1]), d = b.clone().sub(a), len = d.length();
        if (len < 1e-4) continue;
        const g = new THREE.CylinderGeometry(r, r, len, z, 1, true);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        delen.push(g);
        if (i > 0) { const s = new THREE.SphereGeometry(r, z, 6); s.translate(a.x, a.y, a.z); delen.push(s); }
      }
      if (!delen.length) return null;
      const g = THREE.mergeGeometries(delen.map(x => x.index ? x.toNonIndexed() : x), false);
      delen.forEach(x => x.dispose());
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
      // onzichtbaar blok om op te kunnen wijzen (info bij hover)
      const blok = new THREE.Mesh(new THREE.BoxGeometry(len, bv, bw), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      blok.position.copy(o.clone().addScaledVector(u, len / 2).addScaledVector(v, bv / 2).addScaledVector(w, bw / 2));
      blok.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, w));
      blok.userData.pick = true;
      groep.add(blok);
      return { groep, blok };
    }
    // vaste kleur per lamptype (uit Inst Type), zodat je de soorten lampen uit elkaar houdt
    const LAMPKLEUREN = ['#ffd54f', '#4fc3f7', '#f06292', '#aed581', '#ba68c8', '#ff8a65', '#4db6ac', '#e0e0e0'];
    const lampKleur = type => {
      let h = 0;
      for (const c of String(type || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return LAMPKLEUREN[h % LAMPKLEUREN.length];
    };

    // ---------- opbouwen ----------
    function bouw() {
      const tk = KT.tekening || {}, res = KT.res || {}, inst = (KT.project && KT.project.instellingen) || {};
      Object.values(groepen).forEach(leeg);
      pickbaar = [];

      // kader van alles
      const box = new THREE.Box3();
      const neem = p => box.expandByPoint(v3(p));
      (tk.dimcities || []).forEach(d => { neem([d.x, d.y, 0]); neem([d.x, d.y, +d.kast || 0]); });
      [].concat(tk.vloerroutes || [], tk.trusslijnen || []).forEach(r => (r.punten || []).forEach(neem));
      (res.kabelpaden || []).forEach(k => k.punten.forEach(neem));
      (tk.alleLampen || []).forEach(l => neem([l.x, l.y, l.z]));
      (tk.trussen || []).forEach(t => { neem(t.min); neem(t.max); });
      if (box.isEmpty()) box.set(new THREE.Vector3(-5, -5, 0), new THREE.Vector3(5, 5, 3));
      kader = box;
      const maat = Math.max(4, box.max.x - box.min.x, box.max.y - box.min.y);

      // raster op de vloer
      const n = Math.ceil(maat / 5) * 5 + 10;
      const raster = new THREE.GridHelper(n, n, 0x343a42, 0x23272d);
      raster.rotation.x = Math.PI / 2;
      raster.position.set(Math.round((box.min.x + box.max.x) / 2), Math.round((box.min.y + box.max.y) / 2), 0);
      groepen.raster.add(raster);

      const kleurDB = inst.kleurDB || '#ff3b30', kleurDrop = inst.kleurDrop || '#33cc00';

      // dim cities als kast
      (tk.dimcities || []).forEach(d => {
        const m = +d.maat || 1, h = Math.max(0.05, +d.kast || 0.05);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(m, m, h), new THREE.MeshStandardMaterial({ color: kleur(kleurDB), roughness: 0.6 }));
        mesh.position.set(+d.x || 0, +d.y || 0, h / 2);
        mesh.userData = { id: d.id, laag: d.laag, info: 'Dim city ' + (d.naam || d.id) };
        groepen.dimcities.add(mesh); pickbaar.push(mesh);
        const s = naambord(d.naam || d.id, '#ffffff');
        s.position.set(+d.x || 0, +d.y || 0, h + 0.5); s.userData.laag = d.laag; s.userData.maat = 0.6;
        groepen.namen.add(s);
      });

      // routes: vloer als stippellijn, truss-lijn als lichte truss (0,3 m) zodat je ook zonder trussen iets ziet
      (tk.vloerroutes || []).forEach(r => {
        const l = lijn(r.punten || [], 0x6b7482, true); l.userData.laag = r.laag; groepen.routes.add(l);
      });
      (tk.trusslijnen || []).forEach(r => {
        const pts = r.punten || [];
        const T = 0.29;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = v3(pts[i]), b = v3(pts[i + 1]), d = b.clone().sub(a), len = d.length();
          if (len < 1e-3) continue;
          const u = d.normalize();
          const v = Math.abs(u.z) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(u).normalize();
          const w = u.clone().cross(v).normalize();
          const { groep, blok } = vakwerk(a.clone().addScaledVector(v, -T / 2), u, len, v, T, w, T);
          groep.userData = { laag: r.laag };
          blok.userData = { pick: true, laag: r.laag, info: 'Truss-lijn ' + (r.naam || r.id) };
          groepen.routes.add(groep); pickbaar.push(blok);
        }
        if (r.naam && pts[0]) {
          const s = naambord(r.naam, '#c9ced6'); s.position.copy(v3(pts[0])).add(new THREE.Vector3(0, 0, 0.6)); s.userData.laag = r.laag; s.userData.maat = 0.45;
          groepen.namen.add(s);
        }
      });

      // trussen uit de tekening (kader van het object)
      (tk.trussen || []).forEach(t => {
        const a = v3(t.min), b = v3(t.max), d = b.clone().sub(a);
        if (d.x <= 0 || d.y <= 0 || d.z <= 0) return;
        const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
        const as = d.x >= d.y && d.x >= d.z ? [X, d.x, Y, d.y, Z, d.z] : d.y >= d.z ? [Y, d.y, X, d.x, Z, d.z] : [Z, d.z, X, d.x, Y, d.y];
        const { groep, blok } = vakwerk(a, as[0], as[1], as[2], as[3], as[4], as[5]);
        groep.userData = { laag: t.laag };
        blok.userData = { pick: true, laag: t.laag, info: 'Truss: ' + (t.naam || '') + (t.klasse ? ' · ' + t.klasse : '') };
        groepen.trussen.add(groep); pickbaar.push(blok);
      });

      // lampen
      const lampGeo = new THREE.CylinderGeometry(0.11, 0.17, 0.34, 14);
      lampGeo.rotateX(Math.PI / 2);
      (tk.alleLampen || []).forEach(l => {
        const c = kleur(lampKleur(l.type || l.naam));
        const mesh = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.15), roughness: 0.5 }));
        mesh.position.set(+l.x || 0, +l.y || 0, +l.z || 0);
        mesh.userData = { laag: l.laag, info: 'Lamp: ' + (l.naam || l.uuid) + (l.drop ? ' · ' + l.drop : ' · niet gekoppeld'), deelt: true };
        groepen.lampen.add(mesh); pickbaar.push(mesh);
      });

      // drops: bol op de truss en stippellijn naar beneden
      (tk.drops || []).forEach(d => {
        const di = KT.dropInst(d.id);
        const val = di.valhoogte !== '' && di.valhoogte != null ? +di.valhoogte : +d.z;
        const bol = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshStandardMaterial({ color: kleur(kleurDrop), emissive: kleur(kleurDrop).multiplyScalar(0.25) }));
        bol.position.set(+d.x || 0, +d.y || 0, +d.z || 0);
        bol.userData = { id: d.id, laag: d.laag, info: 'Drop ' + d.id + (di.naam ? ' · ' + di.naam : '') };
        groepen.drops.add(bol); pickbaar.push(bol);
        const l = lijn([[d.x, d.y, d.z], [d.x, d.y, (+d.z || 0) - (val || 0)]], kleur(kleurDrop), true); l.userData.laag = d.laag;
        groepen.drops.add(l);
        const s = naambord(di.naam ? d.id + ' · ' + di.naam : d.id, kleurDrop); s.position.set(+d.x || 0, +d.y || 0, (+d.z || 0) + 0.55);
        s.userData.laag = d.laag; s.userData.maat = 0.4;
        groepen.namen.add(s);
      });

      // kabels: elk stuk een buis in zijn eigen kleur
      const laagKabels = inst.laagKabels || inst.laagCabling;
      const dikte = Math.max(1, Math.min(10, +inst.kabelDikte3D || 2));
      (res.kabelpaden || []).forEach(k => {
        const r = Math.max(0.008, (+k.diameter || 15) / 2000 * dikte);
        const g = buis(k.punten, r, 10);
        if (!g) return;
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: kleur(k.kleur), roughness: 0.55, metalness: 0.05, transparent: true, opacity: 1 }));
        mesh.userData = { laag: laagKabels, info: `${k.nummer} · ${k.type} ${k.lengte} m (totaal ${k.totaal} m)`, nummer: k.nummer, dc: k.dc, drop: k.drop };
        groepen.kabels.add(mesh); pickbaar.push(mesh);
      });

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
        m.material.opacity = aan ? 1 : 0.18;
        m.material.depthWrite = aan;
      });
      [...groepen.dimcities.children, ...groepen.drops.children].forEach(m => {
        if (!m.material || !m.material.emissive || !m.userData.id) return;
        m.material.emissiveIntensity = m.userData.id === sel ? 3 : 1;
      });
    }

    // ---------- camera ----------
    function aanzicht(soort) {
      const box = kader || new THREE.Box3(new THREE.Vector3(-5, -5, 0), new THREE.Vector3(5, 5, 3));
      const c = box.getCenter(new THREE.Vector3()), r = Math.max(2, box.getSize(new THREE.Vector3()).length() / 2);
      const afst = r / Math.sin((camera.fov * Math.PI / 180) / 2) * 1.05;
      const richting = {
        boven: [0, -0.0001, 1], voor: [0, -1, 0.08], zij: [1, 0, 0.08], '3d': [-0.55, -0.85, 0.6], fit: null,
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
      groepen.namen.children.forEach(s => {
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
    balkTekenen();
    return { teken, ververs };
  };
})();
