/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configData - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let calendarData = {};
let calendarAssetsPromise = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function appAssetUrl(relativePath) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  let pathname = url.pathname;
  if (!pathname.endsWith("/")) {
    pathname = pathname.substring(0, pathname.lastIndexOf("/") + 1);
  }
  if (pathname.endsWith("/app/")) {
    pathname = pathname.slice(0, -4);
  }

  return url.origin + pathname + relativePath.replace(/^\/+/, "");
}

function loadStyleOnce(id, href) {
  if (document.getElementById(id)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    link.onerror = () => reject(new Error("Stylesheet konnte nicht geladen werden: " + href));
    document.head.appendChild(link);
  });
}

function loadScriptOnce(id, src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();

  const existing = document.getElementById(id);
  if (existing) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Script konnte nicht geladen werden: " + src)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Script konnte nicht geladen werden: " + src));
    document.head.appendChild(script);
  });
}

function ensureCalendarAssets() {
  if (calendarAssetsPromise) return calendarAssetsPromise;

  calendarAssetsPromise = Promise.all([
    loadStyleOnce("mk-calendar-css", appAssetUrl("dist/calendar.js.min.css")),
    loadScriptOnce(
      "mk-ical-js",
      "https://cdnjs.cloudflare.com/ajax/libs/ical.js/1.4.0/ical.min.js",
      "ICAL",
    ),
    loadScriptOnce(
      "mk-calendar-translations-de",
      appAssetUrl("dist/translations/calendar.translations.de.js"),
      "__TRANSLATION_OPTIONS",
    ),
  ]).then(() =>
    loadScriptOnce("mk-calendar-js", appAssetUrl("dist/calendar.min.js"), "calendarJs"),
  );

  return calendarAssetsPromise;
}

function app(configData, enclosingHtmlDivElement) {
  enclosingHtmlDivElement.innerHTML = `<div class="row">
      <div class="col-6" id="calendarOptions">
      </div>
      <div class="col-6" id="convertEvents">
      </div>
    </div>
    <div id="mk-datenfrische"></div>
    <div id="calendar">
    </div>
    <div id="mk-schale4"></div>`;

  var mkSchale4 = document.getElementById("mk-schale4");
  if (mkSchale4) {
    mkSchale4.innerHTML = methodikBox(configData) + renderWeitereInfos(configData);
  }

  loadAvailableCalendars(configData);
  createConvertToAllDayButton();
}

// Hilfsfunktion: Nur Pfad aus vollständiger URL extrahieren
function isOdasProxyEnabled(configdata = {}) {
  return String(configdata.proxyAktiv || "").trim().toLowerCase() === "ja";
}

function extractPathFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search;
  } catch (_error) {
    return String(url || "");
  }
}

function getOdasAppBasePath(pathname) {
  let appPath =
    pathname === undefined
      ? typeof window !== "undefined"
        ? window.location.pathname
        : "/"
      : String(pathname || "/");

  if (!appPath.endsWith("/")) {
    const lastSlashIndex = appPath.lastIndexOf("/");
    const lastSegment = appPath.substring(lastSlashIndex + 1);
    if (lastSegment.includes(".")) {
      appPath = appPath.substring(0, lastSlashIndex + 1);
    }
  }

  return appPath.replace(/\/+$/, "");
}

function getOdasProxyEndpoint(targetUrl, pathname) {
  const appPath = getOdasAppBasePath(pathname);
  return `${appPath}/odp-data?path=${encodeURIComponent(
    extractPathFromUrl(targetUrl),
  )}`;
}

async function fetchViaOdasProxy(targetUrl) {
  const response = await fetch(getOdasProxyEndpoint(targetUrl), {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`ODAS-Proxy-Fehler: HTTP ${response.status}`);
  }

  const proxyData = await response.json();
  if (!proxyData || typeof proxyData.content !== "string") {
    throw new Error("ODAS-Proxy-Antwort enthält keinen content-String.");
  }

  return proxyData.content;
}

async function fetchOdasResource(targetUrl, configdata = {}) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchViaOdasProxy(targetUrl);
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    throw new Error(
      `Direkter Datenabruf fehlgeschlagen (${error.message}). Bitte prüfen Sie die Daten-URL und die CORS-Freigabe der Datenquelle.`,
    );
  }
}

async function fetchOdasJson(targetUrl, configdata = {}) {
  return JSON.parse(await fetchOdasResource(targetUrl, configdata));
}

// Lade Kalender von der API über Proxy
function loadAvailableCalendars(configData) {
  // Daten laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasJson(configData.apiurl, configData)
    .then((data) => {
      mkDatenfrische = extractDatenStandMk(data);
      updateMkFrische(mkDatenfrische);
      if (data.success && data.result.resources) {
        const resources = data.result.resources;
        calendarData = resources.filter((resource) =>
          resource.format.toLowerCase().includes("ics")
        );

        if (calendarData.length > 0) {
          createCalendarDropdown(calendarData, configData);
          loadCalendar(calendarData[0].url, configData);
        } else {
          console.error("Keine Kalender im passenden Format gefunden.");
        }
      } else {
        console.error("Fehlerhafte API-Antwort:", data);
      }
    })
    .catch((err) => console.error("Fehler beim Laden der Kalenderdaten:", err));
}

// Dropdown-Menü erstellen
function createCalendarDropdown(resources, configData = {}) {
  const mainContent = document.getElementById("calendarOptions");
  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "mb-3";

  const dropdown = document.createElement("select");
  dropdown.className = "form-select";
  dropdown.setAttribute("aria-label", "Kalenderauswahl");

  resources.forEach((resource, index) => {
    const option = document.createElement("option");
    option.value = resource.url;
    option.textContent = resource.name || `Kalender ${index + 1}`;
    dropdown.appendChild(option);
  });

  dropdown.addEventListener("change", (event) => {
    loadCalendar(event.target.value, configData); // Lade den ausgewählten Kalender
  });

  dropdownContainer.appendChild(dropdown);
  mainContent.prepend(dropdownContainer);
}

// Kalender laden und anzeigen (ICS über Proxy laden)
function loadCalendar(calendarUrl, configData = {}) {
  if (!calendarUrl) {
    console.error("Keine URL für den Kalender angegeben.");
    return;
  }
  // ICS laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasResource(calendarUrl, configData)
    .then(async (icsData) => {
      await ensureCalendarAssets();

      const events = parseIcsToEvents(icsData);
      const calendarElement = document.getElementById("calendar");

      const calendarInstance = new calendarJs(
        "calendar",
        window.__TRANSLATION_OPTIONS || {},
        {
          manualEditingEnabled: false,
          id: "calendar-container",
          dataSource: events,
          language: "de",
          enableNotifications: true,
          exportICS: true,
        }
      );
      calendarInstance.setEvents(events);
      calendarElement.__calendarInstance = calendarInstance;
    })
    .catch((err) => console.error("Fehler beim Laden der Kalenderdaten:", err));
}

// Termine aus ICS-Daten extrahieren
function parseIcsToEvents(icsData) {
  const events = [];
  try {
    const jcalData = ICAL.parse(icsData);
    const component = new ICAL.Component(jcalData);
    const vevents = component.getAllSubcomponents("vevent");

    vevents.forEach((vevent) => {
      const event = new ICAL.Event(vevent);

      // Dynamische Farbzuteilung basierend auf dem Titel
      const title = event.summary || "Kein Titel";
      let color = "gray"; // Standardfarbe
      switch (title.toLowerCase()) {
        case "biotonne":
          color = "green";
          break;
        case "papiertonne":
          color = "blue";
          break;
        case "restmüll":
          color = "black";
          break;
        case "restmüll 2-wöchentlich":
          color = "black";
          break;
        case "restmüll 4-wöchentlich":
          color = "black";
          break;
        case "gelbe/r sack/tonne":
          color = "#ffd966";
          break;
        case "gelber sack":
          color = "#ffd966";
          break;
        default:
          color = "gray"; // Standardfarbe für unbekannte Ereignisse
      }

      // Ereignis hinzufügen
      events.push({
        from: new Date(event.startDate.toJSDate()),
        to: new Date(event.endDate.toJSDate()),
        title: title,
        description: event.description || "Keine Beschreibung verfügbar",
        color: color, // Farbe setzen
      });
    });
  } catch (error) {
    console.error("Fehler beim Parsen der ICS-Daten:", error);
  }
  return events;
}

// Kovertierungs Button
function createConvertToAllDayButton() {
  const mainContent = document.getElementById("convertEvents");

  const button = document.createElement("button");
  button.className = "btn btn-dark mb-3";
  button.textContent = "In ganztägige Termine umwandeln";

  button.addEventListener("click", () => {
    convertToAllDayEvents();
  });

  mainContent.prepend(button);
}

// Konvertierung zu Ganztägigen Ereignissen Funktion
function convertToAllDayEvents() {
  if (!calendarData || calendarData.length === 0) {
    alert("Es sind keine Termine vorhanden, die umgewandelt werden können.");
    return;
  }

  const calendarElement = document.getElementById("calendar");
  const calendarInstance = calendarElement.__calendarInstance; // Hol dir die Kalenderinstanz

  if (!calendarInstance) {
    console.error("Keine gültige Kalenderinstanz gefunden.");
    return;
  }

  const events = calendarInstance.getEvents();

  const updatedEvents = events
    .map((event) => {
      // Prüfe auf 'from' und 'to' und setze Standardwerte falls erforderlich
      const startDate = event.from
        ? event.from.toISOString().split("T")[0]
        : null;
      const endDate = event.to ? event.to.toISOString().split("T")[0] : null;

      if (!startDate || !endDate) {
        console.warn("Ungültiges Event ohne 'from' oder 'to' gefunden:", event);
        return { ...event }; // Event unverändert lassen, falls Daten fehlen
      }

      return {
        ...event,
        startDate: startDate, // Nur das Datum behalten
        endDate: endDate, // Nur das Datum behalten
        isAllDay: true,
      };
    })
    .filter((event) => event); // Entferne ungültige Events (falls vorhanden)

  calendarInstance.setEvents(updatedEvents);
  alert("Alle Termine wurden erfolgreich in ganztägige Termine umgewandelt.");
}

var mkDatenfrische = null;

function methodikBox(configdata) {
  var hinweis = String(configdata.datenquelleHinweis || "").trim();
  var stand = String(configdata.datenStand || "").trim();
  if (!hinweis && !stand) return "";
  var standZeile = stand
    ? '<p class="text-muted small mb-2">' + escapeHtml(stand) + "</p>"
    : "";
  return (
    '<section class="mk-methodik mt-4">' +
    '<button class="mk-methodik-toggle collapsed" type="button" ' +
    'data-bs-toggle="collapse" data-bs-target="#mk-methodik-body" ' +
    'aria-expanded="false" aria-controls="mk-methodik-body">' +
    '<h2 class="h5 mb-0">Methodik &amp; Datenquelle</h2>' +
    '<span class="mk-methodik-chevron" aria-hidden="true">&#9662;</span>' +
    "</button>" +
    '<div id="mk-methodik-body" class="collapse">' +
    '<div class="mk-methodik-content">' +
    standZeile +
    hinweis +
    "</div></div></section>"
  );
}

function renderWeitereInfos(configdata) {
  var links = (configdata.weiterfuehrendeLinks || "").trim();
  if (!links) return "";
  return (
    '<section class="mk-weitere-infos mt-4">' +
    '<h2 class="h5 mb-3">Weitere Informationen</h2>' +
    '<div class="mk-weitere-infos-content">' +
    links +
    "</div></section>"
  );
}

function extractDatenStandMk(apiResponse) {
  var raw =
    apiResponse?.result?.metadata_modified ||
    apiResponse?.result?.last_modified ||
    null;
  if (!raw) return null;
  var d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE");
}

function updateMkFrische(stand) {
  var el = document.getElementById("mk-datenfrische");
  if (el) {
    el.innerHTML = stand
      ? '<div class="text-muted small text-end mb-2">Aktualisiert: ' +
        escapeHtml(stand) +
        "</div>"
      : "";
  }
}

/* 
 * Diese Funktion kann Bibliotheken und benötigte Skripte laden. 
 * Sie hängt den zurückgegebenen HTML Code in die Head Section an. 
 
 * @returns {string} - HTML mit script, link, etc. Tags
 */
function addToHead() {
  ensureCalendarAssets().catch((err) =>
    console.error("Kalender-Bibliotheken konnten nicht vorgeladen werden:", err),
  );

  return ``;
}
