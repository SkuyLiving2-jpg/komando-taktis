/* ============================================================
   FPS-BETA (v3.0) — fitur kesiapan beta edisi offline:
   · pengaturan aksesibilitas & audio: musik / efek suara terpisah, guncangan layar,
     kurangi kilatan, ukuran HUD, mode buta warna (kawan biru · musuh jingga), FOV tersimpan
   · LAPORKAN MASALAH: versi, perangkat, GPU, FPS, error terakhir → disalin, tidak dikirim otomatis
   · gamepad (Gamepad API, tata letak standar Xbox/PlayStation)
   · simpan otomatis (cek poin) + LANJUTKAN PERTEMPURAN dari menu utama
   · buka-kunci per pangkat (kendaraan & bantuan radio)
   · LATIHAN DASAR (tutorial ±3 menit, PC & layar sentuh)
   · musik dinamis prosedural (tenang → kontak → pertempuran → bos)
   Dipanggil tiap frame oleh play.js (TK.fpsbeta.tick)
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, war = TK.war, Q = war.Q, U = TK.fpsui, W = TK.WAR;
  const { clamp } = TK.util, Tt = (k, v) => TK.t(k, v), A = () => TK.fpsaudio;
  const B = TK.fpsbeta = {};
  const coarse = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } }, del: k => { try { localStorage.removeItem(k); } catch (e) { /* ok */ } } };

  /* ---------------- teks ---------------- */
  Object.assign(TK.LANG.id, {
    b_mus: 'MUSIK', b_sfx: 'EFEK SUARA', b_hud: 'UKURAN HUD', b_shk: 'GUNCANGAN LAYAR', b_calm: 'KURANGI KILATAN', b_cb: 'MODE BUTA WARNA', b_cb_s: 'KAWAN BIRU · MUSUH JINGGA', b_acc: 'AKSESIBILITAS & AUDIO',
    b_off: 'MATI', b_half: 'SEDANG', b_full: 'PENUH', b_small: 'KECIL', b_norm: 'NORMAL', b_big: 'BESAR', b_less: 'DIKURANGI',
    b_rep: 'LAPORKAN MASALAH', b_rep_h: 'Salin teks di bawah lalu kirim ke pengembang (WhatsApp / email) beserta cerita singkat apa yang terjadi. Tidak ada data yang dikirim otomatis.', b_copy: 'SALIN', b_copied: 'TERSALIN ✓', b_close: 'TUTUP',
    b_pad: 'GAMEPAD TERHUBUNG — {n}', b_pad_s: 'GAMEPAD', b_pad_none: 'tidak terhubung', b_pad_map: 'RT tembak · LT bidik · A lompat · B jongkok · X isi ulang · Y ganti senjata · LB granat · RB kemampuan · L3 lari · R3 pisau · ▲ naik/pakai · ▼ radio · ◀ pasukan · ▶ mode · START jeda · BACK peta',
    b_cont: 'LANJUTKAN PERTEMPURAN', b_cont_s: 'Tersimpan {t} · pos {p}/5 · {d}', b_tut: 'LATIHAN DASAR', b_tut_s: '±3 menit: gerak, tembak, kendaraan, radio, lawan tank', b_resumed: 'PERTEMPURAN DILANJUTKAN — POS & KREDIT DIPULIHKAN',
    b_unlock: 'PANGKAT BARU: {r} — TERBUKA: {u}', b_lockt: 'TERKUNCI · {r}',
    t_hd: 'LATIHAN DASAR · {i}/{n}', t_skip: 'LEWATI LATIHAN',
    t_move: 'Bergerak: tekan W A S D (SHIFT = lari)', tx_t_move: 'Bergerak: geser JOYSTICK kiri',
    t_look: 'Lihat sekeliling: gerakkan MOUSE ke kiri & kanan', tx_t_look: 'Lihat sekeliling: geser sisi KANAN layar ke kiri & kanan',
    t_shoot: 'Tembak 3 sasaran di depanmu — KLIK KIRI menembak, tahan KLIK KANAN untuk membidik', tx_t_shoot: 'Tembak 3 sasaran di depanmu — tombol TEMBAK, tombol BIDIK untuk membidik',
    t_rel: 'Isi ulang senjata: tekan R', tx_t_rel: 'Isi ulang senjata: tombol ISI ULANG',
    t_swap: 'Ganti senjata: tekan Q (atau putar roda mouse)', tx_t_swap: 'Ganti senjata: tombol GANTI',
    t_radio: 'Panggil bantuan: tekan B lalu 3 (PASOKAN AMUNISI + MEDKIT)', tx_t_radio: 'Panggil bantuan: tombol RADIO → PASOKAN AMUNISI',
    t_veh: 'Naik kendaraan: dekati HUMVEE di dekatmu lalu tekan E', tx_t_veh: 'Naik kendaraan: dekati HUMVEE di dekatmu lalu tombol NAIK',
    t_drive: 'Kemudikan Humvee sejauh 40 m: W maju, A/D belok', tx_t_drive: 'Kemudikan Humvee sejauh 40 m dengan JOYSTICK',
    t_out: 'Turun dari kendaraan: tekan E', tx_t_out: 'Turun dari kendaraan: tombol KELUAR',
    t_boss: 'TANK MUSUH MENDEKAT! Hancurkan dengan granat (G) atau SMB Humvee', tx_t_boss: 'TANK MUSUH MENDEKAT! Hancurkan dengan granat atau SMB Humvee',
    t_done: 'LATIHAN SELESAI — kamu siap bertempur! Pertempuran sungguhan dimulai: rebut pos A–E dan hancurkan markas musuh.'
  });
  Object.assign(TK.LANG.en, {
    b_mus: 'MUSIC', b_sfx: 'SOUND EFFECTS', b_hud: 'HUD SIZE', b_shk: 'SCREEN SHAKE', b_calm: 'REDUCE FLASHES', b_cb: 'COLORBLIND MODE', b_cb_s: 'ALLIES BLUE · ENEMIES ORANGE', b_acc: 'ACCESSIBILITY & AUDIO',
    b_off: 'OFF', b_half: 'MEDIUM', b_full: 'FULL', b_small: 'SMALL', b_norm: 'NORMAL', b_big: 'LARGE', b_less: 'REDUCED',
    b_rep: 'REPORT A PROBLEM', b_rep_h: 'Copy the text below and send it to the developer (WhatsApp / email) with a short description of what happened. Nothing is sent automatically.', b_copy: 'COPY', b_copied: 'COPIED ✓', b_close: 'CLOSE',
    b_pad: 'GAMEPAD CONNECTED — {n}', b_pad_s: 'GAMEPAD', b_pad_none: 'not connected', b_pad_map: 'RT fire · LT aim · A jump · B crouch · X reload · Y switch weapon · LB grenade · RB ability · L3 sprint · R3 knife · ▲ board/use · ▼ radio · ◀ army · ▶ mode · START pause · BACK map',
    b_cont: 'CONTINUE BATTLE', b_cont_s: 'Saved {t} · posts {p}/5 · {d}', b_tut: 'BASIC TRAINING', b_tut_s: '±3 min: move, shoot, vehicle, radio, fight a tank', b_resumed: 'BATTLE RESUMED — POSTS & CREDITS RESTORED',
    b_unlock: 'NEW RANK: {r} — UNLOCKED: {u}', b_lockt: 'LOCKED · {r}',
    t_hd: 'BASIC TRAINING · {i}/{n}', t_skip: 'SKIP TRAINING',
    t_move: 'Move: press W A S D (SHIFT = sprint)', tx_t_move: 'Move: push the left JOYSTICK',
    t_look: 'Look around: move the MOUSE left & right', tx_t_look: 'Look around: drag the RIGHT side of the screen left & right',
    t_shoot: 'Shoot the 3 targets ahead — LEFT CLICK fires, hold RIGHT CLICK to aim', tx_t_shoot: 'Shoot the 3 targets ahead — FIRE button, AIM button to aim down sights',
    t_rel: 'Reload: press R', tx_t_rel: 'Reload: RELOAD button',
    t_swap: 'Switch weapon: press Q (or scroll the mouse wheel)', tx_t_swap: 'Switch weapon: SWAP button',
    t_radio: 'Call support: press B then 3 (AMMO + MEDKIT DROP)', tx_t_radio: 'Call support: RADIO button → AMMO DROP',
    t_veh: 'Board a vehicle: walk to the HUMVEE next to you and press E', tx_t_veh: 'Board a vehicle: walk to the HUMVEE next to you and tap BOARD',
    t_drive: 'Drive the Humvee 40 m: W forward, A/D steer', tx_t_drive: 'Drive the Humvee 40 m with the JOYSTICK',
    t_out: 'Get out of the vehicle: press E', tx_t_out: 'Get out of the vehicle: EXIT button',
    t_boss: 'ENEMY TANK INBOUND! Destroy it with grenades (G) or the Humvee MG', tx_t_boss: 'ENEMY TANK INBOUND! Destroy it with grenades or the Humvee MG',
    t_done: 'TRAINING COMPLETE — you are combat ready! The real battle begins: capture posts A–E and destroy the enemy HQ.'
  });
  for (const lg of ['id', 'en']) for (let i = 1; i < 9; i++) TK.LANG[lg]['f_lock_' + i] = (lg === 'id' ? 'TERKUNCI — NAIK KE PANGKAT ' : 'LOCKED — REACH RANK ') + TK.LANG[lg]['f_rank_' + i];

  /* ---------------- pengaturan aksesibilitas & audio (disimpan per perangkat) ---------------- */
  const SKEY = 'tk_fps_acc', S = { mus: coarse ? .35 : .45, sfx: 1, hud: 1, shk: 1, calm: 0, cb: 0, fov: 0 };
  try { Object.assign(S, JSON.parse(ls.get(SKEY) || '{}')); } catch (e) { /* ok */ }
  function applyS() { F.opts.mus = S.mus; F.opts.sfx = S.sfx; F.opts.hudK = S.hud; F.shakeK = S.shk; F.opts.calm = !!S.calm; F.opts.cb = !!S.cb; if (S.fov) P.fov = S.fov; }
  B.get = k => S[k];
  B.set = (k, v) => { S[k] = v; ls.set(SKEY, JSON.stringify(S)); applyS(); if (k === 'hud' && U.active && U.resize) U.resize(); };
  applyS();

  /* mode buta warna: hijau (kawan, HUD) → biru, merah (musuh) → jingga — warna kanvas HUD dipetakan saat diset */
  const CBM = new Map();
  const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; };
  const rgb = (h, s, l) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; };
  function cbc(s) {
    let r = CBM.get(s); if (r !== undefined) return r; r = s;
    let m, R, G, Bl, a = 1;
    if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) { let h = m[1]; if (h.length <= 4) h = h.split('').map(c => c + c).join(''); R = parseInt(h.slice(0, 2), 16); G = parseInt(h.slice(2, 4), 16); Bl = parseInt(h.slice(4, 6), 16); if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255; }
    else if ((m = /^rgba?\(([^)]+)\)$/i.exec(s))) { const q = m[1].split(',').map(parseFloat); R = q[0]; G = q[1]; Bl = q[2]; if (q.length > 3) a = q[3]; }
    if (R !== undefined && isFinite(R + G + Bl)) {
      const [h, sa, l] = hsl(R, G, Bl); let nh = null;
      if (sa > .25 && h >= 70 && h <= 175) nh = 205; else if (sa > .35 && (h <= 14 || h >= 340)) nh = 26;
      if (nh !== null) { const c = rgb(nh, sa, l); r = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    }
    if (CBM.size > 3000) CBM.clear(); CBM.set(s, r); return r;
  }
  (function () {
    const cv = document.getElementById('fps'); if (!cv || typeof CanvasRenderingContext2D === 'undefined') return;
    const c = cv.getContext('2d'), pr = CanvasRenderingContext2D.prototype;
    for (const k of ['fillStyle', 'strokeStyle']) { const d = Object.getOwnPropertyDescriptor(pr, k); if (!d || !d.set) continue; Object.defineProperty(c, k, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, F.opts.cb && typeof v === 'string' ? cbc(v) : v); } }); }
  })();

  /* kurangi kilatan + batas partikel adaptif (HP lambat: kolam partikel diperkecil sementara) */
  let fxCap = 700, slowT = 0, fpsAvg = 60;
  const em0 = F.emit;
  F.emit = function (k, x, y, z, o) {
    if (F.fx3.length >= fxCap) return;
    if (F.opts.calm && k === 'flash' && o) o = Object.assign({}, o, { s0: (o.s0 || 1) * .5, s1: (o.s1 || 1) * .5, life: (o.life || 1) * .7 });
    return em0.call(this, k, x, y, z, o);
  };

  /* ---------------- LAPORKAN MASALAH ---------------- */
  const ERR = B.errs = [];
  const pushE = s => { ERR.push(new Date().toISOString().slice(11, 19) + ' ' + String(s).slice(0, 300)); if (ERR.length > 12) ERR.shift(); };
  window.addEventListener('error', e => pushE((e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno));
  window.addEventListener('unhandledrejection', e => { const r = e.reason; pushE('promise: ' + (r && (r.stack || r.message) || r)); });
  const ce = console.error; console.error = function () { try { pushE([].map.call(arguments, String).join(' ')); } catch (x) { /* ok */ } return ce.apply(console, arguments); };
  function gpu() { try { const gl = F.GLW && F.GLW.gl; if (!gl) return F.GLW && F.GLW.err ? 'tidak ada (' + F.GLW.err + ')' : '?'; const x = gl.getExtension('WEBGL_debug_renderer_info'); return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return '?'; } }
  B.reportText = function () {
    const t = Math.floor(Q.t || 0), own = Q.objs ? Q.objs.filter(o => o.owner === 'B').length : 0, pad = navigator.getGamepads ? [].filter.call(navigator.getGamepads(), g => g).map(g => g.id).join(' | ') : '';
    return ['KOMANDO TAKTIS — LAPORAN MASALAH', 'Versi: ' + Tt('pl_ver') + ' (' + (TK.LANG.id.pl_ver || '') + ')', 'Waktu: ' + new Date().toString(),
      'Perangkat: ' + navigator.userAgent, 'Layar: ' + screen.width + '×' + screen.height + ' · jendela ' + innerWidth + '×' + innerHeight + ' @' + (window.devicePixelRatio || 1) + ' · sentuh: ' + (U.touch ? 'ya' : 'tidak') + ' · gamepad: ' + (pad || '-'),
      'GPU: ' + gpu() + (F.swGL ? ' · RENDER CPU (akselerasi mati)' : ''), 'Grafis: kualitas ' + F.opts.quality + ' · batas FPS ' + (F.opts.cap || 'maks') + ' · FPS sekarang ' + ((U.state && U.state.fps) || '?') + ' · rata-rata ' + Math.round(fpsAvg),
      'Misi: tingkat ' + (Q.diff || 0) + ' · waktu ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + ' · pos ' + own + '/' + (Q.objs ? Q.objs.length : 0) + ' · kredit ' + Math.floor(Q.cr || 0) + ' · unit ' + (Q.units ? Q.units.length : 0) + ' · partikel ' + (F.fx3 ? F.fx3.length : 0),
      'Operator: ' + (P.alive ? 'hidup' : 'gugur') + (P.veh ? ' · di ' + P.veh.id : '') + (P.mnt ? ' · di Shadow Hunter' : '') + ' · pangkat ' + F.rank() + ' (XP ' + Math.floor(F.xp || 0) + ')',
      'Pengaturan: ' + JSON.stringify(S),
      'Error terakhir (' + ERR.length + '):', ...(ERR.length ? ERR : ['- tidak ada -'])].join('\n');
  };
  B.report = function () {
    const old = document.getElementById('tkrep'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'tkrep';
    el.style.cssText = 'position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:BC,Bahnschrift,"Arial Narrow",Arial,sans-serif';
    const txt = B.reportText();
    el.innerHTML = '<div style="background:#07130c;border:1px solid rgba(157,255,181,.55);border-radius:8px;max-width:640px;width:100%;padding:14px;color:#dfffe6;box-shadow:0 10px 40px rgba(0,0,0,.6)">' +
      '<b style="color:#ffd24a;font-size:16px;letter-spacing:.06em">' + Tt('b_rep') + '</b><p style="margin:6px 0 8px;font-size:12px;opacity:.85">' + Tt('b_rep_h') + '</p>' +
      '<textarea readonly style="width:100%;height:min(46vh,300px);box-sizing:border-box;background:#020805;color:#bfe9c9;border:1px solid rgba(157,255,181,.3);font:11px/1.35 Consolas,monospace;padding:8px;resize:none"></textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button data-r="copy" style="background:#ffd24a;color:#111;border:0;padding:9px 16px;font:700 13px inherit;cursor:pointer;border-radius:4px">' + Tt('b_copy') + '</button>' +
      '<button data-r="x" style="background:transparent;color:#dfffe6;border:1px solid rgba(157,255,181,.5);padding:9px 16px;font:700 13px inherit;cursor:pointer;border-radius:4px">' + Tt('b_close') + '</button></div></div>';
    el.querySelector('textarea').value = txt;
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === el) el.remove(); return; }
      if (b.dataset.r === 'x') { el.remove(); return; }
      const ta = el.querySelector('textarea'), ok = () => { b.textContent = Tt('b_copied'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => { ta.select(); try { document.execCommand('copy'); ok(); } catch (x) { /* ok */ } });
      else { ta.select(); try { document.execCommand('copy'); ok(); } catch (x) { /* ok */ } }
    });
    document.body.appendChild(el);
  };

  /* ---------------- GAMEPAD ---------------- */
  const GP = { id: null, keys: {}, prev: [], sprint: false, trig: [false, false] };
  const KEYMAP = { 0: 'Space', 1: 'KeyC', 2: 'KeyR', 3: 'KeyQ', 4: 'KeyG', 5: 'KeyF', 8: 'KeyM', 11: 'KeyV', 12: 'KeyE', 13: 'KeyB', 14: 'KeyT', 15: 'KeyX' };
  const kev = (type, code) => { const key = code === 'Space' ? ' ' : code === 'Escape' ? 'Escape' : code.indexOf('Key') === 0 ? code.slice(3).toLowerCase() : code === 'ShiftLeft' ? 'Shift' : code; window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true })); };
  const hold = (code, on) => { if (!!GP.keys[code] === on) return; GP.keys[code] = on; kev(on ? 'keydown' : 'keyup', code); };
  B.padName = () => GP.id;
  function padTick(dt) {
    const gs = navigator.getGamepads ? navigator.getGamepads() : null; let g = null;
    if (gs) for (const q of gs) if (q && q.connected && q.axes && q.axes.length >= 4) { g = q; break; }
    if (!g) { if (GP.id) { for (const k in GP.keys) hold(k, false); GP.id = null; if (GP.trig[0]) F.in.fire = false; if (GP.trig[1]) F.in.ads = false; GP.trig = [false, false]; } return; }
    if (GP.id !== g.id) { GP.id = g.id; if (U.active) F.msg(Tt('b_pad', { n: g.id.replace(/\(.*?\)/g, '').trim().slice(0, 30) }), 'g'); }
    if (!U.active) return;
    const btn = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > .5)), dz = v => Math.abs(v) < .18 ? 0 : (v - Math.sign(v) * .18) / .82;
    const lx = dz(g.axes[0] || 0), ly = dz(g.axes[1] || 0), rx = dz(g.axes[2] || 0), ry = dz(g.axes[3] || 0);
    hold('KeyW', ly < -.35); hold('KeyS', ly > .35); hold('KeyA', lx < -.35); hold('KeyD', lx > .35);
    if (btn(10) && !GP.prev[10]) GP.sprint = !GP.sprint; if (Math.hypot(lx, ly) < .2) GP.sprint = false; hold('ShiftLeft', GP.sprint);
    if (rx || ry) { const k = 15 * dt * 60; F.look(Math.sign(rx) * Math.pow(Math.abs(rx), 1.7) * k, Math.sign(ry) * Math.pow(Math.abs(ry), 1.7) * k * .8); }
    const rt = btn(7), lt = btn(6);   // pelatuk hanya mengubah tembak/bidik saat berubah (mouse tetap bisa dipakai)
    if (rt !== GP.trig[0]) { GP.trig[0] = rt; F.in.fire = rt; } if (lt !== GP.trig[1]) { GP.trig[1] = lt; F.in.ads = lt; }
    if (btn(9) && !GP.prev[9] && U.setPause && !P.menu) U.setPause(!(U.state && U.state.pause));   // START = jeda / lanjut
    for (const i in KEYMAP) { const on = btn(+i); if (on && !GP.prev[i]) kev('keydown', KEYMAP[i]); else if (!on && GP.prev[i]) kev('keyup', KEYMAP[i]); }
    for (let i = 0; i < g.buttons.length; i++) GP.prev[i] = btn(i);
  }

  /* ---------------- SIMPAN OTOMATIS & LANJUTKAN ---------------- */
  const VKEY = 'tk_save';
  B.loadSave = () => { try { const s = JSON.parse(ls.get(VKEY) || 'null'); return s && s.v === 1 && s.seed ? s : null; } catch (e) { return null; } };
  B.clearSave = () => ls.del(VKEY);
  function doSave() {
    if (!U.active || !Q.g || Q.over || B.tut || !Q.hqB || !Q.objs) return;
    const s = { v: 1, ts: Date.now(), seed: Q.g.seed, diff: Q.diff || 0, t: Q.t, cr: Q.cr, objs: Q.objs.map(o => [o.owner, o.prog]), hq: [Q.hqB.hp, Q.hqR.hp], stats: Q.stats,
      p: { score: P.score, kills: P.kills, deaths: P.deaths, hs: P.hs, best: P.best }, posts: Q.objs.filter(o => o.owner === 'B').length };
    ls.set(VKEY, JSON.stringify(s));
  }
  B.saveNow = doSave;
  B.resume = function (s) {   // peta yang sama (benih sama), lalu kepemilikan pos, kredit, waktu, nyawa markas & statistik dipulihkan
    war.reset(s.diff, s.seed);
    Object.assign(Q, { t: s.t || 0, cr: s.cr || 0 }); if (s.stats) Q.stats = Object.assign(Q.stats || {}, s.stats);
    Q.objs.forEach((o, i) => {
      const q = s.objs && s.objs[i]; if (!q) return; o.owner = q[0]; o.prog = q[1];
      if (o.owner === 'B') for (const u of Q.units) if (u.team === 'R' && !u.dead && !(W.UT[u.type] || {}).struct && Math.hypot(u.x - o.x, u.y - o.y) < o.r + 80) u.dead = true;   // garnisun musuh di pos yang sudah kita rebut dibersihkan
    });
    if (s.hq) { Q.hqB.hp = Math.min(Q.hqB.hpMax, s.hq[0]); Q.hqR.hp = Math.min(Q.hqR.hpMax, s.hq[1]); }
    B.pendP = s.p || {};
  };
  let saveT = 20;
  document.addEventListener('visibilitychange', () => { if (document.hidden) doSave(); });
  window.addEventListener('pagehide', doSave);

  /* ---------------- BUKA-KUNCI PER PANGKAT ---------------- */
  F.UNLOCK = { veh: { MBT: 1, VTOL: 2 }, ci: { MORTAR: 1, TANK: 1, FUEL: 1, MEDEVAC: 2, GUNSHIP: 3 } };   // WOLFPACK, Humvee, panser, regu, medis & amunisi terbuka sejak awal
  F.lockR = (kind, id) => { const r = (F.UNLOCK[kind] || {})[id] || 0; return r > F.rank() ? r : 0; };
  const vc0 = F.vehCall; F.vehCall = function (id, inst) { const r = F.lockR('veh', id); if (r && !inst) return { ok: false, msg: 'f_lock_' + r }; return vc0.apply(this, arguments); };
  const ci0 = F.callin; F.callin = function (id) { const r = F.lockR('ci', id); if (r) return { ok: false, msg: 'f_lock_' + r }; const o = ci0.apply(this, arguments); if (o && o.ok && B.tut) B.tut.ci = true; return o; };
  let rank0 = -1;
  function rankTick() {
    const r = F.rank(); if (rank0 < 0) { rank0 = r; return; } if (r <= rank0) return; rank0 = r;
    const got = []; for (const k of ['veh', 'ci']) for (const id in F.UNLOCK[k]) if (F.UNLOCK[k][id] === r) got.push(Tt(k === 'veh' ? 'f_vh_' + id : 'f_ci_' + id));
    if (got.length) F.msg(Tt('b_unlock', { r: Tt('f_rank_' + r), u: got.join(', ') }), 'g');
  }

  /* ---------------- LATIHAN DASAR (tutorial) ---------------- */
  const TUT = ['move', 'look', 'shoot', 'rel', 'swap', 'radio', 'veh', 'drive', 'out', 'boss', 'done'];
  let tutEl = null;
  B.tutStart = () => { B.tut = { i: -1, t: 0, d: {}, saved: null }; };
  B.tutStop = function (done) {
    const T = B.tut; if (!T) return; B.tut = null; if (tutEl) tutEl.classList.add('off');
    if (T.saved) Object.assign(Q, T.saved); if (Q.sat) Q.sat.t = 4;
    for (const u of T.dummies || []) if (!u.dead) u.dead = true;
    if (done) ls.set('tk_tut_done', '1');
  };
  function pin(u, x, y) { u.x = x; u.y = y; u.path = []; u.tgt = null; u.hdg = u.face = Math.atan2(P.y - y, P.x - x); }
  function tutSetup(T, s) {
    const d = T.d = {}, f = P.yaw;
    if (s === 'move') { d.x = P.x; d.y = P.y; }
    else if (s === 'look') { d.prev = P.yaw; d.acc = 0; }
    else if (s === 'shoot') {
      d.tg = []; T.dummies = T.dummies || [];
      for (let k = 0; k < 3; k++) { const a = f + (k - 1) * .3, r = 24 + k * 5; let x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r; if (F.solid(x, y)) { x = P.x + Math.cos(a) * 14; y = P.y + Math.sin(a) * 14; }
        const u = war.mk('R', 'INF', x, y, {}); u.hp = u.hpMax = 25; u.tut = [x, y]; u.only = true; d.tg.push(u); T.dummies.push(u); }
    } else if (s === 'rel') { d.ok = false; }
    else if (s === 'swap') { d.c0 = P.cur; }
    else if (s === 'radio') { T.ci = false; Q.cr = Math.max(Q.cr, 1500); }
    else if (s === 'veh') { Q.cr = Math.max(Q.cr, 3000); const r = F.vehCall('HMV', true); d.ok = !!(r && r.ok); }
    else if (s === 'drive') { d.x = P.x; d.y = P.y; }
    else if (s === 'boss') {
      let x = P.x + Math.cos(f) * 120, y = P.y + Math.sin(f) * 120; for (let k = 0; k < 12 && (F.solid(x, y) || F.water(x, y)); k++) { x = P.x + Math.cos(f + k * .5) * 110; y = P.y + Math.sin(f + k * .5) * 110; }
      const u = war.mk('R', 'TANK', x, y, {}); u.hp = u.hpMax = 650; u.only = true; d.u = u; T.dummies.push(u);
    }
  }
  function tutTick(dt) {
    const T = B.tut; if (!T) return;
    if (!U.active || Q.over) { B.tutStop(false); return; }
    if (!P.alive || P.menu || !P.unit) { if (tutEl) tutEl.classList.add('off'); return; }
    if (!T.saved) T.saved = { aiT: Q.aiT, waveT: Q.waveT, raidT: Q.raidT, bossT: Q.bossT, sortT: Q.sortT };
    Object.assign(Q, { aiT: 1e9, waveT: 1e9, raidT: 1e9, bossT: 1e9, sortT: 1e9 }); if (Q.sat) Q.sat.t = 1e9;   // latihan: tidak ada serbuan / gelombang musuh
    if (P.unit.hp < P.unit.hpMax) P.unit.hp = P.unit.hpMax;   // operator tidak bisa gugur selama latihan
    if (T.i < 0) { T.i = 0; tutSetup(T, TUT[0]); }
    T.t += dt; const s = TUT[T.i], d = T.d; let ok = false;
    if (s === 'move') ok = Math.hypot(P.x - d.x, P.y - d.y) > 8;
    else if (s === 'look') { d.acc += Math.abs(Math.atan2(Math.sin(P.yaw - d.prev), Math.cos(P.yaw - d.prev))); d.prev = P.yaw; ok = d.acc > 2.2; }
    else if (s === 'shoot') { for (const u of d.tg) if (!u.dead) pin(u, u.tut[0], u.tut[1]); ok = d.tg.every(u => u.dead); }
    else if (s === 'rel') { if (P.relT > 0) d.ok = true; ok = d.ok && T.t > .3; }
    else if (s === 'swap') ok = P.cur !== d.c0;
    else if (s === 'radio') ok = !!T.ci;
    else if (s === 'veh') { if (!d.ok && T.t > .5) { const r = F.vehCall('HMV', true); d.ok = !!(r && r.ok); } ok = !!P.veh; }
    else if (s === 'drive') ok = !!P.veh && Math.hypot(P.x - d.x, P.y - d.y) > 40 || (!P.veh && T.t > 30);
    else if (s === 'out') ok = !P.veh;
    else if (s === 'boss') ok = !d.u || d.u.dead;
    else if (s === 'done') { if (T.t > 10) { B.tutStop(true); return; } }
    if (ok && s !== 'done') { T.i++; T.t = 0; tutSetup(T, TUT[T.i]); A() && A().local(TUT[T.i] === 'done' ? 'win' : 'obj', .7); }
    tutDraw(T);
  }
  function tutDraw(T) {
    if (!tutEl) {
      tutEl = document.createElement('div'); tutEl.id = 'ftut';
      tutEl.style.cssText = 'position:absolute;left:50%;top:15%;transform:translateX(-50%);z-index:6;max-width:min(78vw,620px);background:rgba(0,14,6,.8);border:1px solid rgba(157,255,181,.55);border-left:4px solid #ffd24a;border-radius:6px;padding:8px 14px 9px;color:#dfffe6;text-align:center;font-family:BC,Bahnschrift,"Arial Narrow",Arial,sans-serif;pointer-events:auto;box-shadow:0 6px 24px rgba(0,0,0,.45)';
      tutEl.innerHTML = '<div class="h" style="color:#ffd24a;font-size:11px;letter-spacing:.12em;font-weight:700"></div><div class="b" style="font-size:15px;font-weight:600;margin-top:3px;line-height:1.25"></div><div class="p" style="height:3px;background:rgba(255,255,255,.12);margin-top:7px"><i style="display:block;height:100%;background:#9dffb5;width:0"></i></div><button style="margin-top:6px;background:transparent;color:rgba(223,255,230,.7);border:1px solid rgba(157,255,181,.35);font:600 10px inherit;padding:3px 9px;cursor:pointer;border-radius:3px"></button>';
      tutEl.querySelector('button').addEventListener('click', () => B.tutStop(true));
      (document.getElementById('stage') || document.body).appendChild(tutEl);
    }
    tutEl.classList.remove('off'); tutEl.style.display = U.state && U.state.pause ? 'none' : '';
    const n = TUT.length - 1, i = Math.min(T.i + 1, n), k = TUT[T.i];
    tutEl.querySelector('.h').textContent = Tt('t_hd', { i, n }); tutEl.querySelector('.b').textContent = Tt('t_' + k);
    tutEl.querySelector('.p i').style.width = Math.round(T.i / n * 100) + '%'; tutEl.querySelector('button').textContent = Tt('t_skip');
    tutEl.style.borderLeftColor = k === 'done' ? '#9dffb5' : '#ffd24a';
  }

  /* ---------------- MUSIK DINAMIS (prosedural) ----------------
     4 lapis mengikuti intensitas pertempuran: 0 pad akord (selalu) · 1 arpeggio + bas (kontak) · 2 perkusi (pertempuran) · 3 kuningan & taiko (bos / kritis).
     Akord Dm · B♭ · F · C, tempo 88 → 132 bpm. Masuk ke master (ikut volume utama), tidak lewat bus efek suara */
  const MU = { on: false, I: 0, nextT: 0, step: 0 };
  const CH = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]], mf = n => 440 * Math.pow(2, (n - 69) / 12);
  function muInit() {
    const io = A() && A()._io && A()._io(); if (!io) return false;
    const c = io.ctx; MU.c = c; MU.out = c.createGain(); MU.out.gain.value = 0; MU.out.connect(io.master);
    MU.lay = [0, 1, 2, 3].map(() => { const g = c.createGain(); g.gain.value = 0; g.connect(MU.out); return g; });
    MU.lp = c.createBiquadFilter(); MU.lp.type = 'lowpass'; MU.lp.frequency.value = 700; MU.lp.Q.value = .6; MU.lp.connect(MU.lay[0]);
    MU.pad = []; for (let i = 0; i < 3; i++) for (const dt of [-7, 7]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.detune.value = dt; o.frequency.value = mf(CH[0][i] - 12); g.gain.value = .05; o.connect(g); g.connect(MU.lp); o.start(); MU.pad.push({ o, i }); }
    const nb = c.createBuffer(1, Math.floor(c.sampleRate * .4), c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; MU.nb = nb;
    MU.nextT = c.currentTime + .15; MU.on = true; return true;
  }
  function tone(dst, type, f, t, dur, vol, f2) {
    const c = MU.c, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0008, t + dur); o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dst, t, dur, vol, hp, lp) {
    const c = MU.c, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = MU.nb; f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur); s.connect(f); f.connect(g); g.connect(dst); s.start(t, Math.random() * .2); s.stop(t + dur + .02);
  }
  function sched(st, t, I, s16) {
    const bar = Math.floor(st / 16), ch = CH[Math.floor(bar / 2) % 4], s = st % 16, L = MU.lay;
    if (s === 0 && bar % 2 === 0) for (const p of MU.pad) p.o.frequency.setTargetAtTime(mf(ch[p.i] - 12), t, .3);
    if (I > .25) {
      if (s % 2 === 0) tone(L[1], 'triangle', mf(ch[((s >> 1) + bar) % 4] + 12), t, s16 * 1.7, .1);   // arpeggio
      if (s === 0 || s === 8 || (I > .6 && s === 11)) tone(L[1], 'sawtooth', mf(ch[0] - 24), t, s16 * 3.2, .09);   // bas
    }
    if (I > .5) {
      if (s % 8 === 0 || (I > .75 && s === 10)) tone(L[2], 'sine', 120, t, .22, .5, 42);   // dentum
      if (s % 8 === 4) noise(L[2], t, .16, .32, 1400);   // jerat
      if (!coarse && s % 2 === 0) noise(L[2], t, .04, s % 4 === 2 ? .12 : .06, 7000);   // hi-hat
      if (I > .7 && (s === 14 || s === 15)) noise(L[2], t, .1, .2, 1600);
    }
    if (I > .82) {
      if (s === 0 || s === 6 || s === 10) { tone(L[3], 'sawtooth', mf(ch[0] - 12), t, s16 * 3, .12); tone(L[3], 'sawtooth', mf(ch[2] - 12), t, s16 * 3, .08); }
      if (s % 4 === 0) tone(L[3], 'sine', 90, t, .3, .45, 55);   // taiko
    }
  }
  let muScanT = 0, muNear = 0, muBoss = false;
  function muTick(dt) {
    const want = F.opts.mus > 0 && U.active && F.opts.sound !== false;
    if (!MU.on) { if (!want) return; if (!muInit()) return; }
    const c = MU.c; if (c.state !== 'running') return;
    if ((muScanT -= dt) <= 0) {   // musuh dekat & bos (dievaluasi 2×/dtk)
      muScanT = .5; let n = 0, bs = false;
      for (const u of Q.units) { if (u.dead || u.team === 'B') continue; const d = Math.hypot(u.x - P.x, u.y - P.y); if (d < 280 && !(W.UT[u.type] || {}).struct) n++; if (d < 900 && (W.UT[u.type] || {}).boss) bs = true; }
      muNear = n; muBoss = bs;
    }
    let T = .12 + Math.min(.42, muNear * .06);
    if (F.in.fire && P.alive) T += .18; if (P.time - (P.lastHurt || -99) < 4) T += .25; if (muBoss) T = 1;
    if (!P.alive || P.menu || B.tut) T = Math.min(T, B.tut ? .3 : .1);
    MU.I += (T - MU.I) * Math.min(1, dt * (T > MU.I ? .9 : .12));
    const I = MU.I, now = c.currentTime, pause = U.state && U.state.pause, vol = want ? F.opts.mus * (Q.over ? 0 : pause ? .45 : 1) : 0;
    MU.out.gain.setTargetAtTime(vol * .6, now, .6);
    const L = [1 - clamp((I - .85) / .15, 0, .4), clamp((I - .22) / .2, 0, 1), clamp((I - .48) / .2, 0, 1), clamp((I - .8) / .12, 0, 1)];
    MU.lay.forEach((g, i) => g.gain.setTargetAtTime(L[i] * [.9, .55, .75, .7][i], now, .9));
    MU.lp.frequency.setTargetAtTime(450 + I * 1500, now, 1.2);
    if (!want || vol <= 0) { MU.nextT = Math.max(MU.nextT, now + .1); return; }
    const s16 = 60 / (88 + I * 44) / 4;
    if (MU.nextT < now - .5) MU.nextT = now + .05;   // tab sempat tertidur: jangan menumpuk not
    while (MU.nextT < now + .2) { sched(MU.step, MU.nextT, I, s16); MU.nextT += s16; MU.step++; }
  }

  /* ---------------- tiap frame (play.js) ---------------- */
  let shownP = false;
  B.tick = function (dt) {
    padTick(dt);
    if (!U.active) return;
    if (P.fov !== S.fov && P.fov) { S.fov = P.fov; B._fovT = 1; } if (B._fovT > 0 && (B._fovT -= dt) <= 0) ls.set(SKEY, JSON.stringify(S));
    fpsAvg += (((U.state && U.state.fps) || 60) - fpsAvg) * Math.min(1, dt * .2);
    if (F.opts.mobile) { slowT = fpsAvg < 28 ? Math.min(6, slowT + dt) : Math.max(0, slowT - dt); fxCap = slowT > 3 ? 450 : 700; }
    if (B.pendP && P.alive && !P.menu && P.unit) { Object.assign(P, B.pendP); B.pendP = null; F.msg(Tt('b_resumed'), 'g'); }
    if (P.alive && !P.menu && !Q.over && (saveT -= dt) <= 0) { saveT = 20; doSave(); }
    if (Q.over && B.loadSave()) B.clearSave();
    rankTick(); tutTick(dt); muTick(dt);
  };
  if (typeof window !== 'undefined') window.addEventListener('gamepadconnected', () => { GP.id = null; });
})();
