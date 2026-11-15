/**
 * PlavoCAD – Worker für plavocad.de (Cloudflare Workers mit statischen Dateien)
 *
 *   POST /api/bestellung        Bestellung oder Bestandsanfrage: rechnet den Preis nach, speichert die Angaben (ohne Dateien)
 *                               und schickt zwei E-Mails über Resend: an Tomo (mit den Plänen im Anhang) und die Eingangsbestätigung.
 *   GET  /api/einstellungen     Preise, Startaktion und Lieferzeit für die Website.
 *   /admin, /api/admin/*        Admin-Bereich. Nur mit gültiger Anmeldung über Cloudflare Access.
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
  // Täglicher Lauf (Cron): Löschfristen anwenden
  async scheduled(event, env, ctx) { ctx.waitUntil(aufraeumen(env)); }
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
      env.DB.prepare('CREATE TABLE IF NOT EXISTS einstellungen (k TEXT PRIMARY KEY, v TEXT NOT NULL, geaendert TEXT NOT NULL)')
    ]);
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
  return ((a.meta && a.meta.changes) || 0) + ((b.meta && b.meta.changes) || 0);
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
    art = 'anfrage'; typ = TYPNAME.bestand; positionen = pcZeilen(r.L, r.total, 'Richtpreis'); preis = r.total;
    termin = 'Pilot bis ' + r.pilot + ', ' + r.plan; terminIso = r.iso;
  } else if (formular === 'bestellung') {
    eingabe = { typ: v('typ'), menge: v('menge'), maisonette: an('maisonette'), ebenen: v('ebenen'), keller: an('keller'), dach: an('dach'),
      fl: an('fl'), mb: an('mb'), d3: an('d3'), ds: an('ds'), ex: an('ex'), sk: an('sk'), aktion: an('aktion') };
    const r = pcBestellung(eingabe, C, jetzt);
    aktion = r.aktion; art = r.total === 0 ? 'gratis' : 'bestellung'; typ = TYPNAME[r.typ];
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
let certs = null, certsZeit = 0;
async function zugang(request, env) {
  const team = String(env.ACCESS_TEAM || '').trim().replace(/^https?:\/\//, '').replace(/\.cloudflareaccess\.com.*$/, ''), aud = String(env.ACCESS_AUD || '').trim();
  if (!team || !aud) return { ok: false, status: 503, text: 'Der Admin-Bereich ist noch nicht eingerichtet (ACCESS_TEAM und ACCESS_AUD fehlen).' };
  let tok = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!tok) { const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') || ''); if (m) tok = m[1]; }
  if (!tok) return { ok: false, status: 401, text: 'Nicht angemeldet. Bitte über Cloudflare Access anmelden.' };
  try {
    const teile = tok.split('.'); if (teile.length !== 3) throw new Error('Form');
    const kopf = JSON.parse(text64(teile[0])), inhalt = JSON.parse(text64(teile[1]));
    if (kopf.alg !== 'RS256') throw new Error('Verfahren');
    const iss = 'https://' + team + '.cloudflareaccess.com';
    if (!certs || Date.now() - certsZeit > 3600000 || !certs.some(k => k.kid === kopf.kid)) {
      const r = await fetch(iss + '/cdn-cgi/access/certs'); if (!r.ok) throw new Error('Schlüssel nicht abrufbar');
      certs = (await r.json()).keys || []; certsZeit = Date.now();
    }
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

    if (teile.length === 2 && m === 'GET') return json({ ok: true, b: voll() });

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
