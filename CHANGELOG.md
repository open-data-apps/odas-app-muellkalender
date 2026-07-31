# Changelog

## 1.6.0 - 2026-07-31
- CHG: fehlendes Pflicht-Asset assets/branding.css ergaenzt und brandingCSSFile lokal aktiviert

## 1.5.0 - 2026-07-31
- FIX: escapeHtml() von der DOM- auf die Regex-Variante umgestellt (F-08); die alte Fassung maskierte " und ' nicht
- CHG: toter Konfigurationsschlüssel lizenz entfernt (F-17)
- CHG: brandingCSS und brandingCSSFile als Base-Abhängigkeiten deklariert und lokal gespiegelt (F-17)
- CHG: format.typ von "String" auf v1-sicheres "string" korrigiert (F-18)
- CHG: dropdown-Default auf Feldebene verschoben statt in format (F-18)
- CHG: Platzhalter-Entwickler mueller-gmbh durch ondics-gmbh ersetzt (F-21)
- CHG: Platzhalter Mueller GmbH aus der Fußzeile entfernt (F-21)
- CHG: daten.schema auf assets/schema.json gesetzt (F-20)

## 1.4.0 - 2026-07-30

- **FIX:** Laufzeitfehler nach dem Laden der Konfiguration werden jetzt sichtbar gemeldet; `handleRouting()` wird `await`et und besitzt einen Fehlerpfad. Bisher blieb die Seite bei einem Fehler im Seitenaufbau stumm leer
- **FIX:** `getConfigUrl()` schneidet bei einer URL ohne abschliessenden Schraegstrich nicht mehr das letzte Verzeichnis ab; die Konfiguration wird auch unter `.../app` gefunden
- **FIX:** Klick auf einen Hash-Link, der bereits die aktive Seite bezeichnet, rendert die Seite neu (`setupSamePageLinks()`) - das Logo fuehrt damit aus Unteransichten zurueck zur Startseite
- **ENH:** `app/app-base.js` ist wieder byte-identisch zum Template `oda-generic` 1.4.0; app-spezifisches Aufraeumen laeuft ueber den neuen Hook `onPageLeave(page)` in `app/app.js`

## 1.3.0 - 2026-07-24

- **FIX:** Laufzeit-Fehlermeldung wird vor der Anzeige HTML-maskiert (`escapeHtmlForBase`); ein Fehlertext kann kein Markup mehr in die Seite einschleusen (XSS)
- **FIX:** Startseiten-Renderer wird nun `await`et; bei asynchronen Apps erscheint kein kurzzeitiges `[object Promise]` in `#main-content`

## 1.2.0 - 2026-07-23

- **ENH:** Datenabruf auf den Schalter `proxyAktiv` umgestellt; direkte Abrufe sind der Standard, der ODAS-Proxy wird nur noch bei `ja` verwendet
- **ENH:** Einfachen Standalone-Betrieb hinter Traefik mit derselben `odas-config/config.json` wie in der Entwicklung ergänzt
- **ENH:** Traefik-Anbindung auf das externe Netzwerk `proxynet`, den EntryPoint `websecure` und den Zertifikatsresolver `letsencrypt` festgelegt
- **FIX:** Proxy-Basispfad funktioniert jetzt auch bei URLs mit `index.html`; der Ziel-Pfad wird URL-kodiert
- **FIX:** Konfiguration wird an Kalender-Dropdown und ICS-Abruf durchgereicht
- **DOC:** Start über `STANDALONE=true make up` dokumentiert

## v1.1.0 — 2026-07-03

- ENH: escapeHtml(), Methodik-Box (TODO 2), Weitere-Infos-Box (TODO 4) und Datenfrische-Indikator (TODO 3, CKAN metadata_modified) hinzugefügt (Schale 4, Prefix `mk-`)
- FIX: `app-icon`-Pfad von `app/app-icon.png` nach `assets/odas-app-icon.svg` korrigiert
- ENH: Für-wen-Abschnitt in `beschreibung` ergänzt

## 25.11.2024

- ENH: Vollbildansicht des Kalendars
- ENH: Mobile Ansicht

## 28.11.2024

- ENH: .ics Import

## 29.11.2024

- ENH: .ics Import über Url der Api
- ENH: Mobile und Desktop Ansicht angepasst an Dropdownmenü
- ENH: Neuer Menüpunkt "Über diese App" mit Import aus config.json
- ENH: Mobile und Desktop Ansicht angepasst auf Hauptcontent Seitenbreite

## 05.12.2024

- ENH: CSS mit Bootstrap Grid System überarbeitet
- ENH: Events werden automatisch farblich gekennzeichnet
- ENH: Buttons entfernt für die Übersichtlichkeit
- ENH: Button hinzugefügt zum Konvertieren der doppelten Tage
- ENH: Neues Favicon

## 19.02.2025

- ENH: Neue App Struktur übernommen
