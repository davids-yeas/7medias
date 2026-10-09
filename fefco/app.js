(function () {
  const S = window.FEFCO_STYLES, $ = (id) => document.getElementById(id);
  const codes = Object.keys(S);
  const DEF = { code: '0201', L: 400, W: 300, H: 250, j: 35, o: 40, jeu: 0, qty: 1000, view: 'plan' };
  const st = Object.assign({}, DEF);
  try { Object.assign(st, JSON.parse(localStorage.getItem('dieline') || '{}')); } catch (e) {}
  if (!S[st.code]) st.code = DEF.code;
  const save = () => { try { localStorage.setItem('dieline', JSON.stringify(st)); } catch (e) {} };
  const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('fr-FR', { maximumFractionDigits: d });
  const num = (v) => Math.max(0, parseFloat(v) || 0);
  const dims = () => ({ L: st.L, W: st.W, H: st.H, j: st.j, o: st.o, jeu: st.jeu });
  let cur = null;                       // dernier résultat de calcul
  const view = { z: 1, px: 0, py: 0 };  // zoom / déplacement du plan

  /* ---------- Bibliothèque visuelle ---------- */
  const thumb = (code) => {
    const r = S[code].build({ L: 400, W: 300, H: 250, j: 35, o: 40, jeu: 0 });
    const p = 30, m = Math.max(r.coupe, r.laize) * 0.04;
    let s = '';
    r.rects.forEach((q) => { s += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`; });
    r.polys.forEach((q) => { s += `<polygon points="${q.pts.map((a) => a.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`; });
    return `<svg viewBox="${-m} ${-m} ${r.coupe + 2 * m} ${r.laize + 2 * m}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s}</svg>`;
  };
  function buildLib(filter) {
    const f = (filter || '').trim().toLowerCase();
    let html = '', last = '';
    codes.forEach((c) => {
      const t = S[c];
      if (f && !(c + ' ' + t.title + ' ' + t.serie).toLowerCase().includes(f)) return;
      if (t.serie !== last) { html += `<div class="grp">${t.serie}</div>`; last = t.serie; }
      html += `<button type="button" class="item${c === st.code ? ' on' : ''}" data-c="${c}">${thumb(c)}<div><b>${c}</b>${t.conf !== 'ok' ? '<i class="tag">à valider</i>' : ''}<span>${t.title}</span></div></button>`;
    });
    $('libList').innerHTML = html || '<p class="note" style="padding:8px">Aucun code trouvé. Essaie 0201 ou « plateau ».</p>';
  }

  /* ---------- Calcul + mise à jour ---------- */
  function compute() {
    cur = S[st.code].build(dims());
    const surf = cur.laize * cur.coupe / 1e6;
    $('laize').textContent = fmt(cur.laize);
    $('coupe').textContent = fmt(cur.coupe);
    $('surf').textContent = fmt(surf, 3);
    $('vol').textContent = fmt(st.L * st.W * st.H / 1e6, 1);
    $('qtyLbl').textContent = '×' + fmt(st.qty, 0);
    $('tot').textContent = fmt(surf * st.qty, 1);
    $('idCode').textContent = st.code;
    $('idTitle').textContent = S[st.code].title;
    $('idWarn').hidden = S[st.code].conf === 'ok';
    document.querySelectorAll('[data-p]').forEach((l) => { l.style.display = S[st.code].params.includes(l.dataset.p) ? '' : 'none'; });
    return surf;
  }
  function refresh(opts = {}) {
    if (!st.L || !st.W || !st.H) return;
    compute(); drawPlan();
    if (st.view !== 'plan' && window.FEFCO_3D) window.FEFCO_3D.update(st.code, dims());
    if (opts.lib) buildLib($('q').value);
    save();
  }

  /* ---------- Plan 2D ---------- */
  const NAMES = { L: 'Grand panneau L', W: 'Petit panneau W', j: 'Joint collé', H: 'Paroi H', 'L×W': 'Fond' };
  function drawPlan() {
    const r = cur, m = Math.max(r.coupe, r.laize), fs = m / 52, pad = fs * 5.5, off = fs * 2.6;
    const hasH = !!r.bodyY;
    const x0 = -pad - (hasH ? fs * 3 : 0), y0 = -pad, w = r.coupe + 2 * pad + off + (hasH ? fs * 3 : 0) + fs * 2, h = r.laize + 2 * pad + off + fs * 2;
    view.base = { x: x0, y: y0, w, h }; applyView();
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
      const l = q.label || {}, isFlap = l.t && l.t !== 'L' && l.t !== 'W' && l.t !== 'H' && l.t !== 'L×W';
      const name = NAMES[l.t] || (isFlap ? 'Rabat ' + l.t : 'Panneau');
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
    const tk = fs * 0.6, bx = r.coupe + off, by = r.laize + off;
    const dimV = (x, a, b, t, cls, rot) => `<line class="dm ${cls}" x1="${x}" y1="${a}" x2="${x}" y2="${b}"/><line class="dm ${cls}" x1="${x - tk}" y1="${a}" x2="${x + tk}" y2="${a}"/><line class="dm ${cls}" x1="${x - tk}" y1="${b}" x2="${x + tk}" y2="${b}"/>` + T(x + (rot === 1 ? fs * 1.3 : -fs * 1.3), (a + b) / 2, t, 'dt', { rot: 1 });
    s += dimV(bx, 0, r.laize, `LAIZE ${fmt(r.laize)}`, 'laize', 1);
    s += `<line class="dm coupe" x1="0" y1="${by}" x2="${r.coupe}" y2="${by}"/><line class="dm coupe" x1="0" y1="${by - tk}" x2="0" y2="${by + tk}"/><line class="dm coupe" x1="${r.coupe}" y1="${by - tk}" x2="${r.coupe}" y2="${by + tk}"/>` + T(r.coupe / 2, by + fs * 1.4, `COUPE ${fmt(r.coupe)}`, 'dt');
    if (hasH) s += dimV(-off - fs * 0.8, r.bodyY[0], r.bodyY[1], `H = ${fmt(r.bodyY[1] - r.bodyY[0])}`, 'hh', 2);
    $('svg').innerHTML = s;
    $('svg').dataset.fs = fs;
  }
  function applyView() {
    const b = view.base; if (!b) return;
    const w = b.w / view.z, h = b.h / view.z;
    const x = b.x + (b.w - w) / 2 - view.px * b.w, y = b.y + (b.h - h) / 2 - view.py * b.h;
    $('svg').setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }
  const svg = $('svg');
  svg.addEventListener('wheel', (e) => { e.preventDefault(); view.z = Math.max(0.5, Math.min(12, view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); applyView(); }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); svg.classList.add('drag'); });
  svg.addEventListener('pointermove', (e) => {
    if (drag) {
      const r = svg.getBoundingClientRect(), b = view.base, sc = Math.max(b.w / view.z / r.width, b.h / view.z / r.height);
      view.px += (e.clientX - drag.x) * sc / b.w; view.py += (e.clientY - drag.y) * sc / b.h; drag = { x: e.clientX, y: e.clientY }; applyView();
    }
  });
  svg.addEventListener('pointerup', () => { drag = null; svg.classList.remove('drag'); });
  svg.addEventListener('dblclick', resetView);
  function resetView() { view.z = 1; view.px = 0; view.py = 0; applyView(); }
  $('reset').onclick = resetView;
  const ro = $('readout'), roDef = ro.textContent;
  svg.addEventListener('mouseover', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i) { ro.textContent = i; ro.classList.add('live'); } });
  svg.addEventListener('mouseout', (e) => { if (e.target.dataset && e.target.dataset.i) { ro.textContent = roDef; ro.classList.remove('live'); } });
  [['mLaize', 'hl-laize'], ['mCoupe', 'hl-coupe']].forEach(([id, cl]) => {
    $(id).addEventListener('mouseenter', () => svg.classList.add(cl));
    $(id).addEventListener('mouseleave', () => svg.classList.remove(cl));
  });

  /* ---------- Saisie ---------- */
  const sync = (k, v) => { st[k] = v; if ($(k)) $(k).value = v; };
  ['L', 'W', 'H'].forEach((k) => {
    $(k).addEventListener('input', (e) => { st[k] = num(e.target.value); refresh(); });
  });
  ['j', 'o', 'jeu', 'qty'].forEach((k) => $(k).addEventListener('input', (e) => { st[k] = num(e.target.value); refresh(); }));
  $('libList').addEventListener('click', (e) => {
    const b = e.target.closest('.item'); if (!b) return;
    st.code = b.dataset.c; resetView(); refresh({ lib: true });
  });
  $('q').addEventListener('input', () => buildLib($('q').value));

  /* ---------- Affichage Plan / 3D / Les deux ---------- */
  function setView(v) {
    st.view = v;
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    $('panePlan').hidden = v === '3d'; $('pane3d').hidden = v === 'plan';
    $('stage').classList.toggle('both', v === 'both');
    if (v !== 'plan' && window.FEFCO_3D) { window.FEFCO_3D.update(st.code, dims()); if (!userPaused && !playing) setPlay(true); }
    save();
  }
  document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => setView(b.dataset.v)));

  /* ---------- Lecture du pliage : boucle automatique, le curseur reprend la main ---------- */
  const fold = $('fold'), play = $('play');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = false, userPaused = reduce, dir = 1, hold = 0, last = 0, raf = null;
  function tick(t) {
    if (!playing) return;
    const dt = last ? Math.min(t - last, 60) : 0; last = t;
    if (hold > 0) hold -= dt;
    else if (!$('pane3d').hidden) {
      let v = +fold.value / 100 + dir * dt / 3400;
      if (v >= 1) { v = 1; dir = -1; hold = 1400; } else if (v <= 0) { v = 0; dir = 1; hold = 900; }
      fold.value = v * 100; fold.dispatchEvent(new Event('input'));
    }
    raf = requestAnimationFrame(tick);
  }
  function setPlay(on) {
    playing = on; last = 0; if (raf) cancelAnimationFrame(raf); raf = null;
    play.textContent = on ? '❚❚ Pause' : '▶ Lecture';
    if (on) raf = requestAnimationFrame(tick);
  }
  play.onclick = () => { userPaused = playing; setPlay(!playing); };
  fold.addEventListener('pointerdown', () => { userPaused = true; setPlay(false); });
  fold.addEventListener('keydown', () => { userPaused = true; setPlay(false); });
  $('auto').onchange = (e) => window.FEFCO_3D && window.FEFCO_3D.setAuto(e.target.checked);

  /* ---------- Récapitulatif, thème, export ---------- */
  $('copy').onclick = () => {
    const s = cur.laize * cur.coupe / 1e6;
    const txt = `FEFCO ${st.code} – ${S[st.code].title}\nDimensions int. : ${fmt(st.L, 0)} × ${fmt(st.W, 0)} × ${fmt(st.H, 0)} mm\nLaize : ${fmt(cur.laize)} mm\nCoupe : ${fmt(cur.coupe)} mm\nSurface : ${fmt(s, 3)} m²\nQuantité : ${fmt(st.qty, 0)} → ${fmt(s * st.qty, 1)} m²`;
    const done = () => { $('copy').textContent = 'Copié ✓'; setTimeout(() => ($('copy').textContent = 'Copier le récapitulatif'), 1600); };
    const fallback = () => { const a = document.createElement('textarea'); a.value = txt; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) {} a.remove(); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
  };
  $('theme').onclick = () => {
    const root = document.documentElement, dark = getComputedStyle(root).colorScheme.includes('dark');
    root.dataset.theme = dark ? 'light' : 'dark';
  };
  if ($('dl')) $('dl').onclick = () => {
    const c = $('svg').cloneNode(true);
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const css = 'rect,polygon{fill:none;stroke:#111;stroke-width:1.5}.cr{stroke:#d62f2f;stroke-dasharray:6 4}.dm{stroke:#1f5fd6}.dt{fill:#1f5fd6;font-family:monospace}.tx{fill:#111;font-family:monospace}';
    c.insertAdjacentHTML('afterbegin', `<style>${css}</style>`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([c.outerHTML], { type: 'image/svg+xml' }));
    a.download = `FEFCO-${st.code}-${st.L}x${st.W}x${st.H}.svg`; a.click();
  };

  /* ---------- Menu : Outil / Guide ---------- */
  function miniPlan() {
    const r = S['0201'].build({ L: 400, W: 300, H: 250, j: 35, o: 40, jeu: 0 });
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
  function page(p, scrollTo) {
    const g = p === 'guide';
    $('viewTool').hidden = g; $('viewGuide').hidden = !g;
    document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.page === p));
    try { history.replaceState(null, '', g ? '#guide' : location.pathname + location.search); } catch (e) {}
    if (g) { if (!$('miniPlan').firstChild) miniPlan(); window.scrollTo(0, 0); if (scrollTo) $(scrollTo).scrollIntoView(); }
    else if (st.view !== 'plan' && window.FEFCO_3D) window.FEFCO_3D.show();
  }
  document.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => page(b.dataset.page)));
  document.querySelectorAll('.toc [data-s]').forEach((b) => b.addEventListener('click', () => $(b.dataset.s).scrollIntoView({ behavior: 'smooth' })));
  $('tryEx').onclick = () => { ['L', 'W', 'H'].forEach((k, i) => sync(k, [400, 300, 250][i])); st.code = '0201'; refresh({ lib: true }); page('tool'); };

  /* ---------- Démarrage ---------- */
  ['L', 'W', 'H', 'j', 'o', 'jeu', 'qty'].forEach((k) => sync(k, st[k]));
  $('nCodes').textContent = codes.length;
  buildLib('');
  if (window.FEFCO_3D) window.FEFCO_3D.setAuto($('auto').checked);
  setView(st.view);
  refresh();
  if (location.hash === '#guide') page('guide');
})();
