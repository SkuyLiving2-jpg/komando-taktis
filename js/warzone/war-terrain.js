/* ============================================================
   WAR-TERRAIN — tekstur peta medan 2D dari grid Q.g (warna bioma,
   bayangan lereng, kota, gunung berapi). Dipakai WARZONE (war-view)
   dan minimap / peta taktis mode OPERATOR (juga edisi offline).
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR;
  const { clamp } = TK.util;
  function build(g) {
    const S = 8, w = W.GW * S, h = W.GH * S;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    const base = [[36, 62, 38], [22, 50, 30], [76, 70, 50], [10, 38, 58], [74, 78, 82], [112, 104, 78]];
    const BIOC = { 1: { 0: [150, 128, 84], 1: [74, 92, 46], 2: [128, 96, 64] }, 2: { 0: [42, 58, 40], 1: [24, 44, 30], 2: [60, 66, 46] }, 3: { 0: [62, 56, 52], 1: [42, 48, 36], 2: [56, 48, 46] } };
    const E = (gx, gy) => {
      gx = clamp(gx - .5, 0, W.GW - 1.001); gy = clamp(gy - .5, 0, W.GH - 1.001);
      const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, i = y0 * W.GW + x0, e = g.e;
      return e[i] * (1 - fx) * (1 - fy) + e[i + 1] * fx * (1 - fy) + e[i + W.GW] * (1 - fx) * fy + e[i + W.GW + 1] * fx * fy;
    };
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const gx = px / S, gy = py / S, cx = Math.min(W.GW - 1, gx | 0), cy = Math.min(W.GH - 1, gy | 0), t = g.t[cy * W.GW + cx];
      const bi = g.bio ? g.bio[cy * W.GW + cx] : 0;
      let col = (BIOC[bi] && BIOC[bi][t] || base[t]).slice(), n = (W.vn(px / 3, py / 3, 7) - .5) * 16 + (W.vn(px / 14, py / 14, 3) - .5) * 18;
      if (t === W.TER.WATER) { const k = Math.pow(clamp(E(gx, gy) / .28, 0, 1), 2); col = [10 + 14 * k, 38 + 34 * k, 58 + 40 * k]; n *= .5; }
      else if (t !== W.TER.ROAD && t !== W.TER.URBAN) { const sh = (E(gx - .4, gy - .4) - E(gx + .4, gy + .4)) * 260; n += sh; if (t === W.TER.FOREST) n += (W.vn(px / 1.5, py / 1.5, 11) - .5) * 26; }
      const i = (py * w + px) * 4; d[i] = col[0] + n; d[i + 1] = col[1] + n; d[i + 2] = col[2] + n; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const x2 = c2.getContext('2d');
    try { x2.filter = 'blur(3.6px)'; } catch (e) { /* tanpa blur */ }
    x2.drawImage(c, 0, 0); x2.filter = 'none';
    // bangunan kota
    for (let cy = 0; cy < W.GH; cy++) for (let cx = 0; cx < W.GW; cx++) if (g.t[cy * W.GW + cx] === W.TER.URBAN) {
      for (let k = 0; k < 4; k++) {
        const bx = cx * S + 1 + (k % 2) * 4, by = cy * S + 1 + (k >> 1) * 4, hh = 2 + Math.floor(W.vn(cx + k, cy, 4) * 2.4);
        x2.fillStyle = 'rgba(0,0,0,.35)'; x2.fillRect(bx + 1, by + 1, 3, hh + 1); x2.fillStyle = k % 2 ? '#8a9095' : '#737a80'; x2.fillRect(bx, by, 3, hh + 1);
      }
    }
    if (g.volc) {   // kawah & aliran lahar gunung berapi
      const vx = g.volc.x * S, vy = g.volc.y * S, gr = x2.createRadialGradient(vx, vy, 0, vx, vy, S * 1.6);
      gr.addColorStop(0, 'rgba(255,190,70,.95)'); gr.addColorStop(.45, 'rgba(230,70,20,.85)'); gr.addColorStop(1, 'rgba(60,20,10,0)');
      x2.fillStyle = gr; x2.beginPath(); x2.arc(vx, vy, S * 1.6, 0, 6.3); x2.fill();
      x2.strokeStyle = 'rgba(255,110,30,.75)'; x2.lineWidth = 2.2;
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + g.seed % 7; x2.beginPath(); x2.moveTo(vx, vy); for (let r = 1; r < 5; r++) x2.lineTo(vx + Math.cos(a + Math.sin(r * 1.7) * .25) * r * S, vy + Math.sin(a + Math.sin(r * 1.7) * .25) * r * S); x2.stroke(); }
    }
    return c2;
  }
  TK.warTerrain = { build };
})();
