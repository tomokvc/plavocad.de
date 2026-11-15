/* PlavoCAD – läuft auf jeder Seite: aktuelle Preise, Startaktion und Lieferzeit eintragen, Maßketten, Vorher/Nachher-Regler, Reiter.
   Liest nur /api/einstellungen von plavocad.de. Speichert nichts im Browser. Braucht preise.js. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const de = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const PC = window.PC = { C: pcKonfig({}), jetzt: () => pcJetzt(), $, $$ };

  /* ---------- Maßketten ---------- */
  PC.dim = (el, segs) => {
    let h = '<span class="ln"></span>', x = 0; const t = [0];
    segs.forEach(s => { x += s.w; t.push(x); });
    t.forEach(p => { h += '<span class="tk" style="left:' + p * 100 + '%"></span>'; });
    x = 0; segs.forEach(s => { if (s.t) h += '<span class="tx" style="left:' + (x + s.w / 2) * 100 + '%">' + s.t + '</span>'; x += s.w; });
    el.innerHTML = h;
  };
  const hy = $('#hy');
  if (hy) hy.innerHTML = '<span class="ln"></span><span class="tk" style="top:0"></span><span class="tk" style="top:100%"></span><span class="tx">9,65</span>';

  /* ---------- Einstellungen in die Seite schreiben ---------- */
  function anwenden() {
    const C = PC.C, j = PC.jetzt(), A = pcAnzeige(C), lz = pcLieferzeit(C), ak = pcAktion(C, j), pause = pcPause(C, j);
    $$('[data-p]').forEach(el => { const v = A[el.dataset.p]; if (v !== undefined) el.textContent = Number.isInteger(v) ? String(v) : de(v); });
    const ex = C.lieferung.express;
    $$('[data-lz]').forEach(el => {
      const k = el.dataset.lz;
      el.textContent = k === 'express' ? (ex <= 2 ? ex * 24 + ' Stunden' : ex + ' Werktagen') : lz[k] || lz.lang;
    });
    $$('[data-lf]').forEach(el => { const v = C.lieferung[el.dataset.lf]; if (v !== undefined) el.textContent = v; });
    $$('[data-ak]').forEach(el => { el.textContent = { bis: ak.bisText, frei: ak.frei, gesamt: ak.gesamt }[el.dataset.ak]; });
    const a = $('#aktion'); if (a) a.hidden = !ak.aktiv;
    const p = $('#pause'); if (p) { p.hidden = !pause; if (pause) $('#pause-t').textContent = pause.text; }
    const fd = $('#flowdim');
    if (fd) PC.dim(fd, [{ w: 1 / 3, t: 'heute' }, { w: 1 / 3, t: lz.lang.replace('Werktagen', 'Werktage') }, { w: 1 / 3, t: 'Rechnung danach' }]);
    document.dispatchEvent(new CustomEvent('pc:konfig'));
  }
  anwenden();
  PC.bereit = (async () => {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('/api/einstellungen', { headers: { Accept: 'application/json' }, signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && j.ok) {
        PC.C = pcKonfig({ preise: j.preise, aktion: { an: j.aktion.an, frei: j.aktion.frei, gesamt: j.aktion.gesamt, bis: j.aktion.bis },
          lieferung: { werktage: j.lieferung.werktage, express: j.lieferung.express, proMonat: j.lieferung.proMonat, pauseAn: j.lieferung.pauseAn, pauseBis: j.lieferung.pauseBis, pauseText: j.lieferung.pauseText } });
        anwenden();
      }
    } catch (e) { /* ohne Antwort gelten die Standardwerte; der Server rechnet bei der Bestellung ohnehin selbst */ }
  })();

  /* ---------- Vorher/Nachher ---------- */
  $$('.cmp').forEach(c => {
    const r = $('input', c), hero = c.id === 'cmp-hero', hx = $('#hx');
    const set = v => {
      c.style.setProperty('--x', v + '%');
      if (hero && hx) { const f = v / 100; PC.dim(hx, f > .08 && f < .92 ? [{ w: f, t: de(13.6 * f) }, { w: 1 - f, t: de(13.6 * (1 - f)) }] : [{ w: 1, t: '13,60' }]); }
    };
    r.addEventListener('input', () => set(+r.value));
    if (hero && !reduceM) {
      const t0 = performance.now();
      const step = t => { const k = Math.min((t - t0) / 1200, 1), v = 14 + 32 * (1 - Math.pow(1 - k, 3)); r.value = v; set(v); if (k < 1) requestAnimationFrame(step); };
      set(14); setTimeout(() => requestAnimationFrame(step), 400);
    } else set(+r.value);
  });

  /* ---------- Reiter ---------- */
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

  /* ---------- Zähler mit Plus und Minus ---------- */
  $$('[data-step]').forEach(b => b.addEventListener('click', () => {
    const el = $('#' + b.dataset.step); el.value = Math.min(+el.max, Math.max(+el.min, (+el.value || 0) + +b.dataset.d));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }));

  /* ---------- Menü am Handy schließt bei Klick daneben ---------- */
  const menu = $('details.menu');
  if (menu) document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });

  /* ---------- Alte Sprungmarken der früheren Startseite ---------- */
  if (/(^|\/)(index\.html)?$/.test(location.pathname)) {
    const alt = { '#bestellen': 'bestellen.html', '#verwaltungen': 'hausverwaltungen.html', '#verwaltung': 'hausverwaltungen.html', '#makler': 'bestellen.html' }[location.hash];
    if (alt) location.replace(alt);
  }

  /* ---------- 404: gesuchte Adresse zeigen ---------- */
  const xp = document.getElementById('xpath');
  if (xp) {
    xp.textContent = decodeURIComponent(location.pathname + location.search);
    const rep = document.getElementById('xreport');
    if (rep) rep.href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent('Defekter Link') + '&body=' + encodeURIComponent('Diese Adresse fehlt: ' + location.href + (document.referrer ? '\nGekommen von: ' + document.referrer : ''));
  }
})();
