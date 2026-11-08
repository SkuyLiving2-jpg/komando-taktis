/* ============================================================
   KOMANDO TAKTIS — kematian bos sinematik (mode OPERATOR, kesulitan PROFESIONAL)
   Sim warzone sudah menganggap bos mati (kredit, pengumuman, pos bisa direbut). Di 3D bos diganti
   "aktor sekarat" yang memainkan skrip per tipe, lalu meninggalkan bangkai di F.corpses:
     BLIMP    kantong gas terbakar & kempis, hidung menukik, jatuh pelan, terhempas
     GUNSHIP  mesin sayap meledak, berguling makin dalam, spiral menukik, tergelincir terbakar
     NEMESIS  ledakan berantai di sepanjang sayap, panel terlepas, putaran datar, hantaman raksasa
     KRAKEN   menara rotor belakang meledak, rotor mati, heli berputar liar lalu jatuh miring
     ULTIMA   amunisi terbakar menyembur dari palka → meledak, kubah terlempar berputar & jatuh terbalik
     LEVI     ledakan beruntun di lambung, tiang radar roboh, gudang amunisi meledak, kubah terpental
     TITAN    hidrolik peluncur menegak, motor rudal menyala, rudal meledak, peluncur terguling ke belakang
     ZEUS     kapasitor kelebihan beban (busur listrik makin rapat) → implosi biru → rel meriam terlempar
     CMDR     terhuyung → jatuh berlutut → tersungkur ke depan, eksoskeleton memercik
     WARLORD  terhuyung → bertumpu satu lutut, zirah berasap → roboh ke samping → inti daya meledak
   d.u = unit palsu untuk fps-gl: pose {z,yaw,pit,rol} (pit > 0 = hidung naik), bo (tulang terlepas),
   sq (kempis), burnt, rph/rph2/rotK (rotor), ere (peluncur TITAN), die/dk (prajurit)
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, UT = TK.WAR.UT, MD = F.MDL;
  const A = () => TK.fpsaudio;
  const rand = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sm = (t, a, b) => { const k = clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), TAU = Math.PI * 2;
  F.dying = []; F.chunks = []; F.arcs = []; F.dieMark = new Set();
  F.dieReset = () => { F.dying.length = 0; F.chunks.length = 0; F.arcs.length = 0; };

  /* ---------- alat bantu ---------- */
  function rot(d, v) {   // titik lokal badan → dunia (urutan sama dengan fps-gl: rz(yaw)·ry(pit)·rx(rol), kempis sq di sumbu z)
    let x = v[0], y = v[1], z = v[2] * (d.u.sq || 1), c = Math.cos(d.rol), s = Math.sin(d.rol);
    [y, z] = [c * y - s * z, s * y + c * z]; c = Math.cos(d.pit); s = Math.sin(d.pit);
    [x, z] = [c * x - s * z, s * x + c * z]; c = Math.cos(d.yaw); s = Math.sin(d.yaw);
    return [d.x + c * x - s * y, d.y + s * x + c * y, d.z + z];
  }
  const once = (d, k, t) => !d.ev[k] && d.t >= t && (d.ev[k] = 1);
  let EQ = 1;   // anggaran efek aktor yang sedang berjalan (1 = penuh)
  const every = (d, rate, dt) => Math.random() < rate * dt * EQ;
  const fire = (p, s, up) => F.emit('fire', p[0] + rand(-1, 1) * s * .3, p[1] + rand(-1, 1) * s * .3, p[2], { vx: rand(-1, 1) * s * .4, vy: rand(-1, 1) * s * .4, vz: (up || 2) + rand(0, 3), life: rand(.35, .8), s0: s, s1: s * .3, col: [255, rand(100, 170) | 0, 40], a: .8, drag: 1.2 });
  const smoke = (p, s, life, col) => F.emit('smoke', p[0] + rand(-1, 1) * s * .2, p[1] + rand(-1, 1) * s * .2, p[2], { vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(1, 3), life: life || rand(3, 5), s0: s * .5, s1: s * 2, col: col || [36, 34, 32], a: .65, drag: .3 });
  const spark = (p, n, col) => { for (let i = 0; i < n; i++) F.emit('spark', p[0], p[1], p[2], { vx: rand(-7, 7), vy: rand(-7, 7), vz: rand(1, 8), life: rand(.2, .5), s0: .09, s1: .03, col: col || [255, 214, 120], g: 14 }); };
  function blast(p, size, ring) {   // ledakan besar + suara + guncangan; ring = jari-jari cincin kejut
    F.boom3d(p[0], p[1], p[2], EQ < .5 ? size * .6 : size, true); A() && A().boom(p[0], p[1], size);
    if (ring) F.shock.push({ x: p[0], y: p[1], R: ring, t: 0, life: .8 });
  }
  function flash(p, s, col) { F.emit('flash', p[0], p[1], p[2], { life: .18, s0: s * .3, s1: s, col: col || [255, 240, 200] }); }
  function debris(p, n, sp, col, sz, hot) {   // kepingan pelat/badan yang terlempar & memantul (digambar kotak oleh fps-gl)
    const nn = EQ < 1 ? Math.ceil(n * EQ) : n, cap = EQ < 1 ? 70 : 180;
    for (let i = 0; i < nn && F.chunks.length < cap; i++) {
      const a = rand(0, TAU), v = rand(.35, 1) * sp;
      F.chunks.push({ x: p[0], y: p[1], z: p[2], vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(.5, 1.3) * sp, yaw: rand(0, TAU), pit: rand(0, TAU), wy: rand(-9, 9), wp: rand(-9, 9),
        hx: sz * rand(.5, 1.4), hy: sz * rand(.3, 1), hz: sz * rand(.08, .3), col: col || [34, 33, 32], t: 0, life: rand(12, 18), hot: hot ? rand(2, 6) : 0 });
    }
  }
  function arc(a, b) {   // busur listrik zig-zag (ZEUS)
    const pts = [a]; for (let i = 1; i < 6; i++) { const k = i / 6; pts.push([a[0] + (b[0] - a[0]) * k + rand(-.7, .7), a[1] + (b[1] - a[1]) * k + rand(-.7, .7), a[2] + (b[2] - a[2]) * k + rand(-.5, .5)]); }
    pts.push(b); F.arcs.push({ p: pts, t: 0, life: rand(.06, .14) });
  }
  /* bagian terlepas (kubah, rel, peluncur): terbang parabola ke posisi akhir relatif lambung, dengan putaran; to = [dx,dy,dz,yaw,pit,rol] */
  function fling(d, f) {
    const s = clamp((d.t - f.t0) / f.T, 0, 1), o = f.to.map((v, i) => (f.from ? f.from[i] : 0) + (v - (f.from ? f.from[i] : 0)) * s);
    o[2] += 4 * f.H * s * (1 - s);
    if (s >= 1 && !f.down) { f.down = 1; const g = rot(d, [f.p[0] + o[0], f.p[1] + o[1], 0]); g[2] = F.hAt(g[0], g[1]); F.puff(g[0], g[1], g[2] + .3, 10, [120, 108, 90], f.dust || 4); debris(g, 5, 7, null, .5); A() && A().at('thud', g[0], g[1], 1); A() && A().boom(g[0], g[1], 6); P.shake = Math.min(1.6, P.shake + .25); }
    return { b: f.b, p: f.p, o };
  }
  function wreck(d, extra) {   // aktor selesai → bangkai (bertahan lama & terbakar)
    F.corpses.push(Object.assign({ x: d.x, y: d.y, type: d.type, team: d.u.team, face: d.yaw, t: 0, human: 0, life: 160, fire: 35 }, extra || {}));
  }
  /* jatuh bebas pesawat: kecepatan maju, gravitasi, batas laju turun; kembali true saat menyentuh tanah (atau air) */
  function fall(d, dt, g, vmax, clear) {
    d.vz = Math.max(-vmax, d.vz - g * dt); d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    const gz = Math.max(F.hAt(d.x, d.y), F.WZ !== undefined ? F.WZ : -1e9);
    d.u.alt = d.z - F.hAt(d.x, d.y);
    return d.z - clear <= gz;
  }
  const ground = d => Math.max(F.hAt(d.x, d.y), F.WZ !== undefined ? F.WZ : -1e9);

  /* ---------- skrip per tipe: kembali true = selesai (bangkai dibuat di dalam skrip) ---------- */
  const DIE = {
    BLIMP(d, dt) {
      if (once(d, 'a', 0)) { blast(rot(d, [5, 3.5, 3]), 13); blast(rot(d, [-4, -3, 4.5]), 9); A() && A().at('cannon', d.x, d.y, 1); }
      if (once(d, 'b', 2.4)) { const g = rot(d, [1.2, 0, -6.4]); blast(g, 11); debris(g, 7, 12, [56, 58, 60], .9, 1); }
      if (once(d, 'c', 4.6)) blast(rot(d, [-11, 2, 1]), 10);
      const n = 2 + (d.t * 1.5 | 0);   // api menjalar di sepanjang kantong gas
      for (let i = 0; i < n; i++) if (every(d, 9, dt)) { const a = rand(0, TAU), x = rand(-14, Math.min(14, -10 + d.t * 6)); fire(rot(d, [x, Math.cos(a) * 5.2, Math.sin(a) * 5.2]), rand(2.2, 4), 3); }
      if (every(d, 14, dt)) smoke(rot(d, [rand(-12, 8), rand(-4, 4), 4]), 5, rand(5, 8));
      d.u.sq = 1 - .5 * sm(d.t, 1.2, 7.5); d.u.burnt = d.t > 2.4;
      d.pit = -.55 * sm(d.t, .5, 6.5); d.yaw += .1 * dt; d.rol = .12 * Math.sin(d.t * .8);
      d.vx *= 1 - .3 * dt; d.vy *= 1 - .3 * dt;
      if (!fall(d, dt, 2.2, 14, 6 + 6 * d.u.sq)) return false;
      const g = [d.x, d.y, ground(d)]; blast([g[0], g[1], g[2] + 3], 26, 70); blast(rot(d, [12, 0, 0]), 18); debris(g, 14, 16, [56, 58, 60], 1.2, 1);
      for (let i = 0; i < 26; i++) fire([g[0] + rand(-16, 16), g[1] + rand(-16, 16), g[2] + 1], rand(3, 6), 5);
      wreck(d, { dz: 2.2, sq: .3, pp: -.1, rol: .14, fire: 45 }); return true;
    },
    GUNSHIP(d, dt) {
      const eng = [4.6, -10.5, 2.4];
      if (once(d, 'a', 0)) { const p = rot(d, eng); blast(p, 15); debris(p, 8, 14, [70, 72, 70], .8, 1); A() && A().at('cannon', p[0], p[1], 1.2); }
      if (once(d, 'b', 1.7)) blast(rot(d, [-2, -5.4, 2.4]), 10);
      if (once(d, 'w', .3)) A() && A().at('whine', d.x, d.y, 1.4);
      const p = rot(d, eng); fire(p, rand(2.5, 4), 1); if (every(d, 20, dt)) smoke(p, 4.5, rand(4, 7));
      if (d.t > 1.7 && every(d, 10, dt)) smoke(rot(d, [-2, -5.4, 2.4]), 3.5, 5);
      d.yaw += -.28 * dt; const v = Math.hypot(d.vx, d.vy) || 40; d.vx = Math.cos(d.yaw) * v; d.vy = Math.sin(d.yaw) * v;
      d.rol -= (.25 + .32 * d.t) * dt; d.pit = -Math.min(.85, .05 * d.t * d.t + .05);
      if (!fall(d, dt, 9, 70, 3)) return false;
      const g = [d.x, d.y, ground(d)]; blast([g[0], g[1], g[2] + 2], 30, 110); const f = [Math.cos(d.yaw), Math.sin(d.yaw)];
      for (let k = 1; k <= 3; k++) setTimeout(() => blast([g[0] + f[0] * k * 14, g[1] + f[1] * k * 14, F.hAt(g[0] + f[0] * k * 14, g[1] + f[1] * k * 14) + 1.5], 16 - k * 2), k * 160);
      for (let i = 0; i < 40; i++) { const k = rand(0, 50); fire([g[0] + f[0] * k + rand(-5, 5), g[1] + f[1] * k + rand(-5, 5), F.hAt(g[0] + f[0] * k, g[1] + f[1] * k) + 1], rand(3, 6), 4); }
      debris(g, 18, 18, [70, 72, 70], 1.1, 1);
      d.x += f[0] * 22; d.y += f[1] * 22; wreck(d, { dz: .6, pp: -.08, rol: .3 }); return true;
    },
    NEMESIS(d, dt) {
      const chain = [[0, [0, -13, 0], 16], [.5, [-2, 9, 0], 14], [1.05, [-4, -21, 0], 13], [1.6, [2, 4, .4], 16], [2.4, [-5, 23, 0], 12], [3.4, [-3, -6, 0], 11]];
      chain.forEach(([t, lp, s], i) => { if (once(d, 'c' + i, t)) { const p = rot(d, lp); blast(p, s); flash(p, s * .9); debris(p, 6, 16, [26, 27, 30], 2.2, 1); } });
      for (const sd of [-1, 1]) { const p = rot(d, [-6.3, sd * 4.6, .4]); if (d.t > .4) fire(p, rand(2.5, 4.5), 1); if (every(d, 12, dt)) smoke(p, 5, rand(5, 8)); }
      if (d.t > 1 && every(d, 10, dt)) fire(rot(d, [rand(-6, 4), rand(-24, 24), .2]), rand(2, 4), 2);
      d.wy = Math.min(2.3, d.wy + .7 * dt); d.yaw += d.wy * dt; d.vx *= 1 - .45 * dt; d.vy *= 1 - .45 * dt;
      d.pit = -.12 + .08 * Math.sin(d.t * 2.3); d.rol = (T => .35 * Math.sin(T * 1.7))(d.t);
      if (!fall(d, dt, 7, 48, 3)) return false;
      const g = [d.x, d.y, ground(d)]; blast([g[0], g[1], g[2] + 2], 30, 160);
      for (let i = 0; i < 4; i++) { const p = rot(d, [rand(-6, 8), rand(-22, 22), 0]); p[2] = F.hAt(p[0], p[1]) + 1.5; blast(p, rand(16, 24)); }
      F.shock.push({ x: g[0], y: g[1], R: 240, t: 0, life: 1.4 }); debris(g, 22, 22, [26, 27, 30], 1.6, 1);
      wreck(d, { dz: .3, pp: 0, rol: .05, fire: 50 }); return true;
    },
    KRAKEN(d, dt) {
      const RR = MD.KRAKEN.rot;
      if (once(d, 'a', 0)) { const p = rot(d, [-RR, 0, 6]); blast(p, 13); debris(p, 6, 14, [30, 30, 32], 1.6, 0); A() && A().at('whine', d.x, d.y, 1.2); }
      if (once(d, 'b', 2.1)) blast(rot(d, [4, 2.4, 1]), 9);
      const w2 = 31 * (1 - sm(d.t, 0, 1.1)), w1 = 31 * (1 - .35 * sm(d.t, 1, 4));
      d.u.rph = (d.u.rph || 0) + w1 * dt; d.u.rph2 = (d.u.rph2 || 0) + w2 * dt; d.u.rotK = w1 / 31;
      const p = rot(d, [-RR - 1, 0, 4.5]); fire(p, rand(2, 3.5), 1); if (every(d, 16, dt)) smoke(p, 4, rand(4, 6));
      if (every(d, 6, dt)) spark(rot(d, [-RR, 0, 6.5]), 4);
      d.wy = Math.min(3.4, d.wy + 2.2 * dt); d.yaw += d.wy * dt;
      d.pit = -.22 * sm(d.t, 0, 2) + .06 * Math.sin(d.t * 3); d.rol = .28 * Math.sin(d.t * 2.1) + .5 * sm(d.t, 2.5, 5);
      if (!fall(d, dt, 3.4, 17, 1.2)) return false;
      const g = [d.x, d.y, ground(d)]; blast([g[0], g[1], g[2] + 2], 24, 80); blast(rot(d, [10, 0, 1]), 15); debris(g, 12, 15, [30, 30, 32], 1.6, 1);
      wreck(d, { dz: 1.9, pp: -.06, rol: 1.3, rph: d.u.rph % TAU, rph2: .7 }); return true;
    },
    ULTIMA(d, dt) {
      const piv = [-.3, 0, 2.4], tur = d.tur || (d.tur = { b: [1, 2], p: piv, t0: 1.35, T: 2.3, H: 15, from: [0, 0, 0, d.ty0, 0, 0], to: [-1.5, d.side * 8, -1.05, d.ty0 + .9, .12, d.side * (TAU + 2.9)] });
      if (once(d, 'a', 0)) { spark(rot(d, [0, 0, 2.6]), 14); A() && A().at('cannon', d.x, d.y, 1); }
      if (d.t < 1.35) {   // amunisi terbakar: semburan api tegak dari palka kubah & mesin
        for (const lp of [[-.9, .9, 3.6], [-.4, -1.15, 3.6], [-4.6, 0, 2]]) for (let j = 0; j < 2; j++) { const p = rot(d, lp); F.emit('fire', p[0], p[1], p[2], { vx: rand(-1.5, 1.5), vy: rand(-1.5, 1.5), vz: rand(12, 24) * sm(d.t, 0, .35), life: rand(.35, .7), s0: rand(1.8, 2.8), s1: .6, col: [255, rand(150, 210) | 0, 70], a: .9, drag: .6 }); }
        if (every(d, 12, dt)) smoke(rot(d, [-4, 0, 2]), 2.5);
      }
      if (once(d, 'b', .5)) blast(rot(d, [-4.5, 0, 1.6]), 6);
      if (once(d, 'c', 1.35)) {   // ledakan dahsyat: kubah terlempar, lambung berkeping-keping
        const p = rot(d, [0, 0, 2.5]); blast(p, 24, 60); flash(p, 12); blast(rot(d, [-3, 1.5, 1.4]), 14);
        debris(p, 22, 20, [40, 40, 38], .8, 1); debris(p, 8, 12, [74, 78, 84], 1.4, 0); P.shake = Math.min(1.6, P.shake + .5);
      }
      d.u.burnt = d.t > 1.35;
      if (d.t >= 1.35) d.u.bo = [fling(d, tur)];
      if (d.t > 1.35 && every(d, 10, dt)) fire(rot(d, [rand(-3, 3), rand(-1.5, 1.5), 2.2]), rand(1.5, 3), 3);
      if (d.t < 4.6) return false;
      wreck(d, { bo: d.u.bo, fire: 45 }); return true;
    },
    LEVI(d, dt) {
      const T0 = MD.LEVI.tur;
      if (!d.pts) d.pts = [0, .45, .85, 1.3, 1.75, 2.2, 2.6, 3.1, 3.5].map(t => [t, [rand(-11, 11), rand(-5, 5), rand(4, 7)]]);
      d.pts.forEach(([t, lp], i) => { if (once(d, 'p' + i, t)) { const p = rot(d, lp); blast(p, rand(9, 13)); debris(p, 4, 14, [64, 66, 72], 1, 1); } });
      if (d.t > .3) for (let i = 0; i < 2; i++) if (every(d, 8, dt)) fire(rot(d, [rand(-11, 11), rand(-5, 5), 5.8]), rand(2, 4), 4);
      if (every(d, 8, dt)) smoke(rot(d, [rand(-10, 10), rand(-4, 4), 7]), 6, rand(5, 8));
      const mast = sm(d.t, 1, 2.1), bo = [{ b: [4], p: [-.7, 0, 10.8], o: [0, 0, -.3 * mast, 0, 0, d.side * 1.5 * mast * mast] }];   // tiang radar roboh
      if (once(d, 'm', 2.1)) { const p = rot(d, [-.7, d.side * 6, 7]); F.puff(p[0], p[1], p[2], 8, [110, 100, 90], 3); A() && A().at('thud', p[0], p[1], 1); }
      const tur = d.tur || (d.tur = { b: [1, 2], p: [T0, 0, 6.5], t0: 4.2, T: 3, H: 26, from: [0, 0, 0, d.ty0, 0, 0], to: [3, d.side * 14, -3.4, d.ty0 + .7, .1, d.side * 1.45] });
      if (once(d, 'x', 4.2)) {   // gudang amunisi utama meledak
        const p = rot(d, [T0, 0, 7]); blast(p, 30, 190); flash(p, 24); blast(rot(d, [-5, 0, 6]), 26); blast(rot(d, [8, -3, 5]), 20);
        F.shock.push({ x: p[0], y: p[1], R: 300, t: 0, life: 1.6 }); debris(p, 30, 24, [64, 66, 72], 1.6, 1); P.shake = Math.min(2, P.shake + 1);
      }
      if (d.t > 4.2 && d.t < 10) for (let i = 0; i < 2; i++) F.emit('smoke', d.x + rand(-6, 6), d.y + rand(-6, 6), d.z + 8 + (d.t - 4.2) * 12, { vz: rand(14, 22), vx: rand(-2, 2), vy: rand(-2, 2), life: rand(6, 9), s0: 8, s1: 26, col: [70, 62, 56], a: .7, drag: .1 });   // kolom asap jamur
      if (d.t >= 4.2) bo.push(fling(d, tur));
      d.u.bo = bo; d.u.burnt = d.t > 4.2;
      if (d.t < 7.6) return false;
      wreck(d, { bo, fire: 60, life: 220 }); return true;
    },
    BEHEMOTH(d, dt) {   // mesin terbakar → amunisi mortir roket di kasemat meledak beruntun → kasemat terlempar, bilah dozer jatuh
      const T0 = MD.BEH.tur, tur = d.tur || (d.tur = { b: [1, 2], p: [T0, 0, 4.4], t0: 2.2, T: 2.6, H: 18, from: [0, 0, 0, d.ty0, 0, 0], to: [-3, d.side * 10, -3.2, d.ty0 + 1.1, .18, d.side * (TAU + 2.7)] });
      if (once(d, 'a', 0)) { blast(rot(d, [-7, 0, 4]), 9); A() && A().at('cannon', d.x, d.y, 1.1); }
      if (d.t < 2.2) {   // cerobong & palka menyemburkan api
        for (const lp of [[-6.6, 2.6, 6.8], [-6.6, -2.6, 6.8], [T0 - 1.6, 1.7, 7.8]]) { const p = rot(d, lp); F.emit('fire', p[0], p[1], p[2], { vx: rand(-1.5, 1.5), vy: rand(-1.5, 1.5), vz: rand(10, 20) * sm(d.t, 0, .4), life: rand(.35, .7), s0: rand(1.6, 2.6), s1: .6, col: [255, rand(140, 200) | 0, 60], a: .9, drag: .6 }); }
        if (every(d, 14, dt)) smoke(rot(d, [-6, 0, 6]), 4);
      }
      for (const [t, lp] of [[.7, [T0 + 2, 1.5, 6]], [1.2, [T0 - 1, -2, 6.5]], [1.7, [3, 2.5, 3.5]]]) if (once(d, 'p' + t, t)) { const p = rot(d, lp); blast(p, 9); debris(p, 5, 12, [64, 66, 72], .8, 1); }
      if (once(d, 'x', 2.2)) { const p = rot(d, [T0, 0, 5.5]); blast(p, 28, 120); flash(p, 18); blast(rot(d, [4, 0, 3]), 16); debris(p, 22, 22, [64, 66, 72], 1.2, 1); P.shake = Math.min(1.8, P.shake + .7); }
      d.u.burnt = d.t > 2.2; if (d.t >= 2.2) d.u.bo = [fling(d, tur)];
      if (d.t > 2.2 && every(d, 12, dt)) fire(rot(d, [rand(-7, 7), rand(-3, 3), 4]), rand(2, 3.5), 3);
      if (d.t < 5.6) return false;
      wreck(d, { bo: d.u.bo, fire: 55 }); return true;
    },
    TEMPEST(d, dt) {   // roket di kotak peluncur terbakar: roket menyembur liar ke segala arah, lalu kotak peluncur meledak & terlempar
      const G = MD.TEM.gp, box = () => rot(d, [G[0] + rand(1, 6.5), rand(-1.4, 1.4), G[2] + rand(.5, 2.5)]);
      const tur = d.tur || (d.tur = { b: [1, 2], p: [MD.TEM.tur, 0, 3], t0: 3, T: 2.2, H: 16, from: [0, 0, 0, d.ty0, 0, 0], to: [-6, d.side * 9, -2.5, d.ty0 + 1.4, -.3, d.side * 2.6] });
      if (once(d, 'a', 0)) { const p = rot(d, [8, 0, 3]); blast(p, 8); A() && A().at('rocket', d.x, d.y, 1.4); }
      if (d.t < 3 && every(d, 6 + d.t * 4, dt)) {   // roket lepas kendali: jejak api + asap melesat keluar
        const p = box(), a = rand(0, TAU), up = rand(.2, 1);
        for (let i = 0; i < 6; i++) F.emit('fire', p[0], p[1], p[2], { vx: Math.cos(a) * rand(30, 60), vy: Math.sin(a) * rand(30, 60), vz: up * rand(20, 45), life: rand(.4, .9), s0: 1.2, s1: .3, col: [255, 210, 120], a: .95, drag: .2 });
        F.emit('smoke', p[0], p[1], p[2], { vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, vz: up * 10, life: rand(2, 3.5), s0: 1.2, s1: 5, col: [210, 206, 198], a: .55, drag: .6 });
        if (Math.random() < .35) { const q = [p[0] + Math.cos(a) * rand(40, 140), p[1] + Math.sin(a) * rand(40, 140), 0]; q[2] = F.hAt(q[0], q[1]) + 1; blast(q, rand(6, 10)); }
        A() && A().at('rocket', d.x, d.y, .8);
      }
      if (once(d, 'x', 3)) { const p = rot(d, [G[0] + 3, 0, G[2] + 1.5]); blast(p, 26, 130); flash(p, 18); blast(rot(d, [7, 0, 3]), 14); debris(p, 20, 20, [60, 64, 58], 1.1, 1); P.shake = Math.min(1.6, P.shake + .6); }
      d.u.burnt = d.t > 3; if (d.t >= 3) d.u.bo = [fling(d, tur)];
      if (d.t > 3 && every(d, 12, dt)) fire(rot(d, [rand(-9, 9), rand(-1.5, 1.5), 2.5]), rand(2, 3.5), 3);
      if (d.t < 6) return false;
      wreck(d, { bo: d.u.bo, fire: 50 }); return true;
    },
    WYVERN(d, dt) {   // nasel kanan meledak, rotornya mati, pesawat berguling ke sisi mati & berputar jatuh
      const W0 = MD.WYV;
      if (once(d, 'a', 0)) { const p = rot(d, [W0.rx, -W0.ry, W0.rz - 1]); blast(p, 13); debris(p, 6, 14, [30, 30, 32], 1.4, 0); A() && A().at('whine', d.x, d.y, 1.2); }
      if (once(d, 'b', 1.9)) blast(rot(d, [-4, 1.5, 2]), 9);
      const w2 = 31 * (1 - sm(d.t, 0, 1)), w1 = 31 * (1 - .3 * sm(d.t, 1, 4));
      d.u.rph = (d.u.rph || 0) + w1 * dt; d.u.rph2 = (d.u.rph2 || 0) + w2 * dt; d.u.rotK = w1 / 31;
      const p = rot(d, [W0.rx, -W0.ry, W0.rz - 1.5]); fire(p, rand(2, 3.5), 1); if (every(d, 16, dt)) smoke(p, 4, rand(4, 6));
      d.wy = Math.min(2.8, d.wy + 1.8 * dt); d.yaw += d.wy * dt;
      d.pit = -.18 * sm(d.t, 0, 2) + .05 * Math.sin(d.t * 3); d.rol = -.3 * sm(d.t, 0, 1.5) - .55 * sm(d.t, 2, 5);
      if (!fall(d, dt, 3.6, 18, 1.2)) return false;
      const g = [d.x, d.y, ground(d)]; blast([g[0], g[1], g[2] + 2], 24, 90); blast(rot(d, [8, 0, 1]), 14); debris(g, 12, 15, [30, 30, 32], 1.5, 1);
      wreck(d, { dz: 1.6, pp: -.05, rol: -1.2, rph: d.u.rph % TAU, rph2: .4 }); return true;
    },
    TITAN(d, dt) {
      const pv = MD.TITAN.pv, e0 = d.e0 !== undefined ? d.e0 : (d.e0 = d.u.ere || 0), tube = k => rot(d, [pv[0] + Math.cos(d.u.ere) * k, 0, pv[2] + Math.sin(d.u.ere) * k]);
      if (once(d, 'a', 0)) { blast(rot(d, [10, 1.6, 3]), 10); blast(rot(d, [10, -1.6, 3]), 8); }
      if (d.t < 3.4) d.u.ere = e0 + (1.35 - e0) * sm(d.t, .2, 1.6) + (d.t > 1.6 ? .03 * Math.sin(d.t * 60) : 0);   // hidrolik rusak: peluncur menegak & bergetar
      else d.u.ere = 1.35 + (3.02 - 1.35) * Math.pow(clamp((d.t - 3.4) / 1.25, 0, 1), 2);   // terguling ke belakang (dipercepat gravitasi)
      if (once(d, 'i', 1.6)) { A() && A().at('rocket', d.x, d.y, 1.6); }
      if (d.t > 1.6 && d.t < 3.4) {   // motor rudal menyala di dalam tabung: semburan api ke bawah dari ekor tabung
        const p = tube(.3); for (let i = 0; i < 3; i++) F.emit('fire', p[0], p[1], p[2], { vx: rand(-4, 4), vy: rand(-4, 4), vz: rand(-14, -6), life: rand(.3, .6), s0: rand(1.8, 3), s1: 1, col: [255, rand(170, 230) | 0, 90], a: .95, drag: .8 });
        if (every(d, 25, dt)) F.emit('smoke', p[0], p[1], p[2], { vx: rand(-9, 9), vy: rand(-9, 9), vz: rand(-1, 3), life: rand(2, 4), s0: 2, s1: 8, col: [200, 196, 188], a: .6, drag: 1 });
      }
      if (once(d, 'x', 3.4)) { const p = tube(10); blast(p, 30, 150); flash(p, 20); blast(tube(16), 20); blast(rot(d, [8, 0, 3]), 16); debris(p, 24, 22, [70, 76, 66], 1.3, 1); }
      if (once(d, 'g', 4.65)) { const p = rot(d, [-24, 0, 0]); p[2] = F.hAt(p[0], p[1]); F.puff(p[0], p[1], p[2] + .5, 14, [120, 108, 90], 6); A() && A().at('thud', p[0], p[1], 1.4); A() && A().boom(p[0], p[1], 8); P.shake = Math.min(1.6, P.shake + .4); }
      d.u.burnt = d.t > 3.4;
      if (d.t > 3.4 && every(d, 12, dt)) fire(rot(d, [rand(-9, 10), rand(-1.5, 1.5), 2.5]), rand(2, 3.5), 3);
      if (d.t < 6.2) return false;
      wreck(d, { ere: d.u.ere, fire: 50 }); return true;
    },
    ZEUS(d, dt) {
      const T0 = MD.ZEUS.tur, cap = () => rot(d, [-8 + rand(0, 4), rand(-2, 2), 5.2]), coil = () => rot(d, [T0 + rand(4, 17), rand(-.9, .9), 5.1 + rand(-.9, .9)]);
      if (d.t < 2.6) {   // kelebihan beban: busur listrik makin rapat di bank kapasitor & kumparan, kubah berkedut
        const k = .3 + d.t / 2.6;
        if (every(d, 18 * k, dt)) arc(cap(), cap()); if (every(d, 14 * k, dt)) arc(coil(), coil()); if (every(d, 8 * k, dt)) arc(cap(), coil());
        if (every(d, 10 * k, dt)) spark(Math.random() < .5 ? cap() : coil(), 5, [150, 220, 255]);
        if (every(d, 7 * k, dt)) A() && A().at('zap', d.x, d.y, .9);
        d.u.bo = [{ b: [1, 2], p: [T0, 0, 4], o: [0, 0, 0, d.ty0 + rand(-.04, .04) * k, rand(-.02, .02) * k, 0] }];
      }
      if (once(d, 'i', 2.6)) { const p = rot(d, [T0, 0, 5]); F.emit('flash', p[0], p[1], p[2], { life: .35, s0: 45, s1: 4, col: [150, 220, 255] }); F.shock.push({ x: p[0], y: p[1], R: 40, t: 0, life: .3, col: [150, 220, 255], w: 2 }); A() && A().at('zap', p[0], p[1], 1.5); }
      const rail = d.rail || (d.rail = { b: [2], p: [T0 + 10.5, 0, 5.1], t0: 2.85, T: 2, H: 12, from: [0, 0, 0, d.ty0, 0, 0], to: [9, d.side * 4, -4.7, d.ty0 + d.side * .6, -TAU - .05, d.side * .2] });
      const tur = d.tur || (d.tur = { b: [1], p: [T0, 0, 4], t0: 2.85, T: 1.1, H: 3, from: [0, 0, 0, d.ty0, 0, 0], to: [0, 0, -.2, d.ty0 + .5, -.12, d.side * .22], dust: 3 });
      if (once(d, 'x', 2.85)) {
        const p = rot(d, [T0, 0, 5]); blast(p, 28, 120); F.shock.push({ x: p[0], y: p[1], R: 160, t: 0, life: 1, col: [150, 220, 255], w: 3 }); flash(p, 20, [190, 235, 255]);
        blast(rot(d, [-6, 0, 4.5]), 18); debris(p, 18, 20, [46, 48, 54], 1.1, 1); for (let i = 0; i < 10; i++) arc(p, [p[0] + rand(-14, 14), p[1] + rand(-14, 14), p[2] + rand(-4, 8)]);
      }
      if (d.t >= 2.85) d.u.bo = [fling(d, tur), fling(d, rail)];
      if (d.t > 2.85 && d.t < 4.5 && every(d, 10, dt)) arc(cap(), cap());
      d.u.burnt = d.t > 2.85;
      if (d.t > 2.85 && every(d, 10, dt)) fire(rot(d, [rand(-8, 6), rand(-3, 3), 3.6]), rand(1.8, 3), 3);
      if (d.t < 5.4) return false;
      wreck(d, { bo: d.u.bo, fire: 45 }); return true;
    },
    CMDR(d, dt) {   // pose di MD.humanDie ('fwd'); efek: percikan paket daya, debu saat menghantam tanah
      const hs = UT.CMDR.hs || 1, back = () => rot(d, [-.33 * hs, 0, (d.t < 1.3 ? 1.3 : d.t < 2 ? .9 : .35) * hs]);
      if (once(d, 'a', 0)) { spark(rot(d, [0, 0, 1.4 * hs]), 10); A() && A().at('thud', d.x, d.y, .8); }
      if (every(d, d.t < 2.6 ? 7 : 2, dt)) spark(back(), 4, [255, 120, 80]);
      if (d.t > .6 && every(d, 5, dt)) smoke(back(), .6, 2, [60, 60, 62]);
      if (once(d, 'k', 1.1)) { F.puff(d.x, d.y, d.z + .2, 4, [140, 126, 100], 1); A() && A().at('thud', d.x, d.y, .7); }
      if (once(d, 'g', 2.05)) { const p = rot(d, [1.1 * hs, 0, .2]); F.puff(p[0], p[1], p[2], 9, [140, 126, 100], 1.6); A() && A().at('thud', p[0], p[1], 1.2); spark(back(), 12, [255, 120, 80]); }
      d.u.dk = d.t; if (d.t < 3.4) return false;
      wreck(d, { die: 'fwd', dk: 99, human: 1, life: 120, fire: 0, side: d.side }); return true;
    },
    CLAY(d, dt) {   // pose 'fwd': terhuyung, jetpack tersendat menyembur liar & memercik → tersungkur → tangki jetpack meledak
      const hs = UT.CLAY.hs || 1, pack = () => rot(d, [-.35 * hs, 0, (d.t < 1.3 ? 1.1 : d.t < 2 ? .8 : .35) * hs]);
      if (d.u.alt > 0) {   // tertembak di udara: jatuh dengan jet menyala liar, baru skrip tewas berjalan
        d.t = 0; d.fall = (d.fall || 0) + 26 * dt; d.u.alt = Math.max(0, d.u.alt - d.fall * dt); d.z = F.hAt(d.x, d.y) + d.u.alt;
        if (every(d, 18, dt)) { const p = pack(); fire(p, .8, -3); smoke(p, .9, 2, [56, 56, 58]); }
        if (d.u.alt <= 0) { F.puff(d.x, d.y, d.z + .2, 14, [140, 126, 100], 2.2); A() && A().at('thud', d.x, d.y, 1.4); P.shake = Math.min(1.6, P.shake + .25); }
        return false;
      }
      if (once(d, 'a', 0)) { spark(rot(d, [0, 0, 1.4 * hs]), 12, [255, 90, 60]); A() && A().at('zap', d.x, d.y, .9); }
      if (d.t < 2 && every(d, 14, dt)) fire(pack(), .5, -4);
      if (every(d, d.t < 2.6 ? 8 : 3, dt)) spark(pack(), 4, [255, 160, 80]);
      if (d.t > .5 && every(d, 6, dt)) smoke(pack(), .7, 2, [56, 56, 58]);
      if (once(d, 'k', 1.1)) { F.puff(d.x, d.y, d.z + .2, 4, [140, 126, 100], 1); A() && A().at('thud', d.x, d.y, .7); }
      if (once(d, 'g', 2.05)) { const p = rot(d, [1.1 * hs, 0, .2]); F.puff(p[0], p[1], p[2], 9, [140, 126, 100], 1.6); A() && A().at('thud', p[0], p[1], 1.2); }
      if (once(d, 'x', 3)) { const p = pack(); blast(p, 6, 18); flash(p, 10, [255, 150, 70]); debris(p, 6, 9, [56, 58, 62], .2, 1); }
      d.u.dk = d.t; if (d.t < 3.6) return false;
      wreck(d, { die: 'fwd', dk: 99, human: 1, life: 120, fire: 8, side: d.side }); return true;
    },
    WARLORD(d, dt) {   // pose di MD.humanDie ('knee'); zirah berasap & memercik, roboh, inti daya di dada meledak
      const hs = UT.WARLORD.hs || 1, core = () => rot(d, [.25 * hs, 0, (d.t < 3.3 ? 1.2 : .45) * hs]);
      if (once(d, 'a', 0)) { spark(core(), 14); A() && A().at('cannon', d.x, d.y, .7); }
      if (every(d, 6, dt)) spark(core(), 4, [255, 80, 60]);
      if (d.t > .5 && every(d, 9, dt)) smoke(rot(d, [-.3 * hs, 0, 1.5 * hs]), .9, 3, [50, 50, 52]);
      if (once(d, 'k', 1.2)) { F.puff(d.x, d.y, d.z + .2, 6, [140, 126, 100], 1.4); A() && A().at('thud', d.x, d.y, 1); P.shake = Math.min(1.6, P.shake + .12); }
      if (once(d, 'm', .85)) A() && A().at('thud', d.x, d.y, .8);   // minigun jatuh
      if (once(d, 'g', 4.1)) { const p = rot(d, [0, -d.side * 1.2 * hs, .2]); F.puff(p[0], p[1], p[2], 12, [140, 126, 100], 2.2); A() && A().at('thud', p[0], p[1], 1.5); P.shake = Math.min(1.6, P.shake + .25); }
      if (d.t > 4.1 && d.t < 4.9 && every(d, 12, dt)) { const p = core(); F.emit('flash', p[0], p[1], p[2], { life: .08, s0: .6, s1: 1.4, col: [255, 60, 40] }); }
      if (once(d, 'x', 4.9)) { const p = core(); blast(p, 8, 24); flash(p, 14, [255, 90, 60]); debris(p, 8, 10, [38, 38, 42], .25, 1); }
      d.u.dk = d.t; if (d.t < 5.6) return false;
      wreck(d, { die: 'knee', dk: 99, human: 1, life: 120, fire: 12, side: d.side }); return true;
    }
  };

  /* ============================================================
     KEHANCURAN UNIT BIASA (bukan bos): semua pasukan udara, darat, laut punya animasi hancur lalu bangkai 5 detik yang tenggelam ke tanah.
       rot  heli: mesin meledak, berputar, jatuh berasap, menghantam, bangkai
       jet  pesawat: mesin terbakar, berguling menukik, menghantam, tergelincir, bangkai
       veh  kendaraan berkubah: ledakan amunisi, lambung terlonjak, kubah terlempar, bangkai
       trk  kendaraan ringan: terlempar & terguling, bangkai
       sea  kapal: ledakan beruntun, miring, tenggelam
     ============================================================ */
  const WRECK = 5;
  F.dieK = { HELI: 'rot', MEDHELI: 'rot', ATK2: 'rot', AH64: 'rot', VTOL: 'rot', UAV: 'jet', UCAV: 'jet', FGT: 'jet', CAS: 'jet', BMB: 'jet', UFO: 'jet', TANK: 'veh', LTANK: 'veh', MBT: 'veh', IFV: 'veh', APC: 'veh', ARTY: 'veh', ZSU: 'veh', AA: 'veh', MLRS: 'trk', REPAIR: 'trk', JEEP: 'trk', HMV: 'trk', SHIP: 'sea', GBOAT: 'sea' };
  const near = d => Math.hypot(d.x - P.x, d.y - P.y);
  const jolt = (d, k, rng) => { const nd = near(d); if (nd < rng) P.shake = Math.min(1.6, P.shake + k * (1 - nd / rng)); };
  const scar = (x, y, r) => { for (let i = 0; i < 2; i++) F.scorch.push({ x: x + rand(-r, r) * .5, y: y + rand(-r, r) * .5, r: rand(r * .7, r), t: 0, life: WRECK + 1 }); };
  const KND = {
    rot(d, dt) {
      const sz = d.sz;
      if (once(d, 'a', 0)) { const p = rot(d, [-2.4 * sz, 0, 1.4 * sz]); blast(p, 5 * sz); debris(p, 5, 11, [38, 40, 38], .5 * sz, 1); A() && A().at('whine', d.x, d.y, 1); d.spin = d.side; }
      if (!d.gd) {
        const w = 31 * (1 - .4 * sm(d.t, .2, 3)); d.u.rph = (d.u.rph || 0) + w * dt; d.u.rotK = w / 31;
        const e = rot(d, [-1.6 * sz, 0, 1.3 * sz]); if (every(d, 34, dt)) fire(e, rand(.9, 1.7) * sz, 1); if (every(d, 24, dt)) smoke(e, 1.8 * sz, rand(2.5, 4), [28, 28, 28]); if (every(d, 7, dt)) spark(e, 3);
        d.wy += (d.spin * 3.3 - d.wy) * Math.min(1, dt * 1.2); d.yaw += d.wy * dt;
        d.pit = -.2 * sm(d.t, 0, 1.6) + .09 * Math.sin(d.t * 3.1); d.rol = .3 * Math.sin(d.t * 2.5) + d.spin * .42 * sm(d.t, .5, 3);
        if (!fall(d, dt, 7.5, 24, .3)) return false;
        d.gd = d.t; const g = [d.x, d.y, ground(d)];
        if (F.hAt(d.x, d.y) < F.WZ) { for (let i = 0; i < 26; i++) F.emit('dust', d.x, d.y, F.WZ + .2, { vx: rand(-7, 7), vy: rand(-7, 7), vz: rand(4, 15), life: rand(.5, 1.2), s0: .8, s1: 3, col: [205, 222, 232], a: .75, g: 12 }); A() && A().at('thud', d.x, d.y, 1); return true; }   // jatuh ke air: cipratan, tenggelam
        blast([g[0], g[1], g[2] + 1], 9 * sz); debris(g, 9, 12, [34, 34, 34], .55 * sz, 1); scar(d.x, d.y, 6 * sz); jolt(d, .35, 240);
      }
      wreck(d, { life: WRECK, fire: WRECK, dz: .15, pp: -.1, rol: d.spin * .55, rph: (d.u.rph || 0) % TAU, rotK: 0, fly: true }); return true;
    },
    jet(d, dt) {
      const sz = d.sz;
      if (once(d, 'a', 0)) { blast(rot(d, [-3 * sz, 0, .4]), 4.5 * sz); debris(rot(d, [-3 * sz, 0, .4]), 4, 16, [44, 46, 50], .45 * sz, 1); A() && A().at('whine', d.x, d.y, 1); d.spin = d.side; }
      if (d.gd === undefined) {
        const e = rot(d, [-3.4 * sz, 0, .3]); if (every(d, 40, dt)) fire(e, rand(1.1, 2.2) * sz, .4); if (every(d, 28, dt)) smoke(e, 2.1 * sz, rand(3, 5), [24, 24, 24]);
        d.rol += d.spin * (1.1 + d.t * .55) * dt; d.pit = Math.max(-.82, d.pit - .32 * dt);
        if (!fall(d, dt, 26, 95, .4)) return false;
        d.gd = d.t; const g = [d.x, d.y, ground(d)];
        if (F.hAt(d.x, d.y) < F.WZ) { for (let i = 0; i < 34; i++) F.emit('dust', d.x, d.y, F.WZ + .2, { vx: rand(-9, 9), vy: rand(-9, 9), vz: rand(6, 22), life: rand(.6, 1.4), s0: 1, s1: 4, col: [205, 222, 232], a: .75, g: 12 }); A() && A().boom(d.x, d.y, 8); return true; }
        blast([g[0], g[1], g[2] + 1], 12 * sz); debris(g, 12, 18, [40, 42, 46], .6 * sz, 1); scar(d.x, d.y, 8 * sz); jolt(d, .4, 320); d.vx *= .55; d.vy *= .55; d.pit = -.06; d.rol = d.spin * .5;
      }
      // tergelincir di tanah
      d.vx *= Math.max(0, 1 - dt * 1.9); d.vy *= Math.max(0, 1 - dt * 1.9); d.x += d.vx * dt; d.y += d.vy * dt; d.z = ground(d) + .4; d.u.alt = d.z - F.hAt(d.x, d.y); d.yaw += d.spin * .5 * dt * Math.hypot(d.vx, d.vy) / 30;
      if (every(d, 26, dt)) { F.puff(d.x, d.y, d.z, 1, [120, 108, 90], 2.6); fire(rot(d, [rand(-2, 2), 0, 1]), rand(1.2, 2.4) * sz, 1.5); }
      if (d.t - d.gd < 1.1) return false;
      wreck(d, { life: WRECK, fire: WRECK, dz: .2, pp: -.05, rol: d.spin * .42, fly: true }); return true;
    },
    veh(d, dt) {
      const sz = d.sz, gz = F.hAt(d.x, d.y);
      if (once(d, 'a', 0)) { const p = rot(d, [0, 0, 1.6 * sz]); blast(p, 8 * sz); flash(p, 5 * sz); debris(p, 10, 13, [40, 40, 36], .34 * sz, 1); debris(p, 3, 9, [64, 66, 58], .6 * sz, 0); scar(d.x, d.y, 4.5 * sz); jolt(d, .32, 170); d.tur = d.turret ? { b: [1, 2], p: [-.2, 0, 2.05 * sz], t0: .1, T: 1.35, H: rand(6, 10) * sz, from: [0, 0, 0, d.ty0, 0, 0], to: [rand(-2, .5) * sz, d.side * rand(2.5, 4.5) * sz, -1.05 * sz, d.ty0 + rand(.5, 1.4), rand(-.2, .2), d.side * (TAU + rand(.3, 1.2))] } : null; }
      d.u.burnt = true;
      if (once(d, 'b', .55)) blast(rot(d, [-1.6 * sz, d.side * .7, 1.1 * sz]), 3.5 * sz);
      if (d.tur) d.u.bo = [fling(d, d.tur)];
      if (d.t < 1.4) for (const lp of [[-.4, .5, 2.1], [-.7, -.5, 2.1]]) if (every(d, 26, dt)) { const p = rot(d, [lp[0] * sz, lp[1] * sz, lp[2] * sz]); F.emit('fire', p[0], p[1], p[2], { vx: rand(-1.2, 1.2), vy: rand(-1.2, 1.2), vz: rand(8, 15) * (1 - d.t / 1.6), life: rand(.28, .55), s0: rand(.9, 1.5) * sz, s1: .3, col: [255, rand(110, 180) | 0, 44], a: .85 }); }   // amunisi menyembur dari palka
      if (every(d, 12, dt)) fire(rot(d, [rand(-1.6, 1.6) * sz, rand(-.9, .9) * sz, 1.4 * sz]), rand(.8, 1.5) * sz, 2); if (every(d, 8, dt)) smoke(rot(d, [0, 0, 2 * sz]), 1.3 * sz, rand(2.5, 4), [28, 28, 28]);
      const up = Math.sin(Math.PI * clamp(d.t / .5, 0, 1)) * .55 * sz, dec = Math.exp(-d.t * 3.4);
      d.z = gz + up; d.pit = .14 * Math.sin(d.t * 11) * dec + .03; d.rol = d.side * (.1 * Math.sin(d.t * 8.4) * dec + .035);
      if (d.t < 1.65) return false;
      wreck(d, { life: WRECK, fire: WRECK, bo: d.u.bo, pp: .03, rol: d.side * .035 }); return true;
    },
    trk(d, dt) {
      const sz = d.sz, gz = F.hAt(d.x, d.y), T = 1.05;
      if (once(d, 'a', 0)) { const p = rot(d, [0, 0, 1 * sz]); blast(p, 6.5 * sz); flash(p, 4 * sz); debris(p, 8, 11, [52, 52, 46], .3 * sz, 1); scar(d.x, d.y, 3.2 * sz); jolt(d, .2, 130); d.flip = d.side * rand(1.5, 2.3); d.vx = rand(-3, 3); d.vy = rand(-3, 3); }
      d.u.burnt = true; const k = clamp(d.t / T, 0, 1);
      d.x += d.vx * dt * (1 - k); d.y += d.vy * dt * (1 - k); d.z = gz + 4 * 1.25 * sz * k * (1 - k); d.rol = d.flip * sm(k, 0, 1); d.pit = .25 * Math.sin(k * Math.PI);
      if (once(d, 'k', T)) { F.puff(d.x, d.y, gz + .3, 8, [130, 116, 96], 2.2); A() && A().at('thud', d.x, d.y, 1); spark([d.x, d.y, gz + 1], 7); }
      if (every(d, 12, dt)) fire(rot(d, [rand(-1.2, 1.2), 0, 1]), rand(.7, 1.2) * sz, 2);
      if (d.t < T + .3) return false;
      wreck(d, { life: WRECK, fire: WRECK, pp: .03, rol: d.flip, dz: Math.abs(Math.sin(d.flip)) * .75 * sz }); return true;
    },
    sea(d, dt) {
      const sz = d.sz, L = d.type === 'SHIP' ? 9 : 4;
      if (once(d, 'a', 0)) { const p = rot(d, [L * .3, 0, 2]); blast(p, 8 * sz); debris(p, 8, 12, [50, 52, 56], .5 * sz, 1); jolt(d, .25, 260); }
      if (once(d, 'b', .8)) blast(rot(d, [-L * .35, d.side * 1.2, 1.6]), 6 * sz);
      if (once(d, 'c', 1.9)) { const p = rot(d, [0, 0, 2]); blast(p, 9 * sz); for (let i = 0; i < 22; i++) F.emit('dust', d.x + rand(-L, L), d.y + rand(-L, L), F.WZ + .2, { vx: rand(-5, 5), vy: rand(-5, 5), vz: rand(3, 13), life: rand(.5, 1.2), s0: .9, s1: 3, col: [205, 222, 232], a: .7, g: 12 }); }
      d.u.burnt = d.t > .15;
      d.rol = d.side * .62 * sm(d.t, .5, 5.5); d.pit = -.2 * sm(d.t, 1, 5.5); d.z = F.WZ - .2 - 2.4 * sz * Math.pow(sm(d.t, 1.2, 5.6), 1.6) * (1 + d.t * .18);
      if (every(d, 12, dt) && d.t < 4.6) fire(rot(d, [rand(-L, L) * .55, rand(-1, 1), 1.8]), rand(1, 2) * sz, 2.2); if (every(d, 9, dt)) smoke(rot(d, [rand(-L, L) * .4, 0, 2]), 2.2 * sz, rand(3, 5), [26, 26, 26]);
      if (d.t > 1.5 && every(d, 14, dt)) F.emit('dust', d.x + rand(-L, L) * .8, d.y + rand(-3, 3), F.WZ + .1, { vz: rand(1, 4), life: rand(.4, .9), s0: .5, s1: 1.5, col: [210, 226, 235], a: .55 });   // gelembung
      return d.t > 6.2;
    }
  };
  F.unitDie = function (u) {
    const kd = F.dieK[u.type]; if (!kd || !F.world || F.dying.length >= 14 || F.viewD(u.x, u.y) > 1400) return false;
    const T = UT[u.type], air = kd === 'rot' || kd === 'jet', yaw = u.hdg !== undefined ? u.hdg : u.face || 0, gz = F.hAt(u.x, u.y), alt = air ? Math.max(0, F.zOf(u) - gz) : 0, sp = air ? T.spd * (kd === 'jet' ? .42 : .3) : 0;
    const d = { type: u.type, kd, sz: T.sz || 1, t: 0, ev: {}, x: u.x, y: u.y, z: kd === 'sea' ? F.WZ - .2 : gz + alt, yaw, pit: 0, rol: 0, vx: Math.cos(yaw) * sp, vy: Math.sin(yaw) * sp, vz: 0, wy: 0, side: u.id % 2 ? 1 : -1, ty0: wrap((u.face || yaw) - yaw), air: true, turret: kd === 'veh' && u.type !== 'AA',
      u: { id: -100000 - u.id, type: u.type, team: u.team, x: u.x, y: u.y, face: u.face || yaw, hdg: yaw, alt, fly: air, jet: !!u.jet, kit: u.kit, pose: { z: gz + alt, yaw, pit: 0, rol: 0 } } };
    F.dieMark.add(u.x + '|' + u.y); F.dying.push(d); return true;
  };
  const stepD = (d, dt) => KND[d.kd](d, dt);
  /* ---------- awal & langkah ---------- */
  F.bossDie = function (u) {
    const T = UT[u.type]; if (!DIE[u.type] || !F.world) return false;
    const air = !!T.fly, yaw = u.hdg !== undefined ? u.hdg : u.face || 0, sp = T.orbit ? T.spd : air ? T.spd * .6 : 0, gz = F.hAt(u.x, u.y), alt = air || u.type === 'CLAY' ? Math.max(0, F.zOf(u) - gz) : 0;
    const d = { type: u.type, t: 0, ev: {}, x: u.x, y: u.y, z: gz + alt, yaw, pit: 0, rol: air && T.bank !== undefined ? T.bank : 0, vx: Math.cos(yaw) * sp, vy: Math.sin(yaw) * sp, vz: 0, wy: 0,
      side: u.id % 2 ? 1 : -1, ty0: wrap((u.face || yaw) - yaw), air,
      u: { id: -100000 - u.id, type: u.type, team: u.team, x: u.x, y: u.y, face: u.face || yaw, hdg: yaw, alt, fly: air, ere: u.ere, kit: u.kit } };
    if (HUMAN(u.type)) { d.u.die = u.type === 'WARLORD' ? 'knee' : 'fwd'; d.u.dk = 0; d.u.side = d.side; d.yaw = d.u.face; }
    F.dying.push(d); return true;
  };
  const HUMAN = t => t === 'CMDR' || t === 'WARLORD' || t === 'CLAY';
  F.dieTick = function (dt) {
    let nk = 0; for (const q of F.dying) if (q.kd) nk++;
    for (let i = F.dying.length - 1; i >= 0; i--) {
      const d = F.dying[i]; d.t += dt;
      EQ = d.kd ? Math.min(1, 5 / nk) * (F.viewD(d.x, d.y) < 260 ? 1 : .4) : 1; const c0 = F.chunks.length, done = d.kd ? stepD(d, dt) : DIE[d.type](d, dt); if (d.kd) for (let q = c0; q < F.chunks.length; q++) F.chunks[q].life = Math.min(F.chunks[q].life, 6);   // kepingan unit biasa hilang bersama bangkai
      const u = d.u; u.x = d.x; u.y = d.y;
      if (d.air) u.pose = { z: d.z, yaw: d.yaw, pit: d.pit, rol: d.rol };
      if (done) F.dying.splice(i, 1);
    }
    EQ = 1;
    for (let i = F.chunks.length - 1; i >= 0; i--) {   // kepingan: gravitasi, putaran, pantulan, api kecil
      const c = F.chunks[i]; c.t += dt; if (c.t > c.life) { F.chunks.splice(i, 1); continue; }
      const gz = F.hAt(c.x, c.y);
      if (c.z > gz + c.hz + .02 || c.vz > 0) { c.vz -= 18 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.yaw += c.wy * dt; c.pit += c.wp * dt; }
      if (c.z < gz + c.hz) { c.z = gz + c.hz; if (c.vz < -4) { c.vz *= -.28; c.vx *= .55; c.vy *= .55; c.wy *= .5; c.wp *= .5; } else { c.vz = 0; c.vx = 0; c.vy = 0; c.wy = 0; c.pit = Math.round(c.pit / Math.PI) * Math.PI; } }   // berhenti rebah datar
      if (c.hot > c.t && Math.random() < 6 * dt) F.emit('fire', c.x, c.y, c.z + .2, { vz: rand(1, 3), life: rand(.3, .6), s0: c.hx * 1.4, s1: .2, col: [255, rand(110, 170) | 0, 40], a: .8 });
      if (c.hot && c.t < c.hot + 4 && Math.random() < 4 * dt) F.emit('smoke', c.x, c.y, c.z + .3, { vz: rand(1, 2.5), life: rand(1.5, 2.5), s0: c.hx, s1: c.hx * 3, col: [40, 40, 40], a: .5 });
    }
    for (let i = F.arcs.length - 1; i >= 0; i--) { F.arcs[i].t += dt; if (F.arcs[i].t > F.arcs[i].life) F.arcs.splice(i, 1); }
    for (const c of F.corpses) if (c.fire > c.t && Math.hypot(c.x - P.x, c.y - P.y) < 900 && Math.random() < 10 * dt) {   // bangkai bos tetap terbakar
      const r = UT[c.type] && UT[c.type].hb ? UT[c.type].hb[0] * .7 : 3;
      fire([c.x + rand(-r, r), c.y + rand(-r, r), F.hAt(c.x, c.y) + rand(.5, 2.5)], rand(1.5, 3.2) * (1 - c.t / c.fire * .6), 3);
    }
  };
})();
