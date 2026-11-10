/* PlavoCAD 404: zeigt die nicht gefundene Adresse im XRef-Dialog. */
(() => {
  let p = location.pathname + location.search;
  try { p = decodeURI(p); } catch (e) { /* roh lassen */ }
  p = p.slice(0, 160);
  const name = (p.split('/').filter(Boolean).pop() || p).replace(/\.html?$/, '');
  document.getElementById('xpath').textContent = p;
  document.getElementById('xpath2').textContent = p;
  document.getElementById('xname').textContent = name || 'ova stranica';
  const r = document.getElementById('xreport');
  r.href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Neispravna poveznica na plavocad.de') + '&body=' + encodeURIComponent('Bok Tomo,\\n\\nova adresa ne vodi nikamo:\\n' + location.href + '\\n\\nPronađeno preko: ' + (document.referrer || 'direkt eingegeben') + '\n');
})();
