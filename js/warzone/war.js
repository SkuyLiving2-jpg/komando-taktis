/* ============================================================
   WAR — simulasi warzone: gelar pasukan, pergerakan, tempur,
   kabut perang, objektif, AI musuh
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, UT = W.UT, MU = W.MULT;
  const { rand, pick, clamp, wrapPi } = TK.util;
  const Tt = (k, v) => TK.t(k, v), L = (m, lv) => TK.log(m, lv);
  const Q = {}, war = TK.war = { Q, hooks: {} };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cell = v => Math.floor(v / W.CELL);
  const uname = t => Tt('wu_' + t);
  /* dmgR: pengali damage musuh · accP: pengali akurasi musuh ke operator FPS · waveT: jeda gelombang infanteri massal (MUDAH) · wave: ukuran rombongan · weak: [pengali HP, pengali jeda tembak] musuh rombongan
     nuke: [mulai, jeda] serangan nuklir (dtk sim) · ufoT: UFO mulai muncul
     MUDAH = gerombolan "cupu": ratusan prajurit sekaligus, HP setengah, tembakan jarang & ringan (batas 650 agar tetap lancar)
     posts: jumlah pos (dari 5) yang sudah dikuasai musuh saat mulai — DIACAK tiap misi · garr: garnisun per pos · extra: satu kendaraan acak per pos
     PROFESIONAL: tiap pos dijaga mini bos, bos penyerbu ikut datang (seperti SULIT), bos akhir (HP ×fbHp) keluar berburu setelah fbHunt dtk /
     3 pos kita kuasai — mendesak ke pos-pos kita lalu markas kita; kembali bertahan bila markasnya sendiri terancam
     raid: [mulai, jeda] (SULIT) — bos penyerbu dari RAIDERS berangkat bergiliran dari markas musuh, merebut pos lalu menggempur markas kita;
     posisinya selalu dilaporkan intel (u.intel: tampak di peta walau tertutup kabut, tanpa membuka sasaran tembak) */
  const DIFF = [{ inc: 20, pop: 650, dmgR: .1, accP: .26, waveT: 35, wave: [150, 250], weak: [.5, 1.4], inf: true, posts: 2, garr: { INF: 3 } },
    { inc: 34, pop: 90, dmgR: 1, nuke: [720, 900], ufoT: 300, posts: 3, garr: { INF: 5 }, sortie: [24, 80], airMax: 4 },
    { inc: 55, pop: 120, dmgR: 1.15, nuke: [420, 420], ufoT: 180, posts: 4, garr: { INF: 5, JEEP: 1 }, raid: [30, 60], sortie: [20, 50], airMax: 7 },
    { inc: 85, pop: 190, dmgR: 1.45, nuke: [480, 480], ufoT: 200, posts: 4, garr: { INF: 12, SF: 4, AT: 2, MORT: 1, MEDIC: 2, JEEP: 2 }, extra: ['IFV', 'ZSU', 'LTANK', 'AA', 'TANK'], extraN: 2, pro: true, raid: [60, 75], fbHunt: 200, fbHp: 1.5,
      hpR: 1.35, hpB: 1.35, dmgB: 1.25, sortie: [16, 34], airMax: 10 }];   // v2.12 PRO: musuh lebih banyak (pop 190) & tebal (HP ×1,35, damage ×1,45); pasukan kita juga HP ×1,35, damage ×1,25   // waktu sim (mode operator = ½ kecepatan: penyerbu pertama ±2 mnt, bos akhir berburu ±6,5 mnt)
  const BOSSES = ['BLIMP', 'GUNSHIP', 'ULTIMA', 'CMDR'];
  const FINALS = ['LEVI', 'NEMESIS', 'KRAKEN', 'TITAN', 'ZEUS', 'WARLORD'];   // bos akhir: satu diacak tiap misi
  const RAIDERS = ['BEHEMOTH', 'TEMPEST', 'WYVERN', 'CLAY'];   // bos penyerbu SULIT/PRO: keempatnya datang, urutan diacak (CLAY MARTIN sejak v2.2)
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /* loadout acak infanteri & Kopassus (kedua pihak): p = pengali senjata utama {dmg, cd, rng, acc}, s = senjata kedua pengganti,
     spd = pengali kecepatan gerak, vis = pengali jarak pandang. GL/OFF/RTO = senapan serbu dengan tampilan berbeda (pelontar granat, perwira, radio) */
  const KITS = {
    RIF: { w: 30, p: {} },                                                                    // senapan serbu: serba bisa
    SMG: { w: 16, p: { dmg: .6, cd: .42, rng: .68, acc: 1.08 }, spd: 1.22 },                 // SMG: rentetan cepat, gesit, jarak dekat
    DMR: { w: 11, p: { dmg: 4.2, cd: 3.4, rng: 2.3, acc: 1.25 }, spd: .9, vis: 1.35 },       // penembak runduk: sekali tembak sakit, jarak jauh, lambat
    MG: { w: 14, p: { dmg: .85, cd: .35, rng: 1.15, acc: .85 }, spd: .8 },                    // LMG: hujan peluru, berat
    SG: { w: 12, p: { dmg: 3.2, cd: 2, rng: .38, acc: 1.25 }, spd: 1.08 },                   // shotgun: mematikan dari dekat
    RPG: { w: 13, p: { dmg: .8 }, s: { vs: 'G', dt: 'ap', dmg: 95, cd: 4.5, rng: 520, proj: 'missile', spd: 190, acc: 1 }, spd: .92 },   // bazoka: pemburu tank (Kopassus: roket lebih berat & cepat isi ulang)
    GL: { w: 6, p: {}, inf: 1 }, OFF: { w: 4, p: { cd: 1.2 }, inf: 1 }, RTO: { w: 4, p: {}, inf: 1 }
  };
  const KIT_T = { INF: 1, SF: 1 };
  /* mode tembak senjata pribadi prajurit (detik sim; mode operator = ½ kecepatan → jarak antarpeluru terasa 2×):
     AR varian AUTO (rentetan 3–6) atau BURST (3 peluru cepat), SMG otomatis cepat, LMG rentetan panjang. Dulu semua tembakan tunggal */
  const FMODE = { auto: { n: [3, 6], gap: .045 }, burst: { n: [3, 3], gap: .03 }, smg: { n: [4, 7], gap: .035 }, mg: { n: [6, 11], gap: .045 } };
  const fmOf = kit => kit === 'SMG' ? 'smg' : kit === 'MG' ? 'mg' : kit === 'RIF' || kit === 'GL' || kit === 'OFF' || kit === 'RTO' ? (Math.random() < .5 ? 'auto' : 'burst') : null;
  function pickKit(type) { let r = rand(0, 1) * Object.keys(KITS).reduce((a, k) => a + (KITS[k].inf && type !== 'INF' ? 0 : KITS[k].w), 0); for (const k in KITS) { if (KITS[k].inf && type !== 'INF') continue; r -= KITS[k].w; if (r <= 0) return k; } return 'RIF'; }
  function kitWeapons(type, kit) {   // salinan senjata tipe unit yang sudah disesuaikan loadout
    const K = KITS[kit], w = UT[type].w.map(x => Object.assign({}, x)), p = K.p, w0 = w[0];
    Object.assign(w0, { dmg: w0.dmg * (p.dmg || 1), cd: w0.cd * (p.cd || 1), rng: w0.rng * (p.rng || 1), acc: Math.min(.98, (w0.acc || .8) * (p.acc || 1)) });
    if (K.s && w[1]) { w[1] = Object.assign({}, K.s); if (type === 'SF') { w[1].dmg *= 1.5; w[1].cd *= .8; } }
    return w;
  }
  war.KITS = KITS; war.FMODE = FMODE; war._fire = (u, i, tg, x, y) => fire(u, i, tg, x, y);   // _fire: uji
  const WS = u => u.wp || UT[u.type].w;   // senjata unit (loadout pribadi bila ada)
  const HPF = 1.6, DMG_B = 1.3, TAKE_B = .8;   // pasukan kita lebih tangguh dan terlatih
  const WEAKT = { INF: 1, SF: 1, AT: 1, MORT: 1, MEDIC: 1 };   // jenis infanteri yang ikut aturan "cupu" MUDAH
  const POP_CAP = 300, DROP_COST = 1.5;
  const CHUTE_R = .8, LAND_T = 1.9;   // penerjun: u.chute (dtk nominal) berkurang 0,8×/dtk sim → ±9 dtk nyata di udara pada mode operator (sim ½ kecepatan); jeda mendarat 1,9 dtk NYATA
  const FPSW = { INF: 2.6, SF: 2, AT: 1.4, MEDIC: 1.5, JEEP: 1.2, TANK: .5, LTANK: .5, IFV: .55, ARTY: .5, MLRS: .4, ZSU: .8 };

  const terAt = (x, y) => { const cx = cell(x), cy = cell(y); return (cx < 0 || cy < 0 || cx >= W.GW || cy >= W.GH) ? W.TER.PLAIN : Q.g.t[cy * W.GW + cx]; };
  const hqOf = team => team === 'B' ? Q.hqB : Q.hqR;

  /* ---------------- RESET ---------------- */
  war.reset = function (diff) {
    const g = W.gen(1 + Math.floor(Math.random() * 99999)), c = (a) => [(a[0] + .5) * W.CELL, (a[1] + .5) * W.CELL];
    if (diff === undefined) diff = Q.diff === undefined ? 1 : Q.diff;
    const D = DIFF[diff], held = shuffle([0, 1, 2, 3, 4]).slice(0, D.posts);   // pos musuh berbeda tiap misi
    Object.assign(Q, {
      g, t: 0, diff, speed: Q.speed || 1, paused: false, sel: [], units: [], projs: [], fx: [], pend: [], nextId: 1, over: null,
      cr: 100000, crR: 2500, waveT: 20, waveQ: 0, nuke: null, nukeT: 0, aiT: 20, fb: null, fbType: FINALS[Math.floor(Math.random() * FINALS.length)], strk: [], shT: -9, bossT: 0, stats: { dep: 0, lost: 0, kills: 0 }, fog: new Uint8Array(W.GW * W.GH), fogV: 0, visT: 0, acqT: 0, rallyN: 0,
      raidT: D.raid ? D.raid[0] : 0, raidN: 0, raidQ: shuffle(RAIDERS.slice()), ban: null, fac: null,
      objs: g.OBJ.map((o, i) => { const p = c([o[1], o[2]]); const r = held.includes(i); return { name: o[0], x: p[0], y: p[1], r: 260, owner: r ? 'R' : 'N', prog: r ? -1 : 0, boss: null }; })
    });
    const pb = c(g.HQB), pr = c(g.HQR);
    Q.hqB = mk('B', 'HQ', pb[0], pb[1]); Q.hqR = mk('R', 'HQ', pr[0], pr[1]);
    Q.fac = W.facOf(pr[0], pr[1]); Q.sortT = D.sortie ? D.sortie[0] : 0; Q.sortN = 0;
    baseDefense(pb[0], pb[1]);
    Q.sat = { goal: null, def: false, t: 4, refT: SAT_REF, holdT: 0, skip: [] }; satFill(true);   // satgas serbu otomatis
    mk('R', 'BNK', pr[0] - 130, pr[1] - 90, { stance: 'HOLD', garr: true }); mk('R', 'BNK', pr[0] - 130, pr[1] + 100, { stance: 'HOLD', garr: true });
    mk('R', 'SAM', pr[0] - 90, pr[1], { garr: true });
    for (let i = 0; i < 4; i++) mk('R', 'INF', pr[0] - 200 + rand(-40, 40), pr[1] + rand(-160, 160), { stance: 'HOLD', garr: true });
    if (DIFF[diff].inf) for (let i = 0; i < 4; i++) mk('R', 'INF', pr[0] - 260 + rand(-30, 30), pr[1] + rand(-90, 90), { stance: 'HOLD', garr: true });
    else mk('R', 'TANK', pr[0] - 260, pr[1] + rand(-60, 60), { stance: 'HOLD', garr: true });
    Q.nukeT = DIFF[diff].nuke ? DIFF[diff].nuke[0] : 0;
    parkStands();
    const bs = shuffle(BOSSES.slice()); let bi = 0;
    Q.objs.forEach(o => {
      if (o.owner !== 'R') return;
      const G = { stance: 'HOLD', garr: true };
      mk('R', 'BNK', o.x + 60, o.y - 50, G); if (D.pro) mk('R', 'BNK', o.x - 70, o.y + 60, G);
      for (const t in D.garr) for (let i = 0; i < D.garr[t]; i++) mk('R', t, o.x + rand(-110, 110), o.y + rand(-110, 110), G);
      if (D.extra) for (let k = 0; k < (D.extraN || 1); k++) mk('R', pick(D.extra), o.x + rand(-80, 80), o.y + rand(-80, 80), G);
      if (D.pro) o.boss = spawnBoss(bs[bi++ % bs.length], o.x, o.y, o);
    });
    updateVis(); L(Tt('w_start'), 'i'); L(Tt('w_tip'), 'w');
  };
  /* markas kita (semua tingkat kesulitan): pertahanan berlapis menghadap timur — 4 SAM, 2 meriam CAESAR 155 mm, 3 sarang SMB berawak,
     2 bunker, hanud bergerak, dan garnisun siaga yang ditambat ke markas (guard: menyambut lawan dalam radius r lalu kembali ke posnya):
     10 infanteri, 10 Kopassus, 5 tank veteran (elite: nyawa ×1,6, tembakan ×1,35), 2 IFV, 5 heli serang */
  function baseDefense(x, y) {
    const land = (px, py) => { let k = 0; while (k < 12 && terAt(px, py) === W.TER.WATER) { px += (x - px) * .15; py += (y - py) * .15; k++; } return [px, py]; },   // titik di air: geser ke arah markas
      put = (t, px, py, o) => { const p = land(px, py); return mk('B', t, p[0], p[1], o); },
      H = { stance: 'HOLD' }, gd = (t, gx, gy, r, o) => { const u = put(t, gx, gy, Object.assign({ base: true }, o)); u.guard = { x: u.x, y: u.y, r }; return u; };
    // v2.2.5: tata letak dirapatkan (±55–60% jarak lama, dulu sampai ±300 m dari HQ → tampak sepi & berjauhan): senjata & pasukan berada
    // di antara barak/hanggar markas (bangunan otomatis dikosongkan di sekitar tiap struktur oleh zona fps-data)
    put('BNK', x + 72, y - 50, H); put('BNK', x + 72, y + 55, H);
    for (const [dx, dy] of [[-88, -100], [-88, 100], [122, -128], [122, 128]]) put('SAM', x + dx, y + dy, H);
    for (const dy of [-44, 44]) put('CAESAR', x - 112, y + dy, H);
    for (const [dx, dy] of [[148, -82], [166, 0], [148, 82]]) {   // sarang SMB + awaknya
      const m = put('MGN', x + dx, y + dy, H), c = gd('INF', m.x - 1.7, m.y, 40, { stance: 'HOLD', kit: 'RIF' });
      m.crew = c; c.crewOf = m; c.manning = true;
    }
    gd('AA', x + 38, y + 96, 300, H);
    for (let i = 0; i < 10; i++) gd('INF', x + 118 + rand(-12, 12), y - 108 + i * 24, 430);
    for (let i = 0; i < 10; i++) gd('SF', x + 92 + rand(-12, 12), y - 120 + i * 27, 460);
    for (let i = 0; i < 5; i++) { const t = gd('TANK', x + 178, y - 96 + i * 48, 540, { elite: true }); t.hp = t.hpMax = t.hpMax * 1.6; }
    for (const dy of [-150, 150]) gd('IFV', x + 140, y + dy, 520);
    for (const [dx, dy] of W.PADB) { const h = gd('HELI', x + dx, y + dy, 950); park(h, 'cold'); h.pad0 = true; }   // heli garnisun parkir di helipad, mesin mati sampai ada tugas
    if (DIFF[Q.diff].pro) {   // v2.12 PRO: garnisun tambahan — 2 tank veteran & 6 Kopassus
      for (let i = 0; i < 2; i++) { const t = gd('TANK', x + 200, y - 30 + i * 60, 560, { elite: true }); t.hp = t.hpMax = t.hpMax * 1.6; }
      for (let i = 0; i < 6; i++) gd('SF', x + 70 + rand(-10, 10), y - 75 + i * 30, 460);
    }
  }

  /* ---------------- UNIT ---------------- */
  function mk(team, type, x, y, opt) {
    const T = UT[type];
    const u = Object.assign({
      id: Q.nextId++, team, type, tc: T.tc, x, y, hp: T.struct ? T.hp : T.hp * HPF, hpMax: T.struct ? T.hp : T.hp * HPF, hdg: team === 'B' ? 0 : Math.PI, face: team === 'B' ? 0 : Math.PI,
      order: { k: 'idle' }, path: [], stance: T.stance || 'AGGR', cds: T.w.map(() => rand(0, 1)), tg: T.w.map(() => null),
      seen: { B: false, R: false }, revealT: -9, hitT: -9, fly: !!T.fly, jet: !!T.jet, struct: !!T.struct, life: T.life || 0, bombs: T.bombs || 0,
      chute: 0, rally: false, garr: false, born: Q.t, acq: Math.random() * .3, vis: T.vis, stealth: T.stealth || 1, armor: T.armor, spotted: false, dead: false, repath: 0
    }, opt || {});
    if (KIT_T[type]) { if (!KITS[u.kit]) u.kit = pickKit(type); const K = KITS[u.kit]; u.wp = kitWeapons(type, u.kit); u.spdK = K.spd || 1; u.vis *= K.vis || 1; u.fm = fmOf(u.kit); }
    const wk = DIFF[Q.diff].weak;   // MUDAH: infanteri AI kedua pihak sama-sama "cupu" (operator tidak termasuk)
    if (wk && WEAKT[type] && !u.player && !u.base) { u.weak = true; u.hp = u.hpMax = u.hpMax * wk[0]; u.kcd = (u.kcd || 1) * wk[1]; }   // garnisun markas kita tetap utuh
    const D0 = DIFF[Q.diff], hk = T.struct || u.player || u.boss ? 1 : team === 'R' ? D0.hpR || 1 : D0.hpB || 1; if (hk !== 1) u.hp = u.hpMax = u.hpMax * hk;   // PRO: kedua pihak lebih tebal
    Q.units.push(u); return u;
  }
  war.mk = mk;

  /* ---------------- PATH & GERAK ---------------- */
  const PC = { g: null, t: 0, m: new Map() };
  function setPath(u, x, y) {
    const T = UT[u.type];
    if (u.fly || u.struct) { u.path = [{ x, y }]; return; }
    const mode = T.dom === 'S' ? 'S' : 'G';
    // cache rute ±2 dtk: ratusan prajurit gerombolan dari sel yang sama tidak menghitung A* berulang (cegah patah-patah)
    if (PC.g !== Q.g || Q.t - PC.t > 2 || PC.m.size > 600) { PC.g = Q.g; PC.t = Q.t; PC.m.clear(); }
    const key = cell(u.x) + ',' + cell(u.y) + '>' + cell(x) + ',' + cell(y) + mode;
    let p0 = PC.m.get(key); if (p0 === undefined) { p0 = W.astar(Q.g, cell(u.x), cell(u.y), cell(x), cell(y), mode); PC.m.set(key, p0); }
    const p = p0 ? p0.map(q => ({ x: q.x, y: q.y })) : null;
    u.path = p || [];
    if (p && p.length && W.passable(Q.g, cell(x), cell(y), mode)) p[p.length - 1] = { x, y };
    u.repath = 2;
  }
  function follow(u, dt) {
    if (!u.path.length) return false;
    const T = UT[u.type], p = u.path[0], dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
    const sp = T.spd * (u.spdK || 1) * (u.fly || T.dom === 'S' ? 1 : (W.TSPD[terAt(u.x, u.y)] || .5));
    if (u.jf) return true;   // CLAY mengudara: gerak diintegrasikan clayFly (punya inersia)
    if (u.armor !== 'inf' && !u.struct && !u.jet && !u.jf) { drive(u, T, p, dx, dy, d, sp, dt); return true; }
    const step = sp * dt, ox = u.x, oy = u.y;
    u.hdg = Math.atan2(dy, dx);
    if (d <= step) { u.x = p.x; u.y = p.y; u.path.shift(); } else { u.x += dx / d * step; u.y += dy / d * step; }
    if (war.hooks.nav && !u.fly) war.hooks.nav(u, ox, oy, p);   // mode FPS: prajurit menyusuri dinding gedung, tidak menembusnya
    return true;
  }
  /* kendaraan, kapal & heli bergerak seperti kendaraan sungguhan: laju belok terbatas (jari-jari belok; tank & heli bisa berputar di tempat),
     berakselerasi & mengerem, melambat di tikungan dan sebelum titik akhir. Dulu arah langsung patah ke tiap titik rute sehingga badan
     terlihat bergerak menyamping. u.cs = laju sekarang, u.mvT = waktu terakhir bergerak */
  function drive(u, T, p, dx, dy, d, sp, dt) {
    const last = u.path.length === 1, piv = u.fly || u.armor === 'heavy', R = u.fly ? 26 : T.dom === 'S' ? 34 : 8 * (T.sz || 1);
    if (Q.t - (u.mvT || -9) > .4) { u.cs = 0; u.yr = 0; }
    u.mvT = Q.t;
    // titik kejar di depan sepanjang rute (pure pursuit): tikungan membulat seperti disetir, bukan patah di titik rute
    const LA = Math.max(7, (u.cs || 0) * 1.2); let tx = p.x, ty = p.y;
    if (!last && d < LA) { const q = u.path[1], sx = q.x - p.x, sy = q.y - p.y, sl = Math.hypot(sx, sy) || 1, k = Math.min(1, (LA - d) / sl); tx = p.x + sx * k; ty = p.y + sy * k; }
    let want = Math.atan2(ty - u.y, tx - u.x);
    if (war.hooks.navSteer && !u.fly && T.dom !== 'S') want = war.hooks.navSteer(u, want, d);
    else if (war.hooks.airSteer && u.fly) want = war.hooks.airSteer(u, want);   // heli: membelok memutari gedung yang terlalu tinggi   // mode FPS: membelok lebih awal menghindari gedung di depan
    const e = wrapPi(want - u.hdg), ae = Math.abs(e), acc = sp * (u.fly ? .4 : .55);
    let tgt = sp * (ae > 1.2 ? (piv ? .05 : .28) : Math.max(.3, 1 - ae * .6));   // melambat sebelum & selama berbelok tajam
    if (last) tgt = Math.min(tgt, Math.max(1.5, Math.sqrt(2 * acc * .7 * d)));   // mengerem sebelum titik akhir
    u.cs = (u.cs || 0) + clamp(tgt - (u.cs || 0), -acc * 2 * dt, acc * dt);
    // kemudi: laju belok mengejar sasaran secara halus (seperti memutar setir), dibatasi jari-jari belok (tank & heli juga bisa berputar di tempat)
    const rmax = Math.max(piv ? .8 : .4, u.cs / R), wr = clamp(e * 2.2, -rmax, rmax);
    u.yr = (u.yr || 0) + (wr - (u.yr || 0)) * Math.min(1, dt * 3.5);
    u.hdg = wrapPi(u.hdg + u.yr * dt);
    const step = u.cs * dt, ox = u.x, oy = u.y;
    if (last && d <= Math.max(step, .6)) { u.x = p.x; u.y = p.y; u.cs = 0; u.yr = 0; u.path.shift(); }
    else {
      if (last && d < R * 1.3 && ae > .5 && !piv) { const k = Math.min(1, 2.5 * dt / d); u.x += dx * k; u.y += dy * k; }   // kendaraan beroda dekat titik akhir: merayap pelan langsung
      else { u.x += Math.cos(u.hdg) * step; u.y += Math.sin(u.hdg) * step; }
      if (!last && Math.hypot(p.x - u.x, p.y - u.y) < Math.max(4, LA * .55)) u.path.shift();   // titik antara dilewati sambil berbelok
    }
    if (war.hooks.nav && !u.fly && T.dom !== 'S') war.hooks.nav(u, ox, oy, p);
  }

  function steerJet(u, ax, ay, dt, rate) {
    const want = Math.atan2(ay - u.y, ax - u.x);
    u.hdg += clamp(wrapPi(want - u.hdg), -rate * dt, rate * dt);
    const sp = UT[u.type].spd; u.x += Math.cos(u.hdg) * sp * dt; u.y += Math.sin(u.hdg) * sp * dt; u.face = u.hdg;
  }

  /* ---------------- TEMBAK ---------------- */
  function fx(k, x, y, d, r, extra) { if (Q.fx.length < 400) Q.fx.push(Object.assign({ k, x, y, t: 0, d, r }, extra || {})); }
  function fire(u, i, tg, px, py) {
    const w = WS(u)[i], tx = tg ? tg.x : px, ty = tg ? tg.y : py, d = Math.hypot(tx - u.x, ty - u.y);
    if (u.boss && tg) u.ftg = tg;   // sasaran terakhir: dipakai pose bidik 3D (elevasi railgun Clay)
    let cd = w.cd * rand(.95, 1.1) * (i === 0 && u.kcd || 1) * (u.rage || 1);
    const FM = i === 0 && u.fm ? FMODE[u.fm] : null;
    if (FM) {   // rentetan: n peluru berjarak FM.gap, lalu jeda → kerusakan per detik sama dengan tembakan tunggal (jeda akhir = cd·n − jarak antarpeluru)
      if (!(u.bl > 0)) { u.bn = u.bl = FM.n[0] + Math.floor(rand(0, FM.n[1] - FM.n[0] + 1)); }
      u.bl--; cd = u.bl > 0 ? FM.gap : Math.max(FM.gap, cd * u.bn - (u.bn - 1) * FM.gap);
    }
    u.cds[i] = cd; u.revealT = Q.t + 1.6;
    if (!u.jet) u.face = Math.atan2(ty - u.y, tx - u.x);
    const b = { x: u.x, y: u.y, sx: u.x, sy: u.y, team: u.team, src: u, dmg: w.dmg, dt: w.dt, aoe: w.aoe || 0, t: 0, tgt: tg, tx, ty, safe: w.safe ? u.team : null };
    if (w.proj === 'bullet') Q.projs.push(Object.assign(b, { kind: 'bullet', dur: Math.max(.05, d / (w.beam ? 2400 : w.big ? 900 : 750)), acc: w.acc || .8, big: w.big, beam: w.beam, pierce: w.pierce }));
    else if (w.proj === 'shell') {
      const sc = (d * .03 + (tg ? 0 : 40) + (w.salvo ? 55 : 0)) * (w.prec || 1);   // prec: peluru berpemandu (CAESAR) jatuh lebih rapat
      for (let k = 0; k < (w.salvo || 1); k++) Q.projs.push(Object.assign({}, b, { kind: 'shell', tx: tx + rand(-sc, sc), ty: ty + rand(-sc, sc), dur: Math.max(.4, d / (w.spd || 420)), t: -k * .22 }));
    }
    else if (w.proj === 'missile') Q.projs.push(Object.assign(b, { kind: 'missile', spd: w.spd || 200, hdg: Math.atan2(ty - u.y, tx - u.x), life: 7, turn: w.dt === 'aa' ? 5 : 3, trail: [] }));
    else if (w.proj === 'bomb') {
      const sp = u.jet ? UT[u.type].spd : 0;
      Q.projs.push(Object.assign(b, { kind: 'bomb', dur: .9, tx: u.x + Math.cos(u.hdg) * sp * .9, ty: u.y + Math.sin(u.hdg) * sp * .9 }));
    }
    if (w.proj !== 'bomb') fx('muz', u.x + Math.cos(u.face) * 8, u.y + Math.sin(u.face) * 8, .12, 6);
  }

  function hurt(t, dmg, dt, src) {
    if (t.dead || t.chute > 0 || t.inV) return;   // penumpang terlindung di dalam kendaraan (ikut celaka saat kendaraannya hancur)
    if (src && src.player && t.team === 'B' && !t.player) return;   // operator tidak melukai kawan
    if (t === Q.hqR && Q.fb && !Q.fb.dead) { if (Q.t - (Q.shT || -9) > 8) { Q.shT = Q.t; bossEv('w_final_shield', Q.fb); } return; }   // markas kebal selama bos akhir hidup
    const m = (MU[dt] || MU.small)[t.armor]; if (!m) return;
    let a = dmg * m; if (t.armor === 'inf') a *= W.COVER[terAt(t.x, t.y)];
    if (t.cr) {   // CRAY: kebal peluru biasa; katana operator diproses khusus (duel / tangkis)
      if (t.vanish) return;
      if (war.blade && src && src.player) { a = crayBlade(t, dmg, src); if (a <= 0) return; }
      else { if (src && src.player) { crayProvoke(t, src); if ((dt === 'he' || dt === 'ap') && t.duel && !t.jf && dist(t, src) < 80 && (!t.act || t.act.k !== 'stun') && Math.random() < crK(CRAY.parE)) { crEv('deflB', t, { src, dt }); return; } } if (dt === 'small') { t.defl = Q.t; crEv('defl', t, { src }); const bk = CRAY.bullet[Q.diff]; if (!bk) return; a *= bk; } }   // duel: roket / ledakan operator kadang ditebas di udara (parE)
    }
    if (src && src.dmgK) a *= src.dmgK;
    if (src && t.tc === 'A' && src.team === 'B' && src.armor === 'inf' && !src.player && (dt === 'small' || dt === 'ap')) a = dmg * (dt === 'small' ? AAI.small : m) * aaK(t);   // tembakan prajurit ke heli / bos udara
    if (t.paintT > Q.t) a *= 1.5;   // dicat laser oleh operator anti-lapis baja
    if (src && src.weak) a *= DIFF[Q.diff].dmgR;   // MUDAH: infanteri kawan & musuh sama rata (tanpa bonus latihan)
    else if (src && src.team === 'B') a *= DMG_B * (src.elite ? 1.35 : 1) * (DIFF[Q.diff].dmgB || 1);   // elite: tank veteran garnisun markas
    else if (src && src.team === 'R') a *= DIFF[Q.diff].dmgR;   // MUDAH: tembakan musuh jauh lebih ringan
    if (t.team === 'B' && !t.weak) a *= TAKE_B;
    if (t.player) { if (war.hooks.hit) war.hooks.hit(t, a, src, Q.blast, dt); return; }   // pemain (mode FPS) mengurus nyawanya sendiri
    t.hp -= a; t.hitT = Q.t;
    if (t.hp <= 0) kill(t, src);
    if (src && src.player && war.hooks.struck) war.hooks.struck(t);   // operator: korban & rekan di dekatnya jadi waspada (belum tentu tahu posisinya)
  }
  function explode(x, y, r, dmg, dt, src, safe, hqK) {   // safe: tim yang tidak ikut terluka (peluru berpemandu); hqK: pengali damage ke markas
    fx('boom', x, y, .7, r * .6 + 10); Q.blast = true;
    for (const t of Q.units) {
      if (t.dead || (safe && t.team === safe)) continue; const d = Math.hypot(t.x - x, t.y - y); if (d > r + 10) continue;
      hurt(t, dmg * (1 - .6 * Math.min(1, d / (r + 10))) * (hqK && t.type === 'HQ' ? hqK : 1), dt, src);
    }
    Q.blast = false;
  }
  function kill(u, src) {
    if (u.dead) return;
    if (u.ctl && war.hooks.dying && war.hooks.dying(u, src)) return;   // Shadow Hunter pemain: jatuh berputar dulu, dihapus saat menghantam tanah (fps-heli)
    u.dead = true;
    if (u.pax && u.pax.length) for (const p of u.pax.slice()) war.unboard(p, .55);   // kendaraan hancur: penumpang terlempar keluar & terluka parah
    if (u.inV) { const v = u.inV; v.pax = v.pax.filter(p => p !== u); u.inV = null; }
    const T = UT[u.type];
    if (war.hooks.death) war.hooks.death(u, src);
    fx('boom', u.x, u.y, .9, 14 + T.sz * 8, { dead: u.type, alt: u.alt });
    if (u.tc !== 'A' && !T.struct && u.type !== 'INF' && u.type !== 'SF') fx('wreck', u.x, u.y, 25, 8);
    if (u.struct) fx('wreck', u.x, u.y, 40, 14 * T.sz);
    if (u.team === 'B') {
      if (!u.struct || u.type === 'HQ') { Q.stats.lost++; }
      if (u.type !== 'INF') L(Tt('w_lost', { unit: uname(u.type) }), 'c');
    } else { Q.stats.kills++; }
    if (u.boss) { bossEv(UT[u.type].final ? 'w_final_dead' : UT[u.type].raid ? 'w_raid_dead' : 'w_boss_dead', u); if (u.post) u.post.boss = null; }
    if (u.type === 'HQ') {
      Q.over = u.team === 'B' ? 'lose' : 'win';
      L(Tt(Q.over === 'win' ? 'w_win' : 'w_lose'), Q.over === 'win' ? 'i' : 'c'); TK.sfx(Q.over === 'win' ? 900 : 150, .6, 'sawtooth', .07);
    }
  }

  /* ---------------- VISIBILITAS ---------------- */
  // daftar unit hidup per tim (dibangun tiap langkah): pindai lawan/kawan saja, bukan semua unit — ratusan prajurit MUDAH tetap lancar
  const TL = {};
  function teams() { for (const k in TL) TL[k].length = 0; for (const u of Q.units) if (!u.dead) (TL[u.team] || (TL[u.team] = [])).push(u); }
  const foesOf = t => { const r = []; for (const k in TL) if (k !== t) r.push(TL[k]); return r; };
  function updateVis() {
    const us = Q.units; us.forEach(u => { u.seen.B = false; u.seen.R = false; }); teams();
    for (const a of us) {
      if (a.dead || a.inV) continue;
      for (const L2 of foesOf(a.team)) for (const b of L2) {
        if (b.dead || b.inV || b.seen[a.team]) continue;   // penumpang kendaraan tidak terlihat dari luar
        if (b.player && war.hooks.sees) { if (war.hooks.sees(a, b)) b.seen[a.team] = true; continue; }   // operator: deteksi realistis (garis pandang, kamuflase, cahaya)
        const r = b.revealT > Q.t ? Math.max(a.vis, 1400) : a.vis * b.stealth;
        if ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) <= r * r) { b.seen[a.team] = true; if (a.team === 'B' && b.struct) b.spotted = true; }
      }
    }
    // kabut perang (untuk gambar)
    const f = Q.fog, n = f.length; for (let i = 0; i < n; i++) if (f[i] === 2) f[i] = 1;
    for (const u of us) {
      if (u.dead || u.team !== 'B') continue;
      const r = u.vis / W.CELL, cx = u.x / W.CELL, cy = u.y / W.CELL;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(W.GH - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W.GW - 1, Math.ceil(cx + r)); x++)
          if ((x + .5 - cx) * (x + .5 - cx) + (y + .5 - cy) * (y + .5 - cy) <= r * r) f[y * W.GW + x] = 2;
    }
    Q.fogV++;
  }
  const visibleToB = u => u.team === 'B' || u.seen.B;

  /* ---------------- PERTEMPURAN ---------------- */
  /* prajurit pihak kita (infanteri, Kopassus, dll.) boleh menembaki heli & pesawat lambat dengan senapan/roket; damage diatur aaK() */
  const aaInf = (u, e, w) => e.tc === 'A' && !e.jet && u.team === 'B' && u.armor === 'inf' && !u.player && (w.dt === 'small' || w.dt === 'ap');
  const aaK = t => { const T = UT[t.type]; return T.final || T.raid ? AAI.final : T.boss ? AAI.mini : AAI.heli; };
  const AAI = { small: .6, heli: 1, mini: .6, final: .3 };   // small: kelipatan senapan vs lapis udara (bukan .25) · heli biasa penuh · mini bos −40% · bos SULIT/PRO −70%
  war.AAI = AAI;
  const valid = (u, e, w) => e && !e.dead && e.chute <= 0 && !e.vanish && (w.vs.includes(e.tc) || (e.lowA && w.dt === 'small') || aaInf(u, e, w)) && e.seen[u.team] && (!e.player || !war.hooks.knows || war.hooks.knows(u));   // operator: hanya musuh yang SENDIRI tahu posisinya (melihat / mendengar / diberi tahu rekan dekat)   // lowA: heli terbang rendah bisa ditembaki senjata ringan
  function acquire(u) {
    const ws = WS(u);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i]; if (w.manual) { u.tg[i] = null; continue; }
      let best = null, bd = 1e12;
      for (const L2 of foesOf(u.team)) for (const e of L2) {
        if (!valid(u, e, w)) continue;
        const d = (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y);
        if (d > w.rng * w.rng || d < (w.min || 0) * (w.min || 0) || d >= bd) continue;
        bd = d; best = e;
      }
      u.tg[i] = best;
    }
  }
  // tembak otomatis; mengembalikan true bila ada target dalam jangkauan
  function combat(u) {
    const T = UT[u.type], ws = WS(u); let eng = false;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i]; if (w.manual) continue;
      let tg = u.tg[i];
      if (u.order.k === 'attack' && valid(u, u.order.tgt, w) && dist(u, u.order.tgt) <= w.rng) tg = u.order.tgt;
      if (!valid(u, tg, w) || dist(u, tg) > w.rng * 1.02 || dist(u, tg) < (w.min || 0)) { u.tg[i] = null; continue; }
      eng = true;
      if (u.cds[i] > 0) continue;
      if (w.bombw) { // bom jet: hanya jika titik jatuh dekat target
        if (u.bombs < 1) continue;
        const ix = u.x + Math.cos(u.hdg) * T.spd * .9, iy = u.y + Math.sin(u.hdg) * T.spd * .9;
        if (Math.hypot(tg.x - ix, tg.y - iy) > 60) continue; u.bombs--;
      }
      fire(u, i, tg);
    }
    return eng;
  }
  function healTick(u, dt, h) {
    for (const f of TL[u.team] || []) {
      if (f === u || f.dead || f.struct || f.hp >= f.hpMax || !h.armors.includes(f.armor)) continue;
      if ((f.x - u.x) * (f.x - u.x) + (f.y - u.y) * (f.y - u.y) > h.rad * h.rad) continue;
      f.hp = Math.min(f.hpMax, f.hp + f.hpMax * h.rate * dt); f.healT = Q.t;
    }
  }
  const maxRange = u => WS(u).reduce((m, w) => w.manual ? m : Math.max(m, w.rng), 0);
  function goHome(u) { const G = u.guard; u.order = { k: 'move', x: G.x, y: G.y }; setPath(u, G.x, G.y); }   // garnisun markas kembali ke pos jaga
  /* sarang SMB: menembak hanya bila awaknya berada di sarang (berdiri di belakang senapan, ikut berputar); awak gugur / dipindah pemain →
     prajurit kawan terdekat (≤380 m) berlari menggantikan */
  function crewed(m, dt) {
    const c = m.crew;
    if (c && !c.dead && c.crewOf === m) {
      const on = Math.hypot(c.x - m.x, c.y - m.y) < 16;
      if (on) { c.x = m.x - Math.cos(m.face) * 1.7; c.y = m.y - Math.sin(m.face) * 1.7; c.face = c.hdg = m.face; c.path = []; c.order = { k: 'idle' }; }
      c.manning = on; return on;
    }
    m.crew = null; m.crewT = (m.crewT || 0) - dt; if (m.crewT > 0) return false; m.crewT = 2;
    let best = null, bd = 380;
    for (const f of TL[m.team] || []) {
      if (f.dead || f.player || f.ctl || f.chute > 0 || (f.type !== 'INF' && f.type !== 'SF') || (f.crewOf && !f.crewOf.dead)) continue;
      const d = dist(f, m); if (d < bd) { bd = d; best = f; }
    }
    if (best) { m.crew = best; best.crewOf = m; best.manning = false; best.stance = 'HOLD'; best.guard = { x: m.x, y: m.y, r: 40 }; best.order = { k: 'move', x: m.x, y: m.y }; setPath(best, m.x, m.y); }
    return false;
  }

  /* ---------------- WASPADA & MENCARI ----------------
     unit yang tertembak / melihat rekannya roboh / mendengar tembakan tapi BELUM melihat penembaknya tidak langsung tahu
     posisinya: kaget & menoleh ke sana-sini, lalu bergerak hati-hati (±55% kecepatan) menyisir titik-titik di sekitar
     perkiraan asal tembakan (x,y ± r), berhenti dan melihat sekeliling di tiap titik. Selesai (15–22 dtk sim ≈ 30–45 dtk nyata di mode FPS) = kembali ke tugas */
  war.alert = function (u, x, y, r) {
    if (u.boss && !u.dead) {   // bos tidak menyisir seperti prajurit (terikat pos): ia CURIGA — menoleh & bergeser ke perkiraan asal tembakan (bossTick), penglihatan melebar
      x = Math.max(30, Math.min(W.WW - 30, x)); y = Math.max(30, Math.min(W.WH - 30, y));
      const b = u.bsus; if (b && b.end > Q.t) { b.x = x; b.y = y; b.end = Math.max(b.end, Q.t + rand(10, 14)); } else u.bsus = { x, y, end: Q.t + rand(14, 20) };
      u.repath = 0; return;
    }
    if (u.dead || u.struct || u.boss || u.ctl || u.jet || u.fly || u.manning || u.chute > 0 || u.player) return;
    x = Math.max(30, Math.min(W.WW - 30, x)); y = Math.max(30, Math.min(W.WH - 30, y));
    const s = u.srch;
    if (s) { s.x = x; s.y = y; s.r = Math.min(s.r, r); s.end = Math.max(s.end, Q.t + rand(12, 18)); return; }
    u.srch = { x, y, r, end: Q.t + rand(15, 22), wait: rand(.6, 1.4), a: Math.atan2(y - u.y, x - u.x) + rand(-.8, .8), o: u.order, st: u.stance };
    u.path = [];
  };
  function search(u, dt) {
    const s = u.srch;
    if (Q.t > s.end) {
      u.srch = null; u.stance = s.st; u.order = s.o && s.o.k !== 'attack' && s.o.k !== 'follow' ? s.o : { k: 'idle' };
      if (u.order.x !== undefined) setPath(u, u.order.x, u.order.y); else u.path = [];
      return false;
    }
    if (s.wait > 0) {   // diam di tempat: menoleh kiri-kanan mencari asal tembakan
      s.wait -= dt; u.path = []; u.face = s.a + Math.sin(Q.t * 1.25 + u.id * 1.7) * 1.15; return true;
    }
    if (!u.path.length) {   // titik berikut untuk disisir: acak di sekitar perkiraan posisi penembak
      const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * s.r, x = Math.max(30, Math.min(W.WW - 30, s.x + Math.cos(a) * r)), y = Math.max(30, Math.min(W.WH - 30, s.y + Math.sin(a) * r));
      setPath(u, x, y); if (!u.path.length) { s.wait = rand(1.5, 3); s.a = rand(0, 6.283); return true; }
    }
    follow(u, dt * .55); u.face = u.hdg;
    if (!u.path.length) { s.wait = rand(1.8, 3.6); s.a = u.hdg; }
    return true;
  }

  /* ---------------- UPDATE UNIT ---------------- */
  function updateUnit(u, dt) {
    const T = UT[u.type];
    for (let i = 0; i < u.cds.length; i++) if (u.cds[i] > 0) u.cds[i] -= dt;
    if (u.inV) { const v = u.inV; if (v.dead) war.unboard(u, .55); else { u.x = v.x; u.y = v.y; u.hdg = v.hdg; u.path = []; return; } }   // penumpang: ikut kendaraan, tidak menembak
    if (u.player || u.ctl) return;   // digerakkan langsung oleh modul FPS (operator, Apache operator)
    if (u.manning && u.crewOf && !u.crewOf.dead) return;   // awak sarang SMB: menembak lewat senapan mesinnya, tidak berpindah
    if (u.chute > 0) { if (!u.ch0) u.ch0 = Math.max(u.chute, 3); u.chute -= dt * CHUTE_R; if (u.chute <= 0) { u.chute = 0; u.landT = Q.t; u.path = []; } return; }
    if (u.landT !== undefined && (Q.t - u.landT) / (Q.speed || 1) < LAND_T) { u.path = []; return; }   // baru mendarat: berlutut menahan benturan, berdiri, senapan diambil dari punggung
    if (u.stunT > Q.t && !u.jet) { u.path = []; return; }   // terkena granat kejut: tidak bisa bergerak/menembak
    u.acq -= dt;
    if (u.acq <= 0) { acquire(u); u.acq = .3; }
    if (T.heal) healTick(u, dt, T.heal);
    if (u.struct) { if (!T.crew || crewed(u, dt)) combat(u); return; }
    if (u.boss) { bossTick(u, dt, T); return; }
    if (u.lf && liftTick(u, dt)) return;
    if (u.ts && fwTick(u, dt, T)) return;
    if (u.life > 0 && u.order.k !== 'exit') { u.life -= dt; if (u.life <= 0) { u.order = { k: 'exit' }; if (u.team === 'B') L(Tt('w_exit', { unit: uname(u.type) }), 'i'); } }
    if (u.jet) { updateJet(u, dt, T); return; }
    if (u.order.k === 'exit') {
      const ex = u.team === 'B' ? -400 : W.WW + 400; u.path = [{ x: ex, y: u.y }]; follow(u, dt);
      if (u.x < -300 || u.x > W.WW + 300) u.dead = true; return;
    }
    const o = u.order, eng = combat(u);
    u.repath -= dt;
    if (u.srch && !eng && search(u, dt)) return;
    switch (o.k) {
      case 'move': if (!follow(u, dt)) u.order = { k: 'idle' }; break;
      case 'amove': if (!eng) {
        if (u.guard && Math.hypot(u.x - u.guard.x, u.y - u.guard.y) > u.guard.r) { goHome(u); break; }
        if (u.path.length === 1 && Math.hypot(u.path[0].x - u.x, u.path[0].y - u.y) < 30) u.path = [];   // cukup dekat: beberapa unit yang mengejar titik sama saling dorong & tak pernah tepat tiba
        if (!follow(u, dt)) u.order = { k: 'idle' };
      } break;
      case 'attack': {
        const tg = o.tgt;
        if (!tg || tg.dead || !tg.seen[u.team] && tg.team !== u.team) { u.order = { k: 'idle' }; break; }
        const w = WS(u).find(x => !x.manual && x.vs.includes(tg.tc));
        if (!w) { u.order = { k: 'idle' }; break; }
        const d = dist(u, tg);
        if (d > w.rng * .9) {
          if (u.repath <= 0 || !u.path.length) { const a = Math.atan2(u.y - tg.y, u.x - tg.x), r = w.rng * .8; setPath(u, tg.x + Math.cos(a) * r, tg.y + Math.sin(a) * r); }
          follow(u, dt);
        } else u.path = [];
        break;
      }
      case 'board': { // naik kendaraan operator: dekati, masuk bila kursi masih ada
        const v = o.v; if (!v || v.dead || seatsFree(v) <= 0) { u.order = { k: 'idle' }; if (war.hooks.board) war.hooks.board(u, null); break; }
        if (dist(u, v) < (o.r || 8)) { war.board(u, v); break; }
        if (u.repath <= 0 || !u.path.length) { setPath(u, v.x, v.y); u.repath = 1; if (!u.path.length) u.path = [{ x: v.x, y: v.y }]; }   // satu sel peta dengan kendaraan: A* tidak memberi rute → langsung
        follow(u, dt); break;
      }
      case 'follow': { // ikuti unit lain (regu pengawal operator)
        const tg = o.tgt; if (!tg || tg.dead) { u.order = { k: 'idle' }; break; }
        const d = dist(u, tg), want = o.dist || 70;
        if (d > want) {
          if (u.repath <= 0 || !u.path.length) { const a = (tg.hdg || 0) + Math.PI + (o.ang || 0); setPath(u, tg.x + Math.cos(a) * want * .5, tg.y + Math.sin(a) * want * .5); u.repath = 1.4; }
          follow(u, dt);
        } else u.path = [];
        break;
      }
      case 'ground': { // tembak titik (artileri / kapal / lainnya)
        const w = T.w.find(x => x.arc), d = Math.hypot(o.x - u.x, o.y - u.y);
        if (!w) { u.order = { k: 'amove', x: o.x, y: o.y }; setPath(u, o.x, o.y); break; }
        if (d > w.rng * .97) { if (u.repath <= 0 || !u.path.length) { const a = Math.atan2(u.y - o.y, u.x - o.x); setPath(u, o.x + Math.cos(a) * w.rng * .9, o.y + Math.sin(a) * w.rng * .9); } follow(u, dt); }
        else { u.path = []; const i = T.w.indexOf(w); if (d >= (w.min || 0) && u.cds[i] <= 0) { fire(u, i, null, o.x + rand(-45, 45), o.y + rand(-45, 45)); } }
        break;
      }
      default: { // idle
        if (T.heal) { // paramedis dan perbaikan: cari kawan yang terluka
          if (u.stance === 'AGGR' && u.repath <= 0) {
            u.repath = 1.2; let best = null, bd = 1100;
            for (const f of Q.units) {
              if (f === u || f.dead || f.team !== u.team || f.struct || f.hp >= f.hpMax * .97 || !T.heal.armors.includes(f.armor)) continue;
              const d = dist(u, f); if (d < bd && d > T.heal.rad * .5) { bd = d; best = f; }
            }
            if (best) { u.order = { k: 'move', x: best.x, y: best.y }; setPath(u, best.x, best.y); }
          }
        } else if (u.stance === 'AGGR' && !eng && T.spd > 0 && u.repath <= 0) {
          u.repath = 1.2; const G = u.guard, mr = G ? 1e9 : maxRange(u) * 1.35 + 80; let best = null, bd = 1e12;
          for (const e of Q.units) {
            if (e.team === u.team || e.dead || !e.seen[u.team] || !WS(u).some(w => !w.manual && w.vs.includes(e.tc))) continue;
            if (e.player && war.hooks.knows && !war.hooks.knows(u)) continue;
            if (e.tc === 'A' && !u.fly) continue;
            if (G && Math.hypot(e.x - G.x, e.y - G.y) > G.r + maxRange(u) * .8) continue;   // garnisun markas: hanya menyambut lawan yang mendekati markas
            const d = dist(u, e); if (d < mr && d < bd) { bd = d; best = e; }
          }
          if (best) { u.order = { k: 'amove', x: best.x, y: best.y }; setPath(u, best.x, best.y); }
          else if (G && Math.hypot(u.x - G.x, u.y - G.y) > 40) goHome(u);   // kembali ke pos jaga
          else if (G && u.pad0 && !u.lf) { u.parkT = (u.parkT || 0) + 1.2; if (u.parkT >= 4.8) { u.parkT = 0; u.alt = cruiseAlt(u); u.rotK = 1; u.rph = 0; u.lf = { ph: 'land', t: 0 }; } }   // heli garnisun tanpa tugas: mendarat lagi di helipad
          if (best) u.parkT = 0;
        }
      }
    }
  }

  /* ---------------- NAIK / TURUN KENDARAAN ----------------
     pasukan operator menumpang kendaraan operator (v.seats = jumlah kursi termasuk pengemudi; kursi pengemudi selalu milik operator).
     Penumpang (u.inV) ikut posisi kendaraan, tersembunyi, tidak menembak & tidak bisa dilukai; kendaraan hancur = semua terlempar keluar & terluka. */
  const seatsFree = v => (v.seats || 0) - 1 - (v.pax ? v.pax.length : 0);
  war.seatsFree = seatsFree;
  war.board = function (u, v) {
    if (!u || u.dead || u.inV || !v || v.dead || seatsFree(v) <= 0) return false;
    (v.pax || (v.pax = [])).push(u); u.inV = v; u.path = []; u.order = { k: 'idle' }; u.srch = null;
    if (war.hooks.board) war.hooks.board(u, v);
    return true;
  };
  war.unboard = function (u, hurtK) {   // hurtK: bagian HP yang hilang (kendaraan hancur)
    const v = u.inV; if (!v) return false;
    v.pax = (v.pax || []).filter(p => p !== u); u.inV = null;
    const i = v.pax.length, a = (v.hdg || 0) + (i % 2 ? 1.57 : -1.57) + (i >> 1) * .5 + Math.PI * (i > 3 ? 1 : 0), r = (v.tc === 'A' ? 5 : 3.6) + (i >> 2) * 1.6;
    u.x = v.x + Math.cos(a) * r; u.y = v.y + Math.sin(a) * r; u.hdg = u.face = v.hdg || 0; u.order = { k: 'idle' }; u.path = [];
    if (v.paxAir) { u.chute = 3 + rand(0, 1); fx('chute', u.x, u.y, u.chute, 0, { u }); }   // keluar dari pesawat yang terbang: terjun payung
    if (hurtK) { u.hp -= u.hpMax * hurtK; u.hitT = Q.t; if (u.hp <= 0) kill(u, null); }
    return true;
  };

  function aimJet(u, dt) {
    const o = u.order;
    if (o.k === 'exit') {
      const ex = u.team === 'B' ? -500 : W.WW + 500; steerJet(u, ex, u.y, dt, 1.4);
      if (u.x < -450 || u.x > W.WW + 450) u.dead = true; return;
    }
    if (o.k === 'bombrun') {
      const along = (u.x - o.x) * o.dx + (u.y - o.y) * o.dy, lat = -(u.x - o.x) * o.dy + (u.y - o.y) * o.dx;
      steerJet(u, o.x + o.dx * 1500, o.y + o.dy * 1500, dt, 1.2);
      o.nd -= dt;
      if (o.left > 0 && Math.abs(along) < 170 && Math.abs(lat) < 200 && o.nd <= 0) {
        const wi = UT[u.type].w.findIndex(w => w.bombw || w.manual);
        fire(u, wi, null, 0, 0); const p = Q.projs[Q.projs.length - 1]; if (p) { p.tx += -o.dy * rand(-45, 45); p.ty += o.dx * rand(-45, 45); }
        o.left--; if (u.type !== 'BMB') u.bombs = Math.max(0, u.bombs - 1); o.nd = u.type === 'BMB' ? .18 : .45;
      }
      if (o.left <= 0 || along > 420) { u.order = u.type === 'BMB' ? jetRun(u, o.x, o.y) : { k: 'cap', x: o.x, y: o.y, r: 380 }; }
      return;
    }
    // cap / attack
    let ax, ay;
    let tg = o.k === 'attack' && !o.tgt.dead ? o.tgt : null;
    if (!tg && u.type === 'FGT') { // cegat pesawat musuh yang terlihat
      let bd = 2800; for (const e of Q.units) if (e.team !== u.team && !e.dead && e.tc === 'A' && e.seen[u.team]) { const d = dist(u, e); if (d < bd) { bd = d; tg = e; } }
    }
    if (tg) { ax = tg.x; ay = tg.y; }
    else if (Math.hypot(u.x - o.x, u.y - o.y) > o.r + 80) { ax = o.x; ay = o.y; }
    else { const a = Math.atan2(u.y - o.y, u.x - o.x) + .7; ax = o.x + Math.cos(a) * o.r; ay = o.y + Math.sin(a) * o.r; }
    steerJet(u, ax, ay, dt, 1.8);
  }
  function updateJet(u, dt) {
    const mb = UT[u.type].bombs || 0; if (mb) u.bombs = Math.min(mb, u.bombs + dt / 5);   // senjata diisi ulang terus
    if (u.order.k === 'idle') u.order = { k: 'cap', x: u.x, y: u.y, r: 380 };
    if (u.order.k === 'attack') {
      const t = u.order.tgt;
      if (t.dead) u.order = { k: 'cap', x: u.x, y: u.y, r: 380 }; else if (t.tc !== 'A') u.order = jetRun(u, t.x, t.y);
    }
    aimJet(u, dt);
    if (UT[u.type].w.some(w => !w.manual)) combat(u);
  }
  function jetRun(u, x, y) {
    const a = Math.atan2(y - u.y, x - u.x);
    return { k: 'bombrun', x, y, dx: Math.cos(a), dy: Math.sin(a), left: u.type === 'BMB' ? UT.BMB.bombs : Math.min(2, Math.floor(u.bombs)), nd: 0 };
  }

  /* ---------------- PROYEKTIL ---------------- */
  function pierceHit(p) {   // peluru railgun menembus: lawan darat (bukan operator, bukan sasaran utama) dalam 2,5 m dari garis tembak kena p.dmg × p.pierce
    const L = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1, ux = (p.tx - p.sx) / L, uy = (p.ty - p.sy) / L;
    for (const L2 of foesOf(p.team)) for (const e of L2) {
      if (e === p.tgt || e.dead || e.player || e.fly || e.jet || e.inV) continue;
      const dx = e.x - p.sx, dy = e.y - p.sy, a = dx * ux + dy * uy; if (a < 0 || a > L) continue;
      if (Math.abs(dx * uy - dy * ux) < 2.5) { hurt(e, p.dmg * p.pierce, p.dt, p.src); fx('spark', e.x, e.y, .25, 5); }
    }
  }
  function updateProjs(dt) {
    for (const p of Q.projs) {
      p.t += dt;
      if (p.kind === 'bullet') {
        if (p.t >= p.dur) {
          p.done = true;
          if (p.pierce) pierceHit(p);   // railgun: menembus semua lawan darat di sepanjang lintasan
          if (p.tgt && !p.tgt.dead && Math.random() < p.acc) { if (p.aoe) explode(p.tgt.x, p.tgt.y, p.aoe, p.dmg, p.dt, p.src); else hurt(p.tgt, p.dmg, p.dt, p.src); if (!p.aoe) fx('spark', p.tgt.x, p.tgt.y, .25, 5); }
          else fx('spark', p.tx + rand(-14, 14), p.ty + rand(-14, 14), .2, 3);
        } else { const k = p.t / p.dur; p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; }
      } else if (p.kind === 'shell' || p.kind === 'bomb') {
        if (p.t < 0) continue;
        const k = Math.min(1, p.t / p.dur); p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.h = Math.sin(Math.PI * k) * (p.kind === 'shell' ? 1 : .4);
        if (k >= 1) { p.done = true; explode(p.tx, p.ty, p.aoe, p.dmg, p.dt, p.src, p.safe); TK.sfx(110, .15, 'sawtooth', .02); }
      } else if (p.kind === 'missile') {
        const tg = p.tgt && !p.tgt.dead ? p.tgt : null, ax = tg ? tg.x : p.tx, ay = tg ? tg.y : p.ty;
        p.hdg += clamp(wrapPi(Math.atan2(ay - p.y, ax - p.x) - p.hdg), -p.turn * dt, p.turn * dt);
        p.x += Math.cos(p.hdg) * p.spd * dt; p.y += Math.sin(p.hdg) * p.spd * dt;
        p.trail.push([p.x, p.y]); if (p.trail.length > 12) p.trail.shift();
        if (tg && Math.hypot(tg.x - p.x, tg.y - p.y) < Math.max(16, p.spd * dt)) {
          p.done = true; if (p.aoe) explode(tg.x, tg.y, p.aoe, p.dmg, p.dt, p.src); else { hurt(tg, p.dmg, p.dt, p.src); fx('boom', tg.x, tg.y, .4, 12); }
        } else if (!tg && Math.hypot(ax - p.x, ay - p.y) < 20) { p.done = true; fx('boom', p.x, p.y, .3, 8); }
        else if (p.t > p.life) p.done = true;
      }
    }
    Q.projs = Q.projs.filter(p => !p.done);
  }

  /* ---------------- OBJEKTIF ---------------- */
  function updateObjs(dt) {
    for (const o of Q.objs) {
      let nb = 0, nr = 0;
      for (const u of Q.units) {
        if (u.dead || u.struct || u.tc !== 'G' || u.chute > 0 || Math.hypot(u.x - o.x, u.y - o.y) > o.r) continue;
        if (u.team === 'B') nb++; else nr++;
      }
      const lock = o.boss && !o.boss.dead;   // pos PROFESIONAL: kalahkan mini bosnya dulu
      if (lock && nb && Q.t - (o.lockT || -99) > 15) { o.lockT = Q.t; bossEv('w_boss_lock', o.boss, { o: o.name }); }
      if (nb && !nr && !lock) o.prog = Math.min(1, o.prog + .07 * dt * Math.min(nb, 4));
      else if (nr && !nb) o.prog = Math.max(-1, o.prog - .07 * dt * Math.min(nr, 4));
      const old = o.owner;
      if (o.owner === 'B' && o.prog <= 0) o.owner = 'N'; else if (o.owner === 'R' && o.prog >= 0) o.owner = 'N';
      if (o.owner === 'N') { if (o.prog >= 1) o.owner = 'B'; else if (o.prog <= -1) o.owner = 'R'; }
      if (o.owner !== old && o.owner !== 'N') { L(Tt('w_objcap', { o: o.name, who: Tt('w_own_' + o.owner) }), o.owner === 'B' ? 'i' : 'c'); TK.sfx(o.owner === 'B' ? 800 : 300, .2); }
    }
  }

  /* ---------------- PENGIRIMAN (DEPLOY) ---------------- */
  const popB = () => Q.units.filter(u => u.team === 'B' && !u.struct && !u.dead && !u.sat).length + Q.pend.length;   // satgas serbu otomatis tidak memakan jatah pemain
  function inZone(x, y) {
    if (Math.hypot(x - Q.hqB.x, y - Q.hqB.y) < 560) return true;
    return Q.objs.some(o => o.owner === 'B' && Math.hypot(x - o.x, y - o.y) < 340);
  }
  war.deployCheck = function (type, x, y) {
    const T = UT[type], g = Q.g;
    if (x < 0 || y < 0 || x > W.WW || y > W.WH) return { ok: false, msg: 'w_e_out' };
    if (T.cat === 'A') return { ok: true, mode: 'air', cost: T.cost, eta: T.dep };
    const ter = terAt(x, y);
    if (T.cat === 'S') {
      if (ter !== W.TER.WATER || x > 1900) return { ok: false, msg: 'w_e_sea' };
      return { ok: true, mode: 'sea', cost: T.cost, eta: T.dep };
    }
    if (ter === W.TER.WATER) return { ok: false, msg: 'w_e_water' };
    if (inZone(x, y)) return { ok: true, mode: 'normal', cost: T.cost, eta: T.dep };
    if (T.drop) return { ok: true, mode: 'drop', cost: Math.round(T.cost * DROP_COST), eta: Math.round(6 + Math.hypot(x, y - Q.hqB.y) / 110 + T.dep * .3) };
    return { ok: false, msg: 'w_e_zone' };
  };
  war.deploy = function (type, x, y) {
    if (Q.over) return { ok: false, msg: 'w_e_over' };
    const c = war.deployCheck(type, x, y); if (!c.ok) return c;
    if (Q.cr < c.cost) return { ok: false, msg: 'w_e_cr' };
    if (popB() >= POP_CAP) return { ok: false, msg: 'w_e_pop' };
    Q.cr -= c.cost; Q.stats.dep++;
    const p = { type, x, y, mode: c.mode, t: c.eta, t0: c.eta, id: Q.nextId++ };
    Q.pend.push(p);
    if (c.mode === 'drop') fx('plane', -80, y, c.eta, 0, { x1: x, y1: y, x0: -80 });
    L(Tt(c.mode === 'drop' ? 'w_drop' : 'w_dep', { unit: uname(type), s: c.eta }), 'i'); TK.sfx(700, .08);
    return { ok: true, c };
  };
  function finishDeploy(p) {
    const T = UT[p.type], hq = Q.hqB, ex = -60;
    if (p.mode === 'normal' || p.mode === 'drop') {
      const u = mk('B', p.type, p.x + rand(-14, 14), p.y + rand(-14, 14)); if (p.mode === 'drop') { u.chute = 3.5; fx('chute', u.x, u.y, 3.5, 0, { u }); }
    } else if (p.mode === 'sea') mk('B', p.type, p.x, p.y);
    else if (T.jet) { // jet tempur, pesawat serang, pembom: terbang dari tepi barat
      const u = mk('B', p.type, ex, hq.y + rand(-200, 200), { hdg: 0 });
      u.order = p.type === 'BMB' ? jetRun(u, p.x, p.y) : { k: 'cap', x: p.x, y: p.y, r: 380 };
    } else { // helikopter dan drone: lepas landas dari markas
      const u = mk('B', p.type, hq.x + rand(-40, 40), hq.y + rand(-40, 40));
      u.order = { k: T.w.length ? 'amove' : 'move', x: p.x, y: p.y }; u.path = [{ x: p.x, y: p.y }];
      if (GEARH[p.type] && !(war.hooks.roofAt && war.hooks.roofAt(u.x, u.y))) park(u, 'spin');   // lepas landas dari markas: rotor berputar dulu
    }
    TK.sfx(500, .08);
  }

  /* ---------------- PERINTAH ---------------- */
  function spiral(i) { if (!i) return [0, 0]; const r = 26 * Math.ceil(Math.sqrt(i)), a = i * 2.4; return [Math.cos(a) * r, Math.sin(a) * r]; }
  // diberi perintah pemain: lepas dari tali jaga markas / tugas awak sarang SMB (diganti prajurit lain)
  const mine = us => us.filter(u => u && !u.dead && u.team === 'B' && !u.struct && !u.sat).map(u => { u.guard = null; if (u.crewOf) { u.crewOf = null; u.manning = false; } return u; });
  war.cmdMove = function (us, x, y, amove) {
    mine(us).forEach((u, i) => {
      const o = spiral(i), ox = x + o[0], oy = y + o[1];
      if (u.jet) u.order = { k: 'cap', x: ox, y: oy, r: 380 };
      else { u.order = { k: amove ? 'amove' : 'move', x: ox, y: oy }; setPath(u, ox, oy); }
    });
  };
  war.cmdAttack = function (us, tg) {
    mine(us).forEach(u => { if (u.jet && tg.tc !== 'A') u.order = jetRun(u, tg.x, tg.y); else { u.order = { k: 'attack', tgt: tg }; u.path = []; } });
  };
  war.cmdStop = us => mine(us).forEach(u => { u.path = []; u.order = u.jet ? { k: 'cap', x: u.x, y: u.y, r: 380 } : { k: 'idle' }; });
  war.cmdGround = function (us, x, y) {
    mine(us).forEach((u, i) => {
      const o = spiral(i);
      if (u.jet) u.order = jetRun(u, x + o[0], y + o[1]);
      else if (UT[u.type].w.some(w => w.arc)) u.order = { k: 'ground', x: x + o[0] * 2, y: y + o[1] * 2 };
      else { u.order = { k: 'amove', x, y }; setPath(u, x, y); }
    });
  };
  war.cmdStance = (us, st) => mine(us).forEach(u => { u.stance = st; });

  /* ---------------- AI MUSUH ---------------- */
  function ai(dt) {
    Q.aiT -= dt; if (Q.aiT > 0) return; Q.aiT = 3;
    const R = Q.units.filter(u => u.team === 'R' && !u.struct && !u.dead);
    const D = DIFF[Q.diff], pk = war.popK || 1, pop = Math.round(D.pop * pk);   // popK < 1 = pertempuran lebih kecil (edisi offline di HP)
    let bought = 0;
    if (D.inf) {   // MUDAH: hanya prajurit darat, datang bergerombol (150–250 orang) dari markas musuh
      Q.waveT -= 3;
      if (Q.waveT <= 0 && Q.t > 20) {
        Q.waveT = D.waveT; const n = Math.min(Math.round(rand(D.wave[0], D.wave[1]) * pk), pop - R.length);
        if (n > 0) { Q.waveQ = (Q.waveQ || 0) + n; L(Tt('w_wave_inf', { n }), 'c'); }   // dikeluarkan bertahap oleh spawnWave()
      }
    }
    while (!D.inf && Q.t > 25 && bought < 3 && R.length + bought + Q.fac.q.length < pop) {
      const t = Q.t, pool = [['INF', 26], ['MEDIC', 3], ['AT', 8], ['MORT', 4], ['TANK', 16], ['LTANK', 10], ['IFV', 14], ['ARTY', 5], ['AA', 5], ['ZSU', 4], ['SF', 6], ['JEEP', Q.diff >= 2 ? 8 : 0],
        ['MLRS', t > 200 ? 4 : 0], ['HELI', t > 120 ? 7 : 0], ['ATK2', t > 220 ? 6 : 0], ['UCAV', t > 180 ? 4 : 0], ['FGT', t > 200 ? 6 : 0], ['CAS', t > 260 ? 5 : 0], ['BMB', t > 320 ? 4 : 0], ['UFO', t > D.ufoT ? (Q.diff > 1 ? 4 : 2) : 0]];
      if (war.fpsMode) pool.forEach(p => { const m = FPSW[p[0]]; if (m) p[1] *= m; });   // saat ada operator FPS: musuh lebih banyak infanteri, lebih sedikit lapis baja
      let r = rand(0, pool.reduce((a, p) => a + p[1], 0)), type = 'INF';
      for (const p of pool) { r -= p[1]; if (r <= 0) { type = p[0]; break; } }
      if (Q.crR < UT[type].cost) break;
      Q.crR -= UT[type].cost; spawnRed(type); bought++;
    }
    // luncurkan gelombang
    const rally = R.filter(u => u.rally), size = D.inf ? 12 : Math.min(18, 5 + Math.floor(Q.t / 120) + Q.diff * 3);
    if (rally.length >= size || (rally.length >= 3 && rally.some(u => Q.t - u.born > 70))) {
      const tg = redTarget(); L(Tt('w_wave'), 'c'); TK.sfx(400, .3, 'sawtooth', .05);
      // rombongan besar: satu rute A* bersama dari titik kumpul, tiap prajurit hanya beda titik akhir (ratusan A* sekaligus = patah-patah)
      let lead = null;
      if (rally.length > 20) { lead = { x: 0, y: 0, type: 'INF' }; rally.forEach(u => { lead.x += u.x / rally.length; lead.y += u.y / rally.length; }); setPath(lead, tg.x, tg.y); if (!lead.path.length) lead = null; }
      rally.forEach((u, i) => {
        u.rally = false; const o = spiral(i); u.order = { k: 'amove', x: tg.x + o[0], y: tg.y + o[1] };
        if (lead) { u.path = lead.path.map(q => ({ x: q.x, y: q.y })); u.path[u.path.length - 1] = { x: tg.x + o[0], y: tg.y + o[1] }; } else setPath(u, tg.x + o[0], tg.y + o[1]);
      });
    }
    // unit menganggur -> serang lagi
    const tg = redTarget();
    R.forEach(u => {
      if (!u.jet || u.team !== 'R') return;
      if (u.type === 'BMB') { if (u.order.k === 'bombrun' && Math.hypot(u.order.x - tg.x, u.order.y - tg.y) > 250) u.order = jetRun(u, tg.x, tg.y); return; }
      if (u.order.k === 'cap') { // cari sasaran darat milik kita yang terlihat
        let best = null, bd = 1e12; for (const e of Q.units) if (e.team === 'B' && !e.dead && e.tc === 'G' && e.seen.R) { const d = dist(u, e); if (d < bd) { bd = d; best = e; } }
        if (best) u.order = jetRun(u, best.x, best.y);
      }
    });
    R.forEach(u => { if (!u.rally && !u.garr && !u.jet && u.order.k === 'idle' && UT[u.type].spd > 0 && u.stance !== 'HOLD') { u.order = { k: 'amove', x: tg.x, y: tg.y }; setPath(u, tg.x, tg.y); } });
  }
  function redTarget() {
    let best = null, bd = 1e12;
    for (const o of Q.objs) if (o.owner !== 'R') { const d = dist(o, Q.hqR); if (d < bd) { bd = d; best = o; } }
    return best || Q.hqB;
  }
  function spawnWave() {   // gerombolan keluar 20 orang per langkah (±0,5 dtk untuk 250 orang) agar tidak ada lonjakan
    if (!Q.waveQ) return;
    const k = Math.min(20, Q.waveQ); Q.waveQ -= k;
    for (let i = 0; i < k; i++) { const r = Math.random(); spawnRed(r < .1 ? 'SF' : r < .2 ? 'MEDIC' : 'INF', true); }
  }
  function spawnRed(type, crowd) {
    const T = UT[type], h = Q.hqR, tg = redTarget();
    if (T.cat === 'A' && type !== 'UFO') {   // heli dari helipad, pesawat & drone bersayap dari hanggar
      Q.fac.q.push({ type, kind: GEARH[type] ? 'pad' : 'han' });
      if (type !== 'UAV' && type !== 'UCAV') L(Tt('w_wave_air'), 'c');
      return;
    }
    if (T.cat === 'G' && T.armor !== 'inf' && !crowd) { Q.fac.q.push({ type, kind: 'gar' }); return; }   // kendaraan darat keluar dari garasi
    if (T.cat === 'G') {
      const u = mk('R', type, h.x - rand(100, 280), h.y + rand(-260, 260));
      if (crowd) u.born -= 60;   // rombongan besar langsung siap berangkat
      if (u.stance === 'HOLD') u.stance = 'AGGR';
      u.rally = true; const rx = h.x - 520 + rand(-60, 60), ry = h.y + rand(-220, 220); u.order = { k: 'move', x: rx, y: ry }; setPath(u, rx, ry);
    } else if (T.fly) { const u = mk('R', type, W.WW + 40, h.y + rand(-250, 250)); u.order = { k: 'amove', x: tg.x, y: tg.y }; u.path = [{ x: tg.x, y: tg.y }]; }
    else if (type === 'BMB') { const u = mk('R', type, W.WW + 40, h.y + rand(-100, 100)); u.order = jetRun(u, tg.x, tg.y); }
    else { const u = mk('R', type, W.WW + 40, h.y + rand(-250, 250)); const o = pick(Q.objs); u.order = { k: 'cap', x: o.x + 200, y: o.y, r: 380 }; }
    if (type === 'UFO') { L(Tt('w_ufo'), 'c'); TK.sfx(180, .5, 'sine', .06); }
    else if (T.cat === 'A' && type !== 'UAV' && type !== 'UCAV') L(Tt('w_wave_air'), 'c');
  }

  /* ---------------- KELUAR DARI PANGKALAN ----------------
     Kendaraan: pintu garasi terbuka, menyetir keluar, lalu ke titik kumpul.
     Heli: muncul di helipad dengan rotor diam, berputar, naik tegak, lalu berangkat. Berlaku untuk kedua pihak (u.lf).
     Pesawat: pintu hanggar terbuka, taksi ke ujung landasan, menunggu, lari lepas landas, roda terlipat, menanjak (u.ts).
     Selama di darat unit udara dianggap sasaran darat (tc 'G'); u.alt menyimpan tinggi sampai mencapai ketinggian jelajah. Satuan waktu = detik sim. */
  const LIFT = { spin: 2.4, rise: 1.6, hop: 9, climb: 8, land: 7, down: 3 }, DOOR_T = 1.1, TAXI = 34;
  const GEARH = { HELI: 1.27, MEDHELI: 1.27, ATK2: 1.78 }, GEARF = { FGT: 2.1, CAS: 2, BMB: 3.6, UCAV: 1.1 };   // tinggi badan pesawat saat roda menapak (m)
  const cruiseAlt = u => u.jet ? 150 + (u.id % 7) * 12 : (u.type === 'UAV' || u.type === 'UCAV') ? 110 : 36 + (u.id % 5) * 4;   // sama dengan F.altOf
  function park(u, ph) {
    u.lf = { ph, t: 0 }; u.alt = GEARH[u.type] || 1.3; u.rotK = 0; u.rph = 0; u.tc = 'G'; u.lowA = false;
    u.gzS = undefined;
  }
  function air(u) { u.tc = UT[u.type].tc; u.lowA = true; }
  war.unpark = u => liftDone(u);
  function liftDone(u) { u.lf = null; u.alt = undefined; u.rotK = undefined; u.rph = undefined; u.lowA = false; u.tc = UT[u.type].tc; }
  function padThreat(u) {   // garnisun yang parkir: ada lawan terlihat yang mendekati markas?
    const G = u.guard; if (!G) return true;
    u.ck = (u.ck || 0) - .1; if (u.ck > 0) return false; u.ck = 1.2 + (u.id % 4) * .1;
    const R = maxRange(u) * .8 + G.r;
    for (const L2 of foesOf(u.team)) for (const e of L2) { if (e.struct || e.dead || !e.seen[u.team] || Math.hypot(e.x - G.x, e.y - G.y) > R) continue; if (WS(u).some(w => !w.manual && (w.vs.includes(e.tc)))) return true; }
    return false;
  }
  function liftTick(u, dt) {   // true = belum boleh bergerak/menembak
    const L0 = u.lf, wk = dt / (Q.speed || 1);
    L0.t += dt;
    if (L0.ph === 'cold') {
      L0.ck = (L0.ck || 0) - dt;
      if (L0.ck <= 0) { L0.ck = .1; if (!u.guard || u.order.k !== 'idle' || padThreat(u)) { L0.ph = 'spin'; L0.t = 0; } }
      return true;
    }
    if (L0.ph === 'spin') {
      const k = Math.min(1, L0.t / LIFT.spin); u.rotK = k; u.rph += 31 * k * k * wk;
      if (k >= 1) { L0.ph = 'rise'; L0.t = 0; L0.a0 = u.alt; }
      return true;
    }
    u.rotK = L0.ph === 'down' ? u.rotK : 1;
    if (L0.ph === 'down') {
      const k = Math.max(0, 1 - L0.t / LIFT.down); u.rotK = k; u.rph += 31 * k * k * wk;
      if (u.guard && (u.order.k !== 'idle' || padThreat(u))) { L0.ph = 'spin'; L0.t = LIFT.spin * k; return true; }
      if (k <= 0) { L0.ph = 'cold'; L0.t = 0; L0.ck = 0; u.rotK = 0; }
      return true;
    }
    u.rph += 31 * wk;
    if (L0.ph === 'rise') {
      const k = Math.min(1, L0.t / LIFT.rise), e = k * k * (3 - 2 * k); u.alt = L0.a0 + LIFT.hop * e;
      if (k >= 1) { L0.ph = 'climb'; air(u); }
      return true;
    }
    if (L0.ph === 'climb') { u.alt += LIFT.climb * dt; if (u.alt >= cruiseAlt(u)) liftDone(u); return false; }
    if (L0.ph === 'land') {
      const G = u.guard; if (!G || u.order.k !== 'idle' || padThreat(u)) { L0.ph = 'climb'; air(u); return false; }
      const gh = GEARH[u.type] || 1.3, dx = G.x - u.x, dy = G.y - u.y, d = Math.hypot(dx, dy);
      if (d > .5) { const st = Math.min(d, 9 * dt); u.x += dx / d * st; u.y += dy / d * st; }
      u.alt = Math.max(gh, u.alt - LIFT.land * dt * Math.min(1, .25 + (u.alt - gh) / 12));
      if (u.alt - gh < 6) { u.tc = 'G'; u.lowA = false; }
      if (u.alt <= gh + .01 && d < 1) { L0.ph = 'down'; L0.t = 0; u.path = []; }
      return true;
    }
    return false;
  }
  function fwTick(u, dt, T) {   // pesawat di pangkalan
    const S = u.ts, F0 = Q.fac, ACC = u.type === 'BMB' ? 16 : u.type === 'CAS' ? 22 : u.type === 'UCAV' ? 14 : 30, rw = -Math.PI / 2;
    const fwd = v => { u.x += Math.cos(u.hdg) * v * dt; u.y += Math.sin(u.hdg) * v * dt; };
    if (S.ph === 'park') return true;   // parkir di apron (revetment): menunggu jadwal sorti
    if (S.ph === 'bay') { S.t -= dt; if (S.t <= 0) S.ph = 'taxi'; return true; }
    if (S.ph === 'taxi') {
      const p = S.wp[0], dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
      if (d < 7) { S.wp.shift(); if (!S.wp.length) { S.ph = 'hold'; S.v = 0; S.t = 1.4; } return true; }
      const e = wrapPi(Math.atan2(dy, dx) - u.hdg), tr = 1.6 * dt; u.hdg = wrapPi(u.hdg + Math.max(-tr, Math.min(tr, e)));
      const tgt = Math.abs(e) > .2 ? 11 : S.wp.length === 1 ? 14 : TAXI; S.v += Math.max(-26 * dt, Math.min(14 * dt, tgt - S.v));
      fwd(S.v); return true;
    }
    if (S.ph === 'hold') {
      const e = wrapPi(rw - u.hdg); u.hdg = wrapPi(u.hdg + Math.max(-dt, Math.min(dt, e)));
      S.t -= dt; if (S.t <= 0 && Q.t >= F0.rwT && Math.abs(e) < .03) { S.ph = 'roll'; S.v = 0; F0.rwT = Q.t + 6; }
      return true;
    }
    u.x += (F0.run.x - u.x) * Math.min(1, dt * 1.5);
    if (S.ph === 'roll') {
      S.v += ACC * dt; fwd(S.v);
      if (S.v >= T.spd * .62) { S.ph = 'lift'; air(u); }
      return true;
    }
    const cr = cruiseAlt(u), vz = u.type === 'BMB' ? 13 : 22;
    S.pit = Math.min(u.type === 'BMB' ? .12 : .2, (S.pit || 0) + dt * .16);
    u.alt = Math.min(cr, u.alt + vz * Math.min(1, S.pit / .12) * dt);
    if (u.alt > (S.g0 + 5)) u.gearK = Math.max(0, u.gearK - dt * .55);
    if (S.ph === 'lift') {
      S.v = Math.min(T.spd, S.v + ACC * dt); fwd(S.v);
      if (S.v >= T.spd && u.alt > S.g0 + 28) { S.ph = 'climb'; if (!u.jet) { u.cs = S.v; u.mvT = Q.t; } if (u.order.k === 'bombrun') u.order = jetRun(u, u.order.x, u.order.y); }   // arah serang dihitung ulang dari posisi di udara
      return true;
    }
    S.pit = Math.max(.04, S.pit - dt * .05);
    if (u.alt >= cr) { u.ts = null; u.alt = undefined; u.gearK = 0; u.lowA = false; return false; }
    return false;
  }
  function launchBay(b, r) {
    const T = UT[r.type], h = Q.hqR, tg = redTarget();
    let u;
    if (b.k === 'gar') {
      u = mk('R', r.type, b.sx, b.sy, { hdg: b.yaw, face: b.yaw });
      if (u.stance === 'HOLD') u.stance = 'AGGR';
      u.rally = true;
      const rx = h.x - 520 + rand(-60, 60), ry = h.y + rand(-220, 220), x0 = u.x, y0 = u.y;
      u.order = { k: 'move', x: rx, y: ry };
      u.x = b.ex; u.y = b.ey; setPath(u, rx, ry); u.x = x0; u.y = y0;   // rute dihitung dari luar pintu supaya tidak menembus dinding
      u.path.unshift({ x: b.ex, y: b.ey }); u.repath = 5;
    } else if (b.k === 'pad') {
      u = mk('R', r.type, b.sx, b.sy, { hdg: b.yaw, face: b.yaw });
      park(u, 'spin');
      u.order = { k: T.w.length ? 'amove' : 'move', x: tg.x, y: tg.y }; u.path = [{ x: tg.x, y: tg.y }];
    } else {
      const gh = GEARF[r.type] || 2.1, F0 = Q.fac;
      u = mk('R', r.type, b.sx, b.sy, { hdg: 0, face: 0 });
      u.alt = gh; u.gearK = 1; u.tc = 'G'; u.lowA = false; u.gzS = undefined;
      u.ts = { ph: 'bay', t: .5, v: 0, g0: gh, pit: 0, wp: [{ x: F0.twy.x, y: b.y }, { x: F0.twy.x, y: F0.twy.y1 }, { x: F0.run.x, y: F0.twy.y1 }, { x: F0.run.x, y: F0.hold[1] }] };
      if (r.type === 'BMB') u.order = jetRun(u, tg.x, tg.y);
      else if (u.jet) { const o = pick(Q.objs); u.order = { k: 'cap', x: o.x + 200, y: o.y, r: 380 }; }
      else { u.order = { k: T.w.length ? 'amove' : 'move', x: tg.x, y: tg.y }; u.path = [{ x: tg.x, y: tg.y }]; }
      F0.jetT = Q.t + 7;
    }
    b.u = u; return u;
  }
  function facTick(dt) {
    const F0 = Q.fac; if (!F0) return;
    for (const b of F0.bays) {
      if (b.want || b.u) b.door = Math.min(1, b.door + dt / DOOR_T); else b.door = Math.max(0, b.door - dt / DOOR_T);
      if (b.want) { b.wait -= dt; if (b.wait <= 0) { launchBay(b, b.want); b.want = null; } }
      if (b.u && (b.u.dead || Math.hypot(b.u.x - b.x, b.u.y - b.y) > (b.k === 'han' ? 34 : 16))) b.u = null;
    }
    for (const b of F0.pad) if (b.u && (b.u.dead || Math.hypot(b.u.x - b.x, b.u.y - b.y) > 22)) b.u = null;
    for (const b of F0.std) if (b.u && (b.u.dead || !b.u.ts || b.u.ts.ph !== 'park')) b.u = null;
    for (let i = 0; i < F0.q.length; i++) {
      const r = F0.q[i];
      if (r.kind === 'pad') { const b = F0.pad.find(q => !q.u && !(q.res && !q.res.dead)); if (b) { launchBay(b, r); F0.q.splice(i--, 1); } continue; }
      if (r.kind === 'han' && Q.t < F0.jetT) continue;
      const list = r.kind === 'gar' ? F0.gar : F0.han, free = list.filter(q => !q.u && !q.want && q.door <= 0);
      if (!free.length) continue;
      const b = free[Math.floor(Math.random() * free.length)];
      b.want = r; b.wait = DOOR_T * .2; F0.q.splice(i--, 1);   // unit sudah di dalam saat pintu mulai terangkat
      if (r.kind === 'han') F0.jetT = Q.t + 7;
    }
  }

  /* ---------------- SORTI UDARA RUTIN (v2.12) ----------------
     pengguna: "tidak ada pesawat yang keluar hangar & lepas landas" — dulu jet baru dibeli AI setelah ±7 menit & tergantung kredit.
     Kini pangkalan rutin menerbangkan pesawat/heli (gratis, dibatasi airMax): pesawat parkir di apron taksi ke landasan, atau unit baru
     keluar hanggar / helipad. Operator mendekati pangkalan (< 900 m) = pangkalan bergegas (jeda dipercepat) */
  function parkStands() {   // reset: pesawat parkir di revetment apron + 2 heli jaga di helipad
    const F0 = Q.fac, D = DIFF[Q.diff]; if (!F0 || D.inf) return;
    const types = ['FGT', 'CAS', 'UCAV', 'FGT', 'BMB', 'UCAV', 'CAS', 'FGT'], skip = Q.diff >= 3 ? [] : Q.diff === 2 ? [3, 7] : [1, 3, 5, 7];
    F0.std.forEach((b, i) => {
      if (skip.includes(i)) return;
      const t = types[i], gh = GEARF[t] || 2.1, u = mk('R', t, b.x, b.y, { hdg: 0, face: 0, garr: true, stance: 'HOLD' });
      u.alt = gh; u.gearK = 1; u.tc = 'G'; u.lowA = false; u.ts = { ph: 'park', t: 0, v: 0, g0: gh, pit: 0, wp: [] }; b.u = u;
    });
    for (const b of F0.pad.slice(4)) {
      const u = mk('R', Math.random() < .6 ? 'ATK2' : 'HELI', b.x, b.y, { hdg: Math.PI, face: Math.PI, garr: true });
      park(u, 'cold'); u.pad0 = true; u.guard = { x: b.x, y: b.y, r: 900 }; b.res = u;
    }
  }
  function sortieGo(b) {   // pesawat parkir diberangkatkan: taksi keluar revetment → taksiway → ujung landasan
    const u = b.u, F0 = Q.fac, tg = redTarget(), T = UT[u.type];
    u.ts = { ph: 'taxi', t: 0, v: 0, g0: u.ts.g0, pit: 0, wp: [{ x: F0.twy.x, y: b.y }, { x: F0.twy.x, y: F0.twy.y1 }, { x: F0.run.x, y: F0.twy.y1 }, { x: F0.run.x, y: F0.hold[1] }] };
    u.garr = false; u.stance = 'AGGR'; b.u = null; F0.stT = Q.t;
    if (u.type === 'BMB') u.order = jetRun(u, tg.x, tg.y);
    else if (u.jet) { const o = pick(Q.objs); u.order = { k: 'cap', x: o.x + 200, y: o.y, r: 380 }; }
    else { u.order = { k: T.w.length ? 'amove' : 'move', x: tg.x, y: tg.y }; u.path = [{ x: tg.x, y: tg.y }]; }
    if (u.type !== 'UCAV') L(Tt('w_wave_air'), 'c');
  }
  function sortieTick(dt) {
    const F0 = Q.fac, D = DIFF[Q.diff]; if (!F0 || !D.sortie || !Q.hqR || Q.hqR.dead) return;
    if (Q.sortT > 7 && (Q.sortCk = (Q.sortCk || 0) - dt) <= 0) { Q.sortCk = 2; for (const u of TL.B || []) if (u.player && dist(u, Q.hqR) < 900) { Q.sortT = 7; break; } }
    Q.sortT -= dt; if (Q.sortT > 0) return; Q.sortT = D.sortie[1] * rand(.8, 1.2);
    let air = F0.q.length; for (const u of TL.R || []) if (UT[u.type].cat === 'A' && !(u.ts && u.ts.ph === 'park') && !(u.lf && u.lf.ph === 'cold') && u.type !== 'UFO') air++;
    if (air >= D.airMax) return;
    const parked = Q.t - (F0.stT || -99) > 25 ? F0.std.filter(b => b.u && !b.u.dead && b.u.ts && b.u.ts.ph === 'park') : [];   // satu pesawat parkir per 25 dtk (taksiway tidak berdesakan)
    const r = Q.sortN++ ? Math.random() : 0;   // sorti pertama selalu pesawat parkir: cepat terlihat taksi & lepas landas
    if (parked.length && r < .45) sortieGo(pick(parked));
    else if (r < .8) spawnRed(pick(Q.t > 200 ? ['FGT', 'CAS', 'UCAV', 'BMB'] : ['FGT', 'FGT', 'CAS', 'UCAV']));
    else spawnRed(pick(['HELI', 'ATK2', 'ATK2']));
  }
  war.sortieNow = () => { Q.sortT = 0; sortieTick(0); };

  /* ---------------- NUKLIR TAKTIS (NORMAL & SULIT) ----------------
     peringatan 20 dtk + zona ditandai di peta; meledak di konsentrasi pasukan kita (bukan markas) */
  function nukeTick(dt) {
    const D = DIFF[Q.diff]; if (!D.nuke) return;
    if (!Q.nuke) {
      Q.nukeT -= dt; if (Q.nukeT > 0) return; Q.nukeT = D.nuke[1];
      const us = Q.units.filter(u => u.team === 'B' && !u.dead && !u.struct && u.tc === 'G' && Math.hypot(u.x - Q.hqB.x, u.y - Q.hqB.y) > 700);
      if (us.length < 3) { Q.nukeT = 60; return; }
      let best = us[0], bn = -1;
      for (const a of us) { let n = 0; for (const b of us) if (Math.abs(a.x - b.x) < 400 && Math.abs(a.y - b.y) < 400) n++; if (n > bn) { bn = n; best = a; } }
      Q.nuke = { x: best.x + rand(-60, 60), y: best.y + rand(-60, 60), t: 20, r: 480 };
      L(Tt('w_nuke_warn', { s: 20 }), 'c'); TK.sfx(520, .8, 'sawtooth', .08);
      return;
    }
    const n = Q.nuke, before = Math.ceil(n.t); n.t -= dt;
    if (Math.ceil(n.t) !== before && n.t > 0 && n.t < 10) TK.sfx(n.t < 4 ? 900 : 640, .12, 'square', .05);
    if (n.t > 0) return;
    Q.nuke = null; fx('nuke', n.x, n.y, 9, n.r); fx('wreck', n.x, n.y, 90, 60);
    Q.blast = true;
    for (const t of Q.units) {
      if (t.dead) continue; const d = Math.hypot(t.x - n.x, t.y - n.y); if (d > n.r) continue;
      const q = d < n.r * .5 ? 1 : (1 - d / n.r) / .5, k = q * q; hurt(t, (t.struct ? 500 : 1400) * k, 'bomb', null);
    }
    Q.blast = false; L(Tt('w_nuke_hit'), 'c'); TK.sfx(60, 1.6, 'sawtooth', .12);
  }

  /* ---------------- BOS (PROFESIONAL) ----------------
     mini bos menjaga pos (tetap di sekitar pos, mengejar lawan dalam jangkauan tali), punya fase saat nyawa tinggal separuh;
     bos akhir (acak dari FINALS) muncul dari markas saat pasukan kita mendekat / markas mulai rusak, dan markas kebal selama ia hidup */
  function bossEv(key, u, v) { const s = Tt(key, Object.assign({ u: uname(u.type) }, v || {})); L(s, 'c'); Q.ban = { k: key, s, t: Q.t, u }; if (war.hooks.boss) war.hooks.boss(key, u, v); }   // Q.ban: spanduk besar di peta warzone
  function spawnBoss(type, x, y, post) {
    const T = UT[type], u = mk('R', type, x + (T.fly ? 0 : rand(-40, 40)), y + (T.fly ? 0 : rand(-40, 40)), { garr: true, stance: 'HOLD', boss: type, home: { x, y }, post: post || null, ang: rand(0, 6.28), bph: 0 });
    if (T.alt) u.alt = T.alt;
    const D = DIFF[Q.diff]; if (T.final && D.fbHp) { u.hp *= D.fbHp; u.hpMax *= D.fbHp; }   // PROFESIONAL: bos akhir lebih tebal
    return u;
  }
  function escort(u, types, chute) {
    for (const t of types) {
      const e = mk('R', t, u.x + rand(-70, 70), u.y + rand(-70, 70), { garr: true });
      if (chute) { e.chute = 3.5; fx('chute', e.x, e.y, 3.5, 0, { u: e }); }
    }
  }
  function lob(u, tx, ty, dmg, aoe, dur) { Q.projs.push({ x: u.x, y: u.y, sx: u.x, sy: u.y, team: u.team, src: u, dmg, dt: 'he', aoe, t: 0, tgt: null, tx, ty, kind: 'shell', dur }); }
  function bossPhase(u, n) {
    switch (u.boss) {
      case 'ULTIMA': u.rage = .7; escort(u, ['SF', 'SF', 'SF', 'SF']); bossEv('w_boss_rage', u); break;
      case 'GUNSHIP': u.rage = .65; bossEv('w_boss_rage', u); break;
      case 'BLIMP': escort(u, ['SF', 'SF', 'SF', 'SF', 'SF', 'SF'], true); bossEv('w_boss_drop', u); break;
      case 'CMDR': escort(u, ['SF', 'SF', 'SF']); bossEv('w_boss_squad', u); break;
      case 'LEVI':
        if (n === 1) { escort(u, ['LTANK', 'LTANK', 'SF', 'SF', 'SF', 'SF', 'SF', 'SF']); bossEv('w_final_ph2', u); }
        else {
          u.rage = .6; const tg = redTarget();
          for (let i = 0; i < 2; i++) { const d = mk('R', 'UCAV', u.x + rand(-40, 40), u.y + rand(-40, 40)); d.order = { k: 'amove', x: tg.x, y: tg.y }; d.path = [{ x: tg.x, y: tg.y }]; }
          bossEv('w_final_ph3', u);
        }
        break;
      case 'NEMESIS':   // fase 2: melepas kawanan drone tempur; fase 3: semua senjata lebih cepat + drone lagi
        { const tg = redTarget(), nd = n === 1 ? 3 : 2; for (let i = 0; i < nd; i++) { const d = mk('R', 'UCAV', u.x + rand(-60, 60), u.y + rand(-60, 60)); d.order = { k: 'amove', x: tg.x, y: tg.y }; d.path = [{ x: tg.x, y: tg.y }]; } }
        if (n === 2) u.rage = .55; bossEv(n === 1 ? 'w_fnem_ph2' : 'w_fnem_ph3', u); break;
      case 'KRAKEN':    // fase 2: menurunkan regu elit dengan tali; fase 3: amuk + regu kedua
        escort(u, n === 1 ? ['SF', 'SF', 'SF', 'SF', 'SF', 'SF'] : ['SF', 'SF', 'SF', 'SF', 'AT', 'AT'], true);
        if (n === 2) u.rage = .55; bossEv(n === 1 ? 'w_fkra_ph2' : 'w_fkra_ph3', u); break;
      case 'TITAN':     // fase 2: konvoi pengawal hanud; fase 3: salvo 3 rudal, jeda lebih pendek
        if (n === 1) escort(u, ['ZSU', 'ZSU', 'IFV', 'SF', 'SF', 'SF']); else u.rage = .7;
        bossEv(n === 1 ? 'w_ftit_ph2' : 'w_ftit_ph3', u); break;
      case 'ZEUS':      // fase 2: dua tank pengawal; fase 3: kapasitor dipaksa — meriam rel menembak jauh lebih sering
        if (n === 1) escort(u, ['TANK', 'TANK', 'SF', 'SF']); else u.rage = .5;
        bossEv(n === 1 ? 'w_fzeu_ph2' : 'w_fzeu_ph3', u); break;
      case 'WARLORD':   // fase 2: pengawal elit + jip; fase 3: stimulan tempur — minigun & roket lebih cepat, tambah turet
        if (n === 1) escort(u, ['SF', 'SF', 'SF', 'SF', 'SF', 'SF', 'JEEP', 'JEEP']);
        else { u.rage = .6; for (let i = 0; i < 2; i++) { const a = rand(0, 6.28); mk('R', 'SENTRY', u.x + Math.cos(a) * 16, u.y + Math.sin(a) * 16, { garr: true }); } }
        bossEv(n === 1 ? 'w_fwar_ph2' : 'w_fwar_ph3', u); break;
      case 'BEHEMOTH':  // fase 2: dua tank & regu Kopassus mengawal; fase 3: mesin dipaksa — maju lebih cepat, mortir & meriam lebih sering
        if (n === 1) raidEscort(u, ['TANK', 'TANK', 'SF', 'SF', 'SF', 'SF']); else { u.rage = .6; u.spdK = 1.5; }
        bossEv(n === 1 ? 'w_rbeh_ph2' : 'w_rbeh_ph3', u); break;
      case 'TEMPEST':   // fase 2: konvoi hanud & IFV; fase 3: pengisian ulang roket darurat
        if (n === 1) raidEscort(u, ['ZSU', 'IFV', 'IFV', 'SF', 'SF']); else u.rage = .55;
        bossEv(n === 1 ? 'w_rtem_ph2' : 'w_rtem_ph3', u); break;
      case 'CLAY':      // fase 2: regu Kopassus + 2 turet; fase 3: jetpack dipaksa menyala terus + minigun laser lebih cepat
        if (n === 1) { raidEscort(u, ['SF', 'SF', 'SF', 'SF', 'SF', 'SF']); for (let i = 0; i < 2; i++) { const a = rand(0, 6.28); mk('R', 'SENTRY', u.x + Math.cos(a) * 14, u.y + Math.sin(a) * 14, { garr: true }); } }
        else u.rage = .6;
        bossEv(n === 1 ? 'w_rcla_ph2' : 'w_rcla_ph3', u); break;
      case 'WYVERN':    // fase 2: regu serbu turun dengan tali; fase 3: amuk + regu antitank
        raidEscort(u, n === 1 ? ['SF', 'SF', 'SF', 'SF', 'SF', 'SF'] : ['SF', 'SF', 'AT', 'AT', 'AT'], true, true);
        if (n === 2) u.rage = .55; bossEv(n === 1 ? 'w_rwyv_ph2' : 'w_rwyv_ph3', u); break;
    }
  }
  /* TITAN: menegakkan peluncur ±4 dtk sebelum meluncur, lalu rudal balistik jatuh 9 dtk kemudian di konsentrasi pasukan kita (zona ditandai) */
  function titanTick(u, dt) {
    if (u.mslT === undefined) u.mslT = 10;
    u.mslT -= dt; u.ere = clamp((u.ere || 0) + (u.mslT < 4 ? dt * .45 : -dt * .3), 0, 1.2);
    if (u.mslT > 0) return;
    u.mslT = u.bph >= 2 ? 13 : u.bph >= 1 ? 17 : 21;
    const us = Q.units.filter(t => t.team === 'B' && !t.dead && !t.struct && t.tc === 'G' && Math.hypot(t.x - Q.hqB.x, t.y - Q.hqB.y) > 500);
    if (!us.length) return;
    const n = u.bph >= 2 ? 3 : u.bph >= 1 ? 2 : 1, picks = [];
    for (let k = 0; k < n; k++) {
      let best = null, bn = -1;
      for (const a of us) {
        if (picks.some(p => Math.hypot(p.x - a.x, p.y - a.y) < 180)) continue;
        let c = a.player ? 3 : 0; for (const b of us) if (Math.abs(a.x - b.x) < 90 && Math.abs(a.y - b.y) < 90) c++;
        if (c > bn) { bn = c; best = a; }
      }
      if (best) picks.push({ x: best.x + rand(-25, 25), y: best.y + rand(-25, 25) });
    }
    for (const p of picks) Q.strk.push({ x: p.x, y: p.y, t: 9, r: 80, src: u });
    fx('muz', u.x, u.y, .5, 26); TK.sfx(110, .9, 'sawtooth', .07);
    bossEv('w_ftit_msl', u, { n: picks.length, x: picks[0].x, y: picks[0].y });
  }
  function strikeTick(dt) {   // rudal balistik TITAN yang sedang turun
    for (let i = Q.strk.length - 1; i >= 0; i--) {
      const s = Q.strk[i]; s.t -= dt; if (s.t > 0) continue;
      Q.strk.splice(i, 1); explode(s.x, s.y, s.r, 460, 'bomb', s.src && !s.src.dead ? s.src : null); fx('boom', s.x, s.y, 1.3, s.r * 1.1); fx('wreck', s.x, s.y, 60, 30);
      TK.sfx(70, 1, 'sawtooth', .09);
    }
  }
  function cmdrTools(u, dt, eng) {   // alat Komandan Bayangan (& Sang Jenderal, tanpa kamuflase): stimulan, granat, turet jaga, drone intai, kamuflase adaptif
    const g = u.gad || (u.gad = { sen: 6, gren: 3, stim: 0, drone: 12, cloak: u.boss === 'WARLORD' ? 1e9 : u.boss === 'CLAY' ? 24 : 14 });
    for (const k in g) g[k] -= dt;
    u.stealth = u.cloakT > Q.t ? .12 : 1;
    if (g.stim <= 0 && u.hp < u.hpMax * .45) { g.stim = 45; u.hp = Math.min(u.hpMax, u.hp + u.hpMax * .3); u.healT = Q.t; bossEv('w_boss_stim', u); }
    const tg = u.tg[0]; if (!eng || !tg || tg.dead) return;
    if (g.gren <= 0 && dist(u, tg) < 170) { g.gren = 6; lob(u, tg.x + rand(-6, 6), tg.y + rand(-6, 6), 70, 20, .9); }
    u.sens = (u.sens || []).filter(s => !s.dead);
    if (g.sen <= 0 && u.sens.length < 3) { g.sen = 20; const a = rand(0, 6.28); u.sens.push(mk('R', 'SENTRY', u.x + Math.cos(a) * 14, u.y + Math.sin(a) * 14, { garr: true })); bossEv('w_boss_sentry', u); }
    if (g.drone <= 0) { g.drone = 40; const d = mk('R', 'UAV', u.x, u.y); d.order = { k: 'move', x: tg.x, y: tg.y }; d.path = [{ x: tg.x, y: tg.y }]; d.life = 35; bossEv('w_boss_drone', u); }
    if (g.cloak <= 0) { g.cloak = 30; u.cloakT = Q.t + 6; bossEv('w_boss_cloak', u); }
  }
  /* CLAY MARTIN: jet sungguhan — lepas landas (u.alt naik sampai T.jetAlt), laju T.jetK (HELI × 3) tanpa hambatan medan, dianggap unit udara selama mengudara
     (u.fly, u.tc 'A'; rendah = u.lowA bisa ditembak senjata ringan). Habis bahan bakar: turun lalu mendarat; di atas air tetap terbang. Fase 3 = jet menyala terus.
     u.jpk = akhir semburan (Q.t) → fps-gl menyalakan api nosel; u.jf = sedang mengudara */
  /* terbang: laju berakselerasi & mengerem, belok terbatas (makin cepat makin lebar), tetap meluncur saat berhenti diberi tujuan */
  function clayFly(u, dt, T) {
    const top = T.spd * T.jetK, acc = top * .62, v0 = u.jv || 0, p = u.path[0]; let want = u.hdg || 0, tgt = 0;
    if (p) {
      let dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
      if (d < v0 * dt * 2 + 5 && u.path.length > 1) { u.path.shift(); dx = u.path[0].x - u.x; dy = u.path[0].y - u.y; d = Math.hypot(dx, dy); }
      else if (d < 4) { u.path.shift(); d = 0; }
      if (d > 0) { want = Math.atan2(dy, dx); tgt = u.path.length > 1 ? top : Math.min(top, Math.sqrt(2 * acc * 1.1 * d)); }
    }
    if (u.jlT > Q.t) tgt = Math.max(tgt, top * .55);   // sesaat setelah lepas tetap melesat serong walau belum ada tujuan
    const e = wrapPi(want - (u.hdg || 0)), tr = 3.4 - 2.3 * Math.min(1, v0 / top); u.hdg = (u.hdg || 0) + Math.max(-tr * dt, Math.min(tr * dt, e));
    if (Math.abs(e) > 1.1) tgt = Math.min(tgt, top * .45);   // belok tajam: laju dikurangi
    u.jv = v0 + Math.max(-acc * 1.25 * dt, Math.min(acc * dt, tgt - v0));
    u.x += Math.cos(u.hdg) * u.jv * dt; u.y += Math.sin(u.hdg) * u.jv * dt;
  }
  function clayJet(u, dt, T) {
    u.jcd = (u.jcd === undefined ? 3 : u.jcd) - dt;
    const mv = u.path.length > 0, on = () => u.jpk > Q.t;
    if (u.bph >= 2 && !u.duel && !u.act) u.jpk = Q.t + .6;
    else if (u.jcd <= 0 && !on() && !u.jf && !u.duel && !u.act) { u.jpk = Q.t + T.jetBurn; u.jcd = T.jetBurn + T.jetCool; if (!u.jet1) { u.jet1 = true; bossEv('w_rcla_jet', u); } }
    if (on() && !u.jf) { u.jf = true; u.fly = true; u.tc = 'A'; u.alt = u.alt || 0; u.path = []; u.repath = 0; u.jt0 = Q.t + T.jetRun; u.jv = 0; }   // jt0: berlari beberapa langkah sambil merebahkan badan, lalu melesat tanpa berhenti
    if (u.jf) {
      if (u.duel && u.duel.tg) {   // duel: terbang rendah & menukik ke operator, mendarat di depannya
        const dd = dist(u, u.duel.tg), want = Math.min(T.jetAlt, Math.max(0, (dd - 16) * .45));
        if (Q.t >= u.jt0) u.alt = Math.max(0, u.alt + clamp(want - u.alt, -T.jetSink * 2.6 * dt, T.jetClimb * dt));
        u.jpk = dd < 20 && u.alt < 1.5 ? 0 : Q.t + 1; if (u.jpk === 0) u.alt = 0;
      }
      else if (on()) { const top = u.rduel ? CRAY.rduel.alt : T.jetAlt; if (Q.t >= u.jt0) u.alt = u.alt > top ? Math.max(top, u.alt - T.jetSink * dt) : Math.min(top, u.alt + T.jetClimb * dt);   // duel railgun: terbang rendah (±70 m) mengitari kendaraan operator
        if (!mv && u.bph < 2) u.jpk -= dt * 1.5; }   // melayang diam menghabiskan bahan bakar lebih cepat
      else if (u.alt < 40 && (terAt(u.x, u.y) === W.TER.WATER || (war.hooks.roofAt && war.hooks.roofAt(u.x, u.y)))) { u.jpk = Q.t + 2; if (!u.path.length) { const a = (u.hdg || 0) + rand(-.6, .6); u.path = [{ x: u.x + Math.cos(a) * 70, y: u.y + Math.sin(a) * 70 }]; } }   // jangan mendarat di air atau menembus gedung: meluncur mencari tempat lapang
      else u.alt = Math.max(0, u.alt - T.jetSink * dt);
      u.lowA = u.alt < 40;
      if (u.alt <= 0 && Q.t >= u.jt0) { u.jf = false; u.jv = 0; u.fly = false; u.tc = 'G'; u.lowA = false; u.alt = undefined; u.gzS = undefined; u.gzV = 0; u.path = []; u.repath = 0; u.landed = Q.t; }
    }
    u.spdK = u.jf ? T.jetK : (u.dash || 1);
    if (u.jf && Q.t < u.jt0) { const kr = 1 - (u.jt0 - Q.t) / T.jetRun, v = T.spd * (.55 + .75 * kr); u.x += Math.cos(u.hdg || 0) * v * dt; u.y += Math.sin(u.hdg || 0) * v * dt; }   // awalan lari
    else if (u.jf) { if (!u.jl0) { u.jl0 = true; u.jv = Math.max(u.jv || 0, T.spd * T.jetK * .3); u.jlT = Q.t + 1.1; } clayFly(u, dt, T); }   // lepas: langsung melaju serong naik
    if (!u.jf) u.jl0 = false;
  }
  /* ---------------- CRAY MARTIN (v2.12): kemampuan baru ----------------
     KEBAL PELURU: peluru biasa (dt 'small') terpental dari zirahnya — hanya bilah katana, ledakan, roket & peluru penembus yang melukai.
     TEBASAN KATANA (di darat): melesat ke unit darat lawan terdekat ≤ cut.r m lalu menebas; unit di sekitar titik tebas ikut tercabik.
     JUDGEMENT CUT END (di darat): bila ≥ jce.min unit darat lawan dalam jce.r m — menyarungkan katana (ancang-ancang), menghilang sementara
     tebasan merobek seluruh area, lalu muncul lagi & katana disarungkan "klik" → semua yang di area tercabik.
     RAILING POWER (di udara): railgun menembak n sasaran di segala arah sekaligus; tiap peluru merembet ke c sasaran lain di dekatnya.
     DUEL: ditembak operator (berjalan kaki) → berbalik, terbang / menukik turun ke operator, lalu duel katana. Tiap serangan diawali ancang-ancang
     (bilah menyala); tebas tepat saat itu = TANGKIS → ia limbung & tebasan berikutnya berlipat. Tebasan biasa kadang ia tahan lalu dibalas.
     Angka per tingkat kesulitan [MUDAH, NORMAL, SULIT, PRO]; waktu = detik sim (mode operator ½ kecepatan → ×2 waktu nyata) */
  const CRAY = {
    hpK: [1, 1, 1, 3], dmgK: [1, 1, 1, 1.35], rage: [1, 1, 1, .8],
    bullet: [1, 1, .2, 0],   // peluru biasa yang tembus: SULIT 20% (sisanya terpental), PRO kebal total
    blade: [.7, .7, .7, .8], stunK: 2.2, guard: [0, 0, .4, .6],   // katana operator: pengali damage (lewati zirah), saat limbung ×stunK; peluang menahan tebasan biasa
    evade: [0, 0, .2, .32], flee: [0, 0, .25, .45], parE: [0, 0, .3, .45],   // v2.13: lenyap menghindari tebasan (lalu menyerang dari belakang); kabur dari limbung; menebas roket/ledakan operator
    cut: { r: 42, cd: [9, 9, 9, 3], dash: .2, swing: .1, rec: .38, dmgV: [0, 0, 170, 380], dmgI: 320, cleave: 10 },
    jce: { r: [0, 0, 55, 85], cd: [0, 0, 48, 22], min: 4, sheath: .9, slash: 1.15, end: .7, dmgV: [0, 0, 220, 500], dmgI: 520, op: [0, 0, 38, 48] },
    rail: { cd: [0, 0, 11, 6.5], n: [0, 0, 4, 7], chain: [0, 0, 2, 4], jump: 110, rng: 1000, dmg: [0, 0, 120, 170], decay: .72, op: [0, 0, 20, 24] },
    /* duel katana: rentetan tebasan (combo n hit, hit berikutnya ancang-ancang ×fast), par = mulai jendela TANGKIS (bagian dari ancang-ancang) */
    duel: { wind: [0, 0, .36, .28], swing: .1, rec: [0, 0, .32, .24], dmg: [0, 0, 18, 18], hv: [0, 0, 30, 34], reach: 5, stun: [0, 0, .9, .7], combo: [0, 0, 3, 5], rest: [0, 0, .45, .28], cd: 12, lose: 7, max: 60, par: [0, 0, .5, .62], fast: .62, step: 16 },
    /* v2.13 jurus duel (gaya pendekar iaido): */
    blink: { cd: [0, 0, 4.5, 2.8], out: .12, back: 2.6, wind: [0, 0, .26, .2], far: 9 },   // LANGKAH BAYANGAN: lenyap → muncul di belakang operator & langsung menebas (pasif)
    iai: { cd: [0, 0, 9, 6], back: 13, aim: [0, 0, .6, .46], lock: .55, dash: .1, over: 7, w: 2.3, dmg: [0, 0, 36, 46], rec: .32 },   // IAI KILAT: mundur, kuda-kuda, melesat menembus
    space: { cd: [0, 0, 10, 7], n: [0, 0, 2, 4], mark: [0, 0, .6, .46], r: 3.6, dmg: [0, 0, 24, 30], gap: .14, lead: .3 },   // TEBASAN RUANG: lingkaran di titik operator lalu meledak
    swords: { cd: [0, 0, 12, 8], n: [0, 0, 5, 8], form: .5, gap: [0, 0, .13, .09], spd: 60, dmg: [0, 0, 8, 10], turn: 1.6, life: 2.4, r: 1.3 },   // PEDANG BAYANGAN: bilah merah melayang lalu meluncur
    rise: { cd: [0, 0, 8, 6], wind: [0, 0, .34, .26], dmg: [0, 0, 24, 30], push: 11, reach: 5.5 },   // TEBASAN NAIK: operator terlempar, lalu disusul Tebasan Ruang
    mv: { combo: 3, blink: 1.6, rise: 1.2, iai: 1.1, space: 1, swords: .9 },   // bobot pilihan jurus
    /* DUEL RAILGUN: operator menyerang dari kendaraan / Shadow Hunter → Cray mengudara, mengitari, menembak railgun terisi (bisa dihindari dengan bergerak) */
    rduel: { cd: [0, 0, 4, 2.8], ch: [0, 0, .75, .6], lock: .55, dmg: [0, 0, 110, 150], R: [0, 0, 170, 150], alt: 70, burst: [0, 0, 3, 2], miss: 5.5, lose: 3, max: 90 }
  };
  war.CRAY = CRAY;
  const crK = a => a[Q.diff] || a[2];
  const crEv = (k, u, o) => { if (war.hooks.cray) war.hooks.cray(k, u, o || {}); };
  const inMap = p => { p.x = Math.max(30, Math.min(W.WW - 30, p.x)); p.y = Math.max(30, Math.min(W.WH - 30, p.y)); return p; };
  function crayInit(u) {
    const d = Q.diff, k = CRAY.hpK[d] || 1; u.hp *= k; u.hpMax *= k; u.dmgK = CRAY.dmgK[d] || 1; u.rage = u.rage0 = CRAY.rage[d] || 1;
    u.cr = { cut: 3, jce: 10, rail: 3, blink: 0, iai: 3, space: 2, swords: 4, rise: 2 }; u.crSw = []; u.act = null; u.duel = null; u.rduel = null; u.duelCD = 0; u.dash = 1;
  }
  function crFoes(x, y, team, r, gOnly) {   // unit lawan (bukan struktur / penumpang / berparasut) dalam r m dari (x,y)
    const out = [], r2 = r * r;
    for (const L2 of foesOf(team)) for (const e of L2) {
      if (e.dead || e.struct || e.inV || e.chute > 0 || e.vanish || (gOnly && e.tc !== 'G')) continue;
      const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= r2) out.push(e);
    }
    return out;
  }
  const opKnows = (u, e) => !e.player || (war.hooks.knows ? war.hooks.knows(u) : e.seen[u.team]);
  const clearAct = u => { if (u.act && u.act.k !== 'jce') { u.act = null; u.vanish = false; } };
  function crayProvoke(u, src) {   // operator menyerang → duel katana (berjalan kaki) atau duel railgun (dari kendaraan / heli)
    if (!src || !src.player || src.dead || u.dead) return;
    const v = war.hooks.duelVeh ? war.hooks.duelVeh(src) : null;
    if (v) { rduelStart(u, v, src); return; }
    if (u.duel) { if (u.duel.tg === src) u.duel.seen = Q.t; return; }
    if (Q.t < u.duelCD || (war.hooks.duelOK && !war.hooks.duelOK(src))) return;
    if (u.rduel) { u.rduel = null; crEv('rduelEnd', u, {}); }   // operator turun dari kendaraan → kembali ke katana
    u.duel = { tg: src, ph: 'go', t0: Q.t, seen: Q.t, n: 0, rest: 0, lx: src.x, ly: src.y, vx: 0, vy: 0, last: '' }; u._kn = Q.t + 30;
    clearAct(u);
    bossEv('w_cray_duel', u); crEv('duel', u, { tg: src });
  }
  function rduelStart(u, v, op) {
    if (u.rduel) { if (u.rduel.tg === v) u.rduel.seen = Q.t; else { u.rduel.tg = v; u.rduel.ch = null; } return; }
    if (u.duel) { u.duel = null; crEv('duelEnd', u, { why: 'veh' }); }
    clearAct(u);
    u.rduel = { tg: v, op, t0: Q.t, seen: Q.t, k: crK(CRAY.rduel.cd) * .6, n: 0, ch: null }; u._kn = Q.t + 30;
    u.jpk = Q.t + 3;
    bossEv('w_cray_rduel', u); crEv('rduel', u, { tg: v });
  }
  function crayBlade(u, dmg, src) {   // tebasan katana operator: damage, TANGKIS (ia limbung), ditahan, atau dihindari (lenyap)
    crayProvoke(u, src); if (u.duel) u.duel.seen = Q.t;
    const A = u.act, DU = CRAY.duel, k = crK(CRAY.blade);
    if (A && A.k === 'duel' && ((A.ph === 'wind' && A.t >= (A.W || crK(DU.wind)) * crK(DU.par)) || A.ph === 'swing')) {
      u.act = { k: 'stun', t: 0, dur: crK(DU.stun) }; if (u.duel) u.duel.rest = 0; crEv('parry', u, { tg: src });
      if (!u.par1) { u.par1 = true; bossEv('w_cray_parry', u); }
      return dmg * k * .5;
    }
    if (A && A.k === 'stun') { crEv('hitStun', u, { tg: src }); return dmg * k * CRAY.stunK; }
    if (A && (A.k === 'iai' || A.k === 'rise' || A.k === 'blink')) { crEv('armor', u, { tg: src }); return dmg * k * .3; }   // jurus berat: tidak terhenti oleh tebasan (zirah super)
    if (u.duel && (!A || A.k !== 'jce')) {
      if (u.cr.blink <= 0 && Math.random() < crK(CRAY.evade)) { crEv('evade', u, { tg: src }); crBlink(u, 'back'); return 0; }   // lenyap lalu menebas dari belakang
      if (Math.random() < crK(CRAY.guard)) { u.act = { k: 'guard', t: 0 }; crEv('guard', u, { tg: src }); return 0; }
    }
    return dmg * k;
  }
  function crayCut(u) {   // tebasan katana ke unit darat terdekat (bukan operator — operator dilawan lewat duel)
    let best = null, bd = 1e9;
    for (const e of crFoes(u.x, u.y, u.team, CRAY.cut.r, true)) { if (e.player || !e.seen[u.team]) continue; const d = dist(u, e) - (e.armor === 'inf' ? 0 : 8); if (d < bd) { bd = d; best = e; } }
    if (!best) return false;
    u.act = { k: 'cut', ph: 'dash', t: 0, tg: best, tx: best.x, ty: best.y }; u.path = []; crEv('cut0', u, { tg: best });
    return true;
  }
  function crayCleave(u, A) {
    const C = CRAY.cut, a = u.hdg, px = u.x + Math.cos(a) * 4, py = u.y + Math.sin(a) * 4; let n = 0;
    for (const e of crFoes(px, py, u.team, C.cleave + (A.tg && A.tg.armor !== 'inf' ? 6 : 0), true)) {
      if (e.player) continue;
      hurt(e, e.armor === 'inf' ? C.dmgI : crK(C.dmgV), 'bomb', u); n++;
    }
    if (A.tg && !A.tg.dead && A.tg.armor !== 'inf' && dist(u, A.tg) < 16 && n === 0) hurt(A.tg, crK(C.dmgV), 'bomb', u);
    crEv('cut', u, { x: px, y: py, n });
  }
  function crayJce(u) {
    const r = crK(CRAY.jce.r), L0 = crFoes(u.x, u.y, u.team, r, true).filter(e => e.player ? opKnows(u, e) : e.seen[u.team]);
    if (L0.length < CRAY.jce.min) return false;
    u.act = { k: 'jce', ph: 'sheath', t: 0, r }; u.path = []; u.cr.jce = crK(CRAY.jce.cd);
    bossEv('w_cray_jce', u); crEv('jce0', u, { r });
    return true;
  }
  function jceHit(u, A) {
    const J = CRAY.jce; let n = 0;
    for (const e of crFoes(u.x, u.y, u.team, A.r, true)) {
      const k = 1 - .35 * Math.min(1, dist(u, e) / A.r);
      if (e.player) hurt(e, crK(J.op) * k, 'small', u); else hurt(e, (e.armor === 'inf' ? J.dmgI : crK(J.dmgV)) * k, 'bomb', u);
      if (!e.dead && e.armor === 'inf' && !e.player) e.stunT = Q.t + 1.5;
      n++;
    }
    fx('boom', u.x, u.y, .6, A.r * .5); crEv('jce2', u, { r: A.r, n });
  }
  function crayRail(u) {   // RAILING POWER: n peluru ke segala arah sekaligus, masing-masing merembet ke c sasaran berikutnya
    const R = CRAY.rail, n = crK(R.n), ch = crK(R.chain), dm = crK(R.dmg);
    const cand = crFoes(u.x, u.y, u.team, R.rng, false).filter(e => e.player ? opKnows(u, e) : e.seen[u.team] || (u.rduel && e === u.rduel.tg));
    if (!cand.length) { u.cr.rail = 1; return false; }
    cand.sort((a, b) => (u.rduel && a === u.rduel.tg ? -1e9 : dist(u, a)) - (u.rduel && b === u.rduel.tg ? -1e9 : dist(u, b)));   // duel railgun: kendaraan operator selalu disasar
    const ang = e => Math.atan2(e.y - u.y, e.x - u.x), gap = Math.PI * 2 / n * .55, pk = [];
    for (const e of cand) { if (pk.length >= n) break; if (pk.every(p => Math.abs(wrapPi(ang(p) - ang(e))) > gap)) pk.push(e); }   // sebar ke berbagai arah dulu
    for (const e of cand) { if (pk.length >= n) break; if (!pk.includes(e)) pk.push(e); }
    const hit = new Set(pk), segs = [];
    const zap = (e, d) => { if (e.player) hurt(e, crK(R.op) * d / dm, 'small', u); else hurt(e, d, 'ap', u); };
    for (const e of pk) {
      segs.push({ a: u, b: e, g: 0 }); zap(e, dm);
      let cur = e, dd = dm;
      for (let c = 0; c < ch; c++) {
        dd *= R.decay; let nx = null, nd = R.jump;
        for (const f of crFoes(cur.x, cur.y, u.team, R.jump, false)) { if (hit.has(f)) continue; const q = dist(cur, f); if (q < nd) { nd = q; nx = f; } }
        if (!nx) break;
        hit.add(nx); segs.push({ a: cur, b: nx, g: c + 1 }); zap(nx, dd); cur = nx;
      }
    }
    u.cr.rail = crK(R.cd); crEv('rail', u, { segs });
    if (!u.rail1) { u.rail1 = true; bossEv('w_cray_rail', u, { n: pk.length }); }
    return true;
  }
  /* ---------- v2.13 jurus duel ---------- */
  function duelSwing(u, hv, W, ci, cn, back) {   // satu tebasan duel: ancang-ancang W dtk (ditandai cincin), lalu ayun
    const D = u.duel, n = D ? D.n++ : 0;
    u.act = { k: 'duel', ph: 'wind', t: 0, n, W, hv: !!hv, ci: ci || 0, cn: cn || 1, back: !!back };
    crEv('wind', u, { tg: D && D.tg, W, hv: !!hv, back: !!back, n });
  }
  function crBlink(u, mode) {   // lenyap sesaat lalu muncul di titik lain: 'back' di belakang operator & menebas, 'away' menjauh, 'iai' titik awal Iai Kilat, 'near' mendekat
    u.act = { k: 'blink', ph: 'out', t: 0, to: mode }; u.vanish = true; u.path = []; u.cr.blink = crK(CRAY.blink.cd);
    crEv('blink0', u, { x: u.x, y: u.y, to: mode });
  }
  function blinkDest(u, tg, mode) {
    const h = tg.hdg || 0, B = CRAY.blink, aw = Math.atan2(u.y - tg.y, u.x - tg.x);
    let a = aw, r = 9;
    if (mode === 'back' || mode === 'near') { a = h + Math.PI + rand(-.45, .45); r = B.back; }
    else if (mode === 'iai') { a = aw + rand(-.7, .7); r = CRAY.iai.back; }
    else a = aw + rand(-.9, .9);
    let p = inMap({ x: tg.x + Math.cos(a) * r, y: tg.y + Math.sin(a) * r });
    if (terAt(p.x, p.y) === W.TER.WATER || (war.hooks.roofAt && war.hooks.roofAt(p.x, p.y))) p = inMap({ x: tg.x + Math.cos(a) * r * .5, y: tg.y + Math.sin(a) * r * .5 });   // jangan muncul di air / di atap
    return p;
  }
  function pickMove(u, D, d) {   // pilih jurus berikutnya (bobot × siap, tidak mengulang jurus non-combo yang sama)
    const C = u.cr, M = CRAY.mv, L = [];
    const add = (k, w, ok) => { if (ok && (k === 'combo' || D.last !== k)) L.push([k, w]); };
    add('combo', M.combo, d <= CRAY.duel.reach + .6);
    add('rise', M.rise, C.rise <= 0 && d <= CRAY.rise.reach + .6);
    add('blink', M.blink, C.blink <= 0);
    add('iai', M.iai, C.iai <= 0);
    add('space', M.space, C.space <= 0);
    add('swords', M.swords, C.swords <= 0);
    let s = 0; for (const [, w] of L) s += w; let r = Math.random() * s;
    for (const [k, w] of L) { r -= w; if (r <= 0) return k; }
    return L.length ? L[0][0] : 'combo';
  }
  function startMove(u, k) {
    const D = u.duel, tg = D.tg, C = u.cr; D.last = k;
    if (k === 'combo') { const cn = crK(CRAY.duel.combo) - (Math.random() < .35 ? 1 : 0); duelSwing(u, false, crK(CRAY.duel.wind), 0, Math.max(1, cn)); }
    else if (k === 'rise') { C.rise = crK(CRAY.rise.cd); u.act = { k: 'rise', ph: 'wind', t: 0 }; crEv('rise0', u, { tg }); }
    else if (k === 'blink') crBlink(u, 'back');
    else if (k === 'iai') { C.iai = crK(CRAY.iai.cd); crBlink(u, 'iai'); }
    else if (k === 'space') { C.space = crK(CRAY.space.cd); spaceMark(u, { k: 'space', ph: 'mark', t: 0, i: 0, n: crK(CRAY.space.n) }); }
    else if (k === 'swords') {
      const S = CRAY.swords, n = crK(S.n); C.swords = crK(S.cd);
      u.act = { k: 'swords', ph: 'form', t: 0, i: 0, n };
      for (let i = 0; i < n; i++) u.crSw.push({ i, n, ph: 'hold', x: u.x, y: u.y, h: 2.4, vx: 0, vy: 0, t: 0, own: u.act });
      crEv('sw0', u, { n });
    }
  }
  function spaceMark(u, A) {   // tandai titik operator (+ sedikit mendahului larinya)
    const D = u.duel, tg = D.tg, S = CRAY.space, L = crK(S.mark) * S.lead;
    A.x = tg.x + (D.vx || 0) * L; A.y = tg.y + (D.vy || 0) * L; A.ph = 'mark'; A.t = 0; u.act = A;
    crEv('sp0', u, { x: A.x, y: A.y, r: S.r, T: crK(S.mark), i: A.i });
  }
  function crSwTick(u, dt) {   // Pedang Bayangan: melayang di sekitar Cray lalu meluncur mengejar operator
    const S = CRAY.swords, D = u.duel, tg = D && D.tg;
    for (let i = u.crSw.length - 1; i >= 0; i--) {
      const s = u.crSw[i]; s.t += dt;
      if (s.ph === 'hold') {
        const own = s.own; if (u.act !== own || !tg) { u.crSw.splice(i, 1); crEv('swEnd', u, { s }); continue; }
        const f = (s.i / Math.max(1, s.n - 1) - .5) * 2.6, a = (u.hdg || 0) + Math.PI + f; s.x = u.x + Math.cos(a) * 1.9; s.y = u.y + Math.sin(a) * 1.9; s.h = 2.5 + Math.abs(f) * .35;
        continue;
      }
      if (s.t > S.life || !tg || tg.dead) { u.crSw.splice(i, 1); crEv('swEnd', u, { s }); continue; }
      const want = Math.atan2(tg.y - s.y, tg.x - s.x), cur = Math.atan2(s.vy, s.vx), e = wrapPi(want - cur), tr = S.turn * dt, a = cur + Math.max(-tr, Math.min(tr, e));
      s.vx = Math.cos(a) * S.spd; s.vy = Math.sin(a) * S.spd; s.x += s.vx * dt; s.y += s.vy * dt; s.h += (1.3 - s.h) * Math.min(1, dt * 4);
      if (Math.hypot(tg.x - s.x, tg.y - s.y) < S.r) { u.crSw.splice(i, 1); hurt(tg, crK(S.dmg), 'small', u); crEv('swHit', u, { s, tg }); }
    }
  }
  war.crSwCut = function (x, y, vx, vy, r, cone) {   // katana operator menebas Pedang Bayangan di depannya
    let n = 0;
    for (const u of Q.units) {
      if (!u.crSw || !u.crSw.length || u.dead) continue;
      for (let i = u.crSw.length - 1; i >= 0; i--) {
        const s = u.crSw[i]; if (s.ph !== 'fly') continue; const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
        if (d < r && (dx * vx + dy * vy) / (d || 1) > cone) { u.crSw.splice(i, 1); n++; crEv('swCut', u, { s }); }
      }
    }
    return n;
  };
  function crayAct(u, dt) {
    const A = u.act, C = CRAY; A.t += dt;
    if (A.k === 'cut') {
      const tg = A.tg;
      if (tg && !tg.dead) { A.tx = tg.x; A.ty = tg.y; }
      if (A.ph === 'dash') {
        const a = Math.atan2(A.ty - u.y, A.tx - u.x), stop = tg && tg.armor !== 'inf' ? 6 : 2.4, d = Math.hypot(A.tx - u.x, A.ty - u.y) - stop;
        u.face = u.hdg = a; const v = Math.max(0, d) * Math.min(1, dt / Math.max(.02, C.cut.dash - A.t + dt)); u.x += Math.cos(a) * v; u.y += Math.sin(a) * v;
        if (A.t >= C.cut.dash) { A.ph = 'swing'; A.t = 0; }
      } else if (A.ph === 'swing') { if (!A.hit && A.t >= C.cut.swing * .5) { A.hit = true; crayCleave(u, A); } if (A.t >= C.cut.swing) { A.ph = 'rec'; A.t = 0; } }
      else if (A.t >= C.cut.rec) { u.act = null; u.cr.cut = crK(C.cut.cd); }
      return;
    }
    if (A.k === 'jce') {
      const J = C.jce;
      if (A.ph === 'sheath') { if (A.t >= J.sheath) { A.ph = 'slash'; A.t = 0; u.vanish = true; crEv('jce1', u, { r: A.r }); } }
      else if (A.ph === 'slash') { if (A.t >= J.slash) { A.ph = 'end'; A.t = 0; u.vanish = false; } }
      else { if (!A.hit && A.t >= J.end * .62) { A.hit = true; jceHit(u, A); } if (A.t >= J.end) u.act = null; }
      return;
    }
    const DU = C.duel, D = u.duel, tg = D && D.tg;
    if (!tg) { u.act = null; u.vanish = false; return; }
    const face = () => { u.face = u.hdg = Math.atan2(tg.y - u.y, tg.x - u.x); };
    if (A.k === 'duel') {
      const W = A.W || crK(DU.wind);
      if (A.ph === 'wind') {
        face(); const d = dist(u, tg);
        if (d > DU.reach - .8) { const s = Math.min(d - (DU.reach - 1), DU.step * dt); u.x += Math.cos(u.hdg) * s; u.y += Math.sin(u.hdg) * s; }   // melangkah maju sambil ancang-ancang (operator mundur tidak lantas lolos)
        if (A.t >= W) { A.ph = 'swing'; A.t = 0; }
      } else if (A.ph === 'swing') {
        if (!A.hit && A.t >= DU.swing * .5) {
          A.hit = true; const d = dist(u, tg), fa = Math.abs(wrapPi(Math.atan2(tg.y - u.y, tg.x - u.x) - u.hdg));
          if (d <= DU.reach + 1.2 && fa < 1.3 && !tg.dead) { hurt(tg, crK(A.hv ? DU.hv : DU.dmg), 'small', u); crEv('slashOp', u, { tg, hv: A.hv, n: A.n }); } else crEv('whiff', u, { tg });
        }
        if (A.t >= DU.swing) { A.ph = 'rec'; A.t = 0; }
      } else if (A.t >= crK(DU.rec) * (A.ci + 1 < A.cn ? .45 : 1)) {
        if (A.ci + 1 < A.cn) duelSwing(u, A.ci + 2 === A.cn, W * DU.fast, A.ci + 1, A.cn);   // rentetan: tebasan berikut lebih cepat, terakhir = tebasan berat
        else { u.act = null; D.rest = crK(DU.rest); }
      }
      return;
    }
    if (A.k === 'blink') {
      if (A.t >= C.blink.out) {
        const x0 = u.x, y0 = u.y, p = blinkDest(u, tg, A.to); u.x = p.x; u.y = p.y; face(); u.vanish = false;
        crEv('blink1', u, { x0, y0, to: A.to, tg });
        if (A.to === 'back' || A.to === 'near') duelSwing(u, true, crK(C.blink.wind), 0, 1, true);
        else if (A.to === 'iai') { u.act = { k: 'iai', ph: 'aim', t: 0 }; crEv('iai0', u, { tg }); }
        else { u.act = null; D.rest = .2; }
      }
      return;
    }
    if (A.k === 'iai') {
      const I = C.iai, AIM = crK(I.aim);
      if (A.ph === 'aim') {
        if (!A.lk) face();
        if (!A.lk && A.t >= AIM * I.lock) { A.lk = true; const a = u.hdg, L = dist(u, tg) + I.over, e = inMap({ x: u.x + Math.cos(a) * L, y: u.y + Math.sin(a) * L }); A.x0 = u.x; A.y0 = u.y; A.x1 = e.x; A.y1 = e.y; crEv('iaiLock', u, { x0: A.x0, y0: A.y0, x1: A.x1, y1: A.y1, T: AIM * (1 - I.lock) }); }
        if (A.t >= AIM) { A.ph = 'dash'; A.t = 0; }
      } else if (A.ph === 'dash') {
        const k = Math.min(1, A.t / I.dash); u.x = A.x0 + (A.x1 - A.x0) * k; u.y = A.y0 + (A.y1 - A.y0) * k;
        if (k >= 1) {
          const sx = A.x1 - A.x0, sy = A.y1 - A.y0, L2 = sx * sx + sy * sy || 1, q = Math.max(0, Math.min(1, ((tg.x - A.x0) * sx + (tg.y - A.y0) * sy) / L2)), dd = Math.hypot(A.x0 + sx * q - tg.x, A.y0 + sy * q - tg.y), hit = dd < I.w && !tg.dead;
          if (hit) hurt(tg, crK(I.dmg), 'small', u);
          for (const e of crFoes((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, u.team, Math.sqrt(L2) / 2 + 3, true)) if (!e.player) hurt(e, e.armor === 'inf' ? C.cut.dmgI : crK(C.cut.dmgV) * .6, 'bomb', u);   // pasukan di lintasan ikut tertebas
          crEv('iaiCut', u, { x0: A.x0, y0: A.y0, x1: A.x1, y1: A.y1, hit, tg });
          A.ph = 'rec'; A.t = 0; face();
        }
      } else if (A.t >= I.rec) { u.act = null; D.rest = .15; }
      return;
    }
    if (A.k === 'space') {
      const S = C.space; face();
      if (A.ph === 'mark') {
        if (A.t >= crK(S.mark)) {
          const hit = Math.hypot(tg.x - A.x, tg.y - A.y) <= S.r && !tg.dead; if (hit) hurt(tg, crK(S.dmg), 'small', u);
          crEv('sp1', u, { x: A.x, y: A.y, r: S.r, hit, tg }); A.i++;
          if (A.i >= A.n) { u.act = null; D.rest = crK(DU.rest); } else { A.ph = 'gap'; A.t = 0; }
        }
      } else if (A.t >= S.gap) spaceMark(u, A);
      return;
    }
    if (A.k === 'swords') {
      const S = C.swords; face();
      if (A.ph === 'form') { if (A.t >= S.form) { A.ph = 'fire'; A.t = 0; } }
      else {
        const gp = crK(S.gap);
        while (A.i < A.n && A.t >= A.i * gp) {
          const s = u.crSw.find(q => q.own === A && q.ph === 'hold' && q.i === A.i);
          if (s) { s.ph = 'fly'; s.t = 0; const a = Math.atan2(tg.y - s.y, tg.x - s.x) + rand(-.25, .25); s.vx = Math.cos(a) * S.spd; s.vy = Math.sin(a) * S.spd; s.own = null; crEv('swFire', u, { s }); }
          A.i++;
        }
        if (A.i >= A.n && A.t >= A.n * gp + .1) { u.act = null; D.rest = crK(DU.rest) * .5; }
      }
      return;
    }
    if (A.k === 'rise') {
      const R = C.rise; face();
      if (A.ph === 'wind') { const d = dist(u, tg); if (d > R.reach - 1) { const st = Math.min(d - (R.reach - 1.2), DU.step * 1.4 * dt); u.x += Math.cos(u.hdg) * st; u.y += Math.sin(u.hdg) * st; } if (A.t >= crK(R.wind)) { A.ph = 'swing'; A.t = 0; } }   // merunduk sambil menerjang maju
      else if (A.ph === 'swing') {
        if (!A.hit && A.t >= DU.swing * .5) {
          A.hit = true; const d = dist(u, tg), hit = d <= R.reach + 1.2 && !tg.dead;
          if (hit) hurt(tg, crK(R.dmg), 'small', u);
          crEv('rise', u, { tg, hit, push: R.push });
          if (hit) { u.act = { k: 'space', ph: 'gap', t: -.1, i: 0, n: Math.max(1, crK(C.space.n) - 1) }; return; }   // operator terlempar → disusul Tebasan Ruang di titik jatuhnya
        }
        if (A.t >= DU.swing) { A.ph = 'rec'; A.t = 0; }
      } else if (A.t >= crK(DU.rec)) { u.act = null; D.rest = crK(DU.rest); }
      return;
    }
    if (A.k === 'stun') {
      if (A.t >= A.dur) { u.act = null; if (u.cr.blink <= 0 && Math.random() < crK(C.flee)) crBlink(u, 'away'); }   // PRO: sering lenyap begitu pulih (tidak bisa terus dihukum)
      return;
    }
    if (A.k === 'guard') { if (A.t >= .2) duelSwing(u, true, crK(DU.wind) * .6, 0, 1); return; }   // menahan → langsung membalas dengan tebasan berat
    u.act = null;
  }
  function crayDuel(u, dt, T) {   // true = gerak diatur duel
    const D = u.duel, tg = D.tg, DU = CRAY.duel;
    const d = dist(u, tg), a = Math.atan2(tg.y - u.y, tg.x - u.x);
    if (u.jf) { D.ph = 'go'; u.path = [{ x: tg.x - Math.cos(a) * 3, y: tg.y - Math.sin(a) * 3 }]; return true; }   // mengudara: menukik turun ke operator (ketinggian & pendaratan di clayJet)
    if (d > 70) { D.ph = 'go'; if (!(u.jpk > Q.t)) u.jpk = Q.t + Math.min(T.jetBurn, 3 + d / 60); u.path = [{ x: tg.x, y: tg.y }]; return true; }   // jauh: terbang rendah ke operator
    if (D.rest > 0) { D.rest -= dt; if (d > DU.reach + .6 && d < 40) { u.dash = 2.4; u.spdK = 2.4; u.path = [{ x: tg.x - Math.cos(a) * 2.5, y: tg.y - Math.sin(a) * 2.5 }]; follow(u, dt); } else { u.path = []; u.face = u.hdg = a; } return true; }
    if (d > DU.reach + .6) {
      if (d > CRAY.blink.far && u.cr.blink <= 0) { crBlink(u, 'near'); return true; }   // LANGKAH BAYANGAN (pasif): langsung muncul di belakang operator
      if (d > 12 && d < 45 && (u.cr.space <= 0 || u.cr.swords <= 0)) { startMove(u, u.cr.space <= 0 && (u.cr.swords > 0 || Math.random() < .5) ? 'space' : 'swords'); return true; }   // jarak menengah: serang dari jauh
      D.ph = d < 14 ? 'fight' : 'go'; u.dash = 2.4; u.spdK = 2.4; u.path = [{ x: tg.x - Math.cos(a) * 2.5, y: tg.y - Math.sin(a) * 2.5 }]; follow(u, dt); return true;   // dekat: berlari menerjang
    }
    D.ph = 'fight'; u.path = []; u.face = u.hdg = a;
    startMove(u, pickMove(u, D, d));
    return true;
  }
  function duelCheck(u, dt) {   // tiap langkah: operator gugur / naik kendaraan / menghilang terlalu lama → duel selesai
    const D = u.duel, tg = D.tg, DU = CRAY.duel;
    const end = why => { u.duel = null; clearAct(u); u.duelCD = Q.t + (why === 'veh' ? 0 : DU.cd); u.dash = 1; crEv('duelEnd', u, { why }); };
    if (!tg || tg.dead || !tg.player) return end('dead');
    if (dt > 0) { const k = Math.min(1, dt * 6); D.vx += ((tg.x - D.lx) / dt - D.vx) * k; D.vy += ((tg.y - D.ly) / dt - D.vy) * k; D.lx = tg.x; D.ly = tg.y; }   // laju operator (untuk Tebasan Ruang)
    if (war.hooks.duelOK && !war.hooks.duelOK(tg)) {
      const v = war.hooks.duelVeh ? war.hooks.duelVeh(tg) : null;
      if (v) { end('veh'); rduelStart(u, v, tg); return; }   // operator naik kendaraan / heli → duel railgun
      D.away = (D.away || 0) + dt; if (D.away > DU.lose) return end('away');
    } else D.away = 0;
    if (Q.t - D.seen > DU.max) end('time');
  }
  function rduelTick(u, dt, T) {   // DUEL RAILGUN melawan kendaraan operator
    const R = CRAY.rduel, D = u.rduel, v = D.tg;
    const live = v && !v.dead && war.hooks.duelVeh && war.hooks.duelVeh(D.op) === v;
    const end = why => { u.rduel = null; u.rdCD = Q.t + 4; crEv('rduelEnd', u, { why }); return false; };
    if (!live) { D.away = (D.away || 0) + dt; if (D.away > R.lose || !v || v.dead) return end('away'); } else D.away = 0;
    if (Q.t - D.seen > R.max) return end('time');
    u.jpk = Q.t + 2;   // tetap mengudara
    if (u.jf && Q.t >= u.jt0 && live) { const a = Math.atan2(u.y - v.y, u.x - v.x) + .35, Rr = crK(R.R); u.path = [inMap({ x: v.x + Math.cos(a) * Rr, y: v.y + Math.sin(a) * Rr })]; }   // mengitari pada jarak tembak
    if (live) u.face = Math.atan2(v.y - u.y, v.x - u.x);
    if (D.ch) {   // railgun terisi: bidikan mengunci posisi kendaraan menjelang tembak — bergerak = selamat
      const C = D.ch, T0 = crK(R.ch); C.t += dt;
      if (!C.lk && C.t >= T0 * R.lock) { C.lk = true; C.x = v.x; C.y = v.y; }
      if (C.t >= T0) {
        const hit = live && Math.hypot(v.x - C.x, v.y - C.y) < R.miss;
        if (hit) hurt(v, crK(R.dmg), 'ap', u);
        crEv('rfire', u, { tg: v, x: C.x, y: C.y, hit });
        D.n++; D.ch = null; D.k = crK(R.cd);
        if (D.n % crK(R.burst) === 0) u.cr.rail = 0;   // tiap beberapa tembakan: Railing Power menyusul
      }
    } else if (live) { D.k -= dt; if (D.k <= 0 && (!u.jf || u.alt > 15)) { D.ch = { t: 0 }; crEv('rch', u, { tg: v, T: crK(R.ch) }); } }
    if (u.jf && u.cr.rail <= 0 && u.alt > 25) crayRail(u);
    return true;
  }
  function crayTick(u, dt, T) {   // true = gerak diatur di sini (raidMove dilewati)
    const C = u.cr; for (const k in C) C[k] -= dt;
    u.dash = 1; if (u.duel) duelCheck(u, dt);
    if (u.crSw && u.crSw.length) crSwTick(u, dt);
    if (u.act && (u.act.k === 'jce' || u.act.k === 'cut')) { crayAct(u, dt); if (u.act) return true; }   // jurus darat yang sedang berjalan diselesaikan dulu
    if (u.rduel && !u.duel) return rduelTick(u, dt, T);
    if (u.act) { crayAct(u, dt); if (u.act) return true; }
    if (u.duel) return crayDuel(u, dt, T);
    if (u.jf) { if (C.rail <= 0 && u.alt > 25 && Q.t >= u.jt0) crayRail(u); return false; }
    if (C.jce <= 0) { if (crayJce(u)) return true; C.jce = 1.5; }
    if (C.cut <= 0) { if (crayCut(u)) return true; C.cut = .6; }
    return false;
  }

  /* ---------------- SANG JENDERAL (v2.12): HANTAMAN BUMI ----------------
     melompat tinggi ke gerombolan lawan (atau operator yang memburunya) lalu menghantamkan pedang besar ke tanah: gelombang kejut melukai &
     melumpuhkan sesaat semua unit darat lawan di sekitar titik jatuh */
  const SLAM = { cd: 15, rng: 170, min: 2, r: 32, dur: 1.15, h: 16, dmgV: 260, dmgI: 300, op: 30, stun: 1.6 };
  war.SLAM = SLAM;
  function warlordSlam(u) {
    const L0 = crFoes(u.x, u.y, u.team, SLAM.rng, true).filter(e => e.player ? opKnows(u, e) : e.seen[u.team]);
    if (!L0.length) return false;
    let best = null, bn = 0;
    for (const a of L0) { let c = a.player ? 2 : 0; for (const b of L0) if (Math.abs(a.x - b.x) < SLAM.r && Math.abs(a.y - b.y) < SLAM.r) c++; if (c > bn) { bn = c; best = a; } }
    if (!best || bn < SLAM.min) return false;
    const a = Math.atan2(best.y - u.y, best.x - u.x), d = Math.max(0, dist(u, best) - 5);
    u.act = { k: 'leap', t: 0, x0: u.x, y0: u.y, x1: u.x + Math.cos(a) * d, y1: u.y + Math.sin(a) * d }; u.path = []; u.face = u.hdg = a;
    crEv('leap', u, {}); if (!u.slam1) { u.slam1 = true; bossEv('w_fwar_slam', u); }
    return true;
  }
  function warlordAct(u, dt) {
    const A = u.act; A.t += dt; const k = Math.min(1, A.t / SLAM.dur), e = k < .5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
    u.x = A.x0 + (A.x1 - A.x0) * e; u.y = A.y0 + (A.y1 - A.y0) * e; u.lz = 4 * SLAM.h * k * (1 - k);
    if (k >= 1) {
      u.lz = 0; u.act = null; u.slT = SLAM.cd * (u.bph >= 2 ? .65 : 1);
      for (const f of crFoes(u.x, u.y, u.team, SLAM.r, true)) {
        const q = 1 - .5 * Math.min(1, dist(u, f) / SLAM.r);
        if (f.player) hurt(f, SLAM.op * q, 'small', u); else { hurt(f, (f.armor === 'inf' ? SLAM.dmgI : SLAM.dmgV) * q, 'bomb', u); if (!f.dead) f.stunT = Q.t + SLAM.stun; }
      }
      fx('boom', u.x, u.y, .7, SLAM.r * .7); fx('wreck', u.x, u.y, 30, 12); crEv('slam', u, { r: SLAM.r });
    }
  }
  function bossTick(u, dt, T) {
    if (u.act && u.boss === 'WARLORD') { warlordAct(u, dt); return; }   // sedang melompat (Hantaman Bumi)
    const eng = u.cr && (u.act || u.duel) ? false : combat(u), h = u.home, f = u.hp / u.hpMax, ph3 = T.final || T.raid;
    if (u.bph < 1 && f < (ph3 ? .66 : .5)) { u.bph = 1; bossPhase(u, 1); }
    if (ph3 && u.bph < 2 && f < .33) { u.bph = 2; bossPhase(u, 2); }
    if (T.raid) { if (u.boss === 'CLAY') { if (!crayTick(u, dt, T)) raidMove(u, dt, T); clayJet(u, dt, T); cmdrTools(u, dt, eng && !u.duel); } else raidMove(u, dt, T); return; }
    if (u.hunt) finalHunt(u, dt, T);   // bos akhir PROFESIONAL berburu: jangkar "home" maju ke pos kita → markas kita, bos ikut maju & bertempur di sekitarnya
    if (T.orbit) {   // gunship: lingkaran tetap mengitari pos (belok kanan, senjata di sisi kanan menghadap pusat)
      u.ang += T.spd / T.orbit * dt; u.x = h.x + Math.cos(u.ang) * T.orbit; u.y = h.y + Math.sin(u.ang) * T.orbit; u.hdg = u.ang + Math.PI / 2; if (!eng) u.face = u.bsus && u.bsus.end > Q.t ? Math.atan2(u.bsus.y - u.y, u.bsus.x - u.x) : u.hdg; return;
    }
    if (u.fly) {     // balon udara: melayang pelan berputar di atas pos
      u.ang += dt * .06; u.path = [{ x: h.x + Math.cos(u.ang) * 140, y: h.y + Math.sin(u.ang) * 140 }]; follow(u, dt); return;
    }
    u.repath -= dt;
    const leash = T.leash || 300, dh = Math.hypot(u.x - h.x, u.y - h.y);
    if (u.repath <= 0) {
      u.repath = 1.5;
      if (dh > leash) setPath(u, h.x + rand(-30, 30), h.y + rand(-30, 30));
      else if (!eng) {   // kejar lawan terlihat terdekat, tapi tetap dalam tali di sekitar pos
        let best = null, bd = leash + maxRange(u);
        for (const L2 of foesOf(u.team)) for (const e of L2) { if (e.dead || e.tc === 'A' || !e.seen[u.team]) continue; const d = Math.hypot(e.x - h.x, e.y - h.y); if (d < bd) { bd = d; best = e; } }
        if (best) { const a = Math.atan2(best.y - h.y, best.x - h.x), r = Math.min(leash * .9, bd); setPath(u, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r); }
        else if (u.bsus && u.bsus.end > Q.t) { const b = u.bsus, a = Math.atan2(b.y - h.y, b.x - h.x), r = Math.min(leash * .85, Math.hypot(b.x - h.x, b.y - h.y)); setPath(u, h.x + Math.cos(a) * r + rand(-12, 12), h.y + Math.sin(a) * r + rand(-12, 12)); u.repath = rand(2.5, 4); }   // curiga: maju ke arah asal tembakan (tetap dalam tali)
        else if (dh > 60) setPath(u, h.x, h.y);
      }
    }
    if (eng && dh <= leash) u.path = [];
    follow(u, dt);
    if (!eng && u.bsus && u.bsus.end > Q.t) u.face = Math.atan2(u.bsus.y - u.y, u.bsus.x - u.x) + Math.sin(Q.t * .9 + u.id) * .6;   // menyapu pandangan ke arah ancaman
    if (u.boss === 'CMDR' || u.boss === 'WARLORD') cmdrTools(u, dt, eng);
    if (u.boss === 'WARLORD') { u.slT = (u.slT === undefined ? 6 : u.slT) - dt; if (u.slT <= 0) { if (!warlordSlam(u)) u.slT = 1.5; } }
    else if (u.boss === 'TITAN') titanTick(u, dt);
  }
  /* ---------------- BOS PENYERBU (SULIT) ----------------
     berangkat bergiliran dari markas musuh (urutan RAIDERS diacak), merebut pos yang lebih dekat ke markas kita satu per satu (darat: ikut
     menduduki pos; WYVERN: menurunkan regu serbu dengan tali), lalu mengepung markas kita dari jarak T.siege. Berhenti maju untuk bertempur
     bila ada lawan dalam T.halt; pos yang ditahan pasukan kita > 80 dtk dilewati */
  function finalHunt(u, dt, T) {
    let g = u.goal;
    if (g && g !== Q.hqB && (g.owner !== 'B' || (u.holdT || 0) > 100)) g = null;   // pos sudah jatuh / terlalu lama bertahan: lanjut
    if (!g) {
      let best = null, bd = 1e12; for (const o of Q.objs) if (o.owner === 'B') { const d = Math.hypot(o.x - u.home.x, o.y - u.home.y); if (d < bd) { bd = d; best = o; } }
      g = u.goal = best || Q.hqB; u.holdT = 0; bossEv(g === Q.hqB ? 'w_final_base' : 'w_final_post', u, { o: g.name || '' });
    }
    const air = T.orbit || u.fly, stand = g === Q.hqB ? (air ? 380 : 300) : (air ? 120 : 60);
    const dx = g.x - u.home.x, dy = g.y - u.home.y, d = Math.hypot(dx, dy);
    if (d > stand) { const s = Math.min(d - stand, (T.spd || 12) * (air ? .6 : 1) * dt); u.home = { x: u.home.x + dx / d * s, y: u.home.y + dy / d * s }; }
    else u.holdT = (u.holdT || 0) + dt;
  }
  function raidGoal(u) {
    const dB = dist(u, Q.hqB); let best = null, bd = 1e12;
    for (const o of Q.objs) {
      if (o.owner === 'R' || (u.skip && u.skip.includes(o)) || dist(o, Q.hqB) > dB - 150) continue;
      const d = dist(u, o); if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function raidEscort(u, types, chute, stay) {   // pengawal: mengikuti bos, atau (stay) tinggal menduduki pos tempat diturunkan
    types.forEach((t, i) => {
      const e = mk('R', t, u.x + rand(-60, 60), u.y + rand(-60, 60), { garr: true });
      if (chute) { e.chute = 3.5; fx('chute', e.x, e.y, 3.5, 0, { u: e }); }
      if (!stay) e.order = { k: 'follow', tgt: u, dist: 60 + i * 8, ang: rand(-1.2, 1.2) };
    });
  }
  function raidMove(u, dt, T) {
    u.repath -= dt; u.dropT = (u.dropT || 0) - dt;
    let g = u.goal;
    if (g && g !== Q.hqB && (g.owner === 'R' || u.holdT > 80)) { if (g.owner !== 'R') (u.skip || (u.skip = [])).push(g); g = null; }   // pos sudah direbut / terlalu lama ditahan: lanjut
    if (!g) { g = u.goal = raidGoal(u) || Q.hqB; u.holdT = 0; u.repath = 0; u.path = []; bossEv(g === Q.hqB ? 'w_raid_base' : 'w_raid_post', u, { o: g.name }); }
    const base = g === Q.hqB, d = dist(u, g), at = base ? d < T.siege : d < g.r * .5;
    if (at) {
      u.holdT += dt;
      if (u.fly && !u.jf) { u.ang += dt * .1; const r = base ? T.siege * .9 : 110; u.path = [{ x: g.x + Math.cos(u.ang) * r, y: g.y + Math.sin(u.ang) * r }]; follow(u, dt); }   // mengitari pos / markas
      else u.path = [];
      if (u.fly && !u.jf && !base && u.dropT <= 0) { u.dropT = 28; raidEscort(u, ['SF', 'SF', 'SF', 'SF', 'INF', 'INF'], true, true); bossEv('w_raid_drop', u, { o: g.name }); }
      return;
    }
    if (u.tg.some(t => t && !t.dead && dist(u, t) < T.halt)) { u.path = []; return; }   // lawan dekat: berhenti & bertempur
    if (u.repath <= 0 || !u.path.length) {
      u.repath = 4; const a = Math.atan2(u.y - g.y, u.x - g.x), r = base ? T.siege * .8 : g.r * .25, tx = g.x + Math.cos(a) * r, ty = g.y + Math.sin(a) * r;
      setPath(u, tx, ty); if (!u.path.length) u.path = [{ x: tx, y: ty }];
    }
    follow(u, dt);
  }
  function raidWatch(dt) {
    const D = DIFF[Q.diff]; if (!D.raid || Q.raidN >= RAIDERS.length) return;
    Q.raidT -= dt; if (Q.raidT > 0) return; Q.raidT = D.raid[1];
    const h = Q.hqR; if (!h || h.dead) return;
    const u = spawnBoss(Q.raidQ[Q.raidN++], h.x - 240, h.y + rand(-90, 90), null); u.stance = 'AGGR'; u.seenB = true; u.intel = true; if (UT[u.type].esc) raidEscort(u, UT[u.type].esc);
    if (u.type === 'CLAY') { crayInit(u); if (D.pro) raidEscort(u, ['SF', 'SF', 'SF', 'SF', 'AT', 'AT']); }   // PRO: bos terkuat — nyawa ×3, damage ×1,35, pengawal ganda
    bossEv('w_raid_spawn', u, { n: Q.raidN, m: RAIDERS.length }); TK.sfx(90, 1.2, 'sawtooth', .09);
  }
  war.raidNow = function (type) {   // uji: luncurkan bos penyerbu berikutnya sekarang (atau tipe tertentu)
    if (type) { const i = Q.raidQ.indexOf(type, Q.raidN); if (i > Q.raidN) [Q.raidQ[i], Q.raidQ[Q.raidN]] = [Q.raidQ[Q.raidN], Q.raidQ[i]]; }
    Q.raidT = 0; const d = Q.diff; if (!DIFF[d].raid) return null; raidWatch(0); return Q.units.find(u => u.boss && UT[u.type].raid && !u.dead && u.born === Q.t) || null;
  };
  function bossWatch(dt) {
    Q.bossT -= dt; if (Q.bossT > 0) return; Q.bossT = .5;
    const B = (TL.B || []).filter(u => !u.fly && !u.jet);
    for (const o of Q.objs) {   // umumkan mini bos saat pasukan kita / operator mendekati posnya
      const b = o.boss; if (!b || b.dead || b.seenB) continue;
      if (B.some(u => Math.hypot(u.x - o.x, u.y - o.y) < 800)) { b.seenB = true; bossEv('w_boss_near', b, { o: o.name }); }
    }
    const D = DIFF[Q.diff]; if (!D.pro) return;
    const h = Q.hqR; if (!h || h.dead) return;
    const threat = h.hp < h.hpMax * .95 || B.some(u => Math.hypot(u.x - h.x, u.y - h.y) < 750);
    if (Q.fb) {   // bos akhir sedang berburu tapi markasnya diserang: putar balik mempertahankan markas
      const f = Q.fb; if (!f.dead && f.hunt && threat) { f.hunt = false; f.home = { x: h.x - (UT[f.type].fly ? 380 : 140), y: h.y }; f.path = []; f.repath = 0; bossEv('w_final_back', f); }
      return;
    }
    const hunt = !threat && D.fbHunt && (Q.t > D.fbHunt || Q.objs.filter(o => o.owner === 'B').length >= 3);
    if (threat || hunt) {   // bos akhir keluar dari hanggar markas
      const ft = Q.fbType || 'LEVI', air = UT[ft].fly;   // penerbang: berputar di atas sisi depan markas; darat: keluar dari hanggar
      Q.fb = spawnBoss(ft, h.x - (air ? 380 : 200), h.y); if (!air) Q.fb.x = h.x - 120; Q.fb.seenB = true;
      if (hunt) { Q.fb.hunt = true; Q.fb.intel = true; Q.fb.stance = 'AGGR'; }
      bossEv(hunt ? 'w_final_hunt' : 'w_final_spawn', Q.fb); TK.sfx(70, 1.4, 'sawtooth', .1);
    }
  }

  /* ---------------- SATGAS SERBU (pihak kita, otomatis) ----------------
     5 Kopassus, 3 tank, 3 jip, 2 heli serang, 3 paramedis berangkat dari markas kita dan merebut pos yang belum milik kita satu per satu
     (pos terdekat ke rombongan); pos jatuh → lanjut ke pos berikutnya. Pos ditahan musuh > SAT_HOLD dtk dilewati dulu. Semua pos milik
     kita → berjaga di pos yang sedang diserang / pos paling depan. Anggota gugur diganti dari markas tiap SAT_REF dtk; kekuatan darat
     < 45% → mundur berkumpul di pos kita terdekat (bala bantuan tiap 30 dtk) lalu menyerang lagi setelah ≥ 90%.
     Tidak menerima perintah pemain (mine() & popB() melewatinya) — pasukan kiriman / rekrutan pemain tetap ikut perintah pemain */
  const SATGAS = [['SF', 5], ['TANK', 3], ['JEEP', 3], ['HELI', 2], ['MEDIC', 3]], SAT_REF = 60, SAT_HOLD = 150;
  function satEv(key, v) { L(Tt(key, v), 'i'); if (war.hooks.sat) war.hooks.sat(key, v); }
  function satFill(first) {
    const h = Q.hqB; if (!h || h.dead) return 0;
    let n = 0;
    for (const [t, k] of SATGAS) {
      const fly = UT[t].fly;
      for (let i = Q.units.filter(u => u.sat && !u.dead && u.type === t).length; i < k; i++) {
        let x = h.x + (fly ? rand(20, 60) : rand(300, 360)), y = h.y + rand(-1, 1) * (fly ? 60 : 160), j = 0;
        while (!fly && j < 12 && terAt(x, y) === W.TER.WATER) { x += (h.x - x) * .15; y += (h.y - y) * .15; j++; }   // titik di air: geser ke arah markas
        const su = mk('B', t, x, y, { sat: true, base: true, stance: 'AGGR' }); n++;   // base: tidak dilemahkan seperti garnisun markas
        if (GEARH[t] && !(war.hooks.roofAt && war.hooks.roofAt(x, y))) park(su, 'spin');   // heli satgas: rotor berputar dulu, baru naik
      }
    }
    if (n && !first) satEv('w_sat_fill', { n });
    return n;
  }
  function satGoal(cx, cy) {
    const S = Q.sat, free = Q.objs.filter(o => o.owner !== 'B');
    let c = free.filter(o => !S.skip.includes(o)); if (!c.length && free.length) { S.skip = []; c = free; }
    if (c.length) { let best = null, bd = 1e12; for (const o of c) { const d = Math.hypot(o.x - cx, o.y - cy) + dist(o, Q.hqB) * .5; if (d < bd) { bd = d; best = o; } } return { o: best, def: false }; }   // pos dekat markas kita didahulukan (termasuk merebut kembali)
    let best = null, bs = -1e12;   // semua pos milik kita: jaga yang diserang, kalau aman pos paling dekat ke markas musuh
    for (const o of Q.objs) {
      let thr = 0; for (const e of TL.R || []) if (!e.dead && !e.struct && Math.hypot(e.x - o.x, e.y - o.y) < o.r * 1.6) thr++;
      const sc = thr * 1000 + (1 - o.prog) * 500 - (Q.hqR ? dist(o, Q.hqR) : 0) * .1; if (sc > bs) { bs = sc; best = o; }
    }
    return { o: best, def: true };
  }
  function satTick(dt) {
    const S = Q.sat; if (!S) return;
    S.refT -= dt; if (S.refT <= 0) { S.refT = S.rally ? SAT_REF / 2 : SAT_REF; satFill(false); }
    S.t -= dt; if (S.t > 0) return; S.t = 2;
    const us = Q.units.filter(u => u.sat && !u.dead); if (!us.length) return;
    const gr = us.filter(u => !u.fly && !UT[u.type].heal), core = gr.length ? gr : us, full = SATGAS.reduce((a, [t, k]) => a + (UT[t].fly || UT[t].heal ? 0 : k), 0);
    let cx = 0, cy = 0; core.forEach(u => { cx += u.x / core.length; cy += u.y / core.length; });
    if (!S.rally && gr.length < full * .45) {   // terlalu lemah: mundur ke pos kita terdekat (atau depan markas), tunggu bala bantuan
      let rp = null, bd = 1e12; for (const o of Q.objs) if (o.owner === 'B') { const d = Math.hypot(o.x - cx, o.y - cy); if (d < bd) { bd = d; rp = o; } }
      const h = Q.hqB; S.rally = rp || { name: '', x: h.x + 330, y: h.y, r: 220 }; S.goal = S.rally; S.def = true; S.refT = Math.min(S.refT, SAT_REF / 2); satEv('w_sat_fall', { o: rp ? Tt('w_sat_post', { o: rp.name }) : Tt('wu_HQ') });
    } else if (S.rally && gr.length >= full * .9) { S.rally = null; S.goal = null; S.def = false; }   // pulih: serang lagi
    let g = S.goal;
    if (g && !S.def) {
      if (g.owner === 'B') { satEv('w_sat_cap', { o: g.name }); g = null; }
      else if (Math.hypot(cx - g.x, cy - g.y) < g.r * 1.6 && (S.holdT += 2) > SAT_HOLD) { S.skip.push(g); g = null; }   // terlalu lama tertahan: coba pos lain dulu
    }
    if (!S.rally && (!g || S.def)) {
      const r = satGoal(cx, cy);
      if (r.o !== S.goal || r.def !== S.def || !g) { S.goal = g = r.o; S.def = r.def; S.holdT = 0; if (g) satEv(S.def ? 'w_sat_def' : 'w_sat_go', { o: g.name }); }
    }
    if (!g) return;
    const k = Math.min(1, g.r * .42 / (26 * Math.ceil(Math.sqrt(core.length))));   // sebar di dalam lingkar pos (harus di dalam untuk merebut)
    let gi = 0;
    us.forEach((u, i) => {
      if (u.order.k === 'exit' || u.chute > 0) return;
      if (UT[u.type].heal) {   // paramedis: menempel pada anggota darat rombongan, menyembuhkan dalam radiusnya
        const o = u.order; if (o.k !== 'follow' || !o.tgt || o.tgt.dead || !o.tgt.sat) u.order = { k: 'follow', tgt: core[i % core.length], dist: 35, ang: rand(-1, 1) };
        return;
      }
      if (u.fly) {   // heli serang: mengitari pos sasaran, menembaki pertahanannya
        u.sang = (u.sang === undefined ? rand(0, 6.28) : u.sang) + .22;
        if (!u.tg.some(t => t && !t.dead)) { const r = g.r * .8; u.order = { k: 'amove', x: g.x + Math.cos(u.sang) * r, y: g.y + Math.sin(u.sang) * r }; u.path = [{ x: u.order.x, y: u.order.y }]; }
        return;
      }
      const o = spiral(gi++), tx = g.x + o[0] * k, ty = g.y + o[1] * k;
      if (u.sg !== g || (u.order.k === 'idle' && Math.hypot(u.x - tx, u.y - ty) > 40)) { u.sg = g; u.order = { k: 'amove', x: tx, y: ty }; setPath(u, tx, ty); }
    });
  }
  war.satgas = () => Q.units.filter(u => u.sat && !u.dead);   // uji / tampilan

  /* ---------------- STEP ---------------- */
  function step(dt) {
    Q.t += dt; teams();
    const D = DIFF[Q.diff], nobj = Q.objs.filter(o => o.owner === 'B').length, nobjR = Q.objs.filter(o => o.owner === 'R').length;
    Q.inc = 50 + nobj * 15; Q.cr += Q.inc * dt; Q.crR += (D.inc + nobjR * 7) * dt;

    for (const p of Q.pend) p.t -= dt;
    Q.pend.filter(p => p.t <= 0).forEach(finishDeploy); Q.pend = Q.pend.filter(p => p.t > 0);

    Q.visT -= dt; if (Q.visT <= 0) { updateVis(); Q.visT = .3; }
    for (const u of Q.units) if (!u.dead) updateUnit(u, dt);
    updateProjs(dt); updateObjs(dt);
    Q.hospT = (Q.hospT || 0) - dt;   // pangkalan = rumah sakit lapangan: unit darat pulih 3 persen per detik di zona gelar
    if (Q.hospT <= 0) {
      Q.hospT = .5;
      for (const u of Q.units) if (u.team === 'B' && !u.dead && !u.struct && u.tc !== 'A' && u.hp < u.hpMax && inZone(u.x, u.y)) { u.hp = Math.min(u.hpMax, u.hp + u.hpMax * .015); u.healT = Q.t; }
    }

    // pisahkan unit darat agar tidak menumpuk — grid 24 m: hanya tetangga 3×3 sel yang dicek (bukan semua pasangan; ratusan prajurit MUDAH)
    const g = Q.units.filter(u => !u.dead && !u.fly && !u.jet && !u.struct && u.chute <= 0 && !u.player && !u.manning && !u.inV), SG = new Map(), sk = (x, y) => (x + 64) * 8192 + y + 64;   // awak SMB terpaku di sarangnya
    for (let i = 0; i < g.length; i++) { const k = sk(Math.floor(g[i].x / 24), Math.floor(g[i].y / 24)); let a = SG.get(k); if (!a) SG.set(k, a = []); a.push(i); }
    for (let i = 0; i < g.length; i++) {
      const a = g[i], cx = Math.floor(a.x / 24), cy = Math.floor(a.y / 24);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const L2 = SG.get(sk(cx + ox, cy + oy)); if (!L2) continue;
        for (const j of L2) {
          if (j <= i) continue;
          const b = g[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (a.order.k === 'board' || b.order.k === 'board') continue;   // pasukan yang sedang naik kendaraan boleh mendekatinya
          const ia = a.armor === 'inf', ib = b.armor === 'inf', iv = ia !== ib, sp = ia && ib ? 9 : iv ? 7 : 24;   // antar-prajurit 9 m (regu tetap rapat), prajurit–kendaraan 7 m, antar-kendaraan 24 m
          if (d2 > 0 && d2 < sp * sp && a.tc === b.tc) {   // unit yang bertahan (HOLD & diam) berjangkar: yang lewat yang menyingkir; kendaraan tidak didorong prajurit (dulu tergeser menyamping)
            const d = Math.sqrt(d2), p = (sp - d) * .5 * Math.min(1, dt * (sp > 9 ? 1.2 : 4)), ha = iv ? ib : a.stance === 'HOLD' && a.order.k === 'idle', hb = iv ? ia : b.stance === 'HOLD' && b.order.k === 'idle';
            const pa = ha === hb ? p : ha ? 0 : 2 * p, pb = ha === hb ? p : hb ? 0 : 2 * p;
            a.x -= dx / d * pa; a.y -= dy / d * pa; b.x += dx / d * pb; b.y += dy / d * pb;
          }
        }
      }
    }
    if (war.hooks.navAll) war.hooks.navAll(g);   // mode FPS: unit darat yang terdorong ke dalam tapak gedung dikeluarkan
    for (const f of Q.fx) f.t += dt;
    Q.fx = Q.fx.filter(f => f.t < f.d);
    if (!Q.over) { ai(dt); facTick(dt); sortieTick(dt); nukeTick(dt); spawnWave(); bossWatch(dt); raidWatch(dt); strikeTick(dt); satTick(dt); }
    Q.units = Q.units.filter(u => !u.dead);
    Q.sel = Q.sel.filter(u => !u.dead);
  }
  war.update = function (rdt) {
    if (Q.paused || Q.over) return;
    let dt = rdt * Q.speed; const n = Math.max(1, Math.ceil(dt / .05)); dt /= n;
    for (let i = 0; i < n; i++) step(dt);
  };
  war.visibleToB = visibleToB;
  war.terAt = terAt;
  war.popB = popB; war.POP_CAP = POP_CAP;
  war.setDiff = d => { Q.diff = d; war.reset(d); return true; };
  war.maxRange = maxRange;
  war.BAL = { dmg: DMG_B, take: TAKE_B, hpf: HPF };   // koefisien pelatihan (dipakai model prediksi NEXUS)
  // dipakai modul FPS
  Object.assign(war, { hurt, explode, kill, jetRun, fx, setPath, inZone, hqOf, redTarget });
  war.crayInit = crayInit; war.crayProvoke = crayProvoke;
  war.DIFF = DIFF; war.BOSSES = BOSSES; war.FINALS = FINALS; war.RAIDERS = RAIDERS; war.spawnBoss = spawnBoss; war.spawnRed = spawnRed;
  war.shell = function (src, sx, sy, tx, ty, dmg, aoe, delay) {   // proyektil mortir/artileri bantuan
    Q.projs.push({ x: sx, y: sy, sx, sy, team: 'B', src, dmg, dt: 'he', aoe, t: -delay, tgt: null, tx, ty, kind: 'shell', dur: Math.max(.8, Math.hypot(tx - sx, ty - sy) / 380) });
  };
})();
