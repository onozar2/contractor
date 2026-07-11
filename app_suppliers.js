// app_suppliers.js — Suppliers / manufacturers roster view.
// Registers the "suppliers" view with the APP shell (app.html). Vanilla JS, shell CSS classes only.
// Reference list, not a workflow: metric row + search/category chips + table + drawer editor.
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

  var roster = null;
  var rosterPromise = null;

  var state = { q: "", category: "" };

  var FIELD = "min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.3rem 0.5rem;font:inherit;font-size:0.84rem;background:#f5f7fa;width:100%";
  var LBL = "display:block;color:#687587;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.15rem";
  var MUTED = "color:#687587;font-size:0.8rem";

  function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function labelize(v) { return clean(v || "unknown").replace(/_/g, " "); }
  function statusPill(status) {
    var s = status || "not_started";
    var cls = STATUS_CLS[s] != null ? STATUS_CLS[s] : "";
    return '<span class="pill' + (cls ? " " + cls : "") + '">' + esc(labelize(s)) + "</span>";
  }
  function errorCard(message, retryLabel) {
    return '<div class="card"><div style="color:#b42318;font-weight:700">Something went wrong</div>' +
      '<div style="' + MUTED + ';margin:0.3rem 0 0.6rem">' + esc(message) + "</div>" +
      '<button type="button" class="btn" data-act="retry">' + esc(retryLabel || "Retry") + "</button></div>";
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
    var categories = new Set(roster.map(function (s) { return s.category; }).filter(Boolean)).size;
    var open = roster.filter(function (s) { return s.accountStatus === "open"; }).length;
    var pending = roster.filter(function (s) { return s.accountStatus && s.accountStatus !== "open"; }).length;
    return { total: total, categories: categories, open: open, pending: pending };
  }

  function listFiltered() {
    var q = state.q.toLowerCase().trim();
    return roster.filter(function (s) {
      if (state.category && s.category !== state.category) return false;
      if (q) {
        var hay = [
          s.name, s.category, s.accountType, (s.brands || []).join(" "),
          (s.suppliesServices || []).join(" "), s.contactName, s.phone, s.email,
          s.website, s.region, s.notes
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
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
      '<div class="viewhead"><h1>Suppliers</h1>' +
        '<button type="button" class="btn primary" id="supAdd">+ Add supplier</button>' +
      "</div>" +
      '<div class="kpis">' +
        kpi(m.total, "Total suppliers") +
        kpi(m.categories, "Categories covered") +
        kpi(m.open, "Accounts open", "green") +
        kpi(m.pending, "Accounts pending", m.pending ? "amber" : null) +
      "</div>" +
      '<div class="card">' +
        '<div style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center">' +
          '<input id="supSearch" type="text" placeholder="Search name, brand, service, contact, region…" value="' + esc(state.q) + '" style="' + FIELD + ';flex:1;min-width:220px;width:auto" />' +
        "</div>" +
        '<div class="chips" id="supChips" style="margin-top:0.6rem">' +
          '<button type="button" class="chip' + (!state.category ? " active" : "") + '" data-cat="">All categories</button>' +
          usedCategories.map(function (c) {
            return '<button type="button" class="chip' + (state.category === c ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
          }).join("") +
        "</div>" +
      "</div>" +
      '<div class="card">' +
        '<div id="supCount" style="' + MUTED + ';margin-bottom:0.4rem"></div>' +
        '<div style="overflow-x:auto">' +
          '<table class="table"><thead><tr>' +
            "<th>Name</th><th>Category</th><th>Account status</th><th>Min spend</th><th>Lead time</th><th>Contact</th><th>Notes</th>" +
          '</tr></thead><tbody id="supRows"></tbody></table>' +
        "</div>" +
        '<div id="supEmpty"></div>' +
      "</div>";

    function kpi(value, label, accent) {
      return '<div class="kpi"' + (accent ? ' data-accent="' + accent + '"' : "") + "><b>" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
    }

    var search = container.querySelector("#supSearch");
    var chips = container.querySelector("#supChips");

    search.addEventListener("input", function () { state.q = search.value; renderTable(container); });
    chips.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      state.category = chip.dataset.cat || "";
      chips.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("active", (c.dataset.cat || "") === state.category); });
      renderTable(container);
    });
    container.querySelector("#supRows").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      var record = roster.find(function (s) { return s.id === tr.dataset.id; });
      if (record) openSupplierDrawer(record, container);
    });
    container.querySelector("#supAdd").addEventListener("click", function () {
      openSupplierDrawer(null, container);
    });

    renderTable(container);
  }

  function renderTable(container) {
    var body = container.querySelector("#supRows");
    var count = container.querySelector("#supCount");
    var emptyBox = container.querySelector("#supEmpty");
    if (!body) return;
    var rows = listFiltered();

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
      var notes = clean(s.notes);
      var notesPreview = notes ? (notes.length > 70 ? esc(notes.slice(0, 70)) + "…" : esc(notes)) : '<span style="' + MUTED + '">—</span>';
      return '<tr data-id="' + esc(s.id) + '" style="cursor:pointer">' +
        "<td><b>" + esc(s.name || "Unnamed supplier") + "</b></td>" +
        "<td>" + esc(s.category || "") + "</td>" +
        "<td>" + statusPill(s.accountStatus) + "</td>" +
        "<td>" + esc(s.minimumSpend || "—") + "</td>" +
        "<td>" + esc(s.leadTime || "—") + "</td>" +
        "<td>" + contact + "</td>" +
        "<td>" + notesPreview + "</td>" +
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

    var drawer = APP.el(
      '<div>' +
        '<div class="drawer-head">' +
          "<h1>" + (isNew ? "Add supplier" : esc(s.name || "Edit supplier")) + "</h1>" +
          '<button type="button" class="btn" data-action="close">Close</button>' +
        "</div>" +
        '<div class="drawer-body">' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.6rem">' +
            '<label><span style="' + LBL + '">Name *</span><input id="supName" style="' + FIELD + '" value="' + esc(s.name || "") + '" placeholder="e.g. Ferguson" /></label>' +
            '<label><span style="' + LBL + '">Category</span><select id="supCategory" style="' + FIELD + '">' + categoryOptions + "</select></label>" +
            '<label><span style="' + LBL + '">Account type</span><select id="supType" style="' + FIELD + '">' + typeOptions + "</select></label>" +
            '<label><span style="' + LBL + '">Account status</span><select id="supStatus" style="' + FIELD + '">' + statusOptions + "</select></label>" +
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
            (isNew ? "" : '<button type="button" class="btn" data-action="delete" style="color:#b42318">Delete</button>') +
            '<span data-role="status" style="' + MUTED + '"></span>' +
          "</div>" +
        "</div>" +
      "</div>"
    );

    drawer.querySelector('[data-action="close"]').addEventListener("click", APP.closeDrawer);

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
