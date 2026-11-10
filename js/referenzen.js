/* PlavoCAD Referenzen: Reiter je Blatt, Umschalter für alle Blätter, Vergleichs-Schieber. Speichert nichts und sendet nichts. */
(() => {
  'use strict';
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const pd = document.getElementById('plotdate');
  if (pd) pd.textContent = p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());

  function select(tab, focus) {
    const list = tab.parentNode;
    $$('[role="tab"]', list).forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  $$('.rb-tabs').forEach(list => {
    const tabs = $$('[role="tab"]', list);
    tabs.forEach(t => {
      t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        const i = tabs.indexOf(t);
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') j = 0;
        if (e.key === 'End') j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  });

  // Umschalter: alle Blätter auf CAD oder Exposé; Startwert aus ?f=makler / ?f=planer
  const modes = $$('.rf-mode button');
  function setMode(m) {
    modes.forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'));
    $$('.rb-tabs').forEach(list => { const t = list.querySelector('[data-view="' + m + '"]'); if (t) select(t); });
  }
  modes.forEach(b => b.addEventListener('click', () => {
    setMode(b.dataset.mode);
    try { const u = new URL(location.href); u.searchParams.set('f', b.dataset.mode === 'expose' ? 'makler' : 'planer'); history.replaceState(null, '', u); } catch (e) { /* ohne Adresszeile egal */ }
  }));
  const f = new URLSearchParams(location.search).get('f');
  setMode(f === 'makler' ? 'expose' : 'cad');

  // Zeilen im Planverzeichnis ganz anklickbar
  $$('.pv tr[data-go]').forEach(tr => tr.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    document.getElementById(tr.dataset.go).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));

  // Vergleich
  $$('.rb-cmp').forEach(c => {
    const r = c.querySelector('input');
    r.addEventListener('input', () => c.style.setProperty('--s', r.value + '%'));
  });
})();
