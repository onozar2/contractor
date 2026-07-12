/* app_permits.js — Permit tracker (InstaPermit-lite, manual but organized).
   Registers the "permits" view on the APP shell (app.html).

   List (#/permits, or #/permits/:id to filter to one project):
     KPIs -> table (project, jurisdiction, type, permit #, status, days in
     status, portal link, next/last inspection) -> row click opens a drawer
     to edit the permit, log inspections, and see a jurisdiction timeline
     hint pulled from the knowledge base.

   Uses ONLY the shell's CSS classes + small inline layout styles. */
(function () {
  "use strict";
  if (!window.APP) { console.error("app_permits.js: APP shell not found"); return; }

  var API = "/api/permits";
  var esc = APP.esc;

  var JURISDICTIONS = ["LADBS", "Burbank", "Glendale", "Pasadena", "Santa Monica", "Long Beach", "LA County", "other"];
  var PERMIT_TYPES = ["building", "electrical", "plumbing", "mechanical", "reroof", "pool", "solar", "demo", "other"];
  var STATUSES = ["planning", "submitted", "plan_check", "corrections", "issued", "inspections", "finaled", "expired"];
  var INSPECTION_RESULTS = ["scheduled", "passed", "partial", "failed"];
  var STALE_STATUSES = { submitted: 1, plan_check: 1, corrections: 1 };

  var STATUS_LABEL = {
    planning: "Planning", submitted: "Submitted", plan_check: "Plan check", corrections: "Corrections",
    issued: "Issued", inspections: "Inspections", finaled: "Finaled", expired: "Expired"
  };
  var STATUS_PILL = {
    planning: "", submitted: "amber", plan_check: "amber", corrections: "red",
    issued: "plum", inspections: "plum", finaled: "green", expired: "red"
  };
  var RESULT_PILL = { scheduled: "amber", passed: "green", partial: "plum", failed: "red" };

  // Known jurisdiction permit-status portals (confirmed 2026-07-12) — mirrors permits.js
  // PORTAL_URLS so the New-permit form can auto-fill without a round trip.
  var PORTAL_URLS = {
    LADBS: "https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReport",
    Burbank: "https://permit.burbankca.gov/bop/",
    Glendale: "https://glendaleca-energovweb.tylerhost.net/apps/SelfService#/guidedapplication",
    Pasadena: "https://mypermits.cityofpasadena.net",
    "Santa Monica": "https://www.santamonica.gov/active-building-permits",
    "Long Beach": "https://permitslicenses.longbeach.gov/",
    "LA County": "https://epicla.lacounty.gov/"
  };

  // expectedDays defaults by scope of work — used to pre-fill the New-permit form; editable.
  var DEFAULT_DAYS_BY_TYPE = {
    reroof: 1, solar: 10, electrical: 10, plumbing: 10, mechanical: 10,
    building: 45, pool: 30, demo: 5, other: 14
  };
  var DAYS_PRESETS = [
    { label: "Reroof / water heater (express)", days: 1 },
    { label: "Kitchen & bath", days: 10 },
    { label: "Addition / ADU", days: 45 }
  ];

  var INPUT = 'style="font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;' +
    'border-radius:7px;padding:0.25rem 0.55rem;background:#fff;color:#172033;width:100%"';
  var ROW = 'style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end"';
  var FIELD = 'style="display:grid;gap:0.2rem;flex:1 1 160px;min-width:0"';
  var FIELD_SM = 'style="display:grid;gap:0.2rem;flex:0 1 130px;min-width:0"';
  var LABEL = 'style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587"';

  // ── shared caches ──
  var projectsPromise = null; // GET /api/actuals — project select + name lookup

  function getProjects() {
    if (!projectsPromise) {
      projectsPromise = APP.fetchJSON("/api/actuals").catch(function () {
        projectsPromise = null;
        return [];
      });
    }
    return projectsPromise;
  }

  function num(v) { return Number(v) || 0; }

  function loadingEl(label) { return APP.el('<div class="loading">' + esc(label || "Loading") + "</div>"); }

  function errorEl(message, retry) {
    var node = APP.el('<div class="empty"><b>Couldn’t load</b>' + esc(message || "Unknown error") +
      '<div style="margin-top:0.7rem"><button class="btn primary" type="button">Retry</button></div></div>');
    node.querySelector("button").addEventListener("click", retry);
    return node;
  }

  function statusPill(status) {
    var s = STATUSES.indexOf(status) >= 0 ? status : "planning";
    return '<span class="pill ' + (STATUS_PILL[s] || "") + '">' + esc(STATUS_LABEL[s] || s) + "</span>";
  }

  function resultPill(result) {
    var r = INSPECTION_RESULTS.indexOf(result) >= 0 ? result : "scheduled";
    return '<span class="pill ' + (RESULT_PILL[r] || "") + '">' + esc(r) + "</span>";
  }

  function daysInStatus(permit) {
    if (!permit.submittedAt) return null;
    var then = new Date(permit.submittedAt).getTime();
    if (isNaN(then)) return null;
    return Math.floor((Date.now() - then) / 86400000);
  }

  function isStale(permit) {
    if (!STALE_STATUSES[permit.status]) return false;
    var d = daysInStatus(permit);
    return d !== null && num(permit.expectedDays) > 0 && d > num(permit.expectedDays);
  }

  function projectNameFor(permit, projects) {
    if (permit.projectId) {
      var match = (projects || []).filter(function (p) { return p.id === permit.projectId; })[0];
      if (match) return match.projectName;
    }
    return permit.projectName || "(no project)";
  }

  function nextOrLastInspection(permit) {
    var list = (permit.inspections || []).slice();
    if (!list.length) return null;
    var today = new Date().toISOString().slice(0, 10);
    var upcoming = list.filter(function (i) { return i.result === "scheduled" && i.date && i.date.slice(0, 10) >= today; })
      .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
    if (upcoming.length) return { entry: upcoming[0], label: "Next" };
    var past = list.filter(function (i) { return i.date; })
      .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    if (past.length) return { entry: past[0], label: "Last" };
    return { entry: list[list.length - 1], label: "Last" };
  }

  function putPermit(record, patch) {
    return APP.fetchJSON(API + "/" + encodeURIComponent(record.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch || {})
    }).then(function (updated) {
      Object.keys(updated || {}).forEach(function (key) { record[key] = updated[key]; });
      return record;
    });
  }

  /* ════════════════════ LIST VIEW ════════════════════ */

  function renderList(container, projectFilterId) {
    container.innerHTML = "";
    var head = APP.el('<div class="viewhead"><h1>Permits</h1>' +
      '<button class="btn primary" type="button" id="pmNew">+ New permit</button></div>');
    container.appendChild(head);

    if (projectFilterId) {
      var filterLine = APP.el('<div class="footline" style="margin:0.1rem 0 0.3rem">Filtered to one project — ' +
        '<a href="#/permits">show all permits</a></div>');
      container.appendChild(filterLine);
    }

    var formSlot = APP.el("<div></div>");
    container.appendChild(formSlot);

    var kpiSlot = APP.el('<div style="margin:0.5rem 0"></div>');
    container.appendChild(kpiSlot);

    var body = APP.el("<div></div>");
    body.appendChild(loadingEl("Loading permits"));
    container.appendChild(body);

    var state = { permits: null, projects: null };

    head.querySelector("#pmNew").addEventListener("click", function () {
      if (formSlot.firstChild) { formSlot.innerHTML = ""; return; }
      formSlot.appendChild(buildNewPermitForm(state.projects || [], projectFilterId, function (created) {
        formSlot.innerHTML = "";
        state.permits = (state.permits || []).concat([created]);
        draw();
      }));
    });

    function draw() {
      drawKpis(kpiSlot, state.permits || []);
      body.innerHTML = "";
      drawTable(body, state.permits || [], state.projects || [], function refresh() { load(); });
    }

    function load() {
      var url = API + (projectFilterId ? "?projectId=" + encodeURIComponent(projectFilterId) : "");
      Promise.all([APP.fetchJSON(url), getProjects()]).then(function (results) {
        state.permits = results[0] || [];
        state.projects = results[1] || [];
        draw();
      }).catch(function (err) {
        body.innerHTML = "";
        body.appendChild(errorEl(err.message, load));
      });
    }
    load();
  }

  function drawKpis(slot, permits) {
    slot.innerHTML = "";
    var active = permits.filter(function (p) { return p.status !== "finaled" && p.status !== "expired"; }).length;
    var planCheck = permits.filter(function (p) { return p.status === "plan_check"; }).length;
    var corrections = permits.filter(function (p) { return p.status === "corrections"; }).length;
    var inspections = permits.filter(function (p) { return p.status === "inspections"; }).length;
    var stale = permits.filter(isStale).length;
    var tiles = APP.el('<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
      '<div class="kpi"><b>' + esc(String(active)) + "</b><span>Active permits</span></div>" +
      '<div class="kpi"><b>' + esc(String(planCheck)) + "</b><span>In plan check</span></div>" +
      '<div class="kpi" data-accent="red"><b>' + esc(String(corrections)) + "</b><span>Awaiting corrections</span></div>" +
      '<div class="kpi"><b>' + esc(String(inspections)) + "</b><span>Inspections phase</span></div>" +
      '<div class="kpi" data-accent="red"><b>' + esc(String(stale)) + "</b><span>Stale (over expected)</span></div>" +
    "</div>");
    slot.appendChild(tiles);
  }

  function drawTable(slot, permits, projects, onChanged) {
    if (!permits.length) {
      slot.appendChild(APP.el('<div class="empty"><b>No permits tracked yet</b>' +
        "Log one with jurisdiction, type, and expected turnaround the day you pull it. " +
        "This board then flags anything sitting past its expected days, and keeps the inspection log + portal link in one place.</div>"));
      return;
    }
    var wrap = APP.el('<div class="tablewrap"></div>');
    var table = APP.el('<table class="table"><thead><tr>' +
      "<th>Project</th><th>Jurisdiction</th><th>Type</th><th>Permit #</th><th>Status</th>" +
      "<th>Days in status</th><th>Portal</th><th>Inspection</th>" +
      "</tr></thead><tbody></tbody></table>");
    var tbody = table.querySelector("tbody");

    permits.slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    }).forEach(function (permit) {
      var d = daysInStatus(permit);
      var stale = isStale(permit);
      var insp = nextOrLastInspection(permit);
      var portalUrl = permit.portalUrl || PORTAL_URLS[permit.jurisdiction] || "";
      var tr = APP.el("<tr>" +
        "<td>" + esc(projectNameFor(permit, projects)) + "</td>" +
        "<td>" + esc(permit.jurisdiction || "—") + "</td>" +
        "<td>" + esc(permit.permitType || "—") + "</td>" +
        "<td>" + esc(permit.permitNumber || "—") + "</td>" +
        "<td>" + statusPill(permit.status) + "</td>" +
        "<td" + (stale ? ' style="color:#b42318;font-weight:800"' : "") + ">" +
          (d === null ? "—" : esc(String(d)) + "d" + (num(permit.expectedDays) ? " / " + esc(String(permit.expectedDays)) + "d exp" : "")) +
        "</td>" +
        "<td>" + (portalUrl ? '<a href="' + esc(portalUrl) + '" target="_blank" rel="noopener">Portal ↗</a>' : '<span class="muted">—</span>') + "</td>" +
        "<td>" + (insp ? '<span class="muted" style="font-size:0.72rem">' + esc(insp.label) + "</span> " + esc(insp.entry.type || "inspection") +
          (insp.entry.date ? " " + esc(APP.fmtDate(insp.entry.date.slice(0, 10) + "T12:00:00")) : "") + " " + resultPill(insp.entry.result) : '<span class="muted">none logged</span>') + "</td>" +
      "</tr>");
      tr.addEventListener("click", function (e) {
        if (e.target.closest("a")) return; // let the portal link behave normally
        openPermitDrawer(permit, projects, onChanged);
      });
      tr.style.cursor = "pointer";
      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    slot.appendChild(wrap);
  }

  /* ════════════════════ NEW PERMIT FORM ════════════════════ */

  function buildNewPermitForm(projects, projectFilterId, onCreated) {
    var projectOptions = '<option value="">(none — free text below)</option>' +
      projects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === projectFilterId ? " selected" : "") + ">" + esc(p.projectName) + "</option>"; }).join("");
    var jurisdictionOptions = JURISDICTIONS.map(function (j) { return '<option value="' + esc(j) + '">' + esc(j === "other" ? "Other (type below)" : j) + "</option>"; }).join("");
    var typeOptions = PERMIT_TYPES.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("");

    var card = APP.el('<div class="card"><h2>New permit</h2>' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD + '><span ' + LABEL + ">Project</span><select " + INPUT + ' data-f="projectId">' + projectOptions + "</select></label>" +
        '<label ' + FIELD + '><span ' + LABEL + ">Project name (if not listed)</span><input " + INPUT + ' data-f="projectName" placeholder="e.g. Sherman Oaks kitchen remodel" /></label>' +
      "</div>" +
      '<div ' + ROW + ' style="margin-top:0.5rem">' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Jurisdiction</span><select " + INPUT + ' data-f="jurisdiction">' + jurisdictionOptions + "</select></label>" +
        '<label ' + FIELD + ' data-f="customWrap" style="display:none"><span ' + LABEL + ">Jurisdiction name</span><input " + INPUT + ' data-f="customJurisdiction" placeholder="e.g. Culver City" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Type</span><select " + INPUT + ' data-f="permitType">' + typeOptions + "</select></label>" +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Permit #</span><input " + INPUT + ' data-f="permitNumber" placeholder="optional" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Expected days</span><input " + INPUT + ' data-f="expectedDays" type="number" min="0" step="1" value="' + esc(String(DEFAULT_DAYS_BY_TYPE.other)) + '" /></label>' +
      "</div>" +
      '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.4rem">' +
        DAYS_PRESETS.map(function (preset) {
          return '<button class="chip" type="button" data-preset="' + esc(String(preset.days)) + '">' + esc(preset.label) + " — " + esc(String(preset.days)) + "d</button>";
        }).join("") +
      "</div>" +
      '<div ' + ROW + ' style="margin-top:0.5rem">' +
        '<label ' + FIELD + '><span ' + LABEL + ">Portal URL</span><input " + INPUT + ' data-f="portalUrl" placeholder="auto-fills from jurisdiction" /></label>' +
        '<button class="btn primary" type="button" data-f="create">Create</button>' +
        '<button class="btn" type="button" data-f="cancel">Cancel</button>' +
      "</div>" +
      '<div class="footline" data-f="msg"></div>' +
    "</div>");

    var jurisdictionSel = card.querySelector('[data-f="jurisdiction"]');
    var customWrap = card.querySelector('[data-f="customWrap"]');
    var portalInput = card.querySelector('[data-f="portalUrl"]');
    var typeSel = card.querySelector('[data-f="permitType"]');
    var daysInput = card.querySelector('[data-f="expectedDays"]');
    var msg = card.querySelector('[data-f="msg"]');

    function syncPortal() {
      var j = jurisdictionSel.value;
      if (!portalInput.value && PORTAL_URLS[j]) portalInput.value = PORTAL_URLS[j];
      customWrap.style.display = j === "other" ? "" : "none";
    }
    jurisdictionSel.addEventListener("change", syncPortal);
    syncPortal();

    typeSel.addEventListener("change", function () {
      daysInput.value = String(DEFAULT_DAYS_BY_TYPE[typeSel.value] != null ? DEFAULT_DAYS_BY_TYPE[typeSel.value] : DEFAULT_DAYS_BY_TYPE.other);
    });

    card.querySelectorAll("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () { daysInput.value = btn.getAttribute("data-preset"); });
    });

    card.querySelector('[data-f="cancel"]').addEventListener("click", function () { card.remove(); });
    card.querySelector('[data-f="create"]').addEventListener("click", function () {
      var projectId = card.querySelector('[data-f="projectId"]').value;
      var projectName = card.querySelector('[data-f="projectName"]').value.trim();
      var project = projects.filter(function (p) { return p.id === projectId; })[0];
      var resolvedName = projectName || (project ? project.projectName : "");
      if (!resolvedName) { msg.textContent = "Pick a project or type a project name first."; return; }
      var jurisdiction = jurisdictionSel.value === "other"
        ? (card.querySelector('[data-f="customJurisdiction"]').value.trim() || "other")
        : jurisdictionSel.value;
      var body = {
        projectId: projectId || "",
        projectName: resolvedName,
        jurisdiction: jurisdiction,
        permitType: typeSel.value,
        permitNumber: card.querySelector('[data-f="permitNumber"]').value.trim(),
        portalUrl: portalInput.value.trim(),
        expectedDays: Number(daysInput.value || 0),
        status: "planning"
      };
      msg.textContent = "Creating…";
      APP.fetchJSON(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function (created) {
        APP.toast("Permit created");
        onCreated(created);
      }).catch(function (err) { msg.textContent = "Create failed: " + err.message; });
    });

    return card;
  }

  /* ════════════════════ DRAWER ════════════════════ */

  function openPermitDrawer(permit, projects, onChanged) {
    var jurisdictionOptions = JURISDICTIONS.map(function (j) {
      var known = j === permit.jurisdiction;
      return '<option value="' + esc(j) + '"' + (known ? " selected" : "") + ">" + esc(j === "other" ? "Other (type below)" : j) + "</option>";
    }).join("");
    var isCustomJurisdiction = JURISDICTIONS.indexOf(permit.jurisdiction) < 0;
    var typeOptions = PERMIT_TYPES.map(function (t) { return '<option value="' + esc(t) + '"' + (t === permit.permitType ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
    var statusOptions = STATUSES.map(function (s) { return '<option value="' + esc(s) + '"' + (s === permit.status ? " selected" : "") + ">" + esc(STATUS_LABEL[s]) + "</option>"; }).join("");

    var drawer = APP.el('<div>' +
      '<div class="drawer-head">' +
        "<div><h1 style=\"margin:0\">" + esc(projectNameFor(permit, projects)) + "</h1>" +
        '<div class="muted" style="font-size:0.78rem">' + esc(permit.jurisdiction || "—") + " · " + esc(permit.permitType || "—") + "</div></div>" +
        statusPill(permit.status) +
      "</div>" +
      '<div class="drawer-body">' +
        '<div data-f="hint"></div>' +
        '<div class="card"><h2>Permit details</h2>' +
          '<div ' + ROW + ">" +
            '<label ' + FIELD + '><span ' + LABEL + ">Jurisdiction</span><select " + INPUT + ' data-f="jurisdiction">' + jurisdictionOptions + "</select></label>" +
            '<label ' + FIELD + ' data-f="customWrap" style="' + (isCustomJurisdiction ? "" : "display:none") + '"><span ' + LABEL + ">Jurisdiction name</span><input " + INPUT + ' data-f="customJurisdiction" value="' + esc(isCustomJurisdiction ? permit.jurisdiction : "") + '" /></label>' +
            '<label ' + FIELD + '><span ' + LABEL + ">Type</span><select " + INPUT + ' data-f="permitType">' + typeOptions + "</select></label>" +
          "</div>" +
          '<div ' + ROW + ' style="margin-top:0.5rem">' +
            '<label ' + FIELD + '><span ' + LABEL + ">Status</span><select " + INPUT + ' data-f="status">' + statusOptions + "</select></label>" +
            '<label ' + FIELD + '><span ' + LABEL + ">Permit #</span><input " + INPUT + ' data-f="permitNumber" value="' + esc(permit.permitNumber || "") + '" /></label>' +
          "</div>" +
          '<div ' + ROW + ' style="margin-top:0.5rem">' +
            '<label ' + FIELD + '><span ' + LABEL + ">Submitted</span><input " + INPUT + ' data-f="submittedAt" type="date" value="' + esc((permit.submittedAt || "").slice(0, 10)) + '" /></label>' +
            '<label ' + FIELD + '><span ' + LABEL + ">Issued</span><input " + INPUT + ' data-f="issuedAt" type="date" value="' + esc((permit.issuedAt || "").slice(0, 10)) + '" /></label>' +
            '<label ' + FIELD_SM + '><span ' + LABEL + ">Expected days</span><input " + INPUT + ' data-f="expectedDays" type="number" min="0" step="1" value="' + esc(String(permit.expectedDays || 0)) + '" /></label>' +
          "</div>" +
          '<div style="margin-top:0.5rem">' +
            '<label><span ' + LABEL + ">Portal URL</span><input " + INPUT + ' data-f="portalUrl" value="' + esc(permit.portalUrl || "") + '" /></label>' +
          "</div>" +
          '<div style="margin-top:0.5rem">' +
            '<label><span ' + LABEL + ">Notes</span><textarea " + INPUT.replace('min-height:34px', 'min-height:70px') + ' data-f="notes" style="resize:vertical">' + esc(permit.notes || "") + "</textarea></label>" +
          "</div>" +
          '<div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.6rem">' +
            '<button class="btn primary" type="button" data-f="save">Save</button>' +
            '<button class="btn" type="button" data-f="delete">Delete permit</button>' +
            '<span class="footline" data-f="savemsg"></span>' +
          "</div>" +
        "</div>" +
        '<div class="card"><h2>Inspections</h2>' +
          '<div data-f="insplist" style="display:grid;gap:0.4rem"></div>' +
          '<div ' + ROW + ' style="margin-top:0.6rem;border-top:1px dashed #d8dee8;padding-top:0.6rem">' +
            '<label ' + FIELD + '><span ' + LABEL + ">Type</span><input " + INPUT + ' data-f="iType" placeholder="e.g. rough electrical" /></label>' +
            '<label ' + FIELD_SM + '><span ' + LABEL + ">Date</span><input " + INPUT + ' data-f="iDate" type="date" /></label>' +
            '<label ' + FIELD_SM + '><span ' + LABEL + ">Result</span><select " + INPUT + ' data-f="iResult">' +
              INSPECTION_RESULTS.map(function (r) { return '<option value="' + esc(r) + '">' + esc(r) + "</option>"; }).join("") +
            "</select></label>" +
            '<label ' + FIELD + '><span ' + LABEL + ">Notes</span><input " + INPUT + ' data-f="iNotes" placeholder="optional" /></label>' +
            '<button class="btn primary" type="button" data-f="addInsp">Add</button>' +
          "</div>" +
          '<div class="footline" data-f="inspmsg"></div>' +
        "</div>" +
      "</div>" +
    "</div>");

    var jurisdictionSel = drawer.querySelector('[data-f="jurisdiction"]');
    var customWrap = drawer.querySelector('[data-f="customWrap"]');
    jurisdictionSel.addEventListener("change", function () {
      customWrap.style.display = jurisdictionSel.value === "other" ? "" : "none";
    });

    function collectPatch() {
      var jurisdiction = jurisdictionSel.value === "other"
        ? (drawer.querySelector('[data-f="customJurisdiction"]').value.trim() || "other")
        : jurisdictionSel.value;
      return {
        jurisdiction: jurisdiction,
        permitType: drawer.querySelector('[data-f="permitType"]').value,
        status: drawer.querySelector('[data-f="status"]').value,
        permitNumber: drawer.querySelector('[data-f="permitNumber"]').value.trim(),
        submittedAt: drawer.querySelector('[data-f="submittedAt"]').value,
        issuedAt: drawer.querySelector('[data-f="issuedAt"]').value,
        expectedDays: Number(drawer.querySelector('[data-f="expectedDays"]').value || 0),
        portalUrl: drawer.querySelector('[data-f="portalUrl"]').value.trim(),
        notes: drawer.querySelector('[data-f="notes"]').value
      };
    }

    drawer.querySelector('[data-f="save"]').addEventListener("click", function () {
      var savemsg = drawer.querySelector('[data-f="savemsg"]');
      savemsg.textContent = "Saving…";
      putPermit(permit, collectPatch()).then(function () {
        savemsg.textContent = "Saved";
        APP.toast("Permit saved");
        if (onChanged) onChanged();
      }).catch(function (err) { savemsg.textContent = "Save failed: " + err.message; });
    });

    drawer.querySelector('[data-f="delete"]').addEventListener("click", function () {
      if (!window.confirm("Delete this permit? This can’t be undone.")) return;
      APP.fetchJSON(API + "/" + encodeURIComponent(permit.id), { method: "DELETE" }).then(function () {
        APP.toast("Permit deleted");
        APP.closeDrawer();
        if (onChanged) onChanged();
      }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
    });

    function drawInspections() {
      var list = drawer.querySelector('[data-f="insplist"]');
      list.innerHTML = "";
      var entries = (permit.inspections || []).slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
      if (!entries.length) {
        list.appendChild(APP.el('<div class="footline">No inspections logged yet.</div>'));
        return;
      }
      entries.forEach(function (entry) {
        list.appendChild(APP.el('<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;border-bottom:1px solid #eef2f6;padding-bottom:0.35rem">' +
          "<b style=\"font-size:0.82rem\">" + esc(entry.type || "inspection") + "</b>" +
          '<span class="muted" style="font-size:0.76rem">' + esc(entry.date ? APP.fmtDate(entry.date.slice(0, 10) + "T12:00:00") : "no date") + "</span>" +
          resultPill(entry.result) +
          (entry.notes ? '<span class="muted" style="font-size:0.76rem">' + esc(entry.notes) + "</span>" : "") +
        "</div>"));
      });
    }
    drawInspections();

    drawer.querySelector('[data-f="addInsp"]').addEventListener("click", function () {
      var inspmsg = drawer.querySelector('[data-f="inspmsg"]');
      var entry = {
        type: drawer.querySelector('[data-f="iType"]').value.trim(),
        date: drawer.querySelector('[data-f="iDate"]').value,
        result: drawer.querySelector('[data-f="iResult"]').value,
        notes: drawer.querySelector('[data-f="iNotes"]').value.trim()
      };
      if (!entry.type) { inspmsg.textContent = "Give the inspection a type first."; return; }
      inspmsg.textContent = "Adding…";
      var nextInspections = (permit.inspections || []).concat([entry]);
      putPermit(permit, { inspections: nextInspections }).then(function () {
        inspmsg.textContent = "";
        drawer.querySelector('[data-f="iType"]').value = "";
        drawer.querySelector('[data-f="iDate"]').value = "";
        drawer.querySelector('[data-f="iNotes"]').value = "";
        drawInspections();
        APP.toast("Inspection logged");
        if (onChanged) onChanged();
      }).catch(function (err) { inspmsg.textContent = "Add failed: " + err.message; });
    });

    APP.openDrawer(drawer);

    // Timeline hint: fetch once per drawer open, show the top matching chunk.
    var hintSlot = drawer.querySelector('[data-f="hint"]');
    hintSlot.appendChild(loadingEl("Checking the knowledge base"));
    var q = "permit " + (permit.jurisdiction || "");
    APP.fetchJSON("/api/knowledge/search?q=" + encodeURIComponent(q)).then(function (result) {
      hintSlot.innerHTML = "";
      var chunks = (result && result.chunks) || [];
      if (!chunks.length) return; // no hint available — say nothing rather than clutter the drawer
      var top = chunks[0];
      var snippet = String(top.text || "").slice(0, 420);
      hintSlot.appendChild(APP.el('<div class="card" style="background:#f7f9fc"><h2>What to expect — ' + esc(permit.jurisdiction || "this jurisdiction") + "</h2>" +
        '<div style="font-size:0.82rem;line-height:1.5;white-space:pre-wrap">' + esc(snippet) + (top.text && top.text.length > 420 ? "…" : "") + "</div>" +
        (top.title ? '<div class="footline" style="margin-top:0.3rem">Source: ' + esc(top.title) + "</div>" : "") +
      "</div>"));
    }).catch(function () {
      hintSlot.innerHTML = ""; // knowledge base is a nice-to-have — never block the drawer on it
    });
  }

  /* ════════════════════ REGISTER ════════════════════ */

  APP.registerView("permits", {
    title: "Permits",
    render: function (container, params) {
      renderList(container, params && params.id ? params.id : null);
    }
  });
})();
