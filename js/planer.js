/* PlavoCAD Planer-Seite: Schnittlinie, Preisrechner, Detail-Lupe, Plankopf, Statuszeile mit Fadenkreuz.
   Speichert nichts im Browser und sendet nichts an Server. */
(() => {
  'use strict';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) {
    // Ohne Sprungziel beginnt jede Ansicht ganz oben, auch wenn der Browser oder die Vorschau später eine alte Position wiederherstellen will
    let touched = false;
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true }));
    const top = () => { if (!touched && !location.hash) window.scrollTo(0, 0); };
    top(); window.addEventListener('load', () => { top(); setTimeout(top, 120); });
    window.addEventListener('pageshow', top);
  }
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const de = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const eur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reduceM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const cmp = $('#cmp');
  const IMG = { vorlage: cmp.dataset.imgVorlage, plan: cmp.dataset.imgPlan, vorlageW1: cmp.dataset.imgVorlagew1, expose: cmp.dataset.imgExpose };

  const MODES = {
    buero: {
      eyebrow: 'Bestandspläne für Planungsbüros', h1: 'Aus dem Bestand wird ein <em>sauberer Plan.</em>',
      lead: 'Scan, PDF oder Handyfoto rein, DWG nach DIN 1356 raus. Layer nach Ihrem Bürostandard, Maßketten, Raumstempel.',
      specs: [['Format', 'DWG · DXF · PDF'], ['Norm', 'DIN 1356-1'], ['Lieferung', '3–5 Werktage'], ['Preis', 'ab 30 € je Geschoss']],
      cta2: 'Kostenlos testen', before: 'vorlage', after: 'plan', ar: '1700 / 1409', tagB: 'Vorlage · Kopie Bauakte', tagA: 'PlavoCAD · DWG',
      altA: 'Nachher: sauberer CAD-Grundriss nach DIN 1356',
      cap: 'EG Mehrfamilienhaus · 3 WE · M 1:100',
      span: { x0: 240 / 1700, x1: 1460 / 1700, y0: 213 / 1409, y1: 1197 / 1409, w: 19.70, h: 15.90 },
      toM: (fx, fy) => [(fx * 1700 - 240) / 61.93, (1197 - fy * 1409) / 61.93],
      phead: 'Schalten Sie Leistungen ein, und Sie sehen rechts, was im Plan dazukommt. Unten steht der Festpreis, den Sie vorab bekommen.',
      vb: '-300 -1870 2520 2160', par: '2520 / 2160', vinfo: 'EG · M 1:100 · 3 WE',
      lmsub: 'je Geschoss bis 120 m²', unit: ['Geschoss', 'Geschosse'], eh: 'Geschoss', qty: 2,
      qnote: 'Größer als 120 m²? Festpreis nach Sichtung.', del: '3–5 Werktage', fmt: 'DWG · DXF · PDF', fmt3d: ' · IFC',
      firmLabel: 'Büro', formmode: 'Planungsbüro',
      layers: [
        { id: 'grund', name: 'A-GRUNDRISS', sw: 'var(--wall)', desc: 'Wände, Öffnungen, Treppe, Achsen', price: 30, lock: true, on: true, show: ['g-walls', 'g-base'] },
        { id: 'bem', name: 'A-BEMASSUNG', sw: 'var(--blue)', desc: 'Maßketten innen und außen, Höhenkoten', price: 0, on: true, show: ['g-dims'] },
        { id: 'moeb', name: 'A-EINRICHTUNG', sw: 'var(--muted)', desc: 'Möbel und Sanitär aus der Vorlage', price: 0, on: true, show: ['g-furn'] },
        { id: 'fl', name: 'A-FLAECHEN', sw: 'var(--bulb)', desc: 'Raumstempel, Flächentabelle WoFlV / DIN 277', price: 19, on: false, show: ['g-names', 'g-areas', 'wfl'] },
        { id: '3d', name: 'A-3D', sw: 'var(--red)', desc: 'Modell als IFC oder SketchUp', price: 50, on: false, show: [] }
      ]
    }
  };
  const state = { mode: 'buero', on: {}, qty: 2, x: 50, sum: 0 };

  /* ---------- Maßketten ---------- */
  function chain(el, segs) {
    let h = '<span class="ln"></span>', x = 0;
    const ticks = [0];
    segs.forEach(s => { x += s.w; ticks.push(x); });
    ticks.forEach(t => { h += '<span class="ext" style="left:' + (t * 100) + '%"></span><span class="tk" style="left:' + (t * 100) + '%"></span>'; });
    x = 0; segs.forEach(s => { if (s.t) h += '<span class="tx" style="left:' + ((x + s.w / 2) * 100) + '%">' + s.t + '</span>'; x += s.w; });
    el.innerHTML = h;
  }
  function vchain(el, total, y0, y1) {
    el.innerHTML = '<span class="ln" style="top:' + y0 * 100 + '%;bottom:' + (1 - y1) * 100 + '%"></span>' +
      [y0, y1].map(t => '<span class="ext" style="top:' + t * 100 + '%"></span><span class="tk" style="top:' + t * 100 + '%"></span>').join('') +
      '<span class="tx" style="top:' + ((y0 + y1) / 2 * 100) + '%">' + de(total) + '</span>';
  }
  $$('[data-chain]').forEach(el => {
    const d = JSON.parse(el.dataset.chain), tot = d.reduce((s, x) => s + x[0], 0);
    chain(el, d.map(x => ({ w: x[0] / tot, t: x[1] })));
  });

  /* ---------- 01 Schnittlinie ---------- */
  const cut = $('#cutpos'), hx = $('#hx');
  function heroChain() {
    const s = MODES[state.mode].span, fx = state.x / 100;
    const inside = Math.min(Math.max((fx - s.x0) / (s.x1 - s.x0), 0), 1);
    const a = inside * s.w, segs = [];
    if (inside > 0.04 && inside < 0.96) segs.push({ w: (s.x1 - s.x0) * inside, t: de(a) }, { w: (s.x1 - s.x0) * (1 - inside), t: de(s.w - a) });
    else segs.push({ w: s.x1 - s.x0, t: de(s.w) });
    hx.style.marginLeft = (s.x0 * 100) + '%'; hx.style.width = ((s.x1 - s.x0) * 100) + '%';
    chain(hx, segs.map(sg => ({ w: sg.w / (s.x1 - s.x0), t: sg.t })));
  }
  function setX(v) { state.x = v; cmp.style.setProperty('--x', v + '%'); heroChain(); }
  cut.addEventListener('input', () => setX(+cut.value));

  /* ---------- 03 Preisrechner ---------- */
  const BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>';
  function remember() { /* ohne Rückgängig */ }
  function renderLayers() {
    const M = MODES[state.mode];
    $('#layers').innerHTML = M.layers.map(l => {
      const on = !!state.on[l.id];
      return '<div class="lrow' + (on ? ' on' : '') + '">' +
        '<button class="bulb" type="button" data-l="' + l.id + '" aria-pressed="' + on + '"' + (l.lock ? ' disabled aria-label="' + l.name + ' ist die Basis und immer an"' : ' aria-label="' + l.name + ' ' + (on ? 'ausschalten' : 'einschalten') + '"') + '>' + BULB + '</button>' +
        '<span class="sw" style="background:' + l.sw + '"></span>' +
        '<div><div class="lname">' + l.name + (l.lock ? '<small>Basis</small>' : '') + '</div><div class="ldesc">' + l.desc + '</div></div>' +
        '<div class="lprice' + (l.price ? '' : ' inkl') + '">' + (l.price ? (l.lock ? '' : '+ ') + l.price + ' €' : 'inkl.') + '</div></div>';
    }).join('');
    $$('#layers .bulb').forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      if (b.dataset.skip) { delete b.dataset.skip; return; }
      const id = b.dataset.l; remember(); state.on[id] = !state.on[id]; update();
      const nb = $('#layers .bulb[data-l="' + id + '"]'); if (nb) nb.focus({ preventScroll: true });
    }));
  }
  const QMAX = 20, cellsEl = $('#qcells'), qsel = $('#qsel');
  cellsEl.innerHTML = [1, 2, 3, 4, 5, 6].map(n => '<button type="button" class="qcell" role="radio" data-n="' + n + '">' + (n === 6 ? '6+' : n) + '</button>').join('');
  const cells = $$('.qcell');
  let lastPtr = 'mouse';
  function setQty(n, rec = true) { n = Math.max(1, Math.min(QMAX, n)); if (n === state.qty) return; if (rec) remember(); state.qty = n; update(); if (lastPtr === 'touch' && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* optional */ } } }
  document.addEventListener('pointerdown', e => { lastPtr = e.pointerType; }, true);
  cells.forEach(c => c.addEventListener('click', () => { if (dragged) { dragged = false; return; } const n = +c.dataset.n; setQty(n === 6 && state.qty >= 6 ? state.qty : n); }));
  cellsEl.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') { e.preventDefault(); setQty(state.qty + 1); }
    else if (k === 'ArrowLeft' || k === 'ArrowDown') { e.preventDefault(); setQty(state.qty - 1); }
    else return;
    cells[Math.min(state.qty, 6) - 1].focus();
  });
  let dragging = false, dragged = false;
  const fromX = x => { const r = cellsEl.getBoundingClientRect(); return Math.max(1, Math.min(6, Math.ceil((x - r.left) / r.width * 6))); };
  qsel.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; dragging = true; qsel.setPointerCapture(e.pointerId); remember(); const n = fromX(e.clientX); if (n < 6) setQty(n, false); });
  qsel.addEventListener('pointermove', e => { if (!dragging) return; const n = fromX(e.clientX); if (n < 6 && n !== state.qty) setQty(n, false); else if (n === 6 && state.qty < 6) setQty(6, false); });
  qsel.addEventListener('pointerup', () => { if (dragging) dragged = false; dragging = false; });
  $('#qminus').addEventListener('click', () => setQty(state.qty - 1));
  $('#qplus').addEventListener('click', () => setQty(state.qty + 1));

  function unitWord(n) { const M = MODES[state.mode]; return n === 1 ? M.unit[0] : M.unit[1]; }
  function update() {
    const M = MODES[state.mode];
    renderLayers();
    const vis = new Set();
    M.layers.forEach(l => { if (state.on[l.id]) l.show.forEach(g => vis.add(g)); });
    ['g-walls', 'g-base', 'g-fills', 'g-names', 'g-areas', 'g-dims', 'g-dimsW1', 'g-mask', 'g-furn'].forEach(g => $('#' + g).classList.toggle('off', !vis.has(g)));
    $('#wfl').classList.toggle('off', !vis.has('wfl'));
    $('#wfl').classList.toggle('mk', state.mode === 'makler');
    const is3d = !!state.on['3d'];
    const plan = $('#plan');
    plan.classList.toggle('is3d', is3d); plan.dataset.mode = state.mode;
    $('#viewname').textContent = is3d ? 'Axonometrie' : 'Draufsicht';
    // Menge
    const u = unitWord(state.qty), shown = Math.min(state.qty, 6);
    $('#qlabel').textContent = 'Anzahl ' + M.unit[1];
    $('#qc').style.width = (shown / 6 * 100) + '%';
    chain($('#qc'), Array.from({ length: shown }, (_, i) => ({ w: 1 / shown, t: i === Math.floor((shown - 1) / 2) ? state.qty + ' ' + u : '' })));
    cells.forEach((c, i) => {
      const n = i + 1, sel = n === shown;
      c.setAttribute('aria-checked', String(sel)); c.tabIndex = sel ? 0 : -1;
      c.classList.toggle('in', n < shown);
      if (n === 6) c.textContent = state.qty >= 6 ? String(state.qty) : '6+';
      c.setAttribute('aria-label', n === 6 ? (state.qty >= 6 ? state.qty + ' ' + M.unit[1] : '6 oder mehr ' + M.unit[1]) : n + ' ' + unitWord(n));
    });
    $('#qminus').disabled = state.qty <= 1; $('#qplus').disabled = state.qty >= QMAX;
    $('#qnote').textContent = M.qnote;
    // Leistungsverzeichnis
    let sum = 0, pos = 0;
    $('#lvbody').innerHTML = M.layers.filter(l => state.on[l.id]).map(l => {
      pos++; const gp = l.price * state.qty; sum += gp;
      return '<tr class="' + (l.price ? '' : 'inkl') + '"><td class="m">01.' + String(pos).padStart(2, '0') + '</td><td>' + l.desc + '<div class="label" style="margin-top:2px">' + l.name + '</div></td>' +
        '<td class="r m">' + state.qty + '</td><td class="m">' + M.eh + '</td><td class="r m">' + (l.price ? eur(l.price) : 'inkl.') + '</td><td class="r m">' + (l.price ? eur(gp) : '–') + '</td></tr>';
    }).join('');
    state.sum = sum;
    $('#lvsum').textContent = eur(sum) + ' €';
    $('#pksum').textContent = eur(sum) + ' €';
    $('#pkqty').textContent = state.qty + ' ' + u;
    $('#pkdel').textContent = M.del; $('#pkfmt').textContent = M.fmt + (is3d ? M.fmt3d : '');
    planCell();
  }
  function summaryText() {
    const M = MODES[state.mode];
    return state.qty + ' ' + unitWord(state.qty) + ' · ' + M.layers.filter(l => state.on[l.id] && l.price).map(l => l.name).join(' + ') + ' · ' + eur(state.sum) + ' €';
  }

  /* ---------- 02 Detail-Lupe ---------- */
  $$('.exblock').forEach(block => {
    const img = block.querySelector('.planbox img'), lupe = block.querySelector('.lupe');
    const marks = Array.from(block.querySelectorAll('.dmark'));
    let cur = marks[0];
    function show(m) {
      cur = m;
      marks.forEach(x => x.setAttribute('aria-pressed', String(x === m)));
      block.querySelector('.dno').textContent = 'DETAIL ' + m.textContent.trim();
      block.querySelector('.dtitle').textContent = m.dataset.title;
      block.querySelector('.dtext').textContent = m.dataset.text;
      const L = lupe.clientWidth || 300, Z = 3.4;
      const iw = img.naturalWidth || +img.getAttribute('width'), ih = img.naturalHeight || +img.getAttribute('height');
      const bw = L * Z, bh = bw * ih / iw;
      lupe.style.backgroundImage = 'url("' + img.currentSrc.replace(/"/g, '%22') + '")';
      lupe.style.backgroundSize = bw + 'px ' + bh + 'px';
      lupe.style.backgroundPosition = (L / 2 - (+m.dataset.x) * bw) + 'px ' + (L / 2 - (+m.dataset.y) * bh) + 'px';
    }
    marks.forEach(m => m.addEventListener('click', () => show(m)));
    const go = () => show(cur);
    if (img.complete) go(); else img.addEventListener('load', go);
    window.addEventListener('resize', go, { passive: true });
    block._show = go;
  });

  /* ---------- Ansicht umschalten ---------- */
  function setMode(m, first) {
    state.mode = m; const M = MODES[m];
    document.body.dataset.mode = m;
    $$('[data-t]').forEach(el => { const k = el.dataset.t; if (M[k] !== undefined) el.innerHTML = M[k]; });
    $('#specs').innerHTML = M.specs.map(s => '<dt>' + s[0] + '</dt><dd>' + s[1] + '</dd>').join('');
    $('#imgB').src = IMG[M.before]; $('#imgA').src = IMG[M.after]; $('#imgA').alt = M.altA;
    cmp.style.setProperty('--ar', M.ar);
    vchain($('#hy'), M.span.h, M.span.y0, M.span.y1);
    $('#flat').setAttribute('viewBox', M.vb);
    $('#plan').style.setProperty('--par', M.par);
    const pp = M.par.split('/').map(Number); $('#plan').style.setProperty('--parN', String(pp[0] / pp[1]));
    $('#plan').dataset.dimM = String(+M.vb.split(' ')[2] / 100);
    cmp.dataset.dimM = state.mode === 'buero' ? '27.45' : '13.60';
    $('#plan').classList.remove('zoom');
    $('#viewinfo').textContent = M.vinfo;
    state.on = {}; M.layers.forEach(l => { state.on[l.id] = l.on; });
    state.qty = M.qty;
    heroChain(); update();
    $$('.exblock').forEach(b => { if (b._show && b.offsetParent) b._show(); });
    if (!first) say('Ansicht: ' + (m === 'buero' ? 'Planungsbüro' : 'Makler'));
  }

  /* ---------- 07 Auftrag: Plankopf mit Stempel ---------- */
  function say() { /* keine Befehlszeile mehr */ }
  function jump(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: reduceM ? 'auto' : 'smooth' }); }
  function toRequest(kind) {
    $('#f-art').value = kind; $('#f-art').dispatchEvent(new Event('change'));
    jump('kontakt');
    setTimeout(() => $('#f-name').focus({ preventScroll: true }), reduceM ? 0 : 500);
  }
  $('#toreq').addEventListener('click', () => toRequest('plan'));
  $$('[data-probe]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toRequest('probe'); }));
  window.PlavoPlankopf && window.PlavoPlankopf({
    subject: () => 'Anfrage Bestandsplan',
    lines: () => {
      const art = $('#f-art').value;
      return art === 'plan' ? ['Leistung: ' + summaryText(), 'Festpreis laut Rechner: ' + eur(state.sum) + ' €'] : [];
    }
  });
  $('#f-art').addEventListener('change', planCell);
  function planCell() {
    const art = $('#f-art').value;
    $('#f-lst').textContent = art === 'plan' ? state.qty + ' ' + unitWord(state.qty) : art === 'probe' ? 'Probezeichnung' : 'Frage';
    $('#f-sel').textContent = art === 'plan' ? MODES.buero.layers.filter(l => state.on[l.id]).map(l => l.name).join(' · ') : art === 'probe' ? 'Ausschnitt bis ca. 30 m²' : 'ohne Auswahl';
    $('#f-sum').textContent = art === 'plan' ? eur(state.sum) + ' €' : art === 'probe' ? '0,00 €' : '–';
  }

  /* ---------- Statuszeile ---------- */
  function toggleGrid() { const b = $('#t-grid'), on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); document.body.classList.toggle('nogrid', !on); say('<Raster ' + (on ? 'ein' : 'aus') + '>'); }
  $('#t-grid').addEventListener('click', toggleGrid);
  const coords = $('#coords'), xh = $('.xh');
  let chOn = fine;
  function applyCh() { document.body.classList.toggle('ch', chOn && fine); $('#t-ch').setAttribute('aria-pressed', String(chOn && fine)); }
  $('#t-ch').addEventListener('click', () => { chOn = !chOn; applyCh(); say('<Fadenkreuz ' + (chOn ? 'ein' : 'aus') + '>'); });
  if (!fine) $('#t-ch').disabled = true;
  applyCh();
  const H = $('.xh .h'), V = $('.xh .v'), PB = $('.xh .pb');
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    H.style.left = e.clientX + 'px'; H.style.top = e.clientY + 'px';
    V.style.left = e.clientX + 'px'; V.style.top = e.clientY + 'px';
    PB.style.left = e.clientX + 'px'; PB.style.top = e.clientY + 'px';
    xh.classList.toggle('hot', !!e.target.closest('a, button, select, summary, #cmdin, [role=tab]'));
    const r = cmp.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      const [mx, my] = MODES[state.mode].toM((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      coords.textContent = 'X ' + de(mx) + '  Y ' + de(my) + '  m';
    } else coords.textContent = 'X ' + de(e.pageX / 3.7795, 1) + '  Y ' + de(e.pageY / 3.7795, 1) + '  mm';
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { xh.style.visibility = 'hidden'; });
  document.documentElement.addEventListener('mouseenter', () => { xh.style.visibility = ''; });
  document.addEventListener('keydown', e => { if (e.key === 'F7') { e.preventDefault(); toggleGrid(); } });

  /* ---------- Hover-Bemaßung ---------- */
  const hd = $('.hoverdim');
  if (fine) {
    document.addEventListener('pointerover', e => {
      const el = e.target.closest('[data-dim]');
      if (!el) { hd.classList.remove('show'); return; }
      const r = el.getBoundingClientRect();
      hd.style.left = (r.left + scrollX) + 'px'; hd.style.top = (r.top + scrollY - 22) + 'px'; hd.style.width = r.width + 'px';
      hd.querySelector('.tx').textContent = el.dataset.dimM ? de(+el.dataset.dimM) + ' m' : de(r.width / 3.7795, 1);
      hd.classList.add('show');
    });
    window.addEventListener('scroll', () => hd.classList.remove('show'), { passive: true });
  }

  /* ---------- Abschnitte: Layerleiste und Lesefortschritt ---------- */
  const secs = ['start', 'beispiel', 'preise', 'ablauf', 'hinweise', 'kontakt', 'planverfasser'].map((id, i) => { const el = document.getElementById(id); el.dataset.blatt = String(i + 1).padStart(2, '0'); return el; });
  const navs = $$('.layers a'), prog = $('.prog'), progtx = $('#progtx');
  function onScroll() {
    const y = scrollY + innerHeight * 0.35;
    let cur = secs[0];
    secs.forEach(s => { if (s.offsetTop <= y) cur = s; });
    navs.forEach(a => { const on = a.dataset.sec === cur.id; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.setProperty('--p', (max > 0 ? Math.min(100, scrollY / max * 100) : 0) + '%');
    progtx.textContent = 'BLATT ' + cur.dataset.blatt + ' / 07';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------- Plotdatum ---------- */
  (function () { const d = new Date(), p = n => String(n).padStart(2, '0'); $('#plotdate').textContent = p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes()); })();

  /* ---------- Objektfang ---------- */
  const snapEl = $('.snap'), snapSvg = snapEl.querySelector('svg'), snapLab = snapEl.querySelector('.lab');
  const SNAPSYM = { end: ['<rect x="-5" y="-5" width="10" height="10"/>', 'Endpunkt'], mid: ['<path d="M0 -6 L6 5 L-6 5 Z"/>', 'Mittelpunkt'], int: ['<path d="M-5 -5 L5 5 M5 -5 L-5 5"/>', 'Schnittpunkt'], cen: ['<circle r="6"/>', 'Zentrum'] };
  const SNAPT = 'a, button, .btn';
  let snapPt = null, snapKind = '';
  function findSnap(t, x, y) {
    const el = t && t.closest && t.closest(SNAPT);
    if (!el || t.closest('input, textarea, select, .stampf')) return null;
    const r = el.getBoundingClientRect(), pts = [];
    if (el.matches('.dmark, .bulb')) pts.push([r.left + r.width / 2, r.top + r.height / 2, 'cen']);
    else {
      [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].forEach(p => pts.push([p[0], p[1], 'end']));
      [[r.left + r.width / 2, r.top], [r.left + r.width / 2, r.bottom], [r.left, r.top + r.height / 2], [r.right, r.top + r.height / 2]].forEach(p => pts.push([p[0], p[1], 'mid']));
    }
    let best = null, bd = 11;
    pts.forEach(p => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = p; } });
    return best;
  }
  if (fine) {
    window.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const p = chOn ? findSnap(e.target, e.clientX, e.clientY) : null;
      if (!p) { if (snapPt) { snapEl.classList.remove('show'); snapPt = null; } return; }
      snapPt = [p[0], p[1]];
      if (snapKind !== p[2]) { snapKind = p[2]; snapSvg.innerHTML = SNAPSYM[p[2]][0]; snapLab.textContent = SNAPSYM[p[2]][1]; }
      snapEl.style.left = p[0] + 'px'; snapEl.style.top = p[1] + 'px'; snapEl.classList.add('show');
      [H, V, PB].forEach(n => { n.style.left = p[0] + 'px'; n.style.top = p[1] + 'px'; });
    }, { passive: true });
  }

  /* ---------- Start ---------- */
  setMode(state.mode, true);
  onScroll();
  if (!reduceM) {
    const t0 = performance.now();
    const step = t => { const k = Math.min((t - t0) / 1100, 1), e = 1 - Math.pow(1 - k, 3); const v = 18 + 32 * e; cut.value = v; setX(v); if (k < 1) requestAnimationFrame(step); };
    setX(18); setTimeout(() => requestAnimationFrame(step), 350);
  } else setX(50);
})();
