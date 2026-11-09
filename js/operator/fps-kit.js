/* ============================================================
   FPS-KIT — lampiran senjata (attachment) & perk ala Call of Duty:
   MEJA SENJATA di markas sendiri ([E] di dekatnya) untuk memasang /
   melepas lampiran SEMUA senjata (v3.1: tab senjata, pratinjau 3D
   berputar dari renderer viewmodel, statistik beranimasi). Perk dipilih di menu PILIH KELAS
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
  for (const w in F.ATT_FOR) K.att[w] = [];
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
  const DEF = (w, a) => F.attDef ? F.attDef(w, a) : F.ATT[a];
  /* statistik efektif satu senjata dari daftar lampiran (murni — dipakai juga untuk pratinjau kartu yang disorot) */
  function build(id, list) {
    const d = Object.assign({}, BASE[id]); d.spread = BASE[id].spread.slice(); if (BASE[id].shl) d.shl = BASE[id].shl.slice();
    for (const a of list) {
      const def = DEF(id, a); if (!def) continue; const m = def.m;
      for (const k in m) {
        const v = m[k];
        if (v && v.set !== undefined) d[k] = Array.isArray(v.set) ? v.set.slice() : v.set;
        else if (Array.isArray(v)) d[k] = (d[k] || v.map(() => 1)).map((x, i) => x * v[i]);
        else { const b = d[k] === undefined ? 1 : d[k]; d[k] = k === 'mag' || k === 'res' ? Math.max(1, Math.round(b * v)) : b * v; }
      }
      d.opt = d.opt || def.opt;
    }
    return d;
  }
  F.kitStats = build;
  F.perksSel = () => K.perks.slice(0, F.kitLim().perk);   // pilihan di menu kelas
  F.perksOn = () => (P.perks || []).slice(0, F.kitLim().perk);   // yang berlaku: disalin dari pilihan saat terjun (F.spawn)
  F.hasAtt = (id, w) => F.attOn(w).includes(id);
  F.hasPerk = id => F.perksOn().includes(id);

  /* statistik efektif: salinan dasar + pengubah tiap lampiran aktif. refill = isi penuh amunisi senjata yang dipegang */
  let sig = '';
  const kSig = () => Q.diff + '|' + Object.keys(K.att).map(w => F.attOn(w).join()).join(';') + '|' + F.perksOn().join();   // berubah = hitung ulang statistik (bukan tiap frame)
  F.applyKit = function (refill) {
    fresh();
    for (const id in BASE) F.WEAPONS[id] = build(id, F.attOn(id));
    for (const w of P.w || []) {
      if (!w) continue; const d = F.WEAPONS[w.id];
      if (refill) { w.ammo = d.mag; w.res = d.res; w.dm = 0; } else { w.ammo = Math.min(w.ammo, d.mag); }
    }
    sig = kSig();
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
  const KM = { msg: '', pmsg: '', w: 'AR', hov: null, bars: {} };
  F.kitOn = false;
  F.benchUse = function () {
    if (!F.benchNear()) return false;
    F.kitOpen(); return true;
  };
  F.kitOpen = function () {
    F.kitOn = true; F.paused = true; KM.msg = ''; KM.hov = null; Object.assign(F.in, { fire: false, ads: false, f: 0, b: 0, l: 0, r: 0, sprint: false, press: 0 });
    const cw = P.w && P.w[P.cur]; KM.w = cw && F.ATT_FOR[cw.id] ? cw.id : (P.w && P.w[0] && F.ATT_FOR[P.w[0].id] ? P.w[0].id : 'AR');
    if (el) { render(); el.classList.remove('off'); spin(); }
    if (doc && doc.pointerLockElement) doc.exitPointerLock();
    A() && A().local('switch', .6);
  };
  F.kitClose = function () {
    if (!F.kitOn) return; F.kitOn = false; F.paused = false; if (el) el.classList.add('off');
    if (TK.fpsui && TK.fpsui.lock) TK.fpsui.lock();
  };
  /* pasang / lepas: satu per kelompok (optik, magasin, …) — lampiran sekelompok diganti; penuh = tolak dengan pesan */
  F.kitToggle = function (a, w) {
    w = w || 'AR'; const L = K.att[w] = K.att[w] || [], lim = F.kitLim().att, i = L.indexOf(a);
    if (!DEF(w, a)) return false;
    if (i >= 0 && i < lim) { L.splice(i, 1); KM.msg = Tt('f_kit_msg_rm', { a: Tt('f_att_' + a) }); }
    else {
      if (i >= 0) L.splice(i, 1);   // tersimpan tapi tidak aktif di mode ini: naikkan ke depan
      const on = L.slice(0, lim), same = on.find(b => DEF(w, b).g === DEF(w, a).g);
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
  F.kitClear = function (w) { K.att[w || KM.w] = []; save(); F.applyKit(true); KM.msg = Tt('f_kit_msg_clear'); };

  /* statistik pembanding: standar (abu) vs dengan lampiran (hijau = lebih baik, merah = lebih buruk); garis putus = pratinjau kartu yang disorot.
     Lebar batang relatif terhadap senjata standar (standar = 50%) supaya senjata apa pun terbaca sama; angka di kanan = nilai sebenarnya */
  const ACC = w => 1 / Math.max(.05, w.spread[0] * .55 + w.spread[1] * 3), RL = w => (w.shl ? F.sgPlan(w, false, w.mag).dur : w.rel) * (w.dual ? (1 + w.dual) / 2 : 1);
  function rows(id, d) {
    const b = BASE[id], r = (k, v0, v1, t, inv) => [k, inv ? v1 / v0 : v0 / v1, t];   // rasio standar/efektif → posisi
    const L = [['dmg', b.dmg * (b.pellets || 1), d.dmg * (d.pellets || 1), Math.round(d.dmg * (d.pellets || 1))], ['rng', b.rng1, d.rng1, Math.round(d.rng1) + ' m'], ['acc', ACC(b), ACC(d), ''], ['ctl', 1 / b.kick, 1 / d.kick, ''],
      ['mob', b.mv, d.mv, ''], ['ads', b.ads, d.ads, ''], ['rpm', b.rpm, d.rpm, Math.round(d.rpm) + (d.mode === 'auto' && b.mode !== 'auto' ? ' AUTO' : '')], ['mag', b.mag, d.mag, d.mag + ' / ' + d.res], ['rel', 1 / RL(b), 1 / RL(d), RL(d).toFixed(2) + ' s'],
      ['zoom', 1 / b.zoom, 1 / d.zoom, (1 / d.zoom).toFixed(1) + '×']];
    if (b.blast) L.splice(1, 0, ['blast', b.blast, d.blast, d.blast.toFixed(1) + ' m'], ['vel', b.rspd, d.rspd, Math.round(d.rspd) + ' m/s']);
    return L.map(([k, v0, v1, t]) => ({ k, w: clamp(.5 * v1 / v0, .04, 1), t }));
  }
  function statsHTML() {
    const id = KM.w, d = build(id, F.attOn(id)), now = rows(id, d), hv = KM.hov ? rows(id, build(id, hovList(KM.hov))) : null;
    return now.map((q, i) => {
      const a = .5, c = q.w, lo = Math.min(a, c), hi = Math.max(a, c), up = c > a + 1e-3, dn = c < a - 1e-3, h = hv && hv[i];
      const old = KM.bars[id + q.k];   // posisi lama: batang beranimasi dari sana (render ulang menggambar lebar lama dulu, lalu transisi CSS)
      return '<div class="kt-st"><span>' + Tt('f_ks_' + q.k) + '</span><div class="kt-bar"><i class="base" style="width:50%"></i>' +
        '<i class="d ' + (up ? 'up' : dn ? 'dn' : '') + '" data-to="' + (lo * 100).toFixed(1) + ',' + ((hi - lo) * 100).toFixed(1) + '" style="left:' + (old ? old[0] : lo * 100).toFixed(1) + '%;width:' + (old ? old[1] : (hi - lo) * 100).toFixed(1) + '%"></i>' +
        (h && Math.abs(h.w - c) > 1e-3 ? '<i class="pv ' + (h.w > c ? 'up' : 'dn') + '" style="left:' + (Math.min(h.w, c) * 100).toFixed(1) + '%;width:' + (Math.abs(h.w - c) * 100).toFixed(1) + '%"></i>' : '') +
        '<i class="tick" style="left:' + (c * 100).toFixed(1) + '%"></i></div><b>' + q.t + '</b></div>';
    }).join('');
  }
  /* daftar lampiran bila kartu a diklik (untuk pratinjau sorot) — logika sama dengan F.kitToggle */
  function hovList(a) {
    const w = KM.w, L = (K.att[w] || []).slice(), lim = F.kitLim().att, i = L.indexOf(a), on = L.slice(0, lim);
    if (i >= 0 && i < lim) return on.filter(b => b !== a);
    const same = on.find(b => DEF(w, b).g === DEF(w, a).g), rest = on.filter(b => b !== same);
    return rest.length >= lim ? on : [a].concat(rest);
  }
  const GRP = ['opt', 'muz', 'barrel', 'under', 'rail', 'mag', 'side', 'ammo', 'wh', 'motor', 'load', 'trig', 'stock', 'grip'];
  const ICO = { opt: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 3v5M12 16v5M3 12h5M16 12h5', muz: 'M2 9h13v6H2zM15 7h7v10h-7zM17.5 7v10M20 7v10', barrel: 'M2 10h20v4H2z', under: 'M4 6h16v3H4zM10 9h4l1 11h-6z',
    rail: 'M3 8h18v8H3zM6 8v8M9 8v8M12 8v8M15 8v8M18 8v8', mag: 'M8 3h8l2 18h-8zM9 7h7', side: 'M5 4h4v16H5zM10 4h4v16h-4zM15 4h4v16h-4z', ammo: 'M9 21V9l3-6l3 6v12zM9 13h6',
    wh: 'M12 2l5 7v13H7V9zM7 13h10', motor: 'M8 2h8v14l-4 6l-4-6zM5 18l3-2M19 18l-3-2', load: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5', trig: 'M6 4h8v6l-3 10h-4l2-10H6z', stock: 'M2 8h14l6 3v6h-8l-3-4H2z', grip: 'M7 3h7l3 18H9z' };
  const icon = g => '<svg viewBox="0 0 24 24" class="kt-ic"><path d="' + (ICO[g] || ICO.rail) + '"/></svg>';
  function wname(id) { return (F.WNAME[TK.S && TK.S.doc] || F.WNAME.tni)[id] || id; }
  function html() {
    const lim = F.kitLim(), w = KM.w, on = F.attOn(w), dn = Tt('w_d' + Q.diff), mine = (P.w || []).filter(Boolean).map(x => x.id);
    const order = mine.filter(id => F.ATT_FOR[id]).concat(Object.keys(F.ATT_FOR).filter(id => !mine.includes(id)));
    const tabs = order.map((id, i) => { const n = F.attOn(id).length; return '<button class="kt-tab' + (id === w ? ' on' : '') + (mine.includes(id) ? ' mine' : '') + '" data-w="' + id + '" style="--i:' + i + '">' +
      (mine.includes(id) ? '<i>' + Tt(F.WEAPONS[id].slot ? 'f_kit_sec' : 'f_kit_pri') + '</i>' : '') + '<b>' + wname(id) + '</b>' + (n ? '<em>' + n + '</em>' : '') + '</button>'; }).join('');
    const list = F.ATT_FOR[w] || [];
    const groups = GRP.filter(g => list.some(a => DEF(w, a).g === g));
    let ci = 0;
    const cards = groups.map(g => '<div class="kt-sec"><h4>' + icon(g) + Tt('f_kg_' + g) + '</h4><div class="kt-grid">' + list.filter(a => DEF(w, a).g === g).map(a => {
      const st = on.includes(a) ? 'on' : (K.att[w] || []).includes(a) ? 'idle' : '', grp = on.find(b => b !== a && DEF(w, b).g === DEF(w, a).g);
      const ds = TK.LANG && (TK.LANG[TK.doc().lang] || {})['f_attd_' + w + '_' + a] !== undefined ? Tt('f_attd_' + w + '_' + a) : Tt('f_attd_' + a);
      return '<div class="kt-card ' + st + '" data-a="' + a + '" style="--i:' + (ci++) + '"><b>' + Tt('f_att_' + a) + '</b><small>' + ds + '</small><em>' +
        (st === 'on' ? Tt('f_kit_on') : st === 'idle' ? Tt('f_kit_idle') : grp ? Tt('f_kit_swap', { b: Tt('f_att_' + grp) }) : on.length >= lim.att ? Tt('f_kit_fullc') : Tt('f_kit_add')) + '</em></div>';
    }).join('') + '</div></div>').join('');
    const use = mine.includes(w) ? '' : '<div class="kt-note">' + Tt('f_kit_cls2', { w: wname(w) }) + '</div>';
    const slots = Array.from({ length: lim.att }, (_, i) => on[i] ? '<span class="on">' + Tt('f_att_' + on[i]) + '</span>' : '<span class="none">' + Tt('f_kit_slot') + '</span>').join('');
    return '<div class="fm-box kt kt2"><div class="fm-head"><div><h2>' + Tt('f_kit_title') + '</h2><small>' + Tt('f_kit_sub') + '</small></div><div class="fm-rank">' + Tt('f_kit_mode', { d: dn }) +
      '<br><b>' + on.length + '/' + lim.att + '</b> ' + Tt('f_kit_att_n') + '</div></div>' +
      '<div class="kt-tabs">' + tabs + '</div>' +
      '<div class="fm-cols"><div class="fm-col kt-left"><div class="kt-stage"><canvas class="kt-cv"></canvas><div class="kt-wn">' + wname(w) + '</div><div class="kt-hint">' + Tt('f_kit_drag') + '</div></div>' +
      '<div class="kt-chips">' + slots + '</div>' + use + '<h3>' + Tt('f_kit_stats') + '</h3><div class="kt-stats">' + statsHTML() + '</div>' +
      '<div class="kt-note">' + Tt('f_kit_pk_where') + '</div></div>' +
      '<div class="fm-col kt-right"><h3>' + Tt('f_kit_att_h') + '</h3>' + cards + '<div class="fm-btns"><button data-x="clear" class="red">' + Tt('f_kit_clear') + '</button></div></div></div>' +
      '<div class="fm-foot"><div class="ar-msg">' + String(KM.msg).replace(/</g, '&lt;') + '</div><button class="fm-go" data-x="close">' + Tt('f_kit_close') + '</button><small>' + Tt('f_kit_foot') + '</small></div></div>';
  }
  /* batang statistik: lebar lama → baru (transisi CSS) */
  function settle() {
    if (!el) return; const ids = KM.w, now = rows(ids, build(ids, F.attOn(ids)));
    requestAnimationFrame(() => el.querySelectorAll('.kt-bar i.d').forEach((e, i) => { const [l, w] = e.dataset.to.split(',').map(Number); e.style.left = l + '%'; e.style.width = w + '%'; if (now[i]) KM.bars[ids + now[i].k] = [l, w]; }));
  }
  /* pratinjau 3D: senjata berlampiran berputar pelan di meja (TK.fpsvm.preview), bisa diputar dengan seret */
  const SP = { a: 0, drag: null, off: 0, t0: 0, raf: 0 };
  function spin() {
    if (!el || SP.raf) return;
    const loop = t => {
      SP.raf = 0; if (!F.kitOn) return;
      const cv = el.querySelector('.kt-cv');
      if (cv && TK.fpsvm && TK.fpsvm.preview) {
        const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const dt = SP.t0 ? Math.min(.05, (t - SP.t0) / 1000) : 0; SP.t0 = t; if (!SP.drag) SP.a += dt * .35;
        const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
        try { TK.fpsvm.preview(ctx, W, H, KM.w, F.attOn(KM.w), -Math.PI / 2 + Math.sin(SP.a) * .55 + SP.off, .06 + Math.sin(SP.a * .7) * .05); } catch (e) { /* pratinjau opsional */ }
      }
      SP.raf = requestAnimationFrame(loop);
    };
    SP.raf = requestAnimationFrame(loop);
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
    if (!el) return; const box = el.querySelector('.fm-box'), keep = box ? box.scrollTop : 0, rc = el.querySelector('.kt-right'), kr = rc ? rc.scrollTop : 0, tb = el.querySelector('.kt-tabs'), kt = tb ? tb.scrollLeft : 0;
    el.innerHTML = html(); const b2 = el.querySelector('.fm-box'); if (b2) b2.scrollTop = keep;
    const r2 = el.querySelector('.kt-right'); if (r2) r2.scrollTop = kr; const t2 = el.querySelector('.kt-tabs'); if (t2) t2.scrollLeft = kt;
    settle();
  }
  function restats() { const s = el && el.querySelector('.kt-stats'); if (s) { s.innerHTML = statsHTML(); settle(); } }
  if (el) el.addEventListener('click', e => {
    const t = e.target.closest('[data-a],[data-x],[data-w]'); if (!t) return;
    const d = t.dataset;
    if (d.x === 'close') { F.kitClose(); return; }
    if (d.w) { if (d.w !== KM.w) { KM.w = d.w; KM.hov = null; KM.msg = ''; SP.off = 0; } }
    else if (d.x === 'clear') F.kitClear(KM.w);
    else if (d.a) { KM.hov = null; if (F.kitToggle(d.a, KM.w)) { A() && A().local('reload', .5); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } else A() && A().local('empty', .5); }
    A() && A().local('ui', .5); render();
  });
  if (el) {   // sorot kartu = pratinjau perubahan statistik; seret kanvas = putar senjata
    el.addEventListener('mouseover', e => { const c = e.target.closest('.kt-card[data-a]'); const a = c ? c.dataset.a : null; if (a !== KM.hov) { KM.hov = a; restats(); } });
    el.addEventListener('mouseleave', () => { if (KM.hov) { KM.hov = null; restats(); } });
    el.addEventListener('pointerdown', e => { if (e.target.classList && e.target.classList.contains('kt-cv')) { SP.drag = { x: e.clientX, o: SP.off }; try { e.target.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } } });
    el.addEventListener('pointermove', e => { if (SP.drag) SP.off = SP.drag.o + (e.clientX - SP.drag.x) * .012; });
    el.addEventListener('pointerup', () => { SP.drag = null; }); el.addEventListener('pointercancel', () => { SP.drag = null; });
  }

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
    if (kSig() !== sig) F.applyKit(false);   // tingkat kesulitan berganti: batas berubah
    const V = F.PERK.vult;
    for (let i = F.drops.length - 1; i >= 0; i--) {
      const d = F.drops[i]; d.t += dt;
      if (d.t > V.life) { F.drops.splice(i, 1); continue; }
      if (P.alive && !P.veh && !P.mnt && Math.hypot(P.x - d.x, P.y - d.y) < V.r && Math.abs(P.z - F.hAt(d.x, d.y)) < 3) { F.drops.splice(i, 1); pickup(d); }
    }
  };
})();
