/* PlavoCAD Admin – Belege und Briefe im Planblatt-Stil.
   PCB.html(): Ansicht im Browser (auch zum Drucken). PCB.pdf() und PCB.briefe(): PDF im Browser erzeugen (jsPDF, lädt erst bei Bedarf).
   Aufbau nach DIN 5008 Form B, damit Briefe und Rechnungen in Fensterumschläge (DL, C5/6) passen. */
(() => {
  'use strict';
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => pcEur(+n || 0);
  const num = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const dat = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (iso || ''); };
  const TITEL = { angebot: 'Angebot', rechnung: 'Rechnung', storno: 'Stornorechnung' };
  const KU = 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.';
  // Ablageort der Admin-Dateien (auf plavocad.de /admin/, in der Vorschau relativ)
  const BASIS = (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/beleg\.js(\?.*)?$/, '') : '/admin/');

  /* Gemeinsame Inhalte für Ansicht und PDF */
  function inhalt(b, F, extra = {}) {
    const k = b.kaeufer || {}, art = b.art, nr = b.nr || '';
    const fill = s => String(s || '').replace(/\{GUELTIG\}/g, dat(b.gueltig)).replace(/\{FAELLIG\}/g, dat(b.faellig) || '[wird beim Festschreiben berechnet]').replace(/\{NR\}/g, nr || '[Nummer]');
    const info = [
      [art === 'angebot' ? 'Angebotsnr.' : 'Rechnungsnr.', nr || (art === 'rechnung' ? 'beim Festschreiben' : '–')],
      [art === 'angebot' ? 'Datum' : 'Rechnungsdatum', dat(b.datum)],
      art === 'storno' && extra.bezugNr ? ['Storniert Rechnung', extra.bezugNr] : null,
      art !== 'angebot' && b.leistung ? ['Leistungsdatum', b.leistung] : null,
      art === 'angebot' && b.gueltig ? ['Gültig bis', dat(b.gueltig)] : null,
      art === 'rechnung' && b.faellig ? ['Zahlbar bis', dat(b.faellig)] : null,
      b.bestell_nr ? ['Ihre Bestellung', b.bestell_nr] : null,
      F.steuernr ? ['Steuernummer', F.steuernr] : null,
      F.ustid ? ['USt-IdNr.', F.ustid] : null
    ].filter(Boolean);
    const anschrift = [k.firma, k.name && k.name !== k.firma ? k.name : '', k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean);
    const absender = [F.name, F.inhaber, F.strasse, [F.plz, F.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const anrede = k.name ? 'Guten Tag ' + k.name + ',' : 'Sehr geehrte Damen und Herren,';
    const summeText = art === 'angebot' ? 'Angebotssumme' : art === 'storno' ? 'Gutschrift' : 'Rechnungsbetrag';
    const fuss = [
      [F.name, F.inhaber, F.strasse, [F.plz, F.ort].filter(Boolean).join(' ')].filter(Boolean),
      [F.tel, F.mail, F.web].filter(Boolean),
      F.iban ? ['Bankverbindung', F.bank, 'IBAN ' + F.iban, F.bic ? 'BIC ' + F.bic : ''].filter(Boolean) : (F.kleinunternehmer ? ['Kleinunternehmer', 'nach § 19 UStG'] : [])
    ];
    return { titel: TITEL[art], nr, info, anschrift, absender, anrede, ein: fill(b.text_ein), aus: fill(b.text_aus), summeText, fuss,
      ku: F.kleinunternehmer !== false, objekt: b.objekt || k.firma || k.name || '–', stand: dat(b.datum) };
  }

  /* ---------- Ansicht im Browser ---------- */
  let cssDa = false;
  function css() {
    if (cssDa) return; cssDa = true;
    const s = document.createElement('style');
    s.textContent = `
.pcdoc { --i:#141a22; --i2:#39424e; --pb:#5a6370; --ln:#d3d7cf; --bl:#2458e8; --rt:#b3321c;
  width:210mm; min-height:297mm; background:#fff; color:var(--i); position:relative; padding:0; font:9.4pt/1.45 "IBM Plex Sans",system-ui,sans-serif;
  box-shadow:0 1px 0 #141a22, 0 0 0 1px #141a22; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.pcdoc * { box-sizing:border-box; }
.pcdoc .m { font-family:"IBM Plex Mono",ui-monospace,monospace; }
.pcdoc .lb { font:6.4pt "IBM Plex Mono",monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--pb); }
.pcdoc .logo { position:absolute; right:16mm; top:12mm; width:72mm; }
.pcdoc .falz { position:absolute; left:4mm; width:4mm; border-top:.3pt solid var(--pb); }
.pcdoc .abs { position:absolute; left:25mm; top:46mm; width:85mm; font:6.2pt "IBM Plex Mono",monospace; color:var(--pb); border-bottom:.4pt solid var(--i); padding-bottom:.8mm; white-space:nowrap; overflow:hidden; }
.pcdoc .an { position:absolute; left:25mm; top:51mm; width:85mm; line-height:1.4; }
.pcdoc .info { position:absolute; left:125mm; top:46mm; width:69mm; border:.6pt solid var(--i); }
.pcdoc .info div { display:flex; justify-content:space-between; gap:3mm; padding:1.1mm 2.4mm; border-top:.3pt solid var(--ln); }
.pcdoc .info div:first-child { border-top:0; }
.pcdoc .info b { font:500 8.2pt "IBM Plex Mono",monospace; text-align:right; }
.pcdoc .rumpf { padding:100mm 16mm 48mm 25mm; }
.pcdoc h1 { font:700 20pt/1 "Barlow Condensed","Arial Narrow",sans-serif; text-transform:uppercase; margin:0 0 2mm; }
.pcdoc h1 span { font:500 10.5pt "IBM Plex Mono",monospace; color:var(--pb); margin-left:2mm; vertical-align:.2em; }
.pcdoc .obj { margin:0 0 4mm; font-weight:600; } .pcdoc .obj .lb { margin-right:3mm; font-weight:400; }
.pcdoc p { margin:0 0 4mm; white-space:pre-line; }
.pcdoc table { width:100%; border-collapse:collapse; }
.pcdoc .pos th { text-align:left; font:6.4pt "IBM Plex Mono",monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--pb); font-weight:400; border-bottom:.8pt solid var(--i); padding:1.4mm 1.4mm; }
.pcdoc .pos td { padding:1.8mm 1.4mm; border-bottom:.3pt solid var(--ln); vertical-align:top; }
.pcdoc .pos .n { text-align:right; white-space:nowrap; font:8.6pt "IBM Plex Mono",monospace; }
.pcdoc .pos .nr { font:8pt "IBM Plex Mono",monospace; color:var(--pb); width:8mm; }
.pcdoc .pos .t { white-space:pre-line; }
.pcdoc .sum { margin:3mm 0 0 auto; width:80mm; }
.pcdoc .sum td { padding:2mm 1.4mm 0; border-top:1.4pt solid var(--bl); font-weight:600; }
.pcdoc .sum td.n { text-align:right; font:500 12pt "IBM Plex Mono",monospace; color:var(--bl); }
.pcdoc .ku { font-size:8.4pt; color:var(--i2); margin-top:2.5mm; }
.pcdoc .fuss { position:absolute; left:25mm; right:16mm; bottom:14mm; }
.pcdoc .fi { display:grid; grid-template-columns:repeat(3,1fr); gap:0; font-size:6.6pt; line-height:1.5; color:var(--i2); border-top:.4pt solid var(--ln); padding-top:1.6mm; margin-bottom:3mm; }
.pcdoc .pk { width:100%; display:grid; grid-template-columns:1.7fr 1.2fr 1fr .8fr .6fr; border:.9pt solid var(--i); }
.pcdoc .pk div { padding:1.2mm 1.8mm; border-left:.45pt solid var(--i); min-width:0; }
.pcdoc .pk div:first-child { border-left:0; }
.pcdoc .pk b { display:block; font:500 7.2pt "IBM Plex Mono",monospace; overflow-wrap:anywhere; }
.pcdoc .pk .bl b { color:var(--bl); }
.pcdoc .stempel { position:absolute; left:25mm; top:16mm; border:1.1pt solid var(--rt); color:var(--rt); padding:1mm 3mm; font:500 9.5pt "IBM Plex Mono",monospace; letter-spacing:.14em; }
.pcdoc-rahmen { overflow:hidden; }
@media print {
  body * { visibility:hidden !important; }
  .pcdoc, .pcdoc * { visibility:visible !important; }
  .pcdoc { position:absolute; left:0; top:0; box-shadow:none; transform:none !important; }
  @page { size:A4; margin:0; }
}`;
    document.head.appendChild(s);
  }
  function html(b, F, extra = {}) {
    css();
    const I = inhalt(b, F, extra), pos = b.positionen || [];
    const stempel = extra.stempel || (b.art === 'rechnung' && !b.festgeschrieben ? 'ENTWURF' : '');
    return '<div class="pcdoc">' +
      (stempel ? '<div class="stempel">' + esc(stempel) + '</div>' : '') +
      '<img class="logo" src="' + BASIS + 'logo-beleg.png" alt="PlavoCAD">' +
      '<span class="falz" style="top:105mm"></span><span class="falz" style="top:148.5mm;width:6mm"></span><span class="falz" style="top:210mm"></span>' +
      '<div class="abs">' + esc(I.absender) + '</div>' +
      '<div class="an">' + I.anschrift.map(esc).join('<br>') + '</div>' +
      '<div class="info">' + I.info.map(r => '<div><span class="lb">' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' +
      '<div class="rumpf">' +
        '<h1>' + I.titel + (I.nr ? '<span>' + esc(I.nr) + '</span>' : '') + '</h1>' +
        (b.objekt ? '<p class="obj"><span class="lb">Objekt</span>' + esc(b.objekt) + '</p>' : '') +
        '<p>' + esc(I.anrede) + '\n\n' + esc(I.ein) + '</p>' +
        '<table class="pos"><thead><tr><th>Pos.</th><th>Leistung</th><th class="n">Menge</th><th>Einheit</th><th class="n">Einzelpreis</th><th class="n">Gesamt</th></tr></thead><tbody>' +
          pos.map((p, i) => '<tr><td class="nr">' + String(i + 1).padStart(2, '0') + '</td><td class="t">' + esc(p.text) + '</td><td class="n">' + num(p.menge) + '</td><td>' + esc(p.einheit) + '</td><td class="n">' + eur(p.preis) + '</td><td class="n">' + eur(p.menge * p.preis) + '</td></tr>').join('') +
        '</tbody></table>' +
        '<table class="sum"><tr><td>' + I.summeText + '</td><td class="n">' + eur(b.summe) + '</td></tr></table>' +
        (I.ku ? '<p class="ku">' + KU + '</p>' : '') +
        (I.aus ? '<p>' + esc(I.aus) + '</p>' : '') +
        '<p>Mit freundlichen Grüßen\n' + esc(F.inhaber || F.name) + '</p>' +
      '</div>' +
      '<div class="fuss"><div class="fi">' + I.fuss.filter(x => x.length).map(x => '<div>' + x.map((z, j) => j === 0 ? '<b>' + esc(z) + '</b>' : esc(z)).join('<br>') + '</div>').join('') + '</div>' +
        '<div class="pk"><div><span class="lb">Objekt</span><b>' + esc(I.objekt) + '</b></div><div><span class="lb">Inhalt</span><b>' + I.titel + '</b></div>' +
        '<div><span class="lb">Nr.</span><b>' + esc(I.nr || 'Entwurf') + '</b></div><div><span class="lb">Stand</span><b>' + esc(I.stand) + '</b></div><div class="bl"><span class="lb">Blatt</span><b>01</b></div></div></div>' +
    '</div>';
  }

  /* ---------- PDF ---------- */
  let laden = null;
  function pdfLaden() {
    if (window.jspdf && window.PC_PDF_FONTS) return Promise.resolve();
    if (!laden) laden = new Promise((ok, nein) => {
      const s = document.createElement('script'); s.src = BASIS + 'pdf.js'; s.onload = () => ok(); s.onerror = () => { laden = null; nein(new Error('Das PDF-Modul ließ sich nicht laden.')); };
      document.head.appendChild(s);
    });
    return laden;
  }
  const MM = { links: 25, rechts: 16, breite: 210 - 25 - 16, unten: 297 - 52 };
  const FARBE = { i: [20, 26, 34], i2: [57, 66, 78], pb: [90, 99, 112], ln: [211, 215, 207], bl: [36, 88, 232], rt: [179, 50, 28] };
  function neuesDoc() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const F = window.PC_PDF_FONTS;
    [['PlexSans', 'PlexSans', 'normal'], ['PlexSansSemi', 'PlexSans', 'bold'], ['PlexMono', 'PlexMono', 'normal'], ['PlexMonoMed', 'PlexMono', 'bold'], ['Barlow', 'Barlow', 'bold']].forEach(([f, fam, st]) => {
      doc.addFileToVFS(f + '.ttf', F[f]); doc.addFont(f + '.ttf', fam, st);
    });
    doc.setLineHeightFactor(1.35);
    return doc;
  }
  const farbe = (doc, c, was = 'text') => was === 'text' ? doc.setTextColor(...FARBE[c]) : was === 'draw' ? doc.setDrawColor(...FARBE[c]) : doc.setFillColor(...FARBE[c]);
  function schrift(doc, fam, st, pt, c = 'i') { doc.setFont(fam, st); doc.setFontSize(pt); farbe(doc, c); }
  function lab(doc, text, x, y, opt) { schrift(doc, 'PlexMono', 'normal', 6.2, 'pb'); doc.setCharSpace(0.25); doc.text(String(text).toUpperCase(), x, y, opt); doc.setCharSpace(0); }

  function stempelZeichnen(doc, t) { farbe(doc, 'rt', 'draw'); doc.setLineWidth(0.4); schrift(doc, 'PlexMono', 'bold', 9.5, 'rt'); doc.setCharSpace(1); const w = doc.getTextWidth(t) + (t.length - 1) * 1 + 6; /* Zeichenabstand zählt getTextWidth nicht mit */ doc.rect(25, 16, w, 7); doc.text(t, 28, 21); doc.setCharSpace(0); }
  // Kopf mit Logo, Falzmarken, Absenderzeile, Anschrift und Infokasten (DIN 5008 Form B)
  function kopf(doc, I, info, stempel) {
    if (window.PC_PDF_LOGO) doc.addImage(window.PC_PDF_LOGO, 'PNG', 210 - 16 - 72, 12, 72, 72 * 76 / 384);
    farbe(doc, 'pb', 'draw'); doc.setLineWidth(0.1);
    [[105, 4], [148.5, 6], [210, 4]].forEach(([y, w]) => doc.line(4, y, 4 + w, y));
    if (stempel) stempelZeichnen(doc, stempel);
    schrift(doc, 'PlexMono', 'normal', 6.2, 'pb');
    doc.text(doc.splitTextToSize(I.absender, 85)[0], 25, 49);
    farbe(doc, 'i', 'draw'); doc.setLineWidth(0.15); doc.line(25, 50.2, 110, 50.2);
    schrift(doc, 'PlexSans', 'normal', 10, 'i');
    doc.text(I.anschrift.length ? I.anschrift : [' '], 25, 56);
    if (info && info.length) {
      const x = 125, w = 69, h = 6.2;
      farbe(doc, 'i', 'draw'); doc.setLineWidth(0.25); doc.rect(x, 46, w, h * info.length);
      info.forEach((r, i) => {
        const y = 46 + i * h;
        if (i) { farbe(doc, 'ln', 'draw'); doc.setLineWidth(0.1); doc.line(x, y, x + w, y); }
        lab(doc, r[0], x + 2.4, y + 4.1);
        schrift(doc, 'PlexMono', 'bold', 8.2, 'i'); doc.text(String(r[1]), x + w - 2.4, y + 4.2, { align: 'right' });
      });
    }
  }
  // Fuß mit Firmenangaben und Plankopf (Objekt, Inhalt, Nr., Stand, Blatt)
  // Oben drei Spalten (Firma, Kontakt, Bank) auf festen Dritteln, darunter der Plankopf über die volle Breite
  function fuss(doc, I, blatt, gesamt) {
    const y0 = 297 - 41, spalten = I.fuss.filter(z => z.length), sw = 169 / 3;
    farbe(doc, 'ln', 'draw'); doc.setLineWidth(0.15); doc.line(25, y0, 194, y0);
    spalten.forEach((z, i) => {
      z.slice(0, 4).forEach((t, j) => { schrift(doc, 'PlexSans', j === 0 ? 'bold' : 'normal', 6.6, j === 0 ? 'i' : 'i2'); doc.text(String(t), 25 + i * sw, y0 + 3.6 + j * 3); });
    });
    const zellen = [['Objekt', I.objekt, 1.7], ['Inhalt', I.titel, 1.2], ['Nr.', I.nr || 'Entwurf', 1], ['Stand', I.stand, 0.8], ['Blatt', String(blatt).padStart(2, '0') + (gesamt > 1 ? ' / ' + String(gesamt).padStart(2, '0') : ''), 0.6]];
    const w = 169, x0 = 25, y = 297 - 25, h = 11, sum = zellen.reduce((s, z) => s + z[2], 0);
    farbe(doc, 'i', 'draw'); doc.setLineWidth(0.32); doc.rect(x0, y, w, h);
    let cx = x0;
    zellen.forEach((z, i) => {
      const cw = w * z[2] / sum;
      if (i) { doc.setLineWidth(0.16); doc.line(cx, y, cx, y + h); }
      lab(doc, z[0], cx + 1.8, y + 3.6);
      schrift(doc, 'PlexMono', 'bold', 7.2, i === 4 ? 'bl' : 'i');
      doc.text(doc.splitTextToSize(String(z[1]), cw - 3.6).slice(0, 2), cx + 1.8, y + 7.4);
      cx += cw;
    });
  }
  function absatz(doc, text, x, y, w, pt = 9.4, c = 'i') {
    schrift(doc, 'PlexSans', 'normal', pt, c);
    const zeilen = doc.splitTextToSize(String(text || ''), w);
    doc.text(zeilen, x, y);
    return y + zeilen.length * pt * 0.3528 * 1.35;
  }

  async function pdf(b, F, extra = {}) {
    await pdfLaden();
    const doc = neuesDoc(), I = inhalt(b, F, extra), pos = b.positionen || [];
    const stempel = b.art === 'rechnung' && !b.festgeschrieben ? 'ENTWURF' : '';
    const L = MM.links, R = 210 - MM.rechts, W = MM.breite;
    const sp = { nr: L, text: L + 9, menge: L + 108, einheit: L + 111, ep: L + 150, ges: R }; // Barlow nur für feste Titel (ohne Sonderzeichen)
    const seiten = [];
    const neueSeite = erste => {
      if (!erste) doc.addPage();
      seiten.push(doc.getNumberOfPages());
      if (erste) { kopf(doc, I, I.info, stempel); return 100; }
      if (stempel) stempelZeichnen(doc, stempel);
      if (window.PC_PDF_LOGO) doc.addImage(window.PC_PDF_LOGO, 'PNG', 210 - 16 - 54, 12, 54, 54 * 76 / 384);
      schrift(doc, 'PlexMono', 'normal', 8, 'pb'); doc.text(I.titel + ' ' + (I.nr || 'Entwurf') + ' · Fortsetzung', L, 30);
      return 40;
    };
    const tabKopf = y => {
      lab(doc, 'Pos.', sp.nr, y); lab(doc, 'Leistung', sp.text, y); lab(doc, 'Menge', sp.menge, y, { align: 'right' }); lab(doc, 'Einheit', sp.einheit, y);
      lab(doc, 'Einzelpreis', sp.ep, y, { align: 'right' }); lab(doc, 'Gesamt', sp.ges, y, { align: 'right' });
      farbe(doc, 'i', 'draw'); doc.setLineWidth(0.28); doc.line(L, y + 1.6, R, y + 1.6);
      return y + 6;
    };
    let y = neueSeite(true);
    schrift(doc, 'Barlow', 'bold', 20, 'i'); doc.text(I.titel.toUpperCase(), L, y + 4);
    if (I.nr) { const w = doc.getTextWidth(I.titel.toUpperCase()); schrift(doc, 'PlexMono', 'bold', 10.5, 'pb'); doc.text(I.nr, L + w + 3, y + 3.6); }
    y += 11;
    if (b.objekt) { lab(doc, 'Objekt', L, y); schrift(doc, 'PlexSans', 'bold', 9.4, 'i'); doc.text(doc.splitTextToSize(b.objekt, W - 16)[0], L + 14, y); y += 6; }
    y = absatz(doc, I.anrede, L, y, W) + 2;
    y = absatz(doc, I.ein, L, y, W) + 3;
    y = tabKopf(y);
    pos.forEach((p, i) => {
      schrift(doc, 'PlexSans', 'normal', 9, 'i');
      const zeilen = doc.splitTextToSize(String(p.text || ''), 96), h = Math.max(1, zeilen.length) * 9 * 0.3528 * 1.35 + 2.6;
      if (y + h > MM.unten) { y = tabKopf(neueSeite(false)); schrift(doc, 'PlexSans', 'normal', 9, 'i'); }
      schrift(doc, 'PlexMono', 'normal', 8, 'pb'); doc.text(String(i + 1).padStart(2, '0'), sp.nr, y + 1);
      schrift(doc, 'PlexSans', 'normal', 9, 'i'); doc.text(zeilen, sp.text, y + 1);
      schrift(doc, 'PlexMono', 'normal', 8.6, 'i');
      doc.text(num(p.menge), sp.menge, y + 1, { align: 'right' });
      schrift(doc, 'PlexSans', 'normal', 8.6, 'i2'); doc.text(String(p.einheit || ''), sp.einheit, y + 1);
      schrift(doc, 'PlexMono', 'normal', 8.6, 'i');
      doc.text(eur(p.preis), sp.ep, y + 1, { align: 'right' }); doc.text(eur(p.menge * p.preis), sp.ges, y + 1, { align: 'right' });
      y += h; farbe(doc, 'ln', 'draw'); doc.setLineWidth(0.1); doc.line(L, y - 1.6, R, y - 1.6);
    });
    const rest = 30 + (I.aus ? 16 : 0);
    if (y + rest > MM.unten) y = neueSeite(false);
    y += 3; farbe(doc, 'bl', 'draw'); doc.setLineWidth(0.5); doc.line(R - 80, y, R, y);
    schrift(doc, 'PlexSans', 'bold', 9.4, 'i'); doc.text(I.summeText, R - 80, y + 5.4);
    schrift(doc, 'PlexMono', 'bold', 12, 'bl'); doc.text(eur(b.summe), R, y + 5.6, { align: 'right' });
    y += 12;
    if (I.ku) y = absatz(doc, KU, L, y, W, 8.4, 'i2') + 2;
    if (I.aus) y = absatz(doc, I.aus, L, y + 1, W) + 2;
    absatz(doc, 'Mit freundlichen Grüßen\n' + (F.inhaber || F.name), L, y + 2, W);
    const n = doc.getNumberOfPages();
    for (let s = 1; s <= n; s++) { doc.setPage(s); fuss(doc, I, s, n); }
    doc.setProperties({ title: I.titel + ' ' + (I.nr || 'Entwurf'), author: F.inhaber || F.name, creator: 'PlavoCAD Admin' });
    return doc.output('blob');
  }

  // Briefe an Maklerbüros (Akquise): ein Brief je Seite, mit Hinweis nach Art. 14 DSGVO
  async function briefe(liste, F, text, C) {
    await pdfLaden();
    const doc = neuesDoc(), heute = new Date(), L = MM.links, W = MM.breite;
    const datum = heute.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const bis = C && C.aktion && C.aktion.bis ? dat(C.aktion.bis) : '';
    liste.forEach((k, i) => {
      if (i) doc.addPage();
      const I = { absender: [F.name, F.inhaber, F.strasse, [F.plz, F.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
        anschrift: [k.firma, k.name && k.name !== k.firma ? k.name : '', k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean) };
      kopf(doc, I, [['Datum', datum], ['Telefon', F.tel], ['E-Mail', F.mail]].filter(r => r[1]), '');
      let y = 100;
      schrift(doc, 'Barlow', 'bold', 18, 'i'); doc.text('GRUNDRISSE FÜR IHRE EXPOSÉS', L, y + 4); y += 12;
      let t = String(text || '').replace(/\{AKTION_BIS\}/g, bis).replace(/\{FIRMA\}/g, k.firma || '').replace(/\{ANREDE\}/g, k.name || '').replace(/Guten Tag ,/g, 'Guten Tag,').replace(/Guten Tag  /g, 'Guten Tag ');
      if (!k.name) t = t.replace(/^Guten Tag[^,\n]*,/, 'Sehr geehrte Damen und Herren,');
      y = absatz(doc, t, L, y, W) + 1;
      absatz(doc, F.inhaber || F.name, L, y + 1, W);
      const hinweis = 'Datenschutz: Ihre Geschäftsanschrift stammt aus öffentlich zugänglichen Quellen (z. B. Ihrer Website oder einem Immobilienportal). Ich nutze sie nur, um Ihnen dieses Angebot zu schicken (Art. 6 Abs. 1 lit. f DSGVO). Möchten Sie keine Post mehr von mir, genügt eine kurze Nachricht an ' + (F.mail || 'kontakt@plavocad.de') + ', dann lösche ich Ihre Daten. Mehr: plavocad.de/datenschutz';
      absatz(doc, hinweis, L, 297 - 46, W, 6.4, 'pb');
      fuss(doc, { fuss: [[F.name, F.inhaber, F.strasse, [F.plz, F.ort].filter(Boolean).join(' ')].filter(Boolean), [F.tel, F.mail, F.web].filter(Boolean), []],
        objekt: k.firma || k.name || '–', titel: 'Anschreiben', nr: 'Blatt ' + String(i + 1).padStart(3, '0'), stand: datum }, 1, 1);
    });
    doc.setProperties({ title: 'PlavoCAD Anschreiben', author: F.inhaber || F.name, creator: 'PlavoCAD Admin' });
    return doc.output('blob');
  }

  function laden_(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  window.PCB = { html, pdf, briefe, laden: laden_, pdfLaden, TITEL, dateiname: b => (TITEL[b.art] || 'Beleg') + '_' + (b.nr || 'Entwurf') + '_PlavoCAD.pdf' };
})();
