/* PlavoCAD Über mich: setzt das Plotdatum in den Plankopf. Speichert nichts und sendet nichts. */
(() => {
  'use strict';
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const t = p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());
  ['plotdate', 'plotdate2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = t; });
})();
