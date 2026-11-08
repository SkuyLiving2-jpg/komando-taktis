/* ============================================================
   CORE — namespace, utilitas, konfigurasi, state global
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK = window.TK || {};
  const TAU = Math.PI * 2;

  TK.util = {
    TAU,
    rand: (a, b) => a + Math.random() * (b - a),
    pick: a => a[Math.floor(Math.random() * a.length)],
    rad: d => d * Math.PI / 180,
    deg: r => r * 180 / Math.PI,
    pad: (n, l = 2) => String(Math.round(n)).padStart(l, '0'),
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    wrapPi: a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI
  };

  TK.CFG = {
    TS: 12,          // skala waktu simulasi (1 detik nyata = TS detik simulasi)
    EXT: 1332,       // setengah lebar teater (km)
    LON0: 112, LAT0: 3, KMDEG: 111,
    FUEL_T: 300      // detik nyata untuk bahan bakar interseptor penuh -> habis
  };

  // konversi lon/lat <-> km (ekuirektangular, pusat teater)
  TK.geo = {
    toKm: (lon, lat) => [(lon - TK.CFG.LON0) * TK.CFG.KMDEG, (lat - TK.CFG.LAT0) * TK.CFG.KMDEG],
    toLL: (x, y) => [TK.CFG.LON0 + x / TK.CFG.KMDEG, TK.CFG.LAT0 + y / TK.CFG.KMDEG]
  };

  // state global (diisi ulang oleh TK.sim.reset; pengaturan UI dipertahankan)
  TK.S = {
    doc: 'tni', period: 5, rangeIdx: 2, view: 'radar', filter: 'ALL', paused: false,
    opts: { trails: true, grid: true, labels: true, datalink: true, land: true, sound: false }
  };

  // hook (diisi modul UI)
  TK.log = (msg, lv) => { if (TK.ui) TK.ui.log(msg, lv); };
  TK.sfx = (f, d, t, v) => { if (TK.ui) TK.ui.beep(f, d, t, v); };
})();
