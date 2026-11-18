/* PlavoCAD Admin – Büro: Heute, Kunden, Akquise (mit CSV-Import und Briefen), Angebote und Rechnungen, Firmendaten.
   Ersetzt das frühere Büro-Tool. Alle Daten liegen in der Datenbank auf plavocad.de, nichts im Browser. Braucht admin.js, beleg.js, preise.js. */
(() => {
  'use strict';
  const { $, $$, esc, api, toast, fehler, datum, zeit, heute } = PCA;
  const app = () => PCA.app();
  const eur = n => pcEur(+n || 0);
  const tagText = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : '–'; };
  const plus = (iso, n) => { const d = new Date((iso || heute()) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const wer = k => (k && (k.firma || k.name || k.mail)) || '–';
  const titel = (t, extra = '') => '<div class="flex flex-wrap items-center gap-3 mb-5"><h1 class="font-display font-bold uppercase text-[2rem] sm:text-[2.6rem] leading-none">' + t + '</h1>' + extra + '</div>';
  const zelle = (l, v, cls, h) => '<div class="bg-sheet p-3.5"><dt class="lbl">' + l + '</dt><dd class="mt-1 font-mono text-[1.5rem] leading-tight ' + (cls || '') + '">' + v + '</dd>' + (h ? '<dd class="text-[.78rem] text-muted">' + h + '</dd>' : '') + '</div>';
  const fld = (name, l, v, typ = 'text', extra = '') => '<label class="field"><span class="lbl">' + l + '</span><input class="inp" name="' + name + '" type="' + typ + '" value="' + esc(v) + '"' + extra + '></label>';
  const PHASE = { neu: 'Noch nicht angeschrieben', angeschrieben: 'Angeschrieben', nachfassen: 'Nachfassen', interessiert: 'Interessiert', kunde: 'Kunde', kein_interesse: 'Kein Interesse' };
  const PHASE_CLS = { neu: 'border-ink text-ink', angeschrieben: 'border-blue text-blue', nachfassen: 'border-warn text-warn', interessiert: 'border-blue bg-blue text-white', kunde: 'border-ok text-ok', kein_interesse: 'border-rule text-muted' };
  const phaseTag = p => '<span class="tag ' + PHASE_CLS[p] + '">' + PHASE[p] + '</span>';
  const BST = { entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt', offen: 'Offen', bezahlt: 'Bezahlt', storniert: 'Storniert', storno: 'Storno' };
  const BST_CLS = { entwurf: 'border-ink text-ink', versendet: 'border-blue text-blue', angenommen: 'border-ok text-ok', abgelehnt: 'border-rule text-muted', offen: 'border-warn text-warn', bezahlt: 'border-ok text-ok', storniert: 'border-rule text-muted', storno: 'border-rule text-muted' };
  const ueberfaellig = b => b.art === 'rechnung' && b.status === 'offen' && b.faellig && b.faellig < heute();
  const belegTag = b => '<span class="tag ' + (ueberfaellig(b) ? 'border-warn bg-warn text-white' : BST_CLS[b.status]) + '">' + (ueberfaellig(b) ? 'Überfällig' : BST[b.status]) + '</span>';
  const ART = { angebot: 'Angebot', rechnung: 'Rechnung', storno: 'Stornorechnung' };
  const GRUSS = '\n\nViele Grüße\nTomo Kovačević\nPlavoCAD · 0172 313 61 17 · kontakt@plavocad.de';

  let K = null, KZeit = 0, FIRMA = null, KONFIG = null;
  async function kontakte(frisch) { if (frisch || !K || Date.now() - KZeit > 30000) { K = (await api('kontakte')).liste; KZeit = Date.now(); } return K; }
  async function firma(frisch) { if (frisch || !FIRMA) FIRMA = (await api('firma')).firma; return FIRMA; }
  async function konfig() { if (!KONFIG) KONFIG = (await api('einstellungen')).konfig; return KONFIG; }
  const dirtyK = () => { K = null; };

  // Leistungen für Belege, mit den aktuellen Preisen aus den Einstellungen
  const KATALOG = [
    ['wohnung', 'Grundriss Wohnung, möbliert, mit Raumnamen (PDF und PNG)', 'Wohnung'],
    ['flaechen', 'Wohnflächenaufstellung (in Anlehnung an die WoFlV, ohne Gewähr)', 'Wohnung'],
    ['hausPaket', 'Haus bis 3 Ebenen: Grundrisse möbliert inkl. Flächen (PDF und PNG)', 'Haus'],
    ['ebene', 'Weitere Wohnebene', 'Ebene'], ['nebenebene', 'Keller oder Dachboden', 'Ebene'], ['flaechenHaus', 'Flächenaufstellung Haus', 'Haus'],
    ['gewerbe', 'Grundriss Gewerbeeinheit', 'Einheit'], ['d3', '3D-Ansicht', 'Ebene'], ['dachschraegen', 'Dachschrägen', 'Ebene'], ['express', 'Express-Lieferung', 'Auftrag'],
    ['skizze', 'Zuschlag Vorlage nur als Handskizze', 'Wohnung'], ['treppenhaus', 'Treppenhaus', 'Geschoss'], ['gemeinschaftskeller', 'Gemeinschaftskeller', 'Haus']
  ];

  /* ======================= Heute ======================= */
  PCA.weg('', async () => {
    const d = await api('heute'), h = d.heute;
    const lief = d.lieferungen, ueber = d.rechnungen.filter(r => r.faellig && r.faellig < h);
    const leer = !d.neu.length && !lief.length && !d.ohneRechnung.length && !d.wiedervorlagen.length && !ueber.length && !d.angebote.length;
    const block = (titel, n, inhalt, link) => n ? '<section class="card"><div class="flex items-baseline justify-between gap-3 px-4 pt-4"><h2 class="font-display uppercase text-[1.3rem] leading-none">' + titel + ' <span class="font-mono text-[1rem] text-muted">' + n + '</span></h2>' + (link || '') + '</div><ul class="divide-y divide-rule mt-3">' + inhalt + '</ul></section>' : '';
    const li = (href, links, rechts, cls = '') => '<li><a class="flex items-center gap-3 px-4 py-3 hover:bg-wash ' + cls + '" href="' + href + '"><span class="grow min-w-0">' + links + '</span><span class="font-mono text-[.84rem] text-right whitespace-nowrap">' + rechts + '</span></a></li>';
    app().innerHTML = titel('Heute', '<span class="font-mono text-muted">' + new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }) + '</span>') +
      '<dl class="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink mb-5">' +
        zelle('Neu', d.neu.length, d.neu.length ? 'text-warn' : '', 'prüfen und bestätigen') + zelle('Lieferungen', lief.length, lief.some(x => x.liefertermin <= h) ? 'text-warn' : '', 'heute oder morgen fällig') +
        zelle('Wiedervorlagen', d.wiedervorlagen.length, d.wiedervorlagen.length ? 'text-blue' : '', 'Akquise und Kunden') + zelle('Offene Rechnungen', eur(d.rechnungen.reduce((s, r) => s + r.summe - (r.bezahlt_betrag || 0), 0)), ueber.length ? 'text-warn' : '', ueber.length ? ueber.length + ' überfällig' : d.rechnungen.length + ' offen') + '</dl>' +
      (leer ? '<p class="card p-6 text-ink2">Heute steht nichts an. Neue Bestellungen von der Website erscheinen hier automatisch.</p>' : '<div class="grid lg:grid-cols-2 gap-5 items-start">' +
        block('Neu eingegangen', d.neu.length, d.neu.map(b => li('#/b/' + encodeURIComponent(b.nr), '<b class="block truncate">' + esc(wer(b)) + '</b><span class="block truncate text-[.86rem] text-ink2">' + esc(b.typ || '') + (b.objekt ? ' · ' + esc(b.objekt) : '') + '</span>', eur(b.preis) + '<br><span class="text-muted">' + zeit(b.erstellt) + '</span>')).join('')) +
        block('Lieferungen', lief.length, lief.map(b => li('#/b/' + encodeURIComponent(b.nr), '<b class="block truncate">' + esc(wer(b)) + '</b><span class="block truncate text-[.86rem] text-ink2">' + esc(b.objekt || b.typ || '') + '</span>', '<span class="' + (b.liefertermin <= h ? 'text-warn' : '') + '">' + datum(b.liefertermin) + '</span>')).join('')) +
        block('Geliefert, Rechnung fehlt', d.ohneRechnung.length, d.ohneRechnung.map(b => li('#/b/' + encodeURIComponent(b.nr), '<b class="block truncate">' + esc(wer(b)) + '</b><span class="block truncate text-[.86rem] text-ink2">' + esc(b.nr) + (b.objekt ? ' · ' + esc(b.objekt) : '') + '</span>', eur(b.preis))).join('')) +
        block('Wiedervorlagen', d.wiedervorlagen.length, d.wiedervorlagen.map(k => li('#/k/' + k.id, '<b class="block truncate">' + esc(wer(k)) + (k.ort ? ' <span class="font-normal text-ink2">· ' + esc(k.ort) + '</span>' : '') + '</b><span class="block truncate text-[.86rem] text-ink2">' + PHASE[k.phase] + (k.notiz ? ' · ' + esc(k.notiz.split('\n')[0]) : '') + '</span>', '<span class="' + (k.wiedervorlage < h ? 'text-warn' : '') + '">' + datum(k.wiedervorlage) + '</span>')).join(''), '<a class="font-mono text-[.78rem] text-blue underline" href="#/akquise?f=wv">Alle</a>') +
        block('Offene Rechnungen', d.rechnungen.length, d.rechnungen.map(r => li('#/beleg/' + r.id, '<b class="block truncate">' + esc(wer(r.kaeufer)) + '</b><span class="block truncate text-[.86rem] text-ink2 font-mono">' + esc(r.nr) + '</span>', eur(r.summe) + '<br><span class="' + (r.faellig < h ? 'text-warn' : 'text-muted') + '">fällig ' + datum(r.faellig) + '</span>')).join('')) +
        block('Angebote ohne Antwort', d.angebote.length, d.angebote.map(r => li('#/beleg/' + r.id, '<b class="block truncate">' + esc(wer(r.kaeufer)) + '</b><span class="block truncate text-[.86rem] text-ink2 font-mono">' + esc(r.nr) + ' · gesendet ' + zeit(r.versendet) + '</span>', eur(r.summe))).join('')) +
      '</div>');
  }, 'heute');

  /* ======================= Kunden und Akquise ======================= */
  const AFILTER = [['offen', 'Offen', k => !['kunde', 'kein_interesse'].includes(k.phase)], ['wv', 'Wiedervorlage fällig', k => k.wiedervorlage && k.wiedervorlage <= heute() && k.phase !== 'kein_interesse'],
    ['neu', 'Nicht angeschrieben', k => k.phase === 'neu'], ['angeschrieben', 'Angeschrieben', k => k.phase === 'angeschrieben'], ['nachfassen', 'Nachfassen', k => k.phase === 'nachfassen'],
    ['interessiert', 'Interessiert', k => k.phase === 'interessiert'], ['kein_interesse', 'Kein Interesse', k => k.phase === 'kein_interesse']];
  const sel = new Set();
  async function kontaktListe(art, q) {
    const L = await kontakte(true), akq = art === 'akquise';
    let filter = akq ? (q.get('f') || 'offen') : 'kunden', such = q.get('q') || '';
    const zeichne = () => {
      const f = akq ? AFILTER.find(x => x[0] === filter) || AFILTER[0] : null, s = such.trim().toLowerCase();
      const basis = L.filter(k => akq ? k.phase !== 'kunde' : k.phase === 'kunde');
      const rows = basis.filter(k => !f || f[2](k)).filter(k => !s || [k.firma, k.name, k.mail, k.ort, k.tel].join(' ').toLowerCase().includes(s))
        .sort((a, b) => akq ? (a.wiedervorlage || '9').localeCompare(b.wiedervorlage || '9') || wer(a).localeCompare(wer(b)) : wer(a).localeCompare(wer(b)));
      [...sel].forEach(id => { if (!rows.some(k => k.id === id)) sel.delete(id); });
      const umsatz = basis.reduce((x, k) => x + (k.umsatz || 0), 0);
      app().innerHTML = titel(akq ? 'Akquise' : 'Kunden', '<div class="ml-auto flex flex-wrap gap-2">' + (akq ? '<a class="btn-ghost" href="#/akquise/import">Liste importieren</a>' : '') + '<a class="btn-primary" href="#/k/neu?phase=' + (akq ? 'neu' : 'kunde') + '">' + (akq ? 'Kontakt' : 'Kunde') + ' anlegen</a></div>') +
        (akq ? '<dl class="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink mb-5">' + zelle('Offen', basis.filter(AFILTER[0][2]).length, '', 'noch nicht Kunde') + zelle('Wiedervorlage', basis.filter(AFILTER[1][2]).length, basis.some(AFILTER[1][2]) ? 'text-warn' : '', 'heute oder vorbei') +
          zelle('Interessiert', basis.filter(k => k.phase === 'interessiert').length, '', 'Gespräch läuft') + zelle('Gewonnen', L.filter(k => k.phase === 'kunde' && k.quelle !== 'Website').length, 'text-ok', 'aus der Akquise') + '</dl>'
          : '<dl class="grid grid-cols-2 md:grid-cols-3 gap-px bg-ink border border-ink mb-5">' + zelle('Kunden', basis.length) + zelle('Mit Bestellung', basis.filter(k => k.n_best > 0).length) + zelle('Umsatz (Rechnungen)', eur(umsatz)) + '</dl>') +
        '<div class="flex flex-wrap items-center gap-2 mb-4">' + (akq ? AFILTER.map(x => '<button type="button" data-f="' + x[0] + '" class="min-h-[40px] px-3 border font-mono text-[.74rem] uppercase tracking-[.08em] ' + (x[0] === filter ? 'bg-ink text-sheet border-ink' : 'bg-sheet border-rule hover:border-ink') + '">' + x[1] + ' <span class="opacity-60">' + basis.filter(x[2]).length + '</span></button>').join('') : '') +
          '<input id="kq" class="inp !min-h-[40px] sm:!w-[260px] sm:ml-auto" type="search" placeholder="Suchen: Firma, Name, Ort" value="' + esc(such) + '" aria-label="Kontakte durchsuchen"></div>' +
        (akq && rows.length ? '<div class="flex flex-wrap items-center gap-2 mb-3 min-h-[44px]"><label class="flex items-center gap-2 font-mono text-[.78rem] cursor-pointer"><input type="checkbox" id="alle" class="w-4 h-4"' + (rows.length && rows.every(k => sel.has(k.id)) ? ' checked' : '') + '> Alle ' + rows.length + ' auswählen</label>' +
          '<span id="selinfo" class="font-mono text-[.78rem] text-muted"></span><span class="ml-auto flex flex-wrap gap-2"><button type="button" class="btn-ghost !min-h-[40px]" id="b-briefe" disabled>Briefe als PDF</button><button type="button" class="btn-ghost !min-h-[40px]" id="b-ang" disabled>Als angeschrieben markieren</button></span></div>' : '') +
        (rows.length ? '<ul class="card divide-y divide-rule">' + rows.map(k => '<li class="flex items-stretch' + (akq && k.wiedervorlage && k.wiedervorlage <= heute() ? ' bg-wash/50' : '') + '">' +
            (akq ? '<label class="flex items-center px-3 border-r border-rule cursor-pointer"><input type="checkbox" class="w-4 h-4" data-sel="' + k.id + '"' + (sel.has(k.id) ? ' checked' : '') + ' aria-label="' + esc(wer(k)) + ' auswählen"></label>' : '') +
            '<a class="grow grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center px-4 py-3 hover:bg-wash" href="#/k/' + k.id + '">' +
            '<span class="min-w-0"><b class="block truncate">' + esc(wer(k)) + '</b><span class="block truncate text-[.86rem] text-ink2">' + esc([k.firma && k.name ? k.name : '', k.ort].filter(Boolean).join(' · ') || k.mail || '') + '</span></span>' +
            (akq ? '<span class="hidden sm:block">' + phaseTag(k.phase) + '</span><span class="font-mono text-[.8rem] text-right ' + (k.wiedervorlage && k.wiedervorlage <= heute() ? 'text-warn' : 'text-muted') + '">' + (k.wiedervorlage ? 'WV ' + datum(k.wiedervorlage) : '') + '</span>'
              : '<span class="hidden sm:block font-mono text-[.8rem] text-muted">' + (k.n_best ? k.n_best + ' Bestellung' + (k.n_best > 1 ? 'en' : '') : 'noch keine Bestellung') + '</span><b class="font-mono text-right">' + eur(k.umsatz) + '</b>') +
            '</a></li>').join('') + '</ul>'
          : '<p class="card p-6 text-ink2">' + (basis.length ? 'Keine Treffer.' : akq ? 'Noch keine Kontakte. Importiere deine Makler-Liste aus Excel oder Numbers, oder lege Kontakte einzeln an.' : 'Noch keine Kunden. Jede Bestellung von der Website legt den Kunden automatisch an.') + '</p>') +
        (akq ? '<p class="mt-4 font-mono text-[.74rem] text-muted">Kontakte mit „Kein Interesse“ werden 6 Monate nach der letzten Änderung automatisch gelöscht. Briefe enthalten den Datenschutzhinweis nach Art. 14 DSGVO.</p>' : '');
      $$('[data-f]', app()).forEach(b => b.onclick = () => { filter = b.dataset.f; history.replaceState(null, '', '#/akquise?f=' + filter); zeichne(); });
      const qi = $('#kq'); qi.oninput = () => { such = qi.value; const p = qi.selectionStart; zeichne(); const n = $('#kq'); n.focus(); n.setSelectionRange(p, p); };
      if (!akq || !rows.length) return;
      const info = () => { const n = sel.size; $('#selinfo').textContent = n ? n + ' ausgewählt' : ''; $('#b-briefe').disabled = !n; $('#b-ang').disabled = !n; };
      $$('[data-sel]', app()).forEach(c => c.onchange = () => { c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); info(); });
      $('#alle').onchange = e => { rows.forEach(k => e.target.checked ? sel.add(k.id) : sel.delete(k.id)); zeichne(); };
      info();
      $('#b-briefe').onclick = async () => {
        const liste = L.filter(k => sel.has(k.id)), ohne = liste.filter(k => !k.strasse || !k.plz || !k.ort);
        if (ohne.length) toast(ohne.length + ' Kontakt(e) ohne vollständige Anschrift: ' + ohne.slice(0, 3).map(wer).join(', ') + (ohne.length > 3 ? ' …' : '') + '. Die Briefe sind trotzdem erstellt.', true);
        const btn = $('#b-briefe'); btn.disabled = true; btn.textContent = 'Erstellt PDF …';
        try { const F = await firma(), C = await konfig(); const blob = await PCB.briefe(liste, F, F.brief, C); PCB.laden(blob, 'PlavoCAD_Anschreiben_' + heute() + '.pdf'); toast(liste.length + ' Brief(e) erstellt. Nach dem Versand: „Als angeschrieben markieren“.'); }
        catch (e) { fehler(e); } finally { btn.disabled = false; btn.textContent = 'Briefe als PDF'; }
      };
      $('#b-ang').onclick = async () => {
        const ids = [...sel], wv = plus(heute(), 14);
        try {
          for (const id of ids) { const k = L.find(x => x.id === id); await api('kontakte/' + id, { method: 'PATCH', json: { phase: k.phase === 'neu' ? 'angeschrieben' : k.phase, wiedervorlage: wv, vermerk: 'Brief verschickt' } }); }
          toast(ids.length + ' Kontakt(e) als angeschrieben markiert, Wiedervorlage am ' + tagText(wv) + '.'); sel.clear(); kontaktListe(art, new URLSearchParams('f=' + filter));
        } catch (e) { fehler(e); }
      };
    };
    zeichne();
  }
  PCA.weg('kunden', (m, q) => kontaktListe('kunden', q), 'kunden');
  PCA.weg('akquise', (m, q) => kontaktListe('akquise', q), 'akquise');

  /* ----- Kontakt anlegen und bearbeiten ----- */
  const stamm = k => '<div class="grid sm:grid-cols-2 gap-4">' + fld('firma', 'Firma / Büro', k.firma) + fld('name', 'Ansprechpartner', k.name) + fld('mail', 'E-Mail', k.mail, 'email') + fld('tel', 'Telefon', k.tel, 'tel') +
    '<div class="sm:col-span-2">' + fld('strasse', 'Straße und Hausnummer', k.strasse) + '</div>' + '<div class="grid grid-cols-[110px_minmax(0,1fr)] gap-4 sm:col-span-2">' + fld('plz', 'PLZ', k.plz, 'text', ' inputmode="numeric"') + fld('ort', 'Ort', k.ort) + '</div>' +
    fld('web', 'Website', k.web, 'text', ' inputmode="url"') + fld('quelle', 'Quelle', k.quelle, 'text', ' list="quellen"') + '<datalist id="quellen"><option>Website</option><option>Google Maps</option><option>Immobilienportal</option><option>Empfehlung</option><option>Import</option><option>Telefon</option></datalist></div>';
  const formWerte = f => Object.fromEntries(new FormData(f).entries());
  PCA.weg('k/neu', async (m, q) => {
    const phase = q.get('phase') === 'kunde' ? 'kunde' : 'neu';
    app().innerHTML = '<p class="mb-4"><a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/' + (phase === 'kunde' ? 'kunden' : 'akquise') + '">← Zurück</a></p>' + titel(phase === 'kunde' ? 'Kunde anlegen' : 'Kontakt anlegen') +
      '<form id="kf" class="card p-4 sm:p-5 max-w-[760px] grid gap-4" novalidate>' + stamm({ quelle: phase === 'kunde' ? '' : 'Google Maps' }) +
      '<label class="field"><span class="lbl">Notiz</span><textarea class="inp min-h-[90px]" name="notiz" rows="3"></textarea></label>' +
      '<div><button class="btn-primary btn-big" type="submit">Speichern</button></div></form>';
    $('#kf').onsubmit = async e => {
      e.preventDefault();
      try { const r = await api('kontakte', { method: 'POST', json: Object.assign(formWerte(e.target), { phase }) }); dirtyK(); toast('Angelegt.'); location.hash = '#/k/' + r.id; }
      catch (er) { fehler(er); }
    };
  }, 'akquise');

  PCA.weg(/^k\/(\d+)$/, async m => {
    const id = +m[1];
    const r = await api('kontakte/' + id), k = r.k, kunde = k.phase === 'kunde', h = heute();
    const vl = (k.verlauf || []).slice().reverse();
    const PH = kunde ? [] : [['angeschrieben', 'Angeschrieben', 14], ['nachfassen', 'Nachfassen', 7], ['interessiert', 'Interessiert', 7], ['kunde', 'Ist Kunde', 0], ['kein_interesse', 'Kein Interesse', 0]];
    app().innerHTML = '<p class="mb-4"><a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/' + (kunde ? 'kunden' : 'akquise') + '">← ' + (kunde ? 'Alle Kunden' : 'Akquise') + '</a></p>' +
      titel(esc(wer(k)), phaseTag(k.phase) + (k.wiedervorlage ? '<span class="tag ' + (k.wiedervorlage <= h ? 'border-warn text-warn' : 'border-ink text-ink') + '">WV ' + datum(k.wiedervorlage) + '</span>' : '')) +
      '<div class="grid lg:grid-cols-12 gap-5 items-start"><div class="lg:col-span-7 flex flex-col gap-5">' +
        (kunde ? '' : '<section class="card border-2 border-ink p-4 sm:p-5"><span class="lbl">Akquise</span><p class="mt-1 text-ink2">Phase setzen, die Wiedervorlage stellt sich passend ein. Briefe gehen über „Brief als PDF“ oder gesammelt in der Akquise-Liste.</p>' +
          '<div class="mt-4 flex flex-wrap gap-2">' + PH.map(p => '<button type="button" class="' + (p[0] === k.phase ? 'btn-primary' : 'btn-ghost') + ' !min-h-[42px]" data-ph="' + p[0] + '" data-wv="' + p[2] + '">' + p[1] + '</button>').join('') + '</div>' +
          '<div class="mt-4 grid sm:grid-cols-[220px_auto] gap-3 items-end"><label class="field"><span class="lbl">Wiedervorlage</span><input class="inp font-mono" type="date" id="k-wv" value="' + esc(k.wiedervorlage) + '"></label>' +
          '<div class="flex flex-wrap gap-2"><button type="button" class="btn-ghost !min-h-[42px]" data-wvp="7">+ 1 Woche</button><button type="button" class="btn-ghost !min-h-[42px]" data-wvp="30">+ 1 Monat</button><button type="button" class="btn-ghost !min-h-[42px]" data-wvp="0">Keine</button></div></div></section>') +
        '<section class="card"><h2 class="lbl px-4 pt-4">Gespräch oder Notiz festhalten</h2><form id="k-vm" class="p-4 flex flex-col sm:flex-row gap-2"><input class="inp" name="vermerk" placeholder="z. B. Angerufen, Frau Lorenz möchte im Januar zwei Wohnungen" required><button class="btn-ghost shrink-0" type="submit">Eintragen</button></form>' +
          '<ol class="px-4 pb-4 grid gap-2 text-[.9rem]">' + vl.map(v => '<li class="grid grid-cols-[92px_minmax(0,1fr)] gap-3"><span class="font-mono text-[.76rem] text-muted pt-0.5">' + zeit(v.t) + '</span><span>' + esc(v.was) + '</span></li>').join('') + '</ol></section>' +
        (r.bestellungen.length ? '<section class="card"><h2 class="lbl px-4 pt-4">Bestellungen</h2><ul class="divide-y divide-rule mt-2">' + r.bestellungen.map(b => '<li><a class="flex items-center gap-3 px-4 py-3 hover:bg-wash" href="#/b/' + encodeURIComponent(b.nr) + '"><span class="grow min-w-0"><b class="font-mono text-[.86rem]">' + esc(b.nr) + '</b> <span class="text-ink2">' + esc(b.typ || '') + (b.objekt ? ' · ' + esc(b.objekt) : '') + '</span></span><span class="font-mono text-[.8rem] text-muted">' + esc(b.status) + '</span><b class="font-mono">' + eur(b.preis) + '</b></a></li>').join('') + '</ul></section>' : '') +
        '<section class="card"><div class="flex flex-wrap items-center gap-2 px-4 pt-4"><h2 class="lbl grow">Angebote und Rechnungen</h2><a class="btn-ghost !min-h-[40px]" href="#/beleg/neu?art=angebot&kontakt=' + id + '">Angebot</a><a class="btn-ghost !min-h-[40px]" href="#/beleg/neu?art=rechnung&kontakt=' + id + '">Rechnung</a></div>' +
          (r.belege.length ? '<ul class="divide-y divide-rule mt-3">' + r.belege.map(b => '<li><a class="flex items-center gap-3 px-4 py-3 hover:bg-wash" href="#/beleg/' + b.id + '"><span class="grow min-w-0"><b>' + ART[b.art] + '</b> <span class="font-mono text-[.84rem] text-muted">' + esc(b.nr || 'Entwurf') + ' · ' + tagText(b.datum) + '</span></span>' + belegTag(b) + '<b class="font-mono">' + eur(b.summe) + '</b></a></li>').join('') + '</ul>' : '<p class="px-4 py-3 text-ink2">Noch keine.</p>') + '</section>' +
      '</div><aside class="lg:col-span-5 flex flex-col gap-5">' +
        '<form id="k-f" class="card p-4 sm:p-5 grid gap-4" novalidate>' + stamm(k) + '<label class="field"><span class="lbl">Notiz (bleibt stehen)</span><textarea class="inp min-h-[90px]" name="notiz" rows="3">' + esc(k.notiz) + '</textarea></label>' +
          '<div class="flex flex-wrap gap-2"><button class="btn-primary" type="submit">Speichern</button>' + (k.mail ? '<a class="btn-ghost" href="mailto:' + esc(k.mail) + '">E-Mail</a>' : '') + (k.tel ? '<a class="btn-ghost" href="tel:' + esc(k.tel.replace(/[^\d+]/g, '')) + '">Anrufen</a>' : '') + '</div></form>' +
        '<div class="flex flex-wrap gap-2">' + (!kunde ? '<button type="button" class="btn-ghost" id="k-brief">Brief als PDF</button>' : '') + (kunde ? '<button type="button" class="btn-ghost" data-ph="interessiert" data-wv="0">Zur Akquise verschieben</button>' : '') +
          '<button type="button" class="btn-ghost !border-warn !text-warn ml-auto" id="k-del">Löschen</button></div>' +
        '<p class="font-mono text-[.74rem] text-muted">Angelegt ' + zeit(k.erstellt) + (k.quelle ? ' · Quelle: ' + esc(k.quelle) : '') + '</p>' +
      '</aside></div>';
    const patch = async (a, msg) => { try { await api('kontakte/' + id, { method: 'PATCH', json: a }); dirtyK(); if (msg) toast(msg); PCA.neu(); } catch (e) { fehler(e); } };
    $$('[data-ph]', app()).forEach(b => b.onclick = () => { const wv = +b.dataset.wv; patch({ phase: b.dataset.ph, wiedervorlage: wv ? plus(h, wv) : (['kunde', 'kein_interesse'].includes(b.dataset.ph) ? '' : k.wiedervorlage) }, 'Phase: ' + PHASE[b.dataset.ph] + (wv ? ', Wiedervorlage in ' + wv + ' Tagen' : '') + '.'); });
    $$('[data-wvp]', app()).forEach(b => b.onclick = () => patch({ wiedervorlage: +b.dataset.wvp ? plus(h, +b.dataset.wvp) : '' }, 'Wiedervorlage gesetzt.'));
    const wvi = $('#k-wv'); if (wvi) wvi.onchange = () => patch({ wiedervorlage: wvi.value }, 'Wiedervorlage gesetzt.');
    $('#k-vm').onsubmit = e => { e.preventDefault(); const v = e.target.vermerk.value.trim(); if (v) patch({ vermerk: v }, 'Eingetragen.'); };
    $('#k-f').onsubmit = e => { e.preventDefault(); patch(formWerte(e.target), 'Gespeichert.'); };
    const br = $('#k-brief');
    if (br) br.onclick = async () => {
      br.disabled = true; br.textContent = 'Erstellt PDF …';
      try { const F = await firma(), C = await konfig(); PCB.laden(await PCB.briefe([k], F, F.brief, C), 'PlavoCAD_Anschreiben_' + (k.firma || k.name || k.id).replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.pdf'); toast('Brief erstellt. Nach dem Versand: Phase „Angeschrieben“.'); }
      catch (e) { fehler(e); } finally { br.disabled = false; br.textContent = 'Brief als PDF'; }
    };
    const del = $('#k-del');
    del.onclick = async () => {
      if (del.dataset.sicher !== '1') { del.dataset.sicher = '1'; del.textContent = 'Wirklich löschen?'; setTimeout(() => { del.dataset.sicher = ''; del.textContent = 'Löschen'; }, 4000); return; }
      try { await api('kontakte/' + id, { method: 'DELETE' }); dirtyK(); toast('Gelöscht.'); location.hash = '#/' + (kunde ? 'kunden' : 'akquise'); } catch (e) { fehler(e); }
    };
  }, 'kunden');

  /* ----- Import der Makler-Liste (CSV aus Excel oder Numbers) ----- */
  const SPALTEN = [['firma', 'Firma / Büro', /^(firma|unternehmen|büro|buero|maklerbüro|maklerbuero|makler|name des büros|company|firmenname)$/],
    ['name', 'Ansprechpartner', /^(ansprechpartner|kontakt|kontaktperson|name|inhaber|geschäftsführer|person|vorname nachname)$/], ['mail', 'E-Mail', /^(e-?mail|mail|e-?mail-adresse|email address)$/],
    ['tel', 'Telefon', /^(telefon|tel\.?|telefonnummer|phone|mobil|handy)$/], ['strasse', 'Straße', /^(straße|strasse|str\.?|adresse|anschrift|address)$/], ['plz', 'PLZ', /^(plz|postleitzahl|zip)$/],
    ['ort', 'Ort', /^(ort|stadt|city|gemeinde)$/], ['web', 'Website', /^(website|webseite|web|homepage|url|internet)$/], ['notiz', 'Notiz', /^(notiz|notizen|bemerkung|bemerkungen|kommentar|info)$/]];
  function csvLesen(text) {
    text = text.replace(/^﻿/, '');
    const erste = text.split(/\r?\n/)[0] || '', zaehl = c => (erste.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length;
    const tr = [';', ',', '\t'].sort((a, b) => zaehl(b) - zaehl(a))[0];
    const zeilen = []; let z = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === tr) { z.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; z.push(f); f = ''; if (z.some(x => x.trim())) zeilen.push(z); z = []; }
      else f += c;
    }
    z.push(f); if (z.some(x => x.trim())) zeilen.push(z);
    return zeilen;
  }
  PCA.weg('akquise/import', async () => {
    const L = await kontakte(true), mails = new Set(L.map(k => k.mail).filter(Boolean)), firmen = new Set(L.map(k => (k.firma + '|' + k.ort).toLowerCase()));
    let daten = null, zuord = [], wahl = new Set();
    app().innerHTML = '<p class="mb-4"><a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/akquise">← Akquise</a></p>' + titel('Liste importieren') +
      '<section class="card p-4 sm:p-5 max-w-[860px]"><p class="text-ink2 max-w-[64ch]">In Excel: <b>Datei → Speichern unter → CSV UTF-8</b>. In Numbers: <b>Ablage → Exportieren → CSV</b>. Die erste Zeile muss die Spaltennamen enthalten (z. B. Firma, Ansprechpartner, E-Mail, Telefon, Straße, PLZ, Ort). Doppelte Einträge werden erkannt und nicht übernommen.</p>' +
      '<label class="drop mt-4 !py-6"><input type="file" id="i-f" accept=".csv,text/csv,text/plain"><b class="font-semibold">CSV-Datei wählen</b><span class="text-sm text-muted">oder unten einfügen</span></label>' +
      '<label class="field mt-4"><span class="lbl">Oder Tabelle hier einfügen (aus Excel/Numbers kopiert)</span><textarea class="inp min-h-[110px] font-mono !text-[.84rem]" id="i-t" rows="4" placeholder="Firma;Ansprechpartner;E-Mail;Telefon;Straße;PLZ;Ort"></textarea></label></section>' +
      '<div id="i-v" class="mt-5"></div>';
    const zeige = () => {
      if (!daten || daten.length < 2) { $('#i-v').innerHTML = daten ? '<p class="card p-5">In der Datei steht nur eine Zeile. Die erste Zeile muss die Spaltennamen enthalten.</p>' : ''; return; }
      const kopf = daten[0], rows = daten.slice(1).map(z => { const o = {}; zuord.forEach((f, i) => { if (f) o[f] = (o[f] ? o[f] + ' ' : '') + String(z[i] || '').trim(); }); return o; });
      rows.forEach(o => { // „Straße 1, 14612 Falkensee“ in einer Spalte aufteilen
        if (o.strasse && !o.plz) { const mm = /^(.*?),\s*(\d{5})\s+(.+)$/.exec(o.strasse); if (mm) { o.strasse = mm[1]; o.plz = mm[2]; o.ort = o.ort || mm[3]; } }
        if (o.mail) o.mail = o.mail.toLowerCase().replace(/^mailto:/, '');
        o._doppelt = !!(o.mail && mails.has(o.mail)) || firmen.has(((o.firma || '') + '|' + (o.ort || '')).toLowerCase()) && !!o.firma;
        o._leer = !o.firma && !o.name;
      });
      if (!wahl.size) rows.forEach((o, i) => { if (!o._doppelt && !o._leer) wahl.add(i); });
      const n = [...wahl].length;
      $('#i-v').innerHTML = '<section class="card"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Spalten zuordnen</h2><div class="p-4 sm:p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
          kopf.map((k, i) => '<label class="field"><span class="lbl">Spalte „' + esc(k || '(leer)') + '“</span><select class="inp" data-sp="' + i + '"><option value="">nicht übernehmen</option>' + SPALTEN.map(s => '<option value="' + s[0] + '"' + (zuord[i] === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></label>').join('') + '</div></section>' +
        '<section class="card mt-5"><div class="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-b border-ink"><h2 class="font-display uppercase text-[1.3rem] grow">Vorschau</h2><span class="font-mono text-[.8rem] text-muted">' + rows.length + ' Zeilen · ' + rows.filter(o => o._doppelt).length + ' schon vorhanden</span></div>' +
          '<div class="overflow-x-auto"><table class="w-full text-[.88rem]"><thead><tr class="border-b border-rule text-left"><th class="p-2"></th>' + ['Firma', 'Ansprechpartner', 'E-Mail', 'Telefon', 'Straße', 'PLZ', 'Ort'].map(x => '<th class="p-2 lbl font-medium">' + x + '</th>').join('') + '<th class="p-2"></th></tr></thead><tbody>' +
          rows.slice(0, 300).map((o, i) => '<tr class="border-b border-rule' + (o._doppelt || o._leer ? ' text-muted' : '') + '"><td class="p-2"><input type="checkbox" class="w-4 h-4" data-w="' + i + '"' + (wahl.has(i) ? ' checked' : '') + (o._leer ? ' disabled' : '') + '></td>' +
            ['firma', 'name', 'mail', 'tel', 'strasse', 'plz', 'ort'].map(f => '<td class="p-2 max-w-[220px] truncate">' + esc(o[f] || '') + '</td>').join('') + '<td class="p-2 font-mono text-[.74rem]">' + (o._leer ? 'ohne Firma/Name' : o._doppelt ? 'schon vorhanden' : '') + '</td></tr>').join('') +
          '</tbody></table></div>' + (rows.length > 300 ? '<p class="px-4 py-2 text-[.84rem] text-muted">Vorschau zeigt die ersten 300 Zeilen, übernommen werden alle ausgewählten.</p>' : '') +
          '<div class="p-4 sm:p-5 border-t border-ink"><button type="button" class="btn-primary btn-big" id="i-go"' + (n ? '' : ' disabled') + '>' + n + ' Kontakt' + (n === 1 ? '' : 'e') + ' übernehmen</button></div></section>';
      $$('[data-sp]', app()).forEach(s => s.onchange = () => { zuord[+s.dataset.sp] = s.value; wahl.clear(); zeige(); });
      $$('[data-w]', app()).forEach(c => c.onchange = () => { c.checked ? wahl.add(+c.dataset.w) : wahl.delete(+c.dataset.w); const n2 = wahl.size, b = $('#i-go'); b.disabled = !n2; b.textContent = n2 + ' Kontakt' + (n2 === 1 ? '' : 'e') + ' übernehmen'; });
      $('#i-go').onclick = async () => {
        const liste = rows.filter((o, i) => wahl.has(i)).map(o => { const x = Object.assign({}, o); delete x._doppelt; delete x._leer; return x; });
        const b = $('#i-go'); b.disabled = true; b.textContent = 'Übernimmt …';
        try { const r = await api('kontakte/import', { method: 'POST', json: { liste } }); dirtyK(); toast(r.neu + ' übernommen' + (r.doppelt ? ', ' + r.doppelt + ' schon vorhanden' : '') + '.'); location.hash = '#/akquise?f=neu'; }
        catch (e) { fehler(e); b.disabled = false; }
      };
    };
    const lade = text => { daten = csvLesen(text); zuord = (daten[0] || []).map(k => { const n = String(k).trim().toLowerCase(); const s = SPALTEN.find(x => x[2].test(n)); return s ? s[0] : ''; }); const doppelt = new Set(); zuord = zuord.map(f => f && !doppelt.has(f) ? (doppelt.add(f), f) : f === 'strasse' || f === 'notiz' ? f : ''); wahl = new Set(); zeige(); };
    $('#i-f').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const buf = await f.arrayBuffer(); let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (er) { text = new TextDecoder('windows-1252').decode(buf); }
      lade(text);
    };
    let tt = 0; $('#i-t').oninput = e => { clearTimeout(tt); tt = setTimeout(() => { if (e.target.value.trim()) lade(e.target.value); }, 300); };
  }, 'akquise');

  /* ======================= Belege ======================= */
  const BFILTER = [['offen', 'Zu tun', b => b.status === 'entwurf' || b.status === 'offen' || b.status === 'versendet'], ['rechnungen', 'Rechnungen', b => b.art !== 'angebot'],
    ['angebote', 'Angebote', b => b.art === 'angebot'], ['ueber', 'Überfällig', ueberfaellig], ['alle', 'Alle', () => true]];
  PCA.weg('belege', async (m, q) => {
    const L = (await api('belege')).liste; let filter = q.get('f') || 'offen', such = '';
    const jahr = String(new Date().getFullYear());
    const zeichne = () => {
      const f = BFILTER.find(x => x[0] === filter) || BFILTER[0], s = such.trim().toLowerCase();
      const rows = L.filter(f[2]).filter(b => !s || [b.nr, b.objekt, b.bestell_nr, wer(b.kaeufer), b.kaeufer && b.kaeufer.name].join(' ').toLowerCase().includes(s));
      const re = L.filter(b => (b.art === 'rechnung' || b.art === 'storno') && b.festgeschrieben && (b.datum || '').startsWith(jahr));
      const offen = L.filter(b => b.art === 'rechnung' && b.status === 'offen');
      const bezahlt = L.filter(b => b.art === 'rechnung' && b.status === 'bezahlt' && (b.bezahlt_am || '').startsWith(jahr)).reduce((x, b) => x + (b.bezahlt_betrag || 0), 0);
      app().innerHTML = titel('Belege', '<div class="ml-auto flex flex-wrap gap-2"><a class="btn-ghost" href="#/beleg/neu?art=angebot">Neues Angebot</a><a class="btn-primary" href="#/beleg/neu?art=rechnung">Neue Rechnung</a></div>') +
        '<dl class="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink mb-5">' + zelle('Rechnungen ' + jahr, eur(re.reduce((x, b) => x + b.summe, 0)), '', re.length + ' Belege, Storno verrechnet') + zelle('Eingegangen ' + jahr, eur(bezahlt), 'text-ok', 'erfasste Zahlungen') +
          zelle('Offen', eur(offen.reduce((x, b) => x + b.summe - (b.bezahlt_betrag || 0), 0)), offen.some(ueberfaellig) ? 'text-warn' : '', offen.filter(ueberfaellig).length + ' überfällig') + zelle('Angebote offen', L.filter(b => b.art === 'angebot' && b.status === 'versendet').length, '', 'warten auf Antwort') + '</dl>' +
        '<div class="flex flex-wrap items-center gap-2 mb-4">' + BFILTER.map(x => '<button type="button" data-f="' + x[0] + '" class="min-h-[40px] px-3 border font-mono text-[.74rem] uppercase tracking-[.08em] ' + (x[0] === filter ? 'bg-ink text-sheet border-ink' : 'bg-sheet border-rule hover:border-ink') + '">' + x[1] + ' <span class="opacity-60">' + L.filter(x[2]).length + '</span></button>').join('') +
          '<input id="bq" class="inp !min-h-[40px] sm:!w-[240px] sm:ml-auto" type="search" placeholder="Suchen: Nummer, Kunde, Objekt" value="' + esc(such) + '" aria-label="Belege durchsuchen"></div>' +
        (rows.length ? '<ul class="card divide-y divide-rule">' + rows.map(b => '<li><a class="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center px-4 py-3.5 hover:bg-wash" href="#/beleg/' + b.id + '">' +
            '<span class="order-1">' + belegTag(b) + '</span><span class="order-3 sm:order-2 col-span-2 sm:col-span-1 min-w-0"><b class="block truncate">' + esc(wer(b.kaeufer)) + '</b><span class="block truncate text-[.86rem] text-ink2">' + ART[b.art] + (b.objekt ? ' · ' + esc(b.objekt) : '') + '</span></span>' +
            '<span class="order-4 sm:order-3 font-mono text-[.78rem] text-muted">' + esc(b.nr || 'Entwurf') + '<br>' + tagText(b.datum) + (b.art === 'rechnung' && b.status === 'offen' ? ' · fällig ' + datum(b.faellig) : '') + '</span>' +
            '<b class="order-2 sm:order-4 font-mono text-right whitespace-nowrap">' + eur(b.summe) + '</b></a></li>').join('') + '</ul>'
          : '<p class="card p-6 text-ink2">' + (L.length ? 'Hier ist nichts.' : 'Noch keine Belege. Rechnungen entstehen am einfachsten aus einer gelieferten Bestellung: „Rechnung erstellen“.') + '</p>') +
        '<p class="mt-4 font-mono text-[.74rem] text-muted">Rechnungen werden mit dem Festschreiben lückenlos nummeriert und danach nicht mehr verändert. Speichere jedes PDF zusätzlich in deiner Ablage (8 Jahre Aufbewahrung).</p>';
      $$('[data-f]', app()).forEach(b => b.onclick = () => { filter = b.dataset.f; zeichne(); });
      const qi = $('#bq'); qi.oninput = () => { such = qi.value; const p = qi.selectionStart; zeichne(); const n = $('#bq'); n.focus(); n.setSelectionRange(p, p); };
    };
    zeichne();
  }, 'belege');

  // Positionen aus einer Bestellung: gespeicherte Zeilen, sonst aus dem Text gelesen
  function positionenAus(b) {
    const d = b.daten || {}, e = d.eingabe || {};
    let z = Array.isArray(e.zeilen) ? e.zeilen : String(d.positionen || '').split('\n').map(l => { const mm = /^(.*?):\s*([−-]?)\s*([\d.]+,\d{2}) €$/.exec(l.trim()); return mm ? [mm[1], (mm[2] ? -1 : 1) * parseFloat(mm[3].replace(/\./g, '').replace(',', '.'))] : null; }).filter(Boolean);
    z = z.filter(x => x && !/^(Gesamt|Richtpreis)$/i.test(x[0]) && x[1] !== 0);
    const pos = z.map(x => ({ text: String(x[0]).replace(/^Startaktion/, 'Startaktion'), menge: 1, einheit: 'Pauschal', preis: Math.round(x[1] * 100) / 100 }));
    const summe = pos.reduce((s, p) => s + p.preis, 0), soll = +b.preis || 0;
    if (Math.abs(summe - soll) > 0.004) pos.push({ text: 'Preisanpassung laut Absprache', menge: 1, einheit: 'Pauschal', preis: Math.round((soll - summe) * 100) / 100 });
    if (pos.length && b.typ && !pos[0].text.toLowerCase().includes(b.typ.toLowerCase().split(' ')[0])) pos[0].text = b.typ + ': ' + pos[0].text;
    return pos;
  }
  function geliefertAm(b) {
    const v = (b.verlauf || []).filter(x => /geliefert|Lieferung gesendet/.test(x.was)).pop();
    const d = v ? new Date(v.t) : new Date();
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  PCA.belegAusBestellung = async (b, kontakt, art) => {
    try {
      let k = null; if (kontakt && kontakt.id) k = (await api('kontakte/' + kontakt.id)).k;
      const kaeufer = { firma: (k && k.firma) || b.firma || '', name: (k && k.name) || b.name || '', strasse: (k && k.strasse) || '', plz: (k && k.plz) || '', ort: (k && k.ort) || '', mail: (k && k.mail) || b.mail || '' };
      const r = await api('belege', { method: 'POST', json: { art, kontakt_id: k ? k.id : null, bestell_nr: b.nr, objekt: b.objekt || '', kaeufer, positionen: positionenAus(b), leistung: art === 'rechnung' ? geliefertAm(b) : '' } });
      toast(art === 'rechnung' ? 'Rechnungsentwurf angelegt. Bitte prüfen und festschreiben.' : 'Angebot angelegt. Bitte prüfen und senden.');
      location.hash = '#/beleg/' + r.beleg.id;
    } catch (e) { fehler(e); }
  };
  PCA.weg('beleg/neu', async (m, q) => {
    const art = q.get('art') === 'angebot' ? 'angebot' : 'rechnung', kid = +q.get('kontakt') || null;
    let k = null; if (kid) k = (await api('kontakte/' + kid)).k;
    const kaeufer = k ? { firma: k.firma, name: k.name, strasse: k.strasse, plz: k.plz, ort: k.ort, mail: k.mail } : {};
    const r = await api('belege', { method: 'POST', json: { art, kontakt_id: kid, kaeufer, positionen: [] } });
    location.replace('#/beleg/' + r.beleg.id);
  }, 'belege');

  /* ----- Ein Beleg: bearbeiten (Entwurf), ansehen, senden, Zahlung, Storno ----- */
  PCA.weg(/^beleg\/(\d+)$/, async m => {
    const id = +m[1];
    const [r, KL, C] = await Promise.all([api('belege/' + id), kontakte(), konfig()]);
    const F = await firma();
    let b = r.beleg; const fest = !!b.festgeschrieben, angebot = b.art === 'angebot';
    const editierbar = angebot ? b.status !== 'angenommen' : !fest;
    const bezugNr = r.bezugBeleg ? r.bezugBeleg.nr : '';
    let dirty = false;
    const kunden = KL.slice().sort((a, c) => wer(a).localeCompare(wer(c)));
    const posZeile = (p, i) => '<div class="grid grid-cols-[64px_minmax(0,1fr)_104px_40px] gap-2 items-start border-b border-rule py-2.5" data-pos="' + i + '">' +
      '<textarea class="inp !min-h-[44px] col-span-4 !text-[.92rem]" rows="1" data-p="text" aria-label="Leistung">' + esc(p.text) + '</textarea>' +
      '<input class="inp !min-h-[44px] font-mono !px-2" data-p="menge" type="number" step="0.01" inputmode="decimal" value="' + p.menge + '" aria-label="Menge">' +
      '<input class="inp !min-h-[44px] !px-2" data-p="einheit" list="einheiten" value="' + esc(p.einheit) + '" aria-label="Einheit">' +
      '<input class="inp !min-h-[44px] font-mono !px-2" data-p="preis" type="number" step="0.01" inputmode="decimal" value="' + p.preis + '" aria-label="Einzelpreis in €">' +
      '<button type="button" class="min-h-[44px] text-muted hover:text-warn" data-rm="' + i + '" aria-label="Position entfernen">✕</button></div>';
    const vorschau = () => { const ziel = $('#b-doc'); if (!ziel) return; ziel.innerHTML = PCB.html(b, b.verkaeufer || F, { bezugNr }); skaliere(); };
    const skaliere = () => { const box = $('#b-rahmen'), doc = $('#b-doc .pcdoc'); if (!box || !doc) return; const s = Math.min(1, box.clientWidth / doc.offsetWidth); doc.style.transform = 'scale(' + s + ')'; doc.style.transformOrigin = 'top left'; box.style.height = (doc.offsetHeight * s) + 'px'; };
    const aktionen = () => {
      const a = [];
      if (angebot) {
        if (editierbar) a.push(['speichern', 'Speichern', 0]);
        a.push(['senden', b.versendet ? 'Erneut senden' : 'Per E-Mail senden', 1], ['pdf', 'PDF laden', 0]);
        if (b.status === 'versendet' || b.status === 'entwurf') a.push(['status:angenommen', 'Angenommen', 0], ['status:abgelehnt', 'Abgelehnt', 0]);
        a.push(['zurechnung', 'In Rechnung übernehmen', 0], ['loeschen', 'Löschen', 2]);
      } else if (!fest) a.push(['speichern', 'Speichern', 0], ['festschreiben', 'Festschreiben', 1], ['pdf', 'Entwurf als PDF', 0], ['loeschen', 'Löschen', 2]);
      else {
        a.push(['senden', b.versendet ? 'Erneut senden' : 'Per E-Mail senden', b.versendet ? 0 : 1], ['pdf', 'PDF laden', 0], ['drucken', 'Drucken', 0]);
        if (b.art === 'rechnung' && b.status === 'offen') a.push(['zahlung', 'Zahlung erfassen', b.versendet ? 1 : 0]);
        if (b.art === 'rechnung' && b.status === 'bezahlt') a.push(['zurueck', 'Zahlung zurücknehmen', 0]);
        if (b.art === 'rechnung' && b.status !== 'storniert') a.push(['storno', 'Stornieren', 2]);
      }
      return a;
    };
    const kopfText = angebot ? (b.status === 'angenommen' ? 'Angenommen. Als Nächstes: liefern, dann „In Rechnung übernehmen“.' : b.status === 'versendet' ? 'Verschickt ' + zeit(b.versendet) + '. Warte auf Antwort oder fass nach.' : 'Prüfen, dann per E-Mail senden. Das PDF entsteht beim Senden.')
      : b.art === 'storno' ? 'Stornorechnung zu ' + esc(bezugNr) + '. Schick sie dem Kunden, damit seine Buchhaltung stimmt.'
      : !fest ? 'Entwurf. Prüfen, dann festschreiben: Erst dann bekommt die Rechnung ihre Nummer und lässt sich nicht mehr ändern.'
      : b.status === 'storniert' ? 'Storniert' + (r.storno ? ' durch <a class="underline" href="#/beleg/' + r.storno.id + '">' + esc(r.storno.nr) + '</a>' : '') + '.'
      : b.status === 'bezahlt' ? 'Bezahlt am ' + tagText(b.bezahlt_am) + ' (' + eur(b.bezahlt_betrag) + ').'
      : (b.versendet ? 'Verschickt ' + zeit(b.versendet) + '. ' : 'Noch nicht verschickt. ') + 'Fällig am ' + tagText(b.faellig) + (ueberfaellig(b) ? ', überfällig.' : '.');
    app().innerHTML = '<p class="mb-4"><a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/belege">← Alle Belege</a>' +
        (b.kontakt_id ? ' <span class="text-muted">·</span> <a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/k/' + b.kontakt_id + '">Kunde</a>' : '') +
        (b.bestell_nr ? ' <span class="text-muted">·</span> <a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/b/' + encodeURIComponent(b.bestell_nr) + '">Bestellung ' + esc(b.bestell_nr) + '</a>' : '') + '</p>' +
      titel(ART[b.art] + ' <span class="font-mono text-[1.1rem] text-muted align-middle">' + esc(b.nr || 'Entwurf') + '</span>', belegTag(b)) +
      '<section class="card border-2 ' + (ueberfaellig(b) ? 'border-warn' : 'border-ink') + ' p-4 sm:p-5 mb-5"><p class="text-ink2">' + kopfText + '</p><div class="mt-4 flex flex-wrap gap-2">' +
        aktionen().map(x => '<button type="button" data-a="' + x[0] + '" class="' + (x[2] === 1 ? 'btn-primary' : 'btn-ghost') + (x[2] === 2 ? ' !border-warn !text-warn sm:ml-auto' : '') + '">' + x[1] + '</button>').join('') + '</div>' +
        '<div id="b-box" hidden class="mt-5 pt-5 border-t border-ink"></div></section>' +
      '<div class="grid xl:grid-cols-12 gap-5 items-start">' +
      (editierbar ? '<form id="bf" class="xl:col-span-5 flex flex-col gap-5" novalidate>' +
        '<section class="card p-4 sm:p-5 grid gap-4"><h2 class="font-display uppercase text-[1.3rem] leading-none">Kunde</h2>' +
          '<label class="field"><span class="lbl">Aus Kunden übernehmen</span><select class="inp" id="b-k"><option value="">– Kunde wählen –</option>' + kunden.map(k => '<option value="' + k.id + '"' + (k.id === b.kontakt_id ? ' selected' : '') + '>' + esc(wer(k)) + (k.ort ? ' · ' + esc(k.ort) : '') + (k.phase !== 'kunde' ? ' (Akquise)' : '') + '</option>').join('') + '</select></label>' +
          '<div class="grid sm:grid-cols-2 gap-3">' + ['firma:Firma', 'name:Ansprechpartner', 'strasse:Straße und Hausnummer', 'plz:PLZ', 'ort:Ort', 'mail:E-Mail für den Versand'].map(x => { const [k, l] = x.split(':'); return '<label class="field' + (k === 'strasse' || k === 'mail' ? ' sm:col-span-2' : '') + '"><span class="lbl">' + l + '</span><input class="inp" data-kf="' + k + '" value="' + esc((b.kaeufer || {})[k] || '') + '"' + (k === 'mail' ? ' type="email"' : '') + '></label>'; }).join('') + '</div>' +
          '<label class="opt" id="b-kmerk-w" hidden><input type="checkbox" id="b-kmerk" checked><span class="box"></span><span>Anschrift auch beim Kunden speichern</span></label></section>' +
        '<section class="card p-4 sm:p-5 grid gap-4"><h2 class="font-display uppercase text-[1.3rem] leading-none">Angaben</h2><div class="grid sm:grid-cols-2 gap-3">' +
          '<label class="field sm:col-span-2"><span class="lbl">Objekt</span><input class="inp" id="b-obj" value="' + esc(b.objekt) + '" placeholder="z. B. Lindenallee 4, 2. OG links"></label>' +
          '<label class="field"><span class="lbl">' + (angebot ? 'Angebotsdatum' : 'Rechnungsdatum') + '</span><input class="inp font-mono" type="date" id="b-dat" value="' + esc(b.datum) + '"></label>' +
          (angebot ? '<label class="field"><span class="lbl">Gültig bis</span><input class="inp font-mono" type="date" id="b-gue" value="' + esc(b.gueltig) + '"></label>'
                   : '<label class="field"><span class="lbl">Leistungsdatum / -zeitraum</span><input class="inp font-mono" id="b-lei" value="' + esc(b.leistung) + '" placeholder="z. B. 16.11.2026"></label>') + '</div></section>' +
        '<section class="card p-4 sm:p-5"><h2 class="font-display uppercase text-[1.3rem] leading-none mb-3">Positionen</h2><div class="grid grid-cols-[64px_minmax(0,1fr)_104px_40px] gap-2 lbl pb-1 border-b border-ink"><span>Menge</span><span>Einheit</span><span>Preis €</span><span></span></div>' +
          '<div id="b-pos"></div><datalist id="einheiten"><option>Wohnung</option><option>Haus</option><option>Ebene</option><option>Geschoss</option><option>Pauschal</option><option>Stunde</option><option>Stück</option></datalist>' +
          '<div class="mt-3 grid gap-2"><button type="button" class="btn-ghost !min-h-[42px] justify-self-start" id="b-plus">Leere Position</button><select class="inp !min-h-[42px] min-w-0" id="b-kat"><option value="">Aus der Preisliste einfügen …</option>' + KATALOG.map(x => '<option value="' + x[0] + '">' + esc(x[1]) + ' · ' + eur(C.preise[x[0]]) + '</option>').join('') + '<option value="startaktion">Startaktion: erste Wohnung kostenlos · −' + eur(C.preise.wohnung + C.preise.flaechen) + '</option></select></div>' +
          '<p class="mt-3 text-right font-mono">Summe <b class="text-[1.15rem] text-blue" id="b-sum">' + eur(b.summe) + '</b></p></section>' +
        '<section class="card p-4 sm:p-5 grid gap-3"><h2 class="font-display uppercase text-[1.3rem] leading-none">Texte</h2><label class="field"><span class="lbl">Einleitung</span><textarea class="inp min-h-[80px]" id="b-ein" rows="3">' + esc(b.text_ein) + '</textarea></label>' +
          '<label class="field"><span class="lbl">Schluss</span><textarea class="inp min-h-[80px]" id="b-aus" rows="3">' + esc(b.text_aus) + '</textarea><span class="text-[.78rem] text-muted">Platzhalter: {GUELTIG}, {FAELLIG}, {NR}</span></label></section></form>' : '') +
      '<div class="' + (editierbar ? 'xl:col-span-7' : 'xl:col-span-12 max-w-[900px]') + '"><div class="xl:sticky xl:top-[80px]"><span class="lbl">Vorschau</span><div id="b-rahmen" class="pcdoc-rahmen mt-2 bg-white"><div id="b-doc"></div></div></div></div></div>' +
      '<section class="card mt-5 max-w-[900px]"><h2 class="lbl px-4 pt-4">Verlauf</h2><ol class="px-4 py-3 grid gap-2 text-[.9rem]">' + (b.verlauf || []).slice().reverse().map(v => '<li class="grid grid-cols-[92px_minmax(0,1fr)] gap-3"><span class="font-mono text-[.76rem] text-muted pt-0.5">' + zeit(v.t) + '</span><span>' + esc(v.was) + '</span></li>').join('') + '</ol></section>';
    vorschau(); window.addEventListener('resize', skaliere);

    if (editierbar) {
      const kmerk = () => { const k = KL.find(x => x.id === b.kontakt_id); $('#b-kmerk-w').hidden = !(k && (!k.strasse || !k.plz || !k.ort) && b.kaeufer.strasse); };
      const lese = () => {
        b.kaeufer = {}; $$('[data-kf]', app()).forEach(i => { b.kaeufer[i.dataset.kf] = i.value.trim(); });
        b.objekt = $('#b-obj').value.trim(); b.datum = $('#b-dat').value || b.datum;
        if (angebot) b.gueltig = $('#b-gue').value || b.gueltig; else b.leistung = $('#b-lei').value.trim();
        b.positionen = $$('[data-pos]', app()).map(z => ({ text: $('[data-p="text"]', z).value.trim(), menge: +$('[data-p="menge"]', z).value || 0, einheit: $('[data-p="einheit"]', z).value.trim(), preis: +$('[data-p="preis"]', z).value || 0 }));
        b.summe = Math.round(b.positionen.reduce((s, p) => s + Math.round(p.menge * p.preis * 100) / 100, 0) * 100) / 100;
        b.text_ein = $('#b-ein').value; b.text_aus = $('#b-aus').value;
        $('#b-sum').textContent = eur(b.summe); kmerk();
      };
      const posZeichnen = () => {
        $('#b-pos').innerHTML = b.positionen.map(posZeile).join('') || '<p class="py-3 text-ink2">Noch keine Position.</p>';
        $$('[data-rm]', app()).forEach(x => x.onclick = () => { lese(); b.positionen.splice(+x.dataset.rm, 1); posZeichnen(); dirty = true; lese(); vorschau(); });
        $$('#b-pos textarea').forEach(t => { const h = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }; h(); t.addEventListener('input', h); });
      };
      posZeichnen();
      $('#bf').addEventListener('input', () => { dirty = true; lese(); vorschau(); });
      $('#b-k').onchange = e => {
        const k = KL.find(x => x.id === +e.target.value); b.kontakt_id = k ? k.id : null;
        if (k) [['firma', k.firma], ['name', k.name], ['strasse', k.strasse], ['plz', k.plz], ['ort', k.ort], ['mail', k.mail]].forEach(([f, v]) => { $('[data-kf="' + f + '"]', app()).value = v || ''; });
        dirty = true; lese(); vorschau();
      };
      $('#b-plus').onclick = () => { lese(); b.positionen.push({ text: '', menge: 1, einheit: 'Pauschal', preis: 0 }); posZeichnen(); const t = $$('#b-pos textarea').pop(); if (t) t.focus(); };
      $('#b-kat').onchange = e => {
        const v = e.target.value; if (!v) return; lese();
        if (v === 'startaktion') b.positionen.push({ text: 'Startaktion: erste Wohnung inkl. Flächen kostenlos', menge: 1, einheit: 'Wohnung', preis: -(C.preise.wohnung + C.preise.flaechen) });
        else { const x = KATALOG.find(y => y[0] === v); b.positionen.push({ text: x[1], menge: 1, einheit: x[2], preis: C.preise[v] }); }
        e.target.value = ''; posZeichnen(); dirty = true; lese(); vorschau();
      };
      kmerk();
      PCA.speichereBeleg = async () => {
        lese();
        const j = { kontakt_id: b.kontakt_id, kaeufer: b.kaeufer, objekt: b.objekt, datum: b.datum, positionen: b.positionen, text_ein: b.text_ein, text_aus: b.text_aus };
        if (angebot) j.gueltig = b.gueltig; else j.leistung = b.leistung;
        const res = await api('belege/' + id, { method: 'PATCH', json: j }); b = Object.assign(b, res.beleg); dirty = false;
        if (!$('#b-kmerk-w').hidden && $('#b-kmerk').checked && b.kontakt_id) { await api('kontakte/' + b.kontakt_id, { method: 'PATCH', json: { strasse: b.kaeufer.strasse, plz: b.kaeufer.plz, ort: b.kaeufer.ort } }); dirtyK(); }
        return b;
      };
    } else PCA.speichereBeleg = async () => b;
    PCA.leaveGuard = () => dirty;

    const box = $('#b-box');
    const zeigeBox = html => { box.hidden = false; box.innerHTML = html; box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    $$('[data-a]', app()).forEach(btn => btn.onclick = async () => {
      const [a, wert] = btn.dataset.a.split(':');
      try {
        if (a === 'speichern') { await PCA.speichereBeleg(); toast('Gespeichert.'); return PCA.neu(); }
        if (a === 'pdf') { await PCA.speichereBeleg(); btn.disabled = true; const blob = await PCB.pdf(b, b.verkaeufer || F, { bezugNr }); PCB.laden(blob, PCB.dateiname(b)); btn.disabled = false; return; }
        if (a === 'drucken') { window.print(); return; }
        if (a === 'status') { await PCA.speichereBeleg(); await api('belege/' + id, { method: 'PATCH', json: { status: wert } }); toast(wert === 'angenommen' ? 'Angenommen. Die Bestellung ist jetzt bestätigt.' : 'Gespeichert.'); return PCA.neu(); }
        if (a === 'zurechnung') {
          await PCA.speichereBeleg();
          const n = await api('belege', { method: 'POST', json: { art: 'rechnung', kontakt_id: b.kontakt_id, bestell_nr: b.bestell_nr, objekt: b.objekt, kaeufer: b.kaeufer, positionen: b.positionen, von_angebot: b.nr } });
          toast('Rechnungsentwurf aus ' + b.nr + ' angelegt.'); location.hash = '#/beleg/' + n.beleg.id; return;
        }
        if (a === 'loeschen') {
          if (btn.dataset.sicher !== '1') { btn.dataset.sicher = '1'; btn.textContent = 'Wirklich löschen?'; setTimeout(() => { btn.dataset.sicher = ''; btn.textContent = 'Löschen'; }, 4000); return; }
          await api('belege/' + id, { method: 'DELETE' }); toast('Gelöscht.'); PCA.leaveGuard = null; location.hash = '#/belege'; return;
        }
        if (a === 'festschreiben') {
          await PCA.speichereBeleg();
          zeigeBox('<b class="font-display uppercase text-[1.3rem]">Rechnung festschreiben?</b><p class="mt-2 text-ink2 max-w-[62ch]">Die Rechnung bekommt die nächste fortlaufende Nummer und lässt sich danach nicht mehr ändern oder löschen. Fehler korrigierst du dann nur noch über eine Stornorechnung.</p>' +
            (!F.iban ? '<p class="mt-2 text-warn">In den Einstellungen fehlt deine Bankverbindung. Ohne IBAN weiß der Kunde nicht, wohin er überweisen soll.</p>' : '') +
            '<div class="mt-4 flex flex-wrap gap-2"><button type="button" class="btn-primary" id="fs-ja">Ja, festschreiben</button><button type="button" class="btn-ghost" id="fs-nein">Abbrechen</button></div>');
          $('#fs-nein').onclick = () => { box.hidden = true; };
          $('#fs-ja').onclick = async () => { try { const x = await api('belege/' + id + '/festschreiben', { method: 'POST', json: {} }); toast('Festgeschrieben als ' + x.beleg.nr + '.'); PCA.neu(); } catch (e) { fehler(e); } };
          return;
        }
        if (a === 'zahlung') {
          zeigeBox('<b class="font-display uppercase text-[1.3rem]">Zahlungseingang</b><div class="mt-3 grid sm:grid-cols-[200px_200px_auto] gap-3 items-end"><label class="field"><span class="lbl">Eingang am</span><input class="inp font-mono" type="date" id="z-d" value="' + heute() + '"></label>' +
            '<label class="field"><span class="lbl">Betrag in €</span><input class="inp font-mono" type="number" step="0.01" id="z-b" value="' + (Math.round((b.summe - (b.bezahlt_betrag || 0)) * 100) / 100) + '"></label><button type="button" class="btn-primary" id="z-ok">Erfassen</button></div>' +
            '<p class="mt-2 text-[.84rem] text-muted">Ist die Rechnung voll bezahlt, wird auch die zugehörige Bestellung „Bezahlt“.</p>');
          $('#z-ok').onclick = async () => { try { await api('belege/' + id + '/zahlung', { method: 'POST', json: { datum: $('#z-d').value, betrag: +$('#z-b').value } }); toast('Zahlung erfasst.'); PCA.neu(); } catch (e) { fehler(e); } };
          return;
        }
        if (a === 'zurueck') { await api('belege/' + id, { method: 'PATCH', json: { zahlungZurueck: true } }); toast('Zahlung zurückgenommen.'); return PCA.neu(); }
        if (a === 'storno') {
          zeigeBox('<b class="font-display uppercase text-[1.3rem]">Rechnung stornieren?</b><p class="mt-2 text-ink2 max-w-[62ch]">Es entsteht eine Stornorechnung mit eigener Nummer über ' + eur(-b.summe) + '. Die Rechnung ' + esc(b.nr) + ' bleibt erhalten und wird als storniert markiert. Danach kannst du eine korrigierte Rechnung schreiben.</p>' +
            '<div class="mt-4 flex flex-wrap gap-2"><button type="button" class="btn-primary !bg-warn !border-warn" id="st-ja">Stornorechnung erstellen</button><button type="button" class="btn-ghost" id="st-nein">Abbrechen</button></div>');
          $('#st-nein').onclick = () => { box.hidden = true; };
          $('#st-ja').onclick = async () => { try { const x = await api('belege/' + id + '/storno', { method: 'POST', json: {} }); toast('Stornorechnung ' + x.beleg.nr + ' erstellt.'); location.hash = '#/beleg/' + x.beleg.id; } catch (e) { fehler(e); } };
          return;
        }
        if (a === 'senden') {
          await PCA.speichereBeleg();
          if (!fest && !angebot) return toast('Bitte zuerst festschreiben.', true);
          const k = b.kaeufer || {}, an = k.mail || '', anrede = 'Guten Tag' + (k.name ? ' ' + k.name : '') + ',';
          const vorlage = angebot ? { betreff: 'Angebot ' + b.nr + (b.objekt ? ' · ' + b.objekt : '') + ' · PlavoCAD', text: anrede + '\n\nanbei mein Angebot ' + b.nr + (b.objekt ? ' für ' + b.objekt : '') + ' über ' + eur(b.summe) + '. Es gilt bis zum ' + tagText(b.gueltig) + '.\n\nWenn es passt, genügt eine kurze Antwort auf diese E-Mail.' + GRUSS }
            : b.art === 'storno' ? { betreff: 'Stornorechnung ' + b.nr + ' zu ' + bezugNr + ' · PlavoCAD', text: anrede + '\n\nanbei die Stornorechnung ' + b.nr + ' zur Rechnung ' + bezugNr + '. Die Rechnung ' + bezugNr + ' ist damit aufgehoben.' + GRUSS }
            : { betreff: 'Rechnung ' + b.nr + (b.objekt ? ' · ' + b.objekt : '') + ' · PlavoCAD', text: anrede + '\n\nanbei die Rechnung ' + b.nr + ' über ' + eur(b.summe) + (b.objekt ? ' für ' + b.objekt : '') + '. Bitte überweisen Sie den Betrag bis zum ' + tagText(b.faellig) + '.\n\nVielen Dank für den Auftrag.' + GRUSS };
          zeigeBox('<b class="font-display uppercase text-[1.3rem]">' + ART[b.art] + ' per E-Mail</b><div class="mt-3 grid gap-3 max-w-[760px]">' +
            '<label class="field"><span class="lbl">An</span><input class="inp" type="email" id="s-an" value="' + esc(an) + '"></label>' +
            '<label class="field"><span class="lbl">Betreff</span><input class="inp" id="s-be" value="' + esc(vorlage.betreff) + '"></label>' +
            '<label class="field"><span class="lbl">Text</span><textarea class="inp min-h-[200px] font-mono !text-[.86rem]" id="s-tx" rows="9">' + esc(vorlage.text) + '</textarea></label>' +
            '<p class="text-[.84rem] text-muted">Anhang: ' + esc(PCB.dateiname(b)) + ' (wird jetzt erzeugt). Geht über Resend, Blindkopie an kontakt@plavocad.de.</p>' +
            '<div><button type="button" class="btn-primary btn-big" id="s-go">Senden <span aria-hidden="true" class="font-mono">→</span></button></div></div>');
          $('#s-go').onclick = async () => {
            const go = $('#s-go'); go.disabled = true; go.firstChild.textContent = 'Erzeugt PDF und sendet … ';
            try {
              const blob = await PCB.pdf(b, b.verkaeufer || F, { bezugNr });
              const fd = new FormData(); fd.set('an', $('#s-an').value.trim()); fd.set('betreff', $('#s-be').value); fd.set('text', $('#s-tx').value); fd.set('pdf', blob, PCB.dateiname(b));
              await api('belege/' + id + '/senden', { method: 'POST', body: fd }); toast('Gesendet an ' + $('#s-an').value.trim() + '.'); PCA.neu();
            } catch (e) { fehler(e); go.disabled = false; go.firstChild.textContent = 'Senden '; }
          };
          return;
        }
      } catch (e) { fehler(e); }
    });
  }, 'belege');

  /* ======================= Einstellungen: Firma und Belege ======================= */
  PCA.weg('einstellungen/firma', async () => {
    const r = await api('firma'), F = r.firma;
    const f = (k, l, extra = '', typ = 'text') => '<label class="field"><span class="lbl">' + l + '</span><input class="inp' + (['iban', 'bic', 'steuernr', 'ustid'].includes(k) ? ' font-mono' : '') + '" name="' + k + '" type="' + typ + '" value="' + esc(F[k]) + '"' + extra + '></label>';
    const t = (k, l, rows = 3) => '<label class="field"><span class="lbl">' + l + '</span><textarea class="inp min-h-[80px]" name="' + k + '" rows="' + rows + '">' + esc(F[k]) + '</textarea></label>';
    const fehlt = [!F.steuernr && !F.ustid ? 'Steuernummer' : '', !F.iban ? 'Bankverbindung' : ''].filter(Boolean);
    app().innerHTML = titel('Einstellungen') + window.PCA_REITER('firma') +
      (fehlt.length ? '<p class="card border-warn p-4 mb-5 text-ink2"><b class="text-warn">Noch offen:</b> ' + fehlt.join(' und ') + '. Ohne Steuernummer lässt sich keine Rechnung festschreiben (Pflichtangabe nach § 14 UStG).</p>' : '') +
      '<form id="ff" class="grid lg:grid-cols-2 gap-5 items-start" novalidate>' +
      '<section class="card"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Absender</h2><div class="p-4 sm:p-5 grid sm:grid-cols-2 gap-4">' +
        f('name', 'Firmenname') + f('inhaber', 'Inhaber') + '<div class="sm:col-span-2">' + f('strasse', 'Straße und Hausnummer') + '</div>' + f('plz', 'PLZ') + f('ort', 'Ort') + f('tel', 'Telefon') + f('mail', 'E-Mail', '', 'email') + f('web', 'Website') + '</div></section>' +
      '<section class="card"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Steuer und Bank</h2><div class="p-4 sm:p-5 grid sm:grid-cols-2 gap-4">' +
        f('steuernr', 'Steuernummer', ' placeholder="z. B. 053/123/45678"') + f('ustid', 'USt-IdNr. (falls vorhanden)') +
        '<label class="opt sm:col-span-2"><input type="checkbox" name="kleinunternehmer"' + (F.kleinunternehmer ? ' checked' : '') + '><span class="box"></span><span><b class="block">Kleinunternehmer nach § 19 UStG</b><span class="text-[.84rem] text-muted">Rechnungen ohne Umsatzsteuer, mit Hinweis.</span></span></label>' +
        f('bank', 'Bank') + f('bic', 'BIC') + '<div class="sm:col-span-2">' + f('iban', 'IBAN') + '</div>' +
        f('zahlungsziel', 'Zahlungsziel in Tagen', ' min="0" max="90"', 'number') + f('angebotTage', 'Angebote gültig (Tage)', ' min="1" max="180"', 'number') + '</div></section>' +
      '<section class="card"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Texte auf Belegen</h2><div class="p-4 sm:p-5 grid gap-4">' +
        t('angebotEin', 'Angebot: Einleitung', 2) + t('angebotAus', 'Angebot: Schluss ({GUELTIG} = Datum)', 2) + t('rechnungEin', 'Rechnung: Einleitung', 2) + t('rechnungAus', 'Rechnung: Schluss ({FAELLIG} = Datum)', 2) + '</div></section>' +
      '<section class="card"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Anschreiben und Morgen-Mail</h2><div class="p-4 sm:p-5 grid gap-4">' +
        t('brief', 'Brief an Maklerbüros ({ANREDE} = Ansprechpartner, {AKTION_BIS} = Ende der Startaktion)', 12) +
        '<p class="text-[.84rem] text-muted">Unter jedem Brief steht automatisch der Datenschutzhinweis nach Art. 14 DSGVO.</p>' +
        '<label class="opt"><input type="checkbox" name="morgenmail"' + (F.morgenmail ? ' checked' : '') + '><span class="box"></span><span><b class="block">Morgen-Mail an kontakt@plavocad.de</b><span class="text-[.84rem] text-muted">Gegen 7 Uhr, nur wenn etwas ansteht: neue Bestellungen, fällige Lieferungen, Wiedervorlagen, überfällige Rechnungen.</span></span></label>' +
        '<div><button type="button" class="btn-ghost" id="mm-test">Übersicht jetzt senden</button></div></div></section>' +
      '<div class="lg:col-span-2 flex flex-wrap gap-2 sticky bottom-0 py-3 bg-paper/95 backdrop-blur border-t border-ink -mx-4 px-4 sm:mx-0 sm:px-0"><button type="submit" class="btn-primary btn-big">Speichern</button></div></form>';
    $('#ff').onsubmit = async e => {
      e.preventDefault();
      const o = formWerte(e.target); o.kleinunternehmer = e.target.kleinunternehmer.checked; o.morgenmail = e.target.morgenmail.checked;
      try { FIRMA = (await api('firma', { method: 'PUT', json: o })).firma; toast('Gespeichert. Neue Belege nutzen diese Angaben, festgeschriebene Rechnungen behalten ihre.'); PCA.neu(); } catch (er) { fehler(er); }
    };
    $('#mm-test').onclick = async () => { try { const x = await api('heute/mail', { method: 'POST', json: {} }); toast(x.gesendet ? 'Gesendet an kontakt@plavocad.de.' : 'Heute steht nichts an, darum keine Mail (oder die Morgen-Mail ist ausgeschaltet).'); } catch (e) { fehler(e); } };
  }, 'einstellungen');

  // Aktuelle Ansicht neu laden
  PCA.neu = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.addEventListener('beforeunload', e => { if (PCA.leaveGuard && PCA.leaveGuard()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', () => { PCA.leaveGuard = null; });
})();
