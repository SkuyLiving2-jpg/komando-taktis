/* ============================================================
   NEXUS-UI — panel AI, lapisan peta ancaman, inti saraf di
   header, perintah suara / bahasa alami, dokumen teknis
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, UT = W.UT, N = TK.nexus, war = TK.war, Q = war.Q;
  const { clamp } = TK.util;
  const $ = s => document.querySelector(s), T = (k, v) => TK.t(k, v);
  const UI = { shown: [], sig: '', hl: null, heat: document.createElement('canvas'), heatV: -1, ver: 0, prevP: -1, last: performance.now() };
  UI.heat.width = N.NX; UI.heat.height = N.NY;

  /* ---------- siklus analisis (2× per detik, berjalan di semua tampilan) ---------- */
  function tick() {
    const now = performance.now(), dt = Math.min(2, (now - UI.last) / 1000); UI.last = now;
    if (!Q.g) return;
    N.tick(dt); UI.ver++;
    announce(); renderPanel(); renderCore();
  }
  function announce() {   // peringatan saat peluang menang melewati ambang
    const p = N.p, q = UI.prevP; UI.prevP = p;
    if (q < 0 || Q.t < 25 || Q.over || N.hist.length < 4) return;
    let k = null; if (p < .3 && q >= .3) k = 'nx_warn_low'; else if (p > .7 && q <= .7) k = 'nx_warn_up';
    if (k) { const m = T(k, { p: Math.round(p * 100) }); TK.log(m, k === 'nx_warn_low' ? 'c' : 'i'); speak(m); TK.sfx(k === 'nx_warn_low' ? 260 : 980, .18, 'triangle', .04); }
  }

  /* ---------- panel ---------- */
  const pcol = p => p > .6 ? 'var(--g)' : p > .4 ? 'var(--amber)' : 'var(--red)';
  function renderPanel() {
    if (TK.S.view !== 'war') return;
    const p = N.p, pc = Math.round(p * 100);
    $('#nxpw').textContent = pc + '%'; $('#nxpw').style.color = pcol(p);
    $('#nxverd').textContent = T(N.ratio > 1.25 ? 'nx_v_B' : N.ratio < .8 ? 'nx_v_R' : 'nx_v_N');
    $('#nxratio').textContent = N.fmtRatio();
    $('#nxmom').textContent = (N.mom >= 0 ? '▲ +' : '▼ ') + Math.round(N.mom * 100) + '%'; $('#nxmom').style.color = N.mom >= 0 ? 'var(--g)' : 'var(--red)';
    $('#nxunc').textContent = '±' + Math.round(N.unc * 100) + '%';
    $('#nxfus').textContent = T('nx_fus') + ' ' + N.stats.tracks + '/' + N.stats.ghosts + ' · MC ' + N.MC_N;
    spark();
    const sig = N.recs.map(r => r.id + r.type + r.n + r.conf + r.afford + r.sec).join('|') + TK.doc().lang;
    if (sig !== UI.sig) {
      UI.sig = sig; UI.shown = N.recs.slice();
      $('#nxrec').innerHTML = UI.shown.length ? UI.shown.map((r, i) => {
        const what = r.act === 'fire' ? T('nx_lbl_fire') + ' → ' + r.sec : T('nx_lbl_dep') + ' ' + (r.n > 1 ? r.n + '× ' : '') + T('wu_' + r.type) + ' → ' + r.sec;
        return '<div class="nx-r' + (r.afford ? '' : ' no') + '" data-ri="' + i + '"><i>' + (i + 1) + '</i><div class="nx-rt"><b>' + what + '</b><small>' + N.why(r) + '</small>' +
          '<div class="cb"><u style="width:' + r.conf + '%"></u></div></div><div class="nx-ra"><span>' + T('nx_conf') + ' ' + r.conf + '%</span>' +
          '<button data-x="' + i + '"' + (r.afford ? '' : ' disabled') + '>' + (r.afford ? T('nx_exec') + (r.cost ? ' · ' + r.cost : '') : T('nx_poor')) + '</button></div></div>';
      }).join('') : '<div class="none">' + T('nx_none') + '</div>';
    }
    sync();
  }
  function sync() {
    $('#nxov').classList.toggle('on', N.on.overlay); $('#nxauto').classList.toggle('on', N.on.auto);
    $('#nxvoice').classList.toggle('on', N.on.voice); $('#nxmic').classList.toggle('on', !!UI.rec);
  }
  function spark() {
    const c = $('#nxspark'), d = window.devicePixelRatio || 1, w = Math.round(c.clientWidth * d), h = Math.round(c.clientHeight * d); if (!w) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d'), H = N.hist.concat(N.p), n = Math.max(30, H.length);
    x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(57,255,110,.18)'; x.lineWidth = 1;
    [.25, .5, .75].forEach(k => { x.beginPath(); x.moveTo(0, h * k); x.lineTo(w, h * k); x.stroke(); });
    const P = i => [(i + n - H.length) / (n - 1) * w, h - 2 - H[i] * (h - 4)];
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(57,255,110,.35)'); g.addColorStop(.5, 'rgba(255,176,0,.18)'); g.addColorStop(1, 'rgba(255,59,59,.3)');
    x.beginPath(); H.forEach((v, i) => { const p = P(i); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.lineTo(w, h); x.lineTo(P(0)[0], h); x.closePath(); x.fillStyle = g; x.fill();
    x.beginPath(); H.forEach((v, i) => { const p = P(i); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); });
    x.strokeStyle = N.p > .6 ? '#39ff6e' : N.p > .4 ? '#ffb000' : '#ff3b3b'; x.lineWidth = 1.6 * d; x.stroke();
    const e = P(H.length - 1); x.fillStyle = x.strokeStyle; x.beginPath(); x.arc(e[0] - 2 * d, e[1], 2.5 * d, 0, 6.3); x.fill();
  }

  /* ---------- inti saraf di header: vektor fitur → P(menang) ---------- */
  const NET = { L: [4, 6, 1], w: [] };
  (() => { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647 * 2 - 1; for (let l = 0; l < 2; l++) { NET.w[l] = []; for (let i = 0; i < NET.L[l]; i++) { NET.w[l][i] = []; for (let j = 0; j < NET.L[l + 1]; j++) NET.w[l][i][j] = r(); } } })();
  function renderCore() {
    const war = TK.S.view === 'war' || TK.S.view === 'fps';
    $('#nxcs').textContent = war && N.ready ? 'P(WIN) ' + Math.round(N.p * 100) + '% · ' + N.stats.tracks + ' TRK' : T('nx_online');
  }
  function drawCore(t) {
    const c = $('#nxneu'), x = c.getContext('2d'), w = c.width, h = c.height;
    const inp = [Math.tanh(Math.log(N.ratio || 1)), N.unc * 2 - 1, (N.vis || 0) * 4 - 1, clamp((Q.cr || 0) / 3000, 0, 1) * 2 - 1];
    const act = [inp]; for (let l = 0; l < 2; l++) act.push(NET.w[l][0].map((_, j) => Math.tanh(act[l].reduce((s, a, i) => s + a * NET.w[l][i][j], 0))));
    act[2][0] = N.p * 2 - 1;
    const pos = (l, i) => [8 + l * (w - 16) / 2, h / 2 + (i - (NET.L[l] - 1) / 2) * (h - 8) / Math.max(1, NET.L[l] - 1) * (NET.L[l] > 1 ? 1 : 0)];
    x.clearRect(0, 0, w, h);
    for (let l = 0; l < 2; l++) for (let i = 0; i < NET.L[l]; i++) for (let j = 0; j < NET.L[l + 1]; j++) {
      const a = pos(l, i), b = pos(l + 1, j), s = act[l][i] * NET.w[l][i][j];
      x.strokeStyle = s > 0 ? 'rgba(55,215,255,' + (.12 + Math.abs(s) * .5) + ')' : 'rgba(255,90,90,' + (.1 + Math.abs(s) * .4) + ')';
      x.lineWidth = .8; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
      const k = (t / 900 + i * .37 + j * .21 + l * .5) % 1; x.fillStyle = 'rgba(200,255,255,' + (.3 + Math.abs(s) * .6) + ')';
      x.fillRect(a[0] + (b[0] - a[0]) * k - .8, a[1] + (b[1] - a[1]) * k - .8, 1.6, 1.6);
    }
    for (let l = 0; l < 3; l++) for (let i = 0; i < NET.L[l]; i++) {
      const p = pos(l, i), v = act[l][i], out = l === 2;
      x.fillStyle = out ? (N.p > .6 ? '#39ff6e' : N.p > .4 ? '#ffb000' : '#ff3b3b') : v > 0 ? 'rgba(55,215,255,' + (.35 + v * .65) + ')' : 'rgba(255,90,90,' + (.35 - v * .5) + ')';
      x.beginPath(); x.arc(p[0], p[1], out ? 3.6 + Math.sin(t / 200) * .6 : 2.3, 0, 6.3); x.fill();
    }
    requestAnimationFrame(drawCore);
  }

  /* ---------- lapisan peta ancaman (dipanggil war-view setelah kabut) ---------- */
  function buildHeat() {
    const x = UI.heat.getContext('2d'), img = x.createImageData(N.NX, N.NY), d = img.data, IB = N.IB, IR = N.IR;
    for (let i = 0; i < IB.length; i++) {
      const b = IB[i], r = IR[i], s = b + r, k = (b - r) / (s + .6), j = i * 4;
      const c = k > 0 ? [255 + (40 - 255) * k, 190 + (200 - 190) * k, 60 + (255 - 60) * k] : [255, 190 + (60 - 190) * -k, 60];
      d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = s < .04 ? 0 : Math.min(150, s * 55) * (.45 + .55 * Math.abs(k));
    }
    x.putImageData(img, 0, 0); UI.heatV = UI.ver;
  }
  function overlay(ctx, w2s, z) {
    if (!N.on.overlay || !N.ready) return;
    if (UI.heatV !== UI.ver) buildHeat();
    const o = w2s(0, 0), t = performance.now() / 1000;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(UI.heat, o[0], o[1], W.WW * z, W.WH * z);
    // garis depan
    ctx.strokeStyle = 'rgba(255,226,140,.95)'; ctx.lineWidth = 2.2; ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 10; ctx.beginPath();
    for (const s of N.front) { const a = w2s(s[0][0], s[0][1]), b = w2s(s[1][0], s[1][1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke(); ctx.shadowBlur = 0;
    // prediksi lintasan & memori kontak
    ctx.font = 'bold 10px Consolas,monospace';
    for (const [, m] of N.mem) {
      if (m.struct) continue;
      if (m.vis) {
        const sp = Math.hypot(m.vx, m.vy); if (sp < 1.5) continue;
        const k = Math.min(N.PRED, 1100 / sp), a = w2s(m.zx, m.zy), b = w2s(m.zx + m.vx * k, m.zy + m.vy * k), an = Math.atan2(b[1] - a[1], b[0] - a[0]);
        ctx.strokeStyle = 'rgba(255,120,120,.85)'; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 18;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,120,120,.9)'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - Math.cos(an - .45) * 7, b[1] - Math.sin(an - .45) * 7); ctx.lineTo(b[0] - Math.cos(an + .45) * 7, b[1] - Math.sin(an + .45) * 7); ctx.closePath(); ctx.fill();
      } else {
        const age = Q.t - m.t, k = Math.min(age, 8), p = w2s(m.x + m.vx * k, m.y + m.vy * k), r = Math.max(5, (12 + age * UT[m.type].spd * .35) * z);
        ctx.globalAlpha = .2 + .7 * m.w; ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - 6); ctx.lineTo(p[0] + 6, p[1]); ctx.lineTo(p[0], p[1] + 6); ctx.lineTo(p[0] - 6, p[1]); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#ff9a9a'; ctx.fillText('?', p[0] - 3, p[1] + 3.5); ctx.globalAlpha = 1;
      }
    }
    // titik rekomendasi
    N.recs.forEach((r, i) => {
      const p = w2s(r.x, r.y), hl = UI.hl && UI.hl.id === r.id, rr = 14 + Math.sin(t * 4 + i) * 2 + (hl ? 6 : 0);
      ctx.strokeStyle = hl ? '#ffffff' : 'rgba(55,215,255,.9)'; ctx.lineWidth = hl ? 2.2 : 1.5; ctx.shadowColor = '#37d7ff'; ctx.shadowBlur = hl ? 14 : 6;
      ctx.beginPath(); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + t * .8; ctx.moveTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr); ctx.arc(p[0], p[1], rr, a, a + .9); } ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = hl ? '#fff' : '#37d7ff'; ctx.fillText((i + 1) + ' · ' + (r.act === 'fire' ? T('nx_lbl_fire') : T('wu_' + r.type)), p[0] + rr + 4, p[1] + 4);
    });
    // legenda
    const L = [['#7fd8ff', T('nx_lg_inf')], ['#ffe28c', T('nx_lg_front')], ['#ff7878', T('nx_lg_pred')], ['#ff9a9a', '◇ ' + T('nx_lg_mem')], ['#37d7ff', '◎ ' + T('nx_lg_rec')]];
    const cw = ctx.canvas.width / (window.devicePixelRatio || 1); ctx.font = '10px Consolas,monospace';
    const lw = L.reduce((s, l) => s + ctx.measureText(l[1]).width + 22, 0), x0 = Math.max(8, cw / 2 - lw / 2);
    ctx.fillStyle = 'rgba(2,10,6,.78)'; ctx.fillRect(x0 - 6, 30, lw + 6, 18); ctx.strokeStyle = 'rgba(55,215,255,.5)'; ctx.strokeRect(x0 - 6, 30, lw + 6, 18);
    let lx = x0; L.forEach(l => { ctx.fillStyle = l[0]; ctx.fillRect(lx, 36, 8, 6); ctx.fillText(l[1], lx + 12, 43); lx += ctx.measureText(l[1]).width + 22; });
    ctx.restore();
  }

  /* ---------- suara: keluaran (sintesis) & masukan (pengenalan) ---------- */
  function speak(text) {
    if (!N.on.voice || !window.speechSynthesis) return;
    try {
      const id = TK.doc().lang === 'id', s = String(text).replace(/NEXUS[^▸]*▸/, '').replace(/[▸·→×]/g, ' ').replace(/%/g, id ? ' persen' : ' percent').toLowerCase();
      const u = new SpeechSynthesisUtterance(s); u.lang = id ? 'id-ID' : 'en-US'; u.rate = 1.06; u.pitch = .82; u.volume = .9;
      const v = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').toLowerCase().startsWith(id ? 'id' : 'en')); if (v) u.voice = v;
      if (speechSynthesis.pending) speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* sintesis suara tidak tersedia */ }
  }
  N.speak = speak;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function mic() {
    if (!SR) { TK.log(T('nx_nomic'), 'w'); return; }
    if (UI.rec) { UI.rec.stop(); return; }
    const r = UI.rec = new SR(); r.lang = TK.doc().lang === 'id' ? 'id-ID' : 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => { const x = e.results[e.results.length - 1]; $('#nxin').value = x[0].transcript; if (x.isFinal) { TK.log(T('nx_heard', { s: x[0].transcript }), 't'); run(x[0].transcript); } };
    r.onerror = e => TK.log(T('nx_micerr', { e: e.error || '?' }), 'w');
    r.onend = () => { UI.rec = null; sync(); };
    try { r.start(); TK.log(T('nx_listen'), 'i'); TK.sfx(1200, .06, 'sine', .04); } catch (e) { UI.rec = null; TK.log(T('nx_micerr', { e: e.message }), 'w'); }
    sync();
  }
  function run(text) {
    if (!String(text).trim()) return;
    TK.log('&gt; ' + String(text).replace(/</g, '&lt;'), 't');
    const r = N.command(text), m = /▸/.test(r.msg) ? r.msg : T('nx_tag') + ' ' + r.msg;
    if (!/▸/.test(r.msg)) TK.log(m, r.ok ? 'i' : 'w');   // hasil eksekusi gelar sudah dicatat oleh N.exec
    speak(m); TK.sfx(r.ok ? 900 : 300, .07, 'sine', .04); UI.sig = ''; tick();
  }
  UI.run = run;

  /* ---------- dokumen teknis ---------- */
  function openDoc() {
    $('#mbox').classList.add('nx');
    $('#mbox').innerHTML = '<h3>' + T('nx_doc_t') + '</h3><div class="nx-doc">' + T('nx_doc') + '</div><div class="mact"><button data-m="cancel">' + T('nx_close') + '</button></div>';
    $('#modal').classList.remove('off');
  }
  const docOpen = () => !$('#modal').classList.contains('off') && $('#mbox').classList.contains('nx');
  function closeDoc() { $('#modal').classList.add('off'); $('#mbox').classList.remove('nx'); }
  $('#modal').addEventListener('click', () => setTimeout(() => { if ($('#modal').classList.contains('off')) $('#mbox').classList.remove('nx'); }, 0));

  /* ---------- input ---------- */
  $('#nxrec').addEventListener('mousedown', e => {
    const b = e.target.closest('button[data-x]'); if (!b) return;
    const o = UI.shown[+b.dataset.x]; if (!o) return;
    const r = N.exec(o); speak(r.msg); TK.sfx(r.ok ? 900 : 300, .08); UI.sig = ''; tick();
  });
  $('#nxrec').addEventListener('mouseover', e => { const r = e.target.closest('.nx-r'); UI.hl = r ? UI.shown[+r.dataset.ri] : null; });
  $('#nxrec').addEventListener('mouseleave', () => { UI.hl = null; });
  $('#nxov').onclick = () => { N.on.overlay = !N.on.overlay; sync(); };
  $('#nxauto').onclick = () => { N.on.auto = !N.on.auto; N.autoT = 1; const m = T(N.on.auto ? 'nx_c_auto1' : 'nx_c_auto0'); TK.log(T('nx_tag') + ' ' + m, N.on.auto ? 'w' : 'i'); speak(m); sync(); };
  $('#nxvoice').onclick = () => { N.on.voice = !N.on.voice; sync(); if (N.on.voice) speak(N.report()); else if (window.speechSynthesis) speechSynthesis.cancel(); };
  $('#nxdoc').onclick = openDoc; $('#nxcore').onclick = openDoc;
  $('#nxmic').onclick = mic;
  $('#nxin').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { run(e.target.value); e.target.value = ''; } else if (e.key === 'Escape') e.target.blur(); });
  window.addEventListener('keydown', e => {
    if (docOpen() && e.key === 'Escape') { closeDoc(); return; }
    if (TK.S.view !== 'war' || e.target.tagName === 'INPUT' || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyN') { N.on.overlay = !N.on.overlay; sync(); }
    else if (e.code === 'KeyV') mic();
  });

  /* ---------- API ---------- */
  TK.nexusui = {
    overlay, run, openDoc, state: UI,
    applyLang() { $('#nxin').placeholder = T('nx_ph'); UI.sig = ''; renderPanel(); renderCore(); }
  };
  TK.nexusui.applyLang();
  setInterval(tick, 500); tick(); requestAnimationFrame(drawCore);
})();
