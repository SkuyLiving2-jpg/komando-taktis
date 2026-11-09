/* ============================================================
   FPS-HELI — killstreak AH-64X SHADOW HUNTER yang bisa dinaiki operator
   ([Q] Protokol Bayangan; BBM habis = mesin mati di tempat sampai diisi
   lewat pasokan BBM [B] atau mendarat di HQ/pos kawan):
   heli datang & mendarat di dekat pemain, [E] naik/turun,
   model terbang arkade (mouse = arah hidung, WASD, Spasi/C
   naik-turun, Shift = kecepatan penuh), meriam M230 30 mm,
   rudal Hellfire berpemandu (tahan [RMB] = tandai ≤4 sasaran —
   kendaraan, bangunan, maupun infanteri/Kopassus —
   lepas = tembakan beruntun, lintasan serang-atas), salvo roket
   Hydra (hulu ledak HE / flechette [X]), rudal udara-ke-udara
   Stinger [R], flare penangkal rudal, kamera orang-ketiga / kokpit
   penembak (zoom), keluar di udara = terjun payung.
   Heli = unit war 'AH64' (u.ctl: AI sim tidak menggerakkannya);
   musuh anti-udara menembaknya, nyawa di war-data UT.AH64
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q;
  const { clamp, rand, wrapPi } = TK.util;
  const A = () => TK.fpsaudio, Tt = (k, v) => TK.t(k, v), D2R = Math.PI / 180, C = F.APACHE;
  const AP = () => F.MDL.GHOST, MX = () => F.MDL.X;   // model AH-64X SHADOW HUNTER
  F.hm = [];   // Hellfire & Hydra yang sedang terbang
  P.heli = null; P.mnt = false;

  /* ---------- util ---------- */
  const floorZ = (x, y) => Math.max(F.hAt(x, y), F.WZ + .6);   // tanah/gedung atau permukaan air
  const frame = H => { const X = MX(); return X.chain(X.T(H.x, H.y, H.z), X.rz(H.yaw), X.ry(H.pit), X.rx(H.rol)); };
  const wp = (H, p) => MX().ap(frame(H), p);   // titik model Apache → dunia
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const agl = H => H.z - floorZ(H.x, H.y) - AP().gear;
  function sync(H) {   // keadaan heli → unit sim (posisi, ketinggian, sikap, rotor, turret)
    const u = H.u;
    u.x = H.x; u.y = H.y; u.hdg = u.face = H.yaw; u.alt = H.z - F.hAt(H.x, H.y); u.lowA = u.alt < 120;
    u.pose = { z: H.z, yaw: H.yaw, pit: H.pit, rol: H.rol }; u.rph = H.rph; u.rotK = H.rot; u.gunA = H.gunA;
  }
  /* sinar bidik: jarak tumbukan pertama dengan medan/gedung atau unit musuh */
  function ray(ox, oy, oz, v, max) {
    const best = { t: max, u: null }, tt = F.rayTerrain(ox, oy, oz, v[0], v[1], v[2], max), dh = Math.hypot(v[0], v[1]);
    if (tt > 0) best.t = tt;
    if (dh > 1e-5) for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue;
      const dx = u.x - ox, dy = u.y - oy, s = (dx * v[0] + dy * v[1]) / dh; if (s < 0 || s / dh > best.t + 6) continue;
      const hb = F.hitbox(u), t = F.rayHB(ox, oy, oz, v, u, hb, hb.human ? 1.6 : 1.1, .5); if (t < 1 || t >= best.t) continue;
      best.t = t; best.u = u;
    }
    return best;
  }
  F.aimRay = ray;   // dipakai juga kendaraan operator (fps-veh)
  const hitMark = u => { P.lastHead = false; if (!P.hit || P.hit.t !== P.time || !P.hit.kill) P.hit = { t: P.time, kill: u.dead, head: false }; };

  /* ---------- panggil (killstreak) ---------- */
  function landSpot() {   // lahan datar & lapang (radius rotor) di depan/samping operator
    for (let k = 0; k < 40; k++) {
      const a = P.yaw + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * .35, d = 30 + (k >> 3) * 12, x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
      if (x < 40 || y < 40 || x > W.WW - 40 || y > W.WH - 40 || F.water(x, y) || F.lava(x, y) || F.solid(x, y)) continue;
      const h = F.hAt(x, y); let ok = true;
      for (let i = 0; i < 8 && ok; i++) { const b = i * .785, px = x + Math.cos(b) * 7, py = y + Math.sin(b) * 7; if (F.solid(px, py) || F.water(px, py) || Math.abs(F.hAt(px, py) - h) > 1.6) ok = false; }
      if (ok && !F.treeNear(x, y, 6)) return [x, y];
    }
    const g = F.groundSpot(32, .5); return g && !F.water(g[0], g[1]) ? g : null;
  }
  const gunAmmo = () => C.guns.map(g => g.k === 'gun' ? C.gun.ammo : g.ammo || 0);   // amunisi penuh tiap senjata dagu (laser: tanpa amunisi, dibatasi panas)
  const fullArm = () => ({ ga: gunAmmo(), hf: C.hf.n, hy: C.hy.n, aam: C.st.n, fl: C.flare.n, heat: 0, over: false });
  F.heliCall = function () {
    const H0 = P.heli;
    if (H0 && !H0.u.dead) {   // sudah punya Shadow Hunter: isi ulang amunisi, bahan bakar & perbaikan
      Object.assign(H0, fullArm(), { fuel: C.fuel, bingo: false, drop: 0 }); H0.u.hp = H0.u.hpMax; return 'refit';
    }
    const lz = landSpot(); if (!lz) return false;
    const away = Math.atan2(Q.hqB.y - lz[1], Q.hqB.x - lz[0]), d = 420;   // datang dari arah pangkalan sendiri
    const x = clamp(lz[0] + Math.cos(away) * d, 30, W.WW - 30), y = clamp(lz[1] + Math.sin(away) * d, 30, W.WH - 30), yaw = Math.atan2(lz[1] - y, lz[0] - x);
    const u = war.mk('B', 'AH64', x, y, { ctl: true, hdg: yaw, face: yaw });
    u.hp = u.hpMax = u.hpMax * (C.hpK[Q.diff] || 1);   // lapis baja diperkuat sesuai tingkat kesulitan
    P.heli = Object.assign({ u, gen: Q.g, st: 'inbound', lz, x, y, z: F.hAt(x, y) + 70, vx: 0, vy: 0, vz: 0, yaw, yr: 0, pit: 0, rol: 0, rot: 1, rph: 0,
      fuel: C.fuel, gcd: 0, hcd: 0, ycd: 0, yq: 0, ys: 0, fcd: 0, flT: 0, ghT: 0, ghCd: 0, drop: 0, farp: false, armT: 0,
      cam: 0, zoom: 0, rT: 0, warnT: 0, lastHp: u.hp, gunA: [0, 0], aim: null, lock: null, mw: false, bingo: false, adsPrev: false, dry: false,
      pl: [], pC: null, pT: 0, rq: [], rs: 0, hyW: 0, aaU: null, aaT: 0, aaCd: 0, aaB: 0,
      gi: 0, spin: 0, rc: 0, lzU: null, lzT: 0, sndT: 0, scT: 0 }, fullArm());   // pl: sasaran Hellfire yang ditandai, rq: antrean tembakan beruntun, hyW: hulu ledak Hydra, aa*: pencari Stinger,
    sync(P.heli); return 'new';                                                   // gi: senjata dagu, ga: amunisinya, spin: putaran minigun, heat/over: panas laser, rc: isi daya railgun, lz*: sorotan laser
  };

  /* ---------- fisika terbang (dipakai pilot & autopilot) ---------- */
  function fly(H, dt, tvx, tvy, tvz, tyaw, acc) {
    const k = Math.min(1, dt * acc), ax = (tvx - H.vx) * k, ay = (tvy - H.vy) * k;
    H.vx += ax; H.vy += ay; H.vz += (tvz - H.vz) * Math.min(1, dt * 2.6);
    const dy = wrapPi(tyaw - H.yaw); H.yr += (clamp(dy * 3, -C.turn, C.turn) - H.yr) * Math.min(1, dt * 5); H.yaw = wrapPi(H.yaw + H.yr * dt);
    const g = AP().gear, nx = clamp(H.x + H.vx * dt, 20, W.WW - 20), ny = clamp(H.y + H.vy * dt, 20, W.WH - 20);
    if (floorZ(nx, ny) + g > H.z + 2.5) {   // menabrak dinding gedung/tebing: berhenti, rusak bila kencang
      const sp = Math.hypot(H.vx, H.vy); if (sp > 14) crash(H, (sp - 14) * 9);
      H.vx *= -.2; H.vy *= -.2;
    } else { H.x = nx; H.y = ny; }
    H.z += H.vz * dt;
    const fl = floorZ(H.x, H.y) + g;
    if (H.z < fl) { if (H.vz < -10) crash(H, (-H.vz - 10) * 45); H.z = fl; if (H.vz < 0) H.vz = 0; }
    H.z = Math.min(H.z, F.hAt(H.x, H.y) + C.ceil);
    // sikap: hidung menunduk saat melaju/berakselerasi, badan miring ke arah belok & geser
    const c = Math.cos(H.yaw), s = Math.sin(H.yaw), vf = H.vx * c + H.vy * s, vr = -H.vx * s + H.vy * c, id = 1 / Math.max(dt, 1e-3);
    const tp = clamp(-vf / C.boost * .28 - (ax * c + ay * s) * id * .012, -.42, .3), tr = clamp(-(vr / C.boost * .3 + H.yr * .2 + (-ax * s + ay * c) * id * .01), -.55, .55);
    const on = H.z - fl < .05 && Math.abs(H.vz) < .5 ? 0 : 1;   // di tanah: badan rata
    H.pit += (tp * on - H.pit) * Math.min(1, dt * 3); H.rol += (tr * on - H.rol) * Math.min(1, dt * 3);
  }
  function crash(H, dmg) { if (H.st === 'crash') return; const u = H.u; u.hp -= dmg; u.hitT = Q.t; P.shake = Math.min(1.5, P.shake + .5); A() && A().local('land', 1); if (u.hp <= 0) war.kill(u, null); }

  /* ---------- tanpa pilot: datang & mendarat, turun sendiri, atau pulang ---------- */
  function autopilot(H, dt) {
    const g = AP().gear, fl = floorZ(H.x, H.y);
    if (H.st === 'inbound') {
      const dx = H.lz[0] - H.x, dy = H.lz[1] - H.y, d = Math.hypot(dx, dy), sp = Math.min(55, d * .5 + 1.5), lzz = F.hAt(H.lz[0], H.lz[1]);
      const tz = Math.max(d > 140 ? lzz + 45 : lzz + g + d * .3, fl + g + (d > 20 ? 6 : 0));
      fly(H, dt, d > .3 ? dx / d * sp : 0, d > .3 ? dy / d * sp : 0, clamp((tz - H.z) * 1.2, -9, 12), d > 8 ? Math.atan2(dy, dx) : H.yaw, 1.4);
      if (d < 1.5 && H.z - fl < g + .3) { H.st = 'landed'; F.msg(Tt('f_ah_land'), 'g'); }
    } else if (H.st === 'auto') {   // pilot melompat keluar: melayang turun pelan lalu mendarat
      fly(H, dt, 0, 0, -5, H.yaw, 1); if (H.z - fl <= g + .05) H.st = 'landed';
    }
    if (H.st === 'landed') {
      H.z = fl + g; H.vx = H.vy = H.vz = 0; H.pit *= Math.max(0, 1 - dt * 4); H.rol *= Math.max(0, 1 - dt * 4);
      H.rot += ((H.fuel > 0 ? .32 : 0) - H.rot) * Math.min(1, dt * .8);   // mesin idle: rotor melambat; tanpa BBM: berhenti total
    } else H.rot += (1 - H.rot) * Math.min(1, dt * 1.5);
  }

  /* ---------- kendali pilot (dipanggil F.update saat P.mnt) ---------- */
  F.heliPilot = function (dt) {
    const H = P.heli; if (!H || H.u.dead || H.st === 'crash') return;   // jatuh: kendali hilang (posisi operator diikutkan crashTick)
    const I = F.in, c = Math.cos(H.yaw), s = Math.sin(H.yaw);
    H.rot += (1 - H.rot) * Math.min(1, dt * 1.4); H.fuel -= dt;
    const dry = H.fuel <= 0, mx = (+I.r || 0) - (+I.l || 0), my = (+I.f || 0) - (+I.b || 0), sp = (I.sprint ? C.boost : C.spd) * (dry ? .3 : 1), fwd = my * (my < 0 ? .5 : 1);
    let tvz = ((I.jump ? 1 : 0) - (I.dn ? 1 : 0)) * C.climb;
    if (H.rot < .75 || dry) tvz = Math.min(tvz, dry ? -6 : 0);   // rotor belum penuh / tanpa bahan bakar: tidak bisa menanjak
    fly(H, dt, (c * fwd - s * mx * .65) * sp, (s * fwd + c * mx * .65) * sp, tvz, P.yaw, C.acc);
    if (H.u.dead) return;
    if (dry && agl(H) < .2) { H.fuel = 0; F.msg(Tt('f_ah_fuel0'), 'w'); A() && A().local('warn', .8); F.heliExit(); H.st = 'landed'; return; }   // mesin mati di tempat: heli tetap ada, tidak bisa dipakai sampai diisi BBM
    if (H.fuel < 25 && !H.bingo) { H.bingo = true; F.msg(Tt('f_ah_bingo'), 'w'); A() && A().local('warn', .8); }
    // operator ikut di kursi
    Object.assign(P, { x: H.x, y: H.y, z: H.z - .4, vx: H.vx, vy: H.vy, vz: 0, spd: Math.hypot(H.vx, H.vy), grounded: true, sprint: false, ads: 0, crouch: false });
    const pu = P.unit; pu.x = H.x; pu.y = H.y; pu.hdg = pu.face = P.yaw;
    aimUpdate(H);
    chinGun(H, dt, I.fire);
    paint(H, dt, I.ads);
    H.adsPrev = I.ads;
    seeker(H, dt);
  };

  /* ---------- kamera ---------- */
  function camPose(H) {
    const v = F.aimVec(P.yaw, P.pitch);
    if (H.cam) { const p = wp(H, AP().cam); return { x: p[0], y: p[1], z: p[2], v }; }   // kursi penembak (TADS)
    const D = 17, x = H.x - v[0] * D, y = H.y - v[1] * D;
    return { x, y, z: Math.max(H.z + 3.6 - v[2] * D, F.hAt(x, y) + 1.5), v };
  }
  F.heliCamera = function () {
    const H = P.heli, c = camPose(H), sh = (Math.random() - .5) * P.shake * F.shakeK * .02;
    F.camHide = H.cam ? H.u : null;
    return { x: c.x, y: c.y, z: c.z, yaw: P.yaw + sh, pitch: P.pitch + sh, fov: (H.cam ? [62, 30, 12][H.zoom] : 74) * D2R };
  };
  F.heliLookK = () => P.mnt && P.heli && P.heli.cam ? [1, .5, .2][P.heli.zoom] : 1;
  F.heliCam = function () { const H = P.heli; if (!P.mnt || !H) return; H.cam = 1 - H.cam; H.zoom = 0; A() && A().local('switch', .5); };
  F.heliZoom = function () { const H = P.heli; if (!P.mnt || !H) return; if (!H.cam) { H.cam = 1; H.zoom = 0; } else H.zoom = (H.zoom + 1) % 3; A() && A().local('ui', .6); };

  /* ---------- bidikan: titik tumbuk garis tengah layar, arah turret, kunci Hellfire ---------- */
  function aimUpdate(H) {
    const c = camPose(H), v = c.v, hit = ray(c.x, c.y, c.z, v, 2600);
    H.aim = { x: c.x + v[0] * hit.t, y: c.y + v[1] * hit.t, z: c.z + v[2] * hit.t, u: hit.u, d: Math.hypot(c.x + v[0] * hit.t - H.x, c.y + v[1] * hit.t - H.y) };
    const g = wp(H, AP().gun), dx = H.aim.x - g[0], dy = H.aim.y - g[1], dz = H.aim.z - g[2];
    H.gunA = [clamp(wrapPi(Math.atan2(dy, dx) - H.yaw), -1.9, 1.9), clamp(Math.atan2(dz, Math.hypot(dx, dy)) - H.pit, -1.05, .2)];
    let best = hit.u, bd = .087;   // kunci: unit yang dibidik langsung, atau musuh mana pun (kendaraan, bangunan, infanteri/Kopassus) dalam 5° dari garis bidik — kendaraan didahulukan
    if (!best) for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue;
      const hb = F.hitbox(u), ex = u.x - c.x, ey = u.y - c.y, ez = hb.z0 + hb.h * .5 - c.z, d = Math.hypot(ex, ey, ez); if (d > C.hf.rng || d < 30) continue;
      const a = Math.acos(clamp((ex * v[0] + ey * v[1] + ez * v[2]) / d, -1, 1)) * (hb.human ? 1.6 : 1); if (a < bd) { bd = a; best = u; }
    }
    H.lock = best;
    let air = null, ba = C.st.cone;   // pencari inframerah Stinger: pesawat musuh terdekat dari garis bidik
    for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0 || !(u.fly || u.jet)) continue;
      const hb = F.hitbox(u), ex = u.x - c.x, ey = u.y - c.y, ez = hb.z0 + hb.h * .5 - c.z, d = Math.hypot(ex, ey, ez); if (d > C.st.rng || d < 40) continue;
      const a = Math.acos(clamp((ex * v[0] + ey * v[1] + ez * v[2]) / d, -1, 1)); if (a < ba) { ba = a; air = u; }
    }
    if (air !== H.aaU) { H.aaU = air; H.aaT = 0; }
  }

  /* ---------- senjata dagu [H]: M230 · MINIGUN · LASER · RAILGUN · GRANAT 40 ---------- */
  const GUN = H => C.guns[H.gi];
  F.heliGun = function (dir) {
    const H = P.heli; if (!P.mnt || !H || H.st === 'crash') return;
    H.gi = (H.gi + (dir || 1) + C.guns.length) % C.guns.length;
    Object.assign(H, { gcd: Math.max(H.gcd, .25), spin: 0, rc: 0, lzU: null, lzT: 0 }); F.hbeam = null;
    F.msg(Tt('f_hg_' + GUN(H).k), 'g'); A() && A().local('switch', .6);
  };
  const dry = H => { if (!H.dry) { H.dry = true; A() && A().local('empty', .6); } };
  const muzzle = (H, off) => { const gp = AP().gun; return wp(H, [gp[0], off || 0, gp[2]]); };
  function aimDir(H, g, sp) { const a = H.aim, d = nrm([a.x - g[0], a.y - g[1], a.z - g[2]]); return sp ? nrm([d[0] + rand(-sp, sp), d[1] + rand(-sp, sp), d[2] + rand(-sp, sp)]) : d; }
  function chinGun(H, dt, fire) {
    const G = GUN(H), MG = C.guns[1], LZ = C.guns[2], am = H.ga[H.gi];
    F.hbeam = null; H.sndT -= dt;
    if (!(G.k === 'laser' && fire && !H.over)) { H.heat = Math.max(0, H.heat - dt * LZ.heat / LZ.cool); if (H.heat <= 0) H.over = false; }   // laser mendingin bila tidak menembak
    H.spin = G.k === 'mg' && fire && am > 0 ? Math.min(1, H.spin + dt / MG.spin) : Math.max(0, H.spin - dt / MG.spin * .5);   // laras minigun berputar dulu
    if (G.k === 'mg' && H.spin > 0 && H.sndT <= 0) { H.sndT = .07; A() && A().local(H.spin >= 1 && fire ? 'minigun' : 'spin', .5 + .4 * H.spin); }
    if (G.k === 'gun') { if (fire && H.gcd <= 0) { if (am > 0) gun(H); else dry(H); } }
    else if (G.k === 'mg') { if (fire && H.spin >= 1) { H.gcd = Math.max(H.gcd, -dt); while (H.gcd <= 0 && H.ga[1] > 0) minigun(H, G); } if (fire && H.ga[1] <= 0) dry(H); }
    else if (G.k === 'laser') { if (fire && !H.over) laser(H, G, dt); else { H.lzU = null; H.lzT = 0; if (fire) dry(H); } }
    else if (G.k === 'rail') {   // tahan = isi daya, lepas = tembak bila penuh
      if (fire && H.gcd <= 0 && am > 0) { if (H.rc <= 0) A() && A().local('railC', .8); H.rc = Math.min(1, H.rc + dt / G.charge); }
      else if (!fire && H.rc > 0) { if (H.rc >= 1) railShot(H, G); H.rc = 0; }
      if (fire && am <= 0) dry(H);
    } else if (G.k === 'gl') { if (fire && H.gcd <= 0) { if (am > 0) grenade40(H, G); else dry(H); } }
    if (!fire) H.dry = false;
  }
  function minigun(H, G) {   // M134: enam laras berputar, peluru 7,62 mm — sebar lebar, tiap butir ringan, pelacak tiap 3 butir; lemah terhadap lapis baja
    H.gcd += 60 / G.rpm; H.ga[1]--;
    const g = muzzle(H), v = aimDir(H, g, G.spread * D2R), m = [g[0] + v[0] * 1.6, g[1] + v[1] * 1.6, g[2] + v[2] * 1.6];
    const hit = ray(m[0], m[1], m[2], v, G.rng), ix = m[0] + v[0] * hit.t, iy = m[1] + v[1] * hit.t, iz = m[2] + v[2] * hit.t;
    if (H.ga[1] % 3 === 0) F.tracers.push({ x0: m[0], y0: m[1], z0: m[2], x1: ix, y1: iy, z1: iz, t: 0, life: .07, w: .05, col: [255, 130, 70] });
    if (H.ga[1] % 4 === 0) F.emit('flash', m[0], m[1], m[2], { life: .04, s0: .5, s1: .9, col: [255, 210, 140] });
    if (hit.t < G.rng) {
      if (hit.u) { war.hurt(hit.u, G.dmg * dmgK(), 'small', P.unit); hitMark(hit.u); }
      if (Math.random() < .25) F.puff(ix, iy, iz + .1, 1, [130, 118, 96], .6); if (Math.random() < .12) F.sparks(ix, iy, iz + .1, 2);
    }
    P.shake = Math.min(.3, P.shake + .006);
  }
  function laser(H, G, dt) {   // sinar panas kontinu ke titik bidik: menyorot sasaran yang sama makin lama → makin panas (×1 → ×2 dalam lock dtk)
    H.heat += dt;
    if (H.heat >= G.heat) { H.heat = G.heat; H.over = true; F.msg(Tt('f_hg_hot'), 'w'); A() && A().local('warn', .5); }
    const g = muzzle(H), v = aimDir(H, g), m = [g[0] + v[0] * 1.4, g[1] + v[1] * 1.4, g[2] + v[2] * 1.4], hit = ray(m[0], m[1], m[2], v, G.rng);
    const ex = m[0] + v[0] * hit.t, ey = m[1] + v[1] * hit.t, ez = m[2] + v[2] * hit.t, on = hit.t < G.rng;
    F.hbeam = { x0: m[0], y0: m[1], z0: m[2], x1: ex, y1: ey, z1: ez, k: H.heat / G.heat, hit: on };
    if (hit.u !== H.lzU) { H.lzU = hit.u; H.lzT = 0; } H.lzT += dt;
    const k = G.dps * dt * dmgK();
    if (hit.u) { war.hurt(hit.u, k * (1 + Math.min(1, H.lzT / G.lock)), hit.u.fly || hit.u.jet ? 'ap' : 'bomb', P.unit); hitMark(hit.u); }
    if (on) {
      for (const u of Q.units) {   // titik panas melebar: yang berdiri di dekatnya ikut terbakar
        if (u === hit.u || u.dead || u.team === 'B' || u.chute > 0 || Math.abs(u.x - ex) > 3 || Math.abs(u.y - ey) > 3) continue;
        const hb = F.hitbox(u); if (Math.hypot(u.x - ex, u.y - ey) < hb.r + 2 && ez > hb.z0 - 2 && ez < hb.z0 + hb.h + 2) war.hurt(u, k * .4, 'bomb', P.unit);
      }
      if (Math.random() < dt * 30) F.emit('fire', ex, ey, ez + .2, { vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(1, 4), life: rand(.2, .45), s0: .9, s1: .2, col: [255, rand(90, 160) | 0, 50], a: .9 });
      if (Math.random() < dt * 8) F.sparks(ex, ey, ez + .1, 2);
      H.scT -= dt; if (H.scT <= 0 && !hit.u) { H.scT = .12; F.scorch.push({ x: ex, y: ey, r: rand(1.2, 2), t: 0, life: 9 }); }
    }
    if (H.sndT <= 0) { H.sndT = .42; A() && A().local('laserHum', .7); }
  }
  function railShot(H, G) {   // proyektil rel elektromagnetik: menembus SEMUA musuh di garis bidik (tiap tembusan ×pierce), juga menembus dinding/bukit setebal ≤wall m
    H.ga[3]--; H.gcd = G.cd;
    const g = muzzle(H), v = aimDir(H, g), m = [g[0] + v[0] * 2, g[1] + v[1] * 2, g[2] + v[2] * 2], tt = F.rayTerrain(m[0], m[1], m[2], v[0], v[1], v[2], G.rng), end = tt > 0 ? Math.min(G.rng, tt + G.wall) : G.rng, vis = tt > 0 ? tt : G.rng;   // vis: jejak terlihat sampai benturan pertama
    const hits = [];
    for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue;
      const hb = F.hitbox(u), ex = u.x - m[0], ey = u.y - m[1], ez = hb.z0 + hb.h * .5 - m[2], s = ex * v[0] + ey * v[1] + ez * v[2]; if (s < 1 || s > end) continue;
      if (Math.hypot(ex - v[0] * s, ey - v[1] * s, ez - v[2] * s) < Math.max(hb.r, hb.h * .5) + .7) hits.push([s, u]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    let dmg = G.dmg * dmgK();
    for (const [, u] of hits) { war.hurt(u, dmg, 'ap', P.unit); hitMark(u); dmg *= G.pierce; }
    const e = [m[0] + v[0] * vis, m[1] + v[1] * vis, m[2] + v[2] * vis];
    F.tracers.push({ x0: m[0], y0: m[1], z0: m[2], x1: e[0], y1: e[1], z1: e[2], t: 0, life: .5, w: .34, col: [120, 200, 255], inst: true });
    F.tracers.push({ x0: m[0], y0: m[1], z0: m[2], x1: e[0], y1: e[1], z1: e[2], t: 0, life: .3, w: .1, col: [235, 248, 255], inst: true });
    const n = Math.min(90, vis / 5 | 0), q = Math.abs(v[2]) < .9 ? nrm([-v[1], v[0], 0]) : [1, 0, 0], w = [v[1] * q[2] - v[2] * q[1], v[2] * q[0] - v[0] * q[2], v[0] * q[1] - v[1] * q[0]];
    for (let i = 0; i < n; i++) {   // jejak spiral ion di sepanjang lintasan
      const s = i * 5, a = s * .35, c = Math.cos(a) * .7, sn = Math.sin(a) * .7;
      F.emit('smoke', m[0] + v[0] * s + q[0] * c + w[0] * sn, m[1] + v[1] * s + q[1] * c + w[1] * sn, m[2] + v[2] * s + q[2] * c + w[2] * sn, { life: rand(.6, 1), s0: .25, s1: 1, col: [170, 220, 255], a: .5 });
    }
    F.emit('flash', m[0], m[1], m[2], { life: .1, s0: 1.4, s1: 3, col: [150, 210, 255] });
    if (tt > 0) { war.explode(e[0], e[1], 5, G.dmg * .15 * dmgK(), 'he', P.unit); F.shock.push({ x: e[0], y: e[1], R: 14, t: 0, life: .45, col: [140, 210, 255] }); F.sparks(e[0], e[1], e[2], 10); }
    A() && A().local('rail', 1); P.shake = Math.min(1, P.shake + .45);
  }
  function grenade40(H, G) {   // M129 40 mm: granat HE melengkung — sudut elevasi dihitung (solusi balistik rendah) agar jatuh tepat di titik bidik
    H.gcd = 60 / G.rpm; H.ga[4]--;
    const g = muzzle(H), a = H.aim, dx = a.x - g[0], dy = a.y - g[1], dz = a.z - g[2], R = Math.max(1, Math.hypot(dx, dy)), v = G.spd, gg = 9.8;
    const q = v ** 4 - gg * (gg * R * R + 2 * dz * v * v), th = q >= 0 ? Math.atan((v * v - Math.sqrt(q)) / (gg * R)) : .785, sp = .006;
    const vh = Math.cos(th) * v;
    F.hm.push({ k: 'gl', x: g[0], y: g[1], z: g[2], vx: dx / R * vh + rand(-sp, sp) * v, vy: dy / R * vh + rand(-sp, sp) * v, vz: Math.sin(th) * v, t: 0 });
    F.emit('flash', g[0], g[1], g[2], { life: .05, s0: .6, s1: 1.1, col: [255, 200, 130] }); F.puff(g[0], g[1], g[2], 1, [200, 200, 196], .9);
    A() && A().local('gl40', .8); P.shake = Math.min(.4, P.shake + .05);
  }
  function gun(H) {   // M230 30 mm: peluru eksplosif dari turret, sebar kecil, jejak tebal
    const G = C.gun, a = H.aim; H.gcd = 60 / G.rpm; H.ga[0]--;
    const gp = AP().gun, g = wp(H, [gp[0], H.ga[0] % 2 ? .09 : -.09, gp[2]]), sp = G.spread * D2R,   // meriam kembar: laras bergantian
      d0 = nrm([a.x - g[0], a.y - g[1], a.z - g[2]]);
    const v = nrm([d0[0] + rand(-sp, sp), d0[1] + rand(-sp, sp), d0[2] + rand(-sp, sp)]), m = [g[0] + v[0] * 1.8, g[1] + v[1] * 1.8, g[2] + v[2] * 1.8];
    const hit = ray(m[0], m[1], m[2], v, G.rng), ix = m[0] + v[0] * hit.t, iy = m[1] + v[1] * hit.t, iz = m[2] + v[2] * hit.t;
    F.tracers.push({ x0: m[0], y0: m[1], z0: m[2], x1: ix, y1: iy, z1: iz, t: 0, life: .11, w: .09 });
    F.emit('flash', m[0], m[1], m[2], { life: .05, s0: .7, s1: 1.2, col: [255, 220, 140] });
    if (hit.t < G.rng) cannonHit(ix, iy, iz, hit.u);
    A() && A().local('chain', .8); P.shake = Math.min(.45, P.shake + .035);
  }
  function cannonHit(x, y, z, u0) {
    const G = C.gun, k = dmgK();
    if (u0) { war.hurt(u0, G.dmg * k, 'ap', P.unit); hitMark(u0); }
    for (const u of Q.units) {
      if (u === u0 || u.dead || u.team === 'B' || Math.abs(u.x - x) > G.r || Math.abs(u.y - y) > G.r) continue;
      const d = Math.hypot(u.x - x, u.y - y), hb = F.hitbox(u); if (d > G.r || z > hb.z0 + hb.h + 3 || z < hb.z0 - 3) continue;
      war.hurt(u, G.dmg * k * .8 * (1 - d / G.r * .6), 'he', P.unit); hitMark(u);
    }
    F.emit('flash', x, y, z + .3, { life: .08, s0: 1.2, s1: 2.6, col: [255, 210, 140] }); F.sparks(x, y, z + .2, 5); F.puff(x, y, z + .2, 2, [120, 108, 90], 1.6);
  }
  /* [RMB] Longbow: tahan = sapu bidikan melewati sasaran (kendaraan maupun infanteri) untuk menandainya satu per satu (≤hf.max), lepas = rudal beruntun,
     satu per sasaran; ketuk tanpa tanda = satu rudal ke sasaran terkunci / titik bidik */
  function paint(H, dt, on) {
    const HF = C.hf;
    if (on) {
      if (!H.adsPrev) { H.pl = []; H.pC = null; H.pT = 0; }
      H.pl = H.pl.filter(u => !u.dead);
      const u = H.lock && !H.lock.dead ? H.lock : null;
      if (u && !H.pl.includes(u) && H.pl.length < Math.min(HF.max, H.hf)) {
        if (u !== H.pC) { H.pC = u; H.pT = 0; }
        H.pT += dt; if (H.pT >= HF.paint) { H.pl.push(u); H.pC = null; A() && A().local('lock', 1.6); }
      } else H.pC = null;
      return;
    }
    if (!H.adsPrev) return;
    const tg = H.pl.filter(u => !u.dead); H.pl = []; H.pC = null;
    if (H.hcd > 0 || H.rq.length) return;
    if (H.hf <= 0) { A() && A().local('empty', .6); return; }
    H.rq = tg.length ? tg : [H.lock && !H.lock.dead ? H.lock : null]; H.rs = 0;
  }
  function hellfire(H, tg) {   // rudal berpemandu dari rel luar (bergantian kiri-kanan): mengejar sasaran (unit) atau titik bidik (null)
    const HF = C.hf; H.hf--; H.hcd = HF.cd;
    const sd = H.hf % 2 ? 1 : -1, hp = AP().hf, p = wp(H, [hp[0], sd * hp[1], hp[2]]), q = wp(H, [hp[0] + 1, sd * hp[1], hp[2]]), d = nrm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]), a = H.aim;   // d: arah rel = sumbu badan heli
    const air = tg && (tg.fly || tg.jet), lo = !air && Math.hypot((tg ? tg.x : a.x) - p[0], (tg ? tg.y : a.y) - p[1]) > HF.loAt;   // serang-atas hanya untuk sasaran darat yang cukup jauh
    F.hm.push({ k: 'hf', x: p[0], y: p[1], z: p[2], vx: H.vx + d[0] * HF.v0, vy: H.vy + d[1] * HF.v0, vz: H.vz + d[2] * HF.v0 - 1.5, t: 0, tg, lo, tx: a.x, ty: a.y, tz: a.z, lit: false });
    for (let i = 0; i < 4; i++) F.emit('smoke', p[0], p[1], p[2], { vx: -d[0] * rand(2, 6) + rand(-1.5, 1.5), vy: -d[1] * rand(2, 6) + rand(-1.5, 1.5), vz: rand(-1, 1), life: rand(.5, .9), s0: .4, s1: 1.6, col: [220, 220, 214], a: .45 });   // gas pelontar di rel
    A() && A().local('tug', .9);
  }
  /* pemandu Hellfire: titik tuju = titik pada kurva Hermite dari posisi & arah rudal sekarang ke sasaran dengan arah tiba yang diinginkan.
     Kurva dihitung ulang tiap frame (sasaran boleh bergerak), jadi lintasan selalu melengkung mulus — naik pelan lalu menukik — tanpa
     fase "lurus lalu banting ke bawah"; laju belok dibatasi (fase akhir lebih lincah). Mengembalikan arah terbang baru (vektor satuan) */
  function hfSteer(m, tx, ty, tz, dt) {
    const HF = C.hf, rx = tx - m.x, ry = ty - m.y, rz = tz - m.z, D = Math.hypot(rx, ry, rz) || 1, dh = Math.hypot(rx, ry), cur = nrm([m.vx, m.vy, m.vz]);
    const cd = Math.cos(HF.dive), sdv = Math.sin(HF.dive), arr = m.lo && dh > 1 ? [rx / dh * cd, ry / dh * cd, -sdv] : [rx / D, ry / D, rz / D];
    const s = Math.min(1, HF.look + 12 / D), s2 = s * s, s3 = s2 * s, h10 = (s3 - 2 * s2 + s) * D, h01 = 3 * s2 - 2 * s3, h11 = (s3 - s2) * D;
    let want = nrm([h10 * cur[0] + h01 * rx + h11 * arr[0], h10 * cur[1] + h01 * ry + h11 * arr[1], h10 * cur[2] + h01 * rz + h11 * arr[2]]);
    if (D > 90 && F.hAt) {   // altimeter: bila 60 m di depan menembus bukit/gedung, mendongak melewatinya
      const L = 60, px = m.x + want[0] * L, py = m.y + want[1] * L, cl = F.hAt(px, py) + 7 - (m.z + want[2] * L);
      if (cl > 0) want = nrm([want[0], want[1], want[2] + cl / L]);
    }
    const ang = Math.acos(clamp(cur[0] * want[0] + cur[1] * want[1] + cur[2] * want[2], -1, 1)), mx = (D < HF.termD ? HF.term : HF.turn) * dt;
    if (ang <= mx || ang < 1e-5) return want;
    const k = Math.sin(mx) / Math.sin(ang), k0 = Math.cos(mx) - k * Math.cos(ang);   // slerp: putar arah sekarang sejauh mx menuju titik tuju
    return nrm([cur[0] * k0 + want[0] * k, cur[1] * k0 + want[1] * k, cur[2] * k0 + want[2] * k]);
  }
  F.hfSteer = hfSteer;   // untuk uji lintasan
  F.heliHydra = function () {   // salvo roket tanpa kendali dari pod dalam
    const H = P.heli; if (!P.mnt || !H || H.ycd > 0 || H.yq > 0) return;
    if (H.hy <= 0) { A() && A().local('empty', .6); return; }
    H.ycd = C.hy.cd; H.yq = Math.min(C.hy.salvo, H.hy); H.ys = 0;
  };
  function hydraOne(H) {
    const Y = C.hy, a = H.aim, w = Y.war[H.hyW], sd = H.hy % 2 ? 1 : -1, yp = AP().hy, p = wp(H, [yp[0], sd * yp[1], yp[2]]), sp = Y.spread * D2R * (w === 'GD' ? .3 : 1);
    const v = nrm([a.x - p[0] + rand(-1, 1) * sp * a.d, a.y - p[1] + rand(-1, 1) * sp * a.d, a.z - p[2] + rand(-.5, 1) * sp * a.d]);
    H.hy--; F.hm.push({ k: 'hy', x: p[0], y: p[1], z: p[2], vx: H.vx + v[0] * Y.spd, vy: H.vy + v[1] * Y.spd, vz: H.vz + v[2] * Y.spd, t: 0, w, fl: w === 'FL', gd: w === 'GD', tx: a.x, ty: a.y, tz: a.z });
    F.emit('flash', p[0], p[1], p[2], { life: .06, s0: .8, s1: 1.4, col: [255, 200, 120] }); A() && A().local('hydra', .8);
  }
  F.heliHyMode = function () {   // [X] ganti hulu ledak Hydra: HE → FLECHETTE M255 → GD (APKWS berpemandu laser) → WP (fosfor putih) → HE
    const H = P.heli; if (!P.mnt || !H) return;
    H.hyW = (H.hyW + 1) % C.hy.war.length; F.msg(Tt('f_hy_' + C.hy.war[H.hyW].toLowerCase()), 'g'); A() && A().local('switch', .6);
  };
  F.hfire = [];   // lautan api fosfor putih (x, y, r, t, dur)
  function wpBurst(x, y, z) {   // hulu ledak WP: semburan pita asap putih melengkung + bara, lalu tanah terbakar beberapa detik
    const Y = C.hy.wp;
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 + rand(-.2, .2), sp = rand(8, 16); F.emit('smoke', x, y, z + .5, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(6, 15), life: rand(1.6, 2.6), s0: .5, s1: 2.6, col: [244, 244, 240], a: .8, g: 7, drag: .6 }); }
    for (let i = 0; i < 10; i++) F.emit('fire', x, y, z + .3, { vx: rand(-10, 10), vy: rand(-10, 10), vz: rand(4, 12), life: rand(.6, 1.1), s0: .5, s1: .2, col: [255, 236, 200], a: .95, g: 9 });
    F.hfire.push({ x, y, r: Y.r, t: 0, dur: Y.dur });
    F.scorch.push({ x, y, r: Y.r * .8, t: 0, life: 25 });
    A() && A().at('thud', x, y, 1.2);
  }
  function fireTick(dt) {   // fosfor putih membakar musuh yang berada di dalamnya (kendaraan juga terpanggang pelan)
    for (let i = F.hfire.length - 1; i >= 0; i--) {
      const f = F.hfire[i]; f.t += dt; if (f.t > f.dur) { F.hfire.splice(i, 1); continue; }
      const k = 1 - f.t / f.dur, gz = F.hAt(f.x, f.y);
      if (Math.random() < dt * 40 * k) { const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * f.r; F.emit('fire', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, gz + .2, { vx: rand(-.6, .6), vy: rand(-.6, .6), vz: rand(1.5, 3.5), life: rand(.4, .8), s0: 1.8, s1: .4, col: [255, rand(120, 190) | 0, 60], a: .85, drag: 1 }); }
      if (Math.random() < dt * 6 * k) F.emit('smoke', f.x + rand(-f.r, f.r) * .6, f.y + rand(-f.r, f.r) * .6, gz + 1, { vz: rand(2, 4), life: rand(2, 3), s0: 1, s1: 4, col: [225, 225, 220], a: .45 });
      for (const u of Q.units) {
        if (u.dead || u.team === 'B' || u.chute > 0 || u.fly || u.jet || Math.abs(u.x - f.x) > f.r + 2 || Math.abs(u.y - f.y) > f.r + 2) continue;
        if (Math.hypot(u.x - f.x, u.y - f.y) < f.r + F.hitbox(u).r) war.hurt(u, C.hy.wp.dps * dt * dmgK(), 'he', P.unit);
      }
    }
  }
  function flechette(m) {   // hulu ledak pecah di udara: kilatan + asap penanda merah, paku menyembur dalam kerucut ke depan
    const Y = C.hy.fl, v = nrm([m.vx, m.vy, m.vz]), k = dmgK();
    F.emit('flash', m.x, m.y, m.z, { life: .06, s0: 1, s1: 2.2, col: [255, 220, 160] }); F.puff(m.x, m.y, m.z, 3, [196, 66, 52], 2.2);
    for (let i = 0; i < Y.n; i++) {
      const d = nrm([v[0] + rand(-1, 1) * Y.cone, v[1] + rand(-1, 1) * Y.cone, v[2] + rand(-1, 1) * Y.cone]), tt = F.rayTerrain(m.x, m.y, m.z, d[0], d[1], d[2], Y.rng), t = tt > 0 ? tt : Y.rng;
      F.tracers.push({ x0: m.x, y0: m.y, z0: m.z, x1: m.x + d[0] * t, y1: m.y + d[1] * t, z1: m.z + d[2] * t, t: 0, life: rand(.08, .14), w: .022 });
      if (tt > 0 && i % 3 === 0) F.puff(m.x + d[0] * t, m.y + d[1] * t, m.z + d[2] * t, 1, [130, 118, 96], .7);   // debu tempat paku menancap
    }
    for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue;
      const hb = F.hitbox(u), ex = u.x - m.x, ey = u.y - m.y, ez = hb.z0 + hb.h * .5 - m.z, d = Math.hypot(ex, ey, ez); if (d > Y.rng + hb.r) continue;
      const a = Math.acos(clamp((ex * v[0] + ey * v[1] + ez * v[2]) / Math.max(d, .1), -1, 1)); if (a > Y.cone * 1.2 + Math.atan2(hb.r, d)) continue;
      war.hurt(u, (hb.human ? Y.dmg : Y.veh) * k * (1 - d / Y.rng * .5), 'small', P.unit); hitMark(u);
    }
    A() && A().at('shotgun', m.x, m.y, 1.2);
  }
  /* [R] STINGER: pencari inframerah mengunci pesawat musuh dekat garis bidik (nada makin rapat → nada kunci), tembak-lalu-lupakan */
  function seeker(H, dt) {
    const S = C.st; H.aaCd -= dt;
    if (!H.aaU || H.aam <= 0) { H.aaT = 0; return; }
    const was = H.aaT >= S.lock; H.aaT += dt; H.aaB -= dt;
    if (H.aaB <= 0) { H.aaB = H.aaT >= S.lock ? .09 : .26; A() && A().local('lock', H.aaT >= S.lock ? .7 : .35); }
    if (!was && H.aaT >= S.lock) F.msg(Tt('f_st_lock'), 'g');
  }
  F.heliStinger = function () {
    const H = P.heli, S = C.st; if (!P.mnt || !H || H.aaCd > 0) return;
    if (H.aam <= 0) { A() && A().local('empty', .6); return; }
    if (!H.aaU || H.aaU.dead || H.aaT < S.lock) { F.msg(Tt('f_st_no'), 'c'); A() && A().local('empty', .6); return; }
    H.aam--; H.aaCd = S.cd;
    const sd = H.aam % 2 ? 1 : -1, sp = AP().st, p = wp(H, [sp[0], sd * sp[1], sp[2]]), c = Math.cos(H.yaw), s = Math.sin(H.yaw);
    F.hm.push({ k: 'st', x: p[0], y: p[1], z: p[2], vx: H.vx + c * 30, vy: H.vy + s * 30, vz: H.vz + 3, t: 0, tg: H.aaU });
    for (let i = 0; i < 5; i++) F.emit('smoke', p[0], p[1], p[2], { vx: -c * rand(3, 8) + rand(-2, 2), vy: -s * rand(3, 8) + rand(-2, 2), vz: rand(-1, 1), life: rand(.6, 1.1), s0: .5, s1: 2, col: [226, 226, 220], a: .5 });
    A() && A().local('hydra', 1);
  };
  /* [Q] PROTOKOL BAYANGAN: lapisan penyerap radar + peredam mesin aktif, sensor menandai semua musuh di sekitar, meriam & rudal diperkuat */
  F.heliGhost = function () {
    const H = P.heli, G = C.ghost; if (!P.mnt || !H) return;
    if (H.ghCd > 0) { F.msg(Tt('f_gh_cd', { s: Math.ceil(H.ghCd) }), 'c'); A() && A().local('empty', .6); return; }
    H.ghT = G.dur; H.ghCd = G.cd;
    for (const p of Q.projs) if (p.kind === 'missile' && !p.done && p.tgt === H.u) { p.tgt = null; p.tx = H.x + rand(-120, 120); p.ty = H.y + rand(-120, 120); }   // rudal yang sudah mengunci kehilangan sasaran
    let n = 0;
    for (const u of Q.units) if (u.team === 'R' && !u.dead && Math.hypot(u.x - H.x, u.y - H.y) < G.mark) { u.tagT = P.time + G.dur; n++; }
    F.msg(Tt('f_gh_on', { n }), 'g'); A() && A().local('streak', .9);
  };
  const dmgK = () => (P.heli && P.heli.ghT > 0 ? C.ghost.dmg : 1) * (C.diffK[Q.diff] || 1);   // Protokol Bayangan × tingkat kesulitan (musuh SULIT/PRO lebih tebal → senjata heli ikut diperkuat)
  /* pasokan BBM (bantuan [B]): kontainer bahan bakar diterjunkan ke heli yang sedang di darat */
  F.heliFuelDrop = function () {
    const H = P.heli; if (!H || H.u.dead) return 'f_ci_nohe';
    if (H.drop > 0) return 'f_ci_busy';
    if (H.fuel >= C.fuel - 1) return 'f_ci_full';
    if ((P.mnt && agl(H) > 1) || H.st === 'auto' || H.st === 'inbound') return 'f_ci_air';
    H.drop = C.refuel.drop; return true;
  };
  function refuel(H, dt) {
    const onGnd = P.mnt ? agl(H) < .3 : H.st === 'landed';
    if (H.drop > 0) {   // asap sinyal hijau di dekat heli sampai kontainer tiba
      H.drop -= dt; if (Math.random() < dt * 12) F.emit('smoke', H.x + Math.cos(H.yaw + 1.6) * 6, H.y + Math.sin(H.yaw + 1.6) * 6, F.hAt(H.x, H.y) + .3, { vz: 3, life: 3, s0: .6, s1: 3.2, col: [90, 230, 110], a: .6 });
      if (H.drop <= 0) { H.fuel = C.fuel; H.bingo = false; F.puff(H.x, H.y, F.hAt(H.x, H.y) + .5, 8, [140, 130, 110], 3); F.msg(Tt('f_ah_refueled'), 'g'); A() && A().local('reload', .8); }
    }
    // mendarat di HQ sendiri / pos yang dikuasai (FARP): isi BBM bertahap, amunisi diisi penuh setelah refuel.arm dtk
    const zone = onGnd && (Math.hypot(H.x - Q.hqB.x, H.y - Q.hqB.y) < 160 || Q.objs.some(o => o.owner === 'B' && Math.hypot(H.x - o.x, H.y - o.y) < Math.max(o.r, 60)));
    let farp = zone && H.fuel < C.fuel;
    const full = fullArm(), low = H.hf < full.hf || H.hy < full.hy || H.aam < full.aam || H.fl < full.fl || H.ga.some((a, i) => a < full.ga[i]);
    if (zone && low) { if (!H.armT) F.msg(Tt('f_ah_arming'), 'g'); H.armT += dt; if (H.armT >= C.refuel.arm) { Object.assign(H, full); H.armT = 0; F.msg(Tt('f_ah_rearm'), 'g'); A() && A().local('reload', .8); } }
    else H.armT = 0;
    if (farp) {
      if (!H.farp) F.msg(Tt('f_ah_farp'), 'g');
      H.fuel = Math.min(C.fuel, H.fuel + C.fuel / C.refuel.farp * dt);
      if (H.fuel >= C.fuel) { H.bingo = false; F.msg(Tt('f_ah_refueled'), 'g'); farp = false; }
    }
    H.farp = farp;
  }
  F.heliFlare = function () {   // flare: rudal yang sedang & akan mengejar heli (selama dur) tertipu
    const H = P.heli; if (!P.mnt || !H || H.fcd > 0) return;
    if (H.fl <= 0) { A() && A().local('empty', .6); return; }
    H.fl--; H.fcd = C.flare.cd; H.flT = C.flare.dur;
    for (let i = 0; i < 16; i++) { const sd = i % 2 ? 1 : -1, c = Math.cos(H.yaw), s = Math.sin(H.yaw); F.emit('fire', H.x, H.y, H.z - .5, { vx: -c * rand(6, 14) - s * sd * rand(8, 18) + H.vx, vy: -s * rand(6, 14) + c * sd * rand(8, 18) + H.vy, vz: rand(-2, 6), life: rand(1.6, 2.4), s0: .9, s1: .5, col: [255, 236, 190], a: .95, g: 5 }); }
    F.msg(Tt('f_ah_flare'), 'g'); A() && A().local('flare', 1);
  }
  function tickMissiles(dt) {
    for (let i = F.hm.length - 1; i >= 0; i--) {
      const m = F.hm[i]; m.t += dt;
      if (m.k === 'hf') {   // lepas dari rel (jatuh sesaat) → motor menyala & berakselerasi → kurva pemandu halus ke sasaran
        const HF = C.hf;
        if (m.t < HF.drop) m.vz -= 9.8 * dt;
        else {
          if (!m.lit) {   // motor roket menyala: kilatan + kepulan asap
            m.lit = true; F.emit('flash', m.x, m.y, m.z, { life: .08, s0: 1, s1: 2.2, col: [255, 210, 140] });
            for (let j = 0; j < 5; j++) F.emit('smoke', m.x, m.y, m.z, { vx: -m.vx * .08 + rand(-2, 2), vy: -m.vy * .08 + rand(-2, 2), vz: rand(-1, 2), life: rand(.9, 1.5), s0: .6, s1: 2.6, col: [228, 228, 222], a: .6 });
            A() && A().local('hellfire', .9);
          }
          const tg = m.tg && !m.tg.dead ? m.tg : null, hb = tg && F.hitbox(tg), tx = tg ? tg.x : m.tx, ty = tg ? tg.y : m.ty, tz = tg ? hb.z0 + hb.h * .5 : m.tz;
          const e = Math.min(1, (m.t - HF.drop) / HF.boost), sp = HF.v0 + (HF.spd - HF.v0) * (1 - (1 - e) * (1 - e)), d = hfSteer(m, tx, ty, tz, dt);   // laju naik halus (ease-out)
          m.vx = d[0] * sp; m.vy = d[1] * sp; m.vz = d[2] * sp;
        }
      } else if (m.k === 'hy' && m.gd) {   // Hydra APKWS: pencari laser mengikuti titik bidik penembak saat ini (belok terbatas gd rad/dtk)
        const H = P.heli, a = P.mnt && H && H.aim ? H.aim : { x: m.tx, y: m.ty, z: m.tz }, sp = Math.hypot(m.vx, m.vy, m.vz), cur = nrm([m.vx, m.vy, m.vz]);
        let d = cur;
        if (m.t > .12) { const want = nrm([a.x - m.x, a.y - m.y, a.z - m.z]), k = Math.min(1, dt * C.hy.gd); d = nrm([cur[0] + (want[0] - cur[0]) * k, cur[1] + (want[1] - cur[1]) * k, cur[2] + (want[2] - cur[2]) * k]); }
        m.vx = d[0] * sp; m.vy = d[1] * sp; m.vz = d[2] * sp;
      } else if (m.k === 'gl') m.vz -= 9.8 * dt;   // granat 40 mm: balistik penuh
      else if (m.k === 'st') {   // Stinger: motor kuat, belok tajam mengikuti pesawat; tanpa sasaran terbang lurus
        const tg = m.tg && !m.tg.dead ? m.tg : null, sp = Math.min(C.st.spd, 60 + m.t * 600), cur = nrm([m.vx, m.vy, m.vz]);
        let d = cur;
        if (tg) { const hb = F.hitbox(tg), want = nrm([tg.x - m.x, tg.y - m.y, hb.z0 + hb.h * .5 - m.z]), k = m.t < .15 ? 0 : Math.min(1, dt * 7); d = nrm([cur[0] + (want[0] - cur[0]) * k, cur[1] + (want[1] - cur[1]) * k, cur[2] + (want[2] - cur[2]) * k]); }
        m.vx = d[0] * sp; m.vy = d[1] * sp; m.vz = d[2] * sp;
      } else m.vz -= 4 * dt;   // Hydra: balistik
      let hit = null;
      const n = Math.max(1, Math.ceil(Math.hypot(m.vx, m.vy, m.vz) * dt / 2.5));
      for (let j = 0; j < n && !hit; j++) {
        m.x += m.vx * dt / n; m.y += m.vy * dt / n; m.z += m.vz * dt / n;
        if (!F.inb(m.x, m.y) || m.z < F.hAt(m.x, m.y)) { hit = { u: null }; break; }
        for (const u of Q.units) {
          if (u.dead || u.team === 'B' || u.chute > 0 || Math.abs(u.x - m.x) > 9 || Math.abs(u.y - m.y) > 9) continue;
          const hb = F.hitbox(u); if (Math.hypot(u.x - m.x, u.y - m.y) < hb.r + .6 && m.z > hb.z0 - .6 && m.z < hb.z0 + hb.h + .6) { hit = { u }; break; }
        }
        if (!hit && m.k === 'hf' && m.tg && !m.tg.dead && F.isHuman(m.tg.type)) { const hb = F.hitbox(m.tg); if (Math.hypot(m.tg.x - m.x, m.tg.y - m.y, hb.z0 + hb.h * .5 - m.z) < 2.5) hit = { u: m.tg }; }   // sasaran infanteri: sumbu jarak dekat
        if (!hit && m.k === 'st' && m.tg && !m.tg.dead) { const hb = F.hitbox(m.tg); if (Math.hypot(m.tg.x - m.x, m.tg.y - m.y, hb.z0 + hb.h * .5 - m.z) < C.st.fuze + hb.r * .5) hit = { u: m.tg }; }   // sumbu jarak dekat
      }
      if (!hit && m.fl && m.t > .12 && Math.hypot(m.x - m.tx, m.y - m.ty, m.z - m.tz) < C.hy.fl.burst) { F.hm.splice(i, 1); flechette(m); continue; }
      if (m.t % .03 < dt && (m.k !== 'hf' || m.lit)) F.emit('smoke', m.x, m.y, m.z, m.k === 'gl' ? { life: .5, s0: .15, s1: .5, col: [190, 190, 186], a: .35 } : { life: m.k === 'hy' ? 1 : 1.8, s0: .4, s1: m.k === 'hy' ? 1.2 : 2, col: [228, 228, 222], a: .55 });
      if (!hit && m.t < (m.k === 'st' ? 7 : m.k === 'hf' ? 15 : 9)) continue;
      F.hm.splice(i, 1);
      const k = dmgK();
      if (m.k === 'gl') { const G = C.guns[4]; war.explode(m.x, m.y, G.r, G.dmg * k, 'he', P.unit); if (hit && hit.u) hitMark(hit.u); if (m.z > F.hAt(m.x, m.y) + 4) F.boom3d(m.x, m.y, m.z, 3); continue; }
      if (m.k === 'hy' && m.w === 'WP') { war.explode(m.x, m.y, C.hy.r * .7, C.hy.dmg * k * .5, 'he', P.unit); wpBurst(m.x, m.y, Math.max(m.z, F.hAt(m.x, m.y))); continue; }
      if (m.k === 'hf') {
        const u = hit && hit.u, top = u && !u.fly && !u.jet && m.vz < -.3 * Math.hypot(m.vx, m.vy, m.vz) ? C.hf.top : 1;   // menukik menembus atap tipis
        if (u) { war.hurt(u, C.hf.dmg * k * top, 'ap', P.unit); hitMark(u); } war.explode(m.x, m.y, C.hf.r, C.hf.dmg * k * .35, 'he', P.unit);
      } else if (m.k === 'st') {   // hulu ledak fragmentasi: pesawat lain yang berdekatan ikut terkena
        const u0 = hit && hit.u;
        if (u0) { war.hurt(u0, C.st.dmg * k, 'aa', P.unit); hitMark(u0); }
        for (const u of Q.units) if (u !== u0 && !u.dead && u.team !== 'B' && (u.fly || u.jet)) { const hb = F.hitbox(u), d = Math.hypot(u.x - m.x, u.y - m.y, hb.z0 + hb.h * .5 - m.z); if (d < C.st.r + hb.r) { war.hurt(u, C.st.dmg * k * .4, 'aa', P.unit); hitMark(u); } }
        F.boom3d(m.x, m.y, m.z, 5); A() && A().boom(m.x, m.y, 3); continue;
      } else war.explode(m.x, m.y, C.hy.r, C.hy.dmg * k * (m.fl ? .35 : 1), 'he', P.unit);   // flechette yang menghantam sebelum pecah: muatan pecah kecil
      if (m.z > F.hAt(m.x, m.y) + 8) F.boom3d(m.x, m.y, m.z, m.k === 'hf' ? 7 : 5);   // ledakan di udara (sasaran terbang)
    }
  }

  /* ---------- naik / turun ---------- */
  F.heliNear = function () {
    const H = P.heli; if (!H || P.mnt || P.veh || H.u.dead || (H.st !== 'landed' && H.st !== 'auto') || agl(H) > 2) return null;
    return Math.hypot(H.x - P.x, H.y - P.y) < 10 && Math.abs(H.z - P.z) < 6 ? H : null;
  };
  F.heliUse = function () {   // tombol E
    if (!P.alive) return false;
    if (P.mnt) { F.heliExit(); return true; }
    const H = F.heliNear(); if (!H || P.gs || P.chute || P.swim) return false;
    if (H.fuel <= 0) { F.msg(Tt('f_ah_nofuel'), 'c'); A() && A().local('empty', .6); return false; }
    P.mnt = true; Object.assign(P, { ads: 0, relT: 0, sprint: false, crouch: false, melT: 0, gT: 0, cycT: 0, eq: null, yaw: H.yaw, pitch: -.12 });
    F.in.fire = F.in.ads = false; H.adsPrev = false; H.pl = []; H.pC = null; H.aaU = null; H.aaT = 0;
    const go = () => { H.st = 'air'; F.msg(Tt('f_ah_in'), 'g'); A() && A().local('spawn', .8); };
    if (!F.entry || !F.entry({ id: 'AH64', o: H, u: H.u }, go)) go();   // animasi orang pertama: buka pintu kaca kokpit, naik, duduk; rotor baru dinaikkan setelah duduk
    return true;
  };
  F.heliExit = function () {
    const H = P.heli; if (!P.mnt || !H) return;
    P.mnt = false; F.camHide = null; F.in.fire = F.in.ads = false;
    const c = Math.cos(H.yaw), s = Math.sin(H.yaw), h = agl(H), cr = H.st === 'crash';   // cr: melompat dari heli yang sedang jatuh
    let x = H.x + c * 1.5 + s * 3.2, y = H.y + s * 1.5 - c * 3.2;   // pintu kiri kokpit
    if (F.solid(x, y) || F.water(x, y) !== F.water(H.x, H.y)) { x = H.x + c * 1.5 - s * 3.2; y = H.y + s * 1.5 + c * 3.2; }
    Object.assign(P, { x, y, vx: H.vx * .5, vy: H.vy * .5, yaw: cr ? P.yaw : H.yaw, pitch: 0, swT: .4, spd: 0 });
    if (cr) { const dx = x - H.x, dy = y - H.y, l = Math.hypot(dx, dy) || 1; P.vx += dx / l * C.crash.push; P.vy += dy / l * C.crash.push; }   // melompat menjauh dari badan heli
    if (h < 3.5) { P.z = F.hAt(x, y); P.vz = 0; P.grounded = true; if (!cr) H.st = h < .5 ? 'landed' : 'auto'; }
    else {
      P.z = H.z - 1.5; P.vz = cr ? Math.max(H.vz, -12) : H.vz; P.grounded = false; if (!cr) H.st = 'auto';
      if (h > (cr ? C.crash.chute : 22)) { P.chute = 2; P.bail = true; A() && A().local('chute', .8); F.msg(Tt('f_ah_bail'), 'w'); }
    }
    P.unit.x = P.x; P.unit.y = P.y;
  };
  function down(H) {   // Apache hancur: ledakan di udara, pilot terlempar keluar (parasut bila cukup tinggi)
    const was = P.mnt, low = agl(H) < 22;
    if (was) { F.heliExit(); F.msg(Tt('f_ah_down'), 'c'); }
    for (let i = 0; i < 18; i++) F.emit('debris', H.x, H.y, H.z, { vx: rand(-14, 14), vy: rand(-14, 14), vz: rand(2, 16), life: rand(1, 2), s0: .35, s1: .35, col: [60, 62, 52], g: 16 });
    P.heli = null; F.camHide = null;
    if (was && low && P.alive) war.hurt(P.unit, 60, 'he', null);
  }

  /* ---------- HP habis: kehilangan keseimbangan, berputar, jatuh; [E] = lompat keluar ---------- */
  war.hooks.dying = function (u, src) {   // dipanggil war.kill: tunda penghapusan selama heli jatuh
    const H = P.heli; if (!H || H.u !== u || H.done) return false;
    if (src && src.team === 'R') H.killer = src;
    u.hp = 0;
    if (H.st !== 'crash') startCrash(H);
    return true;
  };
  function startCrash(H) {
    if (agl(H) < 3) { impact(H); return; }   // sudah di tanah: langsung meledak
    Object.assign(H, { st: 'crash', crT: 0, spin: Math.random() < .5 ? -1 : 1, cam: 0, zoom: 0, yq: 0, rq: [], pl: [], alT: 0, flT: 0, ghT: 0, rc: 0 }); F.hbeam = null;
    if (P.gs && P.mnt) F.gsExit();
    const t = wp(H, AP().tail);   // rotor ekor meledak
    F.boom3d(t[0], t[1], t[2], 4, true); A() && A().boom(H.x, H.y, 6);
    for (let i = 0; i < 12; i++) F.emit('debris', t[0], t[1], t[2], { vx: rand(-9, 9), vy: rand(-9, 9), vz: rand(-2, 9), life: rand(1, 2), s0: .3, s1: .3, col: [40, 42, 40], g: 16 });
    if (P.mnt) { P.shake = Math.min(1.6, P.shake + 1); F.msg(Tt('f_ah_crash'), 'c'); A() && A().local('warn', 1); }
  }
  function crashTick(H, dt) {
    const K = C.crash, g = AP().gear; H.crT += dt;
    H.yr += (H.spin * K.spin - H.yr) * Math.min(1, dt * .9); H.yaw = wrapPi(H.yaw + H.yr * dt);   // rotor ekor hilang: badan berputar makin cepat
    H.vz = Math.max(H.vz - K.g * dt, -K.vmax);   // daya angkat rotor utama tinggal sedikit
    const dr = Math.max(0, 1 - dt * .4); H.vx = H.vx * dr - Math.sin(H.yaw) * H.spin * K.slide * dt; H.vy = H.vy * dr + Math.cos(H.yaw) * H.spin * K.slide * dt;   // lintasan melengkung ikut putaran
    const nx = clamp(H.x + H.vx * dt, 20, W.WW - 20), ny = clamp(H.y + H.vy * dt, 20, W.WH - 20);
    if (floorZ(nx, ny) + g > H.z) { H.vx = H.vy = 0; } else { H.x = nx; H.y = ny; }
    H.z += H.vz * dt;
    H.rol = Math.sin(H.crT * 2.7) * .3 + H.spin * Math.min(.45, H.crT * .15);   // oleng ke samping, makin miring
    H.pit = Math.sin(H.crT * 1.9 + 1) * .2 - Math.min(.3, H.crT * .08);   // hidung mengangguk lalu menukik
    H.rot += (.6 - H.rot) * Math.min(1, dt * .5);
    for (let i = 0; i < 2; i++) {   // mesin terbakar: api + jejak asap hitam
      const e = wp(H, [-1.6 + rand(-.4, .4), rand(-.6, .6), 1.6]);
      F.emit('fire', e[0], e[1], e[2], { vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(1, 3), life: rand(.3, .6), s0: 1.3, s1: .4, col: [255, rand(110, 170) | 0, 40], a: .85, drag: 1 });
      F.emit('smoke', e[0], e[1], e[2] + .5, { vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(1, 3), life: rand(2.5, 4), s0: 1.2, s1: 5, col: [30, 30, 30], a: .7, drag: .4 });
    }
    if (Math.random() < dt * 6) F.sparks(H.x, H.y, H.z + 1, 3);
    H.alT -= dt;
    if (H.alT <= 0) { H.alT = .4; if (P.mnt) A() && A().local('lock', 1); }   // alarm kokpit
    H.rT -= dt;
    if (H.rT <= 0) { H.rT = .085 / H.rot; if (P.mnt) A() && A().local('rotor', .5 * H.rot); else if (Math.hypot(H.x - P.x, H.y - P.y) < 700) A() && A().at('rotor', H.x, H.y, .9 * H.rot); }
    sync(H);
    if (P.mnt) {   // operator masih di kursi: ikut terguncang
      Object.assign(P, { x: H.x, y: H.y, z: H.z - .4, vx: H.vx, vy: H.vy, vz: 0, spd: Math.hypot(H.vx, H.vy) });
      P.unit.x = H.x; P.unit.y = H.y; P.shake = Math.max(P.shake, .35 + Math.min(.5, H.crT * .1));
    }
    if (H.z <= floorZ(H.x, H.y) + g + .3) impact(H);
  }
  function impact(H) {   // menghantam tanah: ledakan besar; operator yang masih di dalam gugur
    const x = H.x, y = H.y, z = floorZ(x, y), was = P.mnt, K = C.crash;
    H.done = true;
    if (was) {   // gugur lebih dulu agar ledakan bangkai tidak tercatat sebagai pembunuh
      P.mnt = false; F.camHide = null; F.in.fire = F.in.ads = false; Object.assign(P, { x, y, z: F.hAt(x, y), vx: 0, vy: 0, vz: 0 }); P.unit.x = x; P.unit.y = y;
      if (P.alive) { F.msg(Tt('f_ah_down'), 'c'); P.unit.hp = 0; F.die(H.killer || null); }
    }
    war.explode(x, y, K.r, K.dmg, 'he', null);   // bangkai menghantam: melukai siapa saja di dekatnya
    F.boom3d(x, y, z + 1, 20, true); A() && A().boom(x, y, 20);
    F.shock.push({ x, y, R: K.r * 2.4, t: 0, life: .7 });
    for (let i = 0; i < 4; i++) F.scorch.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), r: rand(5, 8), t: 0, life: 20 });
    for (let i = 0; i < 24; i++) F.emit('debris', x, y, z + 1, { vx: rand(-18, 18), vy: rand(-18, 18), vz: rand(4, 20), life: rand(1.2, 2.4), s0: .4, s1: .4, col: [38, 40, 38], g: 16 });
    war.kill(H.u, H.killer || null);
    F.corpses.push({ x, y, type: 'AH64', team: H.u.team, face: H.yaw, t: 0, human: 0, life: 5, fire: 5, fly: true, ctl: true, pp: -.07, rol: (H.spin || 1) * .24, dz: .25, rph: (H.rph || 0) % 6.28, rotK: 0 });   // bangkai 5 dtk lalu hilang
    P.heli = null; F.camHide = null;
  }

  /* ---------- tiap frame (selalu, juga saat tidak dinaiki) ---------- */
  F.heliTick = function (dt) {
    tickMissiles(dt); fireTick(dt);
    if (!P.mnt) F.hbeam = null;
    const H = P.heli; if (!H) return;
    if (H.gen !== Q.g) { P.heli = null; P.mnt = false; F.camHide = null; return; }
    if (H.u.dead) { down(H); return; }
    if (H.st === 'crash') { H.rph += dt * 31 * H.rot; crashTick(H, dt); return; }
    H.rph += dt * 31 * H.rot; H.gcd -= dt; H.hcd -= dt; H.ycd -= dt; H.fcd -= dt; H.flT -= dt; H.ghCd -= dt;
    if (H.ghT > 0) { H.ghT -= dt; if (H.ghT <= 0) F.msg(Tt('f_gh_off'), 'w'); }
    H.u.stealth = H.ghT > 0 ? .1 : 1;   // Protokol Bayangan: musuh hanya bisa melihat heli dari jarak sangat dekat
    refuel(H, dt);
    if (H.yq > 0) { H.ys -= dt; if (H.ys <= 0) { H.ys = C.hy.gap; H.yq--; if (H.hy > 0) hydraOne(H); } }
    if (H.rq.length) { H.rs -= dt; if (H.rs <= 0) { H.rs = C.hf.gap; const t = H.rq.shift(); if (H.hf > 0 && H.aim) hellfire(H, t && !t.dead ? t : null); } }   // Hellfire beruntun
    // peringatan rudal & flare
    let mw = false;
    for (const p of Q.projs) {
      if (p.kind !== 'missile' || p.done || p.tgt !== H.u) continue;
      if (H.flT > 0 || H.ghT > 0) { p.tgt = null; p.tx = H.x + rand(-90, 90); p.ty = H.y + rand(-90, 90); continue; }   // rudal terkecoh flare
      mw = true;
    }
    if (mw && !H.mw && P.mnt) F.msg(Tt('f_ah_mw'), 'c');
    H.mw = mw; H.warnT -= dt;
    if (mw && P.mnt && H.warnT <= 0) { H.warnT = .4; A() && A().local('lock', .8); }
    if (!P.mnt) autopilot(H, dt);
    if (!P.heli) return;
    if (H.u.hp < H.lastHp && P.mnt) { const k = H.lastHp - H.u.hp; P.lastHurt = P.time; P.shake = Math.min(1.4, P.shake + clamp(k / 90, .05, .5)); A() && A().local('hurt', clamp(k / 60, .3, .8)); }
    H.lastHp = H.u.hp;
    if (H.u.hp < H.u.hpMax * .35 && Math.random() < dt * 10) F.emit('smoke', H.x - Math.cos(H.yaw) * 1.5, H.y - Math.sin(H.yaw) * 1.5, H.z + 1, { vz: 2, life: 2.5, s0: .8, s1: 3, col: [36, 36, 36], a: .6 });   // mesin rusak berasap
    H.rT -= dt;   // suara rotor: hentakan bilah berulang, makin cepat saat mesin penuh
    if (H.rT <= 0) { H.rT = .085 / Math.max(.3, H.rot); if (P.mnt) A() && A().local('rotor', .5 * H.rot); else if (Math.hypot(H.x - P.x, H.y - P.y) < 700) A() && A().at('rotor', H.x, H.y, .9 * H.rot); }
    sync(H);
  };
  F.heliClear = function () { if (P.heli) P.heli.u.dead = true; P.heli = null; P.mnt = false; F.camHide = null; F.hm.length = 0; F.hfire.length = 0; F.hbeam = null; };
})();
