/* ============================================================
   WAR-DATA — tipe unit, matriks kerusakan, generator medan, A*
   Dunia warzone dalam meter: 5000 x 3200 (grid 100 x 64, sel 50 m)
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR = {};
  const GW = 100, GH = 64, CELL = 50;
  Object.assign(W, { GW, GH, CELL, WW: GW * CELL, WH: GH * CELL });

  W.TER = { PLAIN: 0, FOREST: 1, HILL: 2, WATER: 3, URBAN: 4, ROAD: 5 };
  W.BIO = { TROP: 0, DESERT: 1, SWAMP: 2, VOLC: 3 };
  W.TSPD = [1, .6, .7, 0, .8, 1.35];     // pengali kecepatan darat per medan
  W.COVER = [1, .75, .7, 1, .65, 1];     // pengali damage diterima infanteri (perlindungan)

  // damage type x armor class
  W.MULT = {
    small: { inf: 1, light: .5, heavy: .08, air: .25, ship: .08, struct: .12 },
    ap:    { inf: .45, light: 1.5, heavy: 1.2, air: .9, ship: .9, struct: .8 },
    he:    { inf: 1.4, light: 1, heavy: .55, air: 0, ship: .7, struct: 1.1 },
    aa:    { inf: 0, light: 0, heavy: 0, air: 1.5, ship: 0, struct: 0 },
    bomb:  { inf: 1.6, light: 1.3, heavy: 1, air: 0, ship: 1, struct: 2 }
  };
  // lapis tungsten (Tank Ultima, Leviathan): kebal peluru, hanya senjata antilapis baja / bom yang terasa
  // eksoskeleton (Komandan Bayangan): pelat keramik menahan sebagian besar peluru senapan
  Object.assign(W.MULT.small, { tung: .03, exo: .4 }); Object.assign(W.MULT.ap, { tung: .6, exo: .55 }); Object.assign(W.MULT.he, { tung: .35, exo: .8 });
  Object.assign(W.MULT.aa, { tung: 0, exo: 0 }); Object.assign(W.MULT.bomb, { tung: .7, exo: 1 });

  /* tc (kelas target): G darat/struktur, A udara, S laut
     dom: G / A / S ; fly: bergerak lurus (heli, UAV) ; jet: terbang cepat berputar
     w[].vs: huruf kelas target yang bisa diserang */
  W.UT = {
    INF: { cat: 'G', dom: 'G', armor: 'inf', hp: 60, spd: 18, vis: 520, cost: 50, dep: 4, drop: true, sz: 1,
      w: [{ vs: 'G', dt: 'small', dmg: 5, cd: .5, rng: 280, proj: 'bullet', acc: .75 },
          { vs: 'G', dt: 'ap', dmg: 45, cd: 4, rng: 350, proj: 'missile', spd: 170, acc: 1 }] },
    SF: { cat: 'G', dom: 'G', armor: 'inf', hp: 70, spd: 22, vis: 650, cost: 120, dep: 5, drop: true, stealth: .45, sz: 1,
      w: [{ vs: 'G', dt: 'small', dmg: 9, cd: .45, rng: 330, proj: 'bullet', acc: .85 },
          { vs: 'G', dt: 'he', dmg: 120, cd: 6, rng: 70, proj: 'bullet', acc: 1, aoe: 40 }] },
    TANK: { cat: 'G', dom: 'G', armor: 'heavy', hp: 420, spd: 24, vis: 650, cost: 300, dep: 8, sz: 1.3,
      w: [{ vs: 'GS', dt: 'ap', dmg: 70, cd: 2.5, rng: 700, proj: 'bullet', acc: .88, big: true, aoe: 22 },
          { vs: 'G', dt: 'small', dmg: 6, cd: .4, rng: 350, proj: 'bullet', acc: .7 }] },
    IFV: { cat: 'G', dom: 'G', armor: 'light', hp: 230, spd: 30, vis: 600, cost: 180, dep: 6, sz: 1.15,
      w: [{ vs: 'GA', dt: 'he', dmg: 11, cd: .5, rng: 500, proj: 'bullet', acc: .75 },
          { vs: 'GS', dt: 'ap', dmg: 55, cd: 4.5, rng: 650, proj: 'missile', spd: 190, acc: 1 }] },
    ARTY: { cat: 'G', dom: 'G', armor: 'light', hp: 110, spd: 16, vis: 450, cost: 280, dep: 8, stance: 'HOLD', sz: 1.2,
      w: [{ vs: 'GS', dt: 'he', dmg: 85, cd: 5, rng: 2300, min: 350, proj: 'shell', spd: 420, aoe: 90, arc: true }] },
    AA: { cat: 'G', dom: 'G', armor: 'light', hp: 150, spd: 24, vis: 750, cost: 220, dep: 6, stance: 'HOLD', sz: 1.15,
      w: [{ vs: 'A', dt: 'aa', dmg: 45, cd: 1.3, rng: 1500, proj: 'missile', spd: 320, acc: 1 }] },
    HELI: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 160, spd: 70, vis: 800, cost: 400, dep: 10, sz: 1.3,
      w: [{ vs: 'GS', dt: 'ap', dmg: 60, cd: 3, rng: 800, proj: 'missile', spd: 220, acc: 1 },
          { vs: 'G', dt: 'small', dmg: 7, cd: .3, rng: 480, proj: 'bullet', acc: .75 }] },
    FGT: { cat: 'A', dom: 'A', jet: true, armor: 'air', hp: 130, spd: 170, vis: 1300, cost: 450, dep: 12, bombs: 4, sz: 1.3,
      w: [{ vs: 'A', dt: 'aa', dmg: 80, cd: 2.5, rng: 1600, proj: 'missile', spd: 430, acc: 1 },
          { vs: 'GS', dt: 'bomb', dmg: 75, cd: 1.2, rng: 230, proj: 'bomb', aoe: 55, bombw: true }] },
    BMB: { cat: 'A', dom: 'A', jet: true, armor: 'air', hp: 260, spd: 115, vis: 900, cost: 520, dep: 14, bombs: 10, sz: 1.6,
      w: [{ vs: 'GS', dt: 'bomb', dmg: 70, cd: .18, rng: 0, proj: 'bomb', aoe: 65, manual: true }] },
    UAV: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 40, spd: 60, vis: 1600, cost: 120, dep: 5, sz: .9, w: [] },
    SHIP: { cat: 'S', dom: 'S', armor: 'ship', hp: 520, spd: 18, vis: 1100, cost: 650, dep: 15, stance: 'HOLD', sz: 1.8,
      w: [{ vs: 'GS', dt: 'he', dmg: 55, cd: 3, rng: 2000, proj: 'shell', spd: 450, aoe: 45, arc: true },
          { vs: 'A', dt: 'aa', dmg: 50, cd: 2, rng: 1700, proj: 'missile', spd: 340, acc: 1 },
          { vs: 'GS', dt: 'ap', dmg: 95, cd: 9, rng: 2300, proj: 'missile', spd: 260, acc: 1 }] },
    MEDIC: { cat: 'G', dom: 'G', armor: 'inf', hp: 60, spd: 20, vis: 450, cost: 70, dep: 4, drop: true, sz: 1, heal: { rad: 200, rate: .06, armors: ['inf'] }, w: [] },
    REPAIR: { cat: 'G', dom: 'G', armor: 'light', hp: 200, spd: 26, vis: 500, cost: 180, dep: 6, sz: 1.25, heal: { rad: 230, rate: .05, armors: ['light', 'heavy'] }, w: [] },
    MEDHELI: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 200, spd: 80, vis: 700, cost: 300, dep: 8, sz: 1.3, heal: { rad: 320, rate: .07, armors: ['inf', 'light'] }, w: [] },
    AT: { cat: 'G', dom: 'G', armor: 'inf', hp: 55, spd: 17, vis: 500, cost: 90, dep: 4, drop: true, sz: 1,
      w: [{ vs: 'G', dt: 'ap', dmg: 110, cd: 6, rng: 900, proj: 'missile', spd: 200, acc: 1 },
          { vs: 'G', dt: 'small', dmg: 4, cd: .6, rng: 250, proj: 'bullet', acc: .7 }] },
    MORT: { cat: 'G', dom: 'G', armor: 'inf', hp: 55, spd: 14, vis: 450, cost: 110, dep: 5, drop: true, stance: 'HOLD', sz: 1,
      w: [{ vs: 'G', dt: 'he', dmg: 60, cd: 3.5, rng: 1100, min: 150, proj: 'shell', spd: 260, aoe: 50, arc: true }] },
    LTANK: { cat: 'G', dom: 'G', armor: 'heavy', hp: 280, spd: 32, vis: 650, cost: 200, dep: 6, sz: 1.2,
      w: [{ vs: 'GS', dt: 'ap', dmg: 55, cd: 2, rng: 650, proj: 'bullet', acc: .85, big: true, aoe: 18 },
          { vs: 'G', dt: 'small', dmg: 6, cd: .4, rng: 330, proj: 'bullet', acc: .7 }] },
    MLRS: { cat: 'G', dom: 'G', armor: 'light', hp: 130, spd: 18, vis: 450, cost: 450, dep: 10, stance: 'HOLD', sz: 1.3,
      w: [{ vs: 'GS', dt: 'he', dmg: 45, cd: 9, rng: 3400, min: 600, proj: 'shell', spd: 520, aoe: 85, arc: true, salvo: 6 }] },
    ZSU: { cat: 'G', dom: 'G', armor: 'light', hp: 160, spd: 26, vis: 800, cost: 240, dep: 6, stance: 'HOLD', sz: 1.15,
      w: [{ vs: 'A', dt: 'aa', dmg: 6, cd: .15, rng: 1000, proj: 'bullet', acc: .55 },
          { vs: 'G', dt: 'small', dmg: 7, cd: .2, rng: 600, proj: 'bullet', acc: .7 }] },
    ATK2: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 230, spd: 85, vis: 900, cost: 650, dep: 12, sz: 1.4,
      w: [{ vs: 'GS', dt: 'ap', dmg: 70, cd: 2.2, rng: 900, proj: 'missile', spd: 240, acc: 1 },
          { vs: 'G', dt: 'he', dmg: 26, cd: 1.2, rng: 700, proj: 'bullet', acc: .8, big: true, aoe: 28 },
          { vs: 'A', dt: 'aa', dmg: 60, cd: 3, rng: 1200, proj: 'missile', spd: 340, acc: 1 }] },
    UCAV: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 70, spd: 65, vis: 1500, cost: 320, dep: 8, sz: 1,
      w: [{ vs: 'GS', dt: 'ap', dmg: 60, cd: 4, rng: 1000, proj: 'missile', spd: 230, acc: 1 }] },
    CAS: { cat: 'A', dom: 'A', jet: true, armor: 'air', hp: 320, spd: 130, vis: 1000, cost: 520, dep: 13, bombs: 6, sz: 1.5,
      w: [{ vs: 'G', dt: 'ap', dmg: 9, cd: .12, rng: 450, proj: 'bullet', acc: .6 },
          { vs: 'GS', dt: 'bomb', dmg: 75, cd: 1.2, rng: 230, proj: 'bomb', aoe: 55, bombw: true }] },
    GBOAT: { cat: 'S', dom: 'S', armor: 'ship', hp: 180, spd: 34, vis: 900, cost: 220, dep: 8, sz: 1.2,
      w: [{ vs: 'GS', dt: 'small', dmg: 7, cd: .3, rng: 600, proj: 'bullet', acc: .7 },
          { vs: 'GS', dt: 'ap', dmg: 70, cd: 7, rng: 1500, proj: 'missile', spd: 250, acc: 1 }] },
    // UFO musuh (hanya muncul di NORMAL/SULIT): sinar plasma ke darat & udara, lapisan pelindung tebal
    UFO: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 600, spd: 45, vis: 1200, cost: 700, dep: 0, sz: 1.9, enemyOnly: true,
      w: [{ vs: 'GS', dt: 'he', dmg: 32, cd: 1.5, rng: 620, proj: 'bullet', acc: .9, big: true, aoe: 16, beam: true },
          { vs: 'A', dt: 'aa', dmg: 45, cd: 2.2, rng: 900, proj: 'bullet', acc: .85, beam: true }] },
    // jip patroli bersenapan mesin ringan (garnisun pos SULIT/PROFESIONAL): cepat, rapuh, damage kecil
    JEEP: { cat: 'G', dom: 'G', armor: 'light', hp: 110, spd: 36, vis: 600, cost: 90, dep: 4, sz: 1,
      w: [{ vs: 'G', dt: 'small', dmg: 3, cd: .3, rng: 380, proj: 'bullet', acc: .55 }] },
    /* ---- mini bos PROFESIONAL (satu per pos; pos tidak bisa direbut sebelum bosnya tumbang) ----
       boss: penanda · alt: ketinggian terbang (m) · bank: guling tetap (rad, model 3D) · orbit: jari-jari lingkaran (m)
       leash: jarak maks dari pos/markas · hb: kotak kena FPS [jari-jari, tinggi, offset z] · hs: skala tubuh prajurit */
    // balon udara tempur: kantong gas berlapis kevlar, gondola bersenapan mesin + pod roket + rudal hanud; menerjunkan pasukan
    BLIMP: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 1500, spd: 9, vis: 1300, cost: 2000, sz: 3, enemyOnly: true, boss: 1, alt: 70, bank: 0, hb: [13, 13, -7.5],
      w: [{ vs: 'G', dt: 'small', dmg: 7, cd: .15, rng: 650, proj: 'bullet', acc: .6 },
          { vs: 'GS', dt: 'he', dmg: 38, cd: 2.2, rng: 900, proj: 'missile', spd: 200, acc: 1, aoe: 26 },
          { vs: 'A', dt: 'aa', dmg: 55, cd: 3.5, rng: 1300, proj: 'missile', spd: 330, acc: 1 }] },
    // pesawat gunship (kelas AC-130): mengitari pos tanpa henti, howitzer 105 + kanon 40 mm + gatling 25 mm di sisi kanan
    GUNSHIP: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 1300, spd: 46, vis: 1500, cost: 2200, sz: 2.6, enemyOnly: true, boss: 1, alt: 150, orbit: 430, bank: -.4, hb: [17, 7, -3.5],
      w: [{ vs: 'G', dt: 'he', dmg: 95, cd: 5.5, rng: 1400, proj: 'shell', spd: 600, aoe: 40 },
          { vs: 'G', dt: 'he', dmg: 30, cd: 1.1, rng: 1300, proj: 'bullet', acc: .75, big: true, aoe: 14 },
          { vs: 'G', dt: 'small', dmg: 7, cd: .1, rng: 1200, proj: 'bullet', acc: .45 }] },
    // tank ultima: lapis tungsten, dua meriam 140 mm, senapan mesin sesumbu, peluncur ATGM, SMB hanud
    ULTIMA: { cat: 'G', dom: 'G', armor: 'tung', hp: 1500, spd: 14, vis: 900, cost: 2000, sz: 1.9, enemyOnly: true, boss: 1, leash: 320, hb: [5.6, 4.2, 0],
      w: [{ vs: 'GS', dt: 'ap', dmg: 110, cd: 3.2, rng: 850, proj: 'bullet', acc: .9, big: true, aoe: 26 },
          { vs: 'G', dt: 'small', dmg: 8, cd: .22, rng: 450, proj: 'bullet', acc: .7 },
          { vs: 'G', dt: 'ap', dmg: 80, cd: 8, rng: 1100, proj: 'missile', spd: 210, acc: 1 },
          { vs: 'A', dt: 'small', dmg: 6, cd: .2, rng: 700, proj: 'bullet', acc: .5 }] },
    // komandan bayangan: eksoskeleton + SMB ringan & pelontar granat; alat: turet jaga, granat, drone intai, stimulan, kamuflase adaptif
    CMDR: { cat: 'G', dom: 'G', armor: 'exo', hp: 1100, spd: 20, vis: 800, cost: 1500, sz: 1.2, enemyOnly: true, boss: 1, leash: 260, hs: 1.18,
      w: [{ vs: 'G', dt: 'small', dmg: 9, cd: .18, rng: 420, proj: 'bullet', acc: .8 },
          { vs: 'G', dt: 'he', dmg: 45, cd: 4, rng: 300, proj: 'bullet', acc: .9, aoe: 14 }] },
    // bos akhir: benteng darat LEVIATHAN (kelas "landkreuzer" 1.000 ton) — dua meriam kapal 280 mm, meriam sekunder 128 mm,
    // flak, ATGM, senapan mesin; markas musuh kebal selama ia hidup
    LEVI: { cat: 'G', dom: 'G', armor: 'tung', hp: 4500, spd: 6, vis: 1400, cost: 5000, sz: 4, enemyOnly: true, boss: 1, final: true, leash: 480, hb: [15, 11, 0],
      w: [{ vs: 'G', dt: 'he', dmg: 150, cd: 7, rng: 2600, min: 250, proj: 'shell', spd: 520, aoe: 80, salvo: 2 },
          { vs: 'GS', dt: 'ap', dmg: 85, cd: 2.8, rng: 1200, proj: 'bullet', acc: .85, big: true, aoe: 30 },
          { vs: 'A', dt: 'aa', dmg: 9, cd: .12, rng: 1300, proj: 'bullet', acc: .5 },
          { vs: 'G', dt: 'ap', dmg: 90, cd: 6, rng: 1300, proj: 'missile', spd: 210, acc: 1 },
          { vs: 'G', dt: 'small', dmg: 8, cd: .15, rng: 520, proj: 'bullet', acc: .7 }] },
    // --- variasi bos akhir lain (diacak tiap pertempuran markas; semuanya teknologi militer yang masuk akal) ---
    // NEMESIS: pesawat sayap-terbang siluman raksasa (bentang ±52 m) yang mengitari markas: bom luncur berpemandu, kanon 30 mm, CIWS, rudal hanud
    NEMESIS: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 3600, spd: 40, vis: 1700, cost: 5000, sz: 3.4, enemyOnly: true, boss: 1, final: true, alt: 190, orbit: 460, bank: -.3, hb: [24, 3.5, -1.3],
      w: [{ vs: 'G', dt: 'he', dmg: 140, cd: 4.5, rng: 1700, proj: 'shell', spd: 420, aoe: 70 },
          { vs: 'G', dt: 'he', dmg: 26, cd: .9, rng: 1400, proj: 'bullet', acc: .75, big: true, aoe: 12 },
          { vs: 'A', dt: 'aa', dmg: 10, cd: .1, rng: 1100, proj: 'bullet', acc: .55 },
          { vs: 'A', dt: 'aa', dmg: 60, cd: 3, rng: 1800, proj: 'missile', spd: 340, acc: 1 }] },
    // KRAKEN: heli serang berat rotor tandem (±32 m, kelas Chinook bersenjata): kanon kembar 30 mm, minigun pintu, pod roket, ATGM; menurunkan pasukan
    KRAKEN: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 3000, spd: 16, vis: 1300, cost: 5000, sz: 3, enemyOnly: true, boss: 1, final: true, alt: 42, hb: [16, 5.5, -1],
      w: [{ vs: 'GS', dt: 'he', dmg: 34, cd: .7, rng: 1100, proj: 'bullet', acc: .8, big: true, aoe: 12 },
          { vs: 'G', dt: 'small', dmg: 7, cd: .08, rng: 650, proj: 'bullet', acc: .55 },
          { vs: 'G', dt: 'he', dmg: 50, cd: 3.4, rng: 1000, proj: 'shell', spd: 320, aoe: 22, salvo: 4 },
          { vs: 'G', dt: 'ap', dmg: 110, cd: 7, rng: 1300, proj: 'missile', spd: 210, acc: 1 },
          { vs: 'A', dt: 'aa', dmg: 50, cd: 4, rng: 1300, proj: 'missile', spd: 330, acc: 1 }] },
    // TITAN: peluncur rudal balistik taktis 16 roda (TEL): tiap ±20 dtk meluncurkan rudal ke konsentrasi pasukan kita (zona ditandai);
    // dipertahankan CIWS, senapan mesin & ATGM
    TITAN: { cat: 'G', dom: 'G', armor: 'heavy', hp: 3800, spd: 8, vis: 1500, cost: 5000, sz: 3.2, enemyOnly: true, boss: 1, final: true, leash: 420, hb: [12, 4.6, 0],
      w: [{ vs: 'A', dt: 'aa', dmg: 10, cd: .1, rng: 1200, proj: 'bullet', acc: .55 },
          { vs: 'G', dt: 'small', dmg: 8, cd: .16, rng: 550, proj: 'bullet', acc: .7 },
          { vs: 'G', dt: 'ap', dmg: 95, cd: 5.5, rng: 1300, proj: 'missile', spd: 210, acc: 1 }] },
    // ZEUS: meriam rel elektromagnetik di sasis rantai super berat: proyektil tungsten Mach 6 (sekali tembak menghancurkan tank),
    // laser hanud energi tinggi, senapan mesin
    ZEUS: { cat: 'G', dom: 'G', armor: 'heavy', hp: 4000, spd: 7, vis: 1600, cost: 5000, sz: 3.2, enemyOnly: true, boss: 1, final: true, leash: 450, hb: [11, 7.2, 0],
      w: [{ vs: 'GS', dt: 'ap', dmg: 300, cd: 6.5, rng: 2400, proj: 'bullet', acc: .96, big: true, beam: true, aoe: 20 },
          { vs: 'A', dt: 'aa', dmg: 32, cd: .5, rng: 1500, proj: 'bullet', acc: 1, beam: true },
          { vs: 'G', dt: 'small', dmg: 8, cd: .15, rng: 550, proj: 'bullet', acc: .7 }] },
    // SANG JENDERAL: komandan tertinggi musuh dalam zirah tempur bertenaga (±2,4 m): minigun, peluncur roket bahu,
    // turet jaga, drone, stimulan, pengawal elit
    WARLORD: { cat: 'G', dom: 'G', armor: 'exo', hp: 2600, spd: 16, vis: 900, cost: 5000, sz: 1.5, enemyOnly: true, boss: 1, final: true, leash: 340, hs: 1.75,   // hs 1.75 ≈ 3,1 m (v2.2: jauh lebih besar dari Komandan Bayangan)
      w: [{ vs: 'G', dt: 'small', dmg: 8, cd: .07, rng: 480, proj: 'bullet', acc: .6 },
          { vs: 'G', dt: 'he', dmg: 80, cd: 3.5, rng: 600, proj: 'missile', spd: 190, acc: .9, aoe: 20 },
          { vs: 'A', dt: 'aa', dmg: 45, cd: 6, rng: 900, proj: 'missile', spd: 300, acc: 1 }] },
    /* ---- bos penyerbu SULIT (berangkat dari markas musuh bergiliran, merebut pos yang dilewati lalu menggempur markas kita) ----
       raid: penanda · halt: berhenti maju bila ada lawan sedekat ini · siege: jarak berhenti dari markas kita · esc: iring-iringan pengawal sejak berangkat */
    // BEHEMOTH: tank pengepung super berat — mortir roket 380 mm di kasemat, meriam 120 mm, bilah dozer, SMB & SMB hanud
    BEHEMOTH: { cat: 'G', dom: 'G', armor: 'tung', hp: 4500, spd: 10, vis: 1000, cost: 4000, sz: 3, enemyOnly: true, boss: 1, raid: true, halt: 650, siege: 520, hb: [8.5, 5.4, 0], esc: ['TANK', 'TANK', 'SF', 'SF', 'SF', 'SF'],
      w: [{ vs: 'GS', dt: 'he', dmg: 160, cd: 6.5, rng: 1300, min: 150, proj: 'shell', spd: 300, aoe: 50 },
          { vs: 'GS', dt: 'ap', dmg: 80, cd: 2.8, rng: 850, proj: 'bullet', acc: .85, big: true, aoe: 20 },
          { vs: 'G', dt: 'small', dmg: 8, cd: .15, rng: 500, proj: 'bullet', acc: .7 },
          { vs: 'A', dt: 'aa', dmg: 8, cd: .15, rng: 900, proj: 'bullet', acc: .5 }] },
    // TEMPEST: peluncur roket berat 10×10 — salvo 8 roket 300 mm dari jauh, rudal hanud, ATGM, SMB
    TEMPEST: { cat: 'G', dom: 'G', armor: 'heavy', hp: 3800, spd: 12, vis: 1300, cost: 4000, sz: 3, enemyOnly: true, boss: 1, raid: true, halt: 900, siege: 1100, hb: [9.5, 4.6, 0], esc: ['ZSU', 'IFV', 'IFV', 'AT', 'AT'],
      w: [{ vs: 'GS', dt: 'he', dmg: 50, cd: 11, rng: 2600, min: 400, proj: 'shell', spd: 500, aoe: 55, arc: true, salvo: 8 },
          { vs: 'A', dt: 'aa', dmg: 50, cd: 3, rng: 1500, proj: 'missile', spd: 330, acc: 1 },
          { vs: 'G', dt: 'ap', dmg: 90, cd: 6, rng: 1200, proj: 'missile', spd: 210, acc: 1 },
          { vs: 'G', dt: 'small', dmg: 8, cd: .16, rng: 520, proj: 'bullet', acc: .7 }] },
    // CLAY MARTIN: perpaduan Komandan Bayangan & Sang Jenderal (±2,3 m) — RAILGUN berat (overpower: peluru tungsten Mach 7 menembus barisan,
    // sekali tembak menjatuhkan prajurit), tembakan muatan penuh anti-kendaraan/gedung, pelontar granat, railgun hanud; JETPACK: semburan ±6 dtk
    // melajukan geraknya 20% (fase 3 menyala terus); alat komandan (turet, drone, stimulan, kamuflase)
    CLAY: { cat: 'G', dom: 'G', armor: 'exo', hp: 3200, spd: 18, vis: 950, cost: 4000, sz: 1.3, enemyOnly: true, boss: 1, raid: true, halt: 520, siege: 420, hs: 1.3, esc: ['SF', 'SF', 'SF', 'SF', 'JEEP', 'JEEP'], jetRun: .55, jetK: 210 / 18, jetAlt: 200, jetClimb: 80, jetSink: 50, jetBurn: 16, jetCool: 12,   // jet: 210 = laju HELI (70) × 3, terbang setinggi 200 m
      w: [{ vs: 'G', dt: 'ap', dmg: 85, cd: 1.7, rng: 900, proj: 'bullet', acc: .96, big: true, beam: 3, pierce: .7, aoe: 5 },
          { vs: 'GS', dt: 'ap', dmg: 260, cd: 6, rng: 1200, proj: 'bullet', acc: .98, big: true, beam: 3, pierce: .7, aoe: 16 },
          { vs: 'G', dt: 'he', dmg: 45, cd: 4, rng: 300, proj: 'bullet', acc: .9, aoe: 14 },
          { vs: 'A', dt: 'aa', dmg: 110, cd: 3, rng: 1300, proj: 'bullet', acc: .97, beam: 3 }] },
    // WYVERN: tiltrotor tempur berat (±30 m) — kanon 30 mm di dagu, pod roket, minigun pintu, rudal hanud; menurunkan regu serbu dengan tali untuk merebut pos
    WYVERN: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 3400, spd: 24, vis: 1300, cost: 4000, sz: 2.8, enemyOnly: true, boss: 1, raid: true, halt: 550, siege: 450, alt: 58, hb: [16.5, 6.3, -2.1],
      w: [{ vs: 'GS', dt: 'he', dmg: 30, cd: .6, rng: 1000, proj: 'bullet', acc: .8, big: true, aoe: 12 },
          { vs: 'G', dt: 'he', dmg: 40, cd: 3.2, rng: 1000, proj: 'shell', spd: 320, aoe: 20, salvo: 4 },
          { vs: 'G', dt: 'small', dmg: 7, cd: .08, rng: 600, proj: 'bullet', acc: .55 },
          { vs: 'A', dt: 'aa', dmg: 50, cd: 4, rng: 1300, proj: 'missile', spd: 330, acc: 1 }] },
    // avatar pemain mode FPS (tidak ada di kartu gelar; bergerak lewat modul FPS)
    OPR: { cat: 'G', dom: 'G', armor: 'inf', hp: 100, spd: 0, vis: 560, cost: 0, sz: 1, w: [] },
    // AH-64 Apache killstreak operator: dikemudikan & ditembakkan langsung oleh modul FPS (fps-heli.js), bukan AI
    AH64: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 2300, spd: 0, vis: 1000, cost: 1200, sz: 1.5, w: [] },
    // kendaraan operator (fps-veh.js): dikemudikan & ditembakkan langsung oleh pemain mode FPS, bukan AI
    HMV: { cat: 'G', dom: 'G', armor: 'light', hp: 650, spd: 0, vis: 600, cost: 600, sz: 1.1, w: [] },
    APC: { cat: 'G', dom: 'G', armor: 'light', hp: 1000, spd: 0, vis: 600, cost: 900, sz: 1.3, w: [] },
    MBT: { cat: 'G', dom: 'G', armor: 'heavy', hp: 1500, spd: 0, vis: 650, cost: 1500, sz: 1.55, w: [] },
    VTOL: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 1100, spd: 0, vis: 1100, cost: 2400, sz: 1.7, w: [] },
    WOLF: { cat: 'A', dom: 'A', fly: true, armor: 'air', hp: 2070, spd: 0, vis: 1100, cost: 2800, sz: 1.8, w: [] },   // v3.0 WOLFPACK (A-10 hitam milik operator): nyawa 90% Shadow Hunter (AH64 2300), dikali F.APACHE.hpK seperti heli
    // struktur (tidak bergerak)
    HQ: { cat: 'X', dom: 'G', armor: 'struct', hp: 1800, spd: 0, vis: 700, cost: 0, struct: true, sz: 2.4,
      w: [{ vs: 'G', dt: 'small', dmg: 8, cd: .4, rng: 420, proj: 'bullet', acc: .7 }] },
    BNK: { cat: 'X', dom: 'G', armor: 'struct', hp: 320, spd: 0, vis: 600, cost: 0, struct: true, sz: 1.2,
      w: [{ vs: 'G', dt: 'small', dmg: 8, cd: .35, rng: 420, proj: 'bullet', acc: .75 },
          { vs: 'GS', dt: 'ap', dmg: 40, cd: 3, rng: 520, proj: 'missile', spd: 180, acc: 1 }] },
    SAM: { cat: 'X', dom: 'G', armor: 'struct', hp: 260, spd: 0, vis: 900, cost: 0, struct: true, sz: 1.3,
      w: [{ vs: 'A', dt: 'aa', dmg: 55, cd: 1.6, rng: 1700, proj: 'missile', spd: 340, acc: 1 }] },
    // pertahanan markas kita (semua tingkat kesulitan): meriam 155 mm CAESAR terpasang (bangunan, bukan kendaraan) — peluru berpemandu
    // presisi (prec: pengali sebaran, safe: tidak melukai kawan), jangkauan sampai Pos CHARLIE; radar kontra-baterai melihat sampai Pos ALFA
    CAESAR: { cat: 'X', dom: 'G', armor: 'struct', hp: 520, spd: 0, vis: 1300, cost: 0, struct: true, sz: 1.4,
      w: [{ vs: 'GS', dt: 'he', dmg: 120, cd: 6.5, rng: 3200, min: 250, proj: 'shell', spd: 560, aoe: 70, arc: true, salvo: 2, prec: .35, safe: true }] },
    // sarang senapan mesin (kelas MG42) berkarung pasir: hanya menembak bila diawaki prajurit (crew) — awak gugur, prajurit terdekat menggantikan
    MGN: { cat: 'X', dom: 'G', armor: 'struct', hp: 380, spd: 0, vis: 650, cost: 0, struct: true, sz: .9, crew: true,
      w: [{ vs: 'G', dt: 'small', dmg: 9, cd: .09, rng: 620, proj: 'bullet', acc: .65 }] },
    // meja senjata markas (mode OPERATOR, fps-kit.js): hanya aktor gambar 3D, tidak pernah masuk Q.units
    ARMORY: { cat: 'X', dom: 'G', armor: 'struct', hp: 1, spd: 0, vis: 0, cost: 0, struct: true, sz: 1, w: [] },
    // turet jaga yang dipasang Komandan Bayangan
    SENTRY: { cat: 'X', dom: 'G', armor: 'struct', hp: 160, spd: 0, vis: 600, cost: 60, struct: true, sz: .7, enemyOnly: true,
      w: [{ vs: 'G', dt: 'small', dmg: 5, cd: .22, rng: 420, proj: 'bullet', acc: .65 }] }
  };
  Object.values(W.UT).forEach(t => { t.tc = t.dom === 'A' ? 'A' : t.dom === 'S' ? 'S' : 'G'; });
  W.DEPLOY_ORDER = ['INF', 'SF', 'MEDIC', 'REPAIR', 'AT', 'MORT', 'JEEP', 'LTANK', 'TANK', 'IFV', 'ARTY', 'MLRS', 'AA', 'ZSU', 'HELI', 'ATK2', 'MEDHELI', 'UCAV', 'FGT', 'CAS', 'BMB', 'UAV', 'SHIP', 'GBOAT'];

  /* ---------------- noise ---------------- */
  function hash(x, y, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vn(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  W.vn = vn;

  /* ---------------- fasilitas markas musuh ----------------
     Titik relatif HQ, dipakai sim (war.js) & dunia 3D (fps-data) supaya selalu sama. Timur markas = belakang:
     landasan utara-selatan + taksiway + 3 hanggar menghadap taksiway; 6 helipad utara & selatan; 2 deret garasi menghadap barat (arah pertempuran).
     Tiap bay: x,y = titik pintu, yaw = arah keluar, sx,sy = posisi unit di dalam, ex,ey = titik di luar pintu */
  W.FACB = [-130, 262, -350, 350];   // batas area (dx0, dx1, dy0, dy1) yang diratakan & dijadikan pangkalan
  W.PADB = [[-30, 62], [-30, 98], [-30, -64], [-30, -100], [-62, 40]];   // helipad garnisun markas kita
  W.facOf = function (hx, hy) {
    const gar = [], han = [], pad = [];
    for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) { const y = hy + sg * (223 + i * 12), x = hx - 75; gar.push({ k: 'gar', x, y, yaw: Math.PI, sx: x + 8, sy: y, ex: x - 34, ey: y, w: 10.5, h: 6.2, door: 0, u: null, want: null, wait: 0 }); }
    for (const dy of [216, 158, 100]) { const x = hx + 155, y = hy + dy; han.push({ k: 'han', x, y, yaw: 0, sx: x - 20, sy: y, ex: hx + 195, ey: y, w: 44, h: 9, door: 0, u: null, want: null, wait: 0 }); }
    const std = []; for (let i = 0; i < 8; i++) std.push({ k: 'std', x: hx + 168, y: hy + 40 - i * 42, yaw: 0, u: null });   // v2.12: parkir pesawat ber-revetment di apron selatan, menghadap taksiway
    for (const [dx, dy] of [[60, -170], [96, -170], [60, -208], [96, -208], [60, 170], [96, 170]]) pad.push({ k: 'pad', x: hx + dx, y: hy + dy, yaw: Math.PI, sx: hx + dx, sy: hy + dy, door: 0, u: null, want: null, wait: 0 });
    return {
      hx, hy, gar, han, pad, std, bays: gar.concat(han), q: [], rwT: 0, jetT: 0,
      run: { x: hx + 235, y0: hy - 345, y1: hy + 345, hw: 16 }, twy: { x: hx + 195, y0: hy - 272, y1: hy + 338, hw: 6 }, hold: [hx + 235, hy + 322],
      apron: [hx + 155, hy + 78, hx + 195, hy + 238],
      rects: [[hx + 112, hy - 346, hx + 258, hy + 346], [hx + 44, hy - 226, hx + 112, hy - 150], [hx + 44, hy + 150, hx + 112, hy + 190], [hx - 125, hy - 257, hx - 55, hy - 213], [hx - 125, hy + 213, hx - 55, hy + 257]]
    };
  };

  /* v3.0 lapangan terbang MARKAS KITA (selatan HQ): landasan timur–barat (lepas landas menghadap medan tempur di timur), 2 hanggar di selatan landasan
     berpintu ke utara, apron beton, menara kontrol. Hanggar pertama = tempat WOLFPACK muncul. Bay: x,y = pintu, yaw = arah keluar, sx,sy = posisi di dalam */
  W.facB = function (hx, hy) {
    const ry = hy + 215, han = [];
    for (const dx of [-160, -95]) { const x = hx + dx, y = ry + 52; han.push({ k: 'han', x, y, yaw: -Math.PI / 2, sx: x, sy: y + 21, ex: x, ey: ry + 24, w: 44, h: 9, door: 0, u: null }); }
    return { hx, hy, han, bays: han, rwT: 0, run: { y: ry, x0: hx - 300, x1: hx + 420, hw: 15 }, apron: [hx - 190, ry + 15, hx - 65, ry + 52], atc: [hx - 20, ry + 66],
      rects: [[hx - 320, ry - 30, hx + 440, ry + 98]] };
  };

  /* ---------------- generator medan ---------------- */
  W.gen = function (seed) {
    const T = W.TER, t = new Uint8Array(GW * GH), e = new Float32Array(GW * GH);
    const HQB = [8, 28], HQR = [92, 30];
    const OBJ = [['ALFA', 36, 14], ['BRAVO', 46, 33], ['CHARLIE', 67, 21], ['DELTA', 38, 48], ['ECHO', 72, 45]];   // semua pos >= 1,5 km dari markas kita (ALFA dulu [28,20] = 1,08 km, terlalu dekat)
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      const el = .55 * vn(x / 18, y / 18, seed) + .3 * vn(x / 8, y / 8, seed + 1) + .15 * vn(x / 3.5, y / 3.5, seed + 2);
      const sea = GH * .86 + 4 * vn(x / 7, 3, seed + 9), f = vn(x / 9, y / 9, seed + 5);
      e[i] = el;
      t[i] = y > sea ? T.WATER : el < .3 ? T.WATER : el > .67 ? T.HILL : f > .6 ? T.FOREST : T.PLAIN;
      if (t[i] === T.WATER) e[i] = Math.min(el, .28);
    }
    const clear = (cx, cy, r, ur) => {
      for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        const d = Math.hypot(x - cx, y - cy); if (d > r) continue;
        t[y * GW + x] = d <= ur ? T.URBAN : T.PLAIN; e[y * GW + x] = Math.max(e[y * GW + x], .4);
      }
    };
    clear(HQB[0], HQB[1], 7, 2.2); clear(HQR[0], HQR[1], 7, 2.2);
    {   // pangkalan musuh: seluruh areanya tanah keras (bukan air, bukit, atau hutan)
      const hx = (HQR[0] + .5) * CELL, hy = (HQR[1] + .5) * CELL, B0 = W.FACB;
      for (let y = Math.floor((hy + B0[2]) / CELL); y <= Math.floor((hy + B0[3]) / CELL); y++) for (let x = Math.floor((hx + B0[0]) / CELL); x <= Math.floor((hx + B0[1]) / CELL); x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        t[y * GW + x] = T.URBAN; e[y * GW + x] = Math.max(e[y * GW + x], .4);
      }
    }
    {   // v3.0 lapangan terbang markas kita: tanah keras rata (bukan air / bukit / hutan)
      const B1 = W.facB((HQB[0] + .5) * CELL, (HQB[1] + .5) * CELL).rects[0];
      for (let y = Math.floor(B1[1] / CELL); y <= Math.floor(B1[3] / CELL); y++) for (let x = Math.floor(B1[0] / CELL); x <= Math.floor(B1[2] / CELL); x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        t[y * GW + x] = T.URBAN; e[y * GW + x] = Math.max(e[y * GW + x], .4);
      }
    }
    OBJ.forEach(o => clear(o[1], o[2], 6, 2.5));
    // jalan (melintasi air = jembatan)
    const roads = [];
    const road = (a, b, s) => {
      const mx = (a[0] + b[0]) / 2 + (vn(s, 1, seed) - .5) * 12, my = (a[1] + b[1]) / 2 + (vn(s, 2, seed) - .5) * 12;
      roads.push([[a[0] + .5, a[1] + .5], [mx + .5, my + .5], [b[0] + .5, b[1] + .5]]);   // garis tengah (untuk jalan 3D yang mulus)
      [[a, [mx, my]], [[mx, my], b]].forEach(seg => {
        const [p, q] = seg, n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 1.5);
        for (let k = 0; k <= n; k++) {
          const x = Math.round(p[0] + (q[0] - p[0]) * k / n), y = Math.round(p[1] + (q[1] - p[1]) * k / n);
          if (x >= 0 && y >= 0 && x < GW && y < GH && t[y * GW + x] !== T.URBAN) t[y * GW + x] = T.ROAD;
        }
      });
    };
    const O = i => [OBJ[i][1], OBJ[i][2]];
    road(HQB, O(0), 1); road(O(0), O(1), 2); road(O(1), O(2), 3); road(O(2), HQR, 4); road(O(1), O(3), 5); road(O(1), O(4), 6); road(O(4), HQR, 7);

    /* bioma (wilayah Voronoi berbatas organik): 0 tropis/hutan, 1 gurun, 2 rawa, 3 vulkanik — keempatnya selalu ada */
    const B = W.BIO, bio = new Uint8Array(GW * GH), hs = (k, j) => hash(k, j, seed + 900);
    const sites = [[10, 28, B.TROP], [25 + hs(1, 1) * 50, 3 + hs(1, 2) * 16, B.DESERT], [20 + hs(2, 1) * 55, 40 + hs(2, 2) * 12, B.SWAMP], [42 + hs(3, 1) * 40, 10 + hs(3, 2) * 40, B.VOLC],
      [hs(4, 1) * GW, hs(4, 2) * GH, B.TROP], [hs(5, 1) * GW, hs(5, 2) * GH, (hs(5, 3) * 4) | 0]];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const wx = x + (vn(x / 6, y / 6, seed + 901) - .5) * 12, wy = y + (vn(x / 6 + 40, y / 6, seed + 902) - .5) * 12;
      let bd = 1e9, b = 0; for (const s of sites) { const d = (wx - s[0]) * (wx - s[0]) + (wy - s[1]) * (wy - s[1]); if (d < bd) { bd = d; b = s[2]; } }
      bio[y * GW + x] = b;
      if (b === B.DESERT && t[y * GW + x] === T.FOREST && vn(x / 3, y / 3, seed + 903) > .25) t[y * GW + x] = T.PLAIN;   // gurun: hanya oasis kecil
    }
    // gunung berapi: puncak di wilayah vulkanik, jauh dari jalan, markas, dan objektif
    const far = (x, y) => {
      let m = 1e9; for (const p of [HQB, HQR].concat(OBJ.map(o => [o[1], o[2]]))) m = Math.min(m, Math.hypot(x - p[0], y - p[1]) - 7);
      m = Math.min(m, Math.hypot(x - HQR[0], y - HQR[1]) - 15);   // gunung berapi tidak menutupi landasan
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH && t[yy * GW + xx] === T.ROAD) m = Math.min(m, Math.hypot(dx, dy) - 3.5); }
      return m;
    };
    let vb = null, vs = -1e9;
    for (let y = 8; y < GH - 12; y++) for (let x = 12; x < GW - 12; x++) {
      const f = far(x, y); if (f < 0) continue;
      const sc = (bio[y * GW + x] === B.VOLC ? 3 : 0) + e[y * GW + x] * 2 + Math.min(f, 4) * .3 + hs(x, y) * .2;
      if (sc > vs) { vs = sc; vb = [x, y]; }
    }
    let volc = null;
    if (vb) {
      const R = 6; volc = { x: vb[0] + .5, y: vb[1] + .5, r: R };
      for (let y = vb[1] - 10; y <= vb[1] + 10; y++) for (let x = vb[0] - 10; x <= vb[0] + 10; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue; const d = Math.hypot(x - vb[0], y - vb[1]), i = y * GW + x;
        if (d <= 9.5) bio[i] = B.VOLC;
        if (d > R || t[i] === T.ROAD || t[i] === T.URBAN) continue;
        t[i] = T.HILL; e[i] = Math.max(e[i], .6 + .46 * Math.pow(1 - d / R, 1.2));
      }
    }
    return { GW, GH, t, e, HQB, HQR, OBJ, seed, bio, volc, roads };
  };

  /* ---------------- A* ---------------- */
  W.passable = (g, cx, cy, mode) => {
    if (cx < 0 || cy < 0 || cx >= g.GW || cy >= g.GH) return false;
    const v = g.t[cy * g.GW + cx];
    return mode === 'S' ? v === W.TER.WATER : v !== W.TER.WATER;
  };
  function nearestPassable(g, cx, cy, mode) {
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (W.passable(g, cx + dx, cy + dy, mode)) return [cx + dx, cy + dy];
    }
    return null;
  }
  function los(g, a, b, mode) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 1; k < n; k++) {
      const x = Math.round(a[0] + (b[0] - a[0]) * k / n), y = Math.round(a[1] + (b[1] - a[1]) * k / n);
      if (!W.passable(g, x, y, mode)) return false;
    }
    return true;
  }
  // koordinat sel -> daftar titik dunia (m)
  W.astar = function (g, sx, sy, gx, gy, mode) {
    const w = g.GW, N = w * g.GH;
    if (!W.passable(g, gx, gy, mode)) { const n = nearestPassable(g, gx, gy, mode); if (!n) return null; gx = n[0]; gy = n[1]; }
    sx = Math.max(0, Math.min(w - 1, sx)); sy = Math.max(0, Math.min(g.GH - 1, sy));
    const gs = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const hf = [], hi = [];
    const push = (f, i) => { let k = hf.length; hf.push(f); hi.push(i); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hf[p], hf[k]] = [hf[k], hf[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; } };
    const pop = () => {
      const top = hi[0], lf = hf.pop(), li = hi.pop();
      if (hf.length) { hf[0] = lf; hi[0] = li; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < hf.length && hf[l] < hf[m]) m = l; if (r < hf.length && hf[r] < hf[m]) m = r; if (m === k) break; [hf[m], hf[k]] = [hf[k], hf[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m; } }
      return top;
    };
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (Math.max(dx, dy) + .414 * Math.min(dx, dy)) * .7; };
    const s = sy * w + sx, goal = gy * w + gx; gs[s] = 0; push(h(sx, sy), s);
    let found = false;
    while (hf.length) {
      const c = pop(); if (closed[c]) continue; closed[c] = 1;
      if (c === goal) { found = true; break; }
      const cx = c % w, cy = (c / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy; if (!W.passable(g, nx, ny, mode)) continue;
        if (dx && dy && (!W.passable(g, cx + dx, cy, mode) || !W.passable(g, cx, cy + dy, mode))) continue; // tidak memotong sudut
        const n = ny * w + nx; if (closed[n]) continue;
        const ter = mode === 'S' ? 1 : W.TSPD[g.t[n]] || 1;
        const ng = gs[c] + (dx && dy ? 1.414 : 1) / ter;
        if (ng < gs[n]) { gs[n] = ng; came[n] = c; push(ng + h(nx, ny), n); }
      }
    }
    if (!found) return null;
    const cells = []; for (let c = goal; c !== -1 && c !== s; c = came[c]) cells.push([c % w, (c / w) | 0]);
    cells.reverse();
    // string-pulling sederhana
    const out = []; let anchor = [sx, sy], i = 0;
    while (i < cells.length) {
      let j = cells.length - 1; while (j > i && !los(g, anchor, cells[j], mode)) j--;
      out.push(cells[j]); anchor = cells[j]; i = j + 1;
    }
    return out.map(c => ({ x: (c[0] + .5) * CELL, y: (c[1] + .5) * CELL }));
  };
})();
