/* ============================================================
   MAP — peta taktis teater (zoom, geser, simbol, cakupan sensor)
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, S = TK.S, C = TK.CFG, COL = TK.COL;
  const { TAU } = TK.util;

  const cv = document.getElementById('map'), ctx = cv.getContext('2d'), stage = document.getElementById('stage');
  let W = 600, H = 400, dpr = 1;
  const V = { cx: 0, cy: 0, ppk: 0.2 };  // pusat pandang (km) & piksel per km

  function fit() { V.cx = 0; V.cy = 0; V.ppk = Math.min(W, H) / (C.EXT * 2.05); }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = stage.clientWidth; H = stage.clientHeight;
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
    if (!V.init) { fit(); V.init = true; }
  }
  const scr = (x, y) => [W / 2 + (x - V.cx) * V.ppk, H / 2 - (y - V.cy) * V.ppk];
  const world = (px, py) => [V.cx + (px - W / 2) / V.ppk, V.cy - (py - H / 2) / V.ppk];

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#04160c'); bg.addColorStop(1, '#020a06');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // graticule
    ctx.font = '10px Consolas,monospace'; ctx.lineWidth = 1;
    const step = V.ppk > .5 ? 1 : V.ppk > .25 ? 2 : 5;
    const ll0 = TK.geo.toLL(...world(0, H)), ll1 = TK.geo.toLL(...world(W, 0));
    ctx.strokeStyle = 'rgba(57,255,110,.13)'; ctx.fillStyle = 'rgba(57,255,110,.55)';
    for (let lon = Math.ceil(ll0[0] / step) * step; lon <= ll1[0]; lon += step) {
      const p = scr(...TK.geo.toKm(lon, 0)); ctx.beginPath(); ctx.moveTo(p[0], 0); ctx.lineTo(p[0], H); ctx.stroke(); ctx.fillText(lon + '°E', p[0] + 3, H - 4);
    }
    for (let lat = Math.ceil(ll0[1] / step) * step; lat <= ll1[1]; lat += step) {
      const p = scr(...TK.geo.toKm(112, lat)); ctx.beginPath(); ctx.moveTo(0, p[1]); ctx.lineTo(W, p[1]); ctx.stroke(); ctx.fillText(Math.abs(lat) + '°' + (lat < 0 ? 'S' : 'N'), 3, p[1] - 3);
    }

    // daratan
    ctx.fillStyle = 'rgba(30,110,55,.32)'; ctx.strokeStyle = 'rgba(57,255,110,.55)'; ctx.lineWidth = 1.2;
    for (const l of TK.LAND) {
      ctx.beginPath(); l.pts.forEach((p, i) => { const q = scr(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(57,255,110,.35)'; ctx.font = '11px Consolas,monospace';
    for (const l of TK.LAND) if (l.n && l.c) { const q = scr(l.c[0], l.c[1]); ctx.fillText(l.n, q[0] - ctx.measureText(l.n).width / 2, q[1]); }

    // situs: cakupan radar & SAM
    for (const s of S.sites) {
      const q = scr(s.x, s.y), on = s.hp > 0, selS = s.id === S.siteId;
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1;
      ctx.strokeStyle = on ? (selS ? 'rgba(55,215,255,.75)' : 'rgba(55,215,255,.3)') : 'rgba(120,120,120,.3)';
      ctx.beginPath(); ctx.arc(q[0], q[1], s.range * V.ppk, 0, TAU); ctx.stroke();
      if (s.sam && on) { ctx.strokeStyle = 'rgba(255,59,59,.45)'; ctx.beginPath(); ctx.arc(q[0], q[1], s.sam.range * V.ppk, 0, TAU); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // sektor sweep situs terpilih
    const ss = TK.sim.siteById(S.siteId);
    if (ss && ss.hp > 0) {
      const q = scr(ss.x, ss.y), r = ss.range * V.ppk;
      for (let i = 0; i < 20; i++) {
        const a1 = ss.theta - i * .03 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.arc(q[0], q[1], r, a1 - .03, a1 + .002); ctx.closePath();
        ctx.fillStyle = 'rgba(57,255,110,' + (.18 * (1 - i / 20)).toFixed(3) + ')'; ctx.fill();
      }
    }
    // simbol situs
    ctx.font = '10px Consolas,monospace';
    for (const s of S.sites) {
      const q = scr(s.x, s.y), on = s.hp > 0, col = !on ? '#777' : s.jam > 0 ? '#ffb000' : COL.G;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6;
      if (s.kind === 'SHIP') { ctx.beginPath(); ctx.moveTo(q[0] - 8, q[1] - 3); ctx.lineTo(q[0] + 8, q[1] - 3); ctx.lineTo(q[0] + 5, q[1] + 4); ctx.lineTo(q[0] - 5, q[1] + 4); ctx.closePath(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(q[0], q[1] - 8); ctx.lineTo(q[0] + 7, q[1] + 5); ctx.lineTo(q[0] - 7, q[1] + 5); ctx.closePath(); ctx.stroke(); }
      if (s.id === S.siteId) { ctx.strokeStyle = '#fff'; ctx.strokeRect(q[0] - 12, q[1] - 12, 24, 24); }
      ctx.fillText(s.name + (on ? '' : ' [X]'), q[0] + 14, q[1] - 6);
    }

    // kontak (track fusi + dead-reckoning)
    for (const c of S.contacts) {
      if (!c.track) continue;
      const age = TK.sim.trackAge(c); if (age > 120 && S.sel !== c) continue;
      const lost = TK.sim.isLost(c), p = TK.sim.trackPos(c), q = scr(p.x, p.y), sel = S.sel === c, col = COL[c.iff];
      if (q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) continue;
      if (S.opts.trails) { ctx.fillStyle = col; c.hist.forEach((h, i) => { const hq = scr(h.x, h.y); ctx.globalAlpha = (i + 1) / c.hist.length * .4; ctx.fillRect(hq[0] - 1.5, hq[1] - 1.5, 3, 3); }); }
      ctx.globalAlpha = lost ? .5 : 1; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6;
      if (lost) ctx.setLineDash([2, 2]);
      TK.drawSymbol(ctx, q[0], q[1], c, 6, !lost); ctx.setLineDash([]);
      const len = c.kind === 'SEA' ? 8 : 18;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.sin(c.track.hdg) * len, q[1] - Math.cos(c.track.hdg) * len); ctx.stroke();
      if (S.opts.labels || sel) { ctx.font = '10px Consolas,monospace'; ctx.fillText(TK.sim.label(c) + (c.typeKnown ? '' : ' ?') + (lost ? ' LOST' : ''), q[0] + 10, q[1] - 8); }
      ctx.globalAlpha = 1;
      if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(q[0] - 12, q[1] - 12, 24, 24); }
      if (c.inbound > 0) { ctx.strokeStyle = COL.H; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -S.t * 40; ctx.beginPath(); ctx.arc(q[0], q[1], 18, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    }
    // rudal & efek
    for (const m of S.missiles) {
      const q = scr(m.x, m.y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] - Math.sin(m.hdg) * 9, q[1] + Math.cos(m.hdg) * 9); ctx.stroke();
    }
    for (const f of S.fx) {
      const p = (S.t - f.t) / 2, q = scr(f.x, f.y);
      ctx.strokeStyle = 'rgba(255,' + Math.round(180 - 120 * p) + ',40,' + (1 - p) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], (f.big ? 50 : 22) * p + 4, 0, TAU); ctx.stroke();
    }

    // skala & panah utara
    const km = V.ppk > 1 ? 100 : V.ppk > .3 ? 200 : 500, px = km * V.ppk;
    ctx.strokeStyle = COL.G; ctx.fillStyle = COL.G; ctx.lineWidth = 2;
    const sx = 56, sy = H - 40;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + px, sy); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.moveTo(sx + px, sy - 5); ctx.lineTo(sx + px, sy + 5); ctx.stroke();
    ctx.font = '10px Consolas,monospace'; ctx.fillText(TK.fmt.rng(km), sx + 4, sy - 7);
    ctx.fillText('N', W - 24, 36); ctx.beginPath(); ctx.moveTo(W - 20, 40); ctx.lineTo(W - 20, 62); ctx.moveTo(W - 20, 40); ctx.lineTo(W - 25, 48); ctx.moveTo(W - 20, 40); ctx.lineTo(W - 15, 48); ctx.stroke();
    ctx.fillStyle = 'rgba(255,176,0,.7)'; const dis = TK.t('map_disc'); ctx.fillText(dis, W / 2 - ctx.measureText(dis).width / 2, 14);
  }

  /* ---------- interaksi ---------- */
  function pick(mx, my) {
    let best = null, bd = 18;
    for (const c of S.contacts) {
      if (!c.track) continue; const p = TK.sim.trackPos(c), q = scr(p.x, p.y), d = Math.hypot(q[0] - mx, q[1] - my);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function cursorInfo(mx, my) {
    const w = world(mx, my), ll = TK.geo.toLL(w[0], w[1]);
    return { lat: ll[1], lon: ll[0] };
  }
  let drag = null;
  cv.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, cx: V.cx, cy: V.cy, moved: false }; });
  window.addEventListener('mousemove', e => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) { V.cx = drag.cx - dx / V.ppk; V.cy = drag.cy + dy / V.ppk; }
  });
  window.addEventListener('mouseup', () => { setTimeout(() => { drag = null; }, 0); });
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, before = world(mx, my);
    V.ppk = Math.max(.06, Math.min(3, V.ppk * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = world(mx, my); V.cx += before[0] - after[0]; V.cy += before[1] - after[1];
  }, { passive: false });
  cv.addEventListener('dblclick', fit);

  TK.map = { resize, draw, pick, cursorInfo, el: cv, wasDrag: () => drag && drag.moved, fit };
})();
