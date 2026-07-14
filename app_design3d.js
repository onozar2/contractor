/* Design view (#/design) — photo-in, chat-out, photorealistic redesign.
   Ori's brief: no sliders, no finish pickers, no 3D scene, no template feel.
   The customer's real room photo is the hero; Ori tells a chatbot in plain
   speech what he wants; the chat composes a structure-preserving render prompt
   (via POST /api/knowledge/design-brief, haiku); "Generate here" runs the
   existing /api/knowledge/redesign edit (graceful quota-blocked bridge to
   Gemini) and "Open in Gemini (free)" hands the same prompt off. Finished
   before/after pairs save to the photo feed and show in a history strip.
   Registers view #/design. Uses only the shell's APP helpers + CSS system.
   (Filename kept — server.js already serves it and the nav points #/design.) */
(function () {
  "use strict";

  var RENDER_TAIL = "Photorealistic, consistent shadows and lighting direction, professionally staged, decluttered.";

  // ── View state (one flow at a time; reset on every render()) ──
  var st = null;
  function freshState() {
    return {
      photoFile: null,        // File the customer photographed / chose
      photoUrl: null,         // object URL for the hero preview
      messages: [],           // [{role:'user'|'assistant', text}]
      renderPrompt: "",       // latest composed instruction (chat source of truth)
      chatBusy: false,
      genAfterUrl: null,      // /uploads path when the API render succeeds
      attachFile: null,       // the Gemini render the user attaches back
      attachUrl: null,
      projectId: "design-studio",
      projectName: "Design Studio",
      projects: [],           // [{projectId, projectName}] for the picker
      _onPaste: null
    };
  }

  function slugify(v) {
    return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function composeFallbackPrompt() {
    var changes = st.messages.filter(function (m) { return m.role === "user"; })
      .map(function (m) { return m.text; }).filter(Boolean);
    var changeText = changes.length ? changes.join(", ") : "the requested finishes and styling";
    return "Redesign this room. STRUCTURE-PRESERVING edit: keep the exact camera angle, room layout, window/door positions and perspective lines; " +
      "change only " + changeText + ". " + RENDER_TAIL;
  }

  /* ============================ CSS ============================ */

  var CSS =
    "#dz{max-width:1120px;margin:0 auto}" +
    "#dzTop{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:1.1rem;align-items:start}" +
    // Photo hero / dropzone
    "#dzPhoto{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#0d1117;min-height:340px;display:flex}" +
    "#dzDrop{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.6rem;text-align:center;padding:2rem 1.4rem;cursor:pointer;background:linear-gradient(160deg,#f7f9fc,#eef2f7);color:#3c4658;border:2px dashed transparent;transition:background 0.15s}" +
    "#dzDrop.drag{background:linear-gradient(160deg,#eaf1fe,#dce9fd);border-color:var(--blue)}" +
    "#dzDrop .big{font-size:2.1rem;line-height:1}" +
    "#dzDrop .t1{font-weight:900;font-size:1.05rem;color:#1d2634}" +
    "#dzDrop .t2{font-size:0.82rem;color:var(--muted);max-width:22rem}" +
    "#dzPhoto img.hero{width:100%;height:auto;display:block;object-fit:contain;max-height:64vh;background:#0d1117}" +
    "#dzReplace{position:absolute;top:0.6rem;right:0.6rem;z-index:2}" +
    // Chat
    "#dzChat{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:14px;background:var(--paper,#fff);overflow:hidden;min-height:340px}" +
    "#dzChatHead{padding:0.7rem 0.9rem;border-bottom:1px solid var(--line);font-weight:900;font-size:0.9rem;color:#1d2634;display:flex;align-items:center;gap:0.4rem}" +
    "#dzThread{flex:1;overflow-y:auto;padding:0.9rem;display:flex;flex-direction:column;gap:0.55rem;max-height:52vh}" +
    ".dz-msg{max-width:85%;padding:0.5rem 0.75rem;border-radius:14px;font-size:0.9rem;line-height:1.42;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".dz-msg.user{align-self:flex-end;background:var(--blue);color:#fff;border-bottom-right-radius:5px}" +
    ".dz-msg.bot{align-self:flex-start;background:#eef1f6;color:#26303f;border-bottom-left-radius:5px}" +
    ".dz-msg.hint{align-self:stretch;max-width:100%;background:transparent;color:var(--muted);font-size:0.82rem;text-align:center;padding:0.3rem}" +
    ".dz-typing{align-self:flex-start;display:inline-flex;gap:0.22rem;padding:0.6rem 0.8rem;background:#eef1f6;border-radius:14px}" +
    ".dz-typing i{width:6px;height:6px;border-radius:50%;background:#9aa4b2;display:inline-block;animation:dzb 1s infinite}" +
    ".dz-typing i:nth-child(2){animation-delay:0.15s}.dz-typing i:nth-child(3){animation-delay:0.3s}" +
    "@keyframes dzb{0%,60%,100%{opacity:0.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}" +
    "#dzInputRow{display:flex;gap:0.5rem;padding:0.7rem;border-top:1px solid var(--line)}" +
    "#dzInput{flex:1;min-width:0;min-height:40px;max-height:120px;resize:none;border:1px solid #d8dee8;border-radius:10px;padding:0.55rem 0.7rem;font:inherit;background:#f5f7fa;line-height:1.4}" +
    "#dzSend{align-self:flex-end}" +
    // Render prompt panel
    "#dzPromptCard{margin-top:1.1rem}" +
    "#dzPromptCard .dz-lbl{font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.4rem}" +
    "#dzPrompt{width:100%;min-height:84px;resize:vertical;border:1px solid #e2e7ee;border-radius:10px;padding:0.6rem 0.75rem;font:inherit;font-size:0.86rem;line-height:1.5;color:#3c4658;background:#f8fafc}" +
    // Action bar (sticky)
    "#dzBar{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:0.55rem;align-items:center;margin-top:0.9rem;padding:0.7rem;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);box-shadow:0 -6px 20px rgba(16,24,40,0.06)}" +
    "#dzBar .grow{flex:1;min-width:0}" +
    "#dzBar .note{font-size:0.74rem;color:var(--muted)}" +
    // Result + attach
    "#dzResult{margin-top:1.1rem}" +
    ".dz-ba{display:grid;grid-template-columns:1fr 1fr;gap:0.7rem}" +
    ".dz-ba figure{position:relative;margin:0}" +
    ".dz-ba img{width:100%;border-radius:10px;display:block;background:#f0f2f5}" +
    ".dz-ba .lab{position:absolute;top:0.5rem;left:0.5rem;background:rgba(16,24,40,0.78);color:#fff;font-size:0.64rem;font-weight:850;text-transform:uppercase;letter-spacing:0.07em;padding:0.12rem 0.5rem;border-radius:999px}" +
    ".dz-ba .lab.after{background:var(--blue)}" +
    ".dz-calm{background:#f4f8ff;border:1px solid #cfe0fb;border-radius:10px;padding:0.7rem 0.85rem;color:#2b4a7a;font-size:0.86rem;line-height:1.5}" +
    "#dzAttachZone{border:2px dashed #c7d0dc;border-radius:10px;padding:1.1rem;text-align:center;cursor:pointer;color:var(--muted);font-size:0.85rem;background:#f8fafc;display:block}" +
    "#dzAttachZone.drag{border-color:var(--blue);background:#eef4fe}" +
    // History
    "#dzHistory{margin-top:1.3rem}" +
    ".dz-hstrip{display:flex;gap:0.7rem;overflow-x:auto;padding-bottom:0.4rem}" +
    ".dz-hcard{flex:0 0 auto;width:210px;border:1px solid var(--line);border-radius:10px;overflow:hidden;cursor:pointer;background:#fff;transition:box-shadow 0.15s}" +
    ".dz-hcard:hover{box-shadow:0 8px 22px rgba(16,24,40,0.1)}" +
    ".dz-hcard .pair{display:grid;grid-template-columns:1fr 1fr}" +
    ".dz-hcard .pair img{width:100%;height:96px;object-fit:cover;display:block;background:#f0f2f5}" +
    ".dz-hcard .cap{padding:0.4rem 0.55rem;font-size:0.76rem;color:#3c4658;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".dz-proj{display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap}" +
    ".dz-proj select{min-height:34px;border:1px solid #d8dee8;border-radius:8px;padding:0 0.5rem;font:inherit;background:#f5f7fa;max-width:100%}" +
    // Drawer viewer
    ".dz-viewer img{width:100%;border-radius:10px;display:block;margin-bottom:0.7rem;background:#f0f2f5}" +
    "@media (max-width: 820px){#dzTop{grid-template-columns:1fr}#dzChat{order:2}#dzPhoto{order:1;min-height:0}#dzThread{max-height:44vh}}";

  /* ============================ RENDER ============================ */

  function render(container) {
    st = freshState();
    if (!document.getElementById("dzCss")) {
      var style = document.createElement("style");
      style.id = "dzCss"; style.textContent = CSS;
      document.head.appendChild(style);
    }

    container.innerHTML =
      '<div id="dz">' +
        '<div class="viewhead"><h1>🎨 Design <span class="muted" style="font-weight:700;font-size:0.85rem">— photograph the room, describe the look, get a photoreal redesign</span></h1></div>' +
        '<div id="dzTop">' +
          '<div id="dzPhoto">' +
            '<div id="dzReplace" style="display:none"><button class="btn" id="dzReplaceBtn" type="button">↻ New photo</button></div>' +
            '<label id="dzDrop" for="dzFile">' +
              '<span class="big">📷</span>' +
              '<span class="t1">Take or drop a photo of the room</span>' +
              '<span class="t2">Tap to open the camera on your phone, or drop / paste a photo here. This exact room gets redesigned — nothing moves.</span>' +
            '</label>' +
            '<input type="file" id="dzFile" accept="image/*" capture="environment" style="display:none" />' +
          '</div>' +
          '<div id="dzChat">' +
            '<div id="dzChatHead">💬 Tell me the look you want</div>' +
            '<div id="dzThread"></div>' +
            '<div id="dzInputRow">' +
              '<textarea id="dzInput" rows="1" placeholder="e.g. white shaker cabinets, quartz counters, keep the window, brighter, modern farmhouse"></textarea>' +
              '<button class="btn primary" id="dzSend" type="button">Send</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card" id="dzPromptCard">' +
          '<div class="dz-lbl"><span>Render instruction <span style="font-weight:600;text-transform:none;letter-spacing:0">(editable — updates as you chat)</span></span>' +
            '<button class="btn" id="dzCopyPrompt" type="button" style="padding:0.15rem 0.5rem;font-size:0.72rem">Copy</button></div>' +
          '<textarea id="dzPrompt" placeholder="Your render instruction composes here once you add a photo and tell me what you want. You can also type it by hand."></textarea>' +
        '</div>' +
        '<div id="dzBar">' +
          '<button class="btn primary" id="dzGen" type="button">✨ Generate here</button>' +
          '<button class="btn" id="dzGemini" type="button" title="Copies the render instruction and opens Gemini — free with your Google AI Pro plan; attach the same photo there">🖼️ Open in Gemini (free)</button>' +
          '<span class="grow"></span>' +
          '<span class="note">Structure-preserving — same photoreal engine as the build-stage renders.</span>' +
        '</div>' +
        '<div id="dzResult"></div>' +
        '<div id="dzHistory"></div>' +
      '</div>';

    wirePhoto();
    wireChat();
    wirePrompt();
    wireActions();
    seedChat();
    loadProjects();
  }

  /* ============================ PHOTO IN ============================ */

  function wirePhoto() {
    var fileInput = document.getElementById("dzFile");
    var drop = document.getElementById("dzDrop");
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) usePhoto(fileInput.files[0]);
    });
    document.getElementById("dzReplaceBtn").addEventListener("click", function () {
      fileInput.value = ""; fileInput.click();
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("drag"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) usePhoto(f);
    });
    // Paste anywhere while the view is active; self-detaches once we leave.
    st._onPaste = function (e) {
      if (!document.getElementById("dz")) { document.removeEventListener("paste", st._onPaste); return; }
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image") === 0) {
          var f = items[i].getAsFile();
          if (f) { usePhoto(f); break; }
        }
      }
    };
    document.addEventListener("paste", st._onPaste);
  }

  function usePhoto(file) {
    if (st.photoUrl) { try { URL.revokeObjectURL(st.photoUrl); } catch (e) {} }
    st.photoFile = file;
    st.photoUrl = URL.createObjectURL(file);
    var host = document.getElementById("dzPhoto");
    var existing = host.querySelector("img.hero");
    if (existing) existing.remove();
    var drop = document.getElementById("dzDrop");
    if (drop) drop.style.display = "none";
    document.getElementById("dzReplace").style.display = "block";
    var img = document.createElement("img");
    img.className = "hero"; img.alt = "Room photo"; img.src = st.photoUrl;
    host.appendChild(img);
    APP.toast("Photo loaded — now tell me the look you want");
  }

  /* ============================ CHAT ============================ */

  function seedChat() {
    st.messages = [{
      role: "assistant",
      text: "Add a photo of the room, then tell me what you'd like — cabinets, colors, style, what to keep. Talk to me like you'd text a designer."
    }];
    renderThread();
  }

  function renderThread() {
    var thread = document.getElementById("dzThread");
    if (!thread) return;
    var html = st.messages.map(function (m) {
      var cls = m.role === "user" ? "user" : (m.role === "hint" ? "hint" : "bot");
      return '<div class="dz-msg ' + cls + '">' + APP.esc(m.text) + "</div>";
    }).join("");
    if (st.chatBusy) html += '<div class="dz-typing"><i></i><i></i><i></i></div>';
    thread.innerHTML = html;
    thread.scrollTop = thread.scrollHeight;
  }

  function wireChat() {
    var input = document.getElementById("dzInput");
    var send = document.getElementById("dzSend");
    function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }
    input.addEventListener("input", autosize);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    send.addEventListener("click", submit);
    function submit() {
      var text = input.value.trim();
      if (!text || st.chatBusy) return;
      input.value = ""; autosize();
      sendChat(text);
    }
  }

  function sendChat(text) {
    st.messages.push({ role: "user", text: text });
    st.chatBusy = true;
    renderThread();
    var payload = st.messages
      .filter(function (m) { return m.role === "user" || m.role === "assistant"; })
      .map(function (m) { return { role: m.role, text: m.text }; });
    APP.fetchJSON("/api/knowledge/design-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload, hasPhoto: !!st.photoFile })
    }).then(function (r) {
      st.chatBusy = false;
      st.messages.push({ role: "assistant", text: r.reply || "Updated your render below." });
      if (r.renderPrompt) setPrompt(r.renderPrompt);
      renderThread();
    }).catch(function () {
      // Endpoint down — compose the prompt client-side so the flow still works.
      st.chatBusy = false;
      setPrompt(composeFallbackPrompt());
      st.messages.push({ role: "assistant", text: "I composed your render instruction below from what you said — edit it or add another change." });
      renderThread();
    });
  }

  /* ============================ RENDER PROMPT ============================ */

  function setPrompt(text) {
    st.renderPrompt = text;
    var box = document.getElementById("dzPrompt");
    if (box) box.value = text;
  }
  function currentPrompt() {
    var box = document.getElementById("dzPrompt");
    return (box && box.value.trim()) || st.renderPrompt || composeFallbackPrompt();
  }

  function wirePrompt() {
    var box = document.getElementById("dzPrompt");
    box.addEventListener("input", function () { st.renderPrompt = box.value; });
    document.getElementById("dzCopyPrompt").addEventListener("click", function () {
      copyText(currentPrompt(), "Render instruction copied");
    });
  }

  function copyText(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { APP.toast(okMsg); })
        .catch(function () { window.prompt("Copy this:", text); });
    } else {
      window.prompt("Copy this:", text);
    }
  }

  /* ============================ ACTIONS ============================ */

  function wireActions() {
    document.getElementById("dzGen").addEventListener("click", generate);
    document.getElementById("dzGemini").addEventListener("click", function () {
      copyText(currentPrompt(), "Prompt copied — in Gemini: attach this same photo, paste, send");
      window.open("https://gemini.google.com/app", "_blank");
    });
  }

  function generate() {
    if (!st.photoFile) { APP.toast("Add a room photo first"); return; }
    var prompt = currentPrompt();
    var result = document.getElementById("dzResult");
    result.innerHTML =
      '<div class="card"><div class="muted" style="display:flex;align-items:center;gap:0.5rem">' +
        '<span class="dz-typing" style="padding:0.3rem 0.5rem"><i></i><i></i><i></i></span> Rendering your redesign… this can take 30–90 seconds.</div></div>';
    APP.fetchJSON("/api/knowledge/redesign?prompt=" + encodeURIComponent(prompt), {
      method: "POST",
      headers: { "Content-Type": st.photoFile.type || "image/jpeg" },
      body: st.photoFile
    }).then(function (r) {
      if (r.imageUrl) {
        st.genAfterUrl = r.imageUrl;
        result.innerHTML =
          '<div class="card">' +
            '<h2>Your redesign</h2>' +
            '<div class="dz-ba">' +
              '<figure><span class="lab">Before</span><img src="' + APP.esc(st.photoUrl) + '" alt="Before" /></figure>' +
              '<figure><span class="lab after">After</span><img src="' + APP.esc(r.imageUrl) + '" alt="After" /></figure>' +
            '</div>' +
            '<div class="muted" style="font-size:0.72rem;margin-top:0.5rem">Photoreal concept — structure preserved from your photo.</div>' +
          '</div>';
        renderSaveCard();
      } else if (r.quotaBlocked || r.configured === false) {
        result.innerHTML =
          '<div class="card">' +
            '<div class="dz-calm">In-app rendering activates if API billing is ever enabled — meanwhile Gemini renders this free:' +
              '<div style="margin-top:0.6rem"><button class="btn primary" id="dzCalmGem" type="button">🖼️ Open in Gemini (free)</button></div>' +
            '</div>' +
          '</div>';
        document.getElementById("dzCalmGem").addEventListener("click", function () {
          copyText(currentPrompt(), "Prompt copied — in Gemini: attach this same photo, paste, send");
          window.open("https://gemini.google.com/app", "_blank");
        });
        renderSaveCard();
      } else {
        result.innerHTML = '<div class="card"><div class="dz-calm">' + APP.esc(r.message || r.error || "Rendering is unavailable right now — use Open in Gemini (free) above.") + "</div></div>";
        renderSaveCard();
      }
    }).catch(function (e) {
      result.innerHTML = '<div class="card"><div class="dz-calm">Couldn\'t render here (' + APP.esc(e.message) + "). Use <b>Open in Gemini (free)</b> above — it renders the same prompt free.</div></div>";
      renderSaveCard();
    });
  }

  /* ============================ SAVE BEFORE/AFTER ============================ */

  function projectOptionsHtml() {
    var opts = ['<option value="design-studio"' + (st.projectId === "design-studio" ? " selected" : "") + ">Design Studio (default)</option>"];
    st.projects.forEach(function (p) {
      var sel = p.projectId === st.projectId ? " selected" : "";
      opts.push('<option value="' + APP.esc(p.projectId) + '"' + sel + ">" + APP.esc(p.projectName) + "</option>");
    });
    return opts.join("");
  }

  function pickProject(selectEl) {
    var opt = selectEl.selectedOptions[0];
    st.projectId = selectEl.value;
    st.projectName = opt ? opt.textContent.replace(" (default)", "") : "Design Studio";
  }

  function renderSaveCard() {
    var result = document.getElementById("dzResult");
    var haveGen = !!st.genAfterUrl;
    var card = document.createElement("div");
    card.className = "card";
    card.id = "dzSaveCard";
    card.style.marginTop = "0.9rem";
    card.innerHTML =
      '<h2>Save this before / after</h2>' +
      '<div class="dz-proj" style="margin-bottom:0.7rem">' +
        '<span class="muted" style="font-size:0.8rem">Project</span>' +
        '<select id="dzProj">' + projectOptionsHtml() + "</select>" +
      '</div>' +
      (haveGen
        ? '<div class="muted" style="font-size:0.82rem;margin-bottom:0.6rem">Using the render generated above as the "after".</div>'
        : '<label id="dzAttachZone" for="dzAttachFile">Attach the render — drop the image Gemini made, or tap to choose it.</label>' +
          '<input type="file" id="dzAttachFile" accept="image/*" style="display:none" />' +
          '<div id="dzAttachPrev" style="margin-top:0.6rem"></div>') +
      '<div style="margin-top:0.7rem"><button class="btn primary" id="dzSave" type="button">💾 Save to photo feed</button>' +
        '<span id="dzSaveMsg" class="muted" style="font-size:0.78rem;margin-left:0.5rem"></span></div>';
    result.appendChild(card);

    document.getElementById("dzProj").addEventListener("change", function (e) { pickProject(e.target); });
    if (!haveGen) wireAttach();
    document.getElementById("dzSave").addEventListener("click", savePair);
  }

  function wireAttach() {
    var zone = document.getElementById("dzAttachZone");
    var input = document.getElementById("dzAttachFile");
    input.addEventListener("change", function () {
      if (input.files && input.files[0]) setAttach(input.files[0]);
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("drag"); });
    });
    zone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) setAttach(f);
    });
  }

  function setAttach(file) {
    if (st.attachUrl) { try { URL.revokeObjectURL(st.attachUrl); } catch (e) {} }
    st.attachFile = file;
    st.attachUrl = URL.createObjectURL(file);
    var prev = document.getElementById("dzAttachPrev");
    if (prev) prev.innerHTML = '<img src="' + APP.esc(st.attachUrl) + '" alt="Render" style="max-width:220px;width:100%;border-radius:8px;display:block" />';
  }

  function uploadImage(file) {
    return APP.fetchJSON("/api/photofeed/upload?projectId=" + encodeURIComponent(st.projectId) + "&name=" + encodeURIComponent(st.projectName || "design"), {
      method: "POST",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file
    }).then(function (r) { return r.url; });
  }

  function savePair() {
    var msg = document.getElementById("dzSaveMsg");
    var saveBtn = document.getElementById("dzSave");
    if (!st.photoFile) { msg.textContent = "Add a room photo first."; return; }
    if (!st.genAfterUrl && !st.attachFile) { msg.textContent = "Attach the render first."; return; }
    saveBtn.disabled = true;
    msg.textContent = "Saving…";
    uploadImage(st.photoFile).then(function (beforeUrl) {
      if (st.genAfterUrl) return { beforeUrl: beforeUrl, afterUrl: st.genAfterUrl };
      return uploadImage(st.attachFile).then(function (afterUrl) { return { beforeUrl: beforeUrl, afterUrl: afterUrl }; });
    }).then(function (pair) {
      var caption = st.renderPrompt ? st.renderPrompt.split(".")[0].slice(0, 120) : "Redesign concept";
      return APP.fetchJSON("/api/photofeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: st.projectId,
          projectName: st.projectName,
          caption: caption,
          tags: ["design"],
          phase: "finish",
          beforeAfterPair: pair
        })
      });
    }).then(function () {
      msg.textContent = "Saved to " + (st.projectName || "Design Studio") + " ✓";
      saveBtn.disabled = false;
      loadHistory();
    }).catch(function (e) {
      msg.textContent = "Save failed: " + e.message;
      saveBtn.disabled = false;
    });
  }

  /* ============================ PROJECTS + HISTORY ============================ */

  function loadProjects() {
    APP.fetchJSON("/api/actuals").then(function (rows) {
      var seen = {};
      st.projects = (rows || []).map(function (r) {
        return { projectId: slugify(r.projectName), projectName: r.projectName };
      }).filter(function (p) {
        if (!p.projectName || !p.projectId || seen[p.projectId]) return false;
        seen[p.projectId] = 1; return true;
      });
    }).catch(function () { st.projects = []; }).then(function () {
      loadHistory();
    });
  }

  function loadHistory() {
    var host = document.getElementById("dzHistory");
    if (!host) return;
    host.innerHTML = '<div class="card"><h2>Recent redesigns</h2><div class="muted" style="font-size:0.8rem">Loading…</div></div>';
    APP.fetchJSON("/api/photofeed?projectId=" + encodeURIComponent(st.projectId)).then(function (rows) {
      var pairs = (rows || []).filter(function (e) {
        return e.beforeAfterPair && (e.tags || []).indexOf("design") >= 0;
      }).reverse();
      var picker =
        '<div class="dz-proj" style="margin-bottom:0.7rem"><span class="muted" style="font-size:0.8rem">Project</span>' +
        '<select id="dzHistProj">' + projectOptionsHtml() + "</select></div>";
      if (!pairs.length) {
        host.innerHTML = '<div class="card"><h2>Recent redesigns</h2>' + picker +
          '<div class="empty">No saved redesigns for this project yet. Generate one above and save the before / after.</div></div>';
      } else {
        host.innerHTML = '<div class="card"><h2>Recent redesigns</h2>' + picker +
          '<div class="dz-hstrip">' + pairs.map(historyCard).join("") + "</div></div>";
      }
      var sel = document.getElementById("dzHistProj");
      if (sel) sel.addEventListener("change", function (e) { pickProject(e.target); loadHistory(); });
      var strip = host.querySelector(".dz-hstrip");
      if (strip) strip.addEventListener("click", function (e) {
        var c = e.target.closest(".dz-hcard");
        if (c) openViewer(c.dataset.before, c.dataset.after, c.dataset.cap);
      });
    }).catch(function (e) {
      host.innerHTML = '<div class="card"><h2>Recent redesigns</h2><div class="empty">Couldn\'t load history: ' + APP.esc(e.message) + "</div></div>";
    });
  }

  function historyCard(entry) {
    var p = entry.beforeAfterPair || {};
    return '<div class="dz-hcard" data-before="' + APP.esc(p.beforeUrl) + '" data-after="' + APP.esc(p.afterUrl) + '" data-cap="' + APP.esc(entry.caption || "") + '">' +
      '<div class="pair">' +
        '<img src="' + APP.esc(p.beforeUrl) + '" alt="Before" loading="lazy" />' +
        '<img src="' + APP.esc(p.afterUrl) + '" alt="After" loading="lazy" />' +
      '</div>' +
      '<div class="cap">' + APP.esc(entry.caption || "Redesign") + "</div>" +
    '</div>';
  }

  function openViewer(before, after, cap) {
    APP.openDrawer(
      '<div style="padding:1.2rem" class="dz-viewer">' +
        '<h2 style="margin-bottom:0.8rem">' + APP.esc(cap || "Redesign") + "</h2>" +
        '<div style="font-size:0.7rem;font-weight:850;text-transform:uppercase;letter-spacing:0.07em;color:#687587;margin-bottom:0.3rem">Before</div>' +
        '<img src="' + APP.esc(before) + '" alt="Before" />' +
        '<div style="font-size:0.7rem;font-weight:850;text-transform:uppercase;letter-spacing:0.07em;color:#2563eb;margin-bottom:0.3rem">After</div>' +
        '<img src="' + APP.esc(after) + '" alt="After" />' +
        '<button class="btn" type="button" onclick="window.APP.closeDrawer()">Close</button>' +
      '</div>'
    );
  }

  APP.registerView("design", { title: "Design", render: render });
})();
