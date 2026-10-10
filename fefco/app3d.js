// Vue 3D : la boîte se replie du plan à plat (0 %) au carton fermé (100 %). Unités : mm.
(function () {
  const THREE = window.THREE;
  if (!THREE) return;
  const $ = (id) => document.getElementById(id);
  const box = $('v3d');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  box.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 100000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(-1, 2, 3); scene.add(sun);
  const pivot = new THREE.Group(); scene.add(pivot);
  const mat = new THREE.MeshLambertMaterial({ color: 0xc9a36b, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a3a22 });
  const state = { rx: -0.45, ry: 0.55, dist: 1, zoomK: 1, fold: 1, sc: null, d: null, code: null };
  let hinge = {};   // groupes à animer

  function panel(parent, x0, y0, w, h, pts) {
    let g;
    if (pts) { const sh = new THREE.Shape(); pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]))); g = new THREE.ShapeGeometry(sh); }
    else { g = new THREE.PlaneGeometry(w, h); g.translate(x0 + w / 2, y0 + h / 2, 0); }
    const m = new THREE.Mesh(g, mat);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat));
    parent.add(m); return m;
  }
  const grp = (parent, x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); parent.add(g); return g; };

  function buildSlotted(st, d) {
    const seq = ['L', 'W', 'L', 'W'], H = d.H;
    let x = 0, parent = null; const flaps = [], bodies = [];
    seq.forEach((k, i) => {
      const w = k === 'L' ? d.L : d.W, dt = st.flap(k, d, 't'), db = st.flap(k, d, 'b');
      const g = grp(parent || pivot, i ? x : 0, 0);
      if (i) bodies.push(g);
      panel(g, 0, 0, w, H);
      const up = i >= 2 ? 2 : 0;
      if (dt > 0) { const t = grp(g, 0, H + up); panel(t, 0, 0, w, dt); t.userData.s = 1; flaps.push(t); }
      if (db > 0) { const b = grp(g, 0, -up); const bm = new THREE.Group(); b.add(bm); panel(bm, 0, -db, w, db); b.userData.s = -1; flaps.push(b); }
      if (i === 0) {
        const j = new THREE.Group(); g.add(j); j.userData.joint = true; hinge.joint = j;
        const tp = Math.min(8, H / 4);
        panel(j, 0, 0, 0, 0, [[0, tp], [-d.j, 0], [-d.j, H], [0, H - tp]].map((p) => [p[0], p[1]]));
      }
      parent = g; x = w;
      if (i === 0) hinge.root = g;
    });
    hinge.bodies = bodies; hinge.flaps = flaps; hinge.fam = 'slotted';
    return { cx: d.L / 2, cy: H / 2, cz: -d.W / 2, fx: d.L + d.W - d.j / 2, fy: H / 2, fz: 0, bx: d.L, by: d.W, bz: H, openH: H + Math.max(st.flap('L', d, 't'), st.flap('W', d, 't')) + Math.max(st.flap('L', d, 'b'), st.flap('W', d, 'b')), stage: 0.6, size: Math.max(d.L, d.W, H) * 2 };
  }

  function buildCross(st, d) {
    const L = d.L, W = d.W, H = d.H;   // fond seul
    panel(pivot, 0, 0, L, W);
    const mk = (x, y, w, h, key, s, below) => { const g = grp(pivot, x, y); const m = new THREE.Group(); g.add(m); panel(m, 0, below ? -h : 0, w, h); g.userData = { key, s }; return g; };
    hinge.walls = [
      mk(0, W, L, H, 'x', 1), mk(0, 0, L, H, 'x', -1, true),
    ];
    // les parois gauche/droite sont dessinées vers l'extérieur de leur charnière
    const gl = grp(pivot, 0, 0); panel(gl, -H, 0, H, W); gl.userData = { key: 'y', s: 1 };
    const gr = grp(pivot, L, 0); panel(gr, 0, 0, H, W); gr.userData = { key: 'y', s: -1 };
    hinge.walls.push(gl, gr); hinge.fam = 'cross';
    return { cx: L / 2, cy: W / 2, cz: H / 2, fx: L / 2, fy: W / 2, fz: 0, bx: L, by: W, bz: H, openH: H, stage: 1, size: Math.max(L, W, H) * 2 };
  }

  function pose() {
    const f = state.fold;
    if (hinge.fam === 'slotted') {
      const fb = Math.min(f / 0.6, 1), ff = Math.max(0, Math.min((f - 0.6) / 0.4, 1));
      hinge.bodies.forEach((g) => { g.rotation.y = (Math.PI / 2) * fb; });
      hinge.flaps.forEach((g) => { g.rotation.x = -g.userData.s * (Math.PI / 2) * ff; });
      hinge.joint.rotation.y = -(Math.PI / 2) * fb; hinge.joint.position.x = 1.5 * fb;
    } else if (hinge.fam === 'cross') {
      hinge.walls.forEach((g) => {
        const a = (Math.PI / 2) * f * g.userData.s;
        if (g.userData.key === 'x') g.rotation.x = a; else g.rotation.y = a;
      });
    }
  }

  function rebuild(code, d) {
    while (pivot.children.length) pivot.remove(pivot.children[0]);
    hinge = {};
    const st = window.FEFCO_STYLES[code];
    const c = st.fam === 'cross' ? buildCross(st, d) : buildSlotted(st, d);
    const r = st.build(d);
    c.rBox = Math.hypot(c.bx || d.L, c.by || d.W, c.bz || d.H) / 2;           // carton fermé
    c.rFlat = Math.hypot(r.coupe, r.laize) / 2;                                // carton à plat
    state.center = c; state.zoomK = 1;
    pose(); fit(); frame();
  }
  // Distance de la caméra pour que le carton reste entier dans la vue (portrait ou paysage).
  function fit() {
    const c = state.center; if (!c) return;
    const half = Math.min(THREE.MathUtils.degToRad(camera.fov) / 2, Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(camera.aspect, 1.6)));
    const need = (r) => (r * 1.22) / Math.sin(half);
    c.dBox = need(c.rBox); c.dFlat = need(c.rFlat);
    c.dOpen = need(Math.hypot(c.bx, c.by, c.openH) / 2);
  }
  function frame() {
    const c = state.center; if (!c) return;
    // on tourne autour du centre du carton, qui glisse du plan à plat vers le carton fermé
    // phases : à plat -> corps replié (rabats ouverts) -> carton fermé
    const f = state.fold, s = (x) => x * x * (3 - 2 * x), mix = (p, q, t) => p + (q - p) * t;
    const body = s(Math.min(1, f / c.stage)), close = f > c.stage ? s((f - c.stage) / (1 - c.stage)) : 0;
    const cx = mix(c.fx, c.cx, body), cy = mix(c.fy, c.cy, body), cz = mix(c.fz, c.cz, body);
    const dist = mix(mix(c.dFlat, c.dOpen, body), c.dBox, close) * state.zoomK;
    pivot.position.set(0, 0, 0);
    camera.position.set(0, 0, dist);
    pivot.rotation.set(state.rx, state.ry, 0, 'XYZ');
    const o = new THREE.Vector3(cx, cy, cz).applyEuler(pivot.rotation);
    pivot.position.set(-o.x, -o.y, -o.z);
    renderer.render(scene, camera);
  }
  function resize() {
    const w = box.clientWidth, h = box.clientHeight || 420; if (!w) return;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); fit(); frame();
  }
  // Rotation à la souris / au doigt
  let drag = null;
  box.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.ry += (e.clientX - drag[0]) * 0.008; state.rx += (e.clientY - drag[1]) * 0.008;
    state.rx = Math.max(-1.5, Math.min(1.5, state.rx)); drag = [e.clientX, e.clientY]; frame();
  });
  box.addEventListener('pointerup', () => { drag = null; });
  box.addEventListener('wheel', (e) => { e.preventDefault(); state.zoomK = Math.max(0.35, Math.min(3, state.zoomK * (e.deltaY > 0 ? 1.08 : 0.92))); frame(); }, { passive: false });
  const sl = $('fold');
  if (sl) sl.addEventListener('input', () => { state.fold = sl.value / 100; pose(); frame(); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(box);
  (function loop() { if (state.auto && box.offsetParent) { state.ry += 0.006; frame(); } requestAnimationFrame(loop); })();

  window.FEFCO_3D = {
    update(code, d) { rebuild(code, d); resize(); },
    show() { resize(); },
    setAuto(v) { state.auto = v; },
    setFold(f) { state.fold = f; pose(); frame(); },
  };
})();
