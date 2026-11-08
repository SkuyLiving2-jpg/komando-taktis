/* ============================================================
   RADAR — render PPI per situs + simbol taktis bersama
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, S = TK.S, U = TK.util;
  const { TAU, rad, deg, pad } = U;
  const COL = { F: '#37d7ff', H: '#ff3b3b', U: '#ffb000', C: '#c8ffd0', G: '#39ff6e' };
  TK.COL = COL;

  /* ---------- simbol taktis (bentuk = identitas, warna = identitas) ---------- */
  TK.drawSymbol = function (ctx, x, y, c, sz, filled) {
    ctx.beginPath();
    switch (c.iff) {
      case 'F': ctx.arc(x, y, sz, 0, TAU); break;
      case 'H': ctx.moveTo(x, y - sz - 1); ctx.lineTo(x + sz + 1, y); ctx.lineTo(x, y + sz + 1); ctx.lineTo(x - sz - 1, y); ctx.closePath(); break;
      case 'U': ctx.rect(x - sz, y - sz, sz * 2, sz * 2); break;
      default: ctx.rect(x - sz + 1, y - sz + 1, sz * 2 - 2, sz * 2 - 2);
    }
    ctx.stroke();
    if (filled) { const a = ctx.globalAlpha; ctx.globalAlpha = a * .3; ctx.fill(); ctx.globalAlpha = a; }
    if (c.kind === 'SEA') { ctx.beginPath(); ctx.moveTo(x - sz - 2, y + sz + 3); ctx.lineTo(x + sz + 2, y + sz + 3); ctx.stroke(); }
    if (c.asset) { ctx.beginPath(); ctx.moveTo(x - sz, y); ctx.lineTo(x + sz, y); ctx.moveTo(x, y - sz); ctx.lineTo(x, y + sz); ctx.stroke(); }
    if (c.iff === 'C') { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.stroke(); }
  };

  const cv = document.getElementById('radar'), ctx = cv.getContext('2d');
  const stage = document.getElementById('stage');
  let W = 400, dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const s = Math.max(240, Math.floor(Math.min(stage.clientWidth, stage.clientHeight)) - 4);
    W = s; cv.style.width = s + 'px'; cv.style.height = s + 'px'; cv.width = s * dpr; cv.height = s * dpr;
  }

  const site = () => TK.sim.siteById(S.siteId);
  const rangeKm = () => TK.doc().ranges[S.rangeIdx].km;
  const R = () => W / 2 - 24;
  const scr = (x, y) => { const s = site(), r = rangeKm(), rr = R(); return [W / 2 + (x - s.x) / r * rr, W / 2 - (y - s.y) / r * rr]; };

  // posisi & alpha tampilan kontak pada PPI situs ini
  function view(c) {
    const s = site(), p = c.pings[s.id];
    if (p) {
      const a = Math.max(0, 1 - (S.t - p.t) / (S.period * 1.05));
      if (a > .02) return { x: p.x, y: p.y, a, own: true };
    }
    if (S.opts.datalink && c.track && !TK.sim.isLost(c)) {
      const tp = TK.sim.trackPos(c); return { x: tp.x, y: tp.y, a: .45, own: false };
    }
    if (S.sel === c && c.track) { const tp = TK.sim.trackPos(c); return { x: tp.x, y: tp.y, a: .5, own: false }; }
    return null;
  }

  function draw() {
    const s = site(); if (!s) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = W / 2, r = R(), rk = rangeKm();
    ctx.clearRect(0, 0, W, W);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); bg.addColorStop(0, '#07250f'); bg.addColorStop(1, '#020a05');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();

    // peta dasar
    if (S.opts.land) {
      ctx.fillStyle = 'rgba(40,140,70,.16)'; ctx.strokeStyle = 'rgba(57,255,110,.3)'; ctx.lineWidth = 1;
      for (const l of TK.LAND) {
        ctx.beginPath(); l.pts.forEach((p, i) => { const q = scr(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    // grid & ring
    ctx.font = '10px Consolas,monospace';
    if (S.opts.grid) {
      ctx.strokeStyle = 'rgba(57,255,110,.26)'; ctx.fillStyle = 'rgba(57,255,110,.7)';
      for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, r * i / 4, 0, TAU); ctx.stroke(); ctx.fillText(TK.fmt.ring(rk * i / 4), cx + 4, cy - r * i / 4 + 11); }
      ctx.strokeStyle = 'rgba(57,255,110,.16)';
      for (let a = 0; a < 360; a += 30) { const t = rad(a); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(t) * r, cy - Math.cos(t) * r); ctx.stroke(); }
    }
    // cakupan SAM & radar
    ctx.setLineDash([5, 5]);
    if (s.sam) { const sr = s.sam.range / rk * r; if (sr < r) { ctx.strokeStyle = 'rgba(255,59,59,.55)'; ctx.beginPath(); ctx.arc(cx, cy, sr, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,59,59,.7)'; ctx.fillText('SAM ' + TK.fmt.rng(s.sam.range), cx + 6, cy - sr - 4); } }
    const rr2 = s.range / rk * r; if (rr2 < r) { ctx.strokeStyle = 'rgba(55,215,255,.4)'; ctx.beginPath(); ctx.arc(cx, cy, rr2, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([]);

    // jejak sweep
    const th = s.theta, N = 56, stp = .02;
    for (let i = 0; i < N; i++) {
      const a1 = th - i * stp - Math.PI / 2, a0 = a1 - stp;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1 + .003); ctx.closePath();
      ctx.fillStyle = 'rgba(57,255,110,' + (.34 * Math.pow(1 - i / N, 2)).toFixed(3) + ')'; ctx.fill();
    }
    ctx.strokeStyle = '#7dffa0'; ctx.lineWidth = 2; ctx.shadowColor = '#39ff6e'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(th) * r, cy - Math.cos(th) * r); ctx.stroke(); ctx.shadowBlur = 0;

    // strobe jamming
    if (s.jam > 0) {
      ctx.strokeStyle = 'rgba(255,176,0,.55)'; ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) { const t = s.jamB + (Math.random() - .5) * .12, d = Math.random() * r; ctx.beginPath(); ctx.moveTo(cx + Math.sin(t) * d, cy - Math.cos(t) * d); ctx.lineTo(cx + Math.sin(t) * r, cy - Math.cos(t) * r); ctx.stroke(); }
    }

    // situs lain
    for (const o of S.sites) {
      if (o === s) continue; const q = scr(o.x, o.y); if (Math.hypot(q[0] - cx, q[1] - cy) > r) continue;
      ctx.strokeStyle = o.hp > 0 ? COL.G : '#555'; ctx.lineWidth = 1.2; ctx.strokeRect(q[0] - 4, q[1] - 4, 8, 8);
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(o.id, q[0] + 7, q[1] + 3);
    }

    for (const c of S.contacts) drawContact(c, r);

    // rudal & efek
    for (const m of S.missiles) {
      const q = scr(m.x, m.y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] - Math.sin(m.hdg) * 8, q[1] + Math.cos(m.hdg) * 8); ctx.stroke();
      ctx.fillStyle = '#ffb000'; ctx.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
    }
    for (const f of S.fx) {
      const p = (S.t - f.t) / 2, q = scr(f.x, f.y);
      ctx.strokeStyle = 'rgba(255,' + Math.round(180 - 120 * p) + ',40,' + (1 - p) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], (f.big ? 50 : 22) * p + 4, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(q[0], q[1], (f.big ? 30 : 12) * p, 0, TAU); ctx.stroke();
    }
    // simbol situs sendiri
    ctx.strokeStyle = COL.G; ctx.fillStyle = COL.G; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 7, cy + 5); ctx.lineTo(cx - 7, cy + 5); ctx.closePath(); ctx.stroke(); ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    ctx.restore();

    // bingkai & skala bearing
    ctx.strokeStyle = '#1c8f3f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1; ctx.fillStyle = '#39ff6e'; ctx.font = '11px Consolas,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let a = 0; a < 360; a += 5) {
      const t = rad(a), big = a % 30 === 0, l = big ? 10 : a % 10 === 0 ? 6 : 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(t) * r, cy - Math.cos(t) * r); ctx.lineTo(cx + Math.sin(t) * (r + l), cy - Math.cos(t) * (r + l)); ctx.stroke();
      if (big) ctx.fillText(a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : pad(a, 3), cx + Math.sin(t) * (r + 17), cy - Math.cos(t) * (r + 17));
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function drawContact(c, r) {
    const v = view(c), sel = S.sel === c; if (!v) return;
    const col = COL[c.iff], q = scr(v.x, v.y);
    if (Math.hypot(q[0] - W / 2, q[1] - W / 2) > r + 4) return;
    const lost = TK.sim.isLost(c);
    // jejak
    if (S.opts.trails) c.hist.forEach((h, i) => {
      const hq = scr(h.x, h.y); ctx.globalAlpha = (i + 1) / c.hist.length * .35 * Math.max(v.a, .3); ctx.fillStyle = col; ctx.fillRect(hq[0] - 1.5, hq[1] - 1.5, 3, 3);
    });
    ctx.globalAlpha = sel ? Math.max(v.a, .6) : v.a; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6;
    if (v.own) { ctx.shadowColor = col; ctx.shadowBlur = 8 * v.a; }
    if (!v.own || lost) ctx.setLineDash([2, 2]);
    TK.drawSymbol(ctx, q[0], q[1], c, 6, v.own);
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    // vektor kecepatan
    const hd = c.track ? c.track.hdg : c.hdg, len = c.kind === 'SEA' ? 8 : 16;
    ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.sin(hd) * len, q[1] - Math.cos(hd) * len); ctx.stroke();
    if (S.opts.labels || sel) {
      ctx.font = '10px Consolas,monospace'; ctx.fillText(TK.sim.label(c) + (c.typeKnown ? '' : ' ?'), q[0] + 10, q[1] - 8);
      if (sel) ctx.fillText(TK.fmt.altS(c.alt) + ' ' + TK.fmt.spdN(c.spd), q[0] + 10, q[1] + 3);
    }
    ctx.globalAlpha = 1;
    if (sel) {
      const l = 13; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (k) {
        ctx.beginPath(); ctx.moveTo(q[0] + k[0] * l, q[1] + k[1] * (l - 6)); ctx.lineTo(q[0] + k[0] * l, q[1] + k[1] * l); ctx.lineTo(q[0] + k[0] * (l - 6), q[1] + k[1] * l); ctx.stroke();
      });
    }
    if (c.inbound > 0) {
      ctx.strokeStyle = COL.H; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -S.t * 40;
      ctx.beginPath(); ctx.arc(q[0], q[1], 18, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // pilih kontak terdekat dari posisi klik (koordinat CSS di dalam kanvas)
  function pick(mx, my) {
    let best = null, bd = 20;
    for (const c of S.contacts) {
      const v = view(c); if (!v) continue; const q = scr(v.x, v.y), d = Math.hypot(q[0] - mx, q[1] - my);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  // koordinat kursor -> info
  function cursorInfo(mx, my) {
    const rk = rangeKm(), rr = R(), dx = (mx - W / 2) / rr * rk, dy = -(my - W / 2) / rr * rk, d = Math.hypot(dx, dy);
    return d > rk ? null : { brg: (deg(Math.atan2(dx, dy)) + 360) % 360, rng: d };
  }

  TK.radar = { resize, draw, pick, cursorInfo, el: cv, getW: () => W };
})();
