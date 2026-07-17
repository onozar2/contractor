/* Curriculum + Photo Feed as first-class JOON Command views.
   Ori (2026-07-16): "there shouldn't be multiple places and hidden tabs" —
   the standalone pages curriculum.html and photo_feed.html now render INSIDE
   the app shell via embed iframes (?embed=1 hides their own topbars), and the
   standalone URLs redirect here, so the app is the only front door. */
(function () {
  "use strict";

  function iframeView(src, explainerHtml) {
    return function (container) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:0.7rem;height:calc(100vh - 2.4rem)";
      if (explainerHtml) {
        var card = APP.el(explainerHtml);
        wrap.appendChild(card);
      }
      var frame = document.createElement("iframe");
      frame.src = src;
      frame.style.cssText = "flex:1;width:100%;border:1px solid var(--line,#d8dee8);border-radius:12px;background:#eef2f6";
      frame.setAttribute("title", src);
      wrap.appendChild(frame);
      container.appendChild(wrap);
    };
  }

  APP.registerView("curriculum", {
    title: "Curriculum",
    render: iframeView("/curriculum.html?embed=1")
  });

  APP.registerView("photos", {
    title: "Photos",
    render: iframeView("/photo_feed.html?embed=1",
      '<div class="card" style="padding:0.7rem 1rem">' +
        '<b>What this feed is for:</b> <span class="muted">jobsite photo documentation, CompanyCam-style. ' +
        "Every project gets a photo trail by phase (pre-work &rarr; demo &rarr; rough-in &rarr; inspection &rarr; finish &rarr; final): " +
        "<b>(1)</b> proof &amp; protection — document existing damage before you touch anything and each inspection-ready stage, so change-order and “you broke this” disputes end with a dated photo; " +
        "<b>(2)</b> marketing — tag before/after pairs here and they become the portfolio you show the next client; " +
        "<b>(3)</b> client updates — share a project as a token-gated gallery link instead of texting photos; " +
        "<b>(4)</b> fuel for the tools — Design Studio renders and photo Q&amp;A snapshots land here too.</span>" +
      "</div>")
  });
})();
