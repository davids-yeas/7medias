// Bibliothèque FEFCO : chaque style renvoie un plan à plat en mm.
// Repère : x = sens de la coupe (horizontal), y = sens de la laize (vertical).
// conf: 'ok' = géométrie standard, 'verif' = à valider avec le PDF FEFCO.
(function (root) {
  const half = (v) => v / 2;

  // ---------- Caisses à rabats (série 0200) : 1 pièce, joint, 4 panneaux ----------
  // Chaque type de panneau (L ou W) a un rabat en haut et un en bas, décrits par un jeton.
  const TOK = {
    '0': () => 0, '½W': (d) => d.W / 2, '½L': (d) => d.L / 2, 'W': (d) => d.W, 'L': (d) => d.L,
    '½(W+o)': (d) => (d.W + d.o) / 2, 'v': (d) => d.v || 0, '½(L+o)': (d) => (d.L + d.o) / 2,
    'v+o': (d) => (d.v || 0) + d.o, 'L−v': (d) => d.L - (d.v || 0), 'W−v': (d) => d.W - (d.v || 0),
  };
  const dep = (tok, d) => TOK[tok](d);
  // spec.seq (facultatif) = suite de panneaux [largeur, rabat haut, rabat bas] pour les découpes hors L W L W.
  // spec.diag = plis en diagonale sur les rabats des panneaux W (rabats repliés en soufflet).
  function slotted(spec) {            // spec = { L: [haut, bas], W: [haut, bas] }
    const seqOf = () => spec.seq || ['L', 'W', 'L', 'W'].map((k) => [k, spec[k][0], spec[k][1]]);
    return function (d) {
      const { H } = d, j = spec.noJoint ? 0 : d.j, seq = seqOf();
      const top = Math.max(...seq.map((p) => dep(p[1], d)));
      const bot = Math.max(...seq.map((p) => dep(p[2], d)));
      const rects = [], creases = [], polys = [];
      const taper = Math.min(8, H / 4);
      if (j) polys.push({ pts: [[0, top + taper], [j, top], [j, top + H], [0, top + H - taper]],
        label: { t: 'j', v: j, rot: true } });
      let x = j;
      seq.forEach((p) => {
        const w = dep(p[0], d);
        rects.push({ x, y: top, w, h: H, fl: false, label: { t: p[0], v: w } });
        const dt = dep(p[1], d), db = dep(p[2], d);
        if (dt > 0) rects.push({ x, y: top - dt, w, h: dt, fl: true, label: { t: p[1], v: dt } });
        if (db > 0) rects.push({ x, y: top + H, w, h: db, fl: true, label: { t: p[2], v: db } });
        if (spec.diag && p[0] === 'W') {
          if (dt > 0) creases.push([x, top, x + w / 2, top - dt], [x + w, top, x + w / 2, top - dt]);
          if (db > 0) creases.push([x, top + H, x + w / 2, top + H + db], [x + w, top + H, x + w / 2, top + H + db]);
        }
        x += w;
      });
      const coupe = x, laize = top + H + bot;
      let xs = j;
      if (j) creases.push([j, top, j, top + H]);
      seq.forEach((p) => { xs += dep(p[0], d); creases.push([xs, top, xs, top + H]); });
      creases.push([j, top, coupe, top]);
      creases.push([j, top + H, coupe, top + H]);
      return { rects, polys, creases, coupe, laize, bodyY: [top, top + H] };
    };
  }
  const slot = (spec) => ({ fam: spec.seq ? null : 'slotted', spec, build: slotted(spec) });

  // ---------- Boîtes télescopiques et plateaux : fond L×W + parois H ----------
  // Un plateau ; corner = 'side' (coins tenus par les parois de gauche/droite),
  // 'end' (coins tenus par les parois haut/bas) ou null (croix sans coins).
  // sfx = '+' pour les cotes d'un couvercle.
  function tray(L, W, H, corner, sfx, ox) {
    const P = (t) => t + (sfx || '');
    const rects = [], creases = [], X = (v) => ox + v;
    rects.push({ x: X(H), y: H, w: L, h: W, fl: false, label: { t: P('L') + '×' + P('W'), v: null, txt: `${P('L')} × ${P('W')}` } });
    rects.push({ x: X(H), y: 0, w: L, h: H, fl: false, label: { t: P('H'), v: H } });
    rects.push({ x: X(H), y: H + W, w: L, h: H, fl: false, label: { t: P('H'), v: H } });
    rects.push({ x: X(0), y: H, w: H, h: W, fl: false, label: { t: P('H'), v: H, rot: true } });
    rects.push({ x: X(H + L), y: H, w: H, h: W, fl: false, label: { t: P('H'), v: H, rot: true } });
    if (corner) [[0, 0], [H + L, 0], [0, H + W], [H + L, H + W]].forEach((c) => rects.push({ x: X(c[0]), y: c[1], w: H, h: H, fl: true, label: null }));
    const wAll = L + 2 * H, hAll = W + 2 * H;
    if (corner === 'side') { creases.push([X(0), H, X(wAll), H], [X(0), H + W, X(wAll), H + W], [X(H), H, X(H), H + W], [X(H + L), H, X(H + L), H + W]); }
    else if (corner === 'end') { creases.push([X(H), 0, X(H), hAll], [X(H + L), 0, X(H + L), hAll], [X(H), H, X(H + L), H], [X(H), H + W, X(H + L), H + W]); }
    else creases.push([X(H), H, X(H + L), H], [X(H), H + W, X(H + L), H + W], [X(H), H, X(H), H + W], [X(H + L), H, X(H + L), H + W]);
    return { rects, creases, w: wAll, h: hAll };
  }
  // Fond + couvercle côte à côte ; le couvercle prend le jeu (« + ») sur L, W et H.
  function telescope(cBase, cLid) {
    return function (d) {
      const g = 0.12 * Math.max(d.L, d.W), J = d.jeu || 0;
      const a = tray(d.L, d.W, d.H, cBase, '', 0);
      const b = tray(d.L + J, d.W + J, d.H + J, cLid, '+', a.w + g);
      const pieces = [{ n: 'Fond', x: 0, coupe: a.w, laize: a.h }, { n: 'Couvercle', x: a.w + g, coupe: b.w, laize: b.h }];
      return { rects: a.rects.concat(b.rects), polys: [], creases: a.creases.concat(b.creases), coupe: a.w + g + b.w, laize: Math.max(a.h, b.h), bodyY: null, pieces };
    };
  }
  // Plateau croisé avec rabats de rive (0402) : paroi H puis rabat sur chaque côté.
  function cross2(d) {
    const { L, W, H } = d, fx = L / 2, fy = W / 2;
    const x0 = fx + H, y0 = fy + H, rects = [], creases = [];
    rects.push({ x: x0, y: y0, w: L, h: W, fl: false, label: { t: 'L×W', v: null, txt: `${'L'} × ${'W'}` } });
    rects.push({ x: x0, y: y0 - H, w: L, h: H, fl: false, label: { t: 'H', v: H } });
    rects.push({ x: x0, y: y0 + W, w: L, h: H, fl: false, label: { t: 'H', v: H } });
    rects.push({ x: x0 - H, y: y0, w: H, h: W, fl: false, label: { t: 'H', v: H, rot: true } });
    rects.push({ x: x0 + L, y: y0, w: H, h: W, fl: false, label: { t: 'H', v: H, rot: true } });
    rects.push({ x: x0, y: 0, w: L, h: fy, label: { t: '½W', v: fy } });
    rects.push({ x: x0, y: y0 + W + H, w: L, h: fy, label: { t: '½W', v: fy } });
    rects.push({ x: 0, y: y0, w: fx, h: W, label: { t: '½L', v: fx, rot: true } });
    rects.push({ x: x0 + L + H, y: y0, w: fx, h: W, label: { t: '½L', v: fx, rot: true } });
    creases.push([x0, y0, x0 + L, y0], [x0, y0 + W, x0 + L, y0 + W], [x0, y0, x0, y0 + W], [x0 + L, y0, x0 + L, y0 + W],
      [x0, y0 - H, x0 + L, y0 - H], [x0, y0 + W + H, x0 + L, y0 + W + H], [x0 - H, y0, x0 - H, y0 + W], [x0 + L + H, y0, x0 + L + H, y0 + W]);
    return { rects, polys: [], creases, coupe: L + 2 * H + L, laize: W + 2 * H + W, bodyY: null };
  }

  const STYLES = {
    '0200': Object.assign(slot({ L: ['0', '½W'], W: ['0', '½W'] }), { title: 'Caisse à rabats inférieurs', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Fourreau avec rabats de ½W en bas seulement ; le haut reste ouvert.', params: ['j'] }),
    '0201': Object.assign(slot({ L: ['½W', '½W'], W: ['½W', '½W'] }), { title: 'Caisse américaine (RSC)', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Le carton standard. Rabats de ½W sur les 4 panneaux : ils se rejoignent au milieu.', params: ['j'] }),
    '0202': Object.assign(slot({ L: ['½(W+o)', '½(W+o)'], W: ['½(W+o)', '½(W+o)'] }), { title: 'Caisse à rabats recouvrants', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats de ½(W+o) : ils se chevauchent d’une longueur o.', params: ['j', 'o'] }),
    '0203': Object.assign(slot({ L: ['W', 'W'], W: ['W', 'W'] }), { title: 'Caisse à recouvrement total', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats de profondeur W sur les 4 panneaux : le recouvrement est complet.', params: ['j'] }),
    '0204': Object.assign(slot({ L: ['½W', '½W'], W: ['½L', '½L'] }), { title: 'Caisse à rabats ½W et ½L', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats de ½W sur les panneaux L et de ½L sur les panneaux W.', params: ['j'] }),
    '0205': Object.assign(slot({ L: ['½L', '½L'], W: ['½L', '½L'] }), { title: 'Caisse à rabats de ½L', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats de ½L sur les 4 panneaux.', params: ['j'] }),
    '0206': Object.assign(slot({ L: ['W', 'W'], W: ['½L', '½L'] }), { title: 'Caisse à rabats W et ½L', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats de profondeur W sur les panneaux L et de ½L sur les panneaux W.', params: ['j'] }),
    '0209': Object.assign(slot({ L: ['v', '½W'], W: ['v', '½W'] }), { title: 'Caisse à rabats supérieurs courts', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats courts de profondeur v en haut (ouverture centrale) et rabats de ½W en bas.', params: ['j', 'v'] }),
    '0214': Object.assign(slot({ L: ['v', '½W'], W: ['v', '½W'] }), { title: 'Caisse à rabats supérieurs courts, double rainage', serie: '0200 · Caisses à rabats', mode: 'M', conf: 'ok',
      desc: 'Comme 0209 : rabats v en haut, ½W en bas. Le double rainage des rabats supérieurs n’est pas dessiné.', params: ['j', 'v'] }),
    '0226': Object.assign(slot({ L: ['½W', '½W'], W: ['½W', '½W'], diag: true }), { title: 'Caisse à rabats en soufflet', serie: '0200 · Caisses à rabats', mode: 'M', conf: 'ok',
      desc: 'Rabats de ½W reliés entre eux, avec plis en diagonale sur les panneaux W : la caisse se ferme sans fente aux angles. Contour simplifié.', params: ['j'] }),
    '0228': Object.assign(slot({ seq: [['W', '0', '0'], ['½(L+o)', '½W', '½W'], ['W', '½W', '½W'], ['L', '½W', '½W'], ['W', '½W', '½W'], ['½(L+o)', '½W', '½W']] }),
      { title: 'Caisse à paroi L en deux moitiés', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Une paroi L est formée de deux moitiés ½(L+o) qui se recouvrent ; un panneau W sans rabats sert de renfort collé. Vue 3D non disponible.', params: ['j', 'o'] }),
    '0230': Object.assign(slot({ noJoint: true, seq: [['v+o', '½W', '½W'], ['W', '½W', '½W'], ['L', '½W', '½W'], ['W', '½W', '½W'], ['L−v', '½W', '½W']] }),
      { title: 'Caisse américaine à joint décalé sur L', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Pas de patte de collage : un panneau v+o vient recouvrir le panneau L−v, la jonction tombe sur la paroi L. Vue 3D non disponible.', params: ['o', 'v'] }),
    '0231': Object.assign(slot({ noJoint: true, seq: [['v+o', '½W', '½W'], ['L', '½W', '½W'], ['W', '½W', '½W'], ['L', '½W', '½W'], ['W−v', '½W', '½W']] }),
      { title: 'Caisse américaine à joint décalé sur W', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Pas de patte de collage : un panneau v+o vient recouvrir le panneau W−v, la jonction tombe sur la paroi W. Vue 3D non disponible.', params: ['o', 'v'] }),
    '0300': { title: 'Boîte télescopique, fond et couvercle', serie: '0300 · Boîtes télescopiques', mode: 'M/A', conf: 'ok',
      desc: 'Deux pièces : un fond et un couvercle (cotes « + », avec le jeu). Les coins sont tenus par les parois latérales.',
      params: ['jeu'], build: telescope('side', 'side'), fam: 'cross' },
    '0301': { title: 'Boîte télescopique, couvercle à coins en bout', serie: '0300 · Boîtes télescopiques', mode: 'M/A', conf: 'ok',
      desc: 'Comme 0300, mais les coins du couvercle sont tenus par les parois de bout.',
      params: ['jeu'], build: telescope('side', 'end'), fam: 'cross' },
    '0302': { title: 'Boîte télescopique sans coins', serie: '0300 · Boîtes télescopiques', mode: 'M', conf: 'ok',
      desc: 'Fond et couvercle en croix, sans rabats de coin : les parois sont assemblées par agrafage ou bande.',
      params: ['jeu'], build: telescope(null, null), fam: 'cross' },
    '0402': { title: 'Plateau à rabats de rive', serie: '0400 · Boîtes et plateaux', mode: 'M', conf: 'ok',
      desc: 'Plateau en croix : 4 parois H, prolongées par des rabats de ½L et ½W qui se rabattent à l’intérieur.',
      params: [], build: cross2 },
  };

  // Données de pliage 3D : profondeur de rabat (haut / bas) par type de panneau.
  Object.keys(STYLES).forEach((c) => { const t = STYLES[c]; if (t.spec && !t.spec.seq) t.flap = (k, d, side) => dep(t.spec[k][side === 'b' ? 1 : 0], d); });
  const fam = (c, f) => { STYLES[c].fam = f; };

  root.FEFCO_STYLES = STYLES;
  if (typeof module !== 'undefined') module.exports = STYLES;
})(typeof window !== 'undefined' ? window : globalThis);
