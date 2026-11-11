/* PlavoCAD Startseite: Vorher/Nachher-Regler, Beispiel-Reiter, Preisrechner mit Liefertermin, Upload und Versand.
   Sendet nur, wenn Sie bestellen: an /api/bestellung (Cloudflare Worker), sonst nichts. Speichert nichts. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const de = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const eur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const reduceM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const WA = '491723136117';
  const PHONE = '0172 313 61 17';

  /* ---------- Maßketten ---------- */
  function dim(el, segs) {
    let h = '<span class="ln"></span>', x = 0; const t = [0];
    segs.forEach(s => { x += s.w; t.push(x); });
    t.forEach(p => { h += '<span class="tk" style="left:' + p * 100 + '%"></span>'; });
    x = 0; segs.forEach(s => { if (s.t) h += '<span class="tx" style="left:' + (x + s.w / 2) * 100 + '%">' + s.t + '</span>'; x += s.w; });
    el.innerHTML = h;
  }
  const hy = $('#hy');
  if (hy) hy.innerHTML = '<span class="ln"></span><span class="tk" style="top:0"></span><span class="tk" style="top:100%"></span><span class="tx">9,65</span>';
  const fd = $('#flowdim');
  if (fd) dim(fd, [{ w: .25, t: 'Pläne senden' }, { w: .25, t: 'am selben Tag' }, { w: .25, t: '48 Stunden' }, { w: .25, t: 'Rechnung danach' }]);

  /* ---------- Vorher/Nachher ---------- */
  $$('.cmp').forEach(c => {
    const r = $('input', c), hero = c.id === 'cmp-hero', hx = $('#hx');
    const set = v => {
      c.style.setProperty('--x', v + '%');
      if (hero && hx) { const f = v / 100; dim(hx, f > .08 && f < .92 ? [{ w: f, t: de(13.6 * f) }, { w: 1 - f, t: de(13.6 * (1 - f)) }] : [{ w: 1, t: '13,60' }]); }
    };
    r.addEventListener('input', () => set(+r.value));
    if (hero && !reduceM) {
      const t0 = performance.now();
      const step = t => { const k = Math.min((t - t0) / 1200, 1), v = 14 + 32 * (1 - Math.pow(1 - k, 3)); r.value = v; set(v); if (k < 1) requestAnimationFrame(step); };
      set(14); setTimeout(() => requestAnimationFrame(step), 400);
    } else set(+r.value);
  });

  /* ---------- Reiter Beispiele ---------- */
  const tabs = $$('[role="tab"]');
  function sel(t, focus) {
    tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; });
    if (focus) t.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => sel(t));
    t.addEventListener('keydown', e => {
      const j = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (j !== undefined) { e.preventDefault(); sel(tabs[j], true); }
    });
  });

  /* ---------- Startaktion, Plotdatum ---------- */
  const aktionAus = now > new Date('2027-01-31T23:59:59');
  if (aktionAus) { $('#aktion').hidden = true; $('#o-ak-wrap').hidden = true; $('#o-ak').checked = false; }

  /* ---------- Preisrechner ---------- */
  const f = $('#order');
  const val = n => f.elements[n];
  const chk = id => $('#' + id).checked;
  const num = (id, lo, hi) => { const v = Math.round(+$('#' + id).value); return Math.min(hi, Math.max(lo, isFinite(v) && v > 0 ? v : lo)); };
  const typ = () => f.querySelector('input[name="typ"]:checked').value;
  const TYPN = { wohnung: 'Wohnung', haus: 'Haus', gewerbe: 'Gewerbe', bestand: 'Ganzer Bestand' };

  function calc() {
    const t = typ(), L = [];
    let total = 0, units = 1, workdays = 2, etappen = null, pkg = false, free = 35;
    const add = (label, amount) => { L.push([label, amount]); total += amount; };
    const fl = chk('o-fl'), d3 = chk('o-3d'), ds = chk('o-ds');
    if (t === 'haus') {
      const w = num('ebenen', 1, 6), k = chk('keller') ? 1 : 0, d = chk('dach') ? 1 : 0, all = w + k + d;
      const single = 25 + (w - 1) * 20 + (k + d) * 15 + (fl ? 15 : 0);
      const paket = 69 + Math.max(0, all - 3) * 20;
      if (paket <= single) {
        pkg = true;
        add('Haus-Paket · ' + all + (all === 1 ? ' Ebene' : ' Ebenen') + ' inkl. Flächen', paket);
      } else {
        add('Grundriss 1. Ebene', 25);
        if (w > 1) add((w - 1) + ' × weitere Wohnebene', (w - 1) * 20);
        if (k + d) add((k ? 'Keller' : '') + (k && d ? ' + ' : '') + (d ? 'Dachboden' : ''), (k + d) * 15);
        if (fl) add('Flächenaufstellung Haus', 15);
      }
      if (d3) add('3D-Ansicht · ' + w + ' × 25 €', w * 25);
      if (ds) add('Dachschrägen · ' + w + ' × 10 €', w * 10);
      if (all > 3) workdays = 3;
    } else {
      units = num('menge', 1, 500);
      const e = t === 'wohnung' && chk('maisonette') ? 2 : 1;
      const base = t === 'gewerbe' ? 35 : 25 + (e - 1) * 20;
      const per = base + (fl ? 10 : 0);
      const rab = units >= 20 ? 8 : units >= 5 ? 5 : 0;
      free = per - rab;
      const nm = t === 'gewerbe' ? 'Gewerbeeinheit' : (e === 2 ? 'Maisonette' : 'Wohnung');
      add(units + ' × ' + nm + (fl ? ' inkl. Flächen' : '') + ' à ' + eur(per).replace(',00', ''), units * per);
      if (rab) add('Mengenpreis ab ' + (rab === 8 ? 20 : 5) + ' Stück · ' + units + ' × − ' + rab + ' €', -units * rab);
      if (d3) add('3D-Ansicht · ' + units * e + ' × 25 €', units * e * 25);
      if (ds) add('Dachschrägen · ' + units * e + ' × 10 €', units * e * 10);
      if (units > 5 || t === 'bestand') etappen = units;
      else if (units > 3) workdays = 3;
    }
    const exOk = (t === 'haus' || units <= 3) && t !== 'bestand';
    $('#o-ex').disabled = !exOk; if (!exOk) $('#o-ex').checked = false;
    if (chk('o-ex')) { add('Express in 24 h', 15); workdays = 1; }
    if (chk('o-sk')) add('Vorlage nur Handskizze', 10);
    if (!aktionAus && chk('o-ak')) add('Startaktion · erste ' + (t === 'haus' ? 'Ebene inkl. Flächen' : t === 'gewerbe' ? 'Einheit' : 'Wohnung') + ' gratis', -Math.min(free, total));
    // Flächen-Preis im Extra anzeigen
    $('#o-fl-p').textContent = t === 'haus' ? (pkg ? 'im Paket' : '+ 15 €') : '+ 10 € je WE';
    return { t, L, total: Math.max(0, total), units, workdays, etappen, pkg };
  }

  /* Liefertermin: Werktage ab Eingang, Eingang bis 12 Uhr zählt ab heute */
  const isWd = d => d.getDay() % 6 !== 0;
  function addWd(start, n) { const d = new Date(start); while (n > 0) { d.setDate(d.getDate() + 1); if (isWd(d)) n--; } return d; }
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const fmt = d => WD[d.getDay()] + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.';
  function termin(r) {
    const base = (!isWd(new Date()) || new Date().getHours() >= 12) ? nextWd() : today12();
    if (r.etappen) {
      const pilot = addWd(base, 2), weeks = Math.ceil(Math.max(0, r.etappen - 1) / 5);
      const end = addWd(pilot, weeks * 5);
      return { main: 'Pilot bis ' + fmt(pilot), hint: 'Danach ca. 5 Wohnungen pro Woche, komplett etwa bis ' + fmt(end) + ' Den genauen Plan bekommen Sie mit der Bestätigung.', text: 'Die Pilotwohnung kommt bis ' + fmt(pilot) + ', der Rest in Etappen, komplett etwa bis ' + fmt(end) };
    }
    const d = addWd(base, r.workdays);
    return { main: fmt(d) + ', 18 Uhr', hint: (r.workdays === 1 ? 'Express: ein Werktag' : r.workdays + ' Werktage') + ' ab Eingang der Unterlagen' + (base.getDate() === new Date().getDate() ? ' (Eingang heute vor 12 Uhr).' : ' (gezählt ab nächstem Werktag).'), text: 'Der Grundriss kommt bis ' + fmt(d) + ' 18 Uhr' };
  }
  function today12() { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }
  function nextWd() { const d = today12(); do { d.setDate(d.getDate() + 1); } while (!isWd(d)); return d; }

  let last = null;
  function render() {
    const t = typ();
    $('#cfg-menge').hidden = t === 'haus';
    $('#cfg-haus').hidden = t !== 'haus';
    $('#o-mais').hidden = t !== 'wohnung';
    $('#menge-l').textContent = t === 'gewerbe' ? 'Anzahl Einheiten' : 'Anzahl Wohnungen';
    $('#menge-h').textContent = t === 'bestand' ? 'Lieferung in Etappen, Pilotwohnung vorab.' : 'Ab 5 Stück gilt der Mengenpreis.';
    $('#o-ak-wrap').hidden = aktionAus || t === 'bestand';
    if (t === 'bestand') $('#o-ak').checked = false;
    const r = calc(); last = r; last.term = termin(r);
    $('#sum-typ').textContent = TYPN[t];
    const ex = $$('#extras input[name="opt"]').filter(x => x.checked && !x.disabled).map(x => x.value);
    $('#ex-sum').textContent = ex.length ? ex.join(', ') : 'keine';
    $('#sum-lines').innerHTML = r.L.map(([l, a]) => '<li class="flex justify-between gap-3"><span class="text-ink2">' + l + '</span><span class="whitespace-nowrap' + (a < 0 ? ' text-ok' : '') + '">' + (a < 0 ? '− ' + eur(-a) : eur(a)) + '</span></li>').join('') +
      '<li class="flex justify-between gap-3"><span class="text-ink2">' + (chk('o-mb') ? 'Möbliert' : 'Ohne Möbel') + '</span><span class="text-muted">inkl.</span></li>';
    $('#sum-total').textContent = eur(r.total);
    $('#sum-date').textContent = last.term.main;
    $('#sum-date-h').textContent = last.term.hint;
    const anfrage = t === 'bestand';
    $('#send-t').textContent = r.total === 0 ? 'Gratis-Wohnung anfordern' : anfrage ? 'Unverbindlich anfragen' : 'Jetzt bestellen';
    mbar();
  }
  // Grundeinstellung je Objektart (Bestand: ohne Möbel, mehr Wohnungen)
  $$('input[name="typ"]').forEach(x => x.addEventListener('change', () => {
    if (x.value === 'bestand') { $('#o-mb').checked = false; if (+$('#menge').value < 5) $('#menge').value = 12; }
    else if (x.value !== 'gewerbe') { $('#o-mb').checked = true; if (+$('#menge').value >= 5 && x.value === 'wohnung') $('#menge').value = 1; }
    render();
  }));
  f.addEventListener('change', e => { if (e.target.name !== 'typ' && e.target.type !== 'file') render(); });
  ['menge', 'ebenen'].forEach(id => $('#' + id).addEventListener('input', render));
  ['menge', 'ebenen'].forEach(id => $('#' + id).addEventListener('blur', () => { const el = $('#' + id); el.value = num(id, +el.min, +el.max); render(); }));
  $$('[data-step]').forEach(b => b.addEventListener('click', () => {
    const el = $('#' + b.dataset.step); el.value = Math.min(+el.max, Math.max(+el.min, (+el.value || 0) + +b.dataset.d));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }));

  /* Sprünge zum Formular, optional mit Objektart */
  $$('[data-go]').forEach(a => a.addEventListener('click', e => {
    if (a.id === 'mbar-go' && inForm) { e.preventDefault(); submit(); return; }
    const ty = a.dataset.typ;
    if (ty) { const r = f.querySelector('input[name="typ"][value="' + ty + '"]'); if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
  }));

  /* ---------- Upload ---------- */
  const MAX_FILES = 10, MAX_TOTAL = 20 * 1024 * 1024, OK = /\.(pdf|jpe?g|png|heic|heif|webp)$/i;
  let files = [];
  const drop = $('#drop'), input = $('#files'), list = $('#filelist');
  const kb = n => n > 1048576 ? de(n / 1048576, 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function addFiles(fl) {
    const msg = [];
    Array.from(fl).forEach(x => {
      if (!OK.test(x.name)) { msg.push(x.name + ': Format nicht unterstützt'); return; }
      if (files.length >= MAX_FILES) { msg.push('Höchstens 10 Dateien'); return; }
      if (files.reduce((s, y) => s + y.size, 0) + x.size > MAX_TOTAL) { msg.push(x.name + ': zusammen mehr als 20 MB'); return; }
      if (!files.some(y => y.name === x.name && y.size === x.size)) files.push(x);
    });
    showFiles(msg);
  }
  function showFiles(msg = []) {
    list.innerHTML = '';
    files.forEach((x, i) => {
      const li = document.createElement('li');
      li.className = 'flex items-center gap-3 border border-rule bg-sheet p-2';
      const th = document.createElement('span');
      th.className = 'w-12 h-12 flex-none grid place-items-center bg-hair font-mono text-[.66rem] text-muted overflow-hidden';
      if (/^image\/(jpeg|png|webp)$/.test(x.type)) { const im = new Image(); im.alt = ''; im.className = 'w-full h-full object-cover'; im.src = URL.createObjectURL(x); im.onload = () => URL.revokeObjectURL(im.src); th.appendChild(im); }
      else th.textContent = (x.name.split('.').pop() || '').toUpperCase();
      const nm = document.createElement('span'); nm.className = 'grow min-w-0'; nm.innerHTML = '<b class="block truncate text-[.9rem]"></b><span class="font-mono text-[.74rem] text-muted"></span>';
      nm.firstChild.textContent = x.name; nm.lastChild.textContent = kb(x.size);
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'w-11 h-11 grid place-items-center font-mono text-lg text-muted hover:text-warn'; rm.textContent = '✕'; rm.setAttribute('aria-label', x.name + ' entfernen');
      rm.addEventListener('click', () => { files.splice(i, 1); showFiles(); });
      li.append(th, nm, rm); list.appendChild(li);
    });
    msg.forEach(m => { const li = document.createElement('li'); li.className = 'text-[.85rem] text-warn'; li.textContent = m; list.appendChild(li); });
  }
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  // Dateien, die neben das Feld fallen, nicht im Browser öffnen
  window.addEventListener('dragover', e => { if (!e.target.closest || !e.target.closest('#drop')) e.preventDefault(); });
  window.addEventListener('drop', e => { if (!e.target.closest || !e.target.closest('#drop')) e.preventDefault(); });

  /* ---------- E-Mail-Tippfehler ---------- */
  const DOM = ['gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 't-online.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'posteo.de', 'freenet.de', 'online.de', 'ionos.de'];
  const lev = (a, b) => { const t = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) t[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i][j] = Math.min(t[i - 1][j] + 1, t[i][j - 1] + 1, t[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return t[a.length][b.length]; };
  $('#f-mail').addEventListener('blur', () => {
    const m = /^([^@\s]+)@([^@\s]+)$/.exec($('#f-mail').value.trim()), hint = $('#f-mail-fix');
    hint.hidden = true; if (!m || DOM.includes(m[2].toLowerCase())) return;
    let best = '', bd = 3; DOM.forEach(d => { const v = lev(m[2].toLowerCase(), d); if (v < bd) { bd = v; best = d; } });
    if (best && bd <= 2) { hint.innerHTML = 'Meinten Sie <button type="button" class="underline font-semibold"></button>?'; const b = hint.querySelector('button'); b.textContent = m[1] + '@' + best; b.addEventListener('click', () => { $('#f-mail').value = b.textContent; hint.hidden = true; }); hint.hidden = false; }
  });

  /* ---------- WhatsApp-Links mit passendem Text ---------- */
  function waText() {
    const r = last || calc(), t = TYPN[r.t];
    return 'Hallo Tomo, ich möchte einen Grundriss bestellen (' + t + (r.t !== 'haus' ? ', ' + r.units + ' Stück' : '') + ').\nObjekt/Adresse: \nMeine E-Mail für die Lieferung: \nFotos vom Plan hänge ich an.';
  }
  $$('[data-wa]').forEach(a => a.addEventListener('click', () => { a.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(waText()); }));

  /* ---------- Absenden ---------- */
  const send = $('#send'), msgEl = $('#msg');
  function invalid() {
    const bad = [];
    [['#f-mail', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())]].forEach(([s, ok]) => {
      const el = $(s), b = !ok(el.value); el.classList.toggle('bad', b); el.setAttribute('aria-invalid', b); if (b) bad.push(el);
    });
    return bad;
  }
  ['#f-name', '#f-mail'].forEach(s => $(s).addEventListener('input', () => { $(s).classList.remove('bad'); $(s).removeAttribute('aria-invalid'); }));
  function summaryText(r) {
    return r.L.map(([l, a]) => l + ': ' + (a < 0 ? '− ' + eur(-a) : eur(a))).join('\n') + '\nGesamt: ' + eur(r.total);
  }
  async function submit() {
    msgEl.textContent = '';
    const bad = invalid();
    if (bad.length) { msgEl.textContent = 'Bitte eine gültige E-Mail-Adresse eintragen, damit der Grundriss bei Ihnen ankommt.'; bad[0].focus(); return; }
    const r = last || calc();
    const fd = new FormData(f);
    fd.delete('plaene'); files.forEach(x => fd.append('plaene', x, x.name));
    fd.set('art', r.total === 0 ? 'gratis' : r.t === 'bestand' ? 'anfrage' : 'bestellung');
    fd.set('typ', TYPN[r.t]); fd.set('menge', r.t === 'haus' ? '1' : String(r.units));
    if (r.t === 'haus') { fd.set('ebenen', String(num('ebenen', 1, 6))); fd.set('nebenebenen', [chk('keller') && 'Keller', chk('dach') && 'Dachboden'].filter(Boolean).join(', ') || 'keine'); }
    fd.set('preis', eur(r.total)); fd.set('positionen', summaryText(r)); fd.set('termin', r.term.main);
    send.disabled = true; $('#send-t').textContent = files.length ? 'Pläne werden hochgeladen …' : 'Wird gesendet …';
    try {
      const res = await fetch('/api/bestellung', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      let j = null; try { j = await res.json(); } catch (e) { /* keine JSON-Antwort */ }
      if (!res.ok || !j || !j.ok) {
        if (j && j.error && res.status < 500) { msgEl.textContent = j.error; send.disabled = false; render(); return; }
        throw new Error('server');
      }
      f.hidden = true;
      $('#done-nr').textContent = j.nr || '–';
      $('#done-text').textContent = r.term.text + ' an ' + $('#f-mail').value.trim() + '. ' + (files.length ? '' : 'Bitte schicken Sie die Pläne noch per E-Mail oder WhatsApp. ') + 'Fehlt etwas, melde ich mich heute noch.';
      $('#done').hidden = false; $('#done').focus(); $('#done').scrollIntoView({ behavior: reduceM ? 'auto' : 'smooth', block: 'center' });
    } catch (e) {
      // Ersatzweg: vorbereitete E-Mail
      const body = 'Hallo Tomo,\n\nich möchte bestellen:\n\n' + summaryText(r) + '\nTermin laut Website: ' + r.term.main + '\n\nName: ' + $('#f-name').value + '\nFirma: ' + $('#f-firma').value + '\nE-Mail: ' + $('#f-mail').value + '\nTelefon: ' + $('#f-tel').value + '\nObjekt: ' + $('#f-obj').value + '\n\n' + $('#f-text').value + '\n\n(Pläne hänge ich an.)';
      $('#fb-mail').href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Bestellung Grundriss – ' + ($('#f-firma').value || $('#f-name').value)) + '&body=' + encodeURIComponent(body);
      $('#fallback').hidden = false; $('#fallback').focus();
      send.disabled = false; render();
    }
  }
  f.addEventListener('submit', e => { e.preventDefault(); submit(); });

  /* ---------- Mobile Leiste ---------- */
  let inForm = false;
  function mbar() {
    const t = $('#mbar-t'); if (!t || !last) return;
    t.textContent = inForm ? (last.total === 0 ? 'Gratis anfordern' : last.t === 'bestand' ? 'Anfragen' : 'Bestellen · ' + eur(last.total).replace(',00', '')) : 'Pläne hochladen';
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { es.forEach(e => { inForm = e.isIntersecting && !f.hidden; mbar(); }); }, { rootMargin: '-30% 0px -30% 0px' }).observe(f);
  }
  if (matchMedia('(min-width: 1024px)').matches) $('#extras').open = true;
  render();

  /* ---------- Anfrage Bestand (Verwaltungen) ---------- */
  const hf = $('#hvform');
  if (hf) {
    const n = id => { const el = $('#' + id), v = Math.round(+el.value); return Math.min(+el.max, Math.max(+el.min, isFinite(v) && v > 0 ? v : +el.min)); };
    let hv = null;
    function hvCalc() {
      const we = n('hw'), hs = n('hh'), gs = n('hg'), L = [];
      const rab = we >= 20 ? 8 : we >= 5 ? 5 : 0, per = 35 - rab;
      L.push([we + ' × Wohnung inkl. Flächen à ' + per + ' €', we * per]);
      if ($('#hth').checked) L.push(['Treppenhaus · ' + hs * gs + ' Geschosse × 15 €', hs * gs * 15]);
      if ($('#hke').checked) L.push(['Keller · ' + hs + ' × 15 €', hs * 15]);
      const total = L.reduce((x, y) => x + y[1], 0);
      const base = (!isWd(new Date()) || new Date().getHours() >= 12) ? nextWd() : today12();
      const pilot = addWd(base, 2), months = Math.ceil(we / 20);
      hv = { we, hs, gs, L, total, pilot, months };
      $('#hv-lines').innerHTML = L.map(([l, a]) => '<li class="flex justify-between gap-3"><span class="text-ink2">' + l + '</span><span class="whitespace-nowrap">' + eur(a) + '</span></li>').join('') +
        (rab ? '<li class="text-[.78rem] text-ok">Mengenpreis ab ' + (rab === 8 ? 20 : 5) + ' Wohnungen: − ' + rab + ' € je Wohnung</li>' : '');
      $('#hv-total').textContent = eur(total);
      $('#hv-plan').textContent = months <= 1 ? 'in ca. ' + Math.max(1, Math.ceil(Math.max(0, we - 1) / 5)) + (Math.ceil(Math.max(0, we - 1) / 5) > 1 ? ' Wochen' : ' Woche') : 'über ca. ' + months + ' Monate';
      $('#hv-plan-h').textContent = 'Pilotwohnung bis ' + fmt(pilot) + ', danach ca. 5 Wohnungen pro Woche (bis ca. 20 im Monat).';
    }
    hf.addEventListener('input', hvCalc); hf.addEventListener('change', hvCalc);
    $('#hf').addEventListener('change', () => { const fl = Array.from($('#hf').files || []); $('#hf-n').textContent = fl.length ? fl.length + (fl.length === 1 ? ' Datei: ' : ' Dateien: ') + fl.map(x => x.name).join(', ') : 'keine ausgewählt'; });
    ['hh', 'hw', 'hg'].forEach(id => $('#' + id).addEventListener('blur', () => { $('#' + id).value = n(id); hvCalc(); }));
    hvCalc();
    hf.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('#hm'), msg = $('#hv-msg'); msg.textContent = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.value.trim())) { m.classList.add('bad'); msg.textContent = 'Bitte eine gültige E-Mail-Adresse eintragen.'; m.focus(); return; }
      m.classList.remove('bad');
      const fhv = Array.from($('#hf').files || []);
      if (fhv.length > 10 || fhv.reduce((x, y) => x + y.size, 0) > 20 * 1024 * 1024) { msg.textContent = 'Bitte höchstens 10 Dateien und zusammen 20 MB.'; return; }
      const fd = new FormData(hf);
      const pos = hv.L.map(([l, a]) => l + ': ' + eur(a)).join('\n') + '\nRichtpreis: ' + eur(hv.total);
      fd.set('art', 'anfrage'); fd.set('typ', 'Bestand (Verwaltung)'); fd.set('positionen', pos); fd.set('preis', eur(hv.total));
      fd.set('termin', 'Pilot bis ' + fmt(hv.pilot) + ', ' + $('#hv-plan').textContent);
      const btn = $('#hv-send'); btn.disabled = true; $('#hv-send-t').textContent = 'Wird gesendet …';
      try {
        const res = await fetch('/api/bestellung', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
        let j = null; try { j = await res.json(); } catch (er) { /* keine JSON-Antwort */ }
        if (!res.ok || !j || !j.ok) { if (j && j.error && res.status < 500) { msg.textContent = j.error; btn.disabled = false; $('#hv-send-t').textContent = 'Angebot anfordern'; return; } throw new Error('server'); }
        hf.hidden = true; $('#hv-nr').textContent = j.nr || '–'; $('#hv-done').hidden = false; $('#hv-done').focus();
      } catch (er) {
        const body = 'Hallo Tomo,\n\nbitte um ein Angebot für unseren Bestand:\n\n' + pos + '\nHäuser: ' + hv.hs + ', Geschosse je Haus: ' + hv.gs + '\nUnterlagen: ' + $('#hu').value + '\nBenennung: ' + $('#hb').value + '\nAbrechnung: ' + $('#ha').value + '\nWunschtermin: ' + $('#ht').value + '\n\n' + $('#hx2').value + '\n\n' + $('#hn').value + '\n' + $('#hfi').value + '\n' + $('#hp').value;
        $('#hv-fb-mail').href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Angebot Bestand – ' + ($('#hfi').value || $('#hn').value || m.value)) + '&body=' + encodeURIComponent(body);
        $('#hv-fallback').hidden = false; $('#hv-fallback').focus();
        btn.disabled = false; $('#hv-send-t').textContent = 'Angebot anfordern';
      }
    });
  }
})();
