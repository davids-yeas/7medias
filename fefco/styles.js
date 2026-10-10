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
    'v+o': (d) => (d.v || 0) + d.o, 'L−v': (d) => d.L - (d.v || 0), 'W−v': (d) => d.W - (d.v || 0), 'H': (d) => d.H,
    'L+': (d) => d.L + (d.jeu || 0), 'W+': (d) => d.W + (d.jeu || 0), 'H+': (d) => d.H + (d.jeu || 0),
    '½L+': (d) => (d.L + (d.jeu || 0)) / 2, '½W+': (d) => (d.W + (d.jeu || 0)) / 2,
  };
  // Jeton connu, sinon petite expression écrite sur le dessin (« H+v », « 2H », « ½(L+o) », « W+ »…).
  const expr = {};
  function dep(tok, d) {
    if (TOK[tok]) return TOK[tok](d);
    if (!expr[tok]) {
      let e = String(tok).replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/×/g, '*');
      e = e.replace(/([LWH])\+(?![LWHvo(½\d])/g, '$1p');          // L+ W+ H+ = cotes avec le jeu
      e = e.replace(/½/g, '0.5*').replace(/¼/g, '0.25*').replace(/(\d)(?=[LWHvo(])/g, '$1*');
      if (!/^[LWHpvo0-9.+\-*/()]*$/.test(e)) throw new Error('Cote inconnue : ' + tok);
      expr[tok] = new Function('L', 'W', 'H', 'Lp', 'Wp', 'Hp', 'v', 'o', 'return ' + e.replace(/([LWH])p/g, '$1p') + ';');
    }
    const J = d.jeu || 0;
    return expr[tok](d.L, d.W, d.H, d.L + J, d.W + J, d.H + J, d.v || 0, d.o || 0);
  }
  // spec.seq (facultatif) = suite de panneaux [largeur, rabat haut, rabat bas] pour les découpes hors L W L W.
  // spec.diag = plis en diagonale sur les rabats des panneaux W (rabats repliés en soufflet).
  function slotted(spec) {            // spec = { L: [haut, bas], W: [haut, bas] }
    const seqOf = () => spec.seq || ['L', 'W', 'L', 'W'].map((k) => [k, spec[k][0], spec[k][1]]);
    return function (d) {
      const H = spec.bodyH ? dep(spec.bodyH, d) : d.H, j = spec.noJoint ? 0 : d.j, seq = seqOf();
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
  // corner = 'side' (coins tenus par les parois gauche/droite), 'end' (par les parois haut/bas),
  // 'gusset' (pas de fente : coins pliés en soufflet, pli en diagonale) ou null (croix sans coins).
  // diag = plis à 45° dans les parois haut/bas (coins repliés à l'intérieur, 0303/0304).
  // sfx = '+' pour les cotes d'un couvercle ; hT = libellé de la hauteur des parois.
  function tray(L, W, H, o) {
    const sfx = o.sfx || '', P = (t) => t + sfx, hT = o.hT || P('H');
    const rects = [], creases = [], corner = o.corner;
    rects.push({ x: H, y: H, w: L, h: W, fl: false, label: { t: P('L') + '×' + P('W'), v: null, txt: `${P('L')} × ${P('W')}` } });
    rects.push({ x: H, y: 0, w: L, h: H, fl: false, label: { t: hT, v: H } });
    rects.push({ x: H, y: H + W, w: L, h: H, fl: false, label: { t: hT, v: H } });
    rects.push({ x: 0, y: H, w: H, h: W, fl: false, label: { t: hT, v: H, rot: true } });
    rects.push({ x: H + L, y: H, w: H, h: W, fl: false, label: { t: hT, v: H, rot: true } });
    if (corner) [[0, 0], [H + L, 0], [0, H + W], [H + L, H + W]].forEach((c) => rects.push({ x: c[0], y: c[1], w: H, h: H, fl: true, label: null }));
    const wAll = L + 2 * H, hAll = W + 2 * H;
    if (corner === 'side') creases.push([0, H, wAll, H], [0, H + W, wAll, H + W], [H, H, H, H + W], [H + L, H, H + L, H + W]);
    else if (corner === 'end') creases.push([H, 0, H, hAll], [H + L, 0, H + L, hAll], [H, H, H + L, H], [H, H + W, H + L, H + W]);
    else if (corner === 'gusset') {
      creases.push([0, H, wAll, H], [0, H + W, wAll, H + W], [H, 0, H, hAll], [H + L, 0, H + L, hAll]);
      creases.push([0, 0, H, H], [wAll, 0, H + L, H], [0, hAll, H, H + W], [wAll, hAll, H + L, H + W]);
    } else creases.push([H, H, H + L, H], [H, H + W, H + L, H + W], [H, H, H, H + W], [H + L, H, H + L, H + W]);
    if (o.cdiag) creases.push([0, 0, H, H], [wAll, 0, H + L, H], [0, hAll, H, H + W], [wAll, hAll, H + L, H + W]);
    if (o.diag) creases.push([H, H, 2 * H, 0], [H + L, H, L, 0], [H, H + W, 2 * H, hAll], [H + L, H + W, L, hAll]);
    return { rects, polys: [], creases, coupe: wAll, laize: hAll };
  }
  const base = (o) => (d) => tray(d.L, d.W, d.H, o || {});
  const lid = (o) => (d) => { const J = d.jeu || 0, lh = o && o.low ? (d.v || 0) : d.H + J;
    return tray(d.L + J, d.W + J, lh, Object.assign({ sfx: '+', hT: o && o.low ? 'v' : 'H+' }, o || {})); };
  // Plusieurs pièces posées côte à côte ; chaque pièce garde sa laize et sa coupe.
  function compose(list) {
    return function (d) {
      const g = 0.12 * Math.max(d.L, d.W), out = { rects: [], polys: [], creases: [], bodyY: null, pieces: [] };
      let x = 0, hMax = 0;
      list.forEach((it) => {
        const r = it.build(d), mv = (p) => [p[0] + x, p[1]];
        r.rects.forEach((q) => out.rects.push(Object.assign({}, q, { x: q.x + x })));
        r.polys.forEach((q) => out.polys.push(Object.assign({}, q, { pts: q.pts.map(mv) })));
        r.creases.forEach((c) => out.creases.push([c[0] + x, c[1], c[2] + x, c[3]]));
        out.pieces.push({ n: it.n + (it.qty > 1 ? ' ×' + it.qty : ''), qty: it.qty || 1, x, coupe: r.coupe, laize: r.laize });
        hMax = Math.max(hMax, r.laize); x += r.coupe + g;
      });
      out.coupe = x - g; out.laize = hMax;
      return out;
    };
  }
  const telescope = (cBase, cLid) => compose([{ n: 'Fond', build: base({ corner: cBase }) }, { n: 'Couvercle', build: lid({ corner: cLid }) }]);

  // Bande : une suite de panneaux de même hauteur, séparés par des plis verticaux (0404).
  const band = (cols, hTok) => (d) => {
    const h = dep(hTok, d), rects = [], creases = []; let x = 0;
    cols.forEach((t, i) => { const w = dep(t, d); if (i) creases.push([x, 0, x, h]);
      rects.push({ x, y: 0, w, h, fl: false, label: { t, v: w, rot: w < h * 0.35 } }); x += w; });
    return { rects, polys: [], creases, coupe: x, laize: h };
  };
  // Croix générique : fond central, et sur chaque côté une suite de bandes (de l'intérieur vers l'extérieur).
  // o.centre = 'L×W' (L horizontal) ou 'W×L' ; o.lr / o.tb = côtés symétriques, ou o.left/right/top/bottom.
  const crossX = (o) => (d) => {
    const rot = o.centre === 'W×L', cw = rot ? d.W : d.L, ch = rot ? d.L : d.W, sum = (a) => a.reduce((s, t) => s + dep(t, d), 0);
    const S = { left: o.left || o.lr || [], right: o.right || o.lr || [], top: o.top || o.tb || [], bottom: o.bottom || o.tb || [] };
    const xl = sum(S.left), yt = sum(S.top), rects = [], creases = [];
    const fl = (t, i) => i > 0 && !/^H\+?$/.test(t);
    rects.push({ x: xl, y: yt, w: cw, h: ch, fl: false, label: { t: o.centre || 'L×W', v: null, txt: (o.centre || 'L×W').replace('×', ' × ') } });
    let p = 0;
    S.left.forEach((t, i) => { const w = dep(t, d); rects.push({ x: xl - p - w, y: yt, w, h: ch, fl: fl(t, i), label: { t, v: w, rot: true } }); creases.push([xl - p, yt, xl - p, yt + ch]); p += w; });
    p = 0;
    S.right.forEach((t, i) => { const w = dep(t, d); rects.push({ x: xl + cw + p, y: yt, w, h: ch, fl: fl(t, i), label: { t, v: w, rot: true } }); creases.push([xl + cw + p, yt, xl + cw + p, yt + ch]); p += w; });
    const xr = p; p = 0;
    S.top.forEach((t, i) => { const h = dep(t, d); rects.push({ x: xl, y: yt - p - h, w: cw, h, fl: fl(t, i), label: { t, v: h } }); creases.push([xl, yt - p, xl + cw, yt - p]); p += h; });
    p = 0;
    S.bottom.forEach((t, i) => { const h = dep(t, d); rects.push({ x: xl, y: yt + ch + p, w: cw, h, fl: fl(t, i), label: { t, v: h } }); creases.push([xl, yt + ch + p, xl + cw, yt + ch + p]); p += h; });
    return { rects, polys: [], creases, coupe: xl + cw + xr, laize: yt + ch + p, bodyY: null };
  };
  // Plan décrit par une fiche de relevé (voir FROM_PDF plus bas).
  function fromSpec(sp) {
    if (sp.type === 'slotted') return slotted({ seq: sp.seq, noJoint: sp.joint === false, bodyH: sp.bodyH, diag: sp.diag });
    if (sp.type === 'tray') return sp.lid ? lid({ corner: sp.corner, diag: sp.diag, cdiag: sp.cdiag, low: sp.lid === 'v' }) : base({ corner: sp.corner, diag: sp.diag, cdiag: sp.cdiag });
    if (sp.type === 'crossX') return crossX(sp);
    if (sp.type === 'band') return band(sp.cols, sp.h);
    if (sp.type === 'pieces') return compose(sp.items.map((it) => ({ n: it.n, qty: it.qty, build: fromSpec(it.spec) })));
    throw new Error('Type de plan inconnu : ' + sp.type);
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
    '0303': { title: 'Boîte télescopique, coins repliés', serie: '0300 · Boîtes télescopiques', mode: 'M', conf: 'ok',
      desc: 'Fond et couvercle : coins tenus par les parois de bout, repliés à l’intérieur par des plis à 45°.',
      params: ['jeu'], build: compose([{ n: 'Fond', build: base({ corner: 'end', diag: true }) }, { n: 'Couvercle', build: lid({ corner: 'end', diag: true }) }]), fam: 'cross' },
    '0304': { title: 'Boîte télescopique, coins repliés sur les côtés', serie: '0300 · Boîtes télescopiques', mode: 'M', conf: 'ok',
      desc: 'Comme 0303, mais les coins sont tenus par les parois latérales.',
      params: ['jeu'], build: compose([{ n: 'Fond', build: base({ corner: 'side', diag: true }) }, { n: 'Couvercle', build: lid({ corner: 'side', diag: true }) }]), fam: 'cross' },
    '0306': { title: 'Boîte à couvercle bas', serie: '0300 · Boîtes télescopiques', mode: 'M/A', conf: 'ok',
      desc: 'Fond de hauteur H et couvercle bas de hauteur v, qui ne coiffe que le haut du fond.',
      params: ['jeu', 'v'], build: compose([{ n: 'Fond', build: base({ corner: 'side' }) }, { n: 'Couvercle', build: lid({ corner: 'end', low: true }) }]), fam: 'cross' },
    '0308': { title: 'Boîte télescopique à coins en soufflet', serie: '0300 · Boîtes télescopiques', mode: 'M', conf: 'ok',
      desc: 'Fond et couvercle à coins fendus, chaque coin plié en diagonale.',
      params: ['jeu'], build: compose([{ n: 'Fond', build: base({ corner: 'side', cdiag: true }) }, { n: 'Couvercle', build: lid({ corner: 'side', cdiag: true }) }]), fam: 'cross' },
    '0309': { title: 'Boîte télescopique sans découpe de coin', serie: '0300 · Boîtes télescopiques', mode: 'M', conf: 'ok',
      desc: 'Fond et couvercle d’une seule feuille rectangulaire, coins pliés en soufflet (pli en diagonale), sans fente.',
      params: ['jeu'], build: compose([{ n: 'Fond', build: base({ corner: 'gusset' }) }, { n: 'Couvercle', build: lid({ corner: 'gusset' }) }]), fam: 'cross' },
    '0310': { title: 'Manchon et deux couvercles', serie: '0300 · Boîtes télescopiques', mode: 'M/A', conf: 'ok',
      desc: 'Un manchon (4 panneaux et joint, sans rabats) fermé en haut et en bas par deux couvercles bas de hauteur v.',
      params: ['j', 'jeu', 'v'], build: compose([{ n: 'Couvercle', qty: 2, build: lid({ corner: 'side', low: true }) }, { n: 'Manchon', build: slotted({ L: ['0', '0'], W: ['0', '0'] }) }]) },
    '0312': { title: 'Caisse à fond à rabats et couvercle bas', serie: '0300 · Boîtes télescopiques', mode: 'M/A', conf: 'ok',
      desc: 'Corps 0200 (rabats ½W en bas) coiffé d’un couvercle bas de hauteur v.',
      params: ['j', 'jeu', 'v'], build: compose([{ n: 'Couvercle', build: lid({ corner: 'end', low: true }) }, { n: 'Corps', build: slotted({ L: ['0', '½W'], W: ['0', '½W'] }) }]) },
    '0313': { title: 'Caisse américaine et deux couvercles', serie: '0300 · Boîtes télescopiques', mode: 'M/A', conf: 'ok',
      desc: 'Corps 0201 (rabats ½W) avec un couvercle bas de hauteur v en haut et en bas.',
      params: ['j', 'jeu', 'v'], build: compose([{ n: 'Couvercle', qty: 2, build: lid({ corner: 'end', low: true }) }, { n: 'Corps', build: slotted({ L: ['½W', '½W'], W: ['½W', '½W'] }) }]) },
    '0403': { title: 'Plateau à parois latérales doublées', serie: '0400 · Boîtes et plateaux', mode: 'M', conf: 'ok',
      desc: 'Plateau en croix : parois L doublées (H, v, H, v) et parois W prolongées par un rabat de ½W.',
      params: ['v'], build: crossX({ lr: ['H', 'v', 'H', 'v'], tb: ['H', '½W'] }) },
    '0404': { title: 'Boîte en deux bandes croisées', serie: '0400 · Boîtes et plateaux', mode: 'M', conf: 'ok',
      desc: 'Deux bandes : l’une de hauteur L+ (½W+, H+, W+, H+, ½W+), l’autre de hauteur W (½L, H, L, H, ½L), pliées l’une dans l’autre.',
      params: ['jeu'], build: compose([{ n: 'Bande L+', build: band(['½W+', 'H+', 'W+', 'H+', '½W+'], 'L+') }, { n: 'Bande W', build: band(['½L', 'H', 'L', 'H', '½L'], 'W') }]) },
    '0402': { title: 'Plateau à rabats de rive', serie: '0400 · Boîtes et plateaux', mode: 'M', conf: 'ok',
      desc: 'Plateau en croix : 4 parois H, prolongées par des rabats de ½L et ½W qui se rabattent à l’intérieur.',
      params: [], build: crossX({ lr: ['H', '½L'], tb: ['H', '½W'] }) },
  };

  // Fiches relevées sur les pages du PDF FEFCO : [code, série, montage, titre, description, réglages, plan].
  const FROM_PDF = [
  ];
  FROM_PDF.forEach(([c, serie, mode, title, desc, params, sp]) => {
    const txt = JSON.stringify(sp), auto = [];
    if (/"type":"slotted"/.test(txt) && !/"joint":false/.test(txt)) auto.push('j');
    if (/o[)"]/.test(txt)) auto.push('o');
    if (/\+"|\+[)½]|"lid":"/.test(txt)) auto.push('jeu');
    if (/v/.test(txt.replace(/"[a-z]+":/gi, '').replace(/"(slotted|tray|crossX|band|pieces|side|end|gusset)"/g, ''))) auto.push('v');
    STYLES[c] = { title, serie, mode, conf: 'ok', desc, params: params || auto, build: fromSpec(sp), fam: null };
  });

  // Données de pliage 3D : profondeur de rabat (haut / bas) par type de panneau.
  Object.keys(STYLES).forEach((c) => { const t = STYLES[c]; if (t.spec && !t.spec.seq) t.flap = (k, d, side) => dep(t.spec[k][side === 'b' ? 1 : 0], d); });
  const fam = (c, f) => { STYLES[c].fam = f; };

  root.FEFCO_STYLES = STYLES;
  if (typeof module !== 'undefined') module.exports = STYLES;
})(typeof window !== 'undefined' ? window : globalThis);
