/* PlavoCAD – Seite für Hausverwaltungen: Richtpreis mit Lieferplan und Anfrage.
   Sendet nur beim Absenden an /api/bestellung. Speichert nichts im Browser. Braucht preise.js und basis.js. */
(() => {
  'use strict';
  const { $, $$ } = window.PC;
  const hf = $('#hvform'); if (!hf) return;
  const eingabe = () => ({ wohnungen: $('#hw').value, haeuser: $('#hh').value, geschosse: $('#hg').value, treppenhaus: $('#hth').checked, keller: $('#hke').checked });
  let hv = null;
  function rechne() {
    hv = pcBestand(eingabe(), PC.C, PC.jetzt());
    $('#hv-lines').innerHTML = hv.L.map(([l, a]) => '<li class="flex justify-between gap-3"><span class="text-ink2">' + l + '</span><span class="whitespace-nowrap">' + pcEur(a) + '</span></li>').join('') +
      (hv.rabatt ? '<li class="text-[.78rem] text-ok">Mengenpreis ab ' + hv.rabattAb + ' Wohnungen: − ' + pcKurz(hv.rabatt) + ' je Wohnung</li>' : '');
    $('#hv-total').textContent = pcEur(hv.total);
    $('#hv-plan').textContent = hv.plan;
    $('#hv-plan-h').textContent = hv.planHinweis;
  }
  hf.addEventListener('input', rechne); hf.addEventListener('change', rechne);
  document.addEventListener('pc:konfig', rechne);
  ['hh', 'hw', 'hg'].forEach(id => $('#' + id).addEventListener('blur', () => { const el = $('#' + id); el.value = pcZahl(el.value, +el.min, +el.max); rechne(); }));
  $('#hf').addEventListener('change', () => { const fl = Array.from($('#hf').files || []); $('#hf-n').textContent = fl.length ? fl.length + (fl.length === 1 ? ' Datei: ' : ' Dateien: ') + fl.map(x => x.name).join(', ') : 'keine ausgewählt'; });
  rechne();

  hf.addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('#hm'), msg = $('#hv-msg'); msg.textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.value.trim())) { m.classList.add('bad'); msg.textContent = 'Bitte eine gültige E-Mail-Adresse eintragen.'; m.focus(); return; }
    m.classList.remove('bad');
    const fhv = Array.from($('#hf').files || []);
    if (fhv.length > 10 || fhv.reduce((x, y) => x + y.size, 0) > 20 * 1024 * 1024) { msg.textContent = 'Bitte höchstens 10 Dateien und zusammen 20 MB.'; return; }
    const fd = new FormData(hf);
    const btn = $('#hv-send'); btn.disabled = true; $('#hv-send-t').textContent = 'Wird gesendet …';
    const zurueck = () => { btn.disabled = false; $('#hv-send-t').textContent = 'Angebot anfordern'; };
    try {
      const res = await fetch('/api/bestellung', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      let j = null; try { j = await res.json(); } catch (er) { /* keine JSON-Antwort */ }
      if (!res.ok || !j || !j.ok) { if (j && j.error && res.status < 500) { msg.textContent = j.error; zurueck(); return; } throw new Error('server'); }
      hf.hidden = true; $('#hv-nr').textContent = j.nr || '–'; $('#hv-done').hidden = false; $('#hv-done').focus();
    } catch (er) {
      const body = 'Hallo Tomo,\n\nbitte um ein Angebot für unseren Bestand:\n\n' + pcZeilen(hv.L, hv.total, 'Richtpreis') + '\nHäuser: ' + hv.haeuser + ', Geschosse je Haus: ' + hv.geschosse + '\nUnterlagen: ' + $('#hu').value + '\nWunschtermin: ' + $('#ht').value + '\n\n' + $('#hx2').value + '\n\n' + $('#hn').value + '\n' + $('#hfi').value + '\n' + $('#hp').value;
      $('#hv-fb-mail').href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Angebot Bestand – ' + ($('#hfi').value || $('#hn').value || m.value)) + '&body=' + encodeURIComponent(body);
      $('#hv-fallback').hidden = false; $('#hv-fallback').focus();
      zurueck();
    }
  });
})();
