/* app_gantt.js — dependency-free Gantt module for the Projects/Dashboard views.
   Does NOT register a view. Exposes window.GANTT with two entry points:

     GANTT.renderProjectSchedule(container, project, saveFn)
       - project  : an /api/actuals record (mutated in place after saves, same
                    pattern app_projects.js uses with putProject()).
       - saveFn   : function(patch) -> Promise. patch is {schedule:[...]} or
                    {startDate,targetDate}. PUT /api/actuals/:id is merge-safe,
                    so callers typically pass:
                    function (patch) { return putProject(record, patch); }

     GANTT.renderPortfolio(container, projects)
       - projects : the raw /api/actuals array (dashboard already has it, or
                    fetch it fresh).

   Vanilla JS only. Uses the shell's .card/.pill/.btn/.empty classes for
   chrome and inline styles for all chart geometry (bars, ticks, today line).
   All user data passes through APP.esc. */
(function () {
  "use strict";

  var KIND_META = {
    phase: { color: "#2563eb", label: "Phase" },
    inspection: { color: "#b45309", label: "Inspection" },
    material: { color: "#7c3aed", label: "Material" },
    milestone: { color: "#0f766e", label: "Milestone" }
  };
  var KIND_ORDER = ["phase", "inspection", "material", "milestone"];

  var QUICK_ADD = [
    { label: "Rough inspection", kind: "inspection" },
    { label: "Final inspection", kind: "inspection" },
    { label: "Materials delivery", kind: "material" },
    { label: "Demo", kind: "phase" },
    { label: "Rough-in", kind: "phase" },
    { label: "Finishes", kind: "phase" }
  ];

  var SCHED_LABEL_W = 190; // px — schedule editor label column
  var PORT_LABEL_W = 220;  // px — portfolio label column

  var INPUT_ATTR = 'style="font:inherit;font-size:0.82rem;min-height:32px;border:1px solid #d8dee8;' +
    'border-radius:7px;padding:0.2rem 0.5rem;background:#fff;color:#172033;width:100%"';
  var LABEL_ATTR = 'style="font-size:0.66rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#667085"';

  function esc(v) { return APP.esc(v); }

  function uid() {
    return "sch_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- date helpers (local-day anchored, no TZ drift) ---------- */

  function parseDate(s) {
    if (!s || typeof s !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  function toISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function dayDiff(a, b) { return Math.round((b - a) / 86400000); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function todayDate() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function fmtShort(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function fmtMonth(d) {
    var s = d.toLocaleDateString("en-US", { month: "short" });
    return d.getMonth() === 0 ? s + " '" + String(d.getFullYear()).slice(2) : s;
  }

  function pct(d, domStart, domEnd) {
    var total = Math.max(1, dayDiff(domStart, domEnd));
    return clamp(dayDiff(domStart, d) / total * 100, 0, 100);
  }

  function field(labelText, inputHtml) {
    return '<div style="display:grid;gap:0.2rem;flex:1 1 150px;min-width:0"><label ' + LABEL_ATTR + ">" +
      esc(labelText) + "</label>" + inputHtml + "</div>";
  }
  function fieldSm(labelText, inputHtml) {
    return '<div style="display:grid;gap:0.2rem;flex:0 1 130px;min-width:0"><label ' + LABEL_ATTR + ">" +
      esc(labelText) + "</label>" + inputHtml + "</div>";
  }

  function kindDot(kind) {
    var meta = KIND_META[kind] || KIND_META.phase;
    return '<span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:' +
      meta.color + ';margin-right:5px;flex-shrink:0"></span>';
  }

  /* ================================================================== */
  /* 1) Per-project schedule editor + Gantt                              */
  /* ================================================================== */

  function scheduleDomain(project) {
    var dates = [];
    var start = parseDate(project.startDate);
    var target = parseDate(project.targetDate);
    if (start) dates.push(start);
    if (target) dates.push(target);
    (project.schedule || []).forEach(function (it) {
      var s = parseDate(it.start);
      if (!s) return;
      var e = parseDate(it.end) || s;
      dates.push(s);
      dates.push(e < s ? s : e);
    });
    if (!dates.length) return null;
    var min = dates[0], max = dates[0];
    dates.forEach(function (d) { if (d < min) min = d; if (d > max) max = d; });
    if (dayDiff(min, max) < 1) max = addDays(min, 1);
    return { start: addDays(min, -1), end: addDays(max, 1) };
  }

  function weeklyTicks(domStart, domEnd) {
    var totalDays = Math.max(1, dayDiff(domStart, domEnd));
    var targetTicks = 8;
    var stepDays = Math.max(7, Math.round(totalDays / targetTicks / 7) * 7);
    var ticks = [];
    var d = new Date(domStart);
    var guard = 0;
    while (d <= domEnd && guard < 60) {
      ticks.push({ pct: pct(d, domStart, domEnd), label: fmtShort(d) });
      d = addDays(d, stepDays);
      guard++;
    }
    return ticks;
  }

  function sortedSchedule(schedule) {
    return (schedule || []).slice().sort(function (a, b) {
      var da = parseDate(a.start);
      var db = parseDate(b.start);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  }

  function scheduleDurationPill(project) {
    var start = parseDate(project.startDate);
    var target = parseDate(project.targetDate);
    var completed = project.status === "completed";
    if (completed) {
      var tot = start && target ? dayDiff(start, target) : null;
      return { cls: "green", text: "Completed" + (tot !== null ? " · " + tot + " day" + (tot === 1 ? "" : "s") : "") };
    }
    if (start && target) {
      var totalDays = dayDiff(start, target);
      var daysLeft = dayDiff(todayDate(), target);
      var pastDue = daysLeft < 0;
      var text = totalDays + " day" + (totalDays === 1 ? "" : "s") + " total · " +
        (pastDue ? Math.abs(daysLeft) + " day" + (Math.abs(daysLeft) === 1 ? "" : "s") + " overdue"
                 : daysLeft + " day" + (daysLeft === 1 ? "" : "s") + " left");
      return { cls: pastDue ? "red" : (daysLeft <= 14 ? "amber" : ""), text: text };
    }
    if (start) return { cls: "", text: "Started " + fmtShort(start) };
    if (target) {
      var left = dayDiff(todayDate(), target);
      return { cls: left < 0 ? "red" : (left <= 14 ? "amber" : ""), text: "Due " + fmtShort(target) };
    }
    return { cls: "", text: "No dates set" };
  }

  function buildBarHtml(item) {
    // caller wraps this in an absolutely-positioned host already sized/placed;
    // this just returns the visual fill (kept separate so milestones can render
    // as a diamond instead of a bar without changing the host's positioning code).
    var meta = KIND_META[item.kind] || KIND_META.phase;
    var opacity = item.done ? "0.55" : "1";
    if (item.kind === "milestone") {
      return '<div style="position:absolute;top:50%;left:0;width:11px;height:11px;background:' + meta.color +
        ';opacity:' + opacity + ';transform:translate(-50%,-50%) rotate(45deg);border-radius:2px"></div>' +
        (item.done ? '<div style="position:absolute;top:50%;left:0;transform:translate(-50%,-56%);font-size:8px;' +
          'color:#fff;font-weight:900;pointer-events:none;z-index:1">✓</div>' : "");
    }
    return '<div style="position:absolute;top:3px;bottom:3px;left:0;right:0;min-width:8px;background:' + meta.color +
      ';opacity:' + opacity + ';border-radius:4px;display:flex;align-items:center;justify-content:flex-end;' +
      'padding:0 4px;overflow:hidden">' +
      (item.done ? '<span style="color:#fff;font-size:9px;font-weight:900">✓</span>' : "") +
      "</div>";
  }

  function renderProjectSchedule(container, project, saveFn) {
    var state = { editingId: null, adding: false, draft: null };

    function save(patch, onOk) {
      Promise.resolve(saveFn(patch)).then(function () {
        Object.keys(patch).forEach(function (k) { project[k] = patch[k]; });
        if (onOk) onOk();
        paint();
      }).catch(function (err) {
        APP.toast("Save failed: " + (err && err.message ? err.message : "unknown error"));
      });
    }

    function paint() {
      var schedule = Array.isArray(project.schedule) ? project.schedule : [];
      var pill = scheduleDurationPill(project);

      var html = '<div class="card">' +
        "<h2>Schedule</h2>" +
        '<div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-end;margin-bottom:0.9rem">' +
          fieldSm("Start date", '<input type="date" data-f="startDate" value="' + esc(project.startDate || "") + '" ' + INPUT_ATTR + ">") +
          fieldSm("Target completion", '<input type="date" data-f="targetDate" value="' + esc(project.targetDate || "") + '" ' + INPUT_ATTR + ">") +
          '<div style="margin-left:auto"><span class="pill' + (pill.cls ? " " + pill.cls : "") + '">' + esc(pill.text) + "</span></div>" +
        "</div>";

      if (!schedule.length) {
        html += '<div class="empty"><b>Map the job: phases, inspections, deliveries.</b>' +
          "No schedule items yet.</div>" +
          buildAddFormHtml(state) +
          "</div>";
        container.innerHTML = html;
        wire();
        return;
      }

      var domain = scheduleDomain(project);
      var rows = sortedSchedule(schedule);

      html += '<div style="position:relative;margin:0.4rem 0 0.9rem">';

      if (domain) {
        var ticks = weeklyTicks(domain.start, domain.end);
        html += '<div style="display:flex;gap:0.6rem;align-items:flex-end;margin-bottom:0.3rem">' +
          '<div style="flex:0 0 ' + SCHED_LABEL_W + 'px"></div>' +
          '<div style="position:relative;flex:1 1 auto;height:14px">' +
          ticks.map(function (t) {
            return '<span style="position:absolute;left:' + t.pct + '%;transform:translateX(-50%);' +
              'font-size:0.66rem;color:#667085;white-space:nowrap">' + esc(t.label) + "</span>";
          }).join("") +
          "</div></div>";
      }

      html += '<div style="display:flex;flex-direction:column;gap:2px">';
      rows.forEach(function (item) {
        if (state.editingId === item.id) {
          html += buildEditRowHtml(item);
        } else {
          html += buildDisplayRowHtml(item, domain);
        }
      });
      html += "</div>";

      if (domain) {
        var todayPct = pct(clamp2(todayDate(), domain.start, domain.end), domain.start, domain.end);
        html += '<div style="position:absolute;top:0;bottom:0;left:calc(' + SCHED_LABEL_W + 'px + (100% - ' +
          SCHED_LABEL_W + 'px) * ' + (todayPct / 100) + ');border-left:2px solid #b42318;pointer-events:none" title="Today"></div>';
      }

      html += "</div>"; // chart wrapper
      html += buildAddFormHtml(state);
      html += "</div>"; // card

      container.innerHTML = html;
      wire();
    }

    function clamp2(d, lo, hi) { return d < lo ? lo : (d > hi ? hi : d); }

    function buildDisplayRowHtml(item, domain) {
      var meta = KIND_META[item.kind] || KIND_META.phase;
      var s = parseDate(item.start);
      var barHtml;
      if (!domain || !s) {
        barHtml = '<div class="muted" style="font-size:0.72rem;padding:0 6px">no date</div>';
      } else {
        var e = parseDate(item.end) || s;
        if (e < s) e = s;
        var leftPct = pct(s, domain.start, domain.end);
        var rightPct = pct(e, domain.start, domain.end);
        var widthPct = Math.max(rightPct - leftPct, 0);
        barHtml = '<div style="position:absolute;top:0;bottom:0;left:' + leftPct + '%;width:' + widthPct +
          '%;min-width:1px">' + buildBarHtml(item) + "</div>";
      }
      return '<div style="display:flex;gap:0.6rem;align-items:center;padding:3px 0;cursor:pointer" ' +
        'data-role="row" data-id="' + esc(item.id) + '" title="Click to edit">' +
        '<div style="flex:0 0 ' + SCHED_LABEL_W + 'px;min-width:0;overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;font-size:0.8rem;font-weight:700;color:' + (item.done ? "#667085" : "#172033") +
        '" title="' + esc(item.label) + " (" + esc(meta.label) + ')">' +
        kindDot(item.kind) + (item.done ? "✓ " : "") + esc(item.label) + "</div>" +
        '<div style="position:relative;flex:1 1 auto;height:22px;background:#f5f7fa;border-radius:5px">' +
        barHtml + "</div></div>";
    }

    function buildEditRowHtml(item) {
      var kindOptions = KIND_ORDER.map(function (k) {
        return '<option value="' + k + '"' + (item.kind === k ? " selected" : "") + ">" + esc(KIND_META[k].label) + "</option>";
      }).join("");
      return '<form data-role="editform" data-id="' + esc(item.id) + '" style="border:1px solid #d8dee8;' +
        'border-radius:8px;padding:0.6rem;margin:2px 0;background:#f7f9fc;display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end">' +
        field("Label", '<input type="text" data-f="label" value="' + esc(item.label || "") + '" ' + INPUT_ATTR + " required>") +
        fieldSm("Kind", '<select data-f="kind" ' + INPUT_ATTR + ">" + kindOptions + "</select>") +
        fieldSm("Start", '<input type="date" data-f="start" value="' + esc(item.start || "") + '" ' + INPUT_ATTR + " required>") +
        fieldSm("End", '<input type="date" data-f="end" value="' + esc(item.end || "") + '" ' + INPUT_ATTR + ">") +
        '<label style="display:flex;align-items:center;gap:0.3rem;font-size:0.78rem;font-weight:700;color:#3c4658;height:32px">' +
        '<input type="checkbox" data-f="done"' + (item.done ? " checked" : "") + "> Done</label>" +
        '<div style="display:flex;gap:0.4rem">' +
        '<button type="submit" class="btn primary" style="height:32px">Save</button>' +
        '<button type="button" class="btn" data-role="canceledit" style="height:32px">Cancel</button>' +
        '<button type="button" class="btn" data-role="delete" style="height:32px;color:#b42318">Delete</button>' +
        "</div></form>";
    }

    function buildAddFormHtml(st) {
      if (!st.adding) {
        return '<div style="margin-top:0.7rem"><button type="button" class="btn primary" data-role="openadd">+ Add item</button></div>';
      }
      var draft = st.draft || {};
      var quickBtns = QUICK_ADD.map(function (q, i) {
        return '<button type="button" class="btn" data-quick="' + i + '" style="font-size:0.72rem;padding:0 0.6rem;height:28px">' +
          esc(q.label) + "</button>";
      }).join("");
      var kindOptions = KIND_ORDER.map(function (k) {
        return '<option value="' + k + '"' + (draft.kind === k ? " selected" : "") + ">" + esc(KIND_META[k].label) + "</option>";
      }).join("");
      return '<div style="margin-top:0.8rem;border-top:1px solid #e4e8ef;padding-top:0.7rem">' +
        '<div class="muted" style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem">Quick add</div>' +
        '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.6rem">' + quickBtns + "</div>" +
        '<form data-role="addform" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end">' +
        field("Label", '<input type="text" data-f="label" value="' + esc(draft.label || "") + '" placeholder="e.g. Rough-in" ' + INPUT_ATTR + " required>") +
        fieldSm("Kind", '<select data-f="kind" ' + INPUT_ATTR + ">" + kindOptions + "</select>") +
        fieldSm("Start", '<input type="date" data-f="start" value="' + esc(draft.start || "") + '" ' + INPUT_ATTR + " required>") +
        fieldSm("End (defaults to start)", '<input type="date" data-f="end" value="' + esc(draft.end || "") + '" ' + INPUT_ATTR + ">") +
        '<button type="submit" class="btn primary" style="height:34px">Add</button>' +
        '<button type="button" class="btn" data-role="canceladd" style="height:34px">Cancel</button>' +
        "</form></div>";
    }

    function wire() {
      var startInput = container.querySelector('[data-f="startDate"]');
      if (startInput) startInput.addEventListener("change", function () { save({ startDate: startInput.value || "" }); });
      var targetInput = container.querySelector('[data-f="targetDate"]');
      if (targetInput) targetInput.addEventListener("change", function () { save({ targetDate: targetInput.value || "" }); });

      var openAddBtn = container.querySelector('[data-role="openadd"]');
      if (openAddBtn) openAddBtn.addEventListener("click", function () {
        state.adding = true;
        state.draft = { start: toISO(todayDate()) };
        paint();
      });
      var cancelAddBtn = container.querySelector('[data-role="canceladd"]');
      if (cancelAddBtn) cancelAddBtn.addEventListener("click", function () {
        state.adding = false; state.draft = null; paint();
      });
      Array.prototype.forEach.call(container.querySelectorAll("[data-quick]"), function (btn) {
        btn.addEventListener("click", function () {
          var q = QUICK_ADD[Number(btn.getAttribute("data-quick"))];
          state.adding = true;
          state.draft = { label: q.label, kind: q.kind, start: toISO(todayDate()) };
          paint();
        });
      });
      var addForm = container.querySelector('[data-role="addform"]');
      if (addForm) {
        var addStart = addForm.querySelector('[data-f="start"]');
        var addEnd = addForm.querySelector('[data-f="end"]');
        if (addStart && addEnd) {
          addStart.addEventListener("change", function () {
            if (!addEnd.value) addEnd.value = addStart.value;
          });
        }
        addForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var label = addForm.querySelector('[data-f="label"]').value.trim();
          var kind = addForm.querySelector('[data-f="kind"]').value;
          var start = addForm.querySelector('[data-f="start"]').value;
          var end = addForm.querySelector('[data-f="end"]').value || start;
          if (!label || !parseDate(start)) { APP.toast("Enter a label and a valid start date"); return; }
          if (KIND_ORDER.indexOf(kind) === -1) kind = "phase";
          var newItem = { id: uid(), label: label, kind: kind, start: start, end: end || start, done: false };
          var next = (Array.isArray(project.schedule) ? project.schedule : []).concat([newItem]);
          save({ schedule: next }, function () { state.adding = false; state.draft = null; });
        });
      }

      Array.prototype.forEach.call(container.querySelectorAll('[data-role="row"]'), function (rowEl) {
        rowEl.addEventListener("click", function () {
          state.editingId = rowEl.getAttribute("data-id");
          paint();
        });
      });

      var editForm = container.querySelector('[data-role="editform"]');
      if (editForm) {
        editForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var id = editForm.getAttribute("data-id");
          var label = editForm.querySelector('[data-f="label"]').value.trim();
          var kind = editForm.querySelector('[data-f="kind"]').value;
          var start = editForm.querySelector('[data-f="start"]').value;
          var end = editForm.querySelector('[data-f="end"]').value || start;
          var done = editForm.querySelector('[data-f="done"]').checked;
          if (!label || !parseDate(start)) { APP.toast("Enter a label and a valid start date"); return; }
          if (KIND_ORDER.indexOf(kind) === -1) kind = "phase";
          var next = (project.schedule || []).map(function (it) {
            if (it.id !== id) return it;
            return { id: id, label: label, kind: kind, start: start, end: end || start, done: done };
          });
          save({ schedule: next }, function () { state.editingId = null; });
        });
        var cancelEditBtn = editForm.querySelector('[data-role="canceledit"]');
        if (cancelEditBtn) cancelEditBtn.addEventListener("click", function (e) {
          e.preventDefault(); state.editingId = null; paint();
        });
        var delBtn = editForm.querySelector('[data-role="delete"]');
        if (delBtn) delBtn.addEventListener("click", function (e) {
          e.preventDefault();
          var id = editForm.getAttribute("data-id");
          if (!window.confirm("Delete this schedule item?")) return;
          var next = (project.schedule || []).filter(function (it) { return it.id !== id; });
          save({ schedule: next }, function () { state.editingId = null; });
        });
      }
    }

    paint();
  }

  /* ================================================================== */
  /* 2) Dashboard portfolio chart                                        */
  /* ================================================================== */

  function minOfDates(arr) { var m = arr[0]; arr.forEach(function (d) { if (d < m) m = d; }); return m; }
  function maxOfDates(arr) { var m = arr[0]; arr.forEach(function (d) { if (d > m) m = d; }); return m; }

  function buildPortfolioRow(project) {
    var status = String(project.status || "active");
    if (status !== "active" && status !== "on_hold") return null;

    var start = parseDate(project.startDate);
    var target = parseDate(project.targetDate);
    var schedule = Array.isArray(project.schedule) ? project.schedule : [];
    var schedDates = [];
    schedule.forEach(function (it) {
      var s = parseDate(it.start);
      if (!s) return;
      var e = parseDate(it.end) || s;
      schedDates.push(s);
      schedDates.push(e < s ? s : e);
    });

    if (!start && !target && !schedDates.length) return null; // nothing to show

    var barStart = start || (schedDates.length ? minOfDates(schedDates) : target);
    var barEnd = target || (schedDates.length ? maxOfDates(schedDates) : start);
    if (!barStart) barStart = barEnd;
    if (!barEnd) barEnd = barStart;
    if (!barStart || !barEnd) return null;
    if (barEnd < barStart) barEnd = barStart;

    return {
      id: project.id,
      name: project.projectName || "Untitled project",
      status: status,
      start: start,
      target: target,
      barStart: barStart,
      barEnd: barEnd,
      milestones: schedule.filter(function (it) {
        return (it.kind === "milestone" || it.kind === "inspection") && parseDate(it.start);
      })
    };
  }

  function rowColor(row) {
    if (!row.target) return "#2563eb";
    var d = dayDiff(todayDate(), row.target);
    if (d < 0) return "#b42318";
    if (d <= 14) return "#b45309";
    return "#2563eb";
  }

  function durationLabel(row) {
    if (row.start && row.target) {
      var d = Math.max(dayDiff(row.start, row.target), 0);
      return d + " day" + (d === 1 ? "" : "s");
    }
    if (row.start) return "Starts " + fmtShort(row.start);
    if (row.target) return "Due " + fmtShort(row.target);
    return "Scheduled";
  }

  function monthTicks(domStart, domEnd) {
    var totalDays = Math.max(1, dayDiff(domStart, domEnd));
    var ticks = [];
    var d = new Date(domStart.getFullYear(), domStart.getMonth(), 1);
    var guard = 0;
    while (d <= domEnd && guard < 36) {
      var p = dayDiff(domStart, d) / totalDays * 100;
      if (p >= -1) ticks.push({ pct: clamp(p, 0, 100), label: fmtMonth(d) });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      guard++;
    }
    return ticks;
  }

  function renderPortfolio(container, projects) {
    var rows = (projects || []).map(buildPortfolioRow).filter(Boolean);

    if (!rows.length) {
      container.innerHTML = '<div class="card"><h2>Jobs timeline</h2>' +
        '<div class="empty"><b>No scheduled jobs yet</b>set start/target dates on a project.</div></div>';
      return;
    }

    var minD = rows[0].barStart, maxD = rows[0].barEnd;
    rows.forEach(function (r) {
      if (r.barStart < minD) minD = r.barStart;
      if (r.barEnd > maxD) maxD = r.barEnd;
    });
    var domStart = addDays(minD, -7);
    var domEnd = addDays(maxD, 7);
    var todayPct = pct(todayDate(), domStart, domEnd);
    var ticks = monthTicks(domStart, domEnd);

    var html = '<div class="card"><h2>Jobs timeline</h2>' +
      '<div style="position:relative;margin-top:0.3rem">' +
      '<div style="display:flex;gap:0.6rem;align-items:flex-end;margin-bottom:0.3rem">' +
      '<div style="flex:0 0 ' + PORT_LABEL_W + 'px"></div>' +
      '<div style="position:relative;flex:1 1 auto;height:14px">' +
      ticks.map(function (t) {
        return '<span style="position:absolute;left:' + t.pct + '%;transform:translateX(-50%);' +
          'font-size:0.66rem;color:#667085;white-space:nowrap">' + esc(t.label) + "</span>";
      }).join("") +
      "</div></div>";

    html += '<div style="display:flex;flex-direction:column;gap:3px">';
    rows.forEach(function (row) {
      var leftPct = pct(row.barStart, domStart, domEnd);
      var rightPct = pct(row.barEnd, domStart, domEnd);
      var widthPct = Math.max(rightPct - leftPct, 0);
      var color = rowColor(row);
      var dots = row.milestones.map(function (m) {
        var s = parseDate(m.start);
        var mpct = pct(s, domStart, domEnd);
        var relPct = widthPct > 0 ? clamp((mpct - leftPct) / widthPct * 100, 0, 100) : 0;
        return '<span style="position:absolute;top:50%;left:' + relPct + '%;width:5px;height:5px;' +
          "border-radius:999px;background:#fff;border:1.5px solid " + color +
          ';transform:translate(-50%,-50%)" title="' + esc(m.label || "") + '"></span>';
      }).join("");

      html += '<div style="display:flex;gap:0.6rem;align-items:center;padding:4px 0">' +
        '<div style="flex:0 0 ' + PORT_LABEL_W + 'px;min-width:0">' +
        '<a href="#/projects/' + esc(row.id) + '" style="font-size:0.82rem;font-weight:800;text-decoration:none;' +
        "color:#172033;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">" + esc(row.name) + "</a>" +
        '<div class="muted" style="font-size:0.7rem">' + esc(durationLabel(row)) + "</div>" +
        "</div>" +
        '<div style="position:relative;flex:1 1 auto;height:18px;background:#f5f7fa;border-radius:5px">' +
        '<div style="position:absolute;top:2px;bottom:2px;left:' + leftPct + '%;width:' + widthPct +
        "%;min-width:6px;background:" + color + ';border-radius:4px">' + dots + "</div>" +
        "</div></div>";
    });
    html += "</div>";

    html += '<div style="position:absolute;top:0;bottom:0;left:calc(' + PORT_LABEL_W + 'px + (100% - ' +
      PORT_LABEL_W + 'px) * ' + (todayPct / 100) + ');border-left:2px solid #b42318;pointer-events:none" title="Today"></div>';

    html += "</div></div>"; // chart wrapper, card

    container.innerHTML = html;
  }

  window.GANTT = {
    renderProjectSchedule: renderProjectSchedule,
    renderPortfolio: renderPortfolio
  };
})();
