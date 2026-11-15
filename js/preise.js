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
