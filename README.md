# ODAS App Müll Kalender

Müll-Kalender-App für den Open Data App-Store (ODAP)

Die App zeigt Termine für die Müllabfuhr an.

Die App ist eine "ODAP App V1".

## Funktionen

- Anzeige der Abfuhrtermine in einem Kalender
- Straßen-/Gebietsauswahl per Dropdown
- Konvertieren zu ganztägigen Terminen
- Vollbildansicht
- Farbliche Kennzeichnung der Müllarten
- Datenfrische-Indikator (CKAN metadata_modified)

## Für wen ist diese App?

Dieser Abfallkalender zeigt die Entsorgungstermine für Ihre Straße. Er richtet sich an alle Bürger:innen, die ihre Müllabfuhr-Termine im Blick behalten möchten.

## Entwicklung

Das Frontend setzt auf Vanilla JS, Bootstrap 5.3 und die Kalender-Bibliothek calendar.js.

### Aufbau der App

#### Desktop Version

![Alt-Text](/assets/Desktop_Screenshot.png)

#### Mobile Version

![Alt-Text](/assets/Mobile_Screenshot.png)

### Lokale Entwicklung mit VS Code Live Server

Die App kann mit VS Code Live Server aus der Projektwurzel gestartet werden. Öffne dann `http://127.0.0.1:<live-server-port>/app/`; Live Server nutzt standardmäßig Port `5500`.

### Start der App

    $ make build up
    $ curl http://localhost:8081

## Autor

(C) 2025, Ondics GmbH
