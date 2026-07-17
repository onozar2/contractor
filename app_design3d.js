/* Design view (#/design) — photo-in, chat-out, photorealistic redesign.
   Ori's brief: no 3D scene, no template feel. The customer's real room photo is
   the hero; Ori tells a chatbot in plain speech what he wants; the chat composes
   a structure-preserving render prompt (POST /api/knowledge/design-brief, haiku).

   decor.ai/InteriorAI-level input & output UX layered on top (all optional — the
   photo + free-text box stay first-class):
     • Style picker — one compact 🎨 pill that opens an overlay sheet (grouped
       grid of pure-CSS style cards from the shared library); picking a card
       posts "Style: X" through the normal chat flow so the brief updates.
     • Mode toggle — Redecorate (keep layout/walls/cabinets) vs Remodel (may
       reconfigure) — flips the preservation clause in the composed prompt.
     • Variations 1/2/4 — bridge prompt appends "Generate N variations…"; in-app
       loops N sequential /redesign calls into a variation grid.
     • Render backend in /redesign: Gemini image edit (billed key), parallel
       variations, quality Fast/Max ladder; free-bridge fallback if it errors.
     • Before/after comparison SLIDER (draggable) in the result + history viewer.
     • Failure-mode coaching hint under the result.

   "Generate here" runs /api/knowledge/redesign; "Open in Gemini (free)" hands the
   same prompt off. Finished before/after pairs save to the photo feed + history.
   Registers view #/design. Uses only the shell's APP helpers + CSS system. */
(function () {
  "use strict";

  // ── Style taxonomy. The live list comes from /api/knowledge/styles (the
  // design-styles.json library shared with the Q&A knowledge base); this
  // hardcoded set is only the fallback if that endpoint is unavailable.
  // Each entry carries a pure-CSS swatch (bg + pat), a category (→ picker group)
  // and a short vibe descriptor. Choosing one from the picker sheet posts
  // "Style: <name>" through the chat so the brief + renderPrompt pick it up.
  var STYLES = [
    { name: "Modern Farmhouse", bg: "linear-gradient(135deg,#f4efe6,#d8c3a5 58%,#3d3a34)", pat: "lines", cat: "classic", desc: "warm · casual · fresh" },
    { name: "Japandi", bg: "linear-gradient(135deg,#e8e2d6,#b9a88f 55%,#5a4d3f)", pat: "dots", cat: "organic", desc: "calm · warm · refined" },
    { name: "Coastal", bg: "linear-gradient(135deg,#eaf4f7,#9ec7d8 55%,#3a6ea5)", pat: "lines", cat: "classic", desc: "breezy · polished · fresh" },
    { name: "Mid-Century Modern", bg: "linear-gradient(135deg,#e5c07b,#c1440e 55%,#5b6e4f)", pat: "grid", cat: "modern", desc: "retro · clean · optimistic" },
    { name: "Spanish Revival", bg: "linear-gradient(135deg,#f0dcc0,#c8703c 55%,#7a2e1e)", pat: "grid", cat: "classic", desc: "warm · rustic · storied" },
    { name: "Contemporary Luxe", bg: "linear-gradient(135deg,#2b2b30,#6b6b73 55%,#c9a24b)", pat: "dots", cat: "luxe", desc: "sleek · dramatic · luxurious" },
    { name: "Scandinavian", bg: "linear-gradient(135deg,#ffffff,#eef1f4 55%,#b9c3cc)", pat: "lines", cat: "modern", desc: "bright · cozy · simple" },
    { name: "Industrial Loft", bg: "linear-gradient(135deg,#6f6f74,#3a3a3d 55%,#a86b3c)", pat: "grid", cat: "modern", desc: "raw · urban · masculine" },
    { name: "Bohemian", bg: "linear-gradient(135deg,#e8b04b,#c05640 50%,#6a8d73)", pat: "dots", cat: "eclectic", desc: "free-spirited · warm · collected" },
    { name: "Transitional", bg: "linear-gradient(135deg,#efeae2,#c9bfb2 55%,#7d7266)", pat: "lines", cat: "classic", desc: "balanced · timeless · comfortable" },
    { name: "Minimalist", bg: "linear-gradient(135deg,#fafafa,#e6e6e6 55%,#bcbcbc)", pat: "dots", cat: "modern", desc: "calm · clean · disciplined" },
    { name: "Mediterranean", bg: "linear-gradient(135deg,#f2e6cc,#4e97a8 55%,#2f6d6f)", pat: "grid", cat: "classic", desc: "sunny · relaxed · elegant" },
    { name: "Craftsman", bg: "linear-gradient(135deg,#c9a66b,#7a4a2b 55%,#3f2d1e)", pat: "lines", cat: "classic", desc: "handcrafted · warm · honest" },
    { name: "Desert Modern", bg: "linear-gradient(135deg,#f2ddc6,#d99a6c 55%,#9c5a3c)", pat: "dots", cat: "modern", desc: "sunny · retro · airy" },
    { name: "Organic Modern", bg: "linear-gradient(135deg,#efe9df,#c2b280 55%,#6f7a5a)", pat: "grid", cat: "organic", desc: "warm · serene · sculptural" },
    { name: "Traditional", bg: "linear-gradient(135deg,#efe3d3,#9c7a4f 55%,#4a3b2a)", pat: "lines", cat: "classic", desc: "formal · warm · gracious" }
  ];

  // Category (from the shared library) → one of four friendly picker groups,
  // in display order. The sheet renders only the groups that have styles.
  var STYLE_GROUPS = [
    { key: "modern",  label: "Modern & Minimal",      cats: ["modern"] },
    { key: "organic", label: "Warm & Organic",        cats: ["organic"] },
    { key: "classic", label: "Classic & Traditional", cats: ["classic"] },
    { key: "bold",    label: "Bold & Distinct",       cats: ["luxe", "eclectic"] }
  ];
  function styleGroupKey(cat) {
    cat = cat || "classic";
    for (var i = 0; i < STYLE_GROUPS.length; i++) {
      if (STYLE_GROUPS[i].cats.indexOf(cat) >= 0) return STYLE_GROUPS[i].key;
    }
    return "classic";
  }

  // ── View state (one flow at a time; reset on every render()) ──
  var st = null;
  function freshState() {
    return {
      photoFile: null,        // File the customer photographed / chose
      photoUrl: null,         // object URL for the hero preview
      messages: [],           // [{role:'user'|'assistant', text}]
      renderPrompt: "",       // latest composed instruction (chat source of truth)
      chatBusy: false,
      mode: "redecorate",     // "redecorate" | "remodel" — preservation clause
      styleSel: "",           // currently selected style chip name
      quality: "fast",        // "fast" (flash, ~8s) | "max" (pro model, ~15s)
      variations: 1,          // 1 | 2 | 4
      genAfterUrl: null,      // selected /uploads path when an API render succeeds
      variationUrls: [],      // all rendered variations (in-app path)
      attachFile: null,       // the Gemini render the user attaches back
      attachUrl: null,
      projectId: "design-studio",
      projectName: "Design Studio",
      projects: [],           // [{projectId, projectName}] for the picker
      _onPaste: null,
      _onSheetKey: null       // Esc handler while the style picker sheet is open
    };
  }

  function slugify(v) {
    return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  // Client-side fallback prompt (mode-aware) if the /design-brief endpoint is down.
  function preserveClause(mode) {
    return mode === "remodel"
      ? "REMODEL edit: keep the exact camera angle, room envelope and the window and door positions and perspective lines; you MAY reconfigure cabinetry, layout, built-ins and fixtures to suit the new design"
      : "STRUCTURE-PRESERVING edit: keep the exact camera angle and room envelope — the walls, windows, doors, ceiling and built-in cabinetry stay in their current positions and perspective lines; change only finishes, colors, furniture, decor, textiles and lighting fixtures";
  }
  var RENDER_TAIL = "Photorealistic, consistent shadows and lighting direction, magazine-quality interior photography, professionally staged, decluttered.";
  function composeFallbackPrompt() {
    var changes = st.messages.filter(function (m) { return m.role === "user"; })
      .map(function (m) { return m.text; }).filter(Boolean);
    var changeText = changes.length ? changes.join(", ") : "the requested finishes and styling";
    return "Redesign this space. " + preserveClause(st.mode) + ". Apply: " + changeText + ". " + RENDER_TAIL;
  }

  /* ============================ CSS ============================ */

  var CSS =
    "#dz{max-width:1120px;margin:0 auto;min-width:0;width:100%;box-sizing:border-box}" +  // #dz is a grid item of main#view; margin:0 auto disables stretch, so it must be sized to the track (width:100%) with min-width:0 to shrink on mobile — otherwise it takes its ~1120 max-content width and overflows at 375px

    // Compact style control — one subtle pill that opens the picker sheet
    "#dzStyleBar{margin:0.2rem 0 0.9rem}" +
    ".dz-pill{display:inline-flex;align-items:center;gap:0.5rem;max-width:100%;border:1px solid #d8dee8;background:#f5f7fa;border-radius:999px;padding:0.42rem 0.6rem 0.42rem 0.85rem;cursor:pointer;font:inherit;line-height:1.2}" +
    ".dz-pill:hover{border-color:#c2ccd8;background:#eef2f7}" +
    ".dz-pill .pl-ico{font-size:0.95rem;line-height:1}" +
    ".dz-pill .pl-k{font-weight:800;color:var(--muted);text-transform:uppercase;font-size:0.64rem;letter-spacing:0.05em}" +
    ".dz-pill .pl-v{font-weight:800;font-size:0.82rem;color:#8a93a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:15rem}" +
    ".dz-pill.set .pl-v{color:var(--blue)}" +
    ".dz-pill .pl-cta{color:var(--muted);font-weight:700;font-size:0.78rem}" +
    ".dz-pill .pl-x{border:0;background:#e6eaf0;color:#586074;width:20px;height:20px;border-radius:50%;font-size:0.72rem;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:0 0 auto}" +
    ".dz-pill .pl-x:hover{background:#d8dee8;color:#1d2634}" +
    // Picker sheet (fixed overlay + backdrop) — grouped grid of style cards
    "#dzSheet{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:1.1rem;background:rgba(16,24,40,0.38);backdrop-filter:blur(2px)}" +
    "#dzSheet .sheet{width:100%;max-width:640px;max-height:calc(100% - 2rem);overflow-y:auto;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 60px rgba(16,24,40,0.28);padding:1rem 1.1rem 1.2rem}" +
    ".sheet-head{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.7rem}" +
    ".sheet-head h3{margin:0;font-size:1rem;color:#1d2634}" +
    ".sheet-head .x{margin-left:auto;border:0;background:#f0f2f5;width:30px;height:30px;border-radius:8px;font-size:0.95rem;cursor:pointer;color:#586074}" +
    ".sheet-head .x:hover{background:#e2e7ee;color:#1d2634}" +
    ".sheet-suggest{display:flex;align-items:center;gap:0.4rem;width:100%;text-align:left;border:1px solid #cfe0fb;background:#f4f8ff;color:#2b4a7a;border-radius:10px;padding:0.6rem 0.75rem;font:inherit;font-size:0.84rem;font-weight:800;cursor:pointer;margin-bottom:0.9rem}" +
    ".sheet-suggest:hover{background:#eaf1fe}" +
    ".sheet-grp{font-size:0.66rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin:0.85rem 0 0.4rem}" +
    ".sheet-grp:first-of-type{margin-top:0}" +
    ".sheet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.5rem}" +
    ".sheet-card{display:flex;gap:0.55rem;align-items:center;text-align:left;border:1px solid #e2e7ee;background:#fff;border-radius:10px;padding:0.5rem 0.6rem;cursor:pointer;font:inherit}" +
    ".sheet-card:hover{border-color:var(--blue);box-shadow:0 2px 10px rgba(16,24,40,0.08)}" +
    ".sheet-card.sel{border-color:var(--blue);box-shadow:0 0 0 2px rgba(37,99,235,0.25)}" +
    ".sheet-card .tx{min-width:0}" +
    ".sheet-card .tx .nm{display:block;font-size:0.8rem;font-weight:800;color:#1d2634;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".sheet-card .tx .ds{display:block;font-size:0.7rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".sheet-card.sel .tx .nm{color:var(--blue)}" +
    // Pure-CSS style swatch (shared by the sheet cards)
    ".dz-swatch{position:relative;flex:0 0 auto;width:34px;height:34px;border-radius:8px;box-shadow:inset 0 0 0 1px rgba(16,24,40,0.08);overflow:hidden}" +
    ".dz-swatch::after{content:'';position:absolute;inset:0;opacity:0.5;pointer-events:none}" +
    ".dz-swatch.p-dots::after{background-image:radial-gradient(rgba(255,255,255,0.4) 1px,transparent 1.4px);background-size:7px 7px}" +
    ".dz-swatch.p-lines::after{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.22) 0 2px,transparent 2px 7px)}" +
    ".dz-swatch.p-grid::after{background-image:linear-gradient(rgba(255,255,255,0.2) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.2) 1px,transparent 1px);background-size:9px 9px}" +
    // Mode toggle + variations segmented controls
    ".dz-seg{display:inline-flex;border:1px solid #d8dee8;border-radius:9px;overflow:hidden;background:#f5f7fa}" +
    ".dz-seg button{border:0;background:transparent;padding:0.34rem 0.7rem;font:inherit;font-size:0.8rem;font-weight:700;color:#586074;cursor:pointer;min-height:34px}" +
    ".dz-seg button.on{background:var(--blue);color:#fff}" +
    ".dz-seg button+button{border-left:1px solid #d8dee8}" +
    ".dz-ctrls{display:flex;flex-wrap:wrap;gap:0.7rem 1.1rem;align-items:center;margin-bottom:0.7rem}" +
    ".dz-ctrl{display:flex;align-items:center;gap:0.45rem}" +
    ".dz-ctrl>span.k{font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)}" +
    ".dz-ctrl .hint{font-size:0.72rem;color:var(--muted)}" +
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
    ".dz-calm{background:#f4f8ff;border:1px solid #cfe0fb;border-radius:10px;padding:0.7rem 0.85rem;color:#2b4a7a;font-size:0.86rem;line-height:1.5}" +
    ".dz-coach{margin-top:0.5rem;font-size:0.74rem;color:var(--muted);line-height:1.45}" +
    ".dz-vgrid{display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem}" +
    ".dz-vthumb{position:relative;width:82px;height:60px;border-radius:8px;overflow:hidden;border:2px solid transparent;cursor:pointer;background:#f0f2f5;padding:0}" +
    ".dz-vthumb img{width:100%;height:100%;object-fit:cover;display:block}" +
    ".dz-vthumb.sel{border-color:var(--blue)}" +
    ".dz-vthumb .vt-badge{position:absolute;top:2px;left:2px;z-index:2;font-size:0.44rem;font-weight:800;line-height:1.15;color:#fff;background:rgba(17,24,39,0.85);padding:0.07rem 0.26rem;border-radius:4px;pointer-events:none}" +
    "#dzAttachZone{border:2px dashed #c7d0dc;border-radius:10px;padding:1.1rem;text-align:center;cursor:pointer;color:var(--muted);font-size:0.85rem;background:#f8fafc;display:block}" +
    "#dzAttachZone.drag{border-color:var(--blue);background:#eef4fe}" +
    // Before/after comparison slider
    ".dz-cmp{position:relative;width:100%;border-radius:10px;overflow:hidden;background:#0d1117;touch-action:none;user-select:none;-webkit-user-select:none;cursor:ew-resize}" +
    ".dz-cmp img{display:block;width:100%;height:auto;pointer-events:none}" +
    ".dz-cmp .cmp-top{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" +
    ".dz-cmp .cmp-lab{position:absolute;bottom:0.5rem;font-size:0.62rem;font-weight:850;text-transform:uppercase;letter-spacing:0.07em;color:#fff;background:rgba(16,24,40,0.72);padding:0.12rem 0.5rem;border-radius:999px;z-index:3;pointer-events:none}" +
    ".dz-cmp .cmp-lab.b{left:0.5rem}.dz-cmp .cmp-lab.a{right:0.5rem;background:var(--blue)}" +
    ".dz-cmp .cmp-ai-badge{position:absolute;top:0.5rem;left:0.5rem;z-index:4;max-width:70%;font-size:0.64rem;font-weight:800;line-height:1.28;color:#fff;background:rgba(17,24,39,0.85);padding:0.22rem 0.55rem;border-radius:8px;pointer-events:none;box-shadow:0 1px 4px rgba(16,24,40,0.4)}" +
    ".dz-cmp .cmp-handle{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,0.9);transform:translateX(-1px);z-index:2;pointer-events:none;box-shadow:0 0 0 1px rgba(16,24,40,0.25)}" +
    ".dz-cmp .cmp-grip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:#fff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:900;box-shadow:0 2px 8px rgba(16,24,40,0.35)}" +
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
    ".dz-viewer .dz-cmp{margin-bottom:0.7rem}" +
    "@media (max-width: 820px){#dzTop{grid-template-columns:1fr}#dzChat{order:2}#dzPhoto{order:1;min-height:0}#dzThread{max-height:44vh}}";

  /* ============================ RENDER ============================ */

  function render(container) {
    st = freshState();
    closeStyleSheet(); // drop any picker sheet left over from a prior view
    if (!document.getElementById("dzCss")) {
      var style = document.createElement("style");
      style.id = "dzCss"; style.textContent = CSS;
      document.head.appendChild(style);
    }

    container.innerHTML =
      '<div id="dz">' +
        '<div class="viewhead"><h1>🎨 Design <span class="muted" style="font-weight:700;font-size:0.85rem">— photograph the room, describe the look, get a photoreal redesign</span></h1></div>' +
        '<div id="dzStyleBar">' + stylePillHtml() + '</div>' +
        '<div class="dz-ctrls">' +
          '<div class="dz-ctrl"><span class="k">Mode</span>' +
            '<div class="dz-seg" id="dzMode">' +
              '<button type="button" data-mode="redecorate" class="on">Redecorate</button>' +
              '<button type="button" data-mode="remodel">Remodel</button>' +
            '</div>' +
            '<span class="hint" id="dzModeHint">keep layout, walls &amp; cabinets — restyle only</span>' +
          '</div>' +
          '<div class="dz-ctrl"><span class="k">Variations</span>' +
            '<div class="dz-seg" id="dzVary">' +
              '<button type="button" data-n="1" class="on">1</button>' +
              '<button type="button" data-n="2">2</button>' +
              '<button type="button" data-n="4">4</button>' +
            '</div>' +
          '</div>' +
          '<div class="dz-ctrl"><span class="k">Quality</span>' +
            '<div class="dz-seg" id="dzQual">' +
              '<button type="button" data-q="fast" class="on">Fast ~8s</button>' +
              '<button type="button" data-q="max">Max ~15s</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
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

    wireStyles();
    wireControls();
    wirePhoto();
    wireChat();
    wirePrompt();
    wireActions();
    seedChat();
    loadProjects();
    loadStyleLibrary();
  }

  /* ============================ STYLE PICKER ============================ */

  // The one compact control that replaces the old 16-chip strip: 🎨 Style: <sel
  // or "not set">. The whole pill opens the picker sheet; when a style is set it
  // also shows a ✕ that clears the selection (and, if the composed render
  // instruction still names that style, recomposes the brief without it).
  function stylePillHtml() {
    if (st.styleSel) {
      return '<button type="button" class="dz-pill set" id="dzStyleOpen" title="Change or clear style">' +
          '<span class="pl-ico">🎨</span>' +
          '<span class="pl-k">Style</span>' +
          '<span class="pl-v">' + APP.esc(st.styleSel) + '</span>' +
          '<span class="pl-x" id="dzStyleClear" role="button" aria-label="Clear style" title="Clear style">✕</span>' +
        '</button>';
    }
    return '<button type="button" class="dz-pill" id="dzStyleOpen" title="Choose a style">' +
        '<span class="pl-ico">🎨</span>' +
        '<span class="pl-k">Style</span>' +
        '<span class="pl-v">not set</span>' +
        '<span class="pl-cta">Choose ▾</span>' +
      '</button>';
  }

  function renderStyleBar() {
    var bar = document.getElementById("dzStyleBar");
    if (bar) bar.innerHTML = stylePillHtml();
  }

  function wireStyles() {
    var bar = document.getElementById("dzStyleBar");
    bar.addEventListener("click", function (e) {
      if (e.target.closest(".pl-x")) {   // clear selection
        var cleared = st.styleSel;
        st.styleSel = "";
        renderStyleBar();
        // Selection composed the style into the render instruction by posting a
        // "Style: <name>" user turn; do the inverse — if the instruction still
        // names the cleared style, drop that turn and silently recompose.
        var box = document.getElementById("dzPrompt");
        var cur = (box && box.value) || st.renderPrompt || "";
        if (cleared && cur.toLowerCase().indexOf(cleared.toLowerCase()) >= 0) {
          st.messages = st.messages.filter(function (m) {
            return !(m.role === "user" && m.text === "Style: " + cleared);
          });
          refreshBrief("Cleared " + cleared + " — updated the render instruction below.");
        }
        return;
      }
      if (e.target.closest("#dzStyleOpen")) openStyleSheet();
    });
  }

  function styleCardHtml(s) {
    return '<button type="button" class="sheet-card' + (s.name === st.styleSel ? " sel" : "") + '" data-style="' + APP.esc(s.name) + '">' +
      '<span class="dz-swatch p-' + (s.pat || "dots") + '" style="background:' + (s.bg || "linear-gradient(135deg,#eee,#bbb)") + '"></span>' +
      '<span class="tx"><span class="nm">' + APP.esc(s.name) + '</span>' +
        '<span class="ds">' + APP.esc(s.desc || "") + '</span></span>' +
    '</button>';
  }

  // Opens the overlay sheet: the whole style library as a tidy grouped grid, plus
  // a "Suggest styles for me" row that asks the (text-only) brief chat for 3
  // library picks based on what's been described — it can't see the photo.
  function openStyleSheet() {
    closeStyleSheet();
    var buckets = {};
    STYLES.forEach(function (s) {
      var g = styleGroupKey(s.cat);
      (buckets[g] = buckets[g] || []).push(s);
    });
    var body = "";
    STYLE_GROUPS.forEach(function (grp) {
      var items = buckets[grp.key];
      if (!items || !items.length) return;
      body += '<div class="sheet-grp">' + APP.esc(grp.label) + '</div>' +
        '<div class="sheet-grid">' + items.map(styleCardHtml).join("") + '</div>';
    });
    var suggest = '<button type="button" class="sheet-suggest" id="dzSuggest">✨ Suggest styles for me' +
          ' <span class="muted" style="font-weight:600">— 3 picks from what you\'ve described</span></button>';
    var sheet = document.createElement("div");
    sheet.id = "dzSheet";
    sheet.innerHTML =
      '<div class="sheet" role="dialog" aria-label="Choose a style" aria-modal="true">' +
        '<div class="sheet-head"><h3>🎨 Choose a style</h3>' +
          '<button type="button" class="x" id="dzSheetX" aria-label="Close">✕</button></div>' +
        suggest + body +
      '</div>';
    document.body.appendChild(sheet);

    sheet.addEventListener("click", function (e) {
      if (e.target === sheet || e.target.closest("#dzSheetX")) { closeStyleSheet(); return; }
      if (e.target.closest("#dzSuggest")) {
        closeStyleSheet();
        sendChat("Based on what I've told you about this space, suggest 3 styles from the library that would suit it - one line each.");
        return;
      }
      var card = e.target.closest(".sheet-card");
      if (!card) return;
      st.styleSel = card.getAttribute("data-style");
      renderStyleBar();
      closeStyleSheet();
      sendChat("Style: " + st.styleSel);
    });
    st._onSheetKey = function (ev) { if (ev.key === "Escape") closeStyleSheet(); };
    document.addEventListener("keydown", st._onSheetKey);
  }

  function closeStyleSheet() {
    var s = document.getElementById("dzSheet");
    if (s && s.parentNode) s.parentNode.removeChild(s);
    if (st && st._onSheetKey) { document.removeEventListener("keydown", st._onSheetKey); st._onSheetKey = null; }
  }

  /* ============================ MODE + VARIATIONS ============================ */

  function wireControls() {
    var modeSeg = document.getElementById("dzMode");
    var modeHint = document.getElementById("dzModeHint");
    modeSeg.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-mode]");
      if (!b) return;
      var m = b.getAttribute("data-mode");
      if (m === st.mode) return;
      st.mode = m;
      Array.prototype.forEach.call(modeSeg.querySelectorAll("button"), function (x) {
        x.classList.toggle("on", x === b);
      });
      modeHint.textContent = m === "remodel"
        ? "may reconfigure cabinets, layout & built-ins — camera & openings held"
        : "keep layout, walls & cabinets — restyle only";
      // Re-compose the render prompt under the new preservation clause if the
      // customer has already said something (so the mode flip is visible now).
      if (st.messages.some(function (mm) { return mm.role === "user"; })) {
        refreshBrief("Switched to " + (m === "remodel" ? "Remodel" : "Redecorate") + " — updated the render instruction below.");
      }
    });

    var varySeg = document.getElementById("dzVary");
    varySeg.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-n]");
      if (!b) return;
      st.variations = parseInt(b.getAttribute("data-n"), 10) || 1;
      Array.prototype.forEach.call(varySeg.querySelectorAll("button"), function (x) {
        x.classList.toggle("on", x === b);
      });
    });

    var qualSeg = document.getElementById("dzQual");
    qualSeg.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-q]");
      if (!b) return;
      st.quality = b.getAttribute("data-q") === "max" ? "max" : "fast";
      Array.prototype.forEach.call(qualSeg.querySelectorAll("button"), function (x) {
        x.classList.toggle("on", x === b);
      });
    });
  }

  // Live style taxonomy from the shared design-styles library; falls back to the
  // built-in STYLES if the endpoint is missing. Just refreshes the STYLES array
  // (name + swatch + group category + one-line vibe); the picker sheet is built
  // from it on open, so there's no live DOM to rebuild here.
  function loadStyleLibrary() {
    APP.fetchJSON("/api/knowledge/styles").then(function (lib) {
      var styles = (lib && lib.styles) || [];
      if (!styles.length) return;
      STYLES = styles.map(function (s) {
        return {
          name: s.name,
          bg: (s.chip && s.chip.bg) || "linear-gradient(135deg,#eee,#bbb)",
          pat: (s.chip && s.chip.pat) || "dots",
          cat: s.category || "classic",
          desc: (Array.isArray(s.mood) && s.mood.length) ? s.mood.join(" · ") : ""
        };
      });
    }).catch(function () { /* fallback list already usable */ });
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
      text: "Add a photo of the room, then tell me what you'd like — cabinets, colors, style, what to keep. Pick a look from the 🎨 Style menu above, or just talk to me like you'd text a designer."
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

  // Post current thread to /design-brief with the active mode. If pushText is
  // given it's added as a new user turn first (chip taps + typed messages).
  function sendChat(pushText) {
    if (st.chatBusy) return;
    if (pushText) st.messages.push({ role: "user", text: pushText });
    st.chatBusy = true;
    renderThread();
    postBrief().then(function (r) {
      st.chatBusy = false;
      st.messages.push({ role: "assistant", text: r.reply || "Updated your render below." });
      if (r.renderPrompt) setPrompt(r.renderPrompt);
      renderThread();
    }).catch(function () {
      st.chatBusy = false;
      setPrompt(composeFallbackPrompt());
      st.messages.push({ role: "assistant", text: "I composed your render instruction below from what you said — edit it or add another change." });
      renderThread();
    });
  }

  // Silent re-compose (no new user turn) — used when the mode toggle flips.
  function refreshBrief(noteText) {
    if (st.chatBusy) return;
    st.chatBusy = true;
    renderThread();
    postBrief().then(function (r) {
      st.chatBusy = false;
      if (r.renderPrompt) setPrompt(r.renderPrompt);
      if (noteText) st.messages.push({ role: "hint", text: noteText });
      renderThread();
    }).catch(function () {
      st.chatBusy = false;
      setPrompt(composeFallbackPrompt());
      if (noteText) st.messages.push({ role: "hint", text: noteText });
      renderThread();
    });
  }

  function postBrief() {
    var payload = st.messages
      .filter(function (m) { return m.role === "user" || m.role === "assistant"; })
      .map(function (m) { return { role: m.role, text: m.text }; });
    return APP.fetchJSON("/api/knowledge/design-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload, mode: st.mode, hasPhoto: !!st.photoFile })
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
  // Prompt handed to the Gemini bridge — appends a variations directive when >1.
  function bridgePrompt() {
    var p = currentPrompt();
    if (st.variations > 1) p += " Generate " + st.variations + " distinct variations of this redesign in one response.";
    return p;
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
    document.getElementById("dzGemini").addEventListener("click", openGemini);
  }

  function openGemini() {
    copyText(bridgePrompt(), "Prompt copied — in Gemini: attach this same photo, paste, send");
    window.open("https://gemini.google.com/app", "_blank");
  }

  function generate() {
    if (!st.photoFile) { APP.toast("Add a room photo first"); return; }
    var prompt = currentPrompt();
    var want = st.variations;
    var result = document.getElementById("dzResult");
    st.variationUrls = [];
    st.genAfterUrl = null;
    result.innerHTML =
      '<div class="card"><div class="muted" style="display:flex;align-items:center;gap:0.5rem">' +
        '<span class="dz-typing" style="padding:0.3rem 0.5rem"><i></i><i></i><i></i></span> Rendering your redesign' +
        (want > 1 ? " (" + want + " variations, in parallel)" : "") +
        "… usually " + (st.quality === "max" ? "15–25" : "8–15") + " seconds.</div></div>";

    // ONE call — the server renders all variations in parallel on Gemini and
    // returns them together, so 4 variations cost one render's wall-clock.
    APP.fetchJSON("/api/knowledge/redesign?prompt=" + encodeURIComponent(prompt) +
        "&n=" + want + "&quality=" + encodeURIComponent(st.quality), {
      method: "POST",
      headers: { "Content-Type": st.photoFile.type || "image/jpeg" },
      body: st.photoFile
    }).then(function (r) {
      if (r && r.imageUrl) {
        var imgs = (r.images && r.images.length) ? r.images : [r.imageUrl];
        st.variationUrls = imgs;
        st.genAfterUrl = imgs[0];
        renderResult(r.backend);
      } else {
        renderBridge(r || {});
      }
    }).catch(function (e) {
      result.innerHTML = '<div class="card"><div class="dz-calm">Couldn\'t render here (' + APP.esc(e.message) + "). Use <b>Open in Gemini (free)</b> above — it renders the same prompt free.</div></div>";
      renderSaveCard();
    });
  }

  // Successful in-app render: draggable before/after slider + variation thumbs +
  // the failure-mode coaching hint + save card.
  function renderResult(backend) {
    var result = document.getElementById("dzResult");
    var badge = backend === "gemini" ? "Gemini" : "";
    var aiBadge = aiBadgeText(st.mode);
    var thumbs = "";
    if (st.variationUrls.length > 1) {
      thumbs = '<div class="dz-vgrid">' + st.variationUrls.map(function (u, i) {
        return '<button type="button" class="dz-vthumb' + (i === 0 ? " sel" : "") + '" data-u="' + APP.esc(u) + '">' +
          '<span class="vt-badge">' + APP.esc(aiBadge) + '</span>' +
          '<img src="' + APP.esc(u) + '" alt="Variation ' + (i + 1) + '" /></button>';
      }).join("") + '</div>';
    }
    result.innerHTML =
      '<div class="card">' +
        '<h2>Your redesign' + (badge ? ' <span class="muted" style="font-weight:600;font-size:0.7rem">via ' + badge + '</span>' : "") + '</h2>' +
        '<div id="dzCmpHost">' + cmpHtml(st.photoUrl, st.genAfterUrl, aiBadge) + '</div>' +
        thumbs +
        '<div class="dz-coach">Check: window positions, door placement, furniture scale — regenerate if anything moved. Images are AI concept visualizations — always present them as concepts, not photos.</div>' +
      '</div>';
    wireCmp(document.getElementById("dzCmpHost"));
    var grid = result.querySelector(".dz-vgrid");
    if (grid) grid.addEventListener("click", function (e) {
      var t = e.target.closest(".dz-vthumb");
      if (!t) return;
      st.genAfterUrl = t.getAttribute("data-u");
      Array.prototype.forEach.call(grid.querySelectorAll(".dz-vthumb"), function (x) { x.classList.toggle("sel", x === t); });
      var host = document.getElementById("dzCmpHost");
      host.innerHTML = cmpHtml(st.photoUrl, st.genAfterUrl, aiBadge);
      wireCmp(host);
    });
    renderSaveCard();
  }

  function renderBridge(r) {
    var result = document.getElementById("dzResult");
    var msg = r && (r.message || r.error);
    result.innerHTML =
      '<div class="card">' +
        '<div class="dz-calm">In-app rendering couldn\'t complete — meanwhile the Gemini app renders this same prompt free:' +
          (msg ? '<div class="muted" style="font-size:0.72rem;margin-top:0.35rem">' + APP.esc(msg) + '</div>' : "") +
          '<div style="margin-top:0.6rem"><button class="btn primary" id="dzCalmGem" type="button">🖼️ Open in Gemini (free)</button></div>' +
        '</div>' +
      '</div>';
    document.getElementById("dzCalmGem").addEventListener("click", openGemini);
    renderSaveCard();
  }

  /* ============================ BEFORE / AFTER SLIDER ============================ */

  // Base layer = BEFORE (defines the box height). Top layer = AFTER, clipped from
  // the left by the handle position, so the left of the handle shows before, the
  // right shows after. Pointer-driven; touch-friendly (touch-action:none).
  function cmpHtml(beforeUrl, afterUrl, badgeText) {
    return '<div class="dz-cmp" data-pos="50">' +
      '<img class="cmp-base" src="' + APP.esc(beforeUrl) + '" alt="Before" />' +
      '<img class="cmp-top" src="' + APP.esc(afterUrl) + '" alt="After" style="clip-path:inset(0 0 0 50%)" />' +
      '<span class="cmp-lab b">Before</span><span class="cmp-lab a">After</span>' +
      '<span class="cmp-ai-badge">' + APP.esc(badgeText || aiBadgeText("redecorate")) + '</span>' +
      '<div class="cmp-handle" style="left:50%"><span class="cmp-grip">⟺</span></div>' +
    '</div>';
  }

  // Legal/trust rule: never let an AI render read as a photograph. Redecorate
  // renders keep the room's real layout so a plain "AI concept" badge is honest;
  // Remodel may reconfigure the room, so the badge must say layout can vary.
  function aiBadgeText(mode) {
    return mode === "remodel" ? "Design concept — layout may vary" : "AI concept";
  }

  function wireCmp(host) {
    if (!host) return;
    var cmp = host.querySelector ? (host.classList && host.classList.contains("dz-cmp") ? host : host.querySelector(".dz-cmp")) : null;
    if (!cmp) return;
    var top = cmp.querySelector(".cmp-top");
    var handle = cmp.querySelector(".cmp-handle");
    var dragging = false;
    function setPos(clientX) {
      var rect = cmp.getBoundingClientRect();
      if (!rect.width) return;
      var pos = ((clientX - rect.left) / rect.width) * 100;
      pos = Math.max(2, Math.min(98, pos));
      cmp.setAttribute("data-pos", String(Math.round(pos)));
      top.style.clipPath = "inset(0 0 0 " + pos + "%)";
      handle.style.left = pos + "%";
    }
    cmp.addEventListener("pointerdown", function (e) {
      dragging = true;
      try { cmp.setPointerCapture(e.pointerId); } catch (_e) {}
      setPos(e.clientX);
    });
    cmp.addEventListener("pointermove", function (e) { if (dragging) setPos(e.clientX); });
    cmp.addEventListener("pointerup", function () { dragging = false; });
    cmp.addEventListener("pointercancel", function () { dragging = false; });
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

  // Mode label baked into the caption bar's right side (distinct from the
  // on-screen badge text — this one names the mode, not the "layout may vary" warning).
  function modeCaptionLabel(mode) {
    return mode === "remodel" ? "Remodel concept" : "Redecorate concept";
  }

  function loadImageEl(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Couldn't load the render to caption it")); };
      img.src = src;
    });
  }

  // Legal/trust requirement: a CSLB-licensed contractor must never present an AI
  // render as a photograph. Bakes a slim semi-transparent charcoal bar onto the
  // bottom edge of the AFTER image — "AI concept visualization — JOON Design
  // Studio" (left) + the mode label (right). Also conveniently covers Gemini's
  // bottom-right sparkle watermark in most cases. Exported as JPEG q0.9. The
  // BEFORE image is never touched.
  function compositeAiCaption(src, mode) {
    return loadImageEl(src).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      var barH = Math.max(Math.round(h * 0.045), 24);
      var barY = h - barH;
      ctx.fillStyle = "rgba(24,26,30,0.82)";
      ctx.fillRect(0, barY, w, barH);

      var fontSize = Math.max(11, Math.round(w * 0.016));
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 " + fontSize + "px Arial, Helvetica, sans-serif";
      ctx.textBaseline = "middle";
      var midY = barY + barH / 2;
      ctx.textAlign = "left";
      ctx.fillText("AI concept visualization — JOON Design Studio", w * 0.02, midY);
      ctx.textAlign = "right";
      ctx.fillText(modeCaptionLabel(mode), w * 0.98, midY);

      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error("Couldn't export the captioned image"));
        }, "image/jpeg", 0.9);
      });
    });
  }

  function savePair() {
    var msg = document.getElementById("dzSaveMsg");
    var saveBtn = document.getElementById("dzSave");
    if (!st.photoFile) { msg.textContent = "Add a room photo first."; return; }
    if (!st.genAfterUrl && !st.attachFile) { msg.textContent = "Attach the render first."; return; }
    saveBtn.disabled = true;
    msg.textContent = "Saving…";
    var afterSrc = st.genAfterUrl || st.attachUrl;
    Promise.all([
      uploadImage(st.photoFile),
      compositeAiCaption(afterSrc, st.mode).then(function (blob) { return uploadImage(blob); })
    ]).then(function (urls) {
      return { beforeUrl: urls[0], afterUrl: urls[1] };
    }).then(function (pair) {
      var caption = st.renderPrompt ? st.renderPrompt.split(".")[0].slice(0, 120) : "Redesign concept";
      return APP.fetchJSON("/api/photofeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: st.projectId,
          projectName: st.projectName,
          caption: caption,
          tags: ["design", st.mode],
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
        if (c) openViewer(c.dataset.before, c.dataset.after, c.dataset.cap, c.dataset.mode);
      });
    }).catch(function (e) {
      host.innerHTML = '<div class="card"><h2>Recent redesigns</h2><div class="empty">Couldn\'t load history: ' + APP.esc(e.message) + "</div></div>";
    });
  }

  function historyCard(entry) {
    var p = entry.beforeAfterPair || {};
    var tags = entry.tags || [];
    var mode = tags.indexOf("remodel") >= 0 ? "remodel" : "redecorate";
    return '<div class="dz-hcard" data-before="' + APP.esc(p.beforeUrl) + '" data-after="' + APP.esc(p.afterUrl) + '" data-cap="' + APP.esc(entry.caption || "") + '" data-mode="' + mode + '">' +
      '<div class="pair">' +
        '<img src="' + APP.esc(p.beforeUrl) + '" alt="Before" loading="lazy" />' +
        '<img src="' + APP.esc(p.afterUrl) + '" alt="After" loading="lazy" />' +
      '</div>' +
      '<div class="cap">' + APP.esc(entry.caption || "Redesign") + "</div>" +
    '</div>';
  }

  function openViewer(before, after, cap, mode) {
    APP.openDrawer(
      '<div style="padding:1.2rem" class="dz-viewer">' +
        '<h2 style="margin-bottom:0.8rem">' + APP.esc(cap || "Redesign") + "</h2>" +
        '<div id="dzViewCmp">' + cmpHtml(before, after, aiBadgeText(mode)) + '</div>' +
        '<div class="dz-coach" style="margin-bottom:0.7rem">Drag the handle to compare. Check window positions, door placement and furniture scale. Images are AI concept visualizations — always present them as concepts, not photos.</div>' +
        '<button class="btn" type="button" onclick="window.APP.closeDrawer()">Close</button>' +
      '</div>'
    );
    // The drawer HTML is injected synchronously; wire the slider on the next tick.
    setTimeout(function () { wireCmp(document.getElementById("dzViewCmp")); }, 0);
  }

  APP.registerView("design", { title: "Design", render: render });
})();
