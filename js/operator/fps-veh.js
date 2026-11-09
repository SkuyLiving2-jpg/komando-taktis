/* ============================================================
   FPS-VEH — kendaraan yang dikemudikan sendiri oleh operator,
   dibeli dengan kredit di menu [T] (bagian bawah daftar):
   HUMVEE M1151 (datang menyetir sendiri ke operator), panser
   amfibi SANCA 6×6 (digantung di bawah heli angkut), MBT BADAI
   (diterjunkan pesawat kargo: 3 parasut + roket pengerem), jet
   VTOL ELANG (terbang masuk lalu mendarat tegak).
   [E] naik/turun, mouse = kubah / arah pandang, [V] kamera
   orang-ketiga ↔ kursi penembak, [RMB] zoom (darat).
   Kendaraan = unit war (u.ctl: AI sim tidak menggerakkannya) —
   musuh menembak kendaraannya, bukan operator di dalamnya
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, UT = W.UT, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q;
  const { clamp, rand, wrapPi } = TK.util;
  const A = () => TK.fpsaudio, Tt = (k, v) => TK.t(k, v), D2R = Math.PI / 180, VD = F.VEH;
  const MX = () => F.MDL.X, VX = t => F.MDL.VEHX[t];
  F.vehs = []; F.vp = []; F.vprops = []; F.vchutes = []; F.vlines = []; P.veh = null;
  const CR = [];   // pengantar yang sedang terbang pergi (pesawat kargo / heli angkut): hanya digambar, bukan unit sim
  let pid = 9e6;

  /* ---------- util ---------- */
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const vname = V => Tt('f_vh_' + V.id);
  const src = () => P.alive && P.unit && !P.unit.dead ? P.unit : null;
  const hitMark = u => { P.lastHead = false; if (!P.hit || P.hit.t !== P.time || !P.hit.kill) P.hit = { t: P.time, kill: u.dead, head: false }; };
  const floorZ = (x, y) => Math.max(F.hAt(x, y), F.WZ + .6);
  const frame = V => { const X = MX(); return X.chain(X.T(V.x, V.y, V.z), X.rz(V.yaw), X.ry(V.pit), X.rx(V.rol)); };
  const wp = (V, p) => MX().ap(frame(V), p);
  function turFrame(V) { const X = MX(), C = VX(V.id); return X.chain(frame(V), X.T(C.tur, 0, 0), X.rz(V.ty - V.yaw), X.T(-C.tur, 0, 0)); }
  function gunFrame(V) { const X = MX(), g = VX(V.id).gp; return X.chain(turFrame(V), X.T(g[0], g[1], g[2]), X.ry(V.gE), X.T(-g[0], -g[1], -g[2])); }
  function ballistic(v, d, h) {   // sudut elevasi lintasan rendah agar peluru (gravitasi 9,8) jatuh di jarak d, beda tinggi h; null = di luar jangkauan
    const g = 9.8, q = v * v * v * v - g * (g * d * d + 2 * h * v * v); if (q < 0 || d < 1) return null;
    return Math.atan((v * v - Math.sqrt(q)) / (g * d));
  }
  function hurtV(V, dmg) { const u = V.u; if (!u || u.dead || dmg <= 0) return; u.hp -= dmg; u.hitT = Q.t; if (u.hp <= 0) war.kill(u, null); }
  function prop(type, x, y, z, yaw) {   // aktor gambar (pengantar): bentuk unit secukupnya untuk drawUnit fps-gl
    const a = { id: pid++, type, team: 'B', x, y, fly: true, jet: false, alt: z - F.hAt(x, y), hdg: yaw, face: yaw, pose: { z, yaw, pit: 0, rol: 0 }, rph: 0, hitT: -9, revealT: -9, chute: 0, dead: false };
    F.vprops.push(a); return a;
  }
  function propSet(a, x, y, z, yaw, pit, rol) { a.x = x; a.y = y; a.alt = z - F.hAt(x, y); a.hdg = a.face = yaw; a.pose = { z, yaw, pit: pit || 0, rol: rol || 0 }; }
  const propDel = a => { const i = F.vprops.indexOf(a); if (i >= 0) F.vprops.splice(i, 1); };

  /* ---------- membuat / mengisi ulang ---------- */
  function mkVeh(id, x, y, z, yaw, noUnit) {
    const D = VD[id];
    const V = { id, D, u: null, gen: Q.g, air: D.arr === 'vtol' || !!D.fw, gnd: !!D.fw, spin: 0, sndT: 0, hl: [], hq: [], hs: 0, hcd: 0, hom: 0, hpi: 0, gearCmd: 1, gearMan: false, x, y, z, yaw, pit: 0, rol: 0, vx: 0, vy: 0, vz: 0, yr: 0, ty: yaw, gE: 0, rec: 0, st: 'in', arr: null,
      cam: 0, wi: 0, mag: [], res: [], cd: [], relT: 0, relI: 0, dry: false, smk: 0, smT: 0, smCd: 0, atg: 0, aq: 0, as: 0, acd: 0, agm: 0, aam: 0, bomb: 0, fl: 0,
      mcd: 0, aaCd: 0, bcd: 0, fcd: 0, flT: 0, lock: null, aaU: null, aaT: 0, aaB: 0, mode: 'hov', spd: 0, thr: .3, noz: Math.PI / 2, gear: 1, fly: false, gvz: 0,
      engT: 0, lastHp: 0, mw: false, warnT: 0, aim: null, bAim: null, adsPrev: false, hornT: 0, bump: 0, acc: 0, dmgT: 0 };
    refit(V); F.vehs.push(V); if (!noUnit) attach(V); return V;
  }
  function attach(V) {   // unit sim dibuat saat kendaraan benar-benar ada di medan (kargo pesawat: saat diterjunkan)
    V.u = war.mk('B', V.id, V.x, V.y, { ctl: true, hdg: V.yaw, face: V.yaw }); V.u.seats = V.D.seats || 1;
    if (V.D.hpK) V.u.hp = V.u.hpMax = V.u.hpMax * (F.APACHE.hpK[Q.diff] || 1);   // WOLFPACK: lapis baja diperkuat per tingkat kesulitan persis seperti Shadow Hunter (nyawa dasar 90%) V.lastHp = V.u.hp; sync(V);   // seats: pasukan bisa menumpang (war.board)
  }
  function refit(V) {
    const D = V.D; D.w.forEach((w, i) => { V.mag[i] = w.mag || w.n; V.res[i] = w.n - V.mag[i]; V.cd[i] = 0; });
    Object.assign(V, { smk: D.smoke ? D.smoke.n : 0, atg: D.atgm ? D.atgm.n : 0, agm: D.agm ? D.agm.n : 0, aam: D.aam ? D.aam.n : 0, bomb: D.bomb ? D.bomb.n : 0, fl: D.flare ? D.flare.n : 0, hom: D.hom ? D.hom.n : 0, relT: 0 });
    if (V.u) { V.u.hp = V.u.hpMax; V.lastHp = V.u.hp; }
  }
  function sync(V) {
    const u = V.u; if (!u) return;
    u.x = V.x; u.y = V.y; u.hdg = V.yaw; u.face = V.air ? V.yaw : V.ty; u.gunE = V.gE; u.rec = V.rec;
    u.pose = { z: V.z + (V.bob || 0), yaw: V.yaw, pit: V.pit, rol: V.rol }; u.steer = (u.steer || 0) + ((V.str || 0) * .5 - (u.steer || 0)) * .25;
    if (V.air) { u.alt = V.z - F.hAt(V.x, V.y); u.lowA = u.alt < 150; u.noz = V.noz; u.gearK = V.gear; }
    u.stealth = V.smT > 0 ? .15 : 1;   // tabir asap: musuh hampir tidak bisa melihat kendaraan
  }

  /* ---------- pesan (menu [T]) ---------- */
  F.vehState = id => { const V = F.vehs.find(v => v.id === id); return !V ? 'none' : V.st === 'in' ? 'in' : 'ok'; };
  F.vehPrice = id => Math.round(VD[id].cost * (F.vehState(id) === 'ok' ? F.VEH_REFIT : 1));
  function padSpot(D) {   // lahan datar & lapang (jari-jari D.pad) di depan/samping operator, tidak menimpa kendaraan lain / Shadow Hunter
    const r = D.pad;
    for (let k = 0; k < 64; k++) {
      const a = P.yaw + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * .3, d = D.d0 + (k >> 3) * 7, x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
      if (x < 60 || y < 60 || x > W.WW - 60 || y > W.WH - 60 || F.water(x, y) || F.lava(x, y) || F.solid(x, y)) continue;
      if (F.vehs.some(v => Math.hypot(v.x - x, v.y - y) < r + 9) || (P.heli && Math.hypot(P.heli.x - x, P.heli.y - y) < r + 10)) continue;
      const h = F.hAt(x, y); let ok = true;
      for (let i = 0; i < 12 && ok; i++) { const b = i * .5236, px = x + Math.cos(b) * r, py = y + Math.sin(b) * r; if (F.solid(px, py) || F.water(px, py) || Math.abs(F.hAt(px, py) - h) > Math.max(1, r * .3)) ok = false; }
      if (ok && !F.treeNear(x, y, r * .9)) return [x, y];
    }
    return null;
  }
  function clearRun(x0, y0, x1, y1, D) {   // jalur lurus untuk menyetir masuk: tanpa gedung, lava, air dalam, pohon, atau tanjakan terjal
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 3), nx = -(y1 - y0) / d, ny = (x1 - x0) / d; let hp = F.hAt(x0, y0);
    for (let i = 1; i <= n; i++) {
      const k = i / n, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, h = F.hAt(x, y);
      for (const o of [-1.8, 0, 1.8]) { const px = x + nx * o, py = y + ny * o; if (F.solid(px, py) || F.lava(px, py) || F.depth(px, py) > D.ford * .7 || F.treeNear(px, py, 1)) return false; }
      if (Math.abs(h - hp) > 3 * D.slope * .7) return false; hp = h;
    }
    return true;
  }
  const fromBase = pad => Math.atan2(pad[1] - Q.hqB.y, pad[0] - Q.hqB.x);   // arah datang: dari pangkalan sendiri
  function inbound(pad, R) {   // arah masuk (dari pangkalan bila bisa) yang titik awalnya sejauh R masih di dalam peta
    const b = fromBase(pad);
    for (let k = 0; k < 24; k++) { const hd = b + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .26, x = pad[0] - Math.cos(hd) * R, y = pad[1] - Math.sin(hd) * R; if (x > 60 && y > 60 && x < W.WW - 60 && y < W.WH - 60) return hd; }
    return null;
  }
  const START = {
    drive(id, D, pad) {   // HUMVEE / PANSER / TANK: datang menyetir dari arah pangkalan lewat jalur bersih (kendaraan lambat mulai lebih dekat agar tak lama menunggu)
      const base = fromBase(pad) + Math.PI, kR = Math.min(1, D.spd / 24);
      for (const R0 of [260, 200, 150, 110, 75]) for (let k = 0; k < 24; k++) {
        const R = R0 * kR, a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .27, x = pad[0] + Math.cos(a) * R, y = pad[1] + Math.sin(a) * R;
        if (x < 40 || y < 40 || x > W.WW - 40 || y > W.WH - 40 || !clearRun(x, y, pad[0], pad[1], D)) continue;
        const V = mkVeh(id, x, y, gnd({ D }, x, y), a + Math.PI); V.arr = { k: 'drive', pad, t: 0, stuck: 0 };
        return R / (D.spd * .62) + 3;
      }
      // tak ada jalur lurus yang bersih: tetap datang menyetir dari ±45 m (macet = muncul di tujuan, lihat ARR.drive) — tidak lagi diterjunkan
      const a = base, x = clamp(pad[0] + Math.cos(a) * 45, 40, W.WW - 40), y = clamp(pad[1] + Math.sin(a) * 45, 40, W.WH - 40);
      const V = mkVeh(id, x, y, gnd({ D }, x, y), Math.atan2(pad[1] - y, pad[0] - x)); V.arr = { k: 'drive', pad, t: 0, stuck: 0 };
      return 45 / (D.spd * .62) + 4;
    },
    sling(id, D, pad) {   // SANCA: digantung tali di bawah heli angkut
      const a = fromBase(pad) + Math.PI, R = 620, x = clamp(pad[0] + Math.cos(a) * R, 40, W.WW - 40), y = clamp(pad[1] + Math.sin(a) * R, 40, W.WH - 40), yaw = Math.atan2(pad[1] - y, pad[0] - x);
      const hz = Math.max(F.hAt(x, y), F.hAt(pad[0], pad[1])) + 75, V = mkVeh(id, x, y, hz - SL, yaw);
      V.arr = { k: 'sling', pad, t: 0, h: prop('HELI', x, y, hz, yaw), hx: x, hy: y, hz, hyaw: yaw, vx: 0, vy: 0, sw: 0 };
      return R / 38 + 9;
    },
    drop(id, D, pad) {   // MBT: pesawat kargo melintas, kargo keluar dari pintu belakang, 3 parasut, roket pengerem sesaat sebelum mendarat
      let R = DROP.R, hd = null; while (hd === null && R >= 200) { hd = inbound(pad, R + DROP.D); if (hd === null) R -= 150; }
      if (hd === null) { hd = fromBase(pad); R = 200; }
      const c = Math.cos(hd), s = Math.sin(hd), sx = pad[0] - c * (R + DROP.D), sy = pad[1] - s * (R + DROP.D);
      let pz = 0; for (let k = 0; k <= 10; k++) pz = Math.max(pz, F.hAt(clamp(pad[0] - c * (R + DROP.D) * k / 10, 0, W.WW - 1), clamp(pad[1] - s * (R + DROP.D) * k / 10, 0, W.WH - 1)));   // melintas di atas bukit tertinggi sepanjang jalur
      pz += DROP.alt;
      const V = mkVeh(id, pad[0], pad[1], pz, hd, true); V.hide = true;
      const pl = { a: prop('GUNSHIP', sx, sy, pz, hd), vx: c * DROP.spd, vy: s * DROP.spd, vz: 0, t: 0, life: 40, x: sx, y: sy, z: pz, yaw: hd, pit: .04 };
      CR.push(pl); V.arr = { k: 'drop', pad, t: 0, pl, ph: 'wait', hd };
      return (R + DROP.D) / DROP.spd + 10;
    },
    base(id, D) {   // WOLFPACK: hanya muncul di HANGGAR MARKAS — pintu geser terbuka lalu pesawat taksi keluar ke depan pintu
      const B = Q.facB; if (!B) return 0; const b = B.han[0];
      const V = mkVeh(id, b.sx, b.sy, floorZ(b.sx, b.sy) + VX(id).gear, b.yaw);
      Object.assign(V, { gnd: true, spd: 0, thr: 0, gear: 1, gearCmd: 1 }); V.arr = { k: 'base', b, t: 0 };
      return 3.2 + Math.hypot(b.ex - b.sx, b.ey - b.sy) / 5;
    },
    vtol(id, D, pad) {   // ELANG: masuk dengan kecepatan jelajah, mengerem dengan nosel vektor, roda turun, mendarat tegak
      let R = 2200, hd = null; while (hd === null && R >= 400) { hd = inbound(pad, R); if (hd === null) R -= 300; }
      if (hd === null) { hd = fromBase(pad); R = 400; }
      const x = clamp(pad[0] - Math.cos(hd) * R, 60, W.WW - 60), y = clamp(pad[1] - Math.sin(hd) * R, 60, W.WH - 60);
      const V = mkVeh(id, x, y, Math.max(F.hAt(x, y), F.hAt(pad[0], pad[1])) + 230, Math.atan2(pad[1] - y, pad[0] - x));
      Object.assign(V, { mode: 'jet', spd: 160, noz: 0, gear: 0 }); V.arr = { k: 'vtol', pad, t: 0 };
      return Math.hypot(pad[0] - x, pad[1] - y) / 110 + 12;
    }
  };
  const SL = 12.3, DROP = { D: 58, spd: 80, k: 1.38, alt: 110, R: 800 };   // SL: kendaraan tergantung SL m di bawah heli; DROP: jarak luncur kargo setelah lepas (= spd / k), kecepatan & tinggi pesawat
  F.vehCall = function (id, instant) {   // instant: langsung siap di lahan (uji)
    const D = VD[id]; if (!D || !P.alive || P.gs) return { ok: false, msg: 'f_ci_dead' };
    if (Q.over) return { ok: false, msg: 'w_e_over' };
    const st = F.vehState(id), cost = F.vehPrice(id);
    if (st === 'in') return { ok: false, msg: 'f_vh_busy' };
    if (Q.cr < cost) return { ok: false, msg: 'w_e_cr' };
    if (st === 'ok') { refit(F.vehs.find(v => v.id === id)); Q.cr -= cost; A() && A().local('reload', .8); return { ok: true, msg: 'f_vh_refd' }; }
    if (D.arr === 'base') {   // WOLFPACK: tidak datang ke operator — disiapkan di hanggar markas
      if (!Q.facB) return { ok: false, msg: 'f_vh_nospot' };
      if (instant) { const b = Q.facB.han[0], V = mkVeh(id, b.ex, b.ey, floorZ(b.ex, b.ey) + VX(id).gear, b.yaw); Object.assign(V, { gnd: true, spd: 0, thr: 0 }); b.door = 1; arrived(V); Q.cr -= cost; return { ok: true, msg: 'f_vh_refd', eta: 0 }; }
      START.base(id, D); Q.cr -= cost; Q.stats.dep++;
      const b = Q.facB.han[0]; return { ok: true, msg: 'f_wf_call', eta: Math.round(Math.hypot(b.ex - P.x, b.ey - P.y)) };
    }
    const pad = padSpot(D); if (!pad) return { ok: false, msg: 'f_vh_nospot' };
    if (instant) { const V = mkVeh(id, pad[0], pad[1], F.hAt(pad[0], pad[1]) + (D.arr === 'vtol' ? VX(id).gear : 0), P.yaw); arrived(V); Q.cr -= cost; return { ok: true, msg: 'f_vh_refd', eta: 0 }; }
    const eta = START[D.arr](id, D, pad); if (!eta) return { ok: false, msg: 'f_vh_nospot' };
    Q.cr -= cost; Q.stats.dep++;
    return { ok: true, msg: 'f_vh_call', eta: Math.round(eta) };
  };
  function arrived(V) {
    V.st = 'ready'; V.arr = null; V.hide = false;
    if (Math.hypot(V.x - P.x, V.y - P.y) < 400) F.msg(Tt('f_vh_arr', { u: vname(V) }), 'g');
    else if (V.D.arr === 'base') F.msg(Tt('f_wf_ready', { s: Math.round(Math.hypot(V.x - P.x, V.y - P.y)) }), 'g');
    A() && A().local('obj', .7);
  }

  /* ---------- kedatangan ---------- */
  const ARR = {
    base(V, dt) {   // pintu hanggar terbuka ±4 dtk, lalu taksi lurus keluar sampai di depan pintu (apron)
      const a = V.arr, b = a.b; a.t += dt; b.door = Math.min(1, b.door + dt / 4);
      if (a.t < 3.2) return;
      const d = Math.hypot(b.ex - V.x, b.ey - V.y); V.spd = Math.min(6, d * .5 + .4);
      V.x += Math.cos(V.yaw) * V.spd * dt; V.y += Math.sin(V.yaw) * V.spd * dt; V.z = floorZ(V.x, V.y) + VX(V.id).gear; V.vx = Math.cos(V.yaw) * V.spd; V.vy = Math.sin(V.yaw) * V.spd;
      if (d < .8 || a.t > 30) { V.spd = 0; V.vx = V.vy = 0; arrived(V); }
    },
    drive(V, dt) {
      const a = V.arr, dx = a.pad[0] - V.x, dy = a.pad[1] - V.y, d = Math.hypot(dx, dy), sp = Math.hypot(V.vx, V.vy); a.t += dt;
      const err = wrapPi(Math.atan2(dy, dx) - V.yaw), near = d < 24;
      if (near && !a.skid && sp > 6 && V.id === 'HMV') { a.skid = true; V.yr = (Math.random() < .5 ? 1 : -1) * 1.9; }   // rem tangan: Humvee ngepot menyamping (tank & panser cukup mengerem)
      drive(V, dt, near ? 0 : 1, near ? 0 : clamp(err * 2.2, -1, 1), near, false, V.D.spd * .62);
      contact(V, dt);
      a.stuck = sp < 1 && !near ? a.stuck + dt : 0;
      if (a.stuck > 3 || a.t > 45) { V.x = a.pad[0]; V.y = a.pad[1]; V.z = F.hAt(V.x, V.y); V.vx = V.vy = 0; F.puff(V.x, V.y, V.z + .5, 10, [150, 134, 104], 3); }   // macet: muncul di tujuan
      if ((near && sp < .8) || a.stuck > 3 || a.t > 45) { V.vx = V.vy = 0; V.yr = 0; arrived(V); A() && A().at('horn', V.x, V.y, .8); }
    },
    sling(V, dt) {
      const a = V.arr, h = a.h, dx = a.pad[0] - a.hx, dy = a.pad[1] - a.hy, d = Math.hypot(dx, dy), gz = F.hAt(a.pad[0], a.pad[1]); a.t += dt;
      const sp = Math.min(38, d * .42 + .6), k = Math.min(1, dt * .7);
      a.vx += ((d > .3 ? dx / d * sp : 0) - a.vx) * k; a.vy += ((d > .3 ? dy / d * sp : 0) - a.vy) * k;
      const ax = (a.vx - (a.pvx || 0)) / Math.max(dt, 1e-3); a.pvx = a.vx;
      a.hx += a.vx * dt; a.hy += a.vy * dt;
      if (d > 30) a.hyaw = wrapPi(a.hyaw + clamp(wrapPi(Math.atan2(dy, dx) - a.hyaw), -.6 * dt, .6 * dt));
      const tz = d > 140 ? Math.max(gz, F.hAt(a.hx, a.hy)) + 75 : gz + SL - .8 + Math.min(60, Math.max(0, d - 4) * .45);   // sedikit di bawah tanah agar kargo benar-benar menyentuh
      a.hz += clamp((tz - a.hz) * .7, -7, 9) * dt;
      a.sw += dt; const sw = Math.sin(a.sw * 1.6) * .05 * Math.min(1, d / 40);   // kargo berayun pelan
      V.x = a.hx - a.vx * .12; V.y = a.hy - a.vy * .12; V.z = a.hz - SL; V.yaw = V.ty = a.hyaw; V.pit = clamp(-ax * .01, -.12, .12) + sw; V.rol = Math.cos(a.sw * 1.3) * .04;
      propSet(h, a.hx, a.hy, a.hz, a.hyaw, -clamp(Math.hypot(a.vx, a.vy) / 38 * .2, 0, .2), 0); h.rph = (h.rph || 0) + dt * 31;
      a.rT = (a.rT || 0) - dt; if (a.rT <= 0) { a.rT = .09; A() && A().at('rotor', a.hx, a.hy, .6); }
      slingLines(V, a);
      const fl = gnd(V, V.x, V.y);
      if (V.z <= fl + .02 && d < 4) {   // kargo menyentuh tanah: tali dilepas, heli naik & pulang
        V.z = fl; V.pit = V.rol = 0; F.puff(V.x, V.y, V.z + .3, 14, [150, 134, 104], 4); A() && A().at('thud', V.x, V.y, 1.4);
        CR.push({ a: h, x: a.hx, y: a.hy, z: a.hz, yaw: a.hyaw, vx: 0, vy: 0, vz: 7, t: 0, life: 22, acc: 3, pit: -.15, rot: true });
        arrived(V);
      }
    },
    drop(V, dt) {
      const a = V.arr, pl = a.pl, c = Math.cos(a.hd), s = Math.sin(a.hd); a.t += dt;
      if (a.ph === 'wait') {   // masih di dalam pesawat: keluar saat pesawat melewati titik lepas
        const along = (pl.x - a.pad[0]) * c + (pl.y - a.pad[1]) * s;
        if (along < -DROP.D && a.t < 60) return;
        a.ph = 'fall'; a.ft = 0; V.x = pl.x - c * 9; V.y = pl.y - s * 9; V.z = pl.z - 3; V.yaw = V.ty = a.hd; V.vz = -2; V.hide = false; attach(V);
        a.ch = [-1, 0, 1].map(i => ({ x: V.x, y: V.y, z: V.z + 10, k: 2.6, o: .05, yaw: a.hd + i, tilt: i * .22, sq: 1, i }));
        F.vchutes.push(...a.ch); A() && A().at('thud', V.x, V.y, 1.2); A() && A().local('chute', .5);
      }
      if (a.ph === 'fall') {
        a.ft += dt; const t = a.ft, o = clamp((t - .7) / .9, 0, 1), fl = F.hAt(V.x, V.y), agl = V.z - fl;
        const e = DROP.D * Math.exp(-DROP.k * t); V.x = a.pad[0] - c * e; V.y = a.pad[1] - s * e;   // meluncur maju lalu tertahan parasut, berhenti tepat di atas titik pendaratan
        const term = a.retro ? -1.8 : -11;
        V.vz += o > 0 ? (term - V.vz) * Math.min(1, dt * (a.retro ? 6 : 2.2) * o) : -9.8 * dt;
        V.z += V.vz * dt; V.pit = -.22 * Math.exp(-t * 1.5) + Math.sin(t * 1.4) * .03 * o; V.rol = Math.sin(t * 1.1 + 1) * .04 * o;
        if (!a.retro && agl < 5 && o > .5) {   // roket pengerem menyala
          a.retro = true; A() && A().boom(V.x, V.y, 5); P.shake = Math.min(1, P.shake + .2 * (Math.hypot(V.x - P.x, V.y - P.y) < 60 ? 1 : 0));
          for (let i = 0; i < 16; i++) F.emit('fire', V.x + rand(-2, 2), V.y + rand(-2, 2), V.z, { vx: rand(-6, 6), vy: rand(-6, 6), vz: rand(-14, -6), life: rand(.25, .5), s0: 1.4, s1: .5, col: [255, rand(150, 210) | 0, 80], a: .9, drag: 1 });
        }
        if (a.retro && Math.random() < dt * 30) F.emit('fire', V.x + rand(-1.6, 1.6), V.y + rand(-1.6, 1.6), V.z + .2, { vz: rand(-10, -4), life: .3, s0: 1, s1: .3, col: [255, 190, 90], a: .8 });
        for (const ch of a.ch) {   // tiga kanopi menyebar di atas kargo (satu depan, dua belakang kiri-kanan), tali dari atap
          ch.o = Math.max(ch.o, o); const f = ch.i ? -1.8 : 2.8, l = ch.i * 4.8;
          ch.x = V.x + (c * f - s * l) * ch.o; ch.y = V.y + (s * f + c * l) * ch.o; ch.z = V.z + 3 + 8 * ch.o; ch.yaw += dt * .2;
          const top = [ch.x, ch.y, ch.z + 1.6 * ch.k];
          for (const sd of [-1, 1]) { const p = wp(V, [f * .7, ch.i ? ch.i * 1.2 + sd * .4 : sd * 1.1, 2.7]); F.vlines.push([p[0], p[1], p[2], top[0], top[1], top[2], .03, [60, 60, 56], .9]); }
        }
        if (V.z <= fl) {   // mendarat: hentakan, debu, cincin kejut; parasut kempis
          V.z = fl; V.vz = 0; V.pit = V.rol = 0; a.ph = 'land';
          F.puff(V.x, V.y, fl + .4, 18, [150, 134, 104], 5); F.shock.push({ x: V.x, y: V.y, R: 26, t: 0, life: .6 }); A() && A().at('thud', V.x, V.y, 2); A() && A().boom(V.x, V.y, 4);
          if (Math.hypot(V.x - P.x, V.y - P.y) < 80) P.shake = Math.min(1.2, P.shake + .4);
          for (const ch of a.ch) CR.push({ chute: ch, t: 0, life: 3.2, vx: -s * ch.i * 2 + c * 1.5, vy: c * ch.i * 2 + s * 1.5 });
          arrived(V);
        }
      }
    },
    vtol(V, dt) {
      const a = V.arr, C = VX('VTOL'), dx = a.pad[0] - V.x, dy = a.pad[1] - V.y, d = Math.hypot(dx, dy), gz = F.hAt(a.pad[0], a.pad[1]), tz = gz + C.gear; a.t += dt;
      const ps = V.spd;
      if (d > 8) {
        const want = clamp(d * .32 + 3, 3, 165); V.spd += (want - V.spd) * Math.min(1, dt * (want < V.spd ? .9 : .5));
        if (d > 40) V.yaw = wrapPi(V.yaw + clamp(wrapPi(Math.atan2(dy, dx) - V.yaw), -.7 * dt, .7 * dt));   // dekat: menggeser tanpa memutar hidung
        const hx = d > 40 ? Math.cos(V.yaw) : dx / d, hy = d > 40 ? Math.sin(V.yaw) : dy / d; V.vx = hx * V.spd; V.vy = hy * V.spd;
        const alt = d > 700 ? Math.max(gz, F.hAt(V.x, V.y)) + 200 : tz + 24 + d * .2;
        V.vz = clamp((alt - V.z) * .5, -14, 14);
      } else { V.vx = dx * 1.2; V.vy = dy * 1.2; V.spd = Math.hypot(V.vx, V.vy); V.vz = d < 3 ? -clamp((V.z - tz) * .45 + 1.2, 1.2, 8) : 0; }   // di atas titik: geser halus ke tengah lalu turun tegak
      V.x += V.vx * dt; V.y += V.vy * dt; V.z = Math.max(V.z + V.vz * dt, floorZ(V.x, V.y) + C.gear);
      const flare = clamp((ps - V.spd) / Math.max(dt, 1e-3) * .012, 0, .28);   // mengerem: hidung terangkat
      V.pit += ((V.spd > 70 ? clamp(V.vz / Math.max(V.spd, 1), -.3, .3) : 0) + flare - V.pit) * Math.min(1, dt * 2); V.rol *= Math.max(0, 1 - dt * 2);
      V.noz += ((V.spd < 90 ? Math.PI / 2 : 0) - V.noz) * Math.min(1, dt * 1.2); V.gear += ((d < 600 ? 1 : 0) - V.gear) * Math.min(1, dt * .8);
      if (V.z - gz < 30) hoverDust(V, dt);
      if (d < 3 && V.z <= tz + .05) { V.z = tz; V.vx = V.vy = V.vz = 0; V.spd = 0; V.mode = 'hov'; V.pit = 0; arrived(V); }
    }
  };
  function slingLines(V, a) {   // 4 tali dari perut heli ke sudut atap kargo
    const hb = [a.hx, a.hy, a.hz - 1.1];
    for (const [f, l] of [[2, 1], [2, -1], [-2, 1], [-2, -1]]) { const p = wp(V, [f, l, 2.25]); F.vlines.push([hb[0], hb[1], hb[2], p[0], p[1], p[2], .035, [40, 40, 38], .95]); }
  }
  function tickCR(dt) {   // pengantar yang terbang pergi + parasut yang mengempis
    for (let i = CR.length - 1; i >= 0; i--) {
      const c = CR[i]; c.t += dt;
      if (c.chute) { const ch = c.chute, k = c.t / c.life; ch.sq = Math.max(.08, 1 - k * 1.6); ch.z -= dt * 2.2 * (1 - k); ch.x += c.vx * dt; ch.y += c.vy * dt; ch.tilt = (ch.tilt || 0) + dt * .5 * Math.sign(ch.i || 1); ch.o = 1 - k * .3; if (c.t > c.life) { CR.splice(i, 1); const j = F.vchutes.indexOf(ch); if (j >= 0) F.vchutes.splice(j, 1); } continue; }
      if (c.acc) { const sp = Math.hypot(c.vx, c.vy) + c.acc * dt * 6; c.vx = Math.cos(c.yaw) * Math.min(45, sp); c.vy = Math.sin(c.yaw) * Math.min(45, sp); c.vz = Math.max(0, c.vz - dt * .4); }   // heli angkut: menanjak lalu melaju pulang
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      propSet(c.a, c.x, c.y, c.z, c.yaw, c.pit || 0, 0); if (c.rot) c.a.rph = (c.a.rph || 0) + dt * 31;
      c.sT = (c.sT || 0) - dt; if (c.sT <= 0 && Math.hypot(c.x - P.x, c.y - P.y) < 1200) { c.sT = c.rot ? .09 : .25; if (c.rot) A() && A().at('rotor', c.x, c.y, .6); else A() && A().eng(90, .7, c.x, c.y); }
      if (c.t > c.life || (!F.inb(c.x, c.y) && c.t > 4)) { CR.splice(i, 1); propDel(c.a); }
    }
  }
  function hoverDust(V, dt) {
    if (Math.random() > dt * 22) return;
    const gz = floorZ(V.x, V.y), a = Math.random() * 6.283, r = rand(2, 9);
    F.emit('dust', V.x + Math.cos(a) * r, V.y + Math.sin(a) * r, gz + .3, { vx: Math.cos(a) * rand(6, 14), vy: Math.sin(a) * rand(6, 14), vz: rand(.3, 1.5), life: rand(.8, 1.4), s0: 1.2, s1: 4, col: F.water(V.x, V.y) ? [210, 220, 225] : [160, 144, 112], a: .5, drag: 1.2 });
  }

  /* ---------- fisika darat ---------- */
  function gnd(V, x, y) {   // tinggi alas roda: medan; panser amfibi mengapung di air dalam
    const h = F.hAt(x, y); if (V.D.amph && F.water(x, y) && F.WZ - h > 1.1) return F.WZ - 1.1;
    return h;
  }
  function blocked(V, x, y, yaw) {   // 1 = dinding/tebing, 2 = air terlalu dalam, 3 = pohon
    const D = V.D, C = VX(V.id), c = Math.cos(yaw), s = Math.sin(yaw), z0 = gnd(V, V.x, V.y);
    for (const [f, l] of [[C.L, 0], [C.L * .9, C.W], [C.L * .9, -C.W], [-C.L * .9, C.W], [-C.L * .9, -C.W]]) {
      const px = x + c * f - s * l, py = y + s * f + c * l;
      if (px < 15 || py < 15 || px > W.WW - 15 || py > W.WH - 15 || F.solid(px, py)) return 1;
      if (!D.amph && F.depth(px, py) > D.ford) return 2;
      if (gnd(V, px, py) - z0 > Math.max(1.2, Math.abs(f) * D.slope)) return 1;
      const tn = F.treeNear(px, py, .5); if (tn) { const r = veg(V, tn[2]); if (r) return r; }
    }
    return 0;
  }
  /* vegetasi & batu yang ditabrak kendaraan darat (4 = batu besar: menghadang, kerusakan kecil)
     batu kecil: dilindas (kendaraan berguncang, kerusakan sangat kecil) · pohon: tank (& panser untuk pohon kecil) menumbangkannya ·
     properti kota: tank melindas, kendaraan lain terhalang */
  F.felled = new Set(); F.falling = []; let fVer = -1;
  function veg(V, k) {
    const T = F.world.trees, kind = T[k * 6 + 4], h = T[k * 6 + 3], sp = Math.hypot(V.vx, V.vy), hv = V.id === 'MBT' ? 2 : V.id === 'APC' ? 1 : 0;
    if (kind === 9) return V.D.trees ? 0 : 3;
    if (kind === 3) {
      if (h * .75 >= [.55, 1.0, 1.4][hv]) return 4;
      if ((V.rockT || 0) < Q.t && sp > 1) {
        V.rockT = Q.t + .5; hurtV(V, [4, 1.5, .4][hv] * clamp(sp / 8, .3, 1.6)); V.vx *= .9; V.vy *= .9;
        F.puff(T[k * 6], T[k * 6 + 1], T[k * 6 + 2] + .3, 4, [140, 128, 104], 1.4); A() && A().at('thud', V.x, V.y, .55);
        if (P.veh === V) P.shake = Math.min(1.2, P.shake + [.35, .22, .14][hv]);
      }
      return 0;
    }
    if (hv === 2 || (hv === 1 && h < 9)) { fell(k, V, sp); return 0; }
    return 3;
  }
  function fell(k, V, sp) {   // pohon tumbang ke arah laju kendaraan (fps-gl menggambar batang yang rebah)
    const T = F.world.trees, x = T[k * 6], y = T[k * 6 + 1], z = T[k * 6 + 2], h = T[k * 6 + 3], dir = Math.atan2(V.vy, V.vx) || V.yaw;
    F.felled.add(k);
    F.falling.push({ k, x, y, z, kind: T[k * 6 + 4], h, dir: dir + rand(-.3, .3), a: .04, w: .45 + Math.min(1.2, sp * .06), t: 0, done: false });
    if (F.falling.length > 90) F.falling.shift();
    V.vx *= .9; V.vy *= .9; F.puff(x, y, z + .4, 6, [116, 96, 66], 2.2); A() && A().at('thud', x, y, 1.3);
    if (P.veh === V) P.shake = Math.min(1.3, P.shake + .3);
  }
  function fallTick(dt) {
    if (!F.world) return; if (F.world.ver !== fVer) { fVer = F.world.ver; F.felled.clear(); F.falling.length = 0; }
    for (const f of F.falling) {
      if (f.done) continue; f.t += dt;
      f.w += (2.6 * Math.sin(f.a) + .25) * dt; f.a += f.w * dt;   // makin miring makin cepat (gravitasi pada batang)
      if (f.a >= 1.5) {   // menghantam tanah: memantul kecil lalu diam
        f.a = 1.5;
        if (f.w > .5) { f.w = -f.w * .2; const tx = f.x + Math.cos(f.dir) * f.h * .6, ty = f.y + Math.sin(f.dir) * f.h * .6; F.puff(tx, ty, F.hAt(tx, ty) + .4, 8, [124, 104, 72], 3); A() && A().at('thud', tx, ty, 1.1); }
        else { f.w = 0; f.done = true; }
      }
    }
  }
  /* mobil arkade: gas/rem/mundur, belok bergantung laju (tank bisa berputar di tempat), selip menyamping diredam cengkeraman ban,
     rem tangan = ngepot, gravitasi di lereng, melompat dari puncak bukit, tabrakan gedung/tebing/pohon/air */
  function drive(V, dt, thr, str, hb, boost, top) {
    const D = V.D, c = Math.cos(V.yaw), s = Math.sin(V.yaw), w = F.water(V.x, V.y) ? F.WZ - F.hAt(V.x, V.y) : 0, swim = D.amph && w > 1.1, wet = w > .3;
    V.str = str;   // sudut roda depan (fps-gl, lewat u.steer)
    let vf = V.vx * c + V.vy * s, vl = -V.vx * s + V.vy * c; const vf0 = vf;
    if (!V.fly) {
      const vmax = swim ? D.amph : (top || (boost ? D.boost : D.spd)) * (wet && !swim ? .5 : 1);
      if (thr > 0) vf = vf < -.5 ? vf + D.brk * dt : vf > vmax ? Math.max(vmax, vf - D.acc * dt) : Math.min(vmax, vf + D.acc * dt);
      else if (thr < 0) vf = vf > .5 ? vf - D.brk * dt : Math.max(-D.rev, vf - D.acc * .8 * dt);
      else vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.2 + Math.abs(vf) * .05) * dt);   // menggelinding pelan berhenti
      if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), D.brk * .45 * dt);
      if (!swim) { const sl = (F.hAt(V.x + c * 2, V.y + s * 2) - F.hAt(V.x - c * 2, V.y - s * 2)) / 4; vf -= clamp(sl, -1, 1) * 9.8 * dt * .7; }   // gravitasi di lereng
      const av = Math.abs(vf), turn = D.pivot && av < 3 ? str * D.steer : str * D.steer * clamp(av / 6, 0, 1) * (vf < 0 ? -1 : 1) / (1 + av / 45);
      V.yr += (turn * (hb ? 1.35 : 1) - V.yr) * Math.min(1, dt * (hb ? 1.6 : 6));
      vl *= Math.exp(-(hb ? .7 : D.grip * (swim ? .4 : 1)) * dt * 2.2);   // cengkeraman ban meredam geser menyamping (rem tangan = selip)
    } else V.yr *= Math.max(0, 1 - dt);
    V.yaw = wrapPi(V.yaw + V.yr * dt);
    V.vx = c * vf - s * vl; V.vy = s * vf + c * vl;   // kecepatan tetap di arah lama: beda dengan arah baru menjadi selip
    V.acc += ((vf - vf0) / Math.max(dt, 1e-3) - V.acc) * Math.min(1, dt * 8);
    const nx = V.x + V.vx * dt, ny = V.y + V.vy * dt, b = blocked(V, nx, ny, V.yaw);
    if (b && !blocked(V, V.x, V.y, V.yaw)) {
      const sp = Math.hypot(V.vx, V.vy);
      if (b !== 2 && sp > 6) { hurtV(V, (sp - 6) * (b === 4 ? (V.id === 'MBT' ? .5 : V.id === 'APC' ? 2 : 5) : V.id === 'MBT' ? 2 : 7)); if (P.veh === V) { P.shake = Math.min(1.4, P.shake + sp * .03); A() && A().local('land', clamp(sp / 20, .4, 1)); } F.sparks(nx + c * VX(V.id).L, ny + s * VX(V.id).L, V.z + 1, 6); }
      if (b === 2 && P.veh === V && !V.wetMsg) { V.wetMsg = true; F.msg(Tt('f_vh_deep'), 'w'); }
      V.vx *= -.15; V.vy *= -.15;
    } else { V.x = nx; V.y = ny; if (!b) V.wetMsg = false; }
    const g2 = gnd(V, V.x, V.y);
    if (V.fly) {
      V.vz -= 20 * dt; V.z += V.vz * dt;
      if (V.z <= g2) { if (V.vz < -9) hurtV(V, (-V.vz - 9) * 14); if (V.vz < -4) { A() && A().at('thud', V.x, V.y, 1.2); F.puff(V.x, V.y, g2 + .3, 6, [150, 134, 104], 3); if (P.veh === V) P.shake = Math.min(1.2, P.shake + -V.vz * .04); } V.z = g2; V.vz = 0; V.fly = false; }
    } else if (g2 < V.z - .35 && V.gvz > -3 && !swim) { V.fly = true; V.vz = V.gvz; }   // terbang dari puncak bukit
    else { V.gvz = V.gvz * .5 + (g2 - V.z) / Math.max(dt, 1e-3) * .5; V.z = g2; }
    // sikap badan: kemiringan medan di roda + jongkok saat menggas, condong keluar saat berbelok; mengapung = bergoyang ombak
    const C = VX(V.id), c2 = Math.cos(V.yaw), s2 = Math.sin(V.yaw), L = C.L * .8, Wd = C.W * .9;
    let tp = Math.atan2(gnd(V, V.x + c2 * L, V.y + s2 * L) - gnd(V, V.x - c2 * L, V.y - s2 * L), 2 * L), tr = Math.atan2(gnd(V, V.x - s2 * Wd, V.y + c2 * Wd) - gnd(V, V.x + s2 * Wd, V.y - c2 * Wd), 2 * Wd);
    if (V.fly) { tp = clamp(V.vz * .02, -.35, .25); tr = V.rol; }
    else { tp += clamp(V.acc * .005, -.05, .04); tr += clamp(V.yr * vf * .006, -.07, .07); }
    if (swim) { tp = Math.sin(Q.t * 1.3 + V.x) * .03; tr = Math.sin(Q.t * 1.7) * .035; V.bob = Math.sin(Q.t * 1.1) * .12; if (Math.abs(vf) > 1 && Math.random() < dt * 20) F.emit('dust', V.x - c2 * C.L, V.y - s2 * C.L, F.WZ + .1, { vx: -c2 * 3 + rand(-1, 1), vy: -s2 * 3 + rand(-1, 1), vz: rand(.5, 2), life: 1, s0: .8, s1: 2.5, col: [220, 230, 235], a: .5 }); }
    else V.bob = 0;
    if (wet && !swim && Math.abs(vf) > 2 && Math.random() < dt * 18) F.emit('dust', V.x + rand(-2, 2), V.y + rand(-2, 2), F.WZ + .1, { vz: rand(1, 3), life: .7, s0: .6, s1: 1.8, col: [210, 222, 228], a: .55 });
    else if (!wet && Math.abs(vf) > 9 && Math.random() < dt * (hb ? 30 : 8)) F.emit('dust', V.x - c2 * C.L, V.y - s2 * C.L, V.z + .3, { vx: -c2 * 2 + rand(-1, 1), vy: -s2 * 2 + rand(-1, 1), vz: rand(.3, 1.2), life: rand(.8, 1.4), s0: .8, s1: 3, col: [150, 134, 104], a: .4, drag: 1 });
    V.pit += (tp - V.pit) * Math.min(1, dt * 8); V.rol += (tr - V.rol) * Math.min(1, dt * 8);
  }
  /* gilas infanteri musuh, dorong infanteri kawan ke samping, tabrak kendaraan */
  function contact(V, dt) {
    V.bump -= dt; const sp = Math.hypot(V.vx, V.vy); if (sp < 2.2) return;
    const C = VX(V.id), c = Math.cos(V.yaw), s = Math.sin(V.yaw), me = P.veh === V ? src() : null;
    for (const u of Q.units) {
      if (u.dead || u === V.u || u === P.unit || u.chute > 0 || u.fly || u.jet || u.ctl || u.inV) continue;
      const dx = u.x - V.x, dy = u.y - V.y; if (Math.abs(dx) > C.L + 8 || Math.abs(dy) > C.L + 8) continue;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c, hb = F.hitbox(u);
      if (Math.abs(lx) > C.L + hb.r * .5 || Math.abs(ly) > C.W + hb.r * .5) continue;
      if (F.isHuman(u.type)) {
        if (u.team === 'B') { const sd = ly >= 0 ? 1 : -1; u.x = V.x + c * lx - s * sd * (C.W + 1); u.y = V.y + s * lx + c * sd * (C.W + 1); }
        else if (sp > V.D.crush) { war.hurt(u, 900, 'he', me); if (me) hitMark(u); F.puff(u.x, u.y, F.hAt(u.x, u.y) + .6, 4, [120, 30, 24], 1.2); A() && A().at('thud', u.x, u.y, 1); }
      } else if (V.bump <= 0 && UT[u.type].dom !== 'S') {   // tabrakan kendaraan / bangunan: keduanya rusak menurut laju; tank menghancurkan kendaraan ringan
        V.bump = .7; const k = sp * sp * .45;
        if (u.team !== 'B') { war.hurt(u, k * (V.id === 'MBT' ? 3 : 1), 'ap', me); if (me) hitMark(u); }
        hurtV(V, k * (V.id === 'MBT' ? .12 : .5)); V.vx *= -.2; V.vy *= -.2;
        F.sparks(V.x + c * C.L, V.y + s * C.L, V.z + 1, 8); A() && A().at('thud', V.x, V.y, 1.4); if (P.veh === V) P.shake = Math.min(1.4, P.shake + .4);
      }
    }
  }

  /* ---------- VTOL: mode melayang (seperti heli) & mode jet (hidung mengikuti mouse) ---------- */
  function jetFly(V, dt, I) {
    const D = V.D, C = VX('VTOL'), fl = floorZ(V.x, V.y);
    if (V.mode === 'hov') {
      const c = Math.cos(V.yaw), s = Math.sin(V.yaw), mx = (+I.r || 0) - (+I.l || 0), my = (+I.f || 0) - (+I.b || 0), sp = D.hov * (I.sprint ? 1.6 : 1);
      const tvx = (c * my - s * mx * .8) * sp, tvy = (s * my + c * mx * .8) * sp, tvz = ((I.jump ? 1 : 0) - (I.dn ? 1 : 0)) * D.climb, k = Math.min(1, dt * 1.1);
      const ax = (tvx - V.vx) * k, ay = (tvy - V.vy) * k; V.vx += ax; V.vy += ay; V.vz += (tvz - V.vz) * Math.min(1, dt * 2.5);
      const dy = wrapPi(P.yaw - V.yaw); V.yr += (clamp(dy * 2.4, -1.5, 1.5) - V.yr) * Math.min(1, dt * 5); V.yaw = wrapPi(V.yaw + V.yr * dt);
      const vf = V.vx * c + V.vy * s, vr = -V.vx * s + V.vy * c, on = V.z - fl - C.gear < .1 ? 0 : 1;
      const aimP = clamp(P.pitch * .5, -.3, .12) * Math.max(0, 1 - V.spd / D.hov);   // diam melayang: hidung ikut menunduk/mendongak ke arah bidikan (kanon di hidung)
      V.pit += ((-vf / D.hov * .1 - (ax * c + ay * s) / Math.max(dt, 1e-3) * .006 + aimP) * on - V.pit) * Math.min(1, dt * 3);
      V.rol += (clamp(-(vr / D.hov * .25 + V.yr * .15), -.5, .5) * on - V.rol) * Math.min(1, dt * 3);
      V.noz += (Math.PI / 2 - V.noz) * Math.min(1, dt * 1.5); V.gear += (1 - V.gear) * Math.min(1, dt * .8); V.spd = Math.hypot(V.vx, V.vy);
      if (V.z - fl < 30) hoverDust(V, dt);
    } else {
      const want = F.aimVec(P.yaw, P.pitch), edge = V.x < 250 || V.y < 250 || V.x > W.WW - 250 || V.y > W.WH - 250;
      let wpch = Math.asin(clamp(want[2], -1, 1));
      let low = 1e9; for (const k of [.4, .8, 1.4, 2, 3]) { const ax = V.x + V.vx * k, ay = V.y + V.vy * k; low = Math.min(low, V.z + V.vz * k - floorZ(clamp(ax, 0, W.WW - 1), clamp(ay, 0, W.WH - 1))); }
      const agl0 = V.z - Math.max(floorZ(V.x, V.y), floorZ(clamp(V.x + V.vx, 0, W.WW - 1), clamp(V.y + V.vy, 0, W.WH - 1)));
      wpch = Math.max(wpch, -clamp((agl0 - 40) / 170, 0, 1.3));   // sudut tukik maksimum mengecil dekat tanah: menukik tegak hanya di ketinggian
      V.pull = low < 30; if (V.pull) wpch = Math.max(wpch, .3);   // tanah / bukit di depan: TARIK NAIK otomatis (arkade)
      else if (V.z > F.hAt(V.x, V.y) + D.ceil - 90) wpch = Math.min(wpch, -.04);   // dekat batas ketinggian: hidung diturunkan (tidak menggantung tegak di plafon)
      const wy = edge ? Math.atan2(W.WH / 2 - V.y, W.WW / 2 - V.x) : Math.atan2(want[1], want[0]);   // batas area operasi: jet berbelok kembali sendiri
      if (edge && !V.edge && P.veh === V) F.msg(Tt('f_vh_edge'), 'w'); V.edge = edge;
      if (I.f) V.thr = Math.min(1, V.thr + dt * .7); if (I.b) V.thr = Math.max(0, V.thr - dt * .7);
      const tgt = I.sprint ? D.ab : D.min + (D.max - D.min) * V.thr;
      V.spd += (tgt - V.spd) * Math.min(1, dt * .45) - Math.sin(V.pit) * 9.8 * dt * .6;   // menanjak memperlambat, menukik mempercepat
      const rate = D.turn * clamp(V.spd / 130, .55, 1.15), mx = (+I.r || 0) - (+I.l || 0);
      V.yr += (clamp(wrapPi(wy - V.yaw) * 2.2, -rate, rate) + mx * .35 - V.yr) * Math.min(1, dt * 4); V.yaw = wrapPi(V.yaw + V.yr * dt);
      V.pit = clamp(V.pit + clamp((wpch - V.pit) * 2.2, -rate, rate) * dt, -1.3, 1.3);
      const cp = Math.cos(V.pit); V.vx = Math.cos(V.yaw) * cp * V.spd; V.vy = Math.sin(V.yaw) * cp * V.spd; V.vz = Math.sin(V.pit) * V.spd;
      V.rol += (clamp(-V.yr * .95 - mx * .25, -1.25, 1.25) - V.rol) * Math.min(1, dt * 3);
      V.noz += (0 - V.noz) * Math.min(1, dt * 1.5); V.gear += (0 - V.gear) * Math.min(1, dt * .9);
      if (V.spd < D.min * .7) { V.mode = 'hov'; V.vz = 0; if (P.veh === V) F.msg(Tt('f_vh_hov'), 'w'); }   // terlalu lambat: nosel turun otomatis
      if (I.sprint && Math.random() < dt * 25) { const p = wp(V, [-9.2, 0, -.05]); F.emit('fire', p[0], p[1], p[2], { vx: -V.vx * .1, vy: -V.vy * .1, life: .12, s0: 1.4, s1: .6, col: [255, 170, 90], a: .8 }); }   // nyala pembakar lanjut
    }
    const px = V.x, py = V.y, gh = V.gear > .8 ? C.gear : .9;
    V.x = clamp(V.x + V.vx * dt, 20, W.WW - 20); V.y = clamp(V.y + V.vy * dt, 20, W.WH - 20);
    const fz = floorZ(V.x, V.y) + gh;
    if (V.mode === 'hov') V.vz = Math.max(V.vz, -(Math.max(0, V.z - fz) * .7 + 2.2));   // bantuan mendarat: laju turun melambat dekat tanah / atap
    V.z = Math.min(V.z + V.vz * dt, F.hAt(V.x, V.y) + D.ceil);
    if (V.z < fz) {
      if (V.mode === 'jet') { hurtV(V, 1e6); V.z = fz; return; }   // mode jet menghantam tanah / gedung = hancur
      if (fz - V.z > 1.5) {   // dasar naik mendadak = menabrak dinding gedung / tebing dari samping: terpental, rusak sesuai laju
        const sp = Math.hypot(V.vx, V.vy); V.x = px; V.y = py; V.z = Math.max(V.z, floorZ(px, py) + gh); V.vx *= -.25; V.vy *= -.25;
        if (sp > 5) { hurtV(V, (sp - 5) * 22); F.sparks(V.x + V.vx * .1, V.y + V.vy * .1, V.z, 8); A() && A().at('thud', V.x, V.y, 1.3); if (P.veh === V) P.shake = Math.min(1.2, P.shake + sp * .03); }
      } else {   // mendarat dari atas (tanah atau atap): hentakan hanya merusak bila jatuh keras
        if (V.vz < -7) hurtV(V, (-V.vz - 7) * 60);
        V.z = fz; if (V.vz < 0) V.vz = 0; V.vx *= .9; V.vy *= .9;
      }
    }
  }

  /* ---------- v3.0 WOLFPACK (A-10): pesawat sayap tetap ----------
     DARAT: W/S = tuas gas (taksi pelan, ±13 m/dtk), SHIFT = tenaga lepas landas (dorongan penuh, makin cepat), A/D = kemudi roda depan,
     SPASI = rem roda, S saat diam = didorong mundur pelan. Di Vr (±187 km/j) tarik bidikan ke atas → hidung terangkat → lepas landas.
     UDARA: mouse = arah hidung (seperti mode jet ELANG), W/S gas, SHIFT tenaga penuh; terlalu lambat = STALL (hidung jatuh, pesawat tenggelam);
     roda naik otomatis setelah lepas landas & turun otomatis saat mendekat pelan & rendah ([G] manual). Menyentuh tanah dengan roda turun,
     turun pelan, sayap datar = MENDARAT; selain itu hancur. Landasan/apron mulus, rumput & tanah memperlambat. */
  const ss01 = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  function onRwy(x, y) {
    const B = Q.facB; if (B) { const R = B.run, A2 = B.apron; if (x > R.x0 - 6 && x < R.x1 + 6 && Math.abs(y - R.y) < R.hw + 3) return true; if (x > A2[0] - 3 && x < A2[2] + 3 && y > A2[1] - 3 && y < A2[3] + 45) return true; }
    const R2 = Q.fac && Q.fac.run; return !!(R2 && Math.abs(x - R2.x) < R2.hw + 3 && y > R2.y0 && y < R2.y1);
  }
  function fwGround(V, dt, I) {
    const D = V.D, gh = VX(V.id).gear;
    if (I.f) V.thr = Math.min(1, V.thr + dt * .6); if (I.b && V.spd > .2) V.thr = Math.max(0, V.thr - dt * .9);
    const toga = !!I.sprint && (V.thr > .05 || !!I.f), rough = !onRwy(V.x, V.y), ws0 = Math.abs(V.spd);
    // SPASI saat lari lepas landas (SHIFT) = siapkan lepas landas otomatis di Vr; SPASI tanpa SHIFT = rem (taksi / setelah mendarat)
    if (I.jump && (toga || V.tko) && V.spd > 3) { if (!V.tko) { V.tko = true; if (P.veh === V && V.spd < D.vr * .95) F.msg(Tt('f_wf_arm'), 'g'); } }
    if (!toga && !I.jump && V.spd < D.vr * .6) V.tko = false;
    const brake = (!!I.jump && !V.tko) || (I.b && V.thr <= 0 && V.spd > .3);
    let a;
    if (toga) { V.thr = Math.max(V.thr, .9); a = D.tko * (1 - V.spd / (D.max * 1.1)); }   // tenaga lepas landas: dorongan besar yang makin melemah mendekati laju puncak
    else a = clamp((D.taxi * V.thr - V.spd) * .7, -1.1, 2.2);                          // taksi: laju mengikuti tuas gas (gelinding & hambatan udara memperlambat)
    if (rough) a -= Math.sign(V.spd) * .55 * Math.min(1, ws0 / 3);
    if (brake) a = -Math.sign(V.spd) * Math.min(6.5, ws0 / Math.max(dt, 1e-3));
    if (I.b && V.thr <= 0 && V.spd <= .3 && !toga) a = (-2.5 - V.spd) * 1.5;            // didorong mundur pelan (pushback)
    V.spd += a * dt; V.toga = toga;
    const ws = Math.abs(V.spd), err = wrapPi(P.yaw - V.yaw), str = clamp(err * 2.2, -1, 1); V.str = str;
    V.yr = str * Math.min(.75, ws / 6) * (ws > 20 ? (20 / ws) * (20 / ws) : 1);   // kemudi roda depan MENGIKUTI ARAH BIDIK (mouse): tajam saat taksi, halus di laju tinggi
    V.yaw = wrapPi(V.yaw + V.yr * dt);
    const c = Math.cos(V.yaw), s = Math.sin(V.yaw), nx = clamp(V.x + c * V.spd * dt, 20, W.WW - 20), ny = clamp(V.y + s * V.spd * dt, 20, W.WH - 20);
    let blk = false; for (const [f2, l] of [[V.spd >= 0 ? 9.2 : -8.4, 0], [0, 8.7], [0, -8.7], [5, 3], [5, -3]]) { const px = nx + c * f2 - s * l, py = ny + s * f2 + c * l; if (F.solid(px, py) || F.depth(px, py) > .9) { blk = true; break; } }
    if (blk) {   // menabrak gedung / dinding hanggar / air dalam
      if (ws > 4) { hurtV(V, (ws - 4) * 35); F.sparks(V.x + c * 8, V.y + s * 8, V.z, 10); A() && A().at('thud', V.x, V.y, 1.4); if (P.veh === V) P.shake = Math.min(1.4, P.shake + ws * .04); }
      V.spd = -V.spd * .15;
    } else { V.x = nx; V.y = ny; }
    V.z = floorZ(V.x, V.y) + gh;
    const tp = Math.atan2(F.hAt(V.x + c * 6.6, V.y + s * 6.6) - F.hAt(V.x + c * .3, V.y + s * .3), 6.3), tr = Math.atan2(F.hAt(V.x - s * 2.25, V.y + c * 2.25) - F.hAt(V.x + s * 2.25, V.y - c * 2.25), 4.5);
    V.rotK = V.tko && V.spd >= D.vr ? Math.min(1, (V.rotK || 0) + dt * 2.2) : 0;
    const rot = .2 * ss01(V.rotK);   // rotasi otomatis setelah SPASI: hidung terangkat halus begitu Vr tercapai
    V.pit += (tp + rot - V.pit) * Math.min(1, dt * 3) + (rough ? Math.sin(P.time * 23) * .004 * Math.min(1, ws / 10) : 0); V.rol += (-tr * .5 - V.rol) * Math.min(1, dt * 4);
    V.vx = c * V.spd; V.vy = s * V.spd; V.vz = 0;
    V.rotHint = V.spd >= D.vr * .95 && !V.tko;
    if (V.spd >= D.vr && rot > .07) {   // LEPAS LANDAS
      V.gnd = false; V.vz = V.spd * Math.sin(V.pit); V.z += .05; V.gearCmd = 1; V.gearMan = false; V.tko = false; V.rotK = 0; V.climbT = 14;
      if (P.veh === V) { F.msg(Tt('f_wf_air'), 'g'); A() && A().local('switch', .5); }
    }
    if (rough && ws > 6 && Math.random() < dt * 14) F.emit('dust', V.x - c * 2 + rand(-3, 3), V.y - s * 2 + rand(-3, 3), V.z - gh + .2, { vz: rand(.3, 1.2), life: rand(.6, 1.1), s0: 1, s1: 3, col: [160, 144, 112], a: .45, drag: 1.2 });
  }
  function fwFly(V, dt, I) {
    if (V.gnd) { fwGround(V, dt, I); return; }
    const D = V.D, gh = VX(V.id).gear, want = F.aimVec(P.yaw, P.pitch), edge = V.x < 160 || V.y < 160 || V.x > W.WW - 160 || V.y > W.WH - 160;
    let wpch = Math.asin(clamp(want[2], -1, 1));
    const agl = V.z - floorZ(V.x, V.y) - gh;
    if (I.f) V.thr = Math.min(1, V.thr + dt * .6); if (I.b) V.thr = Math.max(0, V.thr - dt * .6);
    const T = I.sprint ? 1.25 : V.thr, tgt = D.vs * .8 + (D.max - D.vs * .8) * T; V.toga = !!I.sprint;
    V.spd = Math.max(8, V.spd + clamp((tgt - V.spd) * .3, -6, 3.2) * dt - Math.sin(V.pit) * 9.8 * dt);   // dorongan mesin terbatas (±0,4 g), bukan langsung melonjak   // menanjak memperlambat, menukik mempercepat
    const stall = V.spd < D.vs; if (stall && !V.stall && P.veh === V) A() && A().local('lock', .9); V.stall = stall;
    if (!V.gearMan) { if (V.gearCmd && agl > 25 && V.vz > 0 && V.spd > D.vr) V.gearCmd = 0; else if (!V.gearCmd && agl < 70 && V.vz < -.5 && V.spd < 95) V.gearCmd = 1; }
    V.gear += ((V.gearCmd ? 1 : 0) - V.gear) * Math.min(1, dt * .7);
    let low = 1e9; for (const k of [.5, 1, 1.6, 2.4]) { const ax = clamp(V.x + V.vx * k, 0, W.WW - 1), ay = clamp(V.y + V.vy * k, 0, W.WH - 1); low = Math.min(low, V.z + V.vz * k - floorZ(ax, ay) - gh); }
    V.pull = V.gear < .5 && low < 22 && !stall; if (V.pull) wpch = Math.max(wpch, .3);   // roda terlipat & tanah di depan: tarik naik otomatis. Roda turun = boleh mendarat
    else if (V.z > F.hAt(V.x, V.y) + D.ceil - 90) wpch = Math.min(wpch, -.04);
    if (V.climbT > 0) { V.climbT -= dt; if (agl < 80 && !stall) wpch = Math.max(wpch, .24); else V.climbT = 0; }   // setelah lepas landas: menanjak sendiri sampai ±80 m
    if (stall) wpch = Math.min(wpch, -.28);   // stall: hidung jatuh sendiri
    const wy = edge ? Math.atan2(W.WH / 2 - V.y, W.WW / 2 - V.x) : Math.atan2(want[1], want[0]);
    if (edge && !V.edge && P.veh === V) F.msg(Tt('f_vh_edge'), 'w'); V.edge = edge;
    const rate = D.turn * clamp(V.spd / 110, .45, 1.1) * (stall ? .4 : 1);
    // A/D = GULING MENGHINDAR (barrel roll): pesawat berguling 360° sambil bergeser ke samping ±25 m; rudal yang sedang mengejar bisa kehilangan kunci
    const rl = (+I.r || 0) > .6 ? 1 : (+I.l || 0) > .6 ? -1 : 0, R0 = D.roll;
    V.rcd = Math.max(0, (V.rcd || 0) - dt);
    if (rl && !V.rlP && !V.br && V.rcd <= 0 && !stall && R0) {
      V.br = { t: 0, d: rl }; V.rcd = R0.cd;
      for (const p of Q.projs) if (p.kind === 'missile' && !p.done && p.tgt === V.u && Math.random() < R0.dodge) { p.tgt = null; p.tx = V.x + rand(-120, 120); p.ty = V.y + rand(-120, 120); }
      if (P.veh === V) { F.msg(Tt('f_wf_roll'), 'g'); A() && A().local('switch', .5); }
    }
    V.rlP = rl;
    V.yr += (clamp(wrapPi(wy - V.yaw) * 2, -rate, rate) - V.yr) * Math.min(1, dt * 3.2); V.yaw = wrapPi(V.yaw + V.yr * dt);
    V.pit = clamp(V.pit + clamp((wpch - V.pit) * 2, -rate, rate) * dt, -1.25, 1.25);
    const cp = Math.cos(V.pit), sink = stall ? (1 - V.spd / D.vs) * 16 + 2 : 0;
    V.vx = Math.cos(V.yaw) * cp * V.spd; V.vy = Math.sin(V.yaw) * cp * V.spd; V.vz = Math.sin(V.pit) * V.spd - sink;
    let lat = 0;
    if (V.br) {   // guling: sudut guling penuh 2π (tampak mulus), dorongan menyamping berbentuk lonceng
      V.br.t += dt; const u = Math.min(1, V.br.t / R0.t); lat = V.br.d * R0.side * Math.sin(Math.PI * u);
      V.rolB = (V.rolB === undefined ? V.rol : V.rolB) + (clamp(-V.yr * 1.05, -1.2, 1.2) - (V.rolB || 0)) * Math.min(1, dt * 2.6);
      V.rol = V.rolB + V.br.d * 6.2832 * ss01(u);
      if (u >= 1) { V.br = null; V.rol = V.rolB; V.rolB = undefined; }
    } else V.rol += (clamp(-V.yr * 1.05, -1.2, 1.2) - V.rol) * Math.min(1, dt * 2.6);
    V.x = clamp(V.x + (V.vx - Math.sin(V.yaw) * lat) * dt, 20, W.WW - 20); V.y = clamp(V.y + (V.vy + Math.cos(V.yaw) * lat) * dt, 20, W.WH - 20);
    V.z = Math.min(V.z + V.vz * dt, F.hAt(V.x, V.y) + D.ceil);
    const fz = floorZ(V.x, V.y) + gh;
    if (V.z <= fz) {   // menyentuh tanah: MENDARAT bila roda turun, turun pelan, sayap datar & hidung tidak menukik — selain itu hancur
      const ok = V.gear > .85 && V.vz > -9 && Math.abs(V.rol) < .45 && V.pit > -.22 && V.pit < .45 && !F.water(V.x, V.y) && fz - V.z < 3;
      if (!ok) { hurtV(V, 1e6); V.z = fz; return; }
      if (V.vz < -4.5) hurtV(V, (-V.vz - 4.5) * 90);
      V.z = fz; V.gnd = true; V.spd = Math.hypot(V.vx, V.vy); V.vz = 0; V.yr = 0; V.gearMan = false; V.stall = false; V.br = null; V.rolB = undefined; V.tko = false; V.climbT = 0;
      F.puff(V.x, V.y, fz - gh + .3, 8, [170, 170, 166], 2.5); A() && A().at('thud', V.x, V.y, 1.2);
      if (P.veh === V) { F.msg(Tt('f_wf_land'), 'g'); P.shake = Math.min(1, P.shake + .25); }
    }
  }
  function fwIdle(V, dt) {   // tanpa pilot di darat: mengerem sampai berhenti
    const gh = VX(V.id).gear; V.thr = 0; V.spd *= Math.max(0, 1 - dt * 1.4); if (Math.abs(V.spd) < .15) V.spd = 0;
    const c = Math.cos(V.yaw), s = Math.sin(V.yaw), nx = V.x + c * V.spd * dt, ny = V.y + s * V.spd * dt;
    if (!F.solid(nx + c * 9, ny + s * 9)) { V.x = nx; V.y = ny; } else V.spd = 0;
    V.z = floorZ(V.x, V.y) + gh; V.vx = c * V.spd; V.vy = s * V.spd; V.vz = 0; V.pit *= .9; V.rol *= .9; V.gear = 1;
  }

  /* ---------- kamera ---------- */
  function camPose(V) {
    const v = F.aimVec(P.yaw, P.pitch), C = VX(V.id), zm = F.in.ads && !V.air;
    if (V.cam || zm) { const p = MX().ap(V.air ? frame(V) : turFrame(V), C.eye); return { x: p[0], y: p[1], z: p[2], v, fp: true }; }
    const D = V.D.cam, pz = V.z + (V.air ? 4.2 : C.eye[2] + .6), x = V.x - v[0] * D, y = V.y - v[1] * D;   // jet: kamera lebih tinggi agar badan pesawat tidak menutupi sasaran di bawah garis bidik
    return { x, y, z: Math.max(pz + 1.4 - v[2] * D, F.hAt(x, y) + 1.3), v };
  }
  F.vehCamera = function () {
    const V = P.veh, c = camPose(V), sh = (Math.random() - .5) * P.shake * F.shakeK * .02, zm = F.in.ads && !V.air;
    F.camHide = c.fp ? V.u : null;
    return { x: c.x, y: c.y, z: c.z, yaw: P.yaw + sh, pitch: P.pitch + sh, fov: (zm ? 24 : c.fp ? 62 : 74) * D2R };
  };
  F.vehLookK = () => P.veh ? (F.in.ads && !P.veh.air ? .35 : 1) : 1;
  F.vehCam = function () { const V = P.veh; if (!V) return; V.cam = 1 - V.cam; A() && A().local('switch', .5); };

  /* ---------- bidikan: titik tumbuk garis tengah layar, putar kubah & laras (balistik untuk granat/meriam), kunci rudal ---------- */
  function aimUpdate(V, dt) {
    const c = camPose(V), v = c.v, hit = F.aimRay(c.x, c.y, c.z, v, 3200);
    V.aim = { x: c.x + v[0] * hit.t, y: c.y + v[1] * hit.t, z: c.z + v[2] * hit.t, u: hit.u };
    V.aim.d = Math.hypot(V.aim.x - V.x, V.aim.y - V.y);
    if (V.air) {   // titik tumbuk kanon sebenarnya (lingkaran HUD): di luar jangkauan gimbal peluru lurus ke depan hidung
      if (V.D.fw) homLocks(V, c, v, dt); else locks(V, c, v, dt); const w = V.D.w[0], { m, d } = muzzle(V, w), r = F.aimRay(m[0], m[1], m[2], d, w.rng);
      V.bAim = r.t < w.rng ? [m[0] + d[0] * r.t, m[1] + d[1] * r.t, m[2] + d[2] * r.t] : null; return;
    }
    const C = VX(V.id), X = MX(), pv = X.ap(frame(V), [C.tur, 0, 0]), gp = X.ap(turFrame(V), C.gp), w = V.D.w[V.wi];
    const dh = Math.hypot(V.aim.x - gp[0], V.aim.y - gp[1]), dz = V.aim.z - gp[2];
    let el = Math.atan2(dz, dh);
    if (w.k !== 'gun') { const b = ballistic(w.spd, dh, dz); el = b === null ? Math.PI / 4 : b; }
    // arah tembak dunia → kerangka lambung (badan miring di lereng): putaran kubah & elevasi laras relatif lambung, tanpa simpangan samping
    const hz = Math.atan2(V.aim.y - pv[1], V.aim.x - pv[0]), ce = Math.cos(el), wd = [Math.cos(hz) * ce, Math.sin(hz) * ce, Math.sin(el)], R = frame(V).c;
    const ld = R.map(a => a[0] * wd[0] + a[1] * wd[1] + a[2] * wd[2]);
    const dy = wrapPi(V.yaw + Math.atan2(ld[1], ld[0]) - V.ty); V.ty = wrapPi(V.ty + clamp(dy, -V.D.trav * dt, V.D.trav * dt));
    el = clamp(Math.asin(clamp(ld[2], -1, 1)), V.D.el[0], V.D.el[1]); V.gE += clamp(el - V.gE, -1.1 * dt, 1.1 * dt);
    // titik jatuh laras sebenarnya (lingkaran HUD): kubah yang masih berputar / laras di batas elevasi terlihat
    const G = gunFrame(V), m = X.ap(G, [C.gp[0] + C.mz, C.gp[1], C.gp[2]]), d = X.ar(G, [1, 0, 0]);
    if (w.k === 'gun') { const r = F.aimRay(m[0], m[1], m[2], d, w.rng); V.bAim = [m[0] + d[0] * r.t, m[1] + d[1] * r.t, m[2] + d[2] * r.t]; }
    else { let x = m[0], y = m[1], z = m[2], vx = d[0] * w.spd, vy = d[1] * w.spd, vz = d[2] * w.spd; for (let i = 0; i < 160; i++) { x += vx * .04; y += vy * .04; vz -= 9.8 * .04; z += vz * .04; if (!F.inb(x, y) || z < F.hAt(x, y)) break; } V.bAim = [x, y, z]; }
    if (V.D.atgm) {   // MBT: kunci rudal antitank — kendaraan/bangunan musuh dalam 5° garis bidik
      let best = hit.u && !F.isHuman(hit.u.type) ? hit.u : null, bd = .087;
      if (!best) for (const u of Q.units) {
        if (u.dead || u.team === 'B' || u.chute > 0 || F.isHuman(u.type) || u.fly || u.jet) continue;
        const hb = F.hitbox(u), ex = u.x - c.x, ey = u.y - c.y, ez = hb.z0 + hb.h * .5 - c.z, dd = Math.hypot(ex, ey, ez); if (dd > V.D.atgm.rng || dd < 25) continue;
        const a = Math.acos(clamp((ex * v[0] + ey * v[1] + ez * v[2]) / dd, -1, 1)); if (a < bd && seen(c, u, hb)) { bd = a; best = u; }
      }
      V.lock = best;
    }
  }
  const seen = (c, u, hb) => { const ex = u.x - c.x, ey = u.y - c.y, ez = hb.z0 + hb.h + .6 - c.z, d = Math.hypot(ex, ey, ez); return F.rayTerrain(c.x, c.y, c.z, ex / d, ey / d, ez / d, d - 6) < 0; };   // tidak terhalang bukit / gedung: hanya sasaran yang terlihat bisa dikunci
  function locks(V, c, v, dt) {   // VTOL: kunci rudal udara-darat (kendaraan/bangunan) & pencari inframerah rudal udara-udara
    const G = V.D.agm, S = V.D.aam; let best = null, bd = G.cone, air = null, ba = S.cone;
    for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue;
      const isAir = u.fly || u.jet; if (!isAir && F.isHuman(u.type)) continue;
      const hb = F.hitbox(u), ex = u.x - c.x, ey = u.y - c.y, ez = hb.z0 + hb.h * .5 - c.z, d = Math.hypot(ex, ey, ez);
      const a = Math.acos(clamp((ex * v[0] + ey * v[1] + ez * v[2]) / Math.max(d, .1), -1, 1));
      if (isAir) { if (d < S.rng && d > 40 && a < ba && seen(c, u, hb)) { ba = a; air = u; } } else if (d < G.rng && d > 40 && a < bd && seen(c, u, hb)) { bd = a; best = u; }
    }
    V.lock = best;
    if (air !== V.aaU) { V.aaU = air; V.aaT = 0; }
    if (!V.aaU || V.aam <= 0) { V.aaT = 0; return; }
    const was = V.aaT >= S.lock; V.aaT += dt; V.aaB -= dt;
    if (V.aaB <= 0) { V.aaB = V.aaT >= S.lock ? .09 : .26; A() && A().local('lock', V.aaT >= S.lock ? .7 : .35); }
    if (!was && V.aaT >= S.lock) F.msg(Tt('f_vh_aamlock'), 'g');
  }

  function homLocks(V, c, v, dt) {   // WOLFPACK: pencari rudal mengunci OTOMATIS sampai 6 sasaran dalam kerucut bidikan (kendaraan, bangunan & pesawat didahulukan dari infanteri)
    const H = V.D.hom, L = V.hl, cand = [];
    for (let i = L.length - 1; i >= 0; i--) { const q = L[i], u = q.u; if (u.dead || u.chute > 0) { L.splice(i, 1); continue; }   // kunci lama bertahan selama sasaran masih di depan
      const hb = F.hitbox(u), ex = u.x - c.x, ey = u.y - c.y, ez = hb.z0 + hb.h * .5 - c.z, d = Math.hypot(ex, ey, ez), a = Math.acos(clamp((ex * v[0] + ey * v[1] + ez * v[2]) / Math.max(d, .1), -1, 1));
      if (d > H.rng * 1.1 || a > H.cone * 1.35) L.splice(i, 1); }
    if (V.hom > 0 && L.length < H.max) {
      for (const u of Q.units) {
        if (u.dead || u.team === 'B' || u.chute > 0 || L.some(q => q.u === u)) continue;
        const hb = F.hitbox(u), ex = u.x - c.x, ey = u.y - c.y, ez = hb.z0 + hb.h * .5 - c.z, d = Math.hypot(ex, ey, ez); if (d > H.rng || d < 60) continue;
        const a = Math.acos(clamp((ex * v[0] + ey * v[1] + ez * v[2]) / d, -1, 1)); if (a > H.cone) continue;
        cand.push({ u, hb, k: a * (F.isHuman(u.type) ? 1.8 : 1) + d / H.rng * .15 });
      }
      cand.sort((p, q) => p.k - q.k);
      for (const q of cand) { if (L.length >= H.max) break; if (seen(c, q.u, q.hb)) L.push({ u: q.u, t: 0 }); }
    }
    V.hB = (V.hB || 0) - dt;
    for (const q of L) { const was = q.t >= H.lock; q.t += dt; if (!was && q.t >= H.lock && V.hB <= 0 && P.veh === V) { V.hB = .08; A() && A().local('lock', .55); } }
    V.lock = L.length ? L[0].u : null;
  }
  function homSalvo(V) {   // [RMB] salvo: satu rudal per sasaran terkunci (maks 6, tiap pilon bergantian kiri-kanan); tanpa kunci = 2 rudal ke titik bidik
    const H = V.D.hom; if (V.hcd > 0 || V.hq.length) return; if (V.hom <= 0) { A() && A().local('empty', .6); return; }
    const tg = V.hl.filter(q => q.t >= H.lock).map(q => q.u), n = Math.min(V.hom, tg.length || 2);
    for (let i = 0; i < n; i++) V.hq.push(tg.length ? tg[i] : null);
    V.hom -= n; V.hcd = H.cd; V.hs = 0;
  }
  function homOne(V, tg) {
    const C = VX(V.id), p = wp(V, C.hom[V.hpi % 6]), d = MX().ar(frame(V), [1, 0, 0]); V.hpi++;
    launch(V, 'hom', p, nrm([d[0], d[1], d[2] - .06]), tg, 22); A() && A().local('hellfire', .85);
  }

  /* ---------- senjata ---------- */
  function muzzle(V, w) {   // titik moncong + arah tembak
    const X = MX(), C = VX(V.id);
    if (V.air) { const m = wp(V, C.gun), n = X.ar(frame(V), [1, 0, 0]), a = V.aim, t = nrm([a.x - m[0], a.y - m[1], a.z - m[2]]); return { m, d: n[0] * t[0] + n[1] * t[1] + n[2] * t[2] > (V.mode === 'jet' || V.D.fw ? .985 : .9) ? t : n }; }   // kanon jet: bergimbal ke titik bidik (±10° mode jet, ±25° melayang)
    const G = gunFrame(V); return { m: X.ap(G, w.id === 'COAX' ? C.co : [C.gp[0] + C.mz, C.gp[1], C.gp[2]]), d: X.ar(G, [1, 0, 0]) };
  }
  function fire(V, i) {
    const w = V.D.w[i], { m, d } = muzzle(V, w); V.mag[i]--;
    if (w.k === 'gun') {
      const sp = w.spread * D2R, v = nrm([d[0] + rand(-sp, sp), d[1] + rand(-sp, sp), d[2] + rand(-sp, sp)]), hit = F.aimRay(m[0], m[1], m[2], v, w.rng);
      const ix = m[0] + v[0] * hit.t, iy = m[1] + v[1] * hit.t, iz = m[2] + v[2] * hit.t, s = src();
      F.tracers.push({ x0: m[0], y0: m[1], z0: m[2], x1: ix, y1: iy, z1: iz, t: 0, life: .1, w: w.tw || .04 });
      if (!w.spin || V.mag[i] % 3 === 0) F.emit('flash', m[0], m[1], m[2], { life: .05, s0: w.spin ? .9 : .5, s1: w.spin ? 1.6 : 1, col: [255, 220, 140] });   // GAU-8: kilatan tiap 3 butir (kolam partikel tidak penuh)
      if (hit.u) { war.hurt(hit.u, F.isHuman(hit.u.type) ? w.dmgI : w.dmgV, F.isHuman(hit.u.type) ? 'small' : 'ap', s); hitMark(hit.u); }
      if (hit.t < w.rng) {
        if (w.he) { if (w.spin) splash(ix, iy, w.r, w.dmgI * .5, s); else war.explode(ix, iy, w.r, w.dmgI * .5, 'he', s); if (!w.spin || V.mag[i] % 4 === 0) { F.emit('flash', ix, iy, iz + .3, { life: .08, s0: 1, s1: 2.4, col: [255, 210, 140] }); F.puff(ix, iy, iz + .2, w.spin ? 1 : 2, [120, 108, 90], 1.6); } }
        else F.sparks(ix, iy, iz, 3);
      }
      if (!w.spin && (!V.air || V.mag[i] % 2)) A() && A().local(w.snd || 'lmg', V.air ? .45 : .55); P.shake = Math.min(.4, P.shake + (w.spin ? .008 : .02)); V.rec = .03;
    } else if (w.k === 'gl') {   // granat 40 mm: lintasan melengkung, meledak saat menyentuh apa pun
      const sp = w.spread * D2R; F.vp.push({ k: 'gl', w, x: m[0], y: m[1], z: m[2], vx: (d[0] + rand(-sp, sp)) * w.spd + V.vx, vy: (d[1] + rand(-sp, sp)) * w.spd + V.vy, vz: d[2] * w.spd, t: 0 });
      F.emit('flash', m[0], m[1], m[2], { life: .06, s0: .7, s1: 1.3, col: [255, 210, 140] }); F.emit('smoke', m[0], m[1], m[2], { vz: 1, life: .7, s0: .4, s1: 1.4, col: [200, 200, 196], a: .4 });
      A() && A().at('thud', V.x, V.y, 1.3); V.rec = .06;
    } else {   // meriam 120 mm: kilatan besar, asap moncong, debu tertiup di sekitar tank, badan tersentak
      F.vp.push({ k: 'sh', w, x: m[0], y: m[1], z: m[2], vx: d[0] * w.spd, vy: d[1] * w.spd, vz: d[2] * w.spd, t: 0 });
      F.emit('flash', m[0], m[1], m[2], { life: .1, s0: 2.4, s1: 4.2, col: [255, 214, 140] });
      for (let k = 0; k < 8; k++) F.emit('smoke', m[0], m[1], m[2], { vx: d[0] * rand(4, 14) + rand(-3, 3), vy: d[1] * rand(4, 14) + rand(-3, 3), vz: rand(0, 2), life: rand(1, 2), s0: 1, s1: 4, col: [196, 192, 184], a: .5, drag: 1.5 });
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; F.emit('dust', V.x + Math.cos(a) * 4, V.y + Math.sin(a) * 4, V.z + .3, { vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, vz: .5, life: 1.1, s0: 1, s1: 3, col: [150, 134, 104], a: .45, drag: 1.5 }); }
      A() && A().at('cannon', V.x, V.y, 1.8); P.shake = Math.min(1.2, P.shake + .5); V.rec = .55; V.pit -= .035 * Math.cos(V.ty - V.yaw); V.rol += .035 * Math.sin(V.ty - V.yaw);
    }
  }
  function splash(x, y, r, dmg, s) {   // GAU-8: cipratan peluru ledak tanpa efek ledakan war (65 butir/dtk akan memenuhi kolam partikel)
    for (const t of Q.units) { if (t.dead || t.team === 'B' || Math.abs(t.x - x) > r + 2 || Math.abs(t.y - y) > r + 2) continue; const d = Math.hypot(t.x - x, t.y - y); if (d < r + 2) war.hurt(t, dmg * (1 - .6 * Math.min(1, d / (r + 2))), 'he', s); }
  }
  function reload(V, i) {
    const w = V.D.w[i]; if (!w.rel || V.relT > 0 || V.res[i] <= 0 || V.mag[i] >= w.mag) return;
    V.relT = w.rel; V.relI = i; A() && A().local('magout', .7);
  }
  function weapons(V, dt) {
    const I = F.in, D = V.D;
    for (let i = 0; i < V.cd.length; i++) V.cd[i] -= dt;
    if (V.relT > 0) { V.relT -= dt; if (V.relT <= 0) { const i = V.relI, w = D.w[i], n = Math.min(w.mag - V.mag[i], V.res[i]); V.mag[i] += n; V.res[i] -= n; A() && A().local('magin', .8); } }
    if (D.fw) {   // WOLFPACK: GAU-8 berputar dulu (spin dtk) lalu menembak terus-menerus; [RMB] = salvo rudal ke sasaran terkunci
      const w = D.w[0], on = I.fire && V.mag[0] > 0;
      V.spin = on ? Math.min(1, V.spin + dt / w.spin) : Math.max(0, V.spin - dt / w.spin * .5); V.sndT -= dt;
      if (V.spin > 0 && V.sndT <= 0) { V.sndT = .07; A() && A().local(V.spin >= 1 && on ? 'minigun' : 'spin', .55 + .4 * V.spin); }
      if (on && V.spin >= 1) { V.cd[0] = Math.max(V.cd[0], -dt); while (V.cd[0] <= 0 && V.mag[0] > 0) { fire(V, 0); V.cd[0] += 60 / w.rpm; } }
      if (I.fire && V.mag[0] <= 0 && !V.dry) { V.dry = true; A() && A().local('empty', .6); } if (!I.fire) V.dry = false;
      if (I.ads && !V.adsPrev) homSalvo(V);
      return;
    }
    const i = V.wi, w = D.w[i], busy = V.relT > 0 && V.relI === i;
    if (I.fire && V.cd[i] <= 0 && !busy) {
      if (V.mag[i] > 0) { fire(V, i); V.cd[i] = w.cd || 60 / w.rpm; }
      else if (V.res[i] > 0) reload(V, i); else if (!V.dry) { V.dry = true; A() && A().local('empty', .6); }
    }
    if (!I.fire) V.dry = false;
    if (V.mag[i] <= 0 && V.res[i] > 0 && !(V.relT > 0)) reload(V, i);
    if (V.air) {   // [RMB] rudal udara-darat (tekan)
      if (I.ads && !V.adsPrev) agm(V);
    }
  }
  function launch(V, k, p, dir, tg, sp0) {
    const a = V.aim; F.vp.push({ k, x: p[0], y: p[1], z: p[2], vx: V.vx + dir[0] * sp0, vy: V.vy + dir[1] * sp0, vz: V.vz + dir[2] * sp0, t: 0, tg, tx: a.x, ty: a.y, tz: a.z });
    for (let i = 0; i < 5; i++) F.emit('smoke', p[0], p[1], p[2], { vx: -dir[0] * rand(3, 8) + rand(-2, 2), vy: -dir[1] * rand(3, 8) + rand(-2, 2), vz: rand(-1, 1), life: rand(.7, 1.2), s0: .5, s1: 2.2, col: [222, 222, 216], a: .5 });
  }
  function atgmOne(V) {   // MBT: rudal dari rak kubah, mengejar sasaran terkunci / titik bidik
    if (V.atg <= 0 || !V.aim) return; V.atg--;
    const C = VX('MBT'), T = turFrame(V), X = MX(), sd = V.atg % 2 ? .17 : -.17, p = X.ap(T, [C.rk[0] + 1.1, C.rk[1] + sd, C.rk[2]]), d = X.ar(T, [1, 0, 0]);
    launch(V, 'tm', p, nrm([d[0], d[1], d[2] + .15]), V.lock, 45); A() && A().local('hellfire', .9);
  }
  function agm(V) {
    const G = V.D.agm; if (V.mcd > 0) return; if (V.agm <= 0) { A() && A().local('empty', .6); return; }
    V.agm--; V.mcd = G.cd; const C = VX('VTOL'), sd = V.agm % 2 ? 1 : -1, p = wp(V, [C.agm[0], sd * C.agm[1], C.agm[2] - .3]), d = MX().ar(frame(V), [1, 0, 0]);
    launch(V, 'agm', p, d, V.lock, 30); A() && A().local('hellfire', 1);
  }
  F.vehSmkKey = V => V && V.D && V.D.smoke ? V.D.smoke.key || 'G' : null;   // tombol tabir asap (tank: F, karena G = rudal antitank)
  F.vehKey = function (k) {   // tombol khusus kendaraan (fps-ui)
    const V = P.veh; if (!V || !V.u || V.u.dead) return;
    const D = V.D;
    if (k === 'R') {
      if (V.air && D.aam) {   // rudal udara-udara
        const S = D.aam; if (V.aaCd > 0) return; if (V.aam <= 0) { A() && A().local('empty', .6); return; }
        if (!V.aaU || V.aaU.dead || V.aaT < S.lock) { F.msg(Tt('f_vh_aamno'), 'c'); A() && A().local('empty', .6); return; }
        V.aam--; V.aaCd = S.cd; const C = VX('VTOL'), sd = V.aam % 2 ? 1 : -1, p = wp(V, [C.aam[0], sd * C.aam[1], C.aam[2] - .2]), d = MX().ar(frame(V), [1, 0, 0]);
        launch(V, 'aam', p, d, V.aaU, 20); A() && A().local('hydra', 1);
      } else if (!V.air) reload(V, V.wi);
    } else if (D.smoke && k === F.vehSmkKey(V)) {   // tabir asap: pelontar di kubah, awan menutupi kendaraan, rudal yang mengunci kehilangan sasaran
      const S = D.smoke; if (V.smCd > 0) return; if (V.smk <= 0) { A() && A().local('empty', .6); return; }
      V.smk--; V.smCd = S.cd; V.smT = S.dur;
      for (let i = 0; i < 18; i++) { const a = V.ty + rand(-1.4, 1.4), r = rand(5, 20); F.emit('smoke', V.x + Math.cos(a) * r, V.y + Math.sin(a) * r, V.z + 1.5, { vx: Math.cos(a) * rand(1, 4), vy: Math.sin(a) * rand(1, 4), vz: rand(.3, 1.5), life: S.dur * rand(.8, 1.1), s0: 3, s1: 12, col: [214, 214, 208], a: .85, drag: .6 }); }
      for (const p of Q.projs) if (p.kind === 'missile' && !p.done && p.tgt === V.u) { p.tgt = null; p.tx = V.x + rand(-90, 90); p.ty = V.y + rand(-90, 90); }
      F.msg(Tt('f_vh_smoke'), 'g'); A() && A().local('flare', .9);
    } else if (k === 'G' && D.fw) {   // WOLFPACK: roda pendarat naik / turun (manual)
      if (V.gnd) return; V.gearCmd = V.gearCmd ? 0 : 1; V.gearMan = true; F.msg(Tt('f_wf_gear', { s: Tt(V.gearCmd ? 'f_wf_gdn' : 'f_wf_gup') }), 'g'); A() && A().local('switch', .6);
    } else if (k === 'G') {
      if (D.atgm) { const T = D.atgm; if (V.acd > 0 || V.aq > 0) return; if (V.atg <= 0) { A() && A().local('empty', .6); return; } V.acd = T.cd; V.aq = Math.min(T.salvo, V.atg); V.as = 0; }
      else if (D.bomb) {   // bom jatuh bebas dari pilon dalam (CCIP di HUD)
        if (V.bcd > 0) return; if (V.bomb <= 0) { A() && A().local('empty', .6); return; }
        V.bomb--; V.bcd = D.bomb.cd; const C = VX('VTOL'), sd = V.bomb % 2 ? 1 : -1, p = wp(V, [C.bomb[0], sd * C.bomb[1], C.bomb[2] - .4]);
        F.vp.push({ k: 'bomb', x: p[0], y: p[1], z: p[2], vx: V.vx, vy: V.vy, vz: V.vz - 2, t: 0 }); A() && A().local('tug', 1); A() && A().local('switch', .5);
      }
    } else if (k === 'F' && D.flare) {
      if (V.fcd > 0) return; if (V.fl <= 0) { A() && A().local('empty', .6); return; }
      V.fl--; V.fcd = D.flare.cd; V.flT = D.flare.dur;
      for (let i = 0; i < 16; i++) { const sd = i % 2 ? 1 : -1, c = Math.cos(V.yaw), s = Math.sin(V.yaw); F.emit('fire', V.x, V.y, V.z - .5, { vx: -c * rand(6, 14) - s * sd * rand(8, 18) + V.vx * .6, vy: -s * rand(6, 14) + c * sd * rand(8, 18) + V.vy * .6, vz: rand(-2, 6), life: rand(1.6, 2.4), s0: .9, s1: .5, col: [255, 236, 190], a: .95, g: 5 }); }
      F.msg(Tt('f_ah_flare'), 'g'); A() && A().local('flare', 1);
    } else if (k === 'X' && V.air && D.arr === 'vtol') {   // ganti mode melayang ↔ jet
      if (V.mode === 'hov') {
        if (V.z - floorZ(V.x, V.y) < 15) { F.msg(Tt('f_vh_needalt'), 'c'); A() && A().local('empty', .6); return; }
        V.mode = 'jet'; V.spd = Math.max(V.spd, D.min * .95); V.thr = .35; V.pit = 0; P.pitch = Math.max(P.pitch, .06); F.msg(Tt('f_vh_jet'), 'g');
      } else { V.mode = 'hov'; V.vz = 0; F.msg(Tt('f_vh_hov'), 'g'); }
      A() && A().local('switch', .7);
    } else if (k === 'H') { if (V.hornT <= 0) { V.hornT = .5; A() && A().local('horn', 1); } }
    else if ((k === 'Q' || k === 'wheel') && D.w.length > 1) { V.wi = (V.wi + 1) % D.w.length; A() && A().local('switch', .5); }   // Q / roda: ganti senjata (sama seperti jalan kaki); isi ulang senjata lain tetap berjalan
    else if (k === 'wheel') F.vehCam();
  };

  /* ---------- proyektil kendaraan ---------- */
  function tickVp(dt) {
    for (let i = F.vp.length - 1; i >= 0; i--) {
      const m = F.vp[i]; m.t += dt;
      if (m.k === 'gl' || m.k === 'sh' || m.k === 'bomb') m.vz -= 9.8 * dt;
      else {   // rudal berpemandu: luncur lurus sesaat lalu berbelok ke sasaran (unit) atau titik bidik
        const P2 = m.k === 'hom' ? VD.WOLF.hom : m.k === 'aam' ? VD.VTOL.aam : m.k === 'agm' ? VD.VTOL.agm : VD.MBT.atgm, tg = m.tg && !m.tg.dead ? m.tg : null, hA = m.k === 'hom' && tg && (tg.fly || tg.jet);
        const hb = tg && F.hitbox(tg), tx = tg ? tg.x : m.tx, ty = tg ? tg.y : m.ty, tz = tg ? hb.z0 + hb.h * .5 : m.tz;
        const lz = m.k === 'aam' || hA ? 0 : Math.min(45, Math.max(0, Math.hypot(tx - m.x, ty - m.y) - 60) * .1);   // rudal darat: lintasan melengkung di atas bukit/gedung lalu menukik ke sasaran
        const dd = Math.hypot(tx - m.x, ty - m.y, tz - m.z);
        const sp = Math.min(P2.spd, 50 + m.t * (m.k === 'aam' ? 600 : m.k === 'hom' ? 420 : 260)), want = nrm([tx - m.x, ty - m.y, tz + lz - m.z]), cur = nrm([m.vx, m.vy, m.vz]), k = m.t < .2 ? 0 : Math.min(1, dt * (m.k === 'aam' || hA ? 7 : dd < 160 ? 14 : m.k === 'hom' ? 5 : 4));   // fase akhir: belok tajam ke sasaran
        if (m.k === 'aam' && !tg) { m.vx = cur[0] * sp; m.vy = cur[1] * sp; m.vz = cur[2] * sp; }
        else { const d = nrm([cur[0] + (want[0] - cur[0]) * k, cur[1] + (want[1] - cur[1]) * k, cur[2] + (want[2] - cur[2]) * k]); m.vx = d[0] * sp; m.vy = d[1] * sp; m.vz = d[2] * sp; }
        if (m.t % (m.k === 'hom' ? .07 : .03) < dt) F.emit('smoke', m.x, m.y, m.z, { life: m.k === 'hom' ? .9 : 1.4, s0: .4, s1: 1.6, col: [228, 228, 222], a: .5 });   // salvo 6 rudal: jejak lebih jarang
      }
      let hit = null; const n = Math.max(1, Math.ceil(Math.hypot(m.vx, m.vy, m.vz) * dt / 2.5));
      for (let j = 0; j < n && !hit; j++) {
        m.x += m.vx * dt / n; m.y += m.vy * dt / n; m.z += m.vz * dt / n;
        if (!F.inb(m.x, m.y) || m.z < F.hAt(m.x, m.y) || (m.z < F.WZ && F.water(m.x, m.y))) { hit = { u: null }; break; }
        if (m.k === 'bomb') continue;
        for (const u of Q.units) {
          if (u.dead || u.team === 'B' || u.chute > 0 || Math.abs(u.x - m.x) > 12 || Math.abs(u.y - m.y) > 12) continue;
          const hb = F.hitbox(u); if (Math.hypot(u.x - m.x, u.y - m.y) < hb.r + .5 && m.z > hb.z0 - .5 && m.z < hb.z0 + hb.h + .5) { hit = { u }; break; }
        }
        if (!hit && m.k !== 'gl' && m.k !== 'sh' && m.tg && !m.tg.dead) { const hb = F.hitbox(m.tg); if (Math.hypot(m.tg.x - m.x, m.tg.y - m.y, hb.z0 + hb.h * .5 - m.z) < (m.k === 'aam' ? VD.VTOL.aam.fuze : m.k === 'hom' ? VD.WOLF.hom.fuze : 3.3) + hb.r * .5) hit = { u: m.tg }; }   // sumbu jarak dekat (rudal terkunci)
      }
      if (!hit && m.t < (m.k === 'bomb' ? 40 : 9)) continue;
      F.vp.splice(i, 1); boom(m, hit && hit.u);
    }
  }
  function boom(m, u) {
    const s = src(), air = m.z > F.hAt(m.x, m.y) + 8;
    if (m.k === 'gl') { const w = m.w; war.explode(m.x, m.y, w.r, w.dmg, 'he', s); if (u) hitMark(u); F.boom3d(m.x, m.y, m.z, 3); A() && A().boom(m.x, m.y, 3); }
    else if (m.k === 'sh') { const w = m.w; if (u) { war.hurt(u, w.dmg, 'ap', s); hitMark(u); } war.explode(m.x, m.y, w.r, w.dmg * .3, 'he', s); F.boom3d(m.x, m.y, m.z, 6); A() && A().boom(m.x, m.y, 8); F.puff(m.x, m.y, m.z + .3, 6, [120, 108, 90], 3); }
    else if (m.k === 'aam') {
      const S = VD.VTOL.aam; if (u) { war.hurt(u, S.dmg, 'aa', s); hitMark(u); }
      for (const t of Q.units) if (t !== u && !t.dead && t.team !== 'B' && (t.fly || t.jet)) { const hb = F.hitbox(t), d = Math.hypot(t.x - m.x, t.y - m.y, hb.z0 + hb.h * .5 - m.z); if (d < S.r + hb.r) { war.hurt(t, S.dmg * .4, 'aa', s); hitMark(t); } }
      F.boom3d(m.x, m.y, m.z, 5); A() && A().boom(m.x, m.y, 3); return;
    } else if (m.k === 'bomb') {
      const B = VD.VTOL.bomb, gz = F.hAt(m.x, m.y); war.explode(m.x, m.y, B.r, B.dmg, 'bomb', s);
      F.boom3d(m.x, m.y, gz + 1, 22, true); A() && A().boom(m.x, m.y, 22); F.shock.push({ x: m.x, y: m.y, R: B.r * 2.4, t: 0, life: .7 });
      for (let i = 0; i < 3; i++) F.scorch.push({ x: m.x + rand(-4, 4), y: m.y + rand(-4, 4), r: rand(6, 9), t: 0, life: 20 });
      if (Math.hypot(m.x - P.x, m.y - P.y) < 300) P.shake = Math.min(1.5, P.shake + .6); return;
    } else if (m.k === 'hom') {   // rudal homing WOLFPACK: hulu ledak tandem, juga menghancurkan pesawat
      const R = VD.WOLF.hom; if (u) { war.hurt(u, R.dmg, u.fly || u.jet ? 'aa' : 'ap', s); hitMark(u); } war.explode(m.x, m.y, R.r, R.dmg * .35, 'he', s);
      A() && A().boom(m.x, m.y, 8); if (!air) F.boom3d(m.x, m.y, m.z, 6);
    } else {   // rudal antitank / udara-darat: hulu ledak tandem
      const R = m.k === 'agm' ? VD.VTOL.agm : VD.MBT.atgm; if (u) { war.hurt(u, R.dmg, 'ap', s); hitMark(u); } war.explode(m.x, m.y, R.r, R.dmg * .35, 'he', s);
      A() && A().boom(m.x, m.y, 8);
    }
    if (air) F.boom3d(m.x, m.y, m.z, m.k === 'sh' ? 6 : 7);
  }

  /* ---------- naik / turun ---------- */
  F.vehNear = function () {
    if (P.veh || P.mnt || P.gs) return null; let best = null, bd = 1e9;
    for (const V of F.vehs) {
      if (!V.u || V.u.dead || V.st !== 'ready') continue;
      const d = Math.hypot(V.x - P.x, V.y - P.y);
      if (d < VX(V.id).L + 2.8 && d < bd && Math.abs(V.z - P.z) < (V.air ? 5 : 4)) { best = V; bd = d; }
    }
    return best;
  };
  F.vehUse = function () {   // tombol E
    if (!P.alive) return false;
    if (P.veh) { F.vehExit(); return true; }
    const V = F.vehNear(); if (!V || P.chute || (P.swim && !V.D.amph)) return false;
    P.veh = V; P.swim = false;
    Object.assign(P, { ads: 0, relT: 0, sprint: false, crouch: false, melT: 0, gT: 0, cycT: 0, eq: null, yaw: V.air ? V.yaw : V.ty, pitch: -.1 });
    F.in.fire = F.in.ads = false; V.adsPrev = false; V.cam = 0; if (V.air) V.mode = 'hov';
    const go = () => { F.msg(Tt('f_vh_in', { u: vname(V) }), 'g'); A() && A().local('spawn', .8); };
    if (!F.entry || !F.entry({ id: V.id, o: V, u: V.u, ty: V.ty - V.yaw }, go)) go();   // animasi orang pertama: buka pintu / naik & buka palka / buka kanopi, lalu duduk
    return true;
  };
  function seatOut(V) {   // titik keluar: pintu kiri / kanan / belakang yang tidak terhalang
    const C = VX(V.id), c = Math.cos(V.yaw), s = Math.sin(V.yaw), r = C.W + 1.3, b = C.L + 1.6;
    for (const [x, y] of [[V.x - s * r, V.y + c * r], [V.x + s * r, V.y - c * r], [V.x - c * b, V.y - s * b], [V.x + c * b, V.y + s * b]]) if (F.inb(x, y) && !F.solid(x, y) && !F.lava(x, y)) return [x, y];
    return [V.x, V.y];
  }
  F.vehExit = function () {
    const V = P.veh; if (!V) return;
    P.veh = null; F.camHide = null; F.in.fire = F.in.ads = false;
    const agl = V.air ? V.z - floorZ(V.x, V.y) - VX(V.id).gear * V.gear : 0, fwAir = V.D.fw && !V.gnd;
    if (V.air && (fwAir || (!V.D.fw && (agl > 12 || (agl > 1.5 && (V.mode === 'jet' || Math.hypot(V.vx, V.vy) > 25)))))) {   // kursi lontar (tinggi, atau rendah tapi melaju kencang): terlempar ke atas lalu parasut
      Object.assign(P, { x: V.x, y: V.y, z: V.z + 2, vx: V.vx * .3, vy: V.vy * .3, vz: 14, grounded: false, yaw: P.yaw, pitch: 0, swT: .4, spd: 0 });
      P.chute = 2; P.bail = true; A() && A().local('chute', .8); A() && A().boom(V.x, V.y, 2); F.msg(Tt('f_vh_eject'), 'w');
      V.st = V.mode === 'jet' || V.D.fw ? 'crash' : 'auto';
    } else {
      const [x, y] = seatOut(V);
      Object.assign(P, { x, y, z: F.hAt(x, y), vx: V.vx * .3, vy: V.vy * .3, vz: 0, grounded: true, pitch: 0, swT: .4, spd: 0 });
      if (V.air && !V.D.fw && agl > .5) V.st = 'auto';
    }
    P.unit.x = P.x; P.unit.y = P.y;
    if (V.u) { V.u.paxAir = V.air && agl > 6; F.paxOut(V.u); }   // pasukan penumpang ikut turun bersama operator
  };
  function down(V) {   // kendaraan hancur: ledakan besar; pengemudi terlempar keluar (jet tinggi: kursi lontar)
    const was = P.veh === V, agl = V.air ? V.z - floorZ(V.x, V.y) : 0;
    if (was) {
      P.veh = null; F.camHide = null; F.in.fire = F.in.ads = false; F.msg(Tt('f_vh_down', { u: vname(V) }), 'c');
      if (V.air && agl > 14) { Object.assign(P, { x: V.x, y: V.y, z: V.z + 2, vx: 0, vy: 0, vz: 12, grounded: false, spd: 0 }); P.chute = 2; P.bail = true; A() && A().local('chute', .8); F.msg(Tt('f_vh_eject'), 'w'); }
      else {
        const [x, y] = seatOut(V); Object.assign(P, { x, y, z: F.hAt(x, y), vx: 0, vy: 0, vz: 0, grounded: true, spd: 0 }); P.unit.x = x; P.unit.y = y;
        if (V.air) { P.unit.hp = 0; F.die(null); } else if (P.alive) war.hurt(P.unit, 55, 'he', null);   // jet menghantam tanah: pilot gugur; darat: luka bakar
      }
    }
    const z = V.air ? V.z : V.z + 1.5;
    F.boom3d(V.x, V.y, z, V.id === 'MBT' ? 13 : 10, true); A() && A().boom(V.x, V.y, 14); F.shock.push({ x: V.x, y: V.y, R: 30, t: 0, life: .6 });
    for (let i = 0; i < 22; i++) F.emit('debris', V.x, V.y, z, { vx: rand(-15, 15), vy: rand(-15, 15), vz: rand(3, 18), life: rand(1, 2.2), s0: .4, s1: .4, col: [40, 38, 34], g: 16 });
    if (!V.air || agl < 6) for (let i = 0; i < 3; i++) F.scorch.push({ x: V.x + rand(-3, 3), y: V.y + rand(-3, 3), r: rand(4, 7), t: 0, life: 25 });
  }

  /* ---------- tiap frame ---------- */
  F.vehPilot = function (dt) {   // dipanggil F.update saat P.veh
    const V = P.veh; if (!V || !V.u || V.u.dead) return;
    const I = F.in;
    if (V.air) (V.D.fw ? fwFly : jetFly)(V, dt, I);
    else { drive(V, dt, (+I.f || 0) - (+I.b || 0), (+I.r || 0) - (+I.l || 0), !!I.jump, !!I.sprint); contact(V, dt); }
    if (V.u.dead) return;
    Object.assign(P, { x: V.x, y: V.y, z: V.z + 1, vx: V.vx, vy: V.vy, vz: 0, spd: Math.hypot(V.vx, V.vy), grounded: true, sprint: false, ads: 0, crouch: false, swim: false });
    const pu = P.unit; pu.x = V.x; pu.y = V.y; pu.hdg = pu.face = P.yaw;
    aimUpdate(V, dt); weapons(V, dt); V.adsPrev = I.ads;
  };
  function idle(V, dt) {   // tanpa pengemudi
    if (!V.air) { drive(V, dt, 0, 0, true, false); return; }
    if (V.D.fw && V.st !== 'crash') { fwIdle(V, dt); return; }
    const C = VX('VTOL'), fl = floorZ(V.x, V.y);
    if (V.st === 'auto') {   // pilot melompat saat melayang: turun pelan lalu mendarat
      V.vx *= Math.max(0, 1 - dt); V.vy *= Math.max(0, 1 - dt); V.vz = -5; V.gear += (1 - V.gear) * Math.min(1, dt); V.noz += (Math.PI / 2 - V.noz) * Math.min(1, dt);
      V.x += V.vx * dt; V.y += V.vy * dt; V.z += V.vz * dt; V.pit *= .97; V.rol *= .97; hoverDust(V, dt);
      if (V.z <= fl + C.gear) { V.z = fl + C.gear; V.vz = 0; V.vx = V.vy = 0; V.st = 'ready'; }
    } else if (V.st === 'crash') {   // jet tanpa pilot: menukik & berputar sampai menghantam tanah
      V.pit = Math.max(-1.1, V.pit - dt * .25); V.rol += dt * 1.6; const cp = Math.cos(V.pit);
      V.vx = Math.cos(V.yaw) * cp * V.spd; V.vy = Math.sin(V.yaw) * cp * V.spd; V.vz = Math.sin(V.pit) * V.spd;
      V.x = clamp(V.x + V.vx * dt, 20, W.WW - 20); V.y = clamp(V.y + V.vy * dt, 20, W.WH - 20); V.z += V.vz * dt;
      if (Math.random() < dt * 20) F.emit('smoke', V.x, V.y, V.z, { vz: 1, life: 2.5, s0: 1, s1: 4, col: [40, 40, 40], a: .6 });
      if (V.z < fl + 1) { const s = V.u; war.explode(V.x, V.y, 22, 600, 'bomb', src()); hurtV(V, 1e6); if (!s.dead) war.kill(s, null); }
    } else { V.z = fl + C.gear; V.vx = V.vy = V.vz = 0; V.pit *= .9; V.rol *= .9; }
  }
  F.vehTick = function (dt) {   // selalu (juga saat berjalan kaki): kedatangan, kendaraan kosong, proyektil, suara mesin
    fallTick(dt);
    F.vlines.length = 0;
    tickVp(dt); tickCR(dt);
    for (let i = F.vehs.length - 1; i >= 0; i--) {
      const V = F.vehs[i];
      if (V.gen !== Q.g) { if (P.veh === V) { P.veh = null; F.camHide = null; } if (V.arr && V.arr.h) propDel(V.arr.h); F.vehs.splice(i, 1); continue; }
      if (V.u && V.u.dead) { if (V.arr && V.arr.h) propDel(V.arr.h); down(V); F.vehs.splice(i, 1); continue; }
      V.smT -= dt; V.smCd -= dt; V.mcd -= dt; V.aaCd -= dt; V.bcd -= dt; V.fcd -= dt; V.flT -= dt; V.acd -= dt; V.hornT -= dt; V.hcd -= dt; V.rec *= Math.max(0, 1 - dt * 6);
      if (V.hq.length) { V.hs -= dt; if (V.hs <= 0) { V.hs = V.D.hom.gap; const tg = V.hq.shift(); homOne(V, tg && !tg.dead ? tg : null); } }   // salvo rudal WOLFPACK beruntun
      if (V.aq > 0) { V.as -= dt; if (V.as <= 0) { V.as = V.D.atgm.gap; V.aq--; atgmOne(V); } }   // salvo rudal antitank
      if (V.st === 'in') ARR[V.arr.k](V, dt);
      else if (P.veh !== V) { idle(V, dt); if (!V.air) contact(V, dt); }
      if (!V.u || V.u.dead) continue;
      V.u.paxAir = V.air && V.z - floorZ(V.x, V.y) > 6;   // penumpang yang keluar dari VTOL yang sedang terbang: terjun payung
      let mw = false;   // peringatan rudal; flare / tabir asap mengecoh
      for (const p of Q.projs) {
        if (p.kind !== 'missile' || p.done || p.tgt !== V.u) continue;
        if (V.flT > 0 || V.smT > 0) { p.tgt = null; p.tx = V.x + rand(-90, 90); p.ty = V.y + rand(-90, 90); continue; }
        mw = true;
      }
      V.mw = mw; V.warnT -= dt; if (mw && P.veh === V && V.warnT <= 0) { V.warnT = .4; A() && A().local('lock', .8); }
      if (V.u.hp < V.lastHp && P.veh === V) { const k = V.lastHp - V.u.hp; P.lastHurt = P.time; P.shake = Math.min(1.3, P.shake + clamp(k / 90, .04, .45)); if (!(V.hsT > P.time)) { V.hsT = P.time + .35; A() && A().local('hurt', clamp(k / 60, .25, .6)); } }   // bunyi kena maks ±3×/dtk (bukan tiap peluru)
      V.lastHp = V.u.hp;
      const hp = V.u.hp / V.u.hpMax;
      if (hp < .4 && Math.random() < dt * 9) { const p = wp(V, [V.air ? -6 : -VX(V.id).L * .6, 0, V.air ? .5 : 1.8]); F.emit('smoke', p[0], p[1], p[2], { vz: 2, life: 2.4, s0: .8, s1: 3, col: [36, 36, 36], a: .6 }); if (hp < .18) F.emit('fire', p[0], p[1], p[2], { vz: 2, life: .4, s0: 1, s1: .4, col: [255, 140, 40], a: .85 }); }
      V.engT -= dt;   // dengung mesin: nada naik dengan laju/gas; parkir & kosong = mesin mati (senyap)
      const sp = Math.hypot(V.vx, V.vy), me = P.veh === V, run = me || V.st === 'in' || sp > 1.5 || (V.air && V.st !== 'ready');
      if (V.engT <= 0 && run) {
        const gas = me && (F.in.f || F.in.b || F.in.sprint) ? 1 : 0;
        if (V.air) { V.engT = .15; A() && A().eng(300 + V.spd * 3 + (V.mode === 'hov' ? 80 : 0), me ? .3 + gas * .1 : .6, me ? undefined : V.x, me ? undefined : V.y, true); }
        else { V.engT = .14; const base = V.id === 'MBT' ? 38 : V.id === 'APC' ? 46 : 55; A() && A().eng(base + sp * (V.id === 'MBT' ? 2.4 : 1.6) + gas * 8, me ? .26 + gas * .1 : .5, me ? undefined : V.x, me ? undefined : V.y); }
      }
      sync(V);
    }
  };
  F.vehClear = function () { for (const V of F.vehs) if (V.u) V.u.dead = true; F.vehs.length = 0; P.veh = null; F.vp.length = 0; for (const c of CR) if (c.a) propDel(c.a); CR.length = 0; F.vprops.length = 0; F.vchutes.length = 0; F.vlines.length = 0; };
})();
