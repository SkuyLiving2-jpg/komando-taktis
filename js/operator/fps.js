/* ============================================================
   FPS — logika mode OPERATOR (orang pertama): gerak, senjata,
   hitscan, granat, roket, killstreak, bantuan, kematian/respawn
   dan kait ke simulasi warzone
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, F = TK.FPS, war = TK.war, Q = war.Q, UT = W.UT;
  const { clamp, rand, wrapPi } = TK.util;
  const ss = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const D2R = Math.PI / 180, Tt = (k, v) => TK.t(k, v), A = () => TK.fpsaudio;
  const HUMAN = { INF: 1, SF: 1, AT: 1, MORT: 1, MEDIC: 1, OPR: 1, CMDR: 1, WARLORD: 1, CLAY: 1 };
  F.isHuman = t => !!HUMAN[t];
  const INDIRECT = { ARTY: 1, MLRS: 1, MORT: 1, SHIP: 1 };
  const perk = id => !!(F.hasPerk && F.hasPerk(id));   // perk aktif (fps-kit.js; uji Node tanpa modul itu = tanpa perk)
  const BLAST = { he: 1, ap: 1, bomb: 1 };   // jenis damage ledakan / proyektil berat (FLAK JACKET)

  /* ---------------- STATE ---------------- */
  const P = F.P = {
    on: false, alive: false, menu: true, unit: null, gen: null,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, rkP: 0, rkY: 0, eye: 1.7, crouch: false, sprint: false, ads: 0, grounded: true, chute: 0, bob: 0, stepD: 0, spd: 0,
    cls: null, w: [null, null], cur: 0, gren: 0, fireCd: 0, relT: 0, relD: 1, swT: 0, bloom: 0, cycT: 0, gT: 0, melT: 0, vk: 0,
    lastHurt: -99, hurtDirs: [], deadT: 0, killer: null, time: 0,
    started: false, kills: 0, deaths: 0, hs: 0, score: 0, streak: 0, best: 0, lastKillT: -99, mkN: 0, lastHead: false,
    slots: {}, uavT: 0, uavUnit: null, drone: null, tgt: null, shake: 0, hit: { t: -9, kill: false, head: false },
    feed: [], pops: [], msgs: [], tod: 'DAY', squad: [], armyDef: 'follow', marks: [], objOwn: [], sens: 1, fov: 78, inv: false, scoreT: 0, dmgTaken: 0,
    ab: { cd: 0, adr: 0, arm: 0 }, expo: 1, lastSeen: -99, spotQ: 0, spotAcc: 0, spotU: null, shellWarn: -99, abFlash: -9
  };
  F.in = { f: 0, b: 0, l: 0, r: 0, sprint: false, jump: false, fire: false, ads: false, press: 0, kl: 0, kr: 0, ku: 0, kd: 0 };
  F.fx3 = []; F.gren = []; F.rock = []; F.corpses = []; F.tracers = []; F.marks = []; F.contacts = new Map();   // contacts: musuh yang baru menembak ke arah operator
  F.xp = 0; F.paused = false; F.opts = { sound: true, quality: 1, vol: .15, fps: false };
  // kualitas awal: GPU terintegrasi/perangkat lunak → RENDAH, lainnya → SEDANG (TINGGI hanya bila dipilih sendiri)
  F.autoQ = function () {
    let r = '';
    try { const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return 0; const x = g.getExtension('WEBGL_debug_renderer_info'); r = String(g.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : g.RENDERER) || ''); const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); } catch (e) { return 1; }
    F.gpu = r;
    if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(r)) { F.swGL = true; return 0; }   // akselerasi perangkat keras browser mati: fps-gl memakai profil PROFS
    if (/mali|adreno|powervr|apple gpu/i.test(r)) return 0;
    return (navigator.hardwareConcurrency || 4) <= 2 ? 0 : 1;   // GPU terintegrasi laptop mampu SEDANG di resolusi asli; bila berat, resolusi dinamis & penurunan otomatis (sesi ini saja) yang mengatasi
  };
  try {
    F.xp = +localStorage.getItem('tk_fps_xp') || 0; P.sens = +localStorage.getItem('tk_fps_sens') || 1; F.opts.fps = localStorage.getItem('tk_fps_show') === '1';
    const sq = localStorage.getItem('tk_fps_q3'); const aq = typeof document !== 'undefined' && document.createElement ? F.autoQ() : 1; F.opts.quality = F.swGL ? 0 : sq !== null && sq !== '' ? Math.max(0, Math.min(2, +sq | 0)) : aq;
  } catch (e) { /* tanpa penyimpanan */ }
  const saveXp = () => { try { localStorage.setItem('tk_fps_xp', F.xp); } catch (e) { /* ok */ } };
  F.rank = () => { let r = 0; F.RANKS.forEach((v, i) => { if (F.xp >= v) r = i; }); return r; };
  const nw = id => { const d = F.WEAPONS[id]; return { id, ammo: d.mag, res: d.res }; };
  F.wdef = () => F.WEAPONS[P.w[P.cur].id];

  /* ---------------- DUNIA ---------------- */
  F.ensureWorld = function () {
    if (F.world && F.world.g === Q.g) return;
    const zones = [[Q.hqB.x, Q.hqB.y, 62], [Q.hqR.x, Q.hqR.y, 62]];
    Q.objs.forEach(o => zones.push([o.x, o.y, 46]));
    Q.units.forEach(u => { if (u.struct && u !== Q.hqB && u !== Q.hqR) zones.push([u.x, u.y, 20]); });
    F.buildWorld(Q.g, zones); for (const u of Q.units) if (u.lf && !u.pad0 && F.bTop(u.x, u.y) !== null) war.unpark(u);   // heli satgas yang kebetulan muncul di titik gedung: langsung mengudara
    F.fx3.length = 0; F.gren.length = 0; F.rock.length = 0; F.corpses.length = 0; F.dieReset && F.dieReset(); F.marks.length = 0; F.scans.length = 0; F.stun.length = 0; F.abDrone = null;
  };
  F.altOf = u => u.alt !== undefined ? u.alt : u.jet ? 150 + (u.id % 7) * 12 : (u.type === 'UAV' || u.type === 'UCAV') ? 110 : u.type === 'UFO' ? 58 + (u.id % 3) * 6 : u.fly ? 36 + (u.id % 5) * 4 : 0;
  F.gzOf = u => (u.fly || u.jet || u.alt !== undefined ? (u.gzS !== undefined && !u.ctl ? () => u.gzS : F.hAt) : F.floorAt)(u.x, u.y);   // unit darat berdiri di tanah (bukan di atap bila tepat di samping dinding)
  F.zOf = u => F.gzOf(u) + F.altOf(u);
  /* unit udara: tinggi dasar mengikuti TANAH (bukan atap), melihat gedung di depan lalu menanjak halus & turun lagi; gedung terlalu tinggi = membelok memutar.
     Dulu tinggi = peta dengan atap, sehingga saat melintasi tepi gedung heli melompat setinggi gedung dalam satu frame. */
  const AIRC = 9;
  const airSpd = u => { const T = UT[u.type]; return Math.max(1, (T.spd || 40) * (u.spdK || 1) * (Q.speed || 1)); };
  function roofAhead(x, y, c, s, look) {   // atap tertinggi sepanjang koridor di depan
    let top = -1e9; const add = (px, py) => { const b = F.bTop(px, py); if (b !== null && b > top) top = b; };
    add(x, y);
    if (look > 1) for (let i = 1; i <= 5; i++) { const d = look * i / 5, px = x + c * d, py = y + s * d; add(px, py); add(px - s * 14, py + c * 14); add(px + s * 14, py - c * 14); }
    return top;
  }
  war.hooks.roofAt = (x, y) => !!(F.world && F.world.g === Q.g) && F.bTop(x, y) !== null;   // Clay tidak mendarat di dalam gedung; heli tidak parkir di atas gedung
  F.airTick = function (dt) {
    for (const u of Q.units) {
      if (u.dead || u.ctl || u.struct || !(u.fly || u.jet || u.alt !== undefined)) continue;
      if ((u.ts && u.ts.ph !== 'climb') || (u.lf && u.lf.ph !== 'climb')) { u.gzS = u.gzT = F.gAt(u.x, u.y); u.gzV = 0; continue; }   // di landasan / helipad: menapak di tanah
      const a = F.altOf(u), T = UT[u.type], jet = u.jet;
      u.aiT = (u.aiT || 0) - dt;
      if (u.aiT <= 0 || u.gzS === undefined) {
        u.aiT = .12 + (u.id % 5) * .012;
        const moving = u.path && u.path.length > 0 || jet, look = moving ? Math.min(jet ? 300 : 75, airSpd(u) * (jet ? 2.2 : 2)) : 0, c = Math.cos(u.hdg || 0), s = Math.sin(u.hdg || 0), clr = u.jf && !(u.jpk > Q.t) ? 2 : AIRC;
        const top = roofAhead(u.x, u.y, c, s, look), g = F.gAt(u.x, u.y);
        u.gzT = Math.max(g, top > -1e8 ? top + clr - a : -1e9);
      }
      if (u.gzS === undefined) { u.gzS = u.gzT; u.gzV = 0; continue; }
      const up = jet ? 45 : u.gzT - u.gzS > 14 ? 27 : 16, dn = jet ? 25 : 8, acc = jet ? 30 : 14, vT = clamp((u.gzT - u.gzS) * 1.2, -dn, up);
      u.gzV += clamp(vT - u.gzV, -acc * dt, acc * dt); u.gzS += u.gzV * dt;
    }
  };
  war.hooks.airSteer = function (u, want) {
    if (!F.world || u.ctl || u.jet || u.alt !== undefined && u.jf) return want;
    if (Q.t >= (u.asT || 0)) {
      u.asT = Q.t + .22;
      const v = airSpd(u), look = Math.min(170, v * 4), z = F.zOf(u), blocked = ang => { const c = Math.cos(ang), s = Math.sin(ang); for (let i = 1; i <= 4; i++) { const d = look * i / 4, b = F.bTop(u.x + c * d, u.y + s * d); if (b !== null && b + AIRC > z + 3 * (d / v)) return true; } return false; };
      let tg = 0;
      if (blocked(want)) { const sd = u.avS || (u.id % 2 ? 1 : -1); outer: for (const m of [.5, .95, 1.4]) for (const k of [sd, -sd]) if (!blocked(want + k * m)) { tg = k * m; u.avS = k; break outer; } }
      else if (Math.abs(u.avN || 0) < .05) u.avS = 0;
      u.avT = tg;
    }
    u.avN = (u.avN || 0) + ((u.avT || 0) - (u.avN || 0)) * .2;
    return want + u.avN;
  };
  F.hitbox = u => {
    const T = UT[u.type], gz = F.gzOf(u), alt = F.altOf(u);
    if (u.struct) return u.type === 'HQ' ? { z0: gz, h: 9, r: 12 } : u.type === 'BNK' ? { z0: gz, h: 2.8, r: 4.5 } : u.type === 'SENTRY' ? { z0: gz, h: 1.7, r: 1.1 } : u.type === 'MGN' ? { z0: gz, h: 1.4, r: 2.7 } : u.type === 'CAESAR' ? { z0: gz, h: 3.4, r: 5 } : { z0: gz, h: 4, r: 3.6 };
    const bx = (u.fly || u.jet || T.tc === 'A') && hbBox(u.type);   // unit udara: kotak pas-model (sumbu badan), dulu silinder pipih yang hanya diuji di dinding sampingnya
    if (bx) {   // orientasi = pose yang SEDANG digambar (fps-gl: arah hadap yang tertinggal saat berbelok, guling gunship/NEMESIS, angguk, ayun naik-turun)
      const rp = u._rp && P.time - u._rpT < .5 ? u._rp : null, yaw = rp ? rp[0] : u.hdg || 0, pit = rp ? rp[1] : 0, rol = rp ? rp[2] : T.bank || 0, zc = rp ? rp[3] : gz + alt;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit), cr = Math.cos(rol), sr = Math.sin(rol);
      const ex = [cy * cp, sy * cp, sp], ey = [-sy * cr - cy * sp * sr, cy * cr - sy * sp * sr, cp * sr], ez = [sy * sr - cy * sp * cr, -cy * sr - sy * sp * cr, cp * cr];   // = rz(yaw)·ry(pit)·rx(rol) (MD.X)
      const ext = Math.abs(ez[2]) * (bx[5] - bx[4]) / 2 + Math.abs(ey[2]) * (bx[3] - bx[2]) / 2 + Math.abs(ex[2]) * (bx[1] - bx[0]) / 2, mid = zc + ex[2] * (bx[0] + bx[1]) / 2 + ey[2] * (bx[2] + bx[3]) / 2 + ez[2] * (bx[4] + bx[5]) / 2;
      return { z0: mid - ext, h: ext * 2, r: T.hb ? T.hb[0] : 3 * T.sz, box: bx, yaw, ax: [ex, ey, ez], zc };
    }
    if (T.hb) return { z0: gz + alt + T.hb[2], h: T.hb[1], r: T.hb[0] };   // bos berukuran besar (balon udara, gunship, tank ultima, leviathan)
    if (u.fly || u.jet) return { z0: gz + alt - 2, h: 4, r: 3 * T.sz };
    if (T.dom === 'S') return { z0: 0, h: 7, r: 5 * T.sz };
    if (HUMAN[u.type]) return { z0: gz, h: 1.8 * (T.hs || 1), r: .55 * (T.hs || 1), human: true };
    return { z0: gz, h: 2.7, r: 2.3 * T.sz };
  };

  const BBX = {};
  function hbBox(type) {   // batas mesh model udara (sekali per tipe; rotor ikut = cakram rotor juga bisa kena)
    if (BBX[type] !== undefined) return BBX[type];
    let b = null; try { const m = F.MDL && F.MDL.aircraft && F.MDL.aircraft(type, 'R'); if (m && m.max[0] > m.min[0]) b = [m.min[0] - .3, m.max[0] + .3, m.min[1] - .3, m.max[1] + .3, m.min[2] - .4, m.max[2] + .3]; } catch (e) { b = null; }
    return (BBX[type] = b);
  }
  /* jarak sinar (o + v·t) ke hitbox unit: kotak berorientasi (unit udara) atau silinder LENGKAP dengan alas & tutup.
     Dulu hanya titik masuk di dinding samping silinder yang diuji → bidikan curam dari bawah ke heli/bos udara (masuk lewat alas) meleset. */
  F.rayHB = function (ox, oy, oz, v, u, hb, rk, zp) {
    rk = rk || 1; zp = zp || 0; let t0 = -1e9, t1 = 1e9;
    const slab = (o, d, a, b) => { if (Math.abs(d) < 1e-9) return o >= a && o <= b; let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; return t0 <= t1; };
    if (hb.box) {
      const B = hb.box, A = hb.ax, d = [ox - u.x, oy - u.y, oz - hb.zc], g = (rk - 1) * 2 + zp, L = (e) => e[0] * d[0] + e[1] * d[1] + e[2] * d[2], Lv = (e) => e[0] * v[0] + e[1] * v[1] + e[2] * v[2];
      if (!slab(L(A[0]), Lv(A[0]), B[0] - g, B[1] + g) || !slab(L(A[1]), Lv(A[1]), B[2] - g, B[3] + g) || !slab(L(A[2]), Lv(A[2]), B[4] - zp, B[5] + zp)) return -1;   // sinar diubah ke sumbu badan (yaw, angguk, guling)
    } else {
      const r = hb.r * rk, dx = ox - u.x, dy = oy - u.y, a = v[0] * v[0] + v[1] * v[1];
      if (a < 1e-12) { if (dx * dx + dy * dy > r * r) return -1; }
      else { const b = dx * v[0] + dy * v[1], q = b * b - a * (dx * dx + dy * dy - r * r); if (q < 0) return -1; const sq = Math.sqrt(q); t0 = (-b - sq) / a; t1 = (-b + sq) / a; }
      if (!slab(oz, v[2], hb.z0 - zp, hb.z0 + hb.h + zp)) return -1;
    }
    return t1 < 0 ? -1 : Math.max(t0, 0);
  };

  /* ---------------- UTIL ---------------- */
  const eyeZ = () => P.z + P.eye;
  F.aimVec = function (yaw, pitch) { const cp = Math.cos(pitch); return [Math.cos(yaw) * cp, Math.sin(yaw) * cp, Math.sin(pitch)]; };
  F.msg = (text, kind) => { P.msgs.push({ text, kind: kind || 'i', t: P.time }); if (P.msgs.length > 4) P.msgs.shift(); };
  const pop = (text, pts, cr) => { P.pops.push({ text, pts, cr, t: P.time }); if (P.pops.length > 6) P.pops.shift(); if (pts) { P.score += pts; F.xp += pts; saveXp(); } };
  const feed = (a, b, col) => { P.feed.push({ a, b, col, t: P.time }); if (P.feed.length > 6) P.feed.shift(); };
  F.emit = function (k, x, y, z, o) {
    if (F.fx3.length >= 700) return;
    F.fx3.push(Object.assign({ k, x, y, z, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 1, s1: 1, col: [255, 255, 255], a: 1, g: 0, drag: 0 }, o));
  };
  const puff = (x, y, z, n, col, sz) => { for (let i = 0; i < n; i++) F.emit('dust', x, y, z, { vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(.5, 3), life: rand(.5, 1), s0: sz * .4, s1: sz * 1.4, col, a: .55, drag: 2 }); };
  const sparks = (x, y, z, n) => { for (let i = 0; i < n; i++) F.emit('spark', x, y, z, { vx: rand(-5, 5), vy: rand(-5, 5), vz: rand(1, 6), life: rand(.2, .45), s0: .07, s1: .03, col: [255, 214, 120], g: 14 }); };
  F.puff = puff; F.sparks = sparks;

  /* ---------------- SPAWN ---------------- */
  function freeSpot(x, y) {
    for (let k = 0; k < 80; k++) {
      const px = k ? x + rand(-1, 1) * (16 + k * 2.2) : x, py = k ? y + rand(-1, 1) * (16 + k * 2.2) : y;
      if (!F.inb(px, py) || F.solid(px, py) || F.water(px, py) || F.solid(px + 3, py) || F.solid(px - 3, py) || F.solid(px, py + 3) || F.solid(px, py - 3)) continue;
      if (treeNear(px, py, 1.4)) continue;
      return [px, py];
    }
    return [x, y];
  }
  function treeNear(x, y, r) {
    const w = F.world, cx = Math.floor(x / W.CELL), cy = Math.floor(y / W.CELL);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = w.tc.get((cy + dy) * W.GW + cx + dx); if (!a) continue;
      for (const k of a) { const kind = w.trees[k * 6 + 4]; if (kind === 2 || kind === 8 || (F.felled && F.felled.has(k))) continue; const tx = w.trees[k * 6] - x, ty = w.trees[k * 6 + 1] - y, rr = kind === 3 || kind === 9 ? r + w.trees[k * 6 + 5] * .8 : r; if (tx * tx + ty * ty < rr * rr) return [tx, ty, k]; }
    }
    return null;
  }
  F.treeNear = treeNear; F.freeSpot = freeSpot;

  F.spawn = function (opt) {
    F.ensureWorld();
    const cls = F.CLASSES.find(c => c.id === opt.cls) || F.CLASSES[0], hq = Q.hqB;
    if (P.unit && !P.unit.dead) P.unit.dead = true;
    if (P.cls && P.cls.id !== cls.id && P.gen === Q.g && F.kitReset) F.kitReset();   // pindah kelas → lampiran meja senjata tidak ikut terbawa
    let x, y, drop = false;
    if (opt.at === 'drop' || opt.at === 'obj') { const o = Q.objs[opt.i] || Q.objs[0]; x = o.x + rand(-30, 30); y = o.y + rand(-30, 30); drop = opt.at === 'drop'; }
    else { x = hq.x + 110; y = hq.y + rand(-40, 40); }
    [x, y] = freeSpot(x, y);
    const yaw = Math.atan2(Q.hqR.y - y, Q.hqR.x - x), u = war.mk('B', 'OPR', x, y, { hp: cls.hp, hpMax: cls.hp, player: true, stance: 'HOLD', hdg: yaw, face: yaw });
    Object.assign(P, {
      hook: null, hookCd: 0, unit: u, gen: Q.g, alive: true, started: true, menu: false, x, y, z: F.hAt(x, y), vx: 0, vy: 0, vz: 0, yaw, pitch: 0, rkP: 0, rkY: 0, eye: 1.7, crouch: false, sprint: false, ads: 0, grounded: true, chute: 0,
      cls, w: [nw(cls.pri), nw(cls.sec)], cur: 0, gren: cls.gren, fireCd: .4, relT: 0, swT: .5, bloom: 0, cycT: 0, gT: 0, melT: 0, melQ: 0, melB: false, eq: null, abA: null, eqA: 0, gWind: 0, bashT: 0, melH: false, melC: null, vk: 0, lastHurt: -99, hurtDirs: [], deadT: 0, killer: null, tgt: null, shake: 0, streak: 0, mkN: 0,
      slots: {}, sk: 0, laser: null, swim: false, strk: 0, mnt: false, bail: false, uavT: 0, uavUnit: null, drone: null, gs: null, tod: opt.tod || P.tod,
      ab: { cd: 8, adr: 0, arm: 0 }, lastSeen: -99, spotAcc: 0, spotU: null, shellWarn: -99, stam: 1, stamT: 0, tired: false, down: null, downSave: null, lsUsed: false,
      perks: F.perksSel ? F.perksSel() : []   // perk pilihan menu kelas berlaku mulai terjun ini
    });
    if (F.applyKit) F.applyKit(true);   // lampiran dari meja senjata (amunisi penuh sesuai magasin baru)
    F.contacts.clear();
    P.objOwn = Q.objs.map(o => o.owner);
    if (drop) { P.chute = 1; P.z += 380; P.vz = -34; u.chute = 99; F.msg(Tt('f_drop'), 'i'); rebindArmy(); } else giveSquad();
    A() && A().local('spawn', .5);
    F.msg(Tt('f_deployed', { cls: Tt('f_cls_' + cls.id) }), 'i');
    if (!drop && F.bench) F.msg(Tt('f_kit_hint'), 'i');   // meja senjata (lampiran & perk) ada di markas
  };
  function giveSquad() {
    rebindArmy();
    for (let i = P.squad.length; i < 3; i++) {
      const a = rand(0, 6.28), s = war.mk('B', i === 2 ? 'MEDIC' : 'INF', P.x + Math.cos(a) * 9, P.y + Math.sin(a) * 9);
      own(s, 'follow', i, 3);
    }
  }
  function rebindArmy() {   // operator lahir ulang: pasukan yang diperintah IKUTI kembali mengikuti tubuh baru, yang bertahan tetap di tempat
    myArmy().forEach((s, i) => { if (s.cmdO === 'follow') orderUnit(s, 'follow', null, i, 1); });
  }

  /* ---------------- INPUT KE PEMAIN ---------------- */
  F.look = function (dx, dy) {
    if (!P.alive) return;
    if (P.gs) { F.gsPan(dx, dy); return; }
    const k = .0024 * P.sens * (1 - P.ads * (1 - F.wdefSafe().zoom) * .85) * F.heliLookK() * (F.vehLookK ? F.vehLookK() : 1);
    P.yaw = wrapPi(P.yaw + dx * k); P.pitch = clamp(P.pitch - dy * k * (P.inv ? -1 : 1), F.PMIN, 1.35);
  };
  F.wdefSafe = () => P.w[P.cur] ? F.WEAPONS[P.w[P.cur].id] : F.WEAPONS.AR;
  F.switchTo = function (i) {
    if (P.abA || P.down) return;   // LAST STAND: hanya pistol
    if (P.eq && P.gT <= 0 && P.melT <= 0) { eqSet(null); if (i === P.cur) return; }   // 1/2/roda saat memegang granat/pisau: kembali ke senjata
    if (!P.alive || i === P.cur || !P.w[i] || P.swT > .15) return;
    P.cur = i; P.swT = .42; P.relT = 0; P.cycT = 0; P.ads = 0; A() && A().local('switch', .5);
  };
  /* shotgun: rencana waktu isi peluru satu per satu (detik nominal) — dipakai logika amunisi di sini & animasi fps-vm.
     kosong: satu peluru lewat lubang ejeksi (port) + pompa, sisanya ke tabung; I = mulai peluru tabung pertama */
  F.sgPlan = (d, e, n) => { const s = d.shl, m = Math.max(0, n - (e ? 1 : 0)), I = s[0] + (e ? s[3] : 0); return { I, per: s[1], m, port: e ? s[3] : 0, end: I + m * s[1], out: s[2], dur: I + m * s[1] + s[2] }; };
  F.reload = function () {
    if (P.abA) return;
    if (P.eq) { if (P.gT <= 0 && P.melT <= 0) eqSet(null); return; }
    const w = P.w[P.cur], d = F.WEAPONS[w.id];
    if (!P.alive || P.swim || P.relT > 0 || P.swT > 0 || w.ammo >= d.mag || w.res <= 0) return;
    const e = w.ammo === 0, n = Math.min(d.mag - w.ammo, w.res), k = (P.ab.adr > 0 ? .7 : 1) * (perk('SLEIGHT') ? F.PERK.sleight : 1);   // SLEIGHT OF HAND: reload lebih cepat
    const du = !!d.dual && !w.dm;   // DUAL (Black Ops): reload ganjil = tukar cepat ke magasin yang dilakban di sebelahnya, reload genap = pasangan baru (normal)
    Object.assign(P, { relE: e, relN: n, relK: k, relL: 0, relC: false, relDu: du });
    P.relT = P.relD = (d.shl ? F.sgPlan(d, e, n).dur : e ? d.rel : d.rel * .82) * k * (du ? d.dual : 1); P.cycT = 0; A() && A().local('reload', .6);
  };
  F.toggleCrouch = () => { if (P.alive && P.chute === 0 && !P.swim) P.crouch = !P.crouch; };
  /* ---------------- PERLENGKAPAN DI TANGAN: [G] granat, [V] pisau / bayonet ----------------
     P.eq: null | 'gren' | 'knife' | 'bay'. Selama dipegang senjata tidak bisa menembak/membidik; klik kiri & kanan dipakai perlengkapan.
     tombol yang sama / 1 / 2 / roda / R = kembali ke senjata (animasi turun-naik P.swT) */
  function eqSet(k) {
    if (P.eq === k) return;
    const was = P.eq; P.eq = k; P.eqA = 0;
    Object.assign(P, { ads: 0, relT: 0, cycT: 0, gWind: 0, gT: 0, bashT: 0, melT: 0, melQ: 0, melHS: 0, melH: false, melC: null, pin: false, _thrown: false, _bashed: false, _rmb: F.in.ads });
    F.in.press = 0;
    if (!k && was) { P.swT = .35; A() && A().local(was === 'knife' ? 'ksheath' : 'switch', was === 'knife' ? .7 : .4); }   // senjata diangkat kembali
    else if (k) A() && A().local(k === 'gren' ? 'switch' : k === 'knife' ? 'kdraw' : 'melee', k === 'knife' ? .75 : .35);
  }
  F.eqSet = eqSet;
  F.throwGrenade = function () {   // [G]: keluarkan granat (G lagi = simpan)
    if (!P.alive || P.swim || P.chute || P.abA || P.down) return;
    if (P.eq === 'gren') { if (P.gT <= 0 && P.bashT <= 0) eqSet(null); return; }
    if (P.gren <= 0) { F.msg(Tt('f_nogren'), 'w'); A() && A().local('empty', .5); return; }
    if (P.gT > 0 || P.melT > 0) return;
    eqSet('gren');
  };
  /* serang musuh manusia di depan (jarak r, kerucut cos ≥ cone). n = jumlah sasaran satu ayunan (katana menebas beberapa orang); cut = bilah (suara & darah), tanpa cut = pukulan granat/bayonet */
  function meleeHit(r, dmg, cone, n, cut) {
    const ox = P.x, oy = P.y, v = F.aimVec(P.yaw, P.pitch), L = [];
    if (cut && war.crSwCut && war.crSwCut(ox, oy, Math.cos(P.yaw), Math.sin(P.yaw), r + 2.5, .1)) { P.melHS = .06; P.shake = Math.min(1.5, P.shake + .12); }   // v2.13: katana menebas Pedang Bayangan Cray di depan
    for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue;
      if (u.vanish) continue;
      const hb = F.hitbox(u), dx = u.x - ox, dy = u.y - oy, d = Math.hypot(dx, dy); if (d > r + (hb.human ? (u.cr ? 2.4 : 0) : 2.5) || (dx * v[0] + dy * v[1]) / (d || 1) < cone) continue;
      if (hb.human) L.push([d, u, hb]); else if (cut && !P._clang) { P._clang = true; war.hurt(u, dmg * .2, 'small', P.unit); A() && A().at('kclang', u.x, u.y, 1.1); sparks(u.x, u.y, hb.z0 + 1.2, 12); P.melHS = .07; P.shake = Math.min(1.5, P.shake + .16); }
    }
    L.sort((a, b) => a[0] - b[0]); const hits = L.slice(0, n || 1);
    for (const [, u, hb] of hits) {
      P.lastHead = false; war.blade = !!cut; war.hurt(u, dmg, 'small', P.unit); war.blade = false; P.hit = { t: P.time, kill: u.dead, head: false };   // war.blade: bilah katana (Cray hanya bisa dilukai bilah / ledakan, bukan peluru)
      if (cut) { const z = hb.z0 + 1.2; for (let i = 0; i < 9; i++) F.emit('dust', u.x, u.y, z + rand(-.3, .3), { vx: v[0] * rand(2, 7) + rand(-2, 2), vy: v[1] * rand(2, 7) + rand(-2, 2), vz: rand(-.5, 3.5), life: rand(.25, .5), s0: .07, s1: .24, col: [120, 18, 14], a: .85, g: 7 }); }
      else sparks(u.x, u.y, hb.z0 + 1.2, 6);
    }
    if (hits.length) { A() && A().local(cut ? 'kcut' : 'hit', .85); if (cut) { A() && A().local('hit', .55); P.melHS = .05; P.shake = Math.min(1.5, P.shake + .1); } return true; }
    if (cut && !P._clang) {   // bilah mengenai dinding / batu: berdenting & memercik
      const z = eyeZ(); for (const q of [r * .45, r * .8]) { const x = ox + v[0] * q, y = oy + v[1] * q, b = F.bTop ? F.bTop(x, y) : null, g = F.hAt(x, y), zz = z + v[2] * q; if ((b !== null && b > zz - .4) || g > zz) { A() && A().local('kclang', .8); sparks(x, y, zz, 12); P.melHS = .08; P.shake = Math.min(1.5, P.shake + .18); break; } }
    }
    return false;
  }
  /* [V]: keluarkan pisau — atau siapkan bayonet bila senjata di tangan berbayonet (AK-74M); V lagi = kembali menembak.
     klik kiri = serangan cepat, klik kanan = serangan kuat (ayunan lebih lama, jangkauan & damage besar, badan menerjang ke depan) */
  F.melee = function () {
    if (!P.alive || P.down || P.swim || P.chute || P.melT > 0 || P.gT > 0 || P.bashT > 0 || P.abA) return;
    const k = F.wdefSafe().bay ? 'bay' : 'knife';
    eqSet(P.eq === k ? null : k);
  };
  function meleeAtk(heavy) {
    const E = F.EQ, b = P.eq === 'bay' ? F.wdefSafe().bay : null, H = E.bayH;
    const c = b ? (heavy ? { t: b.t * H.k, hit: H.hit, r: b.r * H.r, dmg: b.dmg * H.dmg, cone: b.cone, lunge: H.lunge } : b) : heavy ? E.knifeH : E.knife;
    if (!heavy) P.melN = P.time - (P.melAt || -9) < 1.2 ? (P.melN || 0) + 1 : 0;   // sabetan beruntun bergantian forehand / backhand; jeda lama = mulai dari forehand lagi
    Object.assign(P, { melB: !!b, melH: heavy, melD: c.t, melT: c.t, melQ: c.hit, melC: c, melAt: P.time, _lunged: false, _clang: false, melHS: 0, sprint: false });
    if (b) A() && A().local('melee', heavy ? .8 : .5); else A() && A().local(heavy ? 'slashH' : 'slash', heavy ? .95 : .8, heavy ? Math.max(0, c.hit - .17) : Math.max(0, c.hit - .09));   // bunyi desir bilah tepat sebelum bilah sampai
  }
  function eqTick(dt, I) {
    const E = F.EQ, k = P.eq, rmb = I.ads && !P._rmb; P._rmb = I.ads;
    P.eqA += dt; const ready = P.eqA >= E.draw[k];
    if (k === 'hook') {   // alat kait: tembak = luncurkan ke titik bidik, klik kanan / bidik = simpan
      if (P.hook) return;
      if (rmb) { eqSet(null); return; }
      if (!ready) { I.press = 0; return; }
      if (I.press > 0) { I.press = 0; F.hookUse && F.hookUse(); }
      return;
    }
    if (k === 'gren') {
      if (!P.pin && P.eqA >= E.pin) { P.pin = true; A() && A().local('pin', .6); }   // pin dicabut tangan kiri
      if (P.gT > 0) {   // ayunan lempar: granat lepas dari tangan, lalu kembali ke senjata
        P.gT -= dt; if (!P._thrown && P.gT <= E.thr - E.rel) { P._thrown = true; throwNow(); }
        if (P.gT <= 0) eqSet(null); return;
      }
      if (P.bashT > 0) {   // pukulan dengan granat di genggaman
        P.bashT -= dt; const B = E.bash;
        if (!P._bashed && P.bashT <= B.t - B.hit) { P._bashed = true; meleeHit(B.r, B.dmg, B.cone); }
        if (P.bashT <= 0) P._bashed = false; return;
      }
      if (!ready) { P.gWind = 0; I.press = 0; return; }
      if (I.fire) { P.gWind = Math.min(1, P.gWind + dt / E.wind); I.press = 0; }   // ditahan: lengan ditarik ke belakang, granat belum dilempar
      else if (P.gWind > 0 || I.press > 0) { P.gT = E.thr; I.press = 0; }       // dilepas: lempar
      else if (rmb) { P.bashT = E.bash.t; A() && A().local('melee', .6); }
      return;
    }
    // pisau / bayonet
    const c = P.melC;
    if (P.melT > 0) {
      if (P.melH && c && c.lunge && !P._lunged && P.melQ <= .12) { P._lunged = true; const v = F.aimVec(P.yaw, 0); P.vx += v[0] * c.lunge; P.vy += v[1] * c.lunge; }   // menerjang
      if (k === 'knife' && !P.melH && I.press > 0 && P.melQ <= 0 && P.melT < P.melD * .34) { I.press = 0; meleeAtk(false); }   // jurus berantai: klik saat bilah kembali memotong sisa gerak
      return;
    }
    if (!ready) return;   // klik saat bilah baru dicabut tidak hilang: tersimpan sesaat (I.press), langsung menebas begitu siap
    if (I.press > 0) { I.press = 0; meleeAtk(false); } else if (rmb) meleeAtk(true);
  }
  F.cycleWeapon = () => F.switchTo(1 - P.cur);

  /* ---------------- DAMAGE KE PEMAIN ---------------- */
  function los(src) {
    const ex = P.x, ey = P.y, ez = eyeZ() - .3, sx = src.x, sy = src.y, sz = F.zOf(src) + (HUMAN[src.type] ? 1.5 : 2);
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, d = Math.hypot(dx, dy, dz); if (d < 3) return true;
    return F.rayTerrain(sx, sy, sz, dx / d, dy / d, dz / d, d - 2) < 0;
  }
  /* ---------------- DETEKSI: apakah musuh melihat/mendengar operator? ----------------
     jarak lihat = dasar × pengamat (optik) × kamuflase kelas × sikap (jongkok/lari) × cahaya × medan.
     tembakan tanpa peredam terdengar lebih jauh. Musuh di luar jarak ini tidak tahu posisi Anda. */
  const obsK = a => clamp(a.vis / 520, .8, 1.8);
  F.updateExpo = function () {
    const mv = clamp(P.spd / 8, 0, 1), cls = P.cls || F.CLASSES[0];
    let e = cls.stealth * (F.DETECT.mult[P.tod] || 1);
    if (P.sprint) e *= 1.6; else if (P.crouch) e *= .5 + mv * .15; else e *= 1 + mv * .3;
    if (P.ads > .5) e *= .85; if (P.ab.adr > 0) e *= 1.15;
    if ((F.tAt(P.x, P.y) & 15) === W.TER.FOREST) e *= .6;
    P.expo = e;
  };
  const susp = a => a.bsus && a.bsus.end > Q.t;   // bos yang sedang curiga (war.alert)
  function seesVisual(a) {
    const d = Math.hypot(a.x - P.x, a.y - P.y); if (d > (perk('SHADOW') ? F.PERK.shadow : F.DETECT.base * obsK(a) * P.expo)) return false;   // SHADOW: tak terlihat kecuali musuh tepat di sebelah Anda
    if (d > F.DETECT.close && !a.struct) {   // sudut pandang: unit yang tenang hanya melihat ke depan (±70°; kendaraan ±95°), yang waspada menoleh ke mana-mana (arah ikut s.a di sim)
      const f = a.path && a.path.length ? a.hdg : (a.face !== undefined ? a.face : a.hdg), off = Math.abs(wrapPi(Math.atan2(P.y - a.y, P.x - a.x) - (f || 0)));
      if (off > (HUMAN[a.type] ? 1.22 : 1.66) * (a.srch || susp(a) ? 1.35 : 1)) return false;
    }
    return los(a);
  }
  /* melihat butuh waktu: kontak mata harus bertahan (.25 + jarak/jarak-lihat-dasar × 1,4 dtk; waspada ×0,45) — sekilas lewat tidak langsung ketahuan */
  function spot(a) {
    const now = Q.t, dtc = Math.min(.5, Math.max(0, now - (a._sgT || now))); a._sgT = now;
    if (!seesVisual(a)) { a._sg = Math.max(0, (a._sg || 0) - dtc * .5); return false; }
    const d = Math.hypot(a.x - P.x, a.y - P.y), need = d < F.DETECT.close ? 0 : .25 + d / F.DETECT.base * (a.srch || susp(a) ? .63 : 1.4);
    a._sg = (a._sg || 0) + dtc; return a._sg >= need;
  }
  function hears(a) {   // suara tembakan cukup dekat untuk menunjuk posisi Anda dengan tepat (lebih jauh = hanya waspada, lihat noise)
    if (!(P.unit.revealT > Q.t)) return false;
    return Math.hypot(a.x - P.x, a.y - P.y) < (F.wdefSafe().sup ? F.DETECT.nearSup : F.DETECT.near);
  }
  F.awareOf = function (a) {   // dicache: apakah unit ini SENDIRI sedang melihat / mendengar jelas operator
    if (a.team !== 'R') return false; const c = a._aw; if (c && Q.t - c.t < .25) return c.v;
    const v = P.alive && !P.mnt && !P.veh && !(a.empT > Q.t) && (spot(a) || hears(a)); a._aw = { t: Q.t, v }; return v;
  };
  /* pengetahuan per unit: tahu = melihat/mendengar sendiri, atau diteriaki rekan yang berdiri dekat (<= DETECT.call m).
     Ingatan bertahan DETECT.mem dtk setelah kehilangan kontak; setelah itu unit menyisir posisi terakhir (war.alert) */
  F.knows = function (a) {
    if (a.team !== 'R' || !P.alive || P.mnt || P.veh || a.empT > Q.t) return false;
    if (a._kn > Q.t) return true;
    if (!F.awareOf(a)) return false;
    const D = F.DETECT; a._kn = Q.t + D.mem; P.lastSeen = Q.t;
    if (a.srch) { a.srch.x = P.x; a.srch.y = P.y; a.srch.r = 25; }   // posisi terakhir yang diketahui
    else war.alert(a, P.x, P.y, 25);
    for (const c of Q.units) {   // teriak ke rekan terdekat
      if (c === a || c.dead || c.team !== 'R' || c._kn > Q.t || Math.abs(c.x - a.x) > D.call || Math.abs(c.y - a.y) > D.call || Math.hypot(c.x - a.x, c.y - a.y) > D.call) continue;
      c._kn = Q.t + D.mem * .6; war.alert(c, P.x, P.y, 25);
    }
    return true;
  };
  war.hooks.knows = u => F.knows(u);
  war.hooks.sees = function (a) {   // bendera "terlihat" tim (dipakai sim) = ada musuh yang benar-benar tahu
    if (!P.alive || P.mnt || P.veh || a.empT > Q.t) return false;   // di dalam Apache / kendaraan: musuh membidik kendaraannya, bukan operator
    return F.knows(a);
  };
  /* waspada tanpa tahu posisi: perkiraan asal ancaman meleset sebesar err x jarak (peredam = jauh lebih kabur) */
  function alarm(u, err) {
    if (u.dead || u.team !== 'R' || u._kn > Q.t) return;
    const d = Math.hypot(u.x - P.x, u.y - P.y), e = Math.max(14, d * err), a = rand(0, 6.283), r = Math.sqrt(Math.random()) * e;
    war.alert(u, P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, e);
  }
  war.hooks.struck = function (t) {   // musuh terkena tembakan operator (masih hidup = kaget & mencari; rekan di dekatnya melihat ia roboh)
    if (t.team !== 'R' || !P.alive || P.mnt || P.veh || P.gs || P.indirect) return;   // dari heli / kendaraan / killstreak udara asal serangan jelas — sim menangani seperti biasa
    const sup = F.wdefSafe().sup, D = F.DETECT;
    if (!t.dead && t.boss) {   // bos yang tertembak langsung berbalik ke penembak: sensor & awaknya melacak asal peluru (dulu diam saja — war.alert mengecualikan bos)
      const fresh = !(t._kn > Q.t); t._kn = Math.max(t._kn || 0, Q.t + D.mem * 1.5); P.lastSeen = Q.t; war.alert(t, P.x, P.y, 20);
      if (fresh && Q.t - (t._bkT || -99) > 12) { t._bkT = Q.t; F.msg(Tt('f_boss_alert', { u: Tt('wu_' + t.type) }), 'w'); A() && A().local('warn', .5); }
    } else if (!t.dead) alarm(t, sup ? .5 : .3);
    for (const c of Q.units) {
      if (c === t || c.dead || c.team !== 'R' || Math.abs(c.x - t.x) > D.buddy || Math.abs(c.y - t.y) > D.buddy) continue;
      if (Math.hypot(c.x - t.x, c.y - t.y) <= D.buddy) alarm(c, sup ? .6 : .35);
    }
  };
  /* suara tembakan operator: tanpa peredam terdengar sampai DETECT.fire m (waspada, arah kira-kira), dengan peredam hanya DETECT.fireSup m;
     peluru yang menghantam sedekat DETECT.impact m dari musuh juga membuatnya waspada */
  let noiseT = 0;
  function noise(ix, iy) {
    const sup = F.wdefSafe().sup, D = F.DETECT, R = sup ? D.fireSup : D.fire, hear = P.time > noiseT;
    for (const u of Q.units) {
      if (u.dead || u.team !== 'R' || u._kn > Q.t || u.chute > 0) continue;
      const dx = u.x - P.x, dy = u.y - P.y;
      if (hear && Math.abs(dx) < R && Math.abs(dy) < R && dx * dx + dy * dy < R * R) alarm(u, sup ? .45 : .3);
      else if (Math.abs(u.x - ix) < D.impact && Math.abs(u.y - iy) < D.impact) alarm(u, sup ? .55 : .35);
    }
    if (hear) noiseT = P.time + .4;
  }
  war.hooks.hit = function (t, a, src, blast, dt) {
    if (!P.alive || P.mnt || P.veh || t.chute > 0 || P.chute) return;   // di dalam Apache / kendaraan: kerusakan masuk ke kendaraannya
    if (src && src.player) a *= .45;
    if (P.ab.arm > 0) a *= .5;
    if (src && INDIRECT[src.type]) a *= .65;   // artileri/mortir musuh menembak ke area, bukan ke satu orang
    if ((blast || BLAST[dt]) && perk('FLAK')) a *= F.PERK.flak;   // FLAK JACKET: ledakan mortir, peluru tank, granat, roket
    const ground = src && (src.tc === 'G' || src.tc === 'A') && !INDIRECT[src.type] && !src.player;   // tembakan langsung (darat & udara): perlu garis pandang + akurasi menurun dengan jarak
    if (ground && !los(src)) { if (!blast) sparks(P.x + Math.cos(P.yaw) * 1.5, P.y + Math.sin(P.yaw) * 1.5, eyeZ(), 2); return; }
    if (ground && !blast) {   // akurasi musuh turun dengan jarak (di sim 2D peluru selalu mengenai dengan peluang tetap)
      const d = Math.hypot(src.x - P.x, src.y - P.y), f = clamp(1.15 - d / 270, .16, 1) * (P.crouch ? .85 : 1) * (P.sprint ? .92 : 1) * (F.knows(src) ? 1 : .3) * ((war.DIFF[Q.diff] || {}).accP || 1);   // penembak yang belum melihat sendiri hanya menembak buta; MUDAH: gerombolan bidikannya payah
      if (Math.random() > f) { A() && A().whiz(src.x, src.y); P.shake = Math.min(1.5, P.shake + .05); sparks(P.x + rand(-2, 2), P.y + rand(-2, 2), P.z + rand(.2, 1.6), 2); return; }
    }
    t.hp -= a; t.hitT = Q.t; P.lastHurt = P.time; P.dmgTaken += a;
    P.shake = Math.min(1.5, P.shake + clamp(a / 40, .05, .6));
    if (src && !src.player) { const ang = wrapPi(Math.atan2(src.y - P.y, src.x - P.x) - P.yaw); P.hurtDirs.push({ a: ang, t: P.time }); if (P.hurtDirs.length > 8) P.hurtDirs.shift(); P.killer = src; }
    A() && A().local('hurt', clamp(a / 25, .3, 1));
    if (t.hp <= 0) { if (perk('LASTSTAND') && !P.down && !P.lsUsed && !P.swim && !P.chute) lastStand(); else die(src); }
  };
  /* LAST STAND: tembakan mematikan pertama membuat operator roboh, bukan tewas — merangkak pelan, hanya bisa menembak pistol.
     Tertembak lagi sampai nyawa jatuh habis = tewas; bertahan F.PERK.last.t dtk = bangkit kembali. Sekali per nyawa */
  function lastStand() {
    const L = F.PERK.last, u = P.unit;
    P.lsUsed = true; P.down = { t: 0, d: L.t }; u.hp = L.hp;
    if (P.eq) eqSet(null);
    Object.assign(P, { abA: null, relT: 0, cycT: 0, ads: 0, sprint: false, crouch: false, gWind: 0, gT: 0, melT: 0, melQ: 0 });
    const sec = P.w[1], sd = sec && F.WEAPONS[sec.id];
    if (!sd || sd.slot !== 1 || sd.mode === 'rocket') { P.downSave = sec; P.w[1] = { id: 'M1911', ammo: F.WEAPONS.M1911.mag, res: F.WEAPONS.M1911.mag * 3 }; }   // kelas berpeluncur roket: pistol cadangan
    P.cur = 1; P.swT = .5; P.fireCd = .5;
    F.msg(Tt('f_ls_down', { s: L.t }), 'c'); A() && A().local('death', .5); P.shake = Math.min(1.5, P.shake + .8);
  }
  function standUp() {
    const u = P.unit; P.down = null; u.hp = Math.max(u.hp, u.hpMax * F.PERK.last.up);
    if (P.downSave) { P.w[1] = P.downSave; P.downSave = null; }
    P.swT = .45; F.msg(Tt('f_ls_up'), 'g'); A() && A().local('spawn', .5);
  }
  function die(src) {
    P.down = null; P.downSave = null;
    P.gs = null; P.drone = null; P.mnt = false; P.veh = null; F.camHide = null; P.alive = false; P.eq = null; P.abA = null; P.deaths++; P.streak = 0; P.deadT = 0; P.unit.dead = true; P.tgt = null; P.ads = 0; P.sprint = false; P.chute = 0; P.mkN = 0;
    P.killerInfo = src ? { type: src.type, d: Math.hypot(src.x - P.x, src.y - P.y), team: src.team } : null;
    // animasi roboh: ditembak dari depan = jatuh terlentang (pandangan ke langit), dari belakang = tersungkur ke depan; berguling ke satu sisi
    const fa = src ? wrapPi(Math.atan2(src.y - P.y, src.x - P.x) - P.yaw) : rand(-3, 3);
    P.dieA = { back: Math.abs(fa) < 1.57 ? 1 : -1, side: Math.random() < .5 ? -1 : 1, tw: rand(-.35, .35), p0: P.pitch, eye: P.eye, hit: false };
    Q.stats.lost++; A() && A().local('death', 1);
    F.emit('smoke', P.x, P.y, P.z + 1, { vz: 1, life: 1.5, s0: .6, s1: 2, col: [90, 90, 90], a: .5 });
    F.STREAKS.forEach(k => { P.slots[k.id] = 0; }); P.sk = 0; P.laser = null;
  }
  F.die = die;

  /* ---------------- KILL / KORBAN ---------------- */
  const KILLPTS = { INF: 100, SF: 150, AT: 120, MORT: 120, MEDIC: 100, LTANK: 300, TANK: 400, IFV: 300, ARTY: 250, MLRS: 300, AA: 250, ZSU: 250, REPAIR: 200, HELI: 400, ATK2: 500, MEDHELI: 300, UCAV: 300, UAV: 150, FGT: 500, CAS: 500, BMB: 500, SHIP: 600, GBOAT: 300, BNK: 200, SAM: 300, HQ: 1000, UFO: 1500, JEEP: 150, SENTRY: 120, BLIMP: 2500, GUNSHIP: 2500, ULTIMA: 2500, CMDR: 2500, LEVI: 6000, NEMESIS: 6000, KRAKEN: 6000, TITAN: 6000, ZEUS: 6000, WARLORD: 6000, BEHEMOTH: 5000, TEMPEST: 5000, WYVERN: 5000, CLAY: 5000, CAESAR: 300, MGN: 200 };
  war.hooks.death = function (u, src) {
    const T = UT[u.type];
    if (u.boss && F.bossDie && F.bossDie(u)) { /* bos: animasi kematian sinematik, bangkai dibuat fps-bossdie */ }
    else if (u.ctl && u.type === 'AH64' && P.heli && P.heli.u === u) { /* Shadow Hunter pemain: bangkai dibuat fps-heli saat menghantam tanah */ }
    else if (!T.struct && F.unitDie && F.unitDie(u)) { /* animasi hancur per jenis, bangkai dibuat fps-bossdie */ }
    else if (!T.struct && !u.fly && !u.jet) { const rM = HUMAN[u.type] && F.GLW && F.GLW.motOf ? F.GLW.motOf(u.id) : null, h = u.hdg || 0, dx0 = src ? u.x - src.x : Math.cos(h + 2.6), dy0 = src ? u.y - src.y : Math.sin(h + 2.6), dl = Math.hypot(dx0, dy0) || 1; F.corpses.push({ x: u.x, y: u.y, type: u.type, team: u.team, face: u.face || u.hdg || 0, t: 0, human: HUMAN[u.type] ? 1 : 0, life: 5, pose: rM ? { ph: rM.ph, gv: rM.gvS || 0, aim: rM.aim, yaw: rM.yaw, sp: rM.sp } : null, hdg0: h, blast: !!Q.blast, ix: dx0 / dl, iy: dy0 / dl }); }
    const d = Math.hypot(u.x - P.x, u.y - P.y);
    if (src && src.team !== u.team && d < 900 && P.on && !T.struct) {
      const sn = src.player ? Tt('f_you') : Tt('wu_' + src.type);
      feed(sn, Tt('wu_' + u.type), u.team === 'R' ? 'b' : 'r');
    }
    if (src && src.player && u.team === 'R') { creditKill(u); if (perk('VULTURE') && !T.struct && F.vultureDrop) F.vultureDrop(u); }   // VULTURE: musuh menjatuhkan amunisi & obat
    else if (src && src.mine && u.team === 'R' && P.on) Q.cr += Math.round(Math.max(F.KILLCR.min, T.cost || 0) * F.KILLCR.squad * crK());   // kill oleh pasukanmu: kredit kecil
  };
  war.hooks.sat = function (key, v) { if (P.on && key !== 'w_sat_fill') F.msg(Tt(key, v), key === 'w_sat_fall' ? 'c' : 'g'); };   // pengumuman satgas serbu otomatis (war.js); bala bantuan cukup di log perang
  war.hooks.boss = function (key, u, v) {   // pengumuman bos dari sim → pesan + spanduk besar di HUD operator
    if (key.endsWith('_dead')) { if (!Q._bk || Q._bk.g !== Q.g) Q._bk = { g: Q.g, n: 0 }; Q._bk.n++; }   // bos dikalahkan (layar akhir misi)
    if (!P.on) return;
    const big = key === 'w_boss_near' || key === 'w_final_spawn' || key === 'w_final_hunt' || key === 'w_final_base' || key === 'w_final_back' || key === 'w_boss_dead' || key === 'w_final_dead' || key === 'w_raid_spawn' || key === 'w_raid_base' || key === 'w_raid_dead';
    if (key === 'w_final_spawn' || key === 'w_final_hunt') { P.shake = Math.min(2, P.shake + 1); A() && A().local('quake', 1); }   // bos akhir muncul: tanah bergetar
    F.msg(Tt(key, { u: Tt('wu_' + u.type), o: v && v.o || (u.post ? u.post.name : ''), n: v && v.n, m: v && v.m }), key.endsWith('_dead') ? 'g' : 'c');
    if (key === 'w_ftit_msl') { for (const s of Q.strk) F.marks.push({ x: s.x, y: s.y, t: 0, life: s.t }); A() && A().local('lock', 1); }   // zona jatuh rudal TITAN
    if (big) { P.bban = { key, u, t: P.time }; A() && A().local(key.endsWith('_dead') ? 'streak' : 'lock', 1); }
  };
  const crK = () => F.KILLCR.diff[Q.diff] || 1;   // makin sulit, makin besar kredit per kill
  function creditKill(u) {
    const T = UT[u.type], pts = KILLPTS[u.type] || 100, head = P.lastHead && HUMAN[u.type];
    P.kills++; if (!T.struct) { P.streak++; P.sk = (P.sk || 0) + 1; } P.best = Math.max(P.best, P.streak);
    const gap = P.time - P.lastKillT; P.mkN = gap < 4.5 ? P.mkN + 1 : 1; P.lastKillT = P.time;
    P.hit = { t: P.time, kill: true, head: !!head };
    const K = F.KILLCR, hk = perk('HARDLINE') ? F.PERK.hard : 1, cr = Math.round((Math.max(K.min, Math.round((T.cost || 0) * K.mult)) + (head ? K.head : 0) + (P.mkN >= 2 ? K.multi * P.mkN : 0)) * crK() * hk);   // HARDLINE: poin & kredit ×1,5
    Q.cr += cr;   // kredit untuk merekrut pasukan / bantuan
    pop(Tt('f_kill_' + (T.struct ? 'S' : T.tc === 'A' ? 'A' : HUMAN[u.type] ? 'I' : 'V'), { u: Tt('wu_' + u.type) }), Math.round(pts * hk), cr);
    if (head) { P.hs++; pop(Tt('f_head'), Math.round(50 * hk)); A() && A().local('head', 1); } else A() && A().local('kill', 1);
    if (P.mkN >= 2) pop(Tt('f_mk' + Math.min(5, P.mkN)), Math.round(25 * P.mkN * hk));
    if (!T.struct) F.STREAKS.forEach(s => { if (P.sk === s.kills) { P.slots[s.id] = (+P.slots[s.id] || 0) + 1; pop(Tt('f_streak_' + s.id) + ' ' + Tt('f_ready', { k: s.key }), 0); P.pops[P.pops.length - 1].stk = 1; F.msg(Tt('f_streak_' + s.id) + ' — ' + Tt('f_ready', { k: s.key }), 'g'); A() && A().local('streak', .9); } });
    if (P.sk >= F.STREAKS[F.STREAKS.length - 1].kills) { P.sk = 0; F.msg(Tt('f_streak_cycle'), 'w'); }   // siklus selesai: mulai lagi dari killstreak pertama
  }

  /* ---------------- SENJATA ---------------- */
  function spreadDeg() {
    const d = F.wdefSafe(), mv = clamp(P.spd / 8, 0, 1.6);
    if (d.acc) return 0;   // .44 Magnum berteropong: akurasi 100%
    let s =d.spread[0] + (d.spread[1] - d.spread[0]) * P.ads;
    s *= 1 + mv * (1 - P.ads * .7) * .9; if (P.crouch) s *= .72; if (!P.grounded) s *= 2.4;
    s += P.bloom * 1.3 * (1 - P.ads * .55);
    return perk('STEADY') ? s * F.PERK.steady.spread : s;   // STEADY AIM: sebaran jauh lebih rapat di semua jarak
  }
  F.spreadDeg = spreadDeg;
  /* titik moncong viewmodel di dunia: sinar kamera melewati posisi moncong di layar (TK.fpsvm.muzP), sejauh dist m dari mata
     → jejak peluru & kilatan tampak keluar dari laras yang terlihat (FOV viewmodel beda dari dunia, jadi lewat piksel layar) */
  let MZ = null;
  function muzzlePt(dist) {
    const m = TK.fpsvm && TK.fpsvm.muzP, c = P.cam; if (!m || !c || P.gs || P.mnt || P.veh) return null;
    const fw = m[2] / 2 / Math.tan(c.fov / 2), f = F.aimVec(c.yaw, c.pitch), r = [-Math.sin(c.yaw), Math.cos(c.yaw), 0];
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]], a = m[0] / fw, b = m[1] / fw;
    const v = [f[0] + r[0] * a + u[0] * b, f[1] + r[1] * a + u[1] * b, f[2] + r[2] * a + u[2] * b], l = Math.hypot(v[0], v[1], v[2]);
    return [c.x + v[0] / l * dist, c.y + v[1] / l * dist, c.z + v[2] / l * dist];
  }
  function shoot() {
    const w = P.w[P.cur], d = F.WEAPONS[w.id];
    w.ammo--; P.fireCd = 60 / d.rpm; P.vk = 1; P.unit.revealT = Q.t + 1.1; P.shotT = P.time;
    if (d.mode === 'bolt' || d.mode === 'pump') P.cycT = 60 / d.rpm * .95;
    const kk = d.kick * (P.ads > .5 ? (d.opt === 'acog' ? .5 : .68) : 1) * (P.crouch ? .85 : 1) * (P.ab.adr > 0 ? .6 : 1);   // ACOG 3,5×: hentakan diperbesar lensa → diredam agar bidikan tidak terasa bergetar
    P.rkP += kk * (.9 + Math.random() * .3) * D2R; P.rkY += (Math.random() - .5) * kk * .7 * D2R; P.bloom = Math.min(1, P.bloom + .11 * (perk('STEADY') ? F.PERK.steady.bloom : 1)); P.shake = Math.min(1.5, P.shake + d.kick * .06);
    A() && A().local(d.snd, 1); if (d.mode !== 'rocket' && d.mode !== 'bolt' && Math.random() < .45) A() && A().local('casing', .5 + Math.random() * .4, .32 + Math.random() * .22); if (w.ammo <= 0) P.autoRel = .35;   // selongsong jatuh ke tanah sesaat kemudian
    const sp = spreadDeg() * D2R, ox = P.x, oy = P.y, oz = eyeZ();
    if (d.mode === 'rocket') return fireRocket();
    MZ = muzzlePt(1);
    const n = d.pellets || 1;
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * Math.tan(sp), a = Math.random() * 6.283;
      const yaw = P.yaw + P.rkY + Math.cos(a) * r, pit = P.pitch + P.rkP + Math.sin(a) * r, v = F.aimVec(yaw, pit);
      hitscan(ox, oy, oz, v, d, i === 0);
    }
    // kilatan moncong dan selongsong
    const fv = F.aimVec(P.yaw, P.pitch), rx = -Math.sin(P.yaw), ry = Math.cos(P.yaw), fl = muzzlePt(1.1);
    if (fl) F.emit('flash', fl[0], fl[1], fl[2], { life: .05, s0: .5, s1: .8, col: [255, 226, 140] });
    else F.emit('flash', ox + fv[0] * 1.1 + rx * .18, oy + fv[1] * 1.1 + ry * .18, oz - .2 + fv[2] * 1.1, { life: .05, s0: .5, s1: .8, col: [255, 226, 140] });
    if (d.mode !== 'rocket') F.emit('casing', ox + rx * .25, oy + ry * .25, oz - .25, { vx: rx * 2.4 + rand(-.5, .5), vy: ry * 2.4 + rand(-.5, .5), vz: rand(1.4, 2.6), life: 1.2, s0: .05, s1: .05, col: [214, 170, 70], g: 12 });
  }
  function hitscan(ox, oy, oz, v, d, tracer) {
    const dh = Math.hypot(v[0], v[1]); let best = { t: d.rng1 * 1.15, u: null, head: false, kind: 'none' };
    const tt = F.rayTerrain(ox, oy, oz, v[0], v[1], v[2], best.t); if (tt > 0) best = { t: tt, u: null, kind: 'terrain' };
    if (dh > 1e-5) for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue;
      const dx = u.x - ox, dy = u.y - oy; if (dx * v[0] + dy * v[1] < -6 || u.vanish) continue;
      const hb = F.hitbox(u), t = F.rayHB(ox, oy, oz, v, u, hb, 1, .25); if (t < .3 || t >= best.t) continue;
      const z = oz + v[2] * t;
      best = { t, u, head: !!hb.human && z > hb.z0 + hb.h * .8, kind: 'unit' };
    }
    const ix = ox + v[0] * best.t, iy = oy + v[1] * best.t, iz = oz + v[2] * best.t;
    if (tracer) noise(ix, iy);
    if (tracer) F.tracers.push(MZ ? { x0: MZ[0], y0: MZ[1], z0: MZ[2], x1: ix, y1: iy, z1: iz, t: 0, life: .09 } : { x0: ox + Math.cos(P.yaw + .25) * .6, y0: oy + Math.sin(P.yaw + .25) * .6, z0: oz - .35, x1: ix, y1: iy, z1: iz, t: 0, life: .09 });
    if (best.kind === 'unit') {
      const u = best.u, fall = best.t <= d.rng0 ? 1 : 1 - .55 * clamp((best.t - d.rng0) / (d.rng1 - d.rng0), 0, 1);
      P.lastHead = best.head; war.hurt(u, d.dmg * fall * (best.head ? 2.2 : 1), d.dt, P.unit);
      if (!P.hit || P.hit.t !== P.time || !P.hit.kill) P.hit = { t: P.time, kill: u.dead, head: best.head };
      A() && !u.dead && A().local(best.head ? 'head' : 'hit', .8); sparks(ix, iy, iz, 4); A() && A().at(HUMAN[u.type] ? 'imp_f' : 'imp_m', ix, iy, HUMAN[u.type] ? .5 : .9);
    } else if (best.kind === 'terrain') {
      const ter = F.tAt(ix, iy) & 15; puff(ix, iy, iz, 2, ter === W.TER.WATER ? [190, 210, 230] : [150, 136, 108], 1.1); if (ter !== W.TER.WATER) sparks(ix, iy, iz, 2); A() && A().at(ter === W.TER.WATER ? 'imp_w' : (ter === W.TER.URBAN || ter === W.TER.ROAD || iz > F.gAt(ix, iy) + .6) ? 'imp_c' : 'imp_d', ix, iy, .85);
    }
  }
  function fireRocket() {
    const v = F.aimVec(P.yaw + P.rkY * .3, P.pitch + P.rkP * .3);
    F.rock.push({ x: P.x + v[0] * 1.5, y: P.y + v[1] * 1.5, z: eyeZ() - .25, vx: v[0] * 135 + P.vx * .3, vy: v[1] * 135 + P.vy * .3, vz: v[2] * 135, t: 0 });
    for (let i = 0; i < 8; i++) F.emit('smoke', P.x - v[0] * 1.5, P.y - v[1] * 1.5, eyeZ() - .4, { vx: -v[0] * rand(2, 8) + rand(-2, 2), vy: -v[1] * rand(2, 8) + rand(-2, 2), vz: rand(-.5, 1), life: rand(.6, 1.2), s0: .5, s1: 2.2, col: [210, 210, 205], a: .6 });
    P.vx -= v[0] * 2; P.vy -= v[1] * 2;
  }
  function throwNow() {
    const v = F.aimVec(P.yaw, P.pitch + .12), sp = F.EQ.spd; P.gren--;   // jarak lemparan mengikuti sudut pandang (lintasan balistik)
    F.gren.push({ x: P.x + v[0] * .8, y: P.y + v[1] * .8, z: eyeZ() - .2, vx: v[0] * sp + P.vx * .6, vy: v[1] * sp + P.vy * .6, vz: v[2] * sp + 2.5, t: 0, fuse: 3 });
    A() && A().local('throw', .6);
  }

  /* ---------------- OBJEK GERAK: granat, roket, partikel ---------------- */
  function explodeAt(x, y, z, r, dmg, dt) { war.explode(x, y, r, dmg, dt, P.unit); }   // efek 3D dibuat saat fx 'boom' dipindai
  function boom3d(x, y, z, size, big) {
    size = Math.min(size, big ? 30 : 14);
    const dx0 = x - P.x, dy0 = y - P.y, d0 = Math.hypot(dx0, dy0), keep = size * 1.4 + 4;
    if (d0 < keep && !big) { const a = d0 > .5 ? Math.atan2(dy0, dx0) : Math.random() * 6.28; x = P.x + Math.cos(a) * keep; y = P.y + Math.sin(a) * keep; z = F.hAt(x, y); }   // ledakan di posisi pemain digeser agar kamera tidak terbenam
    const n = Math.round(6 + size * .8);
    F.emit('flash', x, y, z + 1, { life: .1, s0: size * .25, s1: size * .7, col: [255, 238, 190] });
    for (let i = 0; i < n; i++) F.emit('fire', x + rand(-1, 1) * size * .2, y + rand(-1, 1) * size * .2, z + rand(.3, 1.2) * size * .2, { vx: rand(-1, 1) * size * .5, vy: rand(-1, 1) * size * .5, vz: rand(2, 7) * size * .22, life: rand(.4, .8), s0: size * .32, s1: size * .1, col: [255, rand(110, 170) | 0, 40], a: .7, drag: 1.6 });
    for (let i = 0; i < n; i++) F.emit('smoke', x + rand(-1, 1) * size * .25, y + rand(-1, 1) * size * .25, z + rand(.5, 2) * size * .2, { vx: rand(-1, 1) * size * .3, vy: rand(-1, 1) * size * .3, vz: rand(2, 5), life: rand(2, 4), s0: size * .22, s1: size * .95, col: [58, 56, 54], a: .6, drag: .5 });
    for (let i = 0; i < n; i++) F.emit('debris', x, y, z + .5, { vx: rand(-1, 1) * size * 1.4, vy: rand(-1, 1) * size * 1.4, vz: rand(4, 13), life: rand(.8, 1.6), s0: .22, s1: .22, col: [80, 68, 52], g: 16 });
    puff(x, y, z, 6, [130, 116, 92], size * .5);
    const d = Math.hypot(x - P.x, y - P.y); P.shake = Math.min(1.6, P.shake + clamp(1 - d / 260, 0, 1) * size * .06);
    if (!big) A() && A().boom(x, y, size);
  }
  F.boom3d = boom3d;
  function nuke3d(x, y, r) {   // bola api, kolom asap, dan awan jamur
    const z = F.hAt(x, y), d = Math.hypot(x - P.x, y - P.y);
    P.nukeT = P.time; P.nukeD = d; P.shake = Math.min(3, P.shake + clamp(1.6 - d / 1500, .2, 1.6));
    F.emit('flash', x, y, z + 40, { life: .6, s0: 60, s1: 260, col: [255, 250, 225] });
    for (let i = 0; i < 26; i++) { const a = rand(0, 6.28), v = rand(30, 70); F.emit('fire', x, y, z + 20, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(-5, 20), life: rand(1.2, 2.2), s0: 30, s1: 60, col: [255, rand(120, 190) | 0, 50], a: .8, drag: .9 }); }
    for (let i = 0; i < 30; i++) F.emit('fire', x + rand(-15, 15), y + rand(-15, 15), z + rand(10, 30), { vz: rand(28, 46), life: rand(2.5, 4), s0: 26, s1: 48, col: [255, rand(130, 170) | 0, 60], a: .75, drag: .15 });
    for (let i = 0; i < 40; i++) { const k = i / 40; F.emit('smoke', x + rand(-12, 12), y + rand(-12, 12), z + 10 + k * 40, { vz: rand(26, 40), vx: rand(-3, 3), vy: rand(-3, 3), life: rand(9, 14), s0: 26, s1: 70, col: [96, 82, 72], a: .75, drag: .12 }); }
    for (let i = 0; i < 30; i++) { const a = rand(0, 6.28), v = rand(50, 110); F.emit('smoke', x, y, z + 5, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(0, 4), life: rand(5, 8), s0: 18, s1: 55, col: [150, 136, 118], a: .6, drag: .6 }); }
    A() && A().boom(x, y, 40);
  }

  function updateObjects(dt) {
    // granat
    for (let i = F.gren.length - 1; i >= 0; i--) {
      const g = F.gren[i]; g.t += dt; g.vz -= 22 * dt;
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
      if (F.solid(nx, ny) && F.hAt(nx, ny) > g.z) { g.vx *= -.35; g.vy *= -.35; } else { g.x = nx; g.y = ny; }
      g.z += g.vz * dt; const gh = F.hAt(g.x, g.y) + .08;
      if (g.z < gh) { g.z = gh; if (g.vz < -3) A() && A().at('bounce', g.x, g.y, .6); g.vz = -g.vz * .35; g.vx *= .62; g.vy *= .62; if (Math.abs(g.vz) < 1) g.vz = 0; }
      if (g.t >= g.fuse) { F.gren.splice(i, 1); explodeAt(g.x, g.y, g.z, 5, 150, 'he'); }
    }
    // roket
    for (let i = F.rock.length - 1; i >= 0; i--) {
      const r = F.rock[i]; r.t += dt; let hit = false;
      const steps = Math.ceil(135 * dt / 2.5);
      for (let k = 0; k < steps && !hit; k++) {
        r.x += r.vx * dt / steps; r.y += r.vy * dt / steps; r.z += r.vz * dt / steps;
        if (r.z < F.hAt(r.x, r.y) || !F.inb(r.x, r.y)) hit = true;
        else for (const u of Q.units) {
          if (u.dead || u.team === 'B' || u.chute > 0 || Math.abs(u.x - r.x) > 14 || Math.abs(u.y - r.y) > 14) continue;
          const hb = F.hitbox(u); if (Math.hypot(u.x - r.x, u.y - r.y) < hb.r + .4 && r.z > hb.z0 - .5 && r.z < hb.z0 + hb.h + .5) { hit = true; break; }
        }
      }
      if (r.t % .03 < dt) F.emit('smoke', r.x, r.y, r.z, { life: 1.4, s0: .35, s1: 1.4, col: [225, 225, 220], a: .55 });
      if (hit || r.t > 8) { F.rock.splice(i, 1); explodeAt(r.x, r.y, r.z, 12, 330, 'ap'); }
    }
    // jejak peluru
    for (let i = F.tracers.length - 1; i >= 0; i--) { F.tracers[i].t += dt; if (F.tracers[i].t > F.tracers[i].life) F.tracers.splice(i, 1); }
    // mayat
    for (let i = F.corpses.length - 1; i >= 0; i--) { const c = F.corpses[i]; c.t += dt; const lf = c.life || 5; if (c.t > lf) { F.corpses.splice(i, 1); continue; } if (lf <= 6 && c.t > lf - .9) { if (c.dz0 === undefined) c.dz0 = c.dz || 0; const k = c.t - lf + .9; c.dz = c.dz0 - k * k * (c.human ? 1.5 : 4.5); } }   // bangkai 5 dtk, detik terakhir tenggelam ke tanah
    // partikel
    for (let i = F.fx3.length - 1; i >= 0; i--) {
      const p = F.fx3[i]; p.t += dt;
      if (p.t >= p.life) { F.fx3.splice(i, 1); continue; }
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; if (p.k === 'smoke' || p.k === 'fire') p.vz *= k; }
      p.vz -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.g && p.z < F.hAt(p.x, p.y) + .03) { p.z = F.hAt(p.x, p.y) + .03; p.vz = 0; p.vx *= .3; p.vy *= .3; }
    }
    // penanda target (asap merah)
    for (let i = F.marks.length - 1; i >= 0; i--) { const m = F.marks[i]; m.t += dt; if (m.t > m.life) { F.marks.splice(i, 1); continue; } if (Math.random() < dt * 14) F.emit('smoke', m.x + rand(-.5, .5), m.y + rand(-.5, .5), F.hAt(m.x, m.y) + .3, { vz: 5, life: 2.8, s0: .5, s1: 1.3, col: m.cmd ? [60, 190, 255] : [230, 40, 40], a: .85 }); }
  }

  /* ---------------- TITIK KEDATANGAN BANTUAN (selalu dekat operator) ---------------- */
  F.groundSpot = (d, a) => groundSpot(d, a);
  function groundSpot(dist, ang) {   // medan datar & kosong di sekitar arah pandang
    for (let k = 0; k < 14; k++) {
      const a = P.yaw + ang * (k % 2 ? -1 : 1) + (k >> 1) * .45 * (k % 2 ? 1 : -1), d = dist + (k >> 1) * 5, x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
      if (!F.inb(x, y) || F.water(x, y) || F.solid(x, y) || F.solid(x + 4, y) || F.solid(x - 4, y) || F.solid(x, y + 4) || F.solid(x, y - 4) || treeNear(x, y, 3.5) || Math.abs(F.hAt(x, y) - P.z) > 7) continue;
      return [x, y];
    }
    return freeSpot(P.x + Math.cos(P.yaw) * dist, P.y + Math.sin(P.yaw) * dist);
  }
  /* ---------------- KEDATANGAN: kendaraan darat menyetir masuk dari belakang operator, heli terbang masuk, kapal berlayar masuk ----------------
     unit dibuat di titik masuk (tidak terlihat: di belakang / jauh), diberi perintah 'move' ke titik tujuan dekat operator, lalu
     arrTick menjalankan perintah bawaan (IKUTI / TAHAN / …) setelah tiba. Perintah baru dari pemain langsung membatalkan kedatangan */
  const ARRV = { gnd: [75, 110], air: [420, 520], sea: [220, 420] };
  const gPass = (x, y) => F.inb(x, y) && x > 40 && y > 40 && x < W.WW - 40 && y < W.WH - 40 && !F.water(x, y) && !F.solid(x, y) && !F.lava(x, y) && W.passable(Q.g, Math.floor(x / W.CELL), Math.floor(y / W.CELL), 'G');
  function behindSpot(i) {   // darat: di belakang operator (±70°), cukup dekat tapi di luar pandangan
    const d0 = ARRV.gnd[0] + (i % 4) * 9;
    for (let k = 0; k < 40; k++) {
      const a = P.yaw + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .14 + (i % 3 - 1) * .12, d = d0 + Math.floor(k / 10) * 14, x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
      if (gPass(x, y) && !treeNear(x, y, 3)) return [x, y];
    }
    return null;
  }
  function airIn(i) {   // udara: masuk dari belakang-samping, ±450 m
    const a = P.yaw + Math.PI + rand(-.9, .9), d = rand(ARRV.air[0], ARRV.air[1]) + i * 12;
    return [clamp(P.x + Math.cos(a) * d, 40, W.WW - 40), clamp(P.y + Math.sin(a) * d, 40, W.WH - 40)];
  }
  function seaIn(type, dest) {   // laut: titik perairan lebih jauh dari operator, kapal berlayar ke dest
    const b = Math.atan2(dest[1] - P.y, dest[0] - P.x);
    for (let r = ARRV.sea[1]; r >= ARRV.sea[0]; r -= 50) for (let k = 0; k < 12; k++) {
      const a = b + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .3, x = dest[0] + Math.cos(a) * r, y = dest[1] + Math.sin(a) * r;
      if (war.deployCheck(type, x, y).ok && W.passable(Q.g, Math.floor(x / W.CELL), Math.floor(y / W.CELL), 'S')) return [x, y];
    }
    return null;
  }
  function arrive(u, x, y) {
    u.arrv = { x, y, t: 0 }; u.order = { k: 'move', x, y }; war.setPath(u, x, y); if (u.fly) u.hdg = u.face = Math.atan2(y - u.y, x - u.x);
    if (!u.fly && !u.path.length) { u.x = x; u.y = y; }   // tak ada rute (peta acak): langsung di tujuan seperti dulu
  }
  function arrTick(dt) {
    for (const u of P.squad) {
      const a = u.arrv; if (!a || u.dead) continue; a.t += dt;
      if (u.order.k !== 'move' || Math.hypot(u.x - a.x, u.y - a.y) < (u.fly ? 30 : 14) || a.t > 70) { u.arrv = null; orderUnit(u, u.cmdO || P.armyDef, P, P.squad.indexOf(u), P.squad.length); if (u.type === 'MEDHELI' && u.order.k === 'follow') u.order.dist = 30; }
    }
  }
  F.arrTick = arrTick;
  function airSpot(dist) {   // pesawat sayap putar muncul di langit sekitar operator
    const a = P.yaw + rand(.45, .85) * (Math.random() < .5 ? 1 : -1);   // masuk dari depan-samping agar langsung terlihat
    return [clamp(P.x + Math.cos(a) * dist, 40, W.WW - 40), clamp(P.y + Math.sin(a) * dist, 40, W.WH - 40)];
  }

  /* ---------------- KEMAMPUAN KELAS (tombol F) ---------------- */
  const tagFoe = (u, sec) => { u.tagT = Math.max(u.tagT || 0, P.time + sec); };
  const foesIn = (x, y, r, pred) => Q.units.filter(u => u.team === 'R' && !u.dead && u.chute <= 0 && Math.hypot(u.x - x, u.y - y) <= r && (!pred || pred(u)));
  /* kemampuan = aksi bertahap: senjata diturunkan, tangan kiri memakai alat (animasi di fps-vm), efek keluar tepat pada F.AB_ANIM[id].at detik.
     PULSE / DRONE / PAINT memindai bertahap: gelombang (F.scans) melebar dan menandai musuh saat dilewati; STUN = granat kejut sungguhan (F.stun) */
  F.scans = []; F.stun = []; F.abDrone = null;
  const vehFoe = u => !F.isHuman(u.type) && !u.struct;
  function stunAim() {
    const v = F.aimVec(P.yaw, P.pitch), t = F.rayTerrain(P.x, P.y, eyeZ(), v[0], v[1], v[2], 90), hit = t > 0 ? t : 40, dd = Math.max(12, hit), h = Math.hypot(v[0], v[1]) || 1;
    return { v, hit, dd, x: P.x + v[0] / h * dd * (hit < 12 ? 1 : h), y: P.y + v[1] / h * dd * (hit < 12 ? 1 : h) };   // bidikan terlalu dekat (menunduk): tetap dilempar minimal 12 m ke depan
  }
  F.useAbility = function () {
    if (!P.alive || P.gs || P.chute || !P.cls || P.abA || P.down) return false;
    const ab = P.cls.ab, A_ = A(), an = F.AB_ANIM[ab.id];
    if (P.ab.cd > 0) { F.msg(Tt('f_ab_wait', { s: Math.ceil(P.ab.cd) }), 'c'); return false; }
    if (ab.id === 'PAINT' && !foesIn(P.x, P.y, ab.r, vehFoe).length) { F.msg(Tt('f_ab_none'), 'c'); return false; }
    if (ab.id === 'STUN' && stunAim().hit < 5) { F.msg(Tt('f_tgt_close'), 'c'); return false; }
    if (P.mnt || P.veh || P.swim) { abFire(ab.id); P.ab.cd = ab.cd; return true; }   // di heli / berenang: tanpa animasi tangan
    if (P.eq) { if (P.gT > 0 || P.melT > 0 || P.bashT > 0) return false; P.eq = null; P.gWind = 0; }
    Object.assign(P, { relT: 0, cycT: 0, ads: 0, sprint: false, abA: { id: ab.id, t: 0, d: an.t, at: an.at, done: false } });
    P.ab.cd = ab.cd; A_ && A_.local(an.s0, .7);
    return true;
  };
  function abFire(id) {   // efek kemampuan (dipanggil pada momen animasinya)
    const ab = P.cls.ab, A_ = A();
    if (id === 'ADRENALINE') { P.ab.adr = ab.dur; P.unit.hp = Math.min(P.unit.hpMax, P.unit.hp + 45); P.abHit = P.time; P.hbT = 0; F.msg(Tt('f_ab_ok_ADRENALINE'), 'g'); A_ && A_.local('stim', .9); }
    else if (id === 'ARMOR') { P.ab.arm = ab.dur; P.abHit = P.time; P.shake = Math.min(1, P.shake + .35); F.msg(Tt('f_ab_ok_ARMOR'), 'g'); A_ && A_.local('plate', .9); }
    else if (id === 'PULSE' || id === 'DRONE' || id === 'PAINT') {
      const sp = { PULSE: 150, DRONE: 380, PAINT: 520 }[id], col = { PULSE: [80, 210, 255], DRONE: [120, 255, 150], PAINT: [255, 60, 50] }[id];
      F.scans.push({ id, x: P.x, y: P.y, R: ab.r, r: 0, sp, dur: ab.dur, n: 0, hit: new Set() });
      F.shock.push({ x: P.x, y: P.y, R: ab.r, t: 0, life: ab.r / sp, lin: true, col, w: id === 'PULSE' ? 1.6 : 4 });
      if (id === 'DRONE') F.abDrone = { x: P.x + Math.cos(P.yaw) * 3, y: P.y + Math.sin(P.yaw) * 3, z: eyeZ() + 1, t: 0, life: ab.dur, yaw: P.yaw };
      P.abFlash = P.time; P.abHit = P.time; A_ && A_.local(id === 'PAINT' ? 'laser' : 'pulse', .8);
    }
    else if (id === 'STUN') {   // granat kejut dilempar ke titik bidik (lintasan balistik), meledak saat sampai
      const a = stunAim(), T = clamp(a.dd / 34, .35, 1.1), z0 = eyeZ() - .15, x0 = P.x + a.v[0] * .6, y0 = P.y + a.v[1] * .6, tz = F.hAt(a.x, a.y) + .4;
      F.stun.push({ x: x0, y: y0, z: z0, vx: (a.x - x0) / T, vy: (a.y - y0) / T, vz: (tz - z0) / T + 11 * T, t: 0, T });
      A_ && A_.local('throw', .6);
    }
  }
  F.abFire = abFire;
  function stunBurst(x, y) {
    const ab = F.CLASSES.find(c => c.ab.id === 'STUN').ab, z = F.hAt(x, y) + 1, l = foesIn(x, y, ab.r);
    l.forEach(u => { u.stunT = Q.t + ab.dur * Q.speed; tagFoe(u, ab.dur); });
    F.emit('flash', x, y, z, { life: .3, s0: 5, s1: 16, col: [255, 255, 240] }); sparks(x, y, z, 18); puff(x, y, z, 8, [235, 235, 225], 3.5);
    F.shock.push({ x, y, R: ab.r, t: 0, life: .5, col: [240, 245, 255], w: 1.2 });
    F.msg(Tt('f_ab_ok_STUN', { n: l.length }), l.length ? 'g' : 'w'); A() && A().boom(x, y, 7); P.abFlash = P.time;
  }
  function abSim(dt) {   // gelombang pindai, granat kejut, drone intai, detak jantung adrenalin
    for (let i = F.scans.length - 1; i >= 0; i--) {
      const c = F.scans[i]; c.r = Math.min(c.R, c.r + c.sp * dt);
      for (const u of foesIn(c.x, c.y, c.r, c.id === 'PAINT' ? vehFoe : null)) if (!c.hit.has(u)) {
        c.hit.add(u); c.n++; tagFoe(u, c.dur); if (c.id === 'PAINT') u.paintT = Q.t + c.dur * Q.speed;
        if (c.n <= 12) A() && A().local('tag', .35);
      }
      if (c.r >= c.R) { F.scans.splice(i, 1); F.msg(Tt('f_ab_ok_' + c.id, { n: c.n }), c.n ? 'g' : 'w'); }
    }
    for (let i = F.stun.length - 1; i >= 0; i--) {
      const g = F.stun[i]; g.t += dt; g.vz -= 22 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
      if (g.t >= g.T || (g.t > .15 && g.z < F.hAt(g.x, g.y))) { F.stun.splice(i, 1); stunBurst(g.x, g.y); }
    }
    const D = F.abDrone;
    if (D) { D.t += dt; D.yaw += dt * .6; const h = Math.min(1, D.t / 2.5); D.z += ((F.hAt(D.x, D.y) + 6 + 40 * h) - D.z) * Math.min(1, dt * 1.5); if (D.t > D.life) F.abDrone = null; }
    if (P.ab.adr > 0 && P.alive) { P.hbT = (P.hbT || 0) - dt; if (P.hbT <= 0) { P.hbT = .5 + (1 - P.ab.adr / P.cls.ab.dur) * .35; A() && A().local('heart', .5 + .5 * P.ab.adr / P.cls.ab.dur); P.hbAt = P.time; } }
  }
  function abilityTick(dt) {
    const a = P.ab; a.cd = Math.max(0, a.cd - dt); a.adr = Math.max(0, a.adr - dt); a.arm = Math.max(0, a.arm - dt);
    if (P.abA) { const k = P.abA; k.t += dt; if (!k.done && k.t >= k.at) { k.done = true; abFire(k.id); } if (k.t >= k.d) P.abA = null; }
    // penandaan otomatis: bidik (ADS) musuh sejenak → ditandai di HUD, tembus penghalang
    P.spotQ -= dt; if (P.spotQ > 0) return; P.spotQ = .1;
    if (P.ads < .55) { P.spotAcc = 0; P.spotU = null; return; }
    const u = F.aimAt(); if (!u || u.struct) { P.spotAcc = Math.max(0, P.spotAcc - .1); return; }
    if (u !== P.spotU) { P.spotU = u; P.spotAcc = 0; }
    P.spotAcc += .1;
    const rec = P.cls.id === 'RECON';
    if (P.spotAcc >= (rec ? .3 : .7) && !((u.tagT || 0) > P.time + 4)) { tagFoe(u, rec ? 16 : 9); F.msg(Tt('f_tagged', { u: Tt('wu_' + u.type) }), 'w'); A() && A().local('tag', .8); }
  }

  /* ---------------- KILLSTREAK & BANTUAN ---------------- */
  const designate = () => {
    if (P.gs && P.gs.mode === 'uav' && P.drone) { const a = P.drone.aim; return a ? { x: a.x, y: a.y, d: Math.hypot(a.x - P.x, a.y - P.y) } : null; }   // dari kamera drone: titik bidik drone (jarak dihitung dari operator)
    const v = F.aimVec(P.yaw, P.pitch), t = F.rayTerrain(P.x, P.y, eyeZ(), v[0], v[1], v[2], 1800);
    if (t < 0) return null; return { x: P.x + v[0] * t, y: P.y + v[1] * t, d: t };
  };
  F.designate = designate;
  const gsStart = g => { P.gs = Object.assign({ cd: [0, 0, 0], shots: [], t0: P.time }, g); F.in.fire = F.in.ads = false; P.ads = 0; P.sprint = false; };
  F.droneEnter = function () {   // pindah ke kamera drone UAV (tubuh operator diam di tempat)
    if (!P.drone || P.uavT <= 0 || P.gs || P.mnt || P.veh || !P.alive) return false;
    gsStart({ mode: 'uav' }); A() && A().local('switch', .6); return true;
  };
  /* serangan udara berpilih titik (Predator, Overwatch, Laser): tahap 1 kursor di peta taktis; klik kiri = pilih, klik kanan = batal (hadiah kembali) */
  F.pickCfg = pk => pk === 'GUNSHIP' ? F.AC130 : pk === 'LASER' ? F.LASER : F.PRED;
  F.pickKey = pk => pk === 'GUNSHIP' ? 'f_gs_pick' : pk === 'LASER' ? 'f_laser_pick' : 'f_pred_pick';
  function pickStart(pk) {
    P.slots[pk]--; const p = designate(), d = 260, lim = F.pickCfg(pk).range;
    let cx = clamp(p ? p.x : P.x + Math.cos(P.yaw) * d, 10, W.WW - 10), cy = clamp(p ? p.y : P.y + Math.sin(P.yaw) * d, 10, W.WH - 10);
    const l = Math.hypot(cx - P.x, cy - P.y); if (l > lim) { cx = P.x + (cx - P.x) * lim / l; cy = P.y + (cy - P.y) * lim / l; }
    gsStart({ mode: 'pick', pk, t: F.PRED.pick, cx, cy }); A() && A().local('ui', .8);   // judul & petunjuk tampil di panel peta
  }
  function laserStart(x, y, sat) {   // sat: dari darat = sinematik satelit turun lalu POV satelit; dari heli / kendaraan = sinar saja, tanpa pindah kamera
    const LS = F.LASER;
    P.laser = { x, y, cx: x, cy: y, ph: sat ? 'sat' : 'charge', st: 0, ch: LS.charge, t: LS.dur, nova: 0, fx: 0, snd: 0, sc: 0, ring: 0, rings: [], foc: 0, k0: P.kills, sat, alt: LS.alt, zm: 0 };
    A() && A().local('streak', 1);
    if (sat) { P.gs = null; gsStart({ mode: 'laser' }); F.msg(Tt('f_laser_down'), 'g'); A() && A().local('satFall', 1); }
    else { F.msg(Tt('f_laser_on'), 'g'); A() && A().local('laserCh', 1); }
  }
  function pickGo(g) {   // titik dipilih: jalankan serangan sesuai jenisnya
    F.in.fire = false;
    if (g.pk === 'GUNSHIP') {   // AC-130 mengorbit titik pilihan, mulai dari sisi operator agar arah pandang mudah dikenali
      const d = Math.hypot(P.x - g.cx, P.y - g.cy), ang = d > 30 ? Math.atan2(P.y - g.cy, P.x - g.cx) : P.yaw + Math.PI;
      P.gs = null; gsStart({ t: F.AC130.t, w: 0, ox: g.cx, oy: g.cy, ang, ay: 0, ap: 0, zm: 0, kick: 0, aim: null });
      F.marks.push({ x: g.cx, y: g.cy, t: 0, life: 6 }); F.msg(Tt('f_gs_on'), 'g'); A() && A().local('streak', .9); return;
    }
    if (g.pk === 'LASER') { F.marks.push({ x: g.cx, y: g.cy, t: 0, life: 6 }); laserStart(g.cx, g.cy, true); return; }
    predLaunch(g);
  }
  F.useStreak = function (id) {
    if (id === 'UAV' && !P.slots.UAV && P.drone && !P.tgt) return F.droneEnter();   // UAV masih mengudara: [3] kembali ke kamera drone
    if (!P.alive || P.down || !P.slots[id] || P.tgt || P.gs || ((P.mnt || P.veh) && id !== 'UAV' && id !== 'LASER')) return false;
    if (id === 'UAV') {   // radar musuh + drone kamera yang bisa diterbangkan sendiri
      const DR = F.DRONE; P.slots[id]--; P.uavT = DR.dur;
      const u = war.mk('B', 'UAV', Math.max(60, P.x - 700), P.y, { life: DR.dur + 3 }); P.uavUnit = u; u.order = { k: 'move', x: P.x, y: P.y }; u.path = [{ x: P.x, y: P.y }];
      const me = P.mnt && P.heli ? P.heli : P;
      P.drone = { x: me.x - Math.cos(P.yaw) * 8, y: me.y - Math.sin(P.yaw) * 8, z: Math.max(P.z, F.hAt(me.x, me.y)) + 40, yaw: P.yaw, pitch: -.5, vx: 0, vy: 0, vz: 0, zm: 0, th: 0, fired: false };
      F.msg(Tt('f_uav_on'), 'g'); A() && A().local('streak', .8);
      if (!P.mnt && !P.veh) F.droneEnter(); return true;
    }
    if (id === 'GUNSHIP' || id === 'PRED') { pickStart(id); return true; }   // pilih titik di peta dulu: pusat orbit AC-130 / sasaran rudal
    if (id === 'APACHE') {   // AH-64 datang & mendarat di dekat operator; dinaiki dengan [E] (fps-heli.js)
      const r = F.heliCall(); if (!r) { F.msg(Tt('f_ah_nolz'), 'c'); return false; }
      P.slots[id]--; F.msg(Tt(r === 'refit' ? 'f_ah_refit' : 'f_ah_on'), 'g'); A() && A().local('streak', 1); return true;
    }
    if (id === 'LASER') {   // SATELIT HELIOS: pilih titik → satelit turun → POV satelit → isi daya → sinar diarahkan mouse → SUPERNOVA (dari heli / kendaraan: langsung di titik bidik, tanpa kamera satelit)
      if (!P.mnt && !P.veh) { pickStart(id); return true; }
      const p = designate(); if (!p) { F.msg(Tt('f_tgt_none'), 'c'); return false; }
      P.slots[id]--; laserStart(p.x, p.y, false); return true;
    }
    return false;
  };
  F.confirmTarget = function () {   // sasaran mortir (bantuan B)
    const tg = P.tgt; if (!tg) return;
    const p = designate(); if (!p) { F.msg(Tt('f_tgt_none'), 'c'); return; }
    if (p.d < 50) { F.msg(Tt('f_tgt_close'), 'c'); return; }
    if (tg.cost) { if (Q.cr < tg.cost) { F.msg(Tt('w_e_cr'), 'c'); P.tgt = null; return; } Q.cr -= tg.cost; }
    P.tgt = null; F.marks.push({ x: p.x, y: p.y, t: 0, life: 14 }); A() && A().local('ui', .8);
    rocketBarrage(p);
    F.msg(Tt('f_mortar_on'), 'g');
  };
  /* ---------------- BANTUAN MORTIR [B] = RENTETAN ROKET ----------------
     F.RKT.n roket meluncur dari arah markas kita, melengkung lalu menukik tajam (kurva Bézier: ujungnya hampir tegak) dengan
     api & jejak asap, lalu ledakan besar: bola api, gelombang kejut, kawah, serpihan, getaran kamera. Dulu: titik gelap kecil */
  F.rkts = [];
  const bez = (r, k) => { const a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k; return [a * r.sx + b * r.cx + c * r.tx, a * r.sy + b * r.cy + c * r.ty, a * r.sz + b * r.cz + c * r.tz]; };
  function rocketBarrage(p) {
    const R = F.RKT, b = Math.atan2(Q.hqB.y - p.y, Q.hqB.x - p.x);
    for (let i = 0; i < R.n; i++) {
      const a = b + rand(-.3, .3), tx = clamp(p.x + rand(-1, 1) * R.spread, 5, W.WW - 5), ty = clamp(p.y + rand(-1, 1) * R.spread, 5, W.WH - 5), tz = F.hAt(tx, ty);
      const sx = clamp(tx + Math.cos(a) * R.R, 5, W.WW - 5), sy = clamp(ty + Math.sin(a) * R.R, 5, W.WH - 5), sz = Math.max(F.hAt(sx, sy), tz) + R.alt * .55;
      F.rkts.push({ g: Q.g, sx, sy, sz, cx: tx + (sx - tx) * .12, cy: ty + (sy - ty) * .12, cz: tz + R.alt, tx, ty, tz, t: -(R.delay + i * R.gap + rand(0, .2)), dur: R.dur * rand(.92, 1.08), k: 0, snd: false });
    }
  }
  function rktTick(dt) {
    const R = F.RKT;
    for (let i = F.rkts.length - 1; i >= 0; i--) {
      const r = F.rkts[i]; if (r.g !== Q.g) { F.rkts.splice(i, 1); continue; }
      r.t += dt; if (r.t < 0) continue;
      if (!r.snd) { r.snd = true; A() && A().at('rocket', r.sx, r.sy, 1); }
      r.k = Math.min(1, Math.pow(r.t / r.dur, 1.35));   // makin cepat saat menukik
      const p = bez(r, r.k); r.x = p[0]; r.y = p[1]; r.z = p[2]; r.b = bez(r, Math.max(0, r.k - .045));
      F.emit('smoke', r.x + rand(-.4, .4), r.y + rand(-.4, .4), r.z, { vz: rand(.2, .9), life: rand(1.6, 2.6), s0: .7, s1: 3.4, col: [214, 212, 204], a: .55, drag: .4 });
      if (Math.random() < .6) F.emit('fire', r.x, r.y, r.z, { life: .18, s0: 1.1, s1: .3, col: [255, 190, 90], a: .9 });
      const ah = airNear(r.x, r.y, r.z, R.prox);
      if (ah) { airBoom(r.x, r.y, r.z, R.r * .8, R.dmg * 1.2, R.S * .8); A() && A().boom(r.x, r.y, R.S); F.rkts.splice(i, 1); continue; }   // sumbu jarak dekat: meledak di samping heli
      if (r.k >= 1) { rktHit(r.tx, r.ty); F.rkts.splice(i, 1); }
    }
  }
  function rktHit(x, y) {
    const R = F.RKT, S = R.S, gz = F.hAt(x, y), n = Q.fx.length;
    P.indirect = true; war.explode(x, y, R.r, R.dmg, 'he', P.unit); airBlast(x, y, gz + 3, R.r, R.dmg, P.unit); P.indirect = false;
    if (Q.fx.length > n) Q.fx[n]._s = 1;   // ledakan sim sudah digambar di sini
    boom3d(x, y, gz, S, true); A() && A().boom(x, y, S);
    F.emit('flash', x, y, gz + S * .3, { life: .4, s0: S * 1.1, s1: S * 2.2, col: [255, 240, 210] });
    for (let i = 0; i < 7; i++) F.emit('fire', x + rand(-1, 1) * S * .25, y + rand(-1, 1) * S * .25, gz + rand(.2, .7) * S, { vx: rand(-1, 1) * S * .4, vy: rand(-1, 1) * S * .4, vz: rand(4, 10), life: rand(.8, 1.4), s0: S * .7, s1: S * .25, col: [255, rand(150, 210) | 0, 90], a: .95, drag: 1.2 });
    for (let i = 0; i < 16; i++) { const a = rand(0, 6.283), v = rand(.6, 1.4) * S * 1.7; F.emit('spark', x, y, gz + 1, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(8, 20), life: rand(.5, 1.1), s0: .8, s1: .3, col: [255, 200, 110], g: 18 }); }
    for (let i = 0; i < 4; i++) F.emit('smoke', x + rand(-3, 3), y + rand(-3, 3), gz + rand(1, 4), { vz: rand(4, 9), life: rand(3, 5), s0: S * .5, s1: S * 1.6, col: [56, 52, 48], a: .7, drag: .6 });
    F.shock.push({ x, y, R: S * 2.6, t: 0, life: .6 });
    F.scorch.push({ x, y, r: S * rand(.45, .6), t: 0, life: 14 });
    const d = Math.hypot(x - P.x, y - P.y); if (d < 180) P.shake = Math.min(1.5, P.shake + (1 - d / 180) * 1.1);   // gelombang kejut terasa sampai operator
  }
  F.scorch = [];   // jejak bakar laser orbital { x, y, r, t, life }: bara menyala lalu hangus
  function laserTick(dt) {   // fase isi daya → sinar mengejar titik bidik (kecepatan terbatas) membakar musuh → SUPERNOVA
    for (let i = F.scorch.length - 1; i >= 0; i--) { const c = F.scorch[i]; c.t += dt; if (c.t > c.life) F.scorch.splice(i, 1); }
    for (let i = F.shock.length - 1; i >= 0; i--) { const c = F.shock[i]; c.t += dt; if (c.t > c.life) F.shock.splice(i, 1); }
    const L = P.laser, LS = F.LASER; if (!L) return;
    if (!P.alive) { P.laser = null; return; }
    if (L.ph === 'sat') {   // sinematik: satelit turun, panel terbuka, kamera masuk ke optiknya (klik = lewati)
      const C = LS.cin; L.st += dt;
      if (!L.aP && L.st >= C.dep0) { L.aP = 1; A() && A().local('satPanel', .85); }
      if (!L.aL && L.st >= C.t - .35) { L.aL = 1; A() && A().local('satLink', .9); }
      if (!F.in.fire) L.armed = true;
      if (L.st >= C.t || (L.armed && F.in.fire)) { L.ph = 'charge'; L.st = C.t; L.pov = P.time; F.in.fire = false; F.msg(Tt('f_laser_on'), 'g'); A() && A().local('laserCh', 1); }
      return;
    }
    L.alt += ((L.zm ? LS.alt * .5 : LS.alt) - L.alt) * Math.min(1, dt * (L.ph === 'charge' ? 1.5 : 4));   // roda: zoom halus
    const gz = F.hAt(L.x, L.y);
    if (L.ph === 'charge') {
      if (!L.sat) { const p = P.gs ? null : designate(); if (p) { L.cx = p.x; L.cy = p.y; } }
      L.x = L.cx; L.y = L.cy; L.ch -= dt;
      if (L.ch <= 0) { L.ph = 'fire'; P.shake = Math.max(P.shake, L.sat ? .5 : clamp(1 - Math.hypot(L.x - P.x, L.y - P.y) / 600, 0, .6)); A() && A().local('nova', .45); F.msg(Tt('f_laser_fire'), 'w'); puff(L.x, L.y, gz + .5, 18, [150, 120, 95], 8); sparks(L.x, L.y, gz + .5, 30); }
      return;
    }
    if (L.ph === 'nova') { L.nova -= dt; if (L.nova <= 0) { P.laser = null; if (P.gs && P.gs.mode === 'laser') P.gs = null; F.msg(Tt('f_laser_off'), 'i'); } return; }
    L.t -= dt; if (L.t <= 0) { laserNova(L); return; }
    L.foc += ((L.sat && F.in.fire ? 1 : 0) - L.foc) * Math.min(1, dt * 5);   // tahan klik kiri: sinar menyempit, lebih panas, lebih lambat
    if (F.opts.gsStab && L.sat && P.time - (L.dragT || -9) > .4) {   // layar sentuh: titik bidik menempel ke musuh terlihat terdekat saat jari diam (sasaran bergerak tetap tersorot)
      let best = null, bd = LS.assist;
      for (const u of Q.units) { if (u.team !== 'R' || u.dead || u.struct || !(u.seen.B || (u.tagT || 0) > P.time)) continue; const d = Math.hypot(u.x - L.cx, u.y - L.cy); if (d < bd) { bd = d; best = u; } }
      if (best) { const k = Math.min(1, dt * 2.5); L.cx += (best.x - L.cx) * k; L.cy += (best.y - L.cy) * k; }
    }
    const p = L.sat ? { x: L.cx, y: L.cy } : P.gs ? null : designate();
    if (p) { const dx = p.x - L.x, dy = p.y - L.y, d = Math.hypot(dx, dy), m = LS.spd * (1 - .45 * L.foc) * dt; if (d > m) { L.x += dx / d * m; L.y += dy / d * m; } else { L.x = p.x; L.y = p.y; } }
    const r = LS.r * (1 - .4 * L.foc), dps = LS.dps * (1 + .7 * L.foc);
    for (const u of Q.units) {
      if (u.team !== 'R' || u.dead || Math.abs(u.x - L.x) > r || Math.abs(u.y - L.y) > r || Math.hypot(u.x - L.x, u.y - L.y) > r) continue;
      const air = isAir(u);
      war.hurt(u, dps * dt * (u.type === 'HQ' ? LS.hqK : air ? LS.airK : 1), air ? 'ap' : 'bomb', P.unit);   // markas hanya tergores agar misi tidak selesai sekali sorot; pesawat di dalam kolom sinar ikut terbakar
      if (air && Math.random() < dt * 14) { const z = F.zOf(u); F.emit('fire', u.x + rand(-2, 2), u.y + rand(-2, 2), z, { vz: rand(1, 4), life: rand(.4, .8), s0: 1.6, s1: .4, col: [255, 170, 80], a: .9 }); sparks(u.x, u.y, z, 3); }
    }
    L.sc -= dt; if (L.sc <= 0) { L.sc = .1; F.scorch.push({ x: L.x + rand(-r, r) * .35, y: L.y + rand(-r, r) * .35, r: r * rand(.45, .75), t: 0, life: 10 }); if (F.scorch.length > 280) F.scorch.shift(); }
    L.ring -= dt; if (L.ring <= 0) { L.ring = .32; L.rings.push(0); } for (let i = L.rings.length - 1; i >= 0; i--) { L.rings[i] += dt; if (L.rings[i] > .9) L.rings.splice(i, 1); }
    L.fx -= dt; if (L.fx <= 0) {
      L.fx = .05; sparks(L.x + rand(-3, 3), L.y + rand(-3, 3), gz + .3, 9);
      F.emit('smoke', L.x + rand(-5, 5), L.y + rand(-5, 5), gz + .4, { vz: 9, life: 2.4, s0: 2, s1: 8, col: [255, 150, 70], a: .7 });
      F.emit('smoke', L.x + rand(-r, r) * .7, L.y + rand(-r, r) * .7, gz + 1, { vz: rand(5, 11), life: rand(3, 5), s0: 3, s1: 13, col: [46, 42, 38], a: .5, drag: .4 });   // tanah terbakar: kolom asap gelap
      F.emit('fire', L.x + rand(-r, r) * .5, L.y + rand(-r, r) * .5, gz + .3, { vz: rand(10, 22), vx: rand(-5, 5), vy: rand(-5, 5), life: rand(.5, 1), s0: 2.2, s1: .4, col: [255, 190, 100], a: .9 });
      F.emit('fire', L.x + rand(-r, r) * .5, L.y + rand(-r, r) * .5, gz + .3, { vz: rand(6, 14), vx: rand(-3, 3), vy: rand(-3, 3), life: rand(.5, 1.1), s0: 1.4, s1: .3, col: [255, 170, 80], a: .9 });
    }
    L.snd -= dt; if (L.snd <= 0) { L.snd = .45; if (L.sat) A() && A().local('laserHum', .8 + .4 * L.foc); else A() && A().at('thud', L.x, L.y, .55); }
  }
  function laserNova(L) {   // SUPERNOVA: sisa energi dilepas sekaligus di titik sinar (hanya melukai musuh)
    const N = F.LASER.nova, x = L.x, y = L.y, gz = F.hAt(x, y); L.ph = 'nova'; L.nova = N.t; L.rings = [];
    war.fx('boom', x, y, 1.6, N.r); Q.blast = true;
    for (const u of Q.units) { if (u.dead || u.team !== 'R') continue; const d = Math.hypot(u.x - x, u.y - y); if (d > N.r) continue; const air = isAir(u); war.hurt(u, N.dmg * (1 - .5 * d / N.r) * (u.type === 'HQ' ? F.LASER.hqK : air ? F.LASER.airK : 1), air ? 'ap' : 'bomb', P.unit); }
    Q.blast = false;
    boom3d(x, y, gz, 30, true); puff(x, y, gz + .5, 60, [150, 120, 100], 30); sparks(x, y, gz + 1, 110);
    F.shock.push({ x, y, R: N.r * 2.4, t: 0, life: 1.3, w: 2.2 });
    for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283, d = N.r * rand(.2, .8); F.scorch.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: rand(8, 15), t: 0, life: 16 }); }
    P.shake = Math.max(P.shake, L.sat ? 1 : clamp(1.4 - Math.hypot(x - P.x, y - P.y) / 600, 0, 1)); A() && A().local('nova', 1);
    F.msg(Tt('f_laser_nova', { n: P.kills - L.k0 }), 'g');
  }
  function predImpact(g) {
    const r = F.PRED.r, x = g.cx, y = g.cy;
    war.fx('boom', x, y, 1.1, r * .8 + 14); Q.blast = true;
    for (const u of Q.units) {
      if (u.dead) continue; const d = Math.hypot(u.x - x, u.y - y); if (d > r + 10) continue;
      war.hurt(u, F.PRED.dmg * (1 - .6 * Math.min(1, d / (r + 10))) * (u.type === 'HQ' ? .15 : 1), 'bomb', P.unit);
    }
    Q.blast = false;
    const gz = F.hAt(x, y); puff(x, y, gz + .5, 26, [120, 110, 95], 9); sparks(x, y, gz + 1, 30); A() && A().at('thud', x, y, 1);
    P.shake = Math.max(P.shake, clamp(1.2 - Math.hypot(x - P.x, y - P.y) / 500, 0, 1));
    F.msg(Tt('f_pred_hit'), 'g');
  }
  F.cancelTarget = function () { if (P.tgt && !P.tgt.free) { /* biaya baru dipotong saat konfirmasi */ } P.tgt = null; };
  F.callin = function (id) {
    const c = F.CALLINS.find(x => x.id === id); if (!c || !P.alive) return { ok: false, msg: 'f_ci_dead' };
    if (Q.over) return { ok: false, msg: 'w_e_over' };
    if (Q.cr < c.cost) return { ok: false, msg: 'w_e_cr' };
    if (['SQUAD', 'MEDIC', 'TANK', 'MEDEVAC', 'GUNSHIP'].includes(id) && war.popB() >= war.POP_CAP) return { ok: false, msg: 'w_e_pop' };
    const u = P.unit;
    if (id === 'MORTAR') { P.tgt = { id: 'MORTAR', cost: c.cost }; F.msg(Tt('f_tgt_hint'), 'w'); return { ok: true, close: true }; }
    if (id === 'FUEL') { const r = F.heliFuelDrop(); if (r !== true) return { ok: false, msg: r }; Q.cr -= c.cost; F.msg(Tt('f_ci_ok_FUEL'), 'g'); A() && A().local('ui', .8); return { ok: true }; }
    Q.cr -= c.cost;
    if (id === 'AMMO') { P.w.forEach(w => { const d = F.WEAPONS[w.id]; w.ammo = d.mag; w.res = d.res; }); P.gren = Math.max(P.gren, P.cls.gren + 1); u.hp = u.hpMax; F.msg(Tt('f_ammo_ok'), 'g'); A() && A().local('reload', .6); }
    else if (id === 'SQUAD' || id === 'MEDIC') {
      for (let i = 0; i < (id === 'SQUAD' ? 4 : 1); i++) {
        const a = rand(0, 6.28), s = war.mk('B', id === 'SQUAD' ? 'INF' : 'MEDIC', P.x + Math.cos(a) * 16, P.y + Math.sin(a) * 16, { chute: 4 });
        war.fx('chute', s.x, s.y, 4, 0, { u: s }); own(s, P.armyDef, myArmy().length, 4);
      }
      F.msg(Tt('f_ci_ok_' + id), 'g');
    } else {   // kendaraan dan heli langsung tiba di posisi operator, bukan di markas
      const ty = id === 'TANK' ? 'TANK' : id === 'MEDEVAC' ? 'MEDHELI' : 'ATK2', dest = ty === 'TANK' ? groundSpot(36, .5) : airSpot(ty === 'ATK2' ? 150 : 110), st = ty === 'TANK' ? behindSpot(0) : airIn(0);
      const [sx, sy] = st || dest, s = war.mk('B', ty, sx, sy, ty === 'TANK' ? { hdg: P.yaw, face: P.yaw } : { life: ty === 'ATK2' ? 95 : 110, hdg: P.yaw });
      own(s, ty === 'MEDHELI' ? 'follow' : P.armyDef, 0, 1); if (ty === 'MEDHELI') s.order.dist = 30;
      if (st) arrive(s, dest[0], dest[1]);   // tank menyetir masuk dari belakang, heli terbang masuk
      F.msg(Tt('f_ci_ok_' + id), 'g');
    }
    A() && A().local('ui', .8); return { ok: true };
  };
  /* ---------------- PASUKAN SAYA: rekrut semua jenis unit + perintah regu ---------------- */
  // P.squad = semua unit yang dipanggil operator (regu awal, bantuan B, rekrut T); u.cmdO = perintah terakhir
  F.ARMY = W.DEPLOY_ORDER.filter(t => UT[t] && !UT[t].enemyOnly);
  const catOf = t => { const T = UT[t]; return T.armor === 'inf' ? 'INF' : T.cat === 'A' ? 'AIR' : T.cat === 'S' ? 'SEA' : 'VEH'; };
  F.armyCat = catOf;
  const GRP = { ALL: () => true, INF: u => catOf(u.type) === 'INF', VEH: u => catOf(u.type) === 'VEH' || catOf(u.type) === 'SEA', AIR: u => catOf(u.type) === 'AIR' };
  F.ARMY_GRP = Object.keys(GRP);
  const myArmy = () => (P.squad = P.squad.filter(s => !s.dead));
  F.myArmy = (g) => myArmy().filter(GRP[g] || GRP.ALL);
  function orderUnit(u, ord, pt, i, n) {
    if (u.inV) return;   // penumpang: perintah berlaku setelah turun (TURUN KENDARAAN)
    u.cmdO = ord; u.path = []; u.arrv = null;
    const cat = catOf(u.type);
    if (u.jet) { const c = ord === 'goto' ? pt : P; u.order = { k: 'cap', x: c.x, y: c.y, r: 380 }; return; }
    if (ord === 'follow' && cat === 'SEA') ord = 'hold';   // kapal tidak bisa naik ke darat
    if (ord === 'follow') {
      if (!P.unit || P.unit.dead) { u.order = { k: 'idle' }; return; }   // menunggu operator lahir ulang
      u.stance = 'AGGR';
      u.order = { k: 'follow', tgt: P.unit, dist: cat === 'AIR' ? 120 + (i % 3) * 30 : cat === 'INF' ? 14 + (i % 8) * 4 : 40 + (i % 4) * 10, ang: rand(-1.6, 1.6) };
    } else if (ord === 'hold') { u.stance = 'HOLD'; u.order = { k: 'idle' }; }
    else if (ord === 'goto') {   // formasi melingkar di titik bidikan; maju sambil menembak lalu bertahan di sana
      const a = i * 2.4, r = n > 1 ? (cat === 'INF' ? 6 : 16) * Math.sqrt(i + .5) : 0, x = clamp(pt.x + Math.cos(a) * r, 20, W.WW - 20), y = clamp(pt.y + Math.sin(a) * r, 20, W.WH - 20);
      u.stance = 'HOLD'; u.order = { k: 'amove', x, y }; war.setPath(u, x, y);
    } else { u.stance = 'AGGR'; u.order = { k: 'idle' }; }   // serang bebas: buru musuh terlihat di sekitar
  }
  function own(u, ord, i, n) { u.mine = true; P.squad.push(u); orderUnit(u, ord || 'follow', P, i || 0, n || 1); }
  function seaSpot() {   // perairan terdekat yang boleh dipakai kapal kita
    for (let r = 0; r <= 1800; r += 60) for (let k = 0; k < (r ? 24 : 1); k++) {
      const a = k / 24 * 6.283, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r, c = war.deployCheck('GBOAT', x, y);
      if (c.ok && c.mode === 'sea') return [x, y];
    }
    return null;
  }
  F.recruit = function (type, n) {
    const T = UT[type]; if (!F.ARMY.includes(type) || !P.alive) return { ok: false, msg: 'f_ci_dead' };
    if (Q.over) return { ok: false, msg: 'w_e_over' };
    if (Q.cr < T.cost) return { ok: false, msg: 'w_e_cr' };
    if (war.popB() >= war.POP_CAP) return { ok: false, msg: 'w_e_pop' };
    n = Math.max(1, Math.min(n || 1, war.POP_CAP - war.popB(), Math.floor(Q.cr / T.cost)));
    const sea = T.cat === 'S' ? seaSpot() : null; if (T.cat === 'S' && !sea) return { ok: false, msg: 'f_ar_nosea' };
    const n0 = myArmy().length, kits = [];
    for (let i = 0; i < n; i++) {
      let u;
      let dest = null;
      if (sea) {   // kapal berlayar masuk dari perairan yang lebih jauh
        const a = i * 2.4, r = 30 * Math.sqrt(i); let x = sea[0] + Math.cos(a) * r, y = sea[1] + Math.sin(a) * r; if (!war.deployCheck(type, x, y).ok) { x = sea[0]; y = sea[1]; }
        const st = seaIn(type, [x, y]); u = war.mk('B', type, st ? st[0] : x, st ? st[1] : y); if (st) dest = [x, y];
      }
      else if (T.jet) u = war.mk('B', type, -60 - i * 90, clamp(P.y + rand(-180, 180), 100, W.WH - 100), { hdg: 0 });   // jet datang dari tepi barat
      else if (T.fly) { dest = airSpot(110 + i * 10); const [x, y] = airIn(i); u = war.mk('B', type, x, y, { hdg: Math.atan2(dest[1] - y, dest[0] - x) }); }   // heli terbang masuk
      else if (T.drop) {   // infanteri terjun payung melingkar di sekitar operator
        const a = i * 2.4 + rand(-.3, .3), r = 12 + 5 * Math.sqrt(i), [x, y] = freeSpot(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r);
        u = war.mk('B', type, x, y, { chute: 3.5 + rand(0, 1.5) }); war.fx('chute', x, y, u.chute, 0, { u });
      } else {
        const tg = groundSpot(34 + (i % 5) * 13, .35 + Math.floor(i / 5) * .4), st = behindSpot(i);   // kendaraan darat menyetir masuk dari belakang operator
        u = war.mk('B', type, st ? st[0] : tg[0], st ? st[1] : tg[1], { hdg: P.yaw, face: P.yaw }); if (st) dest = tg;
      }
      own(u, P.armyDef, n0 + i, n); if (dest) arrive(u, dest[0], dest[1]); if (u.kit) kits.push(u.kit);
    }
    Q.cr -= n * T.cost; Q.stats.dep += n;
    A() && A().local('ui', .8);
    return { ok: true, n, kits };
  };
  /* ---------------- NAIK / TURUN KENDARAAN ----------------
     infanteri & Kopassus milik operator menumpang kendaraan operator (Humvee 4, tank 3, panser SANCA 8, VTOL 2 kursi, termasuk kursi
     pengemudi yang selalu milik operator). Sasaran = kendaraan yang sedang dikemudikan, atau kendaraan operator terdekat <= F.BOARD.r m.
     Yang tidak kebagian kursi tetap pada perintah lamanya. Operator turun = penumpang ikut turun (F.paxOut). */
  const vname = v => Tt('f_vh_' + v.type), seatStr = v => ((v.pax ? v.pax.length : 0) + (P.veh && P.veh.u === v ? 1 : 0)) + '/' + (v.seats || 1);
  F.seatStr = seatStr;
  function boardTarget() {
    if (P.veh && P.veh.u && !P.veh.u.dead) return P.veh.u;
    let best = null, bd = F.BOARD.r;
    for (const V of F.vehs || []) { const v = V.u; if (!v || v.dead || V.st === 'in' || !v.seats) continue; const d = Math.hypot(v.x - P.x, v.y - P.y); if (d < bd) { bd = d; best = v; } }
    return best;
  }
  function boardCmd(us) {
    const v = boardTarget(); if (!v) return { ok: false, msg: 'f_bd_nov', v: { r: F.BOARD.r } };
    const inf = us.filter(u => catOf(u.type) === 'INF' && !u.inV && !(u.chute > 0)); if (!inf.length) return { ok: false, msg: us.some(u => u.inV) ? 'f_bd_already' : 'f_bd_noinf' };
    const going = P.squad.filter(u => !u.dead && u.order && u.order.k === 'board' && u.order.v === v && !inf.includes(u)).length, free = war.seatsFree(v) - going;
    if (free <= 0) return { ok: false, msg: 'f_bd_full', v: { u: vname(v), s: seatStr(v) } };
    inf.sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y));
    const take = inf.slice(0, free);
    take.forEach(u => { u.cmdO = 'board'; u.arrv = null; u.stance = 'AGGR'; u.srch = null; u.order = { k: 'board', v }; u.path = []; });
    return { ok: true, n: take.length, v: { u: vname(v), s: (v.pax ? v.pax.length : 0) + take.length + (P.veh && P.veh.u === v ? 1 : 0) + '/' + v.seats, x: inf.length - take.length } };
  }
  F.paxOut = function (v, us) {   // turunkan penumpang (semua, atau hanya us) lalu ikuti operator
    const out = (v.pax || []).filter(u => !us || us.includes(u)); out.forEach((u, i) => { war.unboard(u); orderUnit(u, 'follow', P, i, out.length); });
    return out.length;
  };
  function unboardCmd(us) {
    const vs = new Set(us.filter(u => u.inV).map(u => u.inV)); let n = 0;
    vs.forEach(v => { n += F.paxOut(v, us); });
    return n ? { ok: true, n } : { ok: false, msg: 'f_bd_none' };
  }
  war.hooks.board = function (u, v) {
    if (!u.mine) return;
    if (!v) { orderUnit(u, 'follow', P, 0, 1); return; }   // kendaraan penuh / hancur sebelum sempat naik
    u.cmdO = 'ride';
    if ((P.bdMsgT || 0) < P.time || war.seatsFree(v) <= 0) { P.bdMsgT = P.time + .6; F.msg(Tt('f_bd_in', { u: vname(v), s: seatStr(v) }), 'g'); A() && A().local('ui', .5); }
  };
  F.command = function (grp, ord) {
    if (!P.alive) return { ok: false, msg: 'f_ci_dead' };
    const us = F.myArmy(grp); if (!us.length) return { ok: false, msg: 'f_cmd_none' };
    if (ord === 'board' || ord === 'unboard') {
      const r = ord === 'board' ? boardCmd(us) : unboardCmd(us);
      if (r.ok && r.v && r.v.x > 0) P.bdOver = r.v.x;   // ditampilkan setelah pesan perintah (lihat F.msgOver)
      A() && A().local('ui', .7); return r;
    }
    let pt = null;
    if (ord === 'goto') { pt = designate(); if (!pt) return { ok: false, msg: 'f_tgt_none' }; F.marks.push({ x: pt.x, y: pt.y, t: 0, life: 10, cmd: true }); }
    us.forEach((u, i) => orderUnit(u, ord, pt, i, us.length));
    A() && A().local('ui', .7);
    return { ok: true, n: us.length };
  };
  F.dismiss = function (grp) {   // lepaskan ke komando warzone/NEXUS
    const us = F.myArmy(grp); us.forEach(u => { u.mine = false; u.cmdO = null; u.stance = 'AGGR'; u.order = { k: 'idle' }; u.path = []; });
    P.squad = P.squad.filter(u => u.mine); return us.length;
  };

  function streakTick(dt) {
    for (const u of P.squad) if (u.jet && u.cmdO === 'follow' && u.order.k === 'cap' && P.alive) { u.order.x = P.x; u.order.y = P.y; }   // jet "ikuti": orbit di atas operator
    if (P.uavT > 0) { P.uavT -= dt; if (P.uavUnit && !P.uavUnit.dead && Math.random() < dt * .4) { P.uavUnit.order = { k: 'move', x: P.x, y: P.y }; P.uavUnit.path = [{ x: P.x, y: P.y }]; } if (P.uavT <= 0) { F.msg(Tt('f_uav_off'), 'i'); P.drone = null; if (P.gs && P.gs.mode === 'uav') P.gs = null; } }
    // objektif
    Q.objs.forEach((o, i) => {
      if (P.objOwn[i] !== o.owner) {
        if (o.owner === 'B' && P.alive && Math.hypot(o.x - P.x, o.y - P.y) < 420) pop(Tt('f_obj_cap', { o: o.name }), 250);
        P.objOwn[i] = o.owner;
      }
    });
  }

  /* ---------------- SINKRON KEJADIAN SIM → 3D (suara, kilatan, ledakan) ---------------- */
  let scanT = 0;
  F.viewD = (x, y) => { const d = Math.hypot(x - P.x, y - P.y); return P.gs && P.cam ? Math.min(d, Math.hypot(x - P.cam.x, y - P.cam.y)) : d; };   // jarak ke tubuh atau kamera udara, mana yang lebih dekat
  function scanSim(dt) {
    for (const f of Q.fx) {
      if (f._s) continue; f._s = 1;
      if (f.k === 'nuke') { nuke3d(f.x, f.y, f.r); continue; }
      if (f.k !== 'boom' || F.viewD(f.x, f.y) > 2200) continue;   // jarak dari tubuh ATAU kamera udara: orbit jauh dari operator tetap melihat ledakan & kematian unit
      const gz = F.hAt(f.x, f.y);
      if (f.dead) {   // kematian unit: prajurit hanya debu; kendaraan/pesawat/bangunan meledak
        const T = UT[f.dead]; if ((T.boss && F.bossDie) || (F.dieMark && F.dieMark.delete(f.x + '|' + f.y))) continue;   // bos & kendaraan/pesawat/kapal dekat: efek dimainkan fps-bossdie
        if (HUMAN[f.dead]) { sparks(f.x, f.y, gz + 1, 3); puff(f.x, f.y, gz + .3, 3, [140, 126, 100], 1.2); A() && A().at('thud', f.x, f.y, .5); }
        else boom3d(f.x, f.y, gz + (f.alt !== undefined ? f.alt : T.jet ? 150 : T.fly ? 38 : 0), clamp(f.r * .42, 4, 20));
      } else boom3d(f.x, f.y, gz, clamp(f.r * .42, 3, 20));
    }
    for (const p of Q.projs) {
      if (p._s || p.t < 0) continue; p._s = 1; const s = p.src; if (!s || s.player) continue;
      const d = Math.hypot(s.x - P.x, s.y - P.y); if (F.viewD(s.x, s.y) > 1800) continue;
      if (s.team === 'R' && P.alive) {   // peringatan: asal tembakan, roket, dan serangan tidak langsung ke arah operator
        if (p.tgt === P.unit && d > 35 && (p.kind === 'bullet' || p.kind === 'missile')) F.contacts.set(s.id, { u: s, t: P.time });
        if (p.kind === 'missile' && p.tgt === P.unit && P.time - P.shellWarn > 3) { P.shellWarn = P.time; F.msg(Tt('f_missile'), 'c'); A() && A().local('warn', .9); }
        else if ((p.kind === 'shell' || p.kind === 'bomb') && Math.hypot(p.tx - P.x, p.ty - P.y) < 130 && P.time - P.shellWarn > 4) { P.shellWarn = P.time; F.msg(Tt('f_incoming'), 'c'); A() && A().local('warn', .9); }
      }
      const k = p.kind === 'missile' ? 'rocket' : p.kind === 'shell' ? 'arty' : p.kind === 'bomb' ? 'bomb' : p.big ? 'cannon' : s.team === 'B' ? 'm4' : 'rifleE';
      A() && A().at(k, s.x, s.y, 1);
      if (p.kind === 'bullet' && d < 900) { const hb = F.hitbox(s), z = hb.z0 + (hb.human ? 1.45 : hb.h * .8), a = Math.atan2(p.ty - s.y, p.tx - s.x); F.emit('flash', s.x + Math.cos(a) * 1.2, s.y + Math.sin(a) * 1.2, z, { life: .06, s0: .5, s1: .7, col: [255, 220, 130] }); }
      if (p.tgt === P.unit && P.alive) A() && A().whiz(s.x, s.y);
    }
    scanT -= dt;
    if (scanT <= 0) {   // asap bangkai
      scanT = .35;
      for (const f of Q.fx) if (f.k === 'wreck' && f.t < 6 && F.viewD(f.x, f.y) < 700) F.emit('smoke', f.x + rand(-2, 2), f.y + rand(-2, 2), F.hAt(f.x, f.y) + 1, { vz: rand(2, 4), vx: 1.2, life: rand(3, 5), s0: .9, s1: 3.2, col: [40, 40, 40], a: .6 });
      const V = F.world && F.world.volc;   // kepulan abu & pijar dari kawah gunung berapi
      if (V && Math.hypot(V.x - P.x, V.y - P.y) < 6000) {
        F.emit('smoke', V.x + rand(-15, 15), V.y + rand(-15, 15), V.top - 8, { vz: rand(9, 15), vx: rand(1, 3), vy: rand(-1, 1), life: rand(14, 20), s0: 12, s1: 55, col: [66, 62, 58], a: .75, drag: .03, far: 1 });
        if (Math.random() < .5) F.emit('fire', V.x + rand(-20, 20), V.y + rand(-20, 20), V.top - 14, { vz: rand(4, 10), life: rand(1, 2), s0: 6, s1: 2, col: [255, 130, 40], a: .8 });
      }
      for (const c of F.corpses) if (!c.human && c.t < 40 && F.viewD(c.x, c.y) < 900) F.emit('smoke', c.x + rand(-1, 1), c.y + rand(-1, 1), F.hAt(c.x, c.y) + 1.5, { vz: rand(2, 4), vx: 1, life: rand(2.5, 4), s0: .7, s1: 2.5, col: [34, 34, 34], a: .6 });
    }
  }

  /* ---------------- UPDATE PEMAIN ---------------- */
  const SWIM = 1.45;   // kedalaman air (m) mulai berenang; juga jarak telapak kaki di bawah permukaan saat mengapung
  function splash(k) {   // cipratan air di sekitar pemain
    const n = Math.round(4 + k * 14);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = .3 + Math.random() * .7; F.emit('dust', P.x + Math.cos(P.yaw) * .6 + Math.cos(a) * r, P.y + Math.sin(P.yaw) * .6 + Math.sin(a) * r, F.WZ + .05, { vz: rand(1, 3) * (.5 + k), vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, life: rand(.35, .7), s0: .12 + k * .15, s1: .4 + k * .5, col: [214, 228, 232], a: .5, g: 7, drag: 1 }); }
    if (k > .5) A() && A().local('splash', k);
  }
  const BRX = [.35, -.35, 0, 0, .25, .25, -.25, -.25], BRY = [0, 0, .35, -.35, .25, -.25, .25, -.25];
  function blocked(nx, ny) {
    if (nx < 6 || ny < 6 || nx > W.WW - 6 || ny > W.WH - 6) return true;
    const zr = P.swim ? Math.max(P.z, F.WZ - .2) : P.z;   // perenang bisa naik ke tepi yang landai
    if (F.floorAt(nx, ny) - zr > .95 && P.chute === 0) return true;
    // dinding gedung: badan (jari-jari 0,35 m) tidak boleh masuk tapak gedung yang atapnya lebih tinggi dari langkah — tidak bisa "memanjat" atau
    // menembus, juga saat berparasut. Hanya titik badan yang BARU masuk dinding yang menahan, jadi yang sudah menempel tetap bisa bergeser sejajar / menjauh
    const wall = (x, y) => { const b = F.bTop(x, y); return b !== null && b - zr > .95; };
    if (wall(nx, ny)) return true;
    for (let k = 0; k < 8; k++) if (wall(nx + BRX[k], ny + BRY[k]) && !wall(P.x + BRX[k], P.y + BRY[k])) return true;
    if (F.kitBlock && F.kitBlock(nx, ny)) return true;   // meja senjata markas
    const tr = treeNear(nx, ny, .6); if (!tr) return false;
    const w = F.world, k = tr[2]; if (zr > w.trees[k * 6 + 2] + w.trees[k * 6 + 3] - .3) return false;   // melayang / melompat di atas mobil, pagar, semak: tidak tertahan
    const t0 = treeNear(P.x, P.y, .6); return !(t0 && t0[2] === k && tr[0] * tr[0] + tr[1] * tr[1] >= t0[0] * t0[0] + t0[1] * t0[1]);   // yang sudah menempel boleh menjauh
  }
  function move(dt) {
    const I = F.in, d = F.wdefSafe();
    let mx = (+I.r || 0) - (+I.l || 0), my = (+I.f || 0) - (+I.b || 0);   // analog: joystick sentuh 0..1, keyboard 0/1
    if (P.landA) { P.landA.t += dt; if (P.landA.t > F.LANDP.t || P.chute || P.swim) P.landA = null; else mx = my = 0; }   // baru mendarat: berlutut → berdiri → senjata diangkat, baru bisa bergerak
    const chute = P.chute > 0;
    // air: dangkal = mengarungi (lambat), dalam (> SWIM m) = berenang, kepala di atas permukaan, senjata disimpan
    const dep = F.depth(P.x, P.y), deep = !chute && dep > SWIM && (P.grounded || P.swim || P.z <= F.WZ - SWIM + .3);
    if (deep && !P.swim) { P.swim = true; P.ads = 0; P.relT = 0; P.crouch = false; splash(clamp(-P.vz / 8, .35, 1)); }
    else if (!deep && P.swim) P.swim = false;
    if (dep > .8) P.crouch = false;
    P.sprint = !chute && !P.swim && !P.down && !P.tired && I.sprint && my > 0 && P.ads < .3 && !P.crouch && P.grounded && P.gT <= 0 && P.melT <= 0 && !(I.fire && P.w[P.cur].ammo > 0);
    stamina(dt);
    let speed = chute ? (P.chute === 1 ? 22 : 14) : P.swim ? (I.sprint && my > 0 ? 4.4 : 3.2) * (P.ab.adr > 0 ? 1.15 : 1) : P.down ? 1.1
      : 8.2 * (P.sprint ? 1.52 * (perk('MARATHON') ? F.PERK.mara.spd : 1) : 1) * (P.crouch ? .5 : 1) * (1 - P.ads * .42) * d.mv * (P.ab.adr > 0 ? 1.22 : 1) * (dep > 0 ? clamp(1 - dep * .4, .5, 1) : 1);
    const l = Math.max(1, Math.hypot(mx, my)); mx /= l; my /= l;   // diagonal keyboard dinormalkan, dorongan joystick kecil = jalan pelan
    const fx = Math.cos(P.yaw), fy = Math.sin(P.yaw), rx = -fy, ry = fx;
    const tvx = (fx * my + rx * mx) * speed, tvy = (fy * my + ry * mx) * speed, k = Math.min(1, dt * (chute ? 1.2 : P.swim ? 3 : P.grounded ? 11 : 1.8));   // berenang: meluncur, tidak langsung berhenti
    P.vx += (tvx - P.vx) * k; P.vy += (tvy - P.vy) * k;
    const nx = P.x + P.vx * dt, ny = P.y + P.vy * dt;
    if (!blocked(nx, ny)) { P.x = nx; P.y = ny; } else if (!blocked(nx, P.y)) { P.x = nx; P.vy = 0; } else if (!blocked(P.x, ny)) { P.y = ny; P.vx = 0; } else { P.vx = P.vy = 0; }
    P.spd = Math.hypot(P.vx, P.vy);
    // vertikal
    const gh = F.floorAt(P.x, P.y);   // atap rata / tanah — bukan interpolasi tinggi gedung
    if (chute) {
      const above = P.z - gh;
      if (P.chute === 1 && above < 150) { P.chute = 2; A() && A().local('chute', .8); P.shake = Math.min(1.5, P.shake + .5); }   // sentakan saat kanopi menangkap angin
      P.vz += ((P.chute === 1 ? -50 : -9) - P.vz) * Math.min(1, dt * 2.5); P.z += P.vz * dt;
      const fl = dep > SWIM ? F.WZ - SWIM : gh;   // mendarat di laut = langsung mengapung
      if (P.z <= fl) { P.z = fl; if (P.chute === 2) chuteDrop(); if (fl > gh) { P.swim = true; splash(.8); } else P.landA = { t: 0 }; P.vz = 0; P.chute = 0; P.unit.chute = 0; P.grounded = true; A() && A().local('land', .6); if (!P.bail) giveSquad(); P.bail = false; F.msg(Tt('f_landed'), 'g'); }
    } else if (P.swim) {   // mengapung: badan di bawah permukaan, mata ±20 cm di atas air, naik-turun pelan
      P.z += (F.WZ - SWIM + Math.sin(P.time * 1.7) * .05 - P.z) * Math.min(1, dt * 4); P.vz = 0; P.grounded = true;
      const s0 = P.strk || 0; P.strk = s0 + dt * (P.spd > .6 ? .75 + P.spd * .12 : .3);   // fase kayuhan gaya dada (putaran/detik)
      if (P.spd > .6 && Math.floor(P.strk) !== Math.floor(s0)) { A() && A().local('swim', .5); splash(.3); }
    } else if (P.grounded) {
      if (I.jump && !P.down) { P.vz = 6.4; P.grounded = false; P.crouch = false; A() && A().local('jump', .4); }
      else if (P.z - gh > .7) { P.grounded = false; P.vz = 0; }
      else P.z += (gh - P.z) * Math.min(1, dt * 20);
    } else {
      P.vz -= 21 * dt; P.z += P.vz * dt;
      if (P.z <= gh) {
        if (P.vz < -5) A() && A().local('land', clamp(-P.vz / 14, .2, 1));
        if (P.vz < -17 && dep < .8) { P.unit.hp -= (-P.vz - 17) * 7; P.lastHurt = P.time; P.shake += .5; if (P.unit.hp <= 0) die(null); }   // jatuh ke air yang cukup dalam tidak melukai
        P.z = gh; P.vz = 0; P.grounded = true;
      }
    }
    const LA = P.landA, lt = LA ? LA.t : 0, LP = F.LANDP, landEye = LA ? (lt < LP.dip ? 1.7 - (1.7 - LP.eye) * ss(lt / LP.dip) : lt < LP.up ? LP.eye : LP.eye + (1.7 - LP.eye) * ss((lt - LP.up) / LP.rise)) : 0;
    P.eye += ((P.down ? .45 : LA ? landEye : P.crouch ? 1.12 : 1.7) - P.eye) * Math.min(1, dt * (P.down ? 5 : LA ? 16 : 10));   // LAST STAND: tergeletak di tanah
    if (P.grounded && F.lava(P.x, P.y) && P.chute === 0) {   // lahar membakar
      P.unit.hp -= 55 * dt; P.lastHurt = P.time; P.shake = Math.min(1, P.shake + dt);
      if (Math.random() < dt * 12) F.emit('fire', P.x + rand(-.6, .6), P.y + rand(-.6, .6), P.z + .2, { vz: rand(1, 3), life: .5, s0: .5, s1: .2, col: [255, 140, 40], a: .8 });
      if ((P._lavaMsg || 0) < P.time - 3) { P._lavaMsg = P.time; F.msg(Tt('f_lava'), 'c'); A() && A().local('hurt', .7); }
      if (P.unit.hp <= 0) die(null);
    }
    // langkah kaki
    if (P.grounded && !P.swim && P.spd > 1.2) {
      P.bob += dt * P.spd * (P.sprint ? .95 : 1.05); P.stepD += P.spd * dt;
      const stride = P.sprint ? 3.5 : P.crouch ? 2 : 2.8;
      if (P.stepD > stride) { P.stepD = 0; if (dep > .05) { A() && A().local('wade', .45); splash(.15 + dep * .2); } else A() && A().local('step', P.crouch ? .18 : P.sprint ? .55 : .35); }
    } else P.stepD = 0;
    const u = P.unit; u.x = P.x; u.y = P.y; u.hdg = P.yaw; u.face = P.yaw; u.stealth = P.crouch ? .6 : P.sprint ? 1.25 : 1;
  }
  /* stamina lari: habis setelah F.PERK.stam.t dtk lari penuh, pulih setelah jeda; habis total = harus pulih sampai min dulu.
     MARATHON: lari jauh lebih lama, pulih lebih cepat (dan lari sedikit lebih kencang, lihat move) */
  function stamina(dt) {
    const S = F.PERK.stam, M = perk('MARATHON') ? F.PERK.mara : null;
    if (P.sprint) { P.stam = Math.max(0, P.stam - dt / (S.t * (M ? M.t : 1))); P.stamT = 0; if (P.stam <= 0) { P.tired = true; P.sprint = false; } }
    else { P.stamT += dt; if (P.stamT > S.wait * (M ? .5 : 1)) P.stam = Math.min(1, P.stam + dt / (S.rec * (M ? M.rec : 1))); }
    if (P.tired && P.stam >= S.min) P.tired = false;
  }
  function weapons(dt) {
    const I = F.in, w = P.w[P.cur], d = F.WEAPONS[w.id];
    P.fireCd -= dt; P.swT -= dt; if (P.melHS > 0) P.melHS -= dt; else P.melT -= dt; P.cycT -= dt;
    if (P.landA) P.swT = Math.max(P.swT, P.landA.t < F.LANDP.draw ? .42 : 0);   // berlutut: senjata masih tersandang, diangkat setelah berdiri
    if (P.melQ > 0 && (P.melQ -= dt) <= 0 && P.alive && P.melC) meleeHit(P.melC.r, P.melC.dmg, P.melC.cone, P.melC.n, !P.melB);   // bilah pisau / ujung bayonet sampai
    if (P.eq) { if (P.swim || P.chute || (P.eq === 'bay' && !d.bay)) eqSet(null); else eqTick(dt, I); }
    P.bloom = Math.max(0, P.bloom - dt * (P.ads > .5 ? 1.1 : .8)); P.vk = Math.max(0, P.vk - dt * 7);
    if (P.relT > 0) {
      P.relT -= dt;
      if (d.shl) {   // shotgun: tiap peluru langsung masuk hitungan saat didorong; tembak = batalkan sisa pengisian (seperti MW)
        const pl = F.sgPlan(d, P.relE, P.relN), s = (P.relD - P.relT) / P.relK;
        const want = P.relC ? P.relL : P.relT <= 0 ? P.relN : Math.min(P.relN, (P.relE && s >= pl.port * .62 ? 1 : 0) + clamp(Math.floor((s - pl.I) / pl.per + .45), 0, pl.m));
        while (P.relL < want && w.res > 0 && w.ammo < d.mag) { w.ammo++; w.res--; P.relL++; }
        if (!P.relC && P.relT > 0 && w.ammo > 0 && (I.fire || I.press > 0) && s > pl.I * .6 && s < pl.end) { P.relC = true; P.relT = Math.min(P.relT, pl.out * .6 * P.relK); }
      } else if (P.relT <= 0) { const take = Math.min(d.mag - w.ammo, w.res); w.ammo += take; w.res -= take; w.dm = d.dual && P.relDu ? 1 : 0; }   // w.dm: magasin sebelah sedang terpasang
      if (P.relT <= 0) A() && A().local('reload2', .6);
    }
    if (P.autoRel > 0) { P.autoRel -= dt; if (P.autoRel <= 0) F.reload(); }
    // ADS
    const wantAds = I.ads && P.alive && !P.sprint && !P.swim && P.relT <= 0 && P.swT <= 0 && !P.chute && !P.eq && !P.abA;
    P.ads += ((wantAds ? 1 : 0) - P.ads) * Math.min(1, dt * d.ads);
    if (P.ads < .01) P.ads = 0;
    // recoil pulih
    const rk = Math.min(1, dt * 9); P.rkP -= P.rkP * rk; P.rkY -= P.rkY * rk;
    // tembak
    const can = P.fireCd <= 0 && P.relT <= 0 && P.swT <= 0 && !P.sprint && !P.swim && !P.eq && !P.abA && P.melT <= 0 && P.cycT <= 0 && !P.chute && !P.tgt;
    const want = d.mode === 'auto' ? I.fire : (I.press > 0);
    if (d.mode !== 'burst' || P.relT > 0 || P.swT > 0 || w.ammo <= 0) P.brN = 0;
    if (P.brN > 0 && can) { shoot(); if (--P.brN === 0) P.fireCd = d.bcd; }   // sisa peluru burst (Beretta 93R)
    else if (want && can) {
      if (w.ammo > 0) { shoot(); I.press = 0; if (d.mode === 'burst') { P.brN = d.burst - 1; if (!P.brN) P.fireCd = d.bcd; } }
      else { if (I.press > 0 || !P._clicked) { A() && A().local('empty', .5); P._clicked = true; } I.press = 0; F.reload(); }
    } else if (!I.fire) P._clicked = false;
    if (I.press > 0) I.press -= dt; if (I.press < 0) I.press = 0;
  }

  /* ---------------- KAMERA UDARA: DRONE UAV · AC-130 · RUDAL PREDATOR ----------------
     P.gs.mode: 'uav' = drone kamera bebas · (kosong) = AC-130 mengorbit, pandangan termal ·
     'pick' = memilih titik di peta (g.pk: PRED / GUNSHIP / LASER) · 'pred' = kamera hulu ledak yang meluncur · 'laser' = satelit HELIOS */
  const inWorld = (x, y) => x >= 0 && y >= 0 && x < W.WW && y < W.WH;
  function airRay(o, v, maxT) {   // sinar kamera udara → titik medan { x, y, z, d }; boleh berawal di luar peta (orbit AC-130 di tepi)
    const hz = (x, y) => inWorld(x, y) ? Math.max(F.hAt(x, y), F.WZ) : F.WZ;   // air: berhenti di permukaan (dulu tembus ke dasar, ledakan tak terlihat)
    let t = 0, prev = 0, step = 2;
    while (t < maxT) {
      t += step; step = Math.min(8, step + .06);
      if (o[2] + v[2] * t < hz(o[0] + v[0] * t, o[1] + v[1] * t)) {
        let a = prev, b = t; for (let i = 0; i < 9; i++) { const m = (a + b) / 2; if (o[2] + v[2] * m < hz(o[0] + v[0] * m, o[1] + v[1] * m)) b = m; else a = m; }
        return { x: o[0] + v[0] * b, y: o[1] + v[1] * b, z: o[2] + v[2] * b, d: b };
      }
      prev = t;
    }
    return null;
  }
  F.airRay = airRay;
  function acCam(g) {   // AC-130 di lingkaran orbit; kamera menghadap pusat orbit + simpangan bidik mouse, jadi pandangan ikut berputar
    const AC = F.AC130, gz = F.hAt(g.ox, g.oy), x = g.ox + Math.cos(g.ang) * AC.R, y = g.oy + Math.sin(g.ang) * AC.R, z = gz + AC.alt;
    const yaw = Math.atan2(g.oy - y, g.ox - x) + g.ay, pitch = clamp(Math.atan2(gz - z, AC.R) + g.ap + g.kick * .012, -1.5, -.08);
    return { x, y, z, yaw, pitch, fov: AC.fov[g.w] / (g.zm ? 2 : 1) * D2R, air: g.aim ? [g.aim.x, g.aim.y] : [g.ox, g.oy], therm: 1 };
  }
  /* sinematik HELIOS: satelit jatuh di sepanjang sumbu optik menuju posisi POV (ekor roket pengereman melawan arah jatuh), panel terbuka;
     kamera mula-mula di bawah-samping menengadah, lalu memutar ke belakang satelit dan masuk ke optiknya. Akhir gerak tepat sama dengan kamera POV, jadi tidak ada lompatan */
  const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  F.satPose = function (L) {
    const LS = F.LASER, C = LS.cin, A0 = LS.alt, gz = F.hAt(L.cx, L.cy), st = L.st, ca = Math.cos(1.2), sa = Math.sin(1.2), a = [0, -ca, -sa], Sf = [L.cx, L.cy + A0 * .39, gz + A0];
    const k = clamp(st / C.fall, 0, 1), q = 1 - k, h = C.h0 * q * q * q, S = [Sf[0] - a[0] * h, Sf[1] - a[1] * h, Sf[2] - a[2] * h];
    const arc = smooth(C.arc0, C.arc1, st), push = smooth(C.arc1, C.t, st), th = 2.25 + (.3 - 2.25) * arc, r = (84 - 42 * arc) * (1 - push), cth = Math.cos(th), sth = Math.sin(th);
    const yL = [0, sa, -ca], R1 = [.92, yL[1] * .39, yL[2] * .39];   // arah samping kamera: tegak lurus sumbu optik
    const x = Sf[0] + r * (-a[0] * cth + R1[0] * sth), y = Sf[1] + r * (-a[1] * cth + R1[1] * sth), z = Sf[2] + r * (-a[2] * cth + R1[2] * sth);
    const lx = S[0] + (L.cx - S[0]) * push, ly = S[1] + (L.cy - S[1]) * push, lz = S[2] + (gz - S[2]) * push, dx = lx - x, dy = ly - y, dz = lz - z;
    let fov = 24 + 28 * smooth(.2, .9, k); fov += (42 - fov) * push;
    return { S, a, xL: [1, 0, 0], yL, zL: [-a[0], -a[1], -a[2]], burn: q * q, dep: smooth(C.dep0, C.dep0 + C.depT, st), roll: q * q * 1.8, alt: S[2] - gz,
      cam: { x, y, z, yaw: Math.atan2(dy, dx), pitch: Math.atan2(dz, Math.hypot(dx, dy)), fov: fov * D2R, air: [L.cx, L.cy], therm: 0, fogD: 5200 } };
  };
  F.gsCam = function () {
    const g = P.gs;
    if (g.mode === 'uav') { const D = P.drone; return { x: D.x, y: D.y, z: D.z, yaw: D.yaw, pitch: D.pitch, fov: (D.zm ? 26 : 70) * D2R, air: [D.x + Math.cos(D.yaw) * 150, D.y + Math.sin(D.yaw) * 150], therm: D.th }; }
    if (g.mode === 'laser' && P.laser.ph === 'sat') return F.satPose(P.laser).cam;
    if (g.mode === 'laser') { const L = P.laser, k = L.ph === 'nova' ? L.nova / F.LASER.nova.t : L.ph === 'charge' ? .15 : .04 * L.foc, j = () => (Math.random() - .5) * .012 * k;   // satelit: utara di atas, miring ±69° agar sinar tampak turun dari langit
      return { x: L.cx, y: L.cy + L.alt * .39, z: F.hAt(L.cx, L.cy) + L.alt, yaw: -Math.PI / 2 + j(), pitch: -1.2 + j(), fov: 42 * D2R, air: [L.cx, L.cy], therm: 0, fogD: 5200 }; }
    if (g.mode === 'pred') { const d = g.dir; return { x: g.mx, y: g.my, z: g.mz, yaw: Math.atan2(d[1], d[0]), pitch: Math.asin(clamp(d[2], -1, 1)), fov: 52 * D2R, air: g.aim ? [g.aim.x, g.aim.y] : [g.tx, g.ty], therm: 1 }; }
    return acCam(g);
  };
  F.gsAim = function () { const g = P.gs; return !g ? null : g.mode === 'pick' ? { x: g.cx, y: g.cy } : g.mode === 'laser' ? { x: P.laser.cx, y: P.laser.cy } : g.mode === 'uav' ? P.drone.aim : g.aim; };
  F.gsTop = function () {   // cadangan tanpa WebGL: pandangan atas datar di sekitar titik bidik
    const g = P.gs, a = F.gsAim() || { x: P.x, y: P.y };
    return { cx: a.x, cy: a.y, w2: g.mode === 'pred' ? clamp(80 + (g.mz - F.hAt(g.mx, g.my)) * .56, 80, 620) : g.mode === 'uav' ? 400 : 260 * (1 + g.w * .6) / (g.zm ? 2 : 1) };
  };
  F.gsPan = function (dx, dy) {
    const g = P.gs; if (!g) return; const sens = P.sens || 1;
    if (g.mode === 'uav') { const D = P.drone, k = .0022 * sens * (D.zm ? .4 : 1); D.yaw = wrapPi(D.yaw + dx * k); D.pitch = clamp(D.pitch - dy * k * (P.inv ? -1 : 1), -1.52, .6); return; }
    if (g.mode === 'laser') {   // geser titik bidik satelit (utara = atas layar), dibatasi jangkauan dari operator
      if (P.laser.ph === 'sat') return;
      const L = P.laser, k = L.alt * .0013 * sens, lim = F.LASER.range; L.cx = clamp(L.cx + dx * k, 10, W.WW - 10); L.cy = clamp(L.cy + dy * k, 10, W.WH - 10); L.dragT = P.time;
      const d = Math.hypot(L.cx - P.x, L.cy - P.y); if (d > lim) { L.cx = P.x + (L.cx - P.x) * lim / d; L.cy = P.y + (L.cy - P.y) * lim / d; }
      return;
    }
    if (g.mode === 'pick') {   // kursor peta: ±4 m per piksel mouse, dibatasi jangkauan rudal dari operator
      g.cx = clamp(g.cx + dx * 4 * sens, 10, W.WW - 10); g.cy = clamp(g.cy + dy * 4 * sens, 10, W.WH - 10);
      const lim = F.pickCfg(g.pk).range, d = Math.hypot(g.cx - P.x, g.cy - P.y); if (d > lim) { g.cx = P.x + (g.cx - P.x) * lim / d; g.cy = P.y + (g.cy - P.y) * lim / d; }
      return;
    }
    if (g.mode === 'pred') {   // geser titik tuju relatif arah pandang hulu ledak (kanan layar = kanan, atas layar = maju)
      const yw = Math.atan2(g.dir[1], g.dir[0]), fx = Math.cos(yw), fy = Math.sin(yw), k = Math.hypot(g.tx - g.mx, g.ty - g.my, F.hAt(g.tx, g.ty) - g.mz) * .0011 * sens;
      g.tx += (-fy * dx - fx * dy) * k; g.ty += (fx * dx - fy * dy) * k;
      const S = F.PRED.steer, d = Math.hypot(g.tx - g.px, g.ty - g.py); if (d > S) { g.tx = g.px + (g.tx - g.px) * S / d; g.ty = g.py + (g.ty - g.py) * S / d; }
      g.tx = clamp(g.tx, 5, W.WW - 5); g.ty = clamp(g.ty, 5, W.WH - 5); return;
    }
    const AC = F.AC130, k = .0024 * sens * AC.fov[g.w] / 42 / (g.zm ? 2 : 1);   // AC-130: makin sempit pandangan makin halus
    g.ay = clamp(g.ay + dx * k, -AC.lim[0], AC.lim[0]); g.ap = clamp(g.ap - dy * k * (P.inv ? -1 : 1), -AC.lim[1], AC.lim[1]); g.lkNew = true;
  };
  F.gsZoom = function () { const g = P.gs; if (!g) return; if (g.mode === 'uav') P.drone.zm = P.drone.zm ? 0 : 1; else if (g.mode === 'laser') { if (P.laser.ph === 'sat') return; P.laser.zm = P.laser.zm ? 0 : 1; } else if (!g.mode) g.zm = g.zm ? 0 : 1; else return; A() && A().local('switch', .4); };
  F.gsTherm = function () { const g = P.gs; if (g && g.mode === 'uav') { P.drone.th = P.drone.th ? 0 : 1; A() && A().local('switch', .5); } };
  F.gsWeapon = function (i) { const g = P.gs; if (g && !g.mode && F.GUNS[i] && g.w !== i) { g.w = i; A() && A().local('switch', .5); } };
  F.gsExit = function () {   // AC-130 selesai · drone: kembali ke tubuh · pilih sasaran: batal (hadiah kembali) · Predator: ledakkan sekarang
    const g = P.gs; if (!g) return;
    if (g.mode === 'laser' && P.alive && P.laser) { if (P.laser.ph === 'fire') laserNova(P.laser); else if (P.laser.ph === 'sat') P.laser.st = F.LASER.cin.t; return; }   // satelit: klik kanan = lewati sinematik / SUPERNOVA sekarang; layar kembali setelah ledakan
    P.gs = null; F.in.fire = false; F.in.press = 0;
    if (!g.mode && g.shots) F.acLeft.push(...g.shots);   // peluru yang masih terbang tetap jatuh & tetap memberi damage walau kamera sudah kembali
    if (g.mode === 'pred') { if (P.alive) { const a = g.aim || { x: g.mx, y: g.my }; g.cx = a.x; g.cy = a.y; predImpact(g); } }
    else if (g.mode === 'pick') { P.slots[g.pk] = (+P.slots[g.pk] || 0) + 1; F.msg(Tt(g.pk === 'GUNSHIP' ? 'f_gs_cancel' : g.pk === 'LASER' ? 'f_laser_cancel' : 'f_pred_cancel'), 'i'); }
    else if (g.mode === 'uav') { if (P.alive && P.drone) F.msg(Tt('f_drone_back'), 'i'); }
    else F.msg(Tt('f_gs_off'), 'i');
  };
  function predLaunch(g) {   // hulu ledak muncul tinggi di atas, di sisi operator, menukik ke sasaran yang dipilih
    const PR = F.PRED; let hx = P.x - g.cx, hy = P.y - g.cy, l = Math.hypot(hx, hy);
    if (l < 30) { hx = -Math.cos(P.yaw); hy = -Math.sin(P.yaw); l = 1; }
    const gz = F.hAt(g.cx, g.cy), mx = g.cx + hx / l * PR.back, my = g.cy + hy / l * PR.back, mz = gz + PR.alt, L = Math.hypot(g.cx - mx, g.cy - my, gz - mz);
    Object.assign(g, { mode: 'pred', t0: P.time, t: PR.t, mx, my, mz, px: g.cx, py: g.cy, tx: g.cx, ty: g.cy, dir: [(g.cx - mx) / L, (g.cy - my) / L, (gz - mz) / L], aim: null });
    F.in.fire = false; F.marks.push({ x: g.cx, y: g.cy, t: 0, life: 8 }); F.msg(Tt('f_pred_on'), 'g'); A() && A().local('rocket', 1);
  }
  function predTick(g, dt) {   // meluncur ke titik tuju; klik kiri = pendorong; arah berbelok halus mengikuti kemudi
    const PR = F.PRED, d = g.dir, dx = g.tx - g.mx, dy = g.ty - g.my, dz = F.hAt(g.tx, g.ty) - g.mz, l = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, dt * 2.4);
    d[0] += (dx / l - d[0]) * k; d[1] += (dy / l - d[1]) * k; d[2] += (dz / l - d[2]) * k; const n = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= n; d[1] /= n; d[2] /= n;
    const v = (F.in.fire ? PR.boost : PR.spd) * dt; g.mx += d[0] * v; g.my += d[1] * v; g.mz += d[2] * v;
    g.aim = airRay([g.mx, g.my, g.mz], d, 3000);
    if (g.aim && g.aim.d < v + 1) F.gsExit();
    else if (g.mz <= F.hAt(g.mx, g.my) + .5) { g.aim = { x: g.mx, y: g.my }; F.gsExit(); }
    else if (g.t <= 0) F.gsExit();
  }
  function droneTick(dt) {   // WASD terbang relatif arah pandang, SPASI/C naik-turun, SHIFT cepat; sinyal terbatas jarak dari operator
    const D = P.drone, I = F.in, DR = F.DRONE, sp = I.sprint ? DR.fast : DR.spd;
    let mx = (+I.r || 0) - (+I.l || 0), my = (+I.f || 0) - (+I.b || 0); const l = Math.max(1, Math.hypot(mx, my)); mx /= l; my /= l;
    const fx = Math.cos(D.yaw), fy = Math.sin(D.yaw), k = Math.min(1, dt * 2.6);
    D.vx += ((fx * my - fy * mx) * sp - D.vx) * k; D.vy += ((fy * my + fx * mx) * sp - D.vy) * k; D.vz += (((I.jump ? 1 : 0) - (I.dn ? 1 : 0)) * DR.climb * (I.sprint ? 1.6 : 1) - D.vz) * k;
    D.x = clamp(D.x + D.vx * dt, 5, W.WW - 5); D.y = clamp(D.y + D.vy * dt, 5, W.WH - 5); D.z += D.vz * dt;
    const d = Math.hypot(D.x - P.x, D.y - P.y);
    if (d > DR.range) { D.x = P.x + (D.x - P.x) * DR.range / d; D.y = P.y + (D.y - P.y) * DR.range / d; if (P.time - (D.farT || -9) > 3) { D.farT = P.time; F.msg(Tt('f_drone_far'), 'w'); } }
    const gz = Math.max(F.hAt(D.x, D.y), F.WZ); D.z = clamp(D.z, gz + DR.minH, gz + DR.maxH);
    D.aim = airRay([D.x, D.y, D.z], F.aimVec(D.yaw, D.pitch), 2500);
    if (I.fire && !D.fired) { D.fired = true; droneMark(D); } else if (!I.fire) D.fired = false;
  }
  function droneMark(D) {   // klik kiri: tandai musuh di sekitar titik bidik drone (tampil di HUD, radar & peta untuk operator)
    const p = D.aim; if (!p) return;
    const DR = F.DRONE; let n = 0;
    for (const u of Q.units) if (u.team === 'R' && !u.dead && Math.hypot(u.x - p.x, u.y - p.y) < DR.tagR) { tagFoe(u, DR.tag); n++; }
    F.marks.push({ x: p.x, y: p.y, t: 0, life: 12 });
    F.msg(n ? Tt('f_drone_tag', { n }) : Tt('f_drone_mark'), n ? 'g' : 'i'); A() && A().local('tag', .8);
  }
  function acHold(g) {   // bidikan stabil-darat (layar sentuh): titik bidik tetap walau pesawat terus mengorbit, jari tidak perlu mengejar
    const AC = F.AC130, k = g.kick; g.kick = 0;
    if (g.lkNew || !g.lk) { const c = acCam(g), a = airRay([c.x, c.y, c.z], F.aimVec(c.yaw, c.pitch), 4000); g.kick = k; g.lkNew = false; if (a) g.lk = { x: a.x, y: a.y, z: a.z }; return; }
    g.kick = k;
    const L = g.lk, gz = F.hAt(g.ox, g.oy), x = g.ox + Math.cos(g.ang) * AC.R, y = g.oy + Math.sin(g.ang) * AC.R, z = gz + AC.alt;
    g.ay = clamp(wrapPi(Math.atan2(L.y - y, L.x - x) - Math.atan2(g.oy - y, g.ox - x)), -AC.lim[0], AC.lim[0]);
    g.ap = clamp(Math.atan2(L.z - z, Math.hypot(L.x - x, L.y - y)) - Math.atan2(gz - z, AC.R), -AC.lim[1], AC.lim[1]);
  }
  function acTick(g, dt) {   // AC-130: orbit berlanjut, peluru terbang dari pesawat ke titik bidik lalu meledak
    const AC = F.AC130; g.ang += AC.w * dt; g.kick = Math.max(0, g.kick - dt * 3);
    acHold(g);   // gimbal stabil-darat: retikel tetap di titik tanah yang sama walau pesawat mengorbit, mouse hanya menggeser titik itu
    const c = acCam(g); g.aim = airRay([c.x, c.y, c.z], F.aimVec(c.yaw, c.pitch), 4000);
    const gun = F.GUNS[g.w];
    if (F.in.fire && g.cd[g.w] <= 0 && g.aim) {
      g.cd[g.w] = gun.cd;
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * gun.spread, sz = c.z - 3;
      let tx = clamp(g.aim.x + Math.cos(a) * r, 1, W.WW - 1), ty = clamp(g.aim.y + Math.sin(a) * r, 1, W.WH - 1), tz = Math.max(F.hAt(tx, ty), F.WZ);
      const ah = airSeg(c.x, c.y, sz, tx, ty, tz, gun.r * .5 + 2);   // heli / pesawat musuh di lintasan peluru: sumbu jarak dekat
      if (ah) { tx = ah.x; ty = ah.y; tz = ah.z; }
      g.shots.push({ x0: c.x, y0: c.y, z0: sz, x: tx, y: ty, z: tz, t: 0, dur: Math.hypot(tx - c.x, ty - c.y, tz - sz) / AC.spd[g.w], w: g.w, air: ah && ah.u });
      if (g.w === 2) g.kick = 1; else if (g.w === 1) g.kick = Math.max(g.kick, .35);
      A() && A().local(g.w === 0 ? 'chain' : g.w === 1 ? 'cannon' : 'arty', g.w === 0 ? .4 : g.w === 1 ? .55 : 1);
    }
    for (let i = g.shots.length - 1; i >= 0; i--) {
      const s = g.shots[i]; s.t += dt;
      if (s.t >= s.dur) { g.shots.splice(i, 1); acHit(s); }
    }
  }
  F.shock = [];   // cincin kejut ledakan besar { x, y, R, t, life }
  F.acLeft = [];   // peluru AC-130 yang masih terbang setelah Overwatch berakhir
  F.acLeftTick = dt => { for (let i = F.acLeft.length - 1; i >= 0; i--) { const s = F.acLeft[i]; s.t += dt; if (s.t >= s.dur) { F.acLeft.splice(i, 1); acHit(s); } } };
  /* serangan udara operator (AC-130, laser orbital, roket mortir) juga mengenai heli & pesawat musuh: uji jarak 3D ke badan pesawat.
     Lapis udara kebal 'he'/'bomb' di sim (peluru darat), jadi damage ke pesawat memakai jenis 'ap' */
  const isAir = u => !u.dead && u.team === 'R' && (u.fly || u.jet || UT[u.type].tc === 'A') && !(u.chute > 0);
  F.isAir = isAir;
  function airC(u) { const hb = F.hitbox(u); return [u.x, u.y, hb.z0 + hb.h / 2, hb.r]; }
  function airBlast(x, y, z, r, dmg, src) {
    let n = 0;
    for (const u of Q.units) {
      if (!isAir(u)) continue; const c = airC(u), d = Math.hypot(c[0] - x, c[1] - y, c[2] - z); if (d > r + c[3]) continue;
      war.hurt(u, dmg * (1 - .6 * Math.min(1, d / (r + c[3]))), 'ap', src); n++;
    }
    return n;
  }
  function airNear(x, y, z, pad) { for (const u of Q.units) { if (!isAir(u) || Math.abs(u.x - x) > 60 || Math.abs(u.y - y) > 60) continue; const c = airC(u); if (Math.hypot(c[0] - x, c[1] - y, c[2] - z) < pad + c[3]) return u; } return null; }
  function airSeg(x0, y0, z0, x1, y1, z1, pad) {   // pesawat pertama di sepanjang ruas → titik terdekat di badannya
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L2 = dx * dx + dy * dy + dz * dz || 1; let best = null, bt = 2;
    for (const u of Q.units) {
      if (!isAir(u)) continue; const c = airC(u), t = clamp(((c[0] - x0) * dx + (c[1] - y0) * dy + (c[2] - z0) * dz) / L2, 0, 1);
      const px = x0 + dx * t, py = y0 + dy * t, pz = z0 + dz * t; if (Math.hypot(c[0] - px, c[1] - py, c[2] - pz) > pad + c[3] || t >= bt) continue;
      bt = t; best = { u, x: c[0], y: c[1], z: c[2] };
    }
    return best;
  }
  function airBoom(x, y, z, r, dmg, S) {   // ledakan di udara: damage ke pesawat + bola api, serpihan, asap (tanpa kawah)
    const n = airBlast(x, y, z, r, dmg, P.unit);
    boom3d(x, y, z, S, true); F.emit('flash', x, y, z, { life: .35, s0: S, s1: S * 2, col: [255, 236, 200] });
    for (let i = 0; i < 12; i++) { const a = rand(0, 6.283), v = rand(.6, 1.4) * S * 1.4; F.emit('spark', x, y, z, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(-4, 10), life: rand(.5, 1), s0: .7, s1: .3, col: [255, 200, 110], g: 18 }); }
    for (let i = 0; i < 3; i++) F.emit('smoke', x + rand(-2, 2), y + rand(-2, 2), z, { vz: rand(1, 3), life: rand(2.5, 4), s0: S * .4, s1: S * 1.2, col: [58, 54, 50], a: .6, drag: .6 });
    return n;
  }
  function acHit(s) {   // peluru AC-130 jatuh: efek 3D sesuai kaliber dibuat langsung (tidak dibatasi ukuran ledakan sim), lalu damage
    const gn = F.GUNS[s.w], gz = Math.max(F.hAt(s.x, s.y), F.WZ), n = Q.fx.length;
    if (gn.sh) { const need = s.w === 2 ? 240 : 90, over = F.fx3.length + need - 700; if (over > 0) F.fx3.splice(0, over); }   // kolam partikel penuh (±700): buang asap tertua, ledakan besar tidak boleh hilang
    if (s.air) {   // meledak di udara dekat pesawat sasaran (mengikuti posisinya sekarang bila belum terlalu jauh)
      const u = s.air, c = !u.dead && airC(u);
      if (c && Math.hypot(c[0] - s.x, c[1] - s.y, c[2] - s.z) < 35) { s.x = c[0]; s.y = c[1]; s.z = c[2]; }
      airBoom(s.x, s.y, s.z, Math.max(gn.r, 4), gn.dmg, gn.bs * .7); A() && A().boom(P.x, P.y, s.w === 2 ? 12 : 5, true); return;
    }
    war.explode(s.x, s.y, gn.r, gn.dmg, gn.dt, P.unit, null, gn.hq); airBlast(s.x, s.y, gz + 3, gn.r, gn.dmg, P.unit);
    if (Q.fx.length > n) Q.fx[n]._s = 1;   // ledakan sim ini sudah digambar di sini, jangan digambar ulang oleh scanSim
    if (!gn.sh) {   // 25 mm: 15 peluru/dtk, efek ringan (dulu ledakan penuh ±34 partikel per peluru menghabiskan kolam dalam 2 dtk, ledakan 40/105 mm sesudahnya tidak muncul); dentum pendek dari kokpit
      F.emit('flash', s.x, s.y, gz + 1, { life: .09, s0: 1.6, s1: 4.2, col: [255, 240, 205] });
      for (let i = 0; i < 2; i++) F.emit('fire', s.x + rand(-1, 1), s.y + rand(-1, 1), gz + rand(.3, 1.2), { vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(2, 5), life: rand(.2, .4), s0: 1.5, s1: .7, col: [255, 200, 120], a: .9, drag: 1.5 });
      F.emit('smoke', s.x, s.y, gz + 1, { vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(1.5, 3), life: rand(.8, 1.3), s0: 1, s1: 3.4, col: [86, 80, 72], a: .5, drag: 1 });
      for (let i = 0; i < 3; i++) F.emit('spark', s.x, s.y, gz + .6, { vx: rand(-9, 9), vy: rand(-9, 9), vz: rand(3, 11), life: rand(.25, .5), s0: .5, s1: .2, col: [255, 210, 130], g: 18 });
      A() && A().boom(P.x, P.y, 2.2, true); return;
    }
    boom3d(s.x, s.y, gz, gn.bs, true);
    const S = gn.bs, big = s.w === 2;
    F.emit('flash', s.x, s.y, gz + S * .3, { life: big ? .6 : .32, s0: S * 1.1, s1: S * 2.1, col: [255, 246, 225] });   // kilat panas: tetap terang di kamera termal
    for (let i = 0; i < (big ? 9 : 5); i++) F.emit('fire', s.x + rand(-1, 1) * S * .2, s.y + rand(-1, 1) * S * .2, gz + rand(.2, .6) * S, { vx: rand(-1, 1) * S * .35, vy: rand(-1, 1) * S * .35, vz: rand(3, 8), life: rand(.9, 1.6), s0: S * .75, s1: S * .3, col: [255, rand(170, 215) | 0, 110], a: .95, drag: 1.2 });   // bola api
    if (big && P.gs && !P.gs.mode) P.gs.kick = Math.max(P.gs.kick, .9);   // gelombang kejut sampai ke pesawat
    F.shock.push({ x: s.x, y: s.y, R: gn.sh, t: 0, life: big ? .9 : .55, w: big ? 2.4 : .9 });
    for (let i = 0; i < (big ? 7 : 2); i++) F.scorch.push({ x: s.x + rand(-1, 1) * S * (big ? .4 : .25), y: s.y + rand(-1, 1) * S * (big ? .4 : .25), r: S * rand(.35, .55), t: 0, life: big ? 20 : 9 });   // kawah hangus
    for (let i = 0; i < (big ? 40 : 10); i++) { const a = rand(0, 6.283), v = rand(.6, 1.4) * S * 1.6; F.emit('spark', s.x, s.y, gz + 1, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(6, 18) * (big ? 1.6 : 1), life: rand(.5, 1.1), s0: .8, s1: .3, col: [255, 200, 110], g: 18 }); }   // serpihan membara
    if (big) {   // 105 mm: kolom api & asap tinggi
      for (let i = 0; i < 16; i++) F.emit('fire', s.x + rand(-5, 5), s.y + rand(-5, 5), gz + rand(2, 12), { vz: rand(20, 40), life: rand(.8, 1.5), s0: S * .45, s1: S * .2, col: [255, rand(120, 170) | 0, 50], a: .8, drag: .8 });
      for (let i = 0; i < 20; i++) F.emit('smoke', s.x + rand(-10, 10), s.y + rand(-10, 10), gz + rand(6, 34), { vx: rand(-3, 3), vy: rand(-3, 3), vz: rand(8, 18), life: rand(5, 9), s0: S * .4, s1: S * 1.3, col: [52, 50, 48], a: .65, drag: .35 });
      for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283; F.emit('dust', s.x + Math.cos(a) * S * .2, s.y + Math.sin(a) * S * .2, gz + 1.5, { vx: Math.cos(a) * S * 1.5, vy: Math.sin(a) * S * 1.5, vz: rand(1, 3), life: rand(1, 1.7), s0: S * .22, s1: S * .75, col: [120, 108, 90], a: .55, drag: 1.5 }); }   // debu gelombang kejut menyapu tanah
    }
    A() && A().boom(P.x, P.y, big ? 24 : 7, true);   // dentum terdengar dari kokpit, tanpa jeda jarak
  }
  function gsTick(dt) {
    const g = P.gs; g.t -= dt; g.cd = g.cd.map(c => c - dt); F.in.press = 0;   // klik di kamera udara tidak boleh tersimpan: dulu senapan menembak sendiri sebutir saat kembali ke tubuh
    if (!P.alive) { F.gsExit(); return; }
    if (g.mode === 'laser') { if (!P.laser) P.gs = null; return; }   // dijalankan laserTick
    if (g.mode === 'uav') { droneTick(dt); return; }   // lama terbang = baterai UAV (streakTick)
    if (g.mode === 'pick') { if (F.in.fire) pickGo(g); else if (g.t <= 0) F.gsExit(); return; }
    if (g.mode === 'pred') { predTick(g, dt); return; }
    if (g.t <= 0) { F.gsExit(); return; }
    acTick(g, dt);
  }
  /* ---------------- PARASUT OPERATOR (kanopi 3D digambar fps-gl bersama parasut kargo, tangan oleh fps-vm) ----------------
     P.chO 0→1 = kanopi mengembang ±1,3 dtk setelah dibuka; tali kanopi bertemu tepat di atas kepala; setelah mendarat kanopi kempis & rebah */
  const CHK = 1.35, CHH = 1.94;   // skala kanopi prajurit, tinggi titik temu tali di atas kaki (m)
  F.pchutes = [];
  function chuteDrop() { }   // mendarat: kanopi kain dilepas & kempis rebah (simulasi di fps-chute)
  function chuteTick(dt) {
    P.chO = P.alive && P.chute === 2 ? Math.min(1, (P.chO || 0) + dt / 1.3) : 0;
    if (F.cnTick) F.cnTick(dt);
  }
  /* kamera saat tewas: kepala jatuh dengan percepatan dari tinggi mata ke ±F.DIE.z m di atas tanah, bergeser ke arah jatuh, berguling ke samping,
     memantul kecil saat menghantam tanah; pandangan menengadah (terlentang) atau menghadap tanah (tersungkur) */
  F.DIE = { t: .72, z: .28, push: .85, roll: 1.25, up: .36, down: -.7 };
  function dieHead() {
    const D = P.dieA || { back: 1, side: 1, tw: 0, p0: 0, eye: P.eye }, C = F.DIE, k = clamp(P.deadT / C.t, 0, 1), f = k * k, a = P.deadT - C.t;
    const bo = a > 0 ? Math.exp(-a * 7) * Math.sin(a * 22) * .07 : 0, mv = -D.back * C.push * f;   // terlentang: kepala ke belakang; tersungkur: ke depan
    let x = P.x + Math.cos(P.yaw) * mv, y = P.y + Math.sin(P.yaw) * mv; if (F.bTop(x, y) !== null) { x = P.x; y = P.y; }
    const gz = F.floorAt(x, y), z = Math.max(gz + C.z * .6, P.z + D.eye - (D.eye - C.z) * f + bo);
    return { x, y, z, f, roll: D.side * C.roll * f * (1 + bo * 2), pitch: D.p0 * (1 - f) + (D.back > 0 ? C.up : C.down) * f, yaw: P.yaw + D.tw * f };
  }
  F.update = function (dt) {
    if (!P.on) return;
    F.ensureWorld(); P.time += dt;
    if (P.gen && P.gen !== Q.g && P.alive) { P.alive = false; P.menu = true; P.unit = null; }
    P.shake = Math.max(0, P.shake - dt * 2.2);
    F.airTick(dt); F.ccTick && F.ccTick(dt); F.crayTick && F.crayTick(dt); F.acLeftTick(dt); updateObjects(dt); scanSim(dt); abSim(dt); F.dieTick && F.dieTick(dt); chuteTick(dt); arrTick(dt); rktTick(dt);
    if (P.alive && !P.menu) {
      const I = F.in; P.yaw = wrapPi(P.yaw + ((I.kr || 0) - (I.kl || 0)) * 1.9 * dt); P.pitch = clamp(P.pitch + ((I.ku || 0) - (I.kd || 0)) * 1.4 * dt, F.PMIN, 1.35);
      if (P.gs) { gsTick(dt); P.vx = P.vy = 0; } else if (P.entA && F.entTick(dt)) { P.vx = P.vy = 0; } else if (P.hook && F.hookTick(dt)) { /* ditarik tali kait */ } else if (P.mnt) F.heliPilot(dt); else if (P.veh) F.vehPilot(dt); else { move(dt); weapons(dt); abilityTick(dt); }
      laserTick(dt);
      F.updateExpo();
      for (const [id, c] of F.contacts) if (P.time - c.t > 3.5 || c.u.dead) F.contacts.delete(id);
      if (P.down) { P.down.t += dt; if (P.down.t >= P.down.d && !P.unit.dead) standUp(); }   // LAST STAND: bertahan cukup lama = bangkit
      else if (P.unit.hp < P.unit.hpMax && P.time - P.lastHurt > 5 && !P.unit.dead) P.unit.hp = Math.min(P.unit.hpMax, P.unit.hp + 32 * dt);
      if (P.unit.dead && P.alive) die(null);
    } else if (!P.alive) {
      P.deadT += dt; P.vx *= .9; P.vy *= .9;
      const DA = P.dieA; if (DA && !DA.hit && P.deadT > F.DIE.t) { DA.hit = true; P.shake = Math.min(1.5, P.shake + .45); A() && A().local('land', 1); const h = dieHead(); puff(h.x, h.y, F.floorAt(h.x, h.y) + .1, 8, [140, 126, 100], 1.1); }   // tubuh menghantam tanah
      if (P.deadT > 3.6 && !P.menu) { P.menu = true; }
    }
    F.heliTick(dt); F.vehTick && F.vehTick(dt); F.kitTick && F.kitTick(dt); F.lifeTick && F.lifeTick(dt); streakTick(dt);
    P.hurtDirs = P.hurtDirs.filter(h => P.time - h.t < 2.2);
    F.updateCam();
  };
  F.updateCam = function () {
    if (!P.alive && P.started && !P.menu && P.killer && !P.killer.dead) {   // kill-cam: menoleh ke arah pembunuh
      const want = Math.atan2(P.killer.y - P.y, P.killer.x - P.x); P.yaw = wrapPi(P.yaw + wrapPi(want - P.yaw) * .06);
    }
    if (P.alive && P.gs && P.gs.mode !== 'pick') { P.cam = F.gsCam(); return; }   // kamera drone / AC-130 / hulu ledak Predator
    if (P.alive && P.mnt && P.heli) { P.cam = F.heliCamera(); if (P.entA) P.cam = F.entCam(P.cam); return; }   // kamera Apache (orang-ketiga / kokpit penembak)
    if (P.alive && P.veh) { P.cam = F.vehCamera(); if (P.entA) P.cam = F.entCam(P.cam); return; }   // kamera kendaraan operator (orang-ketiga / kursi penembak)
    if (P.alive || (P.started && !P.menu)) {
      const sw = F.wdefSafe().scope && !F.wdefSafe().acc && P.ads > .5 && P.alive ? (F.in.sprint ? .15 : 1) * (perk('STEADY') ? F.PERK.steady.sway : 1) : 0, t = P.time;   // teleropong goyang; SHIFT = tahan napas
      const vc = P.alive && (P.relT > 0 || P.melT > 0) && TK.fpsvm && TK.fpsvm.cam || [0, 0];   // hentakan reload / ayunan pisau ikut menggoyang kamera
      const zs = 1 - P.ads * (1 - F.wdefSafe().zoom);   // getaran kamera dikecilkan sebanding perbesaran: di layar tetap sama kuat saat membidik teropong
      const dh = P.alive ? null : dieHead(), jit = () => (Math.random() - .5) * P.shake * .02 * zs;
      P.cam = dh ? { x: dh.x, y: dh.y, z: dh.z, yaw: dh.yaw + jit(), pitch: dh.pitch + jit(), roll: dh.roll, fov: P.fov * D2R } : {
        x: P.x, y: P.y, z: P.z + P.eye + Math.sin(P.bob * 2) * .035 * clamp(P.spd / 8, 0, 1.4),
        yaw: P.yaw + P.rkY + vc[1] + jit() + Math.sin(t * 1.3) * .0014 * sw, pitch: P.pitch + P.rkP + vc[0] + jit() + Math.sin(t * 1.9) * .0011 * sw,
        fov: P.fov * D2R * (1 - P.ads * (1 - F.wdefSafe().zoom))
      };
    } else {   // kamera orbit di atas medan saat menu terbuka
      const c = P.started ? { x: P.x, y: P.y } : Q.hqB, a = P.time * .1 + 1;
      P.cam = { x: c.x + Math.cos(a) * 80, y: c.y + Math.sin(a) * 80, z: F.hAt(c.x, c.y) + 34, yaw: a + Math.PI, pitch: -.22, fov: 70 * D2R };
    }
  };

  /* unit musuh tepat di garis bidik (tanpa spread); dipakai warna crosshair */
  F.aimAt = function () {
    if (!P.alive || !P.cam) return null;
    const v = F.aimVec(P.cam.yaw, P.cam.pitch), dh = Math.hypot(v[0], v[1]), oz = P.cam.z; let best = 1200, hit = null;
    const tt = F.rayTerrain(P.x, P.y, oz, v[0], v[1], v[2], best); if (tt > 0) best = tt;
    for (const u of Q.units) {
      if (u.dead || u.team === 'B' || u.chute > 0) continue; const dx = u.x - P.x, dy = u.y - P.y; if (dx * v[0] + dy * v[1] < 0) continue;
      const hb = F.hitbox(u), t = F.rayHB(P.x, P.y, oz, v, u, hb, 1, .25); if (t < .3 || t >= best) continue; best = t; hit = u;
    }
    return hit;
  };

  /* ---------------- MASUK / KELUAR MODE ---------------- */
  F.enter = function () {
    if (P.on) return; P.on = true; war.fpsMode = true; P.prevSpeed = Q.speed; Q.speed = .5; P.time = P.time || 0;
    if (!P.alive || P.gen !== Q.g) { P.alive = false; P.menu = true; }
  };
  F.leave = function () {
    if (!P.on) return; P.on = false; P.gs = null; F.acLeft.length = 0; F.heliClear(); F.vehClear && F.vehClear(); war.fpsMode = false; Q.speed = P.prevSpeed || 1;
    if (P.unit && !P.unit.dead) { P.unit.dead = true; } P.alive = false; P.menu = true; P.tgt = null; P.ads = 0;
    F.in.fire = F.in.ads = false;
  };
  F.reset = function () { P.kills = P.deaths = P.hs = P.score = P.streak = 0; P.squad = []; };
})();
