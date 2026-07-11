/* Knowledge view — ask questions against the Construction Notes corpus
   (scope-of-work PDF, client decks, trade whiteboards). Answers cite sources
   and show the related whiteboard/deck images (Drive thumbnails — they render
   because Ori is logged into Google in this browser). */
(function () {
  var summaryCache = null;
  var mode = "notes"; // "notes" | "research"

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

  function render(container) {
    container.innerHTML =
      '<h1 style="margin-bottom:0.7rem">Construction Knowledge</h1>' +
      '<div class="chips" id="kMode" style="margin-bottom:0.6rem">' +
        '<span class="chip active" data-mode="notes">Construction notes</span>' +
        '<span class="chip" data-mode="research">Research (roster + web)</span>' +
      '</div>' +
      '<div class="card" style="margin-bottom:0.9rem">' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
          '<input id="kQ" type="text" placeholder="Ask anything from the Construction Notes - e.g. what is the scope for a bathroom remodel?" ' +
            'style="flex:1;min-width:260px;min-height:38px;border:1px solid #d8dee8;border-radius:8px;padding:0 0.7rem;font:inherit;background:#f5f7fa" />' +
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
    var out = document.getElementById("kOut");

    function paintSuggestions() {
      var suggestions = mode === "research" ? RESEARCH_SUGGESTIONS : NOTES_SUGGESTIONS;
      suggestEl.innerHTML = suggestions.map(function (s) {
        return '<span class="chip" data-q="' + APP.esc(s) + '">' + APP.esc(s) + "</span>";
      }).join("");
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
      out.innerHTML = '<div class="card"><div class="muted">Searching notes and drafting answer…</div></div>';
      APP.fetchJSON("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question })
      }).then(function (result) {
        var html =
          '<div class="card" style="margin-bottom:0.9rem">' +
            '<h2>Answer <span class="pill ' + (result.engine === "claude-haiku" ? "green" : "amber") + '">' + APP.esc(result.engine) + "</span></h2>" +
            '<div style="white-space:pre-wrap;font-size:0.88rem;line-height:1.55">' + APP.esc(result.answer) + "</div>" +
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
        if (result.sources && result.sources.length) {
          html += '<div class="card"><h2>Sources</h2><ul style="list-style:none">' + result.sources.map(sourceLine).join("") + "</ul></div>";
        }
        out.innerHTML = html;
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
            '<h2>Answer <span class="pill ' + (result.engine === "claude-haiku" ? "green" : "amber") + '">' + APP.esc(result.engine || "?") + "</span></h2>" +
            '<div style="white-space:pre-wrap;font-size:0.88rem;line-height:1.55">' + APP.esc(result.answer || "") + "</div>" +
            researchMetaLine(result) +
          "</div>";
        out.innerHTML = html;
      }).catch(function (error) {
        out.innerHTML = '<div class="card"><div class="empty">Research failed: ' + APP.esc(error.message) + "</div></div>";
      });
    }

    function ask(question) {
      if (!question) return;
      if (mode === "research") askResearch(question);
      else askNotes(question);
    }

    paintSuggestions();
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
      loadMeta();
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
