/* ============================================================
   FPS-VM — model senjata & tangan orang-pertama SKALA NYATA
   (meter), dirender sebagai poligon berbayang di kanvas 2D:
   kotak, silinder/kerucut, ekstrusi profil samping, cincin.
   Tangan: telapak, 4 jari × 3 ruas, ibu jari, sarung tangan,
   lengan baju (siku dihitung arah IK sederhana).
   Animasi: bob, sway, rekoil, pelatuk, siklus baut/pompa,
   selongsong terlempar, reload berkoreografi per senjata
   (kurva kunci + pegas teredam: senjata & kamera tersentak
   saat magasin masuk / bolt dilepas, lalu memantul mereda)
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P;
  const { clamp } = TK.util;
  const AU = () => TK.fpsaudio;
  const V = TK.fpsvm = { sx: 0, sy: 0, spr: 0, swK: 0, shells: [], drops: [], R: { on: false }, C: { on: false }, lastVk: 0, dbg: null };

  /* ---------- material: warna dasar, kilap (ks), ketajaman kilap ---------- */
  const mt = (c, ks, sh) => ({ c, ks: ks || 0, sh: sh || 18 });
  const ANO = mt([36, 37, 39], .3), POL = mt([30, 30, 32], .1), FDE = mt([146, 122, 86], .08), FDE2 = mt([124, 103, 72], .06), PRK = mt([54, 55, 56], .24),
    STL = mt([96, 98, 101], .55, 30), BRS = mt([206, 164, 82], .75, 26), CPR = mt([184, 110, 66], .6, 24), RUB = mt([22, 22, 23], .04), OLV = mt([78, 86, 58], .08),
    TANm = mt([134, 118, 86], .08), RSH = mt([162, 36, 30], .22), BLD = mt([60, 62, 64], .4, 26), LTH = mt([104, 70, 42], .12), LTH2 = mt([70, 46, 28], .1),
    INN = mt([9, 10, 11], 0), GLS = mt([46, 62, 92], 1, 40), LMP = mt([226, 230, 214], .4), WHT = mt([210, 210, 200], 0),
    CHR = mt([172, 174, 178], .85, 34), STN = mt([148, 150, 153], .6, 26), WOOD = mt([104, 50, 30], .2, 20), GOLD = mt([200, 152, 62], .8, 30), FIB = mt([90, 230, 110], .3);

  /* ---------- vektor & transformasi (kolom ex, ey, ez + translasi) ---------- */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], ma = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, k) => a + (b - a) * k, lv = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const ss = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const seg = (t, a, b) => ss((t - a) / (b - a));
  const bump = (t, a, w) => { const k = (t - a) / w; return k < 0 || k > 1 ? 0 : Math.sin(k * Math.PI); };
  const rz = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
  const rx = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c + v[2] * s, v[2] * c - v[1] * s]; };
  const ry = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], v[2] * c - v[0] * s]; };
  const rot = (v, p, y, r) => ry(rx(rz(v, r), p), y);
  const xf = (p, y, r, t) => ({ c: [rot([1, 0, 0], p, y, r), rot([0, 1, 0], p, y, r), rot([0, 0, 1], p, y, r)], t: t || [0, 0, 0] });
  const I = xf(0, 0, 0);
  const ar = (X, v) => [X.c[0][0] * v[0] + X.c[1][0] * v[1] + X.c[2][0] * v[2], X.c[0][1] * v[0] + X.c[1][1] * v[1] + X.c[2][1] * v[2], X.c[0][2] * v[0] + X.c[1][2] * v[1] + X.c[2][2] * v[2]];
  const ap = (X, v) => add(X.t, ar(X, v));
  const cmp = (A, B) => ({ c: B.c.map(e => ar(A, e)), t: ap(A, B.t) });
  const bone = (pv, o, p, y, r) => { const R = xf(p, y, r); return { c: R.c, t: add(sub(pv, ar(R, pv)), o) }; };   // putar di sekitar poros pv lalu geser o

  /* ---------- rasterisasi: kliping bidang dekat, bayangan, urut kedalaman ---------- */
  const NEAR = .022, LV = nrm([-.35, .75, -.55]);
  let faces = [], X = I, ctx2 = null, FOC = 1, CWv = 0, CHv = 0, tint = [1, 1, 1], nvg = false;
  function clipNear(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], ip = p[2] >= NEAR, iq = q[2] >= NEAR;
      if (ip) out.push(p);
      if (ip !== iq) { const k = (NEAR - p[2]) / (q[2] - p[2]); out.push([lerp(p[0], q[0], k), lerp(p[1], q[1], k), NEAR]); }
    }
    return out;
  }
  function face(pts, n, m, zb, al, vn, tri) {
    let cx = 0, cy = 0, cz = 0, mn = 9;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; if (p[2] < mn) mn = p[2]; }
    const k = 1 / pts.length; cx *= k; cy *= k; cz *= k;
    if (!al && n[0] * cx + n[1] * cy + n[2] * cz >= 0) return;   // permukaan membelakangi kamera
    if (GLon) { glPush(pts, n, m, al, vn, tri); return; }        // WebGL: kliping & urutan kedalaman ditangani GPU
    if (mn < NEAR) { pts = clipNear(pts); if (pts.length < 3) return; }
    const vl = Math.hypot(cx, cy, cz) || 1, hx = LV[0] - cx / vl, hy = LV[1] - cy / vl, hz = LV[2] - cz / vl, hl = Math.hypot(hx, hy, hz) || 1;
    const sp = m.ks ? Math.pow(Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hl), m.sh) * m.ks : 0;
    const sh = .34 + .66 * Math.max(0, dot(n, LV)) + .12 * Math.max(0, -n[2]) + .05 * Math.max(0, n[0]);
    let r = (m.c[0] * sh + 230 * sp) * tint[0], g = (m.c[1] * sh + 230 * sp) * tint[1], b = (m.c[2] * sh + 225 * sp) * tint[2];
    if (nvg) { const l = (r * .3 + g * .59 + b * .11) * 2.6 + 10; r = l * .25; g = l; b = l * .32; }
    const s = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; s[i] = [CWv / 2 + p[0] / p[2] * FOC, CHv / 2 - p[1] / p[2] * FOC]; }
    faces.push({ z: cz + (zb || 0), s, c: 'rgb(' + (r > 255 ? 255 : r | 0) + ',' + (g > 255 ? 255 : g | 0) + ',' + (b > 255 ? 255 : b | 0) + ')', a: al || 1 });
  }
  let HOLE = null;   // [x, y, r] lubang lensa mata ACOG saat membidik: model senjata tidak digambar di dalamnya (yang terlihat = dunia + retikel)
  function holeClip(c) { if (!HOLE) return; c.save(); c.beginPath(); c.rect(0, 0, CWv, CHv); c.moveTo(HOLE[0] + HOLE[2], HOLE[1]); c.arc(HOLE[0], HOLE[1], HOLE[2], 0, 6.3, true); c.clip('evenodd'); }
  function flush() {
    if (GLon) { glRender(); return; }
    faces.sort((a, b) => b.z - a.z);
    const c = ctx2; c.lineJoin = 'round'; holeClip(c);
    for (const f of faces) {
      c.beginPath(); const s = f.s; c.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) c.lineTo(s[i][0], s[i][1]); c.closePath();
      c.fillStyle = f.c;
      if (f.a < 1) { c.globalAlpha = f.a; c.fill(); c.globalAlpha = 1; }
      else { c.fill(); c.strokeStyle = f.c; c.lineWidth = .8; c.stroke(); }   // garis sewarna menutup celah antar-poligon
    }
    if (HOLE) c.restore();
    faces = [];
  }

  /* ---------- renderer WebGL: per-piksel Blinn-Phong, depth buffer, MSAA; cadangan = kanvas 2D di atas ---------- */
  let GLon = false;
  const GL = { tried: false, ok: false, cv: null, gl: null, pr: null, buf: null, A: new Float32Array(1 << 16), An: 0, B: new Float32Array(1 << 12), Bn: 0, loc: {} };
  const VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute vec3 aM;uniform vec2 uF;varying vec3 vP;varying vec3 vN;varying vec3 vC;varying vec3 vM;' +
    'void main(){vP=aP;vN=aN;vC=aC;vM=aM;float n=.012,f=4.;gl_Position=vec4(aP.x*uF.x,aP.y*uF.y,(aP.z*(f+n)-2.*f*n)/(f-n),aP.z);}';
  const FS = 'precision mediump float;varying vec3 vP;varying vec3 vN;varying vec3 vC;varying vec3 vM;uniform vec3 uL;uniform vec3 uT;uniform float uV;' +
    'float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5);}' +
    'void main(){vec3 V=normalize(-vP);vec3 N=normalize(vN);if(dot(N,V)<0.)N=-N;vec3 c=vC/255.;' +
    'float d=max(dot(N,uL),0.),e=.5+.5*N.y;vec3 amb=mix(vec3(.2,.19,.17),vec3(.4,.42,.45),e);' +
    'vec3 H=normalize(uL+V);float s=pow(max(dot(N,H),0.),vM.y)*vM.x;float fr=pow(1.-max(dot(N,V),0.),3.);' +
    'float g=.94+.12*h(floor(vP*2200.));' +
    'vec3 col=c*g*(amb+vec3(1.,.96,.9)*d*.92)+vec3(1.,.97,.92)*s*1.1+(c*.35+vM.x*.25)*fr*.6;col*=uT;' +
    'if(uV>.5){float l=dot(col,vec3(.3,.59,.11))*2.6+.04;col=vec3(l*.25,l,l*.32);}gl_FragColor=vec4(col*vM.z,vM.z);}';
  function glInit() {
    GL.tried = true;
    try {
      const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
      if (!gl) return;
      const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
      Object.assign(GL, { cv, gl, pr, buf: gl.createBuffer(), ok: true });
      ['aP', 'aN', 'aC', 'aM'].forEach(n => { GL.loc[n] = gl.getAttribLocation(pr, n); });
      ['uF', 'uL', 'uT', 'uV'].forEach(n => { GL.loc[n] = gl.getUniformLocation(pr, n); });
    } catch (e) { GL.ok = false; }
  }
  function glVert(T, p, nn, m, a) {
    let A = T ? GL.B : GL.A; const i = T ? GL.Bn : GL.An;
    if (i + 12 > A.length) { const B = new Float32Array(A.length * 2); B.set(A); A = B; if (T) GL.B = B; else GL.A = B; }
    A[i] = p[0]; A[i + 1] = p[1]; A[i + 2] = p[2]; A[i + 3] = nn[0]; A[i + 4] = nn[1]; A[i + 5] = nn[2]; A[i + 6] = m.c[0]; A[i + 7] = m.c[1]; A[i + 8] = m.c[2];
    A[i + 9] = m.ks; A[i + 10] = m.sh; A[i + 11] = a;
    if (T) GL.Bn = i + 12; else GL.An = i + 12;
  }
  function glPush(pts, n, m, al, vn, tri) {
    const T = !!al, a = al || 1, V3 = (i, j, k) => { glVert(T, pts[i], vn ? vn[i] : n, m, a); glVert(T, pts[j], vn ? vn[j] : n, m, a); glVert(T, pts[k], vn ? vn[k] : n, m, a); };
    if (tri) for (const t of tri) V3(t[0], t[1], t[2]); else for (let i = 1; i < pts.length - 1; i++) V3(0, i, i + 1);
  }
  function glRender() {
    const gl = GL.gl, dpr = F.swGL && !F.opts.mobile ? .5 : Math.min([.85, 1.1, 1.5][F.opts.quality] || 1.1, window.devicePixelRatio || 1), w = Math.round(CWv * dpr), h = Math.round(CHv * dpr), L = GL.loc;
    if (GL.cv.width !== w || GL.cv.height !== h) { GL.cv.width = w; GL.cv.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(GL.pr); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.uniform2f(L.uF, FOC / (CWv / 2), FOC / (CHv / 2)); gl.uniform3f(L.uL, LV[0], LV[1], LV[2]); gl.uniform3f(L.uT, tint[0], tint[1], tint[2]); gl.uniform1f(L.uV, nvg ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.buf);
    const draw = (A, n) => {
      if (!n) return; gl.bufferData(gl.ARRAY_BUFFER, A.subarray(0, n), gl.DYNAMIC_DRAW);
      [['aP', 3, 0], ['aN', 3, 12], ['aC', 3, 24], ['aM', 3, 36]].forEach(([k, s, o]) => { gl.enableVertexAttribArray(L[k]); gl.vertexAttribPointer(L[k], s, gl.FLOAT, false, 48, o); });
      gl.drawArrays(gl.TRIANGLES, 0, n / 12);
    };
    gl.disable(gl.BLEND); gl.depthMask(true); draw(GL.A, GL.An);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); draw(GL.B, GL.Bn); gl.depthMask(true);
    GL.An = 0; GL.Bn = 0;
    holeClip(ctx2); ctx2.drawImage(GL.cv, 0, 0, CWv, CHv); if (HOLE) ctx2.restore();
  }
  /* triangulasi poligon cekung (tutup ekstrusi) dengan metode ear clipping */
  function earClip(pr) {
    const idx = pr.map((_, i) => i), out = []; let a2 = 0;
    for (let i = 0; i < pr.length; i++) { const p = pr[i], q = pr[(i + 1) % pr.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const sg = a2 > 0 ? 1 : -1, cr = (a, b, c) => ((pr[b][0] - pr[a][0]) * (pr[c][1] - pr[a][1]) - (pr[b][1] - pr[a][1]) * (pr[c][0] - pr[a][0])) * sg;
    for (let guard = 0; idx.length > 3 && guard < 400; guard++) {
      let cut = -1;
      for (let i = 0; i < idx.length && cut < 0; i++) {
        const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
        if (cr(a, b, c) <= 1e-12) continue;
        let inside = false; for (const p of idx) if (p !== a && p !== b && p !== c && cr(a, b, p) >= 0 && cr(b, c, p) >= 0 && cr(c, a, p) >= 0) { inside = true; break; }
        if (!inside) { out.push([a, b, c]); cut = i; }
      }
      if (cut < 0) break; idx.splice(cut, 1);
    }
    for (let i = 1; i < idx.length - 1; i++) out.push([idx[0], idx[i], idx[i + 1]]);
    return out;
  }

  /* ---------- primitif (ruang lokal → X → ruang pandang) ---------- */
  const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  function boxA(c, A3, h, m, zb) {
    const C = ap(X, c), E = A3.map(e => ar(X, e));
    for (let i = 0; i < 3; i++) for (let s = -1; s <= 1; s += 2) {
      const n = mul(E[i], s), f = ma(C, n, h[i]), j = (i + 1) % 3, k = (i + 2) % 3, a = mul(E[j], h[j]), b = mul(E[k], h[k]);
      face([sub(sub(f, a), b), sub(add(f, a), b), add(add(f, a), b), add(sub(f, a), b)], n, m, zb);
    }
  }
  const box = (c, h, m, o) => boxA(c, o && (o.p || o.y || o.r) ? AX.map(e => rot(e, o.p || 0, o.y || 0, o.r || 0)) : AX, h, m, o && o.zb);
  /* silinder / kerucut / prisma elips dari a ke b; o: up, q0/q1 (jari-jari kedua), segs, ph, inner, cap0, cap1, m0, m1, zb */
  function tube(a, b, r0, r1, n, m, o) {
    o = o || {};
    const A0 = ap(X, a), B0 = ap(X, b), d = sub(B0, A0), L = Math.hypot(d[0], d[1], d[2]) || 1e-6, w = mul(d, 1 / L);
    let up = ar(X, o.up || [0, 1, 0]); if (Math.abs(dot(up, w)) > .96) up = ar(X, [1, 0, 0]);
    const u = nrm(ma(up, w, -dot(up, w))), v = crs(w, u), q0 = o.q0 || r0, q1 = o.q1 || r1, sg = o.segs || 1, ph = o.ph || 0, inv = o.inner ? -1 : 1;
    const ring = [];
    for (let s = 0; s <= sg; s++) {
      const k = s / sg, c = ma(A0, d, k), rr = lerp(r0, r1, k), qq = lerp(q0, q1, k), R = [];
      for (let i = 0; i < n; i++) { const t = ph + i * 6.28319 / n; R.push(add(c, add(mul(u, Math.cos(t) * rr), mul(v, Math.sin(t) * qq)))); }
      ring.push(R);
    }
    const rm = (r0 + r1) / 2 || 1e-4, qm = (q0 + q1) / 2 || 1e-4, slope = (r1 - r0) / L;
    const VN = i => { const t = ph + i * 6.28319 / n; return mul(nrm(ma(nrm(add(mul(u, Math.cos(t) / rm), mul(v, Math.sin(t) / qm))), w, -slope)), inv); };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, t = ph + (i + .5) * 6.28319 / n, nr = nrm(ma(nrm(add(mul(u, Math.cos(t) / rm), mul(v, Math.sin(t) / qm))), w, -slope)), nn = mul(nr, inv);
      const vn = GLon && !o.flat ? [VN(i), VN(j), VN(j), VN(i)] : null;   // normal per titik -> bayangan halus di WebGL
      for (let s = 0; s < sg; s++) face([ring[s][i], ring[s][j], ring[s + 1][j], ring[s + 1][i]], nn, m, o.zb, 0, vn);
    }
    if (!o.inner) { if (o.cap0 !== false) face(ring[0], mul(w, -1), o.m0 || m, o.zb); if (o.cap1 !== false) face(ring[sg], w, o.m1 || m, o.zb); }
  }
  /* cincin datar (mis. ujung tabung optik) */
  function annulus(c, ax, ri, ro, n, m, zb) {
    const C = ap(X, c), w = nrm(ar(X, ax)), up = Math.abs(w[1]) > .9 ? [1, 0, 0] : [0, 1, 0], u = nrm(ma(up, w, -dot(up, w))), v = crs(w, u);
    for (let i = 0; i < n; i++) {
      const a = i * 6.28319 / n, b = (i + 1) * 6.28319 / n, P = (r, t) => add(C, add(mul(u, Math.cos(t) * r), mul(v, Math.sin(t) * r)));
      face([P(ri, a), P(ro, a), P(ro, b), P(ri, b)], w, m, zb);
    }
  }
  function disc(c, ax, r, n, m, al, zb) {   // lensa kaca (dua sisi, transparan)
    const C = ap(X, c), w = nrm(ar(X, ax)), up = Math.abs(w[1]) > .9 ? [1, 0, 0] : [0, 1, 0], u = nrm(ma(up, w, -dot(up, w))), v = crs(w, u), pts = [];
    for (let i = 0; i < n; i++) { const t = i * 6.28319 / n; pts.push(add(C, add(mul(u, Math.cos(t) * r), mul(v, Math.sin(t) * r)))); }
    face(pts, dot(w, C) > 0 ? mul(w, -1) : w, m, zb, al);
  }
  /* kliping profil 2D [z,y] terhadap a·y + b·z ≤ c; menandai tepi potong agar tidak dibuat sisinya */
  function clip2(pr, cl) {
    const f = p => cl[0] * p[1] + cl[1] * p[0] - cl[2], out = [], cut = [];
    for (let i = 0; i < pr.length; i++) {
      const p = pr[i], q = pr[(i + 1) % pr.length], fp = f(p), fq = f(q);
      if (fp <= 0) { out.push(p); cut.push(false); }
      if ((fp <= 0) !== (fq <= 0)) { const k = fp / (fp - fq); out.push([lerp(p[0], q[0], k), lerp(p[1], q[1], k)]); cut.push(fp <= 0); }
    }
    return { p: out, cut };
  }
  /* ekstrusi profil samping [z,y] setebal 2·hw di sekitar x0 */
  function ext(pr, x0, hw, m, o) {
    o = o || {}; let cut = null;
    if (o.clip) { const r = clip2(pr, o.clip); pr = r.p; cut = r.cut; }
    const N = pr.length; if (N < 3) return;
    let a2 = 0; for (let i = 0; i < N; i++) { const p = pr[i], q = pr[(i + 1) % N]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const sg = a2 > 0 ? 1 : -1, Lp = pr.map(p => ap(X, [x0 - hw, p[1], p[0]])), Rp = pr.map(p => ap(X, [x0 + hw, p[1], p[0]]));
    const tri = GLon ? earClip(pr) : null;
    face(Lp, ar(X, [-1, 0, 0]), o.ms || m, o.zb, 0, null, tri); face(Rp, ar(X, [1, 0, 0]), o.ms || m, o.zb, 0, null, tri);
    for (let i = 0; i < N; i++) {
      if (cut && cut[i]) continue;
      const j = (i + 1) % N, ez = pr[j][0] - pr[i][0], ey = pr[j][1] - pr[i][1], len = Math.hypot(ez, ey); if (len < 1e-6) continue;
      const nl = ar(X, [0, -ez / len * sg, ey / len * sg]), K = Math.max(1, Math.ceil(len / .045));
      for (let s = 0; s < K; s++) { const a = s / K, b = (s + 1) / K; face([lv(Lp[i], Lp[j], a), lv(Lp[i], Lp[j], b), lv(Rp[i], Rp[j], b), lv(Rp[i], Rp[j], a)], nl, m, o.zb); }
    }
  }
  /* rel Picatinny di atas (gigi melintang) */
  function rail(z0, z1, yb, m) {
    box([0, yb + .0022, (z0 + z1) / 2], [.0105, .0022, (z1 - z0) / 2], m || ANO);
    for (let z = z0 + .004; z < z1 - .002; z += .0099) box([0, yb + .0054, z], [.0105, .0012, .0027], m || ANO, { zb: -.001 });
  }

  /* ---------- tangan ---------- */
  const FOFF = [.027, .009, -.0092, -.026], FFW = [0, .003, -.001, -.009], FSC = [1, 1.07, 1, .8], FRD = [.0094, .0097, .0092, .0082], FLN = [.043, .027, .021];
  /* pose: K = pusat buku jari, r = arah kelingking→telunjuk, f = pergelangan→buku jari, d = punggung tangan; c = tekukan 3 ruas per jari; t = arah 3 ruas ibu jari (bobot r,d,f) */
  const pose = (K, r, f, c, t, left) => { r = nrm(r); f = nrm(ma(f, r, -dot(f, r))); return { K, r, f, d: left ? crs(f, r) : crs(r, f), c, t }; };
  function blend(a, b, k) {
    if (k <= 0) return a; if (k >= 1) return b;
    const f = nrm(lv(a.f, b.f, k)), r0 = lv(a.r, b.r, k), r = nrm(ma(r0, f, -dot(r0, f))), d0 = lv(a.d, b.d, k); let d = crs(r, f); if (dot(d, d0) < 0) d = mul(d, -1);   // f diprioritaskan: arah lengan (−f) berpindah mulus; dulu r diprioritaskan → f terpelintir & lengan sempat melintang/naik di tengah transisi
    return { K: lv(a.K, b.K, k), r, f, d, c: a.c.map((q, i) => q.map((x, j) => lerp(x, b.c[i][j], k))), t: a.t.map((q, i) => lv(q, b.t[i], k)), tb: lerp(a.tb || .02, b.tb || .02, k) };
  }
  const pxf = (B, h) => ({ K: ap(B, h.K), r: ar(B, h.r), f: ar(B, h.f), d: ar(B, h.d), c: h.c, t: h.t, tb: h.tb });
  const curl = (h, c) => Object.assign({}, h, { c });
  let GPAD = null;   // warna pelindung buku jari (diisi V.draw)
  function hand(H, gl, gk, watch) {
    const r = H.r, f = H.f, d = H.d, K = H.K, W = ma(K, f, H.kf ? -.066 : -.08);
    const fist = !!H.kf;   // kepalan pada gagang pedang: punggung tangan bulat dengan tulang jari & buku jari menonjol, tanpa pelat pelindung
    tube(ma(W, d, .001), ma(K, f, fist ? -.012 : -.004), .03, .039, fist ? 14 : 8, gl, { up: r, q0: fist ? .021 : .016, q1: fist ? .019 : .0135, ph: .39 });   // telapak
    if (fist) { for (let i = 0; i < 4; i++) { const b = ma(K, r, FOFF[i]); tube(ma(ma(W, r, FOFF[i] * .62), d, .009), ma(ma(b, d, .007), f, (H.kf || 0) * FOFF[i] - .004), .0105, .0112, 8, gl, { up: r, q0: .0058, q1: .0074 }); tube(ma(ma(b, d, .004), f, (H.kf || 0) * FOFF[i] - .007), ma(ma(b, d, .002), f, (H.kf || 0) * FOFF[i] + .006), .0128, .0118, 10, gl, { up: r }); } }   // tulang jari di punggung tangan + buku jari bulat menonjol
    else boxA(ma(ma(K, d, .0132), f, -.013), [r, d, f], [.034, .0065, .013], GPAD || gk, -.0015);           // pelindung buku jari keras (abu-abu)
    for (let i = 0; i < 4; i++) {
      const b0 = ma(K, r, FOFF[i]); let p = ma(b0, f, FFW[i] + (H.kf || 0) * FOFF[i]), th = 0; const c = H.c[i];   // kf: garis buku jari miring mengikuti gagang pedang yang melintang diagonal di telapak
      if (H.kf) tube(ma(b0, f, -.022), p, FRD[i] * 1.05, FRD[i], 6, gl, { up: r });   // pangkal jari menyambung ke telapak
      for (let j = 0; j < 3; j++) {
        th += c[j]; const dir = nrm(add(mul(f, Math.cos(th)), mul(d, -Math.sin(th)))), L = FLN[j] * FSC[i], rd = FRD[i] * (1 - j * .09) * (fist ? 1.14 : 1), q = ma(p, dir, L);
        tube(ma(p, dir, -rd * (fist ? .9 : .55)), ma(q, dir, j === 2 ? 0 : rd * .3), rd, j === 2 ? rd * .74 : rd * .95, fist ? 10 : 6, j === 0 && !fist ? gk : gl, { up: r, q0: rd * .88, q1: rd * .84 });
        p = q;
      }
    }
    let p = ma(ma(ma(W, r, .022), f, H.tb || .02), d, -.009 - (H.tb ? .005 : 0));
    for (let j = 0; j < 3; j++) {
      const t = H.t[j], dir = nrm(add(add(mul(r, t[0]), mul(d, t[1])), mul(f, t[2]))), L = [.037, .029, .023][j], rd = [.0122, .0102, .0089][j], q = ma(p, dir, L);
      tube(ma(p, dir, -rd * .45), q, rd, rd * (j === 2 ? .78 : .95), 6, gl, { up: d }); p = q;
    }
    tube(ma(W, f, -.034), ma(W, f, .006), .036, .035, fist ? 14 : 8, fist ? gl : gk, { up: r, q0: .025, q1: fist ? .024 : .022, ph: .39 });   // manset sarung tangan
    if (watch) { const wc = ma(ma(W, f, -.052), d, .021); tube(wc, ma(wc, d, .007), .0155, .0145, 12, RUB, { up: f }); tube(ma(wc, d, .007), ma(wc, d, .0085), .0118, .0118, 12, GLS, { up: f }); }   // jam taktis bulat
    return W;
  }
  /* lengan baju: dari pergelangan ke siku. Lengan bawah melanjutkan sumbu telapak (-f) dan hanya boleh menekuk
     ke arah petunjuk sejauh batas pergelangan (±WB rad, ekstensi/deviasi ulnar wajar) — tidak "patah" saat senjata berputar */
  const WB = .38;
  const SPR = [.4, -.7, .2, -.06, -.06, -.02];   // pose lari: senjata disilangkan ke dada, moncong ke kiri-atas (seperti sprint di game FPS umumnya): [pitch, yaw, roll, x, y, z] relatif pose pinggul
  let BR = I;   // putaran badan (pose lari): arah siku ikut berputar bersama senjata, bukan tertinggal di ruang pandang
  function arm(H, hint, shoulder, sl, sl2) {
    const W0 = ap(X, ma(ma(H.K, H.f, -.112), H.d, -.002)), a = nrm(ar(X, mul(H.f, -1))), h = nrm(ar(BR, sub(hint, W0)));
    const ang = Math.acos(clamp(dot(a, h), -1, 1));
    let dir = a;
    if (ang > 1e-4) { const t = Math.min(ang, H.wb || WB), s = Math.sin(ang); dir = nrm(add(mul(a, Math.sin(ang - t) / s), mul(h, Math.sin(t) / s))); }   // slerp a→h sejauh t
    const E = ma(W0, dir, .27), X0 = X, CF = H.kf ? ap(X, ma(H.K, H.f, -.094)) : null; X = I;
    if (CF) tube(CF, ma(W0, dir, .03), .0345, .0335, 12, sl2);   // kepalan katana: pergelangan menyambung manset sarung tangan ke lengan baju (dulu ada celah & ujung lengan baju terbuka → tangan tampak kopong)
    tube(W0, E, .032, .043, 10, sl, { segs: 3, cap0: !!H.kf });
    tube(ma(W0, dir, .035), ma(W0, dir, .075), .0405, .0425, 10, sl2);
    tube(E, ma(E, nrm(ar(BR, sub(shoulder, E))), .3), .045, .053, 10, sl);
    X = X0;
  }
  const CG = [[1, 1.25, .75], [1.05, 1.3, .8], [1.05, 1.3, .8], [1.1, 1.25, .75]];
  const CT = [[.5, .85, .45], CG[1], CG[2], CG[3]], CS = [[.06, .05, .04], CG[1], CG[2], CG[3]], CO = [[.25, .3, .2], [.28, .32, .2], [.3, .35, .22], [.34, .38, .25]];
  const TG = [[.45, -.6, .65], [.15, -.85, .5], [-.05, -.85, .4]], TO = [[.6, -.3, .6], [.6, -.25, .7], [.5, -.2, .8]];
  /* generator pose */
  function gripR(top, ax, trig, th) {   // tangan kanan pada pegangan pistol (th: arah ibu jari pengganti)
    const r = nrm(ax), f = nrm([-.12, -r[2], r[1]]);
    return pose(add(top, [.026, -.033, -.016]), r, f, trig ? CT : CS, th || TG);
  }
  function gripL(top, ax) {         // tangan kiri pada pegangan tegak (foregrip)
    const r = nrm(ax), f = nrm([.12, -r[2], r[1]]);
    return pose(add(top, [-.026, -.033, -.016]), r, f, CG, TG, true);
  }
  function hgL(c, R, a) {           // tangan kiri menggenggam handguard: telapak di bawah-kiri, jari membungkus sisi kanan, ibu jari rebah di sisi kiri menunjuk ke depan
    const d = [-Math.sin(a), -Math.cos(a), 0], f0 = [Math.cos(a), -Math.sin(a), 0], th = .32;   // th: jari sedikit miring ke depan (genggaman alami)
    const r = nrm(ma(mul([0, 0, 1], Math.cos(th)), f0, -Math.sin(th))), f = nrm(ma(mul(f0, Math.cos(th)), [0, 0, 1], Math.sin(th)));
    return Object.assign(pose(add(add(c, mul(d, R + .009)), mul(f, .004)), r, f, [[.72, .88, .5], [.76, .92, .5], [.76, .9, .48], [.8, .84, .45]], [[.76, -.42, .34], [.94, -.18, .24], [1, -.04, .14]], true), { tb: .036 });   // tb: pangkal ibu jari menempel ke sisi handguard
  }
  function magL(front, down, fwd) {   // tangan kiri menggenggam magasin dari depan-kiri
    return pose(add(front, [-.02, 0, -.006]), mul(down, -1), fwd || [0, 0, 1], [[.85, 1.1, .6], [.9, 1.1, .6], [.95, 1.05, .6], [1, 1, .5]], [[.2, -.55, -.7], [.1, -.7, -.6], [0, -.7, -.5]], true);
  }
  function pressL(pt) {               // telapak kiri menepuk sisi kiri senjata
    return pose(add(pt, [-.028, -.03, -.036]), [0, .9, -.45], [0, .45, .9], CO, TO, true);
  }

  /* ---------- model senjata ---------- */
  const B4 = -.066;
  /* AK-74M: tinggi sumbu laras; profil magasin [z, y] — tepi depan melengkung ke depan, dasar tegak lurus lengkungan */
  const AKB = -.063, AKMAG = [[.05, -.09], [.055, -.13], [.065, -.165], [.08, -.2], [.098, -.222], [.109, -.233], [.046, -.29], [.03, -.268], [.012, -.235], [-.008, -.19], [-.02, -.145], [-.027, -.09]];
  const GRN = mt([74, 100, 50], .1), GRN2 = mt([58, 80, 40], .08);
  let ATT = {};   // lampiran M4A1 yang aktif (fps-kit) — dibaca MODEL.AR / ARmag; diisi V.draw tiap frame
  /* DUAL (gaya Black Ops): dua magasin sejajar berdampingan, dijepit + dilakban. DS = sisi magasin sebelah relatif magasin yang terpasang
     (−1 kiri: pasangan baru; +1 kanan: setelah tukar cepat), DOFF = jarak antarsumbu, DCL = magasin sebelah yang sedang di magwell (dipotong) */
  let DS = -1, DCL = false; const DOFF = .028;
  const M4MAG = [[.039, -.086], [.042, -.13], [.047, -.17], [.054, -.205], [.064, -.238], [.058, -.246], [.02, -.254], [.012, -.252], [.004, -.218], [-.004, -.185], [-.012, -.15], [-.018, -.12], [-.02, -.086]];
  const EXMAG = M4MAG.map(([z, y]) => y < -.12 ? [z + (-.12 - y) * .3, -.12 + (y + .12) * 1.58] : [z, y]);   // magasin 45 butir: badan bawah lebih panjang, lengkungan berlanjut
  const DGL = mt([20, 26, 36], 1, 40), SCP = mt([34, 35, 36], .2), FBR = mt([230, 70, 40], .6, 30), TAPE = mt([98, 100, 70], .08, 10), FBR2 = mt([206, 52, 74], .9, 50), FBR3 = mt([238, 120, 140], 1, 60), LSR = mt([84, 88, 66], .12), GLT = mt([150, 170, 190], 1, 60);
  /* lampiran M4A1 (sumbu bidik y = 0; rel atas y ≈ −0,041; rel samping x = ±0,0297; rel bawah y = B4 − 0,0297) */
  function arAtt(st) {
    const A = ATT;
    if (A.ACOG) {   // Trijicon ACOG TA31 (sesuai foto): dudukan flattop + 2 mur bergerigi kiri, badan tempa bersegi dengan tudung depan miring
      // & panel fiber optik merah lebar di atas, turet atas & kanan, tabung lensa mata ramping + kerah beralur + karet berusuk
      ext([[-.062, -.0415], [.026, -.0415], [.026, -.034], [-.062, -.034]], 0, .0128, ANO);                                       // pelat klem di rel
      for (const s of [-1, 1]) box([s * .0122, -.0448, -.018], [.0016, .0042, .044], ANO);                                        // rahang klem memeluk sisi rel
      ext([[-.054, -.0342], [.02, -.0342], [.014, -.0165], [-.044, -.0165]], 0, .0108, ANO);                                      // tiang dudukan (trapesium) sampai menyentuh badan
      for (const z of [-.046, .009]) {   // mur klem bergerigi besar (sisi kiri) + ujung baut (kanan)
        tube([-.0128, -.0385, z], [-.0196, -.0385, z], .0064, .0064, 14, ANO, { up: [0, 0, 1] }); tube([-.0196, -.0385, z], [-.0212, -.0385, z], .0058, .0052, 14, ANO, { up: [0, 0, 1], m1: INN });
        for (const x of [-.0148, -.0164, -.018]) tube([x, -.0385, z], [x - .0006, -.0385, z], .0066, .0066, 14, INN, { up: [0, 0, 1] });
        box([-.0213, -.0385, z], [.0004, .0036, .0008], INN, { zb: -.001 }); tube([.0128, -.0385, z], [.0142, -.0385, z], .0036, .0036, 8, INN, { up: [0, 0, 1] });
      }
      // badan tempa: prisma segi delapan (sudut tumpul) yang membesar ke depan, tudung depan terbuka + bibir atas menjorok (ujung miring)
      const HY = -.002, R0 = .0195, R1 = .0248, Rz = z => R0 + (R1 - R0) * clamp((z + .032) / .076, 0, 1), top = z => HY + Rz(z) * .924;
      tube([0, HY, -.032], [0, HY, .044], R0, R1, 8, SCP, { ph: .3927, cap1: false });
      tube([0, HY, .044], [0, HY, .06], R1, R1, 8, SCP, { ph: .3927, cap0: false, cap1: false }); tube([0, HY, .059], [0, HY, .044], R1 - .0014, R1 - .0014, 8, INN, { ph: .3927, inner: true, cap0: false, cap1: false });
      box([0, top(.06) - .0008, .0645], [R1 * .383, .0011, .0048], SCP);                                                           // bibir atas tudung (sunshade)
      for (const s of [-1, 1]) box([s * R1 * .924, HY, .006], [.0003, .0011, .036], INN, { zb: -.001 });                          // garis tempa di sisi
      if (st.lens > .3) { disc([0, HY, .0452], [0, 0, 1], .0228, 16, INN, 0); disc([0, 0, .0456], [0, 0, 1], .0182, 20, DGL, .94, -.001); disc([.0062, .0072, .046], [0, 0, 1], .0042, 10, GLT, .45, -.002); }   // lensa objektif (hanya dari luar)
      { // panel fiber optik merah lebar di atap, mengikuti kemiringan atap (pengumpul cahaya retikel) + bingkai gelap
        const a = Math.atan2(top(.044) - top(-.004), .048), up = [0, Math.cos(a), -Math.sin(a)], fw = [0, Math.sin(a), Math.cos(a)];
        boxA([0, top(.02) + .0016, .024], [[1, 0, 0], up, fw], [R1 * .5, .0017, .031], SCP);                                       // bingkai gelap (lebih lebar dari atap → tepinya menaungi sisi miring)
        boxA([0, top(.02) + .0036, .025], [[1, 0, 0], up, fw], [R1 * .46, .0011, .029], FBR2, -.001);                             // panel merah lebar
        box([0, top(.06) + .0028, .059], [R1 * .46, .0013, .007], FBR2); box([0, top(.06) + .0012, .059], [R1 * .5, .0014, .0075], SCP);   // lanjut di atas tudung, ujung menjorok
        for (const s of [-1, 1]) boxA([s * R1 * .47, top(.02) + .0028, .025], [[1, 0, 0], up, fw], [.0005, .0008, .029], FBR3, -.002);   // tepi samping panel berkilau merah muda
      }
      // turet elevasi (atas) & windage (kanan): dudukan, tutup bergerigi
      const tt = top(-.016), tw = HY + Rz(-.016) * .924;
      tube([0, tt - .001, -.016], [0, tt + .0055, -.016], .0094, .0094, 14, SCP); tube([0, tt + .0055, -.016], [0, tt + .0105, -.016], .0086, .0086, 14, SCP, { m1: INN });
      for (const k of [0, 1, 2]) tube([0, tt + .0068 + k * .0012, -.016], [0, tt + .0073 + k * .0012, -.016], .0088, .0088, 14, INN);
      tube([tw - .001, 0, -.016], [tw + .0055, 0, -.016], .0094, .0094, 14, SCP, { up: [0, 0, 1] }); tube([tw + .0055, 0, -.016], [tw + .0105, 0, -.016], .0086, .0086, 14, SCP, { up: [0, 0, 1], m1: INN });
      for (const k of [0, 1, 2]) tube([tw + .0068 + k * .0012, 0, -.016], [tw + .0073 + k * .0012, 0, -.016], .0088, .0088, 14, INN, { up: [0, 0, 1] });
      // lensa mata: kerah beralur, tabung ramping, karet berusuk (posisi lensa mata TETAP: z −0,092, r 0,0128 → HOLE saat membidik)
      const oc = { cap0: false, cap1: false };
      tube([0, 0, -.042], [0, 0, -.032], .0168, .0168, 20, SCP, oc); for (const z of [-.04, -.0372, -.0344]) tube([0, 0, z], [0, 0, z + .0011], .0171, .0171, 20, INN, oc);
      tube([0, 0, -.074], [0, 0, -.042], .0138, .0138, 20, SCP, { segs: 2, cap0: false, cap1: false });
      tube([0, 0, -.094], [0, 0, -.074], .0158, .0172, 28, RUB, oc); annulus([0, 0, -.094], [0, 0, -1], .0128, .0158, 28, RUB);   // 28 sisi: cincin karet tidak bersegi saat membidik
      for (const z of [-.0885, -.0835, -.0785]) tube([0, 0, z], [0, 0, z + .0018], .0176 - (z + .094) * .07, .0176 - (z + .094) * .07, 28, RUB, oc);
      disc([0, 0, -.092], [0, 0, 1], .0128, 28, DGL, .96); disc([-.0042, .0048, -.0925], [0, 0, 1], .0034, 10, GLT, .5, -.001);   // lensa mata pekat (tidak tembus pandang); saat membidik HOLE melubanginya seperti iris membuka
    }
    if (A.MED || A.HIGH) {   // teropong menengah (LPVO 1–6×) / jauh (3–15×50): lensa mata, tabung 30 mm, turet, lonceng objektif, dudukan kantilever
      const H = !!A.HIGH, z0 = H ? -.16 : -.14, ze = H ? -.112 : -.1, zo = H ? .1 : .085, z1 = H ? .175 : .12, ro = H ? .026 : .0165, re = H ? .0185 : .0175;
      tube([0, 0, z0], [0, 0, z0 + .012], re, re, 16, RUB, { m0: DGL }); tube([0, 0, z0 + .012], [0, 0, ze], re, .0127, 16, SCP);
      disc([-re * .34, re * .38, z0 - .0006], [0, 0, 1], re * .26, 10, GLT, .4, -.001);   // kilau lensa mata
      tube([0, 0, ze], [0, 0, zo], .0127, .0127, 16, SCP, { segs: 4 }); tube([0, 0, zo], [0, 0, z1 - .012], .0127, ro, 16, SCP); tube([0, 0, z1 - .012], [0, 0, z1], ro, ro, 16, SCP, { m1: DGL });

      const tz = (ze + zo) / 2 - .01, th = H ? .029 : .024;
      tube([0, .012, tz], [0, th, tz], .0092, .0092, 12, SCP, { up: [0, 0, 1] }); tube([.012, 0, tz], [th, 0, tz], .0092, .0092, 12, SCP, { up: [0, 0, 1] });
      for (let k = 0; k < 6; k++) box([0, th + .0004, tz - .006 + k * .0024], [.0085, .0005, .0004], INN, { zb: -.001 });
      if (H) tube([-.012, 0, tz], [-.026, 0, tz], .0098, .0098, 12, SCP, { up: [0, 0, 1] });   // turet paralaks kiri
      else tube([.007, -.011, ze - .002], [.018, -.011, ze - .002], .003, .003, 6, STL, { up: [0, 0, 1] });   // tuas pembesaran
      box([0, -.036, (-.08 + .06) / 2], [.0115, .0055, .07], ANO);
      for (const z of [-.06, .045]) { tube([0, 0, z - .007], [0, 0, z + .007], .0148, .0148, 16, ANO); box([0, -.024, z], [.0082, .0078, .007], ANO); for (const s of [-1, 1]) box([s * .009, -.026, z], [.0014, .0032, .0032], STL); }
    }
    if (A.SUP) {   // peredam tabung baja hitam menggantikan flash hider
      tube([0, B4, .438], [0, B4, .452], .0105, .0105, 12, PRK);
      tube([0, B4, .452], [0, B4, .62], .0172, .0172, 16, SCP, { segs: 3 }); annulus([0, B4, .62], [0, 0, 1], .005, .0172, 16, SCP); disc([0, B4, .6195], [0, 0, 1], .005, 10, INN, 0, -.001);
      for (const z of [.47, .6]) tube([0, B4, z], [0, B4, z + .004], .0176, .0176, 16, INN);
    }
    if (A.GRIP) {   // pegangan depan bergaya AUG (sesuai gambar pengguna): LOOP TERTUTUP — batang depan miring ke bawah-belakang, batang bawah,
      // pegangan belakang tegak (miring ke belakang) dengan 4 lekuk jari di sisi depan; klem rel panjang. Profil digambar ulang dari gambar
      // (piksel x ke kiri = depan), skala K m/piksel; tangan kiri menggenggam pegangan belakang, jari masuk ke dalam loop
      const K = .00033, Y0 = B4 - .036, Z0 = .132, P = (x, y) => [Z0 + (430 - x) * K, Y0 - (y - 70) * K];
      box([0, B4 - .0325, .184], [.0105, .0042, .058], ANO); for (const z of [.14, .228]) for (const s of [-1, 1]) box([s * .0108, B4 - .0325, z], [.0012, .003, .005], STL);   // klem rel + baut
      ext([P(102, 70), P(188, 70), P(338, 290), P(415, 290), P(420, 333), P(298, 334), P(282, 322)], 0, .0085, POL);   // batang depan miring + batang bawah
      const fr = [], rr = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16, y = 70 + t * 252, cx = 388 + t * 52, g = i > 1 && i < 15 && i % 3 === 0 ? 10 : 0; fr.push(P(cx - 34 + g, y)); rr.push(P(cx + 34 - t * 6, y)); }
      ext(fr.concat([P(410, 334), P(466, 334)], rr.reverse()), 0, .0112, POL);   // pegangan belakang + lekuk jari
      for (const s of [-1, 1]) ext([P(372, 120), P(410, 120), P(440, 290), P(404, 290)], s * .0112, .0006, RUB);   // panel karet bertekstur di kedua sisi
    }
    if (A.LASER) {   // modul laser bidik (gaya PEQ) di rel samping kanan + tombol tekan
      box([.0322, B4, .2], [.0024, .0085, .02], ANO);
      box([.0445, B4 + .002, .205], [.0105, .0158, .028], LSR); box([.0445, B4 + .019, .2], [.006, .0018, .012], INN);
      tube([.04, B4 + .007, .233], [.04, B4 + .007, .2345], .0045, .0045, 10, INN); disc([.04, B4 + .007, .2348], [0, 0, 1], .0032, 10, FBR, 0, -.001);
      tube([.05, B4 - .006, .233], [.05, B4 - .006, .2345], .0035, .0035, 10, INN);
    }
  }
  const MODEL = {
    /* M4A1 (sesuai foto referensi): upper flat-top + pejera belakang lipat (berdiri), handguard quad rail KAC RAS polos,
       front sight A-frame, laras 14,5", flash hider A2, pegangan A2, popor SOPMOD Crane, magasin USGI — serba hitam */
    AR(st) {
      ext([[-.112, -.077], [.074, -.077], [.074, -.041], [-.112, -.041]], 0, .0125, ANO);                                   // upper receiver
      rail(-.108, .072, -.041);
      tube([.0125, -.053, -.068], [.021, -.05, -.1], .0066, .006, 8, ANO); tube([.021, -.05, -.1], [.0225, -.0497, -.106], .0072, .0072, 8, ANO);   // forward assist
      box([.0129, -.061, -.033], [.0006, .0068, .026], INN, { zb: -.002 }); box([.0131, -.0685, -.033], [.0006, .0012, .027], ANO);                 // lubang ejeksi + engsel penutup debu
      ext([[-.064, -.049], [-.056, -.049], [-.058, -.064], [-.07, -.064]], .0145, .002, ANO);                                 // deflektor selongsong
      box([0, -.0435, -.116 - st.ch], [.006, .0025, .006], ANO); box([0, -.0435, -.121 - st.ch], [.021, .0028, .0042], ANO);  // tuas kokang
      // pejera belakang lipat (posisi berdiri): penjepit rel, dua sayap pelindung, cincin intip — terlipat rebah bila ada optik
      const opt = ATT.ACOG || ATT.MED || ATT.HIGH;
      if (opt) box([0, -.0352, -.104], [.0105, .0034, .0125], ANO);
      else {
      box([0, -.0318, -.086], [.0105, .0027, .015], ANO);
      for (const s of [-1, 1]) ext([[-.098, -.031], [-.074, -.031], [-.079, -.01], [-.083, .0085], [-.093, .0085], [-.096, -.01]], s * .0068, .0017, ANO);
      box([0, -.0165, -.088], [.0026, .0112, .0016], ANO);
      tube([0, 0, -.0898], [0, 0, -.0862], .0064, .0064, 16, ANO, { cap0: false, cap1: false }); tube([0, 0, -.0898], [0, 0, -.0862], .0034, .0034, 16, INN, { inner: true });
      annulus([0, 0, -.0898], [0, 0, -1], .0034, .0064, 16, ANO); annulus([0, 0, -.0862], [0, 0, 1], .0034, .0064, 16, ANO);
      tube([.0068, -.021, -.088], [.0128, -.021, -.088], .0042, .0042, 10, ANO, { up: [0, 0, 1] });                       // drum windage
      }
      ext([[-.112, -.077], [.046, -.077], [.046, -.093], [-.026, -.096], [-.088, -.096], [-.104, -.093], [-.112, -.087]], 0, .0124, ANO);   // lower receiver
      ext([[.045, -.088], [.043, -.124], [.046, -.131], [-.024, -.131], [-.021, -.124], [-.023, -.094]], 0, .0142, ANO);    // magwell
      for (const s of [-1, 1]) ext([[.03, -.077], [.046, -.077], [.046, -.086], [.036, -.088]], s * .0128, .0006, ANO, { zb: -.001 });   // penguat depan magwell
      box([0, -.1185, -.048], [.0032, .0021, .023], ANO); box([0, -.108, -.025], [.0032, .011, .0024], ANO);                 // pelindung pelatuk
      box([0, -.104, -.043], [.0026, .0074, .0026], STL, { p: -.35 + st.trig * .35 });                                        // pelatuk
      ext([[-.071, -.095], [-.074, -.113], [-.079, -.131], [-.083, -.15], [-.088, -.168], [-.095, -.186], [-.13, -.186], [-.126, -.166], [-.116, -.138], [-.107, -.11], [-.101, -.095]], 0, .0142, POL);   // pegangan A2
      for (let k = 0; k < 4; k++) box([-.0145, -.12 - k * .014, -.106 - k * .0045], [.0005, .0028, .009], RUB, { zb: -.001 });   // tekstur pegangan
      for (const s of [-1, 1]) {
        tube([s * .0124, -.084, -.088], [s * .0146, -.084, -.088], .0046, .0046, 8, ANO, { up: [0, 0, 1] });               // selektor
        box([s * .0149, -.0815, -.096], [.0011, .0022, .0085], ANO, { p: .3, zb: -.002 });
        for (const z of [.04, -.1]) tube([s * .0124, -.074, z], [s * .0136, -.074, z], .0028, .0028, 6, STL, { up: [0, 0, 1], zb: -.001 });   // pin bongkar
      }
      box([-.0134, -.082, -.036], [.0011, .0062, .0052], ANO, { zb: -.002 });                                                // bolt catch
      tube([.0124, -.086, -.019], [.0143, -.086, -.019], .0045, .0045, 8, STL, { up: [0, 0, 1] });                           // tombol magasin
      tube([0, B4, -.112], [0, B4, -.118], .0175, .0175, 10, ANO); tube([0, B4, -.118], [0, B4, -.124], .0165, .0165, 10, ANO, { ph: .3 });   // mur kastil + pelat ujung
      if (st.rear) {   // buffer tube + popor SOPMOD Crane (tersembunyi di bawah pipi saat membidik/reload)
        tube([0, B4, -.124], [0, B4, -.29], .0145, .0145, 12, ANO, { segs: 2 });
        ext([[-.168, -.047], [-.2, -.045], [-.298, -.05], [-.315, -.058], [-.318, -.172], [-.296, -.178], [-.262, -.146], [-.214, -.114], [-.19, -.1], [-.168, -.092]], 0, .0215, POL);
        for (const s of [-1, 1]) { tube([s * .0228, -.08, -.188], [s * .0228, -.091, -.284], .0098, .0098, 10, POL, { m0: RUB, m1: RUB }); box([s * .0218, -.052, -.24], [.0012, .004, .05], POL); }   // tabung baterai
        box([0, -.115, -.3205], [.0232, .063, .0045], RUB); tube([0, -.09, -.172], [0, -.106, -.172], .006, .006, 8, STL);   // bantalan + tuas popor
      }
      // handguard quad rail (KAC RAS): inti oktagonal, rel bergerigi di keempat sisi, lubang ventilasi di sudut
      tube([0, B4, .074], [0, B4, .08], .021, .021, 12, ANO);                                                                 // mur laras
      tube([0, B4, .078], [0, B4, .246], .026, .026, 8, ANO, { ph: .3927, segs: 4 });
      rail(.08, .244, -.042);
      for (const s of [-1, 1]) {
        box([s * .0262, B4, .162], [.0024, .0102, .082], ANO);
        for (let z = .084; z < .242; z += .0099) box([s * .0297, B4, z], [.0012, .0102, .0027], ANO, { zb: -.001 });       // gigi rel samping
        for (const q of [1, -1]) for (let z = .094; z < .24; z += .0245) box([s * .0172, B4 + q * .0172, z], [.0046, .0007, .0068], INN, { r: s * q > 0 ? -.785 : .785, zb: -.001 });   // ventilasi
      }
      box([0, B4 - .0262, .162], [.0102, .0024, .082], ANO);
      for (let z = .084; z < .242; z += .0099) box([0, B4 - .0297, z], [.0102, .0012, .0027], ANO, { zb: -.001 });         // gigi rel bawah
      box([0, B4 + .0262 + .0042, .247], [.0108, .0042, .002], ANO);                                                          // ujung depan rel
      tube([0, B4, .246], [0, B4, .262], .0105, .0105, 10, PRK); tube([0, B4, .262], [0, B4, .292], .013, .013, 10, PRK);    // laras + cincin FSB
      ext([[.262, -.056], [.292, -.056], [.286, -.03], [.283, -.019], [.271, -.019], [.267, -.03]], 0, .0058, PRK);           // menara front sight A-frame
      for (const s of [-1, 1]) ext([[.27, -.02], [.284, -.02], [.282, -.004], [.273, -.004]], s * .0072, .0016, PRK);         // telinga pelindung
      if (!opt) box([0, -.0095, .2775], [.0011, .0095, .0012], PRK);                                                           // pejera depan (disembunyikan saat memakai optik)
      box([0, B4 - .017, .277], [.0034, .0045, .009], PRK);                                                                   // lug bayonet
      tube([0, B4 - .016, .262], [0, B4 - .016, .27], .0042, .0042, 8, PRK, { up: [0, 0, 1] });                              // cincin tali sandang
      tube([0, B4, .292], [0, B4, .443], .0078, .0078, 12, PRK, { segs: 3 });
      tube([0, B4, .438], [0, B4, .443], .0088, .0088, 12, PRK);                                                              // mur pengunci
      if (!ATT.SUP) {
        tube([0, B4, .443], [0, B4, .496], .0105, .0105, 12, PRK, { m1: INN });                                              // flash hider A2 birdcage
        box([0, B4 + .0103, .471], [.0022, .0008, .012], INN, { zb: -.001 }); for (const s of [-1, 1]) for (const q of [-1, 1]) box([s * .0089, B4 + q * .0052, .471], [.0008, .0018, .012], INN, { r: s * q * .52, zb: -.001 });
      }
      arAtt(st);
    },
    ARmag(clip, out) {
      const sec = (pr, y, dz) => {   // [belakang, depan] profil magasin pada ketinggian y
        let b = 9, f = -9; for (let i = 0; i < pr.length; i++) { const p = pr[i], q = pr[(i + 1) % pr.length]; if ((p[1] - y) * (q[1] - y) > 0 || p[1] === q[1]) continue; const z = p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + dz; b = Math.min(b, z); f = Math.max(f, z); }
        return [b, f];
      };
      const tapeBand = y => {   // lilitan miring mengikuti lengkung magasin: selongsong tipis sedikit lebih besar dari gabungan dua magasin
        const s1 = sec(M4MAG, y, 0), b = s1[0], f = s1[1], cx = DS * DOFF / 2, hx = DOFF / 2 + .0138;
        const fa = sec(M4MAG, y + .012, 0)[1], fb = sec(M4MAG, y - .012, 0)[1], up = nrm([0, .024, fa - fb]), fw = [0, -up[2], up[1]];
        boxA([cx, y, (b + f) / 2], [[1, 0, 0], up, fw], [hx, .0062, (f - b) / 2 * up[1] + .0016], TAPE);
        for (const s of [-1, 1]) box([cx + s * (hx + .0002), y + .0035, f - .006], [.0004, .0016, .0035], TAPE, { zb: -.001 });   // ujung lakban terlipat
      };   // magasin USGI aluminium 30 butir · lampiran: 45 butir (EXT) / dua magasin dilakban (DUAL)
      const ex = ATT.EXT, PR = ex ? EXMAG : M4MAG, bp = [[.064, -.238], [.058, -.246], [.02, -.254], [.012, -.252], [.014, -.244], [.056, -.236]];
      const cl = ATT.DUAL && DCL ? null : clip, MAG = mt([32, 33, 35], .22), RIB = mt([40, 41, 43], .25);   // tukar cepat: yang dipotong magwell adalah magasin sebelah
      const body = c => { ext(PR, 0, .0122, MAG, { clip: c }); for (const r of [[[.002, -.132], [.01, -.132], [.022, -.212], [.014, -.212]], [[.022, -.132], [.03, -.132], [.044, -.212], [.036, -.212]]]) for (const s of [-1, 1]) ext(r, s * .0124, .0005, RIB, { clip: c, zb: -.001 }); };   // badan + rusuk tekan
      body(cl);
      ext(ex ? bp.map(([z, y]) => [z + (-.12 - y) * .3 - .0, -.12 + (y + .12) * 1.58]) : bp, 0, .0132, RUB);           // pelat dasar
      if (out) { tube([0, -.083, -.012], [0, -.083, .03], .0047, .0047, 8, BRS); tube([0, -.083, .03], [0, -.083, .042], .0047, .0016, 8, CPR); }
      if (ATT.DUAL) {   // magasin kedua sejajar di sebelahnya (penjepit + lakban), puncaknya rata dengan magwell → bisa ditukar ke kedua arah
        const X0 = X; X = cmp(X0, bone([0, 0, 0], [DS * DOFF, 0, 0], 0, 0, 0));
        body(DCL ? clip : null); ext(bp, 0, .0132, RUB);
        if (DS < 0 && out) { tube([0, -.083, -.012], [0, -.083, .03], .0047, .0047, 8, BRS); tube([0, -.083, .03], [0, -.083, .042], .0047, .0016, 8, CPR); }   // magasin sebelah yang masih penuh: peluru teratas tampak saat pasangan dicabut
        X = X0;
        for (const y of [-.148, -.19]) tapeBand(y);   // dua lilitan lakban membungkus kedua magasin
        box([DS * DOFF / 2, -.163, .018], [DOFF / 2 - .011, .006, .016], mt([22, 22, 24], .3));   // penjepit polimer di antara keduanya (di bawah magwell)
      }
    },
    /* AK-74M kustom (kelas ANTIARMOR, sesuai gambar referensi): receiver hitam ber-dust cover + pejera intip di ujung belakang,
       handguard polimer hijau ber-slot, pegangan & magasin 5,45 hijau melengkung, popor rangka lipat, blok pejera depan +
       rem moncong AK-74, bayonet 6H5 terpasang di bawah laras. Pembawa baut + tuas kokang kanan pada st.ch */
    AK(st) {
      const BK = AKB, X0 = X;
      ext([[-.2, -.042], [.088, -.042], [.088, -.096], [.052, -.1], [-.03, -.1], [-.112, -.098], [-.2, -.086]], 0, .0146, ANO);   // receiver
      tube([0, -.043, -.19], [0, -.043, .07], .011, .011, 12, ANO, { q0: .0136, q1: .0136, segs: 3 });                     // dust cover
      for (let z = -.17; z < .06; z += .046) box([0, -.0322, z], [.004, .0008, .006], ANO, { zb: -.001 });                  // rusuk dust cover
      // pejera belakang intip di ujung dust cover: dudukan, dua telinga, cincin pada sumbu bidik
      box([0, -.0305, -.172], [.0105, .0035, .016], ANO);
      for (const s of [-1, 1]) ext([[-.184, -.028], [-.16, -.028], [-.164, .007], [-.18, .007]], s * .0068, .0017, ANO);
      box([0, -.0155, -.172], [.0026, .0125, .0016], ANO);
      tube([0, 0, -.174], [0, 0, -.1704], .0062, .0062, 16, ANO, { cap0: false, cap1: false }); tube([0, 0, -.174], [0, 0, -.1704], .0033, .0033, 16, INN, { inner: true });
      annulus([0, 0, -.174], [0, 0, -1], .0033, .0062, 16, ANO); annulus([0, 0, -.1704], [0, 0, 1], .0033, .0062, 16, ANO);
      // lubang ejeksi kanan + pembawa baut & tuas kokang (mundur saat menembak / dikokang)
      box([.0147, -.058, -.035], [.0006, .0075, .032], INN, { zb: -.002 });
      X = cmp(X0, bone([0, 0, 0], [0, 0, -st.ch], 0, 0, 0));
      box([.0145, -.058, -.03], [.0005, .006, .026], STL, { zb: -.003 });
      tube([.0146, -.055, .028], [.031, -.055, .028], .0038, .0044, 8, ANO, { up: [0, 0, 1] }); tube([.031, -.055, .028], [.038, -.055, .028], .0058, .0058, 10, ANO, { up: [0, 0, 1] });
      X = X0;
      // tuas pengaman besar di kanan + paku keling + tuas magasin
      ext([[-.128, -.049], [-.02, -.049], [-.02, -.057], [-.112, -.062], [-.128, -.058]], .0152, .0008, ANO);
      ext([[-.032, -.057], [-.016, -.057], [-.016, -.073], [-.027, -.073]], .0155, .001, ANO);
      for (const s of [-1, 1]) for (const [z, y] of [[.062, -.088], [.077, -.088], [.07, -.07], [-.14, -.09], [-.17, -.075]]) tube([s * .0146, y, z], [s * .0153, y, z], .0021, .0021, 8, STL, { up: [0, 0, 1] });
      box([0, -.105, -.036], [.0062, .0065, .0028], ANO, { p: .3 });
      // pelindung & pelatuk
      box([0, -.1215, -.066], [.0032, .0021, .03], ANO); box([0, -.111, -.037], [.0032, .011, .0024], ANO);
      box([0, -.108, -.074], [.0026, .0078, .0026], STL, { p: -.35 + st.trig * .35 });
      // pegangan pistol hijau bertekstur
      ext([[-.098, -.098], [-.102, -.12], [-.109, -.15], [-.116, -.178], [-.12, -.196], [-.158, -.196], [-.153, -.176], [-.142, -.14], [-.134, -.112], [-.128, -.098]], 0, .0145, GRN);
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) box([s * .0146, -.125 - k * .016, -.122 - k * .0052], [.0004, .0042, .011], GRN2, { zb: -.001 });
      if (st.rear) {   // popor rangka lipat: adaptor + engsel, batang atas, penyangga miring, pelat popor + bantalan
        box([0, -.062, -.209], [.0135, .024, .009], ANO); tube([-.0145, -.064, -.205], [.0145, -.064, -.205], .0055, .0055, 10, STL, { up: [0, 0, 1] });
        tube([0, -.052, -.218], [0, -.052, -.33], .0095, .0095, 10, ANO, { segs: 2 });
        tube([0, -.084, -.222], [0, -.136, -.322], .0068, .0068, 8, ANO, { segs: 2 });
        ext([[-.322, -.041], [-.344, -.039], [-.35, -.05], [-.35, -.152], [-.332, -.158], [-.322, -.148]], 0, .0155, ANO);
        box([0, -.098, -.3525], [.0165, .057, .0035], RUB);
      }
      // handguard polimer hijau panjang gaya AK-12: menutup laras sampai blok gas, enam slot per sisi, kepala baut; tutup depan logam
      ext([[.088, -.037], [.396, -.037], [.41, -.043], [.41, -.09], [.396, -.096], [.088, -.096]], 0, .0188, GRN);
      box([0, -.0366, .25], [.0106, .0012, .15], GRN2, { zb: -.001 });   // rusuk atas
      for (const s of [-1, 1]) {
        for (let z = .14; z < .4; z += .05) box([s * .019, -.05, z], [.0006, .0027, .016], INN, { zb: -.001 });
        for (const z of [.115, .215, .315, .385]) tube([s * .0188, -.077, z], [s * .0196, -.077, z], .0028, .0028, 8, GRN2, { up: [0, 0, 1] });
      }
      tube([0, BK, .41], [0, BK, .418], .0168, .0168, 10, ANO);
      // blok gas + pejera depan menyatu (AK-12): cincin laras, menara, telinga pelindung, tiang pejera (puncak di sumbu bidik)
      ext([[.418, -.075], [.452, -.075], [.452, -.036], [.444, -.03], [.426, -.03], [.418, -.036]], 0, .0108, PRK);
      ext([[.43, -.031], [.446, -.031], [.444, -.012], [.432, -.012]], 0, .0042, PRK);
      for (const s of [-1, 1]) ext([[.427, -.03], [.448, -.03], [.446, .005], [.429, .005]], s * .0086, .0016, PRK);
      box([0, -.006, .438], [.0011, .006, .0012], PRK);
      // laras panjang menjulur dari blok gas (sepanjang laras M4A1 di depan handguard) + mur + lug bayonet di bawah laras
      tube([0, BK, .452], [0, BK, .562], .0078, .0078, 12, PRK, { segs: 3 });
      tube([0, BK, .54], [0, BK, .562], .0094, .0094, 12, PRK);
      box([0, -.076, .552], [.0042, .0055, .01], PRK);
      // rem moncong panjang AK-12: tiga jendela samping, celah atas, mulut
      tube([0, BK, .562], [0, BK, .666], .0112, .0112, 12, PRK, { segs: 3 }); disc([0, BK, .6662], [0, 0, 1], .0056, 10, INN, 0, -.001);
      for (const s of [-1, 1]) for (const z of [.596, .62, .644]) box([s * .0111, BK, z], [.0008, .0052, .0075], INN, { zb: -.001 });
      for (const z of [.578, .588]) box([0, BK + .011, z], [.0034, .0008, .003], INN, { zb: -.001 });
      // bayonet panjang: gagang hitam di bawah laras (kait di lug), cincin di rem moncong + pelindung silang, bilah baja mengilap
      tube([0, -.091, .553], [0, -.091, .645], .0095, .0108, 10, RUB, { q0: .0085, q1: .009, segs: 2 }); tube([0, -.091, .547], [0, -.091, .553], .0082, .0095, 10, STL);
      tube([0, BK, .645], [0, BK, .655], .0136, .0136, 12, STL, { cap0: false, cap1: false });
      ext([[.645, -.072], [.655, -.072], [.655, -.108], [.645, -.108]], 0, .0064, STL);
      ext([[.655, -.081], [.861, -.081], [.911, -.093], [.869, -.104], [.655, -.106]], 0, .0022, CHR);
      box([0, -.0835, .757], [.0024, .0017, .1], STL, { zb: -.001 });   // punggung bilah
      box([0, -.093, .749], [.0024, .0012, .07], INN, { zb: -.001 });    // alur darah
    },
    AKmag(clip, out) {   // magasin 5,45 polimer hijau melengkung (gaya AK-74) + rusuk samping + pelat dasar
      ext(AKMAG, 0, .0128, GRN, { clip });
      for (const s of [-1, 1]) for (const r of [[[.024, -.125], [.03, -.125], [.044, -.18], [.038, -.18]], [[.042, -.19], [.048, -.19], [.07, -.235], [.064, -.235]]]) ext(r, s * .013, .0005, GRN2, { clip, zb: -.001 });
      ext([[.109, -.233], [.046, -.29], [.038, -.282], [.101, -.225]], 0, .0138, GRN2);
      if (out) { tube([0, -.087, -.014], [0, -.087, .03], .0045, .0045, 8, BRS); tube([0, -.087, .03], [0, -.087, .043], .0045, .0016, 8, CPR); }
    },
    /* SIG MPX (sesuai foto referensi): upper bersudut, handguard M-LOK ramping dengan dua baris lubang miring tembus
       + rel atas menerus, muzzle brake berlubang, red dot mikro bertutup lensa di riser, magasin 9 mm melengkung
       di depan pelatuk, adaptor lipat + popor teleskopik berongga — serba hitam */
    SMG(st) {
      const BS = -.062, EDG = mt([28, 29, 31], .35);
      ext([[-.108, -.078], [.07, -.078], [.07, -.047], [.065, -.041], [-.102, -.041], [-.108, -.047]], 0, .0128, ANO);       // upper receiver
      for (const s of [-1, 1]) box([s * .0129, -.0475, -.02], [.0005, .0012, .085], EDG, { zb: -.001 });                     // bevel atas
      rail(-.104, .296, -.041);                                                                                                 // rel atas menerus sampai ujung handguard
      box([.0131, -.061, -.038], [.0006, .0062, .021], INN, { zb: -.002 }); box([.0133, -.0682, -.038], [.0006, .0011, .022], ANO);   // lubang ejeksi + penutup
      ext([[-.068, -.05], [-.06, -.05], [-.062, -.064], [-.074, -.064]], .0143, .002, ANO);                                    // deflektor selongsong
      box([0, -.0435, -.114 - st.ch], [.006, .0025, .006], ANO); box([0, -.0435, -.119 - st.ch], [.021, .0028, .0042], ANO);   // tuas kokang ambi
      for (const s of [-1, 1]) box([s * .0205, -.0435, -.117 - st.ch], [.0025, .0032, .0052], ANO);
      // lower: magwell lebar di depan pelatuk, pelindung pelatuk, kontrol ambi
      ext([[-.108, -.078], [.06, -.078], [.064, -.088], [.056, -.097], [-.03, -.098], [-.09, -.096], [-.106, -.09]], 0, .0124, ANO);
      ext([[.06, -.088], [.063, -.122], [.068, -.131], [.004, -.131], [.008, -.122], [.006, -.096]], 0, .0138, ANO);          // magwell (melebar di bawah)
      for (const s of [-1, 1]) box([s * .0139, -.11, .034], [.0005, .011, .018], EDG, { zb: -.001 });                       // ceruk genggam magwell
      box([0, -.1185, -.03], [.0032, .0021, .031], ANO); box([0, -.108, .002], [.0032, .011, .0024], ANO);                    // pelindung pelatuk
      box([0, -.104, -.022], [.0026, .0074, .0026], STL, { p: -.35 + st.trig * .35 });                                        // pelatuk
      ext([[-.071, -.095], [-.074, -.113], [-.078, -.131], [-.081, -.15], [-.085, -.168], [-.09, -.188], [-.128, -.188], [-.124, -.166], [-.115, -.138], [-.107, -.11], [-.101, -.095]], 0, .0145, POL);   // pegangan polimer
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) box([s * .0146, -.122 - k * .015, -.104 - k * .0048], [.0003, .0058, .012], mt([40, 40, 42], .04), { zb: -.001 });   // tekstur
      for (const s of [-1, 1]) {
        tube([s * .0124, -.084, -.088], [s * .0146, -.084, -.088], .0046, .0046, 8, ANO, { up: [0, 0, 1] }); box([s * .0149, -.0815, -.096], [.0011, .0022, .0085], ANO, { p: .3, zb: -.002 });   // selektor ambi
        tube([s * .0124, -.086, .066], [s * .0145, -.086, .066], .0042, .0042, 8, STL, { up: [0, 0, 1] });                   // tombol magasin
        for (const z of [.05, -.1]) tube([s * .0124, -.072, z], [s * .0136, -.072, z], .0026, .0026, 6, STL, { up: [0, 0, 1], zb: -.001 });
      }
      // adaptor lipat (engsel bulat) + tabung + popor teleskopik
      tube([0, BS, -.108], [0, BS, -.124], .0165, .0165, 12, ANO); tube([.0, -.05, -.128], [0, -.092, -.128], .0085, .0085, 10, ANO, { up: [0, 0, 1] });
      if (st.rear) {
        tube([0, BS, -.132], [0, BS, -.24], .0145, .0145, 12, ANO, { segs: 2 });   // popor teleskopik SIG ringkas (sesuai foto): batang atas lurus, pelat popor tegak, penopang bawah miring
        ext([[-.158, -.049], [-.266, -.049], [-.282, -.055], [-.285, -.142], [-.27, -.147], [-.252, -.134], [-.198, -.09], [-.172, -.081], [-.158, -.078]], 0, .0185, POL);
        for (let k = 0; k < 3; k++) { const z = -.205 - k * .02; for (const s of [-1, 1]) ext([[z, -.087 - k * .008], [z - .011, -.087 - k * .008], [z - .026, -.122 - k * .006], [z - .015, -.122 - k * .006]], s * .0187, .0005, INN, { zb: -.001 }); }   // rongga miring
        for (const s of [-1, 1]) box([s * .0187, -.0545, -.215], [.0005, .0016, .045], INN, { zb: -.001 });                  // alur batang atas
        box([0, -.099, -.2875], [.0205, .049, .0042], RUB);                                                                     // bantalan popor
      }
      // handguard M-LOK ramping (kotak bersudut): dinding samping = bilah-bilah miring, celahnya lubang TEMBUS (laras & dunia terlihat)
      const H0 = .072, H1 = .298, HW = .0205, hc = (H0 + H1) / 2, hl = (H1 - H0) / 2;
      box([0, BS, .074], [.0185, .017, .004], ANO);                                                                             // mur laras / sambungan ke receiver
      box([0, -.0428, hc], [HW, .0018, hl], ANO); box([0, -.0812, hc], [.0158, .0018, hl], ANO);                                // pelat atas & bawah
      for (const sd of [-1, 1]) {
        box([sd * .0184, -.0791, hc], [.0026, .0009, hl], ANO, { r: sd * .7 });                                                // sisi bawah miring
        for (const [y0, y1] of [[-.0446, -.0486], [-.0654, -.0686], [-.0754, -.0782]]) box([sd * (HW - .0008), (y0 + y1) / 2, hc], [.0008, (y0 - y1) / 2, hl], ANO);   // pita utuh
        for (const [yt, yb, w, sh, ph] of [[-.0486, -.0654, .0108, .0078, 0], [-.0686, -.0754, .0072, .0032, .0105]]) {   // baris lubang: atas panjang, bawah pendek (selang-seling)
          const a = []; for (let z = H0 + .014 + ph; z + w + sh < H1 - .012; z += .0215) a.push(z);
          const sl = (b0, b1, t0, t1) => ext([[b0, yb], [b1, yb], [t1, yt], [t0, yt]], sd * (HW - .0008), .0008, ANO);
          sl(H0, a[0], H0, a[0] + sh); for (let k = 0; k + 1 < a.length; k++) sl(a[k] + w, a[k + 1], a[k] + w + sh, a[k + 1] + sh); sl(a[a.length - 1] + w, H1, a[a.length - 1] + w + sh, H1);
        }
      }
      for (let k = 0; k < 8; k++) box([0, -.0831, .09 + k * .026], [.0034, .0004, .0085], INN, { zb: -.001 });                  // slot M-LOK bawah
      box([0, -.0446, hc], [HW - .0018, .0004, hl], INN); box([0, -.0794, hc], [.0156, .0004, hl], INN);                       // sisi dalam (gelap)
      box([0, -.0612, H1 + .0012], [HW, .0185, .0012], ANO); disc([0, BS, H1 + .0026], [0, 0, 1], .0092, 12, INN, 0, -.001);  // tutup depan
      // laras + muzzle brake berlubang (ujung baja polos)
      tube([0, BS, .07], [0, BS, .318], .0086, .0086, 12, PRK); tube([0, BS, .318], [0, BS, .348], .0118, .0118, 12, PRK); tube([0, BS, .348], [0, BS, .354], .0118, .0108, 12, STL, { m1: INN });
      for (const z of [.324, .333, .342]) { for (const sd of [-1, 1]) box([sd * .0114, BS, z], [.0008, .0046, .0028], INN, { zb: -.001 }); box([0, BS + .0114, z], [.0042, .0008, .0028], INN, { zb: -.001 }); }
      // red dot mikro di riser: rumah lensa, turet, tutup belakang terbuka ke atas
      ext([[-.012, -.0352], [.036, -.0352], [.032, -.026], [.026, -.012], [-.004, -.012], [-.01, -.026]], 0, .0095, ANO);
      for (const s of [-1, 1]) box([s * .0097, -.031, .012], [.0007, .0028, .016], STL, { zb: -.001 });                   // baut penjepit
      tube([0, 0, -.006], [0, 0, .031], .0145, .0145, 16, ANO, { cap0: false, cap1: false }); tube([0, 0, -.006], [0, 0, .031], .0118, .0118, 16, INN, { inner: true });
      annulus([0, 0, -.006], [0, 0, -1], .0118, .0145, 16, ANO); annulus([0, 0, .031], [0, 0, 1], .0118, .0145, 16, ANO);
      disc([0, 0, .028], [0, 0, 1], .0118, 16, GLS, st.lens * .7); disc([0, 0, -.002], [0, 0, 1], .0118, 16, GLS, st.lens);
      tube([0, .0135, .012], [0, .0215, .012], .0062, .0062, 10, ANO, { up: [0, 0, 1] }); tube([.0135, 0, .012], [.0215, 0, .012], .0062, .0062, 10, ANO, { up: [0, 0, 1] });
      box([0, .0225, -.0185], [.0122, .0118, .0016], RUB, { p: -1.12 }); tube([-.006, .0152, -.0072], [.006, .0152, -.0072], .0026, .0026, 8, RUB, { up: [0, 0, 1] });   // tutup lensa terbuka (rebah ke belakang)
    },
    SMGmag(clip, out) {   // magasin 9 mm 30 butir, melengkung ke depan
      const M = mt([28, 29, 31], .18);
      ext([[.056, -.088], [.06, -.13], [.068, -.18], [.08, -.228], [.096, -.27], [.09, -.279], [.054, -.284], [.047, -.278], [.034, -.234], [.022, -.184], [.014, -.13], [.01, -.088]], 0, .0108, M, { clip });
      for (const s of [-1, 1]) ext([[.03, -.14], [.046, -.14], [.064, -.232], [.048, -.232]], s * .011, .0005, mt([36, 37, 39], .22), { clip, zb: -.001 });   // rusuk
      ext([[.096, -.27], [.09, -.279], [.054, -.284], [.047, -.278], [.05, -.271], [.09, -.264]], 0, .0118, RUB);              // pelat dasar
      if (out) { tube([0, -.085, .022], [0, -.085, .04], .0045, .0045, 8, BRS); tube([0, -.085, .04], [0, -.085, .047], .0045, .002, 8, CPR); }
    },
    /* M60 (sesuai foto): receiver panjang, tutup pengisi berengsel (bisa dibuka) & pejera belakang lipat di belakangnya,
       laras + tabung gas, pegangan angkut, bipod terlipat, pejera depan tinggi, flash hider berlubang, popor trapesium */
    LMG(st) {
      const BL = -.062, X0 = X, SID = mt([44, 45, 46], .3);
      ext([[-.16, -.048], [.11, -.048], [.11, -.1], [.03, -.1], [-.02, -.112], [-.078, -.112], [-.16, -.098]], 0, .021, PRK);   // receiver
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) box([s * .0213, -.073, -.135 + k * .062], [.0006, .013, .021], SID, { zb: -.001 });       // panel sisi timbul
        for (const z of [-.15, -.06, .03, .1]) tube([s * .021, -.092, z], [s * .0228, -.092, z], .0028, .0028, 6, STL, { up: [0, 0, 1], zb: -.001 });   // paku keling
        box([s * .0214, -.1, .07], [.0006, .0018, .038], SID, { zb: -.001 });
      }
      X = cmp(X0, bone([0, -.048, .072], [0, 0, 0], -st.cov, 0, 0));                                                        // tutup pengisi (engsel depan)
      ext([[-.112, -.048], [.072, -.048], [.072, -.039], [.062, -.034], [-.104, -.034], [-.112, -.04]], 0, .0205, PRK);
      box([0, -.0322, -.02], [.0055, .0018, .07], PRK); box([0, -.037, -.113], [.015, .0035, .0045], STL);                  // rusuk tengah + kait belakang
      for (const s of [-1, 1]) box([s * .0207, -.041, -.02], [.0006, .004, .08], SID, { zb: -.001 });
      X = X0;
      // pejera belakang lipat (berdiri): sayap pelindung + daun dengan lubang intip di sumbu bidik
      box([0, -.0445, -.137], [.0125, .0035, .014], PRK);
      for (const s of [-1, 1]) ext([[-.15, -.042], [-.124, -.042], [-.128, -.008], [-.146, -.008]], s * .0088, .0016, PRK);
      box([0, -.0235, -.136], [.0062, .0185, .0014], PRK); box([0, .0066, -.136], [.0062, .0024, .0014], PRK);
      for (const s of [-1, 1]) box([s * .0049, 0, -.136], [.0013, .0045, .0014], PRK);
      annulus([0, 0, -.1345], [0, 0, 1], .0031, .006, 12, PRK); annulus([0, 0, -.1375], [0, 0, -1], .0031, .006, 12, PRK);
      // jendela pengisi + baki (sabuk masuk dari kiri)
      box([-.0215, -.059, 0], [.0012, .0085, .03], INN, { zb: -.002 }); box([-.027, -.0675, 0], [.006, .0012, .03], PRK);
      // pegangan pistol + pelindung pelatuk besar
      ext([[-.04, -.106], [-.043, -.12], [-.05, -.15], [-.058, -.18], [-.093, -.18], [-.084, -.14], [-.074, -.106]], 0, .0145, POL);
      for (let k = 0; k < 4; k++) box([-.0148, -.125 - k * .013, -.068 - k * .004], [.0005, .004, .011], RUB, { zb: -.001 });
      box([0, -.123, -.012], [.0036, .0024, .03], PRK); box([0, -.112, .016], [.0036, .011, .0026], PRK);
      box([0, -.112, -.02], [.0026, .0074, .0026], STL, { p: -.35 + st.trig * .35 });
      tube([.021, -.083, -.03], [.025, -.083, -.03], .0045, .0045, 8, STL, { up: [0, 0, 1] });                                 // pengaman
      if (st.rear) {   // popor trapesium + sandaran bahu logam
        ext([[-.16, -.05], [-.22, -.054], [-.4, -.064], [-.41, -.07], [-.41, -.172], [-.395, -.178], [-.36, -.172], [-.25, -.124], [-.16, -.108]], 0, .021, POL);
        box([0, -.12, -.4135], [.022, .056, .0035], STL); tube([.0, -.086, -.42], [.0, -.086, -.432], .006, .006, 8, STL);
      }
      // handguard berusuk di bawah laras
      ext([[.11, -.07], [.3, -.07], [.305, -.076], [.305, -.104], [.296, -.11], [.12, -.114], [.11, -.106]], 0, .0245, POL);
      for (let k = 0; k < 8; k++) for (const s of [-1, 1]) box([s * .0247, -.09, .13 + k * .022], [.0008, .013, .0032], INN, { zb: -.001 });
      // laras, tabung gas, pegangan angkut
      tube([0, BL, .11], [0, BL, .61], .0112, .0112, 10, PRK, { segs: 5 });
      tube([0, BL - .02, .305], [0, BL - .02, .45], .0085, .0085, 8, PRK); tube([0, BL - .02, .45], [0, BL - .02, .465], .0105, .0105, 8, PRK);
      ext([[.31, BL + .011], [.39, BL + .011], [.382, BL + .049], [.318, BL + .049]], -.006, .0035, PRK); box([-.006, BL + .049, .35], [.0042, .0035, .036], POL);
      // bipod terlipat sepanjang laras + kuk
      tube([0, BL, .53], [0, BL, .55], .0145, .0145, 10, PRK);
      for (const s of [-1, 1]) { tube([s * .009, BL - .014, .54], [s * .014, BL - .03, .36], .0045, .0045, 6, PRK); box([s * .014, BL - .031, .357], [.006, .0025, .008], PRK); }
      // pejera depan tinggi + flash hider berlubang
      tube([0, BL, .585], [0, BL, .605], .0135, .0135, 10, PRK);
      ext([[.588, BL + .012], [.604, BL + .012], [.599, 0], [.593, 0]], 0, .0028, PRK);
      tube([0, BL, .61], [0, BL, .665], .0122, .0145, 10, PRK, { m1: INN });
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; box([Math.cos(a) * .0136, BL + Math.sin(a) * .0136, .64], [.0016, .0016, .016], INN, { r: a, zb: -.001 }); }
    },
    LMGmag(clip, out) {   // kotak 100 butir + sabuk peluru 7,62 naik ke jendela pengisi
      ext([[-.03, -.098], [.072, -.098], [.072, -.208], [-.03, -.208]], -.036, .028, OLV); box([-.036, -.152, .072], [.024, .045, .0015], FDE2, { zb: -.001 });
      box([-.036, -.096, .021], [.03, .003, .053], mt([66, 72, 50], .1)); box([-.064, -.15, .02], [.0012, .03, .03], mt([66, 72, 50], .1), { zb: -.001 });
      for (let k = 0; k < 6; k++) {
        const x = -.026 - k * .0058, y = -.06 - k * .0072;
        tube([x, y, -.03], [x, y, .028], .0055, .0055, 8, BRS); tube([x, y, .028], [x, y, .041], .0055, .0024, 8, CPR);
        box([x, y - .006, -.02], [.0034, .0012, .006], INN); box([x, y - .006, .02], [.0034, .0012, .004], INN);   // mata rantai
      }
    },
    /* senapan runduk bolt-action (sesuai foto, gaya Remington 700 / VSR): popor sintetis hitam satu potong, aksi bulat,
       laras berat, teropong objektif besar dengan rel atas, bipod Harris terlipat */
    SNIPER(st) {
      const BN = -.052, X0 = X;
      ext([[.36, -.0625], [.09, -.06], [.085, -.052], [-.13, -.052], [-.15, -.058], [-.2, -.05], [-.25, -.046], [-.42, -.044], [-.432, -.05], [-.432, -.19], [-.41, -.196], [-.3, -.165], [-.2, -.13], [-.168, -.12],
        [-.118, -.16], [-.086, -.163], [-.072, -.132], [-.062, -.104], [.11, -.099], [.15, -.093], [.36, -.08], [.368, -.071]], 0, .0195, POL, { clip: st.rear ? null : [0, -1, .125] });   // popor satu potong
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) box([s * .0197, -.082 - (k % 2) * .009, .19 + (k >> 1) * .045], [.0005, .0035, .016], RUB, { zb: -.001 });   // tekstur forend
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) box([s * .0197, -.118 - k * .01, -.098 - k * .006], [.0005, .0035, .012], RUB, { zb: -.001 });   // tekstur pegangan
      if (st.rear) { box([0, -.12, -.4365], [.0205, .072, .0045], RUB); tube([0, -.17, -.3], [0, -.18, -.3], .003, .003, 6, STL); }   // bantalan + kancing tali
      tube([0, -.081, .33], [0, -.09, .33], .003, .003, 6, STL);
      // aksi bulat + rel teropong
      tube([0, BN, -.132], [0, BN, .09], .0175, .0175, 14, ANO, { segs: 3 }); tube([0, BN, -.132], [0, BN, -.14], .0155, .012, 14, ANO);
      ext([[-.12, -.036], [.085, -.036], [.085, -.03], [-.12, -.03]], 0, .0095, ANO); rail(-.115, .08, -.03, ANO);
      const Xa = X; X = cmp(X0, bone([0, BN + .006, 0], [0, 0, -st.bolt], 0, 0, st.boltR));                                // baut (bisa diputar & ditarik)
      tube([0, BN + .006, -.128], [0, BN + .006, -.06], .0095, .0095, 10, STL); box([0, BN + .006, -.134], [.0085, .0085, .006], PRK);
      tube([.009, BN + .004, -.088], [.036, BN - .014, -.094], .0045, .0045, 6, STL); tube([.033, BN - .012, -.098], [.044, BN - .02, -.09], .0095, .0095, 8, POL);
      X = Xa;
      box([.0172, BN + .006, -.03], [.0006, .008, .03], INN, { zb: -.002 });                                                // lubang ejeksi
      // pelindung pelatuk & pelatuk (logam)
      box([0, -.106, -.034], [.0034, .0018, .028], STL); box([0, -.1, -.064], [.0034, .006, .002], STL); box([0, -.1, -.005], [.0034, .006, .002], STL);
      box([0, -.094, -.036], [.0026, .0072, .0026], STL, { p: -.35 + st.trig * .35 });
      // laras berat (menebal di ujung seperti foto)
      tube([0, BN, .09], [0, BN, .64], .0108, .0098, 12, PRK, { segs: 4 }); tube([0, BN, .64], [0, BN, .66], .0098, .0132, 12, PRK); tube([0, BN, .66], [0, BN, .86], .0132, .0132, 12, PRK, { m1: INN, segs: 2 });
      // teropong: lensa mata, tabung, turet, rel atas, lonceng objektif + tudung bergerigi, cincin dudukan
      tube([0, 0, -.092], [0, 0, -.078], .0185, .0185, 16, RUB, { m0: GLS }); tube([0, 0, -.078], [0, 0, -.045], .0175, .0128, 16, ANO);
      tube([0, 0, -.045], [0, 0, .205], .0128, .0128, 16, ANO, { segs: 4 });
      tube([0, .012, .085], [0, .026, .085], .0095, .0095, 12, ANO, { up: [0, 0, 1] }); tube([.012, 0, .085], [.026, 0, .085], .0095, .0095, 12, ANO, { up: [0, 0, 1] }); tube([-.012, 0, .085], [-.022, 0, .085], .0075, .0075, 12, ANO, { up: [0, 0, 1] });
      for (let k = 0; k < 6; k++) box([0, .0262, .0805 + k * .0018], [.009, .0006, .0004], INN, { zb: -.001 });
      ext([[-.03, .011], [.055, .011], [.055, .016], [-.03, .016]], 0, .0075, ANO); rail(-.028, .053, .016, ANO);         // rel di atas teropong
      tube([0, 0, .205], [0, 0, .25], .0128, .0235, 16, ANO); tube([0, 0, .25], [0, 0, .335], .0235, .0235, 16, RUB, { m1: GLS, segs: 2 });
      for (let k = 0; k < 4; k++) tube([0, 0, .262 + k * .018], [0, 0, .268 + k * .018], .0243, .0243, 16, INN);
      for (const z of [-.02, .165]) { tube([0, 0, z - .008], [0, 0, z + .008], .0152, .0152, 16, ANO); box([0, -.022, z], [.0085, .009, .008], ANO); for (const s of [-1, 1]) box([s * .0095, -.022, z], [.0015, .0035, .0035], STL); }
      // bipod Harris terlipat ke depan di bawah forend
      box([0, -.088, .34], [.0105, .006, .012], PRK);
      for (const s of [-1, 1]) { tube([s * .012, -.09, .345], [s * .012, -.094, .2], .0042, .0042, 6, PRK); tube([s * .012, -.094, .2], [s * .012, -.095, .18], .0055, .0055, 6, RUB); }
    },
    SNIPERmag(clip) { ext([[.004, -.07], [.07, -.07], [.07, -.112], [.004, -.112]], 0, .0145, PRK, { clip }); box([0, -.1125, .037], [.0155, .002, .036], STL); },
    /* Benelli M4 (sesuai foto): semi-otomatis — receiver rel Picatinny + ghost ring, tuas kokang di kanan (tersentak mundur tiap
       tembakan, terkunci di belakang saat kosong), forend taktis panjang tetap dengan rel samping, tabung magasin hampir sepanjang
       laras, pejera depan bertelinga, pegangan pistol + popor teleskopik */
    SHOTGUN(st) {
      const BG = -.034, MT = BG - .027, X0 = X;
      ext([[-.095, -.027], [-.089, -.021], [.096, -.021], [.102, -.028], [.102, -.064], [.03, -.07], [-.095, -.068]], 0, .0168, ANO);   // receiver
      for (const s of [-1, 1]) box([s * .0169, -.05, .0], [.0005, .0012, .085], mt([30, 31, 33], .35), { zb: -.001 });
      rail(-.085, .096, -.021);
      // ghost ring belakang: sayap pelindung + cincin di sumbu bidik
      box([0, -.0172, -.062], [.0105, .0028, .012], ANO);
      for (const s of [-1, 1]) ext([[-.074, -.016], [-.05, -.016], [-.054, .007], [-.07, .007]], s * .0096, .0017, ANO);
      box([0, -.0105, -.062], [.0022, .0052, .0018], ANO);
      tube([0, 0, -.064], [0, 0, -.06], .0068, .0068, 14, ANO, { cap0: false, cap1: false }); tube([0, 0, -.064], [0, 0, -.06], .0042, .0042, 14, INN, { inner: true });
      annulus([0, 0, -.064], [0, 0, -1], .0042, .0068, 14, ANO); annulus([0, 0, -.06], [0, 0, 1], .0042, .0068, 14, ANO);
      // lubang ejeksi + tuas kokang kanan, lubang pengisi bawah, pengaman
      box([.0172, -.042, .02], [.0006, .009, .028], INN, { zb: -.002 }); box([0, -.0685, .02], [.009, .0008, .03], INN, { zb: -.002 });
      X = cmp(X0, bone([0, 0, 0], [0, 0, -st.ch], 0, 0, 0));   // pembawa baut + tuas kokang
      box([.0166, -.042, .03], [.0008, .0075, .016], STL, { zb: -.001 });
      box([.0185, -.043, .034], [.0028, .0035, .006], STL); tube([.02, -.043, .034], [.034, -.043, .034], .0036, .0032, 8, STL, { up: [0, 0, 1] });
      X = X0;
      tube([-.0175, -.06, -.04], [.0175, -.06, -.04], .0032, .0032, 8, STL, { up: [0, 0, 1] });
      // laras + tabung magasin + klem
      tube([0, BG, .1], [0, BG, .555], .0112, .0112, 12, PRK, { segs: 4, m1: INN });
      tube([0, MT, .1], [0, MT, .49], .0112, .0112, 10, PRK, { segs: 3 }); tube([0, MT, .49], [0, MT, .512], .0126, .0115, 10, PRK);
      ext([[.462, BG + .006], [.48, BG + .006], [.48, MT - .009], [.462, MT - .009]], 0, .0132, PRK);
      // pejera depan: tiang dengan telinga pelindung di ujung laras
      tube([0, BG, .528], [0, BG, .548], .0126, .0126, 10, PRK);
      ext([[.53, BG + .01], [.548, BG + .01], [.545, -.0005], [.535, -.0005]], 0, .0026, PRK);
      for (const s of [-1, 1]) ext([[.528, BG + .01], [.55, BG + .01], [.547, .003], [.531, .003]], s * .0068, .0014, PRK);
      // forend taktis: badan rata menutup laras & tabung, rel samping bergerigi, lubang lonjong, rel bawah pendek
      ext([[.108, -.03], [.355, -.03], [.362, -.036], [.362, -.086], [.355, -.093], [.108, -.093], [.102, -.086], [.102, -.036]], 0, .0178, POL);
      for (const s of [-1, 1]) {
        box([s * .0186, -.05, .245], [.0014, .0058, .095], POL);
        for (let z = .156; z < .338; z += .0099) box([s * .0208, -.05, z], [.0012, .0058, .0027], POL, { zb: -.001 });
        for (let k = 0; k < 6; k++) box([s * .018, -.075, .14 + k * .036], [.0006, .0032, .011], INN, { zb: -.001 });
      }
      box([0, -.095, .3], [.008, .0022, .04], POL); for (let z = .265; z < .336; z += .0099) box([0, -.098, z], [.008, .0012, .0027], POL, { zb: -.001 });
      // pegangan pistol bersirip jari + pelindung pelatuk
      ext([[-.058, -.068], [-.062, -.086], [-.068, -.116], [-.074, -.152], [-.112, -.152], [-.1, -.112], [-.094, -.086], [-.09, -.068]], 0, .0142, POL);
      for (let k = 0; k < 3; k++) box([0, -.098 - k * .016, -.064 - k * .0035], [.0144, .0018, .0025], RUB, { zb: -.001 });
      box([0, -.083, -.03], [.0032, .0022, .023], ANO); box([0, -.075, -.006], [.0032, .0085, .0024], ANO);
      box([0, -.075, -.026], [.0026, .007, .0026], STL, { p: -.35 + st.trig * .35 });
      if (st.rear) {   // popor teleskopik: tabung, badan baji ramping, bantalan karet tinggi
        tube([0, -.048, -.095], [0, -.048, -.255], .0115, .0115, 10, ANO, { segs: 2 }); box([0, -.062, -.18], [.004, .004, .012], STL);
        ext([[-.15, -.034], [-.338, -.033], [-.35, -.04], [-.35, -.162], [-.336, -.167], [-.29, -.152], [-.2, -.09], [-.15, -.07]], 0, .02, POL);
        for (const s of [-1, 1]) ext([[-.23, -.075], [-.31, -.06], [-.31, -.13], [-.285, -.13]], s * .0202, .0006, INN, { zb: -.001 });
        box([0, -.1, -.3545], [.0215, .066, .0045], RUB);
      }
    },
    /* pistol: slide bergerigi (mundur saat menembak/kosong), tiga titik bidik, magasin di pegangan */
    PISTOL(st) {
      const BP = -.031, X0 = X;
      X = cmp(X0, bone([0, 0, 0], [0, 0, -st.slide], 0, 0, 0));
      ext([[-.048, -.0065], [.148, -.0065], [.152, -.011], [.152, -.036], [-.048, -.036], [-.051, -.012]], 0, .0142, ANO);
      for (let k = 0; k < 7; k++) for (const s of [-1, 1]) box([s * .0145, -.021, -.042 + k * .0052], [.0006, .011, .0012], INN, { zb: -.001 });
      for (const s of [-1, 1]) { box([s * .0062, -.0032, -.036], [.0034, .0034, .004], ANO); box([s * .0062, -.002, -.0405], [.0011, .0011, .0004], WHT, { zb: -.002 }); }
      box([0, -.0034, .141], [.0014, .0034, .004], ANO); box([0, -.0014, .1368], [.0009, .0009, .0004], WHT, { zb: -.002 });
      box([.0145, -.02, .035], [.0006, .007, .022], INN, { zb: -.002 }); tube([0, BP, .151], [0, BP, .1535], .0068, .0068, 10, INN);
      X = X0;
      ext([[-.03, -.036], [.14, -.036], [.14, -.047], [.06, -.05], [0, -.05], [-.034, -.045]], 0, .0128, ANO);
      ext([[-.012, -.046], [-.018, -.07], [-.025, -.125], [-.063, -.128], [-.061, -.07], [-.052, -.046]], 0, .0158, POL);
      box([0, -.0715, .018], [.003, .0021, .022], ANO); box([0, -.06, .038], [.003, .011, .0024], ANO); box([0, -.058, .012], [.0024, .0075, .0024], STL, { p: -.3 + st.trig * .35 });
      box([0, -.028, -.057], [.0042, .0085, .0048], ANO, { p: .35 });
    },
    PISTOLmag(clip, out) { ext([[-.017, -.05], [-.026, -.128], [-.064, -.131], [-.054, -.05]], 0, .0112, ANO, { clip, ms: ANO }); box([0, -.1315, -.045], [.0125, .0025, .021], RUB); if (out) tube([-.035, -.047, -.01], [-.035, -.047, .006], .0045, .0045, 8, BRS); },
    /* ----- pistol per kelas: sumbu bidik y = 0, slide pada bone (mundur saat menembak / terkunci saat kosong) ----- */
    /* Kimber M1911 (ASSAULT): slide ramping hitam bergerigi, bushing laras, pejera Novak, beavertail, palu berlubang,
       pengaman ibu jari, gagang kayu rosewood bersekrup, magasin satu baris */
    M1911(st) {
      const X0 = X;
      X = cmp(X0, bone([0, 0, 0], [0, 0, -st.slide], 0, 0, 0));
      ext([[-.05, -.0075], [.154, -.0075], [.157, -.011], [.157, -.035], [-.05, -.035], [-.053, -.011]], 0, .0118, ANO);
      for (let k = 0; k < 9; k++) for (const s of [-1, 1]) box([s * .0119, -.021, -.045 + k * .0045], [.0006, .0105, .0011], INN, { zb: -.001 });
      box([0, -.0048, -.04], [.0085, .003, .0062], ANO); for (const s of [-1, 1]) box([s * .0045, -.0012, -.04], [.0026, .0012, .005], ANO);   // pejera belakang (takik)
      box([0, -.0044, .147], [.0013, .0034, .0045], ANO); box([0, -.0016, .1445], [.0008, .0008, .0004], WHT, { zb: -.002 });
      box([.0119, -.019, .035], [.0006, .0075, .021], INN, { zb: -.002 });   // lubang ejeksi
      tube([0, -.03, .153], [0, -.03, .159], .0088, .0088, 12, STL); disc([0, -.03, .1592], [0, 0, 1], .0048, 10, INN, 0, -.001);   // bushing + mulut laras
      X = X0;
      ext([[-.032, -.035], [.118, -.035], [.118, -.047], [.06, -.049], [0, -.049], [-.036, -.044]], 0, .0115, ANO);
      tube([0, -.0425, .118], [0, -.0425, .156], .0062, .0062, 10, ANO); disc([0, -.0425, .1562], [0, 0, 1], .003, 8, INN, 0, -.001);   // sumbat pegas
      ext([[-.014, -.045], [-.019, -.07], [-.026, -.124], [-.061, -.127], [-.059, -.07], [-.055, -.045]], 0, .0122, ANO);
      for (const s of [-1, 1]) {   // gagang kayu + sekrup
        ext([[-.02, -.054], [-.025, -.118], [-.057, -.12], [-.055, -.054]], s * .0126, .0012, WOOD);
        for (const y of [-.062, -.11]) tube([s * .0136, y, -.039], [s * .0142, y, -.039], .0028, .0028, 8, STL, { up: [0, 0, 1] });
      }
      ext([[-.05, -.035], [-.071, -.031], [-.077, -.035], [-.074, -.04], [-.059, -.047], [-.056, -.058]], 0, .0098, ANO);   // beavertail
      box([0, -.026, -.061], [.0035, .0075, .0032], ANO, { p: .35 }); box([0, -.022, -.0625], [.0036, .0025, .0012], INN, { p: .35, zb: -.001 });   // palu berlubang
      box([-.0127, -.036, -.044], [.0012, .0028, .011], ANO); box([-.0122, -.038, .014], [.0012, .003, .016], ANO);   // pengaman ibu jari + slide stop
      box([0, -.0715, .018], [.003, .0021, .022], ANO); box([0, -.06, .038], [.003, .011, .0024], ANO); box([0, -.058, .012], [.0024, .0075, .0022], STL, { p: -.2 + st.trig * .35 });
    },
    M1911mag(clip, out) { ext([[-.017, -.05], [-.025, -.126], [-.058, -.128], [-.05, -.05]], 0, .0082, ANO, { clip, ms: ANO }); box([0, -.1295, -.042], [.0095, .0024, .019], RUB); if (out) tube([0, -.0475, -.046], [0, -.0475, -.03], .0057, .0052, 8, BRS); },
    /* Glock 34 TTI Combat Master (CQB, gaya John Wick): slide persegi berjendela memperlihatkan laras emas, gerigi depan &
       belakang, pejera fiber, rangka polimer berel + stippling, magwell TTI & base pad tambahan */
    GLOCK(st) {
      const X0 = X;
      X = cmp(X0, bone([0, 0, 0], [0, 0, -st.slide], 0, 0, 0));
      ext([[-.05, -.0065], [.162, -.0065], [.166, -.0105], [.166, -.034], [-.05, -.034], [-.053, -.0105]], 0, .0124, ANO);
      for (const z of [.074, .1, .126]) box([0, -.0062, z], [.0058, .0006, .0095], GOLD, { zb: -.002 });   // jendela atas (laras TiN emas)
      for (const s of [-1, 1]) {
        box([s * .0125, -.016, .118], [.0006, .0036, .028], GOLD, { zb: -.002 });   // jendela samping
        for (let k = 0; k < 7; k++) box([s * .0125, -.021, -.045 + k * .0046], [.0006, .0105, .0011], INN, { zb: -.001 });
        for (let k = 0; k < 5; k++) box([s * .0125, -.024, .14 + k * .0046], [.0006, .007, .0011], INN, { zb: -.001 });
      }
      box([0, -.0047, -.04], [.0085, .0028, .005], ANO); for (const s of [-1, 1]) box([s * .0045, -.0012, -.04], [.0026, .0012, .004], ANO);
      box([0, -.004, .157], [.0016, .0032, .004], ANO); box([0, -.0011, .1555], [.0007, .0007, .0012], FIB, { zb: -.002 });   // fiber hijau
      box([.0125, -.0185, .035], [.0006, .0075, .02], INN, { zb: -.002 });
      tube([0, -.0285, .164], [0, -.0285, .1668], .0068, .0068, 12, GOLD); disc([0, -.0285, .167], [0, 0, 1], .0045, 10, INN, 0, -.001);
      X = X0;
      ext([[-.032, -.034], [.142, -.034], [.142, -.048], [.11, -.05], [0, -.05], [-.036, -.044]], 0, .0118, POL);
      for (let k = 0; k < 3; k++) box([0, -.0495, .085 + k * .018], [.0105, .0012, .003], INN, { zb: -.001 });   // rel aksesori
      box([0, -.063, .044], [.003, .012, .0025], POL); box([0, -.0745, .02], [.003, .0022, .025], POL);   // pelindung pelatuk persegi
      box([0, -.06, .012], [.0026, .0085, .0024], POL, { p: -.25 + st.trig * .35 }); box([0, -.0585, .0138], [.0008, .006, .0015], INN, { p: -.25 + st.trig * .35 });
      ext([[-.012, -.046], [-.02, -.07], [-.031, -.124], [-.068, -.127], [-.067, -.07], [-.058, -.046]], 0, .0148, POL);
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) box([s * .0149, -.072 - k * .011, -.034 - j * .009 - k * .0024], [.0003, .0036, .0036], mt([38, 38, 40], .02), { zb: -.001 });   // stippling
      ext([[-.052, -.034], [-.066, -.036], [-.068, -.041], [-.06, -.047]], 0, .0105, POL);
      ext([[-.027, -.119], [-.07, -.122], [-.072, -.131], [-.025, -.129]], 0, .0162, ANO);   // magwell TTI
      box([-.0125, -.052, -.006], [.0015, .004, .004], ANO); box([-.0122, -.0365, .002], [.0012, .0022, .012], ANO);
    },
    GLOCKmag(clip, out) { ext([[-.016, -.05], [-.026, -.128], [-.066, -.131], [-.057, -.05]], 0, .0108, ANO, { clip, ms: ANO }); ext([[-.024, -.128], [-.07, -.131], [-.071, -.146], [-.022, -.143]], 0, .0134, ANO); box([0, -.1445, -.046], [.0128, .0012, .02], STL, { zb: -.001 }); if (out) tube([0, -.0475, -.046], [0, -.0475, -.03], .0055, .005, 8, BRS); },
    /* Beretta 93R (RECON, pistol burst 3 peluru): krom, slide terbuka khas Beretta, kompensator berlubang, pelindung pelatuk
       besar, gagang depan lipat, magasin 20 peluru menjulur dari pegangan */
    M93R(st) {
      const X0 = X;
      X = cmp(X0, bone([0, 0, 0], [0, 0, -st.slide], 0, 0, 0));
      ext([[-.05, -.0065], [.026, -.0065], [.042, -.0175], [.142, -.0175], [.146, -.021], [.146, -.034], [-.05, -.034], [-.053, -.0105]], 0, .0132, CHR);
      for (let k = 0; k < 7; k++) for (const s of [-1, 1]) box([s * .0133, -.021, -.045 + k * .0048], [.0006, .0105, .0011], INN, { zb: -.001 });
      box([0, -.0047, -.04], [.0085, .0028, .005], ANO); for (const s of [-1, 1]) { box([s * .0045, -.0012, -.04], [.0026, .0012, .004], ANO); box([s * .0142, -.013, -.036], [.0014, .004, .006], ANO); }   // pejera + pengaman ambi
      box([.0133, -.012, .012], [.0006, .0055, .016], INN, { zb: -.002 });
      X = X0;
      tube([0, -.0255, .03], [0, -.0255, .146], .0074, .0074, 12, STL, { segs: 2 });   // laras terlihat di atas slide terbuka
      tube([0, -.0255, .146], [0, -.0255, .19], .0098, .0098, 12, ANO, { segs: 2 }); disc([0, -.0255, .1902], [0, 0, 1], .0046, 10, INN, 0, -.001);   // kompensator
      for (let k = 0; k < 3; k++) box([0, -.0159, .156 + k * .011], [.0034, .0006, .0034], INN, { zb: -.001 });
      box([0, -.0105, .182], [.0012, .0055, .004], ANO);
      ext([[-.032, -.034], [.13, -.034], [.13, -.048], [.06, -.05], [0, -.05], [-.036, -.044]], 0, .0122, CHR);
      box([0, -.065, .062], [.003, .015, .0025], CHR); box([0, -.0785, .028], [.003, .0022, .036], CHR);   // pelindung pelatuk besar
      box([0, -.06, .012], [.0026, .0085, .0024], STL, { p: -.25 + st.trig * .35 });
      ext([[.066, -.05], [.13, -.05], [.13, -.0595], [.068, -.0595]], 0, .0062, RUB); tube([-.0065, -.054, .127], [.0065, -.054, .127], .003, .003, 8, STL, { up: [0, 0, 1] });   // gagang depan terlipat
      ext([[-.012, -.046], [-.018, -.07], [-.026, -.124], [-.064, -.127], [-.062, -.07], [-.054, -.046]], 0, .0152, CHR);
      for (const s of [-1, 1]) { ext([[-.019, -.054], [-.025, -.119], [-.059, -.121], [-.057, -.054]], s * .0154, .0012, POL); tube([s * .0163, -.088, -.039], [s * .0168, -.088, -.039], .0026, .0026, 8, STL, { up: [0, 0, 1] }); }
      tube([-.003, -.022, -.057], [.003, -.022, -.057], .0055, .0055, 10, ANO, { up: [0, 0, 1] }); box([0, -.03, -.055], [.003, .006, .003], ANO);   // palu bulat
      box([.0128, -.045, -.03], [.001, .003, .008], RSH);   // selektor burst
    },
    M93Rmag(clip, out) { ext([[-.017, -.05], [-.026, -.124], [-.033, -.188], [-.072, -.191], [-.064, -.124], [-.055, -.05]], 0, .0108, ANO, { clip, ms: ANO }); box([0, -.1925, -.052], [.0122, .0025, .021], RUB); if (out) tube([0, -.0475, -.046], [0, -.0475, -.03], .0055, .005, 8, BRS); },
    /* Desert Eagle Mark XIX .50 AE (GUNNER): krom, laras segitiga tetap selebar rangka dengan rel berlubang, slide hanya di
       belakang, rangka memanjang di bawah laras, pelindung pelatuk berkait, palu cincin, gagang karet besar */
    DEAGLE(st) {
      const X0 = X;
      ext([[.02, -.014], [.203, -.014], [.203, -.043], [.02, -.043]], 0, .0152, CHR);
      ext([[.02, -.0075], [.203, -.0075], [.203, -.014], [.02, -.014]], 0, .0088, CHR);
      for (let z = .03; z < .195; z += .0165) box([0, -.0071, z], [.0089, .0008, .003], INN, { zb: -.001 });   // rel atas
      for (const s of [-1, 1]) box([s * .0153, -.028, .112], [.0006, .0075, .078], mt([120, 122, 126], .7, 30), { zb: -.001 });
      disc([0, -.026, .2032], [0, 0, 1], .0068, 12, INN, 0, -.001);
      box([0, -.0045, .192], [.0016, .003, .005], CHR);
      X = cmp(X0, bone([0, 0, 0], [0, 0, -st.slide], 0, 0, 0));
      ext([[-.062, -.0085], [.02, -.0085], [.02, -.043], [-.062, -.043], [-.065, -.012]], 0, .0158, CHR);
      for (let k = 0; k < 8; k++) for (const s of [-1, 1]) box([s * .0159, -.025, -.058 + k * .0048], [.0006, .0135, .0012], INN, { zb: -.001 });
      box([0, -.0055, -.055], [.0095, .003, .0065], ANO); for (const s of [-1, 1]) { box([s * .005, -.0015, -.055], [.0028, .0013, .005], ANO); box([s * .0168, -.016, -.05], [.0016, .0042, .007], ANO); }
      box([.0159, -.022, .0], [.0006, .0085, .014], INN, { zb: -.002 });
      X = X0;
      ext([[-.045, -.043], [.17, -.043], [.17, -.057], [.06, -.06], [0, -.06], [-.048, -.054]], 0, .0145, CHR);
      box([-.0148, -.05, .045], [.0012, .003, .008], ANO);   // tuas bongkar
      box([0, -.073, .062], [.0032, .014, .0026], CHR); box([0, -.0875, .03], [.0032, .0024, .034], CHR); box([0, -.089, .066], [.0032, .0035, .0035], CHR);   // pelindung pelatuk berkait
      box([0, -.069, .014], [.0028, .009, .0026], STL, { p: -.25 + st.trig * .35 });
      ext([[-.017, -.056], [-.023, -.08], [-.031, -.141], [-.073, -.144], [-.071, -.08], [-.064, -.056]], 0, .0168, CHR);
      ext([[-.021, -.062], [-.027, -.136], [-.069, -.139], [-.066, -.062]], 0, .0177, RUB);
      tube([-.003, -.03, -.071], [.003, -.03, -.071], .0068, .0068, 12, ANO, { up: [0, 0, 1] }); tube([-.0032, -.03, -.071], [.0032, -.03, -.071], .0032, .0032, 10, INN, { up: [0, 0, 1] });   // palu cincin
    },
    DEAGLEmag(clip, out) { ext([[-.021, -.06], [-.03, -.141], [-.069, -.144], [-.061, -.06]], 0, .0098, ANO, { clip, ms: ANO }); box([0, -.146, -.05], [.0118, .0028, .022], ANO); if (out) { tube([0, -.0575, -.054], [0, -.0575, -.036], .0068, .0066, 8, BRS); tube([0, -.0575, -.036], [0, -.0575, -.028], .0066, .004, 8, CPR); } },
    /* .44 Magnum (BREACHER, gaya Anaconda MW2) berteropong: stainless, laras 6" berusuk berventilasi + underlug penuh,
       silinder beralur 6 kamar pada crane (diayun ke kiri saat reload, berputar 60° tiap tembakan), palu berduri,
       gagang karet bersirip jari, teropong pistol eye-relief panjang di dua ring */
    MAG44(st) {
      const X0 = X, BY = REV.by;
      tube([0, 0, -.088], [0, 0, -.06], .0165, .0118, 16, ANO, { m0: GLS }); tube([0, 0, -.06], [0, 0, .118], .0118, .0118, 16, ANO, { segs: 4 });
      tube([0, 0, .118], [0, 0, .162], .0118, .017, 16, ANO, { m1: GLS }); annulus([0, 0, .162], [0, 0, 1], .0142, .017, 16, ANO, -.001);
      tube([0, .0118, .035], [0, .021, .035], .0068, .0068, 10, ANO); tube([.0118, 0, .035], [.0205, 0, .035], .0064, .0064, 10, ANO, { up: [0, 0, 1] });   // turet
      for (const z of [-.02, .1]) tube([0, 0, z - .0065], [0, 0, z + .0065], .0136, .0136, 16, ANO);
      box([0, -.019, -.02], [.0072, .0052, .0065], ANO); box([0, -.0243, .1], [.006, .0105, .0065], ANO);   // dudukan ring
      // rangka: perisai belakang, top strap, bawah silinder, tiang depan
      ext([[-.036, BY + .028], [-.012, BY + .028], [-.012, BY - .03], [-.04, BY - .03], [-.045, BY + .008]], 0, .0118, STN);
      ext([[-.012, BY + .028], [.036, BY + .028], [.036, BY + .0212], [-.012, BY + .0212]], 0, .0084, STN);
      ext([[-.012, BY - .0222], [.036, BY - .0222], [.036, BY - .03], [-.012, BY - .03]], 0, .0106, STN);
      ext([[.031, BY + .028], [.041, BY + .028], [.041, BY - .03], [.031, BY - .03]], 0, .0106, STN);
      box([-.0124, BY + .006, -.026], [.0016, .004, .007], STN);   // tombol pelepas silinder
      // laras + underlug + rusuk berventilasi + pejera
      tube([0, BY, .04], [0, BY, .193], .0102, .0102, 14, STN, { segs: 3 }); disc([0, BY, .1932], [0, 0, 1], .0055, 10, INN, 0, -.001);
      ext([[.04, BY - .004], [.193, BY - .004], [.193, BY - .025], [.06, BY - .03], [.04, BY - .03]], 0, .0088, STN);
      ext([[.04, BY + .0095], [.193, BY + .0095], [.193, BY + .0175], [.04, BY + .0175]], 0, .0042, STN);
      for (let z = .05; z < .19; z += .016) for (const s of [-1, 1]) box([s * .0043, BY + .0145, z], [.0004, .0022, .005], INN, { zb: -.001 });
      ext([[.172, BY + .0175], [.19, BY + .0175], [.19, BY + .0255], [.182, BY + .0255]], 0, .0017, STN);
      // palu (tertarik saat pelatuk ditekan, double-action) + pelatuk + pelindung
      X = cmp(X0, bone([0, BY + .004, -.038], [0, 0, 0], st.trig * .45, 0, 0));
      ext([[-.036, BY + .006], [-.03, BY + .016], [-.048, BY + .034], [-.058, BY + .031], [-.044, BY + .014]], 0, .003, STL);
      X = X0;
      box([0, BY - .043, -.008], [.0026, .0095, .0026], STL, { p: -.2 + st.trig * .4 });
      box([0, BY - .0545, -.006], [.003, .0022, .021], STN); box([0, BY - .043, .015], [.003, .012, .0025], STN);
      // gagang karet bersirip jari
      ext([[-.032, BY - .024], [-.04, BY - .06], [-.047, BY - .098], [-.088, BY - .101], [-.083, BY - .05], [-.062, BY - .022], [-.045, BY - .02]], 0, .0162, RUB);
      for (let k = 0; k < 3; k++) tube([-.0158, BY - .046 - k * .017, -.0375 - k * .0036], [.0158, BY - .046 - k * .017, -.0375 - k * .0036], .0052, .0052, 8, RUB, { up: [0, 0, 1] });
      // silinder pada crane: diayun keluar ke kiri (st.cyl), berputar per tembakan (st.cr), ejector didorong (st.ejk)
      const CR = cmp(X0, bone(REV.pv, [0, 0, 0], 0, 0, st.cyl));
      X = CR;
      box([-.0072, BY - .0135, .036], [.0035, .0125, .0028], STN, { r: .55 }); tube([0, BY, .032], [0, BY, .064 - st.ejk], .0032, .0032, 8, STN); tube([0, BY, .06 - st.ejk], [0, BY, .066 - st.ejk], .0042, .0042, 8, STN);   // crane + batang ejector
      X = cmp(CR, bone([0, BY, 0], [0, 0, 0], 0, 0, st.cr));
      tube([0, BY, -.012], [0, BY, .032], .0205, .0205, 18, STN, { segs: 2 });
      for (let i = 0; i < 6; i++) {
        const a = i * 1.0472 + .5236, c = Math.cos(a), s = Math.sin(a), b = i * 1.0472;
        box([c * .0198, BY + s * .0198, .012], [.0012, .0042, .014], mt([84, 86, 90], .45), { r: a, zb: -.001 });   // alur
        const ch = [Math.cos(b) * .0125, BY + Math.sin(b) * .0125, -.0122 - st.ejk];
        if (st.ch6 === 'empty') disc(add(ch, [0, 0, st.ejk - .0001]), [0, 0, -1], .0058, 10, INN, 0, -.002);
        else { disc(ch, [0, 0, -1], .0064, 10, BRS, 0, -.003); disc(add(ch, [0, 0, -.0002]), [0, 0, -1], .0022, 8, st.ch6 === 'spent' ? mt([120, 110, 90], .3) : STL, 0, -.004); }
      }
      if (st.ejk > 0) tube([0, BY, -.0122 - st.ejk], [0, BY, -.0118], .0105, .0105, 12, STN);   // bintang ejector
      X = X0;
    },
    /* speedloader 6 peluru .44 (full = masih memegang peluru) */
    SPEEDL(full) {
      tube([0, 0, -.014], [0, 0, -.001], .0185, .0185, 14, RUB); tube([0, 0, -.025], [0, 0, -.014], .0075, .0095, 12, ANO);
      if (full) for (let i = 0; i < 6; i++) { const b = i * 1.0472, p = [Math.cos(b) * .0125, Math.sin(b) * .0125]; tube([p[0], p[1], -.001], [p[0], p[1], .027], .0058, .0058, 8, BRS); tube([p[0], p[1], .027], [p[0], p[1], .036], .0055, .0028, 8, CPR); }
    },
    /* peluncur roket sekali pakai (AT4/Armbrust) */
    AT(st) {
      const TX = .056, TY = -.046;
      tube([TX, TY, -.55], [TX, TY, .5], .042, .042, 14, OLV, { segs: 7 }); tube([TX, TY, -.6], [TX, TY, -.55], .05, .042, 14, RUB, { m0: INN }); tube([TX, TY, .5], [TX, TY, .53], .045, .045, 14, RUB, { m1: INN });
      for (const z of [-.25, .16, .36]) tube([TX, TY, z], [TX, TY, z + .014], .0435, .0435, 14, mt([58, 64, 44], .06));
      ext([[.1, TY - .04], [.13, TY - .04], [.126, TY - .118], [.1, TY - .118]], TX, .012, RUB);
      box([TX + .028, TY + .035, -.05], [.006, .01, .03], RUB); tube([TX, TY + .042, .1], [TX, TY + .05, .1], .006, .006, 8, RSH, { up: [0, 0, 1] });
      box([.012, -.013, 0], [.012, .0085, .007], OLV); tube([0, 0, -.002], [0, 0, .002], .0065, .0065, 12, RUB, { cap0: false, cap1: false }); annulus([0, 0, -.002], [0, 0, -1], .0022, .0065, 12, RUB);
      box([.012, -.012, .32], [.012, .008, .004], OLV); box([0, -.0075, .32], [.0012, .0075, .0016], RUB);
    },
    ATrk(z) {   // roket isi ulang (z = ujung hulu ledak pada sumbu tabung): badan, hulu ledak, cincin penanda, sirip ekor (terlipat begitu masuk moncong)
      const TX = .056, TY = -.046;
      tube([TX, TY, z - .62], [TX, TY, z - .2], .034, .034, 12, mt([96, 100, 72], .1), { segs: 3 }); tube([TX, TY, z - .2], [TX, TY, z - .03], .036, .016, 12, mt([58, 60, 56], .25)); tube([TX, TY, z - .03], [TX, TY, z], .016, .005, 10, STL);
      tube([TX, TY, z - .27], [TX, TY, z - .25], .0372, .0372, 12, mt([170, 140, 40], .2));
      if (z - .58 > .52) for (let k = 0; k < 4; k++) { const a = k * 1.5708 + .785; box([TX + Math.cos(a) * .042, TY + Math.sin(a) * .042, z - .58], [.012, .0012, .035], STL, { r: a }); }
    },
    /* katana pemain: sumbu z = bilah, 0 = tsuba; mata bilah ke -y (arah jari), sori melengkung ke +y. v2.12: BIRU (bilah baja biru tua, mata & tsuba biru menyala) — merah khusus katana Cray Martin. Gagang hitam belah ketupat emas */
    KNIFE() {
      const TS = mt([25, 25, 28], .14), GD = mt([190, 150, 70], .7, 26), RG = mt([26, 74, 178], .55, 30), BL = mt([16, 28, 62], .9, 48), EDG = mt([92, 186, 255], .55, 22);
      tube([0, 0, -.25], [0, 0, -.018], .0158, .0146, 10, TS, { segs: 4 });
      for (let k = 0; k < 6; k++) { const z = -.232 + k * .039; for (const x0 of [.0146, -.0146]) ext([[z - .0125, 0], [z, .0082], [z + .0125, 0], [z, -.0082]], x0, .0011, GD); }
      tube([0, 0, -.262], [0, 0, -.25], .017, .0162, 10, GD); tube([0, 0, -.034], [0, 0, -.016], .0162, .0168, 10, GD);
      const R = .045, q = 14; for (let k = 0; k < q; k++) { const a = k / q * 6.2832, b = (k + 1) / q * 6.2832; tube([Math.cos(a) * R, Math.sin(a) * R, 0], [Math.cos(b) * R, Math.sin(b) * R, 0], .0052, .0052, 5, RG); }
      for (let k = 0; k < 4; k++) { const a = k * 1.5708 + .785; tube([Math.cos(a) * .014, Math.sin(a) * .014, 0], [Math.cos(a) * R, Math.sin(a) * R, 0], .0036, .0036, 4, RG); }
      tube([0, 0, -.016], [0, 0, .007], .0195, .0195, 10, RG); tube([0, 0, .007], [0, 0, .03], .0088, .0082, 8, GD);
      const L = .72, z0 = .03, yc = t => .032 * t * t, w = t => .0172 * (1 - t * .16), n = 9, sp = [], hm = [], ed = [];
      for (let k = 0; k <= n; k++) { const t = k / n, kis = t > .89 ? (t - .89) / .11 : 0, wt = w(t), z = z0 + L * t; sp.push([z, yc(t) + wt * .44 * (1 - kis * kis * .45)]); hm.push([z, yc(t) - wt * .18 * (1 - kis) + wt * .2 * kis]); ed.push([z, yc(t) - wt * .56 * (1 - kis * kis) + wt * .24 * kis * kis]); }
      ext(sp.concat(hm.slice().reverse()), 0, .0027, BL); ext(hm.concat(ed.slice().reverse()), 0, .0012, EDG);
    }
  };

  /* ---------- spesifikasi: posisi pinggul/bidik, pose tangan, parameter reload ---------- */
  /* pistol per kelas: genggaman tangan digeser d dari pistol dasar (puncak depan pegangan), k = kemiringan pegangan (dz/dy) */
  function pistolSpec(d, k, o) {
    const LC = [[1.1, 1.2, .7], [1.1, 1.2, .7], [1.1, 1.2, .7], [1.15, 1.15, .7]], LT = [[.35, -.2, .9], [.25, -.15, .95], [.2, -.1, .97]];
    return Object.assign({ hip: [.09, -.066, .42], hr: [.03, -.08, .05], ads: [0, 0, .45], fl: .55, sh: 'p', slt: .022,
      rh: gripR(add([0, -.05, -.013], d), [0, .082, .082 * k], true), lh: pose(add([-.028, -.098, .004], d), [0, .98, .12], [.25, -.12, .95], LC, LT, true),
      mp: add([-.04, -.05, 0], d), mo: [-.01, -.1, -.015] }, o);
  }
  const REV = { by: -.052, pv: [-.014, -.074, 0] };   // .44 Magnum: tinggi sumbu laras/silinder, poros crane
  const HIPO = [.077, -.019, .058], HIPR = [.005, .027, .03];   // pinggul gaya Black Ops Cold War: senapan = pose bidik digeser kanan 7,7 cm, turun 1,9 cm, maju 5,8 cm; laras hampir lurus ke depan
  const hipOf = adsZ => [HIPO[0], HIPO[1], adsZ + HIPO[2]];
  const SPEC = {
    AR: { hip: hipOf(.23), hr: HIPR, ads: [0, 0, .23], muz: [0, B4, .5], fl: .8, ej: [.016, -.061, -.033], sh: 'r',   // hr: laras sejajar garis pandang → garis laras menuju crosshair (dulu yaw −0,15 = laras menunjuk ±8,6° di kiri titik bidik)
      rh: gripR([0, -.096, -.072], [0, .09, .023], true), lh: hgL([0, B4, .175], .031, -.6), mp: [.01, -.088, 0], well: -.13, mo: [-.004, -.1, .006], mh: magL([.042, -.165, .043], [0, -1, .12]),
      cp: pressL([-.0134, -.082, -.036]) },
    AK: { hip: hipOf(.3), hr: HIPR, ads: [0, 0, .3], muz: [0, AKB, .667], fl: .9, ej: [.017, -.058, -.03], sh: 'r',
      rh: gripR([0, -.101, -.101], [0, .09, .025], true), lh: hgL([0, -.066, .24], .025, -.6), mp: [0, -.096, .048], well: -.1, mo: [-.004, -.1, .006], mh: magL([.064, -.165, .062], [0, -1, .42]),
      ck: [.006, -.024, .03] },   // mp = lug depan magasin (poros ayun masuk/keluar); ck = genggaman atas pada tuas kokang kanan
    SMG: { hip: hipOf(.26), hr: HIPR, ads: [0, 0, .26], muz: [0, -.062, .354], fl: .6, ej: [.016, -.061, -.038], sh: 'p', dot: .03,
      rh: gripR([0, -.096, -.072], [0, .09, .023], true), lh: hgL([0, -.062, .17], .0225, -.6), mp: [.035, -.09, 0], well: -.13, mo: [-.004, -.11, .01], mh: magL([.066, -.18, .05], [0, -1, .2]),
      cp: pose([-.032, -.042, -.158], [0, 1, -.3], [.1, .45, 1], CG, TG, true) },   // menjepit sayap kiri tuas kokang dari belakang
    LMG: { hip: hipOf(.3), hr: HIPR, ads: [0, 0, .3], muz: [0, -.062, .665], fl: 1.1, ej: [.022, -.066, -.01], sh: 'r',
      rh: gripR([0, -.106, -.04], [0, .077, .018], true), lh: hgL([0, -.09, .21], .026, -.6), mp: [-.036, -.098, .02], well: -.0975, mo: [-.06, -.08, 0], mh: magL([-.002, -.15, .072], [0, -1, 0]) },
    SNIPER: { hip: hipOf(.28), hr: HIPR, ads: [0, 0, .28], muz: [0, -.052, .86], fl: 1.4, ej: [.022, -.045, -.04], sh: 'b',
      rh: gripR([0, -.09, -.086], [0, .07, .045], true), lh: hgL([0, -.071, .27], .02, -.6), mp: [.037, -.075, 0], well: -.0725, mo: [0, -.08, 0], mh: magL([.07, -.105, 0], [0, -1, 0]),
      bh: pose([.05, -.012, -.09], [0, 1, -.2], [-.6, .1, .8], [[.7, 1, .6], [1.1, 1.3, .8], [1.1, 1.3, .8], [1.2, 1.2, .7]], [[.3, -.8, .5], [.2, -.9, .3], [.1, -.9, .2]]) },
    SHOTGUN: { hip: hipOf(.34), hr: HIPR, ads: [0, 0, .34], muz: [0, -.034, .555], fl: 1.2, ej: [.018, -.042, .02], sh: 's',
      rh: gripR([0, -.068, -.062], [0, .082, .03], true, [[.2, -.75, .62], [0, -.9, .45], [-.12, -.85, .4]]), lh: hgL([0, -.061, .26], .03, -.6), lp: pose([-.012, -.1, .04], [0, 0, 1], [.85, .5, 0], [[.4, .5, .3], [.6, .8, .5], [.8, 1, .6], [.9, 1, .6]], [[.4, -.6, .5], [.6, -.6, .3], [.7, -.5, .2]], true) },
    PISTOL: { hip: [.09, -.066, .42], hr: [.03, -.08, .05], ads: [0, 0, .45], muz: [0, -.031, .155], fl: .55, ej: [.016, -.02, .03], sh: 'p',
      rh: gripR([0, -.05, -.013], [0, .082, .012], true), lh: pose([-.028, -.098, .004], [0, .98, .12], [.25, -.12, .95], [[1.1, 1.2, .7], [1.1, 1.2, .7], [1.1, 1.2, .7], [1.15, 1.15, .7]], [[.35, -.2, .9], [.25, -.15, .95], [.2, -.1, .97]], true),
      mp: [-.04, -.05, 0], well: -.125, mo: [-.01, -.1, -.015], mh: magL([-.022, -.145, -.02], [0, -1, -.1]) },
    M1911: pistolSpec([0, .001, -.002], .15, { muz: [0, -.03, .159], ej: [.013, -.019, .035], well: -.124, mh: magL([-.021, -.143, -.02], [0, -1, -.1]) }),
    GLOCK: pistolSpec([0, 0, 0], .24, { muz: [0, -.0285, .167], ej: [.014, -.019, .035], well: -.126, mh: magL([-.024, -.158, -.02], [0, -1, -.14]) }),
    M93R: pistolSpec([0, 0, 0], .15, { muz: [0, -.0255, .19], ej: [.015, -.012, .015], well: -.124, mh: magL([-.033, -.205, -.022], [0, -1, -.1]), fl: .5 }),
    DEAGLE: pistolSpec([0, -.01, -.005], .165, { hip: [.09, -.068, .43], ads: [0, 0, .47], muz: [0, -.026, .203], fl: .85, ej: [.017, -.02, 0], slt: .026, mp: [-.045, -.06, 0], well: -.139, mo: [-.012, -.11, -.015], mh: magL([-.028, -.16, -.024], [0, -1, -.1]) }),
    MAG44: Object.assign(pistolSpec([0, -.03, -.02], .2, { hip: [.09, -.05, .4], ads: [0, 0, .3], muz: [0, REV.by, .193], fl: .95 }), { rev: true, ej: null, mp: null }),
    AT: { hip: [.05, -.08, .36], hr: [.02, -.05, 0], ads: [0, 0, .32], muz: [.056, -.046, .53], fl: 1.8, rh: gripR([.056, -.086, .113], [0, 1, -.1], false), lh: hgL([.056, -.046, .26], .042, -.3) },
    KNIFE: { hip: [0, 0, 0], hr: [0, 0, 0], ads: [0, 0, 0], muz: [0, 0, 0], fl: 0, rh: pose([.021, -.0193, -.0068], [0, .259, .966], [0, -.966, .259], [[1.4, 1.5, .9], [1.4, 1.55, .9], [1.4, 1.55, .9], [1.4, 1.5, .9]], [[.2, -.5, .8], [-.2, -.8, .5], [-.4, -.85, .2]]) }   // genggaman palu maju: telunjuk di pelindung, jari membungkus ke sisi mata, ibu jari melingkar di atas jari, punggung tangan di sisi +x
  };
  V.SPEC = SPEC;
  /* M4A1 berlampiran: posisi mata saat membidik (ACOG lebih dekat = cincin rumah lensa besar), titik moncong (peredam), tangan kiri di pegangan depan */
  const ARS = {};
  function arSpec() {
    const k = Object.keys(ATT).join(); if (!k) return SPEC.AR; if (ARS[k]) return ARS[k];
    const o = Object.assign({}, SPEC.AR);
    if (ATT.ACOG) o.ads = [0, 0, .135]; else if (ATT.MED || ATT.HIGH) o.ads = [0, 0, ATT.HIGH ? .27 : .24];
    if (ATT.SUP) { o.muz = [0, B4, .62]; o.fl = .35; }
    if (ATT.GRIP) o.lh = gripL([0, B4 - .052, .1426], [0, .083, .0172]);   // pegangan belakang loop AUG (miring ke belakang)
    return (ARS[k] = o);
  }
  /* KATANA dua tangan mengikuti kenjutsu: bilah bergerak dengan MATA di depan arah gerak, tangan menarik dari pinggul, tuntas lalu kembali siaga.
     kunci = posisi tsuba + arah bilah + arah mata, semua di ruang kamera (x kanan, y atas, z depan): [m, ox,oy,oz, dx,dy,dz, ex,ey,ez]
     kesa = tebasan bahu kanan → pinggang kiri, gyaku = naik kiri-bawah → kanan-atas, yoko = mendatar kanan → kiri (klik kiri bergantian), shomen = belah lurus dari atas kepala sambil menerjang (klik kanan) */
  const KG = [.045, -.05, .36, -.93, .14, .33, .12, 1, .1];   // siaga: dua kepalan berdampingan di kanan-bawah, gagang mendatar, bilah panjang melintang ke kiri nyaris sejajar layar, mata (sisi oranye) di ATAS sehingga sisi lebar terlihat; lengan bawah masuk dari bawah layar
  const KS = {
    run: [.1, -.13, .33, -.85, .3, .42, .3, .9, .3],
    draw: [[0, -.22, -.5, .22, -.8, -.12, .58, -.1, .96, .1], [.42, -.06, -.3, .36, -.62, .28, .73, -.3, .8, .5], [.72, .02, -.1, .4, -.72, .3, .62, .1, 1, .2], [1, ...KG]],
    kesa: { cut: [.3, .6], cam: [-.012, .018], k: [[0, ...KG], [.24, .25, -.02, .3, .26, .86, -.44, -.503, .362, .785], [.33, .2, -.03, .42, .243, .772, .587, -.713, -.268, .648], [.4, .13, -.11, .5, -.199, .488, .85, -.727, -.655, .206], [.47, .06, -.16, .52, -.537, .093, .839, -.455, -.888, .07], [.56, -.01, -.2, .48, -.723, -.301, .622, -.166, -.981, .105], [.72, -.03, -.22, .46, -.75, -.28, .6, -.207, -.83, -.518], [1, ...KG]] },
    gyaku: { cut: [.28, .58], cam: [.012, -.018], k: [[0, ...KG], [.22, -.02, -.2, .42, -.722, -.201, .662, .309, .928, .206], [.32, -.02, -.2, .46, -.676, -.123, .726, .452, .709, .541], [.4, .03, -.17, .52, -.308, .294, .905, .753, .657, .043], [.47, .09, -.12, .52, .135, .597, .791, .751, .242, -.615], [.55, .16, -.06, .46, .56, .72, .41, .374, -.253, -.892], [.72, .19, -.06, .42, .62, .72, .31, .554, -.101, -.826], [1, ...KG]] },
    yoko: { cut: [.3, .62], cam: [-.002, .03], k: [[0, ...KG], [.24, .22, -.16, .42, .945, .218, .242, -.251, .1, .963], [.34, .22, -.16, .42, .655, .269, .706, -.755, .207, .622], [.41, .13, -.16, .5, .186, .337, .923, -.982, .044, .182], [.48, .04, -.16, .52, -.334, .313, .889, -.91, -.257, -.326], [.57, -.07, -.17, .48, -.817, .179, .548, -.452, -.579, -.678], [.72, -.12, -.18, .44, -.882, .02, .471, -.302, -.302, -.905], [1, ...KG]] },
    shomen: { cut: [.52, .76], cam: [-.034, 0], k: [[0, ...KG], [.3, .12, .12, .33, -.1, .72, -.68, -.02, .68, .72], [.47, .12, .18, .33, -.08, .66, -.75, -.02, .75, .66], [.57, .08, .14, .44, -.12, .86, .5, -.02, -.5, .86], [.65, .05, -.02, .55, -.13, .34, .93, 0, -.93, .34], [.75, .03, -.14, .47, -.08, .04, .99, 0, -.99, .04], [.87, .04, -.16, .45, -.08, .01, .99, 0, -.99, .01], [1, ...KG]] }
  };
  /* kunci → bingkai katana: z = bilah, y = punggung (lawan mata), x = sisi lebar */
  function katF(q) { const z = nrm([q[3], q[4], q[5]]), e = nrm(ma([q[6], q[7], q[8]], z, -dot([q[6], q[7], q[8]], z))), y = mul(e, -1); return { c: [crs(y, z), y, z], t: [q[0], q[1], q[2]] }; }
  let KC = null;   // serangan yang sedang berjalan (dibaca jejak bilah)
  function katPose() {
    KC = null; const t = P.time, idle = [Math.sin(t * 1.3) * .002, Math.sin(t * 1.7) * .003, 0, Math.sin(t * .9) * .006, Math.sin(t * 1.1) * .005, 0, 0, 0, 0]; let q;
    if (P.melT > 0) {
      const A = P.melH ? KS.shomen : [KS.kesa, KS.gyaku, KS.yoko][(P.melN || 0) % 3], m = clamp(1 - P.melT / (P.melD || .62), 0, 1); KC = A; KC.m = m; q = crv(A.k, m);
      V.cam = [A.cam[0] * bump(m, A.cut[0], A.cut[1] - A.cut[0] + .12) + (P.melH ? .014 * bump(m, .12, .4) : 0), A.cam[1] * bump(m, A.cut[0], A.cut[1] - A.cut[0] + .12)];
    } else if (P.eq === 'knife' && P.eqA < F.EQ.draw.knife) q = crv(KS.draw, clamp(P.eqA / F.EQ.draw.knife, 0, 1));
    else { const k = V.spr; q = KG.map((v, i) => lerp(v, KS.run[i], k)); const b = Math.sin(P.bob * 2 + .6) * clamp(P.spd / 8, 0, 1.5); q[1] += b * (.006 + .012 * k); q[0] += Math.sin(P.bob + 2.1) * clamp(P.spd / 8, 0, 1.5) * (.005 + .014 * k); q[4] += b * .012; }
    return katF(q.map((v, i) => v + idle[i]));
  }
  /* satu tangan di gagang (titik pz), genggaman nyata: telapak di sisi PUNGGUNG bilah agak ke luar, jari membungkus ke sisi MATA dan bertemu ibu jari, gagang melintang diagonal di telapak.
     Tangan tidak berpindah mengelilingi gagang saat menebas (dulu ikut arah siku, sehingga pada tebasan mendatar jari malah di atas punggung bilah); hanya boleh bergeser terbatas agar lengan tetap wajar */
  const KCG = [[1.38, 1.5, .9], [1.38, 1.55, .9], [1.38, 1.55, .9], [1.38, 1.5, .9]], KTH = [[.2, -.5, .8], [-.2, -.8, .5], [-.4, -.85, .2]];
  const KA = {}; let kdt = 0;   // sudut tangan di gagang dihaluskan antar bingkai
  function katHand(G, pz, sd, hint) {
    const v = sub(hint, ap(G, [0, 0, pz])), aN = Math.atan2(.98, sd * .2), aH = Math.atan2(dot(v, G.c[1]), dot(v, G.c[0]));
    let dl = sd * Math.atan2(Math.sin(aH - aN), Math.cos(aH - aN)); if (dl > 2.2) dl -= 6.2832;   // pergelangan boleh memutar ke sisi luar sampai ±86°, tidak pernah melewati sisi mata
    const tg = aN + sd * clamp(dl, -1.5, .6), ka = KA[sd] === undefined ? tg : KA[sd] + Math.atan2(Math.sin(tg - KA[sd]), Math.cos(tg - KA[sd])) * Math.min(1, kdt * 16), a = KA[sd] = ka, wv = [Math.cos(a), Math.sin(a), 0], th = .32, co = Math.cos(th), si = Math.sin(th);
    const r = nrm([wv[0] * si, wv[1] * si, co]), f = nrm([-wv[0] * co, -wv[1] * co, si]), d = sd > 0 ? crs(r, f) : crs(f, r);
    return Object.assign(pose(add(add([0, 0, pz - .0068], mul(d, .0215)), mul(wv, -.0195)), r, f, KCG, KTH, sd < 0), { kf: si / co, wb: 1.15 });
  }
  /* jejak bilah: pita tipis di layar selama fase tebas, memudar cepat */
  function katTrail(G, dt) {
    const T = V.kt || (V.kt = []); for (const p of T) p.a -= dt / .15; while (T.length && T[0].a <= 0) T.shift();
    if (KC && KC.m >= KC.cut[0] && KC.m <= KC.cut[1]) { const zc = t => [0, .032 * t * t, .03 + .72 * t], a = ap(G, zc(.55)), b = ap(G, zc(1)); if (a[2] > .06 && b[2] > .06) T.push({ a: 1, x0: CWv / 2 + a[0] / a[2] * FOC, y0: CHv / 2 - a[1] / a[2] * FOC, x1: CWv / 2 + b[0] / b[2] * FOC, y1: CHv / 2 - b[1] / b[2] * FOC }); }
    if (T.length < 2) return;
    const ctx = ctx2; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < T.length; i++) { const p = T[i - 1], q = T[i]; ctx.fillStyle = 'rgba(' + (90 + 90 * q.a | 0) + ',' + (170 + 60 * q.a | 0) + ',255,' + (.22 * q.a * q.a).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(p.x0, p.y0); ctx.lineTo(p.x1, p.y1); ctx.lineTo(q.x1, q.y1); ctx.lineTo(q.x0, q.y0); ctx.fill(); }
    ctx.restore();
  }

  /* ---------- granat di tangan: keluarkan + cabut pin → diam → tahan klik kiri = tarik ke belakang → lepas = ayun lempar; klik kanan = pukul ----------
     granat punya bingkai sendiri (y = sumbu sumbu-picu ke atas, x = sisi telapak, z = arah jari); tangan kanan dipose di bingkai itu sehingga jari & ibu jari
     benar-benar melingkari granat, lalu seluruh bingkai digeser/diputar di ruang kamera. GR = posisi pusat granat (ruang kamera), granat lepas pada F.EQ.rel dtk */
  const GR = { rdy: [.105, -.1, .29], low: [.15, -.38, .24], wind: [.15, -.04, .28], rel: [.06, .05, .5], down: [.14, -.36, .38], punch: [.03, -.06, .44],
    lOff: [-.16, -.4, .34], lPull: [-.1, -.1, .3], lPt: [-.13, -.12, .5] };
  const GB = (() => { const f = nrm([-.41, .51, .76]), d = nrm(ma([.81, -.2, .55], f, -dot([.81, -.2, .55], f))); return { c: [d, crs(f, d), f], t: [0, 0, 0] }; })();   // telapak menghadap kiri-belakang: granat terlihat di genggaman
  const GRH = pose([.04, 0, .01], [0, 1, 0], [0, 0, 1], [[.85, 1, .6], [.85, 1.05, .6], [.85, 1.05, .6], [.9, 1, .6]], [[.35, -.5, .75], [.1, -.8, .55], [-.1, -.9, .4]]);   // genggaman bola: jari membungkus sisi depan, ibu jari di atas
  const LPF = nrm([.85, .15, .5]), LPIN = [[.45, .55, .35], [1.15, 1.3, .8], [1.25, 1.35, .8], [1.3, 1.3, .75]], LPT = [[.35, -.35, .85], [.25, -.45, .85], [.15, -.5, .85]];   // tangan kiri penjepit pin: punggung tangan di atas, telunjuk & ibu jari menjepit cincin, jari lain tertekuk
  const GRE = pose([.04, 0, .01], [0, 1, 0], [0, 0, 1], [[.25, .35, .2], [.2, .3, .2], [.25, .3, .2], [.3, .35, .25]], [[.6, -.3, .6], [.6, -.25, .7], [.5, -.2, .8]]);   // tangan terbuka setelah melepas
  function grenade() {   // M67: badan bulat, sumbu picu, tuas pengaman di sisi telapak, cincin pin
    const R = .031, n = 6;
    for (let i = 0; i < n; i++) { const a0 = -1.45 + i * 2.9 / n, a1 = a0 + 2.9 / n; tube([0, Math.sin(a0) * R, 0], [0, Math.sin(a1) * R, 0], Math.cos(a0) * R, Math.cos(a1) * R, 12, OLV, { cap0: i === 0, cap1: i === n - 1 }); }
    tube([0, .028, 0], [0, .041, 0], .0105, .0095, 10, STL); tube([0, .041, 0], [0, .046, 0], .007, .005, 8, STL);
    box([.014, .038, 0], [.012, .0018, .0055], STL, { r: -.25 }); box([.027, .022, 0], [.0018, .014, .0055], STL, { r: -.12 });   // tuas pengaman
    if (!P.pin) tube([-.013, .04, -.006], [-.013, .04, .006], .0085, .0085, 10, STL, { cap0: false, cap1: false });   // cincin pin
  }
  function grenHands(gl, gk, sl, sl2) {
    const E = F.EQ, a = P.eqA, bob = Math.sin(P.bob + 2.1) * .006 * clamp(P.spd / 8, 0, 1.5) + Math.sin(P.time * 1.7) * .0012, dr = ss(a / (E.draw.gren * .4));   // granat naik dulu, baru pin dicabut di depan mata
    let gp = lv(GR.low, GR.rdy, dr), rp = [-.7 * (1 - dr), 0, .3 * (1 - dr)], show = true, open = 0, lk = 0, lp = GR.lPt, pinch = 0;
    gp = add(gp, [V.sx * .2, V.sy * .2 + bob, 0]);
    const wnd = ss(P.gWind || 0);
    if (P.gT > 0) {   // ayunan: dari posisi tarik ke depan-atas, granat lepas, tangan turun ke kiri-bawah
      const m = clamp(1 - P.gT / E.thr, 0, 1), r = E.rel / E.thr, w0 = Math.max(wnd, .6), st = lv(GR.rdy, GR.wind, w0), k1 = ss(m / r), k2 = ss((m - r) / (1 - r));
      gp = m < r ? lv(st, GR.rel, k1) : lv(GR.rel, GR.down, k2);
      rp = m < r ? [lerp(.55 * w0, -.35, k1), lerp(.25 * w0, -.1, k1), lerp(-.2 * w0, .1, k1)] : [lerp(-.35, -.8, k2), lerp(-.1, -.3, k2), lerp(.1, .3, k2)];
      show = m < r; open = seg(m, r * .8, r * 1.3); lk = 1 - seg(m, .3, .8);
      V.cam = [.012 * bump(m, 0, .4), 0];
    } else if (P.bashT > 0) {   // pukulan: ditarik sedikit, kepalan dihantam ke depan-tengah, kembali
      const m = 1 - P.bashT / E.bash.t, back = bump(m, 0, .25), out = seg(m, .15, .34) * (1 - seg(m, .5, 1));
      gp = add(lv(GR.rdy, GR.punch, out), [.02 * back, 0, -.05 * back]); rp = [.2 * back - .25 * out, .15 * back - .35 * out, -.1 * back + .2 * out];
      V.cam = [.014 * bump(m, .25, .2), 0];
    } else if (wnd > 0) { gp = lv(gp, GR.wind, wnd); rp = add(rp, [.55 * wnd, .25 * wnd, -.2 * wnd]); lk = wnd; }   // ditahan: granat ditarik ke belakang-atas, tangan kiri menunjuk sasaran
    const GX = cmp(xf(rp[0], rp[1], rp[2], gp), GB);
    // tangan kiri mencabut pin saat granat baru dikeluarkan: jari menjepit cincin, lalu ditarik ke kiri
    const pinA = seg(a, .08, .2) * (1 - seg(a, .38, .5)), ring = ap(GX, [-.013, .04, 0]);
    if (pinA > 0 && P.gT <= 0) { lk = Math.max(lk, pinA); pinch = 1; const at = ma(ring, LPF, -.062); lp = lv(at, GR.lPull, seg(a, E.pin, .38)); }
    if (show) { X = GX; grenade(); X = I; }
    if (P.pin && pinA > 0 && P.gT <= 0) { const rc = ma(lv(GR.lOff, lp, ss(lk)), LPF, .062); tube(add(rc, [0, 0, -.006]), add(rc, [0, 0, .006]), .0085, .0085, 10, STL, { cap0: false, cap1: false }); }   // pin di jari kiri
    const H = pxf(GX, open > 0 ? blend(GRH, GRE, open) : GRH);
    hand(H, gl, gk); arm(H, [.3, -.42, .05], [.24, -.32, -.25], sl, sl2);
    if (lk > .02) { const Lk = lv(GR.lOff, lp, ss(lk)), L = pinch ? pose(Lk, [.3, 0, -.95], LPF, LPIN, LPT, true) : pose(Lk, [0, .4, .1], [.1, .1, 1], CO, TO, true); hand(L, gl, gk, true); arm(L, [-.25, -.44, .14], [-.26, -.32, -.2], sl, sl2); }
  }

  /* ---------- GRAPPLING HOOK [H]: peluncur kait terpasang di LENGAN BAWAH KANAN (bukan pistol) ----------
     tangan kanan terulur ke depan mengarahkan kait (kepalan, punggung tangan ke atas); laras peluncur di atas pergelangan sampai di atas
     buku jari, gulungan tali di sisi luar lengan, pelindung lengan bertali dua → tembak: lengan tersentak, kepala kait lepas →
     tarik: lengan lurus ke depan, gulungan berputar → panjat: kedua tangan meraih tepi atap lalu menekan badan naik */
  const HKP = mt([58, 63, 52], .12), HKD = mt([34, 36, 38], .3), HKS = mt([24, 25, 24], .08), ROPE = mt([196, 188, 150], .05), LEDG = mt([60, 255, 120], 1, 40), LEDR = mt([255, 60, 50], 1, 40);
  function wristHook(W0, a, r, d, fired, spin, okAim) {   // ruang kamera. W0 = pergelangan, a = arah lengan (pergelangan → siku), d = punggung tangan (atas), r = sisi ibu jari
    const at = (s, u, v) => add(add(ma(W0, a, s), mul(d, u)), mul(r, v)), up = { up: d };
    tube(at(.025, 0, 0), at(.17, 0, 0), .044, .049, 12, HKD, { up: d, cap0: false, cap1: false });   // pelindung lengan
    tube(at(.012, 0, 0), at(.03, 0, 0), .049, .049, 12, HKP, up);
    for (const q of [.07, .14]) tube(at(q, 0, 0), at(q + .016, 0, 0), .055, .055, 12, HKS, Object.assign({ cap0: false, cap1: false }, up));   // tali pengikat
    boxA(at(.11, .058, 0), [r, d, a], [.021, .014, .07], HKP, -.001);                                  // badan peluncur (rumah gas)
    tube(at(.06, .067, 0), at(-.095, .067, 0), .0145, .0135, 10, HKD, up);                              // laras di atas pergelangan & punggung tangan
    annulus(at(-.095, .067, 0), mul(a, -1), .0085, .0145, 10, HKD);
    tube(at(-.094, .067, 0), at(-.093, .067, 0), .0085, .0085, 8, INN, { up: d, cap0: false });
    boxA(at(-.02, .049, 0), [r, d, a], [.006, .012, .008], HKD, -.001);                                 // penyangga laras di pergelangan
    boxA(at(.165, .074, 0), [r, d, a], [.005, .003, .007], okAim ? LEDG : LEDR, -.002);                 // lampu status bidik (hijau = bisa dikait)
    boxA(at(.125, .074, .012), [r, d, a], [.004, .002, .02], HKD, -.002);
    // gulungan tali di sisi luar (kelingking) lengan: tromol + lilitan tali + jari-jari berputar saat menarik
    const sc = at(.105, .028, -.058);
    tube(sc, ma(sc, r, -.024), .03, .03, 14, HKD, up);
    tube(ma(sc, r, -.004), ma(sc, r, -.02), .033, .033, 14, ROPE, Object.assign({ cap0: false, cap1: false }, up));
    for (let i = 0; i < 3; i++) { const t = spin + i * 2.094, e = add(mul(a, Math.cos(t)), mul(d, Math.sin(t))), c = ma(sc, r, -.0255); tube(ma(c, e, -.022), ma(c, e, .022), .0018, .0018, 4, STL, up); }
    if (!fired) {   // kepala kait 3 cakar di moncong
      const m0 = at(-.095, .067, 0), m1 = ma(m0, a, -.042); tube(m0, m1, .0075, .0065, 8, STL, up);
      for (let i = 0; i < 3; i++) { const t = .5 + i * 2.094, e = add(mul(r, Math.cos(t)), mul(d, Math.sin(t))), b = ma(m1, a, .008), c = ma(ma(b, a, .022), e, .026);
        tube(b, c, .005, .0045, 6, STL, up); tube(c, ma(ma(c, a, -.012), e, .007), .0045, .003, 6, STL, up); }
    }
  }
  function hookHands(gl, gk, sl, sl2, dt) {
    const H = P.hook, C = F.HOOK, t = P.time, E = F.EQ, aim = !H && F.hookAim ? F.hookAim() : null, okAim = !!H || !!(aim && !aim.err);
    V.spool = (V.spool || 0) + dt * (H && H.ph === 'pull' ? 26 : H && H.ph === 'fly' ? -40 : 0);
    if (H && H.ph === 'mantle') {   // memanjat: kedua tangan mencengkeram tepi atap, lalu menekan sampai badan naik & tangan hilang di bawah layar
      const k = clamp((H.t - H.m0) / C.mantle, 0, 1), up = ss(k / .6), grab = ss(k / .12);
      V.cam = [-.02 * bump(k, .25, .5), 0];
      for (const sd of [1, -1]) {
        const K = [.19 * sd, lerp(.02, -.62, up) - .06 * (1 - grab), lerp(.5, .3, up)];
        const Hh = pose(K, [-sd, -.05, .12 * sd], [0, -.5 * (1 - up) - .2, 1], [[.75, .95, .55], [.8, 1, .55], [.8, 1, .55], [.85, .95, .5]], [[.5, -.35, .7], [.4, -.2, .85], [.3, -.1, .9]], sd < 0);
        hand(Hh, gl, gk, sd < 0); arm(Hh, [.42 * sd, -.5, .1], [.2 * sd, -.32, -.22], sl, sl2);
      }
      return;
    }
    const dr = ss(clamp(P.eqA / (E.draw.hook || .42), 0, 1)), bob = Math.sin(P.bob + 2.1) * .006 * clamp(P.spd / 8, 0, 1.5) + Math.sin(t * 1.7) * .0012;
    // pose lengan kanan: dari bawah (diangkat) → terulur ke depan mengarahkan kait; kepalan, punggung tangan ke atas
    let K = lv([.22, -.4, .34], [.105, -.12, .6], dr), f = lv([.1, .75, .6], [-.09, .1, 1], dr);
    K = add(K, [V.sx * .25, V.sy * .25 + bob, 0]); f = add(f, [V.sx * 1.2, V.sy * 1.2, 0]);
    if (H && H.ph === 'fly') { const e = Math.exp(-H.t * 9); K = add(K, [0, .014 * e, -.045 * e]); f = add(f, [0, .35 * e, 0]); V.cam = [.016 * e, 0]; }   // sentakan tembakan gas
    else if (H && H.ph === 'pull') {   // lengan lurus ke arah kait, bergetar menahan tarikan
      const k = ss((H.t - (H.p0 || 0)) / .25), tr = Math.sin(t * 43) * .0025 + Math.sin(t * 29) * .002;
      K = add(lv(K, [.09, -.1, .64], k), [tr, tr * .6, 0]); f = add(f, [0, .08 * k, 0]); V.cam = [Math.sin(t * 31) * .003, 0];
    } else V.cam = [0, 0];
    const RH = pose(K, [-1, .02, -.06], f, CG, TG), W0 = ma(ma(K, RH.f, -.112), RH.d, -.002), a = mul(RH.f, -1);
    X = I; hand(RH, gl, gk); arm(RH, ma(W0, a, .3), [.24, -.36, -.27], sl, sl2);
    wristHook(W0, a, RH.r, RH.d, !!H, V.spool, okAim);
    V.hkMuz = ma(ma(W0, RH.f, .095), RH.d, .067);   // moncong (ruang kamera) → asal tali di fps-life
  }

  /* ---------- kemampuan kelas [F]: senjata diturunkan, tangan kiri memakai alat ----------
     tiap alat punya bingkai lokal (OB) + pose tangan kiri di bingkai itu; kunci [m, x, y, z, pitch, yaw, roll] dengan m = 0..1 sepanjang aksi,
     putaran di ruang kamera di sekitar titik asal alat. Alat tangan kiri = cermin (mirX) pose tangan kanan yang sudah pas (pisau, granat) */
  const frm = (x, y) => { x = nrm(x); y = nrm(ma(y, x, -dot(y, x))); return { c: [x, y, crs(x, y)], t: [0, 0, 0] }; };
  const mirX = B => ({ c: [B.c[0].map((v, i) => i ? -v : v), B.c[1].map((v, i) => i ? v : -v), B.c[2].map((v, i) => i ? v : -v)], t: [0, 0, 0] });
  const OPEN = [[.25, .3, .2], [.2, .25, .2], [.2, .25, .2], [.25, .3, .2]], OPT = [[.6, -.2, .6], [.6, -.15, .7], [.5, -.1, .8]];
  const ORG = mt([235, 120, 30], .2), YEL = mt([214, 178, 40], .25), CYN = mt([90, 200, 235], .5, 30), DKG = mt([44, 46, 48], .25), PLT = mt([70, 74, 64], .12), PLT2 = mt([96, 100, 86], .1), RED = mt([200, 30, 24], .8, 40);
  const ABX = {
    ADRENALINE: { OB: frm([.92, 0, -.4], [0, 1, 0]), H: pose([-.021, .01, .0169], [0, 1, 0], [0, 0, 1], [[1.45, 1.55, .9], [1.45, 1.6, .9], [1.45, 1.6, .9], [1.45, 1.55, .9]], [[.2, -.5, .8], [-.2, -.8, .5], [-.4, -.85, .2]], true),   // kepalan tegak, jarum ke bawah
      K: [[0, -.2, -.45, .32, 0, 0, 0], [.25, -.1, -.06, .32, 0, 0, 0], [.4, -.1, 0, .3, .3, 0, 0], [.52, -.04, -.34, .24, -.2, 0, 0], [.64, -.04, -.34, .24, -.2, 0, 0], [.82, -.2, -.5, .3, 0, 0, 0], [1, -.2, -.5, .3, 0, 0, 0]] },
    PULSE: { OB: frm([.75, .15, .65], [-.1, .55, -.83]), H: pose([.14, -.035, 0], [0, 0, -1], [1, 0, 0], CO, TO, true),
      K: [[0, -.3, -.4, .25, 0, 0, 0], [.28, -.11, -.11, .3, 0, 0, 0], [.42, -.1, -.1, .3, .08, 0, .05], [.62, -.1, -.1, .3, .08, 0, .05], [.85, -.3, -.45, .25, 0, 0, 0], [1, -.3, -.45, .25, 0, 0, 0]] },
    DRONE: { OB: frm([.93, 0, -.35], [0, 1, 0]), H: pose([0, -.028, .04], [-1, 0, 0], [0, 0, 1], OPEN, OPT, true), rel: .5,
      K: [[0, -.2, -.42, .32, 0, 0, 0], [.25, -.07, -.12, .34, 0, 0, 0], [.4, -.07, -.16, .33, 0, 0, 0], [.5, -.05, -.03, .42, .3, 0, 0], [.62, -.05, 0, .44, .3, 0, 0], [.85, -.2, -.45, .32, 0, 0, 0], [1, -.2, -.45, .32, 0, 0, 0]] },
    ARMOR: { OB: frm([1, 0, -.15], [0, 1, 0]), H: pose([-.125, -.02, -.02], [0, -1, 0], [1, 0, 0], [[.9, 1.1, .6], [.9, 1.15, .6], [.9, 1.15, .6], [.95, 1.1, .6]], [[.2, .3, .9], [.1, .2, .95], [0, .1, 1]], true),
      K: [[0, -.25, -.45, .36, 0, 0, 0], [.28, -.03, -.13, .46, 0, .3, 0], [.42, -.02, -.11, .44, .05, .25, 0], [.54, -.01, -.45, .26, -.5, 0, 0], [.68, -.01, -.42, .22, -.5, 0, 0], [.85, -.22, -.5, .3, -.5, 0, 0], [1, -.22, -.5, .3, -.5, 0, 0]] },
    STUN: { OB: mirX(GB), H: pose([-.04, 0, .01], GRH.r.map((v, i) => i ? v : -v), GRH.f.map((v, i) => i ? v : -v), GRH.c, GRH.t, true), rel: .478,
      K: [[0, -.2, -.42, .28, 0, 0, 0], [.2, -.11, -.1, .3, 0, 0, 0], [.36, -.15, -.02, .24, .5, 0, 0], [.48, -.03, .05, .46, -.35, 0, 0], [.65, .02, -.25, .42, -.8, 0, 0], [.85, -.15, -.45, .3, -.8, 0, 0], [1, -.15, -.45, .3, -.8, 0, 0]] },
    PAINT: { OB: frm([1, 0, -.1], [0, 1, 0]), H: gripL([0, -.032, -.02], [0, .09, .02]),
      K: [[0, -.22, -.42, .33, 0, 0, 0], [.25, -.1, -.075, .36, 0, 0, 0], [.45, -.1, -.07, .36, 0, .02, 0], [.75, -.1, -.075, .36, 0, 0, 0], [.9, -.22, -.45, .33, 0, 0, 0], [1, -.22, -.45, .33, 0, 0, 0]] }
  };
  const ABM = {   // model alat (ruang lokal alat); m = kemajuan aksi, on = efek sudah keluar
    ADRENALINE(m, on) {   // injektor otomatis: badan kuning, ujung oranye, jarum keluar saat ditusukkan
      tube([0, .072, 0], [0, .06, 0], .0098, .0098, 10, mt([60, 120, 210], .3)); tube([0, .06, 0], [0, -.045, 0], .0105, .0105, 10, YEL, { segs: 3 });
      tube([0, -.045, 0], [0, -.062, 0], .0105, .008, 10, ORG); if (m > .45) tube([0, -.062, 0], [0, -.082, 0], .0012, .0008, 6, STL);
      box([.0108, -.03, 0], [.0006, .012, .005], mt(on ? [60, 60, 60] : [240, 240, 230], .1), { zb: -.001 });   // jendela isi (kosong setelah disuntik)
    },
    PULSE(m, on, k) {   // tablet pergelangan: layar sian, menyala terang saat pulsa dikirim
      box([0, .005, 0], [.05, .008, .036], DKG); box([0, .0136, 0], [.043, .0006, .029], mt([30 + 160 * k, 120 + 120 * k, 150 + 100 * k], .6, 30), { zb: -.001 });
      box([-.01, -.012, 0], [.006, .012, .042], RUB); box([.03, -.012, 0], [.006, .012, .042], RUB);   // tali
      if (k > .05) for (let i = 1; i <= 2; i++) { const rr = .006 + .018 * ((m * 3 + i * .5) % 1); annulus([0, .0145, 0], [0, 1, 0], rr, rr + .0018, 16, CYN, -.002); }
    },
    DRONE(m) {   // quadcopter mini: badan, 4 lengan, motor & rotor, lampu navigasi, kamera
      box([0, 0, 0], [.035, .012, .045], DKG); box([0, -.014, .03], [.012, .008, .01], POL);
      for (let i = 0; i < 4; i++) { const a = .785 + i * 1.5708, cx = Math.cos(a) * .075, cz = Math.sin(a) * .075;
        box([cx / 2, .002, cz / 2], [.04, .004, .006], DKG, { y: -a }); tube([cx, -.004, cz], [cx, .012, cz], .009, .009, 8, POL);
        disc([cx, .016, cz], [0, 1, 0], .036, 14, mt([30, 30, 30], 0), m > .3 ? .35 : .7); }
      box([.02, .004, .046], [.004, .003, .002], RED); box([-.02, .004, .046], [.004, .003, .002], mt([40, 200, 80], .8));
    },
    ARMOR() {   // pelat keramik: sarung kordura, label, tepi
      box([0, 0, 0], [.11, .14, .012], PLT); box([0, 0, -.0125], [.1, .13, .0008], PLT2, { zb: -.001 }); box([0, .07, -.0135], [.045, .018, .0005], mt([30, 30, 28], .1), { zb: -.002 });
      box([0, -.142, 0], [.105, .003, .013], mt([40, 42, 38], .1));
    },
    STUN() {   // granat kejut: badan bulat abu dengan pita putih, sumbu picu
      const R = .029, n = 6;
      for (let i = 0; i < n; i++) { const a0 = -1.45 + i * 2.9 / n, a1 = a0 + 2.9 / n; tube([0, Math.sin(a0) * R, 0], [0, Math.sin(a1) * R, 0], Math.cos(a0) * R, Math.cos(a1) * R, 12, mt([72, 74, 78], .2), { cap0: i === 0, cap1: i === n - 1 }); }
      tube([0, -.004, 0], [0, .004, 0], .0298, .0298, 14, WHT, { cap0: false, cap1: false }); tube([0, .026, 0], [0, .04, 0], .0105, .0095, 10, STL); box([.014, .036, 0], [.012, .0018, .0055], STL, { r: -.25 });
    },
    PAINT(m, on) {   // penanda laser: badan, lensa ganda, pegangan
      box([0, 0, 0], [.032, .03, .075], OLV); tube([0, .005, .072], [0, .005, .09], .02, .02, 12, POL); disc([0, .005, .0905], [0, 0, 1], .016, 12, mt(on ? [255, 70, 60] : [120, 30, 30], 1, 40), .9);
      tube([0, -.019, .072], [0, -.019, .082], .008, .008, 8, POL); tube([0, .005, -.088], [0, .005, -.075], .014, .016, 10, RUB); box([0, .033, -.02], [.008, .003, .008], RUB);
      box([0, -.062, -.022], [.014, .034, .017], RUB, { p: .15 });
    }
  };
  function abHands(gl, gk, sl, sl2) {
    const A = P.abA, X0 = ABX[A.id], m = clamp(A.t / A.d, 0, 1), an = F.AB_ANIM[A.id], on = A.t >= an.at, glow = [];
    const q = crv(X0.K, m), GX = cmp(xf(q[3], q[4], q[5], [q[0], q[1], q[2]]), X0.OB);
    let H = pxf(GX, X0.H), showObj = true;
    if (X0.rel) {   // alat dilepas (drone diterbangkan, granat kejut dilempar): tangan terbuka, alat lepas
      const open = seg(m, X0.rel * .9, X0.rel * 1.25); if (open > 0) H = pxf(GX, blend(X0.H, Object.assign({}, X0.H, { c: OPEN, t: OPT }), open));
      if (m >= X0.rel) {
        showObj = false;
        if (A.id === 'DRONE') { const tau = (m - X0.rel) * A.d; if (tau < .8) { const g0 = crv(X0.K, X0.rel), DX = cmp(xf(g0[3] + tau * .6, tau * 7, 0, [g0[0] + tau * .05, g0[1] + tau * 1.6, g0[2] + tau * 2.2]), X0.OB); X = DX; ABM.DRONE(m); X = I; } }
      }
    }
    if (showObj) { X = GX; const k = A.id === 'PULSE' ? Math.max(.25 * seg(m, .2, .35), on ? Math.exp(-(A.t - an.at) * 3) : 0) : 0; ABM[A.id](m, on, k); X = I;
      if (A.id === 'PULSE' && k > .02) glow.push([ap(GX, [0, .02, 0]), .05 * k, '90,220,255']);
      if (A.id === 'PAINT' && m > .36 && m < .8) glow.push([ap(GX, [0, .005, .095]), .02, '255,60,50', true]);
      if (A.id === 'ADRENALINE' && on && A.t - an.at < .4) glow.push([ap(GX, [0, -.06, 0]), .03, '255,170,80']); }
    hand(H, gl, gk, true); arm(H, [-.25, -.44, .14], [-.26, -.32, -.2], sl, sl2);
    return glow;
  }

  /* ---------- isyarat suara selaras animasi ---------- */
  function cue(R, name, t, at, snd) { if (t >= at && !R.f[name]) { R.f[name] = 1; const a = AU(); if (a) a.local(snd || name, .7); } }

  /* ---------- kurva kunci & pegas: gerak reload berkesinambungan + hentakan yang memantul lalu mereda ----------
     kunci [[t, a0, a1, ...], ...] diinterpolasi Hermite/Catmull-Rom: kecepatan menerus di kunci tengah (tidak berhenti kaku
     di tiap pose), diam di kunci pertama & terakhir. ring(): pegas teredam analitik — dorongan seketika pada `at` detik */
  function crv(K, t) {
    const n = K.length; if (t <= K[0][0]) return K[0].slice(1); if (t >= K[n - 1][0]) return K[n - 1].slice(1);
    let i = 0; while (t > K[i + 1][0]) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(n - 1, i + 2)], h = p2[0] - p1[0], u = (t - p1[0]) / h, u2 = u * u, u3 = u2 * u, out = [];
    for (let j = 1; j < p1.length; j++) {
      const m1 = i ? (p2[j] - p0[j]) / (p2[0] - p0[0]) * h : 0, m2 = i + 2 < n ? (p3[j] - p1[j]) / (p3[0] - p1[0]) * h : 0;
      out.push((2 * u3 - 3 * u2 + 1) * p1[j] + (u3 - 2 * u2 + u) * m1 + (3 * u2 - 2 * u3) * p2[j] + (u3 - u2) * m2);
    }
    return out;
  }
  const ring = (ts, at, f, z) => ts < at ? 0 : Math.exp(-z * (ts - at)) * Math.sin(6.2832 * f * (ts - at));
  const shift = (h, v) => Object.assign({}, h, { K: add(h.K, v) });
  const Z6 = [0, 0, 0, 0, 0, 0], PUp = [-.15, -.42, -.12, .7, .4, .6];   // kantong magasin di rompi (kiri bawah, di luar layar)
  /* pose tangan kiri tambahan: telapak menelungkup di atas senjata (jari ke kanan-depan, lengan datang dari kiri-bawah) */
  const topL = (pt, cl) => pose(add(pt, [-.02, .032, -.01]), [.6, 0, -.7], [.7, .12, .6], cl || [[.5, .7, .4], [.55, .75, .4], [.55, .75, .4], [.6, .75, .4]], [[.3, -.75, .4], [.2, -.85, .3], [.1, -.85, .2]], true);
  const PINCH = [[1.25, 1.1, .7], [1.2, 1.1, .7], [1.3, 1.25, .8], [1.35, 1.25, .8]];   // jari menjepit peluru / tepi slide
  const WRAP = [[1.05, 1.15, .7], [1.1, 1.2, .7], [1.1, 1.2, .7], [1.15, 1.15, .7]];   // telapak menggenggam slide dari atas (overhand)
  /* aksi slide pistol kosong: jepit belakang slide ("slingshot": Glock, 93R) atau genggam dari atas lalu tarik (M1911, Desert Eagle) */
  const SLING = { PISTOL: topL([.004, -.012, -.03], PINCH), GLOCK: topL([.004, -.011, -.033], PINCH), M93R: topL([.004, -.011, -.03], PINCH),
    M1911: topL([.006, -.012, -.008], WRAP), DEAGLE: topL([.008, -.014, -.028], WRAP) };

  /* ---------- koreografi reload per senjata (referensi: CoD Modern Warfare 2019 & video reload MW2 2009) ----------
     gt/ge = kunci pose senjata [t, x, y, z, pitch, yaw, roll] untuk reload taktis / magasin kosong (relatif pose pinggul, t = 0..1),
     t/e = waktu kunci tangan & magasin, ev = hentakan [suara, t, dorongan senjata 6, frekuensi Hz, redaman, kamera pitch, kamera yaw] */
  const RL = {
    /* M4A1 (video MW2 2:35): senapan diayun ke TEPI KANAN layar, moncong diputar jauh ke kiri sehingga sisi kiri & lubang
       magasin menghadap kamera; tangan kiri mencabut magasin ke kiri, membawa magasin baru dekat kamera, menghantamnya masuk
       dari bawah (moncong terdongak); kosong: magasin dijatuhkan, telapak menepuk bolt catch → bolt menghantam maju */
    AR: { pu: [-.17, -.1, .04, .3, .4, .6],   // magasin baru dibawa di kiri, dekat kamera (bukan dari bawah layar)
      t: { o0: .07, o1: .17, o2: .27, p: .38, n0: .42, n1: .53, n2: .6, tap: .66, end: .84 }, e: { drop: .1, n0: .27, n1: .39, n2: .46, act: .575, end: .76 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, .045, .06, .03, .16, -.48, -.3], [.22, .065, .082, .04, .25, -.68, -.43], [.38, .067, .087, .04, .24, -.67, -.45], [.52, .064, .085, .04, .28, -.65, -.47],
        [.6, .06, .095, .04, .36, -.62, -.5], [.7, .045, .072, .03, .25, -.45, -.36], [.86, .004, -.01, 0, -.035, .05, .05], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.1, .05, .065, .03, .18, -.52, -.32], [.22, .065, .082, .04, .25, -.68, -.43], [.4, .066, .086, .04, .25, -.67, -.45], [.46, .06, .095, .04, .36, -.62, -.5],
        [.53, .05, .088, .03, .24, -.52, -.2], [.6, .045, .083, .03, .22, -.46, -.14], [.74, .02, .05, .01, .12, -.28, -.14], [.9, .004, -.008, 0, -.03, .04, .04], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .19, [0, -.006, 0, -.045, 0, -.03], 3.2, 8], ['magin', .602, [0, .016, 0, .09, 0, .03], 3.6, 9, .006], ['tap', .662, [0, .009, 0, .05, 0, .012], 4, 10, .003]],
        e: [['magout', .1, [0, -.004, 0, -.03, 0, -.02], 3.2, 8], ['magin', .462, [0, .013, 0, .075, 0, .025], 3.6, 9, .005], ['boltrel', .578, [0, -.004, -.018, .1, .02, .05], 2.8, 7, .008, .002]] } },
    /* AK-74M (video MW2 3:09, AK-47): senapan diangkat hampir TEGAK di tepi kanan, sisi magasin menghadap kiri; magasin lama
       diayun ke depan pada lug depannya lalu dibawa/dilepas ke kiri; magasin baru datang dari kiri, lug depan dikaitkan
       lalu diayun ke belakang sampai terkunci (cara khas AK). Kosong: senapan diturunkan miring, tangan kiri melewati atas
       receiver menarik tuas kokang kanan lalu melepasnya. out/bel = pose magasin dicabut / dikait (relatif lug depan) */
    AK: { pu: [-.085, -.125, -.1, -.5, .2, .7], out: [0, -.05, .025, .55, 0, .15], bel: [0, -.006, .002, .42, 0, 0],
      t: { o0: .06, o1: .14, o2: .24, p: .36, n0: .4, n1: .5, n2: .58, tap: .64, end: .82 }, e: { drop: .12, n0: .28, n1: .4, n2: .47, act: .6, act1: .7, end: .86 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, .03, .075, .01, .65, -.25, -.55], [.2, .055, .1, -.02, 1.15, -.2, -1], [.4, .058, .1, -.02, 1.2, -.2, -1.05], [.52, .055, .1, -.02, 1.15, -.2, -1],
        [.58, .05, .1, -.02, 1.08, -.2, -.95], [.7, .032, .065, 0, .52, -.3, -.45], [.86, .004, -.01, 0, -.035, .05, .05], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.1, .03, .075, .01, .65, -.25, -.55], [.2, .055, .1, -.02, 1.15, -.2, -1], [.42, .058, .1, -.02, 1.2, -.2, -1.05], [.47, .05, .1, -.02, 1.08, -.2, -.95],
        [.56, .03, .045, .07, .42, -.38, -.45], [.7, .028, .042, .07, .4, -.36, -.42], [.8, .016, .03, .03, .2, -.2, -.15], [.92, .004, -.008, 0, -.03, .04, .04], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .22, [0, -.006, 0, -.05, 0, -.03], 3, 8], ['magin', .582, [0, .016, 0, .09, 0, .03], 3.4, 9, .006], ['tap', .642, [0, .009, 0, .05, 0, .012], 4, 10, .003]],
        e: [['magout', .12, [0, -.005, 0, -.04, 0, -.02], 3, 8], ['magin', .472, [0, .016, 0, .09, 0, .03], 3.4, 9, .006], ['chback', .64, [0, 0, -.01, .05, 0, 0], 3.6, 10], ['chrel', .705, [0, .006, .018, -.09, 0, .03], 3, 8, -.007, .002]] } },
    /* SIG MPX: gerak cepat & lentur, moncong dijungkitkan tinggi. Taktis: magasin baru DIHANTAM
       telapak dari bawah; kosong: tangan kiri menarik tuas kokang belakang lalu melepaskannya */
    SMG: {
      t: { o0: .05, o1: .15, o2: .24, p: .36, n0: .38, n1: .48, n2: .545, tap: .6, end: .76 }, e: { drop: .08, n0: .24, n1: .34, n2: .42, act: .5, act1: .62, end: .84 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.08, -.01, .065, .08, .28, -.28, -.42], [.15, -.02, .105, .14, .42, -.48, -.7], [.3, -.024, .1, .14, .46, -.5, -.76], [.45, -.018, .11, .14, .36, -.44, -.6], [.56, -.02, .105, .14, .4, -.47, -.7], [.64, -.015, .09, .12, .32, -.4, -.58], [.8, .006, -.012, -.015, -.06, .06, .08], [.9, -.002, .003, .004, .015, -.015, -.02], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.08, -.01, .065, .08, .28, -.28, -.42], [.15, -.02, .105, .14, .42, -.48, -.7], [.42, -.02, .105, .14, .4, -.47, -.7], [.5, -.01, .09, .18, .25, -.38, -.3], [.62, -.01, .095, .17, .28, -.4, -.27], [.72, -.01, .07, .1, .16, -.24, -.2], [.86, .005, -.01, -.012, -.05, .05, .06], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .17, [0, -.008, 0, -.06, 0, -.04], 4.5, 10], ['magin', .548, [0, .016, 0, .1, 0, .03], 4.2, 10, .005], ['tap', .602, [0, .014, 0, .09, 0, .02], 4.5, 11, .004]],
        e: [['magout', .08, [0, -.005, 0, -.04, 0, -.03], 4.5, 10], ['magin', .422, [0, .016, 0, .1, 0, .03], 4.2, 10, .005], ['chback', .55, [0, 0, -.008, .04, 0, 0], 4, 12], ['chrel', .625, [0, .004, .014, -.07, 0, .02], 3.4, 8, -.006]] } },
    /* senapan runduk bolt-action: lambat & mantap. Taktis: magasin ditukar lalu ditarik sekali (cek terkunci);
       kosong: baut dibuka DULU (tangan kanan), magasin ditukar, baut didorong & dikunci */
    SNIPER: {
      t: { o0: .08, o1: .2, o2: .32, p: .44, n0: .47, n1: .58, n2: .64, tap: .7, end: .86, via: [-.04, -.12, -.16] }, e: { drop: .26, n0: .4, n1: .5, n2: .56, end: .93 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, -.012, .07, .1, .08, -.3, -.24], [.2, -.02, .1, .16, .12, -.5, -.4], [.34, -.024, .095, .16, .15, -.53, -.46], [.5, -.018, .105, .16, .1, -.46, -.36], [.65, -.02, .1, .16, .12, -.5, -.4], [.74, -.018, .09, .14, .11, -.45, -.36], [.9, .004, -.008, -.01, -.03, .04, .04], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.08, -.01, .05, .06, .06, -.12, .1], [.2, -.012, .07, .08, .08, -.16, .16], [.3, -.02, .1, .16, .12, -.5, -.4], [.5, -.018, .105, .16, .1, -.46, -.36], [.58, -.02, .1, .16, .12, -.5, -.4], [.66, -.012, .07, .08, .08, -.16, .14], [.8, -.01, .06, .07, .06, -.12, .1], [.94, .003, -.006, -.008, -.02, .03, .03], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .22, [0, -.005, 0, -.035, 0, -.02], 2.6, 7], ['magin', .642, [0, .01, 0, .06, 0, .02], 3, 8, .004], ['tug', .7, [0, -.006, 0, -.03, 0, 0], 3.4, 9]],
        e: [['boltup', .1, [0, .004, 0, .02, 0, -.03], 3, 9], ['boltbk', .19, [0, 0, -.006, .02, 0, 0], 3, 9], ['magout', .26, [0, -.004, 0, -.02, 0, -.02], 2.6, 7], ['magin', .562, [0, .01, 0, .06, 0, .02], 3, 8, .004],
          ['boltfw', .7, [0, 0, .008, -.025, 0, 0], 3, 9], ['boltdn', .78, [0, -.005, 0, -.03, 0, .03], 3.2, 9, .003]] } },
    /* pistol: magasin selalu dijatuhkan (tekan tombol), magasin baru ditepuk masuk; kosong: "slingshot" — tangan kiri
       menjepit belakang slide, menariknya lalu melepas → slide melesat maju, pistol tersentak */
    PISTOL: {
      t: { drop: .14, n0: .32, n1: .46, n2: .53, tap: .59, end: .8 }, e: { drop: .1, n0: .26, n1: .39, n2: .46, act: .58, act1: .68, end: .86 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, -.02, .05, 0, .1, -.3, -.28], [.18, -.03, .08, 0, .15, -.45, -.4], [.4, -.032, .075, 0, .17, -.47, -.44], [.55, -.03, .08, 0, .15, -.45, -.4], [.65, -.025, .07, 0, .13, -.4, -.36], [.82, .004, -.01, 0, -.04, .05, .05], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.1, -.02, .05, 0, .1, -.3, -.28], [.18, -.03, .08, 0, .15, -.45, -.4], [.47, -.03, .08, 0, .15, -.45, -.4], [.56, -.02, .07, .03, .1, -.1, .25], [.66, -.02, .075, .02, .12, -.08, .3], [.74, -.015, .05, .01, .08, -.12, .12], [.88, .004, -.008, 0, -.04, .04, -.03], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .14, [0, -.004, 0, -.03, 0, -.02], 4, 10], ['magin', .532, [0, .012, 0, .09, 0, .02], 4, 10, .004], ['tap', .592, [0, .012, 0, .1, 0, .015], 4.5, 11, .004]],
        e: [['magout', .1, [0, -.004, 0, -.03, 0, -.02], 4, 10], ['magin', .462, [0, .012, 0, .09, 0, .02], 4, 10, .004], ['slide', .682, [0, .006, .016, .12, 0, -.03], 3.4, 8, .007]] } },
    /* ----- pistol per kelas, gerak mengikuti video referensi MW2 (2009) ----- */
    /* M1911: diangkat ke kanan, moncong ke kiri-atas & digulingkan jauh ke kanan (lubang magasin menghadap tangan kiri);
       kosong: senjata diratakan lagi, tangan kiri menggenggam slide dari atas & menariknya */
    M1911: { k: 'over',
      t: { drop: .14, n0: .32, n1: .46, n2: .53, tap: .59, end: .8 }, e: { drop: .1, n0: .26, n1: .39, n2: .46, act: .58, act1: .68, end: .86 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, -.025, .06, 0, .22, -.35, -.55], [.18, -.035, .09, 0, .32, -.5, -.85], [.4, -.037, .085, 0, .34, -.52, -.88], [.55, -.035, .09, 0, .32, -.5, -.85], [.65, -.03, .08, 0, .28, -.45, -.75], [.82, .004, -.01, 0, -.04, .05, .05], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.1, -.025, .06, 0, .22, -.35, -.55], [.18, -.035, .09, 0, .32, -.5, -.85], [.47, -.035, .09, 0, .32, -.5, -.85], [.56, -.025, .06, .03, .12, -.2, -.08], [.66, -.025, .065, .02, .14, -.16, -.04], [.74, -.015, .045, .01, .08, -.12, 0], [.88, .004, -.008, 0, -.04, .04, -.03], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .14, [0, -.004, 0, -.03, 0, -.02], 4, 10], ['magin', .532, [0, .013, 0, .1, 0, .02], 4, 10, .004], ['tap', .592, [0, .012, 0, .1, 0, .015], 4.5, 11, .004]],
        e: [['magout', .1, [0, -.004, 0, -.03, 0, -.02], 4, 10], ['magin', .462, [0, .013, 0, .1, 0, .02], 4, 10, .004], ['slide', .682, [0, .008, .018, .14, 0, -.02], 3.4, 8, .008]] } },
    /* Glock (G18 MW2): diayun ke kanan-atas, moncong menukik ke kiri, digulingkan nyaris rebah; magasin panjang ditarik
       keluar; kosong: senjata digulingkan ke kiri, belakang slide dijepit ("slingshot") */
    GLOCK: { k: 'sling',
      t: { drop: .13, n0: .3, n1: .44, n2: .51, tap: .57, end: .78 }, e: { drop: .1, n0: .25, n1: .38, n2: .45, act: .56, act1: .66, end: .84 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, -.01, .07, 0, .3, -.45, -.7], [.18, -.015, .1, 0, .42, -.6, -1], [.4, -.017, .095, 0, .44, -.62, -1.02], [.53, -.015, .1, 0, .42, -.6, -1], [.63, -.012, .085, 0, .36, -.52, -.85], [.8, .004, -.01, 0, -.04, .05, .05], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.1, -.01, .07, 0, .3, -.45, -.7], [.18, -.015, .1, 0, .42, -.6, -1], [.45, -.015, .1, 0, .42, -.6, -1], [.54, -.02, .07, .03, .12, -.1, .3], [.64, -.02, .075, .02, .14, -.08, .35], [.72, -.015, .05, .01, .08, -.12, .14], [.86, .004, -.008, 0, -.04, .04, -.03], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .13, [0, -.004, 0, -.03, 0, -.02], 4.2, 10], ['magin', .512, [0, .012, 0, .09, 0, .02], 4.2, 10, .004], ['tap', .572, [0, .012, 0, .1, 0, .015], 4.5, 11, .004]],
        e: [['magout', .1, [0, -.004, 0, -.03, 0, -.02], 4.2, 10], ['magin', .452, [0, .012, 0, .09, 0, .02], 4.2, 10, .004], ['slide', .662, [0, .006, .016, .12, 0, -.03], 3.6, 8, .007]] } },
    /* Beretta 93R: diangkat & digulingkan ke KIRI (sisi kanan terlihat), moncong mendongak; magasin 20 peluru diganti dari bawah */
    M93R: { k: 'sling',
      t: { drop: .14, n0: .32, n1: .47, n2: .54, tap: .6, end: .8 }, e: { drop: .1, n0: .27, n1: .4, n2: .47, act: .58, act1: .68, end: .86 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, -.03, .06, 0, .25, -.3, .25], [.18, -.04, .09, 0, .4, -.42, .38], [.4, -.042, .085, 0, .42, -.44, .4], [.56, -.04, .09, 0, .4, -.42, .38], [.66, -.035, .08, 0, .32, -.36, .3], [.82, .004, -.01, 0, -.04, .05, -.04], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.1, -.03, .06, 0, .25, -.3, .25], [.18, -.04, .09, 0, .4, -.42, .38], [.47, -.04, .09, 0, .4, -.42, .38], [.56, -.02, .07, .03, .12, -.1, .3], [.66, -.02, .075, .02, .14, -.08, .35], [.74, -.015, .05, .01, .08, -.12, .14], [.88, .004, -.008, 0, -.04, .04, -.03], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .14, [0, -.004, 0, -.03, 0, -.02], 4, 10], ['magin', .542, [0, .012, 0, .09, 0, .02], 4, 10, .004], ['tap', .602, [0, .012, 0, .1, 0, .015], 4.5, 11, .004]],
        e: [['magout', .1, [0, -.004, 0, -.03, 0, -.02], 4, 10], ['magin', .472, [0, .012, 0, .09, 0, .02], 4, 10, .004], ['slide', .682, [0, .006, .016, .12, 0, -.03], 3.4, 8, .007]] } },
    /* Desert Eagle: berat — moncong didongakkan tinggi & digulingkan ke kanan, magasin besar masuk dengan hentakan keras;
       kosong: senjata diratakan, slide digenggam dari atas & dibanting */
    DEAGLE: { k: 'over',
      t: { drop: .15, n0: .33, n1: .48, n2: .55, tap: .61, end: .82 }, e: { drop: .11, n0: .28, n1: .41, n2: .48, act: .6, act1: .7, end: .88 },
      gt: [[0, 0, 0, 0, 0, 0, 0], [.1, -.02, .06, 0, .38, -.3, -.4], [.18, -.03, .1, -.01, .58, -.42, -.6], [.4, -.032, .095, -.01, .6, -.44, -.62], [.57, -.03, .1, -.01, .56, -.42, -.72], [.67, -.025, .085, 0, .44, -.38, -.58], [.84, .004, -.012, 0, -.05, .05, .06], [1, 0, 0, 0, 0, 0, 0]],
      ge: [[0, 0, 0, 0, 0, 0, 0], [.1, -.02, .06, 0, .38, -.3, -.4], [.18, -.03, .1, -.01, .58, -.42, -.6], [.49, -.03, .1, -.01, .56, -.42, -.72], [.58, -.025, .055, .03, .15, -.18, -.05], [.68, -.025, .06, .02, .17, -.15, 0], [.76, -.015, .045, .01, .1, -.12, .02], [.9, .004, -.008, 0, -.05, .04, -.03], [1, 0, 0, 0, 0, 0, 0]],
      ev: { t: [['magout', .15, [0, -.006, 0, -.04, 0, -.02], 3.4, 9], ['magin', .552, [0, .018, 0, .14, 0, .03], 3.4, 9, .006], ['tap', .612, [0, .015, 0, .12, 0, .02], 4, 10, .005]],
        e: [['magout', .11, [0, -.006, 0, -.04, 0, -.02], 3.4, 9], ['magin', .482, [0, .018, 0, .14, 0, .03], 3.4, 9, .006], ['slide', .702, [0, .01, .022, .18, 0, -.03], 3, 7, .01]] } }
  };
  /* reload magasin (M4A1, SMG, senapan runduk, pistol) */
  function magRel(sp, id, t, R, out) {
    const C = RL[id], E = R.empty, T = E ? C.e : C.t, drop = E || T.drop !== undefined, pv = sp.mp;
    const MX = v => bone(pv, [v[0], v[1], v[2]], v[3], v[4], v[5]), hold = M => pxf(M, sp.mh), SEAT = MX(Z6), pu = C.pu || PUp;
    const OUTp = C.out || sp.mo.concat([-.12, 0, .05]), BELp = C.bel || mul(sp.mo, .75).concat([.14, 0, 0]);   // C.out/C.bel: magasin diayun pada lug depan (AK)
    out.g = crv(E ? C.ge : C.gt, t);
    // magasin baru selalu diambil dari kantong rompi (di luar layar); C.pu = titik tampil di kiri dekat kamera sebelum didorong masuk
    const fresh = (a, b) => MX(crv(C.pu ? [[a, ...PUp], [(a + b) / 2, ...pu], [b, ...BELp], [T.n2, ...Z6]] : [[a, ...pu], [b, ...BELp], [T.n2, ...Z6]], t));
    // magasin lepas jatuh menurut gravitasi LAYAR (bukan sumbu senjata — senjata bisa sedang tegak/miring): arah bawah layar dalam ruang senjata
    const hr = sp.hr || Z6, ga = [hr[0] + out.g[3], hr[1] + out.g[4], hr[2] + out.g[5]], dn = rz(rx(ry([0, -1, 0], -ga[1]), -ga[0]), -ga[2]);
    const fallAt = (t0, o) => { const tau = (t - t0) * P.relD, d = 4.9 * tau * tau + .1 * tau; return t >= t0 && tau < .7 ? MX([o[0] + dn[0] * d - .02 * tau, o[1] + dn[1] * d, o[2] + dn[2] * d + .03 * tau, o[3] - 2.5 * tau, o[4], o[5] + 1.4 * tau]) : null; };
    // magasin: dijatuhkan bebas (atau dicabut lalu dilepas) → tangan ke rompi → magasin baru naik & didorong masuk
    if (drop && C.out) {   // AK kosong: tangan menggenggam magasin, mengayunnya keluar pada lug depan, lalu melepasnya jatuh
      const a = T.drop - .07, fall = fallAt(T.drop, OUTp);
      if (t < a) out.mag = SEAT;
      else if (t < T.drop) { out.mag = MX(crv([[a, ...Z6], [T.drop, ...OUTp]], t)); out.out = true; }
      else if (t < T.n0) { out.mag = fall; out.out = true; }
      else { out.mag2 = fall; out.mag = fresh(T.n0, T.n1); out.out = t < T.n2; }
      out.lh = t < a ? blend(sp.lh, hold(SEAT), seg(t, .02, a)) : t < T.drop ? hold(out.mag) : t < T.n0 ? blend(hold(MX(OUTp)), hold(MX(PUp)), seg(t, T.drop, T.n0)) : hold(out.mag);
    } else if (drop) {
      const fall = fallAt(T.drop, Z6);
      if (t < T.drop) out.mag = SEAT;
      else if (t < T.n0) { out.mag = fall; out.out = true; }
      else { out.mag2 = fall; out.mag = fresh(T.n0, T.n1); out.out = t < T.n2; }
      out.lh = t < T.drop - .02 ? (t < T.drop - .05 ? sp.lh : blend(sp.lh, shift(sp.lh, [0, -.012, -.01]), seg(t, T.drop - .05, T.drop - .02))) : t < T.n0 ? blend(shift(sp.lh, [0, -.012, -.01]), hold(MX(C.pu ? PUp : pu)), seg(t, T.drop - .02, T.n0)) : hold(out.mag);
    } else if (C.pu) {   // taktis gaya MW2: magasin lama dicabut lalu dilepas jatuh, tangan ke rompi, magasin baru naik lewat sisi kiri
      if (t < T.o2) { out.mag = MX(crv([[T.o1, ...Z6], [T.o2, ...OUTp]], t)); out.out = t > T.o1 + .005; }
      else { out.mag2 = fallAt(T.o2, OUTp); out.mag = t < T.p ? null : fresh(T.p, T.n1); out.out = true; }
      out.lh = t < T.o1 ? blend(sp.lh, hold(SEAT), seg(t, T.o0, T.o1)) : t < T.o2 ? hold(out.mag) : t < T.p ? blend(hold(MX(OUTp)), hold(MX(PUp)), seg(t, T.o2, T.p)) : hold(out.mag);
    } else {
      out.mag = MX(crv([[T.o1, ...Z6], [T.o2, ...OUTp], [T.p, ...pu], [T.n0, ...pu], [T.n1, ...BELp], [T.n2, ...Z6]], t)); out.out = t > T.o1 + .005 && t < T.n2;
      const m = (T.o0 + T.o1) / 2, low = T.via ? shift(sp.lh, T.via) : null;   // via: tangan turun dulu agar lengan tidak melintang di depan layar
      out.lh = t >= T.o1 ? hold(out.mag) : !low ? blend(sp.lh, hold(SEAT), seg(t, T.o0, T.o1)) : t < m ? blend(sp.lh, low, seg(t, T.o0, m)) : blend(low, hold(SEAT), seg(t, m, T.o1));
    }
    if (t < T.n2) return;
    // aksi penutup per senjata
    const n2 = T.n2, rel = (h, a, b) => blend(h, sp.lh, seg(t, a, b));
    if (!E && T.tap !== undefined) {   // telapak menjauh sedikit lalu menepuk dasar magasin
      const w = T.tap - n2, k = bump(t, n2 + .004, w - .004), hs = shift(hold(SEAT), [0, -(id === 'SNIPER' ? -.004 : id === 'SMG' ? .05 : .034) * k, -.008 * k]);
      out.lh = t < T.tap + .02 ? hs : rel(hs, T.tap + .02, T.end);
      if (id === 'SNIPER') out.lh = shift(out.lh, [0, -.01 * bump(t, T.tap - .02, .06), 0]);   // tarik magasin sekali: memastikan terkunci
    } else if (E && id === 'AR') {     // tepuk bolt catch di sisi kiri
      const pr = shift(sp.cp, [.007 * bump(t, T.act - .015, .05), 0, 0]);
      out.lh = t < n2 + .03 ? hold(SEAT) : t < T.act - .015 ? blend(hold(SEAT), sp.cp, seg(t, n2 + .03, T.act - .015)) : t < T.act + .05 ? pr : rel(sp.cp, T.act + .05, T.end);
    } else if (E && id === 'AK') {     // tangan kiri melewati atas receiver, tarik tuas kokang kanan sampai mentok, lepas → bolt menghantam maju
      const ck = topL(sp.ck, WRAP), pull = .075 * seg(t, T.act, T.act + .05) * (1 - seg(t, T.act1, T.act1 + .012)); out.ch = pull;
      out.lh = t < n2 + .02 ? hold(SEAT) : t < T.act ? blend(hold(SEAT), ck, seg(t, n2 + .02, T.act)) : t < T.act1 + .03 ? shift(ck, [0, 0, -pull]) : rel(ck, T.act1 + .03, T.end);
    } else if (E && id === 'SMG') {    // tarik tuas kokang belakang, tahan, lepas → bolt melesat
      const pull = .05 * seg(t, T.act, T.act + .05) * (1 - seg(t, T.act1, T.act1 + .012)); out.ch = pull;
      const cp = shift(sp.cp, [0, 0, -pull]);
      out.lh = t < n2 + .02 ? hold(SEAT) : t < T.act ? blend(hold(SEAT), sp.cp, seg(t, n2 + .02, T.act)) : t < T.act1 + .03 ? cp : rel(sp.cp, T.act1 + .03, T.end);
    } else if (E && SLING[id]) {       // slingshot / overhand: pegang slide, tarik, lepas → slide melesat maju
      const sl = SLING[id], pull = .009 * seg(t, T.act, T.act1 - .02) * (1 - seg(t, T.act1, T.act1 + .008)), lt = C.k === 'over' ? .022 : .03;
      out.slide = t < T.act1 ? sp.slt + pull : 0;
      const hs = shift(sl, [0, C.k === 'over' ? .012 * seg(t, T.act1, T.act1 + .04) : 0, -pull - (t >= T.act1 ? lt * seg(t, T.act1, T.act1 + .04) : 0)]);
      out.lh = t < n2 + .02 ? hold(SEAT) : t < T.act ? blend(hold(SEAT), sl, seg(t, n2 + .02, T.act)) : t < T.act1 + .04 ? hs : rel(shift(sl, [0, C.k === 'over' ? .012 : 0, -lt]), T.act1 + .04, T.end);
    } else if (E && id === 'SNIPER') out.lh = rel(hold(SEAT), n2 + .02, n2 + .16);
    else out.lh = rel(hold(SEAT), n2 + .02, T.end);
  }
  /* DUAL — reload cepat gaya Black Ops (tiap reload ganjil): senapan hanya dimiringkan sedikit ke kanan; tangan kiri menggenggam
     pasangan magasin, mencabutnya SECUKUPNYA (puncak magasin lewat dasar magwell), menggesernya ke samping sampai magasin
     sebelah segaris magwell, lalu menghantamnya masuk dan menepuk dasarnya. Kosong: telapak menepuk bolt catch → bolt maju.
     Reload genap = reload penuh biasa (pasangan kosong dibuang, pasangan baru dari rompi) lewat magRel */
  const RLD = {
    t: { g0: .04, g1: .14, out: .26, sh: .4, in: .5, tap: .58, end: .78 }, e: { g0: .04, g1: .13, out: .24, sh: .37, in: .46, act: .58, end: .8 },
    gt: [[0, 0, 0, 0, 0, 0, 0], [.12, .045, .07, .025, .18, -.5, -.36], [.28, .06, .09, .03, .24, -.62, -.44], [.42, .062, .09, .03, .22, -.62, -.44], [.52, .06, .1, .03, .32, -.6, -.46],
      [.6, .052, .085, .025, .24, -.52, -.38], [.8, .004, -.008, 0, -.03, .04, .04], [1, 0, 0, 0, 0, 0, 0]],
    ge: [[0, 0, 0, 0, 0, 0, 0], [.12, .048, .072, .025, .19, -.52, -.37], [.26, .06, .09, .03, .24, -.62, -.44], [.38, .062, .09, .03, .22, -.62, -.44], [.48, .06, .1, .03, .32, -.6, -.46],
      [.56, .055, .095, .025, .28, -.55, -.3], [.64, .045, .08, .02, .22, -.46, -.24], [.82, .004, -.008, 0, -.03, .04, .04], [1, 0, 0, 0, 0, 0, 0]],
    ev: { t: [['magout', .2, [0, -.005, 0, -.04, 0, -.02], 3.4, 9], ['tug', .37, [.004, 0, 0, 0, .02, .02], 4, 10], ['magin', .502, [0, .016, 0, .09, 0, .03], 3.6, 9, .006], ['tap', .582, [0, .009, 0, .05, 0, .012], 4, 10, .003]],
      e: [['magout', .18, [0, -.005, 0, -.04, 0, -.02], 3.4, 9], ['tug', .34, [.004, 0, 0, 0, .02, .02], 4, 10], ['magin', .462, [0, .016, 0, .09, 0, .03], 3.6, 9, .006], ['boltrel', .582, [0, -.004, -.018, .1, .02, .05], 2.8, 7, .008, .002]] } };
  function dualRel(sp, t, R, out) {
    const C = RLD, E = R.empty, T = E ? C.e : C.t, pv = sp.mp, MX = v => bone(pv, [v[0], v[1], v[2]], v[3], v[4], v[5]), hold = M => pxf(M, sp.mh), SEAT = MX(Z6);
    out.g = crv(E ? C.ge : C.gt, t);
    const dx = -R.ds * DOFF, o = mul(sp.mo, .75), mid = (T.out + T.sh) / 2;   // dx: geser pasangan agar magasin sebelah ke bawah magwell
    const OUT = [o[0], o[1], o[2], -.05, 0, 0], FIN = [dx, 0, 0, 0, 0, 0];
    const v = crv([[T.g1, ...Z6], [T.out, ...OUT], [mid, dx * .5, o[1] - .01, o[2], -.06, 0, .05 * R.ds], [T.sh, dx, o[1] + .004, o[2], -.04, 0, 0], [T.in, ...FIN]], t);
    out.mag = MX(v); out.out = t > T.g1 + .005 && t < T.in; out.dcl = t >= mid;
    const FM = MX(FIN);
    if (t < T.g1) out.lh = t < T.g0 ? sp.lh : blend(sp.lh, hold(SEAT), seg(t, T.g0, T.g1));
    else if (t < T.in) out.lh = hold(out.mag);
    else {
      const on = blend(hold(FM), hold(SEAT), seg(t, T.in, T.in + .03)), rel = (h, a, b) => blend(h, sp.lh, seg(t, a, b));   // telapak bergeser dari magasin lama ke dasar magasin yang baru masuk
      if (!E) { const k = bump(t, T.in + .006, T.tap - T.in - .006), hs = shift(on, [0, -.034 * k, -.008 * k]); out.lh = t < T.tap + .02 ? hs : rel(hold(SEAT), T.tap + .02, T.end); }
      else { const pr = shift(sp.cp, [.007 * bump(t, T.act - .015, .05), 0, 0]); out.lh = t < T.in + .03 ? on : t < T.act - .015 ? blend(hold(SEAT), sp.cp, seg(t, T.in + .03, T.act - .015)) : t < T.act + .05 ? pr : rel(sp.cp, T.act + .05, T.end); }
    }
    return C.ev[E ? 'e' : 't'];
  }
  /* baut senapan runduk: lift 0..1 = gagang diangkat, pull 0..1 = ditarik ke belakang */
  function boltAt(sp, lift, pull) {
    const boltR = -1.15 * lift, bolt = .085 * pull;
    return { bolt, boltR, on: pxf(bone([0, -.046, 0], [0, 0, -bolt], 0, 0, boltR), sp.bh) };
  }
  function sniperBolt(sp, t, out) {   // kosong: buka baut → (tukar magasin) → dorong & kunci
    const lift = seg(t, .05, .11) * (1 - seg(t, .73, .79)), pull = seg(t, .12, .19) * (1 - seg(t, .64, .71)), b = boltAt(sp, lift, pull);
    out.bolt = b.bolt; out.boltR = b.boltR;
    out.rh = t < .05 ? blend(sp.rh, b.on, seg(t, 0, .05)) : t < .82 ? b.on : blend(b.on, sp.rh, seg(t, .82, .93));
  }
  /* M60: senjata diangkat & digulingkan agar tutup pengisi terlihat → buka tutup → lepas kotak peluru → kotak baru
     dipasang → sabuk diletakkan di baki → tutup DIBANTING → (kosong) tuas kokang ditarik */
  const LMGK = [[0, 0, 0, 0, 0, 0, 0], [.06, 0, .05, .12, .12, -.18, .14], [.12, 0, .08, .28, .22, -.3, .3], [.2, .002, .085, .3, .24, -.32, .32], [.3, -.004, .07, .3, .17, -.34, .22], [.42, 0, .08, .3, .2, -.3, .3],
    [.56, -.002, .085, .3, .21, -.3, .28], [.64, .002, .085, .3, .25, -.28, .34], [.73, 0, .085, .3, .23, -.3, .3], [.8, -.002, .065, .24, .16, -.26, .22], [.9, .004, -.01, -.012, -.04, .04, -.05], [1, 0, 0, 0, 0, 0, 0]];
  function lmgRel(sp, t, R, out) {
    const pv = sp.mp, MX = v => bone(pv, [v[0], v[1], v[2]], v[3], v[4], v[5]), hold = M => pxf(M, sp.mh), SEAT = MX(Z6);
    out.g = crv(LMGK, t);
    out.cov = 1.4 * seg(t, .1, .17) * (1 - seg(t, .705, .728));
    const COV = k => cmp(I, bone([0, -.048, .072], [0, 0, 0], -k * 1.4, 0, 0)), lip = k => topL(ap(COV(k), [-.014, -.034, -.125]), PINCH);   // tepi belakang tutup
    out.mag = MX(crv([[.24, ...Z6], [.31, -.08, -.06, -.02, -.25, 0, .3], [.39, ...PUp], [.43, ...PUp], [.52, -.07, -.05, 0, .1, 0, .2], [.575, ...Z6]], t)); out.out = t > .245 && t < .575;
    const tray = x => topL([x, -.05, -.005], [[.25, .4, .25], [.25, .4, .25], [.3, .45, .3], [.3, .45, .3]]);
    // tangan berpindah lewat bawah senjata (pose memegang kotak) agar lengan tidak melintang di depan layar
    if (t < .05) out.lh = blend(sp.lh, hold(SEAT), seg(t, 0, .05));
    else if (t < .1) out.lh = blend(hold(SEAT), lip(0), seg(t, .05, .1));
    else if (t < .18) out.lh = lip(out.cov / 1.4);
    else if (t < .24) out.lh = blend(lip(1), hold(SEAT), seg(t, .18, .24));
    else if (t < .58) out.lh = hold(out.mag);
    else if (t < .6) out.lh = blend(hold(SEAT), tray(-.04), seg(t, .58, .6));
    else if (t < .67) out.lh = tray(-.04 + .07 * seg(t, .6, .67));   // usap sabuk peluru di baki pengisi
    else if (t < .7) out.lh = blend(tray(.03), lip(1), seg(t, .67, .7));
    else if (t < .76) out.lh = shift(lip(out.cov / 1.4), [0, -.004 * bump(t, .728, .03), 0]);
    else if (t < .83) out.lh = blend(lip(0), hold(SEAT), seg(t, .76, .83));
    else out.lh = blend(hold(SEAT), sp.lh, seg(t, .83, .93));
    return [['cover', .1, [0, .006, 0, .04, 0, -.03], 3, 9], ['magout', .245, [0, -.012, 0, -.06, 0, -.05], 2.4, 6], ['magin', .577, [0, .012, 0, .05, 0, .04], 2.8, 7, .004], ['belt', .61, [0, -.003, 0, -.01, 0, .01], 3, 10], ['cover', .728, [0, -.016, -.006, -.08, 0, .06], 2.6, 6, -.008, .002]];
  }
  /* shotgun: senjata dimiringkan, peluru diambil dari sabuk dan didorong satu per satu ke lubang bawah (tiap dorongan
     menyentak senjata); kosong: digulingkan dulu (baut terkunci di belakang), satu peluru dijatuhkan ke lubang ejeksi lalu baut dilepas maju.
     Waktu dalam detik nominal dari F.sgPlan (sama dengan logika amunisi per peluru di fps.js; tembak = batalkan) */
  const SGLOAD = [-.01, .1, .14, .3, -.42, -.64], SGPORT = [.0, .1, .3, .2, -.3, .7], SGCH = .03;   // SGCH: langkah mundur baut
  function sgRel(sp, R, out) {
    const pl = F.sgPlan(F.WEAPONS.SHOTGUN, R.empty, R.n), s = (P.relD - P.relT) / (P.relK || 1), port = sp.lp, ev = [];
    const belt = shift(port, [-.05, -.2, -.08]), top = topL([.016, -.022, .02], PINCH), E = R.empty, pe = pl.port;
    // pose senjata
    const K = [[0, ...Z6]];
    if (E) K.push([pe * .3, ...SGPORT], [pe * .82, ...SGPORT.map((v, i) => v + [0, .004, 0, .02, .03, .04][i])], [pe + .05, .0, .1, .16, .16, -.35, .25]);
    K.push([pl.I, ...SGLOAD]);
    for (let k = 0; k < pl.m; k++) K.push([pl.I + (k + .55) * pl.per, ...SGLOAD.map((v, i) => v + [0, .004, 0, .015, 0, .03 * (k % 2 ? 1 : -1)][i])]);
    K.push([pl.end + .02, ...SGLOAD], [pl.end + pl.out * .75, .004, -.008, -.01, -.03, .04, .05], [pl.end + pl.out, ...Z6]);
    out.g = crv(K, s);
    // tangan kiri & peluru
    if (E && s < pe) {   // isi lewat lubang ejeksi: tangan dari sabuk → atas lubang → jatuhkan → tekan pelepas baut → kembali ke forend
      const a = pe * .18, b = pe * .5, c = pe * .62, d = pe * .8, r = c + (d - c) * .35;
      out.ch = SGCH * (1 - seg(s, r, r + .04));
      out.lh = s < a ? blend(sp.lh, belt, seg(s, 0, a)) : s < b ? blend(belt, top, seg(s, a, b)) : s < c ? shift(top, [0, -.012 * seg(s, b, c), 0]) : s < d ? blend(top, sp.lh, seg(s, c, d)) : sp.lh;
      if (s < c) out.shell = s < b ? ma(ma(out.lh.K, out.lh.f, .045), out.lh.d, -.022) : [.0172, -.036 - .006 * seg(s, b, c), .005];
      ev.push(['shell', c / pl.dur, [0, -.004, 0, -.02, 0, .02], 4, 11], ['pumpf', (r + .04) / pl.dur, [0, .004, .012, -.06, 0, -.02], 3, 8, .004]);
    } else if (s < pl.I) out.lh = blend(E ? sp.lh : sp.lh, belt, seg(s, pe + (E ? .05 : 0), pl.I));
    else if (s < pl.end) {
      const k = Math.min(pl.m - 1, Math.floor((s - pl.I) / pl.per)), u = (s - pl.I - k * pl.per) / pl.per;
      out.lh = u < .45 ? blend(belt, port, seg(u, 0, .45)) : u < .62 ? shift(port, [0, .012 * seg(u, .45, .6), .03 * seg(u, .45, .6)]) : blend(port, belt, seg(u, .62, 1));
      if (u < .58) out.shell = ma(ma(out.lh.K, out.lh.f, .018), out.lh.d, -.016);
    } else out.lh = blend(belt, sp.lh, seg(s, pl.end, pl.end + pl.out * .8));
    for (let k = 0; k < pl.m; k++) ev.push(['shell', (pl.I + (k + .55) * pl.per) / pl.dur, [0, .008, 0, .05, 0, .02 * (k % 2 ? 1 : -1)], 4, 11, .002]);
    return { ev, ts: s, T: pl.dur };
  }
  /* peluncur roket (gaya RPG MW): diturunkan dari bahu & dimiringkan, roket baru didorong masuk ekor-dulu lewat moncong,
     ditepuk terkunci, lalu dipanggul kembali (memantul di bahu). Sumbu +z senjata = arah moncong. */
  const ATK = [[0, 0, 0, 0, 0, 0, 0], [.1, -.03, -.05, -.06, .1, -.15, .2], [.24, -.05, -.07, -.2, .2, -.3, .45], [.42, -.05, -.068, -.21, .22, -.32, .47], [.6, -.05, -.07, -.2, .2, -.3, .45], [.68, -.045, -.065, -.17, .16, -.26, .4], [.82, -.02, -.04, -.02, .0, -.1, .12], [.92, .006, .01, -.01, .04, -.04, .03], [1, 0, 0, 0, 0, 0, 0]];
  function atRel(sp, t, out) {
    out.g = crv(ATK, t); out.open = t > .2 && t < .66;
    const z = crv([[.2, 1.2], [.34, 1.08], [.5, .7], [.58, .5]], t)[0];   // ujung hulu ledak roket pada sumbu tabung (ekor = z − 0,62; moncong di z 0,53)
    if (t > .2 && t < .6) out.rocket = z;
    const grip = zz => pose([.012, -.084, zz - .3], [0, 0, 1], [.85, .52, 0], [[1, 1.2, .7], [1, 1.2, .7], [1.05, 1.2, .7], [1.1, 1.15, .7]], [[.4, -.6, .5], [.5, -.6, .3], [.55, -.5, .2]], true);
    const slap = pose([.0, -.03, .3], [0, .9, -.45], [.9, -.1, .45], CO, TO, true);
    out.lh = t < .2 ? blend(sp.lh, grip(1.2), seg(t, .06, .2)) : t < .58 ? grip(z) : t < .62 ? blend(grip(.5), slap, seg(t, .58, .62)) : t < .66 ? shift(slap, [0, 0, .01 * bump(t, .62, .04)]) : blend(slap, sp.lh, seg(t, .66, .82));
    return [['rocketld', .5, [0, -.004, .01, -.02, .02, 0], 3, 8], ['tap', .64, [0, .006, .02, .04, 0, .02], 3, 8, .004], ['land', .86, [0, -.02, -.01, -.06, 0, .03], 2.4, 6, .006]];
  }
  /* .44 Magnum (referensi MW2 .44 Magnum/Anaconda): ibu jari menekan pelepas, silinder diayun keluar → moncong didongakkan
     tegak, batang ejector ditepuk: 6 selongsong berjatuhan → moncong diturunkan, speedloader dari rompi dimasukkan, diputar &
     dilepas (jatuh) → telapak mengatupkan silinder dengan sentakan → kembali membidik */
  const REVK = [[0, 0, 0, 0, 0, 0, 0], [.08, -.03, .04, 0, .2, -.25, -.45], [.16, -.05, .07, -.02, .5, -.35, -.55], [.24, -.05, .1, -.05, 1.2, -.2, -.3], [.32, -.05, .09, -.05, 1.15, -.2, -.3],
    [.42, -.05, .045, .03, -.06, -.34, -.6], [.6, -.05, .045, .03, -.08, -.34, -.62], [.7, -.045, .05, .03, .02, -.3, -.8], [.8, -.02, .03, .01, .05, -.15, -.35], [.92, .004, -.008, 0, -.04, .04, .03], [1, 0, 0, 0, 0, 0, 0]];
  const SLUp = [-.1, -.3, -.12, .6, .3, .4];   // kantong speedloader di rompi (kiri bawah)
  const LDR = pose([-.024, .004, -.03], [0, 1, 0], [.3, 0, 1], WRAP, [[.6, -.4, .6], [.5, -.4, .7], [.4, -.3, .8]], true);   // tangan kiri menggenggam kenop speedloader dari kiri-belakang
  function revRel(sp, t, R, out) {
    const BY = REV.by, cyl = a => bone(REV.pv, [0, 0, 0], 0, 0, a);
    out.g = crv(REVK, t);
    out.cyl = 1.75 * seg(t, .07, .12) * (1 - seg(t, .72, .755));
    out.ejk = .018 * bump(t, .25, .07);
    out.ch6 = t < .28 ? 'spent' : t < .56 ? 'empty' : 'live';
    if (t >= .28 && !R.f.dump) { R.f.dump = 1; R.dump = true; }
    const CO = cyl(out.cyl), AL = { c: CO.c, t: ap(CO, [0, BY, -.0122]) }, cc = ap(CO, [0, BY, .01]);
    // speedloader: naik dari rompi → sejajar di belakang silinder → didorong masuk, diputar → dilepas & jatuh
    let sl = null;
    if (t > .36 && t < .76) {
      const tw = .5 * seg(t, .56, .59);
      let v;
      if (t < .6) v = crv([[.36, ...SLUp], [.47, 0, -.03, -.08, .25, 0, 0], [.52, 0, 0, -.045, 0, 0, 0], [.56, 0, 0, 0, 0, 0, 0]], t);
      else { const u = (t - .6) * P.relD; v = [-.01 * u, -.03 * u - 2.5 * u * u, -.06 * u, -1.2 * u, 0, 0]; }
      sl = cmp(AL, bone([0, 0, 0], [v[0], v[1], v[2]], v[3], v[4], v[5] + tw));
    }
    out.sl = sl; out.slF = t < .59;
    // tangan kiri
    const onCyl = (c, k) => pressL(add(c, [-.0215 - .004 * k, -.004, .004]));   // telapak menempel sisi kiri silinder
    const rod = shift(pressL(ap(CO, [-.008, BY, .066])), [0, 0, .01 - out.ejk * 1.2]);   // telapak menepuk batang ejector
    const loader = sl ? pxf(sl, LDR) : null;
    const PK = pxf(cmp(AL, bone([0, 0, 0], SLUp.slice(0, 3), SLUp[3], SLUp[4], SLUp[5])), LDR);
    if (t < .07) out.lh = blend(sp.lh, onCyl(cc, 0), seg(t, 0, .07));
    else if (t < .2) out.lh = onCyl(cc, 0);
    else if (t < .24) out.lh = blend(onCyl(cc, 0), rod, seg(t, .2, .24));
    else if (t < .3) out.lh = rod;
    else if (t < .36) out.lh = blend(rod, PK, seg(t, .3, .36));
    else if (t < .6) out.lh = loader;
    else if (t < .68) out.lh = blend(pxf(cmp(AL, bone([0, 0, 0], [0, 0, 0], 0, 0, .5)), LDR), onCyl(cc, 1), seg(t, .6, .68));
    else if (t < .76) out.lh = onCyl(cc, 1);
    else out.lh = blend(onCyl(ap(cyl(0), [0, BY, .01]), 1), sp.lh, seg(t, .76, .9));
    return [['cylout', .1, [0, .004, 0, .03, 0, -.04], 3, 9], ['tap', .26, [0, -.006, -.01, -.04, 0, 0], 4, 10], ['casings', .29, [0, 0, 0, 0, 0, 0], 3, 9], ['speedl', .55, [0, .006, 0, .04, 0, .02], 3.5, 9, .003], ['cylin', .745, [0, -.008, 0, -.06, .02, .06], 3.2, 8, .006, .002]];
  }
  /* ---------- reload: pose senjata, transform magasin, pose tangan + hentakan & dorongan kamera ---------- */
  function reload(sp, id, t, R) {
    const out = { g: Z6.slice(), lh: sp.lh, rh: null, mag: bone([0, 0, 0], [0, 0, 0], 0, 0, 0), mag2: null, out: false, ch: 0, cov: 0, bolt: 0, boltR: 0, shell: null, slide: null, rocket: null, open: false, cam: [0, 0], cyl: 0, ejk: 0, ch6: 'live', sl: null, slF: false };
    let ev, ts = t * P.relD, T = P.relD;
    if (id === 'AT') ev = atRel(sp, t, out);
    else if (sp.rev) ev = revRel(sp, t, R, out);
    else if (id === 'LMG') ev = lmgRel(sp, t, R, out);
    else if (id === 'SHOTGUN') { const r = sgRel(sp, R, out); ev = r.ev; ts = r.ts; T = r.T; t = ts / T; }
    else if (id === 'AR' && R.du && ATT.DUAL) ev = dualRel(sp, t, R, out);
    else { magRel(sp, id, t, R, out); ev = RL[id].ev[R.empty ? 'e' : 't']; if (id === 'SNIPER' && R.empty) sniperBolt(sp, t, out); }
    for (const e of ev) {   // suara tepat saat kejadian + pegas
      if (!R.f[e[0] + e[1]] && t >= e[1]) { R.f[e[0] + e[1]] = 1; const a = AU(); if (a) a.local(e[0], .7); }
      const k = ring(ts, e[1] * T, e[3], e[4]); if (!k) continue;
      for (let i = 0; i < 6; i++) out.g[i] += e[2][i] * k;
      out.cam[0] += (e[5] || 0) * k; out.cam[1] += (e[6] || 0) * k;
    }
    return out;
  }
  /* siklus baut (senapan runduk): angkat → tarik → dorong → kunci */
  function boltCycle(sp, u, R, tag) {
    const b = boltAt(sp, seg(u, .12, .26) * (1 - seg(u, .7, .8)), seg(u, .28, .48) * (1 - seg(u, .52, .7)));
    const o = { bolt: b.bolt, boltR: b.boltR, rh: u < .12 ? blend(sp.rh, b.on, seg(u, 0, .12)) : u < .82 ? b.on : blend(b.on, sp.rh, seg(u, .82, 1)) };
    cue(R, tag + 'up', u, .2, 'boltup'); cue(R, tag + 'bk', u, .42, 'boltbk'); cue(R, tag + 'dn', u, .74, 'boltdn');
    if (u > .44 && !R.f[tag + 'sh']) { R.f[tag + 'sh'] = 1; R.eject = true; }
    return o;
  }

  /* ---------- selongsong ---------- */
  function eject(sp, G) {
    if (!sp.ej) return;
    const p = ap(G, sp.ej), d = sp.ejD || [1.5, 1.05, -.25];
    V.shells.push({ p, v: [d[0] * (.85 + Math.random() * .35), d[1] * (.85 + Math.random() * .35), d[2] + (Math.random() - .5) * .3], a: Math.random() * 6, w: 14 + Math.random() * 10, t: 0, k: sp.sh });
    if (V.shells.length > 14) V.shells.shift();
  }
  function shells(dt) {
    const X0 = X; X = I;
    for (const s of V.shells) {
      s.t += dt; s.v[1] -= 7.5 * dt; s.p = ma(s.p, s.v, dt); s.a += s.w * dt;
      const dir = nrm([Math.cos(s.a), Math.sin(s.a) * .6, Math.sin(s.a * .7)]), L = s.k === 's' ? .062 : s.k === 'b' ? .1 : s.k === 'p' ? .02 : s.k === 'm' ? .03 : .045, r = s.k === 's' ? .0105 : s.k === 'b' ? .0105 : s.k === 'm' ? .006 : .0048;
      if (s.k === 's') { tube(s.p, ma(s.p, dir, L * .8), r, r, 8, RSH); tube(ma(s.p, dir, L * .8), ma(s.p, dir, L), r * 1.03, r * 1.03, 8, BRS); }
      else tube(s.p, ma(s.p, dir, L), r, r * (s.k === 'r' || s.k === 'b' ? .8 : 1), 8, BRS);
    }
    V.shells = V.shells.filter(s => s.t < .9 && s.p[1] > -1);
    X = X0;
  }

  /* kayuhan gaya dada (referensi: renang FPS): tangan rapat di depan → menyapu keluar → menarik ke dalam di bawah dagu → mendorong ke depan */
  function stroke(u) {   // posisi tangan kanan [x, y, z] + kemiringan telapak (+ = menghadap keluar)
    if (u < .45) { const a = ss(u / .45); return [.05 + .2 * a, -.085 - .02 * a, .44 - .12 * a, a]; }
    if (u < .7) { const a = ss((u - .45) / .25); return [.25 - .19 * a, -.105 - .035 * a, .32 - .08 * a, 1 - 1.6 * a]; }
    const a = ss((u - .7) / .3); return [.06 - .01 * a, -.14 + .055 * a, .24 + .2 * a, -.6 + .6 * a];
  }
  function swimHands(k, gl, gk, sl, sl2) {
    const u = ((P.strk || 0) % 1 + 1) % 1, s = stroke(u), dy = -(1 - k) * .3, th = s[3] * (s[3] > 0 ? .7 : .3);
    const CF = [[.12, .15, .08], [.1, .12, .06], [.1, .12, .06], [.14, .16, .08]], TF = [[.5, -.25, .7], [.4, -.1, .85], [.3, 0, .9]];
    for (const sd of [1, -1]) {
      const H = pose([s[0] * sd, s[1] + dy, s[2]], [Math.cos(th) * sd, -Math.sin(th), 0], [.25 * s[3] * sd, -.15 + Math.min(0, s[3]) * .6, 1], CF, TF, sd < 0);
      hand(H, gl, gk, sd < 0); arm(H, [.27 * sd, -.42, -.05], [.22 * sd, -.34, -.27], sl, sl2);
    }
  }

  /* parasut. Terjun bebas (perut menghadap bumi): lengan terbentang ke samping, telapak menghadap ke bawah, jari sedikit
     merenggang dan bergetar diterpa angin — tangan ikut arah pandang (badan ikut menukik). Dibuka (P.chO 0→1): tangan kanan
     meraih pegangan di dada & menyentaknya, lalu kedua tangan naik menggenggam tali kemudi (toggle kuning) di depan riser.
     Di bawah kanopi badan tergantung tegak: pose dihitung di BINGKAI BADAN (hanya ikut yaw), lalu diputar terbalik sebesar
     pitch kamera — mendongak = tangan & tali turun ke tengah layar, menunduk = tangan keluar dari atas layar (tidak menempel di layar) */
  const TGL = mt([226, 186, 38], .2), LINE = mt([206, 204, 192], 0), RIS = mt([104, 108, 84], .05);
  function chuteHands(gl, gk, sl, sl2) {
    const CF = [[.18, .2, .12], [.12, .14, .08], [.14, .16, .1], [.2, .22, .14]], TF = [[.55, -.2, .7], [.45, -.1, .8], [.35, 0, .9]];
    const fall = P.chute === 1, o = fall ? 0 : P.chO || 0, t = P.time, w = fall ? .007 : .0025;
    const bk = ss(o / .55);   // 0 = bingkai pandang (terjun bebas), 1 = bingkai badan tegak
    X = xf(-(P.pitch || 0) * bk, 0, 0); BR = I;
    const V3 = v => ap(X, v);   // petunjuk siku/bahu untuk arm() harus di ruang pandang
    for (const sd of [1, -1]) {
      const j = [Math.sin(t * 9 + sd) * w, Math.sin(t * 7.3 + sd * 2) * w, 0];
      // terbentang: buku jari depan-samping setinggi bahu, jari menunjuk depan-luar, punggung tangan ke atas
      const spread = pose(add([.4 * sd, -.1, .36], j), [-.93 * sd, -.08, .37], [.37 * sd, -.05, .93], CF, TF, sd < 0);
      // genggam tali kemudi: kepalan di depan atas kepala, buku jari menunjuk ke atas-depan, telapak saling berhadapan,
      // sisi telunjuk di atas (tali keluar dari atas kepalan menuju tepi belakang kanopi)
      const sw = Math.sin(t * .9 + sd) * .012, grip = pose(add([.235 * sd, .085 + sw, .43], mul(j, .4)), [-.12 * sd, .78, -.6], [-.22 * sd, .62, .75], CG, TG, sd < 0);
      const pull = pose([.07, -.29, .3], [-.25, .2, -.95], [-.85, -.1, .2], CG, TG, false);   // tangan kanan di pegangan dada
      let H;
      if (sd > 0 && o < .25) H = blend(spread, pull, ss(o / .2));
      else if (sd > 0) H = blend(pose([.12, -.33, .26], [-.25, .2, -.95], [-.85, -.1, .2], CG, TG, false), grip, ss((o - .25) / .45));   // sentak ke bawah-samping, lalu naik
      else H = blend(spread, grip, ss((o - .15) / .55));
      const up = ss((o - .25) / .45), hint = V3(lv([.62 * sd, -.12, .1], [.42 * sd, -.24, .12], up)), sh = V3([.2 * sd, -.3, -.22]);
      hand(H, gl, gk, sd < 0); arm(H, hint, sh, sl, sl2);
      const g = ss((o - .5) / .3);   // tali & riser terlihat setelah kanopi menangkap angin
      if (g > 0) {
        const c = ma(ma(H.K, H.f, .002), H.d, -.026), top = ma(c, H.r, .045);   // sumbu genggaman: sedikit di sisi telapak buku jari
        tube(ma(c, H.r, -.045), top, .0125, .0125, 6, TGL);                                       // gagang toggle di dalam kepalan
        tube(top, add([1.5 * sd, 6.4, -1.9], j), .0028, .0028, 4, LINE);                         // tali kemudi ke tepi belakang kanopi (±6,5 m di atas)
        const s0 = [.19 * sd, -.2, .02];                                                                  // riser depan & belakang dari gesper bahu sampai titik temu tali ±1 m di atas bahu
        tube(s0, [.13 * sd, .78, .12], .011, .011, 4, RIS); tube(ma(s0, [0, 0, 1], -.07), [.13 * sd, .78, -.08], .011, .011, 4, RIS);
      }
    }
    X = I;
  }

  /* naik kendaraan: tiap tangan menuju titik dunia (gagang pintu, tepi lambung, bibir kokpit) yang sudah diubah ke ruang pandang oleh F.entHand;
     terbuka saat meraih, menggenggam (g → 1) begitu sampai. Jangkauan dibatasi panjang lengan */
  function entHands(gl, gk, sl, sl2) {
    const E = F.entHand && F.entHand(); if (!E) return;
    for (const [sd, q] of [[1, E.R], [-1, E.L]]) {
      if (!q) continue;
      let K = q.p.slice(); K[2] = Math.max(K[2], .22); const n = Math.hypot(K[0], K[1], K[2]); if (n > .6) K = mul(K, .6 / n);
      K[0] = clamp(K[0], -.5, .5); K[1] = clamp(K[1], -.42, .32);
      const rr = [-.92 * sd, .3, .12], ff = nrm(add(nrm(K), [.12 * sd, .05, 0]));
      const H = blend(pose(K, rr, ff, CO, TO, sd < 0), pose(K, rr, ff, CG, TG, sd < 0), ss(q.g));
      hand(H, gl, gk, sd < 0); arm(H, [.42 * sd, -.42, .02], [.2 * sd, -.32, -.22], sl, sl2);
    }
  }
  /* dorong sway dari gerak mouse */
  V.push = (dx, dy) => { V.sx = clamp(V.sx - dx * .00035, -.06, .06); V.sy = clamp(V.sy + dy * .00035, -.05, .05); };

  /* ---------- gambar ---------- */
  V.draw = function (ctx, CW, CH, dt, o) {
    if (!P.alive || P.menu) return;
    if (!GL.tried && V.useGL !== false) glInit();
    GLon = GL.ok && V.useGL !== false; GL.An = 0; GL.Bn = 0;
    ctx2 = ctx; CWv = CW; CHv = CH; FOC = CH * .86 * (V.fz || 1);   // FOV model senjata sedikit lebih lebar dari dunia (seperti game FPS modern)
    V.muzP = null;
    tint = o.tint; nvg = o.nvg;
    const w = P.w[P.cur], WD = F.WEAPONS[w.id], bayM = (P.eq === 'bay' || P.melB) && !!WD.bay, bay = bayM && P.melT > 0, knf = P.eq === 'knife' || (P.melT > 0 && !bayM), id = knf ? 'KNIFE' : w.id;
    ATT = {}; if (id === 'AR' && F.attOn) for (const a of (V.att || F.attOn('AR'))) ATT[a] = 1;   // V.att: daftar uji lembar kontak
    const sp = id === 'AR' ? arSpec() : SPEC[id]; if (!sp) return;   // bay: tusukan bayonet memakai senapan itu sendiri
    const ads = P.melT > 0 || P.eq ? 0 : P.ads, k = 1 - ads;
    if (WD.scope && ads > .82 && P.melT <= 0) { V.shells.length = 0; return; }   // teropong menutupi layar
    // operator pemain: jaket taktis abu arang, sarung tangan hitam dengan manset abu & pelindung buku jari abu terang
    const uni = o.uni, sl = mt(uni, 0), sl2 = mt(uni.map(v => v * .72), 0);
    const gl = mt([30, 30, 32], .08), gk = mt([62, 62, 60], .1); GPAD = mt([118, 114, 104], .14);
    V.swK += ((P.swim ? 1 : 0) - V.swK) * Math.min(1, dt * 6);   // berenang: senjata turun keluar layar, lalu tangan mengayuh
    if (P.entA) { X = I; BR = I; entHands(gl, gk, sl, sl2); flush(); return; }   // naik kendaraan: senjata tersandang, tangan meraih gagang / pegangan (fps-life)
    if (P.chute) { BR = I; chuteHands(gl, gk, sl, sl2); shells(dt); flush(); return; }   // parasut: tangan kosong, senjata tersandang
    if (P.eq === 'hook' || P.hook) { X = I; BR = I; hookHands(gl, gk, sl, sl2, dt); shells(dt); flush(); return; }   // alat kait: senjata tersandang, peluncur kait di tangan
    if (V.swK > .5 && !V.dbg && !V.dbgS) { X = I; BR = I; swimHands((V.swK - .5) * 2, gl, gk, sl, sl2); shells(dt); flush(); return; }
    // ----- pose senjata (pinggul ↔ bidik, ayun langkah, sway, rekoil, lari) -----
    V.sx *= Math.max(0, 1 - dt * 7); V.sy *= Math.max(0, 1 - dt * 7);
    V.spr += ((P.sprint ? 1 : 0) - V.spr) * Math.min(1, dt * 9);
    const S = .4, hr = sp.hr || [0, 0, 0];
    let gx = lerp(sp.hip[0], sp.ads[0], ads), gy = lerp(sp.hip[1], sp.ads[1], ads), gz = lerp(sp.hip[2], sp.ads[2], ads), pit = hr[0] * k, yaw = hr[1] * k, rol = hr[2] * k;
    const mv = clamp(P.spd / 8, 0, 1.5) * (P.grounded ? 1 : .2) * (1 - ads * .85);
    // ayunan langkah pola angka-8 ("senyum"): kiri-kanan sekali per 2 langkah, naik-turun tiap langkah, halus tanpa sentakan;
    // fase digeser agar tertinggal sedikit dari kamera sin(2·bob) (inersia: kepala naik → senjata tampak turun), saat lari amplitudo & anggukan lebih besar
    const bp = P.bob + 2.1, bs = Math.sin(bp), bc = -Math.cos(2 * bp), sk = 1 + V.spr;
    gx += bs * .011 * mv * S * sk; gy += bc * .006 * mv * S * (1 + V.spr * .6); yaw += bs * .012 * mv; rol += bs * .018 * mv * (1 + V.spr * 1.5); pit += bc * .014 * mv * V.spr;
    gy += Math.sin(P.time * 1.7) * .0016 * (1 - ads * .7) * S; gx += Math.sin(P.time * 1.1) * .001 * S * (1 - ads * .7);
    gx += V.sx * .55 * S; gy += V.sy * .55 * S; yaw += V.sx * 2.2; pit += V.sy * 2; rol += V.sx * 1.5;
    const kq = 1 - ads * (ATT.ACOG && id === 'AR' ? .8 : 0);   // ACOG: lensa mata dekat mata → sentakan mundur membuat lensa tampak membesar-mengecil ("nge-zoom"); diredam saat membidik
    gz -= P.vk * .045 * S * (1 + ads * .3) * kq; pit += P.vk * .075 * kq; gy += P.vk * .006 * kq; rol += P.vk * .02 * Math.sin(P.time * 90) * kq;
    if (!knf) { gx += V.spr * SPR[3]; gy += V.spr * SPR[4]; gz += V.spr * SPR[5]; pit += V.spr * SPR[0]; yaw += V.spr * SPR[1]; rol += V.spr * SPR[2]; }
    // ----- status reload / siklus baut / pompa -----
    const R = V.R;
    if (P.relT > 0 && P.melT <= 0) { if (!R.on || R.id !== w.id) Object.assign(R, { on: true, id: w.id, empty: P.relE !== undefined ? P.relE : w.ammo === 0, n: P.relN || Math.min(WD.mag - w.ammo, w.res), f: {}, du: !!P.relDu, ds: w.dm ? 1 : -1 }); }   // du/ds: tukar cepat DUAL & sisi magasin sebelah
    else R.on = false;
    const st = { trig: 0, ch: 0, cov: 0, bolt: 0, boltR: 0, slide: 0, open: false, cyl: 0, ejk: 0, ch6: 'live', cr: 0, lens: lerp(.55, .07, ads), rear: ads < .55 || !!V.dbg || !!V.dbgS };   // popor menempel di pipi saat membidik (di belakang mata)
    let rel = null, rh = sp.rh, lh = sp.lh;
    if (R.on) {
      rel = reload(sp, id, clamp(1 - P.relT / P.relD, 0, 1), R);
      gx += rel.g[0]; gy += rel.g[1]; gz += rel.g[2]; pit += rel.g[3]; yaw += rel.g[4]; rol += rel.g[5];
      lh = rel.lh; if (rel.rh) rh = rel.rh; Object.assign(st, { ch: rel.ch, cov: rel.cov, bolt: rel.bolt, boltR: rel.boltR, open: rel.open, cyl: rel.cyl, ejk: rel.ejk, ch6: rel.ch6 });
      if (rel.slide !== null) st.slide = rel.slide;
    }
    V.cam = rel ? rel.cam : [0, 0];   // kamera ikut tersentak sedikit (dibaca F.updateCam)
    if (P.swT > 0) { const s = clamp(P.swT / .42, 0, 1); gy -= .22 * s * s; pit -= .7 * s; rol -= .3 * s; }
    const abLow = P.abA ? seg(P.abA.t / P.abA.d, 0, .16) * (1 - seg(P.abA.t / P.abA.d, .8, 1)) : 0;   // kemampuan [F]: senjata diturunkan, tangan kiri dipakai alat
    gx += .02 * abLow; gy -= .2 * abLow; pit -= .55 * abLow; rol -= .3 * abLow;
    V.bk = (V.bk || 0) + ((bayM && P.eq === 'bay' ? 1 : 0) - (V.bk || 0)) * Math.min(1, dt * 9);   // sikap siap bayonet: senapan dimiringkan, ujung bilah ke tengah layar
    gx -= .02 * V.bk; gy -= .004 * V.bk; gz += .025 * V.bk; yaw -= .1 * V.bk; pit += .03 * V.bk; rol -= .32 * V.bk;
    if (bay && P.melH) {   // tusukan kuat: senapan ditarik jauh ke bahu, jeda, lalu dihujamkan jauh ke depan
      const m = 1 - P.melT / P.melD, c = seg(m, 0, .3) * (1 - seg(m, .75, 1)), back = seg(m, 0, .42) * (1 - seg(m, .46, .56)), out = seg(m, .47, .58) * (1 - seg(m, .74, .98));
      gx -= .02 * c; gy += .045 * c; gz += -.13 * back + .2 * out; yaw += .08 * c - .42 * out; pit += .12 * c + .1 * back - .04 * out; rol -= .22 * c;
      V.cam = [.022 * bump(m, .5, .18), 0];
    } else if (bay) {   // tusukan bayonet: senapan diangkat & ditarik ke dada, lalu didorong ke depan sambil moncong diayun ke kiri — bilah menyapu titik bidik, tertahan sejenak, kembali
      const m = 1 - P.melT / (P.melD || .62), c = seg(m, 0, .18) * (1 - seg(m, .66, 1)), back = seg(m, 0, .18) * (1 - seg(m, .2, .38)), out = seg(m, .22, .38) * (1 - seg(m, .58, .92));
      gx -= .01 * c; gy += .03 * c; gz += -.06 * back + .12 * out; yaw += .03 * c - .32 * out; pit += .08 * c + .05 * back; rol -= .15 * c;   // moncong diayun ke kiri: profil bilah melintas di tengah layar
      V.cam = [.012 * bump(m, .3, .2), 0];
    }
    const KF = knf ? katPose() : null;   // katana: bingkai dari kunci serangan / cabut / siaga; V.cam ikut diisi
    gy -= V.swK * .5; pit -= V.swK * .8;
    const lk = clamp((-(P.pitch || 0) - .6) / .7, 0, 1) * (1 - ads) * (1 - V.spr);   // menunduk: senapan tetap kira-kira mendatar di dunia → naik di layar, badan & kaki sendiri (fps-gl drawSelf) terlihat di bawahnya
    gx += .03 * lk; gy += .035 * lk; gz += .015 * lk; pit += .28 * lk;
    if (P.down) { gx -= .015; gy -= .015; rol += .32; pit += .03; }   // LAST STAND: tergeletak, pistol dimiringkan
    if (V.dbg) { gx = V.dbg[0]; gy = V.dbg[1]; gz = V.dbg[2]; pit = V.dbg[3]; yaw = V.dbg[4]; rol = V.dbg[5]; }   // kamera uji (tampak samping dsb.)
    else if (V.dbgS) { gx = .03; gy = .13; gz = .62; pit = 0; yaw = -Math.PI / 2; rol = 0; }
    const G = knf ? cmp(xf(pit, yaw, rol, [gx, gy, gz]), KF) : xf(pit, yaw, rol, [gx, gy, gz]);
    if (sp.fl && !V.dbg && !V.dbgS) { const m = ap(G, sp.muz); if (m[2] > .05) V.muzP = [m[0] / m[2] * FOC, m[1] / m[2] * FOC, CW]; }   // moncong di layar (px dari tengah) → titik awal tracer di fps.js
    BR = V.dbg || V.dbgS || knf ? I : xf(0, V.spr * SPR[1], 0);
    // tembakan: pelatuk, siklus baut/pompa, slide, selongsong
    const shot = P.vk > V.lastVk + .3; V.lastVk = P.vk;
    st.trig = P.relT > 0 || P.sprint ? 0 : clamp(P.vk * 1.4, 0, 1);
    if (SLING[id]) { if (w.ammo === 0 && !R.on) st.slide = sp.slt || .022; else if (!R.on) st.slide = (sp.slt || .022) * .9 * clamp((P.vk - .55) / .45, 0, 1); }
    if (id === 'AK' && !R.on) st.ch = .03 * clamp((P.vk - .6) / .4, 0, 1);   // pembawa baut & tuas kokang tersentak tiap tembakan
    if (sp.rev) st.cr = ((WD.mag - w.ammo) % 6) * 1.0472 - 1.0472 * clamp((P.vk - .6) / .4, 0, 1);   // silinder berputar 60° per tembakan
    if (id === 'SHOTGUN' && !R.on) st.ch = w.ammo === 0 ? SGCH : SGCH * clamp((P.vk - .55) / .45, 0, 1);   // semi-otomatis: baut tersentak mundur tiap tembakan
    if (P.cycT > 0 && !R.on) {
      const cl = 60 / WD.rpm * .95, u = clamp(1 - P.cycT / cl, 0, 1);
      if (!V.C.on) V.C = { on: true, f: {} };
      if (id === 'SNIPER') { const b = boltCycle(sp, u, V.C, 'c'); st.bolt = b.bolt; st.boltR = b.boltR; rh = b.rh; }
      if (V.C.eject) { V.C.eject = false; eject(sp, G); }
    } else V.C.on = false;
    if (R.eject) { R.eject = false; eject(sp, G); }
    if (R.dump && rel) {   // revolver: 6 selongsong meluncur keluar dari silinder yang terbuka
      R.dump = false; const CO = cmp(G, bone(REV.pv, [0, 0, 0], 0, 0, rel.cyl));
      for (let i = 0; i < 6; i++) { const b = i * 1.0472, v = ar(G, [(Math.random() - .5) * .25, (Math.random() - .5) * .25, -.5 - Math.random() * .3]);
        V.shells.push({ p: ap(CO, [Math.cos(b) * .0125, REV.by + Math.sin(b) * .0125, -.03]), v, a: Math.random() * 6, w: 6 + Math.random() * 8, t: -.05 * i * Math.random(), k: 'm' }); }
      while (V.shells.length > 14) V.shells.shift();
    }
    if (shot && WD.mode !== 'bolt' && WD.mode !== 'rocket') eject(sp, G);
    // ----- granat di tangan (senjata disimpan) -----
    X = I;
    if (P.eq === 'gren') { grenHands(gl, gk, sl, sl2); shells(dt); flush(); return; }
    // ----- senjata, magasin, tangan, lengan -----
    X = G; MODEL[id](st);
    const mk = MODEL[id + 'mag'];
    if (mk) {
      const drawMag = M => { if (!M) return; X = cmp(G, M); mk([M.c[1][1], M.c[2][1], sp.well - M.t[1]], rel ? rel.out : false); };   // potong bagian magasin yang masih di dalam magwell
      const cs = w.dm ? 1 : -1;   // DUAL: sisi magasin sebelah; magasin baru dari rompi (saat yang lama dibuang) = pasangan segar (sisi kiri)
      DS = rel && rel.mag2 ? -1 : cs; DCL = !!(rel && rel.dcl); drawMag(rel ? rel.mag : I);
      if (rel && rel.mag2) { DS = cs; DCL = false; drawMag(rel.mag2); }
      DS = cs; DCL = false;
      X = G;
    }
    if (rel && rel.rocket !== null) MODEL.ATrk(rel.rocket);
    if (rel && rel.sl) { X = cmp(G, rel.sl); MODEL.SPEEDL(rel.slF); X = G; }
    if (rel && rel.shell) { tube(rel.shell, add(rel.shell, [0, 0, .062]), .0105, .0105, 8, RSH); tube(add(rel.shell, [0, 0, -.006]), rel.shell, .0108, .0108, 8, BRS); }
    const disc = P.sprint || P.relT > 0 || P.swT > 0 || P.cycT > 0;
    if (V.noHands) { shells(dt); flush(); return; }   // lembar uji: senjata saja
    if (id === 'KNIFE') {   // dua tangan di gagang: kanan dekat tsuba, kiri di ujung gagang
      kdt = dt; const HL = [-.04, -.58, .12], HR = [.22, -.6, .06], LH = katHand(G, -.178, -1, HL), RH2 = katHand(G, -.068, 1, HR);
      const pad0 = GPAD; GPAD = gl; hand(LH, gl, gk, true); arm(LH, HL, [-.26, -.34, -.2], sl, sl2); hand(RH2, gl, gk); arm(RH2, HR, [.22, -.34, -.27], sl, sl2); GPAD = pad0;   // pelindung buku jari dibuat gelap: dari belakang tangan tampak seperti balok
      shells(dt); flush(); katTrail(G, dt); return;
    }
    if (id !== 'KNIFE' && abLow < .5) { const L = lh; hand(L, gl, gk, true); arm(L, [-.22, -.46, .12], [-.26, -.34, -.2], sl, sl2); }
    const RH = disc && rh.c === CT ? curl(rh, CS) : st.trig > .3 && rh.c === CT ? curl(rh, [[.62, .95, .5], CG[1], CG[2], CG[3]]) : rh;
    hand(RH, gl, gk); arm(RH, [.27, -.4, -.05], [.22, -.34, -.27], sl, sl2);
    let abGlow = null; if (P.abA && ABX[P.abA.id]) { X = I; abGlow = abHands(gl, gk, sl, sl2); }
    shells(dt);
    HOLE = null;
    if (ATT.ACOG && id === 'AR' && ads > .6 && !V.dbg && !V.dbgS) { const o = ap(G, [0, 0, -.093]); if (o[2] > .02) HOLE = [CW / 2 + o[0] / o[2] * FOC, CH / 2 - o[1] / o[2] * FOC, .0128 / o[2] * FOC * clamp((ads - .6) * 4, 0, 1)]; }
    flush(); HOLE = null;
    if (abGlow) for (const [c, r, col, beam] of abGlow) {   // cahaya alat kemampuan (layar tablet, sinar laser, kilat injektor)
      if (c[2] < .05) continue; const x = CW / 2 + c[0] / c[2] * FOC, y = CH / 2 - c[1] / c[2] * FOC, rp = r / c[2] * FOC;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (beam) { ctx.strokeStyle = 'rgba(' + col + ',.55)'; ctx.lineWidth = Math.max(1.5, rp * .25); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(CW / 2, CH / 2); ctx.stroke(); ctx.strokeStyle = 'rgba(255,220,210,.8)'; ctx.lineWidth = 1; ctx.stroke();
        const g2 = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, 9); g2.addColorStop(0, 'rgba(255,90,80,1)'); g2.addColorStop(1, 'rgba(255,0,0,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 9, 0, 6.3); ctx.fill(); }
      const g = ctx.createRadialGradient(x, y, 0, x, y, rp); g.addColorStop(0, 'rgba(' + col + ',.9)'); g.addColorStop(1, 'rgba(' + col + ',0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rp, 0, 6.3); ctx.fill(); ctx.restore();
    }
    // ----- titik merah optik -----
    if (sp.dot && ads > .35) {
      const c = ap(G, [0, 0, sp.dot]), e = ap(G, [0, 0, -.03]);
      if (c[2] > .05 && Math.hypot(c[0] / c[2] - e[0] / e[2], c[1] / c[2] - e[1] / e[2]) < .06) {
        const x = CW / 2 + c[0] / c[2] * FOC, y = CH / 2 - c[1] / c[2] * FOC, r = Math.max(1.6, CH * .0028);
        ctx.save(); ctx.globalAlpha = clamp((ads - .35) * 2.5, 0, 1); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4); g.addColorStop(0, nvg ? 'rgba(200,255,200,1)' : 'rgba(255,80,60,1)'); g.addColorStop(.25, nvg ? 'rgba(120,255,120,.7)' : 'rgba(255,30,20,.7)'); g.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.3); ctx.fill(); ctx.restore();
      }
    }
    // ----- retikel ACOG: chevron merah di dalam lensa mata (dipotong lingkaran lensa) -----
    if (ATT.ACOG && ads > .45 && id === 'AR') {
      const o = ap(G, [0, 0, -.093]), c = ap(G, [0, 0, 1]);
      if (o[2] > .02 && c[2] > .05) {
        const ox = CW / 2 + o[0] / o[2] * FOC, oy = CH / 2 - o[1] / o[2] * FOC, R = .0128 / o[2] * FOC, x = CW / 2 + c[0] / c[2] * FOC, y = CH / 2 - c[1] / c[2] * FOC, u = Math.max(1, CH / 720);
        ctx.save(); ctx.beginPath(); ctx.arc(ox, oy, R, 0, 6.3); ctx.clip(); ctx.globalAlpha = clamp((ads - .45) * 3, 0, 1);
        const vg = ctx.createRadialGradient(ox, oy, R * .7, ox, oy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = vg; ctx.fillRect(ox - R, oy - R, R * 2, R * 2);
        ctx.strokeStyle = 'rgba(10,10,10,.85)'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(x, y + 9 * u); ctx.lineTo(x, y + R); for (let i = 1; i <= 4; i++) { const yy = y + (14 + i * 11) * u, ww = (12 - i * 2) * u; ctx.moveTo(x - ww, yy); ctx.lineTo(x + ww, yy); } ctx.stroke();   // garis BDC
        ctx.shadowColor = nvg ? 'rgba(120,255,120,1)' : 'rgba(255,30,20,.9)'; ctx.shadowBlur = 5 * u;
        ctx.strokeStyle = nvg ? 'rgba(150,255,150,1)' : 'rgba(235,30,20,1)'; ctx.lineWidth = 2.4 * u; ctx.lineJoin = 'miter';
        ctx.beginPath(); ctx.moveTo(x - 7 * u, y + 7 * u); ctx.lineTo(x, y); ctx.lineTo(x + 7 * u, y + 7 * u); ctx.stroke(); ctx.restore();
      }
    }
    // ----- laser bidik: sinar dari modul di rel samping ke titik bidik + titik merah (hanya pinggul) -----
    if (ATT.LASER && id === 'AR' && ads < .5 && !P.sprint && P.relT <= 0 && P.swT <= 0 && !V.dbg && !V.dbgS) {
      const e = ap(G, [.04, B4 + .007, .236]);
      if (e[2] > .05) {
        const ex = CW / 2 + e[0] / e[2] * FOC, ey = CH / 2 - e[1] / e[2] * FOC, tx = CW / 2, ty = CH / 2, a = 1 - ads * 2, u = Math.max(1, CH / 720);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const g = ctx.createLinearGradient(ex, ey, tx, ty); g.addColorStop(0, 'rgba(255,60,40,.55)'); g.addColorStop(1, 'rgba(255,60,40,.05)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke();
        const g2 = ctx.createRadialGradient(tx, ty, 0, tx, ty, 6 * u); g2.addColorStop(0, 'rgba(255,90,70,1)'); g2.addColorStop(.35, 'rgba(255,30,20,.6)'); g2.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(tx, ty, 6 * u, 0, 6.3); ctx.fill(); ctx.restore();
      }
    }
    // ----- kilatan moncong -----
    if (P.vk > .55 && sp.fl && P.melT <= 0) {
      const m = ap(G, sp.muz);
      if (m[2] > .05) {
        const sx = CW / 2 + m[0] / m[2] * FOC, sy = CH / 2 - m[1] / m[2] * FOC, r = (CH * .045 * sp.fl) * (1 + Math.random() * .4) * (P.vk - .3) * (WD.sup ? .25 : 1) * (ATT.ACOG && id === 'AR' ? 1 - ads * .75 : 1);   // ACOG: kilatan tidak menutupi retikel saat membidik
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.2); gr.addColorStop(0, 'rgba(255,250,210,.95)'); gr.addColorStop(.3, 'rgba(255,190,80,.6)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, r * 2.2, 0, 6.3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,150,.9)'; ctx.lineWidth = 2; ctx.beginPath(); const a0 = Math.random() * 3;
        for (let i = 0; i < 5; i++) { const a = a0 + i * 1.256; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * r * 1.6, sy + Math.sin(a) * r * 1.6); } ctx.stroke(); ctx.restore();
      }
    }
  };
})();
