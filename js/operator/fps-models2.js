/* ============================================================
   FPS-MODELS2 — model generasi kedua (v2.4): tubuh prajurit anatomis
   + zirah melengkung, gerak berjalan/berlari/membidik yang manusiawi.
   Dimuat setelah fps-models.js dan menimpa MD.human & MD.humanPose.
   Tulang: 0 panggul · 1 badan · 2 kepala · 3/4 lengan kanan · 5/6 lengan kiri
   7/8 kaki kanan · 9/10 kaki kiri · 11 senjata · 12/13 telapak kanan/kiri
   Sumbu: +x depan, +y kanan, +z atas. Tungkai memanjang ke -z lokal.
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, MD = F.MDL;
  if (!MD) return;
  const K = MD.K, X = MD.X, Mesh = MD.Mesh, P = Mesh.prototype, { add, sub, mul, dot, crs, nrm } = MD.v;
  const lerp = (a, b, k) => a + (b - a) * k, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), TAU = 6.28318;

  /* ---------- primitif baru ---------- */
  /* permukaan dari cincin elips sepanjang z lokal: [z, rx, ry, ox, oy]; normal halus, tutup otomatis */
  P.ell = function (rings, n, o) {
    o = o || {}; const base = this.n, R = rings;
    for (let j = 0; j < R.length; j++) {
      const a = R[Math.max(0, j - 1)], b = R[Math.min(R.length - 1, j + 1)], q = R[j], dz = (b[0] - a[0]) || 1e-5, drx = (b[1] - a[1]) / dz, dry = (b[2] - a[2]) / dz, ox = q[3] || 0, oy = q[4] || 0;
      for (let i = 0; i <= n; i++) { const t = i / n * TAU, c = Math.cos(t), s = Math.sin(t); this.V([ox + c * q[1], oy + s * q[2], q[0]], nrm([c / Math.max(q[1], .001), s / Math.max(q[2], .001), -(c * c * drx / Math.max(q[1], .001) + s * s * dry / Math.max(q[2], .001))]), t, q[0]); }
    }
    for (let j = 0; j < R.length - 1; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i; this.quad(a, a + 1, a + n + 2, a + n + 1); }
    if (o.cap !== false) for (const [e, sg] of [[0, -1], [R.length - 1, 1]]) { const q = R[e], ox = q[3] || 0, oy = q[4] || 0, id = []; if (Math.min(q[1], q[2]) < .002) continue; for (let i = 0; i < n; i++) { const t = i / n * TAU; id.push(this.V([ox + Math.cos(t) * q[1], oy + Math.sin(t) * q[2], q[0]], [0, 0, sg])); } for (let i = 1; i < n - 1; i++) { if (sg > 0) this.tri(id[0], id[i], id[i + 1]); else this.tri(id[0], id[i + 1], id[i]); } }
    return this;
  };
  /* superelipsoid = kotak bersudut bulat dengan normal halus (kantong, pelat, pelindung); e 2 = bola, makin besar makin kotak */
  P.sq = function (c, h, e, n, m) {
    e = e || 4; n = Math.max(8, Math.ceil((n || 10) / 4) * 4); m = Math.max(4, Math.ceil((m || 5) / 2) * 2); const base = this.n, pw = (v, q) => Math.sign(v) * Math.pow(Math.abs(v), q), q = 2 / e;   // n kelipatan 4 & fase 45° agar sudut kotak selalu kena (dulu tesselasi rendah = bentuk berlian)
    for (let j = 0; j <= m; j++) {
      const ph = (-.5 + j / m) * Math.PI, cp = Math.cos(ph), sp = Math.sin(ph);
      for (let i = 0; i <= n; i++) {
        const t = (i / n + .125) * TAU, ct = Math.cos(t), st = Math.sin(t), d = [pw(ct, q) * pw(cp, q), pw(st, q) * pw(cp, q), pw(sp, q)];
        const g = [Math.sign(d[0]) * Math.pow(Math.abs(d[0]) + 1e-5, e - 1) / h[0], Math.sign(d[1]) * Math.pow(Math.abs(d[1]) + 1e-5, e - 1) / h[1], Math.sign(d[2]) * Math.pow(Math.abs(d[2]) + 1e-5, e - 1) / h[2]];
        this.V([c[0] + d[0] * h[0], c[1] + d[1] * h[1], c[2] + d[2] * h[2]], nrm(g), t, ph);
      }
    }
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i; this.quad(a, a + 1, a + n + 2, a + n + 1); }
    return this;
  };
  /* pelat melengkung menempel elips (cx,cy,rx,ry) dari sudut a0..a1 (0 = +x, π/2 = +y), z0..z1, tebal th; rz0/rz1: pengali radius bawah/atas agar mengikuti bentuk */
  P.plate = function (cx, cy, rx, ry, a0, a1, z0, z1, th, n, rz0, rz1) {
    n = n || 8; const k0 = rz0 === undefined ? 1 : rz0, k1 = rz1 === undefined ? 1 : rz1, pt = (a, z, off) => { const k = lerp(k0, k1, (z - z0) / ((z1 - z0) || 1)), c = Math.cos(a), s = Math.sin(a); return [cx + c * (rx * k + off), cy + s * (ry * k + off), z]; };
    const nr = a => nrm([Math.cos(a) / rx, Math.sin(a) / ry, 0]), id = [], JZ = 2;
    for (let j = 0; j <= JZ; j++) { const z = lerp(z0, z1, j / JZ); for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n), nn = nr(a); id.push(this.V(pt(a, z, th), [nn[0], nn[1], (k0 - k1) * .6 / ((z1 - z0) || 1) * rx], a * rx, z)); } }
    for (let j = 0; j < JZ; j++) for (let i = 0; i < n; i++) { const q = j * (n + 1) + i; this.quad(id[q], id[q + 1], id[q + n + 2], id[q + n + 1]); }
    const edge = (a, z, b, z2, nn) => { this.quad(this.V(pt(a, z, -.002), nn), this.V(pt(a, z, th), nn), this.V(pt(b, z2, th), nn), this.V(pt(b, z2, -.002), nn)); };
    for (let i = 0; i < n; i++) { const a = lerp(a0, a1, i / n), b = lerp(a0, a1, (i + 1) / n); edge(a, z1, b, z1, [0, 0, 1]); edge(a, z0, b, z0, [0, 0, -1]); }
    edge(a0, z0, a0, z1, nrm([Math.sin(a0), -Math.cos(a0), 0])); edge(a1, z0, a1, z1, nrm([-Math.sin(a1), Math.cos(a1), 0]));
    return this;
  };
  /* tabung bersudut antara dua titik: batang piston, kabel */
  P.rod = function (a, b, r, n) { return this.cyl(a, b, r, r, n || 6); };

  /* ---------- palet ---------- */
  const PAL2 = {
    B: { uni: [52, 60, 42], vest: [32, 38, 28], helm: [36, 42, 30], boot: [24, 22, 19], gl: [26, 26, 23], mask: [20, 21, 18], band: [70, 180, 240], lens: [150, 96, 28], lensE: 0 },
    US: { uni: [98, 86, 66], vest: [68, 60, 46], helm: [74, 66, 50], boot: [58, 48, 36], gl: [50, 44, 34], mask: [30, 29, 25], band: [70, 180, 240], lens: [140, 90, 30], lensE: 0 },
    R: { uni: [42, 42, 45], vest: [27, 27, 29], helm: [29, 29, 32], boot: [19, 19, 20], gl: [18, 18, 19], mask: [13, 13, 15], band: [190, 34, 28], lens: [255, 42, 22], lensE: 1 }
  };
  const dk = (c, k) => c.map(v => v * k);

  /* ---------- SENJATA (tulang 11: popor di x≈0; genggaman kanan [.2,0,-.07], tangan kiri [.46,0,-.01]) ---------- */
  function rifle(m, kit, type, hi) {
    const SF = type === 'SF', GM = [34, 35, 36], GD = [24, 24, 26], L = kit === 'DMR' ? 1.12 : kit === 'SMG' ? .64 : kit === 'MG' ? 1.02 : kit === 'SG' ? .84 : .86;
    const n = hi ? 8 : 5;
    m.bone(11).set(GM, .35, K.METAL);
    if (kit === 'SMG') {   // SMG ringkas: popor lipat rangka, badan pendek, magasin lurus
      m.sq([.03, 0, -.015], [.03, .02, .045], 4, 6, 3).rod([.03, 0, .012], [.14, 0, .02], .007, 4).rod([.03, 0, -.04], [.14, 0, -.02], .007, 4);
      m.sq([.255, 0, .012], [.13, .024, .038], 5, 8, 4); m.sq([.44, 0, .012], [.07, .022, .028], 4, 6, 3); m.cyl([.5, 0, .018], [L, 0, .018], .011, .011, n);
      m.set(GD, .2, K.PLAIN).sq([.205, 0, -.07], [.022, .015, .05], 4, 6, 3).sq([.32, 0, -.085], [.016, .014, .065], 5, 6, 3);
    } else {
      // popor: bantalan + badan menyempit ke kepalan (bukan kotak)
      m.set(GD, .2, K.PLAIN); m.push(X.ry(1.5708)); m.ell([[-.0, .05, .018], [-.05, .045, .021], [-.14, .026, .019]], n, {}); m.pop();
      m.set(GM, .35, K.METAL).sq([.26, 0, .012], [.135, .024, .04], 5, 8, 4);   // penerima
      m.sq([.255, 0, .056], [.12, .012, .007], 6, 6, 3);   // rel atas
      m.set(GD, .3, K.PLAIN).sq([.48, 0, .018], [.115, .026, .032], 5, 8, 4);   // pelindung tangan
      if (hi) { m.set(GM, .35, K.METAL); for (let i = 0; i < 5; i++) m.sq([.39 + i * .045, 0, .053], [.012, .012, .005], 4, 4, 2); }
      m.set(GM, .35, K.METAL).cyl([.59, 0, .025], [L, 0, .025], kit === 'SG' ? .017 : .0095, kit === 'SG' ? .017 : .0095, n);
      if (kit !== 'SG') m.cyl([L, 0, .025], [L + (SF ? .15 : .045), 0, .025], SF ? .021 : .016, SF ? .021 : .014, n);   // peredam (SF) / rem moncong
      m.set(GD, .2, K.PLAIN); m.push(X.chain(X.T(.2, 0, -.07), X.ry(-.32))); m.sq([0, 0, 0], [.021, .015, .05], 4, 6, 3); m.pop();   // pegangan pistol miring
      if (kit === 'SG') { m.set(GM, .35, K.METAL).cyl([.4, 0, -.014], [.78, 0, -.014], .015, .015, n); m.set([58, 46, 34], .15, K.PLAIN).sq([.56, 0, -.016], [.07, .023, .023], 4, 6, 3); }
      else if (kit === 'MG') { m.set(GM, .35, K.METAL).sq([.31, 0, -.1], [.065, .045, .055], 4, 6, 3); m.rod([.72, 0, -.01], [.8, .07, -.2], .006, 4).rod([.72, 0, -.01], [.8, -.07, -.2], .006, 4); }
      else if (kit !== 'RPG' || true) {   // magasin melengkung
        m.set(GD, .25, K.PLAIN).ext([[.272, -.025], [.335, -.025], [.352, -.09], [.385, -.165], [.33, -.19], [.296, -.1]], -.0135, .0135);
        
      }
      if (kit === 'DMR') { m.set([18, 20, 22], .6, K.METAL).cyl([.18, 0, .086], [.44, 0, .086], .026, .026, n).cyl([.42, 0, .086], [.48, 0, .086], .034, .03, n); m.set([20, 40, 70], .9, K.GLASS).cyl([.48, 0, .086], [.482, 0, .086], .029, .029, n); }
      else if (kit !== 'MG' && kit !== 'SG') { m.set([20, 20, 22], .4, K.METAL).sq([.25, 0, .082], [.028, .018, .02], 4, 6, 3); m.set(kit === 'GL' ? [200, 60, 30] : [60, 90, 120], .9, K.GLASS).sq([.285, 0, .082], [.004, .012, .012], 3, 4, 2); }   // optik
      if (kit === 'GL') { m.set(GM, .35, K.METAL).cyl([.36, 0, -.04], [.6, 0, -.04], .025, .025, n); m.sq([.33, 0, -.04], [.04, .026, .028], 4, 6, 3); }
    }
    if (kit === 'RPG') {   // peluncur roket tersandang menyilang di punggung
      m.bone(1).set([70, 76, 50], .15, K.PAINT, 0).cyl([-.24, .22, -.06], [-.24, -.16, .8], .045, .045, n);
      m.set([48, 52, 36], .2, K.PAINT).cyl([-.24, -.16, .8], [-.24, -.2, .92], .062, .02, n); m.bone(11).set(GM, .35, K.METAL);
    }
    return L;
  }

  /* ---------- TUBUH DASAR ---------- */
  function body(m, c, o) {
    // o: {hi, uni, pants, cam, armorK, noPack, ...}
    const hi = o.hi, N = hi ? 14 : 8, Nl = hi ? 12 : 7, cam = o.cam === undefined ? 2.2 : o.cam, uni = o.uni || c.uni, pants = o.pants || uni, vest = o.vest || c.vest;
    // panggul + sabuk
    m.bone(0).set(pants, .04, K.CLOTH, cam); m.ell([[-.135, .07, .085], [-.07, .102, .15], [.0, .112, .162], [.08, .103, .148], [.14, .09, .135]], N);
    m.set(dk(vest, .8), .1, K.CLOTH, 1); m.ell([[.055, .118, .17], [.105, .114, .163]], N, { cap: false });
    if (hi) m.set([70, 66, 52], .4, K.METAL).sq([.118, 0, .08], [.006, .025, .018], 4, 4, 2);
    m.set(vest, .05, K.CLOTH, 1).sq([.102, 0, -.03], [.024, .06, .075], 4, 8, 4);   // pelindung selangkang
    m.sq([.02, .172, .0], [.05, .03, .062], 4, 6, 3).sq([-.05, -.165, .0], [.045, .03, .056], 4, 6, 3);   // kantong pinggang
    if (hi) m.sq([-.115, .06, .02], [.03, .05, .05], 4, 6, 3);
    // badan
    m.bone(1).set(uni, .04, K.CLOTH, cam);
    m.ell([[-.05, .098, .14], [.05, .105, .145], [.16, .118, .16], [.27, .13, .178, .006], [.37, .128, .192, .004], [.435, .105, .172], [.49, .062, .09]], N);
    if (!o.noVest) {
      const A = o.armor || vest;
      m.set(dk(A, .9), .05, K.CLOTH, 1); m.ell([[.0, .118, .158], [.2, .13, .172]], N, { cap: false });   // sabuk rompi
      m.set(A, .12, K.PAINT, 0); m.plate(.006, 0, .13, .175, -1.05, 1.05, .15, .425, .025, hi ? 10 : 6, .94, .96);   // pelat dada
      m.plate(-.006, 0, .128, .17, 2.1, 4.18, .16, .43, .025, hi ? 10 : 6, .97, .92);   // pelat punggung
      m.set(dk(A, .82), .05, K.CLOTH, 1); for (const s of [1, -1]) { m.push(X.chain(X.T(0, s * .118, .447), X.rx(s * .32))); m.sq([0, 0, 0], [.135, .034, .013], 4, hi ? 8 : 5, 3); m.pop(); }   // tali bahu berbantal
      m.set(dk(A, .78), .05, K.CLOTH, 1); for (let i = -1; i <= 1; i++) { m.sq([.163, i * .07, .215], [.024, .032, .062], 4, hi ? 7 : 4, hi ? 4 : 2); if (hi) { m.set(dk(A, .62), .05, K.CLOTH, 1).sq([.183, i * .07, .262], [.006, .032, .016], 4, 4, 2); m.set(dk(A, .78), .05, K.CLOTH, 1); } }   // kantong magasin
      m.sq([.161, 0, .335], [.016, .075, .034], 4, hi ? 7 : 4, 2);   // kantong atas
      m.sq([.03, .185, .17], [.05, .022, .05], 4, 6, 2);   // kantong samping
      if (hi) { m.set(dk(A, .5), .3, K.PLAIN).sq([.16, -.1, .405], [.014, .026, .036], 4, 5, 2); m.rod([.17, -.1, .37], [.165, -.05, .31], .004, 3); }   // radio dada + kabel
    }
    // kerah berbantal
    m.set(dk(uni, .72), .05, K.CLOTH, 1); m.ell([[.455, .085, .1], [.5, .082, .09], [.535, .07, .074]], N, { cap: false });
    // kepala dibuat di luar (o.head)
    // lengan
    for (const [bu, bf, s] of [[3, 4, 1], [5, 6, -1]]) {
      m.bone(bu).set(uni, .04, K.CLOTH, cam); m.ell([[.04, .05, .055], [-.02, .071, .074], [-.12, .063, .066], [-.23, .05, .052], [-.3, .045, .047]], Nl);
      if (o.pauldron !== false) { const A = o.armor || vest; m.set(A, .12, K.PAINT, 0).sq([0, s * .015, -.022], [.078, .072, .06], 2.6, 10, 4); if (hi) m.set(dk(A, .7), .12, K.PAINT, 0).sq([0, s * .018, -.085], [.07, .062, .012], 3, 8, 4); }
      if (c.band && !o.noBand) m.set(c.band, .2, K.PLAIN).ell([[-.125, .066, .069], [-.098, .068, .071]], Nl, { cap: false });
      m.bone(bf).set(uni, .04, K.CLOTH, cam); m.ell([[.012, .045, .047], [-.06, .051, .053], [-.17, .041, .043], [-.228, .035, .037]], Nl);
      m.set(dk(vest, .75), .1, K.CLOTH, 1).sph([-.018, 0, -.005], [.046, .05, .042], hi ? 8 : 5, hi ? 4 : 2);   // pelindung siku
      m.set(c.gl, .1, K.CLOTH, 0).ell([[-.2, .038, .04], [-.245, .036, .039]], hi ? 8 : 5, { cap: false }).sq([.003, 0, -.283], [.027, .043, .05], 3.2, hi ? 8 : 5, hi ? 4 : 2);
      if (hi) { m.sq([.024, 0, -.322], [.022, .04, .022], 3, 6, 3); m.sq([.028, s * .034, -.265], [.015, .014, .03], 3, 5, 2); }
    }
    // kaki
    for (const [bt, bs, bf, s] of [[7, 8, 12, 1], [9, 10, 13, -1]]) {
      m.bone(bt).set(pants, .04, K.CLOTH, cam); m.ell([[.04, .08, .085], [-.04, .104, .097], [-.17, .096, .085], [-.32, .074, .068], [-.44, .058, .056]], Nl);
      m.set(dk(pants, .86), .04, K.CLOTH, cam).sq([-.005, s * .09, -.23], [.05, .022, .064], 4, hi ? 7 : 4, 2);   // kantong kargo
      m.set(dk(vest, .7), .12, K.PAINT, 0).sq([.052, 0, -.44], [.026, .058, .07], 3, hi ? 8 : 5, hi ? 4 : 3);   // pelindung lutut
      if (hi) m.set(dk(vest, .5), .05, K.CLOTH, 1).ell([[-.41, .065, .062], [-.385, .068, .065]], 8, { cap: false });
      m.bone(bs).set(pants, .04, K.CLOTH, cam); m.ell([[.0, .055, .054], [-.085, .063, .058], [-.2, .056, .05], [-.32, .043, .04], [-.43, .04, .038]], Nl);
      m.set(c.boot, .15, K.PLAIN).ell([[-.29, .05, .046], [-.43, .05, .046]], hi ? 9 : 6, { cap: false });   // batang sepatu
      if (hi) { m.set(dk(c.boot, .7), .1, K.PLAIN); for (let i = 0; i < 3; i++) m.sq([.048, 0, -.33 - i * .032], [.004, .02, .004], 3, 3, 1); }
      m.bone(bf).set(c.boot, .15, K.PLAIN).sq([.055, 0, -.017], [.115, .05, .032], 3, hi ? 10 : 6, hi ? 4 : 2);
      m.sph([.0, 0, .0], [.05, .046, .03], hi ? 7 : 4, 2);
      m.set(dk(c.boot, .55), .1, K.PLAIN).sq([.055, 0, -.047], [.122, .054, .008], 5, hi ? 8 : 5, 2);
    }
  }
  /* helm balistik + masker gas + kacamata (referensi: pasukan lapis baja bermasker) */
  function headArmored(m, c, o) {
    const hi = o.hi, N = hi ? 14 : 8, helm = o.helm || c.helm;
    m.bone(2).set(c.mask, .1, K.PLAIN).ell([[-.05, .052, .052, -.01], [.06, .05, .05, -.01]], hi ? 8 : 5, { cap: false });
    m.set(c.mask, .1, K.CLOTH, 1).sph([-.004, 0, .14], [.094, .084, .108], N, hi ? 7 : 4);   // tudung
    m.set(helm, .14, K.PAINT, 0).sph([-.006, 0, .155], [.122, .114, .108], N, hi ? 6 : 3, { hemi: true }); m.ell([[.118, .118, .11, -.008], [.16, .122, .114, -.006]], N, { cap: false });
    if (hi) {
      m.set(dk(helm, .78), .14, K.PAINT, 0); for (const s of [1, -1]) m.sq([-.004, s * .114, .166], [.058, .009, .014], 4, 6, 2);   // rel samping
      m.sq([.108, 0, .216], [.018, .03, .024], 4, 6, 3);   // dudukan NVG
      m.set([26, 26, 24], .1, K.PLAIN); for (const s of [1, -1]) m.rod([-.01, s * .09, .13], [.05, s * .07, .035], .005, 3);   // tali dagu
    }
    // masker: pipi, moncong respirator + filter samping
    m.set(c.mask, .22, K.PLAIN); m.push(X.ry(1.5708)); m.ell([[.04, .05, .06, -.085], [.09, .036, .044, -.085], [.135, .024, .028, -.085]], hi ? 10 : 6); m.pop();
    if (hi) { m.set(dk(c.mask, .7), .3, K.METAL).cyl([.13, 0, .083], [.145, 0, .083], .026, .026, 8); for (const s of [1, -1]) { m.set(c.mask, .2, K.PLAIN).cyl([.05, s * .05, .075], [.085, s * .1, .058], .03, .033, 8); m.set(dk(c.mask, .6), .3, K.METAL).cyl([.085, s * .1, .058], [.088, s * .105, .057], .029, .029, 8); } }
    // kacamata: bingkai + dua lensa (musuh: menyala merah)
    m.set(dk(c.mask, .85), .2, K.PLAIN).sq([.08, 0, .15], [.026, .082, .03], 4, hi ? 8 : 5, 2);
    m.set(c.lens, c.lensE ? 0 : .95, c.lensE ? K.EMIT : K.GLASS); for (const s of [1, -1]) m.sq([.104, s * .037, .15], [.006, .029, .024], 3, hi ? 7 : 4, 2);
  }
  /* balaclava pemain: wajah tertutup kain gelap, celah mata, headset (orisinal, tanpa motif tengkorak) */
  function headOperator(m, c, o) {
    const hi = o.hi, N = hi ? 14 : 8, BK = [20, 20, 22];
    m.bone(2).set(BK, .04, K.CLOTH, 1).ell([[-.05, .056, .056, -.01], [.07, .05, .05, -.01]], hi ? 8 : 5, { cap: false });
    m.sph([-.006, 0, .14], [.098, .087, .114], N, hi ? 8 : 4); m.sph([.036, 0, .075], [.068, .066, .064], hi ? 10 : 6, hi ? 5 : 3);   // tengkorak + rahang
    if (hi) { m.sph([.09, 0, .118], [.022, .015, .026], 6, 3); for (const s of [1, -1]) m.sph([-.008, s * .083, .124], [.018, .012, .026], 5, 3); }
    m.set([62, 50, 42], .08, K.SKIN).sq([.076, 0, .153], [.018, .06, .017], 4, hi ? 8 : 5, 2);   // celah mata
    if (hi) { m.set([12, 12, 12], .3, K.PLAIN); for (const s of [1, -1]) m.sq([.092, s * .03, .154], [.004, .014, .008], 3, 5, 2); m.set([14, 14, 14], .05, K.CLOTH, 1).sq([.09, 0, .172], [.012, .06, .007], 3, 6, 2); }   // mata & alis gelap
    m.set([30, 31, 32], .35, K.PLAIN); for (const s of [1, -1]) m.cyl([-.012, s * .085, .13], [-.012, s * .112, .13], .04, .036, hi ? 10 : 6);   // headset
    { const q = hi ? 8 : 4; for (let i = 0; i < q; i++) { const a = (i / q - .5) * Math.PI, b = ((i + 1) / q - .5) * Math.PI; m.rod([-.012, Math.sin(a) * .1, .13 + Math.cos(a) * .118], [-.012, Math.sin(b) * .1, .13 + Math.cos(b) * .118], .009, 4); } }
    if (hi) m.rod([-.012, .1, .1], [.075, .065, .07], .004, 3);
    // kain tudung jatuh ke leher & bahu
    m.set(BK, .04, K.CLOTH, 1).ell([[-.075, .105, .11, -.012], [-.015, .082, .084, -.012], [.05, .07, .07, -.01]], hi ? 10 : 6, { cap: false });
  }

  /* jubah koyak: beberapa helai terpisah melengkung mengikuti punggung, ada celah di antaranya (bukan papan rata) */
  function cape(m, hs, zTop, xB) {
    for (const [y, zb, w] of hs) {
      const lv = [[zTop, 0], [zTop - .28, .05], [lerp(zTop - .28, zb, .5), .1], [zb + .12, .13], [zb, .11]], yw = [w * .85, w * 1.05, w * 1.1, w * 1.0, w * .5];
      let prev = null;
      for (let i = 0; i < lv.length; i++) {
        const z = lv[i][0], x = xB - lv[i][1] - Math.abs(y) * .08, yc = y * (1 + i * .05), a = [x, yc - yw[i], z], b = [x + .018, yc, z - .01], c = [x, yc + yw[i], z];
        if (prev) { for (const [p, q, r2, t] of [[prev[0], prev[1], b, a], [prev[1], prev[2], c, b]]) { m.face([p, q, r2, t], nrm([-1, 0, .12])); m.face([q, p, t, r2], nrm([1, 0, -.12])); } }
        prev = [a, b, c];
      }
    }
  }

  /* ---------- MD.human baru ---------- */
  const OLD_HUMAN = MD.human;
  MD.human = function (palK, kit, type, lod) {
    const hi = !lod, m = new Mesh(), c0 = PAL2[palK] || PAL2.B;
    if (type === 'CMDR') return shadowCommander(m, hi);
    if (type === 'WARLORD') return warlord(m, hi);
    if (type === 'CLAY') return clay(m, hi);
    if (type === 'OPR') {   // karakter pemain: seragam hitam-arang berkamuflase, rompi pelat rendah, tanpa helm
      const c = Object.assign({}, c0, { boot: [28, 26, 24], gl: [26, 26, 28], band: null });
      body(m, c, { hi, uni: [46, 48, 50], pants: [42, 44, 44], vest: [21, 22, 23], armor: [24, 25, 26], cam: 3.2, pauldron: false, noBand: true });
      headOperator(m, c, { hi });
      if (hi) { m.bone(0).set([24, 24, 26], .08, K.CLOTH, 1).sq([.03, .185, -.09], [.05, .022, .085], 4, 6, 3); m.bone(7).set([24, 24, 26], .08, K.CLOTH, 1).sq([.0, .1, -.14], [.05, .026, .08], 4, 6, 3); m.rod([.02, .08, -.04], [.02, .1, -.08], .006, 3); m.bone(9).set([24, 24, 26], .08, K.CLOTH, 1).sq([.0, -.1, -.14], [.044, .024, .07], 4, 6, 3); m.bone(1).set([60, 58, 46], .2, K.METAL).cyl([.17, .135, .33], [.17, .135, .4], .022, .022, 7); m.bone(1).set([40, 40, 42], .05, K.CLOTH, 1).sq([-.17, 0, .29], [.045, .11, .13], 4, 7, 3); }
      rifle(m, 'RIF', 'OPR', hi);
      return m.done();
    }
    const c = c0, SF = type === 'SF', hv = type === 'AT' || type === 'MORT' || kit === 'MG';
    const uni = SF ? dk(c.uni, .7) : c.uni, vest = SF ? [20, 21, 22] : c.vest;
    body(m, c, { hi, uni, vest, armor: SF ? [24, 25, 26] : c.vest });
    headArmored(m, c, { hi, helm: SF ? [22, 23, 24] : c.helm });
    if (SF && hi) { m.bone(2).set([18, 18, 20], .45, K.METAL).sq([.13, 0, .205], [.024, .05, .022], 4, 6, 2); m.set([60, 200, 90], 0, K.EMIT); for (const s of [1, -1]) m.cyl([.152, s * .026, .2], [.156, s * .026, .2], .013, .013, 6); }   // NVG naik di helm
    // perlengkapan punggung
    m.bone(1).set(dk(vest, .9), .05, K.CLOTH, 1);
    if (type === 'MEDIC') { m.set([210, 210, 204], .1, K.CLOTH, 1).sq([-.2, 0, .27], [.062, .135, .16], 4, 8, 3); m.set([200, 32, 30], .1, K.PLAIN).sq([-.262, 0, .28], [.004, .09, .028], 4, 4, 1).sq([-.262, 0, .28], [.004, .028, .09], 4, 4, 1); }
    else if (hv || kit === 'RTO' || kit === 'RPG') { m.sq([-.195, 0, .27], [.066, .13, .16], 4, 8, 3); m.sq([-.2, 0, .46], [.04, .12, .036], 3, 8, 2); if (kit === 'RTO') { m.set([26, 26, 28], .3, K.PLAIN).rod([-.22, .09, .4], [-.24, .1, 1.02], .004, 3); } }
    else { m.sq([-.17, 0, .29], [.045, .11, .125], 4, 7, 3); if (hi) { m.set(c.mask, .25, K.METAL).cyl([-.195, -.09, .33], [-.195, -.09, .52], .036, .036, 8); m.set(dk(c.mask, .6), .3, K.METAL).cyl([-.195, -.09, .52], [-.195, -.09, .545], .022, .022, 6); } }   // tabung napas bahu kiri
    // senjata
    m.bone(11);
    if (type === 'AT') { m.set([70, 76, 50], .15, K.PAINT, 0).cyl([-.35, 0, .03], [.65, 0, .03], .046, .046, hi ? 10 : 6); m.set([34, 36, 34], .3, K.METAL).cyl([.65, 0, .03], [.72, 0, .03], .056, .05, hi ? 10 : 6).sq([.2, 0, -.05], [.022, .015, .045], 4, 5, 2).sq([.46, 0, -.03], [.02, .014, .03], 4, 5, 2).sq([.2, -.055, .09], [.05, .012, .024], 4, 5, 2); }
    else if (type === 'MORT') { m.set([66, 70, 60], .3, K.METAL).cyl([-.1, 0, .0], [.74, 0, .0], .042, .042, hi ? 8 : 5).sq([.2, 0, -.06], [.02, .015, .03], 4, 4, 2).sq([.46, 0, -.04], [.02, .015, .03], 4, 4, 2); }
    else if (type === 'MEDIC') { m.set([34, 35, 36], .3, K.METAL).sq([.13, 0, -.005], [.11, .017, .036], 4, 6, 3).sq([.2, 0, -.07], [.02, .013, .045], 4, 5, 2).sq([.3, 0, .0], [.04, .012, .012], 4, 4, 1); m.sq([.46, 0, -.03], [.02, .012, .012], 4, 3, 1); }
    else rifle(m, kit, type, hi);
    return m.done();
  };
  MD.human.old = OLD_HUMAN;

  /* ---------- KOMANDAN BAYANGAN: rangka eksoskeleton hitam, jubah terkoyak, tudung, satu celah sensor merah ---------- */
  function shadowCommander(m, hi) {
    const c = { uni: [26, 27, 30], vest: [18, 18, 21], boot: [14, 14, 16], gl: [16, 16, 18], band: null }, AR = [36, 38, 44], A2 = [22, 23, 27], RD = [255, 34, 22], N = hi ? 14 : 8;
    body(m, c, { hi, cam: 1, armor: AR, noBand: true, pauldron: false });
    // pelat dada berlapis & tulang belakang reaktor
    m.bone(1).set(AR, .5, K.METAL); m.plate(.012, 0, .14, .185, -.95, .95, .28, .44, .018, hi ? 10 : 6, 1, .9); m.plate(.012, 0, .135, .17, -.7, .7, .1, .27, .018, hi ? 8 : 5, .92, 1);
    m.set(A2, .4, K.METAL).sq([-.17, 0, .31], [.04, .05, .16], 4, 6, 3); for (let i = 0; i < 5; i++) m.sq([-.208, 0, .17 + i * .07], [.014, .036, .022], 3, 5, 2);
    m.set(RD, 0, K.EMIT); for (let i = 0; i < 5; i++) m.sq([-.223, 0, .17 + i * .07], [.003, .016, .006], 3, 4, 1);
    m.sq([.172, 0, .35], [.004, .03, .007], 3, 4, 1);
    // bahu ramping bersudut + piston lengan & kaki
    for (const [b, f, s] of [[3, 4, 1], [5, 6, -1]]) {
      m.bone(1).set(AR, .5, K.METAL); m.push(X.chain(X.T(0, s * .2, .46), X.rx(s * .32))); m.sq([0, 0, 0], [.105, .092, .05], 3, hi ? 10 : 6, 3); m.set(A2, .4, K.METAL).sq([.01, s * .005, .042], [.07, .06, .016], 3, 6, 2); m.set(RD, 0, K.EMIT).sq([.106, 0, 0], [.004, .03, .01], 3, 3, 1); m.pop(); m.bone(b);
      m.set(A2, .45, K.METAL).rod([.05, s * .05, -.03], [.05, s * .05, -.26], .009, 5); m.bone(f).set(A2, .45, K.METAL).rod([-.045, s * .03, -.02], [-.045, s * .03, -.2], .008, 5).set(AR, .5, K.METAL).ell([[-.1, .05, .052], [-.21, .042, .044]], N >> 1, { cap: false });
    }
    for (const [t, sh, s] of [[7, 8, 1], [9, 10, -1]]) {
      m.bone(t).set(AR, .5, K.METAL).plate(.0, 0, .09, .085, -.9, 1.0, -.3, -.04, .012, hi ? 8 : 5, .82, 1); m.set(A2, .45, K.METAL).rod([-.06, s * .09, -.02], [-.06, s * .08, -.4], .011, 5);
      m.bone(sh).set(AR, .5, K.METAL).plate(.0, 0, .058, .052, -.9, .9, -.27, -.05, .012, hi ? 8 : 5, .84, 1); m.set(A2, .45, K.METAL).rod([-.05, s * .05, -.05], [-.04, s * .045, -.3], .009, 5);
    }
    // kepala: tudung runcing di atas topeng baja, satu celah merah
    m.bone(2).set([14, 14, 16], .05, K.CLOTH, 1).ell([[-.04, .06, .06, -.01], [.07, .05, .05, -.01]], 8, { cap: false });
    m.set(A2, .55, K.METAL).sq([.012, 0, .135], [.092, .08, .112], 3, N, hi ? 6 : 3); m.set(AR, .55, K.METAL); m.push(X.ry(.2)); m.sq([.07, 0, .085], [.035, .07, .065], 3, hi ? 8 : 5, 3); m.pop();
    m.set(RD, 0, K.EMIT).sq([.1, 0, .155], [.008, .068, .007], 3, 6, 1);
    if (hi) { m.set(A2, .4, K.METAL); for (const z of [.055, .08, .105]) m.sq([.116, 0, z], [.003, .03, .004], 3, 3, 1); }
    m.set([12, 12, 14], .03, K.CLOTH, 1); m.push(X.chain(X.T(-.03, 0, 0), X.ry(.12))); m.ell([[-.03, .122, .116], [.08, .114, .106], [.165, .106, .096], [.222, .08, .072, -.008], [.252, .03, .026, -.02]], N, {}); m.pop();   // tudung
    // jubah terkoyak: panel kain berjenjang, ujung tidak rata
    m.bone(1).set([10, 10, 12], .02, K.CLOTH, 1);
    cape(m, [[-.16, -.34, .058], [-.055, -.5, .056], [.055, -.42, .056], [.16, -.3, .058]], .47, -.17);
    rifle(m, 'MG', 'SF', hi); m.bone(11).set([24, 24, 26], .4, K.METAL).cyl([.36, 0, -.075], [.66, 0, -.075], .03, .03, hi ? 8 : 5); m.set(RD, 0, K.EMIT).sq([.3, .026, .03], [.05, .002, .005], 3, 3, 1);
    return m.done();
  }

  /* ---------- SANG JENDERAL: raksasa berzirah bermahkota tanduk, topeng tengkorak baja, bahu berduri, jubah koyak, minigun ---------- */
  /* ---------- SANG JENDERAL (referensi pengguna): panglima zirah sisik hitam-merah, rambut putih panjang, topeng besi, jubah koyak berujung bara,
     cincin api + bilah menyala di punggung, pedang panjang & pedang lengkung.
     Tulang tambahan: 14/15 jubah bawah kiri/kanan · 16 rambut · 17 cincin api · 18 kain tengah (ditulis MD.humanPose, tertinggal mengikuti gerak) */
  const stripF = (m, a, b, c, d, n) => { m.face([a, b, c, d], n); m.face([b, a, d, c], mul(n, -1)); };
  /* helai bermata tajam: lintasan pts [[x,y,z,lebar]...], melebar di y (sumbu w); warna per ruas lewat col(i, n) */
  function tatter(m, pts, w, col, flat) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], ax = w || [0, 1, 0], d = nrm(sub(q, p)), nn = nrm(crs(ax, d)), wa = p[3] * .5, wb = q[3] * .5;
      if (col) col(i, pts.length - 1);
      const A = [p[0] - ax[0] * wa, p[1] - ax[1] * wa, p[2] - ax[2] * wa], B = [p[0] + ax[0] * wa, p[1] + ax[1] * wa, p[2] + ax[2] * wa], C = [q[0] + ax[0] * wb, q[1] + ax[1] * wb, q[2] + ax[2] * wb], D = [q[0] - ax[0] * wb, q[1] - ax[1] * wb, q[2] - ax[2] * wb];
      stripF(m, A, B, C, D, flat ? flat : nn);
    }
  }
  /* sisik: baris selang-seling menempel elips */
  function scales(m, cx, cy, rx, ry, a0, a1, z0, z1, rows, cols, cA, cB, mat) {
    for (let r = 0; r < rows; r++) {
      const z = lerp(z1, z0, r / (rows - 1 || 1)), dz = (z1 - z0) / (rows - 1 || 1) * .85, off = r % 2 ? .5 : 0;
      for (let i = 0; i < cols; i++) {
        const a = lerp(a0, a1, (i + off) / cols), da = (a1 - a0) / cols * .62, pt = (t, zz, o) => [cx + Math.cos(t) * (rx + o), cy + Math.sin(t) * (ry + o), zz], nn = nrm([Math.cos(a) / rx, Math.sin(a) / ry, .25]);
        m.set(i % 3 === 0 ? cB : cA, .55, mat === undefined ? K.METAL : mat); m.face([pt(a - da, z + dz * .15, .003), pt(a, z - dz * 1.05, .012), pt(a + da, z + dz * .15, .003), pt(a, z + dz * .55, -.001)], nn);
      }
    }
  }
  /* gradasi api halus: 0 merah gelap → oranye → emas → putih panas */
  const FIRE = [[0, [96, 22, 8]], [.3, [226, 72, 12]], [.62, [255, 138, 28]], [.85, [255, 196, 88]], [1, [255, 238, 176]]];
  const fireC = f => { f = clamp(f, 0, 1); for (let i = 1; i < FIRE.length; i++) if (f <= FIRE[i][0]) { const a = FIRE[i - 1], b = FIRE[i], t = (f - a[0]) / (b[0] - a[0]); return [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t)]; } return FIRE[4][1]; };
  function warlord(m, hi) {
    const BK = [17, 15, 17], IR = [33, 29, 31], SL = [66, 58, 58], GD = [190, 142, 56], DG = [104, 74, 34], RO = [214, 66, 18], RD = [150, 22, 16], DR = [78, 12, 12], EM = [255, 92, 18], HT = [255, 190, 80], WT = [255, 244, 190], SK = [120, 62, 54], HW = [222, 224, 232], HG = [150, 152, 164], N = hi ? 16 : 9, Nl = hi ? 12 : 7;
    /* --- badan: pinggang ramping, dada bidang --- */
    m.bone(0).set([26, 18, 20], .1, K.CLOTH, 1).ell([[-.135, .068, .085], [-.07, .098, .14], [.0, .108, .15], [.08, .098, .135], [.14, .085, .118]], N);
    m.set(GD, .75, K.METAL).ell([[.05, .116, .158], [.118, .106, .146]], N, { cap: false });
    m.set(BK, .5, K.METAL).ell([[.06, .12, .162], [.1, .112, .153]], N, { cap: false });
    m.set(GD, .8, K.METAL).cyl([.12, 0, .082], [.15, 0, .082], .062, .054, hi ? 14 : 8); if (hi) { m.set(DG, .7, K.METAL); for (const s of [1, -1]) { m.sq([.122, s * .082, .082], [.016, .024, .03], 3, 6, 2); m.sq([.11, s * .118, .07], [.014, .016, .022], 3, 5, 2); } }
    m.set(HT, 0, K.EMIT).sph([.152, 0, .082], [.014, .026, .026], hi ? 8 : 5, 3); m.set([255, 40, 20], 0, K.EMIT).sph([.16, 0, .082], [.009, .017, .017], 6, 3);
    m.bone(1).set(RO, .25, K.METAL); m.ell([[-.05, .086, .118], [.06, .086, .118], [.2, .108, .158], [.33, .122, .192], [.41, .112, .18], [.47, .072, .094]], N);
    if (hi) scales(m, .006, 0, .112, .15, -.62, .62, .02, .34, 9, 9, [226, 82, 22], [160, 40, 14], K.PAINT);
    // rusuk zirah hitam membuka di tengah (dada sisik merah terlihat), dada atas & kerah
    m.set(IR, .6, K.METAL); for (const s of [1, -1]) { const a0 = s > 0 ? .62 : -1.72, a1 = s > 0 ? 1.72 : -.62; m.plate(.006, 0, .12, .165, a0, a1, .0, .36, .024, hi ? 8 : 5, .82, 1.02); }
    m.plate(.012, 0, .128, .19, -1.5, 1.5, .33, .47, .026, hi ? 12 : 7, 1.02, .78); m.plate(-.006, 0, .12, .17, 1.72, 4.56, -.03, .46, .026, hi ? 10 : 6, .84, .94);
    m.set(GD, .8, K.METAL).plate(.012, 0, .128, .19, -1.5, 1.5, .328, .342, .03, hi ? 12 : 7, 1.02, 1); for (const s of [1, -1]) m.plate(.006, 0, .12, .165, s > 0 ? .6 : -.66, s > 0 ? .66 : -.6, .02, .34, .03, 2, .84, 1.02);
    // hiasan kepala naga di dada: lempeng perunggu runcing + mata merah
    m.set(DG, .7, K.METAL); m.face([[.158, -.05, .445], [.158, .05, .445], [.178, .0, .3]], nrm([1, 0, .1])); for (const s of [1, -1]) m.face([[.152, s * .05, .445], [.152, s * .13, .47], [.168, s * .016, .36]], nrm([1, s * .12, .1])); m.set([255, 40, 20], 0, K.EMIT).sph([.172, 0, .39], [.006, .012, .012], 5, 2);
    m.set(BK, .5, K.METAL).ell([[.455, .085, .1], [.52, .074, .08], [.555, .068, .07]], N, { cap: false });
    /* --- lengan: kanan = daging merah tua + bahu tertutup jubah, kiri = bahu tanduk --- */
    for (const [bu, bf, s] of [[3, 4, 1], [5, 6, -1]]) {
      m.bone(bu).set(SK, .12, K.SKIN).ell([[.04, .05, .054], [-.02, .072, .074], [-.12, .066, .066], [-.23, .05, .052], [-.3, .044, .046]], Nl);
      if (hi) m.set([96, 48, 42], .1, K.SKIN).sph([.016, s * .012, -.13], [.04, .046, .075], 8, 4);
      m.set(BK, .55, K.METAL).ell([[-.24, .058, .06], [-.3, .052, .054]], Nl, { cap: false });
      m.bone(bf).set(IR, .6, K.METAL).ell([[.012, .05, .052], [-.06, .058, .06], [-.17, .05, .052], [-.235, .04, .043]], Nl);
      m.set(GD, .8, K.METAL).ell([[-.205, .054, .057], [-.222, .052, .055]], Nl, { cap: false }).ell([[-.035, .06, .062], [-.05, .061, .063]], Nl, { cap: false });
      m.set(DR, .3, K.CLOTH, 1).ell([[-.1, .06, .062], [-.16, .054, .056]], Nl, { cap: false });
      m.set(BK, .55, K.METAL); { const H = [[.0, s * .05, -.06], [-.05, s * .1, -.1], [-.14, s * .135, -.12], [-.24, s * .13, -.08], [-.33, s * .09, .01]], Ra = [.04, .034, .024, .012, .001]; for (let i = 0; i < 4; i++) m.cyl(H[i], H[i + 1], Ra[i], Ra[i + 1], hi ? 7 : 4); }   // tanduk siku besar melengkung
      m.set([18, 15, 16], .4, K.METAL).sq([.004, 0, -.285], [.032, .05, .052], 3, hi ? 9 : 6, 3); m.sq([.03, 0, -.325], [.026, .046, .024], 3, 6, 3); if (hi) { m.set(GD, .8, K.METAL).sq([-.03, 0, -.275], [.008, .036, .034], 3, 4, 2); m.set(DR, .3, K.PLAIN).sq([.036, s * .036, -.268], [.014, .012, .026], 3, 4, 2); }
    }
    /* --- bahu kiri: pelat bertingkat + tanduk tinggi melengkung & cincin emas (dipasang di badan agar tidak ikut lengan) --- */
    m.bone(1); m.push(X.chain(X.T(0, -.235, .455), X.rx(-.34)));
    m.set(BK, .6, K.METAL).sq([0, 0, 0], [.135, .115, .09], 2.6, N, hi ? 7 : 4); m.set(IR, .6, K.METAL).sq([0, -.02, .052], [.105, .09, .056], 2.6, hi ? 12 : 7, 3); m.set(GD, .85, K.METAL).ell([[-.07, .126, .107], [-.052, .13, .11]], N, { cap: false });
    m.set(GD, .85, K.METAL); { const q = hi ? 12 : 6; for (let i = 0; i < q; i++) { const a = i / q * TAU, b = (i + 1) / q * TAU; m.rod([.05 + Math.cos(a) * .058, -.135, -.06 + Math.sin(a) * .058], [.05 + Math.cos(b) * .058, -.135, -.06 + Math.sin(b) * .058], .011, 5); } }
    m.set(BK, .6, K.METAL); { const H = [[-.03, -.05, .08], [-.06, -.13, .2], [-.05, -.2, .34], [.0, -.22, .47], [.07, -.18, .6]], Ra = [.058, .044, .03, .017, .001]; for (let i = 0; i < 4; i++) m.cyl(H[i], H[i + 1], Ra[i], Ra[i + 1], hi ? 8 : 5); }
    m.pop();
    // pauldron depan bawah kiri
    m.set(IR, .6, K.METAL).sq([.03, -.27, .36], [.09, .06, .06], 3, hi ? 9 : 6, 3); m.set(GD, .8, K.METAL).sq([.03, -.29, .315], [.082, .05, .009], 3, 7, 2);
    /* --- mantel: gulungan kain di bahu kanan & punggung, jatuh ke depan menutupi bahu kanan --- */
    m.set(BK, .05, K.CLOTH, 1); m.plate(-.02, .0, .16, .23, 1.0, 5.0, .02, .475, .022, hi ? 14 : 8, 1.25, .88); m.sq([.0, .225, .465], [.12, .105, .075], 2.4, N, hi ? 6 : 4); m.sq([-.09, -.17, .47], [.09, .075, .05], 2.4, hi ? 10 : 6, 3);
    [[.13, .13, .48, .07, -.46, [22, 19, 23]], [.15, .2, .49, .075, -.56, [32, 28, 33]], [.135, .265, .47, .07, -.4, [20, 18, 22]]].forEach(([x, y, z, w, zb, col]) => { m.set(col, .05, K.CLOTH, 1); tatter(m, [[x, y * .88, z, w], [x + .04, y, lerp(z, zb, .25), w * 1.25], [x + .05, y * 1.04, lerp(z, zb, .55), w * 1.3], [x + .035, y * 1.08, lerp(z, zb, .85), w * .9], [x + .03, y * 1.1, zb, .006]], [0, 1, 0]); });
    /* --- rambut: tudung atas di kepala + helai panjang di tulang 16 --- */
    m.bone(2).set([150, 118, 110], .12, K.SKIN).ell([[-.05, .05, .05, -.01], [.07, .046, .046, -.01]], hi ? 8 : 5, { cap: false }); m.sph([-.004, 0, .14], [.092, .08, .108], N, hi ? 7 : 4);
    // topeng besi: menutup hidung sampai dagu, garis vertikal, tepi perunggu; mata sipit menyala
    m.set([26, 16, 18], .75, K.METAL); m.push(X.ry(.1)); m.sq([.058, 0, .082], [.05, .074, .082], 3, hi ? 12 : 7, hi ? 5 : 3); m.pop();
    if (hi) { m.set(DG, .7, K.METAL); m.sq([.107, 0, .142], [.006, .05, .006], 3, 6, 2); for (let i = -2; i <= 2; i++) m.sq([.108, i * .016, .068], [.004, .004, .034], 3, 3, 1); m.set([70, 16, 12], .5, K.METAL).sq([.113, 0, .106], [.005, .007, .02], 3, 3, 2); }
    m.set([8, 6, 8], .1, K.PLAIN); for (const s of [1, -1]) m.sq([.083, s * .036, .163], [.008, .024, .01], 3, 5, 1);
    m.set([255, 42, 16], 0, K.EMIT); for (const s of [1, -1]) { m.push(X.chain(X.T(.09, s * .036, .165), X.rx(s * .32))); m.sq([0, 0, 0], [.003, .02, .0052], 3, 4, 1); m.pop(); }
    m.set(HW, .3, K.PLAIN); m.ell([[.1, .006, .004, -.075], [.14, .07, .088, -.05], [.2, .092, .097, -.03], [.25, .094, .09, -.022], [.285, .07, .066, -.016], [.3, .032, .03, -.012]], N);
    // poni terbelah di tengah, helai jatuh menutupi sisi wajah sampai dada
    for (const s of [1, -1]) { m.set(HW, .3, K.PLAIN); tatter(m, [[.082, s * .012, .262, .05], [.097, s * .066, .2, .07], [.083, s * .09, .11, .062], [.064, s * .092, -.01, .05], [.075, s * .096, -.14, .032], [.09, s * .1, -.26, .002]], nrm([.3, s, 0])); }
    m.bone(16); { const hs = hi ? [[0, .95, .13], [-.055, .86, .11], [.055, .9, .11], [-.1, .74, .085], [.1, .78, .085], [-.03, .7, .08], [.03, .66, .08]] : [[0, .9, .22], [-.08, .78, .12], [.08, .78, .12]]; hs.forEach(([y, L, w], i) => { const pts = [[-.09, y * .7, .2, w * .7], [-.135, y * .95, .05, w], [-.15, y, -.18, w * 1.05], [-.145, y * 1.02, -.42, w * .85], [-.13, y * 1.05, .2 - L, w * .55], [-.12, y * 1.05, .2 - L - .1, .002]]; tatter(m, pts, [0, 1, 0], k => m.set(i % 2 && k > 2 ? HG : HW, .3, K.PLAIN)); }); }
    /* --- tungkai: rok sisik, lutut bertanduk, sepatu runcing --- */
    for (const [bt, bs, bf, s] of [[7, 8, 12, 1], [9, 10, 13, -1]]) {
      m.bone(bt).set([36, 18, 20], .1, K.CLOTH, 1).ell([[.04, .078, .083], [-.04, .1, .094], [-.17, .092, .082], [-.32, .07, .066], [-.44, .056, .054]], Nl);
      m.set(IR, .6, K.METAL).plate(0, 0, .098, .092, s > 0 ? -1.15 : -1.15, 1.15, -.34, .0, .018, hi ? 8 : 5, .78, 1.02);
      if (hi) scales(m, .0, 0, .112, .106, -1.1, 1.1, -.3, -.02, 7, 7, SL, IR);
      m.set(GD, .8, K.METAL).plate(0, 0, .098, .092, -1.15, 1.15, -.345, -.33, .022, hi ? 8 : 5, .78, .8);
      m.set(BK, .6, K.METAL).sq([.058, 0, -.44], [.036, .062, .068], 3, hi ? 9 : 6, 3); m.set(GD, .85, K.METAL).sq([.094, 0, -.44], [.007, .03, .034], 3, 5, 2); m.set(BK, .6, K.METAL).cyl([.092, 0, -.46], [.19, 0, -.5], .026, .001, hi ? 7 : 4);
      m.bone(bs).set([26, 18, 18], .1, K.CLOTH, 1).ell([[.0, .053, .052], [-.085, .06, .056], [-.2, .054, .048], [-.32, .042, .04], [-.43, .04, .038]], Nl);
      m.set(IR, .6, K.METAL).plate(0, 0, .06, .056, -1.3, 1.3, -.34, -.03, .014, hi ? 9 : 6, .72, 1.02); if (hi) scales(m, 0, 0, .07, .066, -1.1, 1.1, -.31, -.05, 6, 6, SL, IR);
      m.set(GD, .85, K.METAL).plate(0, 0, .06, .056, -1.3, 1.3, -.05, -.03, .018, hi ? 9 : 6).ell([[-.37, .052, .05], [-.345, .054, .052]], Nl, { cap: false }); m.set(BK, .6, K.METAL).ell([[-.34, .05, .048], [-.43, .05, .046]], Nl, { cap: false });
      m.bone(bf).set(BK, .55, K.METAL).sq([.065, 0, -.017], [.135, .05, .032], 3, hi ? 10 : 6, hi ? 4 : 2); m.sph([0, 0, 0], [.052, .048, .032], hi ? 7 : 4, 2); m.set(GD, .85, K.METAL).sq([.11, 0, -.008], [.075, .04, .018], 3, hi ? 8 : 5, 2).cyl([.18, 0, -.012], [.27, 0, .012], .022, .001, hi ? 6 : 4); m.set(DG, .6, K.METAL).sq([.065, 0, -.047], [.14, .054, .007], 5, hi ? 8 : 5, 2);
    }
    /* --- kain tengah merah (tulang 18, pivot di pinggang) + rumbai --- */
    m.bone(18); for (const [x, sgn] of [[.135, 1], [-.125, -1]]) { tatter(m, [[x, 0, .06, .15], [x + sgn * .015, 0, -.15, .17], [x + sgn * .02, 0, -.42, .17], [x + sgn * .018, 0, -.68, .16], [x + sgn * .018, .02, -.8, .05]], [0, 1, 0], k => m.set(k < 1 ? RD : k < 3 ? [172, 28, 18] : DR, .1, K.CLOTH, 1)); }
    if (hi) { m.set(DG, .7, K.METAL).cyl([.15, .055, -.02], [.155, .055, -.3], .009, .007, 5); m.set([46, 80, 40], .3, K.METAL).cyl([.155, .055, -.3], [.156, .055, -.38], .014, .006, 6); }
    /* --- jubah koyak: helai panjang melebar ke tanah, ujung membara (tulang 14 kiri, 15 kanan, pivot di pinggang belakang) --- */
    const emberC = (ky, n) => k => { const f = (k + .5) / n; if (f > ky) m.set(fireC((f - ky) / (1 - ky) * .95), 0, K.EMIT); else if (f > ky - .1) m.set([38, 15, 11], .05, K.CLOTH, 1); else m.set(k % 2 ? [15, 13, 15] : [23, 20, 24], .04, K.CLOTH, 1); };
    const H2 = hi ? [[.1, -.12, .74, .15, .9], [.21, -.22, .96, .17, .84], [.33, -.3, .82, .15, .9], [.45, -.38, 1.02, .17, .8], [.57, -.42, .78, .14, .88], [.69, -.44, .96, .14, .84], [.81, -.42, .72, .12, .86], [.93, -.36, .86, .1, .8], [1.04, -.3, .6, .08, .78]] : [[.16, -.18, .86, .44, .86], [.46, -.36, .98, .44, .86], [.78, -.38, .86, .36, .84]];
    for (const [b, s] of [[14, -1], [15, 1]]) {
      m.bone(b); H2.forEach(([yE, xE, L, w, ky], i) => {
        const y0 = s * (.05 + yE * .22), x0 = -.13 - yE * .06, y1 = s * yE, x1 = x0 + xE, seg = hi ? 14 : 6, pts = [];
        for (let j = 0; j <= seg; j++) { const t = j / seg, ez = Math.pow(t, 1.3), jg = hi && j % 3 === 0 ? s * .02 * ((i % 3) - 1) : 0; pts.push([lerp(x0, x1, ez) + (hi && j > 1 ? Math.sin(j * 1.7 + i) * .012 : 0), lerp(y0, y1, ez) + jg, .22 - L * 1.14 * t, j === seg ? .004 : w * lerp(.85, 1.15, Math.sin(t * 2.2)) * (t > .86 ? lerp(1, .3, (t - .86) / .14) : 1) * (hi && j % 4 === 3 && t > .55 ? .72 : 1)]); }
        tatter(m, pts, nrm([(i % 2 ? 1 : -1) * .6, 1, 0]), emberC(ky, seg));
      });
    }
    /* --- cincin api & bilah menyala (tulang 17, pusat di punggung; bidang y-z) --- */
    m.bone(17); { const R = .66, q = hi ? 64 : 24; for (let i = 0; i < q; i++) { const a = i / q * TAU, b = (i + 1) / q * TAU, f = .5 + .28 * Math.sin(i * .83) + .22 * Math.sin(i * .31 + 1), rr = .016 + .014 * f; if (f < .3) m.set([34, 22, 20], .35, K.METAL); else m.set(fireC(.1 + f * .85), 0, K.EMIT); m.cyl([0, Math.cos(a) * R, Math.sin(a) * R], [0, Math.cos(b) * R, Math.sin(b) * R], rr, rr, hi ? 6 : 4); }
      if (hi) for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + .1 + Math.sin(i * 2.1) * .08, r2 = R + .03 + (Math.sin(i * 1.9) + 1) * .05, wd = .018 + (i % 3) * .008; m.set(fireC(.34 + (i % 4) * .1), 0, K.EMIT); stripF(m, [-.01, Math.cos(a - wd) * R, Math.sin(a - wd) * R], [-.01, Math.cos(a + wd) * R, Math.sin(a + wd) * R], [-.01, Math.cos(a + .03) * r2, Math.sin(a + .03) * r2], [-.01, Math.cos(a + .03) * r2, Math.sin(a + .03) * r2], [-1, 0, 0]); }
      const BL = [[.4, 1.6], [.8, 1.34], [1.2, 1.66], [3.54, 1.6], [3.94, 1.34], [4.34, 1.66]];
      for (const [a, L] of BL) { const ca = Math.cos(a), sa = Math.sin(a), ax = [0, -sa, ca], seg = hi ? 18 : 6, pts = []; for (let j = 0; j <= seg; j++) { const t = j / seg, r = lerp(.2, L, t), w = .074 * Math.pow(Math.sin(Math.PI * Math.pow(t, .55)), .7) + .002; pts.push([-.03 - t * .03, ca * r, sa * r, w]); } tatter(m, pts, ax, (k, n) => { const f = (k + .5) / n; if (f < .14) m.set([24, 16, 16], .35, K.METAL); else m.set(fireC((f - .14) / .86), 0, K.EMIT); }, [-1, 0, 0]); } }
    // cakar besi hangus di atas bahu (tetap, tulang badan)
    m.bone(1).set([24, 20, 20], .4, K.METAL); for (const s of [1, -1]) { const C = [[-.27, s * .3, .78], [-.3, s * .24, .96], [-.3, s * .14, 1.07], [-.3, s * .03, 1.11]]; for (let i = 0; i < 3; i++) m.cyl(C[i], C[i + 1], .03 - i * .005, .025 - i * .005, hi ? 6 : 4); if (hi) for (let i = 0; i < 3; i++) m.cyl(C[i], [C[i][0], C[i][1] + s * .1, C[i][2] + .12], .018, .001, 4); }
    /* --- pedang panjang (tulang 11; genggaman [.2,0,-.07], bilah ke +x) --- */
    const G = [.2, 0, -.07], L0 = 1.5, bl = hi ? 20 : 7;
    m.bone(11).set(DG, .75, K.METAL).sph([.04, 0, -.07], [.022, .022, .022], 7, 3);
    m.set([18, 14, 16], .3, K.PLAIN).cyl([.05, 0, -.07], [.3, 0, -.07], .019, .021, hi ? 8 : 5); if (hi) { m.set(RD, .25, K.PLAIN); for (let i = 0; i < 7; i++) { const x = .07 + i * .034; m.face([[x, -.0216, -.07], [x + .017, -.0216, -.054], [x + .034, -.0216, -.07], [x + .017, -.0216, -.086]], [0, -1, 0]); m.face([[x + .034, .0216, -.07], [x + .017, .0216, -.054], [x, .0216, -.07], [x + .017, .0216, -.086]], [0, 1, 0]); } }
    m.set(GD, .85, K.METAL).cyl([.3, 0, -.07], [.315, 0, -.07], .054, .05, hi ? 10 : 6); m.set(DG, .75, K.METAL).cyl([.315, 0, -.07], [.345, 0, -.07], .028, .025, hi ? 8 : 5);
    { const pts = []; for (let j = 0; j <= bl; j++) { const t = j / bl; pts.push([.345 + L0 * t, 0, -.07 + Math.sin(t * Math.PI * .5) * .09 * t, (.052 * (1 - Math.pow(t, 5)) + .002)]); } tatter(m, pts, [0, 0, 1], (k, n) => m.set(fireC(.4 + .6 * (k + .5) / n), 0, K.EMIT), [0, 1, 0]);
      for (let j = 0; j < bl - 1; j++) { const t0 = j / bl, t1 = (j + 1) / bl, zt = t => -.07 + Math.sin(t * Math.PI * .5) * .09 * t + .027 * (1 - Math.pow(t, 5)); m.set([40, 28, 20], .6, K.METAL); m.face([[.345 + L0 * t0, -.003, zt(t0)], [.345 + L0 * t1, -.003, zt(t1)], [.345 + L0 * t1, .003, zt(t1)], [.345 + L0 * t0, .003, zt(t0)]], [0, 0, 1]); } }
    /* --- pedang lengkung di tangan kiri (tulang 6 = lengan bawah; kepalan di z ≈ -.3) --- */
    m.bone(6).set([18, 14, 16], .3, K.PLAIN).cyl([.0, .09, -.305], [.0, -.09, -.305], .02, .02, hi ? 7 : 5); m.set(RD, .25, K.PLAIN).cyl([.0, .1, -.305], [.0, .13, -.305], .024, .012, 6); m.set(GD, .85, K.METAL).cyl([.0, -.09, -.305], [.0, -.105, -.305], .052, .048, hi ? 9 : 6);
    { const seg = hi ? 20 : 7, tot = 1.2, RR = .86, pt = t => { const a = t * tot; return [0, -.105 - Math.sin(a) * RR, -.305 + (1 - Math.cos(a)) * RR]; }, wd = t => .062 * (1 - Math.pow(t, 4)) + .002, up = t => { const a = t * tot; return [0, Math.cos(a) * -1 * 0 + Math.sin(a) * -1, Math.cos(a)]; }, nor = t => { const a = t * tot; return [0, Math.cos(a), Math.sin(a)]; };
      for (let j = 0; j < seg; j++) { const t0 = j / seg, t1 = (j + 1) / seg, p = pt(t0), q = pt(t1), n0 = nor(t0), n1 = nor(t1), w0 = wd(t0), w1 = wd(t1); m.set(fireC(.35 + .65 * (t0 + .5 / seg)), 0, K.EMIT); stripF(m, [p[0], p[1] - n0[1] * w0, p[2] - n0[2] * w0], [p[0], p[1] + n0[1] * w0, p[2] + n0[2] * w0], [q[0], q[1] + n1[1] * w1, q[2] + n1[2] * w1], [q[0], q[1] - n1[1] * w1, q[2] - n1[2] * w1], [1, 0, 0]); } }
    return m.done();
  }

  /* ---------- CLAY MARTIN: samurai oni merah bersenjata katana, helm bertanduk sabit, rambut putih berujung bara, zirah bahu kiri berlapis, sarung tangan baja,
     hakama lebar, tali pinggang merah-putih, dua nosel jet tersembunyi di punggung. Tulang tambahan: 14 kain samping · 16 rambut · 18 kain tengah. */
  function clay(m, hi) {
    const RD = [172, 20, 24], RD2 = [116, 12, 16], RDK = [62, 8, 12], BK = [20, 18, 20], STL = [84, 84, 92], GY = [112, 108, 102], GYD = [72, 68, 66], BR = [62, 42, 36], BRD = [40, 27, 24], IV = [226, 214, 182], GD = [206, 164, 72], SK = [122, 96, 132], SKD = [82, 66, 96], HW = [232, 232, 236], EM = [255, 84, 26], N = hi ? 16 : 9, Nl = hi ? 12 : 7;
    /* --- panggul & hakama: menyambung ke pinggang, tali pinggang menempel --- */
    m.bone(0).set(BR, .04, K.CLOTH, 1).ell([[-.15, .085, .1], [-.08, .125, .16], [.0, .135, .175], [.08, .125, .168], [.15, .11, .152]], N);
    { const q = hi ? 24 : 10; for (let i = 0; i < q; i++) { const a = i / q * TAU, ca = Math.cos(a), sa = Math.sin(a); m.set(i % 2 ? [226, 222, 214] : [186, 30, 30], .1, K.CLOTH, 1); m.push(X.chain(X.T(ca * .127, sa * .17, .098 + (i % 2) * .006), X.rz(a))); m.sq([0, 0, 0], [.016, .027, .016], 2.4, hi ? 6 : 4, 2); m.pop(); } }
    if (hi) { m.set([230, 226, 216], .1, K.CLOTH, 1).sq([.146, .02, .098], [.02, .036, .022], 2.4, 7, 3); m.set([186, 30, 30], .1, K.CLOTH, 1).sq([.15, -.03, .098], [.018, .026, .02], 2.4, 7, 3); }
    /* katana bersarung di pinggang kiri, menembus tali pinggang (senjata utama = railgun di tangan) */
    { const d = nrm([-.66, -.04, -.75]), P0 = [.1, -.2, .13], at = t => [P0[0] + d[0] * t, P0[1] + d[1] * t, P0[2] + d[2] * t];
      m.set(BK, .55, K.METAL).cyl(at(0), at(.66), .021, .016, hi ? 8 : 5); if (hi) { m.set(RD, .45, K.PAINT, 0); for (const t of [.12, .34, .56]) m.cyl(at(t), at(t + .03), .0215, .0205, 8, { cap0: false, cap1: false }); m.set(GD, .85, K.METAL).cyl(at(.645), at(.665), .018, .016, 8); }
      m.set(GD, .85, K.METAL).cyl(at(-.008), at(.012), .023, .022, hi ? 8 : 5); m.set(RD2, .5, K.METAL).cyl(at(-.018), at(-.008), .052, .052, hi ? 12 : 6);
      m.set(BK, .2, K.PLAIN).cyl(at(-.21), at(-.018), .017, .018, hi ? 8 : 5); if (hi) { m.set(GD, .85, K.METAL).cyl(at(-.22), at(-.205, 0), .019, .018, 8); m.set([230, 220, 200], .1, K.PLAIN); for (let i = 0; i < 3; i++) m.cyl(at(-.18 + i * .052), at(-.162 + i * .052), .0185, .0185, 8, { cap0: false, cap1: false }); } }
    /* --- badan: rongga dada, punggung & bahu mengikuti tubuh; kimono menutup dari sisi dengan bukaan V --- */
    const TR = [[-.05, .106, .15], [.05, .112, .152], [.12, .118, .16], [.2, .13, .18], [.3, .146, .205], [.38, .142, .214], [.44, .112, .185], [.49, .068, .096]];
    const trAt = z => { let i = 0; while (i < TR.length - 2 && z > TR[i + 1][0]) i++; const a = TR[i], b = TR[i + 1], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
    const wrap = (f0, f1, z0, z1, off, nz, na) => { const id = []; for (let j = 0; j <= nz; j++) { const z = lerp(z0, z1, j / nz), a0 = f0(z), a1 = f1(z), r = trAt(z); for (let i = 0; i <= na; i++) { const a = lerp(a0, a1, i / na), c = Math.cos(a), q = Math.sin(a); id.push(m.V([c * (r[0] + off), q * (r[1] + off), z], nrm([c / r[0], q / r[1], 0]), a, z)); } } for (let j = 0; j < nz; j++) for (let i = 0; i < na; i++) { const q = j * (na + 1) + i; m.quad(id[q], id[q + 1], id[q + na + 2], id[q + na + 1]); } };
    const opV = z => lerp(.1, .78, clamp((z - .12) / .32, 0, 1)), nzT = hi ? 10 : 4, naT = hi ? 14 : 6;
    m.bone(1).set(SK, .15, K.SKIN).ell(TR, N);
    if (hi) { m.set(SK, .15, K.SKIN); for (const q of [1, -1]) m.sq([.124, q * .072, .335], [.03, .074, .06], 2.6, 10, 4); m.set(SKD, .12, K.SKIN).sq([.148, 0, .34], [.006, .006, .055], 3, 4, 2); }
    m.set(GY, .05, K.CLOTH, 1); wrap(opV, () => Math.PI, -.05, .475, .006, nzT, naT * 2); wrap(() => -Math.PI, z => -opV(z), -.05, .475, .006, nzT, naT * 2);
    m.set(GYD, .05, K.CLOTH, 1); wrap(opV, z => opV(z) + .17, -.05, .475, .012, nzT, 2); wrap(z => -opV(z) - .17, z => -opV(z), -.05, .475, .012, nzT, 2);
    m.set(BK, .1, K.CLOTH, 1).ell([[-.045, .119, .163], [.045, .122, .167]], N, { cap: false });
    // pelat dada kiri merah: melengkung mengikuti dada, tepi bawah hitam, ikatan
    m.set(RD, .4, K.PAINT, 0); wrap(() => -1.5, z => -opV(z) - .17, .2, .44, .022, nzT, naT); m.set(BK, .55, K.METAL); wrap(() => -1.5, z => -opV(z) - .17, .172, .205, .024, 2, naT);
    if (hi) { m.set(RD2, .4, K.PAINT, 0); for (const z of [.27, .34]) wrap(() => -1.5, y => -opV(y) - .17, z, z + .008, .025, 1, naT); m.set(GD, .85, K.METAL).sq([.146, -.13, .3], [.006, .014, .014], 2, 4, 2); }
    m.set(BK, .05, K.CLOTH, 1).ell([[.455, .094, .112], [.515, .08, .088], [.55, .07, .074]], N, { cap: false });
    /* --- nosel jet: paket rata menempel punggung, dua tabung masuk ke dalam paket --- */
    m.set(BK, .55, K.METAL).sq([-.172, 0, .3], [.062, .118, .145], 3, hi ? 10 : 6, 3); if (hi) { m.set(RD, .4, K.PAINT, 0).sq([-.232, 0, .36], [.004, .07, .06], 3, 5, 2); m.set(EM, 0, K.EMIT).sq([-.235, 0, .36], [.002, .04, .008], 3, 4, 1); }
    for (const y of [.085, -.085]) { m.set(BK, .55, K.METAL).cyl([-.232, y, .36], [-.232, y, .17], .05, .046, hi ? 10 : 6); m.set(STL, .6, K.METAL).cyl([-.232, y, .17], [-.232, y, .105], .036, .052, hi ? 10 : 6, { cap1: false }); m.set(EM, 0, K.EMIT).cyl([-.232, y, .118], [-.232, y, .108], .044, .044, 8); }
    /* --- v2.12 KATANA (tulang 17): x = arah bilah dari tsuba, gagang x 0…−.31 (dua tangan), mata bilah di sisi −z; bilah hitam-merah, mata menyala MERAH.
       SARUNG (tulang 0, pinggul kiri) mengikuti KSH — saat tersarung tulang 17 diletakkan tepat di dalamnya --- */
    m.bone(17);
    m.set([24, 18, 20], .3, K.PLAIN).cyl([-.31, 0, 0], [-.02, 0, 0], .019, .017, hi ? 9 : 5);
    if (hi) { m.set([176, 22, 26], .3, K.CLOTH, 1); for (let i = 0; i < 6; i++) { m.push(X.chain(X.T(-.275 + i * .046, 0, 0), X.rx(.785))); m.sq([0, 0, 0], [.013, .0205, .0205], 2, 4, 2); m.pop(); } }   // lilitan ito belah ketupat
    m.set(GD, .85, K.METAL).cyl([-.33, 0, 0], [-.305, 0, 0], .021, .02, 8).cyl([.0, 0, 0], [.032, 0, 0], .017, .015, 6);   // kashira & habaki
    m.set(BK, .55, K.METAL).cyl([-.022, 0, 0], [-.002, 0, 0], .056, .056, hi ? 14 : 8); if (hi) m.set(RD, .4, K.PAINT, 0).cyl([-.0235, 0, 0], [-.0005, 0, 0], .04, .04, 12, { cap0: false, cap1: false });   // tsuba
    { const Lb = .96, n = hi ? 10 : 5, zc = t => .038 * t * t, w = t => .036 * (1 - .28 * t);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, x0 = .032 + Lb * t0, x1 = .032 + Lb * t1, tm = (t0 + t1) / 2, ang = Math.atan2(zc(t1) - zc(t0), x1 - x0), ww = w(tm) * (i === n - 1 ? .7 : 1), xm = (x0 + x1) / 2, zm = (zc(t0) + zc(t1)) / 2;
        m.push(X.chain(X.T(xm, 0, zm), X.ry(-ang)));
        m.set([46, 14, 18], .9, K.METAL).sq([0, 0, ww * .1], [(x1 - x0) * .52, .0055, ww * .4], 3, 4, 2);   // badan bilah (punggung tebal)
        m.set([255, 52, 34], 0, K.EMIT).sq([0, 0, -ww * .38], [(x1 - x0) * .52, .0032, ww * .13], 3, 4, 2);   // mata bilah menyala
        m.pop();
      }
      m.push(X.chain(X.T(.032 + Lb + .03, 0, zc(1) + .004), X.ry(-.5))); m.set([255, 52, 34], 0, K.EMIT).sq([0, 0, 0], [.04, .0035, .012], 2.4, 4, 2); m.pop();   // kissaki
    }
    m.bone(0); m.push(KSHF);   // sarung: pernis hitam, cincin merah, ujung emas
    m.set([16, 14, 16], .55, K.PAINT, 0).cyl([.02, 0, .006], [1.0, 0, .03], .027, .022, hi ? 10 : 6);
    m.set(RD, .4, K.PAINT, 0); for (const x of [.08, .2, .5]) m.cyl([x, 0, .006 + x * .025], [x + .02, 0, .006 + x * .025], .0285, .0285, hi ? 10 : 6, { cap0: false, cap1: false });
    m.set(GD, .85, K.METAL).cyl([1.0, 0, .03], [1.05, 0, .032], .023, .012, 8); m.set([150, 22, 24], .3, K.CLOTH, 1).cyl([.11, 0, .0], [.13, 0, .0], .031, .031, 8, { cap0: false, cap1: false }); m.pop();
    /* --- tangan: telapak, empat jari menggenggam, ibu jari --- */
    const fist = (cP, cF, sd) => { m.set(cP, .25, K.SKIN).sq([.004, 0, -.288], [.034, .05, .052], 3, hi ? 9 : 6, 3); if (hi) { m.set(cF, .25, K.SKIN); for (let i = 0; i < 4; i++) m.sq([.03, -.036 + i * .024, -.322], [.019, .0118, .025], 2.5, 6, 2); m.sq([.03, -sd * .052, -.285], [.016, .013, .03], 2.5, 6, 2); } else m.set(cF, .25, K.SKIN).sq([.028, 0, -.32], [.022, .048, .028], 3, 6, 2); };
    /* --- lengan kanan: bahu berotot + lengan kimono pendek koyak + garis petir, kulit merah --- */
    m.bone(3).set(GY, .05, K.CLOTH, 1).ell([[.055, .062, .068], [-.02, .09, .095], [-.1, .082, .086], [-.17, .078, .08]], Nl);
    if (hi) { m.set(EM, 0, K.EMIT); for (const [a, b] of [[[.088, .018, -.03], [.09, -.005, -.075]], [[.09, -.005, -.075], [.086, .02, -.115]], [[.086, .02, -.115], [.082, -.012, -.16]]]) m.rod(a, b, .0045, 4); }
    { const q = hi ? 7 : 3; for (let i = 0; i < q; i++) { const a = i / q * TAU; m.set(i % 2 ? GY : GYD, .05, K.CLOTH, 1); tatter(m, [[Math.cos(a) * .076, Math.sin(a) * .078, -.15, .06], [Math.cos(a) * .074, Math.sin(a) * .076, -.19 - (i % 3) * .012, .05], [Math.cos(a) * .07, Math.sin(a) * .072, -.23 - (i % 3) * .016, .003]], [-Math.sin(a), Math.cos(a), 0]); } }
    m.set([156, 30, 28], .15, K.SKIN).ell([[-.15, .066, .068], [-.24, .056, .058], [-.3, .05, .052]], Nl, { cap: false });
    m.bone(4).set([156, 30, 28], .15, K.SKIN).ell([[.014, .05, .052], [-.06, .058, .06], [-.17, .05, .052], [-.235, .04, .043]], Nl);
    if (hi) { m.set(RDK, .1, K.SKIN); for (let i = 0; i < 3; i++) { const z = -.05 - i * .055, a = i * 1.4; m.sq([Math.cos(a) * .054, Math.sin(a) * .056, z], [.011, .024, .011], 2.2, 5, 2); } }
    m.set(BK, .05, K.CLOTH, 1).ell([[-.215, .046, .048], [-.25, .043, .045]], Nl, { cap: false }); fist([146, 34, 32], [176, 44, 40], 1);
    /* --- bahu kiri: sode merah tiga lapis mengikuti bahu + dua tanduk kecil; lengan baju besi, sarung tangan baja --- */
    m.bone(1); m.push(X.chain(X.T(-.006, -.232, .452), X.rx(-.46)));
    m.set(RD, .4, K.PAINT, 0).sq([0, .002, .03], [.1, .082, .05], 2.6, N, hi ? 6 : 3);
    [[.02, -.055, 1, RD2], [-.04, -.115, 1.08, RD], [-.1, -.175, 1.16, RD2]].forEach(([z1, z0, kr, col]) => { m.set(col, .4, K.PAINT, 0).plate(0, .018, .1 * kr, .088 * kr, -2.75, -.4, z0, z1, .012, hi ? 10 : 6, 1.08, .97); m.set(BK, .55, K.METAL).plate(0, .018, .1 * kr, .088 * kr, -2.75, -.4, z0 - .002, z0 + .01, .016, hi ? 10 : 6, 1.08, 1.07); });
    m.set(RD, .4, K.PAINT, 0); for (const [x, y, hh] of [[.05, -.02, .11], [-.045, -.03, .085]]) { const P0 = [x, y, .06], P1 = [x * 1.2, y - .025, .06 + hh * .55], P2 = [x * 1.1 + .015, y - .02, .06 + hh]; m.cyl(P0, P1, .024, .012, hi ? 7 : 4); m.cyl(P1, P2, .012, .001, hi ? 6 : 4); }
    m.pop();
    m.bone(5).set(RDK, .1, K.SKIN).ell([[.04, .056, .058], [-.05, .074, .076], [-.15, .064, .066], [-.3, .05, .052]], Nl);
    m.set(RD, .4, K.PAINT, 0).plate(0, 0, .066, .068, 0, TAU, -.27, -.15, .01, hi ? 12 : 7, .86, 1); m.set(BK, .55, K.METAL).ell([[-.285, .056, .058], [-.27, .058, .06]], Nl, { cap: false });
    m.bone(6).set(STL, .55, K.METAL).sph([-.012, 0, .0], [.058, .062, .052], hi ? 10 : 6, hi ? 5 : 3);
    m.set(BK, .55, K.METAL).ell([[-.015, .056, .06], [-.09, .066, .07], [-.19, .056, .06], [-.245, .046, .05]], hi ? 12 : 7);
    m.set(RD, .4, K.PAINT, 0).plate(0, 0, .066, .07, -1.1, 1.1, -.19, -.07, .008, hi ? 8 : 5, .9, 1); m.set(GD, .85, K.METAL).ell([[-.235, .052, .056], [-.222, .054, .058]], Nl, { cap: false });
    fist([44, 42, 48], [84, 84, 92], -1);
    /* --- kepala: wajah oni ungu, taring, mata merah --- */
    m.bone(2).set(SKD, .1, K.SKIN).ell([[-.05, .056, .056, -.01], [.07, .05, .05, -.01]], hi ? 8 : 5, { cap: false }); m.sph([-.004, 0, .14], [.098, .086, .112], N, hi ? 7 : 4); m.sph([.038, 0, .076], [.07, .068, .064], hi ? 10 : 6, hi ? 5 : 3);
    m.set(SK, .15, K.SKIN).sq([.085, 0, .14], [.022, .056, .05], 2.8, hi ? 8 : 5, 3);
    m.set([12, 8, 12], .1, K.PLAIN); for (const s of [1, -1]) m.sq([.102, s * .034, .158], [.005, .024, .011], 3, 5, 1);
    m.set([255, 40, 20], 0, K.EMIT); for (const s of [1, -1]) { m.push(X.chain(X.T(.107, s * .034, .16), X.rx(s * .3))); m.sq([0, 0, 0], [.002, .018, .0055], 3, 4, 1); m.pop(); }
    if (hi) { m.set(SKD, .1, K.SKIN).sq([.108, 0, .124], [.008, .012, .024], 3, 4, 2); m.set([14, 8, 12], .1, K.PLAIN).sq([.098, 0, .082], [.008, .042, .011], 3, 6, 1); }
    m.set(IV, .3, K.PLAIN); for (const s of [1, -1]) { m.cyl([.098, s * .032, .074], [.102, s * .036, .112], .011, .001, hi ? 6 : 4); if (hi) m.cyl([.1, s * .014, .09], [.102, s * .014, .068], .006, .001, 4); }
    /* --- kabuto: kubah merah, pinggiran, lapis leher, sayap samping, tanduk sabit ivori, permata emas --- */
    m.set(RD, .4, K.PAINT, 0).ell([[.16, .118, .108, -.012], [.2, .112, .104, -.014], [.25, .09, .084, -.014], [.285, .052, .048, -.012], [.3, .012, .012, -.012]], N); if (hi) { m.set(RD2, .4, K.PAINT, 0); for (let i = -2; i <= 2; i++) m.sq([.098 - Math.abs(i) * .012, i * .04, .22], [.012, .008, .05], 3, 3, 2); }
    m.set(RD2, .4, K.PAINT, 0); m.push(X.ry(-.2)); m.sq([.11, 0, .18], [.056, .104, .012], 3, hi ? 10 : 6, 2); m.pop(); m.set(BK, .55, K.METAL).ell([[.152, .122, .112, -.012], [.164, .121, .111, -.012]], N, { cap: false });
    for (let i = 0; i < 3; i++) { const z = .13 - i * .05, rk = 1 + i * .12; m.set(i % 2 ? RD2 : RD, .35, K.PAINT, 0).plate(-.015, 0, .118 * rk, .115 * rk, 1.35, 4.93, z - .045, z, .012, hi ? 10 : 6, 1.03, 1); if (hi) { m.set([230, 226, 216], .1, K.CLOTH, 1).plate(-.015, 0, .118 * rk, .115 * rk, 1.35, 4.93, z - .05, z - .043, .014, 10, 1.03, 1.03); } }
    for (const s of [1, -1]) { m.set(RD, .4, K.PAINT, 0); m.push(X.chain(X.T(.05, s * .135, .17), X.rx(s * .45), X.rz(s * -.3))); m.sq([0, 0, 0], [.05, .012, .05], 3, hi ? 7 : 4, 2); m.pop(); }
    m.set(GD, .9, K.METAL).sq([.135, 0, .245], [.008, .04, .04], 2, hi ? 8 : 5, 2); m.set(BK, .5, K.METAL).sq([.145, 0, .245], [.004, .018, .018], 2, 4, 1); m.set(IV, .3, K.PLAIN).sq([.12, 0, .205], [.012, .058, .012], 3, 6, 2);
    // tanduk sabit: kiri tinggi melengkung, kanan pendek
    const horn = (s, Hh, Sp) => { const q = hi ? 10 : 5; let pr = null; for (let i = 0; i <= q; i++) { const t = i / q, a = t * Math.PI * .85, x = .12 + t * -.02 + Math.sin(t * 3.1) * .03, y = s * (.03 + Sp * Math.sin(a) ), z = .225 + Hh * (1 - Math.cos(a)) * .5, r = .027 * Math.pow(1 - t, .7) + .002, c = [x, y, z]; if (pr) m.cyl(pr[0], c, pr[1], r, hi ? 7 : 4); pr = [c, r]; } };
    m.set(IV, .3, K.PLAIN); horn(-1, .3, .115); horn(1, .19, .125);
    // rambut: kiri-kanan menutup sisi wajah sampai dada, memutih ke jingga di ujung; belakang di tulang 16
    const hairC = f => [lerp(245, 255, f), lerp(245, 150, f * f), lerp(250, 90, f * f)];
    const hairS = (x, y, z, L, w, ax, bend) => { const seg = hi ? 8 : 3, pts = []; for (let i = 0; i <= seg; i++) { const t = i / seg; pts.push([x + bend[0] * t * t, y + bend[1] * t, z - L * t, w * Math.pow(1 - t, .75) + .0015]); } tatter(m, pts, ax, (k, n) => m.set(hairC(k / n), .25, K.PLAIN), nrm([x > 0 ? .4 : -.4, 0, .9])); };
    for (const s of [1, -1]) { const ax = nrm([.45, s, 0]); for (const [dy, L, w, dz] of hi ? [[.0, .5, .034, 0], [.024, .42, .03, .015], [.046, .34, .028, .03], [-.016, .36, .026, -.01]] : [[.015, .44, .08, 0]]) hairS(.07, s * (.078 + dy), .2 + dz, L, w, ax, [-.015, s * .03]); }
    m.bone(16); { const q = hi ? 7 : 3; for (let i = 0; i < q; i++) { const u = i / (q - 1) * 2 - 1; hairS(-.11 + Math.abs(u) * .035, u * .095, .16, lerp(.62, .4, Math.abs(u)) - (i % 2) * .08, hi ? .022 : .05, [0, 1, 0], [-.05, u * .05]); } }
    /* --- kain tengah abu koyak (tulang 18) & kain merah berbulu di samping kiri (tulang 14) --- */
    m.bone(18); for (const [y, L, w] of hi ? [[-.065, .34, .07], [.0, .46, .08], [.07, .3, .065]] : [[0, .46, .2]]) { const seg = hi ? 5 : 2, pts = []; for (let i = 0; i <= seg; i++) { const t = i / seg; pts.push([.14 + t * .012, y, .07 - L * t, i === seg ? .004 : w * (1 - t * .25) * (hi && i % 2 ? .78 : 1)]); } tatter(m, pts, [0, 1, 0], (k, n) => m.set(k / n > .5 ? [110, 106, 104] : [158, 154, 148], .05, K.CLOTH, 1)); }
    m.bone(14); { const pts = [[.06, -.17, .08, .08], [.04, -.2, -.1, .1], [.02, -.22, -.3, .1], [.0, -.235, -.5, .085], [-.01, -.24, -.66, .003]]; tatter(m, pts, [1, .2, 0].map((v, i, a) => v / Math.hypot(...a)), (k, n) => m.set(RD2, .1, K.CLOTH, 1)); }
    /* --- tungkai: hakama mengecil ke betis, pelindung tulang kering sampai pergelangan, telapak menyambung --- */
    for (const [bt, bs, bf, s] of [[7, 8, 12, 1], [9, 10, 13, -1]]) {
      m.bone(bt).set(BR, .04, K.CLOTH, 1).ell([[.05, .088, .096], [-.05, .112, .112], [-.2, .106, .1], [-.34, .088, .082], [-.44, .072, .068]], Nl);
      if (hi) { m.set(BRD, .04, K.CLOTH, 1); for (const a of [.7, -1.1, 2.4]) m.plate(0, 0, .108, .104, a, a + .22, -.34, -.06, .003, 3, .9, 1.02); }
      m.set(BK, .55, K.METAL).sq([.058, 0, -.44], [.028, .056, .062], 3, hi ? 9 : 6, 3); m.set(STL, .55, K.METAL).sq([.082, 0, -.44], [.005, .04, .042], 3, 5, 2); if (hi) m.set(GD, .85, K.METAL).sq([.088, 0, -.44], [.003, .014, .014], 2, 4, 1);
      m.bone(bs).set(BR, .04, K.CLOTH, 1).ell([[.02, .074, .07], [-.08, .076, .07], [-.17, .064, .06]], Nl, { cap: false });
      m.set(BK, .3, K.PLAIN).ell([[-.15, .062, .058], [-.25, .058, .054], [-.36, .047, .044], [-.43, .046, .043]], Nl);
      m.set([60, 60, 66], .55, K.METAL).plate(0, 0, .058, .054, -1.2, 1.2, -.385, -.17, .012, hi ? 8 : 5, .82, 1.04);
      m.set(RD, .1, K.CLOTH, 1); for (const z of [-.2, -.34]) m.ell([[z - .01, z < -.3 ? .056 : .066, z < -.3 ? .052 : .062], [z + .01, z < -.3 ? .056 : .066, z < -.3 ? .052 : .062]], Nl, { cap: false });
      m.bone(bf).set(BK, .1, K.CLOTH, 1).sq([.058, 0, -.016], [.112, .047, .03], 2.8, hi ? 10 : 6, hi ? 4 : 2); m.sph([0, 0, 0], [.05, .046, .034], hi ? 7 : 4, 2);
      m.set([180, 154, 104], .05, K.PLAIN).sq([.058, 0, -.046], [.126, .056, .009], 5, hi ? 10 : 6, 2); if (hi) { m.set(RD, .1, K.CLOTH, 1); for (const sd of [1, -1]) m.rod([.12, sd * .02, -.035], [.0, sd * .05, .0], .005, 3); m.set([140, 116, 74], .05, K.PLAIN); for (let i = 0; i < 4; i++) m.sq([-.03 + i * .06, 0, -.056], [.012, .054, .002], 3, 3, 1); }
    }
    /* --- RAILGUN (tulang 11; genggaman kanan [.2,0,-.07], tangan kiri [.46,0,-.01], moncong x 1.06): popor, badan, bank kapasitor, teropong, sel daya, rel kembar + inti berpendar merah, kumparan, moncong bercabang --- */
    const GM = [30, 31, 34], GM2 = [46, 46, 50], CR = [255, 66, 26], n8 = hi ? 10 : 6;
    m.bone(11).set(GM, .5, K.METAL).sq([.06, 0, -.012], [.06, .022, .04], 4, 6, 3); m.set(BK, .3, K.PLAIN).sq([-.006, 0, -.016], [.011, .027, .054], 3, 6, 3);
    m.set(GM, .5, K.METAL).sq([.24, 0, .004], [.15, .034, .048], 4, n8, 4); m.set(RD, .4, K.PAINT, 0); for (const y of [.035, -.035]) m.sq([.24, y, .012], [.1, .002, .008], 3, 4, 1);
    m.set(GM2, .5, K.METAL).cyl([.14, 0, .068], [.33, 0, .068], .026, .026, n8); m.set(CR, 0, K.EMIT).sq([.235, 0, .094], [.06, .01, .003], 3, 4, 1);
    m.set(BK, .5, K.METAL).cyl([.17, 0, .112], [.29, 0, .112], .017, .017, n8); m.sq([.23, 0, .094], [.016, .007, .01], 3, 4, 2); m.set(RD, .9, K.GLASS).cyl([.29, 0, .112], [.292, 0, .112], .014, .014, n8);
    m.set(GM, .5, K.METAL); m.push(X.chain(X.T(.2, 0, -.085), X.ry(-.3))); m.sq([0, 0, 0], [.021, .017, .05], 3.5, 6, 3); m.pop(); m.sq([.25, 0, -.06], [.04, .004, .015], 3, 4, 1);
    m.sq([.315, 0, -.078], [.03, .022, .032], 4, 6, 3); m.set(CR, 0, K.EMIT); for (const y of [.023, -.023]) m.sq([.315, y, -.078], [.016, .001, .012], 3, 4, 1);
    m.set(GM2, .5, K.METAL).sq([.46, 0, -.002], [.075, .043, .052], 3.5, n8, 3);
    m.set([38, 40, 44], .55, K.METAL).sq([.74, 0, .032], [.31, .028, .009], 5, n8, 3).sq([.74, 0, -.032], [.31, .028, .009], 5, n8, 3);
    m.set(CR, 0, K.EMIT).sq([.74, 0, 0], [.3, .006, .011], 5, 6, 2);
    m.set(RD2, .55, K.METAL); for (const x of [.57, .67, .77, .87, .97]) m.cyl([x, 0, 0], [x + .03, 0, 0], .052, .052, hi ? 12 : 7, { cap0: false, cap1: false }); if (hi) { m.set(GM, .5, K.METAL); for (const x of [.62, .72, .82, .92]) m.cyl([x, 0, 0], [x + .012, 0, 0], .044, .044, 10, { cap0: false, cap1: false }); }
    m.set(GM2, .55, K.METAL); for (const q of [1, -1]) m.sq([1.05, 0, q * .032], [.024, .021, .009], 4, 5, 2); m.set(CR, 0, K.EMIT); for (const q of [1, -1]) m.sq([1.076, 0, q * .032], [.003, .012, .006], 3, 4, 1);
    return m.done();
  }

  /* ============================================================
     GERAK: fase langkah per kaki (c = 0 tumit menjejak, .5 paling belakang, .72 ayun), panggul mengikuti kaki yang menapak sehingga
     telapak tidak melayang/terbenam, bahu berlawanan dengan panggul, senjata dipegang di bahu (membidik), siaga rendah (jalan), silang dada (lari)
     ============================================================ */
  const blendM = (A, B, k) => ({ c: A.c.map((a, i) => { const b = B.c[i]; return mul(nrm([lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]), lerp(Math.hypot(a[0], a[1], a[2]), Math.hypot(b[0], b[1], b[2]), k)); }), t: [lerp(A.t[0], B.t[0], k), lerp(A.t[1], B.t[1], k), lerp(A.t[2], B.t[2], k)] });   // skala ikut dicampur (bos besar: senjata ikut besar)
  /* v2.12 katana Cray: mulut sarung relatif panggul + arah bilah tersarung (ke belakang-bawah), mata bilah ke atas */
  const kfr = (t, d, e) => { const x = nrm(d), z = mul(nrm(sub(e, mul(x, dot(e, x)))), -1); return { c: [x, crs(z, x), z], t }; };
  const VA = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];   // humanPose punya variabel lokal 'add'
  const KSH = { o: [.07, .2, .02], d: nrm([-.84, .1, -.52]) }, KSHF = kfr(KSH.o, KSH.d, [0, 0, 1]);
  const RS = [0, .19, .43], LS = [0, -.19, .43], THI = .44, SHN = .43;
  function ik(S, Tg, a, b, pole) {
    const d = sub(Tg, S); let L = Math.hypot(d[0], d[1], d[2]); const dir = nrm(d); L = Math.min(L, a + b - .002);
    const ca = (a * a + L * L - b * b) / (2 * a * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca)), pp = nrm(sub(pole, mul(dir, dot(pole, dir))));
    return add(S, add(mul(dir, a * ca), mul(pp, a * sa)));
  }
  const gs = (x, w) => Math.exp(-(x * x) / (w * w));
  function kneelLeg(side, gz) {
    const hz = .37, a = .44, b = .43;
    if (side > 0) { const dz = Math.max(.05, hz - gz - .075), hor = Math.sqrt(Math.max(0, a * a - dz * dz)), ft = Math.atan2(hor, dz); return [-ft, ft + 1.85]; }
    const dx = .42, dz = hz - gz - .1, L = Math.min(a + b - .01, Math.hypot(dx, dz)), al = Math.atan2(dx, dz), ga = Math.acos(Math.max(-1, Math.min(1, (a * a + L * L - b * b) / (2 * a * L))));
    const ft = al + ga, kx = a * Math.sin(ft), kz = -a * Math.cos(ft), fs = Math.atan2(dx - kx, kz + dz);
    return [-ft, ft - fs];
  }
  const OLD_POSE = MD.humanPose, OLD_DIE = MD.humanDie;
  // kaki turunan dari tulang kering (untuk pose lama: mayat, animasi tewas)
  function feetFromShin(out) {
    for (const [sh, ft] of [[8, 12], [10, 13]]) { const o = sh * 16, q = ft * 16; for (let i = 0; i < 16; i++) out[q + i] = out[o + i]; out[q + 12] = out[o + 12] - out[o + 8] * SHN; out[q + 13] = out[o + 13] - out[o + 9] * SHN; out[q + 14] = out[o + 14] - out[o + 10] * SHN; }
    return out;
  }
  /* tulang tambahan Sang Jenderal saat mati: kain mengikuti panggul, rambut mengikuti kepala, cincin mengikuti badan */
  function sworderDead(out, s) { for (const [b, f] of [[14, 0], [15, 0], [18, 0], [16, 2], [17, 1]]) { const o = b * 16, q = f * 16; for (let i = 0; i < 16; i++) out[o + i] = out[q + i]; } if (s.sword === 2) out.fill(0, 17 * 16, 18 * 16); return out; }
  MD.humanDie = function (s, out) { const r = feetFromShin(OLD_DIE(s, out)); return s.sword ? sworderDead(r, s) : r; };

  /* ============================================================
     SIKLUS JALAN & LARI (kaidah video "How To Create a Game Run Cycle", Libby Pete):
     - telapak mengikuti lintasan berkunci (busur bersih, diangkat keluar siluet) lalu lutut dihitung IK → telapak menapak tanah, tidak meluncur/melayang
     - timing tidak rata: melayang lama, jatuh cepat, berbalik cepat di titik terendah; langkah kanan-kiri sedikit beda panjang
     - tulang belakang melengkung C di udara, membalik saat mendarat (+ kompresi); kepala & senjata tertinggal (overlap)
     - lengan kiri memimpin gerak saat lari (leading edge), lari: condong ke depan, tidak seimbang
     - dari diam masuk lewat passing pose (MD.gaitPass) agar tidak melompat; berat mengikuti karakter (s.hvy)
     ============================================================ */
  const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const FOOT = .056, HEELR = .155, TOER = .085;
  /* kurva naik-turun badan untuk satu langkah h: turun tajam, berbalik cepat, lalu melayang di atas (nilai -1..1) */
  function bobC(h, low) {
    const t = ((h - low) % 1 + 1) % 1;
    if (t < .5) { const q = 1 - t / .5; return 1 - 2 * q * q * q; }
    const q = (t - .5) / .5; return 1 - 2 * q * q * q;
  }
  const FP = { x: 0, z: 0, f: 0 };
  function footPath(c, st, Rf, Rb, lift, hl, f0) {   // c 0 = tumit menjejak · st = akhir tapak · Rf/Rb = jarak telapak di depan/belakang panggul
    if (c < st) {
      const u = c / st, a = hl * sm((u - .42) / .58), b = f0 * (1 - sm(u / .2));
      FP.x = lerp(Rf, -Rb, u) + HEELR * (1 - Math.cos(a)); FP.z = FOOT + HEELR * Math.sin(a) + TOER * Math.sin(b); FP.f = b - a; return;
    }
    const u = (c - st) / (1 - st), env = Math.pow(Math.sin(Math.PI * Math.pow(u, .72)), 1.12), S = sm(u), z0 = FOOT + HEELR * Math.sin(hl), z1 = FOOT + TOER * Math.sin(f0);
    FP.x = lerp(-Rb + HEELR * (1 - Math.cos(hl)), Rf, S + .1 * Math.sin(Math.PI * S) * S);   // kaki sedikit melewati titik jejak lalu ditarik balik
    FP.z = lerp(z0, z1, u) + lift * env; FP.f = lerp(-hl, f0, sm((u - .3) / .62)) - .42 * (lift > .12 ? 1 : .3) * env * (1 - u);
  }
  function legIK(dx, dz) {   // target telapak relatif panggul (bidang sagital) → [paha, lutut]; lutut selalu menekuk ke depan
    let D = Math.hypot(dx, dz); D = clamp(D, .22, THI + SHN - .004);
    const T = Math.atan2(-dx, -dz), ca = (THI * THI + D * D - SHN * SHN) / (2 * THI * D), al = Math.acos(clamp(ca, -1, 1)), ck = (THI * THI + SHN * SHN - D * D) / (2 * THI * SHN);
    return [T - al, Math.PI - Math.acos(clamp(ck, -1, 1))];
  }
  MD.humanPose = function (s, out) {
    if (s.dead > 0) { const r = feetFromShin(OLD_POSE(s, out)); return s.sword ? sworderDead(r, s) : r; }
    let U = X.chain(X.T(s.x, s.y, s.z), X.rz(s.yaw));
    if (s.tilt || s.rolA) { const v = s.pv; U = X.chain(U, X.T(v[0], v[1], v[2]), X.rx(s.rolA || 0), X.ry(s.tilt || 0), X.T(-v[0], -v[1], -v[2])); }   // guling dulu di sekitar arah laju, baru badan dicondongkan: berlaku saat tegak maupun rebah
    if (s.sc) U = X.cmp(U, { c: [[s.sc, 0, 0], [0, s.sc, 0], [0, 0, s.sc]], t: [0, 0, 0] });
    const mv = s.mv, run = !!s.run, cr = s.cr || 0, kneel = s.kneel || 0, kl = s.knl || 0, LG = s.legs, aim = s.aim, SW = !!s.sword, RG = s.sword === 2, HV = s.hvy || 0;
    const k = s.rk !== undefined ? s.rk : (run ? 1 : 0), v = s.gv !== undefined ? s.gv : (run ? 8 : mv * 1.6);
    const idleW = (1 - mv) * (1 - kneel) * (1 - cr) * (1 - kl), still = LG || kneel > 0 || cr > 0 || kl > 0;
    const ph = s.ph + .07 * Math.sin(s.ph);   // langkah kanan sedikit lebih panjang dari kiri
    const cHz = MD.gaitHz(v, HV), aK = 1 - aim * .45;   // sambil membidik: pantulan & langkah dikurangi
    const R = lerp(.34, .47, k) * mv * (1 - aim * .22 * mv) * (1 + HV * .1), off = lerp(.08, -.22, k);
    const st = clamp(2 * R * cHz / Math.max(v, .35), lerp(.42, .13, k), lerp(.64, .42, k));   // lama telapak menapak dihitung dari kecepatan agar tidak meluncur
    const lift = lerp(.085, .36 * (1 - HV * .32), k) * mv * aK, hl = lerp(.55, 1.02, k) * mv, f0 = lerp(.3, .16, k) * mv;
    const h = (((ph / TAU) * 2) % 1 + 1) % 1, low = lerp(.06, st, k), by = bobC(h, low), byLag = bobC(h - .09, low);
    const amp = lerp(.02, .05, k) * mv * aK * (1 - HV * .55);
    const idleZ = -.022 * aim * idleW, pzBase = .965 - lerp(0, .036, k) * mv - .012 * mv + idleZ;
    const pzLoco = pzBase + amp * by;
    const sway = Math.sin(ph) * lerp(.032, .016, k) * mv, ptw = -Math.cos(ph) * lerp(.09, .17, k) * mv * (1 + HV * .2) + (SW ? .1 : aim * .34) * idleW, roll = Math.sin(ph) * lerp(.035, .02, k) * mv;
    const zk = Math.max(kneel, cr, kl, LG ? 1 : 0), oldZ = .97 - kneel * .46 - cr * .55 - kl * .55, pz = lerp(pzLoco, oldZ, zk), add = lerp(.03, .055, k) * mv;
    // tiap kaki
    const legs = [];
    for (const [side, p0] of [[1, 0], [-1, Math.PI]]) {
      const q = ph + p0, c = ((q / TAU) % 1 + 1) % 1;
      footPath(c, st, R * (1 + off), R * (1 - off), lift, hl, f0);
      const xI = idleW * (SW ? (side < 0 ? .19 : -.17) : aim * (side < 0 ? .17 : -.1)), hipX = -Math.sin(ptw) * side * .1, hipZ = pzLoco - .05 + side * .1 * Math.sin(roll);
      const fxx = FP.x + xI, A = legIK(fxx - hipX, FP.z - hipZ);
      let th = A[0], kn = A[1];
      if (kneel) { th = th * (1 - kneel) - kneel * (side > 0 ? 0 : 1.5); kn = kn * (1 - kneel) + kneel * (side > 0 ? 1.62 : 1.5); }
      if (cr) { th = th * (1 - cr * .5) - 1.2 * cr; kn = kn * (1 - cr * .5) + 2.2 * cr; }
      if (LG) { th = LG[0] + (LG[2] || 0) * side; kn = LG[1] - (LG[2] || 0) * side * .6; }
      if (kl) { const K2 = kneelLeg(side, s.gz || 0); th = th + (K2[0] - th) * kl; kn = kn + (K2[1] - kn) * kl; }
      legs.push({ side, th, kn, c, fp: s.toe ? -s.toe : still ? 0 : FP.f });
    }
    const lean0 = lerp(.05, .25 - HV * .1, k) * mv;
    const lean = lean0 + aim * .1 * (1 - mv) + aim * mv * .05 + (SW ? .03 * idleW : 0), br = Math.sin(TIME_of(s) * 1.5 + (s.x + s.y) * .3) * .008 * (1 - mv);
    const spine = (lerp(.02, .075, k) * mv * aK * (1 - HV * .4)) * byLag;   // >0 di udara: dada membusung (C) · <0 mendarat: dada menekuk
    const pel = X.chain(U, X.T(-kneel * .08 - cr * .12 - kl * .1, sway, pz), X.rz(ptw), X.rx(roll));
    const twT = Math.cos(ph - .22) * lerp(.17, .36, k) * mv * (1 - aim * .75);   // bahu membalas panggul, sedikit tertinggal
    const tsq = (s.tsq || 1) * (1 + .028 * k * mv * by * (1 - HV * .5));
    const torY = twT - ptw * (1 - mv) * 0 + aim * idleW * .08 + (s.twist || 0);
    const tor = X.chain(pel, X.T(0, 0, .09), X.ry(-lean + spine * -1 - kneel * .1 - cr * .3 - kl * .16 + br), X.rz(torY), X.rx(-roll * .7), { c: [[1, 0, 0], [0, 1, 0], [0, 0, tsq]], t: [0, 0, 0] });
    const twistAll = ptw + torY;
    const nod = .075 * k * mv * aK * byLag + .025 * (1 - k) * mv * Math.cos(ph * 2 - .7);   // kepala tertinggal saat kompresi
    const head = X.chain(tor, X.T(.01 + aim * .045, aim * .018, .52 - aim * .012), X.ry(lean * .85 - aim * .1 + spine + nod + (s.neck || 0) + (s.gunP || 0) * aim * .7), X.rz(-twistAll + (s.look || 0)), X.rx(aim * .12));
    const rc = s.recoil || 0, swL = Math.sin(ph - .55), swZ = Math.sin(ph * 2 - .9);
    const U0 = X.chain(tor, X.rz(-twistAll), X.ry(lean * .9));   // kerangka bahu menghadap depan & tegak
    const shoulderPt = X.ap(X.chain(tor, X.I()), [.045, .135, .395]), rel = sub(shoulderPt, U0.t), sc2 = (s.sc || 1) * (s.sc || 1), iv = [dot(rel, U0.c[0]) / sc2, dot(rel, U0.c[1]) / sc2, dot(rel, U0.c[2]) / sc2];   // sumbu U0 ikut berskala: dibagi sc² agar bos besar tetap membidik dari bahunya
    const pump = clamp((k - .35) / .4, 0, 1) * mv * (1 - clamp(aim * 1.6, 0, 1)) * (s.two ? 0 : 1);   // lari: tangan kiri lepas & mengayun; senapan dibawa tangan kanan
    const aR = -Math.cos(ph - .3), aL = Math.cos(ph + .24 * Math.sin(ph) - .12);   // aL: lengan kiri memimpin — maju lebih cepat, kembali lebih lambat
    let gun, fore, grip, poleL = [-.12, -.62, -1], poleR = [-.25, lerp(.55, .85, aim), -1];
    const pumpL = () => { const f = (aL + 1) / 2; return X.ap(tor, [lerp(-.2, .3, f), lerp(-.27, -.13, f), lerp(.08, .4, f * f) + .05 * Math.sin(f * Math.PI)]); };
    if (SW && !RG) {   // Sang Jenderal: pedang panjang di tangan kanan, pedang lengkung di tangan kiri
      const a2 = clamp((aim - .3) / .6, 0, 1), rk2 = clamp(mv * 1.3, 0, 1);
      const G1 = X.chain(U0, X.T(.2 + swL * .012 * mv, .3, .74 + swZ * .012 * mv), X.rz(-1.02), X.ry(-.86), X.T(-.2, 0, .07));   // gagang setinggi kepala
      const G2 = X.chain(U0, X.T(.5 - rc * .05, .22, .5), X.rz(-.05), X.ry(.08 - rc * .06), X.T(-.2, 0, .07));   // menunjuk sasaran
      const G3 = X.chain(U0, X.T(-.02 + aR * .16, .36, .16 + aR * .05), X.rz(2.75 + aR * .14), X.ry(.55), X.T(-.2, 0, .07));   // lari: bilah terseret di belakang
      gun = blendM(blendM(G1, G3, rk2), G2, a2);
      grip = X.ap(gun, [.2, 0, -.07]);
      const fL = (aL + 1) / 2, FI = X.ap(U0, [.22, -.42, .1 + Math.sin(TIME_of(s) * 1.1) * .008]), FA = X.ap(U0, [.34, -.34, .28]), FR = X.ap(tor, [lerp(-.3, .26, fL), lerp(-.4, -.26, fL), lerp(.04, .36, fL * fL)]);
      fore = [lerp(lerp(FI[0], FR[0], rk2), FA[0], a2), lerp(lerp(FI[1], FR[1], rk2), FA[1], a2), lerp(lerp(FI[2], FR[2], rk2), FA[2], a2)];
      poleL = [-.5, -.8, -.6]; poleR = [-.3, .95, -.4];
    } else {
      const gA = X.chain(U0, X.T(iv[0], iv[1], iv[2] + .012), X.ry(rc * .1 + (s.gunP || 0)), X.T(-rc * .03, 0, 0));
      const gB = X.chain(U0, X.T(.05 + swL * .012 * mv, .15, .335 + swZ * .012 * mv), X.rz(-.34 + swL * .035 * mv), X.ry(-.56 + swZ * .025 * mv));   // siaga rendah: senjata tertinggal mengikuti langkah
      const gC = X.chain(tor, X.T(.13 + swZ * .012 * mv, .16 + swL * .018 * mv, .27 + swZ * .012), X.rz(-1.02), X.ry(.42), X.rx(-.32));   // silang dada (senjata berat / dua tangan)
      const gT = X.chain(U0, X.T(.0 + aR * .075, .215, .16 + aR * .03 + swZ * .008), X.ry(-.34 + aR * .05), X.rz(-.05 + aR * .03));   // senapan dibawa di samping oleh tangan kanan, ikut mengayun
      let g0 = run || k > .35 ? blendM(gB, s.two ? gC : gT, clamp(k * mv * 1.6, 0, 1)) : gB;
      gun = blendM(g0, gA, clamp(aim, 0, 1));
      if (s.sling) { const bk = X.chain(tor, X.T(-.2, 0, .2), X.ry(-1.2), X.rx(.55)), q = Math.min(1, s.sling); gun = q >= 1 ? bk : blendM(gun, bk, q); }
      grip = X.ap(gun, [.2, 0, -.07]); fore = X.ap(gun, [s.long ? .55 : .46, 0, -.01]);
      if (pump > 0) { const pl = pumpL(); fore = [lerp(fore[0], pl[0], pump), lerp(fore[1], pl[1], pump), lerp(fore[2], pl[2], pump)]; poleL = [lerp(-.12, -.8, pump), lerp(-.62, -.42, pump), lerp(-1, -.5, pump)]; poleR = [lerp(-.25, -.8, pump), lerp(.55, .4, pump), lerp(-1, -.55, pump)]; }
    }
    if (s.fly > 0) {   // CLAY terbang cepat: railgun dirapatkan sejajar badan, moncong searah laju; lengan kiri MENYAPU KE BELAKANG di sisi badan (kepala yang memimpin, seperti lepas landas di serial Lanterns); s.sweep 0 = kepalan masih di dada saat awalan lari. Menembak: badan & kedua tangan kembali ke railgun
      const fa = s.fly * (1 - clamp(aim * 1.4, 0, 1)), tmF = TIME_of(s), gF = X.chain(tor, X.T(.03, .275, -.19 + Math.sin(tmF * 2.1) * .006), X.ry(1.5708 - .04), X.rz(.03));
      gun = blendM(gun, gF, fa); grip = X.ap(gun, [.2, 0, -.07]);
      const fg = X.ap(gun, [s.long ? .55 : .46, 0, -.01]), swK = s.sweep || 0, fk = X.ap(tor, [lerp(.25, -.12 + Math.sin(tmF * 5.3) * .012, swK), lerp(-.05, -.43 + Math.sin(tmF * 3.7) * .012, swK), lerp(.2, -.05, swK)]);
      fore = [lerp(fg[0], fk[0], fa), lerp(fg[1], fk[1], fa), lerp(fg[2], fk[2], fa)];
      poleL = [lerp(poleL[0], lerp(-.25, -.55, swK), fa), lerp(poleL[1], -.9, fa), lerp(poleL[2], lerp(-.3, .05, swK), fa)]; poleR = [lerp(poleR[0], -.5, fa), lerp(poleR[1], .9, fa), lerp(poleR[2], -.2, fa)];
    }
    let KB = null;
    if (RG) {   // v2.12 CRAY: s.kat 0 = katana tersarung (railgun di tangan) → 1 = dihunus dua tangan (railgun ke punggung); s.kiai = bilah keluar dari sarung, tangan di gagang
      const kq = s.kq || [.42, .03, .2, .75, -.05, .66, .66, 0, -.75], kt = s.kat || 0, ki = s.kiai || 0;
      const K0 = X.chain(pel, kfr(VA(KSH.o, mul(KSH.d, -ki * .92)), KSH.d, [0, 0, 1])), K1 = X.chain(U0, kfr([kq[0], kq[1], kq[2]], [kq[3], kq[4], kq[5]], [kq[6], kq[7], kq[8]]));
      KB = kt >= .999 ? K1 : kt <= .001 ? K0 : blendM(K0, K1, kt);
      const hk = Math.max(kt, ki > 0 || s.kjce ? 1 : 0);
      if (hk > 0) {
        const gR = X.ap(KB, [-.075, 0, 0]), gL = kt > .5 ? X.ap(KB, [-.25, 0, 0]) : X.ap(pel, VA(KSH.o, mul(KSH.d, .1)));
        grip = [lerp(grip[0], gR[0], hk), lerp(grip[1], gR[1], hk), lerp(grip[2], gR[2], hk)]; fore = [lerp(fore[0], gL[0], hk), lerp(fore[1], gL[1], hk), lerp(fore[2], gL[2], hk)];
        gun = blendM(gun, X.chain(tor, X.T(-.2, 0, .2), X.ry(-1.2), X.rx(.55)), hk);   // railgun disandang di punggung
        poleR = [lerp(poleR[0], -.4, hk), lerp(poleR[1], .9, hk), lerp(poleR[2], -.5, hk)]; poleL = [lerp(poleL[0], -.4, hk), lerp(poleL[1], -.9, hk), lerp(poleL[2], -.5, hk)];
      }
    }
    if (s.hands && s.hands.k > 0) { const H = s.hands, q = Math.min(1, H.k), r = X.ap(tor, H.R), l = X.ap(tor, H.L); grip = [lerp(grip[0], r[0], q), lerp(grip[1], r[1], q), lerp(grip[2], r[2], q)]; fore = [lerp(fore[0], l[0], q), lerp(fore[1], l[1], q), lerp(fore[2], l[2], q)]; }
    const ts = X.ap(tor, RS), tl = X.ap(tor, LS), fw = X.ar(U, [1, 0, 0]);
    const SC = s.sc || 1, AK = s.armK || 1, aS = M => ({ c: [mul(M.c[0], SC), mul(M.c[1], SC), mul(M.c[2], SC * AK)], t: M.t });   // v2.12: tulang lengan dulu tidak ikut skala badan → lengan bos besar tampak pendek
    const eR = ik(ts, grip, .29 * SC * AK, .3 * SC * AK, X.ar(tor, poleR)), eL = ik(tl, fore, .29 * SC * AK, .3 * SC * AK, X.ar(tor, poleL));
    const B = [pel, tor, head, aS(X.look(ts, sub(eR, ts), fw)), aS(X.look(eR, sub(grip, eR), fw)), aS(X.look(tl, sub(eL, tl), fw)), aS(X.look(eL, sub(fore, eL), fw))];
    const feet = [];
    for (const L of legs) {
      const hip = X.chain(pel, X.T(0, L.side * .1, -.05), X.rz(-ptw * .8), X.rx(-L.side * add), X.ry(-L.th)), knee = X.chain(hip, X.T(0, 0, -THI), X.ry(-L.kn));
      B.push(hip, knee);
      const at = X.ap(knee, [0, 0, -SHN]), fr = kneel && L.side > 0 || kl && L.side > 0 ? X.cmp(knee, X.T(0, 0, -SHN)) : X.chain(X.T(at[0], at[1], at[2]), { c: U.c, t: [0, 0, 0] }, X.ry(L.fp));
      feet.push(fr);
    }
    B.push(gun, feet[0], feet[1]);
    for (let i = 0; i < 14; i++) X.write(B[i], out, i * 16);
    if (SW) {
      // overlap kain & rambut: tertinggal dari gerak, terangkat saat berlari; cincin api berputar pelan di punggung
      const tm = TIME_of(s), flK = s.flyK || 0, flow = lerp(.05, .72, k) * mv, cloth = (o, sg) => X.chain(pel, X.rz(-ptw * .9), X.T(-.1, 0, .08), X.ry(-flow - Math.sin(ph * 2 - 1.5 + o) * .05 * mv - Math.sin(tm * 1.7 + o) * .018 - flK * (.1 + Math.sin(tm * 17 + o * 3) * .09)), X.rx(sg * (Math.sin(ph - .9 + o) * .05 * mv + .02)), X.T(.1, 0, -.08));
      X.write(cloth(0, -1), out, 14 * 16); X.write(cloth(.7, 1), out, 15 * 16);
      X.write(X.chain(pel, X.rz(-ptw * .7), X.T(0, 0, .06), X.ry(-Math.sin(ph * 2 - 1.2) * .07 * mv - lean0 * .25 - k * .34 * mv + flK * (.1 + Math.sin(tm * 19) * .08)), X.rx(Math.sin(ph - .8) * .03 * mv), X.T(0, 0, -.06)), out, 18 * 16);
      const hd = head.t, ht = sub(hd, tor.t);
      X.write(X.chain(tor, X.T(.0, 0, .52), X.rz(-twistAll * .6), X.ry(lean * .85 - k * .62 * mv + Math.sin(ph * 2 - 1.3) * .05 * mv + (s.neck || 0) * .3 + flK * Math.sin(tm * 15) * .06), X.rx(Math.sin(ph - .9) * .04 * mv + flK * Math.sin(tm * 11) * .05), X.T(.01, 0, .02)), out, 16 * 16);
      if (s.sword === 2) X.write(KB, out, 17 * 16);   // CRAY: katana (nyala nosel tidak lagi dibuat — terbangnya tanpa api, jejaknya kontrail di fps-gl clayFx)
      else X.write(X.chain(tor, X.rz(-twistAll * .75), X.T(-.33, 0, .36), X.ry(lean * .55), X.rx(tm * .55)), out, 17 * 16);
    }
    return out;
  };
  /* ============================================================
     RAGDOLL prajurit: titik massa + batang tegar (Verlet), dimulai dari pose terakhir & laju lari, didorong arah tembakan / ledakan.
     Menapak tanah, tidak menembus gedung, lutut tidak menekuk ke belakang, senjata lepas dari tangan. Tidur setelah diam.
     Simpul: 0 panggul 1 dada 2 kepala · 3-5 bahu/siku/tangan kanan · 6-8 kiri · 9-11 pinggul/lutut/tumit kanan · 12-14 kiri · 15-16 senjata
     ============================================================ */
  const RAD = [.12, .13, .11, .07, .05, .05, .07, .05, .05, .09, .06, .06, .09, .06, .06, .02, .02];
  const STK = [[0, 1], [0, 3], [0, 6], [1, 3], [1, 6], [3, 6], [9, 12], [9, 0], [12, 0], [9, 1], [12, 1], [9, 3], [12, 6], [1, 2], [2, 3], [2, 6], [3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14], [15, 16]];
  const MINS = [[3, 5, .22], [6, 8, .22], [9, 11, .36], [12, 14, .36], [2, 0, .42]];
  MD.ragInit = function (s, v, imp, blast) {
    const o = new Float32Array(16 * 24); MD.humanPose(s, o);
    const ap = (b, q) => { const i = b * 16; return [o[i + 12] + o[i] * q[0] + o[i + 4] * q[1] + o[i + 8] * q[2], o[i + 13] + o[i + 1] * q[0] + o[i + 5] * q[1] + o[i + 9] * q[2], o[i + 14] + o[i + 2] * q[0] + o[i + 6] * q[1] + o[i + 10] * q[2]]; }, Z = [0, 0, 0];
    const N = [ap(0, Z), ap(1, [0, 0, .43]), ap(2, [0, 0, .14]), ap(3, Z), ap(4, Z), ap(4, [0, 0, -.3]), ap(5, Z), ap(6, Z), ap(6, [0, 0, -.3]), ap(7, Z), ap(8, Z), ap(12, Z), ap(9, Z), ap(10, Z), ap(13, Z), ap(11, [0, 0, -.03]), ap(11, [.85, 0, -.03])];
    const n = N.length, p = new Float64Array(n * 3), q = new Float64Array(n * 3), h = 1 / 90, rnd = () => Math.random() - .5;
    const gain = blast ? [1, 1, 1, .9, .9, .9, .9, .9, .9, .8, .8, .8, .8, .8, .8, 1.2, 1.2] : [.55, 1, 1.25, 1, .9, .85, 1, .9, .85, .3, .25, .2, .3, .25, .2, .5, .5];   // peluru: dada & kepala terdorong, kaki tertinggal → badan melipat
    for (let i = 0; i < n; i++) {
      const w = blast ? 1.5 : .35;
      p[i * 3] = N[i][0]; p[i * 3 + 1] = N[i][1]; p[i * 3 + 2] = N[i][2];
      q[i * 3] = N[i][0] - (v[0] * .75 + imp[0] * gain[i] + rnd() * w) * h; q[i * 3 + 1] = N[i][1] - (v[1] * .75 + imp[1] * gain[i] + rnd() * w) * h; q[i * 3 + 2] = N[i][2] - (imp[2] * gain[i] + rnd() * w) * h;
    }
    const L = STK.map(([a, b]) => Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1], N[a][2] - N[b][2]));
    const gz = F.gAt(s.x, s.y);
    return { p, q, L, t: 0, acc: 0, sleep: false, roof: s.z > gz + 1.5 ? s.z : null, B: null };
  };
  MD.ragStep = function (r, dt) {
    if (r.sleep) return false;
    const p = r.p, q = r.q, h = 1 / 90, n = p.length / 3;
    r.acc = Math.min(.05, r.acc + dt); r.t += dt;
    while (r.acc >= h) {
      r.acc -= h;
      let maxV = 0;
      for (let i = 0; i < n; i++) {
        const k = i * 3, x = p[k], y = p[k + 1], z = p[k + 2], vx = (x - q[k]) * .996, vy = (y - q[k + 1]) * .996, vz = (z - q[k + 2]) * .996;
        q[k] = x; q[k + 1] = y; q[k + 2] = z;
        p[k] = x + vx; p[k + 1] = y + vy; p[k + 2] = z + vz - 9.8 * h * h;
        maxV = Math.max(maxV, vx * vx + vy * vy + vz * vz);
        if (r.roof === null && F.solid(p[k], p[k + 1])) { p[k] = x; p[k + 1] = y; }   // dinding gedung
      }
      for (let it = 0; it < 5; it++) {
        for (let j = 0; j < STK.length; j++) {
          const a = STK[j][0] * 3, b = STK[j][1] * 3, dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5, e = (d - r.L[j]) / d * .5;
          p[a] += dx * e; p[a + 1] += dy * e; p[a + 2] += dz * e; p[b] -= dx * e; p[b + 1] -= dy * e; p[b + 2] -= dz * e;
        }
        for (const [A, B, m] of MINS) {
          const a = A * 3, b = B * 3, dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5; if (d >= m) continue;
          const e = (d - m) / d * .5; p[a] += dx * e; p[a + 1] += dy * e; p[a + 2] += dz * e; p[b] -= dx * e; p[b + 1] -= dy * e; p[b + 2] -= dz * e;
        }
        // lutut hanya menekuk ke depan badan
        const zx = p[3] - p[0], zy = p[4] - p[1], zz = p[5] - p[2], ry = [p[27] - p[36], p[28] - p[37], p[29] - p[38]], fx = ry[1] * zz - ry[2] * zy, fy = ry[2] * zx - ry[0] * zz, fz = ry[0] * zy - ry[1] * zx, fl = Math.hypot(fx, fy, fz) || 1e-5;
        for (const [H, K, A] of [[9, 10, 11], [12, 13, 14]]) {
          const hh = H * 3, kk = K * 3, aa = A * 3, off = ((p[kk] - (p[hh] + p[aa]) * .5) * fx + (p[kk + 1] - (p[hh + 1] + p[aa + 1]) * .5) * fy + (p[kk + 2] - (p[hh + 2] + p[aa + 2]) * .5) * fz) / fl; if (off >= .02) continue;
          const e = (.02 - off) * .5 / fl; for (const [ix, sg] of [[kk, 1], [hh, -.5], [aa, -.5]]) { p[ix] += fx * e * sg; p[ix + 1] += fy * e * sg; p[ix + 2] += fz * e * sg; }
        }
        for (let i = 0; i < n; i++) {
          const k = i * 3, g = (r.roof !== null ? r.roof : F.gAt(p[k], p[k + 1])) + RAD[i];
          if (p[k + 2] < g) { p[k + 2] = g; if (it === 4) { q[k] += (p[k] - q[k]) * .55; q[k + 1] += (p[k + 1] - q[k + 1]) * .55; } }   // gesekan tanah
        }
      }
      if (r.t > .9 && maxV < 2e-5) r.calm = (r.calm || 0) + h; else r.calm = 0;
    }
    if (r.t > 3.4 || r.calm > .25) { r.sleep = true; r.B = null; }
    return true;
  };
  const v3 = (p, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const frame = (z, yr, t) => { const x = nrm(crs(yr, z)), y = crs(z, x); return { c: [x, y, z], t }; };
  MD.ragPose = function (r, out, dz) {
    if (!r.B) {
      const p = r.p, P0 = v3(p, 0), C = v3(p, 1), Hd = v3(p, 2), S = [3, 4, 5, 6, 7, 8].map(i => v3(p, i)), Lg = [9, 10, 11, 12, 13, 14].map(i => v3(p, i)), z0 = nrm(sub(C, P0));
      const pel = frame(z0, sub(Lg[0], Lg[3]), P0), tor = frame(z0, sub(S[0], S[3]), add(P0, mul(z0, .09)));
      const hz = nrm(sub(Hd, C)), head = frame(hz, tor.c[1], add(C, mul(hz, .09)));
      const fw = tor.c[0], lf = pel.c[0], thR = X.look(Lg[0], sub(Lg[1], Lg[0]), lf), shR = X.look(Lg[1], sub(Lg[2], Lg[1]), lf), thL = X.look(Lg[3], sub(Lg[4], Lg[3]), lf), shL = X.look(Lg[4], sub(Lg[5], Lg[4]), lf);
      const G0 = v3(p, 15), G1 = v3(p, 16), gx = nrm(sub(G1, G0)), gy0 = crs([0, 0, 1], gx), gy = Math.hypot(gy0[0], gy0[1], gy0[2]) > .05 ? nrm(gy0) : [0, 1, 0], gun = { c: [gx, gy, crs(gx, gy)], t: add(G0, [0, 0, .03]) };
      const ftR = { c: shR.c, t: Lg[2] }, ftL = { c: shL.c, t: Lg[5] };
      const B = [pel, tor, head, X.look(S[0], sub(S[1], S[0]), fw), X.look(S[1], sub(S[2], S[1]), fw), X.look(S[3], sub(S[4], S[3]), fw), X.look(S[4], sub(S[5], S[4]), fw), thR, shR, thL, shL, gun, ftR, ftL];
      const a = new Float32Array(14 * 16); B.forEach((M, i) => X.write(M, a, i * 16));
      if (r.sleep) r.B = a; else { for (let i = 0; i < a.length; i++) out[i] = a[i]; for (let i = 0; i < 14; i++) out[i * 16 + 14] += dz; return out; }
    }
    const a = r.B; for (let i = 0; i < a.length; i++) out[i] = a[i]; for (let i = 0; i < 14; i++) out[i * 16 + 14] += dz;
    return out;
  };
  function TIME_of(s) { return F.P ? (F.P.time || 0) + (s.id || 0) : 0; }

  /* ============================================================
     BOS & KENDARAAN GENERASI KEDUA: lambung bersegi (hull), material gelap, sensor menyala, siluet mengancam.
     Tulang, poros (MD.KRAKEN, MD.TITAN, MD.RIG, ...) & ukuran hitbox tetap sama dengan model lama.
     ============================================================ */
  /* lambung dari penampang: secs = [[x, [[y,z],...]], ...] semua penampang sama jumlah titik; sisi datar (faset), tutup otomatis. fn(i,j) boleh set warna; balas false = lewati */
  P.hull = function (secs, fn, o) {
    o = o || {}; const nP = secs[0][1].length;
    for (let i = 0; i < secs.length - 1; i++) {
      const [x0, A] = secs[i], [x1, B] = secs[i + 1];
      for (let j = 0; j < nP; j++) {
        if (fn && fn(i, j) === false) continue;
        const k = (j + 1) % nP, Q = [[x0, A[j][0], A[j][1]], [x0, A[k][0], A[k][1]], [x1, B[k][0], B[k][1]], [x1, B[j][0], B[j][1]]];
        const cz = (A.reduce((s, p) => s + p[1], 0) + B.reduce((s, p) => s + p[1], 0)) / (2 * nP), cy = (A.reduce((s, p) => s + p[0], 0) + B.reduce((s, p) => s + p[0], 0)) / (2 * nP);
        let nn = nrm(crs(sub(Q[2], Q[0]), sub(Q[3], Q[1]))); const mid = [(x0 + x1) / 2, (A[j][0] + A[k][0] + B[j][0] + B[k][0]) / 4, (A[j][1] + A[k][1] + B[j][1] + B[k][1]) / 4]; if (dot(nn, sub(mid, [mid[0], cy, cz])) < 0) nn = mul(nn, -1);
        m_face(this, Q, nn);
      }
    }
    if (o.cap !== false) for (const [s, sg] of [[secs[0], -1], [secs[secs.length - 1], 1]]) { if (fn) fn(-1, -1); const x = s[0], Q = s[1]; const id = Q.map(p => this.V([x, p[0], p[1]], [sg * (secs[0][0] > secs[secs.length - 1][0] ? -1 : 1), 0, 0])); for (let j = 1; j < nP - 1; j++) this.tri(id[0], id[j], id[j + 1]); }
    return this;
  };
  function m_face(m, Q, n) { const a = m.V(Q[0], n, Q[0][1], Q[0][0]), b = m.V(Q[1], n, Q[1][1], Q[1][0]), c = m.V(Q[2], n, Q[2][1], Q[2][0]), d = m.V(Q[3], n, Q[3][1], Q[3][0]); m.quad(a, b, c, d); }
  const sym = a => a.concat(a.slice().reverse().map(p => [-p[0], p[1]]));   // profil separuh (sisi +y, atas → bawah) → penampang tertutup
  const MIR = fn => { for (const s of [1, -1]) fn(s); };
  /* tabung roda rantai: sisi samping sprocket + roda jalan + segmen rantai bertekstur */
  function trackUnit(m, x0, x1, y, w, zb, zt, col, nW) {
    const L = x1 - x0, cx = (x0 + x1) / 2, r = (zt - zb) / 2, DK2 = [18, 18, 19];
    m.set(DK2, .06, K.TRACK, 0); for (const yy of [y - w, y + w]) m.ext([[x0, zb + r * .9], [x0 + r * .7, zb], [x1 - r * .7, zb], [x1, zb + r * .9], [x1 - r * .25, zt], [x0 + r * .25, zt]], yy - .001, yy + .001);
    m.ext([[x0, zb + r * .9], [x0 + r * .7, zb], [x1 - r * .7, zb], [x1, zb + r * .9], [x1 - r * .25, zt], [x0 + r * .25, zt]], y - w, y + w);
    m.set([26, 26, 27], .2, K.METAL); const sd = y > 0 ? 1 : -1, rW = r * .72; for (let i = 0; i < nW; i++) { const x = x0 + (i + .5) * L / nW; m.cyl([x, y + sd * w, zb + r * .72], [x, y + sd * (w + .04), zb + r * .72], rW, rW, 12); m.set([40, 40, 42], .3, K.METAL).cyl([x, y + sd * (w + .04), zb + r * .72], [x, y + sd * (w + .06), zb + r * .72], rW * .35, rW * .35, 8); m.set([26, 26, 27], .2, K.METAL); }
    void cx; void col;
  }

  /* ---- KRAKEN: kapal perang udara rotor tandem. Hidung hiu bersegi, enam mata sensor merah, sirip punggung, sayap anhedral penuh roket, turet dagu 4 laras, dan LENGAN-LENGAN CAKAR berantai menjuntai dari perut ---- */
  function kraken(m) {
    const BK = [17, 18, 20], DK2 = [10, 10, 12], GM = [34, 36, 40], HZ = [92, 12, 10], RD = [255, 28, 16], OG = [255, 120, 30], RR = MD.KRAKEN.rot;
    const paint = () => m.set(BK, .34, K.PAINT, 0), pl = () => m.set(DK2, .3, K.PAINT, 0), gm = () => m.set(GM, .5, K.METAL);
    const H = [
      [14.5, sym([[.08, .72], [.14, .6], [.18, .42], [.12, .22], [.05, .1]])],
      [12.7, sym([[.5, 2.15], [1.0, 1.75], [1.42, 1.0], [1.05, .05], [.42, -.34]])],
      [9.7, sym([[1.02, 3.42], [1.92, 2.86], [2.32, 1.6], [1.88, 0], [.7, -.68]])],
      [5, sym([[1.22, 3.86], [2.18, 3.3], [2.6, 1.7], [2.1, -.1], [.82, -.78]])],
      [-6, sym([[1.22, 3.86], [2.18, 3.3], [2.6, 1.7], [2.1, -.1], [.82, -.78]])],
      [-11, sym([[1.08, 3.86], [1.98, 3.36], [2.38, 1.9], [1.72, .3], [.6, -.36]])],
      [-14.6, sym([[.8, 3.6], [1.38, 3.2], [1.58, 2.42], [1.08, 1.32], [.42, .92]])]];
    m.bone(0); paint(); m.hull(H, (i, j) => { const nearKeel = j === 3 || j === 4 || j === 5 || j === 6; (nearKeel ? pl : paint)(); });
    // pelat lapis tumpang-tindih di sisi (seperti sisik)
    MIR(s => { for (let i = 0; i < 7; i++) { const x = 7.2 - i * 2.35; pl(); m.push(X.chain(X.T(x, s * 2.62, 1.05), X.ry(-.12))); m.sq([0, 0, 0], [1.28, .11, .62], 6, 8, 4); m.pop(); gm(); for (const q of [-.9, .9]) m.sq([x + q, s * 2.74, 1.32], [.06, .03, .06], 3, 4, 2); } });
    // hidung: kaca gelap menyempit + 6 mata sensor + garis merah
    m.set([9, 10, 12], .95, K.GLASS); MIR(s => { m.face([[12.5, s * .95, 1.8], [12.5, s * .5, 2.14], [10.1, s * .95, 3.3], [10.1, s * 1.72, 2.82]], nrm([.35, s * .55, .75])); });
    MIR(s => { for (const [x, z, r] of [[12.75, 1.32, .15], [12.15, 1.62, .12], [11.6, 1.92, .09]]) { m.set([6, 6, 7], .4, K.PLAIN).sq([x, s * (1.42 + (12.75 - x) * .65), z], [r * 1.5, .06, r * 1.5], 3, 8, 4); m.set(RD, 0, K.EMIT).sq([x, s * (1.46 + (12.75 - x) * .65), z], [r, .05, r], 2.4, 8, 4); } m.set(HZ, .2, K.PAINT, 0).face([[12.7, s * 1.44, .92], [9.7, s * 2.34, 1.5], [9.7, s * 2.32, 1.3], [12.7, s * 1.3, .72]], [0, s, 0]); });
    // pilon rotor depan + menara rotor belakang bersudut
    paint(); m.hull([[RR + 2.4, sym([[.2, 3.8], [1.15, 3.8]])], [RR + 1.2, sym([[.2, 4.72], [.82, 4.45]])], [RR - 1.4, sym([[.2, 4.72], [.82, 4.45]])], [RR - 2.8, sym([[.2, 3.85], [1.25, 3.85]])]]);
    m.hull([[-RR + 2.6, sym([[.2, 3.85], [1.25, 3.85]])], [-RR + 1.2, sym([[.2, 6.66], [.78, 6.1]])], [-RR - 1.7, sym([[.2, 6.66], [.82, 6.1]])], [-RR - 5.2, sym([[.2, 3.6], [1.18, 3.3]])]]);
    // mesin kembar menempel menara, knalpot merah membara
    MIR(s => { gm(); m.cyl([-RR + 1.8, s * 1.72, 4.7], [-RR - 3, s * 1.72, 4.6], .68, .62, 14); pl(); m.cyl([-RR + 2.1, s * 1.72, 4.72], [-RR + 1.8, s * 1.72, 4.7], .5, .7, 14); m.set([8, 8, 9], .3, K.PLAIN).cyl([-RR + 2.11, s * 1.72, 4.72], [-RR + 2.12, s * 1.72, 4.72], .44, .44, 14); gm(); m.cyl([-RR - 3, s * 1.72, 4.6], [-RR - 3.9, s * 1.72, 4.55], .62, .42, 14, { cap1: false }); m.set(OG, 0, K.EMIT).cyl([-RR - 3.86, s * 1.72, 4.55], [-RR - 3.88, s * 1.72, 4.55], .4, .4, 12); });
    // sirip punggung bergerigi
    pl(); for (let i = 0; i < 6; i++) { const x = 5.6 - i * 1.55, h = .55 + (i % 2) * .22 + i * .06; m.ext([[x + .62, 3.84], [x - .14, 3.84 + h], [x - .62, 3.84]], -.05, .05); }
    // sayap anhedral + peluncur
    MIR(s => {
      paint(); m.face([[3.6, s * 2.55, 2.6], [.6, s * 2.55, 2.75], [.1, s * 6.7, 1.75], [2.6, s * 6.7, 1.65]], [0, 0, 1]); m.face([[3.6, s * 2.55, 2.45], [.6, s * 2.55, 2.6], [.1, s * 6.7, 1.6], [2.6, s * 6.7, 1.5]], [0, 0, -1]); m.face([[3.6, s * 2.55, 2.45], [3.6, s * 2.55, 2.6], [2.6, s * 6.7, 1.65], [2.6, s * 6.7, 1.5]], [1, 0, 0]);
      m.set(HZ, .2, K.PAINT, 0).face([[2.75, s * 6.15, 1.82], [.3, s * 6.15, 1.89], [.15, s * 6.7, 1.76], [2.6, s * 6.7, 1.66]], [0, 0, 1]);
      for (const [y, z] of [[3.5, 1.72], [5.2, 1.3]]) { pl(); m.sq([1.7, s * y, z + .5], [.9, .1, .2], 4, 6, 2); m.set([34, 35, 38], .35, K.PAINT, 0).cyl([.2, s * y, z], [3.6, s * y, z], .58, .58, 14); m.set([18, 18, 20], .3, K.METAL).cyl([3.6, s * y, z], [3.9, s * y, z], .58, .46, 14); m.set([6, 6, 6], .1, K.PLAIN); for (let a = 0; a < 7; a++) { const t = a / 7 * TAU, q = a === 0 ? 0 : .28; m.cyl([3.9, s * y + Math.cos(t) * q * (a ? 1 : 0), z + Math.sin(t) * q * (a ? 1 : 0)], [3.91, s * y + Math.cos(t) * q * (a ? 1 : 0), z + Math.sin(t) * q * (a ? 1 : 0)], .11, .11, 8); } }
      MIR(q => { for (let i = 0; i < 2; i++) { const y = 4.35 + q * .22, z = 1.3 - i * .36; m.set([60, 62, 60], .3, K.PAINT, 0).cyl([.6, s * y, z], [2.5, s * y, z], .11, .11, 8); m.set(HZ, .2, K.PAINT, 0).cyl([2.5, s * y, z], [2.86, s * y, z], .11, .01, 8); } });
      // minigun pintu dalam kubah bahu
      gm(); m.sq([9.1, s * 2.3, 2.1], [.42, .36, .42], 2.4, 8, 4); m.set([20, 20, 22], .5, K.METAL); for (let i = 0; i < 4; i++) { const t = i * 1.5708; m.cyl([9.1, s * 2.55 + Math.cos(t) * .08, 2.05 + Math.sin(t) * .08], [10.3, s * 3.5 + Math.cos(t) * .08, 2.05 + Math.sin(t) * .08], .036, .036, 5); }
    });
    // turet dagu 4 laras
    gm(); m.cyl([12.0, 0, -.3], [12.0, 0, -.65], .62, .7, 14); pl(); m.sq([12.25, 0, -.85], [.68, .62, .46], 2.4, 12, 6); m.set(RD, 0, K.EMIT).sq([12.86, .28, -.72], [.03, .1, .08], 2.4, 6, 2); m.set([18, 18, 20], .55, K.METAL); for (const [y, z] of [[.18, -.76], [-.18, -.76], [.18, -1.02], [-.18, -1.02]]) { m.cyl([12.7, y, z], [15.5, y, z - .1], .085, .07, 8); m.cyl([15.1, y, z - .09], [15.55, y, z - .1], .105, .105, 8); }
    // LENGAN CAKAR: enam rantai ruas melengkung menjuntai dari perut, ujung bercakar tiga
    for (const [x, sLen] of [[6.6, 4.2], [.8, 5.2], [-5, 4.5]]) MIR(s => {
      gm(); m.sq([x, s * 1.1, -.7], [.5, .42, .28], 2.4, 8, 4); let P0 = [x, s * 1.15, -.86], a = 1.02, r = .26; const NS = 7;
      for (let i = 0; i < NS; i++) { const L = sLen / NS; a += .06 * (i < 3 ? 1 : -1); const P1 = [P0[0] - .12 - Math.sin(i * .9) * .12, P0[1] + s * L * Math.sin(a) * .5, P0[2] - L * Math.cos(a) - L * .45]; (i % 2 ? pl : gm)(); m.cyl(P0, P1, r, r * .88, 9); m.sph(P1, [r * 1.05, r * 1.05, r * 1.05], 8, 4); P0 = P1; r *= .88; }
      m.set([12, 12, 14], .5, K.METAL); for (const t of [0, 2.09, 4.19]) { const c = Math.cos(t), sn = Math.sin(t), mid = [P0[0] + c * .34, P0[1] + sn * .34, P0[2] - .26], tip = [P0[0] + c * .1, P0[1] + sn * .1, P0[2] - .86]; m.cyl(P0, mid, .1, .07, 6); m.cyl(mid, tip, .07, .004, 6); }
      m.set(RD, 0, K.EMIT).sq(P0, [.08, .08, .08], 2, 6, 2);
    });
    // lampu & sirip ramp belakang
    m.set(RD, 0, K.EMIT).sq([-RR, 0, 6.72], [.14, .14, .06], 2.4, 6, 2).sq([-14.6, 0, 3.1], [.05, .55, .05], 3, 4, 1); pl(); MIR(s => m.ext([[-11.6, .4], [-14.2, -.9], [-14.9, 1.1], [-13.2, 1.2]], s * .9 - .05, s * .9 + .05));
    // rotor
    for (const [b, x, z] of [[3, RR, 4.9], [4, -RR, 6.9]]) {
      m.bone(b).set([16, 16, 18], .4, K.METAL).cyl([x, 0, z - .35], [x, 0, z + .18], .42, .3, 10);
      m.set([22, 22, 24], .25, K.METAL); for (let i = 0; i < 4; i++) { m.push(X.chain(X.T(x, 0, 0), X.rz(i * 1.5708))); m.ext([[.4, z + .1], [8.8, z + .05], [9, z + .1], [8.8, z + .14], [.4, z + .14]], -.26, .26); m.set(HZ, .2, K.PAINT, 0).sq([8.55, 0, z + .1], [.42, .27, .05], 4, 4, 1); m.set([22, 22, 24], .25, K.METAL); m.pop(); }
      m.set([30, 30, 32], .1, K.ROTOR, 9).cyl([x, 0, z + .08], [x, 0, z + .1], 9, 9, 28);
    }
    return m.done();
  }

  /* ---- TITAN: peluncur strategis 8 gandar. Kabin baji baja kembar, rok lapis tebal, tabung raksasa bercincin dengan kepala hazard + dua tabung pengiring, sistem CIWS, kaki hidraulik, cerobong membara ---- */
  function titan(m) {
    const L = 11, Wd = 2, BD = [26, 28, 26], DK2 = [15, 16, 16], GM = [40, 42, 42], CN = [32, 36, 30], RD = [255, 28, 16], HZ = [186, 142, 24], P0 = MD.TITAN.pv, TIRE = [14, 14, 14];
    const paint = () => m.set(BD, .25, K.PAINT, 0), pl = () => m.set(DK2, .22, K.PAINT, 0), gm = () => m.set(GM, .45, K.METAL);
    m.bone(0);
    // 8 gandar: ban besar berpola + velg
    for (const x of [9.2, 7.4, 4.6, 2.8, -2.6, -4.4, -7.2, -9]) MIR(s => { m.set(TIRE, .05, K.TRACK, 0).cyl([x, s * (Wd - .58), .8], [x, s * (Wd + .06), .8], .8, .8, 18); m.set([46, 46, 44], .35, K.METAL).cyl([x, s * (Wd + .06), .8], [x, s * (Wd + .09), .8], .44, .44, 10); m.set([20, 20, 20], .3, K.METAL).cyl([x, s * (Wd + .09), .8], [x, s * (Wd + .13), .8], .16, .16, 8); });
    // sasis
    paint(); m.hull([[L - .4, sym([[1.05, 2.15], [Wd - .1, 2.05], [Wd - .1, 1.32], [1.1, 1.08]])], [-L + .3, sym([[1.05, 2.15], [Wd - .1, 2.05], [Wd - .1, 1.32], [1.1, 1.08]])]]);
    // rok lapis di atas roda + panel
    MIR(s => { for (let i = 0; i < 6; i++) { const x = 8.1 - i * 3.3; pl(); m.push(X.chain(X.T(x, s * (Wd + .14), 1.72), X.rx(s * -.06))); m.sq([0, 0, 0], [1.6, .1, .52], 7, 8, 4); m.pop(); gm(); for (const q of [-1.3, 1.3]) m.sq([x + q, s * (Wd + .25), 1.98], [.07, .025, .07], 3, 4, 2); } });
    // kabin baji kembar: kaca celah merah, bahu tinggi, moncong rudal lewat di tengah
    MIR(s => {
      const y0 = 1.06, y1 = 2.2, S = (a, b, z0, z1) => [[s * a, z1], [s * b, z1 - .2], [s * b, z0], [s * a, z0]];
      paint(); m.hull([[L + .55, S(y0, y1 - .12, 2.12, 2.72)], [L - .1, S(y0, y1, 2.1, 3.65)], [L - 1.2, S(y0, y1, 2.1, 4.48)], [L - 3.1, S(y0, y1, 2.1, 4.5)]]);
      m.set([6, 6, 7], .9, K.GLASS).face([[L + .02, s * y0, 3.5], [L + .02, s * (y1 - .03), 3.35], [L - .98, s * (y1 - .03), 4.15], [L - .98, s * y0, 4.32]], nrm([.62, 0, .78]));
      m.set(RD, 0, K.EMIT).face([[L + .1, s * (y0 + .06), 3.32], [L + .1, s * (y1 - .08), 3.2], [L + .05, s * (y1 - .08), 3.3], [L + .05, s * (y0 + .06), 3.42]], [1, 0, .4]);
      m.set([220, 190, 130], .5, K.EMIT, 0).sq([L + .56, s * 1.76, 2.42], [.02, .16, .08], 3, 4, 1);
      pl(); m.sq([L + .62, s * 1.62, 2.2], [.16, .52, .18], 4, 6, 3); m.sq([L - 1.6, s * (y1 + .05), 3.3], [1.3, .08, .78], 7, 8, 4);
      gm(); m.cyl([L - 1.3, s * 2.32, 4.0], [L - .4, s * 2.48, 4.0], .05, .05, 6);
      // kaki hidraulik yang ditekuk
      for (const x of [L - 3.6, -L + 1.2]) { gm(); m.rod([x, s * 1.9, 1.6], [x, s * 2.5, .5], .13, 8); pl(); m.sq([x, s * 2.5, .28], [.42, .34, .1], 4, 8, 4); }
    });
    // badan belakang: modul generator, kisi, CIWS kembar, radar kotak
    paint(); m.hull([[-L + 3.2, sym([[1.3, 3.25], [Wd - .1, 3.0], [Wd - .1, 2.1]])], [-L - .2, sym([[1.2, 3.25], [Wd - .2, 3.0], [Wd - .2, 2.1]])]]);
    pl(); for (let i = 0; i < 5; i++) m.sq([-L + .55 + i * .55, 0, 3.27], [.2, 1.05, .03], 6, 4, 2);
    MIR(s => {
      gm(); m.cyl([-L + 1.2, s * 1.42, 3.2], [-L + 1.2, s * 1.42, 3.7], .4, .34, 12); pl(); m.sq([-L + 1.25, s * 1.42, 3.92], [.48, .36, .28], 2.4, 10, 4); m.set(RD, 0, K.EMIT).sq([-L + 1.72, s * 1.42, 3.98], [.02, .12, .04], 3, 3, 1);
      m.set([18, 18, 20], .5, K.METAL); for (const q of [-.09, .09]) m.cyl([-L + 1.6, s * 1.42 + q, 3.86], [-L + 3.3, s * 1.42 + q, 3.96], .05, .05, 6);
      // cerobong membara
      m.set([18, 18, 18], .4, K.METAL).cyl([-L + .2, s * .8, 3.2], [-L + .2, s * .8, 4.7], .22, .18, 10); m.set(RD, 0, K.EMIT).cyl([-L + .2, s * .8, 4.7], [-L + .2, s * .8, 4.72], .15, .15, 10);
      m.set(RD, 0, K.EMIT).sq([-L - .22, s * 1.5, 2.2], [.03, .22, .08], 3, 3, 1);
    });
    gm(); m.rod([-3, 1.5, 2.2], [-3, 1.5, 5.1], .07, 6); m.set([28, 28, 30], .4, K.METAL).sq([-3, 1.5, 5.2], [.1, .75, .32], 5, 6, 2); m.set(RD, 0, K.EMIT).sq([-3, 1.5, 5.56], [.05, .05, .05], 2, 4, 2);
    pl(); m.sq([-.9, 0, 2.32], [1.6, 1.7, .2], 5, 8, 2);
    // PELUNCUR (tulang 2)
    m.bone(2);
    gm(); MIR(s => { m.sq([0, s * .78, 2.48], [L - 1.6, .13, .2], 6, 6, 2); });
    gm(); for (const x of [-8.2, -3, 2.2, 7.2]) { pl(); m.lathe([x, 0, 3.4], [[1.03, -.6], [1.3, -.3], [1.3, .3], [1.03, .6]], 18); void x; break; }
    // tabung raksasa: rangka + cincin + kepala hazard
    m.set(CN, .3, K.PAINT, 0).cyl([P0[0] + .3, 0, 3.4], [L - .2, 0, 3.4], .98, .98, 22);
    m.set([26, 26, 26], .4, K.METAL).cyl([P0[0] + .1, 0, 3.4], [P0[0] + .3, 0, 3.4], 1.08, 1.08, 22).cyl([L - .2, 0, 3.4], [L + .02, 0, 3.4], 1.08, .98, 22);
    for (const x of [-6.6, -3.2, .2, 3.6, 7]) { m.set([28, 28, 28], .4, K.METAL).cyl([x, 0, 3.4], [x + .34, 0, 3.4], 1.06, 1.06, 22); gm(); for (let a = 0; a < 8; a++) { const t = a / 8 * TAU + .4; m.sq([x + .17, Math.cos(t) * 1.07, 3.4 + Math.sin(t) * 1.07], [.09, .05, .05], 2.6, 4, 2); } }
    m.set(HZ, .3, K.PAINT, 0).cyl([L - 2.2, 0, 3.4], [L - 1.6, 0, 3.4], 1, 1, 22); m.set([16, 16, 16], .3, K.PAINT, 0); for (let a = 0; a < 8; a++) { const t = a / 8 * TAU; m.sq([L - 1.9, Math.cos(t) * 1.005, 3.4 + Math.sin(t) * 1.005], [.3, .14 * Math.abs(Math.sin(t)) + .02, .14 * Math.abs(Math.cos(t)) + .02], 4, 4, 1); }
    m.set(RD, 0, K.EMIT).cyl([L + .02, 0, 3.4], [L + .04, 0, 3.4], .62, .62, 20); m.set([10, 10, 10], .2, K.PLAIN).cyl([L + .04, 0, 3.4], [L + .05, 0, 3.4], .46, .46, 20);
    // dua tabung pengiring
    MIR(s => { m.set(CN, .3, K.PAINT, 0).cyl([-7, s * 1.28, 2.95], [5.2, s * 1.28, 2.95], .34, .34, 12); m.set(HZ, .3, K.PAINT, 0).cyl([5.2, s * 1.28, 2.95], [5.5, s * 1.28, 2.95], .34, .34, 12); m.set([24, 24, 24], .3, K.METAL).cyl([5.5, s * 1.28, 2.95], [6.2, s * 1.28, 2.95], .34, .01, 12); });
    return m.done();
  }

  const OLD_AIR = MD.aircraft, OLD_VEH = MD.vehicle;
  const NEW_AIR = { KRAKEN: kraken }, NEW_VEH = { TITAN: titan };
  /* satelit HELIOS-7: sumbu optik -z (emitor menghadap sasaran). Tulang 0 badan, 1/2 sayap surya kanan/kiri berporos di pangkalnya (dibuat di sekitar titik asal agar mudah dilipat) */
  MD.helios = function () {
    const m = new Mesh(), GOLD = [204, 160, 62], WHT = [214, 216, 220], DK = [46, 48, 54], CELL = [18, 30, 74], FRM = [150, 154, 162];
    m.bone(0);
    m.set(GOLD, .6, K.METAL).cyl([0, 0, -2], [0, 0, 3], 2.7, 2.7, 6);                                                  // bus segi enam berselimut emas
    m.set(FRM, .5, K.METAL); for (const z of [-2, .5, 3]) m.cyl([0, 0, z - .08], [0, 0, z + .08], 2.82, 2.82, 6);    // rangka
    m.set(WHT, .3, K.PLAIN).cyl([0, 0, 3], [0, 0, 5.2], 2.1, 1.7, 8);                                                  // modul atas (radiator)
    m.set(DK, .4, K.METAL); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .26, c = Math.cos(a), s = Math.sin(a); m.push(X.T(c * 2.05, s * 2.05, 4.1)); m.push(X.rz(a)); m.box([0, 0, 0], [.06, .42, .9]); m.pop(); m.pop(); }
    m.set(WHT, .4, K.PLAIN).cyl([0, 0, 5.2], [0, 0, 5.9], .5, .5, 8); m.set(FRM, .6, K.METAL).cyl([0, 0, 5.9], [0, 0, 6.7], .16, 1.7, 14);   // piringan antena
    m.set(DK, .5, K.METAL).rod([1.9, 1.2, 3.4], [3.1, 2.3, 6], .07, 5).rod([-1.9, 1.2, 3.4], [-3.1, 2.3, 6], .07, 5);  // tiang antena
    m.set(WHT, .4, K.PLAIN).cyl([0, 0, -2], [0, 0, -3.3], 2.3, 1.75, 12);                                              // leher emitor
    m.set(DK, .55, K.METAL).cyl([0, 0, -3.3], [0, 0, -9.2], 1.55, 1.75, 16);                                           // laras emitor
    m.set(GOLD, .6, K.METAL); for (const z of [-4.4, -6, -7.6]) m.cyl([0, 0, z - .22], [0, 0, z + .22], 1.92, 1.92, 16);   // cincin pemfokus
    m.set(FRM, .6, K.METAL).cyl([0, 0, -9.2], [0, 0, -10.2], 1.75, 2.15, 16);                                           // corong ujung
    m.set([255, 164, 72], 0, K.EMIT).cyl([0, 0, -10.05], [0, 0, -10.25], 1.8, 1.8, 16);                                 // lensa menyala
    m.set(DK, .5, K.METAL); for (const [x, y] of [[3.3, 1.4], [-3.3, 1.4], [3.3, -1.4], [-3.3, -1.4]]) { m.box([x * .86, y, 0], [.55, .22, .22]); m.cyl([x, y, .9], [x, y, -.5], .4, .4, 8); m.cyl([x, y, -.5], [x, y, -1.5], .32, .62, 10); }   // 4 pendorong pengereman
    m.set([255, 60, 50], 0, K.EMIT).box([0, 0, 6.85], [.1, .1, .1]);
    for (const [b, sg] of [[1, 1], [2, -1]]) {
      m.bone(b).set(FRM, .5, K.METAL).cyl([0, 0, 0], [0, sg * 15.6, 0], .1, .1, 6);                                     // batang penyangga
      for (let j = 0; j < 3; j++) {
        const y0 = sg * (1.1 + j * 4.9);
        m.set(CELL, .8, K.METAL).box([0, y0 + sg * 2.2, 0], [3.1, 2.2, .05]); m.set(FRM, .5, K.METAL).box([0, y0 + sg * 2.2, .03], [3.2, .05, .06]);
        m.box([3.15, y0 + sg * 2.2, 0], [.05, 2.25, .07]).box([-3.15, y0 + sg * 2.2, 0], [.05, 2.25, .07]).box([0, y0 + sg * .02, 0], [3.2, .05, .07]).box([0, y0 + sg * 4.38, 0], [3.2, .05, .07]);
        for (let i = 1; i < 6; i++) m.box([-3.1 + i * 1.033, y0 + sg * 2.2, .055], [.012, 2.2, .006]);                  // kisi sel surya
      }
    }
    return m.done();
  };
  MD.aircraft = function (type, palK) { return NEW_AIR[type] ? NEW_AIR[type](new Mesh(), palK) : OLD_AIR(type, palK); };
  MD.vehicle = function (type, palK) { return NEW_VEH[type] ? NEW_VEH[type](new Mesh(), palK) : OLD_VEH(type, palK); };

  /* ---- palet kendaraan lama digelapkan (tidak lagi pucat seperti mainan) ---- */
  MD.VPAL.B = { body: [62, 72, 46], dark: [40, 46, 32], camo: 1 }; MD.VPAL.US = { body: [120, 106, 78], dark: [84, 74, 56], camo: 2 }; MD.VPAL.R = { body: [56, 58, 54], dark: [34, 36, 34], camo: 3 };
  const VP = k => MD.VPAL[k] || MD.VPAL.R;
  const tintMesh = (o, k) => { const v = o.v; for (let i = 0; i < v.length; i += MD.STRIDE) { if (Math.round(v[i + 10]) === K.EMIT) continue; v[i + 6] *= k; v[i + 7] *= k; v[i + 8] *= k; } return o; };
  const RED = [255, 28, 16], OGE = [255, 120, 30], CYN = [90, 215, 255];
  const hazard = (m, x, y, z, hx, hz) => { m.set([176, 134, 26], .25, K.PAINT, 0).sq([x, y, z], [hx, .012, hz], 5, 6, 1); };

  /* tank utama: lambung baji, rok bertingkat, kubah panah, meriam bersarung termal, RWS di kubah */
  function tankBase(m, palK, type) {
    const p = VP(palK), b = p.body, d = p.dark, cam = p.camo, s = type === 'TANK' ? 1 : type === 'LTANK' ? .82 : .86, L = 3.3 * s, Wd = 1.65 * s;
    const paint = () => m.set(b, .15, K.PAINT, cam), dk2 = () => m.set(d, .15, K.PAINT, 0), gm = () => m.set([36, 37, 38], .35, K.METAL);
    m.bone(0);
    MIR(q => trackUnit(m, -L - .15, L + .35, q * (Wd - .3), .28, .03, 1.02, 0, 7));
    paint(); m.hull([[L + .62, sym([[Wd - .58, .96], [Wd - .52, .84], [Wd - .62, .5]])], [L - .75, sym([[Wd - .5, 1.6], [Wd - .36, 1.5], [Wd - .62, .44]])], [-L + .4, sym([[Wd - .5, 1.72], [Wd - .36, 1.58], [Wd - .62, .44]])], [-L - .38, sym([[Wd - .56, 1.52], [Wd - .44, 1.42], [Wd - .62, .6]])]]);
    MIR(q => {
      for (let i = 0; i < 5; i++) { const x = L - .55 - i * (2 * L - .1) / 5; dk2(); m.push(X.chain(X.T(x, q * (Wd + .03), 1.02), X.rx(q * -.08))); m.sq([0, 0, 0], [(2 * L - .1) / 10 - .02, .05, .36], 8, 8, 4); m.pop(); }
      paint(); m.sq([0, q * (Wd - .12), 1.44], [L + .1, .24, .05], 8, 8, 4);
      m.set([220, 190, 120], .5, K.EMIT, 0).sq([L + .62, q * (Wd - .75), 1.0], [.02, .09, .05], 3, 4, 1); gm(); m.sq([L + .55, q * (Wd - .72), .68], [.08, .1, .1], 3, 5, 2);
    });
    dk2(); for (let i = 0; i < 6; i++) m.sq([-L - .02 + i * .34, 0, 1.73 - i * .012], [.13, .82, .02], 6, 4, 1);   // kisi mesin
    gm(); m.sq([L - .75, -.52, 1.64], [.3, .28, .05], 3, 6, 2); m.cyl([-L - .32, .8, 1.28], [-L - .44, .8, 1.28], .1, .1, 8); m.cyl([-L - .32, -.8, 1.28], [-L - .44, -.8, 1.28], .1, .1, 8);
    m.bone(1);
    if (type === 'ARTY') {
      paint(); m.hull([[1.25, sym([[.86, 3.08], [1.22, 2.78], [1.25, 1.78]])], [-1.7, sym([[.9, 3.12], [1.26, 2.82], [1.3, 1.78]])], [-2.45, sym([[.72, 3.05], [1.08, 2.76], [1.1, 2.0]])]]);
      gm(); m.cyl([-.3, .75, 3.1], [-.3, .75, 3.3], .24, .22, 10); m.rod([-.3, .75, 3.3], [-.1, .75, 3.46], .03, 5); m.rod([-1.3, -.8, 3.1], [-1.3, -.8, 4.4], .012, 3); dk2(); m.sq([-2.45, 0, 2.5], [.14, 1, .35], 5, 6, 2);
    } else if (type === 'ZSU') {
      paint(); m.hull([[1.2, sym([[.72, 2.72], [1.1, 2.42], [1.12, 1.72]])], [-1.5, sym([[.76, 2.76], [1.12, 2.46], [1.16, 1.72]])], [-1.95, sym([[.62, 2.7], [.92, 2.42], [.94, 1.9]])]]);
      m.set(d, .2, K.PAINT, 0); MIR(q => m.sq([.2, q * 1.18, 2.42], [.6, .1, .22], 4, 6, 2));
    } else {
      paint(); m.hull([[2.12 * s, sym([[.3 * s, 2.02], [.42 * s, 1.95], [.3 * s, 1.78]])], [1.05 * s, sym([[.72 * s, 2.6], [1.26 * s, 2.36], [1.3 * s, 1.76]])], [-1.4 * s, sym([[.82 * s, 2.66], [1.34 * s, 2.42], [1.36 * s, 1.76]])], [-2.42 * s, sym([[.6 * s, 2.56], [1.02 * s, 2.36], [1.02 * s, 1.92]])]]);
      MIR(q => { dk2(); for (let i = 0; i < 3; i++) m.sq([(.85 - i * .5) * s, q * 1.34 * s, 2.06], [.22 * s, .05, .24], 4, 5, 2); gm(); for (let i = 0; i < 3; i++) m.cyl([1.15 * s, q * (1.0 + i * .075) * s, 2.36 + i * .07], [1.42 * s, q * (1.09 + i * .075) * s, 2.46 + i * .07], .055, .055, 6); });
      gm(); m.sq([-2.46 * s, 0, 2.2], [.1, .9 * s, .28], 5, 6, 3); m.cyl([-.75 * s, .55 * s, 2.62], [-.75 * s, .55 * s, 2.82], .3 * s, .27 * s, 12); m.sq([-.75 * s, .55 * s, 2.87], [.2 * s, .2 * s, .06], 3, 8, 2);
      m.rod([-.7 * s, -.45 * s, 2.64], [-.7 * s, -.45 * s, 2.9], .04, 6); m.set([24, 24, 26], .4, K.METAL).sq([-.65 * s, -.45 * s, 2.97], [.26, .1, .1], 4, 6, 2); m.rod([-.4 * s, -.45 * s, 2.98], [.35 * s, -.45 * s, 2.98], .022, 5); m.set([20, 40, 60], .9, K.GLASS).sq([-.38 * s, -.45 * s, 3.08], [.03, .05, .04], 3, 4, 1);
      m.set([20, 20, 22], .3, K.PLAIN).rod([-2 * s, .75 * s, 2.5], [-2.15 * s, .75 * s, 4.0], .012, 3).rod([-2 * s, -.75 * s, 2.5], [-2.15 * s, -.75 * s, 3.6], .012, 3); m.set([30, 34, 40], .6, K.METAL).sq([.45 * s, .78 * s, 2.58], [.2, .14, .12], 3, 6, 2);
    }
    m.bone(2);
    if (type === 'ZSU') { gm(); MIR(q => { m.sq([.4, q * .88, 2.45], [.32, .09, .12], 4, 5, 2); m.cyl([.5, q * .88, 2.45], [3.1, q * .88, 2.55], .055, .045, 7); m.cyl([2.8, q * .88, 2.54], [3.2, q * .88, 2.56], .075, .07, 7); }); m.bone(4); gm(); m.rod([-.7, 0, 2.72], [-.7, 0, 3.2], .1, 8); m.set([44, 46, 46], .5, K.METAL).ell([[3.16, .78, .78, -.7], [3.3, .55, .55, -.7]], 16, {}); m.bone(2); }
    else {
      const z = type === 'ARTY' ? 2.5 : 2.15, xe = type === 'ARTY' ? 7.2 : 5.7 * s, r = type === 'LTANK' ? .075 : .1;
      paint(); m.sq([1.74 * s, 0, z], [.34, .46, .32], 3.2, 10, 4);
      gm(); m.cyl([1.9 * s, 0, z], [xe, 0, z], r + .025, r, 12);
      m.set([26, 26, 27], .3, K.METAL); for (let i = 0; i < 3; i++) { const k = (i + .5) / 3, x = lerp(2.3 * s, xe - .3, k); m.cyl([x - .28, 0, z], [x + .28, 0, z], r + .05, r + .05, 12); }   // sarung termal
      m.cyl([lerp(2.1 * s, xe, .42), 0, z], [lerp(2.1 * s, xe, .42) + .55, 0, z], r + .1, r + .1, 12);   // pengisap asap
      if (type === 'ARTY') { m.cyl([xe - .35, 0, z], [xe, 0, z], r + .15, r + .12, 10); } else m.cyl([xe - .12, 0, z], [xe + .02, 0, z], r + .045, r + .045, 10);
    }
    return m.done();
  }
  /* IFV 8×8: lambung V bersudut, kubah kecil + kanon 30 mm + ATGM, sangkar slat di belakang */
  function ifv(m, palK) {
    const p = VP(palK), b = p.body, d = p.dark, cam = p.camo, L = 3.2, Wd = 1.4;
    const paint = () => m.set(b, .15, K.PAINT, cam), dk2 = () => m.set(d, .15, K.PAINT, 0), gm = () => m.set([36, 37, 38], .35, K.METAL);
    m.bone(0); for (const x of [-2.2, -.75, .75, 2.2]) MIR(q => { m.set([14, 14, 14], .05, K.TRACK, 0).cyl([x, q * (Wd - .34), .55], [x, q * (Wd + .04), .55], .55, .55, 18); m.set([48, 48, 46], .35, K.METAL).cyl([x, q * (Wd + .04), .55], [x, q * (Wd + .07), .55], .28, .28, 10); m.set([24, 24, 24], .3, K.METAL).cyl([x, q * (Wd + .07), .55], [x, q * (Wd + .1), .55], .1, .1, 8); });
    paint(); m.hull([[L + .5, sym([[Wd - .5, 1.12], [Wd - .36, 1], [Wd - .55, .55], [.3, .35]])], [L - .9, sym([[Wd - .56, 1.86], [Wd - .12, 1.56], [Wd - .32, .62], [.3, .32]])], [-L + .3, sym([[Wd - .56, 2], [Wd - .1, 1.66], [Wd - .32, .62], [.3, .32]])], [-L - .05, sym([[Wd - .56, 1.96], [Wd - .12, 1.62], [Wd - .34, .72], [.34, .5]])]]);
    MIR(q => { dk2(); for (let i = 0; i < 4; i++) m.sq([L - 1.2 - i * 1.25, q * (Wd - .08), 1.4], [.56, .06, .2], 6, 6, 3); m.set([220, 190, 120], .5, K.EMIT, 0).sq([L + .5, q * (Wd - .68), 1], [.02, .08, .05], 3, 3, 1); });
    m.set([8, 10, 12], .9, K.GLASS).face([[L - .4, -.55, 1.62], [L - .4, .55, 1.62], [L - .85, .55, 1.84], [L - .85, -.55, 1.84]], nrm([.45, 0, .9]));
    gm(); for (let i = 0; i < 7; i++) m.sq([-L - .28, 0, .78 + i * .17], [.016, Wd - .45, .012], 3, 4, 1); MIR(q => m.rod([-L + .02, q * (Wd - .55), 1.8], [-L - .28, q * (Wd - .55), 1.8], .018, 4));
    m.bone(1); paint(); m.hull([[.95, sym([[.32, 2.46], [.62, 2.28], [.68, 2.0]])], [-.9, sym([[.5, 2.56], [.85, 2.34], [.88, 2.0]])], [-1.5, sym([[.42, 2.48], [.68, 2.3], [.7, 2.04]])]]);
    gm(); m.sq([-.4, -.4, 2.62], [.15, .13, .08], 3, 6, 2); m.rod([-1, .5, 2.5], [-1.1, .5, 3.7], .012, 3); m.set([28, 30, 26], .3, K.PAINT, 0).sq([-.3, .92, 2.34], [.42, .1, .14], 4, 6, 2);
    m.set([30, 26, 22], 0, K.PLAIN); m.bone(2); gm(); m.sq([1.05, 0, 2.2], [.25, .2, .16], 3, 6, 3); m.cyl([1.2, 0, 2.2], [3.3, 0, 2.2], .045, .04, 8); m.cyl([3.0, 0, 2.2], [3.32, 0, 2.2], .06, .055, 8); m.cyl([1.6, 0, 2.2], [1.95, 0, 2.2], .075, .075, 8);
    return m.done();
  }
  /* jip tempur terbuka: rangka tabung, panel bersudut, senapan mesin pada lingkar */
  function jeep(m, palK) {
    const p = VP(palK), b = p.body, d = p.dark, cam = p.camo, paint = () => m.set(b, .16, K.PAINT, cam), gm = () => m.set([30, 31, 32], .4, K.METAL);
    m.bone(0); paint(); m.hull([[2.25, sym([[.68, .96], [.86, .84], [.8, .5]])], [1.05, sym([[.72, 1.2], [.92, 1.02], [.84, .46]])], [.35, sym([[.76, 1.15], [.95, 1], [.84, .44]])], [-1.95, sym([[.8, 1.0], [.98, .94], [.84, .46]])], [-2.2, sym([[.76, .98], [.94, .9], [.78, .56]])]]);
    m.set(d, .16, K.PAINT, 0); MIR(q => { m.sq([1.35, q * .98, .98], [.62, .12, .05], 4, 6, 2); m.sq([-1.3, q * 1, .98], [.6, .12, .05], 4, 6, 2); m.sq([.1, q * .99, .78], [.56, .05, .22], 6, 6, 3); m.set([220, 190, 120], .5, K.EMIT, 0).sq([2.25, q * .6, .88], [.015, .08, .05], 3, 3, 1); m.set(d, .16, K.PAINT, 0); });
    m.set([20, 20, 20], .3, K.METAL); for (let i = 0; i < 5; i++) m.sq([2.25, -.4 + i * .2, .68], [.015, .05, .12], 3, 3, 1); gm(); m.sq([2.28, 0, .42], [.06, .86, .05], 4, 6, 2);
    m.set([8, 10, 12], .9, K.GLASS).face([[.92, -.78, 1.18], [.92, .78, 1.18], [.62, .74, 1.6], [.62, -.74, 1.6]], nrm([.8, 0, .55])); gm(); MIR(q => { m.rod([.92, q * .8, 1.15], [.6, q * .76, 1.62], .03, 5); m.rod([.6, q * .76, 1.62], [-1.1, q * .76, 1.72], .03, 5); m.rod([-1.1, q * .76, 1.72], [-1.75, q * .86, 1], .03, 5); m.rod([-.2, q * .78, 1.67], [-.2, q * .9, 1], .025, 5); });
    m.rod([.6, -.76, 1.62], [.6, .76, 1.62], .03, 5); m.rod([-1.1, -.76, 1.72], [-1.1, .76, 1.72], .03, 5);
    m.set([34, 36, 30], .1, K.CLOTH, 1); MIR(q => { m.sq([.05, q * .42, .98], [.24, .2, .08], 3, 6, 2); m.sq([-.17, q * .42, 1.25], [.06, .18, .26], 3, 6, 2); }); m.sq([-1.4, .3, 1.15], [.32, .4, .18], 3, 6, 2); m.set([30, 30, 26], .25, K.PAINT, 0).cyl([-1.9, -.5, 1], [-1.9, -.5, 1.32], .22, .22, 10);
    for (const [bn, y] of [[6, .9], [7, -.9]]) { m.bone(bn); m.set([14, 14, 14], .05, K.TRACK, 0).cyl([1.35, y * .82, .4], [1.35, y * 1.06, .4], .4, .4, 16); m.set([46, 46, 44], .35, K.METAL).cyl([1.35, y * 1.06, .4], [1.35, y * 1.09, .4], .2, .2, 8); }
    m.bone(0); MIR(q => { m.set([14, 14, 14], .05, K.TRACK, 0).cyl([-1.35, q * .74, .4], [-1.35, q * .98, .4], .4, .4, 16); m.set([46, 46, 44], .35, K.METAL).cyl([-1.35, q * .98, .4], [-1.35, q * 1.01, .4], .2, .2, 8); });
    m.bone(1); gm(); m.ell([[1.72, .36, .36, -.75], [1.76, .36, .36, -.75]], 14, { cap: false }); m.rod([-.75, 0, 1.74], [-.75, 0, 2.05], .05, 6);
    m.bone(2); gm(); m.sq([-.45, 0, 2.15], [.3, .055, .07], 4, 6, 2); m.cyl([-.2, 0, 2.15], [1.05, 0, 2.17], .022, .02, 6); m.cyl([1.0, 0, 2.17], [1.12, 0, 2.17], .036, .036, 6); m.set([34, 36, 30], .2, K.PAINT, 0).sq([-.42, .13, 2.08], [.12, .08, .1], 3, 5, 2); m.set([44, 44, 40], .3, K.METAL).sq([-.1, 0, 2.2], [.03, .26, .17], 5, 5, 2);
    return m.done();
  }
  /* helikopter serbu/medis kelas UH-60: kabin bersudut, hidung kaca, ekor panjang, stabilator, sayap senjata */
  function heli(m, palK, type) {
    const med = type === 'MEDHELI', red = palK === 'R', b = med ? [184, 184, 178] : red ? [46, 48, 52] : palK === 'US' ? [78, 82, 72] : [54, 62, 46], cam = med ? 0 : red ? 3 : 1, d = med ? [150, 150, 144] : [30, 31, 32];
    const paint = () => m.set(b, .25, K.PAINT, cam), dk2 = () => m.set(d, .25, K.PAINT, 0), gm = () => m.set([32, 33, 35], .4, K.METAL);
    m.bone(0); paint();
    m.hull([[4.3, sym([[.05, -.1], [.12, -.22], [.08, -.36]])], [3.4, sym([[.58, .36], [.88, -.02], [.6, -.6]])], [2.3, sym([[.72, 1.02], [1.08, .38], [.86, -.72]])], [-.8, sym([[.7, 1.1], [1.1, .5], [.92, -.8]])], [-2.5, sym([[.42, 1.02], [.72, .55], [.48, -.32]])], [-7.05, sym([[.08, .82], [.12, .68], [.06, .55]])]]);
    m.set([8, 11, 14], .95, K.GLASS); MIR(q => { m.face([[3.45, q * .06, .42], [3.45, q * .62, .28], [2.36, q * 1.02, .42], [2.36, q * .1, 1.04]], nrm([.55, q * .4, .72])); m.face([[3.35, q * .9, -.02], [2.4, q * 1.08, .32], [2.4, q * 1.09, -.25], [3.35, q * .84, -.3]], [.1, q, 0]); m.face([[1.4, q * 1.1, .55], [.3, q * 1.11, .56], [.3, q * 1.08, .05], [1.4, q * 1.07, .05]], [0, q, 0]); });
    dk2(); m.sq([2.1, 0, 1.03], [.12, .72, .03], 3, 4, 1);
    // mesin kembar di atap, tiang rotor
    gm(); MIR(q => { m.cyl([.9, q * .52, 1.14], [-1.5, q * .52, 1.2], .3, .24, 10); m.set(d, .3, K.METAL).cyl([-1.5, q * .52, 1.2], [-1.75, q * .56, 1.2], .24, .16, 10); m.set(OGE, 0, K.EMIT).cyl([-1.72, q * .56, 1.2], [-1.74, q * .56, 1.2], .13, .13, 8); gm(); });
    m.cyl([0, 0, 1.08], [0, 0, 1.48], .15, .13, 10);
    // sirip ekor bersudut + stabilator
    paint(); m.hull([[-6.4, sym([[.06, .82], [.07, .68]])], [-7.45, sym([[.05, 2.25], [.06, 2.1]])], [-7.95, sym([[.04, 2.25], [.04, 2.15]])], [-7.55, sym([[.05, .78], [.05, .66]])]]); m.sq([-6.75, 0, .42], [.42, 1.28, .035], 5, 6, 2);
    // roda & sayap
    gm(); MIR(q => { m.rod([1.9, q * .75, -.55], [1.9, q * .92, -1.02], .05, 5); m.set([14, 14, 14], .05, K.TRACK, 0).cyl([1.9, q * .84, -1.05], [1.9, q * 1.02, -1.05], .22, .22, 12); gm(); }); m.rod([-5.4, 0, .5], [-5.4, 0, -.1], .03, 4);
    if (med) { m.set([190, 28, 26], .2, K.PLAIN); MIR(q => { m.sq([-.4, q * 1.12, .28], [.5, .008, .16], 4, 3, 1); m.sq([-.4, q * 1.12, .28], [.16, .008, .5], 4, 3, 1); }); m.sq([-.4, 0, 1.06], [.5, .16, .008], 4, 3, 1); m.sq([-.4, 0, 1.06], [.16, .5, .008], 4, 3, 1); }
    else { paint(); MIR(q => { m.sq([.1, q * 1.75, .15], [.42, .72, .035], 5, 6, 2); gm(); m.sq([.1, q * 1.75, .03], [.34, .05, .06], 4, 5, 2); m.set([30, 32, 28], .3, K.PAINT, 0).cyl([-.65, q * 1.75, -.2], [1.25, q * 1.75, -.2], .2, .2, 10); m.set([10, 10, 10], .2, K.PLAIN).cyl([1.25, q * 1.75, -.2], [1.27, q * 1.75, -.2], .16, .16, 10); m.set([50, 54, 44], .3, K.PAINT, 0).cyl([-.5, q * 2.25, -.14], [1.05, q * 2.25, -.14], .1, .1, 8); }); gm(); MIR(q => { m.rod([1.05, q * 1.1, .38], [2.2, q * 1.55, .32], .022, 5); }); }
    m.set(RED, 0, K.EMIT).sq([-7.75, 0, 2.28], [.05, .04, .04], 2, 4, 2);
    m.bone(3); m.set([20, 20, 22], .3, K.METAL); m.cyl([0, 0, 1.46], [0, 0, 1.62], .2, .14, 10); for (let i = 0; i < 4; i++) { m.push(X.rz(i * Math.PI / 2)); m.ext([[.2, 1.545], [6.55, 1.52], [6.6, 1.55], [6.55, 1.57], [.2, 1.58]], -.22, .22); m.pop(); } m.set([40, 40, 42], .1, K.ROTOR, 0).cyl([0, 0, 1.54], [0, 0, 1.56], 6.6, 6.6, 24);
    m.bone(4); m.set([24, 24, 26], .3, K.METAL); m.push(X.T(-7.3, .3, 1.4)); m.sq([0, 0, 0], [.1, .04, .1], 3, 4, 2); m.sq([0, 0, 0], [.085, .02, 1], 5, 4, 2); m.sq([0, 0, 0], [1, .02, .085], 5, 4, 2); m.pop();
    return m.done();
  }

  /* ---- ULTIMA: tank super. Dua meriam 140 mm dalam kubah baji raksasa, taring bajak, ATGM, CIWS, rok tungsten berlapis ---- */
  function ultima(m) {
    const B = [30, 31, 33], D2 = [18, 18, 20], GM = [46, 48, 50], L = 5.6, Wd = 3, TZ = 2.5;
    const pa = () => m.set(B, .24, K.PAINT, 0), dk2 = () => m.set(D2, .2, K.PAINT, 0), gm = () => m.set(GM, .45, K.METAL);
    m.bone(0); MIR(q => trackUnit(m, -L - .2, L + .5, q * (Wd - .5), .48, .04, 1.34, 0, 9));
    pa(); m.hull([[L + 1, sym([[Wd - .95, 1.3], [Wd - .9, 1.12], [Wd - 1, .6]])], [L - 1.3, sym([[Wd - .8, 2.3], [Wd - .55, 2.1], [Wd - 1, .55]])], [-L + .6, sym([[Wd - .8, TZ], [Wd - .55, 2.3], [Wd - 1, .55]])], [-L - .55, sym([[Wd - .95, 2.15], [Wd - .75, 2], [Wd - 1, .7]])]]);
    MIR(q => {
      for (let i = 0; i < 6; i++) { const x = L - .75 - i * 2.05; dk2(); m.push(X.chain(X.T(x, q * (Wd + .06), 1.28), X.rx(q * -.09))); m.sq([0, 0, 0], [1.02, .09, .58], 8, 8, 4); m.pop(); gm(); for (const k of [-.8, .8]) m.sq([x + k, q * (Wd + .15), 1.62], [.06, .03, .06], 3, 4, 2); }
      m.set(RED, 0, K.EMIT).sq([L + 1.02, q * 1.15, 1.12], [.015, .28, .035], 3, 3, 1);
      m.set(D2, .4, K.METAL); for (const y of [.45, 1.25]) m.cyl([L + .95, q * y, .78], [L + 2.05, q * y, .3], .17, .01, 7);   // taring bajak
      gm(); m.cyl([-L - .45, q * 1.1, 1.7], [-L - .62, q * 1.1, 1.72], .22, .24, 10); m.set(OGE, 0, K.EMIT).cyl([-L - .62, q * 1.1, 1.72], [-L - .63, q * 1.1, 1.72], .16, .16, 10);
    });
    dk2(); for (let i = 0; i < 8; i++) m.sq([-L + .3 + i * .42, 0, TZ + .03 - i * .002], [.15, 1.25, .025], 6, 4, 1);
    m.bone(1); pa(); m.hull([[3.5, sym([[.5, 2.92], [.7, 2.78], [.5, 2.52]])], [1.7, sym([[1.25, 4.05], [2.15, 3.68], [2.2, 2.52]])], [-2.4, sym([[1.4, 4.15], [2.3, 3.78], [2.35, 2.52]])], [-4.1, sym([[1.05, 4.0], [1.75, 3.62], [1.75, 2.75]])]]);
    MIR(q => { dk2(); m.push(X.chain(X.T(-.2, q * 2.34, 3.15), X.rx(q * -.1))); m.sq([0, 0, 0], [1.55, .1, .5], 8, 8, 4); m.pop(); gm(); for (let i = 0; i < 4; i++) m.cyl([1.1, q * (1.5 + i * .13), 3.82 + i * .03], [1.5, q * (1.62 + i * .13), 3.98 + i * .03], .07, .07, 6); m.set(RED, 0, K.EMIT).sq([2.62, q * 1.0, 3.28], [.02, .3, .03], 3, 3, 1); });
    dk2(); m.sq([-1, 1.22, 4.46], [.75, .55, .3], 4, 6, 3); m.set([8, 8, 8], .1, K.PLAIN); for (const y of [.92, 1.22, 1.52]) for (const z of [4.34, 4.58]) m.cyl([-.25, y, z], [-.23, y, z], .1, .1, 8);
    gm(); m.cyl([-1.1, -1.2, 4.14], [-1.1, -1.2, 4.42], .42, .36, 12); dk2(); m.sq([-1.05, -1.2, 4.6], [.42, .3, .22], 3, 8, 3); m.set(RED, 0, K.EMIT).sq([-.63, -1.2, 4.62], [.015, .1, .035], 3, 3, 1); m.set([20, 20, 22], .5, K.METAL); for (const q of [-.1, .1]) m.cyl([-.66, -1.2 + q, 4.58], [.9, -1.2 + q, 4.62], .05, .05, 6);
    m.set([18, 18, 20], .3, K.PLAIN).rod([-3.6, 1.2, 3.9], [-3.8, 1.2, 6], .018, 3).rod([-3.6, -1.2, 3.9], [-3.8, -1.2, 5.3], .018, 3);
    m.bone(2); pa(); m.sq([2.9, 0, 3.32], [.72, 1.2, .54], 3.2, 12, 4); gm(); MIR(q => { const y = q * .62, z = 3.3; m.cyl([3.3, y, z], [10.6, y, z], .22, .17, 14); m.set([24, 24, 25], .3, K.METAL); for (const x of [4.2, 5.7, 7.2, 8.7]) m.cyl([x, y, z], [x + 1.1, y, z], .26, .25, 14); m.cyl([6.4, y, z], [7.2, y, z], .31, .31, 14); m.cyl([10.4, y, z], [11, y, z], .27, .25, 12); m.set([6, 6, 6], .2, K.PLAIN).cyl([11, y, z], [11.01, y, z], .16, .16, 10); gm(); });
    return m.done();
  }
  /* ---- BEHEMOTH: mesin pengepung. Bilah dozer bergigi raksasa, kasemat berkepala baji, dua meriam 203 mm, cerobong membara ---- */
  function behemoth(m) {
    const B = [34, 33, 30], D2 = [20, 20, 19], GM = [48, 48, 46], L = 8, Wd = 4.4, T0 = MD.BEH.tur;
    const pa = () => m.set(B, .24, K.PAINT, 0), dk2 = () => m.set(D2, .2, K.PAINT, 0), gm = () => m.set(GM, .45, K.METAL);
    m.bone(0); MIR(q => { trackUnit(m, .6, L + .3, q * (Wd - .55), .56, .04, 1.6, 0, 6); trackUnit(m, -L - .2, -.6, q * (Wd - .55), .56, .04, 1.6, 0, 6); });
    pa(); m.hull([[L + .5, sym([[Wd - 1.35, 1.7], [Wd - 1.25, 1.45], [Wd - 1.4, .7]])], [L - 2.4, sym([[Wd - 1.1, 4.1], [Wd - .85, 3.45], [Wd - 1.3, .6]])], [-L + .9, sym([[Wd - 1.1, 4.3], [Wd - .85, 3.6], [Wd - 1.3, .6]])], [-L - .6, sym([[Wd - 1.3, 3.5], [Wd - 1.1, 3], [Wd - 1.35, .8]])]]);
    MIR(q => { for (let i = 0; i < 7; i++) { const x = L - 1 - i * 2.35; dk2(); m.push(X.chain(X.T(x, q * (Wd + .08), 1.65), X.rx(q * -.1))); m.sq([0, 0, 0], [1.16, .12, .78], 9, 8, 4); m.pop(); gm(); for (const k of [-.9, .9]) for (const z of [1.15, 2.15]) m.sq([x + k, q * (Wd + .2), z], [.07, .04, .07], 3, 4, 2); } m.set([18, 18, 18], .4, K.METAL).cyl([-L + 1.8, q * 2.1, 4.1], [-L + 1.6, q * 2.1, 6.4], .36, .3, 10); m.set(OGE, 0, K.EMIT).cyl([-L + 1.6, q * 2.1, 6.4], [-L + 1.6, q * 2.1, 6.42], .26, .26, 10); });
    // bilah dozer melengkung + gigi
    dk2(); m.ext([[L + 1.5, .05], [L + 2.3, .05], [L + 2.6, .9], [L + 2.45, 2.2], [L + 2.75, 3.4], [L + 2.2, 3.5], [L + 1.85, 2.4], [L + 1.75, 1]], -Wd - .25, Wd + .25);
    gm(); for (let i = -6; i <= 6; i++) { const y = i * .72; m.cyl([L + 2.3, y, .32], [L + 3.55, y, .05], .24, .01, 6); } MIR(q => { m.rod([L - .4, q * 2.2, 1.9], [L + 1.8, q * 2.5, 2], .22, 9); m.rod([L - .3, q * 2.2, 3.1], [L + 1.8, q * 2.7, 3.3], .15, 8); m.set(RED, 0, K.EMIT).sq([L + .8, q * 1.2, 3.55], [.03, .34, .04], 3, 3, 1); gm(); });
    hazard(m, L + 2.5, 0, 3.05, 0, 0); m.set([176, 134, 26], .25, K.PAINT, 0); for (let i = -5; i <= 5; i += 2) { m.push(X.chain(X.T(L + 2.62, i * .72, 3), X.rx(.6))); m.sq([0, 0, 0], [.012, .34, .13], 4, 4, 1); m.pop(); }
    m.bone(1); pa(); m.hull([[T0 + 4.8, sym([[1.1, 4.8], [1.5, 4.6], [1.1, 4.25]])], [T0 + 2.8, sym([[2.2, 7.1], [2.95, 6.2], [3, 4.2]])], [T0 - 3.4, sym([[2.3, 7.4], [3.1, 6.4], [3.1, 4.2]])], [T0 - 4.6, sym([[1.8, 7.05], [2.5, 6.1], [2.5, 4.5]])]]);
    MIR(q => { dk2(); m.push(X.chain(X.T(T0 - .4, q * 3.14, 5.3), X.rx(q * -.08))); m.sq([0, 0, 0], [2.3, .13, .95], 8, 8, 4); m.pop(); m.set(RED, 0, K.EMIT).sq([T0 + 3.85, q * 1.45, 5.86], [.03, .55, .05], 3, 3, 1); gm(); for (let i = 0; i < 4; i++) m.cyl([T0 + 2.5, q * (2.5 + i * .15), 6.4 + i * .05], [T0 + 2.95, q * (2.65 + i * .15), 6.65 + i * .05], .09, .09, 6); });
    gm(); m.cyl([T0 - 1.6, -1.2, 7.3], [T0 - 1.6, -1.2, 7.8], .6, .5, 12); dk2(); m.sq([T0 - 1.5, -1.2, 8], [.62, .45, .3], 3, 8, 3); m.set(RED, 0, K.EMIT).sq([T0 - .88, -1.2, 8], [.02, .2, .06], 3, 3, 1); m.set([20, 20, 22], .5, K.METAL); for (const q of [-.15, .15]) m.cyl([T0 - 1, -1.2 + q, 7.95], [T0 + 1.6, -1.2 + q, 8.02], .07, .07, 6); m.set([18, 18, 20], .3, K.PLAIN).rod([T0 - 3.4, 1.8, 7.2], [T0 - 3.6, 1.8, 10.5], .025, 3);
    m.bone(2); const G = MD.BEH.gp; pa(); m.sq([T0 + 3.7, 0, G[2]], [1.2, 1.9, .88], 3, 12, 4); gm(); MIR(q => { const y = q * 1.02, z = G[2], X0 = T0 + 4.4; m.cyl([X0, y, z], [X0 + 13.5, y, z], .36, .28, 14); m.set([26, 26, 26], .3, K.METAL); for (let i = 0; i < 4; i++) { const x = X0 + 1.2 + i * 2.5; m.cyl([x, y, z], [x + 2, y, z], .42, .4, 14); } m.cyl([X0 + 6.5, y, z], [X0 + 7.8, y, z], .5, .5, 14); m.cyl([X0 + 13.1, y, z], [X0 + 14.3, y, z], .48, .44, 12); m.set([8, 8, 8], .2, K.PLAIN); for (const yy of [-.28, .28]) m.sq([X0 + 13.7, y + yy, z], [.2, .05, .14], 3, 4, 2); m.cyl([X0 + 14.3, y, z], [X0 + 14.31, y, z], .26, .26, 12); gm(); });
    return m.done();
  }
  /* ---- LEVIATHAN: benteng darat. Empat unit rantai, geladak bertingkat, kubah kapal 2×280 mm, menara komando + radar, meriam lambung, CIWS, puluhan lampu merah ---- */
  function leviathan(m) {
    const B = [36, 38, 38], D2 = [20, 21, 22], GM = [52, 54, 54], L = 14.5, Wd = 7, T0 = MD.LEVI.tur;
    const pa = () => m.set(B, .24, K.PAINT, 0), dk2 = () => m.set(D2, .2, K.PAINT, 0), gm = () => m.set(GM, .45, K.METAL);
    m.bone(0); MIR(q => { trackUnit(m, 2, L + .5, q * (Wd - 1), .95, .05, 2.3, 0, 7); trackUnit(m, -L - .3, -2, q * (Wd - 1), .95, .05, 2.3, 0, 7); });
    pa(); m.hull([[L + 1.2, sym([[Wd - 2.6, 2.5], [Wd - 2.2, 2.1], [Wd - 2.6, 1]])], [L - 3.8, sym([[Wd - 2, 5.5], [Wd - 1.5, 4.9], [Wd - 2.2, .9]])], [-L + 1.4, sym([[Wd - 2, 5.9], [Wd - 1.5, 5.2], [Wd - 2.2, .9]])], [-L - .8, sym([[Wd - 2.4, 5.1], [Wd - 2.1, 4.5], [Wd - 2.4, 1.2]])]]);
    MIR(q => { for (let i = 0; i < 9; i++) { const x = L - 1.2 - i * 3.2; dk2(); m.push(X.chain(X.T(x, q * (Wd + .1), 2.45), X.rx(q * -.08))); m.sq([0, 0, 0], [1.58, .16, 1.12], 9, 8, 4); m.pop(); gm(); for (const k of [-1.25, 1.25]) for (const z of [1.65, 3.25]) m.sq([x + k, q * (Wd + .28), z], [.09, .05, .09], 3, 4, 2); m.set(RED, 0, K.EMIT).sq([x, q * (Wd + .26), 3.42], [.2, .015, .03], 3, 3, 1); }
      // sponson lambung: meriam kecil
      gm(); m.sq([3, q * (Wd - 1.2), 5.1], [1, .9, .55], 3, 10, 4); m.cyl([3.8, q * (Wd - 1.2), 5.15], [8.6, q * (Wd - .9), 5.2], .14, .11, 8); m.sq([-7, q * (Wd - 1.2), 5.55], [1, .9, .55], 3, 10, 4); m.cyl([-6.2, q * (Wd - 1.2), 5.6], [-1.6, q * (Wd - .9), 5.7], .14, .11, 8);
      m.set(RED, 0, K.EMIT).sq([L + 1.22, q * 2, 2.1], [.02, .45, .05], 3, 3, 1);
      m.set([16, 16, 16], .45, K.METAL).cyl([-L + 2, q * 3.1, 5.8], [-L + 1.7, q * 3.1, 9], .5, .42, 12); m.set(OGE, 0, K.EMIT).cyl([-L + 1.7, q * 3.1, 9], [-L + 1.7, q * 3.1, 9.02], .36, .36, 12);
    });
    // menara komando bertingkat
    pa(); m.hull([[2.2, sym([[2.2, 8.1], [2.75, 6.8], [3, 5.6]])], [-4.4, sym([[2.4, 8.5], [3.05, 7], [3.2, 5.8]])]]); dk2(); m.hull([[.6, sym([[1.1, 10.6], [1.5, 9.8], [1.9, 8.2]])], [-3.2, sym([[1.2, 10.8], [1.6, 10], [2, 8.4]])]]);
    m.set(RED, 0, K.EMIT).sq([.66, 0, 9.65], [.03, 1.2, .1], 3, 3, 1); MIR(q => m.sq([.6, q * 1.9, 8.7], [.1, .03, .05], 3, 3, 1));
    gm(); m.rod([-1, 0, 10.7], [-1, 0, 11.4], .3, 8);
    // CIWS & peluncur belakang
    for (const [x, y] of [[-7.5, 3.4], [-7.5, -3.4], [-11.2, 0], [9.3, 3.6], [9.3, -3.6]]) { gm(); m.cyl([x, y, 5.5], [x, y, 6.1], .48, .4, 12); dk2(); m.sq([x, y, 6.3], [.5, .4, .28], 3, 8, 3); m.set(RED, 0, K.EMIT).sq([x + .5, y, 6.32], [.02, .14, .04], 3, 3, 1); m.set([20, 20, 22], .5, K.METAL); for (const q of [-.1, .1]) m.cyl([x + .4, y + q, 6.26], [x + 2.2, y + q, 6.36], .055, .055, 6); }
    dk2(); m.sq([-11.2, 3.4, 6], [1.4, 1, .55], 4, 8, 3); m.set([8, 8, 8], .1, K.PLAIN); for (const y of [2.8, 3.4, 4]) for (const z of [5.75, 6.25]) m.cyl([-9.8, y, z], [-9.78, y, z], .19, .19, 8);
    m.bone(1); pa(); m.hull([[T0 + 3.6, sym([[1.5, 7.2], [2.2, 6.95], [2, 5.8]])], [T0 + 2.4, sym([[2.1, 8.2], [3.2, 7.25], [3.3, 5.75]])], [T0 - 2.6, sym([[2.2, 8.3], [3.3, 7.3], [3.4, 5.75]])], [T0 - 3.6, sym([[1.7, 8.1], [2.6, 7.2], [2.6, 6]])]]);
    MIR(q => { m.set(RED, 0, K.EMIT).sq([T0 + 2.5, q * 1.8, 7.8], [.03, .6, .05], 3, 3, 1); dk2(); m.sq([T0 - .1, q * 3.42, 6.95], [1.9, .1, .55], 7, 8, 3); });
    m.bone(2); gm(); MIR(q => { const y = q * 1.05, z = 7.05; m.cyl([T0 + 3.2, y, z], [T0 + 17, y, z], .42, .32, 14); m.cyl([T0 + 3.2, y, z], [T0 + 5.6, y, z], .58, .54, 14); m.set([26, 26, 26], .3, K.METAL); for (const x of [6.5, 9.2, 11.9]) m.cyl([T0 + x, y, z], [T0 + x + 1.8, y, z], .46, .44, 14); m.cyl([T0 + 16.2, y, z], [T0 + 17.4, y, z], .46, .42, 12); m.set([6, 6, 6], .2, K.PLAIN).cyl([T0 + 17.4, y, z], [T0 + 17.41, y, z], .28, .28, 12); gm(); });
    m.bone(4); m.set([44, 46, 46], .5, K.METAL); m.push(X.T(-.7, 0, 0)); m.sq([0, 0, 12], [.2, 2, .62], 4, 8, 3); m.set(RED, 0, K.EMIT).sq([.22, 0, 12], [.01, 1.5, .04], 3, 3, 1); m.pop();
    return m.done();
  }
  /* ---- ZEUS: meriam rel raksasa. Lambung hitam, dua rel panjang dengan kumparan biru menyala, bank kapasitor bercahaya ---- */
  function zeus(m) {
    const B = [26, 28, 32], D2 = [14, 15, 18], GM = [44, 48, 54], L = 10.5, Wd = 5.2, T0 = MD.ZEUS.tur, CU = [150, 90, 50];
    const pa = () => m.set(B, .3, K.PAINT, 0), dk2 = () => m.set(D2, .25, K.PAINT, 0), gm = () => m.set(GM, .5, K.METAL);
    m.bone(0); MIR(q => { trackUnit(m, 1.2, L + .4, q * (Wd - .7), .68, .04, 1.8, 0, 6); trackUnit(m, -L - .3, -1.2, q * (Wd - .7), .68, .04, 1.8, 0, 6); });
    pa(); m.hull([[L + .9, sym([[Wd - 1.6, 1.9], [Wd - 1.4, 1.6], [Wd - 1.7, .8]])], [L - 3, sym([[Wd - 1.4, 3.9], [Wd - 1, 3.4], [Wd - 1.5, .7]])], [-L + 1, sym([[Wd - 1.4, 4], [Wd - 1, 3.5], [Wd - 1.5, .7]])], [-L - .7, sym([[Wd - 1.6, 3.4], [Wd - 1.3, 3], [Wd - 1.6, .9]])]]);
    MIR(q => {
      for (let i = 0; i < 7; i++) { const x = L - 1 - i * 2.9; dk2(); m.push(X.chain(X.T(x, q * (Wd + .08), 1.9), X.rx(q * -.08))); m.sq([0, 0, 0], [1.42, .12, .85], 9, 8, 4); m.pop(); m.set(CYN, 0, K.EMIT).sq([x, q * (Wd + .19), 2.48], [1.1, .01, .03], 3, 3, 1); }
      // bank kapasitor bercahaya di geladak
      for (let i = 0; i < 4; i++) { const x = -5 - i * 1.25; gm(); m.cyl([x, q * 2.6, 3.9], [x, q * 2.6, 5], .42, .42, 12); m.set(CYN, 0, K.EMIT).cyl([x, q * 2.6, 4.35], [x, q * 2.6, 4.55], .44, .44, 12, { cap0: false, cap1: false }); }
      m.set(CYN, 0, K.EMIT).sq([L + .92, q * 1.5, 1.6], [.02, .5, .05], 3, 3, 1);
    });
    m.bone(1); gm(); m.hull([[T0 + 3.8, sym([[1.2, 5.1], [1.8, 4.9], [1.6, 3.9]])], [T0 + 2.4, sym([[1.9, 6.3], [2.7, 5.4], [2.8, 3.9]])], [T0 - 2.9, sym([[2, 6.4], [2.85, 5.5], [2.95, 3.9]])], [T0 - 4, sym([[1.5, 6.2], [2.2, 5.3], [2.2, 4.2]])]]);
    MIR(q => { m.set(CYN, 0, K.EMIT).sq([T0 + 2.5, q * 1.7, 5.85], [.03, .55, .06], 3, 3, 1); dk2(); m.sq([T0 - .3, q * 2.95, 5], [1.8, .1, .6], 7, 8, 3); }); dk2(); m.sq([T0 - 1, 0, 6.5], [1.2, 1, .25], 4, 8, 3); m.set(CYN, 0, K.EMIT).sq([T0 - 1, 0, 6.76], [.5, .4, .02], 3, 4, 1);
    m.bone(2); const z0 = 5.1; dk2(); m.sq([T0 + 4.2, 0, z0], [1.4, 1.5, .85], 3, 10, 4); m.set([34, 36, 42], .55, K.METAL); for (const zz of [.45, -.45]) m.sq([T0 + 12, 0, z0 + zz], [9, .62, .13], 8, 8, 2);
    m.set(CYN, 0, K.EMIT).sq([T0 + 12, 0, z0], [8.8, .12, .22], 4, 6, 2); m.set(CU, .6, K.METAL); for (let i = 0; i < 10; i++) { const x = T0 + 5 + i * 1.6; m.push(X.T(x, 0, z0)); m.ell([[-.12, .86, .86], [.12, .86, .86]], 14, { cap: false }); m.pop(); void x; }
    m.set(D2, .4, K.METAL); for (let i = 0; i < 5; i++) { const x = T0 + 5.8 + i * 3.2; m.sq([x, 0, z0], [.28, .95, .95], 5, 8, 4); } m.set(CYN, 0, K.EMIT); for (const q of [1, -1]) m.sq([T0 + 21.1, q * .52, z0], [.1, .08, .5], 3, 4, 2); m.set([34, 36, 42], .55, K.METAL); for (const q of [1, -1]) m.sq([T0 + 21, 0, z0 + q * .62], [.36, .8, .1], 6, 6, 2);
    return m.done();
  }
  /* ---- TEMPEST: peluncur roket 10×10. Kabin baji bercelah merah, bajak berpaku, rok baja, dua pod roket raksasa berhulu ledak merah ---- */
  function tempest(m) {
    const B = [38, 36, 30], D2 = [22, 22, 20], GM = [50, 50, 46], L = 9.2, Wd = 2.5, T0 = MD.TEM.tur, G = MD.TEM.gp;
    const pa = () => m.set(B, .24, K.PAINT, 0), dk2 = () => m.set(D2, .2, K.PAINT, 0), gm = () => m.set(GM, .45, K.METAL);
    m.bone(0); for (const x of [7.6, 5.6, 1.5, -3, -7]) MIR(q => { m.set([14, 14, 14], .05, K.TRACK, 0).cyl([x, q * (Wd - .55), .85], [x, q * (Wd + .06), .85], .85, .85, 18); m.set([46, 46, 44], .35, K.METAL).cyl([x, q * (Wd + .06), .85], [x, q * (Wd + .09), .85], .45, .45, 10); });
    pa(); m.hull([[L, sym([[Wd - .15, 2.3], [Wd - .05, 2.1], [Wd - .25, 1.15]])], [-L, sym([[Wd - .15, 2.45], [Wd - .05, 2.2], [Wd - .25, 1.15]])]]);
    MIR(q => { for (let i = 0; i < 6; i++) { const x = 7.4 - i * 3; dk2(); m.push(X.chain(X.T(x, q * (Wd + .14), 1.72), X.rx(q * -.08))); m.sq([0, 0, 0], [1.46, .1, .55], 8, 8, 4); m.pop(); gm(); for (const k of [-1.15, 1.15]) m.sq([x + k, q * (Wd + .26), 2], [.07, .025, .07], 3, 4, 2); } });
    // kabin baji
    pa(); m.hull([[L + 1.2, sym([[Wd - 1.1, 2.45], [Wd - .6, 2.25], [Wd - .55, 1.3]])], [L - .2, sym([[Wd - .9, 3.95], [Wd - .15, 3.2], [Wd - .05, 1.2]])], [L - 2.8, sym([[Wd - .75, 4.5], [Wd - .05, 3.5], [Wd + .05, 1.2]])], [L - 3.8, sym([[Wd - .85, 4.2], [Wd - .15, 3.3], [Wd - .1, 1.8]])]]);
    m.set([6, 6, 7], .9, K.GLASS); m.face([[L - .22, -1.35, 3.72], [L - .22, 1.35, 3.72], [L - 1.2, 1.5, 4.2], [L - 1.2, -1.5, 4.2]], nrm([.5, 0, .85]));
    m.set(RED, 0, K.EMIT); m.sq([L + .02, 0, 3.55], [.03, 1.35, .045], 3, 4, 1); MIR(q => m.sq([L + 1.22, q * .85, 2.15], [.02, .32, .05], 3, 3, 1));
    // bajak berpaku
    dk2(); m.ext([[L + 1.5, .3], [L + 2.1, .3], [L + 2.25, 1.7], [L + 1.8, 2.35], [L + 1.45, 2]], -Wd - .1, Wd + .1); gm(); for (let i = -3; i <= 3; i++) for (const z of [.72, 1.55]) m.cyl([L + 2, i * .7, z], [L + 2.95, i * .7, z - .1], .15, .01, 6);
    gm(); MIR(q => { m.cyl([L - 3.2, q * 2.6, 4.1], [L - 3.2, q * 2.6, 2.3], .17, .2, 8); m.set(OGE, 0, K.EMIT).cyl([L - 3.2, q * 2.6, 4.1], [L - 3.2, q * 2.6, 4.12], .13, .13, 8); gm(); });
    m.bone(1); gm(); m.cyl([T0, 0, 2.45], [T0, 0, 2.86], 2.2, 2.2, 22); dk2(); MIR(q => { m.sq([G[0] + .7, q * 2.15, 3.15], [1.35, .15, .65], 6, 8, 3); }); m.set(RED, 0, K.EMIT).sq([T0 + 2.2, 0, 2.7], [.02, 1, .04], 3, 3, 1);
    m.bone(2); const CL = 13, TW = 2.15; MIR(q => {
      const y = q * 1.28; dk2(); m.sq([G[0] + CL / 2, y, 3.7], [CL / 2, 1.12, .95], 9, 8, 4); pa(); for (const x of [2, 5, 8, 11]) m.sq([G[0] + x, y, 4.66], [.3, 1.14, .025], 5, 6, 1); void TW;
      for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 2; b2++) { const yy = y - .7 + a * .7, zz = 3.3 + b2 * .78; m.set([6, 6, 6], .1, K.PLAIN).cyl([G[0] + CL - .02, yy, zz], [G[0] + CL + .02, yy, zz], .31, .31, 10); m.set(RED, .3, K.PAINT, 0).cyl([G[0] + CL - .6, yy, zz], [G[0] + CL + .02, yy, zz], .23, .23, 8); m.set([240, 40, 26], 0, K.EMIT).cyl([G[0] + CL + .02, yy, zz], [G[0] + CL + .58, yy, zz], .23, .012, 8); }
      m.set([176, 134, 26], .25, K.PAINT, 0).sq([G[0] + CL - .3, q * 2.42, 3.7], [.26, .012, .92], 4, 4, 1);
    });
    return m.done();
  }
  /* ---- BLIMP: kapal udara perang gelap. Kantong gas berusuk baja, mata merah, gondola baja bersenjata ---- */
  function blimp(m) {
    const ENV = [36, 38, 42], RIB = [20, 21, 24], GD = [34, 36, 38], DK2 = [18, 18, 20], BR = [66, 12, 10];
    m.bone(0); m.set(ENV, .3, K.PAINT, 0); m.push(X.ry(Math.PI / 2)); m.lathe([0, 0, 0], [[0, -16.5], [2.4, -14.8], [4.3, -10.5], [5.4, -4.5], [5.6, 3], [5, 10], [3, 15], [0, 17.2]], 28); m.pop();
    const rad = x => { const P2 = [[-17.2, 0], [-15, 3], [-10, 5], [-3, 5.6], [4.5, 5.4], [10.5, 4.3], [14.8, 2.4], [16.5, 0]]; for (let i = 0; i < P2.length - 1; i++) if (x >= P2[i][0] && x <= P2[i + 1][0]) return lerp(P2[i][1], P2[i + 1][1], (x - P2[i][0]) / (P2[i + 1][0] - P2[i][0])); return 0; };
    m.set(RIB, .4, K.METAL); for (let i = 0; i < 10; i++) { const x = -13.6 + i * 3, r = rad(x); m.cyl([x - .13, 0, 0], [x + .13, 0, 0], r + .1, r + .1, 26, { cap0: false, cap1: false }); }
    for (let a = 0; a < 8; a++) { const t = a / 8 * TAU + .39; for (let i = 0; i < 7; i++) { const x0 = -15 + i * 4.2, x1 = x0 + 4.2, r0 = rad(x0) + .06, r1 = rad(x1) + .06; m.rod([x0, Math.cos(t) * r0, Math.sin(t) * r0], [x1, Math.cos(t) * r1, Math.sin(t) * r1], .055, 4); } }
    m.set(BR, .3, K.PAINT, 0).cyl([7.4, 0, 0], [5.6, 0, 0], rad(7.4) + .05, rad(5.6) + .05, 28, { cap0: false, cap1: false });
    // mata depan
    MIR(q => { m.set(DK2, .4, K.PLAIN).sq([14.2, q * 1.6, .8], [.5, .55, .55], 2.4, 10, 4); m.set(RED, 0, K.EMIT).sq([14.55, q * 1.68, .82], [.24, .34, .34], 2.2, 10, 4); });
    for (let i = 0; i < 4; i++) { m.push(X.rx(i * Math.PI / 2 + Math.PI / 4)); m.set(ENV, .3, K.PAINT, 0); m.ext([[-11, 4], [-17, 7.6], [-16.2, 2.2], [-12.8, 2.2]], -.13, .13); m.set(BR, .3, K.PAINT, 0); m.ext([[-16.2, 6.8], [-17, 7.6], [-16.7, 5.8], [-15.8, 5.9]], -.15, .15); m.pop(); }
    // gondola baja bersudut
    m.set(GD, .3, K.PAINT, 0); m.hull([[7.4, sym([[.3, -5.5], [.5, -6.2], [.2, -6.9]])], [5, sym([[1.2, -5.2], [1.6, -6.1], [1.1, -7.3]])], [-3.4, sym([[1.25, -5.1], [1.65, -6], [1.2, -7.4]])], [-5.2, sym([[.8, -5.3], [1.1, -6.1], [.7, -6.9]])]]);
    m.set(RED, 0, K.EMIT).sq([6.25, 0, -5.82], [.02, .9, .06], 3, 3, 1); m.set(RIB, .4, K.METAL); for (const x of [-3, 0, 3]) MIR(q => m.rod([x, q * .9, -5.15], [x, q * 2.2, -4.4], .08, 5));
    MIR(q => {
      m.set(GD, .4, K.METAL).cyl([-1, q * 3.2, -4.2], [-3.6, q * 3.2, -4.2], .7, .5, 12); m.set(RIB, .4, K.METAL).rod([-2, q * 1.3, -5.5], [-2, q * 3.1, -4.4], .1, 5); m.set(OGE, 0, K.EMIT).cyl([-3.6, q * 3.2, -4.2], [-3.62, q * 3.2, -4.2], .42, .42, 12);
      m.set(RIB, .5, K.METAL).sq([3.1, q * 1.6, -6.6], [.52, .3, .34], 3, 8, 3); m.set([18, 18, 20], .5, K.METAL); for (const k of [-.1, .1]) m.cyl([3.5, q * 1.6 + k, -6.65], [6, q * 1.7 + k, -6.8], .06, .06, 6);
      m.set(RIB, .5, K.METAL).sq([-1.6, q * 1.6, -6.6], [.52, .3, .34], 3, 8, 3); m.set([18, 18, 20], .5, K.METAL); for (const k of [-.1, .1]) m.cyl([-1.2, q * 1.6 + k, -6.65], [1, q * 1.7 + k, -6.8], .06, .06, 6);
    });
    m.set(RED, 0, K.EMIT).sq([-3.4, 0, -7.45], [.3, .3, .05], 2, 6, 2);
    return m.done();
  }
  NEW_VEH.TANK = (m, p) => tankBase(m, p, 'TANK'); NEW_VEH.LTANK = (m, p) => tankBase(m, p, 'LTANK'); NEW_VEH.ZSU = (m, p) => tankBase(m, p, 'ZSU'); NEW_VEH.ARTY = (m, p) => tankBase(m, p, 'ARTY');
  NEW_VEH.IFV = ifv; NEW_VEH.JEEP = jeep; NEW_VEH.ULTIMA = ultima; NEW_VEH.BEHEMOTH = behemoth; NEW_VEH.LEVI = leviathan; NEW_VEH.LEVIATHAN = leviathan; NEW_VEH.ZEUS = zeus; NEW_VEH.TEMPEST = tempest;
  NEW_AIR.BLIMP = blimp; NEW_AIR.HELI = (m, p) => heli(m, p, 'HELI'); NEW_AIR.MEDHELI = (m, p) => heli(m, p, 'MEDHELI');
  // pesawat lama yang warnanya tertanam di kode (NEMESIS, GUNSHIP, WYVERN, ATK2, jet...): digelapkan tanpa mengubah bentuk & tulang
  const AIR_K = { NEMESIS: .5, GUNSHIP: .55, WYVERN: .55, ATK2: .72, FGT: .72, CAS: .72, BMB: .72, UCAV: .72, UAV: .8, AH64: 1, VTOL: .85 };
  const A0 = MD.aircraft; MD.aircraft = function (type, palK) { const o = A0(type, palK); return AIR_K[type] && AIR_K[type] !== 1 ? tintMesh(o, AIR_K[type]) : o; };


})();
