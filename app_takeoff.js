/* app_takeoff.js — Plan Takeoff ("Bluebeam-lite") view.
   Registers the "takeoff" view on the APP shell (app.html).

   List   (#/takeoff)     : takeoffs as cards + "New takeoff" (upload a plan image).
   Editor (#/takeoff/:id) : canvas over the plan image — calibrate scale, click-measure
                             lines/areas/counts, tag items to the cost book, push them
                             into a project's cost lines.

   All measurement points are stored in IMAGE pixel space (scale-independent of the
   on-screen zoom). Vanilla JS + canvas only — no dependencies.
   Uses ONLY the shell's CSS classes + inline layout styles, per APP_CONTRACT.md. */
(function () {
  "use strict";

  var TOOLS = [
    { id: "select", label: "Select" },
    { id: "calibrate", label: "Calibrate" },
    { id: "line", label: "Line" },
    { id: "area", label: "Area" },
    { id: "count", label: "Count" }
  ];
  var TOOL_HINTS = {
    select: "Click an item (on the canvas or in the list) to select it, then “Delete selected.”",
    calibrate: "Click two points a known distance apart on the plan, then enter the real length in feet.",
    line: "Click the start, then the end, of the run you’re measuring.",
    area: "Click each corner of the area. Double-click the last corner to close the shape.",
    count: "Click each item to count. Switch tools when you’re done with this count."
  };
  var KIND_UNIT = { line: "lf", area: "sqft", count: "ea" };

  var INPUT = 'style="font:inherit;font-size:0.82rem;min-height:34px;border:1px solid #d8dee8;' +
    'border-radius:7px;padding:0.25rem 0.55rem;background:#fff;color:#172033;width:100%"';
  var ROW = 'style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end"';
  var FIELD = 'style="display:grid;gap:0.2rem;flex:1 1 160px;min-width:0"';
  var LABEL = 'style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#687587"';

  var costbookPromise = null;
  var actualsPromise = null;

  function getCostbook() {
    if (!costbookPromise) {
      costbookPromise = APP.fetchJSON("/api/estimator/costbook").catch(function () {
        costbookPromise = null;
        return null;
      });
    }
    return costbookPromise;
  }

  function getProjects() {
    if (!actualsPromise) {
      actualsPromise = APP.fetchJSON("/api/actuals").catch(function () {
        actualsPromise = null;
        return [];
      });
    }
    return actualsPromise;
  }

  function esc(v) { return APP.esc(v); }
  function num(v) { return Number(v) || 0; }

  function loadingEl(label) {
    return APP.el('<div class="loading">' + esc(label || "Loading") + "</div>");
  }

  function errorEl(message, retry) {
    var node = APP.el('<div class="empty"><b>Couldn’t load</b>' + esc(message || "Unknown error") +
      '<div style="margin-top:0.7rem"><button class="btn primary" type="button">Retry</button></div></div>');
    node.querySelector("button").addEventListener("click", retry);
    return node;
  }

  function genLocalId() {
    return "i" + Date.now().toString(36) + Math.random().toString(16).slice(2, 8);
  }

  /* ── geometry (all in image pixel space) ── */

  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  function polylineLength(points) {
    var d = 0;
    for (var i = 1; i < points.length; i++) d += dist(points[i - 1], points[i]);
    return d;
  }

  function polygonArea(points) {
    if (points.length < 3) return 0;
    var sum = 0;
    for (var i = 0; i < points.length; i++) {
      var a = points[i], b = points[(i + 1) % points.length];
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
  }

  function pointToSegmentDist(p, a, b) {
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var wx = p[0] - a[0], wy = p[1] - a[1];
    var len2 = vx * vx + vy * vy;
    var t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    var px = a[0] + t * vx, py = a[1] + t * vy;
    return Math.hypot(p[0] - px, p[1] - py);
  }

  function pointInPolygon(pt, points) {
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      var xi = points[i][0], yi = points[i][1], xj = points[j][0], yj = points[j][1];
      var hit = ((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-9) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function rawMeasure(item) {
    if (item.kind === "count") return item.points.length;
    if (item.kind === "line") return polylineLength(item.points);
    return polygonArea(item.points);
  }

  // Computed value: real units once calibrated, raw pixels until then.
  function itemValue(item, scale) {
    if (item.kind === "count") return item.points.length;
    var raw = rawMeasure(item);
    if (!scale || !scale.pixels || !scale.realFeet) return raw;
    var feetPerPixel = scale.realFeet / scale.pixels;
    return item.kind === "line" ? raw * feetPerPixel : raw * feetPerPixel * feetPerPixel;
  }

  function itemUnitLabel(item, scale) {
    if (item.kind === "count") return "ea";
    if (!scale || !scale.pixels || !scale.realFeet) return "px";
    return item.kind === "line" ? "lf" : "sqft";
  }

  function fmtValue(value, unit) {
    var n = Number(value) || 0;
    var decimals = unit === "px" ? 0 : (n < 100 ? 1 : 0);
    return n.toFixed(decimals) + " " + unit;
  }

  /* ════════════════════ LIST VIEW ════════════════════ */

  function renderList(container) {
    container.innerHTML = "";
    var head = APP.el('<div class="viewhead"><h1>Plan Takeoff</h1>' +
      '<button class="btn primary" type="button" id="tkNew">+ New takeoff</button></div>');
    container.appendChild(head);
    container.appendChild(APP.el('<div class="footline" style="margin:0.2rem 0 0.7rem">' +
      "Export the plan page as JPG/PNG or photograph it — PDF pages can be screenshotted.</div>"));

    var formSlot = APP.el("<div></div>");
    container.appendChild(formSlot);
    var body = APP.el("<div></div>");
    container.appendChild(body);

    head.querySelector("#tkNew").addEventListener("click", function () {
      if (formSlot.firstChild) { formSlot.innerHTML = ""; return; }
      formSlot.appendChild(buildNewTakeoffForm(function () { formSlot.innerHTML = ""; }));
    });

    function load() {
      body.innerHTML = "";
      body.appendChild(loadingEl("Loading takeoffs"));
      Promise.all([APP.fetchJSON("/api/takeoff"), getProjects()]).then(function (results) {
        var rows = results[0] || [];
        var projects = results[1] || [];
        var byId = {};
        projects.forEach(function (p) { byId[p.id] = p; });
        body.innerHTML = "";
        drawCards(body, rows, byId, load);
      }).catch(function (err) {
        body.innerHTML = "";
        body.appendChild(errorEl(err.message, load));
      });
    }
    load();
  }

  function drawCards(body, rows, projectsById, reload) {
    if (!rows.length) {
      body.appendChild(APP.el('<div class="empty"><b>No takeoffs yet</b>' +
        "Upload a plan image with “+ New takeoff”, calibrate the scale once, then click-measure.</div>"));
      return;
    }
    var grid = APP.el('<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:0.8rem"></div>');
    rows.forEach(function (row) {
      var project = row.projectId ? projectsById[row.projectId] : null;
      var calibrated = row.scale && row.scale.pixels && row.scale.realFeet;
      var thumb = row.imageUrl
        ? '<img src="' + esc(row.imageUrl) + '" alt="" style="width:100%;height:130px;object-fit:cover;border-radius:8px;border:1px solid #d8dee8;background:#eef2f6" />'
        : '<div class="empty" style="padding:1rem;height:130px">No image</div>';
      var card = APP.el('<div class="card" style="cursor:pointer;padding:0.7rem" role="link" tabindex="0">' +
        thumb +
        '<div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:flex-start;margin-top:0.55rem">' +
          '<b style="font-size:0.9rem;min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(row.projectName) + "</b>" +
          '<button type="button" data-f="del" title="Delete takeoff" style="border:none;background:none;color:#98a2b3;cursor:pointer;font-size:0.95rem;line-height:1">✕</button>' +
        "</div>" +
        '<div class="muted" style="font-size:0.76rem;margin-top:0.15rem">' +
          esc(project ? project.projectName : "Unlinked") +
        "</div>" +
        '<div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.4rem">' +
          '<span class="pill">' + esc(String((row.items || []).length)) + " item" + ((row.items || []).length === 1 ? "" : "s") + "</span>" +
          '<span class="pill ' + (calibrated ? "green" : "red") + '">' + (calibrated ? "Calibrated" : "Not calibrated") + "</span>" +
        "</div>" +
      "</div>");
      function go() { APP.navigate("#/takeoff/" + encodeURIComponent(row.id)); }
      card.addEventListener("click", function (e) { if (!e.target.closest("[data-f=\"del\"]")) go(); });
      card.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
      card.querySelector('[data-f="del"]').addEventListener("click", function (e) {
        e.stopPropagation();
        if (!window.confirm("Delete this takeoff? This can’t be undone.")) return;
        APP.fetchJSON("/api/takeoff/" + encodeURIComponent(row.id), { method: "DELETE" }).then(function () {
          APP.toast("Takeoff deleted");
          reload();
        }).catch(function (err) { APP.toast("Delete failed: " + err.message); });
      });
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  function buildNewTakeoffForm(onDone) {
    var card = APP.el('<div class="card"><h2>New takeoff</h2>' +
      '<div ' + ROW + ">" +
        '<label ' + FIELD + '><span ' + LABEL + ">Takeoff name</span><input " + INPUT + ' type="text" data-f="name" placeholder="e.g. Sherman Oaks — Floor Plan" /></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Project (optional)</span><select " + INPUT + ' data-f="project"><option value="">Not linked yet</option></select></label>' +
        '<label ' + FIELD + '><span ' + LABEL + ">Plan image</span><input " + INPUT + ' type="file" accept="image/*" data-f="file" /></label>' +
      "</div>" +
      '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.6rem">' +
        '<button class="btn primary" type="button" data-f="create">Create</button>' +
        '<button class="btn" type="button" data-f="cancel">Cancel</button>' +
        '<span class="footline" data-f="msg"></span>' +
      "</div>" +
    "</div>");

    getProjects().then(function (rows) {
      var select = card.querySelector('[data-f="project"]');
      (rows || []).forEach(function (p) {
        select.appendChild(APP.el('<option value="' + esc(p.id) + '">' + esc(p.projectName) + "</option>"));
      });
    });

    var msg = card.querySelector('[data-f="msg"]');
    card.querySelector('[data-f="cancel"]').addEventListener("click", onDone);
    card.querySelector('[data-f="create"]').addEventListener("click", function () {
      var btn = card.querySelector('[data-f="create"]');
      var name = card.querySelector('[data-f="name"]').value.trim();
      var projectId = card.querySelector('[data-f="project"]').value;
      var file = card.querySelector('[data-f="file"]').files[0];
      if (!name) { msg.textContent = "Give the takeoff a name first."; return; }
      if (!file) { msg.textContent = "Pick a plan image first."; return; }
      btn.disabled = true;
      msg.textContent = "Uploading plan…";
      APP.fetchJSON("/api/takeoff/upload?name=" + encodeURIComponent(file.name), {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file
      }).then(function (uploaded) {
        msg.textContent = "Creating takeoff…";
        return APP.fetchJSON("/api/takeoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName: name, projectId: projectId, imageUrl: uploaded.imageUrl, scale: null, items: [] })
        });
      }).then(function (created) {
        APP.toast("Takeoff created");
        APP.navigate("#/takeoff/" + encodeURIComponent(created.id));
      }).catch(function (err) {
        btn.disabled = false;
        msg.textContent = "Failed: " + err.message;
      });
    });
    return card;
  }

  /* ════════════════════ EDITOR VIEW ════════════════════ */

  function renderEditor(container, id) {
    container.innerHTML = "";
    container.appendChild(loadingEl("Loading takeoff"));
    APP.fetchJSON("/api/takeoff").then(function (rows) {
      var record = (rows || []).find(function (r) { return r.id === id; });
      container.innerHTML = "";
      if (!record) {
        container.appendChild(APP.el('<div class="empty"><b>Takeoff not found</b>' +
          'It may have been deleted. <a href="#/takeoff">Back to takeoffs</a>.</div>'));
        return;
      }
      buildEditor(container, record);
    }).catch(function (err) {
      container.innerHTML = "";
      container.appendChild(errorEl(err.message, function () { renderEditor(container, id); }));
    });
  }

  function cloneItem(row) {
    return {
      id: row.id || genLocalId(),
      kind: row.kind === "area" || row.kind === "count" ? row.kind : "line",
      label: row.label || "",
      points: Array.isArray(row.points) ? row.points.map(function (p) { return [num(p[0]), num(p[1])]; }) : [],
      costbookId: row.costbookId || "",
      createdAt: row.createdAt || new Date().toISOString()
    };
  }

  function buildEditor(container, record) {
    var state = {
      record: record,
      items: (record.items || []).map(cloneItem),
      scale: record.scale && record.scale.pixels && record.scale.realFeet
        ? { pixels: num(record.scale.pixels), realFeet: num(record.scale.realFeet) } : null,
      tool: "select",
      pending: null,
      selectedId: null,
      fitScale: 1,
      zoom: 1,
      img: null,
      canvas: null,
      c2d: null
    };

    /* header */
    var head = APP.el('<div class="viewhead">' +
      '<div style="min-width:0">' +
        '<div class="muted" style="font-size:0.76rem"><a href="#/takeoff" style="text-decoration:none">← Takeoffs</a></div>' +
        '<h1 style="overflow:hidden;text-overflow:ellipsis">' + esc(record.projectName) + "</h1>" +
      "</div>" +
      '<div data-f="calibpill"></div>' +
    "</div>");
    container.appendChild(head);
    var calibSlot = head.querySelector('[data-f="calibpill"]');

    function renderCalibPill() {
      calibSlot.innerHTML = "";
      calibSlot.appendChild(APP.el(state.scale
        ? '<span class="pill green">Calibrated · 1px ≈ ' + esc((state.scale.realFeet / state.scale.pixels).toFixed(4)) + "ft</span>"
        : '<span class="pill red">Not calibrated</span>'));
    }
    renderCalibPill();

    /* toolbar */
    var toolbar = APP.el('<div class="card" style="margin-bottom:0.7rem">' +
      '<div class="chips" data-f="tools"></div>' +
      '<div class="footline" data-f="hint" style="margin-top:0.4rem"></div>' +
      '<div ' + ROW + ' style="margin-top:0.6rem">' +
        '<label ' + FIELD + ' style="flex:0 1 220px"><span ' + LABEL + ">Zoom</span>" +
          '<input type="range" data-f="zoom" min="0.25" max="3" step="0.05" value="1" style="width:100%" /></label>' +
        '<button class="btn" type="button" data-f="delsel" disabled>Delete selected</button>' +
        '<button class="btn primary" type="button" data-f="save">Save</button>' +
        '<span class="footline" data-f="savemsg"></span>' +
      "</div>" +
    "</div>");
    container.appendChild(toolbar);

    var toolsBox = toolbar.querySelector('[data-f="tools"]');
    TOOLS.forEach(function (t) {
      toolsBox.appendChild(APP.el('<button class="chip' + (t.id === state.tool ? " active" : "") + '" type="button" data-tool="' + t.id + '">' + esc(t.label) + "</button>"));
    });
    var hintEl = toolbar.querySelector('[data-f="hint"]');
    hintEl.textContent = TOOL_HINTS[state.tool];

    function setTool(name) {
      state.tool = name;
      state.pending = null;
      toolsBox.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-tool") === name); });
      hintEl.textContent = TOOL_HINTS[name] || "";
      drawAll();
    }
    toolsBox.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-tool]");
      if (chip) setTool(chip.getAttribute("data-tool"));
    });

    var delSelBtn = toolbar.querySelector('[data-f="delsel"]');
    delSelBtn.addEventListener("click", function () {
      if (!state.selectedId) return;
      if (!window.confirm("Delete this item?")) return;
      deleteItem(state.selectedId);
    });

    var saveMsg = toolbar.querySelector('[data-f="savemsg"]');
    var saveBtn = toolbar.querySelector('[data-f="save"]');
    saveBtn.addEventListener("click", function () { doSave(); });

    function doSave() {
      saveBtn.disabled = true;
      saveMsg.textContent = "Saving…";
      return APP.fetchJSON("/api/takeoff/" + encodeURIComponent(state.record.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: state.record.projectName,
          projectId: state.record.projectId || "",
          imageUrl: state.record.imageUrl,
          scale: state.scale,
          items: state.items.map(function (item) {
            return {
              id: item.id, kind: item.kind, label: item.label, points: item.points,
              value: itemValue(item, state.scale), unit: KIND_UNIT[item.kind], costbookId: item.costbookId,
              createdAt: item.createdAt
            };
          })
        })
      }).then(function (updated) {
        state.record = updated;
        saveBtn.disabled = false;
        saveMsg.textContent = "Saved.";
        updatePushLabel();
        setTimeout(function () { if (saveMsg.textContent === "Saved.") saveMsg.textContent = ""; }, 2500);
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveMsg.textContent = "Save failed: " + err.message;
      });
    }

    /* canvas + items panel, side by side */
    var layout = APP.el('<div style="display:grid;grid-template-columns:minmax(0,2.1fr) minmax(280px,1fr);gap:0.8rem;align-items:start"></div>');
    container.appendChild(layout);

    var canvasCard = APP.el('<div class="card" style="padding:0.6rem">' +
      '<div data-f="wrap" style="overflow:auto;max-height:75vh;border:1px solid #eef2f6;border-radius:8px;background:#f5f7fa">' +
        '<div class="loading">Loading plan image</div>' +
      "</div>" +
    "</div>");
    layout.appendChild(canvasCard);
    var wrap = canvasCard.querySelector('[data-f="wrap"]');

    var panelCard = APP.el('<div class="card">' +
      '<h2>Items</h2>' +
      '<datalist id="tkBookList"></datalist>' +
      '<div data-f="rows" style="display:grid;gap:0.5rem"></div>' +
      '<div class="footline" data-f="empty" style="display:none">No measurements yet — pick a tool above and click the plan.</div>' +
      '<div style="border-top:1px solid #eef2f6;margin-top:0.7rem;padding-top:0.7rem">' +
        '<div data-f="pushProject"></div>' +
        '<button class="btn primary" type="button" data-f="push" style="margin-top:0.5rem;width:100%">Push 0 items to project →</button>' +
        '<div class="footline" data-f="pushmsg" style="margin-top:0.35rem"></div>' +
      "</div>" +
    "</div>");
    layout.appendChild(panelCard);
    var rowsBox = panelCard.querySelector('[data-f="rows"]');
    var emptyMsg = panelCard.querySelector('[data-f="empty"]');
    var bookListEl = panelCard.querySelector("#tkBookList");
    var byBookLabel = {};

    getCostbook().then(function (book) {
      var items = book && Array.isArray(book.items) ? book.items : [];
      items.forEach(function (it) {
        var label = it.service + " — " + it.description;
        byBookLabel[label] = it;
        bookListEl.appendChild(APP.el('<option value="' + esc(label) + '"></option>'));
      });
    });

    /* push-to-project */
    var pushBtn = panelCard.querySelector('[data-f="push"]');
    var pushMsg = panelCard.querySelector('[data-f="pushmsg"]');
    var pushProjectSlot = panelCard.querySelector('[data-f="pushProject"]');

    function updatePushLabel() {
      pushBtn.textContent = "Push " + state.items.length + " item" + (state.items.length === 1 ? "" : "s") + " to project →";
      pushBtn.disabled = state.items.length === 0;
      pushProjectSlot.innerHTML = "";
      if (!state.record.projectId) {
        var chooser = APP.el('<div style="display:grid;gap:0.25rem">' +
          '<span ' + LABEL + ">This takeoff isn’t linked to a project yet</span>" +
          '<select ' + INPUT + ' data-f="projectPick"><option value="">Choose a project…</option></select>' +
        "</div>");
        pushProjectSlot.appendChild(chooser);
        getProjects().then(function (rows) {
          var select = chooser.querySelector('[data-f="projectPick"]');
          (rows || []).forEach(function (p) {
            select.appendChild(APP.el('<option value="' + esc(p.id) + '">' + esc(p.projectName) + "</option>"));
          });
        });
      }
    }
    updatePushLabel();

    pushBtn.addEventListener("click", function () {
      var picker = pushProjectSlot.querySelector('[data-f="projectPick"]');
      var chosenProjectId = picker ? picker.value : state.record.projectId;
      if (!chosenProjectId) { pushMsg.textContent = "Pick a project first."; return; }
      state.record.projectId = chosenProjectId;
      pushBtn.disabled = true;
      pushMsg.textContent = "Saving…";
      doSave().then(function () {
        pushMsg.textContent = "Pushing…";
        return APP.fetchJSON("/api/takeoff/" + encodeURIComponent(state.record.id) + "/push-to-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
      }).then(function (result) {
        pushBtn.disabled = false;
        pushMsg.textContent = "Pushed " + result.pushedCount + " item" + (result.pushedCount === 1 ? "" : "s") + " into the project’s costs.";
        APP.toast("Pushed to project");
        updatePushLabel();
      }).catch(function (err) {
        pushBtn.disabled = false;
        pushMsg.textContent = "Push failed: " + err.message;
      });
    });

    /* ── items panel rows ── */

    function selectItem(id) {
      state.selectedId = id;
      delSelBtn.disabled = !id;
      drawAll();
      drawPanel();
    }

    function deleteItem(id) {
      state.items = state.items.filter(function (i) { return i.id !== id; });
      if (state.selectedId === id) state.selectedId = null;
      delSelBtn.disabled = !state.selectedId;
      drawAll();
      drawPanel();
      updatePushLabel();
    }

    function drawPanel() {
      rowsBox.innerHTML = "";
      emptyMsg.style.display = state.items.length ? "none" : "block";
      state.items.forEach(function (item) {
        var value = itemValue(item, state.scale);
        var unit = itemUnitLabel(item, state.scale);
        var row = APP.el('<div style="border:1px solid ' + (item.id === state.selectedId ? "#2563eb" : "#eef2f6") +
          ';border-radius:8px;padding:0.5rem;display:grid;gap:0.35rem;cursor:pointer">' +
          '<div style="display:flex;justify-content:space-between;gap:0.4rem;align-items:center">' +
            '<span class="pill">' + esc(item.kind) + "</span>" +
            '<b style="font-size:0.86rem">' + esc(fmtValue(value, unit)) + "</b>" +
            '<button type="button" data-f="del" style="border:none;background:none;color:#98a2b3;cursor:pointer;font-size:0.9rem">✕</button>' +
          "</div>" +
          '<input ' + INPUT + ' data-f="label" placeholder="Label this measurement" value="' + esc(item.label) + '" />' +
          '<input ' + INPUT + ' data-f="book" list="tkBookList" placeholder="Tag a cost-book item (optional)" />' +
        "</div>");
        row.addEventListener("click", function (e) {
          if (e.target.closest("input, button")) return;
          selectItem(item.id);
        });
        row.querySelector('[data-f="del"]').addEventListener("click", function (e) {
          e.stopPropagation();
          deleteItem(item.id);
        });
        var labelInput = row.querySelector('[data-f="label"]');
        labelInput.addEventListener("blur", function () {
          item.label = labelInput.value.trim();
        });
        var bookInput = row.querySelector('[data-f="book"]');
        bookInput.addEventListener("change", function () {
          var match = byBookLabel[bookInput.value];
          item.costbookId = match ? match.id : "";
        });
        rowsBox.appendChild(row);
      });
    }
    drawPanel();

    /* ── canvas setup ── */

    if (!record.imageUrl) {
      wrap.innerHTML = "";
      wrap.appendChild(APP.el('<div class="empty" style="padding:2rem"><b>No plan image</b>This takeoff has no image attached.</div>'));
      return;
    }

    var img = new Image();
    state.img = img;
    img.onload = function () {
      wrap.innerHTML = "";
      var canvas = document.createElement("canvas");
      state.canvas = canvas;
      state.c2d = canvas.getContext("2d");
      wrap.appendChild(canvas);
      state.fitScale = Math.min(1, (wrap.clientWidth || 900) / img.naturalWidth);
      sizeCanvas();
      drawAll();

      canvas.addEventListener("click", function (e) { handleClick(canvasPoint(e)); });
      canvas.addEventListener("dblclick", function (e) {
        if (state.tool === "area") finishArea();
      });
    };
    img.onerror = function () {
      wrap.innerHTML = "";
      wrap.appendChild(APP.el('<div class="empty" style="padding:2rem"><b>Couldn’t load the plan image</b>' +
        esc(record.imageUrl) + "</div>"));
    };
    img.src = record.imageUrl;

    var zoomInput = toolbar.querySelector('[data-f="zoom"]');
    zoomInput.addEventListener("input", function () {
      state.zoom = Number(zoomInput.value) || 1;
      if (state.canvas) { sizeCanvas(); drawAll(); }
    });

    function sizeCanvas() {
      var s = state.fitScale * state.zoom;
      state.canvas.width = Math.max(1, Math.round(state.img.naturalWidth * s));
      state.canvas.height = Math.max(1, Math.round(state.img.naturalHeight * s));
    }

    function canvasPoint(e) {
      var rect = state.canvas.getBoundingClientRect();
      var s = state.fitScale * state.zoom;
      return [(e.clientX - rect.left) / s, (e.clientY - rect.top) / s];
    }

    function toCanvas(pt) {
      var s = state.fitScale * state.zoom;
      return [pt[0] * s, pt[1] * s];
    }

    function drawAll() {
      if (!state.c2d) return;
      var c = state.c2d;
      c.clearRect(0, 0, state.canvas.width, state.canvas.height);
      c.drawImage(state.img, 0, 0, state.canvas.width, state.canvas.height);

      state.items.forEach(function (item) { drawItem(c, item, item.id === state.selectedId); });

      if (state.pending) drawPending(c);
    }

    function drawItem(c, item, selected) {
      var color = selected ? "#b42318" : "#2563eb";
      if (item.kind === "line" && item.points.length === 2) {
        var p0 = toCanvas(item.points[0]), p1 = toCanvas(item.points[1]);
        c.strokeStyle = color; c.lineWidth = 3;
        c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
        [p0, p1].forEach(function (p) {
          c.fillStyle = color;
          c.beginPath(); c.arc(p[0], p[1], 4, 0, Math.PI * 2); c.fill();
        });
      } else if (item.kind === "area" && item.points.length >= 3) {
        var pts = item.points.map(toCanvas);
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(function (p) { c.lineTo(p[0], p[1]); });
        c.closePath();
        c.fillStyle = selected ? "rgba(180,35,24,0.18)" : "rgba(37,99,235,0.18)";
        c.fill();
        c.strokeStyle = color; c.lineWidth = 2; c.stroke();
      } else if (item.kind === "count") {
        item.points.forEach(function (pt, i) {
          var p = toCanvas(pt);
          c.fillStyle = color;
          c.beginPath(); c.arc(p[0], p[1], 11, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#fff";
          c.font = "bold 11px Inter, sans-serif";
          c.textAlign = "center"; c.textBaseline = "middle";
          c.fillText(String(i + 1), p[0], p[1] + 0.5);
        });
      }
    }

    function drawPending(c) {
      var p = state.pending;
      if (p.kind === "calibrate" || p.kind === "line") {
        p.points.forEach(function (pt) {
          var cp = toCanvas(pt);
          c.fillStyle = "#687587";
          c.beginPath(); c.arc(cp[0], cp[1], 5, 0, Math.PI * 2); c.fill();
        });
      } else if (p.kind === "area" && p.points.length) {
        var pts = p.points.map(toCanvas);
        c.strokeStyle = "#687587"; c.setLineDash([5, 4]); c.lineWidth = 2;
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(function (pp) { c.lineTo(pp[0], pp[1]); });
        c.stroke(); c.setLineDash([]);
        pts.forEach(function (cp) {
          c.fillStyle = "#687587";
          c.beginPath(); c.arc(cp[0], cp[1], 4, 0, Math.PI * 2); c.fill();
        });
      }
    }

    /* ── tool interactions ── */

    function handleClick(pt) {
      if (state.tool === "calibrate") handleCalibrateClick(pt);
      else if (state.tool === "line") handleLineClick(pt);
      else if (state.tool === "area") handleAreaClick(pt);
      else if (state.tool === "count") handleCountClick(pt);
      else handleSelectClick(pt);
    }

    function handleCalibrateClick(pt) {
      if (!state.pending) { state.pending = { kind: "calibrate", points: [pt] }; drawAll(); return; }
      state.pending.points.push(pt);
      var px = dist(state.pending.points[0], state.pending.points[1]);
      state.pending = null;
      var answer = window.prompt("Real-world distance between those two points, in feet:");
      var feet = Number(answer);
      if (answer !== null && feet > 0) {
        state.scale = { pixels: px, realFeet: feet };
        renderCalibPill();
        drawPanel();
        APP.toast("Calibrated — " + px.toFixed(1) + "px = " + feet + "ft");
        doSave();
      }
      setTool("select");
    }

    function handleLineClick(pt) {
      if (!state.pending) { state.pending = { kind: "line", points: [pt] }; drawAll(); return; }
      state.pending.points.push(pt);
      var count = state.items.filter(function (i) { return i.kind === "line"; }).length;
      var item = { id: genLocalId(), kind: "line", label: "Line " + (count + 1), points: state.pending.points, costbookId: "", createdAt: new Date().toISOString() };
      state.items.push(item);
      state.pending = null;
      state.selectedId = item.id;
      delSelBtn.disabled = false;
      drawAll(); drawPanel(); updatePushLabel();
      setTool("select");
    }

    function handleAreaClick(pt) {
      if (!state.pending) state.pending = { kind: "area", points: [] };
      state.pending.points.push(pt);
      drawAll();
    }

    function finishArea() {
      if (state.pending && state.pending.points.length >= 3) {
        var count = state.items.filter(function (i) { return i.kind === "area"; }).length;
        var item = { id: genLocalId(), kind: "area", label: "Area " + (count + 1), points: state.pending.points, costbookId: "", createdAt: new Date().toISOString() };
        state.items.push(item);
        state.selectedId = item.id;
        delSelBtn.disabled = false;
        drawPanel(); updatePushLabel();
      }
      state.pending = null;
      setTool("select");
    }

    function handleCountClick(pt) {
      if (!state.pending || state.pending.kind !== "count") {
        var count = state.items.filter(function (i) { return i.kind === "count"; }).length;
        var item = { id: genLocalId(), kind: "count", label: "Count " + (count + 1), points: [pt], costbookId: "", createdAt: new Date().toISOString() };
        state.items.push(item);
        state.pending = { kind: "count", itemId: item.id };
        state.selectedId = item.id;
        delSelBtn.disabled = false;
      } else {
        var active = state.items.filter(function (i) { return i.id === state.pending.itemId; })[0];
        if (active) active.points.push(pt);
      }
      drawAll(); drawPanel(); updatePushLabel();
    }

    function handleSelectClick(pt) {
      var threshold = 12 / (state.fitScale * state.zoom);
      var bestId = null, bestDist = threshold;
      state.items.forEach(function (item) {
        if (item.kind === "line" && item.points.length === 2) {
          var d = pointToSegmentDist(pt, item.points[0], item.points[1]);
          if (d < bestDist) { bestDist = d; bestId = item.id; }
        } else if (item.kind === "area" && item.points.length >= 3) {
          if (pointInPolygon(pt, item.points)) { bestDist = 0; bestId = item.id; }
          else {
            for (var i = 0; i < item.points.length; i++) {
              var a = item.points[i], b = item.points[(i + 1) % item.points.length];
              var d2 = pointToSegmentDist(pt, a, b);
              if (d2 < bestDist) { bestDist = d2; bestId = item.id; }
            }
          }
        } else if (item.kind === "count") {
          item.points.forEach(function (marker) {
            var d3 = dist(pt, marker);
            if (d3 < bestDist) { bestDist = d3; bestId = item.id; }
          });
        }
      });
      selectItem(bestId);
    }
  }

  /* ════════════════════ ROUTER ════════════════════ */

  APP.registerView("takeoff", {
    title: "Plan Takeoff",
    render: function (container, params) {
      if (params && params.id) renderEditor(container, params.id);
      else renderList(container);
    }
  });
})();
