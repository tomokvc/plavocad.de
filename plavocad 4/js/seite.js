/* PlavoCAD Unterseiten: Reiter, Vorher/Nachher-Regler, Adresse auf der 404-Seite. Speichert nichts und sendet nichts. */
(() => {
  'use strict';
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  $$('[role="tablist"]').forEach(list => {
    const tabs = $$('[role="tab"]', list);
    const sel = (t, focus) => {
      tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
      if (focus) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => sel(t));
      t.addEventListener('keydown', e => {
        const j = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (j !== undefined) { e.preventDefault(); sel(tabs[j], true); }
      });
    });
  });
  $$('.cmp input[type=range]').forEach(r => {
    const c = r.closest('.cmp');
    const set = () => c.style.setProperty('--x', r.value + '%');
    r.addEventListener('input', set); set();
  });
  const xp = document.getElementById('xpath');
  if (xp) {
    const p = decodeURIComponent(location.pathname + location.search);
    xp.textContent = p;
    const rep = document.getElementById('xreport');
    if (rep) rep.href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Defekter Link') + '&body=' + encodeURIComponent('Diese Adresse fehlt: ' + location.href + (document.referrer ? '\nGekommen von: ' + document.referrer : ''));
  }
})();
