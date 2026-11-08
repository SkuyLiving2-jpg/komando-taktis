/* ============================================================
   NEXUS — inti kognitif komando (AI pendukung keputusan)
   Semua analisis hanya memakai apa yang DIKETAHUI pihak kita:
   unit yang terlihat, memori kontak, dan estimasi intelijen.

   1. Memori taktis      w = e^(−Δt/τ)                      (kepercayaan meluruh)
   2. Filter α-β         x̂ = x̂⁻ + α·(z − x̂⁻) ;  v̂ = v̂ + (β/Δt)·(z − x̂⁻)
   3. Peta pengaruh      I(p) = Σ pᵤ·(1 − d/Rᵤ)²
   4. Garis depan        kontur I_B − I_R = 0  (marching squares)
   5. Lanchester kuadrat dB/dt = −ρ·R , dR/dt = −β·B  ⇒  menang ⟺ F_B·H_B > F_R·H_R
   6. Monte Carlo        P = (1/N)·Σ 1[ ln S_B + ε_B > ln S_R + ln(1+h) + ε_R ]
   7. Rekomendasi        utilitas per aturan doktrin → urut → alasan + keyakinan
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, UT = W.UT, war = TK.war, Q = war.Q;
  const { clamp, rand } = TK.util;
  const Tt = (k, v) => TK.t(k, v), L = (m, lv) => TK.log(m, lv);
  const NX = 50, NY = 32, CS = W.WW / NX;          // sel analisis 100 m
  const TAU = 45, PRED = 15, MC_N = 500, ALPHA = .55, BETA = .22;
  const STRUCT_H = .4;                               // struktur diam: daya tahan dihitung sebagian

  const N = TK.nexus = {
    NX, NY, CS, PRED, MC_N, TAU,
    on: { overlay: false, auto: false, voice: false },
    mem: new Map(), IB: new Float32Array(NX * NY), IR: new Float32Array(NX * NY),
    front: [], recs: [], hist: [], p: .5, pRaw: .5, ratio: 1, unc: 0, mom: 0, sB: 0, sR: 0,
    stats: { tracks: 0, ghosts: 0, cells: NX * NY, front: 0 }, feat: null, ready: false, autoT: 3, histT: 0, g: null, last: -1, speak: null
  };

  /* ---------- daya tempur per tipe (dalam satuan "regu infanteri") ---------- */
  const POW = {};
  for (const k in UT) {
    const T = UT[k]; let g = 0, a = 0, ap = 0, rng = 0;
    for (const w of T.w) {
      const m = W.MULT[w.dt] || W.MULT.small;
      let d = w.dmg / Math.max(.1, w.cd) * (w.salvo || 1) * (w.acc || 1) * (w.aoe ? 1.6 : 1);
      if (w.manual) d = w.dmg * (T.bombs || 1) / 25;
      if (w.vs.includes('G')) g += d * (m.inf + m.light + m.heavy) / 3;
      if (w.vs.includes('A')) a += d * m.air;
      if (w.dt === 'ap' && w.vs.includes('G')) ap += d;
      rng = Math.max(rng, w.manual ? 400 : w.rng);
    }
    POW[k] = { g, a, ap, rng: clamp(rng, 250, 1000) };
  }
  const REF = POW.INF.g, REFP = Math.sqrt((REF + .6) * UT.INF.hp);
  for (const k in POW) { const P = POW[k]; P.g /= REF; P.a /= REF; P.ap /= REF; P.unit = Math.sqrt((P.g * REF + P.a * REF * .5 + .6) * UT[k].hp) / REFP; }
  N.POW = POW;

  const ci = (x, y) => clamp(Math.floor(y / CS), 0, NY - 1) * NX + clamp(Math.floor(x / CS), 0, NX - 1);
  N.sector = (x, y) => String.fromCharCode(65 + clamp(Math.floor(x / 500), 0, 9)) + (clamp(Math.floor(y / 500), 0, 6) + 1);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * v); };
  const mobile = u => !u.dead && !u.struct && !u.player && u.chute <= 0;

  /* ---------- 1+2. memori taktis & filter α-β ---------- */
  function track(m, zx, zy, t) {
    const dt = t - m.tu; if (dt <= 1e-3) return;
    const px = m.x + m.vx * dt, py = m.y + m.vy * dt, rx = zx - px, ry = zy - py;
    m.x = px + ALPHA * rx; m.y = py + ALPHA * ry; m.vx += BETA / dt * rx; m.vy += BETA / dt * ry; m.tu = t;
    const s = Math.hypot(m.vx, m.vy), mx = UT[m.type].spd * 1.5 + 1;
    if (s > mx) { m.vx *= mx / s; m.vy *= mx / s; }
  }
  function known() {
    const t = Q.t, K = [], live = new Set();
    for (const u of Q.units) {
      if (u.dead) continue;
      if (u.team === 'B') { K.push({ team: 'B', type: u.type, x: u.x, y: u.y, hp: u.hp, hpMax: u.hpMax, struct: u.struct, tc: u.tc, armor: u.armor, w: 1, u }); continue; }
      live.add(u.id);
      if (!(u.seen.B || (u.struct && u.spotted))) continue;
      let m = N.mem.get(u.id);
      if (!m) { m = { id: u.id, type: u.type, x: u.x, y: u.y, vx: 0, vy: 0, tu: t, struct: u.struct, tc: u.tc, armor: u.armor, hpMax: u.hpMax }; N.mem.set(u.id, m); }
      else track(m, u.x, u.y, t);
      m.t = t; m.hp = u.hp; m.zx = u.x; m.zy = u.y;
    }
    let tracks = 0, ghosts = 0;
    for (const [id, m] of N.mem) {
      const age = t - m.t;
      if ((!live.has(id) && age < 1.5) || age > TAU * 4) { N.mem.delete(id); continue; }   // hancur di depan mata / sudah terlalu basi
      const vis = age < .05, w = vis || m.struct ? 1 : Math.exp(-age / TAU), k = Math.min(age, 8);
      m.vis = vis; m.w = w; vis ? tracks++ : ghosts++;
      K.push({ team: 'R', type: m.type, x: vis ? m.zx : m.x + m.vx * k, y: vis ? m.zy : m.y + m.vy * k, hp: m.hp, hpMax: m.hpMax, struct: m.struct, tc: m.tc, armor: m.armor, w, m });
    }
    N.stats.tracks = tracks; N.stats.ghosts = ghosts;
    return K;
  }

  /* ---------- 3. peta pengaruh ---------- */
  function influence(K) {
    const IB = N.IB.fill(0), IR = N.IR.fill(0), bal = Math.sqrt(war.BAL.dmg / war.BAL.take);
    for (const k of K) {
      const P = POW[k.type]; if (!P) continue;
      const pw = P.unit * Math.sqrt(clamp(k.hp / k.hpMax, .05, 1)) * k.w * (k.team === 'B' ? bal : 1); if (pw < .02) continue;
      const rc = P.rng / CS, cx = k.x / CS, cy = k.y / CS, A = k.team === 'B' ? IB : IR;
      const y0 = Math.max(0, Math.floor(cy - rc)), y1 = Math.min(NY - 1, Math.ceil(cy + rc)), x0 = Math.max(0, Math.floor(cx - rc)), x1 = Math.min(NX - 1, Math.ceil(cx + rc));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + .5 - cx, y + .5 - cy) / rc; if (d >= 1) continue;
        A[y * NX + x] += pw * (1 - d) * (1 - d);
      }
    }
  }
  N.at = (x, y) => { const i = ci(x, y); return { b: N.IB[i], r: N.IR[i] }; };

  /* ---------- 4. garis depan (marching squares pada D = I_B − I_R) ---------- */
  function frontLine() {
    const IB = N.IB, IR = N.IR, seg = [], TH = .35;
    const v = i => IB[i] - IR[i], ok = i => IB[i] > TH && IR[i] > TH * .6 || IR[i] > TH && IB[i] > TH * .6;
    const P = (x, y) => [(x + .5) * CS, (y + .5) * CS];
    const lerp = (a, b, va, vb) => { const k = va / (va - vb); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
    for (let y = 0; y < NY - 1; y++) for (let x = 0; x < NX - 1; x++) {
      const i0 = y * NX + x, i1 = i0 + 1, i2 = i0 + NX + 1, i3 = i0 + NX;
      if (!(ok(i0) || ok(i1) || ok(i2) || ok(i3))) continue;
      const a = v(i0), b = v(i1), c = v(i2), d = v(i3);
      const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const pa = P(x, y), pb = P(x + 1, y), pc = P(x + 1, y + 1), pd = P(x, y + 1);
      const T = () => lerp(pa, pb, a, b), R = () => lerp(pb, pc, b, c), B = () => lerp(pd, pc, d, c), Lf = () => lerp(pa, pd, a, d);
      switch (idx) {
        case 1: case 14: seg.push([Lf(), B()]); break;
        case 2: case 13: seg.push([B(), R()]); break;
        case 3: case 12: seg.push([Lf(), R()]); break;
        case 4: case 11: seg.push([T(), R()]); break;
        case 6: case 9: seg.push([T(), B()]); break;
        case 7: case 8: seg.push([Lf(), T()]); break;
        case 5: seg.push([Lf(), T()], [B(), R()]); break;
        case 10: seg.push([T(), R()], [Lf(), B()]); break;
      }
    }
    N.front = seg; N.stats.front = seg.length;
  }

  /* ---------- 5+6. Lanchester + Monte Carlo ---------- */
  function intelPrior(K) {   // garnisun yang PASTI ada di markas & objektif musuh walau belum terlihat
    const out = [], near = (x, y) => K.reduce((s, k) => s + (k.team === 'R' && Math.hypot(k.x - x, k.y - y) < 420 ? k.w : 0), 0);
    if (Q.hqR && !Q.hqR.dead && near(Q.hqR.x, Q.hqR.y) < 1) out.push(['HQ', 'BNK', 'BNK', 'SAM', 'INF', 'INF', 'INF', 'INF', 'TANK']);
    for (const o of Q.objs) if (o.owner === 'R' && near(o.x, o.y) < 1) out.push(['BNK', 'INF', 'INF', 'INF']);
    return [].concat(...out);
  }
  function assess(K) {
    const bal = war.BAL; let FB = 0, HB = 0, FR = 0, HR = 0, nB = 0, nR = 0;
    for (const k of K) {
      const P = POW[k.type]; if (!P) continue;
      const f = (P.g + P.a * .5) * k.w, h = k.hp * k.w * (k.struct ? STRUCT_H : 1);
      if (k.team === 'B') { FB += f * bal.dmg; HB += h / bal.take; nB++; } else { FR += f; HR += h; nR += k.w; }
    }
    const prior = intelPrior(K);
    for (const t of prior) { const P = POW[t], T = UT[t]; FR += P.g + P.a * .5; HR += (T.struct ? T.hp * STRUCT_H : T.hp * bal.hpf); nR += .5; }
    const oB = Q.objs.filter(o => o.owner === 'B').length, oR = Q.objs.filter(o => o.owner === 'R').length;
    const sB = Math.max(1, FB * HB) * (1 + .1 * oB), sR = Math.max(1, FR * HR) * (1 + .1 * oR);
    let seen = 0; for (let i = 0; i < Q.fog.length; i++) if (Q.fog[i] === 2) seen++;
    const vis = seen / Q.fog.length, hmax = .15 + .85 * (1 - clamp(vis * 2.2, 0, 1));
    const sgB = .18 + .6 / Math.sqrt(nB + 1), sgR = .18 + .6 / Math.sqrt(nR + 1), lr = Math.log(sB / sR);
    let win = 0;
    for (let i = 0; i < MC_N; i++) if (lr + 2 * sgB * gauss() - 2 * sgR * gauss() - Math.log(1 + rand(0, hmax)) > 0) win++;
    N.pRaw = win / MC_N; N.p = N.ready ? N.p * .75 + N.pRaw * .25 : N.pRaw;
    if (Q.over) N.p = Q.over === 'win' ? 1 : 0;
    Object.assign(N, { sB, sR, ratio: sB / sR, unc: hmax, vis, FB, HB, FR, HR, prior: prior.length });
  }

  /* ---------- fitur situasi ---------- */
  function features(K) {
    const F = { airR: 0, jetR: 0, heliR: 0, nAirR: 0, aaB: 0, armR: 0, ax: 0, ay: 0, nArm: 0, apB: 0, gx: 0, gy: 0, ng: 0, wInf: [], wVeh: [], medics: [], repairs: [], arty: [], uav: 0, cluster: null };
    for (const k of K) {
      const P = POW[k.type];
      if (k.team === 'B') {
        F.aaB += P.a; F.apB += P.ap;
        const u = k.u; if (!mobile(u)) continue;
        if (u.type === 'UAV' || u.type === 'UCAV') F.uav++;
        if (u.type === 'MEDIC' || u.type === 'MEDHELI') F.medics.push(u);
        if (u.type === 'REPAIR') F.repairs.push(u);
        if (UT[u.type].w.some(w => w.arc)) F.arty.push(u);
        if (u.tc !== 'G') continue;
        F.gx += u.x; F.gy += u.y; F.ng++;
        if (!war.inZone(u.x, u.y) && u.hp < u.hpMax * .7) (u.armor === 'inf' ? F.wInf : u.armor !== 'air' ? F.wVeh : []).push(u);
      } else {
        if (k.tc === 'A') { F.airR += (P.g + P.a + .4) * k.w; F.nAirR += k.w; if (UT[k.type].jet) F.jetR += k.w; else F.heliR += k.w; }
        else if (!k.struct && (k.armor === 'heavy' || k.armor === 'light')) { F.armR += k.hp * k.w; F.ax += k.x * k.hp * k.w; F.ay += k.y * k.hp * k.w; F.nArm += k.w; }
      }
    }
    if (F.armR) { F.ax /= F.armR; F.ay /= F.armR; }
    F.gc = F.ng ? [F.gx / F.ng, F.gy / F.ng] : [Q.hqB.x + 300, Q.hqB.y];
    // titik garis depan: rata-rata segmen kontur, atau di antara kita dan musuh terdekat
    if (N.front.length) { let x = 0, y = 0; N.front.forEach(s => { x += s[0][0] + s[1][0]; y += s[0][1] + s[1][1]; }); F.front = [x / N.front.length / 2, y / N.front.length / 2]; }
    else { let best = null, bd = 1e12; for (const k of K) if (k.team === 'R') { const d = Math.hypot(k.x - F.gc[0], k.y - F.gc[1]); if (d < bd) { bd = d; best = k; } } F.front = best ? [(best.x + F.gc[0]) / 2, (best.y + F.gc[1]) / 2] : [F.gc[0] + 700, F.gc[1]]; }
    // gugus musuh darat terpadat (sasaran tembakan artileri)
    const R = K.filter(k => k.team === 'R' && k.tc === 'G' && !k.struct); let bestN = 0;
    for (const a of R) {
      let n = 0, v = 0, x = 0, y = 0;
      for (const b of R) if (Math.hypot(a.x - b.x, a.y - b.y) < 250) { n += b.w; v += b.m && b.m.vis ? 1 : 0; x += b.x * b.w; y += b.y * b.w; }
      if (n > bestN && n >= 3 && v >= 2) { bestN = n; F.cluster = { x: x / n, y: y / n, n }; }
    }
    return F;
  }

  /* ---------- penempatan yang sah ---------- */
  function zonePoint(tx, ty) {
    const zs = [[Q.hqB.x, Q.hqB.y, 560]].concat(Q.objs.filter(o => o.owner === 'B').map(o => [o.x, o.y, 340]));
    let best = null, bd = 1e12;
    for (const z of zs) {
      const dx = tx - z[0], dy = ty - z[1], d = Math.hypot(dx, dy) || 1, r = Math.min(d, z[2] * .8), x = z[0] + dx / d * r, y = z[1] + dy / d * r, e = Math.hypot(tx - x, ty - y);
      if (e < bd) { bd = e; best = [x, y]; }
    }
    return best;
  }
  function seaPoint(tx, ty) {
    let best = null, bd = 1e12;
    for (let cy = 0; cy < W.GH; cy++) for (let cx = 0; cx < W.GW; cx++) {
      const x = (cx + .5) * W.CELL, y = (cy + .5) * W.CELL; if (x > 1850 || war.terAt(x, y) !== W.TER.WATER) continue;
      const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  }
  function placeFor(type, tx, ty, drop) {
    const T = UT[type];
    if (T.cat === 'A') return [clamp(tx, 60, W.WW - 60), clamp(ty, 60, W.WH - 60)];
    if (T.cat === 'S') return seaPoint(tx, ty);
    if (drop && T.drop) { const c = war.deployCheck(type, tx, ty); if (c.ok) return [tx, ty]; }
    let p = zonePoint(tx, ty);
    for (let i = 0; i < 8 && p; i++) {
      const c = war.deployCheck(type, p[0], p[1]); if (c.ok && c.mode === 'normal') return p;
      p = [p[0] + (Q.hqB.x - p[0]) * .3, p[1] + (Q.hqB.y - p[1]) * .3];
    }
    return [Q.hqB.x + 90, Q.hqB.y];
  }
  N.placeFor = placeFor;
  const backOff = (x, y, d) => { const a = Math.atan2(Q.hqB.y - y, Q.hqB.x - x); return [x + Math.cos(a) * d, y + Math.sin(a) * d]; };

  /* ---------- 7. mesin rekomendasi ---------- */
  function recommend(F) {
    const R = [], cr = Q.cr, IB = N.IB, IR = N.IR;
    const add = o => {
      o.n = o.n || 1;
      if (o.act === 'deploy') { if (!o.x && o.x !== 0) return; const c = war.deployCheck(o.type, o.x, o.y); if (!c.ok) return; o.cost = c.cost * o.n; o.mode = c.mode; }
      else o.cost = 0;
      o.util = clamp(o.util, 0, 1); o.afford = cr >= o.cost; o.score = o.util * (o.afford ? 1 : .7);
      o.conf = clamp(Math.round(100 * (1 - Math.exp(-2.2 * o.util))), 30, 97); o.sec = N.sector(o.x, o.y); R.push(o);
    };
    const dep = (o, drop) => { const p = placeFor(o.type, o.tx, o.ty, drop); if (!p) return; o.x = p[0]; o.y = p[1]; o.act = 'deploy'; add(o); };

    // ancaman udara → payung hanud
    if (F.airR > .3) {
      const need = F.airR / (F.airR + F.aaB * .8);
      if (need > .35) dep({ id: 'air', type: F.jetR > F.heliR ? 'AA' : 'ZSU', tx: F.front[0], ty: F.front[1], util: need * .95, why: ['nx_r_air', { n: Math.round(F.nAirR), a: F.airR.toFixed(1), b: F.aaB.toFixed(1) }] });
    }
    // lapis baja musuh → antitank / tank
    if (F.armR > 250) {
      const need = F.armR / (F.armR + F.apB * 70), type = need > .65 && cr >= UT.TANK.cost ? 'TANK' : 'AT', p = backOff(F.ax, F.ay, 420);
      if (need > .35) dep({ id: 'arm', type, n: type === 'AT' ? 2 : 1, tx: p[0], ty: p[1], util: need * .9, why: ['nx_r_arm', { n: Math.round(F.nArm), h: Math.round(F.armR), b: F.apB.toFixed(1) }] }, IR[ci(p[0], p[1])] < 1.2);
    }
    // korban luka di medan → medis / perbaikan
    const near = (list, us) => list.some(m => us.some(u => Math.hypot(m.x - u.x, m.y - u.y) < 350));
    const cen = us => [us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.y, 0) / us.length];
    if (F.wInf.length >= 3 && !near(F.medics, F.wInf)) { const c = backOff(...cen(F.wInf), 70); dep({ id: 'med', type: 'MEDIC', tx: c[0], ty: c[1], util: .3 + .08 * F.wInf.length, why: ['nx_r_med', { n: F.wInf.length }] }, true); }
    if (F.wVeh.length >= 2 && !near(F.repairs, F.wVeh)) { const c = cen(F.wVeh); dep({ id: 'rep', type: 'REPAIR', tx: c[0], ty: c[1], util: .3 + .1 * F.wVeh.length, why: ['nx_r_rep', { n: F.wVeh.length }] }); }
    // objektif: pertahankan / rebut (dilewati bila kekuatan yang sudah dikirim ke sana cukup)
    const committed = (x, y) => {
      let s = 0;
      for (const u of Q.units) if (u.team === 'B' && mobile(u) && (Math.hypot(u.x - x, u.y - y) < 450 || u.order.x !== undefined && Math.hypot(u.order.x - x, u.order.y - y) < 300)) s += upw(u);
      for (const p of Q.pend) if (Math.hypot(p.x - x, p.y - y) < 450) s += POW[p.type].unit;
      return s;
    };
    for (const o of Q.objs) {
      const i = ci(o.x, o.y), b = IB[i]; let r = IR[i];
      if (committed(o.x, o.y) >= (o.owner === 'R' && r < .5 ? 2.2 : r) * 1.35 + 1.5) continue;
      if (o.owner === 'B') {
        if (r > b * 1.1 && r > .8) dep({ id: 'def' + o.name, type: cr >= UT.TANK.cost ? 'TANK' : 'IFV', tx: o.x - 60, ty: o.y, util: (r - b) / (r + b + .5) * .85 + .15, why: ['nx_r_def', { o: o.name, r: r.toFixed(1), b: b.toFixed(1) }] });
      } else if (r < 2.5) {
        if (o.owner === 'R' && r < .5) r = 2.2;   // objektif musuh tanpa kontak terlihat: asumsikan garnisun (estimasi intel)
        const far = Math.hypot(o.x - F.gc[0], o.y - F.gc[1]), type = r < .6 ? 'INF' : 'IFV';
        dep({ id: 'cap' + o.name, type, n: type === 'INF' ? 3 : 1, tx: o.x, ty: o.y, util: (.22 + .38 / (1 + r) + (o.owner === 'N' ? .12 : 0)) / (1 + far / 2600), why: ['nx_r_cap', { o: o.name, r: r.toFixed(1), own: Tt('w_own_' + o.owner) }] }, type === 'INF' && r < .3);
      }
    }
    // gugus musuh padat → misi tembak / gelar artileri
    if (F.cluster) {
      const c = F.cluster, inR = F.arty.filter(u => { const w = UT[u.type].w.find(x => x.arc), d = Math.hypot(u.x - c.x, u.y - c.y); return d <= w.rng && d >= (w.min || 0); });
      if (inR.length) add({ id: 'fire', act: 'fire', type: inR[0].type, units: inR, x: c.x, y: c.y, util: .5 + .06 * c.n, why: ['nx_r_fire', { n: Math.round(c.n), k: inR.length }] });
      else { const z = zonePoint(c.x, c.y); if (z && Math.hypot(z[0] - c.x, z[1] - c.y) < 2100) dep({ id: 'arty', type: 'ARTY', tx: c.x, ty: c.y, util: .3 + .05 * c.n, why: ['nx_r_arty', { n: Math.round(c.n) }] }); }
    }
    // kabut tebal → pengintaian
    if (N.vis < .22 && !F.uav) dep({ id: 'uav', type: 'UAV', tx: F.front[0] + 700, ty: F.front[1], util: .2 + 1.6 * (.22 - N.vis), why: ['nx_r_uav', { v: Math.round(N.vis * 100) }] });
    // posisi unggul → serangan penentu ke markas musuh
    if (N.p > .62 && Q.hqR && !Q.hqR.dead && (Q.hqR.seen.B || Q.hqR.spotted)) dep({ id: 'bmb', type: 'BMB', tx: Q.hqR.x, ty: Q.hqR.y, util: .3 + (N.p - .62), why: ['nx_r_bmb', { p: Math.round(N.p * 100) }] });

    R.sort((a, b) => b.score - a.score);
    const seen = new Set(); N.recs = R.filter(o => !seen.has(o.type) && seen.add(o.type)).slice(0, 3);
  }
  N.why = o => Tt(o.why[0], o.why[1]);

  /* ---------- eksekusi rekomendasi ---------- */
  N.exec = function (o, auto) {
    if (!o || Q.over) return { ok: false, msg: Tt('w_e_over') };
    const tag = Tt(auto ? 'nx_auto_tag' : 'nx_tag');
    if (o.act === 'fire') {
      war.cmdGround(o.units.filter(u => !u.dead), o.x, o.y);
      const msg = tag + ' ' + Tt('nx_did_fire', { k: o.units.length, s: o.sec }); L(msg, 'i'); return { ok: true, msg };
    }
    let n = 0, err = null;
    for (let i = 0; i < o.n; i++) { const r = war.deploy(o.type, o.x + (i ? rand(-25, 25) : 0), o.y + (i ? rand(-25, 25) : 0)); if (r.ok) n++; else { err = r.msg; break; } }
    const msg = tag + ' ' + (n ? Tt('nx_did_dep', { n, u: Tt('wu_' + o.type), s: o.sec }) + (o.conf ? ' · ' + Tt('nx_conf') + ' ' + o.conf + '%' : '') : Tt(err || 'w_e_cr'));
    L(msg, n ? 'i' : 'w'); return { ok: n > 0, msg };
  };

  /* ---------- ko-komandan otonom ---------- */
  const MIX = { TANK: 4, IFV: 3, INF: 4, AT: 2, MEDIC: 1, REPAIR: 1, ARTY: 1, AA: 1, ATK2: 1 };   // komposisi doktrin gabungan senjata
  const upw = u => POW[u.type].unit * Math.sqrt(clamp(u.hp / u.hpMax, .05, 1)) * Math.sqrt(war.BAL.dmg / war.BAL.take);
  N.cool = {};
  function enemyAt(x, y, r) {   // kekuatan musuh (diketahui + estimasi intel) di sekitar titik
    let s = 0; for (const [, m] of N.mem) if (Math.hypot(m.x - x, m.y - y) < r) s += POW[m.type].unit * m.w * Math.sqrt(clamp(m.hp / m.hpMax, .05, 1));
    const o = Q.objs.find(o => Math.hypot(o.x - x, o.y - y) < 200);
    if (o && o.owner === 'R' && s < 1) s = 3.2;
    if (Math.hypot(Q.hqR.x - x, Q.hqR.y - y) < 300 && s < 4) s = 6;
    return s;
  }
  function mixPick() {
    const cnt = {}; let tot = 0;
    Q.units.forEach(u => { if (u.team === 'B' && mobile(u) && MIX[u.type]) { cnt[u.type] = (cnt[u.type] || 0) + 1; tot++; } });
    Q.pend.forEach(p => { if (MIX[p.type]) { cnt[p.type] = (cnt[p.type] || 0) + 1; tot++; } });
    const wsum = Object.values(MIX).reduce((a, b) => a + b, 0); let best = null, bd = -1e9;
    for (const t in MIX) { const d = MIX[t] / wsum - (cnt[t] || 0) / Math.max(1, tot); if (d > bd && Q.cr >= UT[t].cost + 150) { bd = d; best = t; } }
    return best;
  }
  function autopilot(dt) {
    N.autoT -= dt; if (N.autoT > 0) return; N.autoT = 2.5;
    const tg = N.target(), stage = tg ? zonePoint(tg.x, tg.y) : [Q.hqB.x + 200, Q.hqB.y];
    // 1. rekomendasi mendesak (tiap rekomendasi diberi jeda agar tidak diulang-ulang)
    let did = 0;
    for (const o of N.recs) {
      if (did >= 2 || o.util < .45 || Q.cr < o.cost + 100 || (N.cool[o.id] || 0) > Q.t) continue;
      const r = N.exec(o, true); if (r.ok) { did++; N.cool[o.id] = Q.t + 25; if (N.speak && did === 1) N.speak(r.msg); }
    }
    // 2. kredit surplus → lengkapi komposisi pasukan di titik kumpul
    for (let k = 0; k < 3 && Q.cr > 450 && war.popB() < war.POP_CAP - 4; k++) {
      const t = mixPick(); if (!t) break;
      const p = placeFor(t, stage[0], stage[1]); if (!war.deploy(t, p[0] + rand(-40, 40), p[1] + rand(-40, 40)).ok) break;
    }
    // 3. manuver: himpun kekuatan di titik kumpul, serang bila rasio Lanchester lokal menguntungkan
    if (!tg) return;
    const pool = Q.units.filter(u => u.team === 'B' && mobile(u) && !u.guard && !u.crewOf && !u.jet && u.stance === 'AGGR' && UT[u.type].w.length && !Q.sel.includes(u) && u.order.k !== 'follow' && Q.t - u.born > 2 &&
      (u.order.k === 'idle' || u.nxStage));
    if (!pool.length) return;
    const grp = pool.filter(u => Math.hypot(u.x - stage[0], u.y - stage[1]) < 650 || Math.hypot(u.x - tg.x, u.y - tg.y) < 500);
    const pg = grp.reduce((s, u) => s + upw(u), 0), pe = enemyAt(tg.x, tg.y, 480), need = tg.def ? pe * 1.05 : pe * 1.35 + 1.5;
    if (pg >= need && (grp.length >= 3 || pg >= need * 2)) {
      war.cmdMove(grp, tg.x, tg.y, true); grp.forEach(u => { u.nxStage = false; });
      if (Q.t - (N.goT || -99) > 12 || grp.length >= 6) {   // laporan dibatasi agar log tidak banjir
        N.goT = Q.t; const msg = Tt('nx_auto_tag') + ' ' + Tt('nx_did_go', { n: grp.length, o: tg.name || N.sector(tg.x, tg.y), r: N.fmtR(pg / Math.max(.5, pe)) });
        L(msg, 'i'); if (N.speak) N.speak(msg);
      }
      N.stageMsg = null;
    } else if (pg < need) {
      const far = pool.filter(u => !grp.includes(u) && u.order.k === 'idle');
      if (far.length) { war.cmdMove(far, stage[0], stage[1], true); far.forEach(u => { u.nxStage = true; }); }
      grp.forEach(u => { if (u.order.k === 'idle') u.nxStage = true; });
      const key = (tg.name || '') + Math.round(need);
      if (N.stageMsg !== key) { N.stageMsg = key; L(Tt('nx_auto_tag') + ' ' + Tt('nx_did_stage', { s: N.sector(stage[0], stage[1]), a: pg.toFixed(1), b: need.toFixed(1), o: tg.name || '' }), 'w'); }
    }
  }
  N.target = function () {   // pertahankan objektif kita yang terancam; selain itu objektif dengan nilai (keunggulan lokal / jarak) tertinggi
    let best = null, bs = -1e9; const c = N.feat ? N.feat.gc : [Q.hqB.x, Q.hqB.y];
    for (const o of Q.objs) {
      const a = N.at(o.x, o.y);
      if (o.owner === 'B') { if (a.r > a.b * 1.2 && a.r > 1 && 9 > bs) { bs = 9; best = { x: o.x, y: o.y, name: o.name, def: true }; } continue; }
      const s = (a.b + 1) / (a.r + 1) - Math.hypot(o.x - c[0], o.y - c[1]) / 1800 + (o.owner === 'N' ? .3 : 0);
      if (s > bs) { bs = s; best = o; }
    }
    return best || (Q.hqR && !Q.hqR.dead ? { x: Q.hqR.x, y: Q.hqR.y, name: Tt('nx_hqR') } : null);
  };

  /* ---------- siklus analisis ---------- */
  N.tick = function (rdt) {
    if (!Q.g || !Q.hqB) return;
    if (N.g !== Q.g) { N.g = Q.g; N.mem.clear(); N.hist.length = 0; N.ready = false; N.last = -1; }
    const K = known(); influence(K); frontLine(); assess(K);
    N.feat = features(K); recommend(N.feat); N.ready = true;
    N.histT -= rdt; if (N.histT <= 0 && Q.t !== N.last) { N.histT = 2; N.last = Q.t; N.hist.push(N.p); if (N.hist.length > 120) N.hist.shift(); }
    N.mom = N.hist.length > 15 ? N.p - N.hist[N.hist.length - 16] : 0;
    if (N.on.auto && !Q.over && !Q.paused) autopilot(rdt);
  };

  /* ---------- perintah bahasa alami (teks / suara) ---------- */
  const UNITW = [
    [/tank ringan|light tank|harimau|booker/, 'LTANK'], [/tank|leopard|abrams|mbt/, 'TANK'], [/kopassus|pasus|special|pasukan khusus|\bsf\b/, 'SF'],
    [/medevac|heli medis|heli ambulan/, 'MEDHELI'], [/paramedis|medis|medic|dokter/, 'MEDIC'], [/perbaikan|repair|bengkel|recovery/, 'REPAIR'],
    [/antitank|anti tank|javelin|\bat\b/, 'AT'], [/mortir|mortar/, 'MORT'], [/roket|himars|astros|mlrs/, 'MLRS'], [/artileri|artillery|meriam|caesar|paladin|howitzer/, 'ARTY'],
    [/ranpur|anoa|stryker|ifv|panser/, 'IFV'], [/apache|heli tempur modern|ah-?64/, 'ATK2'], [/helikopter|heli|cobra|gunship/, 'HELI'],
    [/ucav|reaper|drone tempur|pesud tempur/, 'UCAV'], [/drone|uav|pesud|intai/, 'UAV'], [/a-?10|serang darat|\bcas\b/, 'CAS'],
    [/pembom|bomber|b-?1/, 'BMB'], [/jet|pesawat tempur|fighter|f-?35|sukhoi/, 'FGT'], [/zsu|gepard|meriam hanud/, 'ZSU'], [/hanud|nasams|avenger|\baa\b|anti udara|anti-air/, 'AA'],
    [/kapal cepat|fast attack|gboat/, 'GBOAT'], [/kapal|kri|destroyer|perusak|ship/, 'SHIP'], [/infanteri|infantry|prajurit|tentara|regu|soldier|pasukan|troops/, 'INF']
  ];
  const NUMW = { satu: 1, sebuah: 1, seunit: 1, dua: 2, tiga: 3, empat: 4, lima: 5, one: 1, two: 2, three: 3, four: 4, five: 5 };
  const OBJW = [[/alfa|alpha/, 0], [/bravo/, 1], [/charlie|carli|cali/, 2], [/delta/, 3], [/echo|eko/, 4]];
  function where(s) {
    for (const [re, i] of OBJW) if (re.test(s) && Q.objs[i]) return { x: Q.objs[i].x, y: Q.objs[i].y, name: Q.objs[i].name };
    if (/markas musuh|markas lawan|enemy (hq|base)|hq musuh/.test(s)) return { x: Q.hqR.x, y: Q.hqR.y, name: Tt('nx_hqR') };
    if (/markas|pangkalan|\bbase\b|\bhq\b|rumah|home/.test(s)) return { x: Q.hqB.x + 120, y: Q.hqB.y, name: Tt('nx_hqB') };
    const m = s.match(/\b(?:sektor |sector )?([a-j])\s?([1-7])\b/);
    if (m) { const x = (m[1].charCodeAt(0) - 97) * 500 + 250, y = (+m[2] - 1) * 500 + 250; return { x, y, name: m[1].toUpperCase() + m[2] }; }
    if (/depan|front|garis/.test(s) && N.feat) return { x: N.feat.front[0], y: N.feat.front[1], name: Tt('nx_front') };
    return null;
  }
  const forces = () => { const s = Q.sel.filter(u => mobile(u) && u.team === 'B'); return s.length ? s : Q.units.filter(u => u.team === 'B' && mobile(u) && !u.guard && !u.crewOf && !u.jet && UT[u.type].w.length && u.order.k !== 'follow'); };
  N.command = function (raw) {
    const s = ' ' + String(raw || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ') + ' ';
    if (!s.trim()) return { ok: false, msg: Tt('nx_c_help') };
    const has = re => re.test(s);
    if (has(/bantuan|help|tolong|perintah apa/)) return { ok: true, msg: Tt('nx_c_help') };
    if (has(/status|laporan|report|sitrep|analisa|analisis|situasi/)) return { ok: true, msg: N.report() };
    if (has(/otonom|autopilot|auto pilot|\bauto\b/)) { N.on.auto = !has(/\b(off|mati|matikan|nonaktif|stop|berhenti)\b/); return { ok: true, msg: Tt(N.on.auto ? 'nx_c_auto1' : 'nx_c_auto0') }; }
    if (has(/peta|heatmap|ancaman|overlay|pengaruh/)) { N.on.overlay = !has(/\b(off|mati|tutup|sembunyi|hide)\b/); return { ok: true, msg: Tt(N.on.overlay ? 'nx_c_map1' : 'nx_c_map0') }; }
    if (has(/eksekusi|execute|jalankan|laksanakan|terapkan/)) {
      const i = (+(s.match(/\b([1-3])\b/) || [])[1] || 1) - 1, o = N.recs[i];
      return o ? N.exec(o) : { ok: false, msg: Tt('nx_none') };
    }
    const tg = where(s);
    if (has(/tembak|bombardir|bombard|fire mission|hujani|gempur/) && !has(/kirim|gelar|deploy|send/)) {
      if (!tg) return { ok: false, msg: Tt('nx_c_where') };
      const a = Q.units.filter(u => u.team === 'B' && mobile(u) && UT[u.type].w.some(w => w.arc));
      if (!a.length) return { ok: false, msg: Tt('nx_c_noarty') };
      war.cmdGround(a, tg.x, tg.y); return { ok: true, msg: Tt('nx_did_fire', { k: a.length, s: tg.name }) };
    }
    if (has(/mundur|retreat|kembali|fall back|tarik/)) { const f = forces(); war.cmdMove(f, Q.hqB.x + 150, Q.hqB.y, false); return { ok: true, msg: Tt('nx_did_back', { n: f.length }) }; }
    let type = null; for (const [re, t] of UNITW) if (re.test(s)) { type = t; break; }
    if (has(/kirim|gelar|turunkan|terjunkan|deploy|send|drop|beli|panggil|call/) && type) {
      const nm = s.match(/\b(\d+)\b/), nw = Object.keys(NUMW).find(w => new RegExp('\\b' + w + '\\b').test(s));
      const n = clamp(nm ? +nm[1] : nw ? NUMW[nw] : 1, 1, 5), t = tg || (N.feat ? { x: N.feat.front[0], y: N.feat.front[1], name: Tt('nx_front') } : { x: Q.hqB.x + 200, y: Q.hqB.y, name: Tt('nx_hqB') });
      const p = placeFor(type, t.x, t.y, has(/terjun|payung|drop|airdrop|para/) || !!tg && UT[type].drop);
      if (!p) return { ok: false, msg: Tt('w_e_sea') };
      return N.exec({ act: 'deploy', type, n, x: p[0], y: p[1], sec: t.name });
    }
    if (has(/serang|serbu|attack|rebut|capture|assault|maju|advance|kuasai/)) {
      const t = tg || N.target(); if (!t) return { ok: false, msg: Tt('nx_c_where') };
      const f = forces(); if (!f.length) return { ok: false, msg: Tt('nx_c_noforce') };
      war.cmdMove(f, t.x, t.y, true); return { ok: true, msg: Tt('nx_did_move', { n: f.length, o: t.name || N.sector(t.x, t.y) }) };
    }
    return { ok: false, msg: Tt('nx_c_unk', { s: String(raw).trim() }) };
  };
  N.fmtR = v => v >= 99 ? '99+' : v.toFixed(1);
  N.fmtRatio = () => { const r = N.ratio; return r >= 1 ? N.fmtR(r) + ' : 1' : '1 : ' + N.fmtR(1 / r); };
  N.report = function () {
    const o = N.recs[0];
    return Tt('nx_rep', { p: Math.round(N.p * 100), r: N.fmtRatio(), t: N.stats.tracks, g: N.stats.ghosts }) + (o ? ' ' + Tt('nx_rep_rec', { u: Tt('wu_' + o.type), s: o.sec }) : '');
  };
})();
