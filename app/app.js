/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configData - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let mkInstanzZaehler = 0;
let calendarAssetsPromise = null;

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
      "vendor/icaljs/ical.min.js",
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
  // F-42: pro Instanz geschlossener State (Closure in app())
  const state = {
    uid: "i" + ++mkInstanzZaehler,
    root: enclosingHtmlDivElement,
    config: configData,
    disposed: false, // wird in Task 9 (onPageLeave) gesetzt
    calendarData: {},
    datenfrische: null,
  };
  enclosingHtmlDivElement.innerHTML = `<div class="row">
      <div class="col-6" id="mk-calendarOptions-${state.uid}">
      </div>
      <div class="col-6" id="mk-convertEvents-${state.uid}">
      </div>
    </div>
    <div id="mk-datenfrische"></div>
    <div id="mk-status"></div>
    <div id="mk-calendar-${state.uid}">
    </div>
    <div id="mk-schale4"></div>`;

  var mkSchale4 = enclosingHtmlDivElement.querySelector("#mk-schale4");
  if (mkSchale4) {
    mkSchale4.innerHTML = methodikBox(configData, state.uid) + renderWeitereInfos(configData);
  }

  loadAvailableCalendars(state, configData, enclosingHtmlDivElement);
  createConvertToAllDayButton(state, enclosingHtmlDivElement);
}

// ── SICHTBARE ZUSTÄNDE ───────────────────────────────────────────────────────
// Jeder Fehlerpfad muss die Oberfläche erreichen. Ein stumm leerer Kalender ist
// von "in diesem Zeitraum wird nicht geleert" nicht zu unterscheiden.

function setMkStatus(root, html) {
  const status = root && root.querySelector("#mk-status");
  if (status) status.innerHTML = html || "";
}

function showMkError(root, text) {
  setMkStatus(
    root,
    '<div class="alert alert-danger" role="alert">' + escapeHtml(text) + "</div>",
  );
}

function showMkInfo(root, text) {
  setMkStatus(
    root,
    '<div class="alert alert-info" role="alert">' + escapeHtml(text) + "</div>",
  );
}

function clearMkStatus(root) {
  setMkStatus(root, "");
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
  const rawContent = await fetchOdasResource(targetUrl, configdata);
  try {
    return JSON.parse(rawContent);
  } catch (_error) {
    throw new Error(
      `Die konfigurierte Daten-URL liefert kein JSON, sondern ${describeNonJsonPayload(rawContent)}. ` +
        "Bitte in der Instanzkonfiguration den API-Endpunkt der Datenquelle eintragen, " +
        "nicht den Datensatz- oder Download-Link.",
    );
  }
}

function describeNonJsonPayload(rawContent) {
  const text = String(rawContent == null ? "" : rawContent).trim();
  if (!text) return "eine leere Antwort";
  if (text.startsWith("<")) return "eine HTML-Seite";
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (/[,;]/.test(firstLine)) return "eine CSV- oder Textdatei";
  return "unlesbaren Inhalt";
}

// Lade Kalender von der API über Proxy
function loadAvailableCalendars(state, configData, root) {
  const quelle = String(configData.apiurl || "").trim();
  if (!quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle)) {
    showMkInfo(root, "Es ist keine Datenquelle konfiguriert.");
    return;
  }
  // Daten laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasJson(configData.apiurl, configData)
    .then((data) => {
      state.datenfrische = extractDatenStandMk(data);
      updateMkFrische(state.datenfrische, root);
      if (data.success && data.result && data.result.resources) {
        const resources = data.result.resources;
        // Ressourcen ohne format-Feld dürfen keinen TypeError auslösen.
        state.calendarData = resources.filter((resource) =>
          String((resource && resource.format) || "")
            .toLowerCase()
            .includes("ics")
        );

        if (state.calendarData.length > 0) {
          createCalendarDropdown(state, state.calendarData, configData, root);
          loadCalendar(state, state.calendarData[0].url, configData, root);
        } else {
          console.error("Keine Kalender im passenden Format gefunden.");
          showMkInfo(
            root,
            "Für diese Datenquelle ist derzeit kein Abfuhrkalender hinterlegt.",
          );
        }
      } else {
        console.error("Fehlerhafte API-Antwort:", data);
        showMkError(
          root,
          "Die Abfuhrtermine konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
        );
      }
    })
    .catch((err) => {
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      showMkError(
        root,
        "Die Abfuhrtermine konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
      );
    });
}

// Dropdown-Menü erstellen
function createCalendarDropdown(state, resources, configData = {}, root) {
  const mainContent = root.querySelector("#mk-calendarOptions-" + state.uid);
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
    loadCalendar(state, event.target.value, configData, root); // Lade den ausgewählten Kalender
  });

  dropdownContainer.appendChild(dropdown);
  mainContent.prepend(dropdownContainer);
}

// Kalender laden und anzeigen (ICS über Proxy laden)
function loadCalendar(state, calendarUrl, configData = {}, root) {
  if (!calendarUrl) {
    console.error("Keine URL für den Kalender angegeben.");
    showMkError(
      root,
      "Für den ausgewählten Kalender ist keine Datenquelle hinterlegt.",
    );
    return;
  }
  clearMkStatus(root);
  // ICS laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasResource(calendarUrl, configData)
    .then(async (icsData) => {
      await ensureCalendarAssets();

      const events = parseIcsToEvents(icsData);
      if (events === null) {
        showMkError(
          root,
          "Der Abfuhrkalender konnte nicht gelesen werden. Bitte versuchen Sie es später erneut.",
        );
        return;
      }
      if (events.length === 0) {
        showMkInfo(root, "Für diesen Kalender sind derzeit keine Termine hinterlegt.");
      }
      const calendarElement = root.querySelector("#mk-calendar-" + state.uid);

      const calendarInstance = new calendarJs(
        "mk-calendar-" + state.uid,
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
    .catch((err) => {
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      showMkError(
        root,
        "Die Abfuhrtermine konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
      );
    });
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

      // Dynamische Farbzuteilung basierend auf dem Titel.
      // Normalisiert (Kleinschreibung, Umlaute gefaltet) und per Teilstring
      // geprüft, damit abweichend benannte Tonnenarten (z.B. "Restmuell",
      // "Bio-Tonne") nicht unnötig auf Grau fallen.
      const title = event.summary || "Kein Titel";
      const normalizedTitle = title
        .toLowerCase()
        .replace(/ü/g, "ue")
        .replace(/ö/g, "oe")
        .replace(/ä/g, "ae")
        .replace(/ß/g, "ss");

      const TONNENFARBEN = [
        { pattern: /bio/, color: "green" },
        { pattern: /papier/, color: "blue" },
        { pattern: /rest/, color: "black" },
        { pattern: /gelb/, color: "#ffd966" },
      ];
      const treffer = TONNENFARBEN.find((eintrag) =>
        eintrag.pattern.test(normalizedTitle),
      );
      const color = treffer ? treffer.color : "gray";

      let description = event.description || "Keine Beschreibung verfügbar";
      if (!treffer) {
        description += " (Keine automatische Farbzuordnung für diese Tonnenart.)";
      }

      // Ereignis hinzufügen
      events.push({
        from: new Date(event.startDate.toJSDate()),
        to: new Date(event.endDate.toJSDate()),
        title: title,
        description: description,
        color: color, // Farbe setzen
      });
    });
  } catch (error) {
    console.error("Fehler beim Parsen der ICS-Daten:", error);
    // null = Parsen fehlgeschlagen; leeres Array = gelesen, aber ohne Termine.
    // Der Aufrufer unterscheidet daran Fehler- und Leerzustand.
    return null;
  }
  return events;
}

// Kovertierungs Button
function createConvertToAllDayButton(state, root) {
  const mainContent = root.querySelector("#mk-convertEvents-" + state.uid);

  const button = document.createElement("button");
  button.className = "btn btn-dark mb-3";
  button.textContent = "In ganztägige Termine umwandeln";

  button.addEventListener("click", () => {
    convertToAllDayEvents(state, root);
  });

  mainContent.prepend(button);
}

// Konvertierung zu Ganztägigen Ereignissen Funktion
function convertToAllDayEvents(state, root) {
  if (!state.calendarData || state.calendarData.length === 0) {
    alert("Es sind keine Termine vorhanden, die umgewandelt werden können.");
    return;
  }

  const calendarElement = root.querySelector("#mk-calendar-" + state.uid);
  const calendarInstance = calendarElement.__calendarInstance; // Hol dir die Kalenderinstanz

  if (!calendarInstance) {
    console.error("Keine gültige Kalenderinstanz gefunden.");
    showMkError(
      root,
      "Der Kalender ist noch nicht geladen. Bitte warten Sie einen Moment und versuchen Sie es erneut.",
    );
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

function methodikBox(configdata, uid) {
  var hinweis = String(configdata.datenquelleHinweis || "").trim();
  var stand = String(configdata.datenStand || "").trim();
  if (!hinweis && !stand) return "";
  var standZeile = stand
    ? '<p class="text-muted small mb-2">' + escapeHtml(stand) + "</p>"
    : "";
  return (
    '<section class="mk-methodik mt-4">' +
    '<button class="mk-methodik-toggle collapsed" type="button" ' +
    'data-bs-toggle="collapse" data-bs-target="#mk-methodik-body-' + uid + '" ' +
    'aria-expanded="false" aria-controls="mk-methodik-body-' + uid + '">' +
    '<h2 class="h5 mb-0">Methodik &amp; Datenquelle</h2>' +
    '<span class="mk-methodik-chevron" aria-hidden="true">&#9662;</span>' +
    "</button>" +
    '<div id="mk-methodik-body-' + uid + '" class="collapse">' +
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

function updateMkFrische(stand, root) {
  var el = root.querySelector("#mk-datenfrische");
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
