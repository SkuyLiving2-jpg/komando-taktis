/* ============================================================
   FPS-UI — input (mouse/keyboard/pointer lock), HUD ala CoD,
   menu pilih kelas & titik masuk, jeda, papan skor, bantuan
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, R = F.R, W = TK.WAR, UT = W.UT, war = TK.war, Q = war.Q, S = TK.S, VM = TK.fpsvm;
  const $ = s => document.querySelector(s), Tt = (k, v) => TK.t(k, v), A = () => TK.fpsaudio, { clamp, wrapPi, pad } = TK.util;
  const cv = $('#fps'), ctx = cv.getContext('2d'), stage = $('#stage'), menuEl = $('#fpsmenu'), pauseEl = $('#fpspause');
  const armyEl = document.createElement('div'); armyEl.id = 'fpsarmy'; armyEl.className = 'fmenu off'; pauseEl.parentNode.appendChild(armyEl);
  const U = TK.fpsui = { active: false };
  /* kait ke aplikasi induk: versi lengkap (index.html) memakai tombol WARZONE; edisi offline (play.html) menggantinya dengan layar menu sendiri */
  U.host = {
    doc: id => { const d = $('#docsw button[data-doc=' + id + ']'); if (d) d.click(); },
    back: () => { const b = $('button[data-view=war]'); if (b) b.click(); },
    restart: () => { const b = $('#wrestart'); if (b) b.click(); },
    overHint: true, backKey: 'f_back'
  };
  const CMD_O = ['follow', 'hold', 'goto', 'free', 'board', 'unboard'];   // tombol 5-9 & 0 di panel [Z]
  const M = { cls: 'ASSAULT', at: 'hq', i: 0, tod: 'DAY', started: false, locked: false, noLock: false, pause: false, ci: false, sb: false, army: false, cmd: false, grp: 'ALL', arN: 1, arMsg: '', pTab: 'g', tpSig: '', arTab: 'rec', arCat: 'INF', taSig: '', menuSig: '', tick: 0, aimT: 0, aim: null, lockFails: 0, los: new Map(), losT: 0, hint: 0 };
  let CW = 800, CH = 500, dpr = 1, lastCam = null;
  const esc = s => String(s).replace(/</g, '&lt;');
  try { const sv = JSON.parse(localStorage.getItem('tk_fps_menu') || 'null'); if (sv) { if (F.CLASSES.some(c => c.id === sv.cls)) M.cls = sv.cls; if (F.TOD[sv.tod]) { M.tod = sv.tod; P.tod = sv.tod; } } } catch (e) { /* ok */ }
  const FONT = '"Consolas","Menlo","Roboto Mono","Lucida Console",monospace';   // HP: Menlo (iOS) / Roboto Mono (Android), bukan Courier New
  const SANS = '"BC","Bahnschrift","DIN Alternate","Segoe UI","Arial Narrow",Arial,sans-serif';   // HUD infanteri bergaya Black Ops Cold War
  try { if (document.fonts) for (const w of ['500', '700']) document.fonts.load(w + ' 16px BC'); } catch (e) { /* tanpa FontFace API: jatuh ke font sistem */ }
  let HF = FONT;   // font aktif text(): monospace untuk layar militer (AC-130, drone, heli), sans untuk HUD infanteri

  /* ---------------- UKURAN ---------------- */
  function resize() {
    dpr = Math.min(U.touch ? 2 : [1, 1.25, 2][F.opts.quality] || 1.25, window.devicePixelRatio || 1); CW = stage.clientWidth; CH = stage.clientHeight; MM.r = U.touch ? 74 : 92; if (CW < 50) return;   // HP: minimap lebih ringkas; kanvas HUD tidak perlu lebih tajam dari kualitasnya; HP: tetap 2× agar teks HUD tajam (dunia 3D dirender terpisah pada resolusinya sendiri lalu diskalakan)
    cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; const w = Math.round(CW * dpr), h = Math.round(CH * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    R.resize(CW, CH);
  }

  /* ---------------- MENU PILIH KELAS ---------------- */
  const wn = id => (F.WNAME[S.doc] || F.WNAME.tni)[id];
  function menuHTML() {
    if (!U.oldUI) return tmMenuHTML();   // tampilan modern: HP, tablet & laptop (U.oldUI = menu lama, uji)
    const rk = F.rank(), nxt = F.RANKS[rk + 1], cur = F.RANKS[rk], pct = nxt ? clamp((F.xp - cur) / (nxt - cur), 0, 1) * 100 : 100;
    const cls = F.CLASSES.map(c => '<div class="fm-card' + (M.cls === c.id ? ' on' : '') + '" data-cls="' + c.id + '"><b>' + Tt('f_cls_' + c.id) + '</b><small>' + wn(c.pri) + ' · ' + wn(c.sec) + ' · ' + c.gren + '× ' + wn('FRAG') + '</small><em>' + Tt('f_cd_' + c.id) + '</em><span class="ab"><b>' + (U.touch ? '' : '[F] ') + Tt('f_ab_' + c.ab.id) + '</b> — ' + Tt('f_abd_' + c.ab.id) + '</span><span class="ps">' + Tt('f_ps_' + c.id) + '</span>' +
      '<div class="st">' + ['dmg', 'rng', 'mob', 'hp'].map((k, i) => '<span>' + Tt('f_st_' + k) + '<i><u style="width:' + c.st[i] * 20 + '%"></u></i></span>').join('') + '</div></div>').join('');
    const own = o => o.owner === 'B' ? 'B' : o.owner === 'R' ? 'R' : 'N';
    let sp = '<div class="fm-g">' + Tt('f_sp_grp1') + '</div><div class="fm-sp"><div class="fm-opt' + (M.at === 'hq' ? ' on' : '') + '" data-at="hq" data-i="0">' + Tt('f_sp_hq') + '</div>' +
      Q.objs.map((o, i) => o.owner === 'B' ? '<div class="fm-opt' + (M.at === 'obj' && M.i === i ? ' on' : '') + '" data-at="obj" data-i="' + i + '">' + Tt('f_sp_obj', { o: o.name }) + '</div>' : '').join('') + '</div>' +
      '<div class="fm-g">' + Tt('f_sp_grp2') + '</div><div class="fm-sp">' + Q.objs.map((o, i) => '<div class="fm-opt own' + own(o) + (M.at === 'drop' && M.i === i ? ' on' : '') + '" data-at="drop" data-i="' + i + '">' + Tt('f_sp_drop', { o: o.name }) + ' <i>' + Tt('w_own_' + o.owner) + '</i></div>').join('') + '</div>';
    const tod = ['DAY', 'DUSK', 'NIGHT'].map(t => '<div class="fm-opt' + (M.tod === t ? ' on' : '') + '" data-tod="' + t + '">' + Tt('f_tod_' + t) + '</div>').join('');
    return '<div class="fm-box"><div class="fm-head"><div><h2>' + Tt('f_title') + '</h2><small>' + Tt('f_sub') + '</small></div><div class="fm-rank">' + Tt('f_rank') + ' <b>' + Tt('f_rank_' + rk) + '</b> · ' + F.xp + ' ' + Tt('f_xp') + '<div class="bar"><i style="width:' + pct + '%"></i></div></div></div>' +
      '<div class="fm-cols"><div class="fm-col"><h3>' + Tt('f_h_cls') + '</h3><div class="fm-cls">' + cls + '</div></div><div class="fm-col"><h3>' + Tt('f_h_spawn') + '</h3>' + sp + '<h3>' + Tt('f_h_tod') + '</h3><div class="fm-sp">' + tod + '</div>' +
      (F.perkHTML ? F.perkHTML() : '') + '</div></div>' +   // perk (fps-kit) dipilih bersama kelas
      '<div class="fm-foot">' + (F.perkMsg && F.perkMsg() ? '<div class="ar-msg">' + esc(F.perkMsg()) + '</div>' : '') + '<button class="fm-go" id="fmgo">' + Tt('f_deploy') + '</button>' + (M.mid ? '<button class="fm-back" id="fmback">' + Tt('tc_back') + '</button>' : '') + (M.mid ? '<small class="mid">' + Tt('f_cls_mid') + '</small>' : '') + '<small>' + Tt(U.touch ? 'pl_hint_tc' : 'f_deploy_hint') + '</small>' + (U.touch ? '' : '<small class="ctl">' + Tt('f_ctl_t') + '</small>') + '</div></div>';
  }
  /* ---------- menu kelas versi HP (layar sentuh): gaya "loadout" — daftar kelas bergambar senjata di kiri, panel detail kelas
     terpilih di kanan (senjata, statistik, kemampuan, pasif, titik masuk, waktu, perk), tombol TERJUN menempel di pojok kanan bawah ---------- */
  /* siluet senjata utama (viewBox 0 0 240 72, moncong ke kanan), mengikuti foto rujukan pengguna:
     M4A1 (popor CAR, rel RIS, menara pejera depan), SIG MPX (popor lipat, pelindung tangan M-LOK panjang, kompensator), senapan runduk bolt-action (teropong + bipod),
     M60 (sabuk peluru menjuntai, pegangan angkut, bipod depan), Benelli M4 (bodi cokelat-pasir, tabung magasin), AK-12 (perabot hijau, magasin melengkung, sangkur).
     tiap bagian: m = logam gelap, a = perabot berwarna, w = bilah sangkur, b = sabuk peluru (garis) */
  const GUN = {
    AR: [['m', 'M4 21h5v30H4zM9 22l37 3v8l-17 2-10 14H9z'], ['m', 'M40 26h22v7H40z'], ['m', 'M60 21h56v10H60z'], ['m', 'M64 17h50v4H64z'], ['m', 'M100 17v-6h3v3h3v-3h3v6z'], ['m', 'M55 22h6v4h-6z'],
      ['m', 'M62 31h52v9H62zM98 40h16v5H98z'], ['m', 'M74 40h12l-4 22H71z'], ['m', 'M85 40h14v11H89q-4 0-4-4zM88 40h8v8h-5q-3 0-3-3zM91 41h2l1 5h-2z'], ['m', 'M99 45h14l1 6q2 9 6 16l-13 4q-5-9-8-20z'],
      ['m', 'M116 20h52v18h-52zM121 25h9v2.5h-9zM134 25h9v2.5h-9zM147 25h9v2.5h-9zM121 31h9v2.5h-9zM134 31h9v2.5h-9zM147 31h9v2.5h-9z'], ['m', 'M168 30l3-15h5l4 15zM172 15v-5h3v5zM170 32h10v5h-10z'],
      ['m', 'M168 27h52v5h-52z'], ['m', 'M220 25h13v9h-13zM223 27h7v1.6h-7zM223 30.4h7v1.6h-7z']],
    SMG: [['m', 'M4 20h7v28H4zM11 21l34 3v10H28l-8 12-9 1zM16 27l21 1.5v2.5H19z'], ['m', 'M45 21h66v17H45z'], ['m', 'M48 17h157v3H48z'], ['m', 'M72 38h12l-4 22H69z'],
      ['m', 'M83 38h14v11H87q-4 0-4-4zM86 38h8v8h-5q-3 0-3-3zM89 39h2l1 5h-2z'], ['m', 'M95 38h11l2 14q1 8 4 14l-11 2q-3-7-5-15z'],
      ['m', 'M111 20h94v14h-94zM117 24h12v3h-12zM133 24h12v3h-12zM149 24h12v3h-12zM165 24h12v3h-12zM181 24h12v3h-12zM117 29h12v2h-12zM133 29h12v2h-12zM149 29h12v2h-12zM165 29h12v2h-12zM181 29h12v2h-12z'],
      ['m', 'M205 21h20v12h-20zM209 23.5h3v7h-3zM215 23.5h3v7h-3z'], ['m', 'M104 17v-5h6v5zM196 17v-5h5v5z']],
    SNIPER: [['m', 'M4 18q8-2 16 2l40 9 112 2v8l-74 3-8 2q-6 2-8 10H68q0-8-6-12H44L10 48q-6 0-6-4z'], ['m', 'M70 25h56v6H70z'], ['m', 'M86 31l-7 9 3 2 8-10z'], ['m', 'M75 40a4 4 0 1 0 8 0a4 4 0 1 0-8 0z'],
      ['m', 'M88 44q2 8 10 8h4v-3h-4q-6 0-6-5z'], ['m', 'M126 28h104v3.5H126zM226 27h10v5.5h-10z'], ['m', 'M82 13h68v6H82zM64 10l18 3v6L64 21zM150 13l18-4v16l-18-6zM108 7h9v6h-9z'], ['m', 'M92 19h7v7h-7zM132 19h7v7h-7z'],
      ['m', 'M146 39h10v4h-10zM147 42l-11 25 3 1 12-25zM155 42l12 25-3 1-12-25z']],
    LMG: [['b', 'M110 40q4 14-2 21q-6 7-17 5'], ['m', 'M4 19h4l46 9v12L8 52H4z'], ['m', 'M54 24h78v16H54z'], ['m', 'M90 24l3-6h33l4 6z'], ['m', 'M84 24v-9h5v9z'], ['m', 'M68 40h12l-4 21H65z'],
      ['m', 'M79 40h14v11H83q-4 0-4-4zM82 40h8v8h-5q-3 0-3-3zM85 41h2l1 5h-2z'], ['m', 'M132 26h30v14h-30zM136 29h2v8h-2zM142 29h2v8h-2zM148 29h2v8h-2zM154 29h2v8h-2z'], ['m', 'M162 27h62v4.5h-62z'], ['m', 'M162 32h34v4h-34z'],
      ['m', 'M146 26l2-9h22l2 9h-3l-2-6h-16l-2 6z'], ['m', 'M212 27l1-7h3l1 7z'], ['m', 'M224 26l12-1v9l-12-1z'], ['m', 'M190 35l-12 31 4 1 12-30zM198 35l13 31-4 1-12-30zM174 65h10v3h-10zM206 65h10v3h-10z']],
    SHOTGUN: [['m', 'M4 22q2-2 6-2l38 8v8H26l-14 16H6q-2 0-2-2zM14 30l24 1.5-11 11.5h-9z'], ['m', 'M50 36h13l-5 24H47z'], ['a', 'M56 24h54v16H56z'], ['m', 'M60 20h46v4H60zM98 20v-6h8v6z'],
      ['m', 'M65 40h14v11H69q-4 0-4-4zM68 40h8v8h-5q-3 0-3-3zM71 41h2l1 5h-2z'], ['a', 'M110 25h118v6H110z'], ['a', 'M110 32h88v6h-88z'], ['m', 'M114 30h40v10q-1 2-5 2h-29q-6 0-6-3z'], ['a', 'M198 31h6v8h-6z'], ['m', 'M186 25h5v13h-5z'], ['m', 'M218 25l2-6h4l1 6z']],
    AK: [['m', 'M4 19h9l34 6v9H24l-11 12H4zM13 25l26 4v2H18l-5 6z'], ['m', 'M47 24h76v14H52l-5-4z'], ['m', 'M50 20h126v4H50z'], ['m', 'M58 20v-5h6v5z'], ['a', 'M68 38h12l-1 4q-4 10-1 20H66q-3-12 2-24z'],
      ['m', 'M79 38h14v11H83q-4 0-4-4zM82 38h8v8h-5q-3 0-3-3zM85 39h2l1 5h-2z'], ['a', 'M92 38h16q2 15 15 26l-11 8Q95 58 92 38z'], ['a', 'M123 24h54v14h-54zM128 28h10v2h-10zM142 28h10v2h-10zM156 28h10v2h-10zM128 33h10v2h-10zM142 33h10v2h-10zM156 33h10v2h-10z'],
      ['m', 'M177 22l2-8h5l2 8v14h-9z'], ['m', 'M186 28h20v4h-20zM206 26h12v8h-12z'], ['m', 'M180 36h24v5h-24zM204 30h4v12h-4z'], ['w', 'M208 35h22l10-2q-3 6-10 8h-22z']]
  };
  const GCOL = { SHOTGUN: ['#ead2a4', '#b8956a', '#76603f'], AK: ['#b6d08a', '#7d9a55', '#4b5f30'] };
  const grad = (id, c) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset=".45" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></linearGradient>';
  const gunSvg = (id, big) => {
    const P = GUN[id] || GUN.AR, ac = GCOL[id];
    const defs = big ? '<defs>' + grad('tmGm' + id, ['#f1f7f2', '#b9cbbe', '#5f7266']) + grad('tmGa' + id, ac || ['#f1f7f2', '#b9cbbe', '#5f7266']) + grad('tmGw' + id, ['#ffffff', '#dfe7ea', '#8e9ca2']) + '</defs>' : '';
    return '<svg viewBox="0 0 240 72" aria-hidden="true">' + defs + P.map(([t, d]) => t === 'b'
      ? '<path d="' + d + '" style="fill:none;stroke:' + (big ? '#d9b25a' : 'currentColor') + ';stroke-width:7' + (big ? ';stroke-dasharray:2.2 1' : '') + '"/>'
      : '<path fill-rule="evenodd" d="' + d + '"' + (big ? ' style="fill:url(#tmG' + t + id + ')" stroke="rgba(255,255,255,.3)" stroke-width=".5"' : '') + '/>').join('') + '</svg>';
  };
  function tmMenuHTML() {
    const rk = F.rank(), nxt = F.RANKS[rk + 1], cur = F.RANKS[rk], pct = nxt ? clamp((F.xp - cur) / (nxt - cur), 0, 1) * 100 : 100;
    const C = F.CLASSES.find(c => c.id === M.cls) || F.CLASSES[0];
    const list = F.CLASSES.map((c, i) => '<button class="tm-c' + (c === C ? ' on' : '') + '" data-cls="' + c.id + '" style="--d:' + i + '"><span class="tm-g">' + gunSvg(c.pri) + '</span><b>' + Tt('f_cls_' + c.id) + '</b><small>' + wn(c.pri) + '</small></button>').join('');
    const seg = v => '<i>' + [1, 2, 3, 4, 5].map(k => '<u' + (k <= v ? ' class="f"' : '') + ' style="--k:' + k + '"></u>').join('') + '</i>';
    const own = o => o.owner === 'B' ? 'B' : o.owner === 'R' ? 'R' : 'N';
    const sp = '<div class="tm-chips"><div class="fm-opt' + (M.at === 'hq' ? ' on' : '') + '" data-at="hq" data-i="0">' + Tt('f_sp_hq') + '</div>' +
      Q.objs.map((o, i) => o.owner === 'B' ? '<div class="fm-opt' + (M.at === 'obj' && M.i === i ? ' on' : '') + '" data-at="obj" data-i="' + i + '">' + Tt('f_sp_obj', { o: o.name }) + '</div>' : '').join('') +
      Q.objs.map((o, i) => '<div class="fm-opt own' + own(o) + (M.at === 'drop' && M.i === i ? ' on' : '') + '" data-at="drop" data-i="' + i + '">' + Tt('f_sp_drop', { o: o.name }) + ' <i>' + Tt('w_own_' + o.owner) + '</i></div>').join('') + '</div>';
    const tod = '<div class="tm-seg">' + ['DAY', 'DUSK', 'NIGHT'].map(t => '<div class="fm-opt' + (M.tod === t ? ' on' : '') + '" data-tod="' + t + '">' + Tt('f_tod_' + t) + '</div>').join('') + '</div>';
    return '<div class="fm-box tm"><div class="tm-top"><div class="tm-ttl"><i></i><div><b>' + Tt('f_h_cls') + '</b><small>' + opName() + ' · ' + Tt('w_d' + (Q.diff || 0)) + '</small></div></div>' +
      '<div class="tm-rank"><span>' + Tt('f_rank_' + rk) + '</span><em>' + F.xp + ' ' + Tt('f_xp') + '</em><div class="bar"><i style="width:' + pct + '%"></i></div></div></div>' +
      '<div class="tm-main"><div class="tm-list">' + list + '</div>' +
      '<div class="tm-det" data-k="' + C.id + '"><div class="tm-hero"><div class="tm-big">' + gunSvg(C.pri, true) + '</div><div class="tm-name"><em>' + Tt('f_tm_cls') + '</em><h2>' + Tt('f_cls_' + C.id) + '</h2><p>' + Tt('f_cd_' + C.id) + '</p></div></div>' +
      '<div class="tm-stats">' + ['dmg', 'rng', 'mob', 'hp'].map((k, i) => '<span><em>' + Tt('f_st_' + k) + '</em>' + seg(C.st[i]) + '</span>').join('') + '</div>' +
      '<div class="tm-kit"><div><em>' + Tt('f_tm_pri') + '</em><b>' + wn(C.pri) + '</b></div><div><em>' + Tt('f_tm_sec') + '</em><b>' + wn(C.sec) + '</b></div><div><em>' + Tt('f_tm_gren') + '</em><b>' + C.gren + '× ' + wn('FRAG') + '</b></div></div>' +
      '<div class="tm-ab"><em>' + Tt('f_tm_ab') + '</em><b>' + Tt('f_ab_' + C.ab.id) + '</b><span>' + Tt('f_abd_' + C.ab.id) + '</span></div>' +
      '<div class="tm-ps"><em>' + Tt('f_tm_ps') + '</em><span>' + Tt('f_ps_' + C.id) + '</span></div>' +
      '<h3>' + Tt('f_h_spawn') + '</h3>' + sp + '<h3>' + Tt('f_h_tod') + '</h3>' + tod + (F.perkHTML ? F.perkHTML() : '') + '</div></div>' +
      '<div class="tm-foot">' + (F.perkMsg && F.perkMsg() ? '<div class="ar-msg">' + esc(F.perkMsg()) + '</div>' : '') + (M.mid ? '<small class="mid">' + Tt('f_cls_mid') + '</small><button class="fm-back" id="fmback">' + Tt('tc_back') + '</button>' : '') +
      '<div class="tm-sum"><span><em>' + Tt('f_tm_cls') + '</em>' + Tt('f_cls_' + C.id) + '</span><span><em>' + Tt('f_h_spawn') + '</em>' + (M.at === 'hq' ? Tt('f_sp_hq') : M.at === 'obj' ? Tt('f_sp_obj', { o: (Q.objs[M.i] || {}).name || '' }) : Tt('f_sp_drop', { o: (Q.objs[M.i] || {}).name || '' })) + '</span><span><em>' + Tt('f_h_tod') + '</em>' + Tt('f_tod_' + (M.tod || 'DAY')) + '</span></div>' +
      '<button class="fm-go" id="fmgo"><span>' + Tt('f_deploy') + '</span><i></i></button></div></div>';
  }

  /* ---------- layar memuat: kartu operasi (nama sandi, peta sektor, sasaran, tips) lalu memudar ke menu kelas ----------
     Medan 3D dibangun sinkron (±1–4 dtk di HP), jadi semua gerak di layar ini memakai animasi CSS transform/opacity yang tetap
     berjalan di thread compositor walau JavaScript sedang sibuk membangun dunia. */
  function opName() { const s = Math.abs((Q.g && Q.g.seed) | 0) || 7, a = Tt('f_ld_a').split('|'), b = Tt('f_ld_b').split('|'); return Tt('f_ld_op') + ' ' + a[s % a.length] + ' ' + b[Math.floor(s / 13) % b.length]; }
  F.opName = opName;
  U.loadShow = () => loadShow(); U.loadDone = () => loadDone();   // dipakai uji tampilan
  let ldEl = null, ldT0 = 0;
  function loadShow() {
    if (!ldEl) { ldEl = document.createElement('div'); ldEl.id = 'fpsload'; stage.appendChild(ldEl); }
    const g = Q.g, sec = String(g.seed).padStart(5, '0').slice(-5), tips = Tt('f_ld_tips').split('|'), steps = Tt('f_ld_steps').split('|');
    ldEl.className = 'fl'; ldT0 = performance.now();
    ldEl.innerHTML = '<div class="fl-bgw"><canvas class="fl-map"></canvas></div><div class="fl-shade"></div><div class="fl-scan"></div>' +
      '<div class="fl-c"><div class="fl-tag"><i></i>' + Tt('f_ld_brief') + ' · ' + Tt('f_ld_sec', { n: sec }) + '</div>' +
      '<h1>' + opName().split(' ').map((w, i) => '<span style="--d:' + i + '">' + w + '</span>').join(' ') + '</h1>' +
      '<div class="fl-meta"><span class="fl-dif">' + Tt('w_d' + (Q.diff || 0)) + '</span><span>' + Q.objs.length + ' POS</span><span>' + Tt('f_tod_' + (M.tod || 'DAY')) + '</span></div>' +
      '<div class="fl-goal"><em>' + Tt('f_ld_goal') + '</em>' + Tt('f_ld_obj').split('|').map((t, i) => '<div style="--d:' + i + '"><i></i>' + t + '</div>').join('') + '</div></div>' +
      '<div class="fl-bot"><div class="fl-tip"><b>' + Tt('f_ld_tip') + '</b>' + esc(tips[Math.floor(Math.random() * tips.length)]) + '</div>' +
      '<div class="fl-prog"><div class="fl-ring"></div><div class="fl-st"><div class="fl-tk" style="--n:' + steps.length + '">' + steps.map(s => '<span>' + s + '</span>').join('') + '<span class="ok">' + Tt('f_ld_ready') + '</span></div></div></div>' +
      '<div class="fl-bar"><i></i></div></div>';
    try {   // peta sektor sebagai latar (medan warzone + pos), perlahan diperbesar
      const cv = ldEl.querySelector('.fl-map'), T = TK.warTerrain && TK.warTerrain.build(g), w = 900, h = Math.round(900 * W.WH / W.WW);
      cv.width = w; cv.height = h; const c = cv.getContext('2d'); if (T) c.drawImage(T, 0, 0, w, h);
      const k = w / W.WW; c.lineWidth = 2;
      for (const o of Q.objs) { c.strokeStyle = o.owner === 'R' ? 'rgba(255,90,70,.9)' : 'rgba(220,235,220,.8)'; c.beginPath(); c.arc(o.x * k, o.y * k, 10, 0, 6.3); c.stroke(); }
      for (const [u, col] of [[Q.hqB, '#3dff7a'], [Q.hqR, '#ff5a46']]) { c.fillStyle = col; c.fillRect(u.x * k - 7, u.y * k - 7, 14, 14); }
    } catch (e) { /* tanpa peta latar */ }
  }
  function loadDone() {
    if (!ldEl) return; const el = ldEl;
    setTimeout(() => { el.classList.add('done'); setTimeout(() => { el.classList.add('out'); setTimeout(() => { if (el.classList.contains('out')) { el.className = 'fl off'; el.innerHTML = ''; } }, 700); }, 520); }, Math.max(0, 2200 - (performance.now() - ldT0)));
  }

  function showMenu() {
    if (Q.over) return;
    if (!Q.objs.some(o => o.owner === 'B') && M.at === 'obj') { M.at = 'hq'; }
    menuEl.classList.remove('off'); pauseEl.classList.add('off'); M.menuSig = ''; M.tmFresh = true; menuEl.classList.toggle('tmm', !U.oldUI); renderMenu(); F.in.fire = F.in.ads = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function renderMenu() {   // posisi gulir dipertahankan (menu kelas + perk bisa lebih tinggi dari layar)
    const h = menuHTML(); if (h === M.menuSig) return; M.menuSig = h;
    const SEL = ['.fm-box', '.tm-list', '.tm-det'], keep = SEL.map(s => { const e = menuEl.querySelector(s); return e ? e.scrollTop : 0; }), d0 = menuEl.querySelector('.tm-det'), same = d0 && d0.dataset.k === M.cls;
    menuEl.innerHTML = h;
    SEL.forEach((s, i) => { const e = menuEl.querySelector(s); if (e && (i < 2 || same)) e.scrollTop = keep[i]; });
    if (M.tmFresh) M.tmFresh = false; else menuEl.querySelectorAll('.tm-c').forEach(e => e.classList.add('still'));   // daftar kelas hanya beranimasi saat menu dibuka
    if (same) { const d = menuEl.querySelector('.tm-det'); if (d) d.classList.add('still'); }   // panel detail beranimasi hanya saat kelas berganti
  }
  function menuPick(e) {
    const c = e.target.closest('[data-cls]'), a = e.target.closest('[data-at]'), t = e.target.closest('[data-tod]'), g = e.target.closest('#fmgo'), pk = e.target.closest('[data-pk]');
    if (e.target.closest('#fmback')) { clsClose(); return; }   // kembali bertempur tanpa perubahan (layar sentuh tidak punya K / ESC)
    if (c) { M.cls = c.dataset.cls; A() && A().local('ui', .6); } else if (a) { M.at = a.dataset.at; M.i = +a.dataset.i; A() && A().local('ui', .6); } else if (t) { M.tod = t.dataset.tod; P.tod = M.tod; }
    else if (pk) { if (F.kitPerk(pk.dataset.pk)) A() && A().local('ui', .8); else A() && A().local('empty', .5); }
    else if (g) { deploy(); return; } else return;
    renderMenu();
  }
  menuEl.addEventListener('mousedown', e => { if (!U.touch) menuPick(e); });   // mouse: langsung saat ditekan
  menuEl.addEventListener('click', e => { if (U.touch) menuPick(e); });          // sentuh: saat diketuk (geser jari = gulir menu, bukan memilih)
  function deploy() {
    if (A()) A().init();
    M.started = true; M.mid = false; if (F.perkMsg) F.perkMsg(''); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    P.tod = M.tod; F.spawn({ cls: M.cls, at: M.at, i: M.i, tod: M.tod }); R.motionClear();
    try { localStorage.setItem('tk_fps_menu', JSON.stringify({ cls: M.cls, tod: M.tod })); } catch (e) { /* ok */ }
    menuEl.classList.add('off'); F.paused = false; M.hint = 9; lock();
  }
  /* menu kelas di tengah nyawa ([K] atau jeda → GANTI KELAS): permainan dijeda; TERJUN = muncul ulang dengan kelas/perk baru,
     K / ESC = kembali bertempur tanpa perubahan. any = dari menu jeda (boleh di kendaraan, seperti dulu) */
  function clsOpen(any) {
    if (!P.alive || Q.over || P.menu || !M.started) return false;
    if (!any && (P.veh || P.mnt || P.gs || P.down || P.chute)) { F.msg(Tt('f_cls_no'), 'c'); A() && A().local('empty', .5); return false; }
    P.menu = true; M.mid = true; F.paused = true; if (F.perkMsg) F.perkMsg('');
    Object.assign(F.in, { fire: false, ads: false, f: 0, b: 0, l: 0, r: 0, sprint: false, press: 0 });
    showMenu(); A() && A().local('ui', .6); return true;
  }
  function clsClose() {
    if (!M.mid) return; M.mid = false; menuEl.classList.add('off');
    if (P.alive && P.gen === Q.g) { P.menu = false; F.paused = false; lock(); }
  }

  /* ---------------- JEDA & PENGATURAN ---------------- */
  /* jeda versi HP: kiri = ringkasan operasi + tombol aksi, kanan = pengaturan bertab (tidak perlu gulir panjang) */
  function tpHTML() {
    const q = F.opts.quality, t = Math.floor(Q.t), tab = M.pTab || 'g', anim = tab !== M.tpSig; M.tpSig = tab;
    const sw = (p, on, lb) => '<div class="tp-r"><span>' + lb + '</span><button data-p="' + p + '" class="tx-sw' + (on ? ' on' : '') + '" aria-pressed="' + !!on + '"><i></i></button></div>';
    const sl = (lb, id, key, a, b, st, v, txt) => '<label class="tp-s"><span>' + lb + '</span><b id="' + id + '">' + txt + '</b><input type="range" data-s="' + key + '" min="' + a + '" max="' + b + '" step="' + st + '" value="' + v + '"></label>';
    const seg = (lb, items) => '<div class="tp-r"><span>' + lb + '</span><div class="tx-seg">' + items + '</div></div>';
    const pane = tab === 'v'
      ? seg(Tt('f_set_q'), [0, 1, 2].map(i => '<button data-q="' + i + '"' + (q === i ? ' class="on"' : '') + '>' + Tt('f_q' + i) + '</button>').join('')) + sw('fpsc', F.opts.fps, Tt('f_tp_fps')) +
        (U.host.caps ? seg(Tt('pl_cap'), U.host.caps.map(c => '<button data-cap="' + c + '"' + ((F.opts.cap || 0) === c ? ' class="on"' : '') + '>' + (c ? c + ' FPS' : 'MAKS') + '</button>').join('')) : '') +
        sl(Tt('f_set_vol'), 'v3', 'vol', 0, 1, .05, F.opts.vol, Math.round(F.opts.vol * 100) + '%')
      : tab === 'c' ? (U.touch ? (U.pauseExtra ? U.pauseExtra() : '') : sl(Tt('f_set_sens'), 'v1', 'sens', .3, 3, .05, P.sens, P.sens.toFixed(2)) + '<div class="tp-keys">' + Tt('f_ctl_t').split(' · ').map(k => { const i = k.indexOf(' '); return '<span><b>' + esc(k.slice(0, i)) + '</b>' + esc(k.slice(i + 1)) + '</span>'; }).join('') + '</div>')
        : sl(Tt('f_set_fov'), 'v2', 'fov', 60, 105, 1, P.fov, P.fov + '°') + sw('inv', P.inv, Tt('f_set_inv')) + sw('nvg', R.nvg, Tt('f_nvg')) +
          seg(Tt('f_set_doc'), '<button data-doc="tni"' + (S.doc === 'tni' ? ' class="on"' : '') + '>TNI</button><button data-doc="us"' + (S.doc === 'us' ? ' class="on"' : '') + '>US</button>');
    const tile = (lb, v) => '<div><em>' + lb + '</em><b>' + v + '</b></div>';
    return '<div class="fm-box tx-box tp"><aside class="tp-side"><div class="tx-ttl"><i></i><div><b>' + Tt('f_pause') + '</b><small>' + esc(opName()) + ' · ' + Tt('w_d' + (Q.diff || 0)) + '</small></div></div>' +
      '<div class="tp-st">' + tile(Tt('f_sc'), P.score) + tile('K / D', P.kills + ' / ' + P.deaths) + tile(Tt('f_credits'), Math.floor(Q.cr)) + tile(Tt('f_sb_time'), pad(t / 60) + ':' + pad(t % 60)) + '</div>' +
      '<div class="tp-ob"><em>' + Tt('f_tk_posts') + '</em>' + Q.objs.map((o, i) => '<span class="o' + o.owner + '">' + String.fromCharCode(65 + i) + '</span>').join('') + '</div>' +
      '<div class="tp-act"><button data-p="resume" class="tp-go"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>' + Tt('f_resume') + '</button>' +
      '<div class="tp-two"><button data-p="cls">' + Tt('f_tp_cls') + '</button><button data-p="fs">' + Tt('f_fs') + '</button></div><button data-p="back" class="tp-out">' + Tt(U.host.backKey) + '</button></div></aside>' +
      '<section class="tp-main"><nav class="tx-tabs">' + [['g', 'f_tp_g'], ['v', 'f_tp_v'], ['c', U.touch ? 'f_tp_c' : 'f_tp_ck']].map(([k, l]) => '<button data-pt="' + k + '"' + (tab === k ? ' class="on"' : '') + '>' + Tt(l) + '</button>').join('') + '</nav>' +
      '<div class="tp-pane' + (anim ? '' : ' still') + '">' + pane + '</div></section></div>';
  }
  function pauseHTML() {
    if (!U.oldUI) return tpHTML();
    const q = F.opts.quality;
    return '<div class="fm-box small"><h2>' + Tt('f_pause') + '</h2><div class="fm-btns"><button data-p="resume" class="big">' + Tt('f_resume') + '</button><button data-p="cls">' + Tt('f_chcls') + '</button><button data-p="fs">' + Tt('f_fs') + '</button><button data-p="back" class="red">' + Tt(U.host.backKey) + '</button></div>' +
      '<h3>' + Tt('f_set') + '</h3><div class="fm-set"><label>' + Tt('f_set_sens') + ' <b id="v1">' + P.sens.toFixed(2) + '</b><input type="range" data-s="sens" min="0.3" max="3" step="0.05" value="' + P.sens + '"></label>' +
      '<label>' + Tt('f_set_fov') + ' <b id="v2">' + P.fov + '°</b><input type="range" data-s="fov" min="60" max="105" step="1" value="' + P.fov + '"></label>' +
      '<label>' + Tt('f_set_vol') + ' <b id="v3">' + Math.round(F.opts.vol * 100) + '%</b><input type="range" data-s="vol" min="0" max="1" step="0.05" value="' + F.opts.vol + '"></label>' +
      '<div class="row"><span>' + Tt('f_set_q') + '</span>' + [0, 1, 2].map(i => '<button data-q="' + i + '" class="' + (q === i ? 'on' : '') + '">' + Tt('f_q' + i) + '</button>').join('') + '<span>FPS</span><button data-p="fpsc" class="' + (F.opts.fps ? 'on' : '') + '">' + Tt(F.opts.fps ? 'f_on' : 'f_off') + '</button></div>' +
      '<div class="row"><span>' + Tt('f_set_inv') + '</span><button data-p="inv" class="' + (P.inv ? 'on' : '') + '">' + Tt(P.inv ? 'f_on' : 'f_off') + '</button><span>' + Tt('f_nvg') + '</span><button data-p="nvg" class="' + (R.nvg ? 'on' : '') + '">' + Tt(R.nvg ? 'f_on' : 'f_off') + '</button></div>' +
      '<div class="row"><span>' + Tt('f_set_doc') + '</span><button data-doc="tni" class="' + (S.doc === 'tni' ? 'on' : '') + '">TNI</button><button data-doc="us" class="' + (S.doc === 'us' ? 'on' : '') + '">US</button></div></div>' +
      (U.pauseExtra ? U.pauseExtra() : '') + (U.touch ? '' : '<h3>' + Tt('f_ctl') + '</h3><small class="ctl">' + Tt('f_ctl_t') + '</small>') + '</div>';
  }
  function setPause(on) {
    if (on === M.pause || P.menu || Q.over) { if (!on) { pauseEl.classList.add('off'); M.pause = false; F.paused = false; } return; }
    M.pause = on; F.paused = on; F.in.fire = F.in.ads = false;
    if (on) { M.tpSig = ''; pauseEl.classList.toggle('tx', !U.oldUI); pauseEl.innerHTML = pauseHTML(); pauseEl.classList.remove('off'); if (document.pointerLockElement) document.exitPointerLock(); }
    else { pauseEl.classList.add('off'); lock(); }
  }
  pauseEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (U.pauseAct && U.pauseAct(b)) { pauseEl.innerHTML = pauseHTML(); return; }   // pengaturan kontrol sentuh (fps-touch)
    if (b.dataset.q !== undefined) { F.opts.quality = +b.dataset.q; M.qUser = true; try { localStorage.setItem('tk_fps_q3', F.opts.quality); } catch (x) { /* ok */ } if (F.GLW) F.GLW.dy = 1; resize(); pauseEl.innerHTML = pauseHTML(); return; }
    if (b.dataset.cap !== undefined && U.host.setCap) { U.host.setCap(+b.dataset.cap); pauseEl.innerHTML = pauseHTML(); return; }   // batas FPS (edisi offline)
    if (b.dataset.pt) { M.pTab = b.dataset.pt; A() && A().local('ui', .4); pauseEl.innerHTML = pauseHTML(); return; }
    if (b.dataset.doc) { U.host.doc(b.dataset.doc); if (!U.oldUI) setTimeout(() => { if (M.pause) pauseEl.innerHTML = pauseHTML(); }, 0); return; }
    const a = b.dataset.p;
    if (a === 'fpsc') { F.opts.fps = !F.opts.fps; try { localStorage.setItem('tk_fps_show', F.opts.fps ? '1' : '0'); } catch (x) { /* ok */ } pauseEl.innerHTML = pauseHTML(); }
    else if (a === 'resume') setPause(false);
    else if (a === 'cls') { pauseEl.classList.add('off'); M.pause = false; F.paused = false; clsOpen(true); }
    else if (a === 'fs') { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => { }); }
    else if (a === 'back') { setPause(false); U.host.back(); }
    else if (a === 'inv') { P.inv = !P.inv; pauseEl.innerHTML = pauseHTML(); }
    else if (a === 'nvg') { R.nvg = !R.nvg; pauseEl.innerHTML = pauseHTML(); }
  });
  pauseEl.addEventListener('input', e => {
    if (U.pauseInput && U.pauseInput(e.target)) return;
    const s = e.target.dataset.s; if (!s) return; const v = +e.target.value;
    if (s === 'sens') { P.sens = v; $('#v1').textContent = v.toFixed(2); try { localStorage.setItem('tk_fps_sens', v); } catch (x) { /* ok */ } }
    else if (s === 'fov') { P.fov = v; $('#v2').textContent = v + '°'; } else if (s === 'vol') { F.opts.vol = v; $('#v3').textContent = Math.round(v * 100) + '%'; try { localStorage.setItem('tk_fps_vol', v); } catch (x) { /* ok */ } }
  });

  /* ---------------- PASUKAN & KOMANDO (tombol T) ---------------- */
  const uname = t => Tt('wu_' + t);
  const KITG = { GL: 'RIF', OFF: 'RIF', RTO: 'RIF' };   // varian tampilan senapan serbu digabung
  function kitSum(kits) { const c = {}; kits.forEach(k => { k = KITG[k] || k; c[k] = (c[k] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => c[k] + ' ' + Tt('f_kit_' + k)).join(' · '); }
  /* PASUKAN & KOMANDO versi HP: tab REKRUT (kategori + jumlah + kartu unit) / KENDARAANKU / KOMANDO (grup, perintah, daftar regu) */
  const ARI = {   // ikon kategori (viewBox 24)
    INF: 'M12 2.5c-4 0-7 2.6-7 6v1.5h14V8.5c0-3.4-3-6-7-6zM7.2 11.2c.3 3.3 2.2 5.6 4.8 5.6s4.5-2.3 4.8-5.6zM4 21.5q.5-3.6 4.5-4.4 3.5 1.6 7 0 4 .8 4.5 4.4z',
    VEH: 'M2.5 13h19v5h-19zM6 9h9.5l2 4H6zM15 9.6h7.5v1.6H15zM5.2 19.4a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM10.4 19.4a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM15.6 19.4a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z',
    AIR: 'M2 5h20v1.6H2zM11 6.6h2V9h-2zM6.5 9H16q4.5 0 4.5 3.6T16 16H9.5l-3-3H2.2v-2.2h4.3zM8.5 17.5h9V19h-9z',
    SEA: 'M1.5 14.5h21l-3.5 5.5H5zM7 10.5h8.5v4H7zM10.2 5.5h2v5h-2zM12.2 6h4l-4 2.4z',
    CAR: 'M3 12.5l3-5.5h10.5l3.2 5.5H21v5H3zM7.2 8.6l-2 3.6h12.6l-2.1-3.6zM5.2 17.6a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 1 0-4.2 0zM14.8 17.6a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 1 0-4.2 0z'
  };
  const aIco = k => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARI[k] + '"/></svg>';
  function taHTML() {
    const mine = F.myArmy('ALL'), have = {}; mine.forEach(u => { (have[u.type] = have[u.type] || []).push(u); });
    const tab = M.arTab || 'rec', cat = M.arCat || 'INF', sig = tab + cat, anim = sig !== M.taSig; M.taSig = sig;
    let body;
    if (tab === 'veh') {
      body = '<p class="ta-note">' + Tt('f_vh_sub') + '</p><div class="ta-grid">' + F.VEH_ORDER.map((id, i) => {
        const st = F.vehState(id), c = F.vehPrice(id), ok = Q.cr >= c && st !== 'in';
        return '<button class="ta-u' + (ok ? '' : ' dis') + '" data-v="' + id + '" style="--d:' + i + '">' + aIco('CAR') + '<b>' + esc(Tt('f_vh_' + id)) + '</b><span class="ta-c">' + c + '<small> KR</small></span>' +
          '<small>' + (st === 'ok' ? Tt('f_vh_refit') + ' · ' : '') + Tt('f_vh_d_' + id) + '</small>' + (st === 'in' ? '<i class="w">' + Tt('f_vh_inb') + '</i>' : st === 'ok' ? '<i>' + Tt('f_vh_have') + '</i>' : '') + '</button>';
      }).join('') + '</div>';
    } else if (tab === 'cmd') {
      const grp = F.ARMY_GRP.map(g => '<button data-g="' + g + '"' + (M.grp === g ? ' class="on"' : '') + '>' + Tt('f_grp_' + g) + ' <i>' + F.myArmy(g).length + '</i></button>').join('');
      const ord = CMD_O.map(o => '<button data-o="' + o + '">' + Tt('f_cmd_' + o) + '</button>').join('');
      const def = ['follow', 'hold', 'free'].map(o => '<button data-d="' + o + '"' + (P.armyDef === o ? ' class="on"' : '') + '>' + Tt('f_cmd_' + o) + '</button>').join('');
      const list = Object.keys(have).map(t => {
        const us = have[t], cnt = {}; us.forEach(u => { cnt[u.cmdO] = (cnt[u.cmdO] || 0) + 1; });
        const hp = us.reduce((s, u) => s + u.hp / u.hpMax, 0) / us.length, col = hp > .6 ? 'var(--a)' : hp > .3 ? '#ffb43a' : '#ff5a46';
        const ks = us.some(u => u.kit) ? kitSum(us.map(u => u.kit).filter(Boolean)) : Object.keys(cnt).map(o => Tt('f_cmd_' + o) + (Object.keys(cnt).length > 1 ? ' ' + cnt[o] : '')).join(' · ');
        return '<div class="ta-row">' + aIco(F.armyCat(t) || 'INF') + '<b>' + esc(uname(t)) + ' <em>×' + us.length + '</em></b><small>' + ks + '</small><span class="ta-hp"><i style="width:' + Math.round(hp * 100) + '%;background:' + col + '"></i></span><u style="color:' + col + '">' + Math.round(hp * 100) + '%</u></div>';
      }).join('') || '<p class="ta-note">' + Tt('f_ar_none') + '</p>';
      body = '<div class="ta-cmd"><div class="ta-cl"><div class="ta-h">' + Tt('f_ar_grp') + '</div><div class="tx-seg ta-grp">' + grp + '</div><div class="ta-h">' + Tt('f_ar_ord') + '</div><div class="ta-ord">' + ord + '</div>' +
        '<div class="ta-h">' + Tt('f_ar_def') + '</div><div class="tx-seg">' + def + '</div></div><div class="ta-cr"><div class="ta-h">' + Tt('f_ar_list') + ' · ' + mine.length + '</div><div class="ta-list">' + list + '</div>' +
        (mine.length ? '<button data-x="dismiss" class="ta-dis">' + Tt('f_ar_dismiss') + ' (' + Tt('f_grp_' + M.grp) + ')</button>' : '') + '</div></div>';
    } else {
      const cats = ['INF', 'VEH', 'AIR', 'SEA'].map(c => '<button data-ac="' + c + '"' + (cat === c ? ' class="on"' : '') + '>' + aIco(c) + '<span>' + Tt('f_ar_cat_' + c) + '</span></button>').join('');
      const qty = [1, 5, 10, 25].map(n => '<button data-n="' + n + '"' + (M.arN === n ? ' class="on"' : '') + '>×' + n + '</button>').join('');
      body = '<div class="ta-bar"><div class="tx-seg ta-cat">' + cats + '</div><div class="tx-seg ta-qty">' + qty + '</div></div><div class="ta-grid">' + F.ARMY.filter(t => F.armyCat(t) === cat).map((t, i) => {
        const c = UT[t].cost, ok = Q.cr >= c;
        return '<button class="ta-u' + (ok ? '' : ' dis') + '" data-r="' + t + '" style="--d:' + i + '">' + aIco(cat) + '<b>' + esc(uname(t)) + '</b><span class="ta-c">' + c * M.arN + '<small> KR' + (M.arN > 1 ? ' · ' + c + '×' + M.arN : '') + '</small></span>' +
          (t === 'INF' || t === 'SF' ? '<small>' + Tt('f_ar_kitrand') + '</small>' : '') + (have[t] ? '<i>' + have[t].length + '</i>' : '') + '</button>';
      }).join('') + '</div>';
    }
    const tabs = [['rec', 'f_ta_rec', ''], ['veh', 'f_ta_veh', ''], ['cmd', 'f_ta_cmd', mine.length]].map(([k, l, n]) => '<button data-at="' + k + '"' + (tab === k ? ' class="on"' : '') + '>' + Tt(l) + (n ? ' <i>' + n + '</i>' : '') + '</button>').join('');
    return '<div class="fm-box tx-box ta"><div class="tx-top"><div class="tx-ttl"><i></i><div><b>' + Tt('f_ar_title') + '</b><small>' + Tt('f_ta_sub') + '</small></div></div>' +
      '<div class="tx-chips"><span><em>' + Tt('f_credits') + '</em><b>' + Math.floor(Q.cr) + '</b></span><span><em>' + Tt('f_ar_pop') + '</em><b>' + war.popB() + '/' + war.POP_CAP + '</b></span></div>' +
      '<button class="tx-x" data-x="close" aria-label="' + Tt('f_ar_close') + '">✕</button></div><nav class="tx-tabs">' + tabs + '</nav>' +
      '<div class="ta-body' + (anim ? '' : ' still') + '">' + body + '</div><div class="ta-msg' + (M.arMsg ? ' on' : '') + '">' + esc(M.arMsg || Tt('f_ta_hint_' + tab)) + '</div></div>';
  }
  function armyHTML() {
    if (!U.oldUI) return taHTML();
    const mine = F.myArmy('ALL'), have = {}; mine.forEach(u => { (have[u.type] = have[u.type] || []).push(u); });
    const qty = [1, 5, 10, 25].map(n => '<div class="fm-opt' + (M.arN === n ? ' on' : '') + '" data-n="' + n + '">×' + n + '</div>').join('');
    const rec0 = ['INF', 'VEH', 'AIR', 'SEA'].map(cat => '<div class="fm-g">' + Tt('f_ar_cat_' + cat) + '</div><div class="ar-grid">' + F.ARMY.filter(t => F.armyCat(t) === cat).map(t => {
      const c = UT[t].cost, ok = Q.cr >= c;
      return '<div class="ar-u' + (ok ? '' : ' dis') + '" data-r="' + t + '"><b>' + esc(uname(t)) + '</b><small>' + c + (M.arN > 1 ? ' × ' + M.arN + ' = ' + c * M.arN : '') + '</small>' + (t === 'INF' || t === 'SF' ? '<small class="ar-kit">' + Tt('f_ar_kitrand') + '</small>' : '') + (have[t] ? '<i>' + have[t].length + ' ' + Tt('f_ar_own') + '</i>' : '') + '</div>';
    }).join('') + '</div>').join(''), vh = '<h3>' + Tt('f_vh_cat') + '</h3><small class="ctl">' + Tt('f_vh_sub') + '</small><div class="ar-grid ar-vg">' + F.VEH_ORDER.map(id => {   // kendaraan yang dikemudikan sendiri (fps-veh)
        const st = F.vehState(id), c = F.vehPrice(id), ok = Q.cr >= c && st !== 'in';
        return '<div class="ar-u ar-v' + (ok ? '' : ' dis') + '" data-v="' + id + '"><b>' + esc(Tt('f_vh_' + id)) + '</b><small>' + (st === 'ok' ? Tt('f_vh_refit') + ' · ' : '') + c + '</small><small class="ar-kit">' + Tt('f_vh_d_' + id) + '</small>' +
          (st === 'in' ? '<i>' + Tt('f_vh_inb') + '</i>' : st === 'ok' ? '<i>' + Tt('f_vh_have') + '</i>' : '') + '</div>';
      }).join('') + '</div>';
    const grp = F.ARMY_GRP.map(g => '<div class="fm-opt' + (M.grp === g ? ' on' : '') + '" data-g="' + g + '">' + Tt('f_grp_' + g) + ' <i>' + F.myArmy(g).length + '</i></div>').join('');
    const ord = CMD_O.map(o => '<button data-o="' + o + '">' + Tt('f_cmd_' + o) + '</button>').join('');
    const def = ['follow', 'hold', 'free'].map(o => '<div class="fm-opt' + (P.armyDef === o ? ' on' : '') + '" data-d="' + o + '">' + Tt('f_cmd_' + o) + '</div>').join('');
    const list = Object.keys(have).map(t => {
      const us = have[t], cnt = {}; us.forEach(u => { cnt[u.cmdO] = (cnt[u.cmdO] || 0) + 1; });
      const hp = us.reduce((s, u) => s + u.hp / u.hpMax, 0) / us.length;
      const ks = us.some(u => u.kit) ? '<small class="ar-kit">' + kitSum(us.map(u => u.kit).filter(Boolean)) + '</small>' : '';
      return '<div class="ar-row"><span>' + esc(uname(t)) + ' ×' + us.length + ks + '</span><em>' + Object.keys(cnt).map(o => Tt('f_cmd_' + o) + (Object.keys(cnt).length > 1 ? ' ' + cnt[o] : '')).join(' · ') + '</em><b style="color:' + (hp > .6 ? 'var(--g)' : hp > .3 ? 'var(--amber)' : 'var(--red)') + '">' + Math.round(hp * 100) + '%</b></div>';
    }).join('') || '<small class="ctl">' + Tt('f_ar_none') + '</small>';
    return '<div class="fm-box"><div class="fm-head"><div><h2>' + Tt('f_ar_title') + '</h2><small>' + Tt('f_ar_sub') + '</small></div><div class="fm-rank">' + Tt('f_credits') + ' <b>' + Math.floor(Q.cr) + '</b><br>' + Tt('f_ar_pop') + ' <b>' + war.popB() + '/' + war.POP_CAP + '</b></div></div>' +
      '<div class="fm-cols"><div class="fm-col">' + (U.touch ? vh : '') + '<h3>' + Tt('f_ar_rec') + '</h3><div class="fm-g">' + Tt('f_ar_qty') + '</div><div class="fm-sp">' + qty + '</div>' + rec0 + (U.touch ? '' : vh) + '</div>' +   // layar sentuh: kendaraan yang dikemudikan sendiri paling atas
      '<div class="fm-col"><h3>' + Tt('f_ar_cmd') + '</h3><div class="fm-g">' + Tt('f_ar_grp') + '</div><div class="fm-sp">' + grp + '</div><div class="fm-g">' + Tt('f_ar_ord') + '</div><div class="fm-btns ar-ord">' + ord + '</div>' +
      '<div class="fm-g">' + Tt('f_ar_def') + '</div><div class="fm-sp">' + def + '</div><h3>' + Tt('f_ar_list') + ' · ' + mine.length + '</h3><div class="ar-list">' + list + '</div>' +
      (mine.length ? '<div class="fm-btns"><button data-x="dismiss" class="red">' + Tt('f_ar_dismiss') + ' (' + Tt('f_grp_' + M.grp) + ')</button></div>' : '') + '</div></div>' +
      '<div class="fm-foot"><div class="ar-msg">' + esc(M.arMsg) + '</div><button class="fm-go" data-x="close">' + Tt('f_ar_close') + '</button><small>' + Tt('f_ar_foot') + '</small></div></div>';
  }
  function setArmy(on) {
    if (on) {
      if (!P.alive || Q.over || P.gs || M.pause) return;
      M.army = true; M.ci = M.cmd = false; M.arMsg = ''; F.paused = true; Object.assign(F.in, { fire: false, ads: false, f: 0, b: 0, l: 0, r: 0, sprint: false });
      M.taSig = ''; armyEl.classList.toggle('tx', !U.oldUI); armyEl.innerHTML = armyHTML(); armyEl.classList.remove('off'); if (document.pointerLockElement) document.exitPointerLock();
    } else { if (!M.army) return; M.army = false; armyEl.classList.add('off'); F.paused = false; lock(); }
  }
  armyEl.addEventListener('click', e => {
    const t = e.target.closest('[data-r],[data-v],[data-n],[data-g],[data-o],[data-d],[data-x],[data-at],[data-ac]'); if (!t) return;
    const d = t.dataset;
    if (d.v) { const r = F.vehCall(d.v); M.arMsg = Tt(r.msg, { u: Tt('f_vh_' + d.v), s: r.eta }); if (r.ok) { F.msg(M.arMsg, 'g'); A() && A().local('ui', .8); setArmy(false); return; } }
    else if (d.r) { const r = F.recruit(d.r, M.arN); M.arMsg = r.ok ? Tt('f_ar_ok', { n: r.n, u: uname(d.r) }) + (r.kits && r.kits.length ? ' — ' + kitSum(r.kits) : '') : Tt(r.msg); if (r.ok) F.msg(M.arMsg, 'g'); }
    else if (d.at) { M.arTab = d.at; M.arMsg = ''; }
    else if (d.ac) M.arCat = d.ac;
    else if (d.n) M.arN = +d.n;
    else if (d.g) M.grp = d.g;
    else if (d.d) P.armyDef = d.d;
    else if (d.o) { const r = F.command(M.grp, d.o); M.arMsg = cmdMsg(d.o, r); F.msg(M.arMsg, r.ok ? 'g' : 'c'); }
    else if (d.x === 'dismiss') { M.arMsg = Tt('f_ar_dis', { n: F.dismiss(M.grp) }); }
    else if (d.x === 'close') { setArmy(false); return; }
    A() && A().local('ui', .6); armyRender();
  });
  function armyRender() {   // gambar ulang menu tanpa melompat ke atas: posisi gulir tiap wadah dipulihkan
    const sel = ['.fm-box', '.ar-list', '.ta-body', '.ta-list'], keep = [armyEl.scrollTop].concat(sel.map(q => { const e = armyEl.querySelector(q); return e ? e.scrollTop : 0; }));
    armyEl.innerHTML = armyHTML(); armyEl.scrollTop = keep[0];
    sel.forEach((q, i) => { const e = armyEl.querySelector(q); if (e) e.scrollTop = keep[i + 1]; });
  }
  function cmdMsg(o, r) {   // teks hasil perintah regu (+ pesan susulan "tidak kebagian kursi")
    const v = Object.assign({ n: r.n, g: Tt('f_grp_' + M.grp) }, r.v);
    if (P.bdOver) { const x = P.bdOver; P.bdOver = 0; setTimeout(() => F.msg(Tt('f_bd_over', { x }), 'w'), 0); }
    return Tt(r.ok ? 'f_cmd_ok_' + o : r.msg, v);
  }
  U.cmdMsg = cmdMsg;
  function quickCmd(k) {   // panel komando cepat [Z]: 1-4 grup, 5-9 & 0 perintah
    if (k === 0) k = 10;
    if (k <= 4) { M.grp = F.ARMY_GRP[k - 1]; A() && A().local('ui', .4); return; }
    const o = CMD_O[k - 5]; if (!o) return; const r = F.command(M.grp, o);
    if (r.ok) M.cmd = false; F.msg(cmdMsg(o, r), r.ok ? 'g' : 'c');
  }

  /* ---------------- POINTER LOCK ---------------- */
  function lock() {
    if (U.touch) { M.noLock = true; return; }   // layar sentuh: tanpa pointer lock (kamera digeser jari, fps-touch.js)
    try { const p = cv.requestPointerLock && cv.requestPointerLock(); if (p && p.catch) p.catch(() => { if (++M.lockFails >= 2) M.noLock = true; }); if (!cv.requestPointerLock) M.noLock = true; } catch (e) { M.noLock = true; }
  }
  document.addEventListener('pointerlockchange', () => {
    M.locked = document.pointerLockElement === cv;
    if (M.locked) { M.noLock = false; M.lockFails = 0; }
    else if (U.active && P.alive && !P.menu && !M.pause && !M.army && !F.kitOn && !Q.over && !M.noLock) setPause(true);
  });
  document.addEventListener('pointerlockerror', () => { if (++M.lockFails >= 2) M.noLock = true; });

  /* ---------------- INPUT ---------------- */
  const MOVE = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r' };
  const typing = e => e.target && e.target.tagName === 'INPUT' && e.target.type === 'text';
  const playing = () => U.active && S.view === 'fps' && P.alive && !P.menu && !M.pause && !F.kitOn && !Q.over;
  window.addEventListener('keydown', e => {
    if (!U.active || S.view !== 'fps' || typing(e)) return;
    const c = e.code;
    if (c === 'Tab') { e.preventDefault(); M.sb = true; return; }
    if (c === 'KeyM') { if (!e.repeat) { M.map = !M.map; A() && A().local('ui', .5); } return; }   // peta taktis di dalam game (tidak keluar dari mode operator)
    if (c === 'Escape' && M.map) { M.map = false; return; }
    if (c === 'Enter' && Q.over) { U.host.restart(); return; }
    if (P.menu && !M.pause && (c === 'Enter' || c === 'NumpadEnter') && !menuEl.classList.contains('off')) { deploy(); return; }
    if (M.army) { if ((c === 'Escape' || c === 'KeyT') && !e.repeat) setArmy(false); return; }
    if (F.kitOn) { if ((c === 'Escape' || c === 'KeyE') && !e.repeat) F.kitClose(); return; }   // menu meja senjata (fps-kit)
    if (P.menu && M.mid && !M.pause) { if ((c === 'Escape' || c === 'KeyK') && !e.repeat) clsClose(); return; }   // menu kelas di tengah nyawa
    if (M.pause || P.menu) { if (c === 'Escape' && M.pause) setPause(false); return; }
    if (c === 'Space' || c === 'Enter') e.preventDefault();
    if (c === 'Escape') { if (M.ci) M.ci = false; else if (M.cmd) M.cmd = false; else if (P.tgt) F.cancelTarget(); else if (M.noLock) setPause(true); return; }
    if (!P.alive) return;
    if (c === 'KeyK') { if (!e.repeat) clsOpen(false); return; }   // pilih / ganti kelas & perk langsung
    if (MOVE[c]) { F.in[MOVE[c]] = 1; e.preventDefault(); return; }
    if (P.gs) {
      if (P.gs.mode === 'uav') {   // drone: SPASI/C naik-turun, SHIFT cepat, N termal, 3/X kembali ke tubuh, B bantuan (mortir dibidik dari kamera drone)
        if (M.ci && /^Digit[1-8]$/.test(c)) { const it = F.CALLINS[+c.slice(5) - 1]; if (it) { const r = F.callin(it.id); if (r.ok) M.ci = false; else F.msg(Tt(r.msg), 'c'); } e.preventDefault(); return; }
        switch (c) {
          case 'KeyB': if (!e.repeat) M.ci = !M.ci; break;
          case 'Space': F.in.jump = true; e.preventDefault(); break;
          case 'KeyC': case 'ControlLeft': case 'ControlRight': F.in.dn = 1; e.preventDefault(); break;
          case 'ShiftLeft': case 'ShiftRight': F.in.sprint = true; break;
          case 'KeyN': if (!e.repeat) F.gsTherm(); break;
          case 'Digit3': case 'KeyX': if (!e.repeat) F.gsExit(); e.preventDefault(); break;
        }
        return;
      }
      if (/^Digit[1-3]$/.test(c)) { F.gsWeapon(+c.slice(5) - 1); e.preventDefault(); } else if (c === 'KeyX') F.gsExit();
      return;
    }
    if (P.veh) {   // mengemudikan kendaraan operator (fps-veh)
      const dig = /^Digit[1-8]$/.test(c);
      switch (c) {
        case 'KeyE': if (!e.repeat) F.vehUse(); break;
        case 'KeyV': if (!e.repeat) F.vehCam(); break;
        case 'KeyR': if (!e.repeat) F.vehKey('R'); break;
        case 'KeyG': if (!e.repeat) F.vehKey('G'); break;
        case 'KeyF': if (!e.repeat) F.vehKey('F'); break;
        case 'KeyX': if (!e.repeat) F.vehKey('X'); break;
        case 'KeyH': if (!e.repeat) F.vehKey('H'); break;
        case 'KeyQ': if (!e.repeat) F.vehKey('Q'); break;   // ganti senjata kendaraan (meriam ↔ SMB), sama seperti ganti senjata jalan kaki
        case 'Space': F.in.jump = true; e.preventDefault(); break;
        case 'KeyC': case 'ControlLeft': case 'ControlRight': F.in.dn = 1; e.preventDefault(); break;
        case 'ShiftLeft': case 'ShiftRight': F.in.sprint = true; break;
        case 'KeyT': if (!e.repeat) setArmy(true); break;
        case 'KeyB': if (!e.repeat) { M.ci = !M.ci; M.cmd = false; } break;
        case 'KeyZ': if (!e.repeat) { M.cmd = !M.cmd; M.ci = false; } break;
        case 'KeyN': if (!e.repeat) { R.nvg = !R.nvg; A() && A().local('switch', .5); } break;
        case 'Digit3': case 'Digit7': if (!M.cmd && !M.ci) { const s = F.STREAKS.find(x => x.key === +c.slice(5)); if (s) F.useStreak(s.id); } break;
        case 'ArrowLeft': F.in.kl = 1; e.preventDefault(); break; case 'ArrowRight': F.in.kr = 1; e.preventDefault(); break;
        case 'ArrowUp': F.in.ku = 1; e.preventDefault(); break; case 'ArrowDown': F.in.kd = 1; e.preventDefault(); break;
      }
      if (!(M.cmd || M.ci) || !dig) return;
    }
    if (P.mnt) {   // mengemudikan Apache
      switch (c) {
        case 'KeyE': if (!e.repeat) F.heliUse(); break;
        case 'KeyV': if (!e.repeat) F.heliCam(); break;
        case 'KeyF': if (!e.repeat) F.heliFlare(); break;
        case 'KeyG': if (!e.repeat) F.heliHydra(); break;
        case 'KeyQ': if (!e.repeat) F.heliGhost(); break;
        case 'KeyR': if (!e.repeat) F.heliStinger(); break;
        case 'KeyX': if (!e.repeat) F.heliHyMode(); break;
        case 'KeyH': if (!e.repeat) F.heliGun(1); break;   // ganti senjata dagu (berurutan)
        case 'Space': F.in.jump = true; e.preventDefault(); break;
        case 'KeyC': case 'ControlLeft': case 'ControlRight': F.in.dn = 1; e.preventDefault(); break;
        case 'ShiftLeft': case 'ShiftRight': F.in.sprint = true; break;
        case 'KeyT': if (!e.repeat) setArmy(true); break;
        case 'KeyZ': if (!e.repeat) { M.cmd = !M.cmd; M.ci = false; } break;
        case 'KeyN': if (!e.repeat) { R.nvg = !R.nvg; A() && A().local('switch', .5); } break;
        case 'Digit3': case 'Digit7': if (!M.cmd) { const s = F.STREAKS.find(x => x.key === +c.slice(5)); if (s) F.useStreak(s.id); } break;
        case 'ArrowLeft': F.in.kl = 1; e.preventDefault(); break; case 'ArrowRight': F.in.kr = 1; e.preventDefault(); break;
        case 'ArrowUp': F.in.ku = 1; e.preventDefault(); break; case 'ArrowDown': F.in.kd = 1; e.preventDefault(); break;
      }
      if (!M.cmd || !/^Digit[0-9]$/.test(c)) return;
    }
    if (M.ci && /^Digit[1-8]$/.test(c)) { const it = F.CALLINS[+c.slice(5) - 1]; if (it) { const r = F.callin(it.id); if (r.ok) M.ci = false; else F.msg(Tt(r.msg), 'c'); } e.preventDefault(); return; }
    if (M.cmd && /^Digit[0-9]$/.test(c)) { if (!e.repeat) quickCmd(+c.slice(5)); e.preventDefault(); return; }
    switch (c) {
      case 'ShiftLeft': case 'ShiftRight': F.in.sprint = true; break;
      case 'Space': F.in.jump = true; e.preventDefault(); break;
      case 'KeyC': if (!e.repeat) F.toggleCrouch(); break;
      case 'KeyR': F.reload(); break;
      case 'Digit1': F.switchTo(0); break; case 'Digit2': F.switchTo(1); break;
      case 'Digit3': case 'Digit4': case 'Digit5': case 'Digit6': case 'Digit7': { const s = F.STREAKS.find(x => x.key === +c.slice(5)); if (s) F.useStreak(s.id); break; }
      case 'KeyQ': if (!e.repeat) F.cycleWeapon(); break;
      case 'KeyE': if (!e.repeat && !(F.benchUse && F.benchUse()) && !F.vehUse()) F.heliUse(); break;   // meja senjata → kendaraan → Shadow Hunter
      case 'KeyG': if (!e.repeat) F.throwGrenade(); break;
      case 'KeyH': if (!e.repeat) F.hookTool && F.hookTool(); break;   // grappling hook: keluarkan / simpan alat (tembak = luncurkan)
      case 'KeyV': if (!e.repeat) F.melee(); break;
      case 'KeyF': if (!e.repeat) F.useAbility(); break;
      case 'KeyB': if (!e.repeat) { M.ci = !M.ci; M.cmd = false; } break;
      case 'KeyZ': if (!e.repeat) { M.cmd = !M.cmd; M.ci = false; } break;
      case 'KeyT': if (!e.repeat) setArmy(true); break;
      case 'KeyN': if (!e.repeat) { R.nvg = !R.nvg; A() && A().local('switch', .5); } break;
      case 'ArrowLeft': F.in.kl = 1; e.preventDefault(); break; case 'ArrowRight': F.in.kr = 1; e.preventDefault(); break;
      case 'ArrowUp': F.in.ku = 1; e.preventDefault(); break; case 'ArrowDown': F.in.kd = 1; e.preventDefault(); break;
    }
  }, true);
  window.addEventListener('keyup', e => {
    if (!U.active) return; const c = e.code;
    if (c === 'Tab') { M.sb = false; if (S.view === 'fps') e.preventDefault(); }
    if (MOVE[c]) F.in[MOVE[c]] = 0;
    if (c === 'ShiftLeft' || c === 'ShiftRight') F.in.sprint = false; if (c === 'Space') F.in.jump = false; if (c === 'KeyC' || c === 'ControlLeft' || c === 'ControlRight') F.in.dn = 0;
    if (c === 'ArrowLeft') F.in.kl = 0; if (c === 'ArrowRight') F.in.kr = 0; if (c === 'ArrowUp') F.in.ku = 0; if (c === 'ArrowDown') F.in.kd = 0;
  }, true);
  window.addEventListener('blur', () => { Object.assign(F.in, { f: 0, b: 0, l: 0, r: 0, sprint: false, jump: false, dn: 0, fire: false, ads: false, kl: 0, kr: 0, ku: 0, kd: 0 }); M.sb = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    if (!playing()) return; if (A()) A().init();
    if (!M.locked && !M.noLock) { lock(); return; }
    if (e.button === 0) { if (P.tgt) F.confirmTarget(); else { F.in.fire = true; F.in.press = .2; } }
    else if (e.button === 2) { if (P.gs && !P.gs.mode) F.gsZoom(); else if (P.gs) F.gsExit(); else if (P.tgt) F.cancelTarget(); else F.in.ads = true; }
    e.preventDefault();
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) F.in.fire = false; if (e.button === 2) F.in.ads = false; });
  window.addEventListener('mousemove', e => {
    if (!playing()) return;
    if (M.locked || (M.noLock && e.buttons)) { F.look(e.movementX, e.movementY); if (!P.gs) VM.push(e.movementX, e.movementY); }
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); if (!playing()) return; if (P.gs) F.gsZoom(); else if (P.mnt) F.heliZoom(); else if (P.veh) F.vehKey('wheel'); else F.cycleWeapon(); }, { passive: false });

  /* ---------------- GAMBAR UTAMA ---------------- */
  const sc = () => U.touch ? clamp(CH / 520, .62, 1) : CH / 720;   // HP: 390 px tinggi → .75 (dulu .54 = teks HUD 5–6 px)
  const TX = () => U.touch ? -(U.hudR || 0) : 0;
  const LX = () => U.touch ? (U.hudL || 0) : 0;
  const TOPY = () => U.touch ? (U.topY || 60) : 0;   // layar sentuh: HUD kanan atas mulai di bawah bilah ❚❚ / RADIO (fps-touch mengisi U.topY & U.topR)   // layar sentuh: HUD kiri menghindari poni/lubang kamera (area aman dari fps-touch)   // layar sentuh: panel kanan-bawah digeser ke kiri gugus tombol (fps-touch mengisi U.hudR)
  function text(t, x, y, size, col, align, bold, shadow) {
    if (U.touch) size = Math.max(9, size * 1.06);
    ctx.font = (bold === false ? '' : 'bold ') + Math.round(size) + 'px ' + HF; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    if (shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillText(t, x + 1, y + 1); }
    ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y);
  }
  const bearing = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  const hdgDeg = () => ((P.cam ? P.cam.yaw : P.yaw) * 180 / Math.PI + 90 + 720) % 360;
  const OWN = { B: '#37d7ff', R: '#ff4a4a', N: '#e8dc88' };

  /* HUD infanteri gaya Black Ops Cold War: kompas polos di atas, minimap bulat + skor + objektif + killfeed di kiri,
     nama & nyawa di kiri bawah, amunisi besar + perlengkapan di kanan bawah, killstreak bertumpuk di kanan, kartu notifikasi kanan atas */
  const CD = { acc: '#ff9b2f', ally: '#4fc3f7', foe: '#ff4a4a', dim: 'rgba(255,255,255,.62)' };
  function compass(s) {
    const w = U.touch ? Math.max(260, Math.min(600 * s, CW - 2 * ((U.topR || 10) + 168))) : 600 * s, x0 = (CW - w) / 2, y0 = 12 * s, hd = hdgDeg(), ppd = w / 150, cx = CW / 2;
    const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0 - 4 * s, w, 40 * s); ctx.clip();
    for (let d = Math.floor(hd - 75); d <= hd + 75; d++) {
      if (d % 5) continue; const dd = ((d % 360) + 360) % 360, x = cx + (d - hd) * ppd, off = Math.abs(d - hd);
      ctx.globalAlpha = clamp(1.25 - off / 75, 0, 1);
      if (dd % 15) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x - .5, y0 + 13 * s, 1, 4 * s); }
      else if (off > 9) { const big = dd % 45 === 0; text(big ? NAMES[dd] : String(dd), x, y0 + 18 * s, (dd % 90 === 0 ? 17 : big ? 14 : 11) * s, dd === 0 ? '#ffd24a' : big ? '#fff' : CD.dim, 'center', big); }   // angka di dekat tengah diganti arah saat ini
    }
    ctx.restore();
    text(String(Math.round(hd) % 360), cx, y0 + 20 * s, 21 * s, '#fff', 'center');
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, y0 + 25 * s, 2, 5 * s);
    const mk = [], mark = (x, y, label, col, dist) => {   // objektif & HQ musuh: lingkaran berhuruf di bawah kompas
      const df = wrapPi((bearing(x - P.x, y - P.y) - hd) * Math.PI / 180) * 180 / Math.PI; if (Math.abs(df) <= 72) mk.push({ px: cx + df * ppd, label, col, dist });
    };
    Q.objs.forEach((o, i) => mark(o.x, o.y, String.fromCharCode(65 + i), OWN[o.owner], Math.hypot(o.x - P.x, o.y - P.y)));
    mark(Q.hqR.x, Q.hqR.y, 'H', CD.foe, Math.hypot(Q.hqR.x - P.x, Q.hqR.y - P.y));
    mk.sort((a, b) => a.px - b.px); const last = [-1e9, -1e9]; TY = Math.max(TY, y0 + 34 * s);
    for (const m of mk) {   // berdekatan (< 34 px) → baris kedua, supaya huruf & jarak tidak bertumpuk
      const row = m.px - last[0] >= 34 * s ? 0 : m.px - last[1] >= 34 * s ? 1 : 0; last[row] = m.px;
      const px = m.px, py = y0 + 42 * s + row * 28 * s, r = 8 * s; TY = Math.max(TY, py + r + 17 * s);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.3); ctx.fill(); ctx.strokeStyle = m.col; ctx.lineWidth = 2 * s; ctx.stroke();
      text(m.label, px, py + 4 * s, 11 * s, m.col, 'center', true, false); text(Math.round(m.dist) + 'm', px, py + r + 11 * s, 9 * s, m.col, 'center', false);
    }
    for (const u of Q.units) {   // musuh yang ditandai (kemampuan/teropong) dan kontak tembakan muncul di kompas
      const tg = u.team === 'R' && !u.dead && ((u.tagT || 0) > P.time || (F.contacts.has(u.id))); if (!tg) continue;
      const df = wrapPi((bearing(u.x - P.x, u.y - P.y) - hd) * Math.PI / 180) * 180 / Math.PI; if (Math.abs(df) > 72) continue;
      const px = cx + df * ppd, py = y0 + 28 * s; ctx.fillStyle = F.contacts.has(u.id) ? CD.foe : '#ff9a2a'; ctx.beginPath(); ctx.moveTo(px, py - 4 * s); ctx.lineTo(px + 4 * s, py); ctx.lineTo(px, py + 4 * s); ctx.lineTo(px - 4 * s, py); ctx.closePath(); ctx.fill();
    }
  }

  const MM = { r: 92, x: 20, y: 20 };
  const eagle = u => F.hasPerk && u.team === 'R' && F.hasPerk('EAGLE') && Math.abs(u.x - P.x) < F.PERK.eagle && Math.abs(u.y - P.y) < F.PERK.eagle && Math.hypot(u.x - P.x, u.y - P.y) < F.PERK.eagle;   // EAGLE EYE: semua musuh ≤500 m
  function minimap(s) {
    const mr = MM.r * s, cx = MM.x * s + mr + LX(), cy = MM.y * s + mr, Rm = P.cls && P.cls.id === 'RECON' ? 300 : 190, k = mr / Rm, terr = TK.warui && TK.warui.state.terr, ang = -Math.PI / 2 - (P.cam ? P.cam.yaw : P.yaw);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, mr, 0, 6.3); ctx.clip(); ctx.fillStyle = 'rgba(30,34,36,.86)'; ctx.fillRect(cx - mr, cy - mr, mr * 2, mr * 2);
    ctx.translate(cx, cy); ctx.rotate(ang);
    if (terr) { const kk = terr.width / W.WW; if (M.tgS !== terr) { M.tgS = terr; const c2 = document.createElement('canvas'); c2.width = terr.width; c2.height = terr.height; const g2 = c2.getContext('2d'); g2.filter = 'grayscale(.75) brightness(.85) contrast(1.1)'; g2.drawImage(terr, 0, 0); M.tg = c2; } ctx.globalAlpha = .62; ctx.drawImage(M.tg, (P.x - Rm) * kk, (P.y - Rm) * kk, Rm * 2 * kk, Rm * 2 * kk, -mr, -mr, mr * 2, mr * 2); ctx.globalAlpha = 1; }
    const uav = P.uavT > 0;
    for (const o of Q.objs) { const x = (o.x - P.x) * k, y = (o.y - P.y) * k; ctx.strokeStyle = OWN[o.owner]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, o.r * k, 0, 6.3); ctx.stroke(); }
    for (const u of Q.units) {
      if (u.dead || u === P.unit || u.struct || u.inV) continue; const x = (u.x - P.x) * k, y = (u.y - P.y) * k; if (x * x + y * y > mr * mr) continue;
      if (u.team === 'B') { ctx.fillStyle = CD.ally; ctx.beginPath(); ctx.arc(x, y, 2.3 * s + 1, 0, 6.3); ctx.fill(); }
      else if (u.revealT > Q.t || (uav && u.seen.B) || (u.tagT || 0) > P.time || eagle(u)) { ctx.fillStyle = (u.tagT || 0) > P.time ? '#ff9a2a' : CD.foe; ctx.beginPath(); ctx.arc(x, y, 3 * s + 1, 0, 6.3); ctx.fill(); }
    }
    const bn = F.bench && F.bench(); if (bn) { const x = (bn.x - P.x) * k, y = (bn.y - P.y) * k; if (x * x + y * y < mr * mr) { ctx.fillStyle = '#ffc428'; ctx.fillRect(x - 3.5 * s, y - 3.5 * s, 7 * s, 7 * s); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5 * s, y - 3.5 * s, 7 * s, 7 * s); } }
    for (const d of F.drops || []) { const x = (d.x - P.x) * k, y = (d.y - P.y) * k; if (x * x + y * y < mr * mr) { ctx.fillStyle = '#7dff9d'; ctx.fillRect(x - 2 * s, y - 2 * s, 4 * s, 4 * s); } }
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);   // huruf objektif tetap tegak
    Q.objs.forEach((o, i) => { const x = (o.x - P.x) * k, y = (o.y - P.y) * k; if (x * x + y * y > (mr - 8 * s) ** 2) return; ctx.save(); ctx.translate(x, y); ctx.rotate(-ang); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, 6.3); ctx.fill(); text(String.fromCharCode(65 + i), 0, 4 * s, 10 * s, OWN[o.owner], 'center', true, false); ctx.restore(); });
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(cx, cy); const hf = (P.cam ? P.cam.fov : 1.3) / 2; ctx.arc(cx, cy, mr, -Math.PI / 2 - hf, -Math.PI / 2 + hf); ctx.closePath(); ctx.fill();   // kerucut pandang
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(cx, cy, mr + 1.5 * s, 0, 6.3); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,240,240,.9)'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(cx, cy, mr, 0, 6.3); ctx.stroke();
    const nx = cx + Math.sin(ang) * mr, ny = cy - Math.cos(ang) * mr;   // utara di tepi peta
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(nx, ny, 8 * s, 0, 6.3); ctx.fill(); text('N', nx, ny + 4 * s, 11 * s, '#111', 'center', true, false);
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(cx, cy - 7 * s); ctx.lineTo(cx + 5.5 * s, cy + 6 * s); ctx.lineTo(cx, cy + 3 * s); ctx.lineTo(cx - 5.5 * s, cy + 6 * s); ctx.closePath(); ctx.fill();
    if (uav) { ctx.fillStyle = 'rgba(255,74,74,.85)'; ctx.fillRect(cx - 18 * s, cy + mr - 10 * s, 36 * s, 14 * s); text('UAV', cx, cy + mr + 1 * s, 10 * s, '#fff', 'center'); }
    const ab = P.time - P.abFlash;   // cincin denyut saat kemampuan dipakai
    if (ab < 1.1 && !F.scans.length) { ctx.strokeStyle = 'rgba(255,154,42,' + (1 - ab / 1.1) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, mr * Math.min(1, ab / .9), 0, 6.3); ctx.stroke(); }
    for (const c of F.scans) {   // gelombang pindai PULSE/DRONE/PAINT: radius nyata di minimap, isi tipis di belakang muka gelombang
      const col = SCOL[c.id], rr = Math.min(mr * 1.2, c.r * k), x = (c.x - P.x) * k, y = (c.y - P.y) * k, X0 = cx + x * Math.cos(ang) - y * Math.sin(ang), Y0 = cy + x * Math.sin(ang) + y * Math.cos(ang);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, mr, 0, 6.3); ctx.clip();
      ctx.fillStyle = 'rgba(' + col + ',.12)'; ctx.beginPath(); ctx.arc(X0, Y0, rr, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',.95)'; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.arc(X0, Y0, rr, 0, 6.3); ctx.stroke(); ctx.restore();
    }
  }
  const leftY = s => (MM.y + MM.r * 2 + 16) * s;   // bawah minimap: panel skor, objektif, deteksi, killfeed
  function scorePanel(s) {   // pengganti papan skor tim BOCW: skor operator (bilah = kemajuan killstreak berikut) & HQ musuh
    const x = 22 * s + LX(), y = leftY(s) + 18 * s, nx = F.STREAKS.find(q => (P.sk || 0) < q.kills), hq = Q.hqR, hp = clamp(hq.hp / hq.hpMax, 0, 1);
    const row = (yy, num, label, col, pr, right) => {
      text(num, x, yy, 22 * s, '#fff', 'left'); text(label, x + 78 * s, yy - 10 * s, 11 * s, col, 'left');
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 78 * s, yy - 5 * s, 112 * s, 4 * s); ctx.fillStyle = col; ctx.fillRect(x + 78 * s, yy - 5 * s, 112 * s * clamp(pr, 0, 1), 4 * s);
      if (right) text(right, x + 198 * s, yy - 1 * s, 12 * s, '#fff', 'left');
    };
    row(y, String(P.score), Tt('f_sc'), CD.acc, nx ? (P.sk || 0) / nx.kills : 1, P.kills + '/' + P.deaths);
    row(y + 28 * s, Math.round(hp * 100) + '%', Tt('f_hq_foe'), CD.foe, hp, '');
    const oy = y + 52 * s;
    Q.objs.forEach((o, i) => {   // lingkaran objektif A-E: warna pemilik + busur kemajuan rebut
      const ox = x + 12 * s + i * 32 * s, r = 10 * s, col = OWN[o.owner];
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(ox, oy, r, 0, 6.3); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2 * s; ctx.stroke();
      if (o.prog) { ctx.strokeStyle = o.prog > 0 ? CD.ally : CD.foe; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(ox, oy, r + 3 * s, -Math.PI / 2, -Math.PI / 2 + Math.abs(o.prog) * 6.283); ctx.stroke(); }
      text(String.fromCharCode(65 + i), ox, oy + 4 * s, 12 * s, col, 'center', true, false);
      if (o.boss && !o.boss.dead) text('☠', ox + r, oy - r + 2 * s, 10 * s, '#ff6b6b', 'center');   // pos dijaga mini bos
    });
  }

  function stealthHud(s) {   // indikator deteksi: apakah musuh tahu posisi Anda dan dari jarak berapa Anda terlihat
    const seen = P.unit && P.unit.seen.R, r = Math.round(F.DETECT.base * P.expo), x = 22 * s + LX(), y = leftY(s) + 98 * s;
    text((seen ? '◉ ' : '○ ') + Tt(seen ? 'f_detected' : 'f_hidden'), x, y, 12 * s, seen ? '#ff5a4a' : '#9dffb5');
    text(Tt('f_visrange', { r }) + (P.unit.revealT > Q.t ? ' · ' + Tt('f_noisy') : ''), x, y + 14 * s, 10 * s, CD.dim, 'left', false);
  }

  /* penanda bidik alat kait: cincin + 3 cakar. Hijau = titik kait sah (jarak), merah = tidak bisa dikait (alasan). Saat tali terpasang: status tarikan */
  function hookReticle(s, cx, cy) {
    const H = P.hook, pl = H ? null : F.hookAim && F.hookAim(), ok = H || (pl && !pl.err), col = H ? '#7dff9d' : ok ? '#4dffa0' : '#ff5a4a', r = 13 * s, t = P.time;
    ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = col; ctx.lineWidth = 2 * s; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3 * s;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.stroke();
    const sp = ok && !H ? Math.sin(t * 6) * 1.5 * s : 0;
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.094 + (H ? t * 2 : 0); ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 3 * s + sp), Math.sin(a) * (r + 3 * s + sp)); ctx.lineTo(Math.cos(a) * (r + 10 * s + sp), Math.sin(a) * (r + 10 * s + sp)); ctx.stroke(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 2 * s, 0, 6.3); ctx.fill(); ctx.restore();
    const lab = H ? (H.ph === 'fly' ? Tt('f_hook_fly') : H.ph === 'pull' ? Tt('f_hook_pull') : Tt('f_hook_climb')) : ok ? Tt('f_hook_ok', { d: Math.round(pl.d) }) : Tt(pl ? pl.err : 'f_hook_far');
    text(lab, cx, cy + r + 26 * s, 12 * s, col, 'center');
  }
  function crosshair(s) {
    const w = P.w[P.cur], d = F.WEAPONS[w.id], cx = CW / 2, cy = CH / 2;
    if (P.chute || P.tgt) return;
    if (P.eq === 'hook' || P.hook) { hookReticle(s, cx, cy); return; }
    if (d.scope && P.ads > .82) return;
    if (P.ads > .6 && P.melT <= 0) return;   // saat membidik, titik merah / pejera senjata yang dipakai
    const fovd = (P.cam.fov * 180 / Math.PI) * (CW / CH) * .75, px = clamp(F.spreadDeg() * (CW / Math.max(30, fovd)) * 1.25, 3, 120) * (1 - P.ads * .4), g = 5 * s + px, l = 9 * s * (1 - P.ads * .5);
    const foe = (P.time - M.aimT > .08) ? (M.aimT = P.time, M.aim = F.aimAt()) : M.aim;
    ctx.save(); ctx.strokeStyle = P.hit && P.time - P.hit.t < .12 ? '#fff' : foe ? '#ff5a4a' : 'rgba(255,255,255,.9)'; ctx.lineWidth = 2 * s; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3;
    if (P.sprint) ctx.globalAlpha = .35;
    ctx.beginPath(); ctx.moveTo(cx - g - l, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + l, cy); ctx.moveTo(cx, cy - g - l); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + l); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 1, 2, 2); ctx.restore();
    // penanda kena tembak
    const age = P.time - P.hit.t; if (age < .28) {
      const col = P.hit.kill ? (P.hit.head ? '#ffd24a' : '#ff3b3b') : '#fff', e = 1 - age / .28, r1 = (8 + (1 - e) * 5) * s, r2 = r1 + 9 * s;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.4 * s; ctx.globalAlpha = e; ctx.beginPath();
      for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ctx.moveTo(cx + ax * r1, cy + ay * r1); ctx.lineTo(cx + ax * r2, cy + ay * r2); } ctx.stroke(); ctx.restore();
    }
  }
  function scope(s) {
    const d = F.WEAPONS[P.w[P.cur].id]; if (!d.scope || P.ads < .82 || P.melT > 0) return;
    const cx = CW / 2, cy = CH / 2, r = CH * .47, a = clamp((P.ads - .82) / .18, 0, 1);
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, 6.3, true); ctx.fill('evenodd');
    if (d.opt === 'med') {   // teropong menengah: garis duplex (tebal di luar, tipis di tengah) + titik merah menyala
      ctx.strokeStyle = 'rgba(0,0,0,.95)'; ctx.lineWidth = 6 * s; ctx.beginPath(); for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + ax * r, cy + ay * r); ctx.lineTo(cx + ax * r * .3, cy + ay * r * .3); } ctx.stroke();
      ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(cx - r * .3, cy); ctx.lineTo(cx + r * .3, cy); ctx.moveTo(cx, cy - r * .3); ctx.lineTo(cx, cy + r * .3); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 5 * s); g.addColorStop(0, R.nvg ? 'rgba(170,255,170,1)' : 'rgba(255,70,50,1)'); g.addColorStop(1, 'rgba(255,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 5 * s, 0, 6.3); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.stroke(); ctx.restore();
      text('×' + (P.fov / (P.cam.fov * 180 / Math.PI)).toFixed(1), cx + r * .62, cy + r * .78, 14 * s, '#cfe', 'left'); return;
    }
    ctx.strokeStyle = 'rgba(0,0,0,.95)'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.beginPath(); for (let i = 1; i <= 8; i++) { const o = i * 22 * s; ctx.moveTo(cx - 5 * s, cy + o); ctx.lineTo(cx + 5 * s, cy + o); ctx.moveTo(cx - 5 * s, cy - o); ctx.lineTo(cx + 5 * s, cy - o); ctx.moveTo(cx + o, cy - 5 * s); ctx.lineTo(cx + o, cy + 5 * s); ctx.moveTo(cx - o, cy - 5 * s); ctx.lineTo(cx - o, cy + 5 * s); } ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.stroke(); ctx.restore();
    text('×' + (P.fov / (P.cam.fov * 180 / Math.PI)).toFixed(1), cx + r * .62, cy + r * .78, 14 * s, '#cfe', 'left');
  }

  function bottomLeft(s) {   // regu (bilah biru) di atas nama operator + bilah nyawa putih, gaya daftar regu BOCW
    const u = P.unit, hp = u ? clamp(u.hp / u.hpMax, 0, 1) : 0, x = 22 * s + LX(), y = CH - 26 * s, w = 210 * s;
    const sq = F.myArmy('ALL'), nb = Math.min(sq.length, U.touch ? (P.mnt || P.veh ? 0 : 2) : 4);   // HP: sisi kiri bawah = area jempol joystick, daftar regu diringkas
    sq.slice(0, nb).forEach((q, i) => {
      const yy = y - 46 * s - (nb - 1 - i) * 24 * s;
      text(Tt('wu_' + q.type), x + 12 * s, yy - 4 * s, 10 * s, 'rgba(225,240,255,.85)', 'left', false);
      ctx.fillStyle = CD.ally; ctx.beginPath(); ctx.arc(x + 4 * s, yy - 7 * s, 3 * s, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 12 * s, yy, 110 * s, 3 * s); ctx.fillStyle = CD.ally; ctx.fillRect(x + 12 * s, yy, 110 * s * clamp(q.hp / q.hpMax, 0, 1), 3 * s);
    });
    const more = sq.length - nb;
    M.sqTop = nb || (more > 0 && !P.mnt && !P.veh) ? y - 46 * s - nb * 24 * s - (more > 0 ? 14 : 4) * s : y - 34 * s;   // batas atas daftar pasukan (killfeed HP berhenti di sini)
    if (!U.touch || (more > 0 && !P.mnt && !P.veh)) text(U.touch ? '+' + more + ' ' + Tt('f_army') : (more > 0 ? '+' + more + ' · ' : sq.length ? '' : Tt('f_army') + ' 0 · ') + Tt('f_army_keys'), x + 12 * s, y - 46 * s - nb * 24 * s + (nb ? 4 : 10) * s, 10 * s, 'rgba(160,220,255,.75)', 'left', false);
    // nama operator + kelas, nyawa
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(x + 4 * s, y - 17 * s, 4 * s, 0, 6.3); ctx.fill();
    text('OPERATOR', x + 12 * s, y - 12 * s, 15 * s, '#fff'); ctx.font = 'bold ' + Math.round(15 * s) + 'px ' + HF; const nw = ctx.measureText('OPERATOR').width;
    text(Tt('f_cls_' + P.cls.id), x + 18 * s + nw, y - 12 * s, 10 * s, CD.dim, 'left', false);
    const lowHp = hp < .3, hc = lowHp ? (P.time * 4 % 1 < .5 ? '#ff3b3b' : '#ff8080') : '#f2f2f2';
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y - 5 * s, w, 7 * s); ctx.fillStyle = hc; ctx.fillRect(x, y - 5 * s, w * hp, 7 * s);
    for (let i = 1; i < 4; i++) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + w * i / 4 - 1, y - 5 * s, 2, 7 * s); }   // ruas bilah nyawa
    text(String(Math.round(hp * 100)), x + w + 8 * s, y + 2 * s, 12 * s, hc, 'left');
  }
  function equip(cx, cy, r, key, n, draw, prog, on, s) {   // ikon perlengkapan bulat (granat, kemampuan) + huruf tombol di bawahnya
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.fill();
    ctx.strokeStyle = on ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5 * s; ctx.stroke();
    if (prog !== null && prog < 1) { ctx.strokeStyle = CD.acc; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + prog * 6.283); ctx.stroke(); }
    ctx.save(); ctx.globalAlpha = on ? 1 : .4; draw(cx, cy); ctx.restore();
    if (n !== null) text(String(n), cx - r - 3 * s, cy - r + 9 * s, 12 * s, '#fff', 'right');
    if (!U.touch) { ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(cx - 7 * s, cy + r + 4 * s, 14 * s, 13 * s); text(key, cx, cy + r + 14 * s, 10 * s, '#111', 'center', true, false); }
  }
  function bottomRight(s) {
    const w = P.w[P.cur], d = F.WEAPONS[w.id], xr = CW - 30 * s + TX(), cy = CH - 52 * s, r = 17 * s, low = w.ammo <= Math.ceil(d.mag * .25);
    // [F] kemampuan kelas (paling kanan) & [G] granat
    const ab = P.cls.ab, act = P.ab.adr > 0 || P.ab.arm > 0, rdy = P.ab.cd <= 0;
    equip(xr - r, cy, r, 'F', null, (x, y) => { ctx.fillStyle = act ? '#7dff9d' : CD.acc; ctx.beginPath(); ctx.moveTo(x + 2 * s, y - 9 * s); ctx.lineTo(x - 5 * s, y + 1 * s); ctx.lineTo(x, y + 1 * s); ctx.lineTo(x - 2 * s, y + 9 * s); ctx.lineTo(x + 5 * s, y - 1 * s); ctx.lineTo(x, y - 1 * s); ctx.closePath(); ctx.fill(); },
      act ? null : rdy ? null : 1 - P.ab.cd / ab.cd, rdy || act, s);
    const gx = xr - r * 3 - 16 * s;
    equip(gx, cy, r, 'G', P.gren, (x, y) => { ctx.fillStyle = '#c9d2b0'; ctx.beginPath(); ctx.ellipse(x, y + 2 * s, 6 * s, 7.5 * s, 0, 0, 6.3); ctx.fill(); ctx.fillRect(x - 2.5 * s, y - 9 * s, 5 * s, 4 * s); ctx.fillRect(x + 1 * s, y - 9 * s, 5 * s, 2 * s); }, null, P.gren > 0, s);
    const hx = gx - r * 2 - 10 * s, hr = F.HOOK ? 1 - clamp(((P.hookCd || 0) - P.time) / F.HOOK.cd, 0, 1) : 1;   // [H] grappling hook
    equip(hx, cy, r, 'H', null, (x, y) => { ctx.strokeStyle = P.hook ? '#7dff9d' : '#c9d2b0'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x, y - 9 * s); ctx.lineTo(x, y + 2 * s); ctx.moveTo(x - 6 * s, y); ctx.quadraticCurveTo(x - 6 * s, y + 8 * s, x, y + 8 * s); ctx.quadraticCurveTo(x + 6 * s, y + 8 * s, x + 6 * s, y); ctx.moveTo(x - 3 * s, y - 9 * s); ctx.lineTo(x + 3 * s, y - 9 * s); ctx.stroke(); }, hr < 1 ? hr : null, hr >= 1 || !!P.hook, s);
    // amunisi: magasin besar, cadangan kecil, nama senjata di bawahnya
    const ax = hx - r - 22 * s;
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(ax + 10 * s, cy - 24 * s, 1, 40 * s);
    text(String(w.res), ax, cy + 4 * s, 22 * s, 'rgba(255,255,255,.8)', 'right');
    ctx.font = 'bold ' + Math.round(22 * s) + 'px ' + HF; const rw = ctx.measureText(String(w.res)).width;
    text(String(w.ammo), ax - rw - 12 * s, cy + 6 * s, 42 * s, low ? '#ff6b6b' : '#fff', 'right');
    const md = d.mode === 'auto' ? 'AUTO' : d.mode === 'semi' ? 'SEMI' : d.mode === 'burst' ? 'BURST' : d.mode === 'bolt' ? 'BOLT' : d.mode === 'pump' ? 'PUMP' : 'ROCKET';
    text(md, ax, cy + 22 * s, 10 * s, CD.dim, 'right', false); ctx.font = Math.round(10 * s) + 'px ' + HF; const mw = ctx.measureText(md).width;
    text(wn(w.id), ax - mw - 8 * s, cy + 22 * s, 12 * s, '#fff', 'right');
    if (P.relT > 0) { const pr = 1 - P.relT / P.relD, y = slotY(15 * s); text(Tt('f_reloading'), CW / 2, y, 15 * s, '#fff', 'center'); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(CW / 2 - 60 * s, y + 8 * s, 120 * s, 4 * s); ctx.fillStyle = '#fff'; ctx.fillRect(CW / 2 - 60 * s, y + 8 * s, 120 * s * pr, 4 * s); CY += 10 * s; }
    else if (w.ammo === 0 && w.res === 0) text(Tt('f_empty'), CW / 2, slotY(15 * s), 15 * s, '#ff6b6b', 'center');
    else if (low && w.res > 0) text(Tt('f_reload_hint'), CW / 2, slotY(14 * s), 14 * s, '#ffd24a', 'center');
    if (P.eq) wrapC(Tt('f_eq_' + P.eq), null, 12 * s, 'rgba(255,255,255,.85)', cMaxW(s));   // granat / pisau / bayonet di tangan: petunjuk klik
  }
  function killfeed(s) {   // kiri tengah seperti BOCW: penembak ▸ korban, tanpa kotak
    let y = leftY(s) + (U.touch && P.alive && !P.mnt && !P.veh ? 132 : 140) * s; const x = 22 * s + LX();
    const feed = U.touch ? P.feed.filter(f => P.time - f.t < 5).slice(-3) : P.feed;
    for (const f of feed) {
      if (U.touch && y > M.sqTop - 8 * s) break;   // HP: jangan menabrak daftar pasukan aktif di kiri bawah
      const a = clamp(5 - (P.time - f.t), 0, 1); if (a <= 0) continue; ctx.globalAlpha = a;
      ctx.font = 'bold ' + Math.round(13 * s) + 'px ' + HF; const wa = ctx.measureText(f.a).width;
      text(f.a, x, y, 13 * s, f.a === Tt('f_you') ? '#ffd24a' : f.col === 'b' ? CD.ally : CD.foe, 'left');   // col 'b' = pihak kita (biru) membunuh musuh
      text('▸', x + wa + 8 * s, y, 12 * s, 'rgba(255,255,255,.8)', 'left');
      text(f.b, x + wa + 24 * s, y, 13 * s, f.col === 'b' ? CD.foe : CD.ally, 'left');
      ctx.globalAlpha = 1; y += 20 * s;
    }
  }
  function pops(s) {   // HP: pop killstreak-siap (p.stk) dilewati — sudah tampil sebagai kartu notifikasi (dulu dobel di tengah)
    let n = 0;
    for (let i = P.pops.length - 1; i >= 0; i--) { const p = P.pops[i], a = clamp(3 - (P.time - p.t), 0, 1); if (a <= 0 || (p.stk && U.touch)) continue; const y = n++ < (U.touch ? 2 : 4) ? slotY(14 * s, true) : null; if (y === null) break; ctx.globalAlpha = a; text(p.text, CW / 2 - 10 * s, y, 14 * s, '#fff', 'right'); if (p.pts) text('+' + p.pts, CW / 2 + 6 * s, y, 14 * s, '#ffd24a', 'left'); if (p.cr) { ctx.font = 'bold ' + Math.round(14 * s) + 'px ' + HF; text('+' + p.cr + ' ' + Tt('f_cr_s'), CW / 2 + 6 * s + Math.max(48 * s, (p.pts ? ctx.measureText('+' + p.pts).width : 0) + 10 * s), y, 13 * s, '#7dff9d', 'left'); } ctx.globalAlpha = 1; }
  }
  function msgs(s) {   // pesan positif ('g') = kartu kanan atas (seperti "CALLED IN ..." BOCW); peringatan & info di tengah
    let y = U.touch ? Math.max(TY + 14 * s, 60 * s) : TY + 14 * s, card = null;
    if (U.touch && M.cine) return;
    if (U.touch) {   // HP: kartu notifikasi di tengah atas (di bawah kompas), teks dibungkus 2 baris — dulu terpotong "…" & menutupi panel heli/kendaraan kanan atas
      for (let i = P.msgs.length - 1; i >= 0 && !card; i--) { const m = P.msgs[i], a = clamp(5 - (P.time - m.t), 0, 1); if (a > 0 && m.kind === 'g') card = { m, a }; }
      if (card) {
        const lcr = LX() + 252 * s, w = Math.min(CW * .5, 460 * s, CW - 2 * lcr), k = clamp((P.time - card.m.t) * 6, 0, 1), fs = 12 * s;   // lcr = tepi kanan kolom kiri (skor 0/0): kartu tidak menabraknya di layar sempit
        ctx.font = 'bold ' + Math.round(Math.max(9, fs * 1.06)) + 'px ' + HF; const L = []; let ln = '';
        for (const wd of card.m.text.split(' ')) { const t = ln ? ln + ' ' + wd : wd; if (ctx.measureText(t).width > w - 26 * s && ln) { L.push(ln); ln = wd; } else ln = t; }
        if (ln) L.push(ln); if (L.length > 2) { L.length = 2; L[1] += '…'; }
        const h = (16 + L.length * 15) * s, x = (CW - w) / 2, y0 = y - 14 * s;
        ctx.globalAlpha = card.a * k; ctx.fillStyle = 'rgba(14,14,15,.82)'; ctx.fillRect(x, y0, w, h); ctx.fillStyle = CD.acc; ctx.fillRect(x, y0, 3 * s, h); ctx.fillRect(x, y0 + h - 2 * s, w * card.a, 2 * s);
        L.forEach((t, i) => text(t, x + 13 * s, y0 + (17 + i * 15) * s, 12 * s, '#fff', 'left', true, false));
        ctx.globalAlpha = 1; y += h + 6 * s; card = null;
      }
    }
    let nm = 0;
    for (let i = P.msgs.length - 1; i >= 0; i--) {
      const m = P.msgs[i], a = clamp(5 - (P.time - m.t), 0, 1); if (a <= 0) continue;
      if (m.kind === 'g') { if (!card && !U.touch) card = { m, a }; continue; }
      if (U.touch && (++nm > 3 || y > CH / 2 - 30 * s)) break;   // tidak turun sampai bidikan   // HP: maks. 3 pesan tengah (yang terbaru) agar tidak turun menutupi bidikan
      const mc = m.kind === 'c' ? '#ff6b6b' : m.kind === 'w' ? '#ffd24a' : '#e8f4ff';
      if (U.touch) { ctx.globalAlpha = a; text(m.text, CW / 2, y, 13 * s, mc, 'center'); ctx.globalAlpha = 1; y += 18 * s; continue; }
      if (M.cine) continue;   // PC: pesan tengah ditahan selama spanduk sinematik; kartu tetap
      const ls = wrapW(m.text, 13 * s, cardNar(s) ? 2 * (CW / 2 - 348 * s) : cMaxW(s), 3);
      if (y + (ls.length - 1) * 16 * s > CH / 2 - (P.down ? 115 : 90) * s) continue;   // jangan sampai turun ke bidikan / LAST STAND
      ctx.globalAlpha = a; for (const l of ls) { text(l, CW / 2, y, 13 * s, mc, 'center'); y += 16 * s; } ctx.globalAlpha = 1; y += 2 * s;
    }
    if (!U.touch) M.topB = y;   // label penanda dunia menghindari tumpukan ini (hudZones)
    if (card) {
      const w = 320 * s, h = 46 * s, x = CW - 20 * s - w, y0 = Math.max(x < CW / 2 + 330 * s ? 104 * s : 16 * s, TOPY(), F.ccBot ? F.ccBot() + 8 * s : 0), k = clamp((P.time - card.m.t) * 6, 0, 1);   // layar sempit: di bawah kompas; kamera mini Clay: di bawahnya
      ctx.globalAlpha = card.a; ctx.save(); ctx.translate((1 - k) * 40 * s, 0);
      const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(20,22,24,.9)'); g.addColorStop(1, 'rgba(40,44,48,.75)'); ctx.fillStyle = g; ctx.fillRect(x, y0, w, h);
      ctx.fillStyle = CD.acc; ctx.fillRect(x + w - 4 * s, y0, 4 * s, h);
      ctx.font = 'bold ' + Math.round(12 * s) + 'px ' + HF; let t = card.m.text; while (ctx.measureText(t).width > w - 24 * s && t.length > 4) t = t.slice(0, -2);
      text(t === card.m.text ? t : t + '…', x + 12 * s, y0 + 20 * s, 12 * s, '#fff', 'left'); text(Tt('f_card'), x + 12 * s, y0 + 36 * s, 10 * s, CD.acc, 'left', false);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (M.hint > 0 && P.alive && !P.gs) { ctx.globalAlpha = clamp(M.hint, 0, 1) * .85; wrapC(Tt(U.touch ? 'pl_hint_tc' : 'f_hint_start'), null, 12 * s, '#fff', cMaxW(s)); ctx.globalAlpha = 1; }
  }
  function hintB(t, s, col, t0) {   // petunjuk bawah kamera udara; layar sentuh: dipecah per baris di tengah & hilang setelah ±7 detik
    if (!U.touch) { text(t, CW / 2, CH - 24 * s, 11 * s, col, 'center'); return; }
    const a = clamp(7 - (P.time - (t0 || 0)), 0, 1); if (a <= 0) return;
    const size = Math.max(9, 11 * s), maxW = Math.min(CW * .46, 420); ctx.font = Math.round(size) + 'px ' + HF; const ln = []; let cur = '';
    for (const q of t.split(' · ')) { const n = cur ? cur + ' · ' + q : q; if (cur && ctx.measureText(n).width > maxW) { ln.push(cur); cur = q; } else cur = n; }
    if (cur) ln.push(cur);
    ctx.globalAlpha = a; ln.forEach((l, i) => text(l, CW / 2, CH * .3 + i * (size + 5), size, col, 'center', false)); ctx.globalAlpha = 1;
  }
  /* antrean baris teks di bawah bidikan (reload, petunjuk granat, ajakan naik heli/kendaraan, meja senjata, poin kill, petunjuk awal):
     tiap teks mengambil baris berikutnya — dulu posisi tetap (+80/+100/+110/+130/+150) sehingga saling menimpa, apalagi di HP */
  let CY = 0, CYMAX = 0;
  /* HP: tumpukan atas-tengah di bawah kompas — bilah nyawa bos → spanduk bos → ketinggian parasut → kartu notifikasi → pesan.
     Dulu masing-masing posisi tetap (y 95–145 px di layar 390 px) sehingga saling menimpa. TY = batas bawah yang sudah terpakai. */
  let TY = 0;
  const topTake = h => { const y = TY; TY += h; return y; };
  const bigBan = () => { const b = P.bban; return b && (b.key === 'w_final_spawn' || b.key === 'w_final_hunt'); };
  const cardNar = s => CW - 340 * s < CW / 2 + 330 * s;   // layar sempit: kartu kanan turun ke bawah kompas, kolom tengah harus menghindarinya
  function wrapW(t, size, maxW, nMax) {   // bungkus per kata untuk pesan tengah PC
    ctx.font = 'bold ' + Math.round(size) + 'px ' + HF; const L = []; let ln = '';
    for (const wd of String(t).split(' ')) { const n = ln ? ln + ' ' + wd : wd; if (ln && ctx.measureText(n).width > maxW) { L.push(ln); ln = wd; } else ln = n; }
    if (ln) L.push(ln); if (L.length > nMax) { L.length = nMax; L[nMax - 1] += '…'; } return L;
  }
  function slotY(size, opt) {   // opt: teks yang boleh dilewati bila antrean sudah mencapai panel amunisi
    if (U.touch) size = Math.max(9, size * 1.06);
    const y = CY + size; if (opt && y > CYMAX) return null; CY = y + 6 * sc(); return y;
  }
  const cMaxW = s => Math.max(CW - 2 * 350 * s, Math.min(CW * .62, 560 * s));
  function wrapC(t, y, size, col, maxW) {   // teks tengah; dipecah pada ' · ' menjadi beberapa baris bila lebih lebar dari maxW
    ctx.font = Math.round(size) + 'px ' + HF; const parts = t.split(' · '), lines = []; let cur = '';
    for (const q of parts) { const n = cur ? cur + ' · ' + q : q; if (cur && ctx.measureText(n).width > maxW) { lines.push(cur); cur = q; } else cur = n; }
    if (cur) lines.push(cur);
    lines.forEach((l, i) => { const yy = y === null ? slotY(size, true) : y + i * (size + 5); if (yy !== null) text(l, CW / 2, yy, size, col, 'center', false); });
  }
  function streaks(s) {   // killstreak bertumpuk di kanan (di atas amunisi): nomor tombol, nama, bilah kemajuan kill
    if (U.touch) return;   // layar sentuh: killstreak siap pakai jadi tombol (fps-touch)
    const n = F.STREAKS.length, w = 176 * s, h = 24 * s, gap = 4 * s, x = CW - 24 * s - w, yb = (P.mnt || P.veh ? CH - 252 * s : CH - 112 * s);
    F.STREAKS.forEach((q, i) => {
      const y = yb - (n - 1 - i) * (h + gap) - h, rdy = P.slots[q.id] > 0, pulse = rdy ? .5 + .5 * Math.sin(P.time * 6) : 0;
      ctx.fillStyle = rdy ? 'rgba(255,155,47,' + (.28 + pulse * .22) + ')' : 'rgba(0,0,0,.42)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = rdy ? CD.acc : 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, h, h);
      text(String(q.key), x + h / 2, y + 16 * s, 13 * s, rdy ? '#111' : '#fff', 'center', true, false);
      text(Tt('f_streak_' + q.id), x + h + 8 * s, y + 15 * s, 10.5 * s, rdy ? '#fff' : 'rgba(255,255,255,.6)', 'left', rdy);
      if (P.slots[q.id] > 1) text('×' + P.slots[q.id], x + w - 6 * s, y + 15 * s, 11 * s, '#ffd24a', 'right');
      else if (q.id === 'UAV' && P.drone && !rdy) text(Math.ceil(P.uavT) + 's', x + w - 6 * s, y + 15 * s, 10 * s, '#7dff9d', 'right');   // drone masih mengudara: [3] masuk lagi
      else if (!rdy) text((P.sk || 0) + '/' + q.kills, x + w - 6 * s, y + 15 * s, 9.5 * s, 'rgba(255,255,255,.5)', 'right', false);
      const pr = rdy ? 1 : clamp((P.sk || 0) / q.kills, 0, 1); ctx.fillStyle = rdy ? '#ffd24a' : 'rgba(255,255,255,.5)'; ctx.fillRect(x + h, y + h - 2 * s, (w - h) * pr, 2 * s);
    });
    if (!P.mnt && !P.veh) text(Tt('f_credits') + ' ' + Math.floor(Q.cr) + ' · ' + Tt('f_callin_hint'), x + w, yb - n * (h + gap) - 4 * s, 10 * s, '#ffd24a', 'right', false);   // kredit di atas killstreak
  }

  /* garis pandang ke musuh (dicache supaya hemat) */
  function visibleTo(u) {
    const e = M.los.get(u.id); if (e && P.time - e.t < .3) return e.v;
    const ez = P.cam.z, hb = F.hitbox(u), tz = hb.z0 + hb.h * .6, dx = u.x - P.x, dy = u.y - P.y, dz = tz - ez, d = Math.hypot(dx, dy, dz);
    const v = d < 4 || F.rayTerrain(P.x, P.y, ez, dx / d, dy / d, dz / d, d - 2) < 0; M.los.set(u.id, { t: P.time, v }); return v;
  }
  const LB = [];   // kotak teks yang sudah terpakai frame ini [x0, y0, x1, y1]
  function hudZones(s) {   // area panel HUD tetap: minimap+skor, regu, killstreak, amunisi, kompas
    const zs = [[0, 0, 300 * s, leftY(s) + 125 * s], [0, CH - 200 * s, 340 * s, CH], [CW - 215 * s, CH - 300 * s, CW, CH], [CW - 345 * s, CH - 118 * s, CW, CH], [CW / 2 - 330 * s, 0, CW / 2 + 330 * s, U.touch ? 74 * s : Math.max(112 * s, M.topB || 0)]], cz = F.ccZone && F.ccZone();
    if (cz) zs.push(cz); return zs;
  }
  function lbl(t, x, y, size, col, bold) {   // teks tengah yang hanya digambar bila tempatnya kosong
    ctx.font = (bold === false ? '' : 'bold ') + Math.round(size) + 'px ' + HF; const w = ctx.measureText(t).width / 2 + 2, r = [x - w, y - size, x + w, y + 3];
    for (const b of LB) if (r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1]) return false;
    LB.push(r); text(t, x, y, size, col, 'center', bold); return true;
  }
  function tags(s) {
    LB.length = 0; LB.push(...hudZones(s));
    const uav = P.uavT > 0, scoped = F.WEAPONS[P.w[P.cur].id].scope && P.ads > .8, spotR = scoped ? 1300 : P.cls.spot, drawn = new Set();
    // gerombolan ratusan musuh: penanda hanya 70 unit terdekat, teks jarak hanya 14 musuh terdekat (layar tidak penuh tulisan)
    let cand = [];
    for (const u of Q.units) {
      if (u.dead || u === P.unit || u.chute > 0 || u.ctl || u.inV || u.cloakT > Q.t) continue; const d = Math.hypot(u.x - P.x, u.y - P.y); if (d > 1500) continue;
      if (u.struct && u.type !== 'HQ' && !((u.tagT || 0) > P.time)) continue;
      if (u.team === 'B' && d > 720) continue; cand.push([u, d]);
    }
    if (cand.length > 70) { cand.sort((a, b) => a[1] - b[1]); cand = cand.slice(0, 70); }
    let nTxt = 0;
    for (const [u, d] of cand) {
      const hb = F.hitbox(u), p = R.project(u.x, u.y, hb.z0 + hb.h + (hb.human ? .55 : 1.2), CW, CH); if (!p || p.x < -20 || p.x > CW + 20 || p.y < -20 || p.y > CH + 20) continue;
      if (u.team === 'R') {
        const tagged = (u.tagT || 0) > P.time, vis = d < spotR && visibleTo(u), rev = (uav && u.seen.B) || tagged || eagle(u);
        if (!vis && !rev) continue;
        const aware = F.knows(u), col = tagged ? '#ff9a2a' : aware ? '#ff3b3b' : '#ffd24a';   // kuning: belum tahu posisi Anda (+ "?" = waspada, sedang mencari) · merah: tahu posisi Anda · oranye: ditandai
        const sz = clamp(9 * s * 40 / Math.max(25, d) + 5 * s, 5 * s, 12 * s); ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; drawn.add(u.id);
        ctx.beginPath(); if (vis) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - sz, p.y - sz * 1.5); ctx.lineTo(p.x + sz, p.y - sz * 1.5); } else { ctx.moveTo(p.x, p.y - sz); ctx.lineTo(p.x + sz, p.y); ctx.lineTo(p.x, p.y + sz); ctx.lineTo(p.x - sz, p.y); } ctx.closePath(); ctx.fill(); ctx.stroke();
        if (!aware && (u.srch || u.bsus && u.bsus.end > Q.t) && vis) text('?', p.x + sz * 1.6, p.y - sz * .4, 13 * s, '#ffd24a', 'center', true);
        if (tagged && !vis) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, sz * 1.5, 0, 6.3); ctx.stroke(); }
        if ((nTxt < 14 || tagged) && lbl(Math.round(d) + 'm', p.x, p.y - sz * 1.9 - 2 * s, 10 * s, col)) {
          nTxt++;
          if ((vis && d < 140 && nTxt <= 6) || tagged) lbl(Tt('wu_' + u.type), p.x, p.y - sz * 1.9 - 13 * s, 10 * s, '#fff');
        }
      } else if (d < 90 && !u.struct && visibleTo(u)) {
        const sz = 5 * s; ctx.fillStyle = 'rgba(80,220,255,.9)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - sz, p.y - sz * 1.4); ctx.lineTo(p.x + sz, p.y - sz * 1.4); ctx.closePath(); ctx.fill();
        lbl(Tt('wu_' + u.type), p.x, p.y - sz * 1.7 - 2 * s, 9 * s, '#8fe6ff', false);
      }
    }
    // kontak tembakan: musuh yang baru menembak ke arah Anda, walau di luar jarak pandang
    let nC = 0;
    for (const [, c] of F.contacts) {
      const u = c.u; if (u.dead || drawn.has(u.id) || nC >= 8) continue; nC++; const age = P.time - c.t, hb = F.hitbox(u), p = R.project(u.x, u.y, hb.z0 + hb.h * .6, CW, CH); if (!p || p.x < 0 || p.x > CW || p.y < 0 || p.y > CH) continue;
      const a = clamp(1.4 - age / 2.5, 0, 1), sz = 9 * s; ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(p.x - sz, p.y - sz * 1.6); ctx.lineTo(p.x, p.y - sz * .4); ctx.lineTo(p.x + sz, p.y - sz * 1.6); ctx.stroke(); ctx.restore();
      ctx.globalAlpha = a; lbl(Tt('f_contact') + ' ' + Math.round(Math.hypot(u.x - P.x, u.y - P.y)) + 'm', p.x, p.y - sz * 2, 10 * s, '#ff8a8a'); ctx.globalAlpha = 1;
    }
    // pesawat/target penanda serangan
    for (const m of F.marks) { const p = R.project(m.x, m.y, F.hAt(m.x, m.y) + 4, CW, CH); if (p) { text((m.cmd ? '▼ ' + Tt('f_cmd_pt') + ' ' : '▼ ') + Math.round(Math.hypot(m.x - P.x, m.y - P.y)) + 'm', p.x, p.y, 12 * s, m.cmd ? '#37d7ff' : '#ff6b6b', 'center'); } }
  }
  function damage(s) {
    const cx = CW / 2, cy = CH / 2, r = 150 * s;
    for (const h of P.hurtDirs) { const a = clamp(1 - (P.time - h.t) / 2.2, 0, 1); ctx.save(); ctx.translate(cx, cy); ctx.rotate(h.a + Math.PI / 2); ctx.globalAlpha = a; const g = ctx.createLinearGradient(0, -r - 40 * s, 0, -r + 20 * s); g.addColorStop(0, 'rgba(255,40,40,.95)'); g.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -r - 34 * s); ctx.lineTo(-38 * s, -r + 18 * s); ctx.lineTo(38 * s, -r + 18 * s); ctx.closePath(); ctx.fill(); ctx.restore(); }
    const u = P.unit, hp = u ? clamp(u.hp / u.hpMax, 0, 1) : 1;
    if (hp < .6 || P.time - P.lastHurt < .35) {
      const k = clamp((.6 - hp) / .6, 0, 1) * (.65 + .2 * Math.sin(P.time * 7)) + clamp(1 - (P.time - P.lastHurt) / .35, 0, 1) * .35;
      const g = ctx.createRadialGradient(cx, cy, Math.min(CW, CH) * .25, cx, cy, Math.max(CW, CH) * .75); g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, 'rgba(150,0,0,' + clamp(k, 0, .85) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    }
  }
  function targeting(s) {
    if (!P.tgt) return;
    const p = F.designate(), cx = CW / 2, cy = CH / 2;
    const ty = P.gs ? cy + 92 * s : U.touch ? 150 * s : topTake(46 * s) + 16 * s;   // kamera drone: di bawah retikel, tidak menumpuk dengan petunjuk drone
    text(Tt(P.tgt.id === 'MORTAR' ? 'f_ci_MORTAR' : 'f_streak_' + P.tgt.id), cx, ty, 16 * s, '#ff6b6b', 'center'); text(Tt('f_tgt_hint'), cx, ty + 22 * s, 12 * s, '#ffd24a', 'center');
    ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 26 * s, 0, 6.3); ctx.moveTo(cx - 40 * s, cy); ctx.lineTo(cx - 12 * s, cy); ctx.moveTo(cx + 12 * s, cy); ctx.lineTo(cx + 40 * s, cy); ctx.moveTo(cx, cy - 40 * s); ctx.lineTo(cx, cy - 12 * s); ctx.moveTo(cx, cy + 12 * s); ctx.lineTo(cx, cy + 40 * s); ctx.stroke();
    if (p) { const pr = R.project(p.x, p.y, F.hAt(p.x, p.y), CW, CH), close = p.d < (P.tgt.id === 'MORTAR' ? 50 : 140); text(Math.round(p.d) + ' m' + (close ? ' ⚠' : ''), cx, cy + 56 * s, 13 * s, close ? '#ff3b3b' : '#9aff9a', 'center'); if (pr) { ctx.strokeStyle = close ? '#ff3b3b' : '#9aff9a'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 14 * s, 0, 6.3); ctx.stroke(); } }
  }
  function callin(s) {
    if (!M.ci) return;
    const x = 24 * s, y = 272 * s, w = 330 * s; ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(x, y, w, (F.CALLINS.length * 26 + 44) * s); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, (F.CALLINS.length * 26 + 44) * s);
    text(Tt('f_ci_title') + ' · ' + Math.floor(Q.cr), x + 12 * s, y + 24 * s, 14 * s, '#ffd24a');
    F.CALLINS.forEach((c, i) => { const ok = Q.cr >= c.cost, yy = y + (48 + i * 26) * s; text((i + 1) + '  ' + Tt('f_ci_' + c.id), x + 12 * s, yy, 12 * s, ok ? '#fff' : 'rgba(255,255,255,.35)'); text(String(c.cost), x + w - 12 * s, yy, 12 * s, ok ? '#ffd24a' : 'rgba(255,210,74,.35)', 'right'); });
  }
  function cmdPanel(s) {
    if (!M.cmd) return;
    const x = 24 * s, y = 272 * s, w = 330 * s, h = 306 * s; ctx.fillStyle = 'rgba(0,0,0,.66)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#37d7ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    text(Tt('f_cmd_title') + ' · ' + F.myArmy('ALL').length, x + 12 * s, y + 24 * s, 14 * s, '#37d7ff');
    F.ARMY_GRP.forEach((g, i) => {
      const on = M.grp === g, yy = y + (50 + i * 22) * s, n = F.myArmy(g).length;
      if (on) { ctx.fillStyle = 'rgba(55,215,255,.22)'; ctx.fillRect(x + 5 * s, yy - 15 * s, w - 10 * s, 20 * s); }
      text((i + 1) + '  ' + Tt('f_grp_' + g), x + 12 * s, yy, 12 * s, on ? '#37d7ff' : n ? '#cfe' : 'rgba(200,230,255,.4)'); text(String(n), x + w - 12 * s, yy, 12 * s, on ? '#37d7ff' : '#cfe', 'right');
    });
    ctx.fillStyle = 'rgba(55,215,255,.4)'; ctx.fillRect(x + 10 * s, y + 140 * s, w - 20 * s, 1);
    CMD_O.forEach((o, i) => text((i + 5) % 10 + '  ' + Tt('f_cmd_' + o), x + 12 * s, y + (162 + i * 22) * s, 12 * s, '#fff'));
    text(Tt('f_cmd_hint'), x + 12 * s, y + h - 8 * s, 9.5 * s, 'rgba(160,230,255,.7)');
  }
  /* ---------------- PETA TAKTIS & PAPAN SKOR versi HP (kanvas) ---------------- */
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const tu = () => clamp(CH / 400, .8, 1.8);   // satuan ukuran layar HP (±1 px pada tinggi 400)
  const accT = () => S.doc === 'us' ? '#4aa3ff' : '#3dff7a';
  const fitT = (t, mw) => { t = String(t); if (ctx.measureText(t).width <= mw) return t; while (t.length > 1 && ctx.measureText(t + '…').width > mw) t = t.slice(0, -1); return t + '…'; };
  function tt(t, x, y, size, col, align, bold, mw) {   // teks rapi tanpa bayangan (+ dipotong bila melebihi mw)
    ctx.font = (bold ? '700 ' : '400 ') + Math.round(size) + 'px ' + SANS; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = col;
    ctx.fillText(mw ? fitT(t, mw) : t, x, y);
  }
  function brackets(x, y, w, h, l, col, lw) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.moveTo(cx, cy + sy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * l, cy); }
    ctx.stroke();
  }
  function bigMapT(s, pick) {
    const u = tu(), ac = pick ? '#ff6b6b' : accT(), L = Math.max(12 * u, (U.hudL || 0) + 8), pw = Math.min(200 * u, CW * .3), gap = 10 * u, top = 10 * u;
    const aw = CW - 2 * L - pw - gap, ah = CH - 2 * top, terr = TK.warui && TK.warui.state.terr;
    const k = Math.min(aw / W.WW, ah / W.WH), w = W.WW * k, h = W.WH * k, x0 = L + (aw - w) / 2, y0 = top + (ah - h) / 2, X = x => x0 + x * k, Y = y => y0 + y * k;
    ctx.fillStyle = 'rgba(2,9,6,.9)'; ctx.fillRect(0, 0, CW, CH);
    const gl = ctx.createRadialGradient(x0 + w / 2, y0 + h / 2, 0, x0 + w / 2, y0 + h / 2, Math.max(w, h)); gl.addColorStop(0, ac + '1c'); gl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, CW, CH);
    ctx.save(); rr(x0, y0, w, h, 8 * u); ctx.clip();
    if (terr) ctx.drawImage(terr, x0, y0, w, h); else { ctx.fillStyle = '#0b1a10'; ctx.fillRect(x0, y0, w, h); }
    ctx.fillStyle = 'rgba(2,14,8,.28)'; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1; ctx.beginPath();   // kisi 500 m + label kolom/baris
    for (let x = 500; x < W.WW; x += 500) { ctx.moveTo(X(x), y0); ctx.lineTo(X(x), y0 + h); }
    for (let y = 500; y < W.WH; y += 500) { ctx.moveTo(x0, Y(y)); ctx.lineTo(x0 + w, Y(y)); }
    ctx.stroke();
    for (let i = 0; i * 500 < W.WW; i++) tt(String.fromCharCode(65 + i), X(i * 500 + 250), y0 + 10 * u, 8 * u, 'rgba(230,245,235,.45)', 'center', true);
    for (let j = 0; j * 500 < W.WH; j++) tt(String(j + 1), x0 + 4 * u, Y(j * 500 + 250) + 3 * u, 8 * u, 'rgba(230,245,235,.45)', 'left', true);
    const vg = ctx.createRadialGradient(x0 + w / 2, y0 + h / 2, Math.min(w, h) * .35, x0 + w / 2, y0 + h / 2, Math.max(w, h) * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(x0, y0, w, h);
    for (const [hq, col] of [[Q.hqB, OWN.B], [Q.hqR, OWN.R]]) {   // markas: lencana bulat sudut + nyawa
      const x = X(hq.x), y = Y(hq.y), bw = 26 * u, bh = 15 * u; ctx.fillStyle = col; rr(x - bw / 2, y - bh / 2, bw, bh, 4 * u); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      tt('HQ', x, y + 3.6 * u, 10 * u, '#04100a', 'center', true); tt(Math.round(clamp(hq.hp / hq.hpMax, 0, 1) * 100) + '%', x, y + bh / 2 + 11 * u, 9 * u, col, 'center', true);
    }
    Q.objs.forEach((o, i) => {
      const x = X(o.x), y = Y(o.y), r = Math.max(o.r * k, 10 * u), col = OWN[o.owner];
      ctx.fillStyle = col + '26'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.strokeStyle = col + 'aa'; ctx.lineWidth = 1.2 * u; ctx.setLineDash([4 * u, 3 * u]); ctx.stroke(); ctx.setLineDash([]);
      if (o.prog) { ctx.strokeStyle = o.prog > 0 ? OWN.B : OWN.R; ctx.lineWidth = 3 * u; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r + 3 * u, -Math.PI / 2, -Math.PI / 2 + Math.abs(o.prog) * 6.283); ctx.stroke(); ctx.lineCap = 'butt'; }
      ctx.fillStyle = 'rgba(3,10,7,.85)'; ctx.beginPath(); ctx.arc(x, y, 9 * u, 0, 6.3); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * u; ctx.stroke();
      tt(String.fromCharCode(65 + i), x, y + 4.2 * u, 12 * u, col, 'center', true);
      if (o.boss && !o.boss.dead) tt('☠', x + r * .8, y - r * .8, 12 * u, '#ff6b6b', 'center', true);
    });
    const uav = P.uavT > 0, me = P.mnt && P.heli ? P.heli : P;
    for (const t of Q.units) {
      if (t.dead || t === P.unit || t.struct || t.inV) continue; const x = X(t.x), y = Y(t.y), big = UT[t.type].boss || UT[t.type].final;
      if (t.team === 'B') { ctx.fillStyle = t.mine ? '#7dff9d' : OWN.B; ctx.beginPath(); ctx.arc(x, y, (t.fly ? 2.8 : 2.2) * u, 0, 6.3); ctx.fill(); }
      else if (big || t.seen.B || t.revealT > Q.t || (uav && t.seen.B) || (t.tagT || 0) > P.time) {
        const r = (big ? 7 : 3.4) * u; ctx.fillStyle = (t.tagT || 0) > P.time ? '#ff9a2a' : '#ff3b3b';
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .9, y + r * .8); ctx.lineTo(x - r * .9, y + r * .8); ctx.closePath(); ctx.fill();
        if (big) tt('☠ ' + Tt('wu_' + t.type), x, y - r - 4 * u, 9 * u, '#ff6b6b', 'center', true);
      }
    }
    for (const m of F.marks) tt('▼', X(m.x), Y(m.y), 11 * u, m.cmd ? '#37d7ff' : '#ff6b6b', 'center', true);
    const yaw = P.mnt && P.heli ? P.heli.yaw : P.yaw, mx = X(me.x), my = Y(me.y);
    const cone = ctx.createRadialGradient(mx, my, 0, mx, my, 46 * u); cone.addColorStop(0, 'rgba(255,210,74,.35)'); cone.addColorStop(1, 'rgba(255,210,74,0)');   // kerucut arah pandang
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(mx, my); ctx.arc(mx, my, 46 * u, yaw - .5, yaw + .5); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(mx, my); ctx.rotate(yaw); ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(9 * u, 0); ctx.lineTo(-6 * u, 6 * u); ctx.lineTo(-3 * u, 0); ctx.lineTo(-6 * u, -6 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,230,190,.22)'; ctx.lineWidth = 1; rr(x0 + .5, y0 + .5, w - 1, h - 1, 8 * u); ctx.stroke(); brackets(x0 - 3 * u, y0 - 3 * u, w + 6 * u, h + 6 * u, 14 * u, ac, 2 * u);
    tt('N', x0 + w - 12 * u, y0 + 16 * u, 11 * u, '#ffd24a', 'center', true); ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(x0 + w - 12 * u, y0 + 3 * u); ctx.lineTo(x0 + w - 8 * u, y0 + 7.5 * u); ctx.lineTo(x0 + w - 16 * u, y0 + 7.5 * u); ctx.fill();
    // panel kanan: judul, status pos, HQ, legenda
    const px = CW - L - pw, py = top, ph = ah, ip = 12 * u, iw = pw - ip * 2;
    const bg = ctx.createLinearGradient(px, py, px, py + ph); bg.addColorStop(0, 'rgba(12,34,22,.94)'); bg.addColorStop(1, 'rgba(4,12,8,.94)'); ctx.fillStyle = bg; rr(px, py, pw, ph, 10 * u); ctx.fill();
    ctx.strokeStyle = 'rgba(160,230,190,.16)'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = ac; ctx.fillRect(px + ip, py + 12 * u, 3 * u, 26 * u);
    let yy = py + (pick && U.touch ? 62 : 25) * u; tt(pick ? Tt(F.pickKey(P.gs.pk)) : Tt('f_map'), px + ip + 9 * u, yy, 14 * u, '#eef8f1', 'left', true, iw - 9 * u);
    const tm = Math.floor(Q.t); tt(pick ? Math.max(0, Math.ceil(P.gs.t)) + ' s · ' + Tt(F.pickKey(P.gs.pk) + '_h') : Tt('f_sb_time') + ' ' + pad(tm / 60) + ':' + pad(tm % 60) + ' · ' + Tt('w_d' + (Q.diff || 0)), px + ip + 9 * u, yy + 12 * u, 8.5 * u, pick ? '#ffb0b0' : 'rgba(210,235,220,.6)', 'left', false, iw - 9 * u);
    yy += 30 * u; tt(Tt('f_tk_posts'), px + ip, yy, 8.5 * u, 'rgba(210,235,220,.55)', 'left', true); yy += 6 * u;
    const rh = clamp((ph - 175 * u) / Math.max(1, Q.objs.length), 17 * u, 26 * u);
    Q.objs.forEach((o, i) => {
      const col = OWN[o.owner], cy = yy + rh / 2;
      ctx.fillStyle = col + '22'; rr(px + ip, yy + 1, iw, rh - 3 * u, 5 * u); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px + ip + 10 * u, cy - u, 7 * u, 0, 6.3); ctx.fill(); tt(String.fromCharCode(65 + i), px + ip + 10 * u, cy + 2.4 * u, 9.5 * u, '#04100a', 'center', true);
      tt(Tt('w_own_' + o.owner), px + ip + iw - 6 * u, cy + 2.5 * u, 8 * u, col, 'right', true);
      ctx.font = '700 ' + Math.round(8 * u) + 'px ' + SANS; const ow = ctx.measureText(Tt('w_own_' + o.owner)).width;
      tt((o.boss && !o.boss.dead ? '☠ ' : '') + o.name, px + ip + 22 * u, cy + 3 * u, 9.5 * u, '#e6f3ea', 'left', false, iw - 34 * u - ow);
      if (o.prog) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px + ip + 22 * u, yy + rh - 6 * u, iw - 28 * u, 2 * u); ctx.fillStyle = o.prog > 0 ? OWN.B : OWN.R; ctx.fillRect(px + ip + 22 * u, yy + rh - 6 * u, (iw - 28 * u) * Math.abs(o.prog), 2 * u); }
      yy += rh;
    });
    yy += 8 * u; tt('HQ', px + ip, yy, 8.5 * u, 'rgba(210,235,220,.55)', 'left', true); yy += 5 * u;
    for (const [hq, col, lb] of [[Q.hqB, OWN.B, Tt('f_tk_hqb')], [Q.hqR, OWN.R, Tt('f_hq_foe')]]) {
      const v = clamp(hq.hp / hq.hpMax, 0, 1); tt(lb, px + ip, yy + 9 * u, 8.5 * u, '#e6f3ea', 'left', true); tt(Math.round(v * 100) + '%', px + ip + iw, yy + 9 * u, 8.5 * u, col, 'right', true);
      ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(px + ip, yy + 12 * u, iw, 4 * u, 2 * u); ctx.fill(); if (v > .01) { ctx.fillStyle = col; rr(px + ip, yy + 12 * u, iw * v, 4 * u, 2 * u); ctx.fill(); }
      yy += 21 * u;
    }
    const lg = [[OWN.B, Tt('f_map_ally'), 0], ['#7dff9d', Tt('f_map_mine'), 0], ['#ff3b3b', Tt('f_map_enemy'), 1], ['#ffd24a', Tt('f_you'), 2]], ly = py + ph - 44 * u;
    lg.forEach((l, i) => {
      const lx = px + ip + (i % 2) * iw / 2, y = ly + Math.floor(i / 2) * 13 * u; ctx.fillStyle = l[0]; ctx.beginPath();
      if (l[2] === 1) { ctx.moveTo(lx + 4 * u, y - 7 * u); ctx.lineTo(lx + 8 * u, y); ctx.lineTo(lx, y); } else if (l[2] === 2) { ctx.moveTo(lx + 8 * u, y - 3.5 * u); ctx.lineTo(lx, y); ctx.lineTo(lx + 2 * u, y - 3.5 * u); ctx.lineTo(lx, y - 7 * u); } else ctx.arc(lx + 4 * u, y - 3.5 * u, 3 * u, 0, 6.3);
      ctx.fill(); tt(l[1], lx + 12 * u, y, 8 * u, 'rgba(225,240,230,.8)', 'left', false, iw / 2 - 14 * u);
    });
    if (!pick) tt(Tt('f_tk_close'), px + pw / 2, py + ph - 10 * u, 7.5 * u, 'rgba(210,235,220,.45)', 'center', true, iw);
    return { X, Y, k };
  }
  function scoreT() {
    const u = tu(), ac = accT(), w = Math.min(CW - 40 * u, 540 * u), h = Math.min(CH - 24 * u, 244 * u), x = (CW - w) / 2, y = (CH - h) / 2, ip = 16 * u, iw = w - ip * 2, tm = Math.floor(Q.t);
    ctx.fillStyle = 'rgba(0,5,3,.62)'; ctx.fillRect(0, 0, CW, CH);
    const bg = ctx.createLinearGradient(x, y, x + w * .4, y + h); bg.addColorStop(0, 'rgba(16,44,28,.96)'); bg.addColorStop(1, 'rgba(3,11,7,.96)'); ctx.fillStyle = bg; rr(x, y, w, h, 12 * u); ctx.fill();
    ctx.strokeStyle = 'rgba(160,230,190,.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); rr(x, y, w, h, 12 * u); ctx.clip(); const tg = ctx.createLinearGradient(x, 0, x + w, 0); tg.addColorStop(0, ac); tg.addColorStop(1, ac + '00'); ctx.fillStyle = tg; ctx.fillRect(x, y, w, 3 * u); ctx.restore();
    let yy = y + 28 * u; ctx.fillStyle = ac; ctx.fillRect(x + ip, yy - 15 * u, 3 * u, 20 * u);
    tt(Tt('f_tk_sb'), x + ip + 10 * u, yy - 1 * u, 15 * u, '#eef8f1', 'left', true); tt(opName(), x + ip + 10 * u, yy + 10 * u, 8.5 * u, 'rgba(210,235,220,.55)', 'left', false, iw * .55);
    tt(Tt('f_rank_' + F.rank()), x + w - ip, yy - 1 * u, 12 * u, '#ffd24a', 'right', true); tt(Tt('f_sb_time') + ' ' + pad(tm / 60) + ':' + pad(tm % 60), x + w - ip, yy + 10 * u, 8.5 * u, 'rgba(210,235,220,.6)', 'right', false);
    yy += 24 * u;   // baris 1: skor besar + 4 ubin
    const sw = 120 * u; ctx.fillStyle = ac + '18'; rr(x + ip, yy, sw, 66 * u, 8 * u); ctx.fill(); ctx.strokeStyle = ac + '55'; ctx.stroke();
    tt(Tt('f_sc'), x + ip + 10 * u, yy + 16 * u, 8.5 * u, ac, 'left', true); tt(String(P.score), x + ip + 10 * u, yy + 52 * u, 34 * u, '#ffffff', 'left', true, sw - 16 * u);
    const tiles = [[Tt('f_tk_k'), P.kills, '#ffffff'], [Tt('f_tk_d'), P.deaths, '#ff8a7a'], [Tt('f_tk_hs'), P.hs, '#ffd24a'], [Tt('f_tk_st'), P.best, ac]], tx0 = x + ip + sw + 8 * u, tw = (x + w - ip - tx0 - 3 * 6 * u) / 4;
    tiles.forEach((t, i) => {
      const bx = tx0 + i * (tw + 6 * u); ctx.fillStyle = 'rgba(255,255,255,.045)'; rr(bx, yy, tw, 66 * u, 8 * u); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke();
      tt(String(t[1]), bx + tw / 2, yy + 38 * u, 24 * u, t[2], 'center', true); tt(t[0], bx + tw / 2, yy + 56 * u, 7.5 * u, 'rgba(210,235,220,.6)', 'center', true, tw - 6 * u);
    });
    yy += 80 * u;   // baris 2: rasio K/D, damage, kill tim, kemajuan killstreak berikut
    const nx = F.STREAKS.find(q => (P.sk || 0) < q.kills), kd = P.deaths ? (P.kills / P.deaths).toFixed(2) : String(P.kills);
    const st2 = [[Tt('f_tk_kd'), kd], [Tt('f_sb_dmg'), Math.round(P.dmgTaken)], [Tt('w_l_kill'), Q.stats.kills]], cw = iw * .58 / 3;
    st2.forEach((t, i) => { const bx = x + ip + i * cw; if (i) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(bx - 1, yy - 2 * u, 1, 26 * u); } tt(String(t[1]), bx + (i ? 10 * u : 0), yy + 12 * u, 15 * u, '#eef8f1', 'left', true); tt(t[0], bx + (i ? 10 * u : 0), yy + 23 * u, 7.5 * u, 'rgba(210,235,220,.55)', 'left', true, cw - 14 * u); });
    const kx = x + ip + iw * .62, kw = iw * .38, pr = nx ? clamp((P.sk || 0) / nx.kills, 0, 1) : 1;
    tt(Tt('f_tk_nx'), kx, yy + 5 * u, 7.5 * u, 'rgba(210,235,220,.55)', 'left', true); tt(nx ? Tt('f_streak_' + nx.id) + ' · ' + (P.sk || 0) + '/' + nx.kills : '★ MAX', kx + kw, yy + 5 * u, 8 * u, '#ffd24a', 'right', true, kw * .6);
    ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(kx, yy + 12 * u, kw, 6 * u, 3 * u); ctx.fill(); if (pr > .01) { const g = ctx.createLinearGradient(kx, 0, kx + kw, 0); g.addColorStop(0, '#ff9b2f'); g.addColorStop(1, '#ffd24a'); ctx.fillStyle = g; rr(kx, yy + 12 * u, kw * pr, 6 * u, 3 * u); ctx.fill(); }
    yy += 40 * u;   // baris 3: pos + HQ
    tt(Tt('f_tk_posts'), x + ip, yy, 7.5 * u, 'rgba(210,235,220,.55)', 'left', true);
    const n = Q.objs.length, ow = Math.min(46 * u, (iw * .5 - (n - 1) * 5 * u) / Math.max(1, n));
    Q.objs.forEach((o, i) => {
      const bx = x + ip + i * (ow + 5 * u), by = yy + 6 * u, col = OWN[o.owner]; ctx.fillStyle = col + '30'; rr(bx, by, ow, 22 * u, 6 * u); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.2 * u; ctx.stroke();
      tt(String.fromCharCode(65 + i), bx + ow / 2, by + 15.5 * u, 11 * u, col, 'center', true);
      if (o.prog) { ctx.fillStyle = o.prog > 0 ? OWN.B : OWN.R; ctx.fillRect(bx + 4 * u, by + 19 * u, (ow - 8 * u) * Math.abs(o.prog), 1.6 * u); }
    });
    const hx = x + ip + iw * .56, hw = iw * .44;
    [[Q.hqB, OWN.B, Tt('f_tk_hqb')], [Q.hqR, OWN.R, Tt('f_hq_foe')]].forEach(([hq, col, lb], i) => {
      const by = yy + 2 * u + i * 16 * u, v = clamp(hq.hp / hq.hpMax, 0, 1); tt(lb, hx, by + 8 * u, 8 * u, '#e6f3ea', 'left', true); tt(Math.round(v * 100) + '%', hx + hw, by + 8 * u, 8 * u, col, 'right', true);
      ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(hx + hw * .36, by + 3 * u, hw * .46, 5 * u, 2.5 * u); ctx.fill(); if (v > .01) { ctx.fillStyle = col; rr(hx + hw * .36, by + 3 * u, hw * .46 * v, 5 * u, 2.5 * u); ctx.fill(); }
    });
    tt(Tt('f_tk_close_sb'), x + w / 2, y + h - 10 * u, 7.5 * u, 'rgba(210,235,220,.45)', 'center', true);
  }
  function scoreboard(s) {
    if (!M.sb) return;
    if (!U.oldUI) return scoreT();
    const w = 440 * s, h = 250 * s, x = (CW - w) / 2, y = (CH - h) / 2; ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#37d7ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    text(Tt('f_sb'), x + 16 * s, y + 28 * s, 16 * s, '#37d7ff'); const t = Math.floor(Q.t);
    const rows = [[Tt('f_sc'), P.score], [Tt('f_kd'), P.kills + ' / ' + P.deaths], [Tt('f_hs'), P.hs], [Tt('f_sb_best'), P.best], [Tt('f_sb_dmg'), Math.round(P.dmgTaken)], [Tt('w_l_kill'), Q.stats.kills], [Tt('f_rank'), Tt('f_rank_' + F.rank())], [Tt('f_sb_time'), pad(t / 60) + ':' + pad(t % 60)]];
    rows.forEach((r, i) => { const yy = y + (58 + i * 22) * s; text(String(r[0]), x + 16 * s, yy, 13 * s, '#cfe'); text(String(r[1]), x + w - 16 * s, yy, 13 * s, '#fff', 'right'); });
    const ow = Q.objs.map((o, i) => String.fromCharCode(65 + i) + ':' + Tt('w_own_' + o.owner)).join('  '); text(ow, x + 16 * s, y + h - 14 * s, 11 * s, '#ffd24a');
  }
  /* peta taktis layar penuh [M]: utara di atas, permainan tetap berjalan di belakangnya */
  function bigMap(s, pick) {   // pick: dipakai memilih sasaran rudal Predator → { X, Y, k } (dunia → layar)
    if (!M.map && !pick) return;
    if (!U.oldUI) return bigMapT(s, pick);
    const terr = TK.warui && TK.warui.state.terr, top = 52 * s, k = Math.min((CW - 60 * s) / W.WW, (CH - top - 40 * s) / W.WH);
    const w = W.WW * k, h = W.WH * k, x0 = (CW - w) / 2, y0 = top + (CH - top - 40 * s - h) / 2, X = x => x0 + x * k, Y = y => y0 + y * k;
    ctx.fillStyle = 'rgba(0,6,4,.72)'; ctx.fillRect(0, 0, CW, CH);
    if (terr) ctx.drawImage(terr, x0, y0, w, h); else { ctx.fillStyle = '#0b1a10'; ctx.fillRect(x0, y0, w, h); }
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.beginPath();   // kisi 500 m
    for (let x = 500; x < W.WW; x += 500) { ctx.moveTo(X(x), y0); ctx.lineTo(X(x), y0 + h); }
    for (let y = 500; y < W.WH; y += 500) { ctx.moveTo(x0, Y(y)); ctx.lineTo(x0 + w, Y(y)); }
    ctx.stroke(); ctx.strokeStyle = '#37d7ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, w, h);
    text(pick ? Tt(F.pickKey(P.gs.pk)) + ' · ' + Math.max(0, Math.ceil(P.gs.t)) + ' s' : Tt('f_map'), x0, y0 - 12 * s, 16 * s, pick ? '#ff6b6b' : '#37d7ff'); text(Tt(pick ? F.pickKey(P.gs.pk) + '_h' : 'f_map_hint'), x0 + w, y0 - 12 * s, 11 * s, 'rgba(200,230,255,.75)', 'right', false);
    text('N ▲', x0 + w - 8 * s, y0 + 20 * s, 12 * s, '#ffd24a', 'right');
    for (const [hq, col] of [[Q.hqB, OWN.B], [Q.hqR, OWN.R]]) {
      const x = X(hq.x), y = Y(hq.y), r = 9 * s; ctx.fillStyle = col; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeStyle = '#000'; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      text('HQ', x, y + 4 * s, 9 * s, '#000', 'center', true, false); text(Math.round(clamp(hq.hp / hq.hpMax, 0, 1) * 100) + '%', x, y + r + 13 * s, 10 * s, col, 'center');
    }
    Q.objs.forEach((o, i) => {
      const x = X(o.x), y = Y(o.y), r = Math.max(o.r * k, 10 * s), col = OWN[o.owner];
      ctx.fillStyle = col + '33'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      if (o.prog) { ctx.strokeStyle = o.prog > 0 ? OWN.B : OWN.R; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(x, y, r + 4 * s, -Math.PI / 2, -Math.PI / 2 + Math.abs(o.prog) * 6.283); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(x, y, 11 * s, 0, 6.3); ctx.fill();
      text(String.fromCharCode(65 + i), x, y + 6 * s, 16 * s, col, 'center');
      text(o.name, x, y + r + 14 * s, 10 * s, '#fff', 'center', false);
      if (o.boss && !o.boss.dead) text('☠', x + r, y - r + 4 * s, 14 * s, '#ff6b6b', 'center');
    });
    const uav = P.uavT > 0, me = P.mnt && P.heli ? P.heli : P;
    for (const u of Q.units) {
      if (u.dead || u === P.unit || u.struct || u.inV) continue; const x = X(u.x), y = Y(u.y), big = UT[u.type].boss || UT[u.type].final;
      if (u.team === 'B') { ctx.fillStyle = u.mine ? '#7dff9d' : OWN.B; ctx.beginPath(); ctx.arc(x, y, (u.fly ? 3 : 2.4) * s, 0, 6.3); ctx.fill(); }
      else if (big || u.seen.B || u.revealT > Q.t || (uav && u.seen.B) || (u.tagT || 0) > P.time) {
        const r = (big ? 7 : 3.6) * s; ctx.fillStyle = (u.tagT || 0) > P.time ? '#ff9a2a' : '#ff3b3b';
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .9, y + r * .8); ctx.lineTo(x - r * .9, y + r * .8); ctx.closePath(); ctx.fill();
        if (big) text('☠ ' + Tt('wu_' + u.type), x, y - r - 4 * s, 10 * s, '#ff6b6b', 'center');
      }
    }
    for (const m of F.marks) { ctx.fillStyle = m.cmd ? '#37d7ff' : '#ff6b6b'; text('▼', X(m.x), Y(m.y), 12 * s, ctx.fillStyle, 'center'); }
    ctx.save(); ctx.translate(X(me.x), Y(me.y)); ctx.rotate(P.mnt && P.heli ? P.heli.yaw : P.yaw);   // panah pemain menunjuk arah pandang
    ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10 * s, 0); ctx.lineTo(-6 * s, 6.5 * s); ctx.lineTo(-3 * s, 0); ctx.lineTo(-6 * s, -6.5 * s); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    text(Tt('f_you'), X(me.x), Y(me.y) - 12 * s, 10 * s, '#ffd24a', 'center');
    const lg = [[OWN.B, Tt('f_map_ally')], ['#7dff9d', Tt('f_map_mine')], ['#ff3b3b', Tt('f_map_enemy')], ['#ffd24a', Tt('f_you')]];
    lg.forEach((l, i) => { const lx = x0 + i * 150 * s; ctx.fillStyle = l[0]; ctx.fillRect(lx, y0 + h + 12 * s, 10 * s, 10 * s); text(l[1], lx + 15 * s, y0 + h + 21 * s, 11 * s, '#cfe', 'left', false); });
    return { X, Y, k };
  }
  function deadScreen(s) {
    const t = P.deadT, a = clamp((t - .55) / 1.1, 0, 1), red = clamp(1 - t / .7, 0, 1);   // kilat merah saat tertembak, layar baru meredup setelah tubuh menghantam tanah
    if (red > 0) { const g = ctx.createRadialGradient(CW / 2, CH / 2, CH * .2, CW / 2, CH / 2, CH * .9); g.addColorStop(0, 'rgba(160,0,0,' + .18 * red + ')'); g.addColorStop(1, 'rgba(120,0,0,' + .7 * red + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); }
    const v = ctx.createRadialGradient(CW / 2, CH / 2, CH * .25, CW / 2, CH / 2, CH * .85); v.addColorStop(0, 'rgba(0,0,0,' + .35 * a + ')'); v.addColorStop(1, 'rgba(0,0,0,' + (.35 + .5 * a) + ')'); ctx.fillStyle = v; ctx.fillRect(0, 0, CW, CH);
    const k = P.killerInfo; ctx.globalAlpha = a; text(Tt('f_dead'), CW / 2, CH / 2 - 10 * s, 38 * s, '#ff4a4a', 'center');
    text(k ? Tt('f_killedby', { u: Tt('wu_' + k.type), d: Math.round(k.d) }) : Tt('f_killedby0'), CW / 2, CH / 2 + 22 * s, 15 * s, '#fff', 'center'); text(Tt('f_respawn') + ' …', CW / 2, CH / 2 + 50 * s, 12 * s, '#ffd24a', 'center'); ctx.globalAlpha = 1;
  }
  function chuteHud(s) {
    if (!P.chute) return;
    if (U.touch) {   // HP: satu baris ringkas di tumpukan atas-tengah (dulu 3 baris di y 24% layar = menimpa bilah bos & pesan)
      if (M.cine) return; const alt = Math.max(0, P.z - F.hAt(P.x, P.y)), y = topTake(24 * s) + 17 * s;
      ctx.font = 'bold ' + Math.round(Math.max(9, 16 * s * 1.06)) + 'px ' + HF; const t1 = Tt('f_alt') + ' ' + Math.round(alt) + ' m', w1 = ctx.measureText(t1).width;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(CW / 2 - w1 / 2 - 70 * s, y - 15 * s, w1 + 140 * s, 21 * s);
      text(t1, CW / 2, y, 16 * s, '#ffd24a', 'center', true, false);
      text(P.chute === 1 ? 'FREEFALL' : 'PARACHUTE', CW / 2 - w1 / 2 - 8 * s, y, 11 * s, '#cfe', 'right', true, false);
      text(Math.round(-P.vz) + ' m/s', CW / 2 + w1 / 2 + 8 * s, y, 11 * s, '#fff', 'left', true, false); return;
    }
    const alt = Math.max(0, P.z - F.hAt(P.x, P.y)), x = U.touch ? CW / 2 : CW - 120 * s, y0 = U.touch ? CH * .24 : CH / 2;   // layar sentuh: tengah atas (kanan = tombol)
    text(Tt('f_alt') + ' ' + Math.round(alt) + ' m', x, y0, 16 * s, '#ffd24a', 'center'); text(P.chute === 1 ? 'FREEFALL' : 'PARACHUTE', x, y0 + 20 * s, 12 * s, '#cfe', 'center');
    text(Math.round(-P.vz) + ' m/s', x, y0 + 38 * s, 12 * s, '#fff', 'center');
  }
  /* bar nyawa bos terdekat (≤1100 m atau sudah diumumkan) + spanduk peringatan besar saat bos muncul/tumbang */
  function bossHud(s) {
    let b = null, bd = 1100;
    for (const u of Q.units) { if (!u.boss || u.dead) continue; const d = Math.hypot(u.x - P.x, u.y - P.y); if (d < bd || (u === Q.fb && !b)) { bd = Math.min(bd, d); b = u; } }
    M.bossOn = !!b;
    if (b) {
      const T = UT[b.type], w = U.touch ? Math.min(380 * s, CW * .44) : 380 * s, x = (CW - w) / 2, y = topTake(30 * s) + 16 * s, f = clamp(b.hp / b.hpMax, 0, 1);
      text('☠ ' + Tt(T.final ? 'w_final_tag' : T.raid ? 'w_raid_tag' : 'w_boss_tag') + ' · ' + Tt('wu_' + b.type), CW / 2, y - 4 * s, 11.5 * s, T.final ? '#ff4a4a' : '#ff8a5a', 'center');
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y, w, 9 * s); ctx.fillStyle = T.final ? '#d81e1e' : '#e2552a'; ctx.fillRect(x, y, w * f, 9 * s);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; for (const m of T.final || T.raid ? [.66, .33] : [.5]) ctx.fillRect(x + w * m - 1, y - 2 * s, 2, 13 * s);   // batas fase
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, 9 * s);
      text(Math.ceil(f * 100) + '%', x + w + 8 * s, y + 8 * s, 10 * s, '#fff');
    }
    const FBS = F.fbBar && F.fbBar.s;
    if (FBS && FBS.t < F.FBBAR.warn + .3 && Math.hypot(P.x - FBS.x, P.y - FBS.y) < F.FBBAR.r + 45) {   // hanya bila operator di dalam / dekat zona (sasaran bisa pasukan kita)
     {   // hujan artileri bos akhir: tepi layar berdenyut merah + jarak ke luar zona
      const k = .45 + .35 * Math.sin(P.time * 14), dz = Math.hypot(P.x - FBS.x, P.y - FBS.y), out = Math.max(0, F.FBBAR.r + 4 - dz);
      const g = ctx.createRadialGradient(CW / 2, CH / 2, CH * .35, CW / 2, CH / 2, CH * .9); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(255,20,10,' + (.45 * k) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      const fy = slotY(16 * s);   // HP: ikut antrean bawah bidikan
      text(out > 0 ? '⚠ ' + Tt('f_fb_run', { m: Math.ceil(out) }) + ' ⚠' : Tt('f_fb_safe'), CW / 2, fy, 16 * s, out > 0 ? '#ff4a3a' : '#7dff9d', 'center');
      text(Math.max(0, F.FBBAR.warn - FBS.t).toFixed(1) + ' s', CW / 2, slotY(13 * s), 13 * s, '#fff', 'center');
    } }
    const bb = P.bban; if (!bb) return;
    const big = bb.key === 'w_final_spawn' || bb.key === 'w_final_hunt', dur = big ? 5 : 3.6, el = P.time - bb.t;
    const a = clamp(dur - el, 0, 1); if (a <= 0) { P.bban = null; return; }
    if (big) {   // bos akhir: bilah sinematik, layar memerah, nama raksasa, kalimat ancaman
      M.cine = true;   // HP: kartu/pesan/parasut atas-tengah disembunyikan selama spanduk sinematik
      const inK = clamp(el / .45, 0, 1), bh = CH * .12 * inK * a;
      ctx.fillStyle = 'rgba(0,0,0,.92)'; ctx.fillRect(0, 0, CW, bh); ctx.fillRect(0, CH - bh, CW, bh);
      const g = ctx.createRadialGradient(CW / 2, CH / 2, CH * .2, CW / 2, CH / 2, CH); g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, 'rgba(150,0,0,' + (.5 * a * (.75 + .25 * Math.sin(P.time * 6))) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      const T0 = UT[bb.u.type], sh = el < .6 ? (Math.random() - .5) * 8 * s * (1 - el / .6) : 0;
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, CH * .36, CW, CH * .26);
      ctx.fillStyle = '#d81e1e'; ctx.fillRect(0, CH * .36, CW * inK, 2 * s); ctx.fillRect(CW * (1 - inK), CH * .62 - 2 * s, CW * inK, 2 * s);
      text('⚠  ' + Tt('w_final_tag') + '  ⚠', CW / 2 + sh, CH * .36 + 26 * s, 15 * s, '#ff3030', 'center');
      text(Tt('wu_' + bb.u.type), CW / 2 + sh, CH * .36 + 64 * s, 34 * s, '#ffffff', 'center');
      text(Tt(bb.key === 'w_final_hunt' ? 'f_fb_hunt' : 'f_fb_rise', { hp: Math.round(bb.u.hpMax) }), CW / 2, CH * .36 + 90 * s, 13 * s, '#ffb0a0', 'center', false);
      ctx.globalAlpha = 1; return;
    }
    const dead = bb.key.endsWith('_dead'), fin = bb.key.startsWith('w_final'), rd = bb.key.startsWith('w_raid'), col = dead ? '#7dff9d' : fin || rd ? '#ff3030' : '#ffb000', tag = fin ? 'w_final_tag' : rd ? 'w_raid_tag' : 'w_boss_tag';
    const by = topTake((U.touch ? 58 : 70) * s) + 2 * s;   // HP: spanduk di bawah bilah nyawa bos (dulu menimpanya)
    const bx = U.touch ? Math.max(CW * .18, (MM.x + MM.r * 2 + 14) * s + LX()) : Math.max(300 * s, cardNar(s) ? 348 * s : 0);   // HP: pita hanya di kolom tengah (tidak menutupi minimap & skor)
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by, CW - 2 * bx, (U.touch ? 52 : 64) * s); ctx.fillStyle = col; ctx.fillRect(bx, by, CW - 2 * bx, 2 * s);
    text(dead ? Tt(tag) + ' ✔' : '⚠ ' + Tt(tag) + ' ⚠', CW / 2, by + (U.touch ? 18 : 24) * s, 14 * s, col, 'center');
    text(Tt('wu_' + bb.u.type), CW / 2, by + (U.touch ? 43 : 52) * s, (U.touch ? 21 : 24) * s, '#fff', 'center'); ctx.globalAlpha = 1;
  }
  function overBanner(s) {
    if (!Q.over) return; if (!U.host.overHint) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, CW, CH); return; }   // edisi offline: layar akhir misi HTML (play.js)
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, CW, CH);
    text(Tt(Q.over === 'win' ? 'f_over_win' : 'f_over_lose'), CW / 2, CH / 2, 40 * s, Q.over === 'win' ? '#39ff6e' : '#ff4a4a', 'center'); text(Tt(Q.over === 'win' ? 'w_win' : 'w_lose'), CW / 2, CH / 2 + 28 * s, 14 * s, '#fff', 'center');
    if (U.host.overHint) text('[ENTER] ' + Tt('w_restart') + ' · [M] ' + Tt('v_war'), CW / 2, CH / 2 + 56 * s, 13 * s, '#ffd24a', 'center');
  }
  function nvgOverlay() {
    if (!R.nvg) return; ctx.save(); ctx.fillStyle = 'rgba(30,255,80,.05)'; ctx.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = 'rgba(160,255,170,' + Math.random() * .18 + ')'; ctx.fillRect(Math.random() * CW, Math.random() * CH, 1 + Math.random() * 2, 1); }
    const g = ctx.createRadialGradient(CW / 2, CH / 2, CH * .3, CW / 2, CH / 2, CH * .78); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,12,0,.85)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); ctx.restore();
  }
  const SCOL = { PULSE: '80,210,255', DRONE: '120,255,150', PAINT: '255,60,50' };
  function hexes(s, alphaAt, col, lw) {   // kisi heksagon layar (perisai rompi baja); alphaAt(x, y) → 0..1
    const R = 24 * s, w = R * 1.732, h = R * 1.5; ctx.lineWidth = lw * s;
    for (let row = -1, y = 0; y < CH + R; row++, y = row * h) for (let x = (row & 1) ? w / 2 : 0; x < CW + w; x += w) {
      const a = alphaAt(x, y); if (a < .02) continue;
      ctx.strokeStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')'; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const t = i * 1.0472 + .5236, px = x + Math.cos(t) * R * .92, py = y + Math.sin(t) * R * .92; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.stroke();
    }
  }
  function buffFx(s) {   // efek layar kemampuan: kilat suntikan & denyut jantung (adrenalin), perisai heksagon (rompi), gelombang sonar (pindai)
    const id = P.cls && P.cls.ab.id, hit = P.time - (P.abHit || -9), cxs = CW / 2, cys = CH / 2, D = Math.hypot(cxs, cys);
    if (P.ab.adr > 0) {   // pinggir oranye berdenyut mengikuti detak jantung + tepi gelap seperti pandangan menyempit
      const hb = Math.exp(-(P.time - (P.hbAt || -9)) * 7), k = Math.min(1, P.ab.adr / 1.5);
      const g = ctx.createRadialGradient(cxs, cys, Math.min(CW, CH) * (.36 - .05 * hb), cxs, cys, Math.max(CW, CH) * .72); g.addColorStop(0, 'rgba(255,150,40,0)'); g.addColorStop(1, 'rgba(255,120,30,' + ((.2 + .3 * hb) * k).toFixed(3) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    }
    if (id === 'ADRENALINE' && hit < .6) { ctx.fillStyle = 'rgba(255,200,120,' + (.45 * (1 - hit / .6)).toFixed(3) + ')'; ctx.fillRect(0, 0, CW, CH); }   // kilat suntikan
    if (P.ab.arm > 0) {   // rompi baja: tepi biru + heksagon di pinggir, menyala saat terkena tembakan
      const k = Math.min(1, P.ab.arm / 1.2), hurt = Math.exp(-(P.time - P.lastHurt) * 5);
      const g = ctx.createRadialGradient(cxs, cys, Math.min(CW, CH) * .4, cxs, cys, Math.max(CW, CH) * .72); g.addColorStop(0, 'rgba(70,150,255,0)'); g.addColorStop(1, 'rgba(70,150,255,' + ((.18 + .25 * hurt) * k).toFixed(3) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      const sw = id === 'ARMOR' && hit < .9 ? hit / .7 : -1;   // sapuan pemasangan: pita heksagon naik dari bawah layar
      hexes(s, (x, y) => { const e = Math.max(0, Math.hypot(x - cxs, y - cys) / D - .55) * 2.2, band = sw >= 0 ? Math.max(0, 1 - Math.abs((1 - y / CH) - sw) * 4) * (1 - hit / .9) : 0; return Math.min(1, (e * (.14 + .5 * hurt) + band * .55) * k); }, '120,190,255', 1);
    }
    if (SCOL[id] && hit < .8) {   // gelombang sonar dari tengah layar
      const k = hit / .8, col = SCOL[id];
      for (let i = 0; i < 2; i++) { const kk = k - i * .18; if (kk <= 0) continue; ctx.strokeStyle = 'rgba(' + col + ',' + (.55 * (1 - kk)).toFixed(3) + ')'; ctx.lineWidth = (6 - i * 3) * s; ctx.beginPath(); ctx.arc(cxs, cys, D * kk, 0, 6.3); ctx.stroke(); }
    }
  }
  function vignette() {
    const g = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * .42, CW / 2, CH / 2, Math.max(CW, CH) * .78); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  }

  /* ---------------- HUD AC-130 ---------------- */
  function topMarks(s, g) {   // pandangan atas termal: unit, pemain, ledakan, peluru → { sx, sy, px, tgt }
    const rb = R.camSnap(), mpp = g.w2 / rb.RW, px = CW / (rb.RW * mpp), py = CH / (rb.RH * mpp), cx = CW / 2, cy = CH / 2, now = P.time;
    const sx = x => cx + (x - g.cx) * px, sy = y => cy + (y - g.cy) * py;
    let tgt = 0;
    ctx.save(); ctx.shadowColor = 'rgba(220,255,230,.9)';
    for (const u of Q.units) {
      if (u.dead || u.struct || u.chute > 0 || u.inV) continue; const x = sx(u.x), y = sy(u.y); if (x < -30 || y < -30 || x > CW + 30 || y > CH + 30) continue;
      const T = UT[u.type], human = F.isHuman(u.type);
      if (u.team === 'R') tgt++;
      ctx.save(); ctx.translate(x, y);
      if (human) { ctx.fillStyle = '#fff'; ctx.shadowBlur = 6; ctx.fillRect(-2.2 * s, -2.2 * s, 4.4 * s, 4.4 * s); }
      else if (u.fly || u.jet) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowBlur = 5; ctx.beginPath(); ctx.moveTo(-8 * s, 0); ctx.lineTo(8 * s, 0); ctx.moveTo(0, -8 * s); ctx.lineTo(0, 8 * s); ctx.stroke(); }
      else { ctx.rotate(u.hdg || 0); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 8; const L = Math.max(6, (T.dom === 'S' ? 20 : 6.5 * T.sz) * px), Wd = Math.max(4, 3.2 * T.sz * px); ctx.fillRect(-L / 2, -Wd / 2, L, Wd); ctx.fillStyle = '#000'; ctx.fillRect(-L * .1, -Wd * .25, L * .35, Wd * .5); }
      ctx.restore();
      if (u.team === 'B') { ctx.strokeStyle = 'rgba(80,230,255,' + (.45 + .45 * Math.sin(now * 5 + u.id)) + ')'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(x, y, (human ? 7 : 12) * s, 0, 6.3); ctx.stroke(); }
    }
    ctx.restore();
    // pemain
    const pxp = sx(P.x), pyp = sy(P.y);
    if (pxp > 0 && pyp > 0 && pxp < CW && pyp < CH) { ctx.strokeStyle = '#7dff9d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pxp, pyp - 10 * s); ctx.lineTo(pxp + 7 * s, pyp); ctx.lineTo(pxp, pyp + 10 * s); ctx.lineTo(pxp - 7 * s, pyp); ctx.closePath(); ctx.stroke(); text(Tt('f_you'), pxp, pyp - 14 * s, 10 * s, '#7dff9d', 'center'); }
    // ledakan & peluru
    for (const f of Q.fx) {
      if (f.k !== 'boom') continue; const k = f.t / f.d, x = sx(f.x), y = sy(f.y), r = Math.max(4, f.r * .45 * px * (.5 + k));
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,' + (1 - k) + ')'); gr.addColorStop(.5, 'rgba(230,230,230,' + (.6 * (1 - k)) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2;
    for (const p of Q.projs) { if (p.kind !== 'bullet' || p.t < 0) continue; ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.x - (p.tx - p.sx) * .02), sy(p.y - (p.ty - p.sy) * .02)); ctx.stroke(); }
    return { sx, sy, px, tgt };
  }
  function topFrame() {   // vinyet + garis pindai monitor
    const cx = CW / 2, cy = CH / 2, edge = ctx.createRadialGradient(cx, cy, CH * .45, cx, cy, Math.max(CW, CH) * .75); edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.75)'); ctx.fillStyle = edge; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
  }
  function airMarks(s, o) {   // penanda dari kamera udara 3D: musuh = kurung merah (oranye bila ditandai), kawan = strobo IR berkedip, operator = belah ketupat hijau
    const ppm0 = (CH / 2) / Math.tan(P.cam.fov / 2), bl = (P.time * 2.5 % 1) < .5; let n = 0;
    ctx.save(); ctx.lineWidth = 1.5;
    for (const u of Q.units) {
      if (u.dead || u.chute > 0 || u.inV || (u.struct && u.type !== 'HQ')) continue;
      const hb = F.hitbox(u), p = R.project(u.x, u.y, hb.z0 + hb.h * .5, CW, CH); if (!p || p.x < -20 || p.y < -20 || p.x > CW + 20 || p.y > CH + 20) continue;
      const r = Math.max(5 * s, Math.max(hb.r, hb.h * .5) * ppm0 / p.f * 1.15);
      if (u.team === 'R') {
        n++; if (!o.foe) continue;
        const col = (u.tagT || 0) > P.time ? '#ff9a2a' : '#ff4040', c = r * .45; ctx.globalAlpha = o.foe; ctx.strokeStyle = col; ctx.beginPath();
        for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(p.x + ax * r, p.y + ay * (r - c)); ctx.lineTo(p.x + ax * r, p.y + ay * r); ctx.lineTo(p.x + ax * (r - c), p.y + ay * r); }
        ctx.stroke();
        if (o.label && p.f < 650) text(Tt('wu_' + u.type) + ' · ' + Math.round(p.f) + ' m', p.x, p.y - r - 4 * s, 9.5 * s, col, 'center', false);
      } else if (u === P.unit) {
        const q = 7 * s, y = p.y - r - q - 4 * s; ctx.globalAlpha = 1; ctx.strokeStyle = '#7dff9d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, y - q); ctx.lineTo(p.x + q, y); ctx.lineTo(p.x, y + q); ctx.lineTo(p.x - q, y); ctx.closePath(); ctx.stroke(); ctx.lineWidth = 1.5;
        text(Tt('f_you'), p.x, y - q - 4 * s, 10 * s, '#7dff9d', 'center');
      } else if (o.ally && bl) { ctx.globalAlpha = .9; ctx.fillStyle = '#9fe8ff'; ctx.fillRect(p.x - 2 * s, p.y - r - 5 * s, 4 * s, 4 * s); }
    }
    ctx.restore(); return n;
  }
  function northArrow(x, y, s, col) {   // panah utara relatif arah kamera (atas layar = arah pandang)
    ctx.save(); ctx.translate(x, y); ctx.rotate(-(P.cam.yaw + Math.PI / 2)); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 16 * s, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -13 * s); ctx.lineTo(5 * s, 2 * s); ctx.lineTo(-5 * s, 2 * s); ctx.closePath(); ctx.fill();
    text('N', 0, -20 * s, 11 * s, col, 'center'); ctx.restore();
  }
  const hdgOf = () => Math.round(((P.cam.yaw * 180 / Math.PI + 90) % 360 + 360) % 360);
  function gunshipHud(s, gl3) {   // AC-130: pandangan termal 3D dari pesawat yang mengorbit; retikel berbeda per meriam
    const g = P.gs, cx = CW / 2, cy = CH / 2, gun = F.GUNS[g.w], AC = F.AC130, tm = gl3 ? null : topMarks(s, F.gsTop());
    const tgt = gl3 ? airMarks(s, { foe: .55, ally: 1 }) : tm.tgt, dist = g.aim ? g.aim.d : AC.R, ppm = gl3 ? (CH / 2) / Math.tan(P.cam.fov / 2) / dist : tm.px, rr = Math.max(8 * s, gun.r * ppm);
    topFrame();
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.beginPath();
    if (g.w === 2) {   // 105 mm: kotak sudut besar
      const b = Math.max(rr * 1.2, 48 * s), c = b * .35;
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(cx + ax * b, cy + ay * (b - c)); ctx.lineTo(cx + ax * b, cy + ay * b); ctx.lineTo(cx + ax * (b - c), cy + ay * b); }
      ctx.moveTo(cx - 7 * s, cy); ctx.lineTo(cx + 7 * s, cy); ctx.moveTo(cx, cy - 7 * s); ctx.lineTo(cx, cy + 7 * s);
    } else if (g.w === 1) {   // 40 mm: salib bercelah dengan garis skala
      const a = 22 * s, b = 130 * s;
      ctx.moveTo(cx - b, cy); ctx.lineTo(cx - a, cy); ctx.moveTo(cx + a, cy); ctx.lineTo(cx + b, cy); ctx.moveTo(cx, cy - b); ctx.lineTo(cx, cy - a); ctx.moveTo(cx, cy + a); ctx.lineTo(cx, cy + b);
      for (let i = 1; i <= 3; i++) { const t = a + (b - a) * i / 4, q = 5 * s; ctx.moveTo(cx - t, cy - q); ctx.lineTo(cx - t, cy + q); ctx.moveTo(cx + t, cy - q); ctx.lineTo(cx + t, cy + q); ctx.moveTo(cx - q, cy - t); ctx.lineTo(cx + q, cy - t); ctx.moveTo(cx - q, cy + t); ctx.lineTo(cx + q, cy + t); }
    } else {   // 25 mm: salib tipis selebar layar + kurung kecil
      const a = 12 * s, k = 20 * s;
      ctx.moveTo(0, cy); ctx.lineTo(cx - a, cy); ctx.moveTo(cx + a, cy); ctx.lineTo(CW, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - a); ctx.moveTo(cx, cy + a); ctx.lineTo(cx, CH);
      ctx.moveTo(cx - k + 6 * s, cy - k); ctx.lineTo(cx - k, cy - k); ctx.lineTo(cx - k, cy + k); ctx.lineTo(cx - k + 6 * s, cy + k); ctx.moveTo(cx + k - 6 * s, cy - k); ctx.lineTo(cx + k, cy - k); ctx.lineTo(cx + k, cy + k); ctx.lineTo(cx + k - 6 * s, cy + k);
    }
    ctx.stroke(); ctx.globalAlpha = .45; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.3); ctx.stroke(); ctx.restore();   // lingkar = radius ledakan
    // info
    const lx = 26 * s + LX(), tc = U.touch;
    if (tc) { acTouchHud(s, g, gun, tgt, dist, rr, AC); return; }   // HP: panel ringkas, tanpa bilah senjata & petunjuk keyboard (meriam dipilih lewat tombol 25/40/105)
    text('AC-130 · ' + ['25 MM', '40 MM', '105 MM'][g.w] + (g.zm ? ' · ZOOM ×2' : ''), lx, 36 * s, 15 * s, '#fff');
    text(Tt('f_gs_t') + ' ' + tgt, lx, 56 * s, 12 * s, '#ff9a9a');
    text('OVERWATCH · ' + Math.max(0, g.t).toFixed(1) + ' s', cx, 36 * s, 18 * s, g.t < 8 && (P.time * 3 % 1) < .5 ? '#ffd24a' : '#fff', 'center');
    const rx = lx, ra = 'left', ry = 76 * s;   // kolom kiri: di kanan atas tertutup kotak pesan radio
    text('ALT ' + AC.alt + ' m', rx, ry, 12 * s, '#fff', ra); text('RNG ' + Math.round(dist) + ' m', rx, ry + 18 * s, 12 * s, '#fff', ra); text('AZ ' + hdgOf() + '°', rx, ry + 36 * s, 12 * s, '#fff', ra);
    text(Math.round(Math.hypot((g.aim ? g.aim.x : g.ox) - P.x, (g.aim ? g.aim.y : g.oy) - P.y)) + ' m ' + Tt('f_you'), cx + Math.max(rr, 48 * s) + 14 * s, cy - 8 * s, 11 * s, '#7dff9d', 'left');
    northArrow(tc ? lx + 150 * s : CW - 48 * s, tc ? 96 * s : 50 * s, s, '#fff');
    hintB(Tt('f_gs_hint'), s, 'rgba(255,255,255,.75)', g.t0);
    F.GUNS.forEach((gn, i) => {
      const w = 130 * s, x = cx - (F.GUNS.length * (w + 8 * s)) / 2 + i * (w + 8 * s), y = CH - 84 * s, on = g.w === i, cdp = clamp(1 - g.cd[i] / gn.cd, 0, 1);
      ctx.fillStyle = on ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.45)'; ctx.fillRect(x, y, w, 44 * s); ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.4)'; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(x, y, w, 44 * s);
      text((i + 1) + ' · ' + ['25 MM', '40 MM', '105 MM'][i], x + w / 2, y + 22 * s, 14 * s, on ? '#fff' : 'rgba(255,255,255,.6)', 'center'); ctx.fillStyle = '#fff'; ctx.fillRect(x + 6 * s, y + 32 * s, (w - 12 * s) * cdp, 4 * s);
    });
    const u = P.unit; if (u) { const hp = clamp(u.hp / u.hpMax, 0, 1); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(22 * s, CH - 40 * s, 200 * s, 8 * s); ctx.fillStyle = hp > .5 ? '#7dff9d' : '#ff5a4a'; ctx.fillRect(22 * s, CH - 40 * s, 200 * s * hp, 8 * s); }
    damage(s); msgs(s);
  }

  /* AC-130 di layar sentuh: satu panel berbingkai di kiri atas (meriam, sasaran, telemetri, arah utara), bilah sisa waktu di tengah atas,
     jarak ke operator di samping retikel, nyawa di kiri bawah. Status isi ulang tiap meriam ada di tombolnya sendiri */
  function acTouchHud(s, g, gun, tgt, dist, rr, AC) {
    const cx = CW / 2, cy = CH / 2, x = 14 * s + LX(), y = 14 * s, w = 210 * s, h = 92 * s;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 3 * s, h);
    text(['25 MM', '40 MM', '105 MM'][g.w] + (g.zm ? '  ×2' : ''), x + 12 * s, y + 24 * s, 19 * s, '#fff');
    text('◎ ' + tgt, x + w - 12 * s, y + 24 * s, 16 * s, tgt ? '#ff9a9a' : 'rgba(255,255,255,.6)', 'right');
    text('ALT ' + AC.alt + ' m', x + 12 * s, y + 48 * s, 11.5 * s, '#fff'); text('RNG ' + Math.round(dist) + ' m', x + 12 * s, y + 65 * s, 11.5 * s, '#fff'); text('AZ ' + hdgOf() + '°', x + 12 * s, y + 82 * s, 11.5 * s, '#fff');
    northArrow(x + w - 34 * s, y + 62 * s, s, '#fff');
    g.tMax = Math.max(g.tMax || 0, g.t); const tk = clamp(g.t / g.tMax, 0, 1), bw = 220 * s, bl = g.t < 8 && (P.time * 3 % 1) < .5;
    text('OVERWATCH  ' + Math.max(0, g.t).toFixed(0) + ' s', cx, 26 * s, 14 * s, bl ? '#ffd24a' : '#fff', 'center');
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(cx - bw / 2, 34 * s, bw, 5 * s); ctx.fillStyle = bl ? '#ffd24a' : '#fff'; ctx.fillRect(cx - bw / 2, 34 * s, bw * tk, 5 * s);
    text(Math.round(Math.hypot((g.aim ? g.aim.x : g.ox) - P.x, (g.aim ? g.aim.y : g.oy) - P.y)) + ' m ▲', cx + Math.max(rr, 48 * s) + 14 * s, cy - 8 * s, 12 * s, '#7dff9d', 'left');
    hintB(Tt('f_gs_hint'), s, 'rgba(255,255,255,.75)', g.t0);
    const u = P.unit; if (u) { const hp = clamp(u.hp / u.hpMax, 0, 1), hx = 14 * s + LX(), hy = CH - 30 * s; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(hx, hy, 160 * s, 7 * s); ctx.fillStyle = hp > .5 ? '#7dff9d' : '#ff5a4a'; ctx.fillRect(hx, hy, 160 * s * hp, 7 * s); text('✚', hx, hy - 5 * s, 12 * s, hp > .5 ? '#7dff9d' : '#ff5a4a'); }
    damage(s); msgs(s);
  }
  function predHud(s, gl3) {   // kamera hulu ledak Predator (termal): kotak bidik = radius ledakan, pita ketinggian
    const g = P.gs, cx = CW / 2, cy = CH / 2, tm = gl3 ? null : topMarks(s, F.gsTop()), tgt = gl3 ? airMarks(s, { foe: 1, ally: 1 }) : tm.tgt;
    const alt = Math.max(0, g.mz - F.hAt(g.mx, g.my)), k = clamp(alt / F.PRED.alt, 0, 1), bl = (P.time * 4 % 1) < .5, dist = g.aim ? g.aim.d : alt;
    const ppm = gl3 ? (CH / 2) / Math.tan(P.cam.fov / 2) / Math.max(1, dist) : tm.px, rr = Math.max(14 * s, F.PRED.r * ppm), b = rr + 16 * s;
    if (gl3) { const p = R.project(g.px, g.py, F.hAt(g.px, g.py) + 1, CW, CH); if (p) { ctx.strokeStyle = 'rgba(255,220,80,.85)'; ctx.lineWidth = 1.5; const q = 8 * s; ctx.beginPath(); ctx.moveTo(p.x, p.y - q); ctx.lineTo(p.x + q, p.y); ctx.lineTo(p.x, p.y + q); ctx.lineTo(p.x - q, p.y); ctx.closePath(); ctx.stroke(); text(Tt('f_pred_tgt'), p.x, p.y - q - 4 * s, 10 * s, '#ffdc50', 'center'); } }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.shadowColor = '#fff'; ctx.shadowBlur = 4;
    ctx.beginPath(); for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(cx + ax * b, cy + ay * (b - 14 * s)); ctx.lineTo(cx + ax * b, cy + ay * b); ctx.lineTo(cx + ax * (b - 14 * s), cy + ay * b); } ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.3); ctx.moveTo(cx - 8 * s, cy); ctx.lineTo(cx + 8 * s, cy); ctx.moveTo(cx, cy - 8 * s); ctx.lineTo(cx, cy + 8 * s); ctx.stroke(); ctx.shadowBlur = 0;
    topFrame();
    text(Tt('f_streak_PRED'), cx, 36 * s, 18 * s, '#fff', 'center'); text(Tt('f_gs_t') + ' ' + tgt, cx, 58 * s, 12 * s, '#ff9a9a', 'center');
    // pita ketinggian
    const hx = U.touch ? 40 * s + LX() : CW - 60 * s, h0 = CH * .22, h1 = CH * .78; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(hx, h0, 12 * s, h1 - h0); ctx.fillStyle = k < .25 ? (bl ? '#ff4040' : '#fff') : '#fff'; ctx.fillRect(hx + 2 * s, h1 - (h1 - h0) * k, 8 * s, (h1 - h0) * k);
    text(Tt('f_pred_alt') + ' ' + Math.round(alt) + ' m', U.touch ? hx : hx + 6 * s, h0 - 10 * s, 11 * s, '#fff', U.touch ? 'left' : 'center');
    if (F.in.fire) text('▲ BOOST', cx, cy + b + 24 * s, 14 * s, bl ? '#ffd24a' : '#fff', 'center');
    text(Math.round(dist) + ' m', cx + b + 8 * s, cy - b + 10 * s, 11 * s, '#fff', 'left');
    northArrow(U.touch ? cx + 170 * s : 48 * s, 50 * s, s, '#fff');
    hintB(Tt('f_pred_hint'), s, 'rgba(255,255,255,.75)', g.t0);
    damage(s); msgs(s);
  }
  function droneHud(s) {   // kamera drone UAV: warna asli (N = termal), musuh diberi kurung + nama + jarak
    const D = P.drone, cx = CW / 2, cy = CH / 2, G = D.th ? '#fff' : '#bff7d0', DR = F.DRONE, m = 34 * s, L = 46 * s;
    const foes = airMarks(s, { foe: 1, ally: 1, label: true });
    ctx.fillStyle = 'rgba(0,0,0,.1)'; for (let y = 0; y < CH; y += 4) ctx.fillRect(0, y, CW, 1);
    ctx.save(); ctx.strokeStyle = G; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3; ctx.beginPath();
    for (const [x, y, ax, ay] of [[m, m, 1, 1], [CW - m, m, -1, 1], [CW - m, CH - m, -1, -1], [m, CH - m, 1, -1]]) { ctx.moveTo(x + ax * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + ay * L); }
    ctx.moveTo(cx - 26 * s, cy); ctx.lineTo(cx - 8 * s, cy); ctx.moveTo(cx + 8 * s, cy); ctx.lineTo(cx + 26 * s, cy); ctx.moveTo(cx, cy - 26 * s); ctx.lineTo(cx, cy - 8 * s); ctx.moveTo(cx, cy + 8 * s); ctx.lineTo(cx, cy + 26 * s);
    ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, DR.tagR / Math.max(1, D.aim ? D.aim.d : 300) * (CH / 2) / Math.tan(P.cam.fov / 2), 0, 6.3); ctx.globalAlpha = .4; ctx.stroke(); ctx.restore();   // lingkar = jangkauan tanda
    if ((P.time * 1.5 % 1) < .5) { ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(m + 18 * s, m + 22 * s, 6 * s, 0, 6.3); ctx.fill(); }
    text('REC · UAV DRONE' + (D.th ? ' · ' + Tt('f_drone_th') : '') + (D.zm ? ' · ×3' : ''), m + 30 * s + LX(), m + 27 * s, 13 * s, G);
    text(Tt('f_gs_t') + ' ' + foes, m + 30 * s + LX(), m + 46 * s, 11 * s, '#ff9a9a');
    const gz = Math.max(F.hAt(D.x, D.y), F.WZ), dP = Math.hypot(D.x - P.x, D.y - P.y), bat = Math.max(0, P.uavT), sig = clamp(1 - dP / DR.range, 0, 1), rx = U.touch ? CW - U.topR - 4 * s : CW - m - 10 * s;
    const ty = U.touch ? Math.max(0, TOPY() + 50 * s - m) : 0;   // layar sentuh: di bawah bilah ❚❚ / RADIO dan kartu laporan
    text(Tt('f_drone_bat') + ' ' + Math.ceil(bat) + ' s', rx, ty + m + 27 * s, 12 * s, bat < 10 && (P.time * 3 % 1) < .5 ? '#ff3b3b' : G, 'right');
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(rx - 110 * s, ty + m + 33 * s, 110 * s, 4 * s); ctx.fillStyle = bat < 10 ? '#ff3b3b' : G; ctx.fillRect(rx - 110 * s, ty + m + 33 * s, 110 * s * clamp(bat / DR.dur, 0, 1), 4 * s);
    text('ALT ' + Math.round(D.z - gz) + ' m', rx, ty + m + 54 * s, 12 * s, G, 'right'); text(Tt('f_drone_sig') + ' ' + Math.round(sig * 100) + '%', rx, ty + m + 71 * s, 12 * s, sig < .15 ? '#ffb000' : G, 'right');
    text('HDG ' + hdgOf() + '° · ' + Math.round(Math.hypot(D.vx, D.vy) * 3.6) + ' KM/J', rx, ty + m + 88 * s, 12 * s, G, 'right');
    text(Tt('f_you') + ' ' + Math.round(dP) + ' m', rx, ty + m + 105 * s, 12 * s, '#7dff9d', 'right');
    if (D.aim) text(Math.round(D.aim.d) + ' m', cx + 32 * s, cy - 8 * s, 11 * s, G, 'left');
    northArrow(cx, m + 26 * s, s, G);
    if (P.time - P.lastHurt < 1.5) { const bl = (P.time * 4 % 1) < .5; ctx.fillStyle = 'rgba(255,30,20,' + (bl ? .16 : .06) + ')'; ctx.fillRect(0, 0, CW, CH); text(Tt('f_drone_hurt'), cx, CH * .3, 18 * s, bl ? '#ff3b3b' : '#ffdd33', 'center'); }
    const u = P.unit; if (u) { const hp = clamp(u.hp / u.hpMax, 0, 1); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(m, CH - m - 30 * s, 180 * s, 7 * s); ctx.fillStyle = hp > .5 ? '#7dff9d' : '#ff5a4a'; ctx.fillRect(m, CH - m - 30 * s, 180 * s * hp, 7 * s); text(Tt('f_you') + ' HP', m, CH - m - 36 * s, 10 * s, '#cfe'); }
    if (U.touch) hintB(Tt('f_drone_hint'), s, 'rgba(230,255,235,.85)', P.gs.t0); else text(Tt('f_drone_hint'), cx, CH - m - 6 * s, 11 * s, 'rgba(230,255,235,.85)', 'center');
    damage(s); msgs(s);
  }
  function pickHud(s) {   // Predator / Overwatch / Laser tahap 1: kursor titik di peta taktis. Lingkar kursor = wilayah serangan: ledakan rudal, lintasan orbit AC-130, ledakan SUPERNOVA
    const g = P.gs, mp = bigMap(s, true), x = mp.X(g.cx), y = mp.Y(g.cy), px = mp.X(P.x), py = mp.Y(P.y), bl = (P.time * 3 % 1) < .5, rm = g.pk === 'GUNSHIP' ? F.AC130.R : g.pk === 'LASER' ? F.LASER.nova.r : F.PRED.r * 2, r = Math.max(8 * s, rm * mp.k);
    ctx.save(); ctx.strokeStyle = 'rgba(255,90,70,.55)'; ctx.setLineDash([6 * s, 5 * s]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, F.pickCfg(g.pk).range * mp.k, 0, 6.3); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,80,.45)'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = bl ? '#ff3b3b' : '#ffdd33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3);
    ctx.moveTo(x - r - 12 * s, y); ctx.lineTo(x - r * .4, y); ctx.moveTo(x + r * .4, y); ctx.lineTo(x + r + 12 * s, y); ctx.moveTo(x, y - r - 12 * s); ctx.lineTo(x, y - r * .4); ctx.moveTo(x, y + r * .4); ctx.lineTo(x, y + r + 12 * s); ctx.stroke(); ctx.restore();
    let n = 0; for (const u of Q.units) if (u.team === 'R' && !u.dead && Math.hypot(u.x - g.cx, u.y - g.cy) < rm * 1.25 && (u.seen.B || (u.tagT || 0) > P.time || P.uavT > 0)) n++;
    text(Math.round(Math.hypot(g.cx - P.x, g.cy - P.y)) + ' m' + (n ? ' · ' + Tt('f_gs_t') + ' ' + n : ''), x + r + 8 * s, y - 8 * s, 12 * s, '#ffdd33');
    msgs(s);
  }
  function satHud(s, L) {   // sinematik satelit turun: bingkai film, keterangan fase, ketinggian; layar memutih saat kamera masuk ke optik
    const C = F.LASER.cin, st = L.st, Z = F.satPose(L), bar = Math.round(CH * .09) * clamp(st / .4, 0, 1), cx = CW / 2, O = '#ffab5a';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW, bar); ctx.fillRect(0, CH - bar, CW, bar);
    const cap = st < C.dep0 ? 'f_sat_fall' : st < C.arc1 ? 'f_sat_dep' : 'f_sat_link', y0 = CH - bar + Math.min(bar * .62, 22 * s);
    text(Tt(cap), cx, y0, 15 * s, O, 'center'); text('ALT ' + Math.round(Z.alt) + ' m', 16 * s + LX(), y0, 12 * s, 'rgba(255,225,200,.85)', 'left'); text(Tt('f_sat_skip'), CW - 16 * s, y0, 11 * s, 'rgba(255,255,255,.6)', 'right');
    damage(s);
    const fade = clamp(1 - st / .35, 0, 1) * .9, white = clamp((st - (C.t - .32)) / .32, 0, 1);
    if (fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + fade + ')'; ctx.fillRect(0, 0, CW, CH); }
    if (white > 0) { ctx.fillStyle = 'rgba(255,248,235,' + white + ')'; ctx.fillRect(0, 0, CW, CH); }
  }
  function laserHud(s) {   // SATELIT HELIOS: panel status ringkas (kiri atas), bilah fase (tengah atas), retikel = jari-jari sinar; tata letak sama di HP & PC, tanpa teks tersebar
    const L = P.laser; if (!L) return;
    if (L.ph === 'sat') { satHud(s, L); return; }
    if (U.touch) s *= 1.3;   // layar HP kecil: panel & teks lebih besar
    const LS = F.LASER, cx = CW / 2, cy = CH / 2, O = '#ffab5a', HOT = '#fff3c0', bl = (P.time * 3 % 1) < .5, cam = P.cam;
    const vis = airMarks(s, { foe: 1, ally: 1 });
    const ppm = (CH / 2) / Math.tan(cam.fov / 2) / Math.max(1, Math.hypot(cam.x - L.cx, cam.y - L.cy, cam.z - F.hAt(L.cx, L.cy))), r = LS.r * (1 - .4 * L.foc), rr = Math.max(12 * s, r * ppm);
    const bp = L.ph === 'fire' ? R.project(L.x, L.y, F.hAt(L.x, L.y) + 1, CW, CH) : null;
    let inB = 0; if (L.ph === 'fire') for (const u of Q.units) if (u.team === 'R' && !u.dead && Math.hypot(u.x - L.x, u.y - L.y) < r) inB++;
    // bingkai satelit: vinyet jingga tipis (garis pindai hanya di PC)
    const eg = ctx.createRadialGradient(cx, cy, CH * .45, cx, cy, Math.max(CW, CH) * .75); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(34,10,0,.6)'); ctx.fillStyle = eg; ctx.fillRect(0, 0, CW, CH);
    if (!U.touch) { ctx.fillStyle = 'rgba(0,0,0,.1)'; for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1); }
    // retikel: lingkaran = jari-jari sinar, 4 busur berputar (cepat saat mengisi), sudut kurung; sinar tertinggal = garis putus ke posisi sinar
    const col = L.foc > .5 ? HOT : O, rot = P.time * (L.ph === 'charge' ? 3.2 : .6), R1 = rr + 14 * s, B = R1 + 12 * s;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2 * s; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, R1, rot + k * 1.5708 + .3, rot + k * 1.5708 + 1.27); ctx.stroke(); }
    ctx.lineWidth = 1.5 * s; ctx.beginPath(); for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(cx + ax * B, cy + ay * (B - 12 * s)); ctx.lineTo(cx + ax * B, cy + ay * B); ctx.lineTo(cx + ax * (B - 12 * s), cy + ay * B); } ctx.stroke();
    ctx.globalAlpha = L.ph === 'fire' ? .9 : .5; ctx.setLineDash(L.ph === 'fire' ? [] : [4 * s, 4 * s]); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 2.2 * s, 0, 6.3); ctx.fillStyle = col; ctx.fill();
    if (bp && Math.hypot(bp.x - cx, bp.y - cy) > 8 * s) {
      ctx.setLineDash([5 * s, 5 * s]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bp.x, bp.y); ctx.stroke(); ctx.setLineDash([]);
      const q = 7 * s; ctx.fillStyle = '#fff3e0'; ctx.beginPath(); ctx.moveTo(bp.x, bp.y - q); ctx.lineTo(bp.x + q, bp.y); ctx.lineTo(bp.x, bp.y + q); ctx.lineTo(bp.x - q, bp.y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (inB) text('☠ ' + inB, cx + B + 6 * s, cy - B + 12 * s, 14 * s, bl ? '#fff' : '#ff6b6b', 'left');   // musuh di dalam sinar saat ini
    // panel status (kiri atas): nama satelit, korban, suhu inti (bilah), jarak dari operator, sasaran terlihat, kompas
    const x = 14 * s + LX(), y = 14 * s, w = 214 * s, h = 98 * s, core = Math.round(3600 + 900 * L.foc + (L.ph === 'fire' ? 400 : 0) + Math.sin(P.time * 9) * 60), heat = clamp((core - 3400) / 1700, 0, 1);
    ctx.fillStyle = 'rgba(14,6,0,.62)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(255,171,90,.6)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h); ctx.fillStyle = O; ctx.fillRect(x, y, 3 * s, h);
    text('☀ HELIOS-7', x + 12 * s, y + 23 * s, 17 * s, O); text('☠ ' + (P.kills - L.k0), x + w - 12 * s, y + 23 * s, 16 * s, P.kills > L.k0 ? '#ff6b6b' : 'rgba(255,220,190,.6)', 'right');
    text(Tt('f_laser_core'), x + 12 * s, y + 44 * s, 10.5 * s, 'rgba(255,220,190,.85)'); text(core + ' K', x + w - 12 * s, y + 44 * s, 10.5 * s, L.foc > .5 ? HOT : O, 'right');
    const hb = w - 24 * s; ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 12 * s, y + 50 * s, hb, 4 * s); const hg = ctx.createLinearGradient(x + 12 * s, 0, x + 12 * s + hb, 0); hg.addColorStop(0, '#ff7a2a'); hg.addColorStop(1, HOT); ctx.fillStyle = hg; ctx.fillRect(x + 12 * s, y + 50 * s, hb * heat, 4 * s);
    text('▲ ' + Math.round(Math.hypot(L.cx - P.x, L.cy - P.y)) + ' m', x + 12 * s, y + 72 * s, 11.5 * s, '#7dff9d'); text('◎ ' + vis + '  ·  ×' + (LS.alt0 / L.alt).toFixed(1), x + 12 * s, y + 89 * s, 11.5 * s, vis ? '#ff9a9a' : 'rgba(255,220,190,.6)');
    northArrow(x + w - 30 * s, y + 78 * s, s, O);
    // bilah fase (tengah atas): mengisi → sinar aktif (sisa waktu) → supernova
    const bw = Math.min(260 * s, CW * .34), bx = cx - bw / 2, by = 34 * s;
    let frac = 0, lab = '', pc = O;
    if (L.ph === 'charge') { frac = clamp(1 - L.ch / LS.charge, 0, 1); lab = Tt('f_laser_ch') + ' ' + Math.round(frac * 100) + '%'; pc = bl ? '#fff' : O; }
    else if (L.ph === 'fire') { frac = clamp(L.t / LS.dur, 0, 1); lab = (L.foc > .5 ? Tt('f_laser_foc') : Tt('f_laser_act')) + '  ' + Math.max(0, L.t).toFixed(1) + ' s'; pc = L.foc > .5 ? HOT : L.t < 3 && bl ? '#ff5a4a' : O; }
    else lab = 'SUPERNOVA';
    text(lab, cx, by - 8 * s, 14 * s, pc, 'center');
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by, bw, 6 * s); ctx.fillStyle = pc; ctx.fillRect(bx, by, bw * frac, 6 * s);
    hintB(Tt('f_laser_hint'), s, 'rgba(255,225,200,.85)', P.gs ? P.gs.t0 : 0);
    const u = P.unit; if (u) { const hp = clamp(u.hp / u.hpMax, 0, 1), hx = 14 * s + LX(), hy = CH - 30 * s; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(hx, hy, 160 * s, 7 * s); ctx.fillStyle = hp > .5 ? '#7dff9d' : '#ff5a4a'; ctx.fillRect(hx, hy, 160 * s * hp, 7 * s); text('✚', hx, hy - 5 * s, 12 * s, hp > .5 ? '#7dff9d' : '#ff5a4a'); }
    damage(s); msgs(s);
    const pv = P.time - (L.pov === undefined ? -9 : L.pov); if (pv < .5) { ctx.fillStyle = 'rgba(255,248,235,' + (1 - pv / .5) + ')'; ctx.fillRect(0, 0, CW, CH); }   // baru masuk ke optik satelit: putih memudar, gambar kamera menyala
    if (L.ph === 'nova') {   // kilatan putih lalu tulisan besar
      const k = 1 - L.nova / LS.nova.t; ctx.fillStyle = 'rgba(255,245,230,' + Math.max(0, .85 - k * 1.6) + ')'; ctx.fillRect(0, 0, CW, CH);
      ctx.globalAlpha = clamp(1.6 - k * 1.4, 0, 1); text('SUPERNOVA', cx, cy - 70 * s, 46 * s * (1 + k * .15), '#ff7a2a', 'center'); text('☠ ' + (P.kills - L.k0), cx, cy - 36 * s, 20 * s, '#fff', 'center'); ctx.globalAlpha = 1;
    }
  }

  function streakFx(s) {   // status laser orbital (dipicu dari heli, tanpa kamera satelit)
    const L = P.laser; if (!L) return;
    text(Tt('f_streak_LASER') + ' · ' + (L.ph === 'charge' ? Tt('f_laser_ch') : L.ph === 'nova' ? 'SUPERNOVA' : L.t.toFixed(1) + ' s'), CW / 2, CH - 72 * s, 15 * s, '#ff9a5a', 'center');
    const p = R.project(L.x, L.y, F.hAt(L.x, L.y) + 2, CW, CH); if (p) { ctx.strokeStyle = '#ffb070'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 16 * s, 0, 6.3); ctx.stroke(); }
  }
  function nukeFx(s) {   // peringatan zona nuklir + kilatan putih setelah ledakan
    for (const k of Q.strk || []) {   // zona jatuh rudal balistik TITAN
      if (!P.alive) break; const d = Math.hypot(k.x - P.x, k.y - P.y); if (d > k.r + 200) continue;
      const inside = d < k.r, bl = (P.time * 4 % 1) < .5; if (inside) { ctx.fillStyle = 'rgba(255,30,20,' + (bl ? .18 : .07) + ')'; ctx.fillRect(0, 0, CW, CH); }
      text('⚠ ' + Tt('f_msl_zone') + ' ' + Math.ceil(k.t) + 's · ' + Math.round(d) + ' m', CW / 2, U.touch ? 146 * s : topTake(24 * s) + 18 * s, 17 * s, inside ? (bl ? '#ff3b3b' : '#ffdd33') : '#ffb000', 'center'); break;
    }
    const n = Q.nuke;
    if (n && P.alive) {
      const d = Math.hypot(n.x - P.x, n.y - P.y), inside = d < n.r, bl = (P.time * 3 % 1) < .5;
      if (inside) { ctx.fillStyle = 'rgba(255,30,20,' + (bl ? .16 : .06) + ')'; ctx.fillRect(0, 0, CW, CH); }
      text(Tt('f_nuke_zone') + ' ' + Math.ceil(n.t) + 's · ' + Math.round(d) + ' m', CW / 2, U.touch ? 120 * s : topTake(28 * s) + 21 * s, 20 * s, inside ? (bl ? '#ff3b3b' : '#ffdd33') : '#ffdd33', 'center');
      const p = R.project(n.x, n.y, F.hAt(n.x, n.y) + 30, CW, CH); if (p) text('☢', p.x, p.y, 30 * s, '#ffdd33', 'center');
    }
    if (P.nukeT !== undefined) {
      const a = P.time - P.nukeT, k = Math.max(0, 1 - a / 3) * Math.max(.25, 1 - (P.nukeD || 0) / 3000);
      if (k > 0) { ctx.fillStyle = 'rgba(255,250,235,' + Math.min(1, k * 1.1) + ')'; ctx.fillRect(0, 0, CW, CH); if (a < 3) text(Tt('f_nuke'), CW / 2, CH / 2, 26 * s, 'rgba(120,20,10,' + k + ')', 'center'); }
    }
  }
  /* ---------------- HUD APACHE (simbologi hijau ala IHADSS) ---------------- */
  function heliHud(s) {
    const H = P.heli; if (!H) return;
    const cx = CW / 2, cy = CH / 2, G = '#7dff9d', AC = F.APACHE, u = H.u, bl = (P.time * 3 % 1) < .5;
    if (H.cam) {   // kokpit penembak: bingkai gelap + garis pindai
      const g = ctx.createRadialGradient(cx, cy, CH * .32, cx, cy, Math.max(CW, CH) * .7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,10,4,.85)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = 'rgba(0,30,10,.12)'; for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
      text('TADS · ' + ['WFOV', 'MFOV ×2', 'NFOV ×5'][H.zoom], 26 * s, CH / 2 - 120 * s, 13 * s, G);
    }
    ctx.save(); ctx.strokeStyle = G; ctx.fillStyle = G; ctx.lineWidth = 1.6 * s; ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 3;
    const r = 13 * s; ctx.beginPath(); ctx.moveTo(cx - 36 * s, cy); ctx.lineTo(cx - r, cy); ctx.moveTo(cx + r, cy); ctx.lineTo(cx + 36 * s, cy); ctx.moveTo(cx, cy - 28 * s); ctx.lineTo(cx, cy - r); ctx.moveTo(cx, cy + r); ctx.lineTo(cx, cy + 28 * s); ctx.stroke(); ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    if (H.aim) { const p = R.project(H.aim.x, H.aim.y, H.aim.z, CW, CH); if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 7 * s, 0, 6.3); ctx.stroke(); } }
    {   // indikator senjata dagu di sekitar bidikan: panas laser / isi daya railgun / putaran minigun
      const HG = AC.guns[H.gi], arc = (k, col, rr) => { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(cx, cy, rr * s, 2.36, 3.93); ctx.stroke(); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, rr * s, 3.93 - 1.57 * k, 3.93); ctx.stroke(); ctx.restore(); };
      if (HG.k === 'laser' && (H.heat > 0 || F.in.fire)) { const k = H.heat / HG.heat; arc(k, H.over ? (bl ? '#ff3b3b' : '#ffdd33') : k > .7 ? '#ffb000' : '#ff6a4a', 46); if (H.over) text(Tt('f_hg_hot'), cx, cy + 62 * s, 12 * s, bl ? '#ff3b3b' : '#ffdd33', 'center'); }
      else if (HG.k === 'rail' && H.rc > 0) { arc(H.rc, H.rc >= 1 ? (bl ? '#ffffff' : '#8fd8ff') : '#8fd8ff', 46); text(H.rc >= 1 ? Tt('f_hf_rel') : Tt('f_hg_chg') + ' ' + Math.round(H.rc * 100) + '%', cx, cy + 62 * s, 11 * s, '#8fd8ff', 'center'); }
      else if (HG.k === 'mg' && H.spin > 0 && H.spin < 1) arc(H.spin, '#ffd24a', 46);
    }
    // garis cakrawala: kemiringan heli
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(H.rol); ctx.globalAlpha = .7; const hy = H.pit * 260 * s; ctx.beginPath(); ctx.moveTo(-120 * s, hy); ctx.lineTo(-60 * s, hy); ctx.moveTo(60 * s, hy); ctx.lineTo(120 * s, hy); ctx.stroke(); ctx.restore();
    // kunci Hellfire + sasaran yang sudah ditandai (tahan RMB) bernomor urut tembak
    const at = u => { const hb = F.hitbox(u); return R.project(u.x, u.y, hb.z0 + hb.h * .5, CW, CH); };
    const dia = (p, b) => { ctx.beginPath(); ctx.moveTo(p.x, p.y - b); ctx.lineTo(p.x + b, p.y); ctx.lineTo(p.x, p.y + b); ctx.lineTo(p.x - b, p.y); ctx.closePath(); ctx.stroke(); };
    let lockP = null; const pts = [];
    if (H.lock && !H.lock.dead && H.hf > 0 && !H.pl.includes(H.lock)) { const p = at(H.lock); if (p) { lockP = p; ctx.strokeStyle = H.hcd <= 0 ? '#ffd24a' : G; dia(p, 17 * s); } }
    H.pl.forEach((u, i) => { const p = at(u); if (!p) return; ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 2.2 * s; dia(p, 15 * s); ctx.strokeRect(p.x - 3 * s, p.y - 3 * s, 6 * s, 6 * s); pts.push([p, i + 1]); });
    if (H.pC && !H.pC.dead) { const p = at(H.pC); if (p) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.arc(p.x, p.y, 22 * s, -1.571, -1.571 + 6.283 * Math.min(1, H.pT / AC.hf.paint)); ctx.stroke(); } }
    // pencari Stinger: lingkaran putus-putus saat mencari, penuh + berkedip saat terkunci
    let aaP = null; const aaL = H.aaU && H.aaT >= AC.st.lock;
    if (H.aaU && !H.aaU.dead && H.aam > 0) { aaP = at(H.aaU); if (aaP) { ctx.strokeStyle = aaL ? '#8fd8ff' : 'rgba(143,216,255,.75)'; ctx.lineWidth = 1.8 * s; ctx.setLineDash(aaL ? [] : [5 * s, 5 * s]); ctx.beginPath(); ctx.arc(aaP.x, aaP.y, (aaL ? 24 : 34 - 10 * H.aaT / AC.st.lock) * s, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); } }
    ctx.restore();
    if (lockP) text('HELLFIRE ' + (H.hcd <= 0 ? Tt('f_ah_lock') : '…'), lockP.x, lockP.y - 23 * s, 10 * s, H.hcd <= 0 ? '#ffd24a' : G, 'center');
    for (const [p, n] of pts) text(String(n), p.x + 17 * s, p.y - 12 * s, 12 * s, '#ff5a3c', 'left');
    if (H.pl.length) text('LONGBOW · ' + H.pl.length + '/' + Math.min(AC.hf.max, H.hf) + ' · ' + Tt('f_hf_rel'), cx, cy + 78 * s, 12 * s, '#ff5a3c', 'center');
    if (aaP) text('STINGER ' + (aaL ? Tt('f_ah_lock') + ' [R]' : '…'), aaP.x, aaP.y + (aaL ? 38 : 48) * s, 10 * s, aaL && bl ? '#ffffff' : '#8fd8ff', 'center');
    const h = Math.max(0, H.z - F.hAt(H.x, H.y) - F.MDL.GHOST.gear), kmh = Math.hypot(H.vx, H.vy) * 3.6;
    text(Math.round(kmh) + ' KM/J', cx - 140 * s, cy + 5 * s, 15 * s, G, 'right'); text(Math.round(h) + ' m', cx + 140 * s, cy + 5 * s, 15 * s, G, 'left');
    text((H.vz >= 0 ? '▲ ' : '▼ ') + Math.abs(H.vz).toFixed(1) + ' m/s', cx + 140 * s, cy + 22 * s, 10 * s, G, 'left'); if (H.aim) text(Math.round(H.aim.d) + ' m', cx + 40 * s, cy - 8 * s, 10 * s, G, 'left');
    if (H.rot < .75) text(Tt('f_ah_spool'), cx, cy + 60 * s, 13 * s, '#ffd24a', 'center');
    // panel senjata & status (kanan bawah; layar sentuh: ringkas di kanan atas — sisa tiap senjata tampil di tombolnya)
    const tc = U.touch, x = tc ? CW - U.topR : CW - 28 * s, w = (tc ? 200 : 250) * s, y0 = tc ? TOPY() + 54 * s : CH - 238 * s, ph = (tc ? 80 : 206) * s;
    ctx.fillStyle = 'rgba(0,14,6,.55)'; ctx.fillRect(x - w, y0, w, ph); ctx.strokeStyle = 'rgba(125,255,157,.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - w, y0, w, ph);
    const hp = clamp(u.hp / u.hpMax, 0, 1), fu = clamp(H.fuel / AC.fuel, 0, 1), fs = Math.max(0, Math.ceil(H.fuel)), hc = hp > .5 ? G : hp > .25 ? '#ffb000' : '#ff3b3b';
    if (tc) { text('SHADOW HUNTER', x - w + 10 * s, y0 + 16 * s, 11 * s, G); text(Math.round(hp * 100) + '%', x - 10 * s, y0 + 16 * s, 12 * s, hc, 'right'); }   // HP: nama pendek, tidak menimpa angka & bar nyawa
    else { text('AH-64X SHADOW HUNTER', x - w + 10 * s, y0 + 18 * s, 13 * s, G); text(Math.round(hp * 100) + '%', x - 10 * s, y0 + 18 * s, 13 * s, hc, 'right'); }
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x - w + 10 * s, y0 + 24 * s, w - 20 * s, 5 * s); ctx.fillStyle = hc; ctx.fillRect(x - w + 10 * s, y0 + 24 * s, (w - 20 * s) * hp, 5 * s);
    const HG = AC.guns[H.gi], ga = H.ga[H.gi], gtxt = HG.k === 'laser' ? (H.over ? Tt('f_hg_hot').split(' ')[0] + ' ' : '') + Math.round(H.heat / HG.heat * 100) + '% ' + Tt('f_hg_heat') : ga;
    const rows = [[(HG.k === 'gun' ? '2× 30MM' : HG.id) + ' [LMB · H]', gtxt, HG.k === 'laser' ? !H.over : ga > 0], ['HELLFIRE [RMB]', (H.pl.length ? '▣' + H.pl.length + ' · ' : '') + H.hf, H.hf > 0 && H.hcd <= 0],
      ['HYDRA 70 [G]', H.hy, H.hy > 0 && H.ycd <= 0], ['└ ' + Tt('f_hy_war') + ' [X]', ['HE', 'FLECHETTE', 'APKWS', 'WP'][H.hyW], true], ['STINGER [R]', (H.aaU && H.aaT >= AC.st.lock ? '◉ ' : '') + H.aam, H.aam > 0 && H.aaCd <= 0],
      ['FLARE [F]', H.fl + (H.fcd > 0 ? ' · ' + Math.ceil(H.fcd) + 's' : ''), H.fl > 0 && H.fcd <= 0],
      [Tt('f_gh') + ' [Q]', H.ghT > 0 ? Tt('f_gh_act') + ' ' + Math.ceil(H.ghT) + 's' : H.ghCd > 0 ? Math.ceil(H.ghCd) + 's' : Tt('f_gh_rdy'), H.ghT > 0 || H.ghCd <= 0]];
    const tw = rows[{ gun: 0, hf: 1, hy: 2, st: 4 }[U.hw] || 0];   // HP: hanya senjata yang sedang dipilih di menu SENJATA
    (tc ? [['▶ ' + tw[0].replace(/\s*\[.*\]/, '') + (U.hw === 'hy' ? ' ' + ['HE', 'FLE', 'APKWS', 'WP'][H.hyW] : ''), tw[1], tw[2]]] : rows).forEach((q, i) => { const yy = y0 + (50 + i * 19) * s; text(q[0], x - w + 10 * s, yy, 11.5 * s, q[2] ? '#dfffe6' : 'rgba(220,255,230,.4)'); text(String(q[1]), x - 10 * s, yy, 12 * s, q[2] ? G : 'rgba(125,255,157,.4)', 'right'); });
    const fy = y0 + (tc ? 74 : 196) * s;
    text(Tt('f_ah_fuel') + ' ' + Math.floor(fs / 60) + ':' + String(fs % 60).padStart(2, '0') + (H.farp ? ' ⛽' : ''), x - w + 10 * s, fy, 11.5 * s, fu < .15 ? (bl ? '#ff3b3b' : '#ffd24a') : '#dfffe6');
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x - 100 * s, fy - 7 * s, 90 * s, 5 * s); ctx.fillStyle = fu < .15 ? '#ff3b3b' : G; ctx.fillRect(x - 100 * s, fy - 7 * s, 90 * s * fu, 5 * s);
    if (!tc) text(Tt('f_credits') + ' ' + Math.floor(Q.cr), x, y0 + 224 * s, 12 * s, '#ffd24a', 'right');
    if (H.ghT > 0) {   // Protokol Bayangan aktif: layar bernuansa biru dingin + hitung mundur
      ctx.fillStyle = 'rgba(40,120,200,' + (.07 + .03 * Math.sin(P.time * 6)) + ')'; ctx.fillRect(0, 0, CW, CH);
      text(Tt('f_gh') + ' · ' + Math.ceil(H.ghT) + 's', cx, 104 * s, 15 * s, '#8fd8ff', 'center');
    }
    if (H.mw) { ctx.fillStyle = 'rgba(255,30,20,' + (bl ? .16 : .05) + ')'; ctx.fillRect(0, 0, CW, CH); text(Tt('f_ah_mw'), cx, 128 * s, 20 * s, bl ? '#ff3b3b' : '#ffdd33', 'center'); }
    else if (H.flT > 0) text(Tt('f_ah_flare'), cx, 128 * s, 14 * s, G, 'center');
    if (!U.touch) text(Tt('f_ah_keys'), cx, CH - 10 * s, 10.5 * s, 'rgba(200,255,210,.85)', 'center');
    if (H.st === 'crash') {   // kehilangan kendali: layar merah berkedip + ajakan melompat
      const ft = P.time * 4 % 1 < .5;
      ctx.fillStyle = 'rgba(255,20,10,' + (ft ? .22 : .08) + ')'; ctx.fillRect(0, 0, CW, CH);
      text(Tt('f_ah_crash'), cx, cy - 90 * s, 26 * s, ft ? '#ff3b3b' : '#ffdd33', 'center');
      text(Tt('f_ah_jump'), cx, cy + 96 * s, 20 * s, '#ffffff', 'center');
    }
  }
  function heliMark(s) {   // posisi Shadow Hunter sendiri saat berjalan kaki + ajakan naik / status BBM
    const H = P.heli; if (!H || P.mnt || H.u.dead) return;
    const p = R.project(H.x, H.y, H.z + 3.2, CW, CH), d = Math.hypot(H.x - P.x, H.y - P.y), dry = H.fuel <= 0;
    if (p && p.x > 0 && p.x < CW && p.y > 0 && p.y < CH) text('▼ SHADOW HUNTER ' + Math.round(d) + 'm' + (dry ? ' · ' + Tt('f_ah_dry') : ''), p.x, p.y, 12 * s, dry ? '#ffb000' : '#7dff9d', 'center');
    if (F.heliNear()) text(dry ? Tt(H.drop > 0 ? 'f_ah_dropin' : 'f_ah_nofuel', { s: Math.ceil(H.drop) }) : Tt('f_ah_board'), CW / 2, slotY(16 * s), 16 * s, dry ? '#ffb000' : '#ffd24a', 'center');
  }
  /* ---------------- HUD KENDARAAN OPERATOR (fps-veh) ---------------- */
  const VNAME = { HMV: 'HUMVEE M1151', APC: 'SANCA 6×6', MBT: 'MBT BADAI', VTOL: 'JET VTOL ELANG' };
  function vehHud(s) {
    const V = P.veh; if (!V || !V.u) return;
    const cx = CW / 2, cy = CH / 2, G = '#9dffb5', AMB = '#ffd24a', D = V.D, u = V.u, bl = (P.time * 3 % 1) < .5, zm = F.in.ads && !V.air, cy0 = P.cam ? P.cam.yaw : P.yaw;
    if (zm || V.cam) {   // bidikan penembak: bingkai gelap + garis pindai + garis jarak
      const g = ctx.createRadialGradient(cx, cy, CH * (zm ? .26 : .36), cx, cy, Math.max(CW, CH) * .7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,8,4,.9)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = 'rgba(0,30,10,.1)'; for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
      if (zm) { ctx.strokeStyle = 'rgba(157,255,181,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cx - 60 * s, cy); ctx.moveTo(cx + 60 * s, cy); ctx.lineTo(CW, cy); ctx.moveTo(cx, cy + 40 * s); ctx.lineTo(cx, CH); ctx.stroke(); for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(cx - 8 * s, cy + i * 22 * s); ctx.lineTo(cx + 8 * s, cy + i * 22 * s); ctx.stroke(); } }
      text((zm ? Tt('f_vh_turret') + ' ×4' : 'GUNNER'), cx, cy - 150 * s, 13 * s, G, 'center');
    }
    ctx.save(); ctx.strokeStyle = G; ctx.fillStyle = G; ctx.lineWidth = 1.6 * s; ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 3;
    const r0 = 10 * s; ctx.beginPath(); ctx.moveTo(cx - 26 * s, cy); ctx.lineTo(cx - r0, cy); ctx.moveTo(cx + r0, cy); ctx.lineTo(cx + 26 * s, cy); ctx.moveTo(cx, cy - 20 * s); ctx.lineTo(cx, cy - r0); ctx.moveTo(cx, cy + r0); ctx.lineTo(cx, cy + 20 * s); ctx.stroke(); ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    const at = q => { const hb = F.hitbox(q); return R.project(q.x, q.y, hb.z0 + hb.h * .5, CW, CH); };
    const dia = (p, b) => { ctx.beginPath(); ctx.moveTo(p.x, p.y - b); ctx.lineTo(p.x + b, p.y); ctx.lineTo(p.x, p.y + b); ctx.lineTo(p.x - b, p.y); ctx.closePath(); ctx.stroke(); };
    let lockP = null, aaP = null;
    if (V.bAim) { const p = R.project(V.bAim[0], V.bAim[1], V.bAim[2], CW, CH); if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 9 * s, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y + 9 * s); ctx.lineTo(p.x, p.y + 15 * s); ctx.stroke(); } }   // ke mana laras / kanon sebenarnya mengarah
    if (!V.air) {
      const w = D.w[V.wi]; if (w.cd && V.cd[V.wi] > 0) { ctx.strokeStyle = AMB; ctx.lineWidth = 2.4 * s; ctx.beginPath(); ctx.arc(cx, cy, 30 * s, -1.571, -1.571 + 6.283 * (1 - V.cd[V.wi] / w.cd)); ctx.stroke(); ctx.strokeStyle = G; ctx.lineWidth = 1.6 * s; }   // pengisi otomatis meriam
      if (V.lock && !V.lock.dead && D.atgm && V.atg > 0) { lockP = at(V.lock); if (lockP) { ctx.strokeStyle = V.acd <= 0 ? AMB : G; dia(lockP, 16 * s); } }
      // indikator badan & kubah (bawah tengah): kotak = arah badan, garis = arah laras, relatif terhadap pandangan
      const ix = cx, iy = CH - 104 * s; ctx.save(); ctx.translate(ix, iy); ctx.globalAlpha = .85;
      ctx.save(); ctx.rotate(V.yaw - cy0 + Math.PI / 2); ctx.strokeRect(-9 * s, -15 * s, 18 * s, 30 * s); ctx.beginPath(); ctx.moveTo(-9 * s, -15 * s); ctx.lineTo(0, -21 * s); ctx.lineTo(9 * s, -15 * s); ctx.stroke(); ctx.restore();
      ctx.rotate(V.ty - cy0 + Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, 6 * s, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -6 * s); ctx.lineTo(0, -26 * s); ctx.lineWidth = 3 * s; ctx.stroke(); ctx.restore();
    } else {
      const A2 = D.aam;
      if (V.lock && !V.lock.dead && V.agm > 0) { lockP = at(V.lock); if (lockP) { ctx.strokeStyle = V.mcd <= 0 ? AMB : G; dia(lockP, 16 * s); } }
      const aaL = V.aaU && V.aaT >= A2.lock;
      if (V.aaU && !V.aaU.dead && V.aam > 0) { aaP = at(V.aaU); if (aaP) { ctx.strokeStyle = aaL ? '#8fd8ff' : 'rgba(143,216,255,.75)'; ctx.setLineDash(aaL ? [] : [5 * s, 5 * s]); ctx.beginPath(); ctx.arc(aaP.x, aaP.y, (aaL ? 24 : 34 - 10 * V.aaT / A2.lock) * s, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); } }
      // penanda arah terbang (lingkaran bersayap) + garis cakrawala ikut guling
      const sp = Math.hypot(V.vx, V.vy, V.vz);
      if (sp > 8) { const p = R.project(V.x + V.vx / sp * 400, V.y + V.vy / sp * 400, V.z + V.vz / sp * 400, CW, CH); if (p) { ctx.strokeStyle = G; ctx.beginPath(); ctx.arc(p.x, p.y, 6 * s, 0, 6.283); ctx.moveTo(p.x - 6 * s, p.y); ctx.lineTo(p.x - 16 * s, p.y); ctx.moveTo(p.x + 6 * s, p.y); ctx.lineTo(p.x + 16 * s, p.y); ctx.moveTo(p.x, p.y - 6 * s); ctx.lineTo(p.x, p.y - 12 * s); ctx.stroke(); } }
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(V.rol); ctx.globalAlpha = .7; const hy = (V.pit - (P.cam ? P.cam.pitch : 0)) * 260 * s; ctx.beginPath(); ctx.moveTo(-130 * s, hy); ctx.lineTo(-60 * s, hy); ctx.moveTo(60 * s, hy); ctx.lineTo(130 * s, hy); ctx.stroke(); ctx.restore();
      if (V.bomb > 0 && V.z - F.hAt(V.x, V.y) > 20) {   // CCIP: titik jatuh bom bila dilepas sekarang
        const C = F.MDL.VEHX.VTOL; let x = V.x, y = V.y, z = V.z + C.bomb[2], vx = V.vx, vy = V.vy, vz = V.vz - 2;
        for (let i = 0; i < 400; i++) { x += vx * .05; y += vy * .05; vz -= 9.8 * .05; z += vz * .05; if (!F.inb(x, y) || z < F.hAt(x, y)) break; }
        const p = R.project(x, y, F.hAt(x, y), CW, CH); if (p) { ctx.strokeStyle = '#ff9a5a'; ctx.beginPath(); ctx.arc(p.x, p.y, 11 * s, 0, 6.283); ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y); ctx.stroke(); ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.globalAlpha = 1; }
      }
    }
    ctx.restore();
    if (lockP) text((V.air ? 'AGM ' : 'ATGM ') + Tt('f_ah_lock'), lockP.x, lockP.y - 22 * s, 10 * s, AMB, 'center');
    if (aaP) { const aaL = V.aaT >= D.aam.lock; text('AIM-9 ' + (aaL ? Tt('f_ah_lock') + ' [R]' : '…'), aaP.x, aaP.y + (aaL ? 38 : 48) * s, 10 * s, aaL && bl ? '#ffffff' : '#8fd8ff', 'center'); }
    const kmh = Math.hypot(V.vx, V.vy) * 3.6, fwd = V.vx * Math.cos(V.yaw) + V.vy * Math.sin(V.yaw);
    if (u.seats > 1) text(Tt('f_bd_seat', { s: F.seatStr(u) }), cx - 130 * s, cy + 24 * s, 11 * s, u.pax && u.pax.length ? G : 'rgba(157,255,181,.6)', 'right');   // kursi terisi (operator + pasukan penumpang)
    text(Math.round(V.air && V.mode === 'jet' ? V.spd * 3.6 : kmh) + ' KM/J', cx - 130 * s, cy + 5 * s, 15 * s, G, 'right');
    if (V.air) { text(Math.round(Math.max(0, V.z - F.hAt(V.x, V.y) - F.MDL.VEHX.VTOL.gear * V.gear)) + ' m', cx + 130 * s, cy + 5 * s, 15 * s, G, 'left'); text(V.mode === 'jet' ? 'JET · ' + (F.in.sprint ? 'AB' : Math.round(V.thr * 100) + '%') : 'VTOL', cx + 130 * s, cy + 22 * s, 10 * s, V.mode === 'jet' ? AMB : G, 'left'); }
    else { text(fwd < -.5 ? Tt('f_vh_rev') : (F.in.sprint ? 'TURBO' : 'D'), cx + 130 * s, cy + 5 * s, 13 * s, fwd < -.5 ? AMB : G, 'left'); if (V.aim) text(Math.round(V.aim.d) + ' m', cx + 34 * s, cy - 8 * s, 10 * s, G, 'left'); }
    // panel status & senjata (kanan bawah)
    const rows = [];
    const ammo = i => V.mag[i] + (D.w[i].mag ? ' / ' + V.res[i] : ''), rel = i => V.relT > 0 && V.relI === i ? Tt('f_vh_rel') + ' ' + V.relT.toFixed(1) + 's' : null;
    if (V.id === 'MBT') {
      rows.push([(V.wi === 0 ? '▶ ' : '  ') + '120MM', V.mag[0] + (V.cd[0] > 0 ? ' · ' + V.cd[0].toFixed(1) + 's' : ''), V.mag[0] > 0 && V.cd[0] <= 0]);
      rows.push([(V.wi === 1 ? '▶ ' : '  ') + 'SMB KOAKS', rel(1) || ammo(1), V.mag[1] > 0 && !rel(1)]);
      rows.push(['RUDAL AT [G]', (V.lock ? '◆ ' : '') + V.atg + (V.acd > 0 ? ' · ' + Math.ceil(V.acd) + 's' : ''), V.atg > 0 && V.acd <= 0]);
      rows.push([Tt('f_vh_smk') + ' [F]', V.smk + (V.smT > 0 ? ' · ' + Math.ceil(V.smT) + 's' : ''), V.smk > 0 && V.smCd <= 0]);
    } else if (V.air) {
      rows.push(['KANON 25MM [LMB]', V.mag[0], V.mag[0] > 0], ['AGM [RMB]', (V.lock ? '◆ ' : '') + V.agm, V.agm > 0 && V.mcd <= 0], ['AIM-9 [R]', (V.aaU && V.aaT >= D.aam.lock ? '◉ ' : '') + V.aam, V.aam > 0 && V.aaCd <= 0],
        ['BOM [G]', V.bomb, V.bomb > 0 && V.bcd <= 0], ['FLARE [F]', V.fl + (V.fcd > 0 ? ' · ' + Math.ceil(V.fcd) + 's' : ''), V.fl > 0 && V.fcd <= 0], ['MODE [X]', V.mode === 'jet' ? 'JET' : 'VTOL', true]);
    } else {
      rows.push([(V.id === 'HMV' ? 'M2 .50' : 'MK19 40MM') + ' [LMB]', rel(0) || ammo(0), V.mag[0] > 0 && !rel(0)]);
      rows.push([Tt('f_vh_smk') + ' [G]', V.smk + (V.smT > 0 ? ' · ' + Math.ceil(V.smT) + 's' : ''), V.smk > 0 && V.smCd <= 0]);
    }
    const tc = U.touch, rs = !tc ? rows : (V.id === 'MBT' ? rows.slice(0, 2) : V.air ? [rows[0], rows[5]] : rows.slice(0, 1)).map(q => [q[0].replace(/\s*\[.*\]/, ''), q[1], q[2]]);   // layar sentuh: sisanya tampil di tombol
    const x = tc ? CW - U.topR : CW - 28 * s, w = (tc ? 210 : 250) * s, ph = (44 + rs.length * 19) * s, y0 = tc ? TOPY() + 54 * s : CH - 32 * s - ph;
    ctx.fillStyle = 'rgba(0,14,6,.55)'; ctx.fillRect(x - w, y0, w, ph); ctx.strokeStyle = 'rgba(157,255,181,.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - w, y0, w, ph);
    const hp = clamp(u.hp / u.hpMax, 0, 1), hc = hp > .5 ? G : hp > .25 ? '#ffb000' : '#ff3b3b';
    text(VNAME[V.id], x - w + 10 * s, y0 + 18 * s, 13 * s, G); text(Math.round(hp * 100) + '%', x - 10 * s, y0 + 18 * s, 13 * s, hc, 'right');
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x - w + 10 * s, y0 + 24 * s, w - 20 * s, 5 * s); ctx.fillStyle = hc; ctx.fillRect(x - w + 10 * s, y0 + 24 * s, (w - 20 * s) * hp, 5 * s);
    rs.forEach((q, i) => { const yy = y0 + (48 + i * 19) * s; text(q[0], x - w + 10 * s, yy, 11.5 * s, q[2] ? '#dfffe6' : 'rgba(220,255,230,.4)'); text(String(q[1]), x - 10 * s, yy, 12 * s, q[2] ? G : 'rgba(157,255,181,.4)', 'right'); });
    if (!tc) text(Tt('f_credits') + ' ' + Math.floor(Q.cr), x, y0 - 8 * s, 12 * s, AMB, 'right');
    if (V.smT > 0) text(Tt('f_vh_smoke') + ' · ' + Math.ceil(V.smT) + 's', cx, 104 * s, 13 * s, '#dfe6e0', 'center');
    if (V.mw) { ctx.fillStyle = 'rgba(255,30,20,' + (bl ? .16 : .05) + ')'; ctx.fillRect(0, 0, CW, CH); text(V.air ? Tt('f_ah_mw') : Tt(V.smk > 0 ? 'f_vh_mw' : 'f_vh_mw0', { k: F.vehSmkKey(V) }), cx, 128 * s, 20 * s, bl ? '#ff3b3b' : '#ffdd33', 'center'); }
    else if (V.flT > 0) text(Tt('f_ah_flare'), cx, 128 * s, 14 * s, G, 'center');
    if (V.air && V.mode === 'jet' && V.pull) text(Tt('f_vh_pull'), cx, cy + 60 * s, 18 * s, bl ? '#ff3b3b' : '#ffdd33', 'center');
    if (hp < .25) { ctx.fillStyle = 'rgba(255,40,20,' + (bl ? .1 : .03) + ')'; ctx.fillRect(0, 0, CW, CH); text(Tt('f_vh_dmg'), cx, cy - 70 * s, 16 * s, bl ? '#ff3b3b' : '#ffdd33', 'center'); }
    if (!U.touch) text(Tt('f_vk_' + V.id), cx, CH - 10 * s, 10.5 * s, 'rgba(200,255,210,.85)', 'center');
  }
  function vehMark(s) {   // kendaraan sendiri yang tidak sedang dikemudikan: penanda + jarak; dalam perjalanan: hitung mundur; dekat: ajakan naik
    for (const V of F.vehs) {
      if (V === P.veh) continue;
      const a = V.arr, src = a && a.pl && a.ph === 'wait' ? a.pl : a && a.h && a.k === 'sling' ? { x: a.hx, y: a.hy, z: a.hz } : V;
      const p = R.project(src.x, src.y, (src.z || F.hAt(src.x, src.y)) + (V.air ? 3.5 : 4.2), CW, CH), d = Math.hypot(src.x - P.x, src.y - P.y);
      if (p && p.x > 0 && p.x < CW && p.y > 0 && p.y < CH) text('▼ ' + VNAME[V.id] + ' ' + Math.round(d) + 'm' + (V.st === 'in' ? ' · ' + Tt('f_vh_inb') : ''), p.x, p.y, 12 * s, V.st === 'in' ? '#ffd24a' : '#9dffb5', 'center');
    }
    const N = !P.veh && !P.mnt && F.vehNear(); if (N) text(Tt('f_vh_board', { u: VNAME[N.id] }), CW / 2, slotY(16 * s), 16 * s, '#ffd24a', 'center');
  }
  function kitMark(s) {   // meja senjata markas (≤250 m) + ajakan [E]; paket VULTURE di dekat Anda
    const b = F.bench && F.bench();
    if (b && !P.veh && !P.mnt) {
      const d = Math.hypot(b.x - P.x, b.y - P.y), p = d < 250 && d > 10 ? R.project(b.x, b.y, F.hAt(b.x, b.y) + 3.1, CW, CH) : null;
      if (p && p.x > 0 && p.x < CW && p.y > 0 && p.y < CH) text('⚙ ' + Tt('f_kit_tag') + ' ' + Math.round(d) + 'm', p.x, p.y, 12 * s, '#ffc428', 'center');
      if (F.benchNear()) text(Tt('f_kit_use'), CW / 2, slotY(16 * s), 16 * s, '#ffc428', 'center');
    }
    for (const dp of F.drops || []) {
      const d = Math.hypot(dp.x - P.x, dp.y - P.y); if (d > 45) continue;
      const p = R.project(dp.x, dp.y, F.hAt(dp.x, dp.y) + .9, CW, CH); if (p && p.x > 0 && p.x < CW && p.y > 0 && p.y < CH) text('✚', p.x, p.y, 13 * s, '#7dff9d', 'center');
    }
  }
  /* perk & lampiran aktif (kanan bawah, di atas amunisi), bilah stamina, layar LAST STAND */
  function kitHud(s) {
    if (!F.perksOn) return;
    const pk = F.perksOn(), at = P.w[P.cur] && P.w[P.cur].id === 'AR' ? F.attOn('AR') : [], y = CH - 104 * s;
    if (pk.length) text(pk.map(k => Tt('f_pk_' + k)).join(' · '), CW - 30 * s + TX(), y, 10 * s, '#ffc428', 'right', false);
    if (at.length) text(at.map(k => Tt('f_att_' + k)).join(' · '), CW - 30 * s + TX(), y + (pk.length ? 13 * s : 0), 10 * s, 'rgba(200,230,255,.8)', 'right', false);
    if (P.stam < .995 && !P.down && !P.tgt) {   // stamina lari: bilah tipis di bawah crosshair
      const w = 70 * s, x = CW / 2 - w / 2, yy = CH / 2 + 46 * s, tired = P.tired;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x, yy, w, 3 * s); ctx.fillStyle = tired ? '#ff6b6b' : F.hasPerk('MARATHON') ? '#ffc428' : 'rgba(255,255,255,.85)'; ctx.fillRect(x, yy, w * P.stam, 3 * s);
      if (tired) text(Tt('f_tired'), CW / 2, yy + 14 * s, 10 * s, '#ff8a8a', 'center');
    }
    if (P.down) {   // LAST STAND: pinggir layar merah gelap + hitung mundur bangkit
      const k = P.down.t / P.down.d, g = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * .2, CW / 2, CH / 2, Math.max(CW, CH) * .7);
      g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, 'rgba(90,0,0,' + (.55 + .1 * Math.sin(P.time * 5)) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      const ty = CH / 2 - 70 * s; text(Tt('f_ls_hud'), CW / 2, ty, 26 * s, '#ff4a4a', 'center');
      const w = 220 * s; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(CW / 2 - w / 2, ty + 10 * s, w, 6 * s); ctx.fillStyle = '#ffd24a'; ctx.fillRect(CW / 2 - w / 2, ty + 10 * s, w * k, 6 * s);
      text(Tt('f_ls_cnt', { s: Math.ceil(P.down.d - P.down.t) }), CW / 2, ty + 32 * s, 12 * s, '#fff', 'center');
    }
  }
  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!F.world || !P.cam || !R.ready) { ctx.fillStyle = '#05100a'; ctx.fillRect(0, 0, CW, CH); text(Tt('f_loading'), CW / 2, CH / 2, 16, '#39ff6e', 'center'); return; }
    HF = FONT;
    if (F.ccLayout) F.ccLayout(CW, CH, sc(), U.touch || F.paused || M.map || M.sb || M.army || !!(P.gs && (P.gs.mode === 'pick' || P.gs.mode === 'pred')));
    if (P.gs && P.alive) {   // kamera udara: render 3D dari drone / AC-130 / hulu ledak (cadangan tanpa WebGL: pandangan atas datar)
      const g = P.gs, s = sc();
      if (g.mode === 'pick') { R.render(ctx, CW, CH, dpr, dt); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); pickHud(s); return; }
      const gl3 = !!(F.GLW && F.GLW.render(ctx, CW, CH, dpr, dt)); R.gl = gl3;
      if (!gl3) { if (g.mode === 'uav') R.render(ctx, CW, CH, dpr, dt); else R.renderTop(ctx, CW, CH, dpr, F.gsTop()); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (g.mode === 'pred') predHud(s, gl3); else if (g.mode === 'uav') { droneHud(s); targeting(s); callin(s); } else if (g.mode === 'laser') laserHud(s); else gunshipHud(s, gl3);
      if (F.ccDraw) F.ccDraw(ctx, s);
      return;
    }
    R.render(ctx, CW, CH, dpr, dt); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = sc(), tod = F.TOD[P.tod] || F.TOD.DAY; HF = SANS; TY = U.touch ? 0 : 112 * s; M.cine = false; M.sqTop = CH; CY = !U.touch && bigBan() ? CH * .62 + 8 * s : CH / 2 + 64 * s; CYMAX = CH - (U.touch ? 100 : 92) * s;
    if (P.alive && !P.menu && (P.entA || (!P.mnt && !P.veh))) {   // P.entA: tangan meraih pintu saat naik kendaraan
      VM.draw(ctx, CW, CH, dt, { tint: tod.tint.map(v => v * tod.amb), nvg: R.nvg, uni: [46, 48, 50] });   // jaket operator abu arang
      if (!P.entA) scope(s);
    }
    vignette(); nvgOverlay(); if (P.alive && !P.menu) { buffFx(s); streakFx(s); } nukeFx(s); if (F.crayFx && !P.menu) F.crayFx(ctx, CW, CH, s);   // v2.12: duel Cray, tebasan Judgement Cut End di layar
    if (!P.menu || P.alive) {
      if (P.alive) { damage(s); if (P.entA) { /* animasi naik kendaraan: tanpa HUD kokpit */ } else if (P.mnt) { HF = FONT; heliHud(s); HF = SANS; } else if (P.veh) { HF = FONT; vehHud(s); HF = SANS; } else { crosshair(s); bottomRight(s); kitHud(s); } tags(s); bottomLeft(s); streaks(s); targeting(s); if (!U.touch) chuteHud(s); heliMark(s); vehMark(s); kitMark(s); }
      else deadScreen(s);
      compass(s); minimap(s); if (P.alive && !(U.touch && (P.mnt || P.veh))) stealthHud(s); scorePanel(s); bossHud(s); if (U.touch && P.alive) chuteHud(s); killfeed(s); pops(s); if (F.ccDraw) F.ccDraw(ctx, s); msgs(s); callin(s); cmdPanel(s); scoreboard(s); bigMap(s);
    }
    overBanner(s);
  }

  /* ---------------- API ---------------- */
  U.resize = resize; U.lock = lock;
  U.enter = function () {
    U.active = true; resize(); F.enter(); stage.classList.add('fps');
    if (F.world && F.world.g === Q.g) { F.update(0); if (!P.alive) showMenu(); return; }
    M.building = true; loadShow();   // layar memuat dulu tergambar & animasinya berjalan, baru medan 3D dibangun
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      if (!U.active) { M.building = false; loadDone(); return; } F.ensureWorld(); F.update(0); M.building = false; if (!P.alive) showMenu();
      requestAnimationFrame(() => requestAnimationFrame(loadDone));   // tunggu frame 3D pertama (unggah mesh ke GPU) lalu memudar ke menu kelas
    }, 40)));
  };
  U.leave = function () {
    if (F.kitClose) F.kitClose();
    U.active = false; M.started = false; M.mid = false; M.ci = false; M.cmd = false; M.army = false; M.map = false; armyEl.classList.add('off'); M.sb = false; M.pause = false; F.paused = false;
    menuEl.classList.add('off'); pauseEl.classList.add('off'); if (document.pointerLockElement) document.exitPointerLock();
    Object.assign(F.in, { f: 0, b: 0, l: 0, r: 0, sprint: false, jump: false, fire: false, ads: false, kl: 0, kr: 0, ku: 0, kd: 0 });
    F.leave();
  };
  U.frame = function (dt) {
    if (!U.active) return;
    if (CW < 50) resize();
    if (M.building) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#04100a'; ctx.fillRect(0, 0, CW, CH); return; }   // layar memuat = elemen HTML #fpsload
    TK.warui.ensureTerrain();
    const run = !F.paused && !(P.menu && !M.started);
    if (run) { war.update(dt); F.update(dt); } else { P.time += dt; F.updateCam(); }
    if (M.hint > 0) M.hint -= dt;
    // turunkan grafis otomatis: resolusi dinamis (fps-gl) dulu; bila sudah di batas bawah & masih < ±30 FPS selama 4 dtk → kualitas turun satu tingkat (disimpan)
    const G = F.GLW;
    if (run) {
      M.avg = (M.avg || .016) * .95 + Math.min(dt, .1) * .05;
      M.slow = M.avg > Math.max(.034, 1.5 / (F.opts.cap || 60)) && (!G || !G.ok || G.dy <= (G.dyMin || .6) + .01) ? (M.slow || 0) + dt : 0;
      if (M.slow > 4 && F.opts.quality > 0) { F.opts.quality--; M.slow = 0; M.avg = .016; if (G) G.dy = 1; resize(); F.msg(Tt('f_q_auto'), 'w'); }
      M.fpsA = (M.fpsA || 0) + dt; M.fpsN = (M.fpsN || 0) + 1; if (M.fpsA >= .5) { M.fps = Math.round(M.fpsN / M.fpsA); M.fpsA = 0; M.fpsN = 0; }
    }
    if (G) G.idle = !run;
    if (F.swGL && !F.opts.mobile && run && P.alive && !M.swTold) { M.swTold = true; F.msg(Tt('f_sw_warn'), 'w'); }
    // menu muncul otomatis setelah mati
    if (P.menu && menuEl.classList.contains('off') && !Q.over) { showMenu(); }
    if (!menuEl.classList.contains('off')) { M.tick += dt; if (M.tick > .8) { M.tick = 0; renderMenu(); } }
    if (Q.over && document.pointerLockElement) document.exitPointerLock();
    if (!run) { M.ia = (M.ia || 0) + dt; if (M.ia < .05) return; M.ia = 0; }   // menu/jeda: latar 3D cukup 20 FPS agar GPU dingin
    draw(dt);
    if (F.opts.fps && run) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); text('FPS ' + (M.fps || 0) + ' · ' + Tt('f_q' + F.opts.quality) + (G && G.ok ? ' · ' + Math.round(G.dy * 100) + '%' + (G.sw ? ' · CPU' : '') : ' · CPU'), 10, CH - 10, 11, M.fps >= 45 ? '#7dff9a' : M.fps >= 28 ? '#ffd35a' : '#ff6b5a', 'left'); }
    if (A()) A().tick(dt, P.unit ? P.unit.hp / P.unit.hpMax : 1, P.alive);
  };
  const wf = $('#wfps'); if (wf) wf.onclick = () => $('button[data-view=fps]').click();
  U.state = M; U.clsOpen = clsOpen; U.clsClose = clsClose; U.setPause = setPause; U.setArmy = setArmy; U.quickCmd = quickCmd; U.CMD_O = CMD_O;
  U.applyLang = function () { if (!menuEl.classList.contains('off')) { M.menuSig = ''; renderMenu(); } if (!pauseEl.classList.contains('off')) pauseEl.innerHTML = pauseHTML(); };
})();
