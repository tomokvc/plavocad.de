/* PlavoCAD Startseite: ziehbare Trennlinie, die Türen lehnen die Linie zu ihrer Seite. */
(() => {
  'use strict';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // alte Links und Flyer-QR-Codes mit ?ansicht=makler führen direkt zur Makler-Seite
  if (/[?&]ansicht=makler\b/.test(location.search)) { location.replace('makler.html'); return; }
  const split = document.getElementById('split'), sp = document.getElementById('splitpos');
  const setS = v => split.style.setProperty('--s', v + '%');
  sp.addEventListener('pointerdown', () => split.classList.remove('anim'));
  ['pointerup', 'pointercancel'].forEach(ev => sp.addEventListener(ev, () => split.classList.add('anim')));
  sp.addEventListener('input', () => setS(+sp.value));
  sp.addEventListener('keydown', () => split.classList.remove('anim'));
  document.querySelectorAll('.dr').forEach(dr => {
    const on = () => { split.classList.add('anim'); setS(dr.dataset.lean); }, off = () => setS(+sp.value);
    dr.addEventListener('mouseenter', on); dr.addEventListener('mouseleave', off);
    dr.addEventListener('focus', on); dr.addEventListener('blur', off);
  });
})();
