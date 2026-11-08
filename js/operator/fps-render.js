/* ============================================================
   FPS-RENDER — mesin render 3D perangkat lunak (tanpa WebGL):
   medan voxel-space + poligon berbayang untuk unit, pohon,
   efek. Buffer kolom-mayor (diputar saat digambar ke layar).
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, F = TK.FPS, P = F.P, UT = W.UT, Q = TK.war.Q;
  const { clamp } = TK.util;
  const R = F.R = { RW: 0, RH: 0, nvg: false, ready: false };
  let RW = 0, RH = 0, buf = null, zb = null, img = null, off = null, octx = null;
  let cam = null, FOCAL = 1, HOR = 0, CX2 = 0, cosY = 1, sinY = 0, TAN = 1, tod = F.TOD.DAY, FAR = 1500, TIME = 0, NEAR = .3;
  let TINT = [1, 1, 1], FOG = [200, 210, 220], LDIR = [.5, .4, .7], AMB = 1;
  const FOGK = new Float32Array(4200), skyRow = new Uint32Array(2048);
  let skyBot = new Int16Array(1024);
  const CLOUD = new Float32Array(256 * 256);
  const pk = (r, g, b) => (255 << 24) | ((b > 255 ? 255 : b < 0 ? 0 : b | 0) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g | 0) << 8) | (r > 255 ? 255 : r < 0 ? 0 : r | 0);
  const QS = [.3, .45, .65];

  /* ---------------- BUFFER ---------------- */
  R.resize = function (cw, ch) {
    const q = QS[F.opts.quality] || .45, w = clamp(Math.round(cw * q), 280, 1000), h = clamp(Math.round(w * ch / Math.max(1, cw)), 160, 640);
    if (w === RW && h === RH) return;
    RW = w; RH = h; R.RW = w; R.RH = h;
    off = document.createElement('canvas'); off.width = RH; off.height = RW; octx = off.getContext('2d');
    img = octx.createImageData(RH, RW); buf = new Uint32Array(img.data.buffer); zb = new Float32Array(RW * RH);
    if (skyBot.length < RW) skyBot = new Int16Array(RW);
    R.ready = true;
  };

  /* ---------------- KAMERA / WARNA ---------------- */
  function setupCam() {
    cam = P.cam; tod = F.TOD[P.tod] || F.TOD.DAY; TIME = P.time;
    cosY = Math.cos(cam.yaw); sinY = Math.sin(cam.yaw); TAN = Math.tan(cam.fov / 2); FOCAL = RW / 2 / TAN; CX2 = RW / 2; HOR = RH / 2 + Math.tan(cam.pitch) * FOCAL;
    TINT = tod.tint.map(v => v * tod.amb); FOG = tod.fog; AMB = tod.amb; FAR = Math.round(tod.dist * 1.75);
    for (let i = 0; i < FOGK.length; i++) { const t = i / 2 / tod.dist; FOGK[i] = 1 - Math.exp(-t * t); }
    const s = tod.sun, az = s[0] * Math.PI / 180, el = (s[1] < 4 ? 40 : s[1]) * Math.PI / 180; LDIR = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
  }
  let FLASH = 0;   // unit yang baru terkena tembakan berkilat putih sesaat
  const grade = (r, g, b) => { if (!R.nvg) return [r, g, b]; const l = (r * .3 + g * .59 + b * .11) * 2.6 + 18; return [l * .25, l, l * .32]; };
  const fogK = t => FOGK[Math.min(4199, (t * 2) | 0)];
  function lit(base, shade, fwd) {
    let r = base[0] * shade * TINT[0], g = base[1] * shade * TINT[1], b = base[2] * shade * TINT[2];
    if (FLASH) { r += 85; g += 85; b += 85; }
    if (R.nvg) { const l = (r * .3 + g * .59 + b * .11) * 2.8 + 14; r = l * .25; g = l; b = l * .32; }
    const k = fogK(fwd); const f = R.nvg ? grade(FOG[0], FOG[1], FOG[2]) : FOG;
    return pk(r + (f[0] - r) * k, g + (f[1] - g) * k, b + (f[2] - b) * k);
  }

  /* ---------------- LANGIT ---------------- */
  function buildSky() {
    const s = tod.sky.map(c => grade(c[0], c[1], c[2])), hz = R.nvg ? grade(FOG[0], FOG[1], FOG[2]) : FOG;
    for (let y = 0; y < RH; y++) {
      const el = (HOR - y) / FOCAL; let c;
      if (el <= 0) c = hz;
      else {
        const a = Math.min(1, Math.atan(el) / 1.1);
        if (a < .22) { const k = a / .22; c = [hz[0] + (s[1][0] - hz[0]) * k, hz[1] + (s[1][1] - hz[1]) * k, hz[2] + (s[1][2] - hz[2]) * k]; }
        else { const k = Math.min(1, (a - .22) / .78); c = [s[1][0] + (s[0][0] - s[1][0]) * k, s[1][1] + (s[0][1] - s[1][1]) * k, s[1][2] + (s[0][2] - s[1][2]) * k]; }
      }
      skyRow[y] = pk(c[0], c[1], c[2]);
    }
  }
  function sun() {
    const night = tod.sun[1] < 0, L = LDIR;
    const fwd = L[0] * cosY + L[1] * sinY, rgt = -L[0] * sinY + L[1] * cosY; if (fwd <= .02) return;
    const sx = CX2 + rgt / fwd * FOCAL, sy = HOR - L[2] / fwd * FOCAL, rad = RW * (night ? .018 : .03) * (1 / (TAN * 1.2)) * .5, gl = rad * 7;
    const x0 = Math.max(0, Math.floor(sx - gl)), x1 = Math.min(RW - 1, Math.ceil(sx + gl)), y0 = Math.max(0, Math.floor(sy - gl)), y1 = Math.min(RH - 1, Math.ceil(sy + gl));
    const cr = night ? 200 : 255, cg = night ? 215 : 226, cb = night ? 255 : 170, inten = night ? .4 : 1;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const i = x * RH + y; if (zb[i] < 1e8) continue;
      const dx = x - sx, dy = y - sy, d2 = dx * dx + dy * dy, core = d2 < rad * rad ? 1 : 0, g = Math.exp(-d2 / (2 * gl * gl * .16)) * .75 * inten;
      const c = buf[i]; let r = c & 255, gg = (c >> 8) & 255, b = (c >> 16) & 255;
      if (core) { r = cr; gg = cg; b = cb; } else { r += cr * g; gg += cg * g * .9; b += cb * g * .7; }
      const gcol = R.nvg ? grade(r, gg, b) : [r, gg, b]; buf[i] = pk(gcol[0], gcol[1], gcol[2]);
    }
  }

  /* ---------------- AWAN (tekstur noise periodik, bidang pada ketinggian tetap) ---------------- */
  (function () {
    const P0 = 16, g = (x, y, s) => F.h2(((x % P0) + P0) % P0, ((y % P0) + P0) % P0, s);
    const noise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = g(xi, yi, s), b = g(xi + 1, yi, s), c = g(xi, yi + 1, s), d = g(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const x = i / 256 * P0, y = j / 256 * P0;
      let v = noise(x, y, 5) * .55 + noise(x * 2, y * 2, 9) * .3 + noise(x * 4, y * 4, 13) * .15;
      v = (v - .46) / .3; CLOUD[j * 256 + i] = v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v);
    }
  })();
  function clouds() {
    const night = tod.sun[1] < 0, base = night ? [70, 84, 120] : tod.sun[1] < 12 ? [255, 214, 190] : [250, 250, 252], sh = night ? [30, 38, 62] : tod.sun[1] < 12 ? [196, 120, 100] : [150, 160, 178];
    const wind = TIME * 9, HC = 1700, tr = TINT[0], tg = TINT[1], tb = TINT[2], nv = R.nvg;
    const fg = nv ? grade(FOG[0], FOG[1], FOG[2]) : FOG;
    for (let x = 0; x < RW; x++) {
      const rg = (x + .5 - CX2) / FOCAL, dx = cosY - sinY * rg, dy = sinY + cosY * rg, bot = skyBot[x], base0 = x * RH;
      for (let y = 0; y < bot; y++) {
        const el = (HOR - y - .5) / FOCAL; if (el < .045) continue;
        const t = HC / el, u = ((cam.x + dx * t + wind) / 3200 * 256) & 255, v = ((cam.y + dy * t) / 3200 * 256) & 255;
        let d = CLOUD[(v << 8) | u]; if (d <= .02) continue;
        const fade = Math.min(1, (el - .045) * 7); d *= fade * .92;
        const sg = d > .55 ? 0 : (.55 - d) * 0.0, k = Math.min(1, d * 1.15);   // inti awan lebih terang, tepi lebih tipis
        let r = base[0] + (sh[0] - base[0]) * (1 - d) * .55, g = base[1] + (sh[1] - base[1]) * (1 - d) * .55, b = base[2] + (sh[2] - base[2]) * (1 - d) * .55; void sg;
        r *= tr; g *= tg; b *= tb;
        if (nv) { const l = (r * .3 + g * .59 + b * .11) * 2.6 + 12; r = l * .25; g = l; b = l * .32; }
        const hz = Math.min(1, Math.max(0, 1 - el * 4)); r += (fg[0] - r) * hz * .6; g += (fg[1] - g) * hz * .6; b += (fg[2] - b) * hz * .6;
        const i = base0 + y, c0 = buf[i];
        buf[i] = pk((c0 & 255) + (r - (c0 & 255)) * k * .85, ((c0 >> 8) & 255) + (g - ((c0 >> 8) & 255)) * k * .85, ((c0 >> 16) & 255) + (b - ((c0 >> 16) & 255)) * k * .85);
      }
    }
  }

  /* ---------------- MEDAN VOXEL ---------------- */
  function terrain() {
    const w = F.world, H = w.H, T = w.T, C = w.C, NX = F.NX, NY = F.NY, ti = 1 / F.TX, WW = W.WW, WH = W.WH;
    const cx = cam.x, cy = cam.y, cz = cam.z, tr = TINT[0], tg = TINT[1], tb = TINT[2], nv = R.nvg;
    const fg = nv ? grade(FOG[0], FOG[1], FOG[2]) : FOG, fr = fg[0], fgg = fg[1], fb = fg[2];
    const ocean = pk(20 * tr, 56 * tg, 90 * tb);
    for (let x = 0; x < RW; x++) {
      const sx = (x + .5 - CX2) / FOCAL, rx = cosY - sinY * sx, ry = sinY + cosY * sx, base = x * RH;
      let ymin = RH, t = .5;
      while (t < FAR && ymin > 0) {
        const px = cx + rx * t, py = cy + ry * t;
        let h, col, flag = 0;
        if (px < 0 || py < 0 || px >= WW || py >= WH) { h = -3; col = ocean; flag = 3; }
        else {
          const fxx = px * ti, fyy = py * ti, idx = (fyy | 0) * NX + (fxx | 0);
          h = H[idx]; col = C[idx]; flag = T[idx];
          if (t < 70) {   // medan halus di dekat kamera (tidak melintasi dinding bangunan)
            let gx = fxx - .5, gy = fyy - .5; if (gx < 0) gx = 0; if (gy < 0) gy = 0; let ix = gx | 0, iy = gy | 0; if (ix >= NX - 1) ix = NX - 2; if (iy >= NY - 1) iy = NY - 2;
            const j = iy * NX + ix, h00 = H[j], h10 = H[j + 1], h01 = H[j + NX], h11 = H[j + NX + 1], hmx = Math.max(h00, h10, h01, h11), hmn = Math.min(h00, h10, h01, h11);
            if (hmx - hmn < 1.5) {
              const a = gx - ix, b = gy - iy; h = h00 * (1 - a) * (1 - b) + h10 * a * (1 - b) + h01 * (1 - a) * b + h11 * a * b;
              if (!(flag & 16) && t < 55) {   // warna halus
                const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b, k0 = C[j], k1 = C[j + 1], k2 = C[j + NX], k3 = C[j + NX + 1];
                col = (255 << 24) | ((((k0 >> 16) & 255) * w00 + ((k1 >> 16) & 255) * w10 + ((k2 >> 16) & 255) * w01 + ((k3 >> 16) & 255) * w11) << 16) | ((((k0 >> 8) & 255) * w00 + ((k1 >> 8) & 255) * w10 + ((k2 >> 8) & 255) * w01 + ((k3 >> 8) & 255) * w11) << 8) | ((k0 & 255) * w00 + (k1 & 255) * w10 + (k2 & 255) * w01 + (k3 & 255) * w11);
              }
            }
          }
        }
        const y = HOR - (h - cz) / t * FOCAL;
        if (y < ymin) {
          const yi = y < 0 ? 0 : (y | 0);
          let r = col & 255, g = (col >> 8) & 255, b = (col >> 16) & 255;
          if ((flag & 15) === 3) {   // air: riak + pantulan langit
            const wv = Math.sin(px * .32 + TIME * 1.6) * Math.sin(py * .27 - TIME * 1.15), m = Math.min(.75, .12 + t / 700);
            r = r * (1 + wv * .12) + (fr - r) * m * .5; g = g * (1 + wv * .12) + (fgg - g) * m * .5; b = b * (1 + wv * .12) + (fb - b) * m * .5;
          } else if (t < 38) { const dn = ((((px * 1.6) | 0) * 73856093 ^ ((py * 1.6) | 0) * 19349663) & 15) - 7.5, a = dn * (1 - t / 38) * .8; r += a; g += a; b += a * .8; }
          r *= tr; g *= tg; b *= tb;
          if (nv) { const l = (r * .3 + g * .59 + b * .11) * 2.8 + 14; r = l * .25; g = l; b = l * .32; }
          const k = FOGK[(t * 2) | 0];
          r += (fr - r) * k; g += (fgg - g) * k; b += (fb - b) * k;
          const c = (255 << 24) | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
          if ((flag & 32) && t < 420) {   // dinding bangunan: jendela per lantai (menyala di malam hari)
            const night = tod.sun[1] < 0;
            let wr = (night ? 255 : 52) * (night ? 1 : tr), wg = (night ? 206 : 66) * (night ? 1 : tg), wb = (night ? 120 : 84) * (night ? 1 : tb);
            if (nv) { const l = (wr * .3 + wg * .59 + wb * .11) * 2.8 + 14; wr = l * .25; wg = l; wb = l * .32; }
            wr += (fr - wr) * k; wg += (fgg - wg) * k; wb += (fb - wb) * k;
            const wc = (255 << 24) | ((wb > 255 ? 255 : wb) << 16) | ((wg > 255 ? 255 : wg) << 8) | (wr > 255 ? 255 : wr), cs = (px + py) * .5, ci = Math.floor(cs), inCol = cs - ci < .5, k1 = t / FOCAL;
            for (let yy = yi; yy < ymin; yy++) {
              const rel = h - (cz + (HOR - yy - .5) * k1), fl = rel / 3.4, fi = Math.floor(fl), fq = fl - fi;
              let col2 = c;
              if (inCol && fq > .3 && fq < .78 && rel > 1.2 && (!night || ((((ci * 73856093) ^ (fi * 19349663)) >>> 0) % 100) < 38)) col2 = wc;
              buf[base + yy] = col2; zb[base + yy] = t;
            }
          } else for (let yy = yi; yy < ymin; yy++) { buf[base + yy] = c; zb[base + yy] = t; }
          ymin = yi;
        }
        t += .1 + t * .0105;
      }
      for (let yy = 0; yy < ymin; yy++) buf[base + yy] = skyRow[yy];
      skyBot[x] = ymin;
    }
  }

  /* ---------------- RASTER POLIGON ---------------- */
  const VX = new Float64Array(24), VY = new Float64Array(24), PX = new Float64Array(24), PY = new Float64Array(24), PZ = new Float64Array(24);
  function fill(n, z, col, mode, tol) {
    let minX = 1e9, maxX = -1e9;
    for (let i = 0; i < n; i++) { if (VX[i] < minX) minX = VX[i]; if (VX[i] > maxX) maxX = VX[i]; }
    const x0 = Math.max(0, Math.ceil(minX - .5)), x1 = Math.min(RW - 1, Math.floor(maxX - .5));
    for (let x = x0; x <= x1; x++) {
      const xc = x + .5; let lo = 1e9, hi = -1e9;
      for (let i = 0; i < n; i++) {
        const j = i + 1 === n ? 0 : i + 1, ax = VX[i], bx = VX[j];
        if ((ax <= xc && bx > xc) || (bx <= xc && ax > xc)) { const yy = VY[i] + (VY[j] - VY[i]) * (xc - ax) / (bx - ax); if (yy < lo) lo = yy; if (yy > hi) hi = yy; }
      }
      if (hi < lo) continue;
      const ya = Math.max(0, Math.ceil(lo - .5)), yb = Math.min(RH - 1, Math.floor(hi - .5)), base = x * RH;
      if (mode === 1) { for (let y = ya; y <= yb; y++) { const i = base + y, d = zb[i]; if (d < 1e8 && Math.abs(d - z) < tol) { const c = buf[i]; buf[i] = (255 << 24) | ((((c >> 16) & 255) * .62) << 16) | ((((c >> 8) & 255) * .62) << 8) | ((c & 255) * .62); } } }
      else for (let y = ya; y <= yb; y++) { const i = base + y; if (zb[i] > z) { zb[i] = z; buf[i] = col; } }
    }
  }
  /* proyeksi poligon 3D (dengan pemotongan bidang dekat) lalu gambar */
  function poly3(pts, n, col, bias, mode, tol) {
    // pts: [x,y,z,...] dunia; ubah ke ruang kamera lalu potong di bidang dekat (Sutherland-Hodgman)
    let zsum = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - cam.x, dy = pts[i * 3 + 1] - cam.y;
      PX[i] = -dx * sinY + dy * cosY; PY[i] = pts[i * 3 + 2] - cam.z; PZ[i] = dx * cosY + dy * sinY; zsum += PZ[i];
    }
    let cn = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1, ain = PZ[i] >= NEAR, bin = PZ[j] >= NEAR;
      if (ain) { CXS[cn] = PX[i]; CYS[cn] = PY[i]; CZS[cn++] = PZ[i]; }
      if (ain !== bin) { const t = (NEAR - PZ[i]) / (PZ[j] - PZ[i]); CXS[cn] = PX[i] + (PX[j] - PX[i]) * t; CYS[cn] = PY[i] + (PY[j] - PY[i]) * t; CZS[cn++] = NEAR; }
    }
    if (cn < 3) return;
    for (let i = 0; i < cn; i++) { VX[i] = CX2 + CXS[i] / CZS[i] * FOCAL; VY[i] = HOR - CYS[i] / CZS[i] * FOCAL; }
    fill(cn, Math.max(NEAR, zsum / n - bias), col, mode, tol);
  }
  const CXS = new Float64Array(24), CYS = new Float64Array(24), CZS = new Float64Array(24), HH = new Float64Array(3);

  /* ---------------- KOTAK 3D ---------------- */
  const FACE = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]], TMP = new Float64Array(15), AXS = new Float64Array(9);
  function box(x, y, z, hx, hy, hz, yaw, pitch, col, bias) {
    const dx = x - cam.x, dy = y - cam.y, fw = dx * cosY + dy * sinY;
    if (fw < -Math.max(hx, hy, hz) * 2 - 2) return;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    AXS[0] = cp * cyw; AXS[1] = cp * syw; AXS[2] = sp;          // maju
    AXS[3] = -syw; AXS[4] = cyw; AXS[5] = 0;                    // kanan
    AXS[6] = -sp * cyw; AXS[7] = -sp * syw; AXS[8] = cp;        // atas
    const h = HH; h[0] = hx; h[1] = hy; h[2] = hz;
    for (let f = 0; f < 6; f++) {
      const ax = FACE[f][0], sg = FACE[f][1], nx = AXS[ax * 3] * sg, ny = AXS[ax * 3 + 1] * sg, nz = AXS[ax * 3 + 2] * sg;
      const cx0 = x + nx * h[ax], cy0 = y + ny * h[ax], cz0 = z + nz * h[ax];
      if (nx * (cam.x - cx0) + ny * (cam.y - cy0) + nz * (cam.z - cz0) <= 0) continue;
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, u1 = h[a1], u2 = h[a2];
      const ex = AXS[a1 * 3] * u1, ey = AXS[a1 * 3 + 1] * u1, ez = AXS[a1 * 3 + 2] * u1, gx = AXS[a2 * 3] * u2, gy = AXS[a2 * 3 + 1] * u2, gz = AXS[a2 * 3 + 2] * u2;
      TMP[0] = cx0 - ex - gx; TMP[1] = cy0 - ey - gy; TMP[2] = cz0 - ez - gz; TMP[3] = cx0 + ex - gx; TMP[4] = cy0 + ey - gy; TMP[5] = cz0 + ez - gz;
      TMP[6] = cx0 + ex + gx; TMP[7] = cy0 + ey + gy; TMP[8] = cz0 + ez + gz; TMP[9] = cx0 - ex + gx; TMP[10] = cy0 - ey + gy; TMP[11] = cz0 - ez + gz;
      const dif = Math.max(0, nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2]), shade = .42 + .62 * dif + (nz > 0 ? .14 * nz : 0) - (nz < 0 ? .12 : 0);
      const fwc = (cx0 - cam.x) * cosY + (cy0 - cam.y) * sinY;
      poly3(TMP, 4, lit(col, shade, Math.max(1, fwc)), bias === undefined ? .6 : bias, 0, 0);
    }
  }
  function shadow(x, y, rx, ry, yaw) {
    const gz = F.hAt(x, y) + .05, c = Math.cos(yaw), s = Math.sin(yaw), pts = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, lx = Math.cos(a) * rx, ly = Math.sin(a) * ry; pts.push(x + lx * c - ly * s, y + lx * s + ly * c, gz); }
    const fw = (x - cam.x) * cosY + (y - cam.y) * sinY; if (fw < 1 || fw > FAR * .6) return;
    poly3(pts, 10, 0, 0, 1, 2.5 + fw * .02);
  }

  /* ---------------- MODEL UNIT ---------------- */
  const BLU = { uni: [66, 86, 54], vest: [52, 66, 44], helm: [56, 72, 46], band: [60, 205, 255], skin: [196, 160, 128], gun: [34, 36, 36], veh: [92, 108, 72], dark: [44, 52, 40], rot: [60, 66, 58] };
  const BLU_US = { uni: [112, 104, 78], vest: [92, 84, 62], helm: [100, 94, 68], band: [60, 205, 255], skin: [196, 160, 128], gun: [34, 36, 36], veh: [128, 118, 88], dark: [84, 78, 58], rot: [60, 66, 58] };
  const RED = { uni: [108, 78, 64], vest: [70, 54, 48], helm: [58, 54, 52], band: [240, 60, 60], skin: [186, 150, 120], gun: [30, 30, 32], veh: [120, 104, 86], dark: [66, 56, 48], rot: [74, 70, 68] };
  const part = (o, lx, ly, lz, hx, hy, hz, col, dp, dy, bias) => {
    const wx = o.x + o.cy * lx - o.sy * ly, wy = o.y + o.sy * lx + o.cy * ly;
    box(wx, wy, o.z + lz, hx * o.s, hy * o.s, hz * o.s, o.yaw + (dy || 0), dp || 0, col, bias);
  };
  const motion = new Map();
  function human(u, o, pal, dead) {
    const T = u.type, c = pal;
    if (dead) {
      const a = [c.uni[0] * .7, c.uni[1] * .7, c.uni[2] * .7], v = [c.vest[0] * .7, c.vest[1] * .7, c.vest[2] * .7];
      part(o, -.75, .13, .14, .5, .1, .1, a, 0, 0); part(o, -.75, -.13, .14, .5, .1, .1, a, 0, .12);
      part(o, .15, 0, .17, .35, .26, .15, v, 0, 0); part(o, .62, 0, .16, .12, .1, .11, c.skin, 0, 0); part(o, .62, 0, .25, .14, .13, .06, c.helm, 0, 0);
      part(o, .3, .32, .1, .3, .06, .06, a, 0, -.3); part(o, .1, -.4, .06, .4, .02, .04, c.gun, 0, .4); return;
    }
    const sw = o.mv ? Math.sin(o.ph) * .75 : 0, hipZ = .92;
    const leg = (side, a) => { const ca = Math.cos(a), sa = Math.sin(a); part(o, sa * .46, side * .12, hipZ - ca * .46, .09, .09, .46, c.uni, a, 0); };
    leg(1, sw); leg(-1, -sw);
    const bodyCol = T === 'SF' ? [40, 44, 40] : c.uni, vestCol = T === 'SF' ? [30, 32, 30] : c.vest;
    part(o, 0, 0, 1.22, .17, .27, .3, bodyCol, 0, 0);
    part(o, .01, 0, 1.3, .18, .28, .2, vestCol, 0, 0);
    part(o, 0, 0, 1.4, .175, .285, .035, c.band, 0, 0);
    part(o, 0, 0, 1.68, .11, .1, .12, T === 'SF' ? [28, 28, 28] : c.skin, 0, 0);
    part(o, 0, 0, 1.78, .145, .13, .07, T === 'SF' ? [24, 26, 24] : c.helm, 0, 0);
    part(o, -.2, 0, 1.25, .1, .2, .22, T === 'MEDIC' ? [235, 235, 235] : [c.vest[0] * .85, c.vest[1] * .85, c.vest[2] * .85], 0, 0);
    if (T === 'MEDIC') { part(o, -.31, 0, 1.25, .015, .13, .04, [220, 30, 30], 0, 0); part(o, -.31, 0, 1.25, .015, .04, .13, [220, 30, 30], 0, 0); }
    // lengan & senjata
    const aim = o.aim ? 1 : 0;
    part(o, .3, .22, 1.2 + aim * .08, .24, .055, .055, bodyCol, aim ? .05 : -.5, -.35); part(o, .38, -.18, 1.2 + aim * .08, .26, .055, .055, bodyCol, aim ? .05 : -.5, .3);
    if (T === 'AT') part(o, -.05, -.26, 1.58, .62, .07, .07, [84, 90, 60], 0, 0);
    else if (T === 'MORT') part(o, -.1, .3, 1.5, .08, .08, .6, [70, 72, 70], .2, 0);
    else if (T !== 'MEDIC') part(o, .42, .06, 1.2 + aim * .08, .46, .035, .05, c.gun, aim ? .03 : -.3, 0);
  }
  function tank(u, o, c, burnt) {
    const T = u.type, s = T === 'LTANK' ? .85 : 1, g = burnt ? [26, 26, 26] : c.veh, d = burnt ? [18, 18, 18] : c.dark;
    part(o, 0, 0, 1.05, 3.4 * s, 1.5 * s, .55, g, 0, 0, 2); part(o, 0, 1.55 * s, .6, 3.5 * s, .42, .55, d, 0, 0, 2); part(o, 0, -1.55 * s, .6, 3.5 * s, .42, .55, d, 0, 0, 2);
    part(o, 3.1 * s, 0, 1.15, .9, 1.3 * s, .2, g, -.4, 0, 2);
    const ty = u.face - o.yaw, tx = -.2 * s;
    const tw = (lx, ly, lz, hx, hy, hz, cc, dp) => { const cy = Math.cos(ty), sy = Math.sin(ty); part(o, tx + lx * cy - ly * sy, lx * sy + ly * cy, lz, hx, hy, hz, cc, dp, ty, 2); };
    tw(0, 0, 1.95, 1.6 * s, 1.35 * s, .5, g, 0); tw(1.7 * s, 0, 1.95, 1.3 * s, .8 * s, .38, g, 0); tw(2.9 * s + 1.2, 0, 2.0, 2.2 * s + .6, .12, .12, burnt ? d : [54, 56, 52], 0);
    tw(-.4, .5, 2.5, .3, .3, .12, burnt ? d : c.band, 0);
  }
  function ifv(u, o, c, burnt) {
    const g = burnt ? [26, 26, 26] : c.veh, d = burnt ? [18, 18, 18] : c.dark;
    part(o, 0, 0, 1.15, 3.1, 1.4, .8, g, 0, 0, 2); part(o, 2.7, 0, 1.0, .8, 1.3, .5, g, -.3, 0, 2);
    part(o, 0, 1.4, .55, 3.0, .12, .5, d, 0, 0, 2); part(o, 0, -1.4, .55, 3.0, .12, .5, d, 0, 0, 2);
    const ty = u.face - o.yaw, cy = Math.cos(ty), sy = Math.sin(ty);
    part(o, -.3 * cy, -.3 * sy, 2.25, .8, .75, .35, g, 0, ty, 2); part(o, 1.2 * cy - .3, 1.2 * sy, 2.3, 1.1, .07, .07, burnt ? d : [54, 56, 52], 0, ty, 2); part(o, -.3, 0, 2.7, .25, .25, .08, burnt ? d : c.band, 0, 0, 2);
  }
  function truck(u, o, c, burnt, len) {
    const g = burnt ? [26, 26, 26] : c.veh, d = burnt ? [18, 18, 18] : c.dark;
    part(o, 0, 0, .95, len, 1.3, .55, g, 0, 0, 2); part(o, len - .9, 0, 1.9, .9, 1.25, .75, g, 0, 0, 2); part(o, len - .5, 0, 2.1, .05, 1.1, .4, [60, 80, 90], 0, 0, 2);
    for (let i = -1; i <= 1; i++) { part(o, i * (len * .6), 1.35, .5, .55, .18, .5, d, 0, 0, 2); part(o, i * (len * .6), -1.35, .5, .55, .18, .5, d, 0, 0, 2); }
  }
  function vehicle(u, o, c, burnt) {
    const T = u.type;
    if (T === 'TANK' || T === 'LTANK') tank(u, o, c, burnt);
    else if (T === 'ULTIMA' || T === 'LEVI' || T === 'ZEUS') tank(u, o, c, burnt);   // renderer cadangan: bentuk tank biasa
    else if (T === 'TITAN') truck(u, o, c, burnt, 5);
    else if (T === 'JEEP') truck(u, o, c, burnt, 2);
    else if (T === 'IFV') ifv(u, o, c, burnt);
    else if (T === 'ZSU') { tank(u, o, c, burnt); }
    else if (T === 'ARTY') { const g = burnt ? [26, 26, 26] : c.veh; tank(Object.assign({}, u, { type: 'LTANK' }), o, c, burnt); part(o, -.2, 0, 2.5, .9, 1.3, .55, g, 0, 0, 2); part(o, 3.3, 0, 3.4, 3.2, .13, .13, burnt ? [18, 18, 18] : [54, 56, 52], .42, 0, 2); }
    else if (T === 'MLRS') { truck(u, o, c, burnt, 3.8); part(o, -.6, 0, 2.7, 2, 1.15, .6, burnt ? [18, 18, 18] : c.dark, .3, 0, 2); part(o, -.6, 0, 3.5, 1.9, .7, .35, burnt ? [18, 18, 18] : c.band, .3, 0, 2); }
    else if (T === 'AA') { truck(u, o, c, burnt, 3.6); for (let k = -1; k <= 1; k += 2) part(o, -.9, k * .6, 3.0, 1.5, .25, .25, burnt ? [18, 18, 18] : [54, 56, 52], .7, 0, 2); part(o, -.9, 0, 2.2, .8, 1.1, .5, burnt ? [18, 18, 18] : c.dark, 0, 0, 2); }
    else if (T === 'REPAIR') {
      truck(u, o, c, burnt, 3.7); part(o, -1.2, 0, 2.2, 1.6, 1.3, .7, burnt ? [26, 26, 26] : [236, 236, 230], 0, 0, 2); part(o, -3, 0, 3.1, 1.6, .15, .15, burnt ? [18, 18, 18] : c.dark, .6, 0, 2);
      if (!burnt) for (const sd of [1.34, -1.34]) { part(o, -1.2, sd, 2.2, .05, .02, .02, [0, 0, 0], 0, 0, 2); part(o, -1.2, sd * 1.01, 2.2, .7, .02, .15, [220, 30, 30], 0, 0, 2); part(o, -1.2, sd * 1.01, 2.2, .15, .02, .7, [220, 30, 30], 0, 0, 2); }
    }
  }
  function aircraft(u, o, c, alt) {
    const T = u.type, g = c === BLU ? [82, 98, 72] : [70, 72, 78], d = [34, 36, 36], z0 = alt;
    const O = Object.assign({}, o, { z: o.z + z0 }), p = (lx, ly, lz, hx, hy, hz, col, dp, dy) => part(O, lx, ly, lz, hx, hy, hz, col, dp, dy, 3);
    if (T === 'HELI' || T === 'ATK2' || T === 'MEDHELI' || T === 'AH64' || T === 'KRAKEN') {
      const med = T === 'MEDHELI', body = med ? [236, 236, 232] : T === 'AH64' ? [24, 25, 27] : g, big = T === 'ATK2' || T === 'AH64' ? 1.1 : 1;   // AH64 = Shadow Hunter hitam
      p(0, 0, 0, 3.2 * big, .85, 1.0, body, 0, 0); p(3.4 * big, 0, -.3, 1.2, .55, .6, body, -.3, 0); p(-4.6 * big, 0, .35, 3.2, .22, .28, body, 0, 0); p(-7.5 * big, 0, 1, .12, .08, 1.1, body, 0, 0);
      p(1.6 * big, 0, .55, 1.1, .6, .45, [50, 90, 110], 0, 0);
      const a = TIME * 34; p(0, 0, 1.45, .3, .3, .3, d, 0, 0); p(0, 0, 1.7, 6.8, .13, .04, [40, 40, 40], 0, a); p(0, 0, 1.7, 6.8, .13, .04, [40, 40, 40], 0, a + 1.571); p(-7.5 * big, .2, 1.4, .06, .9, .06, [40, 40, 40], 0, TIME * 40);
      p(0, 1.4, -1.25, 2.4, .08, .06, d, 0, 0); p(0, -1.4, -1.25, 2.4, .08, .06, d, 0, 0);
      if (big > 1) { p(.2, 1.9, -.2, 1.3, .12, .1, body, 0, 0); p(.2, -1.9, -.2, 1.3, .12, .1, body, 0, 0); p(.4, 2.5, -.3, 1.0, .25, .25, d, 0, 0); p(.4, -2.5, -.3, 1.0, .25, .25, d, 0, 0); }
      if (med) { p(0, .86, 0, .8, .02, .5, [220, 30, 30], 0, 0); p(0, -.86, 0, .8, .02, .5, [220, 30, 30], 0, 0); }
    } else if (T === 'NEMESIS') { const k = [28, 28, 32]; p(0, 0, 0, 7, 3, 1.2, k, 0, 0); p(-1, 13, -.1, 4, 12, .3, k, 0, .5); p(-1, -13, -.1, 4, 12, .3, k, 0, -.5);
    } else if (T === 'UAV' || T === 'UCAV') {
      const k = T === 'UCAV' ? 1.4 : 1; p(0, 0, 0, 2.2 * k, .22 * k, .22 * k, g, 0, 0); p(-.3, 0, 0, .7 * k, 3 * k, .05, g, 0, 0); p(-1.9 * k, 0, .35, .4, .05, .45, g, 0, 0); p(-1.9 * k, 0, 0, .5, 1.2 * k, .04, g, 0, 0);
      if (T === 'UCAV') { p(0, .9, -.3, .5, .1, .1, d, 0, 0); p(0, -.9, -.3, .5, .1, .1, d, 0, 0); }
    } else if (T === 'FGT') {
      p(0, 0, 0, 8, .8, .7, g, 0, 0); p(7.4, 0, -.1, 3, .4, .35, g, 0, 0); p(-1.2, 0, 0, 3.1, 5, .09, g, 0, 0); p(-6.8, 0, 1.1, 1.3, .08, 1.3, g, 0, 0); p(-6.8, 0, 1.1, 1.1, .08, 1.3, g, 0, .0); p(-6.5, 0, 0, 1.4, 2.6, .08, g, 0, 0); p(-9, 0, 0, 1.3, .6, .5, [255, 150, 60], 0, 0);
    } else if (T === 'CAS') {
      p(0, 0, 0, 7, .9, .9, g, 0, 0); p(-.5, 0, .1, 1.7, 8.8, .12, g, 0, 0); p(-6.4, 0, .5, 1.1, 3.6, .1, g, 0, 0); p(-6.6, 3, 1.2, .9, .08, 1.5, g, 0, 0); p(-6.6, -3, 1.2, .9, .08, 1.5, g, 0, 0);
      p(-4, 1.7, 1.4, 1.9, .7, .65, d, 0, 0); p(-4, -1.7, 1.4, 1.9, .7, .65, d, 0, 0); p(6, 0, -.2, 1.4, .3, .3, d, 0, 0);
    } else if (T === 'BLIMP') {
      p(0, 0, 0, 16, 5.4, 5.4, [150, 150, 144], 0, 0); p(1, 0, -6.4, 4.6, 1.4, 1, d, 0, 0); p(-14, 0, 0, 2.2, 8, .15, [150, 34, 30], 0, 0); p(-14, 0, 0, 2.2, .15, 8, [150, 34, 30], 0, 0);
    } else if (T === 'GUNSHIP') {
      p(0, 0, 0, 14, 2.3, 2.3, g, 0, 0); p(.6, 0, 2.9, 2.1, 20, .2, g, 0, 0); p(-13.4, 0, 5, 1.9, .14, 3.2, g, 0, 0); p(-14.2, 0, 2.6, 1.6, 7, .14, g, 0, 0);
      for (const y of [-10.5, -5.4, 5.4, 10.5]) p(1.5, y, 2.4, 3, .6, .6, d, 0, 0);
    } else if (T === 'BMB') {
      p(0, 0, 0, 6, .9, .9, g, 0, 0); p(-1.5, 0, 0, 3.4, 14, .25, g, 0, 0); p(-5.5, 0, 0, 1.3, 4.5, .15, g, 0, 0); p(-6.4, 0, 1.3, 1.4, .1, 1.8, g, 0, 0); p(5.8, 0, .3, 1.5, .5, .5, [60, 90, 100], 0, 0);
      for (let k = -1; k <= 1; k += 2) { p(-1, k * 3.2, -.7, 1.8, .6, .6, d, 0, 0); p(-1, k * 7, -.7, 1.8, .6, .6, d, 0, 0); }
    }
  }
  function ship(u, o, c) {
    const T = u.type, s = T === 'SHIP' ? 2.2 : 1, g = c === BLU ? [140, 148, 150] : [110, 112, 116], d = [60, 66, 70];
    const O = Object.assign({}, o, { z: 0 }), p = (lx, ly, lz, hx, hy, hz, col, dp) => part(O, lx, ly, lz, hx * s, hy * s, hz * s, col, dp, 0, 4);
    p(0, 0, .8, 8, 1.5, .9, g, 0); p(8, 0, .8, 2.4, 1.1, .9, g, 0); p(-1, 0, 2.4, 3.2, 1.1, .8, g, 0); p(-1, 0, 3.6, 1.6, .7, .5, d, 0); p(-.5, 0, 5.2, .1, .1, 1.2, d, 0); p(5, 0, 1.9, 1, .3, .3, d, 0);
    part(O, -1 * s, 1.7 * s, 4.3 * s, 0.05, 0.05, 0.05, c.band, 0, 0, 4);
  }
  function structure(u, o, c) {
    const T = u.type, base = c === BLU ? [138, 146, 150] : [118, 100, 92], roof = c === BLU ? [90, 100, 106] : [84, 66, 60];
    if (T === 'HQ') {
      part(o, 0, 0, 3.6, 8, 6, 3.6, base, 0, 0, 5); part(o, 0, 0, 7.4, 8.4, 6.4, .35, roof, 0, 0, 5); part(o, -3, 0, 12, .18, .18, 5, [60, 60, 62], 0, 0, 5);
      part(o, 1.5, 0, 9.5, .08, 1.6, 1, c.band, 0, 0, 5); part(o, 6, 0, 10, .12, .12, 6, [170, 170, 170], 0, 0, 5); part(o, 6, 1.6, 13, .05, 1.6, 1.0, c.band, 0, 0, 5);
      for (const [x, y, hx, hy] of [[11, 0, .6, 9], [-11, 0, .6, 9], [0, 10, 11, .6], [0, -10, 11, .6]]) part(o, x, y, .55, hx, hy, .55, [160, 142, 104], 0, 0, 5);
    } else if (T === 'BNK') {
      part(o, 0, 0, .9, 4, 3.2, .9, [152, 136, 100], 0, 0, 4); part(o, 0, 0, 2, 3.5, 2.7, .3, [92, 82, 66], 0, 0, 4);
      const f = c === BLU ? 1 : -1; part(o, 4.02 * f, 0, 1.3, .05, 2.2, .24, [20, 20, 20], 0, 0, 4); part(o, 0, 3.22, 1.0, 3, .05, .22, [20, 20, 20], 0, 0, 4);
      part(o, 0, 0, 2.7, .08, .08, 1.2, [90, 90, 90], 0, 0, 4); part(o, 0, .6, 3.5, .05, .6, .45, c.band, 0, 0, 4);
    } else if (T === 'SAM') {
      part(o, 0, 0, .6, 3, 2.2, .6, [86, 90, 72], 0, 0, 4); for (let k = -1; k <= 1; k++) part(o, -.2, k * 1.1, 2.4, 2.4, .35, .35, [160, 160, 150], .85, 0, 4); part(o, 0, 0, 1.9, .8, 1.8, .7, [70, 74, 60], 0, 0, 4);
    }
  }

  function drawUnitModel(u, isCorpse, dt) {
    const T = UT[u.type], c = u.team === 'B' ? (TK.S.doc === 'us' ? BLU_US : BLU) : RED;
    const ux = u.x, uy = u.y, gz = F.hAt(ux, uy);
    const fw = (ux - cam.x) * cosY + (uy - cam.y) * sinY; if (fw < -8 || fw > Math.min(FAR, 1500)) return;
    if (Math.abs(-(ux - cam.x) * sinY + (uy - cam.y) * cosY) > fw * TAN * 1.35 + 24) return;
    let yaw = isCorpse ? u.face : (u.type === 'HQ' || u.type === 'BNK' || u.type === 'SAM') ? 0 : (u.jet || u.fly || T.tc === 'G') ? u.hdg : u.hdg;
    const o = { x: ux, y: uy, z: gz, yaw, cy: Math.cos(yaw), sy: Math.sin(yaw), s: 1, mv: false, ph: 0, aim: false };
    const alt = F.altOf(u); FLASH = !isCorpse && u.hitT > Q.t - .11 ? 1 : 0;
    if (F.isHuman(u.type)) {
      if (isCorpse) { human(u, o, c, true); }
      else {
        let m = motion.get(u.id); if (!m) { m = { x: ux, y: uy, ph: Math.random() * 6 }; motion.set(u.id, m); }
        const mvd = Math.hypot(ux - m.x, uy - m.y); m.x = ux; m.y = uy; m.sp = (m.sp || 0) * .8 + mvd / Math.max(dt, .001) * .2; m.ph += mvd * 1.3;
        o.mv = m.sp > 1.2; o.ph = m.ph; o.aim = (u.revealT || 0) > Q.t - .5 || o.mv === false && u.stance === 'HOLD';
        o.yaw = (u.revealT || -9) > Q.t - 1.8 ? u.face : (o.mv ? u.hdg : u.face); o.cy = Math.cos(o.yaw); o.sy = Math.sin(o.yaw);
        if (fw < 160) shadow(ux, uy, .5, .35, o.yaw);
        human(u, o, c, false);
      }
    } else if (u.struct) { shadow(ux, uy, 6, 5, 0); structure(u, o, c); }
    else if (T.dom === 'S') ship(u, o, c);
    else if (u.fly || u.jet) { if (!isCorpse) aircraft(u, o, c, alt); }
    else { if (!isCorpse && fw < 400) shadow(ux, uy, 3.6 * T.sz, 2.1 * T.sz, o.yaw); vehicle(u, o, c, isCorpse); }
    FLASH = 0;
  }

  /* ---------------- POHON ---------------- */
  function trees() {
    const w = F.world, tr = w.trees, R2 = Math.min(280, tod.dist * .6), cx = Math.floor(cam.x / W.CELL), cy = Math.floor(cam.y / W.CELL), rc = Math.ceil(R2 / W.CELL);
    const lim = TAN * 1.3;
    for (let gy = cy - rc; gy <= cy + rc; gy++) for (let gx = cx - rc; gx <= cx + rc; gx++) {
      const a = w.tc.get(gy * W.GW + gx); if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const k = a[q] * 6, x = tr[k], y = tr[k + 1], dx = x - cam.x, dy = y - cam.y, fw = dx * cosY + dy * sinY;
        if (fw < 1 || fw > R2) continue; const rg = -dx * sinY + dy * cosY; if (Math.abs(rg) > fw * lim + 8) continue;
        const z = tr[k + 2], h = tr[k + 3], rad = tr[k + 5], near = fw < 75;
        let kind = tr[k + 4];
        if (kind === 9) { if (fw > 160) continue; box(x, y, z + Math.min(h, 2) * .5, rad * .9, rad * .55, Math.min(h, 2) * .5, k, 0, [96 + (k % 5) * 20, 90 + (k % 3) * 18, 84], 1); continue; }   // properti kota
        if (kind === 5) { if (fw > 220) continue; box(x, y, z + h * .5, .3, .3, h * .5, 0, 0, [58, 96, 52], 1); box(x + .55, y, z + h * .62, .2, .2, h * .2, 0, 0, [58, 96, 52], 1); continue; }   // kaktus
        if (kind === 8) kind = 2; else if (kind === 4 || kind === 6 || kind === 7) kind = 1;
        if (kind >= 2) {   // semak & batu hanya digambar dekat
          if (fw > 120) continue;
          if (kind === 2) { const sh = 1 + (k % 7) * .05; box(x, y, z + h * .45, rad * .8, rad * .8, h * .45, k, 0, [46 * sh, 84 * sh, 40 * sh], 1); if (fw < 50) box(x + rad * .5, y - rad * .3, z + h * .35, rad * .5, rad * .5, h * .35, k * 2, 0, [58 * sh, 98 * sh, 46 * sh], 1); }
          else box(x, y, z + h * .4, rad * 1.1, rad * .9, h * .5, k, 0, [112 + (k % 5) * 4, 108 + (k % 5) * 4, 100 + (k % 5) * 4], 1);
          continue;
        }
        const gc = [28 + (k * 7 % 13), 62 + (k * 11 % 17), 30 + (k * 3 % 9)], bark = [74, 56, 40];
        if (kind === 0) {
          if (near) { box(x, y, z + h * .18, .22, .22, h * .18, 0, 0, bark, 1); box(x, y, z + h * .36, rad * 1.5, rad * 1.5, h * .1, 0, 0, gc, 1.2); box(x, y, z + h * .56, rad * 1.1, rad * 1.1, h * .1, .3, 0, gc, 1.2); box(x, y, z + h * .76, rad * .7, rad * .7, h * .13, .6, 0, gc, 1.2); }
          else box(x, y, z + h * .5, rad * 1.25, rad * 1.25, h * .5, 0, 0, gc, 1.2);
        } else {
          if (near) { box(x, y, z + h * .22, .3, .3, h * .22, 0, 0, bark, 1); box(x, y, z + h * .66, rad * 2, rad * 2, h * .26, .4, 0, [gc[0] + 14, gc[1] + 16, gc[2]], 1.4); box(x + .6, y - .4, z + h * .9, rad * 1.2, rad * 1.2, h * .12, 1, 0, [gc[0] + 14, gc[1] + 16, gc[2]], 1.4); }
          else box(x, y, z + h * .65, rad * 2, rad * 2, h * .34, 0, 0, [gc[0] + 10, gc[1] + 14, gc[2]], 1.4);
        }
      }
    }
  }

  /* ---------------- GARIS (jejak peluru) & BLOB (partikel) ---------------- */
  function seg(x0, y0, z0, x1, y1, z1, col, bias) {
    let ax = -(x0 - cam.x) * sinY + (y0 - cam.y) * cosY, ay = z0 - cam.z, az = (x0 - cam.x) * cosY + (y0 - cam.y) * sinY;
    let bx = -(x1 - cam.x) * sinY + (y1 - cam.y) * cosY, by = z1 - cam.z, bz = (x1 - cam.x) * cosY + (y1 - cam.y) * sinY;
    if (az < NEAR && bz < NEAR) return;
    if (az < NEAR) { const t = (NEAR - az) / (bz - az); ax += (bx - ax) * t; ay += (by - ay) * t; az = NEAR; }
    if (bz < NEAR) { const t = (NEAR - bz) / (az - bz); bx += (ax - bx) * t; by += (ay - by) * t; bz = NEAR; }
    const sx0 = CX2 + ax / az * FOCAL, sy0 = HOR - ay / az * FOCAL, sx1 = CX2 + bx / bz * FOCAL, sy1 = HOR - by / bz * FOCAL;
    const n = Math.min(400, Math.ceil(Math.max(Math.abs(sx1 - sx0), Math.abs(sy1 - sy0)))) || 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = Math.round(sx0 + (sx1 - sx0) * t), y = Math.round(sy0 + (sy1 - sy0) * t); if (x < 0 || y < 0 || x >= RW || y >= RH) continue;
      const z = az + (bz - az) * t - (bias || 1), idx = x * RH + y; if (zb[idx] > z) { buf[idx] = col; }
    }
  }
  function blob(x, y, z, size, col, alpha, glow) {
    const dx = x - cam.x, dy = y - cam.y, fw = dx * cosY + dy * sinY; if (fw < NEAR) return;
    const sx = CX2 + (-dx * sinY + dy * cosY) / fw * FOCAL, sy = HOR - (z - cam.z) / fw * FOCAL, r = Math.min(RW * .6, size / fw * FOCAL);
    if (r < .6 || sx < -r || sx > RW + r || sy < -r || sy > RH + r) return;
    const x0 = Math.max(0, Math.floor(sx - r)), x1 = Math.min(RW - 1, Math.ceil(sx + r)), y0 = Math.max(0, Math.floor(sy - r)), y1 = Math.min(RH - 1, Math.ceil(sy + r)), r2 = r * r;
    const fade = clamp((fw - size * .25) / (size * .9 + 1), .04, 1);   // memudar saat kamera masuk ke dalam gumpalan
    let cr = col[0] * TINT[0], cg = col[1] * TINT[1], cb = col[2] * TINT[2]; if (glow) { cr = col[0]; cg = col[1]; cb = col[2]; }
    if (R.nvg) { const l = (cr * .3 + cg * .59 + cb * .11) * 2.6 + 10; cr = l * .25; cg = l; cb = l * .32; }
    const k = fogK(fw); cr += (FOG[0] - cr) * k * .7; cg += (FOG[1] - cg) * k * .7; cb += (FOG[2] - cb) * k * .7;
    for (let xx = x0; xx <= x1; xx++) for (let yy = y0; yy <= y1; yy++) {
      const ddx = xx + .5 - sx, ddy = yy + .5 - sy, q = (ddx * ddx + ddy * ddy) / r2; if (q > 1) continue;
      const i = xx * RH + yy; if (zb[i] < fw - 1) continue;
      const a = alpha * fade * (glow ? (1 - q) * (1 - q * .5) : (1 - q) * (1 - q) * .9 + .1 * (1 - q)), c0 = buf[i];
      const r0 = c0 & 255, g0 = (c0 >> 8) & 255, b0 = (c0 >> 16) & 255;
      buf[i] = glow ? pk(r0 + cr * a, g0 + cg * a, b0 + cb * a) : pk(r0 + (cr - r0) * a, g0 + (cg - g0) * a, b0 + (cb - b0) * a);
    }
  }

  /* ---------------- OBJEK DUNIA ---------------- */
  function objectives() {
    for (const o of Q.objs) {
      const gz = F.hAt(o.x, o.y), col = o.owner === 'B' ? [70, 210, 255] : o.owner === 'R' ? [255, 70, 70] : [235, 225, 130], fw = (o.x - cam.x) * cosY + (o.y - cam.y) * sinY;
      if (fw < 1) continue;
      const O = { x: o.x, y: o.y, z: gz, yaw: 0, cy: 1, sy: 0, s: 1 };
      part(O, 0, 0, 5, .1, .1, 5, [180, 180, 180], 0, 0, 3); part(O, 0, 1.3, 8.6, .04, 1.3, .9, col, 0, 0, 3);
      for (let a = 0; a < 6.28; a += 1.047) part(O, Math.cos(a) * 24, Math.sin(a) * 24, .5, .6, .6, .5, [150, 134, 100], 0, a, 3);   // karung pasir penanda zona
      box(o.x, o.y, gz + 45, .22, .22, 45, 0, 0, col, 3);   // pilar penanda
      blob(o.x, o.y, gz + 12, 7 + fw * .004, col, .22, true);
    }
  }
  function projectiles() {
    for (const p of Q.projs) {
      if (p.t < 0) continue;
      const s = p.src, sz = s ? F.zOf(s) + (F.isHuman(s.type) ? 1.4 : 2) : 2, tz = p.tgt ? F.zOf(p.tgt) + (F.isHuman(p.tgt.type) ? 1.2 : 1.5) : F.hAt(p.tx, p.ty) + 1;
      if (p.kind === 'bullet') {
        const k = clamp(p.t / p.dur, 0, 1), L = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1, ux = (p.tx - p.sx) / L, uy = (p.ty - p.sy) / L, z = sz + (tz - sz) * k, back = Math.min(18, L * k);
        const col = p.big ? pk(255, 190, 90) : p.team === 'B' ? pk(180, 240, 255) : pk(255, 150, 90);
        seg(p.x - ux * back, p.y - uy * back, z - (tz - sz) * back / L, p.x, p.y, z, col, 6);
      } else if (p.kind === 'shell') { const z = F.hAt(p.x, p.y) + 20 + (p.h || 0) * 170; blob(p.x, p.y, z, .7, [60, 56, 50], .9); }
      else if (p.kind === 'bomb') { const k = clamp(p.t / p.dur, 0, 1), z = F.hAt(p.x, p.y) + 150 * (1 - k * k); box(p.x, p.y, z, .5, .2, .2, Math.atan2(p.ty - p.y, p.tx - p.x), -.5 * k, [70, 70, 66], 1); }
      else if (p.kind === 'missile') {
        const L = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1, k = clamp(Math.hypot(p.x - p.sx, p.y - p.sy) / L, 0, 1), z = sz + (tz - sz) * k;
        for (let i = 0; i < p.trail.length - 1; i++) { const a = p.trail[i], b = p.trail[i + 1], ka = clamp(Math.hypot(a[0] - p.sx, a[1] - p.sy) / L, 0, 1), kb = clamp(Math.hypot(b[0] - p.sx, b[1] - p.sy) / L, 0, 1); seg(a[0], a[1], sz + (tz - sz) * ka, b[0], b[1], sz + (tz - sz) * kb, pk(214, 214, 210), 4); }
        blob(p.x, p.y, z, 1.1, [255, 190, 90], .95, true);
      }
    }
    for (const t of F.tracers) { const a = 1 - t.t / t.life; seg(t.x0, t.y0, t.z0, t.x0 + (t.x1 - t.x0) * Math.min(1, t.t / t.life * 2.2 + .15), t.y0 + (t.y1 - t.y0) * Math.min(1, t.t / t.life * 2.2 + .15), t.z0 + (t.z1 - t.z0) * Math.min(1, t.t / t.life * 2.2 + .15), pk(255, 236 * a + 20, 150 * a), 6); }
    for (const g of F.gren) box(g.x, g.y, g.z, .07, .07, .1, g.t * 9, 0, [58, 72, 48], .3);
    for (const r of F.rock) { box(r.x, r.y, r.z, .7, .08, .08, Math.atan2(r.vy, r.vx), Math.atan2(r.vz, Math.hypot(r.vx, r.vy)), [96, 100, 90], .4); blob(r.x - r.vx * .01, r.y - r.vy * .01, r.z, .6, [255, 180, 80], .9, true); }
  }
  function particles() {
    const list = F.fx3.filter(p => (p.x - cam.x) * cosY + (p.y - cam.y) * sinY > .5);
    list.sort((a, b) => ((b.x - cam.x) * cosY + (b.y - cam.y) * sinY) - ((a.x - cam.x) * cosY + (a.y - cam.y) * sinY));
    for (const p of list) {
      const k = p.t / p.life, s = p.s0 + (p.s1 - p.s0) * k;
      if (p.k === 'flash') blob(p.x, p.y, p.z, s, p.col, (1 - k) * .95, true);
      else if (p.k === 'fire') blob(p.x, p.y, p.z, s, p.col.map((v, i) => v * (1 - k * (i ? .6 : .2))), (1 - k * .8) * p.a, true);
      else if (p.k === 'spark' || p.k === 'casing' || p.k === 'debris') blob(p.x, p.y, p.z, Math.max(.05, s), p.col, 1, p.k === 'spark');
      else blob(p.x, p.y, p.z, s, p.col, p.a * (1 - k) * Math.min(1, k * 8 + .3));
    }
    for (const m of F.marks) { box(m.x, m.y, F.hAt(m.x, m.y) + 40, .25, .25, 40, 0, 0, m.cmd ? [60, 190, 255] : [255, 60, 60], 2); }
    if (P.laser) { const L = P.laser; box(L.x, L.y, F.hAt(L.x, L.y) + 300, 1.4, 1.4, 300, 0, 0, [255, 150, 80], 2); blob(L.x, L.y, F.hAt(L.x, L.y) + 1, 8, [255, 140, 60], .8, true); }
  }

  /* ---------------- RENDER UTAMA ---------------- */
  R.render = function (ctx, CW, CH, dpr, dt) {
    if (!R.ready || !F.world || !P.cam) return;
    if (F.GLW && F.GLW.render(ctx, CW, CH, dpr, dt)) { R.gl = true; return; }   // renderer WebGL2 (fps-gl.js) bila tersedia
    R.gl = false;
    setupCam(); buildSky(); zb.fill(1e9);
    terrain(); clouds(); sun();
    trees(); objectives();
    const list = Q.units.filter(u => !u.dead && u !== P.unit && u.chute <= 0);
    for (const u of list) drawUnitModel(u, false, dt);
    for (const c of F.corpses) { drawUnitModel({ x: c.x, y: c.y, type: c.type, team: c.team, face: c.face, hdg: c.face, id: 0 }, true, dt); }
    // pasukan terjun payung
    for (const u of Q.units) if (!u.dead && u.chute > 0 && u !== P.unit) { const z = F.hAt(u.x, u.y) + 3 + u.chute * 18; box(u.x, u.y, z, .14, .14, .5, u.hdg, 0, u.team === 'B' ? [66, 86, 54] : [108, 78, 64], .5); box(u.x, u.y, z + 3.2, 3.4, 3.4, .06, 0, 0, [225, 225, 215], .6); }
    projectiles(); particles();
    // gambar ke kanvas tampilan
    octx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.setTransform(0, CH / RH * dpr, CW / RW * dpr, 0, 0, 0); ctx.drawImage(off, 0, 0); ctx.restore();
  };
  /* pandangan termal dari atas (AC-130 Overwatch): peta warna medan diubah ke citra abu-abu "white-hot" */
  R.renderTop = function (ctx, CW, CH, dpr, g) {
    if (!R.ready || !F.world) return;
    const w = F.world, H = w.H, C = w.C, T = w.T, NX = F.NX, ti = 1 / F.TX, mpp = g.w2 / RW, x0 = g.cx - RW / 2 * mpp, y0 = g.cy - RH / 2 * mpp, WW = W.WW, WH = W.WH;
    for (let x = 0; x < RW; x++) {
      const wx = x0 + (x + .5) * mpp, base = x * RH, ix = (wx * ti) | 0;
      for (let y = 0; y < RH; y++) {
        const wy = y0 + (y + .5) * mpp;
        if (wx < 0 || wy < 0 || wx >= WW || wy >= WH) { buf[base + y] = 0xff000000; continue; }
        const i = ((wy * ti) | 0) * NX + ix, c = C[i], fl = T[i];
        let l = (c & 255) * .3 + ((c >> 8) & 255) * .59 + ((c >> 16) & 255) * .11;
        const hs = (H[ix > 0 ? i - 1 : i] - H[ix < NX - 1 ? i + 1 : i]) * 3.2;
        if (fl & 16) l = (fl & 32) ? l * .5 : l * 1.2 + 24; else if ((fl & 15) === 3) l *= .42;
        let v = (l * .92 + hs - 96) * 1.4 + 108 + (((x * 7 + y * 13) & 7) - 3); v = v < 0 ? 0 : v > 255 ? 255 : v;
        buf[base + y] = (255 << 24) | (((v * .84) | 0) << 16) | ((v | 0) << 8) | ((v * .8) | 0);
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.setTransform(0, CH / RH * dpr, CW / RW * dpr, 0, 0, 0); ctx.drawImage(off, 0, 0); ctx.restore();
  };
  /* proyeksi ke koordinat CSS layar untuk HUD; null bila di belakang kamera */
  R.project = function (x, y, z, CW, CH) {
    if (R.gl && F.GLW) return F.GLW.project(x, y, z, CW, CH);
    if (!cam) return null; const dx = x - cam.x, dy = y - cam.y, fw = dx * cosY + dy * sinY; if (fw < .5) return null;
    return { x: (CX2 + (-dx * sinY + dy * cosY) / fw * FOCAL) / RW * CW, y: (HOR - (z - cam.z) / fw * FOCAL) / RH * CH, f: fw };
  };
  R.camSnap = () => ({ cosY, sinY, FOCAL, HOR, RW, RH });
  R.motionClear = () => motion.clear();
})();
