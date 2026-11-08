/* ============================================================
   FPS-MODELS — pembuat mesh 3D prosedural untuk renderer
   WebGL (fps-gl.js): prajurit bertulang (animasi jalan/lari/
   bidik/jatuh), tank, ranpur, truk, helikopter, jet, kapal,
   UFO, bangunan per gaya kota, properti jalan, pohon per
   spesies (kartu daun bertekstur), batu, semak, ilalang.
   Format titik: posisi(3) normal(3) warna+kilap(4)
   material(4: jenis, parameter, u, v) tulang(1) = 15 float
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, W = TK.WAR;
  const MD = F.MDL = {};
  const STRIDE = 15; MD.STRIDE = STRIDE;
  /* jenis material (dibaca shader) */
  MD.gaitHz = (v, hvy) => Math.max(1, Math.min(2.15, 1 + .11 * v)) * (1 - .24 * (hvy || 0));   // irama langkah (siklus/detik) dari kecepatan ternormal; bos berat melangkah lebih lambat
  MD.gaitRun = v => { const t = Math.max(0, Math.min(1, (v - 2.2) / 2.3)); return t * t * (3 - 2 * t); };
  MD.gaitPass = id => 1.75 + (id % 2) * Math.PI;   // passing pose: satu kaki di bawah badan, kaki lain menyilang
  const K = MD.K = { PLAIN: 0, EMIT: 1, FACADE: 2, LEAF: 3, BARK: 4, PAINT: 5, TILE: 6, CORR: 7, PLASTER: 8, GLASS: 9, CONC: 10, TRACK: 11, LAMP: 12, ROTOR: 13, UFO: 14, CACTUS: 15, ROCK: 16, SKIN: 17, CLOTH: 18, METAL: 19, CANOPY: 20 };

  /* ---------- vektor ---------- */
  const v3 = (x, y, z) => [x, y, z], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, k) => a + (b - a) * k;
  MD.v = { add, sub, mul, dot, crs, nrm };
  function hsh(i, s) { let h = Math.imul(i | 0, 374761393) ^ Math.imul(s | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

  /* ---------- transformasi: {c:[ex,ey,ez], t} ---------- */
  const X = MD.X = {
    I: () => ({ c: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] }),
    ap: (M, p) => [M.t[0] + M.c[0][0] * p[0] + M.c[1][0] * p[1] + M.c[2][0] * p[2], M.t[1] + M.c[0][1] * p[0] + M.c[1][1] * p[1] + M.c[2][1] * p[2], M.t[2] + M.c[0][2] * p[0] + M.c[1][2] * p[1] + M.c[2][2] * p[2]],
    ar: (M, p) => [M.c[0][0] * p[0] + M.c[1][0] * p[1] + M.c[2][0] * p[2], M.c[0][1] * p[0] + M.c[1][1] * p[1] + M.c[2][1] * p[2], M.c[0][2] * p[0] + M.c[1][2] * p[1] + M.c[2][2] * p[2]],
    cmp: (A, B) => ({ c: B.c.map(e => X.ar(A, e)), t: X.ap(A, B.t) }),
    T: (x, y, z) => ({ c: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [x, y, z] }),
    rz: a => { const c = Math.cos(a), s = Math.sin(a); return { c: [[c, s, 0], [-s, c, 0], [0, 0, 1]], t: [0, 0, 0] }; },
    ry: a => { const c = Math.cos(a), s = Math.sin(a); return { c: [[c, 0, s], [0, 1, 0], [-s, 0, c]], t: [0, 0, 0] }; },   // a > 0: hidung naik
    rx: a => { const c = Math.cos(a), s = Math.sin(a); return { c: [[1, 0, 0], [0, c, s], [0, -s, c]], t: [0, 0, 0] }; },   // guling
    ra: (k, a) => { const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = k; return { c: [[t * x * x + c, t * x * y + s * z, t * x * z - s * y], [t * x * y - s * z, t * y * y + c, t * y * z + s * x], [t * x * z + s * y, t * y * z - s * x, t * z * z + c]], t: [0, 0, 0] }; },   // putar a rad mengelilingi sumbu satuan k (Rodrigues)
    chain: (...L) => L.reduce((A, B) => X.cmp(A, B)),
    axes: (ex, ey, ez, t) => ({ c: [ex, ey, ez], t }),
    write: (M, out, o) => { const c = M.c; out[o] = c[0][0]; out[o + 1] = c[0][1]; out[o + 2] = c[0][2]; out[o + 3] = 0; out[o + 4] = c[1][0]; out[o + 5] = c[1][1]; out[o + 6] = c[1][2]; out[o + 7] = 0; out[o + 8] = c[2][0]; out[o + 9] = c[2][1]; out[o + 10] = c[2][2]; out[o + 11] = 0; out[o + 12] = M.t[0]; out[o + 13] = M.t[1]; out[o + 14] = M.t[2]; out[o + 15] = 1; }
  };
  /* sumbu z tulang menghadap -dir (tulang tungkai memanjang ke -z lokal) */
  X.look = (o, dir, fwd) => { const ez = nrm(mul(dir, -1)); let ex = sub(fwd, mul(ez, dot(fwd, ez))); if (Math.hypot(...ex) < 1e-4) ex = [0, 0, 1]; ex = nrm(ex); return { c: [ex, crs(ez, ex), ez], t: o }; };

  /* ---------- pembuat mesh ---------- */
  function Mesh() {
    this.v = []; this.i = []; this.n = 0; this.M = X.I(); this.st = [];
    this.col = [.5, .5, .5]; this.sp = .1; this.k = 0; this.pr = 0; this.b = 0; this.min = [1e9, 1e9, 1e9]; this.max = [-1e9, -1e9, -1e9];
  }
  const P = Mesh.prototype;
  P.push = function (T) { this.st.push(this.M); if (T) this.M = X.cmp(this.M, T); return this; };
  P.pop = function () { this.M = this.st.pop(); return this; };
  P.set = function (col, sp, k, pr) { this.col = col[0] > 1.001 || col[1] > 1.001 || col[2] > 1.001 ? col.map(c => c / 255) : col; this.sp = sp || 0; this.k = k || 0; this.pr = pr === undefined && k === 9 ? -1 : pr || 0; return this; };   // kaca tanpa gaya (kendaraan, heli, properti) = pr −1 → shader kaca polos; jendela gedung selalu memberi gaya
  P.bone = function (b) { this.b = b; return this; };
  P.V = function (p, n, u, v) {
    const q = X.ap(this.M, p), m = nrm(X.ar(this.M, n)), c = this.col;
    this.v.push(q[0], q[1], q[2], m[0], m[1], m[2], c[0], c[1], c[2], this.sp, this.k, this.pr, u || 0, v || 0, this.b);
    for (let j = 0; j < 3; j++) { if (q[j] < this.min[j]) this.min[j] = q[j]; if (q[j] > this.max[j]) this.max[j] = q[j]; }
    return this.n++;
  };
  P.tri = function (a, b, c) { this.i.push(a, b, c); };
  P.quad = function (a, b, c, d) { this.i.push(a, b, c, a, c, d); };
  P.face = function (pts, n, uvs) {   // poligon cembung
    if (!n) n = nrm(crs(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const id = pts.map((p, j) => this.V(p, n, uvs ? uvs[j][0] : 0, uvs ? uvs[j][1] : 0));
    for (let j = 1; j < id.length - 1; j++) this.tri(id[0], id[j], id[j + 1]);
  };
  /* kotak berpusat c, setengah ukuran h; uv dalam meter (u mendatar, v dari dasar) */
  P.box = function (c, h, o) {
    o = o || {}; const [cx, cy, cz] = c, [hx, hy, hz] = h, z0 = o.vz === undefined ? cz - hz : o.vz;
    const F = [[[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, -1, 0]], [[0, 1, 0], [-1, 0, 0]], [[0, -1, 0], [1, 0, 0]]];
    for (const [n, t] of F) {
      if (o.skip && o.skip(n)) continue;
      const hw = Math.abs(t[0]) * hx + Math.abs(t[1]) * hy, cxn = cx + n[0] * hx, cyn = cy + n[1] * hy, u0 = o.u0 || 0;
      const a = this.V([cxn - t[0] * hw, cyn - t[1] * hw, cz - hz], n, u0, cz - hz - z0), b = this.V([cxn + t[0] * hw, cyn + t[1] * hw, cz - hz], n, u0 + hw * 2, cz - hz - z0);
      const d = this.V([cxn + t[0] * hw, cyn + t[1] * hw, cz + hz], n, u0 + hw * 2, cz + hz - z0), e = this.V([cxn - t[0] * hw, cyn - t[1] * hw, cz + hz], n, u0, cz + hz - z0);
      this.quad(a, b, d, e);
    }
    if (o.top !== false) { const k = this.k; if (o.topK !== undefined) this.k = o.topK; this.quad(this.V([cx - hx, cy - hy, cz + hz], [0, 0, 1], cx - hx, cy - hy), this.V([cx + hx, cy - hy, cz + hz], [0, 0, 1], cx + hx, cy - hy), this.V([cx + hx, cy + hy, cz + hz], [0, 0, 1], cx + hx, cy + hy), this.V([cx - hx, cy + hy, cz + hz], [0, 0, 1], cx - hx, cy + hy)); this.k = k; }
    if (o.bot) this.quad(this.V([cx - hx, cy + hy, cz - hz], [0, 0, -1]), this.V([cx + hx, cy + hy, cz - hz], [0, 0, -1]), this.V([cx + hx, cy - hy, cz - hz], [0, 0, -1]), this.V([cx - hx, cy - hy, cz - hz], [0, 0, -1]));
    return this;
  };
  /* silinder / kerucut dari a ke b (normal halus); o: cap0, cap1, q (rasio elips), ph */
  P.cyl = function (a, b, r0, r1, n, o) {
    o = o || {}; const d = sub(b, a), L = Math.hypot(...d) || 1e-6, w = mul(d, 1 / L);
    let up = Math.abs(w[2]) > .95 ? [1, 0, 0] : [0, 0, 1]; const u = nrm(sub(up, mul(w, dot(up, w)))), v = crs(w, u), q = o.q || 1, sl = (r0 - r1) / L, ph = o.ph || 0;
    const base = this.n;
    for (let s = 0; s <= 1; s++) for (let i = 0; i <= n; i++) {
      const t = ph + i / n * 6.2832, ct = Math.cos(t), st = Math.sin(t), r = s ? r1 : r0, nn = nrm(add(add(mul(u, ct), mul(v, st / q)), mul(w, sl)));
      this.V(add(s ? b : a, add(mul(u, ct * r), mul(v, st * r * q))), nn, i / n * 6.2832 * (r0 + r1) * .5, s * L);
    }
    for (let i = 0; i < n; i++) this.quad(base + i, base + i + 1, base + n + 2 + i, base + n + 1 + i);
    const cap = (c, r, nn) => { const id = []; for (let i = 0; i < n; i++) { const t = ph + i / n * 6.2832; id.push(this.V(add(c, add(mul(u, Math.cos(t) * r), mul(v, Math.sin(t) * r * q))), nn, Math.cos(t) * r, Math.sin(t) * r)); } for (let i = 1; i < n - 1; i++) this.tri(id[0], id[i], id[i + 1]); };
    if (o.cap0 !== false && r0 > 0) cap(a, r0, mul(w, -1));
    if (o.cap1 !== false && r1 > 0) cap(b, r1, w);
    return this;
  };
  /* elipsoid / kubah */
  P.sph = function (c, r, n, m, o) {
    o = o || {}; const base = this.n, lo = o.hemi ? 0 : -1;
    for (let j = 0; j <= m; j++) {
      const ph = (lo + (1 - lo) * j / m) * Math.PI / 2, cp = Math.cos(ph), sp = Math.sin(ph);
      for (let i = 0; i <= n; i++) { const t = i / n * 6.2832, d = [Math.cos(t) * cp, Math.sin(t) * cp, sp]; this.V([c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]], nrm([d[0] / r[0], d[1] / r[1], d[2] / r[2]]), t * r[0], ph * r[2]); }
    }
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i; this.quad(a, a + 1, a + n + 2, a + n + 1); }
    return this;
  };
  /* putaran profil [[r, z]] di sekitar sumbu z lokal */
  P.lathe = function (c, prof, n) {
    const base = this.n;
    for (let j = 0; j < prof.length; j++) {
      const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(prof.length - 1, j + 1)], dr = pb[0] - pa[0], dz = pb[1] - pa[1], l = Math.hypot(dr, dz) || 1;
      for (let i = 0; i <= n; i++) { const t = i / n * 6.2832, ct = Math.cos(t), st = Math.sin(t); this.V([c[0] + ct * prof[j][0], c[1] + st * prof[j][0], c[2] + prof[j][1]], [ct * dz / l, st * dz / l, -dr / l], t * prof[j][0], prof[j][1]); }
    }
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i; this.quad(a, a + 1, a + n + 2, a + n + 1); }
    return this;
  };
  /* ekstrusi profil samping [[x, z]] sepanjang y lokal dari y0 ke y1 */
  P.ext = function (pr, y0, y1) {
    let a2 = 0; for (let i = 0; i < pr.length; i++) { const p = pr[i], q = pr[(i + 1) % pr.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const sg = a2 > 0 ? 1 : -1, tri = earClip(pr);
    for (const [y, ny] of [[y0, -1], [y1, 1]]) { const id = pr.map(p => this.V([p[0], y, p[1]], [0, ny, 0], p[0], p[1])); for (const t of tri) if (ny > 0) this.tri(id[t[0]], id[t[2]], id[t[1]]); else this.tri(id[t[0]], id[t[1]], id[t[2]]); }
    let u = 0;
    for (let i = 0; i < pr.length; i++) {
      const p = pr[i], q = pr[(i + 1) % pr.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); if (l < 1e-6) continue;
      const n = [dz / l * sg, 0, -dx / l * sg];
      this.quad(this.V([p[0], y0, p[1]], n, u, 0), this.V([q[0], y0, q[1]], n, u + l, 0), this.V([q[0], y1, q[1]], n, u + l, y1 - y0), this.V([p[0], y1, p[1]], n, u, y1 - y0)); u += l;
    }
    return this;
  };
  /* kartu daun: pusat c, sumbu a (lebar), b (tinggi), petak atlas, normal (opsional: bulat dari pusat tajuk) */
  P.card = function (c, a, b, tile, n, flip) {
    const nn = n || nrm(crs(a, b)), u0 = (tile % 4) / 4, v0 = Math.floor(tile / 4) / 2, du = .25, dv = .5;
    const p = [sub(sub(c, a), b), add(sub(c, b), a), add(add(c, a), b), sub(add(c, b), a)];
    const uv = flip ? [[u0 + du, v0 + dv], [u0, v0 + dv], [u0, v0], [u0 + du, v0]] : [[u0, v0 + dv], [u0 + du, v0 + dv], [u0 + du, v0], [u0, v0]];
    const id = p.map((q, j) => this.V(q, nn, uv[j][0], uv[j][1])); this.quad(id[0], id[1], id[2], id[3]);
  };
  P.done = function () { return { v: new Float32Array(this.v), i: new Uint32Array(this.i), n: this.n, ni: this.i.length, min: this.min, max: this.max }; };
  MD.Mesh = Mesh;
  function earClip(pr) {
    const idx = pr.map((_, i) => i), out = []; let a2 = 0;
    for (let i = 0; i < pr.length; i++) { const p = pr[i], q = pr[(i + 1) % pr.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const sg = a2 > 0 ? 1 : -1, cr = (a, b, c) => ((pr[b][0] - pr[a][0]) * (pr[c][1] - pr[a][1]) - (pr[b][1] - pr[a][1]) * (pr[c][0] - pr[a][0])) * sg;
    for (let g = 0; idx.length > 3 && g < 500; g++) {
      let cut = -1;
      for (let i = 0; i < idx.length && cut < 0; i++) {
        const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length]; if (cr(a, b, c) <= 1e-12) continue;
        let inside = false; for (const p of idx) if (p !== a && p !== b && p !== c && cr(a, b, p) >= 0 && cr(b, c, p) >= 0 && cr(c, a, p) >= 0) { inside = true; break; }
        if (!inside) { out.push([a, b, c]); cut = i; }
      }
      if (cut < 0) break; idx.splice(cut, 1);
    }
    for (let i = 1; i < idx.length - 1; i++) out.push([idx[0], idx[i], idx[i + 1]]);
    return out;
  }

  /* ============================================================
     ATLAS DAUN (kanvas 1024×512, 4×2 petak 256 px, alfa = bentuk)
     0 daun lebar · 1 cabang pinus · 2 pelepah palem · 3 rumput
     4 semak · 5 lumut gantung · 6 ranting kering · 7 gelagah
     ============================================================ */
  MD.leafAtlas = function () {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d');
    let sd = 7; const R = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const tile = (k, fn) => { g.save(); g.translate((k % 4) * 256, Math.floor(k / 4) * 256); g.beginPath(); g.rect(0, 0, 256, 256); g.clip(); fn(); g.restore(); };
    const leaf = (x, y, a, l, w, col) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * .5, -w, l, 0); g.quadraticCurveTo(l * .5, w, 0, 0); g.fill(); g.restore(); };
    const gc = (r, gg, b, v) => 'rgb(' + (r + (R() - .5) * v | 0) + ',' + (gg + (R() - .5) * v | 0) + ',' + (b + (R() - .5) * v * .6 | 0) + ')';
    tile(0, () => {   // gugus daun lebar
      g.strokeStyle = 'rgb(70,52,34)'; g.lineWidth = 3; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(128, 250); g.quadraticCurveTo(128 + (R() - .5) * 80, 160, 30 + R() * 196, 30 + R() * 140); g.stroke(); }
      for (let i = 0; i < 420; i++) { const a = R() * 6.28, r = Math.sqrt(R()) * 112, x = 128 + Math.cos(a) * r, y = 120 + Math.sin(a) * r * .9; if (y > 236) continue; const sh = 1 - r / 160 * .4 + (y < 110 ? .12 : -.05); leaf(x, y, R() * 6.28, 15 + R() * 13, 5 + R() * 4, gc(62 * sh, 98 * sh, 42 * sh, 30)); }
    });
    tile(1, () => {   // cabang pinus (jarum)
      g.strokeStyle = 'rgb(76,54,36)'; g.lineWidth = 4; g.beginPath(); g.moveTo(4, 128); g.lineTo(250, 128); g.stroke();
      for (let i = 0; i < 46; i++) { const x = 10 + i * 5.2, wid = (1 - x / 280) * 92 + 18; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 30, 128 - wid * (.6 + R() * .4)); g.moveTo(x, 128); g.lineTo(x + 30, 128 + wid * (.6 + R() * .4)); g.stroke(); }
      for (let i = 0; i < 1500; i++) { const x = R() * 250, wid = (1 - x / 280) * 100 + 14, y = 128 + (R() - .5) * 2 * wid; g.strokeStyle = gc(34, 64, 36, 26); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7 + R() * 7, y + (R() - .5) * 8); g.stroke(); }
    });
    tile(2, () => {   // pelepah palem
      g.strokeStyle = 'rgb(118,104,56)'; g.lineWidth = 4; g.beginPath(); g.moveTo(4, 128); g.quadraticCurveTo(130, 116, 252, 140); g.stroke();
      for (let i = 0; i < 60; i++) { const t = i / 60, x = 6 + t * 244, y = 128 - 10 * Math.sin(t * 3) + t * 12, l = (1 - Math.abs(t - .35) * 1.2) * 110 + 12;
        for (const s of [-1, 1]) { g.strokeStyle = gc(80, 116, 44, 30); g.lineWidth = 4 - t * 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y + s * l * .5, x + 34, y + s * l); g.stroke(); } }
    });
    tile(3, () => {   // rumput
      for (let i = 0; i < 90; i++) { const x = 128 + (R() - .5) * 140, tx = x + (R() - .5) * 110, ty = 10 + R() * 120; g.strokeStyle = gc(90, 124, 54, 40); g.lineWidth = 2 + R() * 3; g.beginPath(); g.moveTo(x, 256); g.quadraticCurveTo(x, (256 + ty) / 2, tx, ty); g.stroke(); }
    });
    tile(4, () => {   // semak
      for (let i = 0; i < 520; i++) { const a = R() * 6.28, r = Math.sqrt(R()) * 118, x = 128 + Math.cos(a) * r, y = 140 + Math.sin(a) * r * .8; if (y > 250) continue; leaf(x, y, R() * 6.28, 10 + R() * 9, 4 + R() * 3, gc(56, 88, 40, 34)); }
    });
    tile(5, () => {   // lumut gantung / dedaunan cemara rawa
      for (let i = 0; i < 70; i++) { const x = 10 + R() * 236, l = 60 + R() * 180; g.strokeStyle = gc(120, 132, 98, 30); g.lineWidth = 1.5 + R() * 2.5; g.beginPath(); g.moveTo(x, 0); let yy = 0, xx = x; while (yy < l) { yy += 12; xx += (R() - .5) * 8; g.lineTo(xx, yy); } g.stroke(); }
      for (let i = 0; i < 300; i++) leaf(R() * 256, R() * 60, Math.PI / 2 + (R() - .5), 12 + R() * 10, 3, gc(70, 92, 52, 30));
    });
    tile(6, () => {   // ranting kering
      const br = (x, y, a, l, w, d) => { if (d > 5 || l < 6) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; g.strokeStyle = 'rgb(54,44,38)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); br(x2, y2, a - .4 - R() * .3, l * .72, w * .7, d + 1); br(x2, y2, a + .35 + R() * .3, l * .68, w * .7, d + 1); };
      br(128, 256, -Math.PI / 2, 70, 8, 0);
    });
    tile(7, () => {   // gelagah / ilalang rawa
      for (let i = 0; i < 60; i++) { const x = 128 + (R() - .5) * 150, tx = x + (R() - .5) * 40, ty = 6 + R() * 60; g.strokeStyle = gc(84, 104, 56, 36); g.lineWidth = 2 + R() * 2; g.beginPath(); g.moveTo(x, 256); g.quadraticCurveTo(x, 150, tx, ty); g.stroke(); if (R() < .25) { g.fillStyle = 'rgb(92,62,38)'; g.fillRect(tx - 3, ty + 4, 6, 26); } }
    });
    // isi warna rata-rata petak ke piksel transparan (agar mipmap tidak bertepi gelap)
    const img = g.getImageData(0, 0, 1024, 512), d = img.data;
    for (let k = 0; k < 8; k++) {
      const x0 = (k % 4) * 256, y0 = Math.floor(k / 4) * 256; let r = 0, gg = 0, b = 0, n = 0;
      for (let y = y0; y < y0 + 256; y += 2) for (let x = x0; x < x0 + 256; x += 2) { const i = (y * 1024 + x) * 4; if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
      if (!n) continue; r /= n; gg /= n; b /= n;
      for (let y = y0; y < y0 + 256; y++) for (let x = x0; x < x0 + 256; x++) { const i = (y * 1024 + x) * 4; if (d[i + 3] < 8) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; } }
    }
    return img;
  };

  /* ============================================================
     POHON & VEGETASI (tinggi nominal, diskalakan per instans)
     lod: 0 dekat (lengkap), 1 menengah, 2 jauh
     ============================================================ */
  const BARK = [92, 72, 54], CROWN = (m, c, k) => nrm(add(sub(c, k), [0, 0, .25]));
  MD.tree = function (kind, vari, lod) {
    const m = new Mesh(), r = j => hsh(vari * 97 + j, kind * 31 + 5), L = lod;
    const trunk = (h, r0, r1, n, bark) => { m.set(bark || BARK, .05, K.BARK, 0); m.cyl([0, 0, -.3], [0, 0, h], r0, r1, n || 7, { cap0: false }); };
    if (kind === 0) {   // pinus — tinggi nominal 10
      trunk(10, .24, .05, L ? 5 : 8); m.set([255, 255, 255], .02, K.LEAF, 0);
      const step = L === 0 ? .42 : L === 1 ? .8 : 1.6, per = L === 0 ? 6 : L === 1 ? 4 : 3;
      for (let z = 2.2, w = 0; z < 9.9; z += step, w++) {
        const len = (1 - (z - 2) / 8.5) * 3.1 + .45, k0 = r(w) * 6.28;
        for (let i = 0; i < per; i++) {
          const a = k0 + i / per * 6.28, d = [Math.cos(a), Math.sin(a), 0], c = add([0, 0, z], mul(d, len * .55)), dr = -.22 - r(w * 7 + i) * .2;
          const ax = mul(nrm([d[0], d[1], dr]), len * .55), side = mul([-d[1], d[0], 0], len * .42);
          m.card(add(c, [0, 0, dr * len * .3]), ax, side, 1, nrm([d[0] * .5, d[1] * .5, 1]));
          if (L < 2) m.card(add(c, [0, 0, dr * len * .3]), ax, [0, 0, len * .3], 1, nrm([d[0], d[1], .4]));
        }
      }
      if (L < 2) m.card([0, 0, 9.9], [.5, 0, .7], [0, .5, 0], 1, [0, 0, 1]);
    } else if (kind === 1) {   // daun lebar — tinggi nominal 10
      trunk(4.6, .32, .2, L ? 6 : 9);
      const cc = [0, 0, 6.4], br = L === 2 ? 0 : L === 1 ? 3 : 5;
      m.set(BARK, .05, K.BARK, 0);
      for (let i = 0; i < br; i++) { const a = r(i) * 6.28, e = [Math.cos(a) * 2.2, Math.sin(a) * 2.2, 7 + r(i + 9) * 1.6]; m.cyl([0, 0, 4.2], e, .17, .06, 5, { cap0: false }); }
      m.set([255, 255, 255], .02, K.LEAF, 0);
      const n = L === 0 ? 46 : L === 1 ? 18 : 7, sz = L === 0 ? 1.45 : L === 1 ? 2.1 : 2.9;
      for (let i = 0; i < n; i++) {
        const u = r(i * 3 + 1) * 2 - 1, a = r(i * 3 + 2) * 6.28, s = Math.sqrt(1 - u * u), p = add(cc, [Math.cos(a) * s * 3.2, Math.sin(a) * s * 3.2, u * 2.5]);
        const nn = CROWN(m, p, cc), t = nrm(crs(nn, [r(i) - .5, r(i + 5) - .5, .6])), bt = crs(nn, t);
        m.card(p, mul(t, sz), mul(bt, sz), 0, nn, r(i + 11) < .5);
      }
    } else if (kind === 4) {   // palem — tinggi nominal 10
      const bend = (r(1) - .5) * 1.4, pts = []; for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push([bend * t * t * 2.2, bend * t * t * .6, t * 9.6 - .3]); }
      m.set([138, 118, 92], .05, K.BARK, 1); for (let j = 0; j < 6; j++) m.cyl(pts[j], pts[j + 1], .2 - j * .012, .19 - (j + 1) * .012, L ? 5 : 8, { cap0: false });
      const top = pts[6]; m.set([255, 255, 255], .02, K.LEAF, 0);
      const fr = L === 2 ? 6 : 11;
      for (let i = 0; i < fr; i++) {
        const a = i / fr * 6.28 + r(i) * .3, d = [Math.cos(a), Math.sin(a), 0], up = .35 - r(i + 3) * .5, side = mul([-d[1], d[0], 0], .85);
        const p1 = add(top, add(mul(d, 1.1), [0, 0, up * 1.1 + .15])), p2 = add(top, add(mul(d, 3), [0, 0, up * 1.4 - .9]));
        m.card(p1, sub(p1, top), side, 2, nrm(add(d, [0, 0, 1.2])));
        if (L < 2) m.card(add(p2, mul(sub(p2, p1), -.0)), mul(sub(p2, p1), .5), side, 2, nrm(add(d, [0, 0, .8])));
      }
      if (L === 0) { m.set([92, 74, 40], .2, K.PLAIN, 0); for (let i = 0; i < 4; i++) m.sph(add(top, [Math.cos(i * 1.6) * .25, Math.sin(i * 1.6) * .25, -.25]), [.12, .12, .14], 6, 4); }
    } else if (kind === 6) {   // cemara rawa — tinggi nominal 14, pangkal melebar
      m.set([96, 84, 70], .05, K.BARK, 2); m.lathe([0, 0, -.3], [[.62, 0], [.4, .5], [.28, 1.3], [.22, 3], [.15, 9], [.07, 13.5]], L ? 6 : 10);
      m.set([255, 255, 255], .02, K.LEAF, 0); const n = L === 0 ? 34 : L === 1 ? 14 : 7;
      for (let i = 0; i < n; i++) {
        const z = 6 + r(i) * 7.5, a = r(i + 40) * 6.28, rr = (1.2 + r(i + 80) * 2.6) * (1.3 - (z - 6) / 9), p = [Math.cos(a) * rr, Math.sin(a) * rr, z], d = [Math.cos(a), Math.sin(a), 0];
        if (L === 0 && i % 3 === 0) { m.set(BARK, .05, K.BARK, 0); m.cyl([0, 0, z - .6], p, .09, .04, 4); m.set([255, 255, 255], .02, K.LEAF, 0); }
        m.card(p, mul(nrm([d[0], d[1], .3]), 2.2), mul([-d[1], d[0], 0], 1.9), 0, nrm(add(d, [0, 0, .8])));
        if (L < 2 && i % 2 === 0) m.card(add(p, [0, 0, -1.4]), mul([-d[1], d[0], 0], .8), [0, 0, 1.3], 5, nrm(d));
      }
    } else if (kind === 7) {   // pohon mati / hangus — tinggi nominal 8
      const ch = [44, 38, 34]; m.set(ch, .03, K.BARK, 3); m.cyl([0, 0, -.3], [0, 0, 5], .26, .13, L ? 5 : 7, { cap0: false });
      const brs = L === 2 ? 2 : 5;
      for (let i = 0; i < brs; i++) {
        const a = r(i) * 6.28, z = 2.5 + r(i + 7) * 2.5, e = [Math.cos(a) * (1.4 + r(i + 3) * 1.4), Math.sin(a) * (1.4 + r(i + 3) * 1.4), z + 1.5 + r(i + 5) * 1.8];
        m.cyl([0, 0, z], e, .11, .03, 4);
        if (L === 0) { const e2 = add(e, [Math.cos(a + .8) * .9, Math.sin(a + .8) * .9, .9]); m.cyl(e, e2, .04, .015, 3); }
      }
      if (L < 2) { m.set([255, 255, 255], .02, K.LEAF, 0); m.card([0, 0, 6.3], [1.6, 0, 0], [0, 0, 1.8], 6, [0, -1, .2]); m.card([0, 0, 6.3], [0, 1.6, 0], [0, 0, 1.8], 6, [1, 0, .2]); }
    } else if (kind === 5) {   // kaktus saguaro — tinggi nominal 4
      m.set([74, 112, 62], .1, K.CACTUS, 0); m.cyl([0, 0, -.2], [0, 0, 3.75], .3, .27, L ? 8 : 14, { cap1: false }); m.sph([0, 0, 3.75], [.27, .27, .2], L ? 8 : 14, 4, { hemi: true });
      const arms = 1 + Math.floor(r(1) * 2.5);
      for (let i = 0; i < arms; i++) {
        const a = r(i + 2) * 6.28, z = 1.5 + r(i + 4) * 1.2, d = [Math.cos(a), Math.sin(a), 0], e = add([0, 0, z], mul(d, .65)), top = add(e, [0, 0, .9 + r(i + 6) * .7]);
        m.cyl(add([0, 0, z], mul(d, .15)), e, .17, .17, L ? 6 : 10); m.cyl(e, top, .18, .16, L ? 6 : 10, { cap1: false }); m.sph(top, [.16, .16, .13], L ? 6 : 10, 3, { hemi: true });
      }
    } else if (kind === 2) {   // semak — tinggi nominal 1
      m.set([255, 255, 255], .02, K.LEAF, 0); const n = L === 0 ? 9 : 4;
      for (let i = 0; i < n; i++) { const a = i / n * 6.28 + r(i), p = [Math.cos(a) * .35, Math.sin(a) * .35, .5 + r(i + 3) * .2], nn = nrm([Math.cos(a), Math.sin(a), .9]); m.card(p, mul([-Math.sin(a), Math.cos(a), 0], .7), mul(nrm([Math.cos(a) * .3, Math.sin(a) * .3, 1]), .55), 4, nn); }
      m.card([0, 0, .9], [.6, 0, 0], [0, .6, 0], 4, [0, 0, 1]);
    } else if (kind === 8) {   // gelagah — tinggi nominal 1,8
      m.set([255, 255, 255], .02, K.LEAF, 0); const n = L === 0 ? 5 : 3;
      for (let i = 0; i < n; i++) { const a = i / n * 3.14 + r(i) * .4, d = [Math.cos(a), Math.sin(a), 0]; m.card([d[1] * .15, -d[0] * .15, .9], mul(d, .75), [0, 0, .9], 7, nrm([-d[1], d[0], .5])); }
    } else if (kind === 3) {   // batu — elipsoid berderau
      m.set([255, 255, 255], .25, K.ROCK, 0); const n = L === 0 ? 10 : 6, mm = L === 0 ? 6 : 3, base = m.n; m.sph([0, 0, 0], [1, 1, 1], n, mm);
      for (let j = base; j < m.n; j++) { const o = j * STRIDE, x = m.v[o], y = m.v[o + 1], z = m.v[o + 2], k = .78 + hsh(Math.round(x * 9 + 40) * 131 + Math.round(y * 9 + 40) * 7 + Math.round(z * 9) + vari * 999, 3) * .38; m.v[o] = x * k; m.v[o + 1] = y * k; m.v[o + 2] = Math.max(-.35, z * k); }
    } else if (kind === 3.5) { /* cadangan */ }
    return m.done();
  };
  MD.TREE_H = { 0: 10, 1: 10, 2: 1, 3: 1, 4: 10, 5: 4, 6: 14, 7: 8, 8: 1.8 };

  /* ============================================================
     PRAJURIT (12 tulang) — 0 panggul 1 badan 2 kepala 3/4 lengan kanan
     5/6 lengan kiri 7/8 kaki kanan 9/10 kaki kiri 11 senjata
     ============================================================ */
  MD.PAL = {
    B: { uni: [72, 90, 56], vest: [56, 70, 46], helm: [60, 76, 48], band: [60, 190, 255], skin: [196, 156, 120], gl: [40, 40, 36], boot: [36, 32, 28] },
    US: { uni: [150, 134, 104], vest: [122, 110, 84], helm: [128, 116, 90], band: [60, 190, 255], skin: [200, 160, 128], gl: [92, 80, 62], boot: [104, 86, 62] },
    R: { uni: [86, 92, 82], vest: [52, 56, 50], helm: [62, 66, 58], band: [230, 50, 40], skin: [184, 146, 116], gl: [30, 30, 30], boot: [28, 26, 24] }
  };
  MD.human = function (palK, kit, type) {
    const OP = type === 'OPR';   // operator pemain: jaket taktis abu arang, rig dada, bandana hitam, sarung tangan hitam
    const c = OP ? Object.assign({}, MD.PAL[palK], { gl: [28, 28, 30], boot: [30, 28, 26] }) : MD.PAL[palK], m = new Mesh(), SF = type === 'SF' || type === 'CMDR' || type === 'WARLORD' || type === 'CLAY', BIG = type === 'WARLORD' || type === 'CLAY', uni = OP ? [48, 50, 52] : SF ? [46, 50, 48] : c.uni, vest = OP ? [40, 42, 42] : SF ? [34, 36, 34] : c.vest;
    // tubuh dibentuk seperti manusia (bukan kotak): pinggul & dada membulat, bahu/siku/lutut berbentuk sendi, otot lengan & paha, wajah, sepatu bot bersol
    const sk = c.skin, sd3 = b => b === 3 || b === 7 ? 1 : -1, pants = OP ? [78, 76, 64] : uni;   // sd3: sisi luar tulang (+y = tulang 3 & 7) · operator: celana coyote gelap (jaket tetap abu arang)
    // 0 panggul: pinggul, selangkangan, sabuk + gesper, kantong pinggang
    m.bone(0).set(pants, .04, K.CLOTH, 0); m.push({ c: [[.72, 0, 0], [0, 1.05, 0], [0, 0, 1]], t: [0, 0, 0] }); m.lathe([0, 0, -.12], [[.1, 0], [.14, .04], [.155, .12], [.15, .2], [.14, .25], [.08, .27], [0, .275]], 12); m.pop();
    m.sph([0, 0, -.1], [.085, .11, .07], 10, 5);
    m.set([40, 38, 34], .1, K.PLAIN); m.push({ c: [[.74, 0, 0], [0, 1.06, 0], [0, 0, 1]], t: [0, 0, 0] }); m.cyl([0, 0, .06], [0, 0, .105], .153, .152, 14, { cap0: false, cap1: false }); m.pop();
    m.set([96, 90, 64], .5, K.METAL).box([.112, 0, .083], [.006, .024, .016]);
    m.set(vest.map(v => v * .9), .05, K.CLOTH, 1).box([.02, .165, -.01], [.045, .028, .055]).box([-.05, -.155, -.01], [.04, .028, .05]);
    // 1 badan: dada & perut membulat, punggung, leher, rompi pelat yang mengikuti bentuk dada, kantong magasin, tali bahu, ransel serbu
    m.bone(1).set(uni, .04, K.CLOTH, 0); m.push({ c: [[.7, 0, 0], [0, 1.12, 0], [0, 0, 1]], t: [0, 0, 0] }); m.lathe([0, 0, 0], [[.125, -.03], [.13, .06], [.145, .17], [.163, .3], [.168, .37], [.155, .435], [.115, .485], [.06, .515]], 14); m.pop();
    m.set(vest, .05, K.CLOTH, 1); m.push({ c: [[.8, 0, 0], [0, 1.09, 0], [0, 0, 1]], t: [.006, 0, 0] }); m.lathe([0, 0, 0], [[.148, .13], [.168, .18], [.178, .28], [.177, .37], [.16, .44], [.13, .455]], 14); m.pop();
    m.set(vest.map(v => v * .85), .05, K.CLOTH, 1); for (let i = -1; i <= 1; i++) m.box([.152, i * .068, .235], [.022, .029, .055]);
    m.box([.146, 0, .355], [.012, .07, .035]); for (const s of [1, -1]) m.box([.0, s * .1, .455], [.12, .026, .011]);
    m.box([-.157, 0, .3], [.03, .115, .12]);
    if (!OP) { m.set(c.band, .2, K.PLAIN).box([0, .2, .37], [.04, .008, .026]); m.box([0, -.2, .37], [.04, .008, .026]); }
    else {   // kerah jaket, tali bahu rig, radio + mikrofon genggam di tali kiri, kantong lengan
      m.set([58, 56, 50], .06, K.CLOTH).box([.15, .09, .36], [.012, .022, .14]).box([.15, -.09, .36], [.012, .022, .14]).box([-.16, .09, .36], [.012, .022, .14]).box([-.16, -.09, .36], [.012, .022, .14]);
      m.set([24, 24, 26], .3, K.PLAIN).box([.172, -.095, .42], [.018, .028, .04]); m.cyl([.172, -.095, .38], [.17, -.06, .3], .004, .004, 3);
    }
    if (type === 'MEDIC') { m.set([230, 230, 226], .1, K.CLOTH).box([-.2, 0, .27], [.07, .15, .17]); m.set([210, 30, 30], .1, K.PLAIN).box([-.272, 0, .28], [.004, .1, .03]).box([-.272, 0, .28], [.004, .03, .1]); }
    else if (kit === 'RTO' || type === 'MORT' || kit === 'MG' || r1(kit) || type === 'AT') { m.set(vest.map(v => v * .9), .05, K.CLOTH, 1).box([-.2, 0, .28], [.07, .14, .16]); if (kit === 'RTO') { m.set([30, 30, 30], .3, K.PLAIN).cyl([-.22, .1, .42], [-.22, .1, 1.05], .006, .004, 3); } }
    // 2 kepala: tempurung, rahang & dagu, hidung, telinga, mata & alis; helm dengan pelek, rel samping, dudukan NVG & tali dagu
    m.bone(2).set(sk, .1, K.SKIN).cyl([-.01, 0, -.06], [-.01, 0, .07], .053, .048, 10, { cap0: false });   // leher (di tulang kepala: ikut tersembunyi di tampilan orang pertama)
    if (OP) m.set(uni.map(v => v * .9), .04, K.CLOTH).cyl([-.01, 0, -.05], [-.01, 0, .01], .085, .075, 10, { cap0: false });   // kerah jaket
    m.set(SF && type !== 'CLAY' ? [26, 26, 26] : sk, .12, K.SKIN, 0); m.sph([-.006, 0, .14], [.094, .082, .108], 12, 7);
    m.sph([.038, 0, .074], [.066, .064, .06], 10, 5); m.sph([.093, 0, .117], [.022, .013, .025], 6, 3);
    for (const s of [1, -1]) m.sph([-.008, s * .081, .124], [.018, .012, .026], 6, 3);
    m.set([30, 26, 24], .3, K.PLAIN).box([.084, .03, .15], [.008, .016, .007]).box([.084, -.03, .15], [.008, .016, .007]);
    m.set([44, 36, 30], .1, K.PLAIN).box([.088, .03, .167], [.008, .021, .005]).box([.088, -.03, .167], [.008, .021, .005]);
    if (OP) {   // bandana/do-rag hitam: menutup ubun-ubun, simpul & ekor kain menjuntai di tengkuk
      m.set([24, 24, 26], .05, K.CLOTH, 1).sph([-.005, 0, .14], [.105, .092, .09], 10, 5, { hemi: true }); m.cyl([-.005, 0, .125], [-.005, 0, .15], .104, .1, 10, { cap0: false, cap1: false });
      m.sph([-.1, 0, .12], [.03, .035, .025], 6, 4); m.box([-.11, .015, .05], [.012, .03, .06]).box([-.105, -.02, .04], [.012, .028, .07]);
    } else if (kit === 'OFF') { m.set(palK === 'R' ? [70, 74, 64] : [120, 30, 30], .06, K.CLOTH).sph([0, 0, .2], [.11, .105, .06], 10, 4, { hemi: true }); m.box([.08, 0, .2], [.035, .07, .006]); }
    else if (!BIG) {
      m.set(SF ? [28, 30, 28] : c.helm, .12, K.PAINT, 2); m.sph([0, 0, .15], [.125, .115, .112], 12, 6, { hemi: true }); m.cyl([0, 0, .132], [0, 0, .16], .13, .12, 12, { cap0: false, cap1: false });
      m.set((SF ? [28, 30, 28] : c.helm).map(v => v * .8), .12, K.PAINT).box([.118, 0, .215], [.012, .022, .018]); for (const s of [1, -1]) m.box([.0, s * .118, .175], [.055, .008, .012]);
      m.set([34, 32, 28], .1, K.PLAIN); for (const s of [1, -1]) m.cyl([-.01, s * .084, .15], [.045, s * .062, .045], .005, .005, 3);
      if (SF || kit === 'DMR') { m.set([24, 24, 24], .4, K.PLAIN).box([.12, 0, .23], [.026, .03, .022]); m.set([20, 30, 40], .9, K.GLASS).cyl([.135, .025, .21], [.165, .025, .21], .012, .012, 6).cyl([.135, -.025, .21], [.165, -.025, .21], .012, .012, 6); }
    }
    // 3/4 lengan kanan, 5/6 lengan kiri (memanjang ke -z lokal): bahu bulat, bisep, siku, lengan bawah meruncing, manset, sarung tangan dengan jari & ibu jari
    for (const [bu, bf] of [[3, 4], [5, 6]]) {
      const s = sd3(bu);
      m.bone(bu).set(uni, .04, K.CLOTH, 0); m.sph([0, 0, -.025], [.074, .07, .08], 10, 6); m.cyl([0, 0, -.03], [0, 0, -.27], .059, .047, 10, { cap0: false }); m.sph([.01, 0, -.135], [.055, .052, .1], 10, 5); m.sph([0, 0, -.285], [.047, .046, .05], 8, 5);
      if (OP) m.set([34, 34, 36], .05, K.CLOTH).box([.0, s * .058, -.1], [.035, .008, .03]); else m.set(c.band, .2, K.PLAIN).cyl([0, 0, -.06], [0, 0, -.1], .064, .062, 10, { cap0: false, cap1: false });
      m.bone(bf).set(uni, .04, K.CLOTH, 0); m.cyl([0, 0, 0], [0, 0, -.2], .046, .036, 10, { cap0: false }); m.sph([0, 0, -.065], [.048, .045, .085], 10, 5);
      m.set(c.gl, .1, K.CLOTH).cyl([0, 0, -.19], [0, 0, -.235], .04, .038, 8); m.sph([0, 0, -.285], [.027, .045, .058], 8, 5); m.sph([.022, 0, -.325], [.03, .042, .03], 8, 4); m.sph([.03, 0, -.262], [.016, .017, .03], 6, 3);
    }
    // 7/8 kaki kanan, 9/10 kaki kiri: pangkal paha, paha berotot + kantong kargo, pelindung lutut, betis, sepatu bot (batang, kaki, ujung, sol, hak)
    for (const [bt, bs] of [[7, 8], [9, 10]]) {
      const s = sd3(bt);
      m.bone(bt).set(pants, .04, K.CLOTH, 0); m.sph([0, 0, 0], [.1, .096, .1], 10, 5); m.cyl([0, 0, .02], [0, 0, -.43], .097, .062, 12, { cap0: false }); m.sph([.022, 0, -.17], [.085, .08, .17], 10, 6);
      m.set(pants.map(v => v * .88), .04, K.CLOTH).box([0, s * .083, -.2], [.05, .02, .062]); m.set(vest, .08, K.CLOTH).sph([.058, 0, -.44], [.036, .062, .066], 8, 4);
      m.bone(bs).set(pants, .04, K.CLOTH, 0); m.sph([0, 0, 0], [.064, .062, .06], 8, 5); m.cyl([0, 0, 0], [0, 0, -.3], .061, .045, 10, { cap0: false }); m.sph([-.02, 0, -.11], [.06, .055, .12], 10, 5);
      m.set(c.boot, .15, K.PLAIN).cyl([0, 0, -.26], [0, 0, -.43], .05, .058, 10); m.sph([.06, 0, -.44], [.12, .058, .045], 10, 5); m.sph([.15, 0, -.452], [.045, .054, .034], 8, 4);
      m.set(c.boot.map(v => v * .6), .1, K.PLAIN).box([.05, 0, -.482], [.135, .061, .009]).box([-.045, 0, -.468], [.03, .052, .02]);
    }
    // 11 senjata (asal = popor, +x ke depan)
    m.bone(11); const gun = [32, 33, 34];
    if (type === 'AT') { m.set([86, 92, 62], .15, K.PAINT, 0).cyl([-.35, 0, .02], [.65, 0, .02], .045, .045, 10); m.set(gun, .3, K.METAL).box([.1, 0, -.06], [.03, .015, .05]); }
    else if (type === 'MORT') { m.set([70, 74, 66], .3, K.METAL).cyl([-.1, 0, 0], [.7, 0, 0], .04, .04, 8); }
    else if (type === 'MEDIC') { m.set(gun, .3, K.METAL).box([.08, 0, 0], [.1, .015, .035]).box([.05, 0, -.06], [.02, .012, .05]); }
    else if (!BIG) {
      const L = kit === 'DMR' ? 1.1 : kit === 'SMG' ? .6 : kit === 'MG' ? 1 : kit === 'SG' ? .78 : .85;
      m.set(gun, .3, K.METAL); m.box([.06, 0, -.01], [.08, .02, .045]); m.box([.26, 0, .02], [.13, .025, .035]); m.box([.47, 0, .02], [.1, .028, .03]); m.cyl([.5, 0, .025], [L, 0, .025], kit === 'SG' ? .017 : .01, kit === 'SG' ? .017 : .01, 6);
      m.box([.2, 0, -.07], [.02, .014, .05]); if (kit !== 'SG') m.box([.3, 0, -.08], [.025, .015, kit === 'MG' ? .04 : .07]);
      if (kit === 'SG') { m.cyl([.42, 0, -.012], [.74, 0, -.012], .014, .014, 6); m.set([70, 52, 36], .2, K.PLAIN).box([.5, 0, -.012], [.06, .022, .022]); }   // tabung magasin + pompa kayu
      if (kit === 'RPG') {   // bazoka disandang menyilang di punggung
        m.bone(1).set([86, 92, 62], .15, K.PAINT, 0).cyl([-.22, .2, -.08], [-.22, -.14, .78], .045, .045, 10);
        m.set([60, 64, 44], .2, K.PAINT).cyl([-.22, -.14, .78], [-.22, -.18, .9], .06, .02, 8); m.bone(11).set(gun, .3, K.METAL);
      }
      if (kit === 'MG') { m.box([.3, 0, -.12], [.06, .04, .06]); m.box([.75, 0, -.06], [.006, .05, .006]); }
      if (kit === 'DMR') { m.set([20, 22, 24], .6, K.METAL).cyl([.18, 0, .08], [.42, 0, .08], .025, .025, 8); }
      if (kit === 'GL') { m.set(gun, .3, K.METAL).cyl([.35, 0, -.04], [.6, 0, -.04], .025, .025, 8); }
      if (SF) { m.set(gun, .3, K.METAL).cyl([L, 0, .025], [L + .16, 0, .025], .02, .02, 8); }
    }
    if (type === 'WARLORD') {   // SANG JENDERAL (v2.2, ±3,1 m — jauh lebih besar dari Komandan Bayangan): zirah bertenaga hitam bergaris emas, helm tertutup bertanduk
      // dengan mahkota emas & mata miring merah menyala, kerah baja tinggi, bahu raksasa berlapis & berduri, jubah merah tua, reaktor punggung
      // dengan dua cerobong menyala, tanda jasa & tali kehormatan, sarung tangan & lutut berduri, minigun raksasa + pod roket di bahu kiri
      const AR = [30, 30, 34], A2 = [48, 48, 54], GD = [200, 158, 66], RD = [255, 36, 24], CP = [116, 16, 18], HN = [44, 40, 38];
      m.bone(1).set(AR, .55, K.METAL).box([.1, 0, .3], [.14, .25, .21]).box([.12, 0, .1], [.08, .18, .07]).box([-.23, 0, .32], [.1, .22, .21]);   // pelat dada, perut, reaktor punggung
      m.cyl([0, 0, .42], [0, 0, .6], .15, .13, 12, { cap1: false });   // kerah baja tinggi
      m.set(GD, .7, K.METAL).box([.245, 0, .47], [.012, .22, .018]).box([.235, 0, .17], [.012, .17, .012]).cyl([.24, 0, .3], [.25, 0, .3], .075, .075, 10);   // garis emas & cincin lambang
      m.cyl([0, 0, .58], [0, 0, .61], .135, .135, 12, { cap0: false, cap1: false });
      m.set(RD, 0, K.EMIT).cyl([.25, 0, .3], [.258, 0, .3], .048, .048, 10);   // inti daya
      for (const [y, cl] of [[-.07, [200, 40, 40]], [-.12, [40, 120, 200]], [-.17, [230, 190, 60]]]) m.set(cl, .3, K.PLAIN).box([.243, y, .4], [.008, .02, .012]);   // pita tanda jasa
      m.set(GD, .7, K.METAL).cyl([.2, .2, .43], [.245, .07, .26], .008, .008, 4).cyl([.245, .07, .26], [.23, .17, .2], .008, .008, 4);   // tali kehormatan
      m.set([24, 24, 26], .5, K.METAL); for (const y of [.12, -.12]) m.cyl([-.29, y, .4], [-.29, y, .8], .045, .038, 8);   // cerobong reaktor
      m.set(RD, 0, K.EMIT); for (const y of [.12, -.12]) m.cyl([-.29, y, .8], [-.29, y, .82], .036, .036, 8);
      m.set([150, 120, 50], .6, K.METAL).cyl([-.2, .24, .2], [.05, .26, .04], .02, .02, 4);   // sabuk peluru dari reaktor ke minigun
      m.set(CP, .05, K.CLOTH, 1); m.push(X.chain(X.T(-.36, 0, .52), X.ry(-.22))); m.box([0, 0, -.52], [.012, .27, .52]); m.pop();   // jubah
      m.set(GD, .7, K.METAL); for (const y of [.2, -.2]) m.cyl([-.33, y, .52], [-.24, y, .55], .03, .03, 8);   // gesper jubah
      m.set(AR, .5, K.METAL).box([-.05, -.27, .66], [.13, .07, .08]); m.set([20, 20, 20], 0, K.PLAIN); for (const o of [-.03, .03]) for (const q of [-.025, .025]) m.cyl([.07, -.27 + o, .66 + q], [.085, -.27 + o, .66 + q], .02, .02, 6);   // pod roket bahu
      m.bone(2).set(AR, .55, K.METAL).sph([0, 0, .15], [.158, .148, .165], 12, 7); m.box([.1, 0, .07], [.065, .12, .07]);   // helm tertutup + pelindung rahang
      m.set(A2, .5, K.METAL); for (const z of [.04, .07, .1]) m.box([.165, 0, z], [.006, .07, .008]);   // kisi rahang
      m.set(RD, 0, K.EMIT); for (const s of [1, -1]) { m.push(X.chain(X.T(.153, s * .05, .165), X.rx(s * .3))); m.box([0, 0, 0], [.012, .036, .009]); m.pop(); }   // mata miring menyala
      m.set(GD, .7, K.METAL).cyl([0, 0, .2], [0, 0, .24], .163, .156, 14, { cap0: false, cap1: false }).box([-.01, 0, .32], [.12, .012, .03]);   // mahkota & jambul emas
      for (const a of [-.45, 0, .45]) m.cyl([Math.cos(a) * .15, Math.sin(a) * .15, .23], [Math.cos(a) * .17, Math.sin(a) * .17, .3], .022, .003, 5);   // gerigi mahkota
      m.set(HN, .5, K.PLAIN); for (const s of [1, -1]) { const P = [[0, s * .13, .21], [0, s * .24, .25], [.03, s * .3, .34], [.08, s * .31, .44], [.13, s * .29, .5]], R = [.04, .032, .024, .014, .003]; for (let k = 0; k < 4; k++) m.cyl(P[k], P[k + 1], R[k], R[k + 1], 6); }   // tanduk melengkung
      for (const b of [3, 5]) {   // bahu raksasa berlapis + rim emas + 3 duri
        const s = sd3(b); m.bone(b).set(AR, .55, K.METAL).sph([0, 0, .03], [.18, .17, .13], 10, 6); m.set(A2, .5, K.METAL).sph([0, 0, .09], [.14, .135, .08], 10, 5);
        m.set(GD, .7, K.METAL).cyl([0, 0, -.07], [0, 0, -.035], .172, .172, 12, { cap0: false, cap1: false });
        m.set(HN, .5, K.PLAIN); for (const x of [-.06, 0, .06]) m.cyl([x, s * .07, .13], [x * 1.3, s * .13, .3], .03, .003, 6);
      }
      for (const b of [4, 6]) { m.bone(b).set(AR, .55, K.METAL).cyl([0, 0, -.03], [0, 0, -.23], .078, .068, 8).box([.02, 0, -.3], [.05, .056, .04]); m.set(GD, .7, K.METAL).cyl([0, 0, -.2], [0, 0, -.22], .08, .08, 8, { cap0: false, cap1: false }); }   // sarung tangan baja
      for (const b of [7, 9]) { m.bone(b).set(AR, .55, K.METAL).box([.07, 0, -.2], [.045, .088, .17]); m.set(A2, .5, K.METAL).sph([.06, 0, -.44], [.06, .075, .07], 8, 4); m.set(HN, .5, K.PLAIN).cyl([.1, 0, -.44], [.18, 0, -.44], .03, .003, 6); }   // paha & lutut berduri
      for (const b of [8, 10]) m.bone(b).set(AR, .55, K.METAL).box([.06, 0, -.16], [.035, .08, .13]).sph([.07, 0, -.445], [.15, .075, .055], 8, 4);   // pelindung betis & sepatu baja
      m.bone(11).set([26, 26, 28], .5, K.METAL).cyl([0, 0, -.03], [.34, 0, -.03], .075, .075, 12).box([.12, 0, -.13], [.05, .02, .06]);   // minigun raksasa: badan + pegangan
      for (let i = 0; i < 6; i++) { const a = i * 1.047; m.cyl([.34, Math.cos(a) * .042, -.03 + Math.sin(a) * .042], [1.0, Math.cos(a) * .042, -.03 + Math.sin(a) * .042], .013, .013, 5); }
      m.cyl([.62, 0, -.03], [.65, 0, -.03], .066, .066, 12).cyl([.94, 0, -.03], [.98, 0, -.03], .066, .066, 12);
      m.set(GD, .7, K.METAL).cyl([.3, 0, -.03], [.34, 0, -.03], .08, .08, 12);
    }
    if (type === 'CLAY') {   // CLAY MARTIN (bos penyerbu, ±2,3 m): perpaduan Komandan Bayangan & Sang Jenderal. v2.2.4: zirah MELENGKUNG mengikuti tubuh
      // (dulu pelat kotak datar di dada & paha → tidak tampak seperti manusia): pelindung dada lathe, perut bersegmen, lengan & paha bersarung
      // tabung, lutut & bahu bulat; wajah terbuka, visor merah, headset; jetpack turbin ganda; RAILGUN berat (bukan laser) dengan pegangan
      // pistol & pelindung tangan tepat di titik genggam tangan (tulang 11: [.2,0,-.07] kanan, [.46,0,-.01] kiri)
      const AR = [56, 58, 62], A2 = [34, 35, 38], OR = [232, 112, 28], RD = [255, 48, 36], JF = [255, 150, 60], CY = [110, 210, 255], CU = [176, 104, 60];
      m.bone(1).set(AR, .45, K.METAL); m.push({ c: [[.84, 0, 0], [0, 1.12, 0], [0, 0, 1]], t: [.008, 0, 0] }); m.lathe([0, 0, 0], [[.158, .13], [.18, .18], [.19, .28], [.188, .37], [.17, .44], [.13, .472]], 16); m.pop();   // pelindung dada melengkung
      m.push({ c: [[.8, 0, 0], [0, 1.06, 0], [0, 0, 1]], t: [0, 0, 0] }); m.set(A2, .4, K.METAL); for (const z of [.0, .045, .09]) m.cyl([0, 0, z], [0, 0, z + .036], .158, .162, 14, { cap0: false, cap1: false }); m.pop();   // perut bersegmen
      m.set(OR, .3, K.PAINT).box([.162, 0, .36], [.006, .012, .07]); m.box([.15, .12, .42], [.02, .035, .006]).box([.15, -.12, .42], [.02, .035, .006]);   // garis jingga dada & bahu
      m.set(RD, 0, K.EMIT).box([.164, -.08, .27], [.004, .018, .018]);   // sensor dada
      m.set(A2, .4, K.METAL).box([-.22, 0, .3], [.06, .14, .15]);   // rangka jetpack
      for (const y of [.15, -.15]) {
        m.set(AR, .5, K.METAL).cyl([-.3, y, .52], [-.3, y, .1], .07, .07, 12); m.set(OR, .3, K.PAINT).cyl([-.3, y, .44], [-.3, y, .4], .073, .073, 12, { cap0: false, cap1: false });
        m.set(A2, .5, K.METAL).cyl([-.3, y, .1], [-.3, y, -.02], .058, .078, 12, { cap1: false }).cyl([-.3, y, .56], [-.3, y, .52], .05, .07, 12);   // nosel & corong masuk
        m.set(JF, 0, K.EMIT).cyl([-.3, y, -.005], [-.3, y, -.015], .05, .05, 10);   // pijar nosel
        m.set(A2, .4, K.METAL).box([-.37, y * 1.3, .22], [.03, .006, .1]);   // sirip
      }
      m.set([20, 20, 22], .3, K.PLAIN).cyl([-.22, -.15, .14], [-.02, -.2, .02], .013, .013, 5);   // kabel daya ke railgun
      m.bone(2).set(AR, .45, K.METAL).cyl([-.01, 0, -.04], [-.01, 0, .04], .088, .082, 10);   // kerah zirah
      m.set([34, 28, 24], .05, K.CLOTH).sph([-.012, 0, .158], [.1, .09, .085], 10, 5, { hemi: true });   // rambut cepak
      m.set([28, 28, 30], .3, K.PLAIN); for (const s of [1, -1]) m.cyl([-.01, s * .085, .13], [-.01, s * .108, .13], .04, .04, 8); m.cyl([-.01, .1, .13], [.08, .06, .07], .005, .005, 3);   // headset + mikrofon
      m.set(A2, .4, K.METAL).box([.06, 0, .152], [.03, .086, .018]); m.set(RD, 0, K.EMIT).box([.092, 0, .152], [.012, .07, .013]);   // visor merah
      for (const b of [3, 5]) { m.bone(b).set(AR, .45, K.METAL).sph([0, 0, 0], [.112, .105, .09], 10, 5).cyl([0, 0, -.07], [0, 0, -.23], .066, .056, 10, { cap0: false }); m.set(OR, .3, K.PAINT).cyl([0, 0, -.05], [0, 0, -.035], .1, .096, 10, { cap0: false, cap1: false }); }   // bahu bulat + sarung lengan atas
      for (const b of [4, 6]) m.bone(b).set(AR, .45, K.METAL).cyl([0, 0, -.03], [0, 0, -.19], .056, .046, 10);   // sarung lengan bawah
      for (const b of [7, 9]) m.bone(b).set(AR, .45, K.METAL).cyl([.012, 0, -.05], [.012, 0, -.37], .112, .082, 12, { cap0: false }).set(A2, .4, K.METAL).sph([.05, 0, -.44], [.055, .068, .065], 8, 5);   // sarung paha + tempurung lutut
      for (const b of [8, 10]) m.bone(b).set(AR, .45, K.METAL).cyl([.004, 0, -.04], [.004, 0, -.25], .07, .058, 10);   // pelindung betis
      // RAILGUN: popor, badan, bank kapasitor & teropong, pegangan pistol miring, sel daya, pelindung tangan, rel kembar + inti berpendar biru,
      // 5 kumparan tembaga, moncong bercabang
      m.bone(11).set([30, 31, 34], .5, K.METAL).box([.05, 0, -.02], [.06, .02, .038]).box([-.012, 0, -.026], [.01, .024, .05]);   // popor + bantalan
      m.box([.24, 0, 0], [.14, .033, .045]); m.set(OR, .3, K.PAINT).box([.24, .034, .005], [.1, .002, .008]).box([.24, -.034, .005], [.1, .002, .008]);   // badan + garis jingga
      m.set(A2, .5, K.METAL).cyl([.14, 0, .062], [.33, 0, .062], .026, .026, 10); m.set(CY, 0, K.EMIT).box([.235, 0, .088], [.06, .01, .003]);   // bank kapasitor + indikator muatan
      m.set([24, 24, 26], .5, K.METAL).cyl([.17, 0, .1], [.29, 0, .1], .016, .016, 10).box([.23, 0, .08], [.015, .006, .01]); m.set(RD, .9, K.GLASS).cyl([.29, 0, .1], [.292, 0, .1], .013, .013, 10);   // teropong
      m.set([30, 31, 34], .5, K.METAL); m.push(X.chain(X.T(.2, 0, -.085), X.ry(-.3))); m.box([0, 0, 0], [.02, .016, .048]); m.pop(); m.box([.25, 0, -.06], [.04, .004, .016]);   // pegangan pistol + pelindung pelatuk
      m.box([.31, 0, -.075], [.028, .02, .03]); m.set(CY, 0, K.EMIT).box([.31, .021, -.075], [.016, .001, .012]);   // sel daya
      m.set(A2, .5, K.METAL).box([.46, 0, 0], [.07, .042, .05]);   // pelindung tangan (genggaman kiri)
      m.set([40, 42, 46], .55, K.METAL).box([.72, 0, .03], [.3, .028, .008]).box([.72, 0, -.03], [.3, .028, .008]);   // rel kembar
      m.set(CY, 0, K.EMIT).box([.72, 0, 0], [.29, .006, .01]);   // inti berpendar di antara rel
      m.set(CU, .6, K.METAL); for (const x of [.56, .66, .76, .86, .96]) m.cyl([x, 0, 0], [x + .028, 0, 0], .05, .05, 12, { cap0: false, cap1: false });   // kumparan
      m.set([40, 42, 46], .55, K.METAL); for (const q of [1, -1]) m.box([1.04, 0, q * .03], [.02, .02, .008]); m.set(CY, 0, K.EMIT); for (const q of [1, -1]) m.box([1.06, 0, q * .03], [.003, .012, .006]);   // moncong bercabang
    }
    if (type === 'CMDR') {   // eksoskeleton: pelat dada & punggung, paket daya, bahu berlapis, helm visor dengan celah sensor merah
      const AR = [50, 52, 56], RD = [255, 40, 30];
      m.bone(1).set(AR, .45, K.METAL).box([.08, 0, .32], [.12, .21, .17]).box([-.2, 0, .3], [.09, .17, .2]); m.set([34, 34, 36], .4, K.METAL).box([-.31, 0, .3], [.03, .12, .14]);
      m.set(RD, 0, K.EMIT).box([-.345, .06, .38], [.006, .02, .02]).box([-.345, -.06, .38], [.006, .02, .02]);
      m.bone(2).set([36, 38, 42], .55, K.METAL).sph([0, 0, .15], [.14, .13, .135], 12, 5, { hemi: true }); m.box([.07, 0, .1], [.07, .1, .06]); m.set(RD, 0, K.EMIT).box([.135, 0, .15], [.02, .075, .012]);
      for (const b of [3, 5]) m.bone(b).set(AR, .45, K.METAL).sph([0, 0, .0], [.105, .1, .085], 10, 5);
      for (const b of [7, 9]) m.bone(b).set(AR, .45, K.METAL).box([.08, 0, -.2], [.03, .09, .14]);
      m.bone(11).set([28, 28, 30], .4, K.METAL).cyl([.35, 0, -.08], [.65, 0, -.08], .03, .03, 8);   // pelontar granat bawah laras
    }
    return m.done();
    function r1(k) { return k === 'GL' && palK === 'R'; }
  };

  /* pose prajurit → 12 matriks dunia. s: {x,y,z,yaw, mv(0..1), run, ph, aim(0..1), dead(0..1), t, look} */
  const RS = [0, .19, .43], LS = [0, -.19, .43];
  function ik(S, Tg, a, b, pole) {
    const d = sub(Tg, S); let L = Math.hypot(...d); const dir = nrm(d); L = Math.min(L, a + b - .002);
    const ca = (a * a + L * L - b * b) / (2 * a * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca)), pp = nrm(sub(pole, mul(dir, dot(pole, dir))));
    return add(S, add(mul(dir, a * ca), mul(pp, a * sa)));
  }
  MD.humanPose = function (s, out) {
    let U = X.chain(X.T(s.x, s.y, s.z), X.rz(s.yaw)); const mv = s.mv, run = s.run, ph = s.ph, cr = s.cr || 0;
    if (s.tilt) { const v = s.pv; U = X.chain(U, X.T(v[0], v[1], v[2]), X.ry(s.tilt), X.T(-v[0], -v[1], -v[2])); }   // badan rebah berporos di leher (terjun bebas: perut menghadap tanah)
    if (s.sc) U = X.cmp(U, { c: [[s.sc, 0, 0], [0, s.sc, 0], [0, 0, s.sc]], t: [0, 0, 0] });   // prajurit berukuran besar (Komandan Bayangan berzirah)
    if (s.dead > 0) return deadPose(s, U, out);
    const sw = Math.sin(ph) * mv * (run ? .75 : .5), bob = Math.abs(Math.cos(ph)) * .035 * mv, lean = run ? .28 : mv * .1, kneel = s.kneel || 0, kl = s.knl || 0;   // kl: berlutut satu kaki (operator jongkok diam)
    const pel = X.chain(U, X.T(-kneel * .08 - cr * .12 - kl * .1, 0, .97 + bob - kneel * .46 - cr * .55 - kl * .55), X.rz(Math.sin(ph) * .08 * mv));
    const tor = X.chain(pel, X.T(0, 0, .09), X.ry(-lean - kneel * .1 - cr * .3 - kl * .16), X.rz(-Math.sin(ph) * .1 * mv + (s.twist || 0)), s.tsq ? { c: [[1, 0, 0], [0, 1, 0], [0, 0, s.tsq]], t: [0, 0, 0] } : X.I());   // tsq: dada direndahkan (tubuh sendiri di tampilan orang pertama)
    const head = X.chain(tor, X.T(.01, 0, .52), X.ry(lean * .8), X.rz(s.look || 0));
    // senjata: siaga rendah saat bergerak, terangkat saat membidik
    const aim = s.aim; let gun = X.chain(tor, X.T(lerp(.12, .02, aim), lerp(.08, .17, aim), lerp(.2, .38, aim)), X.rz(lerp(.55, 0, aim)), X.ry(lerp(-.55, 0, aim) + (s.recoil || 0) * .15), X.T(-(s.recoil || 0) * .04, 0, 0));
    if (s.sling) {   // senapan tersandang diagonal di punggung (terjun, baru mendarat) → ditarik ke depan saat sling turun ke 0
      const bk = X.chain(tor, X.T(-.2, 0, .2), X.ry(-1.2), X.rx(.55)), k = Math.min(1, s.sling);
      gun = k >= 1 ? bk : { c: gun.c.map((a, i) => nrm([lerp(a[0], bk.c[i][0], k), lerp(a[1], bk.c[i][1], k), lerp(a[2], bk.c[i][2], k)])), t: [lerp(gun.t[0], bk.t[0], k), lerp(gun.t[1], bk.t[1], k), lerp(gun.t[2], bk.t[2], k)] };
    }
    let grip = X.ap(gun, [.2, 0, -.07]), fore = X.ap(gun, [s.long ? .55 : .46, 0, -.01]);
    if (s.hands && s.hands.k > 0) { const H = s.hands, k = Math.min(1, H.k), r = X.ap(tor, H.R), l = X.ap(tor, H.L); grip = [lerp(grip[0], r[0], k), lerp(grip[1], r[1], k), lerp(grip[2], r[2], k)]; fore = [lerp(fore[0], l[0], k), lerp(fore[1], l[1], k), lerp(fore[2], l[2], k)]; }   // tangan bebas (lengan terbentang, tali kemudi, bertumpu)
    const tw = p => X.ap(tor, p), ts = X.ap(tor, RS), tl = X.ap(tor, LS), fw = X.ar(U, [1, 0, 0]);
    const eR = ik(ts, grip, .29, .3, add(X.ar(tor, [-.3, .7, -1]), [0, 0, 0])), eL = ik(tl, fore, .29, .3, X.ar(tor, [-.2, -.9, -.8]));
    const B = [pel, tor, head, X.look(ts, sub(eR, ts), fw), X.look(eR, sub(grip, eR), fw), X.look(tl, sub(eL, tl), fw), X.look(eL, sub(fore, eL), fw)];
    void tw;
    for (const [side, p0] of [[1, 0], [-1, Math.PI]]) {
      const q = ph + p0, LG = s.legs;
      let th = (Math.sin(q) * mv * (run ? .75 : .5)) * (1 - kneel) - kneel * (side > 0 ? 0 : 1.5), kn = (.12 + Math.max(0, Math.sin(q + 1.3)) * (run ? 1.3 : .8)) * mv * (1 - kneel) + kneel * (side > 0 ? 1.62 : 1.5);
      if (cr) { th = th * (1 - cr * .5) - 1.2 * cr; kn = kn * (1 - cr * .5) + 2.2 * cr; }   // jongkok: paha ke depan, lutut menekuk, telapak tetap di bawah badan
      if (LG) { th = LG[0] + (LG[2] || 0) * side; kn = LG[1] - (LG[2] || 0) * side * .6; }
      if (kl) { const A = kneelLeg(side, s.gz || 0); th = th + (A[0] - th) * kl; kn = kn + (A[1] - kn) * kl; }
      const hip = X.chain(pel, X.T(0, side * .1, -.05), X.ry(-th)), knee = X.chain(hip, X.T(0, 0, -.44), X.ry(-kn));
      B.push(hip, knee);
    }
    B.push(gun);
    for (let i = 0; i < 12; i++) X.write(B[i], out, i * 16);
    return out;
  };
  /* berlutut satu kaki: sudut paha (th, negatif = ke depan) & tekuk lutut (kn) dari IK 2D di bidang sagital. Pinggul .37 m di atas asal model,
     gz = tinggi tanah relatif asal model (tubuh sendiri: kepala dikunci ke kamera, jadi asal bisa di atas/bawah tanah).
     Kanan: lutut menyentuh tanah di depan pinggul, tulang kering rebah ke belakang (duduk di tumit). Kiri: telapak menapak ±.42 m di depan */
  function kneelLeg(side, gz) {
    const hx = -.1, hz = .37, a = .44, b = .43;
    if (side > 0) { const dz = Math.max(.05, hz - gz - .075), hor = Math.sqrt(Math.max(0, a * a - dz * dz)), ft = Math.atan2(hor, dz); return [-ft, ft + 1.85]; }
    const dx = .42, dz = hz - gz - .1, L = Math.min(a + b - .01, Math.hypot(dx, dz)), al = Math.atan2(dx, dz), ga = Math.acos(Math.max(-1, Math.min(1, (a * a + L * L - b * b) / (2 * a * L))));
    const ft = al + ga, kx = a * Math.sin(ft), kz = -a * Math.cos(ft), fs = Math.atan2(dx - kx, kz + dz);
    void hx; return [-ft, ft - fs];
  }
  function deadPose(s, U, out) {
    const k = s.dead, e = 1 - (1 - k) * (1 - k), side = s.side || 1;
    const R0 = X.chain(U, X.T(-e * .1, 0, .1 * e), X.ry(e * 1.45), X.rx(side * e * .25));   // jatuh terlentang
    const pel = X.chain(R0, X.T(0, 0, .97 - e * .82)), tor = X.chain(pel, X.T(0, 0, .09), X.ry(e * .1)), head = X.chain(tor, X.T(.01, 0, .52), X.rz(side * .5 * e), X.ry(-.3 * e));
    const B = [pel, tor, head];
    for (const sd of [1, -1]) { const up = X.chain(tor, X.T(0, sd * .19, .43), X.rx(-sd * (.4 + 1.1 * e)), X.ry(.3 * e)); B.push(up, X.chain(up, X.T(0, 0, -.29), X.ry(.5 * e))); }
    for (const sd of [1, -1]) { const hip = X.chain(pel, X.T(0, sd * .1, -.05), X.rx(-sd * .15 * e), X.ry(-.1 * e)); B.push(hip, X.chain(hip, X.T(0, 0, -.44), X.ry(-.15 * e))); }
    B.push(X.chain(U, X.T(.4 - e * .2, .5 * side, .05 + (1 - e) * 1.2), X.rz(.9)));
    for (let i = 0; i < 12; i++) X.write(B[i], out, i * 16);
    return out;
  }

  /* animasi tewas bos prajurit (fps-bossdie): s.dk = detik sejak tewas, s.side = arah roboh
     'fwd'  (Komandan Bayangan): terhuyung ke belakang → jatuh berlutut → tersungkur ke depan (berporos di lutut), lengan menahan jatuh
     'knee' (Sang Jenderal): terhuyung → bertumpu satu lutut & terkulai (minigun lepas) → roboh ke samping
     'cray' (Cray Martin, v2.15): tersentak → jatuh berlutut SATU kaki, kedua tangan mencengkeram perut, membungkuk & goyah → roboh telentang ke belakang, kedua lengan terbentang */
  const CRD = MD.CRD = { fall: 1.5, hunch: .55, back: .4, low: .33, a1: .35, elb: .2, spread: 1.35, fold: 1.75, inw: .85 };   // setelan pose tewas Cray
  MD.humanDie = function (s, out) {
    let U = X.chain(X.T(s.x, s.y, s.z), X.rz(s.yaw)); if (s.sc) U = X.cmp(U, { c: [[s.sc, 0, 0], [0, s.sc, 0], [0, 0, s.sc]], t: [0, 0, 0] });
    const t = s.dk, sd0 = s.side || 1, sm = (a, b) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); }, acc = (a, b) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k; };
    const st = sm(0, .3) * (1 - sm(.3, .75)), B = [];
    let pel, tor, head, R, legs, gunM;
    if (s.die === 'fwd') {
      const kn = sm(.45, 1.1), F0 = acc(1.35, 2) * 1.47, bo = t > 2 ? .07 * Math.sin(Math.min(1, (t - 2) / .22) * Math.PI) : 0, F1 = F0 - bo;
      R = X.chain(U, X.T(-.14 * st - .05 * kn, 0, 0), X.T(0, 0, .13), X.ry(-F1), X.T(0, 0, -.13));
      pel = X.chain(R, X.T(0, 0, .97 - .44 * kn)); tor = X.chain(pel, X.T(0, 0, .09), X.ry(.35 * st - .3 * kn * (1 - sm(1.35, 2)))); head = X.chain(tor, X.T(.01, 0, .52), X.ry(-.25 * kn + .45 * sm(1.4, 2)), X.rz(sd0 * .7 * sm(1.6, 2.2)));
      for (const sd of [1, -1]) {   // lengan: terlempar ke belakang saat terkena, menggantung saat berlutut, terjulur ke depan menahan jatuh
        const a1 = -.5 * st + .15 * kn + sm(1.3, 1.9) * (sd > 0 ? 2.2 : .9), up = X.chain(tor, X.T(0, sd * .19, .43), X.ry(a1), X.rx(-sd * (.12 + .15 * kn)));
        B[sd > 0 ? 3 : 5] = up; B[sd > 0 ? 4 : 6] = X.chain(up, X.T(0, 0, -.29), X.ry(.35 * kn + (sd > 0 ? .5 : 1.2) * sm(1.3, 1.9)));
      }
      const knb = Math.max(.08, 1.62 * kn - F1);   // tulang kering tetap rebah di tanah saat badan berporos di lutut
      legs = [1, -1].map(sd => { const hip = X.chain(pel, X.T(0, sd * .1, -.05), X.ry(.25 * st * (sd > 0 ? 1 : 0)), X.rx(-sd * .06 * kn)); return [hip, X.chain(hip, X.T(0, 0, -.44), X.ry(-knb))]; });
      const gk = acc(.5, .95); gunM = X.chain(U, X.T(.55, -.3, Math.max(.04, 1.05 * (1 - gk)) + .04), X.rz(.9 + gk * .6), X.rx(1.5 * gk));   // senjata terlepas & jatuh
    } else if (s.die === 'cray') {
      const k1 = sm(.3, .85), hug = sm(.25, .75) * (1 - sm(2.5, 2.95)), fb = acc(2.5, 3.25), bo = t > 3.25 ? .06 * Math.sin(Math.min(1, (t - 3.25) / .25) * Math.PI) : 0, Fb = CRD.fall * fb - bo, ly = sm(2.5, 3.3), spr = sm(2.55, 3.15);
      const sway = t > .85 && t < 2.5 ? .05 * Math.sin((t - .85) * 2.4) : 0, hun = CRD.hunch * k1 * (1 - sm(2.45, 2.9));
      pel = X.chain(U, X.T(-.08 * st - .04 * k1 - CRD.back * ly, 0, .97 - .46 * k1 - CRD.low * ly), X.ry(Fb));   // panggul: turun saat berlutut, lalu rebah ke belakang (berporos di panggul)
      tor = X.chain(pel, X.T(0, 0, .09), X.ry(.35 * st - hun + .08 * ly), X.rx(sway)); head = X.chain(tor, X.T(.01, 0, .52), X.ry(-.5 * k1 * (1 - ly) + .3 * ly), X.rz(sd0 * .55 * sm(3, 3.6)));
      for (const sd of [1, -1]) {   // memegang perut: lengan atas sedikit ke depan & siku keluar, lengan bawah terlipat ke depan-dalam → telapak di perut; roboh: lengan terbentang lurus ke samping
        const a1 = -.5 * st + hug * (sd > 0 ? CRD.a1 : CRD.a1 - .1) + spr * .12, ab = sd * (-.12 + CRD.elb * hug + CRD.spread * spr), up = X.chain(tor, X.T(0, sd * .19, .43), X.ry(a1), X.rx(ab));
        B[sd > 0 ? 3 : 5] = up; B[sd > 0 ? 4 : 6] = X.chain(up, X.T(0, 0, -.29), X.ry(hug * (sd > 0 ? CRD.fold : CRD.fold - .15) + .12 * spr), X.rx(-sd * hug * CRD.inw));
      }
      legs = [1, -1].map(sd => {   // kanan: lutut di tanah, tulang kering rebah ke belakang · kiri: telapak menapak, paha mendatar ke depan → saat roboh kaki terjulur, lutut kiri sedikit menekuk
        const th = sd > 0 ? 0 : -1.5 * k1 * (1 - ly) - .45 * ly, kn = sd > 0 ? 1.62 * k1 * (1 - ly) + .08 * ly : 1.5 * k1 * (1 - ly) + .8 * ly;
        const hip = X.chain(pel, X.T(0, sd * .1, -.05), X.ry(-th + .25 * st * (sd > 0 ? 1 : 0))); return [hip, X.chain(hip, X.T(0, 0, -.44), X.ry(-kn))];
      });
      const gk = acc(.3, .78), gx = sm(.3, .78); gunM = X.chain(U, X.T(.3 + .4 * gx, -.12 - .26 * gx, Math.max(.05, 1.05 * (1 - gk)) + .05), X.rz(.2 + gk * 1.1), X.rx(1.5 * gk));   // railgun terlepas dari tangan, jatuh di samping lutut
    } else {
      const k1 = sm(.55, 1.2), sway = t > 1.2 && t < 3.3 ? .07 * Math.sin((t - 1.2) * 2.2) : 0, Fs = acc(3.3, 4.1) * 1.4, bo = t > 4.1 ? .06 * Math.sin(Math.min(1, (t - 4.1) / .25) * Math.PI) : 0, py = -sd0 * .3;
      R = X.chain(U, X.T(-.12 * st - .08 * k1, py, 0), X.rx(sd0 * (Fs - bo)), X.T(0, -py, 0));
      pel = X.chain(R, X.T(0, 0, .97 - .46 * k1)); tor = X.chain(pel, X.T(0, 0, .09), X.ry(.3 * st - .5 * k1 * (1 - sm(3.3, 4)) - .15 * sm(3.3, 4)), X.rx(sway)); head = X.chain(tor, X.T(.01, 0, .52), X.ry(-.45 * k1 + .3 * sm(3.5, 4.2)), X.rz(-sd0 * .4 * sm(3.6, 4.3)));
      for (const sd of [1, -1]) {   // lengan menggantung lemas; kiri bertumpu di lutut kiri
        const a1 = -.45 * st + k1 * (sd > 0 ? .25 : .95) + sm(3.4, 4.1) * (sd > 0 ? .4 : -.3), up = X.chain(tor, X.T(0, sd * .19, .43), X.ry(a1), X.rx(-sd * (.15 + .25 * sm(3.4, 4.1))));
        B[sd > 0 ? 3 : 5] = up; B[sd > 0 ? 4 : 6] = X.chain(up, X.T(0, 0, -.29), X.ry(k1 * (sd > 0 ? .25 : .9)));
      }
      legs = [1, -1].map(sd => { const th = sd > 0 ? 0 : -1.5 * k1, kn = sd > 0 ? 1.62 * k1 : 1.5 * k1 + .3 * sm(3.4, 4.1), hip = X.chain(pel, X.T(0, sd * .1, -.05), X.ry(-th + .25 * st * (sd > 0 ? 1 : 0))); return [hip, X.chain(hip, X.T(0, 0, -.44), X.ry(-kn))]; });
      const gk = acc(.55, .9); gunM = X.chain(U, X.T(.75, -.2, Math.max(.05, 1.1 * (1 - gk)) + .05), X.rz(.5 + gk * .8), X.rx(1.5 * gk));   // minigun terjatuh dari tangan
    }
    B[0] = pel; B[1] = tor; B[2] = head; B[7] = legs[0][0]; B[8] = legs[0][1]; B[9] = legs[1][0]; B[10] = legs[1][1]; B[11] = gunM;
    for (let i = 0; i < 12; i++) X.write(B[i], out, i * 16);
    return out;
  };

  /* ============================================================
     KENDARAAN — tulang: 0 lambung, 1 kubah, 2 laras, 3 rotor utama, 4 rotor ekor/radar
     ============================================================ */
  MD.VPAL = {
    B: { body: [92, 106, 70], dark: [62, 70, 50], camo: 1 }, US: { body: [160, 146, 112], dark: [116, 104, 80], camo: 2 }, R: { body: [96, 98, 88], dark: [62, 64, 58], camo: 3 },
    BURNT: { body: [28, 26, 24], dark: [18, 18, 18], camo: 0 }
  };
  const DK = [34, 35, 36], TRK = [40, 38, 36], GLS = [40, 56, 70];
  function tracks(m, L, W2, H, y) {   // rantai + roda jalan
    m.set(TRK, .2, K.TRACK, 0); m.ext([[-L, .1], [-L - .35, .55], [-L - .1, .85], [L + .1, .85], [L + .45, .55], [L, .1]], y - .3, y + .3);
    m.set(DK, .3, K.METAL); for (let i = 0; i < 7; i++) { const x = -L + .2 + i * (2 * L - .4) / 6; m.cyl([x, y - .32, .42], [x, y + .32, .42], .33, .33, 10); }
    m.cyl([L + .2, y - .3, .58], [L + .2, y + .3, .58], .25, .25, 8); m.cyl([-L - .1, y - .3, .58], [-L - .1, y + .3, .58], .25, .25, 8);
  }
  MD.LEVI = { tur: 5.5 };   // poros kubah utama LEVIATHAN (x)
  MD.ZEUS = { tur: -1 }; MD.TITAN = { pv: [-9.6, 0, 2.6] }; MD.KRAKEN = { rot: 9.5 };   // poros kubah ZEUS · engsel peluncur TITAN · jarak poros rotor tandem KRAKEN
  // bos penyerbu & pertahanan markas: tur = poros kubah (x), gp = poros laras/peluncur, el = elevasi tetap; WYV: poros rotor (x, ±y, z)
  MD.BEH = { tur: -2, gp: [1.6, 0, 5.6], el: .18 }; MD.TEM = { tur: -4, gp: [-6.6, 0, 2.75], el: .42 }; MD.WYV = { S: 1.4, rx: .56, ry: 10.64, rz: 8.96, pz: 5.25 };   // WYV: skala model, poros rotor (x, ±y, z), poros miring nasel z
  MD.CAE = { tur: 0, gp: [.3, 0, 2.05], el: .55 }; MD.MGN = { tur: 0, gp: [.25, 0, 1.0], el: 0 };
  MD.RIG = { BEHEMOTH: MD.BEH, TEMPEST: MD.TEM, CAESAR: MD.CAE, MGN: MD.MGN };   // dipakai fps-gl untuk tulang kubah/laras
  const SC = (x, y, z) => ({ c: [[x, 0, 0], [0, y, 0], [0, 0, z]], t: [0, 0, 0] });
  /* kendaraan operator (fps-veh): tur = poros kubah (x), gp = poros laras, mz = jarak moncong dari poros laras, eye = mata penembak/pilot,
     L/W = setengah panjang/lebar badan (tabrakan); MBT: co = moncong SMB atas, rk = rak rudal; VTOL: noz = engsel nosel, gz = engsel roda, gear = tinggi roda */
  /* pintu / palka / kanopi yang bisa dibuka (animasi naik kendaraan, fps-life): tulang b, engsel h, sumbu ax, sudut buka penuh a; tur = ikut kubah */
  MD.DOOR = { HMV: { b: 5, h: [.79, 1.03, 1.2], ax: 'z', a: -1.2 }, APC: { b: 5, h: [-3.11, -.55, 1.3], ax: 'z', a: 1.45 }, MBT: { b: 5, h: [-1.12, .7, 3.1], ax: 'y', a: 1.9, tur: 1 },
    VTOL: { b: 6, h: [2.84, 0, .92], ax: 'y', a: 1.0, lb: 7, lh: [4.02, 1.0, .82] }, AH64: { b: 6, h: [3.6, .36, 1.16], ax: (() => { const d = [3.6 - 2.6, .36 - .403, 1.16 - 1.303], l = Math.hypot(...d); return d.map(v => v / l); })(), a: 1.2, lb: 7, lh: [3.1, .88, -.3] } };   // pintu sayap camar: engsel di tepi atas, membuka ke atas-luar
  MD.WHEEL = { HMV: [[6, 1.55, .94, .47], [7, 1.55, -.94, .47]], JEEP: [[6, 1.35, .9, .4], [7, 1.35, -.9, .4]], APC: [[6, 1.95, 1.16, .55], [7, 1.95, -1.16, .55]] };   // roda depan berbelok: [tulang, poros x, y, z]
  MD.VEHX = {
    HMV: { tur: -.35, gp: [-.2, 0, 2.48], mz: 1.36, eye: [-.95, 0, 2.98], L: 2.5, W: 1.15 },
    APC: { tur: -.6, gp: [-.45, 0, 2.66], mz: .9, eye: [-1, 0, 3.1], L: 3.15, W: 1.32 },
    MBT: { tur: -.45, gp: [1.55, 0, 2.45], mz: 6.2, co: [2.45, .41, 3.12], eye: [.2, -.85, 3.3], rk: [-.45, -1.25, 3.6], L: 3.95, W: 1.9 },
    VTOL: { noz: [-7.9, 0, -.05], gz: -.6, gear: 2.33, gun: [5.3, .78, .32], eye: [4.5, 0, 1.2], agm: [-.4, 3.4, -.78], aam: [-1.8, 6.1, -.05], bomb: [-1, 2.2, -.82], L: 9.6, W: 6.4 }
  };
  MD.vehicle = function (type, palK) {
    const p = MD.VPAL[palK], m = new Mesh(), b = p.body, d = p.dark, cam = p.camo;
    const paint = (c, s) => m.set(c, s || .15, K.PAINT, cam), BU = palK === 'BURNT', cc = c => BU ? [30, 28, 26] : c;
    if (type === 'HMV') {   // HUMVEE M1151 lapis baja (foto pengguna): cat pasir polos, kap + gril bersirip, kabin 4 pintu berpanel, snorkel kanan, kubah dengan perisai O-GPK + SMB M2 .50
      const VX = MD.VEHX.HMV, g = VX.gp, tx = VX.tur, TAN = cc([194, 172, 128]), TD = cc([152, 134, 100]), RB = [26, 26, 26], GL = BU ? DK : GLS;
      const tan = sp => m.set(TAN, sp || .22, K.PAINT, 0), td = () => m.set(TD, .25, K.PAINT, 0);
      m.bone(0);
      for (const x of [1.55, -1.5]) for (const sd of [-1, 1]) { m.bone(x > 0 ? (sd > 0 ? 6 : 7) : 0); m.set(RB, .12, K.PLAIN).cyl([x, sd * .76, .47], [x, sd * 1.12, .47], .47, .47, 16); td(); m.cyl([x, sd * 1.12, .47], [x, sd * 1.14, .47], .26, .26, 10); m.set([60, 60, 58], .4, K.METAL).cyl([x, sd * 1.14, .47], [x, sd * 1.17, .47], .09, .09, 6); } m.bone(0);
      m.set([46, 44, 40], .2, K.METAL).box([0, 0, .64], [2.2, .7, .14]);   // sasis
      // badan: bak + kabin belakang & kap mesin pejal; KABIN DEPAN BERONGGA (pintu pengemudi dibuka → tampak kursi, dasbor, setir — dulu badan satu balok pejal, isi kosong)
      tan(); m.ext([[-2.42, .72], [-2.45, 1.62], [-.95, 1.66], [-.9, 2.0], [0, 2.0], [0, .72]], -1.02, 1.02);
      m.ext([[.95, .72], [.95, 1.38], [2.28, 1.28], [2.46, 1.08], [2.46, .72]], -1.02, 1.02);
      m.box([.365, 0, 1.985], [.375, 1.02, .015]);                                   // atap kabin depan
      m.box([.475, 0, .82], [.475, 1.0, .1]);                                        // lantai
      m.ext([[0, .72], [0, 2.0], [.72, 2.0], [.95, 1.38], [.95, .72]], -1.02, -.98);  // dinding kanan (penumpang, pintu tertutup)
      m.box([.475, 1.0, .81], [.475, .02, .09]);                                     // ambang bawah pintu pengemudi
      m.ext([[.79, .9], [.79, 1.81], [.95, 1.38], [.95, .9]], .98, 1.02);            // pilar depan sisi pengemudi
      m.box([.395, 1.0, 1.975], [.395, .02, .025]);                                  // tepi atap di atas pintu
      for (const y of [0, .935, -.935]) { m.push(X.chain(X.T(.85, y, 1.69), X.ry(.36))); m.box([0, 0, 0], [.034, y ? .045 : .05, .33]); m.pop(); }   // rangka kaca depan (tiang tengah & tepi)
      // interior: karpet karet, punuk transmisi + konsol, 2 kursi, dasbor berinstrumen, setir, tuas, radio
      m.set([34, 33, 30], .05, K.PLAIN).box([.47, 0, .925], [.43, .97, .005]);
      m.set(cc([150, 132, 98]), .2, K.PAINT, 0).box([.38, 0, 1.06], [.34, .2, .14]);
      m.set([46, 44, 40], .2, K.PLAIN).box([.5, 0, 1.22], [.14, .12, .03]).box([.62, 0, 1.3], [.06, .15, .1]);   // konsol & tumpukan radio
      m.set([90, 200, 120], 0, K.EMIT).box([.555, .05, 1.33], [.002, .03, .012]);
      for (const sd of [-1, 1]) {
        m.set([54, 52, 45], .08, K.PLAIN).box([.3, sd * .56, 1.13], [.2, .22, .06]);
        m.push(X.chain(X.T(.07, sd * .56, 1.47), X.ry(.2))); m.box([0, 0, 0], [.05, .21, .3]); m.box([0, 0, .36], [.04, .12, .07]); m.pop();   // sandaran + sandaran kepala
        m.set(DK, .3, K.METAL).box([.3, sd * .56, 1.0], [.16, .18, .07]);   // rangka kursi
      }
      m.set([40, 38, 35], .15, K.PLAIN).box([.8, 0, 1.4], [.1, .98, .1]).box([.73, 0, 1.47], [.06, .98, .03]);   // dasbor + bantalan atas
      m.set([220, 170, 60], 0, K.EMIT).box([.668, .52, 1.43], [.002, .1, .035]); m.set([80, 210, 120], 0, K.EMIT).box([.668, .7, 1.43], [.002, .04, .03]);   // panel instrumen menyala
      m.set(DK, .4, K.METAL).cyl([.72, .56, 1.38], [.6, .56, 1.5], .025, .025, 6);   // tiang kemudi
      m.push(X.chain(X.T(.59, .56, 1.51), X.ry(-.75)));   // setir (bidang roda tegak lurus tiang)
      for (let i = 0; i < 12; i++) { const a0 = i / 12 * 6.2832, a1 = (i + 1) / 12 * 6.2832; m.cyl([0, Math.cos(a0) * .18, Math.sin(a0) * .18], [0, Math.cos(a1) * .18, Math.sin(a1) * .18], .016, .016, 5); }
      for (const a0 of [0, 2.1, 4.2]) m.cyl([0, 0, 0], [0, Math.cos(a0) * .17, Math.sin(a0) * .17], .012, .012, 4);
      m.cyl([-.02, 0, 0], [.03, 0, 0], .045, .045, 8); m.pop();
      m.cyl([.42, .18, 1.1], [.46, .2, 1.32], .012, .012, 4); m.box([.46, .2, 1.34], [.02, .02, .025]);   // tuas transmisi
      tan();
      for (const x of [1.55, -1.5]) for (const sd of [-1, 1]) tan().box([x, sd * 1.06, 1.02], [.6, .08, .07]);   // spatbor
      m.set([58, 54, 46], .2, K.PLAIN).box([2.47, 0, .97], [.02, .5, .2]); tan(); for (let i = -4; i <= 4; i++) m.box([2.485, i * .105, .97], [.012, .026, .19]);   // gril bersirip
      td(); m.box([1.72, 0, 1.33], [.36, .46, .02]);   // ventilasi kap
      m.set([240, 236, 214], .6, K.EMIT, 0); for (const sd of [-1, 1]) m.cyl([2.45, sd * .76, 1.0], [2.49, sd * .76, 1.0], .1, .1, 10);
      m.set(cc([70, 66, 58]), .3, K.METAL).box([2.56, 0, .74], [.07, 1.0, .09]); for (const sd of [-1, 1]) m.box([2.64, sd * .5, .74], [.04, .05, .07]);   // bemper + kait derek
      m.set(GL, .9, K.GLASS); for (const sd of [-1, 1]) { m.push(X.chain(X.T(.85, sd * .47, 1.69), X.ry(.36))); m.box([0, 0, 0], [.03, .42, .29]); m.pop(); }   // kaca depan 2 panel
      for (const sd of [-1, 1]) for (const x of [.4, -.47]) {   // 4 pintu lapis baja + jendela tebal
        const dr = sd > 0 && x > 0; if (dr) m.bone(5);   // pintu pengemudi: berengsel di tepi depan (animasi naik)
        td(); m.box([x, sd * (dr ? 1.045 : 1.03), 1.22], [.39, dr ? .03 : .012, .34]); m.box([x + (dr ? -.27 : .27), sd * (dr ? 1.08 : 1.045), 1.38], [.06, .012, .02]);
        m.set(GL, .9, K.GLASS).box([x, sd * (dr ? 1.05 : 1.026), 1.78], [.3, .022, .17]); if (dr) { td(); m.box([x, sd * 1.045, 1.6], [.39, .03, .04]).box([x - .37, sd * 1.045, 1.78], [.03, .03, .17]).box([x + .345, sd * 1.045, 1.78], [.045, .03, .17]).box([x, sd * 1.045, 1.955], [.39, .03, .02]); m.bone(0); }
      }
      m.set(DK, .3, K.METAL); for (const sd of [-1, 1]) { m.cyl([.74, sd * 1.02, 1.62], [.76, sd * 1.2, 1.72], .02, .02, 4); m.box([.76, sd * 1.24, 1.74], [.04, .09, .13]); }   // spion
      td(); m.cyl([.97, -1.09, 1.08], [.86, -1.09, 2.16], .085, .085, 8); m.box([.86, -1.09, 2.2], [.13, .1, .06]);   // snorkel
      m.set([210, 40, 30], 0, K.EMIT, 0); for (const sd of [-1, 1]) m.box([-2.46, sd * .86, 1.36], [.02, .06, .08]);
      td(); m.box([-.1, 0, 2.01], [.72, .9, .012]); m.box([-1.7, 0, 1.65], [.7, .92, .012]);   // garis atap & tutup bak
      m.bone(1);   // kubah: cincin + perisai O-GPK
      m.set(TD, .3, K.METAL).cyl([tx, 0, 2.0], [tx, 0, 2.13], .74, .74, 18);
      tan(); m.box([tx + .62, 0, 2.52], [.045, .52, .38]); m.set(GL, .9, K.GLASS).box([tx + .668, 0, 2.66], [.012, .2, .09]);
      for (const sd of [-1, 1]) { tan(); m.push(X.chain(X.T(tx + .36, sd * .66, 2.48), X.rz(sd * .55))); m.box([0, 0, 0], [.3, .035, .34]); m.pop(); m.set(GL, .9, K.GLASS); m.push(X.chain(X.T(tx + .38, sd * .7, 2.68), X.rz(sd * .55))); m.box([0, 0, 0], [.14, .03, .08]); m.pop(); }
      m.set(DK, .35, K.METAL).cyl([g[0], 0, 2.13], [g[0], 0, g[2] - .08], .045, .045, 6); m.set(cc([84, 92, 64]), .3, K.PAINT, 0).box([g[0] - .05, .3, 2.34], [.16, .07, .1]);   // dudukan + kotak amunisi
      m.bone(2);   // SMB M2 .50
      m.set([36, 36, 34], .45, K.METAL).box([g[0] - .1, 0, g[2]], [.32, .085, .09]); m.cyl([g[0] + .2, 0, g[2]], [g[0] + .52, 0, g[2]], .055, .055, 8).cyl([g[0] + .52, 0, g[2]], [g[0] + 1.25, 0, g[2]], .03, .03, 8).cyl([g[0] + 1.25, 0, g[2]], [g[0] + 1.36, 0, g[2]], .045, .045, 8);
      for (const sd of [-1, 1]) m.cyl([g[0] - .42, sd * .07, g[2]], [g[0] - .52, sd * .07, g[2] - .12], .02, .02, 4);
    } else if (type === 'APC') {   // panser amfibi 6×6: lambung lunas perahu bersudut, papan pemecah gelombang, 2 pendorong air, kubah RCWS + pelontar granat Mk19 40 mm
      const VX = MD.VEHX.APC, g = VX.gp, tx = VX.tur, GL = BU ? DK : GLS;
      m.bone(0);
      for (const x of [1.95, -.45, -1.9]) for (const sd of [-1, 1]) { m.bone(x > 1 ? (sd > 0 ? 6 : 7) : 0); m.set([24, 24, 24], .1, K.PLAIN).cyl([x, sd * .98, .55], [x, sd * 1.34, .55], .55, .55, 14); m.set([60, 60, 58], .3, K.METAL).cyl([x, sd * 1.34, .55], [x, sd * 1.36, .55], .28, .28, 8); } m.bone(0);
      paint(b); m.ext([[-3.02, .62], [-3.1, 2.08], [1.25, 2.18], [2.75, 1.6], [3.15, 1.05], [2.72, .55], [-2.6, .5]], -1.2, 1.2);
      paint(b); m.box([-.9, 0, 2.24], [2.05, .98, .07]);   // atap
      for (const sd of [-1, 1]) { paint(d); m.box([0, sd * 1.22, 1.15], [2.9, .03, .07]); }   // garis lunas
      paint(d); m.push(X.chain(X.T(3.0, 0, 1.4), X.ry(.85))); m.box([0, 0, 0], [.04, 1.12, .42]); m.pop();   // papan pemecah gelombang
      m.set(GL, .9, K.GLASS); for (const sd of [-1, 1]) { m.push(X.chain(X.T(2.0, sd * .5, 1.92), X.ry(.37))); m.box([0, 0, 0], [.02, .3, .1]); m.pop(); }   // blok penglihatan pengemudi
      m.set([240, 236, 214], .6, K.EMIT, 0); for (const sd of [-1, 1]) m.box([3.0, sd * .9, 1.32], [.03, .1, .06]);
      m.set([210, 40, 30], 0, K.EMIT, 0); for (const sd of [-1, 1]) m.box([-3.1, sd * .95, 1.8], [.02, .06, .08]);
      m.set(DK, .35, K.METAL); for (const sd of [-1, 1]) { m.cyl([-3.06, sd * .7, .85], [-3.28, sd * .7, .85], .22, .2, 10); for (let i = 0; i < 3; i++) m.cyl([1.15, sd * (1.05 + i * .02), 2.0 + i * .1], [1.4, sd * (1.18 + i * .02), 2.08 + i * .1], .055, .055, 6); }   // pendorong air, pelontar asap
      m.bone(5); paint(d); m.box([-3.14, 0, 1.3], [.05, .55, .55]); m.set(DK, .35, K.METAL).box([-3.2, .38, 1.3], [.03, .03, .1]).box([-3.17, -.5, .95], [.03, .05, .12]).box([-3.17, -.5, 1.65], [.03, .05, .12]); m.bone(0);   // pintu belakang berengsel (animasi naik)
      paint(d); m.box([.4, -.45, 2.32], [.32, .32, .05]); m.box([-1.6, .45, 2.32], [.35, .35, .05]);   // pintu belakang, palka
      m.bone(1);   // RCWS
      paint(d); m.box([tx, 0, 2.38], [.5, .45, .13]); m.set(DK, .35, K.METAL).box([tx + .05, .5, 2.68], [.2, .11, .14]); m.set(BU ? DK : [20, 30, 40], .95, K.GLASS).box([tx + .26, .5, 2.7], [.01, .07, .07]);
      m.bone(2);   // pelontar granat Mk19
      m.set([36, 38, 34], .45, K.METAL).box([g[0] - .08, 0, g[2]], [.3, .13, .12]); m.cyl([g[0] + .2, 0, g[2]], [g[0] + .45, 0, g[2]], .065, .065, 8).cyl([g[0] + .45, 0, g[2]], [g[0] + .9, 0, g[2]], .045, .045, 8);
      m.set(cc([84, 92, 64]), .3, K.PAINT, 0).box([g[0] - .12, -.24, g[2] - .02], [.18, .1, .13]);
    } else if (type === 'MBT') {   // MBT "BADAI" (foto pengguna): kubah besar bersudut, meriam panjang + rem moncong, SMB laras kembar di atap kubah, rak rudal berujung kuning, sisir penggaruk di depan, loreng abu-hijau
      const VX = MD.VEHX.MBT, g = VX.gp, L = 3.8, Wd = 1.85, C1 = cc([112, 118, 104]), C2 = cc([74, 80, 72]);
      const cm = c => m.set(c, .2, K.PAINT, BU ? 0 : 3);
      m.bone(0); tracks(m, L, Wd, 1, Wd - .3); tracks(m, L, Wd, 1, -Wd + .3);
      cm(C1); m.ext([[-L - .15, .6], [-L - .25, 1.62], [L - 1.2, 1.78], [L + .55, 1.22], [L + .45, .62]], -Wd + .6, Wd - .6);
      for (const sd of [-1, 1]) { cm(C1); m.box([.1, sd * (Wd - .18), 1.22], [L + .1, .06, .36]); cm(C2); for (let i = 0; i < 6; i++) m.box([-L + .6 + i * 1.32, sd * (Wd - .11), 1.22], [.02, .01, .34]); }   // rok samping bersegmen
      m.set(DK, .35, K.METAL).box([L + .78, 0, .8], [.08, Wd - .15, .1]); for (const sd of [-1, 1]) m.cyl([L + .2, sd * (Wd - .55), 1.0], [L + .78, sd * (Wd - .55), .8], .07, .07, 6);
      for (let i = 0; i <= 10; i++) { const y = -Wd + .3 + i * (2 * Wd - .6) / 10; m.push(X.chain(X.T(L + 1.05, y, .62), X.ry(-.4))); m.box([0, 0, 0], [.3, .045, .045]); m.pop(); }   // sisir penggaruk ranjau
      m.set([240, 236, 214], .6, K.EMIT, 0); for (const sd of [-1, 1]) m.box([L + .5, sd * (Wd - .7), 1.3], [.03, .1, .06]);
      cm(C2); m.box([-L - .2, 0, 1.4], [.1, 1.0, .25]);
      m.bone(1);   // kubah bersudut
      cm(C1); m.ext([[-2.55, 1.82], [-2.75, 2.35], [-2.35, 2.92], [1.15, 2.97], [1.95, 2.55], [1.8, 1.82]], -1.55, 1.55);
      for (const sd of [-1, 1]) { cm(C2); m.box([-1.1, sd * 1.6, 2.4], [1.2, .06, .4]); m.set(DK, .35, K.METAL); for (let i = 0; i < 3; i++) m.cyl([1.35, sd * (1.05 + i * .12), 2.6], [1.6, sd * (1.15 + i * .12), 2.75], .06, .06, 6); }   // keranjang samping, pelontar asap
      m.set(DK, .35, K.METAL).cyl([-.8, .7, 2.95], [-.8, .7, 3.04], .34, .33, 12); m.set([10, 10, 10], 0, K.PLAIN).cyl([-.8, .7, 3.04], [-.8, .7, 3.045], .27, .27, 12);   // cincin palka komandan + lubang gelap
      m.bone(5).set(DK, .35, K.METAL).cyl([-.8, .7, 3.05], [-.8, .7, 3.13], .33, .31, 12).box([-.5, .7, 3.16], [.05, .1, .03]); m.bone(1);   // tutup palka (engsel di belakang, animasi naik)
      m.set(DK, .35, K.METAL).cyl([-.9, -.65, 2.95], [-.9, -.65, 3.05], .28, .28, 12).cyl([-2.1, .9, 2.85], [-2.25, .9, 4.6], .015, .01, 3);   // palka komandan & pengisi, antena
      cm(C2); m.box([.15, .41, 3.06], [.38, .24, .12]);   // dudukan SMB atap
      m.set(DK, .35, K.METAL).cyl([VX.rk[0] - .1, VX.rk[1], 2.95], [VX.rk[0] - .1, VX.rk[1], 3.4], .08, .08, 6);   // tiang rak rudal
      cm(C2); m.box(VX.rk, [.8, .34, .27]);
      for (const yy of [-.17, .17]) for (const zz of [-.12, .12]) {   // rudal antitank berujung kuning
        const y = VX.rk[1] + yy, z = VX.rk[2] + zz; m.set(cc([86, 94, 74]), .3, K.PAINT, 0).cyl([VX.rk[0] - .85, y, z], [VX.rk[0] + .8, y, z], .085, .085, 8);
        m.set(cc([235, 196, 40]), .4, K.PAINT, 0).cyl([VX.rk[0] + .8, y, z], [VX.rk[0] + 1.02, y, z], .085, .02, 8);
      }
      m.bone(2);   // meriam 120 mm + SMB laras kembar
      cm(C1); m.box([g[0] + .05, 0, g[2]], [.32, .52, .33]);
      m.set(cc([64, 68, 60]), .35, K.METAL).cyl([g[0] + .35, 0, g[2]], [g[0] + 5.5, 0, g[2]], .15, .125, 12).cyl([g[0] + 2.5, 0, g[2]], [g[0] + 3.2, 0, g[2]], .2, .2, 12).cyl([g[0] + 5.45, 0, g[2]], [g[0] + 6.2, 0, g[2]], .24, .24, 12);
      m.set([16, 16, 16], .1, K.PLAIN); for (const sd of [-1, 1]) for (const x of [5.7, 5.95]) m.box([g[0] + x, sd * .24, g[2]], [.07, .012, .14]);   // celah rem moncong
      m.set(cc([50, 52, 48]), .4, K.METAL); for (const yy of [.32, .5]) m.cyl([.35, yy, 3.12], [VX.co[0], yy, 3.12], .05, .045, 6);
      m.cyl([.3, .41, 3.12], [.9, .41, 3.12], .1, .1, 8);
    } else if (type === 'JEEP') {   // jip patroli 4×4 terbuka + senapan mesin di rol bar (poros kubah x = −0,75)
      m.bone(0); m.set([24, 24, 24], .1, K.PLAIN);
      for (const x of [-1.3, 1.35]) for (const sd of [-1, 1]) { m.bone(x > 0 ? (sd > 0 ? 6 : 7) : 0); m.cyl([x, sd * .78, .4], [x, sd * 1.02, .4], .4, .4, 12); m.set([70, 70, 66], .3, K.METAL).cyl([x, sd * 1.02, .4], [x, sd * 1.04, .4], .2, .2, 8); m.set([24, 24, 24], .1, K.PLAIN); } m.bone(0);
      paint(b); m.ext([[-2.0, .55], [-2.05, 1.3], [.5, 1.3], [.75, 1.15], [2.05, 1.05], [2.15, .55]], -.92, .92);
      paint(d); for (const sd of [-1, 1]) m.box([1.35, sd * .95, .82], [.55, .06, .1]).box([-1.3, sd * .95, .82], [.55, .06, .1]);   // spatbor
      m.set(DK, .3, K.METAL).box([2.22, 0, .72], [.06, .88, .12]);
      m.set([200, 180, 120], .5, K.EMIT, 0).box([2.16, .62, .98], [.03, .1, .06]).box([2.16, -.62, .98], [.03, .1, .06]);
      m.set(DK, .3, K.METAL).box([.62, 0, 1.6], [.03, .88, .3]); m.set(GLS, .9, K.GLASS).box([.645, 0, 1.6], [.02, .78, .24]);
      m.set([40, 42, 38], .1, K.CLOTH).box([-.05, .45, 1.42], [.28, .3, .13]).box([-.05, -.45, 1.42], [.28, .3, .13]);
      m.set(DK, .3, K.METAL); for (const sd of [-1, 1]) m.cyl([-.75, sd * .85, 1.3], [-.75, sd * .8, 2.15], .04, .04, 6); m.cyl([-.75, -.8, 2.15], [-.75, .8, 2.15], .04, .04, 6);
      m.set([24, 24, 24], .1, K.PLAIN).cyl([-2.08, 0, 1.0], [-2.24, 0, 1.0], .38, .38, 12);   // ban cadangan
      m.bone(1); m.set(DK, .3, K.METAL).cyl([-.75, 0, 2.15], [-.75, 0, 2.42], .05, .05, 6).box([-.72, 0, 2.47], [.2, .09, .08]); paint(d); m.box([-.5, 0, 2.55], [.03, .26, .15]);
      m.bone(2).set(DK, .35, K.METAL).cyl([-.6, 0, 2.49], [.4, 0, 2.49], .025, .022, 6); m.box([-.72, .12, 2.42], [.07, .05, .06]);
    } else if (type === 'ULTIMA') {   // Tank Ultima: lambung & kubah raksasa, rok/mantel tungsten, dua meriam 140 mm, kotak ATGM, SMB hanud
      const s = 1.45, L = 3.3 * s, Wd = 1.65 * s, TG = [74, 78, 84];
      m.bone(0); tracks(m, L, Wd, 1, Wd - .25); tracks(m, L, Wd, 1, -Wd + .25);
      paint(b); m.ext([[-L - .2, .55], [-L - .3, 1.75], [L - 1.2, 1.95], [L + .7, 1.3], [L + .6, .55]], -Wd + .55, Wd - .55);
      m.set(TG, .6, K.METAL); m.box([0, Wd - .1, 1.25], [L + .3, .2, .5]).box([0, -Wd + .1, 1.25], [L + .3, .2, .5]);
      for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) m.box([-L + .8 + i * (2 * L - 1.6) / 5, sd * (Wd + .12), 1.3], [.38, .05, .34]);   // ubin tungsten
      m.box([L + .62, 0, 1.05], [.14, Wd - .6, .38]);   // pelat bajak depan
      m.set([200, 180, 120], .5, K.EMIT, 0).box([L + .78, Wd - .7, 1.35], [.03, .1, .06]).box([L + .78, -Wd + .7, 1.35], [.03, .1, .06]);
      paint(d); m.box([-L - .25, 0, 1.6], [.15, 1.3, .3]);
      m.bone(1);
      paint(b); m.ext([[-2.9, 1.95], [-3.1, 2.55], [-2.5, 3.15], [1.9, 3.15], [2.8, 2.6], [2.5, 1.95]], -1.9, 1.9);
      m.set(TG, .6, K.METAL).box([2.35, 0, 2.55], [.4, 1.7, .55]); for (const sd of [-1, 1]) m.box([-.4, sd * 1.95, 2.55], [2.2, .1, .45]);
      m.set(DK, .3, K.METAL).box([-.9, .9, 3.35], [.45, .35, .2]); m.set([36, 36, 34], .3, K.METAL).box([-.4, -1.15, 3.42], [.6, .35, .25]);
      m.set([170, 40, 30], .2, K.PLAIN).box([.21, -1.06, 3.42], [.01, .1, .1]).box([.21, -1.26, 3.42], [.01, .1, .1]);   // tutup tabung ATGM
      m.set(DK, .3, K.METAL).cyl([-1.3, 0, 3.15], [-1.3, 0, 3.6], .05, .05, 6).cyl([-1.3, 0, 3.6], [-.6, 0, 3.64], .03, .03, 5).cyl([-2.6, 1.2, 3.1], [-2.7, 1.2, 4.9], .015, .01, 3);
      m.bone(2).set(DK, .35, K.METAL);
      for (const sd of [-.42, .42]) { m.cyl([2.7, sd, 2.6], [8.4, sd, 2.6], .16, .13, 10); m.cyl([5.4, sd, 2.6], [6.3, sd, 2.6], .22, .22, 10); m.cyl([8.2, sd, 2.6], [8.65, sd, 2.6], .2, .2, 10); }
    } else if (type === 'LEVIATHAN' || type === 'LEVI') {   // benteng darat ±25 m: 4 unit rantai, lambung lapis tungsten, kubah kapal 2×280 mm (tulang 1/2), menara komando + radar (tulang 4), meriam lambung, flak
      const L = 12, Wd = 6.5, TG = [64, 66, 72], RL = [255, 50, 36], T0 = MD.LEVI.tur;
      m.bone(0);
      for (const y of [-Wd + .9, -Wd + 2.7, Wd - .9, Wd - 2.7]) { m.push(X.chain(X.T(0, y, 0), SC(3.2, 1.8, 2.2))); tracks(m, 3.4, 1, 1, 0); m.pop(); }
      paint(b); m.ext([[-L - .4, 1.5], [-L - .7, 5.2], [L - 3, 5.8], [L + 1.3, 3.6], [L + 1.1, 1.5]], -Wd + .5, Wd - .5);
      m.set(TG, .6, K.METAL); for (const sd of [-1, 1]) { m.box([0, sd * (Wd - .15), 3.2], [L + .6, .3, 1.5]); for (let i = 0; i < 9; i++) m.box([-L + 1.3 + i * (2 * L - 2.6) / 8, sd * (Wd + .2), 3.3], [1.1, .08, 1.1]); }
      m.box([L + 1.45, 0, 2.5], [.3, Wd - .9, 1.1]);   // bajak depan
      paint(d); m.box([0, 0, 5.85], [L - 3.2, Wd - 1.2, .08]);   // dek
      // menara komando (poros radar di x −0,7) + jendela anjungan + lampu bahaya
      paint(b); m.box([-.7, 0, 8.1], [2.4, 2.2, 2.3]); m.box([-.7, 0, 10.6], [1.6, 1.5, .25]);
      m.set(GLS, .95, K.GLASS).box([1.72, 0, 9.4], [.03, 1.9, .35]); m.box([-.7, 2.22, 9.4], [2, .03, .3]); m.box([-.7, -2.22, 9.4], [2, .03, .3]);
      m.set(DK, .3, K.METAL).cyl([-.7, 0, 10.8], [-.7, 0, 11.6], .12, .1, 6).cyl([-2.4, 1.6, 10.4], [-2.5, 1.6, 14], .03, .02, 3).cyl([-2.4, -1.6, 10.4], [-2.5, -1.6, 13], .03, .02, 3);
      m.set(RL, 0, K.EMIT).box([-2.5, 1.6, 14.05], [.08, .08, .08]).box([-2.5, -1.6, 13.05], [.08, .08, .08]); for (const sd of [-1, 1]) m.box([L + 1.2, sd * (Wd - 1.2), 3.75], [.05, .2, .12]).box([-L - .75, sd * (Wd - 1.2), 4.9], [.05, .2, .12]);
      // cerobong mesin & flak buritan
      m.set([40, 40, 40], .3, K.METAL); for (const sd of [-1, 1]) { m.cyl([-L + 1.2, sd * 4.6, 5.4], [-L + 1.2, sd * 4.6, 8.4], .55, .5, 10); m.set([20, 20, 20], 0, K.PLAIN).cyl([-L + 1.2, sd * 4.6, 8.4], [-L + 1.2, sd * 4.6, 8.42], .46, .46, 10); m.set([40, 40, 40], .3, K.METAL); }
      for (const sd of [-1, 1]) { paint(d); m.box([-L + 3.2, sd * 2.2, 6.3], [.8, .8, .45]); m.set(DK, .35, K.METAL); for (const o of [-.22, .22]) for (const q of [-.22, .22]) m.cyl([-L + 3.2, sd * 2.2 + o, 6.6 + q], [-L + 4.6, sd * 2.2 + o, 8 + q], .05, .05, 5); }
      // meriam lambung 128 mm (sisi kiri & kanan, membidik ke luar)
      for (const sd of [-1, 1]) for (const x of [-6.5, 2.4]) { paint(b); m.box([x, sd * (Wd - 1.6), 6.4], [1.1, 1, .55]); m.set(DK, .35, K.METAL).cyl([x + .2, sd * (Wd - .7), 6.45], [x + .9, sd * (Wd + 3.4), 6.5], .13, .11, 8); }
      // kubah utama (tulang 1) + dua laras 280 mm (tulang 2)
      m.bone(1); paint(b); m.ext([[T0 - 3, 5.8], [T0 - 3.3, 7.2], [T0 - 2.4, 8.1], [T0 + 2.4, 8.1], [T0 + 3.3, 7.1], [T0 + 3, 5.8]], -3, 3);
      m.set(TG, .6, K.METAL).box([T0 + 3.1, 0, 7], [.3, 2.6, .9]); m.set(DK, .3, K.METAL).box([T0 - 1.5, 1.8, 8.35], [.6, .5, .25]).cyl([T0 - 2.2, -2.2, 8.1], [T0 - 2.2, -2.2, 9.6], .2, .2, 8);
      m.bone(2).set(DK, .4, K.METAL); for (const sd of [-1.05, 1.05]) { m.cyl([T0 + 3.2, sd, 7.05], [T0 + 17, sd, 7.05], .38, .3, 12); m.cyl([T0 + 3.2, sd, 7.05], [T0 + 5.4, sd, 7.05], .5, .46, 12); m.cyl([T0 + 16.6, sd, 7.05], [T0 + 17.3, sd, 7.05], .36, .36, 12); }
      // radar berputar di atas menara (tulang 4, poros x −0,7)
      m.bone(4).set([150, 152, 150], .4, K.METAL).box([-.7, 0, 12], [.15, 1.7, .55]); m.set(DK, .3, K.METAL).box([-.85, 0, 12], [.05, .3, .2]);
    } else if (type === 'ZEUS') {   // ZEUS ±22 m: 4 unit rantai, lambung baja gelap, kubah meriam rel (tulang 1, poros MD.ZEUS.tur) dengan 2 rel + kumparan biru menyala (tulang 2),
      // bank kapasitor & sirip radiator di buritan, laser hanud di atap kubah
      const L = 8, Wd = 4, T0 = MD.ZEUS.tur, GM = [46, 48, 54], PL = [62, 64, 70], AC = [90, 200, 255], RL = [255, 40, 30];
      m.bone(0);
      for (const y of [-Wd + .75, -Wd + 2.15, Wd - .75, Wd - 2.15]) { m.push(X.chain(X.T(0, y, 0), SC(2.4, 1.25, 1.7))); tracks(m, 3.4, 1, 1, 0); m.pop(); }
      m.set(GM, .4, K.METAL); m.ext([[-L - .3, 1.3], [-L - .5, 3.5], [L - 2.2, 3.9], [L + .9, 2.4], [L + .7, 1.3]], -Wd + .35, Wd - .35);
      m.set(PL, .5, K.METAL); for (const sd of [-1, 1]) { m.box([0, sd * (Wd + .05), 2.3], [L + .4, .14, .8]); for (let i = 0; i < 8; i++) m.box([-L + 1 + i * (2 * L - 2) / 7, sd * (Wd + .22), 2.4], [.85, .05, .6]); }
      m.box([L + 1.05, 0, 1.9], [.25, Wd - .6, .75]);   // bajak depan
      for (let i = 0; i < 6; i++) { const x = -L + .6 + i * .75; m.set([36, 36, 40], .5, K.METAL).cyl([x, -1.6, 3.6], [x, -1.6, 5.1], .32, .32, 10).cyl([x, 1.6, 3.6], [x, 1.6, 5.1], .32, .32, 10); m.set(AC, 0, K.EMIT).cyl([x, -1.6, 5.1], [x, -1.6, 5.16], .26, .26, 10).cyl([x, 1.6, 5.1], [x, 1.6, 5.16], .26, .26, 10); }   // bank kapasitor
      m.set([30, 30, 34], .3, K.METAL); for (let i = 0; i < 9; i++) m.box([-L + .4, -2.4 + i * .6, 3.6], [.06, .22, .7]);   // sirip radiator
      m.set(RL, 0, K.EMIT); for (const sd of [-1, 1]) m.box([L + .95, sd * (Wd - 1), 2.9], [.04, .25, .1]).box([-L - .55, sd * (Wd - 1), 3.2], [.04, .2, .1]);
      m.bone(1); m.set(GM, .4, K.METAL); m.ext([[T0 - 3.6, 3.9], [T0 - 3.9, 5.3], [T0 - 2.9, 6.3], [T0 + 2.5, 6.3], [T0 + 3.6, 5.3], [T0 + 3.4, 3.9]], -2.7, 2.7);
      m.set(PL, .5, K.METAL).box([T0 + 3.55, 0, 5.1], [.25, 2.2, .9]); for (const sd of [-1, 1]) m.box([T0, sd * 2.78, 5.1], [3, .1, .8]);
      m.set([30, 30, 34], .4, K.METAL).cyl([T0 - 1.6, 0, 6.3], [T0 - 1.6, 0, 6.8], .45, .45, 10).sph([T0 - 1.6, 0, 7.05], [.55, .55, .45], 10, 5);   // laser hanud
      m.set([255, 90, 60], 0, K.EMIT).cyl([T0 - 1.1, 0, 7.05], [T0 - .98, 0, 7.05], .18, .18, 8);
      m.set([30, 30, 34], .3, K.METAL).cyl([T0 + 1.4, 1.8, 6.3], [T0 + 1.4, 1.8, 7.4], .07, .06, 5).box([T0 + 1.4, 1.8, 7.5], [.25, .4, .18]); m.cyl([T0 - 2.8, -1.9, 6.3], [T0 - 2.9, -1.9, 9.5], .03, .02, 3);
      m.bone(2); m.set([34, 36, 40], .55, K.METAL);
      for (const sd of [-1, 1]) m.box([T0 + 10.5, sd * .5, 5.1], [7.3, .16, .42]);   // dua rel konduktor
      m.box([T0 + 10.5, 0, 5.62], [7.3, .62, .1]).box([T0 + 10.5, 0, 4.58], [7.3, .62, .1]);   // pelat penjepit atas-bawah
      for (let i = 0; i < 6; i++) { const x = T0 + 4.4 + i * 2.4; m.set(PL, .5, K.METAL).cyl([x - .18, 0, 5.1], [x + .18, 0, 5.1], .95, .95, 14); m.set(AC, 0, K.EMIT).cyl([x + .18, 0, 5.1], [x + .26, 0, 5.1], .8, .8, 14, { cap0: false }); }   // kumparan
      m.set([30, 30, 34], .5, K.METAL).box([T0 + 18, 0, 5.1], [.25, .75, .65]); m.set(AC, 0, K.EMIT).box([T0 + 18.27, 0, 5.1], [.02, .3, .16]);
    } else if (type === 'TITAN') {   // TITAN ±23 m: TEL 8 gandar, kabin terbelah kiri-kanan, tabung rudal raksasa di peluncur (tulang 2, poros MD.TITAN.pv) yang menegak sebelum meluncur, CIWS & ATGM
      const L = 11, Wd = 2, BD = [50, 54, 48], DKG = [36, 38, 36], CN = [70, 76, 66], RL = [255, 40, 30];
      m.bone(0); m.set([24, 24, 24], .1, K.PLAIN);
      for (const x of [9.2, 7.4, 4.6, 2.8, -2.6, -4.4, -7.2, -9]) for (const sd of [-1, 1]) { m.cyl([x, sd * (Wd - .55), .8], [x, sd * (Wd + .05), .8], .8, .8, 14); m.set([66, 66, 62], .3, K.METAL).cyl([x, sd * (Wd + .05), .8], [x, sd * (Wd + .08), .8], .42, .42, 8); m.set([24, 24, 24], .1, K.PLAIN); }
      m.set(BD, .25, K.PAINT, 0).box([0, 0, 1.75], [L, Wd - .15, .45]); m.set(DKG, .3, K.METAL).box([0, 0, 1.25], [L - .4, Wd - .7, .25]);
      for (const sd of [-1, 1]) {   // kabin kiri & kanan (moncong rudal di tengah)
        m.set(BD, .25, K.PAINT, 0).ext([[L - 2.6, 2.2], [L - 2.6, 4.2], [L - .4, 4.2], [L + .35, 3.2], [L + .4, 2.2]], sd > 0 ? 1.05 : -2.15, sd > 0 ? 2.15 : -1.05);
        m.set(GLS, .9, K.GLASS).box([L + .02, sd * 1.6, 3.55], [.3, .45, .4]); m.box([L - 1.5, sd * 2.16, 3.6], [.7, .02, .35]);
        m.set([200, 180, 120], .5, K.EMIT, 0).box([L + .42, sd * 1.7, 2.5], [.03, .15, .08]);
      }
      m.set(DKG, .3, K.METAL).box([-L + 1.2, 0, 2.7], [1.1, Wd - .2, .55]).box([-1, 0, 2.35], [1.5, 1.6, .2]);   // generator & dudukan peluncur
      for (const sd of [-1, 1]) { m.set(DKG, .4, K.METAL).cyl([-L + 1.2, sd * 1.4, 3.25], [-L + 1.2, sd * 1.4, 3.75], .35, .35, 8); m.set([28, 28, 30], .4, K.METAL); for (const o of [-.08, .08]) m.cyl([-L + 1.2, sd * 1.4 + o, 3.75], [-L + 2.6, sd * 1.4 + o, 3.85], .045, .045, 5); }   // CIWS
      m.set([60, 64, 56], .3, K.PAINT, 0).box([-L + 3, 1.55, 2.6], [.7, .3, .3]); m.set([170, 40, 30], .2, K.PLAIN).box([-L + 3.71, 1.55, 2.6], [.01, .2, .2]);   // kotak ATGM
      m.set(RL, 0, K.EMIT).box([-L - .02, 1.5, 2.1], [.04, .15, .1]).box([-L - .02, -1.5, 2.1], [.04, .15, .1]);
      m.bone(2); const P = MD.TITAN.pv;   // peluncur + tabung rudal (berputar di P)
      m.set(DKG, .4, K.METAL); for (const sd of [-1, 1]) m.box([0, sd * .75, 2.45], [L - 1.6, .12, .2]);
      m.set(CN, .3, K.PAINT, 0).cyl([P[0] + .3, 0, 3.4], [L - .2, 0, 3.4], .95, .95, 18);
      m.set([42, 44, 40], .4, K.METAL).cyl([P[0] + .1, 0, 3.4], [P[0] + .3, 0, 3.4], 1.02, 1.02, 18).cyl([L - .2, 0, 3.4], [L, 0, 3.4], 1.02, .9, 18);
      for (const x of [-6, -1, 4]) m.set([42, 44, 40], .4, K.METAL).cyl([x, 0, 3.4], [x + .25, 0, 3.4], 1.0, 1.0, 18);   // cincin penguat
      m.set([190, 36, 28], .2, K.PLAIN).cyl([L - 1.4, 0, 3.4], [L - 1.1, 0, 3.4], .97, .97, 18); m.set(RL, 0, K.EMIT).box([L + .02, 0, 3.4], [.02, .25, .25]);
    } else if (type === 'BEHEMOTH') {   // BEHEMOTH ±19 m: 4 unit rantai, lambung lapis tungsten, bilah dozer raksasa di depan, kasemat berputar (tulang 1, poros MD.BEH.tur)
      // dengan laras mortir roket 380 mm yang gemuk (tulang 2), SMB koaksial & SMB hanud di atap, cerobong mesin
      const L = 8, Wd = 4.2, T0 = MD.BEH.tur, G = MD.BEH.gp, TG = [64, 66, 72], YL = [150, 128, 60], RL = [255, 50, 36];
      m.bone(0);
      for (const y of [-Wd + .8, -Wd + 2.3, Wd - .8, Wd - 2.3]) { m.push(X.chain(X.T(0, y, 0), SC(2.4, 1.3, 1.7))); tracks(m, 3.4, 1, 1, 0); m.pop(); }
      paint(b); m.ext([[-L - .3, 1.3], [-L - .5, 3.7], [L - 2.4, 4.3], [L + .8, 2.7], [L + .6, 1.3]], -Wd + .4, Wd - .4);
      m.set(TG, .6, K.METAL); for (const sd of [-1, 1]) { m.box([0, sd * (Wd + .05), 2.4], [L + .4, .16, .9]); for (let i = 0; i < 8; i++) m.box([-L + 1 + i * (2 * L - 2) / 7, sd * (Wd + .24), 2.5], [.85, .06, .7]); }   // rok & ubin tungsten
      m.set([46, 46, 48], .5, K.METAL); m.push(X.T(L + 2.5, 0, 0)); m.ext([[-.1, 1.6], [-.3, 3.1], [.25, 2.9], [.45, 1.6], [.25, .4], [-.35, .2]], -Wd - .6, Wd + .6); m.pop();   // bilah dozer melengkung
      m.set(YL, .3, K.PAINT, 0); for (let i = -3; i <= 3; i++) m.box([L + 2.82, i * 1.3, 2.6], [.02, .32, .18]);   // garis peringatan kuning-hitam
      m.set(DK, .4, K.METAL); for (const sd of [-1, 1]) { m.cyl([L - 1.2, sd * (Wd - 1), 1.6], [L + 2.3, sd * (Wd - .6), 1.4], .28, .24, 8); m.cyl([L - .3, sd * (Wd - 2.4), 3.6], [L + 2.4, sd * (Wd - 2.4), 2.4], .16, .14, 6); }   // lengan pendorong + hidrolik
      m.set([40, 40, 40], .3, K.METAL); for (const sd of [-1, 1]) { m.cyl([-L + 1.4, sd * 2.6, 3.8], [-L + 1.4, sd * 2.6, 6.6], .5, .45, 10); m.set([16, 16, 16], 0, K.PLAIN).cyl([-L + 1.4, sd * 2.6, 6.6], [-L + 1.4, sd * 2.6, 6.62], .4, .4, 10); m.set([40, 40, 40], .3, K.METAL); }   // cerobong
      m.set(RL, 0, K.EMIT); for (const sd of [-1, 1]) m.box([L + .85, sd * (Wd - 1.1), 2.9], [.04, .22, .1]).box([-L - .55, sd * (Wd - 1), 3.2], [.04, .2, .1]);
      m.bone(1); paint(b); m.ext([[T0 - 3.8, 4.2], [T0 - 4, 6.1], [T0 - 3, 7.3], [T0 + 2.6, 7.3], [T0 + 3.9, 6.1], [T0 + 3.7, 4.2]], -3, 3);   // kasemat
      m.set(TG, .6, K.METAL).box([T0 + 3.85, 0, 5.6], [.3, 2.4, 1.2]); for (const sd of [-1, 1]) m.box([T0, sd * 3.08, 5.7], [3.4, .1, 1.1]);
      m.set(DK, .3, K.METAL).box([T0 - 1.6, 1.7, 7.55], [.7, .55, .25]).cyl([T0 - 2.6, -2, 7.3], [T0 - 2.7, -2, 10.5], .03, .02, 3);   // kubah komandan + antena
      m.set([30, 30, 32], .4, K.METAL).cyl([T0 + .6, -1.9, 7.3], [T0 + .6, -1.9, 7.9], .12, .1, 6); for (const o of [-.1, .1]) m.cyl([T0 + .6, -1.9 + o, 7.95], [T0 + 2.4, -1.9 + o, 8.05], .04, .04, 5);   // SMB hanud kembar
      m.cyl([T0 + 3.9, 1.6, 5.2], [T0 + 5.3, 1.6, 5.2], .07, .06, 6);   // SMB koaksial
      m.set(RL, 0, K.EMIT).box([T0 - 2.7, -2, 10.55], [.07, .07, .07]);
      m.set([70, 74, 66], .4, K.METAL); for (let r = 0; r < 3; r++) for (let c = -3; c <= 3; c++) m.box([T0 + 4.2, c * .68, 4.7 + r * .7], [.12, .3, .3]);   // bata ERA di muka kasemat
      for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) m.box([T0 - 2.8 + i * 1.15, sd * 3.2, 6.3], [.5, .1, .28]);
      m.set([240, 236, 214], .6, K.EMIT, 0); for (const sd of [-1, 1]) m.box([T0 + 4.1, sd * 2.6, 6.75], [.05, .22, .14]);   // lampu sorot
      m.bone(2);   // meriam ganda 203 mm berlaras panjang: mantel bersudut, selubung termal, pengisap asap, rem moncong bercelah
      m.set(TG, .55, K.METAL).ext([[G[0] - .4, G[2] - 1.15], [G[0] - .4, G[2] + 1.15], [G[0] + 1.25, G[2] + .85], [G[0] + 1.5, G[2] - .9]], -1.75, 1.75);   // mantel
      for (const y of [-.74, .74]) {
        m.set(DK, .45, K.METAL).cyl([G[0] + 1.3, y, G[2]], [G[0] + 12.6, y, G[2]], .34, .27, 14);
        m.set([36, 37, 39], .4, K.METAL); for (const x of [3.0, 4.8]) m.cyl([G[0] + x, y, G[2]], [G[0] + x + .9, y, G[2]], .39, .38, 14);   // selubung termal
        m.cyl([G[0] + 7.4, y, G[2]], [G[0] + 8.7, y, G[2]], .47, .47, 14);   // pengisap asap
        m.set([28, 28, 30], .5, K.METAL).box([G[0] + 13.1, y, G[2]], [.58, .41, .35]);   // rem moncong
        m.set([8, 8, 8], 0, K.PLAIN); for (const x of [12.8, 13.35]) for (const sg of [-1, 1]) m.box([G[0] + x, y + sg * .415, G[2]], [.15, .01, .24]);   // celah rem moncong
        m.cyl([G[0] + 13.68, y, G[2]], [G[0] + 13.7, y, G[2]], .24, .24, 12);   // mulut laras
        m.set(YL, .3, K.PAINT, 0).cyl([G[0] + 11.4, y, G[2]], [G[0] + 11.6, y, G[2]], .31, .31, 12);   // cincin kuning
      }
    } else if (type === 'TEMPEST') {   // TEMPEST ±24 m: peluncur roket berat 10×10 — kabin lapis baja bersudut berkaca celah merah, bajak berpaku, rok baja menutupi roda,
      // meja putar (tulang 1, poros MD.TEM.tur) + dua pod 9 roket berhulu ledak merah yang terangkat (tulang 2, poros MD.TEM.gp), CIWS, rudal hanud, lampu suar merah
      const L = 10.8, Wd = 2.05, T0 = MD.TEM.tur, G = MD.TEM.gp, DKG = [30, 32, 30], ST = [46, 48, 46], RL = [255, 40, 30];
      m.bone(0); m.set([22, 22, 22], .1, K.PLAIN);
      for (const x of [8.6, 6.0, 1.6, -3.4, -6.4]) for (const sd of [-1, 1]) { m.cyl([x, sd * (Wd - .55), .9], [x, sd * (Wd + .05), .9], .9, .9, 14); m.set([60, 60, 56], .3, K.METAL).cyl([x, sd * (Wd + .05), .9], [x, sd * (Wd + .08), .9], .45, .45, 8); m.set([22, 22, 22], .1, K.PLAIN); }
      paint(b); m.box([0, 0, 2.0], [L, Wd - .1, .5]); m.set(DKG, .3, K.METAL).box([0, 0, 1.4], [L - .4, Wd - .7, .3]);
      m.set(ST, .45, K.METAL); for (const sd of [-1, 1]) { m.box([1.1, sd * (Wd + .2), 1.6], [8.6, .07, .55]); for (let i = 0; i < 9; i++) m.box([-7 + i * 2, sd * (Wd + .28), 1.32], [.06, .03, .06]); }   // rok baja + baut
      paint(b); m.ext([[L - 3.9, 2.45], [L - 3.9, 5.0], [L - 2.0, 5.2], [L - .2, 4.3], [L + .7, 3.0], [L + .8, 2.45]], -Wd + .02, Wd - .02);   // kabin bersudut
      m.set([110, 24, 20], .95, K.GLASS); m.push(X.chain(X.T(L + .25, 0, 3.7), X.ry(-.95))); m.box([0, 0, 0], [.06, Wd - .45, .11]); m.pop();   // kaca celah merah gelap
      for (const sd of [-1, 1]) m.box([L - 1.7, sd * (Wd - .01), 4.15], [.8, .02, .07]);
      m.set(DKG, .4, K.METAL).box([L + .95, 0, 1.85], [.25, Wd + .15, .5]); for (let i = -3; i <= 3; i++) m.cyl([L + 1.15, i * .58, 1.85], [L + 1.85, i * .58, 1.85], .1, .01, 5);   // bajak berpaku
      m.cyl([L - 2.8, .95, 5.1], [L - 2.8, .95, 5.6], .34, .34, 8); for (const o of [-.08, .08]) m.cyl([L - 2.8, .95 + o, 5.65], [L - 1.3, .95 + o, 5.75], .045, .045, 5);   // CIWS
      m.set([82, 86, 76], .3, K.PAINT, 0).box([L - 2.8, -.95, 5.45], [.85, .38, .32]); m.set([170, 40, 30], .2, K.PLAIN).box([L - 1.94, -.95, 5.45], [.01, .27, .2]);   // rudal hanud
      m.set(RL, 0, K.EMIT); for (const sd of [-1, 1]) m.box([L - 1.0, sd * 1.4, 4.78], [.12, .12, .08]); m.box([-L - .02, 1.4, 2.1], [.04, .15, .1]).box([-L - .02, -1.4, 2.1], [.04, .15, .1]);   // lampu suar & belakang
      m.set([240, 236, 214], .6, K.EMIT, 0); for (const sd of [-1, 1]) m.box([L + .74, sd * (Wd - .5), 2.7], [.04, .2, .1]);
      m.set(DKG, .3, K.METAL).box([-L + .9, 0, 2.9], [.8, Wd - .3, .5]);
      m.bone(1); m.set(DKG, .35, K.METAL).cyl([T0, 0, 2.5], [T0, 0, 2.85], 2.0, 2.0, 18); paint(d); for (const sd of [-1, 1]) m.box([G[0] + .7, sd * 2.15, 3.15], [1.3, .14, .6]);   // meja putar + penyangga engsel
      m.bone(2);   // dua pod peluncur: tabung berhulu ledak merah menyembul, bingkai depan, garis peringatan
      for (const y of [-1.06, 1.06]) {
        paint(b); m.box([G[0] + 3.9, y, G[2] + 1.15], [4.1, .96, 1.12]);
        m.set(ST, .45, K.METAL).box([G[0] + 8.02, y, G[2] + 1.15], [.08, 1.0, 1.17]);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const yy = y - .6 + c * .6, zz = G[2] + .45 + r * .7; m.set([14, 14, 16], 0, K.PLAIN).cyl([G[0] + 8.06, yy, zz], [G[0] + 8.1, yy, zz], .27, .27, 10); m.set([196, 32, 24], .4, K.PAINT, 0).cyl([G[0] + 7.9, yy, zz], [G[0] + 8.45, yy, zz], .2, .02, 8); }
        m.set([200, 170, 40], .3, K.PAINT, 0); for (let i = 0; i < 4; i++) m.box([G[0] + 1 + i * 1.6, y, G[2] + 2.29], [.35, .9, .02]);
      }
      m.set(DKG, .4, K.METAL).box([G[0] + 3.9, 0, G[2] + .02], [3.8, 2.0, .12]);
    } else if (type === 'TANK' || type === 'LTANK' || type === 'ZSU' || type === 'ARTY') {
      const s = type === 'TANK' ? 1 : type === 'LTANK' ? .82 : .86, L = 3.3 * s, Wd = 1.65 * s;
      m.bone(0); tracks(m, L, Wd, 1, Wd - .25); tracks(m, L, Wd, 1, -Wd + .25);
      paint(b); m.ext([[-L - .2, .55], [-L - .3, 1.55], [L - .9, 1.7], [L + .6, 1.15], [L + .5, .55]], -Wd + .55, Wd - .55);   // lambung (glasis miring)
      paint(b); m.box([0, Wd - .2, 1.2], [L + .2, .22, .32]).box([0, -Wd + .2, 1.2], [L + .2, .22, .32]);   // spatbor/rok samping
      paint(d); m.box([0, Wd - .02, 1.05], [L + .1, .04, .38]).box([0, -Wd + .02, 1.05], [L + .1, .04, .38]);
      m.set([200, 180, 120], .5, K.EMIT, 0).box([L + .48, Wd - .45, 1.25], [.03, .1, .06]).box([L + .48, -Wd + .45, 1.25], [.03, .1, .06]);
      paint(d); m.box([-L - .15, 0, 1.4], [.12, .9, .25]);   // pintu mesin
      m.bone(1);
      if (type === 'ARTY') { paint(b); m.box([-.6, 0, 2.3], [1.7, 1.25, .6]); paint(d); m.box([-2.1, 0, 2.3], [.25, 1.1, .45]); m.set(DK, .3, K.METAL).cyl([-.3, .8, 2.95], [-.3, .8, 3.3], .2, .2, 8); }
      else if (type === 'ZSU') { paint(b); m.box([0, 0, 2.15], [1.1, 1, .5]); m.set(DK, .3, K.METAL).box([-.7, 0, 3], [.08, .6, .4]); }
      else { paint(b); m.ext([[-1.8 * s, 1.75], [-1.95 * s, 2.15], [-1.5 * s, 2.55], [1.2 * s, 2.55], [1.85 * s, 2.15], [1.6 * s, 1.75]], -1.3 * s, 1.3 * s); paint(d); m.box([-2.05 * s, 0, 2.15], [.3, 1.15 * s, .32]); m.set(DK, .3, K.METAL).cyl([-.4, .6 * s, 2.55], [-.4, .6 * s, 2.85], .25, .23, 10).cyl([0, -.55 * s, 2.55], [0, -.55 * s, 2.75], .12, .12, 6).cyl([-1.5 * s, .9, 2.5], [-1.6 * s, .9, 3.9], .015, .01, 3);
        for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) m.cyl([1.1 * s, sd * (1.1 + i * .06) * s, 2.2 + i * .1], [1.35 * s, sd * (1.2 + i * .06) * s, 2.35 + i * .1], .05, .05, 5); }
      m.bone(2);
      if (type === 'ZSU') { m.set(DK, .3, K.METAL); for (const sd of [-1, 1]) m.cyl([.3, sd * .85, 2.4], [2.9, sd * .85, 2.5], .05, .045, 6); m.bone(4).set(DK, .3, K.METAL).cyl([-.7, 0, 3.4], [-.7, 0, 3.45], .7, .7, 10).bone(2); }
      else { paint(b); m.box([1.6 * s, 0, type === 'ARTY' ? 2.5 : 2.15], [.3, .38, .3]); m.set(DK, .35, K.METAL).cyl([1.8 * s, 0, type === 'ARTY' ? 2.5 : 2.15], [type === 'ARTY' ? 7.2 : 5.6 * s, 0, type === 'ARTY' ? 2.5 : 2.15], .11, .09, 10); m.cyl([3.6 * s, 0, type === 'ARTY' ? 2.5 : 2.15], [4.4 * s, 0, type === 'ARTY' ? 2.5 : 2.15], .16, .16, 10); if (type === 'ARTY') m.cyl([7, 0, 2.5], [7.35, 0, 2.5], .17, .17, 10); }
    } else if (type === 'IFV' || type === 'REPAIR' || type === 'MLRS' || type === 'AA') {
      const truck = type !== 'IFV', L = truck ? 3.7 : 3.2, Wd = 1.4;
      m.bone(0); m.set([24, 24, 24], .1, K.PLAIN);
      const axles = truck ? [-2.3, -1, 2.3] : [-2.2, -.75, .75, 2.2];
      for (const x of axles) for (const sd of [-1, 1]) { m.cyl([x, sd * (Wd - .05), .55], [x, sd * (Wd + .3), .55], .55, .55, 12); m.set([60, 60, 58], .3, K.METAL).cyl([x, sd * (Wd + .3), .55], [x, sd * (Wd + .32), .55], .3, .3, 8); m.set([24, 24, 24], .1, K.PLAIN); }
      if (!truck) {
        paint(b); m.ext([[-L, .75], [-L - .1, 2.05], [L - 1, 2.15], [L + .25, 1.45], [L + .2, .75]], -Wd, Wd);
        m.set(GLS, .9, K.GLASS).box([L - .85, 0, 2.05], [.2, .6, .08]);
        m.bone(1); paint(b); m.box([-.3, 0, 2.45], [.75, .7, .3]); m.bone(2).set(DK, .35, K.METAL).cyl([.4, 0, 2.5], [2.4, 0, 2.5], .045, .04, 6); m.box([-.2, -.75, 2.6], [.4, .1, .12]);
      } else {
        paint(b); m.box([L - .9, 0, 1.9], [.9, Wd - .05, .8]); m.set(GLS, .9, K.GLASS).box([L - .02, 0, 2.15], [.03, Wd - .2, .38]); m.box([L - .9, Wd - .04, 2.15], [.6, .03, .3]); m.box([L - .9, -Wd + .04, 2.15], [.6, .03, .3]);
        paint(d); m.box([-.5, 0, 1.05], [L - .5, Wd - .1, .25]);
        m.set([200, 180, 120], .5, K.EMIT).box([L + .01, Wd - .3, 1.4], [.02, .12, .08]).box([L + .01, -Wd + .3, 1.4], [.02, .12, .08]);
        if (type === 'MLRS') { m.bone(1); paint(d); m.push(X.chain(X.T(-1.3, 0, 1.4), X.ry(.35))); m.box([0, 0, .55], [2, 1.15, .55]); m.set([18, 18, 18], 0, K.PLAIN); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) m.box([2.01, -.7 + i * .7, .3 + j * .5], [.01, .25, .18]); m.pop(); }
        else if (type === 'AA') { m.bone(1); paint(d); m.box([-1.3, 0, 1.6], [.6, .6, .3]); m.set(DK, .3, K.METAL); for (const sd of [-1, 1]) m.box([-1.1, sd * .75, 2.2], [1.2, .22, .22]); m.cyl([-1.3, 0, 1.9], [-1.3, 0, 2.6], .08, .08, 6); }
        else { paint(b); m.box([-1.1, 0, 1.95], [1.6, Wd - .05, .7]); m.set([236, 236, 230], .2, K.PLAIN).box([-1.1, Wd - .03, 2], [1, .03, .5]); m.set([210, 30, 30], .2, K.PLAIN).box([-1.1, Wd, 2], [.35, .02, .1]).box([-1.1, Wd, 2], [.1, .02, .35]).box([-1.1, -Wd, 2], [.35, .02, .1]).box([-1.1, -Wd, 2], [.1, .02, .35]); m.bone(1).set(DK, .3, K.METAL).cyl([-2.2, 0, 2.7], [-4.3, 0, 3.8], .1, .07, 6); }
      }
    }
    return m.done();
  };
  MD.GEARZ = { FGT: -.6, CAS: -.6, BMB: -1.2, UCAV: -.2 };   // engsel roda pendarat (tulang 5, terlipat saat terbang); roda menapak pada z = −gh
  function gearSet(m, g) {
    m.bone(5);
    for (const [x, y] of [g.n].concat(g.w)) {
      m.set([54, 56, 56], .5, K.METAL).cyl([x, y, g.z], [x, y, -g.gh + g.r], g.r * .28, g.r * .24, 6);
      m.set([16, 16, 16], .08, K.PLAIN).cyl([x, y - g.r * .55, -g.gh + g.r], [x, y + g.r * .55, -g.gh + g.r], g.r, g.r, 12);
    }
    m.bone(0);
  }
  MD.aircraft = function (type, palK) {
    const m = new Mesh(), red = palK === 'R', b = type === 'MEDHELI' ? [232, 232, 228] : red ? [92, 96, 100] : palK === 'US' ? [112, 118, 110] : [84, 98, 74], d = [40, 42, 44], cam = red ? 3 : 1;
    const paint = (c, s) => m.set(c, s || .25, K.PAINT, cam);
    m.bone(0);
    if (type === 'AH64') ghost(m);   // killstreak operator: AH-64X SHADOW HUNTER
    else if (type === 'ATK2') apache(m, red ? [92, 96, 100] : [70, 78, 60], d, paint);
    else if (type === 'VTOL') {   // jet tempur VTOL "ELANG" (foto pengguna): hidung panjang, kanard, sayap sapu, dua sirip tegak miring keluar, saluran udara di sisi kokpit,
      // nosel vektor dorong (tulang 2, berputar ke bawah saat melayang), roda pendarat (tulang 5, terlipat saat terbang), rudal & bom di sayap
      const VX = MD.VEHX.VTOL, TN = [150, 132, 100], GY = [70, 70, 66], tn = () => m.set(TN, .35, K.PAINT, 0);
      const plate = (le0, te0, y0, le1, te1, y1, z, th, dz) => { for (const sd of [-1, 1]) for (const zz of [-th, th]) { const pts = [[le0, sd * y0, z + zz], [le1, sd * y1, z + zz + (dz || 0)], [te1, sd * y1, z + zz + (dz || 0)], [te0, sd * y0, z + zz]]; m.face(zz > 0 === sd > 0 ? pts : pts.slice().reverse(), [0, 0, zz > 0 ? 1 : -1]); } };
      tn(); m.push(X.ry(Math.PI / 2)); m.lathe([0, 0, 0], [[0, -9.6], [.35, -8.4], [.7, -6], [.95, -3.5], [1.05, 0], [1.0, 5], [.85, 7.6], [.8, 8.1]], 14); m.pop();
      tn(); m.box([-1.4, 0, -.05], [5, 1.3, .3]);   // badan tengah melebar
      // kokpit: bak gelap, kursi lontar (sandaran kepala merah), panel instrumen bercahaya — tampak saat kanopi terangkat
      m.set([22, 24, 26], .1, K.PLAIN).box([4.2, 0, .9], [1.3, .47, .1]);
      m.set([38, 40, 38], .2, K.PLAIN).box([3.82, 0, 1.0], [.24, .24, .06]).box([3.55, 0, 1.12], [.07, .22, .22]); m.set([120, 24, 20], .2, K.PLAIN).box([3.56, 0, 1.33], [.08, .16, .06]);   // puncak sandaran 1,39 m, kaca di atasnya 1,5 m
      m.set([24, 26, 28], .3, K.PLAIN).box([5.08, 0, 1.06], [.2, .44, .11]); m.set([40, 150, 96], 0, K.EMIT).box([4.875, -.2, 1.1], [.005, .09, .06]).box([4.875, .2, 1.1], [.005, .09, .06]);
      m.set(GY, .4, K.METAL).box([4.25, .5, .92], [1.35, .04, .04]).box([4.25, -.5, .92], [1.35, .04, .04]);   // rel ambang kokpit
      m.bone(6).set([70, 94, 112], .95, K.GLASS).sph([4.3, 0, .9], [1.55, .56, .68], 14, 6, { hemi: true });   // kanopi gelembung berengsel belakang (terangkat saat naik)
      m.set(GY, .4, K.METAL); for (let k = 0; k <= 8; k++) { const t = -Math.PI / 2 + k * Math.PI / 8; m.box([3.45, Math.sin(t) * .47, .9 + Math.cos(t) * .57], [.04, .05, .05]); m.box([2.86, Math.sin(t) * .52, .9 + Math.cos(t) * .2], [.04, .05, .04]); }
      m.box([4.3, .53, .9], [1.46, .03, .03]).box([4.3, -.53, .9], [1.46, .03, .03]); m.box([4.0, .5, .82], [.12, .05, .03]);   // ambang + gagang
      m.bone(7).set(GY, .45, K.METAL);   // tangga naik lipat (terbuka bersama kanopi)
      for (const x of [3.82, 4.22]) m.cyl([x, 1.0, .82], [x, 1.62, -2.3], .03, .03, 4);
      for (let k = 1; k < 9; k++) { const t = k / 9; m.box([4.02, 1.0 + .62 * t, .82 - 3.12 * t], [.2, .02, .02]); }
      m.bone(0);
      for (const sd of [-1, 1]) { tn(); m.box([2.4, sd * 1.38, -.12], [1.3, .36, .45]); m.set([16, 16, 18], .2, K.PLAIN).box([3.71, sd * 1.38, -.12], [.01, .3, .38]); }   // saluran udara
      tn(); plate(4.1, 3.0, 1.2, 3.3, 2.7, 3.1, .15, .05);   // kanard
      plate(1.4, -4.6, 1.25, -3.1, -4.4, 6.2, -.05, .08, -.15);   // sayap utama
      plate(-5.5, -7.6, .9, -7.0, -8.0, 3.4, -.05, .05);   // sirip datar
      for (const sd of [-1, 1]) { tn(); m.push(X.chain(X.T(-5.9, sd * .95, .25), X.rx(-sd * .38))); m.ext([[1.3, 0], [-1.3, 0], [-2.1, 2.9], [-1.0, 2.9]], -.06, .06); m.pop(); }   // dua sirip tegak miring
      m.set(GY, .4, K.METAL); for (const sd of [-1, 1]) {   // persenjataan sayap
        m.cyl([-1.8, sd * 6.1, -.05], [-4.6, sd * 6.1, -.05], .09, .09, 6); m.cyl([-1.8, sd * 6.1, -.05], [-1.5, sd * 6.1, -.05], .09, .02, 6);
        m.box([-1.6, sd * 3.4, -.45], [.6, .05, .2]); m.set([90, 94, 86], .3, K.PAINT, 0).cyl([-.4, sd * 3.4, -.78], [-3, sd * 3.4, -.78], .17, .17, 8).cyl([-.4, sd * 3.4, -.78], [.1, sd * 3.4, -.78], .17, .03, 8);
        m.set([64, 68, 58], .3, K.PAINT, 0).cyl([-.2, sd * 2.2, -.82], [-2.8, sd * 2.2, -.82], .23, .2, 8).cyl([-.2, sd * 2.2, -.82], [.3, sd * 2.2, -.82], .23, .05, 8); m.set(GY, .4, K.METAL);
      }
      m.set([18, 18, 18], .2, K.PLAIN).box([VX.gun[0], VX.gun[1], VX.gun[2]], [.12, .06, .05]);
      m.set([255, 40, 30], 0, K.EMIT).box([-3.8, -6.25, -.05], [.15, .05, .05]); m.set([60, 255, 90], 0, K.EMIT).box([-3.8, 6.25, -.05], [.15, .05, .05]);
      m.bone(2);   // nosel vektor
      for (const sd of [-1, 1]) { m.set([58, 56, 52], .5, K.METAL).cyl([-7.9, sd * .62, -.05], [-8.9, sd * .62, -.05], .52, .42, 12); m.set([255, 140, 60], 0, K.EMIT).cyl([-8.86, sd * .62, -.05], [-8.9, sd * .62, -.05], .34, .34, 10); }
      m.bone(5);   // roda pendarat
      m.set([40, 40, 40], .5, K.METAL).cyl([6.2, 0, -.7], [6.2, 0, -2.0], .07, .07, 6); m.set([24, 24, 24], .1, K.PLAIN).cyl([6.2, -.12, -2.03], [6.2, .12, -2.03], .3, .3, 10);
      for (const sd of [-1, 1]) { m.set([40, 40, 40], .5, K.METAL).cyl([-1.2, sd * 1.5, -.6], [-1.2, sd * 1.56, -1.9], .09, .09, 6); m.set([24, 24, 24], .1, K.PLAIN).cyl([-1.2, sd * 1.42, -1.95], [-1.2, sd * 1.7, -1.95], .38, .38, 12); }
      m.bone(0);
    }
    else if (type === 'HELI' || type === 'MEDHELI') {
      const big = type === 'ATK2' ? 1.1 : 1, med = type === 'MEDHELI';
      paint(b); m.push(X.ry(Math.PI / 2)); m.lathe([0, 0, 0], [[.0, -4.2 * big], [.55, -3.6 * big], [.95, -1.6], [1.0, .6], [.75, 2.3], [.32, 3.6], [.1, 6.4], [.0, 6.6]].map(q => [q[0] * (med ? 1.15 : 1), q[1]]), 12); m.pop();
      m.set(GLS, .95, K.GLASS); m.sph([2.6 * big, 0, .55], [1.3, .55, .55], 10, 5, { hemi: true });
      if (!med) m.sph([1.2 * big, 0, .75], [1.1, .5, .5], 10, 5, { hemi: true });
      paint(b); m.box([-7.2 * big, 0, .9], [.5, .08, 1.1]); m.box([-6.6 * big, 0, .35], [.4, 1.2, .05]);
      if (!med) { m.box([.3, 0, -.15], [.7, 2.2, .08]); m.set(d, .3, K.METAL); for (const sd of [-1, 1]) { m.cyl([-.4, sd * 1.7, -.4], [1.4, sd * 1.7, -.4], .22, .22, 8); m.cyl([-.4, sd * 2.25, -.4], [1.2, sd * 2.25, -.4], .14, .14, 6); } m.cyl([3.6 * big, 0, -.55], [5, 0, -.6], .04, .04, 5); }
      else { m.set([210, 30, 30], .2, K.PLAIN).box([0, 1.16, .2], [.6, .01, .18]).box([0, 1.16, .2], [.18, .01, .6]).box([0, -1.16, .2], [.6, .01, .18]).box([0, -1.16, .2], [.18, .01, .6]); m.set(d, .3, K.METAL); for (const sd of [-1, 1]) m.box([0, sd * 1.15, -1.1], [1.6, .05, .04]); }
      m.set(d, .3, K.METAL); m.cyl([0, 0, .9], [0, 0, 1.45], .18, .18, 8);
      m.bone(3); m.set([30, 30, 32], .2, K.METAL); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; m.push(X.rz(a)); m.box([3.3 * big, 0, 1.55], [3.2 * big, .22, .025]); m.pop(); }
      m.set([40, 40, 42], .1, K.ROTOR, 0).cyl([0, 0, 1.54], [0, 0, 1.56], 6.6 * big, 6.6 * big, 24);
      m.bone(4); m.set([30, 30, 32], .2, K.METAL); m.push(X.T(-7.3 * big, .3, 1.4)); m.box([0, 0, 0], [.08, .03, 1]); m.box([0, 0, 0], [.08, .03, 1]); m.pop();
    } else if (type === 'UAV' || type === 'UCAV') {
      const k = type === 'UCAV' ? 1.5 : 1; paint([170, 172, 168], .3);
      m.push(X.ry(Math.PI / 2)); m.lathe([0, 0, 0], [[0, -2.2 * k], [.25 * k, -1.8 * k], [.3 * k, 0], [.2 * k, 1.6 * k], [.05, 2.2 * k]], 8); m.pop();
      m.box([-.2, 0, .1], [.4 * k, 3.6 * k, .04]); m.push(X.rx(.6)); m.box([-2 * k, .4, .3], [.3, .03, .4]); m.pop(); m.push(X.rx(-.6)); m.box([-2 * k, -.4, .3], [.3, .03, .4]); m.pop();
      if (k > 1) { m.set(d, .3, K.METAL); for (const sd of [-1, 1]) m.cyl([-.6, sd * 1.4, -.25], [.6, sd * 1.4, -.25], .08, .08, 6); }
      m.bone(3).set([30, 30, 30], .1, K.ROTOR).cyl([-2.25 * k, 0, 0], [-2.2 * k, 0, 0], .6, .6, 12);
      if (k > 1) gearSet(m, { z: -.2, gh: 1.1, r: .16, n: [1.9, 0], w: [[-.4, .85], [-.4, -.85]] });
    } else if (type === 'FGT' || type === 'CAS' || type === 'BMB') {
      const s = type === 'BMB' ? 2 : 1, A10 = type === 'CAS';
      paint(b, .35); m.push(X.ry(Math.PI / 2)); m.lathe([0, 0, 0], [[0, -8.5 * s], [.45 * s, -7 * s], [.9 * s, -4 * s], [1 * s, 2 * s], [.8 * s, 6.5 * s], [.6 * s, 7.6 * s]], 12); m.pop();
      m.set(GLS, .95, K.GLASS).sph([5 * s, 0, .75 * s], [1.6 * s, .55 * s, .55 * s], 10, 5, { hemi: true });
      paint(b, .35);
      if (A10) { m.box([0, 0, 0], [1.3, 8.8, .12]); for (const sd of [-1, 1]) { m.set(d, .35, K.METAL).cyl([-3.5, sd * 1.5, 1.3], [-1.6, sd * 1.5, 1.3], .55, .55, 10); paint(b, .35).box([-6.3, sd * 2.9, 1.2], [.7, .06, 1.1]); } m.box([-6.4, 0, .5], [.8, 3.2, .08]); }
      else if (type === 'BMB') { wing(m, 4, 1.2, 18, -9, -12, .2); m.box([-14.5, 0, 2.2], [1.6, .12, 2.2]); m.box([-15, 0, .6], [1.4, 6, .1]); m.set(d, .4, K.METAL); for (const y of [-6, -3.5, 3.5, 6]) m.cyl([-1.6, y, -.6], [1.4, y, -.6], .5, .45, 10); }
      else {
        wing(m, 3, .8, 5.2, -3.4, -5, .08);
        for (const sd of [-1, 1]) { m.push(X.rx(sd * .35)); m.box([-6.6, sd * .9, 1.4], [1.1, .06, 1.2]); m.pop(); m.box([-6.9, sd * 2, .1], [.8, 1.2, .05]); }
        m.set([255, 140, 50], 0, K.EMIT).cyl([-7.62, 0, 0], [-7.7, 0, 0], .5, .5, 10);
      }
      gearSet(m, type === 'BMB' ? { z: -1.2, gh: 3.6, r: .58, n: [9, 0], w: [[-2, 4.2], [-2, -4.2]] } : A10 ? { z: -.6, gh: 2, r: .36, n: [4.2, 0], w: [[.3, 2.2], [.3, -2.2]] } : { z: -.6, gh: 2.1, r: .32, n: [4.6, 0], w: [[-1.2, 1.5], [-1.2, -1.5]] });
    } else if (type === 'BLIMP') {   // balon udara tempur ±34 m: kantong gas berlapis + pita merah, 4 sirip, gondola lapis baja bersenjata, 2 mesin baling-baling
      const env = [150, 150, 144], RD = [150, 34, 30], gd = [56, 58, 60];
      m.set(env, .3, K.PAINT, 0); m.push(X.ry(Math.PI / 2)); m.lathe([0, 0, 0], [[0, -16.5], [2.4, -14.8], [4.3, -10.5], [5.4, -4.5], [5.6, 3], [5, 10], [3, 15], [0, 17.2]], 22); m.pop();
      m.set(RD, .3, K.PAINT, 0).cyl([7, 0, 0], [5.6, 0, 0], 5.25, 5.42, 22, { cap0: false, cap1: false }).cyl([-6.8, 0, 0], [-8, 0, 0], 5.27, 5.08, 22, { cap0: false, cap1: false });
      for (let i = 0; i < 4; i++) { m.push(X.rx(i * Math.PI / 2 + Math.PI / 4)); m.set(env, .3, K.PAINT, 0).box([-14.2, 0, 3.6], [2.4, .14, 2.1]); m.set(RD, .3, K.PAINT, 0).box([-15.8, 0, 4.6], [.8, .15, 1.1]); m.pop(); }
      m.set(gd, .3, K.METAL).box([1.2, 0, -6.4], [4.6, 1.45, 1.05]); m.box([5.9, 0, -6.2], [.5, 1.2, .8]); m.set(GLS, .95, K.GLASS).box([6.1, 0, -6], [.45, 1.15, .4]); m.box([1.2, 1.46, -6.1], [3.4, .02, .3]); m.box([1.2, -1.46, -6.1], [3.4, .02, .3]);
      m.set([40, 40, 40], .3, K.METAL); for (const sd of [-1, 1]) { m.cyl([-1.5, sd * 1.2, -5.4], [-1.5, sd * 2.6, -3.9], .04, .04, 4); m.cyl([3.8, sd * 1.2, -5.4], [3.8, sd * 2.6, -3.9], .04, .04, 4); }
      for (const sd of [-1, 1]) {   // turet SMB, pod roket, mesin
        m.set(d, .35, K.METAL).sph([3.6, sd * 1.1, -7.5], [.4, .4, .35], 8, 4).cyl([3.6, sd * 1.1, -7.6], [5.1, sd * 1.4, -7.9], .05, .05, 5);
        m.set([70, 72, 66], .3, K.PAINT, 0).cyl([-1.5, sd * 1.9, -7.2], [1.3, sd * 1.9, -7.2], .38, .38, 10); m.set([20, 20, 20], 0, K.PLAIN).cyl([1.3, sd * 1.9, -7.2], [1.32, sd * 1.9, -7.2], .32, .32, 10);
        m.set(gd, .3, K.METAL).cyl([-5, sd * 6.4, -2.2], [-8, sd * 6.4, -2.2], .7, .55, 10).cyl([-6.5, sd * 4.9, -2.6], [-6.5, sd * 6, -2.3], .12, .12, 5);
        m.set([30, 30, 30], .2, K.PLAIN).cyl([-8.1, sd * 6.4, -2.2], [-8.16, sd * 6.4, -2.2], 2, 2, 16);
      }
      m.set([40, 42, 44], .3, K.METAL).box([-2.6, 0, -6.4], [.8, .9, .9]); for (const o of [-.35, .35]) m.cyl([-2.9, o, -5.6], [-2.1, o, -5.1], .1, .1, 6);   // peluncur rudal hanud
      m.set([255, 240, 200], 0, K.EMIT).box([6.55, 0, -6.6], [.04, .25, .15]); m.set([255, 50, 40], 0, K.EMIT).box([0, 0, 5.62], [.15, .15, .06]).box([-17.1, 0, 0], [.1, .1, .1]);
    } else if (type === 'GUNSHIP') {   // gunship kelas AC-130 (29 m, bentang 40 m): sayap tinggi, 4 turboprop, ekor naik, senjata menembak dari sisi KANAN (+y)
      paint(b, .3); m.push(X.ry(Math.PI / 2)); m.lathe([0, 0, 0], [[0, -14.3], [1.1, -13.6], [2, -12], [2.4, -9], [2.45, 5], [2.1, 9], [1.2, 13.5], [.5, 15.6], [0, 15.8]], 14); m.pop();
      m.set(GLS, .95, K.GLASS).box([12.4, 0, 1.15], [.9, 1.05, .35]); paint(b, .3).box([-.5, 0, 2.55], [2.3, 1.5, .3]);
      paint(b, .3).box([.6, 0, 2.95], [2.1, 20.2, .22]); m.set(d, .3, K.METAL).box([-.2, 0, 2.95], [.25, 20.25, .2]);
      for (const y of [-10.5, -5.4, 5.4, 10.5]) {
        paint(b, .3).cyl([4.6, y, 2.4], [-1.6, y, 2.6], .62, .45, 10); m.set(d, .35, K.METAL).cyl([4.6, y, 2.4], [5.3, y, 2.4], .3, .05, 8);
        m.set([28, 28, 30], .1, K.PLAIN).cyl([4.75, y, 2.4], [4.8, y, 2.4], 2.05, 2.05, 18);
      }
      paint(b, .3).box([-13.4, 0, 5.2], [1.9, .14, 3.4]); m.box([-14.2, 0, 2.6], [1.6, 7, .14]);
      for (const sd of [-1, 1]) paint(d, .3).box([1, sd * 2.25, -1.6], [2.4, .45, .55]);
      m.set([30, 30, 30], .4, K.METAL).cyl([-1.6, 2.2, -.5], [-1.6, 4.4, -.6], .16, .13, 8).cyl([3.5, 2.3, -.7], [3.5, 3.8, -.7], .08, .07, 6).cyl([6, 2.25, -.9], [6, 3.3, -.9], .07, .07, 6);
      m.set(d, .4, K.METAL).sph([10.2, 0, -2.1], [.5, .5, .45], 10, 5);
      m.set([255, 50, 40], 0, K.EMIT).box([.6, -20.3, 2.95], [.15, .06, .06]); m.set([60, 255, 90], 0, K.EMIT).box([.6, 20.3, 2.95], [.15, .06, .06]); m.set([255, 255, 255], 0, K.EMIT).box([-15.7, 0, 1.7], [.06, .06, .06]);
    } else if (type === 'NEMESIS') {   // NEMESIS: sayap terbang siluman bentang ±52 m (tepi belakang gigi gergaji), badan tengah pipih, 4 mesin terkubur, kubah penembak perut, rel rudal sayap
      const BK = [26, 27, 30], ED = [44, 46, 50], C = [.5, 4];
      const R = [[10, 0], [-4.5, 26], [-7.2, 23.6], [-3.4, 17.2], [-7.8, 10.8], [-4.2, 5.4], [-6.8, 0]], zt = y => .38 - Math.abs(y) / 26 * .26, zb = y => -.16 + Math.abs(y) / 26 * .1;
      const tri = (a, b, c, up) => { let n = nrm(crs(sub(b, a), sub(c, a))); if ((n[2] < 0) === up) n = mul(n, -1); m.face([a, b, c], n); };
      m.set(BK, .45, K.METAL);
      for (const sd of [-1, 1]) {
        const pt = (q, top) => [q[0], sd * q[1], top ? zt(q[1]) : zb(q[1])], c = [C[0], sd * C[1], 0];
        for (let i = 0; i < R.length - 1; i++) {
          const a = R[i], b = R[i + 1];
          tri([c[0], c[1], zt(C[1])], pt(a, 1), pt(b, 1), true); tri([c[0], c[1], zb(C[1])], pt(a, 0), pt(b, 0), false);
          const A1 = pt(a, 1), B1 = pt(b, 1), A0 = pt(a, 0), B0 = pt(b, 0), e = [b[0] - a[0], sd * (b[1] - a[1]), 0];
          let n = nrm([e[1], -e[0], 0]); if (n[0] * (a[0] - C[0]) + n[1] * (sd * a[1] - c[1]) < 0) n = mul(n, -1);
          m.set(ED, .4, K.METAL).face([A1, B1, B0, A0], n); m.set(BK, .45, K.METAL);
        }
        tri([c[0], c[1], zt(C[1])], pt(R[R.length - 1], 1), pt(R[0], 1), true); tri([c[0], c[1], zb(C[1])], pt(R[R.length - 1], 0), pt(R[0], 0), false);
      }
      m.sph([.4, 0, .25], [9.4, 3.6, 1.45], 16, 6);   // badan tengah
      for (const sd of [-1, 1]) {
        m.sph([-.5, sd * 4.6, .3], [6, 1.6, .85], 12, 5);   // punuk mesin
        m.set([16, 16, 18], .2, K.PLAIN).box([3.4, sd * 4.6, .95], [.5, .9, .14]);   // saluran masuk udara
        m.set([255, 120, 50], 0, K.EMIT).box([-6.2, sd * 4.6, .42], [.12, .9, .08]);   // knalpot rata
        m.set(ED, .4, K.METAL).box([-1, sd * 13, -.42], [2.2, .14, .14]); m.set([90, 94, 88], .3, K.PAINT, 0).cyl([.6, sd * 13, -.62], [-2.6, sd * 13, -.62], .22, .22, 8); m.set([200, 40, 30], .2, K.PLAIN).cyl([.6, sd * 13, -.62], [.9, sd * 13, -.62], .22, .05, 8);   // rudal sayap
        m.set(BK, .45, K.METAL);
      }
      m.set([18, 22, 28], .95, K.GLASS); for (const sd of [-1, 1]) { m.push(X.chain(X.T(6.3, sd * .6, 1.08), X.ry(.35))); m.box([0, 0, 0], [.55, .42, .05]); m.pop(); }
      m.set([30, 30, 34], .4, K.METAL).sph([2.6, 0, -1.25], [.75, .75, .6], 10, 5); for (const o of [-.14, .14]) m.cyl([3.1, o, -1.45], [5.2, o, -1.6], .07, .06, 6);   // kubah penembak perut
      m.set([22, 22, 24], .3, K.PLAIN).box([-1.2, 0, -1.18], [2.6, 1.1, .03]);   // pintu ruang bom
      m.set([255, 40, 30], 0, K.EMIT).box([-4.5, -26, .1], [.18, .1, .06]); m.set([60, 255, 90], 0, K.EMIT).box([-4.5, 26, .1], [.18, .1, .06]); m.set([255, 40, 30], 0, K.EMIT).box([-2, 0, 1.68], [.12, .12, .05]);
    } else if (type === 'WYVERN') {   // WYVERN ±27 m: tiltrotor serbu kelas V-22 versi tempur — badan lapis baja, sayap tinggi, nasel tegak di ujung sayap dengan rotor 3 bilah
      // (tulang 3 kiri, 4 kanan, poros MD.WYV), ekor-H, kanon 30 mm di dagu, pod roket & rel rudal di sponson, minigun pintu, rampa belakang
      const BK = [48, 50, 54], DKK = [30, 31, 34], S = MD.WYV.S, W0 = { rx: MD.WYV.rx / S, ry: MD.WYV.ry / S, rz: MD.WYV.rz / S }, RL = [255, 40, 30];
      m.push(SC(S, S, S));   // diperbesar: dulu tampak kecil di ketinggian terbang
      m.set(BK, .35, K.PAINT, 0); m.ext([[-12.5, 1.2], [-12.8, 3.3], [7.5, 3.5], [10.6, 2.4], [11.8, .9], [10.8, -.3], [-9.5, -.3]], -1.85, 1.85);
      m.set(GLS, .95, K.GLASS); m.push(X.chain(X.T(10.6, 0, 2.55), X.ry(-.7))); m.box([0, 0, 0], [.75, 1.45, .05]); m.pop(); for (const sd of [-1, 1]) m.box([9.6, sd * 1.87, 2.3], [1.1, .03, .5]);
      m.set(DKK, .3, K.METAL); for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) m.box([5.5 - i * 2.8, sd * 1.87, 2.2], [.32, .02, .28]);   // jendela kecil berpelat
      m.set(BK, .35, K.PAINT, 0).box([W0.rx, 0, 3.75], [1.7, W0.ry, .2]);   // sayap tinggi lurus
      m.box([W0.rx + .2, 0, 3.55], [2.2, 1.2, .35]);   // rumah sayap di punggung
      for (const sd of [-1, 1]) {
        const y = sd * W0.ry;
        m.bone(sd > 0 ? 5 : 6).set(BK, .35, K.PAINT, 0).cyl([W0.rx, y, 2.4], [W0.rx, y, W0.rz - .2], .8, .72, 12); m.set(DKK, .3, K.METAL).cyl([W0.rx, y, 2.1], [W0.rx, y, 2.4], .6, .8, 12); m.set([255, 120, 40], 0, K.EMIT).cyl([W0.rx, y, 2.05], [W0.rx, y, 2.08], .45, .45, 10); m.bone(0);   // nasel (tulang 5/6: miring ke depan saat melaju) + mulut buang panas
        m.set(DKK, .35, K.METAL).cyl([-1.6, sd * 5.0, 3.35], [1.4, sd * 5.0, 3.35], .36, .36, 10); m.set([20, 20, 20], 0, K.PLAIN).cyl([1.4, sd * 5.0, 3.35], [1.42, sd * 5.0, 3.35], .3, .3, 10);   // pod roket luar di bawah sayap
        m.set(DKK, .35, K.METAL).box([-1, sd * 2.3, .4], [5, .45, .6]);   // sponson
        m.set([70, 72, 66], .3, K.PAINT, 0).cyl([.2, sd * 3.2, .5], [3, sd * 3.2, .5], .4, .4, 10); m.set([20, 20, 20], 0, K.PLAIN).cyl([3, sd * 3.2, .5], [3.02, sd * 3.2, .5], .34, .34, 10);   // pod roket
        m.set(DKK, .4, K.METAL).box([-1.6, sd * 3.25, .55], [1, .07, .1]); m.set([90, 94, 88], .3, K.PAINT, 0).cyl([-2.5, sd * 3.25, .4], [-.6, sd * 3.25, .4], .11, .11, 6);   // rel rudal
        m.set([28, 28, 30], .4, K.METAL).cyl([7.6, sd * 1.9, 1.9], [7.6, sd * 3.1, 1.8], .07, .06, 6).sph([7.6, sd * 1.9, 1.9], [.2, .2, .2], 6, 3);   // minigun pintu
        m.set([24, 24, 24], .1, K.PLAIN).cyl([8.6, sd * 1.3, -.85], [8.6, sd * 1.6, -.85], .42, .42, 10).cyl([-6.5, sd * 2.2, -.85], [-6.5, sd * 2.55, -.85], .45, .45, 10);   // roda
      }
      m.set(BK, .35, K.PAINT, 0).box([-12, 0, 3.4], [1.1, 3.4, .14]); for (const sd of [-1, 1]) m.ext([[-13, 3.2], [-12.4, 6.2], [-11.3, 6.2], [-10.9, 3.2]], sd * 3.4 - .08, sd * 3.4 + .08);   // ekor-H
      m.set(DKK, .4, K.METAL).sph([10.6, 0, -.45], [.55, .55, .45], 10, 5); m.cyl([10.9, 0, -.55], [13, 0, -.65], .08, .07, 6);   // kanon 30 mm di dagu
      m.set([16, 16, 18], .2, K.PLAIN).box([-12.82, 0, 2.2], [.02, 1.5, 1]);   // rampa
      m.set(RL, 0, K.EMIT).box([11.8, 0, .9], [.04, .2, .08]).box([-11.3, 3.4, 6.25], [.1, .1, .06]).box([-11.3, -3.4, 6.25], [.1, .1, .06]);
      m.set([60, 255, 90], 0, K.EMIT).box([W0.rx - 1.6, W0.ry + .05, 3.75], [.1, .02, .06]); m.set(RL, 0, K.EMIT).box([W0.rx - 1.6, -W0.ry - .05, 3.75], [.1, .02, .06]);
      for (const [b, y] of [[3, W0.ry], [4, -W0.ry]]) {
        m.bone(b).set([24, 24, 26], .3, K.METAL).cyl([W0.rx, y, W0.rz - .3], [W0.rx, y, W0.rz + .15], .4, .3, 8);
        for (let i = 0; i < 3; i++) { m.push(X.chain(X.T(W0.rx, y, 0), X.rz(i * 2.094))); m.box([3.3, 0, W0.rz + .1], [3, .32, .04]); m.pop(); }
        m.set([30, 30, 32], .1, K.ROTOR, 9).cyl([W0.rx, y, W0.rz + .08], [W0.rx, y, W0.rz + .1], 6.3, 6.3, 28);
      }
      m.pop();
    } else if (type === 'KRAKEN') {   // KRAKEN ±32 m: heli rotor tandem kelas Chinook versi serang — badan kotak lapis baja, 2 rotor 3 bilah (tulang 3 depan, 4 belakang, poros ±MD.KRAKEN.rot),
      // kanon kembar 30 mm di dagu, minigun pintu, sayap pendek + pod roket, rel ATGM, sponson BBM, roda
      const BK = [44, 46, 50], DKK = [30, 31, 34], RR = MD.KRAKEN.rot, RL = [255, 40, 30];
      m.set(BK, .35, K.PAINT, 0); m.ext([[-14.2, 1], [-14.6, 3.7], [10.6, 3.7], [13.6, 2.5], [14.3, .6], [13, -.4], [-12.4, -.4]], -1.95, 1.95);
      m.set(GLS, .95, K.GLASS); m.push(X.chain(X.T(13.1, 0, 2.95), X.ry(-.75))); m.box([0, 0, 0], [.6, 1.5, .05]); m.pop(); for (const sd of [-1, 1]) m.box([12.3, sd * 1.97, 2.6], [1.1, .03, .55]);
      m.set(DKK, .3, K.METAL); for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) m.box([7 - i * 3, sd * 1.97, 2.4], [.35, .02, .3]);   // jendela kecil tertutup pelat
      m.set(BK, .35, K.PAINT, 0).ext([[RR - 2.4, 3.7], [RR - 1.6, 4.6], [RR + 1.6, 4.6], [RR + 2.2, 3.7]], -1.1, 1.1);   // pilon rotor depan
      m.ext([[-RR - 5, 3.7], [-RR - 2.6, 6.6], [-RR + 1.6, 6.6], [-RR + 2.4, 3.7]], -1.25, 1.25);   // menara rotor belakang
      for (const sd of [-1, 1]) {
        m.set(DKK, .35, K.METAL).box([-.5, sd * 2.4, .5], [7.5, .5, .85]);   // sponson BBM lapis baja
        m.set(BK, .35, K.PAINT, 0).box([2, sd * 3.5, 1.2], [1.2, 1.4, .1]);   // sayap pendek
        m.set([70, 72, 66], .3, K.PAINT, 0).cyl([.6, sd * 4.4, .8], [3.6, sd * 4.4, .8], .42, .42, 10); m.set([20, 20, 20], 0, K.PLAIN).cyl([3.6, sd * 4.4, .8], [3.62, sd * 4.4, .8], .36, .36, 10);   // pod roket
        m.set(DKK, .4, K.METAL).box([2, sd * 3.2, .7], [1.2, .08, .12]); m.set([90, 94, 88], .3, K.PAINT, 0).cyl([1, sd * 3.2, .55], [3.1, sd * 3.2, .55], .12, .12, 6);   // rel ATGM
        m.set([28, 28, 30], .4, K.METAL).cyl([9.5, sd * 2, 2.1], [9.5, sd * 3.3, 2.0], .07, .06, 6).sph([9.5, sd * 2, 2.1], [.22, .22, .22], 6, 3);   // minigun pintu
        m.set([24, 24, 24], .1, K.PLAIN).cyl([10.5, sd * 1.4, -.9], [10.5, sd * 1.7, -.9], .45, .45, 10).cyl([-9.5, sd * 1.6, -.9], [-9.5, sd * 1.95, -.9], .45, .45, 10);   // roda
        m.set(DKK, .3, K.METAL).cyl([10.5, sd * 1.5, -.9], [10.5, sd * 1.2, -.3], .08, .08, 5).cyl([-9.5, sd * 1.7, -.9], [-9.5, sd * 1.7, -.3], .08, .08, 5);
      }
      m.set(DKK, .4, K.METAL).sph([12.6, 0, -.55], [.6, .6, .5], 10, 5); for (const o of [-.16, .16]) m.cyl([12.9, o, -.65], [15.1, o, -.75], .08, .07, 6);   // kanon kembar 30 mm
      m.set([16, 16, 18], .2, K.PLAIN).box([-14.62, 0, 2.2], [.02, 1.6, 1.1]);   // pintu rampa
      m.set(RL, 0, K.EMIT).box([-RR, 0, 6.66], [.12, .12, .06]).box([14.3, 0, .2], [.04, .2, .08]); m.set([60, 255, 90], 0, K.EMIT).box([4, 1.97, 3.5], [.1, .02, .06]); m.set(RL, 0, K.EMIT).box([4, -1.97, 3.5], [.1, .02, .06]);
      for (const [b, x, z] of [[3, RR, 4.9], [4, -RR, 6.9]]) {
        m.bone(b).set([24, 24, 26], .3, K.METAL).cyl([x, 0, z - .3], [x, 0, z + .15], .35, .3, 8);
        for (let i = 0; i < 3; i++) { m.push(X.chain(X.T(x, 0, 0), X.rz(i * 2.094))); m.box([4.7, 0, z + .1], [4.4, .3, .035]); m.pop(); }
        m.set([30, 30, 32], .1, K.ROTOR, 9).cyl([x, 0, z + .08], [x, 0, z + .1], 9, 9, 28);
      }
    } else if (type === 'UFO') {
      m.set([150, 156, 168], .9, K.METAL); m.lathe([0, 0, 0], [[0, -1.2], [3, -.9], [6.5, -.15], [7, 0], [6.5, .25], [3.2, .9], [0, 1.1]], 28);
      m.set([60, 255, 170], 0, K.UFO, 1).cyl([0, 0, -1.25], [0, 0, -1.2], 2.4, 2.6, 20);
      m.set([140, 220, 255], .95, K.GLASS).sph([0, 0, .9], [2.6, 2.6, 1.7], 14, 6, { hemi: true });
      m.bone(3); m.set([255, 240, 150], 0, K.UFO, 0); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28; m.sph([Math.cos(a) * 6.75, Math.sin(a) * 6.75, .05], [.28, .28, .2], 6, 3); }
    }
    return m.done();
  };
  /* AH-64X "SHADOW HUNTER" — heli serang siluman killstreak operator (bukan heli AI): x maju, y kanan, z naik, poros rotor di (0,0).
     badan bersegi 8 (permukaan datar bersudut + chine tajam di sisi), kokpit berdampingan dengan jendela pita, kipas ekor tertutup
     (fenestron, tulang 4) di sirip, sayap pendek: pod rudal kotak 2×2 (Hellfire) + pod roket segi enam (Hydra) + tabung Stinger kembar
     di ujung sayap, meriam kembar
     30 mm di dagu (tulang 2), rotor 5 bilah (tulang 5/3), roda pendarat, nomor lambung merah "07". Roda menyentuh tanah pada z = −gear */
  MD.GHOST = { tail: [-9.35, 0, 1.55], gun: [4.3, 0, -.82], rotR: 7.2, gear: 1.45, cam: [3.35, .32, .78], hf: [1.75, 2.2, -.25], hy: [1.6, 1.45, -.42], st: [1.5, 2.66, -.08] };
  function loft(m, secs, mat) {   // penampang bersegi → permukaan datar; normal tiap sisi diarahkan keluar dari sumbu penampang
    const cen = A => A.reduce((s, p) => [s[0] + p[0] / A.length, s[1] + p[1] / A.length], [0, 0]);
    for (let i = 0; i < secs.length - 1; i++) {
      const [xa, A] = secs[i], [xb, B] = secs[i + 1], n = A.length, ca = cen(A), cb = cen(B);
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n, P = [[xa, A[j][0], A[j][1]], [xa, A[k][0], A[k][1]], [xb, B[k][0], B[k][1]], [xb, B[j][0], B[j][1]]];
        let nn = nrm(crs(sub(P[2], P[0]), sub(P[3], P[1])));
        const mid = mul(add(add(P[0], P[1]), add(P[2], P[3])), .25), c = [(xa + xb) / 2, (ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2];
        if (dot(nn, sub(mid, c)) < 0) nn = mul(nn, -1);
        if (mat && mat(i, j) === false) continue; m.face(P, nn);
      }
    }
    if (mat) mat(-1, -1);
    const f0 = secs[0], f1 = secs[secs.length - 1];
    m.face(f0[1].map(p => [f0[0], p[0], p[1]]), [1, 0, 0]); m.face(f1[1].map(p => [f1[0], p[0], p[1]]), [-1, 0, 0]);
  }
  // penampang 8 titik: atap (tw,zt) · ambang jendela (sw,zs) · chine (w,zc) · lunas (bw,zb), simetris kiri-kanan
  const sec8 = (tw, zt, sw, zs, w, zc, bw, zb) => [[tw, zt], [sw, zs], [w, zc], [bw, zb], [-bw, zb], [-w, zc], [-sw, zs], [-tw, zt]];
  function ring(m, c, r0, r1, h, n) {   // cincin tebal bersumbu y (selubung kipas ekor)
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832, b = (i + 1) / n * 6.2832, P = (r, t, y) => [c[0] + Math.cos(t) * r, c[1] + y, c[2] + Math.sin(t) * r];
      const ma = (a + b) / 2, out = [Math.cos(ma), 0, Math.sin(ma)];
      m.face([P(r1, a, -h), P(r1, b, -h), P(r1, b, h), P(r1, a, h)], out); m.face([P(r0, a, -h), P(r0, b, -h), P(r0, b, h), P(r0, a, h)], mul(out, -1));
      m.face([P(r0, a, h), P(r1, a, h), P(r1, b, h), P(r0, b, h)], [0, 1, 0]); m.face([P(r0, a, -h), P(r1, a, -h), P(r1, b, -h), P(r0, b, -h)], [0, -1, 0]);
    }
  }
  function ghost(m) {
    const A = MD.GHOST, BK = [22, 23, 25], GM = [50, 52, 56], DK = [12, 12, 13], RD = [178, 30, 24], GL = [12, 15, 18];
    const blk = () => m.set(BK, .5, K.PAINT, 0), gm = () => m.set(GM, .45, K.METAL), glass = () => m.set(GL, .97, K.GLASS);
    // badan bersegi siluman. Segmen 2–5 sisi atas (j 6, 7, 0) = lubang kokpit, ditutup kaca bersegi yang menempel persis pada badan.
    // Masuk lewat PINTU KACA kanan kursi depan (segmen 3, x 3,6 → 2,6; tulang 6) yang berengsel di tepi atas & membuka ke atas seperti sayap
    // camar (gaya Ka-52) — dulu seluruh kanopi terangkat ke belakang sebagai satu lempeng besar (aneh dilihat dari luar)
    const GS = [
      [6.35, sec8(.03, -.06, .04, -.08, .05, -.1, .03, -.13)],
      [5.75, sec8(.16, .22, .3, .08, .4, -.1, .16, -.38)],
      [4.7, sec8(.26, .55, .55, .3, .78, -.05, .34, -.55)],
      [3.6, sec8(.36, 1.16, .72, .42, .96, 0, .46, -.6)],
      [2.6, sec8(.403, 1.303, .791, .491, 1.017, .014, .517, -.614)],   // penampang sisipan (interpolasi 3,6 → 2,2): tepi belakang pintu kursi depan
      [2.2, sec8(.42, 1.36, .82, .52, 1.04, .02, .54, -.62)],
      [1.1, sec8(.42, 1.15, .84, .55, 1.08, .05, .56, -.6)],
      [-.6, sec8(.42, 1.2, .8, .6, 1.02, .1, .52, -.52)],
      [-2.4, sec8(.32, 1.0, .6, .6, .76, .28, .34, -.1)],
      [-4.2, sec8(.2, .92, .34, .75, .44, .55, .2, .3)],
      [-8.0, sec8(.13, 1.08, .22, .98, .3, .85, .13, .66)],
      [-8.6, sec8(.11, 1.1, .18, 1.02, .24, .92, .11, .76)]
    ];
    const CAN = (i, j) => i >= 2 && i <= 5 && (j === 0 || j === 6 || j === 7);
    blk(); loft(m, GS, (i, j) => { if (CAN(i, j)) return false; if (j === 2 && (i === 3 || i === 4 || i === 6)) m.set(GM, .45, K.PAINT, 0); else blk(); });
    const cp = (i, j) => [GS[i][0], GS[i][1][j][0], GS[i][1][j][1]];
    const bar = (p, q, r) => m.cyl(p, q, r || .022, r || .022, 4);
    m.set([10, 10, 11], .05, K.PLAIN).box([2.45, 0, .1], [.95, .38, .4]);   // v2.4: isi kokpit dihapus (panel & kursi menembus kaca); hanya bak gelap agar kaca tampak pekat & pintu terbuka tidak tembus langit
    // kaca kokpit tetap (tulang 0) + pintu kanan kursi depan (tulang 6). Rangka: ambang, tulang atap, busur antar-segmen; pintu punya bingkai sendiri
    const pane = (i, j) => {
      const k = (j + 1) % 8, Q = [cp(i, j), cp(i, k), cp(i + 1, k), cp(i + 1, j)];
      let nn = nrm(crs(sub(Q[2], Q[0]), sub(Q[3], Q[1]))); const mid = mul(add(add(Q[0], Q[1]), add(Q[2], Q[3])), .25); if (dot(nn, sub(mid, [mid[0], 0, .2])) < 0) nn = mul(nn, -1);
      m.face(Q.map(p => add(p, mul(nn, .012))), nn);
    };
    const DOOR = (i, j) => i === 3 && j === 0;
    glass(); for (let i = 2; i <= 5; i++) for (const j of [6, 7, 0]) if (!DOOR(i, j)) pane(i, j);
    gm(); for (let i = 2; i <= 5; i++) { if (i !== 3) bar(cp(i, 1), cp(i + 1, 1)); bar(cp(i, 6), cp(i + 1, 6)); bar(cp(i, 0), cp(i + 1, 0), .018); bar(cp(i, 7), cp(i + 1, 7), .018); }
    for (const i of [2, 3, 4, 5, 6]) { if (i !== 3 && i !== 4) bar(cp(i, 1), cp(i, 0), .03); bar(cp(i, 0), cp(i, 7), .03); bar(cp(i, 7), cp(i, 6), .03); }
    m.set(DK, .4, K.METAL); for (const i of [3, 4]) bar(add(cp(i, 1), [0, .01, -.02]), add(cp(i, 0), [0, .01, .0]), .034);   // pilar kusen pintu di badan (tempat pintu menutup)
    m.bone(6); glass(); pane(3, 0);   // PINTU: kaca + bingkai tebal + gagang luar + engsel di tepi atas
    gm(); bar(cp(3, 1), cp(4, 1), .03); bar(cp(3, 1), cp(3, 0), .028); bar(cp(4, 1), cp(4, 0), .028); bar(cp(3, 0), cp(4, 0), .024);
    m.set(DK, .5, K.METAL).box([2.85, .79, .55], [.1, .022, .025]);   // gagang pintu (dekat tepi bawah-belakang)
    m.set([120, 22, 18], .3, K.PAINT, 0).box([3.42, .775, .5], [.05, .012, .012]);   // garis pelepas darurat merah
    m.bone(0); m.set(DK, .5, K.METAL); for (const t of [.2, .8]) { const p = add(cp(3, 0), mul(sub(cp(4, 0), cp(3, 0)), t)); m.cyl(add(p, [0, -.02, .01]), add(p, [0, .03, .03]), .03, .03, 6); }   // engsel atas
    // pijakan naik lipat (tulang 7, terbuka bersama pintu) + gagang pegangan di badan
    m.bone(7); gm(); m.box([3.1, .98, -.42], [.22, .16, .025]); bar([2.95, .88, -.3], [2.95, 1.1, -.42], .02); bar([3.25, .88, -.3], [3.25, 1.1, -.42], .02); m.bone(0);
    // sensor elektro-optik di hidung (bola kaca gelap + lensa merah), radar tiang di atas rotor, pengacau IR, antena
    m.set(DK, .9, K.GLASS).sph([5.62, 0, -.12], [.27, .27, .24], 10, 5); m.set([150, 30, 20], .9, K.GLASS).box([5.87, .08, -.1], [.03, .06, .05]).box([5.86, -.09, -.12], [.03, .05, .06]);
    m.set(DK, .9, K.GLASS).sph([5.45, 0, .25], [.2, .2, .17], 8, 4);
    // punggung: rumah mesin bersudut, saluran masuk, knalpot celah siluman, pengacau IR
    blk(); m.box([-.9, 0, 1.42], [1.7, .56, .3]); m.box([.75, 0, 1.3], [.45, .45, .16]);
    m.set(DK, 0, K.PLAIN); for (const sd of [-1, 1]) { m.box([.5, sd * .565, 1.42], [.32, .01, .16]); m.box([-2.62, sd * .3, 1.42], [.03, .2, .1]); }
    gm(); for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) m.box([.24 + k * .13, sd * .572, 1.42], [.012, .006, .15]);   // kisi saluran masuk
    m.set([255, 110, 40], 0, K.EMIT); for (const sd of [-1, 1]) m.box([-2.645, sd * .3, 1.42], [.006, .17, .035]);   // celah knalpot berpendar
    m.set(RD, .3, K.PAINT, 0); for (const sd of [-1, 1]) m.box([-.9, sd * .565, 1.135], [1.6, .008, .012]);   // garis merah di rumah mesin
    m.set(DK, .9, K.GLASS).sph([-1.75, 0, 1.86], [.15, .15, .14], 8, 4); gm(); m.box([-4.6, 0, 1.0], [.18, .01, .12]).box([-3.2, 0, -.18], [.15, .01, .1]);   // pengacau IR + antena atas/bawah
    gm(); m.box([-2.1, 0, 1.78], [.25, .22, .08]);
    // nomor lambung "07" merah (tujuh segmen) di kedua sisi rumah mesin
    const SEG = { a: [.11, .4, 1], b: [.22, .3, 0], c: [.22, .1, 0], d: [.11, 0, 1], e: [0, .1, 0], f: [0, .3, 0] };
    m.set(RD, .3, K.PAINT, 0);
    for (const sd of [-1, 1]) {
      const dir = sd, y = sd * .565;   // y dunia = kanan: dari sisi kanan (+y) hidung tampak di kanan layar, jadi "0" di x lebih kecil
      [['abcdef', -.915 - sd * .165], ['abc', -.915 + sd * .165]].forEach(([segs, x0]) => { for (const s of segs) { const g = SEG[s], x = x0 + dir * (g[0] - .11); m.box([x, y, 1.24 + g[1]], g[2] ? [.1, .006, .02] : [.02, .006, .1]); } });
    }
    // tiang rotor, hub bersegi, rotor 5 bilah (tulang 5) + piringan kabur (tulang 3)
    gm(); m.cyl([0, 0, 1.6], [0, 0, 2.0], .2, .17, 8); m.set(DK, .5, K.METAL).cyl([0, 0, 1.96], [0, 0, 2.18], .46, .4, 6).sph([0, 0, 2.2], [.3, .3, .16], 6, 3, { hemi: true });
    gm(); m.cyl([0, 0, 2.2], [0, 0, 2.5], .07, .07, 6); m.set(DK, .5, K.PAINT, 0).sph([0, 0, 2.66], [.36, .36, .22], 10, 5); m.set(DK, .9, K.GLASS).box([.3, 0, 2.66], [.06, .16, .07]);   // radar & bidikan di atas tiang rotor
    m.bone(5); m.set([20, 20, 22], .3, K.METAL); for (let i = 0; i < 5; i++) { m.push(X.rz(i * 1.2566)); m.box([A.rotR / 2 + .25, 0, 2.08], [A.rotR / 2 - .05, .28, .03]); m.box([A.rotR - .05, .06, 2.08], [.25, .2, .03]); m.set(RD, .3, K.PAINT, 0).box([A.rotR + .21, .07, 2.08], [.04, .19, .032]); m.set([20, 20, 22], .3, K.METAL); m.pop(); }
    m.bone(3); m.set([30, 30, 32], .1, K.ROTOR, A.rotR).cyl([0, 0, 2.07], [0, 0, 2.09], A.rotR, A.rotR, 30);
    m.bone(0);
    // sayap pendek + pod rudal kotak di ujung (2×2 sel, hulu ledak merah) + pod roket segi enam di dalam
    blk(); for (const sd of [-1, 1]) m.box([.55, sd * 1.55, -.12], [.55, .6, .07]);
    for (const sd of [-1, 1]) {
      const yo = sd * A.hf[1], yi = sd * A.hy[1];
      gm(); m.box([.6, yo, -.25], [1.12, .27, .27]); m.box([1.78, yo, -.25], [.06, .23, .23]); blk(); m.box([.6, yo, .05], [.9, .2, .04]);
      m.set(DK, 0, K.PLAIN); for (const o of [-.12, .12]) for (const q of [-.12, .12]) { m.box([1.845, yo + o, -.25 + q], [.01, .09, .09]); }
      m.set(RD, .3, K.PLAIN); for (const o of [-.12, .12]) for (const q of [-.12, .12]) m.cyl([1.8, yo + o, -.25 + q], [1.9, yo + o, -.25 + q], .06, .02, 6);
      gm(); m.cyl([1.55, yi, -.42], [-.45, yi, -.42], .25, .25, 6); m.box([.55, yi, -.2], [.4, .05, .12]); m.set(DK, 0, K.PLAIN).cyl([1.56, yi, -.42], [1.57, yi, -.42], .2, .2, 6);
      m.set(sd > 0 ? [60, 255, 110] : [255, 50, 40], 0, K.EMIT).box([.6, sd * (A.hf[1] + .28), -.1], [.08, .015, .04]);
      // Stinger ATAS: tiang + 2 tabung abu muda bertumpuk, kepala pencari kaca gelap
      const ys = sd * A.st[1]; gm(); m.box([.55, sd * (A.hf[1] + .34), -.08], [.3, .12, .05]); m.box([.55, ys, -.08], [.55, .06, .2]);
      for (const q of [.11, -.11]) { m.set([168, 170, 160], .35, K.PAINT, 0).cyl([A.st[0], ys, A.st[2] + q], [-.35, ys, A.st[2] + q], .075, .075, 8); m.set(DK, .9, K.GLASS).sph([A.st[0] + .01, ys, A.st[2] + q], [.06, .068, .068], 6, 3); }
    }
    // meriam kembar 30 mm di turret dagu (tulang 2)
    m.bone(2); m.set(DK, .45, K.METAL).sph(A.gun, [.3, .3, .24], 10, 5); m.box([A.gun[0] + .25, 0, A.gun[2]], [.28, .2, .12]);
    for (const o of [-.09, .09]) { m.cyl([A.gun[0] + .3, o, A.gun[2]], [A.gun[0] + 1.9, o, A.gun[2]], .042, .042, 6); m.cyl([A.gun[0] + .3, o, A.gun[2]], [A.gun[0] + .95, o, A.gun[2]], .075, .075, 8); m.cyl([A.gun[0] + 1.85, o, A.gun[2]], [A.gun[0] + 2.0, o, A.gun[2]], .06, .06, 6); }
    m.bone(0);
    // roda pendarat utama + sirip bawah dengan roda ekor
    for (const sd of [-1, 1]) { gm(); m.cyl([2.6, sd * .45, -.55], [2.6, sd * .8, -1.2], .06, .06, 6); m.set(DK, .1, K.PLAIN).cyl([2.6, sd * .7, -1.18], [2.6, sd * .92, -1.18], .27, .27, 12); }
    blk(); m.ext([[-7.6, .72], [-8.3, .7], [-8.7, -.75], [-8.35, -.75]], -.05, .05); m.set(DK, .1, K.PLAIN).cyl([-8.55, -.08, -1.22], [-8.55, .08, -1.22], .23, .23, 10); gm(); m.cyl([-8.55, 0, -.75], [-8.55, 0, -1.1], .04, .04, 5);
    // ekor: selubung kipas (fenestron) + sirip tegak di atasnya + stabilisator dengan pelat ujung
    const T = A.tail; blk(); ring(m, T, .72, .98, .2, 20);
    m.ext([[-8.75, 2.35], [-9.15, 3.45], [-9.85, 3.55], [-10.1, 2.25]], -.07, .07); m.ext([[-8.4, 1.0], [-8.35, .62], [-10.0, 1.05], [-10.25, 1.5]], -.12, .12);
    for (const sd of [-1, 1]) { m.box([-8.05, sd * .78, .98], [.38, .52, .04]); m.box([-8.1, sd * 1.3, 1.08], [.32, .03, .2]); }
    m.set([255, 50, 40], 0, K.EMIT).box([-9.85, 0, 3.6], [.06, .05, .05]);
    m.bone(4); m.set([34, 34, 36], .3, K.METAL); for (let k = 0; k < 10; k++) { m.push(X.chain(X.T(...T), X.ry(k * .6283))); m.box([0, 0, .38], [.07, .02, .34]); m.pop(); }
    m.cyl([T[0], T[1] - .1, T[2]], [T[0], T[1] + .1, T[2]], .17, .17, 10);
    m.bone(0);
  }
  /* AH-64 Apache (heli tempur AI ATK2), skala nyata: x maju, y kanan (dunia), z naik, poros rotor di (0,0).
     badan bersegi delapan dipipihkan, kokpit tandem bertingkat (penembak di depan-bawah, pilot di belakang-atas), dua nacelle
     mesin + knalpot peredam, sayap pendek: pod roket Hydra (dalam) & rel 4 rudal Hellfire (luar), sensor TADS/PNVS di hidung,
     radome Longbow di atas rotor, meriam M230 30 mm di bawah (tulang 2, mengikuti bidikan), rotor 4 bilah (tulang 3),
     rotor ekor "gunting" di sisi kiri (tulang 4), roda pendarat. Roda menyentuh tanah pada z = −gear */
  MD.APACHE = { tail: [-9.15, .42, 1.75], gun: [2.55, 0, -.98], rotR: 7.3, gear: 1.78, nose: [5.2, 0, -.2] };
  function apache(m, b, d, paint) {
    const A = MD.APACHE, sq = { c: [[1, 0, 0], [0, .7, 0], [0, 0, 1]], t: [0, 0, 0] }, dk = [26, 27, 28], ms = [64, 68, 54];
    paint(b);
    m.push(X.chain(sq, X.ry(Math.PI / 2))); m.lathe([0, 0, 0], [[0, -5.3], [.42, -5.15], [.64, -4.5], [.8, -3.4], [.9, -2], [.95, -.4], [.9, 1], [.72, 2], [.5, 2.9], [.4, 4.6], [.33, 7.6], [.28, 9.2], [0, 9.4]], 8); m.pop();
    // kokpit tandem: kaca datar bersegi + rangka
    m.set(GLS, .95, K.GLASS).box([3.2, 0, .6], [.95, .44, .33]).box([1.55, 0, .86], [.72, .5, .42]);
    m.set(dk, .3, K.METAL); for (const x of [2.26, 2.83, 3.75]) m.box([x, 0, x > 2.5 ? .66 : .9], [.035, x > 2.5 ? .45 : .51, x > 2.5 ? .32 : .41]); m.box([1.55, 0, 1.29], [.72, .05, .02]); m.box([3.2, 0, .94], [.95, .04, .02]);
    // hidung: TADS (bola sensor berjendela gelap) + PNVS di atasnya
    m.set(dk, .35, K.METAL).sph([5.0, 0, -.2], [.42, .42, .4], 10, 6); m.sph([4.95, 0, .32], [.24, .24, .2], 8, 4);
    m.set(GLS, .95, K.GLASS).box([5.39, .15, -.18], [.05, .1, .13]).box([5.39, -.16, -.24], [.05, .12, .1]).box([5.16, 0, .34], [.05, .09, .07]);
    // nacelle mesin + saluran masuk + knalpot "black hole" menyerong keluar
    for (const sd of [-1, 1]) {
      paint(b); m.cyl([1.05, sd * 1, .68], [-1.75, sd * 1, .74], .44, .4, 10); m.box([-.3, sd * .7, .52], [1.15, .32, .26]);
      m.set([14, 14, 15], 0, K.PLAIN).cyl([1.07, sd * 1, .68], [1.09, sd * 1, .68], .36, .36, 10);
      m.set(d, .3, K.METAL).cyl([-1.75, sd * 1, .74], [-2.35, sd * 1.32, .9], .36, .3, 8);
    }
    paint(b); m.box([-.7, 0, 1.12], [1.35, .52, .24]); m.box([2.1, 0, -.82], [.9, .42, .1]);   // fairing punggung, perut
    m.set(d, .3, K.METAL).box([-2.05, 0, 1.38], [.2, .2, .2]);                               // pengacau inframerah
    // tiang rotor, hub, radome Longbow
    m.set(d, .3, K.METAL).cyl([0, 0, .9], [0, 0, 2.05], .2, .17, 8).cyl([0, 0, 1.95], [0, 0, 2.27], .38, .38, 8).cyl([0, 0, 2.27], [0, 0, 2.42], .12, .12, 6);
    m.set([118, 120, 114], .2, K.PLAIN).sph([0, 0, 2.6], [.64, .64, .27], 12, 5);
    // sayap pendek + lampu navigasi + pylon
    paint(b); m.box([.05, 0, .12], [.55, 2.62, .07]);
    m.set(d, .3, K.METAL); for (const sd of [-1, 1]) { m.box([.05, sd * 2.66, .12], [.36, .06, .13]); for (const y of [1.35, 2.18]) m.box([.12, sd * y, -.1], [.38, .06, .17]); }
    m.set([255, 50, 40], 0, K.EMIT).box([.12, -2.73, .12], [.07, .02, .05]); m.set([60, 255, 110], 0, K.EMIT).box([.12, 2.73, .12], [.07, .02, .05]);   // merah kiri, hijau kanan (y dunia = kanan)
    for (const sd of [-1, 1]) {
      const yi = sd * 1.35, yo = sd * 2.18;
      paint(ms); m.cyl([1.0, yi, -.45], [-.85, yi, -.45], .23, .23, 10); m.cyl([1.0, yi, -.45], [1.22, yi, -.45], .23, .15, 10);   // pod Hydra 19 tabung
      m.set([16, 16, 16], 0, K.PLAIN).cyl([1.23, yi, -.45], [1.24, yi, -.45], .14, .14, 10);
      m.set(d, .3, K.METAL).box([.2, yo, -.32], [.82, .25, .045]);                                                                        // rel Hellfire
      for (const yy of [yo - .13, yo + .13]) for (const zz of [-.5, -.15]) {
        m.set([58, 62, 50], .2, K.PAINT, 0).cyl([1.0, yy, zz], [-.62, yy, zz], .09, .09, 8); m.cyl([1.0, yy, zz], [1.3, yy, zz], .09, .012, 8);
        m.set([150, 40, 30], .1, K.PLAIN).cyl([.62, yy, zz], [.66, yy, zz], .093, .093, 8);   // cincin hulu ledak
      }
    }
    // roda pendarat utama & roda ekor
    for (const sd of [-1, 1]) { m.set(d, .3, K.METAL).cyl([2.0, sd * .55, -.6], [2.05, sd * 1.06, -1.45], .07, .07, 6); m.set([22, 22, 22], .1, K.PLAIN).cyl([2.05, sd * .96, -1.46], [2.05, sd * 1.2, -1.46], .32, .32, 12); }
    m.set(d, .3, K.METAL).cyl([-8.2, 0, -.2], [-8.3, 0, -1.45], .06, .06, 6); m.set([22, 22, 22], .1, K.PLAIN).cyl([-8.3, -.08, -1.6], [-8.3, .08, -1.6], .18, .18, 10);
    // ekor: sirip tegak menyapu ke belakang + stabilator
    paint(b); m.ext([[-8.25, .15], [-8.85, 2.35], [-9.6, 2.45], [-9.55, .15]], -.07, .07); m.box([-9.0, 0, .02], [.45, 1.72, .04]);
    m.set([255, 60, 50], 0, K.EMIT).box([-9.55, 0, 2.5], [.06, .05, .05]);   // lampu anti-tabrakan
    // meriam rantai M230 di turret bawah (tulang 2)
    m.bone(2); m.set(dk, .35, K.METAL).sph(A.gun, [.3, .3, .24], 10, 5);
    m.cyl([A.gun[0], 0, A.gun[2] - .04], [A.gun[0] + 1.75, 0, A.gun[2] - .04], .045, .045, 6).cyl([A.gun[0] + .15, 0, A.gun[2] - .04], [A.gun[0] + 1.05, 0, A.gun[2] - .04], .09, .09, 8);
    // rotor utama 4 bilah (tulang 5: memendek ke hub saat berputar penuh) + piringan kabur (tulang 3)
    m.bone(5); m.set([30, 30, 32], .2, K.METAL); for (let i = 0; i < 4; i++) { m.push(X.rz(i * Math.PI / 2)); m.box([A.rotR / 2 + .2, 0, 2.18], [A.rotR / 2, .27, .03]); m.pop(); }
    m.bone(3); m.set([40, 40, 42], .1, K.ROTOR, A.rotR).cyl([0, 0, 2.17], [0, 0, 2.19], A.rotR, A.rotR, 28);
    // rotor ekor "gunting": dua pasang bilah bersilang ±55° (tulang 4)
    m.bone(4); m.set([30, 30, 32], .2, K.METAL); for (const a of [0, .96, Math.PI, Math.PI + .96]) { m.push(X.chain(X.T(...A.tail), X.ry(a))); m.box([0, 0, .72], [.11, .025, .72]); m.pop(); }
    m.cyl([A.tail[0], A.tail[1] - .1, A.tail[2]], [A.tail[0], A.tail[1] + .06, A.tail[2]], .14, .14, 8);
    m.bone(0);
  }
  function wing(m, xr, y0, span, xt, xte, th) {   // sayap kiri+kanan: akar (xr..xte) di y0, ujung (xt) di span
    for (const sd of [-1, 1]) for (const z of [-th, th]) {
      const pts = [[xr, sd * y0, z], [xt, sd * span, z], [xt - 1.6, sd * span, z], [xte, sd * y0, z]];
      m.face(z > 0 === sd > 0 ? pts : pts.slice().reverse(), [0, 0, z > 0 ? 1 : -1]);
    }
    m.face([[xt, span, th], [xt, span, -th], [xt - 1.6, span, -th], [xt - 1.6, span, th]], [0, 1, 0]); m.face([[xt, -span, th], [xt - 1.6, -span, th], [xt - 1.6, -span, -th], [xt, -span, -th]], [0, -1, 0]);
  }
  MD.ship = function (type, palK) {
    const m = new Mesh(), s = type === 'SHIP' ? 2.2 : 1, g = palK === 'R' ? [112, 114, 118] : [140, 148, 150], d = [64, 68, 72];
    m.bone(0).set(g, .3, K.PAINT, 0);
    m.ext([[-8 * s, -1], [-8.4 * s, 2], [10 * s, 2.2], [11 * s, 1], [6 * s, -1]], -1.6 * s, 1.6 * s);
    m.set(d, .2, K.PLAIN).box([0, 0, 2.25], [9 * s, 1.5 * s, .05]);
    m.set(g, .3, K.PAINT).box([-1 * s, 0, 3.2], [3 * s, 1.1 * s, 1]); m.box([-1 * s, 0, 4.6], [1.5 * s, .8 * s, .5]);
    m.set(GLS, .9, K.GLASS).box([.5 * s, 0, 4.7], [.02, .7 * s, .2]);
    m.set(d, .3, K.METAL).cyl([-1 * s, 0, 5], [-1 * s, 0, 8 * s * .7], .12, .08, 6).box([-1 * s, 0, 7.5 * s * .7], [.1, .9, .1]);
    m.set(g, .3, K.PAINT).sph([5 * s, 0, 2.3], [.8 * s, .8 * s, .6 * s], 10, 4, { hemi: true }); m.set(d, .3, K.METAL).cyl([5.5 * s, 0, 2.6], [8 * s, 0, 2.7], .1, .08, 6);
    return m.done();
  };
  MD.structure = function (type, team) {
    const m = new Mesh(), red = team === 'R', wall = red ? [124, 108, 96] : [150, 154, 150], roof = red ? [86, 70, 62] : [92, 100, 104];
    m.bone(0);
    if (type === 'HQ') {
      m.set(wall, .1, K.FACADE, 2.5).box([0, 0, 3.6], [8, 6, 3.6], { topK: K.CONC }); m.set(roof, .1, K.CONC).box([0, 0, 7.35], [8.4, 6.4, .25]);
      m.set([60, 60, 62], .4, K.METAL).cyl([-3, 0, 7.5], [-3, 0, 17], .15, .08, 6); m.cyl([6, 0, 7.5], [6, 0, 16], .08, .06, 6);
      m.set(red ? [220, 40, 40] : [230, 230, 230], .1, K.CLOTH).box([6, 1, 15.3], [.03, .95, .6]);
      if (!red) m.set([220, 40, 40], .1, K.CLOTH).box([6.01, 1, 15.6], [.03, .95, .3]);
      m.set([170, 150, 110], .05, K.PLASTER, 1); for (const [x, y, hx, hy] of [[11, 0, .6, 9], [-11, 0, .6, 9], [0, 10, 11, .6], [0, -10, 11, .6]]) m.box([x, y, .6], [hx, hy, .6]);
      m.set([90, 96, 92], .1, K.CONC).box([0, 0, .05], [7, 5.5, .05]);
    } else if (type === 'BNK') {
      m.set([150, 146, 136], .05, K.CONC).box([0, 0, 1], [4, 3.2, 1]); m.box([0, 0, 2.15], [4.3, 3.5, .18]);
      m.set([16, 16, 16], 0, K.PLAIN).box([4.01, 0, 1.4], [.02, 2.3, .22]).box([0, 3.21, 1.4], [3, .02, .2]).box([0, -3.21, 1.4], [3, .02, .2]).box([-4.01, 0, 1.4], [.02, 2.3, .22]);
      m.set([168, 150, 110], .05, K.PLASTER, 1); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; m.box([Math.cos(a) * 5.5, Math.sin(a) * 5, .45], [.9, .4, .45]); }
    } else if (type === 'SENTRY') {   // turet jaga tripod + SMB + laser bidik merah
      m.set([40, 42, 40], .3, K.METAL); for (let i = 0; i < 3; i++) { const a = i * 2.094; m.cyl([0, 0, .9], [Math.cos(a) * .7, Math.sin(a) * .7, 0], .03, .03, 5); }
      m.bone(1).set([74, 78, 66], .25, K.PAINT, 1).box([0, 0, 1.05], [.32, .26, .18]); m.set([40, 40, 40], .3, K.METAL).box([-.05, .3, 1.1], [.15, .06, .12]);
      m.set([255, 40, 30], 0, K.EMIT).box([.33, 0, 1.16], [.01, .04, .02]);
      m.bone(2).set([30, 30, 30], .4, K.METAL).cyl([.2, 0, 1.08], [1.0, 0, 1.08], .035, .03, 6);
    } else if (type === 'SAM') {
      m.set([90, 94, 78], .2, K.PAINT, 1).box([0, 0, .6], [3, 2.2, .6]); m.bone(1); m.set([84, 88, 72], .2, K.PAINT, 1).box([0, 0, 1.6], [1, 1.6, .4]);
      m.set([200, 200, 196], .4, K.METAL); for (let i = -1; i <= 1; i += 2) for (let j = 0; j < 2; j++) { m.push(X.chain(X.T(-.6, i * .55, 2.1 + j * .55), X.ry(.7))); m.cyl([0, 0, 0], [3.2, 0, 0], .2, .2, 8); m.cyl([3.2, 0, 0], [3.6, 0, 0], .2, 0, 8); m.pop(); }
      m.bone(4).set([60, 60, 60], .3, K.METAL).box([-2.2, 0, 3.2], [.1, 1.2, .8]);
    } else if (type === 'CAESAR') {   // meriam 155 mm CAESAR terpasang: landasan beton, cincin karung pasir, dudukan putar (tulang 1), laras 52 kaliber + rem moncong (tulang 2, poros MD.CAE.gp)
      const G = MD.CAE.gp, OL = [92, 106, 70], OD = [62, 70, 50];
      m.set([138, 136, 128], .05, K.CONC).box([0, 0, .12], [5, 4, .12]);
      m.set([168, 150, 110], .05, K.PLASTER, 1); for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; m.box([Math.cos(a) * 6.4, Math.sin(a) * 5.4, .5], [1.1, .5, .5]); }
      m.set(OD, .3, K.METAL); for (const sd of [-1, 1]) { m.cyl([-1, sd * .6, .6], [-5.2, sd * 1.9, .15], .12, .12, 6); m.box([-5.3, sd * 1.95, .2], [.35, .3, .2]); }   // kaki penyangga + sekop
      m.set([80, 72, 52], .1, K.PAINT, 0); for (let i = 0; i < 4; i++) m.box([2.6, -3 + i * .7, .45], [.5, .3, .3]);   // peti amunisi
      m.bone(1); m.set(OL, .2, K.PAINT, 1).cyl([0, 0, .25], [0, 0, .9], 1.5, 1.5, 16); m.box([-.3, 0, 1.45], [1.6, 1, .55]);
      for (const sd of [-1, 1]) m.box([G[0], sd * .75, G[2] - .2], [.6, .12, .6]);   // pipi dudukan laras
      m.set(OD, .3, K.METAL).box([-1.2, -1.15, 1.6], [.5, .15, .45]); m.cyl([-1.4, 1.1, 1.9], [-1.4, 1.1, 2.6], .05, .05, 5);   // panel tembak & antena
      m.bone(2); m.set(OL, .25, K.PAINT, 1).box([G[0] - .6, 0, G[2]], [.9, .55, .45]);   // blok sungsang
      m.set(OD, .4, K.METAL).cyl([G[0], 0, G[2]], [G[0] + 8.2, 0, G[2]], .19, .15, 10);
      for (const sd of [-1, 1]) m.cyl([G[0] + .2, sd * .32, G[2] + .3], [G[0] + 2.6, sd * .32, G[2] + .3], .09, .09, 6);   // silinder hentak
      m.set([40, 42, 40], .4, K.METAL).box([G[0] + 8.45, 0, G[2]], [.3, .32, .24]); m.set([10, 10, 10], 0, K.PLAIN).box([G[0] + 8.76, 0, G[2]], [.01, .14, .14]);   // rem moncong
    } else if (type === 'ARMORY') {   // meja senjata markas (fps-kit): tenda jaring kamuflase, meja kayu, papan gantung, M4A1 + kedelapan lampiran dipajang di meja (sisi tampilan menghadap +x)
      const BL = [28, 29, 31], OL = [84, 92, 62], WD = [128, 98, 64];
      m.set([96, 90, 74], .05, K.PLAIN).box([0, 0, .02], [1.15, 1.85, .02]);
      m.set([52, 54, 50], .3, K.METAL); for (const [x, y] of [[-1.1, -1.75], [-1.1, 1.75], [1.1, -1.75], [1.1, 1.75]]) m.cyl([x, y, 0], [x, y, 2.55], .04, .035, 6);
      m.set(OL, .03, K.CLOTH, 0).box([0, 0, 2.58], [1.25, 1.9, .03]); for (const s of [-1, 1]) m.box([s * 1.26, 0, 2.4], [.02, 1.9, .18]);
      m.set([255, 196, 40], .2, K.EMIT).box([1.29, 0, 2.38], [.015, .7, .1]);   // papan tanda kuning menyala: mudah dicari dari jauh
      m.set(WD, .08, K.PAINT, 0).box([0, 0, .88], [.45, 1.3, .035]); m.box([0, 0, .32], [.4, 1.2, .02]);
      m.set(BL, .3, K.METAL); for (const [x, y] of [[-.38, -1.2], [-.38, 1.2], [.38, -1.2], [.38, 1.2]]) m.cyl([x, y, 0], [x, y, .85], .03, .03, 6);
      m.set([70, 74, 60], .05, K.PAINT, 0).box([-.52, 0, 1.4], [.03, 1.3, .5]); m.set(BL, .3, K.METAL).box([-.52, 0, 1.92], [.04, 1.32, .03]);
      m.set(BL, .25, K.METAL); for (const y of [-.65, .65]) { m.box([-.48, y, 1.42], [.02, .42, .028]); m.box([-.48, y - .48, 1.36], [.02, .12, .05]); m.box([-.48, y - .12, 1.33], [.02, .015, .06]); }   // senapan tergantung di papan
      const T = .915, G = [34, 35, 37];
      m.set(G, .3, K.METAL).box([.05, -.22, T + .035], [.022, .2, .03]); m.cyl([.05, -.02, T + .045], [.05, .42, T + .045], .009, .009, 6);   // M4A1 tergeletak
      m.box([.05, -.56, T + .03], [.022, .14, .035]); m.box([.11, -.2, T + .025], [.06, .016, .012]); m.box([.05, .08, T + .04], [.026, .12, .026]);
      m.set(G, .3, K.METAL).cyl([.3, .5, T + .03], [.3, .64, T + .03], .021, .021, 10); m.box([.3, .57, T + .006], [.012, .03, .006]);   // ACOG
      m.set([200, 60, 40], .4, K.EMIT).box([.3, .57, T + .054], [.004, .03, .004]);
      m.set(G, .3, K.METAL).cyl([.3, .78, T + .02], [.3, 1.04, T + .02], .014, .014, 8); m.cyl([.3, 1.04, T + .02], [.3, 1.1, T + .02], .014, .02, 8);   // teropong menengah
      m.cyl([.1, .62, T + .028], [.1, .98, T + .028], .015, .015, 8); m.cyl([.1, .98, T + .028], [.1, 1.12, T + .028], .015, .03, 10); m.cyl([.1, .78, T + .043], [.1, .78, T + .07], .011, .011, 6);   // teropong jauh
      m.cyl([.15, .46, T + .02], [.15, .62, T + .02], .019, .019, 10);   // peredam
      m.set(G, .2, K.METAL).box([.32, -.55, T + .08], [.014, .035, .08]); m.box([.32, -.72, T + .055], [.014, .035, .055]); m.box([.32, -.79, T + .055], [.014, .035, .055]);   // magasin panjang + dua magasin
      m.set([150, 136, 84], .05, K.CLOTH).box([.32, -.755, T + .07], [.017, .075, .01]);   // lakban
      m.set([84, 88, 66], .1, K.PAINT, 0).box([.32, -.25, T + .022], [.03, .04, .022]); m.set([220, 50, 40], .4, K.EMIT).box([.351, -.25, T + .03], [.002, .008, .008]);   // modul laser
      m.set(G, .2, K.METAL).cyl([.33, .2, T], [.33, .2, T + .1], .016, .015, 8);   // pegangan depan
      m.set([70, 78, 52], .1, K.PAINT, 0).box([.1, 1.66, .25], [.32, .22, .25]).box([.05, -1.68, .2], [.3, .2, .2]).box([.05, -1.68, .52], [.24, .16, .12]);   // peti amunisi
    } else if (type === 'MGN') {   // sarang senapan mesin (kelas MG42): karung pasir tapal kuda terbuka di belakang, tripod + SMB berputar (tulang 1/2, poros MD.MGN.gp)
      const G = MD.MGN.gp;
      m.set([168, 150, 110], .05, K.PLASTER, 1);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 11; i++) { const a = -2.4 + i * .48 + j * .24; m.push(X.chain(X.T(Math.cos(a) * 2.3, Math.sin(a) * 2.3, .2 + j * .38), X.rz(a))); (m.sq ? m.sq([0, 0, 0], [.3, .6, .19], 3.2, 8, 4) : m.box([0, 0, 0], [.3, .6, .19])); m.pop(); }
      m.set([120, 110, 84], .05, K.PLAIN).box([0, 0, .03], [1.7, 1.7, .03]);
      m.bone(1); m.set([40, 42, 40], .3, K.METAL); for (let i = 0; i < 3; i++) { const a = i * 2.094 + .5; m.cyl([G[0], 0, G[2] - .05], [G[0] + Math.cos(a) * .7, Math.sin(a) * .7, .05], .03, .03, 5); }
      m.set([70, 74, 60], .2, K.PAINT, 0).box([G[0] - .15, -.3, G[2] - .05], [.18, .12, .12]);   // kotak sabuk peluru
      m.bone(2); m.set([34, 34, 34], .4, K.METAL).box([G[0] - .1, 0, G[2]], [.45, .07, .09]);   // badan senapan
      m.set([60, 50, 38], .2, K.PLAIN).box([G[0] - .75, 0, G[2] - .02], [.22, .04, .07]);   // popor
      m.set([30, 30, 30], .4, K.METAL).cyl([G[0] + .35, 0, G[2] + .01], [G[0] + 1.15, 0, G[2] + .01], .045, .045, 8).cyl([G[0] + 1.15, 0, G[2] + .01], [G[0] + 1.3, 0, G[2] + .01], .03, .03, 6);   // selubung berlubang + laras
    }
    return m.done();
  };
  MD.chute = function () {
    const m = new Mesh(); m.set([214, 208, 190], .05, K.CLOTH, 0); m.sph([0, 0, 3.4], [3.4, 3.4, 1.4], 16, 4, { hemi: true });
    // sisi dalam kanopi (normal menghadap ke bawah) agar terlihat terang dari bawah; panel kain berselang-seling
    const G = 16, R = 4, rr = [3.36, 3.36, 1.37];
    for (let i = 0; i < G; i++) {
      m.set(i % 2 ? [236, 230, 212] : [150, 158, 112], .03, K.CANOPY, 0);
      const id = [];
      for (let j = 0; j <= R; j++) for (let s = 0; s <= 1; s++) { const t = (i + s) / G * 6.2832, ph = j / R * Math.PI / 2, cp = Math.cos(ph), sp = Math.sin(ph), d = [Math.cos(t) * cp, Math.sin(t) * cp, sp]; id.push(m.V([d[0] * rr[0], d[1] * rr[1], 3.4 + d[2] * rr[2]], [-d[0] * .35, -d[1] * .35, -1])); }
      for (let j = 0; j < R; j++) m.quad(id[j * 2], id[j * 2 + 2], id[j * 2 + 3], id[j * 2 + 1]);
    }
    m.set([60, 60, 60], .1, K.PLAIN); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; m.cyl([0, 0, 1.6], [Math.cos(a) * 3.2, Math.sin(a) * 3.2, 3.4], .01, .01, 3, { cap0: false, cap1: false }); }
    return m.done();
  };
  MD.unitBox = function () { const m = new Mesh(); m.set([255, 255, 255], .2, K.PLAIN); m.box([0, 0, 0], [1, 1, 1], { bot: true }); return m.done(); };
  MD.flag = function () { const m = new Mesh(); m.set([180, 180, 180], .5, K.METAL).cyl([0, 0, 0], [0, 0, 10], .07, .05, 6); m.set([255, 255, 255], .05, K.CLOTH, 9).box([0, 1.3, 8.9], [.02, 1.25, .8]); return m.done(); };

  /* ============================================================
     KOTA: gedung per gaya + properti (satu mesh statis per kota)
     facade param: bilangan bulat = gaya jendela, pecahan = benih lampu
     ============================================================ */
  const WALLS = {
    downtown: [[176, 172, 164], [150, 150, 148], [196, 188, 172]], modern: [[214, 206, 190], [196, 200, 204], [222, 214, 196], [180, 170, 160]],
    oldtown: [[218, 196, 156], [196, 150, 120], [222, 214, 190], [176, 186, 160], [210, 176, 140]], kampung: [[232, 228, 214], [214, 220, 196], [236, 214, 182], [200, 220, 224], [226, 196, 184]],
    desert: [[206, 176, 136], [196, 168, 128], [220, 194, 154]], industrial: [[140, 144, 146], [120, 126, 120], [156, 140, 120], [110, 120, 136]], base: [[156, 160, 148], [130, 136, 120]]
  };
  MD.city = function (w, city) {
    const m = new Mesh(), ci = w.cities.indexOf(city);
    for (const b of w.blds) if (b.ci === ci) building(m, b, w);
    for (const p of w.props) if (p.ci === ci) propMesh(m, p);
    return m.done();
  };
  function building(m, b, w) {
    const R = j => hsh(b.seed + j * 7919, 13), wc = WALLS[b.st] || WALLS.base, col = wc[Math.floor(R(1) * wc.length)].slice(), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2;
    const z0 = b.gmin - 1.2, top = b.gz + b.h, sd = R(2);
    const body = (k, sty, c, x, y, ax, ay, zb, zt, tk) => { m.set(c, .08, k, sty + sd * .99); m.box([x, y, (zb + zt) / 2], [ax, ay, (zt - zb) / 2], { topK: tk === undefined ? K.CONC : tk, vz: b.gz }); };
    const parapet = (x, y, ax, ay, z, c) => { m.set(c, .05, K.CONC); m.box([x, y + ay - .12, z + .45], [ax, .12, .45]); m.box([x, y - ay + .12, z + .45], [ax, .12, .45]); m.box([x + ax - .12, y, z + .45], [.12, ay - .24, .45]); m.box([x - ax + .12, y, z + .45], [.12, ay - .24, .45]); };
    const rooftop = (x, y, ax, ay, z) => {
      m.set([150, 152, 150], .3, K.METAL); for (let i = 0; i < 1 + Math.floor(R(5) * 3); i++) m.box([x + (R(6 + i) - .5) * ax, y + (R(9 + i) - .5) * ay, z + .5], [.8, .6, .5]);
      if (R(12) < .5) { m.set([90, 96, 104], .4, K.METAL).cyl([x - ax * .5, y + ay * .4, z], [x - ax * .5, y + ay * .4, z + 1.8], .9, .9, 10); }
      if (R(13) < .35) m.set([60, 60, 62], .5, K.METAL).cyl([x + ax * .4, y - ay * .4, z], [x + ax * .4, y - ay * .4, z + 4 + R(14) * 4], .06, .03, 4);
    };
    const gable = (x, y, ax, ay, z, rh, c, alongX) => {   // atap pelana genteng
      m.set(c, .12, K.TILE, 0); const o = .5;
      if (alongX) { m.face([[x - ax - o, y - ay - o, z], [x + ax + o, y - ay - o, z], [x + ax + o, y, z + rh], [x - ax - o, y, z + rh]]); m.face([[x + ax + o, y + ay + o, z], [x - ax - o, y + ay + o, z], [x - ax - o, y, z + rh], [x + ax + o, y, z + rh]]); m.set(col, .05, K.PLASTER, 0); m.face([[x - ax, y + ay, z], [x - ax, y - ay, z], [x - ax, y, z + rh]]); m.face([[x + ax, y - ay, z], [x + ax, y + ay, z], [x + ax, y, z + rh]]); }
      else { m.face([[x - ax - o, y + ay + o, z], [x - ax - o, y - ay - o, z], [x, y - ay - o, z + rh], [x, y + ay + o, z + rh]]); m.face([[x + ax + o, y - ay - o, z], [x + ax + o, y + ay + o, z], [x, y + ay + o, z + rh], [x, y - ay - o, z + rh]]); m.set(col, .05, K.PLASTER, 0); m.face([[x - ax, y - ay, z], [x + ax, y - ay, z], [x, y - ay, z + rh]]); m.face([[x + ax, y + ay, z], [x - ax, y + ay, z], [x, y + ay, z + rh]]); }
    };
    const hip = (x, y, ax, ay, z, rh, c) => {   // atap perisai (kampung)
      m.set(c, .12, K.TILE, 0); const o = .7, r = Math.min(ax, ay) * .8;
      const A = [x - ax - o, y - ay - o, z], B2 = [x + ax + o, y - ay - o, z], C2 = [x + ax + o, y + ay + o, z], D = [x - ax - o, y + ay + o, z];
      const ax2 = Math.max(0, ax - r), ay2 = Math.max(0, ay - r), E = [x - ax2, y - ay2, z + rh], Fp = [x + ax2, y - ay2, z + rh], Gp = [x + ax2, y + ay2, z + rh], Hp = [x - ax2, y + ay2, z + rh];
      m.face([A, B2, Fp, E]); m.face([B2, C2, Gp, Fp]); m.face([C2, D, Hp, Gp]); m.face([D, A, E, Hp]); if (ax2 > 0 || ay2 > 0) m.face([E, Fp, Gp, Hp], [0, 0, 1]);
    };
    const k = b.kind;
    if (k === 'glass') {
      const pod = b.gz + 7.2; body(K.FACADE, 1, [120, 118, 112], cx, cy, hx, hy, z0, pod);
      const ix = Math.max(3, hx - 1.6), iy = Math.max(3, hy - 1.6), tint = [[86, 110, 128], [70, 96, 96], [110, 112, 120], [60, 80, 104]][Math.floor(R(3) * 4)];
      body(K.GLASS, 0, tint, cx, cy, ix, iy, pod, top); m.set([90, 92, 96], .3, K.METAL); m.box([cx, cy, top + .6], [ix * .6, iy * .6, .6]); rooftop(cx, cy, ix * .8, iy * .8, top + 1.2);
    } else if (k === 'office') { body(K.FACADE, 2, col, cx, cy, hx, hy, z0, top); parapet(cx, cy, hx, hy, top, col.map(c => c * .9)); rooftop(cx, cy, hx * .7, hy * .7, top); }
    else if (k === 'apart') {
      body(K.FACADE, 3, col, cx, cy, hx, hy, z0, top); parapet(cx, cy, hx, hy, top, col.map(c => c * .92));
      m.set([200, 200, 196], .08, K.CONC); const ax = hx > hy;   // balkon di sisi panjang
      for (let f = 1; f < b.fl; f++) { const z = b.gz + f * 3.1; if (ax) { m.box([cx, cy + hy + .6, z], [hx * .8, .6, .08]); m.set([60, 64, 66], .4, K.METAL).box([cx, cy + hy + 1.18, z + .5], [hx * .8, .03, .45]); m.set([200, 200, 196], .08, K.CONC); } else { m.box([cx + hx + .6, cy, z], [.6, hy * .8, .08]); m.set([60, 64, 66], .4, K.METAL).box([cx + hx + 1.18, cy, z + .5], [.03, hy * .8, .45]); m.set([200, 200, 196], .08, K.CONC); } }
      rooftop(cx, cy, hx * .6, hy * .6, top);
    } else if (k === 'house') {
      body(K.FACADE, 4, col, cx, cy, hx, hy, z0, top, K.TILE); gable(cx, cy, hx, hy, top, b.roofH, [[150, 70, 50], [120, 60, 48], [96, 90, 92]][Math.floor(R(4) * 3)], hx > hy);
      m.set([150, 140, 130], .05, K.PLASTER, 1).box([cx + hx * .5, cy + hy * .4, top + b.roofH * .7], [.35, .35, b.roofH * .7]);
    } else if (k === 'kamp' || k === 'mosque') {
      const swamp = w.BI[Math.floor(cy / F.TX) * F.NX + Math.floor(cx / F.TX)] === W.BIO.SWAMP, base = swamp ? b.gz + 1.1 : z0;
      if (swamp) { m.set([92, 74, 54], .05, K.BARK, 0); for (const sx of [-1, 1]) for (const sy of [-1, 1]) m.cyl([cx + sx * (hx - .3), cy + sy * (hy - .3), z0], [cx + sx * (hx - .3), cy + sy * (hy - .3), base + .1], .12, .12, 5); }
      body(K.FACADE, 5, col, cx, cy, hx, hy, base, top, K.TILE);
      if (k === 'mosque') { m.set([60, 140, 110], .5, K.METAL).sph([cx, cy, top], [Math.min(hx, hy) * .8, Math.min(hx, hy) * .8, Math.min(hx, hy) * .9], 14, 6, { hemi: true }); m.set([232, 228, 214], .05, K.PLASTER, 0).cyl([cx + hx, cy + hy, z0], [cx + hx, cy + hy, top + 9], .7, .55, 10); m.set([60, 140, 110], .5, K.METAL).cyl([cx + hx, cy + hy, top + 9], [cx + hx, cy + hy, top + 11], .65, 0, 10); }
      else { hip(cx, cy, hx, hy, top, b.roofH, [[176, 84, 52], [150, 70, 44], [120, 104, 96], [168, 96, 60]][Math.floor(R(4) * 4)]); m.set([110, 84, 60], .05, K.BARK, 0); if (R(5) < .6) { const y = cy - hy - 1.1; m.cyl([cx - hx * .6, y, b.gz], [cx - hx * .6, y, top], .08, .08, 5); m.cyl([cx + hx * .6, y, b.gz], [cx + hx * .6, y, top], .08, .08, 5); } }
    } else if (k === 'adobe' || k === 'dome') {
      body(K.PLASTER, 0, col, cx, cy, hx, hy, z0, top, K.PLASTER); m.set(col.map(c => c * .5), 0, K.PLAIN);
      for (let f = 0; f < b.fl; f++) for (let i = -1; i <= 1; i += 2) { m.box([cx + hx + .01, cy + i * hy * .45, b.gz + f * 3.2 + 1.8], [.02, .35, .45]); m.box([cx - hx - .01, cy + i * hy * .45, b.gz + f * 3.2 + 1.8], [.02, .35, .45]); m.box([cx + i * hx * .45, cy + hy + .01, b.gz + f * 3.2 + 1.8], [.35, .02, .45]); m.box([cx + i * hx * .45, cy - hy - .01, b.gz + f * 3.2 + 1.8], [.35, .02, .45]); }
      m.box([cx, cy - hy - .02, b.gz + 1.1], [.6, .03, 1.1]);
      m.set(col.map(c => c * .95), .05, K.PLASTER, 0); parapet(cx, cy, hx, hy, top - .3, col.map(c => c * .95));
      m.set([96, 70, 44], .05, K.BARK, 0); for (let i = 0; i < 4; i++) m.box([cx - hx + (i + .5) * hx / 2, cy - hy - .3, top - .5], [.08, .35, .08]);
      if (k === 'dome') m.set([226, 222, 214], .2, K.PLASTER, 0).sph([cx, cy, top], [Math.min(hx, hy) * .75, Math.min(hx, hy) * .75, Math.min(hx, hy) * .7], 12, 5, { hemi: true });
    } else if (k === 'hall' || k === 'saw' || k === 'plant') {
      body(K.CORR, 0, col, cx, cy, hx, hy, z0, top, K.CORR);
      m.set([40, 42, 44], .2, K.METAL).box([cx + hx + .02, cy, b.gz + 2.5], [.03, Math.min(hy * .5, 3), 2.5]);
      if (k === 'saw') { m.set(col.map(c => c * .85), .2, K.CORR, 0); const n = Math.max(2, Math.floor(hx / 4)); for (let i = 0; i < n; i++) { const x = cx - hx + (i + .5) * 2 * hx / n, ww = hx / n; m.ext([[x - ww, top], [x + ww, top], [x + ww, top + 2.2]], cy - hy, cy + hy); m.set([170, 200, 210], .8, K.GLASS).box([x + ww - .03, cy, top + 1.1], [.03, hy - .3, .9], { top: false }); m.set(col.map(c => c * .85), .2, K.CORR, 0); } }
      if (k === 'plant') { m.set([150, 140, 130], .1, K.CONC); m.cyl([cx + hx * .6, cy + hy * .5, top], [cx + hx * .6, cy + hy * .5, top + 14], 1, .8, 10); m.set([180, 60, 50], .2, K.PAINT, 0).cyl([cx + hx * .6, cy + hy * .5, top + 12.5], [cx + hx * .6, cy + hy * .5, top + 13.5], .85, .82, 10); m.set([190, 194, 196], .5, K.METAL).cyl([cx - hx - 3, cy, z0], [cx - hx - 3, cy, top + 3], 2.4, 2.4, 14); m.sph([cx - hx - 3, cy, top + 3], [2.4, 2.4, 1.2], 14, 4, { hemi: true }); }
      if (k === 'hall') { m.set(col.map(c => c * .8), .2, K.CORR, 0); m.face([[cx - hx - .3, cy - hy - .3, top], [cx + hx + .3, cy - hy - .3, top], [cx + hx + .3, cy, top + 1.6], [cx - hx - .3, cy, top + 1.6]]); m.face([[cx + hx + .3, cy + hy + .3, top], [cx - hx - .3, cy + hy + .3, top], [cx - hx - .3, cy, top + 1.6], [cx + hx + .3, cy, top + 1.6]]); }
    } else if (k === 'barrack') {
      body(K.FACADE, 7, col, cx, cy, hx, hy, z0, top, K.CORR); gable(cx, cy, hx, hy, top, b.roofH, [96, 104, 92], hx > hy);
    } else if (k === 'hangar') {
      const ax = hx > hy, L = ax ? hx : hy, r = Math.min(Math.min(hx, hy), b.h);
      m.set([140, 146, 140], .25, K.CORR, 0); m.push(X.T(cx, cy, b.gz));
      for (let i = 0; i < 14; i++) { const a0 = i / 14 * Math.PI, a1 = (i + 1) / 14 * Math.PI, c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
        if (ax) m.face([[-L, c0, s0], [L, c0, s0], [L, c1, s1], [-L, c1, s1]], [0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)]); else m.face([[c0, L, s0], [c0, -L, s0], [c1, -L, s1], [c1, L, s1]], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]); }
      m.set([70, 74, 70], .2, K.METAL); const fan = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI; fan.push(ax ? [L, Math.cos(a) * r, Math.sin(a) * r] : [Math.cos(a) * r, -L, Math.sin(a) * r]); } m.face([ax ? [L, 0, 0] : [0, -L, 0]].concat(fan), ax ? [1, 0, 0] : [0, -1, 0]);
      const fan2 = fan.map(p => ax ? [-L, p[1], p[2]] : [p[0], L, p[2]]).reverse(); m.face([ax ? [-L, 0, 0] : [0, L, 0]].concat(fan2), ax ? [-1, 0, 0] : [0, 1, 0]); m.pop();
    } else { m.set([160, 156, 146], .05, K.CONC); m.box([cx, cy, (z0 + top) / 2], [hx, hy, (top - z0) / 2]); m.set([168, 150, 110], .05, K.PLASTER, 1); m.box([cx, cy, top + .3], [hx + .3, hy + .3, .3]); }
  }
  const CARC = [[180, 30, 30], [220, 220, 216], [30, 34, 40], [60, 90, 140], [150, 152, 150], [200, 170, 40], [40, 70, 50]];
  MD.carMesh = (ci, wr) => { const m = new Mesh(); propMesh(m, { k: ci >= 7 ? 'wreck' : 'car', x: 0, y: 0, z: 0, yaw: 0, c: (ci + .5) / 7 }); return m.done(); };   // mobil sipil (fps-life)
  function propMesh(m, p) {
    m.push(X.chain(X.T(p.x, p.y, p.z), X.rz(p.yaw)));
    if (p.k === 'car' || p.k === 'wreck') {
      const wr = p.k === 'wreck', c = wr ? [34, 30, 28] : CARC[Math.floor(p.c * CARC.length)];
      m.set(c, wr ? .02 : .6, wr ? K.PLAIN : K.PAINT, 0); m.ext([[-2.15, .35], [-2.2, .85], [-1.3, .95], [-.7, 1.45], [.8, 1.45], [1.5, .95], [2.2, .85], [2.2, .35]], -.85, .85);
      m.set(wr ? [20, 20, 20] : [36, 48, 58], wr ? 0 : .95, wr ? K.PLAIN : K.GLASS).ext([[-1.25, .96], [-.68, 1.42], [.78, 1.42], [1.45, .96]], -.8, .8);
      m.set([22, 22, 22], .1, K.PLAIN); for (const x of [-1.35, 1.35]) for (const s of [-1, 1]) m.cyl([x, s * .72, .34], [x, s * .9, .34], .34, .34, 10);
      if (!wr) m.set([230, 220, 190], .5, K.LAMP, 0).box([2.21, .55, .72], [.02, .14, .07]).box([2.21, -.55, .72], [.02, .14, .07]);
    } else if (p.k === 'truck') {
      m.set([86, 96, 70], .15, K.PAINT, 1).box([2.2, 0, 1.5], [.8, 1.1, .8]); m.set([36, 48, 58], .9, K.GLASS).box([3.01, 0, 1.75], [.02, .95, .35]);
      m.set([96, 104, 76], .05, K.CLOTH, 0).box([-.9, 0, 1.75], [2.1, 1.15, 1.05]); m.set([30, 30, 30], .1, K.PLAIN).box([0, 0, .75], [3, 1, .15]);
      for (const x of [-2, -.8, 2.1]) for (const s of [-1, 1]) m.cyl([x, s * .95, .48], [x, s * 1.2, .48], .48, .48, 10);
    } else if (p.k === 'lamp') {
      m.set([70, 72, 74], .5, K.METAL).cyl([0, 0, 0], [0, 0, 6.2], .1, .06, 6).cyl([0, 0, 6.1], [1.3, 0, 6.3], .05, .05, 4); m.set([255, 236, 190], .3, K.LAMP, 1).box([1.4, 0, 6.2], [.3, .14, .06]);
    } else if (p.k === 'cont') {
      const cs = [[160, 50, 40], [40, 80, 140], [50, 110, 70], [200, 120, 40], [120, 120, 124]];
      for (let j = 0; j < (p.stack || 1); j++) { m.set(cs[Math.floor((p.c * 7 + j * .37) % 1 * cs.length)], .2, K.CORR, 1); m.box([0, 0, 1.3 + j * 2.6], [6.05, 1.22, 1.3]); }
    } else if (p.k === 'hesco') { m.set([170, 152, 112], .05, K.PLASTER, 1); for (let i = -1; i <= 1; i++) m.box([0, i * 1.1, .7], [.55, .55, .7]); }
    else if (p.k === 'sand') { m.set([168, 150, 110], .05, K.PLASTER, 1); for (let j = 0; j < 3; j++) for (let i = -2; i <= 2; i++) m.box([0, i * .7 + (j % 2) * .35, .17 + j * .3], [.3, .34, .15]); }
    else if (p.k === 'monu') {   // tugu alun-alun: alas bertingkat, tiang bersegi, puncak lancip berlapis emas
      m.set([196, 190, 176], .1, K.CONC).box([0, 0, .25], [2.4, 2.4, .25]).box([0, 0, .7], [1.8, 1.8, .2]).box([0, 0, 1.1], [1.25, 1.25, .2]);
      m.set([214, 208, 194], .15, K.CONC).box([0, 0, 4.1], [.55, .55, 2.8]); m.cyl([0, 0, 6.9], [0, 0, 8.3], .78, .03, 4);
      m.set([60, 64, 62], .5, K.METAL).box([0, .56, 2.4], [.36, .02, .26]); m.set([214, 176, 70], .8, K.METAL).sph([0, 0, 8.45], [.22, .22, .3], 8, 4);
    } else if (p.k === 'stall') {   // warung: tiang kayu, atap terpal miring berwarna, meja dagangan
      const cc = [[196, 56, 46], [40, 104, 168], [222, 168, 40], [58, 136, 78], [170, 70, 140]][Math.floor(p.c * 5)];
      m.set([96, 74, 52], .05, K.PLAIN); for (const sx of [-1, 1]) for (const sy of [-1, 1]) m.cyl([sx * 1.25, sy * .85, 0], [sx * 1.25, sy * .85, sy > 0 ? 2.15 : 2.45], .05, .05, 5);
      m.set(cc, .1, K.CLOTH, 0).ext([[-1.45, 2.12], [-1.45, 2.18], [1.45, 2.5], [1.45, 2.44]], -1.05, 1.05);
      m.set([120, 92, 62], .05, K.PLAIN).box([0, 0, .82], [1.15, .6, .05]); for (const sx of [-1, 1]) m.box([sx * 1, 0, .4], [.05, .5, .4]);
      for (let i = 0; i < 4; i++) m.set([[200, 160, 60], [170, 60, 40], [90, 140, 60], [220, 220, 210]][(i + Math.floor(p.c * 9)) % 4], .2, K.PLAIN).box([-.75 + i * .5, .1, .97], [.2, .2, .11]);
    } else if (p.k === 'bench') {
      m.set([128, 92, 58], .1, K.PLAIN).box([0, 0, .45], [.9, .22, .035]).box([0, -.21, .78], [.9, .025, .16]);
      m.set([48, 50, 52], .4, K.METAL); for (const sx of [-.75, .75]) m.box([sx, 0, .22], [.03, .2, .22]).box([sx, -.2, .6], [.03, .02, .2]);
    } else if (p.k === 'pole') {   // tiang listrik: kayu/beton, palang, isolator, kadang trafo
      m.set([104, 92, 78], .05, K.PLAIN).cyl([0, 0, 0], [0, 0, 8.6], .13, .09, 6); m.box([0, 0, 8.1], [.05, .95, .06]);
      m.set([200, 210, 214], .5, K.PLAIN); for (const sy of [-.8, 0, .8]) m.cyl([0, sy, 8.17], [0, sy, 8.32], .04, .03, 5);
      if (p.c < .3) m.set([110, 116, 112], .4, K.METAL).box([0, .32, 6.1], [.26, .22, .42]);
    } else if (p.k === 'bus') {   // bus kota parkir
      const cc = [[214, 160, 40], [40, 120, 170], [200, 200, 196]][Math.floor(p.c * 3)];
      m.set(cc, .55, K.PAINT, 0).box([0, 0, 1.75], [5.6, 1.25, 1.25]); m.set([36, 46, 56], .95, K.GLASS).box([0, 0, 2.15], [5.45, 1.27, .45]).box([5.62, 0, 1.95], [.02, 1.1, .6]);
      m.set([22, 22, 22], .1, K.PLAIN); for (const x of [-3.6, 3.4]) for (const s of [-1, 1]) m.cyl([x, s * 1, .5], [x, s * 1.26, .5], .5, .5, 10);
    } else if (p.k === 'flag') {   // tiang bendera: kain bergelombang dua warna, bola emas
      const FC = [[[196, 30, 36], [236, 236, 230]], [[52, 78, 56], [214, 176, 64]], [[34, 58, 120], [232, 232, 226]]][Math.min(2, Math.floor(p.c * 3))];
      m.set([196, 198, 200], .6, K.METAL).cyl([0, 0, 0], [0, 0, 9.4], .07, .05, 6); m.set([214, 176, 70], .8, K.METAL).sph([0, 0, 9.5], [.11, .11, .11], 6, 4);
      for (let i = 0; i < 9; i++) { const x = .12 + i * .26, w = Math.sin(i * .95) * .13 * (i / 8 + .2); m.set(FC[0], .1, K.CLOTH, 0).box([x, w, 8.95], [.135, .02, .3]); m.set(FC[1], .1, K.CLOTH, 0).box([x, w, 8.35], [.135, .02, .3]); }
    } else if (p.k === 'pad') {   // helipad: pelat beton, cincin putih, huruf H, lampu tepi
      m.set([118, 118, 114], .05, K.CONC).cyl([0, 0, -.2], [0, 0, .12], 10.5, 10.5, 28);
      m.set([236, 236, 230], .1, K.PLAIN); for (let k = 0; k < 28; k++) { m.push(X.rz(k / 28 * 6.283)); m.box([8.7, 0, .13], [.32, 1.02, .015]); m.pop(); }
      m.box([-2.3, 0, .13], [.5, 3.3, .015]).box([2.3, 0, .13], [.5, 3.3, .015]).box([0, 0, .13], [1.8, .48, .015]);
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; m.set([255, 210, 90], .3, K.LAMP, 1).box([Math.cos(a) * 10.2, Math.sin(a) * 10.2, .18], [.14, .14, .07]); }
    } else if (p.k === 'rwy') {   // landasan: garis tengah putus-putus, tepi, blok ujung, tanda sentuh (digambar di atas aspal, p.L setengah panjang)
      const L = p.L, hw = p.hw, Z = .07; m.set([214, 214, 206], .05, K.PLAIN);
      for (let s = -L + 42; s < L - 42; s += 36) m.box([s, 0, Z], [9, .42, .012]);
      for (const sy of [-1, 1]) m.box([0, sy * (hw - .7), Z], [L, .24, .012]);
      for (const sx of [-1, 1]) { for (let i = 1; i <= 5; i++) for (const sy of [-1, 1]) m.box([sx * (L - 11), sy * (i * 2.5 - .6), Z], [8, .68, .012]); m.box([sx * (L - 92), 5.2, Z], [15, 1.5, .012]).box([sx * (L - 92), -5.2, Z], [15, 1.5, .012]); m.box([sx * (L - 1.2), 0, Z], [.5, hw - .7, .012]); }
    } else if (p.k === 'tline') {   // garis pandu taksi kuning
      m.set([208, 168, 40], .05, K.PLAIN).box([0, 0, .06], [p.L, .17, .012]);
    } else if (p.k === 'garg') {   // garasi kendaraan: pintu menghadap +x di x=0, ruang dalam gelap x −16…0 (pintu gulung digambar fps-gl)
      const W = 5.25, H = 6.2, D = 16;
      m.set([30, 31, 30], .05, K.CONC).box([-D / 2, 0, .02], [D / 2, W, .02]);
      m.set([44, 45, 46], .02, K.PLAIN).box([-D + .12, 0, H / 2], [.02, W, H / 2]).box([-D / 2, W - .02, H / 2], [D / 2, .02, H / 2]).box([-D / 2, -W + .02, H / 2], [D / 2, .02, H / 2]).box([-D / 2, 0, H + .02], [D / 2, W, .02]);
      m.set([98, 102, 92], .2, K.CORR, 1).box([-D / 2, W + .2, H / 2 + .35], [D / 2, .2, H / 2 + .35]).box([-D / 2, -W - .2, H / 2 + .35], [D / 2, .2, H / 2 + .35]).box([-D - .12, 0, H / 2 + .35], [.12, W + .4, H / 2 + .35]);
      m.set([72, 76, 70], .25, K.CORR, 1).box([-D / 2, 0, H + .62], [D / 2 + .5, W + .55, .24]);
      m.set([58, 60, 56], .3, K.METAL).box([.08, 0, H + .22], [.2, W + .4, .22]);
      m.set([190, 154, 40], .2, K.PAINT, 0); for (const sy of [-1, 1]) for (let i = 0; i < 4; i++) m.box([.03, sy * (W + .2), .4 + i * 1.5], [.04, .2, .34]);
      m.set([255, 224, 170], .3, K.LAMP, 1).box([.32, 0, H + .3], [.05, .7, .05]);
    } else if (p.k === 'hgar') {   // hanggar pesawat: pintu menghadap +x di x=0, atap lengkung, ruang dalam gelap (2 daun pintu geser digambar fps-gl)
      const W = 22, Hw = 9, R = 5, D = 40, N = 12, FS = [];
      m.set([34, 34, 32], .05, K.CONC).box([-D / 2, 0, .02], [D / 2, W, .02]);
      m.set([190, 154, 40], .05, K.PLAIN).box([-D / 2 + 2, 0, .05], [D / 2 - 2, .16, .01]);
      m.set([50, 52, 54], .02, K.PLAIN).box([-D + .14, 0, Hw / 2], [.02, W, Hw / 2]).box([-D / 2, W - .02, Hw / 2], [D / 2, .02, Hw / 2]).box([-D / 2, -W + .02, Hw / 2], [D / 2, .02, Hw / 2]).box([-D / 2, 0, Hw + .05], [D / 2, W, .02]);
      m.set([116, 122, 116], .25, K.CORR, 1).box([-D / 2, W + .2, Hw / 2], [D / 2, .2, Hw / 2]).box([-D / 2, -W - .2, Hw / 2], [D / 2, .2, Hw / 2]).box([-D - .1, 0, Hw / 2], [.1, W + .4, Hw / 2]);
      m.set([124, 130, 124], .25, K.CORR, 0);
      for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI, a1 = (i + 1) / N * Math.PI, y0 = Math.cos(a0) * (W + .4), y1 = Math.cos(a1) * (W + .4), z0 = Hw + Math.sin(a0) * R, z1 = Hw + Math.sin(a1) * R; m.face([[-D - .2, y0, z0], [.25, y0, z0], [.25, y1, z1], [-D - .2, y1, z1]], [0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)]); FS.push([.25, y0, z0]); if (i === N - 1) FS.push([.25, y1, z1]); }
      m.set([88, 92, 88], .2, K.METAL); m.face([[.25, 0, Hw]].concat(FS), [1, 0, 0]); m.face([[-D - .2, 0, Hw]].concat(FS.map(q => [-D - .2, q[1], q[2]]).reverse()), [-1, 0, 0]);
      m.box([.12, 0, Hw - .1], [.22, W + .4, .22]);
      m.set([190, 154, 40], .2, K.PAINT, 0); for (const sy of [-1, 1]) for (let i = 0; i < 5; i++) m.box([.04, sy * (W + .2), .5 + i * 1.8], [.05, .2, .42]);
      m.set([255, 226, 170], .3, K.LAMP, 1); for (const y of [-14, -5, 5, 14]) m.box([-14, y, Hw - .02], [5, .14, .03]); for (const y of [-11, 11]) m.box([.4, y, Hw + .15], [.05, .55, .05]);
    } else if (p.k === 'atc') {   // menara kontrol lapangan terbang
      m.set([150, 148, 138], .1, K.CONC).box([0, 0, 2.2], [5.5, 5.5, 2.2]); m.cyl([0, 0, 4.4], [0, 0, 15], 2.6, 2.1, 12);
      m.set([96, 100, 96], .3, K.METAL).cyl([0, 0, 15], [0, 0, 15.5], 4.3, 4.3, 8);
      m.set([60, 92, 108], .95, K.GLASS).cyl([0, 0, 15.5], [0, 0, 18.3], 3.7, 4.4, 8, { cap0: false, cap1: false });
      m.set([76, 80, 78], .3, K.METAL).cyl([0, 0, 18.3], [0, 0, 18.8], 4.7, 3.9, 8); m.cyl([0, 0, 18.8], [0, 0, 23], .08, .04, 5);
      m.set([255, 50, 40], 0, K.EMIT).box([0, 0, 23.05], [.1, .1, .1]);
    } else if (p.k === 'mast') {   // menara lampu sorot: tiang baja, palang, 4 lampu (menyala di malam hari)
      m.set([150, 152, 150], .5, K.METAL).cyl([0, 0, 0], [0, 0, 12.3], .2, .1, 8); m.box([0, 0, 12.3], [.12, 1.3, .08]);
      for (const y of [-1.05, -.35, .35, 1.05]) { m.set([60, 62, 64], .5, K.METAL).box([.22, y, 12.05], [.12, .26, .2]); m.set([255, 244, 214], .3, K.LAMP, 1).box([.35, y, 12.0], [.02, .22, .16]); }
      m.set([70, 72, 74], .4, K.METAL).box([0, 0, .6], [.3, .3, .6]);
    } else if (p.k === 'tower') {   // menara jaga: kaki kayu, lantai, dinding karung pasir, atap seng, tangga, lampu sorot
      m.set([96, 80, 60], .05, K.PLAIN); for (const sx of [-1, 1]) for (const sy of [-1, 1]) m.cyl([sx * 1.6, sy * 1.6, 0], [sx * 1.35, sy * 1.35, 6.1], .13, .11, 6);
      for (const sy of [-1, 1]) { m.push(X.chain(X.T(0, sy * 1.5, 3), X.ry(.72))); m.box([0, 0, 0], [2.0, .05, .06]); m.pop(); }
      m.box([0, 0, 6.1], [1.8, 1.8, .12]);
      m.set([168, 150, 110], .05, K.PLASTER, 1).box([1.68, 0, 6.72], [.13, 1.8, .5]).box([0, 1.68, 6.72], [1.8, .13, .5]).box([0, -1.68, 6.72], [1.8, .13, .5]).box([-1.68, .9, 6.72], [.13, .9, .5]);
      m.set([70, 72, 74], .4, K.METAL); for (const sx of [-1, 1]) for (const sy of [-1, 1]) m.cyl([sx * 1.62, sy * 1.62, 6.2], [sx * 1.62, sy * 1.62, 8.3], .05, .05, 4);
      m.set([88, 96, 76], .2, K.CORR, 1).ext([[-2.1, 8.2], [2.1, 8.5], [2.1, 8.62], [-2.1, 8.32]], -2.1, 2.1);
      for (const y of [-.32, .32]) m.set([70, 72, 74], .4, K.METAL).cyl([-2.5, y, 0], [-1.8, y, 6.1], .035, .035, 4);
      for (let i = 1; i < 15; i++) { const z = i * .41; m.box([-2.5 + .7 * z / 6.1, 0, z], [.02, .32, .02]); }
      m.set([40, 42, 44], .5, K.METAL).cyl([1.5, -1.1, 7.3], [1.95, -1.1, 7.42], .2, .23, 8); m.set([255, 240, 200], .3, K.LAMP, 1).cyl([1.95, -1.1, 7.42], [1.98, -1.1, 7.43], .22, .22, 8);
    } else if (p.k === 'tent') {   // tenda militer: kain zaitun, bubungan, pintu gelap, tali pancang
      m.push(X.rz(Math.PI / 2));
      m.set([98, 106, 74], .05, K.CLOTH, 0).ext([[-2.4, 0], [-2.4, 1.35], [0, 2.65], [2.4, 1.35], [2.4, 0]], -3.5, 3.5);
      m.set([46, 50, 36], .05, K.CLOTH, 0).box([0, 3.52, .95], [.8, .03, .95]);
      m.set([80, 70, 56], .05, K.PLAIN); for (const y of [-3.2, 0, 3.2]) for (const sx of [-1, 1]) { m.push(X.chain(X.T(sx * 3.1, y, .6), X.ry(sx * .85))); m.box([0, 0, 0], [.02, .02, 1]); m.pop(); }
      m.pop();
    } else if (p.k === 'net') {   // jaring kamuflase di atas kendaraan: 4 tiang, jaring menggantung, gumpalan daun
      m.set([86, 74, 56], .05, K.PLAIN); for (const sx of [-1, 1]) for (const sy of [-1, 1]) m.cyl([sx * 3.6, sy * 2.6, 0], [sx * 3.6, sy * 2.6, 3.1], .05, .05, 4);
      m.set([72, 84, 52], .02, K.CLOTH, 0).ext([[-4.2, 2.6], [-2, 3.25], [2, 3.25], [4.2, 2.6], [4.2, 2.52], [2, 3.17], [-2, 3.17], [-4.2, 2.52]], -3.2, 3.2);
      for (let i = 0; i < 14; i++) { const h = (i * .6180339) % 1, g = (i * .3819) % 1; m.set(i % 3 ? [60, 74, 44] : [96, 92, 60], .02, K.CLOTH, 0).box([-3.6 + h * 7.2, -2.7 + g * 5.4, 3.18 - Math.abs(h - .5) * 1.1], [.5, .45, .08]); }
    } else if (p.k === 'hmv') {   // Humvee parkir (bentuk sederhana)
      m.set([96, 104, 76], .25, K.PAINT, 1).ext([[-2.35, .55], [-2.35, 1.25], [-.9, 1.3], [-.55, 1.9], [1.0, 1.9], [1.3, 1.25], [2.35, 1.15], [2.35, .55]], -1.08, 1.08);
      m.set([36, 48, 58], .9, K.GLASS).ext([[-.5, 1.32], [-.25, 1.85], [.95, 1.85], [1.22, 1.32]], -1.1, 1.1);
      m.set([24, 24, 24], .1, K.PLAIN); for (const x of [-1.5, 1.55]) for (const s of [-1, 1]) m.cyl([x, s * .82, .46], [x, s * 1.12, .46], .46, .46, 10);
      m.set([60, 64, 50], .3, K.METAL).cyl([-.2, 0, 1.9], [-.2, 0, 2.15], .38, .38, 10);
    } else if (p.k === 'fuel') {   // tangki BBM horizontal di atas dudukan, tangga, pita kuning
      m.set([60, 64, 66], .3, K.METAL); for (const x of [-2.2, 0, 2.2]) m.box([x, 0, .35], [.2, .9, .35]);
      m.set([74, 86, 62], .4, K.PAINT, 1).cyl([-3, 0, 1.35], [3, 0, 1.35], 1.05, 1.05, 16); m.set([222, 180, 40], .3, K.PAINT, 0).cyl([-.4, 0, 1.35], [.4, 0, 1.35], 1.07, 1.07, 16);
      m.set([60, 62, 64], .4, K.METAL).cyl([2.4, 0, 2.3], [2.4, 0, 2.6], .25, .25, 8).box([3.15, 0, 1.2], [.06, .3, 1.2]);
    } else if (p.k === 'gen') {   // genset: kotak, kisi, knalpot
      m.set([84, 94, 70], .3, K.PAINT, 1).box([0, 0, .7], [1.2, .7, .65]); m.set([40, 42, 44], .3, K.METAL).box([1.21, 0, .75], [.02, .5, .4]).cyl([-.8, .4, 1.35], [-.8, .4, 1.9], .07, .07, 6);
    } else if (p.k === 'radar') {   // menara radar: rangka baja, piringan, lampu merah di puncak
      m.set([170, 172, 168], .5, K.METAL); for (const sx of [-1, 1]) for (const sy of [-1, 1]) m.cyl([sx * 1.4, sy * 1.4, 0], [sx * .35, sy * .35, 14], .07, .05, 4);
      for (let k = 1; k < 5; k++) { const z = k * 2.8, w = 1.4 - (1.05 * z / 14); m.box([0, w, z], [w, .03, .03]).box([0, -w, z], [w, .03, .03]).box([w, 0, z], [.03, w, .03]).box([-w, 0, z], [.03, w, .03]); }
      m.box([0, 0, 14.1], [.6, .6, .1]); m.set([226, 228, 224], .4, K.PLAIN).push(X.chain(X.T(0, 0, 15.4), X.ry(-.35))); m.sph([0, 0, 0], [.35, 1.6, 1.1], 12, 6); m.pop();
      m.set([60, 62, 64], .4, K.METAL).cyl([0, 0, 14.1], [0, 0, 15.2], .08, .08, 6); m.set([255, 50, 40], .3, K.LAMP, 1).sph([0, 0, 16.7], [.12, .12, .12], 6, 4);
    } else if (p.k === 'crate') {   // peti logistik kayu di atas palet
      m.set([108, 84, 56], .05, K.PLAIN).box([0, 0, .07], [.6, .6, .07]);
      for (let j = 0; j < (p.stack || 1); j++) { m.set(j % 2 ? [150, 120, 76] : [118, 124, 82], .05, K.PLAIN).box([0, 0, .14 + .52 + j * 1.04], [.55, .55, .52]); m.set([40, 40, 36], .1, K.PLAIN).box([.56, 0, .5 + j * 1.04], [.01, .4, .08]); }
    } else if (p.k === 'barrel') { m.set(p.c < .5 ? [50, 70, 120] : [130, 50, 36], .35, K.METAL); for (let i = 0; i < 3; i++) m.cyl([i * .65 - .65, 0, 0], [i * .65 - .65, 0, .9], .3, .3, 10); }
    m.pop();
  }
})();
