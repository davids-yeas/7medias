(function () {
  const S = window.FEFCO_STYLES, $ = (id) => document.getElementById(id);
  const codes = Object.keys(S);
  const DEF = { code: '0201', L: 400, W: 300, H: 250, j: 35, o: 40, jeu: 0, v: 30, client: '', view: 'plan' };
  const st = Object.assign({}, DEF);
  try { Object.assign(st, JSON.parse(localStorage.getItem('dieline') || '{}')); } catch (e) {}
  st.code = ''; // à l'ouverture, aucun modèle n'est sélectionné
  try { // lien de partage : ?c=0201&L=400&W=300&H=250
    const q = new URLSearchParams(location.search);
    if (S[q.get('c')]) { st.code = q.get('c'); ['L', 'W', 'H', 'j', 'o', 'jeu', 'v'].forEach((k) => { if (q.has(k)) st[k] = Math.max(0, parseFloat(q.get(k)) || 0); }); }
  } catch (e) {}
  if (!S[st.code]) st.code = '';
  const save = () => { try { localStorage.setItem('dieline', JSON.stringify(st)); } catch (e) {} };
  const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('fr-FR', { maximumFractionDigits: d });
  const num = (v) => Math.max(0, parseFloat(v) || 0);
  const dims = () => ({ L: st.L, W: st.W, H: st.H, j: st.j, o: st.o, jeu: st.jeu, v: st.v });
  /* ---------- Stockage local : favoris, récents, historique ---------- */
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  let favs = store.get('dieline-fav', []).filter((c) => S[c]);
  let recent = store.get('dieline-recent', []).filter((c) => S[c]);
  let hist = store.get('dieline-hist', []).filter((h) => S[h.c]);
  let lastCode = null, ready = false, logTimer = null;
  const CFG = window.SNOTRAC_CONFIG || {};
  const cloud = { available: false, on: false, code: '', name: store.get('dieline-name', '') };
  const DEV = store.get('dieline-dev', '') || (() => { const d = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('dieline-dev', d); return d; })();
  let localHist = hist;                 // historique de cet appareil (hors partage)
  const persist = () => { if (!cloud.on) store.set('dieline-hist', hist); };
  let cur = null;                       // dernier résultat de calcul
  const view = { z: 1, px: 0, py: 0 };  // zoom / déplacement du plan

  /* ---------- Bibliothèque visuelle ---------- */
  const thumb = (code) => {
    const r = S[code].build({ L: 400, W: 300, H: 250, j: 35, o: 40, jeu: 0, v: 30 });
    const p = 30, m = Math.max(r.coupe, r.laize) * 0.04;
    let s = '';
    r.rects.forEach((q) => { s += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`; });
    r.polys.forEach((q) => { s += `<polygon points="${q.pts.map((a) => a.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`; });
    return `<svg viewBox="${-m} ${-m} ${r.coupe + 2 * m} ${r.laize + 2 * m}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s}</svg>`;
  };
  function buildLib(filter) {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const f = norm((filter || '').trim());
    let html = '', last = '';
    codes.forEach((c) => {
      const t = S[c];
      if (f && !norm(c + ' ' + t.title + ' ' + t.serie).includes(f)) return;
      if (t.serie !== last) { html += `<div class="grp">${t.serie}</div>`; last = t.serie; }
      html += `<button type="button" class="item${c === st.code ? ' on' : ''}" data-c="${c}">${thumb(c)}<div><b>${c}</b>${t.conf !== 'ok' ? '<i class="tag">à valider</i>' : ''}<span>${t.title}</span></div></button>`;
    });
    $('libList').innerHTML = html || '<p class="note" style="padding:8px">Aucun code trouvé. Essaie 0201 ou « plateau ».</p>';
  }

  /* ---------- Calcul + mise à jour ---------- */
  function syncModelUI() {
    const t = S[st.code];
    $('cmThumb').innerHTML = thumb(st.code); $('cmCode').textContent = st.code; $('cmTitle').textContent = t.title; $('cmWarn').hidden = t.conf === 'ok';
    $('idCode').textContent = st.code; $('idTitle').textContent = t.title; $('idWarn').hidden = t.conf === 'ok';
    document.querySelectorAll('[data-p]').forEach((l) => { l.style.display = t.params.includes(l.dataset.p) ? '' : 'none'; });
    if (st.code !== lastCode) { lastCode = st.code; recent = [st.code].concat(recent.filter((c) => c !== st.code)).slice(0, 6); store.set('dieline-recent', recent); if (ready) setView(st.view); }
    syncFav(); renderQuick();
  }
  function compute() {
    cur = S[st.code].build(dims());
    const ps = pieces(cur), surf = ps.reduce((s, p) => s + p.laize * p.coupe * (p.qty || 1), 0) / 1e6;
    $('laize').textContent = ps.map((p) => fmt(p.laize)).join(' · ');
    $('coupe').textContent = ps.map((p) => fmt(p.coupe)).join(' · ');
    $('surf').textContent = fmt(surf, 3);
    $('vol').textContent = fmt(st.L * st.W * st.H / 1e6, 1);
    return surf;
  }
  // Plusieurs pièces (fond + couvercle) : laize et coupe par pièce, surface additionnée.
  const pieces = (r) => r.pieces || [{ n: '', x: 0, coupe: r.coupe, laize: r.laize }];
  function showNoDims(missing) {
    document.querySelector('.work').classList.toggle('nodims', missing.length > 0);
    if (missing.length) $('noDimsList').textContent = missing.join(', ');
  }
  function showEmpty(on) {
    document.querySelector('.work').classList.toggle('nomodel', on);
    const c = $('curModel'); c.classList.toggle('empty', on);
    $('cmLabel').textContent = on ? 'Studio' : 'Modèle sélectionné';
    $('cmChg').firstChild.textContent = on ? 'Choisir' : 'Changer';
    c.setAttribute('aria-label', on ? 'Aucun modèle sélectionné. Choisir un modèle.' : 'Modèle sélectionné. Changer de modèle.');
    if (on) {
      $('cmThumb').innerHTML = '<svg viewBox="0 0 76 52" aria-hidden="true"><rect x="3" y="6" width="70" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/></svg>';
      $('cmCode').textContent = 'Aucun modèle sélectionné'; $('cmTitle').textContent = 'Choisis un modèle pour commencer.'; $('cmWarn').hidden = true;
    }
  }
  function refresh(opts = {}) {
    if (!S[st.code]) { showEmpty(true); showNoDims([]); renderQuick(); if (opts.lib) buildLib($('q').value); return; }
    showEmpty(false);
    syncModelUI();
    const missing = ['L', 'W', 'H'].filter((k) => !st[k]);
    showNoDims(missing);
    if (missing.length) { save(); return; }
    compute(); drawPlan();
    if (st.view !== 'plan' && S[st.code].fam && window.FEFCO_3D) { window.FEFCO_3D.update(st.code, dims()); autoFold(); }
    if (opts.lib) buildLib($('q').value);
    save();
    if (ready) scheduleLog();
  }

  /* ---------- Plan 2D ---------- */
  const NAMES = { L: 'Grand panneau L', W: 'Petit panneau W', j: 'Joint collé', H: 'Paroi H', 'L×W': 'Fond' };
  function drawPlan() {
    const r = cur, m = Math.max(r.coupe, r.laize), fs = m / 52, pad = fs * 5.5, off = fs * 2.6;
    const hasH = !!r.bodyY;
    const x0 = -pad - (hasH ? fs * 3 : 0), y0 = -pad, w = r.coupe + 2 * pad + off + (hasH ? fs * 3 : 0) + fs * 2, h = r.laize + 2 * pad + off + fs * 2;
    view.base = { x: x0, y: y0, w, h }; applyView();
    $('svg').style.aspectRatio = `${w} / ${h}`;
    const T = (x, y, t, c, o = {}) => `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" class="${c}"${o.rot ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${t}</text>`;
    const label = (cx, cy, w, h, l) => {
      if (!l) return '';
      const t = l.txt || (l.v == null ? l.t : `${l.t} = ${fmt(l.v)}`);
      const rot = l.rot || h > w * 1.6, run = rot ? h : w, thick = rot ? w : h;
      if (run < t.length * fs * 0.6 || thick < fs * 1.2) return '';
      return T(cx, cy, t, 'tx', { rot });
    };
    let s = '';
    r.rects.forEach((q) => {
      const l = q.label || {}, isFlap = q.fl != null ? q.fl : l.t && l.t !== 'L' && l.t !== 'W' && l.t !== 'H' && l.t !== 'L×W';
      const name = isFlap ? (l.t ? 'Rabat ' + l.t : 'Rabat de coin') : NAMES[l.t] || NAMES[(l.t || '').replace(/\+/g, '')] || 'Panneau';
      const info = `${name} · ${fmt(q.w)} × ${fmt(q.h)} mm`;
      s += `<rect class="pn${isFlap ? ' fl' : ''}" data-i="${info}" x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}"/>`;
      s += label(q.x + q.w / 2, q.y + q.h / 2, q.w, q.h, q.label);
    });
    r.polys.forEach((p) => {
      const xs = p.pts.map((a) => a[0]), ys = p.pts.map((a) => a[1]);
      s += `<polygon class="pn fl" data-i="Joint collé · ${fmt(Math.max(...xs) - Math.min(...xs))} mm" points="${p.pts.map((a) => a.join(',')).join(' ')}"/>`;
      s += label((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), p.label);
    });
    r.creases.forEach((c) => { s += `<line class="cr" x1="${c[0]}" y1="${c[1]}" x2="${c[2]}" y2="${c[3]}"/>`; });
    const tk = fs * 0.6;
    const dimV = (x, a, b, t, cls, rot) => `<line class="dm ${cls}" x1="${x}" y1="${a}" x2="${x}" y2="${b}"/><line class="dm ${cls}" x1="${x - tk}" y1="${a}" x2="${x + tk}" y2="${a}"/><line class="dm ${cls}" x1="${x - tk}" y1="${b}" x2="${x + tk}" y2="${b}"/>` + T(x + (rot === 1 ? fs * 1.3 : -fs * 1.3), (a + b) / 2, t, 'dt', { rot: 1 });
    pieces(r).forEach((p, i, all) => {
      const px = p.x, pr = p.x + p.coupe, pb = p.laize + off, left = i < all.length - 1;   // 1re pièce : cote à gauche
      s += dimV(left ? px - off : pr + off, 0, p.laize, `LAIZE ${fmt(p.laize)}`, 'laize', left ? 2 : 1);
      s += `<line class="dm coupe" x1="${px}" y1="${pb}" x2="${pr}" y2="${pb}"/><line class="dm coupe" x1="${px}" y1="${pb - tk}" x2="${px}" y2="${pb + tk}"/><line class="dm coupe" x1="${pr}" y1="${pb - tk}" x2="${pr}" y2="${pb + tk}"/>` + T((px + pr) / 2, pb + fs * 1.4, `${p.n ? p.n.toUpperCase() + ' · ' : ''}COUPE ${fmt(p.coupe)}`, 'dt');
    });
    if (hasH) s += dimV(-off - fs * 0.8, r.bodyY[0], r.bodyY[1], `H = ${fmt(r.bodyY[1] - r.bodyY[0])}`, 'hh', 2);
    $('svg').innerHTML = s;
    $('svg').dataset.fs = fs;
  }
  function applyView() {
    const b = view.base; if (!b) return;
    const w = b.w / view.z, h = b.h / view.z;
    const x = b.x + (b.w - w) / 2 - view.px * b.w, y = b.y + (b.h - h) / 2 - view.py * b.h;
    $('svg').setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    const zp = $('zpct'); if (zp) { zp.textContent = Math.round(view.z * 100) + ' %'; $('zin').disabled = view.z >= 12; $('zout').disabled = view.z <= 0.5; }
  }
  const svg = $('svg'), ZMIN = 0.5, ZMAX = 12;
  const setZoom = (z) => { view.z = Math.max(ZMIN, Math.min(ZMAX, z)); applyView(); };
  svg.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  $('zin').onclick = () => setZoom(view.z * 1.35);
  $('zout').onclick = () => setZoom(view.z / 1.35);
  // Main : active le déplacement (souris ou doigt). Sur écran tactile elle est éteinte au départ pour laisser la page défiler.
  let handOn = matchMedia('(hover:hover)').matches;
  const syncHand = () => { $('hand').setAttribute('aria-pressed', handOn); svg.classList.toggle('hand', handOn); };
  $('hand').onclick = () => { handOn = !handOn; syncHand(); toast(handOn ? 'Main active : glisse et pince le plan' : 'Main éteinte : la page défile'); };
  syncHand();
  const ptrs = new Map(); let pinch0 = null;
  svg.addEventListener('pointerdown', (e) => {
    if (!handOn) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    svg.classList.add('drag');
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch0 = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, z: view.z }; }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2 && pinch0) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a1, b1] = [...ptrs.values()]; setZoom(pinch0.z * Math.hypot(a1.x - b1.x, a1.y - b1.y) / pinch0.d); return;
    }
    const r = svg.getBoundingClientRect(), b = view.base, sc = Math.max(b.w / view.z / r.width, b.h / view.z / r.height);
    view.px += (e.clientX - p.x) * sc / b.w; view.py += (e.clientY - p.y) * sc / b.h;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); applyView();
  });
  const endPtr = (e) => { ptrs.delete(e.pointerId); pinch0 = null; if (!ptrs.size) svg.classList.remove('drag'); };
  svg.addEventListener('pointerup', endPtr); svg.addEventListener('pointercancel', endPtr);
  svg.addEventListener('dblclick', resetView);
  function resetView() { view.z = 1; view.px = 0; view.py = 0; applyView(); }
  $('reset').onclick = resetView;
  /* ---------- Plein écran (plan et 3D) ---------- */
  function setFull(id, on) {
    const pane = $(id), btn = $(id === 'panePlan' ? 'fsPlan' : 'fs3d');
    pane.classList.toggle('full', on); document.documentElement.classList.toggle('nofs', on);
    btn.setAttribute('aria-pressed', on); btn.setAttribute('aria-label', on ? 'Quitter le plein écran' : 'Plein écran'); btn.title = on ? 'Quitter le plein écran' : 'Plein écran';
    if (typeof hideTip === 'function') hideTip();
    if (id === 'pane3d' && window.FEFCO_3D) setTimeout(() => window.FEFCO_3D.show(), 60);
    if (id === 'panePlan') applyView();
  }
  const toggleFull = (id) => setFull(id, !$(id).classList.contains('full'));
  $('fsPlan').onclick = () => toggleFull('panePlan');
  $('fs3d').onclick = () => toggleFull('pane3d');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ['panePlan', 'pane3d'].forEach((id) => { if ($(id).classList.contains('full')) setFull(id, false); }); });
  const ro = $('readout'), roDef = ro.textContent;
  svg.addEventListener('mouseover', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i) { ro.textContent = i; ro.classList.add('live'); } });
  svg.addEventListener('mouseout', (e) => { if (e.target.dataset && e.target.dataset.i) { ro.textContent = roDef; ro.classList.remove('live'); } });
  [['mLaize', 'hl-laize'], ['mCoupe', 'hl-coupe']].forEach(([id, cl]) => {
    $(id).addEventListener('mouseenter', () => svg.classList.add(cl));
    $(id).addEventListener('mouseleave', () => svg.classList.remove(cl));
  });

  /* ---------- Saisie ---------- */
  const sync = (k, v) => { st[k] = v; if ($(k)) $(k).value = !v && ['L', 'W', 'H'].includes(k) ? '' : v; };
  $('dimReset').onclick = () => {
    ['L', 'W', 'H'].forEach((k) => sync(k, 0)); $('L').value = $('W').value = $('H').value = '';
    sync('j', DEF.j); sync('o', DEF.o); sync('jeu', DEF.jeu); sync('v', DEF.v);
    resetView(); refresh(); toast('Dimensions effacées'); $('L').focus();
  };
  $('client').addEventListener('input', (e) => { st.client = e.target.value.slice(0, 60); refresh(); });
  ['L', 'W', 'H'].forEach((k) => {
    $(k).addEventListener('input', (e) => { st[k] = num(e.target.value); refresh(); });
  });
  ['j', 'o', 'jeu', 'v'].forEach((k) => $(k).addEventListener('input', (e) => { st[k] = num(e.target.value); refresh(); }));
  const mobile = () => matchMedia('(max-width:860px)').matches;
  $('libList').addEventListener('click', (e) => {
    const b = e.target.closest('.item'); if (!b) return;
    st.code = b.dataset.c; resetView();
    if (mobile()) { $('q').value = ''; document.querySelector('#viewTool .lib').classList.remove('searching'); $('q').blur(); }
    refresh({ lib: true });
  });
  $('q').addEventListener('input', () => { buildLib($('q').value); document.querySelector('#viewTool .lib').classList.toggle('searching', !!$('q').value.trim()); });

  /* ---------- Affichage Plan / 3D / Les deux ---------- */
  function setView(v) {
    st.view = v;
    const t = S[st.code], no3d = !!t && !t.fam;
    document.querySelectorAll('.seg button').forEach((b) => { if (b.dataset.v !== 'plan') { b.disabled = no3d; b.title = no3d ? 'Vue 3D non disponible pour ce modèle' : ''; } });
    if (no3d) v = 'plan';
    document.querySelectorAll('.seg button').forEach((b) => { const on = v === 'both' || b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('panePlan').hidden = v === '3d'; $('pane3d').hidden = v === 'plan';
    $('stage').classList.toggle('both', v === 'both');
    if (v !== 'plan' && window.FEFCO_3D && t) { window.FEFCO_3D.update(st.code, dims()); startFold(); }
    save();
  }
  // Plan et 3D se cochent séparément ; les deux cochés = affichage côte à côte (au moins un reste coché).
  document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => {
    if (b.disabled) return;
    const on = { plan: st.view !== '3d', '3d': st.view !== 'plan' };
    on[b.dataset.v] = !on[b.dataset.v];
    if (!on.plan && !on['3d']) on[b.dataset.v === 'plan' ? '3d' : 'plan'] = true;
    setView(on.plan && on['3d'] ? 'both' : on.plan ? 'plan' : '3d');
  }));

  /* ---------- Lecture du pliage : boucle automatique, le curseur reprend la main ---------- */
  const fold = $('fold'), play = $('play');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = false, userPaused = reduce, dir = 1, hold = 0, last = 0, raf = null;
  function tick(t) {
    if (!playing) return;
    const dt = last ? Math.min(t - last, 60) : 0; last = t;
    if (hold > 0) hold -= dt;
    else if (!$('pane3d').hidden && $('pane3d').offsetParent) {
      let v = +fold.value / 100 + dir * dt / 3400;
      if (v >= 1) { v = 1; dir = -1; hold = 1400; } else if (v <= 0) { v = 0; dir = 1; hold = 900; }
      fold.value = v * 100; fold.dispatchEvent(new Event('input'));
    }
    raf = requestAnimationFrame(tick);
  }
  // Départ depuis le carton à plat : il se replie, puis se déplie, en boucle.
  let foldCode = '';
  function startFold() {
    foldCode = st.code;
    if (userPaused) return;                       // la personne a pris la main : on respecte sa position
    fold.value = 0; fold.dispatchEvent(new Event('input')); dir = 1; hold = 600; setPlay(true);
  }
  function autoFold() { if (st.code !== foldCode) startFold(); else if (!userPaused && !playing) setPlay(true); }
  function setPlay(on) {
    playing = on; last = 0; if (raf) cancelAnimationFrame(raf); raf = null;
    play.dataset.playing = on; play.setAttribute('aria-label', on ? 'Pause' : 'Lecture'); play.title = on ? 'Pause' : 'Lecture';
    if (on) raf = requestAnimationFrame(tick);
  }
  play.onclick = () => { userPaused = playing; setPlay(!playing); };
  fold.addEventListener('pointerdown', () => { userPaused = true; setPlay(false); });
  fold.addEventListener('keydown', () => { userPaused = true; setPlay(false); });
  $('auto').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); if (window.FEFCO_3D) window.FEFCO_3D.setAuto(on); };

  /* ---------- Récapitulatif, thème, export ---------- */
  function recapText(e) {
    const su = e.la * e.co / 1e6;
    return `FEFCO ${e.c} – ${S[e.c].title}${e.cl ? `\nClient : ${e.cl}` : ''}\nDimensions int. : ${fmt(e.L, 0)} × ${fmt(e.W, 0)} × ${fmt(e.H, 0)} mm\nLaize : ${fmt(e.la)} mm\nCoupe : ${fmt(e.co)} mm\nSurface : ${fmt(su, 3)} m²\nVolume utile : ${fmt(e.L * e.W * e.H / 1e6, 1)} L`;
  }
  const curEntry = () => ({ c: st.code, L: st.L, W: st.W, H: st.H, j: st.j, o: st.o, jeu: st.jeu, v: st.v, la: cur.laize, co: cur.coupe, cl: (st.client || '').trim() });
  function copyText(txt, done) {
    const fallback = () => { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove(); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
  }
  function copyRecap(card) {
    scheduleLog(true);
    copyText(recapText(curEntry()), () => { card.classList.add('copied'); setTimeout(() => card.classList.remove('copied'), 1600); });
  }
  document.querySelectorAll('.metrics .m').forEach((c) => c.addEventListener('click', () => copyRecap(c)));
  // Thème sombre (noir) à chaque ouverture, quel que soit le réglage de l'appareil.
  // Le bouton soleil / lune passe en clair pour la session en cours seulement.
  document.documentElement.dataset.theme = 'dark';
  $('theme').onclick = () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
  };
  /* ---------- Menu : Outil / Guide ---------- */
  function miniPlan() {
    const r = S['0201'].build({ L: 400, W: 300, H: 250, j: 35, o: 40, jeu: 0, v: 30 });
    const fs = 52, pad = 120, x0 = -pad, y0 = -40, w = r.coupe + pad + 230, h = r.laize + 230;
    const T = (x, y, t, c, rot) => `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" class="${c}"${rot ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${t}</text>`;
    let s = '';
    r.rects.forEach((q) => { const l = q.label.t; s += `<rect class="pn${l === '½W' ? ' fl' : ''}" x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}"/>` + T(q.x + q.w / 2, q.y + q.h / 2, l, 'tx'); });
    r.creases.forEach((c) => { s += `<line class="cr" x1="${c[0]}" y1="${c[1]}" x2="${c[2]}" y2="${c[3]}"/>`; });
    const bx = r.coupe + 50, by = r.laize + 50;
    s += `<line class="dm" x1="${bx}" y1="0" x2="${bx}" y2="${r.laize}"/>` + T(bx + 60, r.laize / 2, 'LAIZE = W + H', 'dt', 1);
    s += `<line class="dm" x1="0" y1="${by}" x2="${r.coupe}" y2="${by}"/>` + T(r.coupe / 2, by + 62, 'COUPE = 2L + 2W + joint', 'dt');
    s += T(-60, (r.bodyY[0] + r.bodyY[1]) / 2, 'H', 'dt');
    $('miniPlan').innerHTML = `<svg viewBox="${x0} ${y0} ${w} ${h}" role="img">${s}</svg>`;
  }
  let srcInit = false;
  const VIEWS = { tool: 'viewTool', lib: 'viewLib', hist: 'viewHist', guide: 'viewGuide' }, HASH = { tool: '', lib: '#library', hist: '#history', guide: '#guide' };
  function page(p, scrollTo, focusSel) {
    Object.keys(VIEWS).forEach((k) => { $(VIEWS[k]).hidden = k !== p; });
    document.querySelectorAll('.dock button').forEach((b) => b.classList.toggle('on', b.dataset.page === p));
    $('dock').style.setProperty('--i', Object.keys(VIEWS).indexOf(p));
    try { history.replaceState(null, '', HASH[p] || location.pathname + location.search); } catch (e) {}
    if (p === 'guide') { if (!$('miniPlan').firstChild) miniPlan(); renderSource(); }
    if (p === 'hist') { renderHist(); refreshCloud(); }
    if (p === 'lib') { renderCat(); renderSource(); if (!srcInit) { $('srcBox').open = false; srcInit = true; } }
    window.scrollTo(0, 0);
    if (scrollTo) $(scrollTo).scrollIntoView();
    if (p === 'lib' && focusSel) { const el = document.querySelector('.cc.sel'); if (el) el.scrollIntoView({ block: 'center' }); }
    if (p === 'tool' && st.view !== 'plan' && S[st.code] && S[st.code].fam && window.FEFCO_3D) window.FEFCO_3D.show();
  }
  document.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => page(b.dataset.page)));
  $('curModel').addEventListener('click', () => page('lib', null, true));
  document.querySelectorAll('.toc [data-s]').forEach((b) => b.addEventListener('click', () => $(b.dataset.s).scrollIntoView({ behavior: 'smooth' })));
  $('tryEx').onclick = () => { ['L', 'W', 'H'].forEach((k, i) => sync(k, [400, 300, 250][i])); st.code = '0201'; refresh({ lib: true }); page('tool'); };

  /* ---------- Page Bibliothèque ---------- */
  const CAT = window.FEFCO_CATALOG, cat = { s: 'all', m: 'all', t: 'all', f: false };
  const MODES = { M: 'Manuel', A: 'Automatique', 'M/A': 'Manuel ou auto' };
  const statusOf = (c) => (!S[c] ? 'ajouter' : S[c].conf === 'ok' ? 'dispo' : 'valider');
  const STAT = { dispo: 'Disponible', valider: 'À valider', ajouter: 'À ajouter' };
  /* ---------- Bulles d'information ---------- */
  const TIPS = {
    s: {
      all: 'Toutes les séries du code FEFCO.',
      '0100': 'Rouleaux et feuilles de carton ondulé vendus en l\'état, avant transformation.',
      '0200': 'Caisses à rabats : une seule pièce avec un joint (collé, agrafé ou ruban) et des rabats en haut et en bas. Livrées à plat, prêtes à l\'emploi, à fermer avec les rabats.',
      '0300': 'Boîtes télescopiques : en général plusieurs pièces, par exemple un fond et un couvercle, qui s\'emboîtent l\'une sur l\'autre.',
      '0400': 'Boîtes à rabat et plateaux : en général une seule pièce. Le fond est articulé pour former deux ou toutes les parois et le couvercle. Languettes, poignées ou panneaux d\'affichage possibles.',
      '0500': 'Boîtes coulissantes : plusieurs pièces (intérieurs et fourreaux) qui coulissent les unes dans les autres. Comprend aussi les fourreaux extérieurs pour d\'autres caisses.',
    },
    m: {
      all: 'Tous les modes de montage.',
      M: 'Montage généralement manuel : le carton est monté et fermé à la main.',
      A: 'Montage généralement automatique : le carton est monté sur une machine.',
      'M/A': 'Peut être monté à la main ou en machine.',
    },
    t: {
      all: 'Tous les statuts.',
      dispo: 'Plan disponible dans l\'outil. La géométrie suit les cotes du code FEFCO.',
      valider: 'Plan disponible, mais sa géométrie doit encore être confirmée avec le PDF FEFCO.',
      ajouter: 'Code relevé dans le PDF. Son plan n\'est pas encore dans l\'outil.',
    },
  };
  const GROUP_TITLE = { s: 'Séries', m: 'Montage', t: 'Statut' };
  const tipEl = document.createElement('div');
  tipEl.id = 'tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl);
  let tipFor = null;
  function showTip(target, html) {
    tipEl.innerHTML = html; tipEl.hidden = false; tipFor = target;
    const r = target.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, m = 8;
    let x = r.left + r.width / 2 - w / 2; x = Math.max(m, Math.min(x, innerWidth - w - m));
    let y = r.bottom + 8; if (y + h > innerHeight - 100) y = Math.max(m, r.top - h - 8);
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { tipEl.hidden = true; tipFor = null; }
  function groupHtml(g) {
    const names = g === 's' ? CAT.series : g === 'm' ? MODES : { dispo: 'Disponible', valider: 'À valider', ajouter: 'À ajouter' };
    return `<b>${GROUP_TITLE[g]}</b>` + Object.keys(TIPS[g]).filter((k) => k !== 'all').map((k) => `<p><u>${g === 's' ? k + ' · ' : ''}${names[k] || k}</u> ${TIPS[g][k]}</p>`).join('');
  }
  function serieHtml(s) {
    const nb = CAT.list.filter((x) => x.s === s).length, pl = codes.filter((c) => c.slice(0, 2) + '00' === s).length;
    const pg = (PDF.find((r) => r[0] === s) || [])[2];
    return `<b>${s} · ${CAT.series[s]}</b>${TIPS.s[s]}<p><u>${nb} codes</u> relevés${pg ? ' · page ' + pg + ' du PDF' : ''} · <u>${pl}</u> plan${pl > 1 ? 's' : ''} dans l'outil</p>`;
  }
  function tipHtml(el) {
    if (el.dataset.serie) return serieHtml(el.dataset.serie);
    if (el.dataset.tipgroup) return groupHtml(el.dataset.tipgroup);
    return el.dataset.tip;
  }
  const TIPSEL = '[data-none]';
  const canHover = matchMedia('(hover:hover)').matches;
  document.addEventListener('mouseover', (e) => {
    if (!canHover) return;
    const t = e.target.closest(TIPSEL);
    if (t) { if (t !== tipFor) showTip(t, tipHtml(t)); } else if (tipFor) hideTip();
  });
  document.addEventListener('focusin', (e) => { const t = e.target.closest(TIPSEL); if (t && canHover) showTip(t, tipHtml(t)); });
  document.addEventListener('focusout', () => { if (canHover) hideTip(); });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-none]');
    if (t) {
      e.preventDefault(); e.stopPropagation();
      if (tipFor === t && !canHover) { hideTip(); return; }
      showTip(t, tipHtml(t));
    } else hideTip();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });

  const chip = (grp, v, l, n) => `<button type="button" class="chip${cat[grp] === v ? ' on' : ''}" data-g="${grp}" data-v="${v}">${l}<small>${n}</small></button>`;
  function matches(x, skip) {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm($('cq').value.trim());
    if (q) {
      const hay = norm(x.c + ' ' + CAT.series[x.s] + ' ' + (S[x.c] ? S[x.c].title : '') + ' ' + (MODES[x.m] || ''));
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (cat.f && !favs.includes(x.c)) return false;
    if (skip !== 's' && cat.s !== 'all' && x.s !== cat.s) return false;
    if (skip !== 'm' && cat.m !== 'all' && x.m !== cat.m) return false;
    if (skip !== 't' && cat.t !== 'all' && statusOf(x.c) !== cat.t) return false;
    return true;
  }
  function renderCat() {
    const avail = CAT.list.filter((x) => S[x.c]).length;
    $('catAvail').textContent = avail; $('catTotal').textContent = CAT.list.length;
    $('catBar').style.width = (avail / CAT.list.length * 100) + '%';
    const cnt = (skip, f) => CAT.list.filter((x) => matches(x, skip) && f(x)).length;
    $('fSerie').innerHTML = chip('s', 'all', 'Toutes', cnt('s', () => true)) + Object.keys(CAT.series).map((s) => chip('s', s, s, cnt('s', (x) => x.s === s))).join('');
    $('fMode').innerHTML = chip('m', 'all', 'Tous', cnt('m', () => true)) + Object.keys(MODES).map((m) => chip('m', m, MODES[m], cnt('m', (x) => x.m === m))).join('');
    $('fStatus').innerHTML = chip('t', 'all', 'Tous', cnt('t', () => true)) + Object.keys(STAT).map((t) => chip('t', t, STAT[t], cnt('t', (x) => statusOf(x.c) === t))).join('');
    let html = '', last = '', n = 0;
    CAT.list.forEach((x) => {
      if (!matches(x)) return;
      if (x.s !== last) { html += `<div class="cat-s"><span>${x.s} · ${CAT.series[x.s]}</span></div>`; last = x.s; }
      n++;
      const ok = !!S[x.c], mode = x.m ? `<small>${MODES[x.m]}</small>` : '', warn = ok && S[x.c].conf !== 'ok' ? '<i class="tag">à valider</i>' : '';
      const sel = x.c === st.code;
      html += ok
        ? `<button type="button" class="cc ok${sel ? ' sel' : ''}" data-c="${x.c}">${thumb(x.c)}<b>${x.c}${warn}${favs.includes(x.c) ? '<span class="fstar" aria-label="favori">★</span>' : ''}</b>${mode}<span class="t">${S[x.c].title}</span><span class="st">${sel ? 'Sélectionné' : 'Choisir ce modèle'}</span></button>`
        : `<div class="cc off"><div class="ph">plan à ajouter</div><b>${x.c}</b>${mode}<span class="st">À ajouter</span></div>`;
    });
    $('catFav').setAttribute('aria-pressed', cat.f); $('catFav').querySelector('small').textContent = favs.length;
    const nf = (($('cq').value.trim() ? 1 : 0) + (cat.s !== 'all') + (cat.m !== 'all') + (cat.t !== 'all') + (cat.f ? 1 : 0));
    $('catReset').textContent = nf ? `Réinitialiser (${nf})` : 'Réinitialiser'; $('catReset').classList.toggle('active', !!nf);
    $('catCount').textContent = `${n} code${n > 1 ? 's' : ''} affiché${n > 1 ? 's' : ''}`;
    $('catGrid').innerHTML = html || (cat.f && !favs.length ? '<p class="note">Aucun favori pour l\'instant. Marque un modèle avec l\'étoile dans le Studio.</p>' : '<p class="note">Aucun code ne correspond à ces filtres. Retire un filtre ou clique sur « Réinitialiser ».</p>');
  }
  /* Tableau récapitulatif de la source (pages du PDF, codes relevés, plans de l'outil) */
  const PDF = [['0100', 'Rouleaux et feuilles commerciaux', '9'], ['0200', 'Caisses à rabats', '15'], ['0300', 'Boîtes télescopiques', '30'], ['0400', 'Boîtes à rabat et plateaux', '41'], ['0500', 'Boîtes coulissantes', '74'], ['0600', 'Boîtes rigides', '80'], ['0700', 'Caisses prêtes à coller', '86'], ['0800', 'Retail et e-commerce', '103'], ['0900', 'Aménagements intérieurs', '123']];
  function renderSource() {
    const rows = PDF.map(([s, n, p]) => {
      const rel = CAT.list.filter((x) => x.s === s).length, tool = codes.filter((c) => c.slice(0, 2) + '00' === s).length;
      return `<tr><td>${s}</td><td>${n}</td><td>${p}</td>` + (rel ? `<td>${rel}</td>` : '<td class="todo">à relever</td>') + `<td>${tool}</td></tr>`;
    }).join('');
    document.querySelectorAll('.srctab').forEach((t) => { t.tBodies[0].innerHTML = rows; });
  }
  $('cq').addEventListener('input', renderCat);
  $('catReset').onclick = () => { $('cq').value = ''; cat.s = cat.m = cat.t = 'all'; cat.f = false; renderCat(); };
  $('catFav').onclick = () => { cat.f = !cat.f; renderCat(); };
  ['fSerie', 'fMode', 'fStatus'].forEach((id) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    cat[b.dataset.g] = cat[b.dataset.g] === b.dataset.v ? 'all' : b.dataset.v; renderCat();
  }));
  $('catGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.cc.ok'); if (!b) return;
    st.code = b.dataset.c; resetView(); refresh({ lib: true }); page('tool');
  });

  /* ---------- Raccourcis : favoris et derniers modèles ---------- */
  function syncFav() {
    const on = favs.includes(st.code), b = $('fav');
    b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Ajouter aux favoris'); b.title = on ? 'Retirer des favoris' : 'Ajouter aux favoris';
  }
  function renderQuick() {
    const chips = (list) => list.map((c) => `<button type="button" class="qc${c === st.code ? ' on' : ''}" data-c="${c}" title="${S[c].title}">${c}</button>`).join('');
    const rec = recent.filter((c) => c !== st.code && !favs.includes(c));
    let html = '';
    if (favs.length) html += `<div class="qrow"><span class="ql">★ Favoris</span><div class="qchips">${chips(favs)}</div></div>`;
    if (rec.length) html += `<div class="qrow"><span class="ql">Récents</span><div class="qchips">${chips(rec)}</div></div>`;
    $('quick').innerHTML = html; $('quick').hidden = !html;
  }
  function selectCode(c) { st.code = c; resetView(); refresh({ lib: true }); }
  function clearModel() { st.code = ''; resetView(); refresh({ lib: true }); window.scrollTo(0, 0); toast('Modèle désélectionné'); }
  $('unsel').onclick = clearModel; $('unselCard').onclick = clearModel;
  $('quick').addEventListener('click', (e) => { const b = e.target.closest('.qc'); if (b) selectCode(b.dataset.c); });
  $('fav').onclick = () => {
    const i = favs.indexOf(st.code);
    if (i >= 0) favs.splice(i, 1); else favs.unshift(st.code);
    store.set('dieline-fav', favs); syncFav(); renderQuick();
    toast(i >= 0 ? 'Retiré des favoris' : 'Ajouté aux favoris');
  };

  /* ---------- Historique des calculs ---------- */
  function scheduleLog(now) { clearTimeout(logTimer); if (now) logCalc(); else logTimer = setTimeout(logCalc, 1500); }
  function logCalc() {
    if (!cur) return;
    const e = Object.assign({ t: Date.now(), by: cloud.name }, curEntry());
    const p = cloud.on ? hist.find((x) => x.dev === DEV) : hist[0];
    if (p && ['c', 'L', 'W', 'H', 'j', 'o', 'jeu', 'v'].every((k) => p[k] === e[k]) && (p.cl || '') === (e.cl || '')) return;
    if (cloud.on) { cloudInsert(e); return; }
    hist.unshift(e); hist = hist.slice(0, 40); persist();
    if (!$('viewHist').hidden) renderHist();
  }
  const stamp = (t) => { const d = new Date(t); return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; };
  const IC_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const IC_PDF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
  const IC_DEL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>';
  const clearLabel = () => (cloud.on ? 'Effacer les miens' : 'Tout effacer');
  function renderHist() {
    const el = $('histList');
    $('histClear').hidden = !(cloud.on ? hist.some((h) => h.dev === DEV) : hist.length);
    $('histClear').textContent = clearT ? 'Confirmer ?' : clearLabel();
    $('histLead').textContent = cloud.on ? "Les calculs de toute l'équipe, en direct. Touche une ligne pour la rouvrir." : 'Tes derniers calculs, enregistrés sur cet appareil. Touche une ligne pour la rouvrir.';
    if (!hist.length) { el.innerHTML = '<p class="note empty">Aucun calcul pour l\'instant. Choisis un modèle et saisis des dimensions : chaque calcul s\'enregistre ici.</p>'; return; }
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm($('hq').value.trim()).split(/\s+/).filter(Boolean);
    const shown = hist.map((h, i) => [h, i]).filter(([h]) => { const hay = norm(`${h.cl} ${h.c} ${S[h.c].title} ${h.by}`); return q.every((w) => hay.includes(w)); });
    if (!shown.length) { el.innerHTML = `<p class="note empty">Aucun calcul ne correspond à cette recherche.</p>`; return; }
    el.innerHTML = shown.map(([h, i]) => `<div class="hrow"><button type="button" class="hmain" data-i="${i}">${thumb(h.c)}<span class="ht"><span class="hh"><b>${h.c}</b><em>${S[h.c].title}</em></span>${h.cl ? `<span class="hcl">${esc(h.cl)}</span>` : ''}<span class="hd">${fmt(h.L, 0)} × ${fmt(h.W, 0)} × ${fmt(h.H, 0)} mm</span><span class="hr">Laize ${fmt(h.la)} · Coupe ${fmt(h.co)} · <u>${fmt(h.la * h.co / 1e6, 3)} m²</u></span><span class="hm"><time datetime="${new Date(h.t).toISOString()}">${stamp(h.t)}</time>${h.by ? `<span>Fait par <b>${esc(h.by)}</b></span>` : ''}</span></span></button><div class="hact"><button type="button" class="ibtn" data-act="pdf" data-i="${i}" aria-label="Exporter la fiche en PDF" title="Exporter la fiche en PDF">${IC_PDF}</button><button type="button" class="ibtn" data-act="copy" data-i="${i}" aria-label="Copier le récapitulatif" title="Copier le récapitulatif">${IC_COPY}</button>${!cloud.on || h.dev === DEV ? `<button type="button" class="ibtn" data-act="del" data-i="${i}" aria-label="Supprimer ce calcul" title="Supprimer ce calcul">${IC_DEL}</button>` : ''}</div></div>`).join('');
  }
  $('hq').addEventListener('input', renderHist);
  $('who').value = cloud.name;
  $('who').addEventListener('input', () => { cloud.name = $('who').value.trim().slice(0, 24); store.set('dieline-name', cloud.name); if (cloud.on) renderAuth(); });
  $('histList').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]'), main = e.target.closest('.hmain');
    if (act) {
      const i = +act.dataset.i, h = hist[i]; if (!h) return;
      if (act.dataset.act === 'pdf') exportPdf(h);
      else if (act.dataset.act === 'copy') copyText(recapText(h), () => toast('Récapitulatif copié'));
      else deleteEntry(i);
    } else if (main) {
      const i = +main.dataset.i, h = hist[i]; if (!h) return;
      if (!cloud.on) { hist.splice(i, 1); persist(); }
      st.code = h.c; ['L', 'W', 'H', 'j', 'o', 'jeu', 'v'].forEach((k) => sync(k, h[k] == null ? DEF[k] : h[k])); sync('client', h.cl || '');
      resetView(); refresh({ lib: true }); page('tool'); toast('Calcul rouvert');
    }
  });
  let clearT = null;
  $('histClear').onclick = () => {
    const b = $('histClear');
    if (!clearT) { b.textContent = 'Confirmer ?'; b.classList.add('active'); clearT = setTimeout(() => { clearT = null; b.textContent = clearLabel(); b.classList.remove('active'); }, 3000); return; }
    clearTimeout(clearT); clearT = null; b.textContent = clearLabel(); b.classList.remove('active');
    if (cloud.on) clearMine(); else { hist = []; persist(); renderHist(); toast('Historique effacé'); }
  };


  /* ---------- Historique partagé par code d'accès (API Vercel) ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function api(body) {
    try {
      const r = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = {}; try { data = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, data };
    } catch (e) { return { ok: false, status: 0, data: {} }; }
  }
  function addCloud(h) {
    if (!S[h.c] || hist.some((x) => x.id === h.id)) return;
    hist.unshift(h); hist.sort((a, b) => b.t - a.t); hist = hist.slice(0, 100);
    if (!$('viewHist').hidden) renderHist();
  }
  async function cloudInsert(e) {
    const r = await api({ action: 'add', code: cloud.code, dev: DEV, by: cloud.name, entry: { c: e.c, L: e.L, W: e.W, H: e.H, j: e.j, o: e.o, jeu: e.jeu, v: e.v, la: e.la, co: e.co, cl: e.cl || '' } });
    if (r.status === 401) { lock('Code modifié : saisis le nouveau code'); return; }
    if (!r.ok) { toast('Synchronisation impossible'); return; }
    addCloud(r.data.item);
  }
  async function deleteEntry(i) {
    const h = hist[i]; if (!h) return;
    if (cloud.on) {
      const r = await api({ action: 'delete', code: cloud.code, dev: DEV, id: h.id });
      if (!r.ok) { toast('Suppression impossible'); return; }
      hist = hist.filter((x) => x.id !== h.id);
    } else { hist.splice(i, 1); persist(); }
    renderHist(); toast('Calcul supprimé');
  }
  async function clearMine() {
    const r = await api({ action: 'clear', code: cloud.code, dev: DEV });
    if (!r.ok) { toast('Suppression impossible'); return; }
    hist = hist.filter((x) => x.dev !== DEV); renderHist(); toast('Tes calculs sont effacés');
  }
  async function refreshCloud() {
    if (!cloud.on) return;
    const r = await api({ action: 'list', code: cloud.code });
    if (r.status === 401) { lock('Code modifié : saisis le nouveau code'); return; }
    if (r.ok) { hist = r.data.items.filter((h) => S[h.c]); if (!$('viewHist').hidden) renderHist(); }
  }
  function unlock(code, items) {
    if (!cloud.on) localHist = hist;
    cloud.on = true; cloud.code = code; hist = items.filter((h) => S[h.c]);
    store.set('dieline-code', code); renderAuth(); renderHist();
  }
  function lock(msg) {
    if (!cloud.on) return;
    cloud.on = false; cloud.code = ''; store.set('dieline-code', ''); hist = localHist;
    renderAuth(); renderHist(); if (msg) toast(msg);
  }
  function renderAuth() {
    const box = $('histAuth');
    if (!cloud.available) { box.hidden = true; return; }
    box.hidden = false;
    if (cloud.on) box.innerHTML = `<div class="ab-in"><span><span class="dot"></span>Historique partagé avec l'équipe${cloud.name ? ` · ${esc(cloud.name)}` : ''}</span><button type="button" id="authOut" class="ghost sm">Verrouiller</button></div>`;
    else box.innerHTML = `<form id="authForm" autocomplete="off"><label for="authCode">Historique partagé : saisis le code d'accès</label><div class="ab-row"><input id="authCode" class="code" type="text" inputmode="text" maxlength="6" minlength="6" pattern="[A-Za-z0-9]{6}" required autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="6 caractères" aria-label="Code d'accès à 6 caractères"><button class="primary sm" type="submit">Déverrouiller</button></div><p class="hint">6 caractères : chiffres et lettres. Demande le code à ton responsable. Sans code, l'historique reste sur cet appareil.</p></form>`;
  }
  $('histAuth').addEventListener('input', (e) => { if (e.target.id === 'authCode') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('histAuth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('authCode').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { toast('Le code fait 6 caractères'); return; }
    const r = await api({ action: 'list', code });
    if (r.status === 401) { toast('Code incorrect'); $('authCode').select(); return; }
    if (r.status === 429) { toast('Trop d\'essais, réessaie dans quelques minutes'); return; }
    if (!r.ok) { toast('Historique partagé indisponible'); return; }
    unlock(code, r.data.items); toast('Historique partagé activé');
  });
  $('histAuth').addEventListener('click', (e) => { if (e.target.closest('#authOut')) lock('Historique partagé verrouillé'); });
  async function initCloud() {
    renderAuth();
    if (!CFG.sharedHistory) return;
    const s = await api({ action: 'status' });
    cloud.available = !!(s.ok && s.data.configured);
    if (!cloud.available) { renderAuth(); return; }
    const saved = store.get('dieline-code', '');
    if (saved) { const r = await api({ action: 'list', code: saved }); if (r.ok) unlock(saved, r.data.items); else store.set('dieline-code', ''); }
    renderAuth();
    setInterval(() => { if (cloud.on && !document.hidden && !$('viewHist').hidden) refreshCloud(); }, 8000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('viewHist').hidden) refreshCloud(); });
  }

  /* ---------- Messages, enregistrement de fichiers, lien ---------- */
  let toastT = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2400); }
  async function saveFile(data, filename) {
    try { // dans Claude : le viewer demande confirmation avant d'enregistrer
      if (window.claude && window.claude.use) { const d = await window.claude.use('downloads'); if (d) { await d.save({ filename, data }); return 'saved'; } }
    } catch (e) { if (e && e.code === 'declined') return 'declined'; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); return 'saved';
  }
  if ($('lk')) $('lk').onclick = () => {
    const q = new URLSearchParams({ c: st.code, L: st.L, W: st.W, H: st.H });
    S[st.code].params.forEach((k) => q.set(k, st[k]));
    copyText(location.href.split(/[?#]/)[0] + '?' + q, () => toast('Lien copié'));
  };

  /* ---------- Fiche PDF ---------- */
  function logoData() {
    try {
      const img = document.querySelector('.logo img.lg-l'); if (!img || !img.naturalWidth) return null;
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      return { url: c.toDataURL('image/png'), w: 46, h: 46 * img.naturalHeight / img.naturalWidth };
    } catch (e) { return null; }
  }
  const pf = (n, d) => fmt(n, d).replace(/[\u202F\u00A0]/g, ' '); // le PDF n'affiche pas les espaces insécables
  function buildPdf(e) { // e : un calcul de l'historique ; sans argument, le calcul en cours
    const E = e || curEntry(), t = S[E.c];
    const r = e ? t.build({ L: E.L, W: E.W, H: E.H, j: E.j, o: E.o, jeu: E.jeu, v: E.v == null ? DEF.v : E.v }) : cur;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const PW = 210, PH = 297, M = 14, ps = pieces(r), surf = ps.reduce((s, p) => s + p.laize * p.coupe * (p.qty || 1), 0) / 1e6;
    const INK = [29, 43, 51], TEAL = [15, 74, 99], ORANGE = [201, 79, 34], BLUE = [31, 95, 214], RED = [214, 47, 47], MUTED = [90, 107, 116], LINE = [213, 222, 227];
    let y = M;
    const logo = logoData();
    if (logo) doc.addImage(logo.url, 'PNG', M, y, logo.w, logo.h);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text('Fiche modèle FEFCO', PW - M, y + 4, { align: 'right' });
    doc.text(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), PW - M, y + 8, { align: 'right' });
    y += 19; doc.setDrawColor(...ORANGE); doc.setLineWidth(0.8); doc.line(M, y, PW - M, y);
    y += 13; doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.setTextColor(...TEAL); doc.text(E.c, M, y);
    y += 7; doc.setFontSize(13); doc.setTextColor(...INK); doc.text(t.title, M, y);
    y += 5.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`${t.serie}  |  Montage ${t.mode === 'M' ? 'manuel' : t.mode === 'A' ? 'automatique' : 'manuel ou automatique'}`, M, y);
    if (t.conf !== 'ok') {
      y += 4; doc.setFillColor(255, 244, 214); doc.setDrawColor(240, 210, 122); doc.setLineWidth(0.2); doc.rect(M, y, PW - 2 * M, 7.5, 'FD');
      doc.setTextColor(90, 67, 0); doc.setFontSize(8.5); doc.text('Géométrie à valider avec le PDF FEFCO avant toute production.', M + 3, y + 5); y += 7.5;
    }
    y += 9; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
    if (E.cl) { doc.text('Client : ' + E.cl.replace(/[^\u0020-\u00FF]/g, '?'), M, y); y += 6.5; }
    let dimTxt = `Dimensions intérieures (L × W × H) : ${pf(E.L, 0)} × ${pf(E.W, 0)} × ${pf(E.H, 0)} mm`;
    doc.text(dimTxt, M, y);
    const extra = [t.params.includes('j') ? `joint ${pf(E.j, 0)} mm` : '', t.params.includes('o') ? `recouvrement ${pf(E.o, 0)} mm` : '', t.params.includes('jeu') ? `jeu ${pf(E.jeu, 0)} mm` : '', t.params.includes('v') ? `rabat v ${pf(E.v == null ? DEF.v : E.v, 0)} mm` : ''].filter(Boolean).join('  |  ');
    if (extra) { y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(extra, M, y); }
    y += 6;
    const boxes = [['LAIZE (VERTICAL)', ps.map((p) => pf(p.laize)).join(' · ') + ' mm'], ['COUPE (HORIZONTAL)', ps.map((p) => pf(p.coupe)).join(' · ') + ' mm'], ['SURFACE', pf(surf, 3) + ' m²'], ['VOLUME UTILE', pf(E.L * E.W * E.H / 1e6, 1) + ' L']];
    const bw = (PW - 2 * M - 3 * 4) / 4;
    boxes.forEach((b, i) => {
      const x = M + i * (bw + 4);
      doc.setDrawColor(...(i === 2 ? ORANGE : LINE)); doc.setLineWidth(i === 2 ? 0.6 : 0.3); doc.roundedRect(x, y, bw, 17, 1.5, 1.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MUTED); doc.text(b[0], x + 3, y + 5.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...(i === 2 ? ORANGE : INK)); doc.text(b[1], x + 3, y + 13);
    });
    y += 17 + 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEAL); doc.text('PLAN À PLAT COTÉ', M, y); y += 3;

    // plan : mise à l'échelle dans la zone restante
    const fsm = Math.max(r.coupe, r.laize) / 52, hasH = !!r.bodyY, off = fsm * 2.6;
    const mL = hasH || ps.length > 1 ? fsm * 5 : fsm * 1.5, mR = fsm * 5, mT = fsm * 1.5, mB = fsm * 5;
    const mW = r.coupe + mL + mR, mH = r.laize + mT + mB;
    const aw = PW - 2 * M, ah = PH - M - 14 - y;
    const sc = Math.min(aw / mW, ah / mH);
    const ox = M + (aw - mW * sc) / 2 + mL * sc, oy = y + 4 + mT * sc;
    const X = (v) => ox + v * sc, Y = (v) => oy + v * sc;
    const fsMm = Math.max(2.1, Math.min(fsm * sc, 3.6)), fsPt = fsMm * 2.83465;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fsPt);
    const lab = (cx, cy, w, h, l) => {
      if (!l) return;
      const txt = l.txt || (l.v == null ? l.t : `${l.t} = ${pf(l.v)}`), rot = l.rot || h > w * 1.6, tw = doc.getTextWidth(txt);
      if ((rot ? h : w) * sc < tw * 1.15 || (rot ? w : h) * sc < fsMm * 1.4) return;
      doc.setTextColor(...INK);
      if (rot) doc.text(txt, X(cx) + fsMm * 0.35, Y(cy) + tw / 2, { angle: 90 }); else doc.text(txt, X(cx), Y(cy) + fsMm * 0.35, { align: 'center' });
    };
    doc.setLineWidth(0.3); doc.setDrawColor(...INK);
    r.rects.forEach((q) => {
      const l = q.label || {}, flap = q.fl != null ? q.fl : l.t && l.t !== 'L' && l.t !== 'W' && l.t !== 'H' && l.t !== 'L×W';
      doc.setFillColor(...(flap ? [250, 240, 234] : [234, 242, 246])); doc.rect(X(q.x), Y(q.y), q.w * sc, q.h * sc, 'FD'); lab(q.x + q.w / 2, q.y + q.h / 2, q.w, q.h, q.label);
    });
    r.polys.forEach((p) => {
      const pts = p.pts, seg = pts.slice(1).map((a, i) => [(a[0] - pts[i][0]) * sc, (a[1] - pts[i][1]) * sc]);
      doc.setFillColor(250, 240, 234); doc.lines(seg, X(pts[0][0]), Y(pts[0][1]), [1, 1], 'FD', true);
      const xs = pts.map((a) => a[0]), ys = pts.map((a) => a[1]);
      lab((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), p.label);
    });
    doc.setDrawColor(...RED); doc.setLineWidth(0.3); doc.setLineDashPattern([1.6, 1.2], 0);
    r.creases.forEach((c) => doc.line(X(c[0]), Y(c[1]), X(c[2]), Y(c[3])));
    doc.setLineDashPattern([], 0);
    // cotes bleues
    doc.setDrawColor(...BLUE); doc.setTextColor(...BLUE); doc.setLineWidth(0.3); doc.setFont('helvetica', 'bold');
    const tk = fsMm * 0.5, vdim = (xm, a, b, txt, side) => {
      doc.line(X(xm), Y(a), X(xm), Y(b)); doc.line(X(xm) - tk, Y(a), X(xm) + tk, Y(a)); doc.line(X(xm) - tk, Y(b), X(xm) + tk, Y(b));
      const tw = doc.getTextWidth(txt); doc.text(txt, X(xm) + side * fsMm * 1.15, Y((a + b) / 2) + tw / 2, { angle: 90 });
    };
    ps.forEach((p, i) => {
      const px = p.x, pr = p.x + p.coupe, by = p.laize + off, left = i < ps.length - 1;
      vdim(left ? px - off : pr + off, 0, p.laize, `LAIZE ${pf(p.laize)}`, left ? -1 : 1);
      doc.line(X(px), Y(by), X(pr), Y(by)); doc.line(X(px), Y(by) - tk, X(px), Y(by) + tk); doc.line(X(pr), Y(by) - tk, X(pr), Y(by) + tk);
      doc.text(`${p.n ? p.n.toUpperCase() + ' · ' : ''}COUPE ${pf(p.coupe)}`, X((px + pr) / 2), Y(by) + fsMm * 1.5, { align: 'center' });
    });
    if (hasH) vdim(-off - fsm * 0.8, r.bodyY[0], r.bodyY[1], `H = ${pf(r.bodyY[1] - r.bodyY[0])}`, -1);

    // pied de page
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, PH - M - 6, PW - M, PH - M - 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text('Plan reconstruit à partir des cotes et formules du code FEFCO (12e édition, 2022). Document indicatif : le PDF FEFCO reste la référence.', M, PH - M - 2);
    doc.text('Snotrac Studio', PW - M, PH - M - 2, { align: 'right' });
    return doc.output('blob');
  }
  async function exportPdf(e) {
    if (!window.jspdf) { toast('Export PDF indisponible : bibliothèque non chargée'); return; }
    const E = e || curEntry();
    try { const r = await saveFile(buildPdf(e), `FEFCO-${E.c}-${E.L}x${E.W}x${E.H}${E.cl ? '-' + E.cl.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) : ''}.pdf`); toast(r === 'declined' ? 'Export annulé' : 'Fiche PDF prête'); }
    catch (err) { toast('Export PDF impossible'); }
  }
  $('pdf').onclick = () => { scheduleLog(true); exportPdf(); };

  /* ---------- Démarrage ---------- */
  ['L', 'W', 'H', 'j', 'o', 'jeu', 'v'].forEach((k) => sync(k, st[k]));
  sync('client', st.client || '');
  buildLib('');
  if (window.FEFCO_3D) window.FEFCO_3D.setAuto($('auto').getAttribute('aria-pressed') === 'true');
  setView(st.view);
  refresh();
  ready = true;
  initCloud();
  if (location.hash === '#guide') page('guide'); else if (location.hash === '#library') page('lib'); else if (location.hash === '#history') page('hist'); else $('dock').style.setProperty('--i', 0);
})();
