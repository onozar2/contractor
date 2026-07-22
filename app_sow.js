/* Scope of Work view (#/sow) — Joon's formal SOW builder.
   Left: the document being built (client/project info, scope sections, attached
   design concepts, allowances, price, payment schedule). Right: the TOOLBOX —
   predrafted scope blocks per job type (knowledge/scope-library.json via
   /api/sow/library) that swap into the document in one click, plus the
   approved-render picker (/api/design/renders?status=approved).
   Every doc prints through GET /api/sow/:id/doc — the uniform Joon document
   with letterhead, CA notices, payment schedule, signatures, and the AI-render
   disclaimer whenever concepts are attached. */
(function () {
  "use strict";

  var st = null;
  function freshState() {
    return {
      mode: "list",          // "list" | "edit"
      docs: [],
      library: null,         // /api/sow/library payload
      approved: [],          // approved renders for the attach picker
      doc: null,             // working document (edit mode)
      docId: null,           // Mongo id when persisted
      dirty: false,
      libFilter: ""
    };
  }

  function money(n) {
    var v = Number(n) || 0;
    return "$" + v.toLocaleString("en-US");
  }

  var CSS =
    "#sw{max-width:1280px;margin:0 auto;min-width:0;width:100%;box-sizing:border-box}" +
    "#swGrid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:1.1rem;align-items:start}" +
    "@media (max-width:980px){#swGrid{grid-template-columns:1fr}}" +
    // Doc list
    ".sw-row{display:flex;flex-wrap:wrap;align-items:center;gap:0.6rem;border:1px solid var(--line);border-radius:12px;background:#fff;padding:0.75rem 0.95rem;margin-bottom:0.6rem;cursor:pointer}" +
    ".sw-row:hover{box-shadow:0 6px 18px rgba(16,24,40,0.08)}" +
    ".sw-row b{font-size:0.95rem;color:#1d2634}" +
    ".sw-row .mut{font-size:0.76rem;color:var(--muted)}" +
    ".sw-row .right{margin-left:auto;display:flex;align-items:center;gap:0.6rem}" +
    ".sw-pill{display:inline-block;border-radius:999px;padding:0.1rem 0.55rem;font-size:0.66rem;font-weight:850;text-transform:uppercase;letter-spacing:0.05em;border:1px solid var(--line);background:#f5f7fa;color:#586074}" +
    ".sw-pill.sent{background:#eef4fe;color:#1d4ed8;border-color:#cfe0fb}" +
    ".sw-pill.signed{background:#e7f6f4;color:#0f766e;border-color:#bfe6e1}" +
    // Editor cards
    ".sw-card{border:1px solid var(--line);border-radius:14px;background:#fff;padding:0.95rem;margin-bottom:1rem}" +
    ".sw-card h2{margin:0 0 0.7rem;font-size:1.02rem}" +
    ".sw-k{display:block;font-size:0.66rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin:0.6rem 0 0.22rem}" +
    ".sw-in,#sw textarea,#sw select{width:100%;border:1px solid #d8dee8;border-radius:8px;padding:0.48rem 0.62rem;font:inherit;font-size:0.87rem;background:#f8fafc;box-sizing:border-box}" +
    "#sw textarea{resize:vertical;min-height:64px;line-height:1.45}" +
    ".sw-2col{display:grid;grid-template-columns:1fr 1fr;gap:0 0.8rem}" +
    "@media (max-width:640px){.sw-2col{grid-template-columns:1fr}}" +
    // Scope sections
    ".sw-sec{border:1px solid var(--line);border-radius:12px;margin-bottom:0.7rem;overflow:hidden}" +
    ".sw-sec-head{display:flex;align-items:center;gap:0.55rem;padding:0.6rem 0.8rem;background:#f8fafc;cursor:pointer}" +
    ".sw-sec-head b{font-size:0.9rem;color:#1d2634}" +
    ".sw-sec-head .chev{color:var(--muted);font-size:0.7rem;width:0.8rem}" +
    ".sw-sec-head .mut{font-size:0.72rem;color:var(--muted)}" +
    ".sw-sec-head .x{margin-left:auto;border:0;background:#fdecea;color:#b42318;border-radius:8px;width:26px;height:26px;cursor:pointer;font-size:0.8rem}" +
    ".sw-sec-head .mv{border:0;background:#eef1f6;color:#586074;border-radius:8px;width:26px;height:26px;cursor:pointer;font-size:0.75rem}" +
    ".sw-sec-body{padding:0.7rem 0.85rem;display:none}" +
    ".sw-sec.open .sw-sec-body{display:block}" +
    ".sw-hint{font-size:0.72rem;color:var(--muted);margin-top:0.2rem}" +
    // Concept refs
    ".sw-con{display:flex;gap:0.7rem;align-items:center;border:1px solid var(--line);border-radius:10px;padding:0.5rem 0.65rem;margin-bottom:0.5rem}" +
    ".sw-con img{width:86px;height:64px;object-fit:cover;border-radius:6px;background:#f0f2f5}" +
    ".sw-con .tx{min-width:0;flex:1}" +
    ".sw-con .tx b{display:block;font-size:0.84rem;color:#1d2634;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".sw-con .tx span{font-size:0.72rem;color:var(--muted)}" +
    ".sw-con .x{border:0;background:#fdecea;color:#b42318;border-radius:8px;width:26px;height:26px;cursor:pointer}" +
    // Toolbox
    "#swTools{position:sticky;top:0.5rem}" +
    ".sw-tool-list{max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:0.35rem;margin-top:0.5rem}" +
    ".sw-tool{display:flex;align-items:baseline;gap:0.5rem;border:1px solid #e2e7ee;background:#fff;border-radius:9px;padding:0.45rem 0.6rem;cursor:pointer;text-align:left;font:inherit}" +
    ".sw-tool:hover{border-color:var(--blue);box-shadow:0 2px 8px rgba(16,24,40,0.07)}" +
    ".sw-tool b{font-size:0.82rem;color:#1d2634}" +
    ".sw-tool .cat{margin-left:auto;font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);white-space:nowrap}" +
    ".sw-tool .plus{color:var(--blue);font-weight:900}" +
    // Payment schedule rows
    ".sw-pay{display:grid;grid-template-columns:1.2fr 2fr 4.4rem 26px;gap:0.4rem;margin-bottom:0.4rem;align-items:start}" +
    ".sw-pay .x{border:0;background:#fdecea;color:#b42318;border-radius:8px;height:32px;cursor:pointer;align-self:center}" +
    ".sw-allow{display:grid;grid-template-columns:1.5fr 2fr 6rem 26px;gap:0.4rem;margin-bottom:0.4rem;align-items:start}" +
    ".sw-allow .x{border:0;background:#fdecea;color:#b42318;border-radius:8px;height:32px;cursor:pointer;align-self:center}" +
    "@media (max-width:640px){.sw-pay,.sw-allow{grid-template-columns:1fr 1fr;padding-bottom:0.5rem;border-bottom:1px dashed var(--line)}.sw-pay .p-note,.sw-allow .a-note{grid-column:1/-1}}" +
    ".sw-total{font-size:0.8rem;color:var(--muted);margin-top:0.3rem}" +
    ".sw-total b{color:#1d2634}" +
    ".sw-warn{color:#b42318;font-size:0.76rem;font-weight:700;margin-top:0.3rem}" +
    // Action bar
    "#swBar{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:0.55rem;align-items:center;margin-top:0.4rem;padding:0.7rem;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,0.94);backdrop-filter:blur(6px);box-shadow:0 -6px 20px rgba(16,24,40,0.06)}" +
    "#swBar .note{font-size:0.74rem;color:var(--muted)}" +
    ".sw-banner{display:flex;gap:0.5rem;align-items:center;background:#f4f8ff;border:1px solid #cfe0fb;border-radius:10px;padding:0.6rem 0.8rem;color:#2b4a7a;font-size:0.82rem;margin-bottom:0.8rem}";

  /* ============================ RENDER ============================ */

  function render(container) {
    st = freshState();
    if (!document.getElementById("swCss")) {
      var style = document.createElement("style");
      style.id = "swCss"; style.textContent = CSS;
      document.head.appendChild(style);
    }
    container.innerHTML = '<div id="sw"></div>';
    loadAll();
  }

  function host() { return document.getElementById("sw"); }

  function loadAll() {
    var h = host();
    if (!h) return;
    h.innerHTML = '<div class="viewhead"><h1>📋 Scope of Work</h1></div><div class="muted" style="font-size:0.85rem">Loading…</div>';
    Promise.all([
      APP.fetchJSON("/api/sow").catch(function () { return []; }),
      APP.fetchJSON("/api/sow/library").catch(function () { return null; }),
      APP.fetchJSON("/api/design/renders?status=approved").catch(function () { return []; })
    ]).then(function (results) {
      st.docs = results[0] || [];
      st.library = results[1];
      st.approved = results[2] || [];
      renderList();
    });
  }

  /* ============================ LIST MODE ============================ */

  function pendingAttach() {
    try {
      var raw = localStorage.getItem("sowAttachRender");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function renderList() {
    st.mode = "list";
    var h = host();
    var attach = pendingAttach();
    var rows = st.docs.map(function (d) {
      return '<div class="sw-row" role="button" tabindex="0" data-id="' + APP.esc(d.id) + '">' +
        '<b>' + APP.esc(d.docNumber || "SOW") + '</b>' +
        '<span>' + APP.esc(d.clientName || "No client yet") + (d.projectName ? ' — ' + APP.esc(d.projectName) : "") + '</span>' +
        '<span class="right">' +
          '<span class="mut">' + (d.sections || 0) + ' section' + (d.sections === 1 ? "" : "s") +
            (d.renders ? ' · ' + d.renders + ' concept' + (d.renders === 1 ? "" : "s") : "") +
            (d.priceTotal ? ' · ' + money(d.priceTotal) : "") + '</span>' +
          '<span class="sw-pill ' + APP.esc(d.status || "draft") + '">' + APP.esc(d.status || "draft") + '</span>' +
        '</span>' +
      '</div>';
    }).join("");
    var libNote = st.library && st.library.jobTypes
      ? st.library.jobTypes.length + " predrafted scopes ready in the toolbox"
      : "⚠️ scope-library.json not loaded yet — the toolbox will be empty";
    h.innerHTML =
      '<div class="viewhead"><h1>📋 Scope of Work <span class="muted" style="font-weight:700;font-size:0.85rem">— one uniform Joon document for every client</span></h1></div>' +
      (attach ? '<div class="sw-banner">🎨 A designer-approved concept ("' + APP.esc(attach.title || "Design concept") + '") is ready to attach — open a Scope of Work below or start a new one and it attaches automatically.</div>' : "") +
      '<div style="display:flex;gap:0.6rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap">' +
        '<button class="btn primary" id="swNew" type="button">➕ New Scope of Work</button>' +
        '<span class="muted" style="font-size:0.78rem">' + APP.esc(libNote) + '</span>' +
      '</div>' +
      (rows || '<div class="empty">No Scope of Work documents yet. Start one, add predrafted scopes from the toolbox, attach approved design concepts, and print the formal document.</div>');
    document.getElementById("swNew").onclick = function () { openEditor(null); };
    h.onclick = function (e) {
      var row = e.target.closest(".sw-row");
      if (row) openEditorById(row.getAttribute("data-id"));
    };
    h.onkeydown = function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target.closest(".sw-row");
      if (row) { e.preventDefault(); openEditorById(row.getAttribute("data-id")); }
    };
  }

  function blankDoc() {
    var defaults = (st.library && st.library.defaults) || {};
    return {
      clientName: "", clientAddress: "", clientPhone: "", clientEmail: "",
      projectAddress: "", projectName: "",
      intro: defaults.intro || "",
      sections: [], renders: [], allowances: [],
      priceTotal: 0, priceNote: "",
      paymentSchedule: (defaults.paymentSchedule || []).map(function (r) { return { stage: r.stage, pct: r.pct, note: r.note }; }),
      startDate: "", durationText: "", status: "draft"
    };
  }

  function openEditorById(id) {
    APP.fetchJSON("/api/sow/" + encodeURIComponent(id)).then(function (doc) {
      openEditor(doc);
    }).catch(function (e) { APP.toast("Couldn't open: " + e.message); });
  }

  /* ============================ EDIT MODE ============================ */

  function openEditor(doc) {
    st.mode = "edit";
    st.doc = doc ? doc : blankDoc();
    st.docId = doc ? doc.id : null;
    // Auto-attach a concept handed over from the Design pages.
    var attach = pendingAttach();
    if (attach && attach.afterUrl) {
      var exists = (st.doc.renders || []).some(function (r) { return r.renderId === attach.renderId; });
      // Attaching into an EXISTING client's doc is confirmed first — an
      // inattentive save must not put a concept in the wrong client's document.
      var ok = !st.docId || window.confirm('Attach concept "' + (attach.title || "Design concept") + '" to ' + (st.doc.docNumber || "this document") + (st.doc.clientName ? " (" + st.doc.clientName + ")" : "") + "?");
      if (!exists && ok) {
        st.doc.renders = (st.doc.renders || []).concat([attach]);
        APP.toast('Concept "' + (attach.title || "Design concept") + '" attached');
      }
      if (ok || exists) { try { localStorage.removeItem("sowAttachRender"); } catch (e) {} }
    }
    renderEditor();
  }

  function linesToList(value) {
    return String(value || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function sectionHtml(section, index) {
    var joined = function (arr) { return (arr || []).join("\n"); };
    return '<div class="sw-sec' + (index === st.doc.sections.length - 1 ? " open" : "") + '" data-i="' + index + '">' +
      '<div class="sw-sec-head">' +
        '<span class="chev">▸</span><b>' + APP.esc(section.name || "Untitled scope") + '</b>' +
        '<span class="mut">' + (section.steps || []).length + ' steps' + (section.price ? " · " + money(section.price) : "") + '</span>' +
        '<button class="mv" data-act="up" title="Move up" type="button">↑</button>' +
        '<button class="mv" data-act="down" title="Move down" type="button">↓</button>' +
        '<button class="x" data-act="del" title="Remove section" type="button">✕</button>' +
      '</div>' +
      '<div class="sw-sec-body">' +
        '<span class="sw-k">Section name</span><input class="sw-in f-name" value="' + APP.esc(section.name || "") + '" />' +
        '<span class="sw-k">Summary (one client-friendly sentence)</span><input class="sw-in f-summary" value="' + APP.esc(section.summary || "") + '" />' +
        '<span class="sw-k">Scope steps — one per line, in build order</span>' +
        '<textarea class="f-steps" rows="8">' + APP.esc(joined(section.steps)) + '</textarea>' +
        '<div class="sw-2col">' +
          '<div><span class="sw-k">Included</span><textarea class="f-inclusions" rows="4">' + APP.esc(joined(section.inclusions)) + '</textarea></div>' +
          '<div><span class="sw-k">Not included</span><textarea class="f-exclusions" rows="4">' + APP.esc(joined(section.exclusions)) + '</textarea></div>' +
        '</div>' +
        '<div class="sw-2col">' +
          '<div><span class="sw-k">Client selections</span><textarea class="f-selections" rows="3">' + APP.esc(joined(section.selections)) + '</textarea></div>' +
          '<div><span class="sw-k">Inspections</span><textarea class="f-inspections" rows="3">' + APP.esc(joined(section.inspections)) + '</textarea></div>' +
        '</div>' +
        '<span class="sw-k">Notes (conditions, protective clauses)</span><textarea class="f-notes" rows="3">' + APP.esc(joined(section.notes)) + '</textarea>' +
        '<span class="sw-k">Section price (optional — leave 0 to price the job as one total)</span>' +
        '<input class="sw-in f-price" type="number" min="0" step="100" value="' + (section.price || 0) + '" />' +
      '</div>' +
    '</div>';
  }

  function conceptHtml(ref, index) {
    var range = ref.priceLow || ref.priceHigh ? " · " + money(ref.priceLow) + "–" + money(ref.priceHigh) : "";
    return '<div class="sw-con" data-i="' + index + '">' +
      '<img src="' + APP.esc(ref.afterUrl) + '" alt="" loading="lazy" />' +
      '<div class="tx"><b>' + APP.esc(ref.title || "Design concept") + '</b>' +
        '<span>' + APP.esc(ref.style || "") + range + '</span></div>' +
      '<button class="x" type="button" title="Detach">✕</button>' +
    '</div>';
  }

  function payRowHtml(row, index) {
    return '<div class="sw-pay" data-i="' + index + '">' +
      '<input class="sw-in p-stage" value="' + APP.esc(row.stage || "") + '" placeholder="Stage" />' +
      '<input class="sw-in p-note" value="' + APP.esc(row.note || "") + '" placeholder="Due when" />' +
      '<input class="sw-in p-pct" type="number" min="0" max="100" step="1" value="' + (row.pct || 0) + '" />' +
      '<button class="x" type="button" title="Remove">✕</button>' +
    '</div>';
  }

  function allowRowHtml(row, index) {
    return '<div class="sw-allow" data-i="' + index + '">' +
      '<input class="sw-in a-item" value="' + APP.esc(row.item || "") + '" placeholder="Item — e.g. Tile material" />' +
      '<input class="sw-in a-note" value="' + APP.esc(row.note || "") + '" placeholder="Note — e.g. client selects, $6/sq ft allowance" />' +
      '<input class="sw-in a-amount" type="number" min="0" step="50" value="' + (row.amount || 0) + '" />' +
      '<button class="x" type="button" title="Remove">✕</button>' +
    '</div>';
  }

  function toolboxHtml() {
    var lib = st.library;
    if (!lib || !Array.isArray(lib.jobTypes) || !lib.jobTypes.length) {
      return '<div class="sw-card" id="swTools"><h2>🧰 Toolbox</h2><div class="empty">scope-library.json isn\'t available — predrafted scopes will appear here once it\'s generated.</div></div>';
    }
    var filter = st.libFilter.toLowerCase();
    var items = lib.jobTypes.filter(function (jt) {
      if (!filter) return true;
      return (jt.name + " " + (jt.aliases || []).join(" ") + " " + jt.category).toLowerCase().indexOf(filter) >= 0;
    });
    var approvedPick = st.approved.length
      ? '<span class="sw-k" style="margin-top:1rem">Attach an approved design concept</span>' +
        '<select id="swConceptPick"><option value="">Choose a concept…</option>' +
          st.approved.map(function (r, i) {
            return '<option value="' + i + '">' + APP.esc((r.title || "Design concept") + (r.projectName ? " — " + r.projectName : "")) + '</option>';
          }).join("") +
        '</select>'
      : '<div class="sw-hint" style="margin-top:1rem">No approved renders yet — approve concepts in 🎨 Design → Designer review and they become attachable here.</div>';
    return '<div class="sw-card" id="swTools">' +
      '<h2>🧰 Toolbox — predrafted scopes</h2>' +
      '<div class="sw-hint">Click a job type to drop its full predrafted scope into the document, then tune the language per project.</div>' +
      '<input class="sw-in" id="swLibSearch" placeholder="Search ' + items.length + ' job types…" value="' + APP.esc(st.libFilter) + '" style="margin-top:0.5rem" />' +
      '<div class="sw-tool-list">' +
        items.map(function (jt) {
          return '<button class="sw-tool" type="button" data-jt="' + APP.esc(jt.id) + '">' +
            '<span class="plus">+</span><b>' + APP.esc(jt.name) + '</b>' +
            '<span class="cat">' + APP.esc(jt.category || "") + '</span>' +
          '</button>';
        }).join("") +
      '</div>' +
      approvedPick +
    '</div>';
  }

  function renderEditor() {
    var h = host();
    var doc = st.doc;
    var sectionSum = doc.sections.reduce(function (sum, s) { return sum + (Number(s.price) || 0); }, 0);
    var pctSum = doc.paymentSchedule.reduce(function (sum, r) { return sum + (Number(r.pct) || 0); }, 0);
    h.innerHTML =
      '<div class="viewhead"><h1>📋 ' + APP.esc(doc.docNumber || "New Scope of Work") +
        ' <span class="muted" style="font-weight:700;font-size:0.85rem">' + APP.esc(doc.clientName || "") + '</span></h1></div>' +
      '<div style="margin-bottom:0.8rem"><button class="btn" id="swBack" type="button">← All documents</button></div>' +
      '<div id="swGrid">' +
      '<div>' +
        '<div class="sw-card"><h2>Client &amp; project</h2>' +
          '<div class="sw-2col">' +
            '<div><span class="sw-k">Client name(s)</span><input class="sw-in" id="swClientName" value="' + APP.esc(doc.clientName) + '" /></div>' +
            '<div><span class="sw-k">Client phone</span><input class="sw-in" id="swClientPhone" value="' + APP.esc(doc.clientPhone) + '" /></div>' +
            '<div><span class="sw-k">Client email</span><input class="sw-in" id="swClientEmail" value="' + APP.esc(doc.clientEmail) + '" /></div>' +
            '<div><span class="sw-k">Client address</span><input class="sw-in" id="swClientAddress" value="' + APP.esc(doc.clientAddress) + '" /></div>' +
            '<div><span class="sw-k">Project address (if different)</span><input class="sw-in" id="swProjectAddress" value="' + APP.esc(doc.projectAddress) + '" /></div>' +
            '<div><span class="sw-k">Project name — e.g. "Bathroom Remodel"</span><input class="sw-in" id="swProjectName" value="' + APP.esc(doc.projectName) + '" /></div>' +
            '<div><span class="sw-k">Estimated start</span><input class="sw-in" id="swStartDate" placeholder="e.g. Aug 15, 2026" value="' + APP.esc(doc.startDate) + '" /></div>' +
            '<div><span class="sw-k">Estimated duration</span><input class="sw-in" id="swDuration" placeholder="e.g. 3–4 weeks" value="' + APP.esc(doc.durationText) + '" /></div>' +
          '</div>' +
          '<span class="sw-k">Intro paragraph</span><textarea id="swIntro" rows="3">' + APP.esc(doc.intro) + '</textarea>' +
          '<span class="sw-k">Status</span><select id="swStatus">' +
            ["draft", "sent", "signed"].map(function (s) { return '<option value="' + s + '"' + (doc.status === s ? " selected" : "") + '>' + s + '</option>'; }).join("") +
          '</select>' +
        '</div>' +
        '<div class="sw-card"><h2>Scope sections <span class="muted" style="font-size:0.75rem;font-weight:600">— added from the toolbox, then tuned per project</span></h2>' +
          '<div id="swSections">' + (doc.sections.length ? doc.sections.map(sectionHtml).join("") : '<div class="empty">No sections yet — add job types from the toolbox on the right.</div>') + '</div>' +
        '</div>' +
        '<div class="sw-card"><h2>Design concepts</h2>' +
          '<div class="sw-hint" style="margin-bottom:0.5rem">Only designer-approved AI concepts can be attached. The printed document carries the AI-visualization disclaimer automatically.</div>' +
          '<div id="swConcepts">' + (doc.renders.length ? doc.renders.map(conceptHtml).join("") : '<div class="sw-hint">None attached.</div>') + '</div>' +
        '</div>' +
        '<div class="sw-card"><h2>Allowances &amp; client-supplied items</h2>' +
          '<div id="swAllowances">' + doc.allowances.map(allowRowHtml).join("") + '</div>' +
          '<button class="btn" id="swAddAllow" type="button">➕ Add allowance</button>' +
        '</div>' +
        '<div class="sw-card"><h2>Price &amp; payment schedule</h2>' +
          '<div class="sw-2col">' +
            '<div><span class="sw-k">Total contract price ($)</span><input class="sw-in" id="swPriceTotal" type="number" min="0" step="100" value="' + (doc.priceTotal || 0) + '" />' +
              (sectionSum ? '<div class="sw-total">Section prices sum to <b>' + money(sectionSum) + '</b>' + (doc.priceTotal && Math.abs(sectionSum - doc.priceTotal) > 0.01 ? ' <span class="sw-warn">≠ stated total</span>' : "") + '</div>' : "") + '</div>' +
            '<div><span class="sw-k">Price note</span><input class="sw-in" id="swPriceNote" placeholder="e.g. Firm price for the scope above" value="' + APP.esc(doc.priceNote) + '" /></div>' +
          '</div>' +
          '<span class="sw-k" style="margin-top:0.8rem">Payment stages (CSLB rule: deposit ≤ 10% or $1,000; stages must total 100%)</span>' +
          '<div id="swPay">' + doc.paymentSchedule.map(payRowHtml).join("") + '</div>' +
          '<button class="btn" id="swAddPay" type="button">➕ Add stage</button>' +
          '<div class="sw-total">Stages total <b id="swPctSum">' + pctSum + '%</b>' + (Math.abs(pctSum - 100) > 0.01 ? ' <span class="sw-warn">must equal 100%</span>' : " ✓") + '</div>' +
        '</div>' +
        '<div id="swBar">' +
          '<button class="btn primary" id="swSave" type="button">💾 Save</button>' +
          '<button class="btn" id="swOpenDoc" type="button"' + (st.docId ? "" : " disabled") + '>🖨️ Open formal document</button>' +
          '<span class="note" id="swMsg">' + (st.docId ? "" : "Save once to enable the printable document.") + '</span>' +
        '</div>' +
      '</div>' +
      toolboxHtml() +
      '</div>';
    wireEditor();
  }

  /* ── editor wiring ── */

  function readSectionFromDom(el) {
    var val = function (cls) { var n = el.querySelector("." + cls); return n ? n.value : ""; };
    return {
      jobTypeId: st.doc.sections[Number(el.getAttribute("data-i"))] ? st.doc.sections[Number(el.getAttribute("data-i"))].jobTypeId : "",
      name: val("f-name"),
      summary: val("f-summary"),
      steps: linesToList(val("f-steps")),
      inclusions: linesToList(val("f-inclusions")),
      exclusions: linesToList(val("f-exclusions")),
      selections: linesToList(val("f-selections")),
      inspections: linesToList(val("f-inspections")),
      notes: linesToList(val("f-notes")),
      price: Number(val("f-price")) || 0
    };
  }

  // Pull every field back into st.doc (DOM is the working truth while editing).
  function syncDocFromDom() {
    var byId = function (id) { var n = document.getElementById(id); return n ? n.value : ""; };
    var doc = st.doc;
    doc.clientName = byId("swClientName");
    doc.clientPhone = byId("swClientPhone");
    doc.clientEmail = byId("swClientEmail");
    doc.clientAddress = byId("swClientAddress");
    doc.projectAddress = byId("swProjectAddress");
    doc.projectName = byId("swProjectName");
    doc.startDate = byId("swStartDate");
    doc.durationText = byId("swDuration");
    doc.intro = byId("swIntro");
    doc.status = byId("swStatus");
    doc.priceTotal = Number(byId("swPriceTotal")) || 0;
    doc.priceNote = byId("swPriceNote");
    doc.sections = Array.prototype.map.call(document.querySelectorAll("#swSections .sw-sec"), readSectionFromDom);
    doc.allowances = Array.prototype.map.call(document.querySelectorAll("#swAllowances .sw-allow"), function (el) {
      return {
        item: (el.querySelector(".a-item") || {}).value || "",
        note: (el.querySelector(".a-note") || {}).value || "",
        amount: Number((el.querySelector(".a-amount") || {}).value) || 0
      };
    }).filter(function (r) { return r.item; });
    doc.paymentSchedule = Array.prototype.map.call(document.querySelectorAll("#swPay .sw-pay"), function (el) {
      return {
        stage: (el.querySelector(".p-stage") || {}).value || "",
        note: (el.querySelector(".p-note") || {}).value || "",
        pct: Number((el.querySelector(".p-pct") || {}).value) || 0
      };
    }).filter(function (r) { return r.stage; });
  }

  function addSectionFromLibrary(jobTypeId) {
    var jt = (st.library.jobTypes || []).filter(function (x) { return x.id === jobTypeId; })[0];
    if (!jt) return;
    syncDocFromDom();
    st.doc.sections.push({
      jobTypeId: jt.id,
      name: jt.name,
      summary: jt.summary || "",
      steps: (jt.steps || []).slice(),
      inclusions: (jt.inclusions || []).slice(),
      exclusions: (jt.exclusions || []).slice(),
      selections: (jt.selections || []).slice(),
      inspections: (jt.inspections || []).slice(),
      notes: (jt.notes || []).slice(),
      price: 0
    });
    renderEditor();
    APP.toast(jt.name + " scope added — tune the language for this project");
  }

  function wireEditor() {
    document.getElementById("swBack").onclick = function () {
      loadAll();
    };
    document.getElementById("swSave").onclick = saveDoc;
    document.getElementById("swOpenDoc").onclick = function () {
      if (st.docId) window.open("/api/sow/" + encodeURIComponent(st.docId) + "/doc", "_blank");
    };
    document.getElementById("swAddPay").onclick = function () {
      syncDocFromDom();
      st.doc.paymentSchedule.push({ stage: "", note: "", pct: 0 });
      renderEditor();
    };
    document.getElementById("swAddAllow").onclick = function () {
      syncDocFromDom();
      st.doc.allowances.push({ item: "", note: "", amount: 0 });
      renderEditor();
    };
    var search = document.getElementById("swLibSearch");
    if (search) search.oninput = function () {
      st.libFilter = search.value;
      syncDocFromDom();
      var tools = document.getElementById("swTools");
      if (tools) {
        tools.outerHTML = toolboxHtml();
        wireToolbox();
        var s2 = document.getElementById("swLibSearch");
        if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); s2.oninput = search.oninput; }
      }
    };
    wireToolbox();

    // Section head interactions (collapse, move, delete) + row deletes.
    var sections = document.getElementById("swSections");
    if (sections) sections.onclick = function (e) {
      var head = e.target.closest(".sw-sec-head");
      if (!head) return;
      var sec = head.closest(".sw-sec");
      var idx = Number(sec.getAttribute("data-i"));
      var act = e.target.closest("[data-act]");
      if (act) {
        syncDocFromDom();
        var arr = st.doc.sections;
        if (act.getAttribute("data-act") === "del") {
          if (!window.confirm("Remove this scope section?")) return;
          arr.splice(idx, 1);
        } else if (act.getAttribute("data-act") === "up" && idx > 0) {
          arr.splice(idx - 1, 0, arr.splice(idx, 1)[0]);
        } else if (act.getAttribute("data-act") === "down" && idx < arr.length - 1) {
          arr.splice(idx + 1, 0, arr.splice(idx, 1)[0]);
        }
        renderEditor();
        return;
      }
      sec.classList.toggle("open");
      head.querySelector(".chev").textContent = sec.classList.contains("open") ? "▾" : "▸";
    };
    var concepts = document.getElementById("swConcepts");
    if (concepts) concepts.onclick = function (e) {
      var x = e.target.closest(".x");
      if (!x) return;
      var con = x.closest(".sw-con");
      syncDocFromDom();
      st.doc.renders.splice(Number(con.getAttribute("data-i")), 1);
      renderEditor();
    };
    ["swPay", "swAllowances"].forEach(function (id) {
      var wrap = document.getElementById(id);
      if (wrap) wrap.onclick = function (e) {
        var x = e.target.closest(".x");
        if (!x) return;
        syncDocFromDom();
        var row = x.closest("[data-i]");
        var idx = Number(row.getAttribute("data-i"));
        if (id === "swPay") st.doc.paymentSchedule.splice(idx, 1);
        else st.doc.allowances.splice(idx, 1);
        renderEditor();
      };
    });
  }

  function wireToolbox() {
    var tools = document.getElementById("swTools");
    if (!tools) return;
    tools.onclick = function (e) {
      var t = e.target.closest(".sw-tool");
      if (t) addSectionFromLibrary(t.getAttribute("data-jt"));
    };
    var pick = document.getElementById("swConceptPick");
    if (pick) pick.onchange = function () {
      var r = st.approved[Number(pick.value)];
      if (!r) return;
      syncDocFromDom();
      var exists = st.doc.renders.some(function (x) { return x.renderId === r.id; });
      if (exists) { APP.toast("That concept is already attached"); pick.value = ""; return; }
      st.doc.renders.push({
        renderId: r.id, title: r.title, style: r.style,
        beforeUrl: r.beforeUrl, afterUrl: r.afterUrl,
        feasibility: (r.review && r.review.feasibility) || "",
        priceLow: (r.review && r.review.priceLow) || 0,
        priceHigh: (r.review && r.review.priceHigh) || 0
      });
      renderEditor();
    };
  }

  function saveDoc() {
    syncDocFromDom();
    var msg = document.getElementById("swMsg");
    var btn = document.getElementById("swSave");
    btn.disabled = true;
    msg.textContent = "Saving…";
    var req = st.docId
      ? APP.fetchJSON("/api/sow/" + encodeURIComponent(st.docId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st.doc) })
      : APP.fetchJSON("/api/sow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st.doc) });
    req.then(function (saved) {
      st.docId = saved.id || st.docId;
      st.doc.docNumber = saved.docNumber || st.doc.docNumber;
      // The server verifies render refs against approved designRenders and may
      // drop stale ones — mirror its answer so the editor never shows a
      // concept that is no longer on the document.
      var dropped = 0;
      if (Array.isArray(saved.renders)) {
        dropped = st.doc.renders.length - saved.renders.length;
        st.doc.renders = saved.renders;
      }
      if (dropped > 0) {
        renderEditor();
        APP.toast(dropped + " concept" + (dropped === 1 ? "" : "s") + " removed — no longer designer-approved");
        var msg2 = document.getElementById("swMsg");
        if (msg2) msg2.textContent = "Saved " + (st.doc.docNumber || "") + " ✓";
        return;
      }
      btn.disabled = false;
      msg.textContent = "Saved " + (st.doc.docNumber || "") + " ✓";
      var open = document.getElementById("swOpenDoc");
      if (open) open.disabled = false;
    }).catch(function (e) {
      btn.disabled = false;
      msg.textContent = "Save failed: " + e.message;
    });
  }

  APP.registerView("sow", { title: "Scope of Work", render: render });
})();
