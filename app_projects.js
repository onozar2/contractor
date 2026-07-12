/* app_projects.js — Projects hub (Agent C)
   Registers the "projects" view on the APP shell (app.html).

   List  (#/projects)  : two groups on one page, switched by chips —
                         "Jobs" (real projects from /api/actuals) and
                         "Potential" (scoped/bid work from /api/bid-projects + /api/estimates).
   Job detail   (#/projects/:id)       : one scrollable page, no tabs —
                         money header → description (+ AI line-item draft) → costs
                         → photos → change orders → RFQs.
   Potential detail (#/projects/bid:ID | est:ID) : read-mostly value/quotes/scope page
                         with "Won → make it a job" + deep-tool links.

   Uses ONLY the shell's CSS classes + small inline layout styles. */
(function () {
  "use strict";

  var PHASES = ["pre-work", "demo", "rough-in", "inspection", "finish", "final", "other"];
  var JOB_STATUSES = [
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
    { value: "on_hold", label: "On hold" }
  ];
  var JOB_STATUS_PILL = { active: "green", completed: "plum", on_hold: "amber" };
  var CO_STATUS_PILL = { draft: "", sent: "amber", approved: "green", declined: "red", void: "" };
  var RECIPIENT_PILL = { sent: "", viewed: "plum", responded: "green", declined: "red" };

  var INPUT = 'style="font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;' +
    'border-radius:7px;padding:0.25rem 0.55rem;background:#fff;color:#172033;width:100%"';
  var ROW = 'style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end"';
  var FIELD = 'style="display:grid;gap:0.2rem;flex:1 1 160px;min-width:0"';
  var FIELD_SM = 'style="display:grid;gap:0.2rem;flex:0 1 110px;min-width:0"';
  var LABEL = 'style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587"';

  // ── shared caches (fetched once per page load, invalidated on writes) ──
  var photofeedAllPromise = null;   // GET /api/photofeed — list photo counts
  var costbookPromise = null;       // GET /api/estimator/costbook — add-cost datalist
  var subNamesPromise = null;       // GET /api/subcontractors — sub-name datalist

  function getPhotofeedAll() {
    if (!photofeedAllPromise) {
      photofeedAllPromise = APP.fetchJSON("/api/photofeed").catch(function () {
        photofeedAllPromise = null;
        return null; // photo counts are decoration; never break the list on this
      });
    }
    return photofeedAllPromise;
  }

  function getCostbook() {
    if (!costbookPromise) {
      costbookPromise = APP.fetchJSON("/api/estimator/costbook").catch(function () {
        costbookPromise = null;
        return null;
      });
    }
    return costbookPromise;
  }

  function getSubNames() {
    if (!subNamesPromise) {
      subNamesPromise = APP.fetchJSON("/api/subcontractors").then(function (rows) {
        var names = [];
        var seen = {};
        (rows || []).forEach(function (row) {
          var name = (row && row.companyName ? String(row.companyName) : "").trim();
          if (name && !seen[name]) { seen[name] = true; names.push(name); }
        });
        return names.sort();
      }).catch(function () {
        subNamesPromise = null;
        return [];
      });
    }
    return subNamesPromise;
  }

  // ── helpers ──
  function esc(v) { return APP.esc(v); }

  function slugify(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function num(v) { return Number(v) || 0; }

  function actualCostOf(record) {
    if (record.actualCost !== undefined && record.actualCost !== null) return num(record.actualCost);
    return (record.lines || []).reduce(function (sum, line) { return sum + num(line.actualTotal); }, 0);
  }

  function marginOf(record) {
    var price = num(record.contractPrice);
    var cost = actualCostOf(record);
    var overhead = num(record.overheadCost);
    var margin = price - cost - overhead;
    return { price: price, cost: cost, overhead: overhead, margin: margin,
      pct: price ? Math.round((margin / price) * 100) : 0 };
  }

  function jobStatusOf(record) {
    var s = String(record.status || "active");
    return JOB_STATUS_PILL[s] !== undefined ? s : "active";
  }

  function jobStatusPill(status) {
    var label = (JOB_STATUSES.filter(function (s) { return s.value === status; })[0] || {}).label || status;
    return '<span class="pill ' + (JOB_STATUS_PILL[status] || "") + '">' + esc(label) + "</span>";
  }

  function copyText(text) {
    function fallback() {
      var input = document.createElement("textarea");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      try { document.execCommand("copy"); APP.toast("Copied to clipboard"); }
      catch (_e) { APP.toast("Copy failed — select the text manually"); }
      input.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { APP.toast("Copied to clipboard"); }, fallback);
    } else fallback();
  }

  function loadingEl(label) {
    return APP.el('<div class="loading">' + esc(label || "Loading") + "</div>");
  }

  function errorEl(message, retry) {
    var node = APP.el('<div class="empty"><b>Couldn’t load</b>' + esc(message || "Unknown error") +
      '<div style="margin-top:0.7rem"><button class="btn primary" type="button">Retry</button></div></div>');
    node.querySelector("button").addEventListener("click", retry);
    return node;
  }

  // Partial PUT — the server merges onto the stored actuals doc, so we only send
  // the fields we changed and it re-derives actualCost / grossMargin / marginPercent.
  function putProject(record, patch) {
    return APP.fetchJSON("/api/actuals/" + encodeURIComponent(record.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch || {})
    }).then(function (updated) {
      Object.keys(updated || {}).forEach(function (key) { record[key] = updated[key]; });
      return record;
    });
  }

  /* ── value math for potential (bid / estimate) records ── */

  function bidValue(bid) {
    if (num(bid.finalProposalAmount)) return num(bid.finalProposalAmount);
    if (num(bid.budgetHigh)) return num(bid.budgetHigh);
    var lineHigh = (bid.lineItems || []).reduce(function (sum, li) { return sum + num(li.highCost); }, 0);
    if (lineHigh) return lineHigh;
    return num(bid.internalEstimatedCost);
  }

  function bidQuoteCounts(bid) {
    var quotes = bid.subQuotes || [];
    var received = quotes.filter(function (q) {
      return q.receivedAt || /received|validated|accepted/i.test(String(q.status || ""));
    }).length;
    return { received: received, total: quotes.length };
  }

  function estValue(est) {
    var lines = est.lines || [];
    var mid = lines.reduce(function (sum, l) {
      return sum + num(l.qty) * ((num(l.unitLow) + num(l.unitHigh)) / 2);
    }, 0);
    var withContingency = mid * (1 + num(est.contingencyPercent) / 100);
    return Math.round(withContingency * (1 + num(est.markupPercent) / 100));
  }

  function estRange(est) {
    var lines = est.lines || [];
    var low = lines.reduce(function (s, l) { return s + num(l.qty) * num(l.unitLow); }, 0);
    var high = lines.reduce(function (s, l) { return s + num(l.qty) * num(l.unitHigh); }, 0);
    return { low: Math.round(low), high: Math.round(high) };
  }

  function bidName(bid) {
    var parts = [];
    if (bid.projectType) parts.push(bid.projectType);
    if (bid.customerName) parts.push(bid.customerName);
    return parts.join(" — ") || bid.projectName || bid.customerName || "Untitled bid";
  }

  /* Build the new-job body from a potential record and POST it. */
  function wonToJob(kind, rec) {
    var body = { status: "active", lines: [] };
    if (kind === "bid") {
      body.projectName = bidName(rec);
      body.projectType = rec.projectType || "";
      body.city = rec.city || "";
      body.description = rec.scopeDraft || "";
      body.contractPrice = bidValue(rec);
      body.bidProjectId = rec.id;
    } else {
      body.projectName = rec.title || "Untitled estimate";
      body.projectType = rec.projectType || "";
      body.city = rec.address || "";
      body.description = rec.description || "";
      body.contractPrice = estValue(rec);
      body.estimateId = rec.id;
    }
    return APP.fetchJSON("/api/actuals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  /* ════════════════════ LIST VIEW ════════════════════ */

  function renderList(container) {
    container.innerHTML = "";
    var head = APP.el('<div class="viewhead"><h1>Projects</h1>' +
      '<button class="btn primary" type="button" id="pjNew">+ New job</button></div>');
    container.appendChild(head);

    var chips = APP.el('<div class="chips" style="margin:0.4rem 0 0.2rem">' +
      '<button class="chip active" type="button" data-group="jobs">Jobs</button>' +
      '<button class="chip" type="button" data-group="potential">Potential</button>' +
    "</div>");
    container.appendChild(chips);

    var formSlot = APP.el("<div></div>");
    container.appendChild(formSlot);

    var body = APP.el("<div></div>");
    body.appendChild(loadingEl("Loading projects"));
    container.appendChild(body);

    var state = { group: "jobs", jobs: null, potential: null, entries: null };

    head.querySelector("#pjNew").addEventListener("click", function () {
      if (formSlot.firstChild) { formSlot.innerHTML = ""; return; }
      formSlot.appendChild(buildNewProjectForm(function () { formSlot.innerHTML = ""; }));
    });

    chips.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-group]");
      if (!chip) return;
      state.group = chip.getAttribute("data-group");
      chips.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("active", c.getAttribute("data-group") === state.group);
      });
      draw();
    });

    function draw() {
      body.innerHTML = "";
      if (state.group === "jobs") drawJobs(body, state.jobs, state.entries);
      else drawPotential(body, state.potential);
    }

    Promise.all([
      APP.fetchJSON("/api/actuals"),
      APP.fetchJSON("/api/bid-projects").catch(function () { return []; }),
      APP.fetchJSON("/api/estimates").catch(function () { return []; }),
      getPhotofeedAll()
    ]).then(function (results) {
      state.jobs = results[0] || [];
      var bids = (results[1] || []).map(function (b) { return { kind: "bid", rec: b }; });
      var ests = (results[2] || []).map(function (e) { return { kind: "est", rec: e }; });
      state.potential = bids.concat(ests);
      state.entries = results[3];
      chips.querySelector('[data-group="jobs"]').textContent = "Jobs (" + state.jobs.length + ")";
      chips.querySelector('[data-group="potential"]').textContent = "Potential (" + state.potential.length + ")";
      draw();
    }).catch(function (err) {
      body.innerHTML = "";
      body.appendChild(errorEl(err.message, function () { renderList(container); }));
    });
  }

  function photoCountFor(record, entries) {
    if (!Array.isArray(entries)) return null;
    var slug = slugify(record.projectName);
    return entries.filter(function (entry) {
      return entry.projectId === record.id || (slug && entry.projectId === slug);
    }).length;
  }

  function drawJobs(body, jobs, entries) {
    if (!jobs || !jobs.length) {
      body.appendChild(APP.el('<div class="empty"><b>No jobs yet</b>' +
        "Start one with “+ New job”, or mark a Potential item as won to turn it into a job.</div>"));
      return;
    }
    var grid = APP.el('<div class="attn"></div>');
    jobs.forEach(function (record) {
      var m = marginOf(record);
      var photos = photoCountFor(record, entries);
      var card = APP.el('<div class="card" style="cursor:pointer" role="link" tabindex="0">' +
        '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:flex-start">' +
          '<b style="font-size:0.95rem;min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(record.projectName) + "</b>" +
          jobStatusPill(jobStatusOf(record)) +
        "</div>" +
        '<div style="display:flex;gap:0.9rem;flex-wrap:wrap;margin:0.4rem 0 0.15rem">' +
          '<div><div ' + LABEL + ">Price</div><b style=\"font-size:1.1rem;font-weight:900\">" + esc(APP.fmtMoney(m.price)) + "</b></div>" +
          '<div><div ' + LABEL + ">Margin</div><b style=\"font-size:1.1rem;font-weight:900;color:" + (m.margin < 0 ? "#b42318" : "#0f766e") + '">' + esc(APP.fmtMoney(m.margin)) + "</b></div>" +
        "</div>" +
        '<div class="muted" style="font-size:0.76rem">' +
          esc(String((record.lines || []).length)) + " cost line" + ((record.lines || []).length === 1 ? "" : "s") +
          " · " + (photos === null ? "photos —" : esc(String(photos)) + " photo" + (photos === 1 ? "" : "s")) +
          " · updated " + esc(APP.fmtAgo(record.updatedAt || record.createdAt)) +
        "</div>" +
      "</div>");
      function go() { APP.navigate("#/projects/" + encodeURIComponent(record.id)); }
      card.addEventListener("click", go);
      card.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  function drawPotential(body, potential) {
    if (!potential || !potential.length) {
      body.appendChild(APP.el('<div class="empty"><b>Nothing in the pipeline</b>' +
        'Scoped estimates and bids show here. Draft one in <a href="estimator.html">Estimator</a> or <a href="bid_lab.html">Bid Lab</a>.</div>'));
      return;
    }
    var grid = APP.el('<div class="attn"></div>');
    potential.forEach(function (item) {
      var rec = item.rec;
      var isBid = item.kind === "bid";
      var name = isBid ? bidName(rec) : (rec.title || "Untitled estimate");
      var value = isBid ? bidValue(rec) : estValue(rec);
      var status = isBid ? (rec.status || "intake") : (rec.status || "draft");
      var meta = isBid
        ? (function () { var q = bidQuoteCounts(rec); return q.total ? q.received + " of " + q.total + " quotes in" : "no quotes yet"; })()
        : ((rec.lines || []).length + " scope line" + ((rec.lines || []).length === 1 ? "" : "s"));
      var hid = "#/projects/" + encodeURIComponent((isBid ? "bid:" : "est:") + rec.id);
      var card = APP.el('<div class="card">' +
        '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:flex-start">' +
          '<b style="font-size:0.95rem;min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(name) + "</b>" +
          '<span class="pill ' + (isBid ? "amber" : "") + '">' + esc(isBid ? "bid" : "estimate") + "</span>" +
        "</div>" +
        '<div style="font-size:1.25rem;font-weight:900;margin:0.35rem 0 0.15rem">' + esc(APP.fmtMoney(value)) + "</div>" +
        '<div class="muted" style="font-size:0.76rem">' +
          '<span class="pill" style="margin-right:0.4rem">' + esc(status) + "</span>" + esc(meta) +
        "</div>" +
        '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.6rem">' +
          '<a class="btn" href="' + hid + '" style="text-decoration:none">Open</a>' +
          '<button class="btn primary" type="button" data-f="won">Won → make it a job</button>' +
        "</div>" +
      "</div>");
      card.querySelector('[data-f="won"]').addEventListener("click", function (ev) {
        var btn = ev.currentTarget;
        btn.disabled = true;
        wonToJob(item.kind, rec).then(function (created) {
          APP.toast("Job created from " + (isBid ? "bid" : "estimate"));
          APP.navigate("#/projects/" + encodeURIComponent(created.id));
        }).catch(function (err) { btn.disabled = false; APP.toast("Couldn’t create job: " + err.message); });
      });
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  function buildNewProjectForm(onDone) {
    var card = APP.el('<div class="card"><h2>New job</h2>' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD + '><span ' + LABEL + ">Project name</span><input " + INPUT + ' type="text" data-f="name" placeholder="e.g. Sherman Oaks kitchen remodel" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Price to customer $</span><input " + INPUT + ' data-f="price" type="number" min="0" step="any" placeholder="0" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Status</span><select " + INPUT + ' data-f="status">' +
          JOB_STATUSES.map(function (s) { return '<option value="' + esc(s.value) + '">' + esc(s.label) + "</option>"; }).join("") +
        "</select></label>" +
        '<button class="btn primary" type="button" data-f="create">Create</button>' +
        '<button class="btn" type="button" data-f="cancel">Cancel</button>' +
      "</div>" +
      '<div class="footline" data-f="msg"></div>' +
    "</div>");
    var msg = card.querySelector('[data-f="msg"]');
    card.querySelector('[data-f="cancel"]').addEventListener("click", onDone);
    card.querySelector('[data-f="create"]').addEventListener("click", function () {
      var name = card.querySelector('[data-f="name"]').value.trim();
      var status = card.querySelector('[data-f="status"]').value;
      var price = Number(card.querySelector('[data-f="price"]').value || 0);
      if (!name) { msg.textContent = "Give the job a name first."; return; }
      msg.textContent = "Creating…";
      APP.fetchJSON("/api/actuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: name, status: status, contractPrice: price, lines: [] })
      }).then(function (created) {
        APP.toast("Job created");
        onDone();
        APP.navigate("#/projects/" + encodeURIComponent(created.id));
      }).catch(function (err) { msg.textContent = "Create failed: " + err.message; });
    });
    return card;
  }

  /* ════════════════════ ROUTER ════════════════════ */

  function renderDetail(container, id) {
    if (id.indexOf("bid:") === 0) return renderPotentialDetail(container, "bid", id.slice(4));
    if (id.indexOf("est:") === 0) return renderPotentialDetail(container, "est", id.slice(4));
    return renderJobDetail(container, id);
  }

  /* ════════════════════ JOB DETAIL ════════════════════ */

  function renderJobDetail(container, id) {
    container.innerHTML = "";
    container.appendChild(loadingEl("Loading job"));
    APP.fetchJSON("/api/actuals").then(function (projects) {
      var record = (projects || []).find(function (p) { return p.id === id; });
      container.innerHTML = "";
      if (!record) {
        container.appendChild(APP.el('<div class="empty"><b>Job not found</b>' +
          'It may have been deleted. <a href="#/projects">Back to projects</a>.</div>'));
        return;
      }
      buildJobDetail(container, record);
    }).catch(function (err) {
      container.innerHTML = "";
      container.appendChild(errorEl(err.message, function () { renderJobDetail(container, id); }));
    });
  }

  function buildJobDetail(container, record) {
    var ctx = { record: record, pfProjectId: null, container: container };

    /* header */
    var head = APP.el('<div class="viewhead">' +
      '<div style="min-width:0">' +
        '<div class="muted" style="font-size:0.76rem"><a href="#/projects" style="text-decoration:none">← Projects</a></div>' +
        '<h1 style="overflow:hidden;text-overflow:ellipsis">' + esc(record.projectName) + "</h1>" +
        (record.city ? '<div class="muted" style="font-size:0.78rem">' + esc(record.city) + "</div>" : "") +
      "</div>" +
      '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">' +
        '<a class="btn" href="#/takeoff" title="Measure quantities off a plan image">📐 Takeoff</a>' +
        '<a class="btn" href="#/billing/' + esc(record.id) + '" title="Progress billing (G702/G703) + lien waivers">🧾 Billing</a>' +
        '<a class="btn" href="#/permits/' + esc(record.id) + '" title="Permits & inspections for this job">🏛️ Permits</a>' +
        '<select ' + INPUT.replace('width:100%"', 'width:auto"') + ' data-f="status" title="Job status">' +
          JOB_STATUSES.map(function (s) {
            return '<option value="' + esc(s.value) + '"' + (jobStatusOf(record) === s.value ? " selected" : "") + ">" + esc(s.label) + "</option>";
          }).join("") +
        "</select>" +
      "</div>" +
    "</div>");
    container.appendChild(head);
    head.querySelector('[data-f="status"]').addEventListener("change", function (e) {
      var next = e.target.value;
      putProject(record, { status: next }).then(function () {
        APP.toast("Status set to " + next);
      }).catch(function (err) { APP.toast("Save failed: " + err.message); });
    });

    /* money tiles */
    var moneySlot = APP.el('<div style="margin:0.6rem 0"></div>');
    container.appendChild(moneySlot);
    ctx.renderMoney = function () { renderMoney(ctx, moneySlot); };
    ctx.renderMoney();

    /* schedule (Gantt) */
    if (window.GANTT) {
      var scheduleSlot = APP.el('<div style="margin-bottom:0.9rem"></div>');
      container.appendChild(scheduleSlot);
      GANTT.renderProjectSchedule(scheduleSlot, record, function (patch) {
        return putProject(record, patch);
      });
    }

    /* description + AI draft */
    var descSlot = APP.el('<div style="margin-bottom:0.9rem"></div>');
    container.appendChild(descSlot);
    renderDescription(ctx, descSlot);

    /* costs */
    var costsSlot = APP.el('<div style="margin-bottom:0.9rem"></div>');
    container.appendChild(costsSlot);
    ctx.renderCosts = function () { renderCosts(ctx, costsSlot); };
    ctx.renderCosts();

    /* photos */
    var photosSlot = APP.el('<div style="margin-bottom:0.9rem"></div>');
    container.appendChild(photosSlot);
    renderPhotos(ctx, photosSlot);

    /* change orders */
    var coSlot = APP.el('<div style="margin-bottom:0.9rem"></div>');
    container.appendChild(coSlot);
    renderChangeOrders(ctx, coSlot);

    /* RFQs */
    var rfqSlot = APP.el("<div></div>");
    container.appendChild(rfqSlot);
    renderRfqs(ctx, rfqSlot);
  }

  /* ──────────────── Money header ──────────────── */

  function renderMoney(ctx, slot) {
    var m = marginOf(ctx.record);
    slot.innerHTML = "";
    var accent = m.margin < 0 ? "red" : "green";
    var tiles = APP.el('<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
      '<div class="kpi"><span>Price to customer</span>' +
        '<input data-f="price" type="number" min="0" step="any" value="' + esc(String(m.price || 0)) + '" ' +
        'style="font:inherit;font-size:1.3rem;font-weight:900;width:100%;border:1px solid #d8dee8;border-radius:7px;padding:0.15rem 0.4rem;background:#fff;color:#172033" /></div>' +
      '<div class="kpi"><b>' + esc(APP.fmtMoney(m.cost)) + "</b><span>My cost · " +
        esc(String((ctx.record.lines || []).length)) + " line" + ((ctx.record.lines || []).length === 1 ? "" : "s") + "</span></div>" +
      '<div class="kpi"><span>Overhead</span>' +
        '<input data-f="overhead" type="number" min="0" step="any" value="' + esc(String(m.overhead || 0)) + '" ' +
        'style="font:inherit;font-size:1.3rem;font-weight:900;width:100%;border:1px solid #d8dee8;border-radius:7px;padding:0.15rem 0.4rem;background:#fff;color:#172033" /></div>' +
      '<div class="kpi" data-accent="' + accent + '"><b>' + esc(APP.fmtMoney(m.margin)) + "</b><span>Margin · " +
        esc(String(m.pct)) + "%</span></div>" +
    "</div>");

    function bind(field, key) {
      var input = tiles.querySelector('[data-f="' + field + '"]');
      input.addEventListener("blur", function () {
        var patch = {};
        patch[key] = Number(input.value || 0);
        if (Number(ctx.record[key] || 0) === patch[key]) return;
        putProject(ctx.record, patch).then(function () {
          ctx.renderMoney();
          APP.toast("Saved");
        }).catch(function (err) { APP.toast("Save failed: " + err.message); });
      });
    }
    bind("price", "contractPrice");
    bind("overhead", "overheadCost");
    slot.appendChild(tiles);
  }

  /* ──────────────── Description + AI line-item draft ──────────────── */

  function renderDescription(ctx, slot) {
    slot.innerHTML = "";
    var card = APP.el('<div class="card"><h2>The job</h2>' +
      '<textarea data-f="desc" placeholder="Describe the job — what are we doing?" ' +
        'style="font:inherit;font-size:0.86rem;width:100%;min-height:88px;border:1px solid #d8dee8;border-radius:8px;padding:0.5rem 0.6rem;background:#fff;color:#172033;resize:vertical">' +
        esc(ctx.record.description || "") + "</textarea>" +
      '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.5rem">' +
        '<button class="btn" type="button" data-f="gen">✦ Generate line items</button>' +
        '<span class="footline" data-f="msg">Saves as you click away. Generate turns this into draft cost lines.</span>' +
      "</div>" +
      '<div data-f="draft"></div>' +
    "</div>");

    var textarea = card.querySelector('[data-f="desc"]');
    textarea.addEventListener("blur", function () {
      var next = textarea.value;
      if ((ctx.record.description || "") === next) return;
      putProject(ctx.record, { description: next }).catch(function (err) { APP.toast("Save failed: " + err.message); });
    });

    var msg = card.querySelector('[data-f="msg"]');
    var draftSlot = card.querySelector('[data-f="draft"]');
    card.querySelector('[data-f="gen"]').addEventListener("click", function () {
      var scope = textarea.value.trim();
      if (!scope) { msg.textContent = "Write a description first."; return; }
      // persist description before drafting so it isn't lost
      if ((ctx.record.description || "") !== textarea.value) putProject(ctx.record, { description: textarea.value }).catch(function () {});
      msg.textContent = "Drafting line items…";
      draftSlot.innerHTML = "";
      APP.fetchJSON("/api/estimator/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: scope, scope: scope })
      }).then(function (draft) {
        msg.textContent = "Pick the lines to add.";
        renderDraft(ctx, draftSlot, draft);
      }).catch(function (err) {
        msg.textContent = "";
        draftSlot.innerHTML = "";
        draftSlot.appendChild(APP.el('<div class="empty"><b>Couldn’t draft</b>' + esc(err.message) + "</div>"));
      });
    });
    slot.appendChild(card);
  }

  function renderDraft(ctx, slot, draft) {
    slot.innerHTML = "";
    var lines = draft.lines || [];
    if (!lines.length) {
      slot.appendChild(APP.el('<div class="footline" style="margin-top:0.5rem">The model returned no line items — try a fuller description.</div>'));
      return;
    }
    function midEst(line) { return num(line.qty) * ((num(line.unitLow) + num(line.unitHigh)) / 2); }

    var rows = lines.map(function (line, index) {
      return '<label style="display:flex;gap:0.55rem;align-items:flex-start;padding:0.4rem 0;border-top:1px solid #eef2f6">' +
        '<input type="checkbox" data-i="' + index + '" checked style="margin-top:0.2rem" />' +
        '<span style="min-width:0;flex:1 1 auto">' +
          "<b style=\"font-size:0.84rem\">" + esc(line.description || "(no description)") + "</b>" +
          (line.trade ? ' <span class="pill">' + esc(line.trade) + "</span>" : "") +
          '<div class="muted" style="font-size:0.74rem">est ' + esc(APP.fmtMoney(midEst(line))) +
            " · " + esc(String(line.qty || 1)) + " " + esc(line.unit || "job") +
            (line.notes ? " · " + esc(line.notes) : "") + "</div>" +
        "</span>" +
      "</label>";
    }).join("");

    var box = APP.el('<div class="card" style="margin-top:0.6rem;background:#f7f9fc"><h2>Drafted line items</h2>' +
      rows +
      '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.6rem">' +
        '<button class="btn primary" type="button" data-f="add">Add selected</button>' +
        '<button class="btn" type="button" data-f="dismiss">Dismiss</button>' +
        '<span class="footline" data-f="dmsg"></span>' +
      "</div>" +
      ((draft.assumptions || []).length ? '<div class="muted" style="font-size:0.76rem;margin-top:0.6rem"><b>Assumptions:</b> ' +
        esc((draft.assumptions || []).join(" · ")) + "</div>" : "") +
      ((draft.questions || []).length ? '<div class="muted" style="font-size:0.76rem;margin-top:0.25rem"><b>Confirm on walkthrough:</b> ' +
        esc((draft.questions || []).join(" · ")) + "</div>" : "") +
    "</div>");

    box.querySelector('[data-f="dismiss"]').addEventListener("click", function () { slot.innerHTML = ""; });
    box.querySelector('[data-f="add"]').addEventListener("click", function () {
      var dmsg = box.querySelector('[data-f="dmsg"]');
      var chosen = [];
      box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        if (cb.checked) chosen.push(lines[Number(cb.getAttribute("data-i"))]);
      });
      if (!chosen.length) { dmsg.textContent = "Tick at least one line."; return; }
      var newLines = chosen.map(function (line) {
        return {
          costbookId: line.costbookId || "",
          description: line.description || "",
          trade: line.trade || "",
          qty: num(line.qty) || 1,
          unit: line.unit || "job",
          actualTotal: 0,
          notes: "est " + APP.fmtMoney(midEst(line))
        };
      });
      dmsg.textContent = "Adding…";
      putProject(ctx.record, { lines: (ctx.record.lines || []).concat(newLines) }).then(function () {
        APP.toast(newLines.length + " line" + (newLines.length === 1 ? "" : "s") + " added");
        slot.innerHTML = "";
        ctx.renderCosts();
        ctx.renderMoney();
      }).catch(function (err) { dmsg.textContent = "Add failed: " + err.message; });
    });
    slot.appendChild(box);
  }

  /* ──────────────── Costs (simplified list) ──────────────── */

  function renderCosts(ctx, slot) {
    slot.innerHTML = "";
    slot.appendChild(loadingEl("Loading costs"));
    Promise.all([getCostbook(), getSubNames()]).then(function (results) {
      var book = results[0];
      var subNames = results[1] || [];
      slot.innerHTML = "";

      var record = ctx.record;
      var lines = record.lines || [];
      var subListId = "pjSubs";
      var bookListId = "pjCostbook";
      var bookItems = book && Array.isArray(book.items) ? book.items : [];
      var byLabel = {};
      var bookOptions = bookItems.map(function (item) {
        var label = item.service + " — " + item.description;
        byLabel[label] = item;
        return '<option value="' + esc(label) + '"></option>';
      }).join("");

      var card = APP.el('<div class="card"><h2>Costs</h2>' +
        '<datalist id="' + subListId + '">' + subNames.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join("") + "</datalist>" +
        '<datalist id="' + bookListId + '">' + bookOptions + "</datalist>" +
        '<div data-f="rows" style="display:grid;gap:0.4rem"></div>' +
        '<div data-f="addwrap" style="margin-top:0.6rem"></div>' +
        '<div class="footline" style="margin-top:0.5rem">These costs feed your margin and the cost book. Descriptions save when you click away.</div>' +
      "</div>");
      var rowsBox = card.querySelector('[data-f="rows"]');

      if (!lines.length) {
        rowsBox.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>No costs yet</b>' +
          "Add what you’re paying, line by line — or use “Generate line items” up top.</div>"));
      } else {
        lines.forEach(function (line, index) { rowsBox.appendChild(buildCostRow(ctx, index, subListId)); });
      }

      card.querySelector('[data-f="addwrap"]').appendChild(buildAddCostRow(ctx, subListId, bookListId, byLabel));
      slot.appendChild(card);
    }).catch(function (err) {
      slot.innerHTML = "";
      slot.appendChild(errorEl(err.message, function () { ctx.renderCosts(); }));
    });
  }

  function costRowStyle() {
    return 'style="font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033"';
  }

  // Persist one field of an existing line by index, preserving qty/unit/costbookId.
  function saveLineField(ctx, index, key, value) {
    var lines = (ctx.record.lines || []).map(function (l, i) {
      if (i !== index) return l;
      var copy = {
        costbookId: l.costbookId || "",
        trade: l.trade || "",
        description: l.description || "",
        qty: num(l.qty) || 1,
        unit: l.unit || "job",
        actualTotal: num(l.actualTotal),
        subName: l.subName || "",
        notes: l.notes || ""
      };
      copy[key] = value;
      return copy;
    });
    return putProject(ctx.record, { lines: lines });
  }

  function buildCostRow(ctx, index, subListId) {
    var line = (ctx.record.lines || [])[index] || {};
    var row = APP.el('<div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">' +
      '<input data-k="description" placeholder="What is this cost?" value="' + esc(line.description || "") + '" ' + costRowStyle() + ' style="flex:3 1 220px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
      '<input data-k="trade" placeholder="trade" value="' + esc(line.trade || "") + '" title="Trade" style="flex:0 1 100px;font:inherit;font-size:0.78rem;min-height:34px;border:1px solid #d8dee8;border-radius:999px;padding:0.2rem 0.65rem;background:#f2f5f9;color:#3d4a5c" />' +
      '<input data-k="actualTotal" type="number" min="0" step="any" placeholder="$" value="' + esc(line.actualTotal ? String(line.actualTotal) : "") + '" title="Cost $" style="flex:0 1 100px;font:inherit;font-size:0.82rem;font-weight:800;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
      '<input data-k="subName" list="' + subListId + '" placeholder="Sub / vendor" value="' + esc(line.subName || "") + '" title="Who did the work" style="flex:1 1 140px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
      '<button class="btn" type="button" data-k="del" title="Delete cost" style="min-height:34px">✕</button>' +
    "</div>");

    function onSave(key, raw) {
      var value = key === "actualTotal" ? Number(raw || 0) : String(raw).trim();
      var current = key === "actualTotal" ? num(line.actualTotal) : (line[key] || "");
      if (current === value) return;
      saveLineField(ctx, index, key, value).then(function () {
        line[key] = value;
        if (key === "actualTotal") ctx.renderMoney();
      }).catch(function (err) { APP.toast("Save failed: " + err.message); });
    }
    ["description", "trade", "actualTotal", "subName"].forEach(function (key) {
      var input = row.querySelector('[data-k="' + key + '"]');
      input.addEventListener("blur", function () { onSave(key, input.value); });
    });
    row.querySelector('[data-k="del"]').addEventListener("click", function () {
      if (!window.confirm("Delete this cost line?")) return;
      var next = (ctx.record.lines || []).slice();
      next.splice(index, 1);
      putProject(ctx.record, { lines: next }).then(function () {
        APP.toast("Cost deleted");
        ctx.renderCosts();
        ctx.renderMoney();
      }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
    });
    return row;
  }

  function buildAddCostRow(ctx, subListId, bookListId, byLabel) {
    var picked = { costbookId: "" };
    var row = APP.el('<div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;border-top:1px dashed #d8dee8;padding-top:0.6rem">' +
      '<input data-k="description" list="' + bookListId + '" placeholder="+ Add cost — type or pick a cost-book item" style="flex:3 1 220px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
      '<input data-k="trade" placeholder="trade" style="flex:0 1 100px;font:inherit;font-size:0.78rem;min-height:34px;border:1px solid #d8dee8;border-radius:999px;padding:0.2rem 0.65rem;background:#f2f5f9;color:#3d4a5c" />' +
      '<input data-k="actualTotal" type="number" min="0" step="any" placeholder="$" style="flex:0 1 100px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
      '<input data-k="subName" list="' + subListId + '" placeholder="Sub / vendor" style="flex:1 1 140px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033" />' +
      '<button class="btn primary" type="button" data-k="add" style="min-height:34px">Add</button>' +
    "</div>");

    var descInput = row.querySelector('[data-k="description"]');
    descInput.addEventListener("change", function () {
      var item = byLabel[descInput.value];
      picked.costbookId = item ? item.id : "";
      if (item) {
        if (!row.querySelector('[data-k="trade"]').value) row.querySelector('[data-k="trade"]').value = item.trade || "";
        descInput.value = item.description || descInput.value;
      }
    });

    row.querySelector('[data-k="add"]').addEventListener("click", function () {
      var line = {
        costbookId: picked.costbookId,
        description: descInput.value.trim(),
        trade: row.querySelector('[data-k="trade"]').value.trim(),
        qty: 1,
        unit: "job",
        actualTotal: Number(row.querySelector('[data-k="actualTotal"]').value || 0),
        subName: row.querySelector('[data-k="subName"]').value.trim(),
        notes: ""
      };
      if (!line.description && !line.actualTotal) { APP.toast("Add a description or an amount first."); return; }
      putProject(ctx.record, { lines: (ctx.record.lines || []).concat([line]) }).then(function () {
        APP.toast("Cost added");
        ctx.renderCosts();
        ctx.renderMoney();
      }).catch(function (err) { APP.toast("Add failed: " + err.message); });
    });
    return row;
  }

  /* ──────────────── Photos (inline timeline) ──────────────── */

  // photofeed projectId = actuals record id if entries exist there, else slug(projectName).
  function resolvePhotofeedId(ctx) {
    if (ctx.pfProjectId) return Promise.resolve(ctx.pfProjectId);
    var slug = slugify(ctx.record.projectName);
    return APP.fetchJSON("/api/photofeed?projectId=" + encodeURIComponent(ctx.record.id)).then(function (byId) {
      if (Array.isArray(byId) && byId.length) { ctx.pfProjectId = ctx.record.id; return ctx.pfProjectId; }
      ctx.pfProjectId = slug || ctx.record.id;
      return ctx.pfProjectId;
    });
  }

  function entryMediaHtml(entry) {
    if (entry.beforeAfterPair) {
      var pair = entry.beforeAfterPair;
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">' +
        '<figure style="margin:0"><figcaption ' + LABEL + ">Before</figcaption>" +
          (pair.beforeUrl ? '<img src="' + esc(pair.beforeUrl) + '" alt="Before" loading="lazy" style="width:100%;height:170px;object-fit:cover;border-radius:8px;border:1px solid #d8dee8" />' : '<div class="empty">No before photo</div>') +
        "</figure>" +
        '<figure style="margin:0"><figcaption ' + LABEL + ">After</figcaption>" +
          (pair.afterUrl ? '<img src="' + esc(pair.afterUrl) + '" alt="After" loading="lazy" style="width:100%;height:170px;object-fit:cover;border-radius:8px;border:1px solid #d8dee8" />' : '<div class="empty">No after photo</div>') +
        "</figure></div>";
    }
    if (entry.photoUrl) {
      return '<a href="' + esc(entry.photoUrl) + '" target="_blank" rel="noopener">' +
        '<img src="' + esc(entry.photoUrl) + '" alt="' + esc(entry.caption || "Project photo") + '" loading="lazy" style="width:100%;height:190px;object-fit:cover;border-radius:8px;border:1px solid #d8dee8" /></a>';
    }
    return '<div class="empty">No image</div>';
  }

  function renderPhotos(ctx, slot) {
    slot.innerHTML = "";
    var card = APP.el('<div class="card">' +
      '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:center;flex-wrap:wrap">' +
        "<h2 style=\"margin:0\">Photos</h2>" +
        '<div style="display:flex;gap:0.4rem;flex-wrap:wrap">' +
          '<button class="btn" type="button" data-f="report">Photo report</button>' +
          '<button class="btn" type="button" data-f="share">Share gallery</button>' +
        "</div>" +
      "</div>" +
      '<div data-f="share-slot"></div>' +
      '<div data-f="chips" style="margin-top:0.5rem"></div>' +
      '<div data-f="feed" style="display:grid;gap:0.7rem;margin-top:0.5rem"></div>' +
      '<div data-f="add" style="margin-top:0.6rem"></div>' +
    "</div>");
    slot.appendChild(card);

    card.querySelector('[data-f="report"]').addEventListener("click", function () {
      window.open("photo_feed.html", "_blank"); // legacy page owns the print/report layout
    });

    var shareSlot = card.querySelector('[data-f="share-slot"]');
    card.querySelector('[data-f="share"]').addEventListener("click", function () {
      shareSlot.innerHTML = "";
      shareSlot.appendChild(loadingEl("Minting share link"));
      resolvePhotofeedId(ctx).then(function (pfId) {
        return APP.fetchJSON("/api/photofeed/share/" + encodeURIComponent(pfId), { method: "POST" });
      }).then(function (share) {
        shareSlot.innerHTML = "";
        var box = APP.el('<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.5rem">' +
          '<input readonly value="' + esc(share.url) + '" style="flex:1 1 320px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.25rem 0.55rem" />' +
          '<button class="btn primary" type="button" data-f="copy">Copy link</button>' +
          '<button class="btn" type="button" data-f="close">Close</button>' +
        "</div>");
        box.querySelector('[data-f="copy"]').addEventListener("click", function () { copyText(share.url); });
        box.querySelector('[data-f="close"]').addEventListener("click", function () { shareSlot.innerHTML = ""; });
        shareSlot.appendChild(box);
      }).catch(function (err) {
        shareSlot.innerHTML = "";
        shareSlot.appendChild(APP.el('<div class="empty"><b>Can’t share yet</b>' + esc(err.message) + "</div>"));
      });
    });

    var chipsBox = card.querySelector('[data-f="chips"]');
    var feed = card.querySelector('[data-f="feed"]');
    var addBox = card.querySelector('[data-f="add"]');
    feed.appendChild(loadingEl("Loading photo timeline"));

    resolvePhotofeedId(ctx).then(function (pfId) {
      return APP.fetchJSON("/api/photofeed?projectId=" + encodeURIComponent(pfId));
    }).then(function (entries) {
      var state = { phase: "", entries: entries || [] };
      chipsBox.innerHTML = "";
      var chips = APP.el('<div class="chips">' +
        '<button class="chip active" type="button" data-phase="">All phases</button>' +
        PHASES.map(function (p) { return '<button class="chip" type="button" data-phase="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") +
      "</div>");
      chipsBox.appendChild(chips);
      chips.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-phase]");
        if (!chip) return;
        state.phase = chip.getAttribute("data-phase");
        chips.querySelectorAll(".chip").forEach(function (c) {
          c.classList.toggle("active", c.getAttribute("data-phase") === state.phase);
        });
        drawFeed();
      });

      addBox.innerHTML = "";
      addBox.appendChild(buildAddEntryForm(ctx, slot));

      function drawFeed() {
        feed.innerHTML = "";
        var visible = state.entries.filter(function (entry) { return !state.phase || entry.phase === state.phase; });
        if (!visible.length) {
          feed.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>' +
            (state.phase ? "No " + esc(state.phase) + " photos" : "No photos yet") + "</b>" +
            (state.phase ? "Try another phase filter." : "Add the first photo below — galleries and reports build from this timeline.") + "</div>"));
          return;
        }
        var days = {};
        visible.forEach(function (entry) {
          var day = String(entry.takenAt || "").slice(0, 10) || "undated";
          (days[day] = days[day] || []).push(entry);
        });
        Object.keys(days).sort().reverse().forEach(function (day) {
          var dayBlock = APP.el('<div><div ' + LABEL + ' style="margin-bottom:0.3rem">' +
            esc(APP.fmtDate(day + "T12:00:00")) + " · " + esc(String(days[day].length)) + " photo" + (days[day].length === 1 ? "" : "s") + "</div>" +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.6rem"></div></div>');
          var grid = dayBlock.lastElementChild;
          days[day].forEach(function (entry) {
            var node = APP.el('<div style="display:grid;gap:0.35rem;align-content:start">' +
              entryMediaHtml(entry) +
              '<div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap">' +
                '<span class="pill plum">' + esc(entry.phase || "other") + "</span>" +
                (entry.tags || []).map(function (tag) { return '<span class="pill">' + esc(tag) + "</span>"; }).join("") +
                '<span class="muted nowrap" style="font-size:0.72rem">' + esc(APP.fmtAgo(entry.takenAt)) + "</span>" +
                '<button class="btn" type="button" data-f="del" style="margin-left:auto;min-height:26px;padding:0 0.5rem" title="Delete entry">✕</button>' +
              "</div>" +
              (entry.caption ? '<div style="font-size:0.8rem">' + esc(entry.caption) + "</div>" : "") +
            "</div>");
            node.querySelector('[data-f="del"]').addEventListener("click", function () {
              if (!window.confirm("Delete this photo entry?")) return;
              APP.fetchJSON("/api/photofeed/" + encodeURIComponent(entry.id), { method: "DELETE" }).then(function () {
                photofeedAllPromise = null;
                APP.toast("Entry deleted");
                renderPhotos(ctx, slot);
              }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
            });
            grid.appendChild(node);
          });
          feed.appendChild(dayBlock);
        });
      }
      drawFeed();
    }).catch(function (err) {
      feed.innerHTML = "";
      feed.appendChild(errorEl(err.message, function () { renderPhotos(ctx, slot); }));
    });
  }

  function buildAddEntryForm(ctx, slot) {
    var card = APP.el('<div style="border-top:1px dashed #d8dee8;padding-top:0.6rem">' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD + '><span ' + LABEL + ">Photo URL</span><input " + INPUT + ' data-f="url" placeholder="/uploads/… or https://…" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">…or upload a file</span><input " + INPUT + ' data-f="file" type="file" accept="image/*" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Phase</span><select " + INPUT + ' data-f="phase">' +
          PHASES.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + "</option>"; }).join("") +
        "</select></label>" +
      "</div>" +
      '<div ' + ROW + ' style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;margin-top:0.5rem">' +
        '<label ' + FIELD + '><span ' + LABEL + ">Caption</span><input " + INPUT + ' data-f="caption" placeholder="What are we looking at?" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Tags (comma-separated)</span><input " + INPUT + ' data-f="tags" placeholder="plumbing, wall-open" /></label>' +
        '<button class="btn primary" type="button" data-f="add">Add to timeline</button>' +
      "</div>" +
      '<div class="footline" data-f="msg"></div></div>');

    card.querySelector('[data-f="add"]').addEventListener("click", function () {
      var msg = card.querySelector('[data-f="msg"]');
      var url = card.querySelector('[data-f="url"]').value.trim();
      var fileInput = card.querySelector('[data-f="file"]');
      var file = fileInput.files && fileInput.files[0];
      if (!url && !file) { msg.textContent = "Paste a photo URL or pick a file first."; return; }
      msg.textContent = file ? "Uploading photo…" : "Saving…";

      resolvePhotofeedId(ctx).then(function (pfId) {
        var urlPromise = url ? Promise.resolve(url)
          : APP.fetchJSON("/api/photofeed/upload?projectId=" + encodeURIComponent(pfId) +
              "&name=" + encodeURIComponent(file.name), {
              method: "POST",
              headers: { "Content-Type": file.type || "image/jpeg" },
              body: file
            }).then(function (uploaded) { return uploaded.url; });
        return urlPromise.then(function (photoUrl) {
          return APP.fetchJSON("/api/photofeed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: pfId,
              projectName: ctx.record.projectName,
              photoUrl: photoUrl,
              caption: card.querySelector('[data-f="caption"]').value.trim(),
              phase: card.querySelector('[data-f="phase"]').value,
              tags: card.querySelector('[data-f="tags"]').value
            })
          });
        });
      }).then(function () {
        photofeedAllPromise = null;
        APP.toast("Photo added");
        renderPhotos(ctx, slot);
      }).catch(function (err) { msg.textContent = "Failed: " + err.message; });
    });
    return card;
  }

  /* ──────────────── Change orders ──────────────── */

  function renderChangeOrders(ctx, slot) {
    slot.innerHTML = "";
    var card = APP.el('<div class="card"><h2>Change orders</h2><div data-f="body"></div></div>');
    slot.appendChild(card);
    var box = card.querySelector('[data-f="body"]');
    box.appendChild(loadingEl("Loading change orders"));

    APP.fetchJSON("/api/changeorders?projectId=" + encodeURIComponent(ctx.record.id)).then(function (cos) {
      box.innerHTML = "";
      cos = cos || [];
      var approvedTotal = cos.filter(function (co) { return co.status === "approved"; })
        .reduce(function (sum, co) { return sum + (Number(co.total) || 0); }, 0);
      var awaiting = cos.filter(function (co) { return co.status === "sent"; }).length;

      box.appendChild(APP.el('<div class="muted" style="font-size:0.78rem;margin-bottom:0.5rem">' +
        esc(String(cos.length)) + " total · " +
        '<span style="color:#0f766e;font-weight:800">' + esc(APP.fmtMoney(approvedTotal)) + " approved</span>" +
        (awaiting ? ' · <span style="color:#b45309;font-weight:800">' + esc(String(awaiting)) + " awaiting client</span>" : "") +
      "</div>"));

      if (!cos.length) {
        box.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>No change orders yet</b>' +
          "Scope creep costs money — write it up below and send it for a client signature.</div>"));
      } else {
        cos.forEach(function (co) { box.appendChild(buildCoCard(ctx, slot, co)); });
      }
      box.appendChild(buildCoForm(ctx, slot));
    }).catch(function (err) {
      box.innerHTML = "";
      box.appendChild(errorEl(err.message, function () { renderChangeOrders(ctx, slot); }));
    });
  }

  function buildCoCard(ctx, slot, co) {
    var pill = '<span class="pill ' + (CO_STATUS_PILL[co.status] || "") + '">' + esc(co.status) + "</span>";
    var lineRows = (co.lineItems || []).map(function (line) {
      return "<tr><td>" + esc(line.description) + '</td><td class="nowrap">' + esc(String(line.qty)) + " " + esc(line.unit) +
        '</td><td class="nowrap">' + esc(APP.fmtMoney(line.unitCost)) + '</td><td class="nowrap"><b>' + esc(APP.fmtMoney(line.total)) + "</b></td></tr>";
    }).join("");
    var canSend = co.status === "draft" || co.status === "sent";
    var canVoid = co.status !== "void";

    var card = APP.el('<div class="card" style="margin-top:0.5rem;background:#f7f9fc">' +
      '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="min-width:0"><b style="font-size:0.95rem">' + esc(co.title) + "</b> " + pill +
          '<div class="muted" style="font-size:0.76rem">' +
            esc(APP.fmtMoney(co.total)) + (co.markupPct ? " incl. " + esc(String(co.markupPct)) + "% markup" : "") +
            (co.daysImpact ? " · " + esc(String(co.daysImpact)) + " day schedule impact" : "") +
            (co.clientName ? " · " + esc(co.clientName) : "") +
            " · updated " + esc(APP.fmtAgo(co.updatedAt || co.createdAt)) +
          "</div></div>" +
        '<div style="display:flex;gap:0.4rem;flex-wrap:wrap">' +
          (canSend ? '<button class="btn primary" type="button" data-f="send">' + (co.status === "sent" ? "Resend link" : "Send for approval") + "</button>" : "") +
          (canVoid ? '<button class="btn" type="button" data-f="void">Void</button>' : "") +
        "</div>" +
      "</div>" +
      (co.description ? '<div style="font-size:0.8rem;margin-top:0.4rem">' + esc(co.description) + "</div>" : "") +
      (co.reason ? '<div class="muted" style="font-size:0.76rem;margin-top:0.2rem">Why: ' + esc(co.reason) + "</div>" : "") +
      (lineRows ? '<div class="tablewrap" style="margin-top:0.5rem;max-height:none"><table class="table">' +
        "<thead><tr><th>Description</th><th>Qty</th><th>Unit cost</th><th>Total</th></tr></thead><tbody>" + lineRows +
        '<tr><td colspan="3" style="text-align:right"><b>Total (incl. markup)</b></td><td class="nowrap"><b>' + esc(APP.fmtMoney(co.total)) + "</b></td></tr>" +
        "</tbody></table></div>" : "") +
      '<div data-f="linkslot"></div>' +
    "</div>");

    var linkSlot = card.querySelector('[data-f="linkslot"]');
    var sendBtn = card.querySelector('[data-f="send"]');
    if (sendBtn) sendBtn.addEventListener("click", function () {
      sendBtn.disabled = true;
      APP.fetchJSON("/api/changeorders/" + encodeURIComponent(co.id) + "/send", { method: "POST" }).then(function (sent) {
        sendBtn.disabled = false;
        var mailto = "mailto:" + encodeURIComponent(co.clientEmail || "") +
          "?subject=" + encodeURIComponent("Change order for approval: " + co.title) +
          "&body=" + encodeURIComponent("Hi" + (co.clientName ? " " + co.clientName : "") +
            ",\n\nPlease review and approve this change order:\n" + sent.approvalUrl + "\n\nThanks,\nJoon Development Group");
        linkSlot.innerHTML = "";
        var box = APP.el('<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.5rem">' +
          '<input readonly value="' + esc(sent.approvalUrl) + '" style="flex:1 1 280px;font:inherit;font-size:0.8rem;min-height:32px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem" />' +
          '<button class="btn" type="button" data-f="copy">Copy approval link</button>' +
          '<a class="btn" href="' + esc(mailto) + '">Email client</a>' +
        "</div>");
        box.querySelector('[data-f="copy"]').addEventListener("click", function () { copyText(sent.approvalUrl); });
        linkSlot.appendChild(box);
        APP.toast("Approval link ready — status is now “sent”");
        co.status = "sent";
      }).catch(function (err) { sendBtn.disabled = false; APP.toast("Send failed: " + err.message); });
    });

    var voidBtn = card.querySelector('[data-f="void"]');
    if (voidBtn) voidBtn.addEventListener("click", function () {
      if (!window.confirm("Void this change order? The client approval link stops working.")) return;
      APP.fetchJSON("/api/changeorders/" + encodeURIComponent(co.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: co.projectId, projectName: co.projectName, title: co.title,
          description: co.description, reason: co.reason, lineItems: co.lineItems,
          markupPct: co.markupPct, daysImpact: co.daysImpact, status: "void",
          clientName: co.clientName, clientEmail: co.clientEmail
        })
      }).then(function () {
        APP.toast("Change order voided");
        renderChangeOrders(ctx, slot);
      }).catch(function (err) { APP.toast("Void failed: " + err.message); });
    });
    return card;
  }

  function buildCoForm(ctx, slot) {
    var amount = { value: 0 };
    var card = APP.el('<div style="border-top:1px dashed #d8dee8;margin-top:0.7rem;padding-top:0.7rem"><span ' + LABEL + ">New change order</span>" +
      '<div ' + ROW + ' style="margin-top:0.35rem">' +
        '<label ' + FIELD + '><span ' + LABEL + ">Title</span><input " + INPUT + ' data-f="title" placeholder="e.g. Upgrade to quartz counters" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Amount $</span><input " + INPUT + ' data-f="amount" type="number" min="0" step="any" placeholder="0" /></label>' +
      "</div>" +
      '<div ' + ROW + ' style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;margin-top:0.5rem">' +
        '<label ' + FIELD + '><span ' + LABEL + ">Scope of change</span><input " + INPUT + ' data-f="desc" placeholder="What changes" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Client name</span><input " + INPUT + ' data-f="cname" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Client email</span><input " + INPUT + ' data-f="cemail" type="email" /></label>' +
      "</div>" +
      '<div style="margin-top:0.6rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">' +
        '<button class="btn primary" type="button" data-f="create">Create draft change order</button>' +
        '<span class="footline" data-f="msg"></span></div>' +
    "</div>");

    card.querySelector('[data-f="create"]').addEventListener("click", function () {
      var msg = card.querySelector('[data-f="msg"]');
      var title = card.querySelector('[data-f="title"]').value.trim();
      if (!title) { msg.textContent = "Give the change order a title."; return; }
      amount.value = Number(card.querySelector('[data-f="amount"]').value || 0);
      var desc = card.querySelector('[data-f="desc"]').value.trim();
      msg.textContent = "Creating…";
      APP.fetchJSON("/api/changeorders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: ctx.record.id,
          projectName: ctx.record.projectName,
          title: title,
          description: desc,
          lineItems: [{ description: desc || title, qty: 1, unit: "job", unitCost: amount.value }],
          markupPct: 0,
          daysImpact: 0,
          clientName: card.querySelector('[data-f="cname"]').value.trim(),
          clientEmail: card.querySelector('[data-f="cemail"]').value.trim()
        })
      }).then(function () {
        APP.toast("Draft change order created");
        renderChangeOrders(ctx, slot);
      }).catch(function (err) { msg.textContent = "Create failed: " + err.message; });
    });
    return card;
  }

  /* ──────────────── RFQs ──────────────── */

  function rfqMatchesProject(rfq, projectName) {
    var name = String(projectName || "").toLowerCase().trim();
    if (!name) return false;
    return ["scopeTitle", "title", "customerName", "projectType"].some(function (key) {
      var value = String(rfq[key] || "").toLowerCase().trim();
      return value && (value.indexOf(name) !== -1 || name.indexOf(value) !== -1);
    });
  }

  function renderRfqs(ctx, slot) {
    slot.innerHTML = "";
    var card = APP.el('<div class="card"><h2>RFQs</h2><div data-f="body"></div></div>');
    slot.appendChild(card);
    var box = card.querySelector('[data-f="body"]');
    box.appendChild(loadingEl("Loading RFQs"));

    APP.fetchJSON("/api/rfq").then(function (rfqs) {
      box.innerHTML = "";
      var matched = (rfqs || []).filter(function (rfq) { return rfqMatchesProject(rfq, ctx.record.projectName); });
      if (!matched.length) {
        box.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>No RFQs linked to this job</b>' +
          'RFQs are sent from Bid Lab scopes — <a href="bid_lab.html">request quotes from Bid Lab</a>.</div>'));
        return;
      }
      matched.forEach(function (rfq) {
        var counts = rfq.statusCounts || {};
        var recipients = (rfq.recipients || []).map(function (r) {
          return '<span style="display:inline-flex;gap:0.3rem;align-items:center;margin:0.15rem 0.5rem 0.15rem 0">' +
            '<span class="pill ' + (RECIPIENT_PILL[r.status] || "") + '">' + esc(r.status) + "</span>" +
            '<span style="font-size:0.8rem">' + esc(r.companyName || r.email) + "</span></span>";
        }).join("");
        box.appendChild(APP.el('<div class="card" style="margin-top:0.5rem;background:#f7f9fc">' +
          '<div style="display:flex;justify-content:space-between;gap:0.6rem;flex-wrap:wrap;align-items:baseline">' +
            "<b>" + esc(rfq.scopeTitle || rfq.projectType || "RFQ") + "</b>" +
            '<span class="muted" style="font-size:0.76rem">' +
              (rfq.dueDate ? "due " + esc(APP.fmtDate(rfq.dueDate + "T12:00:00")) + " · " : "") +
              esc(String(counts.responded || 0)) + "/" + esc(String((rfq.recipients || []).length)) + " responded · sent " + esc(APP.fmtAgo(rfq.createdAt)) +
            "</span></div>" +
          '<div class="muted" style="font-size:0.76rem;margin-top:0.15rem">' +
            esc(String((rfq.lineItems || []).length)) + " scope lines" + (rfq.customerName ? " · " + esc(rfq.customerName) : "") + "</div>" +
          '<div style="margin-top:0.45rem">' + recipients + "</div>" +
        "</div>"));
      });
      box.appendChild(APP.el('<div class="footline" style="margin-top:0.5rem">Matched loosely by job name. RFQs are created from <a href="bid_lab.html">Bid Lab</a> scopes.</div>'));
    }).catch(function (err) {
      box.innerHTML = "";
      box.appendChild(errorEl(err.message, function () { renderRfqs(ctx, slot); }));
    });
  }

  /* ════════════════════ POTENTIAL DETAIL (bid / estimate) ════════════════════ */

  function renderPotentialDetail(container, kind, id) {
    container.innerHTML = "";
    container.appendChild(loadingEl("Loading"));
    var listUrl = kind === "bid" ? "/api/bid-projects" : "/api/estimates";
    APP.fetchJSON(listUrl).then(function (rows) {
      var rec = (rows || []).find(function (r) { return r.id === id; });
      container.innerHTML = "";
      if (!rec) {
        container.appendChild(APP.el('<div class="empty"><b>Not found</b>' +
          'This item may have moved. <a href="#/projects">Back to projects</a>.</div>'));
        return;
      }
      if (kind === "bid") buildBidDetail(container, rec);
      else buildEstimateDetail(container, rec);
    }).catch(function (err) {
      container.innerHTML = "";
      container.appendChild(errorEl(err.message, function () { renderPotentialDetail(container, kind, id); }));
    });
  }

  function potentialHeader(container, kind, rec, name, status) {
    var head = APP.el('<div class="viewhead">' +
      '<div style="min-width:0">' +
        '<div class="muted" style="font-size:0.76rem"><a href="#/projects" style="text-decoration:none">← Projects</a> · ' + esc(kind === "bid" ? "Bid" : "Estimate") + "</div>" +
        '<h1 style="overflow:hidden;text-overflow:ellipsis">' + esc(name) + "</h1>" +
        '<div class="muted" style="font-size:0.78rem"><span class="pill">' + esc(status) + "</span></div>" +
      "</div>" +
      '<button class="btn primary" type="button" data-f="won">Won → make it a job</button>' +
    "</div>");
    head.querySelector('[data-f="won"]').addEventListener("click", function (e) {
      var btn = e.currentTarget;
      btn.disabled = true;
      wonToJob(kind, rec).then(function (created) {
        APP.toast("Job created");
        APP.navigate("#/projects/" + encodeURIComponent(created.id));
      }).catch(function (err) { btn.disabled = false; APP.toast("Couldn’t create job: " + err.message); });
    });
    container.appendChild(head);
  }

  function buildBidDetail(container, bid) {
    potentialHeader(container, "bid", bid, bidName(bid), bid.status || "intake");

    var value = bidValue(bid);
    var q = bidQuoteCounts(bid);
    container.appendChild(APP.el('<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:0.6rem 0">' +
      '<div class="kpi"><b>' + esc(APP.fmtMoney(value)) + "</b><span>Bid value</span></div>" +
      '<div class="kpi"><b>' + esc(String((bid.lineItems || []).length)) + "</b><span>Scope lines</span></div>" +
      '<div class="kpi"><b>' + esc(q.received + " / " + q.total) + "</b><span>Quotes received</span></div>" +
    "</div>"));

    if (bid.scopeDraft) {
      container.appendChild(APP.el('<div class="card" style="margin-bottom:0.9rem"><h2>Scope</h2>' +
        '<div style="font-size:0.84rem;white-space:pre-wrap">' + esc(bid.scopeDraft) + "</div></div>"));
    }

    /* line items */
    var liCard = APP.el('<div class="card" style="margin-bottom:0.9rem"><h2>Scope line items</h2><div data-f="b"></div></div>');
    var lb = liCard.querySelector('[data-f="b"]');
    if (!(bid.lineItems || []).length) {
      lb.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>No line items</b>Build the scope in Bid Lab.</div>'));
    } else {
      var liRows = bid.lineItems.map(function (li) {
        return "<tr><td>" + esc(li.trade || "—") + "</td><td>" + esc(li.description || "—") +
          '</td><td class="nowrap">' + esc(li.quantity || "") + " " + esc(li.unit || "") +
          '</td><td class="nowrap">' + esc(APP.fmtMoney(li.lowCost)) + "–" + esc(APP.fmtMoney(li.highCost)) + "</td></tr>";
      }).join("");
      lb.appendChild(APP.el('<div class="tablewrap"><table class="table"><thead><tr><th>Trade</th><th>Description</th><th>Qty</th><th>Range</th></tr></thead><tbody>' + liRows + "</tbody></table></div>"));
    }
    container.appendChild(liCard);

    /* sub quotes */
    var sqCard = APP.el('<div class="card" style="margin-bottom:0.9rem"><h2>Sub quotes</h2><div data-f="b"></div></div>');
    var sb = sqCard.querySelector('[data-f="b"]');
    if (!(bid.subQuotes || []).length) {
      sb.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>No quotes yet</b>Request them from Bid Lab.</div>'));
    } else {
      var sqRows = bid.subQuotes.map(function (sq) {
        var amount = sq.quoteFixed ? APP.fmtMoney(sq.quoteFixed)
          : (sq.quoteLow || sq.quoteHigh) ? APP.fmtMoney(sq.quoteLow) + "–" + APP.fmtMoney(sq.quoteHigh) : "—";
        return "<tr><td>" + esc(sq.subcontractorName || "—") + "</td><td>" + esc(sq.trade || "—") +
          '</td><td><span class="pill">' + esc(sq.status || "requested") + "</span></td>" +
          '<td class="nowrap"><b>' + esc(amount) + "</b></td></tr>";
      }).join("");
      sb.appendChild(APP.el('<div class="tablewrap"><table class="table"><thead><tr><th>Sub</th><th>Trade</th><th>Status</th><th>Quote</th></tr></thead><tbody>' + sqRows + "</tbody></table></div>"));
    }
    container.appendChild(sqCard);

    /* RFQ status */
    var rfqCard = APP.el('<div class="card" style="margin-bottom:0.9rem"><h2>RFQ status</h2><div data-f="b"></div></div>');
    container.appendChild(rfqCard);
    renderBidRfqs(bid, rfqCard.querySelector('[data-f="b"]'));

    container.appendChild(APP.el('<div class="footline"><a href="bid_lab.html">Open in Bid Lab</a> to edit scope, request quotes, and price this bid.</div>'));
  }

  function renderBidRfqs(bid, box) {
    box.appendChild(loadingEl("Loading RFQs"));
    APP.fetchJSON("/api/rfq?bidProjectId=" + encodeURIComponent(bid.id)).then(function (rfqs) {
      box.innerHTML = "";
      rfqs = rfqs || [];
      if (!rfqs.length) {
        box.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>No RFQs sent</b>Send quote requests from <a href="bid_lab.html">Bid Lab</a>.</div>'));
        return;
      }
      rfqs.forEach(function (rfq) {
        var recipients = (rfq.recipients || []).map(function (r) {
          return '<span style="display:inline-flex;gap:0.3rem;align-items:center;margin:0.15rem 0.5rem 0.15rem 0">' +
            '<span class="pill ' + (RECIPIENT_PILL[r.status] || "") + '">' + esc(r.status) + "</span>" +
            '<span style="font-size:0.8rem">' + esc(r.companyName || r.email) + "</span></span>";
        }).join("");
        box.appendChild(APP.el('<div style="margin-top:0.3rem"><b style="font-size:0.85rem">' + esc(rfq.scopeTitle || "RFQ") + "</b>" +
          '<div style="margin-top:0.3rem">' + (recipients || '<span class="muted">no recipients</span>') + "</div></div>"));
      });
    }).catch(function (err) {
      box.innerHTML = "";
      box.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>Couldn’t load RFQs</b>' + esc(err.message) + "</div>"));
    });
  }

  function buildEstimateDetail(container, est) {
    potentialHeader(container, "est", est, est.title || "Untitled estimate", est.status || "draft");

    var value = estValue(est);
    var range = estRange(est);
    container.appendChild(APP.el('<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:0.6rem 0">' +
      '<div class="kpi"><b>' + esc(APP.fmtMoney(value)) + "</b><span>Estimate value</span></div>" +
      '<div class="kpi"><b>' + esc(APP.fmtMoney(range.low)) + "–" + esc(APP.fmtMoney(range.high)) + "</b><span>Raw range (pre-markup)</span></div>" +
      '<div class="kpi"><b>' + esc(String((est.lines || []).length)) + "</b><span>Scope lines</span></div>" +
    "</div>"));

    if (est.description) {
      container.appendChild(APP.el('<div class="card" style="margin-bottom:0.9rem"><h2>Scope</h2>' +
        '<div style="font-size:0.84rem;white-space:pre-wrap">' + esc(est.description) + "</div></div>"));
    }

    var liCard = APP.el('<div class="card" style="margin-bottom:0.9rem"><h2>Line items</h2><div data-f="b"></div></div>');
    var lb = liCard.querySelector('[data-f="b"]');
    if (!(est.lines || []).length) {
      lb.appendChild(APP.el('<div class="empty" style="padding:1rem"><b>No line items</b>Build it in the Estimator.</div>'));
    } else {
      var rows = est.lines.map(function (l) {
        return "<tr><td>" + esc(l.trade || "—") + "</td><td>" + esc(l.description || "—") +
          '</td><td class="nowrap">' + esc(String(l.qty || 1)) + " " + esc(l.unit || "job") +
          '</td><td class="nowrap">' + esc(APP.fmtMoney(l.unitLow)) + "–" + esc(APP.fmtMoney(l.unitHigh)) + "</td></tr>";
      }).join("");
      lb.appendChild(APP.el('<div class="tablewrap"><table class="table"><thead><tr><th>Trade</th><th>Description</th><th>Qty</th><th>Unit range</th></tr></thead><tbody>' + rows +
        '<tr><td colspan="3" style="text-align:right"><b>With ' + esc(String(num(est.contingencyPercent))) + "% contingency + " + esc(String(num(est.markupPercent))) +
        '% markup</b></td><td class="nowrap"><b>' + esc(APP.fmtMoney(value)) + "</b></td></tr></tbody></table></div>"));
    }
    container.appendChild(liCard);

    container.appendChild(APP.el('<div class="footline"><a href="estimator.html">Open in Estimator</a> to edit line items and pricing.</div>'));
  }

  /* ──────────────── register ──────────────── */

  APP.registerView("projects", {
    title: "Projects",
    render: function (container, params) {
      if (params && params.id) renderDetail(container, params.id);
      else renderList(container);
    }
  });
})();
