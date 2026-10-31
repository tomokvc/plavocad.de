/* PlavoCAD Plankopf: prüft die Pflichtfelder, schlägt bei Tippfehlern in der E-Mail-Domain eine Korrektur vor,
   setzt den Stempel und öffnet das E-Mail-Programm mit der fertigen Anfrage. Speichert und sendet nichts selbst. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const reduceM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = n => String(n).padStart(2, '0'), d = new Date(), today = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  const DOMAINS = ['gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 'gmx.at', 't-online.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'posteo.de', 'mailbox.org', 'freenet.de', 'aol.com', 'arcor.de', 'online.de', 'ionos.de'];
  function lev(a, b) {
    const m = a.length, n = b.length, t = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 1; j <= n; j++) t[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) t[i][j] = Math.min(t[i - 1][j] + 1, t[i][j - 1] + 1, t[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return t[m][n];
  }
  function mailFix(mail) {
    const m = /^([^@\s]+)@([^@\s]+)$/.exec(mail); if (!m) return '';
    const dom = m[2].toLowerCase(); if (DOMAINS.includes(dom)) return '';
    let best = '', bd = 3;
    DOMAINS.forEach(x => { const v = lev(dom, x); if (v < bd) { bd = v; best = x; } });
    return best && bd <= 2 ? m[1] + '@' + best : '';
  }

  /* Foto im Plankopf: erscheint automatisch, sobald img/tomo.jpg auf dem Server liegt */
  document.querySelectorAll('.tbfoto[data-src]').forEach(fig => {
    const im = new Image();
    im.onload = () => { im.alt = 'Tomo, Planverfasser'; im.width = 300; im.height = 400; const ph = fig.querySelector('.ph'); if (ph) ph.replaceWith(im); fig.classList.add('has'); };
    im.src = fig.dataset.src;
  });

  window.PlavoPlankopf = function (cfg) {
    const form = $('#req'), stamp = $('#f-stamp'), msg = $('#f-msg'), name = $('#f-name'), mail = $('#f-mail');
    if (!form) return;
    $('#f-date').textContent = today;
    form.querySelectorAll('.stamp .st2').forEach(t => { t.textContent = today; });
    let pending = null; // null = noch nicht geprüft, '' / false = erledigt, String = offener Vorschlag
    function showFix(fix) {
      const cell = mail.closest('.cell');
      cell.querySelectorAll('.suggest').forEach(x => x.remove());
      pending = fix || null;
      if (!fix) return;
      cell.insertAdjacentHTML('beforeend', '<div class="suggest" role="group" aria-label="Vorschlag zur E-Mail-Adresse"><span>Meinten Sie <b></b>?</span><button type="button" data-a="ja">Ja</button><button type="button" data-a="nein">Nein</button></div>');
      cell.querySelector('.suggest b').textContent = fix;
      cell.querySelector('[data-a="ja"]').addEventListener('click', () => { mail.value = fix; showFix(''); pending = false; mail.focus(); });
      cell.querySelector('[data-a="nein"]').addEventListener('click', () => { pending = false; cell.querySelector('.suggest').remove(); mail.focus(); });
    }
    mail.addEventListener('blur', () => { if (pending !== false) { const fx = mailFix(mail.value.trim()); if (fx) showFix(fx); } });
    mail.addEventListener('input', () => { if (pending) showFix(''); pending = null; });
    [name, mail].forEach(i => i.addEventListener('input', () => { i.closest('.cell').classList.remove('bad'); i.removeAttribute('aria-invalid'); }));

    form.addEventListener('submit', e => {
      e.preventDefault();
      const n = name.value.trim(), m = mail.value.trim(), miss = [];
      [name, mail].forEach(i => { i.closest('.cell').classList.remove('bad'); i.removeAttribute('aria-invalid'); });
      if (!n) miss.push(name);
      if (!/^\S+@\S+\.\S+$/.test(m)) miss.push(mail);
      if (miss.length) {
        miss.forEach(i => { i.closest('.cell').classList.add('bad'); i.setAttribute('aria-invalid', 'true'); });
        msg.className = 'msg err';
        msg.textContent = miss.length === 2 ? 'Bitte Name und E-Mail-Adresse eintragen, dann stempeln.' : (miss[0] === name ? 'Bitte Ihren Namen eintragen, dann stempeln.' : 'Bitte eine vollständige E-Mail-Adresse eintragen, z. B. name@buero.de.');
        stamp.classList.remove('done'); miss[0].focus(); return;
      }
      if (pending === null) { const fx = mailFix(m); if (fx) showFix(fx); }
      if (pending) { msg.className = 'msg err'; msg.textContent = 'Bitte kurz bestätigen: Meinten Sie ' + pending + '?'; mail.closest('.cell').querySelector('[data-a="ja"]').focus(); return; }
      stamp.classList.remove('done'); void stamp.offsetWidth; stamp.classList.add('done');
      const firma = $('#f-firma').value.trim(), tel = $('#f-tel').value.trim(), art = $('#f-art'), extra = cfg.lines ? cfg.lines() : [];
      const body = 'Hallo Tomo,\n\n' + art.options[art.selectedIndex].text + '.\n\n' +
        'Name: ' + n + '\n' + (firma ? form.dataset.firm + ': ' + firma + '\n' : '') + 'E-Mail: ' + m + '\n' + (tel ? 'Telefon: ' + tel + '\n' : '') +
        extra.map(x => x + '\n').join('') + '\nObjekt:\n' + $('#f-text').value.trim() + '\n\nViele Grüße\n' + n;
      const subj = cfg.subject() + ' – ' + (firma || n);
      msg.className = 'msg';
      msg.textContent = 'Gestempelt. Ihr E-Mail-Programm öffnet sich mit der fertigen Anfrage, hängen Sie dort Ihre Unterlagen an. Öffnet sich nichts, schreiben Sie direkt an kontakt@plavocad.de.';
      setTimeout(() => { location.href = 'mailto:kontakt@plavocad.de?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body); }, reduceM ? 0 : 650);
    });

    const cb = $('#copymail');
    if (cb) cb.addEventListener('click', () => {
      const done = () => { cb.textContent = 'Kopiert'; setTimeout(() => { cb.textContent = 'Adresse kopieren'; }, 2000); };
      const fallback = () => { const r = document.createRange(); r.selectNodeContents($('#mailaddr')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); cb.textContent = 'Markiert, jetzt kopieren'; };
      try { navigator.clipboard.writeText('kontakt@plavocad.de').then(done, fallback); } catch (er) { fallback(); }
    });
  };
})();
