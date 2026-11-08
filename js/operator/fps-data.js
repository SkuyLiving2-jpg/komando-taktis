/* ============================================================
   FPS-DATA — senjata, kelas, killstreak, waktu hari, dan
   pembangun medan 3D (peta ketinggian, bangunan, pohon)
   dari peta warzone 2D yang sama
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, F = TK.FPS = {};
  const { clamp } = TK.util;
  const TX = 2.5, NX = Math.round(W.WW / TX), NY = Math.round(W.WH / TX);   // 1 texel = 2,5 m
  Object.assign(F, { TX, NX, NY, world: null });

  /* ---------------- SENJATA ----------------
     rpm: tembakan/menit · rng0/rng1: jarak damage penuh / damage minimum (m)
     spread: derajat (hip / ads) · kick: sentakan vertikal (derajat) · mv: pengali kecepatan gerak
     shl: isi peluru satu per satu (dtk) [awal, per peluru, akhir, tambahan isi lewat lubang ejeksi saat kosong] */
  /* perlengkapan di tangan: [G] granat, [V] pisau / bayonet. draw = lama mengeluarkan (dtk); serangan { t lama, hit saat kena, r jangkauan m, dmg, cone kerucut, lunge dorongan m/dtk }
     granat: pin dicabut pada pin dtk, tahan klik kiri = lengan ditarik (wind dtk, granat belum dilempar), lepas = lempar (lepas dari tangan rel dtk setelah ayunan mulai); jauh lemparan mengikuti sudut pandang */
  F.FBBAR = { rng: 1300, every: [20, 27], warn: 3.2, gap: .22, n: 7, r: 15, aoe: 9, dmg: 115 };   // hujan artileri bos akhir PROFESIONAL: jarak, jeda, tanda (dtk), selang tiap peluru, jumlah, jari-jari zona, ledakan
  F.LANDP = { t: 1.5, dip: .2, up: .9, rise: .4, eye: 1.02, draw: 1.02 };   // mendarat dari parasut: menekuk ke tinggi mata 1,02 m, berdiri mulai 0,9 dtk, senjata diangkat 1,02 dtk, bebas 1,5 dtk
  F.EQ = { draw: { gren: .5, knife: .46, bay: .3, hook: .42 }, pin: .26, wind: .32, thr: .5, rel: .14, spd: 20,
    bash: { t: .5, hit: .17, r: 2.4, dmg: 150, cone: .45 },
    knife: { t: .62, hit: .27, r: 3.2, dmg: 300, cone: .25, n: 3 }, knifeH: { t: 1, hit: .63, r: 4, dmg: 800, cone: .55, n: 2, lunge: 9 },
    bayH: { k: 1.65, hit: .56, r: 1.25, dmg: 1.8, lunge: 10 } };   // tusukan kuat bayonet: lama ×k, jangkauan ×r, damage ×dmg dari WEAPONS.bay
  /* animasi kemampuan kelas [F]: t = lama aksi (dtk, senjata diturunkan), at = saat efek keluar, s0 = suara awal */
  F.AB_ANIM = { ADRENALINE: { t: 1.15, at: .6, s0: 'switch' }, PULSE: { t: 1.05, at: .5, s0: 'beep' }, DRONE: { t: 1.1, at: .55, s0: 'switch' },
    ARMOR: { t: 1.15, at: .62, s0: 'switch' }, STUN: { t: .9, at: .43, s0: 'pin' }, PAINT: { t: 1.25, at: .55, s0: 'beep' } };
  F.WEAPONS = {
    AR:      { slot: 0, mode: 'auto', rpm: 700, dmg: 22, dt: 'small', rng0: 60, rng1: 420, mag: 30, res: 240, rel: 2.6, spread: [1.9, .22], kick: .4, mv: .96, zoom: .78, ads: 7, snd: 'm4', ico: 'AR' },
    AK:      { slot: 0, mode: 'auto', rpm: 650, dmg: 25, dt: 'small', rng0: 55, rng1: 400, mag: 30, res: 150, rel: 2.5, spread: [2, .25], kick: .5, mv: .95, zoom: .78, ads: 6.5, snd: 'rifleE', ico: 'AR',
      bay: { r: 3.8, dmg: 400, cone: .5, t: .62, hit: .24 } },   // bayonet (V lalu klik kiri): jangkauan m, damage, kerucut arah, lama tusukan, saat kena (dtk)
    SMG:     { slot: 0, mode: 'auto', rpm: 940, dmg: 14, dt: 'small', rng0: 25, rng1: 190, mag: 32, res: 192, rel: 1.7, spread: [1.6, .3], kick: .27, mv: 1.06, zoom: .85, ads: 10, snd: 'smg', ico: 'SMG' },
    LMG:     { slot: 0, mode: 'auto', rpm: 620, dmg: 21, dt: 'small', rng0: 70, rng1: 460, mag: 100, res: 200, rel: 5.2, spread: [2.4, .45], kick: .36, mv: .86, zoom: .8, ads: 5, snd: 'lmg', ico: 'LMG' },
    SNIPER:  { sup: true, slot: 0, mode: 'bolt', rpm: 52, dmg: 260, dt: 'ap', rng0: 900, rng1: 1800, mag: 5, res: 20, rel: 3.3, spread: [5.5, .02], kick: 2.6, mv: .9, zoom: .17, ads: 4, snd: 'sniper', ico: 'SNP', scope: true },
    SHOTGUN: { slot: 0, mode: 'semi', rpm: 200, dmg: 14, dt: 'small', pellets: 9, rng0: 14, rng1: 80, mag: 10, res: 40, rel: 3.2, shl: [.42, .44, .42, .95], spread: [3.6, 2.2], kick: 2.1, mv: 1, zoom: .88, ads: 9, snd: 'shotgun', ico: 'SG' },
    PISTOL:  { slot: 1, mode: 'semi', rpm: 420, dmg: 19, dt: 'small', rng0: 25, rng1: 160, mag: 15, res: 75, rel: 1.5, spread: [1.4, .5], kick: .9, mv: 1.04, zoom: .9, ads: 12, snd: 'pistol', ico: 'PST' },
    /* pistol per kelas (gaya MW2): burst = jumlah peluru per tarikan, bcd = jeda antar-burst · acc = akurasi 100% (tanpa sebaran) */
    M1911:   { slot: 1, mode: 'semi', rpm: 400, dmg: 26, dt: 'small', rng0: 25, rng1: 170, mag: 8, res: 56, rel: 1.6, spread: [1.3, .45], kick: 1.15, mv: 1.04, zoom: .9, ads: 12, snd: 'pistol', ico: 'PST' },
    GLOCK:   { slot: 1, mode: 'semi', rpm: 480, dmg: 20, dt: 'small', rng0: 25, rng1: 160, mag: 17, res: 85, rel: 1.5, spread: [1.2, .4], kick: .8, mv: 1.05, zoom: .9, ads: 13, snd: 'pistol', ico: 'PST' },
    M93R:    { slot: 1, mode: 'burst', burst: 3, bcd: .3, rpm: 1100, dmg: 19, dt: 'small', rng0: 25, rng1: 160, mag: 20, res: 100, rel: 1.6, spread: [1.5, .55], kick: .6, mv: 1.04, zoom: .9, ads: 12, snd: 'pistol', ico: 'PST' },
    DEAGLE:  { slot: 1, mode: 'semi', rpm: 210, dmg: 50, dt: 'small', rng0: 35, rng1: 210, mag: 7, res: 42, rel: 1.8, spread: [1.9, .6], kick: 2.7, mv: 1.02, zoom: .88, ads: 10, snd: 'deagle', ico: 'PST' },
    MAG44:   { slot: 1, mode: 'semi', rpm: 150, dmg: 64, dt: 'small', rng0: 60, rng1: 320, mag: 6, res: 36, rel: 2.5, spread: [0, 0], acc: true, kick: 3, mv: 1.02, zoom: .42, ads: 8, snd: 'magnum', ico: 'PST', scope: true },
    AT:      { slot: 1, mode: 'rocket', rpm: 30, dmg: 330, dt: 'ap', mag: 1, res: 3, rel: 3.6, spread: [1.2, .25], kick: 3, mv: .88, zoom: .75, ads: 5, snd: 'rocket', ico: 'AT' }
  };
  /* lampiran senjata (dipasang di MEJA SENJATA markas, fps-kit.js). g = kelompok yang saling meniadakan (satu optik, satu jenis magasin),
     m = pengubah statistik dari F.WEAPONS dasar: angka = pengali, objek {set} = nilai pengganti. Sementara hanya M4A1 (AR) */
  F.ATT = {
    ACOG:  { g: 'opt', m: { zoom: { set: .29 }, ads: .82, mv: .98 }, opt: 'acog' },                                   // 3,5×: lensa di model, retikel chevron merah
    MED:   { g: 'opt', m: { zoom: { set: .16 }, ads: .7, mv: .97, scope: { set: true }, spread: [1.15, .6] }, opt: 'med' },   // ±6×: teropong menengah (LPVO)
    HIGH:  { g: 'opt', m: { zoom: { set: .085 }, ads: .55, mv: .95, scope: { set: true }, spread: [1.3, .35], rng1: 1.35 }, opt: 'high' },   // ±11×: teropong besar
    DUAL:  { g: 'mag', m: { dual: { set: .5 } } },                                                                      // dua magasin dilakban (gaya Black Ops): reload ganjil = tukar cepat (×dual waktu), reload genap normal
    EXT:   { g: 'mag', m: { mag: 1.5, res: 1.2, rel: 1.12, mv: .98 } },                                                 // magasin 45 butir
    LASER: { g: 'rail', m: { spread: [.55, 1] } },                                                                     // bidikan pinggul jauh lebih rapat
    GRIP:  { g: 'under', m: { kick: .6, spread: [.9, .85] } },                                                          // pegangan depan: hentakan berkurang
    SUP:   { g: 'muz', m: { sup: { set: true }, rng1: .85, snd: { set: 'rifleS' } } }                                   // peredam: tak terdengar jauh, kilatan kecil, tak muncul di radar musuh
  };
  F.ATT_FOR = { AR: ['ACOG', 'MED', 'HIGH', 'DUAL', 'EXT', 'LASER', 'GRIP', 'SUP'] };
  /* perk (keahlian pasif) + batas per tingkat kesulitan (MUDAH/NORMAL/SULIT/PROFESIONAL): att = lampiran, perk = jumlah perk */
  F.PERKS = ['HARDLINE', 'SHADOW', 'FLAK', 'VULTURE', 'SLEIGHT', 'MARATHON', 'STEADY', 'LASTSTAND', 'EAGLE'];
  F.KITLIM = [{ att: 1, perk: 0 }, { att: 2, perk: 0 }, { att: 2, perk: 1 }, { att: 3, perk: 2 }];   // PROFESIONAL: 3 lampiran (v2.2.2)
  F.PERK = {
    hard: 1.5,                                             // HARDLINE: poin & kredit per kill ×
    shadow: 1,                                             // SHADOW: musuh baru bisa melihat Anda dalam jarak ini (m); suara tembakan tetap terdengar
    flak: .6,                                              // FLAK JACKET: damage ledakan (mortir, peluru tank, granat, roket, bom) ×
    vult: { life: 40, r: 2.2, hp: 45, mags: 1, gren: 1 },  // VULTURE: paket jatuhan (dtk bertahan, jarak ambil m, nyawa, magasin cadangan per senjata, granat)
    sleight: .75,                                          // SLEIGHT OF HAND: lama reload ×
    stam: { t: 6, rec: 3.2, wait: 1, min: .3 },            // stamina lari dasar: lari penuh t dtk, pulih penuh rec dtk setelah jeda wait, boleh lari lagi setelah ≥ min
    mara: { t: 2.6, rec: .5, spd: 1.14 },                  // MARATHON: lari ×t lebih lama, pulih ×rec lebih cepat (waktu), kecepatan lari ×spd
    steady: { spread: .35, bloom: .5, sway: .35 },         // STEADY AIM: sebaran ×, mekar sebaran ×, goyang teropong ×
    last: { hp: 70, t: 14, up: .35 },                      // LAST STAND: nyawa saat terjatuh, bertahan t dtk lalu bangkit dengan up × nyawa (sekali per nyawa)
    eagle: 500                                             // EAGLE EYE: semua musuh dalam jarak ini (m) tertandai di HUD & minimap, menembus dinding
  };
  F.WNAME = {
    tni: { AR: 'M4A1 CARBINE', AK: 'AK-74M', SMG: 'SIG MPX', LMG: 'M60', SNIPER: 'PINDAD SPR-3', SHOTGUN: 'BENELLI M4', PISTOL: 'PINDAD P1', M1911: 'KIMBER M1911', GLOCK: 'GLOCK 34 TTI', M93R: 'BERETTA 93R', DEAGLE: 'DESERT EAGLE .50', MAG44: '.44 MAGNUM', AT: 'ARMBRUST', FRAG: 'GRANAT TANGAN', KNIFE: 'KOMANDO' },
    us:  { AR: 'M4A1 CARBINE', AK: 'AK-74M', SMG: 'SIG MPX', LMG: 'M60', SNIPER: 'M24 SWS', SHOTGUN: 'M1014', PISTOL: 'M9A3', M1911: 'KIMBER M1911', GLOCK: 'GLOCK 34 TTI', M93R: 'BERETTA 93R', DEAGLE: 'DESERT EAGLE .50', MAG44: '.44 MAGNUM', AT: 'AT4', FRAG: 'M67 FRAG', KNIFE: 'KA-BAR' }
  };
  /* ab: kemampuan khusus kelas (tombol F) · cd: jeda isi ulang (dtk) · dur: lama efek (dtk) · r: jangkauan (m)
     hp: nyawa dasar · stealth: pengali jarak deteksi musuh (kamuflase) · spot: jarak tanda musuh otomatis di HUD (m) */
  F.CLASSES = [
    { id: 'ASSAULT', pri: 'AR', sec: 'M1911', gren: 2, ico: 'AR', st: [3, 3, 3, 3], hp: 150, stealth: 1, spot: 330, ab: { id: 'ADRENALINE', cd: 32, dur: 7 } },     // st: damage, jarak, mobilitas, daya tahan
    { id: 'CQB', pri: 'SMG', sec: 'GLOCK', gren: 2, ico: 'SMG', st: [2, 1, 5, 2], hp: 135, stealth: .8, spot: 300, ab: { id: 'PULSE', cd: 26, dur: 9, r: 170 } },
    { id: 'RECON', pri: 'SNIPER', sec: 'M93R', gren: 1, ico: 'SNP', st: [5, 5, 2, 1], hp: 120, stealth: .62, spot: 700, ab: { id: 'DRONE', cd: 38, dur: 16, r: 750 } },
    { id: 'GUNNER', pri: 'LMG', sec: 'DEAGLE', gren: 2, ico: 'LMG', st: [3, 4, 1, 5], hp: 190, stealth: 1.1, spot: 330, ab: { id: 'ARMOR', cd: 42, dur: 9 } },
    { id: 'BREACHER', pri: 'SHOTGUN', sec: 'MAG44', gren: 3, ico: 'SG', st: [5, 1, 3, 3], hp: 150, stealth: 1, spot: 300, ab: { id: 'STUN', cd: 20, dur: 7, r: 28 } },
    { id: 'ANTIARMOR', pri: 'AK', sec: 'AT', gren: 1, ico: 'AT', st: [3, 3, 2, 3], hp: 150, stealth: 1, spot: 330, ab: { id: 'PAINT', cd: 30, dur: 16, r: 900 } }
  ];
  /* deteksi musuh terhadap operator: jarak dasar (m) × pengali pengamat × pengali sikap/medan/cahaya */
  /* deteksi operator: base = jarak lihat dasar; near/nearSup = tembakan terdengar cukup dekat untuk tahu posisi persis;
     fire/fireSup = terdengar (waspada & mencari, arah kira-kira); impact = peluru menghantam sedekat ini membuat waspada;
     buddy = rekan korban yang melihatnya roboh; call = jarak teriak antar-rekan; mem = ingatan posisi (dtk) */
  /* bantuan mortir [B] = rentetan roket: n roket, dmg & r ledakan sim, S ukuran ledakan 3D, R jarak & alt ketinggian lintasan, dur lama terbang, delay/gap jeda */
  F.HOOK = { rng: 62, spd: 120, pull: 21, acc: 38, mantle: .62, cd: 1.6 };   // grappling hook [H]: jangkauan m, laju kait, laju tarik maks, percepatan, lama memanjat tepi, jeda
  F.CROWD = { r: 650, jog: 8, walk: 7, ring: 46, jogV: 4.8, walkV: 1.45 };   // prajurit kosmetik di markas (fps-life crowdTick)
  F.VOLC = { first: [22, 34], every: 60, jit: 6, warn: 4.5, dur: 9, plume: 34, bombs: 14, r: 8, dmg: 150, boom: 75, msgR: 4000 };   // erupsi gunung berapi (fps-life volcTick)
  F.RKT = { n: 7, dmg: 150, r: 17, S: 11, spread: 24, R: 780, alt: 460, dur: 3.2, delay: 1.4, gap: .42, prox: 9 };   // prox: sumbu jarak dekat terhadap heli/pesawat (m)
  F.BOARD = { r: 250 };   // perintah NAIK KENDARAAN: kendaraan operator terdekat dalam r m (kursi = F.VEH[].seats, termasuk pengemudi)
  F.PMIN = -1.5;   // batas menunduk: hampir tegak lurus ke bawah agar kaki & badan sendiri terlihat (fps-gl drawSelf)
  F.DETECT = { base: 190, mult: { DAY: 1, DUSK: .8, NIGHT: .55 }, near: 110, fire: 360, nearSup: 12, fireSup: 38, impact: 7, buddy: 30, call: 40, mem: 4, close: 9 };   // close: sedekat ini langsung terlihat ke segala arah
  /* killstreak: tombol 3–7; setelah yang terakhir hitungan siklus kembali ke 0 (hadiah yang belum dipakai menumpuk) */
  F.STREAKS = [
    { id: 'UAV', kills: 3, key: 3 },
    { id: 'PRED', kills: 5, key: 4 },     // rudal Predator: pilih sasaran di peta, lalu kemudikan dari kamera hulu ledak
    { id: 'APACHE', kills: 7, key: 5 },   // AH-64 Apache: mendarat di dekat operator, dinaiki [E] & dikemudikan sendiri
    { id: 'GUNSHIP', kills: 10, key: 6 },
    { id: 'LASER', kills: 14, key: 7 }    // laser orbital: sinar satelit mengikuti titik bidikan
  ];
  F.KILLCR = { mult: 1, min: 40, head: 25, multi: 15, squad: .25, diff: [1, 1.5, 2, 3] };   // kredit per kill: harga unit musuh × mult (min), bonus headshot & multi-kill; kill pasukanmu = squad × harga; diff = pengali per kesulitan (MUDAH/NORMAL/SULIT/PRO)
  /* rudal Predator: sasaran dipilih di peta (≤ range m dari operator), meluncur dari ketinggian alt, back m di belakang sasaran; steer = batas koreksi kemudi */
  F.PRED = { alt: 950, spd: 110, boost: 330, r: 26, dmg: 640, range: 2600, back: 520, steer: 260, t: 22, pick: 30 };
  /* AC-130: pusat orbit dipilih di peta (<= range m dari operator); orbit radius R pada ketinggian alt (m) dengan kecepatan sudut w (rad/dtk); fov per meriam 25/40/105 (°), laju peluru (m/dtk), batas bidik dari arah orbit [yaw, pitch] */
  F.AC130 = { t: 40, range: 4000, R: 680, alt: 620, w: .07, fov: [13, 24, 42], spd: [950, 760, 560], lim: [.62, .42] };
  /* drone kamera UAV: durasi = baterai (dtk), kecepatan (m/dtk), jangkauan sinyal dari operator, tinggi min/maks di atas tanah */
  F.DRONE = { dur: 55, spd: 24, fast: 55, climb: 14, range: 1400, minH: 3, maxH: 280, tag: 30, tagR: 28 };
  /* AH-64 Apache operator: kecepatan & tanjak (m/s), belok (rad/dtk), plafon di atas tanah (m), bahan bakar (dtk terbang);
     gun = meriam M230 30 mm, hf = rudal Hellfire berpemandu, hy = roket Hydra 70 (salvo), flare = penangkal rudal. Nyawa: war-data UT.AH64 */
  F.APACHE = { spd: 72, boost: 102, climb: 18, acc: 1.7, turn: 2.15, ceil: 340, fuel: 300,   // AH-64X SHADOW HUNTER: lebih cepat & lebih mematikan; BBM 5 menit
    gun: { rpm: 1000, dmg: 82, r: 5, ammo: 2200, spread: .38, rng: 1900 },   // meriam kembar 30 mm
    /* Hellfire: tahan [RMB] = tandai ≤max sasaran (paint dtk/sasaran), lepas = tembak beruntun (gap); kena dari atas ×top.
       Terbang: lepas dari rel & jatuh sesaat (drop dtk) → motor menyala, laju v0 → spd dalam boost dtk; pemandu mengikuti kurva
       Hermite halus dari arah rudal sekarang ke arah tiba (serang-atas: menukik dive rad bila sasaran darat > loAt m; selain itu
       garis pandang), titik tuju di depan sejauh look × jarak; belok dibatasi turn rad/dtk (term di fase akhir ≤ termD m) */
    hf: { n: 64, cd: .3, dmg: 1700, r: 14, spd: 240, v0: 45, drop: .16, boost: 1.1, dive: .8, loAt: 250, look: .3, turn: 1.5, term: 4.5, termD: 140, rng: 2800, max: 8, paint: .16, gap: .14, top: 1.3 },
    hy: { n: 96, salvo: 8, gap: .06, cd: 1, dmg: 300, r: 10, spd: 250, spread: 1.2, war: ['HE', 'FL', 'GD', 'WP'], gd: 3.5,   // [X] ganti hulu ledak: HE · FLECHETTE · GD (APKWS: roket mengikuti bidikan, belok gd rad/dtk) · WP (fosfor putih)
      fl: { burst: 45, cone: .17, rng: 95, dmg: 150, veh: 18, n: 26 },   // hulu ledak FLECHETTE: pecah burst m sebelum titik bidik, paku menyembur dalam kerucut ±cone rad sejauh rng m
      wp: { r: 12, dur: 7, dps: 70 } },                                // FOSFOR PUTIH: lautan api radius r m selama dur dtk, membakar dps/dtk
    /* [H] ganti senjata dagu. k: gun = peluru ledak, mg = senapan mesin putar (berputar dulu spin dtk), laser = sinar panas (tembak terus heat dtk →
       panas berlebih, dingin dalam cool dtk; damage naik ×2 setelah lock dtk menyorot sasaran yang sama), rail = meriam rel (tahan [LMB] isi daya charge dtk,
       lepas = proyektil menembus berderet, tiap tembusan ×pierce, juga menembus dinding/bukit ≤wall m), gl = pelontar granat 40 mm (lintasan melengkung otomatis ke titik bidik) */
    guns: [{ id: 'M230', k: 'gun' }, { id: 'MINIGUN', k: 'mg', rpm: 3000, dmg: 30, ammo: 6000, spread: .9, rng: 1500, spin: .45 },
      { id: 'LASER', k: 'laser', dps: 620, rng: 2200, heat: 6, cool: 3.5, lock: 2.5 }, { id: 'RAILGUN', k: 'rail', dmg: 2400, ammo: 30, charge: .9, cd: .5, rng: 3000, pierce: .85, wall: 40 },
      { id: 'GRANAT 40', k: 'gl', rpm: 300, dmg: 240, r: 9, ammo: 400, spd: 220 }],
    diffK: [1, 1.2, 1.4, 1.65], hpK: [1.25, 1.45, 1.7, 2],   // per tingkat kesulitan (MUDAH..PRO): pengali damage semua senjata heli & nyawa heli (musuh SULIT/PRO lebih tangguh — heli tidak boleh jadi "kerupuk")
    st: { n: 6, cd: .5, lock: .8, cone: .35, rng: 2400, dmg: 600, r: 9, spd: 430, fuze: 8 },   // [R] STINGER udara-ke-udara: kunci pesawat dalam ±cone rad selama lock dtk, sumbu jarak dekat fuze m
    flare: { n: 8, cd: 9, dur: 4 },
    ghost: { dur: 12, cd: 60, mark: 1000, dmg: 1.3 },   // [Q] PROTOKOL BAYANGAN: siluman radar (musuh hanya melihat dari ≤10% jarak pandangnya), rudal terkunci lepas, musuh ≤mark m ditandai, damage ×dmg
    crash: { spin: 3.4, g: 10, vmax: 30, slide: 7, chute: 6, push: 10, r: 18, dmg: 380 },   // HP habis: putaran maks rad/dtk, percepatan jatuh, laju jatuh maks, geser melengkung, tinggi minimal parasut, laju lompat menjauh, ledakan bangkai
    refuel: { farp: 20, drop: 7, arm: 4 } };            // isi BBM: penuh dalam farp dtk saat mendarat di HQ/pos kawan (amunisi diisi penuh setelah arm dtk di sana); pasokan BBM [B] tiba dalam drop dtk
  /* KENDARAAN OPERATOR (fps-veh.js; dibeli kredit di menu [T], dikemudikan sendiri). arr = cara datang: drive menyetir sendiri ke operator,
     sling digantung heli angkut, drop diterjunkan pesawat kargo (parasut + roket pengerem), vtol mendarat tegak.
     darat: spd/boost/rev m/dtk, acc/brk m/dtk², steer rad/dtk (pivot: tank bisa berputar di tempat), grip = cengkeraman ban, slope = tanjakan maks,
     ford = kedalaman air maks (m), amph = laju berenang (amfibi), cam = jarak kamera, trav = laju putar kubah rad/dtk, el = batas elevasi laras,
     pad = jari-jari lahan kosong, d0 = jarak tiba dari operator, crush = laju min menggilas infanteri. w = senjata (gun peluru, gl granat 40 mm, shell peluru meriam) */
  F.VEH_ORDER = ['HMV', 'APC', 'MBT', 'VTOL'];
  F.VEH_REFIT = .3;   // beli lagi saat kendaraan masih ada = perbaikan + isi ulang (×harga)
  F.VEH = {
    HMV: { seats: 4, cost: 600, arr: 'drive', spd: 31, boost: 40, rev: 9, acc: 10, brk: 24, steer: 1.3, grip: 5, slope: .75, ford: .9, cam: 13, trav: 3.4, el: [-.3, .75], pad: 3.5, d0: 14, crush: 5,
      w: [{ id: 'M2', k: 'gun', rpm: 520, dmgI: 46, dmgV: 20, rng: 1100, spread: .5, mag: 100, n: 500, rel: 4.5, snd: 'lmg', tw: .05 }],
      smoke: { n: 3, dur: 10, cd: 3 } },
    APC: { seats: 8, cost: 900, arr: 'drive', spd: 24, boost: 29, rev: 7, acc: 7, brk: 20, steer: 1.05, grip: 4, slope: .8, ford: 1.2, amph: 5.5, cam: 14, trav: 2.6, el: [-.25, .8], pad: 4.5, d0: 22, crush: 5,
      w: [{ id: 'MK19', k: 'gl', rpm: 330, dmg: 130, r: 6.5, spd: 150, spread: .35, mag: 32, n: 160, rel: 5.5, snd: 'thud' }],
      smoke: { n: 3, dur: 10, cd: 3 } },
    MBT: { seats: 3, cost: 1500, arr: 'drive', spd: 16, boost: 19, rev: 6, acc: 5, brk: 14, steer: .85, pivot: true, grip: 6, slope: .95, ford: 1.6, cam: 16, trav: 1.15, el: [-.15, .35], pad: 5.5, d0: 28, crush: 2.5, trees: true,
      w: [{ id: '120MM', k: 'shell', cd: 3.4, dmg: 950, r: 9, spd: 560, n: 40 },
        { id: 'COAX', k: 'gun', rpm: 650, dmgI: 32, dmgV: 5, rng: 900, spread: .35, mag: 200, n: 1200, rel: 5, snd: 'lmg', tw: .03 }],
      atgm: { n: 8, salvo: 2, gap: .4, cd: 6, dmg: 1200, r: 10, spd: 200, rng: 2600 }, smoke: { n: 3, dur: 10, cd: 3, key: 'F' } },   // tank: G = rudal antitank, F = pelontar tabir asap
    VTOL: { seats: 2, cost: 2400, arr: 'vtol', hov: 24, climb: 16, min: 70, cru: 150, max: 240, ab: 320, turn: 1.25, ceil: 1300, cam: 24, pad: 8.5, d0: 42,
      w: [{ id: '25MM', k: 'gun', rpm: 1400, dmgI: 70, dmgV: 45, r: 3.5, rng: 1700, spread: .45, mag: 600, n: 600, snd: 'chain', tw: .06, he: true }],
      agm: { n: 6, cd: .9, dmg: 1400, r: 12, spd: 280, rng: 3200, cone: .1 },   // [RMB] rudal udara-darat: kunci kendaraan/bangunan dalam ±cone rad
      aam: { n: 4, cd: .6, lock: .9, cone: .3, rng: 3000, dmg: 700, r: 10, spd: 560, fuze: 9 },   // [R] rudal udara-udara (kunci inframerah seperti Stinger)
      bomb: { n: 4, cd: .7, dmg: 1100, r: 24 }, flare: { n: 10, cd: 6, dur: 4 } }
  };
  /* laser orbital SATELIT HELIOS: titik dipilih di peta (<= range m dari operator) → sinematik satelit turun (cin) → POV satelit di ketinggian alt m → isi daya charge dtk → sinar dur dtk (radius r, dps, laju spd m/dtk); nova = ledakan penutup.
     hqK: markas musuh hanya tergores agar misi tidak selesai sekali sorot. cin: satelit jatuh dari h0 m selama fall dtk, panel terbuka mulai dep0 selama depT dtk, kamera memutar arc0..arc1 lalu masuk ke optik satelit pada t dtk */
  F.LASER = { dur: 26, r: 20, dps: 640, spd: 90, charge: 2.2, alt0: 3200, alt: 520, range: 2600, assist: 34, airK: .6, hqK: .02, nova: { r: 90, dmg: 2600, t: 1.8 },   // assist: layar sentuh, titik bidik menempel ke musuh <= m
    cin: { h0: 2600, fall: 3.2, dep0: 2.1, depT: 1.3, arc0: 2.7, arc1: 4.3, t: 5 } };
  /* AC-130 Overwatch: meriam (r = radius ledakan m, dmg, cd detik, dt = jenis damage, bs = ukuran ledakan 3D, sh = radius cincin kejut m, hq = pengali damage ke markas musuh: laju rusak markas tetap seperti sebelum diperkuat).
     105 mm: damage ×5; radius mengikuti energi ledakan (akar pangkat tiga dari 5 = ×1,7) */
  F.GUNS = [{ id: 'G25', r: 3, dmg: 34, cd: .06, spread: 2.2, dt: 'he', bs: 4, hq: .46 },
    { id: 'G40', r: 12, dmg: 230, cd: .4, spread: 1.2, dt: 'bomb', bs: 13, sh: 30, hq: .47 },
    { id: 'G105', r: 44, dmg: 4000, cd: 1.8, spread: .6, dt: 'bomb', bs: 44, sh: 190, hq: .106 }];
  /* bantuan yang dibeli dengan kredit (tombol B) */
  F.CALLINS = [
    { id: 'SQUAD', cost: 220 }, { id: 'MEDIC', cost: 90 }, { id: 'AMMO', cost: 60 }, { id: 'MORTAR', cost: 260 },
    { id: 'TANK', cost: 300 }, { id: 'MEDEVAC', cost: 300 }, { id: 'GUNSHIP', cost: 650 }, { id: 'FUEL', cost: 250 }   // FUEL: pasokan BBM diterjunkan ke Shadow Hunter
  ];
  F.RANKS = [0, 600, 1800, 4000, 7500, 13000, 21000, 33000, 50000];

  /* ---------------- WAKTU HARI ----------------
     sky: [atas, tengah, cakrawala] · tint: pengali warna medan · fog: warna kabut · dist: jarak kabut (m) · sun: [azimut, elevasi derajat] */
  F.TOD = {
    DAY:   { sky: [[70, 118, 190], [140, 178, 224], [214, 226, 232]], tint: [1.02, 1.0, .96], fog: [206, 220, 230], dist: 1100, sun: [250, 38], amb: 1 },
    DUSK:  { sky: [[44, 58, 112], [214, 132, 96], [255, 196, 128]], tint: [1.08, .84, .66], fog: [236, 176, 122], dist: 800, sun: [255, 5], amb: .82 },
    NIGHT: { sky: [[6, 12, 34], [16, 28, 60], [40, 56, 92]], tint: [.55, .66, 1.0], fog: [30, 44, 76], dist: 650, sun: [250, -20], amb: .86 }
  };

  /* ---------------- UTILITAS ---------------- */
  function h2(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  F.h2 = h2;
  const pack = (r, g, b) => (255 << 24) | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255);
  F.pack = (r, g, b) => pack(r | 0, g | 0, b | 0);

  /* ---------------- PEMBANGUN MEDAN ----------------
     g: peta warzone (TK.war.Q.g) · zones: [[x, y, radius]] area rata (markas, objektif)
     Hasil: H tinggi + bangunan (tabrakan), G tanah saja, T jenis medan (+16 padat, +32 dinding, +64 lahar), BI bioma,
     C warna berbayang (renderer perangkat lunak), ALB/MAT tekstur albedo & material (WebGL), gedung, properti, pohon */
  const STY = {   // lot: ukuran kavling (m) · mg: jarak ke tepi kavling · st: tiap st kavling = jalan (0 = acak)
    downtown: { lot: 26, mg: 3, st: 3 }, modern: { lot: 21, mg: 2.6, st: 3 }, oldtown: { lot: 13, mg: 1.8, st: 3 }, kampung: { lot: 12, mg: 2, st: 3 },
    desert: { lot: 12, mg: 1.7, st: 3 }, industrial: { lot: 30, mg: 3.2, st: 3 }, base: { lot: 22, mg: 3, st: 3 }
  };
  F.STY = STY;
  F.buildWorld = function (g, zones) {
    const GW = W.GW, GH = W.GH, TER = W.TER, BIO = W.BIO, seed = g.seed, vn = W.vn, N = NX * NY;
    const H = new Float32Array(N), T = new Uint8Array(N), C = new Uint32Array(N), BI = new Uint8Array(N), ALB = new Uint8Array(N * 4), MAT = new Uint8Array(N * 4);
    const eCell = (cx, cy) => g.e[clamp(cy, 0, GH - 1) * GW + clamp(cx, 0, GW - 1)];
    const bioC = (cx, cy) => g.bio ? g.bio[clamp(cy, 0, GH - 1) * GW + clamp(cx, 0, GW - 1)] : 0;
    const eAt = (wx, wy) => {
      const gx = wx / W.CELL - .5, gy = wy / W.CELL - .5, x0 = Math.floor(gx), y0 = Math.floor(gy);
      let fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = eCell(x0, y0), b = eCell(x0 + 1, y0), c = eCell(x0, y0 + 1), d = eCell(x0 + 1, y0 + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    const bioW = (b, wx, wy) => {   // bobot bioma halus (bilinear antar sel) → transisi tanpa tebing
      const gx = wx / W.CELL - .5, gy = wy / W.CELL - .5, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, f = (x, y) => bioC(x, y) === b ? 1 : 0;
      return (f(x0, y0) * (1 - fx) + f(x0 + 1, y0) * fx) * (1 - fy) + (f(x0, y0 + 1) * (1 - fx) + f(x0 + 1, y0 + 1) * fx) * fy;
    };
    const VC = g.volc ? { x: g.volc.x * W.CELL, y: g.volc.y * W.CELL, R: g.volc.r * W.CELL, dc: 44 } : null;
    const cone = d => 30 + 132 * Math.pow(Math.max(0, 1 - d / VC.R), 1.6);   // stratovolkano: lereng cekung

    /* --- 1) tinggi tanah, jenis medan, bioma --- */
    for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      const wx = (ix + .5) * TX, wy = (iy + .5) * TX, i = iy * NX + ix;
      const ww = wx + (vn(wx / 41, wy / 41, seed + 21) - .5) * 30, wv = wy + (vn(wx / 37 + 9, wy / 37, seed + 22) - .5) * 30;
      const cx = clamp(Math.floor(ww / W.CELL), 0, GW - 1), cy = clamp(Math.floor(wv / W.CELL), 0, GH - 1), t = g.t[cy * GW + cx], e = eAt(wx, wy), b = bioC(cx, cy);
      const dn = (vn(wx / 19, wy / 19, seed + 31) - .5) * 3.2 + (vn(wx / 6, wy / 6, seed + 32) - .5) * .8;
      let h;
      if (t === TER.WATER) h = -.9 - clamp((.3 - e) / .3, 0, 1) * 9;
      else {
        h = Math.max(.45, (e - .3) * 110);
        if (t === TER.HILL) h += dn * 1.3 + (vn(wx / 11, wy / 11, seed + 33) - .5) * 2.4;
        else if (t === TER.ROAD) { h += dn * .15; if (e < .3) h = 1.15; }
        else if (t === TER.URBAN) h += dn * .05;
        else h += dn;
        const wD = bioW(BIO.DESERT, wx, wy), wS = bioW(BIO.SWAMP, wx, wy), wV = bioW(BIO.VOLC, wx, wy), hillK = clamp((e - .6) / .1, 0, 1);
        if (wD > 0 && t !== TER.ROAD && t !== TER.URBAN) { const du = Math.sin(wx * .034 + wy * .013 + vn(wx / 90, wy / 90, seed + 34) * 7); h += du * du * 2.6 * vn(wx / 140, wy / 140, seed + 35) * wD * (1 - hillK * .6); }   // bukit pasir
        if (wS > 0) h = h - (h - .55) * .8 * wS + (vn(wx / 7, wy / 7, seed + 36) - .5) * .5 * wS;   // rawa: rendah & datar (turun perlahan dari tepi)
        if (wV > 0) h += Math.abs(vn(wx / 13, wy / 13, seed + 37) - .5) * 6 * wV * hillK;   // punggung batuan beku
        if (VC && t !== TER.ROAD && t !== TER.URBAN) {
          const d = Math.hypot(wx - VC.x, wy - VC.y);
          if (d < VC.R) { const k = clamp((VC.R - d) / 60, 0, 1); h = h + (Math.max(h, cone(d) + Math.abs(vn(wx / 9, wy / 9, seed + 38) - .5) * 5 * (1 - d / VC.R)) - h) * k; if (d < VC.dc) h = d < VC.dc * .8 ? cone(VC.dc) - 24 : cone(VC.dc) - 24 * (1 - (d - VC.dc * .8) / (VC.dc * .2)); }
        }
        h = Math.max(.4, h);
      }
      H[i] = h; T[i] = t; BI[i] = b;
    }
    // lahar: danau kawah + 3 aliran menuruni lereng (sudut sama dengan peta 2D)
    if (VC) {
      const lava = (x, y, w, dig) => {
        for (let iy = Math.floor((y - w) / TX); iy <= Math.ceil((y + w) / TX); iy++) for (let ix = Math.floor((x - w) / TX); ix <= Math.ceil((x + w) / TX); ix++) {
          if (ix < 0 || iy < 0 || ix >= NX || iy >= NY) continue; const i = iy * NX + ix, d = Math.hypot((ix + .5) * TX - x, (iy + .5) * TX - y); if (d > w) continue;
          if ((T[i] & 15) === TER.ROAD || (T[i] & 15) === TER.URBAN || (T[i] & 15) === TER.WATER) continue;
          if (!(T[i] & 64)) H[i] -= dig * (1 - d / w); T[i] |= 64;
        }
      };
      lava(VC.x, VC.y, VC.dc * .8, 0);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + g.seed % 7;
        for (let r = VC.dc * .9; r < VC.R * .9; r += 2) { const c = r / W.CELL, an = a + Math.sin(c * 1.7) * .25; lava(VC.x + Math.cos(an) * r, VC.y + Math.sin(an) * r, 5.5 * (1 - .45 * r / VC.R), 1.3); }
      }
    }
    // ratakan area markas/objektif (halus)
    for (const z of zones) {
      const cx = Math.floor(z[0] / TX), cy = Math.floor(z[1] / TX), r = z[2], rr = Math.ceil((r + 60) / TX);
      let hp = 0, n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { hp += H[(cy + dy) * NX + cx + dx]; n++; } hp /= n;
      for (let iy = Math.max(0, cy - rr); iy < Math.min(NY, cy + rr); iy++) for (let ix = Math.max(0, cx - rr); ix < Math.min(NX, cx + rr); ix++) {
        const d = Math.hypot((ix - cx) * TX, (iy - cy) * TX); if (d > r + 60) continue;
        const k = d < r ? 1 : 1 - (d - r) / 60, s = k * k * (3 - 2 * k), i = iy * NX + ix;
        if (T[i] !== TER.WATER) H[i] += (hp - H[i]) * s;
      }
    }
    // pangkalan musuh (W.facOf): seluruh area rata setinggi markas, tepinya berbaur halus dengan medan sekitar
    const FAC = W.facOf((g.HQR[0] + .5) * W.CELL, (g.HQR[1] + .5) * W.CELL), FB = W.FACB, PB = W.PADB.map(p => { const x = (g.HQB[0] + .5) * W.CELL + p[0], y = (g.HQB[1] + .5) * W.CELL + p[1]; return [x - 16, y - 16, x + 16, y + 16]; }), FR = FAC.rects.concat(PB);
    const inFac = (x, y, m) => { for (const r of FR) if (x > r[0] - m && x < r[2] + m && y > r[1] - m && y < r[3] + m) return true; return false; };
    {
      const cx = Math.floor(FAC.hx / TX), cy = Math.floor(FAC.hy / TX); let hp = 0, n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { hp += H[(cy + dy) * NX + cx + dx]; n++; } hp = Math.max(.6, hp / n);
      const x0 = FAC.hx + FB[0], x1 = FAC.hx + FB[1], y0 = FAC.hy + FB[2], y1 = FAC.hy + FB[3], MG = 70;
      for (let iy = Math.max(0, Math.floor((y0 - MG) / TX)); iy <= Math.min(NY - 1, Math.ceil((y1 + MG) / TX)); iy++) for (let ix = Math.max(0, Math.floor((x0 - MG) / TX)); ix <= Math.min(NX - 1, Math.ceil((x1 + MG) / TX)); ix++) {
        const wx = (ix + .5) * TX, wy = (iy + .5) * TX, d = Math.hypot(Math.max(x0 - wx, 0, wx - x1), Math.max(y0 - wy, 0, wy - y1)), i = iy * NX + ix; if (d > MG) continue;
        if (d <= 0) { T[i] = TER.URBAN; H[i] = hp; continue; }
        if ((T[i] & 15) === TER.WATER) continue;
        const k = 1 - d / MG; H[i] += (hp - H[i]) * k * k * (3 - 2 * k);
      }
    }
    // jalan 3D: aspal ±3,6 m dari garis tengah rute (sel jalan 2D yang lebar menjadi tanah biasa di luar itu)
    const RS = []; for (const rd of (g.roads || [])) for (let k = 0; k < rd.length - 1; k++) RS.push([rd[k][0] * W.CELL, rd[k][1] * W.CELL, rd[k + 1][0] * W.CELL, rd[k + 1][1] * W.CELL]);
    const roadD = (x, y) => { let m = 1e9; for (const r of RS) { const dx = r[2] - r[0], dy = r[3] - r[1], l2 = dx * dx + dy * dy || 1, t = clamp(((x - r[0]) * dx + (y - r[1]) * dy) / l2, 0, 1), ex = r[0] + dx * t - x, ey = r[1] + dy * t - y, d = ex * ex + ey * ey; if (d < m) m = d; } return Math.sqrt(m); };
    const RD = new Float32Array(N).fill(99);
    for (let i = 0; i < N; i++) if ((T[i] & 15) === TER.ROAD || (T[i] & 15) === TER.URBAN) RD[i] = roadD((i % NX + .5) * TX, (Math.floor(i / NX) + .5) * TX);
    // ratakan permukaan jalan (rata-rata tetangga) agar tidak bergelombang
    for (let i = 0; i < N; i++) if (RD[i] < 6 && !(T[i] & 64)) { const ix = i % NX, iy = Math.floor(i / NX); let s2 = 0, n2 = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = ix + dx, y = iy + dy; if (x >= 0 && y >= 0 && x < NX && y < NY) { s2 += H[y * NX + x]; n2++; } } H[i] = Math.max(.45, s2 / n2); }
    const G = H.slice();   // tanah tanpa bangunan
    /* distance field jalan (PC): tepi jalan tajam & marka tanpa terikat petak 2,5 m. RDF per texel: [jarak bertanda dari garis tengah, sin & cos posisi sepanjang jalan (periode 12 m, 0 = tanpa marka), setengah lebar] */
    const DESK = !F.opts.mobile && !F.swGL, RDF = DESK ? new Float32Array(N * 4) : null;
    if (DESK) for (let i = 0; i < N; i++) RDF[i * 4] = 30;
    const rdSeg = (x0, y0, x1, y1, hw, s0, mark) => {
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1, L = Math.sqrt(l2), mg = hw + 8;
      for (let iy = Math.max(0, Math.floor((Math.min(y0, y1) - mg) / TX)); iy <= Math.min(NY - 1, Math.ceil((Math.max(y0, y1) + mg) / TX)); iy++) for (let ix = Math.max(0, Math.floor((Math.min(x0, x1) - mg) / TX)); ix <= Math.min(NX - 1, Math.ceil((Math.max(x0, x1) + mg) / TX)); ix++) {
        const wx = (ix + .5) * TX, wy = (iy + .5) * TX, t = clamp(((wx - x0) * dx + (wy - y0) * dy) / l2, 0, 1), ex = x0 + dx * t - wx, ey = y0 + dy * t - wy, d = Math.hypot(ex, ey), j = (iy * NX + ix) * 4;
        if (d >= Math.abs(RDF[j])) continue;
        const a = (s0 + t * L) / 12 * 6.28318;
        RDF[j] = (dx * (wy - y0) - dy * (wx - x0)) >= 0 ? d : -d; RDF[j + 1] = mark * Math.sin(a); RDF[j + 2] = mark * Math.cos(a); RDF[j + 3] = hw;
      }
    };
    if (DESK) for (const rd of (g.roads || [])) { let s0 = 0; for (let k = 0; k < rd.length - 1; k++) { const x0 = rd[k][0] * W.CELL, y0 = rd[k][1] * W.CELL, x1 = rd[k + 1][0] * W.CELL, y1 = rd[k + 1][1] * W.CELL; rdSeg(x0, y0, x1, y1, 3.6, s0, 1); s0 += Math.hypot(x1 - x0, y1 - y0); } }

    /* --- 2) warna: albedo + material (WebGL) dan warna berbayang (cadangan perangkat lunak) --- */
    const L = (() => { const az = F.TOD.DAY.sun[0] * Math.PI / 180, el = 36 * Math.PI / 180; return [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)]; })();
    const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const setTex = (i, col, wet, m) => { const j = i * 4; ALB[j] = clamp(col[0], 0, 255); ALB[j + 1] = clamp(col[1], 0, 255); ALB[j + 2] = clamp(col[2], 0, 255); ALB[j + 3] = wet * 255; MAT[j] = m[0] * 255; MAT[j + 1] = m[1] * 255; MAT[j + 2] = m[2] * 255; MAT[j + 3] = m[3] * 255; };
    for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      const wx = (ix + .5) * TX, wy = (iy + .5) * TX, i = iy * NX + ix, t0 = T[i] & 15, t = t0 === TER.ROAD && RD[i] >= 5.5 ? TER.PLAIN : t0, h = H[i], b = BI[i];
      const xl = H[iy * NX + Math.max(0, ix - 1)], xr = H[iy * NX + Math.min(NX - 1, ix + 1)], yu = H[Math.max(0, iy - 1) * NX + ix], yd = H[Math.min(NY - 1, iy + 1) * NX + ix];
      const sx = (xr - xl) / (2 * TX), sy = (yd - yu) / (2 * TX), nl = Math.hypot(sx, sy, 1), dot = (-sx * L[0] - sy * L[1] + L[2]) / nl;
      let lit = clamp(.52 + .62 * Math.max(0, dot), .45, 1.2);
      const slope = Math.hypot(sx, sy), n1 = vn(wx / 30, wy / 30, seed + 41), n2 = vn(wx / 9, wy / 9, seed + 42), n3 = vn(wx / 2.6, wy / 2.6, seed + 43);
      let col, wet = 0, m = [0, 0, 0, 0];
      if (t === TER.WATER) { const dep = clamp(-h / 9, 0, 1); col = mix([96, 112, 90], [40, 52, 50], Math.sqrt(dep)); m = [0, .6, 0, 0]; wet = 1; }
      else if (T[i] & 64) { col = [255, 116, 34]; m = [0, 0, 0, 1]; }
      else if (DESK && (t === TER.ROAD && RD[i] < 5.5 || t === TER.URBAN && RD[i] < 4)) { col = b === BIO.DESERT ? [176, 152, 112] : [128, 116, 92]; m = [.2, .3, 0, 0]; }   // PC: aspal digambar dari distance field; di bawahnya bahu berkerikil
      else if (t === TER.ROAD && RD[i] < 3.6) { col = b === BIO.DESERT ? mix([104, 96, 84], [86, 80, 72], n2) : mix([66, 66, 68], [54, 54, 56], n2); m = [0, 0, 1, 0]; }
      else if (t === TER.ROAD && RD[i] < 5.5) { col = b === BIO.DESERT ? [176, 152, 112] : [128, 116, 92]; m = [.2, .3, 0, 0]; }   // bahu jalan berkerikil
      else if (t === TER.URBAN) { if (RD[i] < 4) { col = mix([66, 66, 68], [54, 54, 56], n2); m = [0, 0, 1, 0]; } else { col = b === BIO.DESERT ? mix([196, 178, 146], [176, 160, 130], n1) : mix([132, 130, 124], [112, 112, 108], n1); m = [0, 0, .75, 0]; } }
      else if (b === BIO.DESERT) {
        if (t === TER.HILL) { const rk = clamp(slope * 2.2 + .25, 0, 1); col = mix(mix([206, 172, 120], [222, 190, 138], n1), mix([170, 120, 80], [196, 148, 100], n2), rk); m = [rk, 1 - rk, 0, 0]; }
        else if (t === TER.FOREST) { col = mix([112, 120, 62], [150, 140, 86], n2); m = [0, .3, 0, 0]; }
        else { col = mix([208, 178, 126], [226, 196, 144], n1); col = mix(col, [184, 150, 104], n2 * .35); m = [0, 1, 0, 0]; }
      } else if (b === BIO.SWAMP) {
        if (t === TER.HILL) { col = mix([84, 94, 60], [104, 104, 80], n1); m = [clamp(slope * 2, 0, 1), 0, 0, 0]; }
        else { col = t === TER.FOREST ? mix([40, 54, 30], [52, 62, 36], n1) : mix([66, 80, 44], [52, 60, 38], n1); wet = clamp((vn(wx / 11, wy / 11, seed + 44) - .42) * 4, 0, 1); col = mix(col, [44, 46, 34], wet * .6); }
      } else if (b === BIO.VOLC) {
        if (t === TER.HILL) { const rk = clamp(slope * 2 + .35, 0, 1); col = mix(mix([66, 62, 58], [84, 78, 70], n1), mix([42, 40, 40], [62, 56, 54], n2), rk); m = [rk, 0, 0, 0]; }
        else if (t === TER.FOREST) { col = mix([60, 64, 44], [74, 72, 52], n1); }
        else { col = mix([76, 72, 66], [58, 56, 54], n1); if (n2 > .6) col = mix(col, [96, 92, 64], (n2 - .6) * 2); m = [.25, 0, 0, 0]; }
        if (VC) { const d = Math.hypot(wx - VC.x, wy - VC.y); if (d < VC.R) { col = mix(col, [44, 38, 36], clamp(1 - d / VC.R, 0, 1) * .8); m[0] = Math.max(m[0], clamp(1.2 - d / VC.R, 0, 1)); } }
      } else {
        if (t === TER.FOREST) { col = mix([42, 60, 30], [56, 76, 38], n1); col = mix(col, [34, 46, 26], n2 * .5); }
        else if (t === TER.HILL) { const rk = clamp(slope * 2.4 + (h - 30) * .012, 0, 1); col = mix(mix([84, 106, 56], [114, 112, 80], n1), mix([112, 104, 92], [146, 142, 132], clamp((h - 30) / 50, 0, 1)), rk); m = [rk, 0, 0, 0]; }
        else { col = mix([80, 106, 52], [112, 124, 64], n1); if (n2 > .66) col = mix(col, [146, 132, 88], (n2 - .66) * 2.2); }
      }
      if (t !== TER.WATER && t !== TER.ROAD && !(T[i] & 64) && h < 1.5) { const k = clamp((1.5 - h) / 1.0, 0, 1) * .9; col = mix(col, b === BIO.SWAMP ? [70, 66, 46] : [198, 186, 142], k); if (b !== BIO.SWAMP) m = [m[0], Math.max(m[1], k), m[2], 0]; else wet = Math.max(wet, k); }   // pantai / tepi rawa
      setTex(i, col, wet, m);
      const gr = (n3 - .5) * 11;
      if (T[i] & 64) { C[i] = pack(255, 120 + n3 * 60, 30); continue; }
      if (t === TER.WATER) { const dep = clamp(-h / 9, 0, 1); col = mix([58, 118, 128], [16, 50, 86], Math.sqrt(dep)); lit = 1; }
      if (t === TER.ROAD) lit = Math.max(lit, .9);
      C[i] = pack((col[0] + gr) * lit, (col[1] + gr) * lit, (col[2] + gr * .8) * lit);
    }

    /* --- 3) kota: setiap kota/pos punya gaya berbeda (dan menyesuaikan bioma) --- */
    const blds = [], props = [], cities = [];
    const trees = [], tc = new Map();
    const add = (x, y, kind, hh, rr) => {
      if (kind < 9 && inFac(x, y, 3)) return false;   // tidak ada pohon/batu di landasan, garasi, atau helipad
      const ix = clamp(Math.floor(x / TX), 0, NX - 1), iy = clamp(Math.floor(y / TX), 0, NY - 1), t = T[iy * NX + ix];
      if ((t & 15) === TER.WATER || (kind < 9 && (t & 15) === TER.ROAD) || (t & 16) || (t & 64)) return false;
      const k = Math.floor(y / W.CELL) * GW + Math.floor(x / W.CELL), a = tc.get(k) || []; tc.set(k, a);
      const r1 = h2(Math.floor(x * 3), Math.floor(y * 3), seed + 61), r2 = h2(Math.floor(y * 3), Math.floor(x * 3), seed + 62);
      a.push(trees.length / 6);
      const z = G[iy * NX + ix];
      if (hh) trees.push(x, y, z, hh, kind, rr);
      else if (kind === 2) trees.push(x, y, z, .7 + r1 * .8, 2, .5 + r2 * .6);            // semak
      else if (kind === 3) trees.push(x, y, z, .5 + r1 * 1.6, 3, .7 + r2 * 1.2);          // batu
      else if (kind === 4) trees.push(x, y, z, 7 + r1 * 6, 4, .45 + r2 * .2);             // palem
      else if (kind === 5) trees.push(x, y, z, 2.8 + r1 * 3.2, 5, .3 + r2 * .1);          // kaktus saguaro
      else if (kind === 6) trees.push(x, y, z, 10 + r1 * 8, 6, .9 + r2 * .5);             // cemara rawa (cypress)
      else if (kind === 7) trees.push(x, y, z, 5 + r1 * 6, 7, .45 + r2 * .3);             // pohon mati / hangus
      else if (kind === 8) trees.push(x, y, z, 1.3 + r1 * 1, 8, .7 + r2 * .5);            // ilalang / gelagah
      else trees.push(x, y, z, 6 + r1 * 7, kind, .8 + r2 * .7);                           // pinus (0) / pohon daun lebar (1)
      return true;
    };
    const prop = (k, x, y, yaw, o) => {
      const ix = clamp(Math.floor(x / TX), 0, NX - 1), iy = clamp(Math.floor(y / TX), 0, NY - 1), t = T[iy * NX + ix];
      if ((t & 16) || (t & 64) || (t & 15) === TER.WATER) return;
      const p = Object.assign({ k, x, y, z: G[iy * NX + ix], yaw, ci: cities.length - 1, c: h2(Math.floor(x), Math.floor(y), seed + 90) }, o || {}); props.push(p);
      // kendaraan & kontainer = deretan lingkaran kecil sepanjang badannya (setengah panjang, setengah lebar, tinggi) — dulu satu lingkaran lebar
      // (mobil Ø ±4,5 m) sehingga sisi mobil terasa seperti tembok jauh sebelum menyentuh bodinya
      const S = { car: [2.2, .95, 1.6], wreck: [2.2, .95, 1.4], truck: [3, 1.15, 2.8], bus: [5.6, 1.25, 3.1], cont: [6.05, 1.22, 2.6 * ((o && o.stack) || 1)], tent: [3.5, 2.4, 2.6], fuel: [3.1, 1.15, 2.4], hmv: [2.4, 1.1, 1.9] }[k];
      if (S) { const n = Math.max(2, Math.ceil(S[0] / S[1])), c = Math.cos(yaw), s = Math.sin(yaw); for (let i = 0; i < n; i++) { const f = -S[0] + S[1] + i * 2 * (S[0] - S[1]) / (n - 1); add(x + c * f, y + s * f, 9, S[2], S[1] / .8); } return; }
      const R = { hesco: 1.1, sand: .9, barrel: .5, lamp: .25, crate: .8, monu: 2.6, stall: 1.6, bench: .6, pole: .25, gen: .9, radar: .7, mast: .3, flag: .15 }[k];
      if (R) add(x, y, 9, k === 'lamp' || k === 'pole' || k === 'mast' || k === 'flag' ? 9 : k === 'radar' ? 15 : k === 'monu' ? 8 : k === 'barrel' || k === 'bench' ? 1 : 2, R);
    };
    const used = new Set(), ORDER = ['downtown', 'oldtown', 'modern', 'kampung', 'industrial'];
    const styleOf = (cc, i) => {   // gaya mengikuti bioma, tetapi tiap kota objektif dibuat berbeda
      const b = bioC(cc[0], cc[1]);
      let st = b === BIO.DESERT ? 'desert' : b === BIO.SWAMP ? 'kampung' : b === BIO.VOLC ? 'industrial' : ORDER[i % 5];
      if (used.has(st)) st = ORDER.find(o => !used.has(o)) || st;
      used.add(st); return st;
    };
    const CEN = [[g.HQB, 'base', 'B'], [g.HQR, 'base', 'R']].concat(g.OBJ.map((o, i) => [[o[1], o[2]], styleOf([o[1], o[2]], i), 'N', o[0]]));
    const baseT = i => T[i] & 15;
    for (const [cc, st, team, name] of CEN) {
      const S = STY[st], cx = (cc[0] + .5) * W.CELL, cy = (cc[1] + .5) * W.CELL, LOT = S.lot, sd = seed + cc[0] * 7 + cc[1] * 13;
      cities.push({ x: cx, y: cy, st, team, name: name || '' });
      const NL = st === 'base' ? 6 : Math.ceil(175 / LOT), org = st === 'kampung' || st === 'desert' || st === 'oldtown';   // kota mengisi seluruh area perkotaan (dulu kavling kecil hanya ±84 m → lapangan abu-abu kosong di sekelilingnya)
      // permukaan tanah kota per gaya (dulu semua beton abu-abu polos): pekarangan & trotoar, lalu jalan kota dicat per kavling jalan
      const GS = { kampung: [[118, 106, 76], [92, 106, 58], [.05, .45, .1, 0]], desert: [[204, 184, 146], [186, 166, 128], [0, .8, .2, 0]], oldtown: [[156, 144, 124], [138, 128, 110], [.25, 0, .55, 0]],
        downtown: [[146, 146, 142], [128, 128, 126], [0, 0, .8, 0]], modern: [[150, 150, 146], [134, 136, 132], [0, 0, .8, 0]], industrial: [[124, 122, 116], [104, 104, 100], [.1, 0, .7, 0]],
        base: [[150, 142, 120], [126, 124, 104], [.12, .45, .35, 0]] }[st];   // markas: kerikil & tanah padat (dulu beton abu-abu polos)
      const SS = { kampung: [[124, 106, 80], [.15, .55, 0, 0]], desert: [[170, 148, 112], [.1, .7, 0, 0]], oldtown: [[96, 92, 88], [.35, 0, .6, 0]], downtown: [[62, 62, 64], [0, 0, 1, 0]], modern: [[64, 64, 66], [0, 0, 1, 0]], industrial: [[72, 72, 72], [0, 0, 1, 0]], base: [[74, 74, 72], [0, 0, 1, 0]] }[st];
      const paint = (x0, y0, x1, y1, f) => { for (let iy = Math.max(0, Math.floor(y0 / TX)); iy <= Math.min(NY - 1, Math.floor((y1 - .01) / TX)); iy++) for (let ix = Math.max(0, Math.floor(x0 / TX)); ix <= Math.min(NX - 1, Math.floor((x1 - .01) / TX)); ix++) { const i = iy * NX + ix; if ((T[i] & 15) !== TER.URBAN || (T[i] & 16) || RD[i] < 4) continue; f(i, (ix + .5) * TX, (iy + .5) * TX); } };
      const tint = (i, col, m, wx, wy) => { const n = vn(wx / 3.1, wy / 3.1, seed + 93) * 14 - 7; const c = [col[0] + n, col[1] + n, col[2] + n * .8]; setTex(i, c, 0, m); C[i] = pack(c[0] * .95, c[1] * .95, c[2] * .95); };
      if (GS) paint(cx - NL * LOT, cy - NL * LOT, cx + NL * LOT, cy + NL * LOT, (i, wx, wy) => { let z = 0; for (const q of zones) if (q[2] >= 40) z = Math.max(z, clamp((q[2] - Math.hypot(wx - q[0], wy - q[1])) / 8, 0, 1)); const g = mix(GS[0], GS[1], vn(wx / 9, wy / 9, seed + 92)); tint(i, mix(g, [158, 150, 134], z), z > .5 ? [.15, 0, .6, 0] : GS[2], wx, wy); });   // alun-alun pos: paving batu, tepi berbaur
      for (let ly = -NL; ly < NL; ly++) for (let lx = -NL; lx < NL; lx++) {
        const x0 = cx + lx * LOT, y0 = cy + ly * LOT, mx = x0 + LOT / 2, my = y0 + LOT / 2, rnd = k => h2(lx + 50, ly + 50, sd + k);
        const ci = clamp(Math.floor(my / TX), 0, NY - 1) * NX + clamp(Math.floor(mx / TX), 0, NX - 1);
        if (baseT(ci) !== TER.URBAN) continue;
        if (st === 'base') { let hit = false; for (const r of FR) if (x0 < r[2] && x0 + LOT > r[0] && y0 < r[3] && y0 + LOT > r[1]) { hit = true; break; } if (hit) continue; }   // kavling yang menimpa fasilitas dikosongkan
        let inZone = false; for (const z of zones) { const d = Math.hypot(mx - z[0], my - z[1]), zr = st !== 'base' ? z[2] + LOT * .55 : z[2] <= 20 ? 18 : d < 1e9 && Math.hypot(z[0] - cx, z[1] - cy) < 5 ? 44 : z[2] + LOT * .55; if (d < zr) { inZone = true; break; } }   // markas (v2.2.5): pelataran HQ ±44 m & ruang struktur senjata 18 m (dulu 74 m & 32 m → tengah markas kosong luas)
        const street = S.st ? (((lx % S.st) + S.st) % S.st === 0 || ((ly % S.st) + S.st) % S.st === 0) : rnd(1) < .22;
        if (inZone || street) {   // jalan & lapangan: lampu, mobil parkir, penghalang
          if (inZone) continue;
          const alongX = S.st ? ((ly % S.st) + S.st) % S.st === 0 : rnd(9) < .5, yaw = alongX ? 0 : Math.PI / 2;
          const cross = S.st && ((lx % S.st) + S.st) % S.st === 0 && ((ly % S.st) + S.st) % S.st === 0;   // perempatan: biarkan lapang
          if (DESK && SS && SS[1][2] >= 1) {   // PC: jalan kota aspal = distance field, kavlingnya trotoar/paving; perempatan tanpa marka
            const hwS = LOT / 2 - 1.6;
            paint(x0, y0, x0 + LOT, y0 + LOT, (i, wx, wy) => tint(i, GS[0], GS[2], wx, wy));
            if (cross || alongX) rdSeg(x0, my, x0 + LOT, my, hwS, x0, cross ? 0 : 1);
            if (cross || !alongX) rdSeg(mx, y0, mx, y0 + LOT, hwS, y0, cross ? 0 : 1);
          } else if (SS) paint(x0, y0, x0 + LOT, y0 + LOT, (i, wx, wy) => { const e = alongX ? Math.min(wy - y0, y0 + LOT - wy) : Math.min(wx - x0, x0 + LOT - wx); tint(i, e < 1.6 && !cross && !org ? GS[0] : SS[0], e < 1.6 && !cross && !org ? GS[2] : SS[1], wx, wy); });   // badan jalan + trotoar di tepinya
          if (st !== 'base' && rnd(2) < .6) prop(st === 'kampung' || st === 'desert' ? 'pole' : 'lamp', x0 + 1, y0 + 1, yaw);   // kampung & gurun: tiang listrik kayu, kota: lampu jalan
          if (!cross && rnd(3) < (st === 'base' ? .5 : .45)) prop(st === 'base' ? 'truck' : (st === 'downtown' || st === 'modern') && rnd(23) < .12 ? 'bus' : rnd(4) < .2 ? 'wreck' : 'car', mx + (alongX ? rnd(5) * 6 - 3 : LOT * .3), my + (alongX ? LOT * .3 : rnd(5) * 6 - 3), yaw + (rnd(6) < .5 ? 0 : Math.PI));   // parkir di tepi jalan
          else if (!cross && org && rnd(24) < .3) prop('stall', mx + (alongX ? 0 : -LOT * .32), my + (alongX ? -LOT * .32 : 0), yaw + (alongX ? 0 : Math.PI / 2));   // warung pinggir jalan
          else if (!cross && st !== 'base' && st !== 'industrial' && rnd(25) < .25) prop('bench', mx + (alongX ? 0 : -LOT * .36), my + (alongX ? -LOT * .36 : 0), yaw + (alongX ? 0 : Math.PI / 2));
          if (rnd(7) < .2) prop(st === 'base' ? 'hesco' : 'barrel', mx - 3, my - 3, rnd(8) * 6);
          if ((st === 'kampung' || st === 'desert') && rnd(10) < .35) add(mx + 4, my - 4, 4);
          else if ((st === 'oldtown' || st === 'modern' || st === 'downtown') && rnd(10) < .3) add(x0 + 2.5, y0 + LOT / 2, 1);
          continue;
        }
        if ((st === 'kampung' || st === 'oldtown' || st === 'modern') && rnd(26) < .1) {   // taman / kebun kecil di antara rumah
          add(mx - 2, my + 1.5, st === 'kampung' ? 4 : 1); add(mx + 2.5, my - 2, 1); add(mx + 1, my + 3, 2); if (rnd(27) < .5) prop('bench', mx, my - 3.5, 0);
          continue;
        }
        const mg = S.mg + rnd(11) * 1.5;
        let bx0 = x0 + mg, bx1 = x0 + LOT - mg, by0 = y0 + mg, by1 = y0 + LOT - mg;
        if (st === 'kampung' || st === 'desert') { const w = (bx1 - bx0) * (.6 + rnd(12) * .4), hgt = (by1 - by0) * (.6 + rnd(13) * .4); bx0 += rnd(14) * (bx1 - bx0 - w); by0 += rnd(15) * (by1 - by0 - hgt); bx1 = bx0 + w; by1 = by0 + hgt; }
        if (st === 'industrial' && rnd(16) < .25) {   // halaman pabrik: kontainer & tangki
          for (let k = 0; k < 4; k++) prop('cont', x0 + 7 + (k % 2) * 13, y0 + 8 + (k >> 1) * 7, 0, { stack: rnd(20 + k) < .4 ? 2 : 1 });
          continue;
        }
        const ia = Math.ceil(bx0 / TX - .5), ib = Math.floor(bx1 / TX - .5), ja = Math.ceil(by0 / TX - .5), jb = Math.floor(by1 / TX - .5);
        if (ib - ia < 1 || jb - ja < 1) continue;
        let ok = true, gz = -1e9, gmin = 1e9;
        for (let j = ja; j <= jb && ok; j++) for (let k = ia; k <= ib; k++) { const i = j * NX + k; if (baseT(i) !== TER.URBAN || (T[i] & 16)) { ok = false; break; } gz = Math.max(gz, G[i]); gmin = Math.min(gmin, G[i]); }
        if (!ok) continue;
        for (const z of zones) { const qx = clamp(z[0], ia * TX, (ib + 1) * TX), qy = clamp(z[1], ja * TX, (jb + 1) * TX), zr = st === 'base' ? (z[2] <= 20 ? 9 : Math.hypot(z[0] - cx, z[1] - cy) < 5 ? 34 : z[2]) : z[2]; if (Math.hypot(qx - z[0], qy - z[1]) < zr + 2) ok = false; }
        if (!ok) continue;
        const dc = Math.hypot(mx - cx, my - cy), r = rnd(17);
        let h, kind = 'box', roofH = 0, fl = 1;
        if (st === 'downtown') { fl = Math.round(5 + r * 7 + clamp(1 - dc / 150, 0, 1) * 6); h = fl * 3.4 + 1.2; kind = r < .55 ? 'glass' : 'office'; }
        else if (st === 'modern') { fl = 4 + Math.floor(r * 5); h = fl * 3.1 + .8; kind = 'apart'; }
        else if (st === 'oldtown') { fl = 2 + Math.floor(r * 3); h = fl * 3.3; roofH = 2.6; kind = 'house'; }
        else if (st === 'kampung') { fl = r < .75 ? 1 : 2; h = fl * 3.1; roofH = 2.2; kind = r < .08 ? 'mosque' : 'kamp'; }
        else if (st === 'desert') { fl = 1 + Math.floor(r * 2.6); h = fl * 3.2; kind = r < .12 ? 'dome' : 'adobe'; }
        else if (st === 'industrial') { h = 7 + r * 6; kind = r < .5 ? 'hall' : r < .75 ? 'saw' : 'plant'; }
        else { const bt = team === 'R' ? r < .4 : r < .5; h = bt ? 4.2 : 8.5; roofH = bt ? 1.4 : 0; kind = bt ? 'barrack' : 'hangar'; if (r > .85) { h = 3; kind = 'bunkr'; } }
        const b = { ci: cities.length - 1, x0: ia * TX, x1: (ib + 1) * TX, y0: ja * TX, y1: (jb + 1) * TX, gz, gmin, h, roofH, kind, st, fl, team, seed: (rnd(18) * 1e6) | 0, tone: rnd(19) };
        blds.push(b);
        for (let j = ja; j <= jb; j++) for (let k = ia; k <= ib; k++) {
          const i = j * NX + k, wall = k === ia || k === ib || j === ja || j === jb;
          H[i] = gz + h + roofH * .6; T[i] = (T[i] & 15) | 16 | (wall ? 32 : 0);
          const tn = b.tone, side = k === ia || k === ib ? .86 : 1;
          C[i] = wall ? pack((150 + tn * 36) * side, (142 + tn * 28) * side, (128 + tn * 20) * side) : pack(96 + tn * 30, 98 + tn * 24, 104 + tn * 18);
        }
        if (st === 'base' && team !== 'N' && rnd(21) < .5) prop('sand', b.x1 + 2, (b.y0 + b.y1) / 2, Math.PI / 2);
      }
      if (team === 'N') {   // alun-alun di tengah pos: tiang bendera objektif di pusat, tugu, pohon peneduh, bangku, lampu, warung pasar, mobil parkir
        const rr = k => h2(cc[0] + k, cc[1] - k, sd + 300), a0 = rr(1) * 6.283, palm = st === 'kampung' || st === 'desert';
        prop('monu', cx + Math.cos(a0) * 19, cy + Math.sin(a0) * 19, a0);
        for (let i = 0; i < 12; i++) { const a = a0 + (i + .5) / 12 * 6.283; add(cx + Math.cos(a) * 33, cy + Math.sin(a) * 33, palm ? 4 : 1); }
        for (let i = 0; i < 6; i++) { const a = a0 + 1.05 * i + .52; prop('bench', cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, a + Math.PI / 2); }
        for (let i = 0; i < 8; i++) { const a = a0 + i * .785; prop('lamp', cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, a + Math.PI); }
        if (org) for (let i = 0; i < 6; i++) { const a = a0 + Math.PI * .7 + i * .2; prop('stall', cx + Math.cos(a) * 43, cy + Math.sin(a) * 43, a + Math.PI / 2); }
        for (let i = 0; i < 4; i++) { const a = a0 + Math.PI * 1.6 + i * .17; prop('car', cx + Math.cos(a) * 44, cy + Math.sin(a) * 44, a + Math.PI / 2); }
      }
      if (st === 'base') {   // markas yang hidup: tiang bendera, helipad, lampu sorot, menara jaga, tenda, pool kendaraan berjaring kamuflase, BBM, radar, logistik
        const sg = team === 'B' ? 1 : -1;   // markas lawan dicerminkan
        const okAt = (x, y, r) => {
          if (inFac(x, y, r)) return false;
          if (x < 12 || y < 12 || x > W.WW - 12 || y > W.WH - 12 || Math.hypot(x - cx, y - cy) < 17) return false;
          for (const z of zones) if (z[2] <= 20 && Math.hypot(x - z[0], y - z[1]) < 11 + r) return false;   // jangan menimpa SAM / CAESAR / bunker / sarang SMB
          for (let a = 0; a < 8; a++) for (const q of [0, r * .5, r]) { const ix = clamp(Math.floor((x + Math.cos(a * .785) * q) / TX), 0, NX - 1), iy = clamp(Math.floor((y + Math.sin(a * .785) * q) / TX), 0, NY - 1), t = T[iy * NX + ix]; if ((t & 16) || (t & 64) || (t & 15) === TER.WATER) return false; }
          return true;
        };
        const put = (k, dx, dy, yaw, r, o) => { const x = cx + dx * sg, y = cy + dy; if (!okAt(x, y, r)) return null; prop(k, x, y, sg > 0 ? yaw : Math.PI - yaw, o); return [x, y]; };
        for (let i = -1; i <= 1; i++) put('flag', -21, i * 3.4, Math.PI, 1, { c: (i + 1.5) / 3 });
        put('pad', -30, 26, 0, 10);
        for (let k = 0; k < 6; k++) { const a = (k + .5) / 6 * 6.283; put('mast', Math.cos(a) * 40, Math.sin(a) * 40, a + Math.PI, 1.5); }
        for (const [x, y] of [[-100, -100], [-100, 100], [100, -100], [100, 100], [0, -128], [0, 128], [-128, 0]]) put('tower', x, y, Math.atan2(y, x * sg) * 0 + Math.atan2(y, x), 3);
        for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) put('tent', -40 - r * 9, -14 - k * 9.5, 0, 4);
        for (let k = 0; k < 3; k++) { const p = put('net', 22 + k * 9.5, -36, Math.PI / 2, 4.5); if (p) prop(k === 1 ? 'truck' : 'hmv', p[0], p[1], Math.PI / 2 + (k === 1 ? 0 : .04)); }
        put('fuel', 40, 28, 0, 3.5); put('fuel', 40, 36, 0, 3.5); put('gen', 32, 22, .3, 1.5);
        put('radar', -20, -36, 0, 3);
        for (let k = 0; k < 6; k++) put('crate', 22 + (k % 3) * 2.4, 32 + (k > 2 ? 2.6 : 0), (k * .37) % .4, 1.2, { stack: k % 2 ? 2 : 1 });
        put('truck', 14, -26, 0, 3.5); put('hmv', 20, -26, 0, 3); put('hmv', 26, -26, 0, 3);
        if (team === 'B') for (const [dx, dy] of W.PADB) prop('pad', cx + dx, cy + dy, 0);   // helipad garnisun heli
        if (team === 'R') {   // pangkalan musuh: landasan, taksiway, apron, 3 hanggar, garasi, helipad, menara kontrol
          const area = (x0, y0, x1, y1, c0, c1, m, nz) => { for (let iy = Math.max(0, Math.floor(y0 / TX)); iy <= Math.min(NY - 1, Math.floor((y1 - .01) / TX)); iy++) for (let ix = Math.max(0, Math.floor(x0 / TX)); ix <= Math.min(NX - 1, Math.floor((x1 - .01) / TX)); ix++) { const wx = (ix + .5) * TX, wy = (iy + .5) * TX, c = mix(c0, c1, vn(wx / nz, wy / nz, seed + 94)); setTex(iy * NX + ix, c, 0, m); C[iy * NX + ix] = pack(c[0], c[1], c[2]); } };
          const CONC = [[132, 130, 122], [114, 113, 106], [0, 0, .75, 0]], ASP = [[62, 62, 62], [50, 50, 52], [0, 0, 1, 0]], B0 = FB;
          area(FAC.hx + B0[0], FAC.hy + B0[2], FAC.hx + B0[1], FAC.hy + B0[3], [146, 138, 112], [122, 118, 100], [.12, .45, .35, 0], 9);   // tanah keras pangkalan
          const R0 = FAC.run, TW = FAC.twy, AP = FAC.apron;
          area(FAC.hx + 112, FAC.hy + 78, AP[0], FAC.hy + 238, CONC[0], CONC[1], CONC[2], 7); area(AP[0], AP[1], AP[2], AP[3], CONC[0], CONC[1], CONC[2], 7);
          for (const r of FAC.rects.slice(3)) area(r[0], r[1], r[2], r[3], CONC[0], CONC[1], CONC[2], 7);
          area(TW.x - TW.hw, TW.y0, TW.x + TW.hw, TW.y1 + TW.hw, ASP[0], ASP[1], ASP[2], 6); area(TW.x, TW.y1 - TW.hw, R0.x, TW.y1 + TW.hw, ASP[0], ASP[1], ASP[2], 6);
          area(R0.x - R0.hw, R0.y0, R0.x + R0.hw, R0.y1, ASP[0], ASP[1], ASP[2], 6);
          if (DESK) { rdSeg(R0.x, R0.y0, R0.x, R0.y1, R0.hw, 0, 0); rdSeg(TW.x, TW.y0, TW.x, TW.y1 + TW.hw, TW.hw, 0, 0); rdSeg(TW.x, TW.y1, R0.x, TW.y1, TW.hw, 0, 0); }
          const py = (R0.y0 + R0.y1) / 2, L = (R0.y1 - R0.y0) / 2;
          prop('rwy', R0.x, py, Math.PI / 2, { L, hw: R0.hw });
          prop('tline', TW.x, (TW.y0 + TW.y1) / 2, Math.PI / 2, { L: (TW.y1 - TW.y0) / 2 }); prop('tline', (TW.x + R0.x) / 2, TW.y1, 0, { L: (R0.x - TW.x) / 2 });
          const wall = (b, lx, ly, hh) => { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); add(b.x + c * lx - s * ly, b.y + s * lx + c * ly, 9, hh, 1.5); };
          for (const b of FAC.han) { prop('tline', (FAC.twy.x + b.x) / 2, b.y, 0, { L: (FAC.twy.x - b.x) / 2 }); prop('hgar', b.x, b.y, b.yaw); for (let i = 0; i <= 20; i++) { wall(b, -i * 2, 22.2, 9); wall(b, -i * 2, -22.2, 9); } for (let i = -11; i <= 11; i++) wall(b, -40, i * 2, 9); }
          for (const b of FAC.gar) { prop('garg', b.x, b.y, b.yaw); for (let i = 0; i <= 8; i++) { wall(b, -i * 2, 5.5, 6); wall(b, -i * 2, -5.5, 6); } for (let i = -2; i <= 2; i++) wall(b, -16, i * 2.4, 6); }
          for (const b of FAC.pad) prop('pad', b.x, b.y, 0);
          prop('atc', FAC.hx + 136, FAC.hy - 90, 0); for (const r of [[-5, 0], [5, 0], [0, -5], [0, 5]]) add(FAC.hx + 136 + r[0], FAC.hy - 90 + r[1], 9, 24, 2.4);
          /* v2.12 pangkalan lebih padat (pengguna: "banyak yang kosong, ada gap di mana-mana"): revetment parkir pesawat, lampu taksiway & landasan,
             lalu celah-celah kosong diisi kluster logistik (kontainer, tenda, pool kendaraan berjaring, depot BBM, peti & karung pasir) */
          for (const b of FAC.std) {   // revetment hesco tiap parkir pesawat, terbuka ke taksiway (timur)
            for (const sy of [-1, 1]) for (let i = 0; i < 6; i++) { const x = b.x - 13 + i * 3.4, y = b.y + sy * 15; prop('hesco', x, y, Math.PI / 2); add(x, y, 9, 1.4, 1.5); }
            for (let i = 0; i < 9; i++) { const x = b.x - 15, y = b.y - 13.6 + i * 3.4; prop('hesco', x, y, 0); add(x, y, 9, 1.4, 1.5); }
          }
          for (let y = TW.y0 + 10; y < TW.y1 - 16; y += 40) prop('lamp', TW.x + 11, y, Math.PI);   // lampu taksiway (sisi timur, tidak dilintasi pesawat)
          for (let y = R0.y0 + 20; y < R0.y1; y += 60) prop('lamp', R0.x + R0.hw + 5, y, Math.PI);
          for (let gy = B0[2] + 14; gy <= B0[3] - 14; gy += 24) for (let gx = B0[0] + 14; gx <= 104; gx += 24) {
            const x = FAC.hx + gx + (h2(gx + 500, gy + 500, seed + 303) - .5) * 6, y = FAC.hy + gy + (h2(gx + 500, gy + 500, seed + 304) - .5) * 6;
            if (!okAt(x, y, 10) || h2(gx + 500, gy + 500, seed + 300) < .22) continue;
            const kd = Math.floor(h2(gx + 500, gy + 500, seed + 301) * 7), yw = h2(gx + 500, gy + 500, seed + 302) < .5 ? 0 : Math.PI / 2, cw = Math.cos(yw), sw = Math.sin(yw), at = (f, l) => [x + cw * f - sw * l, y + sw * f + cw * l];
            const P2 = (k, f, l, yaw, o) => { const q = at(f, l); prop(k, q[0], q[1], yw + (yaw || 0), o); };
            if (kd === 0) { P2('cont', 0, -1.6, 0, { stack: 2 }); P2('cont', 0, 1.6, 0, { stack: 1 }); }
            else if (kd === 1) { P2('tent', -4.5, 0, 0); P2('tent', 4.5, 0, 0); P2('crate', 0, 4.5, .2); }
            else if (kd === 2) { P2('net', 0, 0, Math.PI / 2); P2(h2(gx, gy, seed + 305) < .5 ? 'truck' : 'hmv', 0, 0, Math.PI / 2); }
            else if (kd === 3) { P2('fuel', 0, -2.8, 0); P2('fuel', 0, 2.8, 0); P2('gen', 6, 0, .3); }
            else if (kd === 4) { for (let i = 0; i < 4; i++) P2('crate', -2 + (i % 2) * 2.4, -1.2 + (i > 1 ? 2.6 : 0), (i * .37) % .4, { stack: i % 2 ? 2 : 1 }); P2('sand', 0, 4.6, Math.PI / 2); P2('sand', 0, -4.6, Math.PI / 2); }
            else if (kd === 5) { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; P2('sand', Math.cos(a) * 3.2, Math.sin(a) * 3.2, a); } P2('crate', 0, 0, .4); }
            else { P2('cont', 0, 0, 0, { stack: 1 }); P2('truck', 0, 4.2, 0); }
          }
        }
      }
    }

    /* --- 4) vegetasi per bioma --- */
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const t = g.t[cy * GW + cx], b = bioC(cx, cy), sc = cx * 131 + cy * 17, P = (k, s) => (cx + h2(sc, k, seed + s)) * W.CELL, Q = (k, s) => (cy + h2(sc + 3, k, seed + s)) * W.CELL;
      const vr = VC ? Math.hypot((cx + .5) * W.CELL - VC.x, (cy + .5) * W.CELL - VC.y) < VC.R + 30 : false;
      if (t === TER.URBAN || t === TER.WATER) continue;
      if (vr) { for (let k = 0; k < 4; k++) add(P(k, 63), Q(k, 64), 3); if (h2(cx, cy, seed + 65) < .5) add(P(9, 63), Q(9, 64), 7); continue; }
      if (b === BIO.DESERT) {
        if (t === TER.FOREST) { for (let k = 0; k < 12; k++) add(P(k, 63), Q(k, 64), 4); for (let k = 0; k < 6; k++) add(P(k + 20, 63), Q(k + 20, 64), 2); }
        else if (t === TER.PLAIN) { if (vn(cx / 4, cy / 4, seed + 66) > .4) for (let k = 0; k < 3; k++) add(P(k, 67), Q(k, 68), 5); for (let k = 0; k < 3; k++) add(P(k + 10, 67), Q(k + 10, 68), 2); if (h2(cx, cy, seed + 69) > .6) add(P(30, 67), Q(30, 68), 3); }
        else if (t === TER.HILL) { for (let k = 0; k < 6; k++) add(P(k, 70), Q(k, 71), 3); if (h2(cx, cy, seed + 72) > .7) add(P(9, 70), Q(9, 71), 7); }
      } else if (b === BIO.SWAMP) {
        if (t === TER.FOREST) { for (let k = 0; k < 9; k++) add(P(k, 63), Q(k, 64), 6); for (let k = 0; k < 12; k++) add(P(k + 40, 63), Q(k + 40, 64), 8); for (let k = 0; k < 4; k++) add(P(k + 60, 63), Q(k + 60, 64), 2); }
        else if (t === TER.PLAIN) { if (vn(cx / 3, cy / 3, seed + 73) > .4) for (let k = 0; k < 12; k++) add(P(k, 74), Q(k, 75), 8); for (let k = 0; k < 3; k++) add(P(k + 20, 74), Q(k + 20, 75), h2(k, sc, seed + 76) < .5 ? 6 : 2); }
        else if (t === TER.HILL) { for (let k = 0; k < 4; k++) add(P(k, 77), Q(k, 78), 1); for (let k = 0; k < 3; k++) add(P(k + 9, 77), Q(k + 9, 78), 2); }
      } else if (b === BIO.VOLC) {
        if (t === TER.FOREST) { for (let k = 0; k < 12; k++) add(P(k, 63), Q(k, 64), h2(k, sc, seed + 79) < .55 ? 7 : 0); for (let k = 0; k < 4; k++) add(P(k + 30, 63), Q(k + 30, 64), 3); }
        else if (t === TER.PLAIN) { for (let k = 0; k < 2; k++) add(P(k, 80), Q(k, 81), 7); for (let k = 0; k < 3; k++) add(P(k + 10, 80), Q(k + 10, 81), 3); for (let k = 0; k < 3; k++) add(P(k + 20, 80), Q(k + 20, 81), 2); }
        else if (t === TER.HILL) for (let k = 0; k < 7; k++) add(P(k, 82), Q(k, 83), 3);
      } else {
        if (t === TER.FOREST) { const n = 24 + Math.floor(h2(cx, cy, seed + 63) * 10); for (let k = 0; k < n; k++) add(P(k, 64), Q(k, 65), h2(k, sc, seed + 66) > .45 ? 0 : 1); }
        else if (t === TER.PLAIN && vn(cx / 5, cy / 5, seed + 67) > .6) for (let k = 0; k < 4; k++) add(P(k, 68), Q(k, 69), 1);
        else if (t === TER.HILL && vn(cx / 4, cy / 4, seed + 70) > .55) for (let k = 0; k < 3; k++) add(P(k, 71), Q(k, 72), 0);
        if (t === TER.PLAIN || t === TER.FOREST) for (let k = 0; k < (t === TER.FOREST ? 9 : 6); k++) add(P(k + 40, 73), Q(k + 40, 74), 2);
        if (t === TER.PLAIN && h2(cx, cy, seed + 75) > .72) for (let k = 0; k < 2; k++) add(P(k + 80, 76), Q(k + 80, 77), 3);
        if (t === TER.HILL) { for (let k = 0; k < 5; k++) add(P(k + 90, 78), Q(k + 90, 79), 3); for (let k = 0; k < 3; k++) add(P(k + 120, 80), Q(k + 120, 81), 2); }
      }
    }
    if (VC) VC.top = cone(VC.dc);
    F.world = { H, G, T, C, BI, ALB, MAT, RDF, seed, g, trees: new Float32Array(trees), tc, blds, props, cities, volc: VC, ver: (F.world ? F.world.ver || 0 : 0) + 1 };
    return F.world;
  };

  /* ---------------- QUERI MEDAN ---------------- */
  F.inb = (x, y) => x >= 0 && y >= 0 && x < W.WW && y < W.WH;
  F.hAt = function (x, y) {   // tinggi (bilinear)
    const w = F.world; if (!F.inb(x, y)) return -4;
    const gx = x / TX - .5, gy = y / TX - .5, x0 = Math.max(0, Math.floor(gx)), y0 = Math.max(0, Math.floor(gy)), fx = clamp(gx - x0, 0, 1), fy = clamp(gy - y0, 0, 1);
    const x1 = Math.min(NX - 1, x0 + 1), y1 = Math.min(NY - 1, y0 + 1), H = w.H;
    const a = H[y0 * NX + x0], b = H[y0 * NX + x1], c = H[y1 * NX + x0], d = H[y1 * NX + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  F.tAt = (x, y) => F.inb(x, y) ? F.world.T[Math.floor(y / TX) * NX + Math.floor(x / TX)] : W.TER.WATER;
  F.solid = (x, y) => (F.tAt(x, y) & 16) !== 0;
  F.water = (x, y) => (F.tAt(x, y) & 15) === W.TER.WATER;
  F.WZ = -.25;   // tinggi permukaan air (dasar air -0,9 … -9,9 m)
  F.depth = (x, y) => F.water(x, y) ? Math.max(0, F.WZ - F.hAt(x, y)) : 0;
  F.lava = (x, y) => (F.tAt(x, y) & 64) !== 0;
  /* gedung: tapak gedung = texel ber-bit 16, sejajar persis dengan mesh (x0..x1 kelipatan TX). bTop = tinggi atap, null = bukan gedung */
  F.bTop = (x, y) => { if (!F.inb(x, y)) return null; const i = Math.floor(y / TX) * NX + Math.floor(x / TX); return F.world.T[i] & 16 ? F.world.H[i] : null; };
  F.gAt = function (x, y) {   // tanah tanpa gedung (bilinear G)
    const w = F.world; if (!F.inb(x, y)) return -4;
    const gx = x / TX - .5, gy = y / TX - .5, x0 = Math.max(0, Math.floor(gx)), y0 = Math.max(0, Math.floor(gy)), fx = clamp(gx - x0, 0, 1), fy = clamp(gy - y0, 0, 1);
    const x1 = Math.min(NX - 1, x0 + 1), y1 = Math.min(NY - 1, y0 + 1), G = w.G, a = G[y0 * NX + x0], b = G[y0 * NX + x1], c = G[y1 * NX + x0], d = G[y1 * NX + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  F.floorAt = function (x, y) {   // lantai pejalan kaki: atap rata di dalam tapak gedung, tanah tanpa gedung (bilinear G) di luar — tepi gedung bukan lagi "tanjakan" yang bisa didaki
    const w = F.world; if (!F.inb(x, y)) return -4;
    if (w.T[Math.floor(y / TX) * NX + Math.floor(x / TX)] & 16) return w.H[Math.floor(y / TX) * NX + Math.floor(x / TX)];
    const gx = x / TX - .5, gy = y / TX - .5, x0 = Math.max(0, Math.floor(gx)), y0 = Math.max(0, Math.floor(gy)), fx = clamp(gx - x0, 0, 1), fy = clamp(gy - y0, 0, 1);
    const x1 = Math.min(NX - 1, x0 + 1), y1 = Math.min(NY - 1, y0 + 1), G = w.G;
    const a = G[y0 * NX + x0], b = G[y0 * NX + x1], c = G[y1 * NX + x0], d = G[y1 * NX + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  /* sinar vs medan & gedung: jarak (m) tabrakan pertama atau -1. DDA per texel 2,5 m — tidak ada texel yang dilompati
     (dulu langkah membesar sampai 6 m sehingga peluru, garis pandang & tembakan musuh bisa menembus sudut/dinding gedung) */
  F.rayTerrain = function (ox, oy, oz, dx, dy, dz, maxT) {
    const H = F.world.H; let t = .6;
    const x = ox + dx * t, y = oy + dy * t; let ix = Math.floor(x / TX), iy = Math.floor(y / TX);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, adx = Math.abs(dx), ady = Math.abs(dy);
    const tdx = adx > 1e-9 ? TX / adx : 1e30, tdy = ady > 1e-9 ? TX / ady : 1e30;
    let tmx = adx > 1e-9 ? t + (sx > 0 ? (ix + 1) * TX - x : x - ix * TX) / adx : 1e30, tmy = ady > 1e-9 ? t + (sy > 0 ? (iy + 1) * TX - y : y - iy * TX) / ady : 1e30;
    while (t < maxT) {
      if (ix < 0 || iy < 0 || ix >= NX || iy >= NY) return oz + dz * t < 0 ? t : -1;
      const t1 = Math.min(tmx, tmy, maxT), h = H[iy * NX + ix], z0 = oz + dz * t;
      if (z0 < h) return t;
      if (oz + dz * t1 < h) return t + (h - z0) / dz;   // turun menembus permukaan di dalam texel ini
      t = t1; if (tmx < tmy) { tmx += tdx; ix += sx; } else { tmy += tdy; iy += sy; }
    }
    return -1;
  };
})();
