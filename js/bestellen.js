/* PlavoCAD – Bestellseite: drei Schritte, Preis und Liefertermin laufen mit, Upload und Versand.
   Sendet nur beim Bestellen an /api/bestellung. Speichert nichts im Browser. Braucht preise.js und basis.js. */
(() => {
  'use strict';
  const { $, $$ } = window.PC;
  const f = $('#order'); if (!f) return;
  const reduceM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WA = '491723136117';
  const TYPN = { wohnung: 'Wohnung', haus: 'Haus', gewerbe: 'Gewerbe' };
  const chk = id => $('#' + id).checked;
  const typ = () => f.querySelector('input[name="typ"]:checked').value;
  const eingabe = () => ({ typ: typ(), menge: $('#menge').value, maisonette: chk('maisonette'), ebenen: $('#ebenen').value, keller: chk('keller'), dach: chk('dach'),
    fl: chk('o-fl'), mb: chk('o-mb'), d3: chk('o-3d'), ds: chk('o-ds'), ex: chk('o-ex') && !$('#o-ex').disabled, sk: chk('o-sk'), aktion: chk('o-ak') });

  /* ---------- Rechnen und anzeigen ---------- */
  let last = null;
  function render() {
    const C = PC.C, t = typ(), j = PC.jetzt(), ak = pcAktion(C, j), P = C.preise;
    $('#cfg-menge').hidden = t === 'haus';
    $('#cfg-haus').hidden = t !== 'haus';
    $('#o-mais').hidden = t !== 'wohnung';
    $('#menge-l').textContent = t === 'gewerbe' ? 'Anzahl Einheiten' : 'Anzahl Wohnungen';
    $('#o-ak-wrap').hidden = !ak.aktiv; if (!ak.aktiv) $('#o-ak').checked = false;
    let r = pcBestellung(eingabe(), C, j);
    if (!r.exOk && chk('o-ex')) { $('#o-ex').checked = false; r = pcBestellung(eingabe(), C, j); }
    $('#o-ex').disabled = !r.exOk;
    last = r;
    $('#o-fl-p').textContent = t === 'haus' ? (r.pkg ? 'im Paket' : '+ ' + pcKurz(P.flaechenHaus)) : '+ ' + pcKurz(P.flaechen) + ' je WE';
    $('#sum-typ').textContent = TYPN[t];
    $('#sum-lines').innerHTML = r.L.map(([l, a]) => '<li class="flex justify-between gap-3"><span class="text-ink2">' + l + '</span><span class="whitespace-nowrap' + (a < 0 ? ' text-ok' : '') + '">' + pcEur(a) + '</span></li>').join('') +
      '<li class="flex justify-between gap-3"><span class="text-ink2">' + (r.moebliert ? 'Möbliert' : 'Ohne Möbel') + '</span><span class="text-muted">inkl.</span></li>';
    $('#sum-total').textContent = pcEur(r.total);
    $('#sum-date').textContent = r.termin.kurz;
    $('#sum-date-h').textContent = r.termin.hinweis;
    $('#mbar-preis').textContent = pcEur(r.total);
    $('#mbar-datum').textContent = 'fertig ' + r.termin.kurz;
    const sendT = r.total === 0 ? 'Gratis-Wohnung anfordern' : 'Jetzt bestellen';
    $$('[data-senden-t]').forEach(x => { x.textContent = sendT; });
    $('#mbar-t').textContent = schritt === 3 ? (r.total === 0 ? 'Gratis anfordern' : 'Jetzt bestellen') : schritt === 1 ? 'Weiter zum Objekt' : 'Weiter zum Kontakt';
  }
  f.addEventListener('change', e => { if (e.target.type !== 'file') render(); });
  ['menge', 'ebenen'].forEach(id => {
    $('#' + id).addEventListener('input', render);
    $('#' + id).addEventListener('blur', () => { const el = $('#' + id); el.value = pcZahl(el.value, +el.min, +el.max); render(); });
  });
  document.addEventListener('pc:konfig', render);

  /* ---------- Schritte ---------- */
  let schritt = 1, weit = 1;
  const felder = $$('[data-schritt]'), knoepfe = $$('#schritte [data-zu]');
  function zeige(n, opts = {}) {
    schritt = Math.min(3, Math.max(1, n)); weit = Math.max(weit, schritt);
    felder.forEach(x => { x.hidden = +x.dataset.schritt !== schritt; });
    knoepfe.forEach(b => {
      const k = +b.dataset.zu;
      if (k === schritt) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.toggleAttribute('data-fertig', k < schritt);
      b.disabled = k > weit;
    });
    render();
    if (opts.push) history.pushState({ schritt }, '', '#schritt-' + schritt);
    if (opts.fokus) {
      const h = $('h2', felder[schritt - 1]);
      $('#schritte').scrollIntoView({ behavior: reduceM ? 'auto' : 'smooth', block: 'start' });
      if (h) h.focus({ preventScroll: true });
    }
  }
  const weiter = () => { if (schritt < 3) zeige(schritt + 1, { push: true, fokus: true }); else submit(); };
  $$('[data-weiter]').forEach(b => b.addEventListener('click', weiter));
  $$('[data-zurueck]').forEach(b => b.addEventListener('click', () => zeige(schritt - 1, { push: true, fokus: true })));
  knoepfe.forEach(b => b.addEventListener('click', () => { if (+b.dataset.zu <= weit) zeige(+b.dataset.zu, { push: true, fokus: true }); }));
  $('#mbar-go').addEventListener('click', weiter);
  window.addEventListener('popstate', e => zeige(e.state && e.state.schritt ? e.state.schritt : 1));
  // Enter in einem Textfeld springt weiter statt abzusenden
  f.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && schritt < 3) { e.preventDefault(); weiter(); } });

  // Objektart aus dem Link übernehmen (?typ=haus)
  const want = new URLSearchParams(location.search).get('typ');
  if (TYPN[want]) { const r = f.querySelector('input[name="typ"][value="' + want + '"]'); if (r) r.checked = true; }

  /* ---------- Upload ---------- */
  const MAX_FILES = 10, MAX_TOTAL = 20 * 1024 * 1024, OK = /\.(pdf|jpe?g|png|heic|heif|webp)$/i;
  let files = [];
  const drop = $('#drop'), input = $('#files'), list = $('#filelist');
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
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
  const mailEl = $('#f-mail');
  mailEl.addEventListener('blur', () => {
    const m = /^([^@\s]+)@([^@\s]+)$/.exec(mailEl.value.trim()), hint = $('#f-mail-fix');
    hint.hidden = true; if (!m || DOM.includes(m[2].toLowerCase())) return;
    let best = '', bd = 3; DOM.forEach(d => { const v = lev(m[2].toLowerCase(), d); if (v < bd) { bd = v; best = d; } });
    if (best && bd <= 2) { hint.innerHTML = 'Meinten Sie <button type="button" class="underline font-semibold"></button>?'; const b = hint.querySelector('button'); b.textContent = m[1] + '@' + best; b.addEventListener('click', () => { mailEl.value = b.textContent; hint.hidden = true; }); hint.hidden = false; }
  });
  mailEl.addEventListener('input', () => { mailEl.classList.remove('bad'); mailEl.removeAttribute('aria-invalid'); });

  /* ---------- WhatsApp als zweiter Weg ---------- */
  $$('[data-wa]').forEach(a => a.addEventListener('click', () => {
    const r = last, t = TYPN[r.typ];
    a.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hallo Tomo, ich möchte einen Grundriss bestellen (' + t + (r.typ !== 'haus' ? ', ' + r.units + ' Stück' : '') + ').\nObjekt/Adresse: \nMeine E-Mail für die Lieferung: \nFotos vom Plan hänge ich an.');
  }));

  /* ---------- Absenden ---------- */
  const msgEl = $('#msg');
  let sendet = false;
  function sperren(an, text) {
    sendet = an;
    $$('[data-senden], #mbar-go').forEach(b => { b.disabled = an; });
    if (text) { $$('[data-senden-t]').forEach(x => { x.textContent = text; }); $('#mbar-t').textContent = text; }
  }
  async function submit() {
    if (sendet) return;
    msgEl.textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailEl.value.trim())) {
      mailEl.classList.add('bad'); mailEl.setAttribute('aria-invalid', 'true');
      msgEl.textContent = 'Bitte eine gültige E-Mail-Adresse eintragen, damit der Grundriss bei Ihnen ankommt.';
      if (schritt !== 3) zeige(3, { push: true });
      mailEl.focus(); return;
    }
    const r = last;
    const fd = new FormData(f);
    fd.delete('plaene'); files.forEach(x => fd.append('plaene', x, x.name));
    sperren(true, files.length ? 'Pläne werden hochgeladen …' : 'Wird gesendet …');
    try {
      const res = await fetch('/api/bestellung', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      let j = null; try { j = await res.json(); } catch (e) { /* keine JSON-Antwort */ }
      if (!res.ok || !j || !j.ok) {
        if (j && j.error && res.status < 500) { msgEl.textContent = j.error; sperren(false); render(); return; }
        throw new Error('server');
      }
      f.hidden = true; $('#schritte').hidden = true; $('#mbar').hidden = true;
      $('#done-nr').textContent = j.nr || '–';
      $('#done-text').textContent = r.termin.satz + ' an ' + mailEl.value.trim() + '. ' + (files.length ? '' : 'Bitte schicken Sie die Pläne noch per E-Mail an kontakt@plavocad.de. ') + 'Fehlt etwas, melde ich mich.';
      $('#done').hidden = false; $('#done').focus(); $('#done').scrollIntoView({ behavior: reduceM ? 'auto' : 'smooth', block: 'start' });
    } catch (e) {
      // Ersatzweg: vorbereitete E-Mail
      const body = 'Hallo Tomo,\n\nich möchte bestellen:\n\n' + pcZeilen(r.L, r.total) + '\nTermin laut Website: ' + r.termin.kurz + '\n\nName: ' + $('#f-name').value + '\nFirma: ' + $('#f-firma').value + '\nE-Mail: ' + mailEl.value + '\nTelefon: ' + $('#f-tel').value + '\nObjekt: ' + $('#f-obj').value + '\n\n' + $('#f-text').value + '\n\n(Pläne hänge ich an.)';
      $('#fb-mail').href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Bestellung Grundriss – ' + ($('#f-firma').value || $('#f-name').value)) + '&body=' + encodeURIComponent(body);
      $('#fallback').hidden = false; $('#fallback').focus();
      sperren(false); render();
    }
  }
  f.addEventListener('submit', e => { e.preventDefault(); submit(); });

  history.replaceState({ schritt: 1 }, '', location.pathname + location.search);
  zeige(1);
})();
