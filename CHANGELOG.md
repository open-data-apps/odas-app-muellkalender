# Changelog

## 1.18.0 - 2026-08-11
- FIX: Laufzeitzustand pro App-Instanz isoliert (F-42): Modul-Globale `mkUid`, `calendarData` und `mkDatenfrische` in ein pro `app()`-Aufruf geschlossenes `state`-Objekt (uid, root, config, calendarData, datenfrische) gezogen; Kalender-Container und Steuerelemente tragen instanzeindeutige IDs (`mk-calendar-<uid>`, `mk-calendarOptions-<uid>`, `mk-convertEvents-<uid>`), `new calendarJs("mk-calendar-<uid>", …)` zielt auf die eigene Instanz; `calendarElement.__calendarInstance` bleibt am Element

## 1.17.0 - 2026-08-11
- FIX: XSS- und URL-Vertrag geschlossen (F-35): Vendor-Patch `dist/calendar.js`/`dist/calendar.min.js` — Kalender-Titel werden per `textContent` statt `innerHTML` + `rc()` gesetzt; damit endet die Entity-Doppeldekodierung (ICAL + `rc()`) am Titel-Sink, aus `&lt;img …&gt;` im ICS-Titel wird wörtlicher Text statt ausführbares Markup

## 1.16.0 - 2026-08-07
- CHG: Bootstrap-Ziele der Methodik-Box instanzeindeutig gemacht (F-32): `data-bs-target`, `aria-controls` und die Collapse-Div-ID (`mk-methodik-body`) tragen ein instanzbezogenes Suffix (`-<uid>`), damit mehrere Instanzen derselben App auf einer Seite nicht kollidieren; die Instanzkennung wird beim `app()`-Einstieg zugewiesen und im Methodik-Helfer direkt verwendet (synchroner Renderpfad)

## 1.15.0 - 2026-08-06
- CHG: DOM-Zugriffe auf den App-Container gescopt (F-25): alle Elemente der App werden über den App-Container (root.querySelector) angesprochen statt über document; unpräfixierte IDs mit `mk-`-Präfix versehen (`calendarOptions` → `mk-calendarOptions`, `convertEvents` → `mk-convertEvents`, `calendar` → `mk-calendar`) und das ID-String-Argument des Kalender-Bibliotheksaufrufs (`calendarJs("mk-calendar", …)`) mitgezogen

## 1.14.0 - 2026-08-06
- FIX: Datenschutzangabe beschreibt den tatsaechlichen Stand nach dem Vendoring (Welle G)

## 1.13.0 - 2026-08-06
- FIX: Drittanbieterliste "Beim Aufruf kontaktierte Drittanbieter" entfernt — alle Programmbibliotheken liegen jetzt lokal in `app/vendor/`, beim Aufruf werden keine externen Bibliotheksserver mehr kontaktiert

## 1.12.0 - 2026-08-06
- FIX: ical.js vendored in `app/vendor/` statt von CDN geladen (Vendoring Teil 3) — Standalone-Betrieb laedt die Zusatzbibliotheken nicht mehr extern

## 1.11.0 - 2026-08-06
- FIX: Base auf Template oda-generic 1.6.0 vereinheitlicht (Hook renderPageOverride)

## 1.10.0 - 2026-08-04
- FIX: Datenschutzhinweis "Beim Aufruf kontaktierte Drittanbieter" an das Vendoring angepasst — jetzt lokal ausgelieferte Bibliotheken (Bootstrap/Leaflet/Chart.js) sind aus der Liste entfernt, weiterhin extern geladene Dienste (Kartenkacheln, Zusatzbibliotheken) bleiben genannt

## 1.9.0 - 2026-08-04
- FIX: Bootstrap vendored in `app/vendor/` statt von CDN geladen (F-07 Teil 2) — Standalone-Betrieb laedt diese Bibliotheken nicht mehr extern

## 1.8.0 - 2026-08-04
- FIX: Drittanbieter (CDN, Kartendienste) in `datenschutz`-Default und README dokumentiert (F-07 Teil 1)
- FIX: Bootstrap CSS/JS auf einheitlich 5.3.8 gezogen (vorher gemischt 5.3.0/5.3.1 bzw. 5.3.0/5.3.0) (F-31)
- FIX: Tonnenfarben-Zuordnung normalisiert (Kleinschreibung, Umlaute, Teilstring) statt exakter Bezeichnung; unbekannte Tonnenarten erhalten einen sichtbaren Hinweis statt stillschweigend Grau (Nebenbefund F-15)
- FIX: lokale `odas-config/config.json`: leeres Pflichtfeld `datenschutz` mit dem App-Paket-Default befuellt

## 1.7.0 - 2026-07-31
- FIX: Alle Fehlerpfade erreichen die Oberflaeche (F-15) - nicht erreichbare Quelle,
  fehlerhafte API-Antwort, fehlender Kalender und defekte ICS-Datei werden sichtbar
  gemeldet statt nur auf der Konsole
- FIX: CKAN-Ressourcen ohne format-Feld loesen keinen TypeError mehr aus
- ENH: Leerer Kalender wird als Hinweis vom Fehlerfall unterschieden

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
