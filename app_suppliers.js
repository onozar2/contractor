// app_suppliers.js — Suppliers / manufacturers roster view.
// Registers the "suppliers" view with the APP shell (app.html). Vanilla JS, shell CSS classes only.
// Reference list, not a workflow: AI quick-add + metric row + search/category chips + table + drawer editor.
(function () {
  "use strict";
  if (!window.APP) { console.error("app_suppliers.js: APP shell not found"); return; }

  var API = "/api/suppliers";
  var esc = APP.esc;

  // Mirrors suppliers.js CATEGORIES/ACCOUNT_TYPES/ACCOUNT_STATUSES (server has no public
  // /api/suppliers/meta route, so the enums are duplicated here — keep in sync with suppliers.js).
  var CATEGORIES = [
    "Windows & Doors", "Electrical", "Plumbing", "Roofing", "Paint", "Tile & Stone",
    "HVAC", "Drywall & Insulation", "Concrete & Masonry", "Lumber & Building Materials",
    "Cabinets & Countertops", "Solar", "Flooring", "Turf & Landscape", "Glass & Mirror",
    "Wire & Cable", "Appliances", "Pool & Spa", "Fireplace", "Restoration Equipment"
  ];
  var ACCOUNT_TYPES = ["distributor", "manufacturer-dealer", "big-box-pro", "supply-house"];
  var ACCOUNT_STATUSES = ["not_started", "researching", "applied", "open"];
  var STATUS_CLS = { not_started: "amber", researching: "", applied: "plum", open: "green" };
  var SUPPLIER_TYPES = ["manufacturer", "wholesaler", "distributor", "retailer"];
  var TYPE_CLS = { manufacturer: "green" };

  var roster = null;
  var rosterPromise = null;

  var state = { q: "", category: "", mfgFirst: false };

  var FIELD = "min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.3rem 0.5rem;font:inherit;font-size:0.84rem;background:#f5f7fa;width:100%";
  var LBL = "display:block;color:#687587;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.15rem";
  var MUTED = "color:#687587;font-size:0.8rem";
  var HINT = "color:#687587;font-size:0.76rem;font-style:italic";

  function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function labelize(v) { return clean(v || "unknown").replace(/_/g, " "); }
  function matchEnum(value, list) {
    var v = clean(value).toLowerCase();
    for (var i = 0; i < list.length; i++) { if (list[i].toLowerCase() === v) return list[i]; }
    return "";
  }
  function statusPill(status) {
    var s = status || "not_started";
    var cls = STATUS_CLS[s] != null ? STATUS_CLS[s] : "";
    return '<span class="pill' + (cls ? " " + cls : "") + '">' + esc(labelize(s)) + "</span>";
  }
  function typePill(type) {
    var t = clean(type);
    if (!t) return '<span class="pill" style="opacity:0.55">unspecified</span>';
    var cls = TYPE_CLS[t] || "";
    return '<span class="pill' + (cls ? " " + cls : "") + '">' + esc(labelize(t)) + "</span>";
  }
  function errorCard(message, retryLabel) {
    return '<div class="card"><div style="color:#b42318;font-weight:700">Something went wrong</div>' +
      '<div style="' + MUTED + ';margin:0.3rem 0 0.6rem">' + esc(message) + "</div>" +
      '<button type="button" class="btn" data-act="retry">' + esc(retryLabel || "Retry") + "</button></div>";
  }

  // Rebuilds the full PUT body for a supplier record, applying targeted overrides.
  // The server's PUT route replaces every normalized field, so partial bodies would
  // blank out anything not included — always send the complete shape.
  function fullBody(s, overrides) {
    var base = {
      name: s.name || "",
      category: s.category || CATEGORIES[0],
      accountType: s.accountType || ACCOUNT_TYPES[0],
      accountStatus: s.accountStatus || ACCOUNT_STATUSES[0],
      brands: (s.brands || []).join(", "),
      suppliesServices: (s.suppliesServices || []).join(", "),
      accountCostEstimate: s.accountCostEstimate || "",
      region: s.region || "Southern California",
      accountRequirements: s.accountRequirements || "",
      minimumSpend: s.minimumSpend || "",
      leadTime: s.leadTime || "",
      contactName: s.contactName || "",
      phone: s.phone || "",
      email: s.email || "",
      website: s.website || "",
      sourceUrls: (s.sourceUrls || []).join("\n"),
      notes: s.notes || "",
      trusted: !!s.trusted,
      supplierType: s.supplierType || ""
    };
    return Object.assign(base, overrides || {});
  }

  function fetchSuppliers(force) {
    if (roster && !force) return Promise.resolve(roster);
    if (!rosterPromise || force) {
      rosterPromise = APP.fetchJSON(API).then(function (rows) {
        roster = Array.isArray(rows) ? rows : [];
        return roster;
      }).catch(function (err) { rosterPromise = null; throw err; });
    }
    return rosterPromise;
  }

  // ══════════════════════ FEELER EMAIL ══════════════════════
  // Short, warm ask for trade-account setup, minimum spend, lead times, contractor
  // pricing tiers, and who to talk to. Client-side only — no API call.
  function buildFeelerEmail(s) {
    var firstName = clean(s.contactName).split(" ")[0];
    var greeting = "Hi" + (firstName ? " " + firstName : "") + ",";
    var body = greeting + "\n\n" +
      "I run We The People Construction, a general contractor here in Southern California, and I'd like to set up a trade account with " + (s.name || "your team") + " for upcoming jobs.\n\n" +
      "When you get a chance, could you send over:\n" +
      "- What's involved in opening a trade/contractor account\n" +
      "- Any minimum spend or minimum opening order\n" +
      "- Typical lead times — in-stock vs. special order\n" +
      "- Whether you offer contractor or volume pricing tiers\n" +
      "- Who's the best person for me to work with going forward\n\n" +
      "Happy to hop on a call if that's easier. Thanks for your time.\n\n" +
      "Best,\nOri\nWe The People Construction";
    var subject = "Trade account inquiry — We The People Construction";
    return { subject: subject, body: body };
  }

  function buildMailto(email, subject, body) {
    return "mailto:" + encodeURIComponent(email || "") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function openFeelerDrawer(record, container) {
    var draft = buildFeelerEmail(record);
    var drawer = APP.el(
      '<div>' +
        '<div class="drawer-head">' +
          "<h1>Draft feeler — " + esc(record.name || "Supplier") + "</h1>" +
          '<button type="button" class="btn" data-action="close">Close</button>' +
        "</div>" +
        '<div class="drawer-body">' +
          (record.email ? "" : '<div style="' + HINT + '">No email on file — copy the text below and send manually, or add an email in the supplier profile first.</div>') +
          '<label style="display:block"><span style="' + LBL + '">Subject</span><input id="feelSubject" style="' + FIELD + '" value="' + esc(draft.subject) + '" /></label>' +
          '<label style="display:block"><span style="' + LBL + '">Body</span><textarea id="feelBody" style="' + FIELD + ';min-height:230px;resize:vertical">' + esc(draft.body) + "</textarea></label>" +
          '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">' +
            '<a class="btn primary" id="feelMailto" href="' + esc(buildMailto(record.email, draft.subject, draft.body)) + '" target="_blank" rel="noopener">Open in email client</a>' +
            '<button type="button" class="btn" id="feelCopy">Copy email</button>' +
            '<span data-role="status" style="' + MUTED + '"></span>' +
          "</div>" +
        "</div>" +
      "</div>"
    );

    var subjectEl = drawer.querySelector("#feelSubject");
    var bodyEl = drawer.querySelector("#feelBody");
    var mailtoEl = drawer.querySelector("#feelMailto");
    function refreshMailto() { mailtoEl.setAttribute("href", buildMailto(record.email, subjectEl.value, bodyEl.value)); }
    subjectEl.addEventListener("input", refreshMailto);
    bodyEl.addEventListener("input", refreshMailto);

    drawer.querySelector('[data-action="close"]').addEventListener("click", APP.closeDrawer);

    drawer.querySelector("#feelCopy").addEventListener("click", function () {
      var statusEl = drawer.querySelector('[data-role="status"]');
      var text = "Subject: " + subjectEl.value + "\n\n" + bodyEl.value;
      var markContacted = function () {
        statusEl.style.color = "";
        statusEl.textContent = "Copied to clipboard.";
        APP.toast("Feeler copied");
        if (!record.accountStatus || record.accountStatus === "not_started") {
          APP.fetchJSON(API + "/" + encodeURIComponent(record.id), {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fullBody(record, { accountStatus: "contacted" }))
          }).then(function () { return fetchSuppliers(true); }).then(function () {
            if (container) buildList(container);
          }).catch(function () { /* non-critical — status pill just won't flip */ });
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(markContacted).catch(function () {
          statusEl.style.color = "#b42318";
          statusEl.textContent = "Copy failed — select and copy manually.";
        });
      } else {
        statusEl.style.color = "#b42318";
        statusEl.textContent = "Clipboard unavailable — select and copy manually.";
      }
    });

    APP.openDrawer(drawer);
  }

  // ══════════════════════ AI QUICK-ADD ══════════════════════
  function buildQuickAdd() {
    return '<div class="card" id="supQuick">' +
      "<h2>AI quick-add</h2>" +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.4rem">' +
        '<input id="supQuickText" type="text" placeholder="Type it how you’d text it: ‘Beach Wire &amp; Cable, wholesaler in Signal Hill, low-voltage wire, ask for Dana’" style="' + FIELD + ';flex:1;min-width:260px" />' +
        '<button type="button" class="btn primary" id="supQuickBtn">Add supplier</button>' +
      "</div>" +
      '<div id="supQuickResult" style="margin-top:0.6rem"></div>' +
    "</div>";
  }

  function wireQuickAdd(container) {
    var text = container.querySelector("#supQuickText");
    var btn = container.querySelector("#supQuickBtn");
    var result = container.querySelector("#supQuickResult");

    function submit() {
      var value = text.value.trim();
      if (!value) { result.innerHTML = '<div style="' + MUTED + ';color:#b42318">Type a description first.</div>'; return; }
      btn.disabled = true;
      result.innerHTML = '<div style="' + MUTED + '">Parsing…</div>';
      APP.fetchJSON(API + "/ai-parse", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value })
      }).then(function (res) {
        renderQuickDraft(container, result, res && res.draft ? res.draft : {});
      }).catch(function (err) {
        result.innerHTML = '<div style="' + MUTED + ';color:#b42318">Couldn’t parse that: ' + esc(err.message) + "</div>";
      }).then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
    }

    btn.addEventListener("click", submit);
    text.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  function renderQuickDraft(container, result, draft) {
    var category = matchEnum(draft.category, CATEGORIES) || CATEGORIES[0];
    var supplierType = matchEnum(draft.supplierType, SUPPLIER_TYPES);
    var categoryOptions = CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '"' + (category === c ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");
    var typeOptions = '<option value="">unspecified</option>' + SUPPLIER_TYPES.map(function (t) {
      return '<option value="' + esc(t) + '"' + (supplierType === t ? " selected" : "") + ">" + esc(labelize(t)) + "</option>";
    }).join("");

    result.innerHTML =
      '<div style="border:1px dashed #d8dee8;border-radius:8px;padding:0.7rem;background:#f7f9fc">' +
        '<div style="' + MUTED + ';margin-bottom:0.5rem">Review the AI fill, then save.</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.6rem">' +
          '<label><span style="' + LBL + '">Name *</span><input id="qdName" style="' + FIELD + '" value="' + esc(draft.name || "") + '" /></label>' +
          '<label><span style="' + LBL + '">Category</span><select id="qdCategory" style="' + FIELD + '">' + categoryOptions + "</select></label>" +
          '<label><span style="' + LBL + '">Supplier type</span><select id="qdType" style="' + FIELD + '">' + typeOptions + "</select></label>" +
          '<label><span style="' + LBL + '">Contact name</span><input id="qdContact" style="' + FIELD + '" value="' + esc(draft.contactName || "") + '" /></label>' +
          '<label><span style="' + LBL + '">Phone</span><input id="qdPhone" style="' + FIELD + '" value="' + esc(draft.phone || "") + '" /></label>' +
          '<label><span style="' + LBL + '">Email</span><input id="qdEmail" type="email" style="' + FIELD + '" value="' + esc(draft.email || "") + '" /></label>' +
          '<label><span style="' + LBL + '">Website</span><input id="qdWebsite" style="' + FIELD + '" value="' + esc(draft.website || "") + '" /></label>' +
          '<label><span style="' + LBL + '">Minimum spend</span><input id="qdMinSpend" style="' + FIELD + '" value="' + esc(draft.minSpend || "") + '" /></label>' +
          '<label><span style="' + LBL + '">Lead time</span><input id="qdLeadTime" style="' + FIELD + '" value="' + esc(draft.leadTime || "") + '" /></label>' +
        "</div>" +
        '<label style="display:block;margin-top:0.6rem"><span style="' + LBL + '">Brands</span><input id="qdBrands" style="' + FIELD + '" value="' + esc((draft.brands || []).join(", ")) + '" /></label>' +
        '<label style="display:block;margin-top:0.6rem"><span style="' + LBL + '">Supplies / services</span><input id="qdServices" style="' + FIELD + '" value="' + esc((draft.suppliesServices || []).join(", ")) + '" /></label>' +
        '<label style="display:block;margin-top:0.6rem"><span style="' + LBL + '">Notes</span><textarea id="qdNotes" style="' + FIELD + ';min-height:50px;resize:vertical">' + esc(draft.notes || "") + "</textarea></label>" +
        '<div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.6rem">' +
          '<button type="button" class="btn primary" id="qdSave">Save supplier</button>' +
          '<button type="button" class="btn" id="qdDiscard">Discard</button>' +
          '<span data-role="status" style="' + MUTED + '"></span>' +
        "</div>" +
      "</div>";

    result.querySelector("#qdDiscard").addEventListener("click", function () {
      result.innerHTML = "";
      var input = container.querySelector("#supQuickText");
      if (input) input.value = "";
    });

    result.querySelector("#qdSave").addEventListener("click", function () {
      var statusEl = result.querySelector('[data-role="status"]');
      var name = result.querySelector("#qdName").value.trim();
      if (!name) { statusEl.style.color = "#b42318"; statusEl.textContent = "Name is required."; return; }
      statusEl.style.color = "";
      statusEl.textContent = "Saving…";
      var body = {
        name: name,
        category: result.querySelector("#qdCategory").value,
        supplierType: result.querySelector("#qdType").value,
        accountType: ACCOUNT_TYPES[0],
        accountStatus: ACCOUNT_STATUSES[0],
        trusted: false,
        contactName: result.querySelector("#qdContact").value,
        phone: result.querySelector("#qdPhone").value,
        email: result.querySelector("#qdEmail").value,
        website: result.querySelector("#qdWebsite").value,
        minimumSpend: result.querySelector("#qdMinSpend").value,
        leadTime: result.querySelector("#qdLeadTime").value,
        brands: result.querySelector("#qdBrands").value,
        suppliesServices: result.querySelector("#qdServices").value,
        notes: result.querySelector("#qdNotes").value,
        region: "Southern California"
      };
      APP.fetchJSON(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function () {
        APP.toast("Supplier added");
        result.innerHTML = "";
        var input = container.querySelector("#supQuickText");
        if (input) input.value = "";
        return fetchSuppliers(true);
      }).then(function () {
        buildList(container);
      }).catch(function (err) {
        statusEl.style.color = "#b42318";
        statusEl.textContent = "Save failed: " + err.message;
      });
    });
  }

  // ══════════════════════ LIST VIEW ══════════════════════
  function renderList(container) {
    container.innerHTML = '<div class="card"><span style="' + MUTED + '">Loading suppliers…</span></div>';
    fetchSuppliers().then(function () { buildList(container); }).catch(function (err) {
      container.innerHTML = errorCard(err.message || "Failed to load suppliers.");
      var retry = container.querySelector('[data-act="retry"]');
      if (retry) retry.addEventListener("click", function () { renderList(container); });
    });
  }

  function metrics() {
    var total = roster.length;
    var manufacturers = roster.filter(function (s) { return s.supplierType === "manufacturer"; }).length;
    var open = roster.filter(function (s) { return s.accountStatus === "open"; }).length;
    var pending = roster.filter(function (s) { return s.accountStatus && s.accountStatus !== "open"; }).length;
    return { total: total, manufacturers: manufacturers, open: open, pending: pending };
  }

  function listFiltered() {
    var q = state.q.toLowerCase().trim();
    return roster.filter(function (s) {
      if (state.category && s.category !== state.category) return false;
      if (q) {
        var hay = [
          s.name, s.category, s.accountType, s.supplierType, (s.brands || []).join(" "),
          (s.suppliesServices || []).join(" "), s.contactName, s.phone, s.email,
          s.website, s.region, s.notes
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // Trusted always sorts first; "Manufacturers first" is a secondary sort on top of that.
  // Stable relative to the server's category/name order otherwise.
  function sortedFiltered() {
    var rows = listFiltered().map(function (r, i) { return { r: r, i: i }; });
    rows.sort(function (a, b) {
      var at = a.r.trusted ? 1 : 0, bt = b.r.trusted ? 1 : 0;
      if (at !== bt) return bt - at;
      if (state.mfgFirst) {
        var am = a.r.supplierType === "manufacturer" ? 1 : 0, bm = b.r.supplierType === "manufacturer" ? 1 : 0;
        if (am !== bm) return bm - am;
      }
      return a.i - b.i;
    });
    return rows.map(function (x) { return x.r; });
  }

  function buildList(container) {
    var m = metrics();
    var usedCategories = [];
    var seen = {};
    roster.forEach(function (s) {
      if (s.category && !seen[s.category]) { seen[s.category] = true; usedCategories.push(s.category); }
    });
    usedCategories.sort();

    container.innerHTML =
      '<div class="viewhead"><h1>Suppliers</h1></div>' +
      buildQuickAdd() +
      '<div class="kpis">' +
        kpi(m.total, "Total suppliers") +
        kpi(m.manufacturers, "Direct manufacturers", m.manufacturers ? "green" : null) +
        kpi(m.open, "Accounts open", "green") +
        kpi(m.pending, "Accounts pending", m.pending ? "amber" : null) +
      "</div>" +
      '<div class="card">' +
        '<div style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center">' +
          '<input id="supSearch" type="text" placeholder="Search name, brand, service, contact, region…" value="' + esc(state.q) + '" style="' + FIELD + ';flex:1;min-width:220px;width:auto" />' +
          '<button type="button" class="btn" id="supAddManual">+ Add manually</button>' +
        "</div>" +
        '<div class="chips" id="supChips" style="margin-top:0.6rem">' +
          '<button type="button" class="chip' + (!state.category ? " active" : "") + '" data-cat="">All categories</button>' +
          usedCategories.map(function (c) {
            return '<button type="button" class="chip' + (state.category === c ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
          }).join("") +
          '<button type="button" class="chip' + (state.mfgFirst ? " active" : "") + '" id="supMfgFirst" style="margin-left:auto">Manufacturers first</button>' +
        "</div>" +
        '<div style="' + HINT + ';margin-top:0.5rem">Direct-from-manufacturer beats wholesale when volume justifies it — mark types as you learn them.</div>' +
      "</div>" +
      '<div class="card">' +
        '<div id="supCount" style="' + MUTED + ';margin-bottom:0.4rem"></div>' +
        '<div style="overflow-x:auto">' +
          '<table class="table"><thead><tr>' +
            "<th>Name</th><th>Type</th><th>Category</th><th>Account status</th><th>Min spend</th><th>Lead time</th><th>Contact</th><th>Actions</th>" +
          '</tr></thead><tbody id="supRows"></tbody></table>' +
        "</div>" +
        '<div id="supEmpty"></div>' +
      "</div>";

    function kpi(value, label, accent) {
      return '<div class="kpi"' + (accent ? ' data-accent="' + accent + '"' : "") + "><b>" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
    }

    wireQuickAdd(container);

    var search = container.querySelector("#supSearch");
    var chips = container.querySelector("#supChips");

    search.addEventListener("input", function () { state.q = search.value; renderTable(container); });
    chips.addEventListener("click", function (e) {
      var mfgChip = e.target.closest("#supMfgFirst");
      if (mfgChip) {
        state.mfgFirst = !state.mfgFirst;
        mfgChip.classList.toggle("active", state.mfgFirst);
        renderTable(container);
        return;
      }
      var chip = e.target.closest(".chip");
      if (!chip) return;
      state.category = chip.dataset.cat || "";
      chips.querySelectorAll(".chip").forEach(function (c) {
        if (c.id === "supMfgFirst") return;
        c.classList.toggle("active", (c.dataset.cat || "") === state.category);
      });
      renderTable(container);
    });
    container.querySelector("#supRows").addEventListener("click", function (e) {
      var feelerBtn = e.target.closest("[data-feeler]");
      if (feelerBtn) {
        e.stopPropagation();
        var rec = roster.find(function (s) { return s.id === feelerBtn.dataset.feeler; });
        if (rec) openFeelerDrawer(rec, container);
        return;
      }
      var tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      var record = roster.find(function (s) { return s.id === tr.dataset.id; });
      if (record) openSupplierDrawer(record, container);
    });
    container.querySelector("#supAddManual").addEventListener("click", function () {
      openSupplierDrawer(null, container);
    });

    renderTable(container);
  }

  function renderTable(container) {
    var body = container.querySelector("#supRows");
    var count = container.querySelector("#supCount");
    var emptyBox = container.querySelector("#supEmpty");
    if (!body) return;
    var rows = sortedFiltered();

    count.textContent = rows.length + " of " + roster.length + " shown";

    if (!rows.length) {
      body.innerHTML = "";
      emptyBox.innerHTML = roster.length
        ? '<div class="empty"><b>No suppliers match these filters</b>Try a different category or search term.</div>'
        : '<div class="empty"><b>No suppliers yet</b>Add your first supplier or manufacturer account to start tracking coverage.</div>';
      return;
    }
    emptyBox.innerHTML = "";
    body.innerHTML = rows.map(function (s) {
      var contact = [s.contactName, s.phone, s.email].filter(Boolean).map(function (line) {
        return '<div style="' + MUTED + '">' + esc(line) + "</div>";
      }).join("") || '<span style="' + MUTED + '">—</span>';
      var trusted = !!s.trusted;
      var namecell = (trusted ? '<span title="Trusted supplier" style="margin-right:0.3rem">⭐</span>' : "") +
        "<b>" + esc(s.name || "Unnamed supplier") + "</b>";
      return '<tr data-id="' + esc(s.id) + '" style="cursor:pointer' + (trusted ? ";font-weight:700;background:#fffdf3" : "") + '">' +
        "<td>" + namecell + "</td>" +
        "<td>" + typePill(s.supplierType) + "</td>" +
        "<td>" + esc(s.category || "") + "</td>" +
        "<td>" + statusPill(s.accountStatus) + "</td>" +
        "<td>" + esc(s.minimumSpend || "—") + "</td>" +
        "<td>" + esc(s.leadTime || "—") + "</td>" +
        "<td>" + contact + "</td>" +
        '<td><button type="button" class="btn" data-feeler="' + esc(s.id) + '">Draft feeler</button></td>' +
      "</tr>";
    }).join("");
  }

  // ══════════════════════ DRAWER (add / edit) ══════════════════════
  function openSupplierDrawer(record, container) {
    var isNew = !record;
    var s = record || {};

    var categoryOptions = CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '"' + ((s.category || CATEGORIES[0]) === c ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");
    var typeOptions = ACCOUNT_TYPES.map(function (t) {
      return '<option value="' + esc(t) + '"' + ((s.accountType || ACCOUNT_TYPES[0]) === t ? " selected" : "") + ">" + esc(labelize(t)) + "</option>";
    }).join("");
    var statusOptions = ACCOUNT_STATUSES.map(function (st) {
      return '<option value="' + esc(st) + '"' + ((s.accountStatus || ACCOUNT_STATUSES[0]) === st ? " selected" : "") + ">" + esc(labelize(st)) + "</option>";
    }).join("");
    var supplierTypeOptions = '<option value="">unspecified</option>' + SUPPLIER_TYPES.map(function (t) {
      return '<option value="' + esc(t) + '"' + ((s.supplierType || "") === t ? " selected" : "") + ">" + esc(labelize(t)) + "</option>";
    }).join("");

    var drawer = APP.el(
      '<div>' +
        '<div class="drawer-head">' +
          "<h1>" + (isNew ? "Add supplier" : esc(s.name || "Edit supplier")) + "</h1>" +
          '<button type="button" class="btn" data-action="close">Close</button>' +
        "</div>" +
        '<div class="drawer-body">' +
          '<label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer">' +
            '<input type="checkbox" id="supTrusted"' + (s.trusted ? " checked" : "") + (isNew ? " disabled" : "") + ' />' +
            "<span>⭐ Trusted supplier</span>" +
          "</label>" +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.6rem">' +
            '<label><span style="' + LBL + '">Name *</span><input id="supName" style="' + FIELD + '" value="' + esc(s.name || "") + '" placeholder="e.g. Ferguson" /></label>' +
            '<label><span style="' + LBL + '">Category</span><select id="supCategory" style="' + FIELD + '">' + categoryOptions + "</select></label>" +
            '<label><span style="' + LBL + '">Account type</span><select id="supType" style="' + FIELD + '">' + typeOptions + "</select></label>" +
            '<label><span style="' + LBL + '">Account status</span><select id="supStatus" style="' + FIELD + '">' + statusOptions + "</select></label>" +
          "</div>" +
          '<div>' +
            '<label><span style="' + LBL + '">Supplier type</span><select id="supSupplierType" style="' + FIELD + ';max-width:260px">' + supplierTypeOptions + "</select></label>" +
            '<div style="' + HINT + ';margin-top:0.25rem">Direct-from-manufacturer beats wholesale when volume justifies it — mark types as you learn them.</div>' +
          "</div>" +
          '<label style="display:block"><span style="' + LBL + '">Brands (comma or newline separated)</span><input id="supBrands" style="' + FIELD + '" value="' + esc((s.brands || []).join(", ")) + '" placeholder="e.g. Milgard, Andersen" /></label>' +
          '<label style="display:block"><span style="' + LBL + '">Supplies / services</span><textarea id="supServices" style="' + FIELD + ';min-height:60px;resize:vertical">' + esc((s.suppliesServices || []).join(", ")) + "</textarea></label>" +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.6rem">' +
            '<label><span style="' + LBL + '">Est. opening cost</span><input id="supCost" style="' + FIELD + '" value="' + esc(s.accountCostEstimate || "") + '" placeholder="e.g. $0 to open; net-30" /></label>' +
            '<label><span style="' + LBL + '">Region</span><input id="supRegion" style="' + FIELD + '" value="' + esc(s.region || "Southern California") + '" /></label>' +
            '<label><span style="' + LBL + '">Minimum spend / opening order</span><input id="supMinSpend" style="' + FIELD + '" value="' + esc(s.minimumSpend || "") + '" placeholder="e.g. $2,500 min on LTL items" /></label>' +
            '<label><span style="' + LBL + '">Lead time</span><input id="supLeadTime" style="' + FIELD + '" value="' + esc(s.leadTime || "") + '" placeholder="e.g. stock 24-48hr, special order 4-6 wks" /></label>' +
          "</div>" +
          '<label style="display:block"><span style="' + LBL + '">Account requirements</span><textarea id="supRequirements" style="' + FIELD + ';min-height:60px;resize:vertical">' + esc(s.accountRequirements || "") + "</textarea></label>" +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.6rem">' +
            '<label><span style="' + LBL + '">Contact name</span><input id="supContact" style="' + FIELD + '" value="' + esc(s.contactName || "") + '" placeholder="Rep / credit dept" /></label>' +
            '<label><span style="' + LBL + '">Phone</span><input id="supPhone" style="' + FIELD + '" value="' + esc(s.phone || "") + '" placeholder="(800) 000-0000" /></label>' +
            '<label><span style="' + LBL + '">Email</span><input id="supEmail" type="email" style="' + FIELD + '" value="' + esc(s.email || "") + '" placeholder="rep@supplier.com" /></label>' +
            '<label><span style="' + LBL + '">Website</span><input id="supWebsite" style="' + FIELD + '" value="' + esc(s.website || "") + '" placeholder="https://supplier.com" /></label>' +
          "</div>" +
          '<label style="display:block"><span style="' + LBL + '">Source URLs (one per line)</span><textarea id="supSources" style="' + FIELD + ';min-height:50px;resize:vertical">' + esc((s.sourceUrls || []).join("\n")) + "</textarea></label>" +
          '<label style="display:block"><span style="' + LBL + '">Notes</span><textarea id="supNotes" style="' + FIELD + ';min-height:70px;resize:vertical">' + esc(s.notes || "") + "</textarea></label>" +
          '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">' +
            '<button type="button" class="btn primary" data-action="save">' + (isNew ? "Add supplier" : "Save changes") + "</button>" +
            (isNew ? "" : '<button type="button" class="btn" data-action="feeler">Draft feeler</button>') +
            (isNew ? "" : '<button type="button" class="btn" data-action="delete" style="color:#b42318">Delete</button>') +
            '<span data-role="status" style="' + MUTED + '"></span>' +
          "</div>" +
        "</div>" +
      "</div>"
    );

    drawer.querySelector('[data-action="close"]').addEventListener("click", APP.closeDrawer);

    if (!isNew) {
      drawer.querySelector("#supTrusted").addEventListener("change", function (e) {
        var statusEl = drawer.querySelector('[data-role="status"]');
        statusEl.textContent = "Saving…";
        APP.fetchJSON(API + "/" + encodeURIComponent(s.id), {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fullBody(s, { trusted: e.target.checked }))
        }).then(function () {
          s.trusted = e.target.checked;
          statusEl.textContent = e.target.checked ? "Marked trusted." : "Trusted flag removed.";
          return fetchSuppliers(true);
        }).then(function () {
          if (container) buildList(container);
        }).catch(function (err) {
          statusEl.style.color = "#b42318";
          statusEl.textContent = "Save failed: " + err.message;
        });
      });
    }

    drawer.querySelector('[data-action="save"]').addEventListener("click", function () {
      var statusEl = drawer.querySelector('[data-role="status"]');
      var name = drawer.querySelector("#supName").value.trim();
      if (!name) {
        statusEl.textContent = "Name is required.";
        statusEl.style.color = "#b42318";
        return;
      }
      statusEl.style.color = "";
      statusEl.textContent = "Saving…";
      var body = {
        name: name,
        category: drawer.querySelector("#supCategory").value,
        accountType: drawer.querySelector("#supType").value,
        accountStatus: drawer.querySelector("#supStatus").value,
        supplierType: drawer.querySelector("#supSupplierType").value,
        trusted: drawer.querySelector("#supTrusted").checked,
        brands: drawer.querySelector("#supBrands").value,
        suppliesServices: drawer.querySelector("#supServices").value,
        accountCostEstimate: drawer.querySelector("#supCost").value,
        region: drawer.querySelector("#supRegion").value,
        accountRequirements: drawer.querySelector("#supRequirements").value,
        minimumSpend: drawer.querySelector("#supMinSpend").value,
        leadTime: drawer.querySelector("#supLeadTime").value,
        contactName: drawer.querySelector("#supContact").value,
        phone: drawer.querySelector("#supPhone").value,
        email: drawer.querySelector("#supEmail").value,
        website: drawer.querySelector("#supWebsite").value,
        sourceUrls: drawer.querySelector("#supSources").value,
        notes: drawer.querySelector("#supNotes").value
      };
      var req = isNew
        ? APP.fetchJSON(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : APP.fetchJSON(API + "/" + encodeURIComponent(s.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      req.then(function () {
        APP.toast(isNew ? "Supplier added" : "Supplier saved");
        APP.closeDrawer();
        return fetchSuppliers(true);
      }).then(function () {
        if (container) buildList(container);
      }).catch(function (err) {
        statusEl.style.color = "#b42318";
        statusEl.textContent = "Save failed: " + err.message;
      });
    });

    if (!isNew) {
      drawer.querySelector('[data-action="feeler"]').addEventListener("click", function () {
        APP.closeDrawer();
        openFeelerDrawer(s, container);
      });

      drawer.querySelector('[data-action="delete"]').addEventListener("click", function () {
        if (!window.confirm("Delete " + (s.name || "this supplier") + "?")) return;
        var statusEl = drawer.querySelector('[data-role="status"]');
        statusEl.textContent = "Deleting…";
        APP.fetchJSON(API + "/" + encodeURIComponent(s.id), { method: "DELETE" }).then(function () {
          APP.toast("Supplier deleted");
          APP.closeDrawer();
          return fetchSuppliers(true);
        }).then(function () {
          if (container) buildList(container);
        }).catch(function (err) {
          statusEl.style.color = "#b42318";
          statusEl.textContent = "Delete failed: " + err.message;
        });
      });
    }

    APP.openDrawer(drawer);
  }

  // ── register with the shell ──
  APP.registerView("suppliers", {
    title: "Suppliers",
    render: function (container) {
      renderList(container);
    }
  });
})();
