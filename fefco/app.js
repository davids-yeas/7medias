(function () {
  const S = window.FEFCO_STYLES, $ = (id) => document.getElementById(id);
  const sel = $('code');
  Object.keys(S).forEach((c) => {
    const o = document.createElement('option');
    o.value = c; o.textContent = `${c} ${S[c].mode} – ${S[c].title}`; sel.appendChild(o);
  });
  sel.value = '0201';
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
  const val = (id) => Math.max(0, parseFloat($(id).value) || 0);

  function render() {
    const st = S[sel.value];
    $('desc').textContent = st.desc;
    $('warn').hidden = st.conf === 'ok';
    document.querySelectorAll('[data-p]').forEach((l) => { l.style.display = st.params.includes(l.dataset.p) ? '' : 'none'; });
    const d = { L: val('L'), W: val('W'), H: val('H'), j: val('j'), o: val('o'), jeu: val('jeu') };
    if (!d.L || !d.W || !d.H) return;
    const r = st.build(d);
    $('laize').textContent = fmt(r.laize) + ' mm';
    $('coupe').textContent = fmt(r.coupe) + ' mm';
    $('surf').textContent = (r.laize * r.coupe / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 3 }) + ' m²';
    draw(r, st);
    if (!$('pane3d').hidden && window.FEFCO_3D) window.FEFCO_3D.update(sel.value, d);
  }

  function draw(r, st) {
    const m = Math.max(r.coupe, r.laize), fs = m / 48, pad = fs * 4, off = fs * 2.5;
    const W = r.coupe + pad * 2 + off, H = r.laize + pad * 2 + off + fs * 2;
    const X = (x) => x + pad, Y = (y) => y + pad;
    let s = `<rect width="${W}" height="${H}" fill="#fff"/>`;
    const txt = (x, y, t, o = {}) => `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="${o.c || '#222'}" font-weight="${o.b ? 700 : 400}"${o.rot ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${t}</text>`;
    const label = (cx, cy, w, h, l) => {
      if (!l) return '';
      const t = l.txt || (l.v == null ? l.t : `${l.t} = ${fmt(l.v)}`);
      const rot = l.rot || (h > w * 1.6);
      if ((rot ? h : w) < t.length * fs * 0.62 && w * h > 0) { if ((rot ? w : h) < fs) return ''; }
      return txt(cx, cy, t, { rot });
    };
    r.rects.forEach((q) => {
      s += `<rect x="${X(q.x)}" y="${Y(q.y)}" width="${q.w}" height="${q.h}" fill="none" stroke="#111" stroke-width="${fs / 12}"/>`;
      s += label(X(q.x + q.w / 2), Y(q.y + q.h / 2), q.w, q.h, q.label);
    });
    r.polys.forEach((p) => {
      s += `<polygon points="${p.pts.map((a) => X(a[0]) + ',' + Y(a[1])).join(' ')}" fill="none" stroke="#111" stroke-width="${fs / 12}"/>`;
      const xs = p.pts.map((a) => a[0]), ys = p.pts.map((a) => a[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      s += label(X(cx), Y(cy), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), p.label);
    });
    r.creases.forEach((c) => {
      s += `<line x1="${X(c[0])}" y1="${Y(c[1])}" x2="${X(c[2])}" y2="${Y(c[3])}" stroke="#e02424" stroke-width="${fs / 10}" stroke-dasharray="${fs / 1.5} ${fs / 3}"/>`;
    });
    // Cotes bleues : laize (verticale) et coupe (horizontale)
    const bx = X(r.coupe) + off, by = Y(r.laize) + off;
    const bl = '#1f5fd6', tick = fs / 2;
    s += `<line x1="${bx}" y1="${Y(0)}" x2="${bx}" y2="${Y(r.laize)}" stroke="${bl}" stroke-width="${fs / 8}"/>`;
    s += `<line x1="${bx - tick}" y1="${Y(0)}" x2="${bx + tick}" y2="${Y(0)}" stroke="${bl}" stroke-width="${fs / 8}"/><line x1="${bx - tick}" y1="${Y(r.laize)}" x2="${bx + tick}" y2="${Y(r.laize)}" stroke="${bl}" stroke-width="${fs / 8}"/>`;
    s += txt(bx + fs * 1.2, Y(r.laize / 2), `Laize ${fmt(r.laize)}`, { c: bl, b: 1, rot: 1 });
    s += `<line x1="${X(0)}" y1="${by}" x2="${X(r.coupe)}" y2="${by}" stroke="${bl}" stroke-width="${fs / 8}"/>`;
    s += `<line x1="${X(0)}" y1="${by - tick}" x2="${X(0)}" y2="${by + tick}" stroke="${bl}" stroke-width="${fs / 8}"/><line x1="${X(r.coupe)}" y1="${by - tick}" x2="${X(r.coupe)}" y2="${by + tick}" stroke="${bl}" stroke-width="${fs / 8}"/>`;
    s += txt(X(r.coupe / 2), by + fs * 1.2, `Coupe ${fmt(r.coupe)}`, { c: bl, b: 1 });
    if (r.bodyY) {
      const hx = X(0) - off, a = Y(r.bodyY[0]), b2 = Y(r.bodyY[1]);
      s += `<line x1="${hx}" y1="${a}" x2="${hx}" y2="${b2}" stroke="${bl}" stroke-width="${fs / 8}"/><line x1="${hx - tick}" y1="${a}" x2="${hx + tick}" y2="${a}" stroke="${bl}" stroke-width="${fs / 8}"/><line x1="${hx - tick}" y1="${b2}" x2="${hx + tick}" y2="${b2}" stroke="${bl}" stroke-width="${fs / 8}"/>`;
      s += txt(hx - fs * 1.2, (a + b2) / 2, `H = ${fmt(r.bodyY[1] - r.bodyY[0])}`, { c: bl, rot: 1 });
    }
    const svg = $('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
  }

  $('dl').onclick = () => {
    const svg = $('svg').cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const b = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `FEFCO-${sel.value}-${val('L')}x${val('W')}x${val('H')}.svg`;
    a.click();
  };
  function tab(is3d) {
    $('svg').hidden = is3d; $('pane3d').hidden = !is3d;
    $('tab2d').classList.toggle('on', !is3d); $('tab3d').classList.toggle('on', is3d);
    if (is3d) render();
  }
  $('tab2d').onclick = () => tab(false);
  $('tab3d').onclick = () => tab(true);
  document.querySelectorAll('input,select').forEach((e) => e.addEventListener('input', render));
  render();
})();
