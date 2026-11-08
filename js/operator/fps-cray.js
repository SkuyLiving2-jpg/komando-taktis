/* =========================================================================
   fps-cray.js — v2.12: efek & HUD kemampuan Cray Martin dan Sang Jenderal
   Simulasi ada di war.js (crayTick / warlordSlam); berkas ini hanya menerima peristiwa war.hooks.cray lalu menggambar:
   - DUEL katana: label duel, cincin ancang-ancang di bidikan (tebas saat menyala = TANGKIS), percikan benturan bilah
   - JUDGEMENT CUT END: zona merah, puluhan garis tebasan 3D di seluruh area + garis putih di layar, lalu "pecah" saat katana disarungkan
   - RAILING POWER: sinar railgun merah ke segala arah + busur listrik merah yang merambat antar-sasaran
   - KEBAL PELURU: peluru memercik di zirahnya
   - HANTAMAN BUMI (Sang Jenderal): gelombang kejut + debu + guncangan kamera
   ========================================================================= */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q;
  const { rand, clamp } = TK.util;
  const Tt = (k, v) => TK.t(k, v), A = () => TK.fpsaudio;
  const real = t => t / (Q.speed || 1);   // detik sim → detik nyata (mode operator: sim ½ kecepatan)
  F.cuts = [];   // garis tebasan 3D {x0,y0,z0,x1,y1,z1,t (negatif = belum muncul),life,w,core}
  const S = F.crayS = { duel: null, wind: null, flash: 0, slash2d: [], shat: null, msg: null, deflT: -9, hintT: -9, jce: null, par: 0, rd: 0 };

  const chest = u => { const hb = F.hitbox(u); return [u.x, u.y, hb.z0 + hb.h * .62]; };
  const near = (x, y, r) => Math.hypot(x - P.x, y - P.y) < r;
  function say(k, col, dur) { S.msg = { s: Tt(k), col: col || '#fff', t: 0, dur: dur || 1.2 }; }
  function cut3(x0, y0, z0, x1, y1, z1, delay, life, w) { F.cuts.push({ x0, y0, z0, x1, y1, z1, t: -(delay || 0), life: life || .22, w: w || .5 }); }
  function arc(cx, cy, cz, R, a0, a1, tilt, delay, life, w) {   // tebasan melengkung (bulan sabit) di sekitar titik
    const n = 7; let p = null;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, q = [cx + Math.cos(a) * R, cy + Math.sin(a) * R, cz + Math.sin((i / n) * Math.PI) * tilt + (i / n - .5) * tilt * .8];
      if (p) cut3(p[0], p[1], p[2], q[0], q[1], q[2], delay, life, w); p = q;
    }
  }
  function zig(a, b, col, life, w) {   // busur listrik bergerigi a→b (rambatan Railing Power)
    const n = 7, pts = [a];
    for (let i = 1; i < n; i++) { const k = i / n, j = 2.6 * Math.sin(k * Math.PI); pts.push([a[0] + (b[0] - a[0]) * k + rand(-j, j), a[1] + (b[1] - a[1]) * k + rand(-j, j), a[2] + (b[2] - a[2]) * k + rand(-j * .6, j * .6)]); }
    pts.push(b); F.arcs.push({ p: pts, t: 0, life: life || .3, col: col || [255, 70, 50], w: w || .32 });
  }
  function bladeTip(u) {   // ujung katana Cray (tulang 17 dari fps-gl), cadangan: di depan dadanya
    if (u._kt && P.time - u._ktT < .3) return u._kt;
    const c = chest(u), h = u.hdg || 0; return [c[0] + Math.cos(h) * 1.6, c[1] + Math.sin(h) * 1.6, c[2] + .4];
  }

  /* ---------- peristiwa dari simulasi ---------- */
  war.hooks.cray = function (k, u, o) {
    const a = A(), c = chest(u);
    switch (k) {
      case 'defl': {   // peluru biasa terpental
        if (P.time - S.deflT < .06) return; S.deflT = P.time;
        F.sparks(c[0] + rand(-.4, .4), c[1] + rand(-.4, .4), c[2] + rand(-.5, .4), 5); a && a.at('kclang', u.x, u.y, .22);
        if (o.src && o.src.player && P.time - S.hintT > 5) { S.hintT = P.time; F.msg(Tt('cr_imm') + ' — ' + Tt('cr_hint'), 'w'); }
        break;
      }
      case 'duel': S.duel = { u, t0: P.time }; a && a.at('kdraw', u.x, u.y, 1.3); F.msg(Tt('w_cray_duel', { u: Tt('wu_CLAY') }), 'w'); break;
      case 'duelEnd': if (S.duel && S.duel.u === u) { S.duel = null; S.wind = null; if (o.why === 'away' || o.why === 'time') F.msg(Tt('cr_end_away'), 'g'); } break;
      case 'wind': S.wind = { u, t0: P.time, T: real(war.CRAY.duel.wind[Q.diff] || .4), win: .4 }; a && a.at('kdraw', u.x, u.y, .55); break;
      case 'slashOp': {
        const tp = bladeTip(u); arc(P.x, P.y, F.hAt(P.x, P.y) + 1.3, 1.6, (u.hdg || 0) + 2.2, (u.hdg || 0) + 4.1, .9, 0, .2, .18);
        a && a.local('kcut', 1); a && a.local('hit', .8); P.shake = Math.min(1.5, (P.shake || 0) + .45); S.flash = Math.max(S.flash, .35); S.wind = null; void tp;
        break;
      }
      case 'whiff': a && a.at('slash', u.x, u.y, 1); S.wind = null; break;
      case 'parry': {   // tangkisan sempurna: benturan bilah, percikan besar, layar berkedip putih
        const m = [(u.x + P.x) / 2, (u.y + P.y) / 2, (c[2] + F.hAt(P.x, P.y) + 1.4) / 2];
        F.sparks(m[0], m[1], m[2], 26); a && a.local('kclang', 1.15); a && a.at('kclang', u.x, u.y, 1);
        P.shake = Math.min(1.5, (P.shake || 0) + .3); S.par = 1; S.wind = null; say('cr_par_ok', '#ffe7a8', 1.4);
        break;
      }
      case 'guard': F.sparks(c[0], c[1], c[2] + .3, 12); a && a.at('kclang', u.x, u.y, .9); say('cr_guard', '#ff8a7a', .8); break;
      case 'hitStun': F.sparks(c[0], c[1], c[2], 8); break;
      case 'cut0': a && a.at('slashH', u.x, u.y, 1.2); { const g = F.gAt(u.x, u.y); for (let i = 0; i < 8; i++) F.emit('dust', u.x, u.y, g + .3, { vx: rand(-4, 4), vy: rand(-4, 4), vz: rand(.5, 2), life: rand(.4, .8), s0: .5, s1: 2.2, col: [140, 130, 110], a: .5 }); } break;
      case 'cut': {   // tebasan katana ke unit darat: tiga sabit merah-putih menyilang
        const z = F.gAt(o.x, o.y) + 1.4, h = u.hdg || 0;
        arc(o.x, o.y, z, 5.5, h + 2.1, h + 4.2, 1.6, 0, .26, .7); arc(o.x, o.y, z + .6, 4.4, h - 1.1, h + 1, -1.2, .04, .24, .55); arc(o.x, o.y, z - .3, 6.5, h + 1.4, h + 3.2, .4, .08, .22, .5);
        F.sparks(o.x, o.y, z, 18); a && a.at('kcut', o.x, o.y, 1.4); a && a.at('kclang', o.x, o.y, .8);
        break;
      }
      case 'jce0': {   // menyarungkan katana: zona merah di tanah, peringatan besar
        S.jce = { u, x: u.x, y: u.y, r: o.r, t0: P.time, ph: 0 };
        F.shock.push({ x: u.x, y: u.y, R: o.r, t: 0, life: real(war.CRAY.jce.sheath + war.CRAY.jce.slash + war.CRAY.jce.end * .62), col: [255, 30, 30], w: 1.1, fix: true });
        F.shock.push({ x: u.x, y: u.y, R: o.r, t: 0, life: real(war.CRAY.jce.sheath), col: [255, 90, 70], w: .5, lin: true });
        a && a.at('ksheath', u.x, u.y, 1.6); a && a.at('warn', u.x, u.y, 1.2);
        if (near(u.x, u.y, o.r + 400)) say('cr_jce', '#ff4a3a', real(war.CRAY.jce.sheath + war.CRAY.jce.slash));
        break;
      }
      case 'jce1': {   // menghilang: puluhan tebasan merobek seluruh area selama fase tebas
        const J = war.CRAY.jce, dur = real(J.slash), n = Q.diff >= 3 ? 110 : 80, gz = F.gAt(u.x, u.y);
        for (let i = 0; i < n; i++) {
          const rr = Math.sqrt(Math.random()) * o.r, aa = rand(0, 6.283), cx = u.x + Math.cos(aa) * rr, cy = u.y + Math.sin(aa) * rr, cz = Math.max(F.gAt(cx, cy), gz) + rand(.4, 7);
          const L = rand(7, 26), yaw = rand(0, 6.283), pit = rand(-.6, .6), dx = Math.cos(yaw) * Math.cos(pit) * L / 2, dy = Math.sin(yaw) * Math.cos(pit) * L / 2, dz = Math.sin(pit) * L / 2;
          cut3(cx - dx, cy - dy, cz - dz, cx + dx, cy + dy, cz + dz, Math.pow(i / n, .85) * dur * .92, rand(.14, .26), rand(.35, .7));
        }
        S.jce = S.jce || { u, x: u.x, y: u.y, r: o.r }; S.jce.ph = 1; S.jce.t1 = P.time; S.jce.dur = dur;
        if (near(u.x, u.y, o.r + 260)) { S.slash2d = []; for (let i = 0; i < 26; i++) S.slash2d.push({ d: Math.pow(i / 26, .9) * dur, a: rand(0, Math.PI), x: rand(.1, .9), y: rand(.15, .85), L: rand(.4, 1.1), t: 0 }); }
        S.hum = { t: 0, dur, k: 0 };
        break;
      }
      case 'jce2': {   // katana disarungkan "klik": semua di area tercabik sekaligus
        F.shock.push({ x: u.x, y: u.y, R: o.r * 1.15, t: 0, life: .55, col: [255, 70, 50], w: 1.6 }); F.shock.push({ x: u.x, y: u.y, R: o.r * .6, t: 0, life: .4, col: [255, 230, 220], w: 1 });
        a && a.at('ksheath', u.x, u.y, 1.8); a && a.boom(u.x, u.y, 14); a && a.at('kcut', u.x, u.y, 1.6);
        for (let i = 0; i < 36; i++) { const rr = Math.sqrt(Math.random()) * o.r, aa = rand(0, 6.283), x = u.x + Math.cos(aa) * rr, y = u.y + Math.sin(aa) * rr; F.emit('dust', x, y, F.gAt(x, y) + rand(.3, 2), { vx: rand(-3, 3), vy: rand(-3, 3), vz: rand(1, 5), life: rand(.5, 1.1), s0: .6, s1: 3, col: [120, 26, 22], a: .55 }); }
        if (near(u.x, u.y, o.r + 30)) { S.shat = { t: 0, life: 1.1, seed: Math.random() * 1000 }; P.shake = Math.min(1.5, (P.shake || 0) + .8); }
        else if (near(u.x, u.y, o.r + 300)) P.shake = Math.min(1.5, (P.shake || 0) + .3);
        S.jce = null; S.slash2d = []; S.hum = null;
        break;
      }
      case 'rail': {   // Railing Power: sinar ke semua sasaran sekaligus, rambatan bergerigi
        const m0 = u._mz && P.time - u._mzT < .3 ? u._mz : [c[0], c[1], c[2] + .4];
        F.emit('flash', m0[0], m0[1], m0[2], { life: .18, s0: 3, s1: 6, col: [255, 90, 60] }); F.shock.push({ x: u.x, y: u.y, R: 14, t: 0, life: .35, col: [255, 90, 60], w: .25 });
        for (const sg of o.segs) {
          const b = chest(sg.b), a0 = sg.g === 0 ? m0 : chest(sg.a);
          if (sg.g === 0) { F.tracers.push({ x0: a0[0], y0: a0[1], z0: a0[2], x1: b[0], y1: b[1], z1: b[2], t: 0, life: .42, w: .55, col: [255, 60, 40], inst: true, a: .7 }); F.tracers.push({ x0: a0[0], y0: a0[1], z0: a0[2], x1: b[0], y1: b[1], z1: b[2], t: 0, life: .3, w: .12, col: [255, 235, 225], inst: true }); }
          else zig(a0, b, [255, 70 + sg.g * 25, 50], .34 + sg.g * .05, .3);
          F.emit('flash', b[0], b[1], b[2], { life: .14, s0: 1.5, s1: 3.5, col: [255, 110, 70] }); F.sparks(b[0], b[1], b[2], 6);
          if (sg.g) a && a.at('zap', b[0], b[1], .7);
        }
        a && a.at('rail', u.x, u.y, 1.6); a && a.at('railC', u.x, u.y, 1.2);
        if (near(u.x, u.y, 1100) && P.time - S.rd > 8) { S.rd = P.time; say('cr_rail', '#ff6a50', 1.1); }
        break;
      }
      case 'leap': { const g = F.gAt(u.x, u.y); for (let i = 0; i < 14; i++) F.emit('dust', u.x, u.y, g + .3, { vx: rand(-6, 6), vy: rand(-6, 6), vz: rand(.5, 3), life: rand(.5, 1), s0: .8, s1: 3.2, col: [130, 120, 100], a: .55 }); a && a.at('jump', u.x, u.y, 1.6); a && a.at('whine', u.x, u.y, .7); break; }
      case 'slam': {
        const g = F.gAt(u.x, u.y);
        F.shock.push({ x: u.x, y: u.y, R: o.r * 1.3, t: 0, life: .6, col: [255, 170, 90], w: 1.4 }); F.shock.push({ x: u.x, y: u.y, R: o.r * .7, t: 0, life: .45, col: [255, 120, 40], w: .9 });
        for (let i = 0; i < 40; i++) { const aa = i / 40 * 6.283, v = rand(9, 16); F.emit('dust', u.x + Math.cos(aa) * 2, u.y + Math.sin(aa) * 2, g + .4, { vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, vz: rand(.5, 3), life: rand(.7, 1.3), s0: 1, s1: 4, col: [128, 116, 96], a: .6 }); }
        F.sparks(u.x, u.y, g + .5, 24); a && a.boom(u.x, u.y, 12); a && a.at('quake', u.x, u.y, 1.4);
        const d = Math.hypot(u.x - P.x, u.y - P.y); if (d < 140) P.shake = Math.min(1.5, (P.shake || 0) + 1.1 * (1 - d / 140));
        if (F.scorch) F.scorch.push({ x: u.x, y: u.y, r: o.r * .55, t: 0, life: 14 });
        break;
      }
    }
  };
  war.hooks.duelOK = src => src === P.unit && P.alive && !P.veh && !P.mnt && !P.gs && !(P.chute > 0) && !P.down;

  /* ---------- tiap frame ---------- */
  F.crayTick = function (dt) {
    for (let i = F.cuts.length - 1; i >= 0; i--) { const c = F.cuts[i]; c.t += dt; if (c.t > c.life) F.cuts.splice(i, 1); }
    if (S.duel && (S.duel.u.dead || !S.duel.u.duel)) { S.duel = null; S.wind = null; }
    if (S.wind && (P.time - S.wind.t0 > S.wind.T + .15 || !S.wind.u.act || S.wind.u.act.k !== 'duel' || S.wind.u.act.ph === 'rec')) S.wind = null;
    S.flash = Math.max(0, S.flash - dt * 2.5); S.par = Math.max(0, S.par - dt * 2);
    if (S.msg) { S.msg.t += dt; if (S.msg.t > S.msg.dur) S.msg = null; }
    if (S.shat) { S.shat.t += dt; if (S.shat.t > S.shat.life) S.shat = null; }
    for (const q of S.slash2d) q.t += dt;
    if (S.hum) {   // fase tebas JCE: desir bilah beruntun
      S.hum.t += dt; S.hum.k -= dt; const j = S.jce;
      if (S.hum.k <= 0 && S.hum.t < S.hum.dur && j) { S.hum.k = rand(.05, .11); const x = j.x + rand(-j.r, j.r) * .7, y = j.y + rand(-j.r, j.r) * .7; A() && A().at(Math.random() < .5 ? 'slash' : 'slashH', x, y, 1.1); }
    }
  };

  /* ---------- lapisan layar ---------- */
  const SANS = '"BC","Bahnschrift","DIN Alternate","Segoe UI","Arial Narrow",Arial,sans-serif';
  function tx(ctx, t, x, y, px, col, al) { ctx.font = 'bold ' + Math.round(px) + 'px ' + SANS; ctx.textAlign = al || 'center'; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(t, x + 1.5, y + 1.5); ctx.fillStyle = col; ctx.fillText(t, x, y); }
  F.crayFx = function (ctx, CW, CH, s) {
    ctx.save();
    // garis tebasan JCE di layar: garis putih tipis berpendar merah melintasi layar
    if (S.slash2d.length) {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const q of S.slash2d) {
        const k = q.t - q.d; if (k < 0 || k > .22) continue; const f = 1 - k / .22, L = q.L * Math.max(CW, CH) * .5, cx = q.x * CW, cy = q.y * CH, dx = Math.cos(q.a) * L, dy = Math.sin(q.a) * L, g = Math.min(1, k / .05);
        ctx.strokeStyle = 'rgba(255,60,40,' + (.35 * f).toFixed(3) + ')'; ctx.lineWidth = 9 * s; ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx - dx + 2 * dx * g, cy - dy + 2 * dy * g); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,245,240,' + (.9 * f).toFixed(3) + ')'; ctx.lineWidth = 1.6 * s; ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // layar "pecah" saat katana disarungkan (operator di dalam area)
    if (S.shat) {
      const k = S.shat.t / S.shat.life, f = 1 - k; let sd = S.shat.seed; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
      ctx.fillStyle = 'rgba(255,255,255,' + (Math.max(0, .55 - k * 2.2)).toFixed(3) + ')'; ctx.fillRect(0, 0, CW, CH);
      ctx.strokeStyle = 'rgba(255,255,255,' + (.8 * f).toFixed(3) + ')'; ctx.lineWidth = 1.4 * s;
      const cx = CW / 2, cy = CH / 2;
      for (let i = 0; i < 18; i++) { const a = R() * 6.283; let x = cx, y = cy; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 5; j++) { const r = (j + 1) * Math.max(CW, CH) * .13 * (.7 + R() * .6), b = a + (R() - .5) * .5; x = cx + Math.cos(b) * r; y = cy + Math.sin(b) * r; ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,40,30,' + (.5 * f).toFixed(3) + ')'; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.moveTo(0, CH * .3 + k * 40); ctx.lineTo(CW, CH * .7 - k * 40); ctx.stroke();
    }
    // kilat merah saat tertebas, kilat putih saat menangkis
    if (S.flash > 0) { ctx.fillStyle = 'rgba(200,20,10,' + (S.flash * .35).toFixed(3) + ')'; ctx.fillRect(0, 0, CW, CH); }
    if (S.par > 0) { ctx.fillStyle = 'rgba(255,240,210,' + (S.par * .22).toFixed(3) + ')'; ctx.fillRect(0, 0, CW, CH); }
    // duel: label + cincin ancang-ancang di bidikan
    const D = S.duel;
    if (D && P.alive && !P.gs && !P.veh && !P.mnt) {
      const u = D.u, d = Math.hypot(u.x - P.x, u.y - P.y), y0 = CH / 2 + 118 * s;
      tx(ctx, '⚔ ' + Tt('cr_duel') + ' · ' + Tt('wu_CLAY').split('—')[0].trim() + ' · ' + Math.round(d) + ' m', CW / 2, y0, 17 * s, '#ff5a48');
      if (P.eq !== 'knife') tx(ctx, Tt('cr_hint'), CW / 2, y0 + 22 * s, 13 * s, '#ffd2c8');
      const W2 = S.wind;
      if (W2 && d < 14) {
        const k = clamp((P.time - W2.t0) / W2.T, 0, 1), live = k >= W2.win, r = (70 - 46 * k) * s;
        ctx.lineWidth = (live ? 4 : 2.5) * s; ctx.strokeStyle = live ? 'rgba(255,240,200,.95)' : 'rgba(255,70,50,.85)';
        ctx.beginPath(); ctx.arc(CW / 2, CH / 2, r, 0, 6.283); ctx.stroke();
        ctx.lineWidth = 1.5 * s; ctx.strokeStyle = 'rgba(255,70,50,.5)'; ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 22 * s, 0, 6.283); ctx.stroke();
        tx(ctx, Tt('cr_parry'), CW / 2, CH / 2 - 84 * s, (live ? 24 : 18) * s, live ? '#fff3d6' : '#ff6a50');
      } else if (u.act && u.act.k === 'stun') tx(ctx, Tt('cr_stag'), CW / 2, CH / 2 - 84 * s, 22 * s, '#ffe08a');
    }
    if (S.msg) { const m = S.msg, a = Math.min(1, (m.dur - m.t) * 4, m.t * 8); ctx.globalAlpha = clamp(a, 0, 1); tx(ctx, m.s, CW / 2, CH * .3, 34 * s, m.col); ctx.globalAlpha = 1; }
    ctx.restore();
  };
})();
