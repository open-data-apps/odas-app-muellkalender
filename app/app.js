/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configData - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let calendarData = {};

function app(configData, enclosingHtmlDivElement) {
  enclosingHtmlDivElement.innerHTML = `<div class="row">
      <div class="col-6" id="calendarOptions">
      </div>
      <div class="col-6" id="convertEvents">
      </div>
    </div>
    <div id="calendar">
    </div>`;
  loadAvailableCalendars(configData);
  createConvertToAllDayButton();
}

// Hilfsfunktion: Nur Pfad aus vollständiger URL extrahieren
function extractPathFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch (e) {
    return url;
  }
}

// Lade Kalender von der API über Proxy
function loadAvailableCalendars(configData) {
  // Aktuellen App-Pfad extrahieren (z. B. /view/odpname/appname/instanzid)
  const fullPath = window.location.pathname.replace(/\/+$/, "");
  // Nur Pfad der ODP-Ressource extrahieren
  const resourcePath = extractPathFromUrl(configData.apiurl);
  // Proxy-Endpunkt zusammensetzen
  const proxyEndpoint = `${fullPath}/odp-data?path=${resourcePath}`;

  fetch(proxyEndpoint, { method: "POST" })
    .then((response) => response.json())
    .then((proxyData) => {
      let data;
      try {
        data = JSON.parse(proxyData.content);
      } catch (e) {
        console.error("Fehler beim Parsen der Kalenderdaten:", e);
        return;
      }
      if (data.success && data.result.resources) {
        const resources = data.result.resources;
        calendarData = resources.filter((resource) =>
          resource.format.toLowerCase().includes("ics")
        );

        if (calendarData.length > 0) {
          createCalendarDropdown(calendarData);
          loadCalendar(calendarData[0].url);
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
function createCalendarDropdown(resources) {
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
    loadCalendar(event.target.value); // Lade den ausgewählten Kalender
  });

  dropdownContainer.appendChild(dropdown);
  mainContent.prepend(dropdownContainer);
}

// Kalender laden und anzeigen (ICS über Proxy laden)
function loadCalendar(calendarUrl) {
  if (!calendarUrl) {
    console.error("Keine URL für den Kalender angegeben.");
    return;
  }
  const fullPath = window.location.pathname.replace(/\/+$/, "");
  const resourcePath = extractPathFromUrl(calendarUrl);
  const proxyEndpoint = `${fullPath}/odp-data?path=${resourcePath}`;

  fetch(proxyEndpoint, { method: "POST" })
    .then((response) => response.json())
    .then((proxyData) => {
      let icsData;
      try {
        icsData = proxyData.content;
      } catch (e) {
        console.error("Fehler beim Parsen der ICS-Daten:", e);
        return;
      }
      const events = parseIcsToEvents(icsData);
      const calendarElement = document.getElementById("calendar");

      const calendarInstance = new calendarJs(
        "calendar",
        __TRANSLATION_OPTIONS,
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

/* 
 * Diese Funktion kann Bibliotheken und benötigte Skripte laden. 
 * Sie hängt den zurückgegebenen HTML Code in die Head Section an. 

 * @returns {string} - HTML mit script, link, etc. Tags
 */
function addToHead() {
  const currentUrl = window.location.href;

  // Stylesheet
  const stylesheet = "dist/calendar.js.min.css";
  const styleSheetUrl = currentUrl + stylesheet;

  const stylesheetLink = document.createElement("link");
  stylesheetLink.rel = "stylesheet";
  stylesheetLink.href = styleSheetUrl;

  document.head.appendChild(stylesheetLink);

  const ical = document.createElement("script");
  ical.type = "text/javascript";
  ical.src = "https://cdnjs.cloudflare.com/ajax/libs/ical.js/1.4.0/ical.min.js";
  document.head.appendChild(ical);

  // Translations
  const translation = "dist/translations/calendar.translations.de.js";
  const translationUrl = currentUrl + translation;

  const translationScript = document.createElement("script");
  translationScript.src = translationUrl;

  document.head.appendChild(translationScript);

  // Calendar.js
  const calender = "dist/calendar.js";
  const calenderUrl = currentUrl + calender;

  const calenderScript = document.createElement("script");
  calenderScript.src = calenderUrl;

  document.head.appendChild(calenderScript);

  return ``;
}
