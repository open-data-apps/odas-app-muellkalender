/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configData - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let mkInstanzZaehler = 0;
let calendarAssetsPromise = null;

// Laufzeit-Cleanups pro App-Instanz, je DOM-Container registriert. onPageLeave
// iteriert alle registrierten Cleanups (try/catch) und leert die Registry
// anschliessend — die app/app-base.js ruft onPageLeave beim Seitenwechsel auf.
const mkCleanups = new Map();

function onPageLeave() {
  mkCleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch (_err) {
      // Ein einzelner Cleanup darf den Seitenwechsel nicht blockieren.
    }
  });
  mkCleanups.clear();
}

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

// MK-B2: Der Cache wird nach einem Fehlschlag freigegeben, damit ein neuer
// Versuch moeglich ist — vorher blieb die abgelehnte Promise fuer die ganze
// Sitzung stehen und jeder weitere Ladeversuch scheiterte identisch.
function resetCalendarAssetsCache() {
  if (!calendarAssetsPromise) return;
  calendarAssetsPromise = null;
}

function ensureCalendarAssets() {
  if (calendarAssetsPromise) return calendarAssetsPromise;

  // MK-B2: Der Cache wird bei einem Fehlschlag zurueckgesetzt. Vorher blieb die
  // abgelehnte Promise fuer die ganze Sitzung stehen — jeder weitere Versuch
  // (auch in anderen Instanzen/Seiten) scheiterte identisch, ohne echte
  // Wiederholung.
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
  ])
    .then(() =>
      loadScriptOnce("mk-calendar-js", appAssetUrl("dist/calendar.min.js"), "calendarJs"),
    )
    .catch((err) => {
      resetCalendarAssetsCache();
      throw err;
    });

  return calendarAssetsPromise;
}

function app(configData, enclosingHtmlDivElement) {
  // F-42: pro Instanz geschlossener State (Closure in app())
  const state = {
    uid: "i" + ++mkInstanzZaehler,
    root: enclosingHtmlDivElement,
    config: configData,
    disposed: false,
    calendarData: {},
    datenfrische: null,
    controller: new AbortController(),
  };
  // MK-B1: Vorgaenger-Instanz desselben Containers zuerst abraeumen — sonst
  // bleibt ihre calendarJs-Instanz (dokumentweite Listener) am Leben.
  const mkVorherigerCleanup = mkCleanups.get(enclosingHtmlDivElement);
  if (mkVorherigerCleanup) {
    try {
      mkVorherigerCleanup();
    } catch (_e) {}
  }
  mkCleanups.set(enclosingHtmlDivElement, () => {
    state.disposed = true;
    // MK-B5: laufende Abrufe (Abfuhrtermine/ICS) abbrechen.
    state.controller.abort();
    const calendarElement = enclosingHtmlDivElement.querySelector("#mk-calendar-" + state.uid);
    destroyCalendarInstance(calendarElement);
  });
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
  return `${appPath}/odp-data?path=${encodeURIComponent(targetUrl)}`;
}

async function fetchViaOdasProxy(targetUrl, options = {}) {
  if (typeof isKeineDatenquelleKonfiguriert === "function" && isKeineDatenquelleKonfiguriert(targetUrl)) {
    throw new Error("Keine Datenquelle konfiguriert.");
  } else if (typeof isKeineDatenquelleKonfiguriert !== "function") {
    const v = String(targetUrl || "").trim();
    if (!v || /^\{\{.*\}\}$/.test(v) || /^<.*>$/.test(v)) throw new Error("Keine Datenquelle konfiguriert.");
  }

  const response = await fetch(getOdasProxyEndpoint(targetUrl), {
    method: "POST",
    signal: options && options.signal ? options.signal : undefined,
  });

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch (_e) {}
    const originHint = /origin not allowed/i.test(body) ? " – URL origin not allowed" : "";
    throw new Error(`ODAS-Proxy-Fehler: HTTP ${response.status}${originHint}`);
  }

  const proxyData = await response.json();
  if (!proxyData || typeof proxyData.content !== "string") {
    throw new Error("ODAS-Proxy-Antwort enthält keinen content-String.");
  }

  return proxyData.content;
}

async function fetchOdasResource(targetUrl, configdata = {}, options = {}) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchViaOdasProxy(targetUrl, options);
  }

  try {
    const response = await fetch(targetUrl, {
      signal: options && options.signal ? options.signal : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new Error(
      `Direkter Datenabruf fehlgeschlagen (${error.message}). Bitte prüfen Sie die Daten-URL und die CORS-Freigabe der Datenquelle.`,
    );
  }
}

/**
 * Löst eine benannte Datenressource aus configdata.apiurls auf.
 * Neue apiurls-Form (typ: "array"); das frühere skalare apiurl wird nicht mehr gelesen.
 * @returns {string} getrimmte URL, oder "" für den Zustand "keine Quelle konfiguriert"
 */
function getOdasApiUrl(configdata, name) {
  const liste = Array.isArray(configdata && configdata.apiurls) ? configdata.apiurls : [];
  const treffer = liste.find((eintrag) => eintrag && eintrag.name === name);
  return String((treffer && treffer.url) || "").trim();
}

async function fetchOdasJson(targetUrl, configdata = {}, options = {}) {
  const rawContent = await fetchOdasResource(targetUrl, configdata, options);
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

function isKeineDatenquelleKonfiguriert(targetUrl) {
  const quelle = String(targetUrl || "").trim();
  return !quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle);
}


const TYP_BEZEICHNUNG = {
  "ckan-dkan-ds": "Tabellen-API mit Daten-ID",
  "ckan-ps": "Datensatz-API",
  "ckan-dl": "Datei-Download",
  "ods21": "Open-Data-Suche (API v2.1)",
  "wfs": "Kartendienst (WFS)",
  "sparql": "Wissensdatenbank (SPARQL)",
  "csv-zip": "Statische Datei"
};

function validateUrlTypErwartung(url, erwarteterTyp) {
  const u = String(url || "");
  if (!erwarteterTyp || isKeineDatenquelleKonfiguriert(u)) return null;
  const checks = {
    "ckan-dkan-ds": /\/api\/3\/action\/datastore_search\?resource_id=/i,
    "ckan-ps": /\/api\/3\/action\/package_show\?id=/i,
    "ckan-dl": /\/dataset\/.*\/resource\/.*\/download\//i,
    "ods21": /\/api\/explore\/v2\.1\//i,
    "wfs": /service=WFS/i,
    "sparql": /\/api\/ts\/v1\/kg\/sparql/i,
    "csv-zip": /\.(csv|json|zip)(\?|$)/i
  };
  const re = checks[erwarteterTyp];
  if (!re) return null;
  if (!re.test(u)) {
    const soll = TYP_BEZEICHNUNG[erwarteterTyp] || erwarteterTyp;
    return `Typ passt nicht: erwartet „${soll}", erhalten „${u.slice(0, 60)}…". Prüfen Sie den Hilfe-Tooltip bei „URLs zu Datenressourcen".`;
  }
  return null;
}

function classifyOdasFehler(error, kontext = {}) {
  const msg = String((error && error.message) || error || "");
  const url = String(kontext.url || "");
  const label = String(kontext.label || "Datenressource");
  const typLabel = String(kontext.typLabel || TYP_BEZEICHNUNG[kontext.erwarteterTyp] || "Datenquelle");
  if (/Keine Datenquelle konfiguriert/i.test(msg) || isKeineDatenquelleKonfiguriert(url)) {
    return {
      kind: "KEINE_QUELLE",
      titel: "Es ist keine Datenquelle konfiguriert.",
      hinweis: `Prüfen Sie unter „URLs zu Datenressourcen → ${label}" ob eine gültige ${typLabel}-URL eingetragen ist (Hilfe-Tooltip beachten).`,
      detail: msg,
      alertClass: "alert-info"
    };
  }
  if (/Typ passt nicht: erwartet/i.test(msg)) {
    return {
      kind: "TYP_MISMATCH",
      titel: msg,
      hinweis: `Diese App erwartet ${typLabel}. Korrigieren Sie die URL gemäß Hilfe-Tooltip (Beispiel dort).`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/URL origin not allowed/i.test(msg)) {
    return {
      kind: "PROXY_ORIGIN",
      titel: "ODAS-Proxy blockiert: Ziel-Origin nicht freigegeben.",
      hinweis: "Tragen Sie die Ziel-Origin als eigenen Eintrag unter „URLs zu Datenressourcen“ ein oder prüfen Sie proxyAktiv.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/ODAS-Proxy-Fehler/i.test(msg) || /kein content-String/i.test(msg)) {
    return {
      kind: "PROXY_HTTP",
      titel: msg,
      hinweis: "Prüfen Sie proxyAktiv und Erreichbarkeit im ODAS-Live-System (lokal 404 ist normal).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/Direkter Datenabruf fehlgeschlagen/i.test(msg) || /Failed to fetch/i.test(msg)) {
    const corsHint = /Failed to fetch/i.test(msg) ? " – vermutlich CORS blockiert → im ODAS-Live proxyAktiv=ja." : "";
    return {
      kind: "DIREKT_CORS_HTTP",
      titel: msg,
      hinweis: `Prüfen Sie URL und CORS der Quelle${corsHint}`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/liefert kein JSON/i.test(msg) || /HTML-Seite|CSV-|leere Antwort|unlesbaren/i.test(msg)) {
    return {
      kind: "PAYLOAD_TYP",
      titel: msg,
      hinweis: "Tragen Sie den passenden Endpunkt ein – nicht die Datensatzseite (/dataset/…) – Hilfe-Tooltip beachten.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/CKAN.*Fehler|success:false/i.test(msg)) {
    return {
      kind: "CKAN_API",
      titel: msg,
      hinweis: "Prüfen Sie Daten-ID / Datensatz-ID (existiert die Tabelle/Datei noch auf dem Portal?).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/404|Nicht gefunden/i.test(msg)) {
    return {
      kind: "HTTP_404",
      titel: msg,
      hinweis: "Ressource/Datensatz auf dem Portal nicht gefunden (404).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  return {
    kind: "UNBEKANNT",
    titel: msg || "Unbekannter Fehler beim Laden.",
    hinweis: "Prüfen Sie Konfiguration und Erreichbarkeit der Quelle.",
    detail: msg,
    alertClass: "alert-danger"
  };
}

function renderOdasFehler(container, error, kontext = {}) {
  if (!container) return;
  const typWarn = validateUrlTypErwartung(kontext.url, kontext.erwarteterTyp);
  if (typWarn && !/Typ passt nicht/i.test(String(error && error.message))) {
    error = new Error(typWarn);
  }
  const info = classifyOdasFehler(error, kontext);
  const url = String(kontext.url || "");
  const urlZeile = url ? `<p class="mb-1 small text-muted">Konfigurierte URL: <code>${escapeHtml(url.length > 80 ? url.slice(0, 80) + "…" : url)}</code></p>` : "";
  const titel = kontext.leer ? "Keine Datensätze gefunden." : info.titel;
  const alertClass = kontext.leer ? "alert-info" : info.alertClass;
  container.innerHTML = `<div class="alert ${alertClass}" role="alert"><strong>${escapeHtml(titel)}</strong><p class="mb-1">${escapeHtml(info.hinweis)}</p>${urlZeile}<details class="small"><summary>Details</summary><code>${escapeHtml(info.detail || String(error))}</code></details></div>`;
}


// Lade Kalender von der API über Proxy
function loadAvailableCalendars(state, configData, root) {
  const quelle = getOdasApiUrl(configData, "abfuhrtermine");
  if (!quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle)) {
    // Status-Element statt root: das Layout steht bereits; root wuerde das
    // Convert-Button-Scaffold entfernen (prepend auf null im Zwei-Instanz-Lauf).
    renderOdasFehler(root.querySelector("#mk-status"), new Error("Keine Datenquelle konfiguriert."), {
      url: quelle,
      label: "Abfuhrtermine-API",
      typLabel: "Datensatz-API",
      erwarteterTyp: "ckan-ps",
    });
    return;
  }
  // Variante A (F-92): Typprüfung vor dem ersten Fetch. Die .ics-Ressourcen,
  // die aus dieser package_show-Antwort abgeleitet werden, sind Laufzeit-
  // Downloads und werden bewusst nicht typgeprüft.
  const mkTypWarn = validateUrlTypErwartung(quelle, "ckan-ps");
  if (mkTypWarn) {
    renderOdasFehler(root.querySelector("#mk-status"), new Error(mkTypWarn), {
      url: quelle,
      label: "Abfuhrtermine-API",
      typLabel: "Datensatz-API",
      erwarteterTyp: "ckan-ps",
    });
    return;
  }
  // Daten laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasJson(getOdasApiUrl(configData, "abfuhrtermine"), configData, {
    signal: state.controller.signal,
  })
    .then((data) => {
      if (state.disposed) return;
      state.datenfrische = extractDatenStandMk(data);
      updateMkFrische(state.datenfrische, root);
      if (data.success && data.result && data.result.resources) {
        const resources = data.result.resources;
        // Ressourcen ohne format-Feld dürfen keinen TypeError auslösen.
        // MK-B6: Ressourcen ohne URL erzeugen sonst einen Dropdown-Eintrag mit
        // value="undefined", der beim Auswaehlen zwangslaeufig scheitert.
        state.calendarData = resources.filter(
          (resource) =>
            String((resource && resource.url) || "").trim() !== "" &&
            String((resource && resource.format) || "")
              .toLowerCase()
              .includes("ics"),
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
      if (err && err.name === "AbortError") return;
      if (state.disposed) return;
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      renderOdasFehler(root.querySelector("#mk-status"), err, {
        url: quelle,
        label: "Abfuhrtermine-API",
        typLabel: "Datensatz-API",
        erwarteterTyp: "ckan-ps",
      });
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

// Zerstoert eine vorhandene calendarJs-Instanz und leert den root-lokalen
// Kalendercontainer. Wirft destroy() (Drittanbieter-Code), bleibt die
// Leerung trotzdem garantiert.
function destroyCalendarInstance(calendarElement) {
  if (!calendarElement) return;
  const instance = calendarElement.__calendarInstance;
  if (instance && typeof instance.destroy === "function") {
    try {
      instance.destroy();
    } catch (error) {
      console.error("Fehler beim Zerstören der Kalenderinstanz:", error);
    }
  }
  calendarElement.__calendarInstance = null;
  calendarElement.innerHTML = "";
}

// Kalender laden und anzeigen (ICS über Proxy laden)
function loadCalendar(state, calendarUrl, configData = {}, root) {
  if (state.disposed) return;
  if (!calendarUrl) {
    console.error("Keine URL für den Kalender angegeben.");
    showMkError(
      root,
      "Für den ausgewählten Kalender ist keine Datenquelle hinterlegt.",
    );
    return;
  }
  clearMkStatus(root);
  // Neuer Ladevorgang: vorherige Instanz zerstoeren und Container leeren,
  // damit beim Ressourcenwechsel keine stale Kalender-DOM stehen bleibt.
  const calendarElement = root.querySelector("#mk-calendar-" + state.uid);
  destroyCalendarInstance(calendarElement);

  // Latest-Load-Token: Nur der neueste Ladevorgang darf nach seinem Abschluss
  // Instanz/DOM/Status anfassen.
  state.calendarLadeToken = (state.calendarLadeToken || 0) + 1;
  const ladeToken = state.calendarLadeToken;

  // ICS laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasResource(calendarUrl, configData, {
    signal: state.controller.signal,
  })
    .then(async (icsData) => {
      await ensureCalendarAssets();
      // Veralteter Erfolg / Disposed: weder Kalenderinstanz/DOM noch Status des
      // neueren Ladevorgangs veraendern.
      if (state.disposed || state.calendarLadeToken !== ladeToken) {
        return;
      }

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
      } else {
        clearMkStatus(root);
      }

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
      calendarElement.__calendarInstance = calendarInstance;
      calendarInstance.setEvents(events);
    })
    .catch((err) => {
      // Veralteter Fehler / Disposed: Instanz/DOM/Status des neueren Ladevorgangs
      // unangetastet lassen.
      if (state.disposed || state.calendarLadeToken !== ladeToken) {
        return;
      }
      if (err && err.name === "AbortError") return;
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      destroyCalendarInstance(calendarElement);
      // MK-B4: Fehler ins Status-Element statt nach `root` — sonst verschwinden
      // Kalender-Dropdown und Konvertier-Button und ein Wechsel auf einen
      // anderen Kalender ist nicht mehr moeglich.
      renderOdasFehler(root.querySelector("#mk-status"), err, {
        url: calendarUrl,
        label: "Abfuhrkalender (Ressource)",
      });
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
    showMkInfo(
      root,
      "Es sind keine Termine vorhanden, die umgewandelt werden können.",
    );
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
  showMkInfo(
    root,
    "Alle Termine wurden in ganztägige Termine umgewandelt.",
  );
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
