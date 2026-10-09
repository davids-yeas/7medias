// Bibliothèque FEFCO : chaque style renvoie un plan à plat en mm.
// Repère : x = sens de la coupe (horizontal), y = sens de la laize (vertical).
// conf: 'ok' = géométrie standard, 'verif' = à valider avec le PDF FEFCO.
(function (root) {
  const half = (v) => v / 2;

  // ---------- Caisses à rabats (série 0200) : 1 pièce, joint, 4 panneaux ----------
  function slotted(flapFn) {
    return function (d) {
      const { L, W, H, j } = d;
      const f = { L: flapFn('L', d), W: flapFn('W', d) };
      const top = Math.max(f.L, f.W);
      const seq = ['L', 'W', 'L', 'W'];
      const rects = [], creases = [], polys = [];
      const taper = Math.min(8, H / 4);
      polys.push({ pts: [[0, top + taper], [j, top], [j, top + H], [0, top + H - taper]],
        label: { t: 'j', v: j, rot: true } });
      let x = j;
      seq.forEach((k) => {
        const w = k === 'L' ? L : W;
        rects.push({ x, y: top, w, h: H, label: { t: k, v: w } });
        const dep = f[k];
        if (dep > 0) {
          const fl = k === 'L' ? flapLabel(d, 'L') : flapLabel(d, 'W');
          rects.push({ x, y: top - dep, w, h: dep, label: { t: fl, v: dep } });
          rects.push({ x, y: top + H, w, h: dep, label: { t: fl, v: dep } });
        }
        x += w;
      });
      const coupe = x, laize = top + H + top;
      let xs = j;
      creases.push([j, top, j, top + H]);
      seq.forEach((k) => { xs += k === 'L' ? L : W; creases.push([xs, top, xs, top + H]); });
      creases.push([j, top, coupe, top]);
      creases.push([j, top + H, coupe, top + H]);
      return { rects, polys, creases, coupe, laize, bodyY: [top, top + H] };
    };
  }
  function flapLabel(d, k) {
    return d._flapTxt ? d._flapTxt[k] : '';
  }

  // ---------- Plateau croisé (0300 couvercle, 0400 plateau) ----------
  function cross(d) {
    const { H } = d, L = d.L + d.jeu, W = d.W + d.jeu;
    const rects = [
      { x: H, y: H, w: L, h: W, label: { t: 'L×W', v: null, txt: `${L} × ${W}` } },
      { x: H, y: 0, w: L, h: H, label: { t: 'H', v: H } },
      { x: H, y: H + W, w: L, h: H, label: { t: 'H', v: H } },
      { x: 0, y: H, w: H, h: W, label: { t: 'H', v: H, rot: true } },
      { x: H + L, y: H, w: H, h: W, label: { t: 'H', v: H, rot: true } },
    ];
    const creases = [[H, H, H + L, H], [H, H + W, H + L, H + W], [H, H, H, H + W], [H + L, H, H + L, H + W]];
    return { rects, polys: [], creases, coupe: L + 2 * H, laize: W + 2 * H, bodyY: null };
  }

  const STYLES = {
    '0200': { title: 'Caisse à rabats, sans rabats', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Un fourreau ouvert aux deux bouts : 4 panneaux et un joint, pas de rabats.',
      params: ['j'], build: (d) => { d._flapTxt = {}; return slotted(() => 0)(d); } },
    '0201': { title: 'Caisse américaine (RSC)', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Le carton standard. Rabats de ½W sur les 4 panneaux : ils se rejoignent au milieu.',
      params: ['j'], build: (d) => { d._flapTxt = { L: '½W', W: '½W' }; return slotted((k, d) => half(d.W))(d); } },
    '0202': { title: 'Caisse à rabats recouvrants', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats de ½(W+o) : ils se chevauchent d’une longueur o.',
      params: ['j', 'o'], build: (d) => { d._flapTxt = { L: '½(W+o)', W: '½(W+o)' }; return slotted((k, d) => half(d.W + d.o))(d); } },
    '0203': { title: 'Caisse à recouvrement total', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'ok',
      desc: 'Rabats de profondeur W sur les grands panneaux seulement : recouvrement complet.',
      params: ['j'], build: (d) => { d._flapTxt = { L: 'W', W: '' }; return slotted((k, d) => (k === 'L' ? d.W : 0))(d); } },
    '0205': { title: 'Caisse à rabats sur les petits côtés', serie: '0200 · Caisses à rabats', mode: 'M/A', conf: 'verif',
      desc: 'Rabats de ½L sur les petits panneaux seulement, ils se rejoignent au milieu. À valider avec le PDF.',
      params: ['j'], build: (d) => { d._flapTxt = { L: '', W: '½L' }; return slotted((k, d) => (k === 'W' ? half(d.L) : 0))(d); } },
    '0300': { title: 'Couvercle télescopique', serie: '0300 · Boîtes télescopiques', mode: 'M/A', conf: 'verif',
      desc: 'Plateau croisé. Dimensions « + » du PDF : ajouter un jeu pour qu’il coiffe le fond. À valider.',
      params: ['jeu'], build: cross },
    '0400': { title: 'Plateau', serie: '0400 · Boîtes et plateaux', mode: 'M', conf: 'verif',
      desc: 'Plateau croisé : fond L×W et 4 parois de hauteur H (montage par collage ou agrafage). À valider.',
      params: [], build: (d) => cross(Object.assign({}, d, { jeu: 0 })) },
  };

  root.FEFCO_STYLES = STYLES;
  if (typeof module !== 'undefined') module.exports = STYLES;
})(typeof window !== 'undefined' ? window : globalThis);
