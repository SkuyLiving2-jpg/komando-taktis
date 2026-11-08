/* ============================================================
   WAR-VIEW — render warzone, kamera, input, minimap, panel
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, UT = W.UT, war = TK.war, Q = war.Q;
  const { pad, clamp, rand } = TK.util;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const Tt = (k, v) => TK.t(k, v);
  const cv = $('#war'), ctx = cv.getContext('2d'), mini = $('#mini'), mctx = mini.getContext('2d'), stage = $('#stage');
  const C = { B: '#37d7ff', R: '#ff4a4a' }, F = { B: 'rgba(14,64,84,.92)', R: 'rgba(84,18,18,.92)' };
  let CW = 800, CH = 500, dpr = 1;
  const V = { x: W.WW / 2, y: W.WH / 2, z: .2, zmin: .1, place: null, mode: null, mouse: { x: 0, y: 0, wx: 0, wy: 0, in: false }, drag: null, keys: {}, groups: {},
    cat: 'G', grid: true, fog: true, terr: null, terrFor: null, fogC: null, fogV: -1, init: false, sig: {} };

  const w2s = (x, y) => [(x - V.x) * V.z + CW / 2, (y - V.y) * V.z + CH / 2];
  const s2w = (px, py) => [(px - CW / 2) / V.z + V.x, (py - CH / 2) / V.z + V.y];

  function resize() {
    dpr = window.devicePixelRatio || 1; CW = stage.clientWidth; CH = stage.clientHeight;
    cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; cv.width = CW * dpr; cv.height = CH * dpr;
    V.zmin = Math.min(CW / W.WW, CH / W.WH);
    if (!V.init && CW > 50) { V.z = V.zmin; V.x = W.WW / 2; V.y = W.WH / 2; V.init = true; }
    V.z = clamp(V.z, V.zmin, .9); clampCam();
  }
  function clampCam() { V.x = clamp(V.x, 0, W.WW); V.y = clamp(V.y, 0, W.WH); }

  /* ---------------- TEKSTUR MEDAN ---------------- */
  function buildTerrain() {   // tekstur medan bersama (war-terrain.js) — juga dipakai minimap & peta [M] mode operator
    V.terr = TK.warTerrain.build(Q.g); V.terrFor = Q.g;
    V.fogC = document.createElement('canvas'); V.fogC.width = W.GW; V.fogC.height = W.GH; V.fogV = -1;
  }
  function updateFogTex() {
    const x = V.fogC.getContext('2d'), img = x.createImageData(W.GW, W.GH), d = img.data, f = Q.fog;
    for (let i = 0; i < f.length; i++) { d[i * 4] = 2; d[i * 4 + 1] = 8; d[i * 4 + 2] = 5; d[i * 4 + 3] = f[i] === 2 ? 0 : f[i] === 1 ? 105 : 225; }
    x.putImageData(img, 0, 0); V.fogV = Q.fogV;
  }

  /* ---------------- IKON UNIT ---------------- */
  function shape(u, s, stroke, fill, shadow) {
    ctx.strokeStyle = stroke; ctx.fillStyle = fill; ctx.lineWidth = shadow ? 0 : 1.6;
    const rect = (w, h) => { ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); if (!shadow) ctx.stroke(); };
    const poly = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); if (!shadow) ctx.stroke(); };
    const plus = (x, y, r) => { if (shadow) return; ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore(); };
    const barrel = len => { ctx.save(); ctx.rotate(u.face - u.hdg); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.lineWidth = shadow ? 2 : 2.2; ctx.stroke(); ctx.restore(); };
    switch (u.type) {
      case 'INF': case 'SF':
        [[-.5, -.4], [.55, -.2], [0, .6]].forEach(p => { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, s * .32, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); });
        if (u.type === 'SF' && !shadow) { ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(0, 0, s * 1.1, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); } break;
      case 'MEDIC': [[-.5, -.4], [.55, -.2], [0, .6]].forEach(p => { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, s * .32, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); }); plus(s * 1.05, -s * .15, s * .55); break;
      case 'REPAIR': ctx.rotate(u.hdg); rect(s * 1.7, s * 1.1); ctx.rotate(-u.hdg); plus(0, 0, s * .6); break;
      case 'MEDHELI': ctx.rotate(u.hdg); ctx.beginPath(); ctx.ellipse(0, 0, s * .9, s * .45, 0, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * .8, 0); ctx.lineTo(-s * 1.7, 0); ctx.stroke(); ctx.rotate(-u.hdg); plus(0, 0, s * .5); ctx.rotate(Q.t * 20);
        ctx.beginPath(); ctx.moveTo(-s * 1.2, 0); ctx.lineTo(s * 1.2, 0); ctx.moveTo(0, -s * 1.2); ctx.lineTo(0, s * 1.2); ctx.lineWidth = 1; ctx.stroke(); break;
      case 'AT': case 'MORT':
        [[-.5, -.4], [.55, -.2], [0, .6]].forEach(p => { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, s * .32, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); });
        ctx.beginPath(); if (u.type === 'AT') { ctx.moveTo(-s * .2, s * .1); ctx.lineTo(s * 1.2, -s * .5); } else { ctx.arc(s * .9, -s * .6, s * .3, 0, 6.3); } ctx.lineWidth = 2; ctx.stroke(); break;
      case 'LTANK': ctx.rotate(u.hdg); rect(s * 1.6, s); ctx.beginPath(); ctx.arc(0, 0, s * .42, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); barrel(s * 1.3); break;
      case 'MLRS': ctx.rotate(u.hdg); rect(s * 1.7, s * 1.1); for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { ctx.beginPath(); ctx.rect(-s * .7 + c * s * .5, -s * .35 + r * s * .45, s * .35, s * .3); ctx.stroke(); } break;
      case 'ZSU': ctx.rotate(u.hdg); rect(s * 1.6, s * 1.1); [-.25, .25].forEach(o => { ctx.beginPath(); ctx.moveTo(0, o * s); ctx.lineTo(s * 1.2, o * s); ctx.stroke(); }); ctx.beginPath(); ctx.arc(-s * .4, 0, s * .3, 0, 6.3); ctx.stroke(); break;
      case 'ATK2': case 'AH64': ctx.rotate(u.hdg); ctx.beginPath(); ctx.ellipse(0, 0, s, s * .42, 0, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * .85, 0); ctx.lineTo(-s * 1.8, 0); ctx.moveTo(0, -s * .9); ctx.lineTo(0, s * .9); ctx.stroke(); ctx.rotate(-u.hdg + Q.t * 24);
        ctx.beginPath(); ctx.moveTo(-s * 1.4, 0); ctx.lineTo(s * 1.4, 0); ctx.moveTo(0, -s * 1.4); ctx.lineTo(0, s * 1.4); ctx.lineWidth = 1; ctx.stroke(); break;
      case 'UCAV': ctx.rotate(u.hdg); poly([[s * .9, 0], [-s * .3, -s * 1.3], [-s * .8, -s * 1.3], [-s * .5, 0], [-s * .8, s * 1.3], [-s * .3, s * 1.3]]); break;
      case 'CAS': ctx.rotate(u.hdg); poly([[s * 1.3, 0], [s * .2, -s * 1.7], [-s * .4, -s * 1.7], [-s * .4, -s * .25], [-s * 1.2, -s * .7], [-s * 1.2, s * .7], [-s * .4, s * .25], [-s * .4, s * 1.7], [s * .2, s * 1.7]]); break;
      case 'GBOAT': ctx.rotate(u.hdg); poly([[-s * .9, -s * .4], [s * .4, -s * .4], [s * 1.1, 0], [s * .4, s * .4], [-s * .9, s * .4]]); break;
      case 'TANK': ctx.rotate(u.hdg); rect(s * 1.9, s * 1.2); ctx.beginPath(); ctx.arc(0, 0, s * .5, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); barrel(s * 1.5); break;
      case 'IFV': ctx.rotate(u.hdg); poly([[-s, -s * .6], [s * .7, -s * .6], [s * 1.05, 0], [s * .7, s * .6], [-s, s * .6]]); ctx.beginPath(); ctx.arc(0, 0, s * .32, 0, 6.3); ctx.stroke(); barrel(s * .95); break;
      case 'ARTY': ctx.rotate(u.hdg); rect(s * 1.5, s); barrel(s * 2); break;
      case 'AA': ctx.rotate(u.hdg); rect(s * 1.5, s * 1.1); [-.4, 0, .4].forEach(o => { ctx.beginPath(); ctx.moveTo(-s * .1, o * s); ctx.lineTo(s * .7, o * s); ctx.stroke(); }); break;
      case 'SHIP': ctx.rotate(u.hdg); poly([[-s * 1.6, -s * .6], [s * .9, -s * .6], [s * 1.7, 0], [s * .9, s * .6], [-s * 1.6, s * .6]]); rect(s * .8, s * .5); break;
      case 'HELI': ctx.rotate(u.hdg); ctx.beginPath(); ctx.ellipse(0, 0, s * .9, s * .45, 0, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * .8, 0); ctx.lineTo(-s * 1.7, 0); ctx.stroke(); ctx.rotate(-u.hdg + Q.t * 20);
        ctx.beginPath(); ctx.moveTo(-s * 1.2, 0); ctx.lineTo(s * 1.2, 0); ctx.moveTo(0, -s * 1.2); ctx.lineTo(0, s * 1.2); ctx.lineWidth = 1; ctx.stroke(); break;
      case 'FGT': ctx.rotate(u.hdg); poly([[s * 1.5, 0], [-s, -s * 1.05], [-s * .55, 0], [-s, s * 1.05]]); break;
      case 'BMB': ctx.rotate(u.hdg); poly([[s * 1.4, 0], [-s * .2, -s * 1.6], [-s * 1.2, -s * 1.3], [-s * .7, 0], [-s * 1.2, s * 1.3], [-s * .2, s * 1.6]]); break;
      case 'UAV': ctx.rotate(u.hdg); poly([[s * .8, 0], [-s * .6, -s * 1.1], [-s * .4, 0], [-s * .6, s * 1.1]]); break;
      case 'HQ': rect(s * 1.6, s * 1.6); ctx.beginPath(); ctx.moveTo(0, -s * .7); ctx.lineTo(s * .3, s * .5); ctx.lineTo(-s * .7, -s * .1); ctx.lineTo(s * .7, -s * .1); ctx.lineTo(-s * .3, s * .5); ctx.closePath(); ctx.stroke(); break;
      case 'BNK': ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + .39; k ? ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s) : ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); ctx.fill(); if (!shadow) ctx.stroke(); break;
      case 'SAM': rect(s * 1.5, s * 1.5); [-.4, .4].forEach(o => { ctx.beginPath(); ctx.moveTo(-s * .5, o * s); ctx.lineTo(s * .6, o * s - s * .4); ctx.stroke(); }); break;
      case 'UFO': ctx.beginPath(); ctx.ellipse(0, 0, s * 1.3, s * .55, 0, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -s * .2, s * .45, Math.PI, 0); ctx.fill(); if (!shadow) ctx.stroke();
        if (!shadow) for (let k = 0; k < 6; k++) { const a = Q.t * 3 + k * 1.047; ctx.fillStyle = k % 2 ? '#7dffb0' : '#fff6a0'; ctx.beginPath(); ctx.arc(Math.cos(a) * s * .95, Math.sin(a) * s * .3, 1.6, 0, 6.3); ctx.fill(); } break;
      case 'JEEP': ctx.rotate(u.hdg); rect(s * 1.3, s * .8); ctx.beginPath(); ctx.arc(-s * .15, 0, s * .2, 0, 6.3); ctx.stroke(); barrel(s * .8); break;
      case 'SENTRY': ctx.beginPath(); ctx.moveTo(0, -s * .7); ctx.lineTo(s * .65, s * .5); ctx.lineTo(-s * .65, s * .5); ctx.closePath(); ctx.fill(); if (!shadow) ctx.stroke(); barrel(s * .9); break;
      case 'BLIMP': ctx.rotate(u.hdg); ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s * .55, 0, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke();
        poly([[-s * 1.3, 0], [-s * 1.85, -s * .6], [-s * 1.85, s * .6]]); rect(s * .5, s * .25); break;
      case 'GUNSHIP': ctx.rotate(u.hdg); poly([[s * 1.2, 0], [s * .3, -s * .2], [s * .1, -s * 1.7], [-s * .3, -s * 1.7], [-s * .3, -s * .2], [-s, -s * .2], [-s * 1.2, -s * .7], [-s * 1.3, -s * .7], [-s * 1.3, s * .7], [-s * 1.2, s * .7], [-s, s * .2], [-s * .3, s * .2], [-s * .3, s * 1.7], [s * .1, s * 1.7], [s * .3, s * .2]]); break;
      case 'ULTIMA': case 'LEVI': ctx.rotate(u.hdg); rect(s * 1.9, s * 1.3); ctx.beginPath(); ctx.rect(-s * .85, -s * .55, s * 1.7, s * 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * .45, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke();
        ctx.save(); ctx.rotate(u.face - u.hdg); [-.15, .15].forEach(o => { ctx.beginPath(); ctx.moveTo(0, o * s); ctx.lineTo(s * 1.5, o * s); ctx.lineWidth = 2.4; ctx.stroke(); }); ctx.restore(); break;
      case 'WARLORD': ctx.beginPath(); ctx.arc(0, 0, s * .7, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); rect(s * .5, s * .5); poly([[0, -s * 1.3], [s * .4, -s * .7], [-s * .4, -s * .7]]); break;
      case 'ZEUS': ctx.rotate(u.hdg); rect(s * 1.8, s * 1.3); ctx.save(); ctx.rotate(u.face - u.hdg); ctx.beginPath(); ctx.rect(-s * .5, -s * .45, s * .9, s * .9); ctx.fill(); if (!shadow) ctx.stroke(); [-.12, .12].forEach(o => { ctx.beginPath(); ctx.moveTo(0, o * s); ctx.lineTo(s * 2, o * s); ctx.lineWidth = 2; ctx.stroke(); }); ctx.restore(); break;
      case 'TITAN': ctx.rotate(u.hdg); rect(s * 2, s * .8); ctx.beginPath(); ctx.ellipse(-s * .1, 0, s * 1.5, s * .3, 0, 0, 6.3); ctx.stroke(); break;
      case 'NEMESIS': ctx.rotate(u.hdg); poly([[s * 1, 0], [-s * .3, -s * 2], [-s * .55, -s * 1.8], [-s * .3, -s * 1.1], [-s * .6, -s * .6], [-s * .4, 0], [-s * .6, s * .6], [-s * .3, s * 1.1], [-s * .55, s * 1.8], [-s * .3, s * 2]]); break;
      case 'KRAKEN': ctx.rotate(u.hdg); rect(s * 1.7, s * .45); for (const x of [-1, 1]) { ctx.save(); ctx.translate(x * s * .95, 0); ctx.rotate(Q.t * 20 * x); ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * 2.09) * s * .9, Math.sin(k * 2.09) * s * .9); } ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); } break;
      case 'CAESAR': rect(s * 1.4, s * 1.4); ctx.save(); ctx.rotate(u.face); ctx.beginPath(); ctx.moveTo(-s * .2, 0); ctx.lineTo(s * 1.6, 0); ctx.lineWidth = 2.6; ctx.stroke(); ctx.restore(); break;   // meriam 155 mm
      case 'MGN': ctx.beginPath(); ctx.arc(0, 0, s * .8, -1.2, 1.2); ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1; barrel(s * 1.1); break;   // karung pasir setengah lingkaran + SMB
      case 'BEHEMOTH': ctx.rotate(u.hdg); rect(s * 2, s * 1.35); ctx.beginPath(); ctx.moveTo(s * 1.15, -s * 1.2); ctx.lineTo(s * 1.15, s * 1.2); ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1.4;   // bilah dozer
        ctx.beginPath(); ctx.rect(-s * .9, -s * .6, s * 1.4, s * 1.2); ctx.stroke(); ctx.save(); ctx.rotate(u.face - u.hdg); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 1.1, 0); ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); break;
      case 'TEMPEST': ctx.rotate(u.hdg); rect(s * 2.1, s * .9); ctx.save(); ctx.rotate(u.face - u.hdg); ctx.beginPath(); ctx.rect(-s * .9, -s * .55, s * 1.4, s * 1.1); ctx.stroke();
        for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(-s * .55 + k * s * .45, -s * .25 + j * s * .5, s * .14, 0, 6.3); ctx.stroke(); } ctx.restore(); break;   // kotak 12 tabung roket
      case 'WYVERN': ctx.rotate(u.hdg); rect(s * 1.6, s * .4); ctx.beginPath(); ctx.moveTo(s * .1, -s * 1.5); ctx.lineTo(s * .1, s * 1.5); ctx.lineWidth = 2.4; ctx.stroke(); ctx.lineWidth = 1;
        for (const y0 of [-1.5, 1.5]) { ctx.save(); ctx.translate(s * .1, y0 * s); ctx.rotate(Q.t * 18 * y0); ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * 2.09) * s * .8, Math.sin(k * 2.09) * s * .8); } ctx.stroke(); ctx.restore(); } break;   // tiltrotor: dua rotor di ujung sayap
      case 'CLAY': ctx.beginPath(); ctx.arc(0, 0, s * .6, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); poly([[0, -s * 1.15], [s * .32, -s * .6], [-s * .32, -s * .6]]); if (u.jpk > Q.t) { ctx.save(); ctx.fillStyle = '#ff9a3c'; poly([[-s * .3, s * .6], [s * .3, s * .6], [0, s * 1.3]]); ctx.restore(); } break;   // segitiga api = jetpack menyala
      case 'CMDR': ctx.beginPath(); ctx.arc(0, 0, s * .55, 0, 6.3); ctx.fill(); if (!shadow) ctx.stroke(); poly([[0, -s * 1.1], [s * .3, -s * .55], [-s * .3, -s * .55]]); break;
      default: rect(s, s);
    }
  }
  const visible = u => u.team === 'B' || u.seen.B || u.intel || (u.struct && u.spotted);   // intel: bos penyerbu selalu dilaporkan posisinya
  function drawUnit(u) {
    const T = UT[u.type], p = w2s(u.x, u.y), x = p[0], y = p[1];
    if (x < -40 || y < -40 || x > CW + 40 || y > CH + 40) return;
    const k = clamp(.7 + V.z * 2.4, .85, 1.7), s = (6 + T.sz * 3.2) * k, air = u.tc === 'A', flash = Q.t - u.hitT < .15;
    const ghost = u.team === 'R' && !u.seen.B && !u.intel;   // struktur yang pernah terlihat tapi kini di luar pandangan
    ctx.save(); ctx.translate(x, y); if (ghost) ctx.globalAlpha = .55;
    if (air) { ctx.save(); ctx.translate(7 * k, 11 * k); ctx.globalAlpha = .28; shape(u, s, '#000', '#000', true); ctx.restore(); }
    if (u.chute > 0) { ctx.strokeStyle = '#d8ffe0'; ctx.fillStyle = 'rgba(216,255,224,.25)'; ctx.beginPath(); ctx.arc(0, -s * 1.4, s * 1.3, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 1.3, -s * 1.4); ctx.lineTo(0, 0); ctx.lineTo(s * 1.3, -s * 1.4); ctx.stroke(); }
    shape(u, s, flash ? '#fff' : C[u.team], F[u.team], false);
    if (u.boss && !ghost) {   // penanda bos: cincin merah berdenyut + label
      ctx.strokeStyle = 'rgba(255,60,60,' + (.5 + .4 * Math.sin(Q.t * 5)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s * 1.9, 0, 6.3); ctx.stroke();
      ctx.font = 'bold 10px Consolas,monospace'; ctx.fillStyle = '#ff6b6b'; const lb = '☠ ' + Tt(T.final ? 'w_final_tag' : T.raid ? 'w_raid_tag' : 'w_boss_tag'); ctx.fillText(lb, -ctx.measureText(lb).width / 2, -s * 1.9 - 14);
    }
    ctx.restore();
    if (Q.t - (u.healT || -9) < .6 && !ghost) { ctx.strokeStyle = '#39ff6e'; ctx.lineWidth = 2; const hy = y - s - 16 - (Q.t * 18 % 8); ctx.beginPath(); ctx.moveTo(x - 4, hy); ctx.lineTo(x + 4, hy); ctx.moveTo(x, hy - 4); ctx.lineTo(x, hy + 4); ctx.stroke(); }
    const sel = Q.sel.includes(u);
    if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.beginPath(); if (u.struct) ctx.rect(x - s - 5, y - s - 5, s * 2 + 10, s * 2 + 10); else ctx.arc(x, y, s + 5, 0, 6.3); ctx.stroke(); }
    if ((sel || u.hp < u.hpMax * .98) && u.chute <= 0 && !ghost) {
      const bw = Math.max(16, s * 2.2), f = clamp(u.hp / u.hpMax, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - bw / 2, y - s - 11, bw, 4); ctx.fillStyle = f > .6 ? '#39ff6e' : f > .3 ? '#ffb000' : '#ff3b3b'; ctx.fillRect(x - bw / 2, y - s - 11, bw * f, 4);
    }
  }

  /* ---------------- RENDER ---------------- */
  function draw(rdt) {
    if (!Q.g) return;
    if (V.terrFor !== Q.g) buildTerrain();
    // pan kamera (tombol panah)
    const pv = 900 * rdt / V.z / 4; if (V.keys.ArrowLeft) V.x -= pv; if (V.keys.ArrowRight) V.x += pv; if (V.keys.ArrowUp) V.y -= pv; if (V.keys.ArrowDown) V.y += pv; clampCam();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#020a05'; ctx.fillRect(0, 0, CW, CH);
    const o = w2s(0, 0); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(V.terr, o[0], o[1], W.WW * V.z, W.WH * V.z);

    // grid 500 m
    if (V.grid) {
      ctx.strokeStyle = 'rgba(57,255,110,.12)'; ctx.fillStyle = 'rgba(57,255,110,.55)'; ctx.lineWidth = 1; ctx.font = '10px Consolas,monospace';
      for (let gx = 0; gx <= W.WW; gx += 500) { const p = w2s(gx, 0); ctx.beginPath(); ctx.moveTo(p[0], o[1]); ctx.lineTo(p[0], o[1] + W.WH * V.z); ctx.stroke(); if (gx < W.WW) ctx.fillText(String.fromCharCode(65 + gx / 500), p[0] + 3, Math.max(12, o[1] + 11)); }
      for (let gy = 0; gy <= W.WH; gy += 500) { const p = w2s(0, gy); ctx.beginPath(); ctx.moveTo(o[0], p[1]); ctx.lineTo(o[0] + W.WW * V.z, p[1]); ctx.stroke(); if (gy < W.WH) ctx.fillText(String(gy / 500 + 1), Math.max(3, o[0] + 3), p[1] + 11); }
    }
    drawZones(); drawObjs();
    // bangkai
    for (const f of Q.fx) if (f.k === 'wreck') {
      const p = w2s(f.x, f.y), a = 1 - f.t / f.d; ctx.fillStyle = 'rgba(10,10,10,' + (.55 * a) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(4, f.r * V.z * 2), 0, 6.3); ctx.fill();
      for (let i = 0; i < 3; i++) { const k = (f.t * .6 + i / 3) % 1; ctx.fillStyle = 'rgba(70,70,70,' + (.35 * (1 - k) * a) + ')'; ctx.beginPath(); ctx.arc(p[0] + Math.sin(i * 2 + f.t) * 3, p[1] - k * 24, 3 + k * 5, 0, 6.3); ctx.fill(); }
    }
    // kabut perang
    if (V.fog) { if (V.fogV !== Q.fogV) updateFogTex(); ctx.drawImage(V.fogC, o[0], o[1], W.WW * V.z, W.WH * V.z); }
    if (TK.nexusui) TK.nexusui.overlay(ctx, w2s, V.z);   // peta ancaman AI NEXUS

    // unit: darat -> udara
    const us = Q.units.filter(visible);
    us.filter(u => u.tc !== 'A').forEach(drawUnit); us.filter(u => u.tc === 'A').forEach(drawUnit);
    drawOrders(); drawProjs(); drawFx(); drawNuke(); drawStrikes(); drawPending(); drawCursor(); drawBox(); drawRaid(); drawMini();
  }
  /* bos penyerbu SULIT: panah di tepi layar menunjuk bos yang di luar pandangan + spanduk besar saat bos muncul / mengincar markas / tumbang */
  function drawRaid() {
    ctx.save(); ctx.textAlign = 'center';
    for (const u of Q.units) {
      if (!u.intel || u.dead) continue;
      const p = w2s(u.x, u.y); if (p[0] > 0 && p[1] > 0 && p[0] < CW && p[1] < CH) continue;
      const a = Math.atan2(p[1] - CH / 2, p[0] - CW / 2), m = 34, k = Math.min((CW / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (CH / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      const x = CW / 2 + Math.cos(a) * k, y = CH / 2 + Math.sin(a) * k, pulse = .6 + .4 * Math.sin(Q.t * 6);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = 'rgba(255,48,48,' + pulse + ')'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.restore();
      const d = Math.hypot(u.x - V.x, u.y - V.y);
      ctx.font = 'bold 11px Consolas,monospace'; ctx.fillStyle = '#ff6b6b'; ctx.fillText('☠ ' + u.type + ' ' + (d / 1000).toFixed(1) + ' km', clamp(x - Math.cos(a) * 30, 90, CW - 90), clamp(y - Math.sin(a) * 26 - 16, 18, CH - 10));
    }
    const b = Q.ban, age = b ? Q.t - b.t : 99;
    if (age < 7) {
      const a = Math.min(1, age * 4, (7 - age) / .8), good = b.k.endsWith('_dead'), w = Math.min(CW - 40, 760);
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect((CW - w) / 2, 46, w, 58);
      ctx.fillStyle = good ? '#39ff6e' : '#ff3030'; ctx.fillRect((CW - w) / 2, 46, w, 3); ctx.fillRect((CW - w) / 2, 101, w, 3);
      const ttl = Tt(b.k.startsWith('w_final') ? 'w_final_tag' : b.k.startsWith('w_raid') ? 'w_raid_tag' : 'w_boss_tag') + ' · ' + Tt('wu_' + b.u.type); ctx.font = 'bold 20px Consolas,monospace'; const tw = ctx.measureText(ttl).width; if (tw > w - 24) ctx.font = 'bold ' + Math.floor(20 * (w - 24) / tw) + 'px Consolas,monospace'; ctx.fillText(ttl, CW / 2, 72);
      ctx.font = '11px Consolas,monospace'; ctx.fillStyle = '#fff'; let t = b.s; while (t.length > 8 && ctx.measureText(t).width > w - 24) t = t.slice(0, -2); ctx.fillText(t === b.s ? t : t + '…', CW / 2, 93);
    }
    ctx.restore();
  }

  function drawZones() {
    if (!V.place) return;
    const T = UT[V.place];
    ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 1.5;
    if (T.cat === 'G') {
      const zs = [[Q.hqB.x, Q.hqB.y, 560]].concat(Q.objs.filter(o => o.owner === 'B').map(o => [o.x, o.y, 340]));
      zs.forEach(z => { const p = w2s(z[0], z[1]); ctx.fillStyle = 'rgba(57,255,110,.1)'; ctx.strokeStyle = 'rgba(57,255,110,.8)'; ctx.beginPath(); ctx.arc(p[0], p[1], z[2] * V.z, 0, 6.3); ctx.fill(); ctx.stroke(); });
    } else if (T.cat === 'S') {
      const a = w2s(0, 0), b = w2s(1900, W.WH); ctx.fillStyle = 'rgba(55,215,255,.1)'; ctx.strokeStyle = 'rgba(55,215,255,.8)'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    }
    ctx.restore();
  }
  function drawObjs() {
    for (const o of Q.objs) {
      const p = w2s(o.x, o.y), r = o.r * V.z, col = o.owner === 'B' ? '#37d7ff' : o.owner === 'R' ? '#ff4a4a' : '#d8d080';
      ctx.fillStyle = o.owner === 'B' ? 'rgba(55,215,255,.07)' : o.owner === 'R' ? 'rgba(255,74,74,.08)' : 'rgba(216,208,128,.05)';
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
      if (o.prog) { ctx.lineWidth = 4; ctx.strokeStyle = o.prog > 0 ? '#37d7ff' : '#ff4a4a'; ctx.beginPath(); ctx.arc(p[0], p[1], r, -Math.PI / 2, -Math.PI / 2 + Math.abs(o.prog) * 6.283); ctx.stroke(); }
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0], p[1] + 8); ctx.lineTo(p[0], p[1] - 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0], p[1] - 12); ctx.lineTo(p[0] + 12, p[1] - 8); ctx.lineTo(p[0], p[1] - 4); ctx.closePath(); ctx.fill();
      ctx.font = 'bold 11px Consolas,monospace'; ctx.fillText(o.name, p[0] - ctx.measureText(o.name).width / 2, p[1] + 22);
    }
  }
  function drawOrders() {
    ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (const u of Q.sel) { const h = UT[u.type].heal; if (!h || u.dead) continue; const p = w2s(u.x, u.y); ctx.strokeStyle = 'rgba(57,255,110,.7)'; ctx.fillStyle = 'rgba(57,255,110,.06)'; ctx.beginPath(); ctx.arc(p[0], p[1], h.rad * V.z, 0, 6.3); ctx.fill(); ctx.stroke(); }
    for (const u of Q.sel) {
      if (u.dead) continue; const o = u.order; let tx, ty, col;
      if (o.k === 'move' || o.k === 'amove' || o.k === 'ground' || o.k === 'cap') { tx = o.x; ty = o.y; col = o.k === 'move' || o.k === 'cap' ? '#39ff6e' : o.k === 'amove' ? '#ff9a3c' : '#ffb000'; }
      else if (o.k === 'attack' && o.tgt && !o.tgt.dead) { tx = o.tgt.x; ty = o.tgt.y; col = '#ff3b3b'; }
      else if (o.k === 'bombrun') { tx = o.x; ty = o.y; col = '#ffb000'; } else continue;
      const a = w2s(u.x, u.y), b = w2s(tx, ty); ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(b[0] - 2, b[1] - 2, 4, 4);
    }
    ctx.restore();
  }
  function drawProjs() {
    for (const p of Q.projs) {
      if (p.t < 0) continue;
      const s = w2s(p.x, p.y);
      if (p.kind === 'bullet') { const a = w2s(p.x - (p.tx - p.sx) / Math.max(1, Math.hypot(p.tx - p.sx, p.ty - p.sy)) * 16, p.y - (p.ty - p.sy) / Math.max(1, Math.hypot(p.tx - p.sx, p.ty - p.sy)) * 16); ctx.strokeStyle = p.beam === 3 ? '#a8dcff' : p.beam ? '#6dff9e' : p.big ? '#ffb347' : '#ffe9a0'; ctx.lineWidth = p.beam ? 3 : p.big ? 2.4 : 1.2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(s[0], s[1]); ctx.stroke(); }
      else if (p.kind === 'shell' || p.kind === 'bomb') { const h = (p.h || 0) * 26; ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(s[0], s[1], 2, 0, 6.3); ctx.fill(); ctx.fillStyle = p.kind === 'bomb' ? '#ddd' : '#ffd27a'; ctx.beginPath(); ctx.arc(s[0], s[1] - h, p.kind === 'bomb' ? 3 : 2.2, 0, 6.3); ctx.fill(); }
      else if (p.kind === 'missile') {
        ctx.strokeStyle = 'rgba(230,230,230,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); p.trail.forEach((t, i) => { const q = w2s(t[0], t[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.lineTo(s[0], s[1]); ctx.stroke();
        ctx.fillStyle = '#ff7a3c'; ctx.beginPath(); ctx.arc(s[0], s[1], 2.4, 0, 6.3); ctx.fill();
      }
    }
  }
  function drawFx() {
    for (const f of Q.fx) {
      const k = f.t / f.d, p = w2s(f.x, f.y);
      if (f.k === 'boom') { const r = Math.max(5, f.r * V.z * (.4 + k * 1.2)); ctx.fillStyle = 'rgba(255,' + Math.round(190 - 120 * k) + ',40,' + (.75 * (1 - k)) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.fill(); ctx.strokeStyle = 'rgba(255,230,160,' + (1 - k) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], r * 1.25, 0, 6.3); ctx.stroke(); }
      else if (f.k === 'nuke') {   // bola api + gelombang kejut
        const r = f.r * V.z, e = Math.min(1, k * 3);
        ctx.fillStyle = 'rgba(255,255,230,' + Math.max(0, .9 - k * 6) + ')'; ctx.fillRect(0, 0, CW, CH);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * (.35 + e * .5)); g.addColorStop(0, 'rgba(255,250,220,' + (1 - k) + ')'); g.addColorStop(.4, 'rgba(255,150,40,' + (.85 * (1 - k)) + ')'); g.addColorStop(1, 'rgba(120,30,10,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * (.35 + e * .5), 0, 6.3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,240,200,' + (1 - k) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p[0], p[1], r * (.2 + k * 1.6), 0, 6.3); ctx.stroke();
      }
      else if (f.k === 'muz') { ctx.fillStyle = 'rgba(255,240,150,' + (1 - k) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], 3 + f.r * k * .5, 0, 6.3); ctx.fill(); }
      else if (f.k === 'spark') { ctx.fillStyle = 'rgba(255,220,120,' + (1 - k) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], 2 + k * 4, 0, 6.3); ctx.fill(); }
      else if (f.k === 'plane') {
        const a = w2s(f.x0, f.y1), b = w2s(f.x1, f.y1), x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
        ctx.strokeStyle = 'rgba(216,255,224,.35)'; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#d8ffe0'; ctx.beginPath(); ctx.moveTo(x + 11, y); ctx.lineTo(x - 7, y - 9); ctx.lineTo(x - 4, y); ctx.lineTo(x - 7, y + 9); ctx.closePath(); ctx.fill();
      }
    }
  }
  function drawNuke() {
    const n = Q.nuke; if (!n) return;
    const p = w2s(n.x, n.y), r = n.r * V.z, bl = (Q.t * 3 % 1) < .5;
    ctx.save(); ctx.fillStyle = 'rgba(255,40,30,' + (bl ? .2 : .1) + ')'; ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffdd33'; ctx.font = 'bold 16px Consolas,monospace'; const t = '☢ ' + Math.ceil(n.t) + 's'; ctx.fillText(t, p[0] - ctx.measureText(t).width / 2, p[1] + 6); ctx.restore();
  }
  function drawStrikes() {   // zona jatuh rudal balistik TITAN
    for (const n of Q.strk || []) {
      const p = w2s(n.x, n.y), r = Math.max(8, n.r * V.z), bl = (Q.t * 4 % 1) < .5;
      ctx.save(); ctx.fillStyle = 'rgba(255,40,30,' + (bl ? .25 : .1) + ')'; ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffdd33'; ctx.font = 'bold 13px Consolas,monospace'; const t = '▼ ' + Math.ceil(n.t) + 's'; ctx.fillText(t, p[0] - ctx.measureText(t).width / 2, p[1] + 5); ctx.restore();
    }
  }
  function drawPending() {
    ctx.font = '10px Consolas,monospace';
    for (const p of Q.pend) {
      const a = w2s(p.x, p.y), k = 1 - p.t / p.t0; ctx.strokeStyle = p.mode === 'drop' ? '#ffb000' : '#39ff6e'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(a[0], a[1], 12, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(a[0], a[1], 12, -Math.PI / 2, -Math.PI / 2 + k * 6.283); ctx.stroke();
      ctx.fillText(Tt('wu_' + p.type) + ' ' + Math.ceil(p.t) + 's', a[0] + 16, a[1] + 3);
    }
  }
  function drawCursor() {
    if (!V.mouse.in) return; const m = V.mouse;
    if (V.place) {
      const c = war.deployCheck(V.place, m.wx, m.wy), T = UT[V.place], col = !c.ok ? '#ff3b3b' : c.mode === 'drop' ? '#ffb000' : '#39ff6e', k = clamp(.7 + V.z * 2.4, .85, 1.7);
      ctx.save(); ctx.globalAlpha = .75; ctx.translate(m.x, m.y);
      if (T.cat === 'A') { ctx.setLineDash([4, 4]); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, 0, 380 * V.z, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); }
      shape({ type: V.place, hdg: 0, face: 0 }, (6 + T.sz * 3.2) * k, col, 'rgba(0,0,0,.35)', false); ctx.restore();
      ctx.font = '11px Consolas,monospace'; ctx.fillStyle = col;
      const txt = c.ok ? Tt('wu_' + V.place) + ' · ' + c.cost + ' · ' + c.eta + 's · ' + Tt('w_mode_' + c.mode) : Tt(c.msg);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(m.x + 14, m.y + 8, ctx.measureText(txt).width + 8, 16); ctx.fillStyle = col; ctx.fillText(txt, m.x + 18, m.y + 20);
    } else if (V.mode) {
      ctx.strokeStyle = V.mode === 'amove' ? '#ff9a3c' : '#ffb000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(m.x, m.y, 12, 0, 6.3); ctx.moveTo(m.x - 18, m.y); ctx.lineTo(m.x + 18, m.y); ctx.moveTo(m.x, m.y - 18); ctx.lineTo(m.x, m.y + 18); ctx.stroke();
    }
  }
  function drawBox() {
    const d = V.drag; if (!d || d.btn !== 0 || !d.moved || V.place) return;
    ctx.strokeStyle = '#39ff6e'; ctx.fillStyle = 'rgba(57,255,110,.1)'; ctx.lineWidth = 1;
    ctx.fillRect(d.x0, d.y0, V.mouse.x - d.x0, V.mouse.y - d.y0); ctx.strokeRect(d.x0, d.y0, V.mouse.x - d.x0, V.mouse.y - d.y0);
  }

  /* ---------------- MINIMAP ---------------- */
  function drawMini() {
    const w = mini.width, h = mini.height, k = w / W.WW;
    mctx.fillStyle = '#020a05'; mctx.fillRect(0, 0, w, h); mctx.drawImage(V.terr, 0, 0, w, h);
    if (V.fog) { mctx.globalAlpha = .8; mctx.drawImage(V.fogC, 0, 0, w, h); mctx.globalAlpha = 1; }
    for (const o of Q.objs) { mctx.fillStyle = o.owner === 'B' ? '#37d7ff' : o.owner === 'R' ? '#ff4a4a' : '#d8d080'; mctx.fillRect(o.x * k - 3, o.y * k - 3, 6, 6); }
    for (const u of Q.units) { if (!visible(u)) continue; mctx.fillStyle = C[u.team]; const s = u.intel ? 6 : u.struct ? 3 : 2; mctx.fillRect(u.x * k - s / 2, u.y * k - s / 2, s, s); }
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.strokeRect((V.x - CW / 2 / V.z) * k, (V.y - CH / 2 / V.z) * k, CW / V.z * k, CH / V.z * k);
  }
  function miniGo(e) { const r = mini.getBoundingClientRect(); V.x = (e.clientX - r.left) / r.width * W.WW; V.y = (e.clientY - r.top) / r.height * W.WH; clampCam(); }
  let miniDrag = false;
  mini.addEventListener('mousedown', e => { miniDrag = true; miniGo(e); }); window.addEventListener('mousemove', e => { if (miniDrag) miniGo(e); }); window.addEventListener('mouseup', () => { miniDrag = false; });

  /* ---------------- INPUT ---------------- */
  function unitAt(wx, wy, enemy) {
    let best = null, bd = 16 / V.z + 6;
    for (const u of Q.units) {
      if (u.dead || (enemy ? (u.team !== 'R' || !visible(u)) : u.team !== 'B') || u.chute > 0) continue;
      const d = Math.hypot(u.x - wx, u.y - wy) - UT[u.type].sz * 4; if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  const evPos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mouseenter', () => { V.mouse.in = true; }); cv.addEventListener('mouseleave', () => { V.mouse.in = false; });
  cv.addEventListener('mousedown', e => {
    const p = evPos(e); updateMouse(p);
    if (e.button === 1) { V.drag = { btn: 1, x: p[0], y: p[1], cx: V.x, cy: V.y, moved: true }; e.preventDefault(); return; }
    if (e.button === 2) { rightClick(); return; }
    V.drag = { btn: 0, x0: p[0], y0: p[1], moved: false, shift: e.shiftKey };
  });
  window.addEventListener('mousemove', e => {
    const d = V.drag; if (!d) return; const p = evPos(e); updateMouse(p);
    if (d.btn === 1) { V.x = d.cx - (p[0] - d.x) / V.z; V.y = d.cy - (p[1] - d.y) / V.z; clampCam(); }
    else if (Math.hypot(p[0] - d.x0, p[1] - d.y0) > 5) d.moved = true;
  });
  cv.addEventListener('mousemove', e => updateMouse(evPos(e)));
  window.addEventListener('mouseup', e => {
    const d = V.drag; V.drag = null; if (!d || d.btn !== 0 || e.target !== cv) return;
    const p = evPos(e); updateMouse(p);
    if (d.moved && !V.place && !V.mode) boxSelect(d.x0, d.y0, p[0], p[1], d.shift); else leftClick(d.shift);
  });
  function updateMouse(p) { const w = s2w(p[0], p[1]); V.mouse.x = p[0]; V.mouse.y = p[1]; V.mouse.wx = w[0]; V.mouse.wy = w[1]; V.mouse.in = true; }
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const p = evPos(e), b = s2w(p[0], p[1]); V.z = clamp(V.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), V.zmin, .9);
    const a = s2w(p[0], p[1]); V.x += b[0] - a[0]; V.y += b[1] - a[1]; clampCam();
  }, { passive: false });
  cv.addEventListener('dblclick', e => {
    if (V.place || V.mode) return; const p = evPos(e), w = s2w(p[0], p[1]), u = unitAt(w[0], w[1], false); if (!u) return;
    Q.sel = Q.units.filter(x => x.team === 'B' && x.type === u.type && !x.dead && (() => { const q = w2s(x.x, x.y); return q[0] > 0 && q[1] > 0 && q[0] < CW && q[1] < CH; })());
  });

  function leftClick(shift) {
    const m = V.mouse;
    if (V.place) { const r = war.deploy(V.place, m.wx, m.wy); if (!r.ok) { TK.log(Tt(r.msg), 'w'); TK.sfx(300, .12, 'sawtooth', .04); } return; }
    if (V.mode && Q.sel.length) {
      if (V.mode === 'amove') war.cmdMove(Q.sel, m.wx, m.wy, true); else war.cmdGround(Q.sel, m.wx, m.wy);
      V.mode = null; TK.sfx(800, .05); return;
    }
    const u = unitAt(m.wx, m.wy, false);
    if (u) Q.sel = shift ? (Q.sel.includes(u) ? Q.sel.filter(x => x !== u) : Q.sel.concat(u)) : [u];
    else if (!shift) Q.sel = [];
  }
  function rightClick() {
    const m = V.mouse;
    if (V.place) { V.place = null; V.sig = {}; return; }
    if (V.mode) { V.mode = null; return; }
    if (!Q.sel.length) return;
    const tg = unitAt(m.wx, m.wy, true);
    if (tg) war.cmdAttack(Q.sel, tg); else war.cmdMove(Q.sel, m.wx, m.wy, false);
    TK.sfx(800, .05);
  }
  function boxSelect(x0, y0, x1, y1, shift) {
    const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
    const got = Q.units.filter(u => u.team === 'B' && !u.struct && !u.dead && u.chute <= 0 && (() => { const p = w2s(u.x, u.y); return p[0] >= a && p[0] <= b && p[1] >= c && p[1] <= d; })());
    Q.sel = shift ? Q.sel.concat(got.filter(u => !Q.sel.includes(u))) : got;
  }

  /* keyboard (dipanggil dari ui.js saat view = war); true bila ditangani */
  function key(e) {
    const k = e.key, l = k.toLowerCase();
    if (k.startsWith('Arrow')) { V.keys[k] = true; e.preventDefault(); return true; }
    if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey) { V.groups[k] = Q.sel.slice(); e.preventDefault(); return true; }
      const g = (V.groups[k] || []).filter(u => !u.dead); if (g.length) { Q.sel = g; const cx = g.reduce((s, u) => s + u.x, 0) / g.length, cy = g.reduce((s, u) => s + u.y, 0) / g.length; if (V.lastGrp === k) { V.x = cx; V.y = cy; clampCam(); } V.lastGrp = k; }
      return true;
    }
    if (l === 'a' && Q.sel.length) { V.mode = 'amove'; V.place = null; return true; }
    if (l === 'f' && Q.sel.length) { V.mode = 'ground'; V.place = null; return true; }
    if (l === 's') { war.cmdStop(Q.sel); return true; }
    if (l === 'h') { const st = Q.sel.length && Q.sel.every(u => u.stance === 'HOLD') ? 'AGGR' : 'HOLD'; war.cmdStance(Q.sel, st); return true; }
    if (l === 'g') { V.grid = !V.grid; syncBar(); return true; }
    if (l === ' ') { e.preventDefault(); Q.paused = !Q.paused; syncBar(); return true; }
    if (k === 'Escape') { if (V.place || V.mode) { V.place = null; V.mode = null; V.sig = {}; } else Q.sel = []; return true; }
    return false;
  }
  window.addEventListener('keyup', e => { delete V.keys[e.key]; });

  /* ---------------- PANEL ---------------- */
  function renderCats() {
    const cats = ['G', 'A', 'S'];
    const sig = cats.map(c => c + (V.cat === c) + TK.doc().lang).join();
    if (V.sig.cats === sig) return; V.sig.cats = sig;
    $('#wcats').innerHTML = cats.map(c => '<button data-cat="' + c + '" class="' + (V.cat === c ? 'on' : '') + '">' + Tt('w_cat_' + c) + '</button>').join('');
  }
  function renderCards() {
    const types = W.DEPLOY_ORDER.filter(t => UT[t].cat === V.cat), sig = V.cat + '|' + V.place + '|' + TK.doc().lang + '|' + types.map(t => Q.cr >= UT[t].cost ? 1 : 0).join('');
    if (V.sig.cards === sig) return; V.sig.cards = sig;
    $('#wcards').innerHTML = types.map(t => {
      const T = UT[t];
      return '<div class="ucard' + (V.place === t ? ' on' : '') + (Q.cr >= T.cost ? '' : ' no') + '" data-type="' + t + '"><b>' + Tt('wu_' + t) + '</b><span class="cost">' + T.cost + '</span><small>' + Tt('wd_' + t) + '</small><em>' + T.dep + 's' + (T.drop ? ' · ' + Tt('w_dropok') : '') + '</em></div>';
    }).join('');
  }
  function renderQueue() {
    $('#wqueue').innerHTML = Q.pend.length ? Q.pend.map(p => '<div class="q"><span>' + Tt('wu_' + p.type) + (p.mode === 'drop' ? ' ✈' : '') + '</span><i style="width:' + ((1 - p.t / p.t0) * 100).toFixed(0) + '%"></i><b>' + Math.ceil(p.t) + 's</b></div>').join('') : '<div class="none">' + Tt('w_noq') + '</div>';
  }
  function renderSel() {
    const sel = Q.sel.filter(u => !u.dead); $('#wselc').textContent = sel.length;
    if (!sel.length) { $('#wselbody').innerHTML = '<div class="none">' + Tt('w_nosel') + '</div>'; return; }
    const by = {}; sel.forEach(u => { (by[u.type] = by[u.type] || []).push(u); });
    const rows = Object.keys(by).map(t => { const a = by[t], hp = a.reduce((s, u) => s + u.hp / u.hpMax, 0) / a.length; return '<div class="kv"><span>' + Tt('wu_' + t) + ' ×' + a.length + '</span><b style="color:' + (hp > .6 ? 'var(--g)' : hp > .3 ? 'var(--amber)' : 'var(--red)') + '">' + Math.round(hp * 100) + '%</b></div>'; }).join('');
    const hold = sel.every(u => u.stance === 'HOLD');
    $('#wselbody').innerHTML = rows + '<div class="ctl" style="margin-top:6px"><button data-w="stop">' + Tt('w_b_stop') + ' [S]</button><button data-w="amove" class="amb ' + (V.mode === 'amove' ? 'on' : '') + '">' + Tt('w_b_amove') + ' [A]</button><button data-w="ground" class="red ' + (V.mode === 'ground' ? 'on' : '') + '">' + Tt('w_b_ground') + ' [F]</button><button data-w="stance">' + Tt(hold ? 'w_hold' : 'w_aggr') + ' [H]</button></div>';
  }
  function renderLeft() {
    const t = Math.floor(Q.t); $('#wtime').textContent = pad(t / 60) + ':' + pad(t % 60);
    $('#wobjs').innerHTML = raidRows() + Q.objs.map((o, i) => '<div class="obj" data-oi="' + i + '"><div class="r1"><span>' + o.name + '</span><span class="own ' + o.owner + '">' + (o.boss && !o.boss.dead ? '☠ ' : '') + Tt('w_own_' + o.owner) + '</span></div><div class="pb"><i class="' + (o.prog >= 0 ? 'b' : 'r') + '" style="width:' + (Math.abs(o.prog) * 100).toFixed(0) + '%"></i></div></div>').join('') +
      '<div class="obj" data-oi="hq"><div class="r1"><span>' + Tt('wu_HQ') + ' ' + Tt('w_own_R') + '</span><span class="own R">' + Math.max(0, Math.round(Q.hqR.hp / Q.hqR.hpMax * 100)) + '%</span></div></div>';
    $('#wcr').textContent = Math.floor(Q.cr); $('#winc').textContent = '+' + (Q.inc || 6).toFixed(0) + '/s';
    $('#wpop').textContent = war.popB() + '/' + war.POP_CAP; $('#wdepcr').textContent = Math.floor(Q.cr);
    $('#wkill').textContent = Q.stats.kills; $('#wlost').textContent = Q.stats.lost; $('#wdep').textContent = Q.stats.dep;
    $('#wvis').textContent = Q.units.filter(u => u.team === 'R' && !u.struct && u.seen.B).length;
    $$('#wdiff button').forEach(b => { b.classList.toggle('on', +b.dataset.d === Q.diff); if (+b.dataset.d === 3) b.textContent = '★ ' + Tt('w_d3'); });
    const ov = $('#wover'); ov.classList.toggle('off', !Q.over);
    if (Q.over) { $('#wovert').textContent = Tt(Q.over === 'win' ? 'w_win' : 'w_lose'); ov.className = 'wover ' + Q.over; }
  }
  function raidRows() {   // SULIT: bos penyerbu yang sedang bergerak (klik = kamera ke sana) + hitung mundur bos berikutnya
    const D = war.DIFF[Q.diff]; if (!D.raid) return '';
    let h = Q.units.filter(u => u.intel && !u.dead).map(u => '<div class="obj raid" data-oi="u' + u.id + '"><div class="r1"><span>☠ ' + u.type + (u.goal ? ' → ' + (u.goal === Q.hqB ? Tt('w_raid_hq') : u.goal.name) : '') + '</span><span class="own R">' + Math.ceil(u.hp / u.hpMax * 100) + '%</span></div></div>').join('');
    if (Q.raidN < war.RAIDERS.length) { const t = Math.max(0, Math.ceil(Q.raidT)); h += '<div class="obj raid"><div class="r1"><span>☠ ' + Tt('w_raid_tag') + ' ' + (Q.raidN + 1) + '/' + war.RAIDERS.length + '</span><span class="own R">' + pad(t / 60) + ':' + pad(t % 60) + '</span></div></div>'; }
    return h;
  }
  function syncBar() {
    $$('#wspeed button').forEach(b => b.classList.toggle('on', +b.dataset.sp === Q.speed));
    $('#wFog').classList.toggle('on', V.fog); $('#wGrid').classList.toggle('on', V.grid); $('#wPause').classList.toggle('on', !!Q.paused);
  }
  function refresh() { renderCats(); renderCards(); renderQueue(); renderSel(); renderLeft(); syncBar(); }

  // event panel (mousedown agar tidak hilang saat panel di-render ulang)
  $('#wcats').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { V.cat = b.dataset.cat; V.sig = {}; refresh(); } });
  $('#wcards').addEventListener('click', e => { const c = e.target.closest('.ucard'); if (!c) return; V.place = V.place === c.dataset.type ? null : c.dataset.type; V.mode = null; V.sig = {}; refresh(); });
  $('#wselbody').addEventListener('mousedown', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.w === 'stop') war.cmdStop(Q.sel); else if (b.dataset.w === 'amove') { V.mode = V.mode === 'amove' ? null : 'amove'; V.place = null; }
    else if (b.dataset.w === 'ground') { V.mode = V.mode === 'ground' ? null : 'ground'; V.place = null; }
    else if (b.dataset.w === 'stance') war.cmdStance(Q.sel, Q.sel.every(u => u.stance === 'HOLD') ? 'AGGR' : 'HOLD');
    V.sig = {}; renderSel();
  });
  $('#wobjs').addEventListener('mousedown', e => { const o = e.target.closest('[data-oi]'); if (!o) return; const k = o.dataset.oi, t = k === 'hq' ? Q.hqR : k[0] === 'u' ? Q.units.find(u => u.id === +k.slice(1)) : Q.objs[+k]; if (!t) return; V.x = t.x; V.y = t.y; clampCam(); });
  $('#wspeed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { Q.speed = +b.dataset.sp; syncBar(); } });
  $('#wFog').onclick = () => { V.fog = !V.fog; syncBar(); }; $('#wGrid').onclick = () => { V.grid = !V.grid; syncBar(); };
  $('#wPause').onclick = () => { Q.paused = !Q.paused; syncBar(); };
  $('#wdiff').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { war.setDiff(+b.dataset.d); V.sig = {}; V.groups = {}; refresh(); } });
  $('#wrestart').onclick = $('#wover button').onclick = () => { war.reset(); V.sig = {}; V.groups = {}; V.place = null; V.mode = null; refresh(); };

  /* ---------------- API ---------------- */
  TK.warui = {
    resize, draw, key, refresh,
    ensureTerrain() { if (Q.g && V.terrFor !== Q.g) buildTerrain(); },
    applyLang() { V.sig = {}; refresh(); },
    hudText() { return Tt('w_credits') + ' ' + Math.floor(Q.cr) + ' (+' + (Q.inc || 6).toFixed(0) + '/s) · ' + Tt('w_pop') + ' ' + war.popB() + '/' + war.POP_CAP; },
    headerText() { const n = Q.objs.filter(o => o.owner === 'B').length; return (Q.paused ? '❚❚ ' : '') + Tt('v_war') + ' · ' + n + '/' + Q.objs.length + ' ' + Tt('w_objs') + ' · ' + Q.units.filter(u => u.team === 'R' && !u.struct && u.seen.B).length + ' ' + Tt('w_enemy') + (TK.nexus && TK.nexus.ready ? ' · NEXUS ' + Math.round(TK.nexus.p * 100) + '%' + (TK.nexus.on.auto ? ' AUTO' : '') : ''); },
    hintText() { return V.place ? Tt('w_hint_dep') : V.mode ? Tt('w_hint_mode') : Tt('w_hint'); },
    cursor() { return V.place || V.mode ? 'none' : 'crosshair'; },
    state: V
  };
  setInterval(() => { if (TK.S.view === 'war') { refresh(); $('#hint').textContent = TK.warui.hintText(); cv.style.cursor = (V.place || V.mode) ? 'none' : 'crosshair'; } }, 300);
  war.reset(); refresh();
})();
