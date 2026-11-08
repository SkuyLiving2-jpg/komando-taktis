/* ============================================================
   FPS-SFX — pustaka suara prosedural (tanpa WebAudio, murni angka,
   bisa diuji di Node). Tiap suara dirender sekali ke Float32Array
   dari model fisikanya lalu diputar ulang oleh fps-audio.js:
   - tembakan: gelombang Friedlander di moncong + retakan supersonik
     + semburan gas + dentum tubuh + resonansi logam + siklus baut,
     pantulan tanah (comb) dan saturasi mikrofon
   - logam: mode getar teredam (bukan osilator kotak)
   - ledakan: gelombang kejut + gemuruh bergulung + hujan puing
   - mesin / rotor / angin: loop tanpa sambungan
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK = window.TK || {};
  /* factory dapat dijalankan di Web Worker (fps-audio memakai sumbernya): sintesis tidak mengganggu frame game */
  function factory(out) {
  const TAU = Math.PI * 2;
  let SR = 44100;
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];

  /* ---------- filter keadaan-variabel (TPT): stabil walau frekuensi berubah cepat ---------- */
  function SVF() { let a = 0, b = 0, g = 0, r = 1, h = 1; return { set(f, q) { g = Math.tan(Math.PI * Math.min(f, SR * .45) / SR); r = 1 / q; h = 1 / (1 + r * g + g * g); }, run(x, m) { const hp = (x - (r + g) * a - b) * h, bp = g * hp + a, lp = g * bp + b; a = g * hp + bp; b = g * bp + lp; return m === 0 ? lp : m === 1 ? bp : hp; } }; }
  const MODE = { lp: 0, bp: 1, hp: 2 };

  /* semburan noise: f = [awal, akhir] Hz (eksponensial), a = serangan, d = peluruhan (dtk), gate = potong acak (kain, kerikil, api) */
  function N(o, p) {
    const i0 = (p.at || 0) * SR | 0, dur = p.dur || (p.d || .05) * 6, n = Math.min(dur * SR | 0, o.length - i0); if (n <= 0) return;
    const a = p.a || .0004, d = p.d || dur / 4, g = p.g === undefined ? 1 : p.g, m = MODE[p.t || 'lp'], f0 = (p.f && p.f[0]) || 3000, f1 = (p.f && p.f[1]) || f0, q = p.q || .7, fl = SVF(), gate = p.gate || 0; let k = 1, gt = 0;
    fl.set(f0, q);
    for (let i = 0; i < n; i++) {
      if (!(i & 15)) { const tt = i / n; fl.set(f0 * Math.pow(f1 / f0, tt), q); }
      const t = i / SR; let e = (1 - Math.exp(-t / a)) * Math.exp(-t / d) * Math.min(1, (n - i) / (.004 * SR));
      if (gate) { if (--gt <= 0) { gt = (rnd(.3, 1.7) * SR / gate) | 0; k = Math.random() < .62 ? rnd(.35, 1) : rnd(0, .12); } e *= k; }
      o[i0 + i] += fl.run(Math.random() * 2 - 1, m) * e * g;
    }
  }
  /* nada sinus teredam dengan geser frekuensi: mode getar logam, dentum tubuh */
  function T(o, p) {
    const i0 = (p.at || 0) * SR | 0, d = p.d || .05, dur = p.dur || d * 6, n = Math.min(dur * SR | 0, o.length - i0); if (n <= 0) return;
    const a = p.a || .0002, g = p.g === undefined ? 1 : p.g, f0 = p.f, f1 = p.f1 || f0, h = p.h || 0; let ph = p.ph || 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, f = f0 * Math.pow(f1 / f0, i / n); ph += TAU * f / SR;
      const e = (1 - Math.exp(-t / a)) * Math.exp(-t / d) * Math.min(1, (n - i) / (.002 * SR));
      let s = Math.sin(ph); if (h) for (let q = 2; q <= h; q++) s += Math.sin(ph * q) / (q * q * .8);
      o[i0 + i] += s * e * g;
    }
  }
  /* gelombang tekan Friedlander: lonjakan tajam, lalu fase hisap — bentuk nyata letusan moncong (Maher 2007) */
  function B(o, p) {
    const i0 = (p.at || 0) * SR | 0, Td = p.T || .002, b = p.b || 1.5, g = p.g === undefined ? 1 : p.g, n = Math.min(Td * 7 * SR | 0, o.length - i0);
    for (let i = 0; i < n; i++) { const t = i / SR; o[i0 + i] += (1 - t / Td) * Math.exp(-b * t / Td) * g; }
  }
  /* logam kecil beradu: 5 mode inharmonis (rasio pelat/batang), klik noise di depan */
  function C(o, at, f, d, g, n) {
    const R = [1, 1.47, 2.09, 2.83, 3.71]; n = n || 5;
    for (let i = 0; i < n; i++) T(o, { at, f: f * R[i] * rnd(.97, 1.03), d: d / (1 + i * .45), g: g * .42 / (1 + i * .5), ph: Math.random() * TAU });
    N(o, { at, t: 'hp', f: [f * 1.1], d: Math.min(.004, d * .5), g: g * .55 });
  }
  /* benturan polimer/kayu: redam cepat, tanpa dengung */
  function K(o, at, f, d, g) { T(o, { at, f, f1: f * .7, d, g: g * .8 }); T(o, { at, f: f * 2.3, d: d * .5, g: g * .28 }); N(o, { at, f: [f * 3], d: d * .55, g: g * .55 }); }
  /* gesek/seret: noise band + gerigi halus */
  const S = (o, at, f0, f1, dur, g, q) => N(o, { at, t: 'bp', f: [f0, f1], q: q || 2.2, a: .006, d: dur * .6, dur, g, gate: 180 });
  const CLOTH = (o, at, dur, g, f) => N(o, { at, t: 'bp', f: [f || 1200, (f || 1200) * .8], q: .7, a: dur * .25, d: dur * .4, dur, g, gate: 45 });
  const WH = (o, at, f0, f1, dur, g, q) => N(o, { at, t: 'bp', f: [f0, f1], q: q || 1.3, a: dur * .4, d: dur * .24, dur, g });

  /* ---------- pascaproses ---------- */
  function sat(o, drive) { const k = 1 / Math.tanh(drive); for (let i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * drive) * k; }
  function comb(o, sec, g) { const d = sec * SR | 0; for (let i = o.length - 1; i >= d; i--) o[i] += g * o[i - d]; }
  function hp(o, f) { const a = Math.exp(-TAU * f / SR); let y = 0, px = 0; for (let i = 0; i < o.length; i++) { const x = o[i]; y = a * (y + x - px); px = x; o[i] = y; } }
  function finish(o, peak, noFade) {
    let dc = 0, y = 0, m = 0;
    for (let i = 0; i < o.length; i++) { const x = o[i]; y = x - dc + .9985 * y; dc = x; o[i] = y; const v = Math.abs(y); if (v > m) m = v; }   // buang DC (Friedlander punya komponen DC)
    if (!(m > 1e-6)) return o; const g = peak / m; for (let i = 0; i < o.length; i++) o[i] *= g;
    if (noFade) return o;
    const fd = Math.min(o.length, .006 * SR | 0); for (let i = 0; i < fd; i++) o[o.length - 1 - i] *= i / fd;
    return o;
  }
  /* loop tanpa sambungan: ekor disilang ke awal; panjang buffer = dur + xf saat merender */
  function loopify(o, xfSec) {
    const X = xfSec * SR | 0, L = o.length - X, r = new Float32Array(L); for (let i = 0; i < L; i++) r[i] = o[i];
    for (let i = 0; i < X; i++) { const k = i / X; r[i] = o[i] * Math.sqrt(k) + o[L + i] * Math.sqrt(1 - k); }
    return r;
  }

  /* ---------- TEMBAKAN ---------- */
  function gun(p) {
    return { v: p.v || 4, dur: p.dur || .5, peak: p.peak || .98, fn(o) {
      const j = rnd(.965, 1.035);
      B(o, { T: p.T * j, g: .5 });                                                    // letusan moncong
      N(o, { t: 'hp', f: [p.cf || 1300], d: p.T * 1.3, g: p.crk === undefined ? .9 : p.crk });   // retakan pita lebar
      N(o, { f: [p.bf * j, p.bf * .2], q: .75, d: p.bd, g: (p.bg === undefined ? .8 : p.bg) * 1.5 });      // semburan gas mengembang
      N(o, { t: 'bp', f: [Math.max(900, p.bf * .5) * j, Math.max(420, p.bf * .16)], q: .75, d: p.bd * 1.9, g: (p.bg === undefined ? .8 : p.bg) * 1.5 });   // pita tengah: inilah "badan" tembakan di speaker laptop
      T(o, { f: p.lf * 1.25 * j, f1: p.lf1 * 1.5, d: p.ld * .7, g: p.lg * .4, h: 4 });  // dentum di dada + harmonik agar tetap terasa walau speaker kecil
      for (const r of p.res || []) T(o, { f: r[0] * rnd(.98, 1.02), d: r[1], g: r[2], ph: Math.random() * TAU });   // laras & badan senjata berdering
      if (p.tail) N(o, { f: [p.tail[0] * 1.3, p.tail[0] * .4], a: .006, d: p.tail[1], g: p.tail[2] * 1.5 });   // udara kembali mengisi: ekor pendek
      comb(o, rnd(.0024, .0034), .34);                                                 // pantulan tanah
      hp(o, p.hp || 75); sat(o, p.drive || 2.7);
      if (p.mech) p.mech(o, j);                                                        // mekanik setelah saturasi agar tetap jernih
    } };
  }
  /* ---------- pustaka ---------- */
  const RCP = {
    m4: gun({ T: .0011, crk: .95, cf: 1500, bf: 5400, bd: .011, bg: .75, lf: 172, lf1: 62, ld: .027, lg: .85, res: [[3900, .012, .05], [5300, .008, .05]], tail: [1800, .05, .1], dur: .42, mech(o, j) { C(o, .029, 3100 * j, .012, .17); T(o, { at: .031, f: 1610 * j, f1: 1470 * j, d: .03, g: .055 }); C(o, .058, 2250 * j, .013, .13); } }),
    rifle: gun({ T: .0013, crk: .85, cf: 1300, bf: 4600, bd: .013, bg: .8, lf: 160, lf1: 58, ld: .03, lg: .9, res: [[3400, .012, .05]], tail: [1500, .06, .12], dur: .42 }),
    rifleE: gun({ T: .0017, crk: .8, cf: 1100, bf: 3700, bd: .017, bg: .85, lf: 138, lf1: 52, ld: .036, lg: 1, res: [[2700, .014, .05]], tail: [1300, .07, .13], dur: .46, mech(o, j) { C(o, .031, 1720 * j, .021, .24); C(o, .068, 1260 * j, .021, .17); } }),
    rifleS: { v: 4, dur: .24, peak: .72, fn(o) { const j = rnd(.97, 1.03); B(o, { T: .00022, g: .34, at: .001 }); N(o, { t: 'bp', f: [1900 * j, 720], q: .9, d: .011, g: .62 }); N(o, { f: [850], d: .021, g: .34 }); T(o, { f: 245 * j, f1: 112, d: .012, g: .3 }); C(o, .021, 3050 * j, .012, .74); T(o, { at: .024, f: 1610 * j, f1: 1470 * j, d: .028, g: .1 }); C(o, .052, 2240 * j, .014, .58); } },
    smg: gun({ T: .0009, crk: .9, cf: 1500, bf: 4300, bd: .0085, bg: .8, lf: 212, lf1: 96, ld: .018, lg: .62, res: [[1160, .017, .1], [3200, .007, .05]], tail: [2000, .03, .08], dur: .26, peak: .88, mech(o, j) { C(o, .021, 2720 * j, .008, .14); } }),
    lmg: gun({ T: .0023, crk: .78, cf: 1000, bf: 3200, bd: .023, bg: .9, lf: 118, lf1: 46, ld: .052, lg: 1.12, res: [[2300, .016, .05]], tail: [1200, .09, .15], dur: .54, mech(o, j) { C(o, .036, 1500 * j, .021, .21); C(o, .052, 4700 * j, .009, .09); } }),
    sniper: gun({ T: .0033, crk: .95, cf: 950, bf: 2650, bd: .036, bg: 1, lf: 95, lf1: 33, ld: .095, lg: 1.32, res: [[1900, .02, .04]], tail: [850, .24, .28], dur: 1, drive: 3 }),
    shotgun: gun({ T: .0042, crk: .46, cf: 850, bf: 2300, bd: .042, bg: 1, lf: 88, lf1: 35, ld: .085, lg: 1.36, tail: [950, .12, .22], dur: .72, drive: 3, mech(o, j) { C(o, .058, 1800 * j, .021, .23); C(o, .103, 2240 * j, .015, .16); } }),
    pistol: gun({ T: .0009, crk: .9, cf: 1600, bf: 4900, bd: .0075, bg: .78, lf: 232, lf1: 106, ld: .016, lg: .56, res: [[2610, .012, .07]], tail: [2100, .03, .08], dur: .28, peak: .86, mech(o, j) { C(o, .018, 3420 * j, .01, .17); C(o, .041, 2620 * j, .008, .13); } }),
    deagle: gun({ T: .0024, crk: .9, cf: 1100, bf: 3050, bd: .021, bg: .9, lf: 130, lf1: 50, ld: .05, lg: 1.05, res: [[2200, .014, .05]], tail: [1250, .1, .14], dur: .55, mech(o, j) { C(o, .026, 2420 * j, .016, .21); } }),
    magnum: gun({ T: .0029, crk: 1, cf: 1250, bf: 3650, bd: .025, bg: .95, lf: 114, lf1: 43, ld: .062, lg: 1.15, res: [[3120, .021, .05]], tail: [1300, .14, .18], dur: .68 }),
    rocket: { v: 3, dur: 1.5, sr: 32000, peak: .95, fn(o) { B(o, { T: .003, g: .5 }); N(o, { f: [5200, 900], d: .12, g: 1.6 }); N(o, { t: 'bp', f: [1100, 480], q: .7, a: .03, d: .55, g: .85, gate: 70 }); T(o, { f: 118, f1: 56, d: .12, g: .4, h: 4 }); hp(o, 50); sat(o, 2); } },
    cannon: { v: 3, dur: 1.9, sr: 32000, peak: .98, fn(o) { B(o, { T: .006, g: .55 }); N(o, { f: [3600, 340], d: .14, g: 1.7 }); N(o, { t: 'bp', f: [850, 190], q: .6, a: .003, d: .24, g: 1.5, gate: 22 }); T(o, { f: 82, f1: 34, d: .2, g: .6, h: 4 }); N(o, { f: [620, 150], a: .02, d: .5, g: .4 }); C(o, .13, 620, .06, .16); hp(o, 40); sat(o, 2.5); } },
    arty: { v: 3, dur: 2.5, sr: 24000, peak: .92, fn(o) { B(o, { T: .008, g: .5 }); N(o, { f: [1900, 200], d: .26, g: 1.6 }); N(o, { t: 'bp', f: [520, 140], q: .55, a: .004, d: .42, g: 1.3, gate: 14 }); T(o, { f: 66, f1: 28, d: .36, g: .6, h: 4 }); hp(o, 34); sat(o, 2); } },
    bomb: { v: 2, dur: 1.5, sr: 32000, peak: .4, fn(o) { T(o, { f: 1300, f1: 280, a: .3, d: 1.1, g: .9, h: 3, dur: 1.45 }); N(o, { t: 'bp', f: [2600, 560], q: 3, a: .35, d: 1, g: .5, dur: 1.45 }); } },
    thud: { v: 4, dur: .42, peak: .8, fn(o) { T(o, { f: 128, f1: 62, d: .032, g: .55, h: 3 }); N(o, { f: [1250, 260], d: .04, g: 1.2 }); for (let i = 0; i < 5; i++) N(o, { at: rnd(.03, .24), f: [rnd(1400, 3200)], d: .006, g: rnd(.04, .15) }); sat(o, 1.8); } },
    zap: { v: 4, dur: .16, peak: .6, fn(o) { for (let i = 0; i < 9; i++) N(o, { at: rnd(0, .1), t: 'bp', f: [rnd(2600, 7000)], q: 2, d: rnd(.002, .008), g: rnd(.3, 1) }); T(o, { f: 120, f1: 60, d: .03, g: .28, h: 5 }); } },
    whine: { v: 2, dur: 3.5, sr: 24000, peak: .55, fn(o) { T(o, { f: 1450, f1: 170, a: .05, d: 1.5, g: .5, h: 3, dur: 3.45 }); N(o, { t: 'bp', f: [2300, 330], q: 1.1, a: .25, d: 1.4, g: .55, dur: 3.45 }); N(o, { f: [320, 180], a: .4, d: 1.3, g: .6, gate: 22, dur: 3.45 }); } },
    horn: { v: 1, dur: .4, peak: .34, fn(o) { for (const f of [418, 526]) T(o, { f, a: .012, d: 1, g: .5, h: 9, dur: .38 }); N(o, { t: 'bp', f: [1900], q: 1, a: .012, d: 1, g: .05, dur: .38 }); } },
    bounce: { v: 4, dur: .22, peak: .55, fn(o) { const f = rnd(1800, 2600); C(o, 0, f, .028, .8); T(o, { f: 320, f1: 180, d: .012, g: .45 }); N(o, { f: [900], d: .012, g: .28 }); } },
    /* tembakan kecil & berat dari kokpit */
    chain: { v: 3, dur: .42, peak: .82, fn(o) { const j = rnd(.97, 1.03); B(o, { T: .0016, g: .5 }); N(o, { f: [3800 * j, 520], d: .04, g: 1.5 }); N(o, { t: 'bp', f: [1000, 380], q: .7, d: .05, g: 1.1 }); T(o, { f: 165 * j, f1: 70, d: .04, g: .45, h: 4 }); hp(o, 60); sat(o, 2.2); C(o, .03, 900 * j, .03, .28); } },
    minigun: { v: 3, dur: .13, peak: .62, fn(o) { for (let i = 0; i < 3; i++) { const at = i * .0232; B(o, { at, T: .0008, g: .7 }); N(o, { at, t: 'bp', f: [1700, 800], q: .9, d: .012, g: .7 }); T(o, { at, f: 150, f1: 80, d: .014, g: .35 }); } sat(o, 1.8); } },
    gl40: { v: 3, dur: .22, peak: .66, fn(o) { T(o, { f: 152, f1: 68, d: .042, g: .95 }); N(o, { f: [900, 300], d: .022, g: .62 }); C(o, .012, 780, .018, .14); } },
    hellfire: { v: 2, dur: 1.5, sr: 32000, peak: .78, fn(o) { B(o, { T: .004, g: .7 }); N(o, { t: 'bp', f: [420, 2600], q: .7, a: .03, d: .55, g: .7, gate: 80, dur: 1.45 }); T(o, { f: 110, f1: 46, d: .22, g: .7 }); } },
    hydra: { v: 3, dur: .7, sr: 32000, peak: .6, fn(o) { B(o, { T: .002, g: .6 }); N(o, { t: 'bp', f: [850, 3000], q: .8, a: .01, d: .18, g: .75 }); T(o, { f: 160, f1: 66, d: .07, g: .55 }); } },
    flare: { v: 2, dur: .9, peak: .42, fn(o) { for (let i = 0; i < 4; i++) { const at = i * .065; B(o, { at, T: .0014, g: .6 }); N(o, { at, t: 'bp', f: [2400, 1500], q: 1.5, a: .01, d: .13, g: .6 }); } } },
    rail: { v: 3, dur: 1.1, sr: 44100, peak: .92, fn(o) { B(o, { T: .0006, g: 1.1 }); N(o, { t: 'hp', f: [3000], d: .018, g: 1 }); for (let i = 0; i < 14; i++) N(o, { at: rnd(0, .22), t: 'bp', f: [rnd(2500, 8000)], q: 2.4, d: rnd(.002, .007), g: rnd(.1, .4) }); T(o, { f: 1780, f1: 120, d: .05, g: .3 }); T(o, { f: 96, f1: 40, d: .1, g: .5, h: 4 }); N(o, { f: [2600, 300], a: .004, d: .19, g: 1.1 }); hp(o, 45); sat(o, 2.4); } },
    railC: { v: 1, dur: 1, peak: .22, fn(o) { T(o, { f: 165, f1: 2350, a: .1, d: 2, g: .55, h: 3, dur: .95 }); N(o, { t: 'bp', f: [420, 3400], q: 5, a: .2, d: 1.5, g: .28, dur: .95 }); } },

    /* ---------- reload & mekanik senjata ---------- */
    reload: { v: 3, dur: .3, peak: .2, fn(o) { CLOTH(o, 0, .26, 1, 1300); C(o, rnd(.08, .16), 3300, .006, .22); } },
    magout: { v: 3, dur: .2, peak: .5, fn(o) { C(o, 0, 3320, .006, .8); S(o, .008, 2100, 950, .055, .36); K(o, .062, 880, .018, .42); } },
    magin: { v: 3, dur: .16, peak: .68, fn(o) { K(o, 0, 900, .02, .95); C(o, .004, 2410, .01, .72); C(o, .052, 4210, .006, .44); } },
    boltrel: { v: 3, dur: .17, peak: .86, fn(o) { S(o, 0, 3100, 2300, .018, .35); C(o, .014, 1710, .03, 1); T(o, { at: .014, f: 262, f1: 138, d: .028, g: .5 }); C(o, .032, 3820, .008, .38); } },
    charge: { v: 2, dur: .34, peak: .72, fn(o) { C(o, 0, 3200, .006, .36); S(o, .004, 2650, 1500, .085, .52); C(o, .205, 1710, .028, 1); T(o, { at: .205, f: 242, d: .026, g: .36 }); } },
    slide: { v: 3, dur: .15, peak: .8, fn(o) { S(o, 0, 2500, 1900, .022, .35); C(o, .02, 2120, .022, 1); T(o, { at: .02, f: 332, f1: 178, d: .022, g: .4 }); } },
    cover: { v: 2, dur: .2, peak: .78, fn(o) { C(o, 0, 1310, .034, 1); T(o, { f: 182, f1: 90, d: .04, g: .5 }); } },
    shell: { v: 3, dur: .13, peak: .46, fn(o) { K(o, 0, 760, .012, .62); C(o, .001, 2920, .007, .5); C(o, .03, 1410, .012, .42); } },
    pump: { v: 2, dur: .32, peak: .68, fn(o) { S(o, 0, 1550, 920, .08, .7); C(o, .08, 1320, .016, .6); S(o, .17, 950, 1550, .04, .5); C(o, .205, 1920, .022, 1); } },
    pumpf: { v: 2, dur: .13, peak: .72, fn(o) { S(o, 0, 950, 1550, .03, .45); C(o, .026, 1920, .022, 1); } },
    boltup: { v: 2, dur: .09, peak: .46, fn(o) { C(o, 0, 3020, .01, 1); } },
    boltbk: { v: 2, dur: .15, peak: .52, fn(o) { S(o, 0, 1850, 1100, .075, .8); C(o, .07, 2520, .01, .65); } },
    boltfw: { v: 2, dur: .13, peak: .5, fn(o) { S(o, 0, 1250, 2000, .065, .8); C(o, .062, 2300, .012, .55); } },
    boltdn: { v: 2, dur: .13, peak: .58, fn(o) { C(o, 0, 2220, .016, 1); C(o, .06, 3420, .008, .55); } },
    tap: { v: 3, dur: .1, peak: .5, fn(o) { K(o, 0, 212, .018, 1); C(o, .001, 2620, .006, .36); } },
    tug: { v: 3, dur: .07, peak: .3, fn(o) { C(o, 0, 1920, .008, .8); CLOTH(o, 0, .05, .3, 1800); } },
    chback: { v: 2, dur: .13, peak: .5, fn(o) { C(o, 0, 3100, .006, .4); S(o, .003, 2650, 1500, .085, .55); } },
    chrel: { v: 2, dur: .13, peak: .78, fn(o) { C(o, 0, 1710, .026, 1); T(o, { f: 242, d: .024, g: .38 }); C(o, .021, 3620, .008, .34); } },
    cylout: { v: 2, dur: .15, peak: .52, fn(o) { C(o, 0, 2320, .012, .8); S(o, .03, 1400, 1100, .06, .34); } },
    cylin: { v: 2, dur: .13, peak: .68, fn(o) { C(o, 0, 1820, .018, 1); C(o, .03, 3920, .008, .46); } },
    casings: { v: 2, dur: .55, peak: .24, fn(o) { for (let i = 0; i < 6; i++) { const at = .02 + i * .05 + rnd(0, .03); C(o, at, rnd(3800, 5800), .022, rnd(.5, 1)); C(o, at + rnd(.02, .05), rnd(3800, 5800), .012, rnd(.2, .5)); } } },
    casing: { v: 5, dur: .3, peak: .15, fn(o) { const f = rnd(3600, 6200); C(o, 0, f, .024, 1, 4); C(o, rnd(.06, .11), f * rnd(.96, 1.04), .016, .55, 4); C(o, rnd(.14, .19), f * rnd(.96, 1.04), .01, .28, 3); } },
    speedl: { v: 2, dur: .2, peak: .42, fn(o) { C(o, 0, 2620, .009, .7); K(o, .1, 620, .014, .7); C(o, .102, 1520, .012, .6); } },
    belt: { v: 3, dur: .2, peak: .22, fn(o) { for (let i = 0; i < 5; i++) C(o, i * .034 + rnd(0, .008), rnd(3400, 5000), .012, rnd(.5, 1), 4); } },
    rocketld: { v: 2, dur: .36, peak: .62, fn(o) { S(o, 0, 620, 420, .2, .6); C(o, .25, 2000, .024, 1); T(o, { at: .25, f: 170, d: .03, g: .4 }); } },
    empty: { v: 2, dur: .06, peak: .36, fn(o) { C(o, 0, 3010, .006, 1); C(o, .012, 1910, .008, .6); } },
    switch: { v: 3, dur: .24, peak: .42, fn(o) { CLOTH(o, 0, .13, .8, 1400); C(o, .01, 2610, .009, .55); C(o, .125, 1420, .016, .72); } },

    /* ---------- KATANA ---------- */
    kdraw: { v: 2, dur: .55, peak: .62, fn(o) { const j = rnd(.97, 1.03); N(o, { t: 'bp', f: [3400 * j, 6400 * j], q: 4.5, a: .03, d: .16, dur: .34, g: 1 }); for (const [f, g] of [[5420, .09], [7310, .07], [8930, .05]]) T(o, { at: .03, f: f * j, f1: f * j * 1.03, a: .05, d: .17, g, dur: .46 }); C(o, .3, 6800 * j, .1, .3, 3); } },
    ksheath: { v: 2, dur: .32, peak: .6, fn(o) { const j = rnd(.97, 1.03); N(o, { t: 'bp', f: [5200 * j, 3100 * j], q: 4, a: .012, d: .09, dur: .22, g: .7 }); C(o, .225, 2240 * j, .028, 1); T(o, { at: .225, f: 280, f1: 160, d: .02, g: .3 }); } },
    slash: { v: 4, dur: .3, peak: .72, fn(o) { const j = rnd(.9, 1.12); WH(o, 0, 460 * j, 2900 * j, .15, 1, 1.5); WH(o, .1, 2900 * j, 620 * j, .17, 1, 1.5); N(o, { t: 'hp', f: [3600], a: .08, d: .05, dur: .22, g: .2 }); T(o, { f: 2100 * j, f1: 2600 * j, a: .08, d: .05, g: .028, dur: .2 }); } },
    slashH: { v: 3, dur: .5, peak: .84, fn(o) { const j = rnd(.94, 1.06); WH(o, 0, 240 * j, 1750 * j, .26, 1, 1.25); WH(o, .2, 1750 * j, 340 * j, .27, 1, 1.25); N(o, { f: [300], a: .12, d: .09, dur: .38, g: .4 }); N(o, { t: 'hp', f: [3200], a: .14, d: .07, dur: .34, g: .16 }); } },
    kcut: { v: 4, dur: .24, peak: .86, fn(o) { const j = rnd(.94, 1.06); N(o, { t: 'bp', f: [1250 * j, 310], q: 1, d: .036, g: 1.5 }); T(o, { f: 168 * j, f1: 84, d: .022, g: .4, h: 3 }); N(o, { t: 'hp', f: [2800], d: .018, g: .26 }); N(o, { at: .022, f: [760], d: .04, g: .26, gate: 120 }); } },
    kclang: { v: 3, dur: .85, peak: .78, fn(o) { const j = rnd(.97, 1.03); N(o, { t: 'hp', f: [2200], d: .004, g: .9 }); for (const [f, d, g] of [[2382, .24, .32], [3471, .18, .25], [4197, .14, .22], [5633, .1, .16], [7104, .07, .11]]) T(o, { f: f * j, d, g, ph: Math.random() * TAU }); } },

    /* ---------- umpan balik: ketukan kering, bukan bip ---------- */
    hit: { v: 4, dur: .07, peak: .42, fn(o) { C(o, 0, rnd(3400, 3750), .006, 1, 3); N(o, { f: [1100], d: .012, g: .55 }); } },
    head: { v: 2, dur: .24, peak: .46, fn(o) { for (const [f, d, g] of [[2912, .09, .5], [4310, .065, .34], [6120, .04, .2]]) T(o, { f, d, g }); N(o, { t: 'hp', f: [2800], d: .003, g: .55 }); } },
    kill: { v: 2, dur: .22, peak: .5, fn(o) { T(o, { f: 150, f1: 68, d: .05, g: .75 }); C(o, .012, 3560, .006, .55, 3); C(o, .082, 4210, .007, .5, 3); } },
    /* ---------- langkah per permukaan: tumit + tekstur + gesekan perlengkapan ---------- */
    step_g: { v: 6, dur: .24, peak: .46, fn(o) { T(o, { f: rnd(105, 130), f1: 70, d: .017, g: .32, h: 3 }); N(o, { f: [780], d: .02, g: .75 }); N(o, { at: .012, t: 'hp', f: [2400], a: .012, d: .05, g: .3, gate: 260 }); gear(o); } },
    step_d: { v: 6, dur: .22, peak: .48, fn(o) { T(o, { f: rnd(110, 136), f1: 76, d: .015, g: .34, h: 3 }); N(o, { f: [1100], d: .02, g: .8 }); N(o, { at: .01, t: 'bp', f: [1900], q: .7, a: .003, d: .03, g: .36, gate: 420 }); gear(o); } },
    step_c: { v: 6, dur: .2, peak: .5, fn(o) { T(o, { f: rnd(130, 158), f1: 96, d: .01, g: .3, h: 3 }); K(o, 0, rnd(470, 620), .009, .8); N(o, { t: 'bp', f: [2500], q: .9, d: .008, g: .5 }); N(o, { at: rnd(.045, .07), t: 'bp', f: [3200], q: .9, a: .002, d: .012, g: .2 }); gear(o); } },
    step_s: { v: 6, dur: .26, peak: .4, fn(o) { T(o, { f: rnd(96, 118), f1: 66, d: .014, g: .22, h: 3 }); N(o, { f: [2000, 900], a: .006, d: .05, g: .9, gate: 620 }); gear(o); } },
    jump: { v: 3, dur: .18, peak: .38, fn(o) { N(o, { f: [620], d: .018, g: .6 }); CLOTH(o, 0, .13, .55, 1100); C(o, rnd(.03, .07), 3300, .006, .16); } },
    land: { v: 3, dur: .32, peak: .78, fn(o) { T(o, { f: 112, f1: 58, d: .04, g: .5, h: 3 }); N(o, { f: [760, 280], d: .05, g: 1 }); CLOTH(o, .01, .18, .28, 1200); C(o, .036, 2720, .012, .28); C(o, .062, 1980, .012, .18); } },
    hurt: { v: 3, dur: .26, peak: .66, fn(o) { T(o, { f: 138, f1: 66, d: .035, g: .55, h: 3 }); N(o, { f: [1100, 300], d: .035, g: .95 }); C(o, .001, 1240, .012, .3); } },
    death: { v: 1, dur: 1.6, sr: 24000, peak: .66, fn(o) { for (const at of [0, .46, .98]) { T(o, { at, f: 62, f1: 40, d: .05, g: 1 - at * .5 }); T(o, { at: at + .16, f: 56, f1: 36, d: .05, g: .7 - at * .4 }); } N(o, { f: [380, 80], a: .1, d: .55, g: .34, dur: 1.55 }); } },
    pin: { v: 2, dur: .22, peak: .44, fn(o) { C(o, 0, 3020, .011, .8); T(o, { at: .012, f: 2210, d: .05, g: .15 }); C(o, .022, 4220, .011, .4); } },
    throw: { v: 3, dur: .3, peak: .4, fn(o) { WH(o, 0, 420, 1500, .25, 1, .9); CLOTH(o, 0, .16, .4, 1100); } },
    melee: { v: 3, dur: .26, peak: .46, fn(o) { WH(o, 0, 620, 2600, .22, 1, 1); } },
    splash: { v: 3, dur: .9, sr: 32000, peak: .72, fn(o) { T(o, { f: 138, f1: 58, d: .06, g: .5 }); N(o, { f: [2500, 420], d: .17, g: 1 }); bubbles(o, .05, .55, 22, .24); } },
    swim: { v: 3, dur: .55, sr: 32000, peak: .38, fn(o) { N(o, { t: 'bp', f: [850, 1850], q: .7, a: .08, d: .14, g: .9, gate: 110 }); bubbles(o, .05, .4, 8, .22); } },
    wade: { v: 4, dur: .34, sr: 32000, peak: .5, fn(o) { N(o, { f: [1500, 560], q: .6, a: .012, d: .07, g: .9, gate: 150 }); bubbles(o, .02, .24, 5, .24); } },
    chute: { v: 2, dur: .95, sr: 32000, peak: .54, fn(o) { N(o, { t: 'bp', f: [700, 1300], q: .6, a: .06, d: .3, g: 1, gate: 42, dur: .9 }); N(o, { at: .55, f: [420], d: .05, g: 1 }); T(o, { at: .55, f: 90, f1: 55, d: .05, g: .5 }); } },
    /* ---------- ledakan ---------- */
    boomS: boom(1.9, .008, 2200, .09, .32, 80, .3, 8),
    boomM: boom(3.2, .017, 1600, .15, .7, 62, .55, 18),
    boomL: boom(5.2, .03, 1050, .26, 1.3, 48, .9, 32),
    quake: { v: 1, dur: 4, sr: 16000, peak: .9, fn(o) { T(o, { f: 38, f1: 25, a: .6, d: 1.6, g: 1, dur: 3.9 }); N(o, { f: [170, 70], q: .6, a: .5, d: 1.4, g: 1.1, gate: 9, dur: 3.9 }); T(o, { at: .5, f: 56, f1: 30, a: .3, d: .9, g: .5, dur: 3 }); } },
    /* ---------- peluru lewat & hantaman ---------- */
    whiz: { v: 5, dur: .24, peak: .6, fn(o) { B(o, { T: .00028, g: 1 }); N(o, { t: 'hp', f: [2500], d: .0012, g: .8 }); N(o, { at: .004, t: 'bp', f: [rnd(4300, 6000), rnd(1200, 1900)], q: 2.4, a: .012, d: .05, g: .44, dur: .19 }); } },
    imp_d: { v: 5, dur: .3, peak: .5, fn(o) { T(o, { f: rnd(160, 210), f1: 92, d: .01, g: .3, h: 3 }); N(o, { f: [2100, 520], d: .024, g: 1 }); for (let i = 0; i < 6; i++) N(o, { at: rnd(.02, .2), f: [rnd(1800, 4200)], d: .004, g: rnd(.05, .18) }); } },
    imp_c: { v: 5, dur: .3, peak: .56, fn(o) { B(o, { T: .0003, g: .7 }); N(o, { t: 'bp', f: [3100, 1300], q: .8, d: .014, g: 1 }); K(o, 0, rnd(620, 820), .008, .6); for (let i = 0; i < 5; i++) N(o, { at: rnd(.02, .17), t: 'hp', f: [rnd(2500, 5000)], d: .003, g: rnd(.05, .17) }); } },
    imp_m: { v: 5, dur: .5, peak: .54, fn(o) { const f = rnd(1800, 3100); B(o, { T: .00028, g: .55 }); C(o, 0, f, .05, 1); if (Math.random() < .35) T(o, { at: .004, f: rnd(3400, 4400), f1: rnd(1500, 2100), d: .09, g: .22, dur: .3 }); } },
    imp_w: { v: 4, dur: .32, peak: .44, fn(o) { N(o, { f: [2100, 800], d: .04, g: .9 }); bubbles(o, .012, .24, 6, .26); } },
    imp_f: { v: 4, dur: .14, peak: .5, fn(o) { N(o, { f: [820, 280], d: .018, g: 1 }); T(o, { f: 132, f1: 72, d: .02, g: .66 }); } },
    /* ---------- pendukung ---------- */
    stim: { v: 1, dur: .46, peak: .5, fn(o) { C(o, 0, 3220, .007, .8); N(o, { at: .04, t: 'bp', f: [5000, 2500], q: 1.4, a: .012, d: .11, g: .5, dur: .36 }); T(o, { at: .05, f: 158, f1: 52, d: .08, g: .5 }); } },
    heart: { v: 1, dur: .34, peak: .55, fn(o) { T(o, { f: 62, f1: 40, d: .03, g: 1, dur: .15 }); T(o, { at: .17, f: 55, f1: 36, d: .03, g: .72, dur: .14 }); } },
    plate: { v: 2, dur: .45, peak: .62, fn(o) { K(o, 0, 330, .02, 1); T(o, { f: 140, f1: 78, d: .03, g: .5 }); N(o, { at: .12, t: 'bp', f: [2500, 1200], q: .9, a: .012, d: .07, g: .55, dur: .28, gate: 300 }); } },
    power: { v: 1, dur: .48, peak: .28, fn(o) { T(o, { f: 200, f1: 700, a: .03, d: .25, g: .7, h: 3, dur: .42 }); N(o, { t: 'bp', f: [900, 2600], q: 1.4, a: .04, d: .15, g: .5, dur: .42 }); } },
    /* ---------- komunikasi & alat: lewat speaker kecil, bukan nada murni ---------- */
    lock: { v: 1, dur: .15, peak: .15, fn(o) { spk(o, 0, 1250, .12); } },
    beep: { v: 1, dur: .19, peak: .13, fn(o) { spk(o, 0, 1320, .055); spk(o, .082, 1760, .07); } },
    tag: { v: 1, dur: .16, peak: .13, fn(o) { spk(o, 0, 1600, .05); spk(o, .062, 2100, .07); } },
    ui: { v: 2, dur: .05, peak: .13, fn(o) { C(o, 0, 2300, .005, 1, 3); N(o, { f: [1600], d: .004, g: .4 }); } },
    streak: { v: 1, dur: .42, peak: .2, fn(o) { radio(o, 0, .36); [760, 960, 1240].forEach((f, i) => spk(o, .055 + i * .08, f, .068)); } },
    obj: { v: 1, dur: .36, peak: .2, fn(o) { radio(o, 0, .3); spk(o, .05, 620, .09); spk(o, .15, 930, .11); } },
    spawn: { v: 1, dur: .32, peak: .2, fn(o) { radio(o, 0, .26); CLOTH(o, .03, .2, .3, 900); } },
    warn: { v: 1, dur: 1, peak: .24, fn(o) { for (let i = 0; i < 3; i++) spk(o, i * .3, i % 2 ? 620 : 980, .2); } },
    pulse: { v: 1, dur: .55, peak: .22, fn(o) { T(o, { f: 420, f1: 1260, a: .02, d: .15, g: .8, h: 2, dur: .46 }); } },
    laser: { v: 1, dur: .55, peak: .16, fn(o) { T(o, { f: 2420, f1: 2620, a: .02, d: .3, g: .3, dur: .5 }); T(o, { f: 300, f1: 900, a: .02, d: .2, g: .5, h: 4, dur: .42 }); } },
    laserCh: { v: 1, dur: 2.3, sr: 32000, peak: .3, fn(o) { T(o, { f: 90, f1: 1700, a: .3, d: 4, g: .6, h: 4, dur: 2.25 }); N(o, { t: 'bp', f: [400, 3000], q: 1.5, a: .5, d: 3, g: .5, dur: 2.2, gate: 140 }); } },
    satFall: { v: 1, dur: 5.4, sr: 32000, peak: .85, fn(o) { N(o, { t: 'bp', f: [240, 1300], q: .7, a: 2.2, d: .9, g: 1, dur: 3.1 }); N(o, { at: 1.5, t: 'bp', f: [620, 170], q: .8, a: .6, d: 1.1, g: 1.3, gate: 34, dur: 2.2 }); T(o, { at: 1.3, f: 58, f1: 36, a: .7, d: 1, g: .8, h: 5, dur: 2.5 }); N(o, { at: 3, t: 'hp', f: [1900], a: .05, d: .5, g: .28, gate: 60, dur: 1 }); } },
    satPanel: { v: 1, dur: 1.7, sr: 32000, peak: .55, fn(o) { C(o, 0, 1540, .05, .26); C(o, .03, 2360, .03, .14); N(o, { t: 'bp', f: [560], q: 2, a: .05, d: .85, g: .34, gate: 90, dur: 1.15 }); T(o, { f: 118, f1: 176, a: .1, d: .9, g: .22, h: 4, dur: 1.15 }); C(o, 1.2, 880, .09, .4); C(o, 1.23, 1760, .05, .22); N(o, { at: 1.2, f: [2400], d: .025, g: .55 }); } },
    satLink: { v: 1, dur: .95, sr: 32000, peak: .4, fn(o) { for (let i = 0; i < 16; i++) N(o, { at: rnd(0, .34), t: 'bp', f: [rnd(1400, 6000)], q: 3, d: rnd(.004, .016), g: rnd(.25, .7) }); [1180, 1770].forEach((f, i) => T(o, { at: .36 + i * .11, f, f1: f, a: .004, d: .09, g: .3, h: 2, dur: .15 })); } },
    laserHum: { v: 2, dur: .55, sr: 32000, peak: .26, fn(o) { T(o, { f: 74, f1: 67, a: .06, d: .3, g: .7, h: 6, dur: .5 }); N(o, { f: [1400], a: .05, d: .25, g: .45, gate: 200, dur: .5 }); } },
    nova: { v: 1, dur: 2, sr: 24000, peak: .8, fn(o) { B(o, { T: .012, g: .7 }); T(o, { f: 110, f1: 26, d: .55, g: 1.2, dur: 1.9 }); N(o, { f: [950, 110], d: .42, g: .9, dur: 1.75 }); T(o, { f: 2500, f1: 180, d: .28, g: .08, h: 4, dur: 1 }); } },
    /* ---------- CLAY MARTIN ---------- */
    jetign: { v: 2, dur: 1.5, sr: 32000, peak: .92, fn(o) { B(o, { T: .005, g: .5 }); N(o, { f: [4200, 420], d: .2, g: 1.6 }); T(o, { f: 100, f1: 42, d: .14, g: .5, h: 4 }); N(o, { t: 'bp', f: [320, 1600], q: .8, a: .06, d: .35, g: .55, gate: 90, dur: 1.4 }); sat(o, 2); } },
    sboom: { v: 2, dur: 2.2, sr: 32000, peak: .95, fn(o) { B(o, { T: .0012, g: 1 }); B(o, { at: .019, T: .0012, g: -.85 }); T(o, { f: 110, f1: 44, d: .1, g: .45, h: 4 }); N(o, { f: [2600, 280], d: .3, g: 1, dur: 1.8 }); hp(o, 45); sat(o, 2.6); } },
    jetland: { v: 2, dur: .8, sr: 32000, peak: .92, fn(o) { B(o, { T: .005, g: .5 }); T(o, { f: 96, f1: 42, d: .06, g: .6, h: 4 }); N(o, { f: [1700, 280], d: .1, g: 1.5 }); C(o, .012, 880, .04, .2); for (let i = 0; i < 10; i++) N(o, { at: rnd(.04, .5), f: [rnd(1200, 3000)], d: .005, g: rnd(.04, .14) }); sat(o, 2); } },
    tinn: { v: 1, dur: 2.6, sr: 24000, peak: .05, fn(o) { T(o, { f: 3620, a: .05, d: .85, g: 1, dur: 2.55 }); } },
    /* ---------- musik penutup misi (bukan efek medan) ---------- */
    win: { v: 1, dur: 3, sr: 32000, peak: .34, fn(o) { [[523, 0], [659, .14], [784, .28], [1047, .46]].forEach(([f, at]) => brass(o, at, f, .46, .5)); [523, 659, 784, 1047].forEach(f => brass(o, .72, f, 2, .28)); } },
    lose: { v: 1, dur: 2.4, sr: 32000, peak: .26, fn(o) { [[392, 0], [349, .3], [311, .6], [262, .95]].forEach(([f, at]) => brass(o, at, f, .9, .5, 4)); } },

    /* ---------- LOOP: mesin, rotor, jet, angin (loop: true; rate 1 = frekuensi dasar di komentar) ---------- */
    lpDiesel: { v: 1, dur: 2, sr: 22050, loop: .12, peak: .6, fn(o) {   // 40 letupan/dtk
      const P = 1 / 40; for (let t = 0, i = 0; t < o.length / SR; t += P * rnd(.985, 1.015), i++) { const g = rnd(.75, 1) * (i % 6 === 0 ? 1.18 : 1); T(o, { at: t, f: 80, f1: 54, d: .009, g: g * .9, dur: .03 }); N(o, { at: t, f: [520], d: .0075, g: g * .6, dur: .03 }); }
      N(o, { f: [760], q: .6, a: .01, d: 99, g: .09, dur: o.length / SR }); } },
    lpTurb: { v: 1, dur: 2.2, sr: 32000, loop: .25, peak: .5, fn(o) {   // desis turbin 500 Hz dasar
      const D = o.length / SR; N(o, { f: [1800], q: .55, a: .01, d: 99, g: .7, dur: D }); N(o, { t: 'bp', f: [420], q: .6, a: .01, d: 99, g: .32, dur: D }); for (const [f, g] of [[3120, .05], [3144, .04], [5180, .022]]) T(o, { f, a: .01, d: 99, g, dur: D }); } },
    lpJet: { v: 1, dur: 2.6, sr: 32000, loop: .3, peak: .66, fn(o) {   // gemuruh jet tempur dari luar
      const D = o.length / SR; N(o, { f: [1250], q: .55, a: .01, d: 99, g: 1, dur: D, gate: 26 }); N(o, { t: 'bp', f: [190], q: .7, a: .01, d: 99, g: .75, dur: D }); N(o, { t: 'hp', f: [3400], a: .01, d: 99, g: .13, dur: D, gate: 340 }); } },
    lpRotor: { v: 1, dur: 2, sr: 24000, loop: .1, peak: .72, fn(o) {   // baling utama 4 daun ≈ 19 tepukan/dtk + baling ekor + turbin
      const P = 1 / 19, D = o.length / SR; for (let t = 0, i = 0; t < D; t += P * rnd(.995, 1.005), i++) { const g = i % 4 === 0 ? 1.1 : rnd(.84, .98); B(o, { at: t, T: .0034, g: g * .7 }); N(o, { at: t, f: [560, 170], d: .017, g: g * .75, dur: .06 }); T(o, { at: t, f: 72, f1: 52, d: .012, g: g * .55, dur: .04 }); }
      for (let t = 0; t < D; t += 1 / 96) N(o, { at: t, t: 'bp', f: [1100], q: 1.2, d: .0028, g: .13, dur: .01 }); T(o, { f: 1660, a: .01, d: 99, g: .018, dur: D }); N(o, { f: [900], a: .01, d: 99, g: .1, dur: D }); } },
    lpTrack: { v: 1, dur: 2, sr: 22050, loop: .1, peak: .6, fn(o) {   // rantai tank: 12 ketuk/dtk
      const D = o.length / SR; for (let t = 0; t < D; t += 1 / 12 * rnd(.92, 1.08)) { C(o, t, rnd(420, 760), .028, rnd(.5, 1)); if (Math.random() < .3) C(o, t + rnd(.01, .04), rnd(1300, 2100), .012, rnd(.15, .4)); if (Math.random() < .12) N(o, { at: t, t: 'bp', f: [2900, 2300], q: 7, a: .02, d: .04, g: .25, dur: .1 }); } N(o, { f: [260], a: .01, d: 99, g: .22, dur: D, gate: 20 }); } },
    lpClay: { v: 1, dur: 2.4, sr: 32000, loop: .25, peak: .7, fn(o) {   // CLAY: semburan energi: raungan kasar + dengung medan
      const D = o.length / SR; N(o, { f: [2300], q: .55, a: .01, d: 99, g: 1, dur: D, gate: 62 }); N(o, { t: 'bp', f: [260], q: .7, a: .01, d: 99, g: .7, dur: D, gate: 15 }); for (const [f, g] of [[108, .22], [110.5, .2], [217, .1], [331, .05]]) T(o, { f, a: .01, d: 99, g, dur: D, h: 2 }); } },
    lpSpin: { v: 1, dur: 1, sr: 32000, loop: .1, peak: .4, fn(o) { const D = o.length / SR; T(o, { f: 300, a: .01, d: 99, g: .5, h: 6, dur: D }); N(o, { t: 'bp', f: [1500], q: 1.5, a: .01, d: 99, g: .2, dur: D }); } },
    lpWind: { v: 1, dur: 7, sr: 16000, loop: .9, peak: .7, fn(o) {   // angin: pita rendah dengan hembusan lambat
      const n = o.length, a = SVF(), b = SVF(); for (let i = 0; i < n; i++) { const t = i / n * TAU, m = .55 + .3 * Math.sin(t * 2 + 1) + .15 * Math.sin(t * 5 + 2.2); if (!(i & 31)) { a.set(130 + 300 * m, .7); b.set(760 + 1000 * m, 3.2); } const w = Math.random() * 2 - 1; o[i] = a.run(w, 0) * (.5 + .5 * m) + b.run(w, 1) * .1 * m * m; } } },
    lpInsect: { v: 1, dur: 5, sr: 24000, loop: .6, peak: .3, fn(o) {   // serangga tropis: dengung bertempo
      const n = o.length, f = SVF(); f.set(5400, 6); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * 31 / SR; const am = Math.pow(.5 + .5 * Math.sin(ph), 3) * (.55 + .45 * Math.sin(t * .9)); o[i] = f.run(Math.random() * 2 - 1, 1) * am; } } }
  };
  function boom(Ds, Ts, fm, dm, dr, fl, dl, nd) {
    return { v: 3, dur: Ds, sr: Ds > 4 ? 22050 : 32000, peak: .98, fn(o) {
      const j = rnd(.92, 1.08);
      B(o, { T: Ts * j * .6, g: .55 });                                       // gelombang kejut
      N(o, { f: [fm * 3.4, fm * .8], d: dm * .55, g: 1.7 });                 // serpih & api: pita lebar pendek
      N(o, { t: 'bp', f: [fm * .55, 170], q: .55, a: .004, d: dr * .75, g: 1.7, gate: 17 });   // gemuruh bergulung tidak rata di pita tengah (terdengar di laptop)
      N(o, { f: [fm * .4, 80], q: .6, a: .003, d: dr, g: .75, gate: 11 });
      T(o, { f: fl * 1.4 * j, f1: 30, d: dl * .55, g: .52, dur: Ds * .8, h: 4 });   // tekanan di dada + harmonik
      for (let i = 0; i < nd; i++) { const at = rnd(.12, Ds * .62), g = rnd(.03, .15) * (1 - at / Ds); N(o, { at, f: [rnd(1200, 3800)], d: rnd(.003, .012), g }); if (Math.random() < .25) C(o, at, rnd(900, 2400), .012, g * .7, 3); }   // puing berjatuhan
      hp(o, 42); sat(o, 2.2);
    } };
  }
  function gear(o) { if (Math.random() < .55) C(o, rnd(.03, .09), rnd(2600, 4200), .006, rnd(.03, .09), 3); CLOTH(o, .01, .09, .05, 1500); }
  function bubbles(o, a, b, n, g) { for (let i = 0; i < n; i++) { const f = rnd(420, 1700); T(o, { at: rnd(a, b), f, f1: f * rnd(1.15, 1.6), a: .001, d: rnd(.008, .028), g: g * rnd(.3, 1), ph: 0 }); } }
  /* speaker kecil: harmonik ganjil lewat pita 500-4000 Hz */
  function spk(o, at, f, dur) { for (let q = 1; q <= 9; q += 2) if (f * q < 5000) T(o, { at, f: f * q, a: .002, d: 9, g: .9 / q, dur }); }
  function radio(o, at, dur) { C(o, at, 2200, .004, .7, 2); N(o, { at, t: 'bp', f: [2100], q: .8, a: .002, d: 9, g: .13, dur, gate: 900 }); C(o, at + dur - .008, 1800, .004, .55, 2); }
  function brass(o, at, f, dur, g, nh) { const H = nh || 7; for (let q = 1; q <= H; q++) T(o, { at, f: f * q, a: .025 + q * .004, d: dur * .9, g: g * Math.pow(q, -1.25) * (q === 2 ? 1.2 : 1), dur }); }

  /* ---------- API ---------- */
  out.sfx = {
    names: Object.keys(RCP),
    info(name) { const r = RCP[name]; return r ? { v: r.v || 1, loop: !!r.loop, dur: r.dur, sr: r.sr || 0 } : null; },
    /* render(name, baseSr) → { data, sr }; dipanggil per varian, hasilnya disimpan pemanggil */
    render(name, baseSr) {
      const r = RCP[name]; if (!r) return null;
      SR = Math.min(r.sr || baseSr, baseSr);
      let o = new Float32Array(Math.ceil((r.dur + (r.loop || 0)) * SR));
      r.fn(o);
      if (r.loop) { hp(o, 28); o = loopify(o, r.loop); finish(o, r.peak || .8, true); }
      else finish(o, r.peak || .8);
      return { data: o, sr: SR };
    },
    /* bilangan acak umum yang dipakai fps-audio */
    pick
  };
  }
  const o = {}; factory(o); TK.fpssfx = o.sfx; TK.fpssfx.src = factory.toString();
})();
