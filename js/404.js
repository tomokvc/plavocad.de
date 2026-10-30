/* PlavoCAD 404: zeigt die nicht gefundene Adresse im XRef-Dialog. */
(() => {
  let p = location.pathname + location.search;
  try { p = decodeURI(p); } catch (e) { /* roh lassen */ }
  p = p.slice(0, 160);
  const name = (p.split('/').filter(Boolean).pop() || p).replace(/\.html?$/, '');
  document.getElementById('xpath').textContent = p;
  document.getElementById('xpath2').textContent = p;
  document.getElementById('xname').textContent = name || 'diese Seite';
  const r = document.getElementById('xreport');
  r.href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Defekter Link auf plavocad.de') + '&body=' + encodeURIComponent('Hallo Tomo,\n\ndiese Adresse führt ins Leere:\n' + location.href + '\n\nGefunden über: ' + (document.referrer || 'direkt eingegeben') + '\n');
})();
