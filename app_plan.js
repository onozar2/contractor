// app_plan.js — Action plan pin: interactive "Next steps" checklist (from
// JOON_ACTION_PLAN.md § 0) + the full plan rendered below. Registers the
// "plan" view (#/plan) with the APP shell (app.html). Vanilla JS, shell CSS
// classes only.
(function () {
  "use strict";
  if (!window.APP) { console.error("app_plan.js: APP shell not found"); return; }

  var API = "/api/plan";
  var esc = APP.esc;
  var MUTED = "color:#687587;font-size:0.8rem";

  var planCache = null;
  var planPromise = null;

  function fetchPlan(force) {
    if (planCache && !force) return Promise.resolve(planCache);
    if (!planPromise || force) {
      planPromise = APP.fetchJSON(API).then(function (data) {
        planCache = data;
        return data;
      }).catch(function (err) { planPromise = null; throw err; });
    }
    return planPromise;
  }

  // ── tiny self-contained markdown renderer (headings, lists, tables, bold/italic/code/links) ──
  // Self-contained copy of the app_knowledge.js pattern, extended with GFM-table
  // support since JOON_ACTION_PLAN.md is full of pipe tables.
  function mdInline(s) {
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function splitTableRow(line) {
    var t = line.trim();
    if (t.charAt(0) === "|") t = t.slice(1);
    if (t.charAt(t.length - 1) === "|") t = t.slice(0, -1);
    return t.split("|").map(function (c) { return c.trim(); });
  }
  function isSeparatorRow(line) {
    var t = (line || "").trim();
    if (!t || t.indexOf("-") === -1) return false;
    var cells = splitTableRow(t);
    return cells.length > 0 && cells.every(function (c) { return /^:?-{2,}:?$/.test(c); });
  }
  function tableHtml(header, rows) {
    var thead = "<tr>" + header.map(function (h) { return "<th>" + mdInline(h) + "</th>"; }).join("") + "</tr>";
    var tbody = rows.map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + mdInline(c) + "</td>"; }).join("") + "</tr>";
    }).join("");
    // Wide tables scroll inside their own box rather than blowing out the card.
    return '<div style="overflow-x:auto;margin:0.6rem 0"><table class="table">' +
      "<thead>" + thead + "</thead><tbody>" + tbody + "</tbody></table></div>";
  }
  function mdToHtml(md) {
    var lines = String(md || "").replace(/\r/g, "").split("\n");
    var out = [], para = [], list = null;
    function flushPara() { if (para.length) { out.push("<p>" + mdInline(para.join(" ")) + "</p>"); para = []; } }
    function flushList() { if (list) { out.push("</" + list + ">"); list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || /^[-=_*]{3,}$/.test(t)) { flushPara(); flushList(); continue; }
      if (t.indexOf("|") !== -1 && lines[i + 1] !== undefined && isSeparatorRow(lines[i + 1])) {
        flushPara(); flushList();
        var header = splitTableRow(t);
        i += 2; // skip the header row we just read + the separator row
        var rows = [];
        while (i < lines.length && lines[i].trim().indexOf("|") !== -1) {
          rows.push(splitTableRow(lines[i]));
          i++;
        }
        i--; // the for-loop's i++ will land on the first line after the table
        out.push(tableHtml(header, rows));
        continue;
      }
      var h = t.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flushPara(); flushList(); var lvl = Math.min(h[1].length + 1, 4); out.push("<h" + lvl + ">" + mdInline(h[2]) + "</h" + lvl + ">"); continue; }
      var ul = t.match(/^[-*•]\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (ul) {
        flushPara();
        if (list !== "ul") { flushList(); out.push("<ul>"); list = "ul"; }
        var prefix = ul[1] ? (/x/i.test(ul[1]) ? "☑ " : "☐ ") : "";
        out.push("<li>" + prefix + mdInline(ul[2]) + "</li>");
        continue;
      }
      var ol = t.match(/^\d+[.)]\s+(.*)$/);
      if (ol) {
        flushPara();
        if (list !== "ol") { flushList(); out.push("<ol>"); list = "ol"; }
        out.push("<li>" + mdInline(ol[1]) + "</li>");
        continue;
      }
      flushList();
      para.push(t);
    }
    flushPara(); flushList();
    return out.join("");
  }

  var PLAN_CSS_ID = "planMdCss";
  function ensureCss() {
    if (document.getElementById(PLAN_CSS_ID)) return;
    var style = document.createElement("style");
    style.id = PLAN_CSS_ID;
    style.textContent =
      "#planMd{font-size:0.92rem;line-height:1.6;color:#26303f}" +
      "#planMd h1{font-size:1.2rem;font-weight:900;margin:0 0 0.6rem}" +
      "#planMd h2{font-size:1.05rem;font-weight:900;margin:1.3rem 0 0.4rem}" +
      "#planMd h2:first-child{margin-top:0}" +
      "#planMd h3,#planMd h4{font-size:0.96rem;font-weight:800;margin:1rem 0 0.3rem}" +
      "#planMd p{margin:0 0 0.7rem}" +
      "#planMd ul,#planMd ol{margin:0 0 0.7rem 1.25rem;padding:0}" +
      "#planMd li{margin:0.22rem 0}" +
      "#planMd table{width:100%;border-collapse:collapse;font-size:0.8rem}" +
      "#planMd th,#planMd td{border:1px solid #e3e8ef;padding:0.35rem 0.5rem;text-align:left;vertical-align:top}" +
      "#planMd th{background:#f5f7fa;font-weight:800}" +
      "#planMd code{background:#eef1f6;border-radius:4px;padding:0.05rem 0.3rem;font-size:0.9em}";
    document.head.appendChild(style);
  }

  function stepsCountText(steps) {
    var doneCount = steps.filter(function (s) { return s.done; }).length;
    return doneCount + " of " + steps.length + " done";
  }

  function stepRowHtml(s) {
    return '<label class="planStepRow" data-i="' + s.i + '" ' +
      'style="display:flex;align-items:flex-start;gap:0.55rem;padding:0.42rem 0;border-bottom:1px solid #eef1f6;cursor:pointer">' +
      '<input type="checkbox" class="planStepChk" data-i="' + s.i + '"' + (s.done ? " checked" : "") + ' style="margin-top:0.22rem;flex:0 0 auto" />' +
      '<span class="planStepText" style="flex:1;font-size:0.88rem' + (s.done ? ";text-decoration:line-through;color:#8792a3" : "") + '">' + mdInline(s.text) + "</span>" +
      "</label>";
  }

  function stepsCardHtml(steps) {
    return (
      '<div class="card" id="planStepsCard">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">' +
          "<h2>Next steps — do these now</h2>" +
          '<span id="planStepsCount" style="' + MUTED + '">' + esc(stepsCountText(steps)) + "</span>" +
        "</div>" +
        '<div style="margin-top:0.4rem">' + steps.map(stepRowHtml).join("") + "</div>" +
      "</div>"
    );
  }

  function wireSteps(container, data) {
    var card = container.querySelector("#planStepsCard");
    var countEl = container.querySelector("#planStepsCount");
    if (!card) return;
    card.addEventListener("change", function (e) {
      var chk = e.target.closest(".planStepChk");
      if (!chk) return;
      var i = Number(chk.dataset.i);
      var step = data.steps.filter(function (s) { return s.i === i; })[0];
      if (!step) return;
      var done = chk.checked;
      var prevDone = step.done;
      var row = chk.closest(".planStepRow");
      var textEl = row && row.querySelector(".planStepText");

      function applyState(isDone) {
        step.done = isDone;
        chk.checked = isDone;
        if (textEl) {
          textEl.style.textDecoration = isDone ? "line-through" : "";
          textEl.style.color = isDone ? "#8792a3" : "";
        }
        if (countEl) countEl.textContent = stepsCountText(data.steps);
      }

      applyState(done); // optimistic
      APP.fetchJSON(API + "/steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ i: i, done: done })
      }).catch(function (err) {
        applyState(prevDone); // roll back
        APP.toast("Couldn't save that check — " + (err.message || "try again"));
      });
    });
  }

  function render(container) {
    ensureCss();
    container.innerHTML = '<h1>Action plan</h1><div class="card"><span style="' + MUTED + '">Loading plan…</span></div>';
    fetchPlan().then(function (data) {
      var steps = data.steps || [];
      container.innerHTML =
        "<h1>Action plan</h1>" +
        stepsCardHtml(steps) +
        '<div class="card" style="margin-top:0.9rem"><div id="planMd">' + mdToHtml(data.markdown || "") + "</div></div>";
      wireSteps(container, data);
    }).catch(function (err) {
      container.innerHTML =
        "<h1>Action plan</h1>" +
        '<div class="card"><div style="color:#b42318;font-weight:700">Something went wrong</div>' +
        '<div style="' + MUTED + ';margin:0.3rem 0 0.6rem">' + esc(err.message || "Failed to load the plan.") + "</div>" +
        '<button type="button" class="btn" id="planRetry">Retry</button></div>';
      var retry = container.querySelector("#planRetry");
      if (retry) retry.addEventListener("click", function () { render(container); });
    });
  }

  APP.registerView("plan", {
    title: "Action plan",
    render: function (container) { render(container); }
  });
})();
