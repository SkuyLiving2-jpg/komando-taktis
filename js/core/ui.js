/* ============================================================
   UI — panel, tabel kontak, detail target, modal otorisasi,
   konsol perintah, input, loop utama
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, S = TK.S, U = TK.util, SIM = TK.sim;
  const { pad, deg, rand } = U;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const T = (k, v) => TK.t(k, v);
  const label = c => SIM.label(c);
  const IFFS = ['F', 'H', 'U', 'C'];
  const IFFCOL = { F: 'var(--cyan)', H: 'var(--red)', U: 'var(--amber)', C: '#c8ffd0' };

  /* ---------- LOG ---------- */
  function log(msg, lv) {
    const d = document.createElement('div'), n = new Date();
    d.innerHTML = '<span class="t">[' + pad(n.getUTCHours()) + ':' + pad(n.getUTCMinutes()) + ':' + pad(n.getUTCSeconds()) + 'Z]</span> <span class="' + (lv || '') + '">' + msg + '</span>';
    const el = $('#log'); el.appendChild(d);
    while (el.children.length > 120) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight; $('#logcount').textContent = el.children.length;
  }

  /* ---------- SUARA ---------- */
  let actx = null;
  function beep(f, dur, type, vol) {
    if (!S.opts.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square'; o.frequency.value = f || 880; g.gain.value = vol || .04;
      g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + (dur || .1));
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (dur || .1));
    } catch (e) { /* audio tidak tersedia */ }
  }

  /* ---------- BAHASA & DOKTRIN ---------- */
  function applyDoc() {
    const D = TK.doc();
    document.body.dataset.doc = D.id; document.documentElement.lang = D.lang;
    $$('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
    $('#subtitle').textContent = D.sub; $('#mark').textContent = D.mark; $('#cmdname').textContent = D.cmd;
    $('#opname').textContent = D.operator; $('#theater').textContent = D.theater; $('#crest').textContent = D.id === 'tni' ? '★' : '✦';
    $$('#docsw button').forEach(b => b.classList.toggle('on', b.dataset.doc === D.id));
    $$('#roebtns button').forEach(b => { b.textContent = D.roe[b.dataset.roe]; });
    $('#rangebtns').innerHTML = D.ranges.map((r, i) => '<button data-ri="' + i + '">' + r.l + '</button>').join('');
    $('#chips').innerHTML = '<button data-f="ALL">' + T('fall') + '</button>' + IFFS.map(k => '<button data-f="' + k + '" style="color:' + IFFCOL[k] + '">' + D.tag[k] + '</button>').join('');
    $('#conin').placeholder = T('cs_hint');
    syncControls(); setView(S.view); if (TK.warui) TK.warui.applyLang(); if (TK.fpsui && TK.fpsui.applyLang) TK.fpsui.applyLang(); if (TK.nexusui) TK.nexusui.applyLang();
  }
  function syncControls() {
    $$('#rangebtns button').forEach(b => b.classList.toggle('on', +b.dataset.ri === S.rangeIdx));
    $$('#roebtns button').forEach(b => b.classList.toggle('on', b.dataset.roe === S.roe));
    $$('#chips button').forEach(b => b.classList.toggle('on', b.dataset.f === S.filter));
    $$('[data-opt]').forEach(b => b.classList.toggle('on', !!S.opts[b.dataset.opt]));
    $('#bPause').classList.toggle('on', S.paused);
    $('#roename').textContent = TK.doc().roe[S.roe];
  }
  function switchDoctrine(id) {
    if (id === S.doc) return;
    SIM.reset(id); applyDoc(); $('#log').innerHTML = '';
    log(T('m_doc', { doc: TK.doc().cmd }), 'w'); log(T('m_start', { th: TK.doc().theater }), 'i'); log(T('m_tip'), 'w');
    select(null); closeModal(); renderAll();
  }

  /* ---------- VIEW ---------- */
  let warIntro = false;
  function setView(v) {
    const prev = S.view; S.view = v; document.body.dataset.view = v;
    const st = $('#stage'); st.classList.toggle('map', v === 'map'); st.classList.toggle('war', v === 'war'); st.classList.toggle('fps', v === 'fps');
    if (prev === 'fps' && v !== 'fps') TK.fpsui.leave();
    $$('button[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $('#hint').textContent = v === 'war' ? TK.warui.hintText() : T(v === 'map' ? 'hint_map' : 'hint_radar'); $('#cursor').textContent = '';
    if (v === 'war' && !warIntro) { warIntro = true; log(T('w_start'), 'i'); log(T('w_tip'), 'w'); }
    resize(); renderHeader();
    if (v === 'fps' && prev !== 'fps') { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); TK.fpsui.enter(); }
  }
  function resize() { TK.radar.resize(); TK.map.resize(); TK.warui.resize(); TK.fpsui.resize(); resizeSpec(); }

  /* ---------- SELEKSI ---------- */
  function select(c) { S.sel = c || null; lastSig = ''; renderDetail(true); renderContacts(); }
  function visibleContacts() {
    const site = SIM.siteById(S.siteId);
    return S.contacts.filter(c => c.track && (SIM.trackAge(c) < 120 || S.sel === c)).sort((a, b) => SIM.dist(site, SIM.trackPos(a)) - SIM.dist(site, SIM.trackPos(b)));
  }
  function cycle() {
    const l = visibleContacts().filter(c => S.filter === 'ALL' || c.iff === S.filter); if (!l.length) return;
    const i = l.indexOf(S.sel); select(l[(i + 1) % l.length]);
  }

  /* ---------- RENDER: HEADER & STATISTIK ---------- */
  function renderHeader() {
    const lvl = SIM.alertLevel(), al = $('#alert');
    if (S.view === 'war' || S.view === 'fps') { al.className = 'alertbar'; al.textContent = TK.warui.headerText(); return; }
    al.className = 'alertbar' + (lvl <= 3 ? ' a' + lvl : '');
    al.textContent = S.over ? T('m_over', { score: S.score }) : TK.doc().alerts[lvl];
    const t = Math.floor(S.t); $('#mtime').textContent = pad(t / 3600) + ':' + pad(t % 3600 / 60) + ':' + pad(t % 60);
    $('#score').textContent = S.score;
  }
  function renderStats() {
    const ig = SIM.integrity(), el = $('#integ');
    el.className = 'bar' + (ig < 35 ? ' crit' : ig < 70 ? ' warn' : '');
    el.querySelector('.fill').style.width = ig + '%'; $('#integv').textContent = ig.toFixed(0) + '%';
    $('#kills').textContent = S.kills; $('#vids').textContent = S.vids; $('#civ').textContent = S.civ;
    $('#blue').textContent = S.blue; $('#hits').textContent = S.strikes; $('#warns').textContent = S.warns;
    $('#civ').style.color = S.civ ? 'var(--red)' : ''; $('#blue').style.color = S.blue ? 'var(--red)' : '';
    const jam = S.sites.some(s => s.jam > 0); $('#jam').textContent = T(jam ? 'j1' : 'j0'); $('#jam').style.color = jam ? 'var(--amber)' : '';
    $('#nf').textContent = (-92 + rand(-2, 2)).toFixed(0) + ' dBm';
  }

  /* ---------- RENDER: SITUS ---------- */
  function renderSites() {
    $('#nsites').textContent = SIM.alive().length + '/' + S.sites.length;
    $('#sites').innerHTML = S.sites.map(s => {
      const down = s.hp <= 0, col = s.hp < 35 ? 'var(--red)' : s.hp < 70 ? 'var(--amber)' : 'var(--g)';
      return '<div class="site' + (s.id === S.siteId ? ' sel' : '') + (down ? ' down' : '') + '" data-sid="' + s.id + '">' +
        '<div class="r1"><span>' + s.id + ' · ' + s.name + '</span><span>' + (down ? 'X' : s.jam > 0 ? '<span class="tagj">ECM</span>' : s.kind) + '</span></div>' +
        '<div class="r2"><span>RDR ' + TK.fmt.rng(s.range) + '</span>' + (s.sam ? '<span>SAM ' + s.sam.ammo + '/' + s.sam.max + '</span>' : '') + (s.ssm ? '<span>SSM ' + s.ssm.ammo + '</span>' : '') + (s.readyMax ? '<span>RDY ' + s.ready + '/' + s.readyMax + '</span>' : '') + '</div>' +
        '<div class="hp"><i style="width:' + s.hp + '%;background:' + col + '"></i></div></div>';
    }).join('');
  }

  /* ---------- RENDER: KONTAK ---------- */
  function renderContacts() {
    const D = TK.doc(), site = SIM.siteById(S.siteId), all = visibleContacts();
    $('#ncont').textContent = all.length;
    $$('#chips button').forEach(b => b.classList.toggle('on', b.dataset.f === S.filter));
    $('#tbody').innerHTML = all.filter(c => S.filter === 'ALL' || c.iff === S.filter).map(c => {
      const p = SIM.trackPos(c), lost = SIM.isLost(c);
      return '<tr class="row' + (S.sel === c ? ' sel' : '') + (lost ? ' lost' : '') + '" data-id="' + c.id + '"><td>' + label(c) + (c.asset ? ' ✚' : '') + '</td><td><span class="tag ' + c.iff + '">' + D.tag[c.iff] + '</span></td>' +
        '<td>' + pad(SIM.bearing(site, p), 3) + '°</td><td>' + TK.fmt.rng(SIM.dist(site, p)).replace(/ .*/, '') + '</td><td>' + TK.fmt.altS(c.alt) + '</td><td>' + TK.fmt.spdN(c.spd) + '</td></tr>';
    }).join('');
  }

  /* ---------- RENDER: DETAIL ---------- */
  let lastSig = '';
  function renderDetail(force) {
    const c = S.sel, body = $('#dbody');
    if (!c || !S.contacts.includes(c)) { if (c) S.sel = null; body.innerHTML = '<div class="none">' + T('no_tgt') + '</div>'; $('#dstate').textContent = '—'; lastSig = ''; return; }
    const D = TK.doc(), site = SIM.siteById(S.siteId), p = SIM.trackPos(c) || c, ns = SIM.nearestSite(c);
    const lost = SIM.isLost(c), th = SIM.threat(c), effs = SIM.effectorsFor(c);
    const ready = S.sites.reduce((a, s) => a + (s.hp > 0 ? s.ready : 0), 0);
    const sig = [c.id, c.iff, c.asset ? c.state : '', ready > 0, effs.length > 0, S.over].join('|');
    if (force || sig !== lastSig) {
      lastSig = sig;
      if (c.asset) body.innerHTML = '<div id="dvals"></div><div class="ctl" style="margin-top:8px"><button data-act="rtb" ' + (c.state === 'RTB' ? 'disabled' : '') + '>' + T('a_rtb') + '</button></div>';
      else body.innerHTML = '<div id="dvals"></div><div class="ctl" style="margin-top:8px"><button data-act="scr" ' + (ready > 0 ? '' : 'disabled') + '>' + T('a_scr') + ' (' + ready + ')</button><button data-act="hail" class="amb">' + T('a_hail') + '</button><button data-act="eng" class="red" ' + (effs.length ? '' : 'disabled') + '>' + T('a_eng') + '</button></div>' +
        '<div class="ctl"><label>' + T('a_iff') + '</label>' + IFFS.map(k => '<button data-iff="' + k + '" style="' + (c.iff === k ? 'background:' + IFFCOL[k] + ';color:#000;' : 'color:' + IFFCOL[k] + ';') + 'border-color:' + IFFCOL[k] + '">' + D.tag[k] + '</button>').join('') + '</div>';
    }
    // nilai dinamis
    const d = ns ? ns.d : 0, vr = ns ? ((c.x - ns.s.x) * Math.sin(c.hdg) + (c.y - ns.s.y) * Math.cos(c.hdg)) / (d || 1) * SIM.kms(c) : 0;
    const eta = vr < -.001 ? 'T-' + Math.floor(d / -vr / 60) + ':' + pad(d / -vr % 60) : '—';
    const type = c.typeKnown ? TK.typeName(c.type) : TK.typeName('UNK');
    let h = '<div class="big">' + label(c) + '</div>' +
      '<div class="kv"><span>' + T('d_class') + '</span><b>' + type + '</b></div>' +
      '<div class="kv"><span>' + T('d_iff') + '</span><b style="color:' + IFFCOL[c.iff] + '">' + D.iff[c.iff] + '</b></div>' +
      '<div class="kv"><span>' + T('d_pos') + '</span><b>' + pad(SIM.bearing(site, p), 3) + '° / ' + TK.fmt.rng1(SIM.dist(site, p)) + '</b></div>' +
      '<div class="kv"><span>' + T('d_alt') + '</span><b>' + TK.fmt.alt(c.alt) + '</b></div>' +
      '<div class="kv"><span>' + T('d_spd') + ' / ' + T('d_hdg') + '</span><b>' + TK.fmt.spd(c.spd) + ' / ' + pad((deg(c.hdg) + 360) % 360, 3) + '°</b></div>';
    if (c.asset) {
      h += '<div class="kv"><span>' + T('d_state') + '</span><b>' + T('st_' + c.state) + '</b></div>' +
        '<div class="kv"><span>' + T('d_fuel') + '</span><b>' + Math.max(0, c.fuel * 100).toFixed(0) + '%</b></div>' +
        '<div class="kv"><span>' + T('d_ammo') + '</span><b>' + c.ammo + '</b></div>' +
        '<div class="kv"><span>' + T('d_tgt') + '</span><b>' + (S.contacts.includes(c.target) ? label(c.target) : '—') + '</b></div>';
      $('#dstate').textContent = T('st_' + c.state);
    } else {
      h += '<div class="kv"><span>' + T('d_eta') + '</span><b>' + eta + '</b></div>' +
        '<div class="kv"><span>' + T('d_thr') + '</span><b><span class="thr ' + th + '">' + T('thr_' + th) + '</span>' + (SIM.hostileAct(c) ? ' <span class="hact">' + T('d_hact') + '</span>' : '') + '</b></div>' +
        '<div class="kv"><span>' + T('d_trk') + '</span><b style="color:' + (lost ? 'var(--red)' : '') + '">' + T(lost ? 'trk_lost' : SIM.trackAge(c) > S.period * 1.5 ? 'trk_dr' : 'trk_ok') + '</b></div>';
      $('#dstate').textContent = c.inbound > 0 ? 'ENGAGING' : 'TRACK';
    }
    $('#dvals').innerHTML = h;
  }

  /* ---------- MODAL OTORISASI ---------- */
  let mdl = null;
  function openEngage(c) {
    c = c || S.sel; if (!c || c.asset || !S.contacts.includes(c)) return;
    const effs = SIM.effectorsFor(c);
    if (!effs.length) { log(T('m_nofc', { id: label(c) }), 'w'); return; }
    const D = TK.doc(), rc = SIM.roeCheck(c), site = SIM.siteById(S.siteId), p = SIM.trackPos(c);
    mdl = { c };
    const vc = !rc.ok ? 'no' : rc.warn ? 'warn' : 'ok';
    $('#mbox').innerHTML = '<h3>' + T('md_title') + '</h3>' +
      '<div class="kv"><span>' + T('md_tgt') + '</span><b>' + label(c) + ' · <span style="color:' + IFFCOL[c.iff] + '">' + D.iff[c.iff] + '</span></b></div>' +
      '<div class="kv"><span>' + T('d_pos') + '</span><b>' + pad(SIM.bearing(site, p), 3) + '° / ' + TK.fmt.rng(SIM.dist(site, p)) + '</b></div>' +
      '<div class="kv"><span>' + T('md_roe') + '</span><b>' + D.roe[S.roe] + '</b></div>' +
      '<div class="verdict ' + vc + '">' + T(rc.r) + '</div>' +
      (c.iff === 'U' ? '<div class="mwarn">⚠ ' + T('md_warn') + '</div>' : '') +
      '<div class="ctl"><label>' + T('md_eff') + '</label></div>' +
      effs.map((e, i) => '<label class="eff"><input type="radio" name="eff" value="' + i + '" ' + (i === 0 ? 'checked' : '') + '><span>' + T('eff_' + e.kind) + ' — ' + e.name + '</span><span class="pk">' + TK.fmt.rng(e.d) + ' · Pk ' + Math.round(e.pk * 100) + '% · ×' + e.ammo + '</span></label>').join('') +
      '<div class="mact"><button data-m="cancel">' + T('md_cancel') + '</button><button data-m="ok" class="red" ' + (rc.ok ? '' : 'disabled') + '>' + T('md_ok') + '</button></div>';
    $('#modal').classList.remove('off'); TK.sfx(600, .08);
  }
  function closeModal() { mdl = null; $('#modal').classList.add('off'); }
  function confirmFire() {
    if (!mdl) return;
    const c = mdl.c, v = document.querySelector('input[name=eff]:checked'), effs = SIM.effectorsFor(c), rc = SIM.roeCheck(c);
    if (!S.contacts.includes(c) || !rc.ok || !v || !effs[+v.value]) { closeModal(); return; }
    SIM.fire(c, effs[+v.value]); closeModal(); renderDetail(true);
  }
  $('#modal').addEventListener('click', e => {
    const b = e.target.closest('button[data-m]'); if (b) { b.dataset.m === 'ok' ? confirmFire() : closeModal(); } else if (e.target.id === 'modal') closeModal();
  });

  /* ---------- AKSI ---------- */
  $('#dbody').addEventListener('click', e => {
    const b = e.target.closest('button'), c = S.sel; if (!b || !c) return;
    if (b.dataset.iff) SIM.setIff(c, b.dataset.iff);
    else if (b.dataset.act === 'scr') SIM.scramble(c);
    else if (b.dataset.act === 'hail') SIM.hail(c);
    else if (b.dataset.act === 'eng') openEngage(c);
    else if (b.dataset.act === 'rtb') SIM.rtb(c);
    renderDetail(true); renderSites(); renderContacts();
  });
  $('#tbody').addEventListener('mousedown', e => { const tr = e.target.closest('tr[data-id]'); if (tr) select(S.contacts.find(c => c.id === +tr.dataset.id)); });
  $('#sites').addEventListener('mousedown', e => {
    const el = e.target.closest('[data-sid]'); if (!el) return;
    const s = SIM.siteById(el.dataset.sid); if (s && s.hp > 0) { S.siteId = s.id; log(T('m_site', { site: s.name }), 'i'); renderSites(); renderContacts(); }
  });
  $('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.filter = b.dataset.f; renderContacts(); } });
  $('#rangebtns').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.rangeIdx = +b.dataset.ri; syncControls(); } });
  $('#roebtns').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setRoe(b.dataset.roe); });
  $('#docsw').addEventListener('click', e => { const b = e.target.closest('button'); if (b) switchDoctrine(b.dataset.doc); });
  $$('button[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('[data-opt]').forEach(b => b.onclick = () => { const k = b.dataset.opt; S.opts[k] = !S.opts[k]; if (k === 'sound' && S.opts.sound) beep(800, .1); syncControls(); });
  $('#bPause').onclick = () => { S.paused = !S.paused; syncControls(); };
  $('#bSpawn').onclick = () => SIM.spawn();
  $('#speed').oninput = e => { S.period = +e.target.value; $('#spv').textContent = S.period.toFixed(1); };
  $$('[data-ltab]').forEach(b => b.onclick = () => {
    $$('[data-ltab]').forEach(x => x.classList.toggle('on', x === b));
    $('#log').classList.toggle('off', b.dataset.ltab !== 'log'); $('#cons').classList.toggle('off', b.dataset.ltab !== 'cons');
    if (b.dataset.ltab === 'cons') $('#conin').focus();
  });
  function setRoe(r) { S.roe = r; syncControls(); log(T('m_roe', { roe: TK.doc().roe[r] }), 'w'); TK.sfx(700, .08); }

  // klik pada radar / peta
  TK.radar.el.addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); select(TK.radar.pick(e.clientX - r.left, e.clientY - r.top)); });
  TK.map.el.addEventListener('click', e => { if (TK.map.wasDrag()) return; const r = e.currentTarget.getBoundingClientRect(); select(TK.map.pick(e.clientX - r.left, e.clientY - r.top)); });
  function cursorMove(e, kind) {
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, el = $('#cursor');
    if (kind === 'radar') { const i = TK.radar.cursorInfo(x, y); el.textContent = i ? T('cursor') + ' BRG ' + pad(i.brg, 3) + '° · RNG ' + TK.fmt.rng1(i.rng) : ''; }
    else { const i = TK.map.cursorInfo(x, y); el.textContent = T('cursor') + ' ' + Math.abs(i.lat).toFixed(2) + '°' + (i.lat < 0 ? 'S' : 'N') + ' ' + i.lon.toFixed(2) + '°E'; }
  }
  TK.radar.el.addEventListener('mousemove', e => cursorMove(e, 'radar')); TK.map.el.addEventListener('mousemove', e => cursorMove(e, 'map'));
  [TK.radar.el, TK.map.el].forEach(el => el.addEventListener('mouseleave', () => { $('#cursor').textContent = ''; }));

  /* ---------- KONSOL ---------- */
  const hist = []; let hi = 0;
  function out(t, cls) { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = t; $('#conout').appendChild(d); $('#conout').scrollTop = 1e9; }
  function findC(x) {
    if (!x) return S.sel; x = x.toUpperCase();
    return S.contacts.find(c => [c.trk, c.name].some(n => n && n.toUpperCase() === x)) || S.contacts.find(c => c.trk === 'T' + x);
  }
  function run(line) {
    out('> ' + line, 't'); const a = line.trim().split(/\s+/), cmd = (a.shift() || '').toLowerCase(); if (!cmd) return;
    const needC = () => { const c = findC(a[0]); if (!c) out(T('cs_nt', { x: a[0] || '—' }), 'c'); return c; };
    let c;
    switch (cmd) {
      case 'help': out(T('cs_help'), 'i'); break;
      case 'status': out(T('cs_stat', { n: visibleContacts().length, s: S.score, i: SIM.integrity().toFixed(0), r: TK.doc().roe[S.roe] }), 'i'); break;
      case 'site': { const s = S.sites.find(x => x.id === (a[0] || '').toUpperCase()); if (s && s.hp > 0) { S.siteId = s.id; log(T('m_site', { site: s.name }), 'i'); } else out(T('cs_nt', { x: a[0] || '—' }), 'c'); break; }
      case 'range': { const i = +a[0] - 1; if (i >= 0 && i < 4) { S.rangeIdx = i; syncControls(); } break; }
      case 'roe': { const r = (a[0] || '').toUpperCase(); if (['HOLD', 'TIGHT', 'FREE'].includes(r)) setRoe(r); else out(T('cs_unk'), 'c'); break; }
      case 'select': c = needC(); if (c) select(c); break;
      case 'iff': c = findC(a[0]); if (c && ['F', 'H', 'U', 'C'].includes((a[1] || '').toUpperCase())) SIM.setIff(c, a[1].toUpperCase()); else out(T('cs_nt', { x: a[0] || '—' }), 'c'); break;
      case 'scramble': c = findC(a[0]); if (c) SIM.scramble(c); else out(T('cs_nt', { x: a[0] || '—' }), 'c'); break;
      case 'hail': c = findC(a[0]); if (c) SIM.hail(c); else out(T('cs_nt', { x: a[0] || '—' }), 'c'); break;
      case 'engage': c = findC(a[0]); if (c) openEngage(c); else out(T('cs_nt', { x: a[0] || '—' }), 'c'); break;
      case 'rtb': c = needC(); if (c) SIM.rtb(c); break;
      case 'view': if (['radar', 'map', 'war', 'fps'].includes(a[0])) setView(a[0]); break;
      case 'doctrine': if (TK.DOC[a[0]]) switchDoctrine(a[0]); break;
      case 'pause': S.paused = !S.paused; syncControls(); break;
      case 'clear': $('#conout').innerHTML = ''; break;
      case 'nexus': case 'ai': { const r = TK.nexus.command(a.join(' ')); out(r.msg, r.ok ? 'i' : 'c'); if (TK.nexus.speak) TK.nexus.speak(r.msg); break; }
      default: out(T('cs_unk'), 'c');
    }
    renderAll();
  }
  $('#conin').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = e.target.value; if (v.trim()) { hist.push(v); hi = hist.length; run(v); } e.target.value = ''; }
    else if (e.key === 'ArrowUp') { if (hi > 0) e.target.value = hist[--hi]; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { e.target.value = hi < hist.length - 1 ? hist[++hi] : ''; hi = Math.min(hi, hist.length); e.preventDefault(); }
  });

  /* ---------- KEYBOARD ---------- */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    if (mdl) { if (e.key === 'Escape') closeModal(); else if (e.key === 'Enter') confirmFire(); return; }
    const k = e.key.toLowerCase();
    if (S.view === 'fps') return;   // ditangani fps-ui.js
    if (S.view === 'war') {
      if (TK.warui.key(e)) return;
      if (k === 'e') { setView('fps'); return; }
      if (k === 'm') setView('radar');
      return;
    }
    if (k >= '1' && k <= '4') { S.rangeIdx = +k - 1; syncControls(); }
    else if (k === ' ') { e.preventDefault(); S.paused = !S.paused; syncControls(); }
    else if (k === 'tab') { e.preventDefault(); cycle(); }
    else if (k === 'escape') select(null);
    else if (k === 'm') setView(S.view === 'map' ? 'war' : 'map');
    else if (k === 'e') openEngage();
    else if (k === 's' && S.sel) { SIM.scramble(S.sel); renderDetail(true); }
    else if (k === 'h' && S.sel) SIM.hail(S.sel);
  });

  /* ---------- SPEKTRUM ---------- */
  const spec = $('#spec'), sctx = spec.getContext('2d'), sdata = [];
  function resizeSpec() { const d = window.devicePixelRatio || 1; spec.width = spec.clientWidth * d; spec.height = spec.clientHeight * d; }
  function drawSpec() {
    const w = spec.width, h = spec.height; if (!w) return;
    const hostile = S.contacts.filter(c => c.truth === 'H' && c.seen).length, jam = S.sites.some(s => s.jam > 0);
    sdata.push(Math.random() * .12 + (jam ? rand(.25, .8) : 0) + (Math.random() < .03 + hostile * .02 ? rand(.3, .9) : 0));
    while (sdata.length > 90) sdata.shift();
    sctx.clearRect(0, 0, w, h); sctx.strokeStyle = 'rgba(57,255,110,.15)'; sctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { sctx.beginPath(); sctx.moveTo(0, h * i / 4); sctx.lineTo(w, h * i / 4); sctx.stroke(); }
    sctx.strokeStyle = jam ? '#ffb000' : '#39ff6e'; sctx.lineWidth = 1.5 * (window.devicePixelRatio || 1); sctx.beginPath();
    sdata.forEach((d, i) => { const x = i / 89 * w, y = h - d * h * .95 - 2; i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); }); sctx.stroke();
  }

  /* ---------- RENDER GABUNGAN & LOOP ---------- */
  function renderAll() { renderHeader(); renderStats(); renderSites(); renderContacts(); renderDetail(); }
  function clock() {
    const n = new Date();
    $('#utc').textContent = pad(n.getUTCHours()) + ':' + pad(n.getUTCMinutes()) + ':' + pad(n.getUTCSeconds());
    $('#date').textContent = n.toISOString().slice(0, 10) + ' · DTG ' + pad(n.getUTCDate()) + pad(n.getUTCHours()) + pad(n.getUTCMinutes()) + 'Z';
    const s = SIM.siteById(S.siteId);
    if (S.view === 'fps') return;
    if (S.view === 'war') { $('#hudtr').textContent = TK.warui.hudText(); $('#viewinfo').textContent = TK.war.Q.paused ? '❚❚ ' + T('c_pause') : ''; return; }
    $('#hudtr').innerHTML = S.view === 'radar' ? s.id + ' · ' + s.name + '<br>' + T('sweep') + ' ' + pad(deg(s.theta), 3) + '° · ' + TK.doc().ranges[S.rangeIdx].l : TK.doc().theater;
    $('#viewinfo').textContent = S.paused ? '❚❚ ' + T('c_pause') : '';
  }
  let last = performance.now();
  function frame(now) {
    if (now - last < 12.5) { requestAnimationFrame(frame); return; }   // batas ±60–72 FPS di monitor 120/144 Hz: GPU tidak dipaksa kerja 2×
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (S.view === 'war') { TK.war.update(dt); TK.warui.draw(dt); }
    else if (S.view === 'fps') { TK.warui.ensureTerrain(); TK.fpsui.frame(dt); }
    else {
      if (!S.paused && !S.over) SIM.update(dt);
      if (S.view === 'radar') TK.radar.draw(); else TK.map.draw();
      drawSpec();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- BOOT ---------- */
  function boot() {
    const lines = TK.doc().boot, el = $('#boot'); let i = 0;
    const id = setInterval(() => {
      if (i < lines.length) el.innerHTML += lines[i++].replace(/(\.{4,} )(\S+)/, '$1<span style="color:var(--cyan)">$2</span>') + '<br>';
      else { clearInterval(id); setTimeout(() => el.classList.add('off'), 350); }
    }, 220);
  }

  TK.ui = { log, beep };

  /* ---------- INIT ---------- */
  SIM.reset(S.doc); applyDoc(); resize(); window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe($('#stage'));
  log(T('m_start', { th: TK.doc().theater }), 'i'); log(T('m_tip'), 'w');
  renderAll(); clock();
  setInterval(clock, 250);
  setInterval(() => { renderHeader(); if (S.view === 'radar' || S.view === 'map') { renderStats(); renderSites(); renderContacts(); renderDetail(); } }, 500);
  boot(); requestAnimationFrame(frame);
})();
