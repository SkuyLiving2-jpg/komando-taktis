/* ============================================================
   PLAY — edisi offline: langsung ke mode OPERATOR tanpa layar
   radar/warzone. Simulasi warzone tetap berjalan di belakang
   (pasukan AI, pos, bos), hanya tampilannya yang tidak dipakai.
   Layar menu utama, pengaturan, deteksi HP/tablet (grafis &
   jumlah pasukan diperkecil, batas 30 FPS), loop permainan,
   dan pendaftaran service worker (main tanpa internet).
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, S = TK.S, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q, U = TK.fpsui, W = TK.WAR;
  const $ = s => document.querySelector(s), Tt = (k, v) => TK.t(k, v), A = () => TK.fpsaudio;
  const stage = $('#stage'), titleEl = $('#ptitle'), overEl = $('#pover');
  // layar game tidak boleh ikut tergulir (fokus tombol / scrollIntoView di menu bisa menggeser #stage walau overflow hidden → tombol atas hilang, HUD terpotong)
  for (const el of [stage, document.documentElement, document.body]) el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } }, { passive: true });
  S.view = 'fps';

  /* ---------- perangkat ---------- */
  const ua = navigator.userAgent || '';
  const touchDev = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  /* ---------- pengaturan ---------- */
  const SET = { diff: 1, doc: 'tni', ctl: 'auto', q: 'auto', cap: 60, cv: 2 };   // v2.13: HP juga 60 FPS (dulu 30)
  try { Object.assign(SET, JSON.parse(localStorage.getItem('tk_play') || '{}')); } catch (e) { /* ok */ }
  if (SET.cv !== 2) { if (SET.cap === 30) SET.cap = 60; SET.cv = 2; }   // simpanan lama (batas 30 bawaan HP) → 60
  let vol0 = null; try { vol0 = localStorage.getItem('tk_fps_vol'); } catch (e) { /* ok */ }
  F.opts.vol = vol0 !== null && vol0 !== '' && isFinite(+vol0) ? +vol0 : touchDev ? .9 : .15;   // volume bawaan: HP 90% (speaker kecil), PC 15%
  const save = () => { try { localStorage.setItem('tk_play', JSON.stringify(SET)); } catch (e) { /* ok */ } };
  let qInit = false;
  const isTouch = () => SET.ctl === 'touch' || (SET.ctl === 'auto' && touchDev);
  function apply() {
    S.doc = SET.doc; document.body.dataset.doc = SET.doc; document.documentElement.lang = TK.doc().lang;
    U.touch = isTouch(); document.body.classList.toggle('touch', U.touch);
    F.opts.mobile = touchDev; F.opts.cap = SET.cap; U.host.caps = touchDev ? [30, 60] : [30, 60, 0]; F.opts.gsStab = U.touch;   // AC-130: bidikan stabil-darat untuk layar sentuh
    if (SET.q !== 'auto') F.opts.quality = +SET.q; else if (touchDev && !qInit) F.opts.quality = 0;   // OTOMATIS: HP mulai RENDAH; PC memakai deteksi GPU / pilihan terakhir di menu jeda
    qInit = true;
    const ro = $('#protate'); if (ro) ro.textContent = Tt('pl_rotate');
    if (F.GLW) F.GLW.dy = 1;
    U.resize();
  }

  /* ---------- tekstur peta untuk minimap & peta taktis [M] (pengganti war-view) ---------- */
  const V = { terr: null, terrFor: null };
  TK.warui = { state: V, ensureTerrain() { if (Q.g && V.terrFor !== Q.g) { V.terr = TK.warTerrain.build(Q.g); V.terrFor = Q.g; } }, applyLang() { }, resize() { }, headerText: () => '', hudText: () => '' };

  /* ---------- kait fps-ui: kembali / ulang / bahasa ---------- */
  Object.assign(U.host, {
    doc: id => { SET.doc = id; save(); apply(); U.applyLang(); },
    setCap: c => { SET.cap = c; save(); F.opts.cap = c; nextT = 0; },   // batas FPS dari menu jeda
    back: () => goTitle(),
    restart: () => restart(),
    overHint: false, backKey: 'pl_menu'
  });

  /* ---------- layar menu utama ----------
     kiri: lambang + daftar menu (MAIN · PENGATURAN · CARA BERMAIN · KELUAR); kanan: panel layar aktif.
     Beranda menampilkan PETA OPERASI dari misi yang benar-benar akan dimainkan (pos, markas, jalan, medan) dengan sapuan radar */
  const TS = { scr: 'home', fresh: false };   // fresh = misi di Q belum pernah dimainkan (peta beranda = peta yang akan dimasuki)
  const opt = (k, v, label, on) => '<button data-k="' + k + '" data-v="' + v + '" class="' + (on ? 'on' : '') + '">' + label + '</button>';
  function offStatus() {
    if (location.protocol === 'file:') return Tt('pl_off_file');
    if (!('serviceWorker' in navigator)) return Tt('pl_off_no');
    return offReady ? Tt('pl_off_ok') : Tt('pl_off_wait');
  }
  function newMission() { war.popK = touchDev ? (SET.diff === 0 ? .3 : .6) : 1; war.reset(SET.diff); TS.fresh = true; }   // HP: gerombolan & pasukan musuh lebih kecil agar CPU kuat
  // garis kontur topografi (latar), dibuat sekali
  const TOPO = (() => {
    let d = ''; const C = [[210, 170, 1], [560, 330, 1.3], [880, 120, .8]];
    for (const [cx, cy, k] of C) for (let r = 26; r < 300 * k; r += 22) {
      let p = '';
      for (let i = 0; i <= 48; i++) { const a = i / 48 * 6.2832, q = r * (1 + .18 * Math.sin(a * 3 + r * .05) + .08 * Math.sin(a * 5 - r * .03)); p += (i ? 'L' : 'M') + (cx + Math.cos(a) * q).toFixed(1) + ' ' + (cy + Math.sin(a) * q * .72).toFixed(1); }
      d += p + 'Z';
    }
    return '<svg class="pm-topo" viewBox="0 0 1100 500" preserveAspectRatio="xMidYMid slice"><path d="' + d + '"/></svg>';
  })();
  const NAV = [['play', 'pl_play', 'pl_m_play_s'], ['set', 'pl_m_set', 'pl_m_set_s'], ['help', 'pl_m_help', 'pl_m_help_s'], ['exit', 'pl_m_exit', 'pl_m_exit_s']];
  function navHTML() {
    return '<nav class="pm-nav">' + NAV.map(([id, l, s], i) => '<button data-go="' + id + '" class="pm-i' + (id === 'play' && (TS.scr === 'home' || TS.scr === 'play') ? ' main' : '') + (TS.scr === id ? ' cur' : '') + '" style="--d:' + i + '">' +
      '<em>0' + (i + 1) + '</em><b>' + Tt(l) + '</b><small>' + Tt(s) + '</small><i>›</i></button>').join('') + '</nav>';
  }
  const rows = k => Tt(k).split('|').map(r => { const i = r.indexOf('='), a = r.slice(0, i), b = r.slice(i + 1); return '<div class="pm-kv"><b>' + a + '</b><span>' + b + '</span></div>'; }).join('');
  function panelHTML() {
    const back = '<button class="pm-back" data-go="home">‹ ' + Tt('pl_back') + '</button>';
    if (TS.scr === 'play') {
      const d = [0, 1, 2, 3].map(i => '<button data-k="diff" data-v="' + i + '" class="pd' + (SET.diff === i ? ' on' : '') + '"><em>' + 'I II III IV'.split(' ')[i] + '</em><b>' + Tt('w_d' + i) + '</b><small>' + Tt('pl_diff_d' + i) + '</small></button>').join('');
      return '<div class="pm-p" data-s="play"><div class="pm-h"><h3>' + Tt('pl_op') + '</h3>' + back + '</div>' +
        '<div class="pm-cap">' + Tt('pl_diff') + '</div><div class="pt-diff">' + d + '</div>' +
        '<div class="pm-cap">' + Tt('pl_doc') + '</div><div class="pt-row">' + opt('doc', 'tni', 'TNI · INDONESIA', SET.doc === 'tni') + opt('doc', 'us', 'US · ENGLISH', SET.doc === 'us') + '</div>' +
        '<div class="pm-act"><button class="pt-go" data-a="play">' + Tt('pl_go') + ' ▶</button><button class="pm-sec" data-a="reroll">⟳ ' + Tt('pl_new') + '</button></div></div>';
    }
    if (TS.scr === 'set') {
      return '<div class="pm-p" data-s="set"><div class="pm-h"><h3>' + Tt('pl_m_set') + '</h3>' + back + '</div>' +
        '<div class="pm-cap">' + Tt('pl_ctl') + '</div><div class="pt-row">' + opt('ctl', 'auto', Tt('pl_auto'), SET.ctl === 'auto') + opt('ctl', 'touch', Tt('pl_touch'), SET.ctl === 'touch') + opt('ctl', 'kb', Tt('pl_kb'), SET.ctl === 'kb') + '</div>' +
        '<div class="pm-cap">' + Tt('pl_gfx') + '</div><div class="pt-row">' + opt('q', 'auto', Tt('pl_auto'), SET.q === 'auto') + [0, 1, 2].map(i => opt('q', i, Tt('f_q' + i), SET.q === i)).join('') + '</div>' +
        '<div class="pm-cap">' + Tt('pl_cap') + '</div><div class="pt-row">' + opt('cap', 30, '30 FPS', SET.cap === 30) + opt('cap', 60, '60 FPS', SET.cap === 60) + (touchDev ? '' : opt('cap', 0, 'MAKS', SET.cap === 0)) + '</div>' +
        '<div class="pm-cap">' + Tt('pl_doc') + '</div><div class="pt-row">' + opt('doc', 'tni', 'TNI · INDONESIA', SET.doc === 'tni') + opt('doc', 'us', 'US · ENGLISH', SET.doc === 'us') + '</div>' +
        '<div class="pt-row pm-more">' + (document.fullscreenEnabled || document.webkitFullscreenEnabled ? '<button data-a="fs">⛶ ' + Tt('pl_fs') + '</button>' : '') +
        (installEv ? '<button data-a="install">⤓ ' + Tt('pl_install') + '</button>' : '') + '</div>' +
        (touchDev ? '<small class="pm-note">' + Tt('pl_mobile') + '</small>' : '') +
        (!installEv && ios && !standalone && location.protocol !== 'file:' ? '<small class="pm-note ios">' + Tt('pl_ios') + '</small>' : '') + '</div>';
    }
    if (TS.scr === 'help') {
      return '<div class="pm-p" data-s="help"><div class="pm-h"><h3>' + Tt('pl_m_help') + '</h3>' + back + '</div>' +
        '<div class="pm-cap">' + Tt(isTouch() ? 'pl_touch' : 'pl_kb') + '</div><div class="pm-kvs">' + rows(isTouch() ? 'pl_help_tc' : 'pl_help_kb') + '</div>' +
        '<div class="pm-cap">' + Tt('pl_tips') + '</div><ul class="pm-tips">' + Tt('pl_help_tip').split('|').map(t => '<li>' + t + '</li>').join('') + '</ul></div>';
    }
    if (TS.scr === 'exit') {
      return '<div class="pm-p pm-exit" data-s="exit"><div class="pm-q">' + Tt('pl_exit_q') + '</div><small>' + Tt('pl_exit_s') + '</small>' +
        '<div class="pm-act"><button class="pt-go red" data-a="quit">' + Tt('pl_exit_y') + '</button><button class="pm-sec" data-go="home">' + Tt('pl_exit_n') + '</button></div></div>';
    }
    const held = Q.objs.filter(o => o.owner === 'R').length;
    return '<div class="pm-p pm-home" data-s="home"><div class="pm-h"><h3>' + Tt('pl_map') + '</h3><span class="pm-dif">' + Tt('w_d' + SET.diff) + '</span></div>' +
      '<div class="pm-map" data-go="play"><canvas></canvas><div class="pm-sweep"></div><div class="pm-leg"><span class="b">■ ' + Tt('pl_map_hq') + '</span><span class="r">■ ' + Tt('pl_map_hqr') + '</span><span class="r">● ' + Tt('pl_map_foe') + '</span><span class="n">● ' + Tt('pl_map_free') + '</span></div></div>' +
      '<div class="pm-brief">' + Tt('pl_map_s', { n: String(Q.g.seed).padStart(5, '0').slice(-5), p: held }) + '</div></div>';
  }
  function titleHTML() {
    return '<div class="pm-bg">' + TOPO + '</div>' +
      '<div class="pm-l"><div class="pm-brand"><div class="pm-tag"><i></i>' + Tt('pl_tag') + '</div><h1><span>KOMANDO</span><span>TAKTIS</span></h1><div class="pm-sub">' + (SET.doc === 'tni' ? '★' : '✦') + ' OPERATOR</div></div>' +
      navHTML() + (TK.FPS.swGL && !TK.FPS.opts.mobile ? '<div class="pm-swarn">' + Tt('pl_sw_warn') + '</div>' : '') + '<div class="pm-foot"><span class="pm-off">' + offStatus() + '</span><span>' + Tt('pl_ver') + '</span></div></div>' +
      '<div class="pm-r">' + panelHTML() + '</div>';
  }
  /* peta operasi (beranda): medan warzone digelapkan + kisi, jalan, pos A–E (merah = dikuasai musuh), markas kedua pihak */
  function drawMap() {
    const cv = titleEl.querySelector('.pm-map canvas'); if (!cv || !Q.g) return;
    const box = cv.parentNode, w = box.clientWidth, h = box.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1); if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    TK.warui.ensureTerrain(); const T = V.terr, cell = W.CELL;
    // bingkai = kotak pembatas semua pos & markas (+ tepi), diperbesar mengikuti rasio panel → peta mengisi panel tanpa pita kosong,
    // markas di tepi peta tidak terpotong (dulu peta "contain": pita hitam di atas, HQ menempel di tepi)
    const pts = [Q.hqB, Q.hqR, ...Q.objs], xs = pts.map(p => p.x), ys = pts.map(p => p.y), pad = Math.max(W.WW, W.WH) * .07;
    const bx0 = Math.min(...xs) - pad, bx1 = Math.max(...xs) + pad, by0 = Math.min(...ys) - pad, by1 = Math.max(...ys) + pad;
    const k = Math.min(w / (bx1 - bx0), h / (by1 - by0)), vw = w / k, vh = h / k;
    const fit = (c, v, L) => v >= L ? (L - v) / 2 : Math.max(0, Math.min(L - v, c - v / 2));
    const vx = fit((bx0 + bx1) / 2, vw, W.WW), vy = fit((by0 + by1) / 2, vh, W.WH), P2 = (x, y) => [(x - vx) * k, (y - vy) * k], sx = k;
    c.fillStyle = '#0c0c0c'; c.fillRect(0, 0, w, h);
    if (T) {   // latar: peta yang sama diperbesar & diburamkan mengisi sisa panel, lalu peta tajam di atasnya dengan tepi memudar
      const kc = Math.max(w / W.WW, h / W.WH) * 1.08; c.save(); try { c.filter = 'blur(10px) brightness(.5) saturate(.6)'; } catch (e) { /* ok */ } c.drawImage(T, (w - W.WW * kc) / 2, (h - W.WH * kc) / 2, W.WW * kc, W.WH * kc); c.restore();
      const X0 = -vx * k, Y0 = -vy * k, MW = W.WW * k, MH = W.WH * k; c.globalAlpha = .92; c.drawImage(T, X0, Y0, MW, MH); c.globalAlpha = 1;
      for (const [y, d] of [[Y0, 1], [Y0 + MH, -1]]) if (y > 1 && y < h - 1) { const g = c.createLinearGradient(0, y, 0, y + d * 26); g.addColorStop(0, 'rgba(4,16,10,.85)'); g.addColorStop(1, 'rgba(4,16,10,0)'); c.fillStyle = g; c.fillRect(0, d > 0 ? y : y - 26, w, 26); }
      for (const [x, d] of [[X0, 1], [X0 + MW, -1]]) if (x > 1 && x < w - 1) { const g = c.createLinearGradient(x, 0, x + d * 26, 0); g.addColorStop(0, 'rgba(4,16,10,.85)'); g.addColorStop(1, 'rgba(4,16,10,0)'); c.fillStyle = g; c.fillRect(d > 0 ? x : x - 26, 0, 26, h); }
    }
    c.fillStyle = 'rgba(2,14,8,.5)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(140,255,170,.08)'; c.lineWidth = 1; c.beginPath();
    for (let x = 0; x <= W.GW; x += 10) { const X = (x * cell - vx) * k; c.moveTo(X, 0); c.lineTo(X, h); } for (let y = 0; y <= W.GH; y += 10) { const Y = (y * cell - vy) * k; c.moveTo(0, Y); c.lineTo(w, Y); } c.stroke();
    c.strokeStyle = 'rgba(140,255,170,.1)'; for (let r = 1; r <= 4; r++) { c.beginPath(); c.arc(w / 2, h / 2, r * Math.hypot(w, h) / 8, 0, 6.3); c.stroke(); }   // lingkar jarak radar
    c.strokeStyle = 'rgba(230,220,180,.45)'; c.lineWidth = 1.6; c.setLineDash([5, 4]);
    for (const r of Q.g.roads || []) { c.beginPath(); r.forEach((p, i) => { const [x, y] = P2(p[0] * cell, p[1] * cell); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); }
    c.setLineDash([]);
    const fc = SET.doc === 'us' ? '#4aa3ff' : '#ff9f1c', mk = (x, y, col, lbl, sq) => {
      c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.75)'; c.lineWidth = 2; c.beginPath();
      if (sq) { const bw = 26, bh = 16; c.moveTo(x - bw / 2 + 3, y - bh / 2); c.arcTo(x + bw / 2, y - bh / 2, x + bw / 2, y + bh / 2, 3); c.arcTo(x + bw / 2, y + bh / 2, x - bw / 2, y + bh / 2, 3); c.arcTo(x - bw / 2, y + bh / 2, x - bw / 2, y - bh / 2, 3); c.arcTo(x - bw / 2, y - bh / 2, x + bw / 2, y - bh / 2, 3); c.closePath(); }
      else c.arc(x, y, 10, 0, 6.3);
      c.fill(); c.stroke();
      c.fillStyle = '#071008'; c.font = 'bold ' + (sq ? 10 : 11) + 'px BC, Bahnschrift, "Arial Narrow", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lbl, x, y + .5);
    };
    box.querySelectorAll('.pm-ping').forEach(e => e.remove());
    const ping = (x, y, i) => { const e = document.createElement('i'); e.className = 'pm-ping'; e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.setProperty('--d', (i * .4) + 's'); box.appendChild(e); };
    let pi = 0;
    for (const o of Q.objs) { const [x, y] = P2(o.x, o.y); c.strokeStyle = o.owner === 'R' ? 'rgba(255,80,60,.5)' : 'rgba(220,230,220,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, Math.max(14, o.r * sx), 0, 6.3); c.stroke(); mk(x, y, o.owner === 'R' ? '#ff5a46' : o.owner === 'B' ? fc : '#d8ded6', o.name[0]); if (o.owner === 'R') ping(x, y, pi++); }
    const [bx, by] = P2(Q.hqB.x, Q.hqB.y), [rx, ry] = P2(Q.hqR.x, Q.hqR.y); mk(bx, by, fc, 'HQ', true); mk(rx, ry, '#ff5a46', 'HQ', true); ping(rx, ry, pi++);
    const sw = titleEl.querySelector('.pm-sweep'); if (sw) { const D = Math.ceil(Math.hypot(w, h) * 1.05); sw.style.width = D + 'px'; sw.style.left = (w / 2) + 'px'; sw.style.top = (h / 2) + 'px'; }   // radar berputar dari tengah peta (dulu dari HQ di tepi → irisan miring yang aneh)
  }
  function renderTitle() {
    const sc = titleEl.querySelector('.pm-p'), keep = sc ? sc.scrollTop : 0, same = sc && sc.dataset.s === TS.scr;
    titleEl.innerHTML = titleHTML(); titleEl.classList.toggle('pm-sub-on', TS.scr !== 'home');
    const s2 = titleEl.querySelector('.pm-p'); if (s2 && same) { s2.scrollTop = keep; s2.classList.add('still'); }
    if (TS.scr === 'home') requestAnimationFrame(drawMap);
  }
  function go(scr) { if (TS.scr === scr) return; TS.scr = scr; if (A()) { A().init(); A().local('ui', .4); } renderTitle(); }
  titleEl.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'play') { start(); return; }
    if (b.dataset.a === 'fs') { fullscreen(); return; }
    if (b.dataset.a === 'reroll') { newMission(); renderTitle(); return; }
    if (b.dataset.a === 'quit') { quit(); return; }
    if (b.dataset.a === 'install' && installEv) { installEv.prompt(); installEv.userChoice.finally(() => { installEv = null; renderTitle(); }); return; }
    const k = b.dataset.k; if (!k) return;
    const v = b.dataset.v, old = SET.diff; SET[k] = k === 'diff' || k === 'cap' ? +v : k === 'q' && v !== 'auto' ? +v : v;
    save(); apply(); if (k === 'diff' && SET.diff !== old) newMission(); renderTitle();
  });
  /* KELUAR: aplikasi terpasang (PWA) bisa menutup jendelanya; di peramban biasa skrip tidak boleh menutup tab → layar pamit */
  function quit() {
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* ok */ }
    try { window.close(); } catch (e) { /* ok */ }
    setTimeout(() => {
      if (window.closed) return;
      titleEl.innerHTML = '<div class="pm-bg">' + TOPO + '</div><div class="pm-bye"><div class="pm-crest">' + (SET.doc === 'tni' ? '★' : '✦') + '</div><h2>' + Tt('pl_bye') + '</h2><small>' + Tt('pl_bye_s') + '</small><button class="pm-sec" data-go="home">‹ ' + Tt('pl_menu') + '</button></div>';
      TS.scr = 'bye';
    }, 250);
  }
  window.addEventListener('resize', () => { if (!titleEl.classList.contains('off') && TS.scr === 'home') drawMap(); });
  function fullscreen() {
    const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
    if (document.fullscreenElement || document.webkitFullscreenElement) return Promise.resolve();
    if (!rq) return Promise.resolve();
    try { const p = rq.call(el, { navigationUI: 'hide' }); return (p && p.then ? p : Promise.resolve()).then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }); } catch (e) { /* ok */ } }).catch(() => { }); }
    catch (e) { return Promise.resolve(); }
  }

  /* ---------- alur permainan ---------- */
  function start() {
    if (A()) A().init();
    if (touchDev && !standalone) fullscreen();
    if (!TS.fresh || Q.diff !== SET.diff) newMission();   // peta yang terlihat di menu = peta yang dimainkan
    TS.fresh = false; apply();
    titleEl.classList.add('off'); overEl.classList.add('off');
    U.enter();
  }
  function restart() {
    war.reset(Q.diff); overEl.classList.add('off');   // peta baru → fps-ui menampilkan menu kelas lagi
  }
  function goTitle() {
    if (U.active) U.leave();
    overEl.classList.add('off'); titleEl.classList.remove('off'); newMission(); TS.scr = 'home'; renderTitle();
  }
  /* layar akhir misi: kemenangan = sinar emas berputar, percikan konfeti, bintang, statistik menghitung naik, medali, kemajuan pangkat */
  function overHTML() {
    const win = Q.over === 'win', t = Math.floor(Q.t), own = Q.objs.filter(o => o.owner === 'B').length, bk = Q._bk && Q._bk.g === Q.g ? Q._bk.n : 0;
    const stars = win ? Math.max(1, 3 - (P.deaths > 2 ? 1 : 0) - (Q.t > 1500 ? 1 : 0)) : 0;
    const R = F.RANKS, ri = F.rank(), nx = R[ri + 1], pr = nx ? (F.xp - R[ri]) / (nx - R[ri]) : 1;
    const med = [[P.deaths === 0 && win, 'ghost', '☠'], [P.hs >= 10, 'sharp', '◎'], [P.best >= 10, 'streak', '🔥'], [bk > 0, 'boss', '♛'], [win && Q.t < 900, 'blitz', '⚡'], [own === Q.objs.length, 'hold', '⚑']].filter(m => m[0]);
    const tile = (k, v, i, fmt) => '<div class="po-t" style="--d:' + i + '"><b data-n="' + v + '"' + (fmt ? ' data-f="' + fmt + '"' : '') + '>0</b><em>' + Tt(k) + '</em></div>';
    const op = F.opName ? F.opName() : '', mm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
    let sp = ''; if (win) for (let i = 0; i < 28; i++) sp += '<i style="--x:' + (Math.random() * 100).toFixed(1) + '%;--dl:' + (Math.random() * 2.5).toFixed(2) + 's;--du:' + (2.6 + Math.random() * 2).toFixed(2) + 's;--r:' + Math.round(Math.random() * 360) + 'deg;--c:' + ['#ffd24a', '#fff2b0', '#3dff7a', '#ffb000'][i % 4] + '"></i>';
    return '<div class="po-wrap ' + (win ? 'win' : 'lose') + '">' + (win ? '<div class="po-rays"></div><div class="po-conf">' + sp + '</div>' : '<div class="po-smoke"></div>') +
      '<div class="po-card"><div class="po-top"><small>' + esc(op) + ' · ' + Tt('w_d' + (Q.diff || 0)) + '</small><h1>' + Tt(win ? 'po_win' : 'po_lose') + '</h1><p>' + Tt(win ? 'po_win_s' : 'po_lose_s') + '</p>' +
      '<div class="po-stars">' + [0, 1, 2].map(i => '<i class="' + (i < stars ? 'on' : '') + '" style="--d:' + i + '">★</i>').join('') + '</div></div>' +
      '<div class="po-grid">' + tile('po_score', P.score, 0) + tile('po_kills', P.kills, 1) + tile('po_hs', P.hs, 2) + tile('po_best', P.best, 3) +
      tile('po_deaths', P.deaths, 4) + tile('po_time', t, 5, 't') + tile('po_posts', own, 6, '/' + Q.objs.length) + tile('po_boss', bk, 7) + '</div>' +
      '<div class="po-low"><div class="po-med"><em>' + Tt('po_medals') + '</em><div>' + (med.length ? med.map((m, i) => '<span style="--d:' + i + '"><i>' + m[2] + '</i>' + Tt('po_m_' + m[1]) + '</span>').join('') : '<small>' + Tt('po_m_none') + '</small>') + '</div></div>' +
      '<div class="po-rank"><em>' + Tt('po_rank') + '</em><b>' + Tt('f_rank_' + ri) + '</b><div class="bar"><i style="--w:' + Math.round(Math.min(1, pr) * 100) + '%"></i></div><small>' + (nx ? Tt('po_next', { n: Math.max(0, nx - F.xp), r: Tt('f_rank_' + (ri + 1)) }) : Tt('po_max')) + '</small></div></div>' +
      '<div class="po-btns"><button data-a="again" class="pt-go">' + Tt('pl_again') + '</button><button data-a="menu">' + Tt('pl_menu') + '</button></div></div></div>';
  }
  const esc = s => String(s).replace(/</g, '&lt;');
  function overAnim() {   // angka menghitung naik bersamaan dengan kartu muncul
    const els = [...overEl.querySelectorAll('[data-n]')], t0 = performance.now() + 650, mm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
    const fmt = (e, v) => { const f = e.dataset.f; e.textContent = f === 't' ? mm(v) : f ? v + f : v.toLocaleString('id-ID'); };
    const step = now => { const k = Math.min(1, Math.max(0, (now - t0) / 1300)), e = 1 - Math.pow(1 - k, 3); for (const el of els) fmt(el, Math.round(+el.dataset.n * e)); if (k < 1 && !overEl.classList.contains('off')) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    if (A()) A().local(Q.over === 'win' ? 'win' : 'lose', 1);
  }
  overEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'again') restart(); else goTitle(); });

  /* ---------- loop (batas FPS: hemat baterai & panas di HP) ---------- */
  let last = performance.now(), nextT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    // batas FPS berbasis jadwal: dulu "lewati bila belum 14,67 ms" membuang tiap frame kedua di layar yang lebih cepat dari itu (75 Hz → 37 FPS, 144 Hz → 48 FPS)
    if (SET.cap) { const iv = 1000 / SET.cap; if (now < nextT - 1) return; nextT = nextT + iv < now ? now + iv : nextT + iv; }
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (!U.active) return;
    U.frame(dt);
    if (TK.fpstouch) TK.fpstouch.tick(dt);
    if (Q.over && overEl.classList.contains('off')) { overEl.innerHTML = overHTML(); overEl.classList.remove('off'); overAnim(); }
  }

  /* ---------- aplikasi ke latar belakang (ganti aplikasi, layar mati) = jeda otomatis ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && U.active && P.alive && !P.menu && !Q.over && !U.state.pause) U.setPause(true);
  });

  /* ---------- ukuran layar ---------- */
  const resize = () => { if (U.active) U.resize(); };
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  /* ---------- offline (PWA): service worker menyimpan semua berkas game ---------- */
  let offReady = false, installEv = null;
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(r => {
      const done = () => { offReady = true; if (!titleEl.classList.contains('off')) renderTitle(); };
      if (r.active && navigator.serviceWorker.controller) done();
      navigator.serviceWorker.ready.then(done);
    }).catch(() => { });
    // versi baru selesai dipasang (VERSI di sw.js naik): muat ulang sekali — hanya saat masih di layar menu, tidak di tengah permainan
    const had = !!navigator.serviceWorker.controller; let pend = false;
    const fresh = () => { if (titleEl.classList.contains('off')) { pend = true; return; } location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) fresh(); });
    setInterval(() => { if (pend && !titleEl.classList.contains('off')) location.reload(); }, 1000);
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; if (!titleEl.classList.contains('off')) renderTitle(); });

  /* ---------- mulai ---------- */
  newMission(); apply(); renderTitle();
  requestAnimationFrame(frame);
  TK.play = { start, restart, goTitle, set: SET, apply, touchDev };
})();
