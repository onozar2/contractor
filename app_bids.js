/* app_bids.js — Bids: a clean Word-style PROPOSAL document, not a contract.
   Registers the "bids" view on the APP shell (app.html).

   Ori's spec (verbatim spirit): the old bid-template.html was "too
   complicated... all these buttons... not supposed to be the contract yet."
   This view is deliberately spare: a list of saved proposals on the left, a
   minimal "describe the job" card to start a new one, and — the whole point
   — a document that looks like a real Word proposal: letterhead, About Us
   bio, a quiet reviews strip, trade-by-trade scope lines, a total price
   line, and a short general-provisions list. The entire document is
   contenteditable. Three quiet toolbar buttons: Save, Print, New. */
(function () {
  "use strict";
  if (!window.APP) { console.error("app_bids.js: APP shell not found"); return; }

  var API = "/api/bids";
  var esc = APP.esc;

  var CSS_ID = "bidsCss";
  var CSS =
    /* ---- shell: side list + main pane ---- */
    ".bidsShell{display:grid;grid-template-columns:280px 1fr;gap:1.1rem;align-items:start}" +
    "@media (max-width:900px){.bidsShell{grid-template-columns:1fr}}" +
    ".bidsSideList{display:grid;gap:0.5rem;margin-top:0.7rem}" +
    ".bidRow{display:block;width:100%;text-align:left;background:#fff;border:1px solid var(--line);border-radius:10px;" +
      "padding:0.55rem 0.7rem;cursor:pointer;font:inherit;color:inherit;position:relative}" +
    ".bidRow:hover{border-color:#c4cbd6;background:#f9fafb}" +
    ".bidRow.active{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue) inset}" +
    ".bidRow b{display:block;font-size:0.84rem;margin-bottom:0.12rem}" +
    ".bidRow .bidRowMeta{font-size:0.72rem;color:var(--muted)}" +
    ".bidRowDel{position:absolute;top:0.4rem;right:0.5rem;border:0;background:none;color:var(--muted);" +
      "font-size:0.76rem;cursor:pointer;padding:0.1rem 0.3rem;border-radius:5px;opacity:0.55}" +
    ".bidRowDel:hover{opacity:1;color:var(--red);background:#fdecea}" +
    /* ---- toolbar ---- */
    ".bidsToolbar{display:flex;gap:0.5rem;align-items:center;margin-bottom:0.7rem}" +
    ".bidsToolbar .footline{margin-left:0.2rem}" +
    /* ---- the document ---- */
    ".bidPageWrap{overflow-x:auto;padding-bottom:1rem}" +
    ".bidPage{font-family:Georgia,Cambria,'Times New Roman',Times,serif;color:#171308;background:#fff;" +
      "width:100%;max-width:8.5in;min-height:11in;margin:0 auto;padding:1in;" +
      "border:1px solid var(--line);box-shadow:0 10px 30px rgba(16,24,40,0.12);outline:none}" +
    "@media (max-width:900px){.bidPage{padding:1.3rem;min-height:0}}" +
    ".bidPage h1,.bidPage h2,.bidPage h3{font-family:inherit}" +
    ".bidLetterhead{border-bottom:2px solid #171308;padding-bottom:0.6rem;margin-bottom:1.1rem;" +
      "display:flex;justify-content:space-between;align-items:flex-end;gap:0.6rem;flex-wrap:wrap}" +
    ".bidCompanyName{font-size:1.28rem;font-weight:700;letter-spacing:0.01em}" +
    ".bidCompanyMeta{font-size:0.78rem;color:#4a4436;margin-top:0.2rem;line-height:1.5}" +
    ".bidMetaBlock{display:flex;justify-content:space-between;gap:1rem;margin-bottom:1.4rem;font-size:0.86rem;flex-wrap:wrap}" +
    ".bidMetaBlock .bidClientBlock{text-align:right}" +
    ".bidMetaLabel{font-size:0.64rem;text-transform:uppercase;letter-spacing:0.07em;color:#8a8272;display:block;margin-bottom:0.15rem}" +
    ".bidTitle{text-align:center;font-size:1.15rem;letter-spacing:0.16em;font-weight:700;margin:0.6rem 0 0.3rem}" +
    ".bidProjectLine{text-align:center;font-size:0.9rem;color:#4a4436;margin-bottom:1.3rem}" +
    ".bidAbout{margin-bottom:1.2rem}" +
    ".bidAbout h2{font-size:0.76rem;text-transform:uppercase;letter-spacing:0.08em;color:#8a8272;margin-bottom:0.4rem;font-weight:700}" +
    ".bidAbout p{font-size:0.86rem;line-height:1.6;text-align:justify}" +
    ".bidReviews{background:#faf8f3;border:1px solid #ece6d8;border-radius:6px;padding:0.7rem 0.9rem;margin-bottom:1.3rem}" +
    ".bidReviews h3{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:#8a8272;margin-bottom:0.55rem;font-weight:700}" +
    ".bidReviewRow{display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem}" +
    "@media (max-width:640px){.bidReviewRow{grid-template-columns:1fr}}" +
    ".bidReview p{font-size:0.78rem;font-style:italic;color:#514b3c;margin-bottom:0.25rem;line-height:1.45}" +
    ".bidReviewer{font-size:0.7rem;color:#8a8272}" +
    ".bidScope{margin-top:0.4rem}" +
    ".bidTrade{margin-bottom:0.9rem}" +
    ".bidTradeHeading{font-weight:700;text-decoration:underline;font-size:0.94rem;margin-bottom:0.3rem}" +
    /* Plain numbered divs, not <ol>/<li> — deliberately: browsers auto-merge
       or unwrap <li> elements when a selection/edit touches the last item in
       a list inside a flowing contenteditable region (verified: triple-
       clicking the last line of a scope section could delete the whole
       <ol> and orphan its text into the next block). Divs have no such
       special-cased list-editing behavior, so they're the safe choice for
       a "click anywhere and type" document. */
    ".bidLines{margin:0 0 0 0.1rem}" +
    ".bidLine{font-size:0.86rem;line-height:1.55;margin:0.12rem 0;padding-left:1.15rem;text-indent:-1.15rem}" +
    ".bidLineSmall{font-size:0.76rem;line-height:1.55;color:#514b3c;padding-left:1.05rem;text-indent:-1.05rem;margin:0.1rem 0}" +
    ".bidTotal{margin-top:1.6rem;padding-top:0.8rem;border-top:1px solid #ddd6c4;font-size:1rem;font-weight:700;text-align:right}" +
    ".bidProvisions{margin-top:1.5rem;border-top:1px solid #ddd6c4;padding-top:0.8rem}" +
    ".bidProvisions h3{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#8a8272;margin-bottom:0.4rem;font-weight:700}" +
    /* ---- print: only the document, nothing else ---- */
    "@media print{" +
      "body *{visibility:hidden}" +
      "#bidPrintArea,#bidPrintArea *{visibility:visible}" +
      "#bidPrintArea{position:absolute;top:0;left:0;width:100%;margin:0;padding:1in;border:none;box-shadow:none;max-width:none}" +
      "@page{size:letter;margin:0}" +
    "}";

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var styleEl = document.createElement("style");
    styleEl.id = CSS_ID;
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  function loadingEl(label) { return APP.el('<div class="loading">' + esc(label || "Loading") + "</div>"); }

  function errorEl(message, retry) {
    var node = APP.el('<div class="empty"><b>Couldn’t load</b>' + esc(message || "Unknown error") +
      '<div style="margin-top:0.7rem"><button class="btn" type="button">Retry</button></div></div>');
    node.querySelector("button").addEventListener("click", retry);
    return node;
  }

  // ── shared caches ──
  var brandPromise = null;
  function getBrand() {
    if (!brandPromise) {
      brandPromise = APP.fetchJSON(API + "/brand").catch(function (err) {
        brandPromise = null;
        throw err;
      });
    }
    return brandPromise;
  }

  // Dates are stored and displayed as pretty local strings ("July 14, 2026") —
  // no ISO round-trips: new Date("YYYY-MM-DD") parses as UTC midnight and
  // renders off-by-one in local time (the review caught exactly that).
  function today() {
    return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  function prettyDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return today();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return new Date(+iso[1], +iso[2] - 1, +iso[3])
        .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
    return raw; // already pretty or user-edited text — show as written
  }

  /* ════════════════════ DOCUMENT BUILDING ════════════════════ */

  function reviewsHtml(reviews) {
    // Placeholder quotes ("[Add a customer review here]") must never print on a
    // real client document — render only filled-in reviews, or nothing at all.
    return (reviews || []).filter(function (r) {
      return r && r.quote && !/\[/.test(String(r.quote)) && !/\[/.test(String(r.name || ""));
    }).map(function (r) {
      return '<div class="bidReview"><p>“' + esc(r.quote) + '”</p><div class="bidReviewer">' +
        esc(r.name) + (r.project ? " — " + esc(r.project) : "") + "</div></div>";
    }).join("");
  }

  function sectionsHtml(sections) {
    return (sections || []).map(function (section) {
      if (!section.lines || !section.lines.length) return "";
      return '<div class="bidTrade"><div class="bidTradeHeading">' + esc(section.trade || "Scope") + '</div><div class="bidLines">' +
        section.lines.map(function (line, i) { return '<div class="bidLine">' + (i + 1) + ". " + esc(line) + "</div>"; }).join("") +
        "</div></div>";
    }).join("");
  }

  // Builds the full contenteditable document markup from structured data +
  // the brand pack. data-field="…" tags mark the spots read back on Save.
  function buildDocumentHtml(data, brand) {
    return (
      '<div class="bidLetterhead">' +
        '<div><div class="bidCompanyName">' + esc(brand.companyName || "Joon Development Group") + '</div>' +
        '<div class="bidCompanyMeta">' + esc(brand.licenseText || "") + "</div></div>" +
        '<div class="bidCompanyMeta" style="text-align:right">' + esc(brand.phone || "") +
          (brand.email ? "<br />" + esc(brand.email) : "") + "</div>" +
      "</div>" +
      '<div class="bidMetaBlock">' +
        '<div><span class="bidMetaLabel">Date</span><span data-field="date">' + esc(prettyDate(data.date)) + "</span></div>" +
        '<div class="bidClientBlock"><span class="bidMetaLabel">Prepared for</span>' +
          '<div data-field="clientName">' + esc(data.clientName || "") + "</div>" +
          '<div data-field="address">' + esc(data.address || "") + "</div></div>" +
      "</div>" +
      '<div class="bidTitle">PROPOSAL</div>' +
      '<div class="bidProjectLine">Project: <span data-field="projectTitle">' + esc(data.title || "") + "</span></div>" +
      '<div class="bidAbout"><h2>About ' + esc((brand.companyName || "Joon").split(" ")[0]) + '</h2><p>' + esc(brand.bio || "") + "</p></div>" +
      (function () {
        const reviews = reviewsHtml(brand.reviews);
        return reviews ? '<div class="bidReviews"><h3>What our clients say</h3><div class="bidReviewRow">' + reviews + "</div></div>" : "";
      })() +
      '<div class="bidScope">' + sectionsHtml(data.sections) + "</div>" +
      '<div class="bidTotal">Total Price: $<span data-field="totalPrice">' + esc(data.totalPrice || "____") + "</span></div>" +
      '<div class="bidProvisions"><h3>General Provisions</h3><div class="bidLines">' +
        (brand.provisions || []).map(function (p, i) { return '<div class="bidLine bidLineSmall">' + (i + 1) + ". " + esc(p) + "</div>"; }).join("") +
      "</div></div>"
    );
  }

  function readField(page, name) {
    var node = page.querySelector('[data-field="' + name + '"]');
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  /* ════════════════════ MAIN RENDER ════════════════════ */

  function renderList(container, focusId) {
    injectCss();
    container.innerHTML = "";
    var head = APP.el('<div class="viewhead"><h1>Bids</h1></div>');
    container.appendChild(head);

    var shell = APP.el('<div class="bidsShell"></div>');
    container.appendChild(shell);

    var side = APP.el(
      '<div><button class="btn primary" type="button" id="bidNewBtn" style="width:100%">+ New bid</button>' +
      '<div class="bidsSideList" id="bidsSideList"></div></div>'
    );
    var main = APP.el('<div id="bidsMain"></div>');
    shell.appendChild(side);
    shell.appendChild(main);

    var sideList = side.querySelector("#bidsSideList");
    var state = { proposals: null, currentId: null };

    function money(v) {
      var s = String(v || "").replace(/[^0-9.]/g, "");
      if (!s) return "$____";
      var n = Number(s);
      return isFinite(n) && n > 0 ? APP.fmtMoney(n) : "$" + esc(String(v));
    }

    function drawSideList() {
      sideList.innerHTML = "";
      if (!state.proposals || !state.proposals.length) {
        sideList.appendChild(APP.el('<div class="footline" style="padding:0.3rem">No saved bids yet.</div>'));
        return;
      }
      state.proposals.forEach(function (p) {
        var row = APP.el(
          '<div class="bidRow' + (p.id === state.currentId ? " active" : "") + '" data-id="' + esc(p.id) + '">' +
            '<button class="bidRowDel" type="button" title="Delete">✕</button>' +
            "<b>" + esc(p.title || "(untitled)") + "</b>" +
            '<div class="bidRowMeta">' + esc(p.clientName || "no client") + " · " + esc(prettyDate(p.date)) + " · " + money(p.totalPrice) + "</div>" +
          "</div>"
        );
        row.addEventListener("click", function (e) {
          if (e.target.closest(".bidRowDel")) return;
          openProposal(p.id);
        });
        row.querySelector(".bidRowDel").addEventListener("click", function (e) {
          e.stopPropagation();
          if (!window.confirm('Delete "' + (p.title || "this bid") + '"? This can’t be undone.')) return;
          APP.fetchJSON(API + "/" + encodeURIComponent(p.id), { method: "DELETE" }).then(function () {
            state.proposals = state.proposals.filter(function (row2) { return row2.id !== p.id; });
            if (state.currentId === p.id) { state.currentId = null; drawEmptyMain(); }
            drawSideList();
            APP.toast("Bid deleted");
          }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
        });
        sideList.appendChild(row);
      });
    }

    function loadList(after) {
      APP.fetchJSON(API).then(function (rows) {
        state.proposals = rows || [];
        drawSideList();
        if (after) after();
      }).catch(function (err) {
        sideList.innerHTML = "";
        sideList.appendChild(errorEl(err.message, function () { loadList(after); }));
      });
    }

    function drawEmptyMain() {
      main.innerHTML = "";
      main.appendChild(APP.el(
        '<div class="empty"><b>No bid open</b>Pick a saved bid on the left, or start a new one.</div>'
      ));
    }

    function drawNewBidForm() {
      state.currentId = null;
      drawSideList();
      main.innerHTML = "";
      var card = APP.el(
        '<div class="card" style="max-width:640px">' +
          "<h2>New bid</h2>" +
          '<div style="display:grid;gap:0.6rem">' +
            '<label><span style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587;display:block;margin-bottom:0.2rem">Client name</span>' +
              '<input id="bfClient" type="text" style="width:100%;min-height:36px;border:1px solid #d8dee8;border-radius:7px;padding:0.3rem 0.6rem;font:inherit" /></label>' +
            '<label><span style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587;display:block;margin-bottom:0.2rem">Address</span>' +
              '<input id="bfAddress" type="text" style="width:100%;min-height:36px;border:1px solid #d8dee8;border-radius:7px;padding:0.3rem 0.6rem;font:inherit" /></label>' +
            '<label><span style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587;display:block;margin-bottom:0.2rem">Project title</span>' +
              '<input id="bfTitle" type="text" placeholder="e.g. Hall bathroom remodel" style="width:100%;min-height:36px;border:1px solid #d8dee8;border-radius:7px;padding:0.3rem 0.6rem;font:inherit" /></label>' +
            '<label><span style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587;display:block;margin-bottom:0.2rem">Describe the job in your own words</span>' +
              '<textarea id="bfDesc" rows="4" placeholder="e.g. hall bathroom remodel, convert tub to walk-in shower, new tile floor, new vanity, repaint" ' +
                'style="width:100%;border:1px solid #d8dee8;border-radius:7px;padding:0.5rem 0.6rem;font:inherit;resize:vertical"></textarea></label>' +
            '<div><button class="btn primary" type="button" id="bfGo">Write the scope</button> <span class="footline" id="bfMsg"></span></div>' +
          "</div>" +
        "</div>"
      );
      main.appendChild(card);
      card.querySelector("#bfGo").addEventListener("click", function () {
        var clientName = card.querySelector("#bfClient").value.trim();
        var address = card.querySelector("#bfAddress").value.trim();
        var title = card.querySelector("#bfTitle").value.trim();
        var description = card.querySelector("#bfDesc").value.trim();
        var msg = card.querySelector("#bfMsg");
        if (!description) { msg.textContent = "Describe the job first."; return; }
        msg.textContent = "Writing the scope from the knowledge base…";
        card.querySelector("#bfGo").disabled = true;
        Promise.all([
          APP.fetchJSON(API + "/draft-scope", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectTitle: title, description: description })
          }),
          getBrand()
        ]).then(function (results) {
          var draft = results[0];
          var brand = results[1];
          var data = {
            title: title, clientName: clientName, address: address, date: today(),
            totalPrice: "", sections: draft.sections || []
          };
          drawDocument(data, brand, null);
          if (draft.notes && draft.notes.length) {
            APP.toast(draft.notes[0]);
          }
        }).catch(function (err) {
          msg.textContent = "Couldn’t write the scope: " + err.message;
          card.querySelector("#bfGo").disabled = false;
        });
      });
    }

    // data: {title, clientName, address, date, totalPrice, sections} — used
    // to build fresh markup. savedProposal: the full saved record if this is
    // a reopen (has html/id), or null for a brand-new unsaved document.
    function drawDocument(data, brand, savedProposal) {
      state.currentId = savedProposal ? savedProposal.id : null;
      drawSideList();
      main.innerHTML = "";

      var toolbar = APP.el(
        '<div class="bidsToolbar">' +
          '<button class="btn" type="button" id="bidSave">Save</button>' +
          '<button class="btn" type="button" id="bidPrint">Print</button>' +
          '<button class="btn" type="button" id="bidNewFromDoc">New</button>' +
          '<span class="footline" id="bidSaveMsg"></span>' +
        "</div>"
      );
      var pageWrap = APP.el('<div class="bidPageWrap"></div>');
      var page = APP.el('<div class="bidPage" id="bidPrintArea" contenteditable="true"></div>');
      page.innerHTML = (savedProposal && savedProposal.html) ? savedProposal.html : buildDocumentHtml(data, brand);
      pageWrap.appendChild(page);
      main.appendChild(toolbar);
      main.appendChild(pageWrap);

      var saveMsg = toolbar.querySelector("#bidSaveMsg");

      toolbar.querySelector("#bidPrint").addEventListener("click", function () { window.print(); });
      toolbar.querySelector("#bidNewFromDoc").addEventListener("click", drawNewBidForm);
      toolbar.querySelector("#bidSave").addEventListener("click", function () {
        var body = {
          title: readField(page, "projectTitle") || data.title,
          clientName: readField(page, "clientName") || data.clientName,
          address: readField(page, "address") || data.address,
          date: readField(page, "date") || data.date,
          totalPrice: readField(page, "totalPrice"),
          sections: data.sections,
          bioIncluded: true,
          html: page.innerHTML
        };
        if (body.totalPrice === "____") body.totalPrice = "";
        saveMsg.textContent = "Saving…";
        var req = state.currentId
          ? APP.fetchJSON(API + "/" + encodeURIComponent(state.currentId), {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
            })
          : APP.fetchJSON(API, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
            });
        req.then(function (saved) {
          state.currentId = saved.id;
          saveMsg.textContent = "Saved";
          APP.toast("Bid saved");
          loadList();
        }).catch(function (err) { saveMsg.textContent = "Save failed: " + err.message; });
      });
    }

    function openProposal(id) {
      main.innerHTML = "";
      main.appendChild(loadingEl("Opening bid"));
      Promise.all([APP.fetchJSON(API + "/" + encodeURIComponent(id)), getBrand()]).then(function (results) {
        var saved = results[0];
        var brand = results[1];
        var data = {
          title: saved.title, clientName: saved.clientName, address: saved.address,
          date: saved.date, totalPrice: saved.totalPrice, sections: saved.sections
        };
        drawDocument(data, brand, saved);
      }).catch(function (err) {
        main.innerHTML = "";
        main.appendChild(errorEl(err.message, function () { openProposal(id); }));
      });
    }

    side.querySelector("#bidNewBtn").addEventListener("click", drawNewBidForm);

    if (focusId) {
      loadList(function () { openProposal(focusId); });
    } else {
      drawEmptyMain();
      loadList();
    }
  }

  /* ════════════════════ REGISTER ════════════════════ */

  APP.registerView("bids", {
    title: "Bids",
    render: function (container, params) {
      renderList(container, params && params.id ? params.id : null);
    }
  });
})();
