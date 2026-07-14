/* Knowledge view — ONE all-encompassing flow (Ori's spec): ask by text or
   photo, get a GC-briefing answer from the Construction Notes (primary) + web
   (supplement), the related whiteboard/deck pictures, a generate-diagram
   button, and automatically: which subs in OUR roster do this work and what
   OUR pricing looks like for it. No modes, no toggles. */
(function () {
  var summaryCache = null;
  var rosterCache = null;   // /api/subcontractors (fetched once per session)
  var pricingCache = null;  // /api/pricing-intel
  var photoPreviewUrl = null;
  var lastPhotoFile = null; // kept so "Redesign this room" can resend the same photo
  var lastAsk = { question: "", answer: "" }; // for Generate-diagram

  var SUGGESTIONS = [
    "How do I replace a beam holding up the roof?",
    "Bathroom remodel scope + inspections",
    "Stair and handrail code requirements",
    "Tear-off roof process and shingle brand",
    "Foundation bolting retrofit steps",
    "Full house rewire cost",
    "Mold remediation scope",
    "Driveway pavers vs cement"
  ];

  var STOP = { the: 1, and: 1, for: 1, with: 1, that: 1, this: 1, what: 1, how: 1, are: 1, was: 1, will: 1, can: 1, our: 1, your: 1, out: 1, need: 1, holding: 1 };
  function terms(text) {
    return String(text || "").toLowerCase().split(/[^a-z0-9]+/)
      .filter(function (w) { return w.length >= 3 && !STOP[w]; });
  }
  function overlap(questionTerms, hayTokens) {
    var score = 0;
    questionTerms.forEach(function (t) {
      hayTokens.forEach(function (h) {
        if (h === t) score += 3;
        else if (h.indexOf(t) === 0 || t.indexOf(h) === 0) score += 1;
      });
    });
    return score;
  }

  /* Answers come back as markdown; rendering them pre-wrap made every ## and **
     show literally with huge gaps. Tiny renderer: escape first, then transform.
     Consecutive plain lines merge into one <p> so hard-wrapped model output
     reads as real paragraphs instead of chopped-up fragments. */
  function mdInline(s) {
    s = APP.esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }
  function mdToHtml(md) {
    var out = [], para = [], list = null;
    function flushPara() { if (para.length) { out.push("<p>" + mdInline(para.join(" ")) + "</p>"); para = []; } }
    function flushList() { if (list) { out.push("</" + list + ">"); list = null; } }
    String(md || "").replace(/\r/g, "").split("\n").forEach(function (line) {
      var t = line.trim();
      if (!t || /^[-=_*]{3,}$/.test(t)) { flushPara(); flushList(); return; }
      var h = t.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flushPara(); flushList(); var lvl = Math.min(h[1].length + 1, 4); out.push("<h" + lvl + ">" + mdInline(h[2]) + "</h" + lvl + ">"); return; }
      var ul = t.match(/^[-*•]\s+(.*)$/);
      if (ul) { flushPara(); if (list !== "ul") { flushList(); out.push("<ul>"); list = "ul"; } out.push("<li>" + mdInline(ul[1]) + "</li>"); return; }
      var ol = t.match(/^\d+[.)]\s+(.*)$/);
      if (ol) { flushPara(); if (list !== "ol") { flushList(); out.push("<ol>"); list = "ol"; } out.push("<li>" + mdInline(ol[1]) + "</li>"); return; }
      flushList();
      para.push(t);
    });
    flushPara(); flushList();
    return out.join("");
  }

  var ANSWER_CSS =
    "#kOut .kAnswer{font-size:1rem;line-height:1.62;color:#26303f;margin-top:0.55rem}" +
    "#kOut .kAnswer p{margin:0 0 0.7rem}" +
    "#kOut .kAnswer h2{font-size:1.06rem;font-weight:900;text-transform:none;letter-spacing:0;color:#1d2634;margin:1.05rem 0 0.35rem}" +
    "#kOut .kAnswer h3,#kOut .kAnswer h4{font-size:0.98rem;font-weight:800;text-transform:none;letter-spacing:0;color:#1d2634;margin:0.85rem 0 0.3rem}" +
    "#kOut .kAnswer h2:first-child,#kOut .kAnswer h3:first-child{margin-top:0.1rem}" +
    "#kOut .kAnswer ul,#kOut .kAnswer ol{margin:0 0 0.7rem 1.25rem;padding:0}" +
    "#kOut .kAnswer li{margin:0.22rem 0}" +
    "#kOut .kAnswer code{background:#eef1f6;border-radius:4px;padding:0.05rem 0.3rem;font-size:0.9em}";

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
        '<div class="card" style="margin-bottom:0.9rem"><details>' +
          '<summary style="cursor:pointer;font-weight:800;font-size:0.95rem">Sources (' + sources.length + ')</summary>' +
          '<ul style="list-style:none;margin-top:0.5rem">' + items + '</ul>' +
        '</details></div>'
      );
    }
    return '<div class="card" style="margin-bottom:0.9rem"><h2>Sources</h2><ul style="list-style:none">' + items + '</ul></div>';
  }

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
        '<div class="kAnswer">' + mdToHtml(result.answer) + "</div>" +
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
    html += '<div class="card" style="margin-bottom:0.9rem" id="kIllu">' +
      '<button class="btn" data-illustrate="1">🎨 Generate diagram</button> ' +
      '<button class="btn" data-gemini-bridge="1" title="Copies the diagram prompt and opens Gemini - your Google AI Pro plan draws it free">🖼️ Draw in Gemini (free w/ your Pro plan)</button>' +
      '<span class="muted" style="font-size:0.74rem;margin-left:0.5rem">API generation costs ~4¢/image with billing; the Gemini button uses your subscription instead - paste (Ctrl+V) when it opens</span></div>';
    html += '<div id="kRoster"></div>';
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

  // ── "Who in OUR roster does this + what OUR pricing says" ──
  function loadRoster() {
    if (rosterCache) return Promise.resolve(rosterCache);
    return APP.fetchJSON("/api/subcontractors").then(function (a) { rosterCache = a; return a; });
  }
  function loadPricing() {
    if (pricingCache) return Promise.resolve(pricingCache);
    return APP.fetchJSON("/api/pricing-intel").then(function (p) { pricingCache = p; return p; });
  }

  function matchSubs(question, roster) {
    var qTerms = terms(question);
    return roster
      .filter(function (s) { return !s.hidden && !s.hiddenAuto; })
      .map(function (s) {
        var hay = terms(s.serviceCategory + " " + (s.specialties || []).join(" "));
        return { s: s, score: overlap(qTerms, hay) };
      })
      .filter(function (e) { return e.score > 0; })
      .sort(function (a, b) {
        if (!!b.s.trusted !== !!a.s.trusted) return b.s.trusted ? 1 : -1;
        return b.score - a.score || (b.s.legitScore || 0) - (a.s.legitScore || 0);
      })
      .slice(0, 5)
      .map(function (e) { return e.s; });
  }

  function matchPricing(question, pricing) {
    var qTerms = terms(question);
    return (pricing.items || [])
      .map(function (item) {
        var hay = terms(item.description + " " + item.service + " " + item.trade);
        return { item: item, score: overlap(qTerms, hay) };
      })
      .filter(function (e) { return e.score >= 3; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 4)
      .map(function (e) { return e.item; });
  }

  function money(n) { return APP.fmtMoney(Number(n) || 0); }

  function rosterSectionHtml(subs, items) {
    var html = "";
    if (subs.length) {
      html +=
        '<div class="card" style="margin-bottom:0.9rem"><h2>Subs in our roster for this</h2>' +
        '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Company</th><th>Trade</th><th>Trust</th><th>Contact</th><th>Price tier</th></tr></thead><tbody>' +
        subs.map(function (s) {
          return '<tr data-href="#/subs/' + APP.esc(s.id) + '" style="cursor:pointer">' +
            '<td><b>' + APP.esc(s.companyName) + '</b>' + (s.trusted ? ' <span class="pill amber">⭐ my contact</span>' : '') +
              (s.ownerName ? '<br /><span class="muted" style="font-size:0.72rem">' + APP.esc(s.ownerName) + '</span>' : '') + '</td>' +
            '<td>' + APP.esc(s.serviceCategory || '') + '</td>' +
            '<td>' + APP.scoreBadge(s.legitScore) + '</td>' +
            '<td style="font-size:0.78rem">' +
              (s.phone ? '<a href="tel:' + APP.esc(s.phone) + '" onclick="event.stopPropagation()">' + APP.esc(s.phone) + '</a><br />' : '') +
              (s.email ? '<a href="mailto:' + APP.esc(s.email) + '" onclick="event.stopPropagation()">' + APP.esc(s.email) + '</a>' : '') + '</td>' +
            '<td>' + APP.esc(s.priceTier && s.priceTier !== 'unknown' ? s.priceTier : '') +
              (s.minimumJobSize ? '<div class="muted" style="font-size:0.72rem">min ' + APP.esc(s.minimumJobSize) + '</div>' : '') + '</td>' +
          '</tr>';
        }).join("") +
        '</tbody></table></div>' +
        '<div class="muted" style="font-size:0.72rem;margin-top:0.4rem">Ranked: your ⭐ contacts first, then trust score. Click a row for the full profile + outreach drafts.</div></div>';
    }
    if (items.length) {
      html +=
        '<div class="card" style="margin-bottom:0.9rem"><h2>Our pricing for this</h2>' +
        '<div style="overflow-x:auto"><table class="table"><thead><tr><th>Item</th><th>SoCal benchmark</th><th>Our jobs</th><th>Live estimate</th></tr></thead><tbody>' +
        items.map(function (item) {
          var bench = item.benchmark && item.benchmark.lowUSD
            ? money(item.benchmark.lowUSD) + "–" + money(item.benchmark.highUSD)
            : money(item.low) + "–" + money(item.high) + ' <span class="pill" style="opacity:0.6">book</span>';
          var ours = item.observed && item.observed.count
            ? money(item.observed.median) + ' <span class="muted">(' + item.observed.count + ')</span>'
            : '<span class="muted">none yet</span>';
          var blended = item.blended ? "<b>" + money(item.blended.low) + "–" + money(item.blended.high) + "</b>" : "—";
          return "<tr><td>" + APP.esc(item.description) + '<div class="muted" style="font-size:0.72rem">' + APP.esc(item.trade || "") + " · per " + APP.esc(item.unit || "job") + "</div></td>" +
            "<td>" + bench + "</td><td>" + ours + "</td><td>" + blended + "</td></tr>";
        }).join("") +
        '</tbody></table></div>' +
        '<div class="muted" style="font-size:0.72rem;margin-top:0.4rem">Full detail on the <a href="#/pricing" style="font-weight:800">Pricing</a> page.</div></div>';
    }
    return html;
  }

  function appendRosterSections(question) {
    var host = document.getElementById("kRoster");
    if (!host) return;
    host.innerHTML = '<div class="muted" style="font-size:0.78rem;margin-bottom:0.9rem">Checking our roster and pricing…</div>';
    Promise.all([loadRoster(), loadPricing()]).then(function (results) {
      var subs = matchSubs(question, results[0]);
      var items = matchPricing(question, results[1]);
      host.innerHTML = rosterSectionHtml(subs, items);
    }).catch(function () {
      host.innerHTML = "";
    });
  }

  function render(container) {
    if (!document.getElementById("kAnswerCss")) {
      var styleEl = document.createElement("style");
      styleEl.id = "kAnswerCss";
      styleEl.textContent = ANSWER_CSS;
      document.head.appendChild(styleEl);
    }
    container.innerHTML =
      '<h1 style="margin-bottom:0.7rem">Construction Knowledge</h1>' +
      '<div class="card" style="margin-bottom:0.9rem">' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">' +
          '<input id="kQ" type="text" placeholder="Ask anything - scopes, code, how-to. Answers use your notes first, then the web, and show your subs + pricing for it." ' +
            'style="flex:1;min-width:260px;min-height:38px;border:1px solid #d8dee8;border-radius:8px;padding:0 0.7rem;font:inherit;background:#f5f7fa" />' +
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
    var photoBtn = document.getElementById("kPhotoBtn");
    var photoInput = document.getElementById("kPhotoInput");
    var out = document.getElementById("kOut");

    suggestEl.innerHTML = SUGGESTIONS.map(function (s) {
      return '<span class="chip" data-q="' + APP.esc(s) + '">' + APP.esc(s) + "</span>";
    }).join("");

    (summaryCache ? Promise.resolve(summaryCache) : APP.fetchJSON("/api/knowledge/summary").then(function (s) { summaryCache = s; return s; }))
      .then(function (summary) {
        metaEl.textContent =
          summary.chunks + " knowledge chunks (your scope docs, SoCal permits + building code, client decks) + " +
          summary.images + " whiteboards · answers also check the live web and your sub roster automatically.";
      })
      .catch(function () {
        metaEl.textContent = "Corpus not ingested yet - run tmp/ingest-knowledge.mjs.";
      });

    function ask(question) {
      if (!question) return;
      out.innerHTML = '<div class="card"><div class="muted">Searching your notes + the web and drafting the plan…</div></div>';
      APP.fetchJSON("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question })
      }).then(function (result) {
        lastAsk = { question: question, answer: String(result.answer || "").slice(0, 300) };
        out.innerHTML = answerHtml(result, '<span class="pill plum" style="margin-left:0.3rem">notes + web</span>');
        appendRosterSections(question);
      }).catch(function (error) {
        out.innerHTML = '<div class="card"><div class="empty">Ask failed: ' + APP.esc(error.message) + "</div></div>";
      });
    }

    function askPhoto(file, question) {
      if (photoPreviewUrl) { URL.revokeObjectURL(photoPreviewUrl); }
      photoPreviewUrl = URL.createObjectURL(file);
      out.innerHTML = photoPreviewHtml(photoPreviewUrl, "Reading your photo… this takes about 2-3 minutes.");
      var effectiveQ = question || "What am I looking at and what do I need to do?";
      var qs = "?question=" + encodeURIComponent(effectiveQ);
      APP.fetchJSON("/api/knowledge/ask-photo" + qs, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file
      }).then(function (result) {
        lastAsk = { question: effectiveQ, answer: String(result.answer || "").slice(0, 300) };
        out.innerHTML = answerHtml(result, "", photoPreviewHtml(photoPreviewUrl, "Photo you asked about"));
        // Redesign controls (photo asks only)
        var illu = document.getElementById("kIllu");
        if (illu) {
          var rd = document.createElement("div");
          rd.className = "card";
          rd.style.marginBottom = "0.9rem";
          rd.id = "kRedesign";
          rd.innerHTML =
            '<h2>Redesign this space</h2>' +
            '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">' +
              '<select id="kRdRoom" style="min-height:34px;border:1px solid #d8dee8;border-radius:8px;padding:0 0.5rem;font:inherit;background:#f5f7fa">' +
                ["kitchen","bathroom","living room","bedroom","exterior / facade","backyard","office"].map(function (r) { return "<option>" + r + "</option>"; }).join("") +
              "</select>" +
              '<select id="kRdStyle" style="min-height:34px;border:1px solid #d8dee8;border-radius:8px;padding:0 0.5rem;font:inherit;background:#f5f7fa">' +
                ["modern light", "warm organic / wood tones", "coastal airy", "traditional classic", "sleek contemporary dark", "spanish / mediterranean"].map(function (s) { return "<option>" + s + "</option>"; }).join("") +
              "</select>" +
              '<button class="btn primary" data-redesign="1">🏠 Redesign (API)</button>' +
              '<button class="btn" data-redesign-bridge="1" title="Opens Gemini with the redesign prompt - attach this same photo there; free with your Pro plan">🖼️ Redesign in Gemini (free)</button>' +
            '</div>' +
            '<div id="kRdOut" class="muted" style="font-size:0.76rem;margin-top:0.45rem">Structure-preserving: keeps your layout and camera angle, changes finishes/colors/fixtures.</div>';
          illu.parentNode.insertBefore(rd, illu);
        }
        // Match roster/pricing off the answer text too - the photo often names
        // the trade better than the question ("that's a failed hot mop pan...").
        appendRosterSections(effectiveQ + " " + String(result.answer || "").slice(0, 200));
      }).catch(function (error) {
        out.innerHTML =
          photoPreviewHtml(photoPreviewUrl, "Photo you asked about") +
          '<div class="card"><div class="empty">Photo ask failed: ' + APP.esc(error.message) + "</div></div>";
      });
    }

    photoBtn.addEventListener("click", function () { photoInput.click(); });
    photoInput.addEventListener("change", function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      lastPhotoFile = file;
      askPhoto(file, qInput.value.trim());
      photoInput.value = "";
    });

    function redesignPromptText(room, style) {
      return "Redesign this " + room + " in a " + style + " style. Keep the exact camera angle, room layout, window/door positions and perspective; " +
        "change only finishes, cabinetry/fixture styles, colors, materials and lighting. Photorealistic, consistent lighting, professionally staged.";
    }

    out.addEventListener("click", function (event) {
      var rdBtn = event.target.closest("[data-redesign]");
      var rdBridge = event.target.closest("[data-redesign-bridge]");
      if (!rdBtn && !rdBridge) return;
      var room = (document.getElementById("kRdRoom") || {}).value || "room";
      var style = (document.getElementById("kRdStyle") || {}).value || "modern light";
      var rdOut = document.getElementById("kRdOut");
      if (rdBridge) {
        navigator.clipboard.writeText(redesignPromptText(room, style)).then(function () {
          APP.toast("Prompt copied — in Gemini: attach this same photo, paste, send");
          window.open("https://gemini.google.com/app", "_blank");
        }).catch(function () {
          window.prompt("Copy this, attach the same photo in Gemini:", redesignPromptText(room, style));
          window.open("https://gemini.google.com/app", "_blank");
        });
        return;
      }
      if (!lastPhotoFile) { rdOut.textContent = "Upload a photo first (📷 Ask with a photo)."; return; }
      rdOut.innerHTML = '<span class="muted">Generating redesign… ~30-90s</span>';
      APP.fetchJSON("/api/knowledge/redesign?room=" + encodeURIComponent(room) + "&style=" + encodeURIComponent(style), {
        method: "POST",
        headers: { "Content-Type": lastPhotoFile.type || "image/jpeg" },
        body: lastPhotoFile
      }).then(function (r) {
        if (r.imageUrl) {
          rdOut.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0.6rem;margin-top:0.4rem">' +
              '<div><div class="muted" style="font-size:0.72rem;margin-bottom:0.2rem">Before</div><img src="' + APP.esc(photoPreviewUrl) + '" style="width:100%;border-radius:8px" /></div>' +
              '<div><div class="muted" style="font-size:0.72rem;margin-bottom:0.2rem">Concept (' + APP.esc(style) + ')</div><img src="' + APP.esc(r.imageUrl) + '" style="width:100%;border-radius:8px" /></div>' +
            '</div><div class="muted" style="font-size:0.72rem;margin-top:0.3rem">Concept only — not a design document.</div>';
        } else if (r.quotaBlocked) {
          rdOut.innerHTML = '<span class="muted">Google\'s API image quota isn\'t available on the free tier — use <b>🖼️ Redesign in Gemini (free)</b>: it copies this exact prompt, you attach the same photo there and your Pro plan renders it.</span>';
        } else {
          rdOut.innerHTML = '<span class="muted">' + APP.esc(r.message || r.error || "Generation unavailable") + "</span>";
        }
      }).catch(function (e) { rdOut.innerHTML = '<span class="muted">Failed: ' + APP.esc(e.message) + "</span>"; });
    });

    out.addEventListener("click", function (event) {
      var row = event.target.closest("tr[data-href]");
      if (row && !event.target.closest("a,button")) { APP.navigate(row.dataset.href); return; }
      var bridge = event.target.closest("[data-gemini-bridge]");
      if (bridge) {
        var diagramPrompt = "Draw a clean, labeled instructional construction diagram for a contractor briefing: " +
          lastAsk.question + " — key points: " + lastAsk.answer;
        navigator.clipboard.writeText(diagramPrompt).then(function () {
          APP.toast("Prompt copied — paste it in Gemini (Ctrl+V)");
          window.open("https://gemini.google.com/app", "_blank");
        }).catch(function () {
          window.prompt("Copy this prompt, then paste it in Gemini:", diagramPrompt);
          window.open("https://gemini.google.com/app", "_blank");
        });
        return;
      }
      var btn = event.target.closest("[data-illustrate]");
      if (!btn) return;
      var card = document.getElementById("kIllu");
      card.innerHTML = '<span class="muted">Drawing diagram… ~20-60s</span>';
      APP.fetchJSON("/api/knowledge/illustrate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: lastAsk.question + " — " + lastAsk.answer })
      }).then(function (r) {
        if (r.configured === false) { card.innerHTML = '<span class="muted">' + APP.esc(r.message) + '</span>'; return; }
        if (r.imageUrl) card.innerHTML = '<img src="' + APP.esc(r.imageUrl) + '" style="max-width:560px;width:100%;border-radius:8px" /><div class="muted" style="font-size:0.72rem;margin-top:0.3rem">generated by ' + APP.esc(r.model || "Google image model") + ' — illustrative, not engineering guidance</div>';
        else card.innerHTML = '<span class="muted">' + APP.esc(r.error || "Generation failed") + '</span>';
      }).catch(function (e) { card.innerHTML = '<span class="muted">Failed: ' + APP.esc(e.message) + '</span>'; });
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
