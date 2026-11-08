/* ============================================================
   FPS-CHUTE — parasut ram-air (kain) untuk operator & penerjun
   Kanopi 9 sel (10 rusuk). Tiap rusuk = satu titik massa yang
   disimulasikan (pegas ke bentuk busur bertekanan, tali penahan
   ke harnes, jarak antar-rusuk, angin & turbulensi, tabrakan
   tanah). Mesh dikulit ke 11 tulang (0 = harnes, 1–10 = rusuk),
   jadi panel kain di antara rusuk ikut melar, bergelombang,
   mengembang saat dibuka dan kempis rebah saat mendarat.
   Penerjun AI: terjun bebas beberapa detik (tengkurap, lengan
   terbentang) → tangan menarik pegangan → kanopi mengembang →
   tergantung memegang tali kemudi → mendarat berlutut → berdiri →
   senjata diangkat dari punggung → baru bertempur (war.js).
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, Q = TK.war.Q, MD = F.MDL;
  const { clamp } = TK.util;
  const NR = 10, LR = 6.6, ARC = .52, CHD = 2.6;   // rusuk, panjang tali (m), setengah busur kanopi (rad), lebar tali busur (chord, m)
  const SPAN = 2 * LR * Math.sin(ARC) / (NR - 1);   // jarak antar-rusuk saat mengembang penuh
  F.RAM = { NR, LR, ARC, CHD };
  const CN = F.canopies = [];
  const ss = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  /* ---------- mesh kanopi (koordinat lokal rusuk: x = arah terbang / tepi depan, y = bentang, z = atas) ---------- */
  const US = [0, .03, .08, .16, .27, .4, .55, .7, .85, 1];   // stasiun chord dari tepi depan
  const yt = u => 5 * .17 * CHD * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u * u * u - .1015 * u * u * u * u);
  const cam = u => .045 * CHD * Math.sin(Math.PI * u);
  const ax = u => CHD * (.36 - u);   // tali menempel ±1/3 chord dari depan
  const top = u => [ax(u), 0, cam(u) + yt(u)], bot = u => [ax(u), 0, cam(u) - yt(u) * .55];
  MD.ramChute = function () {
    const m = new MD.Mesh(), K = MD.K;
    const COL = [[132, 142, 98], [96, 106, 70], [132, 142, 98], [96, 106, 70], [206, 194, 150], [96, 106, 70], [132, 142, 98], [96, 106, 70], [132, 142, 98]];   // panel hijau zaitun berselang, sel tengah krem
    for (let j = 0; j < NR - 1; j++) {
      const ca = COL[j], cb = ca.map(v => Math.min(255, v * 1.08));   // sisi bawah: kain tembus cahaya matahari → tampak terang dari bawah
      for (let k = 0; k < US.length - 1; k++) {
        const u0 = US[k], u1 = US[k + 1];
        // kulit atas
        m.set(ca, .06, K.CANOPY, 0);
        m.bone(j + 1); const a = m.V(top(u0), [0, 0, 1]), b = m.V(top(u1), [0, 0, 1]);
        m.bone(j + 2); const c = m.V(top(u1), [0, 0, 1]), d = m.V(top(u0), [0, 0, 1]);
        m.quad(a, b, c, d);
        // kulit bawah (mulut sel terbuka di tepi depan → bagian dalam yang gelap terlihat)
        if (u0 >= .03) {
          m.set(cb, .04, K.CANOPY, 0);
          m.bone(j + 1); const e = m.V(bot(u0), [0, 0, 1]), f = m.V(bot(u1), [0, 0, 1]);
          m.bone(j + 2); const g = m.V(bot(u1), [0, 0, 1]), h = m.V(bot(u0), [0, 0, 1]);
          m.quad(e, h, g, f);
        }
      }
    }
    // rusuk ujung (stabilizer) tertutup
    for (const [b, sg] of [[1, -1], [NR, 1]]) {
      m.bone(b).set([96, 104, 72], .05, K.CANOPY, 0);
      const pts = US.map(top).concat(US.slice().reverse().map(bot));
      m.face(pts, [0, sg, 0]);
    }
    // tali: dari gesper bahu (tulang 0) ke tepi bawah tiap rusuk (2 baris: depan & belakang) — pita silang tipis
    m.set([206, 202, 186], 0, K.PLAIN, 0);
    for (let i = 0; i < NR; i++) {
      const sy = i < NR / 2 ? -.2 : .2;
      for (const u of [.1, .55]) {
        const q = bot(u), w = .012;
        for (const [ox, oz] of [[w, 0], [0, w]]) {
          m.bone(0); const a = m.V([-ox, sy * .6, -oz + .95], [0, 1, 0]), b = m.V([ox, sy * .6, oz + .95], [0, 1, 0]);   // tali bertemu di ujung riser, ±1 m di atas bahu
          m.bone(i + 1); const c = m.V([q[0] + ox, 0, q[2] + oz], [0, 1, 0]), d = m.V([q[0] - ox, 0, q[2] - oz], [0, 1, 0]);
          m.quad(a, b, c, d);
        }
      }
    }
    // riser kain lebar dari bahu
    m.bone(11).set([70, 74, 54], .05, K.CLOTH, 0);   // riser (tulang 11: disembunyikan untuk parasut operator sendiri — tangan fps-vm sudah menggambar riser)
    for (const sy of [-.2, .2]) m.box([0, sy * .8, .55], [.025, .012, .42]);
    m.bone(0);
    return m.done();
  };

  /* ---------- simulasi ---------- */
  function make(h, yaw, owner) {
    const p = [], v = [];
    for (let i = 0; i < NR; i++) { p.push([h[0] - Math.cos(yaw) * .25 + (i - 4.5) * .04, h[1] - Math.sin(yaw) * .25, h[2] + .35 + Math.random() * .05]); v.push([0, 0, 0]); }
    const c = { p, v, h: h.slice(), yaw, o: 0, pr: 0, mode: 'open', t: 0, owner, fl: Math.random() * 6 };
    CN.push(c); return c;
  }
  F.cnMake = make;
  function step(c, dt) {
    c.t += dt;
    const yaw = c.yaw, fw = [Math.cos(yaw), Math.sin(yaw), 0], rt = [-Math.sin(yaw), Math.cos(yaw), 0], h = c.h, T = c.t + c.fl, open = c.mode !== 'drop';
    if (open) { c.o = Math.min(1, c.o + dt / 1.25); c.pr = Math.min(1, c.pr + dt / .9); }   // ±1,2 dtk: tali meregang, sel terisi udara, kanopi melebar
    else { c.pr = Math.max(0, c.pr - dt / 1.4); }                       // mendarat: tekanan hilang, kain kempis
    const lift = ss(c.o / .45), spr = ss((c.o - .25) / .75), sn = ARC * spr;
    const restS = SPAN * (open ? .22 + .78 * spr : 1);
    for (let i = 0; i < NR; i++) {
      const p = c.p[i], v = c.v[i], a = (i / (NR - 1) * 2 - 1) * sn;
      let acc;
      if (open) {
        const L = .7 + (LR - .7) * lift, tb = Math.sin(T * 1.25) * .22 * lift, fl = Math.sin(T * 2.3 + i * .8) * .09 * spr + Math.sin(T * 5.1 + i * 1.9) * .035 * spr;   // ayunan & riak kain
        const tgt = [h[0] + Math.cos(a) * 0 + rt[0] * (L * Math.sin(a) + tb) + fw[0] * .55 * lift, h[1] + rt[1] * (L * Math.sin(a) + tb) + fw[1] * .55 * lift, h[2] + L * Math.cos(a) + fl];
        const K = 46 + 40 * c.pr;
        acc = [(tgt[0] - p[0]) * K - v[0] * 7, (tgt[1] - p[1]) * K - v[1] * 7, (tgt[2] - p[2]) * K - v[2] * 7];
      } else {   // kempis: jatuh pelan (hambatan kain besar) & terseret angin menjauh dari arah hadap
        acc = [-fw[0] * 1.3 * c.pr - v[0] * 1.6, -fw[1] * 1.3 * c.pr - v[1] * 1.6, -4.2 - v[2] * 1.4 + c.pr * 2.5];
      }
      v[0] += acc[0] * dt; v[1] += acc[1] * dt; v[2] += acc[2] * dt;
      p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < NR - 1; i++) {   // jarak antar-rusuk (kain tidak melar / mengerut berlebihan)
        const a = c.p[i], b = c.p[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1e-4, e = (L - restS) / L * .5 * (open ? 1 : .6);
        if (!open && L < restS) continue;   // kain kempis boleh menumpuk
        a[0] += d[0] * e; a[1] += d[1] * e; a[2] += d[2] * e; b[0] -= d[0] * e; b[1] -= d[1] * e; b[2] -= d[2] * e;
      }
      for (const p of c.p) {   // tali: tidak bisa lebih panjang dari LR (boleh kendur)
        const d = [p[0] - h[0], p[1] - h[1], p[2] - h[2]], L = Math.hypot(d[0], d[1], d[2]);
        if (L > LR) { const k = LR / L; p[0] = h[0] + d[0] * k; p[1] = h[1] + d[1] * k; p[2] = h[2] + d[2] * k; }
      }
    }
    for (let i = 0; i < NR; i++) {   // tanah: kain menyentuh tanah lalu tergeletak
      const p = c.p[i], g = F.floorAt ? F.floorAt(p[0], p[1]) : F.hAt(p[0], p[1]);
      if (p[2] < g + .06) { p[2] = g + .06; c.v[i][2] = Math.max(0, c.v[i][2]); c.v[i][0] *= .6; c.v[i][1] *= .6; }
    }
  }
  /* matriks tulang: 0 = harnes (bahu), 1..10 = rusuk (sumbu x mengikuti arah terbang, y = bentang lokal, z = normal kanopi) */
  F.cnBones = function (c, X, out) {
    const yaw = c.yaw, fw = [Math.cos(yaw), Math.sin(yaw), 0];
    const H0 = { c: [fw, [-Math.sin(yaw), Math.cos(yaw), 0], [0, 0, 1]], t: c.h }; X.write(H0, out, 0);
    X.write(c.owner === 'P' && c.mode !== 'drop' ? { c: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], t: c.h } : H0, out, 11 * 16);
    const lift = ss(c.o / .45), sx = .25 + .75 * ss((c.o - .3) / .7), sz = .12 + .88 * c.pr;
    for (let i = 0; i < NR; i++) {
      const a = c.p[Math.max(0, i - 1)], b = c.p[Math.min(NR - 1, i + 1)];
      let sp = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      let x = [fw[0] - sp[0] * dot(fw, sp), fw[1] - sp[1] * dot(fw, sp), fw[2] - sp[2] * dot(fw, sp)]; x = nrm(x);
      let z = crs(x, sp); if (z[2] < -.2 && c.mode !== 'drop') z = z.map(q => -q);
      const th = .1 * lift, ct = Math.cos(th), st = Math.sin(th);   // hidung sedikit menunduk (sudut serang)
      const x2 = [x[0] * ct - z[0] * st, x[1] * ct - z[1] * st, x[2] * ct - z[2] * st], z2 = [z[0] * ct + x[0] * st, z[1] * ct + x[1] * st, z[2] * ct + x[2] * st];
      X.write({ c: [x2.map(q => q * sx), sp, z2.map(q => q * sz)], t: c.p[i] }, out, (i + 1) * 16);
    }
  };

  /* ---------- penerjun AI: ketinggian & fase tampilan dari sisa waktu u.chute (war.js) ---------- */
  F.chuteVis = function (u) {
    const c0 = u.ch0 || Math.max(u.chute, 3), f = clamp(1 - u.chute / c0, 0, 1), H0 = 22 + c0 * 30, Ho = H0 * .6;
    let z, ph, k = 0;
    if (f < .2) { z = H0 - (H0 - Ho) * Math.pow(f / .2, 1.35); ph = 'free'; k = f / .2; }
    else { const g = (f - .2) / .8; z = Ho * Math.pow(1 - g, 1.1); ph = f < .3 ? 'deploy' : 'canopy'; k = f < .3 ? (f - .2) / .1 : g; }
    return { z, ph, k };
  };
  /* pose prajurit selama terjun / mendarat → parameter MD.humanPose (tilt, legs, hands, sling, kneel) */
  F.chutePose = function (u, s, t) {
    if (u.chute > 0) {
      const V = F.chuteVis(u), w = Math.sin(t * 9 + u.id) * .04;
      if (V.ph === 'free') {   // terjun bebas: tengkurap stabil, lengan terbentang, lutut menekuk, bergetar diterpa angin
        Object.assign(s, { tilt: -1.38, pv: [.1, 0, 1.73], legs: [.32 + w, 1.25, 0], hands: { k: 1, R: [.18, .66, .52 + w], L: [.18, -.66, .52 - w] }, sling: 1 });
      } else {
        const d = V.ph === 'deploy' ? V.k : 1, up = ss((d - .35) / .65), tl = -1.38 * (1 - ss(d / .8));
        const R = d < .35 ? [.32, .16, .3] : [.08 + .24 * (1 - up), .26, .3 + .7 * up], L = [.18 - .1 * up, -.66 + .4 * up, .52 + .46 * up];   // tangan kanan menarik pegangan di dada, lalu kedua tangan naik ke tali kemudi
        const sw = Math.sin(t * 1.3 + u.id) * .1;
        Object.assign(s, { tilt: tl, pv: [.1, 0, 1.73], legs: [lerp(.32, -.12, up), lerp(1.25, .3, up), sw * up], hands: { k: 1, R, L }, sling: 1 });
      }
      return true;
    }
    const lt = u.landT !== undefined ? (Q.t - u.landT) / (Q.speed || 1) : 9;   // detik nyata sejak mendarat
    if (lt < 1.95) {   // mendarat: menekuk & berlutut menahan benturan → berdiri → senapan diambil dari punggung
      const kn = lt < .22 ? ss(lt / .22) : 1 - ss((lt - .95) / .4), dr = ss((lt - 1.15) / .7);
      Object.assign(s, { kneel: Math.max(s.kneel || 0, kn), sling: 1 - dr, hands: { k: 1 - dr, R: [.34, .14, -.12], L: [.36, -.18, -.4 + .3 * (1 - kn)] }, mv: 0, aim: dr });
      return true;
    }
    return false;
  };
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ---------- per frame: kanopi operator & penerjun di sekitar kamera ---------- */
  F.cnTick = function (dt) {
    dt = Math.min(dt, .05);
    // operator
    if (P.alive && P.chute === 2 && !P.mnt && !P.veh) {
      if (!P._cn || P._cn.mode === 'drop') P._cn = make([P.x, P.y, P.z + 1.48], P.yaw, 'P');
      const c = P._cn; c.h = [P.x, P.y, P.z + 1.48]; c.yaw = P.yaw;
    } else if (P._cn && P._cn.mode !== 'drop') { P._cn.mode = 'drop'; P._cn.t = 0; P._cn = null; }
    // penerjun AI (dekat kamera saja; kanopi dibuat saat fase buka)
    const cx = P.cam ? P.cam.x : P.x, cy = P.cam ? P.cam.y : P.y;
    for (const u of Q.units) {
      if (u.dead || u.player) { if (u._cn) { u._cn.mode = 'drop'; u._cn.t = 0; u._cn = null; } continue; }
      if (u.chute > 0) {
        if (!u.ch0) u.ch0 = Math.max(u.chute, 3);
        const V = F.chuteVis(u);
        if (V.ph !== 'free' && !u._cn && Math.hypot(u.x - cx, u.y - cy) < 900) { const gz = F.gzOf(u); u._cn = make([u.x, u.y, gz + V.z + 1.48], u.hdg || 0, u); }
        if (u._cn) { const gz = F.gzOf(u); u._cn.h = [u.x, u.y, gz + V.z + 1.48]; u._cn.yaw = u.hdg || 0; }
      } else if (u._cn) { u._cn.mode = 'drop'; u._cn.t = 0; u._cn = null; }   // mendarat: kanopi dilepas, kempis rebah di sebelahnya
    }
    for (let i = CN.length - 1; i >= 0; i--) {
      const c = CN[i];
      if (c.mode === 'drop' && c.t > 9) { CN.splice(i, 1); continue; }
      if (c.mode !== 'drop' && c.owner !== 'P' && (!c.owner || c.owner.dead || !(c.owner.chute > 0))) { c.mode = 'drop'; c.t = 0; }
      step(c, dt);
    }
    if (CN.length > 48) CN.splice(0, CN.length - 48);
  };
  F.cnClear = () => { CN.length = 0; P._cn = null; };
})();
