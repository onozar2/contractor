/* app_billing.js — AIA-style progress billing (G702/G703 pattern) on the APP shell.
   Registers the "billing" view: hash "#/billing/:id" where :id is the actuals
   PROJECT id (same id used by "#/projects/:id"). Talks only to /api/billing/*
   (billing.js) and /api/actuals (read-only, to load the project header).

   Uses ONLY the shell's CSS classes + small inline layout styles, same pattern
   as app_projects.js. */
(function () {
  "use strict";

  var STATUSES = ["draft", "sent", "paid"];
  var STATUS_LABEL = { draft: "Draft", sent: "Sent", paid: "Paid" };
  var STATUS_PILL = { draft: "", sent: "amber", paid: "green" };

  var WAIVER_TYPES = [
    { value: "conditional_progress", label: "Conditional — progress payment" },
    { value: "unconditional_progress", label: "Unconditional — progress payment" },
    { value: "conditional_final", label: "Conditional — final payment" },
    { value: "unconditional_final", label: "Unconditional — final payment" }
  ];

  var INPUT = 'style="font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;' +
    'border-radius:7px;padding:0.25rem 0.55rem;background:#fff;color:#172033;width:100%"';
  var ROW = 'style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end"';
  var FIELD = 'style="display:grid;gap:0.2rem;flex:1 1 160px;min-width:0"';
  var FIELD_SM = 'style="display:grid;gap:0.2rem;flex:0 1 130px;min-width:0"';
  var LABEL = 'style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587"';

  function esc(v) { return APP.esc(v); }
  function num(v) { return Number(v) || 0; }
  function money(v) { return APP.fmtMoney(v); }

  function loadingEl(label) {
    return APP.el('<div class="loading">' + esc(label || "Loading") + "</div>");
  }

  function errorEl(message, retry) {
    var node = APP.el('<div class="empty"><b>Couldn’t load</b>' + esc(message || "Unknown error") +
      '<div style="margin-top:0.7rem"><button class="btn primary" type="button">Retry</button></div></div>');
    node.querySelector("button").addEventListener("click", retry);
    return node;
  }

  function statusPill(status) {
    return '<span class="pill ' + (STATUS_PILL[status] || "") + '">' + esc(STATUS_LABEL[status] || status) + "</span>";
  }

  /* ── print: visibility-trick print CSS, same technique as estimator.html's
     #proposal — a single hidden container that becomes the only visible thing
     when the browser prints, so it escapes the shell's sidebar/grid layout. ── */

  function ensurePrintStyle() {
    if (document.getElementById("billingPrintStyle")) return;
    var style = document.createElement("style");
    style.id = "billingPrintStyle";
    style.textContent =
      "#billingPrintArea{display:none}" +
      "@media print{" +
      "body *{visibility:hidden}" +
      "#billingPrintArea,#billingPrintArea *{visibility:visible}" +
      "#billingPrintArea{display:block;position:absolute;left:0;top:0;width:100%;padding:1.4rem 2rem;background:#fff;color:#172033;font-family:Inter,ui-sans-serif,system-ui,sans-serif}" +
      "#billingPrintArea table{width:100%;border-collapse:collapse;font-size:0.82rem}" +
      "#billingPrintArea th,#billingPrintArea td{border-bottom:1px solid #ccc;padding:0.35rem 0.4rem;text-align:left}" +
      "#billingPrintArea th.num,#billingPrintArea td.num{text-align:right;white-space:nowrap}" +
      "}";
    document.head.appendChild(style);
  }

  function doPrint(html) {
    ensurePrintStyle();
    var area = document.getElementById("billingPrintArea");
    if (!area) {
      area = document.createElement("div");
      area.id = "billingPrintArea";
      document.body.appendChild(area);
    }
    area.innerHTML = html;
    window.print();
  }

  function printHeaderHtml(project, eyebrow) {
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #2563eb;padding-bottom:0.6rem;margin-bottom:1rem">' +
      '<div><div style="font-size:0.7rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb">' + esc(eyebrow) + "</div>" +
      '<div style="font-size:1.05rem;font-weight:900">JOON DEVELOPMENT GROUP</div></div>' +
      '<div style="text-align:right;font-size:0.8rem;color:#3c4658">' + esc(project.projectName) +
      (project.city ? "<br />" + esc(project.city) : "") + "</div>" +
    "</div>";
  }

  /* ────────────────────── data access ────────────────────── */

  function loadProject(id) {
    return APP.fetchJSON("/api/actuals").then(function (rows) {
      return (rows || []).find(function (p) { return p.id === id; });
    });
  }

  function loadAll(ctx) {
    return Promise.all([
      APP.fetchJSON("/api/billing/schedule/" + encodeURIComponent(ctx.project.id)),
      APP.fetchJSON("/api/billing?projectId=" + encodeURIComponent(ctx.project.id)),
      APP.fetchJSON("/api/billing/summary/" + encodeURIComponent(ctx.project.id))
    ]).then(function (results) {
      ctx.sov = results[0];
      ctx.apps = results[1] || []; // sorted newest-first by the server
      ctx.summary = results[2];
    });
  }

  /* ════════════════════ VIEW ROOT ════════════════════ */

  function renderBilling(container, params) {
    container.innerHTML = "";
    var id = params && params.id;
    if (!id) {
      container.appendChild(APP.el('<div class="empty"><b>No project selected</b>' +
        'Open billing from a job — <a href="#/projects">back to projects</a>.</div>'));
      return;
    }
    container.appendChild(loadingEl("Loading billing"));
    loadProject(id).then(function (project) {
      container.innerHTML = "";
      if (!project) {
        container.appendChild(APP.el('<div class="empty"><b>Job not found</b>' +
          'It may have been deleted. <a href="#/projects">Back to projects</a>.</div>'));
        return;
      }
      var ctx = { project: project, container: container, expandedId: null, showNewForm: false };
      container.appendChild(loadingEl("Loading payment applications"));
      loadAll(ctx).then(function () {
        container.innerHTML = "";
        buildBilling(ctx);
      }).catch(function (err) {
        container.innerHTML = "";
        container.appendChild(errorEl(err.message, function () { renderBilling(container, params); }));
      });
    }).catch(function (err) {
      container.innerHTML = "";
      container.appendChild(errorEl(err.message, function () { renderBilling(container, params); }));
    });
  }

  function refresh(ctx) {
    return loadAll(ctx).then(function () {
      ctx.container.innerHTML = "";
      buildBilling(ctx);
    }).catch(function (err) {
      APP.toast("Refresh failed: " + err.message);
    });
  }

  function buildBilling(ctx) {
    var container = ctx.container;
    var project = ctx.project;

    var head = APP.el('<div class="viewhead">' +
      '<div style="min-width:0">' +
        '<div class="muted" style="font-size:0.76rem"><a href="#/projects/' + encodeURIComponent(project.id) + '" style="text-decoration:none">← ' + esc(project.projectName) + "</a></div>" +
        '<h1 style="overflow:hidden;text-overflow:ellipsis">Billing — ' + esc(project.projectName) + "</h1>" +
        '<div class="muted" style="font-size:0.78rem">Contract price ' + esc(money(project.contractPrice)) + "</div>" +
      "</div>" +
    "</div>");
    container.appendChild(head);

    container.appendChild(buildKpis(ctx));
    container.appendChild(buildSovCard(ctx));
    container.appendChild(buildAppsSection(ctx));
  }

  /* ──────────────── KPI tiles ──────────────── */

  function buildKpis(ctx) {
    var s = ctx.summary || {};
    var underBilled = num(s.underBilled);
    var wrap = APP.el("<div></div>");
    var tiles = APP.el('<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
      '<div class="kpi"><b>' + esc(money(s.earnedToDate)) + "</b><span>Earned to date</span></div>" +
      '<div class="kpi"><b>' + esc(money(s.billedToDate)) + "</b><span>Billed to date</span></div>" +
      '<div class="kpi" data-accent="' + (underBilled > 0 ? "red" : "green") + '"><b>' + esc(money(underBilled)) + "</b><span>Under-billed</span></div>" +
      '<div class="kpi"><b>' + esc(money(s.retainageHeld)) + "</b><span>Retainage held</span></div>" +
    "</div>");
    wrap.appendChild(tiles);
    if (underBilled > 0) {
      wrap.appendChild(APP.el('<div class="muted" style="font-size:0.78rem;color:#b42318;font-weight:700;margin-top:0.35rem">' +
        "⚠ You’ve done work you haven’t billed — " + esc(money(underBilled)) + " of completed work is not yet on a sent payment application.</div>"));
    }
    return wrap;
  }

  /* ──────────────── Schedule of Values ──────────────── */

  function buildSovCard(ctx) {
    var sov = ctx.sov || { rows: [], sumScheduled: 0, contractPrice: ctx.project.contractPrice, variance: 0, source: "derived" };
    var card = APP.el('<div class="card">' +
      '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:center;flex-wrap:wrap">' +
        "<h2 style=\"margin:0\">Schedule of values</h2>" +
        '<span class="muted" style="font-size:0.74rem">' +
          (sov.source === "custom" ? "Custom schedule" : "Derived from cost lines — edit and save to make it custom") +
        "</span>" +
      "</div>" +
      '<div data-f="rows" style="display:grid;gap:0.4rem;margin-top:0.5rem"></div>' +
      '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.6rem">' +
        '<button class="btn" type="button" data-f="addrow">+ Add row</button>' +
        '<button class="btn primary" type="button" data-f="save">Save schedule</button>' +
        '<span class="footline" data-f="msg"></span>' +
      "</div>" +
      '<div data-f="totals" style="margin-top:0.6rem"></div>' +
    "</div>");

    var rowsBox = card.querySelector('[data-f="rows"]');
    var msg = card.querySelector('[data-f="msg"]');
    var totalsBox = card.querySelector('[data-f="totals"]');
    var rows = (sov.rows || []).map(function (r) { return { id: r.id, description: r.description, scheduledValue: r.scheduledValue }; });

    function rowEl(row, index) {
      var el = APP.el('<div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">' +
        '<input data-k="description" placeholder="Scope line description" value="' + esc(row.description || "") + '" style="flex:3 1 260px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
        '<input data-k="scheduledValue" type="number" min="0" step="any" placeholder="$" value="' + esc(row.scheduledValue ? String(row.scheduledValue) : "") + '" style="flex:0 1 140px;font:inherit;font-size:0.82rem;font-weight:800;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
        '<button class="btn" type="button" data-k="del" title="Remove row" style="min-height:34px">✕</button>' +
      "</div>");
      el.querySelector('[data-k="description"]').addEventListener("input", function (e) { row.description = e.target.value; });
      el.querySelector('[data-k="scheduledValue"]').addEventListener("input", function (e) { row.scheduledValue = Number(e.target.value || 0); drawTotals(); });
      el.querySelector('[data-k="del"]').addEventListener("click", function () {
        rows.splice(index, 1);
        drawRows();
      });
      return el;
    }

    function drawRows() {
      rowsBox.innerHTML = "";
      if (!rows.length) {
        rowsBox.appendChild(APP.el('<div class="empty" style="padding:0.8rem"><b>No schedule rows</b>Add a row, or add cost lines on the job’s Budget tab first.</div>'));
      } else {
        rows.forEach(function (row, index) { rowsBox.appendChild(rowEl(row, index)); });
      }
      drawTotals();
    }

    function drawTotals() {
      var sum = rows.reduce(function (s, r) { return s + num(r.scheduledValue); }, 0);
      var contract = num(ctx.project.contractPrice);
      var variance = contract - sum;
      var pillClass = Math.abs(variance) < 1 ? "green" : (Math.abs(variance) <= contract * 0.05 ? "amber" : "red");
      totalsBox.innerHTML = "";
      totalsBox.appendChild(APP.el('<div style="display:flex;gap:0.7rem;flex-wrap:wrap;align-items:center;font-size:0.84rem">' +
        "<div><b>" + esc(money(sum)) + "</b> <span class=\"muted\">scheduled total</span></div>" +
        '<span class="pill ' + pillClass + '">' +
          (Math.abs(variance) < 1 ? "matches contract price" : (variance > 0 ? esc(money(variance)) + " under contract price" : esc(money(Math.abs(variance))) + " over contract price")) +
        "</span></div>"));
    }

    card.querySelector('[data-f="addrow"]').addEventListener("click", function () {
      rows.push({ id: "", description: "", scheduledValue: 0 });
      drawRows();
    });

    card.querySelector('[data-f="save"]').addEventListener("click", function () {
      msg.textContent = "Saving…";
      APP.fetchJSON("/api/billing/schedule/" + encodeURIComponent(ctx.project.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleOfValues: rows })
      }).then(function () {
        APP.toast("Schedule of values saved");
        refresh(ctx);
      }).catch(function (err) { msg.textContent = "Save failed: " + err.message; });
    });

    drawRows();
    return card;
  }

  /* ──────────────── Payment applications: list + new-app form ──────────────── */

  function lastApp(ctx) {
    // ctx.apps is sorted newest-first by the server (periodTo desc, createdAt desc).
    return (ctx.apps && ctx.apps[0]) || null;
  }

  function buildAppsSection(ctx) {
    var card = APP.el('<div class="card">' +
      '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:center;flex-wrap:wrap">' +
        "<h2 style=\"margin:0\">Payment applications</h2>" +
        '<button class="btn primary" type="button" data-f="new">+ New payment application</button>' +
      "</div>" +
      '<div data-f="form" style="margin-top:0.6rem"></div>' +
      '<div data-f="list" style="display:grid;gap:0.6rem;margin-top:0.6rem"></div>' +
    "</div>");

    var formSlot = card.querySelector('[data-f="form"]');
    var listSlot = card.querySelector('[data-f="list"]');

    card.querySelector('[data-f="new"]').addEventListener("click", function () {
      ctx.showNewForm = !ctx.showNewForm;
      formSlot.innerHTML = "";
      if (ctx.showNewForm) formSlot.appendChild(buildNewAppForm(ctx));
    });
    if (ctx.showNewForm) formSlot.appendChild(buildNewAppForm(ctx));

    if (!ctx.sov || !(ctx.sov.rows || []).length) {
      listSlot.appendChild(APP.el('<div class="empty" style="padding:0.8rem"><b>Set up the schedule of values first</b>' +
        "Payment applications bill against the rows above.</div>"));
    } else if (!ctx.apps.length) {
      listSlot.appendChild(APP.el('<div class="empty" style="padding:0.8rem"><b>No payment applications yet</b>' +
        "Create the first one with “+ New payment application.”</div>"));
    } else {
      ctx.apps.forEach(function (app) { listSlot.appendChild(buildAppCard(ctx, app)); });
    }
    return card;
  }

  function buildNewAppForm(ctx) {
    var sovRows = (ctx.sov && ctx.sov.rows) || [];
    var prior = lastApp(ctx);
    var priorPct = {};
    (prior ? prior.rows : []).forEach(function (r) { priorPct[r.sovId] = r.pctComplete; });

    var rowsState = sovRows.map(function (sv) {
      return { sovId: sv.id, description: sv.description, scheduledValue: sv.scheduledValue, pctComplete: num(priorPct[sv.id] || 0) };
    });

    // Previously billed per row = sum of thisPeriod across every existing app for
    // that sovId — matches how the server computes it for a brand-new (POST) app.
    function previouslyBilled(sovId) {
      var sum = 0;
      (ctx.apps || []).forEach(function (app) {
        (app.rows || []).forEach(function (r) { if (r.sovId === sovId) sum += num(r.thisPeriod); });
      });
      return sum;
    }

    var card = APP.el('<div class="card" style="background:#f7f9fc">' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Period ending</span><input " + INPUT + ' type="date" data-f="periodTo" value="' + esc(new Date().toISOString().slice(0, 10)) + '" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Retainage %</span><input " + INPUT + ' type="number" min="0" max="100" step="any" data-f="retainage" value="' + esc(String(prior ? prior.retainagePct : 10)) + '" /></label>' +
      "</div>" +
      '<div class="tablewrap" style="margin-top:0.6rem;max-height:none"><table class="table"><thead><tr>' +
        "<th>Description</th><th>Scheduled</th><th>% complete</th><th>Completed to date</th><th>Previously billed</th><th>This period</th>" +
      "</tr></thead><tbody data-f=\"rows\"></tbody></table></div>" +
      '<div data-f="totals" style="margin-top:0.6rem;font-size:0.86rem"></div>' +
      '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.6rem">' +
        '<button class="btn primary" type="button" data-f="create">Create payment application</button>' +
        '<button class="btn" type="button" data-f="cancel">Cancel</button>' +
        '<span class="footline" data-f="msg"></span>' +
      "</div>" +
    "</div>");

    var tbody = card.querySelector('[data-f="rows"]');
    var totalsBox = card.querySelector('[data-f="totals"]');
    var periodInput = card.querySelector('[data-f="periodTo"]');
    var retainageInput = card.querySelector('[data-f="retainage"]');

    function drawRows() {
      tbody.innerHTML = "";
      if (!rowsState.length) {
        tbody.appendChild(APP.el('<tr><td colspan="6" class="empty" style="padding:0.8rem">No schedule of values rows.</td></tr>'));
        return;
      }
      rowsState.forEach(function (row) {
        var billed = previouslyBilled(row.sovId);
        var completed = row.scheduledValue * (row.pctComplete / 100);
        var thisPeriod = Math.max(0, completed - billed);
        var tr = APP.el("<tr>" +
          "<td>" + esc(row.description) + "</td>" +
          '<td class="nowrap">' + esc(money(row.scheduledValue)) + "</td>" +
          '<td style="min-width:150px"><div style="display:flex;gap:0.4rem;align-items:center">' +
            '<input type="range" min="0" max="100" step="1" value="' + esc(String(row.pctComplete)) + '" data-f="slider" style="flex:1 1 auto" />' +
            '<input type="number" min="0" max="100" step="any" value="' + esc(String(row.pctComplete)) + '" data-f="pct" style="width:58px;font:inherit;font-size:0.8rem;min-height:28px;border:1px solid #d8dee8;border-radius:6px;padding:0.1rem 0.3rem" />' +
          "</div></td>" +
          '<td class="nowrap" data-f="completed">' + esc(money(completed)) + "</td>" +
          '<td class="nowrap" data-f="billed">' + esc(money(billed)) + "</td>" +
          '<td class="nowrap" data-f="thisperiod"><b>' + esc(money(thisPeriod)) + "</b></td>" +
        "</tr>");
        var slider = tr.querySelector('[data-f="slider"]');
        var pctInput = tr.querySelector('[data-f="pct"]');
        function onChange(value) {
          row.pctComplete = Math.max(0, Math.min(100, Number(value) || 0));
          slider.value = String(row.pctComplete);
          pctInput.value = String(row.pctComplete);
          var b = previouslyBilled(row.sovId);
          var c = row.scheduledValue * (row.pctComplete / 100);
          var t = Math.max(0, c - b);
          tr.querySelector('[data-f="completed"]').textContent = money(c);
          tr.querySelector('[data-f="billed"]').textContent = money(b);
          tr.querySelector('[data-f="thisperiod"]').innerHTML = "<b>" + esc(money(t)) + "</b>";
          drawTotals();
        }
        slider.addEventListener("input", function (e) { onChange(e.target.value); });
        pctInput.addEventListener("input", function (e) { onChange(e.target.value); });
        tbody.appendChild(tr);
      });
    }

    function drawTotals() {
      var completedToDate = rowsState.reduce(function (s, r) { return s + r.scheduledValue * (r.pctComplete / 100); }, 0);
      var retainagePct = num(retainageInput.value);
      var retainage = completedToDate * (retainagePct / 100);
      var totalEarnedLessRetainage = completedToDate - retainage;
      var previousCertificates = (ctx.apps || []).reduce(function (s, a) { return s + num((a.totals || {}).currentPaymentDue); }, 0);
      var currentPaymentDue = totalEarnedLessRetainage - previousCertificates;
      totalsBox.innerHTML = '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
        '<div class="kpi"><b>' + esc(money(completedToDate)) + "</b><span>Completed to date</span></div>" +
        '<div class="kpi"><b>' + esc(money(retainage)) + "</b><span>Retainage (" + esc(String(retainagePct)) + "%)</span></div>" +
        '<div class="kpi"><b>' + esc(money(previousCertificates)) + "</b><span>Previous certificates</span></div>" +
        '<div class="kpi" data-accent="green"><b>' + esc(money(currentPaymentDue)) + "</b><span>Current payment due</span></div>" +
      "</div>";
    }

    retainageInput.addEventListener("input", drawTotals);
    drawRows();
    drawTotals();

    card.querySelector('[data-f="cancel"]').addEventListener("click", function () {
      ctx.showNewForm = false;
      refresh(ctx);
    });

    card.querySelector('[data-f="create"]').addEventListener("click", function () {
      var msg = card.querySelector('[data-f="msg"]');
      var periodTo = periodInput.value;
      if (!periodTo) { msg.textContent = "Set the period-ending date first."; return; }
      msg.textContent = "Creating…";
      APP.fetchJSON("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: ctx.project.id,
          periodTo: periodTo,
          retainagePct: num(retainageInput.value),
          rows: rowsState.map(function (r) { return { sovId: r.sovId, pctComplete: r.pctComplete }; })
        })
      }).then(function () {
        APP.toast("Payment application created");
        ctx.showNewForm = false;
        refresh(ctx);
      }).catch(function (err) { msg.textContent = "Create failed: " + err.message; });
    });

    return card;
  }

  /* ──────────────── App card (list item + expandable detail) ──────────────── */

  function buildAppCard(ctx, app) {
    var expanded = ctx.expandedId === app.id;
    var card = APP.el('<div class="card" style="background:#f7f9fc">' +
      '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="min-width:0">' +
          "<b style=\"font-size:0.95rem\">Period ending " + esc(APP.fmtDate(app.periodTo + "T12:00:00")) + "</b> " + statusPill(app.status) +
          '<div class="muted" style="font-size:0.76rem">' + esc(String(app.retainagePct)) + "% retainage · updated " + esc(APP.fmtAgo(app.updatedAt || app.createdAt)) + "</div>" +
        "</div>" +
        '<div style="text-align:right"><div style="font-size:1.15rem;font-weight:900">' + esc(money(app.totals.currentPaymentDue)) + "</div>" +
          '<div class="muted" style="font-size:0.72rem">current payment due</div></div>' +
      "</div>" +
      '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.55rem">' +
        '<button class="btn" type="button" data-f="expand">' + (expanded ? "Hide detail" : "View detail") + "</button>" +
        (app.status === "draft" ? '<button class="btn" type="button" data-f="markSent">Mark sent</button>' : "") +
        (app.status === "sent" ? '<button class="btn" type="button" data-f="markPaid">Mark paid</button>' : "") +
        '<button class="btn" type="button" data-f="delete" style="margin-left:auto;color:#b42318">Delete</button>' +
      "</div>" +
      '<div data-f="detail" style="margin-top:0.7rem"></div>' +
    "</div>");

    card.querySelector('[data-f="expand"]').addEventListener("click", function () {
      ctx.expandedId = expanded ? null : app.id;
      refreshCardOnly();
    });

    function refreshCardOnly() {
      var next = buildAppCard(ctx, app);
      card.replaceWith(next);
    }

    function setStatus(status) {
      APP.fetchJSON("/api/billing/" + encodeURIComponent(app.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status })
      }).then(function () {
        APP.toast("Marked " + status);
        refresh(ctx);
      }).catch(function (err) { APP.toast("Update failed: " + err.message); });
    }

    var sentBtn = card.querySelector('[data-f="markSent"]');
    if (sentBtn) sentBtn.addEventListener("click", function () { setStatus("sent"); });
    var paidBtn = card.querySelector('[data-f="markPaid"]');
    if (paidBtn) paidBtn.addEventListener("click", function () { setStatus("paid"); });

    card.querySelector('[data-f="delete"]').addEventListener("click", function () {
      var warn = app.status === "draft" ? "Delete this draft payment application?" :
        "This payment application is already " + app.status + ". Delete it anyway? This does not un-send any email already sent to the client.";
      if (!window.confirm(warn)) return;
      APP.fetchJSON("/api/billing/" + encodeURIComponent(app.id), { method: "DELETE" }).then(function () {
        APP.toast("Payment application deleted");
        if (ctx.expandedId === app.id) ctx.expandedId = null;
        refresh(ctx);
      }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
    });

    if (expanded) card.querySelector('[data-f="detail"]').appendChild(buildAppDetail(ctx, app));
    return card;
  }

  function g703RowsHtml(app) {
    return (app.rows || []).map(function (r) {
      return "<tr><td>" + esc(r.description) + '</td><td class="num">' + esc(money(r.scheduledValue)) +
        '</td><td class="num">' + esc(String(r.pctComplete)) + '%</td><td class="num">' + esc(money(r.completedToDate)) +
        '</td><td class="num">' + esc(money(r.previouslyBilled)) + '</td><td class="num">' + esc(money(r.thisPeriod)) + "</td></tr>";
    }).join("");
  }

  function buildAppDetail(ctx, app) {
    var wrap = APP.el("<div></div>");

    wrap.appendChild(APP.el('<div class="tablewrap" style="max-height:none"><table class="table"><thead><tr>' +
      "<th>Description</th><th>Scheduled value</th><th>% complete</th><th>Completed to date</th><th>Previously billed</th><th>This period</th>" +
      "</tr></thead><tbody>" + g703RowsHtml(app) + "</tbody></table></div>"));

    var t = app.totals;
    var summary = APP.el('<div class="card" style="margin-top:0.6rem">' +
      "<h2>Application summary (G702)</h2>" +
      '<div style="display:grid;gap:0.3rem;font-size:0.86rem;max-width:420px">' +
        line("Original contract sum", ctx.project.contractPrice) +
        line("Scheduled value (this schedule)", t.scheduledValue) +
        line("Total completed &amp; stored to date", t.completedToDate) +
        line("Retainage (" + esc(String(app.retainagePct)) + "%)", -t.retainage) +
        line("Total earned less retainage", t.totalEarnedLessRetainage) +
        line("Less previous certificates for payment", -t.previousCertificates) +
        '<div style="display:flex;justify-content:space-between;border-top:2px solid #172033;padding-top:0.35rem;font-weight:900;font-size:1rem">' +
          "<span>CURRENT PAYMENT DUE</span><span>" + esc(money(t.currentPaymentDue)) + "</span></div>" +
        line("Balance to finish", t.balanceToFinish) +
      "</div>" +
    "</div>");
    wrap.appendChild(summary);

    function line(label, value) {
      return '<div style="display:flex;justify-content:space-between"><span class="muted">' + esc(label) + "</span><span>" + esc(money(value)) + "</span></div>";
    }

    var actions = APP.el('<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem">' +
      '<button class="btn primary" type="button" data-f="print">Print pay app</button>' +
    "</div>");
    actions.querySelector('[data-f="print"]').addEventListener("click", function () { printPayApp(ctx, app); });
    wrap.appendChild(actions);

    wrap.appendChild(buildWaiverPanel(ctx, app));
    return wrap;
  }

  function printPayApp(ctx, app) {
    var t = app.totals;
    var html = printHeaderHtml(ctx.project, "Application for Payment") +
      '<div style="font-size:0.84rem;color:#3c4658;margin-bottom:0.8rem">Period ending ' + esc(APP.fmtDate(app.periodTo + "T12:00:00")) +
        " · Retainage " + esc(String(app.retainagePct)) + "%</div>" +
      "<table><thead><tr><th>Description</th><th class=\"num\">Scheduled value</th><th class=\"num\">% complete</th><th class=\"num\">Completed to date</th><th class=\"num\">Previously billed</th><th class=\"num\">This period</th></tr></thead>" +
      "<tbody>" + g703RowsHtml(app) + "</tbody></table>" +
      '<div style="display:grid;gap:0.25rem;font-size:0.88rem;max-width:420px;margin-top:1rem;margin-left:auto">' +
        '<div style="display:flex;justify-content:space-between"><span>Original contract sum</span><span>' + esc(money(ctx.project.contractPrice)) + "</span></div>" +
        '<div style="display:flex;justify-content:space-between"><span>Total completed &amp; stored to date</span><span>' + esc(money(t.completedToDate)) + "</span></div>" +
        '<div style="display:flex;justify-content:space-between"><span>Retainage</span><span>-' + esc(money(t.retainage)) + "</span></div>" +
        '<div style="display:flex;justify-content:space-between"><span>Total earned less retainage</span><span>' + esc(money(t.totalEarnedLessRetainage)) + "</span></div>" +
        '<div style="display:flex;justify-content:space-between"><span>Less previous certificates for payment</span><span>-' + esc(money(t.previousCertificates)) + "</span></div>" +
        '<div style="display:flex;justify-content:space-between;border-top:2px solid #172033;padding-top:0.3rem;font-weight:900">' +
          "<span>CURRENT PAYMENT DUE</span><span>" + esc(money(t.currentPaymentDue)) + "</span></div>" +
        '<div style="display:flex;justify-content:space-between"><span>Balance to finish</span><span>' + esc(money(t.balanceToFinish)) + "</span></div>" +
      "</div>" +
      '<div style="margin-top:2rem;display:flex;justify-content:space-between;font-size:0.8rem">' +
        '<div>Contractor signature: ______________________</div><div>Date: __________</div></div>';
    doPrint(html);
  }

  /* ──────────────── Waivers ──────────────── */

  function buildWaiverPanel(ctx, app) {
    var card = APP.el('<div class="card" style="margin-top:0.6rem">' +
      "<h2>Lien waivers (California Civil Code)</h2>" +
      '<div style="display:flex;gap:0.4rem;flex-wrap:wrap">' +
        WAIVER_TYPES.map(function (w) { return '<button class="btn" type="button" data-w="' + esc(w.value) + '">' + esc(w.label) + "</button>"; }).join("") +
      "</div>" +
      '<div data-f="preview" style="margin-top:0.6rem"></div>' +
    "</div>");

    var preview = card.querySelector('[data-f="preview"]');
    card.querySelectorAll("[data-w]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        preview.innerHTML = "";
        preview.appendChild(loadingEl("Loading waiver text"));
        APP.fetchJSON("/api/billing/" + encodeURIComponent(app.id) + "/waiver?type=" + encodeURIComponent(btn.getAttribute("data-w")))
          .then(function (waiver) {
            preview.innerHTML = "";
            var box = APP.el('<div style="border-top:1px dashed #d8dee8;padding-top:0.6rem">' +
              "<b style=\"font-size:0.88rem\">" + esc(waiver.title) + "</b>" +
              '<pre style="white-space:pre-wrap;font-family:inherit;font-size:0.8rem;background:#fff;border:1px solid #d8dee8;border-radius:8px;padding:0.7rem;margin-top:0.4rem;max-height:360px;overflow:auto" data-f="body">' + esc(waiver.body) + "</pre>" +
              '<div style="margin-top:0.4rem"><button class="btn primary" type="button" data-f="printwaiver">Print waiver</button></div>' +
            "</div>");
            box.querySelector('[data-f="printwaiver"]').addEventListener("click", function () {
              var html = printHeaderHtml(ctx.project, "Lien Waiver") +
                "<h1 style=\"font-size:1.05rem;margin-bottom:0.8rem\">" + esc(waiver.title) + "</h1>" +
                '<div style="white-space:pre-wrap;font-size:0.85rem;line-height:1.6">' + esc(waiver.body) + "</div>";
              doPrint(html);
            });
            preview.appendChild(box);
          }).catch(function (err) {
            preview.innerHTML = "";
            preview.appendChild(APP.el('<div class="empty"><b>Couldn’t load waiver</b>' + esc(err.message) + "</div>"));
          });
      });
    });
    return card;
  }

  APP.registerView("billing", { title: "Billing", render: renderBilling });
})();
