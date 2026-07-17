// app_pipeline.js — Pipeline (leads-only; estimates/bids live under Projects → Potential)
// + Pricing Intelligence views. Registers "#/pipeline" and "#/pricing" on the APP shell
// (app.html). Agent D file — do not add other views here.
(function () {
  "use strict";

  if (!window.APP || typeof window.APP.registerView !== "function") {
    console.error("app_pipeline.js: APP shell not found — load app.html first.");
    return;
  }
  var APP = window.APP;

  // ── shared helpers ─────────────────────────────────────────────────────────

  function esc(value) { return APP.esc(value == null ? "" : value); }

  function loadingEl(label) {
    return APP.el('<div class="card"><p style="color:#667085;margin:0;">Loading ' + esc(label) + '&hellip;</p></div>');
  }

  function errorEl(label, error) {
    return APP.el('<div class="card"><p style="color:#b42318;margin:0;">Could not load ' + esc(label) + ": " + esc(error && error.message ? error.message : String(error)) + "</p></div>");
  }

  function priorityPill(priority) {
    var p = String(priority || "medium").toLowerCase();
    if (p === "high") return '<span class="pill red">high</span>';
    if (p === "medium") return '<span class="pill amber">medium</span>';
    return '<span class="pill">' + esc(p) + "</span>";
  }

  function statusPill(status, map) {
    var s = String(status || "").toLowerCase();
    var cls = map[s] || "";
    return '<span class="pill' + (cls ? " " + cls : "") + '">' + esc(status || "—") + "</span>";
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. PIPELINE VIEW (leads only)
  // ══════════════════════════════════════════════════════════════════════════

  // Real status vocabulary from lead_generation.html / normalizeLead (free string, default "new").
  var LEAD_STATUSES = ["new", "contacted", "estimate scheduled", "bid sent", "nurture", "won", "lost"];
  var LEAD_STATUS_PILLS = { "new": "plum", "contacted": "amber", "estimate scheduled": "amber", "bid sent": "amber", "nurture": "", "won": "green", "lost": "red" };

  function leadStatusKey(lead) {
    var s = String(lead.status || "new").toLowerCase().trim();
    return LEAD_STATUSES.indexOf(s) >= 0 ? s : "new";
  }

  function leadCard(lead) {
    return '<div class="card" data-lead-id="' + esc(lead.id) + '" style="cursor:pointer;margin:0;">' +
      '<div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:baseline;">' +
        "<strong>" + esc(lead.customerName || "Unknown") + "</strong>" +
        "<span>" + esc(APP.fmtMoney(Number(lead.estimatedValue) || 0)) + "</span>" +
      "</div>" +
      '<div style="color:#667085;margin:0.2rem 0 0.4rem;">' + esc(lead.projectType || "—") + (lead.city ? " · " + esc(lead.city) : "") + "</div>" +
      '<div style="display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;">' +
        priorityPill(lead.priority) +
        (lead.source ? '<span class="pill">' + esc(lead.source) + "</span>" : "") +
        '<span style="color:#667085;font-size:0.78rem;margin-left:auto;">' + esc(APP.fmtAgo(lead.createdAt || lead.updatedAt)) + "</span>" +
      "</div>" +
    "</div>";
  }

  function leadsColumnHTML(leads) {
    var total = leads.reduce(function (sum, l) { return sum + (Number(l.estimatedValue) || 0); }, 0);
    var html = '<div class="card"><h2>Leads · ' + leads.length + " · " + esc(APP.fmtMoney(total)) + "</h2>";
    if (!leads.length) {
      html += '<div class="empty">No customer leads yet. They arrive from the public estimate widget and <a href="lead_generation.html">Lead Generation</a>.</div>';
    } else {
      for (var i = 0; i < LEAD_STATUSES.length; i++) {
        var status = LEAD_STATUSES[i];
        var group = leads.filter(function (l) { return leadStatusKey(l) === status; });
        if (!group.length) continue;
        html += '<div style="margin:0.6rem 0 0.35rem;display:flex;gap:0.4rem;align-items:center;">' +
          statusPill(status, LEAD_STATUS_PILLS) +
          '<span style="color:#667085;font-size:0.78rem;">' + group.length + "</span></div>" +
          '<div style="display:grid;gap:0.5rem;">' + group.map(leadCard).join("") + "</div>";
      }
    }
    return html + "</div>";
  }

  function funnelHTML(leads) {
    var newCount = leads.filter(function (l) { return leadStatusKey(l) === "new"; }).length;
    var won = leads.filter(function (l) { return leadStatusKey(l) === "won"; }).length;
    var pipeline = leads.reduce(function (sum, l) {
      return leadStatusKey(l) === "lost" ? sum : sum + (Number(l.estimatedValue) || 0);
    }, 0);
    function kpi(value, label, accent) {
      return '<div class="kpi"' + (accent ? ' data-accent="' + accent + '"' : "") + "><strong>" + esc(value) + "</strong><span>" + esc(label) + "</span></div>";
    }
    return '<div class="kpis">' +
      kpi(leads.length, "Total leads") +
      kpi(newCount, "New", newCount ? "amber" : null) +
      kpi(won, "Won", won ? "green" : null) +
      kpi(APP.fmtMoney(pipeline), "Pipeline $ (open + won)") +
    "</div>";
  }

  function openLeadDrawer(lead, onSaved) {
    var options = LEAD_STATUSES.map(function (s) {
      return '<option value="' + esc(s) + '"' + (leadStatusKey(lead) === s ? " selected" : "") + ">" + esc(s) + "</option>";
    }).join("");
    var prio = ["high", "medium", "low"].map(function (p) {
      return '<option value="' + p + '"' + (String(lead.priority || "medium").toLowerCase() === p ? " selected" : "") + ">" + p + "</option>";
    }).join("");
    var rows = [
      ["Project type", esc(lead.projectType || "—")],
      ["City", esc(lead.city || "—")],
      ["Phone", lead.phone ? '<a href="tel:' + esc(lead.phone) + '">' + esc(lead.phone) + "</a>" : "—"],
      ["Email", lead.email ? '<a href="mailto:' + esc(lead.email) + '">' + esc(lead.email) + "</a>" : "—"],
      ["Source", esc(lead.source || "—") + (lead.sourceUrl ? ' · <a href="' + esc(lead.sourceUrl) + '" target="_blank" rel="noopener">link</a>' : "")],
      ["Estimated value", esc(APP.fmtMoney(Number(lead.estimatedValue) || 0))],
      ["Probability", esc(String(Number(lead.probability) || 0)) + "% · expected " + esc(APP.fmtMoney(Number(lead.expectedValue) || 0))],
      ["Next action", esc(lead.nextAction || "—") + (lead.nextActionDate ? " · " + esc(APP.fmtDate(lead.nextActionDate)) : "")],
      ["Created", esc(APP.fmtDate(lead.createdAt)) + " (" + esc(APP.fmtAgo(lead.createdAt)) + ")"]
    ];
    var drawer = APP.el('<div class="card" style="border:none;">' +
      "<h1>" + esc(lead.customerName || "Lead") + "</h1>" +
      '<div style="display:flex;gap:0.35rem;margin:0.4rem 0 0.8rem;">' + statusPill(lead.status || "new", LEAD_STATUS_PILLS) + priorityPill(lead.priority) + "</div>" +
      '<table class="table"><tbody>' +
        rows.map(function (r) { return '<tr><td style="color:#667085;white-space:nowrap;">' + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") +
      "</tbody></table>" +
      (lead.summary ? '<p style="margin:0.7rem 0;color:#344054;">' + esc(lead.summary) + "</p>" : "") +
      '<div style="display:grid;gap:0.6rem;margin-top:0.8rem;">' +
        "<label>Status<br /><select data-field=\"status\" style=\"width:100%;\">" + options + "</select></label>" +
        "<label>Priority<br /><select data-field=\"priority\" style=\"width:100%;\">" + prio + "</select></label>" +
        '<label>Notes<br /><textarea data-field="notes" rows="5" style="width:100%;">' + esc(lead.notes || "") + "</textarea></label>" +
        '<div style="display:flex;gap:0.5rem;align-items:center;">' +
          '<button class="btn primary" data-action="save">Save lead</button>' +
          '<span data-role="status" style="color:#667085;"></span>' +
        "</div>" +
      "</div>" +
    "</div>");

    drawer.querySelector('[data-action="save"]').addEventListener("click", function () {
      var statusEl = drawer.querySelector('[data-role="status"]');
      statusEl.textContent = "Saving…";
      // PUT /api/customer-leads/:id runs the body through normalizeLead (full-doc rebuild),
      // so send the whole lead merged with the edits — partial bodies would blank fields.
      var body = Object.assign({}, lead, {
        status: drawer.querySelector('select[data-field="status"]').value,
        priority: drawer.querySelector('select[data-field="priority"]').value,
        notes: drawer.querySelector('textarea[data-field="notes"]').value
      });
      delete body.id;
      APP.fetchJSON("/api/customer-leads/" + encodeURIComponent(lead.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function (saved) {
        APP.toast("Lead saved");
        APP.closeDrawer();
        onSaved(Object.assign({}, saved, { id: lead.id }));
      }).catch(function (error) {
        statusEl.textContent = "Save failed: " + (error && error.message ? error.message : error);
      });
    });

    APP.openDrawer(drawer);
  }

  // Estimates and bids now live under Projects → Potential; this view is leads-only.
  APP.registerView("pipeline", {
    title: "Leads",
    render: function (container) {
      container.innerHTML = "";
      container.appendChild(loadingEl("leads"));

      var state = { leads: [], errors: {} };

      function paint() {
        container.innerHTML = "";
        var wrap = APP.el("<div>" +
          "<h1>Leads</h1>" +
          funnelHTML(state.leads) +
          '<div style="margin-top:1rem;">' +
            (state.errors.leads ? '<div class="card"><h2>Leads</h2><p style="color:#b42318;">' + esc(state.errors.leads) + "</p></div>" : leadsColumnHTML(state.leads)) +
          "</div>" +
        "</div>");
        wrap.addEventListener("click", function (event) {
          var card = event.target.closest("[data-lead-id]");
          if (!card) return;
          var lead = state.leads.find(function (l) { return l.id === card.getAttribute("data-lead-id"); });
          if (!lead) return;
          openLeadDrawer(lead, function (saved) {
            var index = state.leads.findIndex(function (l) { return l.id === saved.id; });
            if (index >= 0) state.leads[index] = saved;
            paint();
          });
        });
        container.appendChild(wrap);
      }

      APP.fetchJSON("/api/customer-leads").then(function (rows) { state.leads = rows || []; }, function (e) { state.errors.leads = e.message || String(e); }).then(paint);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. PRICING INTELLIGENCE VIEW
  // ══════════════════════════════════════════════════════════════════════════

  var SOURCE_PILLS = { actual: "green", "bid-quote": "plum", rfq: "amber", job: "" };
  var CONFIDENCE_PILLS = { high: "green", medium: "amber", low: "red" };

  function bookRangeText(item) {
    if (item.unit === "pct-of-subtotal") return esc(String(item.low)) + "–" + esc(String(item.high)) + "%";
    return esc(APP.fmtMoney(Number(item.low) || 0)) + " – " + esc(APP.fmtMoney(Number(item.high) || 0));
  }

  // Median coloring compares against the SoCal benchmark when we have one (it's
  // what's now shown alongside it); falls back to the book range otherwise.
  function medianClass(item) {
    var b = item.benchmark;
    var lo = b && Number(b.lowUSD) ? Number(b.lowUSD) : (Number(item.low) || 0);
    var hi = b && Number(b.highUSD) ? Number(b.highUSD) : (Number(item.high) || 0);
    var mid = (lo + hi) / 2;
    var median = item.observed.median;
    if (median > hi) return "red";
    if (median <= mid) return "green";
    return "amber";
  }

  // SoCal benchmark cell: researched range + confidence pill (tooltip carries the
  // source count / as-of date / notes); falls back to the internal book range,
  // clearly labeled, when no benchmark has been researched yet.
  function benchmarkCell(item) {
    var b = item.benchmark;
    if (b && (Number(b.lowUSD) || Number(b.highUSD))) {
      var isPct = item.unit === "pct-of-subtotal";
      var rangeText = isPct
        ? esc(String(b.lowUSD)) + "–" + esc(String(b.highUSD)) + "%"
        : esc(APP.fmtMoney(Number(b.lowUSD) || 0)) + "–" + esc(APP.fmtMoney(Number(b.highUSD) || 0));
      var conf = String(b.confidence || "").toLowerCase();
      var sourceCount = Array.isArray(b.sources) ? b.sources.length : 0;
      var tipParts = [];
      if (sourceCount) tipParts.push(sourceCount + " source" + (sourceCount === 1 ? "" : "s"));
      if (b.asOf) tipParts.push("as of " + b.asOf);
      if (b.notes) tipParts.push(b.notes);
      var tip = tipParts.join(" — ");
      return rangeText +
        (conf ? ' <span class="pill' + (CONFIDENCE_PILLS[conf] ? " " + CONFIDENCE_PILLS[conf] : "") + '" title="' + esc(tip) + '">' + esc(conf) + "</span>" : "") +
        (sourceCount ? ' <span class="pill" style="opacity:0.65;" title="' + esc(tip) + '">' + sourceCount + " src" + (sourceCount === 1 ? "" : "s") + "</span>" : "");
    }
    return bookRangeText(item) + ' <span class="pill" style="opacity:0.55;" title="No SoCal benchmark researched yet — showing the internal cost-book range.">book</span>';
  }

  // "Our jobs" cell: Ori's own prior project/RFQ data for this exact item — kept
  // deliberately distinct from the researched SoCal benchmark next to it.
  function ourJobsCell(item) {
    var obs = item.observed;
    if (!obs) return '<span style="color:#98a2b3;font-size:0.82rem;">none yet — fills from your projects/RFQs</span>';
    return '<span class="pill ' + medianClass(item) + '">median ' + esc(APP.fmtMoney(obs.median)) + " from " + esc(String(obs.count)) + (obs.count === 1 ? " job/quote" : " jobs/quotes") + "</span>";
  }

  function knowledgeSectionHTML(cacheEntry) {
    if (!cacheEntry || cacheEntry.loading) return '<div style="margin-top:0.6rem;color:#98a2b3;font-size:0.8rem;">Checking knowledge base&hellip;</div>';
    if (cacheEntry.error) return "";
    var chunk = (cacheEntry.chunks || [])[0];
    if (!chunk) return '<div style="margin-top:0.6rem;color:#98a2b3;font-size:0.8rem;">No scope-of-work notes matched this item yet.</div>';
    return '<div style="margin-top:0.6rem;font-size:0.82rem;">' +
      '<a href="#/knowledge">📋 ' + esc(chunk.title || "Scope notes") + "</a>" +
      (chunk.driveUrl ? ' &middot; <a href="' + esc(chunk.driveUrl) + '" target="_blank" rel="noopener">source doc</a>' : "") +
    "</div>";
  }

  function sampleRowsHTML(samples) {
    if (!samples || !samples.length) return '<div class="empty">No samples kept for this item.</div>';
    return '<table class="table"><thead><tr><th>Source</th><th>Sub</th><th>Project</th><th>Amount</th><th>When</th></tr></thead><tbody>' +
      samples.slice().reverse().map(function (s) {
        var subCell = s.subId
          ? '<a href="#/subs/' + esc(s.subId) + '">' + esc(s.subName || "Sub profile") + "</a>"
          : esc(s.subName || "—");
        var pillClass = SOURCE_PILLS[String(s.source || "")] || "";
        return "<tr>" +
          '<td><span class="pill' + (pillClass ? " " + pillClass : "") + '">' + esc(s.source || "?") + "</span></td>" +
          "<td>" + subCell + "</td>" +
          "<td>" + esc(s.project || "—") + "</td>" +
          "<td>" + esc(APP.fmtMoney(Number(s.amount) || 0)) + "</td>" +
          "<td>" + esc(s.at ? APP.fmtDate(s.at) : "—") + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  }

  function pricingEmptyStateHTML() {
    return '<div class="card"><h2>No street data yet</h2><div class="empty">' +
      "<p>This view fills itself as pricing signals come in — nothing to enter here. Three ways data flows in:</p>" +
      "<ol style=\"margin:0.5rem 0 0.5rem 1.2rem;display:grid;gap:0.3rem;\">" +
        '<li><strong>Send RFQs</strong> from <a href="bid_lab.html">Bid Lab</a> — every sub response (lump sum or line prices) lands here.</li>' +
        '<li><strong>Log jobs</strong> on <a href="#/subs">sub profiles</a> — contract values feed the trade rates.</li>' +
        '<li><strong>Fill project actuals</strong> under <a href="#/projects">Projects</a> — real line costs calibrate the cost book.</li>' +
      "</ol>" +
      "<p>No street data yet — open the Price book tab for SoCal benchmark ranges; observed street prices fill in as you log quotes and jobs.</p>" +
    "</div></div>";
  }

  // Remembered across re-renders so the active pricing sub-tab sticks. Trade rates first (default).
  var pricingState = { tab: "trades" };

  APP.registerView("pricing", {
    title: "Pricing",
    render: function (container) {
      container.innerHTML = "";
      container.appendChild(loadingEl("pricing intelligence"));

      APP.fetchJSON("/api/pricing-intel").then(function (data) {
        var items = Array.isArray(data.items) ? data.items : [];
        var trades = data.trades || {};
        var itemObs = items.reduce(function (sum, item) { return sum + (item.observed ? item.observed.count : 0); }, 0);
        var tradeObs = Object.keys(trades).reduce(function (sum, key) { return sum + (Number(trades[key].count) || 0); }, 0);
        var services = [];
        items.forEach(function (item) { if (item.service && services.indexOf(item.service) < 0) services.push(item.service); });
        services.sort();

        var filter = { service: "", search: "", trade: "" };
        var expanded = {};
        var knowledgeCache = {};
        var PAGE_SIZE = 25;
        var page = 1;

        // Distinct trades for the price-book trade filter dropdown.
        var tradeOptions = [];
        items.forEach(function (item) { if (item.trade && tradeOptions.indexOf(item.trade) < 0) tradeOptions.push(item.trade); });
        tradeOptions.sort();

        container.innerHTML = "";
        var wrap = APP.el("<div>" +
          "<h1>Pricing intelligence</h1>" +
          '<div class="card">' +
            '<input type="search" data-role="search" placeholder="Search any job — ‘kitchen demo’, ‘repipe’, ‘turf’..." ' +
              'style="width:100%;font-size:1.05rem;padding:0.7rem 0.9rem;border:1px solid var(--line);border-radius:8px;font-family:inherit;" />' +
            '<div class="chips" data-role="service-chips" style="margin-top:0.7rem;"></div>' +
          "</div>" +
          '<div class="card"><h2>Live pricing intelligence</h2>' +
            '<div style="display:flex;gap:0.9rem;flex-wrap:wrap;align-items:baseline;">' +
              "<strong>" + esc(String(itemObs)) + (itemObs === 1 ? " item observation" : " item observations") + " · " + esc(String(tradeObs)) + (tradeObs === 1 ? " trade observation" : " trade observations") + "</strong>" +
              '<span style="color:#667085;">cost book updated ' + esc(data.updated ? APP.fmtDate(data.updated) : "—") + "</span>" +
            "</div>" +
            '<p style="color:#667085;margin:0.4rem 0 0;">Benchmarks from SoCal research · your own quotes and job costs sharpen every number automatically.</p>' +
          "</div>" +
          ((itemObs + tradeObs) === 0 ? pricingEmptyStateHTML() : "") +
          '<div class="tabs" data-role="pricing-tabs" style="margin:0.2rem 0 0.9rem;">' +
            '<button type="button" class="tab" data-tab="trades">Trade rates</button>' +
            '<button type="button" class="tab" data-tab="pricebook">Price book</button>' +
          "</div>" +
          // ── Trade rates panel (default, first-class near the top) ──
          '<div data-panel="trades">' +
            '<div class="card"><h2>Trade rates</h2>' +
              '<p style="color:#667085;margin:0.3rem 0 0;">What each trade actually charges us — from logged jobs and quotes. Street record, not a guess.</p>' +
              '<div data-role="trades" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:0.8rem;margin-top:0.7rem;"></div>' +
              '<div class="empty" data-role="trades-empty" hidden>No trade-level observations yet.</div>' +
            "</div>" +
          "</div>" +
          // ── Price book panel (renamed Cost book vs street; filtered + paged) ──
          '<div data-panel="pricebook">' +
            '<div class="card"><h2>Price book — SoCal benchmark vs our jobs</h2>' +
              '<p style="color:#667085;font-size:0.82rem;margin:0.3rem 0 0;">SoCal benchmark = published range · Our jobs = observed median from logged quotes/jobs · Live estimate = the two blended (leans on our data as observations grow).</p>' +
              '<div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;margin:0.4rem 0 0.7rem;">' +
                '<select data-role="trade-filter" style="padding:0.5rem 0.6rem;border:1px solid var(--line);border-radius:8px;font-family:inherit;"></select>' +
                '<input type="search" data-role="pb-search" placeholder="Filter the price book…" ' +
                  'style="flex:1 1 220px;min-width:180px;padding:0.5rem 0.7rem;border:1px solid var(--line);border-radius:8px;font-family:inherit;" />' +
              "</div>" +
              '<div style="overflow-x:auto;"><table class="table">' +
                "<thead><tr><th>Item</th><th>SoCal benchmark</th><th>Our jobs</th><th>Live estimate</th></tr></thead>" +
                '<tbody data-role="items-body"></tbody>' +
              "</table></div>" +
              '<div class="empty" data-role="items-empty" hidden>No cost book items match this filter.</div>' +
              '<div style="display:flex;gap:0.6rem;align-items:center;justify-content:flex-end;margin-top:0.7rem;">' +
                '<button type="button" class="btn" data-role="prev">Prev</button>' +
                '<span data-role="page-label" style="color:#667085;font-size:0.85rem;"></span>' +
                '<button type="button" class="btn" data-role="next">Next</button>' +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>");

        var chipsEl = wrap.querySelector('[data-role="service-chips"]');
        var bodyEl = wrap.querySelector('[data-role="items-body"]');
        var itemsEmptyEl = wrap.querySelector('[data-role="items-empty"]');
        var searchEl = wrap.querySelector('[data-role="search"]');
        var pbSearchEl = wrap.querySelector('[data-role="pb-search"]');
        var tradeFilterEl = wrap.querySelector('[data-role="trade-filter"]');
        var prevBtn = wrap.querySelector('[data-role="prev"]');
        var nextBtn = wrap.querySelector('[data-role="next"]');
        var pageLabelEl = wrap.querySelector('[data-role="page-label"]');

        function paintChips() {
          var html = '<span class="chip' + (filter.service === "" ? " active" : "") + '" data-service="">All services</span>';
          services.forEach(function (service) {
            html += '<span class="chip' + (filter.service === service ? " active" : "") + '" data-service="' + esc(service) + '">' + esc(service) + "</span>";
          });
          chipsEl.innerHTML = html;
        }

        function visibleItems() {
          var q = filter.search.toLowerCase();
          return items.filter(function (item) {
            if (filter.service && item.service !== filter.service) return false;
            if (filter.trade && item.trade !== filter.trade) return false;
            if (!q) return true;
            return [item.service, item.trade, item.description, item.id].join(" ").toLowerCase().indexOf(q) >= 0;
          });
        }

        // Fetch scope-of-work matches for one item, once, and repaint when it lands.
        function loadKnowledge(item) {
          knowledgeCache[item.id] = { loading: true };
          var q = item.description || item.id;
          APP.fetchJSON("/api/knowledge/search?q=" + encodeURIComponent(q)).then(function (result) {
            knowledgeCache[item.id] = { chunks: (result && result.chunks) || [] };
            paintItems();
          }).catch(function () {
            knowledgeCache[item.id] = { error: true };
            paintItems();
          });
        }

        function paintItems() {
          var rows = visibleItems();
          var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
          if (page > totalPages) page = totalPages;
          if (page < 1) page = 1;
          var pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
          itemsEmptyEl.hidden = rows.length > 0;
          pageLabelEl.textContent = rows.length ? ("Page " + page + " of " + totalPages + " · " + rows.length + (rows.length === 1 ? " item" : " items")) : "No items";
          prevBtn.disabled = page <= 1;
          nextBtn.disabled = page >= totalPages;
          bodyEl.innerHTML = pageRows.map(function (item) {
            var obs = item.observed;
            var blended = item.blended;
            var blendedCell = "—";
            if (blended && (blended.low || blended.high)) {
              var basisPill = blended.n > 0
                ? '<span class="pill green" title="benchmark prior blended with ' + blended.n + ' observed quote(s), weight ' + Math.round((blended.weight || 0) * 100) + '%">' + blended.n + " obs · " + Math.round((blended.weight || 0) * 100) + "%</span>"
                : '<span class="pill" style="opacity:0.65" title="' + esc(blended.basis || "book") + ' prior - fills with your quotes automatically">' + esc(blended.basis === "benchmark" ? "SoCal benchmark" : "book prior") + "</span>";
              blendedCell = "<strong>" + esc(APP.fmtMoney(blended.low)) + "–" + esc(APP.fmtMoney(blended.high)) + "</strong> " + basisPill;
            }
            var metaParts = [item.service, item.trade].filter(Boolean);
            if (item.unit && item.unit !== "pct-of-subtotal") metaParts.push(item.unit);
            var open = !!expanded[item.id];
            var row = '<tr data-item-id="' + esc(item.id) + '" style="cursor:pointer;">' +
              "<td>" + esc(item.description || item.id) +
                '<div style="color:#667085;font-size:0.78rem;">' + esc(metaParts.join(" · ")) + "</div></td>" +
              "<td>" + benchmarkCell(item) + "</td>" +
              "<td>" + ourJobsCell(item) + "</td>" +
              "<td>" + blendedCell + "</td>" +
            "</tr>";
            if (open) {
              var sampleHTML = obs ? sampleRowsHTML(obs.samples) : '<div class="empty">No logged samples yet for this item.</div>';
              row += '<tr><td colspan="4" style="background:#f8fafc;">' + sampleHTML + knowledgeSectionHTML(knowledgeCache[item.id]) + "</td></tr>";
            }
            return row;
          }).join("");
        }

        chipsEl.addEventListener("click", function (event) {
          var chip = event.target.closest("[data-service]");
          if (!chip) return;
          filter.service = chip.getAttribute("data-service");
          page = 1;
          // Chips filter the Price book table — surface that tab so the filter is visible.
          if (filter.service && pricingState.tab !== "pricebook") {
            pricingState.tab = "pricebook";
            paintTabs();
          }
          paintChips();
          paintItems();
        });
        // Hero search and the price-book search stay in sync (both drive filter.search).
        searchEl.addEventListener("input", function (event) {
          filter.search = event.target.value.trim();
          if (pbSearchEl.value !== event.target.value) pbSearchEl.value = event.target.value;
          page = 1;
          // Hero search filters the Price book table — auto-switch so results are visible.
          // (Clearing the search deliberately does NOT switch tabs back.)
          if (filter.search && pricingState.tab !== "pricebook") {
            pricingState.tab = "pricebook";
            paintTabs();
          }
          paintItems();
        });
        pbSearchEl.addEventListener("input", function (event) {
          filter.search = event.target.value.trim();
          if (searchEl.value !== event.target.value) searchEl.value = event.target.value;
          page = 1;
          paintItems();
        });
        tradeFilterEl.innerHTML = '<option value="">All trades</option>' +
          tradeOptions.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("");
        tradeFilterEl.addEventListener("change", function (event) {
          filter.trade = event.target.value;
          page = 1;
          paintItems();
        });
        prevBtn.addEventListener("click", function () { if (page > 1) { page--; paintItems(); } });
        nextBtn.addEventListener("click", function () { page++; paintItems(); });
        bodyEl.addEventListener("click", function (event) {
          if (event.target.closest("a")) return;
          var row = event.target.closest("[data-item-id]");
          if (!row) return;
          var id = row.getAttribute("data-item-id");
          var item = items.find(function (i) { return i.id === id; });
          if (!item) return;
          expanded[id] = !expanded[id];
          if (expanded[id] && !knowledgeCache[id]) loadKnowledge(item);
          paintItems();
        });

        // Trade rates — sorted by observation count desc, zero-count trades skipped.
        var tradeKeys = Object.keys(trades).filter(function (key) { return (Number(trades[key].count) || 0) > 0; })
          .sort(function (a, b) { return trades[b].count - trades[a].count; });
        var tradesEl = wrap.querySelector('[data-role="trades"]');
        wrap.querySelector('[data-role="trades-empty"]').hidden = tradeKeys.length > 0;
        tradesEl.innerHTML = tradeKeys.map(function (trade) {
          var t = trades[trade];
          var samples = (t.samples || []).slice().reverse().slice(0, 5);
          return '<div class="card" style="margin:0;">' +
            '<div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:baseline;">' +
              "<strong>" + esc(trade) + "</strong>" +
              '<span class="pill">' + esc(String(t.count)) + " obs</span>" +
            "</div>" +
            '<div style="color:#344054;margin:0.3rem 0 0.5rem;">' +
              esc(APP.fmtMoney(t.low)) + " / <strong>" + esc(APP.fmtMoney(t.median)) + "</strong> / " + esc(APP.fmtMoney(t.high)) +
              ' <span style="color:#667085;font-size:0.78rem;">low / median / high</span>' +
            "</div>" +
            '<div style="display:grid;gap:0.25rem;font-size:0.8rem;">' +
              samples.map(function (s) {
                var who = s.subId
                  ? '<a href="#/subs/' + esc(s.subId) + '">' + esc(s.subName || "Sub profile") + "</a>"
                  : esc(s.subName || "—");
                var pillClass = SOURCE_PILLS[String(s.source || "")] || "";
                return '<div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">' +
                  '<span class="pill' + (pillClass ? " " + pillClass : "") + '">' + esc(s.source || "?") + "</span>" +
                  "<span>" + who + "</span>" +
                  '<span style="margin-left:auto;">' + esc(APP.fmtMoney(Number(s.amount) || 0)) + "</span>" +
                  '<span style="color:#667085;">' + esc(s.at ? APP.fmtDate(s.at) : "") + "</span>" +
                "</div>";
              }).join("") +
            "</div>" +
          "</div>";
        }).join("");

        // Sub-tab switching — remembered in pricingState so re-renders keep the active tab.
        var tabsEl = wrap.querySelector('[data-role="pricing-tabs"]');
        var tradesPanel = wrap.querySelector('[data-panel="trades"]');
        var pricebookPanel = wrap.querySelector('[data-panel="pricebook"]');
        function paintTabs() {
          tabsEl.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === pricingState.tab); });
          tradesPanel.hidden = pricingState.tab !== "trades";
          pricebookPanel.hidden = pricingState.tab !== "pricebook";
        }
        tabsEl.addEventListener("click", function (event) {
          var btn = event.target.closest(".tab");
          if (!btn) return;
          pricingState.tab = btn.dataset.tab;
          paintTabs();
        });

        paintChips();
        paintItems();
        paintTabs();
        container.appendChild(wrap);
      }).catch(function (error) {
        container.innerHTML = "";
        container.appendChild(errorEl("pricing intelligence", error));
      });
    }
  });
})();
