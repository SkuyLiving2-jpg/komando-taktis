/* ============================================================
   FPS-BASE — bangunan pertahanan markas (v2.8): bunker beton, meriam
   155 mm CAESAR, situs SAM, dan gedung komando dengan rincian setara
   model prajurit & kendaraan generasi kedua. Dimuat setelah fps-models2.js
   dan menimpa MD.structure untuk jenis-jenis ini; ukuran tapak & tinggi
   tetap sama dengan hitbox di fps.js.
   Tulang CAESAR: 1 dudukan putar, 2 laras (poros MD.CAE.gp).
   Tulang SAM: 1 peluncur putar (poros x -.2), 4 radar (poros x -2.2).
   Sumbu: +x depan (arah musuh untuk markas kita), +y kanan, +z atas.
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, MD = F && F.MDL;
  if (!MD || !MD.structure) return;
  const K = MD.K, X = MD.X, Mesh = MD.Mesh, { nrm, crs, sub, dot } = MD.v, TAU = 6.28318;
  const SAND = [168, 150, 110], DIRT = [112, 96, 72], OL = [92, 106, 70], OD = [62, 70, 50], GM = [46, 48, 46], STEEL = [112, 116, 116], BRASS = [176, 142, 74], WIRE = [84, 84, 78];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jit = (c, a) => { const k = 1 + (rnd() - .5) * a; return c.map(v => v * k); };

  /* karung pasir: batu bata bersilang di sepanjang elips (a0..a1), tiap baris sedikit masuk ke dalam */
  function bagArc(m, cx, cy, rx, ry, a0, a1, rows, z0, col) {
    const N = Math.max(2, Math.round(Math.abs(a1 - a0) * (rx + ry) * .5 / .86));
    for (let r = 0; r < rows; r++) for (let i = 0; i < N + (r % 2 ? 0 : 1); i++) {
      const a = a0 + (i + (r % 2 ? .5 : 0)) / N * (a1 - a0), q = 1 - r * .018, x = cx + Math.cos(a) * rx * q, y = cy + Math.sin(a) * ry * q, tg = Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx) + (rnd() - .5) * .1;
      m.set(jit(col || SAND, .16), .05, K.PLASTER, 1); m.push(X.chain(X.T(x, y, (z0 || 0) + .13 + r * .235), X.rz(tg))); m.sq([0, 0, 0], [.45, .25, .135], 3.2, 8, 4); m.pop();
    }
  }
  function bagLine(m, x0, y0, x1, y1, rows, z0) {
    const L = Math.hypot(x1 - x0, y1 - y0), N = Math.max(1, Math.round(L / .86)), a = Math.atan2(y1 - y0, x1 - x0);
    for (let r = 0; r < rows; r++) for (let i = 0; i < N + (r % 2 ? 0 : 1); i++) {
      const k = (i + (r % 2 ? .5 : 0)) / N;
      m.set(jit(SAND, .16), .05, K.PLASTER, 1); m.push(X.chain(X.T(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, (z0 || 0) + .13 + r * .235), X.rz(a + (rnd() - .5) * .1))); m.sq([0, 0, 0], [.45, .25, .135], 3.2, 8, 4); m.pop();
    }
  }
  /* bronjong HESCO: keranjang kawat berlapis kain terisi tanah, n keranjang berjajar searah a */
  function hesco(m, x, y, a, n, h) {
    h = h || 1.25;
    for (let i = 0; i < n; i++) {
      m.push(X.chain(X.T(x + Math.cos(a) * i * 1.03, y + Math.sin(a) * i * 1.03, 0), X.rz(a)));
      m.set(jit([176, 164, 130], .1), .03, K.CLOTH, 0).box([0, 0, h / 2], [.5, .5, h / 2]);
      m.set(jit(DIRT, .2), .02, K.PLASTER, 1).sq([0, 0, h + .02], [.47, .47, .08], 3, 8, 4);
      m.set(WIRE, .4, K.METAL).box([0, 0, h * .33], [.513, .513, .012]).box([0, 0, h * .66], [.513, .513, .012]).box([0, 0, h - .02], [.513, .513, .012]);
      for (const [p, q] of [[.505, .505], [-.505, .505]]) m.rod([p, q, 0], [p, q, h], .018, 4).rod([p, -q, 0], [p, -q, h], .018, 4);
      m.pop();
    }
  }
  /* prisma bersudut tajam (dinding beton miring): normal tiap sisi rata */
  function prism(m, z0, rx0, ry0, z1, rx1, ry1, n, rot, top) {
    const P = (i, z, rx, ry) => { const t = rot + i / n * TAU; return [Math.cos(t) * rx, Math.sin(t) * ry, z]; };
    for (let i = 0; i < n; i++) {
      const a = P(i, z0, rx0, ry0), b = P(i + 1, z0, rx0, ry0), c = P(i + 1, z1, rx1, ry1), d = P(i, z1, rx1, ry1);
      let N = nrm(crs(sub(b, a), sub(d, a))); const mx = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0]; if (dot(N, mx) < 0) N = N.map(v => -v);
      m.face([a, b, c, d], N);
    }
    if (top) { const id = []; for (let i = 0; i < n; i++) id.push(P(i, z1, rx1, ry1)); m.face(id, [0, 0, 1]); }
  }
  function padJoints(m, hx, hy, z, stepX, stepY) {
    m.set([84, 84, 80], .02, K.PLAIN);
    for (let x = -hx + stepX; x < hx - .1; x += stepX) m.box([x, 0, z], [.025, hy, .012]);
    for (let y = -hy + stepY; y < hy - .1; y += stepY) m.box([0, y, z], [hx, .025, .012]);
  }
  function wheel(m, x, y, r, w) {
    const z = r, s = Math.sign(y);
    m.set([24, 24, 24], .12, K.PLAIN).cyl([x, y - w, z], [x, y + w, z], r, r, 16);
    m.set([62, 66, 54], .3, K.METAL).cyl([x, y + s * w, z], [x, y + s * (w + .02), z], r * .55, r * .55, 12);
    m.set(GM, .35, K.METAL).cyl([x, y + s * (w + .02), z], [x, y + s * (w + .07), z], r * .2, r * .16, 8);
  }

  /* ---------- BUNKER BETON ---------- */
  function bunker(m, red) {
    const CN = red ? [152, 138, 120] : [160, 160, 150], RF = red ? [122, 108, 94] : [134, 136, 128], DK = [10, 10, 10], ROT = TAU / 16, HOT = red ? [190, 44, 36] : [226, 226, 218];
    m.bone(0);
    m.set(DIRT, .02, K.PLASTER, 1).ell([[0, 6.7, 5.7], [.45, 6, 5.05], [.95, 5.3, 4.4], [1.1, 4.9, 4.1]], 28, { cap: false });   // gundukan tanah menimbun kaki dinding
    m.set(CN, .05, K.CONC); prism(m, 0, 4.85, 4, 2.3, 4.15, 3.42, 8, ROT, false);                                             // dinding miring: peluru memantul
    m.set(CN.map(v => v * .72), .02, K.PLAIN); for (const z of [.75, 1.0, 2.02]) { const k = z / 2.3, rx = 4.85 - .7 * k, ry = 4 - .58 * k; prism(m, z, rx + .012, ry + .012, z + .022, rx + .012, ry + .012, 8, ROT, false); }   // garis bekisting cor
    m.set(RF, .05, K.CONC); prism(m, 2.3, 4.45, 3.72, 2.62, 4.45, 3.72, 8, ROT, false); prism(m, 2.62, 4.45, 3.72, 2.78, 4.05, 3.35, 8, ROT, true);   // atap beton tebal menjorok
    // celah tembak depan & sisi: lubang gelap, pipi miring, alis beton
    const slit = (x, y, a, w) => {
      m.push(X.chain(X.T(x, y, 0), X.rz(a)));
      m.set(DK, 0, K.PLAIN).box([.02, 0, 1.42], [.09, w, .19]);
      m.set(CN.map(v => v * .86), .05, K.CONC).box([.14, 0, 1.72], [.26, w + .34, .1]).box([.1, 0, 1.13], [.22, w + .28, .09]);
      for (const s of [-1, 1]) { m.push(X.chain(X.T(.1, s * (w + .16), 1.42), X.rz(s * .5))); m.box([0, 0, 0], [.2, .07, .26]); m.pop(); }
      m.pop();
    };
    slit(4.34, 0, 0, 1.3); slit(0, 3.5, 1.5708, 1.05); slit(0, -3.5, -1.5708, 1.05);
    m.set(GM, .4, K.METAL).cyl([3.8, .55, 1.42], [5.15, .55, 1.42], .055, .045, 8).cyl([4.75, .55, 1.42], [5.25, .55, 1.42], .085, .075, 8);   // senapan mesin berat di celah depan
    m.cyl([3.9, -.6, 1.42], [4.7, -.6, 1.42], .12, .1, 8); m.set([34, 34, 34], .1, K.PLAIN).cyl([4.7, -.6, 1.42], [4.71, -.6, 1.42], .07, .07, 8);   // tabung peluncur antitank
    // pintu baja belakang + dinding penahan ledakan
    m.set(CN.map(v => v * .86), .05, K.CONC).box([-4.42, 0, 1.08], [.22, .95, 1.08]);
    m.set(GM, .45, K.METAL).box([-4.66, 0, .98], [.04, .56, .9]); m.set(STEEL, .5, K.METAL).box([-4.71, .36, 1], [.03, .06, .09]).box([-4.69, 0, 1.56], [.015, .5, .03]).box([-4.69, 0, .42], [.015, .5, .03]);
    bagLine(m, -6.4, -1.55, -6.4, 1.55, 6, 0); for (const s of [-1, 1]) bagLine(m, -5.8, s * 1.75, -4.9, s * 1.75, 4, 0);
    // lapisan atap
    m.set(GM, .4, K.METAL).cyl([-1.5, -1.2, 2.78], [-1.5, -1.2, 3], .52, .52, 14); m.set(STEEL, .5, K.METAL).cyl([-1.5, -1.2, 3], [-1.5, -1.2, 3.06], .58, .54, 14); m.box([-1.5, -.62, 3.04], [.08, .1, .04]);   // palka
    m.set(GM, .4, K.METAL).cyl([1.2, 1.3, 2.78], [1.2, 1.3, 3.15], .1, .1, 8).box([1.28, 1.3, 3.22], [.14, .13, .09]); m.set([20, 30, 36], .9, K.GLASS).box([1.43, 1.3, 3.22], [.01, .09, .05]);   // periskop
    m.set(STEEL, .4, K.METAL); for (const [x, y] of [[-.4, 1.9], [.6, -1.9]]) { m.cyl([x, y, 2.78], [x, y, 3.2], .11, .11, 8); m.cyl([x, y, 3.2], [x, y, 3.34], .28, .05, 10); }   // ventilasi berpayung
    m.set(GM, .4, K.METAL).cyl([-2.4, 1.6, 2.78], [-2.4, 1.6, 6.6], .035, .012, 5); m.set(STEEL, .5, K.METAL).cyl([-2.4, 1.6, 2.78], [-2.4, 1.6, 3.05], .09, .07, 6);   // antena radio
    m.set(red ? [90, 72, 58] : OL, .03, K.CLOTH, 0).sq([-.5, .5, 2.86], [2.4, 1.1, .07], 3, 12, 4); m.set(jit(OD, .1), .03, K.CLOTH, 0).sq([1.1, -.8, 2.85], [1.4, .9, .06], 3, 10, 4);   // jaring kamuflase tersampir
    bagArc(m, 2.6, 0, .95, 1.5, -1.45, 1.45, 2, 2.78);   // karung di atap: posisi pengamat
    m.set(HOT, .1, K.PAINT, 0).box([4.34, -2.2, .9], [.02, .34, .2]);   // tanda pengenal cat
    // parit karung pasir melingkar: terbuka di belakang, rendah di bawah garis tembak
    for (const [a0, a1] of [[-2.55, -.32], [.32, 2.55]]) bagArc(m, 0, 0, 6.15, 5.15, a0, a1, 3, .1);
    bagArc(m, 6.3, 0, .9, 1.7, -1.1, 1.1, 2, 0);
    m.set(WIRE, .3, K.METAL); for (const s of [-1, 1]) { const x0 = 7.3, y0 = s * 2.2; for (let i = 0; i < 4; i++) { const y = y0 + s * i * 1.1; m.rod([x0, y, 0], [x0, y, .85], .022, 4); if (i < 3) m.rod([x0, y, .75], [x0, y + s * 1.1, .75], .008, 3).rod([x0, y, .45], [x0, y + s * 1.1, .45], .008, 3); } }   // pagar kawat depan
  }

  /* ---------- MERIAM 155 MM CAESAR TERPASANG ---------- */
  function caesar(m) {
    const G = MD.CAE.gp, CN = [150, 150, 140], LN = [214, 178, 58];
    m.bone(0);
    m.set(CN, .05, K.CONC).box([0, 0, .1], [5.4, 4.6, .1]); padJoints(m, 5.4, 4.6, .21, 2.7, 2.3);
    m.set(LN, .05, K.PAINT, 0); for (let i = 0; i < 20; i++) { const a = i / 20 * TAU, c = Math.cos(a), s = Math.sin(a); if (i % 2 === 0) { m.push(X.chain(X.T(c * 2.3, s * 2.3, .208), X.rz(a))); m.box([0, 0, 0], [.1, .34, .008]); m.pop(); } }   // batas ayun sungsang
    m.set(GM, .4, K.METAL).cyl([0, 0, .2], [0, 0, .36], 1.72, 1.72, 28);   // rel putar
    m.set(STEEL, .5, K.METAL); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; m.cyl([Math.cos(a) * 1.58, Math.sin(a) * 1.58, .36], [Math.cos(a) * 1.58, Math.sin(a) * 1.58, .4], .045, .045, 6); }   // baut landasan
    // kaki penyangga bercakar sekop
    for (const sd of [-1, 1]) {
      m.set(OD, .3, K.PAINT, 1).cyl([-1.05, sd * .62, .62], [-4.8, sd * 2.05, .28], .17, .13, 8);
      m.set(GM, .4, K.METAL).cyl([-2.6, sd * 1.22, .47], [-2.6, sd * 1.22, .2], .07, .09, 6);
      m.set(OD, .35, K.METAL); m.push(X.chain(X.T(-5, sd * 2.12, .3), X.rz(sd * -.36), X.ry(.35))); m.box([0, 0, 0], [.12, .55, .3]); m.pop(); m.box([-4.75, sd * 2.02, .3], [.24, .2, .12]);
    }
    // bronjong di tiga sisi, karung pasir rendah di depan agar laras bebas
    hesco(m, -5.6, -5.15, 0, 11); hesco(m, -5.6, 5.15, 0, 11); hesco(m, -6.65, -5.15, 1.5708, 11);
    bagArc(m, 5.4, 0, .9, 4.6, -1.2, 1.2, 3, 0);
    // rak peluru 155 mm + isian + tabir
    m.set([70, 60, 42], .05, K.PAINT, 0).box([2.7, -3.3, .34], [1.15, .55, .05]).box([2.7, -3.3, .72], [1.15, .55, .04]);
    m.set(GM, .4, K.METAL); for (const x of [1.65, 3.75]) for (const y of [-3.75, -2.85]) m.cyl([x, y, .2], [x, y, .9], .03, .03, 5);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 6; i++) {
      const y = -3.7 + i * .16, z = .48 + j * .38;
      m.set(jit([82, 92, 58], .06), .25, K.PAINT, 0).cyl([1.75, y, z], [3.2, y, z], .075, .075, 10); m.set(BRASS, .6, K.METAL).cyl([1.68, y, z], [1.75, y, z], .07, .078, 10).cyl([3.2, y, z], [3.5, y, z], .075, .02, 10);
    }
    m.set([84, 74, 50], .08, K.PAINT, 0); for (let i = 0; i < 3; i++) m.box([2.7 + (i - 1) * 1, 3.2, .42], [.42, .3, .22]); m.set(OD, .1, K.PAINT, 0).box([2.7, 3.2, .78], [.42, .3, .14]);   // peti isian dorong
    m.set(OL, .03, K.CLOTH, 0).box([-3.4, -3.5, 2.55], [1.7, 1.1, .025]); m.set(GM, .3, K.METAL); for (const [x, y] of [[-4.95, -4.45], [-1.85, -4.45], [-4.95, -2.55], [-1.85, -2.55]]) m.cyl([x, y, .2], [x, y, 2.55], .035, .03, 5);   // terpal awak
    // dudukan putar
    m.bone(1);
    m.set(OL, .2, K.PAINT, 1).cyl([0, 0, .36], [0, 0, .85], 1.55, 1.42, 24); m.set(OD, .3, K.METAL).cyl([0, 0, .85], [0, 0, .92], 1.48, 1.48, 24);
    m.set(OL, .2, K.PAINT, 1).sq([-.35, 0, 1.25], [1.25, .9, .38], 4, 12, 4);
    for (const sd of [-1, 1]) {   // pipi dudukan trunnion
      m.face([[-.75, sd * .78, .9], [1.05, sd * .78, .9], [.82, sd * .78, 2.55], [-.2, sd * .78, 2.55]], [0, sd, 0]); m.face([[-.75, sd * .62, .9], [1.05, sd * .62, .9], [.82, sd * .62, 2.55], [-.2, sd * .62, 2.55]], [0, -sd, 0]);
      m.face([[-.75, sd * .62, .9], [-.2, sd * .62, 2.55], [-.2, sd * .78, 2.55], [-.75, sd * .78, .9]], nrm([-.95, 0, .32])); m.face([[1.05, sd * .62, .9], [.82, sd * .62, 2.55], [.82, sd * .78, 2.55], [1.05, sd * .78, .9]], nrm([.99, 0, .13])); m.face([[-.2, sd * .62, 2.55], [.82, sd * .62, 2.55], [.82, sd * .78, 2.55], [-.2, sd * .78, 2.55]], [0, 0, 1]);
      m.set(GM, .45, K.METAL).cyl([G[0], sd * .6, G[2]], [G[0], sd * .86, G[2]], .24, .24, 14); m.set(STEEL, .5, K.METAL).cyl([G[0], sd * .86, G[2]], [G[0], sd * .9, G[2]], .16, .12, 10); m.set(OL, .2, K.PAINT, 1);
    }
    m.set(OD, .3, K.METAL).box([-1.15, -1.14, 1.5], [.42, .1, .42]); m.set(GM, .4, K.METAL).cyl([-.95, -1.28, 1.42], [-.95, -1.42, 1.42], .15, .15, 12).cyl([-.95, -1.42, 1.42], [-.95, -1.45, 1.42], .17, .17, 12);   // panel & roda tangan
    m.set(GM, .4, K.METAL).rod([.05, -.98, 1.6], [.05, -1.1, 2.35], .035, 6).box([.05, -1.13, 2.48], [.2, .07, .13]); m.set([40, 90, 120], .95, K.GLASS).box([.26, -1.13, 2.48], [.01, .05, .07]);   // bidik panorama
    m.set(OD, .25, K.METAL); for (const sd of [-1, 1]) { m.push(X.chain(X.T(.95, sd * 1.25, 1.65), X.rz(sd * .32))); m.box([0, 0, 0], [.03, .42, .58]); m.pop(); }   // perisai pecahan
    m.set(GM, .4, K.METAL).cyl([-1.45, 1.05, 1.5], [-1.45, 1.05, 3.1], .028, .012, 5); m.box([-1.55, .9, 1.7], [.32, .1, .22]);   // antena & radio pemandu
    // laras 52 kaliber, bergerak bersama elevasi & hentakan
    m.bone(2);
    const x0 = G[0], z = G[2];
    m.set(OL, .25, K.PAINT, 1).sq([x0 - .05, 0, z], [1.05, .46, .4], 4, 12, 4);                                                  // ayunan
    m.set(GM, .5, K.METAL).cyl([x0 - .85, 0, z], [x0 - 1.32, 0, z], .34, .34, 16); m.set(STEEL, .55, K.METAL).cyl([x0 - 1.32, 0, z], [x0 - 1.4, 0, z], .3, .3, 16).box([x0 - 1.42, .3, z], [.03, .2, .04]);   // sungsang ber-tuas
    m.set(OD, .4, K.METAL); for (const sd of [-1, 1]) { m.cyl([x0 - .55, sd * .3, z + .36], [x0 + 2.45, sd * .3, z + .36], .095, .095, 10); m.set(STEEL, .6, K.METAL).cyl([x0 + 2.45, sd * .3, z + .36], [x0 + 3.2, sd * .3, z + .36], .05, .05, 8); m.set(OD, .4, K.METAL); m.cyl([x0 - .3, sd * .34, z - .34], [x0 + 1.6, sd * .34, z - .34], .07, .07, 8); }   // silinder hentak & rekuperator
    m.box([x0 + 1.6, 0, z + .1], [.18, .4, .36]);   // penjepit depan
    m.set(OD, .42, K.METAL).cyl([x0, 0, z], [x0 + 3.5, 0, z], .205, .19, 16); m.cyl([x0 + 3.5, 0, z], [x0 + 8.2, 0, z], .172, .145, 16);
    m.cyl([x0 + 3.45, 0, z], [x0 + 3.6, 0, z], .17, .225, 16); m.cyl([x0 + 3.6, 0, z], [x0 + 3.72, 0, z], .225, .172, 16);       // sambungan
    m.push(X.chain(X.T(x0, 0, z), X.ry(-1.5708))); m.ell([[5.1, .155, .155], [5.3, .225, .225], [6.05, .225, .225], [6.3, .15, .15]], 14, { cap: false }); m.pop();   // tabung pembuang asap
    m.set(GM, .45, K.METAL).cyl([x0 + 8.15, 0, z], [x0 + 8.75, 0, z], .2, .2, 14);                                               // rem moncong
    for (const q of [8.3, 8.6]) { m.box([x0 + q, 0, z + .17], [.075, .24, .06]).box([x0 + q, 0, z - .17], [.075, .24, .06]); for (const sd of [-1, 1]) m.box([x0 + q, sd * .22, z], [.075, .08, .22]); }
    m.set(DK0, 0, K.PLAIN).cyl([x0 + 8.75, 0, z], [x0 + 8.76, 0, z], .15, .15, 12);
  }
  const DK0 = [10, 10, 10];

  /* ---------- SITUS SAM: peluncur empat kanister di trailer + radar panel putar ---------- */
  function sam(m, red) {
    const PN = red ? [106, 90, 72] : [94, 100, 78], PD = red ? [78, 66, 54] : [68, 74, 58], CN = [146, 146, 136], PX = -.2;
    m.bone(0);
    m.set(CN, .05, K.CONC).box([0, 0, .07], [4.3, 3.4, .07]); padJoints(m, 4.3, 3.4, .15, 2.15, 1.7);
    for (const s of [-1, 1]) hesco(m, -4.3, s * 4, 0, 9, 1.05);
    hesco(m, -5.35, -4, 1.5708, 9, 1.05);
    // trailer: rangka, roda, kaki penstabil, kotak daya
    m.set(PD, .25, K.PAINT, 1); for (const s of [-1, 1]) m.box([0, s * .78, .78], [3.15, .09, .13]); for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) m.box([x, 0, .78], [.08, .78, .1]);
    m.set(PN, .25, K.PAINT, 1).box([0, 0, .97], [2.85, .95, .08]);
    m.set(GM, .35, K.METAL).rod([3.15, .7, .78], [4, 0, .68], .05, 6).rod([3.15, -.7, .78], [4, 0, .68], .05, 6).cyl([4, 0, .68], [4.1, 0, .68], .07, .07, 8);   // gandar tarik
    for (const x of [-1.15, -.3]) for (const y of [-.98, .98]) wheel(m, x, y, .42, .14);
    m.set(GM, .4, K.METAL); for (const [x, y] of [[2.55, 1], [2.55, -1], [-2.5, 1], [-2.5, -1]]) { const s = Math.sign(y); m.box([x, y * .92, .78], [.08, .22, .07]); m.cyl([x, y * 1.15, .78], [x, y * 1.15, .22], .065, .065, 8); m.set(STEEL, .4, K.METAL).cyl([x, y * 1.15, .22], [x, y * 1.15, .15], .24, .24, 10); m.set(GM, .4, K.METAL); }
    m.set(PN, .2, K.PAINT, 1).sq([-2.2, 0, 1.45], [.72, .78, .46], 5, 12, 4); m.set(PD, .3, K.METAL); for (let i = 0; i < 5; i++) m.box([-2.2 + (i - 2) * .22, .79, 1.48], [.06, .012, .24]);   // pembangkit + kisi
    m.set(GM, .4, K.METAL).cyl([-2.2, 0, 1.9], [-2.2, 0, 2.65], .16, .11, 10);   // tiang radar
    m.set(OD, .05, K.PLAIN).cyl([-1.1, .95, 1.05], [.6, 1.2, .16], .025, .025, 4);   // kabel daya
    // peluncur putar
    m.bone(1);
    m.set(GM, .4, K.METAL).cyl([PX, 0, 1.05], [PX, 0, 1.25], .92, .92, 20); m.set(PN, .2, K.PAINT, 1).cyl([PX, 0, 1.25], [PX, 0, 1.56], .86, .74, 20);
    m.set(PD, .28, K.METAL); for (const s of [-1, 1]) { m.face([[PX - .75, s * .86, 1.5], [PX + .45, s * .86, 1.5], [PX - .4, s * .86, 2.3], [PX - 1, s * .86, 2.3]], [0, s, 0]); m.face([[PX - .75, s * .74, 1.5], [PX + .45, s * .74, 1.5], [PX - .4, s * .74, 2.3], [PX - 1, s * .74, 2.3]], [0, -s, 0]); }
    m.set(GM, .45, K.METAL).cyl([PX + .9, -.3, 1.56], [PX + .1, -.3, 2.7], .08, .08, 8).cyl([PX + .9, .3, 1.56], [PX + .1, .3, 2.7], .08, .08, 8);   // silinder elevasi
    const EL = .68, cc = Math.cos(EL), ss = Math.sin(EL);
    m.push(X.chain(X.T(PX - .7, 0, 2.25), X.ry(EL)));
    m.set(PD, .3, K.METAL).box([1.3, 0, -.04], [1.55, .92, .05]); for (const x of [.1, 1.3, 2.5]) m.box([x, 0, -.11], [.09, .95, .07]);   // rangka kanister
    for (const [yy, zz] of [[-.45, .3], [.45, .3], [-.45, 1.08], [.45, 1.08]]) {
      m.set(PN, .25, K.PAINT, 1).box([1.3, yy, zz], [2.05, .38, .36]);
      m.set(PD, .28, K.METAL); for (const x of [-.45, .45, 1.3, 2.15, 3.05]) m.box([x, yy, zz], [.05, .405, .385]);   // rusuk
      m.set(jit([202, 204, 196], .03), .3, K.PLAIN).box([3.37, yy, zz], [.025, .34, .32]); m.set(red ? [120, 96, 60] : [214, 178, 58], .1, K.PAINT, 0).box([3.4, yy, zz + .22], [.005, .3, .035]);   // tutup depan + garis penanda
      m.set([12, 12, 12], 0, K.PLAIN).box([-.76, yy, zz], [.015, .28, .26]);   // belakang
    }
    m.set(PD, .28, K.METAL).box([1.3, 0, .69], [1.9, .05, .42]); m.box([-.7, 0, .69], [.05, .86, .78]).box([3.3, 0, .69], [.05, .86, .78]);
    m.pop();
    // radar panel bertahap, berputar di tiang
    m.bone(4);
    const RX = -2.2;
    m.set(GM, .4, K.METAL).cyl([RX, 0, 2.65], [RX, 0, 2.85], .22, .22, 12);
    m.push(X.chain(X.T(RX, 0, 3.3), X.ry(-.28)));
    m.set(PD, .3, K.PAINT, 0).box([-.08, 0, 0], [.11, .98, .62]); m.set([74, 80, 72], .15, K.PAINT, 0).box([.04, 0, 0], [.02, .92, .56]);
    m.set(GM, .35, K.METAL); for (let i = -3; i <= 3; i++) m.box([.065, i * .26, 0], [.006, .012, .56]); for (let j = -2; j <= 2; j++) m.box([.065, 0, j * .22], [.006, .92, .012]);
    m.set(GM, .4, K.METAL).box([-.22, 0, 0], [.1, .28, .24]);
    m.pop();
    m.set([255, 60, 44], 0, K.EMIT).box([RX, 0, 4.02], [.035, .035, .035]);
  }

  /* ---------- GEDUNG KOMANDO ---------- */
  function command(m, red) {
    const WL = red ? [128, 112, 98] : [152, 156, 150], RF = red ? [88, 72, 64] : [94, 102, 106], CN = red ? [136, 124, 110] : [146, 146, 138], FL = red ? [214, 44, 40] : [232, 232, 232];
    m.bone(0);
    m.set(CN.map(v => v * .8), .05, K.CONC).box([0, 0, .05], [10.6, 9.4, .05]); padJoints(m, 10.6, 9.4, .11, 3.5, 3.1);
    m.set(WL, .1, K.FACADE, 2.5).box([0, 0, 3.6], [8, 6, 3.6], { topK: K.CONC });
    m.set(CN, .05, K.CONC); prism(m, 0, 11.75, 8.9, 1.5, 11.42, 8.58, 4, TAU / 8, false);   // kaki beton miring penahan ledakan
    m.set(RF, .1, K.CONC).box([0, 0, 7.35], [8.3, 6.3, .17]);
    m.set(CN, .05, K.CONC); for (const s of [-1, 1]) m.box([0, s * 6.14, 7.78], [8.3, .16, .28]); for (const s of [-1, 1]) m.box([s * 8.14, 0, 7.78], [.16, 6, .28]);   // tembok atap
    // ruang komando di atap + kaca gelap
    m.set(WL.map(v => v * .94), .08, K.CONC).box([-2.5, 0, 8.4], [3.2, 3, .9]); m.set(RF, .1, K.CONC).box([-2.5, 0, 9.36], [3.45, 3.25, .1]);
    m.set([24, 44, 56], .95, K.GLASS).box([.72, 0, 8.55], [.015, 2.5, .48]); for (const s of [-1, 1]) m.box([-2.5, s * 3.01, 8.55], [2.7, .015, .48]);
    // pintu masuk: serambi beton, pintu baja, karung pasir
    m.set(CN, .05, K.CONC).box([9.05, 0, 3.05], [1.1, 2.4, .16]); for (const s of [-1, 1]) m.box([9.75, s * 2.2, 1.45], [.22, .2, 1.45]);
    m.set(GM, .45, K.METAL).box([8.03, 0, 1.3], [.04, 1.15, 1.3]); m.set(STEEL, .5, K.METAL).box([8.07, 0, 1.3], [.012, .012, 1.3]); m.set([255, 214, 150], .2, K.EMIT).box([8.6, 0, 2.86], [.3, .3, .03]);
    m.set(red ? [190, 44, 36] : [214, 178, 58], .1, K.PAINT, 0).box([10.2, 0, 3.05], [.015, 2.2, .16]);
    for (const s of [-1, 1]) bagLine(m, 10.1, s * 2.5, 10.1, s * 5.2, 5, 0);
    // perlengkapan atap
    for (const [x, y] of [[4.6, -3.5], [4.6, -1.1], [6.2, 3.8]]) { m.set(STEEL, .35, K.METAL).box([x, y, 7.92], [.72, .9, .4]); m.set(GM, .3, K.METAL).cyl([x, y, 8.32], [x, y, 8.34], .58, .58, 14); m.set([24, 24, 24], .1, K.PLAIN).box([x, y, 8.35], [.52, .03, .01]).box([x, y, 8.35], [.03, .52, .01]); }   // pendingin
    m.set([226, 228, 224], .35, K.PLAIN).sph([3.6, 3.3, 8.12], [1.25, 1.25, 1.25], 16, 6, { hemi: true }); m.set(GM, .3, K.METAL).cyl([3.6, 3.3, 7.52], [3.6, 3.3, 8.15], 1.1, 1.1, 14);   // kubah radar
    const mast = (x, y, h) => { m.set(STEEL, .45, K.METAL); for (const [p, q] of [[.28, 0], [-.14, .24], [-.14, -.24]]) m.cyl([x + p, y + q, 7.52], [x + p * .25, y + q * .25, 7.52 + h], .035, .02, 5); for (let i = 1; i < 6; i++) { const z = 7.52 + h * i / 6, k = 1 - .75 * i / 6; m.cyl([x + .28 * k, y, z], [x - .14 * k, y + .24 * k, z], .012, .012, 3); m.cyl([x - .14 * k, y + .24 * k, z], [x - .14 * k, y - .24 * k, z], .012, .012, 3); m.cyl([x - .14 * k, y - .24 * k, z], [x + .28 * k, y, z], .012, .012, 3); } };
    mast(-6.3, -4.3, 12); m.set([255, 50, 40], 0, K.EMIT).box([-6.27, -4.3, 19.6], [.08, .08, .08]);
    m.set([212, 212, 208], .3, K.PLAIN); m.push(X.chain(X.T(-6.25, -4.3, 15.6), X.ry(-1.1))); m.cyl([0, 0, 0], [.05, 0, 0], .1, .1, 8); m.cyl([.06, 0, 0], [.34, 0, 0], .1, .78, 16); m.pop();   // antena piring
    m.set(GM, .4, K.METAL).cyl([1.2, -4.8, 7.52], [1.2, -4.8, 12.5], .035, .012, 5);
    m.set(GM, .4, K.METAL).cyl([6.4, -4.8, 7.52], [6.4, -4.8, 16], .07, .05, 8); m.set(FL, .1, K.CLOTH).box([6.4, -3.82, 15.3], [.03, .95, .6]); if (!red) m.set([220, 40, 40], .1, K.CLOTH).box([6.41, -3.82, 15.6], [.03, .95, .3]);   // bendera
    // tembok bronjong keliling dengan gerbang di depan, menara jaga dua sudut
    hesco(m, -11.1, -10, 0, 22); hesco(m, -11.1, 10, 0, 22);
    hesco(m, -11.1, -9, 1.5708, 19);
    for (const s of [-1, 1]) hesco(m, 11.1, s * 9.5, s > 0 ? -1.5708 : 1.5708, 5);
    for (const s of [-1, 1]) {
      const x = -9.4, y = s * 8.3;
      m.set(GM, .35, K.METAL); for (const [p, q] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) m.cyl([x + p, y + q, .1], [x + p * .86, y + q * .86, 3.1], .05, .045, 5);
      m.set(WL.map(v => v * .86), .15, K.PAINT, 0).box([x, y, 3.2], [.82, .82, .08]); bagArc(m, x, y, .72, .72, 0, 6.2, 2, 3.28); m.set(OD, .05, K.CLOTH, 0).box([x, y, 4.6], [.95, .95, .05]);
      m.set(GM, .35, K.METAL); for (const [p, q] of [[-.75, -.75], [.75, -.75], [-.75, .75], [.75, .75]]) m.cyl([x + p, y + q, 3.28], [x + p, y + q, 4.58], .03, .03, 5);
    }
  }

  const OLD = MD.structure;
  MD.structure = function (type, team) {
    const B = { BNK: bunker, CAESAR: caesar, SAM: sam, HQ: command }[type];
    if (!B) return OLD(type, team);
    const m = new Mesh(); seed = 7 + type.length * 31; B(m, team === 'R'); return m.done();
  };
})();
