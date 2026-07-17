// app_subs.js — Subs hub: roster list + sub profile (Agent B)
// Registers the "subs" view with the APP shell (app.html). Vanilla JS, shell CSS classes only.
(function () {
  "use strict";
  if (!window.APP) { console.error("app_subs.js: APP shell not found"); return; }

  var API = "/api/subcontractors";
  var esc = APP.esc;

  // ── module caches ──
  var roster = null;          // full roster, kept in memory after first fetch
  var rosterPromise = null;
  var pricingPromise = null;  // /api/pricing-intel, fetched once
  var vetsweepPromise = null; // /api/vetsweep, fetched once for the roster health strip

  // ── list state ──
  var state = {
    q: "",
    trade: "",
    tier: "all",         // all | verified | credible | unverified | hidden
    strongOnly: true,   // "Strong contacts" toggle DEFAULT ON
    pricingOnly: false, // "Has pricing signal" toggle
    sortKey: "legitScore",
    sortDir: -1
  };

  var profileState = { id: null, tab: "overview" };
  var compareState = { active: false, ids: [] };   // list-view "Compare" mode (max 4 selected)

  // Working-roster tiers shown as chips; "hidden" is a separate muted chip appended after.
  var QUALITY_TIERS = [
    { key: "all", label: "All" },
    { key: "verified", label: "Verified" },
    { key: "credible", label: "Credible" },
    { key: "unverified", label: "Unvetted" }
  ];
  // Sourcing methods that count as "Ori's own uploads" for the My uploads ⭐ chip —
  // his own records should never vanish on him regardless of contact strength.
  var MINE_SOURCING = ["ori-upload", "quick-add", "manual", "csv", "contact-import", "widget"];
  function isMine(s) { return !!s.trusted || MINE_SOURCING.indexOf(s.sourcingMethod || "") !== -1; }
  var STAGE_CLS = { preferred: "green", vetted: "green", pricing_received: "plum", responded: "plum", contacted: "amber", queued: "amber", rejected: "red" };
  var DOC_KEYS = ["coi", "w9", "agreement", "workersCompCert"];
  var DOC_LABELS = { coi: "COI (additional insured)", w9: "W-9", agreement: "Signed sub agreement", workersCompCert: "Workers comp cert" };
  var DOC_EXPIRY = { coi: true, workersCompCert: true };
  var NUMERIC_KEYS = { legitScore: 1, completenessScore: 1, overall: 1, reviewRating: 1, docs: 1 };

  // inline glue styles (layout only — all components use shell classes)
  var FIELD = "min-height:34px;border:1px solid #d8dee8;border-radius:7px;padding:0.3rem 0.5rem;font:inherit;font-size:0.84rem;background:#f5f7fa;width:100%";
  var LBL = "display:block;color:#687587;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.15rem";
  var MUTED = "color:#687587;font-size:0.8rem";
  var PRE = "background:#101828;color:#e8eef8;border-radius:8px;padding:0.7rem;font-size:0.76rem;white-space:pre-wrap;max-height:300px;overflow-y:auto;margin-top:0.5rem";

  // ── shared helpers ──
  function overall(s) {
    var v = s.overallScore != null && s.overallScore !== "" ? s.overallScore : s.fitScore;
    return Number(v || 0);
  }
  function contactStrength(s) {
    if (s.contactStrength) return s.contactStrength;
    if (s.ownerName && s.email) return "strong";
    if (s.email || s.phone) return "weak";
    return "none";
  }
  function hasText(v) { return v != null && String(v).trim() !== ""; }
  function isHidden(s) { return !!(s.hidden || s.hiddenAuto); }
  function hasPricingSignal(s) {
    return (hasText(s.priceTier) && s.priceTier !== "unknown") ||
      hasText(s.minimumJobSize) || hasText(s.laborRateHints) || hasText(s.unitPriceNotes);
  }
  function docsSummary(s) {
    var checklist = s.docChecklist || {};
    var received = 0;
    var missing = [];
    for (var i = 0; i < DOC_KEYS.length; i++) {
      var key = DOC_KEYS[i];
      var item = checklist[key] || {};
      var expired = item.expiresAt && new Date(item.expiresAt) < new Date();
      if ((item.status === "received" && !expired) || item.status === "exempt") received++;
      else missing.push(key);
    }
    return { received: received, total: DOC_KEYS.length, missing: missing, complete: missing.length === 0 };
  }
  function docsPill(s) {
    var d = docsSummary(s);
    var cls = d.complete ? "green" : d.received > 0 ? "amber" : "red";
    return '<span class="pill ' + cls + '" title="missing: ' + esc(d.missing.join(", ") || "none") + '">' + d.received + "/" + d.total + "</span>";
  }
  function stagePill(stage) {
    var s = stage || "not_contacted";
    var cls = STAGE_CLS[s] || "";
    return '<span class="pill ' + cls + '">' + esc(s.replace(/_/g, " ")) + "</span>";
  }
  function weakPill(s) {
    return contactStrength(s) === "strong" ? "" :
      ' <span class="pill amber" title="no named owner + email on file — low outreach value">weak contact</span>';
  }
  function legitCell(s) {
    var tier = s.legitTier || "unverified";
    var flags = (s.redFlags || []);
    var html = '<span title="' + esc(tier) + (s.vettingStatus === "deep_vetted" ? " · deep-vetted" : "") + '">' + APP.scoreBadge(s.legitScore) + "</span>";
    if (flags.length) html += ' <span class="pill red" title="' + esc(flags.join("; ")) + '">⚑</span>';
    if (s.vettingStatus === "deep_vetted") html += ' <span class="pill green" title="deep-vetted">✓</span>';
    return html;
  }
  function reviewsCell(s) {
    // rating-without-count and count-without-rating both happen (source shows one but not the other)
    if (!s.reviewRating && Number(s.reviewCount) > 0) {
      return '<span style="' + MUTED + '">unrated (' + esc(s.reviewCount) + " reviews)</span>";
    }
    if (!s.reviewRating) return '<span style="' + MUTED + '">-</span>';
    if (!Number(s.reviewCount)) return esc(s.reviewRating) + '★ <span style="' + MUTED + '">(count unknown)</span>';
    return esc(s.reviewRating) + '★ <span style="' + MUTED + '">(' + esc(s.reviewCount) + ")</span>";
  }
  function licenseCell(s) {
    if (!s.licenseNumber) return '<span class="pill red">none</span>';
    return esc(s.licenseNumber) + (s.licenseVerified ? ' <span class="pill green">ok</span>' : "");
  }
  function aliveDot(s) {
    var color = s.websiteAlive === true ? "#0f766e" : s.websiteAlive === false ? "#b42318" : "#687587";
    var label = s.websiteAlive === true ? "site alive" : s.websiteAlive === false ? "site dead" : "site unchecked";
    return '<span title="' + label + '" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';vertical-align:middle"></span>';
  }

  function fetchRoster(force) {
    if (roster && !force) return Promise.resolve(roster);
    if (!rosterPromise || force) {
      rosterPromise = APP.fetchJSON(API).then(function (rows) {
        roster = Array.isArray(rows) ? rows : [];
        return roster;
      }).catch(function (err) { rosterPromise = null; throw err; });
    }
    return rosterPromise;
  }
  function fetchPricingIntel() {
    if (!pricingPromise) {
      pricingPromise = APP.fetchJSON("/api/pricing-intel").catch(function (err) { pricingPromise = null; throw err; });
    }
    return pricingPromise;
  }
  function fetchVetsweep() {
    if (!vetsweepPromise) {
      vetsweepPromise = APP.fetchJSON("/api/vetsweep").catch(function (err) { vetsweepPromise = null; throw err; });
    }
    return vetsweepPromise;
  }
  function updateRosterRecord(updated) {
    if (!roster || !updated || !updated.id) return null;
    for (var i = 0; i < roster.length; i++) {
      if (roster[i].id === updated.id) { Object.assign(roster[i], updated); return roster[i]; }
    }
    return null;
  }
  function putSub(id, partial) {
    return APP.fetchJSON(API + "/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial)
    }).then(function (updated) { updateRosterRecord(updated); return updated; });
  }
  function copyText(text) {
    navigator.clipboard.writeText(text).then(function () { APP.toast("Copied to clipboard"); },
      function () { APP.toast("Copy failed — select the text manually"); });
  }
  function errorCard(message, retryLabel) {
    return '<div class="card"><div style="color:#b42318;font-weight:700">Something went wrong</div>' +
      '<div style="' + MUTED + ';margin:0.3rem 0 0.6rem">' + esc(message) + "</div>" +
      '<button type="button" class="btn" data-act="retry">' + esc(retryLabel || "Retry") + "</button></div>";
  }

  // ══════════════════════ LIST VIEW ══════════════════════
  function renderList(container) {
    container.innerHTML = '<div class="card"><span style="' + MUTED + '">Loading roster…</span></div>';
    fetchRoster().then(function () { buildList(container); }).catch(function (err) {
      container.innerHTML = errorCard(err.message || "Failed to load subcontractors.");
      var retry = container.querySelector('[data-act="retry"]');
      if (retry) retry.addEventListener("click", function () { renderList(container); });
    });
  }

  function listFiltered() {
    var q = state.q.toLowerCase().trim();
    var mineActive = state.tier === "mine";
    var rows = roster.filter(function (s) {
      // Working roster (any quality tier, including "all") never shows the hidden pile;
      // the dedicated "Hidden" chip shows ONLY the hidden pile. "My uploads" is its own
      // pile too — it includes hidden records of Ori's own so nothing vanishes on him.
      if (state.tier === "hidden") {
        if (!isHidden(s)) return false;
      } else if (mineActive) {
        if (!isMine(s)) return false;
      } else {
        if (isHidden(s)) return false;
        if (state.tier !== "all" && (s.legitTier || "unverified") !== state.tier) return false;
      }
      if (state.trade && s.serviceCategory !== state.trade) return false;
      if (state.strongOnly && !mineActive && contactStrength(s) !== "strong") return false;
      if (state.pricingOnly && !hasPricingSignal(s)) return false;
      if (q) {
        var hay = [s.companyName, s.ownerName, s.contactName, s.phone, s.email, s.serviceCategory,
          (s.specialties || []).join(" "), s.summary, s.serviceArea].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    rows.sort(function (a, b) {
      // Trusted (Ori's own WhatsApp/phone contacts) always float to the top, in every sort.
      var ta = a.trusted ? 1 : 0, tb = b.trusted ? 1 : 0;
      if (ta !== tb) return tb - ta;
      var va = sortVal(a, state.sortKey);
      var vb = sortVal(b, state.sortKey);
      if (NUMERIC_KEYS[state.sortKey]) return ((Number(va) || 0) - (Number(vb) || 0)) * state.sortDir;
      return String(va).localeCompare(String(vb)) * state.sortDir;
    });
    return rows;
  }
  function sortVal(s, key) {
    if (key === "overall") return overall(s);
    if (key === "docs") return docsSummary(s).received;
    if (NUMERIC_KEYS[key]) return Number(s[key] || 0);
    return String(s[key] || "").toLowerCase();
  }

  var LIST_COLS = [
    { key: "companyName", label: "Company" },
    { key: "serviceCategory", label: "Trade" },
    { key: "legitScore", label: "Trust score", title: "License verified + reviews + insurance evidence — is this a real, good company" },
    { key: "completenessScore", label: "Record", title: "How complete OUR info on them is — contact, license, pricing, docs" },
    { key: "reviewRating", label: "Reviews" },
    { key: "licenseNumber", label: "License" },
    { key: "docs", label: "Docs", title: "Compliance packet we've collected: COI, W-9, agreement, workers-comp (n of 4)" },
    { key: "outreachStage", label: "Stage" },
    { key: "priceTier", label: "Price tier" }
  ];

  function buildList(container) {
    var trades = [];
    var seen = {};
    roster.forEach(function (s) {
      if (s.serviceCategory && !seen[s.serviceCategory]) { seen[s.serviceCategory] = true; trades.push(s.serviceCategory); }
    });
    trades.sort();

    container.innerHTML =
      "<h1>Subs</h1>" +
      '<div id="subsHealth" style="margin-bottom:0.9rem">' +
        '<span style="' + MUTED + '">Loading roster health…</span>' +
      "</div>" +
      '<div class="card" id="subsQuickAdd" style="margin-bottom:0.9rem">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
          "<h2>Quick-add a sub</h2>" +
          '<button type="button" class="btn" id="uploadToggle">⬆ Upload my subs</button>' +
        "</div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem">' +
          '<input id="qaText" type="text" placeholder="Type it how you’d text it: ‘Mike Torres plumbing 818-555-0199 does repipes, from WhatsApp’" style="' + FIELD + ';flex:1;min-width:280px" />' +
          '<button type="button" class="btn primary" id="qaSubmit">Add sub</button>' +
        "</div>" +
        '<div id="qaStatus" style="' + MUTED + ';margin-top:0.4rem"></div>' +
        '<div id="qaDraft"></div>' +
        '<div id="uploadPanel" style="display:none;margin-top:0.7rem;padding-top:0.65rem;border-top:1px solid #e3e8ef">' +
          '<label style="display:block"><span style="' + LBL + '">Paste CSV or one sub per line: Company, Trade, Owner, Phone, Email, Website, License#</span>' +
            '<textarea id="upText" style="' + FIELD + ';min-height:100px;resize:vertical;font-family:monospace;font-size:0.78rem" placeholder="Ace Plumbing, Plumbing, Mike Torres, 818-555-0199, mike@aceplumbing.com, aceplumbing.com, 123456"></textarea>' +
          "</label>" +
          '<div style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center;margin-top:0.5rem">' +
            '<input id="upFile" type="file" accept=".csv" />' +
            '<label style="display:flex;align-items:center;gap:0.35rem;font-size:0.83rem">' +
              '<input id="upTrusted" type="checkbox" /> ⭐ mark all as my trusted contacts' +
            "</label>" +
            '<button type="button" class="btn primary" id="upSubmit">Upload</button>' +
          "</div>" +
          '<div id="upStatus" style="' + MUTED + ';margin-top:0.5rem"></div>' +
        "</div>" +
      "</div>" +
      '<div class="card">' +
        '<div style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center">' +
          '<input id="subsSearch" type="text" placeholder="Search company, owner, phone, email, specialty…" value="' + esc(state.q) + '" style="' + FIELD + ';flex:1;min-width:220px;width:auto" />' +
          '<select id="subsTrade" style="' + FIELD + ';width:auto;min-width:170px">' +
            '<option value="">All trades</option>' +
            trades.map(function (t) { return '<option value="' + esc(t) + '"' + (state.trade === t ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") +
          "</select>" +
        "</div>" +
        '<div class="chips" id="subsChips" style="margin-top:0.7rem">' +
          QUALITY_TIERS.map(function (t) {
            var active = state.tier === t.key && !(t.key === "" && state.strongOnly);
            return '<button type="button" class="chip' + (active ? " active" : "") + '" data-tier="' + t.key + '">' + esc(t.label) + "</button>";
          }).join("") +
          '<button type="button" class="chip' + (state.tier === "mine" ? " active" : "") + '" data-tier="mine" title="Only records you personally added or marked trusted — never hidden on you, ignores the Strong contacts filter">My uploads ⭐</button>' +
          '<button type="button" class="chip' + (state.strongOnly ? " active" : "") + '" data-toggle="strong" title="Named owner + email on file" style="margin-left:0.6rem">Strong contacts</button>' +
          '<button type="button" class="chip' + (state.pricingOnly ? " active" : "") + '" data-toggle="pricing" title="Price tier, minimum job size, labor rates or unit prices known">Has pricing signal</button>' +
          '<button type="button" class="chip' + (compareState.active ? " active" : "") + '" data-toggle="compare" title="Select up to 4 subs to compare side by side" style="margin-left:0.6rem">⚖ Compare</button>' +
          '<button type="button" class="chip" id="subsHiddenChip" data-tier="hidden" title="Auto-hidden: red-flagged, dead site, or not actually a sub" style="margin-left:0.6rem;color:#687587"></button>' +
        "</div>" +
        '<div id="subsHiddenNote" style="' + MUTED + ';font-size:0.78rem;margin-top:0.45rem"></div>' +
      "</div>" +
      '<div class="card" style="margin-top:0.9rem">' +
        '<div id="subsCount" style="' + MUTED + ';margin-bottom:0.5rem"></div>' +
        '<div id="compareBar" style="display:none;position:sticky;top:0;z-index:2;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:0.5rem 0.7rem;margin-bottom:0.6rem;font-size:0.85rem"></div>' +
        '<div style="overflow-x:auto">' +
          '<table class="table"><thead><tr id="subsHead"></tr></thead><tbody id="subsRows"></tbody></table>' +
        "</div>" +
        '<div id="subsEmpty"></div>' +
      "</div>";

    var search = container.querySelector("#subsSearch");
    var tradeSel = container.querySelector("#subsTrade");
    var chips = container.querySelector("#subsChips");

    search.addEventListener("input", function () { state.q = search.value; renderTable(container); });
    tradeSel.addEventListener("change", function () { state.trade = tradeSel.value; renderTable(container); });
    chips.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      if (chip.dataset.tier !== undefined && chip.dataset.toggle === undefined) {
        state.tier = chip.dataset.tier;
        chips.querySelectorAll("[data-tier]").forEach(function (c) {
          c.classList.toggle("active", c.dataset.tier === state.tier && !(c.dataset.tier === "" && state.strongOnly));
        });
      } else if (chip.dataset.toggle === "strong") {
        state.strongOnly = !state.strongOnly;
        chip.classList.toggle("active", state.strongOnly);
        // "All" only reads as truly-all when the strong filter is off.
        var allChip = chips.querySelector('[data-tier=""]');
        if (allChip) allChip.classList.toggle("active", state.tier === "" && !state.strongOnly);
      } else if (chip.dataset.toggle === "pricing") {
        state.pricingOnly = !state.pricingOnly;
        chip.classList.toggle("active", state.pricingOnly);
      } else if (chip.dataset.toggle === "compare") {
        compareState.active = !compareState.active;
        if (!compareState.active) compareState.ids = [];
        chip.classList.toggle("active", compareState.active);
      }
      renderTable(container);
    });
    container.querySelector("thead").addEventListener("click", function (e) {
      var th = e.target.closest("th");
      if (!th || !th.dataset.key) return;
      var key = th.dataset.key;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = NUMERIC_KEYS[key] ? -1 : 1; }
      renderTable(container);
    });
    container.querySelector("#subsRows").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      if (compareState.active) {
        var checkbox = e.target.closest(".cmpChk");
        var wantSelected = checkbox ? checkbox.checked : compareState.ids.indexOf(tr.dataset.id) === -1;
        toggleCompareSelect(tr.dataset.id, wantSelected);
        renderTable(container);
        return;
      }
      APP.navigate("#/subs/" + tr.dataset.id);
    });

    wireQuickAdd(container);
    wireUpload(container);
    renderTable(container);
    renderRosterHealth(container);
  }

  function toggleCompareSelect(id, wantSelected) {
    var idx = compareState.ids.indexOf(id);
    if (wantSelected) {
      if (idx !== -1) return;
      if (compareState.ids.length >= 4) { APP.toast("You can compare up to 4 subs — deselect one first."); return; }
      compareState.ids.push(id);
    } else if (idx !== -1) {
      compareState.ids.splice(idx, 1);
    }
  }

  // ── AI quick-add ──
  function wireQuickAdd(container) {
    var text = container.querySelector("#qaText");
    var submit = container.querySelector("#qaSubmit");
    var status = container.querySelector("#qaStatus");
    var draftBox = container.querySelector("#qaDraft");

    function submitText() {
      var value = text.value.trim();
      if (!value) { status.textContent = "Type a quick note first."; return; }
      submit.disabled = true;
      status.textContent = "Reading that… (~1 min)";
      draftBox.innerHTML = "";
      APP.fetchJSON(API + "/ai-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value })
      }).then(function (data) {
        status.textContent = "Here's what I got — check it over, then save.";
        renderQaDraft(data.draft || {});
      }).catch(function (err) {
        status.textContent = "Couldn't parse that — try rephrasing, or add the details yourself: " + (err.message || "unknown error");
      }).then(function () { submit.disabled = false; });
    }
    submit.addEventListener("click", submitText);
    text.addEventListener("keydown", function (e) { if (e.key === "Enter") submitText(); });

    function renderQaDraft(draft) {
      var specialties = (draft.specialties || []).join(", ");
      draftBox.innerHTML =
        '<div class="card" style="margin-top:0.6rem;background:#f5f7fa">' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:0.5rem">' +
            qaField("qaCompany", "Company", draft.companyName) +
            qaField("qaTrade", "Trade", draft.serviceCategory) +
            qaField("qaOwner", "Owner", draft.ownerName) +
            qaField("qaPhone", "Phone", draft.phone) +
            qaField("qaEmail", "Email", draft.email) +
            qaField("qaWebsite", "Website", draft.website) +
            qaField("qaLicense", "License #", draft.licenseNumber) +
            qaField("qaArea", "Service area", draft.serviceArea) +
          "</div>" +
          '<label style="display:block;margin-top:0.5rem"><span style="' + LBL + '">Specialties (comma separated)</span>' +
            '<input id="qaSpecialties" style="' + FIELD + '" value="' + esc(specialties) + '" /></label>' +
          '<label style="display:block;margin-top:0.5rem"><span style="' + LBL + '">Summary</span>' +
            '<input id="qaSummary" style="' + FIELD + '" value="' + esc(draft.summary || "") + '" /></label>' +
          '<label style="display:flex;align-items:center;gap:0.4rem;margin-top:0.6rem;font-size:0.85rem">' +
            '<input id="qaTrusted" type="checkbox"' + (draft.trusted ? " checked" : "") + ' /> ⭐ This is my personal contact (WhatsApp/phone) — pin to the top' +
          "</label>" +
          '<div style="margin-top:0.7rem;display:flex;gap:0.5rem">' +
            '<button type="button" class="btn primary" id="qaSave">Save</button>' +
            '<button type="button" class="btn" id="qaDiscard">Discard</button>' +
          "</div>" +
        "</div>";

      draftBox.querySelector("#qaDiscard").addEventListener("click", function () {
        draftBox.innerHTML = "";
        status.textContent = "";
        text.value = "";
      });
      draftBox.querySelector("#qaSave").addEventListener("click", function () {
        var saveBtn = draftBox.querySelector("#qaSave");
        var payload = {
          companyName: draftBox.querySelector("#qaCompany").value.trim(),
          serviceCategory: draftBox.querySelector("#qaTrade").value.trim(),
          ownerName: draftBox.querySelector("#qaOwner").value.trim(),
          phone: draftBox.querySelector("#qaPhone").value.trim(),
          email: draftBox.querySelector("#qaEmail").value.trim(),
          website: draftBox.querySelector("#qaWebsite").value.trim(),
          licenseNumber: draftBox.querySelector("#qaLicense").value.trim(),
          serviceArea: draftBox.querySelector("#qaArea").value.trim(),
          specialties: draftBox.querySelector("#qaSpecialties").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
          summary: draftBox.querySelector("#qaSummary").value.trim(),
          trusted: draftBox.querySelector("#qaTrusted").checked,
          sourcingMethod: "quick-add"
        };
        if (!payload.companyName) { status.textContent = "Company name is required before saving."; return; }
        saveBtn.disabled = true;
        APP.fetchJSON(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (created) {
          if (roster) roster.unshift(created);
          APP.toast("Added " + (created.companyName || "sub") + " to the roster");
          draftBox.innerHTML = "";
          status.textContent = "";
          text.value = "";
          renderTable(container);
          renderRosterHealth(container);
        }).catch(function (err) {
          status.textContent = "Save failed: " + (err.message || "unknown error");
          saveBtn.disabled = false;
        });
      });
    }
    function qaField(id, label, value) {
      return '<label><span style="' + LBL + '">' + esc(label) + '</span><input id="' + id + '" style="' + FIELD + '" value="' + esc(value || "") + '" /></label>';
    }
  }

  // ── "Upload my subs" panel: paste rows or pick a .csv, bulk-POST as ori-upload ──
  function wireUpload(container) {
    var toggleBtn = container.querySelector("#uploadToggle");
    var panel = container.querySelector("#uploadPanel");
    var textEl = container.querySelector("#upText");
    var fileEl = container.querySelector("#upFile");
    var trustedEl = container.querySelector("#upTrusted");
    var submitBtn = container.querySelector("#upSubmit");
    var status = container.querySelector("#upStatus");

    toggleBtn.addEventListener("click", function () {
      var open = panel.style.display === "none";
      panel.style.display = open ? "" : "none";
      toggleBtn.textContent = open ? "Hide upload" : "⬆ Upload my subs";
    });

    var UPLOAD_HEADER_MAP = {
      company: "companyName", name: "companyName",
      trade: "serviceCategory", category: "serviceCategory", servicecategory: "serviceCategory",
      owner: "ownerName", ownername: "ownerName", contact: "ownerName",
      phone: "phone",
      email: "email",
      website: "website", site: "website", url: "website",
      license: "licenseNumber", "license#": "licenseNumber", licensenumber: "licenseNumber"
    };
    var UPLOAD_DEFAULT_ORDER = ["companyName", "serviceCategory", "ownerName", "phone", "email", "website", "licenseNumber"];

    function parseUploadText(raw) {
      var lines = String(raw || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
      if (!lines.length) return { records: [], errors: [] };
      var fieldMap = UPLOAD_DEFAULT_ORDER;
      if (lines[0].toLowerCase().indexOf("company") !== -1) {
        fieldMap = lines[0].split(",").map(function (h) { return UPLOAD_HEADER_MAP[h.trim().toLowerCase()] || null; });
        lines = lines.slice(1);
      }
      var records = [];
      var errors = [];
      lines.forEach(function (line, idx) {
        var cells = line.split(",").map(function (c) { return c.trim(); });
        var rec = {};
        for (var i = 0; i < cells.length && i < fieldMap.length; i++) {
          if (fieldMap[i]) rec[fieldMap[i]] = cells[i];
        }
        if (!rec.companyName) { errors.push("Line " + (idx + 1) + ": no company name — skipped"); return; }
        records.push(rec);
      });
      return { records: records, errors: errors };
    }

    function runUpload(raw) {
      var parsed = parseUploadText(raw);
      if (!parsed.records.length) {
        status.textContent = parsed.errors.length ? parsed.errors.join("; ") : "Nothing to upload — paste some rows or choose a CSV file.";
        submitBtn.disabled = false;
        return;
      }
      var trusted = trustedEl.checked;
      var records = parsed.records.map(function (r) {
        return {
          companyName: r.companyName || "",
          serviceCategory: r.serviceCategory || "",
          ownerName: r.ownerName || "",
          phone: r.phone || "",
          email: r.email || "",
          website: r.website || "",
          licenseNumber: r.licenseNumber || "",
          trusted: trusted,
          sourcingMethod: "ori-upload",
          sourceConfidence: "high"
        };
      });
      APP.fetchJSON(API + "/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: records })
      }).then(function (result) {
        var savedCount = (result && result.savedCount) || 0;
        var msg = "Uploaded " + savedCount + " sub" + (savedCount === 1 ? "" : "s") + ".";
        if (parsed.errors.length) msg += " " + parsed.errors.length + " line" + (parsed.errors.length === 1 ? "" : "s") + " skipped (" + parsed.errors.join("; ") + ").";
        status.textContent = msg;
        textEl.value = "";
        fileEl.value = "";
        return fetchRoster(true);
      }).then(function () {
        renderTable(container);
        renderRosterHealth(container);
      }).catch(function (err) {
        status.textContent = "Upload failed: " + (err.message || "unknown error");
      }).then(function () { submitBtn.disabled = false; });
    }

    submitBtn.addEventListener("click", function () {
      var file = fileEl.files && fileEl.files[0];
      submitBtn.disabled = true;
      status.textContent = "Uploading…";
      if (file) {
        var reader = new FileReader();
        reader.onload = function (e) { runUpload(String((e.target && e.target.result) || "")); };
        reader.onerror = function () { status.textContent = "Couldn't read that file."; submitBtn.disabled = false; };
        reader.readAsText(file);
      } else {
        runUpload(textEl.value);
      }
    });
  }

  function renderRosterHealth(container) {
    var box = container.querySelector("#subsHealth");
    if (!box) return;
    var activeCount = roster.filter(function (s) { return !isHidden(s); }).length;
    var hiddenCount = roster.length - activeCount;
    var mineCount = roster.filter(isMine).length;
    fetchVetsweep().catch(function () { return null; }).then(function (sweep) {
      if (!container.contains(box)) return; // view navigated away before this resolved
      var sweepBit = sweep && sweep.enabled
        ? "nightly vetting ON" + (sweep.nightsToClear ? ", ~" + sweep.nightsToClear + " night" + (sweep.nightsToClear === 1 ? "" : "s") + " to finish" : "")
        : "nightly vetting off";
      box.innerHTML =
        '<div class="card" style="display:flex;flex-wrap:wrap;align-items:center;gap:0.4rem">' +
          '<span style="font-size:0.85rem">' +
            "<b>" + activeCount + "</b> active roster · <b>" + hiddenCount + "</b> hidden (junk/flagged)" +
            (mineCount > 0 ? " · <b>" + mineCount + "</b> my uploads" : "") +
            " · " + esc(sweepBit) +
          "</span>" +
        "</div>";
    }).catch(function () {
      if (container.contains(box)) box.innerHTML = "";
    });
  }

  function renderTable(container) {
    var head = container.querySelector("#subsHead");
    var body = container.querySelector("#subsRows");
    var count = container.querySelector("#subsCount");
    var emptyBox = container.querySelector("#subsEmpty");
    if (!head || !body) return;
    var rows = listFiltered();

    var visibleTotal = roster.filter(function (s) { return !isHidden(s); }).length;
    var hiddenTotal = roster.length - visibleTotal;
    count.textContent = state.tier === "hidden"
      ? rows.length + " hidden"
      : state.tier === "mine"
        ? rows.length + " of your uploads (includes hidden ones — they never disappear on you)"
        : rows.length + " of " + visibleTotal + " shown" +
          (state.strongOnly ? " — strong contacts only (named owner + email); turn off the Strong contacts chip to see everyone" : "");

    var hiddenChip = container.querySelector("#subsHiddenChip");
    if (hiddenChip) {
      hiddenChip.textContent = "Hidden (" + hiddenTotal + ")";
      hiddenChip.classList.toggle("active", state.tier === "hidden");
    }
    var hiddenNote = container.querySelector("#subsHiddenNote");
    if (hiddenNote) {
      hiddenNote.textContent = state.tier === "hidden"
        ? "Auto-hidden: red-flagged, dead site, or not actually a sub — nightly sweep keeps this updated."
        : "";
    }

    head.innerHTML = (compareState.active ? '<th style="width:26px"></th>' : "") + LIST_COLS.map(function (c) {
      var arrow = state.sortKey === c.key ? (state.sortDir < 0 ? " ▾" : " ▴") : "";
      var tip = c.title ? c.title : "Sort by " + c.label;
      return '<th data-key="' + c.key + '" style="cursor:pointer" title="' + esc(tip) + '">' + esc(c.label) + arrow + "</th>";
    }).join("");

    var compareBar = container.querySelector("#compareBar");
    if (compareBar) {
      if (compareState.active && compareState.ids.length) {
        compareBar.style.display = "";
        compareBar.innerHTML =
          "<b>" + compareState.ids.length + " of 4 selected</b>" +
          '<button type="button" class="btn primary" id="compareGo" style="margin-left:0.6rem">Compare</button>' +
          '<button type="button" class="btn" id="compareClear" style="margin-left:0.4rem">Clear</button>';
        compareBar.querySelector("#compareGo").addEventListener("click", function () {
          APP.navigate("#/subs/" + encodeURIComponent("compare:" + compareState.ids.join(",")));
        });
        compareBar.querySelector("#compareClear").addEventListener("click", function () {
          compareState.ids = [];
          renderTable(container);
        });
      } else {
        compareBar.style.display = "none";
        compareBar.innerHTML = "";
      }
    }

    if (!rows.length) {
      body.innerHTML = "";
      emptyBox.innerHTML = roster.length
        ? '<div class="empty">No subs match these filters — try clearing the search or toggles.</div>'
        : '<div class="empty">No subcontractors in the roster yet.</div>';
      return;
    }
    emptyBox.innerHTML = "";
    body.innerHTML = rows.map(function (s) {
      var dim = (!s.trusted && contactStrength(s) !== "strong") ? "opacity:0.55;" : "";
      var trustedBar = s.trusted ? "border-left:3px solid #b7791f;" : "";
      var checkboxCell = "";
      if (compareState.active) {
        var checked = compareState.ids.indexOf(s.id) !== -1;
        var disabled = !checked && compareState.ids.length >= 4;
        checkboxCell = '<td style="width:26px"><input type="checkbox" class="cmpChk"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + " /></td>";
      }
      return '<tr data-id="' + esc(s.id) + '" data-href="#/subs/' + esc(s.id) + '" style="cursor:pointer;' + dim + trustedBar + '">' +
        checkboxCell +
        "<td><b" + (s.trusted ? ' style="color:#101828"' : "") + ">" + esc(s.companyName) + "</b>" +
          (s.trusted ? ' <span class="pill amber" title="Your personal contact (WhatsApp/phone)">⭐ my contact</span>' : "") +
          weakPill(s) +
          (s.hiddenAuto ? ' <span class="pill" style="color:#687587" title="Nightly sweep flagged this — still one of your uploads">auto-flagged</span>' : "") +
          (s.serviceArea ? '<br /><span style="' + MUTED + ';font-size:0.72rem">' + esc(s.serviceArea) + "</span>" : "") + "</td>" +
        "<td>" + esc(s.serviceCategory || "") + "</td>" +
        "<td>" + legitCell(s) + "</td>" +
        "<td>" + APP.scoreBadge(s.completenessScore) + "</td>" +
        '<td style="white-space:nowrap">' + reviewsCell(s) + "</td>" +
        '<td style="white-space:nowrap">' + licenseCell(s) + "</td>" +
        "<td>" + docsPill(s) + "</td>" +
        "<td>" + stagePill(s.outreachStage) + "</td>" +
        "<td>" + esc(s.priceTier === "unknown" ? "" : s.priceTier || "") + "</td>" +
      "</tr>";
    }).join("");
  }

  // ══════════════════════ PROFILE VIEW ══════════════════════
  function renderProfile(container, id) {
    container.innerHTML = '<div class="card"><span style="' + MUTED + '">Loading sub…</span></div>';
    fetchRoster().then(function (rows) {
      var sub = rows.find(function (s) { return s.id === id; });
      if (sub) return sub;
      // Maybe added since the roster was cached — refetch once.
      return fetchRoster(true).then(function (fresh) {
        return fresh.find(function (s) { return s.id === id; }) || null;
      });
    }).then(function (sub) {
      if (!sub) {
        container.innerHTML = '<div class="card"><a href="#/subs">← Back to subs</a>' +
          '<div class="empty">Sub not found — it may have been deleted.</div></div>';
        return;
      }
      if (profileState.id !== id) profileState = { id: id, tab: "overview" };
      buildProfile(container, sub);
    }).catch(function (err) {
      container.innerHTML = errorCard(err.message || "Failed to load this sub.");
      var retry = container.querySelector('[data-act="retry"]');
      if (retry) retry.addEventListener("click", function () { renderProfile(container, id); });
    });
  }

  function buildProfile(container, sub) {
    var jobsCache = null;      // per-profile lazy caches
    var activitiesCache = null;

    var scores =
      '<span style="' + LBL + ';display:inline;margin-right:0.2rem" title="License verified + reviews + insurance evidence — is this a real, good company">Trust score</span>' + APP.scoreBadge(sub.legitScore) +
      ' <span style="' + LBL + ';display:inline;margin:0 0.2rem 0 0.7rem" title="How complete OUR info on them is — contact, license, pricing, docs">Record</span>' + APP.scoreBadge(sub.completenessScore) +
      ' <span style="' + LBL + ';display:inline;margin:0 0.2rem 0 0.7rem" title="Trust score blended with how they scored on jobs we logged with them">Overall</span>' + APP.scoreBadge(overall(sub));

    var contactBits = [];
    if (sub.ownerName) contactBits.push("<b>" + esc(sub.ownerName) + "</b>" + (sub.ownerTitle ? ' <span style="' + MUTED + '">· ' + esc(sub.ownerTitle) + "</span>" : ""));
    if (sub.phone) contactBits.push('<a href="tel:' + esc(sub.phone) + '">' + esc(sub.phone) + "</a>");
    if (sub.email) contactBits.push('<a href="mailto:' + esc(sub.email) + '">' + esc(sub.email) + "</a>");
    if (sub.website) contactBits.push('<a href="' + esc(sub.website) + '" target="_blank" rel="noopener">website</a> ' + aliveDot(sub));
    if (sub.licenseNumber) {
      contactBits.push("Lic " + esc(sub.licenseNumber) +
        (sub.licenseSourceUrl ? ' <a href="' + esc(sub.licenseSourceUrl) + '" target="_blank" rel="noopener">CSLB</a>' : ""));
    }

    container.innerHTML =
      '<div style="margin-bottom:0.6rem"><a href="#/subs" style="' + MUTED + ';font-weight:700;text-decoration:none">← Back to subs</a></div>' +
      '<div class="card"' + (sub.trusted ? ' style="border-left:3px solid #b7791f"' : "") + '>' +
        '<div style="display:flex;flex-wrap:wrap;gap:0.8rem;justify-content:space-between;align-items:start">' +
          "<div>" +
            "<h1>" + esc(sub.companyName) + weakPill(sub) + "</h1>" +
            '<div style="margin-top:0.25rem">' + esc(sub.serviceCategory || "") + " · " + APP.tierPill(sub.legitTier || "unverified") +
              (sub.serviceArea ? ' <span style="' + MUTED + '">· ' + esc(sub.serviceArea) + "</span>" : "") + "</div>" +
            '<div style="margin-top:0.5rem">' +
              '<button type="button" class="btn' + (sub.trusted ? " primary" : "") + '" id="trustedToggle" title="Your personal WhatsApp/phone contacts pin to the top of the roster everywhere">' +
                (sub.trusted ? "★ Trusted" : "☆ Mark trusted") +
              "</button> " +
              '<button type="button" class="btn" id="compareSimilarBtn" title="Compare against other ' + esc(sub.serviceCategory || "") + ' subs">Compare similar</button>' +
            "</div>" +
          "</div>" +
          '<div style="text-align:right">' + scores + "</div>" +
        "</div>" +
        '<div style="margin-top:0.55rem;display:flex;flex-wrap:wrap;gap:0.35rem 1.1rem;align-items:center;font-size:0.85rem">' +
          (contactBits.length ? contactBits.join('<span style="' + MUTED + '">·</span>') : '<span style="' + MUTED + '">No contact info on file.</span>') +
        "</div>" +
      "</div>" +
      '<div class="tabs" id="subTabs" style="margin-top:0.9rem">' +
        ["overview", "pricing", "compliance", "history"].map(function (t) {
          return '<button type="button" class="tab' + (profileState.tab === t ? " active" : "") + '" data-tab="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + "</button>";
        }).join("") +
      "</div>" +
      '<div id="subTabPanel" style="margin-top:0.9rem"></div>';

    var trustedBtn = container.querySelector("#trustedToggle");
    trustedBtn.addEventListener("click", function () {
      trustedBtn.disabled = true;
      putSub(sub.id, { trusted: !sub.trusted }).then(function (updated) {
        Object.assign(sub, updated);
        APP.toast(sub.trusted ? "Marked as trusted — pinned to the top" : "Unmarked as trusted");
        buildProfile(container, sub);
      }).catch(function (err) {
        APP.toast("Couldn't update: " + err.message);
        trustedBtn.disabled = false;
      });
    });

    var compareSimilarBtn = container.querySelector("#compareSimilarBtn");
    compareSimilarBtn.addEventListener("click", function () {
      fetchRoster().then(function (rows) {
        var similar = rows.filter(function (s) { return s.id !== sub.id && s.serviceCategory === sub.serviceCategory && !isHidden(s); })
          .sort(function (a, b) { return (b.legitScore || 0) - (a.legitScore || 0); })
          .slice(0, 3)
          .map(function (s) { return s.id; });
        if (!similar.length) { APP.toast("No other " + (sub.serviceCategory || "subs") + " subs to compare yet."); return; }
        APP.navigate("#/subs/" + encodeURIComponent("compare:" + [sub.id].concat(similar).join(",")));
      });
    });

    var tabs = container.querySelector("#subTabs");
    var panel = container.querySelector("#subTabPanel");
    tabs.addEventListener("click", function (e) {
      var tab = e.target.closest(".tab");
      if (!tab) return;
      profileState.tab = tab.dataset.tab;
      tabs.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === profileState.tab); });
      renderTab();
    });

    function renderTab() {
      if (profileState.tab === "pricing") renderPricingTab();
      else if (profileState.tab === "compliance") renderComplianceTab();
      else if (profileState.tab === "history") renderHistoryTab();
      else renderOverviewTab();
    }

    // ── Overview ──
    function renderOverviewTab() {
      var flags = sub.redFlags || [];
      var urls = sub.sourceUrls || [];
      panel.innerHTML =
        '<div style="display:grid;gap:0.9rem">' +
          '<div class="card"><h2>Vetting verdict</h2>' +
            '<div style="margin-top:0.35rem">' + APP.tierPill(sub.legitTier || "unverified") +
              (sub.vettingStatus === "deep_vetted" ? ' <span class="pill green">deep-vetted' + (sub.lastVettedAt ? " " + esc(String(sub.lastVettedAt).slice(0, 10)) : "") + "</span>" : "") + "</div>" +
            '<div style="margin-top:0.45rem;font-size:0.86rem">' + (sub.vettingNotes ? esc(sub.vettingNotes) : '<span style="' + MUTED + '">No vetting notes yet.</span>') + "</div>" +
            '<div style="margin-top:0.45rem">' +
              (flags.length ? flags.map(function (f) { return '<span class="pill red" style="margin-right:0.3rem">' + esc(f) + "</span>"; }).join("")
                : '<span style="' + MUTED + '">No red flags.</span>') +
            "</div>" +
          "</div>" +
          '<div class="card"><h2>License</h2>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.5rem;margin-top:0.4rem;font-size:0.85rem">' +
              kv("Number", sub.licenseNumber ? esc(sub.licenseNumber) : '<span class="pill red">none</span>') +
              kv("Class", esc(sub.licenseClass || "-")) +
              kv("Status", esc(sub.licenseStatus || "unchecked")) +
              kv("Expires", sub.licenseExpiresAt ? esc(String(sub.licenseExpiresAt).slice(0, 10)) : "-") +
              kv("Verified", sub.licenseVerified ? '<span class="pill green">verified</span>' : '<span class="pill amber">unverified</span>') +
              kv("Source", sub.licenseSourceUrl ? '<a href="' + esc(sub.licenseSourceUrl) + '" target="_blank" rel="noopener">CSLB record</a>' : "-") +
            "</div>" +
          "</div>" +
          '<div class="card"><h2>Reviews</h2>' +
            '<div style="margin-top:0.4rem;font-size:0.85rem">' +
              (sub.reviewRating
                ? "<b>" + esc(sub.reviewRating) + "★</b> (" + esc(sub.reviewCount || 0) + " reviews)" +
                  (sub.reviewSource ? ' <span style="' + MUTED + '">via ' + esc(sub.reviewSource) + "</span>" : "") +
                  (sub.sentiment ? " · sentiment: " + esc(sub.sentiment) : "")
                : '<span style="' + MUTED + '">No reviews found.</span>') +
            "</div>" +
          "</div>" +
          '<div class="card"><h2>Summary</h2>' +
            '<div style="margin-top:0.4rem;font-size:0.86rem">' + (sub.summary ? esc(sub.summary) : '<span style="' + MUTED + '">No research summary.</span>') + "</div>" +
          "</div>" +
          '<div class="card"><h2>Sources</h2>' +
            '<div style="margin-top:0.4rem;' + MUTED + '">Sourcing: ' + esc(sub.sourcingMethod || "unknown") +
              (sub.lastVettedAt ? " · last vetted " + esc(String(sub.lastVettedAt).slice(0, 10)) : "") + "</div>" +
            '<div style="margin-top:0.35rem">' +
              (urls.length ? urls.map(function (u) {
                return '<a href="' + esc(u) + '" target="_blank" rel="noopener" style="display:block;font-size:0.78rem;word-break:break-all">' + esc(u) + "</a>";
              }).join("") : '<span style="' + MUTED + '">No source URLs on file.</span>') +
            "</div>" +
          "</div>" +
        "</div>";
    }
    function kv(label, valueHtml) {
      return '<div><span style="' + LBL + '">' + esc(label) + "</span><b>" + valueHtml + "</b></div>";
    }

    // ── Pricing ──
    function renderPricingTab() {
      panel.innerHTML =
        '<div style="display:grid;gap:0.9rem">' +
          '<div class="card"><h2>Pricing signals</h2>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.6rem;margin-top:0.5rem">' +
              '<label><span style="' + LBL + '">Price tier</span>' +
                '<select id="pxTier" style="' + FIELD + '">' +
                  ["unknown", "$", "$$", "$$$"].map(function (t) {
                    return '<option value="' + esc(t) + '"' + ((sub.priceTier || "unknown") === t ? " selected" : "") + ">" + esc(t) + "</option>";
                  }).join("") +
                "</select></label>" +
              '<label><span style="' + LBL + '">Minimum job size</span>' +
                '<input id="pxMin" style="' + FIELD + '" value="' + esc(sub.minimumJobSize || "") + '" placeholder="e.g. $5,000 or no minimum" /></label>' +
            "</div>" +
            '<label style="display:block;margin-top:0.6rem"><span style="' + LBL + '">Labor rate hints</span>' +
              '<textarea id="pxLabor" style="' + FIELD + ';min-height:60px;resize:vertical">' + esc(sub.laborRateHints || "") + "</textarea></label>" +
            '<label style="display:block;margin-top:0.6rem"><span style="' + LBL + '">Unit price notes</span>' +
              '<textarea id="pxUnit" style="' + FIELD + ';min-height:60px;resize:vertical">' + esc(sub.unitPriceNotes || "") + "</textarea></label>" +
            '<div style="margin-top:0.6rem"><button type="button" class="btn primary" id="pxSave">Save pricing</button></div>' +
          "</div>" +
          '<div class="card"><h2>Observed quotes</h2><div id="pxQuotes" style="margin-top:0.5rem;' + MUTED + '">Loading observed pricing…</div></div>' +
        "</div>";

      panel.querySelector("#pxSave").addEventListener("click", function () {
        var btn = panel.querySelector("#pxSave");
        btn.disabled = true;
        putSub(sub.id, {
          priceTier: panel.querySelector("#pxTier").value,
          minimumJobSize: panel.querySelector("#pxMin").value.trim(),
          laborRateHints: panel.querySelector("#pxLabor").value.trim(),
          unitPriceNotes: panel.querySelector("#pxUnit").value.trim()
        }).then(function (updated) {
          Object.assign(sub, updated);
          APP.toast("Pricing saved");
        }).catch(function (err) {
          APP.toast("Save failed: " + err.message);
        }).then(function () { btn.disabled = false; });
      });

      var quotesBox = panel.querySelector("#pxQuotes");
      Promise.all([
        fetchPricingIntel().catch(function () { return null; }),
        fetchJobs().catch(function () { return []; })
      ]).then(function (results) {
        if (profileState.tab !== "pricing" || !panel.contains(quotesBox)) return;
        var intel = results[0];
        var jobs = results[1] || [];
        var rows = [];
        var name = String(sub.companyName || "").toLowerCase().trim();
        var matches = function (sample) {
          if (!sample) return false;
          if (sample.subId && String(sample.subId) === String(sub.id)) return true;
          return !!(name && sample.subName && String(sample.subName).toLowerCase().trim() === name);
        };
        if (intel) {
          Object.keys(intel.trades || {}).forEach(function (trade) {
            ((intel.trades[trade] || {}).samples || []).forEach(function (sample) {
              if (matches(sample) && sample.source !== "job") rows.push(sample);
            });
          });
          (intel.items || []).forEach(function (item) {
            (((item || {}).observed || {}).samples || []).forEach(function (sample) {
              if (matches(sample) && sample.source !== "job") rows.push(sample);
            });
          });
        }
        // de-dupe identical samples that appear in both trade + item buckets
        var seenKeys = {};
        rows = rows.filter(function (r) {
          var key = [r.source, r.project, r.amount, r.at].join("|");
          if (seenKeys[key]) return false;
          seenKeys[key] = true;
          return true;
        });
        jobs.forEach(function (job) {
          if (Number(job.contractValue)) rows.push({ source: "job log", project: job.projectName, amount: Number(job.contractValue), at: job.completedAt });
        });
        rows.sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); });
        if (!rows.length) {
          quotesBox.innerHTML = '<div class="empty">No pricing observed yet — RFQ responses and logged jobs will appear here automatically.</div>';
          return;
        }
        quotesBox.removeAttribute("style");
        quotesBox.innerHTML =
          '<div style="overflow-x:auto"><table class="table"><thead><tr>' +
            "<th>Source</th><th>Project</th><th>Amount</th><th>Date</th>" +
          "</tr></thead><tbody>" +
          rows.map(function (r) {
            return "<tr><td>" + esc(r.source || "-") + "</td><td>" + esc(r.project || "-") + "</td>" +
              "<td><b>" + (Number(r.amount) ? APP.fmtMoney(Number(r.amount)) : esc(r.amount || "-")) + "</b></td>" +
              "<td>" + (r.at ? APP.fmtDate(r.at) : "-") + "</td></tr>";
          }).join("") +
          "</tbody></table></div>";
      });
    }

    // ── Compliance ──
    function renderComplianceTab() {
      var summary = docsSummary(sub);
      panel.innerHTML =
        '<div style="display:grid;gap:0.9rem">' +
          '<div class="card"><h2>Compliance packet ' + docsPill(sub) + "</h2>" +
            DOC_KEYS.map(function (key) {
              var item = (sub.docChecklist || {})[key] || { status: "missing", expiresAt: "" };
              return '<div style="display:grid;grid-template-columns:1.4fr 1fr ' + (DOC_EXPIRY[key] ? "1fr" : "") + ';gap:0.5rem;align-items:center;margin-top:0.55rem">' +
                '<b style="font-size:0.83rem">' + esc(DOC_LABELS[key]) + "</b>" +
                '<select id="doc_' + key + '" style="' + FIELD + '">' +
                  ["missing", "requested", "received", "exempt"].map(function (st) {
                    return '<option value="' + st + '"' + (st === (item.status || "missing") ? " selected" : "") + ">" + st + "</option>";
                  }).join("") +
                "</select>" +
                (DOC_EXPIRY[key] ? '<input id="docExp_' + key + '" type="date" title="expires" style="' + FIELD + '" value="' + esc(String(item.expiresAt || "").slice(0, 10)) + '" />' : "") +
              "</div>";
            }).join("") +
            '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.7rem;align-items:center">' +
              '<button type="button" class="btn primary" id="docsSave">Save checklist</button>' +
              '<button type="button" class="btn" id="docsRequest">Request docs</button>' +
              '<span style="' + MUTED + ';font-size:0.74rem">Packet complete (' + summary.total + "/" + summary.total + ") = ready to mark vetted.</span>" +
            "</div>" +
            '<div id="docsDraft"></div>' +
          "</div>" +
        "</div>";

      panel.querySelector("#docsSave").addEventListener("click", function () {
        var btn = panel.querySelector("#docsSave");
        var docChecklist = {};
        DOC_KEYS.forEach(function (key) {
          var existing = (sub.docChecklist || {})[key] || {};
          var expEl = panel.querySelector("#docExp_" + key);
          docChecklist[key] = {
            status: panel.querySelector("#doc_" + key).value,
            expiresAt: expEl ? expEl.value : (existing.expiresAt || ""),
            note: existing.note || ""
          };
        });
        btn.disabled = true;
        putSub(sub.id, { docChecklist: docChecklist }).then(function (updated) {
          Object.assign(sub, updated);
          APP.toast("Checklist saved");
          renderComplianceTab();
        }).catch(function (err) {
          APP.toast("Save failed: " + err.message);
          btn.disabled = false;
        });
      });

      panel.querySelector("#docsRequest").addEventListener("click", function () {
        var box = panel.querySelector("#docsDraft");
        box.innerHTML = '<div style="' + MUTED + ';margin-top:0.5rem">Drafting docs request…</div>';
        APP.fetchJSON(API + "/" + encodeURIComponent(sub.id) + "/chase-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "docs" })
        }).then(function (data) {
          var text = "Subject: " + (data.subject || "") + "\n\n" + (data.emailBody || "");
          box.innerHTML =
            '<div style="display:flex;gap:0.4rem;margin-top:0.6rem"><button type="button" class="btn" id="docsCopy">Copy draft</button></div>' +
            '<pre id="docsOut" style="' + PRE + '">' + esc(text) + "</pre>";
          box.querySelector("#docsCopy").addEventListener("click", function () { copyText(text); });
        }).catch(function (err) {
          box.innerHTML = '<div style="color:#b42318;margin-top:0.5rem">Draft failed: ' + esc(err.message) + "</div>";
        });
      });
    }

    // ── History ──
    function fetchJobs(force) {
      if (jobsCache && !force) return Promise.resolve(jobsCache);
      return APP.fetchJSON(API + "/" + encodeURIComponent(sub.id) + "/jobs").then(function (rows) {
        jobsCache = Array.isArray(rows) ? rows : [];
        return jobsCache;
      });
    }
    function fetchActivities(force) {
      if (activitiesCache && !force) return Promise.resolve(activitiesCache);
      return APP.fetchJSON(API + "/" + encodeURIComponent(sub.id) + "/activities").then(function (rows) {
        activitiesCache = Array.isArray(rows) ? rows : [];
        return activitiesCache;
      });
    }

    function renderHistoryTab() {
      panel.innerHTML =
        '<div style="display:grid;gap:0.9rem">' +
          '<div class="card"><h2>Outreach ' + stagePill(sub.outreachStage) + "</h2>" +
            '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.5rem">' +
              '<button type="button" class="btn" data-chase="email">Draft email</button>' +
              '<button type="button" class="btn" data-chase="phone">Phone script</button>' +
              '<button type="button" class="btn" id="chaseCopy" style="display:none">Copy</button>' +
              '<button type="button" class="btn" data-log="outbound_email">Log email sent</button>' +
              '<button type="button" class="btn" data-log="phone_call">Log call</button>' +
            "</div>" +
            '<pre id="chaseOut" style="' + PRE + ';display:none"></pre>' +
          "</div>" +
          '<div class="card"><h2>Activity log</h2><div id="histActivities" style="margin-top:0.5rem;' + MUTED + '">Loading activities…</div></div>' +
          '<div class="card"><h2>Jobs</h2><div id="histJobs" style="margin-top:0.5rem;' + MUTED + '">Loading jobs…</div></div>' +
          '<div class="card"><h2>Log a job (drives the score)</h2>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;margin-top:0.5rem">' +
              numField("jQ", "Quality /10") + numField("jT", "On time /10") + numField("jP", "Price fair /10") + numField("jC", "Comms /10") +
            "</div>" +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.5rem;margin-top:0.55rem">' +
              '<label><span style="' + LBL + '">Project name</span><input id="jName" style="' + FIELD + '" placeholder="e.g. Sherman Oaks ADU" /></label>' +
              '<label><span style="' + LBL + '">Contract value $</span><input id="jVal" type="number" min="0" style="' + FIELD + '" /></label>' +
              '<label><span style="' + LBL + '">Would rehire</span><select id="jRehire" style="' + FIELD + '"><option value="true">yes</option><option value="false">no</option></select></label>' +
            "</div>" +
            '<div style="margin-top:0.6rem"><button type="button" class="btn primary" id="jSave">Save job</button></div>' +
          "</div>" +
        "</div>";

      var chaseOut = panel.querySelector("#chaseOut");
      var chaseCopy = panel.querySelector("#chaseCopy");
      var chaseText = "";

      panel.querySelectorAll("[data-chase]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var mode = btn.dataset.chase;
          chaseOut.style.display = "block";
          chaseOut.textContent = "Drafting…";
          APP.fetchJSON(API + "/" + encodeURIComponent(sub.id) + "/chase-task", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: mode })
          }).then(function (data) {
            chaseText = mode === "phone" ? (data.phoneScript || "") : "Subject: " + (data.subject || "") + "\n\n" + (data.emailBody || "");
            chaseOut.textContent = chaseText;
            chaseCopy.style.display = "";
          }).catch(function (err) {
            chaseOut.textContent = "Draft failed: " + err.message;
          });
        });
      });
      chaseCopy.addEventListener("click", function () { if (chaseText) copyText(chaseText); });

      panel.querySelectorAll("[data-log]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var type = btn.dataset.log;
          btn.disabled = true;
          APP.fetchJSON(API + "/" + encodeURIComponent(sub.id) + "/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: type, outcome: "logged" })
          }).then(function () {
            var stage = sub.outreachStage;
            if (!stage || stage === "not_contacted" || stage === "queued" || type === "outbound_email" || type === "phone_call") stage = "contacted";
            return putSub(sub.id, { outreachStage: stage });
          }).then(function (updated) {
            Object.assign(sub, updated);
            activitiesCache = null;
            APP.toast(type === "phone_call" ? "Call logged" : "Email logged");
            renderHistoryTab();
          }).catch(function (err) {
            APP.toast("Log failed: " + err.message);
            btn.disabled = false;
          });
        });
      });

      panel.querySelector("#jSave").addEventListener("click", function () {
        var btn = panel.querySelector("#jSave");
        var payload = {
          projectName: panel.querySelector("#jName").value.trim(),
          contractValue: Number(panel.querySelector("#jVal").value || 0),
          quality: Number(panel.querySelector("#jQ").value),
          timeliness: Number(panel.querySelector("#jT").value),
          priceFairness: Number(panel.querySelector("#jP").value),
          communication: Number(panel.querySelector("#jC").value),
          wouldRehire: panel.querySelector("#jRehire").value === "true",
          trade: sub.serviceCategory
        };
        btn.disabled = true;
        APP.fetchJSON(API + "/" + encodeURIComponent(sub.id) + "/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (created) {
          if (created && created.subcontractorScores) {
            Object.assign(sub, created.subcontractorScores);
            updateRosterRecord(Object.assign({ id: sub.id }, created.subcontractorScores));
          }
          jobsCache = null;
          APP.toast("Job logged");
          renderHistoryTab();
        }).catch(function (err) {
          APP.toast("Job save failed: " + err.message);
          btn.disabled = false;
        });
      });

      var actBox = panel.querySelector("#histActivities");
      fetchActivities().then(function (rows) {
        if (!panel.contains(actBox)) return;
        if (!rows.length) {
          actBox.innerHTML = '<div class="empty">No activity logged yet — draft an email or phone script above to get started.</div>';
          return;
        }
        actBox.removeAttribute("style");
        actBox.innerHTML =
          '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Type</th><th>Outcome</th><th>Date</th><th>Notes</th></tr></thead><tbody>' +
          rows.map(function (a) {
            return "<tr><td>" + esc(String(a.type || "note").replace(/_/g, " ")) + "</td>" +
              "<td>" + esc(a.outcome || "-") + "</td>" +
              '<td style="white-space:nowrap">' + (a.occurredAt ? APP.fmtDate(a.occurredAt) : "-") + "</td>" +
              "<td>" + esc(a.notes || "") + "</td></tr>";
          }).join("") +
          "</tbody></table></div>";
      }).catch(function (err) {
        if (panel.contains(actBox)) actBox.innerHTML = '<span style="color:#b42318">Could not load activities: ' + esc(err.message) + "</span>";
      });

      var jobsBox = panel.querySelector("#histJobs");
      fetchJobs().then(function (rows) {
        if (!panel.contains(jobsBox)) return;
        if (!rows.length) {
          jobsBox.innerHTML = '<div class="empty">No jobs logged yet — initial score is research-based.</div>';
          return;
        }
        jobsBox.removeAttribute("style");
        jobsBox.innerHTML =
          '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Project</th><th>Score</th><th>Value</th><th>Date</th></tr></thead><tbody>' +
          rows.map(function (j) {
            return "<tr><td>" + esc(j.projectName || "job") + "</td>" +
              "<td>" + APP.scoreBadge(j.score) + "</td>" +
              "<td>" + (Number(j.contractValue) ? APP.fmtMoney(Number(j.contractValue)) : "-") + "</td>" +
              '<td style="white-space:nowrap">' + (j.completedAt ? APP.fmtDate(j.completedAt) : "-") + "</td></tr>";
          }).join("") +
          "</tbody></table></div>";
      }).catch(function (err) {
        if (panel.contains(jobsBox)) jobsBox.innerHTML = '<span style="color:#b42318">Could not load jobs: ' + esc(err.message) + "</span>";
      });
    }
    function numField(id, label) {
      return '<label><span style="' + LBL + '">' + esc(label) + '</span><input id="' + id + '" type="number" min="1" max="10" value="8" style="' + FIELD + '" /></label>';
    }

    renderTab();
  }

  // ══════════════════════ COMPARE VIEW ══════════════════════
  // Route is encoded as a single #/subs/:id param — "compare:<id1>,<id2>,..." —
  // since the shell router (app.html parseHash) only ever captures one path segment.
  // ── "What makes up the score" layer ──────────────────────────────
  // FACTORS mirrors server.js computeLegitScore() EXACTLY (base 20, clamp 0-100).
  // The compare view derives the "Why stronger" sentence and the "Score breakdown"
  // from this one array, so the wording can never drift from the real weights.
  // See VETTING_SCALE.md for the plain-English reference.
  var FACTORS = [
    { key: "base", label: function () { return "Base score"; }, pts: function () { return 20; } },
    { key: "license",
      label: function (s) { return s.licenseVerified ? "License CSLB-verified" : "License # on file"; },
      pts: function (s) { return s.licenseVerified ? 25 : (hasText(s.licenseNumber) ? 12 : 0); } },
    { key: "licenseStatus",
      label: function (s) { var st = String(s.licenseStatus || "").toLowerCase(); if (st === "active") return "License active"; if (/expired|suspended|revoked/.test(st)) return "License " + st; if (st === "not_found") return "License not found"; return "License " + (st || "unchecked"); },
      pts: function (s) { var st = String(s.licenseStatus || "").toLowerCase(); if (st === "active") return 10; if (/expired|suspended|revoked/.test(st)) return -25; if (st === "not_found") return -20; return 0; } },
    { key: "website",
      label: function (s) { return s.websiteAlive === true ? "Website live" : "Website dead"; },
      pts: function (s) { return s.websiteAlive === true ? 8 : s.websiteAlive === false ? -10 : 0; } },
    { key: "reviewRating",
      label: function (s) { var r = Number(s.reviewRating || 0); return (r > 0 && r < 3 ? "Low rating " : "Reviews ") + r + "★"; },
      pts: function (s) { var r = Number(s.reviewRating || 0); if (r >= 4.5) return 15; if (r >= 4) return 10; if (r >= 3.5) return 5; if (r > 0 && r < 3) return -10; return 0; } },
    { key: "reviewCount",
      label: function (s) { return "Review volume (" + Number(s.reviewCount || 0) + ")"; },
      pts: function (s) { var n = Number(s.reviewCount || 0); if (n >= 100) return 10; if (n >= 25) return 7; if (n >= 5) return 4; return 0; } },
    { key: "owner", label: function () { return "Named owner"; }, pts: function (s) { return hasText(s.ownerName) ? 5 : 0; } },
    { key: "reach", label: function () { return "Owner-level contact"; }, pts: function (s) { return String(s.reachTier || "") === "owner" ? 5 : 0; } },
    { key: "insurance", label: function () { return "Insurance verified"; }, pts: function (s) { return s.insuranceVerified ? 5 : 0; } },
    { key: "workersComp", label: function () { return "Workers comp current"; }, pts: function (s) { return /active|verified|current/i.test(s.workersCompStatus || "") ? 4 : 0; } },
    { key: "bonded", label: function () { return "Bonded"; }, pts: function (s) { return /bonded|verified|active|yes/i.test(s.bondedStatus || "") ? 3 : 0; } },
    { key: "sourceConfidence",
      label: function (s) { return String(s.sourceConfidence || "").toLowerCase() === "low" ? "Low source confidence" : "High source confidence"; },
      pts: function (s) { var c = String(s.sourceConfidence || "").toLowerCase(); return c === "high" ? 5 : c === "low" ? -5 : 0; } },
    { key: "jobs",
      label: function (s) { return Number(s.jobScore) >= 70 ? "Strong job history" : "Job history"; },
      pts: function (s) { return Number(s.jobCount) > 0 ? (Number(s.jobScore) >= 70 ? 12 : 6) : 0; } },
    { key: "redFlags",
      label: function (s) { var n = (s.redFlags || []).length; return "Red flag" + (n === 1 ? "" : "s") + " (" + n + ")"; },
      pts: function (s) { return -15 * ((s.redFlags || []).length); } }
  ];

  function capFirst(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }
  function reviewPhrase(s) {
    var n = Number(s.reviewCount || 0);
    var r = Number(s.reviewRating || 0);
    if (r && !n) return r + "★ (review count unknown)";
    if (!r && n) return n + " reviews (unrated)";
    return r + "★ across " + n + " review" + (n === 1 ? "" : "s");
  }

  // One deterministic sentence: top 2-3 positive contributors + the single biggest drag.
  function whyStronger(s) {
    var f = {}; FACTORS.forEach(function (x) { f[x.key] = x.pts(s); });
    var pos = [];
    var licPts = Math.max(f.license, 0) + Math.max(f.licenseStatus, 0);
    if (licPts > 0) {
      var lic = [];
      if (f.license > 0) lic.push(s.licenseVerified ? "CSLB verified" : "licensed");
      if (f.licenseStatus > 0) lic.push("active");
      pos.push({ pts: licPts, text: lic.join(" + ") });
    }
    var revPts = Math.max(f.reviewRating, 0) + Math.max(f.reviewCount, 0);
    if (revPts > 0 && Number(s.reviewRating) > 0) pos.push({ pts: revPts, text: reviewPhrase(s) });
    if (f.website > 0) pos.push({ pts: f.website, text: "live website" });
    var ownPts = Math.max(f.owner, 0) + Math.max(f.reach, 0);
    if (ownPts > 0) pos.push({ pts: ownPts, text: f.reach > 0 ? "named owner, direct reach" : "named owner" });
    if (f.insurance > 0) pos.push({ pts: f.insurance, text: "insurance on file" });
    if (f.workersComp > 0) pos.push({ pts: f.workersComp, text: "workers comp current" });
    if (f.bonded > 0) pos.push({ pts: f.bonded, text: "bonded" });
    if (f.sourceConfidence > 0) pos.push({ pts: f.sourceConfidence, text: "high-confidence sourcing" });
    if (f.jobs > 0) pos.push({ pts: f.jobs, text: Number(s.jobScore) >= 70 ? "strong job history" : "job history" });
    pos.sort(function (a, b) { return b.pts - a.pts; });
    var lead = pos.length ? capFirst(pos.slice(0, 3).map(function (p) { return p.text; }).join(", ")) : "Little verified evidence yet";
    var drag = biggestDrag(s);
    return lead + (drag ? " — held back by: " + drag : "");
  }

  // The single biggest drag: worst real negative if any, else the most valuable missing signal.
  function biggestDrag(s) {
    var negs = [];
    var flags = (s.redFlags || []).length;
    if (flags) negs.push({ pts: -15 * flags, text: flags + " red flag" + (flags === 1 ? "" : "s") });
    var st = String(s.licenseStatus || "").toLowerCase();
    if (/expired|suspended|revoked/.test(st)) negs.push({ pts: -25, text: "license " + st });
    else if (st === "not_found") negs.push({ pts: -20, text: "license not found on CSLB" });
    if (s.websiteAlive === false) negs.push({ pts: -10, text: "dead website" });
    var r = Number(s.reviewRating || 0);
    if (r > 0 && r < 3) negs.push({ pts: -10, text: "weak rating (" + r + "★)" });
    if (String(s.sourceConfidence || "").toLowerCase() === "low") negs.push({ pts: -5, text: "low source confidence" });
    if (negs.length) { negs.sort(function (a, b) { return a.pts - b.pts; }); return negs[0].text; }
    if (!s.licenseVerified) return hasText(s.licenseNumber) ? "license not CSLB-verified" : "no license on file";
    if (!Number(s.reviewCount)) return "no reviews found";
    if (Number(s.reviewCount) < 5) return "thin review sample";
    if (!hasText(s.ownerName)) return "no named owner";
    if (!hasPricingSignal(s)) return "no pricing signal";
    if (!s.insuranceVerified) return "insurance unverified";
    return "";
  }

  // Compact green/red list of only the non-zero contributions, reconciling to the trust score.
  function scoreBreakdown(s) {
    var lines = FACTORS.map(function (x) { return { pts: x.pts(s), label: x.label(s) }; })
      .filter(function (c) { return c.pts !== 0; });
    var body = lines.map(function (c) {
      var pos = c.pts > 0;
      var col = pos ? "#0f766e" : "#b42318";
      var val = (pos ? "+" : "−") + Math.abs(c.pts);
      return '<div style="color:' + col + ';display:flex;justify-content:space-between;gap:0.8rem">' +
        "<span>" + esc(c.label) + "</span><span style=\"font-weight:700\">" + val + "</span></div>";
    }).join("");
    return '<div class="js-bd" style="display:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.72rem;line-height:1.55;margin-top:0.2rem">' +
      body +
      '<div style="display:flex;justify-content:space-between;gap:0.8rem;border-top:1px solid #e6e9ef;margin-top:0.25rem;padding-top:0.2rem;color:#101828">' +
        "<span>Trust score</span><span style=\"font-weight:800\">" + Number(s.legitScore || 0) + "</span></div>" +
      "</div>";
  }

  // Review QUALITY lens (separate from trust): rating x volume. See VETTING_SCALE.md.
  function reviewQuality(s) {
    var r = Number(s.reviewRating || 0), n = Number(s.reviewCount || 0);
    if (!n) return "none";
    if (n < 5) return "thin sample";
    if (r >= 4.5 && n >= 25) return "strong";
    return "decent"; // >=5 reviews below the strong bar; the actual star shows sentiment
  }
  function reviewQualityPill(s) {
    var q = reviewQuality(s);
    if (q === "none") return ' <span style="' + MUTED + ';font-size:0.7rem">none</span>';
    var cls = { strong: "green", decent: "plum", "thin sample": "amber" }[q] || "";
    return ' <span class="pill ' + cls + '" style="font-size:0.68rem">' + q + "</span>";
  }

  // Price lens (separate again): tier + minimum + observed-vs-trade-median. Uses the
  // pricing-intel cache; mirrors the profile pricing tab's quote-matching (subId or name).
  function medianOf(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[Math.floor(a.length / 2)];
  }
  function collectSubQuotes(s, intel) {
    if (!intel) return [];
    var name = String(s.companyName || "").toLowerCase().trim();
    var seen = {}, out = [];
    var matches = function (sm) {
      if (!sm) return false;
      if (sm.subId && String(sm.subId) === String(s.id)) return true;
      return !!(name && sm.subName && String(sm.subName).toLowerCase().trim() === name);
    };
    var take = function (sm) {
      if (!matches(sm) || sm.source === "job" || !Number(sm.amount)) return;
      var key = [sm.source, sm.project, sm.amount, sm.at].join("|");
      if (seen[key]) return;
      seen[key] = true;
      out.push(Number(sm.amount));
    };
    Object.keys(intel.trades || {}).forEach(function (t) { ((intel.trades[t] || {}).samples || []).forEach(take); });
    (intel.items || []).forEach(function (item) { (((item || {}).observed || {}).samples || []).forEach(take); });
    return out;
  }
  function tradeMedianFor(intel, cat) {
    if (!intel || !intel.trades || !cat) return null;
    var t = intel.trades[cat];
    if (!t) {
      var key = Object.keys(intel.trades).find(function (k) { return k.toLowerCase() === String(cat).toLowerCase(); });
      if (key) t = intel.trades[key];
    }
    return t && Number(t.median) ? Number(t.median) : null;
  }
  function priceCompareLine(s, intel) {
    if (!intel) return "no price data";
    var tradeMed = tradeMedianFor(intel, s.serviceCategory);
    var amounts = collectSubQuotes(s, intel);
    if (amounts.length) {
      var m = medianOf(amounts);
      if (tradeMed) {
        var diff = Math.round((m - tradeMed) / tradeMed * 100);
        var rel = diff === 0 ? "on par" : Math.abs(diff) + "% " + (diff < 0 ? "cheaper" : "pricier");
        return "their quotes ~" + APP.fmtMoney(m) + " median vs trade median " + APP.fmtMoney(tradeMed) + " (" + rel + ")";
      }
      return "their quotes ~" + APP.fmtMoney(m) + " median (" + amounts.length + " obs)";
    }
    if (tradeMed) return "no quotes yet &middot; trade median " + APP.fmtMoney(tradeMed);
    return "no price data";
  }
  function priceCell(s, intel) {
    var head = [];
    if (hasText(s.priceTier) && s.priceTier !== "unknown") head.push("<b>" + esc(s.priceTier) + "</b>");
    else head.push('<span style="' + MUTED + '">tier —</span>');
    if (hasText(s.minimumJobSize)) head.push('<span style="' + MUTED + '">min job ' + esc(s.minimumJobSize) + "</span>");
    return head.join(" &middot; ") +
      '<div style="' + MUTED + ';font-size:0.74rem;margin-top:0.2rem">' + priceCompareLine(s, intel) + "</div>";
  }

  var COMPARE_ROWS = [
    { label: "Trust score", numeric: true, sortVal: function (s) { return Number(s.legitScore || 0); }, value: function (s) { return legitCell(s); } },
    { label: "Record score", numeric: true, sortVal: function (s) { return Number(s.completenessScore || 0); }, value: function (s) { return APP.scoreBadge(s.completenessScore); } },
    { label: "Overall", numeric: true, sortVal: function (s) { return overall(s); }, value: function (s) { return APP.scoreBadge(overall(s)); } },
    { label: "Tier", value: function (s) { return APP.tierPill(s.legitTier || "unverified"); } },
    { label: "Why stronger", value: function (s) { return '<span style="font-size:0.8rem;line-height:1.45;color:#344054">' + esc(whyStronger(s)) + "</span>"; } },
    { label: "Score breakdown",
      labelHtml: 'Score breakdown<br /><a href="#" data-act="toggle-breakdown" style="color:#2563eb;font-size:0.72rem;font-weight:600;text-decoration:none">Show breakdown</a>',
      value: function (s) { return scoreBreakdown(s); } },
    { label: "License", value: function (s) { return licenseCell(s) + (s.licenseStatus && s.licenseStatus !== "unchecked" ? ' <span style="' + MUTED + '">(' + esc(s.licenseStatus) + ")</span>" : ""); } },
    { label: "Reviews", numeric: true, sortVal: function (s) { return Number(s.reviewRating || 0); }, value: function (s) { return reviewsCell(s) + reviewQualityPill(s); } },
    { label: "Contact", value: function (s) {
        var bits = [];
        if (s.ownerName) bits.push(esc(s.ownerName));
        if (s.email) bits.push('<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a>");
        if (s.phone) bits.push('<a href="tel:' + esc(s.phone) + '">' + esc(s.phone) + "</a>");
        var strength = contactStrength(s);
        var pill = strength === "strong" ? '<span class="pill green">strong</span>' : strength === "weak" ? '<span class="pill amber">weak</span>' : '<span class="pill red">none</span>';
        return (bits.length ? bits.join("<br/>") : '<span style="' + MUTED + '">no contact on file</span>') + "<br/>" + pill;
      } },
    { label: "Docs", numeric: true, sortVal: function (s) { return docsSummary(s).received; }, value: function (s) { return docsPill(s); } },
    { label: "Price", value: function (s, ctx) { return priceCell(s, ctx && ctx.intel); } },
    { label: "Outreach stage", value: function (s) { return stagePill(s.outreachStage); } },
    { label: "Red flags", value: function (s) {
        var flags = s.redFlags || [];
        return flags.length ? flags.map(function (f) { return '<span class="pill red" style="margin-right:0.25rem">' + esc(f) + "</span>"; }).join("") : '<span style="' + MUTED + '">none</span>';
      } },
    { label: "Years in business", value: function (s) { return esc(s.yearsInBusiness || "-"); } },
    { label: "Service area", value: function (s) { return esc(s.serviceArea || "-"); } },
    { label: "Vetting notes", value: function (s) {
        var notes = s.vettingNotes || "";
        if (!notes) return '<span style="' + MUTED + '">-</span>';
        var trimmed = notes.length > 140 ? notes.slice(0, 140) + "…" : notes;
        return '<span title="' + esc(notes) + '">' + esc(trimmed) + "</span>";
      } }
  ];

  function renderCompare(container, ids) {
    container.innerHTML = '<div class="card"><span style="' + MUTED + '">Loading comparison…</span></div>';
    // Pricing intel loads in parallel (cached module-wide); a failure just degrades
    // the Price row to "no price data" — never blocks the comparison.
    var intelP = fetchPricingIntel().catch(function () { return null; });
    fetchRoster().then(function (rows) {
      var found = ids.map(function (id) { return rows.find(function (s) { return s.id === id; }); }).filter(Boolean);
      if (found.length === ids.length) return found;
      // Maybe one was added/renamed since the roster was cached — refetch once.
      return fetchRoster(true).then(function (fresh) {
        return ids.map(function (id) { return fresh.find(function (s) { return s.id === id; }); }).filter(Boolean);
      });
    }).then(function (subs) {
      return intelP.then(function (intel) { buildCompare(container, subs, intel); });
    }).catch(function (err) {
      container.innerHTML = errorCard(err.message || "Failed to load comparison.");
      var retry = container.querySelector('[data-act="retry"]');
      if (retry) retry.addEventListener("click", function () { renderCompare(container, ids); });
    });
  }

  function buildCompare(container, subs, intel) {
    if (!subs.length) {
      container.innerHTML = '<div style="margin-bottom:0.6rem"><a href="#/subs" style="' + MUTED + ';font-weight:700;text-decoration:none">← Back to subs</a></div>' +
        '<div class="card"><div class="empty">None of these subs could be found — they may have been deleted.</div></div>';
      return;
    }
    var ctx = { intel: intel || null };
    var theadCols = subs.map(function (s) {
      return '<th style="min-width:200px">' + esc(s.companyName) +
        (s.trusted ? ' <span title="Your trusted contact">⭐</span>' : "") +
        '<br /><span style="' + MUTED + ';font-weight:400">' + esc(s.serviceCategory || "") + "</span></th>";
    }).join("");

    var bodyRows = COMPARE_ROWS.map(function (r) {
      var bestSet = null;
      if (r.numeric) {
        var vals = subs.map(r.sortVal);
        var max = Math.max.apply(null, vals);
        if (max > 0) {
          bestSet = {};
          vals.forEach(function (v, i) { if (v === max) bestSet[i] = true; });
        }
      }
      var cells = subs.map(function (s, i) {
        var hl = bestSet && bestSet[i] ? "background:#f0fdf4;" : "";
        return '<td style="' + hl + 'min-width:200px">' + r.value(s, ctx) + "</td>";
      }).join("");
      var labelCell = r.labelHtml || esc(r.label);
      return '<tr><td style="font-weight:700;white-space:nowrap;color:#101828;font-size:0.8rem;vertical-align:top">' + labelCell + "</td>" + cells + "</tr>";
    }).join("");

    container.innerHTML =
      '<div style="margin-bottom:0.6rem"><a href="#/subs" style="' + MUTED + ';font-weight:700;text-decoration:none">← Back to subs</a></div>' +
      '<div class="card">' +
        "<h1>Compare subs</h1>" +
        '<div style="overflow-x:auto;margin-top:0.6rem">' +
          '<table class="table"><thead><tr><th style="min-width:140px"></th>' + theadCols + "</tr></thead><tbody>" + bodyRows + "</tbody></table>" +
        "</div>" +
      "</div>";

    // Score-breakdown row: one toggle reveals/hides every column's breakdown at once.
    var bdToggle = container.querySelector('[data-act="toggle-breakdown"]');
    if (bdToggle) bdToggle.addEventListener("click", function (e) {
      e.preventDefault();
      var open = container.getAttribute("data-bd") === "open";
      container.setAttribute("data-bd", open ? "closed" : "open");
      Array.prototype.forEach.call(container.querySelectorAll(".js-bd"), function (node) {
        node.style.display = open ? "none" : "block";
      });
      bdToggle.textContent = open ? "Show breakdown" : "Hide breakdown";
    });
  }

  // ── register with the shell ──
  APP.registerView("subs", {
    title: "Subs",
    render: function (container, params) {
      params = params || {};
      if (params.id && String(params.id).indexOf("compare:") === 0) {
        var ids = String(params.id).slice("compare:".length).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        renderCompare(container, ids);
      } else if (params.id) {
        renderProfile(container, params.id);
      } else {
        renderList(container);
      }
    }
  });
})();
