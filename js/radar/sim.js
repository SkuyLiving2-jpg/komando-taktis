/* ============================================================
   SIM — mesin simulasi: situs, sensor, kontak, interseptor,
   rudal, ROE, skor, kejadian acak
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, S = TK.S, C = TK.CFG;
  const { rand, pick, TAU, deg, pad, clamp, wrapPi } = TK.util;
  const T = (k, v) => TK.t(k, v);
  const L = (m, lv) => TK.log(m, lv);

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const bearing = (a, b) => (deg(Math.atan2(b.x - a.x, b.y - a.y)) + 360) % 360;
  const kms = c => c.spd * C.TS / 3600;               // km per detik nyata
  const alive = () => S.sites.filter(s => s.hp > 0);
  const siteById = id => S.sites.find(s => s.id === id);
  const label = c => (c.iff === 'F' || c.iff === 'C') && c.name ? c.name : c.trk;
  const cls = k => TK.doc().iff[k];

  // spesifikasi platform: [vMin, vMax (km/j), [altMin, altMax (m)]]
  const AIR = {
    FIGHTER: [700, 1200, [300, 11000]], BOMBER: [500, 800, [150, 9000]], UAV: [120, 260, [2000, 8000]],
    HELI: [140, 250, [100, 1500]], TRANSPORT: [400, 650, [5000, 9000]], AIRLINER: [750, 900, [9000, 12000]], CARGO: [600, 800, [8000, 11000]]
  };
  const SEA = { DESTROYER: [30, 55], FRIGATE: [30, 50], PATROL: [25, 50], TANKER: [18, 30], FISHING: [8, 20] };

  /* ---------------- RESET ---------------- */
  function reset(docId) {
    const D = TK.DOC[docId];
    Object.assign(S, {
      doc: docId, t: 0, contacts: [], missiles: [], fx: [], sel: null, nextId: 1, nextTrk: 1000 + Math.floor(rand(0, 3000)),
      nextCall: 1, roe: 'TIGHT', score: 0, kills: 0, vids: 0, civ: 0, blue: 0, strikes: 0, warns: 0,
      spawnIn: 2, ecmIn: rand(60, 100), flavorIn: 40, over: false
    });
    S.sites = D.sites.map(d => {
      const p = TK.geo.toKm(d.lon, d.lat);
      return {
        id: d.id, name: d.n, kind: d.kind, x: p[0], y: p[1], h: d.kind === 'SHIP' ? 40 : 120, range: d.kind === 'SHIP' ? 300 : 280,
        sam: d.sam ? { ammo: d.sam, max: d.sam, range: d.samR } : null, ssm: d.ssm ? { ammo: d.ssm, max: d.ssm, range: 120 } : null,
        ready: d.ready || 0, readyMax: d.ready || 0, hp: 100, theta: rand(0, TAU), prev: 0, jam: 0, jamB: 0
      };
    });
    S.sites.forEach(s => { s.prev = s.theta; });
    S.siteId = S.sites[0].id;
    for (let i = 0; i < 9; i++) spawn({ near: true });
  }

  /* ---------------- SPAWN ---------------- */
  function spawn(opt = {}) {
    const D = TK.doc(), sites = alive();
    if (!sites.length) return null;
    const hb = opt.near ? .2 : Math.min(.5, .3 + S.t / 1200), r = Math.random();
    const truth = r < hb ? 'H' : r < hb + .4 ? 'C' : 'F';
    const sea = Math.random() < (truth === 'C' ? .25 : .15);
    const site = pick(sites);
    let type, spd, alt = 0;
    if (sea) {
      type = truth === 'H' ? pick(['DESTROYER', 'FRIGATE']) : truth === 'F' ? 'PATROL' : pick(['TANKER', 'FISHING']);
      spd = rand(SEA[type][0], SEA[type][1]);
    } else {
      type = truth === 'H' ? pick(['FIGHTER', 'FIGHTER', 'BOMBER', 'UAV']) : truth === 'F' ? pick(['TRANSPORT', 'HELI', 'FIGHTER']) : pick(['AIRLINER', 'AIRLINER', 'CARGO']);
      const sp = AIR[type]; spd = rand(sp[0], sp[1]); alt = rand(sp[2][0], sp[2][1]);
      if (truth === 'H' && (type === 'FIGHTER' || type === 'BOMBER') && Math.random() < .35) alt = rand(80, 400); // terrain/sea-skimming
    }
    let x, y, hdg;
    if (sea) {
      const a = rand(0, TAU), d = rand(30, 75);
      x = site.x + Math.sin(a) * d; y = site.y + Math.cos(a) * d; hdg = rand(0, TAU);
    } else {
      const a = rand(0, TAU), d = opt.near ? rand(150, 290) : rand(450, 900);
      x = clamp(site.x + Math.sin(a) * d, -C.EXT, C.EXT); y = clamp(site.y + Math.cos(a) * d, -C.EXT, C.EXT);
      const off = truth === 'H' ? 0 : rand(40, 150), oa = rand(0, TAU);
      hdg = Math.atan2(site.x + Math.sin(oa) * off - x, site.y + Math.cos(oa) * off - y) + rand(-.04, .04);
    }
    const iff = truth === 'C' ? (Math.random() < .7 ? 'C' : 'U') : truth === 'H' ? (Math.random() < .1 ? 'H' : 'U') : (Math.random() < .85 ? 'F' : 'U');
    const c = {
      id: S.nextId++, trk: 'T' + (S.nextTrk++), truth, iff, kind: sea ? 'SEA' : 'AIR', type, x, y, hdg, spd, alt,
      age: 0, pings: {}, track: null, hist: [], lastHist: -9, seen: false, warned: false, vid: false, typeKnown: iff !== 'U',
      asset: false, tsite: site.id, behavior: truth === 'H' ? (sea ? 'loiter' : 'attack') : 'pass',
      inbound: 0, loiterT: 0, hailed: false
    };
    if (truth === 'C') c.name = (sea ? 'MV' : D.civPrefix) + Math.floor(rand(100, 999));
    if (truth === 'F') c.name = pick(D.callF) + '-' + Math.floor(rand(1, 9)) + Math.floor(rand(1, 9));
    S.contacts.push(c);
    return c;
  }

  /* ---------------- UTIL ---------------- */
  function steer(c, des, rate, dt) { c.hdg += clamp(wrapPi(des - c.hdg), -rate * dt, rate * dt); }
  function nearestSite(c) {
    let best = null, bd = 1e9;
    for (const s of alive()) { const d = dist(s, c); if (d < bd) { bd = d; best = s; } }
    return best ? { s: best, d: bd } : null;
  }
  function remove(c) {
    S.contacts = S.contacts.filter(o => o !== c);
    if (S.sel === c) S.sel = null;
  }
  const hostileAct = c => {
    if (c.truth !== 'H' || c.behavior === 'probe' || c.behavior === 'leave') return false;
    const n = nearestSite(c); return !!n && n.d < 35;
  };

  /* ---------------- PERILAKU ---------------- */
  function hostileAI(c, dt) {
    let ts = siteById(c.tsite);
    if (!ts || ts.hp <= 0) { const n = nearestSite(c); if (!n) return; ts = n.s; c.tsite = ts.id; }
    const d = dist(c, ts);
    if (c.behavior === 'attack') {
      steer(c, Math.atan2(ts.x - c.x, ts.y - c.y), .6, dt);
      if (d < 9) { strike(c, ts); remove(c); }
    } else if (c.behavior === 'probe') {
      steer(c, Math.atan2(ts.x - c.x, ts.y - c.y), .4, dt);
      if (d < 95) { c.behavior = 'leave'; c.hdg += Math.PI + rand(-.5, .5); }
    } else if (c.behavior === 'loiter') {
      if (d > 45) steer(c, Math.atan2(ts.x - c.x, ts.y - c.y), .5, dt);
      else { steer(c, Math.atan2(ts.x - c.x, ts.y - c.y) + Math.PI / 2, .5, dt); c.loiterT += dt; if (c.loiterT > 25) { c.loiterT = 0; strike(c, ts); } }
    }
  }
  function wander(c, dt) {
    if (c.kind === 'SEA') {
      c.hdg += rand(-.25, .25) * dt;
      if (Math.abs(c.x) > C.EXT || Math.abs(c.y) > C.EXT) steer(c, Math.atan2(-c.x, -c.y), .5, dt);
    }
  }
  function strike(c, ts) {
    ts.hp = Math.max(0, ts.hp - Math.round(rand(12, 24)));
    S.strikes++; S.score -= 150;
    S.fx.push({ x: ts.x, y: ts.y, t: S.t, big: true });
    L(T('m_strike', { id: label(c), site: ts.name, hp: ts.hp }), 'c'); TK.sfx(180, .5, 'sawtooth', .08);
    if (ts.hp <= 0) {
      L(T('m_down', { site: ts.name }), 'c');
      if (!alive().length) { S.over = true; L(T('m_over', { score: S.score }), 'c'); }
    }
  }

  function assetAI(c, dt) {
    c.fuel -= dt / C.FUEL_T;
    if (c.fuel < .22 && c.state !== 'RTB') { c.state = 'RTB'; L(T('m_bingo', { call: c.name }), 'w'); }
    if (c.state !== 'RTB' && !S.contacts.includes(c.target)) { c.state = 'RTB'; L(T('m_lost_tgt', { call: c.name }), 'i'); }
    if (c.state === 'RTB') {
      if (!c.home || c.home.hp <= 0) { const n = nearestSite(c); c.home = n ? n.s : null; }
      if (!c.home) return;
      steer(c, Math.atan2(c.home.x - c.x, c.home.y - c.y), 2, dt); c.spd = 900;
      if (dist(c, c.home) < 7) { c.home.ready++; L(T('m_land', { call: c.name, site: c.home.name }), 'i'); remove(c); }
      return;
    }
    const tg = c.target, d = dist(c, tg);
    if (c.state === 'INTERCEPT') {
      steer(c, Math.atan2(tg.x - c.x, tg.y - c.y), 2, dt); c.spd = 1100;
      if (d < 12) {
        if (!tg.vid) vid(c, tg);
        c.state = 'ESCORT';
      }
    } else { // ESCORT: terbang formasi di samping target
      const ox = tg.x - Math.sin(tg.hdg) * 6 + Math.cos(tg.hdg) * 4, oy = tg.y - Math.cos(tg.hdg) * 6 - Math.sin(tg.hdg) * 4;
      const k = Math.min(1, dt * 1.5);
      c.x += (ox - c.x) * k; c.y += (oy - c.y) * k; c.hdg = tg.hdg; c.spd = tg.spd;
      return 'fixed';
    }
  }
  function vid(a, tg) {
    tg.vid = true; tg.typeKnown = true;
    const wasUnknown = tg.iff === 'U' || tg.iff !== tg.truth;
    tg.iff = tg.truth;
    if (wasUnknown) { S.vids++; S.score += 25; }
    L(T('m_vid', { call: a.name, id: label(tg), cls: cls(tg.iff), type: TK.typeName(tg.type) }), tg.iff === 'H' ? 'c' : 'i');
    TK.sfx(tg.iff === 'H' ? 1100 : 700, .12);
  }

  /* ---------------- DETEKSI ---------------- */
  function detect(c) {
    for (const s of S.sites) {
      if (s.hp <= 0) continue;
      const dx = c.x - s.x, dy = c.y - s.y, d = Math.hypot(dx, dy);
      const hc = c.kind === 'SEA' ? 60 : Math.max(c.alt, 0);
      const rmax = Math.min(s.range, 4.12 * (Math.sqrt(s.h) + Math.sqrt(hc)));   // radar horizon
      if (d > rmax) continue;
      const b = (Math.atan2(dx, dy) + TAU) % TAU;
      if (((b - s.prev + TAU) % TAU) > ((s.theta - s.prev + TAU) % TAU)) continue;
      if (s.jam > 0 && Math.random() < .65) continue;
      c.pings[s.id] = { x: c.x, y: c.y, t: S.t };
      c.track = { x: c.x, y: c.y, t: S.t, hdg: c.hdg, spd: c.spd, site: s.id };
      if (S.t - c.lastHist > 2.5) { c.hist.push({ x: c.x, y: c.y }); if (c.hist.length > 10) c.hist.shift(); c.lastHist = S.t; }
      if (!c.seen) {
        c.seen = true;
        L(T('m_new', { id: label(c), brg: pad(bearing(s, c), 3), rng: TK.fmt.rng(d), cls: cls(c.iff) }), c.iff === 'H' ? 'c' : c.iff === 'U' ? 'w' : 'i');
        if (c.iff === 'U' || c.iff === 'H') TK.sfx(c.iff === 'H' ? 1200 : 700, .12);
      }
    }
  }
  const trackAge = c => c.track ? S.t - c.track.t : 999;
  const isLost = c => trackAge(c) > 20;
  const SIM_LOST = isLost;

  /* ---------------- UPDATE ---------------- */
  function update(dt) {
    S.t += dt;
    const w = TAU / S.period;
    for (const s of S.sites) {
      s.prev = s.theta; s.theta = (s.theta + w * dt) % TAU;
      if (s.jam > 0) { s.jam -= dt; if (s.jam <= 0) L(T('m_ecm_end', { site: s.name }), 'i'); }
    }

    for (const c of S.contacts.slice()) {
      c.age += dt;
      let fixed = false;
      if (c.asset) fixed = assetAI(c, dt) === 'fixed';
      else if (c.truth === 'H') hostileAI(c, dt);
      else wander(c, dt);
      if (!S.contacts.includes(c)) continue;
      if (!fixed) { const v = kms(c); c.x += Math.sin(c.hdg) * v * dt; c.y += Math.cos(c.hdg) * v * dt; }
      detect(c);
      // peringatan zona (berdasar identitas yang ditampilkan)
      if (!c.asset && c.seen && !c.warned && (c.iff === 'U' || c.iff === 'H')) {
        const n = nearestSite(c);
        if (n && n.d < 100) { c.warned = true; S.warns++; L(T('m_warn', { id: label(c), site: n.s.name, rng: TK.fmt.rng(n.d) }), 'c'); TK.sfx(1500, .18, 'sawtooth', .05); }
      }
      if (!c.asset && c.age > 5 && (Math.abs(c.x) > C.EXT + 150 || Math.abs(c.y) > C.EXT + 150)) remove(c);
    }

    // rudal
    for (const m of S.missiles) {
      const tg = m.tgt;
      if (!S.contacts.includes(tg)) { m.dead = true; continue; }
      const dx = tg.x - m.x, dy = tg.y - m.y, d = Math.hypot(dx, dy), step = m.spd * dt;
      if (d <= step + 1) {
        m.dead = true; tg.inbound = Math.max(0, tg.inbound - 1);
        if (Math.random() < m.pk) destroy(tg);
        else { S.fx.push({ x: tg.x, y: tg.y, t: S.t }); L(T('m_miss', { id: label(tg) }), 'w'); }
      } else { m.x += dx / d * step; m.y += dy / d * step; m.hdg = Math.atan2(dx, dy); }
    }
    S.missiles = S.missiles.filter(m => !m.dead);
    S.fx = S.fx.filter(f => S.t - f.t < 2);

    // spawn & kejadian
    S.spawnIn -= dt;
    if (S.spawnIn <= 0 && !S.over) {
      if (S.contacts.filter(c => !c.asset).length < 22) spawn();
      S.spawnIn = Math.max(5, 14 - S.t / 90) + rand(0, 5);
    }
    S.ecmIn -= dt;
    if (S.ecmIn <= 0 && !S.over) {
      const s = pick(alive());
      if (s) { s.jam = rand(15, 25); s.jamB = rand(0, TAU); L(T('m_ecm', { site: s.name }), 'w'); TK.sfx(300, .3, 'sawtooth', .05); }
      S.ecmIn = rand(70, 120);
    }
    S.flavorIn -= dt;
    if (S.flavorIn <= 0) { L(pick(TK.LANG[TK.doc().lang].flavor), 'i'); S.flavorIn = rand(45, 90); }
  }

  /* ---------------- AKSI OPERATOR ---------------- */
  function destroy(c) {
    S.fx.push({ x: c.x, y: c.y, t: S.t }); TK.sfx(150, .4, 'sawtooth', .07);
    const id = label(c);
    remove(c);
    if (c.truth === 'H') { S.kills++; S.score += 100; L(T('m_kill', { id }), 'i'); }
    else if (c.truth === 'C') { S.civ++; S.score -= 500; L(T('m_civ', { id }), 'c'); }
    else { S.blue++; S.score -= 1000; L(T('m_blue', { id }), 'c'); }
  }

  function scramble(target) {
    if (S.over || !target || target.asset) return null;
    const cand = S.sites.filter(s => s.hp > 0 && s.ready > 0).sort((a, b) => dist(a, target) - dist(b, target));
    if (!cand.length) { L(T('m_noready'), 'w'); return null; }
    const s = cand[0]; s.ready--;
    const name = pick(TK.doc().callI) + '-' + (S.nextCall++);
    const a = {
      id: S.nextId++, trk: name, name, truth: 'F', iff: 'F', kind: 'AIR', type: 'FIGHTER', typeKnown: true, asset: true, x: s.x, y: s.y,
      hdg: Math.atan2(target.x - s.x, target.y - s.y), spd: 1100, alt: 8000, age: 0, pings: {}, track: null, hist: [], lastHist: -9,
      seen: true, warned: true, vid: true, state: 'INTERCEPT', target, home: s, fuel: 1, ammo: 4, inbound: 0, behavior: 'pass'
    };
    a.track = { x: a.x, y: a.y, t: S.t, hdg: a.hdg, spd: a.spd, site: s.id };
    S.contacts.push(a);
    L(T('m_scr', { call: name, site: s.name, id: label(target) }), 'i'); TK.sfx(900, .1);
    return a;
  }
  function rtb(a) {
    if (!a || !a.asset || a.state === 'RTB') return;
    a.state = 'RTB'; L(T('m_rtb', { call: a.name }), 'i');
  }
  function hail(c) {
    if (!c || c.asset) return;
    if (c.truth === 'F') L(T('m_hail_f', { id: c.name, ack: TK.doc().ack }), 'i');
    else if (c.truth === 'C' && Math.random() < .9) { L(T('m_hail_c', { id: c.name }), 'w'); c.hailed = true; }
    else L(T('m_hail_n', { id: label(c) }), 'w');
  }
  function setIff(c, k) {
    if (!c || c.asset) return;
    c.iff = k; L(T('m_class', { id: label(c), cls: cls(k) }), 'i'); TK.sfx(900, .06);
  }

  // ROE: apakah target boleh ditembak menurut ROE & klasifikasi yang tampil
  function roeCheck(c) {
    if (c.iff === 'F') return { ok: false, r: 'r_friend' };
    if (c.iff === 'C') return { ok: false, r: 'r_civil' };
    if (!c.seen || isLost(c)) return { ok: false, r: 'r_lost' };
    if (S.roe === 'FREE') return c.iff === 'U' ? { ok: true, r: 'r_free_u', warn: true } : { ok: true, r: 'r_ok' };
    if (S.roe === 'TIGHT') return c.iff === 'H' ? { ok: true, r: 'r_ok' } : { ok: false, r: 'r_tight' };
    return hostileAct(c) ? { ok: true, r: 'r_ok' } : { ok: false, r: 'r_hold' };
  }

  function effectorsFor(c) {
    const out = [];
    if (!c.seen || isLost(c)) return out;
    for (const s of S.sites) {
      if (s.hp <= 0) continue;
      const d = dist(s, c);
      if (c.kind === 'AIR' && s.sam && s.sam.ammo > 0 && d <= s.sam.range) out.push({ kind: 'SAM', site: s, d, range: s.sam.range, ammo: s.sam.ammo, name: s.name });
      if (c.kind === 'SEA' && s.ssm && s.ssm.ammo > 0 && d <= s.ssm.range) out.push({ kind: 'SSM', site: s, d, range: s.ssm.range, ammo: s.ssm.ammo, name: s.name });
    }
    for (const a of S.contacts) {
      if (!a.asset || a.state === 'RTB' || a.ammo <= 0) continue;
      const d = dist(a, c);
      if (d <= 45) out.push({ kind: 'AAM', asset: a, d, range: 45, ammo: a.ammo, name: a.name });
    }
    for (const e of out) {
      e.pk = clamp(.9 - .35 * (e.d / e.range) - (c.alt > 0 && c.alt < 500 ? .12 : 0) - (e.kind === 'SAM' && e.site.jam > 0 ? .1 : 0) - (e.kind === 'AAM' ? .08 : 0), .25, .92);
    }
    return out.sort((a, b) => b.pk - a.pk);
  }

  function fire(c, e) {
    if (e.kind === 'AAM') e.asset.ammo--; else if (e.kind === 'SAM') e.site.sam.ammo--; else e.site.ssm.ammo--;
    const src = e.kind === 'AAM' ? e.asset : e.site;
    S.missiles.push({ x: src.x, y: src.y, hdg: 0, tgt: c, spd: 28, pk: e.pk, kind: e.kind });
    c.inbound++;
    L(T('m_fire', { eff: T('eff_' + e.kind) + ' ' + e.name, id: label(c) }), 'w'); TK.sfx(500, .3, 'sawtooth');
  }

  /* ---------------- TURUNAN ---------------- */
  function threat(c) {
    if (c.iff === 'F' || c.iff === 'C' || c.asset) return 'NA';
    const n = nearestSite(c); if (!n) return 'NA';
    return n.d < 100 ? 'HIGH' : n.d < 250 ? 'MED' : 'LOW';
  }
  function alertLevel() {
    // musuh (H) menaikkan siaga penuh; tak dikenal (U) hanya sampai level 3
    let lvl = 5, nh = 1e9, nu = 1e9;
    for (const c of S.contacts) {
      if (c.asset || !c.seen || SIM_LOST(c) || (c.iff !== 'U' && c.iff !== 'H')) continue;
      const n = nearestSite(c); if (!n) continue;
      if (c.iff === 'H') nh = Math.min(nh, n.d); else nu = Math.min(nu, n.d);
      lvl = 4;
    }
    if (nu < 150 || nh < 250) lvl = 3;
    if (nh < 100) lvl = 2;
    if (nh < 40) lvl = 1;
    return lvl;
  }
  const integrity = () => S.sites.reduce((a, s) => a + s.hp, 0) / S.sites.length;

  // posisi track yang ditampilkan (dead-reckoning dari ping terakhir)
  function trackPos(c) {
    if (!c.track) return null;
    const dt = Math.min(S.t - c.track.t, 40), v = c.track.spd * C.TS / 3600;
    return { x: c.track.x + Math.sin(c.track.hdg) * v * dt, y: c.track.y + Math.cos(c.track.hdg) * v * dt };
  }

  TK.sim = { reset, update, spawn, scramble, rtb, hail, setIff, roeCheck, effectorsFor, fire, threat, alertLevel, integrity,
    label, dist, bearing, kms, trackPos, trackAge, isLost, hostileAct, nearestSite, siteById, alive };
})();
