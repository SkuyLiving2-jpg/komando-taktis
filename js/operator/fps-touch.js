/* ============================================================
   FPS-TOUCH — kontrol layar sentuh mode OPERATOR (HP & tablet)
   joystick dinamis kiri (dorong jauh ke depan = lari), geser kanan
   = bidik, tombol kanan berganti sesuai situasi (jalan kaki,
   kendaraan, Shadow Hunter, kamera killstreak), panel RADIO untuk
   bantuan/komando/pasukan, bantuan bidik ringan ala game seluler.
   Tombol diteruskan sebagai KeyboardEvent sintetis ke handler
   fps-ui, jadi logika tiap mode tetap satu sumber.
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P, Q = TK.war.Q, U = TK.fpsui, VM = TK.fpsvm, I = F.in, R = F.R;
  const Tt = (k, v) => TK.t(k, v), A = () => TK.fpsaudio, { clamp, wrapPi } = TK.util;
  const stage = document.querySelector('#stage'), M = U.state;

  /* ---------- pengaturan (disimpan per perangkat) ---------- */
  const CFG = { sens: 1, assist: true, alpha: .75, size: 1, pos: {} };   // pos[jenis][id] = [x, y, d] hasil editor tata letak
  try { Object.assign(CFG, JSON.parse(localStorage.getItem('tk_touch') || '{}')); } catch (e) { /* ok */ }
  if (!CFG.pos || typeof CFG.pos !== 'object') CFG.pos = {};
  const save = () => { try { localStorage.setItem('tk_touch', JSON.stringify(CFG)); } catch (e) { /* ok */ } };
  const t0 = TK.t;   // teks yang menyebut tombol keyboard ([E], KLIK KIRI, MOUSE…) punya versi layar sentuh tx_<kunci> di fps-lang
  TK.t = (k, v) => U.touch && typeof k === 'string' && (TK.LANG[TK.doc().lang] || {})['tx_' + k] !== undefined ? t0('tx_' + k, v) : t0(k, v);

  /* ---------- elemen ---------- */
  const root = document.createElement('div'); root.id = 'ftouch'; root.className = 'off';
  root.innerHTML = '<div class="tj"><i></i></div><div class="tsp"></div><div class="tbs"></div>' +
    '<div class="ttopbar"><button class="tbtn ttop tstk" data-a="stk">★<i></i></button><button class="tbtn ttop tpause" data-a="pause">❚❚</button><button class="tbtn ttop tradio" data-a="radio"></button></div><button class="tbtn ttop tsup" data-a="sup"></button><div class="tradiop off"></div><div class="tstkp tsk2 off"></div><div class="tstkp thwp off"></div>';
  stage.appendChild(root);
  const joyEl = root.querySelector('.tj'), knob = joyEl.querySelector('i'), sprEl = root.querySelector('.tsp'), btnBox = root.querySelector('.tbs'), radio = root.querySelector('.tradiop'), topBar = root.querySelector('.ttopbar');
  const supBtn = root.querySelector('.tsup'), stkBtn = root.querySelector('.tstk'), stkN = stkBtn.querySelector('i'), stkP = root.querySelector('.tstkp'), hwP = root.querySelector('.thwp');
  const probe = document.createElement('div');   // membaca env(safe-area-inset-*) lewat padding elemen tak terlihat
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const SA = { l: 0, r: 0, t: 0, b: 0 };
  function readSafe() {
    const c = getComputedStyle(probe); SA.l = parseFloat(c.paddingLeft) || 0; SA.r = parseFloat(c.paddingRight) || 0; SA.t = parseFloat(c.paddingTop) || 0; SA.b = parseFloat(c.paddingBottom) || 0;
    U.safe = SA;
  }
  /* ikon tombol (garis, 40×40, warna = warna teks tombol): HUD dibaca sekilas tanpa membaca tulisan; teks tetap jadi aria-label */
  const ICN = {
    ads: '<circle cx="20" cy="20" r="13"/><path d="M20 10v6M20 24v6M10 20h6M24 20h6"/><circle cx="20" cy="20" r="1.6" fill="currentColor"/>',
    rel: '<path d="M30.5 15A11.5 11.5 0 1 0 31.5 23"/><path d="M31.5 8v7.5H24"/><path d="M17.5 27V17l2.5-3.5 2.5 3.5v10z"/>',
    jump: '<path d="M20 29V10M12 18l8-8 8 8M10 34h20"/>',
    crouch: '<path d="M20 7v18M12 17l8 8 8-8M10 32h20"/>',
    gren: '<circle cx="19" cy="25" r="9"/><path d="M15 16.5v-4h8v4M23 13l6-4"/><circle cx="29.5" cy="13.5" r="3"/><path d="M14 25h10M19 20v10" stroke-width="1.6"/>',
    knife: '<path d="M14.5 25.5L31 9l1.5 1.5L23 27l-5 2z"/><path d="M12 23l7 7M8 34l7-7"/>',
    hook: '<path d="M20 6v17"/><path d="M12 19c0 8 4 12 8 12s8-4 8-12"/><path d="M12 19l-3 4M28 19l3 4"/><path d="M16 6h8"/><path d="M20 31v3" stroke-dasharray="1.5 2"/>',
    ab: '<path d="M22.5 5L11 22.5h8.5L17 35l12.5-18H21z"/>',
    swap: '<path d="M9 14h22M25 8l6 6-6 6M31 26H9M15 20l-6 6 6 6"/>',
    use: '<path d="M14 21V10a2.3 2.3 0 0 1 4.6 0v8M18.6 17.5v-2a2.3 2.3 0 0 1 4.6 0v3M23.2 18a2.3 2.3 0 0 1 4.6 0v1.5M27.8 19.5a2.3 2.3 0 0 1 4.6 0V26c0 5-4 9-9 9h-2.5c-3 0-5-1.2-6.8-3.8L8.6 25a2.2 2.2 0 0 1 3.4-2.8L14 24"/>',
    fl: '<circle cx="20" cy="20" r="3.5"/><path d="M20 5v8M20 27v8M5 20h8M27 20h8M9.5 9.5l5 5M25.5 25.5l5 5M30.5 9.5l-5 5M14.5 25.5l-5 5"/>',
    zoom: '<circle cx="17" cy="17" r="10"/><path d="M24.5 24.5l9 9M12.5 17h9M17 12.5v9"/>',
    exit: '<path d="M21 7H9v26h12"/><path d="M16 20h18M28 14l6 6-6 6"/>',
    up: '<path d="M11 21l9-9 9 9M11 31l9-9 9 9"/>',
    dn: '<path d="M11 9l9 9 9-9M11 19l9 9 9-9"/>',
    cam: '<path d="M7 14h6.5l3-4h7l3 4H33v17H7z"/><circle cx="20" cy="22" r="5.5"/>',
    smk: '<path d="M11 29a6 6 0 0 1 .5-12A8.5 8.5 0 0 1 28 15a7 7 0 0 1 1 14z"/><path d="M15 34h12" stroke-width="2"/>',
    mode: '<path d="M20 5v28M8 22l12-6 12 6M14 33l6-3 6 3"/>',
    brk: '<circle cx="20" cy="20" r="13"/><path d="M14 20h12" stroke-width="4"/>',
    therm: '<path d="M17.5 8a2.5 2.5 0 0 1 5 0v14.5a7 7 0 1 1-5 0z"/><circle cx="20" cy="28" r="2.6" fill="currentColor"/><path d="M27 10h4M27 15h4"/>',
    det: '<path d="M20 4l3.5 9 9-4-4 9 8 4-9 3 3 9-8.5-5L20 36l-2-7-8.5 5 3-9-9-3 8-4-4-9 9 4z"/>',
    pax: '<circle cx="15" cy="12" r="4.5"/><circle cx="27" cy="14" r="3.6"/><path d="M6 33c0-7 4-12 9-12s9 5 9 12M22 32c1-5 3-8 5-8 4 0 7 3 7 8"/>',
    beam: '<path d="M17 3h6l-1 22h-4z"/><path d="M10 33c3-4 17-4 20 0M6 37c5-3 23-3 28 0"/><circle cx="20" cy="30" r="2.5"/>',
    nova: '<circle cx="20" cy="20" r="6"/><path d="M20 4v6M20 30v6M4 20h6M30 20h6M8.7 8.7l4.3 4.3M27 27l4.3 4.3M31.3 8.7L27 13M13 27l-4.3 4.3"/>',
    ok: '<path d="M9 21l7.5 7.5L31 12"/>',
    cancel: '<path d="M11 11l18 18M29 11L11 29"/>',
    w_gun: '<path d="M9 30V16l2.5-5 2.5 5v14zM17.5 30V16l2.5-5 2.5 5v14zM26 30V16l2.5-5 2.5 5v14z"/><path d="M7 33h26"/>',
    w_hy: '<rect x="7" y="13" width="26" height="14" rx="3"/><circle cx="13" cy="20" r="2.3"/><circle cx="20" cy="20" r="2.3"/><circle cx="27" cy="20" r="2.3"/><path d="M33 20h3"/>',
    gear: '<circle cx="20" cy="27" r="7"/><circle cx="20" cy="27" r="2"/><path d="M20 20V7M13 9h14"/>',
    w_hf: '<path d="M6 20h22l6-3.5v7L28 20M10 20l-3-6M10 20l-3 6M22 20l-2-4M22 20l-2 4"/>',
    w_st: '<path d="M5 27L23 13M23 13l4-1-1 4M9 24l-1-5M9 24l5 1"/><circle cx="30" cy="10" r="5" stroke-width="1.8"/>',
    bomb: '<path d="M14 15a9 9 0 1 0 12 0z"/><path d="M15 15l-3-8M25 15l3-8M20 15V6"/>',
    radio: '<path d="M20 19v15M14 34h12"/><circle cx="20" cy="17" r="2.4" fill="currentColor"/><path d="M14.5 11.5a7.5 7.5 0 0 0 0 11M25.5 11.5a7.5 7.5 0 0 1 0 11M10 7a14 14 0 0 0 0 20M30 7a14 14 0 0 1 0 20"/>'
  };
  const icon = k => '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + ICN[k] + '</svg>';
  const FIRE_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20 3v9M20 28v9M3 20h9M28 20h9" stroke="currentColor" stroke-width="2.6"/><circle cx="20" cy="20" r="2.4" fill="currentColor"/></svg>';

  /* ---------- tombol: kirim KeyboardEvent ke handler fps-ui ---------- */
  const key = (code, up) => window.dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), bubbles: true }));
  const tap = code => { key(code); key(code, true); };
  function fireDown() { if (A()) A().init(); if (P.tgt) F.confirmTarget(); else { I.fire = true; I.press = .2; } }
  function fireUp() { I.fire = false; }
  function zoom() { if (P.gs) F.gsZoom(); else if (P.mnt) F.heliZoom(); else if (P.veh) F.vehKey('wheel'); }
  function adsToggle() {   // tap = bidik ADS hidup/mati (gaya game FPS seluler); saat menyalakan → bantuan bidik "menempel"
    if (P.tgt) { F.cancelTarget(); return; }
    I.ads = !I.ads; if (I.ads && CFG.assist && !P.veh && !P.mnt) snap();
  }

  /* tata letak bawaan — gugus rapat mengelilingi jempol kanan (gaya FPS seluler):
     [x, y, d] = pusat tombol dalam satuan u dari pojok KANAN-BAWAH area aman, d = diameter (u); [.., 1] = diukur dari pojok KIRI-BAWAH.
     Satu tabel per jenis situasi; editor tata letak menyimpan pengganti di CFG.pos[jenis][id]. */
  const RING = { fire: [1.35, 1.35, 1.55], a1: [2.85, .8, 1], a2: [2.75, 2.05, .85], a3: [.75, 2.85, .9], a4: [1.85, 3.05, .85], a5: [3.95, 1.5, .8], a6: [4.05, .5, .8], a7: [2.95, 3.15, .85], top1: [.75, 3.95, .75], top2: [1.75, 4.1, .7], ctx: [4.6, 2.75, .95] };
  const LUP = [.9, 3.35, .95, 1], LDN = [.9, 2.25, .95, 1];
  const POS = {
    foot: { fire: RING.fire, ads: RING.a1, rel: RING.a2, jump: RING.a3, crouch: RING.a4, gren: RING.a5, knife: RING.a6, ab: RING.a7, swap: RING.top1, hook: RING.top2, use: RING.ctx },
    heli: { fire: RING.fire, wsel: [2.95, .95, 1.05], fl: RING.a2, zoom: RING.a3, exit: RING.ctx, up: LUP, dn: LDN },
    veh: { fire: RING.fire, ads: RING.a1, r: RING.a2, wpn: RING.a3, smk: RING.a4, g: RING.a5, fl: RING.a6, mode: RING.a7, cam: RING.top1, pax: RING.top2, exit: RING.ctx, brk: [.9, 2.2, .95, 1], up: LUP, dn: LDN },
    gs: { fire: RING.fire, alt: RING.a1, zoom: RING.a5, exit: RING.a3, g1: [2.85, .8, .85], g2: RING.a2, g3: RING.a4, up: LUP, dn: LDN }
  };
  const kindOf = () => P.gs ? 'gs' : P.mnt ? 'heli' : P.veh ? 'veh' : 'foot';
  const posOf = (k, id) => { const o = CFG.pos[k] && CFG.pos[k][id], d = POS[k][id]; return o ? [o[0], o[1], o[2], d[3]] : d; };
  /* isi tombol: h = tahan (keydown saat ditekan, keyup saat dilepas), look = jari di tombol juga menggeser kamera (tombol tembak) */
  const B = (id, l, o) => Object.assign({ id, l }, o || {});
  const fire = (l, n) => B('fire', l || FIRE_SVG, { look: true, down: fireDown, up: fireUp, cls: 'fire', n });
  const sec = t => t > 0 ? Math.ceil(t) + 's' : '';   // sisa jeda isi ulang
  const near = () => !!((F.benchNear && F.benchNear()) || (F.vehNear && F.vehNear()) || (F.heliNear && F.heliNear()));
  const UPDN = () => [B('up', Tt('tc_up'), { h: 'Space' }), B('dn', Tt('tc_down'), { h: 'KeyC' })];
  function layout() {
    const g = P.gs;
    if (g) {
      const ex = B('exit', Tt('tc_exit'), { tap: 'KeyX' });
      if (g.mode === 'pick') return [fire(icon('ok')), B('alt', Tt('tc_cancel'), { ic: 'cancel', down: () => F.gsExit() })];
      if (g.mode === 'pred') return [fire(), B('alt', Tt('tc_det'), { ic: 'det', down: () => F.gsExit() })];
      if (g.mode === 'laser') return [fire(icon('beam'), () => { const L = P.laser; return L && L.ph === 'sat' ? '' : L && L.ph === 'charge' ? Math.round(clamp(1 - L.ch / F.LASER.charge, 0, 1) * 100) + '%' : Tt('tc_focus'); }), B('alt', Tt('tc_nova'), { ic: 'nova', n: () => 'NOVA', down: () => F.gsExit() }), B('zoom', Tt('tc_zoom'), { down: zoom })];   // tahan TEMBAK = sinar fokus
      if (g.mode === 'uav') {
        if (P.tgt) return [fire(icon('ok')), B('alt', Tt('tc_cancel'), { ic: 'cancel', down: () => F.cancelTarget() })].concat(UPDN());   // sasaran mortir dibidik dari kamera drone
        return [ex, fire(), B('alt', Tt('tc_therm'), { ic: 'therm', tap: 'KeyN' }), B('zoom', Tt('tc_zoom'), { down: zoom })].concat(UPDN());
      }
      const gb = i => B('g' + (i + 1), ['25', '40', '105'][i], { txt: true, tap: 'Digit' + (i + 1), on: () => g.w === i, dim: () => g.cd[i] > 0, n: () => sec(g.cd[i]) || '' });   // jeda isi ulang tiap meriam tampil di tombolnya
      return [ex, fire(), gb(0), gb(1), gb(2), B('zoom', Tt('tc_zoom'), { down: zoom })];
    }
    if (P.tgt) return [fire(icon('ok')), B('ads', Tt('tc_cancel'), { ic: 'cancel', down: () => F.cancelTarget() })];
    if (P.mnt) {   // Shadow Hunter: satu tombol TEMBAK untuk senjata aktif + tombol SENJATA ▾ (menu pilih senjata, hulu ledak, Protokol Bayangan, kamera)
      const H = P.heli, w = HW[hw];
      return [B('fire', FIRE_SVG, Object.assign({ look: true, cls: 'fire', n: () => w.n(H) }, w.fire)),
        B('wsel', w.s + ' ▾', { ic: 'w_' + hw, down: () => hwShow(hwP.classList.contains('off')), cls: 'hot', n: () => w.n(H) }),
        B('fl', Tt('tc_flare'), { tap: 'KeyF', n: () => sec(H.fcd) || H.fl }), B('zoom', Tt('tc_zoom'), { down: zoom }),
        B('exit', Tt('tc_exit'), { tap: 'KeyE' })].concat(UPDN());
    }
    if (P.veh && P.veh.D && P.veh.D.fw) {   // WOLFPACK: tembak GAU-8 · RUDAL (salvo ke sasaran terkunci) · flare · roda · rem · kamera · keluar; joystick maju/mundur = gas, dorong penuh = tenaga penuh
      const V = P.veh;
      return [fire(null, () => V.mag[0]), B('ads', Tt('tc_msl'), { ic: 'w_hf', down: () => { I.ads = true; }, up: () => { I.ads = false; }, cls: 'hot', n: () => V.hom }),
        B('fl', Tt('tc_flare'), { tap: 'KeyF', n: () => sec(V.fcd) || V.fl }), B('g', Tt('tc_gear'), { ic: 'gear', tap: 'KeyG', on: () => V.gear > .5, dim: () => V.gnd }),
        B('brk', Tt('tc_brake'), { h: 'Space' }), B('cam', Tt('tc_cam'), { tap: 'KeyV' }), B('exit', Tt('tc_exit'), { tap: 'KeyE' })];
    }
    if (P.veh) {
      const V = P.veh, D = V.D || {}, sk = F.vehSmkKey(V), out = [fire(null, () => V.mag[V.air ? 0 : V.wi]), V.air ? B('ads', 'AGM', { ic: 'w_hf', down: () => { I.ads = true; }, up: () => { I.ads = false; }, cls: 'hot', n: () => V.agm })   // jet: klik kanan = rudal AGM
        : B('ads', Tt('tc_zoom'), { ic: 'zoom', down: () => { I.ads = !I.ads; }, on: () => I.ads }),
        B('r', V.air ? Tt('tc_aam') : Tt('tc_rel'), { ic: V.air ? 'w_st' : 'rel', tap: 'KeyR', n: V.air ? () => V.aam : null }), B('cam', Tt('tc_cam'), { tap: 'KeyV' }), B('exit', Tt('tc_exit'), { tap: 'KeyE' })];
      if (V.u && V.u.seats > 1) out.push(B('pax', Tt('tc_pax'), { n: () => F.seatStr(V.u), on: () => !!(V.u.pax && V.u.pax.length), down: () => {   // pasukan: kosong = panggil naik, berisi = turunkan
        const o = V.u.pax && V.u.pax.length ? 'unboard' : 'board', r = F.command('ALL', o); F.msg(U.cmdMsg(o, r), r.ok ? 'g' : 'c'); } }));
      if (D.w && D.w.length > 1) out.push(B('wpn', Tt('tc_wpn'), { ic: 'swap', tap: 'KeyQ' }));
      if (sk) out.push(B('smk', Tt('tc_smoke'), { tap: 'Key' + sk, n: () => V.smk }));
      if (D.atgm || D.bomb) out.push(B('g', Tt(D.bomb ? 'tc_bomb' : 'tc_msl'), { ic: D.bomb ? 'bomb' : 'w_hf', tap: 'KeyG', n: () => D.bomb ? V.bomb : V.atg }));
      if (D.flare) out.push(B('fl', Tt('tc_flare'), { tap: 'KeyF', n: () => sec(V.fcd) || V.fl }));
      if (V.air) out.push(B('mode', Tt('tc_mode'), { tap: 'KeyX', n: () => V.mode === 'jet' ? 'JET' : 'VTOL' }), ...UPDN());
      else out.push(B('brk', Tt('tc_brake'), { h: 'Space' }));
      return out;
    }
    const eq = P.eq, adsB = eq === 'gren' ? B('ads', Tt('tc_bash'), { ic: 'knife', down: () => { I.ads = true; }, up: () => { I.ads = false; }, cls: 'hot' })   // granat di tangan: tombol bidik = pukul (melee)
      : eq === 'knife' || eq === 'bay' ? B('ads', Tt('tc_power'), { ic: 'knife', down: () => { I.ads = true; }, up: () => { I.ads = false; }, cls: 'hot' })   // pisau / bayonet: serangan kuat
      : eq === 'hook' ? B('ads', Tt('tc_stow'), { ic: 'cancel', tap: 'KeyH' })   // grappling hook: simpan alat
      : B('ads', Tt('tc_ads'), { down: adsToggle, on: () => I.ads });
    const out = [fire(), adsB, B('rel', Tt('tc_rel'), { tap: 'KeyR' }),
      B('jump', Tt('tc_jump'), { h: 'Space' }), B('crouch', Tt('tc_crouch'), { tap: 'KeyC', on: () => P.crouch }),
      B('gren', Tt('tc_gren'), { tap: 'KeyG', on: () => P.eq === 'gren', n: () => P.gren }), B('knife', Tt('tc_knife'), { tap: 'KeyV', on: () => P.eq === 'knife' || P.eq === 'bay' }),
      B('ab', Tt('tc_ab'), { tap: 'KeyF', dim: () => P.ab && P.ab.cd > 0, n: () => sec(P.ab && P.ab.cd) }), B('swap', Tt('tc_swap'), { tap: 'KeyQ' }), B('hook', Tt('tc_hook'), { tap: 'KeyH', on: () => !!P.hook || P.eq === 'hook', dim: () => (P.hookCd || 0) > P.time })];
    if (near()) out.push(B('use', Tt('tc_use'), { tap: 'KeyE', cls: 'use' }));
    return out;
  }
  /* ---------- Shadow Hunter di HP: senjata aktif (hw) dipilih lewat menu, ditembakkan dengan tombol TEMBAK ----------
     gun = senapan dagu (tahan) · hy = roket Hydra (tahan = salvo beruntun) · hf = Hellfire (tahan = kunci sasaran, lepas = luncur) · st = Stinger */
  let hw = 'gun', hyT = 0;
  const HGUN = H => F.APACHE.guns[H.gi], GSN = { M230: '30MM', MINIGUN: 'MINIGUN', LASER: 'LASER', RAILGUN: 'RAILGUN' };
  const HW = {
    gun: { s: '', n: H => HGUN(H).k === 'laser' ? Math.round(H.heat / HGUN(H).heat * 100) + '%' : H.ga[H.gi], fire: { down: fireDown, up: fireUp } },
    hy: { s: 'HYDRA', n: H => H.hy, fire: { down: () => { tap('KeyG'); hyT = .45; }, up: () => { hyT = 0; }, rep: true } },
    hf: { s: 'HELLFIRE', n: H => (H.pl.length ? '▣' + H.pl.length + ' ' : '') + H.hf, fire: { down: () => { I.ads = true; }, up: () => { I.ads = false; } } },
    st: { s: 'STINGER', n: H => H.aam, fire: { tap: 'KeyR' } }
  };
  Object.defineProperty(HW.gun, 's', { get: () => P.heli ? GSN[HGUN(P.heli).id] || '40MM' : '30MM' });
  function hwHTML() {
    const H = P.heli; if (!H) return '';
    const row = (id, name, val, sub) => '<button data-hw="' + id + '" class="' + (hw === id ? 'rdy' : '') + '"><b>' + (hw === id ? '●' : '○') + '</b><span>' + name + '</span><small>' + val + '</small>' +
      (sub ? '<em data-hk="' + sub[0] + '">' + sub[1] + ' ⟳</em>' : '') + '</button>';
    const ghost = H.ghT > 0 ? Tt('f_gh_act') + ' ' + Math.ceil(H.ghT) + 's' : H.ghCd > 0 ? Math.ceil(H.ghCd) + 's' : Tt('f_gh_rdy');
    return '<div class="tsh"><b>' + Tt('tc_wpn_h') + '</b><small>' + Tt('tc_wpn_hint') + '</small></div>' +
      row('gun', Tt('tc_chin'), HW.gun.n(H), ['KeyH', HW.gun.s]) +
      row('hy', 'HYDRA 70', H.hy, ['KeyX', ['HE', 'FLECHETTE', 'APKWS', 'WP'][H.hyW]]) +
      row('hf', 'HELLFIRE', HW.hf.n(H) + ' · ' + Tt('tc_hf_how')) +
      row('st', 'STINGER', H.aam) +
      '<button data-hk="KeyQ" class="ex' + (H.ghT > 0 || H.ghCd <= 0 ? '' : ' dis') + '"><b>◆</b><span>' + Tt('f_gh') + '</span><small>' + ghost + '</small></button>' +
      '<button data-hk="KeyV" class="ex"><b>◐</b><span>' + Tt('tc_cam') + '</span><small></small></button>';
  }
  function hwShow(on) {
    if (on && P.mnt) { radioShow(false); stkShow(false); const h = hwHTML(); hwP.innerHTML = h; hwP.dataset.sig = h; hwP.classList.remove('off'); } else hwP.classList.add('off');
  }
  hwP.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    const k = e.target.closest('[data-hk]'), b = e.target.closest('button[data-hw]');
    if (k) { tap(k.dataset.hk); A() && A().local('ui', .4); if (k.tagName === 'BUTTON') hwShow(false); else { const h = hwHTML(); hwP.innerHTML = h; hwP.dataset.sig = h; } return; }   // ⟳ jenis senapan / hulu ledak: menu tetap terbuka
    if (b) { hw = b.dataset.hw; A() && A().local('switch', .5); }
    hwShow(false);
  });
  const ctxOf = () => P.gs ? 'gs:' + P.gs.mode + (P.tgt ? ':t' : '') : P.tgt ? 'tgt' : P.mnt ? 'heli' : P.veh ? 'veh:' + P.veh.id + (P.veh.air ? 'a' : '') : 'foot';

  /* ---------- penggambaran tombol ---------- */
  let BL = [], sig = '', u = 56, CWp = 0, CHp = 0;
  const unit = () => clamp(Math.min(CWp - SA.l - SA.r, CHp - SA.t - SA.b) * .125, 40, 66) * CFG.size;
  /* [x, y, d(, kiri)] dalam u → pusat piksel di dalam area aman */
  const toPx = q => [q[3] ? SA.l + q[0] * u : CWp - SA.r - q[0] * u, CHp - SA.b - q[1] * u, q[2] * u];
  const fsz = (lbl, d) => {   // huruf mengecil untuk label panjang supaya tidak terpotong lingkaran tombol
    const n = Math.max(3, ...String(lbl).replace(/<svg[\s\S]*$/, 'XX').split('<br>').map(t => t.length));
    return Math.max(8, Math.min(u * (d > 1.2 * u ? .22 : .19), d * .84 / (n * .64)));
  };
  function place(el, q, lbl) {
    const [cx, cy, d] = toPx(q);
    el.style.width = el.style.height = d + 'px'; el.style.left = (cx - d / 2) + 'px'; el.style.top = (cy - d / 2) + 'px'; el.style.fontSize = fsz(lbl === undefined ? el.innerHTML : lbl, d) + 'px';
  }
  function build() {
    BL = layout(); btnBox.innerHTML = ''; const k = kindOf();
    for (const b of BL) {
      const el = document.createElement('button'), ic = !b.txt && ICN[b.ic || b.id], name = String(b.l).replace(/<[^>]*>/g, '').trim();
      el.className = 'tbtn' + (b.cls ? ' ' + b.cls : '') + (ic ? ' ico' : ''); el.innerHTML = (ic ? icon(b.ic || b.id) : b.l) + (b.n ? '<small class="tn"></small>' : '');
      if (name) { el.setAttribute('aria-label', name); el.title = name; }
      el.dataset.b = b.id; place(el, posOf(k, b.id), ic ? 'XX' : b.l); b.el = el; b.nEl = el.querySelector('.tn'); b.nv = null; btnBox.appendChild(el);
    }
  }
  /* killstreak: satu tombol ★ di bilah atas (angka = jumlah siap pakai, berdenyut) → menu tarik-turun berisi semua killstreak;
     yang siap menyala & langsung dipakai saat diketuk, sisanya menampilkan kemajuan kill. Layar tetap lapang (dulu: kolom tombol di kiri) */
  const stkUse = s => !(P.mnt || P.veh) || s.id === 'UAV' || s.id === 'LASER';   // dari heli / kendaraan hanya drone & laser (sama seperti keyboard)
  /* menu KILLSTREAK (gaya sama dengan RADIO): kepala + jalur kill beruntun bertitik + kartu berikon (siap = menyala jingga) */
  const SKI = {   // ikon 24×24
    star: 'M12 2.2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.1l-6.1 3.5 1.5-6.8L2.2 9.2l6.9-.7z',
    UAV: 'M2 9.2h7.2l1.3-1.6h3l1.3 1.6H22v1.6h-7.4l-.9 2.2h-3.4l-.9-2.2H2zM11 13.6h2v1.6h-2zM9.4 15.8h5.2v1.4H9.4zM4 7.6h2.4v1.2H4zM17.6 7.6H20v1.2h-2.4z',
    PRED: 'M12 1.6l2.2 4v9.2l2.6 2.6v2.4l-2.6-1.2v1.6h-4.4v-1.6l-2.6 1.2v-2.4l2.6-2.6V5.6zM11.2 21.4h1.6l-.8 1.4z',
    APACHE: 'M1.5 4.6h21v1.3h-21zM11.3 5.9h1.4v2H11.3zM6.4 8.6h8.8q4.2 0 4.6 2.9l2.7.4v1.6l-3.4.3q-1.2 2.2-4.6 2.2H9.8l-2.7-2.6H2.6v-2h4zM9 17.6h8.6v1.2H9z',
    GUNSHIP: 'M11.2 1.8h1.6l.5 6.4 8.9 3.4v1.8l-8.9-1.6-.4 6.6 2.9 1.8v1.4l-3.8-.9-3.8.9v-1.4l2.9-1.8-.4-6.6-8.9 1.6v-1.8l8.9-3.4z',
    LASER: 'M8.6 2.6l3.2 3.2-2.4 2.4-3.2-3.2zM15.6 9.6l3.2 3.2-2.4 2.4-3.2-3.2zM10.4 8.6l3 3-1.6 1.6-3-3zM12.3 13.8l1 1-1.3 1.8 4.4 5.2h-2.3L11 18.2l-3.1 3.6H5.6l4.4-5.2z'
  };
  const skIco = k => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + SKI[k] + '"/></svg>';
  function stkHTML() {
    const sk = P.sk || 0, L = F.STREAKS, mx = L[L.length - 1].kills, rdy = L.reduce((a, s) => a + (stkUse(s) ? +P.slots[s.id] || 0 : 0), 0);
    const track = '<div class="sk-tr"><i style="width:' + Math.min(100, sk / mx * 100) + '%"></i>' + L.map(s => '<span class="' + (sk >= s.kills || +P.slots[s.id] > 0 ? 'on' : '') + '" style="left:' + (s.kills / mx * 100) + '%">' + s.kills + '</span>').join('') + '</div>';
    return '<div class="sk-h"><span class="sk-ic">' + skIco('star') + '</span><div class="sk-t"><b>' + Tt('tc_stk') + '</b><small>' + Tt(rdy ? 'tc_stk_hint' : 'tc_stk_hint0') + '</small></div>' +
      '<div class="sk-c"><em>' + Tt('tc_stk_run') + '</em><b>' + sk + '</b></div><button class="sk-x" data-x="close" aria-label="close">✕</button></div>' + track +
      '<div class="sk-l">' + L.map((s, i) => {
        const n = +P.slots[s.id] || 0, ok = n > 0 && stkUse(s), p = n > 0 ? 100 : Math.min(100, sk / s.kills * 100);
        return '<button data-sk="' + s.key + '" class="' + (ok ? 'rdy' : n > 0 ? 'dis' : 'lock') + '" style="--d:' + i + ';--p:' + p + '%">' + skIco(s.id) +
          '<b>' + Tt('f_streak_' + s.id) + '</b><small>' + Tt('tc_sd_' + s.id) + '</small>' +
          '<em>' + (n > 0 ? (ok ? Tt('tc_stk_rdy') + (n > 1 ? ' ×' + n : '') : Tt('tc_stk_no')) : Math.min(sk, s.kills) + '/' + s.kills) + '<i>' + (n > 0 ? '' : Tt('tc_stk_kill')) + '</i></em><u></u></button>';
      }).join('') + '</div>';
  }
  function stkShow(on) {
    if (on) { radioShow(false); const h = stkHTML(); stkP.classList.remove('still'); stkP.innerHTML = h; stkP.dataset.sig = h; stkP.classList.remove('off'); } else stkP.classList.add('off');
  }
  stkP.addEventListener('pointerdown', e => {   // langsung saat ditekan (daftar pendek, tidak digulir)
    e.stopPropagation(); e.preventDefault();
    const b = e.target.closest('button[data-sk]'); if (!b) { if (e.target.closest('[data-x]')) stkShow(false); return; }   // ketuk kepala / jalur: tetap terbuka
    if (!b.classList.contains('rdy')) { A() && A().local('empty', .4); return; }
    stkShow(false); tap('Digit' + b.dataset.sk);
  });

  /* ---------- jari: joystick / bidik / tombol ---------- */
  const ptr = new Map();   // pointerId → { role, x, y, b }
  const J = { id: null, ox: 0, oy: 0, r: 60, mx: 0, my: 0, spr: false };
  const joyOK = () => !P.gs || P.gs.mode === 'uav';   // kamera udara selain drone: operator diam di darat, tidak ada yang digerakkan
  const hudS = () => CHp / 720;
  function inMini(x, y) { const s = hudS(), r = 92 * s, cx = SA.l + 20 * s + r, cy = 20 * s + r; return Math.hypot(x - cx, y - cy) < r + 6; }
  function joyMove(x, y) {
    let dx = x - J.ox, dy = y - J.oy; const L = Math.hypot(dx, dy), r = J.r;
    J.spr = L > r * 1.25 && -dy > L * .7 && !P.gs;   // dorong jauh ke depan = lari / turbo
    if (L > r) { dx *= r / L; dy *= r / L; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    let mx = dx / r, my = -dy / r; const m = Math.hypot(mx, my); if (m < .14) { mx = my = 0; }
    J.mx = mx; J.my = my;
    I.r = Math.max(0, mx); I.l = Math.max(0, -mx); I.f = Math.max(0, my); I.b = Math.max(0, -my); I.sprint = J.spr || (I.f > .9 && J.sprLock);
    sprEl.classList.toggle('on', I.sprint);
  }
  function joyEnd() { J.id = null; joyEl.style.display = 'none'; I.f = I.b = I.l = I.r = 0; I.sprint = false; J.spr = false; sprEl.classList.remove('on'); }
  function look(dx, dy) {
    if (!dx && !dy) return;
    let k = 1.15 * CFG.sens * (P.gs ? 1.3 : 1);
    if (CFG.assist && aimHot && !P.gs && !P.veh && !P.mnt) k *= .55;   // gesekan bidik: lambat saat crosshair di atas musuh
    F.look(dx * k, dy * k); VM.push(dx * .6, dy * .6);
  }
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && !U.touch) return;
    const t = e.target.closest('button'), x = e.clientX - stage.getBoundingClientRect().left, y = e.clientY - stage.getBoundingClientRect().top;
    if (!stkP.classList.contains('off') && !(t && t.dataset.a === 'stk')) stkShow(false);   // sentuhan di luar menu killstreak menutupnya
    if (!hwP.classList.contains('off') && !(t && t.dataset.b === 'wsel')) hwShow(false);
    e.preventDefault(); if (A()) A().init();
    try { root.setPointerCapture(e.pointerId); } catch (x2) { /* ok */ }
    if (t && t.dataset.a) { action(t.dataset.a); ptr.set(e.pointerId, { role: 'ui' }); return; }
    if (t && t.dataset.k) { tap('Digit' + t.dataset.k); ptr.set(e.pointerId, { role: 'ui' }); return; }
    if (t && t.dataset.b) {
      const b = BL.find(q => q.id === t.dataset.b); if (!b) return;
      t.classList.add('press'); ptr.set(e.pointerId, { role: 'btn', b, x, y });
      if (b.h) key(b.h); else if (b.tap) tap(b.tap); else if (b.down) b.down();
      return;
    }
    if (M.map || M.sb) { M.map = M.sb = false; ptr.set(e.pointerId, { role: 'ui' }); return; }   // peta taktis / papan skor terbuka: ketuk = tutup   // peta taktis terbuka: ketuk = tutup
    if (inMini(x, y)) { M.map = true; A() && A().local('ui', .5); ptr.set(e.pointerId, { role: 'ui' }); return; }
    if (joyOK() && x < SA.l + (CWp - SA.l - SA.r) * .42 && y > CHp * .3 && J.id === null) {   // joystick muncul di titik sentuh
      J.id = e.pointerId; J.r = u * 1.05; J.ox = x; J.oy = y; J.sprLock = false;
      joyEl.style.display = 'block'; joyEl.style.width = joyEl.style.height = J.r * 2 + 'px'; joyEl.style.left = (x - J.r) + 'px'; joyEl.style.top = (y - J.r) + 'px';
      knob.style.width = knob.style.height = J.r * .9 + 'px'; knob.style.left = knob.style.top = J.r * .55 + 'px'; joyMove(x, y);
      ptr.set(e.pointerId, { role: 'joy' }); return;
    }
    ptr.set(e.pointerId, { role: 'look', x, y });
  }, { passive: false });
  root.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return; e.preventDefault();
    const r0 = stage.getBoundingClientRect(), x = e.clientX - r0.left, y = e.clientY - r0.top;
    if (p.role === 'joy') joyMove(x, y);
    else if (p.role === 'look' || (p.role === 'btn' && p.b.look)) { look(x - p.x, y - p.y); p.x = x; p.y = y; }
  }, { passive: false });
  function release(e) {
    const p = ptr.get(e.pointerId); if (!p) return; ptr.delete(e.pointerId);
    if (p.role === 'joy') joyEnd();
    else if (p.role === 'btn') { const b = p.b; if (b.el) b.el.classList.remove('press'); if (b.h) key(b.h, true); else if (b.up) b.up(); }
  }
  root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release); root.addEventListener('lostpointercapture', release);
  function releaseAll() {
    for (const id of [...ptr.keys()]) release({ pointerId: id });
    ptr.clear(); joyEnd(); I.fire = false;
  }

  /* ---------- tombol atas: jeda & RADIO ---------- */
  function action(a) {
    if (a === 'pause') { if (M.map) M.map = false; else { radioShow(false); stkShow(false); U.setPause(true); } }
    else if (a === 'radio') { stkShow(false); radioShow(radio.classList.contains('off')); }
    else if (a === 'stk') stkShow(stkP.classList.contains('off'));
    else if (a === 'sup') {   // v2.17: isi nyawa + amunisi + granat (sama dengan RADIO → PASOKAN AMUNISI + MEDKIT)
      const u = P.unit, full = u && u.hp >= u.hpMax && P.w.every(w => !w || (w.ammo >= F.WEAPONS[w.id].mag && w.res >= F.WEAPONS[w.id].res)) && P.gren >= P.cls.gren + 1;
      if (full) { F.msg(Tt('f_sup_full'), 'c'); return; }
      const r = F.callin('AMMO'); if (r && !r.ok && r.msg) F.msg(Tt(r.msg), 'c');
    }
  }
  /* RADIO (v2.0): laci kaca di kanan — kepala berfrekuensi + kredit, 5 ubin aksi cepat, kartu bantuan (ikon, harga, bilah keterjangkauan), komando regu */
  const RI = {   // ikon 24×24
    sup: 'M9 2h6v5h5v6h-5v5H9v-5H4V7h5z M3 20h18v2H3z',   // salib medis + alas (isi nyawa & amunisi)
    army: 'M8 6a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM16 6a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM2 20q1-6 6-6t6 6zM12 20q1-6 5-6t5 6z',
    cls: 'M2 11h13l2-2h5v3h-4l-1 2H9l-1 4H5l1-4H2z', map: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16',
    sb: 'M7 3h10v4a5 5 0 0 1-10 0zM4 4h3v3a3 3 0 0 1-3-3zM20 4h-3v3a3 3 0 0 0 3-3zM10 14h4v3h3v3H7v-3h3z', nvg: 'M2 9h20v6h-6l-2-2h-4l-2 2H2zM5 11a1.6 1.6 0 1 0 0 .1zM19 11a1.6 1.6 0 1 0 0 .1zM10 6h4v3h-4z',
    SQUAD: 'M8 6a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM16 6a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM2 20q1-6 6-6t6 6zM12 20q1-6 5-6t5 6z', MEDIC: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    AMMO: 'M5 9h14v11H5zM7 4h2v5H7zM11 3h2v6h-2zM15 4h2v5h-2z', MORTAR: 'M10 3l4 1-3 11 2 1-1 3-6-2 1-3 2 1zM4 20h16v2H4z',
    TANK: 'M3 13h18v5H3zM6 9h9l2 4H6zM15 9.6h7v1.6h-7z', MEDEVAC: 'M2 5h20v1.6H2zM11 6.6h2V9h-2zM6 9h10q4 0 4 3.6T16 16H9l-3-3H2v-2h4zM10 10h2v1.5h1.5v2H12V15h-2v-1.5H8.5v-2H10z',
    GUNSHIP: 'M12 2l2 7 8 3v2l-8-1-1 6 3 2v1l-4-1-4 1v-1l3-2-1-6-8 1v-2l8-3z', FUEL: 'M6 4h8l3 3v13H6zM8 6h5v4H8zM17 8l3 3v7a1.5 1.5 0 0 1-3 0v-4'
  };
  const rIco = k => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (RI[k] || RI.SQUAD) + '"/></svg>';
  function radioHTML() {
    const ci = F.CALLINS.map((c, i) => '<button data-ci="' + c.id + '" class="' + (Q.cr < c.cost || F.lockR('ci', c.id) ? 'dis' : '') + '" style="--d:' + i + ';--p:' + Math.min(100, Math.round(Q.cr / c.cost * 100)) + '%">' + rIco(c.id) + '<b>' + Tt('f_ci_' + c.id) + '</b><small>' + c.cost + ' KR</small><u></u></button>').join('');
    const grp = F.ARMY_GRP.map(g => '<button data-g="' + g + '"' + (M.grp === g ? ' class="on"' : '') + '>' + Tt('f_grp_' + g) + ' <small>' + F.myArmy(g).length + '</small></button>').join('');
    const ord = U.CMD_O.map(o => '<button data-o="' + o + '">' + Tt('f_cmd_' + o) + '</button>').join('');
    const q = [['army', 'tc_army'], ['cls', 'tc_cls'], ['map', 'tc_map'], ['sb', 'tc_score'], ['nvg', 'NVG']].map(([k, l]) => '<button data-x="' + k + '"' + ((k === 'sb' && M.sb) || (k === 'nvg' && R.nvg) ? ' class="on"' : '') + '>' + rIco(k) + '<span>' + (l === 'NVG' ? l : Tt(l)) + '</span></button>').join('');
    return '<div class="trh"><i class="trw">' + icon('radio') + '</i><div class="trt"><b>' + Tt('tc_radio') + '</b><small>' + Tt('tc_freq') + '</small></div><span class="trc"><em>' + Tt('f_credits') + '</em><b>' + Math.floor(Q.cr) + '</b></span><button data-x="close" class="trx" aria-label="close">✕</button></div>' +
      '<div class="trq">' + q + '</div><h4>' + Tt('tc_ci') + '</h4><div class="trl">' + ci + '</div><h4>' + Tt('tc_cmd') + ' · ' + Tt('f_grp_' + M.grp) + '</h4><div class="trg trgp">' + grp + '</div><div class="trg trgo">' + ord + '</div>';
  }
  function radioUpdate() {   // kredit, tombol terjangkau & jumlah pasukan per grup
    const h = radio.querySelector('.trc b'); if (h) h.textContent = Math.floor(Q.cr);
    radio.querySelectorAll('[data-ci]').forEach(b => { const c = F.CALLINS.find(q => q.id === b.dataset.ci); if (!c) return; b.classList.toggle('dis', Q.cr < c.cost || !!F.lockR('ci', c.id)); b.style.setProperty('--p', Math.min(100, Math.round(Q.cr / c.cost * 100)) + '%'); });
    radio.querySelectorAll('[data-g]').forEach(b => { const n = b.querySelector('small'); if (n) n.textContent = F.myArmy(b.dataset.g).length; });
  }
  function radioShow(on) {
    if (on) { radio.innerHTML = radioHTML(); radio.classList.remove('off', 'still'); radio.dataset.t = 0; } else radio.classList.add('off');
  }
  radio.addEventListener('pointerdown', e => e.stopPropagation());
  radio.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.ci) { const r = F.callin(d.ci); if (r && r.ok) { radioShow(false); return; } if (r && r.msg) F.msg(Tt(r.msg), 'c'); if (P.tgt) { radioShow(false); return; } }
    else if (d.g) { M.grp = d.g; A() && A().local('ui', .4); }
    else if (d.o) { const r = F.command(M.grp, d.o); F.msg(U.cmdMsg(d.o, r), r.ok ? 'g' : 'c'); if (r.ok) { radioShow(false); return; } }
    else if (d.x === 'close') { radioShow(false); return; }
    else if (d.x === 'army') { radioShow(false); U.setArmy(true); return; }
    else if (d.x === 'cls') { radioShow(false); U.clsOpen(false); return; }
    else if (d.x === 'map') { radioShow(false); M.map = true; return; }
    else if (d.x === 'sb') { M.sb = !M.sb; radioShow(false); return; }
    else if (d.x === 'nvg') { R.nvg = !R.nvg; A() && A().local('switch', .5); }
    const sc = radio.scrollTop; radio.classList.add('still'); radio.innerHTML = radioHTML(); radio.scrollTop = sc;
  });

  /* ---------- bantuan bidik (hanya jalan kaki) ---------- */
  let aimHot = null;
  function bestTarget(maxDeg, maxD) {
    const c = P.cam; if (!c) return null; let best = null, bs = maxDeg * Math.PI / 180;
    for (const t of Q.units) {
      if (t.team !== 'R' || t.dead || t.struct) continue;
      const dx = t.x - c.x, dy = t.y - c.y, dh = Math.hypot(dx, dy); if (dh > maxD || dh < 2) continue;
      const hb = F.hitbox(t), tz = hb.z0 + hb.h * (hb.human ? .62 : .5), yaw = Math.atan2(dy, dx), pit = Math.atan2(tz - c.z, dh);
      const da = Math.hypot(wrapPi(yaw - c.yaw), pit - c.pitch); if (da > bs) continue;
      const d = Math.hypot(dh, tz - c.z), tt = F.rayTerrain(c.x, c.y, c.z, dx / d, dy / d, (tz - c.z) / d, d); if (tt > 0 && tt < d - 1.5) continue;   // tertutup medan
      bs = da; best = { u: t, yaw, pit };
    }
    return best;
  }
  function snap() {   // ADS menempel ke musuh terdekat dari crosshair (≤ 7°)
    const b = bestTarget(7, 260); if (!b) return;
    const c = P.cam; P.yaw = wrapPi(P.yaw + wrapPi(b.yaw - c.yaw) * .8); P.pitch = clamp(P.pitch + (b.pit - c.pitch) * .8, F.PMIN, 1.35);
  }

  /* ---------- per frame ---------- */
  let aimT = 0, ctxSig = '', eqSig = '', layoutVer = 0;
  function hudW() {   // lebar gugus tombol kanan-bawah (u) → panel amunisi/senjata kanvas digambar di kiri gugus
    const k = kindOf(); let m = 0;
    for (const id in POS[k]) { const q = posOf(k, id); if (!q[3] && q[1] < 2.4) m = Math.max(m, q[0] + q[2] / 2); }
    return m + .15;
  }
  function visible() { return U.touch && U.active && P.alive && !P.menu && !M.pause && !M.army && !F.kitOn && !Q.over && !M.building; }
  function tick(dt) {
    const on = visible();
    if (root.classList.contains('off') !== !on) { root.classList.toggle('off', !on); if (!on) { releaseAll(); radioShow(false); stkShow(false); hwShow(false); } }
    if (!on) return;
    const full = !!(M.map || M.sb); if (root.classList.contains('tfull') !== full) { root.classList.toggle('tfull', full); if (full) { releaseAll(); radioShow(false); stkShow(false); } }   // peta / papan skor: tombol disembunyikan, ketuk mana saja = tutup
    const w = stage.clientWidth, h = stage.clientHeight;
    if (w !== CWp || h !== CHp) { CWp = w; CHp = h; readSafe(); u = unit(); sig = ''; }
    root.style.setProperty('--ta', CFG.alpha); U.hudR = SA.r + u * hudW(); U.hudL = SA.l;
    { const ss = clamp(h / 520, .62, 1), c = (F.CALLINS.find(q => q.id === 'AMMO') || { cost: 60 }).cost;   // tombol pasokan: kanan minimap (minimap fps-ui: x 20·s + area aman, jari-jari 74·s)
      supBtn.style.left = Math.round(SA.l + 176 * ss) + 'px'; supBtn.style.top = Math.round(20 * ss) + 'px'; supBtn.style.display = P.gs ? 'none' : '';
      if (!supBtn.firstChild) supBtn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="' + RI.sup + '"/></svg><span class="tn">' + c + '</span>';
      supBtn.classList.toggle('dim', Q.cr < c); supBtn.setAttribute('aria-label', Tt('f_ci_AMMO')); supBtn.title = Tt('f_ci_AMMO'); }
    topBar.style.right = stkP.style.right = hwP.style.right = (SA.r + 8) + 'px'; topBar.style.top = (SA.t + 6) + 'px'; stkP.style.top = hwP.style.top = (SA.t + 58) + 'px'; U.topR = SA.r + 10; U.topY = SA.t + 58;   // HUD kanan atas mulai di bawah bilah ❚❚ / RADIO
    if (J.id !== null && !joyOK()) { const p = ptr.get(J.id); if (p) p.role = 'ui'; joyEnd(); }
    if (!P.mnt) { hw = 'gun'; if (!hwP.classList.contains('off')) hwShow(false); }
    else if (!hwP.classList.contains('off')) { const h = hwHTML(); if (h !== hwP.dataset.sig) { hwP.innerHTML = h; hwP.dataset.sig = h; } }
    U.hw = P.mnt ? hw : null;
    if (hyT > 0 && (hyT -= dt) <= 0) { tap('KeyG'); hyT = .45; }   // Hydra: tombol ditahan = salvo beruntun
    const c = ctxOf(), s2 = c + '|' + (c === 'foot' ? near() + (P.eq || '') : '') + '|' + Tt('tc_rel') + '|' + u + '|' + layoutVer + '|' + (P.mnt ? hw + HW.gun.s : '');
    if (c !== ctxSig) { if (ctxSig) { I.ads = false; I.fire = false; } ctxSig = c; }
    if ((P.eq || '') !== eqSig) { eqSig = P.eq || ''; I.ads = false; }   // pisau / granat / kait dikeluarkan: bidik ADS dimatikan (tombol bidik berganti fungsi)
    if (s2 !== sig) { sig = s2; for (const [, p] of ptr) if (p.role === 'btn') { if (p.b.h) key(p.b.h, true); else if (p.b.up) p.b.up(); p.role = 'look'; p.x = p.x || 0; } build(); }
    for (const b of BL) {
      if (b.on) b.el.classList.toggle('on', !!b.on()); if (b.dim) b.el.classList.toggle('dim', !!b.dim());
      if (b.nEl) { const v = String(b.n()); if (v !== b.nv) { b.nv = v; b.nEl.textContent = v; } }
    }
    const nRdy = F.STREAKS.reduce((a, s) => a + (stkUse(s) ? +P.slots[s.id] || 0 : 0), 0);
    stkBtn.style.display = P.gs ? 'none' : ''; stkBtn.classList.toggle('hot', nRdy > 0); stkN.textContent = nRdy || '';
    if (P.gs) stkShow(false);
    else if (!stkP.classList.contains('off')) { const h = stkHTML(); if (h !== stkP.dataset.sig) { stkP.classList.add('still'); stkP.innerHTML = h; stkP.dataset.sig = h; } }
    const rb = root.querySelector('.tradio'); if (!rb.firstChild) rb.innerHTML = icon('radio'); rb.setAttribute('aria-label', Tt('tc_radio')); rb.title = Tt('tc_radio');
    if (!radio.classList.contains('off')) { radio.dataset.t = +radio.dataset.t + dt; if (radio.dataset.t > .5) { radio.dataset.t = 0; radioUpdate(); } }
    aimT -= dt; if (aimT <= 0) { aimT = .08; aimHot = CFG.assist && !P.gs && !P.veh && !P.mnt ? bestTarget(2.6, 300) : null; }
  }

  /* ---------- pengaturan sentuh di menu jeda (fps-ui memanggil kait ini) ---------- */
  U.pauseExtra = () => !U.touch ? '' : '<h3>' + Tt('tc_set') + '</h3><div class="fm-set">' +
    '<label>' + Tt('tc_sens') + ' <b id="tv1">' + CFG.sens.toFixed(2) + '</b><input type="range" data-t="sens" min="0.3" max="3" step="0.05" value="' + CFG.sens + '"></label>' +
    '<label>' + Tt('tc_size') + ' <b id="tv2">' + Math.round(CFG.size * 100) + '%</b><input type="range" data-t="size" min="0.75" max="1.35" step="0.05" value="' + CFG.size + '"></label>' +
    '<label>' + Tt('tc_alpha') + ' <b id="tv3">' + Math.round(CFG.alpha * 100) + '%</b><input type="range" data-t="alpha" min="0.25" max="1" step="0.05" value="' + CFG.alpha + '"></label>' +
    '<div class="row"><span>' + Tt('tc_assist') + '</span><button data-ta="assist" class="' + (CFG.assist ? 'on' : '') + '">' + Tt(CFG.assist ? 'f_on' : 'f_off') + '</button></div>' +
    '<div class="fm-btns"><button data-ta="edit" class="big">' + Tt('tc_edit') + '</button></div></div>';
  U.pauseAct = b => {
    if (b.dataset.ta === 'edit') { edOpen(); return true; }
    if (b.dataset.ta !== 'assist') return false; CFG.assist = !CFG.assist; save(); return true;
  };
  U.pauseInput = el => {
    const k = el.dataset.t; if (!k) return false; CFG[k] = +el.value; save(); sig = ''; u = unit();
    const ids = { sens: ['tv1', v => v.toFixed(2)], size: ['tv2', v => Math.round(v * 100) + '%'], alpha: ['tv3', v => Math.round(v * 100) + '%'] }[k];
    const o = document.getElementById(ids[0]); if (o) o.textContent = ids[1](CFG[k]); return true;
  };


  /* ---------- editor tata letak (menu jeda → ATUR TATA LETAK TOMBOL) ----------
     geser tombol = pindah, ketuk = pilih lalu atur ukurannya, RESET = bawaan, SELESAI = simpan ke perangkat */
  const LBL = { ads: 'tc_ads', rel: 'tc_rel', jump: 'tc_jump', crouch: 'tc_crouch', gren: 'tc_gren', knife: 'tc_knife', ab: 'tc_ab', swap: 'tc_swap', hook: 'tc_hook', use: 'tc_use', hf: 'tc_hf', hy: 'tc_hy',
    hym: 'tc_hym', chin: 'tc_chin', st: 'tc_st', fl: 'tc_flare', gh: 'tc_ghost', cam: 'tc_cam', zoom: 'tc_zoom', exit: 'tc_exit', up: 'tc_up', dn: 'tc_down', r: 'tc_rel', wpn: 'tc_wpn',
    smk: 'tc_smoke', g: 'tc_msl', mode: 'tc_mode', brk: 'tc_brake', alt: 'tc_alt' };
  const labelOf = (k, id) => id === 'fire' ? FIRE_SVG : id === 'g1' ? '25' : id === 'g2' ? '40' : id === 'g3' ? '105' : k === 'veh' && id === 'ads' ? Tt('tc_zoom') + '<br>AGM' : Tt(LBL[id]);
  const ed = document.createElement('div'); ed.id = 'ftedit'; ed.className = 'off'; stage.appendChild(ed);
  const E = { k: 'foot', sel: null, drag: null };
  function edOpen() {
    CWp = stage.clientWidth; CHp = stage.clientHeight; readSafe(); u = unit();
    E.k = kindOf(); E.sel = null; ed.classList.remove('off'); edRender();
    const pm = document.querySelector('#fpspause'); if (pm) pm.classList.add('off');   // menu jeda disembunyikan selama mengedit
  }
  function edClose() {
    ed.classList.add('off'); save(); layoutVer++; sig = '';
    const pm = document.querySelector('#fpspause'); if (pm && M.pause) pm.classList.remove('off');
  }
  function barHTML() {
    const q = E.sel ? posOf(E.k, E.sel) : null;
    return (q ? '<label>' + Tt('tc_ed_size') + ' <input type="range" min="0.55" max="2" step="0.05" value="' + q[2] + '"></label>' : '<small>' + Tt('tc_ed_hint') + '</small>') +
      '<button data-x="reset" class="red">' + Tt('tc_reset') + '</button><button data-x="done" class="go">' + Tt('tc_done') + '</button>';
  }
  function edRender() {
    const k = E.k, kinds = ['foot', 'heli', 'veh', 'gs'];
    const jz = 'left:' + SA.l + 'px;top:' + CHp * .3 + 'px;width:' + (CWp - SA.l - SA.r) * .42 + 'px;height:' + (CHp * .7 - SA.b) + 'px';
    ed.innerHTML = '<div class="te-joy" style="' + jz + '"><span>' + Tt('tc_joy') + '</span></div>' +
      '<div class="te-bar" style="left:' + (SA.l + 8) + 'px;right:' + (SA.r + 8) + 'px;top:' + (SA.t + 8) + 'px">' +
      '<div class="te-tabs">' + kinds.map(x => '<button data-k="' + x + '" class="' + (x === k ? 'on' : '') + '">' + Tt('tc_k_' + x) + '</button>').join('') + '</div>' +
      '<div class="te-row">' + barHTML() + '</div></div>' +
      Object.keys(POS[k]).map(id => {
        const [cx, cy, d] = toPx(posOf(k, id));
        return '<button class="tbtn' + (id === 'fire' ? ' fire' : '') + (id === E.sel ? ' sel' : '') + '" data-id="' + id + '" style="left:' + (cx - d / 2) + 'px;top:' + (cy - d / 2) + 'px;width:' + d + 'px;height:' + d + 'px;font-size:' + fsz(labelOf(k, id), d) + 'px">' + labelOf(k, id) + '</button>';
      }).join('');
  }
  function edStore(id, cx, cy, d) {   // piksel → satuan u relatif pojok area aman (kanan-bawah, atau kiri-bawah untuk tombol kiri)
    const k = E.k, L = POS[k][id][3], r = d / 2;
    cx = clamp(cx, SA.l + r, CWp - SA.r - r); cy = clamp(cy, SA.t + r, CHp - SA.b - r);
    (CFG.pos[k] = CFG.pos[k] || {})[id] = [+((L ? cx - SA.l : CWp - SA.r - cx) / u).toFixed(3), +((CHp - SA.b - cy) / u).toFixed(3), +(d / u).toFixed(3)];
  }
  function edPlace(id) {
    const el = ed.querySelector('button[data-id="' + id + '"]'), [px, py, d] = toPx(posOf(E.k, id)); if (!el) return;
    el.style.width = el.style.height = d + 'px'; el.style.left = (px - d / 2) + 'px'; el.style.top = (py - d / 2) + 'px'; el.style.fontSize = fsz(el.innerHTML, d) + 'px';
  }
  ed.addEventListener('pointerdown', e => {
    const t = e.target.closest('button[data-id]'); if (!t) return; e.preventDefault();
    const id = t.dataset.id, r0 = stage.getBoundingClientRect(), [cx, cy, d] = toPx(posOf(E.k, id));
    E.drag = { id, ox: e.clientX - r0.left - cx, oy: e.clientY - r0.top - cy, d, moved: false, x0: e.clientX, y0: e.clientY };
    try { ed.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
    if (E.sel !== id) { E.sel = id; ed.querySelectorAll('button[data-id]').forEach(b => b.classList.toggle('sel', b.dataset.id === id)); ed.querySelector('.te-row').innerHTML = barHTML(); }
  });
  ed.addEventListener('pointermove', e => {
    const D = E.drag; if (!D) return; e.preventDefault();
    if (!D.moved && Math.hypot(e.clientX - D.x0, e.clientY - D.y0) < 6) return; D.moved = true;
    const r0 = stage.getBoundingClientRect();
    edStore(D.id, e.clientX - r0.left - D.ox, e.clientY - r0.top - D.oy, D.d); edPlace(D.id);
  });
  const edUp = () => { E.drag = null; };
  ed.addEventListener('pointerup', edUp); ed.addEventListener('pointercancel', edUp);
  ed.addEventListener('input', e => {
    if (!E.sel || e.target.type !== 'range') return;
    const [cx, cy] = toPx(posOf(E.k, E.sel)); edStore(E.sel, cx, cy, +e.target.value * u); edPlace(E.sel);
  });
  ed.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.id) return;
    if (b.dataset.k) { E.k = b.dataset.k; E.sel = null; edRender(); }
    else if (b.dataset.x === 'reset') { delete CFG.pos[E.k]; E.sel = null; edRender(); }
    else if (b.dataset.x === 'done') edClose();
  });

  TK.fpstouch = { tick, cfg: CFG, releaseAll, layout, ctxOf, bestTarget, posOf, edOpen, edClose };
})();
