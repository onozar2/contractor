/* app_projects.js — Projects hub (Agent C)
   Registers the "projects" view on the APP shell (app.html).
   List  (#/projects)      : card grid of /api/actuals project ledgers.
   Detail (#/projects/:id) : header + Budget / Photos / Change orders / RFQs tabs.
   Uses ONLY the shell's CSS classes + tiny inline layout styles. */
(function () {
  "use strict";

  var PHASES = ["pre-work", "demo", "rough-in", "inspection", "finish", "final", "other"];
  var PROJECT_STATUSES = ["active", "in-progress", "on-hold", "completed", "closed"];
  var CO_STATUS_PILL = { draft: "", sent: "amber", approved: "green", declined: "red", void: "" };
  var RECIPIENT_PILL = { sent: "", viewed: "plum", responded: "green", declined: "red" };

  var INPUT = 'style="font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;' +
    'border-radius:7px;padding:0.25rem 0.55rem;background:#fff;color:#172033;width:100%"';
  var ROW = 'style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end"';
  var FIELD = 'style="display:grid;gap:0.2rem;flex:1 1 160px;min-width:0"';
  var FIELD_SM = 'style="display:grid;gap:0.2rem;flex:0 1 110px;min-width:0"';
  var LABEL = 'style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587"';

  // ── shared caches (fetched once per page load, invalidated on writes) ──
  var photofeedAllPromise = null;   // GET /api/photofeed (all entries) — list photo counts
  var pricingIntelPromise = null;   // GET /api/pricing-intel — budget book-vs-street
  var costbookPromise = null;       // GET /api/estimator/costbook — add-line datalist

  function getPhotofeedAll() {
    if (!photofeedAllPromise) {
      photofeedAllPromise = APP.fetchJSON("/api/photofeed").catch(function () {
        photofeedAllPromise = null;
        return null; // photo counts are decoration; never break the list on this
      });
    }
    return photofeedAllPromise;
  }

  function getPricingIntel() {
    if (!pricingIntelPromise) {
      pricingIntelPromise = APP.fetchJSON("/api/pricing-intel").catch(function () {
        pricingIntelPromise = null;
        return null;
      });
    }
    return pricingIntelPromise;
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

  // ── helpers ──
  function esc(v) { return APP.esc(v); }

  function slugify(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function projectSpend(record) {
    return (record.lines || []).reduce(function (sum, line) { return sum + (Number(line.actualTotal) || 0); }, 0);
  }

  function statusOf(record) {
    return String(record.status || "completed");
  }

  function statusPill(status) {
    var cls = { "active": "green", "in-progress": "green", "on-hold": "amber", "completed": "plum", "closed": "" }[status] || "";
    return '<span class="pill ' + cls + '">' + esc(status) + "</span>";
  }

  function photoCountFor(record, entries) {
    if (!Array.isArray(entries)) return null;
    var slug = slugify(record.projectName);
    return entries.filter(function (entry) {
      return entry.projectId === record.id || (slug && entry.projectId === slug);
    }).length;
  }

  function unitCostOf(line) {
    var qty = Number(line.qty) || 1;
    var total = Number(line.actualTotal) || 0;
    return line.actualUnit !== undefined && line.actualUnit !== null && line.actualUnit !== ""
      ? Number(line.actualUnit) : (qty ? total / qty : total);
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

  // PUT the FULL actuals record the way actuals.html does — the server re-normalizes
  // the whole document, so every field must ride along or it resets to its default.
  function putProject(record, patch) {
    var body = {
      projectName: record.projectName,
      projectType: record.projectType || "",
      city: record.city || "",
      completedAt: record.completedAt || "",
      sqft: Number(record.sqft) || 0,
      contractPrice: Number(record.contractPrice) || 0,
      estimateId: record.estimateId || "",
      notes: record.notes || "",
      status: record.status || "",
      lines: record.lines || []
    };
    Object.keys(patch || {}).forEach(function (key) { body[key] = patch[key]; });
    return APP.fetchJSON("/api/actuals/" + encodeURIComponent(record.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (updated) {
      Object.keys(updated || {}).forEach(function (key) { record[key] = updated[key]; });
      if (patch && patch.status !== undefined) record.status = patch.status; // server drops status; keep session view
      pricingIntelPromise = null; // actuals feed the observed prices
      return record;
    });
  }

  /* ════════════════════ LIST VIEW ════════════════════ */

  function renderList(container) {
    container.innerHTML = "";
    var head = APP.el('<div class="viewhead"><h1>Projects</h1>' +
      '<button class="btn primary" type="button" id="pjNew">+ New project</button></div>');
    container.appendChild(head);

    var formSlot = APP.el("<div></div>");
    container.appendChild(formSlot);

    var body = APP.el("<div></div>");
    body.appendChild(loadingEl("Loading projects"));
    container.appendChild(body);

    head.querySelector("#pjNew").addEventListener("click", function () {
      if (formSlot.firstChild) { formSlot.innerHTML = ""; return; }
      formSlot.appendChild(buildNewProjectForm(function () { formSlot.innerHTML = ""; }));
    });

    Promise.all([APP.fetchJSON("/api/actuals"), getPhotofeedAll()]).then(function (results) {
      var projects = results[0] || [];
      var entries = results[1];
      body.innerHTML = "";
      if (!projects.length) {
        body.appendChild(APP.el('<div class="empty"><b>No projects yet</b>' +
          "Log the first project with “+ New project”, or import completed jobs from the Actuals tool.</div>"));
        return;
      }
      var grid = APP.el('<div class="attn"></div>');
      projects.forEach(function (record) {
        var photos = photoCountFor(record, entries);
        var card = APP.el('<div class="card" style="cursor:pointer" role="link" tabindex="0">' +
          '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:flex-start">' +
            '<b style="font-size:0.95rem;min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(record.projectName) + "</b>" +
            statusPill(statusOf(record)) +
          "</div>" +
          '<div style="font-size:1.25rem;font-weight:900;margin:0.35rem 0 0.15rem">' + esc(APP.fmtMoney(projectSpend(record))) + "</div>" +
          '<div class="muted" style="font-size:0.76rem">' +
            esc(String((record.lines || []).length)) + " line" + ((record.lines || []).length === 1 ? "" : "s") +
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
    }).catch(function (err) {
      body.innerHTML = "";
      body.appendChild(errorEl(err.message, function () { renderList(container); }));
    });
  }

  function buildNewProjectForm(onDone) {
    var card = APP.el('<div class="card"><h2>New project</h2>' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD + '><span ' + LABEL + ">Project name</span><input " + INPUT + ' type="text" data-f="name" placeholder="e.g. Sherman Oaks kitchen remodel" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Status</span><select " + INPUT + ' data-f="status">' +
          PROJECT_STATUSES.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") +
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
      if (!name) { msg.textContent = "Give the project a name first."; return; }
      msg.textContent = "Creating…";
      APP.fetchJSON("/api/actuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: name, status: status, lines: [] })
      }).then(function (created) {
        APP.toast("Project created");
        onDone();
        APP.navigate("#/projects/" + encodeURIComponent(created.id));
      }).catch(function (err) { msg.textContent = "Create failed: " + err.message; });
    });
    return card;
  }

  /* ════════════════════ DETAIL VIEW ════════════════════ */

  function renderDetail(container, id, activeTab) {
    container.innerHTML = "";
    container.appendChild(loadingEl("Loading project"));
    APP.fetchJSON("/api/actuals").then(function (projects) {
      var record = (projects || []).find(function (p) { return p.id === id; });
      container.innerHTML = "";
      if (!record) {
        container.appendChild(APP.el('<div class="empty"><b>Project not found</b>' +
          'It may have been deleted. <a href="#/projects">Back to projects</a>.</div>'));
        return;
      }
      buildDetail(container, record, activeTab || "budget");
    }).catch(function (err) {
      container.innerHTML = "";
      container.appendChild(errorEl(err.message, function () { renderDetail(container, id, activeTab); }));
    });
  }

  function buildDetail(container, record, activeTab) {
    var ctx = {
      record: record,
      pfProjectId: null,        // resolved photofeed projectId (record id or name slug)
      tab: activeTab,
      refresh: function (tab) { renderDetail(container, record.id, tab || ctx.tab); }
    };

    var head = APP.el('<div class="viewhead">' +
      '<div style="min-width:0">' +
        '<div class="muted" style="font-size:0.76rem"><a href="#/projects" style="text-decoration:none">← Projects</a></div>' +
        '<h1 style="overflow:hidden;text-overflow:ellipsis">' + esc(record.projectName) + "</h1>" +
        '<div class="muted" style="font-size:0.78rem">' +
          esc(APP.fmtMoney(projectSpend(record))) + " spent · " +
          esc(String((record.lines || []).length)) + " budget lines" +
          (record.contractPrice ? " · contract " + esc(APP.fmtMoney(record.contractPrice)) : "") +
          (record.city ? " · " + esc(record.city) : "") +
        "</div>" +
      "</div>" +
      '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">' +
        '<select ' + INPUT.replace('width:100%"', 'width:auto"') + ' data-f="status" title="Project status">' +
          PROJECT_STATUSES.map(function (s) {
            return '<option value="' + esc(s) + '"' + (statusOf(record) === s ? " selected" : "") + ">" + esc(s) + "</option>";
          }).join("") +
        "</select>" +
        '<button class="btn" type="button" data-f="report">Photo report</button>' +
        '<button class="btn" type="button" data-f="share">Share gallery</button>' +
      "</div>" +
    "</div>");
    container.appendChild(head);

    head.querySelector('[data-f="status"]').addEventListener("change", function (e) {
      var next = e.target.value;
      putProject(record, { status: next }).then(function () {
        APP.toast("Status set to " + next);
      }).catch(function (err) { APP.toast("Save failed: " + err.message); });
    });

    head.querySelector('[data-f="report"]').addEventListener("click", function () {
      window.open("photo_feed.html", "_blank"); // legacy page owns the print/report layout
    });

    var shareSlot = APP.el("<div></div>");
    head.querySelector('[data-f="share"]').addEventListener("click", function () {
      shareSlot.innerHTML = "";
      shareSlot.appendChild(loadingEl("Minting share link"));
      resolvePhotofeedId(ctx).then(function (pfId) {
        return APP.fetchJSON("/api/photofeed/share/" + encodeURIComponent(pfId), { method: "POST" });
      }).then(function (share) {
        shareSlot.innerHTML = "";
        var box = APP.el('<div class="card"><h2>Public gallery link</h2>' +
          '<div ' + ROW + ">" +
            '<input ' + INPUT.replace('flex:1 1 160px;', "") + ' readonly value="' + esc(share.url) + '" style="flex:1 1 320px;font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.25rem 0.55rem" />' +
            '<button class="btn primary" type="button" data-f="copy">Copy link</button>' +
            '<button class="btn" type="button" data-f="close">Close</button>' +
          "</div>" +
          '<div class="footline">Anyone with this link can view the project photo gallery.</div></div>');
        box.querySelector('[data-f="copy"]').addEventListener("click", function () { copyText(share.url); });
        box.querySelector('[data-f="close"]').addEventListener("click", function () { shareSlot.innerHTML = ""; });
        shareSlot.appendChild(box);
      }).catch(function (err) {
        shareSlot.innerHTML = "";
        shareSlot.appendChild(APP.el('<div class="empty"><b>Can’t share yet</b>' + esc(err.message) + "</div>"));
      });
    });
    container.appendChild(shareSlot);

    var tabs = [
      { key: "budget", label: "Budget" },
      { key: "photos", label: "Photos" },
      { key: "changeorders", label: "Change orders" },
      { key: "rfqs", label: "RFQs" }
    ];
    var tabBar = APP.el('<div class="tabs">' + tabs.map(function (t) {
      return '<button class="tab' + (t.key === ctx.tab ? " active" : "") + '" type="button" data-tab="' + t.key + '">' + esc(t.label) + "</button>";
    }).join("") + "</div>");
    container.appendChild(tabBar);

    var tabBody = APP.el('<div style="display:grid;gap:0.9rem"></div>');
    container.appendChild(tabBody);

    tabBar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      ctx.tab = btn.getAttribute("data-tab");
      tabBar.querySelectorAll(".tab").forEach(function (t) {
        t.classList.toggle("active", t.getAttribute("data-tab") === ctx.tab);
      });
      renderTab(ctx, tabBody);
    });

    renderTab(ctx, tabBody);
  }

  function renderTab(ctx, tabBody) {
    tabBody.innerHTML = "";
    if (ctx.tab === "budget") renderBudgetTab(ctx, tabBody);
    else if (ctx.tab === "photos") renderPhotosTab(ctx, tabBody);
    else if (ctx.tab === "changeorders") renderChangeOrdersTab(ctx, tabBody);
    else renderRfqsTab(ctx, tabBody);
  }

  /* ──────────────── Budget tab ──────────────── */

  function bookCheckHtml(line, intelById) {
    if (!line.costbookId) return '<span class="muted">—</span>';
    var item = intelById ? intelById[line.costbookId] : null;
    if (!item) return '<span class="muted">no book match</span>';
    var unitCost = unitCostOf(line);
    var median = item.observed && item.observed.count ? item.observed.median : null;
    var parts = ['<span class="muted nowrap">book ' + esc(APP.fmtMoney(item.low)) + "–" + esc(APP.fmtMoney(item.high)) + "</span>"];
    if (median !== null) parts.push('<span class="muted nowrap">street median ' + esc(APP.fmtMoney(median)) + "</span>");
    var verdict = "";
    if (Number(item.high) && unitCost > Number(item.high) * 1.15) {
      verdict = '<span class="pill red">' + esc(Math.round((unitCost / item.high - 1) * 100) + "% over book") + "</span>";
    } else if (median !== null && unitCost <= median) {
      verdict = '<span class="pill green">at/under median</span>';
    }
    if (verdict) parts.push(verdict);
    return '<span style="display:inline-flex;gap:0.35rem;flex-wrap:wrap;align-items:center">' + parts.join("") + "</span>";
  }

  function renderBudgetTab(ctx, tabBody) {
    tabBody.appendChild(loadingEl("Loading budget"));
    Promise.all([getPricingIntel(), getCostbook()]).then(function (results) {
      var intel = results[0];
      var book = results[1];
      var intelById = null;
      if (intel && Array.isArray(intel.items)) {
        intelById = {};
        intel.items.forEach(function (item) { intelById[item.id] = item; });
      }
      tabBody.innerHTML = "";

      var record = ctx.record;
      var lines = record.lines || [];
      var total = projectSpend(record);

      if (!lines.length) {
        tabBody.appendChild(APP.el('<div class="empty"><b>No cost lines yet</b>' +
          "Add what you actually paid, line by line — it builds the project ledger below.</div>"));
      } else {
        var rows = lines.map(function (line, index) {
          return "<tr>" +
            "<td>" + esc(line.trade || "—") + "</td>" +
            "<td>" + esc(line.description || "—") +
              (line.subName ? '<div class="muted" style="font-size:0.72rem">' + esc(line.subName) + "</div>" : "") + "</td>" +
            '<td class="nowrap">' + esc(String(line.qty || 1)) + " " + esc(line.unit || "job") + "</td>" +
            '<td class="nowrap"><b>' + esc(APP.fmtMoney(line.actualTotal)) + "</b></td>" +
            '<td class="nowrap">' + esc(APP.fmtMoney(unitCostOf(line))) + '<span class="muted">/' + esc(line.unit || "job") + "</span></td>" +
            "<td>" + bookCheckHtml(line, intelById) + "</td>" +
            '<td><button class="btn" type="button" data-del="' + index + '" title="Delete line">✕</button></td>' +
          "</tr>";
        }).join("");
        var tableWrap = APP.el('<div class="tablewrap"><table class="table">' +
          "<thead><tr><th>Trade</th><th>Description / sub</th><th>Qty</th><th>Actual total</th><th>Unit cost</th><th>Book vs street</th><th></th></tr></thead>" +
          "<tbody>" + rows +
            '<tr><td colspan="3" style="text-align:right"><b>Total spend</b></td><td class="nowrap"><b>' + esc(APP.fmtMoney(total)) + "</b></td>" +
            '<td colspan="3" class="muted">' + (record.contractPrice ? "gross margin " + esc(APP.fmtMoney((record.contractPrice || 0) - total)) : "") + "</td></tr>" +
          "</tbody></table></div>");
        tableWrap.addEventListener("click", function (e) {
          var btn = e.target.closest("[data-del]");
          if (!btn) return;
          var index = Number(btn.getAttribute("data-del"));
          if (!window.confirm("Delete this cost line?")) return;
          var next = record.lines.slice();
          next.splice(index, 1);
          putProject(record, { lines: next }).then(function () {
            APP.toast("Line deleted");
            renderTab(ctx, tabBody);
          }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
        });
        tabBody.appendChild(tableWrap);
      }

      tabBody.appendChild(buildAddLineForm(ctx, tabBody, book));
      tabBody.appendChild(APP.el('<div class="footline">Every line here calibrates the cost book + pricing intelligence.</div>'));
    });
  }

  function buildAddLineForm(ctx, tabBody, book) {
    var items = book && Array.isArray(book.items) ? book.items : [];
    var byLabel = {};
    var options = items.map(function (item) {
      var label = item.service + " — " + item.description;
      byLabel[label] = item;
      return '<option value="' + esc(label) + '"></option>';
    }).join("");

    var card = APP.el('<div class="card"><h2>Add cost line</h2>' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD + '><span ' + LABEL + ">Cost book item (optional)</span>" +
          "<input " + INPUT + ' list="pjCostbook" data-f="book" placeholder="' + (items.length ? "Type to search the cost book…" : "Cost book unavailable") + '" />' +
          '<datalist id="pjCostbook">' + options + "</datalist></label>" +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Trade</span><input " + INPUT + ' data-f="trade" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Description</span><input " + INPUT + ' data-f="desc" /></label>' +
      "</div>" +
      '<div ' + ROW + ' style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;margin-top:0.5rem">' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Qty</span><input " + INPUT + ' data-f="qty" type="number" min="0" step="any" value="1" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Unit</span><input " + INPUT + ' data-f="unit" value="job" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Actual total $</span><input " + INPUT + ' data-f="total" type="number" min="0" step="any" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Sub / vendor</span><input " + INPUT + ' data-f="sub" placeholder="Who did the work" /></label>' +
        '<button class="btn primary" type="button" data-f="add">Add line</button>' +
      "</div>" +
      '<div class="footline" data-f="msg"></div></div>');

    var picked = { costbookId: "" };
    var bookInput = card.querySelector('[data-f="book"]');
    bookInput.addEventListener("change", function () {
      var item = byLabel[bookInput.value];
      picked.costbookId = item ? item.id : "";
      if (item) {
        card.querySelector('[data-f="trade"]').value = item.trade || "";
        card.querySelector('[data-f="unit"]').value = item.unit || "job";
        if (!card.querySelector('[data-f="desc"]').value) card.querySelector('[data-f="desc"]').value = item.description || "";
      }
    });

    card.querySelector('[data-f="add"]').addEventListener("click", function () {
      var msg = card.querySelector('[data-f="msg"]');
      var line = {
        costbookId: picked.costbookId,
        trade: card.querySelector('[data-f="trade"]').value.trim(),
        description: card.querySelector('[data-f="desc"]').value.trim(),
        qty: Number(card.querySelector('[data-f="qty"]').value || 1),
        unit: card.querySelector('[data-f="unit"]').value.trim() || "job",
        actualTotal: Number(card.querySelector('[data-f="total"]').value || 0),
        subName: card.querySelector('[data-f="sub"]').value.trim()
      };
      if (!line.description && !line.actualTotal) { msg.textContent = "Add a description or an amount first."; return; }
      msg.textContent = "Saving…";
      putProject(ctx.record, { lines: (ctx.record.lines || []).concat([line]) }).then(function () {
        APP.toast("Line added");
        renderTab(ctx, tabBody);
      }).catch(function (err) { msg.textContent = "Save failed: " + err.message; });
    });
    return card;
  }

  /* ──────────────── Photos tab ──────────────── */

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

  function renderPhotosTab(ctx, tabBody) {
    tabBody.appendChild(loadingEl("Loading photo timeline"));
    resolvePhotofeedId(ctx).then(function (pfId) {
      return APP.fetchJSON("/api/photofeed?projectId=" + encodeURIComponent(pfId));
    }).then(function (entries) {
      tabBody.innerHTML = "";
      var state = { phase: "" };

      var chips = APP.el('<div class="chips">' +
        '<button class="chip active" type="button" data-phase="">All phases</button>' +
        PHASES.map(function (p) { return '<button class="chip" type="button" data-phase="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") +
      "</div>");
      tabBody.appendChild(chips);

      var feed = APP.el('<div style="display:grid;gap:0.9rem"></div>');
      tabBody.appendChild(feed);
      tabBody.appendChild(buildAddEntryForm(ctx, tabBody));

      chips.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-phase]");
        if (!chip) return;
        state.phase = chip.getAttribute("data-phase");
        chips.querySelectorAll(".chip").forEach(function (c) {
          c.classList.toggle("active", c.getAttribute("data-phase") === state.phase);
        });
        drawFeed();
      });

      function drawFeed() {
        feed.innerHTML = "";
        var visible = (entries || []).filter(function (entry) { return !state.phase || entry.phase === state.phase; });
        if (!visible.length) {
          feed.appendChild(APP.el('<div class="empty"><b>' +
            (state.phase ? "No " + esc(state.phase) + " photos" : "No photos logged yet") + "</b>" +
            (state.phase ? "Try another phase filter." : "Add the first photo below — galleries and photo reports build from this timeline.") + "</div>"));
          return;
        }
        // newest day first, entries within a day in taken order
        var days = {};
        visible.forEach(function (entry) {
          var day = String(entry.takenAt || "").slice(0, 10) || "undated";
          (days[day] = days[day] || []).push(entry);
        });
        Object.keys(days).sort().reverse().forEach(function (day) {
          var dayCard = APP.el('<div class="card"><h2>' + esc(APP.fmtDate(day + "T12:00:00")) +
            ' · ' + esc(String(days[day].length)) + " photo" + (days[day].length === 1 ? "" : "s") + "</h2>" +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:0.7rem"></div></div>');
          var grid = dayCard.lastElementChild;
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
                renderTab(ctx, tabBody);
              }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
            });
            grid.appendChild(node);
          });
          feed.appendChild(dayCard);
        });
      }
      drawFeed();
    }).catch(function (err) {
      tabBody.innerHTML = "";
      tabBody.appendChild(errorEl(err.message, function () { renderTab(ctx, tabBody); }));
    });
  }

  function buildAddEntryForm(ctx, tabBody) {
    var card = APP.el('<div class="card"><h2>Add photo entry</h2>' +
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
        renderTab(ctx, tabBody);
      }).catch(function (err) { msg.textContent = "Failed: " + err.message; });
    });
    return card;
  }

  /* ──────────────── Change orders tab ──────────────── */

  function renderChangeOrdersTab(ctx, tabBody) {
    tabBody.appendChild(loadingEl("Loading change orders"));
    APP.fetchJSON("/api/changeorders?projectId=" + encodeURIComponent(ctx.record.id)).then(function (cos) {
      tabBody.innerHTML = "";
      cos = cos || [];
      var approvedTotal = cos.filter(function (co) { return co.status === "approved"; })
        .reduce(function (sum, co) { return sum + (Number(co.total) || 0); }, 0);
      var awaiting = cos.filter(function (co) { return co.status === "sent"; }).length;

      tabBody.appendChild(APP.el('<div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
        '<div class="kpi"><b>' + esc(String(cos.length)) + "</b><span>Change orders</span></div>" +
        '<div class="kpi" data-accent="green"><b>' + esc(APP.fmtMoney(approvedTotal)) + "</b><span>Approved $</span></div>" +
        '<div class="kpi" data-accent="amber"><b>' + esc(String(awaiting)) + "</b><span>Awaiting client</span></div>" +
      "</div>"));

      if (!cos.length) {
        tabBody.appendChild(APP.el('<div class="empty"><b>No change orders yet</b>' +
          "Scope creep costs money — write it up below and send it for a client signature.</div>"));
      } else {
        cos.forEach(function (co) { tabBody.appendChild(buildCoCard(ctx, tabBody, co)); });
      }
      tabBody.appendChild(buildCoForm(ctx, tabBody));
    }).catch(function (err) {
      tabBody.innerHTML = "";
      tabBody.appendChild(errorEl(err.message, function () { renderTab(ctx, tabBody); }));
    });
  }

  function buildCoCard(ctx, tabBody, co) {
    var pill = '<span class="pill ' + (CO_STATUS_PILL[co.status] || "") + '">' + esc(co.status) + "</span>";
    var lineRows = (co.lineItems || []).map(function (line) {
      return "<tr><td>" + esc(line.description) + '</td><td class="nowrap">' + esc(String(line.qty)) + " " + esc(line.unit) +
        '</td><td class="nowrap">' + esc(APP.fmtMoney(line.unitCost)) + '</td><td class="nowrap"><b>' + esc(APP.fmtMoney(line.total)) + "</b></td></tr>";
    }).join("");
    var canSend = co.status === "draft" || co.status === "sent";
    var canVoid = co.status !== "void";

    var card = APP.el('<div class="card">' +
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
        renderTab(ctx, tabBody);
      }).catch(function (err) { APP.toast("Void failed: " + err.message); });
    });
    return card;
  }

  function buildCoForm(ctx, tabBody) {
    var coLines = [{ description: "", qty: 1, unit: "ea", unitCost: 0 }];
    var card = APP.el('<div class="card"><h2>New change order</h2>' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD + '><span ' + LABEL + ">Title</span><input " + INPUT + ' data-f="title" placeholder="e.g. Upgrade to quartz counters" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Markup %</span><input " + INPUT + ' data-f="markup" type="number" step="any" value="0" /></label>' +
        '<label ' + FIELD_SM + '><span ' + LABEL + ">Days impact</span><input " + INPUT + ' data-f="days" type="number" step="1" value="0" /></label>' +
      "</div>" +
      '<div ' + ROW + ' style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;margin-top:0.5rem">' +
        '<label ' + FIELD + '><span ' + LABEL + ">Scope of change</span><input " + INPUT + ' data-f="desc" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Why it’s needed</span><input " + INPUT + ' data-f="reason" /></label>' +
      "</div>" +
      '<div ' + ROW + ' style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;margin-top:0.5rem">' +
        '<label ' + FIELD + '><span ' + LABEL + ">Client name</span><input " + INPUT + ' data-f="cname" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Client email</span><input " + INPUT + ' data-f="cemail" type="email" /></label>' +
      "</div>" +
      '<div style="margin-top:0.6rem"><span ' + LABEL + ">Line items</span><div data-f=\"lines\"></div>" +
        '<button class="btn" type="button" data-f="addrow" style="margin-top:0.35rem">+ Line item</button>' +
        '<span class="muted" style="font-size:0.76rem;margin-left:0.6rem" data-f="preview"></span></div>' +
      '<div style="margin-top:0.7rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">' +
        '<button class="btn primary" type="button" data-f="create">Create draft change order</button>' +
        '<span class="footline" data-f="msg"></span></div>' +
    "</div>");

    var linesBox = card.querySelector('[data-f="lines"]');
    var preview = card.querySelector('[data-f="preview"]');

    function updatePreview() {
      var subtotal = coLines.reduce(function (sum, l) { return sum + (Number(l.qty) || 1) * (Number(l.unitCost) || 0); }, 0);
      var markup = Number(card.querySelector('[data-f="markup"]').value) || 0;
      preview.textContent = "Subtotal " + APP.fmtMoney(subtotal) + " → total " + APP.fmtMoney(subtotal * (1 + markup / 100));
    }

    function drawRows() {
      linesBox.innerHTML = "";
      coLines.forEach(function (line, index) {
        var row = APP.el('<div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;margin-top:0.35rem">' +
          '<input ' + INPUT + ' data-k="description" placeholder="Description" value="' + esc(line.description) + '" style="flex:2 1 220px;font:inherit;font-size:0.82rem;min-height:32px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem" />' +
          '<input ' + INPUT + ' data-k="qty" type="number" step="any" min="0" title="Qty" value="' + esc(String(line.qty)) + '" style="flex:0 1 70px;font:inherit;font-size:0.82rem;min-height:32px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem" />' +
          '<input ' + INPUT + ' data-k="unit" title="Unit" value="' + esc(line.unit) + '" style="flex:0 1 70px;font:inherit;font-size:0.82rem;min-height:32px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem" />' +
          '<input ' + INPUT + ' data-k="unitCost" type="number" step="any" min="0" title="Unit cost $" placeholder="Unit $" value="' + esc(String(line.unitCost || "")) + '" style="flex:0 1 110px;font:inherit;font-size:0.82rem;min-height:32px;border:1px solid #d8dee8;border-radius:7px;padding:0.2rem 0.5rem" />' +
          '<button class="btn" type="button" data-k="del" title="Remove line" style="min-height:32px">✕</button>' +
        "</div>");
        row.addEventListener("input", function (e) {
          var key = e.target.getAttribute("data-k");
          if (!key || key === "del") return;
          line[key] = (key === "qty" || key === "unitCost") ? Number(e.target.value || 0) : e.target.value;
          updatePreview();
        });
        row.querySelector('[data-k="del"]').addEventListener("click", function () {
          coLines.splice(index, 1);
          if (!coLines.length) coLines.push({ description: "", qty: 1, unit: "ea", unitCost: 0 });
          drawRows();
          updatePreview();
        });
        linesBox.appendChild(row);
      });
    }
    drawRows();
    updatePreview();
    card.querySelector('[data-f="markup"]').addEventListener("input", updatePreview);
    card.querySelector('[data-f="addrow"]').addEventListener("click", function () {
      coLines.push({ description: "", qty: 1, unit: "ea", unitCost: 0 });
      drawRows();
    });

    card.querySelector('[data-f="create"]').addEventListener("click", function () {
      var msg = card.querySelector('[data-f="msg"]');
      var title = card.querySelector('[data-f="title"]').value.trim();
      if (!title) { msg.textContent = "Give the change order a title."; return; }
      msg.textContent = "Creating…";
      APP.fetchJSON("/api/changeorders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: ctx.record.id,
          projectName: ctx.record.projectName,
          title: title,
          description: card.querySelector('[data-f="desc"]').value.trim(),
          reason: card.querySelector('[data-f="reason"]').value.trim(),
          lineItems: coLines,
          markupPct: Number(card.querySelector('[data-f="markup"]').value || 0),
          daysImpact: Number(card.querySelector('[data-f="days"]').value || 0),
          clientName: card.querySelector('[data-f="cname"]').value.trim(),
          clientEmail: card.querySelector('[data-f="cemail"]').value.trim()
        })
      }).then(function () {
        APP.toast("Draft change order created");
        renderTab(ctx, tabBody);
      }).catch(function (err) { msg.textContent = "Create failed: " + err.message; });
    });
    return card;
  }

  /* ──────────────── RFQs tab ──────────────── */

  function rfqMatchesProject(rfq, projectName) {
    var name = String(projectName || "").toLowerCase().trim();
    if (!name) return false;
    return ["scopeTitle", "title", "customerName", "projectType"].some(function (key) {
      var value = String(rfq[key] || "").toLowerCase().trim();
      return value && (value.indexOf(name) !== -1 || name.indexOf(value) !== -1);
    });
  }

  function renderRfqsTab(ctx, tabBody) {
    tabBody.appendChild(loadingEl("Loading RFQs"));
    APP.fetchJSON("/api/rfq").then(function (rfqs) {
      tabBody.innerHTML = "";
      var matched = (rfqs || []).filter(function (rfq) { return rfqMatchesProject(rfq, ctx.record.projectName); });
      if (!matched.length) {
        tabBody.appendChild(APP.el('<div class="empty"><b>No RFQs linked to this project</b>' +
          'RFQs are created from Bid Lab scopes — <a href="bid_lab.html">open Bid Lab</a> to send one.</div>'));
        return;
      }
      matched.forEach(function (rfq) {
        var counts = rfq.statusCounts || {};
        var recipients = (rfq.recipients || []).map(function (r) {
          return '<span style="display:inline-flex;gap:0.3rem;align-items:center;margin:0.15rem 0.5rem 0.15rem 0">' +
            '<span class="pill ' + (RECIPIENT_PILL[r.status] || "") + '">' + esc(r.status) + "</span>" +
            '<span style="font-size:0.8rem">' + esc(r.companyName || r.email) + "</span></span>";
        }).join("");
        tabBody.appendChild(APP.el('<div class="card">' +
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
      tabBody.appendChild(APP.el('<div class="footline">Matched loosely by project name. RFQs are created from Bid Lab scopes — <a href="bid_lab.html">Bid Lab</a>.</div>'));
    }).catch(function (err) {
      tabBody.innerHTML = "";
      tabBody.appendChild(errorEl(err.message, function () { renderTab(ctx, tabBody); }));
    });
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
