# PlavoCAD – Einrichtung von Datenbank und Admin-Bereich

Diese Datei bleibt privat (sie wird nicht mit ausgeliefert). Einmal durchgehen, danach läuft alles von selbst.
Ohne diese Einrichtung funktioniert die Website trotzdem: Bestellungen kommen per E-Mail, nur der Admin-Bereich und das Speichern sind dann aus.

## 1. Aufräumen im Repository (einmalig)

Diese alten Dateien im Repository `tomokvc/plavocad.de` löschen (GitHub: Datei öffnen → Mülleimer-Symbol, oder den ganzen Ordner neu hochladen):

```
.github/workflows/static.yml   (alter GitHub-Pages-Workflow, stört Cloudflare)
info.php                       (zeigt Serverdaten öffentlich an)
makler.html  planer.html  modell-3d.html  tomo.jpg
css/: gate.css, makler.css, plankopf.css, referenzen.css, site.css, ueber.css
img/: dwg-w1.jpg, expose-w1.en.svg, expose-w1.hr.svg, plan.jpg, vorlage.jpg, ref/b2-cad.jpg, ref/b2-schnitt.jpg
js/:  alle Dateien außer basis.js, bestellen.js, preise.js, verwaltung.js
      (also u. a. landing.js, seite.js, site.js, gate*, makler*, planer*, plankopf*, referenzen*, ueber*, 404*, modell-3d.js)
```

Die Weiterleitungen fangen alte Links auf (`/makler` → `/bestellen` usw.), es geht also nichts verloren.

## 2. Datenbank anlegen (ca. 3 Minuten)

1. Cloudflare-Dashboard → **Storage & Databases → D1 SQL Database → Create**.
2. Name: `plavocad`. Standort: **European Union** wählen (wichtig für die Datenschutzerklärung).
3. Nach dem Anlegen die **Database ID** kopieren (lange Zeichenkette mit Bindestrichen).
4. In der Datei `wrangler.jsonc` im Repository den Block sichtbar machen und die ID eintragen:

```jsonc
  "d1_databases": [
    { "binding": "DB", "database_name": "plavocad", "database_id": "HIER-DIE-ID" }
  ],
```

Die Tabellen legt der Worker beim ersten Aufruf selbst an. Der nächtliche Lauf (3:17 Uhr) löscht automatisch: Anfragen ohne Auftrag nach 6 Monaten, Abgeschlossenes nach 12 Monaten.

## 3. Anmeldung für den Admin-Bereich (ca. 5 Minuten)

Der Admin-Bereich liegt unter **plavocad.de/admin** und wird durch Cloudflare Access geschützt (Einmal-Code an deine E-Mail-Adresse, kostenlos für eine Person).

1. Cloudflare-Dashboard → **Zero Trust**. Beim ersten Mal einen Team-Namen wählen, z. B. `plavocad` → deine Adresse ist dann `plavocad.cloudflareaccess.com`.
2. **Access → Applications → Add an application → Self-hosted.**
   - Application name: `PlavoCAD Admin`
   - Public hostname: `plavocad.de`, Path: `admin` (deckt /admin und /admin/… ab)
   - Session Duration: z. B. 1 Woche
3. **Policy** anlegen: Action **Allow**, Include → **Emails** → `kontakt@plavocad.de`. Sonst niemand.
4. Login-Methode: One-time PIN reicht (ist Standard).
5. Nach dem Speichern in der Anwendung die **Application Audience (AUD) Tag** kopieren.
6. Im Worker die Variablen setzen: **Workers & Pages → plavocad-de → Settings → Variables and Secrets**:
   - `ACCESS_TEAM` = dein Team-Name (z. B. `plavocad`)
   - `ACCESS_AUD` = der kopierte AUD-Wert
   - `ADMIN_MAIL` = `kontakt@plavocad.de`
   - `RESEND_API_KEY` bleibt wie er ist.

Der Worker prüft die Anmeldung zusätzlich selbst (Signatur, Anwendung, Adresse). Ein falsch konfiguriertes Access sperrt also niemanden aus Versehen ein.

## 4. Prüfen

1. plavocad.de öffnen: Startseite, Bestellen, Hausverwaltungen.
2. Testbestellung mit eigener E-Mail-Adresse: zwei Mails (Bestellung + Eingangsbestätigung).
3. plavocad.de/admin öffnen: erst Code-Anmeldung, dann die Testbestellung in der Liste.
4. In der Bestellung „Bestätigen“: Liefertermin prüfen, senden → Auftragsbestätigung kommt per Mail.
5. Unter **Einstellungen** im Admin einen Preis ändern → Startseite neu laden → neuer Preis sichtbar.

## 5. Büro im Admin (seit November 2026)

Das frühere Büro-Tool ist jetzt Teil von plavocad.de/admin: Heute, Kunden, Akquise, Belege (Angebote und Rechnungen).

1. **Firmendaten:** Admin → Einstellungen → Firma und Belege. Steuernummer eintragen, sobald das Finanzamt sie geschickt hat (ohne sie lässt sich keine Rechnung festschreiben), dazu IBAN und Bank.
2. **Makler-Liste:** Admin → Akquise → Liste importieren. Aus Excel „CSV UTF-8“ speichern, aus Numbers „Exportieren → CSV“, oder die Tabelle direkt in das Feld kopieren.
3. **Morgen-Mail:** kommt gegen 7 Uhr an kontakt@plavocad.de, nur wenn etwas ansteht. Abschalten unter Einstellungen → Firma und Belege. Der zweite Zeitplan („0 6 * * *“) steht bereits in wrangler.jsonc.
4. **Altes Büro-Tool abschalten:** Cloudflare → Workers & Pages → Projekt des Büro-Tools (z. B. „plavocad-buero“) → Settings → Delete project. Falls dafür eine eigene Access-Anwendung existiert, unter Zero Trust → Access → Applications ebenfalls löschen. Darin lagen nur Testdaten.

So läuft ein Auftrag jetzt durch:
- Bestellung kommt → Kunde wird automatisch angelegt oder zugeordnet (über die E-Mail-Adresse).
- „Auftrag bestätigen“ → „Lieferung senden“ → „Rechnung erstellen“ (Positionen und Preis kommen aus der Bestellung) → Anschrift ergänzen → „Festschreiben“ (lückenlose Nummer RE-Jahr-001 …) → „Per E-Mail senden“ (PDF wird im Browser erzeugt, Blindkopie an dich).
- Zahlung eingegangen → „Zahlung erfassen“ → Rechnung und Bestellung sind „Bezahlt“.
- Fehler in einer festgeschriebenen Rechnung → „Stornieren“ (eigene Stornorechnung), danach eine neue Rechnung.
- Anfrage einer Hausverwaltung → „Angebot erstellen“ → senden → bei Zusage „Angenommen“ → nach Lieferung „In Rechnung übernehmen“.

Aufbewahrung: Festgeschriebene Rechnungen werden nie automatisch gelöscht. Speichere trotzdem jedes PDF zusätzlich in deiner Ablage (z. B. iCloud-Ordner „PlavoCAD/Rechnungen/2026“), 8 Jahre lang.

## 6. Wo was liegt

- Bestellungen/Anfragen: D1-Datenbank `plavocad`, Tabelle `bestellungen` (ohne Dateianhänge; Pläne kommen nur per Mail).
- Kunden und Akquise: Tabelle `kontakte`. Angebote, Rechnungen, Stornorechnungen: Tabelle `belege`, Nummernkreise in `nummern`.
- Preise, Startaktion, Lieferzeit, Pause, Firmendaten: Tabelle `einstellungen`; die Website liest Preise über `/api/einstellungen`.
- Löschfristen (nachts automatisch): Anfragen ohne Auftrag nach 6 Monaten, abgeschlossene Bestellungen nach 12 Monaten, Akquise-Kontakte mit „Kein Interesse“ nach 6 Monaten. Rechnungen nie.
