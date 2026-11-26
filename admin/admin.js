/* PlavoCAD Admin: Gerüst (Schnittstelle, Wege, Meldungen), Bestellungen und Website-Einstellungen.
   Das Büro (Heute, Kunden, Akquise, Belege, Firma) steht in buero.js, Belege und PDF in beleg.js.
   Spricht nur mit /api/admin/* auf plavocad.de (Anmeldung über Cloudflare Access). Speichert nichts im Browser. Braucht preise.js. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = $('#app');
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ST = { neu: 'Neu', bestaetigt: 'Bestätigt', in_arbeit: 'In Arbeit', geliefert: 'Geliefert', bezahlt: 'Bezahlt', abgelehnt: 'Abgelehnt' };
  const ST_CLS = { neu: 'border-warn text-warn', bestaetigt: 'border-blue text-blue', in_arbeit: 'border-blue bg-blue text-white', geliefert: 'border-ink text-ink', bezahlt: 'border-ok text-ok', abgelehnt: 'border-rule text-muted' };
  const ART = { bestellung: 'Bestellung', gratis: 'Startaktion', anfrage: 'Anfrage Bestand' };
  const GRUSS = '\n\nViele Grüße\nTomo Kovačević\nPlavoCAD · 0172 313 61 17 · kontakt@plavocad.de';
  const tag = s => '<span class="tag ' + ST_CLS[s] + '">' + ST[s] + '</span>';
  const datum = iso => { if (!iso) return '–'; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '–' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }); };
  const zeit = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const heute = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const offen = b => b.status === 'bestaetigt' || b.status === 'in_arbeit';
  const faellig = b => offen(b) && b.liefertermin && b.liefertermin <= heute();
  const kunde = b => b.firma || b.name || b.mail;

  let S = { liste: [], filter: 'aktiv', q: '' };

  /* ---------- Schnittstelle ---------- */
  async function api(pfad, opt = {}) {
    const h = Object.assign({ Accept: 'application/json', 'X-PlavoCAD-Admin': '1' }, opt.headers || {});
    if (opt.json !== undefined) { h['Content-Type'] = 'application/json'; opt.body = JSON.stringify(opt.json); }
    let res;
    try { res = await fetch('/api/admin/' + pfad, { method: opt.method || 'GET', headers: h, body: opt.body, credentials: 'same-origin', redirect: 'manual' }); }
    catch (e) { throw new Error('Keine Verbindung zu plavocad.de.'); }
    if (res.type === 'opaqueredirect' || res.status === 0) { location.reload(); throw new Error('Anmeldung abgelaufen. Die Seite lädt neu.'); }
    let j = null; try { j = await res.json(); } catch (e) { /* keine JSON-Antwort */ }
    if (!res.ok || !j || !j.ok) throw new Error((j && j.error) || 'Fehler ' + res.status);
    return j;
  }
  let toastT = 0;
  function toast(text, fehler) {
    const t = $('#toast'); t.textContent = text; t.hidden = false; t.classList.toggle('!bg-warn', !!fehler);
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, fehler ? 7000 : 3200);
  }
  const fehler = e => toast(e.message || String(e), true);
  async function ladeListe() { S.liste = (await api('bestellungen')).liste; const n = S.liste.filter(b => b.status === 'neu').length, el = $('#nav-neu'); el.hidden = !n; el.textContent = n; }

  /* ---------- Liste ---------- */
  const FILTER = [['aktiv', 'Zu tun', b => b.status === 'neu' || offen(b) || b.status === 'geliefert'], ['neu', 'Neu', b => b.status === 'neu'], ['arbeit', 'In Arbeit', offen],
    ['geliefert', 'Geliefert', b => b.status === 'geliefert'], ['fertig', 'Abgeschlossen', b => b.status === 'bezahlt' || b.status === 'abgelehnt'], ['alle', 'Alle', () => true]];
  function liste() {
    const q = S.q.trim().toLowerCase(), f = FILTER.find(x => x[0] === S.filter) || FILTER[0];
    const rows = S.liste.filter(f[2]).filter(b => !q || [b.nr, b.name, b.firma, b.mail, b.objekt, b.typ].join(' ').toLowerCase().includes(q));
    const neu = S.liste.filter(b => b.status === 'neu').length, lauf = S.liste.filter(offen).length, ueber = S.liste.filter(faellig).length;
    const wert = S.liste.filter(b => offen(b) || b.status === 'geliefert').reduce((s, b) => s + (b.preis || 0), 0);
    app.innerHTML =
      '<h1 class="sr-only">Bestellungen</h1>' +
      '<dl class="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink mb-5">' +
        zelle('Neu', neu, neu ? 'text-warn' : '', 'prüfen und bestätigen') + zelle('In Arbeit', lauf, '', 'bestätigt, noch nicht geliefert') +
        zelle('Fällig', ueber, ueber ? 'text-warn' : '', 'Liefertermin heute oder vorbei') + zelle('Offener Wert', pcEur(wert), '', 'bestätigt bis geliefert') + '</dl>' +
      '<div class="flex flex-wrap items-center gap-2 mb-4">' +
        FILTER.map(x => '<button type="button" data-f="' + x[0] + '" class="min-h-[40px] px-3 border font-mono text-[.74rem] uppercase tracking-[.08em] ' + (x[0] === S.filter ? 'bg-ink text-sheet border-ink' : 'bg-sheet border-rule hover:border-ink') + '">' + x[1] + ' <span class="opacity-60">' + S.liste.filter(x[2]).length + '</span></button>').join('') +
        '<input id="q" class="inp !min-h-[40px] sm:!w-[240px] sm:ml-auto" type="search" placeholder="Suchen: Name, Nummer, Objekt" value="' + esc(S.q) + '" aria-label="Bestellungen durchsuchen"></div>' +
      (rows.length ? '<ul class="card divide-y divide-rule">' + rows.map(zeile).join('') + '</ul>'
        : '<p class="card p-6 text-ink2">' + (S.liste.length ? 'Hier ist nichts zu tun.' : 'Noch keine Bestellungen. Neue Bestellungen von der Website erscheinen hier automatisch.') + '</p>') +
      '<p class="mt-4 font-mono text-[.74rem] text-muted">Anfragen ohne Auftrag werden nach 6 Monaten gelöscht, abgeschlossene Aufträge nach 12 Monaten. Pläne liegen nur in deinem E-Mail-Postfach.</p>';
    $$('[data-f]', app).forEach(b => b.onclick = () => { S.filter = b.dataset.f; liste(); });
    const qi = $('#q'); qi.oninput = () => { S.q = qi.value; const p = qi.selectionStart; liste(); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); };
  }
  const zelle = (l, v, cls, h) => '<div class="bg-sheet p-3.5"><dt class="lbl">' + l + '</dt><dd class="mt-1 font-mono text-[1.5rem] leading-tight ' + cls + '">' + v + '</dd><dd class="text-[.78rem] text-muted">' + h + '</dd></div>';
  function zeile(b) {
    const termin = b.liefertermin ? 'Lieferung ' + datum(b.liefertermin) : b.status === 'neu' ? 'eingegangen ' + zeit(b.erstellt) : '';
    return '<li><a class="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[110px_minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center px-4 py-3.5 hover:bg-wash' + (b.status === 'neu' ? ' bg-wash/50' : '') + '" href="#/b/' + encodeURIComponent(b.nr) + '">' +
      '<span class="order-1">' + tag(b.status) + '</span>' +
      '<span class="order-3 sm:order-2 col-span-2 sm:col-span-1 min-w-0"><b class="block truncate">' + esc(kunde(b)) + '</b><span class="block truncate text-[.86rem] text-ink2">' + esc(b.typ || '') + (b.objekt ? ' · ' + esc(b.objekt) : '') + (b.art !== 'bestellung' ? ' · ' + ART[b.art] : '') + '</span></span>' +
      '<span class="order-4 sm:order-3 font-mono text-[.78rem] ' + (faellig(b) ? 'text-warn' : 'text-muted') + '">' + esc(b.nr) + (termin ? '<br>' + esc(termin) + (faellig(b) ? ' · fällig' : '') : '') + '</span>' +
      '<b class="order-2 sm:order-4 font-mono text-right whitespace-nowrap">' + pcEur(b.preis || 0) + '</b></a></li>';
  }

  /* ---------- Vorlagen für E-Mails ---------- */
  function vorlage(b, art, lt) {
    const anrede = 'Guten Tag' + (b.name ? ' ' + b.name : '') + ',', pos = (b.daten && b.daten.positionen) || '', obj = b.objekt ? 'Objekt: ' + b.objekt + '\n' : '';
    const ltText = lt ? new Date(lt + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) + ', 18 Uhr' : '[Datum eintragen]';
    if (art === 'bestaetigung') return { betreff: 'Auftragsbestätigung ' + b.nr + (b.objekt ? ' · ' + b.objekt : ''),
      text: anrede + '\n\nIhre Unterlagen sind vollständig, ich bestätige den Auftrag ' + b.nr + ':\n\n' + obj + pos + '\n\nLieferung bis: ' + ltText + '\n\nDie Rechnung kommt nach der Lieferung. Es gelten meine AGB: https://plavocad.de/agb' + GRUSS };
    if (art === 'lieferung') return { betreff: 'Ihr Grundriss' + (b.objekt ? ' · ' + b.objekt : '') + ' (' + b.nr + ')',
      text: anrede + '\n\nanbei Ihr Grundriss' + (b.objekt ? ' für ' + b.objekt : '') + '.\n\nBitte prüfen Sie ihn in Ruhe. Kleine Korrekturen an Raumnamen, Möbeln oder Details sind inklusive, eine kurze Antwort auf diese E-Mail genügt. ' +
        'Melden Sie innerhalb von 7 Tagen nichts, gilt der Grundriss als abgenommen.' + (b.art === 'gratis' || !b.preis ? ' Diese Lieferung ist im Rahmen der Startaktion kostenlos.' : ' Die Rechnung über ' + pcEur(b.preis) + ' schicke ich danach.') + GRUSS };
    if (art === 'angebot') return { betreff: 'Angebot für Ihren Bestand (' + b.nr + ')',
      text: anrede + '\n\nvielen Dank für Ihre Anfrage. Für Ihren Bestand biete ich Ihnen an:\n\n' + pos.replace('Richtpreis', 'Festpreis') + '\n\nAblauf: zuerst eine Pilotwohnung, an der Sie Darstellung und Benennung festlegen, danach ca. 5 Wohnungen pro Woche.\n' +
        'Lieferung der Pilotwohnung bis: ' + ltText + '\n\nDas Angebot gilt 30 Tage. Wenn es passt, genügt eine kurze Antwort auf diese E-Mail. Es gelten meine AGB: https://plavocad.de/agb' + GRUSS };
    if (art === 'absage') return { betreff: 'Ihre Bestellung ' + b.nr,
      text: anrede + '\n\nvielen Dank für Ihre Bestellung. Aus den Unterlagen kann ich leider keinen sauberen Grundriss zeichnen: [Grund].\n\nWenn Sie [was fehlt] nachreichen, übernehme ich den Auftrag gern. Kosten entstehen Ihnen keine.' + GRUSS };
    return { betreff: 'Ihre Bestellung ' + b.nr, text: anrede + '\n\n' + GRUSS.trimStart() };
  }

  /* ---------- Detail ---------- */
  async function detail(nr) {
    let b, kontakt = null, belege = [];
    try { const r = await api('bestellungen/' + encodeURIComponent(nr)); b = r.b; kontakt = r.kontakt || null; belege = r.belege || []; }
    catch (e) { app.innerHTML = '<p class="card p-6">' + esc(e.message) + ' <a class="underline" href="#/bestellungen">Zur Liste</a></p>'; return; }
    const d = b.daten || {}, fe = d.felder || {}, dateien = d.dateien || [], anfrage = b.art === 'anfrage';
    const rechnung = belege.find(x => x.art === 'rechnung' && x.status !== 'storniert'), angebot = belege.filter(x => x.art === 'angebot').pop();
    const schritt = {
      neu: anfrage ? (angebot ? ['Antwort auf das Angebot abwarten', 'Angebot ' + angebot.nr + ' ist ' + (angebot.status === 'versendet' ? 'verschickt' : 'angelegt') + '. Nimmt die Verwaltung an, setze es im Angebot auf „Angenommen“.', [['beleg:' + angebot.id, 'Angebot öffnen', 1], ['mail:absage', 'Absagen', 0]]]
                            : ['Angebot schicken', 'Angaben prüfen, dann das Angebot mit Richtpreis als PDF erstellen und senden.', [['angebot', 'Angebot erstellen', 1], ['mail:absage', 'Absagen', 0]]])
                   : ['Unterlagen prüfen und bestätigen', 'Die Pläne liegen in deinem Postfach (Betreff „… ' + b.nr + '“). Mit der Bestätigung kommt der Auftrag zustande.', [['mail:bestaetigung', 'Auftrag bestätigen', 1], ['mail:absage', 'Absagen', 0]]],
      bestaetigt: ['Zeichnen und liefern', 'Zugesagt bis ' + datum(b.liefertermin) + '.', [['mail:lieferung', 'Lieferung senden', 1], ['status:in_arbeit', 'In Arbeit setzen', 0]]],
      in_arbeit: ['Liefern', 'Zugesagt bis ' + datum(b.liefertermin) + '.', [['mail:lieferung', 'Lieferung senden', 1]]],
      geliefert: !b.preis ? (rechnung ? ['Abschließen', 'Kostenlose Lieferung aus der Startaktion. Rechnung ' + (rechnung.nr || '(Entwurf)') + ' über 0,00 €' + (rechnung.nr ? '. Wird sie festgeschrieben, ist die Bestellung automatisch abgeschlossen.' : ': erst festschreiben, dann senden.'), [['beleg:' + rechnung.id, 'Rechnung öffnen', 1], ['status:bezahlt', 'Abschließen', 0]]]
          : ['Rechnung über 0 € schreiben', 'Kostenlose Lieferung aus der Startaktion. Eine Rechnung über 0,00 € mit dem Normalpreis und der Startaktion als Abzug zeigt dem Kunden den Wert.', [['rechnung', 'Rechnung über 0 € erstellen', 1], ['status:bezahlt', 'Ohne Rechnung abschließen', 0]]])
        : rechnung ? ['Zahlung abwarten', 'Rechnung ' + (rechnung.nr || '(Entwurf)') + ' über ' + pcEur(rechnung.summe) + '. Erfasse den Zahlungseingang an der Rechnung, dann wird diese Bestellung automatisch „Bezahlt“.', [['beleg:' + rechnung.id, 'Rechnung öffnen', 1]]]
        : ['Rechnung schreiben', 'Nach der Prüfung durch den Kunden die Rechnung erstellen. Positionen und Preis kommen aus der Bestellung.', [['rechnung', 'Rechnung erstellen', 1], ['status:bezahlt', 'Ohne Rechnung abschließen', 0]]],
      bezahlt: ['Abgeschlossen', 'Wird 12 Monate nach der letzten Änderung automatisch gelöscht. Rechnungen bleiben davon unberührt.', rechnung ? [['beleg:' + rechnung.id, 'Rechnung öffnen', 0]] : []],
      abgelehnt: ['Abgelehnt', 'Wird 6 Monate nach Eingang automatisch gelöscht.', []]
    }[b.status];
    const feld = (l, v) => v ? '<div class="p-4 border-b border-rule"><dt class="lbl">' + l + '</dt><dd class="mt-1 break-words">' + v + '</dd></div>' : '';
    app.innerHTML =
      '<p class="mb-4"><a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/bestellungen">← Alle Bestellungen</a></p>' +
      '<div class="flex flex-wrap items-center gap-3 mb-5"><h1 class="font-display font-bold uppercase text-[2rem] sm:text-[2.6rem] leading-none">' + esc(kunde(b)) + '</h1>' + tag(b.status) + (b.art !== 'bestellung' ? '<span class="tag border-ink text-ink">' + ART[b.art] + '</span>' : '') + '</div>' +
      '<div class="grid lg:grid-cols-12 gap-5 items-start">' +
      '<div class="lg:col-span-7 flex flex-col gap-5">' +
        '<section class="card border-2 ' + (b.status === 'neu' ? 'border-warn' : 'border-ink') + '"><div class="p-4 sm:p-5"><span class="lbl">Nächster Schritt</span><b class="block font-display uppercase text-[1.5rem] leading-none mt-1">' + schritt[0] + '</b><p class="mt-2 text-ink2">' + esc(schritt[1]) + '</p>' +
          (schritt[2].length ? '<div class="mt-4 flex flex-wrap gap-2">' + schritt[2].map(a => '<button type="button" data-a="' + a[0] + '" class="' + (a[2] ? 'btn-primary' : 'btn-ghost') + '">' + a[1] + '</button>').join('') + '</div>' : '') + '</div>' +
          '<div id="mail" hidden class="border-t border-ink p-4 sm:p-5"></div></section>' +
        '<section class="card"><h2 class="lbl px-4 pt-4">Bestellung</h2><pre class="px-4 py-3 font-mono text-[.86rem] whitespace-pre-wrap break-words">' + esc(d.positionen || '–') + '</pre>' +
          '<dl class="grid sm:grid-cols-2 border-t border-rule">' + feld('Objektart', esc(b.typ)) + feld('Objekt / Referenz', esc(b.objekt)) + feld('Termin laut Website', esc(b.termin)) +
          feld('Dateien im Postfach', dateien.length ? dateien.map(x => esc(x.name) + ' <span class="text-muted">(' + x.kb + ' KB)</span>').join('<br>') : 'keine hochgeladen') +
          feld('Unterlagen', esc(fe.unterlagen)) + feld('Wunschtermin', esc(fe.wunschtermin)) + '</dl>' +
          (fe.text ? '<div class="p-4"><span class="lbl">Bemerkung des Kunden</span><p class="mt-1 whitespace-pre-wrap">' + esc(fe.text) + '</p></div>' : '') + '</section>' +
        '<section class="card"><h2 class="lbl px-4 pt-4">Verlauf</h2><ol class="px-4 py-3 grid gap-2 text-[.9rem]">' + (b.verlauf || []).slice().reverse().map(v => '<li class="grid grid-cols-[92px_minmax(0,1fr)] gap-3"><span class="font-mono text-[.76rem] text-muted pt-0.5">' + zeit(v.t) + '</span><span>' + esc(v.was) + '</span></li>').join('') + '</ol></section>' +
      '</div>' +
      '<aside class="lg:col-span-5 flex flex-col gap-5">' +
        '<section class="card"><dl>' +
          feld('Nummer', '<span class="font-mono">' + esc(b.nr) + '</span> <span class="text-muted">· eingegangen ' + zeit(b.erstellt) + '</span>') +
          feld('Kunde', [b.name, b.firma].filter(Boolean).map(esc).join('<br>') + (kontakt ? '<br><a class="font-mono text-[.8rem] text-blue underline underline-offset-4" href="#/k/' + kontakt.id + '">Kundenkarte öffnen →</a>' : '')) +
          feld('E-Mail', '<a class="underline underline-offset-4" href="mailto:' + esc(b.mail) + '?subject=' + encodeURIComponent('Ihre Bestellung ' + b.nr) + '">' + esc(b.mail) + '</a>') +
          feld('Telefon', b.tel ? '<a class="underline underline-offset-4" href="tel:' + esc(b.tel.replace(/[^\d+]/g, '')) + '">' + esc(b.tel) + '</a>' : '') +
          '<div class="p-4 border-b border-rule grid grid-cols-2 gap-3"><label class="field"><span class="lbl">Preis in €</span><input class="inp font-mono" id="e-preis" type="number" min="0" step="0.01" inputmode="decimal" value="' + (b.preis || 0) + '"></label>' +
            '<label class="field"><span class="lbl">Liefertermin</span><input class="inp font-mono" id="e-lt" type="date" value="' + esc(b.liefertermin || '') + '"></label></div>' +
          '<div class="p-4 border-b border-rule"><label class="field"><span class="lbl">Status</span><select class="inp" id="e-status">' + Object.keys(ST).map(k => '<option value="' + k + '"' + (k === b.status ? ' selected' : '') + '>' + ST[k] + '</option>').join('') + '</select></label></div>' +
          '<div class="p-4"><label class="field"><span class="lbl">Notiz (nur für dich)</span><textarea class="inp min-h-[96px]" id="e-notiz" rows="3">' + esc(b.notiz || '') + '</textarea></label></div>' +
        '</dl></section>' +
        (belege.length ? '<section class="card"><h2 class="lbl px-4 pt-4">Belege</h2><ul class="divide-y divide-rule">' + belege.map(x => '<li><a class="flex items-center gap-3 px-4 py-3 hover:bg-wash" href="#/beleg/' + x.id + '"><span class="grow"><b>' + ({ angebot: 'Angebot', rechnung: 'Rechnung', storno: 'Stornorechnung' })[x.art] + '</b> <span class="font-mono text-[.84rem] text-muted">' + esc(x.nr || 'Entwurf') + ' · ' + esc(x.status) + '</span></span><b class="font-mono">' + pcEur(x.summe) + '</b></a></li>').join('') + '</ul></section>' : '') +
        '<div class="flex flex-wrap gap-2"><button type="button" class="btn-ghost" data-a="mail:nachricht">Nachricht senden</button>' + (b.preis && !rechnung ? '<button type="button" class="btn-ghost" data-a="rechnung">Rechnung erstellen</button>' : '') + '<button type="button" class="btn-ghost !border-warn !text-warn ml-auto" data-a="loeschen">Löschen</button></div>' +
      '</aside></div>';

    const neu = async aenderung => { try { await api('bestellungen/' + encodeURIComponent(nr), { method: 'PATCH', json: aenderung }); toast('Gespeichert.'); await ladeListe(); detail(nr); } catch (e) { fehler(e); } };
    $('#e-status').onchange = e => neu({ status: e.target.value });
    $('#e-lt').onchange = e => neu({ liefertermin: e.target.value });
    $('#e-preis').onchange = e => neu({ preis: +e.target.value });
    $('#e-notiz').onchange = e => neu({ notiz: e.target.value });
    $$('[data-a]', app).forEach(btn => btn.onclick = async () => {
      const [a, wert] = btn.dataset.a.split(':');
      if (a === 'status') return neu({ status: wert });
      if (a === 'rechnung' || a === 'angebot') return PCA.belegAusBestellung(b, kontakt, a);
      if (a === 'beleg') { location.hash = '#/beleg/' + wert; return; }
      if (a === 'mail') return verfassen(b, wert);
      if (a === 'loeschen') {
        if (btn.dataset.sicher !== '1') { btn.dataset.sicher = '1'; btn.textContent = 'Wirklich löschen?'; setTimeout(() => { btn.dataset.sicher = ''; btn.textContent = 'Löschen'; }, 4000); return; }
        try { await api('bestellungen/' + encodeURIComponent(nr), { method: 'DELETE' }); toast('Gelöscht.'); await ladeListe(); location.hash = '#/bestellungen'; } catch (e) { fehler(e); }
      }
    });
  }

  /* E-Mail verfassen: Vorlage, Liefertermin, Dateien (nur bei Lieferung), Senden über Resend */
  function verfassen(b, art) {
    const box = $('#mail'), bestaetigung = art === 'bestaetigung', lieferung = art === 'lieferung', mitTermin = bestaetigung || art === 'angebot';
    const startLt = b.liefertermin || (b.daten && b.daten.eingabe && '') || '';
    let lt = startLt || (b.termin && /\d{2}\.\d{2}\./.test(b.termin) ? '' : ''), dirty = false, files = [];
    if (!lt && mitTermin) { const m = /(\d{2})\.(\d{2})\./.exec(b.termin || ''); if (m) { const y = new Date().getFullYear(), k = y + '-' + m[2] + '-' + m[1]; lt = k < heute() ? heute() : k; } }
    const v = vorlage(b, art, lt);
    const titel = { bestaetigung: 'Auftragsbestätigung', lieferung: 'Lieferung', angebot: 'Angebot', absage: 'Absage', nachricht: 'Nachricht' }[art];
    box.hidden = false;
    box.innerHTML = '<div class="flex items-baseline justify-between gap-3 mb-3"><b class="font-display uppercase text-[1.3rem] leading-none">' + titel + ' an ' + esc(b.mail) + '</b><button type="button" class="font-mono text-[.8rem] text-muted underline" id="m-zu">Schließen</button></div>' +
      '<div class="grid gap-3">' +
      (mitTermin ? '<label class="field sm:max-w-[240px]"><span class="lbl">' + (art === 'angebot' ? 'Pilotwohnung bis' : 'Lieferung bis') + ' *</span><input class="inp font-mono" id="m-lt" type="date" min="' + heute() + '" value="' + esc(lt) + '"></label>' : '') +
      '<label class="field"><span class="lbl">Betreff</span><input class="inp" id="m-betreff" value="' + esc(v.betreff) + '"></label>' +
      '<label class="field"><span class="lbl">Text</span><textarea class="inp min-h-[260px] font-mono !text-[.86rem]" id="m-text" rows="12">' + esc(v.text) + '</textarea></label>' +
      (lieferung || art === 'nachricht' || art === 'angebot' ? '<div class="field"><span class="lbl">Dateien' + (lieferung ? ' (Grundriss als PDF und PNG) *' : ' (optional)') + '</span><label class="drop !py-5"><input type="file" id="m-files" multiple><b class="font-semibold">Dateien wählen oder hierher ziehen</b><span class="text-sm text-muted">bis 10 Dateien, zusammen 20 MB · werden nur versendet, nicht gespeichert</span></label><ul id="m-liste" class="grid gap-1 font-mono text-[.84rem]"></ul></div>' : '') +
      '<p class="text-[.84rem] text-muted">Geht über Resend an den Kunden. Du bekommst eine Blindkopie an kontakt@plavocad.de, Antworten landen dort.' + (bestaetigung ? ' Der Status wird „Bestätigt“' + (b.aktion ? ', und ein Platz der Startaktion wird abgezogen' : '') + '.' : lieferung ? ' Der Status wird „Geliefert“.' : art === 'absage' ? ' Der Status wird „Abgelehnt“.' : '') + '</p>' +
      '<div class="flex flex-wrap gap-2"><button type="button" class="btn-primary btn-big" id="m-senden">Senden <span aria-hidden="true" class="font-mono">→</span></button></div></div>';
    const tx = $('#m-text'); tx.oninput = () => { dirty = true; };
    $('#m-zu').onclick = () => { box.hidden = true; box.innerHTML = ''; };
    const ltEl = $('#m-lt');
    if (ltEl) ltEl.onchange = () => { lt = ltEl.value; if (!dirty) tx.value = vorlage(b, art, lt).text; else toast('Text wurde von Hand geändert. Bitte das Datum im Text selbst anpassen.'); };
    const fi = $('#m-files');
    const zeigeDateien = () => { $('#m-liste').innerHTML = files.map((x, i) => '<li class="flex items-center gap-2 border border-rule px-2 py-1.5"><span class="grow truncate">' + esc(x.name) + '</span><span class="text-muted">' + Math.max(1, Math.round(x.size / 1024)) + ' KB</span><button type="button" data-rm="' + i + '" class="px-2 text-muted hover:text-warn" aria-label="' + esc(x.name) + ' entfernen">✕</button></li>').join(''); $$('[data-rm]', box).forEach(r => r.onclick = () => { files.splice(+r.dataset.rm, 1); zeigeDateien(); }); };
    if (fi) fi.onchange = () => { Array.from(fi.files).forEach(x => { if (files.length < 10 && !files.some(y => y.name === x.name && y.size === x.size)) files.push(x); }); fi.value = ''; zeigeDateien(); };
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('#m-senden').onclick = async () => {
      if (mitTermin && !lt) { toast('Bitte ein Datum eintragen.', true); ltEl.focus(); return; }
      if (/\[[^\]]+\]/.test(tx.value)) { toast('Im Text stehen noch Platzhalter in eckigen Klammern.', true); tx.focus(); return; }
      if (lieferung && !files.length) { toast('Bitte den Grundriss anhängen.', true); return; }
      if (files.reduce((s, x) => s + x.size, 0) > 20 * 1024 * 1024) { toast('Die Dateien sind zusammen größer als 20 MB.', true); return; }
      const fd = new FormData();
      fd.set('art', bestaetigung ? 'bestaetigung' : lieferung ? 'lieferung' : 'nachricht'); fd.set('betreff', $('#m-betreff').value); fd.set('text', tx.value);
      if (mitTermin) fd.set('liefertermin', lt);
      files.forEach(x => fd.append('dateien', x, x.name));
      const btn = $('#m-senden'); btn.disabled = true; btn.firstChild.textContent = files.length ? 'Lädt hoch und sendet … ' : 'Sendet … ';
      try {
        await api('bestellungen/' + encodeURIComponent(b.nr) + '/mail', { method: 'POST', body: fd });
        if (art === 'absage') await api('bestellungen/' + encodeURIComponent(b.nr), { method: 'PATCH', json: { status: 'abgelehnt' } });
        if (art === 'angebot' && lt) await api('bestellungen/' + encodeURIComponent(b.nr), { method: 'PATCH', json: { liefertermin: lt } });
        toast('Gesendet an ' + b.mail + '.'); await ladeListe(); detail(b.nr);
      } catch (e) { fehler(e); btn.disabled = false; btn.firstChild.textContent = 'Senden '; }
    };
  }

  /* ---------- Einstellungen ---------- */
  const reiter = aktiv => '<div class="flex gap-px bg-ink border border-ink mb-5 w-fit">' + [['website', 'Website und Preise', '#/einstellungen'], ['firma', 'Firma und Belege', '#/einstellungen/firma']]
    .map(r => '<a href="' + r[2] + '" class="px-4 min-h-[44px] flex items-center font-mono text-[.76rem] uppercase tracking-[.08em] ' + (r[0] === aktiv ? 'bg-ink text-sheet' : 'bg-sheet hover:text-blue') + '">' + r[1] + '</a>').join('') + '</div>';
  window.PCA_REITER = reiter;
  const PREISE = [['wohnung', 'Wohnung oder Etage'], ['flaechen', 'Flächen je Wohnung'], ['hausPaket', 'Haus bis 3 Ebenen (Paket)'], ['ebene', 'Weitere Wohnebene'], ['nebenebene', 'Keller / Dachboden'], ['flaechenHaus', 'Flächen Haus (ohne Paket)'],
    ['gewerbe', 'Gewerbeeinheit'], ['d3', '3D-Ansicht'], ['dachschraegen', 'Dachschrägen'], ['express', 'Express'], ['skizze', 'Nur Handskizze'], ['rabatt5', 'Nachlass ab 5 Wohnungen'], ['rabatt20', 'Nachlass ab 20 Wohnungen'],
    ['treppenhaus', 'Treppenhaus je Geschoss'], ['gemeinschaftskeller', 'Gemeinschaftskeller je Haus']];
  async function einstellungen() {
    let r; try { r = await api('einstellungen'); } catch (e) { app.innerHTML = '<p class="card p-6">' + esc(e.message) + '</p>'; return; }
    const C = r.konfig, D = r.standard;
    const zahl = (g, k, l, extra = '') => '<label class="field"><span class="lbl">' + l + '</span><input class="inp font-mono" type="number" min="0" step="' + (g === 'preise' ? '0.5' : '1') + '" inputmode="decimal" data-g="' + g + '" data-k="' + k + '" value="' + C[g][k] + '"' + extra + '>' + (C[g][k] !== D[g][k] ? '<span class="text-[.76rem] text-muted">Standard: ' + D[g][k] + '</span>' : '') + '</label>';
    app.innerHTML = '<h1 class="font-display font-bold uppercase text-[2rem] sm:text-[2.6rem] leading-none mb-4">Einstellungen</h1>' + reiter('website') +
      '<p class="text-ink2 mb-6 max-w-[64ch]">Diese Werte zeigt die Website, und mit ihnen rechnet der Server jede Bestellung und jede Rechnung aus einer Bestellung. Änderungen sind nach spätestens einer Minute sichtbar.</p>' +
      '<form id="ef" class="grid lg:grid-cols-2 gap-5 items-start">' +
      '<section class="card"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Startaktion</h2><div class="p-4 sm:p-5 grid grid-cols-2 gap-4">' +
        '<label class="opt col-span-2"><input type="checkbox" data-g="aktion" data-k="an"' + (C.aktion.an ? ' checked' : '') + '><span class="box"></span><span><b class="block">Startaktion läuft</b><span class="text-[.84rem] text-muted">Erste Wohnung kostenlos. Endet von selbst, wenn kein Platz mehr frei oder das Datum vorbei ist.</span></span></label>' +
        zahl('aktion', 'frei', 'Freie Plätze') + zahl('aktion', 'gesamt', 'Plätze gesamt') +
        '<label class="field col-span-2 sm:col-span-1"><span class="lbl">Läuft bis</span><input class="inp font-mono" type="date" data-g="aktion" data-k="bis" value="' + esc(C.aktion.bis) + '"></label>' +
        '<p class="col-span-2 text-[.84rem] text-muted">Bestätigst du eine Bestellung aus der Aktion, wird automatisch ein Platz abgezogen.</p></div></section>' +
      '<section class="card"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Lieferzeit und Pause</h2><div class="p-4 sm:p-5 grid grid-cols-2 gap-4">' +
        zahl('lieferung', 'werktage', 'Lieferzeit in Werktagen', ' max="30"') + zahl('lieferung', 'express', 'Express in Werktagen', ' max="30"') + zahl('lieferung', 'proMonat', 'Wohnungen pro Monat') +
        '<p class="col-span-2 text-[.84rem] text-muted">1 Werktag zeigt die Website als „24 Stunden“, 2 als „48 Stunden“, mehr als „n Werktage“.</p>' +
        '<label class="opt col-span-2"><input type="checkbox" data-g="lieferung" data-k="pauseAn"' + (C.lieferung.pauseAn ? ' checked' : '') + '><span class="box"></span><span><b class="block">Pause einschalten</b><span class="text-[.84rem] text-muted">Zeigt oben auf jeder Seite einen Hinweis. Bestellungen bleiben möglich, die Lieferfrist beginnt nach der Pause.</span></span></label>' +
        '<label class="field col-span-2 sm:col-span-1"><span class="lbl">Pause bis einschließlich</span><input class="inp font-mono" type="date" data-g="lieferung" data-k="pauseBis" value="' + esc(C.lieferung.pauseBis) + '"></label>' +
        '<label class="field col-span-2"><span class="lbl">Hinweistext (leer = Standardtext)</span><input class="inp" data-g="lieferung" data-k="pauseText" maxlength="200" value="' + esc(C.lieferung.pauseText) + '" placeholder="z. B. Prüfungszeit bis 19.02. Neue Aufträge liefere ich ab dem 22.02."></label></div></section>' +
      '<section class="card lg:col-span-2"><h2 class="px-4 sm:px-5 py-3 border-b border-ink font-display uppercase text-[1.3rem]">Preise in €</h2><div class="p-4 sm:p-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">' + PREISE.map(p => zahl('preise', p[0], p[1])).join('') + '</div>' +
        '<p class="px-4 sm:px-5 pb-4 text-[.84rem] text-muted" id="e-vorschau"></p></section>' +
      '<div class="lg:col-span-2 flex flex-wrap gap-2 sticky bottom-0 py-3 bg-paper/95 backdrop-blur border-t border-ink -mx-4 px-4 sm:mx-0 sm:px-0"><button type="submit" class="btn-primary btn-big">Speichern</button><button type="button" class="btn-ghost" id="e-std">Standardpreise einsetzen</button></div></form>';
    const lese = () => { const o = { preise: {}, aktion: {}, lieferung: {} }; $$('[data-g]', app).forEach(el => { o[el.dataset.g][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; }); return pcKonfig(o); };
    const vorschau = () => { const K = lese(), A = pcAnzeige(K), lz = pcLieferzeit(K); $('#e-vorschau').textContent = 'So steht es auf der Website: Wohnung ab ' + pcKurz(A.wohnung) + ', mit Flächen ' + pcKurz(A.wohnungFlaechen) + ', Haus-Paket ' + pcKurz(A.hausPaket) + ', Bestand ab 5 Wohnungen ' + pcKurz(A.bestand5) + ', ab 20 Wohnungen ' + pcKurz(A.bestand20) + ', ' + lz.fertig + '.'; };
    $('#ef').oninput = vorschau; vorschau();
    $('#e-std').onclick = () => { PREISE.forEach(p => { $('[data-g="preise"][data-k="' + p[0] + '"]', app).value = D.preise[p[0]]; }); vorschau(); toast('Standardpreise eingesetzt. Noch nicht gespeichert.'); };
    $('#ef').onsubmit = async e => { e.preventDefault(); try { await api('einstellungen', { method: 'PUT', json: lese() }); toast('Gespeichert. Die Website zeigt die neuen Werte nach spätestens einer Minute.'); einstellungen(); } catch (er) { fehler(er); } };
  }

  /* ---------- Gerüst für alle Bereiche ---------- */
  const WEGE = [];
  window.PCA = { $, $$, esc, api, toast, fehler, datum, zeit, heute, app: () => app, weg: (muster, fn, nav) => WEGE.push({ muster, fn, nav }), PREISE,
    ladeBestellungen: ladeListe, bestellungen: () => S.liste };
  async function weg() {
    const h = location.hash.replace(/^#\/?/, ''), [pfad, qs] = h.split('?'), q = new URLSearchParams(qs || '');
    window.scrollTo(0, 0);
    let ziel = null, m = null, nav = '';
    if (pfad === 'bestellungen') { nav = 'bestellungen'; ziel = async () => { await ladeListe(); liste(); }; }
    else if (pfad.startsWith('b/')) { nav = 'bestellungen'; ziel = () => detail(decodeURIComponent(pfad.slice(2))); }
    else if (pfad === 'einstellungen') { nav = 'einstellungen'; ziel = einstellungen; }
    else for (const w of WEGE) { m = typeof w.muster === 'string' ? (w.muster === pfad ? [pfad] : null) : w.muster.exec(pfad); if (m) { nav = w.nav; ziel = () => w.fn(m, q); break; } }
    if (!ziel) { nav = 'heute'; const w = WEGE.find(x => x.muster === ''); ziel = w ? () => w.fn([''], q) : async () => { await ladeListe(); liste(); }; }
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === nav));
    try { await ziel(); } catch (e) { app.innerHTML = '<div class="card p-6 max-w-[640px]"><b class="font-display uppercase text-[1.5rem]">Der Admin-Bereich ist nicht erreichbar</b><p class="mt-2 text-ink2">' + esc(e.message) + '</p></div>'; }
  }
  window.addEventListener('hashchange', weg);
  // Zähler „Neu“ in der Navigation und offene Liste alle 2 Minuten auffrischen
  setInterval(() => {
    if (document.hidden) return;
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'bestellungen' && document.activeElement && document.activeElement.id !== 'q') ladeListe().then(liste).catch(() => {});
    else ladeListe().catch(() => {});
  }, 120000);
  document.addEventListener('DOMContentLoaded', () => { ladeListe().catch(() => {}); weg(); });
})();
