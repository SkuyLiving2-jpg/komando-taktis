/* ============================================================
   FPS-AUDIO — pemutar suara: mengambil buffer dari fps-sfx.js lalu
   meletakkannya di dunia. Jarak bukan sekadar lebih pelan:
   udara memakan frekuensi tinggi, suara datang terlambat (340 m/dtk),
   makin jauh makin banyak gema daripada suara langsung, gema kota
   berbeda dari gema padang terbuka, mesin = loop menerus + Doppler,
   ledakan dekat membuat telinga berdenging sesaat.
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, F = TK.FPS, P = F.P;
  const { clamp } = TK.util;
  let ctx = null, bus = null, master = null, muf = null, budget = 0, budgetT = 0, ambT = 2, beatT = 0, scanT = 0, envT = 0, urban = 0, rvO = null, rvU = null, rvOg = null, rvUg = null, deafT = 0, windOn = false;
  const SFX = () => TK.fpssfx, bank = {}, lastV = {}, lastAt = {};
  const mob = () => !!(F.opts && F.opts.mobile);
  /* v2.17 HP: speaker kecil & CPU lemah — volume master ×0,7, suara serentak dibatasi, limiter keras di ujung, gema lebih pendek,
     dan penjaga yang membangun ulang rantai bila keluaran rusak (NaN/diam) atau konteks terputus (telepon, notifikasi, tab latar) */
  const MV = () => F.opts.vol * (mob() ? .7 : 1);
  let nAct = 0, lim = null, comp = null, an = null, wdT = 0, wdBuf = null, resT = 0;

  /* ---------- bank: render per varian, yang belum siap dirender saat diminta, sisanya dicicil saat senggang ---------- */
  function varN(name) { const i = SFX().info(name); if (!i) return 0; return mob() ? Math.min(i.v, 2) : i.v; }
  const baseSr = () => mob() ? Math.min(ctx.sampleRate, 32000) : ctx.sampleRate;
  function toBuf(name, v, data, sr) { const b = bank[name] || (bank[name] = []), a = ctx.createBuffer(1, data.length, sr); a.copyToChannel ? a.copyToChannel(data, 0) : a.getChannelData(0).set(data); return (b[v] = a); }
  function getBuf(name, v) {
    const b = bank[name]; if (b && b[v]) return b[v];
    if (wk) return null;                                // Worker sedang merender: lewati sekali, jangan menahan frame
    const r = SFX().render(name, baseSr()); return r ? toBuf(name, v, r.data, r.sr) : null;
  }
  function nextBuf(name) {
    const n = varN(name); if (!n) return null;
    let v = Math.random() * n | 0; if (n > 1 && v === lastV[name]) v = (v + 1) % n;   // varian sama tidak berurutan → tidak seperti rekaman yang diulang
    for (let i = 0; i < n; i++) { const q = (v + i) % n, b = getBuf(name, q); if (b) { lastV[name] = q; return b; } }
    return null;
  }
  const WARM = ['m4', 'rifle', 'rifleE', 'rifleS', 'smg', 'pistol', 'lmg', 'sniper', 'shotgun', 'deagle', 'magnum', 'hit', 'head', 'kill', 'whiz', 'thud', 'boomS', 'boomM', 'step_g', 'step_d', 'step_c', 'step_s', 'imp_d', 'imp_c', 'imp_m', 'imp_f', 'slash', 'slashH', 'kcut', 'kdraw', 'ksheath', 'rail', 'cannon', 'rocket', 'boomL', 'lpWind', 'lpRotor', 'lpDiesel', 'lpJet'];
  let wk = null, wkLeft = 0, warmQ = null;
  /* sintesis di Web Worker: seluruh bank dirender di latar sejak klik pertama di menu */
  function startBank() {
    const jobs = []; for (const nm of WARM) for (let v = 0; v < varN(nm); v++) jobs.push([nm, v]); for (const nm of SFX().names) if (WARM.indexOf(nm) < 0) for (let v = 0; v < varN(nm); v++) jobs.push([nm, v]);
    try {
      const src = 'const o={};(' + SFX().src + ')(o);const S=o.sfx;onmessage=e=>{const m=e.data,r=S.render(m.n,m.sr);postMessage({n:m.n,v:m.v,sr:r.sr,d:r.data},[r.data.buffer]);};';
      wk = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); wkLeft = jobs.length;
      wk.onmessage = e => { const m = e.data; toBuf(m.n, m.v, m.d, m.sr); wkLeft--; };
      wk.onerror = () => { wk = null; warmQ = jobs.filter(q => !(bank[q[0]] && bank[q[0]][q[1]])); warm(); };
      const sr = baseSr(); for (const q of jobs) wk.postMessage({ n: q[0], v: q[1], sr });
    } catch (e) { wk = null; warmQ = jobs; warm(); }
  }
  function warm() {   // cadangan tanpa Worker: dicicil di thread utama
    const q = warmQ.shift(); if (!q) return; try { getBuf(q[0], q[1]); } catch (e) { /* lewati */ } setTimeout(warm, mob() ? 90 : 35);
  }

  /* ---------- gema: IR padang terbuka (pantulan tanah & bukit jauh) dan kota (tamparan dinding rapat) ---------- */
  function mkIR(len, early, tail, tone) {
    const sr = ctx.sampleRate, L = Math.floor(sr * len), b = ctx.createBuffer(2, L, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < L; i++) { const t = i / sr, k = Math.min(.95, tone + t * .55); lp = lp * k + (Math.random() * 2 - 1) * (1 - k); d[i] = lp * 2.2 * Math.exp(-t * tail) * Math.min(1, t / .018); }
      for (const [at, g] of early) { const i0 = Math.floor((at + (c ? at * .07 : 0)) * sr), n = Math.floor(.006 * sr); for (let i = 0; i < n && i0 + i < L; i++) d[i0 + i] += (Math.random() * 2 - 1) * g * (1 - i / n); }
    }
    return b;
  }
  function setupReverb() {
    try {
      rvO = ctx.createConvolver(); rvO.buffer = mob() ? mkIR(1.2, [[.11, .3], [.24, .3], [.46, .2], [.82, .12]], 3, .42) : mkIR(2.1, [[.11, .3], [.24, .34], [.46, .26], [.82, .17], [1.3, .1]], 2.3, .42); rvOg = ctx.createGain(); rvOg.gain.value = mob() ? .4 : .55; rvO.connect(rvOg); rvOg.connect(bus);
      if (!mob()) { rvU = ctx.createConvolver(); rvU.buffer = mkIR(1.5, [[.028, .55], [.05, .5], [.083, .42], [.13, .34], [.2, .24], [.31, .16]], 3.4, .3); rvUg = ctx.createGain(); rvUg.gain.value = 0; rvU.connect(rvUg); rvUg.connect(bus); }
    } catch (e) { rvO = rvU = null; }
  }

  function init() {
    if (ctx) { if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => { }); return ctx; }   // 'interrupted' (iOS) juga dipulihkan
    if (!SFX()) return null;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // pembatas puncak: tembakan menekan ambience seperti telinga & mikrofon, tanpa memompa
      master = ctx.createGain(); master.gain.value = MV();
      bus = ctx.createGain(); chain();
      setupReverb();
      startBank();
    } catch (e) { ctx = null; }
    return ctx;
  }
  function chain() {   // bus → lowpass (tuli ledakan) → master → kompresor → limiter → speaker; dipanggil ulang oleh penjaga bila rusak
    for (const n of [muf, comp, lim, an]) if (n) try { n.disconnect(); } catch (e) { /* ok */ }
    try { bus.disconnect(); master.disconnect(); } catch (e) { /* ok */ }
    // pembatas puncak: tembakan menekan ambience seperti telinga & mikrofon, tanpa memompa
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = mob() ? -14 : -10; comp.knee.value = 8; comp.ratio.value = mob() ? 6 : 10; comp.attack.value = .002; comp.release.value = mob() ? .22 : .16;
    lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .1;   // limiter: puncak tidak pernah pecah di speaker HP
    muf = ctx.createBiquadFilter(); muf.type = 'lowpass'; muf.frequency.value = 20000; muf.Q.value = .5;
    an = ctx.createAnalyser(); an.fftSize = 512; wdBuf = new Float32Array(512);
    bus.connect(muf); muf.connect(master); master.connect(comp); comp.connect(lim); lim.connect(ctx.destination); lim.connect(an);
  }
  function watchdog(dt) {   // keluaran NaN/Inf (filter meledak) = seluruh suara mati permanen → bangun ulang rantai & loop
    if ((wdT -= dt) > 0) return; wdT = 1;
    an.getFloatTimeDomainData(wdBuf); let bad = false; for (let i = 0; i < wdBuf.length; i += 8) if (!isFinite(wdBuf[i])) { bad = true; break; }
    if (!bad) return;
    for (const id in LV) { const v = LV[id]; try { v.s.stop(); } catch (e) { /* sudah */ } try { v.g.disconnect(); } catch (e) { /* ok */ } delete LV[id]; }
    try { if (rvO) rvO.disconnect(); if (rvOg) rvOg.disconnect(); if (rvU) rvU.disconnect(); if (rvUg) rvUg.disconnect(); } catch (e) { /* ok */ }
    bus = ctx.createGain(); chain(); setupReverb(); nAct = 0;
  }
  const ok = () => ctx && ctx.state === 'running' && F.opts.sound && (() => {
    const t = ctx.currentTime; if (t - budgetT > .1) { budgetT = t; budget = 0; } return ++budget < (mob() ? 12 : 26);
  })();
  const pan = p => { if (!ctx.createStereoPanner) return null; const n = ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); return n; };
  const panOf = (dx, dy, d) => d > 1 ? (-dx * Math.sin(P.yaw) + dy * Math.cos(P.yaw)) / d : 0;
  /* udara menyerap frekuensi tinggi: ±30 dB/km di 4 kHz → potongan turun cepat dengan jarak */
  const airLP = d => clamp(21000 * Math.exp(-d / 270), 480, 21000);

  /* play(name, {vol, pan, lp, wet, rate, delay}) */
  function play(name, o) {
    if (nAct >= (mob() ? 28 : 64) || (mob() && nAct >= 18 && (o.vol || 0) < .45)) return null;   // terlalu banyak suara serentak: yang pelan dilewati dulu
    const buf = nextBuf(name); if (!buf) return null;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = o.rate || 1; nAct++; s.onended = () => { nAct = Math.max(0, nAct - 1); };
    let n = s; if (o.lp && o.lp < 19000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = .4; n.connect(f); n = f; }
    const g = ctx.createGain(); g.gain.value = o.vol; n.connect(g);
    const pn = pan(o.pan || 0); if (pn) { g.connect(pn); pn.connect(bus); } else g.connect(bus);
    if (o.wet && rvO) {
      const k = ctx.createGain(); k.gain.value = o.wet; n.connect(k);
      if (rvU && urban > .5) k.connect(rvU); else k.connect(rvO);
    }
    s.start(ctx.currentTime + (o.delay || 0));
    return s;
  }

  /* ---------- nama lama → suara baru ---------- */
  const ALIAS = { reload2: null };
  /* banyak langkah: permukaan di bawah kaki pemain */
  function stepName() {
    const t = F.tAt ? F.tAt(P.x, P.y) & 15 : 0, TER = TK.WAR.TER;
    if (t === TER.URBAN || t === TER.ROAD || P.onRoof) return 'step_c';
    if (bioAt() === TK.WAR.BIO.DESERT) return 'step_s';
    return t === TER.FOREST ? 'step_g' : t === TER.HILL ? 'step_d' : 'step_g';
  }
  function bioAt() {
    const g = F.world && F.world.g, W = TK.WAR; if (!g || !g.bio) return 0;
    return g.bio[clamp(Math.floor(P.y / W.CELL), 0, W.GH - 1) * W.GW + clamp(Math.floor(P.x / W.CELL), 0, W.GW - 1)] || 0;
  }

  /* ---------- loop menerus: satu suara per id, dipilih yang terkeras tiap interval ---------- */
  const LV = {};
  function loopWant(id, name, k, p, lp, rate) {
    if (!ctx || ctx.state !== 'running' || !F.opts.sound) return;
    let v = LV[id];
    if (!v) {
      const buf = getBuf(name, 0); if (!buf) return;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 20000; f.Q.value = .4;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g);
      const pn = pan(0); if (pn) { g.connect(pn); pn.connect(bus); } else g.connect(bus);
      s.start(0, Math.random() * buf.duration); v = LV[id] = { s, f, g, pn, wk: 0, wp: 0, wl: 20000, wr: 1, t: 0, idle: 0 };
    }
    if (k >= v.wk) { v.wk = k; v.wp = p; v.wl = lp || 20000; v.wr = rate || 1; }
    v.t = ctx.currentTime;
  }
  function loopsTick(dt) {
    const now = ctx.currentTime;
    for (const id in LV) {
      const v = LV[id], live = now - v.t < .4, tgt = live ? v.wk : 0;
      v.g.gain.setTargetAtTime(tgt, now, live ? .07 : .22);
      v.f.frequency.setTargetAtTime(v.wl, now, .1); v.s.playbackRate.setTargetAtTime(v.wr, now, .06); if (v.pn) v.pn.pan.setTargetAtTime(clamp(v.wp, -1, 1), now, .06);
      v.wk = 0;
      v.idle = live ? 0 : v.idle + dt; if (v.idle > 1.5) { try { v.s.stop(); } catch (e) { /* sudah */ } v.g.disconnect(); delete LV[id]; }
    }
  }
  /* unit AI yang berbunyi: helikopter, jet, kendaraan, kapal, Clay Martin — diambil yang terdekat per kelas + Doppler */
  const NOENG = { INF: 1, SF: 1, AT: 1, MORT: 1, MEDIC: 1, OPR: 1, CMDR: 1, WARLORD: 1 }, lastPos = new Map();
  function scanUnits(dt) {
    const Q = TK.war && TK.war.Q, UT = TK.WAR && TK.WAR.UT; if (!Q || !Q.units || !UT) return;
    let hel = null, hd = 1e9, jet = null, jd = 1e9, veh = null, vd = 1e9, cl = null, cd = 1e9;
    for (const u of Q.units) {
      if (u.dead || u.inV || u.ctl || u.struct || NOENG[u.type]) continue;
      const T = UT[u.type]; if (!T) continue;
      const d = Math.hypot(u.x - P.x, u.y - P.y);
      if (u.type === 'CLAY') { if (u.jpk > Q.t && d < cd) { cd = d; cl = u; } }
      else if (u.jet) { if (d < jd) { jd = d; jet = u; } }
      else if (u.fly || T.tc === 'A') { if (d < hd) { hd = d; hel = u; } }
      else if (d < vd) { vd = d; veh = u; }
    }
    const put = (id, nm, u, d, ref, vol, rb, far) => {
      if (!u || d > far) return;
      const dx = u.x - P.x, dy = u.y - P.y, pr = lastPos.get(id), r = d; let dop = 1;
      if (pr && pr.u === u && dt > 0) dop = clamp(340 / (340 + clamp((r - pr.d) / dt, -300, 300)), .7, 1.5);
      lastPos.set(id, { u, d: r });
      loopWant(id, nm, vol / (1 + d / ref), panOf(dx, dy, d), airLP(d), rb * dop);
    };
    put('aiH', 'lpRotor', hel, hd, 90, .9, 1, 1500);
    put('aiJ', 'lpJet', jet, jd, 170, 1, 1, 2600);
    put('aiC', 'lpClay', cl, cd, 110, 1, 1, 1800);
    if (veh) { const T = UT[veh.type], big = T.armor === 'heavy' || T.sz > 1, sea = T.dom === 'S', mv = veh.path && veh.path.length > 0; put('aiV', 'lpDiesel', veh, vd, 34, sea ? .5 : .55, sea ? .6 : big ? .8 : 1.1, 700); if (mv && big && !sea) put('aiT', 'lpTrack', veh, vd, 36, .45, 1, 500); }
    if (!cl) lastPos.delete('aiC');
  }

  /* ---------- API lama, kini lewat bank ---------- */
  const A = TK.fpsaudio = {
    init,
    local(name, vol, delay) {
      if (name === 'rotor') { if (ctx) loopWant('own', 'lpRotor', clamp((vol === undefined ? 1 : vol) * 1.25, 0, 1), 0, 9000, .8 + .25 * clamp(vol * 2, 0, 1)); return; }
      if (name === 'spin') { if (ctx) loopWant('spin', 'lpSpin', clamp(vol * .35, 0, .5), 0, 16000, .55 + .75 * clamp(vol, 0, 1)); return; }
      if (!ok()) return;
      if (name === 'step') name = stepName();
      if (ALIAS[name] === null) return;
      const v = vol === undefined ? 1 : vol;
      const big = /^(m4|rifle|rifleE|smg|lmg|sniper|shotgun|pistol|deagle|magnum|rocket|cannon|chain|rail|hellfire|gl40)$/.test(name);
      // tembakan sendiri: varian nada kecil, gema penuh (bising menyebar dari badan sendiri)
      play(name, { vol: v, pan: 0, wet: big ? (name === 'rifleS' ? .1 : .5 * v) : 0, rate: big ? 1 + (Math.random() - .5) * .02 : 1, delay });
    },
    at(name, x, y, vol) {
      if (name === 'rotor') { const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy); if (ctx) loopWant('exH', 'lpRotor', clamp((vol === undefined ? 1 : vol) * 1.1 / (1 + d / 90), 0, 1), panOf(dx, dy, d), airLP(d), 1); return; }
      if (!ok() || !varN(name)) return;
      const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy), v0 = vol === undefined ? 1 : vol;
      const k = clamp(v0 / (1 + d / 60), 0, 1) * (d < 2400 ? 1 : 0), wet = clamp(v0 * .7 / (1 + d / 260), 0, 1);   // suara langsung turun 1/d, gema tinggal lebih lama → jauh = bergema
      if (k < .008 && wet < .02) return;
      // beberapa prajurit menembak jenis sama dalam milidetik yang sama: lewati yang pelan
      const now = ctx.currentTime; if (k < .25 && now - (lastAt[name] || 0) < .018) return; lastAt[name] = now;
      const delay = d > 45 ? Math.min(5, d / 340) : 0;
      play(name, { vol: k, pan: panOf(dx, dy, d), lp: airLP(d), wet, rate: 1 + (Math.random() - .5) * .04, delay });
    },
    boom(x, y, size, cockpit) {   // cockpit: terdengar dari dalam pesawat (AC-130): tanpa jeda jarak, dan tidak membuat telinga operator berdenging
      if (!ok()) return;
      const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy), k = clamp(size / 11 / (1 + d / 190), 0, 1.15); if (k < .012) return;
      const nm = size < 6 ? 'boomS' : size < 16 ? 'boomM' : 'boomL', wet = clamp(size / 14 / (1 + d / 500), 0, 1), delay = d > 45 ? Math.min(6, d / 340) : 0;
      play(nm, { vol: k, pan: panOf(dx, dy, d), lp: clamp(airLP(d * .7), 240, 21000), wet, rate: .96 + Math.random() * .08, delay });
      if (!cockpit && d < 26 + size * 2.4 && size >= 5) A.deaf(clamp(size / 16 * (1 - d / (34 + size * 2.4)), .25, 1), delay);
    },
    /* telinga berdenging: dunia teredam lalu pulih; dipanggil ledakan sangat dekat */
    deaf(a, delay) {
      if (!ctx) return; const t = ctx.currentTime + (delay || 0); deafT = Math.max(deafT, t + 1.2 + a * 1.4);
      muf.frequency.cancelScheduledValues(t); muf.frequency.setTargetAtTime(lerpF(20000, 420, a), t, .012); muf.frequency.setTargetAtTime(20000, t + .35 + a * .7, .55 + a * .5);
      if (a > .55) play('tinn', { vol: a * .9, delay: delay || 0 });
    },
    eng(f, vol, x, y, jet) {   // mesin: f Hz & vol seperti sebelumnya; x,y = sumber di dunia (tanpa = di dalam kendaraan); jet = turbin
      if (!ctx || ctx.state !== 'running') return; let k = vol, p = 0, lp = 20000, id = 'eg';
      if (x !== undefined) { const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy); if (d > 1500) return; k = vol / (1 + d / 60); if (k < .012) return; p = panOf(dx, dy, d); lp = airLP(d); id = 'egX'; }
      else lp = jet ? 12000 : 4000;   // di dalam kabin: frekuensi tinggi teredam
      if (jet) loopWant(id + 'J', 'lpTurb', clamp(k * .95, 0, 1), p, lp, clamp(f / 500, .4, 2));
      else {
        loopWant(id, 'lpDiesel', clamp(k * 1.5, 0, 1), p, lp, clamp(f / 40, .5, 2.6));
        if (f < 80 && f > 42) loopWant(id + 'T', 'lpTrack', clamp(k * (f - 42) / 24, 0, .6), p, lp * 1.5, clamp(f / 52, .5, 1.8));
      }
    },
    /* peluru lewat: retakan gelombang N-nya dulu, baru desing; bunyi tembakan menyusul dari arah penembak (at → delay) */
    whiz(x, y) { if (!ok()) return; const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy) || 1; play('whiz', { vol: .5, pan: panOf(dx, dy, d) * .6, wet: .12, rate: .9 + Math.random() * .25 }); },
    /* uji: tingkat keluaran terakhir & loop aktif */
    _dbg() { if (!ctx) return null; if (!A._an) { A._an = ctx.createAnalyser(); A._an.fftSize = 2048; master.connect(A._an); } const d = new Float32Array(2048); A._an.getFloatTimeDomainData(d); let pk = 0, nan = 0; for (const v of d) { if (!isFinite(v)) nan++; pk = Math.max(pk, Math.abs(v)); } return { state: ctx.state, sr: ctx.sampleRate, pk: +pk.toFixed(4), nan, loops: Object.keys(LV), bank: Object.keys(bank).length, worker: !!wk, sisa: wk ? wkLeft : warmQ ? warmQ.length : -1 }; },
    /* dipanggil tiap frame: gema & angin, tingkat kota, dengung serangga, mesin AI, detak jantung */
    tick(dt, hpRatio, alive) {
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && F.opts.sound && (resT -= dt) <= 0) { resT = 1.5; ctx.resume().catch(() => { }); }   // terputus (telepon/notifikasi/tab latar): coba lanjutkan
      if (!ctx || ctx.state !== 'running' || !F.opts.sound) { if (ctx && master) master.gain.value = F.opts.sound ? MV() : 0; return; }
      master.gain.value = MV(); watchdog(dt);
      envT -= dt;
      if (envT <= 0) {   // kota: gema rapat · terbuka: gema lebar. Dievaluasi perlahan
        envT = .5; const cs = F.world && F.world.cities; let u = 0; if (cs) for (const c of cs) { const q = Math.hypot(c.x - P.x, c.y - P.y); if (q < 260) u = Math.max(u, clamp((260 - q) / 90, 0, 1)); }
        urban = u; const t = ctx.currentTime; if (rvOg && rvUg) { rvOg.gain.setTargetAtTime(.55 * (1 - u * .9), t, .6); rvUg.gain.setTargetAtTime(.72 * u, t, .6); }
      }
      if (alive) {
        const alt = Math.max(0, (P.z || 0) - (F.hAt ? F.hAt(P.x, P.y) : 0)), flying = P.chute || P.mnt || P.veh;   // angin: makin kuat di ketinggian & saat parasut
        loopWant('wind', 'lpWind', clamp(.075 + alt * .0012 + (P.chute ? .3 : 0), 0, .55) * (flying && !P.chute ? .5 : 1), 0, 9000, 1);
        if (!P.mnt && !P.veh && !P.chute && urban < .4 && bioAt() === TK.WAR.BIO.TROP && !nightNow()) loopWant('ins', 'lpInsect', .035, .15, 12000, 1);
      }
      scanT -= dt; if (scanT <= 0) { const q = scanT < -.5 ? .2 : .2 - scanT; scanT = .2; scanUnits(q); }
      loopsTick(dt);
      ambT -= dt;
      if (ambT <= 0) {   // pertempuran di kejauhan: rentetan & meriam dari arah acak
        ambT = 2.2 + Math.random() * 4.5; const a = Math.random() * 6.283, r = 900 + Math.random() * 1200, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r, q = Math.random();
        if (q < .22) A.at('arty', x, y, 1.5); else if (q < .3) A.at('cannon', x, y, 1.2);
        else if (q < .8) { const nm = Math.random() < .5 ? 'rifle' : 'rifleE', c = 2 + Math.random() * 6 | 0; for (let i = 0; i < c; i++) setTimeout(() => A.at(nm, x, y, 2.4), i * (80 + Math.random() * 45)); }
      }
      if (alive && hpRatio < .45) { beatT -= dt; if (beatT <= 0) { beatT = .55 + hpRatio * .7; A.local('heart', .75 * (1 - hpRatio) + .2); } }
    }
  };
  const nightNow = () => { const t = F.TOD && F.TOD[P.tod]; return !!(t && t.sun[1] < 0); };
  const lerpF = (a, b, k) => a * Math.pow(b / a, clamp(k, 0, 1));
})();
