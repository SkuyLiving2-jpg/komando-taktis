/* =========================================================================
   fps-life.js — dunia yang terasa hidup & masuk akal di mode OPERATOR
   - Navigasi NPC di kota 3D: simulasi warzone hanya mengenal sel peta 50 m, jadi prajurit & kendaraan dulu berjalan menembus gedung
     (dan tampak memanjat atap karena tinggi medan ikut atap). Kini unit darat menyusuri dinding menuju sudut terdekat ke tujuan,
     dan yang terdorong masuk tapak gedung dikeluarkan lagi (war.hooks.nav / navAll).
   - Lalu lintas sipil di jalan antarkota: berhenti bila ada orang di depan, putar balik & kabur saat ada musuh / ledakan, hangus terkena ledakan.
   - Kawanan burung berputar di atas kota & hutan, terbang menjauh saat ada tembakan / ledakan.
   - Animasi naik kendaraan & Shadow Hunter orang pertama: berjalan ke pintu, tangan membuka pintu / palka / kanopi, naik ke kursi (F.entry).
   ========================================================================= */
(function () {
  const TK = window.TK, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q, W = TK.WAR, UT = W.UT;
  const { clamp, rand, wrapPi } = TK.util;
  const A = () => TK.fpsaudio;   // (dulu salah tulis TK.fpsAudio → suara pintu/naik kendaraan tidak pernah terdengar)
  const on = () => war.fpsMode && F.world && F.world.g === Q.g;

  /* ---------- navigasi gedung ---------- */
  const NG = { w: null, m: new Map(), S: 32 };
  const key = (i, j) => i * 4096 + j;
  function grid() {
    const w = F.world; if (NG.w === w) return;
    NG.w = w; NG.m.clear();
    for (const b of w.blds) for (let i = Math.floor((b.x0 - 6) / NG.S); i <= Math.floor((b.x1 + 6) / NG.S); i++) for (let j = Math.floor((b.y0 - 6) / NG.S); j <= Math.floor((b.y1 + 6) / NG.S); j++) {
      let a = NG.m.get(key(i, j)); if (!a) NG.m.set(key(i, j), a = []); a.push(b);
    }
  }
  const near = (x, y) => NG.m.get(key(Math.floor(x / NG.S), Math.floor(y / NG.S)));
  const rad = u => u.armor === 'inf' ? .45 : clamp(1.6 * (UT[u.type].sz || 1), 1.6, 4.5);   // jari-jari badan (kendaraan besar lebih lebar)
  function out(u, r) {   // dorong keluar tapak gedung lewat sisi tembus terdangkal; hasil = [gedung, normal x, normal y] terakhir
    const L = near(u.x, u.y); if (!L) return null; let hit = null;
    for (const b of L) {
      const ax = u.x - (b.x0 - r), bx = b.x1 + r - u.x, ay = u.y - (b.y0 - r), by = b.y1 + r - u.y;
      if (ax <= 0 || bx <= 0 || ay <= 0 || by <= 0) continue;
      const m = Math.min(ax, bx, ay, by);
      if (m === ax) { u.x -= ax; hit = [b, -1, 0]; } else if (m === bx) { u.x += bx; hit = [b, 1, 0]; } else if (m === ay) { u.y -= ay; hit = [b, 0, -1]; } else { u.y += by; hit = [b, 0, 1]; }
    }
    return hit;
  }
  F.navOut = (u, r) => { if (!on()) return null; grid(); return out(u, r === undefined ? rad(u) : r); };
  war.hooks.nav = function (u, ox, oy, p) {
    if (!on()) return; grid();
    const r = rad(u); if (p) out(p, r + .4);   // titik rute di dalam gedung dipindah ke tepinya
    const mx = u.x - ox, my = u.y - oy, ml = Math.hypot(mx, my), h = out(u, r);
    if (!h) { u.navB = null; u.navN = 0; return; }
    if (ml < 1e-4) return;
    const [b, nx, ny] = h, into = -(mx * nx + my * ny) / ml;
    if (into > .3) {   // menabrak dinding hampir tegak lurus: susuri dinding ke sudut yang lebih dekat ke tujuan
      if (u.navB !== b) {
        u.navB = b; u.navN = 0;
        const tx = p ? p.x : u.x + mx * 50, ty = p ? p.y : u.y + my * 50, cost = c => nx ? Math.abs(u.y - c) + Math.hypot(tx - u.x, ty - c) : Math.abs(u.x - c) + Math.hypot(tx - c, ty - u.y);
        u.navS = nx ? (cost(b.y1 + r) < cost(b.y0 - r) ? 1 : -1) : (cost(b.x1 + r) < cost(b.x0 - r) ? 1 : -1);
      }
      if (++u.navN > 360) { u.navS = -u.navS; u.navN = 0; }   // terjebak lama: coba sisi lain
      const s = u.navS * ml; if (nx) u.y += s; else u.x += s;
      out(u, r);
    }
    const dx = u.x - ox, dy = u.y - oy;
    if (dx * dx + dy * dy > 1e-6 && u.armor === 'inf') u.hdg = Math.atan2(dy, dx);   // prajurit menghadap arah jalan sebenarnya (kendaraan: arah badan tetap dari kemudi)
  };
  function freeAt(x, y, r) { const L = near(x, y); if (!L) return true; for (const b of L) if (x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r) return false; return true; }
  war.hooks.navSteer = function (u, a, d) {   // kendaraan: sinar pendek ke depan; tertutup gedung → pilih arah bebas terdekat (sisi yang sudah dipilih didahulukan)
    if (!on()) return a; grid();
    const r = rad(u), L = Math.min(d, r + 14), clear = b => { for (const s of [r + 2, (r + 2 + L) / 2, L]) if (!freeAt(u.x + Math.cos(b) * s, u.y + Math.sin(b) * s, r * .9)) return false; return true; };
    if (clear(a)) { u.navS2 = 0; return a; }
    const sd = u.navS2 || (Math.random() < .5 ? 1 : -1);
    for (let k = 1; k <= 8; k++) for (const s of [sd, -sd]) { const b = a + s * k * .3; if (clear(b)) { u.navS2 = s; return b; } }
    return a;
  };
  war.hooks.navAll = function (g) {
    if (!on()) return; grid();
    for (const u of g) if (!u.fly && UT[u.type].dom !== 'S') out(u, rad(u));
  };

  /* ---------- lalu lintas sipil ---------- */
  const TR = F.traffic = [], RD = { g: null, r: [] };
  function roads() {
    if (RD.g !== Q.g) { RD.g = Q.g; RD.r = (Q.g.roads || []).map(rd => rd.map(p => [p[0] * W.CELL, p[1] * W.CELL])).filter(r => r.length > 1); TR.length = 0; }
    return RD.r;
  }
  const LANE = 1.9;
  function carPos(c) {   // titik di lajur kanan arah jalan
    const R = RD.r[c.r], a = R[c.k], b = R[c.k + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, s = c.dir;
    const x = a[0] + dx * c.t, y = a[1] + dy * c.t, ux = dx / L * s, uy = dy / L * s;
    return { x: x + uy * LANE, y: y - ux * LANE, yaw: Math.atan2(uy, ux), L };
  }
  function spawnCar(rs) {
    for (let tries = 0; tries < 12; tries++) {
      const r = Math.floor(Math.random() * rs.length), R = rs[r], k = Math.floor(Math.random() * (R.length - 1));
      const c = { r, k, t: Math.random(), dir: Math.random() < .5 ? 1 : -1, sp: 0, v: rand(9, 14), c: Math.random(), yaw: 0, x: 0, y: 0, z: 0, id: Math.random() };
      const p = carPos(c), d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d < 260 || d > 760 || !F.inb(p.x, p.y) || F.water(p.x, p.y)) continue;
      if (Q.units.some(u => u.team === 'R' && !u.dead && Math.abs(u.x - p.x) < 150 && Math.abs(u.y - p.y) < 150)) continue;
      Object.assign(c, p); c.z = F.hAt(c.x, c.y); TR.push(c); return;
    }
  }
  function carTick(c, dt) {
    const R = RD.r[c.r];
    if (c.dead) { c.burn -= dt; if (c.burn > 0 && Math.random() < dt * 10) F.emit(c.burn > 14 ? 'fire' : 'smoke', c.x + rand(-1, 1), c.y + rand(-1, 1), c.z + 1.2, c.burn > 14 ? { vz: rand(2, 5), life: rand(.5, .9), s0: 1.3, s1: .4, col: [255, 160, 70], a: .9 } : { vz: rand(1.5, 3), life: rand(2, 4), s0: 1, s1: 4, col: [40, 38, 36], a: .55 }); return; }
    // bahaya: musuh dekat atau ledakan → putar balik & ngebut menjauh
    if (!c.flee) {
      let hot = false;
      for (const f of Q.fx) if (f.k === 'boom' && f.t < .3 && Math.abs(f.x - c.x) < 90 && Math.abs(f.y - c.y) < 90) hot = true;
      if (!hot) for (const u of Q.units) if (u.team === 'R' && !u.dead && !u.fly && !u.jet && Math.abs(u.x - c.x) < 70 && Math.abs(u.y - c.y) < 70) { hot = true; break; }
      if (hot) { c.flee = 8; c.dir = -c.dir; c.sp *= .3; }
    } else c.flee -= dt;
    // halangan di depan (prajurit, operator, kendaraan): berhenti menunggu
    const ca = Math.cos(c.yaw), sa = Math.sin(c.yaw);
    let block = false;
    const chk = (x, y) => { const dx = x - c.x, dy = y - c.y, f = dx * ca + dy * sa, l = -dx * sa + dy * ca; if (f > 0 && f < 11 && Math.abs(l) < 2.6) block = true; };
    if (P.alive) chk(P.x, P.y);
    for (const u of Q.units) { if (u.dead || u.fly || u.jet || u.inV || Math.abs(u.x - c.x) > 14 || Math.abs(u.y - c.y) > 14) continue; chk(u.x, u.y); if (block) break; }
    if (!block) for (const o of TR) if (o !== c && Math.abs(o.x - c.x) < 12 && Math.abs(o.y - c.y) < 12) { chk(o.x, o.y); if (block) break; }
    const want = block ? 0 : c.flee > 0 ? 17 : c.v;
    c.sp += clamp(want - c.sp, -9 * dt, 3.2 * dt);
    if (c.sp < .05) return;
    const p0 = carPos(c); c.t += c.dir * c.sp * dt / p0.L;   // t = posisi di segmen k (0 = titik k, 1 = titik k+1); ujung jalan = putar balik
    if (c.t > 1) { if (c.k < R.length - 2) { c.k++; c.t -= 1; } else { c.t = 1; c.dir = -1; } }
    else if (c.t < 0) { if (c.k > 0) { c.k--; c.t += 1; } else { c.t = 0; c.dir = 1; } }
    const p = carPos(c), kk = Math.min(1, dt * 4);
    c.x = p.x; c.y = p.y; c.yaw = wrapPi(c.yaw + wrapPi(p.yaw - c.yaw) * kk);
    const z = F.hAt(c.x, c.y); c.pit = Math.atan2(F.hAt(c.x + ca * 1.8, c.y + sa * 1.8) - F.hAt(c.x - ca * 1.8, c.y - sa * 1.8), 3.6); c.z = z;
  }
  function trafficTick(dt) {
    const rs = roads(); if (!rs.length || !P.on) return;
    const N = F.opts.mobile ? 7 : 14;
    if (P.alive && TR.filter(c => !c.dead).length < N && Math.random() < dt * 2) spawnCar(rs);
    for (let i = TR.length - 1; i >= 0; i--) {
      const c = TR[i]; carTick(c, dt);
      const d = Math.hypot(c.x - P.x, c.y - P.y);
      if ((d > 950 && !c.dead) || (c.dead && c.burn < -40)) TR.splice(i, 1);
    }
    // ledakan menghanguskan mobil di dekatnya
    for (const f of Q.fx) {
      if (f.k !== 'boom' || f._car) continue; f._car = 1;
      for (const c of TR) if (!c.dead && Math.hypot(c.x - f.x, c.y - f.y) < (f.r || 10) * .5 + 4) { c.dead = true; c.burn = 20; c.sp = 0; F.emit('flash', c.x, c.y, c.z + 1, { life: .3, s0: 3, s1: 6, col: [255, 220, 170] }); }
    }
  }

  /* ---------- burung ---------- */
  const BD = F.birds = [];
  function spawnFlock() {
    const w = F.world, cs = w.cities.filter(c => c.team === 'N');
    let x, y;
    if (cs.length && Math.random() < .55) { const c = cs[Math.floor(Math.random() * cs.length)]; x = c.x + rand(-120, 120); y = c.y + rand(-120, 120); }
    else { const a = rand(0, 6.283), r = rand(180, 520); x = P.x + Math.cos(a) * r; y = P.y + Math.sin(a) * r; }
    if (!F.inb(x, y) || Math.hypot(x - P.x, y - P.y) > 900) return;
    const n = 6 + Math.floor(Math.random() * 9), b = [];
    for (let i = 0; i < n; i++) b.push({ o: rand(0, 6.283), dr: rand(-6, 6), dz: rand(-3, 3), ph: rand(0, 6.283), s: rand(.85, 1.15) });
    BD.push({ x, y, z: F.hAt(x, y) + rand(28, 55), R: rand(16, 34), a: rand(0, 6.283), w: rand(.25, .45) * (Math.random() < .5 ? 1 : -1), b, flee: 0, vx: 0, vy: 0, life: rand(90, 180) });
  }
  function birdTick(dt) {
    if (!P.on || !F.world) return;
    if (BD.length < (F.opts.mobile ? 4 : 7) && Math.random() < dt * .8) spawnFlock();
    let sx = null, sy = null;   // sumber suara keras terdekat
    for (const f of Q.fx) if (f.k === 'boom' && f.t < .2) { sx = f.x; sy = f.y; }
    if (P.time - (P.shotT || -9) < .15) { sx = P.x; sy = P.y; }
    for (let i = BD.length - 1; i >= 0; i--) {
      const f = BD[i]; f.life -= dt; f.a += f.w * dt * (f.flee > 0 ? 2.5 : 1);
      if (sx !== null && f.flee <= 0 && Math.hypot(f.x - sx, f.y - sy) < 260) { const d = Math.hypot(f.x - sx, f.y - sy) || 1; f.flee = 14; f.vx = (f.x - sx) / d * 16; f.vy = (f.y - sy) / d * 16; }
      if (f.flee > 0) { f.flee -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += 5 * dt; f.R = Math.max(6, f.R - dt * 3); if (f.flee <= 0) f.life = Math.min(f.life, 0); }
      else { f.x += Math.cos(f.a * .3) * 1.5 * dt; f.y += Math.sin(f.a * .3) * 1.5 * dt; }
      if (f.life <= 0 || Math.hypot(f.x - P.x, f.y - P.y) > 1100) BD.splice(i, 1);
    }
  }
  F.birdPts = function (T, cb) {   // fps-gl: posisi tiap burung + kepakan sayap
    for (const f of BD) for (const b of f.b) {
      const a = f.a * b.s + b.o, r = f.R + b.dr, x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r, z = f.z + b.dz + Math.sin(T * .7 + b.ph) * 1.2;
      cb(x, y, z, a + (f.w > 0 ? 1.571 : -1.571), Math.sin(T * (f.flee > 0 ? 16 : 9) + b.ph));
    }
  };

  /* ---------- animasi naik kendaraan / Shadow Hunter (orang pertama) ----------
     Kamera = mata operator: berjalan ke pintu (ayunan kepala), tangan meraih gagang, pintu / palka / kanopi benar-benar membuka (tulang MD.DOOR),
     lalu naik / masuk ke kursi; terakhir berbaur ke kamera kendaraan sambil pintu menutup. Kunci gerak per kendaraan di ES (koordinat lokal kendaraan:
     x depan, y kiri, z dari titik asal model; g = tinggi titik asal di atas tanah). p = mata, l = titik pandang ('H' = gagang), h = tangan kanan
     ('H' = gagang ikut berayun bersama pintu), hl = tangan kiri, d = bukaan, t = lama ('walk' = sesuai jarak), tp/tl/th = koordinat kubah (palka tank). */
  const EH = 1.68, D2R = Math.PI / 180;
  const ES = {
    HMV: { g: 0, box: [-2.5, 2.5, -1.2, 1.2], H: [.13, 1.09, 1.38], keys: [
      { p: [.05, 2.2, EH], l: 'H', t: 'walk' },
      { p: [.0, 2.02, EH - .03], l: 'H', h: 'H', t: .35 },
      { p: [-.5, 2.3, EH - .05], l: [.3, 1.2, 1.45], h: 'H', d: 1, t: .65 },
      { p: [.35, 1.3, 1.5], l: [3, .9, 1.5], hl: [.75, 1.0, 1.75], d: 1, t: .45 },
      { p: [.25, .55, 1.72], l: [6, .55, 1.6], d: 1, t: .35 }] },
    APC: { g: 0, box: [-3.2, 3.2, -1.4, 1.4], H: [-3.21, .38, 1.3], keys: [
      { p: [-4.5, .15, EH], l: 'H', t: 'walk' },
      { p: [-4.25, .22, EH - .03], l: 'H', h: 'H', t: .3 },
      { p: [-4.6, .6, EH - .04], l: [-3.1, 0, 1.4], h: 'H', d: 1, t: .65 },
      { p: [-3.45, 0, 1.45], l: [0, 0, 1.6], hl: [-3.1, .6, 1.7], d: 1, t: .45 },
      { p: [-2.3, .45, 1.8], l: [4, .45, 1.7], d: 1, t: .4 }] },
    MBT: { g: 0, box: [-4, 4, -1.95, 1.95], H: [-.48, .7, 3.17], keys: [
      { p: [-2.9, 2.85, EH], l: [-2.9, 1.9, 1.9], t: 'walk' },
      { p: [-2.9, 2.55, EH], l: [-2.9, 1.85, 2.0], h: [-2.85, 1.95, 1.85], hl: [-3.3, 1.95, 1.85], t: .3 },
      { p: [-2.95, 2.1, 2.85], l: [-2.6, 1.0, 2.6], h: [-2.85, 1.7, 1.95], hl: [-3.3, 1.7, 1.95], t: .5, roll: .06 },
      { p: [-3.1, 1.25, 3.5], l: [-.8, .7, 3.1], tl: 1, t: .4 },
      { p: [-1.75, .95, 4.6], tp: 1, l: [-.8, .7, 3.1], tl: 1, t: .45 },
      { p: [-1.6, .85, 4.5], tp: 1, l: 'H', h: 'H', t: .3 },
      { p: [-1.75, .85, 4.6], tp: 1, l: 'H', h: 'H', d: 1, t: .6 },
      { p: [-.8, .7, 3.75], tp: 1, l: [4, .7, 3.5], tl: 1, hl: [-1.0, 1.05, 3.1], th: 1, d: 1, t: .55 }] },
    // VTOL: tekan pelepas kanopi di sisi badan → kanopi terangkat & tangga terbuka → naik tangga (tangan di anak tangga) → pegang ambang
    // kokpit → melangkah masuk → duduk di kursi lontar
    VTOL: { g: 2.33, box: [-9.6, 8.1, -1.5, 1.5], H: [4.0, .55, .82], keys: [
      { p: [4.05, 2.55, EH - 2.33], l: [4.1, .6, .6], t: 'walk' },
      { p: [4.0, 2.25, EH - 2.33], l: [4.0, 1.0, -.2], h: [4.0, 1.04, -.25], t: .3 },
      { p: [3.95, 2.4, EH - 2.33], l: [4.3, .2, 1.7], h: [4.0, 1.04, -.25], d: 1, t: .75 },
      { p: [4.0, 2.05, -.75], l: [4.05, 1.0, .4], h: [4.12, 1.3, -.6], hl: [3.9, 1.18, -.1], d: 1, t: .55, roll: .04 },
      { p: [4.0, 1.75, .45], l: [4.3, .3, .9], h: [4.25, .55, .9], hl: [3.75, .55, .9], d: 1, t: .55, roll: -.04 },
      { p: [4.05, .75, 1.75], l: [5.3, 0, .9], h: [4.4, .5, .92], d: 1, t: .45 },
      { p: [3.9, 0, 1.3], l: [12, 0, 1.15], d: 1, t: .5 }] },
    // Shadow Hunter: buka kunci pintu kaca kanan kursi depan dari gagangnya → pintu terdorong naik seperti sayap camar (engsel di tepi atas)
    // & pijakan lipat terbuka → injak pijakan, kedua tangan di ambang → menyelinap masuk di bawah pintu → duduk di kursi penembak depan
    AH64: { g: 1.45, box: [-8.7, 6.4, -1.3, 1.3], H: [2.85, .8, .55], keys: [
      { p: [3.0, 2.4, EH - 1.45], l: [2.9, .8, .6], t: 'walk' },
      { p: [2.95, 1.95, EH - 1.45], l: 'H', h: 'H', t: .3 },
      { p: [2.9, 2.05, EH - 1.45 - .03], l: 'H', h: 'H', d: .45, t: .4 },
      { p: [2.85, 2.25, EH - 1.45 - .05], l: [3.15, .4, 1.4], d: 1, t: .45 },
      { p: [3.0, 1.75, .55], l: [3.15, .5, .5], h: [3.35, .8, .5], hl: [2.7, .82, .52], d: 1, t: .55, roll: .05 },
      { p: [3.2, .8, 1.1], l: [4.4, .1, .55], h: [3.5, .74, .47], d: 1, t: .45, roll: -.03 },
      { p: [3.45, .05, .9], l: [10, .1, .65], d: 1, t: .45 }] }
  };
  const ent = () => P.entA;
  const MDL = () => F.MDL;
  function rotAx(p, h, ax, a) {   // putar titik p mengelilingi engsel h pada sumbu ax
    const x = p[0] - h[0], y = p[1] - h[1], z = p[2] - h[2], c = Math.cos(a), s = Math.sin(a);
    if (Array.isArray(ax)) { const q = MDL().X.ap(MDL().X.ra(ax, a), [x, y, z]); return [h[0] + q[0], h[1] + q[1], h[2] + q[2]]; }   // sumbu bebas (pintu sayap camar Shadow Hunter)
    if (ax === 'z') return [h[0] + x * c - y * s, h[1] + x * s + y * c, p[2]];
    if (ax === 'y') return [h[0] + x * c - z * s, p[1], h[2] + x * s + z * c];   // ry(+) = +x naik ke +z (moncong mendongak)
    return [p[0], h[1] + y * c - z * s, h[2] + y * s + z * c];
  }
  function turL(E, p) {   // koordinat kubah → koordinat lambung (palka tank ikut putaran kubah)
    const t = MDL().VEHX.MBT.tur, a = E.ty, c = Math.cos(a), s = Math.sin(a), x = p[0] - t;
    return [t + x * c - p[1] * s, x * s + p[1] * c, p[2]];
  }
  function handle(E) {   // gagang ikut berayun bersama pintu
    const D = MDL().DOOR[E.id], p = rotAx(E.S.H, D.h, D.ax, D.a * E.door);
    return D.tur ? turL(E, p) : p;
  }
  function toW(E, p) {   // lokal kendaraan → dunia
    const o = E.o, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    return [o.x + c * p[0] - s * p[1], o.y + s * p[0] + c * p[1], o.z + p[2]];
  }
  function toL(E, w) {   // dunia → lokal kendaraan
    const o = E.o, c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = w[0] - o.x, dy = w[1] - o.y;
    return [c * dx + s * dy, -s * dx + c * dy, w[2] - o.z];
  }
  const kp = (E, k, f, tf) => k[f] === 'H' ? handle(E) : k[f] ? (k[tf] ? turL(E, k[f]) : k[f]) : null;
  function walkPath(S, a, b) {   // jalan kaki ke titik berdiri memutari badan kendaraan (lewat 1–2 sudut kotak) — tidak menembus lambung / sayap
    const B = S.box, ins = (p, m) => p[0] > B[0] - m && p[0] < B[1] + m && p[1] > B[2] - m && p[1] < B[3] + m, M = ins(a, .7) ? .15 : .7;
    const hit = (p, q) => { for (let i = 1; i < 24; i++) { const t = i / 24; if (ins([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], M)) return true; } return false; };
    const m = M + .35, C = [[B[0] - m, B[2] - m], [B[1] + m, B[2] - m], [B[1] + m, B[3] + m], [B[0] - m, B[3] + m]];
    const z = (p, k) => [p[0], p[1], a[2] + (b[2] - a[2]) * k];
    const cands = [[]]; for (let i = 0; i < 4; i++) { cands.push([C[i]]); cands.push([C[i], C[(i + 1) % 4]]); cands.push([C[(i + 1) % 4], C[i]]); }
    let best = null, bl = 1e9;
    for (const c of cands) {
      const pts = [a, ...c, b]; let ok = true, l = 0;
      for (let i = 1; i < pts.length; i++) { if (hit(pts[i - 1], pts[i])) { ok = false; break; } l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
      if (ok && l < bl) { bl = l; best = pts; }
    }
    best = best || [a, b];
    return best.map((p, i) => i === 0 ? a : i === best.length - 1 ? b : z(p, i / (best.length - 1)));
  }
  function along(path, k) {   // titik di polyline pada pecahan panjang k
    let L = 0; const seg = []; for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); L += l; }
    let d = k * L; for (let i = 1; i < path.length; i++) { if (d <= seg[i - 1] || i === path.length - 1) { const t = seg[i - 1] ? clamp(d / seg[i - 1], 0, 1) : 1; return path[i - 1].map((v, j) => v + (path[i][j] - v) * t); } d -= seg[i - 1]; }
    return path[path.length - 1];
  }
  F.entry = function (T, done) {   // T: { id, o: objek kendaraan {x, y, z, yaw}, u: unit sim, ty: putaran kubah relatif lambung }
    if (typeof requestAnimationFrame !== 'function' || F.opts.entAnim === false || !P.unit || !ES[T.id]) return false;   // uji Node / dimatikan: langsung duduk
    const S = ES[T.id], E = { id: T.id, S, o: T.o, u: T.u, ty: T.ty || 0, t: 0, k: 0, door: 0, done, bob: 0, fin: -1 };
    E.p0 = toL(E, [P.x, P.y, P.z + P.eye]);
    E.path = walkPath(S, E.p0, S.keys[0].p); let dist = 0; for (let i = 1; i < E.path.length; i++) dist += Math.hypot(E.path[i][0] - E.path[i - 1][0], E.path[i][1] - E.path[i - 1][1]);
    E.dist = dist; E.dur = S.keys.map(k => k.t === 'walk' ? clamp(dist / 3.3, .3, 3.2) : k.t);
    const c = P.cam || { yaw: P.yaw, pitch: P.pitch };
    E.yaw = c.yaw; E.pitch = c.pitch; E.roll = 0;
    P.entA = E; F.camHide = null; P.ads = 0; P.vx = P.vy = 0;
    return true;
  };
  F.entCancel = function () { const E = ent(); if (!E) return; if (E.u) E.u.door = 0; P.entA = null; };
  const sm = k => k * k * (3 - 2 * k);
  F.entTick = function (dt) {
    const E = ent(); if (!E) return false;
    if (!P.alive || (!P.veh && !P.mnt) || (E.u && E.u.dead)) { F.entCancel(); return false; }
    E.t += dt; const S = E.S, K = S.keys;
    if (E.fin < 0) {
      let t = E.t, i = 0; while (i < K.length && t > E.dur[i]) { t -= E.dur[i]; i++; }
      if (i >= K.length) { E.fin = 0; E.pf = E.pw; }
      else {
        const k = K[i], a = sm(clamp(t / E.dur[i], 0, 1)), prev = i ? K[i - 1] : null;
        const pa = prev ? kp(E, prev, 'p', 'tp') : E.p0, pb = kp(E, k, 'p', 'tp');
        const p = k.t === 'walk' ? along(E.path, a) : pa.map((v, j) => v + (pb[j] - v) * a);
        const d0 = prev ? prev.d || 0 : 0; E.door = d0 + ((k.d || 0) - d0) * a;
        if (k.t === 'walk' || (prev && Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > .4 && pb[2] - pa[2] < .3)) { E.bob += Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / E.dur[i] * dt * 2.3; p[2] += Math.sin(E.bob * 2) * .035; }   // ayunan langkah
        const la = prev ? kp(E, prev, 'l', 'tl') : null, lb = kp(E, k, 'l', 'tl');
        let lp = la ? la.map((v, j) => v + (lb[j] - v) * a) : lb;
        if (k.t === 'walk') { const q = along(E.path, Math.min(1, a + 1.6 / Math.max(1, E.dist))), w = sm(clamp((a - .45) / .5, 0, 1)); lp = [q[0], q[1], p[2] - .15].map((v, j) => v + (lb[j] - v) * w); }   // berjalan: memandang ke depan jalur, lalu ke pintu
        E.pw = toW(E, p); const lw = toW(E, lp), dx = lw[0] - E.pw[0], dy = lw[1] - E.pw[1], dz = lw[2] - E.pw[2];
        const wy = Math.atan2(dy, dx), wp = Math.atan2(dz, Math.hypot(dx, dy)), kk = Math.min(1, dt * 7);   // kepala menoleh dengan sedikit jeda (tidak kaku)
        E.yaw = wrapPi(E.yaw + wrapPi(wy - E.yaw) * kk); E.pitch += (wp - E.pitch) * kk;
        E.roll += ((k.roll || 0) * Math.sin(E.t * 6) - E.roll) * kk;
        const hp = kp(E, k, 'h', 'th'), hl = kp(E, k, 'hl', 'th');
        E.hR = hp ? { w: toW(E, hp), g: clamp(t / Math.min(.25, E.dur[i]), 0, 1) } : null;
        E.hL = hl ? { w: toW(E, hl), g: clamp(t / Math.min(.25, E.dur[i]), 0, 1) } : null;
        if (!E.snd && E.door > .05) { E.snd = true; A() && A().local('switch', .8); }
      }
    }
    if (E.fin >= 0) {   // berbaur ke kamera kendaraan, pintu menutup
      E.fin += dt; E.door = (K[K.length - 1].d || 0) * (1 - sm(clamp(E.fin / .5, 0, 1))); E.hR = E.hL = null;
      if (E.fin > .3 && !E.snd2) { E.snd2 = true; A() && A().local('thud', .6); }
      if (E.fin >= .55) { if (E.u) E.u.door = 0; P.entA = null; E.done && E.done(); return false; }
    }
    if (E.u) E.u.door = E.door;
    return true;
  };
  F.entCam = function (fin) {
    const E = ent(); if (!E || !E.pw) return fin;
    const c = { x: E.pw[0], y: E.pw[1], z: E.pw[2], yaw: E.yaw, pitch: E.pitch, roll: E.roll, fov: (P.fov || 70) * D2R };
    if (E.fin < 0) { F.camHide = null; return c; }
    const k = sm(clamp(E.fin / .5, 0, 1));
    return { x: c.x + (fin.x - c.x) * k, y: c.y + (fin.y - c.y) * k, z: c.z + (fin.z - c.z) * k, yaw: c.yaw + wrapPi(fin.yaw - c.yaw) * k, pitch: c.pitch + (fin.pitch - c.pitch) * k, roll: c.roll * (1 - k), fov: c.fov + (fin.fov - c.fov) * k };
  };
  F.entHand = function () {   // tangan di ruang pandang kamera (x kanan, y atas, z depan) untuk fps-vm
    const E = ent(), c = P.cam; if (!E || !c || E.fin >= 0) return null;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const f = [cy * cp, sy * cp, sp], r = [-sy, cy, 0], u = [-cy * sp, -sy * sp, cp];   // depan, kanan (yaw naik = menoleh ke kanan), atas
    const v = h => { if (!h) return null; const d = [h.w[0] - c.x, h.w[1] - c.y, h.w[2] - c.z]; return { p: [d[0] * r[0] + d[1] * r[1], d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * f[0] + d[1] * f[1] + d[2] * f[2]], g: h.g }; };
    return { R: v(E.hR), L: v(E.hL) };
  };

  /* ---------- gunung berapi: erupsi berkala (±1 menit) ----------
     gemuruh + getaran beberapa detik sebelumnya → ledakan kawah (dentum, kilat, guncangan sesuai jarak) → kolom abu menjulang ratusan meter,
     semburan pijar, petir vulkanik di dalam awan abu, bom lava yang melayang balistik lalu meledak & membakar di lereng (melukai siapa pun
     di dekatnya). Partikel ber-'far' tetap tampak menembus kabut jarak jauh (fps-gl collectFx). */
  const VE = F.volcE = { w: null, next: 0, ph: 0, t0: 0, acc: [0, 0, 0, 0], bombs: [], nb: 0 };
  function volcTick(dt) {
    const V = F.world.volc, C = F.VOLC; if (!V || !V.top) return;
    const T = P.time, d = Math.hypot(V.x - P.x, V.y - P.y), cl = k => clamp(k, 0, 1);
    if (VE.w !== F.world) { VE.w = F.world; VE.next = T + rand(C.first[0], C.first[1]); VE.ph = 0; VE.bombs.length = 0; }
    if (VE.ph === 0 && T > VE.next - C.warn) { VE.ph = 1; VE.t0 = VE.next; A() && A().local('quake', .25 + .75 * cl(1 - d / 4500)); if (d < C.msgR) F.msg(TK.t('f_volc'), 'c'); }
    if (VE.ph === 1) {
      P.shake = Math.max(P.shake, .3 * cl(1 - d / 2600) * (1 - (VE.t0 - T) / C.warn));
      if (Math.random() < dt * 6) F.emit('smoke', V.x + rand(-20, 20), V.y + rand(-20, 20), V.top - 4, { vz: rand(8, 14), vx: 1.5, life: rand(8, 12), s0: 10, s1: 40, col: [70, 66, 62], a: .7, drag: .05, far: 1 });
      if (T >= VE.t0) {   // LETUSAN
        VE.ph = 2; VE.nb = 0; VE.acc = [0, 0, 0, 0];
        A() && A().boom(V.x, V.y, C.boom); A() && A().local('quake', .4 + .6 * cl(1 - d / 4500));
        P.shake = Math.min(2, P.shake + 1.4 * cl(1 - d / 2800) + .15);
        F.emit('flash', V.x, V.y, V.top + 25, { life: .9, s0: 110, s1: 300, col: [255, 170, 90], far: 1 });
        for (let i = 0; i < 22; i++) F.emit('smoke', V.x + rand(-30, 30), V.y + rand(-30, 30), V.top + rand(0, 30), { vx: rand(-6, 6), vy: rand(-6, 6), vz: rand(45, 90), life: rand(20, 28), s0: 50, s1: 240, col: i % 3 ? [46, 42, 40] : [86, 80, 74], a: .95, drag: .09, far: 1 });   // gumpalan awal seperti kembang kol
        for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, s = rand(10, 40); F.emit('smoke', V.x + Math.cos(a) * 20, V.y + Math.sin(a) * 20, V.top, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(4, 18), life: rand(10, 16), s0: 18, s1: 70, col: [84, 78, 72], a: .85, drag: .35, far: 1 }); }   // awan panas menyapu bibir kawah
        if (F.shock) F.shock.push({ x: V.x, y: V.y, R: 900, t: 0, life: 2.6, col: [255, 225, 190], w: 3 });
      }
    }
    if (VE.ph === 2) {
      const e = T - VE.t0, main = e < C.dur, ac = VE.acc;
      ac[0] += dt * (main ? 6 : e < C.plume ? 1.6 : 0); while (ac[0] >= 1) { ac[0]--; const f = 1 - .6 * cl(e / C.plume); F.emit('smoke', V.x + rand(-28, 28), V.y + rand(-28, 28), V.top + rand(0, 40), { vz: rand(38, 66) * f, vx: rand(-4, 4) + 2.5, vy: rand(-4, 4), life: rand(16, 22), s0: 38, s1: 210, col: Math.random() < .3 ? [92, 86, 80] : [52, 48, 46], a: .9, drag: .06, far: 1 }); }
      if (main && Math.random() < dt * 6) F.emit('fire', V.x, V.y, V.top + 4, { life: .5, s0: 70, s1: 50, col: [255, 120, 40], a: .55, far: 1 });   // pendar kawah
      ac[1] += dt * (main ? 12 : 0); while (ac[1] >= 1) { ac[1]--; F.emit('fire', V.x + rand(-14, 14), V.y + rand(-14, 14), V.top - 6, { vx: rand(-18, 18), vy: rand(-18, 18), vz: rand(30, 70), g: 9.8, life: rand(1.6, 3.4), s0: 15, s1: 5, col: [255, 140 + rand(0, 50), 50], a: .95, far: 1 }); }
      ac[2] += dt * (e < C.dur + 4 ? 1.3 : 0); while (ac[2] >= 1) { ac[2]--; if (Math.random() < .7) { const z = V.top + rand(120, 330 * cl(e / 6) + 140); F.emit('flash', V.x + rand(-70, 70), V.y + rand(-70, 70), z, { life: .14, s0: 40, s1: 24, col: [205, 215, 255], far: 1 }); F.emit('flash', V.x + rand(-40, 40), V.y + rand(-40, 40), z - rand(30, 80), { life: .1, s0: 26, s1: 14, col: [230, 235, 255], far: 1 }); if (Math.random() < .5) A() && A().at('cannon', V.x, V.y, .7); } }   // petir vulkanik
      while (VE.nb < C.bombs && e > VE.nb * C.dur * .7 / C.bombs) { VE.nb++; const a = Math.random() * 6.283, s = rand(8, 36); VE.bombs.push({ x: V.x + Math.cos(a) * 8, y: V.y + Math.sin(a) * 8, z: V.top, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(34, 62), tr: 0, tf: 0 }); }
      if (e > C.plume) { VE.ph = 0; VE.next = VE.t0 + C.every + rand(-C.jit, C.jit); }
    }
    for (let i = VE.bombs.length - 1; i >= 0; i--) {   // bom lava: balistik, jejak pijar + asap, meledak saat menghantam lereng
      const b = VE.bombs[i]; b.vz -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.tr -= dt;
      b.tf -= dt; if (b.tf <= 0) { b.tf = .05; F.emit('fire', b.x, b.y, b.z, { life: .24, s0: 8, s1: 3, col: [255, 165, 70], a: 1, far: 1 }); }
      if (b.tr <= 0) { b.tr = .2; F.emit('smoke', b.x, b.y, b.z, { vz: 1, life: rand(1.6, 2.4), s0: 4, s1: 11, col: [44, 40, 38], a: .55, drag: .5, far: 1 }); }
      const gz = F.inb(b.x, b.y) ? F.hAt(b.x, b.y) : -9;
      if (b.z <= gz) {
        VE.bombs.splice(i, 1); if (!F.inb(b.x, b.y)) continue;
        war.explode(b.x, b.y, C.r, C.dmg, 'he', null);
        for (let k = 0; k < 5; k++) F.emit('fire', b.x + rand(-2, 2), b.y + rand(-2, 2), gz + .5, { vz: rand(1, 4), life: rand(4, 8), s0: 2.5, s1: 1, col: [255, 120, 40], a: .9 });   // batu pijar terbakar di lereng
        if (F.scorch) F.scorch.push({ x: b.x, y: b.y, r: rand(3, 5), t: 0, life: 25 });
      }
    }
  }

  /* ---------- GRAPPLING HOOK [H] ----------
     Kait ditembakkan ke arah bidikan. Mengenai dinding gedung -> kait menancap di TEPI ATAP tepat di atas titik kena (bukan di dinding),
     pemain ditarik (mata bergerak lurus ke tepi atap: garis ini selalu di atas sinar bidik yang sudah terbukti bebas halangan, jadi kamera
     tidak pernah menembus gedung lain), lalu memanjat naik & melangkah ke atap (berdiri di lantai atap yang sah = floorAt). Mengenai lereng/
     tebing -> ditarik ke titik itu. [H] lagi / lompat = lepas tali (jatuh dengan momentum). */
  const HK = () => F.HOOK;
  const hkMsg = k => { if ((P._hkMsg || 0) < P.time - 1.2) { P._hkMsg = P.time; F.msg(TK.t(k), 'c'); } };
  function hookFail(k) { hkMsg(k); A() && A().local('empty', .8); P.hookCd = P.time + .35; return false; }
  F.hookOk = () => P.alive && !P.veh && !P.mnt && !P.gs && !P.entA && !P.swim && !P.down && !(P.chute > 0) && !P.menu;
  /* rencana kait dari arah bidik sekarang (tanpa efek samping): { H } atau { err }. Dipakai tombol tembak & penanda bidik HUD */
  const HELIK = { HELI: 1, ATK2: 1, MEDHELI: 1 };
  function rayUnit(ex, ey, ez, v, maxT, pick) {   // unit terdekat yang dilalui sinar bidik (jarak tegak lurus ≤ rad dari pusat badannya)
    let best = null, bt = maxT;
    for (const u of Q.units) {
      if (u.dead || u.player || u.chute > 0 || u.inV) continue; const rad = pick(u); if (!rad) continue;
      const cz = F.zOf(u) + (u.tc === 'A' ? 0 : u.armor === 'inf' ? 1.1 : 1.4), dx = u.x - ex, dy = u.y - ey, dz = cz - ez, t = dx * v[0] + dy * v[1] + dz * v[2];
      if (t < 2 || t > bt) continue; const px = dx - v[0] * t, py = dy - v[1] * t, pz = dz - v[2] * t; if (px * px + py * py + pz * pz > rad * rad) continue;
      best = { u, t, z: cz }; bt = t;
    }
    return best;
  }
  function hookPlan() {
    const C = HK(), ex = P.x, ey = P.y, ez = P.z + P.eye, v = F.aimVec(P.yaw, P.pitch), t = F.rayTerrain(ex, ey, ez, v[0], v[1], v[2], C.rng);
    const tw = t < 0 ? C.rng : t;
    if (P.hook && P.hook.ph === 'tag') {   // kait kedua: titik jangkar (tanah / dinding / apa saja yang kena) untuk menjerat musuh yang terkait
      if (t < 0) return { err: 'f_hook_far' };
      return { H: { mode: 'bind', ax: ex + v[0] * t, ay: ey + v[1] * t, az: ez + v[2] * t }, d: t };
    }
    const hl = rayUnit(ex, ey, ez, v, Math.min(C.ride, t < 0 ? C.ride : t + 2), u => u.team === 'B' && HELIK[u.type] && u.tc === 'A' && F.altOf(u) > 8 ? 5 : 0);   // heli kawan di udara
    if (hl) return { H: { mode: 'ride', u: hl.u, ax: hl.u.x, ay: hl.u.y, az: hl.z - 1.2 }, d: hl.t };
    const en = rayUnit(ex, ey, ez, v, tw + 1, u => u.team === 'R' && u.tc !== 'A' && !u.vanish ? (u.armor === 'inf' ? .9 : u.struct ? 0 : 2.8) : 0);   // musuh di darat
    if (en) return { H: { mode: 'tag', u: en.u, ax: en.u.x, ay: en.u.y, az: en.z }, d: en.t };
    if (t < 0) return { err: 'f_hook_far' };
    const hx = ex + v[0] * t, hy = ey + v[1] * t, hz = ez + v[2] * t, hh = Math.hypot(v[0], v[1]) || 1, ux = v[0] / hh, uy = v[1] / hh;
    let top = null;
    for (const k of [.3, .9, 1.6]) { const b = F.bTop(hx + ux * k, hy + uy * k); if (b !== null) { top = b; break; } }
    let H;
    if (top !== null && top - hz < 40 && top > P.z + .8) {   // gedung: kait di tepi atap
      let sx = null, sy = null; for (const k of [1.3, 2, 2.8, .9]) { const qx = hx + ux * k, qy = hy + uy * k, b = F.bTop(qx, qy); if (b !== null && Math.abs(b - top) < .3) { sx = qx; sy = qy; break; } }
      if (sx === null) return { err: 'f_hook_bad' };
      H = { ax: hx + ux * .05, ay: hy + uy * .05, az: top + .05, top, wx: hx - ux * .55, wy: hy - uy * .55, sx, sy, bld: true };
    } else if (top === null && F.floorAt(hx, hy) > P.z + 1.2 && !F.water(hx, hy) && !F.lava(hx, hy)) {   // tebing / bukit terjal
      const sx = hx - ux * .6, sy = hy - uy * .6; H = { ax: hx, ay: hy, az: hz, top: F.floorAt(sx, sy), wx: sx, wy: sy, sx, sy, bld: false };
    } else if (top === null && !F.water(hx, hy) && !F.lava(hx, hy) && Math.hypot(hx - ex, hy - ey) >= C.gnd) {   // v3.2 tanah datar ≥ 20 m: meluncur ke titik itu
      const sx = hx - ux * .9, sy = hy - uy * .9; H = { ax: hx, ay: hy, az: hz, top: F.floorAt(sx, sy), wx: sx, wy: sy, sx, sy, bld: false, gnd: true };
    } else return { err: top !== null ? 'f_hook_bad' : F.water(hx, hy) || F.lava(hx, hy) ? 'f_hook_low' : 'f_hook_near' };
    const d = Math.hypot(H.ax - ex, H.ay - ey, H.az - ez); if (d > C.rng) return { err: 'f_hook_far' };
    // jalur tarikan harus bebas: dari mata & dari pinggang ke titik gantung di bawah tepi atap (dulu tidak diuji → badan bisa menembus gedung lain / tersangkut)
    const tz = H.bld ? H.top - .25 : H.top + P.eye + .2;
    for (const dz of [0, -1.1]) {
      const ox = ex, oy = ey, oz = ez + dz, qx = H.wx - ox, qy = H.wy - oy, qz = tz + dz - oz, L = Math.hypot(qx, qy, qz);
      if (L > 1.5) { const r = F.rayTerrain(ox, oy, oz, qx / L, qy / L, qz / L, L - .9); if (r >= 0) return { err: 'f_hook_bad' }; }
    }
    return { H, d };
  }
  let aimC = { t: -1, r: null };
  F.hookAim = () => { if (P.time - aimC.t > .08) aimC = { t: P.time, r: hookPlan() }; return aimC.r; };   // penanda bidik HUD (di-cache 0,08 dtk)
  /* [H] = keluarkan / simpan alat kait (senjata diturunkan, tangan memegang peluncur kait). Saat tali terpasang: [H] = lepas tali */
  F.hookTool = function () {
    if (P.hook) { if (P.hook.ph === 'ride') { P.hook.ph = 'drop'; return true; } if (P.hook.ph === 'drop') return true; hookRelease(); F.eqSet && F.eqSet(null); return true; }   // bergelayut: H = turun tali (bukan jatuh bebas)
    if (P.eq === 'hook') { F.eqSet(null); return true; }
    if (!F.hookOk() || P.abA || P.gT > 0 || P.melT > 0 || P.bashT > 0) return false;
    F.eqSet('hook'); aimC.t = -1; return true;
  };
  F.hookUse = function () {   // tombol tembak saat alat kait dipegang: luncurkan kait ke titik bidik
    if (P.hook && P.hook.ph === 'tag') {   // kait kedua: tali dari musuh disangkutkan ke jangkar → musuh terjerat
      const pl = hookPlan(); if (pl.err) return hookFail(pl.err);
      const u = P.hook.u, C = HK(), J = pl.H, hum = u.armor === 'inf', T = u.boss ? 1.5 : hum ? C.stun : C.snare;
      u.stunT = Math.max(u.stunT || 0, Q.t + T * (Q.speed || 1)); if (u.cr && war.crStagger) war.crStagger(u, 1);
      if (F.tethers) F.tethers.push({ u, ax: J.ax, ay: J.ay, az: J.az, t1: P.time + T });
      F.msg(TK.t(hum ? 'f_hook_bind' : 'f_hook_bindV'), 'g'); A() && A().local('throw', .9); A() && A().at('tap', u.x, u.y, 1); F.sparks && F.sparks(J.ax, J.ay, J.az, 6);
      P.hook = null; P.hookCd = P.time + HK().cd; if (P.eq === 'hook' && F.eqSet) F.eqSet(null); return true;
    }
    if (P.hook) return false;
    if (!F.hookOk() || (P.hookCd || 0) > P.time) return false;
    const pl = hookPlan(); if (pl.err) return hookFail(pl.err);
    const H = pl.H, ez = P.z + P.eye;
    Object.assign(H, { ph: 'fly', hx: P.x, hy: P.y, hz: ez - .3, t: 0, sp: 0, tug: 0, d0: pl.d });
    if (H.mode === 'ride') { const a = Math.random() * 6.283; H.ox = Math.cos(a) * .8; H.oy = Math.sin(a) * .8; }
    P.hook = H; P.ads = 0; P.vx = P.vy = 0; A() && A().local('throw', .9); A() && A().local('pin', .6); P.shake = Math.min(1, P.shake + .2);
    return true;
  };
  function hookRelease() { const H = P.hook; if (!H) return; P.hook = null; P.hookCd = P.time + HK().cd * .5; P.grounded = false; if (H.ph !== 'pull') P.vx = P.vy = 0; if (P.eq === 'hook' && F.eqSet) F.eqSet(null); }
  F.hookCancel = () => { P.hook = null; };
  F.tethers = [];   // v3.2 musuh terjerat: tali dari badan ke jangkar (digambar fps-gl)
  const hkZ = u => F.zOf(u) + (u.tc === 'A' ? -1.2 : u.armor === 'inf' ? 1.1 : 1.4);
  F.hookRides = () => !!(P.hook && (P.hook.ph === 'ride' || P.hook.ph === 'drop'));   // bergelayut: senjata tetap bisa dipakai (fps.js)
  F.hookTick = function (dt) {   // true = kait mengendalikan pemain (gerak normal dilewati)
    const H = P.hook, C = HK(); if (!H) return false;
    if (!F.hookOk()) { P.hook = null; if (P.eq === 'hook' && F.eqSet) F.eqSet(null); return false; }
    H.t += dt;
    for (let i = F.tethers.length - 1; i >= 0; i--) if (F.tethers[i].u.dead || P.time > F.tethers[i].t1) F.tethers.splice(i, 1);
    if (H.u && (H.ph === 'fly' || H.ph === 'tag' || H.ph === 'pull')) { if (H.u.dead) { hookRelease(); return false; } H.ax = H.u.x; H.ay = H.u.y; H.az = hkZ(H.u); }   // sasaran bergerak: kepala kait mengikuti
    if (H.ph === 'tag') {   // kait menancap di musuh: pemain bebas bergerak, tembak lagi ke tanah / dinding = jerat
      H.hx = H.ax; H.hy = H.ay; H.hz = H.az;
      if (P.time - H.tg0 > HK().tagT || Math.hypot(H.u.x - P.x, H.u.y - P.y) > HK().rng * 1.6) { hookRelease(); return false; }
      return false;
    }
    if (H.ph === 'ride' || H.ph === 'drop') {   // bergelayut di bawah heli kawan (bisa menembak) · turun tali sampai tanah
      const u = H.u, live = u && !u.dead && u.tc === 'A';
      if (live) { H.hx = u.x; H.hy = u.y; H.hz = hkZ(u); }
      if (H.ph === 'ride') {
        if (!live || F.altOf(u) < 7 || (F.in.jump && H.t - H.r0 > .4)) { H.ph = 'drop'; H.dz = P.z; A() && A().local('tug', .8); }
        else { const C = HK(); P.x = u.x + H.ox; P.y = u.y + H.oy; P.z = H.hz - C.hang - P.eye + Math.sin(P.time * 1.7) * .15; P.vx = P.vy = P.vz = 0; P.grounded = false; P.shake = Math.max(P.shake, .05); return true; }
      }
      const fl = F.floorAt(P.x, P.y); P.vx = P.vy = 0; P.vz = -HK().drop; P.z = Math.max(fl, P.z - HK().drop * dt); P.grounded = false;
      if (P.z <= fl + .01) { P.z = fl; P.vz = 0; P.grounded = true; finish(); return false; }
      return true;
    }
    if (H.ph === 'fly') {   // kepala kait melesat ke titik kait; pemain masih bisa bergerak
      const dx = H.ax - H.hx, dy = H.ay - H.hy, dz = H.az - H.hz, d = Math.hypot(dx, dy, dz), s = C.spd * dt;
      if (d <= s) {
        H.hx = H.ax; H.hy = H.ay; H.hz = H.az; H.ph = 'pull'; H.p0 = H.t; A() && A().local('tap', 1); P.shake = Math.min(1, P.shake + .25); F.sparks && F.sparks(H.ax, H.ay, H.az, 5);
        if (H.mode === 'tag') { H.ph = 'tag'; H.tg0 = P.time; F.msg(TK.t('f_hook_tag'), 'g'); return false; }
      }
      else { H.hx += dx / d * s; H.hy += dy / d * s; H.hz += dz / d * s; }
      if (H.t > 1.5) { P.hook = null; if (P.eq === 'hook' && F.eqSet) F.eqSet(null); return false; }
      P.vx = P.vy = 0; if (!P.grounded) { P.vz -= 20 * dt; P.z = Math.max(F.floorAt(P.x, P.y), P.z + P.vz * dt); if (P.z <= F.floorAt(P.x, P.y) + .01) { P.vz = 0; P.grounded = true; } }
      return true;   // kepala kait melesat: pemain menahan posisi (kaki tertanam, tangan menahan sentakan)
    }
    if (H.ph === 'pull' && F.in.jump && H.t - H.p0 > .25) { hookRelease(); P.vz = Math.max(P.vz, 4); return false; }
    if (H.ph === 'pull' && H.mode === 'ride') {   // ditarik naik ke perut heli lalu bergelayut
      const C = HK(), u = H.u; if (!u || u.dead) { hookRelease(); return false; }
      const tx = u.x + H.ox, ty = u.y + H.oy, tz = hkZ(u) - C.hang, ex = P.x, ey = P.y, ez = P.z + P.eye, dx = tx - ex, dy = ty - ey, dz = tz - ez, d = Math.hypot(dx, dy, dz);
      H.sp = Math.min(C.pull * 1.3, H.sp + C.acc * dt); const s = H.sp * dt; H.tug -= dt; if (H.tug <= 0) { H.tug = .11; A() && A().local('tug', .9); }
      if (d <= s + .3 || H.t - H.p0 > 6) { H.ph = 'ride'; H.r0 = H.t; F.msg(TK.t('f_hook_ride'), 'g'); if (P.eq === 'hook' && F.eqSet) F.eqSet(null); }
      else { P.x += dx / d * s; P.y += dy / d * s; P.z += dz / d * s; }
      P.vx = P.vy = P.vz = 0; P.grounded = false; return true;
    }
    if (H.ph === 'pull') {   // mata ditarik lurus ke tepi atap (sedikit di bawahnya), makin cepat
      const tz = H.bld ? H.top - .25 : H.top + P.eye + .2, ex = P.x, ey = P.y, ez = P.z + P.eye;
      const dx = H.wx - ex, dy = H.wy - ey, dz = tz - ez, d = Math.hypot(dx, dy, dz);
      H.sp = Math.min(C.pull, H.sp + C.acc * dt); const s = H.sp * dt;
      H.tug -= dt; if (H.tug <= 0) { H.tug = .11; A() && A().local('tug', .9); }
      if (H.t - H.p0 > (H.d0 || 30) / C.pull * 1.7 + 1.6) { hookRelease(); return false; }   // tersangkut (mis. tepi atap miring): tali dilepas, tidak menggantung selamanya
      if (d <= s + .05) { P.x = H.wx; P.y = H.wy; P.z = tz - P.eye; if (H.bld) { H.ph = 'mantle'; H.m0 = H.t; A() && A().local('cover', .8); } else { finish(); return false; } }
      else { P.x += dx / d * s; P.y += dy / d * s; P.z += dz / d * s; P.vx = dx / d * H.sp; P.vy = dy / d * H.sp; P.vz = dz / d * H.sp; }
      P.grounded = false; return true;
    }
    if (H.ph === 'mantle') {   // tangan di tepi atap -> dorong badan naik -> melangkah ke atap
      const k = Math.min(1, (H.t - H.m0) / C.mantle), up = Math.min(1, k / .6), fw = Math.max(0, (k - .45) / .55), e = x => x * x * (3 - 2 * x);
      P.z = (H.top - .25 - P.eye) + (P.eye + .25) * e(up); P.x = H.wx + (H.sx - H.wx) * e(fw); P.y = H.wy + (H.sy - H.wy) * e(fw);
      P.vx = P.vy = P.vz = 0; P.shake = Math.max(P.shake, .08 * (1 - k));
      if (k >= 1) { finish(); return false; }
      return true;
    }
    return false;
  };
  function finish() {
    P.hook = null; P.hookCd = P.time + HK().cd; P.vx = P.vy = P.vz = 0; if (P.eq === 'hook' && F.eqSet) F.eqSet(null);   // sampai di atap: alat disimpan, senjata diangkat lagi
    const f = F.floorAt(P.x, P.y); if (f > P.z - .6) P.z = f; P.grounded = P.z - f < .1; A() && A().local('land', .5);
  }
  F.hookRope = function (cb) {   // tali: dari tangan kiri pemain ke kepala kait (fps-gl)
    const H = P.hook; if (!H || !P.cam) return;
    const c = P.cam, v = F.aimVec(c.yaw, c.pitch), rx = -Math.sin(c.yaw), ry = Math.cos(c.yaw);
    const up = [-Math.sin(c.pitch) * Math.cos(c.yaw), -Math.sin(c.pitch) * Math.sin(c.yaw), Math.cos(c.pitch)], k = H.ph === 'mantle' ? -.6 : -.1;
    const M = H.ph !== 'mantle' && TK.fpsvm && TK.fpsvm.hkMuz, fw = M ? M[2] : .62, rt = M ? M[0] : .1, uk = M ? M[1] : k;   // moncong peluncur di lengan kanan (ruang kamera dari viewmodel)
    cb(c.x + v[0] * fw + rx * rt + up[0] * uk, c.y + v[1] * fw + ry * rt + up[1] * uk, c.z + v[2] * fw + up[2] * uk, H.hx, H.hy, H.hz);
  };

  /* ---------- kehidupan markas: prajurit kosmetik (bukan unit simulasi — tidak bisa ditembak, tidak ikut bertempur) ----------
     satu regu lari pagi berbaris dua memutari HQ, prajurit yang berjalan antara tenda / pool kendaraan / helipad / gudang lalu berhenti
     sejenak, dan pasangan yang berdiri mengobrol. Hanya hidup saat operator berada di dekat markas. */
  const CR = F.crowd = [], CRS = { w: null };
  const POI = [[-16, 0], [-58, -34], [-58, -52], [36, -38], [46, -38], [-34, 30], [52, 30], [-24, -44], [18, 27], [-22, 6], [10, -22], [28, -20]];
  const vehNear = (x, y, r) => (F.vehs || []).some(V => Math.hypot(V.x - x, V.y - y) < r + 2) || (P.heli && Math.hypot(P.heli.x - x, P.heli.y - y) < r + 4);
  function crowdTick(dt) {
    const hq = Q.hqB, C = F.CROWD;
    if (!hq || CRS.w !== F.world || Math.hypot(P.x - hq.x, P.y - hq.y) > C.r) { CR.length = 0; CRS.w = F.world; return; }
    const at = (dx, dy) => [hq.x + dx, hq.y + dy];
    if (!CR.length) {
      let id = 1e6;
      const mk = (o) => { const u = Object.assign({ type: 'INF', team: 'B', id: id++, hdg: 0, face: 0, stance: 'MOVE', kit: 'RIF', chute: 0, crowd: true, x: hq.x, y: hq.y }, o); CR.push(u); return u; };
      for (let i = 0; i < C.jog; i++) mk({ job: 'jog', k: i, type: i === 0 ? 'SF' : 'INF' });
      for (let i = 0; i < C.walk; i++) { const p = at(...POI[(i * 5) % POI.length]); mk({ job: 'walk', x: p[0] + rand(-2, 2), y: p[1] + rand(-2, 2), wt: rand(0, 4), tg: null }); }
      for (const [dx, dy, a] of [[-56, -43, 0], [-53.6, -43, Math.PI], [-12, 8, -1.2], [-11, 6, 1.9], [44, -32, 2.6], [42.2, -33.2, -.5]]) { const p = at(dx, dy); mk({ job: 'talk', x: p[0], y: p[1], hdg: a, face: a, stance: 'MOVE' }); }
    }
    const T = P.time;
    for (const u of CR) {
      if (u.job === 'jog') {   // berbaris dua, berlari memutari HQ searah jarum jam
        const r = C.ring + (u.k % 2) * 1.6, a = -T * C.jogV / C.ring - Math.floor(u.k / 2) * 1.9 / C.ring, x = hq.x + Math.cos(a) * r, y = hq.y + Math.sin(a) * r;
        u.hdg = u.face = a - Math.PI / 2; u.x = x; u.y = y; u.hide = vehNear(x, y, 3);   // regu lari melewati kendaraan parkir: yang tertutup badan kendaraan tidak digambar
      } else if (u.job === 'walk') {
        if (!u.tg) { u.wt -= dt; if (u.wt <= 0) { const p = at(...POI[Math.floor(Math.random() * POI.length)]); u.tg = [p[0] + rand(-2.5, 2.5), p[1] + rand(-2.5, 2.5)]; } continue; }
        const dx = u.tg[0] - u.x, dy = u.tg[1] - u.y, d = Math.hypot(dx, dy), s = C.walkV * dt;
        if (d < s) { u.tg = null; u.wt = rand(3, 9); continue; }
        const nx = u.x + dx / d * s, ny = u.y + dy / d * s;
        if (F.solid(nx, ny) || F.treeNear(nx, ny, .4) || vehNear(nx, ny, 5)) { u.tg = null; u.wt = rand(1, 3); continue; }   // terhalang (gedung, properti, kendaraan): pilih tujuan lain
        u.x = nx; u.y = ny; u.hdg = u.face = Math.atan2(dy, dx);
      } else if (u.job === 'talk') u.face = u.hdg + Math.sin(T * .7 + u.id) * .25;   // menoleh sesekali
    }
  }

  /* ---------- bos akhir PROFESIONAL: hujan artileri (ditandai asap merah ±3 dtk sebelum peluru jatuh) ----------
     sasaran dipilih acak berbobot: gerombolan pasukan darat kita (makin padat makin menarik) ATAU operator — operator hanya bila bos
     benar-benar tahu posisinya (F.knows: terlihat / terdengar / baru menembaknya; perk SHADOW membuatnya sulit ditemukan) */
  const FB = F.fbBar = { t: 14, s: null };
  function fbPick(f, C) {
    const cand = [], R2 = C.r * 1.4;
    for (const u of Q.units) {
      if (u.dead || u.team !== 'B' || u.player || u.tc === 'A' || u.inV || u.chute > 0 || u.struct || !UT[u.type]) continue;
      if (Math.abs(u.x - f.x) > C.rng || Math.abs(u.y - f.y) > C.rng || Math.hypot(u.x - f.x, u.y - f.y) > C.rng) continue;
      cand.push(u); if (cand.length > 90) break;
    }
    const opts = cand.map(u => { let n = 1; for (const c of cand) if (c !== u && Math.abs(c.x - u.x) < R2 && Math.abs(c.y - u.y) < R2) n++; return { u, w: Math.pow(n, .4) }; });   // per prajurit: tengah gerombolan lebih mungkin
    const pOK = P.alive && !P.mnt && !P.chute && Math.hypot(f.x - P.x, f.y - P.y) <= C.rng && (P.veh ? true : F.knows(f));
    if (pOK) opts.push({ u: null, w: Math.max(3, opts.reduce((s, o) => s + o.w, 0) * .5) });   // operator ±1/3 peluang bila ada pasukan kawan
    if (!opts.length) return null;
    let r = Math.random() * opts.reduce((s, o) => s + o.w, 0); for (const o of opts) { r -= o.w; if (r <= 0) return o; } return opts[opts.length - 1];
  }
  function fbTick(dt) {
    const f = Q.fb;
    if (!f || f.dead || !P.alive) { FB.s = null; return; }
    const C = F.FBBAR;
    if (!FB.s) {
      FB.t -= dt; if (FB.t > 0) return;
      const o = fbPick(f, C); if (!o) { FB.t = 4; return; }   // tak ada sasaran yang diketahui: coba lagi sebentar lagi
      FB.t = rand(C.every[0], C.every[1]) * (f.bph >= 2 ? .7 : 1);   // fase akhir: lebih sering
      const me = !o.u, x = me ? P.x + P.vx * .6 : o.u.x, y = me ? P.y + P.vy * .6 : o.u.y;
      FB.s = { x, y, t: 0, n: 0, fl: 0, N: C.n + (f.bph || 0) * 2, u: f, me };
      const near = Math.hypot(x - P.x, y - P.y) < C.r + 45;
      F.msg(TK.t(me ? 'w_final_bar' : 'w_final_bar_ally', { u: TK.t('wu_' + f.type) }), 'c'); if (me || near) P.bban = { key: me ? 'w_final_bar' : 'w_final_bar_ally', u: f, t: P.time };
      if (me) { A() && A().local('lock', 1); A() && A().local('quake', .5); } else A() && A().local('warn', near ? .8 : .35);
      return;
    }
    const S = FB.s; S.t += dt; S.fl -= dt;
    if (S.t < C.warn && S.fl <= 0) {   // asap penanda merah melingkari zona sasaran
      S.fl = .16; const gz = F.hAt(S.x, S.y);
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + S.t, x = S.x + Math.cos(a) * C.r, y = S.y + Math.sin(a) * C.r; F.emit('smoke', x, y, F.hAt(x, y) + .3, { vz: rand(2, 4), life: 2.2, s0: 1.2, s1: 4, col: [220, 40, 30], a: .7, drag: .6 }); }
      F.emit('fire', S.x, S.y, gz + .4, { vz: 3, life: .5, s0: 1.6, s1: .6, col: [255, 60, 40], a: 1 });
    }
    while (S.n < S.N && S.t > C.warn + S.n * C.gap) {   // peluru berat jatuh satu per satu di dalam zona
      S.n++; const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * C.r, x = S.x + Math.cos(a) * r, y = S.y + Math.sin(a) * r;
      if (F.inb(x, y)) war.explode(x, y, C.aoe, C.dmg, 'he', S.u && !S.u.dead ? S.u : null);
      P.shake = Math.min(2, P.shake + .5 * clamp(1 - Math.hypot(x - P.x, y - P.y) / 120, 0, 1));
    }
    if (S.t > C.warn + S.N * C.gap + .5) FB.s = null;
  }
  F.lifeTick = function (dt) { if (!on()) return; trafficTick(dt); birdTick(dt); volcTick(dt); crowdTick(dt); fbTick(dt); };
  F.lifeClear = function () { TR.length = 0; BD.length = 0; CR.length = 0; VE.bombs.length = 0; F.entCancel(); P.hook = null; };
})();
