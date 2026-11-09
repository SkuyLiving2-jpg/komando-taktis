/* =========================================================================
   fps-claycam.js — kamera mini Clay Martin: PC kanan atas layar · HP (v2.17) tengah atas, tulisan rata-tengah HUD disembunyikan selama tampil
   Muncul hanya pada dua saat: ketika Clay Martin pertama kali muncul, dan setiap kali ia akan terbang.
   Gambar 3D-nya dirender fps-gl (pipPass) ke persegi C.rect; berkas ini mengatur kamera, waktu, dan lapisan siaran di atasnya.
   ========================================================================= */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q;
  const { clamp } = TK.util;
  const Tt = (k, v) => TK.t(k, v);
  const INTRO = 8, FLY = 7.5, LOST = 1.4, SANS = '"BC","Bahnschrift","DIN Alternate","Segoe UI","Arial Narrow",Arial,sans-serif';
  const C = F.clayCam = { u: null, q: null, mode: '', age: 0, T: 0, cam: null, rect: null, vis: false, jf: false, scan: 0, a: 0, ax: 0, ay: 0, az: 0, tz: 0 };

  function angleFree(u, a, r, gz) {   // tidak terhalang gedung atau bukit
    for (const q of [.35, .7, 1]) { const x = u.x + Math.cos(a) * r * q, y = u.y + Math.sin(a) * r * q; if (F.bTop(x, y) !== null || F.hAt(x, y) > gz + 2.2 || F.water(x, y)) return false; }
    return true;
  }
  function pickAngle(u, r) {
    const h = u.hdg || 0, gz = F.gAt(u.x, u.y);
    for (const o of [.25, -.25, .7, -.7, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6]) if (angleFree(u, h + o, r, gz)) return h + o;
    return h + .25;
  }
  function open(mode, u) {
    C.mode = mode; C.age = 0; C.u = u;
    if (mode === 'intro') { C.T = INTRO; C.a = pickAngle(u, 5); C.tz = F.gAt(u.x, u.y) + 1.9; }
    else { C.T = FLY; C.a = pickAngle(u, 17); C.ax = u.x + Math.cos(C.a) * 17; C.ay = u.y + Math.sin(C.a) * 17; C.az = F.hAt(C.ax, C.ay) + 1.05; C.tz = F.zOf(u) + 1.6; }
  }
  function aim(x, y, z, tx, ty, tz, fov) {
    const therm = (F.TOD[P.tod] || F.TOD.DAY).sun[1] < 0;   // malam: gambar termal agar sosoknya tetap jelas
    return { x, y, z, yaw: Math.atan2(ty - y, tx - x), pitch: Math.atan2(tz - z, Math.hypot(tx - x, ty - y)), fov, therm, fogD: 3200 };
  }
  F.ccTick = function (dt) {
    if (F.swGL) { C.mode = ''; return; }
    if (C.q !== Q.g) { C.q = Q.g; C.u = null; C.mode = ''; C.jf = false; C.cam = null; }
    if (!C.u) {
      C.scan -= dt;
      if (C.scan <= 0) { C.scan = .4; const u = Q.units.find(e => e.type === 'CLAY' && !e.dead); if (u) { C.jf = !!u.jf; open('intro', u); } }
    } else if (!C.u.dead) {
      const on = !!C.u.jf; if (on && !C.jf) open('fly', C.u); C.jf = on;
    }
    if (!C.mode) return;
    C.age += dt;
    const u = C.u;
    if (C.mode !== 'lost' && u.dead) { C.mode = 'lost'; C.age = 0; C.T = LOST; C.cam = null; return; }
    if (C.age > C.T) { C.mode = ''; C.cam = null; return; }
    if (C.mode === 'lost') return;
    if (C.mode === 'intro') {   // dari depan-bawah, kamera pelan mendekat dan sedikit memutar: sosoknya menjulang
      const k = clamp(C.age / C.T, 0, 1), r = 4.9 - 1.6 * k * (2 - k), a = C.a + C.age * .06, gz = F.gAt(u.x, u.y), x = u.x + Math.cos(a) * r, y = u.y + Math.sin(a) * r, z = Math.max(F.hAt(x, y) + .3, gz + .3);
      C.tz += (gz + 1.95 - C.tz) * Math.min(1, dt * 5);
      C.cam = aim(x, y, z, u.x, u.y, C.tz, .98);   // lensa lebar dari dekat tanah: sosoknya terasa menjulang
    } else {   // kamera tetap di tanah, lensa mengikuti saat Clay berlari lalu melesat
      C.tz = F.zOf(u) + (F.altOf(u) > 4 ? 1 : 1.6);   // langsung, tanpa penghalusan: Clay menanjak 40 m/dtk dan lensanya sempit
      const d = Math.hypot(u.x - C.ax, u.y - C.ay, C.tz - C.az);
      C.cam = aim(C.ax, C.ay, C.az, u.x, u.y, C.tz, clamp(2 * Math.atan(3.3 / Math.max(d, 1)), .045, .62));
    }
  };
  F.ccLayout = function (CW, CH, s, hide) {
    C.vis = false;
    if (!C.mode || hide || F.swGL || P.menu || !P.alive || Q.over) return;
    if (TK.fpsui && TK.fpsui.touch) {   // HP: di tengah, tepat di bawah kompas; bawahnya berhenti sedikit di atas bidikan
      const y = Math.round(70 * s), h = clamp(Math.min(CH / 2 - y - 8, 210 * s), 84, 260), w = Math.min(h / .5625, CW * .5);
      C.rect = [Math.round((CW - w) / 2), y, Math.round(w), Math.round(w * .5625)]; C.vis = true; return;
    }
    let w = Math.min(340 * s, CW / 2 - 336 * s), y = 14 * s;
    if (w < 210 * s) { w = 260 * s; y = 64 * s; }   // layar sempit: di bawah kompas
    const gx = P.gs ? 70 * s : 0;   // kamera udara (AC-130/laser/drone): kompas lingkaran di pojok kanan atas tetap terlihat
    C.rect = [Math.round(CW - 18 * s - w - gx), Math.round(y), Math.round(w), Math.round(w * .5625)]; C.vis = true;
  };
  F.ccBot = () => C.vis && C.rect ? C.rect[1] + C.rect[3] : 0;
  F.ccZone = () => C.vis && C.rect ? [C.rect[0] - 4, 0, C.rect[0] + C.rect[2] + 30, C.rect[1] + C.rect[3] + 6] : null;

  let NOISE = null, SCAN = null;
  function tiles() {
    if (NOISE) return;
    NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 128; const a = NOISE.getContext('2d'), d = a.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = v; d.data[i + 1] = v * .86; d.data[i + 2] = v * .82; d.data[i + 3] = 255; }
    a.putImageData(d, 0, 0);
    SCAN = document.createElement('canvas'); SCAN.width = 2; SCAN.height = 3; const b = SCAN.getContext('2d'); b.fillStyle = 'rgba(0,0,0,.2)'; b.fillRect(0, 0, 2, 1);
  }
  function tx(ctx, t, x, y, size, col, al, bold) {
    ctx.font = (bold === false ? '' : 'bold ') + Math.round(size) + 'px ' + SANS; ctx.textAlign = al || 'left'; ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillText(t, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(t, x, y);
  }
  F.ccDraw = function (ctx, s) {
    if (!C.vis || !C.rect) return;
    tiles();
    const [x, y, w, h] = C.rect, age = C.age, k = Math.min(clamp(age / .32, 0, 1), clamp((C.T - age) / .28, 0, 1)), u = C.u, fly = C.mode === 'fly', lost = C.mode === 'lost', now = P.time;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (lost || !C.cam) { ctx.fillStyle = '#050304'; ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = 'rgba(110,8,4,.2)'; ctx.fillRect(x, y, w, h);
    const tg = ctx.createLinearGradient(0, y, 0, y + h * .55); tg.addColorStop(0, 'rgba(12,0,0,.62)'); tg.addColorStop(1, 'rgba(12,0,0,0)'); ctx.fillStyle = tg; ctx.fillRect(x, y, w, h * .55);   // langit digelapkan
    const v = ctx.createRadialGradient(x + w / 2, y + h / 2, h * .36, x + w / 2, y + h / 2, w * .68); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,0,0,.82)'); ctx.fillStyle = v; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = ctx.createPattern(SCAN, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore();
    const sn = lost ? .92 : (k < 1 ? (1 - k) * .95 : .05 + (Math.sin(now * 37) > .986 ? .1 : 0));   // bunga salju: tebal saat siaran dibuka/ditutup, kadang terganggu
    ctx.globalAlpha = sn; const ox = Math.floor(Math.random() * 128), oy = Math.floor(Math.random() * 128);
    for (let j = -oy; j < h; j += 128) for (let i = -ox; i < w; i += 128) ctx.drawImage(NOISE, x + i, y + j);
    ctx.globalAlpha = 1;
    if (Math.sin(now * 2.3) + Math.sin(now * 3.9) > 1.72) { const by = y + ((now * 91) % 1) * h; ctx.fillStyle = 'rgba(255,60,44,.16)'; ctx.fillRect(x, by, w, 4 * s); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, by + 4 * s, w, 7 * s); }   // garis sobek
    const g = ctx.createLinearGradient(0, y + h * .56, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.86)'); ctx.fillStyle = g; ctx.fillRect(x, y + h * .56, w, h * .44);
    const pad = 9 * s;
    if (lost) tx(ctx, Tt('cc_lost'), x + w / 2, y + h / 2 + 5 * s, 15 * s, '#ff4a3a', 'center');
    else if (k > .55) {
      if ((now * 1.7) % 1 < .62) { ctx.fillStyle = '#ff2a1c'; ctx.beginPath(); ctx.arc(x + pad + 3.5 * s, y + pad + 3 * s, 3.5 * s, 0, 6.283); ctx.fill(); }
      tx(ctx, Tt('cc_live'), x + pad + 11 * s, y + pad + 7 * s, 10.5 * s, '#ff4a3a');
      tx(ctx, Tt('cc_feed'), x + pad + 11 * s + ctx.measureText(Tt('cc_live')).width + 8 * s, y + pad + 7 * s, 10 * s, 'rgba(255,226,216,.82)', 'left', false);
      const qt = Q.t || 0, mm = Math.floor(qt / 60), ss = Math.floor(qt) % 60, ff = Math.floor(qt * 24) % 24, p2 = n => (n < 10 ? '0' : '') + n;
      tx(ctx, p2(mm) + ':' + p2(ss) + ':' + p2(ff), x + w - pad, y + pad + 7 * s, 10 * s, 'rgba(255,226,216,.82)', 'right', false);
      const name = TK.t('wu_CLAY').split('—')[0].trim().toUpperCase(), line = Tt(fly ? 'cc_jet' : (age < 4 ? 'cc_threat' : 'cc_line'));
      tx(ctx, name, x + pad, y + h - pad - 15 * s, 23 * s, '#fff');
      tx(ctx, line.slice(0, Math.ceil(((fly ? age : age % 4) - .3) * 30)), x + pad, y + h - pad, 10.5 * s, '#ff5a48');
      if (u && P.unit) {
        const dm = Math.hypot(u.x - P.unit.x, u.y - P.unit.y), dt = Tt('cc_dist') + ' ' + (dm >= 1000 ? (dm / 1000).toFixed(1) + ' KM' : Math.round(dm) + ' M');
        tx(ctx, dt, x + w - pad, y + h - pad, 10.5 * s, 'rgba(255,226,216,.9)', 'right', false);
        if (fly) { tx(ctx, Tt('cc_alt') + ' ' + Math.round(F.altOf(u)) + ' M · ' + Math.round((u.jv || 0) * (Q.speed || 1) * 3.6) + ' KM/J', x + w - pad, y + h - pad - 14 * s, 10.5 * s, '#ff5a48', 'right', false); }
      }
    }
    if (k < 1) { const hb = h * (1 - k) / 2; ctx.fillStyle = '#040203'; ctx.fillRect(x, y, w, hb); ctx.fillRect(x, y + h - hb, w, hb); }   // layar tabung: gambar terbuka dari tengah
    ctx.restore();
    const pulse = fly && age < 2 ? .55 + .45 * Math.sin(age * 16) : .9, cn = 15 * s;
    ctx.globalAlpha = pulse * Math.min(1, k * 2); ctx.strokeStyle = '#ff2a1c'; ctx.lineWidth = 1; ctx.strokeRect(x - .5, y - .5, w + 1, h + 1); ctx.lineWidth = 2.5 * s; ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.moveTo(cx + sx * cn, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * cn); }
    ctx.stroke(); ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };
})();
