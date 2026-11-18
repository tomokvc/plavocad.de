/**
 * PlavoCAD – Worker für plavocad.de (Cloudflare Workers mit statischen Dateien)
 *
 *   POST /api/bestellung        Bestellung oder Bestandsanfrage: rechnet den Preis nach, speichert die Angaben (ohne Dateien)
 *                               und schickt zwei E-Mails über Resend: an Tomo (mit den Plänen im Anhang) und die Eingangsbestätigung.
 *   GET  /api/einstellungen     Preise, Startaktion und Lieferzeit für die Website.
 *   /admin, /api/admin/*        Admin-Bereich mit Büro (Kunden, Akquise, Angebote, Rechnungen). Nur mit gültiger Anmeldung über Cloudflare Access.
 *   Cron 03:17 UTC               Löschfristen. Cron 06:00 UTC: Morgen-Mail an MAIL_TO, nur wenn etwas fällig ist.
 *   alles andere                statische Website (env.ASSETS).
 *
 * Einstellungen in Cloudflare (Worker → Einstellungen bzw. wrangler.jsonc):
 *   RESEND_API_KEY  Geheimnis   API-Schlüssel von resend.com
 *   MAIL_TO         Text        kontakt@plavocad.de
 *   MAIL_FROM       Text        "PlavoCAD <formular@plavocad.de>"
 *   DB              D1          Datenbank für Bestellungen und Einstellungen (ohne DB läuft das Formular weiter, nur ohne Admin)
 *   ACCESS_TEAM     Text        Name des Zero-Trust-Teams (aus <name>.cloudflareaccess.com)
 *   ACCESS_AUD      Text        „Application Audience (AUD) Tag“ der Access-Anwendung
 *   ADMIN_MAIL      Text        optional: nur diese E-Mail-Adresse darf in den Admin-Bereich
 */

/* PlavoCAD – Preise, Liefertermin und Startaktion.
   Eine Quelle für Website (Browser) und Worker (Server): der Server rechnet jede Bestellung mit denselben Regeln nach.
   Die Werte in PC_STANDARD gelten, solange im Admin-Bereich nichts anderes gespeichert ist. */
var PC_STANDARD = {
  preise: {
    wohnung: 25,        // Grundriss je Wohnung oder Etage
    flaechen: 10,       // Flächenaufstellung je Wohnung
    hausPaket: 69,      // Haus bis 3 Ebenen inkl. Flächen
    ebene: 20,          // weitere Wohnebene (Haus, Maisonette)
    nebenebene: 15,     // Keller, Dachboden
    flaechenHaus: 15,   // Flächenaufstellung Haus, wenn kein Paket
    gewerbe: 35,        // Gewerbeeinheit bis 150 m²
    d3: 25,             // 3D-Ansicht je Wohnebene
    dachschraegen: 10,  // je Ebene
    express: 15,        // je Auftrag
    skizze: 10,         // nur Handskizze als Vorlage
    rabatt5: 5,         // Nachlass je Wohnung ab 5 Stück
    rabatt20: 8,        // Nachlass je Wohnung ab 20 Stück
    treppenhaus: 15,    // je Geschoss (Bestand)
    gemeinschaftskeller: 15 // je Haus (Bestand)
  },
  aktion: { an: true, frei: 10, gesamt: 10, bis: '2027-01-31' },
  lieferung: { werktage: 2, express: 1, proMonat: 20, pauseAn: false, pauseBis: '', pauseText: '' }
};

function pcKonfig(c) {
  c = c || {};
  var out = {}, k, g;
  for (g in PC_STANDARD) {
    out[g] = {};
    for (k in PC_STANDARD[g]) out[g][k] = PC_STANDARD[g][k];
    if (c[g] && typeof c[g] === 'object') for (k in PC_STANDARD[g]) {
      var v = c[g][k], d = PC_STANDARD[g][k];
      if (v === undefined || v === null) continue;
      if (typeof d === 'number') { v = Number(v); if (isFinite(v) && v >= 0 && v <= 100000) out[g][k] = Math.round(v * 100) / 100; }
      else if (typeof d === 'boolean') out[g][k] = v === true || v === 'true' || v === 1 || v === '1';
      else out[g][k] = String(v).slice(0, 300);
    }
  }
  out.lieferung.werktage = Math.min(30, Math.max(1, Math.round(out.lieferung.werktage)));
  out.lieferung.express = Math.min(out.lieferung.werktage, Math.max(1, Math.round(out.lieferung.express)));
  out.aktion.frei = Math.max(0, Math.round(out.aktion.frei));
  out.aktion.gesamt = Math.max(out.aktion.frei, Math.round(out.aktion.gesamt));
  return out;
}

function pcEur(n) {
  var neg = n < 0, s = Math.abs(n).toFixed(2).split('.');
  return (neg ? '− ' : '') + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1] + ' €';
}
function pcKurz(n) { return pcEur(n).replace(',00', ''); }
function pcZahl(v, lo, hi) { v = Math.round(Number(v)); return Math.min(hi, Math.max(lo, isFinite(v) && v > 0 ? v : lo)); }

/* Zeit: „jetzt“ ist ein Date, dessen UTC-Felder die Uhrzeit in Deutschland tragen (siehe pcJetzt). */
function pcJetzt(d) {
  d = d || new Date();
  try {
    var p = {}, f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d);
    for (var i = 0; i < f.length; i++) p[f[i].type] = +f[i].value;
    return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  } catch (e) { return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())); }
}
var PC_WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function pcWerktag(d) { return d.getUTCDay() % 6 !== 0; }
function pcPlus(d, n) { d = new Date(d); while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (pcWerktag(d)) n--; } return d; }
function pcDatum(d) { return PC_WT[d.getUTCDay()] + ', ' + String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.'; }
function pcIso(d) { return d.toISOString().slice(0, 10); }
function pcTag(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null; }
function pcTagText(iso) { var d = pcTag(iso); return d ? String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.' : ''; }

/* Pause (z. B. Prüfungszeit): aktiv, solange das Enddatum nicht vorbei ist */
function pcPause(C, jetzt) {
  var L = C.lieferung, bis = pcTag(L.pauseBis);
  if (!L.pauseAn || !bis) return null;
  var ende = new Date(bis); ende.setUTCHours(23, 59);
  if (jetzt > ende) return null;
  return { bis: bis, text: L.pauseText || ('Bis ' + pcTagText(L.pauseBis) + ' zeichne ich nicht. Bestellungen nehme ich an, die Lieferfrist beginnt danach.') };
}
/* Tag, ab dem die Frist zählt: heute bei Eingang vor 12 Uhr an einem Werktag, sonst nächster Werktag; nach einer Pause der erste Werktag danach */
function pcStart(C, jetzt) {
  var d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate(), 12)), heute = true;
  if (!pcWerktag(jetzt) || jetzt.getUTCHours() >= 12) { d = pcPlus(d, 1); heute = false; }
  var p = pcPause(C, jetzt);
  if (p && d <= p.bis) { d = pcPlus(p.bis, 1); heute = false; }
  return { tag: d, heute: heute, pause: !!p };
}

function pcAktion(C, jetzt) {
  var a = C.aktion, bis = pcTag(a.bis), ende = bis ? new Date(bis) : null;
  if (ende) ende.setUTCHours(23, 59);
  var aktiv = !!a.an && a.frei > 0 && (!ende || jetzt <= ende);
  return { aktiv: aktiv, frei: a.frei, gesamt: a.gesamt, bis: a.bis, bisText: pcTagText(a.bis) };
}

/* Lieferzeit in Worten: 1 Werktag = 24 Stunden, 2 = 48 Stunden, sonst „n Werktage“ */
function pcLieferzeit(C) {
  var n = C.lieferung.werktage;
  return n <= 2 ? { tage: n, lang: n * 24 + ' Stunden', kurz: n * 24 + ' h', fertig: 'fertig in ' + n * 24 + ' Stunden' }
               : { tage: n, lang: n + ' Werktagen', kurz: n + ' Werktage', fertig: 'fertig in ' + n + ' Werktagen' };
}

/* Bestellung (Makler). e = { typ: wohnung|haus|gewerbe, menge, maisonette, ebenen, keller, dach, fl, mb, d3, ds, ex, sk, aktion } */
function pcBestellung(e, C, jetzt) {
  var P = C.preise, t = e.typ === 'haus' || e.typ === 'gewerbe' ? e.typ : 'wohnung', L = [], total = 0;
  var units = 1, wt = C.lieferung.werktage, etappen = null, pkg = false, frei = P.wohnung + P.flaechen;
  function add(label, amount) { L.push([label, amount]); total += amount; }
  if (t === 'haus') {
    var w = pcZahl(e.ebenen, 1, 6), k = e.keller ? 1 : 0, d = e.dach ? 1 : 0, all = w + k + d;
    var single = P.wohnung + (w - 1) * P.ebene + (k + d) * P.nebenebene + (e.fl ? P.flaechenHaus : 0);
    var paket = P.hausPaket + Math.max(0, all - 3) * P.ebene;
    if (paket <= single) { pkg = true; add('Haus-Paket · ' + all + (all === 1 ? ' Ebene' : ' Ebenen') + ' inkl. Flächen', paket); }
    else {
      add('Grundriss 1. Ebene', P.wohnung);
      if (w > 1) add((w - 1) + ' × weitere Wohnebene', (w - 1) * P.ebene);
      if (k + d) add((k ? 'Keller' : '') + (k && d ? ' + ' : '') + (d ? 'Dachboden' : ''), (k + d) * P.nebenebene);
      if (e.fl) add('Flächenaufstellung Haus', P.flaechenHaus);
    }
    if (e.d3) add('3D-Ansicht · ' + w + ' × ' + pcKurz(P.d3), w * P.d3);
    if (e.ds) add('Dachschrägen · ' + w + ' × ' + pcKurz(P.dachschraegen), w * P.dachschraegen);
    if (all > 3) wt += 1;
  } else {
    units = pcZahl(e.menge, 1, 500);
    var eb = t === 'wohnung' && e.maisonette ? 2 : 1;
    var base = t === 'gewerbe' ? P.gewerbe : P.wohnung + (eb - 1) * P.ebene;
    var per = base + (e.fl ? P.flaechen : 0);
    var rab = units >= 20 ? P.rabatt20 : units >= 5 ? P.rabatt5 : 0;
    frei = per - rab;
    var nm = t === 'gewerbe' ? 'Gewerbeeinheit' : (eb === 2 ? 'Maisonette' : 'Wohnung');
    add(units + ' × ' + nm + (e.fl ? ' inkl. Flächen' : '') + ' à ' + pcKurz(per), units * per);
    if (rab) add('Mengenpreis ab ' + (units >= 20 ? 20 : 5) + ' Stück · ' + units + ' × − ' + pcKurz(rab), -units * rab);
    if (e.d3) add('3D-Ansicht · ' + units * eb + ' × ' + pcKurz(P.d3), units * eb * P.d3);
    if (e.ds) add('Dachschrägen · ' + units * eb + ' × ' + pcKurz(P.dachschraegen), units * eb * P.dachschraegen);
    if (units > 5) etappen = units;
    else if (units > 3) wt += 1;
  }
  var exOk = t === 'haus' || units <= 3, express = !!e.ex && exOk;
  if (express) { add('Express', P.express); wt = C.lieferung.express; }
  if (e.sk) add('Vorlage nur Handskizze', P.skizze);
  var ak = pcAktion(C, jetzt), aktion = !!e.aktion && ak.aktiv;
  if (aktion) add('Startaktion · erste ' + (t === 'haus' ? 'Ebene inkl. Flächen' : t === 'gewerbe' ? 'Einheit' : 'Wohnung') + ' gratis', -Math.min(frei, total));
  var r = { typ: t, L: L, total: Math.max(0, Math.round(total * 100) / 100), units: units, werktage: wt, etappen: etappen, pkg: pkg, exOk: exOk, express: express, aktion: aktion, moebliert: e.mb !== false };
  r.termin = pcTermin(r, C, jetzt);
  return r;
}

function pcTermin(r, C, jetzt) {
  var s = pcStart(C, jetzt), nach = s.pause ? ' Die Frist beginnt nach der Pause.' : s.heute ? ' (Eingang heute vor 12 Uhr).' : ' (gezählt ab dem nächsten Werktag).';
  if (r.etappen) {
    var pilot = pcPlus(s.tag, C.lieferung.werktage), wochen = Math.ceil(Math.max(0, r.etappen - 1) / 5), ende = pcPlus(pilot, wochen * 5);
    return { kurz: 'Pilot bis ' + pcDatum(pilot), hinweis: 'Danach ca. 5 Wohnungen pro Woche, komplett etwa bis ' + pcDatum(ende) + ' Den genauen Plan bekommen Sie mit der Bestätigung.',
      satz: 'Die Pilotwohnung kommt voraussichtlich bis ' + pcDatum(pilot) + ', der Rest in Etappen, komplett etwa bis ' + pcDatum(ende), iso: pcIso(pilot) };
  }
  var d = pcPlus(s.tag, r.werktage);
  return { kurz: pcDatum(d) + ', 18 Uhr', hinweis: (r.werktage === 1 ? 'Ein Werktag' : r.werktage + ' Werktage') + ' ab Eingang der Unterlagen' + nach,
    satz: 'Der Grundriss kommt voraussichtlich bis ' + pcDatum(d) + ' 18 Uhr', iso: pcIso(d) };
}

/* Bestand (Hausverwaltung). e = { wohnungen, haeuser, geschosse, treppenhaus, keller } */
function pcBestand(e, C, jetzt) {
  var P = C.preise, we = pcZahl(e.wohnungen, 1, 2000), hs = pcZahl(e.haeuser, 1, 99), gs = pcZahl(e.geschosse, 1, 20), L = [];
  var rab = we >= 20 ? P.rabatt20 : we >= 5 ? P.rabatt5 : 0, per = P.wohnung + P.flaechen - rab;
  L.push([we + ' × Wohnung inkl. Flächen à ' + pcKurz(per), we * per]);
  if (e.treppenhaus) L.push(['Treppenhaus · ' + hs * gs + ' Geschosse × ' + pcKurz(P.treppenhaus), hs * gs * P.treppenhaus]);
  if (e.keller) L.push(['Keller · ' + hs + ' × ' + pcKurz(P.gemeinschaftskeller), hs * P.gemeinschaftskeller]);
  var total = 0; for (var i = 0; i < L.length; i++) total += L[i][1];
  var s = pcStart(C, jetzt), pilot = pcPlus(s.tag, C.lieferung.werktage), pm = Math.max(1, C.lieferung.proMonat), monate = Math.ceil(we / pm), wochen = Math.max(1, Math.ceil(Math.max(0, we - 1) / 5));
  return { wohnungen: we, haeuser: hs, geschosse: gs, L: L, total: Math.round(total * 100) / 100, rabatt: rab, rabattAb: we >= 20 ? 20 : 5, per: per, monate: monate,
    plan: monate <= 1 ? 'in ca. ' + wochen + (wochen > 1 ? ' Wochen' : ' Woche') : 'über ca. ' + monate + ' Monate',
    planHinweis: 'Pilotwohnung bis ' + pcDatum(pilot) + ', danach ca. 5 Wohnungen pro Woche (bis ca. ' + pm + ' im Monat).', pilot: pcDatum(pilot), iso: pcIso(pilot) };
}

function pcZeilen(L, total, wort) {
  var out = [];
  for (var i = 0; i < L.length; i++) out.push(L[i][0] + ': ' + pcEur(L[i][1]));
  out.push((wort || 'Gesamt') + ': ' + pcEur(total));
  return out.join('\n');
}

/* Preise, die auf der Website als Text stehen (für data-p="…") */
function pcAnzeige(C) {
  var P = C.preise, o = {}, k;
  for (k in P) o[k] = P[k];
  o.wohnungFlaechen = P.wohnung + P.flaechen;
  o.bestand5 = P.wohnung + P.flaechen - P.rabatt5;
  o.bestand20 = P.wohnung + P.flaechen - P.rabatt20;
  o.hausEinzeln = P.wohnung + P.ebene + P.nebenebene + P.flaechenHaus;
  return o;
}


const MAX_FILES = 10;
const MAX_TOTAL = 20 * 1024 * 1024; // 20 MB für alle Dateien zusammen
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const STATUS = ['neu', 'bestaetigt', 'in_arbeit', 'geliefert', 'bezahlt', 'abgelehnt'];
const TYPNAME = { wohnung: 'Wohnung', haus: 'Haus', gewerbe: 'Gewerbe', bestand: 'Bestand (Verwaltung)' };
const FRIST_OFFEN_TAGE = 183;   // Anfragen ohne Auftrag: 6 Monate
const FRIST_FERTIG_TAGE = 365;  // abgeschlossene Aufträge: 12 Monate
const CRON_MORGEN = '0 6 * * *';
const PHASEN = ['neu', 'angeschrieben', 'nachfassen', 'interessiert', 'kunde', 'kein_interesse'];
const PHASE_NAME = { neu: 'Noch nicht angeschrieben', angeschrieben: 'Angeschrieben', nachfassen: 'Nachfassen', interessiert: 'Interessiert', kunde: 'Kunde', kein_interesse: 'Kein Interesse' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), p = url.pathname;
    try {
      if (p === '/api/bestellung') {
        if (request.method !== 'POST') return json({ ok: false, error: 'Nur POST' }, 405);
        return await bestellung(request, env);
      }
      if (p === '/api/einstellungen') return await oeffentlich(env);
      if (p === '/api/admin' || p.startsWith('/api/admin/')) return await admin(request, env, url);
      if (p === '/admin' || p.startsWith('/admin/')) {
        const who = await zugang(request, env);
        if (!who.ok) return new Response(who.text, { status: who.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
        const res = await env.ASSETS.fetch(request);
        const h = new Headers(res.headers); h.set('Cache-Control', 'no-store'); h.set('X-Robots-Tag', 'noindex, nofollow');
        return new Response(res.body, { status: res.status, headers: h });
      }
    } catch (e) {
      console.error(e && e.stack || e);
      if (p === '/api/bestellung') return json({ ok: false, error: 'Senden fehlgeschlagen. Bitte schreiben Sie direkt an kontakt@plavocad.de.' }, 500);
      return json({ ok: false, error: 'Interner Fehler' }, 500);
    }
    return env.ASSETS.fetch(request); // statische Seiten, Bilder, 404-Seite
  },
  // Tägliche Läufe (Cron): nachts Löschfristen, morgens die Übersicht per Mail
  async scheduled(event, env, ctx) { ctx.waitUntil(event.cron === CRON_MORGEN ? morgenMail(env) : aufraeumen(env)); }
};

/* ---------------- Datenbank ---------------- */
let dbBereit = false;
async function datenbank(env) {
  if (!env.DB) return null;
  if (!dbBereit) {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS bestellungen (
        nr TEXT PRIMARY KEY, art TEXT NOT NULL, status TEXT NOT NULL, erstellt TEXT NOT NULL, geaendert TEXT NOT NULL,
        name TEXT, firma TEXT, mail TEXT, tel TEXT, objekt TEXT, typ TEXT, preis REAL, aktion INTEGER DEFAULT 0,
        termin TEXT, liefertermin TEXT, daten TEXT, notiz TEXT DEFAULT '', verlauf TEXT DEFAULT '[]')`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS bestellungen_status ON bestellungen (status, erstellt)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS einstellungen (k TEXT PRIMARY KEY, v TEXT NOT NULL, geaendert TEXT NOT NULL)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS kontakte (
        id INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL, firma TEXT DEFAULT '', name TEXT DEFAULT '', mail TEXT DEFAULT '', tel TEXT DEFAULT '',
        strasse TEXT DEFAULT '', plz TEXT DEFAULT '', ort TEXT DEFAULT '', web TEXT DEFAULT '', quelle TEXT DEFAULT '', wiedervorlage TEXT DEFAULT '',
        notiz TEXT DEFAULT '', verlauf TEXT DEFAULT '[]', erstellt TEXT NOT NULL, geaendert TEXT NOT NULL)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS kontakte_mail ON kontakte (mail)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS belege (
        id INTEGER PRIMARY KEY AUTOINCREMENT, art TEXT NOT NULL, nr TEXT UNIQUE, status TEXT NOT NULL, kontakt_id INTEGER, bestell_nr TEXT DEFAULT '',
        datum TEXT DEFAULT '', leistung TEXT DEFAULT '', faellig TEXT DEFAULT '', gueltig TEXT DEFAULT '', objekt TEXT DEFAULT '', kaeufer TEXT DEFAULT '{}',
        positionen TEXT DEFAULT '[]', summe REAL DEFAULT 0, text_ein TEXT DEFAULT '', text_aus TEXT DEFAULT '', verkaeufer TEXT DEFAULT '',
        festgeschrieben TEXT DEFAULT '', versendet TEXT DEFAULT '', bezahlt_am TEXT DEFAULT '', bezahlt_betrag REAL DEFAULT 0, bezug INTEGER,
        verlauf TEXT DEFAULT '[]', erstellt TEXT NOT NULL, geaendert TEXT NOT NULL)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS belege_kontakt ON belege (kontakt_id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS nummern (art TEXT NOT NULL, jahr INTEGER NOT NULL, letzte INTEGER NOT NULL, PRIMARY KEY (art, jahr))')
    ]);
    // ältere Datenbank: Spalte für die Verknüpfung Bestellung → Kunde nachrüsten
    try { await env.DB.prepare('ALTER TABLE bestellungen ADD COLUMN kontakt_id INTEGER').run(); } catch (e) { /* gibt es schon */ }
    dbBereit = true;
  }
  return env.DB;
}
let cfgCache = null, cfgZeit = 0;
async function konfig(env, frisch) {
  if (!frisch && cfgCache && Date.now() - cfgZeit < 30000) return cfgCache;
  let roh = {};
  try {
    const db = await datenbank(env);
    if (db) { const r = await db.prepare('SELECT v FROM einstellungen WHERE k = ?').bind('konfig').first(); if (r && r.v) roh = JSON.parse(r.v); }
  } catch (e) { console.error('Einstellungen', e); }
  cfgCache = pcKonfig(roh); cfgZeit = Date.now();
  return cfgCache;
}
async function konfigSpeichern(env, C) {
  const db = await datenbank(env);
  await db.prepare('INSERT INTO einstellungen (k, v, geaendert) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, geaendert = excluded.geaendert')
    .bind('konfig', JSON.stringify(C), new Date().toISOString()).run();
  cfgCache = C; cfgZeit = Date.now();
}
async function aufraeumen(env) {
  const db = await datenbank(env); if (!db) return 0;
  const tag = n => new Date(Date.now() - n * 86400000).toISOString();
  const a = await db.prepare("DELETE FROM bestellungen WHERE status IN ('neu', 'abgelehnt') AND erstellt < ?").bind(tag(FRIST_OFFEN_TAGE)).run();
  const b = await db.prepare("DELETE FROM bestellungen WHERE status IN ('geliefert', 'bezahlt') AND geaendert < ?").bind(tag(FRIST_FERTIG_TAGE)).run();
  // Akquise-Kontakte ohne Interesse: 6 Monate nach der letzten Änderung, sofern es keine Belege zu ihnen gibt. Rechnungen werden nie automatisch gelöscht.
  const c = await db.prepare("DELETE FROM kontakte WHERE phase = 'kein_interesse' AND geaendert < ? AND id NOT IN (SELECT kontakt_id FROM belege WHERE kontakt_id IS NOT NULL)").bind(tag(FRIST_OFFEN_TAGE)).run();
  return ((a.meta && a.meta.changes) || 0) + ((b.meta && b.meta.changes) || 0) + ((c.meta && c.meta.changes) || 0);
}

/* ---------------- Öffentliche Einstellungen ---------------- */
async function oeffentlich(env) {
  const C = await konfig(env), jetzt = pcJetzt(), ak = pcAktion(C, jetzt), pause = pcPause(C, jetzt);
  return new Response(JSON.stringify({
    ok: true, preise: C.preise,
    aktion: { an: ak.aktiv, frei: ak.frei, gesamt: ak.gesamt, bis: ak.bis },
    lieferung: { werktage: C.lieferung.werktage, express: C.lieferung.express, proMonat: C.lieferung.proMonat, pauseAn: !!pause, pauseBis: pause ? C.lieferung.pauseBis : '', pauseText: pause ? pause.text : '' }
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
}

/* ---------------- Bestellung / Anfrage ---------------- */
async function bestellung(request, env) {
  const len = +(request.headers.get('content-length') || 0);
  if (len > MAX_TOTAL + 200_000) return json({ ok: false, error: 'Die Dateien sind zusammen größer als 20 MB.' }, 413);

  const f = await request.formData();
  if (f.get('website')) return json({ ok: true }); // Honigtopf-Feld: von Menschen unsichtbar, Bots füllen es aus

  const v = k => String(f.get(k) || '').trim().slice(0, 4000);
  const an = k => !!f.get(k);
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

  // Preis und Termin rechnet der Server selbst, mit den aktuellen Einstellungen
  const C = await konfig(env, true), jetzt = pcJetzt();
  const formular = v('formular');
  let art, typ, positionen, preis, termin, terminIso = '', aktion = false, eingabe = {};
  if (formular === 'bestand') {
    eingabe = { wohnungen: v('wohnungen'), haeuser: v('haeuser'), geschosse: v('geschosse'), treppenhaus: an('treppenhaus'), keller: an('keller') };
    const r = pcBestand(eingabe, C, jetzt);
    art = 'anfrage'; typ = TYPNAME.bestand; positionen = pcZeilen(r.L, r.total, 'Richtpreis'); preis = r.total; eingabe.zeilen = r.L;
    termin = 'Pilot bis ' + r.pilot + ', ' + r.plan; terminIso = r.iso;
  } else if (formular === 'bestellung') {
    eingabe = { typ: v('typ'), menge: v('menge'), maisonette: an('maisonette'), ebenen: v('ebenen'), keller: an('keller'), dach: an('dach'),
      fl: an('fl'), mb: an('mb'), d3: an('d3'), ds: an('ds'), ex: an('ex'), sk: an('sk'), aktion: an('aktion') };
    const r = pcBestellung(eingabe, C, jetzt);
    aktion = r.aktion; art = r.total === 0 ? 'gratis' : 'bestellung'; typ = TYPNAME[r.typ]; eingabe.zeilen = r.L;
    positionen = pcZeilen(r.L.concat([[r.moebliert ? 'Möbliert' : 'Ohne Möbel', 0]]), r.total).replace(/: 0,00 €\n/, ': inklusive\n');
    preis = r.total; termin = r.termin.kurz; terminIso = r.termin.iso;
  } else { // ältere Fassung der Website im Zwischenspeicher: Angaben des Browsers übernehmen
    art = ['gratis', 'anfrage'].includes(v('art')) ? v('art') : 'bestellung'; typ = v('typ'); positionen = v('positionen');
    preis = parseFloat(v('preis').replace(/\./g, '').replace(',', '.')) || 0; termin = v('termin'); aktion = an('aktion');
  }

  const nr = 'PC-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + zufall(4);
  const LABEL = { unterlagen: 'Unterlagen', benennung: 'Benennung', abrechnung: 'Abrechnung', wunschtermin: 'Wunschtermin', objekt: 'Objekt / Referenz',
    name: 'Name', firma: 'Firma', mail: 'E-Mail', tel: 'Telefon', text: 'Bemerkung' };
  const felder = {};
  for (const k of Object.keys(LABEL)) if (v(k)) felder[k] = v(k);
  const dateien = files.map(x => ({ name: safeName(x.name), kb: Math.round(x.size / 1024) }));

  const rows = [['Bestellnummer', nr], ['Art', art === 'gratis' ? 'Gratis-Wohnung (Startaktion)' : art === 'anfrage' ? 'Anfrage' : 'Bestellung'], ['Objektart', typ],
    ['Positionen', '\n' + positionen], ['Termin laut Website', termin]];
  for (const k of Object.keys(LABEL)) if (felder[k]) rows.push([LABEL[k], felder[k]]);
  rows.push(['Dateien', dateien.map(x => x.name + ' (' + x.kb + ' KB)').join(', ') || 'keine']);
  rows.push(['Admin', 'https://plavocad.de/admin/#/b/' + nr]);
  const text = rows.map(r => r[0] + ': ' + r[1]).join('\n');

  // 1. Speichern (ohne Dateien). Schlägt das fehl, geht die Bestellung trotzdem per E-Mail raus.
  let gespeichert = false;
  const jetztIso = new Date().toISOString();
  try {
    const db = await datenbank(env);
    if (db) {
      await db.prepare(`INSERT INTO bestellungen (nr, art, status, erstellt, geaendert, name, firma, mail, tel, objekt, typ, preis, aktion, termin, liefertermin, daten, notiz, verlauf)
        VALUES (?, ?, 'neu', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)`)
        .bind(nr, art, jetztIso, jetztIso, name, v('firma'), mail, v('tel'), v('objekt'), typ, preis, aktion ? 1 : 0, termin, terminIso,
          JSON.stringify({ eingabe, positionen, felder, dateien }), JSON.stringify([{ t: jetztIso, was: 'Eingang über die Website' }])).run();
      gespeichert = true;
      await kontaktZuBestellung(db, nr, { mail, name, firma: v('firma'), tel: v('tel') }, art);
    }
  } catch (e) { console.error('Speichern', e); }

  // 2. E-Mail an Tomo mit den Plänen im Anhang
  const attachments = [];
  for (const x of files) attachments.push({ filename: safeName(x.name), content: b64(await x.arrayBuffer()) });
  const res = await resend(env, {
    from: env.MAIL_FROM, to: [env.MAIL_TO], reply_to: mail, // „Antworten“ geht direkt an den Kunden
    subject: `Neue ${art === 'gratis' ? 'Gratis-Wohnung' : art === 'anfrage' ? 'Anfrage' : 'Bestellung'} ${nr} – ${v('firma') || name || mail}`,
    text, attachments
  });
  if (!res.ok) {
    console.error('Resend', res.status, await res.text());
    if (gespeichert) await vermerk(env, nr, 'E-Mail an PlavoCAD fehlgeschlagen. Dateien sind nicht angekommen.');
    throw new Error('mail');
  }

  // 3. Eingangsbestätigung an den Kunden (ohne Anhänge). Schlägt sie fehl, gilt die Bestellung trotzdem als angekommen.
  const anfrage = art === 'anfrage';
  const conf = [
    (name ? 'Guten Tag ' + name + ',' : 'Guten Tag,'), '',
    'vielen Dank, Ihre ' + (anfrage ? 'Anfrage' : 'Bestellung') + ' ' + nr + ' ist bei mir eingegangen.',
    anfrage
      ? 'Ich sehe mir Ihre Angaben an und schicke Ihnen ein schriftliches Angebot.'
      : 'Dies ist eine automatische Eingangsbestätigung. Ich prüfe Ihre Unterlagen und bestätige den Auftrag am selben Werktag. Erst mit dieser Bestätigung kommt der Auftrag zustande.', '',
    'Ihre Angaben:', positionen, '',
    (anfrage ? 'Wunschtermin: ' + (v('wunschtermin') || 'keiner angegeben') : 'Voraussichtlicher Liefertermin: ' + termin), '',
    files.length ? files.length + ' Datei(en) sind angekommen.' : 'Bitte schicken Sie mir die Pläne noch per E-Mail (Antwort auf diese Nachricht) oder per WhatsApp an 0172 313 61 17.',
    'Die Rechnung kommt erst nach der Lieferung.', '',
    'Es gelten meine AGB: https://plavocad.de/agb', '',
    'Viele Grüße', 'Tomo Kovačević', 'PlavoCAD · 0172 313 61 17 · kontakt@plavocad.de'
  ].join('\n');
  try {
    const r2 = await resend(env, { from: env.MAIL_FROM, to: [mail], reply_to: env.MAIL_TO, subject: 'Eingangsbestätigung ' + nr + ' · PlavoCAD', text: conf });
    if (!r2.ok && gespeichert) await vermerk(env, nr, 'Eingangsbestätigung an den Kunden fehlgeschlagen.');
  } catch (e) { console.error('Bestätigung', e); }
  return json({ ok: true, nr, preis: pcEur(preis), termin });
}

function resend(env, body) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}
async function vermerk(env, nr, was) {
  try {
    const db = await datenbank(env); if (!db) return;
    const r = await db.prepare('SELECT verlauf FROM bestellungen WHERE nr = ?').bind(nr).first(); if (!r) return;
    const vl = lese(r.verlauf, []); vl.push({ t: new Date().toISOString(), was });
    await db.prepare('UPDATE bestellungen SET verlauf = ?, geaendert = ? WHERE nr = ?').bind(JSON.stringify(vl), new Date().toISOString(), nr).run();
  } catch (e) { console.error('Vermerk', e); }
}

/* ---------------- Admin: Anmeldung über Cloudflare Access ---------------- */
const certsCache = {};
async function zugang(request, env) {
  // ACCESS_TEAM darf mehrere Team-Domains enthalten, mit Komma getrennt (z. B. nach einer Umbenennung).
  const teams = String(env.ACCESS_TEAM || '').split(',').map(t => t.trim().replace(/^https?:\/\//, '').replace(/\.cloudflareaccess\.com.*$/, '')).filter(Boolean), aud = String(env.ACCESS_AUD || '').trim();
  if (!teams.length || !aud) return { ok: false, status: 503, text: 'Der Admin-Bereich ist noch nicht eingerichtet (ACCESS_TEAM und ACCESS_AUD fehlen).' };
  let tok = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!tok) { const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') || ''); if (m) tok = m[1]; }
  if (!tok) return { ok: false, status: 401, text: 'Nicht angemeldet. Bitte über Cloudflare Access anmelden.' };
  try {
    const teile = tok.split('.'); if (teile.length !== 3) throw new Error('Form');
    const kopf = JSON.parse(text64(teile[0])), inhalt = JSON.parse(text64(teile[1]));
    if (kopf.alg !== 'RS256') throw new Error('Verfahren');
    const tokTeam = String(inhalt.iss || '').replace(/^https:\/\//, '').replace(/\.cloudflareaccess\.com\/?$/, '');
    if (!teams.includes(tokTeam)) throw new Error('ACCESS_TEAM ist „' + teams.join(', ') + '“, die Anmeldung kommt aber vom Team „' + tokTeam + '“. Bitte „' + tokTeam + '“ in ACCESS_TEAM ergänzen');
    const iss = 'https://' + tokTeam + '.cloudflareaccess.com';
    let c = certsCache[tokTeam];
    if (!c || Date.now() - c.zeit > 3600000 || !c.keys.some(k => k.kid === kopf.kid)) {
      const r = await fetch(iss + '/cdn-cgi/access/certs'); if (!r.ok) throw new Error('Schlüssel nicht abrufbar, HTTP ' + r.status + ' von ' + iss);
      c = certsCache[tokTeam] = { keys: (await r.json()).keys || [], zeit: Date.now() };
    }
    const certs = c.keys;
    const jwk = certs.find(k => k.kid === kopf.kid); if (!jwk) throw new Error('Schlüssel unbekannt');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const gut = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes64(teile[2]), new TextEncoder().encode(teile[0] + '.' + teile[1]));
    if (!gut) throw new Error('Signatur');
    const auds = Array.isArray(inhalt.aud) ? inhalt.aud : [inhalt.aud];
    if (!auds.includes(aud)) throw new Error('Anwendung');
    if (inhalt.iss !== iss) throw new Error('Aussteller');
    if (!inhalt.exp || inhalt.exp * 1000 < Date.now()) throw new Error('abgelaufen');
    const wer = String(inhalt.email || '').toLowerCase(), nur = String(env.ADMIN_MAIL || '').trim().toLowerCase();
    if (nur && wer !== nur) return { ok: false, status: 403, text: 'Diese Adresse hat keinen Zugang.' };
    return { ok: true, mail: wer };
  } catch (e) { return { ok: false, status: 401, text: 'Anmeldung ungültig (' + e.message + '). Bitte neu anmelden.' }; }
}

/* ---------------- Admin: Schnittstelle ---------------- */
async function admin(request, env, url) {
  const who = await zugang(request, env);
  if (!who.ok) return json({ ok: false, error: who.text }, who.status);
  const m = request.method;
  // Schreibende Aufrufe nur aus dem Admin-Bereich selbst (eigener Kopf, den fremde Seiten nicht setzen können)
  if (m !== 'GET' && request.headers.get('X-PlavoCAD-Admin') !== '1') return json({ ok: false, error: 'Aufruf nicht erlaubt.' }, 403);
  const db = await datenbank(env);
  if (!db) return json({ ok: false, error: 'Die Datenbank ist noch nicht verbunden (Bindung DB fehlt).' }, 503);
  const teile = url.pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

  if (teile[0] === 'ich' && m === 'GET') return json({ ok: true, mail: who.mail });
  if (['heute', 'kontakte', 'belege', 'firma'].includes(teile[0])) return await buero(request, env, db, teile, m);

  if (teile[0] === 'einstellungen') {
    if (m === 'GET') return json({ ok: true, konfig: await konfig(env, true), standard: PC_STANDARD });
    if (m === 'PUT') { const C = pcKonfig(await request.json()); await konfigSpeichern(env, C); return json({ ok: true, konfig: C }); }
  }

  if (teile[0] === 'bestellungen' && teile.length === 1 && m === 'GET') {
    await aufraeumen(env);
    const r = await db.prepare('SELECT nr, art, status, erstellt, geaendert, name, firma, mail, tel, objekt, typ, preis, aktion, termin, liefertermin FROM bestellungen ORDER BY erstellt DESC LIMIT 500').all();
    return json({ ok: true, liste: r.results || [] });
  }

  if (teile[0] === 'bestellungen' && teile.length >= 2) {
    const nr = teile[1];
    const row = await db.prepare('SELECT * FROM bestellungen WHERE nr = ?').bind(nr).first();
    if (!row) return json({ ok: false, error: 'Bestellung nicht gefunden.' }, 404);
    const voll = () => Object.assign({}, row, { daten: lese(row.daten, {}), verlauf: lese(row.verlauf, []) });

    if (teile.length === 2 && m === 'GET') {
      const k = row.kontakt_id ? await db.prepare('SELECT id, phase, firma, name FROM kontakte WHERE id = ?').bind(row.kontakt_id).first() : null;
      const bl = await db.prepare('SELECT id, art, nr, status, summe, datum, festgeschrieben FROM belege WHERE bestell_nr = ? ORDER BY id').bind(nr).all();
      return json({ ok: true, b: voll(), kontakt: k, belege: bl.results || [] });
    }

    if (teile.length === 2 && m === 'DELETE') { await db.prepare('DELETE FROM bestellungen WHERE nr = ?').bind(nr).run(); return json({ ok: true }); }

    if (teile.length === 2 && m === 'PATCH') {
      const a = await request.json(), vl = lese(row.verlauf, []), t = new Date().toISOString();
      if (a.status !== undefined) {
        if (!STATUS.includes(a.status)) return json({ ok: false, error: 'Unbekannter Status.' }, 400);
        if (a.status !== row.status) { vl.push({ t, was: 'Status: ' + row.status + ' → ' + a.status }); row.status = a.status; }
      }
      if (a.notiz !== undefined) row.notiz = String(a.notiz).slice(0, 4000);
      if (a.liefertermin !== undefined) row.liefertermin = /^\d{4}-\d{2}-\d{2}$/.test(a.liefertermin) ? a.liefertermin : '';
      if (a.preis !== undefined && isFinite(+a.preis) && +a.preis >= 0 && +a.preis !== row.preis) { vl.push({ t, was: 'Preis: ' + pcEur(row.preis || 0) + ' → ' + pcEur(+a.preis) }); row.preis = Math.round(+a.preis * 100) / 100; }
      row.verlauf = JSON.stringify(vl); row.geaendert = t;
      await db.prepare('UPDATE bestellungen SET status = ?, notiz = ?, liefertermin = ?, preis = ?, verlauf = ?, geaendert = ? WHERE nr = ?')
        .bind(row.status, row.notiz, row.liefertermin, row.preis, row.verlauf, t, nr).run();
      return json({ ok: true, b: voll() });
    }

    // E-Mail an den Kunden über Resend: Auftragsbestätigung, Lieferung (mit Dateien) oder freie Nachricht
    if (teile[2] === 'mail' && m === 'POST') {
      const f = await request.formData(), art = String(f.get('art') || 'nachricht');
      const betreff = String(f.get('betreff') || '').trim().slice(0, 200), text = String(f.get('text') || '').trim().slice(0, 20000);
      if (!betreff || !text) return json({ ok: false, error: 'Betreff und Text dürfen nicht leer sein.' }, 400);
      if (!row.mail) return json({ ok: false, error: 'Zu dieser Bestellung gibt es keine E-Mail-Adresse.' }, 400);
      const files = f.getAll('dateien').filter(x => x && typeof x === 'object' && x.size > 0);
      if (files.length > 10) return json({ ok: false, error: 'Höchstens 10 Dateien.' }, 400);
      if (files.reduce((s, x) => s + x.size, 0) > MAX_TOTAL) return json({ ok: false, error: 'Die Dateien sind zusammen größer als 20 MB.' }, 413);
      const attachments = [];
      for (const x of files) attachments.push({ filename: safeName(x.name), content: b64(await x.arrayBuffer()) });
      const body = { from: env.MAIL_FROM, to: [row.mail], bcc: [env.MAIL_TO], reply_to: env.MAIL_TO, subject: betreff, text };
      if (attachments.length) body.attachments = attachments;
      const res = await resend(env, body);
      if (!res.ok) { console.error('Resend', res.status, await res.text()); return json({ ok: false, error: 'Resend hat die E-Mail nicht angenommen (Status ' + res.status + ').' }, 502); }
      const vl = lese(row.verlauf, []), t = new Date().toISOString();
      const namen = files.map(x => safeName(x.name)).join(', ');
      vl.push({ t, was: (art === 'bestaetigung' ? 'Auftragsbestätigung' : art === 'lieferung' ? 'Lieferung' : 'Nachricht') + ' gesendet: „' + betreff + '“' + (namen ? ' · Anhang: ' + namen : '') });
      const lt = String(f.get('liefertermin') || '');
      if (art === 'bestaetigung') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(lt)) row.liefertermin = lt;
        if (row.status === 'neu') {
          vl.push({ t, was: 'Status: neu → bestaetigt' }); row.status = 'bestaetigt';
          if (row.aktion) { // Startaktion: einen freien Platz abziehen
            const C = await konfig(env, true);
            if (C.aktion.frei > 0) { C.aktion.frei -= 1; await konfigSpeichern(env, C); vl.push({ t, was: 'Startaktion: noch ' + C.aktion.frei + ' von ' + C.aktion.gesamt + ' Plätzen frei' }); }
          }
        }
      }
      if (art === 'lieferung' && ['neu', 'bestaetigt', 'in_arbeit'].includes(row.status)) { vl.push({ t, was: 'Status: ' + row.status + ' → geliefert' }); row.status = 'geliefert'; }
      row.verlauf = JSON.stringify(vl); row.geaendert = t;
      await db.prepare('UPDATE bestellungen SET status = ?, liefertermin = ?, verlauf = ?, geaendert = ? WHERE nr = ?').bind(row.status, row.liefertermin, row.verlauf, t, nr).run();
      return json({ ok: true, b: voll() });
    }
  }
  return json({ ok: false, error: 'Unbekannter Aufruf.' }, 404);
}

/* ---------------- Büro: Firmendaten, Kunden, Akquise, Angebote, Rechnungen ---------------- */
const FIRMA_STANDARD = {
  name: 'PlavoCAD', inhaber: 'Tomo Kovačević', strasse: 'Spandauer Str. 210', plz: '14612', ort: 'Falkensee', tel: '+49 172 3136117',
  mail: 'kontakt@plavocad.de', web: 'plavocad.de', steuernr: '', ustid: '', bank: '', iban: '', bic: '',
  kleinunternehmer: true, zahlungsziel: 14, angebotTage: 30, morgenmail: true,
  angebotEin: 'vielen Dank für Ihre Anfrage. Gerne biete ich Ihnen folgende Leistungen an:',
  angebotAus: 'Das Angebot gilt bis {GUELTIG}. Wenn es passt, genügt eine kurze Antwort per E-Mail. Es gelten meine AGB: plavocad.de/agb',
  rechnungEin: 'vielen Dank für Ihren Auftrag. Für die erbrachten Leistungen berechne ich Ihnen:',
  rechnungAus: 'Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer bis zum {FAELLIG}.',
  brief: 'Guten Tag {ANREDE},\n\nfür Ihre Exposés zeichne ich Grundrisse aus dem, was Sie haben: eine Kopie aus der Bauakte, eine Handskizze oder Fotos vom Plan. Sie bekommen einen sauberen, möblierten Grundriss mit Raumnamen und Wohnfläche als PDF und PNG.\n\nWohnung ab 25 €, Haus bis 3 Ebenen 69 €, in der Regel fertig in 48 Stunden. Sie prüfen zuerst und zahlen erst danach auf Rechnung.\n\nZum Kennenlernen zeichne ich Ihnen die erste Wohnung kostenlos (Startaktion bis {AKTION_BIS}, die ersten 10 Maklerbüros). Schicken Sie mir einfach einen Plan über plavocad.de/bestellen oder per WhatsApp an 0172 313 61 17.\n\nViele Grüße'
};
function firmaPruefen(a) {
  const o = {}, s = (v, n) => String(v === undefined || v === null ? '' : v).trim().slice(0, n);
  for (const k of Object.keys(FIRMA_STANDARD)) {
    const d = FIRMA_STANDARD[k], v = a && a[k];
    if (typeof d === 'boolean') o[k] = v === undefined ? d : v === true || v === 'true' || v === 1 || v === '1';
    else if (typeof d === 'number') { const n = Math.round(Number(v)); o[k] = isFinite(n) && n >= 0 && n <= 365 ? n : d; }
    else o[k] = v === undefined || v === null ? d : s(v, ['brief', 'angebotEin', 'angebotAus', 'rechnungEin', 'rechnungAus'].includes(k) ? 3000 : 200);
  }
  o.iban = o.iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
  return o;
}
async function firma(db) {
  const r = await db.prepare('SELECT v FROM einstellungen WHERE k = ?').bind('firma').first();
  return firmaPruefen(r && r.v ? lese(r.v, {}) : {});
}
const heuteIso = () => pcIso(pcJetzt());
const plusTage = (iso, n) => { const d = pcTag(iso) || pcTag(heuteIso()); d.setUTCDate(d.getUTCDate() + n); return pcIso(d); };
const istDatum = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const rund = n => Math.round(n * 100) / 100;

// Neue Bestellung: Kunden über die E-Mail-Adresse finden oder anlegen, Bestellung verknüpfen
async function kontaktZuBestellung(db, nr, k, art) {
  try {
    const mail = String(k.mail || '').toLowerCase(), t = new Date().toISOString();
    let row = await db.prepare('SELECT * FROM kontakte WHERE mail = ? ORDER BY id LIMIT 1').bind(mail).first();
    if (!row) {
      const vl = [{ t, was: 'Angelegt durch ' + (art === 'anfrage' ? 'Anfrage' : 'Bestellung') + ' ' + nr + ' über die Website' }];
      const r = await db.prepare(`INSERT INTO kontakte (phase, firma, name, mail, tel, quelle, verlauf, erstellt, geaendert) VALUES ('kunde', ?, ?, ?, ?, 'Website', ?, ?, ?) RETURNING id`)
        .bind(k.firma || '', k.name || '', mail, k.tel || '', JSON.stringify(vl), t, t).first();
      row = { id: r.id };
    } else {
      const vl = lese(row.verlauf, []);
      vl.push({ t, was: (art === 'anfrage' ? 'Anfrage ' : 'Bestellung ') + nr + ' über die Website' + (row.phase !== 'kunde' ? ' · Phase: ' + PHASE_NAME[row.phase] + ' → Kunde' : '') });
      await db.prepare('UPDATE kontakte SET phase = ?, firma = ?, name = ?, tel = ?, wiedervorlage = ?, verlauf = ?, geaendert = ? WHERE id = ?')
        .bind('kunde', row.firma || k.firma || '', row.name || k.name || '', row.tel || k.tel || '', row.phase === 'kunde' ? row.wiedervorlage : '', JSON.stringify(vl), t, row.id).run();
    }
    await db.prepare('UPDATE bestellungen SET kontakt_id = ? WHERE nr = ?').bind(row.id, nr).run();
  } catch (e) { console.error('Kunde zuordnen', e); }
}
async function kontaktVermerk(db, id, was) {
  if (!id) return;
  try {
    const r = await db.prepare('SELECT verlauf FROM kontakte WHERE id = ?').bind(id).first(); if (!r) return;
    const vl = lese(r.verlauf, []), t = new Date().toISOString(); vl.push({ t, was });
    await db.prepare('UPDATE kontakte SET verlauf = ?, geaendert = ? WHERE id = ?').bind(JSON.stringify(vl), t, id).run();
  } catch (e) { console.error('Kontakt-Vermerk', e); }
}

function kontaktFelder(a, alt = {}) {
  const s = (k, n) => a[k] === undefined ? (alt[k] || '') : String(a[k] || '').trim().slice(0, n);
  const o = { firma: s('firma', 200), name: s('name', 200), mail: s('mail', 200).toLowerCase(), tel: s('tel', 60), strasse: s('strasse', 200), plz: s('plz', 12),
    ort: s('ort', 120), web: s('web', 200), quelle: s('quelle', 80), notiz: s('notiz', 4000) };
  o.phase = a.phase !== undefined && PHASEN.includes(a.phase) ? a.phase : (alt.phase || 'neu');
  o.wiedervorlage = a.wiedervorlage === undefined ? (alt.wiedervorlage || '') : istDatum(a.wiedervorlage) ? a.wiedervorlage : '';
  return o;
}
function belegZeile(r) {
  return Object.assign({}, r, { kaeufer: lese(r.kaeufer, {}), positionen: lese(r.positionen, []), verkaeufer: lese(r.verkaeufer, null), verlauf: lese(r.verlauf, []) });
}
function positionenPruefen(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.slice(0, 60).map(p => ({
    text: String(p.text || '').trim().slice(0, 1200), einheit: String(p.einheit || '').trim().slice(0, 24),
    menge: isFinite(+p.menge) ? rund(+p.menge) : 1, preis: isFinite(+p.preis) ? rund(+p.preis) : 0
  })).filter(p => p.text || p.preis);
}
const summeVon = pos => rund(pos.reduce((s, p) => s + rund(p.menge * p.preis), 0));
function kaeuferPruefen(k) {
  k = k || {}; const s = (x, n) => String(k[x] || '').trim().slice(0, n);
  return { firma: s('firma', 200), name: s('name', 200), strasse: s('strasse', 200), plz: s('plz', 12), ort: s('ort', 120), mail: s('mail', 200).toLowerCase() };
}
// Pflichtangaben einer Rechnung nach § 14 Abs. 4 UStG (für Kleinunternehmer § 34a UStDV), soweit sie hier prüfbar sind
function pflichtangaben(b, F) {
  const fehlt = [], k = b.kaeufer || {};
  if (!(F.inhaber || F.name)) fehlt.push('Dein Name (Einstellungen → Firma)');
  if (!F.strasse || !F.plz || !F.ort) fehlt.push('Deine Anschrift (Einstellungen → Firma)');
  if (!F.steuernr && !F.ustid) fehlt.push('Steuernummer oder USt-IdNr. (Einstellungen → Firma)');
  if (!(k.firma || k.name)) fehlt.push('Name oder Firma des Kunden');
  if (!k.strasse || !k.plz || !k.ort) fehlt.push('Anschrift des Kunden');
  if (!istDatum(b.datum)) fehlt.push('Rechnungsdatum');
  if (!String(b.leistung || '').trim()) fehlt.push('Leistungsdatum oder Leistungszeitraum');
  const pos = b.positionen || [];
  if (!pos.length || pos.some(p => !p.text)) fehlt.push('Mindestens eine Position mit Beschreibung');
  if (!(b.summe > 0)) fehlt.push('Rechnungsbetrag größer als 0 €');
  return fehlt;
}
// Lückenlose Nummer: Zähler und Beleg werden in einem Schritt (Transaktion) geschrieben
async function nummerVergeben(db, id, kreis, jahr) {
  await db.batch([
    db.prepare('INSERT INTO nummern (art, jahr, letzte) VALUES (?, ?, 1) ON CONFLICT(art, jahr) DO UPDATE SET letzte = letzte + 1').bind(kreis, Math.trunc(jahr)),
    db.prepare("UPDATE belege SET nr = ? || '-' || ? || '-' || printf('%03d', (SELECT letzte FROM nummern WHERE art = ? AND jahr = ?)) WHERE id = ? AND (nr IS NULL OR nr = '')")
      .bind(kreis, String(Math.trunc(jahr)), kreis, Math.trunc(jahr), id) // Jahr als Text verketten, sonst wird je nach Datenbank „2026.0“ daraus
  ]);
  const r = await db.prepare('SELECT nr FROM belege WHERE id = ?').bind(id).first();
  return r && r.nr;
}
async function belegLaden(db, id) {
  const r = await db.prepare('SELECT * FROM belege WHERE id = ?').bind(+id).first();
  return r ? belegZeile(r) : null;
}
function belegVermerk(b, was) { b.verlauf = (b.verlauf || []).concat([{ t: new Date().toISOString(), was }]); }
async function belegSpeichern(db, b) {
  b.geaendert = new Date().toISOString();
  await db.prepare(`UPDATE belege SET status = ?, kontakt_id = ?, bestell_nr = ?, datum = ?, leistung = ?, faellig = ?, gueltig = ?, objekt = ?, kaeufer = ?, positionen = ?, summe = ?,
    text_ein = ?, text_aus = ?, versendet = ?, bezahlt_am = ?, bezahlt_betrag = ?, verlauf = ?, geaendert = ? WHERE id = ?`)
    .bind(b.status, b.kontakt_id || null, b.bestell_nr || '', b.datum || '', b.leistung || '', b.faellig || '', b.gueltig || '', b.objekt || '', JSON.stringify(b.kaeufer || {}),
      JSON.stringify(b.positionen || []), b.summe || 0, b.text_ein || '', b.text_aus || '', b.versendet || '', b.bezahlt_am || '', b.bezahlt_betrag || 0,
      JSON.stringify(b.verlauf || []), b.geaendert, b.id).run();
}
async function bestellVermerk(db, nr, was, status) {
  if (!nr) return;
  try {
    const r = await db.prepare('SELECT status, verlauf FROM bestellungen WHERE nr = ?').bind(nr).first(); if (!r) return;
    const vl = lese(r.verlauf, []), t = new Date().toISOString(); vl.push({ t, was });
    let st = r.status;
    if (status && status !== st) { vl.push({ t, was: 'Status: ' + st + ' → ' + status }); st = status; }
    await db.prepare('UPDATE bestellungen SET status = ?, verlauf = ?, geaendert = ? WHERE nr = ?').bind(st, JSON.stringify(vl), t, nr).run();
  } catch (e) { console.error('Bestell-Vermerk', e); }
}

// „Heute“: alles, was ansteht. Dient auch der Morgen-Mail.
async function heuteDaten(db) {
  const h = heuteIso(), morgen = plusTage(h, 1), vor7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const q = async (sql, ...a) => ((await db.prepare(sql).bind(...a).all()).results || []);
  return {
    heute: h,
    neu: await q("SELECT nr, art, name, firma, mail, objekt, typ, preis, erstellt FROM bestellungen WHERE status = 'neu' ORDER BY erstellt"),
    lieferungen: await q("SELECT nr, name, firma, mail, objekt, typ, preis, liefertermin, status FROM bestellungen WHERE status IN ('bestaetigt', 'in_arbeit') AND liefertermin <> '' AND liefertermin <= ? ORDER BY liefertermin", morgen),
    ohneRechnung: await q("SELECT b.nr, b.name, b.firma, b.objekt, b.preis, b.geaendert FROM bestellungen b WHERE b.status = 'geliefert' AND b.preis > 0 AND NOT EXISTS (SELECT 1 FROM belege r WHERE r.bestell_nr = b.nr AND r.art = 'rechnung') ORDER BY b.geaendert"),
    wiedervorlagen: await q("SELECT id, phase, firma, name, ort, tel, mail, wiedervorlage, notiz FROM kontakte WHERE wiedervorlage <> '' AND wiedervorlage <= ? AND phase <> 'kein_interesse' ORDER BY wiedervorlage", h),
    rechnungen: (await q("SELECT id, nr, kaeufer, summe, faellig, datum, bezahlt_betrag FROM belege WHERE art = 'rechnung' AND status = 'offen' ORDER BY faellig")).map(r => Object.assign(r, { kaeufer: lese(r.kaeufer, {}) })),
    angebote: (await q("SELECT id, nr, kaeufer, summe, versendet, gueltig FROM belege WHERE art = 'angebot' AND status = 'versendet' AND versendet < ? ORDER BY versendet", vor7)).map(r => Object.assign(r, { kaeufer: lese(r.kaeufer, {}) }))
  };
}
async function morgenMail(env) {
  const db = await datenbank(env); if (!db) return false;
  const F = await firma(db); if (!F.morgenmail) return false;
  const d = await heuteDaten(db), h = d.heute;
  const wer = x => x.firma || x.name || x.mail || (x.kaeufer && (x.kaeufer.firma || x.kaeufer.name)) || '–';
  const teile = [];
  const block = (titel, liste, zeile) => { if (liste.length) teile.push(titel + ' (' + liste.length + ')\n' + liste.map(x => '– ' + zeile(x)).join('\n')); };
  block('Neue Bestellungen und Anfragen', d.neu, x => x.nr + ' · ' + wer(x) + (x.objekt ? ' · ' + x.objekt : '') + ' · https://plavocad.de/admin/#/b/' + x.nr);
  block('Lieferung heute fällig oder überfällig', d.lieferungen.filter(x => x.liefertermin <= h), x => pcTagText(x.liefertermin) + ' · ' + x.nr + ' · ' + wer(x) + (x.objekt ? ' · ' + x.objekt : ''));
  block('Geliefert, Rechnung fehlt', d.ohneRechnung, x => x.nr + ' · ' + wer(x) + ' · ' + pcEur(x.preis));
  block('Wiedervorlagen', d.wiedervorlagen, x => wer(x) + (x.ort ? ', ' + x.ort : '') + ' · ' + PHASE_NAME[x.phase] + (x.tel ? ' · ' + x.tel : '') + ' · https://plavocad.de/admin/#/k/' + x.id);
  block('Rechnungen überfällig', d.rechnungen.filter(x => x.faellig && x.faellig < h), x => x.nr + ' · ' + wer(x) + ' · ' + pcEur(x.summe) + ' · fällig seit ' + pcTagText(x.faellig));
  block('Angebote ohne Antwort seit über 7 Tagen', d.angebote, x => x.nr + ' · ' + wer(x) + ' · ' + pcEur(x.summe));
  if (!teile.length) return false;
  const text = 'Guten Morgen,\n\nheute steht an:\n\n' + teile.join('\n\n') + '\n\nAlles im Admin: https://plavocad.de/admin/\n\n(Diese Mail kommt nur an Tagen, an denen etwas ansteht. Abschalten: Admin → Einstellungen → Firma.)';
  const res = await resend(env, { from: env.MAIL_FROM, to: [env.MAIL_TO], subject: 'PlavoCAD heute: ' + teile.length + (teile.length === 1 ? ' Punkt' : ' Punkte'), text });
  if (!res.ok) console.error('Morgen-Mail', res.status, await res.text());
  return res.ok;
}

async function buero(request, env, db, teile, m) {
  const t = () => new Date().toISOString();

  if (teile[0] === 'heute' && m === 'GET') return json(Object.assign({ ok: true }, await heuteDaten(db)));
  if (teile[0] === 'heute' && teile[1] === 'mail' && m === 'POST') return json({ ok: true, gesendet: await morgenMail(env) });

  if (teile[0] === 'firma') {
    if (m === 'GET') return json({ ok: true, firma: await firma(db), standard: FIRMA_STANDARD });
    if (m === 'PUT') {
      const F = firmaPruefen(await request.json());
      await db.prepare('INSERT INTO einstellungen (k, v, geaendert) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, geaendert = excluded.geaendert').bind('firma', JSON.stringify(F), t()).run();
      return json({ ok: true, firma: F });
    }
  }

  /* ----- Kontakte (Kunden und Akquise) ----- */
  if (teile[0] === 'kontakte') {
    if (teile.length === 1 && m === 'GET') {
      const r = await db.prepare(`SELECT k.id, k.phase, k.firma, k.name, k.mail, k.tel, k.strasse, k.plz, k.ort, k.web, k.quelle, k.wiedervorlage, k.erstellt, k.geaendert,
        (SELECT COUNT(*) FROM bestellungen b WHERE b.kontakt_id = k.id) AS n_best,
        (SELECT COALESCE(SUM(r.summe), 0) FROM belege r WHERE r.kontakt_id = k.id AND r.art IN ('rechnung', 'storno') AND r.festgeschrieben <> '') AS umsatz
        FROM kontakte k ORDER BY k.geaendert DESC LIMIT 3000`).all();
      return json({ ok: true, liste: r.results || [] });
    }
    if (teile.length === 1 && m === 'POST') {
      const a = await request.json(), o = kontaktFelder(a);
      if (!o.firma && !o.name) return json({ ok: false, error: 'Bitte Firma oder Name eintragen.' }, 400);
      if (o.mail) { const d = await db.prepare('SELECT id FROM kontakte WHERE mail = ?').bind(o.mail).first(); if (d) return json({ ok: false, error: 'Diese E-Mail-Adresse gibt es schon.', id: d.id }, 409); }
      const z = t(), vl = [{ t: z, was: 'Angelegt' + (o.quelle ? ' (' + o.quelle + ')' : '') }];
      const r = await db.prepare(`INSERT INTO kontakte (phase, firma, name, mail, tel, strasse, plz, ort, web, quelle, wiedervorlage, notiz, verlauf, erstellt, geaendert)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(o.phase, o.firma, o.name, o.mail, o.tel, o.strasse, o.plz, o.ort, o.web, o.quelle, o.wiedervorlage, o.notiz, JSON.stringify(vl), z, z).first();
      return json({ ok: true, id: r.id });
    }
    if (teile[1] === 'import' && m === 'POST') {
      const a = await request.json(), liste = Array.isArray(a.liste) ? a.liste.slice(0, 1000) : [];
      const da = new Set(((await db.prepare("SELECT mail FROM kontakte WHERE mail <> ''").all()).results || []).map(x => x.mail));
      let neu = 0, doppelt = 0, leer = 0; const z = t(), stmts = [];
      for (const x of liste) {
        const o = kontaktFelder(Object.assign({}, x, { phase: 'neu', quelle: x.quelle || 'Import' }));
        if (!o.firma && !o.name) { leer++; continue; }
        if (o.mail && da.has(o.mail)) { doppelt++; continue; }
        if (o.mail) da.add(o.mail);
        stmts.push(db.prepare(`INSERT INTO kontakte (phase, firma, name, mail, tel, strasse, plz, ort, web, quelle, wiedervorlage, notiz, verlauf, erstellt, geaendert)
          VALUES ('neu', ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`).bind(o.firma, o.name, o.mail, o.tel, o.strasse, o.plz, o.ort, o.web, o.quelle, o.notiz, JSON.stringify([{ t: z, was: 'Importiert' }]), z, z));
        neu++;
      }
      for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
      return json({ ok: true, neu, doppelt, leer });
    }
    const id = +teile[1];
    const row = id ? await db.prepare('SELECT * FROM kontakte WHERE id = ?').bind(id).first() : null;
    if (!row) return json({ ok: false, error: 'Kontakt nicht gefunden.' }, 404);
    if (teile.length === 2 && m === 'GET') {
      const best = await db.prepare('SELECT nr, art, status, erstellt, objekt, typ, preis, liefertermin FROM bestellungen WHERE kontakt_id = ? ORDER BY erstellt DESC').bind(id).all();
      const bel = await db.prepare('SELECT id, art, nr, status, datum, summe, objekt, festgeschrieben, faellig FROM belege WHERE kontakt_id = ? ORDER BY id DESC').bind(id).all();
      return json({ ok: true, k: Object.assign({}, row, { verlauf: lese(row.verlauf, []) }), bestellungen: best.results || [], belege: bel.results || [] });
    }
    if (teile.length === 2 && m === 'PATCH') {
      const a = await request.json(), o = kontaktFelder(a, row), vl = lese(row.verlauf, []), z = t();
      if (o.mail && o.mail !== row.mail) { const d = await db.prepare('SELECT id FROM kontakte WHERE mail = ? AND id <> ?').bind(o.mail, id).first(); if (d) return json({ ok: false, error: 'Diese E-Mail-Adresse gehört schon zu einem anderen Kontakt.', id: d.id }, 409); }
      if (o.phase !== row.phase) vl.push({ t: z, was: 'Phase: ' + PHASE_NAME[row.phase] + ' → ' + PHASE_NAME[o.phase] });
      if (o.wiedervorlage !== row.wiedervorlage && o.wiedervorlage) vl.push({ t: z, was: 'Wiedervorlage: ' + pcTagText(o.wiedervorlage) });
      if (a.vermerk) vl.push({ t: z, was: String(a.vermerk).trim().slice(0, 2000) });
      await db.prepare(`UPDATE kontakte SET phase = ?, firma = ?, name = ?, mail = ?, tel = ?, strasse = ?, plz = ?, ort = ?, web = ?, quelle = ?, wiedervorlage = ?, notiz = ?, verlauf = ?, geaendert = ? WHERE id = ?`)
        .bind(o.phase, o.firma, o.name, o.mail, o.tel, o.strasse, o.plz, o.ort, o.web, o.quelle, o.wiedervorlage, o.notiz, JSON.stringify(vl), z, id).run();
      return json({ ok: true });
    }
    if (teile.length === 2 && m === 'DELETE') {
      const n = await db.prepare('SELECT COUNT(*) AS n FROM belege WHERE kontakt_id = ?').bind(id).first();
      if (n && n.n > 0) return json({ ok: false, error: 'Zu diesem Kontakt gibt es Angebote oder Rechnungen. Rechnungen müssen aufbewahrt werden, der Kontakt bleibt deshalb bestehen.' }, 409);
      await db.batch([db.prepare('UPDATE bestellungen SET kontakt_id = NULL WHERE kontakt_id = ?').bind(id), db.prepare('DELETE FROM kontakte WHERE id = ?').bind(id)]);
      return json({ ok: true });
    }
  }

  /* ----- Belege (Angebote, Rechnungen, Stornorechnungen) ----- */
  if (teile[0] === 'belege') {
    if (teile.length === 1 && m === 'GET') {
      const r = await db.prepare('SELECT id, art, nr, status, kontakt_id, bestell_nr, datum, faellig, gueltig, objekt, kaeufer, summe, festgeschrieben, versendet, bezahlt_am, bezahlt_betrag, bezug, erstellt FROM belege ORDER BY id DESC LIMIT 2000').all();
      return json({ ok: true, liste: (r.results || []).map(x => Object.assign(x, { kaeufer: lese(x.kaeufer, {}) })) });
    }
    if (teile.length === 1 && m === 'POST') {
      const a = await request.json(), F = await firma(db), art = a.art === 'angebot' ? 'angebot' : 'rechnung', z = t();
      const pos = positionenPruefen(a.positionen), datum = istDatum(a.datum) ? a.datum : heuteIso();
      const b = { art, status: 'entwurf', kontakt_id: +a.kontakt_id || null, bestell_nr: String(a.bestell_nr || '').slice(0, 40), datum, leistung: String(a.leistung || '').slice(0, 120),
        gueltig: art === 'angebot' ? plusTage(datum, F.angebotTage) : '', objekt: String(a.objekt || '').trim().slice(0, 200), kaeufer: kaeuferPruefen(a.kaeufer), positionen: pos, summe: summeVon(pos),
        text_ein: String(a.text_ein !== undefined ? a.text_ein : art === 'angebot' ? F.angebotEin : F.rechnungEin).slice(0, 3000),
        text_aus: String(a.text_aus !== undefined ? a.text_aus : art === 'angebot' ? F.angebotAus : F.rechnungAus).slice(0, 3000) };
      const vl = [{ t: z, was: 'Angelegt' + (b.bestell_nr ? ' aus ' + b.bestell_nr : '') + (a.von_angebot ? ' aus Angebot ' + String(a.von_angebot).slice(0, 30) : '') }];
      const r = await db.prepare(`INSERT INTO belege (art, status, kontakt_id, bestell_nr, datum, leistung, gueltig, objekt, kaeufer, positionen, summe, text_ein, text_aus, verlauf, erstellt, geaendert)
        VALUES (?, 'entwurf', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(art, b.kontakt_id, b.bestell_nr, b.datum, b.leistung, b.gueltig, b.objekt, JSON.stringify(b.kaeufer), JSON.stringify(pos), b.summe, b.text_ein, b.text_aus, JSON.stringify(vl), z, z).first();
      if (art === 'angebot') await nummerVergeben(db, r.id, 'AN', +datum.slice(0, 4)); // Angebotsnummern müssen nicht lückenlos sein
      await kontaktVermerk(db, b.kontakt_id, (art === 'angebot' ? 'Angebot' : 'Rechnungsentwurf') + ' angelegt');
      return json({ ok: true, beleg: await belegLaden(db, r.id) });
    }
    const b = await belegLaden(db, teile[1]);
    if (!b) return json({ ok: false, error: 'Beleg nicht gefunden.' }, 404);
    const fest = !!b.festgeschrieben;

    if (teile.length === 2 && m === 'GET') {
      const k = b.kontakt_id ? await db.prepare('SELECT id, firma, name, mail, phase FROM kontakte WHERE id = ?').bind(b.kontakt_id).first() : null;
      const bezug = b.bezug ? await db.prepare('SELECT id, nr, art FROM belege WHERE id = ?').bind(b.bezug).first() : null;
      const storno = await db.prepare("SELECT id, nr FROM belege WHERE bezug = ? AND art = 'storno'").bind(b.id).first();
      return json({ ok: true, beleg: b, kontakt: k, bezugBeleg: bezug, storno, firma: b.verkaeufer || await firma(db) });
    }
    if (teile.length === 2 && m === 'PATCH') {
      const a = await request.json();
      if (fest) {
        if (a.zahlungZurueck && b.art === 'rechnung' && b.status === 'bezahlt') {
          b.status = 'offen'; belegVermerk(b, 'Zahlung zurückgenommen (' + pcEur(b.bezahlt_betrag) + ')'); b.bezahlt_am = ''; b.bezahlt_betrag = 0;
          await belegSpeichern(db, b); return json({ ok: true, beleg: b });
        }
        if (a.vermerk) { belegVermerk(b, String(a.vermerk).slice(0, 2000)); await belegSpeichern(db, b); return json({ ok: true, beleg: b }); }
        return json({ ok: false, error: 'Festgeschriebene Rechnungen lassen sich nicht mehr ändern. Korrektur nur über eine Stornorechnung.' }, 409);
      }
      if (a.status !== undefined && b.art === 'angebot') {
        if (!['entwurf', 'versendet', 'angenommen', 'abgelehnt'].includes(a.status)) return json({ ok: false, error: 'Unbekannter Status.' }, 400);
        if (a.status !== b.status) {
          belegVermerk(b, 'Status: ' + b.status + ' → ' + a.status);
          if (a.status === 'angenommen') {
            await bestellVermerk(db, b.bestell_nr, 'Angebot ' + b.nr + ' angenommen', 'bestaetigt');
            await kontaktVermerk(db, b.kontakt_id, 'Angebot ' + b.nr + ' angenommen');
            if (b.kontakt_id) await db.prepare("UPDATE kontakte SET phase = 'kunde' WHERE id = ?").bind(b.kontakt_id).run();
          }
          b.status = a.status;
        }
      }
      if (b.art === 'angebot' && b.status === 'angenommen' && (a.positionen || a.kaeufer)) return json({ ok: false, error: 'Ein angenommenes Angebot bleibt, wie es war. Lege bei Bedarf ein neues an.' }, 409);
      if (a.kontakt_id !== undefined) b.kontakt_id = +a.kontakt_id || null;
      if (a.kaeufer !== undefined) b.kaeufer = kaeuferPruefen(a.kaeufer);
      if (a.positionen !== undefined) { b.positionen = positionenPruefen(a.positionen); b.summe = summeVon(b.positionen); }
      if (a.objekt !== undefined) b.objekt = String(a.objekt).trim().slice(0, 200);
      if (a.datum !== undefined && istDatum(a.datum)) b.datum = a.datum;
      if (a.gueltig !== undefined && istDatum(a.gueltig)) b.gueltig = a.gueltig;
      if (a.leistung !== undefined) b.leistung = String(a.leistung).trim().slice(0, 120);
      if (a.text_ein !== undefined) b.text_ein = String(a.text_ein).slice(0, 3000);
      if (a.text_aus !== undefined) b.text_aus = String(a.text_aus).slice(0, 3000);
      if (a.vermerk) belegVermerk(b, String(a.vermerk).slice(0, 2000));
      await belegSpeichern(db, b);
      return json({ ok: true, beleg: b });
    }
    if (teile.length === 2 && m === 'DELETE') {
      if (fest) return json({ ok: false, error: 'Festgeschriebene Rechnungen werden aufbewahrt und können nicht gelöscht werden.' }, 409);
      await db.prepare('DELETE FROM belege WHERE id = ?').bind(b.id).run();
      await kontaktVermerk(db, b.kontakt_id, (b.art === 'angebot' ? 'Angebot ' + b.nr : 'Rechnungsentwurf') + ' gelöscht');
      return json({ ok: true });
    }
    if (teile[2] === 'festschreiben' && m === 'POST') {
      if (b.art !== 'rechnung') return json({ ok: false, error: 'Nur Rechnungen werden festgeschrieben.' }, 400);
      if (!fest) {
        const F = await firma(db), fehlt = pflichtangaben(b, F);
        if (fehlt.length) return json({ ok: false, error: 'Es fehlen Pflichtangaben: ' + fehlt.join(', ') + '.', fehlt }, 400);
        const z = t(), vk = { name: F.name, inhaber: F.inhaber, strasse: F.strasse, plz: F.plz, ort: F.ort, tel: F.tel, mail: F.mail, web: F.web, steuernr: F.steuernr, ustid: F.ustid,
          bank: F.bank, iban: F.iban, bic: F.bic, kleinunternehmer: F.kleinunternehmer };
        const r = await db.prepare("UPDATE belege SET festgeschrieben = ?, status = 'offen', verkaeufer = ?, faellig = ?, geaendert = ? WHERE id = ? AND festgeschrieben = ''")
          .bind(z, JSON.stringify(vk), plusTage(b.datum, F.zahlungsziel), z, b.id).run();
        if (!r.meta || r.meta.changes !== 1) return json({ ok: false, error: 'Die Rechnung wurde gerade schon festgeschrieben.' }, 409);
      }
      let nr = b.nr;
      if (!nr) nr = await nummerVergeben(db, b.id, 'RE', +b.datum.slice(0, 4));
      const neu = await belegLaden(db, b.id);
      if (!fest) { belegVermerk(neu, 'Festgeschrieben als ' + nr); await belegSpeichern(db, neu); await kontaktVermerk(db, neu.kontakt_id, 'Rechnung ' + nr + ' über ' + pcEur(neu.summe)); }
      return json({ ok: true, beleg: neu });
    }
    if (teile[2] === 'storno' && m === 'POST') {
      if (b.art !== 'rechnung' || !fest || !b.nr) return json({ ok: false, error: 'Stornieren geht nur bei festgeschriebenen Rechnungen.' }, 400);
      if (b.status === 'storniert') return json({ ok: false, error: 'Diese Rechnung ist schon storniert.' }, 409);
      const z = t(), d = heuteIso(), pos = b.positionen.map(p => Object.assign({}, p, { preis: -p.preis }));
      const r = await db.prepare(`INSERT INTO belege (art, status, kontakt_id, bestell_nr, datum, leistung, objekt, kaeufer, positionen, summe, text_ein, text_aus, verkaeufer, festgeschrieben, bezug, verlauf, erstellt, geaendert)
        VALUES ('storno', 'storno', ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(b.kontakt_id, b.bestell_nr, d, b.leistung, b.objekt, JSON.stringify(b.kaeufer), JSON.stringify(pos), summeVon(pos),
          'Hiermit storniere ich die Rechnung ' + b.nr + ' vom ' + pcTagText(b.datum) + b.datum.slice(0, 4) + ' vollständig.', JSON.stringify(b.verkaeufer || {}), z, b.id,
          JSON.stringify([{ t: z, was: 'Stornorechnung zu ' + b.nr }]), z, z).first();
      const snr = await nummerVergeben(db, r.id, 'RE', +d.slice(0, 4));
      b.status = 'storniert'; belegVermerk(b, 'Storniert durch ' + snr); await belegSpeichern(db, b);
      await kontaktVermerk(db, b.kontakt_id, 'Rechnung ' + b.nr + ' storniert durch ' + snr);
      await bestellVermerk(db, b.bestell_nr, 'Rechnung ' + b.nr + ' storniert durch ' + snr);
      return json({ ok: true, beleg: await belegLaden(db, r.id) });
    }
    if (teile[2] === 'zahlung' && m === 'POST') {
      if (b.art !== 'rechnung' || !fest || b.status !== 'offen') return json({ ok: false, error: 'Zahlungen gehen nur bei offenen, festgeschriebenen Rechnungen.' }, 400);
      const a = await request.json(), betrag = isFinite(+a.betrag) && +a.betrag > 0 ? rund(+a.betrag) : b.summe, datum = istDatum(a.datum) ? a.datum : heuteIso();
      b.bezahlt_betrag = rund((b.bezahlt_betrag || 0) + betrag); b.bezahlt_am = datum;
      belegVermerk(b, 'Zahlung ' + pcEur(betrag) + ' am ' + pcTagText(datum) + datum.slice(0, 4));
      if (b.bezahlt_betrag >= b.summe - 0.005) {
        b.status = 'bezahlt';
        await bestellVermerk(db, b.bestell_nr, 'Rechnung ' + b.nr + ' bezahlt', 'bezahlt');
      }
      await belegSpeichern(db, b);
      await kontaktVermerk(db, b.kontakt_id, 'Zahlung ' + pcEur(betrag) + ' zu ' + b.nr);
      return json({ ok: true, beleg: b });
    }
    if (teile[2] === 'senden' && m === 'POST') {
      if ((b.art === 'rechnung' || b.art === 'storno') && (!fest || !b.nr)) return json({ ok: false, error: 'Bitte die Rechnung zuerst festschreiben.' }, 400);
      const f = await request.formData();
      const an = String(f.get('an') || '').trim().toLowerCase(), betreff = String(f.get('betreff') || '').trim().slice(0, 200), text = String(f.get('text') || '').trim().slice(0, 20000);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(an)) return json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eintragen.' }, 400);
      if (!betreff || !text) return json({ ok: false, error: 'Betreff und Text dürfen nicht leer sein.' }, 400);
      const pdf = f.get('pdf');
      if (!pdf || typeof pdf !== 'object' || !pdf.size) return json({ ok: false, error: 'Das PDF fehlt.' }, 400);
      if (pdf.size > 5 * 1024 * 1024) return json({ ok: false, error: 'Das PDF ist größer als 5 MB.' }, 413);
      const kopf = new Uint8Array(await pdf.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...kopf) !== '%PDF-') return json({ ok: false, error: 'Die Datei ist kein PDF.' }, 400);
      const name = { angebot: 'Angebot', rechnung: 'Rechnung', storno: 'Stornorechnung' }[b.art] + '_' + b.nr + '_PlavoCAD.pdf';
      const res = await resend(env, { from: env.MAIL_FROM, to: [an], bcc: [env.MAIL_TO], reply_to: env.MAIL_TO, subject: betreff, text, attachments: [{ filename: name, content: b64(await pdf.arrayBuffer()) }] });
      if (!res.ok) { console.error('Resend', res.status, await res.text()); return json({ ok: false, error: 'Resend hat die E-Mail nicht angenommen (Status ' + res.status + ').' }, 502); }
      b.versendet = t(); belegVermerk(b, 'Gesendet an ' + an + ': „' + betreff + '“');
      if (b.art === 'angebot' && b.status === 'entwurf') { b.status = 'versendet'; belegVermerk(b, 'Status: entwurf → versendet'); }
      await belegSpeichern(db, b);
      await kontaktVermerk(db, b.kontakt_id, { angebot: 'Angebot', rechnung: 'Rechnung', storno: 'Stornorechnung' }[b.art] + ' ' + b.nr + ' gesendet');
      await bestellVermerk(db, b.bestell_nr, { angebot: 'Angebot', rechnung: 'Rechnung', storno: 'Stornorechnung' }[b.art] + ' ' + b.nr + ' gesendet');
      return json({ ok: true, beleg: b });
    }
  }
  return json({ ok: false, error: 'Unbekannter Aufruf.' }, 404);
}

/* ---------------- Hilfen ---------------- */
function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function lese(s, ersatz) { try { const v = JSON.parse(s); return v === null || v === undefined ? ersatz : v; } catch (e) { return ersatz; } }
function zufall(n) { const z = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', u = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of u) s += z[x % z.length]; return s; }
function safeName(n) { return String(n || 'plan').replace(/[^\w.\-äöüÄÖÜß ]+/g, '_').slice(0, 120); }
function b64(buf) { // in Stücken, damit große Dateien den Speicher nicht sprengen
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function bytes64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function text64(s) { return new TextDecoder().decode(bytes64(s)); }
