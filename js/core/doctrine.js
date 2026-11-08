/* ============================================================
   DOCTRINE — data doktrin (TNI / US), bahasa, satuan ukur
   Semua data fiktif untuk simulasi; bukan data operasional nyata.
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK;

  /* ---------------- BAHASA ---------------- */
  TK.LANG = {
    id: {
      title: 'KOMANDO TAKTIS // PUSAT OPERASI PERTAHANAN UDARA',
      v_radar: 'RADAR PPI', v_map: 'PETA TAKTIS',
      p_cmd: 'KOMANDO', l_cmd: 'SATUAN', l_op: 'OPERATOR', l_th: 'TEATER', l_mt: 'WAKTU MISI', l_sc: 'SKOR',
      p_roe: 'ROE & KESIAGAAN', l_roe: 'ATURAN KETERLIBATAN',
      p_sites: 'SITUS & SENSOR', p_stats: 'STATISTIK MISI',
      s_int: 'INTEGRITAS PERTAHANAN', s_kill: 'MUSUH DIHANCURKAN', s_vid: 'IDENTIFIKASI VISUAL',
      s_civ: 'KORBAN SIPIL', s_blue: 'KAWAN TERTEMBAK', s_hit: 'SERANGAN TEMBUS', s_warn: 'PERINGATAN',
      p_ew: 'SPEKTRUM / EW', ew_nf: 'NOISE FLOOR', ew_j: 'JAMMING', j0: 'TIDAK ADA', j1: 'AKTIF',
      p_con: 'DAFTAR KONTAK', fall: 'SEMUA',
      th_id: 'ID', th_iff: 'IFF', th_brg: 'BRG', th_rng: 'RNG', th_alt: 'ALT', th_spd: 'SPD',
      p_det: 'DETAIL TARGET', no_tgt: '— TIDAK ADA TARGET —',
      p_log: 'PERISTIWA', p_cons: 'KONSOL',
      c_range: 'JANGKAUAN', c_sweep: 'SWEEP', c_trail: 'JEJAK', c_grid: 'GRID', c_lbl: 'LABEL', c_snd: 'SUARA',
      c_pause: 'JEDA', c_dl: 'DATALINK', c_land: 'PETA DASAR', c_spawn: '+ KONTAK',
      leg_f: 'KAWAN', leg_h: 'MUSUH', leg_u: 'TAK DIKENAL', leg_c: 'SIPIL',
      hint_radar: 'KLIK KONTAK · [TAB] BERIKUTNYA · [1-4] RANGE · [M] PETA · [SPASI] JEDA',
      hint_map: 'SERET: GESER · RODA: ZOOM · DBL-KLIK: RESET · [M] RADAR',
      cursor: 'KURSOR', sweep: 'SWEEP', map_disc: 'PETA SKEMATIK — BUKAN UNTUK NAVIGASI',
      d_class: 'KELAS', d_iff: 'KLASIFIKASI', d_pos: 'BEARING / RANGE', d_alt: 'KETINGGIAN', d_spd: 'KECEPATAN',
      d_hdg: 'HEADING', d_eta: 'ETA SITUS', d_thr: 'ANCAMAN', d_trk: 'STATUS TRACK', d_state: 'STATUS',
      d_fuel: 'BAHAN BAKAR', d_ammo: 'RUDAL', d_tgt: 'TUGAS', d_hact: 'TINDAKAN PERMUSUHAN',
      trk_ok: 'AKTIF', trk_dr: 'DEAD-RECKONING', trk_lost: 'HILANG', surface: 'PERMUKAAN',
      thr_LOW: 'RENDAH', thr_MED: 'SEDANG', thr_HIGH: 'TINGGI', thr_NA: '—',
      a_scr: 'SCRAMBLE', a_hail: 'PANGGIL', a_eng: 'ENGAGE', a_rtb: 'RTB', a_iff: 'KLASIFIKASI',
      st_INTERCEPT: 'MENCEGAT', st_ESCORT: 'MENGAWAL', st_RTB: 'RTB',
      md_title: 'OTORISASI PENEMBAKAN', md_tgt: 'TARGET', md_roe: 'ROE', md_eff: 'PILIH EFEKTOR', md_none: 'TIDAK ADA EFEKTOR DALAM JANGKAUAN',
      md_ok: 'OTORISASI TEMBAK', md_cancel: 'BATAL', md_warn: 'PERHATIAN: IDENTITAS TARGET BELUM TERKONFIRMASI. RISIKO KORBAN SIPIL / KAWAN.',
      r_ok: 'DIIZINKAN', r_free_u: 'DIIZINKAN — PERINGATAN: TARGET BELUM TERIDENTIFIKASI',
      r_friend: 'DITOLAK: TARGET BERSTATUS KAWAN', r_civil: 'DITOLAK: TARGET BERSTATUS SIPIL',
      r_tight: 'DITOLAK: TARGET BELUM DIKLASIFIKASI MUSUH — LAKUKAN SCRAMBLE/VID',
      r_hold: 'DITOLAK: TIDAK ADA TINDAKAN PERMUSUHAN (TAHAN TEMBAK)',
      r_lost: 'DITOLAK: TRACK HILANG — TIDAK ADA KUNCI KENDALI API',
      eff_SAM: 'RUDAL HANUD', eff_SSM: 'RUDAL ANTIKAPAL', eff_AAM: 'INTERSEPTOR',
      // log
      m_new: 'KONTAK BARU {id} · BRG {brg}° · {rng} · {cls}',
      m_warn: 'PERINGATAN: {id} MEMASUKI ZONA {site} — {rng}',
      m_scr: 'SCRAMBLE: {call} DARI {site} MENUJU {id}',
      m_noready: 'TIDAK ADA PESAWAT SIAGA YANG TERSEDIA',
      m_vid: 'VID {call}: {id} = {cls} ({type})',
      m_hail_f: '{id} MERESPONS: {ack}',
      m_hail_c: '{id} MERESPONS: PENERBANGAN/PELAYARAN SIPIL, RENCANA PERJALANAN TERVERIFIKASI — SARAN: KLASIFIKASI SIPIL',
      m_hail_n: '{id} TIDAK MERESPONS PANGGILAN (GUARD 121.5 / CH-16)',
      m_fire: '{eff} MELUNCURKAN RUDAL KE {id}',
      m_kill: 'KONFIRMASI KILL: {id} DIHANCURKAN',
      m_civ: 'KORBAN SIPIL! {id} TERNYATA SIPIL — INVESTIGASI DIPERLUKAN',
      m_blue: 'KAWAN TERTEMBAK! {id} ADALAH PIHAK SENDIRI',
      m_miss: 'RUDAL MELESET — {id} MASIH AKTIF',
      m_strike: 'SERANGAN TEMBUS: {id} MENGHANTAM {site} — INTEGRITAS {hp}%',
      m_down: 'SITUS {site} LUMPUH',
      m_ecm: 'ECM: JAMMING PADA RADAR {site} — SENSOR TERGANGGU',
      m_ecm_end: 'ECM BERAKHIR PADA {site}',
      m_bingo: '{call}: BINGO FUEL — RTB',
      m_rtb: '{call}: KEMBALI KE PANGKALAN',
      m_lost_tgt: '{call}: TARGET HILANG/SELESAI — RTB',
      m_land: '{call} MENDARAT DI {site}',
      m_class: '{id} DIKLASIFIKASI ULANG → {cls} OLEH OPERATOR',
      m_roe: 'ROE DIUBAH → {roe}',
      m_site: 'SENSOR UTAMA → {site}',
      m_over: 'SEMUA SITUS LUMPUH — MISI GAGAL. SKOR AKHIR {score}',
      m_doc: 'DOKTRIN DIGANTI → {doc}. SKENARIO DIMULAI ULANG.',
      m_start: 'SISTEM AKTIF. PENGAWASAN {th} DIMULAI.',
      m_tip: 'PETUNJUK: IDENTIFIKASI KONTAK TAK DIKENAL (SCRAMBLE → VID) SEBELUM MENEMBAK.',
      m_nofc: 'TIDAK ADA KUNCI KENDALI API UNTUK {id}',
      ty_FIGHTER: 'PESAWAT TEMPUR', ty_BOMBER: 'PEMBOM', ty_UAV: 'PESUD (UAV)', ty_HELI: 'HELIKOPTER', ty_TRANSPORT: 'PESAWAT ANGKUT',
      ty_AIRLINER: 'PESAWAT PENUMPANG', ty_CARGO: 'KARGO UDARA', ty_DESTROYER: 'KAPAL PERUSAK', ty_FRIGATE: 'FREGAT',
      ty_PATROL: 'KAPAL PATROLI', ty_TANKER: 'KAPAL TANKER', ty_FISHING: 'KAPAL NELAYAN', ty_UNK: 'TAK DIKETAHUI',
      cs_hint: 'ketik "help" ...', cs_help: 'PERINTAH: help · status · site <kode> · range <1-4> · roe <hold|tight|free> · select <id> · iff <id> <f|h|u|c> · scramble [id] · hail [id] · engage [id] · rtb <id> · view <radar|map|war> · doctrine <tni|us> · pause · clear',
      cs_unk: 'PERINTAH TIDAK DIKENAL. KETIK "help".', cs_nt: 'KONTAK TIDAK DITEMUKAN: {x}',
      cs_stat: 'STATUS — KONTAK {n} · SKOR {s} · INTEGRITAS {i}% · ROE {r}',
      flavor: ['ATC JAKARTA: LALU LINTAS SIPIL PADAT DI JALUR AIRWAY UTARA.', 'INTEL: AKTIVITAS RADAR TIDAK BIASA TERDETEKSI DI SEKTOR TIMUR LAUT.', 'CUACA: CUMULONIMBUS DI SEKTOR SELATAN, VISIBILITAS MENURUN.', 'KOMUNIKASI: SATELIT SATCOM BERALIH KE JALUR CADANGAN.', 'LOGISTIK: PENGISIAN AMUNISI SITUS SELESAI TERJADWAL 02:00Z.', 'INTEL: LAPORAN NELAYAN MELIHAT KAPAL TANPA BENDERA.']
    },
    en: {
      title: 'JOINT AIR DEFENSE OPERATIONS CENTER // TACTICAL COMMAND',
      v_radar: 'RADAR PPI', v_map: 'TACTICAL MAP',
      p_cmd: 'COMMAND', l_cmd: 'UNIT', l_op: 'OPERATOR', l_th: 'THEATER', l_mt: 'MISSION TIME', l_sc: 'SCORE',
      p_roe: 'ROE & READINESS', l_roe: 'RULES OF ENGAGEMENT',
      p_sites: 'SITES & SENSORS', p_stats: 'MISSION STATS',
      s_int: 'DEFENSE INTEGRITY', s_kill: 'HOSTILES KILLED', s_vid: 'VISUAL IDs',
      s_civ: 'CIVILIAN LOSSES', s_blue: 'BLUE-ON-BLUE', s_hit: 'LEAKERS', s_warn: 'WARNINGS',
      p_ew: 'SPECTRUM / EW', ew_nf: 'NOISE FLOOR', ew_j: 'JAMMING', j0: 'NONE', j1: 'ACTIVE',
      p_con: 'TRACK TABLE', fall: 'ALL',
      th_id: 'TRK', th_iff: 'ID', th_brg: 'BRG', th_rng: 'RNG', th_alt: 'ALT', th_spd: 'SPD',
      p_det: 'TRACK DETAIL', no_tgt: '— NO TRACK SELECTED —',
      p_log: 'EVENT LOG', p_cons: 'CONSOLE',
      c_range: 'RANGE', c_sweep: 'SWEEP', c_trail: 'TRAILS', c_grid: 'GRID', c_lbl: 'LABELS', c_snd: 'AUDIO',
      c_pause: 'FREEZE', c_dl: 'DATALINK', c_land: 'BASEMAP', c_spawn: '+ TRACK',
      leg_f: 'FRIEND', leg_h: 'HOSTILE', leg_u: 'UNKNOWN', leg_c: 'NEUTRAL',
      hint_radar: 'CLICK TRACK · [TAB] NEXT · [1-4] RANGE · [M] MAP · [SPACE] FREEZE',
      hint_map: 'DRAG: PAN · WHEEL: ZOOM · DBL-CLICK: RESET · [M] RADAR',
      cursor: 'CURSOR', sweep: 'SWEEP', map_disc: 'SCHEMATIC MAP — NOT FOR NAVIGATION',
      d_class: 'TYPE', d_iff: 'IDENTITY', d_pos: 'BEARING / RANGE', d_alt: 'ALTITUDE', d_spd: 'SPEED',
      d_hdg: 'HEADING', d_eta: 'ETA SITE', d_thr: 'THREAT', d_trk: 'TRACK STATUS', d_state: 'STATE',
      d_fuel: 'FUEL', d_ammo: 'MISSILES', d_tgt: 'TASKING', d_hact: 'HOSTILE ACT',
      trk_ok: 'ACTIVE', trk_dr: 'DEAD-RECKONING', trk_lost: 'LOST', surface: 'SURFACE',
      thr_LOW: 'LOW', thr_MED: 'MEDIUM', thr_HIGH: 'HIGH', thr_NA: '—',
      a_scr: 'SCRAMBLE', a_hail: 'HAIL', a_eng: 'ENGAGE', a_rtb: 'RTB', a_iff: 'ASSIGN IDENTITY',
      st_INTERCEPT: 'INTERCEPT', st_ESCORT: 'ESCORT', st_RTB: 'RTB',
      md_title: 'WEAPONS RELEASE AUTHORIZATION', md_tgt: 'TARGET', md_roe: 'ROE', md_eff: 'SELECT EFFECTOR', md_none: 'NO EFFECTORS IN RANGE',
      md_ok: 'AUTHORIZE FIRE', md_cancel: 'CANCEL', md_warn: 'CAUTION: TARGET IDENTITY NOT CONFIRMED. RISK OF CIVILIAN / FRIENDLY LOSS.',
      r_ok: 'CLEARED', r_free_u: 'CLEARED — CAUTION: TARGET NOT POSITIVELY IDENTIFIED',
      r_friend: 'DENIED: TARGET IS FRIENDLY', r_civil: 'DENIED: TARGET IS CIVIL/NEUTRAL',
      r_tight: 'DENIED: TARGET NOT DECLARED HOSTILE — SCRAMBLE FOR VID',
      r_hold: 'DENIED: NO HOSTILE ACT OBSERVED (WEAPONS HOLD)',
      r_lost: 'DENIED: TRACK LOST — NO FIRE-CONTROL QUALITY',
      eff_SAM: 'SAM BATTERY', eff_SSM: 'ANTI-SHIP MISSILE', eff_AAM: 'INTERCEPTOR',
      m_new: 'NEW TRACK {id} · BRG {brg}° · {rng} · {cls}',
      m_warn: 'WARNING: {id} ENTERING {site} ENGAGEMENT ZONE — {rng}',
      m_scr: 'SCRAMBLE: {call} FROM {site} TO {id}',
      m_noready: 'NO ALERT AIRCRAFT AVAILABLE',
      m_vid: 'VID {call}: {id} = {cls} ({type})',
      m_hail_f: '{id} REPLIES: {ack}',
      m_hail_c: '{id} REPLIES: CIVIL FLIGHT/VOYAGE, FLIGHT PLAN VERIFIED — RECOMMEND NEUTRAL DECLARATION',
      m_hail_n: '{id} NO REPLY ON GUARD 121.5 / CH-16',
      m_fire: '{eff} LAUNCHES AT {id}',
      m_kill: 'SPLASH: {id} DESTROYED',
      m_civ: 'CIVILIAN CASUALTY! {id} WAS A NEUTRAL — INVESTIGATION REQUIRED',
      m_blue: 'BLUE-ON-BLUE! {id} WAS FRIENDLY',
      m_miss: 'MISSILE MISS — {id} STILL ACTIVE',
      m_strike: 'LEAKER: {id} STRIKES {site} — INTEGRITY {hp}%',
      m_down: 'SITE {site} IS DOWN',
      m_ecm: 'ECM: JAMMING ON {site} RADAR — SENSOR DEGRADED',
      m_ecm_end: 'ECM CLEARED AT {site}',
      m_bingo: '{call}: BINGO FUEL — RTB',
      m_rtb: '{call}: RETURNING TO BASE',
      m_lost_tgt: '{call}: TARGET LOST/DONE — RTB',
      m_land: '{call} LANDED AT {site}',
      m_class: '{id} RE-DECLARED → {cls} BY OPERATOR',
      m_roe: 'ROE CHANGED → {roe}',
      m_site: 'PRIMARY SENSOR → {site}',
      m_over: 'ALL SITES DOWN — MISSION FAILED. FINAL SCORE {score}',
      m_doc: 'DOCTRINE → {doc}. SCENARIO RESTARTED.',
      m_start: 'SYSTEM ONLINE. {th} SURVEILLANCE STARTED.',
      m_tip: 'TIP: IDENTIFY UNKNOWN TRACKS (SCRAMBLE → VID) BEFORE FIRING.',
      m_nofc: 'NO FIRE-CONTROL TRACK ON {id}',
      ty_FIGHTER: 'FIGHTER', ty_BOMBER: 'BOMBER', ty_UAV: 'UAV', ty_HELI: 'ROTARY WING', ty_TRANSPORT: 'TRANSPORT',
      ty_AIRLINER: 'AIRLINER', ty_CARGO: 'AIR CARGO', ty_DESTROYER: 'DESTROYER', ty_FRIGATE: 'FRIGATE',
      ty_PATROL: 'PATROL VESSEL', ty_TANKER: 'TANKER', ty_FISHING: 'FISHING VESSEL', ty_UNK: 'UNKNOWN',
      cs_hint: 'type "help" ...', cs_help: 'COMMANDS: help · status · site <code> · range <1-4> · roe <hold|tight|free> · select <id> · iff <id> <f|h|u|c> · scramble [id] · hail [id] · engage [id] · rtb <id> · view <radar|map|war> · doctrine <tni|us> · pause · clear',
      cs_unk: 'UNKNOWN COMMAND. TYPE "help".', cs_nt: 'TRACK NOT FOUND: {x}',
      cs_stat: 'STATUS — TRACKS {n} · SCORE {s} · INTEGRITY {i}% · ROE {r}',
      flavor: ['ATC: HEAVY CIVIL TRAFFIC ON NORTHERN AIRWAYS.', 'INTEL: UNUSUAL EMITTER ACTIVITY IN NORTHEAST SECTOR.', 'WX: CUMULONIMBUS TO THE SOUTH, VISIBILITY DEGRADING.', 'COMMS: SATCOM FAILED OVER TO BACKUP PATH.', 'LOGISTICS: SITE RESUPPLY WINDOW SCHEDULED 0200Z.', 'INTEL: FISHING VESSEL REPORTS UNFLAGGED CONTACT.']
    }
  };

  /* ---------------- DOKTRIN ---------------- */
  const SAM_R = 90;
  TK.DOC = {
    tni: {
      id: 'tni', lang: 'id', units: 'metric', mark: 'TNI AU',
      cmd: 'KOHANUDNAS', cmdFull: 'KOMANDO PERTAHANAN UDARA NASIONAL',
      sub: 'KOHANUDNAS · KOSEK HANUDNAS · SEKTOR NATUNA · RAHASIA (SIMULASI)',
      theater: 'LAUT NATUNA UTARA & SELAT KARIMATA', operator: 'KOL. (PNB) OPR-01',
      alerts: { 5: 'SIAGA-5 · NORMAL', 4: 'SIAGA-4 · WASPADA', 3: 'SIAGA-3 · SIAGA', 2: 'SIAGA-2 · BAHAYA', 1: 'SIAGA-1 · KRITIS' },
      roe: { HOLD: 'TAHAN TEMBAK', TIGHT: 'TEMBAK TERBATAS', FREE: 'BEBAS TEMBAK' },
      iff: { F: 'KAWAN', H: 'MUSUH', U: 'TAK DIKENAL', C: 'SIPIL' },
      tag: { F: 'KWN', H: 'MSH', U: 'UNK', C: 'SPL' },
      callF: ['GARUDA', 'ELANG', 'RAJAWALI', 'SRIKANDI'], callI: ['SERGAP', 'BIMA', 'ARJUNA', 'GATOTKACA'],
      ack: 'SIAP, DITERIMA. GANTI.', civPrefix: 'NX', unitName: 'TNI AU — SKADRON UDARA',
      ranges: [{ km: 50, l: '50 KM' }, { km: 100, l: '100 KM' }, { km: 200, l: '200 KM' }, { km: 300, l: '300 KM' }],
      boot: ['KOHANUDNAS C2 v4.2 — PUSAT OPERASI PERTAHANAN UDARA', 'MEMUAT TABEL ORBAT TNI AU ........ OK', 'SINKRONISASI DATALINK TAKTIS (LINK-Y) ........ OK',
        'KALIBRASI RADAR HANUD SEKTOR NATUNA ........ OK', 'VERIFIKASI IFF MODE 4 / MODE 5 ........ OK', 'BATERAI RUDAL HANUD: SIAGA ........ OK', 'OTENTIKASI PERWIRA JAGA ........ DITERIMA', '', 'SISTEM SIAP. MEMULAI PENGAWASAN...'],
      sites: [
        { id: 'NTN', n: 'NATUNA (RANAI)', kind: 'AB', lon: 108.39, lat: 3.91, ready: 4, sam: 6 },
        { id: 'PTK', n: 'PONTIANAK', kind: 'AB', lon: 109.40, lat: -0.15, ready: 3, sam: 4 },
        { id: 'TPI', n: 'TANJUNGPINANG', kind: 'RDR', lon: 104.53, lat: 0.92, ready: 0, sam: 4 },
        { id: 'HLM', n: 'JAKARTA (HALIM)', kind: 'AB', lon: 106.89, lat: -6.27, ready: 4, sam: 6 },
        { id: 'BPN', n: 'BALIKPAPAN', kind: 'AB', lon: 116.89, lat: -1.27, ready: 3, sam: 4 },
        { id: 'TRK', n: 'TARAKAN', kind: 'RDR', lon: 117.57, lat: 3.33, ready: 0, sam: 4 }
      ]
    },
    us: {
      id: 'us', lang: 'en', units: 'nautical', mark: 'USAF/USN',
      cmd: 'JADOC-PAC', cmdFull: 'JOINT AIR DEFENSE OPERATIONS CENTER — INDO-PACIFIC',
      sub: 'JADOC-PAC · AIR DEFENSE SECTOR · SOUTH CHINA SEA AOR · SECRET//SIM',
      theater: 'SOUTH CHINA SEA — SOUTHERN AOR', operator: 'COL. USAF OPR-01',
      alerts: { 5: 'DEFCON 5 · ADW WHITE', 4: 'DEFCON 4 · ADW WHITE', 3: 'DEFCON 3 · ADW YELLOW', 2: 'DEFCON 2 · ADW YELLOW', 1: 'DEFCON 1 · ADW RED' },
      roe: { HOLD: 'WEAPONS HOLD', TIGHT: 'WEAPONS TIGHT', FREE: 'WEAPONS FREE' },
      iff: { F: 'FRIEND', H: 'BANDIT', U: 'BOGEY', C: 'NEUTRAL' },
      tag: { F: 'FRD', H: 'BDT', U: 'BGY', C: 'NTL' },
      callF: ['VIPER', 'HAWG', 'REAPER', 'STEEL'], callI: ['RAPTOR', 'COBRA', 'DAGGER', 'SABRE'],
      ack: 'ROGER, COPY. OUT.', civPrefix: 'CX', unitName: 'USAF / USN CARRIER AIR WING',
      ranges: [{ km: 46, l: '25 NM' }, { km: 93, l: '50 NM' }, { km: 185, l: '100 NM' }, { km: 278, l: '150 NM' }],
      boot: ['JADOC-PAC C2 v7.1 — JOINT AIR DEFENSE OPERATIONS CENTER', 'LOADING ORBAT / ATO DATABASE ........ OK', 'LINK-16 TERMINAL SYNC (JTIDS) ........ OK',
        'AN/TPY-2 & SPY-1 SENSOR ALIGNMENT ........ OK', 'IFF MODE 5 CRYPTO LOAD ........ OK', 'PATRIOT / SM-6 BATTERIES: READY ........ OK', 'WATCH OFFICER AUTH ........ ACCEPTED', '', 'SYSTEM READY. COMMENCING SURVEILLANCE...'],
      sites: [
        { id: 'SBC', n: 'SUBIC BAY FOB', kind: 'AB', lon: 120.27, lat: 14.80, ready: 4, sam: 6 },
        { id: 'PLW', n: 'PALAWAN FOB', kind: 'AB', lon: 118.76, lat: 9.74, ready: 4, sam: 4 },
        { id: 'SIN', n: 'SINGAPORE (PAYA LEBAR)', kind: 'AB', lon: 103.91, lat: 1.36, ready: 4, sam: 4 },
        { id: 'CSG', n: 'CSG FLAGSHIP (AT SEA)', kind: 'SHIP', lon: 112.5, lat: 8.0, ready: 4, sam: 12, ssm: 8, samR: 120 },
        { id: 'DDG', n: 'DDG PICKET (AEGIS)', kind: 'SHIP', lon: 109.0, lat: 5.0, ready: 0, sam: 12, ssm: 8, samR: 120 }
      ]
    }
  };
  Object.values(TK.DOC).forEach(d => d.sites.forEach(s => { s.samR = s.samR || SAM_R; }));

  /* ---------------- HELPER ---------------- */
  const D = () => TK.DOC[TK.S.doc];
  TK.t = (key, v) => {
    const L = TK.LANG[D().lang];
    let s = L[key];
    if (s === undefined) s = TK.LANG.id[key] !== undefined ? TK.LANG.id[key] : key;
    if (v && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, k) => v[k] !== undefined ? v[k] : m);
    return s;
  };
  TK.doc = D;
  TK.typeName = ty => TK.t('ty_' + ty);

  // pemformat satuan (metrik: km, km/j, m · nautika: NM, KT, FT)
  TK.fmt = {
    rng: km => D().units === 'metric' ? km.toFixed(0) + ' KM' : (km / 1.852).toFixed(0) + ' NM',
    rng1: km => D().units === 'metric' ? km.toFixed(1) + ' KM' : (km / 1.852).toFixed(1) + ' NM',
    spd: kmh => D().units === 'metric' ? Math.round(kmh) + ' KM/J' : Math.round(kmh / 1.852) + ' KT',
    spdN: kmh => D().units === 'metric' ? Math.round(kmh) : Math.round(kmh / 1.852),
    alt: m => {
      if (m <= 0) return TK.t('surface');
      if (D().units === 'metric') return Math.round(m).toLocaleString('en') + ' M';
      const ft = m * 3.28084;
      return ft >= 5000 ? 'FL' + String(Math.round(ft / 100)).padStart(3, '0') : Math.round(ft / 10) * 10 + ' FT';
    },
    altS: m => m <= 0 ? '—' : D().units === 'metric' ? (m / 1000).toFixed(1) + 'K' : 'FL' + String(Math.round(m * 3.28084 / 100)).padStart(3, '0'),
    ring: (km, range) => D().units === 'metric' ? Math.round(km) : Math.round(km / 1.852)
  };
})();
