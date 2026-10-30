/* PlavoCAD – Seitenlogik: Ansichten, Schnittlinie, Preisrechner, Detail-Lupe, Befehlszeile, Statuszeile.
   Speichert nichts im Browser und sendet nichts an Server. */
(() => {
  'use strict';
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
    },
    makler: {
      eyebrow: 'Exposé-Grundrisse für Immobilienmakler', h1: 'Aus dem Altplan wird ein <em>Exposé.</em>',
      lead: 'Foto oder Scan aus der Bauakte schicken, klaren Grundriss mit Raumflächen zurückbekommen. Druckfertig und fürs Portal.',
      specs: [['Format', 'PDF · PNG'], ['Flächen', 'WoFlV, Balkon zu ¼'], ['Lieferung', '48 Stunden'], ['Preis', '39 € je Wohnung']],
      cta2: 'Erste Wohnung gratis', before: 'vorlageW1', after: 'expose', ar: '816 / 579', tagB: 'Vorlage · Kopie Bauakte', tagA: 'PlavoCAD · Exposé',
      altA: 'Nachher: Exposé-Grundriss mit Raumflächen',
      cap: 'Wohnung 1 · 3 Zimmer · 66,18 m² Wohnfläche',
      span: { x0: 0, x1: 1, y0: 0, y1: 1, w: 13.60, h: 9.65 },
      toM: (fx, fy) => [-0.15 + fx * 13.6, 16.05 - fy * 9.65],
      phead: 'Schalten Sie ein, was ins Exposé soll. Rechts sehen Sie das Ergebnis, unten den Preis pro Wohnung.',
      vb: '-150 -1770 1580 1150', par: '1580 / 1150', vinfo: 'Wohnung 1 · M 1:100',
      lmsub: 'je Wohnung', unit: ['Wohnung', 'Wohnungen'], eh: 'Wohnung', qty: 1,
      qnote: 'Ganzes Haus oder Gewerbe? Preis nach Absprache.', del: '48 Stunden', fmt: 'PDF · PNG', fmt3d: ' · 3D',
      firmLabel: 'Firma', formmode: 'Makler',
      layers: [
        { id: 'exp', name: 'A-EXPOSE', sw: 'var(--f1)', desc: 'Grundriss mit Raumnamen, Nordpfeil, Maßstab', price: 39, lock: true, on: true, show: ['g-walls', 'g-base', 'g-fills', 'g-names', 'g-mask'] },
        { id: 'moeb', name: 'A-MOEBLIERUNG', sw: 'var(--muted)', desc: 'Möbel als Größenvergleich', price: 0, on: true, show: ['g-furn'] },
        { id: 'fl', name: 'A-FLAECHEN', sw: 'var(--bulb)', desc: 'Raumflächen und Wohnflächenberechnung WoFlV', price: 20, on: true, show: ['g-areas', 'wfl'] },
        { id: 'bem', name: 'A-AUSSENMASSE', sw: 'var(--blue)', desc: 'Maßketten für Käufer und Gutachter', price: 0, on: false, show: ['g-dimsW1'] },
        { id: '3d', name: 'A-3D', sw: 'var(--red)', desc: '3D-Ansicht fürs Exposé als PNG', price: 35, on: false, show: [] }
      ]
    }
  };
  const params = new URLSearchParams(location.search);
  const state = { mode: (params.get('ansicht') === 'makler' || location.hash === '#makler') ? 'makler' : 'buero', on: {}, qty: 2, x: 50, sum: 0 };

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
  const hist = [];
  function remember() { hist.push({ mode: state.mode, on: Object.assign({}, state.on), qty: state.qty }); if (hist.length > 60) hist.shift(); }
  function undo() {
    const h = hist.pop();
    if (!h) { say('_U: Nichts zum Zurücknehmen.'); return; }
    if (h.mode !== state.mode) setMode(h.mode, true);
    state.on = h.on; state.qty = h.qty; update();
    say('_U: Letzte Änderung im Preisrechner zurückgenommen. ' + summaryText());
  }
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
    $('#full3d').setAttribute('aria-pressed', String(is3d));
    isoId = ''; $$('#plan .g.iso-dim').forEach(g => g.classList.remove('iso-dim'));
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
    $('#f-sel').textContent = summaryText();
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
    $('#formmode').textContent = M.formmode;
    state.on = {}; M.layers.forEach(l => { state.on[l.id] = l.on; });
    state.qty = M.qty;
    $$('.tabs [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.mode === m)));
    heroChain(); update();
    $$('.exblock').forEach(b => { if (b._show && b.offsetParent) b._show(); });
    if (!first) say('Ansicht: ' + (m === 'buero' ? 'Planungsbüro' : 'Makler'));
  }
  $$('.tabs [role=tab]').forEach(t => t.addEventListener('click', () => { if (t.dataset.mode !== state.mode) { remember(); setMode(t.dataset.mode); } }));

  /* ---------- 07 Anfrage ---------- */
  const form = $('#req'), fmsg = $('#f-msg');
  const DOMAINS = ['gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 'gmx.at', 't-online.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'posteo.de', 'mailbox.org', 'freenet.de', 'aol.com', 'arcor.de', 'online.de', 'ionos.de'];
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function mailFix(mail) {
    const m = /^([^@\s]+)@([^@\s]+)$/.exec(mail); if (!m) return '';
    const dom = m[2].toLowerCase(); if (DOMAINS.includes(dom)) return '';
    let best = '', bd = 3;
    DOMAINS.forEach(d => { const x = lev(dom, d); if (x < bd) { bd = x; best = d; } });
    return best && bd <= 2 ? m[1] + '@' + best : '';
  }
  function cloudPath(w, h) {
    const r = 9, segs = (len) => Math.max(2, Math.round(len / (r * 2)));
    let p = 'M0 0', nx = segs(w), ny = segs(h), sx = w / nx, sy = h / ny;
    for (let i = 0; i < nx; i++) p += ' a' + sx / 2 + ' ' + sx / 2.4 + ' 0 0 1 ' + sx + ' 0';
    for (let i = 0; i < ny; i++) p += ' a' + sy / 2.4 + ' ' + sy / 2 + ' 0 0 1 0 ' + sy;
    for (let i = 0; i < nx; i++) p += ' a' + sx / 2 + ' ' + sx / 2.4 + ' 0 0 1 ' + (-sx) + ' 0';
    for (let i = 0; i < ny; i++) p += ' a' + sy / 2.4 + ' ' + sy / 2 + ' 0 0 1 0 ' + (-sy);
    return p + ' Z';
  }
  function setCloud(input, no) {
    const f = input.closest('.f');
    f.querySelectorAll('.cloud, .revtri').forEach(x => x.remove());
    if (!no) return;
    const w = f.offsetWidth + 12, h = f.offsetHeight + 12;
    f.insertAdjacentHTML('beforeend', '<svg class="cloud" viewBox="-4 -4 ' + (w + 8) + ' ' + (h + 8) + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + cloudPath(w, h) + '"/></svg>' +
      '<span class="revtri" aria-hidden="true"><svg viewBox="0 0 28 24"><path d="M14 1 L27 23 L1 23 Z"/><text x="14" y="20">' + no + '</text></svg></span>');
    input.addEventListener('input', function done() { const c = f.querySelector('.cloud'); if (c) c.classList.add('done'); input.removeAttribute('aria-invalid'); input.removeEventListener('input', done); });
  }
  let pendingFix = null;
  function showFix(fix) {
    const box = $('#f-mail').closest('.f');
    box.querySelectorAll('.suggest').forEach(x => x.remove());
    pendingFix = fix || null;
    if (!fix) return;
    box.insertAdjacentHTML('beforeend', '<div class="suggest" role="group" aria-label="Vorschlag zur E-Mail-Adresse"><span>Meinten Sie <b></b>?</span><button type="button" data-a="ja">[Ja]</button><button type="button" data-a="nein">[Nein]</button></div>');
    box.querySelector('.suggest b').textContent = fix;
    box.querySelector('[data-a="ja"]').addEventListener('click', () => { $('#f-mail').value = fix; showFix(''); say('E-Mail korrigiert: ' + fix); $('#f-mail').focus(); });
    box.querySelector('[data-a="nein"]').addEventListener('click', () => { pendingFix = false; box.querySelector('.suggest').remove(); say('E-Mail bleibt wie eingegeben.'); });
    say('Meinten Sie ' + fix + '? [Ja/Nein]');
  }
  $('#f-mail').addEventListener('blur', () => { if (pendingFix !== false) { const fx = mailFix($('#f-mail').value.trim()); if (fx) showFix(fx); } });
  $('#f-mail').addEventListener('input', () => { if (pendingFix) showFix(''); pendingFix = null; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#f-name').value.trim(), mail = $('#f-mail').value.trim();
    const miss = [];
    if (!name) miss.push(['Name', $('#f-name')]);
    if (!/^\S+@\S+\.\S+$/.test(mail)) miss.push(['E-Mail', $('#f-mail')]);
    [$('#f-name'), $('#f-mail')].forEach(i => { i.removeAttribute('aria-invalid'); setCloud(i, 0); });
    if (miss.length) {
      miss.forEach((m, i) => { m[1].setAttribute('aria-invalid', 'true'); setCloud(m[1], i + 1); });
      fmsg.className = 'msg err';
      fmsg.textContent = miss.length === 1 ? (miss[0][0] === 'Name' ? 'Bitte tragen Sie Ihren Namen ein.' : 'Bitte tragen Sie eine vollständige E-Mail-Adresse ein, z. B. name@buero.de.') : 'Bitte tragen Sie Namen und E-Mail-Adresse ein.';
      say(miss.length + (miss.length === 1 ? ' Objekt' : ' Objekte') + ' nicht gefunden: ' + miss.map(m => m[0]).join(', '));
      miss[0][1].focus();
      return;
    }
    if (pendingFix === null) { const fx = mailFix(mail); if (fx) { showFix(fx); fmsg.className = 'msg err'; fmsg.textContent = 'Bitte kurz bestätigen: Meinten Sie ' + fx + '?'; $('#f-mail').closest('.f').querySelector('[data-a="ja"]').focus(); return; } }
    if (pendingFix) { fmsg.className = 'msg err'; fmsg.textContent = 'Bitte kurz bestätigen: Meinten Sie ' + pendingFix + '?'; return; }
    form.querySelectorAll('.cloud, .revtri').forEach(x => x.remove());
    const art = $('#f-art'), artTxt = art.options[art.selectedIndex].text;
    const firma = $('#f-firma').value.trim(), tel = $('#f-tel').value.trim();
    const body = 'Hallo Tomo,\n\n' + artTxt + '.\n\n' +
      'Name: ' + name + '\n' + (firma ? MODES[state.mode].firmLabel + ': ' + firma + '\n' : '') + 'E-Mail: ' + mail + '\n' + (tel ? 'Telefon: ' + tel + '\n' : '') +
      'Ansicht: ' + MODES[state.mode].formmode + '\n' + (art.value === 'plan' ? 'Auswahl: ' + summaryText() + '\n' : '') +
      '\nProjekt:\n' + $('#f-text').value.trim() + '\n\nViele Grüße\n' + name;
    const subj = 'Anfrage PlavoCAD – ' + (firma || name);
    location.href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
    fmsg.className = 'msg';
    fmsg.textContent = 'Ihr E-Mail-Programm sollte sich jetzt mit der fertigen Anfrage öffnen. Hängen Sie dort Ihre Pläne an. Falls sich nichts öffnet, schreiben Sie direkt an kontakt@plavocad.de.';
    say('_anfrage: E-Mail vorbereitet');
  });
  $('#copymail').addEventListener('click', () => {
    const b = $('#copymail'), done = () => { b.textContent = 'Kopiert'; setTimeout(() => { b.textContent = 'Adresse kopieren'; }, 2000); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($('#mailaddr')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Markiert, jetzt kopieren'; };
    try { navigator.clipboard.writeText('kontakt@plavocad.de').then(done, fallback); } catch (e) { fallback(); }
  });
  function toRequest(kind) {
    $('#f-art').value = kind;
    location.hash = 'kontakt';
    setTimeout(() => $('#f-name').focus({ preventScroll: true }), reduceM ? 0 : 450);
  }
  $('#toreq').addEventListener('click', () => { toRequest('plan'); say('_anfrage ' + summaryText() + ' · ins Formular übernommen'); });
  $$('[data-probe]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toRequest('probe'); }));

  /* ---------- Befehlszeile ---------- */
  const out = $('#cmdout'), cin = $('#cmdin');
  function say(s) { out.textContent = s; const po = document.getElementById('palout'); if (po) po.textContent = s; }
  function jump(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: reduceM ? 'auto' : 'smooth' }); }
  function zoom(on, noJump) { $('#plan').classList.toggle('zoom', on); if (on && !noJump && !stage.classList.contains('full')) jump('preise'); say(on ? '_zoom: Vorschau vergrößert. ZOOM E zeigt wieder alles.' : '_zoom _e: ganze Vorschau'); }
  const SECS = { start: 'start', beispiel: 'beispiel', preis: 'preise', preise: 'preise', p: 'preise', ablauf: 'ablauf', profil: 'profil', hinweise: 'hinweise', faq: 'hinweise', kontakt: 'kontakt' };
  const CMDS = [
    ['PREIS', 'Preisrechner, Blatt 03'], ['ANFRAGE', 'Auswahl ins Formular übernehmen'], ['PROBE', 'Kostenlose Probe anfragen'], ['LAYER', 'Layer-Manager im Preisrechner'],
    ['ZOOM', 'Vorschau vergrößern'], ['ZOOM E', 'Ganze Vorschau zeigen'], ['3D', '3D-Modell des Hauses öffnen'], ['PLOT', 'Angebot als A4-Blatt drucken'],
    ['MAKLER', 'Ansicht für Immobilienmakler'], ['BUERO', 'Ansicht für Planungsbüros'], ['RASTER', 'Raster ein/aus (F7)'], ['ORTHO', 'Ortho ein/aus (F8)'],
    ['BEISPIEL', 'Vorher/Nachher, Blatt 02'], ['ABLAUF', 'So läuft es ab, Blatt 04'], ['PROFIL', 'Über mich, Blatt 05'], ['HINWEISE', 'Fragen und Antworten, Blatt 06'], ['KONTAKT', 'Anfrage, Blatt 07'], ['HILFE', 'Alle Befehle (F1)']
  ];
  let lastCmd = '';
  function run(c) {
    const raw = c.trim(); c = raw.toLowerCase().replace(/^_/, '');
    if (!c) { if (drawMode) { endDraw(true); say(drawMode === 'line' ? '_LINIE beendet' : ''); } else if (lastCmd) run(lastCmd); return; }
    lastCmd = c;
    if (SECS[c]) { jump(SECS[c]); say('_' + c + ': Blatt ' + document.getElementById(SECS[c]).dataset.blatt); }
    else if (['anfrage', 'a', 'plan'].includes(c)) { toRequest('plan'); say('_anfrage ' + summaryText()); }
    else if (['probe', 'test', 'gratis'].includes(c)) { toRequest('probe'); say('_probe: kostenlose Probe anfragen'); }
    else if (['z', 'zoom', 'zoom f'].includes(c)) zoom(true);
    else if (['zoom e', 'ze', 'zoom a', 'zoom alles', 'zoom g', 'zoom grenzen'].includes(c)) zoom(false);
    else if (['layer', 'la'].includes(c)) { jump('preise'); setTimeout(() => { const b = $('#layers .bulb:not(:disabled)'); if (b) b.focus({ preventScroll: true }); }, 60); say('_layer: Layer-Manager. Leertaste schaltet den Layer.'); }
    else if (['3d', '3d-modell'].includes(c)) { say('_3d: 3D-Modell wird geöffnet'); location.href = 'modell-3d.html'; }
    else if (['raster', 'grid', 'f7'].includes(c)) toggleGrid();
    else if (['ortho', 'f8'].includes(c)) toggleOrtho();
    else if (['makler'].includes(c)) { remember(); setMode('makler'); }
    else if (['buero', 'büro', 'planer'].includes(c)) { remember(); setMode('buero'); }
    else if (['plot', 'drucken'].includes(c)) plot();
    else if (['hilfe', '?', 'help'].includes(c)) say('Befehle: PREIS · ANFRAGE · PROBE · LAYER · ZOOM · ZOOM E · 3D · PLOT · MAKLER · BUERO · F1 Hilfe · F7 Raster · F8 Ortho · Esc Abbruch');
    // ohne Eintrag in HILFE
    else if (['dark', 'modell', 'model', 'modellbereich'].includes(c)) model(true);
    else if (['light', 'layout', 'papier', 'papierbereich'].includes(c)) model(false);
    else if (['regen', 're', 'regenall'].includes(c)) regen();
    else if (['undo', 'u', 'zurück', 'zurueck'].includes(c)) undo();
    else if (['purge', 'bereinig', 'pu'].includes(c)) say('BEREINIG: 0 nicht verwendete Layer, 0 Blöcke, 0 Linientypen gefunden. Die Zeichnung ist sauber.');
    else if (['dist', 'abstand', 'di'].includes(c)) startDraw('dist');
    else if (['line', 'l', 'linie'].includes(c)) startDraw('line');
    else if (['explode', 'ursprung', 'x'].includes(c)) explode();
    else if (['layiso'].includes(c)) { const l = MODES[state.mode].layers.find(x => !x.lock && state.on[x.id] && x.show.length); if (l) layiso(l.id); else say('LAYISO: Kein passender Layer eingeschaltet.'); }
    else if (['layuniso'].includes(c)) { isoId = 'x'; layiso('x'); }
    else say('Unbekannter Befehl „' + raw.replace(/^_/, '').toUpperCase() + '“. Drücken Sie F1 für Hilfe.');
  }
  // Autovervollständigung
  const cmdBox = $('.cmd'); let acEl = null, acIdx = -1, acList = [];
  function acClose() { if (acEl) { acEl.remove(); acEl = null; } acIdx = -1; acList = []; cin.removeAttribute('aria-activedescendant'); cin.setAttribute('aria-expanded', 'false'); }
  function acShow(list) {
    acClose(); if (!list.length) return;
    acList = list; acEl = document.createElement('div'); acEl.className = 'ac'; acEl.id = 'aclist'; acEl.setAttribute('role', 'listbox');
    acEl.innerHTML = list.map((x, i) => '<button type="button" role="option" id="ac' + i + '" tabindex="-1" data-c="' + x[0] + '">' + x[0] + '<span>' + x[1] + '</span></button>').join('');
    acEl.addEventListener('mousedown', e => e.preventDefault());
    acEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { cin.value = ''; acClose(); run(b.dataset.c); }));
    cmdBox.appendChild(acEl); cin.setAttribute('aria-expanded', 'true');
  }
  function acMark(i) { acIdx = i; acEl.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i)); cin.setAttribute('aria-activedescendant', 'ac' + i); const on = acEl.children[i]; if (on) on.scrollIntoView({ block: 'nearest' }); }
  cin.setAttribute('role', 'combobox'); cin.setAttribute('aria-autocomplete', 'list'); cin.setAttribute('aria-controls', 'aclist'); cin.setAttribute('aria-expanded', 'false');
  cin.addEventListener('input', () => {
    const v = cin.value.trim().replace(/^_/, '').toUpperCase().replace('Ü', 'UE');
    if (!v) { acClose(); return; }
    acShow(CMDS.filter(x => x[0].startsWith(v)).slice(0, 7));
  });
  cin.addEventListener('blur', () => setTimeout(acClose, 120));
  cin.addEventListener('keydown', e => {
    if (acEl && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); const n = acList.length; acMark(e.key === 'ArrowDown' ? (acIdx + 1) % n : (acIdx - 1 + n) % n); return; }
    if (acEl && e.key === 'Tab' && acList.length) { e.preventDefault(); cin.value = acList[Math.max(0, acIdx)][0]; acClose(); return; }
    if (e.key === 'Enter') { const v = acEl && acIdx >= 0 ? acList[acIdx][0] : cin.value; acClose(); cin.value = ''; run(v); return; }
    if (e.key === 'Escape') { e.stopPropagation(); if (acEl) { acClose(); return; } cin.value = ''; escape(); cin.blur(); }
  });
  function escape() {
    if (drawMode) { endDraw(); return; }
    if (stage.classList.contains('full')) { full(false); say('*Abbruch* · Vollbild beendet'); return; }
    if (!pal.hidden) { palOpen(false); return; }
    if (gripEls.length) { clearGrips(); say('*Abbruch*'); return; }
    say('*Abbruch*');
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'F1') { e.preventDefault(); run('hilfe'); if (window.matchMedia('(min-width: 761px)').matches) { cin.focus(); acShow(CMDS.slice()); } return; }
    if (e.key === 'F7') { e.preventDefault(); toggleGrid(); return; }
    if (e.key === 'F8') { e.preventDefault(); toggleOrtho(); return; }
    if (e.key === 'Escape' && e.target !== cin) { escape(); return; }
    if (e.key === 'Enter' && drawMode && e.target === document.body) { e.preventDefault(); run(''); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); undo(); return; }
    if (e.target.closest('input, textarea, select, button, a, summary, [contenteditable]')) return;
    if (e.key.length === 1 && /[a-z_?]/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && window.matchMedia('(min-width: 761px)').matches) cin.focus();
  });

  /* ---------- Statuszeile ---------- */
  function toggleGrid() { const b = $('#t-grid'), on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); document.body.classList.toggle('nogrid', !on); say('<Raster ' + (on ? 'ein' : 'aus') + '>'); }
  function toggleOrtho() { const b = $('#t-ortho'), on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); say('<Ortho ' + (on ? 'ein' : 'aus') + '> · hier ist ohnehin alles rechtwinklig'); }
  $('#t-grid').addEventListener('click', toggleGrid);
  $('#t-ortho').addEventListener('click', toggleOrtho);
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
  const secs = ['start', 'beispiel', 'preise', 'ablauf', 'profil', 'hinweise', 'kontakt'].map((id, i) => { const el = document.getElementById(id); el.dataset.blatt = String(i + 1).padStart(2, '0'); return el; });
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

  /* ---------- Auswahl: Griffe ---------- */
  const SELNAME = [['.planbox', 'Rasterbild'], ['.compare', 'Rasterbild'], ['.stage', 'Ansichtsfenster'], ['.lv', 'Tabelle'], ['.pk', 'Plankopf'], ['.stamp', 'Block'], ['.lm', 'Layer-Manager'], ['.qcell', 'Zelle'], ['.btn', 'Schaltfläche'], ['.lrow', 'Layer'], ['.dmark', 'Detailmarke'], ['h2', 'Text']];
  let gripEls = [];
  function clearGrips() { gripEls.forEach(g => g.remove()); gripEls = []; }
  function showGrips(els) {
    clearGrips();
    els.forEach(el => {
      const r = el.getBoundingClientRect(), g = document.createElement('div');
      g.className = 'grips'; g.setAttribute('aria-hidden', 'true'); g.innerHTML = '<i></i><i></i><i></i><i></i>';
      Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.appendChild(g); gripEls.push(g);
    });
  }
  const objName = el => { for (const [s, n] of SELNAME) if (el.matches(s)) return n; return 'Objekt'; };
  window.addEventListener('scroll', clearGrips, { passive: true });
  window.addEventListener('resize', clearGrips, { passive: true });
  if (fine) {
    document.addEventListener('click', e => {
      if (drawMode || e.button !== 0) return;
      if (e.target.closest('a, button, input, textarea, select, label, summary, [role=tab], .dock, .palette')) return;
      const el = e.target.closest('.planbox, .stage, .lv, .pk, .stamp, .lm');
      if (!el) return;
      showGrips([el]);
      say('1 gefunden · ' + objName(el) + (el.dataset.dimM ? ', Breite ' + de(+el.dataset.dimM) + ' m' : ''));
    });
  }

  /* ---------- Fenster- und Kreuzen-Auswahl ---------- */
  const selbox = $('.selbox');
  const NOSEL = 'a, button, input, textarea, select, label, summary, p, h1, h2, h3, h4, li, dt, dd, td, th, figcaption, small, span, b, em, strong, img, svg, canvas, .planbox, .compare, .stage, .lv, .pk, .lm, .stamp, .dock, .palette, header, details';
  let sel = null;
  if (fine) {
    document.addEventListener('pointerdown', e => {
      if (drawMode || e.pointerType !== 'mouse' || e.button !== 0) return;
      clearGrips();
      if (e.target.closest(NOSEL)) return;
      sel = { x: e.clientX, y: e.clientY, on: false };
    });
    window.addEventListener('pointermove', e => {
      if (!sel) return;
      const dx = e.clientX - sel.x, dy = e.clientY - sel.y;
      if (!sel.on && Math.hypot(dx, dy) < 8) return;
      if (!sel.on) { sel.on = true; document.body.classList.add('selecting'); const s = getSelection && getSelection(); if (s) s.removeAllRanges(); }
      sel.cross = dx < 0;
      selbox.className = 'selbox ' + (sel.cross ? 'cross' : 'win');
      Object.assign(selbox.style, { left: Math.min(sel.x, e.clientX) + 'px', top: Math.min(sel.y, e.clientY) + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
      say((sel.cross ? 'Kreuzen' : 'Fenster') + ': Gegenecke angeben');
    }, { passive: true });
    window.addEventListener('pointerup', e => {
      if (!sel) return;
      const s = sel; sel = null;
      if (!s.on) return;
      document.body.classList.remove('selecting'); selbox.className = 'selbox';
      const L = Math.min(s.x, e.clientX), R = Math.max(s.x, e.clientX), T = Math.min(s.y, e.clientY), B = Math.max(s.y, e.clientY);
      const found = $$(SELNAME.map(x => x[0]).join(', ')).filter(el => {
        if (!el.offsetParent && el.tagName !== 'BODY') return false;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
        return s.cross ? (r.right >= L && r.left <= R && r.bottom >= T && r.top <= B) : (r.left >= L && r.right <= R && r.top >= T && r.bottom <= B);
      }).filter((el, i, arr) => !arr.some(o => o !== el && o.contains(el)));
      showGrips(found);
      say(found.length ? found.length + ' gefunden' + (found.length < 4 ? ' · ' + found.map(objName).join(', ') : '') : (s.cross ? 'Kreuzen' : 'Fenster') + ': 0 gefunden');
    });
  }

  /* ---------- Objektfang ---------- */
  const snapEl = $('.snap'), snapSvg = snapEl.querySelector('svg'), snapLab = snapEl.querySelector('.lab');
  const SNAPSYM = { end: ['<rect x="-5" y="-5" width="10" height="10"/>', 'Endpunkt'], mid: ['<path d="M0 -6 L6 5 L-6 5 Z"/>', 'Mittelpunkt'], int: ['<path d="M-5 -5 L5 5 M5 -5 L-5 5"/>', 'Schnittpunkt'], cen: ['<circle r="6"/>', 'Zentrum'] };
  const SNAPT = '.btn, .qcell, .lrow, .planbox, .compare, .stage, .lv, .pk, .stamp, .lm, .dmark, .bulb, .sbtn';
  let snapPt = null, snapKind = '';
  function findSnap(t, x, y) {
    const el = t && t.closest && t.closest(SNAPT);
    if (!el || t.closest('input:not([type=range]), textarea, select, .dock')) return null;
    const r = el.getBoundingClientRect(), pts = [];
    if (el.matches('.dmark, .bulb')) pts.push([r.left + r.width / 2, r.top + r.height / 2, 'cen']);
    else {
      [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].forEach(p => pts.push([p[0], p[1], 'end']));
      [[r.left + r.width / 2, r.top], [r.left + r.width / 2, r.bottom], [r.left, r.top + r.height / 2], [r.right, r.top + r.height / 2]].forEach(p => pts.push([p[0], p[1], 'mid']));
      if (el === cmp) { const cx = r.left + r.width * (+cut.value) / 100; pts.push([cx, r.top, 'int'], [cx, r.bottom, 'int']); }
    }
    let best = null, bd = 11;
    pts.forEach(p => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = p; } });
    return best;
  }
  if (fine) {
    window.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const p = (chOn && !sel) ? findSnap(e.target, e.clientX, e.clientY) : null;
      if (!p) { if (snapPt) { snapEl.classList.remove('show'); snapPt = null; } return; }
      snapPt = [p[0], p[1]];
      if (snapKind !== p[2]) { snapKind = p[2]; snapSvg.innerHTML = SNAPSYM[p[2]][0]; snapLab.textContent = SNAPSYM[p[2]][1]; }
      snapEl.style.left = p[0] + 'px'; snapEl.style.top = p[1] + 'px'; snapEl.classList.add('show');
      [H, V, PB].forEach(n => { n.style.left = p[0] + 'px'; n.style.top = p[1] + 'px'; });
    }, { passive: true });
  }

  /* ---------- Zeichnen: ABSTAND und LINIE ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  let eatClick = false, drawSvg = null, drawMode = '', pts = [], rb = null, lineCount = 0;
  function overlay() {
    if (!drawSvg) { drawSvg = document.createElementNS(NS, 'svg'); drawSvg.setAttribute('class', 'draw'); drawSvg.setAttribute('aria-hidden', 'true'); document.body.appendChild(drawSvg); }
    const de2 = document.documentElement;
    drawSvg.setAttribute('width', de2.scrollWidth); drawSvg.setAttribute('height', de2.scrollHeight);
    return drawSvg;
  }
  function mk(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); (parent || overlay()).appendChild(n); return n; }
  const orthoOn = () => $('#t-ortho').getAttribute('aria-pressed') === 'true';
  function pagePt(e) {
    let x = snapPt ? snapPt[0] : e.clientX, y = snapPt ? snapPt[1] : e.clientY;
    x += scrollX; y += scrollY;
    const last = pts[pts.length - 1];
    if (last && drawMode === 'line' && orthoOn()) { if (Math.abs(x - last[0]) > Math.abs(y - last[1])) y = last[1]; else x = last[0]; }
    return [x, y];
  }
  function startDraw(m) {
    endDraw(true);
    drawMode = m; pts = []; lineCount = 0;
    document.body.classList.add('drawing', 'selecting');
    say(m === 'dist' ? '_ABSTAND: Ersten Punkt angeben (Esc bricht ab)' : '_LINIE: Ersten Punkt angeben (Enter beendet, Esc bricht ab)');
  }
  function endDraw(silent) {
    if (!drawMode) return;
    if (rb) { rb.remove(); rb = null; }
    if (drawMode === 'dist' && pts.length < 2) { const g = drawSvg && drawSvg.querySelector('.dm.cur'); if (g) g.remove(); }
    drawMode = ''; pts = [];
    document.body.classList.remove('drawing', 'selecting');
    if (!silent) say('*Abbruch*');
  }
  function mPerPx(a, b) {
    const ea = document.elementFromPoint(a[0] - scrollX, a[1] - scrollY), eb = document.elementFromPoint(b[0] - scrollX, b[1] - scrollY);
    const ca = ea && ea.closest('[data-dim-m]'), cb = eb && eb.closest('[data-dim-m]');
    if (ca && ca === cb) return +ca.dataset.dimM / ca.getBoundingClientRect().width;
    return 0;
  }
  function distText(a, b) {
    const px = Math.hypot(b[0] - a[0], b[1] - a[1]), k = mPerPx(a, b);
    return k ? de(px * k) + ' m' : de(px / 3.7795, 1) + ' mm';
  }
  document.addEventListener('pointerdown', e => {
    if (!drawMode || e.target.closest('.dock, .palette')) return;
    e.preventDefault(); e.stopPropagation(); eatClick = true;
    if (e.button === 2) { if (drawMode === 'line') { endDraw(true); say('_LINIE beendet · ' + lineCount + (lineCount === 1 ? ' Linie' : ' Linien')); } else endDraw(); return; }
    const p = pagePt(e);
    if (drawMode === 'dist') {
      if (!pts.length) { pts.push(p); rb = mk('line', { class: 'rb', x1: p[0], y1: p[1], x2: p[0], y2: p[1] }); say('_ABSTAND: Zweiten Punkt angeben'); return; }
      const a = pts[0], b = p, g = mk('g', { class: 'dm' });
      mk('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, g);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = Math.sin(ang) * 5, ny = -Math.cos(ang) * 5;
      [a, b].forEach(q => mk('line', { class: 'tk', x1: q[0] - nx + ny, y1: q[1] - ny - nx, x2: q[0] + nx - ny, y2: q[1] + ny + nx }, g));
      const t = mk('text', { x: (a[0] + b[0]) / 2 + 8, y: (a[1] + b[1]) / 2 - 8 }, g); t.textContent = distText(a, b);
      const deg = Math.round(((-ang * 180 / Math.PI) + 360) % 360);
      say('Abstand = ' + distText(a, b) + ', Winkel in XY-Ebene = ' + deg + '°, Delta X = ' + de(Math.abs(b[0] - a[0]) / 3.7795, 1) + ' mm, Delta Y = ' + de(Math.abs(b[1] - a[1]) / 3.7795, 1) + ' mm · REGEN räumt auf');
      endDraw(true);
      return;
    }
    // Linie
    const last = pts[pts.length - 1];
    pts.push(p);
    if (last) {
      mk('line', { x1: last[0], y1: last[1], x2: p[0], y2: p[1] }); lineCount++;
      if (lineCount === 3) say('Drei Linien, alle sauber im Winkel. Den Rest zeichne ich gern für Sie: ANFRAGE');
      else say('_LINIE: Nächsten Punkt angeben (' + distText(last, p) + ')');
    } else say('_LINIE: Nächsten Punkt angeben');
    if (!rb) rb = mk('line', { class: 'rb' });
    rb.setAttribute('x1', p[0]); rb.setAttribute('y1', p[1]); rb.setAttribute('x2', p[0]); rb.setAttribute('y2', p[1]);
  }, true);
  document.addEventListener('click', e => { if ((eatClick || drawMode) && !e.target.closest('.dock, .palette')) { e.preventDefault(); e.stopPropagation(); } eatClick = false; }, true);
  document.addEventListener('contextmenu', e => { if (drawMode) e.preventDefault(); }, true);
  window.addEventListener('pointermove', e => {
    if (!drawMode || !rb || !pts.length) return;
    const p = pagePt(e); rb.setAttribute('x2', p[0]); rb.setAttribute('y2', p[1]);
  }, { passive: true });
  function regen() {
    endDraw(true); clearGrips();
    if (drawSvg) { drawSvg.remove(); drawSvg = null; }
    $$('#plan .g').forEach(g => g.classList.remove('iso-dim')); update();
    say('Regenerierung abgeschlossen. ' + $$('#plan .g').length + ' Layer, 0 Fehler.');
  }

  /* ---------- Logo zerlegen ---------- */
  function explode() {
    const parts = $$('.top .logo svg > *').filter(n => n.tagName !== 'title' && n.tagName !== 'defs');
    if (!parts.length || reduceM) { say('_EXPLODE: 1 Block in ' + parts.length + ' Objekte zerlegt. Und sofort wieder zusammengesetzt.'); return; }
    parts.forEach(n => { n.style.transition = 'transform .45s cubic-bezier(.2,.7,.2,1)'; n.style.transformBox = 'fill-box'; n.style.transformOrigin = 'center'; n.style.transform = 'translate(' + (Math.random() * 60 - 30) + 'px,' + (Math.random() * 40 - 20) + 'px) rotate(' + (Math.random() * 70 - 35) + 'deg)'; });
    say('_EXPLODE: 1 Block in ' + parts.length + ' Objekte zerlegt …');
    setTimeout(() => { parts.forEach(n => { n.style.transform = ''; }); say('_EXPLODE: … und wieder zum Block zusammengesetzt. Logos bleiben besser ganz.'); }, 1100);
    setTimeout(() => parts.forEach(n => { n.style.transition = ''; }), 1700);
  }

  /* ---------- Modellbereich / Layout ---------- */
  function model(on) {
    const r = document.documentElement;
    if (on) { r.dataset.theme = 'dark'; r.dataset.model = ''; say('_MODELL: Modellbereich, schwarzer Hintergrund. LAYOUT schaltet zurück.'); }
    else { delete r.dataset.model; r.dataset.theme = 'light'; say('_LAYOUT: Papierbereich, weißes Blatt.'); }
  }

  /* ---------- _PLOT: Angebotsblatt ---------- */
  function buildPlot() {
    const M = MODES[state.mode], ps = $('#plotsheet');
    const flat = $('#flat').cloneNode(true); flat.removeAttribute('id'); flat.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    const logo = $('.top .logo svg').outerHTML;
    const rows = $('#lvbody').innerHTML;
    ps.innerHTML = '<div class="ph"><div><span class="m" style="font:500 7pt var(--mono);letter-spacing:.1em">UNVERBINDLICHE PREISÜBERSICHT</span><h1>Ihr Festpreis</h1><div>' + (state.mode === 'buero' ? 'Bestandspläne für Planungsbüros' : 'Exposé-Grundrisse für Makler') + '</div></div>' + logo + '</div>' +
      '<div class="pv"></div>' +
      '<table><thead><tr><th>Pos.</th><th>Leistung</th><th class="r">Menge</th><th>Einheit</th><th class="r">EP €</th><th class="r">GP €</th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tbody><tr class="tot"><td></td><td colspan="4">Festpreis gesamt</td><td class="r m">' + eur(state.sum) + ' €</td></tr></tbody></table>' +
      '<p class="note">Endpreis. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet. Lieferung ' + M.del + ' nach Eingang der Unterlagen, Formate ' + M.fmt + (state.on['3d'] ? M.fmt3d : '') + '. Der Festpreis gilt für Vorlagen im üblichen Umfang (' + M.lmsub + '); bei Abweichungen melde ich mich vorher.</p>' +
      '<div class="pk"><div><span>Auftragnehmer</span><b>PlavoCAD · Tomo</b></div><div><span>Kontakt</span><b>kontakt@plavocad.de</b></div><div><span>Plotdatum</span><b>' + $('#plotdate').textContent + '</b></div><div><span>Blatt</span><b>1 / 1</b></div></div>';
    ps.querySelector('.pv').appendChild(flat);
  }
  window.addEventListener('beforeprint', buildPlot);
  function plot() { buildPlot(); say('_PLOT: Angebotsblatt A4 wird an den Drucker gesendet …'); setTimeout(() => window.print(), 50); }

  /* ---------- Vollbild der Vorschau ---------- */
  const stage = $('.stage');
  function full(on) {
    stage.classList.toggle('full', on); document.body.classList.toggle('fullopen', on);
    if (on) { $('#fullclose').focus(); say('Vorschau im Vollbild. Esc oder Schließen beendet.'); }
    else { $('#plan').classList.remove('zoom'); $('#fullbtn').focus({ preventScroll: true }); }
  }
  $('#fullbtn').addEventListener('click', () => full(true));
  $('#fullclose').addEventListener('click', () => full(false));
  $('#fullzoom').addEventListener('click', () => zoom(!$('#plan').classList.contains('zoom'), true));
  $('#full3d').addEventListener('click', () => { remember(); state.on['3d'] = !state.on['3d']; update(); say(state.on['3d'] ? 'A-3D eingeschaltet' : 'A-3D ausgeschaltet'); });

  /* ---------- Touch: Pinch, Doppeltipp, Lupe, LAYISO ---------- */
  const persp = $('.persp'), tp = new Map();
  let pinch0 = 0, lastTap = 0, lastTapXY = [0, 0];
  persp.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; tp.set(e.pointerId, [e.clientX, e.clientY]); if (tp.size === 2) { const [a, b] = Array.from(tp.values()); pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  persp.addEventListener('pointermove', e => {
    if (!tp.has(e.pointerId)) return; tp.set(e.pointerId, [e.clientX, e.clientY]);
    if (tp.size === 2 && pinch0) {
      const [a, b] = Array.from(tp.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]), z = $('#plan').classList.contains('zoom');
      if (d / pinch0 > 1.25 && !z) { zoom(true, true); pinch0 = d; } else if (d / pinch0 < .8 && z) { zoom(false, true); pinch0 = d; }
    }
  });
  const tpEnd = e => {
    if (!tp.has(e.pointerId)) return; const multi = tp.size > 1 || pinch0; tp.delete(e.pointerId); if (!tp.size) pinch0 = 0;
    if (e.type !== 'pointerup' || multi) return;
    const now = performance.now();
    if (now - lastTap < 320 && Math.hypot(e.clientX - lastTapXY[0], e.clientY - lastTapXY[1]) < 30) { const z = $('#plan').classList.contains('zoom'); zoom(!z, true); lastTap = 0; }
    else { lastTap = now; lastTapXY = [e.clientX, e.clientY]; }
  };
  persp.addEventListener('pointerup', tpEnd); persp.addEventListener('pointercancel', tpEnd);

  const loupe = $('.loupe'), loupeLc = loupe.querySelector('.lc');
  $$('.planbox').forEach(box => {
    const img = box.querySelector('img'); let timer = 0, active = false;
    function place(x, y) {
      const r = img.getBoundingClientRect(), Z = 2.6, L = 132;
      const fx = Math.max(0, Math.min(1, (x - r.left) / r.width)), fy = Math.max(0, Math.min(1, (y - r.top) / r.height));
      loupe.style.left = (x - L / 2) + 'px'; loupe.style.top = Math.max(8, y - L - 48) + 'px';
      loupe.style.backgroundImage = 'url("' + img.currentSrc.replace(/"/g, '%22') + '")';
      loupe.style.backgroundSize = (r.width * Z) + 'px ' + (r.height * Z) + 'px';
      loupe.style.backgroundPosition = (L / 2 - fx * r.width * Z) + 'px ' + (L / 2 - fy * r.height * Z) + 'px';
      const [mx, my] = MODES[box.dataset.map].toM(fx, fy);
      loupeLc.textContent = 'X ' + de(mx) + '  Y ' + de(my) + ' m';
    }
    box.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || e.target.closest('.dmark')) return;
      const x = e.clientX, y = e.clientY;
      timer = setTimeout(() => { active = true; place(x, y); loupe.classList.add('show'); if (navigator.vibrate) { try { navigator.vibrate(6); } catch (er) { /* optional */ } } }, 380);
    });
    box.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (active) { e.preventDefault(); place(t.clientX, t.clientY); }
      else if (timer) { clearTimeout(timer); timer = 0; }
    }, { passive: false });
    const stop = () => { clearTimeout(timer); timer = 0; if (active) { active = false; loupe.classList.remove('show'); } };
    box.addEventListener('touchend', stop); box.addEventListener('touchcancel', stop);
    box.addEventListener('contextmenu', e => { if (active || e.pointerType === 'touch') e.preventDefault(); });
  });

  let isoId = '';
  function layiso(id) {
    const M = MODES[state.mode], l = M.layers.find(x => x.id === id);
    $$('#plan .g').forEach(g => g.classList.remove('iso-dim')); $$('#layers .lrow').forEach(r => r.classList.remove('isolated'));
    if (!l || isoId === id || !l.show.length) { isoId = ''; say(l && !l.show.length ? l.name + ' hat keine Linien in der Draufsicht.' : '_LAYUNISO: alle Layer wieder sichtbar'); return; }
    if (!state.on[id]) { say(l.name + ' ist ausgeschaltet. Erst einschalten, dann isolieren.'); return; }
    isoId = id;
    $$('#plan .g').forEach(g => { if (!l.show.includes(g.id)) g.classList.add('iso-dim'); });
    const row = $('#layers .bulb[data-l="' + id + '"]'); if (row) row.closest('.lrow').classList.add('isolated');
    say('_LAYISO: ' + l.name + ' isoliert. Nochmal lange drücken hebt es auf.');
  }
  (function () {
    const lay = $('#layers'); let t = 0, sx = 0, sy = 0;
    lay.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const row = e.target.closest('.lrow'); if (!row) return;
      const b = row.querySelector('.bulb'); sx = e.clientX; sy = e.clientY;
      t = setTimeout(() => { t = 0; b.dataset.skip = '1'; setTimeout(() => { delete b.dataset.skip; }, 700); layiso(b.dataset.l); if (navigator.vibrate) { try { navigator.vibrate(10); } catch (er) { /* optional */ } } }, 520);
    });
    lay.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(t); t = 0; } });
    ['pointerup', 'pointercancel'].forEach(ev => lay.addEventListener(ev, () => { if (t) { clearTimeout(t); t = 0; } }));
    lay.addEventListener('contextmenu', e => { if (e.target.closest('.lrow')) e.preventDefault(); });
  })();

  /* ---------- Befehlspalette (Handy) ---------- */
  const pal = $('#palette'), palbtn = $('#palbtn'), palin = $('#palin');
  pal.querySelector('.label').insertAdjacentHTML('afterend', '<span class="out" id="palout" aria-live="polite" style="font:.8rem var(--mono);color:var(--ink-2)"></span>');
  const CHIPS = ['PREIS', 'ANFRAGE', 'PROBE', 'LAYER', 'ZOOM', 'ZOOM E', '3D', 'ANSICHT', 'HILFE'];
  $('#chips').innerHTML = CHIPS.map(c => '<button type="button" data-c="' + c + '">' + c + '</button>').join('');
  function palOpen(on) { pal.hidden = !on; palbtn.setAttribute('aria-expanded', String(on)); if (on && !$('#palout').textContent) $('#palout').textContent = 'Befehl antippen oder eintippen.'; }
  palbtn.addEventListener('click', () => palOpen(pal.hidden));
  function palRun(c) {
    if (c === 'ANSICHT') c = state.mode === 'buero' ? 'makler' : 'buero';
    run(c);
    if (!/^(Befehle|Unbekannter)/.test(out.textContent)) palOpen(false);
  }
  $$('#chips button').forEach(b => b.addEventListener('click', () => palRun(b.dataset.c)));
  $('#palform').addEventListener('submit', e => { e.preventDefault(); const v = palin.value; palin.value = ''; palin.blur(); palRun(v); });
  document.addEventListener('click', e => { if (!pal.hidden && !e.target.closest('#palette, #palbtn')) palOpen(false); });

  /* ---------- Start ---------- */
  setMode(state.mode, true);
  onScroll();
  if (!reduceM) {
    const t0 = performance.now();
    const step = t => { const k = Math.min((t - t0) / 1100, 1), e = 1 - Math.pow(1 - k, 3); const v = 18 + 32 * e; cut.value = v; setX(v); if (k < 1) requestAnimationFrame(step); };
    setX(18); setTimeout(() => requestAnimationFrame(step), 350);
  } else setX(50);
})();
