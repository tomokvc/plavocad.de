/**
 * PlavoCAD – Bestellformular per E-Mail (Cloudflare Worker + Resend)
 *
 * POST /api/bestellung  -> prüft das Formular, hängt die Pläne an und schickt alles per E-Mail an Tomo.
 * Alle anderen Adressen  -> liefert wie bisher die statische Website aus (env.ASSETS).
 *
 * Benötigt (Cloudflare → Worker → Einstellungen → Variablen und Geheimnisse):
 *   RESEND_API_KEY  (Geheimnis)  API-Schlüssel von resend.com
 *   MAIL_TO         (Text)       z. B. kontakt@plavocad.de
 *   MAIL_FROM       (Text)       z. B. "PlavoCAD Website <formular@plavocad.de>"  (Domain muss bei Resend bestätigt sein)
 */

const MAX_FILES = 10;
const MAX_TOTAL = 20 * 1024 * 1024; // 20 MB für alle Dateien zusammen
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/bestellung') {
      if (request.method !== 'POST') return json({ ok: false, error: 'Nur POST' }, 405);
      try { return await order(request, env); }
      catch (e) { console.error(e); return json({ ok: false, error: 'Senden fehlgeschlagen. Bitte schreiben Sie direkt an kontakt@plavocad.de.' }, 500); }
    }
    return env.ASSETS.fetch(request); // statische Seiten, Bilder, 404-Seite
  }
};

async function order(request, env) {
  const len = +(request.headers.get('content-length') || 0);
  if (len > MAX_TOTAL + 200_000) return json({ ok: false, error: 'Die Dateien sind zusammen größer als 20 MB.' }, 413);

  const f = await request.formData();
  if (f.get('website')) return json({ ok: true }); // Honigtopf-Feld: von Menschen unsichtbar, Bots füllen es aus

  const v = k => String(f.get(k) || '').trim().slice(0, 4000);
  const name = v('name'), mail = v('mail');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, 400);

  const files = f.getAll('plaene').filter(x => x && typeof x === 'object' && x.size > 0);
  if (files.length > MAX_FILES) return json({ ok: false, error: 'Höchstens 10 Dateien.' }, 400);
  let total = 0;
  for (const x of files) {
    total += x.size;
    if (x.type && !TYPES.includes(x.type)) return json({ ok: false, error: 'Erlaubt sind PDF, JPG, PNG und HEIC.' }, 400);
  }
  if (total > MAX_TOTAL) return json({ ok: false, error: 'Die Dateien sind zusammen größer als 20 MB.' }, 413);

  const attachments = [];
  for (const x of files) attachments.push({ filename: safeName(x.name), content: b64(await x.arrayBuffer()) });

  const nr = 'PC-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  // Alle Textfelder beider Formulare (Bestellung und Bestandsanfrage) übernehmen, bekannte zuerst
  const LABEL = { art: 'Art', typ: 'Objektart', menge: 'Anzahl', ebenen: 'Wohnebenen', nebenebenen: 'Keller / Dach', maisonette: 'Maisonette',
    haeuser: 'Häuser', geschosse: 'Geschosse je Haus', unterlagen: 'Unterlagen', gemeinschaft: 'Gemeinschaftsflächen', benennung: 'Benennung',
    abrechnung: 'Abrechnung', wunschtermin: 'Wunschtermin', opt: 'Extras', aktion: 'Startaktion', positionen: 'Positionen', preis: 'Preis laut Website',
    termin: 'Termin laut Website', objekt: 'Objekt / Referenz', name: 'Name', firma: 'Firma', mail: 'E-Mail', tel: 'Telefon', text: 'Bemerkung' };
  const keys = [...new Set([...Object.keys(LABEL), ...f.keys()])].filter(k => !['plaene', 'website'].includes(k));
  const rows = [['Bestellnummer', nr]];
  for (const k of keys) {
    const vals = f.getAll(k).filter(x => typeof x === 'string' && x.trim());
    if (vals.length) rows.push([LABEL[k] || k, (k === 'positionen' ? '\n' : '') + vals.join(', ').slice(0, 4000)]);
  }
  rows.push(['Dateien', files.map(x => x.name + ' (' + Math.round(x.size / 1024) + ' KB)').join(', ') || 'keine']);
  const text = rows.filter(r => r[1]).map(r => r[0] + ': ' + r[1]).join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [env.MAIL_TO],
      reply_to: mail,                         // „Antworten“ geht direkt an den Makler
      subject: `Neue ${v('art') === 'gratis' ? 'Gratis-Wohnung' : v('art') === 'anfrage' ? 'Anfrage' : 'Bestellung'} ${nr} – ${v('firma') || name}`,
      text,
      attachments
    })
  });
  if (!res.ok) { console.error('Resend', res.status, await res.text()); throw new Error('mail'); }

  // Bestätigung an den Kunden (ohne Anhänge). Schlägt sie fehl, gilt die Bestellung trotzdem als angekommen.
  const anfrage = v('art') === 'anfrage';
  const conf = [
    (name ? 'Guten Tag ' + name + ',' : 'Guten Tag,'), '',
    'vielen Dank, Ihre ' + (anfrage ? 'Anfrage' : 'Bestellung') + ' ' + nr + ' ist bei mir eingegangen.',
    anfrage
      ? 'Ich sehe mir Ihre Angaben an und schicke Ihnen ein schriftliches Angebot.'
      : 'Dies ist eine automatische Eingangsbestätigung. Ich prüfe Ihre Unterlagen und bestätige den Auftrag am selben Werktag. Erst mit dieser Bestätigung kommt der Auftrag zustande.', '',
    'Ihre Angaben:', v('positionen'), '',
    (anfrage ? 'Wunschtermin: ' + (v('wunschtermin') || 'keiner angegeben') : 'Voraussichtlicher Liefertermin: ' + v('termin')), '',
    files.length ? files.length + ' Datei(en) sind angekommen.' : 'Bitte schicken Sie mir die Pläne noch per E-Mail (Antwort auf diese Nachricht) oder per WhatsApp an 0172 313 61 17.',
    'Die Rechnung kommt erst nach der Lieferung.', '',
    'Es gelten meine AGB: https://plavocad.de/agb', '',
    'Viele Grüße', 'Tomo Kovačević', 'PlavoCAD · 0172 313 61 17 · kontakt@plavocad.de'
].join('\n');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [mail], reply_to: env.MAIL_TO, subject: 'Eingangsbestätigung ' + nr + ' · PlavoCAD', text: conf })
    });
  } catch (e) { console.error('Bestätigung', e); }
  return json({ ok: true, nr });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function safeName(n) { return String(n || 'plan').replace(/[^\w.\-äöüÄÖÜß ]+/g, '_').slice(0, 120); }
function b64(buf) { // in Stücken, damit große Dateien den Speicher nicht sprengen
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
