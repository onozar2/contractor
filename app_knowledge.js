/* Knowledge view — ask questions against the Construction Notes corpus
   (scope-of-work PDF, client decks, trade whiteboards). Answers cite sources
   and show the related whiteboard/deck images (Drive thumbnails — they render
   because Ori is logged into Google in this browser). Also supports asking
   with a jobsite photo, and an optional "+ web" supplement in notes mode. */
(function () {
  var summaryCache = null;
  var mode = "notes"; // "notes" | "research"
  var webOn = false;  // notes-mode "+ web" toggle
  var photoPreviewUrl = null; // last object URL created for a photo preview (revoked on replace)

  var NOTES_SUGGESTIONS = [
    "Bathroom remodel scope + inspections",
    "Tear-off roof process and shingle brand",
    "Foundation bolting retrofit steps",
    "Full house rewire cost",
    "Mold remediation scope",
    "Exterior paint prep steps",
    "Driveway pavers vs cement"
  ];

  var RESEARCH_SUGGESTIONS = [
    "Which of our subs do balcony SB-326 repairs?",
    "Current price for a 200A panel upgrade in LA?",
    "Who are my top 3 electricians with owner contact info?",
    "Best way to source LVP flooring for a 2,000 sqft remodel?",
    "Should I buy shower glass from a distributor or let the glass sub supply it?"
  ];

  function engineClass(engine) {
    if (engine === "claude-haiku") return "green";
    if (engine === "error") return "red";
    return "amber";
  }

  function imgCard(image) {
    return (
      '<a class="card" style="padding:0.4rem;display:block;text-decoration:none" href="' + APP.esc(image.driveUrl) + '" target="_blank" title="Open in Drive">' +
        '<img src="' + APP.esc(image.thumbUrl) + '" alt="' + APP.esc(image.title) + '" loading="lazy" ' +
          'style="width:100%;border-radius:7px;display:block" ' +
          'onerror="this.parentElement.style.display=\'none\'" />' +
        '<div style="font-size:0.74rem;font-weight:800;color:#3c4658;padding:0.35rem 0.2rem 0.1rem">' + APP.esc(image.title) + '</div>' +
      '</a>'
    );
  }

  function sourceLine(source) {
    return (
      '<li style="font-size:0.8rem;margin:0.15rem 0">[' + source.ref + '] ' +
      (source.driveUrl
        ? '<a href="' + APP.esc(source.driveUrl) + '" target="_blank" style="font-weight:800">' + APP.esc(source.title) + '</a>'
        : APP.esc(source.title)) +
      ' <span class="pill" style="margin-left:0.3rem">' + APP.esc(source.source) + '</span></li>'
    );
  }

  function sourcesBlock(sources) {
    if (!sources || !sources.length) return "";
    var items = sources.map(sourceLine).join("");
    if (sources.length > 4) {
      return (
        '<div class="card">' +
          '<details>' +
            '<summary style="cursor:pointer;font-weight:800;font-size:0.95rem">Sources (' + sources.length + ')</summary>' +
            '<ul style="list-style:none;margin-top:0.5rem">' + items + '</ul>' +
          '</details>' +
        '</div>'
      );
    }
    return '<div class="card"><h2>Sources</h2><ul style="list-style:none">' + items + '</ul></div>';
  }

  // Research-chat meta line: engine + internal/web match counts (research-chat has
  // no source-objects array like /api/knowledge/ask — these counts are its "sources").
  function researchMetaLine(result) {
    return (
      '<div class="muted" style="font-size:0.74rem;margin-top:0.5rem">' +
        APP.esc(result.engine || "engine unknown") + " · " +
        APP.esc(String(result.internalMatches != null ? result.internalMatches : 0)) + " internal / " +
        APP.esc(String(result.webMatches != null ? result.webMatches : 0)) + " web matches" +
      "</div>"
    );
  }

  // Shared card for /api/knowledge/ask + /api/knowledge/ask-photo responses
  // ({answer, engine, sources, images}). `extraPills` and `photoHtml` let
  // callers add a "notes + web" pill or a photo preview above the answer.
  function answerHtml(result, extraPills, photoHtml) {
    var html = "";
    if (photoHtml) html += photoHtml;
    html +=
      '<div class="card" style="margin-bottom:0.9rem">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
          '<h2 style="margin:0">Answer</h2>' +
          '<div>' +
            '<span class="pill ' + engineClass(result.engine) + '">' + APP.esc(result.engine || "?") + "</span>" +
            (extraPills || "") +
          '</div>' +
        '</div>' +
        '<div style="white-space:pre-wrap;font-size:0.88rem;line-height:1.55;margin-top:0.5rem">' + APP.esc(result.answer) + "</div>" +
      "</div>";
    if (result.images && result.images.length) {
      html +=
        '<div class="card" style="margin-bottom:0.9rem"><h2>Related pictures</h2>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.6rem">' +
            result.images.map(imgCard).join("") +
          "</div>" +
          '<div class="muted" style="font-size:0.72rem;margin-top:0.4rem">Images load from your Google Drive - stay signed in to Google in this browser. Click any image to open the original.</div>' +
        "</div>";
    }
    html += sourcesBlock(result.sources);
    return html;
  }

  function photoPreviewHtml(url, caption) {
    return (
      '<div class="card" style="margin-bottom:0.9rem">' +
        '<img src="' + APP.esc(url) + '" alt="Uploaded photo" style="max-width:320px;width:100%;border-radius:8px;display:block;margin-bottom:0.5rem" />' +
        '<div class="muted" style="font-size:0.8rem">' + caption + '</div>' +
      '</div>'
    );
  }

  function render(container) {
    container.innerHTML =
      '<h1 style="margin-bottom:0.7rem">Construction Knowledge</h1>' +
      '<div class="chips" id="kMode" style="margin-bottom:0.6rem">' +
        '<span class="chip active" data-mode="notes">Construction notes</span>' +
        '<span class="chip" data-mode="research">Research (roster + web)</span>' +
      '</div>' +
      '<div class="card" style="margin-bottom:0.9rem">' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">' +
          '<input id="kQ" type="text" placeholder="Ask anything from the Construction Notes - e.g. what is the scope for a bathroom remodel?" ' +
            'style="flex:1;min-width:260px;min-height:38px;border:1px solid #d8dee8;border-radius:8px;padding:0 0.7rem;font:inherit;background:#f5f7fa" />' +
          '<span class="chip" id="kWebToggle" title="Also draw on live web search - notes stay the primary source">+ web</span>' +
          '<button class="btn" id="kPhotoBtn" type="button" title="Take or upload a jobsite photo">📷 Ask with a photo</button>' +
          '<input type="file" id="kPhotoInput" accept="image/*" capture="environment" style="display:none" />' +
          '<button class="btn primary" id="kAsk">Ask</button>' +
        '</div>' +
        '<div class="chips" id="kSuggest" style="margin-top:0.55rem"></div>' +
        '<div class="muted" id="kMeta" style="font-size:0.74rem;margin-top:0.45rem">Loading corpus info...</div>' +
      '</div>' +
      '<div id="kOut"></div>';

    var qInput = document.getElementById("kQ");
    var suggestEl = document.getElementById("kSuggest");
    var metaEl = document.getElementById("kMeta");
    var modeEl = document.getElementById("kMode");
    var webToggleEl = document.getElementById("kWebToggle");
    var photoBtn = document.getElementById("kPhotoBtn");
    var photoInput = document.getElementById("kPhotoInput");
    var out = document.getElementById("kOut");

    function paintSuggestions() {
      var suggestions = mode === "research" ? RESEARCH_SUGGESTIONS : NOTES_SUGGESTIONS;
      suggestEl.innerHTML = suggestions.map(function (s) {
        return '<span class="chip" data-q="' + APP.esc(s) + '">' + APP.esc(s) + "</span>";
      }).join("");
    }

    function paintWebToggle() {
      webToggleEl.style.display = mode === "research" ? "none" : "inline-flex";
      webToggleEl.classList.toggle("active", webOn);
    }

    function loadMeta() {
      if (mode === "research") {
        metaEl.textContent = "Answers pull your vetted sub roster + live web search, then draft a recommendation.";
        return;
      }
      metaEl.textContent = "Loading corpus info...";
      (summaryCache ? Promise.resolve(summaryCache) : APP.fetchJSON("/api/knowledge/summary").then(function (s) { summaryCache = s; return s; }))
        .then(function (summary) {
          var parts = Object.entries(summary.sources || {}).map(function (e) { return e[1] + " " + e[0].toLowerCase(); });
          metaEl.textContent =
            summary.chunks + " knowledge chunks (" + parts.join(", ") + ") + " + summary.images + " whiteboard images from the Drive “Construction notes” folder.";
        })
        .catch(function () {
          metaEl.textContent = "Corpus not ingested yet - run tmp/ingest-knowledge.mjs.";
        });
    }

    function askNotes(question) {
      out.innerHTML = '<div class="card"><div class="muted">Searching notes' + (webOn ? " and the web" : "") + ' and drafting answer…</div></div>';
      APP.fetchJSON("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, useWeb: webOn })
      }).then(function (result) {
        var extraPills = webOn ? '<span class="pill plum" style="margin-left:0.3rem">notes + web</span>' : "";
        out.innerHTML = answerHtml(result, extraPills);
      }).catch(function (error) {
        out.innerHTML = '<div class="card"><div class="empty">Ask failed: ' + APP.esc(error.message) + "</div></div>";
      });
    }

    function askResearch(question) {
      out.innerHTML = '<div class="card"><div class="muted">Researching your roster + live web…</div></div>';
      // POST /api/research-chat body {question, useWeb} -> {question, answer, engine, internalMatches, webMatches, createdAt}
      APP.fetchJSON("/api/research-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, useWeb: true })
      }).then(function (result) {
        var html =
          '<div class="card">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
              '<h2 style="margin:0">Answer</h2>' +
              '<span class="pill ' + engineClass(result.engine) + '">' + APP.esc(result.engine || "?") + "</span>" +
            '</div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;line-height:1.55;margin-top:0.5rem">' + APP.esc(result.answer || "") + "</div>" +
            researchMetaLine(result) +
          "</div>";
        out.innerHTML = html;
      }).catch(function (error) {
        out.innerHTML = '<div class="card"><div class="empty">Research failed: ' + APP.esc(error.message) + "</div></div>";
      });
    }

    function askPhoto(file, question) {
      if (photoPreviewUrl) { URL.revokeObjectURL(photoPreviewUrl); }
      photoPreviewUrl = URL.createObjectURL(file);
      out.innerHTML = photoPreviewHtml(photoPreviewUrl, "Reading your photo… this takes about 1-2 minutes.");

      var qs = "?question=" + encodeURIComponent(question || "What am I looking at and what do I need to know?");
      APP.fetchJSON("/api/knowledge/ask-photo" + qs, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file
      }).then(function (result) {
        out.innerHTML = answerHtml(result, "", photoPreviewHtml(photoPreviewUrl, "Photo you asked about"));
      }).catch(function (error) {
        out.innerHTML =
          photoPreviewHtml(photoPreviewUrl, "Photo you asked about") +
          '<div class="card"><div class="empty">Photo ask failed: ' + APP.esc(error.message) + "</div></div>";
      });
    }

    function ask(question) {
      if (!question) return;
      if (mode === "research") askResearch(question);
      else askNotes(question);
    }

    paintSuggestions();
    paintWebToggle();
    loadMeta();

    modeEl.addEventListener("click", function (event) {
      var chip = event.target.closest(".chip");
      if (!chip || !chip.dataset.mode) return;
      if (chip.dataset.mode === mode) return;
      mode = chip.dataset.mode;
      Array.prototype.forEach.call(modeEl.querySelectorAll(".chip"), function (c) {
        c.classList.toggle("active", c.dataset.mode === mode);
      });
      qInput.placeholder = mode === "research"
        ? "Ask a sourcing / roster / vendor question - e.g. which subs handle SB-326 balcony repairs?"
        : "Ask anything from the Construction Notes - e.g. what is the scope for a bathroom remodel?";
      out.innerHTML = "";
      paintSuggestions();
      paintWebToggle();
      loadMeta();
    });

    webToggleEl.addEventListener("click", function () {
      if (mode === "research") return;
      webOn = !webOn;
      paintWebToggle();
    });

    photoBtn.addEventListener("click", function () {
      photoInput.click();
    });
    photoInput.addEventListener("change", function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      askPhoto(file, qInput.value.trim());
      photoInput.value = "";
    });

    document.getElementById("kAsk").addEventListener("click", function () {
      ask(qInput.value.trim());
    });
    qInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") ask(event.target.value.trim());
    });
    suggestEl.addEventListener("click", function (event) {
      var chip = event.target.closest(".chip");
      if (!chip) return;
      qInput.value = chip.dataset.q;
      ask(chip.dataset.q);
    });
  }

  APP.registerView("knowledge", { title: "Knowledge", render: render });
})();
