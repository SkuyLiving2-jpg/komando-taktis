/* ============================================================
   FPS-KIT — lampiran senjata (attachment) & perk ala Call of Duty:
   MEJA SENJATA di markas sendiri ([E] di dekatnya) khusus untuk
   memasang / melepas lampiran M4A1. Perk dipilih di menu PILIH KELAS
   (F.perkHTML, [K] / saat mati) dan berlaku saat terjun. Batas per kesulitan
   (F.KITLIM): MUDAH 1 lampiran · NORMAL 2 · SULIT 2 + 1 perk ·
   PROFESIONAL 3 + 2 perk. Statistik senjata efektif = F.WBASE
   (dasar) + lampiran aktif (F.applyKit). Paket jatuhan VULTURE.
   Efek perk lain dipasang di fps.js (perk()), HUD di fps-ui.js,
   model lampiran di fps-vm.js, meja 3D di fps-models.js
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q;
  const { clamp, rand } = TK.util, Tt = (k, v) => TK.t(k, v), A = () => TK.fpsaudio;
  const BASE = F.WBASE = JSON.parse(JSON.stringify(F.WEAPONS));   // statistik dasar sebelum lampiran

  /* ---------- pilihan: lampiran bertahan antar-nyawa dalam SATU permainan (permainan baru / muat ulang = senjata standar);
     pilihan perk menu kelas diingat antar-sesi (localStorage) ---------- */
  const K = F.kit = { att: { AR: [] }, perks: [] };
  try {
    const sv = JSON.parse(localStorage.getItem('tk_fps_kit') || 'null');
    if (sv && sv.perks) K.perks = sv.perks.filter(p => F.PERKS.includes(p));
  } catch (e) { /* tanpa penyimpanan */ }
  const save = () => { try { localStorage.setItem('tk_fps_kit', JSON.stringify({ perks: K.perks })); } catch (e) { /* ok */ } };
  let gen = null;
  const fresh = () => { if (gen !== Q.g) { gen = Q.g; for (const w in K.att) K.att[w] = []; } };   // Q.g = peta permainan; berganti saat permainan baru

  /* yang AKTIF = pilihan teratas sebanyak batas mode sekarang (pilihan lain disimpan, aktif lagi di mode yang lebih longgar) */
  F.kitLim = () => F.KITLIM[Q.diff] || F.KITLIM[1];
  F.attOn = w => (K.att[w || 'AR'] || []).slice(0, F.kitLim().att);
  F.perksSel = () => K.perks.slice(0, F.kitLim().perk);   // pilihan di menu kelas
  F.perksOn = () => (P.perks || []).slice(0, F.kitLim().perk);   // yang berlaku: disalin dari pilihan saat terjun (F.spawn)
  F.hasAtt = (id, w) => F.attOn(w).includes(id);
  F.hasPerk = id => F.perksOn().includes(id);

  /* statistik efektif: salinan dasar + pengubah tiap lampiran aktif. refill = isi penuh amunisi senjata yang dipegang */
  let sig = '';
  F.applyKit = function (refill) {
    fresh();
    for (const id in BASE) {
      const d = Object.assign({}, BASE[id]); d.spread = BASE[id].spread.slice();
      for (const a of F.attOn(id)) {
        const m = F.ATT[a].m;
        for (const k in m) {
          const v = m[k];
          if (v && v.set !== undefined) d[k] = v.set;
          else if (Array.isArray(v)) d[k] = d[k].map((x, i) => x * v[i]);
          else d[k] = k === 'mag' || k === 'res' ? Math.round(d[k] * v) : d[k] * v;
        }
        d.opt = d.opt || F.ATT[a].opt;
      }
      F.WEAPONS[id] = d;
    }
    for (const w of P.w || []) {
      if (!w) continue; const d = F.WEAPONS[w.id];
      if (refill) { w.ammo = d.mag; w.res = d.res; w.dm = 0; } else { w.ammo = Math.min(w.ammo, d.mag); }
    }
    sig = Q.diff + '|' + F.attOn().join() + '|' + F.perksOn().join();
  };
  F.applyKit(false);

  /* ---------- MEJA SENJATA di markas ---------- */
  let BN = null;
  F.bench = function () {
    if (!F.world || !Q.hqB || !F.freeSpot) return null;
    if (BN && BN.g === Q.g && BN.w === F.world) return BN;
    const h = Q.hqB, [x, y] = F.freeSpot(h.x + 74, h.y + 30);   // di antara gedung markas & titik lahir operator (HQ + 110 m)
    BN = { g: Q.g, w: F.world, x, y, a: { id: 8.8e6, type: 'ARMORY', team: 'B', x, y, hdg: 0, face: 0, hitT: -9, revealT: -9, chute: 0, dead: false } };
    return BN;
  };
  F.benchNear = function () {
    const b = P.alive && !P.veh && !P.mnt && !P.gs && !P.down && !P.chute && F.bench(); if (!b) return false;
    return Math.hypot(P.x - b.x, P.y - b.y) < 3.4;
  };
  F.kitBlock = (x, y) => { const b = BN; return !!b && b.g === Q.g && Math.abs(x - b.x) < .75 && Math.abs(y - b.y) < 1.5; };   // tubuh operator tidak menembus meja

  /* ---------- menu meja senjata ---------- */
  const doc = typeof document !== 'undefined' && document.querySelector ? document : null;
  const anchor = doc && doc.querySelector('#fpspause');
  const el = anchor ? doc.createElement('div') : null;
  if (el) { el.id = 'fpskit'; el.className = 'fmenu off'; anchor.parentNode.appendChild(el); }
  const KM = { msg: '', pmsg: '' };
  F.kitOn = false;
  F.benchUse = function () {
    if (!F.benchNear()) return false;
    F.kitOpen(); return true;
  };
  F.kitOpen = function () {
    F.kitOn = true; F.paused = true; KM.msg = ''; Object.assign(F.in, { fire: false, ads: false, f: 0, b: 0, l: 0, r: 0, sprint: false, press: 0 });
    if (el) { el.innerHTML = html(); el.classList.remove('off'); }
    if (doc && doc.pointerLockElement) doc.exitPointerLock();
    A() && A().local('switch', .6);
  };
  F.kitClose = function () {
    if (!F.kitOn) return; F.kitOn = false; F.paused = false; if (el) el.classList.add('off');
    if (TK.fpsui && TK.fpsui.lock) TK.fpsui.lock();
  };
  /* pasang / lepas: satu per kelompok (optik, magasin, …) — lampiran sekelompok diganti; penuh = tolak dengan pesan */
  F.kitToggle = function (a, w) {
    w = w || 'AR'; const L = K.att[w], lim = F.kitLim().att, i = L.indexOf(a);
    if (i >= 0 && i < lim) { L.splice(i, 1); KM.msg = Tt('f_kit_msg_rm', { a: Tt('f_att_' + a) }); }
    else {
      if (i >= 0) L.splice(i, 1);   // tersimpan tapi tidak aktif di mode ini: naikkan ke depan
      const on = L.slice(0, lim), same = on.find(b => F.ATT[b].g === F.ATT[a].g);
      if (same) { L.splice(L.indexOf(same), 1); KM.msg = Tt('f_kit_msg_swap', { a: Tt('f_att_' + a), b: Tt('f_att_' + same) }); }
      else if (on.length >= lim) { KM.msg = Tt('f_kit_msg_full', { n: lim, d: Tt('w_d' + Q.diff) }); return false; }
      else KM.msg = Tt('f_kit_msg_on', { a: Tt('f_att_' + a) });
      L.unshift(a);
    }
    save(); F.applyKit(true); return true;
  };
  /* pilih / lepas perk (menu kelas) — tersimpan, berlaku mulai terjun berikutnya */
  F.kitPerk = function (p) {
    const lim = F.kitLim().perk, i = K.perks.indexOf(p);
    if (!lim) { KM.pmsg = Tt('f_kit_noperk'); return false; }
    if (i >= 0 && i < lim) { K.perks.splice(i, 1); KM.pmsg = Tt('f_kit_msg_prm', { a: Tt('f_pk_' + p) }); }
    else {
      if (i >= 0) K.perks.splice(i, 1);
      if (K.perks.slice(0, lim).length >= lim) { KM.pmsg = Tt('f_kit_msg_pfull', { n: lim, d: Tt('w_d' + Q.diff) }); return false; }
      K.perks.unshift(p); KM.pmsg = Tt('f_kit_msg_pon', { a: Tt('f_pk_' + p) });
    }
    save(); return true;
  };
  F.perkMsg = m => { if (m !== undefined) KM.pmsg = m; return KM.pmsg; };
  F.kitReset = () => { for (const w in K.att) K.att[w] = []; };   // ganti kelas: lampiran senjata lama dilepas (senjata kelas baru = standar)
  F.kitClear = function () { K.att.AR = []; save(); F.applyKit(true); KM.msg = Tt('f_kit_msg_clear'); };

  /* gambar samping M4A1 (SVG, laras ke kiri seperti foto referensi pengguna): flash hider birdcage, laras bertingkat, front sight
     base + tiang pejera + lug bayonet, quad rail, receiver flat-top + pejera belakang lipat, jendela ejeksi, forward assist,
     magasin USGI melengkung, grip A2, tabung buffer + popor 6 posisi. Hitam bergradasi di latar studio terang; lampiran ikut terpasang */
  function gunSvg(on) {
    const h = a => on.includes(a), M = 'url(#kgM)', Pp = 'url(#kgP)', Bb = 'url(#kgB)', K = '#0b0c0d', E = '#2f3337', opt = h('ACOG') || h('MED') || h('HIGH');
    const R = (x, y, w, hh, f, ex) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" fill="' + f + '"' + (ex || '') + '/>';
    const Pa = (d, f, ex) => '<path d="' + d + '" fill="' + f + '"' + (ex || '') + '/>';
    const teeth = (x0, x1, y, step, w, hh, f) => { let t = ''; for (let x = x0; x <= x1 - w; x += step) t += R(x.toFixed(1), y, w, hh, f); return t; };
    let s = '<svg viewBox="0 0 640 232" class="kt-gun"><defs>' +
      '<linearGradient id="kgBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0ec"/><stop offset="1" stop-color="#b9beb7"/></linearGradient>' +
      '<linearGradient id="kgM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55595d"/><stop offset=".22" stop-color="#2c2f32"/><stop offset=".75" stop-color="#17191b"/><stop offset="1" stop-color="#0b0c0d"/></linearGradient>' +
      '<linearGradient id="kgP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d4043"/><stop offset=".35" stop-color="#1e2022"/><stop offset="1" stop-color="#0a0b0c"/></linearGradient>' +
      '<linearGradient id="kgB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2d30"/><stop offset=".3" stop-color="#686d71"/><stop offset=".55" stop-color="#202224"/><stop offset="1" stop-color="#0a0b0c"/></linearGradient>' +
      '<radialGradient id="kgSh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(0,0,0,.28)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>' +
      R(0, 0, 640, 232, 'url(#kgBg)', ' rx="6"') + '<ellipse cx="330" cy="' + (h('EXT') ? 222 : 212) + '" rx="290" ry="9" fill="url(#kgSh)"/>';
    // ---- popor 6 posisi + tabung buffer ----
    s += R(468, 70, 100, 17, Bb, ' rx="3"') + R(466, 66, 9, 25, M, ' rx="2"') + teeth(467, 476, 64, 3, 1.6, 3, M);
    s += Pa('M528 65 L612 58 Q621 58 621 66 L622 119 Q622 125 616 125 L604 125 Q594 109 574 101 L536 97 Q525 96 525 88 Z', Pp);
    s += Pa('M548 64 L548 98 M566 62 L566 100 M584 61 L586 105', 'none', ' stroke="#2b2e31" stroke-width="2"') + R(590, 67, 13, 5, '#cfd3cc', ' rx="2.5"');
    s += R(613, 59, 10, 66, '#0d0e0f', ' rx="3"') + Pa('M616 63 L616 121 M619 63 L619 121', 'none', ' stroke="#222" stroke-width="1"');
    s += Pa('M534 97 L562 100 L558 107 L536 104 Z', K);   // tuas pengatur popor
    // ---- receiver bawah, pegangan, pelatuk ----
    s += Pa('M342 92 L470 92 L473 101 L463 109 L392 109 L391 121 L353 121 L351 104 L342 104 Z', M);
    s += Pa('M438 106 L463 104 L480 153 Q481 163 471 164 L457 165 Q450 161 449 154 L446 140 Q441 136 444 128 Z', Pp);   // grip A2 dengan lekuk jari
    s += Pa('M452 114 L466 112 M455 124 L470 122 M458 134 L473 132 M461 144 L476 142', 'none', ' stroke="#2a2d30" stroke-width="1.4"');
    s += Pa('M393 109 Q393 128 410 128 L433 126 L437 109', 'none', ' stroke="#141618" stroke-width="3.6"') + Pa('M410 109 Q406 117 412 123', 'none', ' stroke="#141618" stroke-width="2.6" stroke-linecap="round"');
    s += '<circle cx="390" cy="100" r="3.2" fill="#1c1e20" stroke="' + E + '"/><circle cx="441" cy="99" r="4.2" fill="#1c1e20" stroke="' + E + '"/>' + Pa('M441 99 L452 95', 'none', ' stroke="#3d4145" stroke-width="2.4" stroke-linecap="round"');
    s += '<circle cx="348" cy="97" r="2.2" fill="' + E + '"/><circle cx="460" cy="97" r="2.2" fill="' + E + '"/>';   // pin engsel & pin takedown
    // ---- magasin (USGI 30 melengkung · panjang 45 · ganda dilakban) ----
    const mag = (dx, dy, f, long) => Pa(long ? 'M' + (356 + dx) + ' ' + (119 + dy) + ' Q' + (348 + dx) + ' ' + (166 + dy) + ' ' + (322 + dx) + ' ' + (214 + dy) + ' L' + (356 + dx) + ' ' + (227 + dy) + ' Q' + (376 + dx) + ' ' + (172 + dy) + ' ' + (388 + dx) + ' ' + (119 + dy) + ' Z'
      : 'M' + (356 + dx) + ' ' + (119 + dy) + ' Q' + (350 + dx) + ' ' + (154 + dy) + ' ' + (336 + dx) + ' ' + (187 + dy) + ' L' + (369 + dx) + ' ' + (198 + dy) + ' Q' + (378 + dx) + ' ' + (160 + dy) + ' ' + (388 + dx) + ' ' + (119 + dy) + ' Z', f);
    const plate = (dx, long) => Pa(long ? 'M' + (318 + dx) + ' 212 L' + (358 + dx) + ' 227 L' + (356 + dx) + ' 232 L' + (316 + dx) + ' 217 Z' : 'M' + (333 + dx) + ' 185 L' + (371 + dx) + ' 197 L' + (369 + dx) + ' 202 L' + (331 + dx) + ' 190 Z', '#111');
    if (h('DUAL')) s += mag(18, 0, '#34383b', h('EXT')) + plate(18, h('EXT'));   // magasin sebelah (di belakang)
    s += mag(0, 0, Pp, h('EXT')) + plate(0, h('EXT'));
    s += Pa(h('EXT') ? 'M365 124 Q360 168 338 210 M377 124 Q372 170 350 215' : 'M365 124 Q360 154 347 184 M377 124 Q372 156 360 189', 'none', ' stroke="#2c3033" stroke-width="1.6"');
    if (h('DUAL')) s += Pa('M352 140 L408 140 L407 149 L350 149 Z', '#b9a25a', ' opacity=".95"') + Pa('M346 162 L402 162 L400 171 L343 171 Z', '#b9a25a', ' opacity=".95"');   // lakban
    // ---- laras, flash hider / peredam, front sight base ----
    s += R(54, 76.5, 66, 7, Bb) + R(118, 76, 86, 8, Bb);
    if (h('SUP')) s += R(6, 68, 90, 24, Bb, ' rx="5"') + R(14, 68, 3, 24, '#0e0f10') + R(84, 68, 3, 24, '#0e0f10') + R(4, 72, 4, 16, '#111', ' rx="1.5"');
    else { s += R(22, 73, 32, 14, Bb, ' rx="2"'); for (let x = 27; x < 50; x += 7) s += R(x, 73, 4, 5, K); s += R(20, 75, 3, 10, '#111'); }
    s += Pa('M150 90 L150 71 L154 71 L156 47 L171 47 L173 71 L176 71 L176 90 Z', M);   // FSB
    s += R(156, 38, 3.5, 10, M) + R(167.5, 38, 3.5, 10, M) + R(162, 36, 2.4, 12, '#15171a');   // telinga pejera + tiang
    s += R(156, 90, 15, 6, M) + '<circle cx="163" cy="103" r="5.5" fill="none" stroke="#1c1e20" stroke-width="2.4"/>';   // lug bayonet + cincin tali
    // ---- quad rail ----
    s += R(188, 61, 140, 36, M, ' rx="3"') + R(188, 57.5, 140, 5, '#1b1d1f') + teeth(190, 326, 54.5, 7, 4.2, 3.2, M);
    s += R(191, 73, 134, 10, '#141618') + teeth(192, 324, 73, 7, 2, 10, '#33373b');
    s += R(188, 96, 140, 4.5, '#1b1d1f') + teeth(190, 326, 99.5, 7, 4.2, 3.2, M);
    s += R(185, 59, 7, 40, M, ' rx="2"') + R(327, 55, 11, 48, M, ' rx="3"');   // tutup depan + delta ring
    // ---- receiver atas flat-top ----
    s += Pa('M337 58 L452 58 L457 64 L457 92 L337 92 Z', M) + R(337, 52, 116, 6.5, '#1b1d1f') + teeth(339, 452, 49.2, 6.5, 3.8, 3.2, M);
    s += R(392, 69, 35, 11, '#0c0d0e', ' rx="1.5" stroke="#34383c"') + Pa('M394 82 L425 82', 'none', ' stroke="#3a3e42" stroke-width="1.2"');   // jendela ejeksi + penutup debu
    s += R(447, 65, 13, 13, M, ' rx="3.5" stroke="#3a3e42"') + R(450, 53, 13, 6, '#16181a', ' rx="1.5"') + Pa('M428 82 Q436 84 438 90 L428 90 Z', '#16181a');   // forward assist, tuas kokang, penangkis selongsong
    s += Pa('M342 63 L450 63', 'none', ' stroke="rgba(255,255,255,.08)" stroke-width="1.5"');   // kilau tepi atas
    s += opt ? Pa('M429 52 L448 52 L448 47 L431 49 Z', '#16181a') : Pa('M431 52 L434 34 L445 34 L448 52 Z', M) + '<circle cx="439.5" cy="39.5" r="2.4" fill="#cfd3cc"/>' + R(431, 30, 3, 7, M) + R(445, 30, 3, 7, M);   // pejera belakang: lipat bila ada optik
    // ---- lampiran rel & bawah ----
    if (h('GRIP')) s += R(220, 98, 46, 8, '#16181a', ' rx="2"') + Pa('M222 104 L232 104 L248.5 143.8 L257 143.8 L257.6 151.6 L244 151.8 Q242 151 242.3 149.6 Z', Pp) + Pa('M250 104 L258 104 L263.5 150 Q262 152 259 152 L256 152 L255.4 143 L253.6 138 L254 133 L252.4 127 L252.6 122 L251 116 L251.3 110 Z', Pp);   // pegangan loop gaya AUG
    if (h('LASER')) s += '<line x1="0" y1="49" x2="212" y2="49" stroke="#ff3a2a" stroke-width="1.4" opacity=".8"/>' + R(212, 40, 46, 15, '#8a7d5a', ' rx="2.5"') + R(216, 54, 36, 3, '#3a3528') + '<circle cx="216" cy="45" r="2.6" fill="#2a2a2a"/><circle cx="216" cy="51" r="2" fill="#ff5a3a"/>' + R(236, 37, 8, 4, '#6e6347', ' rx="1"');
    if (h('ACOG')) s += R(376, 45, 54, 6, '#16181a') + '<circle cx="386" cy="48" r="3.4" fill="#2d3135" stroke="#555"/><circle cx="420" cy="48" r="3.4" fill="#2d3135" stroke="#555"/>' +
      Pa('M372 21 L381 18 L436 24 L446 27 L446 45 L436 47 L381 52 L372 50 Z', M) + R(364, 18, 11, 35, M, ' rx="2"') + R(446, 28, 11, 17, '#16181a', ' rx="2"') + Pa('M384 20 L432 24.5 L432 27.5 L384 23 Z', '#d63a3a') + R(402, 11, 11, 9, M, ' rx="1.5"') + '<circle cx="409" cy="36" r="5" fill="#1c1e20" stroke="#44484c"/>';
    if (h('MED')) s += R(380, 42, 10, 10, '#16181a') + R(434, 42, 10, 10, '#16181a') + R(362, 33, 104, 12, M, ' rx="5"') + Pa('M350 26 L370 30 L370 48 L350 52 Z', M) + Pa('M455 29 L476 27 L476 51 L455 49 Z', M) + R(400, 21, 13, 12, M, ' rx="2"') + '<circle cx="406" cy="39" r="5" fill="#1c1e20" stroke="#44484c"/>' + R(431, 25, 8, 8, '#16181a', ' rx="2"');
    if (h('HIGH')) s += R(372, 40, 10, 12, '#16181a') + R(442, 40, 10, 12, '#16181a') + R(352, 31, 130, 13, M, ' rx="5"') + Pa('M322 17 L356 25 L356 50 L322 58 Z', M) + R(318, 15, 6, 45, '#16181a', ' rx="2"') + Pa('M470 27 L494 24 L494 52 L470 49 Z', M) + R(398, 15, 16, 16, M, ' rx="2"') + R(402, 11, 8, 5, '#16181a') + '<circle cx="406" cy="38" r="6" fill="#1c1e20" stroke="#44484c"/>';
    return s + '</svg>';
  }
  /* statistik pembanding: dasar (abu) vs dengan lampiran (hijau = lebih baik, merah = lebih buruk) */
  function stats() {
    const b = BASE.AR, d = F.WEAPONS.AR, acc = w => clamp(1 - (w.spread[0] * .55 + w.spread[1] * 3) / 3.2, 0, 1);
    const rows = [['dmg', b.dmg / 40, d.dmg / 40, d.dmg], ['rng', b.rng1 / 700, d.rng1 / 700, Math.round(d.rng1) + ' m'], ['acc', acc(b), acc(d), ''], ['ctl', 1 - b.kick, 1 - d.kick, ''],
      ['mob', b.mv / 1.1, d.mv / 1.1, ''], ['ads', b.ads / 12, d.ads / 12, ''], ['mag', b.mag / 60, d.mag / 60, d.mag], ['rel', 1 - b.rel / 4, 1 - d.rel * (d.dual ? (1 + d.dual) / 2 : 1) / 4, (d.dual ? (d.rel * d.dual).toFixed(2) + ' / ' : '') + d.rel.toFixed(2) + ' s'], ['zoom', (1 / b.zoom) / 12, (1 / d.zoom) / 12, (1 / d.zoom).toFixed(1) + '×']];
    return rows.map(([k, v0, v1, t]) => {
      const a = clamp(Math.min(v0, v1), 0, 1) * 100, c = clamp(Math.max(v0, v1), 0, 1) * 100, up = v1 > v0 + 1e-4, dn = v1 < v0 - 1e-4;
      return '<div class="kt-st"><span>' + Tt('f_ks_' + k) + '</span><div class="kt-bar"><i style="width:' + a.toFixed(1) + '%"></i>' + (up || dn ? '<i class="' + (up ? 'up' : 'dn') + '" style="left:' + a.toFixed(1) + '%;width:' + (c - a).toFixed(1) + '%"></i>' : '') + '</div><b>' + t + '</b></div>';
    }).join('');
  }
  function html() {
    const lim = F.kitLim(), on = F.attOn('AR'), dn = Tt('w_d' + Q.diff), wn = (F.WNAME[TK.S && TK.S.doc] || F.WNAME.tni).AR;
    const cards = F.ATT_FOR.AR.map(a => {
      const st = on.includes(a) ? 'on' : K.att.AR.includes(a) ? 'idle' : '', grp = on.find(b => b !== a && F.ATT[b].g === F.ATT[a].g);
      return '<div class="kt-card ' + st + '" data-a="' + a + '"><b>' + Tt('f_att_' + a) + '</b><small>' + Tt('f_attd_' + a) + '</small><em>' +
        (st === 'on' ? Tt('f_kit_on') : st === 'idle' ? Tt('f_kit_idle') : grp ? Tt('f_kit_swap', { b: Tt('f_att_' + grp) }) : on.length >= lim.att ? Tt('f_kit_fullc') : Tt('f_kit_add')) + '</em></div>';
    }).join('');
    const cls = P.cls && P.cls.pri !== 'AR' ? '<div class="kt-note">' + Tt('f_kit_cls') + '</div>' : '';
    return '<div class="fm-box kt"><div class="fm-head"><div><h2>' + Tt('f_kit_title') + '</h2><small>' + Tt('f_kit_sub') + '</small></div><div class="fm-rank">' + Tt('f_kit_mode', { d: dn }) +
      '<br><b>' + on.length + '/' + lim.att + '</b> ' + Tt('f_kit_att_n') + '</div></div>' +
      '<div class="fm-cols"><div class="fm-col"><h3>' + wn + ' · ' + Tt('f_kit_att_h') + '</h3>' + cls + '<div class="kt-grid">' + cards + '</div><div class="fm-btns"><button data-x="clear" class="red">' + Tt('f_kit_clear') + '</button></div></div>' +
      '<div class="fm-col"><h3>' + Tt('f_kit_prev') + '</h3>' + gunSvg(on) + '<div class="kt-chips">' + (on.length ? on.map(a => '<span>' + Tt('f_att_' + a) + '</span>').join('') : '<span class="none">' + Tt('f_kit_none') + '</span>') + '</div><h3>' + Tt('f_kit_stats') + '</h3>' + stats() +
      '<div class="kt-note">' + Tt('f_kit_pk_where') + '</div></div></div>' +
      '<div class="fm-foot"><div class="ar-msg">' + String(KM.msg).replace(/</g, '&lt;') + '</div><button class="fm-go" data-x="close">' + Tt('f_kit_close') + '</button><small>' + Tt('f_kit_foot') + '</small></div></div>';
  }
  /* bagian PERK di menu PILIH KELAS (fps-ui menuHTML): kartu data-pk, kliknya ditangani di sana */
  F.perkHTML = function () {
    const lim = F.kitLim(), sel = F.perksSel(), dn = Tt('w_d' + Q.diff);
    const cards = F.PERKS.map(p => {
      const st = sel.includes(p) ? 'on' : K.perks.includes(p) ? 'idle' : '';
      return '<div class="kt-card perk ' + st + (lim.perk ? '' : ' lock') + '" data-pk="' + p + '"><b>' + Tt('f_pk_' + p) + '</b><small>' + Tt('f_pkd_' + p) + '</small><em>' +
        (!lim.perk ? Tt('f_kit_plock') : st === 'on' ? Tt('f_kit_pon') : st === 'idle' ? Tt('f_kit_idle') : sel.length >= lim.perk ? Tt('f_kit_fullc') : Tt('f_kit_padd')) + '</em></div>';
    }).join('');
    return '<h3>' + Tt('f_kit_perk_h') + ' · ' + sel.length + '/' + lim.perk + ' · ' + Tt('f_kit_mode', { d: dn }) + '</h3>' +
      '<div class="kt-note">' + Tt(lim.perk ? 'f_kit_pk_when' : 'f_kit_noperk') + '</div><div class="kt-grid pk">' + cards + '</div>';   // pesan pilih perk (F.perkMsg) tampil di kaki menu kelas
  };
  function render() {
    if (!el) return; const box = el.querySelector('.fm-box'), keep = box ? box.scrollTop : 0;
    el.innerHTML = html(); const b2 = el.querySelector('.fm-box'); if (b2) b2.scrollTop = keep;
  }
  if (el) el.addEventListener('click', e => {
    const t = e.target.closest('[data-a],[data-x]'); if (!t) return;
    const d = t.dataset;
    if (d.x === 'close') { F.kitClose(); return; }
    if (d.x === 'clear') F.kitClear();
    else if (d.a) { if (F.kitToggle(d.a)) A() && A().local('reload', .5); else A() && A().local('empty', .5); }
    A() && A().local('ui', .5); render();
  });

  /* ---------- VULTURE: paket amunisi + obat dari musuh yang dibunuh operator ---------- */
  F.drops = [];
  F.vultureDrop = function (u) {
    if (F.drops.length > 30) F.drops.shift();
    F.drops.push({ x: u.x + rand(-.6, .6), y: u.y + rand(-.6, .6), t: 0, yaw: rand(0, 6.28) });
  };
  function pickup(d) {
    const V = F.PERK.vult, u = P.unit;
    for (const w of P.w) { if (!w) continue; const wd = F.WEAPONS[w.id]; w.res = Math.min(w.res + wd.mag * V.mags, wd.res * 2); }
    if (P.cls) P.gren = Math.min(P.gren + V.gren, P.cls.gren + 1);
    u.hp = Math.min(u.hpMax, u.hp + V.hp);
    F.msg(Tt('f_vult'), 'g'); A() && A().local('reload', .7);
    if (F.puff) F.puff(d.x, d.y, F.hAt(d.x, d.y) + .3, 3, [200, 220, 200], .6);
  }

  /* ---------- tiap frame (dipanggil F.update) ---------- */
  F.kitTick = function (dt) {
    fresh();
    const b = F.bench(); F.sprops = b ? [b.a] : [];
    if ((Q.diff + '|' + F.attOn().join() + '|' + F.perksOn().join()) !== sig) F.applyKit(false);   // tingkat kesulitan berganti: batas berubah
    const V = F.PERK.vult;
    for (let i = F.drops.length - 1; i >= 0; i--) {
      const d = F.drops[i]; d.t += dt;
      if (d.t > V.life) { F.drops.splice(i, 1); continue; }
      if (P.alive && !P.veh && !P.mnt && Math.hypot(P.x - d.x, P.y - d.y) < V.r && Math.abs(P.z - F.hAt(d.x, d.y)) < 3) { F.drops.splice(i, 1); pickup(d); }
    }
  };
})();
